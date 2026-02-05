/**
 * Entry point for the OAuth Demo MCP server.
 *
 * This server demonstrates mixed authentication:
 * - The `/mcp` endpoint works without authentication for basic tools like `get-time`
 * - The `/mcp-authenticated` endpoint requires OAuth and is used for `get-secret-data`
 * - An OAuth Authorization Server runs on a separate port for the demo
 *
 * Run with: bun --watch main.ts
 * Or: node dist/index.js [--stdio]
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import cors from "cors";
import type { Request, Response } from "express";
import { createServer } from "./server.js";
import {
  setupAuthServer,
  createProtectedResourceMetadataRouter,
} from "./auth-server.js";
import {
  requireBearerAuth,
  getOAuthProtectedResourceMetadataUrl,
} from "./auth-middleware.js";

/**
 * Starts the MCP server with HTTP transport and OAuth support.
 */
export async function startStreamableHTTPServer(
  createServer: () => McpServer,
): Promise<void> {
  const mcpPort = parseInt(process.env.PORT ?? "3001", 10);
  const authPort = parseInt(process.env.AUTH_PORT ?? String(mcpPort + 1), 10);

  const mcpServerUrl = new URL(`http://localhost:${mcpPort}/mcp`);
  const authServerUrl = new URL(`http://localhost:${authPort}`);

  // Start the OAuth Authorization Server on a separate port
  setupAuthServer({ authServerUrl, mcpServerUrl });

  const app = createMcpExpressApp({ host: "0.0.0.0" });

  app.use(
    cors({
      exposedHeaders: [
        "WWW-Authenticate",
        "Mcp-Session-Id",
        "Last-Event-Id",
        "Mcp-Protocol-Version",
      ],
      origin: "*",
    }),
  );

  // Serve protected resource metadata so clients can discover the auth server
  app.use(createProtectedResourceMetadataRouter("/mcp"));

  // Auth middleware for the authenticated endpoint
  const authMiddleware = requireBearerAuth({
    resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(mcpServerUrl),
  });

  // ── Unauthenticated MCP endpoint ─────────────────────────────────
  // Serves all tools, but `get-secret-data` will only have meaningful
  // results when called through the authenticated endpoint.
  app.all("/mcp", async (req: Request, res: Response) => {
    const server = createServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    res.on("close", () => {
      transport.close().catch(() => {});
      server.close().catch(() => {});
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error("MCP error:", error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: null,
        });
      }
    }
  });

  // ── Authenticated MCP endpoint ───────────────────────────────────
  // Same server, but requires OAuth Bearer token. Clients that call
  // `get-secret-data` should connect here.
  app.all(
    "/mcp-authenticated",
    authMiddleware,
    async (req: Request, res: Response) => {
      const server = createServer();
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      });

      res.on("close", () => {
        transport.close().catch(() => {});
        server.close().catch(() => {});
      });

      try {
        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
      } catch (error) {
        console.error("MCP authenticated error:", error);
        if (!res.headersSent) {
          res.status(500).json({
            jsonrpc: "2.0",
            error: { code: -32603, message: "Internal server error" },
            id: null,
          });
        }
      }
    },
  );

  const httpServer = app.listen(mcpPort, (err) => {
    if (err) {
      console.error("Failed to start server:", err);
      process.exit(1);
    }
    console.log(`\nOAuth Demo MCP Server listening on http://localhost:${mcpPort}`);
    console.log(`  Unauthenticated: http://localhost:${mcpPort}/mcp`);
    console.log(`  Authenticated:   http://localhost:${mcpPort}/mcp-authenticated`);
    console.log(
      `  Resource Metadata: http://localhost:${mcpPort}/.well-known/oauth-protected-resource/mcp`,
    );
    console.log(`  Auth Server:     http://localhost:${authPort}`);
  });

  const shutdown = () => {
    console.log("\nShutting down...");
    httpServer.close(() => process.exit(0));
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

/**
 * Starts the server with stdio transport (no OAuth in stdio mode).
 */
export async function startStdioServer(
  createServer: () => McpServer,
): Promise<void> {
  await createServer().connect(new StdioServerTransport());
}

async function main() {
  if (process.argv.includes("--stdio")) {
    await startStdioServer(createServer);
  } else {
    await startStreamableHTTPServer(createServer);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
