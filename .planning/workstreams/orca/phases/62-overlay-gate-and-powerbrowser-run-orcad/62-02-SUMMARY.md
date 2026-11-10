---
phase: 62-overlay-gate-and-powerbrowser-run-orcad
plan: 02
subsystem: shell
tags: [orca, orcad, supervisor, boundary, environment-allowlist, reap, egress, verify-platform]
status: lane complete; live proofs and three merge items are the coordinator's (62-03)

requires:
  - phase: 60-03
    provides: "scripts/lib/orca-run.mjs (ensurePbNode, orcaVersionFromPins, descendants, installedOrcaPaths, installOutputRedaction)"
  - phase: 62-01
    provides: "the overlay seam that reads ORCA_DISABLE_INSTALLED_ELECTRON_BROWSER (needed only by the live row orca-hidden-electron)"
provides:
  - "powerbrowser/shell/OrcaEnv.sys.mjs: pure env allowlist, argv, ready-line parse, redaction, socket fit, alias, output sink, env-name compare; imported by chrome and by Node checks"
  - "powerbrowser/shell/OrcaService.sys.mjs: the orcad supervisor, a boundary consumer"
  - "PowerBrowserProcesses (spawnProcessExact, listProcessTree, addNamedReapBlocker) at the end of PowerBrowserAPI.sys.mjs, six catalogue rows"
  - "launch wiring in powerbrowser.js, powerbrowser.orca.* prefs (port 26768), jar.mn lines, the .onorca.dev user-initiated egress row"
  - "checks: verify-orca-service.mjs, verify-orca-hidden-electron.mjs, verify-orca-service-live.mjs, each with --self-test"
  - "rows: orca-service, orca-service-self-test, orca-hidden-electron-self-test, orca-service-live-self-test (quick); orca-hidden-electron, orca-service-live (full)"
affects: [62-03, 63, 64, 65, 66, 67, 68]

plan_head_before: b6a3e2ce
actuals:
  tasks: 3
  commits: 3

key-files:
  created:
    - powerbrowser/shell/OrcaEnv.sys.mjs
    - powerbrowser/shell/OrcaService.sys.mjs
    - scripts/verify-orca-service.mjs
    - scripts/verify-orca-hidden-electron.mjs
    - scripts/verify-orca-service-live.mjs
  modified:
    - powerbrowser/shell/PowerBrowserAPI.sys.mjs
    - powerbrowser/INTERNAL-APIS.md
    - powerbrowser/shell/jar.mn
    - powerbrowser/shell/powerbrowser-sidecar.js
    - powerbrowser/shell/powerbrowser.js
    - powerbrowser/endpoint-allowlist.json
    - scripts/verify-shell-error-contract.mjs
    - scripts/verify-platform.sh

requirements-completed: []
---

# Phase 62 Plan 02: OrcaService Summary

OrcaService starts, supervises and stops orcad through an appended boundary export, with an exact
environment and identity-checked reap and stop. The static rows and all three self-tests are green
in the lane. Nothing was run live: the lane has no built orca/ and no objdir, so RUN-03, RUN-04 and
RUN-05 are not claimed complete here. The two live rows SKIP in the lane and are the coordinator's
proofs.

## Task Commits

| Task | Commit | Message |
|------|--------|---------|
| 1 | d084d788 | feat(62-02): OrcaService, OrcaEnv and the PowerBrowserProcesses boundary |
| 2 | d93a4bad | feat(62-02): launch wiring, .onorca.dev row, orca-service scenarios and self-test |
| 3 | this commit | feat(62-02): hidden-Electron and live service checks, rows, lane summary |

## Coordinator proof commands

Run in this order, in the coordinating workspace, after 62-01 and 62-02 are merged. Scrub inherited
ORCA_ variables first for the build step. Headless only.

1. `nix develop .#orca --command bash scripts/build-orca.sh` (after 62-01 merges, so the seam is built into orca/out)
2. `nix develop .#firefox --command bash -c 'cd upstream && MOZCONFIG=../.mozconfig ./mach build faster'` (packages OrcaService.sys.mjs, OrcaEnv.sys.mjs and the new prefs)
3. `flock /home/chris/coding/Power-Browser/.git/pb-live.lock scripts/verify-platform.sh --only orca-service-live`
4. `flock /home/chris/coding/Power-Browser/.git/pb-live.lock scripts/verify-platform.sh --only orca-hidden-electron`

Neither live row has ever run. Expect the first run of each to need small fixes; the parts most
likely to need them are named under "Not verified" below.

## Merge note for the coordinator

1. **Registry blocks** go after p62-01's at both anchors: the quick block after `licence-allowlist-self-test`, the full block after `orca-slotless-start`. Both blocks start `# NEW (62-02, ...)`.
2. **Brand rows** for every new or changed file of this lane (counts below). inventory/brand-tokens.json was not edited here.
3. **Regenerate generated/** after the merge (`node scripts/generate.mjs`): endpoint-allowlist.json has a new row.
4. **ng-027-reader-callers is red on this branch and needs a one-line check edit that is outside this lane's files.** `listProcessTree` is a reader by name, and its caller is `PowerBrowserProcesses.listProcessTree(` in OrcaService.sys.mjs. `callPattern` in scripts/verify-ng-027-reader-callers.mjs (line 95) only recognises `PowerBrowserAPI.<name>(` for a two-space-indented method. Fix: accept either object name, `(?:PowerBrowserAPI|PowerBrowserProcesses)\.<name>\(`, and add the second object to the self-test fixture. Output on this branch: `powerbrowser/shell/PowerBrowserAPI.sys.mjs:10955 listProcessTree -- no caller on the runtime path`.
5. **No block comments in the PowerBrowserProcesses section.** verify-extension-actions, verify-page-tools-edit and verify-web-tab-bridge strip block comments from PowerBrowserAPI.sys.mjs with a regular expression; an earlier `/*` inside a string in that file is unterminated today, and a `*/` appended at the end of the file closes it and deletes thousands of lines from what those checks see. The section therefore uses `//` comments only, and says so in its first line. Any later end-of-file addition to that file has the same constraint.
6. No WINDOWS.md ids. No user-facing copy. No manifest key.

### Brand scan (expected red in this lane)

`node scripts/scan-brand-residue.mjs --report .mozbuild/p62-02/brand-report.md` on the staged tree: exit 1, 942 reconciliation failures, all of them Orca-family hits in this lane's files. The report file is in the lane worktree's ignored .mozbuild/ and is not committed.

Unclaimed hits (condition 4) per file:

| File | Hits |
|------|-----:|
| scripts/verify-orca-service.mjs | 262 |
| scripts/verify-orca-service-live.mjs | 249 |
| scripts/verify-orca-hidden-electron.mjs | 160 |
| powerbrowser/shell/OrcaService.sys.mjs | 144 |
| powerbrowser/shell/OrcaEnv.sys.mjs | 72 |
| powerbrowser/INTERNAL-APIS.md | 14 |
| powerbrowser/shell/powerbrowser-sidecar.js | 12 |
| powerbrowser/endpoint-allowlist.json | 8 |
| powerbrowser/shell/powerbrowser.js | 6 |
| powerbrowser/shell/jar.mn | 4 |
| scripts/verify-shell-error-contract.mjs | 4 |
| powerbrowser/shell/PowerBrowserAPI.sys.mjs | 3 |

By spelled form across those files: `orca` 564, `Orca` 247, `ORCA` 127 (938 hits; the in-word rows `orcad`, `ORCAD`, `Orcad` take their share of these when the rows are written).

Held-back rows whose count moved because scripts/verify-platform.sh is already in their file sets: `Orca` 93 to 100, `orca` 420 to 440, `ORCA` 100 to 101, `orcad` 179 to 187. These figures are for this lane alone; remeasure once on the merged tree.

## Decisions Made

- **PowerBrowserProcesses is an end-of-file export**, not members appended inside the PowerBrowserAPI object. The first 10935 lines of PowerBrowserAPI.sys.mjs are byte-identical to the base, `verify-ng-040 --fix` renumbered nothing, and `spawnProcess`, `addSidecarReapBlocker` and the sidecar blocker's row are untouched. `addNamedReapBlocker` refuses any name that is not a new `PowerBrowser: reap <what>` name, without spelling the sidecar blocker's name a second time (verify-sidecar-reap-blocker pins it).
- **Environment allowlist** is the list in the plan's interfaces block (research assumption A3, Linux and macOS names). OrcaService spells no environment name; `OrcaEnv.buildToolEnv` was added so the `ln` spawn gets the search path without OrcaService naming it.
- **Alias rule**: `<XDG_RUNTIME_DIR>/pb-orca-<12 hex of SHA-256 of the data root>`, else `<HOME>/.cache/pb-orca-<hex>`, never under /tmp, made with `ln -sfnT` each launch; a failed or still-too-long alias is a start failure.
- **Port 26768** as a pref with fallback 0 in the reader, so a missing pref is a named failure and there is no second copy of the default.
- **Stop lists the tree under orcad before signalling it**, not only the tree under the daemon pid from the ready line. Reason: the daemon is orcad's child only while orcad lives, and a daemon that orcad restarted after the ready line would otherwise be unknown at quit. Order is unchanged from P62-18: orcad through its handle (grace 16000 ms), wait, SIGTERM to the recorded daemon, up to 3000 ms, SIGKILL for snapshot identities still alive.
- **Launch-time reap** signals the orcad named by the state file and the one named by orcad.lock, then the state-file daemon and its tree. On a respawn after an orcad crash only orcad is reaped and the state file is kept, so the daemon record survives a second crash.
- **Assumption delta** (recorded as the plan asked): add-alongside. orcad and the Theia backend have different owners and lifecycles and share only the boundary. A third supervised sidecar is what would justify a generic supervisor.

## Deviations from Plan

1. **Security review of commit d084d788 (fixed in d93a4bad).** (a) The stderr sink cut long lines before redacting, which could leave a pairing fragment the patterns no longer match; a line is now redacted whole or replaced by a fixed marker. (b) The Orca root came only from the pref, whose build default is the dev tree; it now prefers `<GreD>/orca` when present unless the user set the pref, as TheiaService does for its backend. Phase 68 still has to stage that directory.
2. **Block comments removed from the appended boundary section** (in the Task 3 commit). See merge note 5. Found by running the whole quick gate, not by the plan's row list.
3. **The stub ready line carries a bare pairing code as well as the URL forms.** The first self-test run showed the "sink logs stdout" plant staying green, because the service's own redaction caught the URL forms. The bare code is a form redaction has no pattern for, so the scenario now proves that stdout is never logged, not that redaction happens to work.
4. **orca-service-live sets `powerbrowser.orca.root` in the profile** to this checkout's orca/, so a PowerBrowser binary from another checkout (PB_FIREFOX_BIN) does not run a different tree's orcad.
5. **orca-service-live has more self-test cases than the plan lists** (25): TCP row parsing and two extra environment cases.
6. **verify-orca-hidden-electron.mjs exports** startTicks, ppidMap, signalIdentity and freePort; the live check imports them.

## Verification

Green in the lane:

- `scripts/verify-platform.sh --only` for orca-service, orca-service-self-test (19 plants), orca-hidden-electron-self-test (control plus 5 faults), orca-service-live-self-test (25 cases).
- orca-hidden-electron and orca-service-live each print their SKIP line and exit 0.
- internals-boundary, internals-catalogue, ng-040-internals-catalogue-lines, sidecar-reap-blocker; PowerBrowserAPI.sys.mjs is append-only against the merge base.
- start-path-recovery and its self-test, shell-error-contract and its self-test, shell-error-copy-no-internals, ng070-no-spaced-name, shell-csp-inline-attrs, theia-endpoints, privacy-hosts, allowlist-schema, endpoint-dispositions-self-test, extension-actions, page-tools-edit, gui02-web-tab-bridge.
- Lane diff against the merge base lists only files_modified paths.

`scripts/verify-platform.sh --quick` on the lane branch: 335 PASS, 7 FAIL.

| Row | Cause |
|-----|-------|
| scan-brand-residue, scan-brand-residue-self-test | Expected: brand rows are the coordinator's |
| ng-027-reader-callers | This lane; merge note 4 |
| tab-uris-typecheck, chrome-bar-typecheck | No Theia build in the lane (`@powerbrowser/token-gate/lib/...` missing); not compared against the base |
| gui09-dependent-window-content and its self-test | No Theia build in the lane (`lib/frontend/secondary-window.html` missing); not compared against the base |

## Not verified

- **Nothing live.** OrcaService has never run in Gecko, and no real orcad was started by this lane. In particular: `crypto.subtle` and `TextEncoder` in the system-module scope (OrcaEnv uses both; TheiaService already uses `crypto.randomUUID` there), `Subprocess.call` with `workdir` and an exact environment, `IOUtils.getChildren("/proc")`, and AsyncShutdown waiting the full stop budget (20.5 s against the 60 s crash timeout).
- **The live check's CLI steps** (`repo add`, `terminal create --command "sleep 900"`) follow the research record, and the agent is matched as argv exactly `sleep 900` under the daemon. If orcad wraps the command differently, the row fails with "vacuous: no agent session" and the match needs adjusting.
- **The real ready line's shape** is taken from scripts/lib/orca-run.mjs and the research notes, not re-read from a running orcad.
- **Whether a stock orcad run launches anything besides the decoy** on a host with a Chromium on PATH (orca-hidden-electron passes PATH through). Research ran the stock decoy case on this host and saw only the warning.
- **macOS and Windows**: bare-pid signals are Linux-only in the boundary, so the daemon is not reaped there. Phase 68.

## Self-Check: PASSED

Files exist and are committed; the three self-tests and the static row are green; the two reds this lane causes (brand scan, ng-027-reader-callers) are named with their fix; no pairing value appears in this directory.
