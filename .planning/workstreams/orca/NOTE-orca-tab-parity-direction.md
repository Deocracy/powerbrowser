# Direction: a PowerBrowser tab with the abilities of an Orca tab

Recorded 2026-11-04 from Chris, during `/gsd-new-milestone --ws orca` (v1.7).

## Direction

Orca's embedded browser tabs are Chromium tabs. Orca drives them over CDP for its agent
browser automation. Seed SEED-261103-o1g decision 5 replaces them with PB web tabs, through
a Gecko browser provider behind orcad's swappable browser-provider seam (`src/main/orcad`:
electron-sidecar and external-chromium tab registries).

Chris's direction:

1. **Spike it first.** Find out how to give a PowerBrowser (Firefox/Gecko) tab the features
   and abilities of an Orca tab.
2. **Inventory the features.** List everything an Orca tab can do, and which Orca
   component uses each ability: the agent, the CLI, the renderer or orcad. A design can only
   come after that list exists.
3. **Chrome additions are acceptable.** PB may add to its own browser chrome, through the
   patch stack or the `PowerBrowserAPI.sys.mjs` boundary, to make these features work. The
   hard rules still hold: no Theia core edits, and no Gecko edits outside `patches/`.

4. **Orca's browser is replaced by PB chrome** (Chris, same session, at the summary
   check). An Orca browser tab is a PB web tab, with PB's chrome bar, address field,
   history, bookmarks and the rest. The tools Orca's browser offers (its URL bar behaviour,
   and whatever else the inventory finds, such as agent automation, screenshots and
   console) are added to PB's chrome rather than kept in an Orca-drawn browser.

## Questions the spike must answer

- The full list of Orca tab capabilities: CDP domains used, navigation, screenshots, DOM and
  input automation, console and network capture, downloads, and anything the agent tools
  call.
- For each capability: does WebDriver BiDi or Marionette already cover it, would it need a
  PB chrome or actor addition, or is it impossible in Gecko?
- Which Orca browser tools are user-facing (toolbar buttons, panels, URL-bar behaviour),
  and where each one belongs in PB's chrome bar or Theia side panels.
- Where the provider lives: an upstream Orca contribution (preferred by the seed, since Orca
  is never forked), or a PB-side provider that orcad loads.
- How a provider tab maps to a `pb-orca:` / web tab in `TabUriRegistry`, so it can still move
  between modes.

## Status

Planned as an investigation (spike) phase in v1.7. Building the provider waits on what the
spike finds.
