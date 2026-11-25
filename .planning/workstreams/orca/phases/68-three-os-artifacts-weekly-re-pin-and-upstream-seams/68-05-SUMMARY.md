---
phase: 68-three-os-artifacts-weekly-re-pin-and-upstream-seams
plan: 05
subsystem: orca-overlay
status: complete
tags: [upstream, seams, OVL-06, export]
requires: ["68-03"]
provides: ["browser-provider upstream material and export", "orca-upstream-prs full row", "owner hand-off for the upstream issue and PR", "two Orca issue texts from 64-MIRROR-FREEZE.md"]
affects: [orca-overlay/upstream/, scripts/verify-platform.sh, .gitignore]
key-files:
  created:
    - orca-overlay/upstream/010-installed-electron-switch/upstream.json
    - orca-overlay/upstream/010-installed-electron-switch/src/main/orcad/orcad-browser-provider.installed-electron-switch.test.ts
  modified:
    - scripts/verify-platform.sh
    - .gitignore
decisions:
  - "Seam classes are final as merged: 010 browser-provider, 070 and 080 pb-only (68-07, P68-38); no seams.json edit"
  - "No web-entry seam exists (Phase 64 added none), so the web-entry class has nothing to export; orca-upstream-prs stays red naming web-entry until the owner rules on it"
  - "Upstream test run under vitest with node, because Orca's pnpm test needs bun 1.4.4, which the .#orca shell lacks"
metrics:
  completed: 2026-11-11
  tasks: 3
---

# Phase 68 Plan 05: Upstream seam export Summary

Seam 010 (`ORCA_DISABLE_INSTALLED_ELECTRON_BROWSER`) is prepared as one generic upstream issue and
PR with a new Orca-style test that passes against the pinned Orca with the seam and fails without
it. The `orca-upstream-prs` row is registered and red. The web-entry class has no seam on the merged
tree, so it cannot be exported. Run as lane p68-05 by the 68-06 coordinator itself, with no Orca
agent.

## Classification (seams.json on the merged tree, after Phase 67)

| Seam | Path | Class | Why |
|------|------|-------|-----|
| 010-installed-electron-switch | src/main/orcad/orcad-browser-provider.ts | browser-provider | The browser-provider seam D-16/D-27 names; Phase 66 added no seam of its own (P66-31), so S1 is the browser-provider seam |
| 070-claude-agent-sdk-dir | src/main/claude/claude-stream-json-connection.ts | pb-only | 68-07, P68-38: D-30's SDK directory switch serves PowerBrowser's packaging |
| 080-orcad-external-claude-agent-sdk | config/scripts/orcad-entry-build.mjs | pb-only | 68-07, P68-38: keeps the SDK out of orcad's bundle |

No row changed: the classes were already final after the 68-03 and 68-07 merges. Every `pr` is null.
web-entry: Phase 64 hosts Orca panes through overlay files only (64-01, 64-05: "No seam is added"),
so no row carries the class.

## Exports

| Class | Result | Output |
|-------|--------|--------|
| browser-provider | `export-orca-seam-pr: PASS -- 010-installed-electron-switch exported to .mozbuild/orca-upstream/browser-provider/ (seam.patch, issue.md, pr.md with 12 template headings, test-command.txt); nothing was opened upstream` | `.mozbuild/orca-upstream/browser-provider/` (untracked); seam.patch applies to Orca main 21c8fdc0 (2026-11-11) and carries the seam plus the new test |
| web-entry | refused (exit 2): `export-orca-seam-pr: no seam of class web-entry (classes present: browser-provider, pb-only)` | none |

- Issue title: "orcad: an environment switch that keeps the browser provider from launching an installed Orca desktop app".
- Test command (from orca/AGENTS.md): `pnpm test [path/to/file.test.ts] --maxWorkers=2`.
- `grep -rliE '\bPB\b|powerbrowser' orca-overlay/upstream .mozbuild/orca-upstream/browser-provider` prints nothing.

## Upstream test

`orca-overlay/upstream/010-installed-electron-switch/src/main/orcad/orcad-browser-provider.installed-electron-switch.test.ts`
is new at the pin (`git -C orca cat-file -e HEAD:<path>` fails) and on main (the exporter checks).

| Run | Result |
|-----|--------|
| Seamed orca/, with Orca's existing orcad-browser-provider.test.ts | `Test Files  2 passed (2)`, `Tests  17 passed (17)` (.mozbuild/p68-05/test-010d.log) |
| Control: the seam reverted in orca/, then restored from orca's index | `Tests  1 failed \| 2 passed (3)`; the failing test is "returns no installed Electron candidate when the switch is 1" |
| Afterwards | `build-orca: PASS -- built v1.4.248 (965978bc78…) in 98s`; `orca-build-shape: PASS -- … 3 modified tracked file(s), equal to the declared seams` |

## Rows

- orca-overlay: PASS (3 seams, 9 overlay files). orca-overlay-self-test: PASS (29 plants). orca-seam-export-self-test: PASS (6 plants).
- orca-upstream-prs: FAIL by design, `class browser-provider has no seams.json row with a non-null upstream pr` and `class web-entry has no seams.json row with a non-null upstream pr`.

## Brand counts this lane adds (inventory/brand-tokens.json not edited)

From `.mozbuild/p68-05/brand-report.md`: `orca-overlay/upstream/010-installed-electron-switch/upstream.json`
adds orca 6, Orca 4, ORCA 2; the test file adds orca 1, ORCA 2; `.gitignore` adds Orca 1, orca 1.
The 15 overlay-upstream occurrences are unclaimed (condition 4) until the coordinator widens the
rows' `only_in`. The integration branch was already 5 rows red before this lane, from the p68-08 merge.

## Orca issue texts (from 64-MIRROR-FREEZE.md)

Both were checked against Orca main 21c8fdc0 (2026-11-11), the shallow clone the exporter fetched.

### Issue A: host double projection. Do not file: fixed on Orca main

On main, `session-tabs-change-publication.ts` skips the second projection for a frame addressed to
one client. Its comment reads "A frame for one client is already its projection; projecting again
stacks the epoch suffix and revision, so the client fences it." The fix is not in v1.4.248. The
overlay wrapper `staleNavigationEchoes` in pb-pane-mount.tsx can be removed at the first re-pin
whose tag carries it. The release that carries it was not determined. The text is kept in case the
owner wants to confirm the fix with the maintainers:

```markdown
# Web client stops applying session-tab frames after it activates a tab (frame to the caller projected twice)

## Problem

When a paired web client activates one of its tabs (`session.tabs.activate` with a caller navigation id,
which every TerminalPane attach sends), the frame sent back to that client is projected twice. In
v1.4.248, `apply-mobile-session-tab-navigation.ts` passes `callerSnapshot` (already projected by
`ClientSessionTabSelectionStore.activate`) to `emitMobileSessionTabsSnapshotToClient`, whose `deliver`
in `session-tabs-change-publication.ts` projects every frame again for each listener. The client
receives epoch `<epoch>:client-navigation:client-navigation` at version v + 2r, while the host lists
`<epoch>:client-navigation` at v + r.

The client's publisher fences (`tracking.ts`, `publisher-identity-fences.ts`) take the doubled epoch as
a new publisher and retire the real one, then drop every later host frame at receipt. New terminals
created by the CLI or `terminal.create` never appear in the client's tab list.

## Repro (v1.4.248)

1. Pair the web client to headless orcad and mount a TerminalPane for an existing terminal.
2. Create another terminal with the CLI.
3. The host's `session.tabs.list` grows; the client's list does not, and its epoch history shows the
   real epoch retired by the doubled one.

## Proposed change

Emit the unprojected snapshot to the caller, or skip projection in `deliver` for a frame addressed to
one client.
```

### Issue B: the web client does not advertise the authoritative-inventory capability. File it

Still present on main: `WEB_RUNTIME_CLIENT_CAPABILITIES` (`src/shared/web-runtime-client-capabilities.ts`)
does not list `SESSION_TABS_AUTHORITATIVE_INVENTORY_RUNTIME_CAPABILITY`. The desktop's remote-runtime
list does (`src/shared/remote-runtime/remote-runtime-client-capabilities.ts`).

```markdown
# Web client cannot recover from a retired publication epoch: its census is never authoritative

## Problem

When the browser web client drops a frame because its publication epoch was retired, it schedules a
retired-epoch census through `session.tabs.listAll` (`global-session-events.ts`). The census revives
an epoch only when the reply carries `authoritative: true` (`retired-epoch-census.ts`). The host sets
that flag only for clients that advertise `SESSION_TABS_AUTHORITATIVE_INVENTORY_RUNTIME_CAPABILITY`
(`src/main/runtime/rpc/methods/session-tabs/session-tabs-inventory.ts`). The desktop's remote-runtime
client advertises it; `WEB_RUNTIME_CLIENT_CAPABILITIES` does not. A web client that retires the live
publisher by mistake (for example the double-projected caller frame fixed on main) therefore never
recovers: it keeps dropping host frames until it re-pairs.

## Proposed change

Add `SESSION_TABS_AUTHORITATIVE_INVENTORY_RUNTIME_CAPABILITY` to `WEB_RUNTIME_CLIENT_CAPABILITIES`, so
the web client's census can revive the publisher the way the desktop's does. This bounds an outage to
one census delay; it does not replace the host-side fix.

## Not checked

Whether headless orcad's PTY census (`isCompleteSessionTabsPtyCensus`) marks the inventory
authoritative once the capability is advertised.
```

## Owner hand-off (end-of-milestone pass)

1. browser-provider: open the issue on Orca's repository first, with
   `.mozbuild/orca-upstream/browser-provider/issue.md`. Then open the PR from a fork with
   `seam.patch` and `pr.md`, replacing its Linked Issue line with "Fixes #<issue number>". Record the
   PR URL in seam 010's `upstream.pr` in orca-overlay/seams.json. The fork and the GitHub org are
   the owner's choice; no org name is written here.
2. web-entry: no seam exists to offer. orca-upstream-prs stays red naming web-entry until the owner
   either rules the class out (as D-31 did for the terminal provider, which then needs the check's
   class list changed under that ruling) or a later phase adds a web-entry seam.
3. Orca issue B above: file it if wanted. Issue A is fixed on main and is not filed.
4. Regenerate the export before filing (`node scripts/export-orca-seam-pr.mjs --class browser-provider`),
   because Orca's main moves daily and the export is untracked.

orca-upstream-prs turns green when every D-27 class carries a URL.

## Merge note for the coordinator

Merge after the wave-1 lanes and p68-08. Add the `orca-upstream-prs` GATE_KNOWN_OPEN_EXCLUSIONS row
keyed to the upstream-PRs WINDOWS.md entry. Record the web-entry refusal as its own WINDOWS.md
entry. Re-measure the Orca-family brand rows: the 15 new orca-overlay/upstream occurrences need the
rows' `only_in` widened.

## Deviations from Plan

1. **[Rule 3 - Blocking] .gitignore.** The unanchored `upstream/` rule (the Gecko checkout) also
   ignored `orca-overlay/upstream/`, so the lane's material could not be staged. One negation line,
   `!orca-overlay/upstream/`, with a why-comment. .gitignore is outside files_modified, so Task 3's
   automated scope check names it.
2. **Orca's test command.** `pnpm test <file> --maxWorkers=2` runs `run-vitest.mjs`, which spawns
   `bun --bun vitest` (`spawn bun ENOENT`; Orca pins bun 1.4.4). bun is not in `nix develop .#orca`, and
   no package was installed. The same vitest config ran under node:
   `node node_modules/vitest/vitest.mjs run --config config/vitest.config.ts <files> --maxWorkers=2`.
   The PR's testing text names Orca's own command, which maintainers run with bun.
3. **No Orca agent.** The coordinator created the worktree without `--agent` and executed the plan itself.
   An earlier coordinator session created it and wrote the material and the export before a restart; this
   session reviewed that material, re-ran the tests and the export, and committed it.
4. **Plan wording.** "Three exports" in the plan predates D-31; with two D-27 classes and one seam,
   there is one export and one refusal.

## Commits

- ef8eba40 feat(68-05): browser-provider upstream material and export, orca-upstream-prs row
- 6e74c0c6 feat(68-05): upstream test for the browser-provider seam, run against the pinned Orca
- this SUMMARY: docs(68-05)

## Self-Check: PASSED

- Both tracked files under orca-overlay/upstream/ exist; ef8eba40 and 6e74c0c6 are on refs/heads/ServerDestroyer/p68-05.
- `grep -c '"orca-upstream-prs|' scripts/verify-platform.sh` = 1.
