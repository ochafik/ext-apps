/**
 * @file OAuth Demo App - demonstrates authenticated vs unauthenticated MCP tools.
 *
 * The app starts unauthenticated. The user can:
 * 1. Call `get-time` (always works)
 * 2. Click "Authenticate" to trigger the OAuth flow via `get-secret-data`
 * 3. After auth, call `get-secret-data` to see protected data
 */
import {
  App,
  applyDocumentTheme,
  applyHostFonts,
  applyHostStyleVariables,
  type McpUiHostContext,
} from "@modelcontextprotocol/ext-apps";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import "./global.css";
import "./mcp-app.css";

// ── DOM Elements ────────────────────────────────────────────────
const mainEl = document.querySelector(".main") as HTMLElement;
const authStatusEl = document.getElementById("auth-status")!;
const authLabelEl = document.getElementById("auth-label")!;
const statusDot = authStatusEl.querySelector(".status-dot")!;

const serverTimeEl = document.getElementById("server-time")!;
const getTimeBtn = document.getElementById("get-time-btn")!;

const authenticateBtn = document.getElementById("authenticate-btn")!;
const secretDataEl = document.getElementById("secret-data")!;
const getSecretBtn = document.getElementById("get-secret-btn")!;

// ── State ───────────────────────────────────────────────────────
let isAuthenticated = false;

function setAuthenticated(authenticated: boolean) {
  isAuthenticated = authenticated;
  statusDot.className = `status-dot ${authenticated ? "authenticated" : "unauthenticated"}`;
  authLabelEl.textContent = authenticated ? "Authenticated" : "Not Authenticated";
  authenticateBtn.textContent = authenticated
    ? "Authenticated"
    : "Authenticate with OAuth";
  authenticateBtn.classList.toggle("authenticated", authenticated);
  if (authenticated) {
    (authenticateBtn as HTMLButtonElement).disabled = true;
  }
}

// ── Helpers ─────────────────────────────────────────────────────
function extractTime(result: CallToolResult): string {
  const { time } = (result.structuredContent as { time?: string }) ?? {};
  return time ?? "[ERROR]";
}

function extractSecretData(result: CallToolResult): {
  secret: string;
  user: string;
  authenticatedAt: string;
} | null {
  const data = result.structuredContent as {
    secret?: string;
    user?: string;
    authenticatedAt?: string;
  } | null;
  if (data?.secret) {
    return {
      secret: data.secret,
      user: data.user ?? "unknown",
      authenticatedAt: data.authenticatedAt ?? new Date().toISOString(),
    };
  }
  return null;
}

function handleHostContextChanged(ctx: McpUiHostContext) {
  if (ctx.theme) {
    applyDocumentTheme(ctx.theme);
  }
  if (ctx.styles?.variables) {
    applyHostStyleVariables(ctx.styles.variables);
  }
  if (ctx.styles?.css?.fonts) {
    applyHostFonts(ctx.styles.css.fonts);
  }
  if (ctx.safeAreaInsets) {
    mainEl.style.paddingTop = `${ctx.safeAreaInsets.top}px`;
    mainEl.style.paddingRight = `${ctx.safeAreaInsets.right}px`;
    mainEl.style.paddingBottom = `${ctx.safeAreaInsets.bottom}px`;
    mainEl.style.paddingLeft = `${ctx.safeAreaInsets.left}px`;
  }
}

// ── App Setup ───────────────────────────────────────────────────
const app = new App({ name: "OAuth Demo App", version: "1.0.0" });

app.onteardown = async () => {
  console.info("App is being torn down");
  return {};
};

app.ontoolinput = (params) => {
  console.info("Received tool call input:", params);
};

app.ontoolresult = (result) => {
  console.info("Received tool call result:", result);
};

app.ontoolcancelled = (params) => {
  console.info("Tool call cancelled:", params.reason);
};

app.onerror = console.error;
app.onhostcontextchanged = handleHostContextChanged;

// ── Get Time (unauthenticated) ──────────────────────────────────
getTimeBtn.addEventListener("click", async () => {
  try {
    serverTimeEl.textContent = "Loading...";
    console.info("Calling get-time tool...");
    const result = await app.callServerTool({
      name: "get-time",
      arguments: {},
    });
    console.info("get-time result:", result);
    serverTimeEl.textContent = extractTime(result);
  } catch (e) {
    console.error("get-time error:", e);
    serverTimeEl.textContent = "[ERROR]";
  }
});

// ── Authenticate Button ─────────────────────────────────────────
// Triggers the OAuth flow by calling the auth-guarded tool.
// The host/MCP client will handle the 401 → OAuth dance → retry.
authenticateBtn.addEventListener("click", async () => {
  if (isAuthenticated) return;

  try {
    authenticateBtn.textContent = "Authenticating...";
    (authenticateBtn as HTMLButtonElement).disabled = true;
    secretDataEl.textContent = "Authenticating via OAuth...";
    secretDataEl.className = "secret-box";

    console.info("Triggering OAuth by calling get-secret-data...");
    const result = await app.callServerTool({
      name: "get-secret-data",
      arguments: {},
    });

    console.info("get-secret-data result:", result);
    const data = extractSecretData(result);

    if (data) {
      setAuthenticated(true);
      secretDataEl.className = "secret-box success";
      secretDataEl.textContent = JSON.stringify(data, null, 2);
    } else {
      // Tool returned but no structured data - check text content
      const text = result.content
        ?.filter((c): c is { type: "text"; text: string } => c.type === "text")
        .map((c) => c.text)
        .join("\n");

      if (result.isError) {
        secretDataEl.className = "secret-box error";
        secretDataEl.textContent = text ?? "Authentication failed";
        (authenticateBtn as HTMLButtonElement).disabled = false;
        authenticateBtn.textContent = "Authenticate with OAuth";
      } else {
        setAuthenticated(true);
        secretDataEl.className = "secret-box success";
        secretDataEl.textContent = text ?? "Authenticated!";
      }
    }
  } catch (e) {
    console.error("authenticate error:", e);
    secretDataEl.className = "secret-box error";
    secretDataEl.textContent =
      e instanceof Error ? e.message : "Authentication failed";
    (authenticateBtn as HTMLButtonElement).disabled = false;
    authenticateBtn.textContent = "Authenticate with OAuth";
  }
});

// ── Get Secret Data ─────────────────────────────────────────────
getSecretBtn.addEventListener("click", async () => {
  try {
    secretDataEl.textContent = "Loading...";
    secretDataEl.className = "secret-box";

    console.info("Calling get-secret-data tool...");
    const result = await app.callServerTool({
      name: "get-secret-data",
      arguments: {},
    });

    console.info("get-secret-data result:", result);
    const data = extractSecretData(result);

    if (data) {
      setAuthenticated(true);
      secretDataEl.className = "secret-box success";
      secretDataEl.textContent = JSON.stringify(data, null, 2);
    } else {
      const text = result.content
        ?.filter((c): c is { type: "text"; text: string } => c.type === "text")
        .map((c) => c.text)
        .join("\n");

      if (result.isError) {
        secretDataEl.className = "secret-box error";
        secretDataEl.textContent = text ?? "Error fetching secret data";
      } else {
        secretDataEl.className = "secret-box success";
        secretDataEl.textContent = text ?? "Success!";
      }
    }
  } catch (e) {
    console.error("get-secret-data error:", e);
    secretDataEl.className = "secret-box error";
    secretDataEl.textContent =
      e instanceof Error ? e.message : "Failed to get secret data";
  }
});

// ── Connect to Host ─────────────────────────────────────────────
app.connect().then(() => {
  const ctx = app.getHostContext();
  if (ctx) {
    handleHostContextChanged(ctx);
  }
});
