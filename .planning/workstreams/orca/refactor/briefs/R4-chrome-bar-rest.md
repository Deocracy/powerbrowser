# Refactor brief: R4-chrome-bar-rest

Owned, under `theia/extensions/chrome-bar/`: every tracked file **except** the ones lane R3 owns.

R3 owns `src/browser/address-bar/`, `src/browser/chrome-bar-widget.tsx`,
`src/browser/chrome-bar-suggestion-service.ts`, `src/browser/chrome-bar-places-suggestions.ts` and
`src/node/`. A change you need in those goes under Handoffs for R3.

Your files therefore include `tab-strip-widget.tsx`, `chrome-bar.css`, `chrome-bar-commands.ts`,
`chrome-bar-copy.ts`, `chrome-bar-shortcuts.ts`, `chrome-bar-keybindings.ts`,
`chrome-bar-preferences.ts`, `chrome-bar-frontend-module.ts`, `page-context-menu.ts`,
`layout-controls-widget.tsx`, `side-panel-top-tabs.ts` and `.css`, `extensions/`, `site-identity/`,
and `package.json` / `tsconfig.json` (leave those two as they are unless a bug is in them).

Notes:

- `tab-strip-widget.tsx` (1,732 lines) renders once per tab change. Look for O(n^2) work over
  tabs, per-tab listeners without disposal, drag state that is not reset on every exit path, and
  layout reads inside loops.
- `chrome-bar.css` (2,098 lines): a rule is dead only when no class, id or attribute in the whole
  tree can match it (`git grep` across `theia/`, `orca-overlay/` and `scripts/`, because live check
  scripts select elements by these classes). Do not rename a class. Do not change a value.
- `chrome-bar-copy.ts` is user-facing copy: do not change strings.
- Command ids, keybinding ids and preference keys stay as they are.
