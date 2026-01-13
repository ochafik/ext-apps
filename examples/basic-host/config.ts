/**
 * MCP server config loading utilities.
 * Supports Claude Desktop config format (claude_desktop_config.json).
 */

import { homedir } from "node:os";
import { join } from "node:path";
import { readFile } from "node:fs/promises";

export interface McpServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface McpServersConfig {
  mcpServers?: Record<string, McpServerConfig>;
}

/**
 * Get the default Claude Desktop config path for the current platform.
 */
export function getDefaultConfigPath(): string {
  if (process.platform === "darwin") {
    return join(
      homedir(),
      "Library",
      "Application Support",
      "Claude",
      "claude_desktop_config.json"
    );
  } else if (process.platform === "win32") {
    return join(
      process.env.APPDATA ?? homedir(),
      "Claude",
      "claude_desktop_config.json"
    );
  }
  // Linux and other platforms
  return join(homedir(), ".config", "claude", "claude_desktop_config.json");
}

/**
 * Load MCP server config from a JSON file.
 * @param configPath Path to config file, or undefined to use default Claude Desktop path
 * @returns Parsed config object (may have empty mcpServers if file doesn't exist)
 */
export async function loadConfig(
  configPath?: string
): Promise<McpServersConfig> {
  const path = configPath ?? getDefaultConfigPath();
  try {
    const content = await readFile(path, "utf-8");
    return JSON.parse(content);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      console.warn(`[Config] Config file not found: ${path}`);
      return { mcpServers: {} };
    }
    throw error;
  }
}

/**
 * Parse --config CLI flag from process.argv.
 * @returns Config path if --config flag is present, undefined otherwise
 */
export function parseConfigArg(argv: string[] = process.argv): string | undefined {
  const configIndex = argv.indexOf("--config");
  if (configIndex !== -1 && configIndex + 1 < argv.length) {
    return argv[configIndex + 1];
  }
  return undefined;
}
