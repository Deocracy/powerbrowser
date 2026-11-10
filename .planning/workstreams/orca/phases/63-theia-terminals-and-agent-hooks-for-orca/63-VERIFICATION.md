---
phase: 63-theia-terminals-and-agent-hooks-for-orca
verified: 2026-11-10T21:30:00Z
status: human_needed
score: 6/7 must-haves verified
covered_files:
  - .planning/workstreams/orca/phases/63-theia-terminals-and-agent-hooks-for-orca/63-01-PLAN.md
  - .planning/workstreams/orca/phases/63-theia-terminals-and-agent-hooks-for-orca/63-01-SUMMARY.md
  - .planning/workstreams/orca/phases/63-theia-terminals-and-agent-hooks-for-orca/63-02-PLAN.md
  - .planning/workstreams/orca/phases/63-theia-terminals-and-agent-hooks-for-orca/63-02-SUMMARY.md
  - .planning/workstreams/orca/phases/63-theia-terminals-and-agent-hooks-for-orca/63-03-PLAN.md
  - .planning/workstreams/orca/phases/63-theia-terminals-and-agent-hooks-for-orca/63-03-SUMMARY.md
  - .planning/workstreams/orca/phases/63-theia-terminals-and-agent-hooks-for-orca/63-04-PLAN.md
  - .planning/workstreams/orca/phases/63-theia-terminals-and-agent-hooks-for-orca/63-04-SUMMARY.md
  - .planning/workstreams/orca/phases/63-theia-terminals-and-agent-hooks-for-orca/63-05-PLAN.md
  - .planning/workstreams/orca/phases/63-theia-terminals-and-agent-hooks-for-orca/63-05-SUMMARY.md
  - .planning/workstreams/orca/phases/63-theia-terminals-and-agent-hooks-for-orca/63-06-PLAN.md
  - .planning/workstreams/orca/phases/63-theia-terminals-and-agent-hooks-for-orca/63-06-SUMMARY.md
  - inventory/brand-tokens.json
  - orca-overlay/seams.json
  - powerbrowser/INTERNAL-APIS.md
  - powerbrowser/shell/OrcaEnv.sys.mjs
  - powerbrowser/shell/OrcaService.sys.mjs
  - powerbrowser/shell/PowerBrowserAPI.sys.mjs
  - powerbrowser/shell/TheiaService.sys.mjs
  - scripts/verify-orca-agent-hooks.mjs
  - scripts/verify-orca-agent-status-live.mjs
  - scripts/verify-orca-bridge-dir.mjs
  - scripts/verify-orca-service.mjs
  - scripts/verify-platform.sh
  - theia/applications/browser/package.json
  - theia/extensions/orca-agents/bin/claude-wrapper.mjs
  - theia/extensions/orca-agents/package.json
  - theia/extensions/orca-agents/src/browser/orca-agents-frontend-module.ts
  - theia/extensions/orca-agents/src/common/orca-agents-protocol.ts
  - theia/extensions/orca-agents/src/node/claude-wrapper-launcher.ts
  - theia/extensions/orca-agents/src/node/orca-agents-backend-module.ts
  - theia/extensions/orca-agents/tsconfig.json
  - theia/package.json
covered_digest: "v3:sha256:04c39e51e1de58c698e87440ef9ea82b27e1e83bc8e24815f78978f9afecdde4"
behavior_unverified: 0
overrides_applied: 0
human_verification:
  - test: "With EXT-01 (Claude Code extension on Theia 1.76 on an Orca worktree), start a Claude Code extension session in a launched PowerBrowser and send one prompt."
    expected: "The extension runs claude through <bridge dir>/claude-wrapper (claudeCode.claudeProcessWrapper default from orca-agents); a 'Claude Code' pane appears in Orca for that worktree and its status moves through working, waiting and done; the pane closes when the session ends."
    why_human: "Roadmap criterion 3 assigns the extension half to the end-of-milestone pass (D-18). Research assumptions A3 (the extension runs '<wrapper> <claude path> <args>') and A5 (a default-scope registerOverride reaches the extension's contributed property) are unproven; the hermetic row stands in a stub claude and launches the launcher directly, not through the extension."
  - test: "In the same session, open Theia's Settings and look up claudeCode.claudeProcessWrapper; then set a user value and restart."
    expected: "The default shows the launcher path; a user-set value wins over it; no settings.json is written by PowerBrowser."
    why_human: "orca-agents-frontend-module.ts:33 registers a default override for a key whose schema the extension contributes later; whether Theia 1.76 applies it to the extension's property needs the extension installed."
---

# Phase 63: Agent hooks on Orca's terminal engine — Verification Report

**Phase Goal:** Orca's terminals run on Orca's own engine beside Theia's own terminals, agents started by Orca or by the Claude Code extension report live status in Orca, and agents and Orca's terminal daemon end when PowerBrowser quits.
**Requirements:** TERM-02, EXT-02 (after owner ruling D-31)
**Verified:** 2026-11-10T21:30:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

Scope note: the verifier ran only quick, hermetic rows (inside `nix develop .#theia`) and direct
`node` runs of the Phase 63 checks. No live row and no build was run (six lane executors share the
machine). Live evidence was read from the coordinator's raw row logs in `.mozbuild/p63-04/`
(`orca-agent-hooks.log`, `orca-agent-status-live.log`, `live-orca-service-live.log`,
`live-orca-slotless-start.log`), whose text matches 63-04-SUMMARY.md, not from SUMMARY prose alone.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | SC1: orcad runs Orca's own terminal engine; overlay carries only seam 010; orcad reports its terminal daemon live; a CLI-created terminal runs under that daemon; Theia's own terminals unchanged | ✓ VERIFIED | `orca-overlay/seams.json` lists one seam (010, `orcad-browser-provider.ts`); `orca-overlay/patches/` holds only `010-installed-electron-switch.patch`; no commit since abca6309 touches `orca-overlay/`. `git grep` outside `.planning` finds no `ORCA_EXTERNAL_PTY_ENDPOINT` (except two check lines that plant or forbid it), no `external-pty-bridge`, `POWERBROWSER_ORCA_PTY_DIR`, `ptyBridgeDirFor`, `@powerbrowser/orca-terminals` or `ORCA_TERMINAL_NAME_PATTERN`. Verifier runs: `orca-overlay` PASS, `orca-build-shape` PASS, `diff-theia-core` PASS. The only Theia change is the new `theia/extensions/orca-agents` plus two package.json lines; the POWERBROWSER_ORCA_BRIDGE_DIR key is captured and deleted at module load by token-gate's `powerbrowser-env.ts:66-72`, so it never reaches a Theia terminal. Daemon: `orca-slotless-start` log "orcad and terminal daemon reaped"; terminal under daemon: `orca-agent-status-live` engine clause (`verify-orca-agent-status-live.mjs:132-138`) requires the agent's PTY (created by `orca agent launch`) to have the reported daemon pid as an ancestor and not the Theia backend; that live row PASSed. |
| 2 | SC2 / TERM-02: an agent Orca starts (Claude Code) runs in an Orca terminal with Orca's `ORCA_*` hook environment (names derived from pinned source, read from the PTY's environ); status moves through working, waiting and done | ✓ VERIFIED | `verify-orca-agent-hooks.mjs:201-219` derives `AGENT_HOOK_RUNTIME_ENV_KEYS` from `spawn-env-keys.ts` and the pane identity names from `hook-stdin-contract.ts`; `:292-301` compares them against `/proc/<pid>/environ` names of the CLI-created pane. Logged PASS: "the CLI-created pane's process carries the 6 derived hook names and the pane identity, not ORCA_CLAUDE_AGENT_STATUS_SETTINGS". Real agent: `orca-agent-status-live.log` "status sequence: idle -> working -> permission -> working -> idle; session records 0 -> 63" and PASS. Waiting is required whenever the derivation names a waiting event (`:118-121`), and record growth is compared with the before count, not a constant. |
| 3 | SC3 / EXT-02: an extension session appears in Orca with live hook status through a pane the wrapper creates with `terminal.create` and the `ORCA_AGENT_HOOK_*` variables; the wrapper finds the data root through `orcad-data-root` (0600) in the 0700 bridge folder | ? UNCERTAIN (human) | PowerBrowser half verified: `claude-wrapper.mjs:133-161` creates the pane with `terminal create ... --command cat`, `:95-105` passes ORCA_PANE_KEY, ORCA_TAB_ID, ORCA_WORKTREE_ID and ORCA_AGENT_HOOK_ENDPOINT and drops every inherited ORCA_* name, `:74-92` refuses a bridge folder or file with group/other bits or another owner. Hermetic stage B (log): launcher written as the backend writes it, stub claude, pane read back working/permission/idle, planted ORCA_PLANT_63 present in the wrapper's own environ and absent in the stub's, stdout passthrough, exit code 7, pane closed; degrade stage green. Live: `orca-agent-status-live` bridge clause found orcad-data-root 0600 equal to orcad's ORCA_USER_DATA and the launcher 0700. Extension half (the real extension running the wrapper; A3, A5) is assigned by the criterion to the end-of-milestone pass with EXT-01: human item. |
| 4 | SC4 / D-07: quitting PowerBrowser ends every agent, orcad and Orca's terminal daemon; checks record those processes before quit and find none after | ✓ VERIFIED | `verify-orca-agent-status-live.mjs:303-319`: the agent and daemon are recorded with start ticks before `app.quit()`, polled for 25 s, and judged by `quitVerdict` (`:141-144`, pid plus ticks, so a recycled pid is not counted) before the `finally` cleanup signals anything. Logged PASS "the agent and the terminal daemon ended on quit". orcad itself: `orca-service-live` log "quit ended a tree of 5 processes including an agent session". Stop order in code: `OrcaService.stop()` ends orcad, then the daemon, then descendants (Phase 62 path, unchanged; `orca-service` scenario A asserts the order). |
| 5 | Bridge folder: one folder derived identically by OrcaService and TheiaService; orcad-data-root written after ready, removed on stop; null folder non-fatal | ✓ VERIFIED | `OrcaService.sys.mjs:130` and `TheiaService.sys.mjs:787-795` both call `OrcaEnv.bridgeDirFor(OrcaEnv.dataRootFor(...))`; `OrcaService.sys.mjs:436` writes after the ready line, `:528` removes on stop; `TheiaService.sys.mjs:909` passes the key. Verifier runs: `orca-service` PASS ("POWERBROWSER_ORCA_BRIDGE_DIR comparison compared"; scenarios A..F, H), `orca-bridge-dir` PASS ("data-root literal compared"). |
| 6 | `writePrivateFile`: folder 0700 created and re-applied; stale .tmp removed; .tmp created empty and exclusive, set 0600 before any byte, written with overwrite, moved over target; `platform()` at the boundary | ✓ VERIFIED | `PowerBrowserAPI.sys.mjs:11022-11040` in exactly that order; `platform()` at `:11046`; nine INTERNAL-APIS rows added. `internals-boundary` and `internals-catalogue` PASS (verifier run). `orca-bridge-dir` checks the order statically and its self-test plants "writeUTF8 before 0o600", "re-apply removed", "exclusive create removed". The name `orcad-data-root` comes into existence by rename of an already-0600 file, so the file under that name is 0600 from creation. |
| 7 | Each new check can go red: self-tests plant faults, positive controls precede absence assertions, expectations are derived from the tree | ✓ VERIFIED | Verifier runs: `orca-bridge-dir-self-test` PASS (10 plants), `orca-service-self-test` PASS (27 plants), `orca-agent-hooks-self-test` PASS (21 plants), `orca-agent-status-live-self-test` PASS (13 plants, plus a control that a non-derivable waiting event is a note). Absence assertions carry positive controls: ORCA_PLANT_63 must be in the wrapper's own environ before its absence in the stub counts (`verify-orca-agent-hooks.mjs:318-319`); `quitVerdict` is red "vacuous" when nothing was recorded; `ptyEnvVerdict` is red when the derived set is empty. Derivations: hook events, status map, script name and PTY names from pinned `orca/src`; data-root literal joined across three files; the bridge key derived from TheiaService and compared with the keys the backend reads. |

**Score:** 6/7 truths verified (0 present, behavior-unverified; 1 routed to human: the extension half of SC3)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `theia/extensions/orca-agents/bin/claude-wrapper.mjs` | EXT-02 wrapper | ✓ VERIFIED | 221 lines, Node built-ins only, entry guard, used by the launcher and by stage B |
| `theia/extensions/orca-agents/src/node/claude-wrapper-launcher.ts` | per-profile sh launcher | ✓ VERIFIED | writes 0700 via temp + rename; imported by the backend and by `orca-agent-hooks` stage B (built lib) |
| `theia/extensions/orca-agents/src/node/orca-agents-backend-module.ts` | reads POWERBROWSER_ENV, writes launcher, RPC | ✓ VERIFIED | reads `POWERBROWSER_ENV.POWERBROWSER_ORCA_BRIDGE_DIR`, refuses a shared folder, inert when unset |
| `theia/extensions/orca-agents/src/browser/orca-agents-frontend-module.ts` | preference default | ✓ WIRED; effect on the extension is a human item (A5) | `registerOverride` only, no setter, no settings file |
| `theia/applications/browser/package.json`, `theia/package.json` | app wiring | ✓ VERIFIED | dependency at line 45; `build:extensions` ends with orca-agents; `src-gen/backend/server.js` and `src-gen/frontend/index.js` each name orca-agents; `lib/node` built |
| `powerbrowser/shell/OrcaEnv.sys.mjs` | dataRootFor, nodePlatform, bridgeDirFor, bridgeFileFor, ORCAD_DATA_ROOT_FILE | ✓ VERIFIED | pure; imported by OrcaService, TheiaService and three checks |
| `powerbrowser/shell/OrcaService.sys.mjs` | folder choice, write after ready, remove on stop, state and diagnostics | ✓ VERIFIED | lines 130, 436, 528, 575, diagnostics row |
| `powerbrowser/shell/PowerBrowserAPI.sys.mjs` | writePrivateFile, platform | ✓ VERIFIED | 11022-11047; packaged copy under `objdir/dist/bin` contains writePrivateFile |
| `powerbrowser/shell/TheiaService.sys.mjs` | passes POWERBROWSER_ORCA_BRIDGE_DIR | ✓ VERIFIED | 787-795, 837, 909; packaged copy names the key |
| `scripts/verify-orca-bridge-dir.mjs` (+ rows) | quick check + self-test | ✓ VERIFIED | rows `orca-bridge-dir`, `orca-bridge-dir-self-test` in the quick registry |
| `scripts/verify-orca-agent-hooks.mjs` (+ rows) | full hermetic row + quick self-test | ✓ VERIFIED | full-tier row and quick self-test row |
| `scripts/verify-orca-agent-status-live.mjs` (+ rows) | live row + quick self-test | ✓ VERIFIED | full-tier row and quick self-test row |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| TheiaService | orca-agents backend | `POWERBROWSER_ORCA_BRIDGE_DIR` env → `POWERBROWSER_ENV` | WIRED | key compared by `orca-service` clause 10 (derived on both sides) |
| OrcaService | claude wrapper | `orcad-data-root` in the bridge folder | WIRED | literal joined across OrcaEnv, protocol file and wrapper (`orca-bridge-dir`); live content check |
| orca-agents backend | frontend | JSON-RPC `/services/powerbrowser/orca-agents` → `registerOverride` | WIRED | static clause in `orca-agent-hooks` (registerOverride with the constant) |
| claude wrapper | orcad | Orca CLI `terminal create/close` with built-from-scratch env | WIRED | stage B live in hermetic orcad |
| Claude Code extension | launcher | `claudeCode.claudeProcessWrapper` | NOT YET EXERCISED | human item (A3, A5) |

### Behavioral Spot-Checks (verifier's own runs)

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Bridge folder rules, literal join, write order | `verify-platform.sh --only orca-bridge-dir` | PASS, "data-root literal compared" | ✓ PASS |
| Bridge folder self-test | `--only orca-bridge-dir-self-test` | PASS, 10 plants | ✓ PASS |
| OrcaService scenarios and bridge key | `--only orca-service` / `orca-service-self-test` | PASS, comparison compared / 27 plants | ✓ PASS |
| Hook check verdicts and static clauses | `--only orca-agent-hooks-self-test` | PASS, 21 plants | ✓ PASS |
| Live row verdicts | `--only orca-agent-status-live-self-test` | PASS, 13 plants | ✓ PASS |
| Boundary and catalogue | `--only internals-boundary`, `internals-catalogue` | PASS | ✓ PASS |
| One seam, build shape | `--only orca-overlay`, `orca-build-shape` | PASS | ✓ PASS |
| Theia core untouched | `--only diff-theia-core` | PASS | ✓ PASS |
| Brand gate | `--only scan-brand-residue` | PASS | ✓ PASS |
| Live rows (`orca-agent-hooks`, `orca-agent-status-live`, `orca-service-live`) | not run (caller restriction) | coordinator raw logs in `.mozbuild/p63-04/` read PASS | ? SKIP (evidence from logs) |

### Probe Execution

Step 7c: no `scripts/*/tests/probe-*.sh` is declared by the Phase 63 plans; not applicable.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| TERM-02 | 63-03, 63-04 | Agents Orca starts run in Orca terminals with `ORCA_*` hooks; working/waiting/done; agents and daemon end on quit | ✓ SATISFIED | Truths 1, 2, 4 |
| EXT-02 | 63-03, 63-06, 63-04 | Extension sessions visible in Orca: pane per session, `ORCA_AGENT_HOOK_*` passed | PowerBrowser half ✓ SATISFIED; extension half ? NEEDS HUMAN | Truths 3, 5, 6; extension half with EXT-01 in the end-of-milestone pass |

No orphaned requirement: REQUIREMENTS.md maps only TERM-02 and EXT-02 to Phase 63 after D-31 (TERM-01, TERM-04 to Phase 64; TERM-03 to v2).

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (all Phase 63 files) | - | TBD/FIXME/XXX/TODO/HACK | none found | - |
| `theia/extensions/orca-agents/bin/claude-wrapper.mjs` | 44 | `shortcut:` placeholder command `cat` | ℹ️ Info | declared limit; the hermetic row passed with it |
| `scripts/verify-orca-agent-hooks.mjs` | 528-533, 653-655 | stage A finds the pane process among descendants of orcad *or* the daemon | ℹ️ Info | stage A alone does not prove daemon ancestry; the live engine clause does (truth 1) |
| `scripts/verify-orca-agent-status-live.mjs` | 303-319 | removal of `orcad-data-root` after quit is not observed live | ℹ️ Info | proven only by the stub in `orca-service` scenario A (`OrcaService.sys.mjs:528`) |
| `theia/extensions/orca-agents/src/node/claude-wrapper-launcher.ts` | 26-27 | POSIX sh launcher written on every platform | ℹ️ Info | Windows twin and packaged path are Phase 68 work (68-06-PLAN.md names the wrapper) |
| `powerbrowser/shell/PowerBrowserAPI.sys.mjs` | 11034-11036 | the empty `.tmp` exists with the umask mode until the 0600 call | ℹ️ Info | holds no byte at that point, inside a 0700 folder; the target name only appears via rename at 0600 (P63-36) |

### Human Verification Required

### 1. Claude Code extension session visible in Orca

**Test:** With EXT-01 in place, start a Claude Code extension session on an Orca worktree in a launched PowerBrowser and send one prompt.
**Expected:** The extension runs claude through `<bridge dir>/claude-wrapper`; a "Claude Code" pane appears in Orca for that worktree and moves through working, waiting and done; it closes when the session ends.
**Why human:** Roadmap criterion 3 assigns the extension half to the end-of-milestone pass. Assumptions A3 (argument shape) and A5 (default override reaching the extension's property) are unproven; the hermetic row uses a stub claude.

### 2. Preference default for claudeCode.claudeProcessWrapper

**Test:** In the same session, look up `claudeCode.claudeProcessWrapper` in Theia Settings; set a user value and restart.
**Expected:** The default shows the launcher path; a user value wins; PowerBrowser writes no settings.json.
**Why human:** Needs the extension installed to contribute the schema.

### Gaps Summary

No gaps. Every roadmap criterion that Phase 63 itself must deliver has code, wiring and a check that can go red: the overlay holds seam 010 only and none of the dropped bridge code remains; the bridge folder, `orcad-data-root` and `writePrivateFile` exist and are compared across chrome, the Theia backend and the wrapper; the hook names and status mapping are derived from the pinned Orca source; the live rows' raw logs show a real claude on Orca's daemon reading working, waiting and done and ending with the daemon on quit. The open item is the extension half of EXT-02, which the criterion itself schedules for the end-of-milestone pass with EXT-01.

---

_Verified: 2026-11-10T21:30:00Z_
_Verifier: Claude (gsd-verifier)_
