---
phase: "32"
slug: page-tools
status: draft
shadcn_initialized: false
preset: none
created: "2026-10-22"
---

# Phase 32 — UI Design Contract

> Visual and interaction contract for page tools (PAGE-01,02,03,04,05,06,08,09,10,11).
> Generated in `--auto` (standing autonomous rule); every open choice takes the recommended option.

**Scope note.** This phase extends the chrome bar contracted in 13/27/29/30-UI-SPEC.
Tokens, geometry, type, colour, focus ring, motion, the layer policy and the `{App}` copy
rule are all inherited and are not re-specified unless they change. It adds, for PAGE-01..06
and PAGE-08..11:

- a Theia-rendered find bar that shrinks the page rect (PAGE-01)
- a zoom chip in the pill (PAGE-02)
- a downloads button and panel (PAGE-06)
- favicon and audio marks on tabs / strip / pill (PAGE-04, PAGE-05)
- a reader toggle, view-source and devtools entries, Edit-menu wiring (PAGE-08..10)
- a crashed-tab reload affordance (PAGE-11)

Hard rules that bind every row below:

- Never fork or patch Theia core. All UI is `@powerbrowser/chrome-bar` composition plus
  `@theia/core@1.76.0` primitives already composed.
- Firefox internals only through `powerbrowser/shell/PowerBrowserAPI.sys.mjs`.
- No custom browser chrome beyond the chrome bar itself; F12 opens the stock DevTools
  window, never a custom inspector.
- No internal identifier in user-facing text; `{App}` is `appSubject()` (configured
  `applicationName`, else "The browser"); `{engine}` is never written in Theia source.
- New `webTab*` kinds run only from widget event handlers, never as bare command ids.
- The find bar is the granted shrink-the-page exception; every other new layer is a
  `.pb-chrome-bar-dropdown`-class layer under the existing layer policy.

**Phase boundaries.** PAGE-07 fullscreen is Phase 35. MENU-03 entries and SMODE-07
Actions-mode rows are Phase 33 (they consume the kinds built here). Tab-menu Mute /
Bookmark items are Phase 34. Per-site zoom memory is a Future Requirement (deferred).

---

## Design System

| Property | Value |
|----------|-------|
| Tool | **none** — shadcn deliberately not initialized (standing rationale in 01/13/27/29-UI-SPEC: no Vite/Next app exists; Theia widgets inherit `--theia-*` theming; a second token system would fork theming and break rebrand-without-recompile). No `components.json` in the tree. |
| Preset | not applicable |
| Component library | `@theia/core@1.76.0` primitives only, all already composed: `ReactWidget` (bar, find bar, downloads panel), `ContextMenuRenderer` + `MenuPath` → `.lm-Menu` (downloads item menu, Edit-menu pattern), `HoverService` (tooltips), `KeybindingRegistry` (page-focus-scoped bindings), `DialogService` / file dialog (save destination picker), `ApplicationShell` (tab activation for crash reload / reader). No new widget framework. |
| Icon library | Codicons from the installed `@vscode/codicons@0.0.45`. New glyphs, each confirmed present 2026-10-22 by grep of `dist/codicon.css`: `search` (find), `zoom-in`, `zoom-out` (zoom buttons), `arrow-down` / `arrow-up` (find next/previous), `close` (find close, panel close), `printer` (print entry), `save` (save entry), `volume` / `mute` (audio mark, mute toggle), `cloud-download` (downloads button), `folder-opened` (show in folder), `refresh` (retry, crash reload), `book` (reader toggle), `code` (view source), `tools` (devtools entry). No new icon set. |
| Font | Delegated, unchanged: bar text inherits the Theia UI font; `@powerbrowser/*` carries no font-family literal. |

Component Inventory and Element-to-Component Binding sections are omitted: `Tool: none`,
and no sketch mockup exists for this phase.

---

## Spacing Scale

Inherited unchanged (all multiples of 4, plus the inherited 12px `md-gap` step).

| Token | Value | Usage in Phase 32 |
|-------|-------|-------------------|
| xs | 4px | Gap between find-bar field and its buttons; zoom-chip inner padding |
| sm | 8px | Bar `gap: 8px` (unchanged); gap between find input, count and toggles; downloads row icon-to-text gap |
| md-gap | 12px | Find-bar and downloads-panel row horizontal padding (reuses dropdown row rule) |
| md | 16px | Leading icon slots 16×16 (find, downloads rows, audio/zoom marks); dropdown/panel padding (unchanged) |
| xl | 32px | Find bar height 32px; downloads rows 32px single-line (matches 29-UI-SPEC rows); all tool buttons 32×32 (`.pb-chrome-bar-button`) |
| lg / 2xl / 3xl | 24 / 48 / 64px | Not used |

Fixed geometry:

- Bar height stays **40px**; every tool button stays **32×32** with `border-radius: 4px`.
- Find bar: 32px tall, full-width strip docked directly above the page region, page rect shrunk by exactly its height; never overlays the page.
- Downloads panel: `.pb-chrome-bar-dropdown`-class panel anchored under the downloads button, `max-height: min(432px, calc(100vh - <top> - 8px))`, `overflow-y: auto` (same cap idiom as 29-UI-SPEC).
- Zoom chip: pill-height chip (inside the pill, after the lock in Address mode / after the mode button in mode order), 16px icon + label, one click resets.

Exceptions: none new.

---

## Typography

No new size or weight. Inherited three sizes, two weights:

| Role | Size | Weight | Line Height | Applies to in Phase 32 |
|------|------|--------|-------------|------------------------|
| Body | 14px | 400 | 1.5 | Find input text; downloads row titles; crash-reload message |
| Label | 13px | 400 | 1.4 | Find match count; downloads row captions and tooltips (stock `.lm-Menu` / `pb-chrome-bar-hover`); zoom-chip label; reader toggle tooltip |
| Caption | 12px | 400 | 1.5 | Downloads progress percent; find "Phrase not found" hint; panel footer hints |

Weight 600 stays reserved for the active mode-toggle segment. Matched find hits in the
page are painted by the content finder (highlight wash), never by emboldening bar text.

---

## Color

Locked sketch theme, inherited unchanged. No new hue, no new token.

| Role | Value | Usage in Phase 32 |
|------|-------|-------------------|
| Dominant (60%) | `#1c1b22` (`--color-bg`) | Find-bar fill; downloads panel fill (dropdown rule) |
| Secondary (30%) | `#2b2a33` (`--color-surface`) panel fill, `#35343f` (`--color-surface-raised`) row hover, `#3f3e4a` (`--color-border`) hairlines | Find-bar bottom hairline; downloads rows and hover |
| Text | `#fbfbfe` / `#9a99a8` | Row titles in `--color-text`; counts, captions, footer hints in `--color-text-muted` |
| Accent (10%) | `#00a6f5` (`--color-primary`) | See reserved-for list — **no addition this phase** |
| Success | `#8ad38a` | Unchanged (lock glyph only) |
| Destructive | **none declared** | Cancel download uses the text button idiom, never a destructive colour; no destructive action is added |

**Accent reserved for — exhaustive list after this phase (unchanged, 7 items).**
Items 1–7 exist (13/27/29-UI-SPEC). This phase adds none: the zoom chip, find toggles,
downloads rows and audio marks all use text/muted ink; the find highlight wash in the
page is the content finder's own highlight, not bar accent; keyboard-highlighted rows in
the downloads panel reuse the existing item-3 wash (no new meaning).

Every `:focus-visible` outline (`2px solid var(--color-primary)`, `outline-offset: 2px`)
is the inherited accessibility contract and applies unchanged to the find field, chip,
downloads button and panel rows.

---

## Copywriting Contract

Inherited rules:

- No internal identifier in user-facing text: no pref key, kind name, actor name, port, timeout or raw exception.
- `{App}` is `appSubject()`; engine names are never literals.
- Every error ends with a next step that is a real affordance on screen.
- All new strings live in `CHROME_BAR_COPY`, so `verify-shell-error-copy.mjs` pins them by set equality.

| Element | Copy |
|---------|------|
| Find bar `aria-label` | **"Find in page"** |
| Find input placeholder | **"Find in page"** |
| Find match count | **"{current} of {total}"**; empty query shows no count; no match shows **"Phrase not found"** |
| Find toggles | Tooltips + `aria-pressed`: **"Highlight all"**, **"Match case"**, **"Whole words"** |
| Find next / previous | Tooltips **"Next match (F3)"**, **"Previous match (Shift+F3)"** |
| Find close | Tooltip **"Close find bar (Esc)"**; Esc also clears the content selection |
| Zoom chip label | **"{percent}%"** (e.g. "110%"); tooltip **"Zoom level — select to reset to 100%"**; chip shows only when level ≠ 100% |
| Zoom buttons (menu/palette rows, Phase 33 owns entries) | **"Zoom in (Ctrl++)"**, **"Zoom out (Ctrl+−)"**, **"Reset zoom (Ctrl+0)"** — copy fixed here so Phase 33 reuses it verbatim |
| Downloads button | Tooltip **"Downloads"**; badge count is `aria-label` **"{n} downloads"**; empty shows no badge |
| Downloads panel heading | **"Downloads"**; empty state **"No downloads yet."** with body **"Files you download appear here."** |
| Downloads row actions | **"Open"**, **"Show in folder"**, **"Cancel"**, **"Retry"**; progress caption **"{percent}% — {bytes}"**; failed caption **"Failed — Retry"** |
| Save page | File-dialog title **"Save page as"**; failure row **"{App} couldn't save that page. Choose a different place and try again."** |
| Edit menu (page focused) | **"Cut"**, **"Copy"**, **"Paste"**, **"Undo"** — stock labels; disabled unless the focused page reports the command enabled |
| Reader toggle | Tooltip **"Reader view"** / **"Exit reader view"**; non-article tooltip **"Reader view isn't available for this page"** (toggle disabled) |
| View source | **"View page source (Ctrl+U)"** |
| Devtools | **"Developer tools (F12)"** |
| Crashed tab | **"This tab crashed. Reload to try again."** with button **"Reload tab"** |
| Print failure | **"{App} couldn't open the print dialog. Press Ctrl+P to try again."** |

Settings keys: none new in this phase (suggestions/engine keys are Phase 29's). Zoom,
find-toggle and reader states are per-tab session state, never preferences.

`aria-keyshortcuts` and tooltip shortcut text come from the derived shortcut table, never
from `KeybindingRegistry` (27-UI-SPEC rule).

---

## Interaction Contract (PAGE-01..06, 08..11)

### Bar composition (left to right, additions only)

| Order | Element |
|-------|---------|
| Unchanged | Back, Forward, Reload/Stop, Home (optional), New Tab (27-UI-SPEC) |
| Unchanged | Pill with mode button, lock, zoom chip slot, input (29/30-UI-SPEC + D-05 chip) |
| New | Reader toggle (enabled only on article pages; hidden on non-web tabs) |
| New | Downloads button with count badge (hidden badge at zero) |
| Unchanged | Mode toggle, layout controls, hamburger (31-UI-SPEC owns the menu) |

Reader and downloads controls are disabled-not-removed on non-web tabs (the 13-UI-SPEC
layout-stability rule).

### Find in page (PAGE-01)

- **Open:** Ctrl+F with a web tab active opens the find bar focused with the current
  selection (or empty); F3 reopens it when closed and steps to the next match.
- **Layout:** the bar docks above the page region and the page rect shrinks by its
  height (the granted exception); the bar never covers the page.
- **Search:** typing runs `fastFind` on Enter/debounce per the kind contract; toggles
  (highlight-all, match-case, whole-words) re-run the search; next/previous run
  `findAgain`; the count shows `{current} of {total}` or "Phrase not found".
- **Close:** Esc closes the bar, clears the content selection (`removeSelection`) and
  returns focus to the page. The bar's query is kept per tab in memory (like BAR-12
  drafts) and restored when the tab is reactivated.
- **Keys while the bar is focused:** Enter = next, Shift+Enter = previous, F3 / Shift+F3
  pass through, Esc closes. Ctrl+F in editors/terminals keeps Theia's find (KEY-04).

### Zoom (PAGE-02)

- Ctrl+plus / Ctrl+minus / Ctrl+0 act on the active overlay only while a web page has
  focus (page-focus scope); in editors they keep Theia's meaning.
- The pill chip appears only when the live level ≠ 100% and shows `{percent}%`; one
  click (or Ctrl+0) resets to 100% and the chip disappears.
- The chip label reflects the pushed live level; it never reads preferences.

### Print (PAGE-03)

- Ctrl+P with a web page focused opens the **system** print dialog for that overlay;
  everywhere else it keeps Theia's Go to File.
- `window.print()` from page content has no shell path in this phase; the print row
  asserts it absent-with-reason unless an executor proves the stock path already
  reaches the overlay without a shim (D-09a).
- No preview UI is authored; tab-modal preview is never built.

### Favicons (PAGE-04)

- Tabs, strip rows and pill rows render the pushed `data:image/` icon; anything else
  falls back to `codicon-globe` (heuristic/engine rows per 29-UI-SPEC `iconFor`).
- Showing an icon never fetches over the network.

### Audio and mute (PAGE-05)

- A playing tab shows the audio mark on its tab and strip row; the mark is muted-ink
  variant when `audioMuted` is true.
- Mute toggles from the tab/strip affordance or Ctrl+M (page-focus scope); the pill
  never carries a mute button (strip/tab own it per Phase 34 boundary).
- Ctrl+M in editors keeps Theia's meaning.

### Downloads (PAGE-06)

- The button badge counts in-progress + unread-finished items; opening the panel marks
  finished items read and clears the unread count.
- Rows are single-line 32px with a 16px icon, title, caption, progress or action
  buttons; keyboard moves with ArrowUp/Down, Enter runs the row's default (Open for
  finished, Cancel for in-progress), Del never deletes (no destructive binding).
- Every page-started download appears as a row; no silent saves. Cancel stops the
  transfer; Retry restarts it; Open launches; Show in folder reveals.
- The panel is a `.pb-chrome-bar-dropdown`-class layer: Esc closes it and returns focus
  to the page; it hides the page exactly as the 29-UI-SPEC dropdown does.

### Save page (PAGE-08)

- Ctrl+S with a web page focused opens the Theia file dialog ("Save page as"); the
  write itself is chrome-side. In editors Ctrl+S keeps Theia's save.
- Failure shows the contracted failure row with a real retry affordance.

### Edit commands (PAGE-09)

- The Edit menu and the usual keys (Ctrl+X/C/V/Z and kin) reach the focused page
  through the page-focus relay; content-native editing stays in content with no
  round-trip — only commands that need chrome help get kinds (probe 9 decides).
- Items are disabled unless the focused page reports them enabled; no clipboard read
  without a gesture (Pitfall 13).

### Reader, source, devtools (PAGE-10)

- Reader toggle is enabled only when the chrome-side readability signal says the page
  is an article; toggling stays in the same tab (back/forward history intact).
- View source (Ctrl+U, page-focus scope) loads `view-source:` chrome-side in the
  active or a new tab; Theia never holds a `view-source:` URL.
- Devtools (F12, page-focus scope) opens the stock DevTools window for the active
  overlay; no custom inspector is authored.

### Crashed tab (PAGE-11)

- A crashed overlay pushes the crashed flag and renders the contracted Theia crash UI over the overlay — never `displayLoadError` on the crashed overlay, never the stock `about:tabcrashed` copy beside it (one crash UI at a time);
  the tab and strip show the crashed mark with the contracted copy and a Reload
  button that runs the existing `webTabReload` path.
- The tab is never blank; history (`gotoIndex`) survives the reload path.

### Keyboard summary (new page-focus-scoped keys)

| Key | Result (web page focused) | Elsewhere |
|-----|---------------------------|-----------|
| Ctrl+F / F3 / Shift+F3 | Find bar open / next / previous | Theia's find |
| Ctrl+plus / Ctrl+minus / Ctrl+0 | Zoom in / out / reset | Theia's meaning |
| Ctrl+P | System print dialog | Go to File |
| Ctrl+S | Save page as | Theia's save |
| Ctrl+M | Mute toggle | Theia's meaning |
| Ctrl+U | View page source | Theia's binding if any |
| F12 | Stock DevTools window | Theia's meaning |

The planner confirms no Theia keybinding intercepts these while the page or the find
bar has focus, and that F11 stays Theia's (PAGE-07 is Phase 35).

---

## UI Considerations

The probe runs at plan time against this contract (29-UI-SPEC precedent: 24 applicable,
18 covered, 6 backstop). Expected elements: E1 find bar (`form` + `interactive-control`),
E2 downloads panel (`list-collection`), E3 zoom chip (`interactive-control`), E4 favicon /
audio marks (`static-content`), E5 reader toggle (`interactive-control`), E6 crash reload
(`form`), E7 save picker (`form`), E8 page-tools copy (`static-content`). Empty-state
and error-state COPY stays in `## Copywriting Contract` above.

Applicable state considerations resolved: probe pending at plan time.

| Category | Element(s) | Status | Resolution / Reason |
|----------|------------|--------|---------------------|
| — | — | ⚠ unresolved | Probe runs in plan-phase research; planner treats open rows as assumptions |

---

## Registry Safety

shadcn is not initialized, so the shadcn registry gate does not apply. The equivalent
supply-chain gate is that no new packages are added.

| Registry | Blocks / Packages Used | Safety Gate |
|----------|------------------------|-------------|
| shadcn official | none | not applicable (`Tool: none`) |
| third-party shadcn registries | none declared | not applicable |
| npm `@theia/core@1.76.0` (existing pin) | `ReactWidget`, `ContextMenuRenderer`, `HoverService`, `KeybindingRegistry`, `DialogService`, file dialog, `ApplicationShell` | pre-existing, unchanged; version from installed `package.json`, checked at plan time |
| npm `@vscode/codicons@0.0.45` (existing, via Theia) | glyphs listed in Design System | pre-existing; glyph presence checked by grep of `dist/codicon.css`, 2026-10-22 |
| npm (new packages) | none | Hand-built Theia contributions only |

---

## Checker Sign-Off

- [ ] Dimension 1 Copywriting: PASS
- [ ] Dimension 2 Visuals: PASS
- [ ] Dimension 3 Color: PASS
- [ ] Dimension 4 Typography: PASS
- [ ] Dimension 5 Spacing: PASS
- [ ] Dimension 6 Registry Safety: PASS
- [ ] Dimension 7 Inventory Provenance: PASS

**Approval:** pending (checker runs at plan time; `--auto` proceeds with this draft)

---

## Provenance

| Field group | Source |
|---|---|
| Tokens, 40px bar, 32px controls, dropdown portal, focus ring, accent list, layer policy, `{App}` rule | 13/27/29/30-UI-SPEC; `chrome-bar.css` and `chrome-bar-widget.tsx` as built |
| Find/findbar behaviour, zoom steps, print dialog branch, mute/audio, downloads list, save/edit/reader/source/devtools/crash shapes | REQUIREMENTS PAGE-01..06,08..11; ROADMAP Phase 32 success criteria; STACK.md page-tools rows; FEATURES.md PAGE rows; `findbar.ftl`, `browserContext.ftl`, `appmenu.ftl` wordings via copy rules |
| Browser-element-only rule; never load `browser-fullZoom.js` / `printUtils.js` / `browser.xhtml` scripts | ROADMAP Phase 32 Notes; STACK.md Notes column |
| Favicon via LinkHandlerParent → tab host → Places; mute/soundPlaying/zoom as tab-host members | ROADMAP Phase 32 Notes; 28-SPIKE-DECISION (getTabForBrowser reversal); Phase 31.1 scope |
| Page-focus key scoping; Theia keeps clashing keys elsewhere | REQUIREMENTS rulings header; KEY-04; 27-CONTEXT (relay) |
| Privileged kinds only from widget handlers; no clipboard read without gesture | Phase 27 rule; PITFALLS 7, 13 |
| Decided (autonomous, recommended) | Shrink-the-page find bar; session-only zoom with pill chip; system-dialog print; `data:`-only icons; per-tab find query memory; downloads panel cap idiom; no new accent use; stock DevTools window; contracted Theia crash UI over the overlay with reload (never the stock crash copy beside it) |
| Deferred (named, not specified) | PAGE-07 fullscreen (Phase 35); MENU-03/SMODE-07 entries (Phase 33); tab-menu Mute/Bookmark (Phase 34); per-site zoom memory (Future Requirements); OpenSearch rows; PiP/translations |
