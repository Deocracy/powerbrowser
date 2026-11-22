# Refactor brief: R3-chrome-bar-address

Owned, under `theia/extensions/chrome-bar/src/`:

- `browser/address-bar/` (all files)
- `browser/chrome-bar-widget.tsx`
- `browser/chrome-bar-suggestion-service.ts`
- `browser/chrome-bar-places-suggestions.ts`
- `node/` (all files)

Not owned: every other file in the extension, including `chrome-bar.css`, belongs to lane R4.
A CSS change you need goes under Handoffs for R4.

Notes:

- `address-bar.tsx` (3,305 lines) and `chrome-bar-widget.tsx` (2,448 lines) are the two largest
  frontend files. Splitting them is out of scope at this depth; simplify inside them.
- The address bar runs on every keystroke. Look for: suggestion requests that are not cancelled or
  are answered out of order, work repeated per keystroke that depends only on the tab or the mode,
  re-renders of the whole bar for a change that concerns one row, listeners added per render or per
  focus without disposal, and state set after the widget is disposed.
- `chrome-bar-widget.tsx` subscribes to the current web tab's state. Look for subscriptions that
  are not disposed when the current tab changes, and render-time work that could be derived once
  per state change.
- The exported names other extensions and the frontend module import stay as they are.
