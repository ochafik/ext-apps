# ext-apps Release Notes Analysis (v0.2.0 - v0.3.1)

## Summary

This document analyzes the releases of the `modelcontextprotocol/ext-apps` repository from version 0.2.0 through 0.3.1, covering a period from December 16, 2024 to January 9, 2025.

---

## Release Timeline

| Version | Release Date      | Key Theme                                         |
| ------- | ----------------- | ------------------------------------------------- |
| v0.2.0  | December 16, 2024 | SSE transport, peer dependencies, API refactoring |
| v0.2.1  | December 17, 2024 | Bug fixes, custom fonts, style variables          |
| v0.2.2  | December 17, 2024 | Zod v3.25/v4 compatibility                        |
| v0.3.0  | January 9, 2025   | New examples, npm publishing, spec compliance     |
| v0.3.1  | January 9, 2025   | SDK alignment, build improvements                 |

---

## Detailed Release Notes

### v0.2.0 (December 16, 2024)

**Major Release - Foundation for Modern Architecture**

#### New Features

- **SSE Transport Support**: Added Server-Sent Events transport and shared server utilities
- **Styles Prop**: Introduced `styles` prop to host context for MCP Apps
- **Display Mode Request**: Apps can now request display mode instead of having it set externally
- **Server Helpers**: Added `connect()` which defaults to parent post transport
- **Peer Dependencies**: MCP SDK and React are now peer dependencies for better version flexibility

#### API Changes

- **Optional Client in AppBridge**: Enables custom forwarding scenarios
- **Improved Protocol Types**: Better typing for `AppRequest`, `AppNotification`, `AppResult`
- **Method Renaming**: Removed "send" prefix from request methods (breaking change)

#### Improvements

- "Bring your own Zod version" support for flexibility
- Enhanced basic app responsiveness for narrow viewports
- Windows compatibility improvements:
  - Made Bun an optional dependency
  - Added cross-env for examples

#### Testing & Quality

- Added Playwright E2E tests with screenshot golden testing
- Fixed E2E screenshot test consistency across CI and local environments
- Added pre-commit checks for private registry URLs in package-lock.json
- Marked `src/generated` as linguist-generated

#### Fixes & Documentation

- Added mimeType to resource declarations in examples
- Fixed sandbox-proxy-ready notification name in spec
- Corrected typos and formatting in spec header
- Improved tool visibility documentation

**Full Changelog**: v0.1.0...v0.2.0

---

### v0.2.1 (December 17, 2024)

**Patch Release - Bug Fixes and Enhancements**

#### Changes

1. **Tool Registration Fix** (`fix(examples)`)
   - Corrected `server.registerTool` usage for non-UI tools
   - Resolved missing import statements

2. **Custom Font Support**
   - Introduced the ability to pass custom fonts within MCP Apps

3. **Style Variable Addition**
   - Added a previously omitted style variable to the MCP Apps framework

4. **Dependency Update**
   - Widened `@oven/bun-*` version range for broader compatibility

**Contributors**: @ochafik, @martinalong

---

### v0.2.2 (December 17, 2024)

**Patch Release - Zod Compatibility**

#### Changes

- **Zod Schema Compatibility**: Made Zod schemas compatible with both v3.25+ and v4 versions
  - PR #178 by @ochafik
  - This allows consumers to use either the stable Zod 3.x line or the newer Zod 4.x

**Note**: 35 commits to main since this release, indicating significant development activity leading to v0.3.0.

---

### v0.3.0 (January 9, 2025)

**Minor Release - New Examples and NPM Publishing**

#### Bug Fixes

- Fixed build errors in examples (@jonathanhefner, #180)
- Moved prettier to dev dependency (@niclim, #179)
- Fixed tsc command to use tsconfig.json (@blackgirlbytes, #188)
- Added missing origin parameter to PostMessageTransport default constructor (@ochafik, #207)
- Made `toolInfo.id` optional per spec (@antonpk1, #216)
- Made example host more resilient to broken servers (@ochafik, #206)
- Added missing server-utils.ts to video-resource-server (@antonpk1, #205)

#### Features & Enhancements

- **New Examples**:
  - Added `sheet-music-server` example (@jonathanhefner, #196)
  - Added `video-resource-server` example (@antonpk1, #175)
  - Added `basic-server-*` examples for Vue, Svelte, Preact, and Solid (@jonathanhefner, #141)

- **NPM Publishing**: Published example servers to npm (@jerome3o-anthropic, #184)

- **API Improvements**:
  - Required `eventSource` in PostMessageTransport + added security tests (@ochafik, #208)
  - Exported method names as constants (@idosal, #192)
  - Made `ui.resourceUri` optional for tools that just need visibility (@ochafik, #210)
  - Updated `viewport` type (@martinalong, #153)

- **UX Improvements**:
  - Added `safeAreaInsets` support to all example apps (@jonathanhefner, #202)
  - Added npm `start` alias for `examples:start` (@jonathanhefner, #183)

#### New Contributors

- @niclim
- @blackgirlbytes

---

### v0.3.1 (January 9, 2025)

**Patch Release - SDK Alignment and Build Improvements**

Released by @ochafik

#### Changes

1. **Fixed registerAppTool Signature** (PR #219)
   - Aligned the function signature with the MCP TypeScript SDK specifications
   - This is the key change addressing breaking API changes in the new SDK version

2. **Added Build App-with-deps Target** (PR #221)
   - Introduced a new build feature for applications with dependencies

3. **Build Order Fix** (PR #185)
   - Ensured the library builds before example applications
   - Fixes build reliability issues

4. **Release Automation** (PR #224)
   - Completed the v0.3.1 release process

**Commit**: `4c51eb0301aece4fe55ae6136bf6444f6a484569` (verified GPG signature)

---

## Key Changes Between Versions

### v0.2.0 -> v0.2.1

- Bug fixes for tool registration
- Added custom font support
- Added missing style variable
- Broadened Bun dependency version range

### v0.2.1 -> v0.2.2

- Zod schema compatibility for v3.25+ and v4

### v0.2.2 -> v0.3.0 (Major Changes)

- **New example servers**: sheet-music-server, video-resource-server, framework-specific examples
- **NPM publishing** of example servers
- **API changes**:
  - `toolInfo.id` now optional per spec
  - `ui.resourceUri` now optional for tools needing only visibility
  - `eventSource` required in PostMessageTransport
  - Method names exported as constants
- **Security**: Added security tests for PostMessageTransport
- **UX**: safeAreaInsets support across all examples

### v0.3.0 -> v0.3.1

- **SDK Alignment**: Fixed `registerAppTool` signature to match MCP TypeScript SDK
- **Build System**: Improved build order and added app-with-deps target

---

## Breaking Changes Summary

### v0.2.0

- Method renaming: Removed "send" prefix from request methods
- MCP SDK and React changed to peer dependencies

### v0.3.0

- `eventSource` now required in PostMessageTransport constructor (security hardening)

### v0.3.1

- `registerAppTool` signature changed to align with MCP TypeScript SDK
  - This is the "breaking API change" mentioned in the PR context

---

## Notable Patterns

1. **Rapid Iteration**: v0.2.1 and v0.2.2 were both released on December 17, showing quick bug fix turnaround
2. **Community Growth**: v0.3.0 welcomed new contributors (@niclim, @blackgirlbytes)
3. **Framework Expansion**: Added support for Vue, Svelte, Preact, and Solid in v0.3.0
4. **SDK Alignment Focus**: v0.3.1 specifically addresses compatibility with the MCP TypeScript SDK

---

## Analysis of registerAppTool Signature Change (v0.3.1)

The key breaking change in v0.3.1 involves aligning `registerAppTool` with the MCP TypeScript SDK. Based on the release notes:

- **PR #219**: "Fixed registerAppTool signature - Aligned the function signature with the MCP TypeScript SDK specifications"

This change was necessary because the MCP TypeScript SDK updated its API, and ext-apps needed to match those changes for compatibility. This is the "breaking API change" referenced in the upgrade context.

To understand the exact nature of this change, one would need to examine:

1. The diff in PR #219
2. The MCP TypeScript SDK changelog for the corresponding version
3. The before/after signatures of `registerAppTool`
