---
phase: "60"
slug: "orca-from-source-on-theia-s-node"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-09"
---

# Phase 60 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Derived from 60-RESEARCH.md "Validation Architecture".

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `scripts/verify-platform.sh` registry of node/bash scripts, each with `--self-test` |
| **Config file** | none (the registry is the config) |
| **Quick run command** | `scripts/verify-platform.sh --only <label>` |
| **Full suite command** | `scripts/verify-platform.sh --quick` (about 7 minutes here); full tier adds `orca-build-shape`, `orca-slotless-start` |
| **Estimated runtime** | ~420 seconds for `--quick` |

---

## Sampling Rate

- **After every task commit:** stage new files, then `scripts/verify-platform.sh --only <touched rows>` and their `-self-test` siblings
- **After every plan wave:** `scripts/verify-platform.sh --quick`; once `orca/` is built, also `--only orca-build-shape`
- **Before `/gsd-verify-work`:** `--quick` green, `--only orca-slotless-start` and `--only orca-build-shape` green on a built tree, EXT-01 record present
- **Max feedback latency:** 420 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 60-pin | 01 | 1 | RUN-01 | T-60-01 | pin is the peeled commit, never a tag object | quick row | `scripts/verify-platform.sh --only orca-pin`; `--only orca-pin-self-test`; `--only fetch-orca-self-test` | ❌ W0 | ⬜ pending |
| 60-docs | 01 | 1 | RUN-01 | T-60-02 | manifest values validated before a sourced fragment | quick | existing `verify-rebranding-docs`, `generated-byte-identity`, `generate-check`, `verify-upstream-pins` | ✅ | ⬜ pending |
| 60-pnpm | 01 | 1 | RUN-01 | T-60-04 | no corepack download before the human legitimacy check | human | 60-01 Task 3 checkpoint:human-verify (blocking) | n/a | ⬜ pending |
| 60-W0 | 02 | 2 | RUN-01 | T-60-05, T-60-06 | --ignore-scripts; inherited ORCA_* scrubbed | build log | `nix develop .#orca --command bash scripts/build-orca.sh` (first real build; glibc-floor risk, Pitfall 4; failure goes to the 60-02 Task 2 owner decision) | ❌ W0 | ⬜ pending |
| 60-shape | 02 | 2 | RUN-02 | T-60-07, T-60-08 | no second Node runtime, no slot marker files, no Electron, no edited Orca file | full + quick self-test | `--only orca-build-shape` (SKIP line if no built orca/); `--only orca-build-shape-self-test` | ❌ W0 | ⬜ pending |
| 60-start | 03 | 3 | RUN-02 | T-60-10, T-60-11, T-60-12, T-60-13 | loopback only; pairing URL never in captured output; env scrubbed; daemon reaped | full + quick self-test | `--only orca-slotless-start` (Node 24.19.0 from node-runtime.json, web-tab pairing); `--only orca-slotless-start-self-test` | ❌ W0 | ⬜ pending |
| 60-licence | 04 | 4 | OVL-04 | T-60-17, T-60-18 | SEE LICENSE IN / NONE refused; LICENSE digest per fetched tree | quick | `--only licence-allowlist`; `--only licence-allowlist-self-test` (plants: altered licence text, unlisted SPDX id, SEE LICENSE IN, NONE allowed, fetch script without row, row without fetch script) | ❌ W0 | ⬜ pending |
| 60-brand | 04 | 4 | OVL-04 | T-60-19, T-60-20 | orca probe on the tracked tree only; rebase extra-root gate stays green | quick | `node scripts/scan-brand-residue.mjs` after `git add`; `--only scan-brand-residue-self-test` (plants: unclaimed Orca, wrong expected_count, extra-root Orca ignored while sourcerer still red); `node scripts/scan-brand-residue.mjs --extra-root upstream` | ✅ (extend) | ⬜ pending |
| 60-ext | 05 | 4 | EXT-01 | T-60-21, T-60-22, T-60-23 | proprietary extension installed at runtime from Open VSX, never redistributed; no credential recorded | human | 60-05 Task 2 checkpoint:human-verify with Chris: open the Orca worktree folder in Theia, start a Claude Code session, answer a prompt, edit a file; record version and panel/terminal mode in 60-EXT01-RECORD.md | n/a | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] First real build in `.#orca` with the log captured (Pitfall 4: node-pty glibc floor on NixOS glibc 2.42)
- [ ] `scripts/fetch-orca.sh` (+ `--self-test`), `scripts/build-orca.sh` (de-slot step), `scripts/verify-orca-pin.mjs`, `scripts/verify-orca-build-shape.mjs`, `scripts/lib/orca-run.mjs`, `scripts/verify-orca-slotless-start.mjs`, `scripts/verify-licence-allowlist.mjs`, each with `--self-test`, registered as rows
- [ ] `flake.nix` `devShells.orca`; `.gitignore` `/orca/` (anchored)
- [ ] `config-schema.json` optional `upstreams.orca_*` rows; `generate.mjs` emitter (`UPSTREAM_ORCA_TAG`, `UPSTREAM_ORCA_COMMIT`); `docs/REBRANDING.md` rows; `docs/BUILD.md` section
- [ ] `inventory/brand-tokens.json` `orca` probe plus `coincidental` rows (P60-R2); `inventory/licence-allowlist.json` (P60-R1)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Claude Code extension session in an Orca worktree inside Theia 1.76 | EXT-01 | needs Chris's Claude login and a live Theia; judgement of the chat panel | Claude installs the extension from Open VSX into the built app, opens the worktree folder, Chris starts a session, asks a prompt, accepts an edit; record extension version, chat-panel vs `claudeCode.useTerminal`, any failure message |
| 1.4.248 → 1.4.245 fallback decision | RUN-02 | owner decision on a failed probe (D-04) | record exit code, message, slot file found; both pins failing stops and asks Chris |
| pnpm 12.14.0 first corepack download | RUN-01 | package-legitimacy SUS (too-new) | one `checkpoint:human-verify` before the first download (P59-10) |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 420s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
