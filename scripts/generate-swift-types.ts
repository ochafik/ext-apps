#!/usr/bin/env npx tsx
/**
 * Generate Swift types from MCP Apps JSON Schema
 *
 * Usage: npx tsx scripts/generate-swift-types.ts
 */

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_DIR = join(__dirname, "..");
const SCHEMA_FILE = join(PROJECT_DIR, "src/generated/schema.json");
const OUTPUT_FILE = join(PROJECT_DIR, "sdk/swift/Sources/McpApps/Generated/SchemaTypes.swift");

interface JsonSchema {
  type?: string;
  const?: string;
  description?: string;
  properties?: Record<string, JsonSchema>;
  additionalProperties?: boolean | JsonSchema;
  required?: string[];
  anyOf?: JsonSchema[];
  $ref?: string;
  items?: JsonSchema;
}

interface SchemaDoc {
  $defs: Record<string, JsonSchema>;
}

// Convert JSON Schema type to Swift type
function toSwiftType(schema: JsonSchema, name: string, defs: Record<string, JsonSchema>): string {
  if (schema.$ref) {
    const refName = schema.$ref.replace("#/$defs/", "");
    return refName;
  }

  if (schema.anyOf) {
    // Check if it's an enum (all const strings)
    const allConsts = schema.anyOf.every(s => s.const !== undefined);
    if (allConsts) {
      return name; // Will be generated as enum
    }
    return "AnyCodable"; // Fallback for complex unions
  }

  if (schema.const) {
    return "String"; // Literal type
  }

  switch (schema.type) {
    case "string":
      return "String";
    case "number":
      return "Double";
    case "integer":
      return "Int";
    case "boolean":
      return "Bool";
    case "array":
      if (schema.items) {
        return `[${toSwiftType(schema.items, name + "Item", defs)}]`;
      }
      return "[AnyCodable]";
    case "object":
      if (schema.additionalProperties === false && !schema.properties) {
        return "EmptyObject"; // Empty object {}
      }
      if (schema.additionalProperties) {
        const valueType = typeof schema.additionalProperties === "object"
          ? toSwiftType(schema.additionalProperties, name + "Value", defs)
          : "AnyCodable";
        return `[String: ${valueType}]`;
      }
      return name; // Named struct
    default:
      return "AnyCodable";
  }
}

// Generate Swift enum from anyOf with const values
function generateEnum(name: string, schema: JsonSchema): string {
  const cases = schema.anyOf!
    .filter(s => s.const)
    .map(s => {
      const value = s.const!;
      const caseName = value.replace(/-/g, "_").replace(/\//g, "_");
      return `    case ${caseName} = "${value}"`;
    });

  const desc = schema.description ? `/// ${schema.description}\n` : "";
  return `${desc}public enum ${name}: String, Codable, Sendable, Equatable {
${cases.join("\n")}
}`;
}

// Generate Swift struct from object schema
function generateStruct(name: string, schema: JsonSchema, defs: Record<string, JsonSchema>): string {
  const props = schema.properties || {};
  const required = new Set(schema.required || []);

  const properties = Object.entries(props).map(([propName, propSchema]) => {
    const swiftName = propName.replace(/-/g, "_");
    let swiftType = toSwiftType(propSchema, name + capitalize(swiftName), defs);

    // Check if it's an empty object type
    if (propSchema.type === "object" && propSchema.additionalProperties === false && !propSchema.properties) {
      swiftType = "EmptyObject";
    }

    const isOptional = !required.has(propName);
    const typeDecl = isOptional ? `${swiftType}?` : swiftType;
    const desc = propSchema.description ? `    /// ${propSchema.description}\n` : "";

    // Handle property names that need CodingKeys
    const needsCodingKey = swiftName !== propName;
    return {
      swift: `${desc}    public var ${swiftName}: ${typeDecl}`,
      name: swiftName,
      jsonName: propName,
      needsCodingKey,
    };
  });

  const propLines = properties.map(p => p.swift).join("\n");

  // Generate CodingKeys if needed
  const needsCodingKeys = properties.some(p => p.needsCodingKey);
  let codingKeys = "";
  if (needsCodingKeys) {
    const keyLines = properties.map(p =>
      p.needsCodingKey
        ? `        case ${p.name} = "${p.jsonName}"`
        : `        case ${p.name}`
    ).join("\n");
    codingKeys = `

    private enum CodingKeys: String, CodingKey {
${keyLines}
    }`;
  }

  const desc = schema.description ? `/// ${schema.description}\n` : "";
  return `${desc}public struct ${name}: Codable, Sendable, Equatable {
${propLines}${codingKeys}

    public init() {}
}`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Main generation
function generate(): string {
  const schema: SchemaDoc = JSON.parse(readFileSync(SCHEMA_FILE, "utf-8"));
  const defs = schema.$defs;

  const output: string[] = [
    "// Generated from src/generated/schema.json",
    "// DO NOT EDIT - Run: npx tsx scripts/generate-swift-types.ts",
    "",
    "import Foundation",
    "",
    "// MARK: - Helper Types",
    "",
    "/// Empty object type matching TypeScript's `{}`",
    "public struct EmptyObject: Codable, Sendable, Equatable {",
    "    public init() {}",
    "}",
    "",
    "/// Type-erased value for dynamic JSON content",
    "public typealias AnyCodable = [String: Any]",
    "",
    "// MARK: - Generated Types",
    "",
  ];

  for (const [name, defSchema] of Object.entries(defs)) {
    // Skip if it has anyOf with const values (enum)
    if (defSchema.anyOf && defSchema.anyOf.every(s => s.const)) {
      output.push(generateEnum(name, defSchema));
    } else if (defSchema.type === "object") {
      output.push(generateStruct(name, defSchema, defs));
    } else {
      // Type alias
      const swiftType = toSwiftType(defSchema, name, defs);
      const desc = defSchema.description ? `/// ${defSchema.description}\n` : "";
      output.push(`${desc}public typealias ${name} = ${swiftType}`);
    }
    output.push("");
  }

  return output.join("\n");
}

// Run
try {
  console.log("🔧 Generating Swift types from schema.json...");
  const code = generate();

  mkdirSync(dirname(OUTPUT_FILE), { recursive: true });
  writeFileSync(OUTPUT_FILE, code);

  console.log(`✅ Generated: ${OUTPUT_FILE}`);
} catch (error) {
  console.error("❌ Generation failed:", error);
  process.exit(1);
}
