---
phase: "61"
slug: "spikes-for-pane-hosting-browser-parity-and-live-sharing"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-09"
---

# Phase 61 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Derived from 61-RESEARCH.md "Validation Architecture".

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node ESM scripts with a built-in `--self-test`, registered as rows in `scripts/verify-platform.sh` (one driver, one registry) |
| **Config file** | the registry arrays in `scripts/verify-platform.sh` (quick tier near the Orca block at lines 3837–3862; full tier near 6415–6432) |
| **Quick run command** | `scripts/verify-platform.sh --only orca-browser-parity-self-test` |
| **Full suite command** | `scripts/verify-platform.sh --quick` (about 7 minutes here); full tier adds `orca-browser-parity` |
| **Estimated runtime** | ~420 seconds for `--quick` |

---

## Sampling Rate

- **After every task commit:** stage new files, `node scripts/scan-brand-residue.mjs`, then the touched `--only` rows and their `-self-test` siblings
- **After every plan wave:** `scripts/verify-platform.sh --quick` at each lane merge; the parity row against the built `orca/`
- **Before `/gsd-verify-work`:** `--quick` green, three spike records with VERDICT lines, `grep -c "Route chosen by Phase 61" .planning/workstreams/orca/ROADMAP.md` prints 3
- **Max feedback latency:** 420 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 61-004-W0 | 01 | 1 | TAB-03 | — | pairing URL never logged | live probe | `flock /home/chris/coding/Power-Browser/.git/pb-live.lock node .planning/spikes/004-orca-pane-hosting/measure.mjs --route a` (A1 multi-input Vite build leaves Orca untouched: `git -C orca status --porcelain --untracked-files=no` empty; A4 single React copy: in-page probe global) | ❌ W0 | ⬜ pending |
| 61-004-routes | 01 | 1 | TAB-03 | — | loopback only | live probe | same script `--route b`, `--route b-prime`; `--measure css`, `--measure memory` (ChromeUtils.requestProcInfo), `--measure ws` | ❌ W0 | ⬜ pending |
| 61-004-observe | 01 | 1 | TAB-03 | — | N/A | live probe | pane opened in Orca's client appears as a Lumino tab < 1 s (store subscribe / page script / `layout.subscribe`) | ❌ W0 | ⬜ pending |
| 61-005-script | 02 | 1 | BRW-01 | — | N/A | derive-and-compare | `scripts/verify-platform.sh --only orca-browser-parity-self-test`; `--only orca-browser-parity` (SKIP line when `orca/` absent) | ❌ W0 | ⬜ pending |
| 61-005-proof | 02 | 1 | BRW-01 | T-61-xx | web tab navigation through `PowerBrowserAPI.webTabNavigate` only | live probe | `flock … node .planning/spikes/005-orca-browser-parity/provider-proof.mjs` (S2 attach first; S1 recorded as fallback) | ❌ W0 | ⬜ pending |
| 61-006-floor | 03 | 1 | EXT-03 | — | no token in logs; one minimal prompt spends Chris's login | live (CLI) | `node .planning/spikes/006-orca-live-sharing/floor-run.mjs` (marker echoed, session jsonl grew) | ❌ W0 | ⬜ pending |
| 61-006-ext | 03 | 1 | EXT-03 | — | extension studied in scratch only, never redistributed | document review | `extension-notes.md` cites file/pattern; grep commands listed | ❌ W0 | ⬜ pending |
| 61-brand | 01/02/03 | 1 | — | — | N/A | quick | `node scripts/scan-brand-residue.mjs` after `git add` (P61-15 rows) | ✅ | ⬜ pending |
| 61-coord | 04 | 2 | criterion 4 | — | N/A | doc check | `grep -c "Route chosen by Phase 61" .planning/workstreams/orca/ROADMAP.md` = 3; MANIFEST rows 004–006; skill wrap-up present | n/a | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `scripts/orca-browser-parity.mjs` with `--self-test` (fixture tree; plants: orphan row, missing row, empty derivation, moved constant, wrong component set) and `.planning/spikes/005-orca-browser-parity/DISPOSITIONS.md` (92 RPC rows at the pin); two registry rows
- [ ] Spike 004: PB-added Vite config (`mergeConfig`, `emptyOutDir:false`), copy step, one-pane page, `measure.mjs`
- [ ] Spike 006: `floor-run.mjs`, `extension-notes.md`
- [ ] `inventory/brand-tokens.json` rows for every new tracked file spelling Orca/orca/orcad (P61-15)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live share inside the Claude Code extension | EXT-03 (half) | needs the EXT-01 session, deferred (D-18) | end-of-milestone pass; the record states what is blocked |
| Overrides of the auto-mode picks P61-01..P61-15 | — | owner's call | any time before the dependent phase is planned |
| A RED verdict on any spike | criterion 4 | owner decision | asked in the box before the affected phase (63/64/66) is planned |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 420s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
