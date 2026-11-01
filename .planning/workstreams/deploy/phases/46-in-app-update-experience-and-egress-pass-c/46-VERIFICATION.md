---
phase: 46-in-app-update-experience-and-egress-pass-c
status: gaps_found
source: gsd-verifier (corrected after the 46-REVIEW.md fixes, 2026-10-25)
started: 2026-10-26
updated: 2026-10-25
---

# Phase 46 Verification: In-app update experience and egress pass (C)

**Goal**: A user sees when an update is ready, restarts into it with one click, is told in plain words when this copy cannot update or a check failed, and the browser reaches no host the allowlist has not dispositioned.
**Requirements**: UPD-18, UPD-19, UPD-20, UPD-21, UPD-22, UPD-23, UPD-32, UPD-24, UPD-27, UPD-15, UPD-28.

This report states only what holds after the 46-REVIEW.md fixes (commits listed under "Commits verified"). Where a claim from the first verification did not hold, the row says so.

## Must-haves truth table

| # | Plan must-have truth | Requirement | Verified? | Evidence |
|---|---|---|---|---|
| 46-01-T1a | The shell observes update-staged, update-downloaded, update-available and update-error, reads the numeric currentState against the IDL constant, and pushes `{kind:'appUpdate',status,version?}` over PowerBrowserWebTabState | UPD-18 | verified (automated) / human_needed (live push) | The observer is started from TheiaService._swap() and its stop function is invoked in stop() (review CR-01, commits 3dc18bf and e49f44e). `update-observer-wired` and `--self-test` PASS (plants: removed call site, dropped stop call, definer-only tree). The status table is explicit (WR-04). The live push was not exercised on a running frame. |
| 46-01-T1b | The shell accepts appUpdateState, checkForUpdates and restartToUpdate; restartToUpdate restarts through eRestart after quit-application-requested with the layout flush running | UPD-19 | verified (automated) | `shell-request-kinds` PASS (7 kinds). restartToUpdate refuses with `not-staged` when no update is staged (WR-01, 56eb5ad) before the announce and quit. |
| 46-01-T2 | shell-request-kinds compares accepted and dispatched kinds as set equality; its self-test plants a stray kind | UPD-19 | verified | `--only shell-request-kinds` and `--only shell-request-kinds-self-test` PASS. Blind spot IN-01 (out of scope) remains: out-of-scope names shared with in-scope literals are dropped. |
| 46-01-T3 | check-internals-boundary.sh is green with every touchpoint catalogued in INTERNAL-APIS.md | UPD-18 | verified | `check-internals-boundary.sh` PASS and `--catalogue` PASS after the CR-02, CR-03, WR-01 and WR-08 edits. Each new `Ci.`/`Cc[` occurrence has an exact `File:Line` row (STATE_PENDING, update-manager). Rows were renumbered for shifted lines. |
| 46-01-T4 | A cant-apply notification with a null subject never throws | UPD-18 | verified (guard) / unexercised (live) | The null guard runs before QueryInterface (updateVersionFromSubject). The observer is now reachable (CR-01). No read-only-dir plant for this path exists in the shell-request-kinds row. |
| 46-01-T5 | A stray request kind is refused with `{ok:false}`, never thrown | UPD-19 | verified | The default case returns `{ ok:false, reason:"validation" }`; the row asserts it. |
| 46-02-T1a | When an update is staged the user sees the contracted ready string with the version, Restart now and Later, plus a status-bar item that re-opens the prompt | UPD-20 | verified (automated) / human_needed (pixels) | The version comes from the update manager (CR-03). The status-bar item carries the showReady command (WR-03). The copy row derives the strings (20 derived). Paint, status-bar rendering and the Restart-now landing need a live frame (H1). |
| 46-02-T1b | A read-only app directory produces the cannot-update string with Open download page; a failed check shows the could-not-check string with Check again at most once per session | UPD-21, UPD-22 | verified (automated) / human_needed (live) | Copy holds (cannotUpdateBody, cannotUpdateMacBody, couldNotCheckBody). Open download page runs the stock browser-window command with the product-site URL (WR-03). Once-per-session is driven through the real client (see 46-02-T3). The live read-only plant is H2 and H1. |
| 46-02-T1c | The command palette offers PowerBrowser: Restart to Update and PowerBrowser: Check for Updates | UPD-23 | verified (registration code) / human_needed (palette pixels) | `registerCommands` registers both titles from the copy module (no literals); the hidden showReady command is registered alongside. Palette presence needs a live frame (H1). |
| 46-02-T2 | The quick update-copy row derives the strings from the branding contribution, applies the shape test, and its self-test plants faults | UPD-32 | verified | `verify-update-copy.mjs` PASS and `--self-test` PASS (10 planted faults red naming their drift, incl. a single-word client literal, a status with no next step, an unclassified key). Expectation lists are no longer hand-kept (WR-06). |
| 46-02-T3 | Check again appears at most once per session: a second failure in the same session does not re-prompt; a completed check resets the flag | UPD-22 | verified (behavioural) | The real client is transpiled from the tree and driven through its push path, with only the Theia imports stubbed. Prompt counts must be 1, 1, 2 (CR-06, 4f1fb12). Two planted faults (reset on request acceptance; never reset on completion) go red naming the prompt count. The previous fixture was a constant stub and did not test the client. |
| 46-02-T4 | Every update string names PowerBrowser or is a label, carries no internal identifier, ends with an on-screen affordance, and the client renders only copy-module text | UPD-20/21/22/32 | verified | The row derives the classification, the affordance set, and the client literal check (comments and console calls stripped). Progress statuses end in an ellipsis; other statuses end with a Label or Title. |
| 46-03-T1 | The full-tier mar-update-hop row drives the in-Gecko WebDriver path to assert the ready notification, clicks Restart now, asserts N+1 and layout, and plants a read-only directory | UPD-24 | **not achieved** (instrument only) | The row verifies a captured transcript bound to the run: client-update.log must hash to transcript.evidence.sha256, and the ready string is derived from the logged ready event that names N+1 (WR-08, ada8581). The WebDriver drive that produces the capture is not in the tree. Restart-clicked, post-restart version, layout and read-only fields remain self-reported in hop.json. `--self-test` PASS (11 plants). The full row is red naming the missing evidence. See H2. |
| 46-03-T2 | mar-update-hop-self-test stays honestly quick and covers each new plant in memory | UPD-24 | verified | The self-test uses in-memory fixtures and mkdtemp only; PASS. |
| 46-03-T3 | The Nimbus exposure probe: recordExposureEvent neither throws nor makes a network request with MOZ_NORMANDY removed | UPD-27 | verified (live, this host) | The full row drives the two UpdateListener paths (available and manual) in the shell's chrome document through the scripts/lib harness (withShell, runCheck), with MOZ_LOG=nsHostResolver:5 and a byte-bounded capture window. Run on 2026-10-25 against the built binary (objdir/dist/bin/powerbrowser, built 2026-10-20): both paths returned, the window contained no `Resolving host` lines, PASS in 11 s. The quick self-test (7 planted faults) is green. Repeat the run after any rebuild. See H3. |
| 46-03-T4 | The exposure self-test drives the same assertion against fixture doubles: throwing and recording doubles go red, a silent double stays green | UPD-27 | verified | `--only nimbus-exposure-self-test` PASS. |
| 46-03-T5 | Existing hop evidence plumbing still passes: distinct versions, byte-identical descriptor, MAR hash pin, fork-server access log, zero Mozilla hosts in the resolver log | UPD-24 | verified (instrument) / not achieved (live) | The self-test keeps every prior plumbing plant green-first, then red on fault. Live evidence is absent on this tree (H2). |
| 46-04-T1a | endpoint-allowlist.json carries github.com and release-assets rows, a crash-reports deny row, a corrected geolocation row and corrected texts | UPD-15 | verified (corrected per the 2026-10-25 owner ruling) | github.com stays `user-initiated` (UPD-33). An unattended request to it fails the verdict model, and `verify-endpoints.sh --disposition-self-test` shows the unattended github.com verdict red and the after-click verdict green against the real allowlist. The unattended MAR download must never touch github.com, so the update descriptor's patchURL must name release-assets.githubusercontent.com (or the updates host) directly; `release-assets` is `allow` with that stated constraint. The descriptor is emitted by a later phase (49/50): the rule is recorded in 49-CONTEXT.md and guarded by the `update-download-host` quick row, whose self-test plants three github.com download forms. The earlier github.com-to-allow change (de1efd5) is reverted. |
| 46-04-T1b | allowlist-doc-consistency is green and its self-test goes red on a planted undocumented Mozilla allow host | UPD-15 | verified | `--only allowlist-doc-consistency` PASS; `--only theia-endpoints` PASS; `--only allowlist-schema` and `--only endpoint-dispositions-self-test` PASS. |
| 46-04-T1c | No Mozilla host is newly dispositioned allow by this pass | UPD-15 | verified with note | The inherited sections are byte-unchanged per the SUMMARY; the verifier did not recompute the byte diff (G1). |
| 46-04-T1d | The partner-search-code status is recorded: stock partner machinery untouched | UPD-15 | verified (documented) | `docs/RELEASING.md` partner note present; no search-host allowlist change. Live Suggest-traffic observation is Phase 50.5. |
| 46-04-T2a | Generated branding prefs set identity.fxaccounts.enabled=false | UPD-28 | verified | `generate.mjs --check` PASS (56 files). |
| 46-04-T2b | No Firefox Accounts or Sync host is contacted | UPD-28 | verified for the pref only / human_needed for the host set | `verify-update-prefs.mjs` and its self-test check the pref in both variants. No row derives the FxA/Sync host family from the tree: the host names appear only in comments. The host set is recorded for the Phase 50 capture (WR-09, 7feb83f). See H4. |
| 46-04-T3 | theia-endpoints and update-channel stay green across the allowlist and emitter edits | UPD-15 | verified | `--only theia-endpoints` PASS; `--only update-prefs` PASS; `--only update-channel` PASS. |

## Hard-rule checks (CLAUDE.md)

- **Patches regenerated never text-edited**: no patch file touched by the fix commits. PASS.
- **Never edit upstream/ or Theia core**: the fixes change only `@powerbrowser/*` extensions, `powerbrowser/`, `scripts/`, and planning docs. No upstream/ path changed. PASS.
- **One verify registry**: the new rows (`update-observer-wired`, `update-state-contract`, each with a self-test) are appended to `scripts/verify-platform.sh`. No `verify-ng-NNN-*.mjs` file was created or edited. PASS.
- **Checks derive from the tree**: the copy row derives its keys, classification and affordance set from the contribution; the observer row derives the field name from the assignment; the state row derives the STATE_* names from the IDL; the Nimbus row reads the shipped UpdateListener call sites. The hand-kept EXPECTED_KEYS and BODY_AFFORDANCES lists are removed. PASS.
- **Stage new files**: all new files were added before their commits; `scan-brand-residue` PASS over 420 files. PASS.
- **Brand-tokens COUNT MOVED**: the scan passes with the current inventory, so no count move is outstanding. PASS.
- **No internal identifiers in user-facing copy**: `verify-update-copy.mjs` PASS (naming, no internals, affordance wiring, no client literal). PASS.
- **Builds inside nix develop**: `npx tsc --noEmit -p .` for `theia/extensions/tab-uris` and `theia/extensions/branding` exits 0 inside `nix develop .#theia`. PASS.
- **Quick gate**: `scripts/verify-platform.sh --quick` exits 0 at the final fix commit. PASS.

## Gaps

### G1 (note, not a failure): Inherited-egress byte-unchanged assertion is plan-attested, not verifier-recomputed
- The 46-04 plan required the inherited network egress sections in workstream ROADMAP.md and REQUIREMENTS.md to be byte-unchanged. The verifier did not recompute a byte diff against the pre-phase blob. Residual step for an audit: `git diff 8a083de^ 8a083de -- <roadmap> <requirements> | grep -i mozilla` should be empty.

### G2 (gap, criterion 3/4): The WebDriver hop drive is not in the tree
- UPD-24's live proof needs a driver that runs the N to N+1 hop, drives the ready notification and Restart now, and writes `client-update.log` (the shell stdout capture). Only the verifier side exists. Until the driver exists, the full mar-update-hop row cannot pass, and the restart, post-restart version and layout fields in hop.json remain self-reported.

### G4 (constraint for Phase 49/50): the update download must never touch github.com
- Owner ruling 2026-10-25: github.com stays user-initiated. The unattended MAR download must therefore name release-assets.githubusercontent.com (or the updates host) directly in the descriptor's patchURL and servedMarUrl, never a github.com `/releases/download/` URL.
- The descriptor is built by a later phase, so no tracked descriptor builder exists yet. The constraint is recorded in 49-CONTEXT.md (with the conflict that 49-04-PLAN.md and 50-02-PLAN.md currently require the github.com immutable form) and guarded by the `update-download-host` quick row, which fails on any tracked template, generator output or fixture naming that form as an update source.
- The release-assets asset URL is not a documented stable permalink; the publishing phase must choose how to resolve it (publish-time resolution or serving the MAR from the updates host).

### G3 (resolved in this pass): update observer never started; ready version empty; seed never rendered; Check-again flag reset on acceptance; quick gate red
- Resolved by the commits listed below. The quick gate was red at HEAD because the Theia install did not match the manifests; `yarn install --ignore-scripts --offline` in `nix develop .#theia` fixed it. No lockfile change was needed (the workspace packages are not in `theia/yarn.lock`).

## Human-needed items (live proofs, deferred — NOT automated failures)

### H1: Live Theia paint of the update experience (UPD-20/21/22/23)
- **Why deferred**: no headless row can assert notification pixels, status-bar rendering, the Restart-now landing, or palette contents.
- **Owner steps**: (1) stage an update per `docs/BUILD.md` mar-hop procedure; (2) launch the Theia sidecar build; (3) confirm the ready notification shows the contracted string with the version, with working Restart now and Later, and that clicking the status-bar item re-opens it; (4) click Restart now and confirm version N+1 with layout restored; (5) rerun with a read-only app directory and confirm the cannot-update text, and that Open download page opens https://powerbrowser.org/ in a stock window; (6) force a check failure twice in one session and confirm Check again appears only once; (7) open the command palette and confirm both PowerBrowser entries.

### H2: Real hop drive (UPD-24)
- **Why deferred**: needs tier-3 N and N+1 builds plus the WebDriver hop driver (G2). The hop must write `.mozbuild/mar-hop/client-update.log` with the shell's stdout and hop.json with `transcript.evidence.sha256` set to that file's digest, then `node scripts/verify-mar-update-hop.mjs` must exit 0.

### H3: Nimbus exposure probe (UPD-27): closed on this host, repeat per build
- The full row passed live on 2026-10-25 (see 46-03-T3). Re-run `node scripts/verify-nimbus-exposure.mjs` after any rebuild of the shell or the Gecko objdir.

### H4: Live endpoints capture incl. FxA/Sync family (UPD-15/28)
- **Why deferred**: layer-3 observation of a real update (github.com and release-assets.githubusercontent.com) and the contacted-host set-difference for the FxA/Sync family need a real capture; both are Phase 50 criterion 5 per ROADMAP. Owner steps: at the first public release, run the verify-endpoints capture during a real update; confirm the asset hosts appear with their allowlisted dispositions and no FxA/Sync host (`accounts.firefox.com`, `profile/oauth.accounts.firefox.com`, `token.services.mozilla.com`, `channelserver.services.mozilla.com`) is contacted.

## Commits verified
- `8c60514` feat(46-01): observe update service and accept shell request kinds (original)
- `ecfb291` feat(46-02): contracted update copy and Theia update client (original)
- `f6e4dbc` fix(46-02): declare @powerbrowser/branding in tab-uris manifest (original)
- `6f676e8` feat(46-03): hop experience proof and Nimbus exposure probe (original)
- `8a083de` feat(46-04): allowlist release pass and FxA off at generator (original)
- `80cc43a` docs(46-01): complete plan summaries (original)
- Review fixes (dsh/phase-46): `3dc18bf`, `e49f44e` (CR-01); `bdf8c9a` (CR-02); `5569ca6` (CR-03); `7603123` (CR-04); `4f1fb12` (CR-06); `56eb5ad` (WR-01); `452c52a` (WR-02); `fecc55d` (WR-03); `75c799c` (WR-04); `3fc5cb8` (WR-05 and WR-06); `de1efd5` (WR-07); `ada8581` (WR-08); `7feb83f` (WR-09). WR-07 owner ruling `6a8b281` (supersedes the first pass `de1efd5`). CR-05 has no tracked commit (environment reinstall).

## Verdict
- **status: gaps_found** — the update experience and the egress-probe wiring are fixed and every automated row in the quick gate passes (`verify-platform.sh --quick` exit 0). Two gaps remain: G2 (the WebDriver hop drive that produces the UPD-24 transcript is not in the tree, so UPD-24 is not achieved) and the live paint and palette proofs (H1). The Nimbus exposure proof (UPD-27) passed live on this host.
