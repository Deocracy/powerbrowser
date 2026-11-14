---
phase: 60-orca-from-source-on-theia-s-node
verified: 2026-11-13T00:00:00Z
status: human_needed
score: 3/4 must-haves verified
covered_files: [".gitignore", ".planning/workstreams/orca/phases/60-orca-from-source-on-theia-s-node/60-01-PLAN.md", ".planning/workstreams/orca/phases/60-orca-from-source-on-theia-s-node/60-01-SUMMARY.md", ".planning/workstreams/orca/phases/60-orca-from-source-on-theia-s-node/60-02-PLAN.md", ".planning/workstreams/orca/phases/60-orca-from-source-on-theia-s-node/60-02-SUMMARY.md", ".planning/workstreams/orca/phases/60-orca-from-source-on-theia-s-node/60-03-PLAN.md", ".planning/workstreams/orca/phases/60-orca-from-source-on-theia-s-node/60-03-SUMMARY.md", ".planning/workstreams/orca/phases/60-orca-from-source-on-theia-s-node/60-04-PLAN.md", ".planning/workstreams/orca/phases/60-orca-from-source-on-theia-s-node/60-04-SUMMARY.md", ".planning/workstreams/orca/phases/60-orca-from-source-on-theia-s-node/60-05-PLAN.md", "configuration.toml", "docs/BUILD.md", "flake.nix", "inventory/brand-tokens.json", "inventory/licence-allowlist.json", "scripts/build-orca.sh", "scripts/fetch-orca.sh", "scripts/generate-licensing.mjs", "scripts/generate.mjs", "scripts/lib/config-schema.json", "scripts/lib/orca-run.mjs", "scripts/scan-brand-residue.mjs", "scripts/verify-licence-allowlist.mjs", "scripts/verify-orca-build-shape.mjs", "scripts/verify-orca-pin.mjs", "scripts/verify-orca-slotless-start.mjs", "scripts/verify-platform.sh"]
covered_digest: "v3:sha256:17b4d4bee1246e1dc9d1afcfe154ce71eab99eb392e95ac94bf9258f4588bc29"
behavior_unverified: 0
overrides_applied: 0
requirements_coverage:
  RUN-01: satisfied
  RUN-02: satisfied
  OVL-04: satisfied
  EXT-01: human_needed
human_verification:
  - test: "EXT-01 live session (60-05 Task 2): open the Orca worktree /home/chris/orca/workspaces/scratch-repo/ext01 (created by PB's own orcad profile) in PowerBrowser's Theia 1.76, install Anthropic.claude-code from Open VSX through the Extensions view, sign in with your own Claude login, start a chat-panel session, ask a question, accept a file edit; if the panel fails, retry with claudeCode.useTerminal"
    expected: "The chat panel starts a session on the worktree, answers, and the edited file changes on disk. 60-EXT01-RECORD.md ## Outcome records the extension version, chat-panel and terminal-mode outcomes, login outcome and exact failure text; on any non-pass it gains '## EXT-02 reshaping for Phase 63'."
    why_human: "Needs a headed PowerBrowser, a personal Claude login and a live extension session (P59-08); 60-05 is owner-only and was deferred to the end-of-milestone pass (P60-R5)."
  - test: "Review the four 60-05 prohibitions once the session has run: the extension is never pinned/packaged/allow-listed; no credential, OAuth code, API key or pairing URL in the record, SUMMARY, logs or chat; orcad never on the real Orca profile; 60-05 changes no tracked file outside .planning/"
    expected: "All four hold after the live session is recorded."
    why_human: "Prohibitions are judgment-tier (verification: unverified) and the plan that they govern has not executed. Non-authoritative pre-check below found no violation."
---

# Phase 60: Orca from source on Theia's Node — Verification Report

**Phase Goal:** PowerBrowser builds orcad and Orca's web client from source at the pinned Orca tag, orcad starts slot-less on Theia's Node 24.19.0 with no second runtime, and the Claude Code extension is proven or disproven on Theia 1.76 against an Orca worktree.
**Verified:** 2026-11-13 (tree 5d05e3ad, branch ServerDestroyer/v1.7-Orca-integration)
**Status:** human_needed
**Re-verification:** No — initial verification

Static verification only. No PowerBrowser, orcad, build or live row was launched. The worktree carries no `orca/` and no `upstream/`. Live-tree facts were read as plain files from the main checkout's built `orca/` and its `.mozbuild/` logs. Those logs were written by the scripts themselves, not by a SUMMARY.

## Goal Achievement

### Observable Truths (ROADMAP success criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | From a Nix dev shell carrying pnpm 12.14.0, one script fetches Orca at the tag pinned in configuration.toml and runs Orca's own build:orcad and build:web; a --quick row derives the pin and goes red on a different tag in the fetched tree or generated files; its --self-test plants a mismatched tag | ✓ VERIFIED | `configuration.toml:161-162` pins v1.4.248 / peeled commit 965978bc. `generate.mjs` emits UPSTREAM_ORCA_TAG/COMMIT (regenerated here). `scripts/build-orca.sh` step 1 runs `fetch-orca.sh` (fetch or verify at pin), step 5 derives pnpm from orca/package.json `packageManager` (pnpm@12.14.0 in the built tree) and refuses a mismatch, then runs `pnpm run build:orcad` and `pnpm run build:web`. `devShells.orca` = nodejs_24 + corepack_24 + binutils. `orca-pin` PASS; `orca-pin --self-test` 9 plants red incl. `fragment-tag-mismatch`, `orca-checkout-at-other-tag`; `fetch-orca.sh --self-test` PASS. No pin literal in any phase script (grep count 0). Recorded build logs: `build-orca: PASS -- built v1.4.248 (965978bc…)` at 2026-11-09 and 2026-11-11. |
| 2 | The built orcad starts with no slot runtime marker files on Theia's Node 24.19.0, prints its ready line and answers on loopback; a check derives the Node runtimes and finds exactly one; D-04 fallback recorded if 1.4.248 fails | ✓ VERIFIED | `build-orca.sh` step 7 removes `.server-target`, `.runtime-node`, `.version`, `out/runtimes`. Built tree in the main checkout: all four absent, no node/node.exe/electron file under `out/`, no `node_modules/electron/dist`. `orca-run.mjs ensurePbNode` uses the sha256-checked linux-x64 binary from `powerbrowser/packaging/node-runtime.json` (v24.19.0), never PATH. `verify-orca-slotless-start.mjs` fails on non-`ws://127.0.0.1:` bind, nodeVersion != pin, runtime set != 1. Self-test PASS (control plus 7 planted faults plus leak sentinel). Recorded row output `.mozbuild/p68-06/plat02/orca-slotless-start.log` (2026-11-11): `PASS -- orcad 1.4.248 ready on ws://127.0.0.1:34481, Node 24.19.0 (node-runtime.json), 1 Node runtime, web tab paired …, orcad and terminal daemon reaped`. `orca-build-shape` rc=0 PASS in the same results file. The v1.7 gate at d55a380b had only 2 non-excluded reds, both other rows. 1.4.248 passed, so the fallback was not needed. |
| 3 | scan-brand-residue exits 0 over the staged tree incl. every Orca-related file, "Orca" classified only in inventory/brand-tokens.json, and Orca's MIT licence has a licence allow-list row | ✓ VERIFIED | Ran here: `scan-brand-residue: PASS -- no residual brand occurrence in 835 scanned file(s)`. `scope.tracked_residue_probes = ["orca"]`. Self-test proves an unclaimed Orca goes red and an over-count row goes red. `inventory/licence-allowlist.json` orca row: MIT, Lovecast Inc., `licence_file_sha256 ff1b611f…`, which equals `sha256sum` of the built tree's orca/LICENSE. `licence-allowlist` PASS, `--self-test` 19 plants red. |
| 4 | The user opens an orcad-created Orca worktree in PB's Theia; the Claude Code extension starts a session, answers a prompt, edits a file; outcome and version recorded; a failure reshapes EXT-02 | ? HUMAN NEEDED | Preparation exists: `60-EXT01-RECORD.md` records the scratch repo, the PB-profile worktree `/home/chris/orca/workspaces/scratch-repo/ext01`, and Open VSX Anthropic.claude-code 2.1.321 (engines ^1.94.0 vs Theia's 1.139.0). `## Outcome` reads "Pending — deferred to the end-of-milestone human pass (P60-R5)". 60-05 Task 2 is owner-only. This is not a code gap. |

**Score:** 3/4 truths verified (0 present, behavior-unverified; 1 human-needed)

### Plan must-haves (60-01..60-04)

All plan truths of 60-01..60-04 map onto SC1-SC3 above and hold. Specific checks:
- orca-build-shape derives marker names from `orcad-artifacts.ts`. Its self-test plant `marker-constant-removed` goes red, and fixture names `.fixture-*` prove the names are derived.
- Installs run `--ignore-scripts` with `ELECTRON_SKIP_BINARY_DOWNLOAD=1`. No Electron binary is in the built tree.
- The ORCA_* scrub is asserted in both build-orca.sh and orcadEnv. The self-test plants an inherited ORCA_PAIRING_CODE.
- Pairing-URL redaction has a self-test with a sentinel.
- The orca probe is tracked-tree only. The self-test covers the extra-root half. `--extra-root upstream` was not re-run here because there is no upstream/ in the worktree.

### Required Artifacts

`gsd-tools verify.artifacts` per plan: 60-01 5/5, 60-02 3/3, 60-03 2/2, 60-04 4/4. 60-05 0/1: 60-EXT01-RECORD.md lacks `## EXT-02 reshaping for Phase 63`. The plan requires that section only on a non-pass, and the outcome is still pending.

| Artifact | Status | Details |
|----------|--------|---------|
| `scripts/fetch-orca.sh` | ✓ VERIFIED | 234 lines; verify-or-clone into orca.partial; called by build-orca.sh step 1 |
| `scripts/build-orca.sh` | ✓ VERIFIED | 236 lines; has since grown overlay/panes/browser-host steps (Phases 62, 64, 66); the Phase 60 steps are intact |
| `scripts/verify-orca-pin.mjs` | ✓ VERIFIED | quick rows `orca-pin`, `orca-pin-self-test` |
| `scripts/verify-orca-build-shape.mjs` | ✓ VERIFIED | quick self-test row; full row `orca-build-shape` |
| `scripts/lib/orca-run.mjs` | ✓ VERIFIED | imported by verify-orca-slotless-start.mjs (and later phases) |
| `scripts/verify-orca-slotless-start.mjs` | ✓ VERIFIED | quick self-test row; full row `orca-slotless-start` |
| `inventory/licence-allowlist.json` / `scripts/verify-licence-allowlist.mjs` | ✓ VERIFIED | quick rows `licence-allowlist`, `licence-allowlist-self-test` |
| `inventory/brand-tokens.json` orca rows / `scan-brand-residue.mjs` | ✓ VERIFIED | permanent quick gate |
| `flake.nix devShells.orca` | ✓ VERIFIED | nodejs_24, corepack_24, python3, pkg-config, gnumake, binutils |
| `60-EXT01-RECORD.md` | ⚠️ PARTIAL (pending human) | preparation and Open VSX facts recorded; outcome pending |

### Key Link Verification

`gsd-tools verify.key-links`: 60-01 3/3, 60-02 3/3, 60-03 3/3, 60-04 3/3, 60-05 2/2. All are WIRED.

### Behavioral Spot-Checks (run here)

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Pin agrees across manifest/fragment/scripts/flake | `node scripts/verify-orca-pin.mjs` | PASS (orca/ absent, checkout step skipped) | ✓ PASS |
| Pin drift goes red | `node scripts/verify-orca-pin.mjs --self-test` | 9 plants red | ✓ PASS |
| Fetch logic | `bash scripts/fetch-orca.sh --self-test` | 7 cases PASS | ✓ PASS |
| Build-shape drift goes red | `node scripts/verify-orca-build-shape.mjs --self-test` | 10 plants red | ✓ PASS |
| Slot-less probe logic | `node scripts/verify-orca-slotless-start.mjs --self-test` | PASS | ✓ PASS |
| Licence allow-list | `node scripts/verify-licence-allowlist.mjs` (+ `--self-test`) | PASS; 19 plants red | ✓ PASS |
| Brand scan | `node scripts/scan-brand-residue.mjs` (+ `--self-test`) | PASS, 835 files | ✓ PASS |
| Registry wiring | `scripts/verify-platform.sh --only` each of the 7 quick rows | PASS | ✓ PASS |
| Live orcad start | `orca-slotless-start` (full tier) | not run (live, excluded by scope); recorded PASS 2026-11-11 | ? SKIP (recorded evidence) |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| RUN-01 | 60-01, 60-02 | Build orcad and web client from source at a pinned tag with Orca's own scripts from a Nix shell with pnpm 12.14.0; pin in configuration.toml proved by a --quick check | ✓ SATISFIED | Truth 1 |
| RUN-02 | 60-02, 60-03 | orcad runs slot-less on Theia's Node 24.19.0; no second Node runtime shipped | ✓ SATISFIED | Truth 2 |
| OVL-04 | 60-04 | "Orca" classified only in brand-tokens.json; licence row; brand scan green | ✓ SATISFIED | Truth 3 |
| EXT-01 | 60-05 | Claude Code VS Code extension runs on Theia 1.76 on Orca worktrees | ? NEEDS HUMAN | Truth 4; 60-05 Task 2 |

No orphaned requirements: REQUIREMENTS.md maps exactly RUN-01, RUN-02, OVL-04 and EXT-01 to Phase 60.

### Prohibitions (60-05, judgment-tier, non-authoritative)

| Prohibition | LLM-judge pre-check | Flag |
|-------------|--------------------|------|
| Claude Code extension never pinned in [[extensions]]/theiaPlugins, packaged or allow-listed | No match in configuration.toml, theia/applications/*/package.json, licence-allowlist.json | unverified-prohibition — human review recommended |
| No credential/OAuth code/API key/pairing URL in record, SUMMARY, log or chat | 60-EXT01-RECORD.md contains none | unverified-prohibition — human review recommended |
| orcad never on the real Orca profile; inherited ORCA_* removed | orcadEnv scrub + self-test plant; the record's profile is under .mozbuild/ext01 | unverified-prohibition — human review recommended |
| 60-05 changes no tracked file outside .planning/ | 60-05 has no commits | unverified-prohibition — human review recommended |

### Anti-Patterns Found

None. There are no TBD/FIXME/XXX/TODO/HACK markers in the phase's files, and no pin literal sits in the scripts.

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| ROADMAP SC4 ordering | — | Phase 63 was planned and executed before the EXT-01 outcome existed, though SC4 asks a failure to reshape EXT-02 "before that phase is planned" | ℹ️ Info | Owner-accepted by the verification-at-the-end ruling. Phase 63 chose the plain `claude` CLI route (spike 006), and EXT-02's extension half is held for the same human pass. If EXT-01 fails, EXT-02 needs re-scoping after the fact. |

### Human Verification Required

#### 1. EXT-01 live session (60-05 Task 2)

**Test:** Relaunch headed PowerBrowser and open the worktree `/home/chris/orca/workspaces/scratch-repo/ext01`. Install Anthropic.claude-code from Open VSX, sign in, ask a question in the chat panel and accept a file edit. If the panel fails, retry with `claudeCode.useTerminal`.
**Expected:** The session runs and the file changes on disk. The outcome, version, login result and exact failure text go into 60-EXT01-RECORD.md. A non-pass adds `## EXT-02 reshaping for Phase 63`.
**Why human:** It needs a personal Claude login and a headed, live extension session. The work is owner-only (P59-08, P60-R5).

#### 2. 60-05 prohibitions review

**Test:** After item 1, confirm the four prohibitions above.
**Expected:** All hold.
**Why human:** These are judgment-tier prohibitions over work that has not yet run.

### Gaps Summary

No code gaps. RUN-01, RUN-02 and OVL-04 are delivered and guarded by quick-tier rows with planted-fault self-tests. All of those pass on this tree. RUN-02's live half has recorded green row output from 2026-11-11 and a clean v1.7 gate. EXT-01 is the only open item. It is a human-only live session (60-05 Task 2) whose preparation is recorded. It is not a missing implementation.

---

_Verified: 2026-11-13_
_Verifier: Claude (gsd-verifier)_
