# PDF Server

![Screenshot](screenshot.png)

An interactive PDF viewer using [PDF.js](https://mozilla.github.io/pdf.js/). Supports local files and remote URLs from academic sources (arxiv, biorxiv, zenodo, etc).

## MCP Client Configuration

Add to your MCP client configuration (stdio transport):

```json
{
  "mcpServers": {
    "pdf": {
      "command": "npx",
      "args": [
        "-y",
        "--silent",
        "--registry=https://registry.npmjs.org/",
        "@modelcontextprotocol/server-pdf",
        "--stdio"
      ]
    }
  }
}
```

## Usage

```bash
# Default: loads a sample arxiv paper
bun examples/pdf-server/main.ts

# Load local files
bun examples/pdf-server/main.ts ./docs/paper.pdf /path/to/thesis.pdf

# Load from URLs (arxiv, biorxiv, zenodo, etc)
bun examples/pdf-server/main.ts https://arxiv.org/pdf/2401.00001.pdf

# stdio mode for MCP clients
bun examples/pdf-server/main.ts --stdio ./papers/
```

## Tools

| Tool             | Visibility | Purpose                                  |
| ---------------- | ---------- | ---------------------------------------- |
| `list_pdfs`      | Model      | List available local files and origins   |
| `display_pdf`    | Model + UI | Display interactive viewer               |
| `read_pdf_bytes` | App only   | Stream PDF data in chunks (used by viewer) |

## Allowed Sources

- **Local files**: Must be passed as CLI arguments
- **Remote URLs**: arxiv.org, biorxiv.org, medrxiv.org, chemrxiv.org, zenodo.org, osf.io, hal.science, ssrn.com, and more

## What This Example Demonstrates

### 1. Chunked Data Loading

PDFs are streamed in chunks using HTTP Range requests:

```typescript
// Server: read_pdf_bytes returns chunks with pagination
{ bytes, offset, byteCount, totalBytes, hasMore }

// Client: loads chunks with progress
while (hasMore) {
  const chunk = await app.callServerTool("read_pdf_bytes", { url, offset });
  chunks.push(base64ToBytes(chunk.bytes));
  offset += chunk.byteCount;
}
```

### 2. Model Context Updates

The viewer keeps the model informed about the current page and selection:

```typescript
app.updateModelContext({
  content: [{
    type: "text",
    text: `PDF viewer | "${title}" | Current Page: ${page}/${total}\n\nPage content:\n${text}`
  }]
});
```

### 3. Display Modes

- **Inline mode**: Fits content, no scrolling
- **Fullscreen mode**: Fills screen with internal scrolling

### 4. View Persistence

Page position is saved per-widget using `viewUUID` and localStorage.

## Architecture

```
server.ts      # MCP server + tools
main.ts        # CLI entry point
src/
└── mcp-app.ts # Interactive viewer UI (PDF.js)
```

## Dependencies

- `pdfjs-dist`: PDF rendering (frontend only)
- `@modelcontextprotocol/ext-apps`: MCP Apps SDK
