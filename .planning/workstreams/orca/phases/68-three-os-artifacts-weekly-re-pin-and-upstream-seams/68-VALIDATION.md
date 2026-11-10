---
phase: "68"
slug: "three-os-artifacts-weekly-re-pin-and-upstream-seams"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-09"
---

# Phase 68 — Validation Strategy

> Per-phase validation contract. Derived from 68-RESEARCH.md "Validation Architecture" and the amended picks P68-24..P68-37 in 68-CONTEXT.md. Human checks are only the D-18 deferred items (stock Android pairing, macOS and Windows smoke tests, upstream issues and PRs, the first live weekly tick, the owner rulings 68-A and 68-B).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node 24 and bash scripts registered as rows in `scripts/verify-platform.sh`; no unit framework |
| **Config file** | none (registry rows; quick anchor after line 3883 `orca-service-live-self-test`, full anchor after line 6466 `orca-service-live`) |
| **Quick run command** | `scripts/verify-platform.sh --only <label>` |
| **Full suite command** | `scripts/verify-platform.sh --quick` (about 7 minutes); full and live rows `scripts/verify-platform.sh --only <label>` under `flock /home/chris/coding/Power-Browser/.git/pb-live.lock` |
| **Estimated runtime** | ~420 seconds for `--quick` |

---

## Sampling Rate

- **After every task commit:** the lane's quick rows via `--only`, plus `node scripts/scan-brand-residue.mjs` after staging new files
- **After every plan wave:** `scripts/verify-platform.sh --quick` at each lane merge (wave 1 order 03, 04, 01, 02; wave 2 adds 05)
- **Before `/gsd-verify-work`:** `--quick` green; wave 2 adds the container release build, then `--only orca-packaged-tree`, `portable-elf`, `package-target-natives`, `sidecar-no-symlinks`, `orca-packaged-live` and every full Orca row of Phases 60-67 under the live lock
- **Max feedback latency:** 420 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 68-tree | 01 | 1 | PLAT-01 | T-68-xx | staged `<GreD>/orca` equals built `package.json` + `out/orcad` + `out/web`; no Node executable, slot marker or Electron binary; node-pty slot sha set and platform/arch equal the target (P68-33) | full + quick self-test | `--only orca-packaged-tree` (`--target linux-x64\|win64\|macos`, `--stage`, `--prebuild-manifest`); `--only orca-packaged-tree-self-test` (plants: missing file, extra file, `node`/`node.exe`, `.server-target`, Electron ELF, slot from another platform, slot sha mismatch, empty stage "vacuous") | ❌ W0 | ⬜ pending |
| 68-natives | 01 | 1 | PLAT-01 | T-68-xx | every ELF/PE/Mach-O in the stage is the target architecture, judged by magic | full + quick self-test | `--only package-target-natives`; `--only package-target-natives-self-test` (plants: wrong-arch Mach-O under `orca/`, unnamed executable shaped like `spawn-helper`, PE32 (not +) under `orca/`) | ✅ (edit) | ⬜ pending |
| 68-elf | 01 | 1 | PLAT-01 | — | no Nix interpreter or RUNPATH; GLIBC <= 2.28 including Orca's `pty.node` | full | `--only portable-elf` (universe unchanged, covers `orca/` once staged; `patchelf --remove-rpath` loop extended) | ✅ | ⬜ pending |
| 68-symlinks | 01 | 1 | PLAT-01 | — | no symlink in the tarball including `orca/` | full | `--only sidecar-no-symlinks` | ✅ | ⬜ pending |
| 68-hostroot | 01 | 1 | PLAT-01 | T-68-xx | no staged file names the host build root; the container's `/src/` is never the search string (P68-29) | full | `package-linux.sh` grep over `theia/`, `node/`, `orca/` for `PB_HOST_ROOT`; `--only release-shape` checks `-e PB_HOST_ROOT` on the packaging step | ✅ (edit) | ⬜ pending |
| 68-flatpak | 01 | 1 | PLAT-01 | — | finish-args equal the allow-list as a set including `--filesystem=home` | quick | `--only flathub-manifest`, `--only flathub-manifest-self-test` (new plant: remove `--filesystem=home`; existing `--filesystem=host` plant stays) | ✅ (edit) | ⬜ pending |
| 68-release-shape | 01 | 1 | PLAT-01 | T-68-xx | `windows-orca`, `macos-orca-arm64`, `macos-orca-x64`, `macos-orca-universal` carry the hosted trust shape; no Linux job needs them; `orca-packaged-tree` is among build-linux's packaged labels | quick | `--only release-shape`, `--only release-shape-self-test`, `--only build-windows-shape`, `--only build-windows-shape-self-test`, `--only workflows` (plants: Linux job `needs: windows-orca`; `windows-orca` with a secret or environment; digest read from `vars.`; matrix for the macOS thin jobs; packaged step drops `orca-packaged-tree`) | ✅ (edit) | ⬜ pending |
| 68-win-admit | 01 | 1 | PLAT-01 | T-68-xx | the hosted Orca artifact is admitted by the out-of-band digest and purged of the hosted build root | quick | `--only win-sidecar-check-self-test` (script reused unchanged) | ✅ | ⬜ pending |
| 68-sign-list | 01 | 1 | PLAT-01 | T-68-xx | sign list learns the Orca PE set from the admitted `SHA256SUMS`; `@` admitted, `..`/leading slash/symlink still refused | quick | `--only win-sign-list-self-test` (plants: Orca PE not in SUMS; SUMS PE absent from zip; `@` name refused by the old regex) | ✅ (edit) | ⬜ pending |
| 68-macos-merge | 01 | 1 | PLAT-01 | — | universal merge plan derived from Orca's arch tables; every non-native file byte-identical | quick | `--only orca-macos-merge-self-test` (plants: arch-named file without a pair, differing non-native file, table yields zero pairs "source moved") | ❌ W0 | ⬜ pending |
| 68-portable | 01 | 1 | PLAT-01 | — | `build-orca.sh` runs on Git Bash and macOS bash >= 4 | quick | `--only build-orca-portable-self-test` (plants: unguarded `objdump`, `find -printf`, sourcing a missing pins fragment) | ❌ W0 | ⬜ pending |
| 68-win-node | 01 | 1 | PLAT-01 | — | both services find the staged Windows `node/node.exe` before `pathSearch` (P68-32) | quick | `--only orca-service`, `--only orca-service-self-test`, `--only internals-boundary`, `--only shell-error-copy-no-internals`, `--only start-path-recovery` | ✅ (edit) | ⬜ pending |
| 68-live-selftest | 01 | 1 | PLAT-02 | — | the live row's pure verdicts | quick | `--only orca-packaged-live-self-test` (plants: exe from another Node, root not under GreD, survivor after quit, paired=false) | ❌ W0 | ⬜ pending |
| 68-tick | 02 | 1 | OVL-02 | — | weekly tick decided without a `schedule:` key | quick | `--only release-train-logic-self-test` (`orcaDue` fixtures: Monday, missed Monday, same week, ISO year boundary, null) | ✅ (edit) | ⬜ pending |
| 68-select | 02 | 1 | OVL-02 | T-68-xx | candidate is the newest strict `vN.N.N` tag, strictly newer than the pin; open `chore/orca-*` holds | quick | `--only detect-upstreams-self-test` (`--orca-select` plants: `-rc.N`, `.perf`, `mobile-android-v*`, lightweight tag, not newer, equal, open-PR hold, `v1.4.9` vs `v1.4.10`) | ✅ (edit) | ⬜ pending |
| 68-replay | 02 | 1 | OVL-02 | T-68-xx | replay stops at the named stage; typecheck covers the overlay files; a SKIP from a called row is red | quick | `--only rebase-orca-self-test` (control green first; plants: seam conflict -> `seam-apply <patch>`; type error -> `typecheck:web <file>:<line>`; overlay file outside the program -> `typecheck coverage`; brand token; changed LICENSE; a called row prints SKIP) | ❌ W0 | ⬜ pending |
| 68-replay-wf | 02 | 1 | OVL-02 | — | `rebase-orca.yml` carries no tag, no commit and no `schedule:` | quick | `--only verify-upstream-pins`, `--only verify-upstream-pins-self-test` (plants: default tag, literal commit, `schedule:`) | ✅ (edit) | ⬜ pending |
| 68-orcad-only | 02 | 1 | OVL-02 | — | orcad half of the start probe runs without a built PowerBrowser and never SKIPs for that reason | full + quick self-test | `--only orca-slotless-start` (called by `rebase-orca.sh` as `--orcad-only`); `--only orca-slotless-start-self-test` (plants: `--orcad-only` still opening a browser; SKIP when PowerBrowser is absent in `--orcad-only`) | ✅ (edit) | ⬜ pending |
| 68-bump | 02 | 1 | OVL-02 | T-68-xx | bump commits only explicit paths; App token minted after a replay-only run; auto-merge armed; red opens one issue | quick | `--only workflows`, `--only workflows-self-test` (plants: bump stages a workflow file; mint before replay; `gh pr merge` without `--auto`) | ✅ (edit) | ⬜ pending |
| 68-protocol | 03 | 1 | OVL-03 | — | overlay touches no protected path (root 1 transitive, root 2 own files, P68-26) | quick | `--only orca-mobile-protocol` (SKIP by a line without `orca/`), `--only orca-mobile-protocol-self-test` (plants: seam on `src/shared/protocol-version.ts`; overlay file shadowing a closure file; closure size 0 "source moved") | ❌ W0 | ⬜ pending |
| 68-skew | 03 | 1 | OVL-03 | — | tag lag, app lag and the `evaluateCompat` verdict; `blocked` is red | full + quick self-test | `--only orca-mobile-skew` (network read); `--only orca-mobile-skew-self-test` (plants: `blocked`, `mobile-too-old`, `desktop-too-old`, listing with no app tag, constants file moved) | ❌ W0 | ⬜ pending |
| 68-seam-key | 03 | 1 | OVL-06 | — | every seam row has `upstream.class`; `pr` null or a PR URL on the repository derived from `fetch-orca.sh` REMOTE | quick | `--only orca-overlay`, `--only orca-overlay-self-test` (plants: missing key, unknown class, URL on another repository, non-PR URL) | ✅ (edit) | ⬜ pending |
| 68-export | 03 | 1 | OVL-06 | — | export writes patch, issue body, PR body with the template's derived headings and the test command; refuses PB tokens | quick | `--only orca-seam-export-self-test` (plants: template heading missing from the body, `PowerBrowser` in the patch, patch not applying to fixture main) | ❌ W0 | ⬜ pending |
| 68-notices | 04 | 1 | PLAT-01 | T-68-xx | notices cover the bundle-derived shipped Orca closure, compared as a set both ways (P68-24) | quick | `--only licensing` (`--check`; the closure step SKIPs by a line without built `orca/`), `--only licensing-self-test` (plants: package in the metafile but missing from the notices; Orca notice for a package that does not ship) | ✅ (edit) | ⬜ pending |
| 68-licence-gate | 04 | 1 | PLAT-01 | T-68-xx | proprietary or non-SPDX shipped packages need a named row; the SDK is printed `PENDING RULING`, never counted as a pass (P68-25) | quick | `--only licence-allowlist`, `--only licence-allowlist-self-test` (plants: `SEE LICENSE IN` package with no row; no field and no file; GPL-only expression; stale pending row; pending row printed as a pass) | ✅ (edit) | ⬜ pending |
| 68-rulings | 04 | 1 | PLAT-01 | T-68-xx | a pending owner ruling is red until the ruling replaces the row | full | `--only orca-licence-rulings` (red naming `@anthropic-ai/claude-agent-sdk@0.3.284` until ruling 68-A; `GATE_KNOWN_OPEN_EXCLUSIONS` entry keyed to the WINDOWS.md id, added by the coordinator) | ❌ W0 | ⬜ pending |
| 68-upstream-prs | 05 | 2 | OVL-06 | — | the three D-27 classes each have a PR URL | full | `--only orca-upstream-prs` (red until the owner records URLs; `GATE_KNOWN_OPEN_EXCLUSIONS` entry tied to a WINDOWS.md id) | ❌ W0 | ⬜ pending |
| 68-live | 06 | 2 | PLAT-02 | — | packaged orcad ready from `<GreD>/orca`; `/proc/<pid>/exe` = `<GreD>/node/bin/node`; web tab pairs; reaped on quit | full (live) | `--only orca-packaged-live` over the container-built tarball, under the live lock | ❌ W0 | ⬜ pending |
| 68-coord | 06 | 2 | all | — | N/A | quick + full + live | `--quick`; container release build and `package-linux.sh`; `--only orca-packaged-tree`, `portable-elf`, `package-target-natives`, `sidecar-no-symlinks`, `orca-packaged-live`; every full Orca row of 60-67 (`orca-build-shape`, `orca-slotless-start`, `orca-overlay-built`, `orca-service-live`, `orca-hidden-electron`, and 63-67's); brand rows re-measured | n/a | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `scripts/verify-orca-packaged-tree.mjs`, `scripts/verify-orca-packaged-live.mjs`, `scripts/verify-orca-mobile-protocol.mjs`, `scripts/export-orca-seam-pr.mjs`, `scripts/rebase-orca.sh`, each with `--self-test` and exit 2 on an unknown argument with a `Next step:` line
- [ ] `scripts/lib/orca-shipped-packages.mjs` (bundle-derived shipped package set) before `licensing --check` and `licence-allowlist` use it
- [ ] Fixture Orca repository builder shared by `rebase-orca-self-test` (two `v` tags, a `package.json` whose `typecheck:*` scripts are Node checkers; reached through functions taking a remote, never an environment variable)
- [ ] The macOS merge-plan derivation and the `build-orca.sh` static portability check behind `orca-macos-merge-self-test` and `build-orca-portable-self-test`
- [ ] Rows appended in each lane's commented block at the two registry anchors; coordinator resolves `scripts/verify-platform.sh`
- [ ] Brand rows re-measured once after the merges (coordinator)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Stock Android Orca app pairs with PowerBrowser's orcad | OVL-03 | Needs an Android device and the owner (D-18) | End pass: pair through Orca's relay; record the result beside `orca-mobile-skew` output |
| macOS smoke test of a build with Orca | PLAT-02 | No Mac; Phase 55 blockers (D-24) | End pass when a host exists |
| Windows smoke test of a build with Orca | PLAT-02 | Windows VM is CF-10 | End pass when the VM exists |
| Upstream issue and PR per D-27 seam | OVL-06 | Owner's GitHub identity and org ruling | End pass: open each, record the URL in `seams.json`; `orca-upstream-prs` turns green |
| First live weekly tick, bump PR with auto-merge armed, owner approval | OVL-02 | Needs a push of `main` by Chris | End pass |
| Rulings 68-A (agent SDK) and 68-B (permissive SPDX set) | PLAT-01 | Owner decisions | End pass; `orca-licence-rulings` turns green when 68-A replaces the pending row |

Overrides of the auto-mode picks P68-01..P68-37 are Chris's at any time.

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 420s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
