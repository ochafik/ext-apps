/**
 * OpenSCAD Viewer MCP App
 *
 * Renders OpenSCAD code as interactive 3D models:
 * 1. Fetches OpenSCAD WASM from the MCP server (avoids CORS issues)
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
// WASM Loading (via MCP server to avoid CORS)
// =============================================================================

/** Decode a base64 string to a Blob URL using the browser's built-in decoder. */
async function base64ToBlobUrl(
  base64: string,
  mimeType: string,
): Promise<string> {
  const response = await fetch(`data:${mimeType};base64,${base64}`);
  return URL.createObjectURL(await response.blob());
}

async function loadWasm(): Promise<void> {
  if (wasmReady) return;

  showLoading("Downloading OpenSCAD WASM via server...");
  log.info("Fetching WASM files via callServerTool...");

  const result = await app.callServerTool({
    name: "_openscad_get_wasm",
    arguments: {},
  });

  const text = result.content.find(
    (c): c is { type: "text"; text: string } => c.type === "text",
  )?.text;
  if (!text) throw new Error("No WASM data returned from server");

  const data: { openscadJs: string; openscadWasm: string } = JSON.parse(text);

  showLoading("Decoding WASM files...");
  log.info("Decoding base64 WASM data...");

  [openscadJsBlobUrl, openscadWasmBlobUrl] = await Promise.all([
    base64ToBlobUrl(data.openscadJs, "application/javascript"),
    base64ToBlobUrl(data.openscadWasm, "application/wasm"),
  ]);

  wasmReady = true;
  log.info("WASM files ready");
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

// Connect to host
app.connect().then(() => {
  log.info("Connected to host");
  const ctx = app.getHostContext();
  if (ctx) {
    handleHostContextChanged(ctx);
  }
});
