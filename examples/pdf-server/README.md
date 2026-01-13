# PDF Server

An MCP server that indexes and serves PDF files from local directories and arxiv URLs, with an interactive viewer UI.

## Features

- **Local PDF indexing**: Recursively scans directories for PDF files
- **arxiv integration**: Fetches PDFs and metadata from arxiv URLs
- **Interactive viewer**: Single-page display with zoom, navigation, text selection
- **Chunked text extraction**: Paginated text loading for large documents
- **Auto-resize**: Viewer adjusts height to fit content without scrolling

## Protocol Features Demonstrated

This example showcases several MCP Apps SDK features:

| Feature | Usage |
|---------|-------|
| **App Tool with UI** | `view_pdf` opens an interactive PDF viewer |
| **App-only Tools** | `read_pdf_text` is hidden from model, used internally by the viewer |
| **Resources** | `pdfs://index/CLAUDE.md` provides a markdown index of all PDFs |
| **Resource Templates** | `pdfs://metadata/{pdfId}` and `pdfs://content/{pdfId}` |
| **Binary Resource Content** | PDF files served as base64 blobs |
| **structuredContent** | Tool results include typed data for the UI |
| **sendSizeChanged** | Viewer requests height changes to fit content |
| **requestDisplayMode** | Fullscreen toggle support |
| **Model Context Updates** | Current page text sent to model context |
| **Host Style Variables** | Themed UI using CSS custom properties |

## CLI Usage

```bash
# Serve PDFs from a local folder
bun examples/pdf-server/server.ts ./papers/

# Serve a specific PDF file
bun examples/pdf-server/server.ts ./thesis.pdf

# Serve from multiple sources
bun examples/pdf-server/server.ts ./docs/ ./presentations/

# Fetch and serve an arxiv paper
bun examples/pdf-server/server.ts https://arxiv.org/pdf/2301.12345.pdf

# Mix local files and arxiv URLs
bun examples/pdf-server/server.ts ./papers/ https://arxiv.org/pdf/2401.00001.pdf

# Run in stdio mode for MCP clients
bun examples/pdf-server/server.ts --stdio ./docs/
```

**Default behavior**: When run without arguments from the examples server, it loads a sample arxiv paper.

## Tools

### `view_pdf`

Opens an interactive PDF viewer with navigation controls.

**Input:**
- `pdfId` (optional): ID from `list_pdfs`
- `url` (optional): arxiv URL to load
- `page` (optional): Starting page number (default: 1)

### `list_pdfs`

Lists all indexed PDFs with metadata.

**Input:**
- `folder` (optional): Filter by folder path

### `read_pdf_text` (app-only)

Extracts text from a PDF with chunked pagination. Hidden from the model, used internally by the viewer.

**Input:**
- `pdfId`: PDF identifier
- `startPage` (optional): Page to start from (1-based)
- `maxBytes` (optional): Maximum bytes per chunk

## Resources

- `pdfs://index/CLAUDE.md` - Markdown index of all loaded PDFs
- `pdfs://metadata/{pdfId}` - JSON metadata for a specific PDF
- `pdfs://content/{pdfId}` - Binary PDF content (base64 blob)

## Viewer Controls

- **Navigation**: Arrow buttons, keyboard arrows, Page Up/Down
- **Page input**: Type page number directly
- **Zoom**: +/- buttons, keyboard +/-
- **Fullscreen**: Toggle button, Escape to exit
- **Download**: Download the PDF file
- **Horizontal scroll**: Swipe left/right to change pages
- **Text selection**: Select and copy text from the PDF

## Architecture

```
server.ts           # MCP server with tools and resources
├── src/
│   ├── types.ts        # Zod schemas for inputs/outputs
│   ├── pdf-indexer.ts  # Directory scanning, index building
│   ├── pdf-loader.ts   # pdfjs-dist wrapper, text extraction
│   ├── arxiv.ts        # arxiv URL parsing, metadata fetching
│   ├── claude-md.ts    # CLAUDE.md markdown generator
│   └── mcp-app.ts      # Interactive viewer UI (vanilla JS)
```

## Dependencies

- `pdfjs-dist`: PDF rendering and text extraction
- `@modelcontextprotocol/ext-apps`: MCP Apps SDK
- `@modelcontextprotocol/sdk`: MCP SDK
