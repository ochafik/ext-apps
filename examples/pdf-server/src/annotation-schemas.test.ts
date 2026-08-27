import { describe, it, expect } from "bun:test";
import { z } from "zod";
import {
  PdfAnnotationDefSchema,
  PdfAnnotationPatchSchema,
} from "./annotation-schemas";

describe("PdfAnnotationDefSchema", () => {
  it("accepts a stamp with a label", () => {
    const result = PdfAnnotationDefSchema.safeParse({
      id: "s1",
      type: "stamp",
      page: 1,
      x: 300,
      y: 400,
      label: "REVIEWED",
      color: "green",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a stamp that uses `content` instead of `label`", () => {
    // This is what a model guessed when the schema only said
    // "type-specific fields (x, y, ..., content, etc.)".
    const result = PdfAnnotationDefSchema.safeParse({
      id: "s1",
      type: "stamp",
      page: 1,
      x: 300,
      y: 400,
      content: "REVIEWED",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((i) => i.path.join("."))).toContain(
        "label",
      );
    }
  });

  it("rejects unknown annotation types", () => {
    const result = PdfAnnotationDefSchema.safeParse({
      id: "x",
      type: "watermark",
      page: 1,
    });
    expect(result.success).toBe(false);
  });

  it("rejects viewer-only `imported` annotations", () => {
    const result = PdfAnnotationDefSchema.safeParse({
      id: "i",
      type: "imported",
      page: 1,
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      pdfjsId: "118R",
      subtype: "Ink",
    });
    expect(result.success).toBe(false);
  });

  it("requires rects for highlight-style annotations", () => {
    for (const type of ["highlight", "underline", "strikethrough"]) {
      const missing = PdfAnnotationDefSchema.safeParse({
        id: "h",
        type,
        page: 2,
      });
      expect(missing.success).toBe(false);
      const ok = PdfAnnotationDefSchema.safeParse({
        id: "h",
        type,
        page: 2,
        rects: [{ x: 72, y: 100, width: 200, height: 12 }],
      });
      expect(ok.success).toBe(true);
    }
  });

  it("accepts every authorable type with its documented fields", () => {
    const defs = [
      { id: "n", type: "note", page: 1, x: 1, y: 2, content: "hi" },
      {
        id: "r",
        type: "rectangle",
        page: 1,
        x: 1,
        y: 2,
        width: 3,
        height: 4,
        fillColor: "#eee",
        rotation: 45,
      },
      { id: "c", type: "circle", page: 1, x: 1, y: 2, width: 3, height: 4 },
      { id: "l", type: "line", page: 1, x1: 0, y1: 0, x2: 10, y2: 10 },
      { id: "f", type: "freetext", page: 1, x: 1, y: 2, content: "text" },
      {
        id: "i",
        type: "image",
        page: 1,
        x: 1,
        y: 2,
        width: 3,
        height: 4,
        imageUrl: "https://example.com/sig.png",
        aspect: "preserve",
      },
    ];
    for (const def of defs) {
      const result = PdfAnnotationDefSchema.safeParse(def);
      expect(result.success, `type=${def.type}`).toBe(true);
    }
  });
});

describe("PdfAnnotationPatchSchema", () => {
  it("accepts id + type only", () => {
    expect(
      PdfAnnotationPatchSchema.safeParse({ id: "s1", type: "stamp" }).success,
    ).toBe(true);
  });

  it("accepts partial type-specific fields", () => {
    expect(
      PdfAnnotationPatchSchema.safeParse({
        id: "s1",
        type: "stamp",
        label: "APPROVED",
      }).success,
    ).toBe(true);
  });

  it("still requires id and a known type", () => {
    expect(PdfAnnotationPatchSchema.safeParse({ type: "stamp" }).success).toBe(
      false,
    );
    expect(
      PdfAnnotationPatchSchema.safeParse({ id: "s1", type: "nope" }).success,
    ).toBe(false);
  });
});

describe("advertised JSON Schema", () => {
  // Hosts expose widget tools to the model using the JSON Schema derived
  // from the zod schema, so the field names must survive conversion.
  const json = JSON.stringify(
    z.toJSONSchema(z.object({ annotations: z.array(PdfAnnotationDefSchema) })),
  );

  it("names the stamp label field", () => {
    expect(json).toContain('"label"');
    expect(json).toContain("REVIEWED");
  });

  it("lists one variant per annotation type", () => {
    for (const type of [
      "highlight",
      "underline",
      "strikethrough",
      "note",
      "rectangle",
      "circle",
      "line",
      "freetext",
      "stamp",
      "image",
    ]) {
      expect(json).toContain(`"const":"${type}"`);
    }
    expect(json).not.toContain('"imported"');
  });

  it("documents the coordinate system", () => {
    expect(json).toContain("TOP-LEFT");
  });
});
