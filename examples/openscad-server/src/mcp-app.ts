/**
 * OpenSCAD Viewer MCP App
 *
 * Renders OpenSCAD code as interactive 3D models:
 * 1. Fetches OpenSCAD WASM ZIP from files.openscad.org
 * 2. Runs OpenSCAD in an inline Web Worker
 * 3. Displays GLB output via <model-viewer> web component
 */
import {
  App,
  type McpUiHostContext,
  applyDocumentTheme,
  applyHostStyleVariables,
} from "@modelcontextprotocol/ext-apps";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import "./global.css";
import "./mcp-app.css";

const WASM_ZIP_URL =
  "https://files.openscad.org/playground/OpenSCAD-2025.03.25.wasm24456-WebAssembly-web.zip";
const MODEL_VIEWER_URL =
  "https://ajax.googleapis.com/ajax/libs/model-viewer/4.0.0/model-viewer.min.js";

const log = {
  info: console.log.bind(console, "[OPENSCAD]"),
  error: console.error.bind(console, "[OPENSCAD]"),
};

// DOM Elements
const mainEl = document.querySelector(".main") as HTMLElement;
const loadingEl = document.getElementById("loading")!;
const loadingTextEl = document.getElementById("loading-text")!;
const errorEl = document.getElementById("error")!;
const errorMessageEl = document.getElementById("error-message")!;
const viewerEl = document.getElementById("viewer")!;
const modelContainerEl = document.getElementById("model-container")!;
const modelViewerEl = document.getElementById("model-viewer") as HTMLElement;
const outputContentEl = document.getElementById("output-content")!;
const outputPanelEl = document.getElementById("output-panel")!;
const outputToggleBtn = document.getElementById(
  "output-toggle",
) as HTMLButtonElement;
const sourceCodeEl = document.getElementById("source-code")!;

// State
let wasmReady = false;
let openscadJsBlobUrl: string | null = null;
let openscadWasmBlobUrl: string | null = null;

// Create app instance
const app = new App(
  { name: "OpenSCAD Viewer", version: "1.0.0" },
  {},
  { autoResize: false },
);

// =============================================================================
// UI State
// =============================================================================

function showLoading(text: string) {
  loadingTextEl.textContent = text;
  loadingEl.style.display = "flex";
  errorEl.style.display = "none";
  viewerEl.style.display = "none";
}

function showError(message: string) {
  errorMessageEl.textContent = message;
  loadingEl.style.display = "none";
  errorEl.style.display = "block";
  viewerEl.style.display = "none";
}

function showViewer() {
  loadingEl.style.display = "none";
  errorEl.style.display = "none";
  viewerEl.style.display = "flex";
  // Request a reasonable default height
  app.sendSizeChanged({ height: 600 });
}

// =============================================================================
// ZIP Extraction (using browser DecompressionStream)
// =============================================================================

interface ZipEntry {
  filename: string;
  compressedData: Uint8Array;
  compressionMethod: number;
  uncompressedSize: number;
}

function parseZipEntries(buffer: ArrayBuffer): ZipEntry[] {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const entries: ZipEntry[] = [];

  // Find End of Central Directory record (scan from end)
  let eocdOffset = -1;
  for (let i = bytes.length - 22; i >= 0; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset === -1) throw new Error("Not a valid ZIP file");

  const cdOffset = view.getUint32(eocdOffset + 16, true);
  const cdEntries = view.getUint16(eocdOffset + 10, true);

  let offset = cdOffset;
  for (let i = 0; i < cdEntries; i++) {
    if (view.getUint32(offset, true) !== 0x02014b50) break;

    const compressionMethod = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const uncompressedSize = view.getUint32(offset + 24, true);
    const filenameLen = view.getUint16(offset + 28, true);
    const extraLen = view.getUint16(offset + 30, true);
    const commentLen = view.getUint16(offset + 32, true);
    const localHeaderOffset = view.getUint32(offset + 42, true);

    const filename = new TextDecoder().decode(
      bytes.subarray(offset + 46, offset + 46 + filenameLen),
    );

    // Read from local file header to get actual data offset
    const localFilenameLen = view.getUint16(localHeaderOffset + 26, true);
    const localExtraLen = view.getUint16(localHeaderOffset + 28, true);
    const dataOffset =
      localHeaderOffset + 30 + localFilenameLen + localExtraLen;

    const compressedData = bytes.slice(dataOffset, dataOffset + compressedSize);

    entries.push({
      filename,
      compressedData,
      compressionMethod,
      uncompressedSize,
    });

    offset += 46 + filenameLen + extraLen + commentLen;
  }

  return entries;
}

async function decompressEntry(entry: ZipEntry): Promise<Uint8Array> {
  if (entry.compressionMethod === 0) {
    // Stored (no compression)
    return entry.compressedData;
  }
  if (entry.compressionMethod === 8) {
    // Deflate
    const ds = new DecompressionStream("deflate-raw");
    const writer = ds.writable.getWriter();
    const reader = ds.readable.getReader();

    const chunks: Uint8Array[] = [];
    let totalSize = 0;

    writer.write(entry.compressedData as unknown as BufferSource);
    writer.close();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      totalSize += value.length;
    }

    const result = new Uint8Array(totalSize);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    return result;
  }
  throw new Error(`Unsupported compression method: ${entry.compressionMethod}`);
}

// =============================================================================
// WASM Loading
// =============================================================================

async function loadWasm(): Promise<void> {
  if (wasmReady) return;

  showLoading("Downloading OpenSCAD WASM (9 MB)...");
  log.info("Fetching WASM ZIP from", WASM_ZIP_URL);

  const response = await fetch(WASM_ZIP_URL);
  if (!response.ok)
    throw new Error(`Failed to fetch WASM ZIP: ${response.status}`);

  const buffer = await response.arrayBuffer();
  log.info(
    `ZIP downloaded: ${(buffer.byteLength / 1024 / 1024).toFixed(1)} MB`,
  );

  showLoading("Extracting WASM files...");

  const entries = parseZipEntries(buffer);
  log.info(
    "ZIP entries:",
    entries.map((e) => e.filename),
  );

  // Find openscad.js and openscad.wasm (they may be in a subdirectory)
  const jsEntry = entries.find((e) => e.filename.endsWith("openscad.js"));
  const wasmEntry = entries.find((e) => e.filename.endsWith("openscad.wasm"));

  if (!jsEntry) throw new Error("openscad.js not found in ZIP");
  if (!wasmEntry) throw new Error("openscad.wasm not found in ZIP");

  const jsData = await decompressEntry(jsEntry);
  const wasmData = await decompressEntry(wasmEntry);

  log.info(
    `Extracted: openscad.js (${(jsData.length / 1024).toFixed(0)} KB), openscad.wasm (${(wasmData.length / 1024 / 1024).toFixed(1)} MB)`,
  );

  openscadJsBlobUrl = URL.createObjectURL(
    new Blob([jsData as BlobPart], { type: "application/javascript" }),
  );
  openscadWasmBlobUrl = URL.createObjectURL(
    new Blob([wasmData as BlobPart], { type: "application/wasm" }),
  );

  wasmReady = true;
}

// =============================================================================
// Web Worker (inline)
// =============================================================================

function createWorkerCode(): string {
  return `
    let openscadJsUrl = null;
    let openscadWasmUrl = null;

    self.addEventListener('message', async (e) => {
      const { type } = e.data;

      if (type === 'init') {
        openscadJsUrl = e.data.openscadJsUrl;
        openscadWasmUrl = e.data.openscadWasmUrl;
        self.postMessage({ type: 'ready' });
        return;
      }

      if (type === 'render') {
        const { code, features } = e.data;
        try {
          // Load the Emscripten module
          importScripts(openscadJsUrl);

          const instance = await self.OpenSCAD({
            noInitialRun: true,
            locateFile: (path) => {
              if (path.endsWith('.wasm')) return openscadWasmUrl;
              return path;
            },
            print: (text) => {
              self.postMessage({ type: 'stdout', text });
            },
            printErr: (text) => {
              self.postMessage({ type: 'stderr', text });
            },
          });

          // Write input file
          instance.FS.writeFile('/input.scad', code);

          // Build args
          const args = ['/input.scad', '-o', '/output.glb'];
          for (const feature of (features || [])) {
            args.push('--enable=' + feature);
          }

          // Run OpenSCAD
          const exitCode = instance.callMain(args);

          if (exitCode !== 0) {
            self.postMessage({ type: 'error', error: 'OpenSCAD exited with code ' + exitCode });
            return;
          }

          // Read output
          let outputData;
          try {
            outputData = instance.FS.readFile('/output.glb');
          } catch (e) {
            self.postMessage({ type: 'error', error: 'No output file generated. Check your OpenSCAD code.' });
            return;
          }

          // Transfer the buffer
          const buffer = outputData.buffer.slice(
            outputData.byteOffset,
            outputData.byteOffset + outputData.byteLength
          );
          self.postMessage({ type: 'result', glb: buffer }, [buffer]);
        } catch (err) {
          self.postMessage({ type: 'error', error: String(err) });
        }
      }
    });
  `;
}

function runOpenSCAD(
  code: string,
  features: string[],
): Promise<{ glb: ArrayBuffer; output: string[] }> {
  return new Promise((resolve, reject) => {
    const workerBlob = new Blob([createWorkerCode()], {
      type: "application/javascript",
    });
    const workerUrl = URL.createObjectURL(workerBlob);
    const worker = new Worker(workerUrl);

    const output: string[] = [];
    let settled = false;

    const cleanup = () => {
      worker.terminate();
      URL.revokeObjectURL(workerUrl);
    };

    worker.addEventListener("message", (e) => {
      const msg = e.data;

      switch (msg.type) {
        case "ready":
          worker.postMessage({ type: "render", code, features });
          break;

        case "stdout":
          output.push(msg.text);
          appendOutput(msg.text, "stdout");
          break;

        case "stderr":
          output.push(msg.text);
          appendOutput(msg.text, "stderr");
          break;

        case "result":
          if (!settled) {
            settled = true;
            cleanup();
            resolve({ glb: msg.glb, output });
          }
          break;

        case "error":
          if (!settled) {
            settled = true;
            cleanup();
            reject(new Error(msg.error));
          }
          break;
      }
    });

    worker.addEventListener("error", (e) => {
      if (!settled) {
        settled = true;
        cleanup();
        reject(new Error(e.message || "Worker error"));
      }
    });

    // Initialize with blob URLs
    worker.postMessage({
      type: "init",
      openscadJsUrl: openscadJsBlobUrl,
      openscadWasmUrl: openscadWasmBlobUrl,
    });
  });
}

// =============================================================================
// Output Panel
// =============================================================================

function clearOutput() {
  outputContentEl.textContent = "";
}

function appendOutput(text: string, type: "stdout" | "stderr" | "error") {
  const span = document.createElement("span");
  span.className = type;
  span.textContent = text + "\n";
  outputContentEl.appendChild(span);
  outputContentEl.scrollTop = outputContentEl.scrollHeight;
}

outputToggleBtn.addEventListener("click", () => {
  const collapsed = outputPanelEl.classList.toggle("collapsed");
  outputToggleBtn.textContent = collapsed ? "Show" : "Hide";
});

// =============================================================================
// Model Viewer
// =============================================================================

let modelViewerLoaded = false;

async function loadModelViewer(): Promise<void> {
  if (modelViewerLoaded) return;
  if (customElements.get("model-viewer")) {
    modelViewerLoaded = true;
    return;
  }

  const script = document.createElement("script");
  script.type = "module";
  script.src = MODEL_VIEWER_URL;

  await new Promise<void>((resolve, reject) => {
    script.onload = () => {
      modelViewerLoaded = true;
      resolve();
    };
    script.onerror = () => reject(new Error("Failed to load model-viewer"));
    document.head.appendChild(script);
  });
}

function displayModel(glbBuffer: ArrayBuffer) {
  const blob = new Blob([glbBuffer], { type: "model/gltf-binary" });
  const url = URL.createObjectURL(blob);

  // Set the source on model-viewer
  modelViewerEl.setAttribute("src", url);
}

// =============================================================================
// Rendering Pipeline
// =============================================================================

async function renderOpenSCAD(code: string, features: string[]) {
  clearOutput();
  sourceCodeEl.textContent = code;

  try {
    // Load model-viewer in parallel with WASM if needed
    showLoading("Loading OpenSCAD engine...");
    await Promise.all([loadWasm(), loadModelViewer()]);

    showLoading("Compiling OpenSCAD code...");
    const { glb } = await runOpenSCAD(code, features);

    log.info(`GLB output: ${(glb.byteLength / 1024).toFixed(1)} KB`);
    displayModel(glb);
    showViewer();
    updateModelContext(code);
  } catch (err) {
    log.error("Render error:", err);
    const message = err instanceof Error ? err.message : String(err);
    appendOutput(message, "error");
    showViewer();
    // Show viewer even on error so user can see output
    modelContainerEl.style.display = "none";
  }
}

// =============================================================================
// Tool Result Handler
// =============================================================================

interface OpenSCADToolResult {
  code: string;
  features: string[];
}

app.ontoolresult = async (result: CallToolResult) => {
  log.info("Received tool result:", result);

  const parsed =
    result.structuredContent as unknown as OpenSCADToolResult | null;
  if (!parsed?.code) {
    showError("No OpenSCAD code provided");
    return;
  }

  // Reset model container visibility
  modelContainerEl.style.display = "";

  await renderOpenSCAD(parsed.code, parsed.features || ["manifold"]);
};

app.onerror = (err) => {
  log.error("App error:", err);
  showError(err instanceof Error ? err.message : String(err));
};

// =============================================================================
// Model Context
// =============================================================================

function updateModelContext(code: string) {
  try {
    const toolId = app.getHostContext()?.toolInfo?.id;
    const header = `OpenSCAD viewer${toolId ? ` (${toolId})` : ""}`;
    const contextText = `${header}\n\nSource code:\n${code}`;
    app.updateModelContext({ content: [{ type: "text", text: contextText }] });
  } catch (err) {
    log.error("Error updating context:", err);
  }
}

// =============================================================================
// Host Context
// =============================================================================

function handleHostContextChanged(ctx: McpUiHostContext) {
  if (ctx.theme) {
    applyDocumentTheme(ctx.theme);
  }
  if (ctx.styles?.variables) {
    applyHostStyleVariables(ctx.styles.variables);
  }
  if (ctx.safeAreaInsets) {
    mainEl.style.paddingTop = `${ctx.safeAreaInsets.top}px`;
    mainEl.style.paddingRight = `${ctx.safeAreaInsets.right}px`;
    mainEl.style.paddingBottom = `${ctx.safeAreaInsets.bottom}px`;
    mainEl.style.paddingLeft = `${ctx.safeAreaInsets.left}px`;
  }
}

app.onhostcontextchanged = handleHostContextChanged;

// Connect to host
app.connect().then(() => {
  log.info("Connected to host");
  const ctx = app.getHostContext();
  if (ctx) {
    handleHostContextChanged(ctx);
  }
});
