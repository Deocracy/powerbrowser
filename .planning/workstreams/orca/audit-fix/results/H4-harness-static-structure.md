# Result: H4-harness-static-structure

Branch: worktree-agent-aea9477adce8f1820   Base: b5c4b182   Final: see the last commit of this branch (the result-record commit)

| ID | Status | Commit | Check | Note |
|---|---|---|---|---|
| harness-static-structure-01 | fixed | 4b02a564, 80c11fab, 447200fb, 706ba516, ab0368e0, c20584f1, 38daaa70, 1a773b02, 975587ff, f88248d4 | each owned script's `--self-test` (SKIP controls expect exit 77) | A missing orca/, build, typescript or fragment now exits 77 with one SKIP line instead of 0; the driver records SKIP and `--gate` fails it. The hosted job still lacks orca/ (Handoffs). |
| harness-static-structure-12 | fixed | 975587ff | verify-orca-bridge-dir.mjs --self-test: if (false), non-posix guard, uncalled function, comment, string, unconditional return, posix guard with else | A-11 steps are read from the method's AST statements (typescript), not by regex over text. |
| harness-static-structure-05 | fixed | 706ba516, ab0368e0 | verify-orca-build-shape.mjs --self-test (seam-rewritten-to-other-content, -to-the-pinned-content, undeclared-untracked-file, overlay-patch-missing); verify-orca-pane-entry.mjs --self-test (seam content plants) | New scripts/lib/orca-seams.mjs derives the patch-result blob from the recorded upstream_blob plus the patch and compares it with `git hash-object`. Ignored additions (out/, node_modules/) are not covered by the new clauses; the Node and Electron walks cover them. |
| harness-static-structure-08 | fixed | 706ba516, ab0368e0 | landing-selectors, pane-css and pane-entry self-tests run the script through a symlinked directory and require exit 2 | New scripts/lib/entry-point.mjs realpaths both sides; a mismatch prints FAIL and exits 2. |
| harness-static-structure-07 | fixed | 447200fb | verify-orca-no-pb-add-project.mjs --self-test (11 new plants) | Resolves same-file and imported constants, templates, concatenation, localize calls; reads the add-repo dialog strings; flags verb plus project/folder/repository/workspace noun; an unresolvable label of a register call is red. A missing typescript is a SKIP (the parser is typescript itself, so the self-test cannot run either). |
| harness-static-structure-06 | fixed | 4b02a564 | verify-orca-overlay.mjs --self-test: seams-json-absent, overlay-vanished, overlay-file-named-by-build-script-lost, overlay-files-emptied-while-build-scripts-name-them | Absent seams.json is red. The required overlay files are derived from scripts/build-orca*.sh. The "vacuous" PASS is gone. |
| harness-static-structure-11 | fixed | 4b02a564, 447200fb, 706ba516, ab0368e0, d0efcc97 | overlay, build-shape, pane-entry, editor-routes git-spec and pin self-tests run under a global git config with commit.gpgsign=true, a failing signer and a failing hooksPath | New scripts/lib/fixture-git.mjs: `-c` flags plus GIT_CONFIG_GLOBAL=/dev/null, GIT_CONFIG_NOSYSTEM=1, and the hostile-config wrapper. Without the helper the self-test crashes. |
| harness-static-structure-04 | fixed | 40875268 | verify-orca-packaged-tree.mjs --self-test: modified orcad.js, stale chunk, fat Mach-O with a foreign slice | Every staged file's sha256 must equal a built tree's; exceptions are the patchelf RUNPATH strip and the lipo merge (every fat slice equals a thin-tree file). |
| G5a handoff (executable mode) | fixed | 40875268 | verify-orca-packaged-tree.mjs --self-test: ELF named helper.dat, PIE, Mach-O, group-writable Mach-O, fat Mach-O each with the mode wrong | Linux and macos targets: every Mach-O (MH_EXECUTE, thin or fat) and ELF (ET_EXEC, or ET_DYN with PT_INTERP) found by magic bytes must be 0755. Shared objects, dylibs and a Java class stay green. win64 has no mode check. |
| harness-static-structure-13 | fixed | 706ba516 | verify-orca-pane-css.mjs --self-test: scope in :not(), :is(), a longer :where(), an attribute value; a pass mutated to wrap the scope in :not() or leave a rule unscoped | Clause c needs the scope at the top level of the selector (outside parentheses and brackets), handling CSS escapes. |
| harness-static-structure-03 | fixed | 80c11fab | verify-orca-pin.mjs --self-test: both-keys-removed, pin-block-removed, moved-tag, changed-commit | Both keys absent is FAIL. Overturns the documented "downstream with no Orca" SKIP. |
| harness-static-structure-09 | fixed | 1a773b02 | verify-orca-slotless-start.mjs --self-test: server on 0.0.0.0 with a loopback ready line, blind instrument, leaked daemon, scratch HOME | LISTEN sockets of orcad's tree are read from /proc and must be loopback, with one on the reported port. The tree is read before teardown and a surviving descendant is reaped and reported. The installed-Orca probe now uses the scratch HOME orcad runs under (liveEnv), so the finding's third claim was correct and is fixed. New scripts/lib/proc-tree.mjs. |
| harness-static-structure-14 | fixed | 38daaa70 | verify-orca-terminal-keys.mjs --self-test (SKIP exit 77 without orca/, checked by moving orca/ aside) | The self-test prints a named SKIP and exits 77 instead of an ENOENT crash. A missing non-orca file is a red. |
| harness-static-structure-10 | fixed | f88248d4 | verify-upstream-pins.mjs --self-test: pull_request_target, push, `${{ inputs.* }}` in a run body, for both workflows | The children of `on:` must equal {workflow_dispatch, workflow_call}; no run: body may interpolate inputs or event fields. Plants for a moved fragment tag, a moved manifest tag and a tag literal in fetch-upstream.sh were also added. |

Also converted to the SKIP protocol with no item of their own: verify-orca-pane-groups.mjs (c20584f1), verify-orca-landing-selectors, pane-css, pane-entry, terminal-keys, build-shape, slotless-start. verify-orca-packaged-tree.mjs and verify-build-orca-portable.mjs never SKIP and needed no conversion. bb3337c9 removes an unused import.

## Registry requests
None. The three new files are libraries under scripts/lib/ (fixture-git.mjs, entry-point.mjs, orca-seams.mjs, proc-tree.mjs), not checks.

## Red by design
- scan-brand-residue and scan-brand-residue-self-test: the follow-up commits add third-party-name occurrences. On top of 7a266476 the held-back rows read "Orca" 3847 to 3856, "orca" 6603 to 6620, "orcad" 2552 to 2569, "Orcad" 166 to 168 (this lane's follow-up only: +9, +17, +17, +2). Integration sets each count to the observed value after merging, then runs `node scripts/scan-brand-residue.mjs`. No unclaimed file remains (condition 4 is clean).

## Handoffs
- CI group: .github/workflows/verify.yml, add `bash scripts/fetch-orca.sh` before the `verify-platform.sh --quick` step, and correct the comment that says no row is silently skipped, for harness-static-structure-01. Until then the hosted job records orca-overlay, orca-pin, orca-pane-routes, orca-editor-routes, orca-no-pb-add-project, orca-landing-selectors and orca-terminal-keys as SKIP, not PASS.
- Callers of converted scripts: scripts/rebase-orca.sh:257-258 runs `verify-orca-slotless-start.mjs --orcad-only` and treats any non-zero status as red (a 77 is red, which is the intended replay behaviour; no change). .github/workflows/release-train.yml:535 runs `verify-upstream-pins.mjs` directly after `generate.mjs`, so the fragment exists and 77 cannot occur there; if the step ever runs without generate it fails, which is the safe direction (no change needed, noted). docs/BUILD.md:246-247 tells the reader to run verify-upstream-pins.mjs directly; docs group: add that exit 77 means a step was skipped.
- Product code: none. The checks pass on the product as it stands.

## Behaviour changes
- harness-static-structure-03 (the documented "downstream with no Orca" design of orca-pin): removing orca_tag and orca_commit is now a FAIL, revert with 80c11fab.
- harness-static-structure-06: an absent orca-overlay/seams.json or a lost overlay file is now red, revert with 4b02a564.

## Needs owner
None.

## Follow-up after independent review (twelve points)

Base for this round: 7a266476 (fast-forwarded). Each point was confirmed against the code first; all applied.

| Point | Item | Status | Commit | Check | Note |
|---|---|---|---|---|---|
| 1 | harness-static-structure-01 | fixed | c69783b1 | pane-routes (entry, vite config, orca-tabs-live), editor-routes (restore dir), bridge-dir (orca-agents), terminal-keys (orca-panes), pane-entry (OrcaPaneBundleApi) self-tests, each with a removal plant | A missing tracked input is a FAIL. Stricter than the brief's "decide by git ls-files": these inputs exist in every tree, so absence is unconditionally red (a `git rm`-then-commit would otherwise pass as untracked). Only the fetched orca/, builds, typescript, Theia install and the generated fragment stay optional. |
| 2 | harness-static-structure-05 | fixed | c94b096b | build-shape self-test: ignored x.js beside x.ts, missing declared file, edited declared file | Clause f uses `--ignored` and no global excludes file and tests set equality plus byte equality with the overlay. Exempt by explicit rule: out/, node_modules/ (any depth), .cache/, *.tsbuildinfo, src/packages/*/dist/, *.generated.ts (the real built tree's ignored outputs, measured: 80 dist files and four generated sources). |
| 3 | harness-static-structure-04 | fixed | d7b2d782 | packaged-tree self-test (macos): foreign slice, only an arm slice, two arm slices, swapped header CPU types, non-zero padding, wrong pair file | A fat file must be one slice per thin tree from the same path (or the pair's two names from archPairs), header CPU type equal to the slice's, zero bytes outside header and slices. |
| 4 | G5a mode handover | fixed | d7b2d782 | packaged-tree self-test: static-pie ELF, shared object with an executable built counterpart, #! script | ET_DYN with DF_1_PIE is an executable (the shipped ripgrep, checked on the real tree); Mach-O/ELF/#! files whose built counterpart has an executable bit must be 0755. Decision for shebang scripts: required only when the built counterpart is executable. |
| 5 | harness-static-structure-13 | fixed | 6fa654bf | pane-css self-test: `[scope] ~ .btn`, `[scope] + *`, spaced form; green controls for >, a sibling after a descendant step, :nth-child(2n+1) | Only a descendant or child combinator may follow the scope compound. |
| 6 | harness-static-structure-09 | fixed | 91ed316d | slotless-start self-test: failed start after a real group kill, pid reuse, foreign daemon pid, normal path | Row processes carry PB_SLOTLESS_ROW (the daemon is spawned from process.env, orca daemon-launched-child-spawn.ts:94); a sampler records identities; signals re-check the start time; a reported daemon pid outside the set is reported and not signalled; stopOrcad no longer gets a daemon pid. |
| 7 | harness-static-structure-10 | fixed | 078bd530 | upstream-pins self-test: env indirection, format(), inputs['tag'], (inputs.tag), toJSON(inputs), Inputs.tag, run: \|2, for both workflows | Any `${{ }}` in a run body except steps.*.outcome/conclusion and runner.* is red, case-insensitive. |
| 8 | harness-static-structure-12 | fixed | 63e72d32 | bridge-dir self-test: posix redefined as === "win", constant true, let plus reassignment, defined after use, top-level throw | posix must be a const, defined before use, the not-Windows comparison, never reassigned; throw is treated like return. |
| 9 | harness-static-structure-06 | fixed | bfda0237 | overlay self-test: imported file deleted, file two imports deep deleted, emptied seams.json with patches deleted, a required class with no row | Required files are derived from the relative-import graph of the named entries (all nine of nine now). Required seam classes are the UPSTREAM_CLASSES vocabulary of the script itself (browser-provider, pb-only), each needing a row: the tree has no other source for "the seams the product needs". |
| 10 | harness-static-structure-08 | fixed | 6fa654bf | pane-entry and pane-css symlink plants require the usage text and not the guard's message | |
| 11 | extra | fixed | d7b2d782 | packaged-tree self-test: import runs nothing, symlinked run reaches the usage check | Entry guard added. |
| 12 | extra | fixed | 20385632 | build-shape self-test: seam reverted to the pin with TMPDIR inside a work tree | The scratch directory is its own repository; inside another work tree git apply silently skipped the patch (reproduced). Without the fix the plant fails. |

Handoffs, red by design and behaviour changes: unchanged from above, plus: the stricter point-1 rule means a tree with orca-panes, orca-agents or the overlay entry removed is now red on --quick (intended).

## Third round: LICENSE handoff from G5b (packaging-prefs-network-02)

| Item | Status | Commit | Check | Note |
|---|---|---|---|---|
| packaging-prefs-network-02 (handoff) | fixed | 3ba162f6 | verify-orca-packaged-tree.mjs --self-test: LICENSE missing (linux, win64, macos), LICENSE altered; controls: orca/ not fetched leaves presence only | `LICENSE` is required in every packaged Orca tree on all targets (not "present in the built tree", which the hosted artifacts lack) and, when orca/LICENSE exists, must be byte-equal to it. Verified on a real stage copy that carries orca/LICENSE. |

## Quick gate
Third round, `scripts/verify-platform.sh --quick` inside `nix develop .#theia` on the final tree (log: .mozbuild/h4-quick-3.txt in this worktree): 449 PASS, 6 FAIL, 0 SKIP. The packaged-tree row is full-tier, so the quick gate does not run it; its self-test passes. Non-PASS rows, none caused by this round:
- scan-brand-residue, scan-brand-residue-self-test: this lane's earlier additions plus other lanes; on the current merge the held-back rows read "Orca" 4177 to 4185 and "orca" 7220 to 7229. Integration re-measures after merging.
- orca-service-self-test, orca-failure-classes and its self-test, build-windows-shape-self-test: not this lane's files. build-windows-shape-self-test throws "self-test anchor for the rulings guard step is absent from the build-windows job" (release.yml changed by another lane; scripts/verify-build-windows-shape.mjs needs its anchor updated).
