# Resize Investigation Findings

## Summary

**Can apps resize themselves (both grow and shrink)?**

| Dimension  | Growing | Shrinking | Notes                                            |
| ---------- | ------- | --------- | ------------------------------------------------ |
| **Height** | YES     | YES       | Works correctly - host uses `height` directly    |
| **Width**  | YES     | LIMITED   | Host uses `min-width`, treating width as a floor |

## Detailed Analysis

### Height Resizing (Works Fully)

The host implementation (`examples/basic-host/src/implementation.ts:265-266`) uses `height` directly:

```typescript
from.height = `${iframe.offsetHeight}px`;
iframe.style.height = to.height = `${height}px`;
```

This means height changes are applied immediately in both directions (growing and shrinking).

**Tested and verified:** Added Hide/Show toggle to React and Vanilla JS examples. When controls are hidden, the iframe height shrinks correctly.

### Width Resizing (Limited by Design)

The host implementation (`examples/basic-host/src/implementation.ts:253-259`) uses `min-width` instead of `width`:

```typescript
// Use min-width instead of width to allow responsive growing.
// With auto-resize (the default), the app reports its minimum content
// width; we honor that as a floor but allow the iframe to expand when
// the host layout allows. And we use `min(..., 100%)` so that the iframe
// shrinks with its container.
from.minWidth = `${iframe.offsetWidth}px`;
iframe.style.minWidth = to.minWidth = `min(${width}px, 100%)`;
```

**Implications:**

1. The reported content width is treated as a **floor** (minimum), not a fixed size
2. The iframe can grow beyond the reported width when the container allows
3. The `min(${width}px, 100%)` allows the iframe to shrink **with its container** (responsive)
4. However, if the content shrinks but the container doesn't, the width stays at the previous value

**This is an intentional design choice** for responsive layouts, not a bug. The comment explicitly states this behavior.

### If Width Shrinking Is Needed

If an app truly needs width shrinking independent of container size, the host would need to use `width` instead of `min-width`:

```typescript
// Alternative: strict width control
iframe.style.width = to.width = `min(${width}px, 100%)`;
```

However, this would prevent the current responsive behavior where apps can expand to fill available container space.

## Changes Made

### React Example (`basic-server-react`)

- Added `showControls` state
- Added "Hide Controls" / "Show Controls" toggle button
- Conditionally renders all action sections

### Vanilla Example (`basic-server-vanillajs`)

- Added `#controls` wrapper div in HTML
- Added toggle button and JS event handler
- Added CSS for `#controls` container spacing

## Files Modified

1. `examples/basic-server-react/src/mcp-app.tsx` - Added toggle state and conditional rendering
2. `examples/basic-server-vanillajs/mcp-app.html` - Added toggle button and controls wrapper
3. `examples/basic-server-vanillajs/src/mcp-app.ts` - Added toggle event handler
4. `examples/basic-server-vanillajs/src/mcp-app.css` - Added `#controls` CSS rules

## Test Results

Tested by running `npm run examples:start` and interacting with the host at `http://localhost:8080`:

1. **React app**: Clicking "Hide Controls" correctly shrinks the iframe height
2. **Vanilla JS app**: Clicking "Hide Controls" correctly shrinks the iframe height
3. Both apps correctly grow when "Show Controls" is clicked

## Conclusion

Apps CAN resize themselves, and shrinking IS possible:

- **Height shrinking works out of the box**
- **Width shrinking is intentionally limited** to support responsive layouts where the container controls expansion
- The current behavior is by design, not a limitation of the protocol
