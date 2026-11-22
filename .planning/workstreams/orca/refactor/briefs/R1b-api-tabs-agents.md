# Refactor brief: R1b-api-tabs-agents

Owned: `powerbrowser/shell/PowerBrowserAPI.sys.mjs`, **from the line
`export const PowerBrowserWebTabs = Object.freeze({` to the end of the file** (about lines 6096 to
12601 at the base).

Lane R1a owns the first part of the same file and runs at the same time. The two lanes' commits
are merged with git, so:

- Do not edit a line before `export const PowerBrowserWebTabs`. That includes the import block, the
  lazy getters and every helper defined above the boundary. A change needed there goes under
  Handoffs for R1a.
- Do not move code across that boundary. A helper you want to share with the first half stays in
  your half and is recorded as a Handoffs suggestion.
- Do not edit `powerbrowser/INTERNAL-APIS.md` (see the lane rules).

Notes for this half:

- It holds the web-tab overlay host (`PowerBrowserWebTabs`, `PowerBrowserTabHost`), the token
  cookie strip, the quit veto, sharing state, page furniture (prompts, permissions, site identity,
  downloads), edit state, processes, the agent bridge (`PowerBrowserAgentParent`,
  `PowerBrowserAgentPageParent`) and the pane hosting block at the end.
- This file is the one anti-corruption layer over Firefox internals. Every `lazy.*`, `Services.*`,
  `Cc[...]`, `ChromeUtils.*` and `gBrowser`/window-global use is a catalogued touchpoint: moving one
  to a different function, or adding or removing one, is a Handoffs entry.
- 67 check scripts read this file as text. Expect many candidates to be Blocked by check; record
  them and move on.
- The agent bridge is a security wall (owner, agent flag, container, stopped state). Do not
  reorder, merge or short-circuit its checks, even where two look redundant.
- Performance candidates worth looking for: per-tab maps and listeners that outlive the tab,
  progress listeners and observers added per overlay without removal, per-message work on the
  agent path, repeated lookups of the same web-tab entry in one handler.
