/**
 * Entry point for running the DOCX MCP server.
 * Run with: npx mcp-docx-server [--stdio] [docx-files...]
 */

import fs from "node:fs";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import cors from "cors";
import type { Request, Response } from "express";
import {
  createServer,
  isFileUrl,
  pathToFileUrl,
  fileUrlToPath,
  allowedLocalFiles,
  SAMPLE_URL,
} from "./server.js";

/**
 * Starts an MCP server with Streamable HTTP transport in stateless mode.
 */
export async function startStreamableHTTPServer(
  createServer: () => McpServer,
): Promise<void> {
  const port = parseInt(process.env.PORT ?? "3001", 10);

  const app = createMcpExpressApp({ host: "0.0.0.0" });
  app.use(cors());

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

  const httpServer = app.listen(port, (err) => {
    if (err) {
      console.error("Failed to start server:", err);
      process.exit(1);
    }
    console.log(`MCP server listening on http://localhost:${port}/mcp`);
  });

  const shutdown = () => {
    console.log("\nShutting down...");
    httpServer.close(() => process.exit(0));
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

/**
 * Starts an MCP server with stdio transport.
 */
export async function startStdioServer(
  createServer: () => McpServer,
): Promise<void> {
  await createServer().connect(new StdioServerTransport());
}

function parseArgs(): { urls: string[]; stdio: boolean } {
  const args = process.argv.slice(2);
  const urls: string[] = [];
  let stdio = false;

  for (const arg of args) {
    if (arg === "--stdio") {
      stdio = true;
    } else if (!arg.startsWith("-")) {
      let url = arg;
      if (
        !arg.startsWith("http://") &&
        !arg.startsWith("https://") &&
        !arg.startsWith("file://")
      ) {
        url = pathToFileUrl(arg);
      }
      urls.push(url);
    }
  }

  return { urls, stdio };
}

async function main() {
  const { urls, stdio } = parseArgs();

  // Register local files in whitelist
  for (const url of urls) {
    if (isFileUrl(url)) {
      const filePath = fileUrlToPath(url);
      if (fs.existsSync(filePath)) {
        allowedLocalFiles.add(filePath);
        console.error(`[docx-server] Registered local file: ${filePath}`);
      } else {
        console.error(`[docx-server] Warning: File not found: ${filePath}`);
      }
    }
  }

  console.error(`[docx-server] Ready (${urls.length} file(s) configured)`);

  if (stdio) {
    await startStdioServer(createServer);
  } else {
    await startStreamableHTTPServer(createServer);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
