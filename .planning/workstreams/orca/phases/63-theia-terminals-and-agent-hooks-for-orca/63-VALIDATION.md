---
phase: "63"
slug: "theia-terminals-and-agent-hooks-for-orca"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
status: validated
nyquist_compliant: true
wave_0_complete: true
created: "2026-11-09"
validated: "2026-11-10"
resynced: "2026-11-10 (D-31)"
---

# Phase 63 — Validation Strategy

> Per-phase validation contract. **Re-synced 2026-11-10 after owner ruling D-31** (Orca terminals on Orca's own engine and view, side by side with Theia terminals; 63-CONTEXT P63-31..P63-40) with the plan set 63-06 (lane), 63-03 (lane, amended) and 63-04 (coordinator, replaced). 63-01, 63-02 and 63-05 are superseded and carry no rows here. Status is back to draft until `/gsd-validate-phase 63 --ws orca` re-validates this map. No blocking check needs a human (D-18).
>
> Rows of the pre-D-31 map that are not built: 63-seams, 63-contract, 63-provider-live, 63-bridge, 63-paths, 63-keys, 63-tab-live, 63-keys-live, 63-remote, 63-quit (the P63-09 extension). The TERM-04 key rows move to Phase 64, which may port `verify-orca-terminal-keys.mjs` and the in-session control of `verify-orca-terminal-keys-live.mjs` from the superseded lane branches.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node 24 scripts registered as rows in `scripts/verify-platform.sh` |
| **Config file** | none (registry rows; quick anchor after `orca-service-live-self-test`; full anchor after `orca-service-live`; one `# NEW (63-0N, …)` block per lane at each anchor it uses, in the order 63-06, 63-03) |
| **Quick run command** | `scripts/verify-platform.sh --only <label>` |
| **Full suite command** | `scripts/verify-platform.sh --quick` (about 7 minutes); live rows as `flock /home/chris/coding/Power-Browser/.git/pb-live.lock env $(env \| sed -n 's/^\(ORCA_[A-Za-z0-9_]*\)=.*/-u \1/p') scripts/verify-platform.sh --only <live label>` (every inherited `ORCA_*` name unset) |
| **Estimated runtime** | ~420 seconds for `--quick` |

---

## Sampling Rate

- **After every task commit:** the task's `<verify>` commands (the lane's quick rows via `--only`), plus `node scripts/scan-brand-residue.mjs` after staging
- **At each lane's wrap-up (63-06 T2, 63-03 T3):** the lane diff against `git merge-base HEAD ServerDestroyer/v1.7-Orca-integration` lists only that plan's `files_modified`, and `scan-brand-residue.mjs --report .mozbuild/p63-0N/brand-report.md` is copied into the SUMMARY without editing `inventory/brand-tokens.json`
- **After every plan wave:** `scripts/verify-platform.sh --quick` against the pre-merge baseline recorded in 63-04-SUMMARY.md, and the per-merge `--only` lists of 63-04 Task 1 step (4)
- **Before `/gsd-verify-work`:** `--quick` green against the baseline; after the Orca rebuild (seam 010 only), the Theia audited install and rebuild and `./mach build faster`, under the live lock with inherited `ORCA_*` unset: `--only orca-agent-hooks`, `--only orca-agent-status-live`, `--only orca-service-live`, `--only orca-hidden-electron`, `--only orca-overlay-built`, `--only orca-build-shape`, `--only orca-slotless-start`, `--only verify-endpoints`, `--only verify-branding-identity-dev`
- **Max feedback latency:** 420 seconds

---

## Per-Task Verification Map

Every one of the 8 tasks has at least one `<automated>` command.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 63-chrome | 06 · T1; compared at 04 · T1 | 1 | EXT-02 | T-63-24, T-63-26 | `orcad-data-root` written after ready, 0600 from creation in the 0700 bridge folder, removed on stop; a null folder never stops orcad; orcad's fixed environment names equal Phase 62's (no PTY switch) | quick | `--only orca-service`, `--only orca-service-self-test` (scenarios A to F and H; plants "before ready", "not removed", "null folder fatal", "pty switch"); the OrcaEnv node check in 06 T1's `<verify>` (fixed names equal the base, `-bridge` folder); `--only orca-hidden-electron-self-test`, `--only orca-service-live-self-test` (unchanged files, still green) | ✅ (edit) | ✅ green (static re-run 2026-11-14) |
| 63-boundary | 06 · T1; re-run at 04 · T1, T2 | 1 | EXT-02 | T-63-24 | every new boundary occurrence (`writePrivateFile`, `platform()`) catalogued in `INTERNAL-APIS.md`, no existing line renumbered, only the file's closing line moved | quick | `--only internals-boundary`, `--only internals-catalogue`, `--only ng-040-internals-catalogue-lines`, `--only ng-027-reader-callers`; the head-cmp acceptance command in 06 T1 | ✅ | ✅ green (static re-run 2026-11-14) |
| 63-bridge-dir | 06 · T2; compared at 04 · T1 | 1 | EXT-02 | T-63-24, T-63-25 | bridge folder never under `/tmp`, on win32 under `LOCALAPPDATA` only; one data-root file name on three sides; no umask window in `writePrivateFile` | quick (hermetic, linux, darwin, win32) | `--only orca-bridge-dir`, `--only orca-bridge-dir-self-test` (folder rules for three platforms ending `-bridge`, same 12 hex as `aliasPathFor`; data-root literal equal across OrcaEnv, orca-agents' protocol file and the wrapper, a named SKIP only while `theia/extensions/orca-agents` is absent and compared after the p63-03 merge; `writePrivateFile` call order: folder 0700, folder re-set 0700, stale `.tmp` removed, exclusive empty create, 0600, overwrite write, move. Plants: relative `LOCALAPPDATA`, `/tmp` base, `macosx` mapped to linux, 12-hex drift, a `-pty` folder, literal drift, protocol file deleted while the extension exists (red, not SKIP), "umask window", folder re-apply removed, exclusive create removed) | ✅ | ✅ green (static re-run 2026-11-14) |
| 63-theia-key | 06 · T2; compared at 04 · T1 | 1 | EXT-02 | T-63-26 | `POWERBROWSER_ORCA_BRIDGE_DIR` carries a path, never a credential, and equals the key the orca-agents backend reads | quick | `--only orca-service` clause 10 (TheiaService computes the value through `bridgeDirFor` and `dataRootFor`; key equal to the one `orca-agents-backend-module.ts` reads from `POWERBROWSER_ENV`; SKIP only while `theia/extensions/orca-agents` is absent; red when the directory exists without the module); guard rows `start-path-recovery(-self-test)`, `shell-error-contract(-self-test)`, `shell-error-copy-no-internals`, `sidecar-reap-blocker` | ✅ (edit) | ✅ green (static re-run 2026-11-14) |
| 63-ext02 | 03 · T1 | 1 | EXT-02 | T-63-13, T-63-14, T-63-15, T-63-16 | the wrapper reads the data root from a 0600 file in a 0700 directory, never from the environment; drops every inherited `ORCA_*` name; writes nothing to stdout or stderr | full (hermetic, scratch `HOME`, no model turn) | `tsc -b` of `orca-agents`, then `node scripts/verify-orca-agent-hooks.mjs` (`PASS -- stage B (wrapper)`): launcher built with `launcherText` runs `bin/claude-wrapper.mjs` with a stub `claude` against a built orcad on Orca's own engine; a "Claude Code" pane through `terminal create`; status read back live per step; stub sees the pane identity and `ORCA_AGENT_HOOK_ENDPOINT`, not `ORCA_PLANT_63` (control present in `/proc/<wrapper>/environ`); stdout equals the stub's marker; exit code 7; pane gone within 10 s. Pure helpers by `node --input-type=module -e` | ✅ | ✅ green (live record, not re-run: static-only audit) |
| 63-hooks | 03 · T2; live at 04 · T1 | 1 | TERM-02 | T-63-16, T-63-17 | hook payload values and environment values kept in memory, never printed; the wrapper path is a default-scope preference override only | quick (self-test) + full (hermetic) | `--only orca-agent-hooks-self-test`, `--only orca-agent-hooks`. Stage A PTY environment (moved from p63-01 by P63-38): the pane process's `/proc/<pid>/environ` names ∩ `spawn-env-keys.ts` names equal `AGENT_HOOK_RUNTIME_ENV_KEYS` minus `ORCA_CLAUDE_AGENT_STATUS_SETTINGS`, pane identity names present, derived set non-empty. Stage A relay: working, waiting, done in order, each within 5 s; `paneKey` missing is red "(A6)"; session-id note. Degrade stage; static clauses (backend reads `POWERBROWSER_ENV`); entry guard and "side effect on import". Plants as 63-03 T2 lists plus hook name missing, deletion key present, "source moved" | ✅ | self-test ✅ green (static re-run 2026-11-14); full row ✅ green (live record, not re-run: static-only audit) |
| 63-agent-live | 03 · T3; live at 04 · T2; TERM-02 tracked at 04 · T3 | 1 | TERM-02, EXT-02 | T-63-14, T-63-20 | `orcad-data-root` 0600 equal to orcad's `ORCA_USER_DATA`; launcher 0700; the agent and the daemon end on quit | quick (self-test) + full (live) | `--only orca-agent-status-live-self-test` (plants: no working, no done, done before working, waiting required but absent, "vacuous", three prompts, agent PTY under the Theia backend instead of the daemon, "survived quit", data-root mode 0644, content differing, launcher missing or 0644, "waiting not derivable" while derivable); `--only orca-agent-status-live` under the live lock: bridge-directory stage from `getState().bridgeDir`; one prompt; working then done, waiting when derivable; agent PTY descends from the terminal daemon `OrcaService` reports; quit stage; record counts before and after; SKIP naming `claude` when absent. Its last line is recorded under "TERM-02 outcome" | ✅ | self-test ✅ green (static re-run 2026-11-14); live ✅ green (live record, not re-run: static-only audit) |
| 63-merge | 04 · T1 | 2 | all | T-63-18, T-63-SC | only p63-06 and p63-03 merged, by full ref, after a derived scope check and with no `BLOCKER:` line; no superseded lane merged; audited `--frozen-lockfile` Theia install with `theia/yarn.lock` unchanged | quick + full (live) | merge-log check (p63-06 and p63-03 present; no p63-01, p63-02, p63-05 merge), `git diff --quiet -- theia/yarn.lock`, orca-agents in the browser app; `orca-service` and `orca-bridge-dir` comparisons compared; builds (Theia, `build-orca.sh` with one seam and no overlay file, `./mach build faster`); `--only orca-overlay` and `--only orca-build-shape` report one seam; the tracer `--only orca-agent-hooks` | n/a | ✅ green (live record, not re-run: static-only audit) |
| 63-quit | 04 · T2 | 2 | TERM-02 (D-07), RUN-05 carry | T-63-20 | no orphaned agent, orcad or daemon after quit; signals only to recorded identities | full (live) | `--only orca-service-live` unchanged (quit ends orcad, the terminal daemon and the session under it; SIGKILL relaunch reaps), with `orca-agent-status-live`'s quit stage | ✅ | ✅ green (live record, not re-run: static-only audit) |
| 63-coord | 04 · T2, T3 | 2 | all | T-63-20, T-63-21 | brand rows from `scan-brand-residue.mjs --report` on the staged tree only, no exclude entry | quick + full (live) | T2 under the lock: `orca-agent-status-live orca-service-live orca-hidden-electron orca-overlay-built orca-slotless-start verify-endpoints verify-branding-identity-dev`, then the guard re-runs; T3: `node scripts/scan-brand-residue.mjs`, `--self-test`, `--quick` against the baseline, superseded stubs for 63-01/02/05, and the tracking check (TERM-02 complete only on a recorded PASS; EXT-02 Pending with its note) | n/a | ✅ green (live record, not re-run: static-only audit) |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Each lane creates its own check in the task that needs it (tracer first):

- [x] `scripts/verify-orca-bridge-dir.mjs` (63-06, rebuilt from p63-05's script without the endpoint join)
- [x] `scripts/verify-orca-agent-hooks.mjs`, `scripts/verify-orca-agent-status-live.mjs` (63-03)
- [x] every new script has a `--self-test` that plants faults and requires each to go red naming the drift
- [x] `verify-orca-agent-hooks.mjs` runs main only behind an entry guard, with a "side effect on import" plant
- [x] Rows appended at the registry anchors in `# NEW (63-0N, …)` blocks; the coordinator keeps them in order 06, 03 byte for byte
- [x] Brand rows re-measured by the coordinator after the lanes merge
- [x] Re-run after the lanes merge: `diff-theia-core`, `gui04-registry-shape`, `internals-boundary`, `internals-catalogue`, `ng-027-reader-callers`, `shell-error-copy-no-internals`

---

## Manual-Only Verifications

None blocking. The human items are deferred to the end-of-milestone pass (59-CONTEXT D-18), as listed in 63-CONTEXT "Deferred Verification" and 63-04 Task 3:

| Item | Why deferred | Runs in |
|------|--------------|---------|
| The Claude Code extension's `claude` runs through PB's wrapper and the session shows in Orca with live status | Needs the extension running on Theia (EXT-01) | End-of-milestone pass, with 60-05 Task 2 |
| Spike 006 "Blocked on EXT-01" steps 1-4 | Same | Same |
| TERM-02's real-agent proof, when `orca-agent-status-live` did not PASS on the merged tree | `claude` absent or the run SKIPped; TERM-02 stays Pending | End-of-milestone pass |
| The wrapper's placeholder pane as an Orca terminal tab | Phase 64 hosts Orca terminals as tabs; how the "Claude Code" placeholder tab looks is an owner call | End-of-milestone owner pass |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies (8 of 8 tasks)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 420s (quick rows via `--only`; `--quick` about 420 s)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** validated 2026-11-14 by the Nyquist audit (static rows re-run; live rows taken from their recorded runs, see the audit section).

---

## Validation Audit 2026-11-14

| Metric | Count |
|--------|-------|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |

Static rows re-run at f6e2cab5: orca-service, orca-service-self-test, orca-bridge-dir, orca-bridge-dir-self-test, orca-agent-hooks-self-test, orca-agent-status-live-self-test, orca-hidden-electron-self-test, orca-service-live-self-test, internals-boundary, internals-catalogue, ng-040-internals-catalogue-lines, ng-027-reader-callers, start-path-recovery(-self-test), shell-error-contract(-self-test), shell-error-copy-no-internals, sidecar-reap-blocker, gui04-registry-shape: all PASS.

Not re-run (they spawn orcad, a PTY or the browser): orca-agent-hooks (full hermetic run), orca-agent-status-live, orca-service-live. Their green is the 63-04 record in 63-VERIFICATION.md. diff-theia-core needs the Theia dev app on :3939 and was not run here.

Manual-only: the four items in the table above stay with the end-of-milestone pass. The EXT-02 extension half needs the Claude Code extension running on Theia (EXT-01), and no static check can stand in for it.
