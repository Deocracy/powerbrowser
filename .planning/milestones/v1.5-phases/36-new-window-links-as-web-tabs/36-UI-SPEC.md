---
phase: "36"
slug: new-window-links-as-web-tabs
status: approved
reviewed_at: 2026-10-22
shadcn_initialized: false
preset: none
created: "2026-10-22"
---

# Phase 36 — UI Design Contract

> Minimal user-facing contract. Phase 36 adds no new chrome, no new pill, no new menu. The only visible surface is: a new web tab appears next to its opener; closing it reselects the opener; the stock-window command keeps working. Everything else is chrome-side.

**Scope note.** Inherits 13-UI-SPEC tokens/geometry/type/colour/focus/motion and 27-UI-SPEC nav-button/tooltip rules unchanged. No new widget, no new icon, no new copy except adopted-tab title/tooltip which follow existing web-tab rules.

Hard rules binding every row: never fork Theia core; Firefox internals only through `PowerBrowserAPI.sys.mjs`; no custom browser chrome; no internal identifier (`pc-<n>`, `wt-*`, actor kind names) in user-facing text; product name from configured application name.

Mode: autonomous (recommended defaults taken). Every choice below is **Decided (autonomous, recommended)**.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | **none** — same rationale as 27-UI-SPEC (no Vite/Next app; Theia `--theia-*` theming only) |
| Component library | `@theia/core@1.76.0` primitives only; reuse existing `WebTabWidget` + tab strip, no new widget |
| Icon library | Codicons already in use; adopted tabs reuse the web-tab globe/loading icons, no new glyph |
| Font | Inherited, no literal |

Component Inventory / Element binding omitted: no new component.

---

## Visible Behaviours

### VB-01: Adopted tab opens next to opener (PROMPT-05)

- A `target=_blank` click or `window.open` from a web page produces a standard web tab (same placeholder widget, same title/loading/close affordance as any web tab opened from the pill).
- Strip position: directly after the opener tab (`tab-after`), not appended at end. Background tabs (middle-click / Ctrl+click via `openLinkIn`) do not steal focus; foreground `window.open`/`target=_blank` activates the new tab (Firefox parity).
- No flash of `about:blank`/pending state: the pending `pc-<n>` overlay is never rendered as a strip item; the strip item appears only when the frontend mints `wt-<session>-<n>`.
- Title/tooltip follow existing web-tab rules (page title, URL as tooltip); never show `pc-*`, `wt-*`, kind names, or URLs with token material.

### VB-02: Closing an adopted tab reselects the opener

- Closing the adopted tab returns selection to the opener tab (Firefox parity), reusing the existing close-reselect path. No new close affordance.

### VB-03: Popup-features windows open a popup window (ROADMAP SC-3)

- `window.open(url, name, "width=..,height=..")` opens a real popup window (the stock-window machinery with the requested features), not a web tab — ROADMAP Phase 36 success criterion 3 governs. No user-facing distinction from any other stock-window open; no error.
- This supersedes the earlier draft of this row ("popups degrade to tabs"): the checker proved upstream forces a real window (`nsWindowWatcher.cpp:2658-2669`), and the live `adopt-popup` scenario asserts it.

### VB-04: Stock window unchanged (GUI-01)

- The `powerbrowser.open-browser-window` command (palette + any bound button) keeps its current label, icon, placement and behaviour: opens/focuses the stock browser window. Transport change (actor kind) is invisible.
- The 5 s adopt fallback (lost frontend) lands in the stock window via the same command path; user sees the page open in the stock window, never an error or a swallowed navigation.

---

## States & Copy

| State | Copy / appearance |
|-------|-------------------|
| Adopted tab loading | Same spinner + "New Tab" fallback title as existing web tabs; no new strings |
| Adopt fallback to stock window | No extra copy; stock window opens on the URL (existing GUI-01 behaviour) |
| Adopt refused scheme (`javascript:`, `moz-extension:`, etc.) | Same refusal as `webTabOpen` today (no new tab, no new error surface) |

Copy rule: adopted-tab strings go through the same `checkNavCopy`-style gate family; product name from configured application name; no pref key, sentinel, port, timeout, or raw exception text.

---

## Accessibility / Focus

- Focus follows the same rules as `openInBackground` vs `openUrl`: background adopt leaves focus on the opener page; foreground adopt moves focus to the new tab's page once loaded. Reserved page keys (27-UI-SPEC) apply to adopted tabs identically.
- Keyboard: adopted tabs are reachable via existing Ctrl+Tab/Ctrl+Shift+Tab order (opener-adjacent position is the only change).

---

## Out of Scope (explicitly not UI)

- Tab-strip drag/reorder/pin visuals (Phase 34), address-bar/pill changes (Phases 29–30), prompts/permissions/fullscreen on adopted tabs (Phase 37), extension badge/popup UI (Phase 38).

---

## Manual verification (visual only; gates read DOM/strings)

| Behaviour | PROMPT-05 criterion | How to eyeball |
|-----------|---------------------|----------------|
| `target=_blank` click opens next to opener | SC-1 | Open two web tabs, click a `_blank` link in the first; new tab sits directly after it |
| `window.open` from page opens as web tab | SC-1 | Page button calling `window.open(url)`; tab appears, shell window count stays 1 |
| `window.open` from page keeps `window.opener` | SC-2 | Adopted page reads a non-null `window.opener` and a `postMessage` round-trip to the opener completes |
| `window.open` with popup features opens a popup | SC-3 | Page button calling `window.open(url, name, "width=..,height=..")`; a stock popup window opens, no web tab for it |
| Close adopted tab reselects opener | SC-2 adjacency | Close the adopted tab; opener is selected |
| Stock window still opens | SC-3 / GUI-01 | Palette command opens stock window; closing it leaves the app running |
