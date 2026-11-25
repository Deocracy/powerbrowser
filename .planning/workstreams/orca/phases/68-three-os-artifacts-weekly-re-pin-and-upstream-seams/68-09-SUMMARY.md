---
phase: 68-three-os-artifacts-weekly-re-pin-and-upstream-seams
plan: 09
subsystem: theia-bundled-extensions
status: complete
tags: [BEXT-01, D-30, P68-38, theia, plugin-deployer, claude-agent-sdk, licensing]
requires:
  - "Theia 1.76 plugin-ext / plugin-ext-vscode (PluginDeployerParticipant, PluginVSCodeEnvironment, SettingService)"
  - "orca/pnpm-lock.yaml at orca_commit 965978bc (SDK 0.3.284 integrity)"
provides:
  - "bundled-extensions/claude-agent-sdk (powerbrowser.claude-agent-sdk 0.3.284)"
  - "plugins/.user/<id>/ assembly in download-plugins"
  - "@powerbrowser/bundled-extensions seed participant"
  - "seeded path <THEIA_CONFIG_DIR>/deployedPlugins/powerbrowser.claude-agent-sdk/extension/node_modules/@anthropic-ai/claude-agent-sdk (lane 68-07 reads it)"
  - "registry rows bundled-extensions, -seed, -self-test (quick), -live (full)"
affects: [68-07, 68-04, 68-08]
tech-stack:
  added: ["@anthropic-ai/claude-agent-sdk 0.3.284 (npm, inside the bundled extension only; no SDK byte tracked)"]
  patterns: ["dot-prefixed .user plugins folder skipped by the system scan, seeded as a user plugin", "npm ci from a tracked lock into scratch, exact-package check before rename"]
key-files:
  created:
    - bundled-extensions/claude-agent-sdk/package.json
    - bundled-extensions/claude-agent-sdk/package-lock.json
    - bundled-extensions/claude-agent-sdk/LICENSE.md
    - bundled-extensions/claude-agent-sdk/README.md
    - theia/extensions/bundled-extensions/package.json
    - theia/extensions/bundled-extensions/tsconfig.json
    - theia/extensions/bundled-extensions/src/node/bundled-extensions-backend-module.ts
    - theia/extensions/bundled-extensions/src/node/bundled-extensions-seed.ts
    - scripts/verify-bundled-extensions.mjs
  modified:
    - scripts/download-plugins.mjs
    - theia/applications/browser/package.json
    - theia/package.json
    - scripts/verify-platform.sh
decisions:
  - "The assembled folder carries extension.vsixmanifest beside extension/: Theia 1.76 reads <root>/extension/package.json only when that file exists (plugin-vscode-directory-handler.js resolveFromVSIX)"
  - "engines.vscode ^1.50.0: Theia only checks the key is present; the extension calls no API, and 1.139.0 (Theia 1.76's DEFAULT_SUPPORTED_API_VERSION) satisfies it"
  - "LICENSE.md states PowerBrowser's own licence as PolyForm Noncommercial 1.0.0 (configuration.toml license), not the MPL-2.0 the plan text named"
  - "README offers only switch-off/switch-on as the way back, because reinstall has no affordance in v1.7"
metrics:
  duration: "about 75 minutes"
  completed: 2026-11-10
actuals:
  tokens: 13750
  tasks: 3
  commits: 3
plan_head_before: 21ee66dc19e2199d132ee1876be336c26d9bde30
plan_head_after: 8f32a402969ce92885f670f3eee3a755bce0fbde
---

# Phase 68 Plan 09: Pre-installed Claude agent SDK extension Summary

PowerBrowser now ships Anthropic's Claude Agent SDK 0.3.284 inside a declarative VS Code extension, `powerbrowser.claude-agent-sdk`. The build assembles it into `plugins/.user/` from a tracked npm lock whose sha512 equals Orca's own. A new `@powerbrowser/bundled-extensions` deployer participant seeds it once into the profile as a user plugin. A user can disable it or uninstall it, and an uninstall survives restarts.

## Commits

| Task | Commit | Message |
|------|--------|---------|
| 1 (tracer) | c0d50a18 | feat(68-09): pre-installed bundled extension seeded as a user plugin (tracer) |
| 2 | 48b41481 | feat(68-09): Claude agent SDK carried in the pre-installed extension with Anthropic's terms; uninstall sticks |
| 3 | 8f32a402 | test(68-09): bundled-extensions checks and registry rows |

The SUMMARY is committed separately after these three.

## What was built

- **Manifest.** `bundled-extensions/claude-agent-sdk/package.json` has id `powerbrowser.claude-agent-sdk`, version 0.3.284, `engines.vscode` `^1.50.0`, license `SEE LICENSE IN LICENSE.md`, no `main` or `browser` entry, and one dependency, `@anthropic-ai/claude-agent-sdk` 0.3.284 exactly.
- **Lock.** `package-lock.json` was generated with `npm install --package-lock-only --ignore-scripts --legacy-peer-deps`. Its integrity `sha512-NSoJwEq6nFSf8dtaacYx37QdGgqApI3eHFUlxclMLYi8irb6ZJwEaUnPnLUCyAyg9W/tMkgZC0GXWLRCc01I0w==` equals `orca/pnpm-lock.yaml:732`. The eight per-OS packages are in the lock as optional and are never installed.
- **Licence and README.**
  - `LICENSE.md` quotes the SDK's `LICENSE.md` byte for byte: "© Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance."
  - The SDK's own manifest says `SEE LICENSE IN README.md`, so `LICENSE.md` also quotes, byte for byte, the line of that README which links the Commercial Terms of Service and the Privacy Policy.
  - `README.md` is user-facing copy and carries no internal identifier.
- **`scripts/download-plugins.mjs`.** This new step runs after the declared-extension unpack. For each `bundled-extensions/*/`:
  - It runs `npm ci --ignore-scripts --script-shell true --omit=optional --legacy-peer-deps` in a scratch directory.
  - It requires `node_modules` to hold exactly the lock's non-optional packages, and requires the extension's `LICENSE.md` to contain the SDK's `LICENSE.md` verbatim.
  - It assembles `extension/` plus `extension.vsixmanifest` in a temporary sibling, then renames it to `plugins/.user/<id>/`. Symlinks are refused.
  - The cleanup loop keeps `.user`, and stale ids inside `.user` are removed.
- **Built extension.** `plugins/.user/powerbrowser.claude-agent-sdk/` holds 24 files, 5,193,346 bytes. `node_modules` holds `@anthropic-ai/claude-agent-sdk` alone.
- **Seed.** `seedBundledExtensions({ sources, deploymentDir, record })` is pure, with an injectable fs.
  - Its sources are the local-dir system entries plus `/.user`, and its deployment directory comes from `PluginVSCodeEnvironment.getDeploymentDirUri()`.
  - The record is kept in backend-settings key `bundledExtensions.seeded`, stored as the JSON string `{"powerbrowser.claude-agent-sdk":"0.3.284"}`.
  - With no record entry it copies the extension and records it. With the same version recorded it does nothing. With a different version recorded it replaces the copy only if the directory is still present. A malformed record counts as empty.
  - A copy goes into a temporary sibling first and is then renamed. The record is written only after the copy succeeds.
  - Any error is logged and swallowed, so the deployer always continues.
- **Which list-extensions form worked.** The CLI form worked: `node lib/backend/main.js list-extensions --show-versions` with `THEIA_CONFIG_DIR` set to a fresh directory prints `powerbrowser.claude-agent-sdk@0.3.284`, and `--show-builtins` does not list it. The backend binds no port in this mode, but it does not exit after printing. The `--live` check therefore stops it 1.5 s after the listing header arrives; a full run takes about 9 s.

## Check results

| Check | Result |
|-------|--------|
| Task 1 verify (`generate --check`, `.user` folder present, list-extensions prints the id) | PASS. The plan's literal pipeline needs `command grep` in this harness: the shell's `grep` function is ugrep, which does not exit early, so `timeout` killed it (exit 143). With system grep the result was `rc=0` |
| `ls plugins` prints `.user` only | PASS |
| `diff-theia-core.sh` (in `nix develop .#theia`) | PASS, zero changes inside @theia/* |
| `verify-theia-build-order.mjs` | PASS, 9 chain entries equal 9 extension directories |
| Task 2 verify (SDK 0.3.284 present; only `@anthropic-ai/claude-agent-sdk` in node_modules) | PASS |
| `grep -c 'All rights reserved' LICENSE.md` | 1 |
| README internal-identifier grep | 0 |
| `git ls-files -- 'bundled-extensions/*/node_modules/*'` | empty |
| `--only bundled-extensions` | PASS. The Orca lock equality leg ran green |
| `--only bundled-extensions-seed` | PASS, 8 scenarios. RED evidence first: before Task 2's seed change, "new shipped version, directory present" failed with "the deployed copy is 1.0.0, not a clean 2.0.0" |
| `--only bundled-extensions-self-test` | PASS, control plus seven plants, each red naming its fault |
| `--only bundled-extensions-live`, run under `flock .../pb-live.lock` with `ORCA_*` unset | PASS |
| `grep -c '"bundled-extensions' scripts/verify-platform.sh` | 4 |
| `--quick` against the lane baseline (55 pre-existing reds, mostly because the lane has no `upstream/` checkout) | New reds: `scan-brand-residue` (expected) and `scan-brand-residue-self-test`. The self-test's extra-root control runs the tracked scan, so it goes red for the same unclaimed rows. Nothing that was green became red |
| Lane diff within `files_modified` | One file outside the list: `theia/package.json` (see Deviations) |

## Brand-scan rows for the coordinator (not edited here; inventory is out of lane)

`node scripts/scan-brand-residue.mjs --report .mozbuild/p68-09/brand-report.md` found 38 reconciliation failures. All of them are the token "Orca" in this lane's files:

- condition 4, unclaimed: `bundled-extensions/claude-agent-sdk/package.json` 1 (line 5), `bundled-extensions/claude-agent-sdk/README.md` 2 (lines 3, 8), `scripts/verify-bundled-extensions.mjs` 34.
- held-back row "Orca" (title/coincidental): expected 637, observed 638. The extra one is the new comment line in `scripts/verify-platform.sh` (line 3903, "Orca's pnpm-lock.yaml").

These need inventory rows, or a count bump of +1 plus new claims for the three files, in `inventory/brand-tokens.json` at merge.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] The assembled folder carries `extension.vsixmanifest`.**
- **Found during:** Task 1.
- **Issue:** The plan's tree fact says the VS Code directory handler accepts `<root>/extension/package.json`. In Theia 1.76 it does so only when `<root>/extension.vsixmanifest` exists (`plugin-vscode-directory-handler.js:63`). Without that file the seeded plugin would not resolve.
- **Fix:** download-plugins writes a minimal VSIX `PackageManifest`, derived from the manifest fields, beside `extension/`. The built and seeded forms keep the interface paths: `<id>/extension/...` is unchanged, so lane 68-07's path is static.
- **Commit:** c0d50a18.

**2. [Rule 3 - Blocking] `theia/package.json` `build:extensions` names the new extension.**
- **Found during:** Task 1.
- **Issue:** The root `yarn build` compiles only the extensions that `build:extensions` lists, so `lib/` was never built. `verify-theia-build-order.mjs` also requires the chain to equal the extension directories.
- **Fix:** The plan's `files_modified` omits this file; it was edited anyway. `bundled-extensions` is appended at the end of the chain, because it depends on no `@powerbrowser` package.
- **Effect:** The Task 3 lane-diff check reports this one file outside `files_modified`.
- **Commit:** c0d50a18.

**3. [Rule 1 - Bug] PowerBrowser's own licence in LICENSE.md.**
- **Found during:** Task 2.
- **Issue:** The plan text says the manifest and README are PowerBrowser's "under MPL-2.0". `configuration.toml` declares `license = "PolyForm Noncommercial 1.0.0"`, and the root `LICENSE` is PolyForm Noncommercial.
- **Fix:** LICENSE.md names PolyForm Noncommercial 1.0.0.
- **Commit:** 48b41481.

**4. [Rule 2 - Copy rule] The README's closing next step.**
- **Found during:** Task 2.
- **Issue:** The plan asked for "switch it on or reinstall". Reinstalling has no affordance on screen in v1.7, and the UI-SPEC rule requires the next step to be a real affordance.
- **Fix:** The README offers switching the extension back on in the Extensions view. It also says that removing it cannot be undone in this version, and advises switching it off instead.
- **Commit:** 48b41481.

**5. [Rule 2 - Correctness] LICENSE.md also quotes the README terms line.**
- **Found during:** Task 2.
- **Issue:** The SDK's manifest names `README.md` as its licence (`SEE LICENSE IN README.md`).
- **Fix:** In addition to the verbatim `LICENSE.md`, LICENSE.md quotes the README line linking the Commercial Terms of Service and the Privacy Policy, verbatim. Nothing is paraphrased.
- **Commit:** 48b41481.

**6. [Process] The seed scenario runner was written early for the RED step.**
- **Found during:** Task 2.
- **Detail:** The Task 2 RED step used the scenario runner from `scripts/verify-bundled-extensions.mjs --seed`. That file was written during Task 2 but committed in Task 3, its owning task.

## Open items

- **Owner (D-30, P68-38, 68-CONTEXT deferred table):** confirm that Anthropic's terms permit redistributing the SDK inside the pre-installed extension, then set `terms_check` to confirmed. The linked terms are https://code.claude.com/docs/en/legal-and-compliance, plus the Commercial Terms and Privacy Policy that the SDK README links. No release carries the extension before this is confirmed.
- **Reinstall has no affordance in v1.7.** After an uninstall, the record keeps the extension out for good. Candidates:
  - a "Reinstall bundled extensions" command that clears the id from `bundledExtensions.seeded` and re-runs the seed;
  - shipping a `.vsix` the user installs through Theia's Install from VSIX.
- **Partial failure in the seed.** If one copy throws, the whole seed is logged and its record is not written that start. The next start retries, which is harmless for "no record", the only case that applies today with one extension.

## Merge note for the coordinator

- Merge after 68-07. The registry blocks sit directly after their anchors (`orca-service-live-self-test` for quick, `orca-service-live` for full), so place them after 68-07's blocks, following the stated block order.
- After merging, re-run `scripts/verify-platform.sh --only licence-allowlist`. Lane 68-04's SDK row turns green once 68-07 and 68-09 are both merged and `orca/` is rebuilt.
- The notices section for the SDK lands with lane 68-08.
- Add the brand inventory rows listed above. `scan-brand-residue` and its self-test are red on this branch until then.
- `theia/package.json` is touched by this lane only to append `extensions/bundled-extensions` to `build:extensions`. If another lane appends there too, keep both entries.
- No `theia/yarn.lock` change: `--frozen-lockfile` passed after the workspace dependency was added.

## Known Stubs

None.

## Threat Flags

None beyond the plan's register. T-68-35 is covered by npm ci with the sha512 lock, the Orca integrity equality and `--ignore-scripts` with an inert shell. T-68-36 by temporary-sibling plus rename, symlinks refused and errors swallowed. T-68-37 by `--seed` and `--live`. T-68-38 by the README leg.

## Self-Check: PASSED

- Every file in `key-files` exists on the branch.
- Commits c0d50a18, 48b41481 and 8f32a402 are ancestors of HEAD.
