---
phase: 67-hosting-hardening
plan: 05
subsystem: chrome actor pair (powerbrowser/shell), jar.mn, checks
status: complete
tags: [orca, INJ-01, landing-logo, actor, lane-p67-05]
requires: [lane p67-01 merged (OrcaService.getState().orcaVersion, the Orca hosting section), lanes p67-02..p67-04 merged (base cb2061ae)]
provides:
  - "OrcaEnv: ORCA_LANDING_SELECTORS ({ '1.4.248': ['div.size-20.rounded-2xl > img.size-12'] }), ORCA_LOGO_ALT, logoSelectorsFor, logoAnswerFor"
  - "OrcaService: diagnostics row 'Orca logo selectors' and one log line per start for a version with no entry"
  - "PowerBrowserAPI: registerOrcaLogoActor (called from registerGroupActor), PowerBrowserOrcaLogoParent"
  - "GroupActorChild: PowerBrowserOrcaLogoChild"
  - "jar.mn: brand/mark.svg packaged as chrome://powerbrowser/content/mark.svg"
  - "checks: orca-landing-selectors (+6-plant self-test, quick), orca-landing-logo-live (full, +14-case self-test)"
affects: [coordinator 67-06 (merge, faster build, live proof)]
tech-stack:
  added: []
  patterns: ["port gate in the parent (matches cannot carry a port)", "a jar.mn source outside TOPSRCDIR through the topsrcdir-relative /../ form"]
key-files:
  created:
    - scripts/verify-orca-landing-selectors.mjs
    - scripts/verify-orca-landing-logo-live.mjs
  modified:
    - powerbrowser/shell/OrcaEnv.sys.mjs
    - powerbrowser/shell/OrcaService.sys.mjs
    - powerbrowser/shell/PowerBrowserAPI.sys.mjs
    - powerbrowser/shell/GroupActorChild.sys.mjs
    - powerbrowser/shell/jar.mn
    - powerbrowser/INTERNAL-APIS.md
    - scripts/verify-platform.sh
decisions:
  - "jar.mn source form (/../brand/mark.svg): a leading '/' is relative to TOPSRCDIR (upstream/); mozbuild's SourcePath joins and normpaths it (python/mozbuild/mozbuild/frontend/context.py:928-934), so it resolves to <repo>/brand/mark.svg. The relative form ../../brand would resolve lexically through the upstream/powerbrowser symlink to upstream/brand, which does not exist"
  - "The parent gates first with a placeholder data URI and reads the mark (fetch of the chrome URL, encodeURIComponent data: URI, cached per process) only for an approved sender, so the Theia document and foreign loopback pages never cause a read"
  - "Route B' at the merge base: theia/extensions/orca-panes/src/browser/orca-pane-routes.ts has no Route B' target (hosted-pane, theia-editor, pb-web-tab, pending), so the orcad-origin documents are orcad's address in a PB web tab and in a stock window; no pane page is orcad-origin"
metrics:
  completed: 2026-11-11
actuals:
  tokens: 18000
  tasks: 3
  commits: 3
---

# Phase 67 Plan 05: PowerBrowser mark on Orca's landing tile (INJ-01) Summary

A PowerBrowserOrcaLogo actor pair, registered from registerGroupActor, answers only a top document on orcad's own
port that the shell's Theia browser does not embed, with the PowerBrowser mark (brand/mark.svg, packaged by one
jar.mn line), its alt text and the selector list for the running Orca version; the child sets src and alt on each
matched element for the document's life. A quick row ties the selector list to the built Landing chunk and a full
row proves the swap live with a proxy control.

## Lane

- Worktree /home/chris/orca/workspaces/Power-Browser/p67-05, branch ServerDestroyer/p67-05, created by the 67-06
  coordinator without an Orca agent at 2026-11-11T17:24:06Z from cb2061ae (after the p67-01..p67-04 merges) and
  executed by the coordinator session.
- Setup: generate.mjs (72 files). upstream/, orca/ (built by the coordinator) and theia/node_modules were reached
  through untracked symlinks to the coordinating workspace instead of a second fetch and build (Deviation 1).

## Orcad-origin documents (P67-22)

Route B' result: none. The merged route table (`ORCA_PANE_ROUTES`) has the targets hosted-pane, theia-editor,
pb-web-tab and pending only. The documents the actor can serve are therefore orcad's address opened in a PB web tab
and orcad's address opened in a stock window. Under Route A the Theia document never mounts Landing and is refused
by the parent (embedded by the shell's content browser, and not on orcad's port).

## Tasks and commits

| Task | Commit | What |
|---|---|---|
| 1 | 31c8e6e2 | OrcaEnv gate and selectors, OrcaService row and log line, actor registration and parent, child, jar.mn line, five catalogue rows |
| 2 | 835eca27 | orca-landing-selectors (+6 plants), quick registry block |
| 3 | (this commit) | orca-landing-logo-live (+14-case self-test), quick and full registry rows, this SUMMARY |

## Check results (lane tree)

Green: internals-boundary, internals-catalogue, ng-040-internals-catalogue-lines, orca-service and its self-test,
orca-failure-classes, orca-credential-store, shell-error-contract, branding-preflight and its self-test,
gui04-registry-shape, orca-landing-selectors ("Orca 1.4.248's landing logo selector matches Landing-znBnkpKr.js"),
orca-landing-selectors-self-test (6 plants), orca-landing-logo-live-self-test (14 cases). orca-landing-logo-live
prints its SKIP in the lane: "no built PowerBrowser (.../p67-05/objdir/dist/bin/powerbrowser missing)".
The Task 1 gate one-liner exits 0. The lane diff against the merge base lists only files_modified paths.

## Deviations from Plan

1. **[Rule 3] Setup by symlink, not a second fetch and build.** upstream/, orca/ and theia/node_modules in the lane are
   untracked symlinks into the coordinating workspace (same base commit, orca/ built there minutes earlier); removed
   before the merge.
2. **[Rule 2] Catalogue: five rows, not three.** The three P67-26 rows (registerWindowActor, the JSWindowActorChild
   class, the widened DOM write as its own `setAttribute` row) plus the two lazy `ChromeUtils.importESModule` lines
   of the parent, which --catalogue reports. Every reference shifted by the inserted lines was remapped through the
   exact line diff, not ng-040 --fix.
3. **The call line sits after registerEditStateActor() and before registerAgentActor()** (Phase 66 added the agent
   pair after the plan was written); still inside registerGroupActor.
4. **The parent reads the mark with fetch()** of its chrome URL, available in system modules; no new forbidden pattern.
5. **Remount driver.** The worktree is created with `--activate` through Orca's CLI; if Landing does not unmount, the
   row clicks the worktree's entry in the page's sidebar, then removes the worktree with `worktree rm`. Which of the
   two activates it is first observed on the coordinator's run.

## Known limits

- The live row has not run in the lane (no objdir). Its harness lines (form pairing in a proxied page, stock-window
  pairing, the remount) are first exercised by the coordinator.
- Visibility of the mark on Orca's dark landing tile is a Deferred Verification item for the owner pass.

## Coordinator proof commands

```sh
nix develop .#firefox --command bash -c 'cd upstream && MOZCONFIG=../.mozconfig ./mach build faster'
# a jar.mn line changed, so faster; the live rows set MOZ_PURGE_CACHES=1 for the first launch
find objdir/dist/bin -path '*powerbrowser*' -name mark.svg
flock /home/chris/coding/Power-Browser/.git/pb-live.lock scripts/verify-platform.sh --only orca-landing-logo-live
```

## Merge note for the coordinator

- Registry: the `# NEW (67-05, INJ-01, ...)` quick block (orca-landing-selectors, its self-test,
  orca-landing-logo-live-self-test) is the last Phase 67 block above `"allowlist-schema|check_allowlist_schema"`, and
  the full block (orca-landing-logo-live) is the last entry before the full-tier array's `)`, after 67-04's.
- Phase 68 wave-1 lines in OrcaEnv.sys.mjs, OrcaService.sys.mjs and INTERNAL-APIS.md are unchanged; this lane's code
  sits beside them (merge rule (8)).
- INTERNAL-APIS.md: every PowerBrowserAPI.sys.mjs reference at or after the inserted call line moved by one, and the
  five new rows follow p67-01's at the end of the Touchpoints table.
- No WINDOWS.md ids opened or closed.

## Brand rows

`node scripts/scan-brand-residue.mjs --report .mozbuild/p67-05/brand-report.md` with the lane files staged (exit 1,
1289 reconciliation failures on the whole merged tree, the earlier lanes' included). Held-back rows observed: Orca
2546 (expected 2322), orca 4909 (4752), ORCA 991 (946), orcad 1397 (1330), ORCAD 200 (192), Orcad 104 (102).
Condition-4 occurrences in this lane's files (whole-file counts, earlier lanes' lines in shared files included):
scripts/verify-orca-landing-logo-live.mjs 87, scripts/verify-orca-landing-selectors.mjs 56,
powerbrowser/shell/GroupActorChild.sys.mjs 4. The coordinator re-measures every row on the final tree.

## Known Stubs

None.

## Threat Flags

None beyond the plan's register: the child has no import and no privileged global (T-67-24), the parent's port and
embedder gate is the wall (T-67-23), and the offer enters only the page's form field (T-67-26).

## Self-Check: PASSED

- FOUND: scripts/verify-orca-landing-selectors.mjs, scripts/verify-orca-landing-logo-live.mjs
- FOUND commits 31c8e6e2, 835eca27 (ancestors of HEAD); Task 3 is the commit adding this file
- `grep -c 'registerOrcaLogoActor()' powerbrowser/shell/PowerBrowserAPI.sys.mjs` >= 2; `grep -c mark.svg powerbrowser/shell/jar.mn` = 1; no .svg added
