# PR #158 Analysis: Enhance Sandbox Capability Negotiation

## Summary

**Title:** feat: enhance sandbox capability negotiation
**Author:** Ido Salomon (@idosal)
**State:** OPEN
**Branch:** `feat/sandbox-capabilities` -> `main`
**Related Issue:** https://github.com/modelcontextprotocol/ext-apps/issues/58

---

## 1. What the PR is Trying to Achieve

This PR enhances the MCP Apps sandbox capability negotiation system by adding support for:

### 1.1 New CSP Directives

- **`frameDomains`**: Controls which origins can be used for nested iframes (maps to CSP `frame-src` directive)
- **`baseUriDomains`**: Controls allowed base URIs for the document (maps to CSP `base-uri` directive)

### 1.2 Browser Permissions

Introduces a `permissions` attribute (`ui/permissions`) in Resource Metadata supporting:

- `camera`: Request camera access
- `microphone`: Request microphone access
- `geolocation`: Request geolocation access

These map to the iframe's `allow` attribute for Permission Policy features.

### 1.3 Host Capability Negotiation

Adds `csp` to Host<>App capability negotiation so apps can detect at runtime which CSP features and permissions the host supports (since this is non-trivial to detect otherwise).

---

## 2. Comment History and Discussions

### Key Discussion Points:

1. **@matteo8p (Dec 22)**: Asked where iFrame permissions are enforced and suggested using `document.featurePolicy.allowedFeatures()` as a runtime source of truth instead of negotiation.

2. **@idosal (Jan 7)**: Responded that permissions were originally excluded from negotiation because they could be detected directly, but the negotiation approach assumes less about the app runtime and developer's awareness of browser APIs. Community input needed.

3. **@matteo8p (Dec 22)**: Shared that OpenAI currently allows `local-network-access *; microphone *; midi *` in their iframe permissions.

4. **@aharvard (Jan 8)**: Announced implementation of `frameDomains` and `baseUriDomains` in Goose: https://github.com/block/goose/pull/6399

5. **@ochafik (Jan 11)**: Created PR #234 for reference CSP handling in the sandbox server with `frameDomains` and `baseUriDomains`. Suggested this PR focus on sandbox permissions only.

6. **@ochafik (Jan 12)**: Created a speech example (PR #240) relying on microphone and clipboard-write. Offered to help refresh/push to this branch.

### Reviews:

- **Copilot reviewer**: Generated automated review with 4 comments (overview only)
- **@ochafik**: Requested changes - "Thanks Ido!" and later commented "We should tell app what permissions were granted (and potentially which domains were allowed)"
- **@matteo8p**: Commented on permissions detection approach
- **@domfarolino**: Commented (no content shown in review body)

---

## 3. What Changes Are Currently in the PR

### 3.1 Specification Changes (`specification/draft/apps.mdx`)

- Added `frameDomains` and `baseUriDomains` to `UIResourceMeta.csp`
- Added `permissions` object with `camera`, `microphone`, `geolocation` booleans
- Updated sandbox requirements documentation
- Added new `HostCapabilities` interface with `sandbox` section including permissions and CSP support

### 3.2 Type System Changes

**`src/spec.types.ts`**:

- Extended `McpUiSandboxResourceReadyNotification` with `frameDomains`, `baseUriDomains`, and `permissions`
- Added `sandbox` to `McpUiHostCapabilities`
- Extended `McpUiResourceCsp` with `frameDomains` and `baseUriDomains`
- Added new `McpUiResourcePermissions` interface
- Extended `McpUiResourceMeta` with `permissions`

**`src/generated/schema.ts`**:

- Added `McpUiResourcePermissionsSchema` (camera, microphone, geolocation booleans)
- Extended `McpUiResourceCspSchema` with frameDomains, baseUriDomains
- Extended `McpUiHostCapabilitiesSchema` with sandbox section
- Updated `McpUiResourceMetaSchema` to include permissions
- Updated `McpUiSandboxResourceReadyNotificationSchema` with new fields

**`src/types.ts`**:

- Exported new `McpUiResourcePermissions` type and `McpUiResourcePermissionsSchema`

### 3.3 Implementation Changes

**`examples/basic-host/src/implementation.ts`**:

- Extended `UiResourceData` interface with `frameDomains`, `baseUriDomains`, and `permissions`
- Updated resource extraction to include permissions metadata
- Updated `sendSandboxResourceReady` call to include permissions

**`examples/basic-host/src/sandbox.ts`**:

- Extended `buildCspMetaTag()` to handle `frameDomains` and `baseUriDomains`
- Added `buildAllowAttribute()` function for Permission Policy
- Updated message handler to set iframe `allow` attribute based on permissions

**`examples/simple-host/sandbox.html`** (NEW):

- Added new sandbox proxy HTML implementation
- Includes `buildAllowAttribute()` function
- Uses `document.write()` pattern instead of srcdoc for CSP compatibility
- Note: CSP handled via HTTP response headers in serve.ts, not meta tags

### 3.4 Package Changes

- Added `cross-env` dependency (^10.1.0) to multiple example packages
- Various package-lock.json updates (removing "peer" markers from several dependencies)

### 3.5 Schema/Test Updates

- Updated `src/generated/schema.json` with new types
- Updated `src/generated/schema.test.ts` with new type inference tests

---

## 4. Issues, Conflicts, and Open Questions

### 4.1 Potential Overlap with Other PRs

- **PR #234**: @ochafik's PR for CSP handling in sandbox server already includes `frameDomains` and `baseUriDomains`. This creates potential overlap/conflict.
- **Suggestion**: Focus this PR on sandbox permissions only, let PR #234 handle CSP domain extensions

### 4.2 Open Design Questions

1. **Runtime detection vs negotiation**: Should apps use `document.featurePolicy.allowedFeatures()` at runtime instead of relying on host capability negotiation for permissions?
2. **Permission scope**: Currently limited to camera, microphone, geolocation. Other permissions (like `midi` in OpenAI's setup, or `clipboard-write` for the speech example) may be needed.

### 4.3 Missing Implementation

- E2E tests not yet added (author mentioned will add before merging)
- No verification that all example hosts properly implement the new features

### 4.4 Collaboration Request

- @ochafik offered to help refresh/push to this branch (Jan 12)

---

## 5. Files Changed Summary

| File                                        | Changes                                                     |
| ------------------------------------------- | ----------------------------------------------------------- |
| `specification/draft/apps.mdx`              | +137 lines - New CSP fields and permissions documentation   |
| `src/spec.types.ts`                         | +38 lines - New interfaces for permissions and extended CSP |
| `src/generated/schema.ts`                   | +117 lines - Zod schemas for new types                      |
| `src/generated/schema.json`                 | +195 lines - JSON schema updates                            |
| `src/generated/schema.test.ts`              | +26/-20 lines - Type test updates                           |
| `src/types.ts`                              | +2 lines - New exports                                      |
| `examples/basic-host/src/implementation.ts` | +10/-3 lines - Permissions extraction                       |
| `examples/basic-host/src/sandbox.ts`        | +40/-5 lines - Permission Policy implementation             |
| `examples/simple-host/sandbox.html`         | +128 lines (NEW) - New sandbox proxy                        |
| Multiple `package.json` files               | +1 line each - cross-env dependency                         |
| `package-lock.json`                         | Various updates                                             |

---

## 6. Recommendations

1. **Coordinate with PR #234**: Clarify scope division between this PR and the CSP handling PR
2. **Add E2E tests**: As author noted, tests needed before merge
3. **Consider additional permissions**: `clipboard-write`, `midi`, etc. based on real-world usage
4. **Document runtime detection option**: Even if negotiation is preferred, apps should know about `featurePolicy.allowedFeatures()` as fallback
5. **Review simple-host sandbox.html**: New file needs careful security review
