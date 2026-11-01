---
phase: "38"
slug: webextensions
status: draft
shadcn_initialized: false
preset: none
created: "2026-10-22"
---

# Phase 38 — UI Design Contract

> Visual and interaction contract for the extension toolbar surface. Generated in
> `--auto` mode (recommended option taken everywhere, one-line reasons in 38-CONTEXT.md).

**Scope note.** This spec extends 29-UI-SPEC / 30-UI-SPEC (pill, dropdowns, layer
policy, Esc sequence, `{App}` copy rule) and inherits 27-UI-SPEC (nav-button
tooltips, shortcut text). It adds, for EXT-06/07:

- extension action buttons in the chrome-bar row (icon, badge, enabled/disabled,
  pressed-while-open)
- page-action icon in the address pill (per-tab show/hide, click path identical
  to toolbar buttons — B2, plan 38-03)
- the extensions (puzzle) menu: pinned section, overflow section, per-extension
  rows (Pin to Toolbar, Manage, Remove), footer entries
- the extension popup host geometry and focus/close contract
- extension sidebar as a Theia side-panel view (B5 ruling, plan 38-04)
- extension keyboard-shortcut affordance: button tooltips name the bound shortcut
  (B5 ruling, plan 38-04)
- empty, error, and overflow states; badge text rules; copy strings

Hard rules that bind every row below (inherited): no Theia core patch, no Firefox
internal outside `PowerBrowserAPI.sys.mjs`, no custom browser chrome beyond the
chrome bar row, no internal identifier in user-facing text, product/engine names
from configuration and engine data only, every new dropdown a
`.pb-chrome-bar-dropdown` portal (never over a page from Theia DOM — the popup is
a native XUL panel, D-02).

---

## Design System

| Property | Value |
|----------|-------|
| Tool | **none**. Same standing reason as 01/13/27/29/30-UI-SPEC: no Vite/Next app; Theia widgets inherit `--theia-*` theming; a second token system would fork theming and break rebrand-without-recompile. No `components.json` in the tree. |
| Preset | not applicable |
| Component library | `@theia/core@1.76.0` primitives only (`Menu`, `MenuPath`, `ReactWidget`, `PreferenceService`/preferences editor for Manage target). New use: no new framework; popup content is extension HTML in a XUL `<browser>`, not a Theia widget. |
| Icon library | Extension-supplied icons (chrome-read, `extension.getIconURL`-equivalent via action API) + installed `@vscode/codicons@0.0.45` for puzzle glyph and row affordances (`puzzle`, `pin`, `gear`, `trash`, `check`). |
| Font | Delegated, unchanged: bar inherits the Theia UI font; `@powerbrowser/*` carries no font-family literal. |

Component Inventory and Element-to-Component Binding are omitted (`Tool: none`).

---

## Spacing Scale

Inherited unchanged (30-UI-SPEC § Spacing). Values are multiples of 4, plus the
inherited 12px `md-gap` step.

| Token | Value | Usage in Phase 38 |
|-------|-------|-------------------|
| xs | 4px | Button internal padding; badge offset; menu padding |
| sm | 8px | Gap inside rows; badge min-width padding |
| md-gap | 12px | Row horizontal padding (inherited); button-to-button gap |
| md | 16px | Action icon slot (16×16); menu row icon slot |
| lg | 24px | Button hit area 24×24 minimum; row height 32px inherited |
| xl | 32px | Menu row height (inherited from modes menu) |
| 2xl | 48px | Not used |
| 3xl | 64px | Not used |

**Geometry (Decided, autonomous, recommended):**

- **Action button** (`.pb-ext-action`): 28×28 hit area, 16×16 icon centred,
  transparent fill; hover `--theia-toolbar-hoverBackground`; `border-radius: 4px`.
  Disabled: 40% opacity, no hover. While its popup is open: pressed fill
  (`--theia-toolbar-activeBackground`).
- **Badge** (`.pb-ext-badge`): absolute, bottom-right of the icon, min-width 16px,
  height 16px, `border-radius: 9999px`, 11px/400 text, accent fill with theme
  foreground; capped text at 4 chars (e.g. `999+`); empty badge renders nothing.
- **Buttons row**: actions sit between the pill and New Tab in Browsing, after the
  pill in Coding/Organising; pinned set (max 3 visible by default, D-discretion)
  inline, remainder in the puzzle menu. Overflow threshold is a preference-free
  constant (3) this milestone.
- **Page-action icon** (B2, EXT-08 SC3): a 16×16 icon inside the address pill's
  leading slot, visible only when the page action's `isShownForTab(selectedTab)`
  is true (per-tab: pattern-match on the overlay URL, hidden on non-matches and
  with zero overlays). Same 28×28 hit area, same tooltip voice (`{name}`), same
  click path (`extensionClick` → `triggerClickOrPopup(selectedTab)`). When hidden
  the slot collapses (no empty gap); it never shifts pill text (icon overlays the
  slot padding, matching Firefox's page-action-in-URLbar behaviour).
- **Puzzle menu** (`.pb-chrome-bar-dropdown.pb-ext-menu`, D-01): anchored at the
  puzzle button, `top: calc(100% + 4px)`, `width: 300px`, `padding: 4px`;
  heading rows 24px; extension rows 32px with `padding: 0 12px`, `gap: 8px`;
  separators 1px with `margin: 4px 0`. Same max-height rule as the result dropdown.
- **Popup host**: native XUL `<panel>` in `powerbrowser.xhtml` positioned from the
  rect Theia reports (`{left, top, width, height}` in CSS px, shell window space);
  default 320×400 clamped to the window; extension content decides inner scroll.
  The panel closes on Esc, focus-out to the page, tab switch, or a second click on
  the action button. Focus returns to the pill when the user closes it (Esc, a
  click outside, a second click); when focus moved into a page or the tab changed,
  focus stays where it went.
- **Sidebar view** (B5 ruling): the extension's sidebar page renders as a Theia
  view in the left or right side panel (same `SidePanelHandler` the top-tabs bar
  rebinds — `chrome-bar-frontend-module.ts:66`), titled with the extension name,
  closable via the panel's own affordance. The sidebar `<browser>` content is the
  extension's `default_panel` page loaded in a chrome-privileged browser (NOT a
  web tab — `moz-extension://` never enters an overlay).
- **Shortcut affordance** (B5 ruling): when a command is bound, the action button
  tooltip appends the shortcut in Phase-27 table form (`{name} ({shortcut})`);
  there is no shortcuts settings UI in this phase (deferred).

Exceptions: none.

---

## Typography

No new size, no new weight. Inherited (30-UI-SPEC § Typography):

| Role | Size | Weight | Line Height | Applies to in Phase 38 |
|------|------|--------|-------------|------------------------|
| Body | 14px | 400 | 1.5 | Menu section labels; popup fallback text |
| Label | 13px | 400 | 1.4 | Extension row name; button tooltips (`pb-chrome-bar-hover`) |
| Caption | 12px | 400 | 1.5 | Badge text (11px exception, see below); row captions (version/state); footer hints |

Badge text is 11px/400 — the single exception (badges are unreadable at 12px in a
16px pill; matches Firefox's badge scale).

---

## Color

Inherited Theia theme tokens only; no literal colour in `chrome-bar` sources.

| Role | Value | Usage |
|------|-------|-------|
| Dominant | `--theia-editor-background` family | Bar, menu surfaces |
| Secondary | `--theia-sideBar-background` family | Hover, pressed, section fill |
| Accent | `--theia-button-background` family | Badge fill ONLY |
| Destructive | `--theia-errorForeground` family | Remove row text/icon only |

Accent reserved for: badge fill. Never for row text, icons, or focus rings.

---

## Copywriting Contract

All strings live in `CHROME_BAR_COPY` (`chrome-bar-copy.ts`); TSX carries no
literal user-facing string. `{App}` is `appSubject()` (configured app name).

| Element | Copy |
|---------|------|
| Puzzle button tooltip | `Extensions` |
| Action button tooltip | `{name}` (+ `{shortcut}` when a shortcut is bound, Phase 27 table form) |
| Puzzle menu heading (pinned) | `Pinned` |
| Puzzle menu heading (overflow) | `Extensions` |
| Empty puzzle menu | Heading: `No extensions installed` / Body: `Install one from {App} Add-ons.` + next step: footer `Install from add-ons site` opens the AMO flow |
| Row: Pin to Toolbar | `Pin to Toolbar` / `Unpin from Toolbar` (toggled) |
| Row: Manage | `Manage Extension` |
| Row: Remove | `Remove Extension` |
| Row: Sidebar toggle | `Show Sidebar` / `Hide Sidebar` (toggled; only for extensions with a sidebar page) |
| Remove confirm | `Remove {name}?`: `The extension and its data stay in the profile until the browser restarts.` Choices: `Remove` / `Cancel` |
| Install prompt (stock) | Stock `PopupNotifications` strings (Phase 37 host); no authored copy |
| Install failure | `Could not install {name}.` + next step `Try again or install from a file.` |
| Popup load failure | `This extension's popup could not be shown.` + next step `Reload the tab and try again.` |
| Disabled action row caption | `Disabled for this page` (e.g. `show_matches` exclusion) |
| Error state (bridge down) | `{App} could not reach the extension. Restart {App} and try again.` |

No internal identifier (extension id, tab id, pref key, port, timeout, raw
exception) appears in any string above. The id surfaces only in the diagnostics
layer (`shell-error-copy-no-internals` gate).

---

## UI Considerations

Applicable state considerations resolved: 9 covered, 1 backstop, 0 unresolved.

| Category | Element(s) | Status | Resolution / Reason |
|----------|------------|--------|---------------------|
| empty | puzzle menu, no extensions | ✅ covered | Empty heading + body + install footer render (copy rows above) |
| empty | badge with no text | ✅ covered | Badge node is absent, not an empty pill |
| loading | popup browser loading | ✅ covered | Panel shows at default size; extension paints when ready; no spinner authored |
| error | popup load failure, install failure, bridge down | ✅ covered | Copy rows above; failure rows never carry ids |
| disabled | `show_matches` exclusion, no active tab | ✅ covered | Button 40% opacity + `Disabled for this page` caption; click is a no-op with tooltip |
| overflow | >3 pinned, long names | ✅ covered | Remainder in puzzle menu; name capped at 160px ellipsis like the mode chip |
| long-text | extension name > row width | ✅ covered | Ellipsis at 160px; full name in tooltip |
| zero-one-many | 0/1/N extensions | ✅ covered | 0 → empty state; 1 → single row, no section header; N → pinned + overflow sections |
| focus | popup open, popup closed | ✅ covered | Open moves focus into the popup browser; close returns focus to the pill |
| visual-geometry | pixel rendering on KDE Wayland | 🧪 backstop | Gates read DOM/strings; rendering is a manual KWin + spectacle check at verify-work |

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| Theia core | none new | not required |

---

## Checker Sign-Off

- [ ] Dimension 1 Copywriting: PASS
- [ ] Dimension 2 Visuals: PASS
- [ ] Dimension 3 Color: PASS
- [ ] Dimension 4 Typography: PASS
- [ ] Dimension 5 Spacing: PASS
- [ ] Dimension 6 Registry Safety: PASS
- [ ] Dimension 7 Inventory Provenance: PASS

**Approval:** pending
