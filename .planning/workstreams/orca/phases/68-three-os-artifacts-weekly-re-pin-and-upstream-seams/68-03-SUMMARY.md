---
phase: 68-three-os-artifacts-weekly-re-pin-and-upstream-seams
plan: 03
subsystem: orca-overlay
tags: [orca, mobile-protocol, evaluateCompat, seams, upstream-pr, verify-platform]
status: complete
requires:
  - phase: 62
    provides: "orca-overlay/seams.json, verify-orca-overlay.mjs, seam 010 (S1)"
  - phase: 63
    provides: "lane base after D-31: seams.json holds row 010 only"
provides:
  - "orca-mobile-protocol (quick) and its self-test: overlay outside orcad's mobile-facing protocol files (OVL-03, D-23)"
  - "orca-mobile-skew (full) and its network-free self-test: pin lag and Orca's own evaluateCompat verdict (D-29)"
  - "seams.json upstream key { class, pr }; overlay gate rules, orca-overlay/upstream/<seam-id>/ admission, --upstream-prs"
  - "scripts/export-orca-seam-pr.mjs <seam-id> | --class CLASS and orca-seam-export-self-test (OVL-06 tooling)"
affects: [68-02, 68-05, 68-06]
actuals:
  tokens: 18533
  tasks: 3
  commits: 3
plan_head_before: 21ee66dc19e2199d132ee1876be336c26d9bde30
plan_head_after: bf1846080b773a146803201e6dd8aa09f51d5daf
tech-stack:
  added: []
  patterns:
    - "Orca's own TS imported by Node type stripping through a registerHooks resolve hook that applies the closure's resolution rule"
    - "accepting verdict kind derived from evaluateCompat itself, never hard-coded"
key-files:
  created:
    - scripts/verify-orca-mobile-protocol.mjs
    - scripts/export-orca-seam-pr.mjs
  modified:
    - orca-overlay/seams.json
    - scripts/verify-orca-overlay.mjs
    - scripts/verify-platform.sh
key-decisions:
  - "Import extraction is the regex: TypeScript 7.0.2's JS entry (exports '.' = lib/version.cjs) has no preProcessFile; the regex reproduces research's 1779 files with 0 unresolved"
  - "--upstream-prs requires browser-provider and web-entry only (D-31); the plan's Task 3 text that still names terminal-provider was not followed"
  - "orca-mobile-skew imports the pin's protocol-version.ts through a module resolve hook, because Orca's relative imports are extensionless and Node ESM refuses them"
requirements-completed: [OVL-03, OVL-06]
duration: 20min
completed: 2026-11-10
---

# Phase 68 Plan 03: Orca mobile protocol checks and seam classes Summary

The overlay is proven outside a 1779-file protected set derived from the stock Android app's
own imports. The pin is measured against the newest stock app with Orca's own `evaluateCompat`
(verdict ok, 2026-11-10). Each seam row now records its upstream class and PR, and a seam can
be exported offline as a generic upstream patch, issue body and PR body.

## Commits

| Task | Commit | Message |
|------|--------|---------|
| 1 | f74f4805 | feat(68-03): orca-mobile-protocol, the derived protected set and its self-test |
| 2 | a0b943ae | feat(68-03): orca-mobile-skew with Orca's evaluateCompat and a network-free self-test |
| 3 | bf184608 | feat(68-03): seam upstream key, upstream-prs mode, seam PR exporter |

The lane diff against the integration base is exactly the five code paths in files_modified,
plus this SUMMARY.

## Protected set (orca-mobile-protocol)

`orca-mobile-protocol: PASS -- 1779 protected files (1759 from orca/mobile/src, 20 runtime-rpc and ipc/mobile.ts), 1 seam(s) and 0 overlay file(s) outside it, 0 unresolved specifier(s) [regex (TypeScript 7.0.2's JS entry has no preProcessFile)]`

- Root 1: 2126 non-test .ts/.tsx files under orca/mobile/src, followed transitively. 1759 files under orca/src join the set.
- Root 2: the 19 non-test files of src/main/runtime/runtime-rpc/ plus src/main/ipc/mobile.ts, not expanded.
- Extraction: the regex. TypeScript 7.0.2 at the pin has no JS compiler API. The script header states the regex's limit: specifier-shaped text in comments is followed (over-protects), and specifiers built at run time are not seen.
- S1 `src/main/orcad/orcad-browser-provider.ts` lies outside the set. No BLOCKER.
- With orca/ moved aside, the row prints `orca-mobile-protocol: SKIP -- orca/ is not fetched ...` and exits 0. `--nope` exits 2 with a Next step line.
- Self-test: 5 controls (one checks that far.ts, reached only from root 2, stays outside the set) and 4 plants: a seam on protocol-version.ts, an overlay file at protocol-compat.ts, a seam on a runtime-rpc file, an empty mobile/src ("source moved").

## Skew (orca-mobile-skew), 2026-11-10

`orca-mobile-skew: PASS -- pin v1.4.248 is 8 tag(s) behind v1.4.256; stock Android app 0.0.64 (mobile-android-v0.0.64; pin's app 0.0.62, difference 0.0.2); app protocol 3 needs desktop >= 2, pin protocol 3 needs mobile >= 2; verdict ok`

- `evaluateCompat` is imported from orca/src/shared/protocol-compat.ts and never copied (`grep -c 'function evaluateCompat'` prints 0).
- The accepting kind is derived by calling evaluateCompat on equal versions with no floor.
- Self-test: 1 control and 4 plants: blocked (desktop-too-old), blocked (mobile-too-old), a listing with no mobile-android tag, and a moved constants file. No network is used. Without orca/ the self-test prints a SKIP line.

## seams.json shape

| seam id | path | upstream.class | upstream.pr |
|---------|------|----------------|-------------|
| 010-installed-electron-switch | src/main/orcad/orcad-browser-provider.ts | browser-provider (provisional, P68-36; 68-05 confirms) | null |

- Row keys are sorted: patch, path, reason, upstream, upstream_blob. Classes are browser-provider, web-entry and pb-only; there is no terminal-provider (D-31).
- `pr` must be null or `https://github.com/<owner>/<repo>/pull/<n>`. Owner and repo are parsed from fetch-orca.sh's REMOTE line; a missing line is red.
- The gate admits orca-overlay/upstream/<seam-id>/ only for a known seam id. upstream.json there must hold exactly the non-empty string keys title, problem, change and testing.
- The self-test has 29 plants (7 of them new) plus the --upstream-prs control.
- `node scripts/verify-orca-overlay.mjs --upstream-prs` exits 1 and names browser-provider and web-entry. It never names terminal-provider.
- The other seams.json readers, orca-build-shape and orca-hidden-electron-self-test, stay green with the new key.

## Exporter

- `node scripts/export-orca-seam-pr.mjs 010-installed-electron-switch` gives the expected refusal (exit 1): `no upstream description for 010-installed-electron-switch; 68-05 writes orca-overlay/upstream/010-installed-electron-switch/upstream.json`. This is the wave-2 hand-off. It runs before any fetch, so the run was offline.
- Outputs go to .mozbuild/orca-upstream/<seam-id or CLASS>/: seam.patch, issue.md, pr.md (the template's `## ` headings, 12 at the pin, derived at run time) and test-command.txt (the **Test** line of orca/AGENTS.md).
- Self-test, with a file:// fixture main and no network:
  - Controls: the 010-a export writes all four files. The pb-overlay control replaces the overlay file's one constant literal, keeps every other line byte-equal, keeps ORCA_EXAMPLE_SWITCH and leaves no pb-overlay: in the patch. A --class export puts both fixture seams in one patch. An unknown id exits as a usage error.
  - Plants: a template heading missing from the body, a PowerBrowser token in the patch, a pre-image missing from main, two pb-overlay constant lines, a pb-overlay token in a comment, and an upstream test that would replace a file main already has.
- The token refusal scans added lines and header lines of seam.patch, and all of issue.md and pr.md. Context lines and removed lines are Orca's own text and are not scanned. PB is matched when it is not adjacent to a letter, so `ORCA_PB_X` is refused.
- `grep -c stablyai` prints 0 for all three scripts. `git ls-files .mozbuild` prints nothing.

## Quick-run comparison

- Baseline (Setup step 3, .mozbuild/p68-03/baseline.txt): 114 red rows. After the lane: the same 114 rows, with no new red. Most of them need a fetched upstream/ Gecko tree or a built PowerBrowser.
- scan-brand-residue was already red at baseline (orca 1295 against 1287, orcad 784 against 783). After the lane it adds the expected entries listed below.
- The six new rows and orca-overlay/-self-test pass inside --quick.

## Brand rows for the coordinator (inventory/brand-tokens.json not edited)

From `node scripts/scan-brand-residue.mjs --report .mozbuild/p68-03/brand-report.md` after staging:

- held-back "Orca" (title/coincidental): expected 637, observed 643 (+6 from this lane's modified tracked files)
- held-back "orca" (lower/coincidental): expected 1287, observed 1315 (baseline already 1295, so +20 from this lane)
- held-back "orcad" (lower/coincidental): expected 783, observed 784 (unchanged from baseline)
- condition 4, new files with no inventory row: scripts/verify-orca-mobile-protocol.mjs (106 occurrences), scripts/export-orca-seam-pr.mjs (38 occurrences)
- Raw case-sensitive counts, base then lane:
  - verify-orca-overlay.mjs: Orca 2 to 6, orca 78 to 89
  - verify-platform.sh: Orca 22 to 24, orca 121 to 139
  - seams.json: unchanged

## Deviations from Plan

1. **[Rule 1 - plan text] --upstream-prs omits terminal-provider.** Task 3 (2) still names terminal-provider. D-31, P68-40, the must_haves and the acceptance criteria require browser-provider and web-entry only, so the D-31 form was implemented.
2. **[Rule 3 - blocking] A resolve hook for importing Orca's TS.** Node ESM refuses the pin's src/shared/protocol-version.ts because its relative imports have no extension. orca-mobile-skew registers a `registerHooks` resolve hook that applies the closure's own resolution rule, and it filters Node's MODULE_TYPELESS_PACKAGE_JSON notice. protocol-compat.ts imports without the hook.
3. **[Process] The SUMMARY is a separate docs commit.** Task 3's code was committed as bf184608 and this SUMMARY follows in its own commit, so that `plan_head_after` and `commits` are measured values.
4. **[Process] Baseline timing.** The Setup baseline quick run started after Task 1's two rows were written (they passed). Those rows are not in the red set, so the comparison holds.
5. **[Rule 2] Two plants beyond the plan.** The exporter self-test adds "upstream test would replace" as a plant. The overlay self-test adds an upstream.json with a missing key as a plant.

## Merge note for the coordinator

Merge first. Phase 64 or 66 rows added to seams.json after this lane's launch need the upstream key (class by D-27 category, pr null; no terminal-provider class after D-31). The orca-upstream-prs row is registered by 68-05. The exporter replaces the one pb-overlay: constant line of any overlay file a seam imports (P63-29).

- Registry blocks sit directly after the quick anchor (`orca-service-live-self-test`) and the full anchor (`orca-service-live`), as the 03-first merge order requires.
- verify-orca-overlay.mjs now imports `readRemote` from verify-orca-mobile-protocol.mjs.

## Deferred (owner, end-of-milestone pass)

- Pair the stock Android app with PowerBrowser's orcad and record the result beside the orca-mobile-skew line above (P68-17).
- Open the issue and PR for each D-27 seam, then record each URL in seams.json (P68-18, P68-19).

## Self-Check: PASSED

- FOUND: scripts/verify-orca-mobile-protocol.mjs, scripts/export-orca-seam-pr.mjs, orca-overlay/seams.json
- FOUND: f74f4805, a0b943ae, bf184608 (ancestors of HEAD)
