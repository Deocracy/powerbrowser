---
phase: 66-powerbrowser-web-tabs-as-orca-s-browser
plan: 05
subsystem: theia-extensions
tags: [theia, chrome-bar, orca, browser-agent, live-check, brw-04, brw-05]
status: complete

requires:
  - phase: 66 lane p66-02 (branch ServerDestroyer/p66-02, 7256c82b)
    provides: "WebTabWidget.agentControl, the pb-agent-controlled title class, agentStop(), tabStatusEmitter on agentControlChanged; @powerbrowser/orca-browser (OrcaBrowserPages, OrcaBrowserHost)"
provides:
  - "renderAgentControl() in the chrome bar: the agent mark and Stop for the current web tab (BRW-04)"
  - "four copy rows: agentControlLabel, agentControlTooltip, agentStopLabel, agentStopTooltip"
  - "ORCA_BROWSER_TOOLS (U-01..U-30) and the orca-browser-tools quick row with its self-test (BRW-05)"
  - "scripts/lib/orca-browser-live.mjs, the shared live harness"
  - "orca-browser-agent-live (criteria 1, 2) and orca-agent-mark-live (criterion 3), full rows with quick self-tests"
affects: [66-06]

actuals:
  tokens: 21800      # chars/4 over the realized diff against refs/heads/ServerDestroyer/p66-02 (about 87,000 chars, 10 files)
  tasks: 3
  commits: 3         # MEASURED after the final commit: git rev-list --count 7256c82b..HEAD
plan_head_before: 7256c82b2473466b82d2455a5426036043b61668
plan_head_after: 31760f81   # HEAD when this SUMMARY was written (before its own commit, which carries Task 3)

tech-stack:
  added: []
  patterns:
    - "Live rows as pure exported verdicts over a recorded observation object; the self-test runs the same verdicts over a control set and one plant per fault"
    - "The live harness extends Phase 64's withOrcaTabsSession instead of a second launcher"

key-files:
  created:
    - theia/extensions/orca-browser/src/common/orca-browser-tools.ts
    - scripts/verify-orca-browser-tools.mjs
    - scripts/lib/orca-browser-live.mjs
    - scripts/verify-orca-browser-agent-live.mjs
    - scripts/verify-orca-agent-mark-live.mjs
  modified:
    - theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx
    - theia/extensions/chrome-bar/src/browser/chrome-bar-copy.ts
    - theia/extensions/chrome-bar/src/browser/chrome-bar.css
    - scripts/verify-shell-error-copy.mjs
    - scripts/verify-platform.sh

key-decisions:
  - "The four copy rows are added to EXPECTED_NAV_COPY in verify-shell-error-copy.mjs (the hand-kept reviewed set that is how a deliberate chrome-bar copy change is made); without them shell-error-copy-no-internals is red. This file is outside files_modified."
  - "Clause (g) reaches Orca's renderer path through the pane client's own window.api.runtimeEnvironments: prepareBrowserClientHostPlacement, then call('browser.tabCreate') with that placement. These are the two calls createWebRuntimeSessionBrowserTab makes. The pane bundle exports no store action that calls createBrowserTab."
  - "The DPR 2 half is a second launch with layout.css.devPixelsPerPx set live through Services.prefs at session start. withOrcaTabsSession takes no extraPrefs, and orca-tabs-live.mjs is outside this lane's files. The clause first reads the page's devicePixelRatio (the device check)."
  - "Page documents are read through WebDriver BiDi contexts (harness only, D-11); the user tab's focus and blur log are read the same way."

requirements-completed: []  # BRW-02..BRW-05 lane half only; the coordinator marks them after the merge and the live rows

duration: 70min
completed: 2026-11-11
---

# Phase 66 Plan 05: agent mark and Stop, Orca browser tools map, agent and mark live rows Summary

The chrome bar now shows "Agent in control" with a Stop button for the current web tab while chrome reports an agent is driving it. Every one of spike 005's 30 Orca browser tools is mapped to a PowerBrowser contribution, the mark, a skip or a v2 deferral, and a quick row compares the two sets. Two live rows, built on Phase 64's session harness, prove criteria 1-3 on the merged tree. Here they SKIP by name.

## Commits

| Task | Commit | Message |
|------|--------|---------|
| 1 (tracer) | ead6a972 | feat(66-05): agent mark and Stop in the chrome bar, copy rows and title mark style |
| 2 | 31760f81 | feat(66-05): Orca browser tools map and set check |
| 3 | the commit carrying this file | feat(66-05): live proofs of criteria 1-3 with self-tests, lane summary |

## Setup records

- Base: `git merge-base --is-ancestor refs/heads/ServerDestroyer/p66-02 HEAD` holds (HEAD was 7256c82b), and 66-02-SUMMARY.md has no BLOCKER line. web-tab.ts carries `^    agentStop(` at :1516, `agentControl` at :836 and `AGENT_CONTROLLED_CLASS` at :272. No BLOCKER is needed: the mark renders from lane p66-02's members alone.
- `node scripts/generate.mjs`, then the audited install from docs/BUILD.md "Theia half" (`yarn install --ignore-scripts --frozen-lockfile`, the drivelist node-gyp rebuild). Then `bash scripts/fetch-orca.sh` (v1.4.248, 965978bc). `theia/yarn.lock` is unchanged.

## What was built

- **Mark and Stop (P66-21, P66-22, D-19).**
  - `renderAgentControl()` sits beside `renderSharing()` and is placed directly after it. It returns nothing unless `currentWebTab()?.agentControl.active` is true.
  - The mark is a `codicon-robot` with `role="img"`, an aria-label and the tooltip, plus a visible label. A `type="button"` Stop follows; its only handler is `void currentWebTab()?.agentStop()`.
  - No command, keybinding or menu names `agentStop` or `webTabAgentStop`.
  - Style: `.pb-chrome-bar-agent` uses the sharing indicator's accent ring and the bar's button class, compacted. `.lm-TabBar-tab.pb-agent-controlled` adds an inset accent underline (`--theia-focusBorder`) in both themes.
- **Copy rows (P66-23), verbatim for the owner's copy review:**
  - `agentControlLabel`: `Agent in control`
  - `agentControlTooltip(subject)`: `An Orca agent you started is controlling this tab in ${subject}. Select Stop to end it.`
  - `agentStopLabel`: `Stop`
  - `agentStopTooltip(subject)`: `Stop the agent's control of this tab in ${subject}. The tab stays open.`
- **Tools map (P66-24, BRW-05).** `ORCA_BROWSER_TOOLS` has 30 rows:
  - 15 existing contributions:
    - Commands: U-01 focus-address, U-02 back, U-03 find-in-page, U-04 zoom-in, U-05 devtools, U-11 clear-history, U-13 downloads, U-27 view-source, U-30 reload.
    - Kinds: U-14 webTabAdopt, U-15 webTabOpen, U-16 webTabSiteInfo, U-17 webTabSetPermission, U-18 webTabContextMenuAction, U-23 webTabOpen.
  - 1 mark: U-09 renderAgentControl.
  - 10 skips: U-10, U-19, U-20, U-21, U-22, U-24, U-25, U-26, U-28, U-29, each with the spike's reason.
  - 4 deferrals: U-06 and U-07 to BRW-06, U-08 to BRW-07, U-12 to BRW-08.
  - Each row cites its spike note in a comment.
- **orca-browser-tools.** It parses the U-rows from the spike README and compares them with the map both ways.
  - Command ids are resolved through the `const X = { id: ... }` command objects and `const Y = '<id>'` constants passed to `registerCommand` across `theia/extensions/*/src`, with comments stripped. This gives 47 ids over 122 sources.
  - A render method must be defined and called as `this.<name>()` in chrome-bar-widget.tsx.
  - A kind must be a `KIND_CLASSES` key, and a deferral a bold id under REQUIREMENTS.md's `## v2 Requirements`.
  - The self-test plants 9 faults, in memory.
- **Live harness** (`scripts/lib/orca-browser-live.mjs`). It wraps `withOrcaTabsSession`, which already provides the scratch profile, `MOZ_PURGE_CACHES=1`, scrubbed `ORCA_*`, redaction installed first, the throwaway repository and teardown by recorded pid. On top it adds:
  - the fixture server: `/agent` with the red 40x40 target at CSS (100, 80), an input, a checkbox and a counter button; `/agent2`, `/user`, `/cookie` and `/stock`;
  - a CLI runner that never throws and returns `error.code` and `error.message` apart, with its environment built from scratch;
  - reads of web tabs, the current widget, the addWidget clock, the page table, the link and host, raw `webTabAgent`, chrome focus and `elementFromPoint`, BiDi page reads, PNG pixel decoding in the Theia frame, the `subscribePanes` activation recorder, stock windows through the GUI-01 command, and the chrome-bar mark state;
  - the SKIP rule.
  - Importing it prints nothing.
- **orca-browser-agent-live.** Clauses run in the order (k), (a), (c), (b), (b1), (d), (e), (f), (g), (h), (j), (i), then (b2) in a second launch at DPR 2. Every absence clause is preceded by its positive read:
  - (k): bundle booted and the link present.
  - (c): the agent's activeElement moved.
  - (e): the agent's own cookie is read.
  - (f): hidden-electron's `run` proves both detectors.
  - (j): the store record turned active.
  - The self-test has 23 plants and a decoy-SKIP case.
- **orca-agent-mark-live.** It records a baseline stock window, then:
  - drives the tab (the mark and title class must be present, and `markProven` is recorded);
  - waits 21 s idle (both must be gone);
  - drives again and clicks Stop (the mark must be gone and `stopped` set, and the next CLI click must carry `browser_owner_unavailable` in `error.message`);
  - opens a second stock window (no mark, node set equal to the baseline).
  - The step order is recorded, and the verdict rejects a stock check made before `markProven`. The self-test has 8 plants.

## Check results (lane worktree)

- Theia `yarn build` exit 0, and the emitted `lib/browser/chrome-bar-widget.js` contains `renderAgentControl`.
- PASS: `shell-error-copy-no-internals` (after the deviation below), `verify-shell-error-copy --self-test` (15 plants), `verify-tab-strip.mjs` and `verify-address-bar-modes.mjs`.
- Privileged-kind verify: `.agentStop(` appears exactly once in the widget, and no command or keybinding file names it.
- Acceptance greps: `renderAgentControl()` has its definition at :1682 and one call at :1909, after `renderSharing()`. The four copy keys count 4. `pb-agent-controlled` appears in chrome-bar.css.
- `orca-browser-tools` PASS: "30 U-rows equal the map's 30 entries: 15 existing contributions, 1 mark, 10 skips, 4 deferrals; 47 registered command ids over 122 extension sources, 35 classified kinds, v2 ids TERM-03, MOB-01, MOB-02, MOB-03, BRW-06, BRW-07, BRW-08, BRW-09, COS-01". The self-test PASSes with 9 plants.
- Self-tests:
  - `orca-browser-agent-live-self-test` PASS: 23 plants plus decoy-skip, and 24 lines starting `  ok `.
  - `orca-agent-mark-live-self-test` PASS: 8 plants.
- Both live rows print `SKIP -- lane p66-03 not merged (no AGENT_METHODS in powerbrowser/shell/PowerBrowserAPI.sys.mjs)` and exit 0.
- The import of `scripts/lib/orca-browser-live.mjs` exits 0 with empty stdout.
- `orca-browser-abilities`, `orca-browser-entry-points` and both of their self-tests PASS (unchanged from p66-02).
- `node scripts/verify-web-tab-bridge.mjs` reports exactly lane p66-02's two cross-lane lines and nothing else:
  - `kinds: the frontend sends kinds chrome has no case arm for: webTabAgent, webTabAgentStop`
  - `push-kinds: the frontend subscribes to kinds chrome never pushes: agentControlChanged`
- `--quick` in the lane has 64 red rows. None reads a file this lane changed. The reds are:
  - `upstream/` absent ("broken instrument");
  - `orca-mobile-skew-self-test` (no `orca/node_modules`);
  - lane p66-02's recorded cross-lane reds: `gui02-web-tab-bridge`, `page-tools-reader-crash` and `orca-pane-routes-self-test`, with their self-tests;
  - `scan-brand-residue` and its self-test (brand rows below).

## Coordinator proof commands

After all five merges (p66-01, p66-02, p66-03, p66-04, then p66-05), the PowerBrowser build, the Orca build (`nix develop .#orca --command bash scripts/build-orca.sh`, which builds `pb-browser-host.js`) and the Theia rebuild. Run with inherited `ORCA_*` unset:

```sh
flock /home/chris/coding/Power-Browser/.git/pb-live.lock scripts/verify-platform.sh --only orca-browser-agent-live
flock /home/chris/coding/Power-Browser/.git/pb-live.lock scripts/verify-platform.sh --only orca-agent-mark-live
scripts/verify-platform.sh --only orca-browser-tools
scripts/verify-platform.sh --only shell-error-copy-no-internals
```

- What to read in each output:
  - **orca-browser-agent-live:** its PASS line names every clause. If an absolute installed-Orca path exists on the host, verify-orca-hidden-electron's `run` SKIPs, and clause (f) is then printed as a named `SKIP (f)`. A skipped (f) is not a pass of P66-29.
  - **orca-agent-mark-live:** needs about 21 s of idle wait.
- The live code was never run against a built tree in this lane. Expect harness-level fixes in these places:
  - CLI flag spellings: `--page` on `click`/`focus`/`type`/`cookie`, and `--element` taking a CSS selector, as the agent child's `querySelector` reads it.
  - Whether the overlay documents appear as BiDi top-level contexts. `inPage` depends on it, and the user-focus and pixel-adjacent reads use it.
  - The cookie-get result shape (`result.cookies[].name`).
  - The reload recovery wait.

## Merge note for the coordinator

- Merge `refs/heads/ServerDestroyer/p66-05` **last**, after p66-02 (its base) and p66-03/p66-04.
- Registry: the quick block (`orca-browser-tools`, `-self-test`, `orca-browser-agent-live-self-test`, `orca-agent-mark-live-self-test`) sits directly after 66-02's block before `"allowlist-schema|check_allowlist_schema"`. The full block (`orca-browser-agent-live`, `orca-agent-mark-live`) sits directly before the `    )` that closes the full `CHECKS+=(` list. Both go fifth at their anchors, after 66-04's.
- `scripts/verify-shell-error-copy.mjs` gains four `EXPECTED_NAV_COPY` rows after the sharing rows. No other Phase 66 lane touches this file.
- No WINDOWS.md ids are opened or closed. `inventory/brand-tokens.json` is not edited.
- Brand rows needed. The report is at `.mozbuild/p66-05/brand-report.md` in the lane worktree, scanned with every lane file staged. Condition-4 failures by file (lower/title/upper):
  - `scripts/lib/orca-browser-live.mjs` 15/11/13
  - `scripts/verify-orca-browser-agent-live.mjs` 28/10/0
  - `scripts/verify-orca-agent-mark-live.mjs` 10/3/0
  - `scripts/verify-orca-browser-tools.mjs` 13/1/7
  - `theia/extensions/orca-browser/src/common/orca-browser-tools.ts` 2/6/1
  - `theia/extensions/chrome-bar/src/browser/chrome-bar-copy.ts` 0/2/0
  - `scripts/verify-shell-error-copy.mjs` 0/1/0
  - `chrome-bar-widget.tsx`, `chrome-bar.css` and `verify-platform.sh` add no unclaimed token.
  - The held-back coincidental rows move: Orca 2108 to 2117, orca 4199 to 4235, ORCA 846 to 849 and orcad 1218 to 1219. This includes p66-02's moves, because the base carries that lane.
  - The lane tree has 373 condition-4 failures, of which 123 are this lane's. The coordinator re-measures on the staged merged tree.

## Deviations from Plan

**1. [Rule 3 - Blocking] Copy rows added to the reviewed set in `scripts/verify-shell-error-copy.mjs`**
- Found during: Task 1.
- Issue: `shell-error-copy-no-internals` compares CHROME_BAR_COPY with the hand-kept `EXPECTED_NAV_COPY` set and went red naming all four new strings as "unreviewed chrome-bar copy". The plan requires that row to stay green, but the file is not in files_modified.
- Fix: the four strings are added after the sharing rows with a Phase 66 comment. Task 3's lane-diff check therefore lists one path outside files_modified. No other lane edits the file.
- Commit: ead6a972.

**2. [Rule 3] DPR 2 is a pref set live in a second launch.** `withOrcaTabsSession` exposes no `extraPrefs`, and editing `orca-tabs-live.mjs` is outside the lane's files. The clause checks the page's `devicePixelRatio` before judging pixels.

**3. [Rule 3] Clause (g) uses the pane client's runtime calls.** The pane bundle exports no store action that calls `createBrowserTab`. The clause makes the two calls `createWebRuntimeSessionBrowserTab` makes, through Orca's own `window.api`: the placement, then `browser.tabCreate` on the pane client's connection. It records the credential kind from `link.connection()`, and only the kind.

**4. [Rule 1] The `orca-browser-tools` self-test adds a `stale-map-entry` plant** (9 plants against the plan's 8), so that the "both ways" set comparison is proven in each direction.

## Not done in this lane, recorded

- No live run. Both live rows SKIP here, as the plan states, and their live paths are unexercised. See the expected harness fixes under the coordinator proof commands.
- Real Claude was not used. Both rows run Phase 64's stub agent, and the plan names no Claude prompt for this lane.

## Owner items

- Copy review (end pass) of the four rows quoted above. "Orca" is named in the tooltip as the product the agent belongs to.
- Clause (f) depends on the host having no installed Orca at an absolute path. Otherwise hidden-electron's stock half SKIPs, and P66-29 stays unproven on that host.

## Known Stubs

None.

## Threat Flags

None beyond the plan's register:
- T-66-20: the mark draws only pushed state.
- T-66-21: the next command is required to fail with `browser_owner_unavailable`.
- T-66-22: the copy check and the reviewed set.
- T-66-23: lock, scratch HOME and profile, recorded-pid teardown and redaction, all through `withOrcaTabsSession`.

## Self-Check: PASSED

- Every created and modified file listed above exists. Commits ead6a972 and 31760f81 are ancestors of HEAD.
- The lane diff against `refs/heads/ServerDestroyer/p66-02` holds the 10 files_modified paths plus `scripts/verify-shell-error-copy.mjs` (deviation 1).
