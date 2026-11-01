---
phase: 55-macos-i
plan: 04
subsystem: infra
tags: [macos, matrix-record, download-copy, pkg-16, sec-04, gatekeeper, owner-checkpoint]

requires:
  - phase: 55-macos-i (plan 55-03)
    provides: the payload gate (deriveTargets export), package-macos.sh universal, the macOS update-copy checks
provides:
  - 55-MACOS-MATRIX.md, the draft matrix record the owner session completes
  - scripts/verify-macos-install-matrix.mjs, the macos-install-matrix row and its quick self-test twin
  - scripts/verify-macos-download-copy.mjs, the macos-download-copy row and its quick self-test twin
affects: [55-04 Task 2 (owner session), 55-04 Task 3 (record the results, fill the docs), the macOS release gate]

actuals:
  tokens: 14500
  tasks: 1
  commits: 1
plan_head_before: 103074d263b6beb78034259e39b120fb477b1130
plan_head_after: 83ea480f48e7596e078f4efc8dbeb5e52205bd11

key-files:
  created:
    - .planning/workstreams/deploy/phases/55-macos-i/55-MACOS-MATRIX.md
    - scripts/verify-macos-install-matrix.mjs
    - scripts/verify-macos-download-copy.mjs
  modified:
    - scripts/verify-platform.sh

key-decisions:
  - "The expected matrix cells are the column headers of the macOS row of the per-OS install matrix in docs/BUILD.md, so the gate has no kept list of cells. The record carries those five cells once per environment (hosted draft-DMG matrix, real-Mac session)."
  - "UNVERIFIED is never a pass and never a structure error. Structure problems are failures; each UNVERIFIED value is reported by name as unobserved. The full row is therefore red on the draft, and the --self-test requires the draft to be structurally clean with its unobserved items counted."
  - "The download-copy gate compares the claims the page makes with the claims the record observed, as set equality. An UNVERIFIED record value maps to the conservative claim (ad-hoc signed, not notarized, size pending, no Gatekeeper sentence). So the gate is green on the draft and goes red the moment the page gets ahead of the record or falls behind it."
  - "The Gatekeeper path is compared by containment (the record's verbatim text must appear in a page sentence). A page sentence about Gatekeeper with no observed path behind it is red."
  - "download.html was not edited. The page already states the conservative posture, and the plan does not list it as a modified file. The observed copy (Developer ID, notarization, staple, the Gatekeeper path, the macOS size) is a Task 3 edit, and the gate tells the owner exactly which claim is unstated."

requirements-completed: []

duration: about 1h
completed: 2026-10-31
status: partial
---

# Phase 55 Plan 04: macOS matrix record and download-copy gates Summary

**Task 1 is done: both record gates exist with registry rows and self-tests, the draft record marks everything unobserved as UNVERIFIED, and the quick tier is green apart from the six known worktree reds. Task 2 (the owner session) was not executed. Task 3 (recording the owner results) was not executed because it needs Task 2.**

## Tasks

| Task | Status | Commit |
|---|---|---|
| 1. Local proof of the matrix-record gate and the download-copy gate with registry rows | done | `83ea480f` |
| 2. Owner credentials, hosted build, sign, notarize, matrix runs, real-Mac session, release-gate flip | not executed (owner action, `checkpoint:human-action`, `gate="blocking-human"`) | none |
| 3. Record the owner results, fill the deferred halves, run the live rows green | not executed (depends on Task 2) | none |

## What Task 1 built

- `55-MACOS-MATRIX.md`: the draft record. Five cells for each of two environments, one verdict line each, every value UNVERIFIED. It also holds the build identity (two SHA256 values, MAR size, locale scope, hosted run), the signing status, the observed BUILD_TARGET lines, the per-user paths and the Gatekeeper block.
- `scripts/verify-macos-install-matrix.mjs` (row `macos-install-matrix`), derived at check time:
  - cells from the BUILD.md macOS row, as set equality in both directions;
  - exactly one well-formed verdict line per cell, a cause on every RED, evidence on every GREEN, and a hosted GREEN only when a hosted run is recorded;
  - the observed Darwin BUILD_TARGET set equal to the emitted descriptor set, which is derived from the per-target mozconfigs through the payload gate's exported `deriveTargets`;
  - per-user paths under the product namespace (the app basename and distribution id from the mozconfig), never under a Mozilla or Firefox root, nothing surviving the uninstall;
  - the Gatekeeper block (verbatim text, path, and the user-writable-install update limit);
  - the two SHA256 values equal, a known signing status, no staple without notarization;
  - fail-closed on an unreadable record, zero cells, no derivable cells, no derivable target.
- `scripts/verify-macos-download-copy.mjs` (row `macos-download-copy`):
  - six derived claim kinds on each side (signing, notarization, staple, scope, size, Gatekeeper path), compared as set equality;
  - the no-internal-identifier shape test (all-caps token, dotted key, Team ID, port or localhost, timeout, raw exception text) over every macOS string the page paints and the record's Gatekeeper text;
  - the page must name PowerBrowser and not spell it another way.
- `scripts/verify-platform.sh`: `macos-install-matrix` and `macos-download-copy` in the full tier after `macos-package-payload`; their twins `macos-install-matrix-self-test` and `macos-download-copy-self-test` in `--quick` after `macos-package-payload-self-test`. `grep -c` prints 2 for each name.
- Both scripts accept only `--self-test`; any other argument exits 2.

## Evidence

Matrix self-test: 24 ok lines. The final line reads `macos-install-matrix: --self-test PASS -- the draft is structurally clean and unobserved, the observed fixture is green, and 22 planted faults went red naming their drift`. The plants include:

- a missing cell and an invented cell;
- a RED with no cause, and a RED with one;
- two verdict lines, and a malformed verdict line;
- GREEN without evidence, and a hosted GREEN with no hosted run;
- an empty BUILD_TARGET set, a foreign one, and one missing an emitted target;
- a Mozilla-root residue path, a path outside the product namespace, and a surviving path;
- an absent Gatekeeper block, and a dropped update limit;
- a SHA256 mismatch, and a staple without notarization;
- an unreadable record, zero cells, and no derivable cells.

Copy self-test: 20 ok lines. The final line reads `macos-download-copy: --self-test PASS -- the real pair and the observed pair are green and 18 planted faults went red naming their drift`. The plants include:

- a dropped Gatekeeper consequence;
- three internal identifiers (dotted key, Team ID, all-caps token);
- notarization, staple and Developer ID overclaims;
- a dropped signing status, a dropped en-US scope line, and a dropped complete-MAR size line, on both the observed fixture and the real page;
- a wrong size and a stale pending size;
- an unobserved Gatekeeper sentence, a misspelt product name, a missing macOS line, and an unreadable record.

Row results on this tree:

```
macos-install-matrix-self-test: PASS
macos-download-copy-self-test: PASS
macos-download-copy: PASS
macos-install-matrix: FAIL   (25 unobserved items named, 0 structure problems; red by design until the owner session)
```

Brand scan: `no residual brand occurrence in 558 scanned file(s)`. `git -C upstream diff --quiet` exits 0.

`scripts/verify-platform.sh --quick` in this worktree: 431 PASS lines and six FAIL rows, exactly the known worktree-environment reds: `single-copy-deps`, `ng086-theia-react-node`, `gui07-strip-spike-verdict` and its self-test, `gui09-dependent-window-content` and its self-test. The authoritative green run is on the merged head in the main deploy worktree.

## Dependencies on 55-03 Task 2 (recorded, not worked around)

- The record's Signature, Notarization and Staple fields stay UNVERIFIED. Developer ID signing needs the Team ID, which needs the owner's Apple enrolment (BLOCKED.md item 2). Until then the copy gate expects, and the page states, ad-hoc signed and not notarized.
- The hosted sign, notarize and matrix jobs do not exist in `release.yml` yet (55-03 Task 2). The matrix gate treats every hosted cell as gated on a recorded hosted run.
- The mac-entitlements known-open exclusion (`.planning/WINDOWS.md` entry 22) is unchanged.

## Task 2: owner steps (not executed)

The commands are in `55-04-PLAN.md`, Task 2. In order:

1. Request the D-U-N-S number if not held; complete Apple Developer Program enrolment with the nonprofit fee waiver once the Phase 47 site is live; create the Developer ID Application certificate (pkcs12 plus password file) and the App Store Connect API key. Both are release secrets at dispatch time only, never in the tree or a reply.
2. Re-check SEC-13 live: the Apple SLA text for Linux cross builds, the apple-codesign and rcodesign releases, the Developer ID CA expiry date.
3. Dispatch `release.yml` for the macOS legs on main (build, sign, notarize, hosted draft-DMG matrix), with the hosted `macos-26` fallback only if the legion cross build fails.
4. On a real Mac (Apple Silicon preferred, macOS 15 or later): verify the DMG SHA256, install to a user-writable folder, record the verbatim Gatekeeper path, the icon verdict, both Darwin BUILD_TARGET strings, the writable-location hop, the Applications-location updater behaviour, the uninstall and the residue.
5. Fill every UNVERIFIED value in `55-MACOS-MATRIX.md`, state the notarization wall time, and confirm `node scripts/verify-macos-install-matrix.mjs` passes.
6. After the 24-hour canary (Owner Decision 12) and the N-minus-1 to N hop (Owner Decision 18), approve the release environment and the descriptor publish.

Reply with the eight fields of the plan's resume signal. Task 3 then fills the docs and runs the four live rows.

## Deviations from Plan

None to the task. Two interpretations are recorded:

- The plan says the matrix gate runs "over the draft record with zero unverified cells". A draft cannot have zero unverified cells and stay honest. The gate's structure is green on the draft, and its full row names each unobserved item and stays red.
- The plan says "five cells" and names four. The five are the BUILD.md matrix columns, including "alongside stock Firefox".

## Known Stubs

None in code. The draft record's UNVERIFIED values are the intended placeholders and are named by the full row.

## Threat Flags

None. No network, credential, endpoint or schema surface was added. The gates read tracked text only.

## Self-Check: PASSED

- FOUND: `55-MACOS-MATRIX.md`, `scripts/verify-macos-install-matrix.mjs`, `scripts/verify-macos-download-copy.mjs`
- FOUND: commit `83ea480f` is an ancestor of HEAD
- No file deletions in the commit.
- STATE.md and ROADMAP.md were not updated: this is a parallel worktree on branch `deploy/w3-55-04` and the plan is not complete (Tasks 2 and 3 open).
