/**
 * PDF MCP Server - CLI Entry Point
 */

import fs from "node:fs";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import cors from "cors";

import {
  createServer,
  isArxivUrl,
  isFileUrl,
  normalizeArxivUrl,
  pathToFileUrl,
  fileUrlToPath,
  allowedLocalFiles,
  allowedRemoteOrigins,
  DEFAULT_PDF,
} from "./server.js";

// =============================================================================
// Server Startup
// =============================================================================

async function startHttpServer(port: number): Promise<void> {
  const app = express();
  app.use(cors());
  app.use(express.json());

  // Stateless mode - no session management needed!
  app.all("/mcp", async (req, res) => {
    const server = createServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // Stateless is fine now - no shared state!
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

  return new Promise((resolve) => {
    const httpServer = app.listen(port, () => {
      console.log(`PDF Server (range-based) listening on http://localhost:${port}/mcp`);
      resolve();
    });

    const shutdown = () => {
      console.log("\nShutting down...");
      httpServer.close(() => process.exit(0));
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  });
}

// =============================================================================
// CLI Argument Parsing
// =============================================================================

function parseArgs(): { urls: string[]; stdio: boolean } {
  const args = process.argv.slice(2);
  const urls: string[] = [];
  let stdio = false;

  for (const arg of args) {
    if (arg === "--stdio") {
      stdio = true;
    } else if (!arg.startsWith("-")) {
      let url = arg;
      if (!arg.startsWith("http://") && !arg.startsWith("https://") && !arg.startsWith("file://")) {
        // Convert local path to file:// URL
        url = pathToFileUrl(arg);
      } else if (isArxivUrl(arg)) {
        url = normalizeArxivUrl(arg);
      }
      urls.push(url);
    }
  }

  return { urls: urls.length > 0 ? urls : [DEFAULT_PDF], stdio };
}

// =============================================================================
// Main
// =============================================================================

async function main() {
  const { urls, stdio } = parseArgs();

  // Register local files in whitelist
  for (const url of urls) {
    if (isFileUrl(url)) {
      const filePath = fileUrlToPath(url);
      if (fs.existsSync(filePath)) {
        allowedLocalFiles.add(filePath);
        console.error(`[pdf-server] Registered local file: ${filePath}`);
      } else {
        console.error(`[pdf-server] Warning: File not found: ${filePath}`);
      }
    }
  }

  console.error(`[pdf-server] Ready (${urls.length} URL(s) configured)`);
  console.error(`[pdf-server] Allowed origins: ${[...allowedRemoteOrigins].join(", ")}`);

  if (stdio) {
    await createServer().connect(new StdioServerTransport());
  } else {
    const port = parseInt(process.env.PORT ?? "3120", 10);
    await startHttpServer(port);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
