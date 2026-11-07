---
phase: "39"
slug: v1-5-close-out
status: approved
reviewed_at: 2026-11-05
shadcn_initialized: false
preset: none
created: "2026-11-05"
---

# Phase 39 — UI Design Contract

> Inheritance-only contract. Generated in autonomous mode (no human available, no AskUserQuestion);
> every choice defers to an earlier phase's approved UI-SPEC and is recorded below.

**Scope note.** Phase 39 is a defect-fix and close-out phase, not a new-surface phase (39-CONTEXT.md
`<domain>`, ROADMAP.md Phase 39). It makes surfaces that earlier phases already specified actually
work: C22 the `title=` tooltip never opens, C23 the saved-login autocomplete popup never opens,
C24 Copy Image leaves no image flavour on the clipboard, C11 the page-menu dismissal `focusPage()`
race (backlog 999.10). The other 13 backlog rows (999.4-999.16: test-harness flakes, the KDE portal
chooser, the regenerated patch 050 with a Gecko rebuild) have no visual surface of their own.

**Phase 39 introduces no new tokens, components, layouts, icons, fonts, colours or user-facing copy.**
If a plan task appears to need one, the task is wrong and must be reshaped to reuse an inherited
value, or the phase must stop and surface a UI-SPEC revision rather than invent it.

Hard rules that bind the phase (CLAUDE.md): never fork or patch Theia core; Firefox internals only
through `powerbrowser/shell/PowerBrowserAPI.sys.mjs`; no custom browser chrome is authored (rule 5);
no internal identifier in user-facing text (CLAUDE.md "User-facing copy", 01-UI-SPEC.md).

---

## Design System

| Property | Value |
|----------|-------|
| Tool | **none** — inherited unchanged from 35-UI-SPEC.md `## Design System` (no `components.json`; shadcn deliberately not initialized; Theia `--theia-*` theming). |
| Preset | not applicable |
| Component library | Inherited: `@theia/core@1.76.0` primitives already composed in `@powerbrowser/chrome-bar`, plus stock XUL furniture in `powerbrowser.xhtml`. No new widget framework. |
| Icon library | Inherited: Codicons from `@vscode/codicons@0.0.45`. No new glyphs. |
| Font | Inherited: Theia UI font; no font-family literal in `@powerbrowser/*`. |

Component Inventory and Element-to-Component Binding are omitted per the template (`Tool: none`).
No sketch mockup exists or is needed: no surface is added.

---

## Inherited Contracts (authoritative)

These files are the contract. Where this file and an inherited file disagree, the inherited file wins
and this file is wrong.

| Phase 39 item | Authoritative contract | Section |
|---------------|------------------------|---------|
| C22 `title=` tooltip never opens | `.planning/phases/35-shell-furniture-and-page-context-menu/35-UI-SPEC.md` | `## Interaction Contracts` → "Tooltips and link status (PROMPT-08)"; `## Copywriting Contract` → Tooltip row |
| C23 saved-login autocomplete popup never opens | 35-UI-SPEC.md | `## Interaction Contracts` → "Form autocomplete, validation and paste (PROMPT-06)"; Copywriting → Form popup row |
| C24 Copy Image leaves no image flavour | 35-UI-SPEC.md | `## Interaction Contracts` → "Page context menu (PROMPT-04)"; Copywriting → Menu item labels row (Firefox's own strings, never paraphrased) |
| C11 page-menu dismissal `focusPage()` race (999.10) | 35-UI-SPEC.md | "Page context menu (PROMPT-04)" → "the page gets focus back when it closes with no row run (Phase 27 focus rule)"; focus rule in `.planning/phases/27-groundwork-navigation-buttons-and-page-focus-keys/27-UI-SPEC.md` |
| Page tools surfaces touched by UAT re-runs (find bar, zoom chip, downloads, reader, crashed tab) | `.planning/phases/32-page-tools/32-UI-SPEC.md` | whole file |
| Bookmarks, history, full menu | `.planning/phases/33-bookmarks-history-and-the-full-menu/33-UI-SPEC.md` | whole file |
| Tab strip | `.planning/phases/34-tab-strip/34-UI-SPEC.md` | whole file |
| New-window links as web tabs | `.planning/phases/36-new-window-links-as-web-tabs/36-UI-SPEC.md` | whole file |
| Permission prompts and dialogs, incl. 999.12 KDE portal chooser for screen sharing | `.planning/phases/37-permission-prompts-and-dialogs/37-UI-SPEC.md` | whole file |
| WebExtensions, incl. 999.15/999.16 (patch 050, stock-window startup notifications) | `.planning/phases/38-webextensions/38-UI-SPEC.md` | whole file |
| Chrome bar tokens, geometry, focus ring, motion, layer policy | `.planning/milestones/v1.3-phases/13-chrome-bar-strip-relocation-spike/13-UI-SPEC.md` and 27-UI-SPEC.md | whole file |
| Design direction (palette, type, 4px scale, 0.15s motion) | `.claude/skills/sketch-findings-Power-Browser/SKILL.md` | `<design_direction>` (locked) |
| User-facing copy rule | `.planning/milestones/v1.0-phases/01-platform-extraction-and-rename/01-UI-SPEC.md` and CLAUDE.md | "User-facing copy" |

---

## What Phase 39 Locks

Only the observable end-state of the four product fixes. Mechanisms are the planner's and executor's
(patch-stack, `PowerBrowserAPI.sys.mjs`, `TheiaService.sys.mjs`), not this contract's.

| Fix | Locked behaviour (all from 35-UI-SPEC.md) |
|-----|-------------------------------------------|
| C22 tooltip | Hovering an element with a `title` in a page shows the stock `remoteBrowserTooltip` at the pointer, Firefox placement and screen clamp, Firefox's stock hover delay, only while the shell window has focus and no drag is in progress. Text is the page's `title` verbatim, never prefixed or restyled. No native tooltip for IDE (Theia DOM) elements. No `title` attribute is added to any chrome-bar button. Nothing in the chrome bar moves or repaints while it is open. |
| C23 autocomplete | Focusing a login field with a saved login shows the stock `PopupAutoComplete` panel under the field inside the overlay rect, in the same panel as other form history. Up/Down moves, Enter commits, Esc dismisses, focus never leaves the page. Strings are Firefox-owned. No Theia DOM, no bar layout change, no occlusion-list entry. |
| C24 Copy Image | The existing Firefox-ordered "Copy Image" row (stock label, already in the menu) puts an image flavour on the clipboard so a paste target receives the image. No new row, label, icon, toast or confirmation. Row ordering and omission rules are unchanged. |
| C11 dismissal | Closing the page context menu with no row run returns focus to the page deterministically, per the Phase 27 focus rule. Rows that run keep their own existing focus behaviour. No visible change. |

Timing and appearance are those of stock Firefox at `FIREFOX_153_5_0esr_BUILD1`; no custom delay,
duration, animation or easing is introduced. Chrome-bar motion stays the inherited 0.15s ease.

---

## Spacing Scale

Inherited from 13-UI-SPEC and 35-UI-SPEC unchanged (all multiples of 4: 4, 8, 12 md-gap, 16, 32; bar height
40px). Phase 39 adds no row and no exception.

Exceptions: none.

---

## Typography

Inherited unchanged: Body 14px/400/1.5, Label 13px/400/1.4, Mono 12px/400/1.4 (three sizes, two
weights). Phase 39 adds no size or weight. Tooltip, autocomplete and menu text are Firefox/stock
`.lm-Menu` styling, not authored here.

---

## Color

Inherited Theia theme tokens, no literal colour in `@powerbrowser/*` (35-UI-SPEC.md `## Color`).

| Role | Value | Usage |
|------|-------|-------|
| Dominant (60%) | `var(--theia-editor-background)` | Unchanged |
| Secondary (30%) | `var(--theia-sideBar-background)` | Unchanged |
| Accent (10%) | `var(--theia-focusBorder)` | Unchanged: keyboard-focused menu row outline; status line link hover |
| Destructive | `var(--theia-errorForeground)` | Unchanged; no destructive action in this phase |

Accent reserved for: unchanged from 35-UI-SPEC.md. Phase 39 adds no accent use. The tooltip and
autocomplete panels keep stock Firefox styling and take no accent.

---

## Copywriting Contract

Phase 39 introduces **no new user-facing copy**. The human-only checklist, UAT files, WINDOWS.md and
backlog rows are internal documents, not user-facing text, and may name identifiers.

| Element | Copy |
|---------|------|
| Primary CTA | None — no new control |
| Empty state | None — no new surface |
| Tooltip | Page `title=` text verbatim (35-UI-SPEC.md) |
| Autocomplete popup | Stock `PopupAutoComplete` strings, Firefox-owned (35-UI-SPEC.md) |
| Copy Image | Existing Firefox label, unchanged; no confirmation copy |
| Error state | If a fix surfaces a new failure to the user (none planned), it follows 01-UI-SPEC.md and CLAUDE.md: names the product via `appSubject()`/configured application name, states the problem in plain language, ends with a next step that is a real on-screen affordance, carries no pref key, sentinel, port, timeout or raw exception text. `shell-error-copy-no-internals` enforces this by pattern; extra detail goes to a labelled diagnostics row. |
| Destructive confirmation | None — no destructive action in this phase |

---

## UI Considerations

Probe run 2026-11-05 over four surfaces (E1 page tooltip, E2 saved-login autocomplete popup, E3 Copy Image row, E4 page-menu dismissal). 22 applicable considerations: 18 resolved explicit, 4 resolved backstop, 0 unresolved, 0 unclassified. Every surface is a stock Firefox widget whose rendering Phase 39 does not change; the phase changes only whether the widget opens (C22, C23), the clipboard flavour (C24) and focus return (C11). Empty- and error-state copy lives in `## Copywriting Contract` and is referenced, not restated.

| Element | Category | Status | Resolution |
|---------|----------|--------|------------|
| E1 tooltip | overflow | ✅ resolved (backstop) | { statement: "Gecko's stock tooltip clamps to its max width and wraps; unchanged by Phase 39", verification: backstop — visual row in the end-of-milestone checklist } |
| E1 tooltip | long-text | ✅ resolved (backstop) | { statement: "A long `title=` wraps inside the stock tooltip; no truncation is added", verification: backstop — same visual row } |
| E2 autocomplete | empty | ✅ resolved | Zero saved logins: no panel opens (stock PopupAutoComplete, 35-UI-SPEC.md PROMPT-06) |
| E2 autocomplete | loading | ✅ resolved | No loading state: the login list is read synchronously from the stock login manager before the panel opens |
| E2 autocomplete | error | ✅ resolved | A failed lookup opens no panel and the field stays editable; any message follows `## Copywriting Contract` |
| E2 autocomplete | populated | ✅ resolved | Stock panel rows (username, masked password) at stock row height; 35-UI-SPEC.md PROMPT-06 |
| E2 autocomplete | partial | ✅ resolved | A login with no username renders the stock "No username" row; nothing new |
| E2 autocomplete | overflow | ✅ resolved (backstop) | { statement: "Many logins scroll inside the stock panel at its stock max height", verification: backstop — visual row } |
| E2 autocomplete | zero-one-many | ✅ resolved | Zero: no panel. One or many: stock list with stock keyboard navigation (Down, Enter, Escape) |
| E2 autocomplete | long-text | ✅ resolved (backstop) | { statement: "Long usernames truncate with the stock ellipsis", verification: backstop — visual row } |
| E3 Copy Image | empty | ✅ resolved | On a non-image target the row is absent, as stock nsContextMenu decides (35-UI-SPEC.md PROMPT-04) |
| E3 Copy Image | loading | ✅ resolved | No loading state: the copy is synchronous; the menu closes on activation |
| E3 Copy Image | error | ✅ resolved | A copy failure leaves the clipboard unchanged and the page usable; no new copy |
| E3 Copy Image | populated | ✅ resolved | Existing row label and position unchanged; the clipboard carries an image flavour plus the stock text/URL flavours |
| E3 Copy Image | partial | ✅ resolved | A still-loading image copies what Gecko has decoded, as stock Firefox does |
| E3 Copy Image | overflow | ✅ resolved | Not applicable to a menu row; the menu's overflow is 35-UI-SPEC.md's |
| E3 Copy Image | zero-one-many | ✅ resolved | One row per image target; multiselect is not a page-menu concept |
| E3 Copy Image | long-text | ✅ resolved | Fixed label; no long-text state |
| E4 menu dismissal | loading | ✅ resolved | No loading state; dismissal is synchronous |
| E4 menu dismissal | error | ✅ resolved | If focus cannot return to the page (tab closed), focus stays in the shell per the Phase 27 focus rule; no message |
| E4 menu dismissal | overflow | ✅ resolved | Not applicable to a focus transition |
| E4 menu dismissal | long-text | ✅ resolved | Not applicable to a focus transition |

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official | none | not required |

No third-party blocks. No new npm package. Vetting gate not applicable.

---

## Checker Sign-Off

- [x] Dimension 1 Copywriting: PASS
- [x] Dimension 2 Visuals: PASS
- [x] Dimension 3 Color: PASS
- [x] Dimension 4 Typography: PASS
- [x] Dimension 5 Spacing: PASS
- [x] Dimension 6 Registry Safety: PASS
- [x] Dimension 7 Inventory Provenance: PASS (`Tool: none`, inventory omitted per template)

**Approval:** approved by gsd-ui-checker 2026-11-05 (7/7 PASS); UI-consideration probe 22/22 resolved
