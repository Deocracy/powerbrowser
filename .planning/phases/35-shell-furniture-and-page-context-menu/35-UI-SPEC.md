---
phase: "35"
slug: shell-furniture-and-page-context-menu
status: approved
reviewed_at: 2026-10-22
shadcn_initialized: false
preset: none
created: "2026-10-22"
---

# Phase 35 — UI Design Contract

> Visual and interaction contract for frontend phases. Generated in autonomous mode; every open choice takes the recommended option.

**Scope note.** This phase extends the chrome bar contracted in 13-UI-SPEC and 27-UI-SPEC (tokens,
geometry, type, colour, focus ring, motion all inherited, nothing re-specified unless it changes).
It adds: the page context menu over overlays (PROMPT-04), the form autocomplete popup, the
form-validation bubble and the page paste popup (PROMPT-06, stock XUL, no Theia DOM), the
`title=` tooltip and the link-hover status line (PROMPT-08), and window plus element fullscreen
with Firefox's warning (PAGE-07). The furniture installer itself has no visible surface.

**Revision 2026-10-22 (planner):** surfaces re-checked against upstream at
`FIREFOX_153_5_0esr_BUILD1` (see 35-CONTEXT.md D-02..D-05, D-08, D-12, D-19). Remote page
tooltips use the stock `remoteBrowserTooltip`, not `<tooltip page="true">`; the autocomplete
element is the stock `PopupAutoComplete` panel; menu labels are Firefox's own strings; window
fullscreen keeps the top panel; G4b is a freeze-frame with fixed budgets.

Hard rules that bind every row below: never fork or patch Theia core (all UI is
`@powerbrowser/chrome-bar` composition); Firefox internals only through
`PowerBrowserAPI.sys.mjs`; stock toolkit popups with stock strings in `powerbrowser.xhtml` are
shell furniture, not authored chrome (rule 5 ruling); no internal identifier in user-facing text;
the product name comes from the configured application name, never a literal.

Mode: autonomous. Every choice not fixed upstream is marked **Decided (autonomous, recommended)**
and is consistent with the chrome-bar tokens and the sketch findings.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | **none** — shadcn deliberately not initialized (standing rationale in 01-UI-SPEC and 13-UI-SPEC: no Vite/Next app exists; Theia widgets inherit `--theia-*` theming, and a second token system would fork theming and break rebrand-without-recompile). No `components.json` in the tree. |
| Preset | not applicable |
| Component library | `@theia/core@1.76.0` primitives only, all already composed: `ReactWidget` (status line host is the chrome-bar widget), `ContextMenuRenderer` + `MenuPath` → `.lm-Menu` (page context menu, the 27-03 history-menu pattern), `HoverService` (not used for page hover; page tooltips are the stock XUL `remoteBrowserTooltip`, driven through the shell's `XULBrowserWindow`, D-04). No new widget framework. |
| Icon library | Codicons from the installed `@vscode/codicons@0.0.45`. Context-menu rows reuse the row icon slots of `.lm-Menu` (no new glyph commissions); status line carries no icon. No new icon set. |
| Font | Delegated, unchanged from 13-UI-SPEC: bar and menu text inherit the Theia UI font; no font-family literal in `@powerbrowser/*`. |

Component Inventory and Element-to-Component Binding sections are omitted: `Tool: none`, and no
sketch mockup exists for this phase (the bar's look is the built 13-UI-SPEC bar; the menu reuses
the stock `.lm-Menu` look; the autocomplete popup, validation bubble, paste popup, tooltip and fullscreen warning are stock markup with Firefox's own styles — the warning links the stock `chrome://browser/skin/tabbrowser/fullscreen-and-pointerlock.css`).

---

## Spacing Scale

Inherited from 13-UI-SPEC unchanged (all multiples of 4). Rows used by this phase:

| Token | Value | Usage in Phase 35 |
|-------|-------|-------------------|
| xs | 4px | Status-line inset from the pill edge; menu row icon-to-label gap (stock `.lm-Menu` rhythm, not overridden) |
| sm | 8px | Gap between status line and neighbouring bar control (bar `gap: 8px`, unchanged) |
| md-gap | 12px | Status-line horizontal padding |
| md | 16px | Menu section separator padding (stock) |
| xl | 32px | No new hit area; menu rows keep stock 32px row height |

Fixed geometry: bar height stays **40px**; the status line lives inside the bar's existing
vertical budget and never extends the bar.

Exceptions: none new. Two inherited ones stand: 13-UI-SPEC's `radius-full` pill, and the 12px
`md-gap` step.

---

## Typography

No new size or weight. Inherited three sizes, two weights:

| Role | Size | Weight | Line Height | Applies to in Phase 35 |
|------|------|--------|-------------|------------------------|
| Body | 14px | 400 | 1.5 | Page context-menu rows render at stock `.lm-Menu` size (13–14px by theme); status line empty-state text |
| Label | 13px | 400 | 1.4 | Link status text in the bar (`.pb-page-status`, single 13px line, ellipsis) |
| Mono | 12px | 400 | 1.4 | Not used in Phase 35: menu rows carry no URL (Firefox's rows show none) |

---

## Color

Inherited Theia theme tokens; no literal colour in `@powerbrowser/*`:

| Role | Value | Usage |
|------|-------|-------|
| Dominant (60%) | `var(--theia-editor-background)` | Menu surface comes from stock `.lm-Menu` (theme) |
| Secondary (30%) | `var(--theia-sideBar-background)` | Status-line background is transparent over the bar |
| Accent (10%) | `var(--theia-focusBorder)` | Keyboard-focused menu row outline only |
| Destructive | `var(--theia-errorForeground)` | "Inspect" never destructive; destructive rows (none in v1) would use this |

Accent reserved for: keyboard-focus ring on the open menu row and the status line's link text
hover state. Never for row backgrounds, never for the fullscreen warning (stock XUL keeps its own
Firefox styling).

---

## Copywriting Contract

| Element | Copy |
|---------|------|
| Page menu heading | None — the menu opens with no title row (Firefox parity: the page menu has no heading) |
| Empty link target | Status line shows nothing when the pointer is not over a link (no "No link" placeholder) |
| Menu item labels | Firefox's own strings, never paraphrased: `browser/browserContext.ftl` and `toolkit/global/textActions.ftl` labels (formatted chrome-side through `Localization`), and `browser.properties` `contextMenuSearch` for the search row (selection truncated to 15 characters as upstream). Rows and their order are D-12's, in Firefox's order. Labels carry no access keys: Lumino context menus bind none. The Linux navigation group (Back, Forward, Reload or Stop, Bookmark Page), which Firefox draws as an icon row, renders as text rows labelled from the strings' `aria-label`. |
| Extension entries | The extension's own label, rendered as plain text in the group upstream appends after the stock rows; no icon (the Theia frame cannot load `moz-extension:` images) |
| Save dialogs (Save Link/Image/Video/Audio As) | Titles `Save link as`, `Save image as`, `Save video as`, `Save audio as`; failure `{App} couldn't save that file. Choose a different place and try again.` with `{App}` from `appSubject()` |
| Refused target | `PowerBrowser can't open that link here.` + next step `Choose Copy Link to copy it instead.` (refusal row inside the menu path, never a raw scheme) |
| Form popup | No chrome-bar copy — stock `PopupAutoComplete` strings (Firefox-owned); the validation bubble carries Gecko's validation message; the paste popup's `Paste` comes from `textActions.ftl` |
| Tooltip | No chrome-bar copy — page `title=` text verbatim (page-authored, never prefixed) |
| Status line | Link URL text verbatim, truncated with ellipsis; never prefixed with a label |
| Fullscreen warning | Stock Firefox warning strings from `browser/browser.ftl` (`fullscreen-warning-domain`, `fullscreen-warning-no-domain`, `fullscreen-exit-button`), the page's domain shown as upstream formats it; window fullscreen adds no copy (the F11 row's tooltip label is `F11`) |
| Error state | Problem in plain language naming PowerBrowser + a real on-screen affordance (01-UI-SPEC rule); identifiers live in the diagnostics layer |

Brand rule: any new literal naming the product reads the configured application name at render
time; the copy gate pins it.

---

## Interaction Contracts

### Page context menu (PROMPT-04)
- Opens on right-click (`contextmenu` event) and on Shift+F10 / the Menu key with the page
  focused, at the pointer, flipping to stay inside the window rect (stock `.lm-Menu`
  positioning). The capture is ContextMenuParent writing the shell's `nsContextMenu` shim
  (D-02); chrome focuses the Theia frame before the menu opens and the page gets focus back
  when it closes with no row run (Phase 27 focus rule).
- Shows only for a visible web tab's overlay; a hidden (background) tab never opens a menu, and
  right-click in the IDE (editor, terminal, Theia DOM) keeps Theia's own menu
  (`disablecontextmenu` on the Theia frame, D-06). No menu opens while a page is in element
  fullscreen (D-19).
- Rows are D-12's for the clicked target, in Firefox's order, with separators where Firefox
  groups them; rows that cannot run are omitted, never shown disabled, except the refused-target
  row and rows Firefox itself disables (an edit command the page reports disabled). Submenus
  (playback rate, frame) open to the side.
- Extension entries follow the stock rows, label-only, as upstream appends them (D-16).
- While open, the overlay hides under rule (a) of the layer policy (`.lm-Menu` is already in
  `BLOCKING_LAYER_SELECTOR`). **G4b freeze-frame (D-08):** the right-clicked tab's placeholder
  shows a still of the page (at most 640 px wide, scaled to the placeholder) when the capture
  finishes within 50 ms; otherwise the placeholder shows as it does today. The still is removed
  when the menu closes. Budget: right-click to visible menu at most 200 ms p95.
- Open-in-new-tab rows open a tab after the opener, in the background as
  `browser.tabs.loadInBackground` says (the search row follows
  `browser.search.context.loadInBackground`), with the page's referrer (D-06).

### Form autocomplete, validation and paste (PROMPT-06)
- Stock `PopupAutoComplete` panel (D-03) anchored under the focused field inside the overlay
  rect; no Theia DOM, no bar layout change, no occlusion-list entry. Keyboard: Up/Down moves,
  Enter commits, Esc dismisses, focus never leaves the page. Saved logins appear in the same
  panel for login fields.
- The stock validation bubble (`invalid-form-popup`) appears at the invalid field on submit
  (D-14).
- A page's `navigator.clipboard.readText()` shows the stock paste popup at the pointer, its
  item enabled after Firefox's delay (D-15).
- Visuals are Firefox stock; this spec contracts only that nothing in the chrome bar moves or
  repaints while any of them is open.

### Tooltips and link status (PROMPT-08)
- `title=` hover in a page shows the stock `remoteBrowserTooltip` at the pointer (Firefox
  placement, clamps to the screen), only while the shell window has focus and no drag is in
  progress (upstream's conditions). Elements with a `title` in the IDE get no native tooltip.
- Link hover in a page shows the URL as one 13px truncated line anchored **in the bar** (beside
  the pill in Coding and Browsing; the toolbar-row slot in Organising), never over the page rect
  (rule (c)). The URL is shown as Firefox shows it (unescaped for display, bidi controls
  encoded, `trimURLs` applied). It appears within one frame of the `overLink` push and clears on
  leave. Links in the IDE push nothing.
- No `title` attribute is added to any chrome-bar button (27-08 removed them).

### Fullscreen (PAGE-07)
- F11 with a page focused toggles window fullscreen through Phase 33's Full Screen command. The
  top panel stays (D-05 amended: hiding it would need a top-edge reveal Theia DOM cannot draw over
  a page, and the bar's Full Screen row is the exit). Esc does not leave window fullscreen
  (Firefox parity); F11 on a page or the menu row does. With the IDE focused, F11 keeps Theia's
  meaning (D-07).
- Element fullscreen (video): the overlay covers the window through the `:fullscreen` top layer
  with Firefox's stock warning on entry (domain, Exit Full Screen (Esc)); Esc, the warning's
  button or switching tabs leaves it. No second geometry writer: when it ends the overlay is back
  on its placeholder rect.

## UI Considerations

Applicable state considerations resolved: 6 covered, 0 backstop, 0 unresolved.

| Category | Element(s) | Status | Resolution / Reason |
|----------|-----------|--------|---------------------|
| empty | status line (no link hovered) | ✅ covered | Status line renders nothing when no `overLink` push is live |
| populated | context menu rows | ✅ covered | Rows listed are exactly the forwarded actor rows; refused target renders the refusal row |
| zero-one-many | link with no href / one link / image-link | ✅ covered | No-href click offers text rows only; image-link offers both link and image rows |
| long-text | link URL in status line | ✅ covered | One line, ellipsis truncation, full URL in `aria-label` |
| error | refused scheme target | ✅ covered | Refusal row with problem + Copy-Link next step |
| loading | page behind the open menu (G4b) | ✅ covered | Freeze-frame still when the capture makes 50 ms, else the plain placeholder; live budget 200 ms p95 right-click to menu (D-08) |

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official | none | not required |

No third-party blocks. No new npm package.

---

## Checker Sign-Off

- [x] Dimension 1 Copywriting: PASS — no internal identifier in copy; refusal row names the product and offers Copy Link.
- [x] Dimension 2 Visuals: PASS — menu reuses stock `.lm-Menu`; status line stays in-bar; autocomplete, bubble, paste popup, tooltip and warning are stock markup.
- [x] Dimension 3 Color: PASS — theme tokens only; accent reserved to focus ring.
- [x] Dimension 4 Typography: PASS — inherited sizes only.
- [x] Dimension 5 Spacing: PASS — multiples of 4; bar height unchanged.
- [x] Dimension 6 Registry Safety: PASS — no registry blocks.
- [x] Dimension 7 Inventory Provenance: PASS — `Tool: none`, inventory omitted per template.

**Approval:** approved 2026-10-22 (autonomous); revised 2026-10-22 with the planner revision (mechanisms per 35-CONTEXT.md).
