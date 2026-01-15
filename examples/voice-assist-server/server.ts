/**
 * Voice Assist MCP Server
 *
 * Provides:
 * - A voice-assist tool with a UI resource
 * - Hidden _run_tool_loop tool for frontend to run LLM sampling with tools
 * - ripgrep and read tools for the LLM to search/read files
 * - Fallback sampling provider when client doesn't support sampling
 * - Pocket TTS server subprocess management (local high-quality TTS)
 */

import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type {
  CallToolResult,
  ReadResourceResult,
  CreateMessageRequest,
  CreateMessageResult,
} from "@modelcontextprotocol/sdk/types.js";
import fs from "node:fs/promises";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { z } from "zod";
import { startServer } from "./server-utils.js";
import { createFallbackSamplingProvider } from "./lib/backfillSampling.js";
import { ToolRegistry } from "./lib/toolRegistry.js";
import { runToolLoop } from "./lib/toolLoop.js";

const DIST_DIR = path.join(import.meta.dirname, "dist");
const WORKING_DIR = process.env.VOICE_ASSIST_CWD || process.cwd();
const TTS_SERVER_PORT = parseInt(process.env.TTS_SERVER_PORT ?? "8880", 10);

// ============================================================
// Pocket TTS Server Subprocess Management
// ============================================================

let ttsServerProcess: ChildProcess | null = null;

/**
 * Start the Pocket TTS server as a subprocess.
 * Uses uvx to run the pocket-tts package.
 */
async function startTTSServer(): Promise<void> {
  if (ttsServerProcess) {
    console.log("[TTS] Server already running");
    return;
  }

  console.log(`[TTS] Starting Pocket TTS server on port ${TTS_SERVER_PORT}...`);

  try {
    // Try to start pocket-tts via uvx
    ttsServerProcess = spawn(
      "uvx",
      [
        "--default-index",
        "https://pypi.org/simple",
        "--from",
        "git+https://github.com/ochafik/pocket-tts.git@mlx[mlx]",
        "pocket-tts",
        "serve",
        "--port",
        TTS_SERVER_PORT.toString(),
      ],
      {
        stdio: ["ignore", "pipe", "pipe"],
        detached: false,
      },
    );

    ttsServerProcess.stdout?.on("data", (data: Buffer) => {
      console.log(`[TTS] ${data.toString().trim()}`);
    });

    ttsServerProcess.stderr?.on("data", (data: Buffer) => {
      const msg = data.toString().trim();
      if (msg) console.error(`[TTS] ${msg}`);
    });

    ttsServerProcess.on("error", (err) => {
      console.error("[TTS] Failed to start:", err.message);
      ttsServerProcess = null;
    });

    ttsServerProcess.on("exit", (code) => {
      console.log(`[TTS] Server exited with code ${code}`);
      ttsServerProcess = null;
    });

    // Wait a bit for server to start
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Health check
    try {
      const response = await fetch(`http://localhost:${TTS_SERVER_PORT}/health`, {
        signal: AbortSignal.timeout(5000),
      });
      if (response.ok) {
        console.log("[TTS] Server started successfully");
      }
    } catch {
      console.log("[TTS] Server may still be starting up...");
    }
  } catch (err) {
    console.error("[TTS] Error starting server:", err);
  }
}

/**
 * Stop the TTS server subprocess.
 */
function stopTTSServer(): void {
  if (ttsServerProcess) {
    console.log("[TTS] Stopping server...");
    ttsServerProcess.kill("SIGTERM");
    ttsServerProcess = null;
  }
}

// Clean up TTS server on exit
process.on("exit", stopTTSServer);
process.on("SIGINT", () => {
  stopTTSServer();
  process.exit(0);
});
process.on("SIGTERM", () => {
  stopTTSServer();
  process.exit(0);
});

/**
 * Run ripgrep command and return results
 */
async function runRipgrep(pattern: string, directory: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const args = [
      "--json",
      "--max-count=50",
      "--max-filesize=1M",
      "-e",
      pattern,
      directory,
    ];

    const rg = spawn("rg", args, { cwd: directory });
    let stdout = "";
    let stderr = "";

    rg.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    rg.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    rg.on("close", (code) => {
      if (code === 0 || code === 1) {
        // code 1 means no matches, which is fine
        resolve(stdout || "No matches found.");
      } else {
        reject(new Error(`ripgrep failed: ${stderr}`));
      }
    });

    rg.on("error", (err) => {
      // ripgrep not installed, try grep as fallback
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        const grep = spawn("grep", ["-rn", "--include=*", pattern, "."], {
          cwd: directory,
        });
        let grepOut = "";

        grep.stdout.on("data", (data) => {
          grepOut += data.toString();
        });

        grep.on("close", () => {
          resolve(grepOut || "No matches found.");
        });

        grep.on("error", () => {
          resolve("Neither ripgrep nor grep available.");
        });
      } else {
        reject(err);
      }
    });
  });
}

/**
 * Create tool registry with ripgrep and read tools for LLM to use
 */
function createInternalTools(): ToolRegistry {
  return new ToolRegistry({
    ripgrep: {
      title: "Ripgrep Search",
      description:
        "Search for files containing a pattern using ripgrep. Returns matching lines with file paths and line numbers.",
      inputSchema: z.object({
        pattern: z.string().describe("The regex pattern to search for"),
        directory: z
          .string()
          .optional()
          .describe("Directory to search in (defaults to working directory)"),
      }),
      callback: async (args) => {
        const { pattern, directory } = args as {
          pattern: string;
          directory?: string;
        };
        const searchDir = directory
          ? path.resolve(WORKING_DIR, directory)
          : WORKING_DIR;

        try {
          const result = await runRipgrep(pattern, searchDir);
          return {
            content: [{ type: "text", text: result }],
          };
        } catch (error) {
          return {
            content: [
              { type: "text", text: `Error: ${(error as Error).message}` },
            ],
            isError: true,
          };
        }
      },
    },
    read: {
      title: "Read File",
      description:
        "Read the contents of a file. Can read specific line ranges.",
      inputSchema: z.object({
        path: z
          .string()
          .describe("Path to the file to read (relative to working directory)"),
        startLine: z
          .number()
          .optional()
          .describe("Start reading from this line (1-indexed)"),
        endLine: z
          .number()
          .optional()
          .describe("Stop reading at this line (1-indexed, inclusive)"),
      }),
      callback: async (args) => {
        const {
          path: filePath,
          startLine,
          endLine,
        } = args as {
          path: string;
          startLine?: number;
          endLine?: number;
        };
        const fullPath = path.resolve(WORKING_DIR, filePath);

        try {
          const content = await fs.readFile(fullPath, "utf-8");
          let lines = content.split("\n");

          if (startLine !== undefined || endLine !== undefined) {
            const start = (startLine ?? 1) - 1;
            const end = endLine ?? lines.length;
            lines = lines.slice(start, end);
          }

          return {
            content: [{ type: "text", text: lines.join("\n") }],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `Error reading file: ${(error as Error).message}`,
              },
            ],
            isError: true,
          };
        }
      },
    },
  });
}

/**
 * Creates the MCP server with all tools and resources
 */
export function createServer(): McpServer {
  const server = new McpServer({
    name: "Voice Assist MCP Server",
    version: "1.0.0",
  });

  const resourceUri = "ui://voice-assist/mcp-app.html";
  const internalTools = createInternalTools();

  // Create fallback sampling provider (lazily initialized)
  let fallbackProvider: Awaited<
    ReturnType<typeof createFallbackSamplingProvider>
  > | null = null;

  /**
   * Get or create the fallback sampling provider
   */
  async function getFallbackProvider() {
    if (!fallbackProvider) {
      fallbackProvider = await createFallbackSamplingProvider();
    }
    return fallbackProvider;
  }

  /**
   * Create a message using either client sampling or fallback provider
   */
  async function createMessage(
    params: CreateMessageRequest["params"],
  ): Promise<CreateMessageResult> {
    const clientCapabilities = server.server.getClientCapabilities();

    if (clientCapabilities?.sampling) {
      // Client supports sampling, use standard MCP flow
      return server.server.createMessage(params);
    }

    // Fallback to direct Anthropic API call
    const provider = await getFallbackProvider();
    return provider.createMessage(params);
  }

  // ============================================================
  // VISIBLE TOOL: voice-assist (launches UI)
  // ============================================================

  registerAppTool(
    server,
    "voice-assist",
    {
      title: "Voice Assistant",
      description:
        "Interactive voice assistant with speech-to-text and text-to-speech. Talk naturally to search files and get information.",
      inputSchema: {},
      _meta: { ui: { resourceUri } },
    },
    async (): Promise<CallToolResult> => {
      return {
        content: [
          {
            type: "text",
            text: "Voice assistant UI launched. Speak to interact.",
          },
        ],
      };
    },
  );

  // ============================================================
  // HIDDEN TOOL: _run_tool_loop (for app to run full tool loop)
  // ============================================================

  registerAppTool(
    server,
    "_run_tool_loop",
    {
      title: "Run Tool Loop",
      description:
        "Run a complete tool loop with the given user message. Uses internal tools (ripgrep, read) automatically.",
      inputSchema: z.object({
        userMessage: z.string().describe("The user's message/question"),
        systemPrompt: z
          .string()
          .optional()
          .describe("Optional custom system prompt"),
        maxIterations: z
          .number()
          .optional()
          .describe("Maximum tool loop iterations (default: 10)"),
      }),
      _meta: {
        ui: {
          visibility: ["app"], // Hidden from model!
        },
      },
    },
    async (args, extra): Promise<CallToolResult> => {
      const { userMessage, systemPrompt, maxIterations } = args as {
        userMessage: string;
        systemPrompt?: string;
        maxIterations?: number;
      };

      const defaultSystemPrompt = `You are a helpful voice assistant. Keep responses concise and suitable for voice output.
When you need to find information in files, use the ripgrep tool to search.
When you need to read file contents, use the read tool.
Provide clear, spoken-language responses.`;

      try {
        const result = await runToolLoop(
          {
            initialMessages: [
              {
                role: "user",
                content: [{ type: "text", text: userMessage }],
              },
            ],
            server,
            registry: internalTools,
            maxIterations: maxIterations ?? 10,
            systemPrompt: systemPrompt ?? defaultSystemPrompt,
            createMessage,
          },
          extra,
        );

        return {
          content: [{ type: "text", text: result.answer }],
          structuredContent: {
            answer: result.answer,
            usage: result.usage,
          },
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Tool loop error: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  // ============================================================
  // Also register internal tools for direct tool/call access
  // ============================================================

  internalTools.register(server);

  // ============================================================
  // UI RESOURCE: The voice assistant React app
  // ============================================================

  registerAppResource(
    server,
    resourceUri,
    resourceUri,
    { mimeType: RESOURCE_MIME_TYPE, description: "Voice Assist UI" },
    async (): Promise<ReadResourceResult> => {
      const html = await fs.readFile(
        path.join(DIST_DIR, "mcp-app.html"),
        "utf-8",
      );
      return {
        contents: [
          {
            uri: resourceUri,
            mimeType: RESOURCE_MIME_TYPE,
            text: html,
            _meta: {
              ui: {
                // Request microphone for Web Speech API
                permissions: { microphone: {} },
                prefersBorder: true,
              },
            },
          },
        ],
      };
    },
  );

  return server;
}

async function main() {
  // Start TTS server in background (non-blocking)
  if (!process.env.DISABLE_TTS_SERVER) {
    startTTSServer().catch((err) => {
      console.error("[TTS] Failed to start TTS server:", err);
    });
  }

  if (process.argv.includes("--stdio")) {
    await createServer().connect(new StdioServerTransport());
  } else {
    const port = parseInt(process.env.PORT ?? "3001", 10);
    await startServer(createServer, { port, name: "Voice Assist MCP Server" });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
