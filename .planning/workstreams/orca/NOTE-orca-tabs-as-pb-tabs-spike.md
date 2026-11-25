# Direction: Orca tabs as real PowerBrowser tabs (spike)

Recorded 2026-11-04 from Chris, during `/gsd-new-milestone --ws orca` (v1.7), in answer to
"what should moving an Orca tab to another mode mean?".

## Chris's words

> We need a spike for this as we may need to make orca tabs in the GUI run under the same way
> theia and browser run... we would need to get rid of the react and remake the tab windows in
> orca. but we need more research on the difficulty of this.

## What this means

Today's plan (research SUMMARY.md) puts the whole Orca web client in **one** PB web tab.
Orca's own tab windows (terminal, chat, editor, browser panes) and its split layout are
React + @dnd-kit + Zustand code inside that page (`research/INPUTS.md`, "Tab splitting"). PB's
tabs and splits come from Theia's @lumino/widgets `DockPanel`. The two layouts cannot exchange
tabs.

Chris's direction is that each Orca view becomes a PB tab like Theia's and the browser's:
laid out by Lumino, movable between modes and organisable like any other PB tab. The spike
measures how hard that is before anything is committed to.

## Questions the spike must answer

1. **The view inventory.** List every Orca tab-window type (Orca has 8 tab content types;
   FEATURES.md part B), and the orcad RPC each one uses.
2. **Routes for "remake the tab windows":**
   - (a) **PB-written Theia widgets** for each Orca view, talking to orcad over its runtime
     RPC. This patches no Orca code, but it means implementing Orca's private, end-to-end
     encrypted RPC with no version guarantee (ARCHITECTURE Q6).
   - (b) **Orca's own React components mounted inside Lumino widgets.** Theia's `ReactWidget`
     is React too. This requires importing Orca renderer code, which conflicts with the rule
     that Orca is a pinned upstream that is never vendored.
   - (c) **An upstream Orca change**: separate web entry pages or routes for each view, so each
     view loads as its own PB web tab. Today the web build has one entry page
     (`vite.web.config.ts`) and no router, and all pages on one origin share
     `orca.web.workspaceSession.v1` in localStorage.
   - (d) **Hybrid**: one view (for example the terminal) as a native Theia widget (xterm
     already exists in `@theia/terminal`), the rest kept in the client tab.
3. **Size.** The effort for each route, how much of Orca's roughly 1.1M-LOC renderer each one
   touches, and the re-pin cost when Orca ships (about daily).
4. **Hard-rule fit.** Which routes keep "Orca is consumed by version, never patched or
   vendored", and what a route that breaks it would need from Chris.
5. **Interaction with the browser-parity spike** (`NOTE-orca-tab-parity-direction.md`): Orca
   browser panes becoming PB web tabs is the same question for one view type.

## Status

A spike phase in v1.7. Until it reports, the one-client-tab design is the working baseline,
and nothing is built that assumes either answer.
