/**
 * OpenSCAD MCP Server
 *
 * Provides a tool for rendering OpenSCAD code as interactive 3D models.
 * The WASM engine runs client-side; this server fetches the WASM files
 * (avoiding CORS issues) and passes them to the UI via an internal tool.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type {
  CallToolResult,
  ReadResourceResult,
} from "@modelcontextprotocol/sdk/types.js";
import fs from "node:fs/promises";
import path from "node:path";
import zlib from "node:zlib";
import { z } from "zod";
import {
  registerAppTool,
  registerAppResource,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";

// Works both from source (server.ts) and compiled (dist/server.js)
const DIST_DIR = import.meta.filename.endsWith(".ts")
  ? path.join(import.meta.dirname, "dist")
  : import.meta.dirname;

const RESOURCE_URI = "ui://openscad/mcp-app.html";

const WASM_ZIP_URL =
  "https://files.openscad.org/playground/OpenSCAD-2025.03.25.wasm24456-WebAssembly-web.zip";

const TOOL_DESCRIPTION = `Renders OpenSCAD code as an interactive 3D model using the OpenSCAD WASM engine.

The code is compiled client-side via WebAssembly and displayed using an interactive 3D viewer with orbit controls.

OPENSCAD BASICS:
- cube(size) or cube([x,y,z]) - box primitive
- sphere(r=radius) - sphere primitive
- cylinder(h=height, r=radius) - cylinder primitive
- translate([x,y,z]) - move objects
- rotate([x,y,z]) - rotate objects
- union() { ... } - combine objects
- difference() { ... } - subtract subsequent objects from first
- intersection() { ... } - keep only overlapping volume
- linear_extrude(height) - extrude 2D shape
- for (i=[0:n]) - loop construct
- module name() { ... } - reusable component

EXAMPLE:
  difference() {
    cube(15, center=true);
    sphere(r=10);
  }`;

// =============================================================================
// WASM ZIP Download & Extraction (cached at module level)
// =============================================================================

interface ZipEntry {
  filename: string;
  compressedData: Buffer;
  compressionMethod: number;
}

function parseZipEntries(buffer: Buffer): ZipEntry[] {
  const entries: ZipEntry[] = [];

  // Find End of Central Directory record
  let eocdOffset = -1;
  for (let i = buffer.length - 22; i >= 0; i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset === -1) throw new Error("Not a valid ZIP file");

  const cdOffset = buffer.readUInt32LE(eocdOffset + 16);
  const cdEntries = buffer.readUInt16LE(eocdOffset + 10);

  let offset = cdOffset;
  for (let i = 0; i < cdEntries; i++) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) break;

    const compressionMethod = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const filenameLen = buffer.readUInt16LE(offset + 28);
    const extraLen = buffer.readUInt16LE(offset + 30);
    const commentLen = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);

    const filename = buffer
      .subarray(offset + 46, offset + 46 + filenameLen)
      .toString("utf-8");

    const localFilenameLen = buffer.readUInt16LE(localHeaderOffset + 26);
    const localExtraLen = buffer.readUInt16LE(localHeaderOffset + 28);
    const dataOffset =
      localHeaderOffset + 30 + localFilenameLen + localExtraLen;

    const compressedData = buffer.subarray(
      dataOffset,
      dataOffset + compressedSize,
    );

    entries.push({ filename, compressedData, compressionMethod });
    offset += 46 + filenameLen + extraLen + commentLen;
  }

  return entries;
}

function decompressEntry(entry: ZipEntry): Buffer {
  if (entry.compressionMethod === 0) return Buffer.from(entry.compressedData);
  if (entry.compressionMethod === 8)
    return zlib.inflateRawSync(entry.compressedData);
  throw new Error(`Unsupported compression method: ${entry.compressionMethod}`);
}

/** Cached extracted WASM files as base64 strings. */
let wasmCache: { openscadJs: string; openscadWasm: string } | null = null;

async function fetchWasmFiles(): Promise<{
  openscadJs: string;
  openscadWasm: string;
}> {
  if (wasmCache) return wasmCache;

  console.error("[openscad-server] Downloading WASM ZIP...");
  const response = await fetch(WASM_ZIP_URL);
  if (!response.ok)
    throw new Error(`Failed to fetch WASM ZIP: ${response.status}`);

  const buffer = Buffer.from(await response.arrayBuffer());
  console.error(
    `[openscad-server] ZIP downloaded: ${(buffer.length / 1024 / 1024).toFixed(1)} MB`,
  );

  const entries = parseZipEntries(buffer);
  const jsEntry = entries.find((e) => e.filename.endsWith("openscad.js"));
  const wasmEntry = entries.find((e) => e.filename.endsWith("openscad.wasm"));

  if (!jsEntry) throw new Error("openscad.js not found in ZIP");
  if (!wasmEntry) throw new Error("openscad.wasm not found in ZIP");

  const jsData = decompressEntry(jsEntry);
  const wasmData = decompressEntry(wasmEntry);

  console.error(
    `[openscad-server] Extracted: openscad.js (${(jsData.length / 1024).toFixed(0)} KB), openscad.wasm (${(wasmData.length / 1024 / 1024).toFixed(1)} MB)`,
  );

  wasmCache = {
    openscadJs: jsData.toString("base64"),
    openscadWasm: wasmData.toString("base64"),
  };
  return wasmCache;
}

// =============================================================================
// Server Factory
// =============================================================================

/**
 * Creates a new MCP server instance with tools and resources registered.
 */
export function createServer(): McpServer {
  const server = new McpServer({
    name: "OpenSCAD Server",
    version: "1.0.0",
  });

  // CSP configuration: only model-viewer CDN needed (WASM fetched server-side)
  const cspMeta = {
    ui: {
      csp: {
        resourceDomains: ["https://ajax.googleapis.com"],
      },
    },
  };

  // Internal tool for the UI to fetch WASM files (avoids CORS issues)
  server.tool(
    "_openscad_get_wasm",
    "Internal: fetches OpenSCAD WASM files for the viewer UI. Do not call directly.",
    {},
    async (): Promise<CallToolResult> => {
      const wasm = await fetchWasmFiles();
      return {
        content: [{ type: "text", text: JSON.stringify(wasm) }],
      };
    },
  );

  // Register the render-openscad tool with UI metadata
  registerAppTool(
    server,
    "render_openscad",
    {
      title: "Render OpenSCAD",
      description: TOOL_DESCRIPTION,
      inputSchema: z.object({
        code: z
          .string()
          .default(
            [
              "// Rounded cube with spherical cutout",
              "$fn = 64;",
              "",
              "difference() {",
              "  minkowski() {",
              "    cube([20, 20, 20], center=true);",
              "    sphere(r=2);",
              "  }",
              "  sphere(r=14);",
              "  // Window holes",
              "  for (a = [0, 90, 180, 270])",
              "    rotate([0, 0, a])",
              "      translate([0, 14, 0])",
              "        cylinder(h=10, r=4, center=true);",
              "}",
            ].join("\n"),
          )
          .describe("OpenSCAD source code to render"),
        features: z
          .array(z.string())
          .optional()
          .default(["manifold"])
          .describe(
            "OpenSCAD features to enable (default: ['manifold'] for fast geometry kernel)",
          ),
      }),
      _meta: { ui: { resourceUri: RESOURCE_URI } },
    },
    async ({ code, features }): Promise<CallToolResult> => {
      return {
        content: [
          {
            type: "text",
            text: `Rendering OpenSCAD model (${code.length} chars, features: ${features.join(", ")})`,
          },
        ],
        structuredContent: {
          code,
          features,
        },
      };
    },
  );

  // Register the resource which returns the bundled HTML/JavaScript for the UI
  registerAppResource(
    server,
    RESOURCE_URI,
    RESOURCE_URI,
    { mimeType: RESOURCE_MIME_TYPE },
    async (): Promise<ReadResourceResult> => {
      const html = await fs.readFile(
        path.join(DIST_DIR, "mcp-app.html"),
        "utf-8",
      );

      return {
        contents: [
          {
            uri: RESOURCE_URI,
            mimeType: RESOURCE_MIME_TYPE,
            text: html,
            _meta: cspMeta,
          },
        ],
      };
    },
  );

  return server;
}
