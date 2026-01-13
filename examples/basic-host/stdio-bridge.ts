/**
 * Stdio <-> WebSocket bridge for MCP servers.
 *
 * Spawns an MCP server in stdio mode and bridges communication between
 * WebSocket and the child process's stdin/stdout using line-based JSON-RPC.
 */

import { spawn, type ChildProcess } from "node:child_process";
import type { WebSocket } from "ws";
import type { McpServerConfig } from "./config.js";

const log = {
  info: console.log.bind(console, "[StdioBridge]"),
  warn: console.warn.bind(console, "[StdioBridge]"),
  error: console.error.bind(console, "[StdioBridge]"),
};

/**
 * Environment variables that are safe to pass to spawned processes.
 */
const SAFE_ENV_VARS = [
  "HOME",
  "PATH",
  "USER",
  "SHELL",
  "TERM",
  "LANG",
  "LC_ALL",
  "TZ",
  "TMPDIR",
  "XDG_CONFIG_HOME",
  "XDG_DATA_HOME",
  "XDG_CACHE_HOME",
  // Node.js
  "NODE_ENV",
  "NODE_PATH",
  // Python
  "PYTHONPATH",
  "VIRTUAL_ENV",
  // Common dev tools
  "EDITOR",
  "VISUAL",
];

/**
 * Build a safe environment for spawned processes.
 * Only includes allowlisted variables plus any custom env from config.
 */
function buildSafeEnvironment(
  customEnv?: Record<string, string>
): Record<string, string> {
  const safeEnv: Record<string, string> = {};

  for (const key of SAFE_ENV_VARS) {
    if (process.env[key]) {
      safeEnv[key] = process.env[key]!;
    }
  }

  // Add custom environment variables from config
  if (customEnv) {
    Object.assign(safeEnv, customEnv);
  }

  return safeEnv;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Bridge between a WebSocket connection and an MCP server's stdio.
 */
export class StdioBridge {
  private process: ChildProcess | undefined;
  private readBuffer = "";
  private closed = false;

  constructor(
    private ws: WebSocket,
    private serverName: string,
    private config: McpServerConfig
  ) {}

  /**
   * Start the MCP server process and set up the bridge.
   */
  async start(): Promise<void> {
    log.info(`Starting server: ${this.serverName}`);
    log.info(`Command: ${this.config.command} ${(this.config.args ?? []).join(" ")}`);

    this.process = spawn(this.config.command, this.config.args ?? [], {
      env: buildSafeEnvironment(this.config.env),
      stdio: ["pipe", "pipe", "inherit"], // stderr goes to parent's stderr
    });

    this.process.on("error", (error) => {
      log.error(`Process error for ${this.serverName}:`, error.message);
      this.ws.close(1011, `Process error: ${error.message}`);
    });

    this.process.on("exit", (code, signal) => {
      log.info(
        `Process exited for ${this.serverName}: code=${code}, signal=${signal}`
      );
      if (!this.closed) {
        this.ws.close(1000, `Process exited (code: ${code})`);
      }
    });

    // stdout → WebSocket (line-based JSON-RPC)
    this.process.stdout?.on("data", (chunk: Buffer) => {
      this.readBuffer += chunk.toString();

      // Process complete lines (JSON-RPC messages are newline-delimited)
      let newlineIndex: number;
      while ((newlineIndex = this.readBuffer.indexOf("\n")) !== -1) {
        const line = this.readBuffer.slice(0, newlineIndex).trim();
        this.readBuffer = this.readBuffer.slice(newlineIndex + 1);

        if (line.startsWith("{")) {
          try {
            // Validate it's valid JSON before sending
            JSON.parse(line);
            this.ws.send(line);
          } catch {
            log.warn(`Invalid JSON from server stdout: ${line.slice(0, 100)}`);
          }
        }
      }
    });

    // WebSocket → stdin
    this.ws.on("message", (data) => {
      if (this.process?.stdin?.writable) {
        const msg = data.toString();
        // Ensure message ends with newline for JSON-RPC framing
        this.process.stdin.write(msg.endsWith("\n") ? msg : msg + "\n");
      }
    });

    this.ws.on("close", () => {
      log.info(`WebSocket closed for ${this.serverName}`);
      this.close();
    });

    this.ws.on("error", (error) => {
      log.error(`WebSocket error for ${this.serverName}:`, error.message);
      this.close();
    });

    log.info(`Bridge established for ${this.serverName}`);
  }

  /**
   * Gracefully close the bridge and terminate the child process.
   * Follows the MCP SDK shutdown sequence: stdin.end() → SIGTERM → SIGKILL
   */
  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;

    log.info(`Closing bridge for ${this.serverName}`);

    if (!this.process) return;

    // Close stdin to signal the child process to exit
    this.process.stdin?.end();

    // Wait for graceful exit
    await sleep(2000);

    if (this.process.exitCode === null) {
      log.info(`Sending SIGTERM to ${this.serverName}`);
      this.process.kill("SIGTERM");
      await sleep(2000);
    }

    if (this.process.exitCode === null) {
      log.warn(`Sending SIGKILL to ${this.serverName}`);
      this.process.kill("SIGKILL");
    }
  }
}
