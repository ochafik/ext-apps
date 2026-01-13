#!/usr/bin/env npx tsx
/**
 * HTTP + WebSocket servers for the MCP UI example:
 * - Host server (port 8080): serves host HTML files, API endpoints, and WebSocket for MCP
 * - Sandbox server (port 8081): serves sandbox.html with CSP headers
 *
 * Running on separate ports ensures proper origin isolation for security.
 *
 * WebSocket endpoint: ws://localhost:8080/ws?server={name}
 * - Spawns MCP servers from config file (Claude Desktop format)
 * - Bridges WebSocket ↔ stdio communication
 *
 * Security: CSP is set via HTTP headers based on ?csp= query param.
 * This ensures content cannot tamper with CSP (unlike meta tags).
 */

import express from "express";
import cors from "cors";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import type { McpUiResourceCsp } from "@modelcontextprotocol/ext-apps";
import { loadConfig, parseConfigArg, type McpServersConfig } from "./config.js";
import { StdioBridge } from "./stdio-bridge.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const HOST_PORT = parseInt(process.env.HOST_PORT || "8080", 10);
const SANDBOX_PORT = parseInt(process.env.SANDBOX_PORT || "8081", 10);
const DIRECTORY = join(__dirname, "dist");

// Load MCP server config
const CONFIG_PATH = parseConfigArg();
let mcpConfig: McpServersConfig = { mcpServers: {} };

try {
  mcpConfig = await loadConfig(CONFIG_PATH);
  const serverNames = Object.keys(mcpConfig.mcpServers ?? {});
  console.log(`[Config] Loaded ${serverNames.length} server(s): ${serverNames.join(", ") || "(none)"}`);
  if (CONFIG_PATH) {
    console.log(`[Config] Config file: ${CONFIG_PATH}`);
  }
} catch (error) {
  console.error("[Config] Failed to load config:", error);
}

// ============ Host Server (port 8080) ============
const hostApp = express();
hostApp.use(cors());

// Exclude sandbox.html from host server
hostApp.use((req, res, next) => {
  if (req.path === "/sandbox.html") {
    res.status(404).send("Sandbox is served on a different port");
    return;
  }
  next();
});

hostApp.use(express.static(DIRECTORY));

// API endpoint to get available server names
hostApp.get("/api/servers", (_req, res) => {
  res.json(Object.keys(mcpConfig.mcpServers ?? {}));
});

hostApp.get("/", (_req, res) => {
  res.redirect("/index.html");
});

// Create HTTP server for host app (needed for WebSocket upgrade)
const httpServer = createServer(hostApp);

// ============ WebSocket Server ============
const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

// Track active bridges for cleanup
const activeBridges = new Map<WebSocket, StdioBridge>();

wss.on("connection", async (ws, req) => {
  const url = new URL(req.url ?? "", `http://${req.headers.host}`);
  const serverName = url.searchParams.get("server");

  if (!serverName) {
    console.warn("[WebSocket] Missing 'server' query param");
    ws.close(4000, "Missing 'server' query param");
    return;
  }

  const serverConfig = mcpConfig.mcpServers?.[serverName];
  if (!serverConfig) {
    console.warn(`[WebSocket] Unknown server: ${serverName}`);
    ws.close(4001, `Unknown server: ${serverName}`);
    return;
  }

  console.log(`[WebSocket] New connection for server: ${serverName}`);

  const bridge = new StdioBridge(ws, serverName, serverConfig);
  activeBridges.set(ws, bridge);

  try {
    await bridge.start();
  } catch (error) {
    console.error(`[WebSocket] Failed to start bridge for ${serverName}:`, error);
    ws.close(1011, `Failed to start server: ${(error as Error).message}`);
    activeBridges.delete(ws);
    return;
  }

  ws.on("close", () => {
    activeBridges.delete(ws);
  });
});

// ============ Sandbox Server (port 8081) ============
const sandboxApp = express();
sandboxApp.use(cors());

// Validate CSP domain entries to prevent injection attacks.
// Rejects entries containing characters that could:
// - `;` or newlines: break out to new CSP directive
// - quotes: inject CSP keywords like 'unsafe-eval'
// - space: inject multiple sources in one entry
function sanitizeCspDomains(domains?: string[]): string[] {
  if (!domains) return [];
  return domains.filter((d) => typeof d === "string" && !/[;\r\n'" ]/.test(d));
}

function buildCspHeader(csp?: McpUiResourceCsp): string {
  const resourceDomains = sanitizeCspDomains(csp?.resourceDomains).join(" ");
  const connectDomains = sanitizeCspDomains(csp?.connectDomains).join(" ");
  const frameDomains = sanitizeCspDomains(csp?.frameDomains).join(" ") || null;
  const baseUriDomains =
    sanitizeCspDomains(csp?.baseUriDomains).join(" ") || null;

  const directives = [
    // Default: allow same-origin + inline styles/scripts (needed for bundled apps)
    "default-src 'self' 'unsafe-inline'",
    // Scripts: same-origin + inline + eval (some libs need eval) + blob (workers) + specified domains
    `script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: data: ${resourceDomains}`.trim(),
    // Styles: same-origin + inline + specified domains
    `style-src 'self' 'unsafe-inline' blob: data: ${resourceDomains}`.trim(),
    // Images: same-origin + data/blob URIs + specified domains
    `img-src 'self' data: blob: ${resourceDomains}`.trim(),
    // Fonts: same-origin + data/blob URIs + specified domains
    `font-src 'self' data: blob: ${resourceDomains}`.trim(),
    // Network requests: same-origin + specified API/tile domains
    `connect-src 'self' ${connectDomains}`.trim(),
    // Workers: same-origin + blob (dynamic workers) + specified domains
    // This is critical for WebGL apps (CesiumJS, Three.js) that use workers for:
    // - Tile decoding and terrain processing
    // - Image processing and texture loading
    // - Physics and geometry calculations
    `worker-src 'self' blob: ${resourceDomains}`.trim(),
    // Nested iframes: use frameDomains if provided, otherwise block all
    frameDomains ? `frame-src ${frameDomains}` : "frame-src 'none'",
    // Plugins: always blocked (defense in depth)
    "object-src 'none'",
    // Base URI: use baseUriDomains if provided, otherwise block all
    baseUriDomains ? `base-uri ${baseUriDomains}` : "base-uri 'none'",
  ];

  return directives.join("; ");
}

// Serve sandbox.html with CSP from query params
sandboxApp.get(["/", "/sandbox.html"], (req, res) => {
  // Parse CSP config from query param: ?csp=<url-encoded-json>
  let cspConfig: McpUiResourceCsp | undefined;
  if (typeof req.query.csp === "string") {
    try {
      cspConfig = JSON.parse(req.query.csp);
    } catch (e) {
      console.warn("[Sandbox] Invalid CSP query param:", e);
    }
  }

  // Set CSP via HTTP header - tamper-proof unlike meta tags
  const cspHeader = buildCspHeader(cspConfig);
  res.setHeader("Content-Security-Policy", cspHeader);

  // Prevent caching to ensure fresh CSP on each load
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");

  res.sendFile(join(DIRECTORY, "sandbox.html"));
});

sandboxApp.use((_req, res) => {
  res.status(404).send("Only sandbox.html is served on this port");
});

// ============ Start both servers ============
httpServer.listen(HOST_PORT, () => {
  console.log(`Host server:    http://localhost:${HOST_PORT}`);
  console.log(`WebSocket:      ws://localhost:${HOST_PORT}/ws?server={name}`);
});

sandboxApp.listen(SANDBOX_PORT, (err) => {
  if (err) {
    console.error("Error starting server:", err);
    process.exit(1);
  }
  console.log(`Sandbox server: http://localhost:${SANDBOX_PORT}`);
  console.log("\nPress Ctrl+C to stop\n");
});

// ============ Graceful shutdown ============
async function shutdown() {
  console.log("\n[Shutdown] Closing connections...");

  // Close all active bridges
  const closePromises: Promise<void>[] = [];
  for (const bridge of activeBridges.values()) {
    closePromises.push(bridge.close());
  }
  await Promise.all(closePromises);

  // Close WebSocket server
  wss.close();

  // Close HTTP servers
  httpServer.close();

  console.log("[Shutdown] Done");
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
