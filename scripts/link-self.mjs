/**
 * Workaround: npm workspaces don't symlink the root package into node_modules
 * when child workspaces depend on it — it installs a stale registry copy instead.
 * This script syncs the freshly-built dist/ and package.json into that copy
 * so examples always type-check against the latest local types.
 * See: https://github.com/npm/feedback/discussions/774
 */
import { cpSync, existsSync, lstatSync, realpathSync } from "fs";
import { resolve } from "path";

const target = "node_modules/@modelcontextprotocol/ext-apps";
if (!existsSync(target)) process.exit(0);

// If the target is a symlink back to the repo root, the workspace is already
// linked correctly and there's nothing to copy.
try {
  if (
    lstatSync(target).isSymbolicLink() &&
    realpathSync(target) === resolve(".")
  ) {
    process.exit(0);
  }
} catch {}

cpSync("dist", `${target}/dist`, { recursive: true });
cpSync("package.json", `${target}/package.json`);
