---
phase: 32-page-tools
plan: "07"
subsystem: chrome-boundary
tags: [page-tools, reader, view-source, devtools, crash, favicon, remoteness, live-harness, blocker]
status: partial
requires:
  - phase: 32-page-tools (plans 01, 02, 03, 04, 05, 06, 09)
    provides: the web-tab arms, the tab-host icon record, the Controllers edit route, the rebuilt and stamped 050 binary
provides:
  - webTabReader, webTabViewSource and webTabDevtools (the last refuses) in WEB_TAB_ACTION_KINDS, handleWebTabAction, WebTabMessage and KIND_CLASSES
  - one oop-browser-crashed listener per overlay, pushing crashed; reset on the next page
  - favicon, crashed and isReaderMode on the state push and on WebTabState
  - verify-page-tools-reader-crash.mjs with five planted faults
  - remoteness-repro live scenario (record-only, own sessions) and its recorded verdict
affects:
  - 32-08 (rendering of the crash UI, reader toggle, and the live rows for favicon, crash and remoteness-regression)
  - 33 (Edit menu and greying, carried from 32-06)
tech-stack:
  added: []
  patterns:
    - record-only live scenario with its own sessions, writing its verdict only when named
    - chrome-minted privileged loads from a tab id, never a frame URL
key-files:
  created:
    - scripts/verify-page-tools-reader-crash.mjs
  modified:
    - powerbrowser/shell/PowerBrowserAPI.sys.mjs
    - powerbrowser/INTERNAL-APIS.md
    - theia/extensions/tab-uris/src/browser/web-tab.ts
    - scripts/verify-web-tab-bridge.mjs
    - scripts/verify-platform.sh
    - scripts/verify-page-tools-live.mjs
    - scripts/lib/pb-probe-verdicts.json
key-decisions:
  - "Task 1 verdict is not-reproduced R 0/4 A 0/4. The plan's rule applies: the remoteness fix (Task 3 f) does not start."
  - "webTabDevtools is refused, not routed. openStockPage has no devtools page, and a DevTools window needs a real XUL tab for the overlay. No toolbox fallback and no custom inspector (D-23)."
  - "The readability signal is not built from chrome. AboutReaderChild computes it in the content process, so a chrome-side check cannot run on a remote overlay. isReaderMode comes from the overlay URI instead."
  - "Task 2 and the chrome half of Task 3 (e) and (g) share one commit, because they share the shell's web-tab section and the state push literal."
  - "The default live run excludes remoteness-repro. The page-tools-live row runs every scenario with no arguments, so only a named run may write the verdict key."
patterns-established:
  - "A record-only scenario prints every run's fields, blank or clean, so a clean verdict shows what the observers read."
requirements-completed: []
coverage:
  - id: D1
    description: "The shared-process blank reload is reproduced live on the unfixed tree before any fix line"
    requirement: PAGE-10
    verification:
      - kind: e2e
        ref: "scripts/verify-page-tools-live.mjs#remoteness-repro"
        status: fail
    human_judgment: false
    rationale: "Not reproduced: verdict not-reproduced R 0/4 A 0/4. The precondition (a process switch on the fifth tab) did not occur in any of eight runs. Blocker."
  - id: D2
    description: "Remoteness fix at the DidChangeBrowserRemoteness listener, verdict flips to not-reproduced"
    requirement: PAGE-10
    verification: []
    human_judgment: false
    rationale: "Not built. Blocked by D1 per the plan's rule."
  - id: D3
    description: "Reader enter and leave in the same overlay, behind the readability signal"
    requirement: PAGE-10
    verification:
      - kind: unit
        ref: "scripts/verify-page-tools-reader-crash.mjs"
        status: pass
    human_judgment: false
    rationale: "The arm is built and gated (routing, union, classification). The readability signal is not built, so the toggle has no enablement source, and the reader page was not run live."
  - id: D4
    description: "View source minted chrome-side; no view-source: literal in Theia"
    requirement: PAGE-10
    verification:
      - kind: unit
        ref: "scripts/verify-page-tools-reader-crash.mjs#self-test"
        status: pass
    human_judgment: false
    rationale: "Wall asserted by the gate. The live view-source load was not run. inNewTab is refused."
  - id: D5
    description: "F12 routes through openStockPage"
    requirement: PAGE-10
    verification: []
    human_judgment: false
    rationale: "Not delivered. openStockPage has no devtools page; webTabDevtools refuses."
  - id: D6
    description: "One oop-browser-crashed listener per overlay; crashed pushed; no displayLoadError"
    requirement: PAGE-11
    verification:
      - kind: unit
        ref: "scripts/verify-page-tools-reader-crash.mjs#self-test"
        status: pass
    human_judgment: false
    rationale: "Chrome half built and gated. The live crash scenario and the Theia crash UI ride plan 32-08, so the crash signal is not live-proven here."
  - id: D7
    description: "Favicon push bounded to data:image/ at 64 KiB"
    requirement: PAGE-04
    verification:
      - kind: unit
        ref: "scripts/verify-page-tools-reader-crash.mjs#self-test"
        status: pass
    human_judgment: false
    rationale: "Chrome half built and gated. The favicon live row rides plan 32-08."
---

# Phase 32 Plan 07: Reader, view source, DevTools, crash and favicon chrome half; remoteness repro blocked Summary

**The reader, view-source and crash chrome arms, the crash listener and the favicon push are built and gated; the shared-process blank reload was not reproduced on the unfixed tree (verdict not-reproduced R 0/4 A 0/4), so the remoteness fix does not start, and the DevTools route and the readability signal are not delivered.**

## Status

This plan is **partial** and blocked. Not complete. Three must-haves are unbuilt work, not deferred checks:

1. **Remoteness fix (Task 3 f) not built.** The Task 1 repro ran eight clean sessions. The fifth overlay never switched process in any run, so the precondition the defect needs was not met. The plan's rule is that no fix lands for a defect the tree does not show.
2. **F12 DevTools route missing (PAGE-10).** `openStockPage` has no devtools page. `webTabDevtools` is refused, with no fallback.
3. **Readability signal not built (PAGE-10).** The reader toggle has no enablement source, so `isArticle` is not pushed.

Also still open: the live proof of the crash, favicon and reader rows (plan 32-08), and the isolation log capture (see Blockers).

## Performance

- **Tasks:** 3 planned. Task 1 ran and recorded a blocker. Task 2 and the chrome half of Task 3 (e) and (g) were built in one commit. Task 3 (f) did not start.
- **Commits:** 2 task commits, measured from the plan base: `git rev-list --count 4f9a26eb..HEAD` = 2 (`a963365c`, `8c3260b3`), plus this SUMMARY commit.
- **Realized diff:** about 43,500 tokens by the chars/4 estimate (160,813 characters of changed tracked files plus the 13,422-character new gate). Plan estimate 65,000.
- **Duration:** not measured.

## Accomplishments

- **Repro harness (Task 1).** `scripts/verify-page-tools-live.mjs --scenario remoteness-repro` runs eight record-only sessions, four per trigger, five same-origin tabs each, each with its own ProcessIsolation log under TMPDIR. Positive controls are the fifth tab's initial GET and its served title. The `repro-observer-blind` plant is red, naming `no initial GET for the fifth tab`. The self-test passes with seven planted faults red and the clean controls green.
- **Reader, view source, DevTools arms (Task 2).** `webTabReader{tabId,enter}`: enter loads `about:reader?url=` for the overlay's own http(s) page with the system principal, and leave loads the page the reader URL names with a null principal. `webTabViewSource{tabId,inNewTab?}`: the inner page is the overlay's own http(s) or file URL, and `view-source:` plus that URL is minted chrome-side with a null principal. `webTabDevtools{tabId}` refuses.
- **Crash signal (PAGE-11, chrome half).** One `oop-browser-crashed` listener per overlay, in `attachWebTabPageListeners`. It sets `crashed` and pushes it. `resetWebTabPage` clears it on the next page. The listener never reads `docShell`, and `displayLoadError` appears nowhere in the shell.
- **Favicon push (PAGE-04, chrome half).** The overlay's tab-host image goes on the push only when it is a `data:image/` URL of at most 65,536 characters. Nothing is fetched over the network.
- **Theia state.** `WebTabState` gains `favicon`, `crashed` and `isReaderMode`. `applyState` maps them. The union gains the three kinds, typed and typechecked.
- **Gate.** `scripts/verify-page-tools-reader-crash.mjs` checks routing as set equality (handler arms against `WEB_TAB_ACTION_KINDS`, and the union against every webTab case arm in the shell), no crash or restore kind, the three state fields on both pushes, the favicon bound, one crash listener, no `displayLoadError` call, and no `view-source:` literal or inspector import in any Theia source. Its self-test plants five faults, each red by name.

## Task Commits

1. **Task 1: record the remoteness-repro verdict on the unfixed tree:** `a963365c`. Verdict `not-reproduced R 0/4 A 0/4`. Commit message quotes the verdict and the blocker.
2. **Task 2 with the chrome half of Task 3 (e) and (g):** `8c3260b3`. One commit, see Deviations 1.
3. **Task 3 (f): remoteness fix:** not committed (blocked).

## Live results (rebuilt Theia app; patch 050 stamp checked before the repro runs)

| Check | Result | Evidence |
|---|---|---|
| `page-tools-live --scenario remoteness-repro` (run 1) | BROKEN, harness fault | `Cannot read properties of undefined (reading 'split')`: the chrome evaluate returned an object with its keys dropped. Fixed by serialising in chrome. |
| `--scenario remoteness-repro` (run 2) | `not-reproduced R 0/4 A 0/4` | Verdict written. Per-run fields not yet printed. |
| `--scenario remoteness-repro` (run 3, diagnostic) | `not-reproduced R 0/4 A 0/4` | Per-run fields: all 8 runs, `url=http remoteType=webIsolated bcSame=1 childSame=1 active=1 renderLayers=1 visible=1 history=http@0 didChange=0 isolation=none`; reload runs also `getSeen=1`. |
| `page-tools-live --self-test` | PASS | Clean controls green for all seven targets; seven planted faults red, including `repro-observer-blind`. |
| `--scenario find,zoom,audio,downloads,keys-theia,print,save,edit` | PASS (8 of 8) | after the chrome arms and push fields were added |
| `verify-nav-keys-live.mjs` | 31 PASS, 0 FAIL | matches the 32-06 baseline |
| `scripts/verify-platform.sh --quick` (in `nix develop .#theia`) | exit 0 | includes `page-tools-reader-crash` and its self-test |
| `tsc -b theia/extensions/tab-uris` | clean | run in `nix develop .#theia` |
| `verify-web-tab-bridge.mjs` and `--self-test` | PASS | 32 planted faults red |
| both catalogue gates (`verify-ng-040-internals-catalogue-lines.mjs`, `check-internals-boundary.sh --catalogue`) | PASS | rows remapped through the diff hunks; six rows added |

## Blockers

1. **Blank reload not reproduced (Task 1 gate).** Eight runs (reload and activation) show the fifth same-origin tab on `webIsolated`, with the same browsing context and frameloader child, `didChange=0`, and no process switch. The Phase 27 evidence reached `remoteType web` at `about:blank` on reload. This tree does not reach that state with these triggers. Next step: find the condition that makes the fifth tab switch, using the 27-02 scratch shape exactly, then re-run the repro. Task 3 (f) then starts from the recorded verdict.
2. **The ProcessIsolation capture is unproven.** `isolation=none` in all eight runs, so no `CheckIsolationForNavigation` line was read from the parent log. The log is written under TMPDIR with `%PID`, and the launcher passes the environment through. The capture is still unverified, so the isolation field is not evidence yet. Next step: confirm the parent's `iso-main.<pid>.moz_log` holds the line on a run that is known to switch.
3. **DevTools route (PAGE-10).** Phase 31's `openStockPage` has no devtools page. A devtools route needs a stock window with a real XUL tab for this overlay, which is Phase 31 scope. `webTabDevtools` refuses (`openStockPage has no devtools page`), with no fallback built.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Task 2 and Task 3 (e) and (g) share one commit.** The reader, view-source and crash edits share the web-tab helper section, the state push literal and the state default. Splitting the file into two commits would have meant rebuilding the file state by hand. One commit, `8c3260b3`, with the scope written in its message.

**2. [Rule 1 - Bug] The repro harness returned object results that lost their keys.** The first repro run failed on the first session with `Cannot read properties of undefined (reading 'split')`. A chrome evaluate that returns an object does not keep its keys in the BiDi round trip. `readReproState` now serialises inside chrome and parses in Node.

**3. [Rule 1 - Bug] The reader and crash gate's routing check counted the actor's own arms as drift.** The union carries the main-switch kinds (`webTabOpen`, `webTabReload`, ...), which route through the actor's switch, not `WEB_TAB_ACTION_KINDS`. The check now compares the union with every webTab case arm in the shell, and the handler's arms with `WEB_TAB_ACTION_KINDS`.

**4. [Rule 2 - Missing] Per-run field output added to the repro.** A clean verdict printed no evidence of what the observers read. The scenario now prints every run's fields, blank or clean. The diagnostic run is what showed no process switch occurred.

**5. [Rule 1 - Bug] A `view-source:` literal in a Theia comment.** It would have tripped the plan's wall, which covers comments. Reworded before the gate ran.

### Scope Deviations

**6. `webTabDevtools` refuses (Deviation of intent).** The plan routes it through `openStockPage`, which has no devtools page. Adding one would open the stock window's own tab, not the overlay, so the target would be wrong. Refusal is the honest state.

**7. Readability signal not built.** The plan computes it chrome-side on the overlay's document. AboutReaderChild runs it in the content process, and the content document is not reachable from chrome for a remote overlay. A content-side actor registration is needed, which this plan does not build. `isArticle` is not pushed, and `isReaderMode` comes from the URI.

**8. `faviconLoading`, `outerWindowID` and `lineNumber` not built.** The plan lists them. None has a consumer in this plan (32-08 renders). `view-source` takes `inNewTab` only.

**9. `inNewTab` refused on view source.** A new overlay for the source is not built.

**10. The default live run excludes `remoteness-repro`.** The `page-tools-live` registry row runs every scenario with no arguments, so a verdict-writing scenario in the default set would overwrite the verdict on every run.

**11. Catalogue remap through hunks, not `--fix`.** As in 32-06, `verify-ng-040-internals-catalogue-lines.mjs --fix` mis-maps rows. The rows were remapped from HEAD through the diff hunks, and six rows added for the reader and view-source loads.

**12. The WINDOWS.md ledger refused the appends.** `gsd-tools query windows append` failed on the same condition 32-06 recorded: the rendered table disagrees with the fenced JSON for rows 10, 11 and 19. The project rule forbids hand-editing `WINDOWS.md`. The three entries are listed under Deferred and Known Stubs for the next session to append.

**Total deviations:** 5 auto-fixed (one blocking, three bugs, one missing piece), 7 scope items.
**Impact on plan:** the blocker and the two unbuilt must-haves (the remoteness fix and the DevTools route) are not delivered, and the readability signal is unbuilt. The build work for the reader and view-source arms, the crash signal and the favicon push is delivered and gated. Plan status is partial.

## Known Stubs

- `webTabDevtools` (`WebTabMessage` member in `theia/extensions/tab-uris/src/browser/web-tab.ts`; `webTabDevtoolsReply` in `powerbrowser/shell/PowerBrowserAPI.sys.mjs`): refuses with `openStockPage has no devtools page`. Owner: Phase 31 follow-up, or a later plan that adds the devtools page.
- `isArticle` is absent from the state push and from WebTabState. The reader toggle has no enablement source. Owner: a later plan that adds a content-side reader actor.
- `faviconLoading` is absent from WebTabState.

## Deferred to the end-of-milestone verification pass

- The reader page as rendered on screen (the reader view's look once entered).
- The crash UI's contracted copy and layout over a crashed overlay (rendering rides plan 32-08; the look is checked at milestone end).
- The favicon and crash live rows (plan 32-08).

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: privileged load | powerbrowser/shell/PowerBrowserAPI.sys.mjs | `about:reader?url=` is loaded with the system principal, a privileged load in the web-tab section. Chrome builds the URL from the overlay's own http(s) page; the frame sends only a tab id and a boolean. Review: the T-32-02c mitigation holds only while the http(s) check stays in front of the load. |

## Next Phase Readiness

- Plan 32-08 can build the crash UI, the favicon row and the reader toggle on the arms and push fields committed here. Its reader toggle needs the readability signal, which is not built.
- Task 3 (f) starts only after the repro reproduces the blank reload. The next executor should begin with the repro trigger (Blocker 1), then the isolation capture (Blocker 2).
- Three ledger entries are pending (see Known Stubs and Deviation 12): the remoteness fix, the DevTools route and the readability signal.

## Self-Check

- `[ -f scripts/verify-page-tools-reader-crash.mjs ]` and `[ -f .planning/phases/32-page-tools/32-07-SUMMARY.md ]`: present.
- `git merge-base --is-ancestor a963365c HEAD` and `git merge-base --is-ancestor 8c3260b3 HEAD`: both ancestors of HEAD.
- `node scripts/verify-page-tools-reader-crash.mjs --self-test` ends with PASS, five planted faults red.
- `node -e "console.log(require('./scripts/lib/pb-probe-verdicts.json')['remoteness-repro'])"` prints `not-reproduced R 0/4 A 0/4`, as recorded. Task 1's acceptance criterion (a verdict starting `reproduced`) is NOT met.

## Self-Check: PARTIAL (build work, gates and regression pass; remoteness fix blocked; DevTools route and readability signal not delivered)
