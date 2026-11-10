---
phase: 60-orca-from-source-on-theia-s-node
plan: 03
subsystem: infra
tags: [orca, orcad, node-runtime, pairing, redaction, live-probe, verify-platform]

requires:
  - phase: 60-02
    provides: "built, de-slotted orca/out/orcad and orca/out/web; verify-orca-build-shape.mjs"
provides:
  - "scripts/lib/orca-run.mjs: PB Node provisioning from node-runtime.json, scrubbed orcad env, loopback spawn, ready-line parse, pairing redaction, /proc runtime walk, teardown, installed-Orca path derivation"
  - "scripts/verify-orca-slotless-start.mjs: orca-slotless-start live probe (orcad half plus PB web-tab pairing) with a hermetic --self-test"
  - "rows orca-slotless-start (full, last entry) and orca-slotless-start-self-test (quick)"
  - "exports: generate-licensing.mjs readNodePin, verifyArchive, fetchArchive; verify-orca-build-shape.mjs walk, NODE_NAMES"
affects: [60-04, 60-05, 68]

actuals:
  tokens: 11200
  tasks: 3
  commits: 2
plan_head_before: 0bc1d210840c8d80690a741f154ebbd80fc5e4d9
plan_head_after: 6956debf0c5f5c4ba0008ac331c0dd29d4c62d7d

tech-stack:
  added: []
  patterns:
    - "A probe that handles a credential redacts at the process boundary (stdout/stderr write wrappers) and proves it with a sentinel that the capture must see unredacted first"
    - "A UI connected-state marker is derived from the third-party source's i18n templates, and the self-test derives it from a fixture with synthetic templates"

key-files:
  created:
    - scripts/lib/orca-run.mjs
    - scripts/verify-orca-slotless-start.mjs
  modified:
    - scripts/generate-licensing.mjs
    - scripts/verify-orca-build-shape.mjs
    - scripts/verify-platform.sh

key-decisions:
  - "Connected-host marker: the two {{count}} templates of connectedHostCountLabel in orca/src/renderer/src/components/status-bar/ssh-status-segment-copy.ts:3, count a positive integer; innerText omits SshStatusSegment's two visibility:hidden reserve spans (checked live)"
  - "verify-orca-build-shape.mjs CLI now runs only as the entry point, so its walk can be imported"

requirements-completed: [RUN-02]

coverage:
  - id: D1
    description: "orcad starts slot-less on the official Node from node-runtime.json, loopback, reports that Node, one runtime, orcad and terminal daemon reaped"
    requirement: RUN-02
    verification:
      - kind: integration
        ref: "node scripts/verify-orca-slotless-start.mjs (PASS, live)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Source-built web client pairs in a PB web tab with no input"
    requirement: RUN-02
    verification:
      - kind: integration
        ref: "flock pb-live.lock scripts/verify-platform.sh --only orca-slotless-start (PASS, 'web tab paired')"
        status: pass
    human_judgment: false
  - id: D3
    description: "Self-test: control green, seven plants red, leak sentinel, installed-Orca SKIP"
    requirement: RUN-02
    verification:
      - kind: unit
        ref: "scripts/verify-platform.sh --only orca-slotless-start-self-test (11 ok lines)"
        status: pass
    human_judgment: false

duration: 12min
completed: 2026-11-10
status: complete
---

# Phase 60 Plan 03: orcad slot-less start on PowerBrowser's Node Summary

**orca-slotless-start starts the source-built orcad on the official Node 24.19.0 from node-runtime.json, confirms a loopback bind, the reported Node version and exactly one Node runtime, pairs the source-built web client in a headless PB web tab with no input, and reaps orcad and its terminal daemon. The pairing URL is redacted from all output.**

## Performance

- **Duration:** about 12 min (plan ledger 23:59Z to SUMMARY 00:11Z), plus reading time before the ledger
- **Started:** 2026-11-09T23:59:15Z
- **Completed:** 2026-11-10
- **Tasks:** 3 (tracer, decision not reached, auto)
- **Files modified:** 5

## Probe record

- **Live PASS line:** `orca-slotless-start: PASS -- orcad 1.4.248 ready on ws://127.0.0.1:<port>, Node 24.19.0 (node-runtime.json), 1 Node runtime, web tab paired (status bar '1 host', marker from orca/src/renderer/src/components/status-bar/ssh-status-segment-copy.ts:3), orcad and terminal daemon reaped (10.7s)`
- **Bound port class:** loopback (`ws://127.0.0.1:`, port picked by `--port 0`; three runs drew 37813, 38599, 39709)
- **Node:** 24.19.0, the official linux-x64 binary from `powerbrowser/packaging/node-runtime.json`, archive copied from the main checkout's `.mozbuild/node-dist` cache and sha256-checked, extracted to `.mozbuild/orca-probe-node/node`. The ready line's `health.nodeVersion` reported it directly, so the `/proc` fallback was not needed.
- **Runtime set:** one member, the probe's own node (orcad's process tree and the terminal daemon both run on it; zero node files under orca/out).
- **Terminal daemon:** `health.terminalDaemon.pid` reported; both pids gone after teardown on every run. `pgrep -f out/orcad/orcad.js` prints nothing afterwards.
- **Elapsed:** orcad half alone 2.6 s; full row with the PB web tab 10.7 s.
- **Connected marker:** `connectedHostCountLabel` in `orca/src/renderer/src/components/status-bar/ssh-status-segment-copy.ts:3` (templates `{{count}} hosts` / `{{count}} host`), rendered by `SshStatusSegment.tsx`. The client rendered "1 host" visible on first read. A live DOM read showed SshStatusSegment's two invisible reserve spans ("1 host", "99 hosts", `visibility: hidden`) are absent from `innerText`, so only the visible count can match.

Task 2: not reached (1.4.248 passed)

## Task Commits

1. **Task 1: tracer, orcad half on PB's Node** - `7973a96a` (feat). Tracer gate (auto mode): verify re-run end to end, PASS, then expanded.
2. **Task 2: D-04 fallback decision** - not reached (1.4.248 passed both halves)
3. **Task 3: web-tab pairing half, self-test, two rows** - `6956debf` (feat)

## Files Created/Modified

- [scripts/lib/orca-run.mjs](scripts/lib/orca-run.mjs) - ensurePbNode, orcaVersionFromPins, orcadEnv, assertEnv, startOrcad, parseReady, redact, installOutputRedaction, descendants, nodeExesInTree, stopOrcad, installedOrcaPaths
- [scripts/verify-orca-slotless-start.mjs](scripts/verify-orca-slotless-start.mjs) - the row and its `--self-test`
- [scripts/generate-licensing.mjs](scripts/generate-licensing.mjs) - export keyword on readNodePin, verifyArchive, fetchArchive
- [scripts/verify-orca-build-shape.mjs](scripts/verify-orca-build-shape.mjs) - export walk and NODE_NAMES; CLI behind an entry-point guard
- [scripts/verify-platform.sh](scripts/verify-platform.sh) - `orca-slotless-start-self-test` (quick, after orca-build-shape-self-test), `orca-slotless-start` (last full-tier entry)

## Decisions Made

- The marker is derived from the client's i18n template, not from spike 003's observed text, and the self-test derives it from a fixture whose templates say `fixture-runtime(s)`, so a green self-test proves derivation.
- The self-test reads the pinned Node version from node-runtime.json (a file read; still hermetic), so no version literal sits in code.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Entry-point guard in verify-orca-build-shape.mjs**
- **Found during:** Task 1
- **Issue:** the file ran its CLI and `process.exit` at module top level, so importing `walk` (the plan's "export keyword only") would have exited the probe.
- **Fix:** the CLI runs only when the file is the entry point (the same realpath comparison generate-licensing.mjs uses). `NODE_NAMES` exported next to `walk`. orca-build-shape and its self-test stay green.
- **Commit:** 7973a96a

**2. Self-test count:** the plan asks for at least nine `  ok` lines; there are eleven (control, seven plants, two leak cases, installed-Orca SKIP).

## Verification

- `node scripts/verify-orca-slotless-start.mjs` PASS with `1 Node runtime` and `paired`; `scripts/verify-platform.sh --only orca-slotless-start` PASS (live runs under `flock /home/chris/coding/Power-Browser/.git/pb-live.lock`, headless).
- `--only orca-slotless-start-self-test` PASS; `--self-test` prints SENTINEL-PAIRING-60 on exactly one line (the redaction-off case label); last line PASS.
- `--only licensing`, `licensing-self-test`, `orca-build-shape`, `orca-build-shape-self-test` PASS after the export edits.
- `grep -v '^\s*//' ... | grep -c '24\.19\.0\|1\.4\.248'` prints 0; the `0.0.0.0` / `'serve'` grep over orca-run.mjs prints 0.
- `node scripts/scan-brand-residue.mjs` PASS (687 files); `check-internals-boundary.sh` PASS.
- `scripts/verify-platform.sh --quick`: see Self-Check.

## Issues Encountered

None. The host runs Orca desktop 1.4.255 from the Nix store; its daemon is unrelated to the probe and none of the four installed-Orca paths orcad probes exist, so the row ran rather than SKIPped.

## Next Phase Readiness

- RUN-02 is proven on this host; the row is the permanent re-pin proof for Phase 68.
- 60-05 can reuse orca-run.mjs (orcadEnv, startOrcad, stopOrcad) for its orcad profile.

## Self-Check: PASSED

- FOUND: scripts/lib/orca-run.mjs, scripts/verify-orca-slotless-start.mjs
- FOUND commits: 7973a96a, 6956debf
- `scripts/verify-platform.sh --quick`: PASS
