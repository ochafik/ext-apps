# Analysis of Model Discussion Post #181

**Source**: https://github.com/modelcontextprotocol/ext-apps/discussions/181
**Title**: "Changes from 0.1.x to 0.2.2"
**Author**: @ochafik
**Category**: Announcements
**Date**: 2025-12-18

---

## 1. Overall Structure and Format

The post follows a **changelog-style announcement** pattern with:

1. **Opening paragraph** - Brief, friendly intro explaining context (multiple versions released quickly)
2. **Warning callout** - Critical migration note at the top
3. **Categorized sections** - Logically grouped changes under headers
4. **Footer link** - Full changelog reference

### Section Order:

1. Intro paragraph
2. Warning callout (GitHub alert syntax)
3. `### Highlights` - Major new features
4. `### API Changes` - Breaking/behavioral changes
5. `### Platform & DX` - Developer experience improvements
6. `### Bug Fixes` - Fixes
7. Full changelog link

---

## 2. Tone and Style

- **Friendly and casual**: Opens with "Hi all!"
- **Direct and informative**: Gets straight to the point
- **Scannable**: Heavy use of bold for key terms, bullet points for details
- **Professional but approachable**: Uses "we've" and conversational language

---

## 3. Key Sections and Formatting Conventions

### Opening Paragraph

```markdown
Hi all! We've just pushed @modelcontextprotocol/ext-apps versions [0.2.0](...), [0.2.1](...) and [0.2.2](...) in quick succession, so here's what's changed since 0.1.x
```

- Links to each version's release page
- Explains the "why" briefly

### Warning Callout (for Breaking Changes)

```markdown
> [!WARNING]
> The `registerAppTool` helper makes sure defining `_meta.ui.resourceUri` is backward-compatible w/ clients expecting `"ui/resourceUri"`
```

- Uses GitHub's alert syntax `> [!WARNING]`
- Placed prominently at the top, before section headers
- Explains the migration path, not just the breaking change

### Section Headers

- Uses `###` (H3) for main sections
- Section names are short and descriptive:
  - `Highlights`
  - `API Changes`
  - `Platform & DX`
  - `Bug Fixes`

### Bullet Point Format

Each bullet follows this pattern:

```markdown
- **Feature name** — Description with context. Links [#123](url)
```

Key conventions:

- **Bold** for the feature/change name (2-4 words)
- **Em dash** (`—`) as separator (not hyphen or colon)
- Description explains the "what" and "why"
- PR link at the end with `[#123](url)` format
- Multiple related PRs can be listed

### Examples of Well-Formatted Bullets:

**New Feature:**

```markdown
- **Server helpers** — New `registerAppTool()` and `registerAppResource()` simplify server setup with proper type safety. `connect()` now defaults to `PostMessageTransport(window.parent)`, enabling simpler initialization with just `await app.connect()` [#165](...)
```

**Breaking Change:**

```markdown
- **MCP SDK as peer dependency** — Consumers control their SDK version, reducing duplication [#168](...)
```

**Bug Fix:**

```markdown
- **Responsive UIs** — Fixed narrow viewport handling for mobile and sidebar experiences [#135](...)
```

---

## 4. How Breaking Changes vs New Features are Presented

### Breaking Changes Get Special Treatment:

1. **Warning callout at top** - The most critical breaking change uses `> [!WARNING]` syntax
2. **Placed in "API Changes" section** - Not hidden, but clearly separated from "Highlights"
3. **Migration path included** - Notes how backward compatibility is maintained
4. **Explains the benefit** - e.g., "Consumers control their SDK version, reducing duplication"

### New Features (Highlights):

- Listed first, emphasizing value
- Focus on capability gains
- More descriptive explanations

### API Changes (Breaking/Behavioral):

- Listed after highlights
- Focus on what changed and why
- Often includes deprecated alias notes: "Deprecated aliases maintained"

### The Distinction:

| Section       | Focus                | Tone                              |
| ------------- | -------------------- | --------------------------------- |
| Highlights    | New capabilities     | "Enables X", "New Y"              |
| API Changes   | What changed         | "Now X", "Renamed Y", "Removed Z" |
| Platform & DX | Developer experience | "Support for X", "Widened Y"      |
| Bug Fixes     | What was broken      | "Fixed X"                         |

---

## 5. Conventions Used

### Formatting Elements:

- **Bold** (`**text**`) — Feature/change names
- **Em dash** (`—`) — Separator after bold title
- **Backticks** (`` `code` ``) — Code, function names, config keys
- **Links** (`[text](url)`) — Version releases, PR references
- **GitHub Alert** (`> [!WARNING]`) — Critical migration notes

### No Emojis

The post does **not** use emojis anywhere. It maintains a clean, professional look relying on:

- Bold text for emphasis
- Section headers for organization
- Warning callouts for critical notes

### PR Reference Format:

```markdown
[#123](https://github.com/modelcontextprotocol/ext-apps/pull/123)
```

- Number only, no description
- Full URL (not shorthand)
- Placed at end of bullet

### Footer:

```markdown
**Full Changelog**: https://github.com/modelcontextprotocol/ext-apps/compare/v0.1.1...v0.2.2
```

- Bold label
- Compare URL for full diff

---

## 6. Template for Future Posts

```markdown
Hi all! We've just released [package] version [X.Y.Z](release-url), here's what's changed since [previous version].

> [!WARNING]
> [Critical migration note if any breaking changes]

### Highlights

- **Feature Name** — Description of what it does and why it matters [#PR](url)
- **Another Feature** — Description [#PR](url)

### API Changes

- **Breaking Change** — What changed and how to migrate. Old behavior deprecated [#PR](url)
- **Renamed Method** — Old `sendFoo()` is now `foo()`. Deprecated aliases maintained [#PR](url)

### Platform & DX

- **Improvement** — Description of developer experience improvement [#PR](url)

### Bug Fixes

- **Fix Title** — Fixed [what was broken] [#PR](url)

**Full Changelog**: [compare-url]
```

---

## 7. Key Takeaways for Writing Similar Posts

1. **Lead with context** - Explain why the post exists (multiple versions, major release, etc.)
2. **Highlight breaking changes early** - Use `> [!WARNING]` callout before sections
3. **Organize by impact category** - Highlights > API Changes > DX > Fixes
4. **Be consistent with formatting** - Bold title, em dash, description, PR link
5. **Explain the "why"** - Don't just list changes, explain benefits
6. **Provide migration paths** - For breaking changes, show how to adapt
7. **Keep it scannable** - Bold keywords, bullets, headers
8. **No emojis** - Professional, clean style
9. **Link everything** - Releases, PRs, changelogs
