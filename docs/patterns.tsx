/**
 * Type-checked code examples for the patterns documentation.
 *
 * These examples are included in {@link ./patterns.md} via `@includeCode` tags.
 * Each function's region markers define the code snippet that appears in the docs.
 *
 * @module
 */

import { App } from "../src/app.js";
import {
  applyDocumentTheme,
  applyHostFonts,
  applyHostStyleVariables,
} from "../src/styles.js";
import { randomUUID } from "node:crypto";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { McpUiHostContext } from "../src/types.js";
import { useApp, useHostStyles } from "../src/react/index.js";

/**
 * Example: Authenticated calls from App
 */
function authenticatedCalls(app: App) {
  //#region authenticatedCalls
  // TODO: Use tool calls / read resources
  // See PDF example to read binaries by chunks
  // Pass auth token in _meta + refresh token + store in local storage
  //#endregion authenticatedCalls
}

/**
 * Example: Unified host styling (theme, CSS variables, fonts)
 */
function hostStylingVanillaJs(app: App) {
  //#region hostStylingVanillaJs
  function applyHostContext(ctx: McpUiHostContext) {
    if (ctx.theme) {
      applyDocumentTheme(ctx.theme);
    }
    if (ctx.styles?.variables) {
      applyHostStyleVariables(ctx.styles.variables);
    }
    if (ctx.styles?.css?.fonts) {
      applyHostFonts(ctx.styles.css.fonts);
    }
  }

  // Apply when host context changes
  app.onhostcontextchanged = applyHostContext;

  // Apply initial styles after connecting
  app.connect().then(() => {
    const ctx = app.getHostContext();
    if (ctx) {
      applyHostContext(ctx);
    }
  });
  //#endregion hostStylingVanillaJs
}

/**
 * Example: Host styling with React (CSS variables, theme, fonts)
 */
function hostStylingReact() {
  //#region hostStylingReact
  function MyApp() {
    const { app } = useApp({
      appInfo: { name: "MyApp", version: "1.0.0" },
      capabilities: {},
    });

    // Apply all host styles (variables, theme, fonts)
    useHostStyles(app, app?.getHostContext());

    return (
      <div
        style={{
          background: "var(--color-background-primary)",
          fontFamily: "var(--font-sans)",
        }}
      >
        <p>Styled with host CSS variables and fonts</p>
        <p className="theme-aware">Uses [data-theme] selectors</p>
      </div>
    );
  }
  //#endregion hostStylingReact
}

/**
 * Example: Persisting widget state (server-side)
 */
function persistWidgetStateServer(
  url: string,
  title: string,
  pageCount: number,
) {
  function toolCallback(): CallToolResult {
    //#region persistDataServer
    // In your tool callback, include widgetUUID in the result metadata.
    return {
      content: [{ type: "text", text: `Displaying PDF viewer for "${title}"` }],
      structuredContent: { url, title, pageCount, initialPage: 1 },
      _meta: {
        widgetUUID: randomUUID(),
      },
    };
    //#endregion persistDataServer
  }
}

/**
 * Example: Persisting widget state (client-side)
 */
function persistWidgetState(app: App) {
  //#region persistData
  // Store the widgetUUID received from the server
  let widgetUUID: string | undefined;

  // Helper to save state to localStorage
  function saveState<T>(state: T): void {
    if (!widgetUUID) return;
    try {
      localStorage.setItem(widgetUUID, JSON.stringify(state));
    } catch (err) {
      console.error("Failed to save widget state:", err);
    }
  }

  // Helper to load state from localStorage
  function loadState<T>(): T | null {
    if (!widgetUUID) return null;
    try {
      const saved = localStorage.getItem(widgetUUID);
      return saved ? (JSON.parse(saved) as T) : null;
    } catch (err) {
      console.error("Failed to load widget state:", err);
      return null;
    }
  }

  // Receive widgetUUID from the tool result
  app.ontoolresult = (result) => {
    widgetUUID = result._meta?.widgetUUID
      ? String(result._meta.widgetUUID)
      : undefined;

    // Restore any previously saved state
    const savedState = loadState<{ currentPage: number }>();
    if (savedState) {
      // Apply restored state to your UI...
    }
  };

  // Call saveState() whenever your widget state changes
  // e.g., saveState({ currentPage: 5 });
  //#endregion persistData
}

/**
 * Example: Pausing computation-heavy widgets when out of view
 */
function visibilityBasedPause(
  app: App,
  container: HTMLElement,
  animation: { play: () => void; pause: () => void },
) {
  //#region visibilityBasedPause
  // Use IntersectionObserver to pause when widget scrolls out of view
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        animation.play();
      } else {
        animation.pause();
      }
    });
  });
  observer.observe(container);

  // Clean up when the host tears down the widget
  app.onteardown = async () => {
    observer.disconnect();
    animation.pause();
    return {};
  };
  //#endregion visibilityBasedPause
}

/**
 * Example: Supporting both iframe & MCP Apps in same binary
 */
function iframeAndMcpApps() {
  //#region iframeAndMcpApps
  // TODO: See recipe: https://github.com/modelcontextprotocol/ext-apps/issues/34
  //#endregion iframeAndMcpApps
}

/**
 * Example: Migrating from OpenAI to MCP Apps
 */
function migrateFromOpenai() {
  //#region migrateFromOpenai
  // TODO: See OpenAI -> MCP Apps migration guide
  // https://docs.google.com/document/d/13ROImOR9B8xc32yhqsFyC9Hh3_H63JFORDIyjyIPcU4/edit
  //#endregion migrateFromOpenai
}

// Suppress unused variable warnings
void authenticatedCalls;
void hostStylingVanillaJs;
void hostStylingReact;
void persistWidgetStateServer;
void persistWidgetState;
void visibilityBasedPause;
void iframeAndMcpApps;
void migrateFromOpenai;
