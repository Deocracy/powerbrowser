---
phase: "63"
slug: "theia-terminals-and-agent-hooks-for-orca"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-09"
---

# Phase 63 — Validation Strategy

> Per-phase validation contract. Derived from 63-RESEARCH.md "Validation Architecture", with the lane cut after P63-24 (63-CONTEXT). No blocking check needs a human (D-18).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node 24 scripts registered as rows in `scripts/verify-platform.sh` |
| **Config file** | none (registry rows; quick anchor after `orca-service-live-self-test`, line 3883; full anchor after `orca-service-live`, line 6466; one `# NEW (63-0N, …)` block per lane) |
| **Quick run command** | `scripts/verify-platform.sh --only <label>` |
| **Full suite command** | `scripts/verify-platform.sh --quick` (about 7 minutes); live rows as `flock /home/chris/coding/Power-Browser/.git/pb-live.lock scripts/verify-platform.sh --only <live label>` |
| **Estimated runtime** | ~420 seconds for `--quick` |

---

## Sampling Rate

- **After every task commit:** the lane's quick rows via `--only`, plus `node scripts/scan-brand-residue.mjs` after staging
- **After every plan wave:** `scripts/verify-platform.sh --quick` at each lane merge
- **Before `/gsd-verify-work`:** `--quick` green; after the Orca rebuild (seams applied), the Theia rebuild and `./mach build faster`, under the live lock: `--only orca-overlay-built`, `--only orca-pty-provider-live`, `--only orca-agent-hooks`, `--only orca-terminal-keys-live`, `--only orca-service-live`, `--only orca-agent-status-live`, `--only orca-remote-regression`
- **Max feedback latency:** 420 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 63-contract | 01 | 1 | TERM-01 | — | N/A | quick | `--only orca-pty-contract`, `--only orca-pty-contract-self-test` (parsed required `IPtyProvider` set, 22 at the pin, ⊆ Orca's `LocalPtyProvider` members; override set ⊆ contract ∪ class; facade ⊇ parsed `IPty` required set; undeclared-read set equals the disposition table; Theia and overlay message sets equal. Plants: added required member, stale override, facade missing `resize`, new undeclared read, message on one side only, zero members parsed "source moved". SKIP when `orca/` or Theia `typescript` is absent) | ❌ W0 | ⬜ pending |
| 63-seams | 01 | 1 | TERM-01 | T-63-xx | S2/S3 declared in `seams.json`, blobs match, ≤20 lines each, 3 ≤ cap 10, marker literal per overlay file | quick + full | `--only orca-overlay`, `--only orca-overlay-self-test`, `--only orca-overlay-built`, `--only orca-build-shape` | ✅ | ⬜ pending |
| 63-provider-live | 01 | 1 | TERM-01 | T-63-xx | no daemon with the switch set; PTYs only under the Theia-side host | full (live) | `--only orca-pty-provider-live` stage 1 (bridge core hosted under Node, no PowerBrowser): preflight `ok`; switch set: `health.terminalDaemon.state` `absent`, no process running the daemon entry (path derived from `orca/out`), a CLI-created terminal's parent chain reaches the bridge host pid. **Control first:** the same orcad without the switch shows the daemon to the same detector, else "detector blind". Pure-verdict plants: detector blind, daemon present with switch, parent chain ends at orcad, preflight not ok. First green run at the coordinator (needs the 02 bridge core) | ❌ W0 | ⬜ pending |
| 63-tab-live | 02 | 1 | TERM-01 | T-63-xx | a stale `o<n>` never becomes a plain shell (`kind: 'orca'`, open-handler exemption) | full (live) | `--only orca-pty-provider-live` stage 2 (in PowerBrowser: tab `o<n>` exists by BiDi DOM read, typed marker round-trips, DSR reply count recorded, Pitfall 3) | ❌ W0 | ⬜ pending |
| 63-keys | 02 | 1 | TERM-04 | — | N/A | quick | `--only orca-terminal-keys`, `--only orca-terminal-keys-self-test` (key set derived from `PAGE_KEYS` ids `newTab closeTab nextTab prevTab nextTabPage prevTabPage` mapped to literal `ctrl`; equals the passthrough set; every `when` is `terminalFocus && powerbrowser.orcaTerminalActive`; `t<n>` bindings unchanged. Plants: missing key, wrong `when`, `ctrlcmd` spelling, extra key) | ❌ W0 | ⬜ pending |
| 63-keys-live | 02 | 1 | TERM-04 | — | N/A | full (live) | `--only orca-terminal-keys-live` (in `o<n>`: PTY receives `^W`, `^T`, Tab and PageUp/PageDown sequences by `cat -v` marker, tab count unchanged; in `t<n>` and a web tab each key's effect equals the control run without `orca-terminals`) | ❌ W0 | ⬜ pending |
| 63-theia-guards | 02 | 1 | TERM-01 | — | Theia core unedited; registry shape unchanged | quick | `--only diff-theia-core`, `--only gui04-registry-shape`, `--only internals-boundary`, `--only shell-error-copy-no-internals` (re-run; lanes touch their inputs) | ✅ | ⬜ pending |
| 63-hooks | 03 | 1 | TERM-02 | T-63-xx | transport name absent from every PTY environ; hook token never logged | full (hermetic, scratch `HOME`) | `--only orca-agent-hooks`, `--only orca-agent-hooks-self-test` (PTY environ hook names equal `AGENT_HOOK_RUNTIME_ENV_KEYS` minus `ORCA_CLAUDE_AGENT_STATUS_SETTINGS` plus pane identity names, derived from `spawn-env-keys.ts`; transport name absent, **control** present in orcad's environ; managed hook script on synthetic events reads back working, waiting, done. Plants: transport name present in PTY, hook name missing, control absent "instrument blind", status sequence out of order) | ❌ W0 | ⬜ pending |
| 63-ext02 | 03 | 1 | EXT-02 | T-63-xx | wrapper reads the data root from a 0600 file, never from the environment | full (hermetic) | `--only orca-agent-hooks` stage 3 (wrapper with stub `claude`: pane created by `terminal.create`, status read back live by `paneKey`, pane closed on exit, wrapper exit code equals the stub's. Plants: pane not closed, wrong exit code, `ORCA_PANE_KEY` missing from stub env) | ❌ W0 | ⬜ pending |
| 63-agent-live | 03 | 1 | TERM-02 | — | N/A | full (live) | `--only orca-agent-status-live` (`orca agent launch --agent claude --surface terminal`, at most two model turns, record counts compared before and after, never against a constant; SKIP naming `claude` when absent) | ❌ W0 | ⬜ pending |
| 63-remote | 04 | 2 | TERM-03 | T-63-xx | pairing offer held in memory, never in a logged argv | full (hermetic) | `--only orca-remote-regression` (second PB-run orcad, scratch root, added by `environment add`; `terminal create/send/read --environment` works with the switch set on the first, P63-24) | ❌ W0 | ⬜ pending |
| 63-quit | 04 | 2 | RUN-05 (carry) | T-63-xx | no orphaned PTY or agent after quit or SIGKILL | full (live) | `--only orca-service-live`, `--only orca-service-live-self-test` (extended, P63-09: provider-created PTYs and descendants under the Theia backend recorded before quit, all dead after; `terminalDaemon.pid === null` accepted; plant "no PTY recorded" is vacuous and goes red) | ✅ (edit) | ⬜ pending |
| 63-coord | 04 | 2 | all | — | N/A | quick + live | `--quick`; Orca rebuild, Theia audited install and rebuild, `./mach build faster`; the live/full rows above under the live lock; brand rows re-measured | n/a | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `scripts/verify-orca-pty-contract.mjs`, `scripts/verify-orca-pty-provider-live.mjs`, `scripts/verify-orca-terminal-keys.mjs`, `scripts/verify-orca-terminal-keys-live.mjs`, `scripts/verify-orca-agent-hooks.mjs`, each with `--self-test`
- [ ] The `orca-agent-status-live` and `orca-remote-regression` rows, each in the script of the plan that owns it
- [ ] `powerbrowser/shell/OrcaEnv.sys.mjs` additions (`ORCA_PB_THEIA_PTY_ENDPOINT` in `ORCAD_FIXED_ENV_NAMES`, the bridge-directory helper) before any row that imports them; without the fixed name `orca-service-live` goes red (63-RESEARCH Pitfall 8)
- [ ] Rows appended at the two registry anchors in `# NEW (63-0N, …)` blocks; the coordinator keeps all blocks in lane order
- [ ] Brand rows re-measured by the coordinator after the lanes merge
- [ ] Re-run after the lanes merge: `diff-theia-core`, `gui04-registry-shape`, `internals-boundary`, `shell-error-copy-no-internals`

---

## Manual-Only Verifications

None blocking. Every phase behavior has an automated row. The human items are deferred to the end-of-milestone pass (59-CONTEXT D-18), as listed in 63-CONTEXT "Deferred Verification":

| Item | Why deferred | Runs in |
|------|--------------|---------|
| The Claude Code extension's `claude` runs through PB's wrapper and the session shows in Orca with live status | Needs the extension running on Theia (EXT-01) | End-of-milestone pass, with 60-05 Task 2 |
| Spike 006 "Blocked on EXT-01" steps 1-4 | Same | Same |

Overrides of the auto-mode picks P63-01..P63-28 are Chris's at any time; P63-24 (TERM-03, D-20) is the one listed as open in 63-CONTEXT.

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 420s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
