# Refactor brief: R1a-api-core

Owned: `powerbrowser/shell/PowerBrowserAPI.sys.mjs`, **from the top of the file to the line before
`export const PowerBrowserWebTabs = Object.freeze({`** (about lines 1 to 6095 at the base).

Lane R1b owns the rest of the same file and runs at the same time. The two lanes' commits are
merged with git, so:

- Do not edit a line at or after `export const PowerBrowserWebTabs`. A change needed there goes
  under Handoffs for R1b.
- Do not move code across that boundary, and do not delete a helper in your half before you have
  checked (`grep -n`) that the other half does not call it. A helper in your half that only the
  other half calls stays where it is.
- Do not edit `powerbrowser/INTERNAL-APIS.md` (see the lane rules).

Notes for this half:

- It holds the imports and lazy getters, the sender wall (`groupSenderIsTheia`), the frozen
  `PowerBrowserAPI` object, the group mutation and store request routing in
  `PowerBrowserGroupParent`, `admitCliUrlSpec` and the single-instance handler.
- This file is the one anti-corruption layer over Firefox internals. Every `lazy.*`, `Services.*`,
  `Cc[...]`, `ChromeUtils.*` and `gBrowser`/window-global use is a catalogued touchpoint: moving one
  to a different function, or adding or removing one, is a Handoffs entry.
- 67 check scripts read this file as text. Expect many candidates to be Blocked by check; record
  them and move on.
- Performance candidates worth looking for: work done per group message that could be cached,
  repeated pref reads and `Services` lookups on a per-message path, observers and listeners
  registered per window or per tab without removal, synchronous work on the message path.
