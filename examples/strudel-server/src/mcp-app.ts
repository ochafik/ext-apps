/**
 * Strudel live coding music MCP App
 * Uses @strudel/embed to embed the Strudel REPL
 */
import {
  App,
  type McpUiHostContext,
  applyHostStyleVariables,
  applyDocumentTheme,
} from "@modelcontextprotocol/ext-apps";
import "./global.css";
import "./mcp-app.css";

interface StrudelInput {
  code: string;
}

function isStrudelInput(value: unknown): value is StrudelInput {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Record<string, unknown>).code === "string"
  );
}

const log = {
  info: console.log.bind(console, "[APP]"),
  warn: console.warn.bind(console, "[APP]"),
  error: console.error.bind(console, "[APP]"),
};

// Get element references
const mainEl = document.querySelector(".main") as HTMLElement;
const container = document.getElementById("strudel-container") as HTMLDivElement;
const codePreview = document.getElementById("code-preview") as HTMLPreElement;
const fullscreenBtn = document.getElementById("fullscreen-btn") as HTMLButtonElement;

// Display mode state
let currentDisplayMode: "inline" | "fullscreen" = "inline";

// Strudel REPL element
let strudelRepl: HTMLElement | null = null;

// Handle host context changes (display mode, styling)
function handleHostContextChanged(ctx: McpUiHostContext) {
  if (ctx.theme) applyDocumentTheme(ctx.theme);
  if (ctx.styles?.variables) applyHostStyleVariables(ctx.styles.variables);

  if (ctx.availableDisplayModes !== undefined) {
    const canFullscreen = ctx.availableDisplayModes.includes("fullscreen");
    fullscreenBtn.classList.toggle("available", canFullscreen);
  }

  if (ctx.displayMode) {
    currentDisplayMode = ctx.displayMode as "inline" | "fullscreen";
    mainEl.classList.toggle("fullscreen", currentDisplayMode === "fullscreen");
  }
}

// Handle Escape key to exit fullscreen
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && currentDisplayMode === "fullscreen") {
    toggleFullscreen();
  }
});

// Toggle fullscreen mode
async function toggleFullscreen() {
  const newMode = currentDisplayMode === "fullscreen" ? "inline" : "fullscreen";
  try {
    const result = await app.requestDisplayMode({ mode: newMode });
    currentDisplayMode = result.mode as "inline" | "fullscreen";
    mainEl.classList.toggle("fullscreen", currentDisplayMode === "fullscreen");
  } catch (err) {
    log.error("Failed to change display mode:", err);
  }
}

fullscreenBtn.addEventListener("click", toggleFullscreen);

// Load Strudel embed script dynamically
let embedLoaded = false;
async function loadStrudelEmbed(): Promise<void> {
  if (embedLoaded) return;

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://unpkg.com/@strudel/embed@latest";
    script.onload = () => {
      embedLoaded = true;
      resolve();
    };
    script.onerror = () => reject(new Error("Failed to load @strudel/embed"));
    document.head.appendChild(script);
  });
}

// Create or update the Strudel REPL with new code
async function updateStrudelCode(code: string) {
  await loadStrudelEmbed();

  // Remove existing REPL if present
  if (strudelRepl) {
    strudelRepl.remove();
  }

  // Create new strudel-repl element
  // Code goes inside HTML comments to prevent browser interpretation
  strudelRepl = document.createElement("strudel-repl");
  strudelRepl.innerHTML = `<!--\n${code}\n-->`;
  container.appendChild(strudelRepl);

  log.info("Strudel REPL loaded with pattern");
}

// Create app instance
const app = new App({ name: "Strudel Music", version: "1.0.0" });

app.onteardown = async () => {
  log.info("App is being torn down");
  // Remove REPL to stop audio
  if (strudelRepl) {
    strudelRepl.remove();
    strudelRepl = null;
  }
  return {};
};

app.ontoolinputpartial = (params) => {
  // Show code preview during streaming
  codePreview.classList.add("visible");
  container.classList.add("hidden");
  const code = params.arguments?.code;
  codePreview.textContent = typeof code === "string" ? code : "";
  codePreview.scrollTop = codePreview.scrollHeight;
};

app.ontoolinput = async (params) => {
  log.info("Received Strudel code");

  // Hide code preview, show container
  codePreview.classList.remove("visible");
  container.classList.remove("hidden");

  if (!isStrudelInput(params.arguments)) {
    log.error("Invalid tool input");
    return;
  }

  await updateStrudelCode(params.arguments.code);
};

app.onerror = log.error;

app.onhostcontextchanged = handleHostContextChanged;

// Connect to host
app.connect().then(() => {
  log.info("Connected to host");
  const ctx = app.getHostContext();
  if (ctx) {
    handleHostContextChanged(ctx);
  }
});
