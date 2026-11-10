---
phase: 68-three-os-artifacts-weekly-re-pin-and-upstream-seams
plan: 04
subsystem: licensing
tags: [licensing, orca, notices, spdx, ruling-68-A, ruling-68-B, PLAT-01]
status: complete
requires:
  - built orca/ (orca/out/orcad, out/web, out/mobile-web, orca/node_modules) for the derivation
provides:
  - scripts/lib/orca-shipped-packages.mjs (bundle-derived Orca shipped set, keyed cache)
  - Orca section of THIRD-PARTY-NOTICES.txt and LICENSING.md; generate-licensing.mjs --check-orca / --write-orca
  - per-package licence rule, package_exceptions, package_rulings, --rulings in verify-licence-allowlist.mjs
  - full registry row orca-licence-rulings
affects:
  - lane p68-01 (release.yml guard calls verify-licence-allowlist.mjs --rulings)
  - lane p68-02 (rebase-orca.sh calls generate-licensing.mjs --write-orca)
  - lanes p68-07 and p68-09 (they turn licence-allowlist green)
tech-stack:
  added: []
  patterns:
    - shipped set from the bundlers' own resolution (esbuild metafile, Vite sourcemaps), not from pnpm list alone
    - cache keyed by everything that can change the result
    - PENDING lines print without changing exit status; a separate --rulings mode carries the owner-item exit code
key-files:
  created:
    - scripts/lib/orca-shipped-packages.mjs
  modified:
    - scripts/generate-licensing.mjs
    - THIRD-PARTY-NOTICES.txt
    - LICENSING.md
    - inventory/licence-allowlist.json
    - scripts/verify-licence-allowlist.mjs
    - scripts/verify-platform.sh
decisions:
  - "68-A recorded as the owner ruled it (D-30): SDK row status extension, terms_check pending, windows_id null; no ruling chosen by the lane"
  - "68-B stays pending: allowed_package_spdx holds the proposed twelve-id set"
  - "terms_check accepts exactly pending or confirmed; any other value is red"
  - "an SPDX WITH-exception clause never counts as allowed (conservative)"
metrics:
  duration: "about 2 h of lane time (09:35 to 11:45 on 2026-11-10, including a stall on a permission prompt)"
  completed: 2026-11-10
estimate:
  tokens: 130000
  tasks: 3
actuals:
  tokens: 240100    # chars/4 over git diff 142d6212..HEAD; 16786 of it excluding THIRD-PARTY-NOTICES.txt
  tasks: 3
  commits: 3
plan_head_before: 142d6212a3b0026d4ea8b66276164fb61d28218e
plan_head_after: 1eef107e8128db4d3e5a65178b72716f279e0518
---

# Phase 68 Plan 04: Orca licensing Summary

The shipped Orca closure is derived from the orcad, web and mobile-web bundles (1273 packages), every package has a notice in a generated Orca section, a per-package SPDX gate passes 1271 of them, names khroma by exception, and holds `@anthropic-ai/claude-agent-sdk` to ruling 68-A as decided (status extension, D-30).

## Commits

| Task | Commit | Message |
|------|--------|---------|
| 1 (tracer) | 90fd3732 | feat(68-04): bundle-derived Orca notices for orcad, --check both ways, --check-orca and --write-orca |
| 2 | 3cd9b779 | feat(68-04): web and mobile-web package derivation, keyed cache, licensing plants |
| 3 | 1eef107e | feat(68-04): per-package licence rule, 68-A extension row, pending 68-B, orca-licence-rulings |

The SUMMARY is a separate docs commit after 1eef107e (see Deviations).

## Derived shipped set

- Cache key: `93fed26fe8fa45922b7a2e0ab8a8faab6df67bed5b49690cc92c0fdfa3417440` (`.mozbuild/orca-shipped/<key>.json`); sha256 of orca/ HEAD, every tracked orca-overlay/ file, orca/pnpm-lock.yaml, orca/mobile/pnpm-lock.yaml and the lib itself.
- Per bundle (a package can ship in more than one): orcad 98, web 341, mobile-web 977. Distinct name@version: 1273, in 444 licence groups.
- `@anthropic-ai/claude-agent-sdk@0.3.284` is in the orcad set (the known positive the lib asserts).
- `react` appears in the Orca section (bundled into out/web although it is a devDependency).
- Licence fields seen: MIT 1099, ISC 80, BSD-3-Clause 33, Apache-2.0 20, BSD-2-Clause 14, BlueOak-1.0.0 6, Unlicense 5, (MIT OR CC0-1.0) 3, 0BSD 2, MPL-2.0 2, and one each of MIT AND Apache-2.0, Python-2.0, CC-BY-4.0, (MPL-2.0 OR Apache-2.0), (MIT OR Apache-2.0), (BSD-3-Clause OR GPL-2.0), CC0-1.0, SEE LICENSE IN README.md (the SDK), no license field (khroma).
- Research's no-field list (ssh2, cpu-features, buildcheck, exit) does not ship by the bundle derivation; only khroma does.
- A second `--check-orca` run hits the cache in about 0.1 s.

## Exception rows written

| package | licence_field | licence_file | licence_first_line | ruling |
|---------|---------------|--------------|--------------------|--------|
| khroma (2.1.0; web, mobile-web) | null | license | The MIT License (MIT) | 68-B |

## PENDING lines and expected reds on this lane

`node scripts/verify-licence-allowlist.mjs` (exit 1) prints exactly two FAIL lines, both the SDK extension row:

```
licence-allowlist: FAIL -- @anthropic-ai/claude-agent-sdk: ruled extension (68-A) but still ships in orcad
licence-allowlist: FAIL -- extension folder bundled-extensions/claude-agent-sdk absent or not carrying @anthropic-ai/claude-agent-sdk at an exact version in its package.json dependencies (68-A)
PENDING RULING -- allowed_package_spdx (68-B): 1271 packages pass by the proposed set, 1 exception rows
PENDING OWNER CHECK -- Anthropic's terms permit redistributing @anthropic-ai/claude-agent-sdk in the pre-installed extension (68-A, D-30)
```

`node scripts/verify-licence-allowlist.mjs --rulings` (exit 1, needs no built orca/):

```
PENDING RULING -- allowed_package_spdx (68-B): per-package count not derived in this mode, 1 exception rows
PENDING OWNER CHECK -- Anthropic's terms permit redistributing @anthropic-ai/claude-agent-sdk in the pre-installed extension (68-A, D-30)
```

The summary line after the FAIL lines was changed from `FAIL -- N problem(s)` to `N problem(s) above`, so the count of FAIL lines equals the count of problems (the plan's verify allows at most two).

## Status-to-follow-up table (package_rulings)

| status | gate effect | follow-up when the owner picks it |
|--------|-------------|-----------------------------------|
| pending | package must ship (else stale); prints PENDING RULING; --rulings exits 1 | owner decides; set one field |
| ship | package must ship with the recorded licence line 1; red on stale or changed text | add the notices entry (already derived); no other change |
| exclude | red while the package still ships | remove it from the Orca build (a seam in orca-overlay/) and rebuild orca/ |
| runtime-fetch | red while the package still ships | externalise it and fetch it at run time; rebuild orca/ |
| extension (68-A as ruled, D-30) | red while it still ships; red unless the extension folder's package.json lists it at an exact version; PENDING OWNER CHECK while terms_check is pending | lane 68-07 (ORCAD_EXTERNAL_MODULES seam, then rebuild orca/), lane 68-09 (bundled-extensions/claude-agent-sdk); owner sets terms_check to confirmed |

## Check results (lane branch)

- `licensing` (generate-licensing.mjs --check): PASS (716 Theia packages / 337 groups; Orca 1273 / 444; Node v24.19.0).
- `licensing-self-test`: PASS, including the two Orca plants and three controls (write-orca touches only the Orca section; Gecko and Theia bytes unchanged; no built orca/ is a SKIP).
- `--check-orca`: PASS. `--write-orca` on a current tree: byte no-op. `--bogus`: exit 2.
- Gecko and Theia sections of THIRD-PARTY-NOTICES.txt are byte-identical to the merge base; no `v1.4.248` or `965978bc` in THIRD-PARTY-NOTICES.txt, LICENSING.md or the inventory.
- `licence-allowlist-self-test`: PASS (6 tree plants, 10 package plants, 3 controls).
- `licence-allowlist`: red with exactly the two SDK extension-row lines (by design until 68-07 and 68-09).
- `orca-licence-rulings`: red (by design while 68-B and the terms check are open).
- `--quick` against the Setup baseline (chrome-bar-typecheck, gui09-dependent-window-content, gui09-dependent-window-content-self-test, tab-uris-typecheck): new reds are licence-allowlist (expected), scan-brand-residue (expected) and scan-brand-residue-self-test. The last is the same cause: its `--extra-root` PASS controls also scan the tracked tree and fail on the unclaimed Orca tokens below. It clears with the coordinator's brand-tokens.json update.
- Lane diff (142d6212..HEAD) is inside files_modified.

## Brand scan counts for this lane's files (coordinator: inventory/brand-tokens.json)

`node scripts/scan-brand-residue.mjs --report .mozbuild/p68-04/brand-report.md` exits 1 with 311 condition-4 lines (unclaimed probe hits), plus the held-back rows `Orca` (title/coincidental) expected 497, observed 498 and `orca` (lower/coincidental) expected 1050, observed 1053.

| file | orca | Orca | ORCA |
|------|------|------|------|
| scripts/lib/orca-shipped-packages.mjs | 94 | 18 | 27 |
| scripts/generate-licensing.mjs | 65 | 68 | 6 |
| scripts/verify-licence-allowlist.mjs | 12 | 5 | 0 |
| LICENSING.md | 4 | 5 | 0 |
| THIRD-PARTY-NOTICES.txt | 5 | 2 | 0 |

## Deviations from Plan

1. **[Rule 3 - Blocking] Lane agent stalled; a second executor finished it.** The original lane agent committed Task 1 (90fd3732), wrote Task 2's code and regenerated notices uncommitted, then stopped on a permission prompt. The finishing executor verified no file had changed for over 30 minutes, verified Task 2 (self-test, --check, --check-orca, Theia bytes unchanged) and committed it as written (3cd9b779), then did Task 3.
2. **[Rule 1 - Bug] verify-licence-allowlist.mjs summary line.** The trailing `FAIL -- N problem(s)` line would make three FAIL lines for the two expected SDK reds, against the plan's own `grep -c FAIL <= 2`. It now reads `N problem(s) above`; the exit status is unchanged.
3. **SUMMARY in its own commit.** The plan puts the SUMMARY in the Task 3 commit; it is a separate docs commit so the Task 3 hash can be recorded here.
4. **Registry comment.** The licence-allowlist registry comment gains three lines describing the Phase 68 additions, so its plant count is not stale.
5. **Not run here:** gsd state updates (STATE.md, ROADMAP.md, REQUIREMENTS.md and .planning/WINDOWS.md are coordinator-owned), so no WINDOWS.md entry was appended.

## Threat Flags

None. The derivation runs Orca's installed, lockfile-pinned esbuild, Vite and pnpm on the built tree; no package was added.

## Merge note for the coordinator

Merge note for the coordinator: merge second (after 03, before 01, which calls --rulings from release.yml); licence-allowlist stays red naming the SDK's extension row until 68-07 (then rebuild orca/) and 68-09 are merged; fill package_rulings[0].windows_id with the WINDOWS.md id of the entry recording the open owner items (68-B, and the 68-A terms check) and add the orca-licence-rulings GATE_KNOWN_OPEN_EXCLUSIONS row keyed to it; THIRD-PARTY-NOTICES.txt is re-derived after every merge that changes orca/ or orca-overlay/. Also: claim the Orca tokens in the table above in inventory/brand-tokens.json, which clears both scan-brand-residue and scan-brand-residue-self-test. When 68-07 lands and orca/ is rebuilt, run `node scripts/generate-licensing.mjs --write-orca` so the SDK leaves the Orca notices.

## Self-Check: PASSED

- FOUND: scripts/lib/orca-shipped-packages.mjs (307 lines), THIRD-PARTY-NOTICES.txt Orca heading, inventory SDK row.
- FOUND: 90fd3732, 3cd9b779, 1eef107e are ancestors of HEAD.
