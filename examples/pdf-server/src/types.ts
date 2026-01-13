/**
 * PDF Server Types - Simplified for didactic purposes
 */
import { z } from "zod";

// ============================================================================
// Core Types
// ============================================================================

export const PdfMetadataSchema = z.object({
  title: z.string().optional(),
  author: z.string().optional(),
  pageCount: z.number(),
  fileSizeBytes: z.number(),
});
export type PdfMetadata = z.infer<typeof PdfMetadataSchema>;

export const PdfEntrySchema = z.object({
  id: z.string(),
  url: z.string(),
  displayName: z.string(),
  metadata: PdfMetadataSchema,
});
export type PdfEntry = z.infer<typeof PdfEntrySchema>;

export const PdfIndexSchema = z.object({
  entries: z.array(PdfEntrySchema),
});
export type PdfIndex = z.infer<typeof PdfIndexSchema>;

// ============================================================================
// Chunked Loading (demonstrates size-limited tool responses)
// ============================================================================

/** Max bytes per response chunk */
export const MAX_CHUNK_BYTES = 500 * 1024; // 500KB

export const PdfTextChunkSchema = z.object({
  pdfId: z.string(),
  startPage: z.number(),
  endPage: z.number(),
  totalPages: z.number(),
  text: z.string(),
  hasMore: z.boolean(),
  nextStartPage: z.number().optional(),
});
export type PdfTextChunk = z.infer<typeof PdfTextChunkSchema>;

export const PdfBytesChunkSchema = z.object({
  pdfId: z.string(),
  bytes: z.string(), // base64
  offset: z.number(),
  byteCount: z.number(),
  totalBytes: z.number(),
  hasMore: z.boolean(),
});
export type PdfBytesChunk = z.infer<typeof PdfBytesChunkSchema>;

// ============================================================================
// Tool Inputs
// ============================================================================

export const ReadPdfTextInputSchema = z.object({
  pdfId: z.string().describe("PDF identifier"),
  startPage: z.number().min(1).default(1).describe("Start page (1-based)"),
  maxBytes: z.number().default(MAX_CHUNK_BYTES).describe("Max bytes to return"),
});
export type ReadPdfTextInput = z.infer<typeof ReadPdfTextInputSchema>;

export const ReadPdfBytesInputSchema = z.object({
  pdfId: z.string().describe("PDF identifier"),
  offset: z.number().min(0).default(0).describe("Byte offset"),
  byteCount: z.number().default(MAX_CHUNK_BYTES).describe("Bytes to read"),
});
export type ReadPdfBytesInput = z.infer<typeof ReadPdfBytesInputSchema>;
