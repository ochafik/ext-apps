/**
 * Shared utilities for running MCP servers with multiple transports.
 *
 * This module provides a unified way to start MCP servers supporting:
 * - stdio transport (for local CLI tools)
 * - Streamable HTTP transport (current spec)
 * - Legacy SSE transport (deprecated, for backwards compatibility)
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import cors from "cors";
import express, { type Request, type Response } from "express";

export interface ServerOptions {
  /** Port to listen on for HTTP mode. Defaults to 3001 or PORT env variable. */
  port?: number;
  /** Server name for logging. Defaults to "MCP Server". */
  name?: string;
}

/**
 * Starts an MCP server with support for stdio and HTTP transports.
 *
 * Transport is selected based on command line arguments:
 * - `--stdio`: Uses stdio transport for local process communication
 * - Otherwise: Starts HTTP server with Streamable HTTP and legacy SSE support
 *
 * @param server - The MCP server instance to start
 * @param options - Optional configuration
 */
export async function startServer(
  server: McpServer,
  options: ServerOptions = {},
): Promise<void> {
  const port =
    options.port ?? (process.env.PORT ? parseInt(process.env.PORT, 10) : 3001);
  const name = options.name ?? "MCP Server";

  if (process.argv.includes("--stdio")) {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error(`${name} running in stdio mode`);
  } else {
    const app = express();
    app.use(cors());
    app.use(express.json());

    // Streamable HTTP transport (current spec) - handles GET, POST, DELETE
    app.all("/mcp", async (req: Request, res: Response) => {
      try {
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: undefined,
          enableJsonResponse: true,
        });
        res.on("close", () => {
          transport.close();
        });

        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
      } catch (error) {
        console.error("Error handling MCP request:", error);
        if (!res.headersSent) {
          res.status(500).json({
            jsonrpc: "2.0",
            error: { code: -32603, message: "Internal server error" },
            id: null,
          });
        }
      }
    });

    // Legacy SSE transport (deprecated) - for backwards compatibility
    const sseTransports = new Map<string, SSEServerTransport>();

    app.get("/sse", async (_req: Request, res: Response) => {
      const transport = new SSEServerTransport("/messages", res);
      sseTransports.set(transport.sessionId, transport);
      res.on("close", () => {
        sseTransports.delete(transport.sessionId);
      });
      await server.connect(transport);
    });

    app.post("/messages", async (req: Request, res: Response) => {
      const sessionId = req.query.sessionId as string;
      const transport = sseTransports.get(sessionId);
      if (!transport) {
        res.status(404).json({ error: "Session not found" });
        return;
      }
      await transport.handlePostMessage(req, res, req.body);
    });

    const httpServer = app.listen(port, () => {
      console.log(`${name} listening on http://localhost:${port}/mcp`);
    });

    const shutdown = () => {
      console.log("\nShutting down...");
      httpServer.close(() => {
        console.log("Server closed");
        process.exit(0);
      });
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  }
}
