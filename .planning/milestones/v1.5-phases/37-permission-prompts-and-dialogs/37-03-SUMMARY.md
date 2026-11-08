---
phase: 37-permission-prompts-and-dialogs
plan: "03"
subsystem: chrome-boundary
tags: [dialogs, prompt-03, probe-1, stock-commondialog, stop-repeat, beforeunload, static-gate, live-harness]
status: complete
live_proof: deferred
owner_gate: deferred
requires:
  - phase: 37-permission-prompts-and-dialogs
    plan: "01"
    provides: verify-permission-prompts.mjs, verify-prompts-live.mjs (runSession, staticAudit, plants), the push recorder use
  - phase: 37-permission-prompts-and-dialogs
    plan: "02"
    provides: the same live harness and gate, extended in place
provides:
  - .planning/probes/prompt-probe-verdict.json (provisional owner default stock-keeps-ide-usable, no evidence claimed)
  - verify-prompts-live.mjs scenarios dialog-probe, dialog, stop-repeat, beforeunload-scope and plants probe-edit-blocked, push-traffic-frozen, cross-tab-leak, theia-beforeunload-relayed
  - verify-permission-prompts.mjs rule (p), the dialog outcome pinned to the verdict, with eight plants
affects:
  - 37-04 (same harness and gate)
  - the end-of-milestone live pass (probe 1 decides whether Task 3's relay branch must be built)
tech-stack:
  added: []
  patterns:
    - a verdict file that a static gate reads, which accepts a provisional owner default and names it, and which a live run overwrites with evidence
key-files:
  created:
    - .planning/probes/prompt-probe-verdict.json
  modified:
    - scripts/verify-prompts-live.mjs
    - scripts/verify-permission-prompts.mjs
key-decisions:
  - "Owner default for this run: outcome stock-keeps-ide-usable, marked provisional. Task 2 (checkpoint:decision, blocking-human) was not stopped at; it is a deferred owner decision."
  - "Stock branch only: no dialog code, no getTabDialogBox member, no webTabDialogAnswer kind, no dialogRequest push, no stop-repeat copy row."
  - "Probe 1 reads the shell window's widget enabled state (nsIBaseWindow.enabled) as part of ideEditOk, because an edit typed through BiDi lands in the Theia content process even while the window-modal loop has disabled the shell widget."
  - "Stop-repeat uses the native checkbox; suppression is upstream's, per browsing-context group, so it is per tab by construction. No chrome-side suppress map."
patterns-established:
  - "A live probe writes its verdict only on its own live run (a module flag set by main); self-test control and plant sessions never write it."
requirements-completed: []
duration: "about 50 minutes"
completed: "2026-10-31"
commits: 3
plan_head_before: e89ebe26ad9c54ec5fb6148800d9dab19c0275c1
plan_head_after: 14b0b732c94b8c824f9f5fd12f4927c9783c26b2
actuals:
  tokens: 8500
  tasks: 4
  commits: 3
---

# Phase 37 Plan 03: Dialogs, probe 1 and the stock-outcome pin Summary

**Probe 1 is written as the `dialog-probe` live scenario, and the verdict file holds the owner default `stock-keeps-ide-usable`, marked provisional with no evidence. Rule (p) in the permission gate pins the tree to the verdict. Under the stock verdict, `powerbrowser.js` must have no `getTabDialogBox` member. A provisional verdict is accepted and named in the gate's output. The `dialog`, `stop-repeat` and `beforeunload-scope` scenarios are written with their plants. All live runs are deferred because this lane has no built binary. Static evidence suggests the live probe may flip the default, as described under Risk.**

## Status

Every static criterion is met, and `--quick` passed after each committed task. The following are deferred:
- **The Chris gate (Task 2).** It is recorded below as a deferred owner decision.
- **The live proof.** Probe 1 and the three Task 4 scenarios have not run. `verify-prompts-live.mjs --scenario dialog-probe` and `--scenario dialog,stop-repeat,beforeunload-scope` exit `BROKEN INSTRUMENT: no built binary`.

No screenshot, push log or live claim exists. PROMPT-03 is **not** marked complete.

## Deferred owner decision: the Chris gate, probe 1

**Chris gate, probe 1:** defaulted to `stock-keeps-ide-usable`. If the live probe shows that the stock dialog blocks the IDE, there are two cases:
- **`relayFeasible` true:** Task 3's relay branch must be built. That means the `getTabDialogBox` stand-in member with the Pitfall 2 call-site audit, the `setTabLabelForAuthPrompts` audit, and the relay kind (`webTabDialogAnswer` with rules 1, 9, 10 and 11, the `dialogRequest` push and subscriber, and the stop-repeat enum and copy row). The stock-outcome gate rule must then be flipped. Rule (p) does this automatically: a live `stock-blocks-ide` verdict with `relayFeasible: true` turns the gate red until the member exists.
- **`relayFeasible` false:** PROMPT-03 cannot be met as written, and the phase routes to Chris. Rule (p) goes red with "PROMPT-03 cannot be met as written ... route to Chris".

### Risk: the default may not survive the live probe

The upstream source points toward `stock-blocks-ide` on input. All three facts below are read from the pinned tree:
- `AppWindow::ShowModal` calls `EnableParent(false)` (upstream/xpfe/appshell/AppWindow.cpp:460). This disables the shell window's main widget for the life of the dialog.
- `nsWindow::SetModal` calls `gtk_window_set_modal` (upstream/widget/gtk/nsWindow.cpp:751).
- PromptParent opens the commonDialog with `"centerscreen,chrome,modal,titlebar"` (PromptParent.sys.mjs:301-306).

So while a page dialog is open, a user probably cannot type into the IDE, even though pushes keep flowing (the modal loop is a nested event loop). The probe measures this directly: `inputEnabled` is part of `ideEditOk`. Chris should expect the verdict to come back `stock-blocks-ide`. `relayFeasible` is measured as whether the tab branch's other gBrowser reads exist on the stand-in (`getTabForBrowser`, `selectedBrowser`). The decision whether to build the relay stays with Chris.

## Accomplishments

- **Task 1, probe 1 (written, not run).** `dialog-probe` drives alert, confirm, prompt, leave-page (a `beforeunload` navigation) and HTTP auth (the harness's own 401 Basic server) through the stock window-modal `chrome://global/content/commonDialog.xhtml`. While each dialog is open, it does four things:
  - types a marker into an untitled Theia editor and reads the editor text back
  - reads the shell window's `nsIBaseWindow.enabled`
  - navigates a traffic tab and requires a new `loaded` push on the same recorder
  - takes a KWin screenshot (raise with a KWin script over qdbus, then `spectacle -b -n -f`)

  It then answers the dialog through its own controls and checks that the page resolved. A live `--scenario dialog-probe` run writes the verdict, with the outcome, `relayFeasible`, evidence paths, the Theia bundle sha256 and the binary mtime. It also writes `.planning/probes/prompt-probe/` (screenshots and `push-log.json`). A missing screenshot is `BROKEN INSTRUMENT` and no verdict is written. Self-test sessions never write the verdict. Plant: `probe-edit-blocked` goes red with "stock dialog blocks the IDE".
- **Provisional verdict.** `{"outcome":"stock-keeps-ide-usable","provisional":true,...}`, with empty screenshots and null pushLog, ideEditOk and build. It was staged by explicit path.
- **Task 3, stock branch.** Rule (p) in `verify-permission-prompts.mjs` checks the following:
  - The verdict outcome is in the enum.
  - A provisional verdict claims no evidence.
  - A live verdict carries screenshots, a push log, ideEditOk, build and date, and the evidence files exist on disk.
  - `stock-keeps-ide-usable` requires no `getTabDialogBox` member, method, property or assignment in `powerbrowser.js`.
  - A feasible relay verdict requires the member.
  - `relayFeasible: false` is red.

  The gate prints the outcome and whether it is PROVISIONAL. There are eight plants, all red after the green control. Dialog code, the stand-in, the bridge kinds and the catalogue are unchanged.
- **Task 4, stock branch.**
  - `dialog` asserts every kind's resolution, edit, input-enabled state, push advance and screenshot. Plant: `push-traffic-frozen`.
  - `stop-repeat` loops 20 alerts and requires the stock checkbox on the second one. After ticking it, it requires that no further dialog appears, that the loop completes, that a later alert in the same tab shows nothing, and that a new tab (a new browsing-context group) still prompts. Plant: `cross-tab-leak`.
  - `beforeunload-scope`: a web-tab leave-page reaches the stock dialog (the control). A dirty Theia editor plus a frame reload shows the stock leave dialog, which is answered "stay". A web-tab load recorded after that point is the same-session recorder control. No `dialogRequest` push may be recorded. Plant: `theia-beforeunload-relayed`.
  - The static audit derives the commonDialog URL, the window-modal fallback, eight commonDialog ids, `dom.require_user_interaction_for_beforeunload`, and the native stop path (`ShouldPromptToBlockDialogs`, two `if (disallowDialog) { DisableDialogs(); }` sites, `group->SetAreDialogsEnabled(false)`) from upstream.

## Verification results (this lane)

| Check | Result |
|---|---|
| `node scripts/verify-permission-prompts.mjs` | PASS. Prints "dialog outcome stock-keeps-ide-usable (PROVISIONAL ...)" |
| `node scripts/verify-permission-prompts.mjs --self-test` | PASS (control green, 31 plants red, 8 new) |
| `node scripts/verify-shell-gbrowser-standin.mjs` (+ `--self-test`) | PASS (`getTabDialogBox`, `setTabLabelForAuthPrompts` still DELIBERATELY_ABSENT) |
| `node scripts/verify-web-tab-bridge.mjs` (+ `--self-test`) | PASS (32 kinds, none added) |
| `node scripts/verify-shell-error-copy.mjs --self-test` | PASS (no copy row added) |
| `node scripts/verify-prompts-live.mjs --self-test --static` | PASS (14 plants, every scenario has one, upstream names derived) |
| `node scripts/verify-prompts-live.mjs --scenario dialog-probe` | NOT RUN: BROKEN INSTRUMENT, no built binary |
| `node scripts/verify-prompts-live.mjs --scenario dialog,stop-repeat,beforeunload-scope` | NOT RUN: BROKEN INSTRUMENT, no built binary |
| `nix develop .#theia --command scripts/verify-platform.sh --quick` | PASS after Task 1, Task 3 and Task 4 ("verify-platform: PASS -- all checks passed") |

Restart note: this plan changes no file under `powerbrowser/shell`, no `jar.mn` and no Theia source. The live pass therefore needs no Gecko rebuild and no new Theia build beyond the bundle 37-01 and 37-02 already require. Chrome JS loads with `MOZ_PURGE_CACHES=1` (withProbeShell sets it).

## Task Commits

1. **Task 1: dialog-probe scenario and provisional verdict**: `471834ed` (test)
2. **Task 2: checkpoint:decision**: not stopped at (owner default; deferred above). No commit.
3. **Task 3: rule (p), the dialog outcome pinned to the verdict**: `83a41f20` (feat)
4. **Task 4: dialog, stop-repeat and beforeunload-scope scenarios**: `14b0b732` (test)

## Deviations from Plan

### Owner-directed (this run)

- **Task 1 did not run probe 1 live.** There is no binary. The scenario is written, and its offline audit passes. The verdict is the owner default, marked `provisional: true`, with no evidence. The plan's Task 1 automated verify (evidence paths must exist) was replaced by rule (p), which accepts the provisional form and says so in its output.
- **Task 2 did not stop.** It is recorded as a deferred owner decision (above).
- **The Theia app build** (`theia build --app-target=browser`) did not run. No Theia file changed, so `yarn build:extensions` was not needed either.

### Auto-fixed Issues

**1. [Rule 1 - Bug] A BiDi-typed edit cannot prove that the IDE is usable during a window-modal dialog**
- **Found during:** Task 1
- **Issue:** The plan's evidence is "an IDE edit through the Theia frame". BiDi's `input.performActions` dispatches inside the Theia content process, so it can land while the window-modal loop has disabled the shell widget (`EnableParent(false)`) and the GTK modal grab blocks real input. Used alone, it would report `stock-keeps-ide-usable` when the IDE is unusable.
- **Fix:** The probe also reads `window.docShell.treeOwner` as `nsIBaseWindow.enabled`. `ideEditOk` requires both the edit and an enabled shell widget.
- **Commit:** `471834ed`

**2. [Rule 3 - Blocking] HTTP auth needs a 401 server**
- **Found during:** Task 1
- **Issue:** `serveNavPages` serves only 200, 404 and 500.
- **Fix:** A small 401 Basic server local to the harness (`serveAuth`), with test-only credentials. The shared probe library is unchanged.
- **Commit:** `471834ed`

### Scope and structure notes

- **"Type and save":** the probe types into an untitled editor and reads the text back. It does not save, because saving an untitled file opens a Save As dialog, which would add a second modal to the measurement.
- **Leave-page** uses `dom.require_user_interaction_for_beforeunload=false` in the harness profile, so the prompt does not depend on a gesture. The static audit pins the pref name to upstream.
- **Plants that simulate a symptom.** No privileged API reaches a content group's dialog state from the harness, so two plants simulate what the fault would look like:
  - `cross-tab-leak` turns the new tab's `alert` into a no-op, which is what a leaked block would look like from that tab.
  - `theia-beforeunload-relayed` dispatches a `dialogRequest` state event in the Theia frame.

  Both are labelled in code as simulated symptoms.
- **Rule (p) lives in `verify-permission-prompts.mjs`**, the plan's stock-branch file. `verify-shell-gbrowser-standin.mjs` already pins `getTabDialogBox` absent, and rule (p) adds the link to the verdict.

## Deferred to the end-of-milestone live pass

1. **Probe 1:** `node scripts/verify-prompts-live.mjs --scenario dialog-probe` on a built binary with the sandbox off (spectacle needs the session DBus), then `git add` the verdict and `.planning/probes/prompt-probe/` by explicit path. Then run `node scripts/verify-permission-prompts.mjs`. A live verdict replaces the provisional one, and rule (p) then enforces whichever branch the verdict names.
2. **The Chris gate** (above), on the live verdict.
3. `node scripts/verify-prompts-live.mjs --scenario dialog,stop-repeat,beforeunload-scope` on the stock branch.
4. `node scripts/verify-prompts-live.mjs --self-test`: clean controls, then all 14 plants, including the four from this plan.
5. **Human review of the probe screenshots:** whether the IDE looks interactive. A screenshot cannot show input state, which is why `inputEnabled` is measured.
6. **Watch live:**
   - Whether the WebDriver BiDi session (`session.new` with empty capabilities) auto-closes content prompts. If it does, the scenarios report "never appeared as a stock commonDialog" and the session needs `unhandledPromptBehavior: ignore`. The precedent in `verify-site-identity-live.mjs` quitTyped found a commonDialog still open.
   - Whether a 127.0.0.1 cross-port 401 shows the auth dialog.
   - Whether the Theia frame's `location.reload()` with a dirty untitled editor prompts.

## Assumed cross-lane names

- **Phase 35 (35-02):** `installShellFurniture(window)` and `scripts/verify-shell-furniture.mjs`. Neither is used, because the stock outcome needs no dialog furniture. `installPermissionPromptFurniture` is unchanged.
- **Phase 36:** none.

## Known Stubs

None. No product code changed.

## Threat Flags

None. The harness's 401 server listens on 127.0.0.1 only, for the life of one session, with test-only credentials.

## Self-Check: PASSED

- FOUND: .planning/probes/prompt-probe-verdict.json (provisional), the `dialog-probe`, `dialog`, `stop-repeat` and `beforeunload-scope` scenarios in scripts/verify-prompts-live.mjs, `checkDialogOutcome` in scripts/verify-permission-prompts.mjs
- FOUND commits: 471834ed, 83a41f20, 14b0b732 (`git rev-list --count e89ebe26..14b0b732` = 3)
- Live proof: deferred, not claimed
