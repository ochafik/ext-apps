# PR #224 Analysis: chore: release 0.3.1

**Repository:** [modelcontextprotocol/ext-apps](https://github.com/modelcontextprotocol/ext-apps)
**PR URL:** https://github.com/modelcontextprotocol/ext-apps/pull/224
**Author:** Olivier Chafik (@ochafik)
**State:** MERGED
**Merged At:** 2026-01-09T18:22:27Z

---

## 1. Title and Description

### Title

`chore: release 0.3.1`

### Description

This PR bumps the version from 0.3.0 to 0.3.1 and consolidates several prior changes into a release.

---

## 2. Purpose/Goal of the PR

The primary goal is to **release version 0.3.1** of the MCP Apps SDK. This release:

1. Consolidates changes from PRs #219, #221, and #185 since version 0.3.0
2. Bumps the version across the main package and all example packages
3. Fixes the npm-publish workflow to include previously missing examples

---

## 3. All Changes Made

### Files Changed (18 total)

| File                                                 | Additions | Deletions | Change Type      |
| ---------------------------------------------------- | --------- | --------- | ---------------- |
| `.github/workflows/npm-publish.yml`                  | 6         | 0         | CI/CD Fix        |
| `package.json`                                       | 1         | 1         | Version Bump     |
| `package-lock.json`                                  | 85        | 17        | Lockfile Update  |
| `examples/basic-server-preact/package.json`          | 1         | 1         | Dep Version Bump |
| `examples/basic-server-react/package.json`           | 1         | 1         | Dep Version Bump |
| `examples/basic-server-solid/package.json`           | 1         | 1         | Dep Version Bump |
| `examples/basic-server-svelte/package.json`          | 1         | 1         | Dep Version Bump |
| `examples/basic-server-vanillajs/package.json`       | 1         | 1         | Dep Version Bump |
| `examples/basic-server-vue/package.json`             | 1         | 1         | Dep Version Bump |
| `examples/budget-allocator-server/package.json`      | 1         | 1         | Dep Version Bump |
| `examples/cohort-heatmap-server/package.json`        | 1         | 1         | Dep Version Bump |
| `examples/customer-segmentation-server/package.json` | 1         | 1         | Dep Version Bump |
| `examples/scenario-modeler-server/package.json`      | 1         | 1         | Dep Version Bump |
| `examples/sheet-music-server/package.json`           | 1         | 1         | Dep Version Bump |
| `examples/system-monitor-server/package.json`        | 1         | 1         | Dep Version Bump |
| `examples/threejs-server/package.json`               | 1         | 1         | Dep Version Bump |
| `examples/video-resource-server/package.json`        | 1         | 1         | Dep Version Bump |
| `examples/wiki-explorer-server/package.json`         | 1         | 1         | Dep Version Bump |

**Total:** +107 additions, -33 deletions

### Detailed Changes

#### 1. Version Bump (package.json, package-lock.json)

- Main package version: `0.3.0` -> `0.3.1`
- All example packages updated to depend on `@modelcontextprotocol/ext-apps: "^0.3.1"`

#### 2. npm-publish.yml Workflow Fix

Added 6 missing examples to the publish-examples matrix:

- `basic-server-preact`
- `basic-server-solid`
- `basic-server-svelte`
- `basic-server-vue`
- `sheet-music-server`
- `video-resource-server`

Note: `basic-host` was initially added but then removed in a follow-up commit (3d7c88c) since it's a host demo, not a server.

---

## 4. Breaking Changes

**No breaking changes** are introduced in this PR itself.

However, this release **includes** PR #219 which aligns the `registerAppTool` signature with the MCP TypeScript SDK. This could be considered a **potential breaking change** for existing users if:

- They were using `registerAppTool` with the old signature
- The signature alignment with the MCP TS SDK changes how parameters are passed

---

## 5. New Features or Improvements

### From Included PRs (since 0.3.0)

#### PR #219: `registerAppTool` Signature Alignment

- **File:** `src/server/index.ts` (+11/-6)
- **Change:** Made `registerAppTool` more interchangeable with `server.registerTool`
- **Purpose:** Better API consistency with the MCP TypeScript SDK

#### PR #221: Build `app-with-deps` Target

- **Files:** `build.bun.ts`, `package.json`
- **Feature:** Added a new build target that bundles the MCP Apps SDK with all dependencies for standalone use
- **Use Case:** Enables module imports from inlined apps (e.g., loading the SDK directly from unpkg CDN in HTML)

#### PR #185: Build Order Fix

- **Files:** `.github/workflows/ci.yml`, `package.json`, `scripts/check-versions.mjs`
- **Feature:**
  - Added `preexamples:build` hook to ensure lib is built before examples
  - Added version consistency check script
- **Purpose:** Ensures examples always type-check against the latest library code

### Direct Changes in This PR

#### Workflow Fix

- Fixed the npm-publish workflow to include 6 previously missing example packages
- This ensures all examples are properly published to npm when releasing

---

## 6. Bug Fixes

### Direct Fixes in This PR

1. **Missing Examples in Publish Workflow**
   - Several example packages were not being published to npm
   - Added: `basic-server-preact`, `basic-server-solid`, `basic-server-svelte`, `basic-server-vue`, `sheet-music-server`, `video-resource-server`
   - Removed `basic-host` (correctly classified as a host demo, not a server)

### Included from Prior PRs

2. **PR #185: Build Order Issue**
   - Fixed: Examples were being built before the library, causing type-check failures
   - Solution: Added `preexamples:build` hook

3. **PR #219: API Signature Inconsistency**
   - Fixed: `registerAppTool` signature didn't match `server.registerTool`
   - Aligned the API for better consistency

---

## Commits

| Commit  | Message                                                                         | Date                 |
| ------- | ------------------------------------------------------------------------------- | -------------------- |
| b2242d0 | `chore: release 0.3.1`                                                          | 2026-01-09T17:28:00Z |
| ac2ac41 | `fix: add missing examples to publish-examples workflow`                        | 2026-01-09T17:33:55Z |
| 3d7c88c | `fix: remove basic-host from publish-examples (it's a host demo, not a server)` | 2026-01-09T18:13:59Z |

---

## Summary

PR #224 is a **release PR** that:

1. Bumps version to 0.3.1 across all packages
2. Fixes the npm-publish workflow to include 6 missing example packages
3. Consolidates improvements from PRs #185, #219, and #221
4. Contains no breaking changes in itself (though #219's API alignment could affect existing users)

The release improves API consistency, adds a standalone bundle option, fixes build ordering, and ensures all examples are properly published.
