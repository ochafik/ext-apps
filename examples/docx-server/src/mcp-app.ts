/**
 * DOCX Viewer MCP App
 *
 * Interactive DOCX viewer that renders documents as paginated HTML.
 * Uses CSS multi-column layout to split content into fixed-height pages.
 * - Page navigation (prev/next, page input, horizontal swipe)
 * - Zoom controls
 * - Full-text search with highlighting and navigation
 * - Fullscreen mode
 * - Text selection with model context updates
 */
import {
  App,
  type McpUiHostContext,
  applyDocumentTheme,
  applyHostStyleVariables,
} from "@modelcontextprotocol/ext-apps";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import "./global.css";
import "./mcp-app.css";

const MAX_MODEL_CONTEXT_LENGTH = 15000;
const PAGE_HEIGHT = 600; // Fixed page height in CSS px

const log = {
  info: console.log.bind(console, "[DOCX-VIEWER]"),
  error: console.error.bind(console, "[DOCX-VIEWER]"),
};

// State
let docUrl = "";
let docText = "";
let scale = 1.0;
let currentPage = 1;
let totalPages = 1;

// DOM Elements
const mainEl = document.querySelector(".main") as HTMLElement;
const loadingEl = document.getElementById("loading")!;
const loadingTextEl = document.getElementById("loading-text")!;
const errorEl = document.getElementById("error")!;
const errorMessageEl = document.getElementById("error-message")!;
const viewerEl = document.getElementById("viewer")!;
const titleEl = document.getElementById("doc-title")!;
const docContainerEl = document.getElementById("doc-container")!;
const docPageEl = document.getElementById("doc-page")!;
const docViewportEl = document.getElementById("doc-viewport")!;
const docContentEl = document.getElementById("doc-content")!;
const prevBtn = document.getElementById("prev-btn") as HTMLButtonElement;
const nextBtn = document.getElementById("next-btn") as HTMLButtonElement;
const pageInputEl = document.getElementById("page-input") as HTMLInputElement;
const totalPagesEl = document.getElementById("total-pages")!;
const zoomOutBtn = document.getElementById("zoom-out-btn") as HTMLButtonElement;
const zoomInBtn = document.getElementById("zoom-in-btn") as HTMLButtonElement;
const zoomLevelEl = document.getElementById("zoom-level")!;
const searchBtn = document.getElementById("search-btn") as HTMLButtonElement;
const fullscreenBtn = document.getElementById(
  "fullscreen-btn",
) as HTMLButtonElement;
const searchBarEl = document.getElementById("search-bar")!;
const searchInputEl = document.getElementById(
  "search-input",
) as HTMLInputElement;
const searchMatchCountEl = document.getElementById("search-match-count")!;
const searchPrevBtn = document.getElementById(
  "search-prev-btn",
) as HTMLButtonElement;
const searchNextBtn = document.getElementById(
  "search-next-btn",
) as HTMLButtonElement;
const searchCloseBtn = document.getElementById(
  "search-close-btn",
) as HTMLButtonElement;

// Search state
let searchOpen = false;
let searchQuery = "";
let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let highlightElements: HTMLElement[] = [];
let currentMatchIndex = -1;

let currentDisplayMode: "inline" | "fullscreen" = "inline";

// Original (unmodified) HTML from the server
let originalHtml = "";

// Create app instance - no autoResize, we control height via pagination
const app = new App(
  { name: "DOCX Viewer", version: "1.0.0" },
  {},
  { autoResize: false },
);

// =============================================================================
// UI State
// =============================================================================

function showLoading(text: string) {
  loadingTextEl.textContent = text;
  loadingEl.style.display = "flex";
  errorEl.style.display = "none";
  viewerEl.style.display = "none";
}

function showError(message: string) {
  errorMessageEl.textContent = message;
  loadingEl.style.display = "none";
  errorEl.style.display = "block";
  viewerEl.style.display = "none";
}

function showViewer() {
  loadingEl.style.display = "none";
  errorEl.style.display = "none";
  viewerEl.style.display = "flex";
}

function updateControls() {
  pageInputEl.value = String(currentPage);
  pageInputEl.max = String(totalPages);
  totalPagesEl.textContent = `of ${totalPages}`;
  prevBtn.disabled = currentPage <= 1;
  nextBtn.disabled = currentPage >= totalPages;
  zoomLevelEl.textContent = `${Math.round(scale * 100)}%`;
}

/**
 * Request the host to resize the app to fit the current page.
 * Scales the page height by the zoom factor so the app shrinks/grows with zoom.
 */
function requestFitToContent() {
  if (currentDisplayMode === "fullscreen") return;

  const toolbarEl = document.querySelector(".toolbar") as HTMLElement;
  if (!toolbarEl) return;

  const toolbarHeight = toolbarEl.offsetHeight;
  const containerPadding = 2 * 16; // 1rem top + 1rem bottom
  const BUFFER = 10;
  const scaledPageHeight = PAGE_HEIGHT * scale;
  const totalHeight =
    toolbarHeight + scaledPageHeight + containerPadding + BUFFER;

  app.sendSizeChanged({ height: totalHeight });
}

// =============================================================================
// Pagination via CSS Columns
// =============================================================================

/**
 * Set up CSS columns on docContentEl so that each "column" is one page.
 * We set a fixed height and use column-width = container width.
 * Then we translate horizontally to show the current page.
 */
function setupPagination() {
  // Reset transform so measurements are clean
  docContentEl.style.transform = "";
  docPageEl.style.transform = "";

  // The viewport width is the visible area for one page
  const viewportWidth = docViewportEl.clientWidth;
  if (viewportWidth <= 0) return;

  // Set viewport height and column dimensions
  docViewportEl.style.height = `${PAGE_HEIGHT}px`;
  docContentEl.style.height = `${PAGE_HEIGHT}px`;
  docContentEl.style.columnWidth = `${viewportWidth}px`;

  // Force layout before measuring scrollWidth
  void docContentEl.offsetHeight;

  // Calculate total pages from scrollWidth vs viewport width
  const scrollW = docContentEl.scrollWidth;
  totalPages = Math.max(1, Math.ceil(scrollW / viewportWidth));

  // Clamp current page
  if (currentPage > totalPages) currentPage = totalPages;

  // Apply zoom scale to the page container (like PDF re-renders at different scale)
  docPageEl.style.transform = scale === 1.0 ? "" : `scale(${scale})`;
  docPageEl.style.transformOrigin = "top center";

  showPage(currentPage);
  updateControls();
  requestFitToContent();
}

function showPage(page: number) {
  const viewportWidth = docViewportEl.clientWidth;
  if (viewportWidth <= 0) return;

  // Only translateX for pagination - zoom is on docPageEl
  const offset = -(page - 1) * viewportWidth;
  docContentEl.style.transform = `translateX(${offset}px)`;
}

// =============================================================================
// Navigation
// =============================================================================

function goToPage(page: number) {
  const target = Math.max(1, Math.min(page, totalPages));
  if (target !== currentPage) {
    currentPage = target;
    showPage(currentPage);
    updateControls();
    updateDocContext();
  }
  pageInputEl.value = String(currentPage);
}

function prevPage() {
  goToPage(currentPage - 1);
}

function nextPage() {
  goToPage(currentPage + 1);
}

// =============================================================================
// Zoom
// =============================================================================

function applyZoom() {
  // Re-paginate at new scale, then show current page
  setupPagination();
}

function zoomIn() {
  scale = Math.min(scale + 0.25, 3.0);
  applyZoom();
}

function zoomOut() {
  scale = Math.max(scale - 0.25, 0.5);
  applyZoom();
}

function resetZoom() {
  scale = 1.0;
  applyZoom();
}

// =============================================================================
// Search
// =============================================================================

function performSearch(query: string) {
  clearHighlights();
  searchQuery = query;
  currentMatchIndex = -1;

  if (!query || !originalHtml) {
    updateSearchUI();
    return;
  }

  // Restore original HTML, then inject highlight <mark> elements
  docContentEl.innerHTML = originalHtml;
  highlightElements = [];

  const lowerQuery = query.toLowerCase();
  const treeWalker = document.createTreeWalker(
    docContentEl,
    NodeFilter.SHOW_TEXT,
  );

  // Collect all text nodes first (modifying DOM during walk is unsafe)
  const textNodes: Text[] = [];
  let node: Text | null;
  while ((node = treeWalker.nextNode() as Text | null)) {
    textNodes.push(node);
  }

  for (const textNode of textNodes) {
    const text = textNode.nodeValue || "";
    const lowerText = text.toLowerCase();
    let idx = lowerText.indexOf(lowerQuery);
    if (idx === -1) continue;

    const parent = textNode.parentNode!;
    const frag = document.createDocumentFragment();
    let lastIdx = 0;

    while (idx !== -1) {
      if (idx > lastIdx) {
        frag.appendChild(document.createTextNode(text.slice(lastIdx, idx)));
      }
      const mark = document.createElement("mark");
      mark.className = "search-highlight";
      mark.textContent = text.slice(idx, idx + query.length);
      frag.appendChild(mark);
      highlightElements.push(mark);

      lastIdx = idx + query.length;
      idx = lowerText.indexOf(lowerQuery, lastIdx);
    }

    if (lastIdx < text.length) {
      frag.appendChild(document.createTextNode(text.slice(lastIdx)));
    }

    parent.replaceChild(frag, textNode);
  }

  // Re-paginate after DOM changes
  setupPagination();

  if (highlightElements.length > 0) {
    currentMatchIndex = 0;
    navigateToCurrentMatch();
  }

  updateSearchUI();
}

/**
 * Figure out which page a highlight element is on and navigate there.
 */
function getPageForElement(el: HTMLElement): number {
  const viewportWidth = docViewportEl.clientWidth;
  if (viewportWidth <= 0) return 1;
  const page = Math.floor(el.offsetLeft / viewportWidth) + 1;
  return Math.max(1, Math.min(page, totalPages));
}

function navigateToCurrentMatch() {
  for (const el of highlightElements) {
    el.classList.remove("current");
  }
  if (currentMatchIndex >= 0 && currentMatchIndex < highlightElements.length) {
    const current = highlightElements[currentMatchIndex];
    current.classList.add("current");
    const page = getPageForElement(current);
    if (page !== currentPage) {
      goToPage(page);
    }
  }
}

function clearHighlights() {
  if (highlightElements.length > 0 && originalHtml) {
    docContentEl.innerHTML = originalHtml;
    highlightElements = [];
    setupPagination();
  }
  currentMatchIndex = -1;
}

function updateSearchUI() {
  if (highlightElements.length === 0) {
    searchMatchCountEl.textContent = searchQuery ? "No matches" : "";
  } else {
    searchMatchCountEl.textContent = `${currentMatchIndex + 1} of ${highlightElements.length}`;
  }
  searchPrevBtn.disabled = highlightElements.length === 0;
  searchNextBtn.disabled = highlightElements.length === 0;
}

function openSearch() {
  if (searchOpen) {
    searchInputEl.focus();
    searchInputEl.select();
    return;
  }
  searchOpen = true;
  searchBarEl.style.display = "flex";
  searchInputEl.focus();
}

function closeSearch() {
  if (!searchOpen) return;
  searchOpen = false;
  searchBarEl.style.display = "none";
  searchQuery = "";
  searchInputEl.value = "";
  clearHighlights();
  updateSearchUI();
}

function goToNextMatch() {
  if (highlightElements.length === 0) return;
  currentMatchIndex = (currentMatchIndex + 1) % highlightElements.length;
  navigateToCurrentMatch();
  updateSearchUI();
}

function goToPrevMatch() {
  if (highlightElements.length === 0) return;
  currentMatchIndex =
    (currentMatchIndex - 1 + highlightElements.length) %
    highlightElements.length;
  navigateToCurrentMatch();
  updateSearchUI();
}

// =============================================================================
// Model Context
// =============================================================================

function updateDocContext() {
  if (!docText) return;

  try {
    const sel = window.getSelection();
    const selectedText = sel?.toString().replace(/\s+/g, " ").trim();

    const toolId = app.getHostContext()?.toolInfo?.id;
    const fileName = docUrl.split("/").pop() || "Document";
    const header = [
      `DOCX viewer${toolId ? ` (${toolId})` : ""}`,
      fileName,
      `Page: ${currentPage}/${totalPages}`,
    ].join(" | ");

    let content = docText;
    if (content.length > MAX_MODEL_CONTEXT_LENGTH) {
      content =
        content.slice(0, MAX_MODEL_CONTEXT_LENGTH) + "\n<truncated-content/>";
    }

    if (selectedText && selectedText.length > 2) {
      const idx = content.indexOf(selectedText);
      if (idx >= 0) {
        content =
          content.slice(0, idx) +
          `<doc-selection>${selectedText}</doc-selection>` +
          content.slice(idx + selectedText.length);
      }
    }

    const contextText = `${header}\n\n${content}`;
    app.updateModelContext({ content: [{ type: "text", text: contextText }] });
  } catch (err) {
    log.error("Error updating context:", err);
  }
}

// =============================================================================
// Fullscreen
// =============================================================================

async function toggleFullscreen() {
  const ctx = app.getHostContext();
  if (!ctx?.availableDisplayModes?.includes("fullscreen")) {
    log.info("Fullscreen not available");
    return;
  }

  const newMode = currentDisplayMode === "fullscreen" ? "inline" : "fullscreen";

  try {
    const result = await app.requestDisplayMode({ mode: newMode });
    currentDisplayMode = result.mode as "inline" | "fullscreen";
    updateFullscreenButton();
    if (currentDisplayMode === "inline") {
      requestFitToContent();
    }
  } catch (err) {
    log.error("Failed to change display mode:", err);
  }
}

function updateFullscreenButton() {
  fullscreenBtn.title =
    currentDisplayMode === "fullscreen" ? "Exit fullscreen" : "Fullscreen";
}

// =============================================================================
// Event Listeners
// =============================================================================

prevBtn.addEventListener("click", prevPage);
nextBtn.addEventListener("click", nextPage);
zoomOutBtn.addEventListener("click", zoomOut);
zoomInBtn.addEventListener("click", zoomIn);
searchBtn.addEventListener("click", () => {
  if (searchOpen) closeSearch();
  else openSearch();
});
fullscreenBtn.addEventListener("click", toggleFullscreen);
searchCloseBtn.addEventListener("click", closeSearch);
searchPrevBtn.addEventListener("click", goToPrevMatch);
searchNextBtn.addEventListener("click", goToNextMatch);

pageInputEl.addEventListener("change", () => {
  const page = parseInt(pageInputEl.value, 10);
  if (!isNaN(page)) {
    goToPage(page);
  } else {
    pageInputEl.value = String(currentPage);
  }
});

pageInputEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    pageInputEl.blur();
  }
});

// Search input events
searchInputEl.addEventListener("input", () => {
  if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(() => {
    performSearch(searchInputEl.value);
  }, 300);
});

searchInputEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    if (e.shiftKey) {
      goToPrevMatch();
    } else {
      goToNextMatch();
    }
  } else if (e.key === "Escape") {
    e.preventDefault();
    closeSearch();
  }
});

// Keyboard navigation
document.addEventListener("keydown", (e) => {
  // Ctrl/Cmd+F to open search
  if ((e.ctrlKey || e.metaKey) && e.key === "f") {
    e.preventDefault();
    openSearch();
    return;
  }

  if (document.activeElement === searchInputEl) return;
  if (document.activeElement === pageInputEl) return;

  // Ctrl/Cmd+0 to reset zoom
  if ((e.ctrlKey || e.metaKey) && e.key === "0") {
    resetZoom();
    e.preventDefault();
    return;
  }

  switch (e.key) {
    case "Escape":
      if (searchOpen) {
        closeSearch();
        e.preventDefault();
      } else if (currentDisplayMode === "fullscreen") {
        toggleFullscreen();
        e.preventDefault();
      }
      break;
    case "ArrowLeft":
    case "PageUp":
      prevPage();
      e.preventDefault();
      break;
    case "ArrowRight":
    case "PageDown":
    case " ":
      nextPage();
      e.preventDefault();
      break;
    case "+":
    case "=":
      zoomIn();
      e.preventDefault();
      break;
    case "-":
      zoomOut();
      e.preventDefault();
      break;
  }
});

// Horizontal scroll/swipe to change pages
let horizontalScrollAccumulator = 0;
const SCROLL_THRESHOLD = 50;

docContainerEl.addEventListener(
  "wheel",
  (event) => {
    const e = event as WheelEvent;
    if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;

    e.preventDefault();
    horizontalScrollAccumulator += e.deltaX;
    if (horizontalScrollAccumulator > SCROLL_THRESHOLD) {
      nextPage();
      horizontalScrollAccumulator = 0;
    } else if (horizontalScrollAccumulator < -SCROLL_THRESHOLD) {
      prevPage();
      horizontalScrollAccumulator = 0;
    }
  },
  { passive: false },
);

// Update context when text selection changes (debounced)
let selectionUpdateTimeout: ReturnType<typeof setTimeout> | null = null;
document.addEventListener("selectionchange", () => {
  if (selectionUpdateTimeout) clearTimeout(selectionUpdateTimeout);
  selectionUpdateTimeout = setTimeout(() => {
    const sel = window.getSelection();
    const text = sel?.toString().trim();
    if (text && text.length > 2) {
      log.info("Selection changed:", text.slice(0, 50));
      updateDocContext();
    }
  }, 300);
});

// =============================================================================
// Tool Result Handler
// =============================================================================

interface DocxToolResult {
  url: string;
}

interface DocxContent {
  url: string;
  html: string;
  text: string;
  messages: string[];
}

app.ontoolresult = async (result: CallToolResult) => {
  log.info("Received tool result:", result);

  const parsed = result.structuredContent as unknown as DocxToolResult | null;
  if (!parsed) {
    showError("Invalid tool result");
    return;
  }

  docUrl = parsed.url;

  const fileName = docUrl.split("/").pop() || "Document";
  titleEl.textContent = fileName;
  titleEl.title = docUrl;

  showLoading("Loading document...");

  try {
    const contentResult = await app.callServerTool({
      name: "read_docx_content",
      arguments: { url: docUrl },
    });

    if (contentResult.isError) {
      const errorText = contentResult.content
        ?.map((c) => ("text" in c ? c.text : ""))
        .join(" ");
      throw new Error(errorText || "Failed to read document");
    }

    const content = contentResult.structuredContent as unknown as DocxContent;
    if (!content) {
      throw new Error("No content returned from server");
    }

    docText = content.text;
    originalHtml = content.html;

    if (content.messages.length > 0) {
      log.info("Conversion messages:", content.messages);
    }

    // Render HTML content
    docContentEl.innerHTML = content.html;

    showViewer();

    // Set up pagination after content is in the DOM
    requestAnimationFrame(() => {
      setupPagination();
      updateDocContext();
    });

    log.info(`Document loaded: ${docText.length} chars`);
  } catch (err) {
    log.error("Error loading document:", err);
    showError(err instanceof Error ? err.message : String(err));
  }
};

app.onerror = (err) => {
  log.error("App error:", err);
  showError(err instanceof Error ? err.message : String(err));
};

// =============================================================================
// Host Context
// =============================================================================

function handleHostContextChanged(ctx: McpUiHostContext) {
  log.info("Host context changed:", ctx);

  if (ctx.theme) {
    applyDocumentTheme(ctx.theme);
  }

  if (ctx.styles?.variables) {
    applyHostStyleVariables(ctx.styles.variables);
  }

  if (ctx.safeAreaInsets) {
    mainEl.style.paddingTop = `${ctx.safeAreaInsets.top}px`;
    mainEl.style.paddingRight = `${ctx.safeAreaInsets.right}px`;
    mainEl.style.paddingBottom = `${ctx.safeAreaInsets.bottom}px`;
    mainEl.style.paddingLeft = `${ctx.safeAreaInsets.left}px`;
  }

  if (ctx.displayMode) {
    const wasFullscreen = currentDisplayMode === "fullscreen";
    currentDisplayMode = ctx.displayMode as "inline" | "fullscreen";
    const isFullscreen = currentDisplayMode === "fullscreen";
    mainEl.classList.toggle("fullscreen", isFullscreen);
    updateFullscreenButton();
    if (wasFullscreen && !isFullscreen) {
      requestFitToContent();
    }
  }
}

app.onhostcontextchanged = handleHostContextChanged;

// Connect to host
app.connect().then(() => {
  log.info("Connected to host");
  const ctx = app.getHostContext();
  if (ctx) {
    handleHostContextChanged(ctx);
  }
});
