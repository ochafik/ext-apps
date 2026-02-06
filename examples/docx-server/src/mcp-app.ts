/**
 * DOCX Viewer MCP App
 *
 * Interactive DOCX viewer that renders documents as HTML.
 * - Converts DOCX to HTML via server-side mammoth.js
 * - Text selection support
 * - Fullscreen mode
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

const MAX_MODEL_CONTEXT_LENGTH = 15000;

const log = {
  info: console.log.bind(console, "[DOCX-VIEWER]"),
  error: console.error.bind(console, "[DOCX-VIEWER]"),
};

// State
let docUrl = "";
let docText = "";

// DOM Elements
const mainEl = document.querySelector(".main") as HTMLElement;
const loadingEl = document.getElementById("loading")!;
const loadingTextEl = document.getElementById("loading-text")!;
const errorEl = document.getElementById("error")!;
const errorMessageEl = document.getElementById("error-message")!;
const viewerEl = document.getElementById("viewer")!;
const titleEl = document.getElementById("doc-title")!;
const docContentEl = document.getElementById("doc-content")!;
const fullscreenBtn = document.getElementById(
  "fullscreen-btn",
) as HTMLButtonElement;

let currentDisplayMode: "inline" | "fullscreen" = "inline";

// Create app instance
const app = new App(
  { name: "DOCX Viewer", version: "1.0.0" },
  {},
  { autoResize: true },
);

// UI State functions
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
}

// Update model context with current document text
function updateDocContext() {
  if (!docText) return;

  try {
    const sel = window.getSelection();
    const selectedText = sel?.toString().replace(/\s+/g, " ").trim();

    const toolId = app.getHostContext()?.toolInfo?.id;
    const fileName = docUrl.split("/").pop() || "Document";
    const header = [
      `DOCX viewer${toolId ? ` (${toolId})` : ""}`,
      fileName,
    ].join(" | ");

    let content = docText;
    if (content.length > MAX_MODEL_CONTEXT_LENGTH) {
      content = content.slice(0, MAX_MODEL_CONTEXT_LENGTH) + "\n<truncated-content/>";
    }

    // If there's a selection, wrap it
    if (selectedText && selectedText.length > 2) {
      const idx = content.indexOf(selectedText);
      if (idx >= 0) {
        content =
          content.slice(0, idx) +
          `<doc-selection>${selectedText}</doc-selection>` +
          content.slice(idx + selectedText.length);
      }
    }

    const contextText = `${header}\n\n${content}`;
    app.updateModelContext({ content: [{ type: "text", text: contextText }] });
  } catch (err) {
    log.error("Error updating context:", err);
  }
}

async function toggleFullscreen() {
  const ctx = app.getHostContext();
  if (!ctx?.availableDisplayModes?.includes("fullscreen")) {
    log.info("Fullscreen not available");
    return;
  }

  const newMode = currentDisplayMode === "fullscreen" ? "inline" : "fullscreen";
  log.info("Requesting display mode:", newMode);

  try {
    const result = await app.requestDisplayMode({ mode: newMode });
    log.info("Display mode result:", result);
    currentDisplayMode = result.mode as "inline" | "fullscreen";
    updateFullscreenButton();
  } catch (err) {
    log.error("Failed to change display mode:", err);
  }
}

function updateFullscreenButton() {
  fullscreenBtn.title =
    currentDisplayMode === "fullscreen" ? "Exit fullscreen" : "Fullscreen";
}

// Event listeners
fullscreenBtn.addEventListener("click", toggleFullscreen);

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && currentDisplayMode === "fullscreen") {
    toggleFullscreen();
    e.preventDefault();
  }
});

// Update context when text selection changes (debounced)
let selectionUpdateTimeout: ReturnType<typeof setTimeout> | null = null;
document.addEventListener("selectionchange", () => {
  if (selectionUpdateTimeout) clearTimeout(selectionUpdateTimeout);
  selectionUpdateTimeout = setTimeout(() => {
    const sel = window.getSelection();
    const text = sel?.toString().trim();
    if (text && text.length > 2) {
      log.info("Selection changed:", text.slice(0, 50));
      updateDocContext();
    }
  }, 300);
});

// Parse tool result
interface DocxToolResult {
  url: string;
}

// Content from read_docx_content
interface DocxContent {
  url: string;
  html: string;
  text: string;
  messages: string[];
}

// Handle tool result
app.ontoolresult = async (result: CallToolResult) => {
  log.info("Received tool result:", result);

  const parsed = result.structuredContent as unknown as DocxToolResult | null;
  if (!parsed) {
    showError("Invalid tool result");
    return;
  }

  docUrl = parsed.url;

  const fileName = docUrl.split("/").pop() || "Document";
  titleEl.textContent = fileName;
  titleEl.title = docUrl;

  showLoading("Loading document...");

  try {
    // Fetch DOCX content via server tool
    const contentResult = await app.callServerTool({
      name: "read_docx_content",
      arguments: { url: docUrl },
    });

    if (contentResult.isError) {
      const errorText = contentResult.content
        ?.map((c) => ("text" in c ? c.text : ""))
        .join(" ");
      throw new Error(errorText || "Failed to read document");
    }

    const content = contentResult.structuredContent as unknown as DocxContent;
    if (!content) {
      throw new Error("No content returned from server");
    }

    docText = content.text;

    // Log any conversion warnings
    if (content.messages.length > 0) {
      log.info("Conversion messages:", content.messages);
    }

    // Render HTML content
    docContentEl.innerHTML = content.html;

    showViewer();
    updateDocContext();

    log.info(`Document loaded: ${docText.length} chars`);
  } catch (err) {
    log.error("Error loading document:", err);
    showError(err instanceof Error ? err.message : String(err));
  }
};

app.onerror = (err) => {
  log.error("App error:", err);
  showError(err instanceof Error ? err.message : String(err));
};

function handleHostContextChanged(ctx: McpUiHostContext) {
  log.info("Host context changed:", ctx);

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

  if (ctx.displayMode) {
    currentDisplayMode = ctx.displayMode as "inline" | "fullscreen";
    mainEl.classList.toggle("fullscreen", currentDisplayMode === "fullscreen");
    updateFullscreenButton();
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
