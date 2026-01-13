#!/usr/bin/env bun
/**
 * Orchestration script for running all example servers with basic-host.
 *
 * This script:
 * 1. Discovers all example server directories
 * 2. Generates a temporary MCP config file with server commands
 * 3. Starts basic-host with that config (spawns servers via WebSocket on-demand)
 *
 * Usage:
 *   bun examples/run-all.ts start  - Build and start basic-host with all examples
 *   bun examples/run-all.ts dev    - Run in dev/watch mode
 *   bun examples/run-all.ts build  - Build all examples
 */

import { readdirSync, statSync, existsSync, writeFileSync, unlinkSync } from "fs";
import { join, resolve } from "path";
import { tmpdir } from "os";
import concurrently from "concurrently";

const BASIC_HOST = "basic-host";

// Find all example directories except basic-host that have a package.json
const exampleDirs = readdirSync("examples")
  .filter(
    (d) =>
      d !== BASIC_HOST &&
      statSync(`examples/${d}`).isDirectory() &&
      existsSync(`examples/${d}/package.json`),
  )
  .sort(); // Sort for consistent ordering

const COMMANDS = ["start", "dev", "build"];

const command = process.argv[2];

if (!command || !COMMANDS.includes(command)) {
  console.error(`Usage: bun examples/run-all.ts <${COMMANDS.join("|")}>`);
  process.exit(1);
}

// Generate MCP config file for basic-host
// Each server is configured to run `npm run serve` in its directory
interface McpServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

interface McpServersConfig {
  mcpServers: Record<string, McpServerConfig>;
}

const mcpConfig: McpServersConfig = {
  mcpServers: {},
};

for (const dir of exampleDirs) {
  // Use absolute path to npm and working directory
  const serverDir = resolve("examples", dir);
  mcpConfig.mcpServers[dir] = {
    command: "npm",
    args: ["run", "serve", "--prefix", serverDir],
  };
}

// Write temporary config file
const configPath = join(tmpdir(), `mcp-apps-config-${process.pid}.json`);
writeFileSync(configPath, JSON.stringify(mcpConfig, null, 2));

console.log(`Running command: ${command}`);
console.log(`Server examples: ${exampleDirs.join(", ")}`);
console.log(`Config file: ${configPath}`);
console.log("");

// Cleanup config file on exit
function cleanup() {
  try {
    unlinkSync(configPath);
    console.log(`Cleaned up config file: ${configPath}`);
  } catch {
    // Ignore errors (file may already be deleted)
  }
}

process.on("exit", cleanup);
process.on("SIGINT", () => { cleanup(); process.exit(0); });
process.on("SIGTERM", () => { cleanup(); process.exit(0); });

// Build command list for concurrently
const commands: Parameters<typeof concurrently>[0] = [];

// For build command, we need to build all examples first
if (command === "build") {
  // Build all examples (they can run in parallel)
  commands.push(
    ...exampleDirs.map((dir) => ({
      command: `npm run --workspace examples/${dir} build`,
      name: dir,
    })),
    // Also build basic-host
    {
      command: `npm run --workspace examples/${BASIC_HOST} build`,
      name: BASIC_HOST,
    },
  );
} else {
  // For start/dev, first build examples then run basic-host with config
  // Note: basic-host will spawn servers on-demand via WebSocket

  // Build all examples first (in sequence before basic-host starts)
  for (const dir of exampleDirs) {
    commands.push({
      command: `npm run --workspace examples/${dir} build`,
      name: `build:${dir}`,
    });
  }

  // Start basic-host with the generated config
  // Pass --config flag to use our temporary config file
  commands.push({
    command: `npm run --workspace examples/${BASIC_HOST} ${command} -- --config ${configPath}`,
    name: BASIC_HOST,
  });

  // If dev mode, also run the main library watcher
  if (command === "dev") {
    commands.unshift({
      command: "npm run watch",
      name: "lib",
    });
  }
}

const { result } = concurrently(commands, {
  prefix: "name",
  // For build command, we want all to complete; for start/dev, kill all on failure
  killOthersOnFail: command !== "build",
});

result.catch(() => process.exit(1));
