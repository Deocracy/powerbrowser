---
phase: "39"
slug: v1-5-close-out
status: draft
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

Applicable state considerations resolved: 3 covered, 0 backstop, 0 unresolved.

| Category | Element(s) | Status | Resolution / Reason |
|----------|-----------|--------|---------------------|
| empty | tooltip (element with empty or no `title`) | ✅ covered | No tooltip opens; stock `remoteBrowserTooltip` behaviour (35-UI-SPEC.md) |
| error | tooltip, autocomplete or Copy Image fails to produce its result | ✅ covered | No new error copy; a failure keeps the page usable and any user-facing text follows 01-UI-SPEC.md; identifiers go to the diagnostics layer |
| zero-one-many | autocomplete entries (no saved login / one / many) | ✅ covered | No saved login means no panel opens; one or many render in the stock panel with stock keyboard behaviour |

No other state category applies: no list, form, loading state or long-text element is added.

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official | none | not required |

No third-party blocks. No new npm package. Vetting gate not applicable.

---

## Checker Sign-Off

- [ ] Dimension 1 Copywriting: PASS
- [ ] Dimension 2 Visuals: PASS
- [ ] Dimension 3 Color: PASS
- [ ] Dimension 4 Typography: PASS
- [ ] Dimension 5 Spacing: PASS
- [ ] Dimension 6 Registry Safety: PASS
- [ ] Dimension 7 Inventory Provenance: PASS (`Tool: none`, inventory omitted per template)

**Approval:** pending
