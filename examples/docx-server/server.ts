/**
 * DOCX MCP Server
 *
 * An MCP server that displays DOCX files in an interactive viewer.
 * Uses mammoth.js to convert DOCX to HTML for rendering.
 * Supports local files passed via CLI args.
 *
 * Tools:
 * - list_documents: List available DOCX files
 * - display_docx: Show interactive DOCX viewer
 * - read_docx_content: Read DOCX content as HTML + text (used by viewer)
 */

import { randomUUID } from "crypto";
import fs from "node:fs";
import path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import type {
  CallToolResult,
  ReadResourceResult,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import mammoth from "mammoth";

// =============================================================================
// Configuration
// =============================================================================

export const RESOURCE_URI = "ui://docx-viewer/mcp-app.html";
export const SAMPLE_URL = "sample://demo.docx";

/** Allowed local file paths (populated from CLI args) */
export const allowedLocalFiles = new Set<string>();

// Works both from source (server.ts) and compiled (dist/server.js)
const DIST_DIR = import.meta.filename.endsWith(".ts")
  ? path.join(import.meta.dirname, "dist")
  : import.meta.dirname;

// =============================================================================
// Built-in Sample Document
// =============================================================================

/**
 * Minimal valid DOCX file for demo purposes.
 * A DOCX is a ZIP archive containing XML files. This generates one on the fly
 * using a pre-built base64 template of a simple document.
 */
let sampleDocxPath: string | null = null;

function getSampleDocxPath(): string {
  if (sampleDocxPath && fs.existsSync(sampleDocxPath)) {
    return sampleDocxPath;
  }
  // Create a temp directory for the sample
  const tmpDir = path.join(import.meta.dirname, ".tmp");
  if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir, { recursive: true });
  }
  sampleDocxPath = path.join(tmpDir, "sample.docx");
  // Write sample DOCX if not exists
  if (!fs.existsSync(sampleDocxPath)) {
    createSampleDocx(sampleDocxPath);
  }
  return sampleDocxPath;
}

function createSampleDocx(outputPath: string): void {
  // Use mammoth in reverse isn't possible, so we create a minimal DOCX
  // using the ZIP format directly with JSZip-compatible approach.
  // A DOCX is a ZIP with specific XML files.
  const { createDocxZip } = createMinimalDocx();
  fs.writeFileSync(outputPath, createDocxZip);
}

/**
 * Create a minimal DOCX file as a Buffer.
 * DOCX = ZIP archive with [Content_Types].xml, _rels/.rels, word/document.xml, word/_rels/document.xml.rels
 */
function createMinimalDocx(): { createDocxZip: Buffer } {
  // We'll build the ZIP manually using Node's zlib
  const { execSync } = require("child_process");

  const tmpDir = fs.mkdtempSync(path.join(import.meta.dirname, ".tmp-docx-"));

  try {
    // Create DOCX structure
    fs.mkdirSync(path.join(tmpDir, "_rels"), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, "word", "_rels"), { recursive: true });

    fs.writeFileSync(
      path.join(tmpDir, "[Content_Types].xml"),
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`,
    );

    fs.writeFileSync(
      path.join(tmpDir, "_rels", ".rels"),
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`,
    );

    fs.writeFileSync(
      path.join(tmpDir, "word", "_rels", "document.xml.rels"),
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
</Relationships>`,
    );

    const body = `
  <w:body>
    <w:p><w:pPr><w:pStyle w:val="Title"/></w:pPr><w:r><w:t>Sample Document</w:t></w:r></w:p>
    <w:p><w:r><w:t>This is a sample DOCX file for testing the MCP DOCX Viewer. It demonstrates basic document rendering capabilities.</w:t></w:r></w:p>
    <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Introduction</w:t></w:r></w:p>
    <w:p><w:r><w:t>The DOCX viewer converts Word documents to HTML using mammoth.js, preserving headings, paragraphs, lists, tables, and basic formatting.</w:t></w:r></w:p>
    <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Features</w:t></w:r></w:p>
    <w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>Rich text rendering with headings and paragraphs</w:t></w:r></w:p>
    <w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>Bold</w:t></w:r><w:r><w:t> and </w:t></w:r><w:r><w:rPr><w:i/></w:rPr><w:t>italic</w:t></w:r><w:r><w:t> text formatting</w:t></w:r></w:p>
    <w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>Bulleted and numbered lists</w:t></w:r></w:p>
    <w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>Table support</w:t></w:r></w:p>
    <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Table Example</w:t></w:r></w:p>
    <w:tbl>
      <w:tblPr><w:tblBorders>
        <w:top w:val="single" w:sz="4"/><w:left w:val="single" w:sz="4"/>
        <w:bottom w:val="single" w:sz="4"/><w:right w:val="single" w:sz="4"/>
        <w:insideH w:val="single" w:sz="4"/><w:insideV w:val="single" w:sz="4"/>
      </w:tblBorders></w:tblPr>
      <w:tr><w:tc><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Name</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Role</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Status</w:t></w:r></w:p></w:tc></w:tr>
      <w:tr><w:tc><w:p><w:r><w:t>Alice</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Engineer</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Active</w:t></w:r></w:p></w:tc></w:tr>
      <w:tr><w:tc><w:p><w:r><w:t>Bob</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Designer</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Active</w:t></w:r></w:p></w:tc></w:tr>
      <w:tr><w:tc><w:p><w:r><w:t>Charlie</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Manager</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>On Leave</w:t></w:r></w:p></w:tc></w:tr>
    </w:tbl>
    <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Conclusion</w:t></w:r></w:p>
    <w:p><w:r><w:t>This demonstrates the core rendering capabilities of the DOCX viewer MCP app. Real-world documents with complex formatting, images, and styles are also supported through mammoth.js conversion.</w:t></w:r></w:p>
  </w:body>`;

    fs.writeFileSync(
      path.join(tmpDir, "word", "document.xml"),
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas"
  xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"
  xmlns:o="urn:schemas-microsoft-com:office:office"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
  xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"
  xmlns:v="urn:schemas-microsoft-com:vml"
  xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
  xmlns:w10="urn:schemas-microsoft-com:office:word"
  xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"
  xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup"
  xmlns:wpi="http://schemas.microsoft.com/office/word/2010/wordprocessingInk"
  xmlns:wne="http://schemas.microsoft.com/office/word/2006/wordml"
  xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"
  mc:Ignorable="w14 wp14">${body}
</w:document>`,
    );

    // Create numbering.xml for lists
    fs.writeFileSync(
      path.join(tmpDir, "word", "numbering.xml"),
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:abstractNum w:abstractNumId="0">
    <w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/><w:lvlText w:val="\u2022"/></w:lvl>
  </w:abstractNum>
  <w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>
</w:numbering>`,
    );

    // Update Content_Types to include numbering
    fs.writeFileSync(
      path.join(tmpDir, "[Content_Types].xml"),
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
</Types>`,
    );

    // Update document rels to reference numbering
    fs.writeFileSync(
      path.join(tmpDir, "word", "_rels", "document.xml.rels"),
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>
</Relationships>`,
    );

    // Create ZIP using the system zip command
    execSync(`cd "${tmpDir}" && zip -r docx.zip . -x ".*"`, {
      stdio: "pipe",
    });
    const zipBuffer = fs.readFileSync(path.join(tmpDir, "docx.zip"));
    return { createDocxZip: zipBuffer };
  } finally {
    // Cleanup temp directory
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

// =============================================================================
// URL Validation & Helpers
// =============================================================================

export function isSampleUrl(url: string): boolean {
  return url === SAMPLE_URL;
}

export function isFileUrl(url: string): boolean {
  return url.startsWith("file://");
}

export function fileUrlToPath(fileUrl: string): string {
  return decodeURIComponent(fileUrl.replace("file://", ""));
}

export function pathToFileUrl(filePath: string): string {
  const absolutePath = path.resolve(filePath);
  return `file://${encodeURIComponent(absolutePath).replace(/%2F/g, "/")}`;
}

export function validateUrl(url: string): { valid: boolean; error?: string } {
  if (isSampleUrl(url)) {
    return { valid: true };
  }

  if (isFileUrl(url)) {
    const filePath = fileUrlToPath(url);
    if (!allowedLocalFiles.has(filePath)) {
      return {
        valid: false,
        error: `Local file not in allowed list: ${filePath}. Pass the file path as a CLI argument to allow it.`,
      };
    }
    if (!fs.existsSync(filePath)) {
      return { valid: false, error: `File not found: ${filePath}` };
    }
    return { valid: true };
  }

  return { valid: false, error: `Only local file:// URLs are supported. Pass DOCX file paths as CLI arguments.` };
}

// =============================================================================
// DOCX Processing
// =============================================================================

async function readDocxBytes(url: string): Promise<Buffer> {
  if (isSampleUrl(url)) {
    const samplePath = getSampleDocxPath();
    return fs.promises.readFile(samplePath);
  }
  if (isFileUrl(url)) {
    const filePath = fileUrlToPath(url);
    return fs.promises.readFile(filePath);
  }
  throw new Error("Only local file:// and sample:// URLs are supported");
}

async function convertDocxToHtml(
  docxBuffer: Buffer,
): Promise<{ html: string; text: string; messages: string[] }> {
  const result = await mammoth.convertToHtml({ buffer: docxBuffer });
  const textResult = await mammoth.extractRawText({ buffer: docxBuffer });
  return {
    html: result.value,
    text: textResult.value,
    messages: result.messages.map((m) => `${m.type}: ${m.message}`),
  };
}

// =============================================================================
// MCP Server Factory
// =============================================================================

export function createServer(): McpServer {
  const server = new McpServer({ name: "DOCX Server", version: "1.0.0" });

  // Tool: list_documents - List available DOCX files
  server.tool(
    "list_documents",
    "List available DOCX files that can be displayed",
    {},
    async (): Promise<CallToolResult> => {
      const docs: Array<{ url: string; name: string }> = [
        { url: SAMPLE_URL, name: "Sample Document (built-in demo)" },
      ];

      for (const filePath of allowedLocalFiles) {
        docs.push({
          url: pathToFileUrl(filePath),
          name: path.basename(filePath),
        });
      }

      const text = `Available documents:\n${docs.map((d) => `- ${d.name} (${d.url})`).join("\n")}`;

      return {
        content: [{ type: "text", text }],
        structuredContent: {
          documents: docs,
        },
      };
    },
  );

  // Tool: read_docx_content (app-only) - Convert DOCX to HTML
  registerAppTool(
    server,
    "read_docx_content",
    {
      title: "Read DOCX Content",
      description: "Read a DOCX file and return its content as HTML and plain text",
      inputSchema: {
        url: z.string().describe("DOCX file URL"),
      },
      outputSchema: z.object({
        url: z.string(),
        html: z.string().describe("HTML representation of the document"),
        text: z.string().describe("Plain text content"),
        messages: z.array(z.string()).describe("Conversion warnings"),
      }),
      _meta: { ui: { visibility: ["app"] } },
    },
    async ({ url }): Promise<CallToolResult> => {
      const validation = validateUrl(url);
      if (!validation.valid) {
        return {
          content: [{ type: "text", text: validation.error! }],
          isError: true,
        };
      }

      try {
        const docxBuffer = await readDocxBytes(url);
        const { html, text, messages } = await convertDocxToHtml(docxBuffer);

        return {
          content: [
            {
              type: "text",
              text: `Document converted: ${text.length} chars text, ${html.length} chars HTML`,
            },
          ],
          structuredContent: {
            url,
            html,
            text,
            messages,
          },
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text",
              text: `Error: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  // Tool: display_docx - Show interactive viewer
  registerAppTool(
    server,
    "display_docx",
    {
      title: "Display DOCX",
      description: `Display an interactive DOCX viewer. Accepts local files explicitly added to the server (use list_documents to see available files).`,
      inputSchema: {
        url: z.string().default(SAMPLE_URL).describe("DOCX file URL"),
      },
      outputSchema: z.object({
        url: z.string(),
      }),
      _meta: { ui: { resourceUri: RESOURCE_URI } },
    },
    async ({ url }): Promise<CallToolResult> => {
      const validation = validateUrl(url);

      if (!validation.valid) {
        return {
          content: [{ type: "text", text: validation.error! }],
          isError: true,
        };
      }

      return {
        content: [{ type: "text", text: `Displaying DOCX: ${url}` }],
        structuredContent: {
          url,
        },
        _meta: {
          viewUUID: randomUUID(),
        },
      };
    },
  );

  // Resource: UI HTML
  registerAppResource(
    server,
    RESOURCE_URI,
    RESOURCE_URI,
    { mimeType: RESOURCE_MIME_TYPE },
    async (): Promise<ReadResourceResult> => {
      const html = await fs.promises.readFile(
        path.join(DIST_DIR, "mcp-app.html"),
        "utf-8",
      );
      return {
        contents: [
          { uri: RESOURCE_URI, mimeType: RESOURCE_MIME_TYPE, text: html },
        ],
      };
    },
  );

  return server;
}
