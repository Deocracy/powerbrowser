---
phase: 66-powerbrowser-web-tabs-as-orca-s-browser
plan: 08
subsystem: chrome agent bridge / new-window adopt
status: complete
tags: [security, agent-isolation, gap-closure, D-35]
requires: [66-07]
provides:
  - "D-35: no window, tab or popup exists for an agent-overlay opener on any open path"
  - "orca-browser-tab-scope opens clause (derived paths, one generated plant per path)"
  - "orca-browser-agent-live clause (n)"
affects: [powerbrowser/shell/PowerBrowserAPI.sys.mjs, website-staging/privacy.html]
tech-stack:
  added: []
  patterns:
    - "SANDBOXED_AUXILIARY_NAVIGATION on a chrome-created <browser>'s browsing context (as PageExtractorParent)"
    - "browserDOMWindow members throw (not null) to refuse an open"
key-files:
  created:
    - .planning/workstreams/orca/phases/66-powerbrowser-web-tabs-as-orca-s-browser/66-08-PLAN.md
    - .planning/workstreams/orca/phases/66-powerbrowser-web-tabs-as-orca-s-browser/66-08-SUMMARY.md
  modified:
    - powerbrowser/shell/PowerBrowserAPI.sys.mjs
    - powerbrowser/INTERNAL-APIS.md
    - scripts/verify-orca-browser-tab-scope.mjs
    - scripts/verify-orca-browser-agent-live.mjs
    - scripts/lib/orca-browser-live.mjs
    - scripts/verify-platform.sh
    - inventory/brand-tokens.json
    - .planning/workstreams/orca/DECISIONS.md
    - .planning/workstreams/orca/ROADMAP.md
    - .planning/workstreams/orca/STATE.md
decisions:
  - "D-35: refuse every open whose opener is an agent overlay; owner may override (OAuth-style popups as agent overlays)"
  - "Error code browser_command_unavailable, not a new browser_popup_refused: Orca's BrowserErrorCode is a closed union in a tracked Orca file"
metrics:
  duration: "about 2 h"
  completed: 2026-11-11
estimate:
  tokens: 45000
  tasks: 2
actuals:
  tokens: 68000
  tasks: 2
  commits: 2
plan_head_before: 03f40eb5bc33abe4f74b050b9fcf07b29825e08f
plan_head_after: 368a3f44813ce09c6263e861a01f2256d7195d58
---

# Phase 66 Plan 08: agent-opened windows refused (D-35) Summary

An agent page can no longer open a window, tab or popup. There are two walls. In content, `SANDBOXED_AUXILIARY_NAVIGATION` is set on the agent overlay's browsing context. In chrome, every new-window receiver refuses an agent opener. This is proven live by orca-browser-agent-live clause (n). The run first reads positives from a user tab, then checks that the agent's opens produce 0 tabs, 0 windows and 0 loads.

(`commits: 2` was measured when this SUMMARY was written, before the docs commit that adds it.)

## Open paths found and guarded

Sources searched: `installNewWindowReceivers`, `ContentParent::CommonCreateWindow` (`ContentParent.cpp:5412-5530`), `nsWindowWatcher::OpenWindowInternal` / `GetWindowOpenLocation`, `ClickHandlerParent.contentAreaClick`, and every `openStockTab` caller.

| # | Path | Triggered by | Guard |
|---|------|--------------|-------|
| 1 | `browserDOMWindow.createContentWindowInFrame` → `adoptContentWindow` | window.open, a target=_blank link or a form target diverted to a tab, and the print browser | `agentOpenGuard` throws `NS_ERROR_ABORT` before the Theia/print null. A null would fall through to OPEN_NEWWINDOW and a stock window (`ContentParent.cpp:5505-5508`); a failure refuses the open (`:5509-5511`) |
| 2 | `browserDOMWindow.openURIInFrame` → `adoptContentWindow` | same as 1 | same as 1 |
| 3 | `browserDOMWindow.createContentWindow` → `adoptInProcessWindow` (new) | in-process opener | throws for an agent opener (the opener BC's top embedder), else null as before. The edit inside `installNewWindowReceivers` adds no lines |
| 4 | `browserDOMWindow.openURI` → `adoptInProcessWindow` | same as 3 | same as 3 |
| 5 | `window.openLinkIn` → `adoptLinkIn` | ClickHandler: middle-click, modified click, Enter on a link, for every `where` ("tab", "tabshifted", "window" → openStockTab, "save", anything else) | `tabIdOfBrowser(opener) === null \|\| agentOpenRefused(opener, "link open")` returns null and opens nothing |
| 6 | OPEN_NEWWINDOW: window.open with features, a shift-modified open, document PiP | Gecko opens a stock window with no chrome receiver (`ContentParent.cpp:5529`) | content wall: `SANDBOXED_AUXILIARY_NAVIGATION` (0x2) is set in `agentTabCreated` before the first load. Every agent document refuses auxiliary navigation (`nsWindowWatcher.cpp:982`, `nsDocShell.cpp:7570`), and a BC replacement carries the flag (`CanonicalBrowsingContext.cpp:356`). The wall covers paths 1, 2 and 6 in content as well |
| - | `adoptFallback` → openStockTab | runs only for a pending overlay | never reached for an agent, because the agent never gets one |
| - | openStockTab from the Theia kind, the CLI single-instance handler and `extensionInstallSite` | user or app actions | they have no page opener, so they are not open paths of an agent page |

Refusal reporting: `agentOpenRefused` logs `[orca-agent] refused a <path> from an agent page (D-35)` once per tab and path, without the URL. It also counts refusals on the tab's control. `handleWebTabAgent` turns a `done` into `failed browser_command_unavailable` when a refusal happened during the command. A content-wall refusal happens before any chrome code runs, so it is not logged and fails no command. In that case the page's own `window.open` throws `InvalidAccessError` (measured live).

Error code: `browser_command_unavailable`. A new `browser_popup_refused` would need an edit to Orca's closed `BrowserErrorCode` union in `orca/src/shared/runtime-browser-contracts.ts`, a tracked Orca file. The HTTP-auth refusal already uses `browser_command_unavailable`.

## Tasks

| Task | Commit | Files |
|------|--------|-------|
| D-35 and plan | 8713be80 | DECISIONS.md, 66-08-PLAN.md |
| 1: walls, checks, live clause | 368a3f44 | PowerBrowserAPI.sys.mjs, INTERNAL-APIS.md, verify-orca-browser-tab-scope.mjs, verify-orca-browser-agent-live.mjs, lib/orca-browser-live.mjs, verify-platform.sh, brand-tokens.json |
| 2: tracking and SUMMARY | (docs commit) | ROADMAP.md, STATE.md, 66-08-SUMMARY.md |

## Checks

- **orca-browser-tab-scope opens clause.** The clause installs the receivers on a fake shell window and derives 5 open paths from them: `browserDOMWindow.createContentWindow`, `createContentWindowInFrame`, `openURI`, `openURIInFrame`, and `openLinkIn`. It then drives each path with an agent opener at every OPEN_* constant in the pinned IDL (12 of them) and at 6 link `where` values. It requires no overlay, no openStockTab, no load and no adoptTab push. It also requires each IDL member to throw the guard's failure. The detectors come first: a user opener creates through a member and through the link path, and it reaches the stock window. The clause also checks that refusals log once without the URL, that the command code is right (with a done positive control), and that the content wall is set at the first load (with no flag on a user overlay).
- **Self-test: 30 plants, all red.** 13 are new: the link, InFrame and in-process guards; null instead of a throw; the content wall; the command code; the log rule; a blinded derivation; and 5 plants generated from the receiver source, one per derived path.
- **orca-browser-agent-live clause (n) and fixture `/opener`.** The clause reads the fixture server's request log. Its self-test has 56 plants (15 new for (n)).

## Live results (`.mozbuild/p66-08/`, under the lock, ORCA_* unset, MOZ_PURGE_CACHES=1)

- `build-faster.txt`: `./mach build faster` exit 0. The chrome modules in objdir are symlinks to the source.
- `agent-live-1.txt`: orca-browser-agent-live PASS, every clause ok, (n) included.
- `agent-live-2.txt`: PASS. Clause (n) ok (user: link 1 tab, window.open 1 tab, popup 1 window; agent: 0 tabs, 0 windows, 0 loads, window.open threw InvalidAccessError, with features threw InvalidAccessError, middle-click failed browser_command_unavailable, Control+Enter failed browser_command_unavailable, sandboxFlags 2). (j) revealed in 11 ms.
- `orca-agent-mark-live.txt`: PASS. The mark cleared after 21000 ms idle, Stop ended control, and the stock window was unmarked (286 nodes).
- `new-window-adopt-live.txt`: all 12 stages PASS (adopt-order, adopt-opener, adopt-popup, adopt-focus, adopt-fallback, adopt-scheme, adopt-unknown-key, adopt-close, adopt-blank-write, adopt-late-ack, gui01-adopted, stock-command-reprobe). User-tab adoption is unchanged.
- `quick.txt`: `nix develop .#theia --command scripts/verify-platform.sh --quick` was red only on `fixer-isolate-self-test`. Its message was "could not make /run/user/1000/cc-socks/<pid>.sock read-only", which comes from the agent sandbox's socket. Run outside the sandbox, `--only fixer-isolate-self-test` passes and the gate is green. The requested rows are all PASS: orca-browser-tab-scope(-self-test), gui02-web-tab-bridge(-self-test), new-window-adopt(-self-test), orca-browser-agent-live-self-test, orca-agent-mark-live-self-test, internals-boundary, internals-catalogue, ng-040, scan-brand-residue, privacy-hosts, shell-error-copy-no-internals.

## Privacy paragraph

`website-staging/privacy.html:86` was re-read against the result. It says "An agent never reaches your other tabs or your browser windows", and that holds now: an agent page creates no tab or window. The text was not edited.

## Deviations from Plan

- **[Rule 3] INTERNAL-APIS line references.** The renumbering used an exact old-to-new line mapping from the diff. `ng-040 --fix`'s nearest-line repair could not place 22 rows after a non-uniform shift, so it was not used.
- **[Rule 3] Brand row.** The new log line's `[orca-agent]` prefix adds one lower-case `orca` to PowerBrowserAPI.sys.mjs. The scanner measured 4752 against the expected 4751, and `inventory/brand-tokens.json` was updated to 4752 (the file was already listed).
- gui02-web-tab-bridge was not extended. It has no open-path rule, the opens clause lives in tab-scope, and the bridge check stays green.

## Known Stubs

None.

## Threat Flags

None. No new endpoint or message kind was added; the change only narrows what an agent page can do.

## Owner items

- D-35 is a coordinator ruling and the owner may override it. If an agent workflow needs popups (for example an OAuth sign-in), they could be opened as agent overlays in the agent container.
- Residual risk: a compromised content process could clear its own sandbox flag, because `CanSet(SandboxFlags)` accepts any process. The popup-with-features path has no chrome receiver to fall back on. This is outside this phase's threat model.
- Not covered: an external-protocol link (for example mailto:) from an agent page can still raise the external-app dialog. That is a prompt, not a window, and it is the same class as 66-VERIFICATION Security finding 2.

## Self-Check: PASSED

- FOUND: 66-08-PLAN.md, 66-08-SUMMARY.md, .mozbuild/p66-08/agent-live-2.txt
- FOUND: 8713be80, 368a3f44 (ancestors of HEAD)
