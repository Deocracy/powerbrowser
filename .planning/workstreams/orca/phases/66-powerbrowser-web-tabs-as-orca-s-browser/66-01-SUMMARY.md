---
phase: 66-powerbrowser-web-tabs-as-orca-s-browser
plan: 01
subsystem: orca-overlay / browser host
tags: [orca, browser-host, overlay, vite, brw-03, brw-02, lane]
status: complete
requires:
  - Phase 64 pane bundle (vite.pb-panes.config.ts outDir, build-orca-panes.sh, the /orca-panes/ backend route)
  - Phase 65 pane entry (C3-65: MOUNT_KINDS, session-only pairing)
provides:
  - pb-browser-host.js (exports PB_BROWSER_HOST_API = 1 and attachBrowserHost) in orca/out/web/assets/pb-panes/
  - globalThis[Symbol.for('powerbrowser.orca-browser.link')] = { connection, setPlacement } in the pane bundle
  - rows orca-browser-host-bundle (full) and orca-browser-host-bundle-self-test (quick)
affects: [66-02 (loads the host and reads the link), 66-05 (live device clause), 66-06 (merge, brand rows)]
tech-stack:
  added: []
  patterns:
    - library build of a PB overlay entry with Orca's own Vite, written beside the pane bundle without emptying it
    - pb-overlay markers collected from compiled module sources into a banner (minify off)
key-files:
  created:
    - orca-overlay/files/src/renderer/src/pb/browser-host/pb-browser-host.ts
    - orca-overlay/files/src/renderer/src/pb/browser-host/pb-browser-host-link.ts
    - orca-overlay/files/vite.pb-browser-host.config.ts
    - scripts/build-orca-browser-host.sh
    - scripts/verify-orca-browser-host-bundle.mjs
  modified:
    - orca-overlay/files/src/renderer/src/pb/pb-pane-mount.tsx
    - scripts/build-orca.sh
    - scripts/verify-platform.sh
    - docs/BUILD.md
decisions:
  - "Thin host chooses its handshake with keyed ? v2 (transport direct) : legacy; a token never travels over v2 (A9)"
  - "Orca's Vite plugins are left out of the host build: the pdf.js asset copy would write into the served pb-panes/ directory"
  - "The link awaits one window.api.runtimeEnvironments.getStatus({ selector: 'active' }) as its readiness point (the entry exposes none)"
  - "The link object carries a third frozen property, build, holding its pb-overlay marker so the literal survives the pane bundle's minifier"
metrics:
  duration: ~50 min
  completed: 2026-11-11
estimate:
  tokens: 160000
  tasks: 3
actuals:
  tokens: 17800
  tasks: 3
  commits: 3
plan_head_before: 5a13ababec05b58beefbc7acff5c4463288cb859
plan_head_after: d3d152eb010871dc5614c03c23754e686ce22a5b
---

# Phase 66 Plan 01: Orca-side browser host and pane-bundle link Summary

The lane adds a PB-owned thin browser host, built by Orca's Vite from overlay files into the pane bundle's served
directory. It never goes through WebRuntimeClient: one socket carries status.get, browser.clientHost.attach,
commandResult, pageMetadata and browser.tabClose, and a token uses legacy framing with the host capabilities. The lane
also adds a pane-bundle link that exposes the pane client's own credential and a client-placement override. Under the
live lock, a scratch orcad and the Orca CLI prove the host end to end from Node. No seam is added.

`commits: 3` counts the commit that carries this file. `plan_head_after` is the Task 2 commit, because a file cannot
name the commit that contains it. `actuals.tokens` is chars/4 over the lane diff (71,023 chars).

## Commits

| Task | Commit | Files |
|------|--------|-------|
| 1 Tracer: thin host built and attached end to end | 6c8f4c35 | pb-browser-host.ts, vite.pb-browser-host.config.ts, build-orca-browser-host.sh, build-orca.sh, verify-orca-browser-host-bundle.mjs, verify-platform.sh |
| 2 Link, device-key path, static clauses, self-test | d3d152eb | pb-browser-host-link.ts, pb-pane-mount.tsx (+1 line), verify-orca-browser-host-bundle.mjs, verify-platform.sh |
| 3 BUILD.md notes and this SUMMARY | (this commit) | docs/BUILD.md, 66-01-SUMMARY.md |

## Values read in Setup

- Pane entry: orca-overlay/files/src/renderer/src/pb/pb-pane-mount.tsx. This is the merged name, so no path
  substitution was needed. MOUNT_KINDS (C3-65) is present.
- Pane output directory: `out/web/assets/pb-panes`. Read from the `outDir: resolve(process.env.PB_PANES_OUT || '...')`
  line of the merged orca-overlay/files/vite.pb-panes.config.ts. build-orca-browser-host.sh and the check both derive it
  from that line.
- Route prefix: `/orca-panes/` (ORCA_PANES_ROUTE_PREFIX in theia/extensions/orca-panes/src/common/orca-panes-protocol.ts,
  served by orca-panes-backend-module.ts from the directory the bridge file `orca-panes-dir` names). The host is
  served at `/orca-panes/pb-browser-host.js`.
- Tracked Orca baseline (.mozbuild/p66-01/tracked-before.txt) lists the 3 declared seam paths. It was unchanged after
  every build in this lane.

## Measurements

- pb-browser-host.js: 307,953 bytes, minify off. The module list has 124 entries; 18 are Orca source modules
  (src/shared/* pairing and protocol, src/renderer/src/web/web-e2ee.ts, web-paired-e2ee-primitives.ts,
  lib/base64-bytes.ts) and the rest are zod and tweetnacl. The list contains no web-runtime-client.ts.
- Attach probe: `createPage` arrived 141–151 ms after the CLI call started. The probe had 0 redaction matches.
- The bundle reads `window` (btoa in Orca's web E2EE) and `self` (tweetnacl's PRNG via `self.crypto`). The Node
  probe sets `globalThis.window` and `globalThis.self` to `globalThis`.
- Readiness point the link awaits: one `window.api.runtimeEnvironments.getStatus({ selector: 'active' })` through the
  pane client. It polls every 250 ms for window.api and a stored environment, and retries every 1 s on a failed
  status. The merged entry exposes no readiness promise: bootstrap's `booting` is module-local.

## Check results

- `build-orca.sh` (full) and `build-orca.sh --panes-only`: the log carries `build-orca: overlay copied
  src/renderer/src/pb/browser-host/pb-browser-host.ts`, `build-orca-browser-host: PASS`, and `build-orca: PASS`.
  `pb-panes/pb-browser-host.js` exists after both paths, and the tracked set equals the baseline.
- `orca-browser-host-bundle` (full, under `flock /home/chris/coding/Power-Browser/.git/pb-live.lock`, ORCA_* unset): PASS.
  The output was "attach accepted, createPage in 151 ms, user close reported, 307953 bytes; static clauses green over
  124 modules and 1157 Orca assets (redaction 0 matches)".
- `orca-browser-host-bundle-self-test` (quick): PASS. 12 planted faults (9 static, 3 attach verdict) each went red
  naming the drift, and the control stayed green.
- `orca-overlay`: PASS with 3 seams, the same count as the base, so no seam was added (P66-31). The overlay has 9 files.
- `orca-overlay-self-test`: PASS. `orca-overlay-built`: PASS. The link's marker is in
  pb-panes/assets/pb-pane-mount-*.js, so the entry imports it.
- `orca-pane-entry`: PASS. Its import, export and React clauses SKIP because Theia is not installed in this lane.
- The pane entry's diff against the base is +1/-0 lines.
- `git ls-files -- orca` prints nothing.

## Coordinator proof commands

After the merge, on the merged tree:

```
nix develop .#orca --command bash scripts/build-orca.sh
scripts/verify-platform.sh --only orca-overlay-built
flock /home/chris/coding/Power-Browser/.git/pb-live.lock scripts/verify-platform.sh --only orca-browser-host-bundle
```

The full row also needs Orca's CLI (orca/out/cli/index.js), which build-orca.sh does not build. Without the CLI the
row prints a named SKIP. Build the CLI as docs/BUILD.md "Browser host bundle (pb-browser-host.js)" records.

## Merge note for the coordinator

- scripts/verify-platform.sh: the `# NEW (66-01, ...)` blocks come first at both anchors. The quick block sits
  immediately before `"allowlist-schema|check_allowlist_schema"`. The full block sits after the
  orca-relaunch-restore-live row, before the `)` that closes the full CHECKS list.
- scripts/build-orca.sh: the new step 10 (`run_step browser-host`) follows the pane step on both paths. If it
  conflicts with Phase 68's portability edits, resolve it function by function (64-05 merge rule (6), 68-06 merge rule
  (2d)).
- Brand rows are the coordinator's to measure (P62-11). The lane did not edit inventory/brand-tokens.json.
  `node scripts/scan-brand-residue.mjs --report .mozbuild/p66-01/brand-report.md` reports 166 reconciliation failures,
  all Orca-family. The unclaimed occurrences (condition 4) per lane file are:

  | File | orca | Orca | ORCA |
  |------|------|------|------|
  | orca-overlay/files/src/renderer/src/pb/browser-host/pb-browser-host.ts | 6 | 4 | 0 |
  | orca-overlay/files/src/renderer/src/pb/browser-host/pb-browser-host-link.ts | 5 | 2 | 0 |
  | orca-overlay/files/vite.pb-browser-host.config.ts | 4 | 2 | 0 |
  | scripts/build-orca-browser-host.sh | 34 | 6 | 8 |
  | scripts/verify-orca-browser-host-bundle.mjs | 58 | 20 | 13 |

  Held-back row drift in files already covered by those rows (build-orca.sh, verify-platform.sh, docs/BUILD.md,
  pb-pane-mount.tsx):

  | Row | Expected | Observed | Change |
  |-----|----------|----------|--------|
  | "Orca" | 2108 | 2118 | +10 |
  | "orca" | 4199 | 4223 | +24 |
  | "ORCA" | 846 | 849 | +3 |
  | "orcad" | 1218 | 1224 | +6 |

  Until the coordinator re-measures, the `--quick` brand gate is red on this lane.
- Credential path for the live device clause (A3 b, 66-05 orca-browser-agent-live): expect device-key. Phase 65
  presets device-key support to `session-no-ed25519`. webRuntimeCredentialFor therefore builds a keyed source with
  session storage, and the pane client's primary socket migrates to an ephemeral session key (sessionPlan → migrate)
  whenever orcad advertises the ephemeral device-key capability. If it does, `connection()` returns
  `{ kind: 'device-key' }` and the host takes the v2 branch. That branch is built and checked statically (framing
  verdict and self-test plant), but this lane did not run it live: the Node probe can only hold the offer's token. If
  orcad refuses the migration, `connection()` returns the token, which is the path proven here.
- No WINDOWS.md ids were written by this lane.

## Deviations from Plan

1. [Rule 3 - Blocking] The device-key branch of pb-browser-host.ts landed in Task 1's commit, not Task 2's: both
   credential branches were written together. Task 2 added the static framing verdict that checks it.
2. [Rule 1 - Bug] vite.pb-browser-host.config.ts drops Orca's plugins (React, Tailwind, pdf.js assets, cache
   retention). It keeps only Orca's aliases and defines. The pdf.js plugin copies cmaps, fonts and wasm into the
   output directory, which here is the served pb-panes/. The plan's analog (vite.p66.config.ts) kept them.
3. [Rule 3 - Blocking] The Node probe sets `globalThis.self` as well as `globalThis.window`. Without `self`,
   tweetnacl finds no PRNG.
4. [Rule 2 - Missing] Both overlay files carry their markers into the built output: the host through the config
   plugin's banner, which collects pb-overlay markers from the compiled module sources, and the link through a frozen
   `build` property on the link object. The pane bundle's minifier drops unused literals, and the entry's
   `PB_OVERLAY_BUILD` list could not change, since the pane entry gets exactly one added line. 66-02 reads only
   `connection` and `setPlacement`.
5. [Rule 1 - Bug] `commandResult(event, { status: 'completed', result })` sends `result` as Orca's wire field `value`
   (BrowserClientAutomationResult). An outcome that already uses `value` passes through unchanged.
6. The self-test plants more faults than the plan's 8. It adds "pane entry without the link import" and three
   attach-verdict plants, for 12 in total.
7. Process: one sanity re-run of the attach probe (`node scripts/verify-orca-browser-host-bundle.mjs`, ORCA_* unset)
   ran outside the live lock right after a locked PASS. Every result recorded above came from a locked run.

## Owner items (end-of-milestone pass, D-18)

- The device-key (v2) host path is unproven live. Above, it is the expected path in the Theia document. 66-05's live
  device clause decides. If it fails there, the fallback is the D-27 upstream exports (66-CONTEXT Deferred Ideas). No
  BLOCKER was found: the host attaches and the credential is read with no private Orca member.
- T-66-01 (accepted in the plan): the link exposes the pane client's signer to any script in the Theia document. That
  document already has the same reach through window.api.

## Known Stubs

None. The link's readiness poll is a shortcut (marked in code) because the entry exposes no readiness signal.

## Threat Flags

None beyond the plan's threat model. The host opens no listener; it is a client of orcad's existing loopback port.

## Self-Check: PASSED

- All five created files and four modified files are present in the lane diff.
- Commits 6c8f4c35 and d3d152eb are ancestors of HEAD.
- The lane diff is within files_modified.
