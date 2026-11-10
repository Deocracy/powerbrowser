# Phase 60 EXT-01 record: Claude Code extension on PB's Theia 1.76 against an Orca worktree

Requirement: EXT-01 (ROADMAP Phase 60 SC4). Decisions: P59-06..P59-09, D-06 items 1 and 2.
Plan: 60-05. Prepared 2026-11-09 by the executor; the live check (Task 2) is Chris's.

## Preparation

Scratch repo: /home/chris/orca/workspaces/Power-Browser/v1.7-Orca-integration/.mozbuild/ext01/scratch-repo (git, branch main, one commit 10f12e3 with README.md and hello.txt = "hello from the EXT-01 scratch repo")
Profile: /home/chris/orca/workspaces/Power-Browser/v1.7-Orca-integration/.mozbuild/ext01/powerbrowser-orca (both ORCA_USER_DATA and ORCA_USER_DATA_PATH, reached through the alias /home/chris/.cache/pb-ext01-orca, see note 1)
Worktree path: /home/chris/orca/workspaces/scratch-repo/ext01
Worktree branch: ext01 (HEAD 10f12e3, created by `worktree create --name ext01 --repo id:<repo id> --json`; warnings: none)
orcad: source build of Orca v1.4.248, commit 965978bc78bf03a6a43187c1ed28fcffe0e01bb5 (orca/out/orcad/orcad.js, de-slotted by scripts/build-orca.sh), started through scripts/lib/orca-run.mjs (ensurePbNode, orcadEnv, startOrcad, stopOrcad, installOutputRedaction), loopback with --port 0
Orca CLI: orca/out/cli/index.js built from the same pinned tree (v1.4.248) by `pnpm run build:packages` then `ORCA_CLI_BUILD_COMPILER=tsrs node config/scripts/build-cli.mjs` inside `nix develop .#orca --ignore-environment --keep HOME --keep TERM`; run on PB's Node with env = orcadEnv(process.env, same profile). The installed 1.4.245 shim was not used.
Node: 24.19.0, the official linux-x64 binary from powerbrowser/packaging/node-runtime.json at .mozbuild/orca-probe-node/node (orcad's health.nodeVersion reported 24.19.0)
orcad after preparation: stopped by SIGTERM to the starter; stopOrcad reported no survivors; no orcad.js or terminal-daemon process remained.
Theia: @theia/core 1.76.0 (VS Code API 1.139.0 per 60-RESEARCH.md); the sidecar spawn in powerbrowser/shell/TheiaService.sys.mjs sets VSX_REGISTRY_URL=https://open-vsx.org; theia/applications/browser/package.json sets security.workspace.trust.enabled false.

Notes:

1. orcad listens on a Unix socket `o-<pid>-<suffix>.sock` placed directly in the profile directory (orca/src/main/runtime/runtime-rpc/runtime-rpc-socket-metadata.ts:60). With the absolute profile path in this worktree the socket path exceeds the 108-byte sun_path limit and `listen` fails with EINVAL. The profile data stays in .mozbuild/ext01/powerbrowser-orca; orcad and the CLI reach it through the short symlink /home/chris/.cache/pb-ext01-orca. Phase 61+ must keep PB's orcad profile path short (or alias it) for the same reason.
2. `worktree create` has no location flag (orca/src/cli/root-help-text-secondary.ts:53). The worktree took the profile's default workspaceDir, ~/orca/workspaces, nested by repo name (A3 confirmed). That directory is also the user's real Orca desktop default; the real Orca has no registration of this repo, so it does not track the worktree.
3. Orca's stock `build:cli` ends with `prepare:cli-output`, which rewrites orca/package.json (`--fix-package-json`) and tries to symlink /usr/local/bin/orca-dev. Neither is allowed here (orca/ tracked files are never edited), so only its two build steps ran. Consequence: the built CLI prints "Could not determine the Orca version for this build." for `--version`; `repo add` and `worktree create` work.
4. Bun 1.4.4 from Orca's devDependencies is absent (install ran with lifecycle scripts off), so the CLI compile used Orca's documented `ORCA_CLI_BUILD_COMPILER=tsrs` path.

## Open VSX facts

Queried 2026-11-09 from https://open-vsx.org/api/anthropic/claude-code and the `/api/-/query` endpoint.

Open VSX version: 2.1.321
Publisher: Anthropic, verified
Display name: Claude Code for VS Code
Timestamp: 2026-11-09T19:20:04Z
engines.vscode: ^1.94.0 (Theia 1.76 reports 1.139.0)
Target platforms at 2.1.321: alpine-arm64, alpine-x64, darwin-arm64, darwin-x64, linux-arm64, linux-x64, win32-arm64, win32-x64. The newest `universal` build is 2.1.89. If Theia's ovsx-client fails to select linux-x64 (A4), it may fall back to that old universal build, which carries no bundled CLI.
Versions listed: 101; downloads 65,330,241
Licence (first words): "© Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements" (proprietary; installed at runtime by the user, never pinned, packaged or allow-listed)
Research recorded 2.1.319 on 2026-11-06; two releases have shipped since then.

## Outcome

Pending — deferred to the end-of-milestone human pass (P60-R5, 2026-11-09). The prepared state: scratch repo `.mozbuild/ext01/scratch-repo`, profile alias `~/.cache/pb-ext01-orca`, Orca worktree `/home/chris/orca/workspaces/scratch-repo/ext01`. The headed PowerBrowser launched for the check was closed on 2026-11-09; relaunch per 60-05 Task 2 when the pass runs. Open VSX offered Anthropic.claude-code 2.1.321 on 2026-11-09.
