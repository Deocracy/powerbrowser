---
phase: 67-hosting-hardening
verified: 2026-11-11T21:30:00Z
status: human_needed
score: 10/10 must-haves verified
covered_files:
  - ".planning/workstreams/orca/phases/67-hosting-hardening/67-01-PLAN.md"
  - ".planning/workstreams/orca/phases/67-hosting-hardening/67-01-SUMMARY.md"
  - ".planning/workstreams/orca/phases/67-hosting-hardening/67-02-PLAN.md"
  - ".planning/workstreams/orca/phases/67-hosting-hardening/67-02-SUMMARY.md"
  - ".planning/workstreams/orca/phases/67-hosting-hardening/67-03-PLAN.md"
  - ".planning/workstreams/orca/phases/67-hosting-hardening/67-03-SUMMARY.md"
  - ".planning/workstreams/orca/phases/67-hosting-hardening/67-04-PLAN.md"
  - ".planning/workstreams/orca/phases/67-hosting-hardening/67-04-SUMMARY.md"
  - ".planning/workstreams/orca/phases/67-hosting-hardening/67-05-PLAN.md"
  - ".planning/workstreams/orca/phases/67-hosting-hardening/67-05-SUMMARY.md"
  - ".planning/workstreams/orca/phases/67-hosting-hardening/67-06-PLAN.md"
  - ".planning/workstreams/orca/phases/67-hosting-hardening/67-06-SUMMARY.md"
  - ".planning/workstreams/orca/phases/67-hosting-hardening/67-07-PLAN.md"
  - ".planning/workstreams/orca/phases/67-hosting-hardening/67-07-SUMMARY.md"
  - "orca-overlay/files/src/renderer/src/pb/pb-session-pairing.ts"
  - "powerbrowser/INTERNAL-APIS.md"
  - "powerbrowser/shell/GroupActorChild.sys.mjs"
  - "powerbrowser/shell/OrcaEnv.sys.mjs"
  - "powerbrowser/shell/OrcaService.sys.mjs"
  - "powerbrowser/shell/PowerBrowserAPI.sys.mjs"
  - "powerbrowser/shell/jar.mn"
  - "powerbrowser/shell/powerbrowser.js"
  - "scripts/lib/mozlz4.mjs"
  - "scripts/lib/orca-offer-scan.mjs"
  - "scripts/verify-orca-credential-store-live.mjs"
  - "scripts/verify-orca-credential-store.mjs"
  - "scripts/verify-orca-failure-classes.mjs"
  - "scripts/verify-orca-failure-page-live.mjs"
  - "scripts/verify-orca-landing-logo-live.mjs"
  - "scripts/verify-orca-landing-selectors.mjs"
  - "scripts/verify-orca-offer-file.mjs"
  - "scripts/verify-orca-pairing-containment.mjs"
  - "scripts/verify-platform.sh"
  - "scripts/verify-shell-error-copy.mjs"
  - "scripts/verify-sidecar-origin-gate-live.mjs"
  - "scripts/verify-sidecar-origin-gate.mjs"
  - "theia/extensions/orca-browser/src/browser/orca-browser-frontend-module.ts"
  - "theia/extensions/orca-panes/src/browser/failure/orca-failure-copy.ts"
  - "theia/extensions/orca-panes/src/browser/failure/orca-failure-page.tsx"
  - "theia/extensions/orca-panes/src/browser/failure/orca-hosting-status.ts"
  - "theia/extensions/orca-panes/src/browser/orca-pane-observer.ts"
  - "theia/extensions/orca-panes/src/browser/orca-pane-widget.tsx"
  - "theia/extensions/orca-panes/src/browser/orca-panes-frontend-module.ts"
  - "theia/extensions/orca-panes/src/browser/side-panel/orca-side-view-widget.tsx"
  - "theia/extensions/orca-panes/src/node/offer-file-policy.ts"
  - "theia/extensions/orca-panes/src/node/orca-panes-backend-module.ts"
  - "website-staging/privacy.html"
covered_digest: "v3:sha256:0a95ecffafcb77c035f60f1c0d75de97241e55b4cc64325d6a5530ec1a5efd9a"
behavior_unverified: 0
overrides_applied: 0
coincidental_reliance_items:
  - truth: "Orca's landing page shows the PowerBrowser logo through a JSWindowActor gated on the orcad origin"
    reason: undeclared-precondition
    harden: "The parent gate compares the sender's port with OrcaService.getState().port only (OrcaEnv.sys.mjs:610-619, PowerBrowserAPI.sys.mjs:11877-11886). _port is set before the spawn (OrcaService.sys.mjs:237) and never cleared, so while Orca is failed (port-in-use: by definition another program holds that port) a page served on that port gets the answer. Gate on state === 'ready' as well, and add a self-test plant for a failed state."
human_verification:
  - test: "Open an Orca chat and an Orca terminal tab, then induce each failure class (kill orcad, hold its port, chmod the offer file 0644). Look at the page in the light and the dark theme."
    expected: "The PowerBrowser page is legible in both themes, the buttons sit under the sentence, and the focus order reaches every button."
    why_human: "Visual layout and theme contrast. Deferred to the end-of-milestone owner pass (59-CONTEXT D-18)."
  - test: "Open orcad's address in a web tab with the dark theme."
    expected: "The PowerBrowser mark is visible on Orca's dark landing tile."
    why_human: "Visual contrast of brand/mark.svg on Orca's tile. Deferred to the end-of-milestone owner pass."
  - test: "Read the eight failure sentences, the protection sentence and the two RUN-09 sentences on the page and on privacy.html."
    expected: "The owner accepts the wording (owner item 'Copy' in 67-06-SUMMARY.md)."
    why_human: "Owner wording decision. Deferred to the end-of-milestone owner pass."
  - test: "Owner picks P67-17, P67-18, P67-19, P67-21, CA-07, HOME for live rows, D-36 (coordinator ruling) and the browser-host page class."
    expected: "Each is accepted or overridden by the owner."
    why_human: "Owner decisions recorded by 67-06/67-07, not code facts. Deferred to the end-of-milestone owner pass."
  - test: "Review the plan prohibitions marked 'verification: unverified' (67-01..67-05 must_haves.prohibitions)."
    expected: "The owner accepts the non-authoritative verdicts in 'Prohibitions' below."
    why_human: "Judgment-tier prohibitions get no enforcement test; this report's verdicts are non-authoritative (ADR-550 D4)."
audit_acknowledged:
  milestone: v1.7
  at: 2026-11-25
  status: human_needed
---

# Phase 67: Hosting hardening Verification Report

**Phase Goal:** Orca hosting fails in PowerBrowser's own words and keeps its secrets. Failures show a PB page, the pairing offer stays contained, the sidecar is Origin-gated, an insecure credential store is refused, and the landing page shows the PB logo.
**Verified:** 2026-11-11T21:30:00Z
**Status:** human_needed (every human item is deferred to the end-of-milestone owner pass; no gap)
**Re-verification:** No (initial verification)

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | SC1 / RUN-06: when orcad dies, its port is taken or pairing is lost, each open Orca tab shows a page that names PowerBrowser, states the problem and offers a working next step; every omitted identifier is a diagnostics row; shell-error-copy-no-internals green | VERIFIED | `orca-failure-copy.ts` holds all 8 sentences, each starting "PowerBrowser", each ending with Restart Orca, Reconnect or Details, which `ORCA_FAILURE_BUTTONS` renders. No pref key, port, path, pid, code or exception text in any sentence (read line by line). `orca-pane-widget.tsx:92-95` and `orca-side-view-widget.tsx:85-88` hide the pane root and mount `OrcaFailurePage`. Rows: `OrcaService.getDiagnosticRows` (failed step, failure code, port, pairing failure, browser host, temporary folder, setting, credential key folder, logo selectors). Live on the 67-07 tree: `.mozbuild/p67-07/run6`, `run8`, `run9` PASS ("every hosted view showed the PowerBrowser page for each induced class and recovered; after the restart the client kept its environment id..."). Quick: orca-failure-classes (17 steps, 2 codes, 8 classes), self-test 11 plants; shell-error-copy-no-internals PASS, 4 Orca plants red; orca-failure-page-live-self-test 20 cases |
| 2 | SC2 / RUN-07: a check reads the issued offer and scans history, session restore, logs, address field and copyable text and finds none; its self-test plants the offer in each sink and goes red naming the sink | VERIFIED | `scripts/lib/orca-offer-scan.mjs` holds 9 collectors, each `{ sink, control, read }`, and a missing control is red "collector blind". Self-test run here: "43 cases, 17 planted faults each red naming its sink, 9 controls found and 9 blind collectors red". Live: `.mozbuild/p67-07/run7` PASS ("9 sinks read, each control found, no needle of the launch's offer outside its five holders"), re-run after the D-36 pairing change |
| 3 | SC3 / RUN-08: a sidecar request from a non-PB Origin (orcad's or another loopback page) is rejected, PB pages are still served; self-test sends foreign and PB Origins with opposite outcomes | VERIFIED | One policy: `token-gate/src/common/origin-policy.ts` (hotfix, unchanged by Phase 67; no token-gate source in any 67 commit). sidecar-origin-gate PASS ("orcad's origin is refused and every Orca route is behind the gate"), self-test 14 plants red. Live (67-06, merged tree): sidecar-origin-gate-live PASS with pane bundle 467 requests same-origin 200 and orcad-origin legs 403/400. Header re-record `.mozbuild/p67-06/headers/headers.jsonl` holds cookie booleans only |
| 4 | SC4 / RUN-09: a temp-directory data root or the plaintext override is refused with a PB message; PB copy states the protection is a same-user key file, not an OS keyring | VERIFIED | `OrcaService._preflight` (OrcaService.sys.mjs:123-151) runs before any reap or spawn, also in `restart()`. It compares both roots, lexically and through realPath, against TmpD, TMPDIR/TMP/TEMP, /tmp and /var/tmp, a superset of Orca's own `isTemporaryKeyDir` (`orca/src/main/orcad/orcad-secret-key-record.ts:101`). The plaintext override name and value equal the pin. Classes `temporary-profile` and `plaintext-setting` render with `ORCA_PROTECTION_SENTENCE`, which is byte-identical in `privacy.html:90`. orca-credential-store PASS, self-test 10 plants. Live (67-06): orca-credential-store-live PASS ("refused with their class and row and no orcad process") |
| 5 | SC5 / INJ-01: the landing logo comes through a JSWindowActor gated on the orcad origin, catalogued in INTERNAL-APIS.md; the selector list for the pinned version is checked against the built client | VERIFIED (coincidental-reliance) | `registerOrcaLogoActor` (PowerBrowserAPI.sys.mjs:11861), parent gate `logoAnswerFor` (port equal to orcad's, not embedded by the shell's Theia browser, version has selectors). The child is top frame only and writes only `src` and `alt`. Catalogue rows INTERNAL-APIS.md:454-458. orca-landing-selectors PASS against `Landing-znBnkpKr.js`, self-test 6 plants. Live `.mozbuild/p67-07/run3` PASS: proxy control, web tab, stock window, Theia document 0, remount. Reliance: the gate holds only while orcad is the listener on its port (see coincidental_reliance_items) |
| 6 | D-36: after an orcad restart the hosted client keeps its environment id and the hosted tabs; nothing is written to Theia-origin storage | VERIFIED | `pb-session-pairing.ts` passes `readStoredWebRuntimeEnvironment() ?? lastPaired`, calls `closeActiveRuntimeClients()`, saves `sessionOnly: true` (Orca's `saveStoredWebRuntimeEnvironment` removes the localStorage key for sessionOnly, `web-runtime-environment.ts:84-89`) and keeps `lastPaired` with `deviceToken: ''` in module memory only. Observer `rehold()` is fired by `onWillRepair` (orca-hosting-status.ts:199). Behavioral evidence: the restart clause (`strandVerdict`: same id, no stranded line, not blocked, CLI terminal becomes a tab) PASS in run5, run6, run8, run9 |
| 7 | orcaStatus / orcaRestart / orcaShowDiagnostics sit behind the sender wall; the reply carries state and class only | VERIFIED | `handleShellMessage` checks `groupSenderIsTheia` (PowerBrowserAPI.sys.mjs:2324) before the switch that dispatches the three kinds (:2332). The wall requires the primary embedder, the shell's own content browser, the sidecar port and a Theia spec. `orcaStatus` spreads only `OrcaEnv.orcaStatusReply` (keys `state`, `failureClass`), held by orca-service clause 12 (41-plant self-test PASS). `clientReason` validated against the closed set. shell-request-kinds PASS (10 kinds) |
| 8 | The offer reader refuses a symlink, a non-regular file, a foreign owner, group/other bits, a swapped inode and a non-loopback endpoint, naming a code only | VERIFIED | `orca-panes-backend-module.ts:154-205`: lstat of the folder and the file, `offerFileVerdict`, `readNoFollow` (O_NOFOLLOW, fstat ino/dev equal to the lstat), `decodeOffer`, `offerEndpointVerdict` (ws://127.0.0.1:<port>, port equal to the web-client URL's). Refusal logs and returns the code only. orca-offer-file PASS, self-test 6 plants. Live offer-refusal induction (chmod 0644 -> row `offer-mode`) PASS in run5/6/8/9 |
| 9 | Seams 010/070/080 only; no Theia core edit; Gecko only through the patch stack | VERIFIED | `orca-overlay/seams.json` lists exactly 010, 070, 080; `git -C orca status` shows only those three tracked files modified. Phase 67's only overlay change is `pb-session-pairing.ts` (D-36, an overlay file, not a seam). orca-overlay PASS (3 seams, 9 overlay files), self-test 29 plants. diff-theia-core PASS ("zero changes inside @theia/*"), run here. `git diff 85c7895d HEAD -- upstream patches` is empty. internals-boundary, internals-catalogue, ng-040 PASS |
| 10 | The offer and the sidecar token reach no log, storage, page or non-loopback peer through Phase 67 code | VERIFIED | Offer: the containment live row covers logs (PB stdout/stderr, OrcaService log, data root), profile bytes, address, copyable text, bridge folder strays and LISTEN sockets of orcad and the Theia backend (loopback only). Code: `redact()` on every OrcaService log line and row; the frontend logs kind plus reply reason only; the backend logs a refusal code; `getState()` has no pairing field. Sidecar token: no Phase 67 file reads or forwards it (grep of orca-panes, orca-browser, OrcaService); the header probe records booleans; no token-gate source changed |

**Score:** 10/10 truths verified (0 present, behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `powerbrowser/shell/OrcaEnv.sys.mjs` | classes, step/code maps, tempRootOf, logo gate | VERIFIED | gsd verify.artifacts 67-01, 67-05 all passed |
| `powerbrowser/shell/OrcaService.sys.mjs` | failureClass, restart(), preflight, rows | VERIFIED | wired from handleOrcaShellMessage and the logo parent |
| `powerbrowser/shell/PowerBrowserAPI.sys.mjs` | handleOrcaShellMessage, PowerBrowserOrcaHosting, logo parent | VERIFIED | catalogued |
| `powerbrowser/shell/GroupActorChild.sys.mjs` | PowerBrowserOrcaLogoChild | VERIFIED | |
| `theia/extensions/orca-panes/src/browser/failure/*` | copy table, status client, page | VERIFIED | bound in orca-panes-frontend-module.ts:167-168 |
| `theia/extensions/orca-panes/src/node/offer-file-policy.ts` | pure verdicts | VERIFIED | imported by the backend module |
| `orca-overlay/files/src/renderer/src/pb/pb-session-pairing.ts` | D-36 re-pair | VERIFIED | |
| 12 check scripts (failure-classes, credential-store(-live), offer-file, failure-page-live, pairing-containment, mozlz4, offer-scan, landing-selectors, landing-logo-live, sidecar-origin-gate(-live)) | checks with self-tests | VERIFIED | all registered in verify-platform.sh; quick rows run here |

gsd `verify.artifacts`: 27/27 passed across 67-01..67-07. `verify.key-links`: 16/16 file links verified. The 67-06 links are git refs, checked through `verify.commits` (13/13 commits ancestors of HEAD). The 67-07 link names a method, and the code was read.

### Key Link Verification

| From | To | Via | Status |
|------|----|-----|--------|
| orca-hosting-status.ts | PowerBrowserAPI.sys.mjs | PowerBrowserGroupRequest kinds | WIRED (SHELL_MESSAGE_KINDS:304, dispatch :2332) |
| PowerBrowserAPI.sys.mjs | OrcaService.sys.mjs | lazy importESModule after the wall | WIRED |
| orca-pane-widget.tsx / orca-side-view-widget.tsx | orca-failure-page.tsx | render in place of the hidden pane root | WIRED |
| orca-panes-backend-module.ts | offer-file-policy.ts | offerFileVerdict before any read | WIRED |
| orca-hosting-status.ts runReconnect | orca-pane-observer.ts rehold | onWillRepair event | WIRED (observer.ts:94) |
| jar.mn | brand/mark.svg | chrome://powerbrowser/content/mark.svg | WIRED (live: brand/mark.svg bytes in the page) |

### Data-Flow Trace (Level 4)

| Artifact | Data | Source | Real data | Status |
|----------|------|--------|-----------|--------|
| OrcaFailurePage | failureClass | orcaStatus reply from `OrcaService._failureClass()` over the failure rows, plus client reason and browser host state | yes (live inductions) | FLOWING |
| Diagnostics rows | Orca failure code / pairing failure | `_failureRows`, `_clientReason`, `_offerUnavailableReason` | yes (live rows read `offer-mode`, the port-in-use code) | FLOWING |
| Logo answer | src/alt/selectors | `fetch(chrome://.../mark.svg)` and `ORCA_LANDING_SELECTORS` | yes | FLOWING |

### Behavioral Spot-Checks (run in this verification)

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Failure classes derived from source | `verify-platform.sh --only orca-failure-classes` (+ -self-test) | PASS; 11 plants red | PASS |
| Credential store vs pin | `--only orca-credential-store` (+ -self-test, live-self-test) | PASS; 10 plants; 11 verdict cases | PASS |
| Offer reader | `--only orca-offer-file` (+ -self-test) | PASS; 6 plants | PASS |
| Containment scanner | `--only orca-pairing-containment-self-test`, `orca-offer-scan-self-test` | 17 plants + 9 blind collectors red; 19 plants | PASS |
| Failure page verdicts | `--only orca-failure-page-live-self-test` | 20 cases | PASS |
| Landing selectors | `--only orca-landing-selectors` (+ -self-test), `orca-landing-logo-live-self-test` | PASS; 6 plants; 14 cases | PASS |
| Origin gate | `--only sidecar-origin-gate` (+ -self-test) | PASS; 14 plants | PASS |
| Copy rule | `--only shell-error-copy-no-internals` (+ -self-test) | PASS; 4 Orca plants | PASS |
| Boundary | internals-boundary (+ self-test), internals-catalogue, ng-040, shell-request-kinds, group-channel, orca-service (+ 41-plant self-test) | PASS | PASS |
| Seams / Theia core | orca-overlay (+ self-test), diff-theia-core | PASS | PASS |
| Brand scan on the Phase 67 head | `scan-brand-residue.mjs` in a temporary worktree at 4395d2e9 | PASS (830 files) | PASS |

Live rows were not run (the Phase 68 coordinator runs builds and live checks on this machine). The live evidence is the logs in `.mozbuild/p67-06` and `.mozbuild/p67-07` (run1-run9), read for this report.

### Probe Execution

Step 7c: no `scripts/*/tests/probe-*.sh` is declared. `probes/record-sidecar-headers.mjs` is a live research probe. Its 67-06 output in `.mozbuild/p67-06/headers` was read, and it was not re-run (live).

### Requirements Coverage

| Requirement | Source Plan | Status | Evidence |
|-------------|-------------|--------|----------|
| RUN-06 | 67-01, 67-03, 67-06, 67-07 | SATISFIED | Truths 1, 6, 7 |
| RUN-07 | 67-03, 67-04, 67-06 | SATISFIED | Truths 2, 8, 10 |
| RUN-08 | 67-02, 67-06 | SATISFIED | Truth 3 |
| RUN-09 | 67-01, 67-06 | SATISFIED | Truth 4 |
| INJ-01 | 67-05, 67-06, 67-07 | SATISFIED | Truth 5 |

No orphaned requirement: REQUIREMENTS.md maps exactly these five ids to Phase 67.

### Prohibitions (non-authoritative judgment, flagged for owner review)

These are recorded as `verification: unverified` in the plans. Each verdict below comes from reading the code, not from an enforcement test.

- No offer, token, ready line or credential in logs, rows, getState, shell replies or check output: holds in the code read (`redact`, code-only refusals, two-key reply, `installOutputRedaction`). The containment live row enforces it for the offer.
- No second origin policy, and no token-gate edit: holds (no token-gate path in any Phase 67 commit).
- No user-facing string outside orca-failure-copy.ts: holds for orca-panes. Chrome adds rows, log lines, the privacy paragraph and the alt text "PowerBrowser logo" only.
- No answer to the Theia document or to a port other than orcad's: holds. The caveat is the failed-state case in coincidental_reliance_items.
- No import and no privileged global in the logo child, and no DOM write beyond src and alt: holds (GroupActorChild.sys.mjs:1147-1183).
- No edit to orca/ or to a seam: holds. 67-07's one overlay-file edit was authorised by D-36.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (all 26 phase implementation and check files) | - | TBD / FIXME / XXX / TODO / HACK | none found | - |
| scripts/verify-orca-failure-page-live.mjs | 437-439 | No navigation barrier between `location.reload()` and the readiness probe | Warning | Most likely cause of WINDOWS 47 (below) |
| powerbrowser/shell/PowerBrowserAPI.sys.mjs | 2324-2332 | No check plants an Orca kind ahead of the `groupSenderIsTheia` wall. ng-038 exercises the wall for group mutations, shell-request-kinds checks the kind set, and neither goes red if `handleOrcaShellMessage` gains a caller outside the walled switch | Info | The code is correct today. A regression would not go red |
| powerbrowser/shell/OrcaEnv.sys.mjs | 610-619 | Logo gate does not consider Orca's state | Info | See coincidental_reliance_items. The answer carries no secret (a public mark, alt text and a selector), so the impact is cosmetic |

### WINDOWS 47 (orca-failure-page-live red in 1 of 6 runs): judgement

Most likely a harness race, not a product defect. The evidence:

- The failure is "timed out after 60000 ms waiting for hosted views after the reload (last error: timed out after 180000 ms waiting for the page probe to finish)" (`.mozbuild/p67-07/run4`). The inner error has no nested "last error". `app.evaluate` therefore kept returning `null` for 180 s, so the document was responsive and the probe's result slot (`window.__pbProbeN`) was not present. That happens when the window the probe started in was replaced after the probe started.
- `READ_VIEWS` is synchronous, and `probeExpression` turns any throw (for example a missing `window.theia`) into a stored error result. A probe that started in the reloaded document cannot leave its slot empty.
- The harness evaluates `location.reload()` (line 437) and then polls `FrontendApplicationStateService.state === 'ready'` (line 438) with no check that a new document exists. The outgoing document can still answer "ready". The next probe (`views()`, line 439) then starts in the outgoing document and is lost when the reload commits. That matches 1 failure in 6 runs.
- One product path can reload the Theia document: Orca's web preload maps `window.api.app.relaunch/reload` to `window.location.reload()` (`orca/src/renderer/src/web/preload-api/web-app-api.ts:29-31`), and Orca's startup hydration calls it on its own after a host-unreachable startup (`startup-web-host-unreachable.ts:62-67`). With the offer file at 0644 the hand-off is refused and the pane bundle does not boot, so that path should not run at this step. It is the one alternative that is not excluded by evidence.

Recommended harness fix, a Phase 68 or WINDOWS 47 item: record `performance.timeOrigin` (or set a window marker) before the reload, and wait for a different value before the ready probe. If the red persists after that barrier, investigate the Orca relaunch path above. The product path (reload with a refused offer, then the pairing-lost page, the `offer-mode` row and Reconnect) passed in 5 of 6 runs.

### Information outside this phase

- `node scripts/scan-brand-residue.mjs` is red on the current HEAD (28124115): Orca 2841 -> 2846, orca 5330 -> 5336, ORCA 1220 -> 1221, renderOrcaSection 5 -> 6, runOrca( 4 -> 5. The extra occurrences come from the Phase 68-08 merge (6d3c32c4: `scripts/generate-licensing.mjs`, `68-08-SUMMARY.md` and others). The same scan on the Phase 67 head 4395d2e9 passes over 830 files. This is for the Phase 68 coordinator to re-measure, not a Phase 67 gap.
- A Theia document reload still pairs under a new environment id (D-36 states this, and P65-17 is unchanged). Orca's own "Try again", "Restart now" and "Retry now" toasts reload the whole Theia document in hosted mode. Phase 67 does not cover this. It is noted because a new id strands Orca's host sessions.

### Human Verification (deferred to the end-of-milestone owner pass, 59-CONTEXT D-18)

### 1. Failure page appearance
**Test:** Induce each class with an Orca chat and an Orca terminal open, in the light and the dark theme.
**Expected:** The page is legible, the buttons sit under the sentence, and keyboard focus reaches every button.
**Why human:** Visual layout and contrast.

### 2. PB mark on the dark landing tile
**Test:** Open orcad's address in a web tab with the dark theme.
**Expected:** The mark is visible.
**Why human:** Visual contrast.

### 3. Copy
**Test:** Read the eight sentences, the protection sentence and the two RUN-09 sentences.
**Expected:** The owner accepts the wording.
**Why human:** Owner wording decision.

### 4. Owner picks
**Test:** P67-17, P67-18, P67-19, P67-21, CA-07, HOME for live rows, D-36, browser-host page class.
**Expected:** Each is accepted or overridden.
**Why human:** Owner decisions.

### 5. Prohibitions
**Test:** Review the non-authoritative prohibition verdicts above.
**Expected:** Accepted.
**Why human:** Judgment-tier, with no enforcement test.

### Gaps Summary

There is no gap. All five roadmap criteria and the five plan-level truths hold in the code and the checks. Each criterion has live PASS evidence on the merged tree: 67-06 for criteria 3 and 4, and 67-07 for criteria 1, 2 and 5, plus the D-36 restart clause. Every check this phase relies on has a self-test whose plants went red here. The status is `human_needed` only because of the visual, copy and owner items and the judgment-tier prohibitions. All of these are deferred to the end-of-milestone pass. Three things should be hardened, none blocking: gate the logo answer on Orca being ready, add a navigation barrier in the offer-refusal reload (WINDOWS 47), and add a plant that dispatches an Orca kind ahead of the sender wall.

---

_Verified: 2026-11-11T21:30:00Z_
_Verifier: Claude (gsd-verifier)_
