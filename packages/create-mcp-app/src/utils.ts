import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Current SDK version - read from create-mcp-app's own package.json at runtime */
export const SDK_VERSION: string = JSON.parse(
  fs.readFileSync(
    path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "..",
      "package.json",
    ),
    "utf-8",
  ),
).version;

/** Available templates */
export const TEMPLATES = [
  { value: "react", label: "React", hint: "React + Vite + TypeScript" },
  {
    value: "vanillajs",
    label: "Vanilla JS",
    hint: "Vanilla JavaScript + Vite + TypeScript",
  },
] as const;

export type TemplateName = (typeof TEMPLATES)[number]["value"];

/** Get the templates directory path */
export function getTemplatesDir(): string {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  // Works both in development (src/) and production (dist/)
  return path.join(__dirname, "..", "templates");
}

/** Validate project name - must be a valid directory and npm package name */
export function validateProjectName(name: string | undefined): string | undefined {
  if (!name) {
    return undefined; // Allow empty for placeholder default
  }

  if (/[<>:"/\\|?*\x00-\x1f]/.test(name)) {
    return "Project name contains invalid characters";
  }

  if (name.startsWith(".") || name.startsWith("_")) {
    return "Project name cannot start with a dot or underscore";
  }

  return undefined;
}

/** Process template placeholders in content */
export function processTemplate(
  content: string,
  replacements: Record<string, string>,
): string {
  let result = content;
  for (const [key, value] of Object.entries(replacements)) {
    result = result.replaceAll(`{{${key}}}`, value);
  }
  return result;
}
