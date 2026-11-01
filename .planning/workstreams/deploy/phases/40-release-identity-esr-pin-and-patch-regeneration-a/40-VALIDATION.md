---
phase: "40"
slug: "release-identity-esr-pin-and-patch-regeneration-a"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-10-20"
---

# Phase 40 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `scripts/verify-platform.sh` registry plus per-script `--self-test` (node built-ins, bash) |
| **Config file** | none — rows are the `CHECKS=(` array in `scripts/verify-platform.sh` |
| **Quick run command** | `scripts/verify-platform.sh --only <label>` (and `<label>-self-test`) |
| **Full suite command** | `scripts/verify-platform.sh --quick` |
| **Estimated runtime** | ~60 seconds (`--quick`, 58 s on 2026-10-20) |

---

## Sampling Rate

- **After every task commit:** `scripts/verify-platform.sh --only <new label>` and its `-self-test`; `node scripts/scan-brand-residue.mjs` after `git add`
- **After every plan wave:** `scripts/verify-platform.sh --quick`
- **Before `/gsd-verify-work`:** `--quick` green, plus one dev build with `--only ng064-update-url-from-manifest`, `--only mar-update-hop` and the manual About-dialog check
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 40-01-T1 | 01 | 1 | DIST-06 | T-40-03 | Manifest pin = workflow default = fragment; upstream at 6cd88e7d | quick | `test "$(git -C upstream rev-parse HEAD)" = 6cd88e7d45fe7a5b0b87b984fb32a8779151860e && scripts/verify-platform.sh --only verify-upstream-pins` | ✅ | ⬜ pending |
| 40-01-T2 | 01 | 1 | AUTO-08 | T-40-01, T-40-02 | No `tag` default under either trigger; generator steps inside Nix; tag via `env:` | quick + self-test | `scripts/verify-platform.sh --only verify-upstream-pins && scripts/verify-platform.sh --only verify-upstream-pins-self-test` | ✅ (extend) | ⬜ pending |
| 40-02-T1 | 02 | 2 | AUTO-10 | T-40-05 | Every patch equals its regeneration; replay runs the gate | quick | `scripts/verify-platform.sh --only patches-regenerated` | ❌ created in task | ⬜ pending |
| 40-02-T2 | 02 | 2 | AUTO-10 | T-40-06, T-40-07 | Hand-edited hunk red naming the patch; write mode never truncates | self-test | `scripts/verify-platform.sh --only patches-regenerated-self-test` | ❌ created in task | ⬜ pending |
| 40-03-T1 | 03 | 3 | REL-01 | T-40-09, T-40-10 | revision → release.txt byte-identical (staged; committed with T2) | quick | `scripts/verify-platform.sh --only generated-byte-identity && scripts/verify-platform.sh --only generate-self-test` | ✅ (EXPECTED +2) | ⬜ pending |
| 40-03-T2 | 03 | 3 | REL-01 | T-40-09 | Every fixture manifest states product.revision; key and fixtures in one commit | quick | `scripts/verify-platform.sh --only verify-downstream-fixtures && scripts/verify-platform.sh --quick` | ✅ (fixtures +1 line) | ⬜ pending |
| 40-03-T3 | 03 | 3 | REL-01 | T-40-08 | Version files, descriptors and tags agree with the derivation | quick + self-test | `scripts/verify-platform.sh --only release-identity && scripts/verify-platform.sh --only release-identity-self-test` | ❌ created in task | ⬜ pending |
| 40-04-T1 | 04 | 4 | UPD-11 | T-40-12 | One channel across consumers | quick | `scripts/verify-platform.sh --only update-channel` | ❌ created in task | ⬜ pending |
| 40-04-T2 | 04 | 4 | UPD-12, UPD-11 | T-40-11 | No update-URL policy; channel plants red | quick + self-test | `scripts/verify-platform.sh --only update-channel-self-test && scripts/verify-platform.sh --only mar-update-hop-self-test` | ❌ / ✅ (edit) | ⬜ pending |
| 40-05-T1 | 05 | 5 | UPD-33 | T-40-14 | `user-initiated` accepted; unattended request red naming host | quick + self-test | `scripts/verify-platform.sh --only endpoint-dispositions-self-test && scripts/verify-platform.sh --only allowlist-schema` | ❌ / ✅ (edit) | ⬜ pending |
| 40-05-T2 | 05 | 5 | UPD-13 | T-40-15, T-40-16 | Link prefs derived; powerbrowser.org and github.com user-initiated | quick | `scripts/verify-platform.sh --only generated-byte-identity && scripts/verify-platform.sh --only theia-endpoints` | ✅ | ⬜ pending |
| 40-06-T1 | 06 | 6 | UPD-25 | T-40-17 | langpack false; five cadence prefs absent; link prefs parse | quick | `scripts/verify-platform.sh --only update-prefs` | ❌ created in task | ⬜ pending |
| 40-06-T2 | 06 | 6 | UPD-25 | T-40-17 | Planted app.update.auto red; exact-name control green | self-test | `scripts/verify-platform.sh --only update-prefs-self-test` | ❌ created in task | ⬜ pending |
| 40-07-T1 | 07 | 7 | PKG-08 | T-40-19, T-40-20 | about:license notices equal re-derivation | quick | `scripts/verify-platform.sh --only licensing` | ❌ created in task | ⬜ pending |
| 40-07-T2 | 07 | 7 | PKG-08, PKG-09 | T-40-18 | Theia and Node sections; add/remove red; en-US stated | quick + self-test + grep | `scripts/verify-platform.sh --only licensing-self-test && grep -n 'en-US only' README.md .planning/PROJECT.md` | ❌ created in task / ✅ (edit) | ⬜ pending |
| 40-08-T1 | 08 | 8 | DIST-06, UPD-11 | — | 153.5.1esr builds; config.status channel default | full (build) | `test "$(cat .mozbuild/phase40-smoke.exit)" = 0 && objdir/dist/bin/powerbrowser --version` | ✅ | ⬜ pending |
| 40-08-T2 | 08 | 8 | UPD-12, UPD-33, PKG-08 | T-40-11, T-40-22 | One update URL source on the built tree; notices match built about:license; layer 3 resolves neither powerbrowser.org nor github.com unattended | full | `scripts/verify-platform.sh --only ng064-update-url-from-manifest && node scripts/generate-licensing.mjs --check && bash scripts/verify-endpoints.sh --layer 3` (host-list red on other hosts only is the known-open item) | ✅ | ⬜ pending |
| 40-08-T3 | 08 | 8 | UPD-13, DIST-06, AUTO-08 | T-40-21, T-40-22 | About links open the [urls] pages without a console error; first real rebase-upstream.yml run green, owner-dispatched | manual (owner, blocking resume signal) | `gh run watch <id> --exit-status` | — | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky* — task IDs are filled in once plans exist.

---

## Wave 0 Requirements

- [ ] `scripts/verify-release-identity.mjs` — REL-01
- [ ] `scripts/verify-update-channel.mjs` — UPD-11, UPD-12
- [ ] `scripts/verify-update-prefs.mjs` — UPD-13, UPD-25
- [ ] `scripts/regenerate-patches.sh` — AUTO-10
- [ ] `scripts/generate-licensing.mjs` — PKG-08
- [ ] `verify-endpoints.sh --disposition-self-test` plus a shared verdict function — UPD-33

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| First real `rebase-upstream.yml` run green | DIST-06, AUTO-08 | Owner push and `workflow_dispatch` on GitHub | 40-08-T3: owner pushes, dispatches with `tag=FIREFOX_153_5_1esr_RELEASE`, `gh run watch <id>` |
| About dialog release-notes and fallback links open without throwing | UPD-13 | Needs a rebuilt dev objdir and a display | 40-08-T3 blocking resume signal, before the push: Open Browser Window, Help > About PowerBrowser, click each link, check the Browser Console |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
