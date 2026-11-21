# Result: G4-workspace-agents

Branch: worktree-agent-a16a54e1a849b8b38   Base: 0f9f2735401a08132a479c95c09c53f03015fa19   Final: 5fd217b9 (last code commit; this record is the commit after it)

| ID | Status | Commit | Check | Note |
|---|---|---|---|---|
| 65-CR-01 | fixed | ad6ffb78 | scripts/verify-orca-git-sides.mjs::a | A path absent at an existing rev or index stage reads as `missing`; the resource returns an empty side (not NotFound, which leaves the monaco model invalid). Staged add, staged delete, untracked, commit add and delete all open. |
| sidecar-gate-backends-02 | fixed | ad6ffb78 | scripts/verify-orca-git-sides.mjs::b,c,d | Reads run with GIT_NO_LAZY_FETCH, GIT_TERMINAL_PROMPT=0, empty askpass, protocol.allow=never (env form, argv unchanged); git spawns as its own process group and the timeout kills the group. Dash and NUL revs, paths and rev-parse specs refused. |
| 65-WR-02 | fixed | 54a38dfa | scripts/verify-orca-editor-router.mjs::b,e | A thrown open is marked failed, not cached; OrcaRootSync calls router.retry(roots) after each sync and the resolver trusts the latest snapshot's roots before its sync. |
| 65-WR-05 | fixed | 54a38dfa | scripts/verify-orca-editor-router.mjs::a | ORCA_DIFF_RULE_LABELS (Unstaged, Staged, Branch, Commit: Orca's own strings) in the routes module; combined diffs name the entry's rule. |
| 65-WR-03 | fixed | 54a38dfa | scripts/verify-orca-editor-router.mjs::c,d | Drops wait while the snapshot reports hydrated false; a record closed for a dropped root reopens when retry sees its root again. The flag itself is G3a's half (Handoffs); until it lands the 750 ms timer still decides. |
| 68-WR-04 | fixed | b72680ff | scripts/verify-bundled-extensions-upgrade.mjs::a,b | The old copy is parked by rename in `.<id>-old-XXXXXX/` before the new copy is renamed in; the start restores a parked real directory (never a link) and removes parked siblings. Crash at every one of the 7 mutations recovers. |
| 63-WR-01 | fixed | db747c7c | scripts/verify-claude-wrapper-pane.mjs::S1 | Every error after create returned a handle carries the pane, so main closes it. |
| agents-extensions-01 | fixed | db747c7c | scripts/verify-claude-wrapper-pane.mjs::S1,S4 | As 63-WR-01, plus signal handlers installed before the CLI phase (now asynchronous): a signal before claude closes the pane and exits 128+n. |
| 63-WR-02 | fixed | db747c7c | scripts/verify-claude-wrapper-pane.mjs::S2,S3 | One 5 s deadline for the pane phase; a create still running at the deadline is left running and its pane closed before the wrapper exits. |
| agents-extensions-02 | fixed | db747c7c | scripts/verify-claude-wrapper-pane.mjs::S2,S3 | Same change; a hung orcad holds claude about 5 s, not 20 to 60 s. |
| 63-WR-03 | fixed | db747c7c | scripts/verify-claude-wrapper-pane.mjs::W,B | Wrapper picks orca.exe and endpoint.cmd on win32 (derived from Orca's source in the check); backend stays inert on win32. The missing Windows launcher stays WINDOWS 53. |
| agents-extensions-03 | fixed | db747c7c | scripts/verify-claude-wrapper-pane.mjs::B | Backend returns before writeLauncher on win32, so no wrapper default is registered there. |
| sidecar-gate-backends-03 | not-applicable | 5fd217b9 (check only) | scripts/verify-token-cookie-shadow.mjs::a | Already fixed at 1dad3044 (GUI review merge): token-gate-backend-contribution.ts:209-235 compares every POWERBROWSER_TOKEN value. No check covered it; the new check plants the first-match read. |

## Registry requests
- scripts/verify-orca-git-sides.mjs: quick, `"orca-git-sides|node $REPO_ROOT/scripts/verify-orca-git-sides.mjs"` and `"orca-git-sides-self-test|node $REPO_ROOT/scripts/verify-orca-git-sides.mjs --self-test"`
- scripts/verify-orca-editor-router.mjs: quick, `"orca-editor-router|node $REPO_ROOT/scripts/verify-orca-editor-router.mjs"` and `"orca-editor-router-self-test|node $REPO_ROOT/scripts/verify-orca-editor-router.mjs --self-test"`
- scripts/verify-bundled-extensions-upgrade.mjs: quick, `"bundled-extensions-upgrade|node $REPO_ROOT/scripts/verify-bundled-extensions-upgrade.mjs"` and `"bundled-extensions-upgrade-self-test|node $REPO_ROOT/scripts/verify-bundled-extensions-upgrade.mjs --self-test"`
- scripts/verify-claude-wrapper-pane.mjs: quick (check about 8 s, self-test about 55 s), `"claude-wrapper-pane|node $REPO_ROOT/scripts/verify-claude-wrapper-pane.mjs"` and `"claude-wrapper-pane-self-test|node $REPO_ROOT/scripts/verify-claude-wrapper-pane.mjs --self-test"`
- scripts/verify-token-cookie-shadow.mjs: quick, `"token-cookie-shadow|node $REPO_ROOT/scripts/verify-token-cookie-shadow.mjs"` and `"token-cookie-shadow-self-test|node $REPO_ROOT/scripts/verify-token-cookie-shadow.mjs --self-test"`

## Red by design
- scan-brand-residue and scan-brand-residue-self-test: the third-party name is counted per file in inventory/brand-tokens.json, which this lane does not own. Three new scripts are unclaimed (condition 4: scripts/verify-claude-wrapper-pane.mjs 69 hits, scripts/verify-orca-editor-router.mjs 42, scripts/verify-orca-git-sides.mjs 27), and the held-back coincidental rows moved: "Orca" 3281 to 3291, "orca" 5679 to 5683, "ORCA" 1270 to 1277, "orcad" 1786 to 1790. Integration must add the three scripts to those rows' expected_files and set each expected_count to the observed value after all lanes merge (re-run `node scripts/scan-brand-residue.mjs`; the self-test's clean-root control goes green with the main scan).

## Handoffs
- G3a: orca-overlay/files/src/renderer/src/pb/pb-workspace-api.ts, add `hydrated?: boolean` to `OrcaWorkspaces` and `hydrated: state.hasHydratedWorktreePurge === true` to the object `subscribeWorktrees` projects, for 65-WR-03. orca-workspace already reads `snapshot.hydrated` and holds drops while it is false.
- Integration (owner of scripts/verify-orca-workspace-live.mjs): add the added, deleted and untracked fixture files the 65-CR-01 review asks for to buildFixtureRepo; the static behaviour is covered by scripts/verify-orca-git-sides.mjs, for 65-CR-01.

## Behaviour changes
- 65-CR-01: diffs of added, deleted and untracked files now open in Theia with one empty side, instead of failing and never retrying. Revert with ad6ffb78.
- sidecar-gate-backends-02: in a partial (blob:none) clone, a historical diff side whose blob is not local no longer triggers a network fetch, prompt or askpass dialog; that side fails to open. Revert with ad6ffb78.
- 65-WR-05: diff tab titles read `app.ts (Unstaged)`, `(Staged)`, `(Branch)`, `(Commit)`; a combined diff shows its entry's rule instead of `(combined-all)` or `(combined-uncommitted)`. A diff URI a Setup saved with an old label opens as a separate tab. Revert with 54a38dfa.
- 65-WR-02: an Orca diff or merge tab refused at start-up (roots not yet known) opens once the root sync applies. Revert with 54a38dfa.
- 65-WR-03: while the bundle reports hydrated false, no Orca root is removed and no editor under it closed; an editor PB closed for a dropped root reopens when the root returns. Revert with 54a38dfa.
- 68-WR-04: a hidden `.<id>-old-XXXXXX` folder exists in deployedPlugins for the moment of an upgrade and is restored or removed at start. Revert with b72680ff.
- 63-WR-02, agents-extensions-02: when orcad takes more than 5 s to create the pane, Claude Code starts without an Orca pane (before: it waited up to 20 s per call and usually got one). Revert with db747c7c.
- agents-extensions-01: a session the extension stops before claude has started now exits 143 without starting claude. Revert with db747c7c.
- agents-extensions-03, 63-WR-03 (D-40): on Windows no Claude Code process wrapper default is registered; Claude Code runs unwrapped there. Revert with db747c7c.

## Needs owner
None.

## Quick gate
`nix develop .#theia --command scripts/verify-platform.sh --quick` at 5fd217b9: 418 rows, 416 PASS, 2 FAIL (BASE-QUICK.txt: 419 PASS at ad2f901a; the registry was not edited by this lane, so the one-row difference is in the base 0f9f2735).
- scan-brand-residue: FAIL, caused by this lane, red by design until the inventory rows are reconciled (see Red by design).
- scan-brand-residue-self-test: FAIL, same cause: its clean-root control includes the tracked-tree scan.
Every check that reads a touched file was also run directly and is green: orca-editor-routes (check, --self-test, --git-spec-self-test), orca-workspace-live --self-test, backend-env-readers, bundled-extensions (static, --seed, --self-test), orca-agent-hooks (full row against a real hermetic orcad, and --self-test), orca-bridge-dir (check and --self-test), orca-service, orca-claude-sdk (check and --self-test).
