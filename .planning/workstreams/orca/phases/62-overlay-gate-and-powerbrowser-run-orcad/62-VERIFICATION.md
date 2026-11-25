---
phase: 62-overlay-gate-and-powerbrowser-run-orcad
verified: 2026-11-10T07:30:00Z
status: passed
score: 5/5 must-haves verified
covered_files:
  - .planning/workstreams/orca/phases/62-overlay-gate-and-powerbrowser-run-orcad/62-01-PLAN.md
  - .planning/workstreams/orca/phases/62-overlay-gate-and-powerbrowser-run-orcad/62-01-SUMMARY.md
  - .planning/workstreams/orca/phases/62-overlay-gate-and-powerbrowser-run-orcad/62-02-PLAN.md
  - .planning/workstreams/orca/phases/62-overlay-gate-and-powerbrowser-run-orcad/62-02-SUMMARY.md
  - .planning/workstreams/orca/phases/62-overlay-gate-and-powerbrowser-run-orcad/62-03-PLAN.md
  - .planning/workstreams/orca/phases/62-overlay-gate-and-powerbrowser-run-orcad/62-03-SUMMARY.md
  - configuration.toml
  - orca-overlay/patches/010-installed-electron-switch.patch
  - orca-overlay/seams.json
  - powerbrowser/INTERNAL-APIS.md
  - powerbrowser/endpoint-allowlist.json
  - powerbrowser/shell/OrcaEnv.sys.mjs
  - powerbrowser/shell/OrcaService.sys.mjs
  - powerbrowser/shell/PowerBrowserAPI.sys.mjs
  - powerbrowser/shell/jar.mn
  - powerbrowser/shell/powerbrowser-sidecar.js
  - powerbrowser/shell/powerbrowser.js
  - scripts/build-orca.sh
  - scripts/verify-ng-027-reader-callers.mjs
  - scripts/verify-orca-build-shape.mjs
  - scripts/verify-orca-hidden-electron.mjs
  - scripts/verify-orca-overlay.mjs
  - scripts/verify-orca-service-live.mjs
  - scripts/verify-orca-service.mjs
  - scripts/verify-platform.sh
covered_digest: "v3:sha256:1ba31446e1dcc13f7f23d548f6f5bf61e3a77f50db5a7c2dbef56667827931e7"
behavior_unverified: 0
overrides_applied: 0
deferred:
  - truth: "Criterion 2, second clause: PB's orcad completes a browser request without launching the decoy"
    addressed_in: "Phase 66"
    evidence: "Phase 66 'PowerBrowser web tabs as Orca's browser' (browser pages as PB web tabs, Orca browser tools in PB chrome). In Phase 62 orcad has no engine provider under the switch, so an engine browser request cannot complete. The no-launch half is proven at the only lookup point: orcad resolves its browser provider once, at lifecycle start (orca/src/main/orcad/orcad-browser-startup.ts:55-56, called from orcad-lifecycle.ts:149), never per request."
  - truth: "OVL-05 substance: the pane entry and the PTY and browser providers exist as new files compiled by build:web and build:orcad"
    addressed_in: "Phases 63, 64, 66"
    evidence: "Phase 62 delivers the gate (orca-overlay-built and the shadowing rule) with zero PB-added files; the files it governs land with TERM-01 (Phase 63), the pane entry (Phase 64) and BRW (Phase 66). REQUIREMENTS.md already marks OVL-05 Complete."
  - truth: "Owner re-lock of scripts/verify-ng-027-reader-callers.mjs (ledger NG-027 hash changed by dc800b31)"
    addressed_in: "End-of-milestone owner pass"
    evidence: "Owner ruling: human and owner items are deferred to the end of the milestone. The ledger reports the locked hash d885b004... against the current 7faf170f..."
---

# Phase 62: Overlay gate and PowerBrowser-run orcad Verification Report

**Phase Goal:** PowerBrowser starts, supervises and stops its own orcad with its own profile and a scrubbed environment, and every change PB makes to Orca is held to the additive overlay by a check.
**Verified:** 2026-11-10T07:30:00Z
**Status:** passed
**Re-verification:** No, initial verification

Live rows (orca-service-live, orca-hidden-electron, orca-overlay-built, orca-build-shape, orca-slotless-start) were run by the coordinator in 62-03 and were not re-run here, per the task instruction. Their evidence below is the 62-03 record, corroborated by on-disk artifacts: `.mozbuild/orca-build/build-20261110T063142Z.log` holds `overlay applied src/main/orcad/orcad-browser-provider.ts` and `build-orca: PASS`; `orca/out/orcad/orcad-server.js` contains `ORCA_DISABLE_INSTALLED_ELECTRON_BROWSER`; `objdir/dist/bin/.../powerbrowser/OrcaService.sys.mjs` and `OrcaEnv.sys.mjs` link to the tracked sources; the packaged `powerbrowser-sidecar.js` carries `pref("powerbrowser.orca.port", 26768);`; `.mozbuild/orca-service-live/` exists from the 22:35 run. The quick rows and self-tests were re-run by this verifier.

## Goal Achievement

### Observable Truths

| # | Truth (ROADMAP success criterion) | Status | Evidence |
|---|-----------------------------------|--------|----------|
| 1 | Launch starts orcad through OrcaService, a boundary consumer with catalogued touchpoints; loopback, fixed port, data root `powerbrowser-orca` in both `ORCA_USER_DATA` and `ORCA_USER_DATA_PATH`, telemetry off, `.onorca.dev` allowlisted; a check compares the running orcad's environment to the allowlist as a set | VERIFIED | `powerbrowser.js:384` chains `OrcaService.start()` in `.finally` after Theia's start. OrcaService imports only `PowerBrowserAPI`/`PowerBrowserProcesses` and `OrcaEnv` (`OrcaService.sys.mjs:24-25`); internals-boundary and internals-catalogue PASS; catalogue rows `INTERNAL-APIS.md:403-408`. `OrcaEnv.buildOrcadEnv` (`OrcaEnv.sys.mjs:86-115`) copies only `ORCAD_ENV_ALLOWLIST` names and sets both data-root names, `ORCA_TELEMETRY_DISABLED=1`, `DO_NOT_TRACK=1`, the switch; `spawnProcessExact` passes it with no append flag (`PowerBrowserAPI.sys.mjs:10946-10948`). `buildOrcadArgs` fixes `--bind 127.0.0.1` and refuses ports outside 1024..32767 (`OrcaEnv.sys.mjs:124-132`); the ready line must report `ws://127.0.0.1:<port>` (`OrcaService.sys.mjs:394`). `.onorca.dev` row `endpoint-allowlist.json:144`. Set comparison: `verify-orca-service-live.mjs:92-112` (`envVerdict`, both directions, planted `ORCA_PLANT_62` must reach PB first). orca-service scenario A drives the shipped OrcaService source and checks the spawned environment set; orca-service (`:471-472`) reds any `ORCA_`/`NODE_`/`CLAUDE_`/`ELECTRON_` name on the allowlist. 62-03 live: 18 names equal the expected set, planted variable absent. |
| 2 | A decoy Orca desktop is installed where stock orcad looks; stock orcad launches it first, then PB's orcad does not launch it | VERIFIED (browser-request clause deferred to Phase 66) | Seam `orca-overlay/patches/010-installed-electron-switch.patch` adds a 3-line guard in `installedElectronCandidates` (applied tree: `orca/src/main/orcad/orcad-browser-provider.ts:76-78`). OrcaEnv sets the switch in every orcad environment (`OrcaEnv.sys.mjs:106`). `verify-orca-hidden-electron.mjs` runs one built orcad twice; the stock run must trip two orcad-emitted detectors (profile record file, provider warning) or the check reports "detector blind" (`:243`), so the switched absence is not an absence over the check's own emitter. Decoy is a Node symlink, not a `#!` shim, so orcad actually starts it. Self-test: control plus 5 faults (ignored switch, misspelled switch, script decoy, moved source, missing seam row) PASS. 62-03 live: stock run tripped both detectors after 0 ms; switched run tripped neither in 10000 ms and orcad kept running. |
| 3 | Quit stops orcad and every agent process; after a kill, the next launch reaps stale lock and state and starts orcad on the same port | VERIFIED | `stop()`/`_stopTree` (`OrcaService.sys.mjs:471-514`) lists the tree before signalling, ends orcad through its handle with `killGraceMs` 16000, then the daemon, then leftover descendants, each by pid plus start ticks (`_sameIdentity` `:201-214`), never by group. Quit observer and named reap blocker registered before any spawn (`:78-91`). `_reapLeftover` (`:279-297`) reads PB's state file and orcad's own `orcad.lock` (`pid`, `linuxStartTicks`, matching `orca/src/main/orcad/orcad-instance-lock.ts:49-53`) and never deletes orcad's lock. Behavioral evidence run here: orca-service scenarios B (reap, recycled pid not signalled) and C (stop order: orcad, wait, daemon, leftovers; grace >= 16000; no group signal) PASS against the shipped source. Live verdicts `survivors` and `reapVerdict` (`verify-orca-service-live.mjs:118-136`) require a real agent session and a SIGKILL survivor, else "vacuous"; self-test 25 cases PASS. 62-03 live: quit ended a 5-process tree including an agent; SIGKILLed session's orcad replaced on the same port with a new lock pid. |
| 4 | A row records each declared seam's upstream blob; red on whole-file replacement, undeclared seam, seam count over cap; `--self-test` plants each | VERIFIED | `orca-overlay/seams.json` records `upstream_blob` 90b79e50...; `verify-orca-overlay.mjs:223-235` compares it with `git -C orca rev-parse HEAD:<path>` and checks the patch pre-image. Whole-file: new/deleted/rename/binary headers (`:164`) and half-file deletion (`:232-233`). Undeclared: patch without row and patch touching an undeclared path (`:154`, `:162`). Cap from `configuration.toml [orca] seam_cap = 10` (`:180-184`), absent key red. Hermetic replay runs the real `apply-patches.sh` and `regenerate-patches.sh --check` (`:238-255`). `orca-build-shape` compares orca/'s modified set with seams.json both ways (`verify-orca-build-shape.mjs:145-148`). Run here: orca-overlay PASS (1 seam, +3/-0), orca-overlay-self-test PASS (22 plants), orca-build-shape-self-test PASS (10 plants incl. modified-tracked-file and seam-not-applied). |
| 5 | The same gate derives PB-added files from the tree; red on shadowing an upstream path, or on a file `build:web`/`build:orcad` does not compile | VERIFIED (vacuous on the real tree; mechanism proven by fixtures) | Files derived from `orca-overlay/files/` (`verify-orca-overlay.mjs:187-198`); shadowing against `git ls-tree` covers exact, under-a-file, equals-a-directory and case-only (`:205-221`); `--built` requires each file's `pb-overlay:<path>` marker in a `.js` under `orca/out/web` or `orca/out/orcad`, never `node_modules` (`:267-282`). `build-orca.sh:101-126` copies files/ into orca/ and refuses shadowing. Self-test plants `file-shadows-upstream-path` and `built-marker-only-in-node_modules`, both red. Zero PB-added files exist in Phase 62, so the real-tree run is vacuous and says so. |

**Score:** 5/5 truths verified (0 present, behavior-unverified)

### Deferred Items

| # | Item | Addressed In | Evidence |
|---|------|-------------|----------|
| 1 | Criterion 2 clause "PB's orcad completes a browser request" | Phase 66 | Under the switch orcad has no engine provider, so no engine browser request can complete until PB web tabs become Orca's browser. The lookup the clause guards runs once at orcad start (`orcad-browser-startup.ts:55-56`), which the check covers. P62-14 and 62-RESEARCH.md:340 recorded this correction. |
| 2 | OVL-05 files (pane entry, PTY provider, browser provider) | Phases 63, 64, 66 | The gate is in place; the files it governs do not exist yet. REQUIREMENTS.md marks OVL-05 Complete ahead of them. |
| 3 | Owner re-lock of the NG-027 check hash | End-of-milestone owner pass | Ledger reports `scripts/verify-ng-027-reader-callers.mjs` changed against its lock. |

If the owner prefers an override over the deferral for item 1:

```yaml
overrides:
  - must_have: "PB's orcad completes a browser request without launching it"
    reason: "orcad resolves its browser provider once at start; the switched run proves no decoy launch at that only lookup point, and no engine request can complete before Phase 66"
    accepted_by: "{owner}"
    accepted_at: "{ISO timestamp}"
```

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `powerbrowser/shell/OrcaService.sys.mjs` | orcad supervisor | VERIFIED | 590 lines; imported by `powerbrowser.js:367`, started at `:384`, rows at `:313`; packaged in `jar.mn:30` |
| `powerbrowser/shell/OrcaEnv.sys.mjs` | pure env, args, ready parse, redaction, alias | VERIFIED | 273 lines; imported by OrcaService and by four checks |
| `powerbrowser/shell/PowerBrowserAPI.sys.mjs` `PowerBrowserProcesses` | end-of-file export, three methods | VERIFIED | `:10941-11010`; existing lines unmoved; four catalogue rows |
| `orca-overlay/seams.json`, `patches/010-installed-electron-switch.patch` | one declared seam | VERIFIED | applied by `build-orca.sh` step 1b through `apply-patches.sh`; build log confirms |
| `scripts/verify-orca-overlay.mjs` | overlay gate, `--built`, `--self-test` | VERIFIED | 458 lines; rows `verify-platform.sh:3868-3869`, `:6453` |
| `scripts/verify-orca-service.mjs` | static clauses plus stub scenarios A-F | VERIFIED | 653 lines; rows `:3876-3877` |
| `scripts/verify-orca-hidden-electron.mjs` | stock-then-switched decoy run | VERIFIED | 374 lines; rows `:3882`, `:6463` |
| `scripts/verify-orca-service-live.mjs` | live env set, quit tree, SIGKILL reap | VERIFIED | 460 lines; rows `:3883`, `:6464` |
| `configuration.toml [orca] seam_cap` | cap value | VERIFIED | `seam_cap = 10` at line 167 |

### Key Link Verification

| From | To | Via | Status |
|------|----|-----|--------|
| `powerbrowser.js` | `OrcaService.start()` | `.finally` on the unchanged Theia start statement | WIRED (`:384`) |
| `OrcaService` | `PowerBrowserProcesses.spawnProcessExact` | `OrcaEnv.buildOrcadEnv` as whole environment | WIRED (`:325-333`) |
| `OrcaEnv.ORCAD_HIDDEN_ELECTRON_SWITCH` | seam patch literal | same string `ORCA_DISABLE_INSTALLED_ELECTRON_BROWSER` | WIRED; hidden-electron check derives both and reds a misspelling |
| `build-orca.sh` | `apply-patches.sh` | `--upstream orca --patches orca-overlay/patches` | WIRED (`:96`) |
| `verify-orca-overlay.mjs` | `regenerate-patches.sh --check` | hermetic replay | WIRED (`:249`) |
| `verify-orca-service-live.mjs` | `OrcaEnv.compareEnvNames` | Node import of the same constant | WIRED (`:97`) |
| `verify-orca-build-shape.mjs` | `seams.json` | set comparison with porcelain | WIRED (`:145-148`, `:269`) |

### Data-Flow Trace (Level 4)

Not applicable: no rendered UI. The data path that matters, orcad's environment, traces from `PowerBrowserAPI.getEnv` through `OrcaEnv.buildOrcadEnv` into `Subprocess.call({ environment })` and is read back from `/proc/<orcad>/environ` by the live row.

### Behavioral Spot-Checks (run by this verifier)

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Overlay gate on the real tree | `verify-platform.sh --only orca-overlay` | 1 seam (+3/-0, blob 90b79e505d), 0 overlay files | PASS |
| Overlay gate can go red | `--only orca-overlay-self-test` | 22 planted faults each red naming the drift | PASS |
| OrcaService against stub boundary | `--only orca-service` | scenarios A-F (start, reap, stop order, busy port, non-loopback, alias) | PASS |
| orca-service can go red | `--only orca-service-self-test` | 19 planted faults | PASS |
| Hidden-Electron mechanism | `--only orca-hidden-electron-self-test` | control green, 5 faults red | PASS |
| Live verdict functions | `--only orca-service-live-self-test` | 25 cases | PASS |
| Build-shape seam coexistence | `--only orca-build-shape-self-test` | 10 faults | PASS |
| Boundary | `--only internals-boundary`, `--only internals-catalogue` | no forbidden pattern outside the boundary; every occurrence catalogued | PASS |
| NG-027 | `--only ng-027-reader-callers` | 32 readers, all called | PASS |
| Brand gate | `node scripts/scan-brand-residue.mjs` | no residue in 696 files | PASS |

### Probe Execution

No `scripts/*/tests/probe-*.sh` is declared by the phase. Step 7c: not applicable.

### Requirements Coverage

| Requirement | Source Plan | Status | Evidence |
|-------------|-------------|--------|----------|
| RUN-03 | 62-02 | SATISFIED | Truth 1 |
| RUN-04 | 62-01, 62-02 | SATISFIED | Truth 2 |
| RUN-05 | 62-02 | SATISFIED | Truth 3 |
| OVL-01 | 62-01 | SATISFIED | Truth 4 |
| OVL-05 | 62-01 | SATISFIED as a gate | Truth 5; the files it governs are deferred (Phases 63, 64, 66) |

No orphaned requirement: REQUIREMENTS.md maps exactly these five IDs to Phase 62.

### Check Quality (can each check go red?)

- Every new quick check has a `--self-test` that plants faults and requires each to go red naming the drift (overlay 22, service 19, hidden-electron 5 plus control, service-live 25 verdict cases, build-shape 10).
- Absence assertions: orca-hidden-electron asserts the absence of the profile record file and the provider warning, both emitted by orcad, and only after the stock run proves they fire. The live quit and reap verdicts refuse a vacuous pass (no agent session, no SIGKILL survivor). CLAUDE.md verification rule 1 holds.
- Derive and compare: seam list, blobs, patched paths, upstream file set, environment names, switch name, record file name and warning text are all derived at check time. The expected environment set derives from `OrcaEnv.ORCAD_ENV_ALLOWLIST`, so a widened allowlist would also widen the expectation; orca-service closes that by refusing `ORCA_`/`NODE_`/`CLAUDE_`/`ELECTRON_` and named steering variables on the allowlist (`verify-orca-service.mjs:471-472`, self-test plant "NODE_OPTIONS in the allowlist").
- Limit: the `--built` compile proof has never run on a real PB-added file. The marker method assumes the bundler keeps the `pb-overlay:<path>` literal; if it drops it, the row fails red, not green.

### Commit dc800b31 (ledger-locked NG-027 check)

Change: `callPattern` for `method` readers widened from `PowerBrowserAPI\.<name>\(` to `(?:PowerBrowserAPI|PowerBrowserProcesses)\.<name>\(` (`scripts/verify-ng-027-reader-callers.mjs:96`), plus a fixture reader on `PowerBrowserProcesses` and a plant that removes its only caller and must go red.

Verdict: it does not weaken the check in practice. `deriveReaders` (`:72-79`) already took every two-space-indented method in the file, including the new export's, so before the change `listProcessTree` could only pass if someone called it as `PowerBrowserAPI.listProcessTree(`, which is a runtime error. The old row was red for a correct caller. The new pattern still requires a non-comment call site in runtime source outside dead reader bodies. The one widening is a cross-object name collision: a dead `PowerBrowserAPI.X` reader would count as called by a live `PowerBrowserProcesses.X(` and the reverse. No such collision exists today: the duplicate method names in the file (`fireTabEvent`, `observe`, `step` and four others) are not readers, and `listProcessTree` is defined once. The self-test does not plant a collision. Binding each method to its owning object by line range would remove the gap; that is a hardening option, not a defect in this phase. The process issue remains: a ledger-locked file was edited, and the owner must re-lock it (deferred item 3).

### Anti-Patterns Found

None. No `TBD`, `FIXME` or `XXX` in the phase's files. No stub returns on a user-visible path. OrcaService adds no user-facing copy (orca-service plant "user-message table in OrcaService" reds).

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `scripts/verify-ng-027-reader-callers.mjs` | 96 | call shape not bound to the owning export object | Info | False green possible only on a cross-object reader name collision; none exists |
| `.planning/workstreams/orca/REQUIREMENTS.md` | OVL-05 row | Complete before its governed files exist | Info | Traceability is ahead of substance; deferred item 2 |

### Human Verification Required

None in this phase (D-18). Owner items are listed under Deferred.

### Gaps Summary

No gaps. All five success criteria are present in code, wired, and covered by checks that can go red. Criteria 1-3 rely on live runs made by the coordinator in 62-03 (not repeated here by instruction) plus stub-boundary scenarios over the shipped OrcaService source that this verifier ran. Criterion 5 is proven by fixtures only, because Phase 62 adds no PB file to Orca. The criterion 2 "browser request" clause and OVL-05's substance belong to later phases.

---

_Verified: 2026-11-10T07:30:00Z_
_Verifier: Claude (gsd-verifier)_
