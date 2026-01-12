# PR #204 Analysis: chore: release 0.3.0

**Repository:** modelcontextprotocol/ext-apps
**PR URL:** https://github.com/modelcontextprotocol/ext-apps/pull/204
**Author:** ochafik (Olivier Chafik)
**State:** MERGED
**Created:** 2026-01-07T11:36:03Z
**Merged:** 2026-01-09T00:55:45Z
**Base Branch:** main
**Head Branch:** ochafik/release-0.3.0

---

## 1. Title and Description

**Title:** `chore: release 0.3.0`

**Summary:** This PR bumps the version from 0.2.2 to 0.3.0 and introduces release notes documenting all changes since the previous version.

---

## 2. Files Changed

**Total:** 19 files changed (+207 additions, -33 deletions)

### New Files

| File                                                 | Additions  | Purpose                                                                                      |
| ---------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------- |
| `RELEASES.md`                                        | +64 lines  | New release notes document covering 0.3.0 and 0.2.2 changes                                  |
| `examples/video-resource-server/src/server-utils.ts` | +110 lines | Shared utilities for running MCP servers with various transports (stdio and Streamable HTTP) |

### Version Bumps (package.json files)

All example servers had their `@modelcontextprotocol/ext-apps` dependency bumped from `^0.2.2` to `^0.3.0`:

1. `examples/basic-server-preact/package.json`
2. `examples/basic-server-react/package.json`
3. `examples/basic-server-solid/package.json`
4. `examples/basic-server-svelte/package.json`
5. `examples/basic-server-vanillajs/package.json`
6. `examples/basic-server-vue/package.json`
7. `examples/budget-allocator-server/package.json`
8. `examples/cohort-heatmap-server/package.json`
9. `examples/customer-segmentation-server/package.json`
10. `examples/scenario-modeler-server/package.json`
11. `examples/sheet-music-server/package.json`
12. `examples/system-monitor-server/package.json`
13. `examples/threejs-server/package.json`
14. `examples/video-resource-server/package.json`
15. `examples/wiki-explorer-server/package.json`

### Root Package Updates

- `package.json` - version bump to 0.3.0
- `package-lock.json` - updated lockfile reflecting version changes

---

## 3. Purpose/Goal of the PR

The primary purpose is to **release version 0.3.0** of the MCP Apps SDK. This involves:

1. **Version bump** from 0.2.2 to 0.3.0
2. **Creating comprehensive release notes** (RELEASES.md) documenting all changes
3. **Updating all example server dependencies** to use the new version
4. **Adding shared server utilities** for the video-resource-server example

---

## 4. Breaking Changes

Two breaking changes are documented in this release:

### 4.1 `viewport` replaced with `containerDimensions` (PR #153)

- **Before:** Host context had a `viewport` property
- **After:** Replaced with `containerDimensions` which provides clearer semantics
- **Impact:** The new type allows specifying either:
  - `height` OR `maxHeight`
  - `width` OR `maxWidth`
- **Reason:** Provides clearer distinction between fixed dimensions and maximum constraints
- **Migration:** Apps using `viewport` must update to use `containerDimensions` instead

### 4.2 `eventSource` now required in `PostMessageTransport` (PR #208)

- **Before:** `eventSource` parameter was optional in constructor
- **After:** `eventSource` parameter is now required
- **Impact:** Security improvement - enforces validation of message sources
- **Reason:** Prevents potential cross-app message spoofing attacks
- **Migration:** Callers must explicitly provide the `eventSource` parameter

---

## 5. New Features and Improvements

### 5.1 New Framework Examples

- **Vue, Svelte, Preact, and Solid examples** (PR #141)
  - `basic-server-vue`
  - `basic-server-svelte`
  - `basic-server-preact`
  - `basic-server-solid`

### 5.2 `safeAreaInsets` Support (PR #202)

- Host context now includes safe area insets
- Allows apps to properly handle device notches and system UI elements
- All example apps updated to use this for proper padding

### 5.3 `ui.resourceUri` Optional (PR #210)

- Tools that need visibility but don't require a UI resource can now omit `resourceUri` in the schema

### 5.4 Method Names Exported as Constants (PR #192)

- MCP method names are now exported as typed constants
- Enables easier external library integration without brittle schema introspection

### 5.5 Example Servers Publishable to npm (PR #184)

- All 15 example servers are now published to npm under `@modelcontextprotocol` scope
- Users can run examples directly via `npx @modelcontextprotocol/server-basic-react` etc.

### 5.6 `toolInfo.id` Optional (PR #216)

- Aligned TypeScript types with spec by making `toolInfo.id` optional
- Allows hosts to pass just the tool definition

### 5.7 New Example Servers

- **Video resource server** (PR #175) - Demonstrates video resource handling with proper mimeType declarations
- **Sheet music server** (PR #196) - Interactive sheet music notation example

### 5.8 Developer Experience Improvements

- **`npm start` alias** (PR #183) - Added as alias for `npm run examples:start`
- **Examples cleanup** (PR #182) - Improved consistency across example servers
- **Documentation fixes** (PR #188) - Fixed tsc command in docs to use tsconfig.json

---

## 6. Bug Fixes

### 6.1 Dependency Fixes

- **Move prettier to dev dependency** (PR #179) - Fixed incorrect dependency classification
- **Fix build errors in examples** (PR #180) - Resolved build issues across example servers

### 6.2 Host Resilience Improvements (PR #206)

- Server connections now use `Promise.allSettled` instead of `Promise.all`
- One server failure no longer crashes the entire UI

### 6.3 E2E Test Reliability (PR #206)

- Fixed flaky Three.js E2E tests with reliable canvas ID masking

---

## 7. Security Fixes

### 7.1 PostMessageTransport Origin Verification (PR #207)

- Added proper source validation to default constructor
- Added validation to sandbox proxy
- Prevents cross-origin message spoofing

### 7.2 Security E2E Tests (PR #208)

- Added 14 comprehensive tests for:
  - Origin validation
  - Cross-app message injection protection

---

## 8. New Server Utilities

A new `server-utils.ts` file was added to the video-resource-server example, providing:

### `startServer(createServer)`

Main entry point that detects transport mode from CLI args:

- If `--stdio` flag: Uses stdio transport
- Otherwise: Uses Streamable HTTP transport

### `startStdioServer(createServer)`

- Connects server using `StdioServerTransport`

### `startStreamableHttpServer(createServer)`

- Runs server with Streamable HTTP transport in stateless mode
- Each request creates fresh server and transport instances
- Listens on PORT env var (default: 3001)
- Includes proper cleanup on response end
- CORS enabled
- Graceful shutdown handling (SIGINT, SIGTERM)

---

## 9. Related PRs Referenced

The release notes document changes from multiple PRs:

| PR   | Description                                        |
| ---- | -------------------------------------------------- |
| #153 | `viewport` → `containerDimensions` breaking change |
| #208 | `eventSource` required in `PostMessageTransport`   |
| #141 | Framework examples (Vue, Svelte, Preact, Solid)    |
| #202 | `safeAreaInsets` support                           |
| #210 | `ui.resourceUri` optional                          |
| #192 | Method names exported as constants                 |
| #184 | Example servers publishable to npm                 |
| #216 | `toolInfo.id` optional                             |
| #175 | Video resource server example                      |
| #196 | Sheet music server example                         |
| #183 | `npm start` alias                                  |
| #182 | Examples cleanup                                   |
| #188 | Documentation fixes                                |
| #179 | Prettier to dev dependency                         |
| #180 | Fix build errors in examples                       |
| #206 | Host resilience + E2E test reliability             |
| #207 | PostMessageTransport origin verification           |

---

## 10. Backward Compatibility Note

The PR description mentions:

> A backward compatibility shim for the deprecated `viewport` property is available in PR #TBD (branch `ochafik/viewport-compat-shim`). Consider merging that first if backward compat is needed.

This suggests that the `viewport` → `containerDimensions` breaking change may have a compatibility shim available if needed.

---

## 11. Summary

This is a **release preparation PR** that:

1. Bumps version to 0.3.0 (semantic versioning minor bump due to breaking changes)
2. Documents comprehensive release notes in RELEASES.md
3. Updates all example dependencies to the new version
4. Adds shared server utilities for the video-resource example

The release includes 2 breaking changes, 8+ new features, multiple bug fixes, and security improvements. All 15 example servers are updated and can be published to npm.
