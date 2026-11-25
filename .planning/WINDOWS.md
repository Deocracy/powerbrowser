---
schema_version: 1
open_count: 31
waived_count: 2
fixed_count: 49
total_count: 82
last_updated: 2026-11-24T12:21:49.992Z
---

# Broken Windows Ledger

> Cross-phase defect register. With `workflow.windows_enforce` enabled, `/gsd-ship` blocks while `open_count > 0`.
> Waive with `gsd-tools windows waive <id> "<reason>"` (reason required).
> Mark fixed with `gsd-tools windows fixed <id>`.

| id | phase | kind | file | line | description | status | reason | recorded_at | resolved_at |
|----|-------|------|------|------|-------------|--------|--------|-------------|-------------|
| 1 | 01 | deviation | sourcerer/endpoint-allowlist.json | 82 | GitHub org URL becomes https://github.com/DeBIOS/PowerBrowser under the mechanical vendor rename; the DeBIOS Foundation's actual GitHub org is not established (D-12 fixes only the domain). Must be confirmed before release. | fixed |  | 2026-08-30T17:53:27.054Z | 2026-08-30T22:00:12.411Z |
| 2 | 01 | deviation | theia/extensions/branding/src/browser/sourcerer-welcome-widget.tsx | 13 | SOURCERER_REPO_URL points at github.com/Deocracy/Sourcerer; same unestablished-org problem as endpoint-allowlist.json:82. | fixed |  | 2026-08-30T17:53:27.157Z | 2026-08-30T22:00:12.510Z |
| 3 | 01 | unrun-verify | scripts/apply-patches.sh |  | apply-patches.sh --self-test cannot run: needs upstream/browser/moz.configure and upstream/ has never been materialized (pre-existing, rename-independent) | fixed |  | 2026-08-30T20:24:37.919Z | 2026-08-30T22:00:12.608Z |
| 4 | 01 | unrun-verify | scripts/verify-customize-inert.mjs |  | verify-customize-inert.mjs unrun: needs a built binary at objdir/dist/bin/powerbrowser (Tier 3 Gecko build) | fixed |  | 2026-08-30T20:24:38.018Z | 2026-08-30T22:00:12.714Z |
| 5 | 01 | unrun-verify | scripts/verify-dev-flag-off.mjs |  | verify-dev-flag-off.mjs unrun: needs a built binary at objdir/dist/bin/powerbrowser (Tier 3 Gecko build) | fixed |  | 2026-08-30T20:24:38.116Z | 2026-08-30T22:00:12.816Z |
| 6 | 01 | deviation | inventory/brand-tokens.json |  | scan-brand-residue.mjs --reconcile no longer closes post-rename; its expected_count census describes the pre-rename tree. Gate is the plain run. Terminal census owned by plan 01-03. | fixed | Both halves of this entry are now false, which is why it closes. (1) --reconcile DOES close post-rename: plan 01-08 reconciled the four drifted rows against the current tree by name -- the absolute-repo-root row to 0 (both .desktop entries hand-rewritten in 01-03), MOZ_APP_UA_NAME and MOZ_APP_ID to 1 each (the second site was a patch-020 context line dropped when 020 was regenerated in 01-05), and the -PLAN.md provenance row to 28 (+2 from the 01-03 driver consolidation, +5 from 01-05's INTERNAL-APIS.md catalogue rows), each with its justification written into its own reason field. (2) The plain run is NO LONGER a separate, weaker gate: reconciliation failures now fail the un-flagged invocation too, through a single gateFailures() exit source, so the two modes agree on the same tree. | 2026-08-30T20:24:38.216Z | 2026-08-31T04:25:03.312Z |
| 7 | 01 | unrun-verify | scripts/verify-platform.sh |  | 31 of verify-platform.sh's 48 checks could not run: they need a built tree, a launched browser, or a display. objdir/ does not exist yet (plan 01-04). | fixed |  | 2026-08-30T20:49:13.526Z | 2026-08-30T22:00:29.468Z |
| 8 | 01 | unrun-verify | scripts/verify-platform.sh |  | apply-patches-self-test cannot run: it derives its fixture from upstream/browser/moz.configure and upstream/ is a git-ignored 1.1 GB clone absent on a fresh checkout. Pre-existing, rename-independent. | fixed |  | 2026-08-30T20:49:13.628Z | 2026-08-30T22:00:12.915Z |
| 9 | 01 | deviation | .planning/REQUIREMENTS.md |  | MIG-04 was auto-checked from plan 01-03's frontmatter but nothing has been built; reverted to unchecked. Plan 01-04 owns the build that closes it. | fixed |  | 2026-08-30T20:49:13.723Z | 2026-08-30T22:00:13.014Z |
| 10 | 01 | unrun-verify | scripts/verify-platform.sh |  | verify-branding-identity-release and branding-variant-divergence still unrun: both read objdir-release/dist/bin, i.e. a second full ~47m release build that 01-04-PLAN.md explicitly declined to spend. Runnable the moment a release objdir exists. | fixed | Closed by plan 08-05 Task 3: objdir-release built 2026-09-05 (mach wall 54:40), both rows PASS. | 2026-08-30T22:00:29.574Z | 2026-09-05T04:45:00.000Z |
| 11 | 01 | unrun-verify | scripts/verify-platform.sh |  | The ~20 launch-lifecycle checks (side03-*, side04-*, side05-*, shell03-*, shell04-diagnostics-with-backend-down, cr01-*, harness-display-available) became RUNNABLE with 01-04's build but were not run: none is named by 01-04-PLAN.md's verify blocks and each launches a real browser. Not blocked -- unexercised. | open | Re-dated to next version (Phase 59 D-09); On 2026-09-28 Chris deferred all remaining checks ("Defer all the checks"). | 2026-08-30T22:00:29.678Z |  |
| 12 | 01 | stub | powerbrowser/shell/powerbrowser.js |  | Env-gated POWERBROWSER_SPIKE_GUI01 instrumentation left in the shell bootstrap by plan 01-05 Task 1; it is spike scaffolding and Task 3 of the same plan removes it | fixed |  | 2026-08-30T23:38:09.088Z | 2026-08-31T00:39:32.952Z |
| 13 | 01 | deviation | scripts/check-internals-boundary.sh |  | ChromeUtils.registerWindowActor is absent from FORBIDDEN_PATTERNS. Latent, not exploited: candidate B (the JSWindowActor pair) was NOT adopted in 01-05, so nothing in-tree uses it. Any future actor pair must add it in the same commit or the boundary guard has a hole. | fixed | Closed by plan 08-03 Task 1. ChromeUtils.registerWindowActor added to FORBIDDEN_PATTERNS as an unconditional entry with no chrome-scheme exemption. Gate evidence: check-internals-boundary.sh --self-test PASS (Services. plant, actor plant naming file and pattern, catalogue mutation), --catalogue PASS, verify-platform.sh --only internals-boundary PASS. Zero WindowActor occurrences in PowerBrowserAPI.sys.mjs and INTERNAL-APIS.md, so no catalogue row owed; single-touchpoint invariant holds. | 2026-08-31T00:39:33.061Z | 2026-09-05T00:24:03.000Z |
| 14 | 01 | deviation | scripts/lib/firefox-bidi.mjs |  | Every withFirefoxPage caller that passes a URL launches TWO windows (the shell plus a stock browser window for the URL argument), and contexts[0] resolves to the shell's own supervised Theia frontend rather than the URL passed. Pre-existing, unrelated to 01-05's change: the four _run_app_check_mjs checks boot a dev app at localhost:3000 they then do not read. | fixed | Closed by plan 08-03 Task 2. withFirefoxPage selects the context carrying the requested URL via topLevelContexts (bounded poll, loud throw naming URL and contexts seen on mismatch, never silent fallback); empty URL takes the single shell context with a logged note. All five _run_app_check_mjs callers plus the SHELL01 inline runner launch with an empty URL since they read the shell, never a URL page. Gate evidence: firefox-bidi --self-test PASS (two-context session targets URL context for evaluate+screenshot, single-context control resolves), verify-platform rows gui01-browser-close-does-not-quit, gui01-command-registered, shell01-theia-is-the-window PASS, --quick PASS. Zero new dependencies; launch semantics and process hygiene untouched. | 2026-08-31T00:39:33.163Z | 2026-09-05T00:33:15.000Z |
| 15 | 01 | unrun-verify | .planning/phases/01-platform-extraction-and-rename/01-VALIDATION.md |  | GUI-01 manual browser-window verification not performed: 01-07 executed autonomously with no human present. Five steps outstanding (launch app; open a browser window; address bar takes keyboard focus and navigates a typed URL; an in-window modal appears; closing the window returns the shell with the app still running). Automation cannot substitute -- BiDi cannot see chrome contexts on Linux (ledger 7). | fixed | Closed by live user verification 2026-09-01, recorded as 01-UAT.md test 2 (Open the Stock Browser Window, GUI-01), result: pass. All five outstanding steps were driven by a human in a real launched window -- the command opened a stock-chrome browser window, the address bar took keyboard focus and navigated a typed URL, an in-window modal appeared rather than being suppressed, and closing the window returned the shell with the app still running. This is the human record the automation cannot substitute for: chrome-context Marionette is platform-blocked on Linux (ledger item 7), so no registered check can ever cover it. | 2026-08-31T02:09:45.801Z | 2026-09-01T00:00:00.000Z |
| 16 | 01 | unrun-verify | .planning/phases/01-platform-extraction-and-rename/01-VALIDATION.md |  | GUI-03 manual customize-bridge verification not performed: 01-07 executed autonomously with no human present. Three steps outstanding (with the dev flag on, edit customize.css and see the shell restyle without a rebuild; delete it; see the shell revert). Its automatable halves -- inertness and flag-gating -- are green (verify-customize-inert, verify-dev-flag-off); only the perceptual half is open. | fixed | Closed by live user verification 2026-09-01, recorded as 01-UAT.md test 6 (Customize Bridge Live Restyle, GUI-03), result: pass. Driven live with the dev flag on: a red outline plus top-panel rule appeared within ~1s of writing customize.css and the shell reverted to stock styling on delete -- both halves confirmed by the user. The automatable halves (verify-customize-inert, verify-dev-flag-off) were already green; this closes the perceptual half, which stays on the human record for the same platform reason as ledger item 15. | 2026-08-31T02:09:45.906Z | 2026-09-01T00:00:00.000Z |
| 17 | 01 | deviation | scripts/verify-branding-preflight.mjs |  | The preflight's display-surface list is HAND-KEPT, and that omission is exactly what let the welcome widget render the identifier form through the whole rename (fixed in 01-07 by adding the file). The list should derive the set of display surfaces from the tree rather than enumerate it; until then, any new file that renders the product name must be added here by hand or the leak class returns. | fixed | Closed by plan 01-08 Task 2, which fixed the class rather than the site: section 6 of verify-branding-preflight.mjs now DERIVES its display-surface set by reading theia/extensions/branding/src/browser/ at check time, so it goes red when a leaking surface is added and red when that directory disappears. A zero-file walk is its own distinct failure, not a clean run. Proven both ways -- a scratch .tsx dropped into that directory was rejected by name with the script unedited, and the self-test now copies the whole directory and plants the identifier form in the About dialog copy. The walk reads the filesystem, not the git index, so unlike scan-brand-residue.mjs it also sees an unstaged new file. Residual exposure, recorded as a backstop truth rather than as a closed gap: a display surface authored OUTSIDE that directory and outside the inventory-declared variant files is still not reached by this scan and rests on code review. | 2026-08-31T02:09:52.011Z | 2026-08-31T04:37:15.633Z |
| 18 | 01 | deviation | powerbrowser/shell/TheiaService.sys.mjs |  | The supervisor's start path shipped two defects with one user-visible outcome. (a) State-keying conflation: "a port has been pinned" and "a spawn has actually completed" were one condition, so a first spawn that announced readiness and then failed the health gate made every later successful respawn skip the one-time initialisation -- the user sat on the branded loading layer with a healthy backend behind it. (b) No terminal handler: powerbrowser.js called TheiaService.start(browserElement) with no await and no catch, and three reachable throw sites inside that path (settings-folder creation, leftover reap, session-cookie minting) were unguarded, so any of them became an unhandled promise rejection in chrome with the identical dead screen -- no message, no Retry, no Details. Found by 01-VERIFICATION.md rather than by any check: every launch check in the registry drove a failure that already had a classified result, and none drove a rejection that ESCAPED. | fixed | Closed by plans 01-09 (a) and 01-10 (b). (a) The one-time initialisation block and _restart()'s per-attempt port choice are now keyed on this._swapped -- the same field _swap()'s own guard reads -- and _swap() sets it AFTER the navigation returns. (b) One public terminal handler, TheiaService.reportUnexpectedFailure, attached at all four fire-and-forget entry points (the bootstrap's start call, the Retry control's retry call, and the _healthLoop and _recoveryProbeLoop roots); it paints a direct USER_MESSAGE.couldNotStart reference with the failed step and the rejection text as diagnostics rows, minting no new copy. The settings-folder and session-cookie sites now return the same classified-result shape every other _spawnAndGate failure returns, with the cookie catch returning BEFORE the navigation so a launch whose credential was never minted never reaches the backend origin; the reap site is guarded, logged on its existing dual channel and deliberately non-fatal, because failing a launch over a previous launch's stale pid would turn a cosmetic cleanup miss into the dead screen being fixed. PROVEN BY TWO REGISTERED CHECKS, each observed red before its own fix and green after, same binary, only chrome source differing: health-gate-recovery-swaps (red -- no swap sentinel after a recovered health gate) and start-failure-shows-error (red -- no error sentinel at all within 30s of a real throw). start-path-recovery's static half additionally derives, from the tree on both sides, the set of promise-returning supervisor methods and requires every bootstrap call to one of them to carry a terminal handler; that rule was hand-proven red by stripping the handler from the start call and naming that exact site, and its self-test carries 11 planted faults plus 2 clean controls. RESIDUAL, NOT CLOSED: no registered check drives a rejection out of either long-lived supervisor loop -- that would need a fault injected into a mid-session code path with no external control surface -- so those two terminal handlers rest on the source-derived coverage rule rather than on a runtime red. Ledger items 15 and 16 are untouched by this work and remain open. | 2026-08-31T12:10:00.000Z | 2026-08-31T12:10:00.000Z |
| 19 | 01 | unrun-verify | scripts/verify-platform.sh |  | 01-11 changed the error layer's visible behaviour; shell03-budget-exhausted-error and shell03-auto-dismiss-on-selfheal not re-run against a repackaged binary (tier-3, phase-gate scope). Neither clicks Retry, so neither is expected to move. | open | Re-dated to next version (Phase 59 D-09); On 2026-09-28 Chris deferred all remaining checks ("Defer all the checks"). | 2026-08-31T20:39:31.590Z |  |
| 20 | 01 | deviation | powerbrowser/shell/TheiaService.sys.mjs |  | The supervisor's error-state contract shipped three defects in one class, found together by a code review run against the post-01-09/01-10 tree and independently re-derived from source by 01-VERIFICATION.md -- not by any registered check. (2c) A failing Retry permanently disabled the error layer: the chrome Retry global blanked the error element directly while the supervisor's _errorShown repaint guard stayed set, so the FIRST Retry that did not succeed left a blank screen with no message, no Retry and no Details for the rest of the session. (2d) _showError started D-115's background recovery probe unconditionally, ignoring the recoverable classification it had just been handed, so the one class the supervisor's own D-113 comment calls unrecoverable by construction with no retry at all drove a process spawn every probe interval, for the life of the session, against a _configDir and a _stateFilePath that branch returns before ever assigning. (2e) PowerBrowserAPI.onQuitGranted was registered AFTER the settings-folder ensureDirectory try/catch -- a returnable branch whose failure is classified recoverable and which therefore still probes -- so a probe-driven spawn could reach a live, healthy, swapped backend on a launch that had registered no quit observer and derived no state-file path: stop() never runs on quit, a Node process with the extension host's file access and terminal surface outlives the browser still holding the token it was handed at spawn, and a crash on that launch leaves the next launch's _reapLeftover() nothing to find. NO REGISTERED CHECK COULD GO RED ON ANY OF THE THREE, and all three shipped green through three full verification runs. shell03-budget-exhausted-error asserts there is exactly ONE error sentinel, which is correct for the launch it drives and blind to a second one; shell03-unrecoverable-immediate-error asserts no spawn attempt within a 15-second window and was green precisely because the probe's first interval had not elapsed yet. | fixed | Closed by plans 01-11 (2c) and 01-12 (2d, 2e). Two analyzers do the work, both riding already-registered rows and both deriving rather than hand-keeping. scripts/verify-shell-error-contract.mjs evaluates the SHIPPED supervisor and the SHIPPED chrome bootstrap in-process -- the supervisor imported with ChromeUtils faked, the bootstrap run through node:vm against a sandbox that is also its own window -- and drives them by firing the bootstrap's own DOMContentLoaded handler, so the entry point stays under test rather than under simulation. scripts/verify-start-path-recovery.mjs derives its rules from the tree at check time and compares. FOUR INDEPENDENT REDS WERE OBSERVED, one per clause, each before its own fix and green after. (2c), plan 01-11, scenario two-consecutive-failing-retries-repaint: "verify-shell-error-contract: FAIL -- scenario two-consecutive-failing-retries-repaint: no POWERBROWSER_SHELL_ERROR_CLEARED was emitted after the first failing Retry; no second POWERBROWSER_SHELL_ERROR was emitted -- the error layer never came back. ... (Stale recovery probe still active after the first Retry: true.)" Fixed by retry() calling _hideError() before _restart(), with the bootstrap's Retry global no longer writing style.display behind the supervisor's back. (2d), plan 01-12, scenario unrecoverable-classification-starts-no-probe: "verify-shell-error-contract: FAIL -- scenario unrecoverable-classification-starts-no-probe: the recovery probe ran for a failure the supervisor classified unrecoverable -- the boundary's spawn was called 50 time(s) after an error state whose recoverable flag was false." On that SAME unfixed run the positive control recoverable-classification-starts-the-probe was GREEN; the asymmetry is the evidence that the instrument discriminates rather than failing everything. Fixed by gating _showError's _startRecoveryProbe() call on the recoverable parameter the method already receives. The verification's suggested alternative -- a dedicated "sidecar resolved" boolean -- was considered and REJECTED: the classification is already carried into _showError by every caller, so a second flag would be a second source of truth for one fact, which is the shape of the defect rather than its fix. (2e), plan 01-12, derivation E in verify-start-path-recovery.mjs, in two independently failing clauses. Clause 2, the ordering: "verify-start-path-recovery: FAIL -- `start()` can return at byte 1017 of its own body -- BEFORE it has both registered the quit observer (`PowerBrowserAPI.onQuitGranted`) and derived `this._stateFilePath`." Clause 3, the retention, observed separately with the reorder already applied and the boundary's return value still discarded: "verify-start-path-recovery: FAIL -- `start()` discards the unregister function `PowerBrowserAPI.onQuitGranted` returns -- the observer's lifetime is then the application's rather than this supervisor's, and nothing can ever detach it." Fixed by deriving _stateFilePath and registering the observer immediately after _configDir and ahead of the settings-folder try/catch, retaining the unregister function as _quitObserverOff, and detaching it in stop() only after the process has been signalled, awaited and cleared. The probe gate is TWO-DIRECTIONAL by construction: the registered positive control requires a recoverable classification to still drive at least one probe spawn, so a fix that simply stopped probing everywhere fails it, and the analyzer's --self-test plants exactly that fault ("the recovery probe never started at all") and requires it red. Derivation E's window is derived from the tree -- the first return after the _resolveSidecar call, through to the later of the two anchors, with both anchors located structurally and no identifier written down for the tree to agree with -- so it goes red on ANY future early return inserted ahead of the registration, not only the settings-folder one this gap named. shell-error-contract-self-test now stands at 5 planted faults plus 1 clean control; start-path-recovery-self-test at 16 plus 2. scripts/verify-platform.sh --quick is green at 24 rows and neither plan added a registry row. RESIDUAL, NOT CLOSED: the behavioural half runs the shipped sources under NODE against a faked PowerBrowserAPI, not under Gecko. It proves the classification-to-probe wiring, the spawn counts and the sentinel ordering; it does NOT prove that Gecko's quit-application-granted topic actually fires the retained observer in a real quit, and it does not prove the pixels of a repainted error layer. Both rest on the human record rather than on these checks, because chrome-context Marionette is platform-blocked on Linux (ledger item 7). No registered check drives a spawn whose settings folder could not be created, so the reorder's one accepted consequence -- a _stateFilePath pointing into a directory that may not exist -- rests on reading writeStateFile's existing non-fatal try/catch and readStateFile's null-for-absent contract rather than on a red. The two tier-3 regression confirmations recorded as ledger item 19 remain unrun, and shell03-auto-dismiss-on-selfheal is the one that could genuinely move, because its subject is the recoverable side of this gate. Ledger items 15 and 16 are untouched by this work and remain OPEN. | 2026-08-31T20:51:20.010Z | 2026-08-31T20:51:24.322Z |
| 21 | 01 | deviation | powerbrowser/shell/TheiaService.sys.mjs |  | 01-13, closing the LAST route of the defect class 01-09/01-10/01-11/01-12 each closed one route of. The recoverable classification gated the background recovery-probe TIMER (ledger 20, closed by 01-12) but not the USER-DRIVEN route: retry() re-entered _restart()/_spawnAndGate() unconditionally, and it called _hideError() first, which nulls _failureDetails. So on the one class the supervisor's own D-113 comment calls unrecoverable by construction with no retry at all, the user faced a live Retry control, a message naming it as the next step, and a click that erased the diagnostic rows and re-entered the failed launch path against _configDir = null, _stateFilePath = null and no registered quit observer. This SCOPES ledger 20's fixed disposition to the timer route rather than contradicting it: 01-12's fix was correct and complete for the route it named, and this is the second route through the same classification. Fix, both halves: (supervisor, the authority) a new per-launch field _errorRecoverable stores the PAINTED error state's classification, written inside _showError's _errorShown false-to-true latch and cleared in _hideError, and retry() returns before _hideError() unless it is true, so a direct powerbrowserRetry() call that never touched the button is refused on the same terms as a click and the diagnostic rows survive; (chrome, presentation only) powerbrowserShowError mirrors the classification onto errorRetryButton.hidden at the show site only. Copy moved with the controls: USER_MESSAGE.couldNotStartUnrecoverable was minted for _spawnAndGate's two recoverable:false returns and nodeMissing was reworded, so no message reachable from an unrecoverable site names Retry. Red observed before the fix, from the new registered scenario unrecoverable-classification-refuses-the-retry-click: 'a Retry driven against an UNRECOVERABLE error state re-entered the spawn path -- the boundary's spawn was called 1 time(s) after the error state was painted', plus 'the Retry control is still on screen ... hidden is undefined rather than true', 'the refused Retry destroyed the failure's diagnostic rows', and a POWERBROWSER_SHELL_ERROR_CLEARED emitted across the refused call. Green after: shell-error-contract PASS naming all four scenarios, shell-error-contract-self-test PASS over nine planted faults plus one clean control, verify-platform.sh --quick 24/24. RESIDUAL: the node harness proves the supervisor/bootstrap contract and the spawn counts, not the pixels. A human clicking Retry in a real launched window -- seeing the control absent on an unrecoverable failure, present on a recoverable one, and the diagnostics rows surviving -- stays on the human record, because chrome-context Marionette is platform-blocked on Linux (ledger item 7). | fixed |  | 2026-08-31T21:49:56.292Z | 2026-08-31T21:50:02.210Z |
| 22 | 55 | unmet-truth | upstream/security/mac/hardenedruntime/production/firefox.browser.xml |  | Upstream production entitlement files (firefox, firefoxdeveloperedition, nightly .browser.xml) carry Mozilla's Team ID 43AQ936H96 and org.mozilla application identifiers, plus the restricted keys com.apple.application-identifier and com.apple.developer.web-browser.public-key-credential. Release signing would bind them to the PowerBrowser bundle. Cure: a hook-only Team-ID patch regenerated with scripts/regenerate-patches.sh (Phase 55 plan 55-03), which needs the owner's Apple Developer Team ID (see .planning/workstreams/deploy/phases/55-macos-i/BLOCKED.md). scripts/verify-mac-entitlements.mjs excludes exactly those ten hits while this entry is open; any other hit is red. Mark this entry fixed when the patch lands, and remove the exclusion in the same commit. | waived | R14 (2026-11-03): no Apple signing or Team ID in scope; the upstream entitlement hits stay excluded, macOS is deferred to v1.7 (R4) | 2026-10-31T18:40:00.000Z | 2026-11-04T01:20:23.627Z |
| 23 | 55 | stub | scripts/generate.mjs |  | Phase 55 DMG branding placeholders, both variants: Assets.car and dsstore are empty files, background.png is the 128-pixel application raster. Finder and Dock icons degrade until a real asset catalog is built with actool and observed on a Mac (plan 55-04; see .planning/workstreams/deploy/phases/55-macos-i/BLOCKED.md item 6). | waived | R4 (2026-11-03): Phase 55 macOS, including the DMG branding placeholders, is deferred to v1.7; needs Mac hardware | 2026-10-31T19:05:00.000Z | 2026-11-04T01:20:23.733Z |
| 24 | 44 | unrun-verify | scripts/build-update-xml.mjs |  | 44-02 full-tier row build-update-xml not run green: it FAILs by design because .mozbuild/mar-hop/nplus1.mar is absent. Build the N-plus-1 MAR per docs/BUILD.md, then run scripts/verify-platform.sh --only build-update-xml. UPD-14 stays open until it passes. | open | Re-dated to next version (Phase 59 D-09) | 2026-11-01T05:21:09.443Z |  |
| 25 | 39 | deviation | scripts/verify-address-bar-live.mjs | 5000 | address-bar-live-self-test: plant ctrl-d-everywhere stays green on bookmark-keys (3 of 3 sessions with the 39-08 harness and 3 of 3 with the pre-39-08 harness at 5d0dfa95); pre-existing, the plant no longer bites in the README editor; first lead: the bookmark command may be disabled with an editor current, so Theia skips the planted binding; repro: node scripts/verify-address-bar-live.mjs --self-test (plant ctrl-d-everywhere on bookmark-keys), red again in the 39-19 full run as "stayed green ... got: (no failures at all)"; source: 33-UAT test 1 | open | Re-dated to next version (Phase 59 D-09) | 2026-11-06T21:08:45.534Z |  |
| 26 | 39 | skipped-test | scripts/verify-prompts-live.mjs |  | prompts-live dialog and dialog-probe are skipped by derivation while REQUIREMENTS.md records PROMPT-03 deferred to 999.3 (OQ1 ruling 2026-11-05); repro: node scripts/verify-prompts-live.mjs --scenario dialog; cause: stock page dialogs lock the IDE; source: 37-UAT tests 8 and 9 | open | Re-dated to next version (Phase 59 D-09) | 2026-11-06T22:32:05.803Z |  |
| 27 | 39 | deviation | theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx | 976 | long-press Back: with a real pointer, holding Back 600 ms then releasing on the pill leaves keyboard focus in the pill, so a real Escape is the pill's and the history menu stays open (39-15 verify-nav-keys-live long-press under PB_REAL_INPUT=1, 3 of 3 runs); the T4 claim itself (Enter on Back goes back after the hold) passes; repro: PB_REAL_INPUT=1 PB_LIVE_HEADED=1 node scripts/verify-nav-keys-live.mjs --scenario long-press (headed, real input); cause so far: the release on the pill moves keyboard focus there, so Escape goes to the pill, not the history menu; source: 27-UAT test 4 | fixed | Re-dated to next version (Phase 59 D-09) | 2026-11-07T02:53:12.909Z | 2026-11-19T02:23:11.097Z |
| 28 | 39 | deviation | scripts/verify-page-tools-live.mjs |  | page-tools-live crash-navigate flaked once in three registry runs on 2026-11-06 (4ce04c24): 'a URL sent to a crashed tab did not load it (no loaded push with crashed false)'; the scenario passed alone 2 of 2 right after, and in the 116ac682 run; the code was not changed by 39-16; for the 39-18 flake work; repro: node scripts/verify-page-tools-live.mjs --scenario crash-navigate; cause so far: not isolated, the loaded push after a crash-restore navigate arrives late or not at all; page-tools-live passed in the 39-19 full run; source: 32-UAT test 1 | open | Re-dated to next version (Phase 59 D-09) | 2026-11-07T04:37:55.475Z |  |
| 29 | 39 | deviation | patches/050-extension-tab-host.patch |  | 38 T22 step 4: the options page of an extension not allowed in private windows opens in the private stock window opened last (stock openOptionsPage uses windowTracker.topWindow); fix needs a patch 050 hunk and a Gecko rebuild; owner deferred to backlog 999.17 on 2026-11-06 (39-17), matches stock behaviour; repro: 38-UAT test 22 step 4, scenario private-access session 2; source: 38-UAT test 22 | open | Re-dated to next version (Phase 59 D-09) | 2026-11-07T04:50:37.188Z |  |
| 30 | 39 | unrun-verify | powerbrowser/packaging/package-linux.sh |  | 39-19 full run (6ac27ac2): ng063-packaged-launch, portable-elf, sidecar-no-symlinks, package-target-natives, packaged-identity, install-matrix, ng065-mar-signature-enforced, ng072-policies-packaged-webextension, search-engines-packaged and mar-update-hop are red because no container-built release tarball exists in objdir-release/dist and hop.json has no served key; repro: scripts/verify-platform.sh --only portable-elf; cause so far: the PKG-17 container build with the release keys and the N-plus-1 MAR hop are owner steps in .planning/workstreams/deploy/OWNER-PASS.md, not run; source: no UAT test, 39-BASELINE environment rows | open | Re-dated to next version (Phase 59 D-09) | 2026-11-07T10:18:30.468Z |  |
| 31 | 39 | unrun-verify | .github/settings/ |  | 39-19 full run (6ac27ac2): ng074-ci-green-on-main, repo-controls, channel-live, codeberg-mirror-live, upptime-sweep-live, win-matrix-record and win-download-copy are red on live owner state: no verify.yml run for the unpushed main head, 5 repo-controls problems (apps slack and claude undeclared), no published Release, Codeberg and Upptime slugs undeclared, scripts/matrix/win-matrix-record.json absent; repro: scripts/verify-platform.sh --only channel-live; cause so far: each needs an owner push, release or checkpoint input (deploy OWNER-PASS.md, 53-04 and 54-04 checkpoints); source: no UAT test, 39-BASELINE environment rows | open | Re-dated to next version (Phase 59 D-09) | 2026-11-07T10:18:30.720Z |  |
| 32 | 39 | unrun-verify | powerbrowser/packaging/package-macos.sh |  | 39-19 full run (6ac27ac2): macos-package-payload (.mozbuild/macos-package absent) and macos-install-matrix (25 unobserved items) are red; repro: scripts/verify-platform.sh --only macos-package-payload; cause so far: macOS is deferred to v1.7 by R4 (2026-11-03) and needs Mac hardware; ledger 23 is waived, so it cannot key a gate exclusion; source: no UAT test, 39-BASELINE environment rows | open | Re-dated to next version (Phase 59 D-09); D-40 (2026-11-15): deferred to the next version; v1.7 ships Linux only | 2026-11-07T10:18:30.941Z |  |
| 33 | 39 | unrun-verify | scripts/verify-telemetry-live-delivery.mjs |  | tel06-error-delivery-live refuses to run: 'the working tree is dirty (2 tracked change(s), first: M .claude/settings.json)'; repro: scripts/verify-platform.sh --only tel06-error-delivery-live; cause so far: the drill rewrites a tracked file and rebuilds, so it refuses any dirty tree, and the dirt is the owner's local hook removal in .claude/settings.json plus .planning/state.json, which an agent may not commit; runs on a clean checkout; source: no UAT test, 39-BASELINE and 39-19 full run | fixed |  | 2026-11-07T10:18:31.179Z | 2026-11-09T07:46:10.114Z |
| 34 | 39 | unmet-truth | scripts/verify-customize-inert.mjs |  | verify-customize-inert: 'state 1 (absent) vs state 3 (styled) -- pixels identical, the CSS layer had no effect' (39-BASELINE, 39-19 full run and rerun, 3 of 3); repro: scripts/verify-platform.sh --only verify-customize-inert; cause so far: the script writes $XDG_CONFIG_HOME/powerbrowser/customize.css and captures the shell's supervised frontend, which may read customize.css from another config dir (the customize extension resolves user-storage:/user/customize.css); not isolated; source: no UAT test (CUST-01 registry row) | fixed |  | 2026-11-07T10:18:31.417Z | 2026-11-09T05:38:35.008Z |
| 35 | 39 | unrun-verify | .planning/milestones/v1.3-phases/15-panorama-organising/15-UAT.md |  | ng089-uat-sheets: 49 pending results plus no recorded React 19 runtime test across the v1.2 10-UAT and v1.3 13, 14, 14.1, 14.1.1 and 15 UAT sheets; repro: node scripts/verify-ng-089-uat-sheets.mjs; cause so far: the NG-084 live UAT pass over those sheets was deferred by the owner ('Defer all the checks') and never run; source: the listed UAT sheets, every pending test | open | Re-dated to next version (Phase 59 D-09) | 2026-11-07T10:18:31.663Z |  |
| 36 | 39 | unmet-truth | powerbrowser/shell/TheiaService.sys.mjs |  | start-failure-shows-error (MIG-04): 'the failing settings-folder step did not name itself in its diagnostics rows (Failed step = waiting for the backend readiness announcement)' (39-BASELINE, 39-19 full run and rerun); repro: scripts/verify-platform.sh --only start-failure-shows-error; cause so far: the log shows 'Backend did not announce POWERBROWSER_BACKEND_READY within 3000ms' first, so the readiness backstop fires before the planted settings-folder failure is classified; not isolated; source: no UAT test (MIG-04 registry row) | fixed |  | 2026-11-07T10:18:31.926Z | 2026-11-09T05:38:48.313Z |
| 37 | 39 | unmet-truth | scripts/verify-pan04-undo-close-group-live.mjs | 464 | pan04-undo-close-group-live (g): 'after the commit focus is on pb-org-new theia-button with 0 Undo controls left, want New Group and none' (39-BASELINE, 39-19 full run and rerun); repro: scripts/verify-platform.sh --only pan04-undo-close-group-live; cause so far: focus is on an element with class pb-org-new, but not the one org.node.querySelector('.pb-org-new') returns, so either a second Organising widget instance or a stale org handle in the probe; harness or product not separated; source: no v1.5 UAT test (PAN-04 registry row) | fixed |  | 2026-11-07T10:18:32.197Z | 2026-11-09T05:38:48.419Z |
| 38 | 39 | unmet-truth | scripts/verify-ng-023-suggestions-places.mjs |  | ng-023-suggestions-history-bookmarks: 'an open tab ranks below a history or bookmark match' (bookmark first, open tab second, history third; 39-BASELINE, 39-19 full run and rerun); repro: scripts/verify-platform.sh --only ng-023-suggestions-history-bookmarks; cause so far: the suggestion ranking puts the bookmark provider ahead of open tabs; not traced to a commit; source: no UAT test (NG-023 registry row) | fixed |  | 2026-11-07T10:18:32.415Z | 2026-11-09T05:38:48.524Z |
| 39 | 39 | unmet-truth | scripts/verify-prompts-live.mjs |  | prompts-live-self-test: plant allow-loads-frame-url went red for the wrong reason, 'popup not adopted next to its opener (..., about:blank)', in 2 of 3 runs (39-19 full run, run 3; run 2 PASS); repro: scripts/verify-platform.sh --only prompts-live-self-test; cause so far: the 39-09 re-site (999.13, fae88df5) does not reach the plant's own failure reliably, the popup adoption step is timing-dependent; source: 37-UAT test 17 | fixed |  | 2026-11-07T10:18:32.637Z | 2026-11-09T06:25:41.333Z |
| 40 | 39 | unmet-truth | scripts/verify-site-identity-live.mjs | 1316 | site-identity-live and its self-test clean control: app-menu 'the Organising menu disabled rows are [f,f,f,f,t,t,t,t,f,...], want all false' and 'the Help row did not open its stock page (no stock window shows about:support)' (39-BASELINE, 39-19 full run and rerun); repro: node scripts/verify-site-identity-live.mjs --scenario app-menu; cause so far: rows 5 to 8 are disabled in Organising, likely page-dependent rows with no current web tab, and Help opens no stock about:support window; harness expectation or product not separated; source: no UAT sheet for phase 31; 31-04-LIVE-HANDOFF.md app-menu | fixed |  | 2026-11-07T10:18:32.870Z | 2026-11-09T05:38:48.629Z |
| 41 | 39 | unmet-truth | theia/extensions/chrome-bar/src/browser/side-panel-top-tabs.ts |  | first-boot-surface-fresh: 'TypeError: can't access property offsetHeight, additionalViewsMenu is null' before the forced error (39-BASELINE, 39-19 full run and rerun); repro: scripts/verify-platform.sh --only first-boot-surface-fresh; cause so far: @theia/core SideTabBar overflow (tab-bars.js:1179) queries .theia-additional-views-menu in the tab bar's parent, and the side panel tabs moved to the top by e9569e81 leave no such element there; fix belongs in the PB extension, never in Theia core; source: no UAT test (first-boot registry row) | fixed |  | 2026-11-07T10:18:33.080Z | 2026-11-09T05:38:48.732Z |
| 42 | 39 | deviation | scripts/verify-ng-067-frontend-errors.mjs |  | ng067-frontend-errors-reach-telemetry flaked: 'at level error no frontend.uncaught-error event was sent' in the 39-19 full run, then PASS 2 of 2 alone; repro: scripts/verify-platform.sh --only ng067-frontend-errors-reach-telemetry; cause so far: timing in the frontend error delivery or its read-back, not isolated; source: no UAT test (NG-067 registry row) | fixed |  | 2026-11-07T10:18:35.742Z | 2026-11-09T06:25:41.438Z |
| 43 | 39 | deviation | scripts/verify-page-furniture-live.mjs |  | page-furniture-live-self-test flaked: clean control 'context-menu: Copy Image Link did not put the image URL on the clipboard' in the 39-19 full run, then PASS 2 of 2 alone; the plain page-furniture-live row passed; repro: scripts/verify-platform.sh --only page-furniture-live-self-test; cause so far: the headless clipboard read-back after Copy Image Link is timing-dependent (the menu-edit Paste and iframe-edit-rows flakes share the headless clipboard); source: 35-UAT test 6 | fixed |  | 2026-11-07T10:18:36.853Z | 2026-11-09T17:03:27.646Z |
| 44 | 68 | deviation | inventory/licence-allowlist.json |  | open owner licence items: (1) ruling 68-B, the per-package permissive set allowed_package_spdx and its exception rows; (2) ruling 68-A was decided 2026-11-10 (D-30: the Claude agent SDK ships in a pre-installed, removable Theia extension, out of orcad), and the owner still confirms that Anthropic's terms (https://code.claude.com/docs/en/legal-and-compliance) permit redistributing it, then sets terms_check to confirmed; (3) the GPL-3.0 section 6 reading for the bundled uBlock Origin XPI (P68-39); no release is cut while (1) or (2) is open (release.yml --rulings guard); repro: scripts/verify-platform.sh --only orca-licence-rulings; source: 68-CONTEXT P68-38, P68-39 | fixed | Fixed by owner rulings 2026-11-15: (1) 68-B approved, allowed_package_spdx_ruling status approved (DECISIONS.md D-42); (2) 68-A terms_check confirmed, Chris "Confirmed, terms permit it" (D-43); (3) uBlock Origin GPL-3.0 section 6 reading accepted (D-44); node scripts/verify-licence-allowlist.mjs --rulings exits 0 and the orca-licence-rulings exclusion row is removed | 2026-11-10T22:08:56.684Z | 2026-11-15T17:06:38.725Z |
| 45 | 67 | unmet-truth | theia/extensions/orca-panes/src/browser/failure/orca-hosting-status.ts |  | orca-failure-page-live: after orcad is killed the automatic re-pair brings content back, then Orca's client is refused (access-revoked), clears its stored environment, and repair() re-pairs under a new environment id that strands its sessions; the next control reads pairing-lost (or browser-not-attached that Reconnect cannot clear). Root cause in orca-overlay pb-session-pairing.ts repair (67-06 Task 2, owner decision) | fixed |  | 2026-11-11T18:33:38.140Z | 2026-11-11T20:00:22.319Z |
| 46 | 67 | unrun-verify | scripts/verify-orca-landing-logo-live.mjs |  | orca-landing-logo-live remount leg (A-9): Landing unmounts on worktree activation but did not mount again within 30 s after the worktree was removed (main worktree activated) or its terminals closed; proxy control, web tab, stock window and Theia legs PASS (67-06) | fixed |  | 2026-11-11T18:33:38.266Z | 2026-11-11T20:00:22.426Z |
| 47 | 67 | deviation | scripts/verify-orca-failure-page-live.mjs |  | orca-failure-page-live intermittent harness red, 1 of 6 runs on the 67-07 tree (5 PASS): offer-refusal induction, after the Theia document reload the page probe did not return ('timed out after 60000 ms waiting for hosted views after the reload (last error: timed out after 180000 ms waiting for the page probe to finish)'); cause not found; repro: scripts/verify-platform.sh --only orca-failure-page-live under the pb-live lock; source: 67-07-SUMMARY.md | fixed | Closed after the 66-09 merge (2c713811): f42a2cb4 makes the row record performance.timeOrigin before location.reload() and wait for a different value before the page probe. 6 of 6 counted runs green in the gap-66-09 worktree (.mozbuild/p66-09/w47-run1, run3, run4, run5, run6, run7; run2 also PASS but not counted, it overlapped the 68-06 pass cleanup), each logging: 'orca-failure-page-live: PASS -- every hosted view showed the PowerBrowser page for each induced class and recovered; after the restart the client kept its environment id, logged no stranded-environment line and a CLI terminal became a hosted tab'. Merged tree, one more run (.mozbuild/coord-6609/failure-page-live.txt, 172 s): same PASS line. | 2026-11-11T20:18:17.325Z | 2026-11-11T22:10:08.897Z |
| 48 | 68 | unrun-verify | powerbrowser/packaging/package-macos.sh |  | macOS release artifact with Orca not built: package-macos.sh's per-arch Orca staging and the universal merge exist (68-01) and release.yml's macos-orca-arm64, macos-orca-x64 and macos-orca-universal jobs are shape-checked (release-shape, orca-macos-merge-self-test), but no build-macos job exists and the macOS Gecko cross-build is blocked by Phase 55 BLOCKED.md items 8 (build-time checks never run, no macOS host) and 9 (no Darwin rust-std in the firefox-macos shell; owner chooses a route); repro: scripts/verify-platform.sh --only macos-package-payload; source: 68-06 Task 3, PLAT-01, D-24 | open | Re-dated to next version (Phase 59 D-09); D-40 (2026-11-15): deferred to the next version; v1.7 ships Linux only | 2026-11-11T21:07:34.010Z |  |
| 49 | 68 | unrun-verify | powerbrowser/packaging/package-macos.sh |  | macOS smoke test of a build with Orca not run: needs a Mac and a macOS artifact (D-24: macOS gets a smoke test when a host exists); steps: install the artifact, start PowerBrowser, open Orca mode, confirm orcad runs from <GreD>/orca on the staged Node and a quit leaves no orcad; source: 68-06 Task 3, PLAT-02, D-24 | open | Re-dated to next version (Phase 59 D-09); D-40 (2026-11-15): deferred to the next version; v1.7 ships Linux only | 2026-11-11T21:07:34.116Z |  |
| 50 | 68 | unrun-verify | powerbrowser/packaging/package-windows.sh |  | Windows smoke test of a build with Orca not run: needs the Windows 11 VM (CF-10, OWNER-PASS section 11) and a windows-orca plus build-windows artifact from a release.yml dispatch; the Windows staging and admission order are proven only by build-windows-shape on this host; steps: install, start, open Orca mode, confirm orcad runs from <GreD>/orca on node/node.exe and a quit leaves no orcad; source: 68-06 Task 3, PLAT-02, D-24, CF-10 | open | Re-dated to next version (Phase 59 D-09); D-40 (2026-11-15): deferred to the next version; v1.7 ships Linux only | 2026-11-11T21:07:34.218Z |  |
| 51 | 68 | unrun-verify | orca-overlay/seams.json |  | Upstream issue and PR for the browser-provider seam (010-installed-electron-switch) not opened: owner opens the issue on Orca's repository with .mozbuild/orca-upstream/browser-provider/issue.md, then the PR from a fork with seam.patch and pr.md, and records the PR URL in seam 010's upstream.pr (68-05-SUMMARY.md Owner hand-off; regenerate the export first, Orca main moves daily); the fork and org are the owner's choice; repro: scripts/verify-platform.sh --only orca-upstream-prs; source: 68-05, OVL-06, D-27 | open | Re-dated to next version (Phase 59 D-09) | 2026-11-11T21:07:34.323Z |  |
| 52 | 68 | deviation | orca-overlay/seams.json |  | web-entry upstream export refused: node scripts/export-orca-seam-pr.mjs --class web-entry exits 2 with 'no seam of class web-entry (classes present: browser-provider, pb-only)' because Phase 64 hosts Orca panes through overlay files only and added no seam; orca-upstream-prs therefore stays red naming web-entry until the owner rules the class out (as D-31 did for the terminal provider, then the check's PR_CLASSES change under that ruling) or a later phase adds a web-entry seam in Phase 64's files; repro: node scripts/verify-orca-overlay.mjs --upstream-prs; source: 68-05, D-27 | fixed | Fixed by owner ruling 2026-11-15 (DECISIONS.md D-45): the web-entry class is ruled out for v1.7, as D-31 did for the terminal provider; scripts/verify-orca-overlay.mjs drops it from UPSTREAM_CLASSES and PR_CLASSES, so orca-upstream-prs names only browser-provider (WINDOWS 51) | 2026-11-11T21:07:34.430Z | 2026-11-15T17:06:38.725Z |
| 53 | 68 | unmet-truth | theia/extensions/orca-agents/src/node/claude-wrapper-launcher.ts |  | The claude-wrapper launcher writes only a POSIX sh script (#!/bin/sh), so an agent launched through PowerBrowser's wrapper on Windows has no launcher; no Phase 68 lane landed a Windows twin (.cmd or a node shim); repro: grep -n '#!/bin/sh' theia/extensions/orca-agents/src/node/claude-wrapper-launcher.ts; source: lane p63-03, 68-06 Task 3, TERM-02/EXT-02 | open | Re-dated to next version (Phase 59 D-09); Held 2026-11-13 (owner ruling): a .cmd launcher (branch worktree-agent-a82bf5f2c523276a9, 5b84e185) was not merged: cmd.exe re-parses %* (BatBadBut), and Node refuses to spawn a .cmd without a shell since CVE-2024-27980; needs a launcher that bypasses cmd.exe (e.g. an .exe shim), tested on the first Windows build; D-40 (2026-11-15): deferred to the next version; v1.7 ships Linux only | 2026-11-11T21:07:34.542Z |  |
| 54 | 68 | deviation | scripts/lib/firefox-bidi.mjs |  | Packaged live rows that end PowerBrowser with the harness's SIGTERM/SIGKILL instead of a quit leave the packaged OrcaService's orcad running from the deleted extraction root (/tmp/pb-pkg-*) once the package starts Orca (after fix 21898a67); observed after ng063-packaged-launch on 2026-11-11 and stopped by pid in 68-06; orca-packaged-live now stops its own (a625378d); the shared teardown (withFirefoxPage) or each packaged row should stop orcad by recorded identity; repro: run scripts/verify-platform.sh --only ng063-packaged-launch with POWERBROWSER_OBJDIR set to a packaged objdir, then list processes whose arguments name /tmp/pb-pkg-; source: 68-06 Task 2 | fixed | Re-dated to next version (Phase 59 D-09); Fixed in 0ea32a1a (withFirefoxPage stops the orcad a packaged run started, by recorded identity); confirmed live 2026-11-18 on a dev-objdir package rebuilt that day: ng063-packaged-launch and orca-packaged-live both PASS alone and no process naming /tmp/pb-pkg- remained after either. orca-packaged-live had launched the dev objdir binary since 0ea32a1a (a static import of lib/firefox-bidi.mjs fixed the binary before PB_FIREFOX_BIN was set); fixed in dc08c717 | 2026-11-11T21:07:34.646Z | 2026-11-18T23:40:37.135Z |
| 55 | 68 | unmet-truth | scripts/verify-orca-tabs-live.mjs |  | orca-tabs-live stage tab-groups-cross-client (g3) red in the 68-06 PLAT-02 Linux pass (2026-11-11), as on every tree since Phase 64/65 (TAB-04 pending): 'the second client shows no tab for T (web-terminal-...)'; not caused by Phase 68 code; owner of the stage: Phase 64 (TAB-04), end-of-milestone pass; repro: flock /home/chris/coding/Power-Browser/.git/pb-live.lock scripts/verify-platform.sh --only orca-tabs-live with ORCA_* unset; source: 68-06 Task 2, 64-06-SUMMARY.md | fixed | Fixed in 2ce581f2 and 3ad91d13 (scripts/verify-orca-tabs-live.mjs only). Root cause was the check, not the product. (1) Orca's stock web client at the pin stops applying host tab updates after it opens the worktree (the upstream echo bug in 64-MIRROR-FREEZE.md), so the check now reloads the second client once the tab exists. (2) crossClientVerdict compared tab-bar peers without the dropped-pane filter reloadVerdict already used. Four consecutive live runs green on 2026-11-16; orca-tabs-live-self-test PASS with 57 plants. Residual: a stock Orca web client does not show tabs created after it opened the worktree until it is reloaded; that is the upstream Orca bug, still open. | 2026-11-11T21:37:37.789Z | 2026-11-16T16:00:00.000Z |
| 56 | 59 | deviation | scripts/verify-pan03-strip-group-live.mjs |  | pan03-strip-group-live clause (f) flaky: passed 1 of 3 runs on fca5bcac/4aeac713 (2026-11-13); after the relaunch the strip is read before a restored tab's title loads, so that tab paints as 'New Tab' or its bare URL instead of 'page l'; the check should wait for the restored tab's title; repro: flock /home/chris/coding/Power-Browser/.git/pb-live.lock scripts/verify-platform.sh --only pan03-strip-group-live with PB_LIVE_LOCK_HELD=1 and ORCA_* unset; source: v1.7 gate run 2026-11-13 | fixed | Fixed in 740dcd8f (supersedes the title wait in 417dbe61, which went 1 of 5: a restored background tab is not loaded after the relaunch, so it keeps its URL or 'New Tab' label and never regains 'page l'). Clause (f) now compares the painted data-pb-tab ids with the derived widgets and checks B's tab by its key, so labels no longer matter. 9 of 10 runs green on the fixed tree (4 of 5, then 5 of 5); the one red ended in 6 s, before any clause ran, and its output was not kept. | 2026-11-13T09:30:00.000Z | 2026-11-14T01:40:00.000Z |
| 57 | 59 | deviation | scripts/verify-ng-018-scheduled-integrity-check.mjs |  | ng-018-scheduled-integrity-check flaky: red once in the v1.7 gate run at d55a380b (2026-11-13, 'the store rebuilt after the scheduled check is not at the head'), green in 3 other runs that day (2 of them alone right after); repro: flock /home/chris/coding/Power-Browser/.git/pb-live.lock scripts/verify-platform.sh --only ng-018-scheduled-integrity-check with PB_LIVE_LOCK_HELD=1 and ORCA_* unset; source: v1.7 gate run 2026-11-13 | fixed | Fixed in 417dbe61. Race in the check, not the product: quarantineAndRebuildTabStore (powerbrowser/shell/PowerBrowserAPI.sys.mjs, the backup to corruptPath before IOUtils.remove and migrateTabStoreToHead) writes .corrupt-1 before it migrates the new store, and the check tore the shell down as soon as .corrupt-1 appeared; a store cut off mid-rebuild is migrated by the next launch (NG-085). The check now waits up to 30 s for the rebuilt store to reach the head before the teardown. 5 of 5 runs green. The check file is ledger-locked; the owner must re-lock its hash. | 2026-11-13T19:30:00.000Z | 2026-11-14T01:40:00.000Z |
| 58 | 63 | deviation | scripts/verify-orca-agent-status-live.mjs |  | orca-agent-status-live flaky: red once in the v1.7 gate run at d55a380b (2026-11-13, 4 h into the run): the agent process and the terminal daemon were still alive 25 s after app.quit(); green in 3 other runs that day (2 alone right after). The quit-ends-agents rule (D-03) held in those runs; whether a slow shutdown under load can outlive the 25 s budget is open; repro: flock /home/chris/coding/Power-Browser/.git/pb-live.lock scripts/verify-platform.sh --only orca-agent-status-live with PB_LIVE_LOCK_HELD=1 and ORCA_* unset; source: v1.7 gate run 2026-11-13 | fixed | Fixed in 417dbe61 and ad9a1939. Second root cause (red again in the full gate at 1edc97d6, 2026-11-14): the quit blocker was never registered. PowerBrowserAPI.addNamedReapBlocker (and addSidecarReapBlocker) called AsyncShutdown.quitApplicationGranted.addBlocker; the pinned upstream/toolkit/components/asyncshutdown/AsyncShutdown.sys.mjs:1121-1134 defines no such phase, so the call threw inside OrcaService.start()'s try and every launch logged 'Reap blocker not registered: ... AsyncShutdown.quitApplicationGranted is undefined'. Only the quit-application-granted observer started stop(); nothing held the quit, and an instrumented run showed Gecko exiting 230 ms into _endDaemon's wait for the terminal daemon, so a daemon slow on SIGTERM under load, and its agent, outlived the browser. 417dbe61's overrun kill lives in stopAndReap and never ran. Both blockers now register on AsyncShutdown.appShutdownConfirmed (quit-application, raised by quit and eRestart); instrumented, the quit returns only after the daemon step. verify-orca-service scenario N runs the real addNamedReapBlocker against the phases parsed from upstream (plant: the old phase name, self-test 44 of 44); sidecar-reap-blocker derives the same set instead of hand-keeping the name. orca-agent-status-live 15 of 15 green after the fix (5 alone, 10 beside 1 to 4 parallel --quick loops, load average up to 5.5); negative control with the old phase under the same load: 1 of 4 red with the gate's exact two 'survived quit' lines. The 25 s budget is unchanged. | 2026-11-13T19:30:00.000Z | 2026-11-14T21:45:00.000Z |
| 59 | 68 | deviation | powerbrowser/shell/PowerBrowserAPI.sys.mjs |  | ext-tab-host-live options-page-switch red in the v1.7 gate of 2026-11-16 (3 of 15 runs alone): stockWindowStarted's 50 ms poll of gBrowserInit.delayedStartupFinished let a second openOptionsPage reach the started window before the deferred select, so the options page loaded into the empty initial tab and the select added a second options tab; source: v1.7 gate run 2026-11-16 | fixed | Fixed in 0b1ff185 (stockWindowStarted also races the window's delayedStartupPromise, resolved beside the flag, so the select runs before any second call can land) and 3824e0c4 (WR-07 accepts the module sleep inside the race; a new leg requires the race on win.delayedStartupPromise). Product race, 3 of 15 red alone before. | 2026-11-17T22:54:27.933Z | 2026-11-17T22:54:29.100Z |
| 60 | 68 | deviation | scripts/lib/firefox-bidi.mjs |  | tel06-error-delivery-live leaked its orcad: the harness ends PowerBrowser with SIGTERM, no quit blocker runs, and orcad plus its terminal daemon and scope watcher stayed alive holding port 26768 for four hours, which masked later rows in the earlier v1.7 gate runs; source: v1.7 gate run 2026-11-16 | fixed | Fixed in ed0ecc33 (withFirefoxPage stops the orcad a dev-objdir run leaves behind, matched by its working folder under the run's profile), 9fd3891c (verify-platform leak leg: a script row that leaves orcad running in its own session goes red and the orcad is stopped; scripts/verify-orcad-leak.mjs) and 8d1db795 (keepStrays opt-out for orca-service-live, whose orphan must survive to the product's reap). The SIGTERM behaviour of the product itself is entry 65. | 2026-11-17T22:54:28.056Z | 2026-11-17T22:54:29.225Z |
| 61 | 68 | deviation | scripts/verify-first-boot-surface.mjs |  | first-boot-surface-fresh recorded 169 modulepreload error events at every first boot (5 of 5 runs alone): the Orca pane bundle emitted modulepreload links for modules the entry had already imported and Gecko fires an error event on such a link; no user-visible effect; source: v1.7 gate run 2 at 2788eb05 (2026-11-17) | fixed | Fixed in 41229f23 (the pane bundle emits no modulepreload links). 5 of 5 runs alone were red before. | 2026-11-17T22:54:28.186Z | 2026-11-17T22:54:29.356Z |
| 62 | 64 | unmet-truth | theia/extensions/orca-panes |  | Orca's document-wide primary-selection paste hook (usePrimarySelectionPaste, mounted by the pane services root) cancelled the native middle-click paste into every Theia text field and pasted Orca's own captured selection instead; found by the v1.7 gate (tab-strip-live red) and masked at 4a7308ba by the leaked orcad of the earlier entry; source: v1.7 gate run 2 at 2788eb05 (2026-11-17) | fixed | Fixed in e50bd945 (the services root calls useHostedAppShellServices, whose usePanePrimarySelectionPaste acts only on targets inside [data-pb-orca-pane-root]; owner ruling "Limit the hook to Orca panes", D-54), with a772ea83 and 57fed2a0 (checks) and e324130a (debug record). | 2026-11-17T22:54:28.325Z | 2026-11-17T22:54:29.489Z |
| 63 | 64 | unmet-truth | theia/extensions/orca-panes |  | Orca's large-paste takeover (useLargeTextControlPaste: claimed every paste over 64 KiB into any Theia input or editor and dropped Gecko's newline handling) and its beforeunload checkpoint (cancelled the unload when Orca's checkpoint threw, which held PowerBrowser's quit veto and a Theia reload) acted on the Theia document; found by the owner-ruled test of Orca's app-wide listeners (2026-11-17); source: .planning/debug/orca-selection-preset-and-app-listeners.md | fixed | Fixed in 8d2530b2 (usePaneLargeTextControlPaste claims a paste over 64 KiB only inside a hosted pane root; useHostedAppSessionPersistence runs Orca's checkpoint at every unload and only reports a failure) with live legs in 45eca9fb and 21cfdc81 and the record in 6729ce22 and 0232b5a7 (D-56). The workspace-activation focus helper was tested and does not take focus from Theia UI. | 2026-11-17T22:54:28.459Z | 2026-11-17T22:54:29.617Z |
| 64 | 68 | deviation | scripts/verify-orca-mobile-protocol.mjs |  | orca-mobile-skew did not find the stock app's protocol constants at mobile-android-v0.0.65: the app moved them to a transport/connection layout and the check read only the old path; source: v1.7 gate run 1 at 4a7308ba (2026-11-16) | fixed | Fixed in f4dd366b (the check finds the stock app's protocol constants at the transport/connection layout as well as the old one). Verdict at v0.0.65 against pin v1.4.248: ok. | 2026-11-17T22:54:28.594Z | 2026-11-17T22:54:29.746Z |
| 65 | 68 | deviation | powerbrowser/shell/OrcaService.sys.mjs |  | PowerBrowser ended by SIGTERM exits within about 50 ms without running a quit blocker, so OrcaService does not stop its orcad, terminal daemon or scope watcher; OrcaService reaps a leftover only at the next launch of the same profile; not investigated, the live harness now stops them itself (ed0ecc33); owner ruling needed on whether to debug it in v1.7; source: v1.7 gate 2026-11-16 | open | Re-dated to next version (Phase 59 D-09) | 2026-11-17T22:54:28.720Z |  |
| 66 | 64 | unmet-truth | theia/extensions/orca-panes |  | A hosted Orca terminal focuses itself when it is first shown (TerminalPane createInitialPane/setActivePane, its own mount; PowerBrowser mounts every hosted terminal with isActive) and can take typing from a visible Theia editor; owner decision pending; source: .planning/debug/orca-selection-preset-and-app-listeners.md | fixed | Fixed in 7d730b00 (mountPane takes the hosting widget's activity, ApplicationShell's active widget, and the entry passes it as TerminalPane's isActive and NativeChatView's isFocusedGroup, so a hosted Orca terminal or chat takes focus only while its tab is Theia's active widget; owner ruling "Fix now", D-57) and c05cb098 (orca-terminal-keys-live 2d: keys typed in a Theia editor stay in the editor while a CLI-created or restored terminal is shown beside it, and a tab click or New Orca Terminal gives the terminal focus). Hosted chats got the same gate. Orca's settings and tasks pages were not checked for first-show focus. A control bundle with the old hard-wired value is red in the new legs; the fixed bundle is green 5 of 5. | 2026-11-17T22:54:28.845Z | 2026-11-18T04:48:58.016Z |
| 67 | 64 | unmet-truth | orca-overlay/seams.json |  | Upstream Orca bug: a stock Orca web client stops applying host tab updates after it opens the worktree, so tabs created later show only after a reload; the TAB-04 check (orca-tabs-live g3) reloads its second client to work around it; source: .planning/workstreams/orca/phases/64-orca-panes-as-powerbrowser-tabs/64-MIRROR-FREEZE.md | open | Re-dated to next version (Phase 59 D-09) | 2026-11-17T22:54:28.973Z |  |
| 68 | 64 | unmet-truth | theia/extensions/orca-panes |  | The user's Middle-click Paste from Selection choice did not survive a restart: PowerBrowser's Linux preset (D-55) was held in memory and Orca keeps its own value in the Theia page's browser storage, whose origin is new at every launch (the sidecar listens on a fresh port), so a user who switched it off found it on again after every restart; source: .planning/debug/orca-first-show-focus-and-paste-choice.md (dc57d058); not covered by entries 62 and 63, which are about where Orca's hooks act, not what is remembered | fixed | Fixed in 7d730b00 (OrcaPaneBundle reads powerbrowser.orca.primarySelectionPaste from ProfileStorageService before bootstrap, the settings.set observer writes the user's value there, and the Linux preset is that value, else on; owner ruling "Remember my 'off'", D-58), c05cb098 (orca-relaunch-restore-live paste-choice leg: off set in launch 1 reads off after the relaunch) and dc57d058 (investigation record). The record stores the chosen value, on or off, because Orca's own copy lives in per-launch browser storage. A control bundle that never writes the record is red; the fixed bundle is green 5 of 5. | 2026-11-18T04:48:57.872Z | 2026-11-18T04:48:58.016Z |
| 69 | 68 | unrun-verify | scripts/verify-platform.sh |  | Two gate rows need the owner's desktop or sign-in and failed unattended in v1.7 gate run 4 at 080814fd (2026-11-17), and again when re-run alone: orca-tabs-live refuses when the Claude sign-in is under 60 minutes from expiry (the CR-02 safeguard, b12906fc; 38 minutes in the gate) and real-input-gate-self-test fails when another window is focused or the screen is locked (its clean control capture wrote no file). orca-agent-status-live has the same sign-in dependency but prints SKIP and is counted PASS when the sign-in is under 60 minutes from expiry (44 minutes in gate run 4, log line about 9968), so TERM-02's real-agent leg did not run in that gate. None of the three is a product red. They are re-run, not excluded, and have no GATE_KNOWN_OPEN_EXCLUSIONS row: run claude once to refresh the sign-in, then scripts/verify-platform.sh --only orca-tabs-live and --only orca-agent-status-live (it must print PASS, not SKIP); run scripts/verify-platform.sh --only real-input-gate-self-test with the desktop unlocked and no other window taking focus; source: v1.7 gate run 4 | open | Re-run alone 2026-11-18 on the owner's refreshed sign-in and unlocked desktop: orca-tabs-live PASS (16 legs), orca-agent-status-live PASS (a real agent, not SKIP), real-input-gate-self-test PASS. In gate run 5 the same day (da97a4e9) orca-tabs-live PASS, orca-agent-status-live SKIP (sign-in 5 min from expiry) and real-input-gate-self-test FAIL (no clean capture); so the gate still exits 1 on real-input-gate-self-test and TERM-02's real-agent leg rests on the alone run | 2026-11-18T04:48:58.016Z |  |
| 70 | 68 | unrun-verify | scripts/verify-descriptor-monotonic.mjs |  | descriptor-monotonic prints SKIP: no published Release and no candidate descriptor exist, so no offered buildID is compared; it runs with the first release; owner date: next version (D-63, Chris 2026-11-23); source: gate run 6 | open |  | 2026-11-24T07:01:08.941Z |  |
| 71 | 67 | unrun-verify | scripts/verify-orca-failure-page-live.mjs |  | orca-failure-page-live induction 3 (auth refusal through a revoked device, A-7) cannot be induced: the hosted client pairs session-only on the offer's own token, so the registry holds no separate device row to revoke (rows removed: 0); headless orcad has no way to revoke the offer's row (audit pairing-credentials-04). Every other induction runs; owner date: next version (D-63, Chris 2026-11-23); source: gate run 6 | fixed |  | 2026-11-24T07:01:09.062Z | 2026-11-24T12:21:49.992Z |
| 72 | 59 | deviation | powerbrowser/shell/PowerBrowserAPI.sys.mjs |  | PowerBrowser's main process ended once with SIGSEGV during ng-011-settings-table-read in gate run 6 (2026-11-23 15:15:39, pid 3963875), 49 s after its launch; no core was kept. Not reproduced: 6 of 6 and 50 of 50 runs alone with core dumps on passed. Repro: scripts/verify-platform.sh --only ng-011-settings-table-read; owner date: next version (D-63, Chris 2026-11-23); source: gate run 6. Second occurrence 2026-11-25: sql-store-roundtrip in gate run 9. Root cause (two gdb traces): the shell sends browser-idle-startup-tasks-finished without browser-delayed-startup-finished, so ScriptPreloader::WriteCache ran while scripts were still being added. Fix in 530dcede (finishScriptPreloaderStartup) with script-preloader-startup-live (green fixed, red control) | fixed | Fixed in 530dcede: 117 stress runs with no crash (before: 2 in 162) and gate run 10 at 04fd8ebc with no main-process crash; script-preloader-startup-live guards the cause | 2026-11-24T07:01:09.184Z | 2026-11-25T22:23:32.000Z |
| 73 | 64 | deviation | scripts/verify-orca-tabs-live.mjs |  | Orca drops a check-details and a simulator tab on a Theia reload at the pin: saved-editor-tab-restore.ts never saves a check-details document; the simulator drop was observed in every run and its line is not found. orca-tabs-live no longer requires those two kinds to come back (ORCA_TRANSIENT_KINDS); every other kind must; owner date: next version (D-63, Chris 2026-11-23); source: gate run 6 and five runs alone | open |  | 2026-11-24T07:01:09.306Z |  |
| 74 | 65 | deviation | orca-overlay/seams.json |  | Orca's 'Use website favicon' control for a repository stays after D-62 but its icon is never loaded, so the fallback icon shows; Orca's phone bundle (out/mobile-web) still forms the favicon address; owner date: next version (D-63, Chris 2026-11-23); source: D-62, D-63 (14) | open |  | 2026-11-24T07:01:09.428Z |  |
| 75 | 66 | unmet-truth | orca-overlay/seams.json |  | Orca's bundle runs in the Theia document's realm: no separate origin, frame or CSP (audit chrome-actor-03, sidecar-gate-backends-01, T-66-04; agent-browser-04 settles with it); owner date: next version (D-63, Chris 2026-11-23); source: v1.7 audit decision 3 | open |  | 2026-11-24T07:01:09.547Z |  |
| 76 | 67 | unmet-truth | orca-overlay/seams.json |  | headless orcad cannot revoke or rotate the token row an earlier pairing offer named (audit pairing-credentials-04); owner date: next version (D-63, Chris 2026-11-23); source: v1.7 audit decision 4 | open |  | 2026-11-24T07:01:09.665Z |  |
| 77 | 66 | unmet-truth | powerbrowser/shell/PowerBrowserAPI.sys.mjs |  | one shared agent container: no per-worktree container, no clearing at launch, no notice that agent sign-ins are kept and shared (audit agent-browser-03, chrome-actor-04); owner date: next version (D-63, Chris 2026-11-23); source: v1.7 audit decision 13 | open |  | 2026-11-24T07:01:09.793Z |  |
| 78 | 66 | unmet-truth | powerbrowser/shell/PowerBrowserAPI.sys.mjs |  | loopback wall residuals: DNS rebinding between lookup and connect, no user-confirmed LAN allow list, WebRTC and WebTransport unseen (audit agent-browser-06); owner date: next version (D-63, Chris 2026-11-23); source: v1.7 audit decision 14 | open |  | 2026-11-24T07:01:09.912Z |  |
| 79 | 68 | unmet-truth | powerbrowser/packaging/bundled-xpi.json |  | uBlock Origin gets no automatic updates (audit packaging-prefs-network-06) and the agent-browser binary's statically linked crate notices ship nowhere (packaging-prefs-network-05); owner date: next version (D-63, Chris 2026-11-23); source: v1.7 audit decision 6 | open |  | 2026-11-24T07:01:10.030Z |  |
| 80 | 62 | unmet-truth | powerbrowser/shell/OrcaService.sys.mjs |  | no fallback port when orcad's fixed port is busy; the diagnostics row naming the holder exists (audit orcad-hosting-03, P62-16); owner date: next version (D-63, Chris 2026-11-23); source: v1.7 audit decision 15 | open |  | 2026-11-24T07:01:10.151Z |  |
| 81 | 68 | unmet-truth | .github/workflows/release.yml |  | Orca's build and two launching rows run in the self-hosted runner's host shell (audit ci-supply-chain-02); two routes are held on audit-fix-held/ci-supply-chain-02 and -container, decided with the first release; owner date: next version (D-63, Chris 2026-11-23); source: v1.7 audit decision 1 | open |  | 2026-11-24T07:01:10.275Z |  |
| 82 | 59 | unmet-truth | theia/yarn.lock |  | Dependabot advisories left after the in-range updates: simple-git 3.36.0 and @simple-git/argv-parser (from @theia/ai-ide; fix is a major bump), decompress 4.2.1 (no fix; from @theia/cli, @theia/plugin-ext and @theia/plugin-ext-vscode, which unpack extension archives), dompurify 3.2.7 (exact pin), and others fixable only by a major bump. Whether PowerBrowser reaches the affected code is not established; owner date: next version (D-63, Chris 2026-11-23); source: D-63 (12) | open |  | 2026-11-24T07:01:10.393Z |  |

````json
[
  {
    "id": 1,
    "kind": "deviation",
    "phase": "01",
    "file": "sourcerer/endpoint-allowlist.json",
    "line": 82,
    "description": "GitHub org URL becomes https://github.com/DeBIOS/PowerBrowser under the mechanical vendor rename; the DeBIOS Foundation's actual GitHub org is not established (D-12 fixes only the domain). Must be confirmed before release.",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-30T17:53:27.054Z",
    "resolved_at": "2026-08-30T22:00:12.411Z"
  },
  {
    "id": 2,
    "kind": "deviation",
    "phase": "01",
    "file": "theia/extensions/branding/src/browser/sourcerer-welcome-widget.tsx",
    "line": 13,
    "description": "SOURCERER_REPO_URL points at github.com/Deocracy/Sourcerer; same unestablished-org problem as endpoint-allowlist.json:82.",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-30T17:53:27.157Z",
    "resolved_at": "2026-08-30T22:00:12.510Z"
  },
  {
    "id": 3,
    "kind": "unrun-verify",
    "phase": "01",
    "file": "scripts/apply-patches.sh",
    "line": null,
    "description": "apply-patches.sh --self-test cannot run: needs upstream/browser/moz.configure and upstream/ has never been materialized (pre-existing, rename-independent)",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-30T20:24:37.919Z",
    "resolved_at": "2026-08-30T22:00:12.608Z"
  },
  {
    "id": 4,
    "kind": "unrun-verify",
    "phase": "01",
    "file": "scripts/verify-customize-inert.mjs",
    "line": null,
    "description": "verify-customize-inert.mjs unrun: needs a built binary at objdir/dist/bin/powerbrowser (Tier 3 Gecko build)",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-30T20:24:38.018Z",
    "resolved_at": "2026-08-30T22:00:12.714Z"
  },
  {
    "id": 5,
    "kind": "unrun-verify",
    "phase": "01",
    "file": "scripts/verify-dev-flag-off.mjs",
    "line": null,
    "description": "verify-dev-flag-off.mjs unrun: needs a built binary at objdir/dist/bin/powerbrowser (Tier 3 Gecko build)",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-30T20:24:38.116Z",
    "resolved_at": "2026-08-30T22:00:12.816Z"
  },
  {
    "id": 6,
    "kind": "deviation",
    "phase": "01",
    "file": "inventory/brand-tokens.json",
    "line": null,
    "description": "scan-brand-residue.mjs --reconcile no longer closes post-rename; its expected_count census describes the pre-rename tree. Gate is the plain run. Terminal census owned by plan 01-03.",
    "status": "fixed",
    "reason": "Both halves of this entry are now false, which is why it closes. (1) --reconcile DOES close post-rename: plan 01-08 reconciled the four drifted rows against the current tree by name -- the absolute-repo-root row to 0 (both .desktop entries hand-rewritten in 01-03), MOZ_APP_UA_NAME and MOZ_APP_ID to 1 each (the second site was a patch-020 context line dropped when 020 was regenerated in 01-05), and the -PLAN.md provenance row to 28 (+2 from the 01-03 driver consolidation, +5 from 01-05's INTERNAL-APIS.md catalogue rows), each with its justification written into its own reason field. (2) The plain run is NO LONGER a separate, weaker gate: reconciliation failures now fail the un-flagged invocation too, through a single gateFailures() exit source, so the two modes agree on the same tree.",
    "recorded_at": "2026-08-30T20:24:38.216Z",
    "resolved_at": "2026-08-31T04:25:03.312Z"
  },
  {
    "id": 7,
    "kind": "unrun-verify",
    "phase": "01",
    "file": "scripts/verify-platform.sh",
    "line": null,
    "description": "31 of verify-platform.sh's 48 checks could not run: they need a built tree, a launched browser, or a display. objdir/ does not exist yet (plan 01-04).",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-30T20:49:13.526Z",
    "resolved_at": "2026-08-30T22:00:29.468Z"
  },
  {
    "id": 8,
    "kind": "unrun-verify",
    "phase": "01",
    "file": "scripts/verify-platform.sh",
    "line": null,
    "description": "apply-patches-self-test cannot run: it derives its fixture from upstream/browser/moz.configure and upstream/ is a git-ignored 1.1 GB clone absent on a fresh checkout. Pre-existing, rename-independent.",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-30T20:49:13.628Z",
    "resolved_at": "2026-08-30T22:00:12.915Z"
  },
  {
    "id": 9,
    "kind": "deviation",
    "phase": "01",
    "file": ".planning/REQUIREMENTS.md",
    "line": null,
    "description": "MIG-04 was auto-checked from plan 01-03's frontmatter but nothing has been built; reverted to unchecked. Plan 01-04 owns the build that closes it.",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-30T20:49:13.723Z",
    "resolved_at": "2026-08-30T22:00:13.014Z"
  },
  {
    "id": 10,
    "kind": "unrun-verify",
    "phase": "01",
    "file": "scripts/verify-platform.sh",
    "line": null,
    "description": "verify-branding-identity-release and branding-variant-divergence still unrun: both read objdir-release/dist/bin, i.e. a second full ~47m release build that 01-04-PLAN.md explicitly declined to spend. Runnable the moment a release objdir exists.",
    "status": "fixed",
    "reason": "Closed by plan 08-05 Task 3: objdir-release built 2026-09-05 (mach wall 54:40), both rows PASS.",
    "recorded_at": "2026-08-30T22:00:29.574Z",
    "resolved_at": "2026-09-05T04:45:00.000Z"
  },
  {
    "id": 11,
    "kind": "unrun-verify",
    "phase": "01",
    "file": "scripts/verify-platform.sh",
    "line": null,
    "description": "The ~20 launch-lifecycle checks (side03-*, side04-*, side05-*, shell03-*, shell04-diagnostics-with-backend-down, cr01-*, harness-display-available) became RUNNABLE with 01-04's build but were not run: none is named by 01-04-PLAN.md's verify blocks and each launches a real browser. Not blocked -- unexercised.",
    "status": "open",
    "reason": "Re-dated to next version (Phase 59 D-09); On 2026-09-28 Chris deferred all remaining checks (\"Defer all the checks\").",
    "recorded_at": "2026-08-30T22:00:29.678Z",
    "resolved_at": null
  },
  {
    "id": 12,
    "kind": "stub",
    "phase": "01",
    "file": "powerbrowser/shell/powerbrowser.js",
    "line": null,
    "description": "Env-gated POWERBROWSER_SPIKE_GUI01 instrumentation left in the shell bootstrap by plan 01-05 Task 1; it is spike scaffolding and Task 3 of the same plan removes it",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-30T23:38:09.088Z",
    "resolved_at": "2026-08-31T00:39:32.952Z"
  },
  {
    "id": 13,
    "kind": "deviation",
    "phase": "01",
    "file": "scripts/check-internals-boundary.sh",
    "line": null,
    "description": "ChromeUtils.registerWindowActor is absent from FORBIDDEN_PATTERNS. Latent, not exploited: candidate B (the JSWindowActor pair) was NOT adopted in 01-05, so nothing in-tree uses it. Any future actor pair must add it in the same commit or the boundary guard has a hole.",
    "status": "fixed",
    "reason": "Closed by plan 08-03 Task 1. ChromeUtils.registerWindowActor added to FORBIDDEN_PATTERNS as an unconditional entry with no chrome-scheme exemption. Gate evidence: check-internals-boundary.sh --self-test PASS (Services. plant, actor plant naming file and pattern, catalogue mutation), --catalogue PASS, verify-platform.sh --only internals-boundary PASS. Zero WindowActor occurrences in PowerBrowserAPI.sys.mjs and INTERNAL-APIS.md, so no catalogue row owed; single-touchpoint invariant holds.",
    "recorded_at": "2026-08-31T00:39:33.061Z",
    "resolved_at": "2026-09-05T00:24:03.000Z"
  },
  {
    "id": 14,
    "kind": "deviation",
    "phase": "01",
    "file": "scripts/lib/firefox-bidi.mjs",
    "line": null,
    "description": "Every withFirefoxPage caller that passes a URL launches TWO windows (the shell plus a stock browser window for the URL argument), and contexts[0] resolves to the shell's own supervised Theia frontend rather than the URL passed. Pre-existing, unrelated to 01-05's change: the four _run_app_check_mjs checks boot a dev app at localhost:3000 they then do not read.",
    "status": "fixed",
    "reason": "Closed by plan 08-03 Task 2. withFirefoxPage selects the context carrying the requested URL via topLevelContexts (bounded poll, loud throw naming URL and contexts seen on mismatch, never silent fallback); empty URL takes the single shell context with a logged note. All five _run_app_check_mjs callers plus the SHELL01 inline runner launch with an empty URL since they read the shell, never a URL page. Gate evidence: firefox-bidi --self-test PASS (two-context session targets URL context for evaluate+screenshot, single-context control resolves), verify-platform rows gui01-browser-close-does-not-quit, gui01-command-registered, shell01-theia-is-the-window PASS, --quick PASS. Zero new dependencies; launch semantics and process hygiene untouched.",
    "recorded_at": "2026-08-31T00:39:33.163Z",
    "resolved_at": "2026-09-05T00:33:15.000Z"
  },
  {
    "id": 15,
    "kind": "unrun-verify",
    "phase": "01",
    "file": ".planning/phases/01-platform-extraction-and-rename/01-VALIDATION.md",
    "line": null,
    "description": "GUI-01 manual browser-window verification not performed: 01-07 executed autonomously with no human present. Five steps outstanding (launch app; open a browser window; address bar takes keyboard focus and navigates a typed URL; an in-window modal appears; closing the window returns the shell with the app still running). Automation cannot substitute -- BiDi cannot see chrome contexts on Linux (ledger 7).",
    "status": "fixed",
    "reason": "Closed by live user verification 2026-09-01, recorded as 01-UAT.md test 2 (Open the Stock Browser Window, GUI-01), result: pass. All five outstanding steps were driven by a human in a real launched window -- the command opened a stock-chrome browser window, the address bar took keyboard focus and navigated a typed URL, an in-window modal appeared rather than being suppressed, and closing the window returned the shell with the app still running. This is the human record the automation cannot substitute for: chrome-context Marionette is platform-blocked on Linux (ledger item 7), so no registered check can ever cover it.",
    "recorded_at": "2026-08-31T02:09:45.801Z",
    "resolved_at": "2026-09-01T00:00:00.000Z"
  },
  {
    "id": 16,
    "kind": "unrun-verify",
    "phase": "01",
    "file": ".planning/phases/01-platform-extraction-and-rename/01-VALIDATION.md",
    "line": null,
    "description": "GUI-03 manual customize-bridge verification not performed: 01-07 executed autonomously with no human present. Three steps outstanding (with the dev flag on, edit customize.css and see the shell restyle without a rebuild; delete it; see the shell revert). Its automatable halves -- inertness and flag-gating -- are green (verify-customize-inert, verify-dev-flag-off); only the perceptual half is open.",
    "status": "fixed",
    "reason": "Closed by live user verification 2026-09-01, recorded as 01-UAT.md test 6 (Customize Bridge Live Restyle, GUI-03), result: pass. Driven live with the dev flag on: a red outline plus top-panel rule appeared within ~1s of writing customize.css and the shell reverted to stock styling on delete -- both halves confirmed by the user. The automatable halves (verify-customize-inert, verify-dev-flag-off) were already green; this closes the perceptual half, which stays on the human record for the same platform reason as ledger item 15.",
    "recorded_at": "2026-08-31T02:09:45.906Z",
    "resolved_at": "2026-09-01T00:00:00.000Z"
  },
  {
    "id": 17,
    "kind": "deviation",
    "phase": "01",
    "file": "scripts/verify-branding-preflight.mjs",
    "line": null,
    "description": "The preflight's display-surface list is HAND-KEPT, and that omission is exactly what let the welcome widget render the identifier form through the whole rename (fixed in 01-07 by adding the file). The list should derive the set of display surfaces from the tree rather than enumerate it; until then, any new file that renders the product name must be added here by hand or the leak class returns.",
    "status": "fixed",
    "reason": "Closed by plan 01-08 Task 2, which fixed the class rather than the site: section 6 of verify-branding-preflight.mjs now DERIVES its display-surface set by reading theia/extensions/branding/src/browser/ at check time, so it goes red when a leaking surface is added and red when that directory disappears. A zero-file walk is its own distinct failure, not a clean run. Proven both ways -- a scratch .tsx dropped into that directory was rejected by name with the script unedited, and the self-test now copies the whole directory and plants the identifier form in the About dialog copy. The walk reads the filesystem, not the git index, so unlike scan-brand-residue.mjs it also sees an unstaged new file. Residual exposure, recorded as a backstop truth rather than as a closed gap: a display surface authored OUTSIDE that directory and outside the inventory-declared variant files is still not reached by this scan and rests on code review.",
    "recorded_at": "2026-08-31T02:09:52.011Z",
    "resolved_at": "2026-08-31T04:37:15.633Z"
  },
  {
    "id": 18,
    "kind": "deviation",
    "phase": "01",
    "file": "powerbrowser/shell/TheiaService.sys.mjs",
    "line": null,
    "description": "The supervisor's start path shipped two defects with one user-visible outcome. (a) State-keying conflation: \"a port has been pinned\" and \"a spawn has actually completed\" were one condition, so a first spawn that announced readiness and then failed the health gate made every later successful respawn skip the one-time initialisation -- the user sat on the branded loading layer with a healthy backend behind it. (b) No terminal handler: powerbrowser.js called TheiaService.start(browserElement) with no await and no catch, and three reachable throw sites inside that path (settings-folder creation, leftover reap, session-cookie minting) were unguarded, so any of them became an unhandled promise rejection in chrome with the identical dead screen -- no message, no Retry, no Details. Found by 01-VERIFICATION.md rather than by any check: every launch check in the registry drove a failure that already had a classified result, and none drove a rejection that ESCAPED.",
    "status": "fixed",
    "reason": "Closed by plans 01-09 (a) and 01-10 (b). (a) The one-time initialisation block and _restart()'s per-attempt port choice are now keyed on this._swapped -- the same field _swap()'s own guard reads -- and _swap() sets it AFTER the navigation returns. (b) One public terminal handler, TheiaService.reportUnexpectedFailure, attached at all four fire-and-forget entry points (the bootstrap's start call, the Retry control's retry call, and the _healthLoop and _recoveryProbeLoop roots); it paints a direct USER_MESSAGE.couldNotStart reference with the failed step and the rejection text as diagnostics rows, minting no new copy. The settings-folder and session-cookie sites now return the same classified-result shape every other _spawnAndGate failure returns, with the cookie catch returning BEFORE the navigation so a launch whose credential was never minted never reaches the backend origin; the reap site is guarded, logged on its existing dual channel and deliberately non-fatal, because failing a launch over a previous launch's stale pid would turn a cosmetic cleanup miss into the dead screen being fixed. PROVEN BY TWO REGISTERED CHECKS, each observed red before its own fix and green after, same binary, only chrome source differing: health-gate-recovery-swaps (red -- no swap sentinel after a recovered health gate) and start-failure-shows-error (red -- no error sentinel at all within 30s of a real throw). start-path-recovery's static half additionally derives, from the tree on both sides, the set of promise-returning supervisor methods and requires every bootstrap call to one of them to carry a terminal handler; that rule was hand-proven red by stripping the handler from the start call and naming that exact site, and its self-test carries 11 planted faults plus 2 clean controls. RESIDUAL, NOT CLOSED: no registered check drives a rejection out of either long-lived supervisor loop -- that would need a fault injected into a mid-session code path with no external control surface -- so those two terminal handlers rest on the source-derived coverage rule rather than on a runtime red. Ledger items 15 and 16 are untouched by this work and remain open.",
    "recorded_at": "2026-08-31T12:10:00.000Z",
    "resolved_at": "2026-08-31T12:10:00.000Z"
  },
  {
    "id": 19,
    "kind": "unrun-verify",
    "phase": "01",
    "file": "scripts/verify-platform.sh",
    "line": null,
    "description": "01-11 changed the error layer's visible behaviour; shell03-budget-exhausted-error and shell03-auto-dismiss-on-selfheal not re-run against a repackaged binary (tier-3, phase-gate scope). Neither clicks Retry, so neither is expected to move.",
    "status": "open",
    "reason": "Re-dated to next version (Phase 59 D-09); On 2026-09-28 Chris deferred all remaining checks (\"Defer all the checks\").",
    "recorded_at": "2026-08-31T20:39:31.590Z",
    "resolved_at": null
  },
  {
    "id": 20,
    "kind": "deviation",
    "phase": "01",
    "file": "powerbrowser/shell/TheiaService.sys.mjs",
    "line": null,
    "description": "The supervisor's error-state contract shipped three defects in one class, found together by a code review run against the post-01-09/01-10 tree and independently re-derived from source by 01-VERIFICATION.md -- not by any registered check. (2c) A failing Retry permanently disabled the error layer: the chrome Retry global blanked the error element directly while the supervisor's _errorShown repaint guard stayed set, so the FIRST Retry that did not succeed left a blank screen with no message, no Retry and no Details for the rest of the session. (2d) _showError started D-115's background recovery probe unconditionally, ignoring the recoverable classification it had just been handed, so the one class the supervisor's own D-113 comment calls unrecoverable by construction with no retry at all drove a process spawn every probe interval, for the life of the session, against a _configDir and a _stateFilePath that branch returns before ever assigning. (2e) PowerBrowserAPI.onQuitGranted was registered AFTER the settings-folder ensureDirectory try/catch -- a returnable branch whose failure is classified recoverable and which therefore still probes -- so a probe-driven spawn could reach a live, healthy, swapped backend on a launch that had registered no quit observer and derived no state-file path: stop() never runs on quit, a Node process with the extension host's file access and terminal surface outlives the browser still holding the token it was handed at spawn, and a crash on that launch leaves the next launch's _reapLeftover() nothing to find. NO REGISTERED CHECK COULD GO RED ON ANY OF THE THREE, and all three shipped green through three full verification runs. shell03-budget-exhausted-error asserts there is exactly ONE error sentinel, which is correct for the launch it drives and blind to a second one; shell03-unrecoverable-immediate-error asserts no spawn attempt within a 15-second window and was green precisely because the probe's first interval had not elapsed yet.",
    "status": "fixed",
    "reason": "Closed by plans 01-11 (2c) and 01-12 (2d, 2e). Two analyzers do the work, both riding already-registered rows and both deriving rather than hand-keeping. scripts/verify-shell-error-contract.mjs evaluates the SHIPPED supervisor and the SHIPPED chrome bootstrap in-process -- the supervisor imported with ChromeUtils faked, the bootstrap run through node:vm against a sandbox that is also its own window -- and drives them by firing the bootstrap's own DOMContentLoaded handler, so the entry point stays under test rather than under simulation. scripts/verify-start-path-recovery.mjs derives its rules from the tree at check time and compares. FOUR INDEPENDENT REDS WERE OBSERVED, one per clause, each before its own fix and green after. (2c), plan 01-11, scenario two-consecutive-failing-retries-repaint: \"verify-shell-error-contract: FAIL -- scenario two-consecutive-failing-retries-repaint: no POWERBROWSER_SHELL_ERROR_CLEARED was emitted after the first failing Retry; no second POWERBROWSER_SHELL_ERROR was emitted -- the error layer never came back. ... (Stale recovery probe still active after the first Retry: true.)\" Fixed by retry() calling _hideError() before _restart(), with the bootstrap's Retry global no longer writing style.display behind the supervisor's back. (2d), plan 01-12, scenario unrecoverable-classification-starts-no-probe: \"verify-shell-error-contract: FAIL -- scenario unrecoverable-classification-starts-no-probe: the recovery probe ran for a failure the supervisor classified unrecoverable -- the boundary's spawn was called 50 time(s) after an error state whose recoverable flag was false.\" On that SAME unfixed run the positive control recoverable-classification-starts-the-probe was GREEN; the asymmetry is the evidence that the instrument discriminates rather than failing everything. Fixed by gating _showError's _startRecoveryProbe() call on the recoverable parameter the method already receives. The verification's suggested alternative -- a dedicated \"sidecar resolved\" boolean -- was considered and REJECTED: the classification is already carried into _showError by every caller, so a second flag would be a second source of truth for one fact, which is the shape of the defect rather than its fix. (2e), plan 01-12, derivation E in verify-start-path-recovery.mjs, in two independently failing clauses. Clause 2, the ordering: \"verify-start-path-recovery: FAIL -- `start()` can return at byte 1017 of its own body -- BEFORE it has both registered the quit observer (`PowerBrowserAPI.onQuitGranted`) and derived `this._stateFilePath`.\" Clause 3, the retention, observed separately with the reorder already applied and the boundary's return value still discarded: \"verify-start-path-recovery: FAIL -- `start()` discards the unregister function `PowerBrowserAPI.onQuitGranted` returns -- the observer's lifetime is then the application's rather than this supervisor's, and nothing can ever detach it.\" Fixed by deriving _stateFilePath and registering the observer immediately after _configDir and ahead of the settings-folder try/catch, retaining the unregister function as _quitObserverOff, and detaching it in stop() only after the process has been signalled, awaited and cleared. The probe gate is TWO-DIRECTIONAL by construction: the registered positive control requires a recoverable classification to still drive at least one probe spawn, so a fix that simply stopped probing everywhere fails it, and the analyzer's --self-test plants exactly that fault (\"the recovery probe never started at all\") and requires it red. Derivation E's window is derived from the tree -- the first return after the _resolveSidecar call, through to the later of the two anchors, with both anchors located structurally and no identifier written down for the tree to agree with -- so it goes red on ANY future early return inserted ahead of the registration, not only the settings-folder one this gap named. shell-error-contract-self-test now stands at 5 planted faults plus 1 clean control; start-path-recovery-self-test at 16 plus 2. scripts/verify-platform.sh --quick is green at 24 rows and neither plan added a registry row. RESIDUAL, NOT CLOSED: the behavioural half runs the shipped sources under NODE against a faked PowerBrowserAPI, not under Gecko. It proves the classification-to-probe wiring, the spawn counts and the sentinel ordering; it does NOT prove that Gecko's quit-application-granted topic actually fires the retained observer in a real quit, and it does not prove the pixels of a repainted error layer. Both rest on the human record rather than on these checks, because chrome-context Marionette is platform-blocked on Linux (ledger item 7). No registered check drives a spawn whose settings folder could not be created, so the reorder's one accepted consequence -- a _stateFilePath pointing into a directory that may not exist -- rests on reading writeStateFile's existing non-fatal try/catch and readStateFile's null-for-absent contract rather than on a red. The two tier-3 regression confirmations recorded as ledger item 19 remain unrun, and shell03-auto-dismiss-on-selfheal is the one that could genuinely move, because its subject is the recoverable side of this gate. Ledger items 15 and 16 are untouched by this work and remain OPEN.",
    "recorded_at": "2026-08-31T20:51:20.010Z",
    "resolved_at": "2026-08-31T20:51:24.322Z"
  },
  {
    "id": 21,
    "kind": "deviation",
    "phase": "01",
    "file": "powerbrowser/shell/TheiaService.sys.mjs",
    "line": null,
    "description": "01-13, closing the LAST route of the defect class 01-09/01-10/01-11/01-12 each closed one route of. The recoverable classification gated the background recovery-probe TIMER (ledger 20, closed by 01-12) but not the USER-DRIVEN route: retry() re-entered _restart()/_spawnAndGate() unconditionally, and it called _hideError() first, which nulls _failureDetails. So on the one class the supervisor's own D-113 comment calls unrecoverable by construction with no retry at all, the user faced a live Retry control, a message naming it as the next step, and a click that erased the diagnostic rows and re-entered the failed launch path against _configDir = null, _stateFilePath = null and no registered quit observer. This SCOPES ledger 20's fixed disposition to the timer route rather than contradicting it: 01-12's fix was correct and complete for the route it named, and this is the second route through the same classification. Fix, both halves: (supervisor, the authority) a new per-launch field _errorRecoverable stores the PAINTED error state's classification, written inside _showError's _errorShown false-to-true latch and cleared in _hideError, and retry() returns before _hideError() unless it is true, so a direct powerbrowserRetry() call that never touched the button is refused on the same terms as a click and the diagnostic rows survive; (chrome, presentation only) powerbrowserShowError mirrors the classification onto errorRetryButton.hidden at the show site only. Copy moved with the controls: USER_MESSAGE.couldNotStartUnrecoverable was minted for _spawnAndGate's two recoverable:false returns and nodeMissing was reworded, so no message reachable from an unrecoverable site names Retry. Red observed before the fix, from the new registered scenario unrecoverable-classification-refuses-the-retry-click: 'a Retry driven against an UNRECOVERABLE error state re-entered the spawn path -- the boundary's spawn was called 1 time(s) after the error state was painted', plus 'the Retry control is still on screen ... hidden is undefined rather than true', 'the refused Retry destroyed the failure's diagnostic rows', and a POWERBROWSER_SHELL_ERROR_CLEARED emitted across the refused call. Green after: shell-error-contract PASS naming all four scenarios, shell-error-contract-self-test PASS over nine planted faults plus one clean control, verify-platform.sh --quick 24/24. RESIDUAL: the node harness proves the supervisor/bootstrap contract and the spawn counts, not the pixels. A human clicking Retry in a real launched window -- seeing the control absent on an unrecoverable failure, present on a recoverable one, and the diagnostics rows surviving -- stays on the human record, because chrome-context Marionette is platform-blocked on Linux (ledger item 7).",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-31T21:49:56.292Z",
    "resolved_at": "2026-08-31T21:50:02.210Z"
  },
  {
    "id": 22,
    "kind": "unmet-truth",
    "phase": "55",
    "file": "upstream/security/mac/hardenedruntime/production/firefox.browser.xml",
    "line": null,
    "description": "Upstream production entitlement files (firefox, firefoxdeveloperedition, nightly .browser.xml) carry Mozilla's Team ID 43AQ936H96 and org.mozilla application identifiers, plus the restricted keys com.apple.application-identifier and com.apple.developer.web-browser.public-key-credential. Release signing would bind them to the PowerBrowser bundle. Cure: a hook-only Team-ID patch regenerated with scripts/regenerate-patches.sh (Phase 55 plan 55-03), which needs the owner's Apple Developer Team ID (see .planning/workstreams/deploy/phases/55-macos-i/BLOCKED.md). scripts/verify-mac-entitlements.mjs excludes exactly those ten hits while this entry is open; any other hit is red. Mark this entry fixed when the patch lands, and remove the exclusion in the same commit.",
    "status": "waived",
    "reason": "R14 (2026-11-03): no Apple signing or Team ID in scope; the upstream entitlement hits stay excluded, macOS is deferred to v1.7 (R4)",
    "recorded_at": "2026-10-31T18:40:00.000Z",
    "resolved_at": "2026-11-04T01:20:23.627Z"
  },
  {
    "id": 23,
    "kind": "stub",
    "phase": "55",
    "file": "scripts/generate.mjs",
    "line": null,
    "description": "Phase 55 DMG branding placeholders, both variants: Assets.car and dsstore are empty files, background.png is the 128-pixel application raster. Finder and Dock icons degrade until a real asset catalog is built with actool and observed on a Mac (plan 55-04; see .planning/workstreams/deploy/phases/55-macos-i/BLOCKED.md item 6).",
    "status": "waived",
    "reason": "R4 (2026-11-03): Phase 55 macOS, including the DMG branding placeholders, is deferred to v1.7; needs Mac hardware",
    "recorded_at": "2026-10-31T19:05:00.000Z",
    "resolved_at": "2026-11-04T01:20:23.733Z"
  },
  {
    "id": 24,
    "kind": "unrun-verify",
    "phase": "44",
    "file": "scripts/build-update-xml.mjs",
    "line": null,
    "description": "44-02 full-tier row build-update-xml not run green: it FAILs by design because .mozbuild/mar-hop/nplus1.mar is absent. Build the N-plus-1 MAR per docs/BUILD.md, then run scripts/verify-platform.sh --only build-update-xml. UPD-14 stays open until it passes.",
    "status": "open",
    "reason": "Re-dated to next version (Phase 59 D-09)",
    "recorded_at": "2026-11-01T05:21:09.443Z",
    "resolved_at": null
  },
  {
    "id": 25,
    "kind": "deviation",
    "phase": "39",
    "file": "scripts/verify-address-bar-live.mjs",
    "line": 5000,
    "description": "address-bar-live-self-test: plant ctrl-d-everywhere stays green on bookmark-keys (3 of 3 sessions with the 39-08 harness and 3 of 3 with the pre-39-08 harness at 5d0dfa95); pre-existing, the plant no longer bites in the README editor; first lead: the bookmark command may be disabled with an editor current, so Theia skips the planted binding; repro: node scripts/verify-address-bar-live.mjs --self-test (plant ctrl-d-everywhere on bookmark-keys), red again in the 39-19 full run as \"stayed green ... got: (no failures at all)\"; source: 33-UAT test 1",
    "status": "open",
    "reason": "Re-dated to next version (Phase 59 D-09)",
    "recorded_at": "2026-11-06T21:08:45.534Z",
    "resolved_at": null
  },
  {
    "id": 26,
    "kind": "skipped-test",
    "phase": "39",
    "file": "scripts/verify-prompts-live.mjs",
    "line": null,
    "description": "prompts-live dialog and dialog-probe are skipped by derivation while REQUIREMENTS.md records PROMPT-03 deferred to 999.3 (OQ1 ruling 2026-11-05); repro: node scripts/verify-prompts-live.mjs --scenario dialog; cause: stock page dialogs lock the IDE; source: 37-UAT tests 8 and 9",
    "status": "open",
    "reason": "Re-dated to next version (Phase 59 D-09)",
    "recorded_at": "2026-11-06T22:32:05.803Z",
    "resolved_at": null
  },
  {
    "id": 27,
    "kind": "deviation",
    "phase": "39",
    "file": "theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx",
    "line": 976,
    "description": "long-press Back: with a real pointer, holding Back 600 ms then releasing on the pill leaves keyboard focus in the pill, so a real Escape is the pill's and the history menu stays open (39-15 verify-nav-keys-live long-press under PB_REAL_INPUT=1, 3 of 3 runs); the T4 claim itself (Enter on Back goes back after the hold) passes; repro: PB_REAL_INPUT=1 PB_LIVE_HEADED=1 node scripts/verify-nav-keys-live.mjs --scenario long-press (headed, real input); cause so far: the release on the pill moves keyboard focus there, so Escape goes to the pill, not the history menu; source: 27-UAT test 4",
    "status": "fixed",
    "reason": "Re-dated to next version (Phase 59 D-09)",
    "recorded_at": "2026-11-07T02:53:12.909Z",
    "resolved_at": "2026-11-19T02:23:11.097Z"
  },
  {
    "id": 28,
    "kind": "deviation",
    "phase": "39",
    "file": "scripts/verify-page-tools-live.mjs",
    "line": null,
    "description": "page-tools-live crash-navigate flaked once in three registry runs on 2026-11-06 (4ce04c24): 'a URL sent to a crashed tab did not load it (no loaded push with crashed false)'; the scenario passed alone 2 of 2 right after, and in the 116ac682 run; the code was not changed by 39-16; for the 39-18 flake work; repro: node scripts/verify-page-tools-live.mjs --scenario crash-navigate; cause so far: not isolated, the loaded push after a crash-restore navigate arrives late or not at all; page-tools-live passed in the 39-19 full run; source: 32-UAT test 1",
    "status": "open",
    "reason": "Re-dated to next version (Phase 59 D-09)",
    "recorded_at": "2026-11-07T04:37:55.475Z",
    "resolved_at": null
  },
  {
    "id": 29,
    "kind": "deviation",
    "phase": "39",
    "file": "patches/050-extension-tab-host.patch",
    "line": null,
    "description": "38 T22 step 4: the options page of an extension not allowed in private windows opens in the private stock window opened last (stock openOptionsPage uses windowTracker.topWindow); fix needs a patch 050 hunk and a Gecko rebuild; owner deferred to backlog 999.17 on 2026-11-06 (39-17), matches stock behaviour; repro: 38-UAT test 22 step 4, scenario private-access session 2; source: 38-UAT test 22",
    "status": "open",
    "reason": "Re-dated to next version (Phase 59 D-09)",
    "recorded_at": "2026-11-07T04:50:37.188Z",
    "resolved_at": null
  },
  {
    "id": 30,
    "kind": "unrun-verify",
    "phase": "39",
    "file": "powerbrowser/packaging/package-linux.sh",
    "line": null,
    "description": "39-19 full run (6ac27ac2): ng063-packaged-launch, portable-elf, sidecar-no-symlinks, package-target-natives, packaged-identity, install-matrix, ng065-mar-signature-enforced, ng072-policies-packaged-webextension, search-engines-packaged and mar-update-hop are red because no container-built release tarball exists in objdir-release/dist and hop.json has no served key; repro: scripts/verify-platform.sh --only portable-elf; cause so far: the PKG-17 container build with the release keys and the N-plus-1 MAR hop are owner steps in .planning/workstreams/deploy/OWNER-PASS.md, not run; source: no UAT test, 39-BASELINE environment rows",
    "status": "open",
    "reason": "Re-dated to next version (Phase 59 D-09)",
    "recorded_at": "2026-11-07T10:18:30.468Z",
    "resolved_at": null
  },
  {
    "id": 31,
    "kind": "unrun-verify",
    "phase": "39",
    "file": ".github/settings/",
    "line": null,
    "description": "39-19 full run (6ac27ac2): ng074-ci-green-on-main, repo-controls, channel-live, codeberg-mirror-live, upptime-sweep-live, win-matrix-record and win-download-copy are red on live owner state: no verify.yml run for the unpushed main head, 5 repo-controls problems (apps slack and claude undeclared), no published Release, Codeberg and Upptime slugs undeclared, scripts/matrix/win-matrix-record.json absent; repro: scripts/verify-platform.sh --only channel-live; cause so far: each needs an owner push, release or checkpoint input (deploy OWNER-PASS.md, 53-04 and 54-04 checkpoints); source: no UAT test, 39-BASELINE environment rows",
    "status": "open",
    "reason": "Re-dated to next version (Phase 59 D-09)",
    "recorded_at": "2026-11-07T10:18:30.720Z",
    "resolved_at": null
  },
  {
    "id": 32,
    "kind": "unrun-verify",
    "phase": "39",
    "file": "powerbrowser/packaging/package-macos.sh",
    "line": null,
    "description": "39-19 full run (6ac27ac2): macos-package-payload (.mozbuild/macos-package absent) and macos-install-matrix (25 unobserved items) are red; repro: scripts/verify-platform.sh --only macos-package-payload; cause so far: macOS is deferred to v1.7 by R4 (2026-11-03) and needs Mac hardware; ledger 23 is waived, so it cannot key a gate exclusion; source: no UAT test, 39-BASELINE environment rows",
    "status": "open",
    "reason": "Re-dated to next version (Phase 59 D-09); D-40 (2026-11-15): deferred to the next version; v1.7 ships Linux only",
    "recorded_at": "2026-11-07T10:18:30.941Z",
    "resolved_at": null
  },
  {
    "id": 33,
    "kind": "unrun-verify",
    "phase": "39",
    "file": "scripts/verify-telemetry-live-delivery.mjs",
    "line": null,
    "description": "tel06-error-delivery-live refuses to run: 'the working tree is dirty (2 tracked change(s), first: M .claude/settings.json)'; repro: scripts/verify-platform.sh --only tel06-error-delivery-live; cause so far: the drill rewrites a tracked file and rebuilds, so it refuses any dirty tree, and the dirt is the owner's local hook removal in .claude/settings.json plus .planning/state.json, which an agent may not commit; runs on a clean checkout; source: no UAT test, 39-BASELINE and 39-19 full run",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-11-07T10:18:31.179Z",
    "resolved_at": "2026-11-09T07:46:10.114Z"
  },
  {
    "id": 34,
    "kind": "unmet-truth",
    "phase": "39",
    "file": "scripts/verify-customize-inert.mjs",
    "line": null,
    "description": "verify-customize-inert: 'state 1 (absent) vs state 3 (styled) -- pixels identical, the CSS layer had no effect' (39-BASELINE, 39-19 full run and rerun, 3 of 3); repro: scripts/verify-platform.sh --only verify-customize-inert; cause so far: the script writes $XDG_CONFIG_HOME/powerbrowser/customize.css and captures the shell's supervised frontend, which may read customize.css from another config dir (the customize extension resolves user-storage:/user/customize.css); not isolated; source: no UAT test (CUST-01 registry row)",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-11-07T10:18:31.417Z",
    "resolved_at": "2026-11-09T05:38:35.008Z"
  },
  {
    "id": 35,
    "kind": "unrun-verify",
    "phase": "39",
    "file": ".planning/milestones/v1.3-phases/15-panorama-organising/15-UAT.md",
    "line": null,
    "description": "ng089-uat-sheets: 49 pending results plus no recorded React 19 runtime test across the v1.2 10-UAT and v1.3 13, 14, 14.1, 14.1.1 and 15 UAT sheets; repro: node scripts/verify-ng-089-uat-sheets.mjs; cause so far: the NG-084 live UAT pass over those sheets was deferred by the owner ('Defer all the checks') and never run; source: the listed UAT sheets, every pending test",
    "status": "open",
    "reason": "Re-dated to next version (Phase 59 D-09)",
    "recorded_at": "2026-11-07T10:18:31.663Z",
    "resolved_at": null
  },
  {
    "id": 36,
    "kind": "unmet-truth",
    "phase": "39",
    "file": "powerbrowser/shell/TheiaService.sys.mjs",
    "line": null,
    "description": "start-failure-shows-error (MIG-04): 'the failing settings-folder step did not name itself in its diagnostics rows (Failed step = waiting for the backend readiness announcement)' (39-BASELINE, 39-19 full run and rerun); repro: scripts/verify-platform.sh --only start-failure-shows-error; cause so far: the log shows 'Backend did not announce POWERBROWSER_BACKEND_READY within 3000ms' first, so the readiness backstop fires before the planted settings-folder failure is classified; not isolated; source: no UAT test (MIG-04 registry row)",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-11-07T10:18:31.926Z",
    "resolved_at": "2026-11-09T05:38:48.313Z"
  },
  {
    "id": 37,
    "kind": "unmet-truth",
    "phase": "39",
    "file": "scripts/verify-pan04-undo-close-group-live.mjs",
    "line": 464,
    "description": "pan04-undo-close-group-live (g): 'after the commit focus is on pb-org-new theia-button with 0 Undo controls left, want New Group and none' (39-BASELINE, 39-19 full run and rerun); repro: scripts/verify-platform.sh --only pan04-undo-close-group-live; cause so far: focus is on an element with class pb-org-new, but not the one org.node.querySelector('.pb-org-new') returns, so either a second Organising widget instance or a stale org handle in the probe; harness or product not separated; source: no v1.5 UAT test (PAN-04 registry row)",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-11-07T10:18:32.197Z",
    "resolved_at": "2026-11-09T05:38:48.419Z"
  },
  {
    "id": 38,
    "kind": "unmet-truth",
    "phase": "39",
    "file": "scripts/verify-ng-023-suggestions-places.mjs",
    "line": null,
    "description": "ng-023-suggestions-history-bookmarks: 'an open tab ranks below a history or bookmark match' (bookmark first, open tab second, history third; 39-BASELINE, 39-19 full run and rerun); repro: scripts/verify-platform.sh --only ng-023-suggestions-history-bookmarks; cause so far: the suggestion ranking puts the bookmark provider ahead of open tabs; not traced to a commit; source: no UAT test (NG-023 registry row)",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-11-07T10:18:32.415Z",
    "resolved_at": "2026-11-09T05:38:48.524Z"
  },
  {
    "id": 39,
    "kind": "unmet-truth",
    "phase": "39",
    "file": "scripts/verify-prompts-live.mjs",
    "line": null,
    "description": "prompts-live-self-test: plant allow-loads-frame-url went red for the wrong reason, 'popup not adopted next to its opener (..., about:blank)', in 2 of 3 runs (39-19 full run, run 3; run 2 PASS); repro: scripts/verify-platform.sh --only prompts-live-self-test; cause so far: the 39-09 re-site (999.13, fae88df5) does not reach the plant's own failure reliably, the popup adoption step is timing-dependent; source: 37-UAT test 17",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-11-07T10:18:32.637Z",
    "resolved_at": "2026-11-09T06:25:41.333Z"
  },
  {
    "id": 40,
    "kind": "unmet-truth",
    "phase": "39",
    "file": "scripts/verify-site-identity-live.mjs",
    "line": 1316,
    "description": "site-identity-live and its self-test clean control: app-menu 'the Organising menu disabled rows are [f,f,f,f,t,t,t,t,f,...], want all false' and 'the Help row did not open its stock page (no stock window shows about:support)' (39-BASELINE, 39-19 full run and rerun); repro: node scripts/verify-site-identity-live.mjs --scenario app-menu; cause so far: rows 5 to 8 are disabled in Organising, likely page-dependent rows with no current web tab, and Help opens no stock about:support window; harness expectation or product not separated; source: no UAT sheet for phase 31; 31-04-LIVE-HANDOFF.md app-menu",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-11-07T10:18:32.870Z",
    "resolved_at": "2026-11-09T05:38:48.629Z"
  },
  {
    "id": 41,
    "kind": "unmet-truth",
    "phase": "39",
    "file": "theia/extensions/chrome-bar/src/browser/side-panel-top-tabs.ts",
    "line": null,
    "description": "first-boot-surface-fresh: 'TypeError: can't access property offsetHeight, additionalViewsMenu is null' before the forced error (39-BASELINE, 39-19 full run and rerun); repro: scripts/verify-platform.sh --only first-boot-surface-fresh; cause so far: @theia/core SideTabBar overflow (tab-bars.js:1179) queries .theia-additional-views-menu in the tab bar's parent, and the side panel tabs moved to the top by e9569e81 leave no such element there; fix belongs in the PB extension, never in Theia core; source: no UAT test (first-boot registry row)",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-11-07T10:18:33.080Z",
    "resolved_at": "2026-11-09T05:38:48.732Z"
  },
  {
    "id": 42,
    "kind": "deviation",
    "phase": "39",
    "file": "scripts/verify-ng-067-frontend-errors.mjs",
    "line": null,
    "description": "ng067-frontend-errors-reach-telemetry flaked: 'at level error no frontend.uncaught-error event was sent' in the 39-19 full run, then PASS 2 of 2 alone; repro: scripts/verify-platform.sh --only ng067-frontend-errors-reach-telemetry; cause so far: timing in the frontend error delivery or its read-back, not isolated; source: no UAT test (NG-067 registry row)",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-11-07T10:18:35.742Z",
    "resolved_at": "2026-11-09T06:25:41.438Z"
  },
  {
    "id": 43,
    "kind": "deviation",
    "phase": "39",
    "file": "scripts/verify-page-furniture-live.mjs",
    "line": null,
    "description": "page-furniture-live-self-test flaked: clean control 'context-menu: Copy Image Link did not put the image URL on the clipboard' in the 39-19 full run, then PASS 2 of 2 alone; the plain page-furniture-live row passed; repro: scripts/verify-platform.sh --only page-furniture-live-self-test; cause so far: the headless clipboard read-back after Copy Image Link is timing-dependent (the menu-edit Paste and iframe-edit-rows flakes share the headless clipboard); source: 35-UAT test 6",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-11-07T10:18:36.853Z",
    "resolved_at": "2026-11-09T17:03:27.646Z"
  },
  {
    "id": 44,
    "kind": "deviation",
    "phase": "68",
    "file": "inventory/licence-allowlist.json",
    "line": null,
    "description": "open owner licence items: (1) ruling 68-B, the per-package permissive set allowed_package_spdx and its exception rows; (2) ruling 68-A was decided 2026-11-10 (D-30: the Claude agent SDK ships in a pre-installed, removable Theia extension, out of orcad), and the owner still confirms that Anthropic's terms (https://code.claude.com/docs/en/legal-and-compliance) permit redistributing it, then sets terms_check to confirmed; (3) the GPL-3.0 section 6 reading for the bundled uBlock Origin XPI (P68-39); no release is cut while (1) or (2) is open (release.yml --rulings guard); repro: scripts/verify-platform.sh --only orca-licence-rulings; source: 68-CONTEXT P68-38, P68-39",
    "status": "fixed",
    "reason": "Fixed by owner rulings 2026-11-15: (1) 68-B approved, allowed_package_spdx_ruling status approved (DECISIONS.md D-42); (2) 68-A terms_check confirmed, Chris \"Confirmed, terms permit it\" (D-43); (3) uBlock Origin GPL-3.0 section 6 reading accepted (D-44); node scripts/verify-licence-allowlist.mjs --rulings exits 0 and the orca-licence-rulings exclusion row is removed",
    "recorded_at": "2026-11-10T22:08:56.684Z",
    "resolved_at": "2026-11-15T17:06:38.725Z"
  },
  {
    "id": 45,
    "kind": "unmet-truth",
    "phase": "67",
    "file": "theia/extensions/orca-panes/src/browser/failure/orca-hosting-status.ts",
    "line": null,
    "description": "orca-failure-page-live: after orcad is killed the automatic re-pair brings content back, then Orca's client is refused (access-revoked), clears its stored environment, and repair() re-pairs under a new environment id that strands its sessions; the next control reads pairing-lost (or browser-not-attached that Reconnect cannot clear). Root cause in orca-overlay pb-session-pairing.ts repair (67-06 Task 2, owner decision)",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-11-11T18:33:38.140Z",
    "resolved_at": "2026-11-11T20:00:22.319Z"
  },
  {
    "id": 46,
    "kind": "unrun-verify",
    "phase": "67",
    "file": "scripts/verify-orca-landing-logo-live.mjs",
    "line": null,
    "description": "orca-landing-logo-live remount leg (A-9): Landing unmounts on worktree activation but did not mount again within 30 s after the worktree was removed (main worktree activated) or its terminals closed; proxy control, web tab, stock window and Theia legs PASS (67-06)",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-11-11T18:33:38.266Z",
    "resolved_at": "2026-11-11T20:00:22.426Z"
  },
  {
    "id": 47,
    "kind": "deviation",
    "phase": "67",
    "file": "scripts/verify-orca-failure-page-live.mjs",
    "line": null,
    "description": "orca-failure-page-live intermittent harness red, 1 of 6 runs on the 67-07 tree (5 PASS): offer-refusal induction, after the Theia document reload the page probe did not return ('timed out after 60000 ms waiting for hosted views after the reload (last error: timed out after 180000 ms waiting for the page probe to finish)'); cause not found; repro: scripts/verify-platform.sh --only orca-failure-page-live under the pb-live lock; source: 67-07-SUMMARY.md",
    "status": "fixed",
    "reason": "Closed after the 66-09 merge (2c713811): f42a2cb4 makes the row record performance.timeOrigin before location.reload() and wait for a different value before the page probe. 6 of 6 counted runs green in the gap-66-09 worktree (.mozbuild/p66-09/w47-run1, run3, run4, run5, run6, run7; run2 also PASS but not counted, it overlapped the 68-06 pass cleanup), each logging: 'orca-failure-page-live: PASS -- every hosted view showed the PowerBrowser page for each induced class and recovered; after the restart the client kept its environment id, logged no stranded-environment line and a CLI terminal became a hosted tab'. Merged tree, one more run (.mozbuild/coord-6609/failure-page-live.txt, 172 s): same PASS line.",
    "recorded_at": "2026-11-11T20:18:17.325Z",
    "resolved_at": "2026-11-11T22:10:08.897Z"
  },
  {
    "id": 48,
    "kind": "unrun-verify",
    "phase": "68",
    "file": "powerbrowser/packaging/package-macos.sh",
    "line": null,
    "description": "macOS release artifact with Orca not built: package-macos.sh's per-arch Orca staging and the universal merge exist (68-01) and release.yml's macos-orca-arm64, macos-orca-x64 and macos-orca-universal jobs are shape-checked (release-shape, orca-macos-merge-self-test), but no build-macos job exists and the macOS Gecko cross-build is blocked by Phase 55 BLOCKED.md items 8 (build-time checks never run, no macOS host) and 9 (no Darwin rust-std in the firefox-macos shell; owner chooses a route); repro: scripts/verify-platform.sh --only macos-package-payload; source: 68-06 Task 3, PLAT-01, D-24",
    "status": "open",
    "reason": "Re-dated to next version (Phase 59 D-09); D-40 (2026-11-15): deferred to the next version; v1.7 ships Linux only",
    "recorded_at": "2026-11-11T21:07:34.010Z",
    "resolved_at": null
  },
  {
    "id": 49,
    "kind": "unrun-verify",
    "phase": "68",
    "file": "powerbrowser/packaging/package-macos.sh",
    "line": null,
    "description": "macOS smoke test of a build with Orca not run: needs a Mac and a macOS artifact (D-24: macOS gets a smoke test when a host exists); steps: install the artifact, start PowerBrowser, open Orca mode, confirm orcad runs from <GreD>/orca on the staged Node and a quit leaves no orcad; source: 68-06 Task 3, PLAT-02, D-24",
    "status": "open",
    "reason": "Re-dated to next version (Phase 59 D-09); D-40 (2026-11-15): deferred to the next version; v1.7 ships Linux only",
    "recorded_at": "2026-11-11T21:07:34.116Z",
    "resolved_at": null
  },
  {
    "id": 50,
    "kind": "unrun-verify",
    "phase": "68",
    "file": "powerbrowser/packaging/package-windows.sh",
    "line": null,
    "description": "Windows smoke test of a build with Orca not run: needs the Windows 11 VM (CF-10, OWNER-PASS section 11) and a windows-orca plus build-windows artifact from a release.yml dispatch; the Windows staging and admission order are proven only by build-windows-shape on this host; steps: install, start, open Orca mode, confirm orcad runs from <GreD>/orca on node/node.exe and a quit leaves no orcad; source: 68-06 Task 3, PLAT-02, D-24, CF-10",
    "status": "open",
    "reason": "Re-dated to next version (Phase 59 D-09); D-40 (2026-11-15): deferred to the next version; v1.7 ships Linux only",
    "recorded_at": "2026-11-11T21:07:34.218Z",
    "resolved_at": null
  },
  {
    "id": 51,
    "kind": "unrun-verify",
    "phase": "68",
    "file": "orca-overlay/seams.json",
    "line": null,
    "description": "Upstream issue and PR for the browser-provider seam (010-installed-electron-switch) not opened: owner opens the issue on Orca's repository with .mozbuild/orca-upstream/browser-provider/issue.md, then the PR from a fork with seam.patch and pr.md, and records the PR URL in seam 010's upstream.pr (68-05-SUMMARY.md Owner hand-off; regenerate the export first, Orca main moves daily); the fork and org are the owner's choice; repro: scripts/verify-platform.sh --only orca-upstream-prs; source: 68-05, OVL-06, D-27",
    "status": "open",
    "reason": "Re-dated to next version (Phase 59 D-09)",
    "recorded_at": "2026-11-11T21:07:34.323Z",
    "resolved_at": null
  },
  {
    "id": 52,
    "kind": "deviation",
    "phase": "68",
    "file": "orca-overlay/seams.json",
    "line": null,
    "description": "web-entry upstream export refused: node scripts/export-orca-seam-pr.mjs --class web-entry exits 2 with 'no seam of class web-entry (classes present: browser-provider, pb-only)' because Phase 64 hosts Orca panes through overlay files only and added no seam; orca-upstream-prs therefore stays red naming web-entry until the owner rules the class out (as D-31 did for the terminal provider, then the check's PR_CLASSES change under that ruling) or a later phase adds a web-entry seam in Phase 64's files; repro: node scripts/verify-orca-overlay.mjs --upstream-prs; source: 68-05, D-27",
    "status": "fixed",
    "reason": "Fixed by owner ruling 2026-11-15 (DECISIONS.md D-45): the web-entry class is ruled out for v1.7, as D-31 did for the terminal provider; scripts/verify-orca-overlay.mjs drops it from UPSTREAM_CLASSES and PR_CLASSES, so orca-upstream-prs names only browser-provider (WINDOWS 51)",
    "recorded_at": "2026-11-11T21:07:34.430Z",
    "resolved_at": "2026-11-15T17:06:38.725Z"
  },
  {
    "id": 53,
    "kind": "unmet-truth",
    "phase": "68",
    "file": "theia/extensions/orca-agents/src/node/claude-wrapper-launcher.ts",
    "line": null,
    "description": "The claude-wrapper launcher writes only a POSIX sh script (#!/bin/sh), so an agent launched through PowerBrowser's wrapper on Windows has no launcher; no Phase 68 lane landed a Windows twin (.cmd or a node shim); repro: grep -n '#!/bin/sh' theia/extensions/orca-agents/src/node/claude-wrapper-launcher.ts; source: lane p63-03, 68-06 Task 3, TERM-02/EXT-02",
    "status": "open",
    "reason": "Re-dated to next version (Phase 59 D-09); Held 2026-11-13 (owner ruling): a .cmd launcher (branch worktree-agent-a82bf5f2c523276a9, 5b84e185) was not merged: cmd.exe re-parses %* (BatBadBut), and Node refuses to spawn a .cmd without a shell since CVE-2024-27980; needs a launcher that bypasses cmd.exe (e.g. an .exe shim), tested on the first Windows build; D-40 (2026-11-15): deferred to the next version; v1.7 ships Linux only",
    "recorded_at": "2026-11-11T21:07:34.542Z",
    "resolved_at": null
  },
  {
    "id": 54,
    "kind": "deviation",
    "phase": "68",
    "file": "scripts/lib/firefox-bidi.mjs",
    "line": null,
    "description": "Packaged live rows that end PowerBrowser with the harness's SIGTERM/SIGKILL instead of a quit leave the packaged OrcaService's orcad running from the deleted extraction root (/tmp/pb-pkg-*) once the package starts Orca (after fix 21898a67); observed after ng063-packaged-launch on 2026-11-11 and stopped by pid in 68-06; orca-packaged-live now stops its own (a625378d); the shared teardown (withFirefoxPage) or each packaged row should stop orcad by recorded identity; repro: run scripts/verify-platform.sh --only ng063-packaged-launch with POWERBROWSER_OBJDIR set to a packaged objdir, then list processes whose arguments name /tmp/pb-pkg-; source: 68-06 Task 2",
    "status": "fixed",
    "reason": "Re-dated to next version (Phase 59 D-09); Fixed in 0ea32a1a (withFirefoxPage stops the orcad a packaged run started, by recorded identity); confirmed live 2026-11-18 on a dev-objdir package rebuilt that day: ng063-packaged-launch and orca-packaged-live both PASS alone and no process naming /tmp/pb-pkg- remained after either. orca-packaged-live had launched the dev objdir binary since 0ea32a1a (a static import of lib/firefox-bidi.mjs fixed the binary before PB_FIREFOX_BIN was set); fixed in dc08c717",
    "recorded_at": "2026-11-11T21:07:34.646Z",
    "resolved_at": "2026-11-18T23:40:37.135Z"
  },
  {
    "id": 55,
    "kind": "unmet-truth",
    "phase": "68",
    "file": "scripts/verify-orca-tabs-live.mjs",
    "line": null,
    "description": "orca-tabs-live stage tab-groups-cross-client (g3) red in the 68-06 PLAT-02 Linux pass (2026-11-11), as on every tree since Phase 64/65 (TAB-04 pending): 'the second client shows no tab for T (web-terminal-...)'; not caused by Phase 68 code; owner of the stage: Phase 64 (TAB-04), end-of-milestone pass; repro: flock /home/chris/coding/Power-Browser/.git/pb-live.lock scripts/verify-platform.sh --only orca-tabs-live with ORCA_* unset; source: 68-06 Task 2, 64-06-SUMMARY.md",
    "status": "fixed",
    "reason": "Fixed in 2ce581f2 and 3ad91d13 (scripts/verify-orca-tabs-live.mjs only). Root cause was the check, not the product. (1) Orca's stock web client at the pin stops applying host tab updates after it opens the worktree (the upstream echo bug in 64-MIRROR-FREEZE.md), so the check now reloads the second client once the tab exists. (2) crossClientVerdict compared tab-bar peers without the dropped-pane filter reloadVerdict already used. Four consecutive live runs green on 2026-11-16; orca-tabs-live-self-test PASS with 57 plants. Residual: a stock Orca web client does not show tabs created after it opened the worktree until it is reloaded; that is the upstream Orca bug, still open.",
    "recorded_at": "2026-11-11T21:37:37.789Z",
    "resolved_at": "2026-11-16T16:00:00.000Z"
  },
  {
    "id": 56,
    "kind": "deviation",
    "phase": "59",
    "file": "scripts/verify-pan03-strip-group-live.mjs",
    "line": null,
    "description": "pan03-strip-group-live clause (f) flaky: passed 1 of 3 runs on fca5bcac/4aeac713 (2026-11-13); after the relaunch the strip is read before a restored tab's title loads, so that tab paints as 'New Tab' or its bare URL instead of 'page l'; the check should wait for the restored tab's title; repro: flock /home/chris/coding/Power-Browser/.git/pb-live.lock scripts/verify-platform.sh --only pan03-strip-group-live with PB_LIVE_LOCK_HELD=1 and ORCA_* unset; source: v1.7 gate run 2026-11-13",
    "status": "fixed",
    "reason": "Fixed in 740dcd8f (supersedes the title wait in 417dbe61, which went 1 of 5: a restored background tab is not loaded after the relaunch, so it keeps its URL or 'New Tab' label and never regains 'page l'). Clause (f) now compares the painted data-pb-tab ids with the derived widgets and checks B's tab by its key, so labels no longer matter. 9 of 10 runs green on the fixed tree (4 of 5, then 5 of 5); the one red ended in 6 s, before any clause ran, and its output was not kept.",
    "recorded_at": "2026-11-13T09:30:00.000Z",
    "resolved_at": "2026-11-14T01:40:00.000Z"
  },
  {
    "id": 57,
    "kind": "deviation",
    "phase": "59",
    "file": "scripts/verify-ng-018-scheduled-integrity-check.mjs",
    "line": null,
    "description": "ng-018-scheduled-integrity-check flaky: red once in the v1.7 gate run at d55a380b (2026-11-13, 'the store rebuilt after the scheduled check is not at the head'), green in 3 other runs that day (2 of them alone right after); repro: flock /home/chris/coding/Power-Browser/.git/pb-live.lock scripts/verify-platform.sh --only ng-018-scheduled-integrity-check with PB_LIVE_LOCK_HELD=1 and ORCA_* unset; source: v1.7 gate run 2026-11-13",
    "status": "fixed",
    "reason": "Fixed in 417dbe61. Race in the check, not the product: quarantineAndRebuildTabStore (powerbrowser/shell/PowerBrowserAPI.sys.mjs, the backup to corruptPath before IOUtils.remove and migrateTabStoreToHead) writes .corrupt-1 before it migrates the new store, and the check tore the shell down as soon as .corrupt-1 appeared; a store cut off mid-rebuild is migrated by the next launch (NG-085). The check now waits up to 30 s for the rebuilt store to reach the head before the teardown. 5 of 5 runs green. The check file is ledger-locked; the owner must re-lock its hash.",
    "recorded_at": "2026-11-13T19:30:00.000Z",
    "resolved_at": "2026-11-14T01:40:00.000Z"
  },
  {
    "id": 58,
    "kind": "deviation",
    "phase": "63",
    "file": "scripts/verify-orca-agent-status-live.mjs",
    "line": null,
    "description": "orca-agent-status-live flaky: red once in the v1.7 gate run at d55a380b (2026-11-13, 4 h into the run): the agent process and the terminal daemon were still alive 25 s after app.quit(); green in 3 other runs that day (2 alone right after). The quit-ends-agents rule (D-03) held in those runs; whether a slow shutdown under load can outlive the 25 s budget is open; repro: flock /home/chris/coding/Power-Browser/.git/pb-live.lock scripts/verify-platform.sh --only orca-agent-status-live with PB_LIVE_LOCK_HELD=1 and ORCA_* unset; source: v1.7 gate run 2026-11-13",
    "status": "fixed",
    "reason": "Fixed in 417dbe61 and ad9a1939. Second root cause (red again in the full gate at 1edc97d6, 2026-11-14): the quit blocker was never registered. PowerBrowserAPI.addNamedReapBlocker (and addSidecarReapBlocker) called AsyncShutdown.quitApplicationGranted.addBlocker; the pinned upstream/toolkit/components/asyncshutdown/AsyncShutdown.sys.mjs:1121-1134 defines no such phase, so the call threw inside OrcaService.start()'s try and every launch logged 'Reap blocker not registered: ... AsyncShutdown.quitApplicationGranted is undefined'. Only the quit-application-granted observer started stop(); nothing held the quit, and an instrumented run showed Gecko exiting 230 ms into _endDaemon's wait for the terminal daemon, so a daemon slow on SIGTERM under load, and its agent, outlived the browser. 417dbe61's overrun kill lives in stopAndReap and never ran. Both blockers now register on AsyncShutdown.appShutdownConfirmed (quit-application, raised by quit and eRestart); instrumented, the quit returns only after the daemon step. verify-orca-service scenario N runs the real addNamedReapBlocker against the phases parsed from upstream (plant: the old phase name, self-test 44 of 44); sidecar-reap-blocker derives the same set instead of hand-keeping the name. orca-agent-status-live 15 of 15 green after the fix (5 alone, 10 beside 1 to 4 parallel --quick loops, load average up to 5.5); negative control with the old phase under the same load: 1 of 4 red with the gate's exact two 'survived quit' lines. The 25 s budget is unchanged.",
    "recorded_at": "2026-11-13T19:30:00.000Z",
    "resolved_at": "2026-11-14T21:45:00.000Z"
  },
  {
    "id": 59,
    "kind": "deviation",
    "phase": "68",
    "file": "powerbrowser/shell/PowerBrowserAPI.sys.mjs",
    "line": null,
    "description": "ext-tab-host-live options-page-switch red in the v1.7 gate of 2026-11-16 (3 of 15 runs alone): stockWindowStarted's 50 ms poll of gBrowserInit.delayedStartupFinished let a second openOptionsPage reach the started window before the deferred select, so the options page loaded into the empty initial tab and the select added a second options tab; source: v1.7 gate run 2026-11-16",
    "status": "fixed",
    "reason": "Fixed in 0b1ff185 (stockWindowStarted also races the window's delayedStartupPromise, resolved beside the flag, so the select runs before any second call can land) and 3824e0c4 (WR-07 accepts the module sleep inside the race; a new leg requires the race on win.delayedStartupPromise). Product race, 3 of 15 red alone before.",
    "recorded_at": "2026-11-17T22:54:27.933Z",
    "resolved_at": "2026-11-17T22:54:29.100Z"
  },
  {
    "id": 60,
    "kind": "deviation",
    "phase": "68",
    "file": "scripts/lib/firefox-bidi.mjs",
    "line": null,
    "description": "tel06-error-delivery-live leaked its orcad: the harness ends PowerBrowser with SIGTERM, no quit blocker runs, and orcad plus its terminal daemon and scope watcher stayed alive holding port 26768 for four hours, which masked later rows in the earlier v1.7 gate runs; source: v1.7 gate run 2026-11-16",
    "status": "fixed",
    "reason": "Fixed in ed0ecc33 (withFirefoxPage stops the orcad a dev-objdir run leaves behind, matched by its working folder under the run's profile), 9fd3891c (verify-platform leak leg: a script row that leaves orcad running in its own session goes red and the orcad is stopped; scripts/verify-orcad-leak.mjs) and 8d1db795 (keepStrays opt-out for orca-service-live, whose orphan must survive to the product's reap). The SIGTERM behaviour of the product itself is entry 65.",
    "recorded_at": "2026-11-17T22:54:28.056Z",
    "resolved_at": "2026-11-17T22:54:29.225Z"
  },
  {
    "id": 61,
    "kind": "deviation",
    "phase": "68",
    "file": "scripts/verify-first-boot-surface.mjs",
    "line": null,
    "description": "first-boot-surface-fresh recorded 169 modulepreload error events at every first boot (5 of 5 runs alone): the Orca pane bundle emitted modulepreload links for modules the entry had already imported and Gecko fires an error event on such a link; no user-visible effect; source: v1.7 gate run 2 at 2788eb05 (2026-11-17)",
    "status": "fixed",
    "reason": "Fixed in 41229f23 (the pane bundle emits no modulepreload links). 5 of 5 runs alone were red before.",
    "recorded_at": "2026-11-17T22:54:28.186Z",
    "resolved_at": "2026-11-17T22:54:29.356Z"
  },
  {
    "id": 62,
    "kind": "unmet-truth",
    "phase": "64",
    "file": "theia/extensions/orca-panes",
    "line": null,
    "description": "Orca's document-wide primary-selection paste hook (usePrimarySelectionPaste, mounted by the pane services root) cancelled the native middle-click paste into every Theia text field and pasted Orca's own captured selection instead; found by the v1.7 gate (tab-strip-live red) and masked at 4a7308ba by the leaked orcad of the earlier entry; source: v1.7 gate run 2 at 2788eb05 (2026-11-17)",
    "status": "fixed",
    "reason": "Fixed in e50bd945 (the services root calls useHostedAppShellServices, whose usePanePrimarySelectionPaste acts only on targets inside [data-pb-orca-pane-root]; owner ruling \"Limit the hook to Orca panes\", D-54), with a772ea83 and 57fed2a0 (checks) and e324130a (debug record).",
    "recorded_at": "2026-11-17T22:54:28.325Z",
    "resolved_at": "2026-11-17T22:54:29.489Z"
  },
  {
    "id": 63,
    "kind": "unmet-truth",
    "phase": "64",
    "file": "theia/extensions/orca-panes",
    "line": null,
    "description": "Orca's large-paste takeover (useLargeTextControlPaste: claimed every paste over 64 KiB into any Theia input or editor and dropped Gecko's newline handling) and its beforeunload checkpoint (cancelled the unload when Orca's checkpoint threw, which held PowerBrowser's quit veto and a Theia reload) acted on the Theia document; found by the owner-ruled test of Orca's app-wide listeners (2026-11-17); source: .planning/debug/orca-selection-preset-and-app-listeners.md",
    "status": "fixed",
    "reason": "Fixed in 8d2530b2 (usePaneLargeTextControlPaste claims a paste over 64 KiB only inside a hosted pane root; useHostedAppSessionPersistence runs Orca's checkpoint at every unload and only reports a failure) with live legs in 45eca9fb and 21cfdc81 and the record in 6729ce22 and 0232b5a7 (D-56). The workspace-activation focus helper was tested and does not take focus from Theia UI.",
    "recorded_at": "2026-11-17T22:54:28.459Z",
    "resolved_at": "2026-11-17T22:54:29.617Z"
  },
  {
    "id": 64,
    "kind": "deviation",
    "phase": "68",
    "file": "scripts/verify-orca-mobile-protocol.mjs",
    "line": null,
    "description": "orca-mobile-skew did not find the stock app's protocol constants at mobile-android-v0.0.65: the app moved them to a transport/connection layout and the check read only the old path; source: v1.7 gate run 1 at 4a7308ba (2026-11-16)",
    "status": "fixed",
    "reason": "Fixed in f4dd366b (the check finds the stock app's protocol constants at the transport/connection layout as well as the old one). Verdict at v0.0.65 against pin v1.4.248: ok.",
    "recorded_at": "2026-11-17T22:54:28.594Z",
    "resolved_at": "2026-11-17T22:54:29.746Z"
  },
  {
    "id": 65,
    "kind": "deviation",
    "phase": "68",
    "file": "powerbrowser/shell/OrcaService.sys.mjs",
    "line": null,
    "description": "PowerBrowser ended by SIGTERM exits within about 50 ms without running a quit blocker, so OrcaService does not stop its orcad, terminal daemon or scope watcher; OrcaService reaps a leftover only at the next launch of the same profile; not investigated, the live harness now stops them itself (ed0ecc33); owner ruling needed on whether to debug it in v1.7; source: v1.7 gate 2026-11-16",
    "status": "open",
    "reason": "Re-dated to next version (Phase 59 D-09)",
    "recorded_at": "2026-11-17T22:54:28.720Z",
    "resolved_at": null
  },
  {
    "id": 66,
    "kind": "unmet-truth",
    "phase": "64",
    "file": "theia/extensions/orca-panes",
    "line": null,
    "description": "A hosted Orca terminal focuses itself when it is first shown (TerminalPane createInitialPane/setActivePane, its own mount; PowerBrowser mounts every hosted terminal with isActive) and can take typing from a visible Theia editor; owner decision pending; source: .planning/debug/orca-selection-preset-and-app-listeners.md",
    "status": "fixed",
    "reason": "Fixed in 7d730b00 (mountPane takes the hosting widget's activity, ApplicationShell's active widget, and the entry passes it as TerminalPane's isActive and NativeChatView's isFocusedGroup, so a hosted Orca terminal or chat takes focus only while its tab is Theia's active widget; owner ruling \"Fix now\", D-57) and c05cb098 (orca-terminal-keys-live 2d: keys typed in a Theia editor stay in the editor while a CLI-created or restored terminal is shown beside it, and a tab click or New Orca Terminal gives the terminal focus). Hosted chats got the same gate. Orca's settings and tasks pages were not checked for first-show focus. A control bundle with the old hard-wired value is red in the new legs; the fixed bundle is green 5 of 5.",
    "recorded_at": "2026-11-17T22:54:28.845Z",
    "resolved_at": "2026-11-18T04:48:58.016Z"
  },
  {
    "id": 67,
    "kind": "unmet-truth",
    "phase": "64",
    "file": "orca-overlay/seams.json",
    "line": null,
    "description": "Upstream Orca bug: a stock Orca web client stops applying host tab updates after it opens the worktree, so tabs created later show only after a reload; the TAB-04 check (orca-tabs-live g3) reloads its second client to work around it; source: .planning/workstreams/orca/phases/64-orca-panes-as-powerbrowser-tabs/64-MIRROR-FREEZE.md",
    "status": "open",
    "reason": "Re-dated to next version (Phase 59 D-09)",
    "recorded_at": "2026-11-17T22:54:28.973Z",
    "resolved_at": null
  },
  {
    "id": 68,
    "kind": "unmet-truth",
    "phase": "64",
    "file": "theia/extensions/orca-panes",
    "line": null,
    "description": "The user's Middle-click Paste from Selection choice did not survive a restart: PowerBrowser's Linux preset (D-55) was held in memory and Orca keeps its own value in the Theia page's browser storage, whose origin is new at every launch (the sidecar listens on a fresh port), so a user who switched it off found it on again after every restart; source: .planning/debug/orca-first-show-focus-and-paste-choice.md (dc57d058); not covered by entries 62 and 63, which are about where Orca's hooks act, not what is remembered",
    "status": "fixed",
    "reason": "Fixed in 7d730b00 (OrcaPaneBundle reads powerbrowser.orca.primarySelectionPaste from ProfileStorageService before bootstrap, the settings.set observer writes the user's value there, and the Linux preset is that value, else on; owner ruling \"Remember my 'off'\", D-58), c05cb098 (orca-relaunch-restore-live paste-choice leg: off set in launch 1 reads off after the relaunch) and dc57d058 (investigation record). The record stores the chosen value, on or off, because Orca's own copy lives in per-launch browser storage. A control bundle that never writes the record is red; the fixed bundle is green 5 of 5.",
    "recorded_at": "2026-11-18T04:48:57.872Z",
    "resolved_at": "2026-11-18T04:48:58.016Z"
  },
  {
    "id": 69,
    "kind": "unrun-verify",
    "phase": "68",
    "file": "scripts/verify-platform.sh",
    "line": null,
    "description": "Two gate rows need the owner's desktop or sign-in and failed unattended in v1.7 gate run 4 at 080814fd (2026-11-17), and again when re-run alone: orca-tabs-live refuses when the Claude sign-in is under 60 minutes from expiry (the CR-02 safeguard, b12906fc; 38 minutes in the gate) and real-input-gate-self-test fails when another window is focused or the screen is locked (its clean control capture wrote no file). orca-agent-status-live has the same sign-in dependency but prints SKIP and is counted PASS when the sign-in is under 60 minutes from expiry (44 minutes in gate run 4, log line about 9968), so TERM-02's real-agent leg did not run in that gate. None of the three is a product red. They are re-run, not excluded, and have no GATE_KNOWN_OPEN_EXCLUSIONS row: run claude once to refresh the sign-in, then scripts/verify-platform.sh --only orca-tabs-live and --only orca-agent-status-live (it must print PASS, not SKIP); run scripts/verify-platform.sh --only real-input-gate-self-test with the desktop unlocked and no other window taking focus; source: v1.7 gate run 4",
    "status": "open",
    "reason": "Re-run alone 2026-11-18 on the owner's refreshed sign-in and unlocked desktop: orca-tabs-live PASS (16 legs), orca-agent-status-live PASS (a real agent, not SKIP), real-input-gate-self-test PASS. In gate run 5 the same day (da97a4e9) orca-tabs-live PASS, orca-agent-status-live SKIP (sign-in 5 min from expiry) and real-input-gate-self-test FAIL (no clean capture); so the gate still exits 1 on real-input-gate-self-test and TERM-02's real-agent leg rests on the alone run",
    "recorded_at": "2026-11-18T04:48:58.016Z",
    "resolved_at": null
  },
  {
    "id": 70,
    "kind": "unrun-verify",
    "phase": "68",
    "file": "scripts/verify-descriptor-monotonic.mjs",
    "line": null,
    "description": "descriptor-monotonic prints SKIP: no published Release and no candidate descriptor exist, so no offered buildID is compared; it runs with the first release; owner date: next version (D-63, Chris 2026-11-23); source: gate run 6",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-11-24T07:01:08.941Z",
    "resolved_at": null
  },
  {
    "id": 71,
    "kind": "unrun-verify",
    "phase": "67",
    "file": "scripts/verify-orca-failure-page-live.mjs",
    "line": null,
    "description": "orca-failure-page-live induction 3 (auth refusal through a revoked device, A-7) cannot be induced: the hosted client pairs session-only on the offer's own token, so the registry holds no separate device row to revoke (rows removed: 0); headless orcad has no way to revoke the offer's row (audit pairing-credentials-04). Every other induction runs; owner date: next version (D-63, Chris 2026-11-23); source: gate run 6",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-11-24T07:01:09.062Z",
    "resolved_at": "2026-11-24T12:21:49.992Z"
  },
  {
    "id": 72,
    "kind": "deviation",
    "phase": "59",
    "file": "powerbrowser/shell/PowerBrowserAPI.sys.mjs",
    "line": null,
    "description": "PowerBrowser's main process ended once with SIGSEGV during ng-011-settings-table-read in gate run 6 (2026-11-23 15:15:39, pid 3963875), 49 s after its launch; no core was kept. Not reproduced: 6 of 6 and 50 of 50 runs alone with core dumps on passed. Repro: scripts/verify-platform.sh --only ng-011-settings-table-read; owner date: next version (D-63, Chris 2026-11-23); source: gate run 6",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-11-24T07:01:09.184Z",
    "resolved_at": null
  },
  {
    "id": 73,
    "kind": "deviation",
    "phase": "64",
    "file": "scripts/verify-orca-tabs-live.mjs",
    "line": null,
    "description": "Orca drops a check-details and a simulator tab on a Theia reload at the pin: saved-editor-tab-restore.ts never saves a check-details document; the simulator drop was observed in every run and its line is not found. orca-tabs-live no longer requires those two kinds to come back (ORCA_TRANSIENT_KINDS); every other kind must; owner date: next version (D-63, Chris 2026-11-23); source: gate run 6 and five runs alone",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-11-24T07:01:09.306Z",
    "resolved_at": null
  },
  {
    "id": 74,
    "kind": "deviation",
    "phase": "65",
    "file": "orca-overlay/seams.json",
    "line": null,
    "description": "Orca's 'Use website favicon' control for a repository stays after D-62 but its icon is never loaded, so the fallback icon shows; Orca's phone bundle (out/mobile-web) still forms the favicon address; owner date: next version (D-63, Chris 2026-11-23); source: D-62, D-63 (14)",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-11-24T07:01:09.428Z",
    "resolved_at": null
  },
  {
    "id": 75,
    "kind": "unmet-truth",
    "phase": "66",
    "file": "orca-overlay/seams.json",
    "line": null,
    "description": "Orca's bundle runs in the Theia document's realm: no separate origin, frame or CSP (audit chrome-actor-03, sidecar-gate-backends-01, T-66-04; agent-browser-04 settles with it); owner date: next version (D-63, Chris 2026-11-23); source: v1.7 audit decision 3",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-11-24T07:01:09.547Z",
    "resolved_at": null
  },
  {
    "id": 76,
    "kind": "unmet-truth",
    "phase": "67",
    "file": "orca-overlay/seams.json",
    "line": null,
    "description": "headless orcad cannot revoke or rotate the token row an earlier pairing offer named (audit pairing-credentials-04); owner date: next version (D-63, Chris 2026-11-23); source: v1.7 audit decision 4",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-11-24T07:01:09.665Z",
    "resolved_at": null
  },
  {
    "id": 77,
    "kind": "unmet-truth",
    "phase": "66",
    "file": "powerbrowser/shell/PowerBrowserAPI.sys.mjs",
    "line": null,
    "description": "one shared agent container: no per-worktree container, no clearing at launch, no notice that agent sign-ins are kept and shared (audit agent-browser-03, chrome-actor-04); owner date: next version (D-63, Chris 2026-11-23); source: v1.7 audit decision 13",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-11-24T07:01:09.793Z",
    "resolved_at": null
  },
  {
    "id": 78,
    "kind": "unmet-truth",
    "phase": "66",
    "file": "powerbrowser/shell/PowerBrowserAPI.sys.mjs",
    "line": null,
    "description": "loopback wall residuals: DNS rebinding between lookup and connect, no user-confirmed LAN allow list, WebRTC and WebTransport unseen (audit agent-browser-06); owner date: next version (D-63, Chris 2026-11-23); source: v1.7 audit decision 14",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-11-24T07:01:09.912Z",
    "resolved_at": null
  },
  {
    "id": 79,
    "kind": "unmet-truth",
    "phase": "68",
    "file": "powerbrowser/packaging/bundled-xpi.json",
    "line": null,
    "description": "uBlock Origin gets no automatic updates (audit packaging-prefs-network-06) and the agent-browser binary's statically linked crate notices ship nowhere (packaging-prefs-network-05); owner date: next version (D-63, Chris 2026-11-23); source: v1.7 audit decision 6",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-11-24T07:01:10.030Z",
    "resolved_at": null
  },
  {
    "id": 80,
    "kind": "unmet-truth",
    "phase": "62",
    "file": "powerbrowser/shell/OrcaService.sys.mjs",
    "line": null,
    "description": "no fallback port when orcad's fixed port is busy; the diagnostics row naming the holder exists (audit orcad-hosting-03, P62-16); owner date: next version (D-63, Chris 2026-11-23); source: v1.7 audit decision 15",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-11-24T07:01:10.151Z",
    "resolved_at": null
  },
  {
    "id": 81,
    "kind": "unmet-truth",
    "phase": "68",
    "file": ".github/workflows/release.yml",
    "line": null,
    "description": "Orca's build and two launching rows run in the self-hosted runner's host shell (audit ci-supply-chain-02); two routes are held on audit-fix-held/ci-supply-chain-02 and -container, decided with the first release; owner date: next version (D-63, Chris 2026-11-23); source: v1.7 audit decision 1",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-11-24T07:01:10.275Z",
    "resolved_at": null
  },
  {
    "id": 82,
    "kind": "unmet-truth",
    "phase": "59",
    "file": "theia/yarn.lock",
    "line": null,
    "description": "Dependabot advisories left after the in-range updates: simple-git 3.36.0 and @simple-git/argv-parser (from @theia/ai-ide; fix is a major bump), decompress 4.2.1 (no fix; from @theia/cli, @theia/plugin-ext and @theia/plugin-ext-vscode, which unpack extension archives), dompurify 3.2.7 (exact pin), and others fixable only by a major bump. Whether PowerBrowser reaches the affected code is not established; owner date: next version (D-63, Chris 2026-11-23); source: D-63 (12)",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-11-24T07:01:10.393Z",
    "resolved_at": null
  }
]
````
