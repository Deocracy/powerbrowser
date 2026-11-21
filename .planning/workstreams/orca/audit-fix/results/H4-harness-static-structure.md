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
- scan-brand-residue and scan-brand-residue-self-test: new files and lines carry the third-party name, which inventory/brand-tokens.json counts per file. Integration must set the held-back rows to the observed values after merging: "Orca" 3617 to 3625, "orca" 6188 to 6193, "orcad" 2220 to 2264, "Orcad" 152 to 153 (on this branch alone), and add expected_files entries for scripts/lib/fixture-git.mjs, scripts/lib/orca-seams.mjs and scripts/lib/proc-tree.mjs. Then run `node scripts/scan-brand-residue.mjs`.

## Handoffs
- CI group: .github/workflows/verify.yml, add `bash scripts/fetch-orca.sh` before the `verify-platform.sh --quick` step, and correct the comment that says no row is silently skipped, for harness-static-structure-01. Until then the hosted job records orca-overlay, orca-pin, orca-pane-routes, orca-editor-routes, orca-no-pb-add-project, orca-landing-selectors and orca-terminal-keys as SKIP, not PASS.
- Callers of converted scripts: scripts/rebase-orca.sh:257-258 runs `verify-orca-slotless-start.mjs --orcad-only` and treats any non-zero status as red (a 77 is red, which is the intended replay behaviour; no change). .github/workflows/release-train.yml:535 runs `verify-upstream-pins.mjs` directly after `generate.mjs`, so the fragment exists and 77 cannot occur there; if the step ever runs without generate it fails, which is the safe direction (no change needed, noted). docs/BUILD.md:246-247 tells the reader to run verify-upstream-pins.mjs directly; docs group: add that exit 77 means a step was skipped.
- Product code: none. The checks pass on the product as it stands.

## Behaviour changes
- harness-static-structure-03 (the documented "downstream with no Orca" design of orca-pin): removing orca_tag and orca_commit is now a FAIL, revert with 80c11fab.
- harness-static-structure-06: an absent orca-overlay/seams.json or a lost overlay file is now red, revert with 4b02a564.

## Needs owner
None.

## Quick gate
`scripts/verify-platform.sh --quick` inside `nix develop .#theia` on the final tree: 437 PASS, 8 FAIL, 0 SKIP. Rows that were PASS on the base and are not now:
- scan-brand-residue, scan-brand-residue-self-test: caused by this lane, red by design (see Red by design).
- orca-service, orca-service-self-test, orca-browser-tab-scope, orca-browser-tab-scope-self-test, shell-error-copy-no-internals, shell-error-copy-no-internals-self-test: not caused by this lane; they belong to lanes H2, H3 and H8 as the lane brief states.
Every row this lane owns passes, including its self-tests. With orca/ moved aside the owned rows exit 77 with a SKIP line (verified), and each self-test prints its own PASS line last.
