#!/usr/bin/env npx tsx
/**
 * Generate Swift types from MCP Apps JSON Schema
 *
 * Usage: npx tsx scripts/generate-swift-types.ts
 *
 * This generates types that can replace the manual types in:
 * - sdk/swift/Sources/McpApps/Types/HostTypes.swift
 * - sdk/swift/Sources/McpApps/Types/AppTypes.swift
 * - sdk/swift/Sources/McpApps/Types/Messages.swift
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

// Type name mapping for consistency
const TYPE_NAME_MAP: Record<string, string> = {
  "McpUiHostContextTheme": "McpUiTheme",
  "McpUiHostContextDisplayMode": "McpUiDisplayMode",
  "McpUiHostContextPlatform": "McpUiPlatform",
  "McpUiHostContextViewport": "Viewport",
  "McpUiHostContextDeviceCapabilities": "DeviceCapabilities",
  "McpUiHostContextSafeAreaInsets": "SafeAreaInsets",
  "McpUiHostCapabilitiesServerTools": "ServerToolsCapability",
  "McpUiHostCapabilitiesServerResources": "ServerResourcesCapability",
  "McpUiAppCapabilitiesTools": "AppToolsCapability",
};

// Empty object types (additionalProperties: false, no properties)
const EMPTY_OBJECT_TYPES = new Set([
  "McpUiHostCapabilitiesOpenLinks",
  "McpUiHostCapabilitiesLogging",
  "McpUiHostCapabilitiesExperimental",
  "McpUiAppCapabilitiesExperimental",
]);

// Track generated types
const generatedTypes = new Set<string>();
const typeDefinitions: string[] = [];

// Convert property name to Swift style (camelCase)
function toSwiftPropertyName(name: string): string {
  return name.replace(/-/g, "_");
}

// Convert type name
function mapTypeName(name: string): string {
  return TYPE_NAME_MAP[name] || name;
}

// Check if schema represents an empty object
function isEmptyObject(schema: JsonSchema): boolean {
  return schema.type === "object" &&
    schema.additionalProperties === false &&
    (!schema.properties || Object.keys(schema.properties).length === 0);
}

// Convert JSON Schema type to Swift type
function toSwiftType(schema: JsonSchema, contextName: string, defs: Record<string, JsonSchema>): string {
  if (schema.$ref) {
    const refName = schema.$ref.replace("#/$defs/", "");
    return mapTypeName(refName);
  }

  if (schema.anyOf) {
    // Check if it's an enum (all const strings)
    const allConsts = schema.anyOf.every(s => s.const !== undefined);
    if (allConsts) {
      return mapTypeName(contextName);
    }
    return "AnyCodable";
  }

  if (schema.const) {
    return "String";
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
        return `[${toSwiftType(schema.items, contextName + "Item", defs)}]`;
      }
      return "[AnyCodable]";
    case "object":
      if (isEmptyObject(schema)) {
        return "EmptyCapability";
      }
      if (schema.additionalProperties) {
        const valueType = typeof schema.additionalProperties === "object"
          ? toSwiftType(schema.additionalProperties, contextName + "Value", defs)
          : "AnyCodable";
        return `[String: ${valueType}]`;
      }
      // Named struct - generate inline if not already defined
      const mappedName = mapTypeName(contextName);
      if (!generatedTypes.has(mappedName) && schema.properties) {
        generateStruct(mappedName, schema, defs);
      }
      return mappedName;
    default:
      return "AnyCodable";
  }
}

// Generate Swift enum from anyOf with const values
function generateEnum(name: string, schema: JsonSchema): void {
  const mappedName = mapTypeName(name);
  if (generatedTypes.has(mappedName)) return;
  generatedTypes.add(mappedName);

  const cases = schema.anyOf!
    .filter(s => s.const)
    .map(s => {
      const value = s.const!;
      const caseName = value.replace(/-/g, "").replace(/\//g, "");
      return `    case ${caseName} = "${value}"`;
    });

  const desc = schema.description ? `/// ${schema.description}\n` : "";
  typeDefinitions.push(`${desc}public enum ${mappedName}: String, Codable, Sendable, Equatable {
${cases.join("\n")}
}`);
}

// Generate Swift struct from object schema
function generateStruct(name: string, schema: JsonSchema, defs: Record<string, JsonSchema>): void {
  const mappedName = mapTypeName(name);
  if (generatedTypes.has(mappedName)) return;
  if (EMPTY_OBJECT_TYPES.has(name)) return; // Skip empty objects, use EmptyCapability
  generatedTypes.add(mappedName);

  const props = schema.properties || {};
  const required = new Set(schema.required || []);

  const properties: Array<{
    swiftName: string;
    jsonName: string;
    type: string;
    isOptional: boolean;
    description?: string;
  }> = [];

  for (const [propName, propSchema] of Object.entries(props)) {
    const swiftName = toSwiftPropertyName(propName);
    const contextTypeName = name + capitalize(swiftName);

    let swiftType: string;
    if (isEmptyObject(propSchema)) {
      swiftType = "EmptyCapability";
    } else if (propSchema.anyOf && propSchema.anyOf.every(s => s.const)) {
      // Inline enum
      generateEnum(contextTypeName, propSchema);
      swiftType = mapTypeName(contextTypeName);
    } else if (propSchema.type === "object" && propSchema.properties) {
      // Inline struct
      swiftType = toSwiftType(propSchema, contextTypeName, defs);
    } else {
      swiftType = toSwiftType(propSchema, contextTypeName, defs);
    }

    properties.push({
      swiftName,
      jsonName: propName,
      type: swiftType,
      isOptional: !required.has(propName),
      description: propSchema.description,
    });
  }

  // Generate property declarations
  const propLines = properties.map(p => {
    const desc = p.description ? `    /// ${p.description}\n` : "";
    const typeDecl = p.isOptional ? `${p.type}?` : p.type;
    return `${desc}    public var ${p.swiftName}: ${typeDecl}`;
  }).join("\n");

  // Generate CodingKeys if needed
  const needsCodingKeys = properties.some(p => p.swiftName !== p.jsonName);
  let codingKeys = "";
  if (needsCodingKeys) {
    const keyLines = properties.map(p =>
      p.swiftName !== p.jsonName
        ? `        case ${p.swiftName} = "${p.jsonName}"`
        : `        case ${p.swiftName}`
    ).join("\n");
    codingKeys = `

    private enum CodingKeys: String, CodingKey {
${keyLines}
    }`;
  }

  // Generate initializer
  const initParams = properties.map(p => {
    const defaultValue = p.isOptional ? " = nil" : "";
    return `        ${p.swiftName}: ${p.isOptional ? p.type + "?" : p.type}${defaultValue}`;
  }).join(",\n");

  const initAssignments = properties.map(p =>
    `        self.${p.swiftName} = ${p.swiftName}`
  ).join("\n");

  const desc = schema.description ? `/// ${schema.description}\n` : "";
  typeDefinitions.push(`${desc}public struct ${mappedName}: Codable, Sendable, Equatable {
${propLines}${codingKeys}

    public init(
${initParams}
    ) {
${initAssignments}
    }
}`);
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Main generation
function generate(): string {
  const schema: SchemaDoc = JSON.parse(readFileSync(SCHEMA_FILE, "utf-8"));
  const defs = schema.$defs;

  // Header
  const header = `// Generated from src/generated/schema.json
// DO NOT EDIT - Run: npx tsx scripts/generate-swift-types.ts

import Foundation

// MARK: - Helper Types

/// Empty capability marker (matches TypeScript \`{}\`)
public struct EmptyCapability: Codable, Sendable, Equatable {
    public init() {}
}

// MARK: - Generated Types
`;

  // Process all definitions
  for (const [name, defSchema] of Object.entries(defs)) {
    if (EMPTY_OBJECT_TYPES.has(name)) continue;

    if (defSchema.anyOf && defSchema.anyOf.every(s => s.const)) {
      generateEnum(name, defSchema);
    } else if (defSchema.type === "object") {
      generateStruct(name, defSchema, defs);
    }
  }

  return header + "\n" + typeDefinitions.join("\n\n") + "\n";
}

// Run
try {
  console.log("🔧 Generating Swift types from schema.json...");
  const code = generate();

  mkdirSync(dirname(OUTPUT_FILE), { recursive: true });
  writeFileSync(OUTPUT_FILE, code);

  console.log(`✅ Generated: ${OUTPUT_FILE}`);
  console.log(`   Types: ${generatedTypes.size}`);
} catch (error) {
  console.error("❌ Generation failed:", error);
  process.exit(1);
}
