---
phase: 54-windows-h
plan: 03
subsystem: updater
status: complete-local
tags: [windows, asyncshutdown, updater, matrix, libvirt, registry-rows]
requires:
  - phase: 54-02
    provides: Windows stage script and the native gate; patch 040 regenerated
provides:
  - AsyncShutdown blocker "PowerBrowser: reap sidecar" for quit and restart (UPD-30)
  - bounded stopAndReap in TheiaService (poll 100 ms, killGraceMs, loud timeout)
  - sidecar-reap-blocker row with a self-test (quick)
  - win-matrix-record row with a background-task (UPD-31) contract and a hermetic self-test (full)
  - pkg-win11 harness files: domain XML, guest driver, host driver (owner-run)
affects: [54-04 owner checkpoint, phase-50 release pipeline]
key-files:
  created:
    - scripts/verify-sidecar-reap-blocker.mjs
    - scripts/verify-win-matrix-record.mjs
    - scripts/matrix/pkg-win11-domain.xml
    - scripts/matrix/win-matrix-guest.ps1
    - scripts/matrix/win-matrix-run.sh
  modified:
    - powerbrowser/shell/PowerBrowserAPI.sys.mjs
    - powerbrowser/shell/TheiaService.sys.mjs
    - powerbrowser/INTERNAL-APIS.md
    - scripts/verify-platform.sh
    - docs/RELEASING.md
decisions:
  - "One boundary-owned blocker covers quit and restart: restartToUpdate quits with eRestart, which also raises quit-application-granted, so AsyncShutdown.quitApplicationGranted sees both"
  - "The blocker's callback is bound to a local before registration, because the start-path-recovery row derives its single quit-observer registration from inline arrow callbacks"
  - "stopAndReap defaults killGraceMs to 5000 ms as the plan states; the existing kill path keeps its 3000 ms default. Both read the same pref"
  - "The matrix driver runs one cell per guest-exec and takes the verdict from the guest exit code; no fabricated evidence path"
  - "The win-matrix-record rows are full tier: the live record exists only after the owner's guest run, so the live row is red until then, as the codeberg and upptime live rows already are"
metrics:
  duration: "one session"
  completed: 2026-10-31
  tasks: 3
  files: 11
actuals:
  tokens: 37146
  tasks: 3
  commits: 3
  basis: chars/4 over the realized diff 12b3194f..HEAD excluding upstream (148584 bytes, includes the matrix harness files); the plan estimate was 115000 over the full work
---

# Phase 54 Plan 03: Updater reap and matrix harness Summary

**The quit and restart paths await a bounded sidecar reap through an AsyncShutdown blocker; the reap is catalogued and gated by a static row. The matrix record row and the pkg-win11 harness are built and self-tested over fixtures. Their live run is the owner's (54-04).**

## Commits

Plan head before: `12b3194f`. Measured with `git rev-list --count 12b3194f..HEAD` after the last task commit: 3.

- `1b48d104` feat(54): AsyncShutdown reap blocker for quit and restart (UPD-30)
- `c65f218f` feat(54): matrix record row and background-task contract (MTX-01, UPD-31)
- `3e2e6dfa` feat(54): pkg-win11 matrix harness files (MTX-01)

## Verification

- `scripts/verify-platform.sh --quick`: exit 0, `verify-platform: PASS -- all checks passed`, 218 PASS rows (216 plus `sidecar-reap-blocker` and its self-test), no FAIL row.
- `scripts/check-internals-boundary.sh`: PASS. No forbidden Firefox-internal pattern appears under `powerbrowser/shell/`.
- `scripts/verify-sidecar-reap-blocker.mjs` and `--self-test`: exit 0. The baseline names the blocker call at `PowerBrowserAPI.sys.mjs` line 701. Three plants (missing registration, unbounded wait, missing catalogue row) each go red naming the rule and value.
- `scripts/verify-start-path-recovery.mjs` and its self-test: exit 0 after the local-binding change.
- `scripts/verify-win-matrix-record.mjs --self-test`: exit 0. The good fixture is green; seven planted faults each go red naming the cell and the cause.
- `scripts/verify-win-matrix-record.mjs` on the live tree: exit 1, naming `scripts/matrix/win-matrix-record.json` as absent. Expected: the record exists only after the owner's guest run. It is a full-tier row, so `--quick` does not run it.
- `bash -n scripts/matrix/win-matrix-run.sh`: OK. `scripts/matrix/pkg-win11-domain.xml` parses as XML.
- `node scripts/scan-brand-residue.mjs`: PASS over 490 files.

### Self-test outputs

```text
sidecar-reap-blocker --self-test:
  ok  baseline -> green (blocker addBlocker at PowerBrowserAPI.sys.mjs line 701)
  ok  registration call missing from start() -> red, naming [registration] and 'addSidecarReapBlocker'
  ok  unbounded reap (no deadline comparison) -> red, naming [bound] and 'deadline'
  ok  missing catalogue row -> red, naming [catalogue] and 'reap sidecar'
win-matrix-record --self-test:
  ok  good fixture -> green (6 cell(s))
  ok  update cell missing -> red, naming [cells] and 'update'
  ok  empty build target -> red, naming [build-target] and 'BUILD_TARGET'
  ok  Software\Mozilla touched -> red, naming [registry] and 'Software\Mozilla'
  ok  SmartScreen block absent -> red, naming [smartscreen] and 'Windows protected your PC'
  ok  background deferred without a reason -> red, naming [background] and 'REASON'
  ok  bare RED verdict without evidence -> red, naming [cells] and 'install'
  ok  maintenance service recorded enabled -> red, naming [background] and 'maintenance service'
  ok  zero-cell record -> red, naming [vacuity] and zero cells
```

## Task status

### Task 1: UPD-30 reap blocker (DONE)

- `PowerBrowserAPI.addSidecarReapBlocker(fn)` registers `"PowerBrowser: reap sidecar"` on `AsyncShutdown.quitApplicationGranted` through `ChromeUtils.importESModule`.
- `TheiaService.start()` registers it once per process. `stopAndReap()` calls the idempotent `stop()`, then polls `signalBarePid(pid, 0)` every 100 ms until the pid is gone. The bound is `powerbrowser.sidecar.killGraceMs`, default 5000 ms. On timeout it logs the live pid through `PowerBrowserAPI.log("error", ...)` and resolves, so shutdown is never held.
- `INTERNAL-APIS.md`: two touchpoint rows (the module import and the blocker registration). The 115 existing `PowerBrowserAPI.sys.mjs:N` references at or past the insertion point were renumbered by +11, the inserted line count. No catalogue row cites a line in `TheiaService`.

### Task 2: UPD-31 background-task contract (DONE, live run owner)

- `scripts/verify-win-matrix-record.mjs` derives the background cell's state. "verified" needs the three observables: a task entry, `backgroundupdate.moz_log`, and a staged apply while closed. "deferred" needs an exact REASON (`APPBASEDIR_NOT_WRITABLE`, `SERVICE_REGISTRY_KEY_MISSING`, `NO_APP_UPDATE_BACKGROUND_ENABLED`) and a scheduler error. A record that marks the maintenance service enabled is red.
- `docs/RELEASING.md`: the UPD-30 blocker paragraph and the UPD-31 verified-or-deferred paragraph, beside the admin-install note.

### Task 3: MTX-01 harness (DONE locally, live run owner)

- `scripts/matrix/pkg-win11-domain.xml`: a new domain, qcow2 nvram, the default NAT network, a guest-agent channel. The shut-off `win11` stub and its disk are untouched.
- `scripts/matrix/win-matrix-guest.ps1`: one cell per run through `-Cell`. It exports both hives under the fork root and the upstream root for the no-residue cell.
- `scripts/matrix/win-matrix-run.sh`: takes a noclobber lock, reverts to `clean-baseline` per cell, runs the cell through `guest-exec` and polls `guest-exec-status`. The verdict is the guest exit code and the evidence is its captured stdout, both written under the lock.
- `docs/RELEASING.md`: the stale `virsh list --all` zero-domains sentence is corrected in place. `win11` is defined and shut off.

## Deviations from Plan

### Adaptations

**1. [Adaptation - registration shape] The blocker callback is bound to a local.** The `start-path-recovery` row derives its single quit-observer registration from an inline `PowerBrowserAPI.<fn>(() => this.<method>())` pattern. An inline arrow passed to the blocker made `start()` look like it had two registrations and turned that row red. Binding the callback to `reapBlocker` keeps the registration, and both rows now pass. No row was weakened.

**2. [Adaptation - kill-grace default] `stopAndReap` defaults to 5000 ms, not 3000 ms.** The plan states 5000 ms for the reap. The existing kill path keeps 3000 ms. Both read `powerbrowser.sidecar.killGraceMs`, so an operator who sets the pref changes both.

**3. [Adaptation - matrix rows] The matrix record rows are full tier.** The plan says full tier for the live check. `win-matrix-record` reads the record the owner's guest run writes, so it is red on the live tree until then. This is the same pattern as the existing `codeberg-mirror-live` and `upptime-sweep-live` rows.

**4. [Adaptation - matrix transport] The driver takes the verdict from the guest exit code, not from a string search.** An earlier draft searched the output for the cell name. That would have accepted evidence that was never produced by the guest. The rewritten driver uses `guest-exec` and `guest-exec-status`, and its exit-code verdict is the only verdict path.

### Known gaps for the owner run (recorded, not coded around)

- The driver does not capture the built `BUILD_TARGET` into the record. Until it does, `win-matrix-record` reds `build-target`.
- The driver does not write the `background` cell. Until it does, the record row reds `background`. The owner records it from the update cell's probe (BLOCKED.md item 7).
- The staged inputs reach the guest on a CD-ROM the owner attaches; the driver does not copy files in (BLOCKED.md item 6).
- The matrix has never run on a guest. The XML's disk and nvram paths and the OVMF template paths are placeholders for the host.

### Auto-fixed issues

**1. [Rule 1 - Bug] The reap row's baseline label named the wrong file.** It printed `INTERNAL-APIS.md line 701 of PowerBrowserAPI.sys.mjs`. Fixed to name `PowerBrowserAPI.sys.mjs line 701`.

**2. [Rule 1 - Bug] The matrix record's SmartScreen message did not name the text it checks.** A plant would have failed its own self-test. Fixed to name the block text.

### Authentication gates

None.

## Known Stubs

None in the shipped files. The live matrix and the background cell are recorded as owner work in BLOCKED.md, not stubbed.

## Self-Check: PASSED

- Commits `1b48d104`, `c65f218f`, `3e2e6dfa` are in `git log`.
- The shell files, the catalogue, the verify rows, the matrix harness and the docs are tracked.
- `--quick` exit 0 with 218 PASS rows and no FAIL row.
