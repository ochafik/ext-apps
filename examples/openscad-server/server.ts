/**
 * OpenSCAD MCP Server
 *
 * Provides a tool for rendering OpenSCAD code as interactive 3D models.
 * The WASM engine runs client-side; this server just passes code to the UI.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type {
  CallToolResult,
  ReadResourceResult,
} from "@modelcontextprotocol/sdk/types.js";
import fs from "node:fs/promises";
import path from "node:path";
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

/**
 * Creates a new MCP server instance with tools and resources registered.
 */
export function createServer(): McpServer {
  const server = new McpServer({
    name: "OpenSCAD Server",
    version: "1.0.0",
  });

  // CSP configuration for external resources
  const cspMeta = {
    ui: {
      csp: {
        connectDomains: ["https://files.openscad.org"],
        resourceDomains: [
          "https://files.openscad.org",
          "https://ajax.googleapis.com",
        ],
      },
    },
  };

  // Register the render-openscad tool with UI metadata
  registerAppTool(
    server,
    "render_openscad",
    {
      title: "Render OpenSCAD",
      description: TOOL_DESCRIPTION,
      inputSchema: z.object({
        code: z.string().describe("OpenSCAD source code to render"),
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
