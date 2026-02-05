/**
 * MCP OAuth Demo Server
 *
 * Demonstrates an MCP server with two tools:
 * - `get-time`: Always available, no authentication required
 * - `get-secret-data`: Requires OAuth authentication (returns 401 until user authenticates)
 *
 * The UI shows both tools. Clicking "Authenticate" triggers the OAuth flow via the
 * host's MCP transport, and once authenticated the secret data tool becomes available.
 */

import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type {
  CallToolResult,
  ReadResourceResult,
} from "@modelcontextprotocol/sdk/types.js";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

const DIST_DIR = import.meta.filename.endsWith(".ts")
  ? path.join(import.meta.dirname, "dist")
  : import.meta.dirname;

/**
 * Creates a new MCP server instance with tools and resources registered.
 */
export function createServer(): McpServer {
  const server = new McpServer({
    name: "OAuth Demo MCP Server",
    version: "1.0.0",
  });

  const resourceUri = "ui://oauth-demo/mcp-app.html";

  // ── Tool 1: get-time (unauthenticated) ──────────────────────────
  registerAppTool(
    server,
    "get-time",
    {
      title: "Get Time",
      description:
        "Returns the current server time. Always available, no authentication required.",
      inputSchema: {},
      outputSchema: z.object({
        time: z.string(),
      }),
      _meta: { ui: { resourceUri } },
    },
    async (): Promise<CallToolResult> => {
      const time = new Date().toISOString();
      return {
        content: [{ type: "text", text: time }],
        structuredContent: { time },
      };
    },
  );

  // ── Tool 2: get-secret-data (OAuth-guarded) ─────────────────────
  // This tool is always *registered*, but the /mcp-authenticated endpoint
  // requires a valid Bearer token. The host/client will get a 401 when
  // calling this tool without authenticating first, which triggers the
  // OAuth flow.
  registerAppTool(
    server,
    "get-secret-data",
    {
      title: "Get Secret Data",
      description:
        "Returns secret data that is only available after OAuth authentication.",
      inputSchema: {},
      outputSchema: z.object({
        secret: z.string(),
        user: z.string(),
        authenticatedAt: z.string(),
      }),
      _meta: { ui: { resourceUri } },
    },
    async (): Promise<CallToolResult> => {
      // If we get here, the request already passed auth middleware
      const secret = `TOP-SECRET-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
      return {
        content: [{ type: "text", text: `Secret: ${secret}` }],
        structuredContent: {
          secret,
          user: "demo@example.com",
          authenticatedAt: new Date().toISOString(),
        },
      };
    },
  );

  // ── UI Resource ─────────────────────────────────────────────────
  registerAppResource(
    server,
    resourceUri,
    resourceUri,
    { mimeType: RESOURCE_MIME_TYPE },
    async (): Promise<ReadResourceResult> => {
      const html = await fs.readFile(
        path.join(DIST_DIR, "mcp-app.html"),
        "utf-8",
      );
      return {
        contents: [{ uri: resourceUri, mimeType: RESOURCE_MIME_TYPE, text: html }],
      };
    },
  );

  return server;
}
