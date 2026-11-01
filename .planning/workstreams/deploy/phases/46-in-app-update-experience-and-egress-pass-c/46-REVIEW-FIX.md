---
phase: 46-in-app-update-experience-and-egress-pass-c
fixed_at: 2026-10-25T00:00:00Z
review_path: .planning/workstreams/deploy/phases/46-in-app-update-experience-and-egress-pass-c/46-REVIEW.md
iteration: 1
findings_in_scope: 15
fixed: 15
skipped: 0
status: partial
---

# Phase 46: Code Review Fix Report

**Fixed at:** 2026-10-25
**Source review:** .planning/workstreams/deploy/phases/46-in-app-update-experience-and-egress-pass-c/46-REVIEW.md
**Branch:** dsh/phase-46 (base workspace/deploy), worked in the clone /home/chris/gsd-workspaces/deploy/dsh/phase-46 (no separate worktree)
**Iteration:** 1

**Summary:**
- Findings in scope: 15 (CR-01..CR-06, WR-01..WR-09)
- Fixed: 15 (two of them, WR-05 and WR-06, share one commit)
- Skipped: 0
- Status is `partial` because WR-08 binds the transcript to a capture but the hop drive that produces the capture is still not in the tree (see WR-08 below and 46-VERIFICATION.md G2).

Info findings (IN-01..IN-03) are outside the requested scope and were not addressed, except that IN-02 (the replacer function) landed incidentally in the CR-02/WR-05 edits to the ready-string render.

## Fixed Issues

### CR-01: Update observer is never registered; no appUpdate push is ever sent
**Files modified:** `powerbrowser/shell/TheiaService.sys.mjs`, `scripts/verify-update-observer-wired.mjs` (new), `scripts/verify-platform.sh`
**Commits:** `3dc18bf` (verifier row), `e49f44e` (wiring and registry)
**Applied fix:** `_swap()` starts `PowerBrowserAPI.startUpdateObserver(this._browserElement)` and stores the stop function; `stop()` invokes it. The derived row `update-observer-wired` requires a call site outside the definition and an invoked stop field; its self-test plants a removed call site, a dropped stop call, and a definer-only tree. Note: `3dc18bf` alone leaves the row red until `e49f44e` lands; both were committed on the same branch.

### CR-02: Startup seed compares a numeric currentState to strings
**Files modified:** `powerbrowser/shell/PowerBrowserAPI.sys.mjs`, `powerbrowser/INTERNAL-APIS.md`, `scripts/verify-update-state-contract.mjs` (new), `scripts/verify-platform.sh`
**Commit:** `bdf8c9a`
**Applied fix:** `readUpdateState` compares `currentState` to `Ci.nsIApplicationUpdateService.STATE_PENDING` (value 5 in `upstream/toolkit/mozapps/update/nsIUpdateService.idl`) and returns `pending` or `idle`. The catalogue row is added. `update-state-contract` derives the STATE_* names from the IDL and fails on any string or bare-number compare or a misspelled constant (three plants).
**Deviation:** the review suggested a client self-test fed a numeric state. The boundary maps the number, so the client only ever receives the contract string; the state row covers the comparison instead.

### CR-03: Version read on the pull path is always empty
**Files modified:** `powerbrowser/shell/PowerBrowserAPI.sys.mjs`, `powerbrowser/INTERNAL-APIS.md`, `scripts/verify-update-state-contract.mjs`
**Commit:** `5569ca6`
**Applied fix:** `readyUpdate()` reads `nsIUpdateManager.getReadyUpdate()`; `readUpdateState` is async and refuses a pending state with no version (`{ ok:false }`), so no version-less prompt renders. The update-state row fails on any `svc.readyUpdate` read and on a missing `getReadyUpdate()` (two more plants).

### CR-04: Nimbus probe row can never pass
**Files modified:** `scripts/verify-nimbus-exposure.mjs`
**Commit:** `7603123`
**Applied fix:** the full row drives the two UpdateListener paths (available, manual) in the shell's chrome document through the existing `scripts/lib/pb-relaunch.mjs` harness (`withShell`, `runCheck`), with `MOZ_LOG=nsHostResolver:5`. The resolver capture is byte-bounded to the probe window. The unconditional failure is removed: the row fails only when no built browser exists, a path does not return, or the window contacts a host. Verified live on this host: PASS in 11 seconds against `objdir/dist/bin/powerbrowser` (both paths returned, empty window). The quick self-test has seven plants.

### CR-05: Quick commit gate is red (`yarn check --integrity`)
**Files modified:** none tracked. The fix is environmental: `yarn install --ignore-scripts --offline` inside `nix develop .#theia` in `theia/`.
**Commit:** none (no tracked change)
**Applied fix:** the installed `node_modules` did not match the manifests after the `@powerbrowser/branding` dependency was added. The offline reinstall brought `yarn check --integrity --ignore-scripts` to "Folder in sync". `theia/yarn.lock` did not change: workspace packages are not recorded in the lockfile, so there was nothing to regenerate. Reported here instead of hand-editing yarn.lock. The `gui07-strip-spike-verdict` and `gui07-strip-spike-verdict-self-test` rows pass in the final quick run.
**Note:** the failure text on this tree was "Top level patterns don't match" (the review's wording), reproduced exactly with the script's `--ignore-scripts` flag.

### CR-06: "Check again at most once per session" resets on acceptance
**Files modified:** `theia/extensions/tab-uris/src/browser/update-client.ts`, `scripts/verify-update-copy.mjs`
**Commit:** `4f1fb12`
**Applied fix:** `checkForUpdates` no longer touches the flag. `onAppUpdatePush` clears it only for a completed-check status (`available`, `ready`, `cant-apply`); the zero-argument reset stub is removed. The update-copy row drives the real client (transpiled from the tree, Theia imports stubbed) through the push path: prompts must be 1, 1, 2. Two planted faults go red naming the prompt count.
**Status:** fixed: requires human verification (flag transition logic; the live single-prompt behaviour is in 46-VERIFICATION H1 step 6).

### WR-01: "Restart to Update" restarts with no update staged
**Files modified:** `powerbrowser/shell/PowerBrowserAPI.sys.mjs`, `theia/extensions/tab-uris/src/browser/update-client.ts`, `theia/extensions/branding/src/browser/powerbrowser-update-copy.ts`
**Commit:** `56eb5ad`
**Applied fix:** the shell checks `readyUpdate()` before announcing the restart and returns `reason: "not-staged"` otherwise, never quitting. The client shows the plain-copy refusal (`restartNothingStagedBody`) with a Check now button. The restart-unavailable warning now carries a Try again button.
**Status:** fixed: requires human verification (the refusal path needs a live frame). No row exercises the shell refusal itself.

### WR-02: `checkForBackgroundUpdates()` result discarded
**Files modified:** `powerbrowser/shell/PowerBrowserAPI.sys.mjs`, `theia/extensions/tab-uris/src/browser/update-client.ts`, `theia/extensions/branding/src/browser/powerbrowser-update-copy.ts`
**Commit:** `452c52a`
**Applied fix:** `return (await svc.checkForBackgroundUpdates()) === true;`. A false answer returns `reason: "not-started"`. The client shows the `checkNotStartedBody` notice with a Try again button, so the user gets feedback instead of a silent accept.

### WR-03: Status-bar item and "Open download page" are dead affordances
**Files modified:** `theia/extensions/tab-uris/src/browser/update-client.ts`, `theia/extensions/branding/src/browser/powerbrowser-update-copy.ts`, `scripts/verify-update-copy.mjs`
**Commit:** `fecc55d`
**Applied fix:** the status-bar entry carries the command `powerbrowser.update.showReady`, which re-opens the ready prompt with the version it last showed. "Open download page" executes the stock `powerbrowser.open-browser-window` command with the download URL (the same path the palette entry takes, including its channel-gated double-window protection).
**Deviation:** `POWERBROWSER_DOWNLOAD_URL` is `https://powerbrowser.org/`, the only public URL in the tree. No release or download page exists yet (the project's release-and-auto-update memory note records that no GitHub Releases exist at this date). Change the constant when a page exists. Accepted by the owner on 2026-10-25.
**Status:** fixed: requires human verification (live status-bar click and stock-window open).

### WR-04: Status mapping sends unknown statuses to "checking"
**Files modified:** `powerbrowser/shell/PowerBrowserAPI.sys.mjs`, `theia/extensions/tab-uris/src/browser/update-client.ts`, `theia/extensions/branding/src/browser/powerbrowser-update-copy.ts`
**Commit:** `75c799c`
**Applied fix:** the mapping is an explicit table: `update-available/show-prompt` to `available`; `update-available` with `cant-apply` or `unsupported` to `cant-apply`; `update-staged` and `update-downloaded` to `ready`; everything else (`update-error`, unnamed statuses) to `error`. The client renders `available` as a download status line (`availableStatus`).
**Deviation (judgement):** the review's table did not name `update-available/unsupported`. It maps to `cant-apply` (the copy cannot take the update), not to `error`. Accepted by the owner on 2026-10-25.
**Status:** fixed: requires human verification (mapping logic; no row checks the table).

### WR-05: Literal user-facing copy lives in the client
**Files modified:** `theia/extensions/tab-uris/src/browser/update-client.ts`, `theia/extensions/branding/src/browser/powerbrowser-update-copy.ts`, `scripts/verify-update-copy.mjs`
**Commit:** `3fc5cb8` (shared with WR-06, same files)
**Applied fix:** every status-bar text, button label, the restart warning and the check-failed status moved into `POWERBROWSER_UPDATE_COPY`. The check-failed status now ends with "Choose Check again to retry." The `'malformed reply'` diagnostic literal was reworded to a hyphenated token. The copy row fails on any whitespace-bearing or copy-valued literal in the client code.

### WR-06: Affordance check is substring-only; expectation lists are hand-kept
**Files modified:** `scripts/verify-update-copy.mjs`, `scripts/verify-platform.sh`
**Commit:** `3fc5cb8` (shared with WR-05)
**Applied fix:** the hand-kept `EXPECTED_KEYS` and `BODY_AFFORDANCES` lists and the `'status'` affordance are removed. Keys are classified by suffix (Title, Body, Status, Label); the affordance set is derived from the Label and Title values; each Body must be rendered by a client method that also references one of those keys; each non-progress Status must end with one. Ten planted faults go red naming their drift, including a status with no next step and a single-word copy value in the client.

### WR-07: Allowlist rationale for release-assets contradicts the user-initiated disposition for github.com
**Files modified:** `powerbrowser/endpoint-allowlist.json`, `scripts/verify-endpoints.sh`, `scripts/verify-update-download-host.mjs` (new), `scripts/verify-platform.sh`, `49-CONTEXT.md`, `50-CONTEXT.md`, `46-VERIFICATION.md`
**Commits:** `de1efd5` (first pass: github.com moved to allow, since reverted), `6a8b281` (owner ruling 2026-10-25), `94867df` (verification report)
**Applied fix:** the owner ruling of 2026-10-25 supersedes the first pass. github.com stays `user-initiated` (UPD-33), so an unattended request to it fails the verdict model. The unattended MAR download must never touch github.com: the update descriptor's patchURL and servedMarUrl must name release-assets.githubusercontent.com or the updates host. The release-assets row stays `allow`, with that constraint as its stated reason. The endpoint disposition self-test now asserts github.com unattended red and after-click green against the real allowlist. The descriptor builder is in a later phase, so the constraint is recorded in 49-CONTEXT.md and 50-CONTEXT.md (with the conflicting 49-04 and 50-02 assertions noted for revision) and guarded by the `update-download-host` quick row. Its self-test plants three github.com download forms (descriptor template, generator output, fixture) and two controls (a release-assets URL and a release-notes URL), which stay green.
**Status:** fixed: requires human verification. The descriptor URL source is a later-phase decision: release-assets asset URLs are not documented stable permalinks, so the publishing phase must choose publish-time resolution or serving from the updates host (46-VERIFICATION G4).

### WR-08: The mar-update-hop experience proof trusts a self-reported transcript
**Files modified:** `scripts/verify-mar-update-hop.mjs`, `powerbrowser/shell/PowerBrowserAPI.sys.mjs`, `powerbrowser/INTERNAL-APIS.md`
**Commit:** `ada8581`
**Applied fix:** the shell logs one line per appUpdate push (`[update-observer] appUpdate status=... version=...`). The row requires `client-update.log` (the shell stdout capture) to hash to `transcript.evidence.sha256`, derives the ready string from the logged ready event (which must name N+1), and compares the transcript field against that derived string. Two new plants (capture edited after the transcript; ready event absent) go red.
**Status:** fixed: partial, requires human verification. The restart-clicked, post-restart version, post-restart buildID and layout fields remain self-reported in hop.json. No WebDriver driver in the tree produces the capture yet (46-VERIFICATION G2 and H2).

### WR-09: FxA/Sync host family is not derived by any check
**Files modified:** `.planning/workstreams/deploy/phases/46-in-app-update-experience-and-egress-pass-c/46-VERIFICATION.md`
**Commit:** `7feb83f`
**Applied fix:** the false claim is removed (the review's second option). The verification row states that the pref is checked, and that the host set is recorded for the Phase 50 capture. A derivation row was not added.

## Skipped Issues

None.

## Not addressed (out of scope or not achievable here)

- **IN-01** (kind-agreement row drops literals that share a name with out-of-scope kinds): out of the requested scope; not changed.
- **IN-03** (client imports the copy through a `src/` path): out of scope; not changed.
- **IN-02** (replace with a string replacement): fixed incidentally (the ready-string render uses a replacer function).
- **Live proofs** (46-VERIFICATION H1 paint and palette, H2 hop drive, H4 Phase 50 endpoint capture): cannot run in this change. H3 (Nimbus) was run live and passes.
- **Shell-side plants** for WR-01 (refusal) and WR-04 (mapping table) are not covered by a row; the copy row covers the client side only.

## Verification

Run in the clone `/home/chris/gsd-workspaces/deploy/dsh/phase-46` (not a separate worktree). Inside `nix develop .#theia` for the Theia checks.

- `scripts/verify-endpoints.sh --disposition-self-test`: PASS, including unattended github.com red and after-click green against the real allowlist.
- `scripts/verify-update-download-host.mjs` and `--self-test`: PASS (3 planted github.com download forms red, 2 controls green).
- `scripts/verify-platform.sh --quick`: exit 0 at the final fix commit (`gui07-strip-spike-verdict` and its self-test PASS).
- `npx tsc --noEmit -p .` in `theia/extensions/tab-uris`: exit 0. In `theia/extensions/branding`: exit 0.
- `yarn check --integrity --ignore-scripts` in `theia/`: "Folder in sync" after the offline install.
- `node scripts/verify-nimbus-exposure.mjs` (full tier, live on the built binary): PASS.
- `node scripts/scan-brand-residue.mjs`: PASS over 420 files.
- `scripts/check-internals-boundary.sh` and `--catalogue`: PASS.
- `node scripts/generate.mjs --check`: PASS (56 files).

Logic-bearing fixes (CR-06, WR-01, WR-03, WR-04, WR-07, WR-08) are marked `fixed: requires human verification` above.

---

_Fixed: 2026-10-25_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
