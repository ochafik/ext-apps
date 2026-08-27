/**
 * Zod schemas for the annotation objects accepted by the widget's
 * `add_annotations` / `update_annotations` tools.
 *
 * These mirror the TS interfaces in ./pdf-annotations.ts (one variant per
 * `type`, discriminated on that field) so the JSON Schema advertised via
 * `tools/list` spells out exactly which fields each annotation kind takes
 * (e.g. a stamp needs `label`, not `content`). Hosts that surface widget
 * tools to a model only see that schema — a loose `record<string, any>`
 * left the model guessing field names and silently producing empty
 * annotations.
 *
 * `imported` annotations are intentionally absent: they are created by
 * the viewer when loading a PDF and cannot be authored via the tools.
 */

import { z } from "zod";
import type { PdfAnnotationDef } from "./pdf-annotations.js";
import type { PdfAnnotationPatch } from "./commands.js";

const COORDS_NOTE =
  "PDF points (1pt = 1/72in), origin at the page's TOP-LEFT corner, y increases downward";

const id = z
  .string()
  .min(1)
  .describe(
    "Unique annotation id (any string). Reuse it with update_annotations / remove_annotations.",
  );
const page = z.number().int().min(1).describe("Page number (1-indexed)");
const color = z
  .string()
  .optional()
  .describe('Stroke/text color as a CSS color (e.g. "#ff0000", "red")');
const fillColor = z
  .string()
  .optional()
  .describe("Fill color as a CSS color (omit for no fill)");
const rotation = z
  .number()
  .optional()
  .describe("Rotation in degrees, clockwise (default 0)");
const x = z.number().describe(`Left edge, in ${COORDS_NOTE}`);
const y = z.number().describe(`Top edge, in ${COORDS_NOTE}`);
const width = z.number().positive().describe("Width in PDF points");
const height = z.number().positive().describe("Height in PDF points");

const RectSchema = z
  .object({ x, y, width, height })
  .describe(`A rectangle on the page (${COORDS_NOTE})`);

const rects = z
  .array(RectSchema)
  .min(1)
  .describe(
    "Regions to mark, one per text line/box. Prefer the highlight_text tool to locate text by content.",
  );

export const HighlightAnnotationSchema = z.object({
  id,
  page,
  type: z.literal("highlight"),
  rects,
  color,
  content: z.string().optional().describe("Tooltip/note text"),
});

export const UnderlineAnnotationSchema = z.object({
  id,
  page,
  type: z.literal("underline"),
  rects,
  color,
});

export const StrikethroughAnnotationSchema = z.object({
  id,
  page,
  type: z.literal("strikethrough"),
  rects,
  color,
});

export const NoteAnnotationSchema = z.object({
  id,
  page,
  type: z.literal("note"),
  x,
  y,
  content: z.string().describe("Note text (shown in a popup)"),
  color,
});

export const RectangleAnnotationSchema = z.object({
  id,
  page,
  type: z.literal("rectangle"),
  x,
  y,
  width,
  height,
  color,
  fillColor,
  rotation,
});

export const CircleAnnotationSchema = z.object({
  id,
  page,
  type: z.literal("circle"),
  x,
  y,
  width,
  height,
  color,
  fillColor,
});

export const LineAnnotationSchema = z.object({
  id,
  page,
  type: z.literal("line"),
  x1: z.number().describe(`Start x, in ${COORDS_NOTE}`),
  y1: z.number().describe(`Start y, in ${COORDS_NOTE}`),
  x2: z.number().describe("End x"),
  y2: z.number().describe("End y"),
  color,
});

export const FreetextAnnotationSchema = z.object({
  id,
  page,
  type: z.literal("freetext"),
  x,
  y,
  content: z.string().describe("Text to draw on the page"),
  fontSize: z.number().positive().optional().describe("Font size in points"),
  color,
});

export const StampAnnotationSchema = z.object({
  id,
  page,
  type: z.literal("stamp"),
  x,
  y,
  label: z
    .string()
    .min(1)
    .describe('Stamp text, e.g. "APPROVED", "DRAFT", "REVIEWED"'),
  color,
  rotation,
});

export const ImageAnnotationSchema = z.object({
  id,
  page,
  type: z.literal("image"),
  x,
  y,
  width,
  height,
  imageData: z
    .string()
    .optional()
    .describe("Base64-encoded image bytes (no data: prefix)"),
  imageUrl: z
    .string()
    .optional()
    .describe("HTTPS URL of the image (alternative to imageData)"),
  mimeType: z
    .string()
    .optional()
    .describe('Image MIME type, e.g. "image/png" (default image/png)'),
  rotation,
  aspect: z
    .enum(["preserve", "ignore"])
    .optional()
    .describe(
      "Whether to preserve the image's aspect ratio (default preserve)",
    ),
});

/** Every annotation kind a model can author, discriminated on `type`. */
export const PdfAnnotationDefSchema = z.discriminatedUnion("type", [
  HighlightAnnotationSchema,
  UnderlineAnnotationSchema,
  StrikethroughAnnotationSchema,
  NoteAnnotationSchema,
  RectangleAnnotationSchema,
  CircleAnnotationSchema,
  LineAnnotationSchema,
  FreetextAnnotationSchema,
  StampAnnotationSchema,
  ImageAnnotationSchema,
]);

/** Same variants with every field optional except `id` and `type`. */
export const PdfAnnotationPatchSchema = z.discriminatedUnion("type", [
  HighlightAnnotationSchema.partial().required({ id: true, type: true }),
  UnderlineAnnotationSchema.partial().required({ id: true, type: true }),
  StrikethroughAnnotationSchema.partial().required({ id: true, type: true }),
  NoteAnnotationSchema.partial().required({ id: true, type: true }),
  RectangleAnnotationSchema.partial().required({ id: true, type: true }),
  CircleAnnotationSchema.partial().required({ id: true, type: true }),
  LineAnnotationSchema.partial().required({ id: true, type: true }),
  FreetextAnnotationSchema.partial().required({ id: true, type: true }),
  StampAnnotationSchema.partial().required({ id: true, type: true }),
  ImageAnnotationSchema.partial().required({ id: true, type: true }),
]);

// Compile-time guards: the schemas must stay in sync with the TS types the
// viewer actually consumes (pdf-annotations.ts / commands.ts).
type AuthorableDef = Exclude<PdfAnnotationDef, { type: "imported" }>;
export type PdfAnnotationInput = z.infer<typeof PdfAnnotationDefSchema>;
export type PdfAnnotationPatchInput = z.infer<typeof PdfAnnotationPatchSchema>;

const _defToType: (d: PdfAnnotationInput) => AuthorableDef = (d) => d;
const _typeToDef: (d: AuthorableDef) => PdfAnnotationInput = (d) => d;
const _patchToType: (p: PdfAnnotationPatchInput) => PdfAnnotationPatch = (p) =>
  p;
void _defToType;
void _typeToDef;
void _patchToType;
