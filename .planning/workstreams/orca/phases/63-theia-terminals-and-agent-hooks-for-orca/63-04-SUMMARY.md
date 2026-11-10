---
phase: 63-theia-terminals-and-agent-hooks-for-orca
plan: 04
status: in-progress
---

# Phase 63 Plan 04: coordinator (after D-31) Summary

## Lanes

Read from `git worktree list` (the Orca worktree list) on 2026-11-10.

| Lane | Worktree | Branch (full ref) | Head | Disposition |
|------|----------|-------------------|------|-------------|
| p63-06 | /home/chris/orca/workspaces/Power-Browser/p63-06 | refs/heads/ServerDestroyer/p63-06 | 5c09757b89affcb885b879ef3ec54399e2adcfb3 | kept, merged first |
| p63-03 | /home/chris/orca/workspaces/Power-Browser/p63-03 | refs/heads/ServerDestroyer/p63-03 | 245da1023ee0c4fe628fee5c50a60c008c873061 | kept, merged second |
| p63-01 | /home/chris/orca/workspaces/Power-Browser/p63-01 | refs/heads/ServerDestroyer/p63-01 | 294012a3497d250268f7a1f682a189b584a93729 | superseded by D-31, not merged |
| p63-02 | /home/chris/orca/workspaces/Power-Browser/p63-02 | refs/heads/ServerDestroyer/p63-02 | 3ab56e10e46e865fbc1c4a3df338fb18d2040661 | superseded by D-31, not merged |
| p63-05 | /home/chris/orca/workspaces/Power-Browser/p63-05 | refs/heads/ServerDestroyer/p63-05 | ae88faa202a8ab3df7cf9056ea7f59a9910382d5 | superseded by D-31, not merged (kept parts rebuilt as p63-06) |

Both kept lanes had their SUMMARY committed on the lane branch (the last commit touching it is the
lane head in each case), and neither SUMMARY holds a line starting "BLOCKER:".

## Pre-merge baseline

`nix develop .#theia --command scripts/verify-platform.sh --quick` on abca6309 (after main's sidecar
Origin gate hotfix merge, before any lane merge), with inherited ORCA_* unset: 345 PASS, 2 FAIL.

Red rows:
- scan-brand-residue: `condition 4: scripts/verify-sidecar-origin-gate-live.mjs:37: "ORCA" matched probe "orca" but no inventory row claimed it` (brought in by the main hotfix merge 2b5f4609; fixed by the Task 3 re-measure)
- scan-brand-residue-self-test (its clean-root control scans the tree, so it follows scan-brand-residue)

fixer-isolate-self-test was green in this run inside `nix develop .#theia`.

## Merges

Scope check, derived: each lane plan's frontmatter `files_modified` read with node, compared with
`git diff --name-only $(git merge-base HEAD <ref>) <ref>`. Extra paths: none for either lane. The
first-parent range of each merge commit lists only that lane's paths.

| Merge | Commit | Paths | Conflicts |
|-------|--------|-------|-----------|
| refs/heads/ServerDestroyer/p63-06 (5c09757b) | 3d009604 | 9 (63-06-SUMMARY, INTERNAL-APIS.md, OrcaEnv, OrcaService, PowerBrowserAPI, TheiaService, verify-orca-bridge-dir.mjs, verify-orca-service.mjs, verify-platform.sh) | none |
| refs/heads/ServerDestroyer/p63-03 (245da102) | fe09063b | 11 (63-03-SUMMARY, verify-orca-agent-hooks.mjs, verify-orca-agent-status-live.mjs, verify-platform.sh, seven orca-agents files) | scripts/verify-platform.sh at the quick anchor, resolved by the conflict rule |

Registry conflict: at the quick anchor (after `orca-service-live-self-test|`) both lanes added a block.
The markers were removed, keeping the 63-06 block and then the 63-03 block. The sorted +/- lines of
`git diff 3d009604 -- scripts/verify-platform.sh` equal those of the lane's own diff from its merge
base, so no other line changed. `grep -n '# NEW (63-0' scripts/verify-platform.sh`: 3903 (63-06),
3909 (63-03) at the quick anchor; 6515 (63-03) at the full anchor.

After p63-06: orca-service, orca-service-self-test, orca-bridge-dir, orca-bridge-dir-self-test,
orca-hidden-electron-self-test, orca-service-live-self-test, internals-boundary, internals-catalogue,
ng-040-internals-catalogue-lines, ng-027-reader-callers, start-path-recovery, shell-error-contract,
shell-error-copy-no-internals: 13/13 PASS.

After p63-03: orca-agent-hooks-self-test PASS (21 planted faults), orca-agent-status-live-self-test PASS
(13 planted faults), and the cross-lane comparisons now compare:

    orca-service: PASS -- ... POWERBROWSER_ORCA_BRIDGE_DIR comparison compared; stub-boundary scenarios A, B, C, D, E, F, H ...
    orca-bridge-dir: PASS -- linux, darwin, win32: nodePlatform maps each, bridgeDirFor builds each -bridge folder (no /tmp base, no relative LOCALAPPDATA, aliasPathFor's 12 hex), bridgeFileFor joins with each separator; data-root literal compared; writePrivateFile order ok

`node scripts/generate.mjs` after the merges: PASS, 72 files, no tracked change. The brand scan then
read `FAIL -- 468 reconciliation failure(s)` (462 condition-4 hits plus six held-back count mismatches:
Orca 497/540, orca 1050/1108, ORCA 189/202, orcad 684/713, ORCAD 81/96, Orcad 60/66), as expected
until Task 3.

## Wiring

3b0b1f1d build(63-04): `build:extensions` gains `&& yarn --cwd extensions/orca-agents build` at the
end (there is no orca-terminals entry on this branch; p63-03's merge note named it from the
superseded p63-01 lane), and the browser app gains `"@powerbrowser/orca-agents": "0.1.0"` after
modes.

## Build record

- Theia, inside `nix develop .#theia`, ORCA_* unset: `yarn install --ignore-scripts --frozen-lockfile`,
  `(cd node_modules/drivelist && node-gyp rebuild)`, `yarn build`: exit 0. `theia/yarn.lock` unchanged.
  `src-gen/backend/server.js` and `src-gen/frontend/index.js` each name orca-agents once.
  orca-agents `lib/node` and `lib/browser` built.
- Orca: `nix develop .#orca --command bash scripts/build-orca.sh`, ORCA_* unset: exit 0. Newest log
  `.mozbuild/orca-build/build-20261110T200247Z.log`: one `build-orca: overlay applied src/main/orcad/orcad-browser-provider.ts`
  line, `build-orca: PASS -- built v1.4.248 (965978bc...) in 35s`, no line naming external-pty.
  `orca/out/cli/index.js` present.
- PowerBrowser: `./mach build faster` inside `nix develop .#firefox`: exit 0 in 31 s. The packaged
  TheiaService.sys.mjs under objdir/dist/bin names POWERBROWSER_ORCA_BRIDGE_DIR, PowerBrowserAPI.sys.mjs
  holds writePrivateFile, OrcaEnv.sys.mjs holds bridgeDirFor. No tier-3 build was needed.
- diff-theia-core PASS ("zero changes inside @theia/*") after the fix below; gui04-registry-shape PASS.

## Tracer proof (Task 1)

Under `flock /home/chris/coding/Power-Browser/.git/pb-live.lock`, ORCA_* unset, on the built orcad:

    orca-agent-hooks: PASS -- stage B (wrapper): the launcher as the backend writes it ran the wrapper with a stub claude; a "Claude Code" pane read back UserPromptSubmit->working, PermissionRequest->permission, Stop->idle; the stub got the pane identity and endpoint and not ORCA_PLANT_63 (present in the wrapper's own environment); stdout was the stub's marker only; the pane closed and the exit code 7 passed through; stage A (PTY environment): the CLI-created pane's process carries the 6 derived hook names and the pane identity, not ORCA_CLAUDE_AGENT_STATUS_SETTINGS; stage A (relay): Orca's managed hook script moved the pane through UserPromptSubmit->working, PermissionRequest->permission, Stop->idle in order; degrade stage: without orcad-data-root the stub ran and exited 7, one log line, no pane; static clauses: green

- Placeholder command: cat (A4). paneKey came from `terminal create` itself (A6).
- Session id: no terminal.agentStatus read-back carried the synthetic session id (P63-16); a resume id comes from Claude's side.
- One seam (D-31): `orca-overlay: PASS -- 1 seam(s) (src/main/orcad/orcad-browser-provider.ts +3/-0, blob 90b79e505d), 0 overlay file(s)`;
  `orca-build-shape: PASS -- 0 slot markers, 0 Node runtimes in out/, 0 Electron binaries, 1 modified tracked file(s), equal to the declared seams ...`

<!-- gsd:write-continue -->
