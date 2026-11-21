# Result: H9-skip-conversion

Branch: worktree-agent-a3197b130d66e5579   Base: fb5fc2b4   Final: see the commit that adds this record (its parent is 99b4e484)

Audit items: harness-driver-01, harness-static-structure-02, harness-static-browser-06 (the per-script half of the
SKIP protocol). Every converted script imports `scripts/lib/skip-verdict.mjs`: FAIL wins, a clause not run for an
absent input exits 77 with one `<name>: SKIP -- <reason>. Next step: ...` line printed last on stdout, no `: SKIP` line on
stderr, and the PASS line prints only when every clause ran. Where a script had a `--self-test`, it gained a control
that runs the main mode as a captured child (`spawnSync`, output piped) with an input absent and requires exit 77, the
SKIP line last and no PASS line. Most do this through a new `--root=<dir>` argument; a self-test whose own
prerequisite is absent now SKIPs with 77. No check judges anything differently on a tree that has its inputs: every
main mode and self-test below passes on this tree.

Search used (re-run, not the prompt's list alone): every `scripts/verify-*.mjs`, `scripts/verify-*.sh` and
`scripts/check-*.sh` that prints a SKIP verdict or a skip note and does not reference 77 or skip-verdict, then each
hit read by hand. Five scripts the list missed were converted (marked "added" below). Others were dropped with
evidence.

| ID | Status | Commit | Check | Note |
|---|---|---|---|---|
| verify-release-identity.mjs | fixed | 2df3097c | verify-release-identity.mjs --self-test::control (no upstream/ -> 77) | group A; `--root=` added; release-train.yml:534 already runs it through run-no-skip.sh |
| verify-search-engines.mjs | fixed | 5a26e2b6 | verify-search-engines.mjs --self-test::control (no fragment, no dump -> 77) | group A; `--root=` added |
| verify-telemetry.mjs | fixed | 857c88b8 | verify-telemetry.mjs --self-test::control (no fragment, no tsc -> 77) | group A; `--root=`; self-test SKIPs without generated/ |
| verify-theia-branding.mjs | fixed | d07c27f0 | verify-theia-branding.mjs --self-test::control (no fragments, no tsc -> 77) | group A; `--root=`; self-test SKIPs without generated/ |
| verify-theia-endpoints.mjs | fixed | 2e8c791e | verify-theia-endpoints.mjs --self-test::control (no fragment -> 77) | group A; `--root=`; self-test SKIPs without generated/ |
| verify-webextensions.mjs | fixed | 61738c64 | verify-webextensions.mjs --self-test::control (no fragment -> 77) | group A; `--root=`; self-test SKIPs (was FAIL) without upstream/ |
| verify-uri-roundtrip.mjs | fixed | 1cd8ed71 | no-check: live function row with no self-test; the early path was proven from a scratch copy (exit 77, SKIP line last) | group A; `SKIP <label> --` lines are now `not run <label> --` notes plus one protocol SKIP line |
| verify-orca-overlay-renderer.mjs | fixed | 2d2024d1 | verify-orca-overlay-renderer.mjs --self-test::control (no orca/ -> 77) | group A; the built-sheet and f2 hydrated halves were notes, now skips; self-test SKIPs on unrun plants |
| verify-orcad-lifecycle.mjs | fixed | 21511301 | verify-orcad-lifecycle.mjs --self-test::control (no orca/ -> 77) | group A; the self-test's watch-orcad exclusion stays a control note (`excluded`), not a SKIP |
| verify-branding-agreement.mjs | fixed | 1800c0e2 | verify-branding-agreement.mjs --self-test::control (never-generated root -> 77) | group B; SKIP line was followed by two lines; now last |
| verify-icon-ihdr.mjs | fixed | 1800c0e2 | verify-icon-ihdr.mjs --self-test::control | group B; self-test with nothing to mirror SKIPs (was FAIL) |
| verify-installer-schema.mjs | fixed | 1800c0e2 | verify-installer-schema.mjs --self-test::control | group B; self-test with nothing to mirror SKIPs (was FAIL) |
| verify-bundled-extensions-upgrade.mjs | fixed | 1d7a74d2 | verify-bundled-extensions-upgrade.mjs --self-test::control (no typescript -> 77) | group B |
| verify-claude-wrapper-pane.mjs | fixed | 22e10ec1 | verify-claude-wrapper-pane.mjs --self-test::control (no orca/, no typescript -> 77) | group B, also partial: the W Orca comparison and B were notes |
| verify-mode-store-migration.mjs | fixed | 9ef085f2 | verify-mode-store-migration.mjs --self-test::control (a copy with no theia/ -> 77) | group B |
| verify-orca-browser-host-wire.mjs | fixed | 15396eb1 | verify-orca-browser-host-wire.mjs --self-test::control (empty root -> 77) | group B; `--root=` |
| verify-orca-editor-router.mjs | fixed | de1b7ebe | verify-orca-editor-router.mjs --self-test::control (empty root -> 77) | group B; skip path also proven from `.h9-scratch/empty` |
| verify-orca-git-sides.mjs | fixed | fcb8c695 | verify-orca-git-sides.mjs --self-test::control (empty root -> 77) | group B, also partial: clauses b, a2, c were notes |
| verify-orca-pane-hosting.mjs | fixed | b0d1be01 | verify-orca-pane-hosting.mjs --self-test::control (a copy with no theia/ -> 77) | group B, also partial: handoff-* off POSIX was a pass line |
| verify-token-cookie-shadow.mjs | fixed | 2c75186f | verify-token-cookie-shadow.mjs --self-test::control (empty root -> 77) | group B |
| verify-descriptor-monotonic.mjs | fixed | 0e77714b | verify-descriptor-monotonic.mjs --self-test::zero candidates -> SKIP with exit 77 | group B; in-process `verdict()` control (prints nothing; a child would need gh api). `--descriptors` still has no SKIP path (runChecks :296-301: absent or empty tree is FAIL) |
| verify-dependent-window-content.mjs | fixed | 30368765 | no-check: copy of one note line | group C: the default mode judges the whole static half and its PASS claims nothing more; no registry row ran `--live`, so the line now names a requested row (Registry requests) and is not a SKIP line |
| verify-sidecar-reap-blocker.mjs | fixed | 271a3823 | verify-sidecar-reap-blocker.mjs --self-test::control (no upstream/ -> 77) | added: PASS line carried "SKIP of the phase-exists clause only" |
| verify-branding-preflight.mjs | fixed | 081ba9cc | verify-branding-preflight.mjs --self-test::control (fixture without the fragment -> 77) | added: section 11b skipped an absent fragment silently; self-test skipped its plant |
| verify-trademark-surface.mjs | fixed | fc72b688 | verify-trademark-surface.mjs --self-test::control (git fixture, never generated -> 77) | added: PASS line carried "N emitted surface(s) skipped" |
| verify-tab-store-offline.mjs | fixed | 99b4e484 | no-check: no self-test; proven from a scratch copy without upstream/ (exit 77, SKIP line last) | added: the upstream LIKE-pin clause was a notice; the R7 notice is under Needs owner |
| verify-shell-error-copy.mjs | fixed | 3c09d852 | no-check: an unreachable branch (tracked sources missing) | added: its self-test printed `  SKIP  reinstall copy faults` and passed; tracked inputs missing are red by the protocol |
| verify-mode-switch-tabs-invariant.mjs | fixed | fc0369f6 | no-check: comment line reference | follow-up: cites theia-branding's TSC_REL at :72 (was :68) |
| verify-ext-tab-host-patch-guards.mjs | not-applicable | - | - | :185-190 `SKIP_REASON` names the product's per-window skip, not a check verdict |
| verify-site-identity.mjs | fixed (round 2) | 46ab03d4 | verify-site-identity.mjs --self-test (clean control unfiltered) | round 1 called it not-applicable; round 2 removed the dead `'SKIP '` branch and the clean-control SKIP filter |
| verify-site-identity-live.mjs | not-applicable | - | - | live; :1676 pushes `SKIP <name>-not-landed` only for NOT_LANDED, which is `[]` (:1644) |
| verify-prompts-live.mjs | not-applicable | - | - | live; :184-201 `SKIPPED (PROMPT-03 deferred, ...)` is a recorded requirement deferral, not an absent input |
| verify-ext-tab-host-live.mjs | fixed (round 2) | 973cce39 | verify-ext-tab-host-live.mjs --verdict-self-test (hermetic; plants the pre-fix reporter) | round 1 called it not-fixed; the leg is now a skip and the run exits 77; the live mode was not run |
| verify-first-boot-surface.mjs --carried, verify-ng-015 (locked), verify-tab-store-offline (R7 note) | needs-owner | - | - | see Needs owner |

## Registry requests
- ext-tab-host-live-verdict-self-test: quick (hermetic reporter control: it exits before the fixture server is created, with no browser, display or network). Add beside the ext-tab-host-live rows, in the quick array:
  `"ext-tab-host-live-verdict-self-test|node $REPO_ROOT/scripts/verify-ext-tab-host-live.mjs --verdict-self-test"`
  Run by this lane: PASS, and red against the planted pre-fix reporter.
- (Round 1's gui09-dependent-window-content-live request is withdrawn and moved to Needs owner: the row was not registered, because nobody was permitted to run `--live`.)

## Red by design
- scan-brand-residue: count drift from the new SKIP reasons, comments and self-test controls, measured before this record was added: "Orca" 4252 -> 4255, "orca" 7394 -> 7424, "ORCA" 1578 -> 1581, "orcad" 2966 -> 2973. This record adds more. Integration recounts the held-back rows in inventory/brand-tokens.json.
- scan-brand-residue-self-test: red for the same drift (its `--extra-root` PASS control exits 1 while the tree's held-back counts disagree). Green after the recount.

## Handoffs
- docs owner: docs/non-gui/plans/wave-e-PLAN.md:2743 and docs/non-gui/questions-wave-e.md:77 cite `scripts/verify-dependent-window-content.mjs:96`; that closed-state string is now at :100 (the header comment gained 4 lines). For harness-static-structure-02.
- Callers checked (no change needed): .github/workflows/release-train.yml:534 runs verify-release-identity.mjs through run-no-skip.sh, so 77 is red; the old SKIP-then-PASS output was already red there (run-no-skip takes a SKIP line anywhere in stdout), so nothing changes at that step. .github/workflows/release.yml:1629 runs verify-descriptor-monotonic.mjs `--descriptors` through run-no-skip.sh; that mode still has no SKIP path, and the comment at :1622-1625 stays accurate. No other direct caller (workflows, scripts, .claude/hooks, docs, powerbrowser/packaging) runs a converted script; rebase-orca.sh ROWS (:60-61) holds none of them.

## Behaviour changes
- Harness verdicts only; no product code changed. On a tree without generated/, upstream/, orca/ or theia's typescript, the rows above now report SKIP where they reported PASS with a clause unrun. Under `--gate` each of those is red unless an exclusion excuses it (SKIP-PROTOCOL.md). On this tree, with every input present, every row is PASS. Revert per script with its commit above.
- Self-test verdicts with an absent prerequisite (corrected in round 2). Without generated/, the icon-ihdr and installer-schema self-tests now SKIP (77) before their plants where they FAILed by name. The telemetry, theia-branding and theia-endpoints self-tests crashed before the lane (ENOENT, a FAIL). They now run every case except the plant that copies the fragment and end with a SKIP naming that plant, or a FAIL if any case that ran is red. Without upstream/, the webextensions self-test now runs plants 1 to 6 and SKIPs plants 7 to 9 where it FAILed. shell-error-copy's self-test now FAILs where it passed with its reinstall plants unrun: the tracked sources are missing in that case, and the main mode is red too. Revert with 1800c0e2, e585afef with 857c88b8, f9b115aa with d07c27f0, 4b0ecab9 with 2e8c791e, 61738c64, 3c09d852.
- uri-roundtrip (round 2, 8f6c8252): a missing theia/extensions/orca-panes and a 90 s pane-bundle boot timeout with a built tree are now FAIL, not SKIP.
- ext-tab-host-live (round 2, 973cce39): when the options scenario does not reach the starting-window leg, it prints `options-page-switch: partial -- ...` and the run exits 77 with the SKIP line last, not `PASS` with exit 0. Its `--self-test` SKIPs when a control did not reach that leg.

## Needs owner
- gui09-dependent-window-content-live (moved from Registry requests in round 2): the `--live` mode of scripts/verify-dependent-window-content.mjs is run by no registry row. It reads a tracked probe record with no build, browser or network, but nobody here was permitted to run it. 404c77cf reworded the note and the registry comment to say that no row runs it. Decide whether to register `"gui09-dependent-window-content-live|node $REPO_ROOT/scripts/verify-dependent-window-content.mjs --live"` after running it once.
- decisions.md R7 (the private real-profile and carried-over fixtures, read through PB_REAL_PROFILE_FIXTURE and PB_FIRST_BOOT_FIXTURE, "notice when unset"): by SKIP-PROTOCOL.md rule 2 an unset fixture is an unrun clause, but R7 and 19-01-PLAN.md:243 ratify "print a notice and exit 0". Converting would put tab-store-offline (quick) and first-boot-surface-carried (full) on SKIP, and red under `--gate`, on every machine without the private fixtures. Decide one of: (a) convert, plus a GATE_KNOWN_OPEN_EXCLUSIONS row per label; or (b) ratify the fixtures as optional extra coverage outside the row's clauses and reword the notices so they do not say "skipped". Lines: scripts/verify-tab-store-offline.mjs:154 (`notes.push('PB_REAL_PROFILE_FIXTURE is not set; ...')`); scripts/verify-first-boot-surface.mjs:456-457 (`notice -- ... skipped (decisions.md R7)` then `process.exit(0)`; (a) makes it `console.log(skipLine(label, ...)); process.exit(77)`, and its self-test's unset-env case expects 77); scripts/verify-ng-015-real-migration-from-every-version.mjs:108 (ledger-locked; under (a) it becomes `skips.push(...)` with `verdictExit(NAME, failures, skips)` before its PASS line, owner-applied).
- verify-orca-overlay-renderer.mjs now treats a stale or unbuilt pane sheet (clause a's built-sheet half) as a SKIP. An integration tree whose orca/pb-css-scope.mjs is stale against the overlay will show orca-overlay-renderer as SKIP until `scripts/build-orca.sh --panes-only` runs. This follows rule 2; flagged in case the owner wants a stale build to be FAIL instead.

## Quick gate
`nix develop .#theia --command scripts/verify-platform.sh --quick` on 99b4e484's parent tree, with the scripts as committed except tab-store-offline, which was committed during the run and then run alone (PASS): 455 rows, 453 PASS, 2 FAIL, 0 SKIP (base 455 PASS). Non-PASS rows: scan-brand-residue and scan-brand-residue-self-test, both red by design (above). Log: `.h9-scratch/quick.log` in the lane worktree (untracked).

## Round 2 (review fixes, base 404c77cf)

| Point | Status | Commit | Check | Note |
|---|---|---|---|---|
| 1 orca-git-sides partial-skip control | fixed | 13a7db98 | verify-orca-git-sides.mjs --self-test::control (a git refusing --filter -> 77 naming b and a2) | planting `r.fails.length ? 1 : 0` for the verdictExit now turns the self-test red (mutant run from .h9-scratch) |
| 2 orca-pane-hosting off-POSIX control | fixed | 72f5ebb8 | verify-orca-pane-hosting.mjs --self-test::offPosixControl (`--import` preload, process.platform = win32 -> 77) | planting `failures.length ? 1 : 0` turns the self-test red |
| 3 telemetry, theia-endpoints, theia-branding self-tests | fixed | e585afef, 4b0ecab9, f9b115aa | each --self-test, run as a mutant with the fragment path absent: exit 77 naming only the fragment plant, every other case judged | the fixtures copy the fragments that exist; the verdict comes at the end (FAIL, then SKIP), as in webextensions |
| 4 Behaviour changes entry | fixed | this record | no-check: record text | corrected under Behaviour changes |
| 5 uri-roundtrip FAIL cases | fixed | 8f6c8252 | no-check: live row; scratch copies prove a missing orca-panes -> exit 1 FAIL and orca-panes without a build -> 77 | the 90 s boot timeout is now a red row (not exercised: needs a browser) |
| 6 ext-tab-host-live leg 1 | fixed | 973cce39 | verify-ext-tab-host-live.mjs --verdict-self-test (PASS; the planted pre-fix reporter goes red) | the live mode and its --self-test were not run |
| 7 site-identity dead paths | fixed | 46ab03d4 | verify-site-identity.mjs and --self-test both green | the filter and the dead branch are removed |

Quick gate (round 2): `nix develop .#theia --command scripts/verify-platform.sh --quick` at 46ab03d4, log `.h9-scratch/quick2.log`: 455 rows, 453 PASS, 2 FAIL, 0 SKIP. The FAIL rows are scan-brand-residue and its self-test, red by design for count drift against the 8a562a41 recount: "orcad" 3013 -> 3012, "orca" 7557 -> 7561, "ORCA" 1581 -> 1583, "pbOrca" 24 -> 22 (pbOrcaSkip became pbOrcaInputs in verify-uri-roundtrip.mjs), measured before this section was added. Integration recounts.
