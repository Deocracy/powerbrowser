# Fix brief: H4-harness-static-structure

Lane: harness. Items: 13. Files this group owns: `scripts/verify-orca-overlay.mjs`, `scripts/verify-orca-pane-css.mjs`, `scripts/verify-orca-pane-entry.mjs`, `scripts/verify-orca-pane-groups.mjs`, `scripts/verify-orca-pane-routes.mjs`, `scripts/verify-orca-pin.mjs`, `scripts/verify-orca-slotless-start.mjs`, `scripts/verify-orca-terminal-keys.mjs`, `scripts/verify-orca-build-shape.mjs`, `scripts/verify-orca-packaged-tree.mjs`, `scripts/verify-orca-bridge-dir.mjs`, `scripts/verify-orca-editor-routes.mjs`, `scripts/verify-orca-landing-selectors.mjs`, `scripts/verify-orca-no-pb-add-project.mjs`, `scripts/verify-build-orca-portable.mjs`, `scripts/verify-upstream-pins.mjs`.

Item IDs: harness-static-structure-01; harness-static-structure-12; harness-static-structure-05; harness-static-structure-08; harness-static-structure-07; harness-static-structure-06; harness-static-structure-11; harness-static-structure-04; harness-static-structure-13; harness-static-structure-03; harness-static-structure-09; harness-static-structure-14; harness-static-structure-10.

## harness-static-structure-01: Hosted PR gate (verify.yml --quick) has no orca/, so the overlay replay, pin-to-checkout and several pane/editor/add-project checks all SKIP and pass

- **Severity:** medium
- **Verdict:** CONFIRMED
- **Location:** `scripts/verify-orca-overlay.mjs:259`

**What is wrong.** .github/workflows/verify.yml fetches upstream/ and builds Theia but never runs scripts/fetch-orca.sh. Every quick-tier row that needs orca/ prints a SKIP and exits 0 in that job. verify.yml also states "none is silently skipped", which is false for these rows. The affected steps are:
- orca-overlay: pinned-blob drift, pre-image check, half-file replacement, shadowing, and the hermetic replay that catches a hand-edited patch applying as a no-op (the recorded failure mode).
- orca-pin: step f, HEAD and refs/tags/<tag> against the commit.
- orca-pane-routes: the whole check and its self-test (both exit at line 548 before any work).
- orca-editor-routes: the check, the self-test and the routeOpenFile behaviour cases.
- orca-no-pb-add-project: the whole check.
- orca-landing-selectors: the bundle clauses.
The fragment check in orca-pin is tautological in CI, because generate.mjs rebuilds the fragment from the same manifest.

**Scenario.** A pull request hand-edits a hunk body in orca-overlay/patches/*.patch, or changes orca_commit in configuration.toml to a commit the tag does not peel to. verify.yml runs generate, then --quick. orca-overlay prints "SKIP -- orca/ is not a fetched git checkout" and exits 0, and orca-pin has no orca/ to compare against. The PR is green. The no-op only surfaces later in build-orca.sh or rebase-orca.

**Preconditions.** Pull request or push CI on the hosted verify job.

**Evidence.** verify-orca-overlay.mjs:259-261: `if (!isGitTop(orcaDir)) { notes.push(`${NAME}: SKIP -- orca/ is not a fetched git checkout, ...`); } else { ...blob / replay ... }` and render() returns code 0 when fails is empty. verify-orca-pane-routes.mjs:548: `if (!existsSync(join(REPO_ROOT, REL.tabTypes))) { console.log(`...SKIP -- orca/ is not fetched`); process.exit(0); }` placed before the --self-test branch. verify-orca-pin.mjs:191-193: `if (!io.exists('orca')) { notes.push('orca/ absent, checkout step skipped'); }`. verify.yml steps: generate, fetch-upstream, yarn build, verify-platform.sh --quick, with no fetch-orca.

**Suggested fix.** Add `bash scripts/fetch-orca.sh` (clone at the pin, a verified shallow clone) to verify.yml before the --quick step. Alternatively make these rows FAIL, not SKIP, when CI=true and orca/ is absent. Correct the "none is silently skipped" comment in verify.yml.

**Verifier (CONFIRMED, medium).** verify.yml runs generate, fetch-upstream.sh, yarn build and verify-platform.sh --quick; no fetch-orca.sh anywhere in it (fetch-orca.sh appears only in release.yml and release-train.yml). The quick rows orca-overlay, orca-pin and orca-pane-routes are registered in verify-platform.sh. In the pane-routes script (line 548) the SKIP exits 0 before the self-test dispatch. verify-orca-overlay.mjs:259-260 turns a missing orca/ into a note, so blob, replay and shadowing steps do not run. verify-orca-pin.mjs:191-193 skips the checkout step when orca/ is absent. The workflow comment 'none is silently skipped' is wrong for these rows, though the SKIP is printed. The hermetic rebase-orca-self-test still runs but does not check the real patches. *Checked at:* No guard in .github/workflows/verify.yml; scripts/verify-orca-overlay.mjs:259; scripts/verify-orca-pane-routes.mjs:547-548; scripts/verify-orca-pin.mjs:191

## harness-static-structure-12: orca-bridge-dir verifies the writePrivateFile permission order with unanchored regexes over text, so a dead or conditional step still satisfies it

- **Severity:** low
- **Verdict:** CONFIRMED
- **Location:** `scripts/verify-orca-bridge-dir.mjs:158`

**What is wrong.** The A-11 order (0700 folder, exclusive empty create, 0600 before content, move) is checked by running each regex against the method body after stripping only full-line // comments. A step in a never-taken branch, a trailing // comment, or a string literal still matches. The self-test only plants removal or reordering of the exact existing text. The header acknowledges that modes on disk are proven only by the live row. This is a credential-adjacent file (the data-root hand-off).

**Scenario.** A refactor moves the setPermissions call into an `if (false)` or an early-returned branch. Every regex still matches in the right order and the check stays green, while the file is written with the default umask mode.

**Preconditions.** A refactor that preserves the text but changes control flow.

**Evidence.** verify-orca-bridge-dir.mjs:158-166 STEPS regexes and :172 `const code = body.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');` with matching by `re.exec(code)` and no AST or control-flow check.

**Suggested fix.** Parse the member with the TypeScript or acorn AST. Require the calls as top-level awaited statements of the method, in order, and not inside an if other than the `posix` guard. Add a plant that wraps the 0600 call in `if (false)`.

**Verifier (CONFIRMED, low).** orderVerdict (verify-orca-bridge-dir.mjs:~168-190) strips only lines that begin with //, then runs the STEPS regexes with re.exec over the text. Regexes are not anchored to control flow, so a setPermissions call in a dead or conditional branch still matches. The header says on-disk modes are proven only by the live row, which is a mitigating control. The scenario needs a refactor that preserves the text but changes control flow. *Checked at:* scripts/verify-orca-bridge-dir.mjs:158-180; the live row is the stated backstop.

## harness-static-structure-05: orca-build-shape and orca-pane-entry prove which tracked paths are modified, not that they hold the declared patch result

- **Severity:** low
- **Verdict:** CONFIRMED
- **Location:** `scripts/verify-orca-build-shape.mjs:140`

**What is wrong.** The claim is that Orca's tracked files differ from the pin in exactly the declared seams. The check compares the path set from `git status --porcelain --untracked-files=no` with the seams.json paths. A seam path edited to any content other than the patch result still passes. Untracked or ignored additions to the orca/ tree are excluded by --untracked-files=no. orca-pane-entry clause b compares status text to a baseline file that the build itself wrote, which has the same limit.

**Scenario.** A build-time step or a postinstall script in a pinned npm dependency rewrites a declared seam file such as the browser-provider with different content. Status still lists the same M path, so both checks pass. Other tracked files edited after the pre-build baseline would be caught, but a seam path is not.

**Preconditions.** Something other than apply-patches.sh modifies a declared seam path after the overlay is applied.

**Evidence.** verify-orca-build-shape.mjs:142-146: `const path = line.trim().split(/\s+/).pop(); seen.add(path); if (seamPaths.includes(path)) modified++; else fails.push(...)`. The only seam content proof is apply-patches.sh, run during the build, not here.

**Suggested fix.** Compare `git -C orca hash-object <seam path>` with the blob that applying the patch to the recorded upstream_blob yields. Derive that blob at check time from the recorded blob plus the patch, as the overlay replay already does.

**Verifier (CONFIRMED, low).** verify-orca-build-shape.mjs:140-146 compares only the set of paths from git status --porcelain --untracked-files=no against seams.json. A seam path with different content still passes, and untracked additions are excluded. Content correctness of seams is proven only in apply-patches.sh during the build. The precondition (something else rewrites a seam file) is narrow, so this is hardening. *Checked at:* scripts/verify-orca-build-shape.mjs:140-149

## harness-static-structure-08: Three checks guard their CLI entry point with a symlink-sensitive comparison; when it misses, the script does nothing and exits 0

- **Severity:** low
- **Verdict:** CONFIRMED
- **Location:** `scripts/verify-orca-landing-selectors.mjs:215`

**What is wrong.** landing-selectors compares `import.meta.url === pathToFileURL(process.argv[1]).href`. pane-css compares `resolve(process.argv[1]) === fileURLToPath(import.meta.url)`, at line 153. pane-entry does the same through INVOKED, at line 612. Node realpaths the ESM main module for import.meta.url but leaves process.argv[1] as typed, so any symlinked component in REPO_ROOT makes the guard false. The script then falls through with no output and exit 0, for both the check and --self-test. The other scripts in the shard use realpathSync on both sides. The canonical path in CLAUDE.md is under /home/chris/coding, which is not a symlink today.

**Scenario.** The checkout is reached through a symlinked directory (a convenience link to the workspace). `node $REPO_ROOT/scripts/verify-orca-landing-selectors.mjs` prints nothing and exits 0, so the landing selector gate and its self-test never run.

**Preconditions.** The scripts are invoked through a path containing a symlink.

**Evidence.** verify-orca-landing-selectors.mjs:215-221 `if (import.meta.url === pathToFileURL(process.argv[1]).href) { ... process.exit(...) }` with no else branch; verify-orca-pane-css.mjs:152-157 `const SELF = fileURLToPath(import.meta.url); if (process.argv[1] && resolve(process.argv[1]) === SELF) {...}`.

**Suggested fix.** Use the realpathSync(resolve(argv[1])) === realpathSync(fileURLToPath(import.meta.url)) form already used by sibling checks, and make a false guard print a FAIL and exit 2 when the file was run as a script.

**Verifier (CONFIRMED, low).** verify-orca-landing-selectors.mjs:215 compares import.meta.url to pathToFileURL(process.argv[1]).href, with no else branch. pane-css:152-157 and pane-entry:612 compare resolve(argv[1]) to fileURLToPath(import.meta.url). Node realpaths the ESM main module, so a symlinked path component makes the guard false and the script exits 0 silently. The canonical checkout path is not a symlink today, so this is a latent hardening gap. *Checked at:* scripts/verify-orca-landing-selectors.mjs:215-221; scripts/verify-orca-pane-css.mjs:152-157; scripts/verify-orca-pane-entry.mjs:612

## harness-static-structure-07: orca-no-pb-add-project cannot go red for any PowerBrowser project or folder control that is not an exact normalised match of an Orca string, and SKIPs its self-test when typescript is absent

- **Severity:** low
- **Verdict:** CONFIRMED
- **Location:** `scripts/verify-orca-no-pb-add-project.mjs:55`

**What is wrong.** The header claims PowerBrowser adds no "Add-project, folder-picker or project control". The check only fails when a PB command, menu, toolbar or keybinding string normalises to equal an Orca translate() default that matched /add (a )?project/i, or one inside the add-repo-opening function. A PB command labelled "Add Folder", "Open Folder", "New Project", "Add Workspace" or "Choose Repository", or a label built from a constant, template or import, passes. No folder-picker vocabulary is derived at all.
Separately, main() and --self-test both exit 0 with SKIP when theia/node_modules/typescript is absent (line 339), before the self-test runs. The self-test fixture is hermetic and does not need typescript present on disk, only a loadable one.

**Scenario.** A developer adds a command with label 'Open Folder...' or 'New Project' to a Theia extension. The vocabulary comparison finds no equal string and the row is green. In an environment without typescript both rows print SKIP.

**Preconditions.** A PB control whose text differs from Orca's exact strings, or a run without a Theia install.

**Evidence.** verify-orca-no-pb-add-project.mjs:55 `const ADD_PROJECT = /add (a )?project/i;` and :209-210 `const v = vocabByNorm.get(normalise(p.text)); if (v) fails.push(...)`. :339 `if (!loadTypeScript()) { console.log(`...SKIP -- theia/node_modules/typescript is absent...`); process.exit(0); }` precedes the --self-test dispatch at :340.

**Suggested fix.** Broaden the derived vocabulary to Orca's folder-picker and add-repo dialog strings, not only the /add project/ pattern. Flag any PB registration whose label matches a derived project/folder/repo noun. Run the self-test on the fixture even when typescript is missing, or fail it when CI=true.

**Verifier (CONFIRMED, low).** check() fails only when normalise(p.text) equals a vocabulary string derived from Orca's add-project strings (lines 209-210). A PB control labelled 'Open Folder' or 'New Project', or built from a constant or template, is not matched. The self-test is dispatched after the typescript SKIP at line 339 (the dispatch is at line 340), so without typescript both rows print SKIP and exit 0. The check is scoped to D-18's Add-project string and is a heuristic, which limits the impact. In hosted CI the row also SKIPs because orca/ is absent. *Checked at:* scripts/verify-orca-no-pb-add-project.mjs:55, 209-210, 339-340

## harness-static-structure-06: orca-overlay treats an absent seams.json, patches/ or files/ as zero seams and passes

- **Severity:** low
- **Verdict:** CONFIRMED
- **Location:** `scripts/verify-orca-overlay.mjs:157`

**What is wrong.** If orca-overlay/ or seams.json is deleted, rows = [] and the patch and file lists are empty. The check passes with "0 seam(s), 0 overlay file(s)". The seam cap is only an upper bound, and orca-build-shape derives its seam list from the same file, so it is equally satisfied. An overlay that silently vanishes, such as the browser-provider seam and the pane bundle files the product depends on, produces no red row in the quick or full tier. Only --upstream-prs and the live rows would notice, and --upstream-prs crashes on JSON.parse when the file is missing.

**Scenario.** A bad merge or an accidental `git rm -r orca-overlay` removes the overlay. orca-overlay, orca-build-shape, orca-overlay-built ("vacuous at zero files") and the self-tests all pass; only live rows fail much later.

**Preconditions.** The overlay directory or seams.json is removed.

**Evidence.** verify-orca-overlay.mjs:157-169 (`// a. seams.json ... An absent file is zero seams.` `if (existsSync(seamsFile)) {...}`) and renderBuilt line 356 `PASS -- 0 overlay file(s): vacuous until the first PB-added file lands`.

**Suggested fix.** Fail when seams.json is absent. Compare the derived overlay against a derived requirement, for example that every orca-overlay/files path referenced by theia/extensions/orca-panes exists. Remove the "vacuous" PASS for orca-overlay-built once the first overlay file has landed.

**Verifier (CONFIRMED, low).** verify-orca-overlay.mjs:156-169 treats a missing seams.json as rows = []. renderBuilt prints PASS for 0 overlay files (line 356). A deleted overlay therefore does not turn these rows red. Other quick rows that read overlay files may catch it, and an overlay deletion is a large, visible diff, which limits the impact. *Checked at:* scripts/verify-orca-overlay.mjs:157-169, 350-358

## harness-static-structure-11: Fixture git commits in several self-tests inherit the developer's global git config

- **Severity:** low
- **Verdict:** CONFIRMED
- **Location:** `scripts/verify-orca-overlay.mjs:302`

**What is wrong.** Fixture repositories are committed with only -c user.name and -c user.email set. They inherit the user's global and system git config: commit.gpgsign, gpg.program, core.hooksPath, core.fsmonitor, init.templateDir and similar. With commit.gpgsign=true the self-test can invoke the signing agent or fail. A global core.hooksPath runs the user's hooks inside the throwaway repositories. verify-orca-pin.mjs shows the intended form (-c commit.gpgsign=false -c tag.gpgsign=false).

**Scenario.** A developer with commit.gpgsign=true and a pinentry-protected key runs --quick. The self-tests for orca-overlay, orca-build-shape, orca-pane-entry and orca-editor-routes hang or fail on a GPG prompt, or run the developer's global pre-commit hook against a fixture.

**Preconditions.** Developer machine with signing or hooks configured globally.

**Evidence.** verify-orca-overlay.mjs:302 `git(replay, '-c', 'user.name=replay', '-c', 'user.email=replay@invalid', 'commit', ...)` and :379; verify-orca-build-shape.mjs:183; verify-orca-pane-entry.mjs:511; verify-orca-editor-routes.mjs:429. None disables signing or hooks.

**Suggested fix.** Route fixture git calls through one helper that adds `-c commit.gpgsign=false -c tag.gpgsign=false -c core.hooksPath=/dev/null` and sets GIT_CONFIG_GLOBAL=/dev/null and GIT_CONFIG_NOSYSTEM=1.

**Verifier (CONFIRMED, low).** The fixture commits in verify-orca-overlay.mjs:302 and :379, verify-orca-build-shape.mjs:183, verify-orca-pane-entry.mjs:511 and verify-orca-editor-routes.mjs:429-434 set only user.name and user.email. None sets commit.gpgsign=false or core.hooksPath. verify-orca-pin.mjs:238 does set gpgsign=false, so the omission is inconsistent. Overlay and editor-routes use withoutGitVars, which strips only GIT_* env vars, not the global config files. Impact is limited to developer machines with signing or hooks configured globally. *Checked at:* No gpgsign or hooksPath override found in those files; only verify-orca-pin.mjs:238 has one.

## harness-static-structure-04: orca-packaged-tree compares only file names between the stage and the built tree, so tampered or stale file content ships green

- **Severity:** low
- **Verdict:** CONFIRMED
- **Location:** `scripts/verify-orca-packaged-tree.mjs:126`

**What is wrong.** The check claims the shipped Orca root is "exactly the built Orca tree's package.json, out/orcad/** and out/web/**". It compares only the two path sets. Only node-pty/build/Release is compared by sha256, and only when --prebuild-manifest is supplied. The release.yml macOS jobs and package-windows.sh pass --prebuild-manifest explicitly; the default linux run defaults it from the host orca/. Any other staged file whose bytes differ from the built tree's passes, such as a modified orcad.js, a stale out/web chunk, or a payload swapped between build and package. The macOS universal merge is likewise compared by names only.

**Scenario.** A packaging step, a compromised packaging dependency, or a stale cached stage replaces out/orcad/orcad.js or a web chunk with different content under the same path. The set comparison passes, no Node, marker or Electron name appears, and the tarball is published.

**Preconditions.** Packaging or staging that alters bytes without adding or removing paths.

**Evidence.** verify-orca-packaged-tree.mjs:126-127: `for (const r of [...expected].sort()) if (!staged.has(r)) fails.push(`built but not staged: ${r}`); for (const r of [...staged].sort()) if (!expected.has(r)) fails.push(`staged but not built: ${r}`);` The only content comparison is the node-pty slot loop at 158-162.

**Suggested fix.** Derive a sha256 per file from the built tree (or trees, for macOS thin trees) and compare the stage per path. Allow only the documented RUNPATH-stripped ELF exception, which the check already models.

**Verifier (CONFIRMED, low).** check() in verify-orca-packaged-tree.mjs:126-127 compares only the expected and staged path sets, then name-based Node, marker and Electron checks. The only content comparison is the node-pty release sha256 loop (lines 150-162), and it runs only when a manifest is supplied. A same-path byte substitution in orcad.js or a web chunk passes. The exploit needs the packaging step or a stale stage to change bytes, which is a supply-chain precondition rather than an outsider path. *Checked at:* scripts/verify-orca-packaged-tree.mjs:126-127, 150-162

## harness-static-structure-13: orca-pane-css scope check accepts any selector that merely contains the scope string

- **Severity:** low
- **Verdict:** CONFIRMED
- **Location:** `scripts/verify-orca-pane-css.mjs:100`

**What is wrong.** Clause c treats a selector as scoped if it includes PANE_ROOT or PORTAL_ROOTS anywhere. A selector such as `.leak:not(<scope>)`, or the scope used as an argument inside :is() or :where() that does not constrain the subject, passes. Self-test plants mutate the already-computed result strings, not the pass or the sheet, so they exercise compareFixtures rather than the clause c logic. Only the one unscoped-rule plant covers clause c.

**Scenario.** A pass bug emits `:not(<PANE_ROOT>) .btn` rules that style Theia chrome. The sheet check stays green, and it also SKIPs without a built sheet.

**Preconditions.** A scoping-pass regression that emits the scope in a non-constraining position.

**Evidence.** verify-orca-pane-css.mjs:100 `const bad = rule.selectors.filter(s => !s.includes(pass.PANE_ROOT) && !s.includes(pass.PORTAL_ROOTS));` and :124-128 `planted(name, from, to)` splits and joins the already-computed `results[name]` strings.

**Suggested fix.** Require the scope as a leading compound or ancestor of the selector by parsing it with postcss-selector-parser. Add a plant that wraps the scope in :not().

**Verifier (CONFIRMED, low).** Clause c in checkSheets (verify-orca-pane-css.mjs:100) accepts any selector that includes PANE_ROOT or PORTAL_ROOTS as a substring, so `:not(<scope>) .btn` passes. The self-test plants edit the already-computed result strings and exercise compareFixtures, not the clause c logic. The only clause c plant is the single `.leak` unscoped rule. The scoping pass is also compared against fixtures with exact expected output, which limits practical exposure. *Checked at:* scripts/verify-orca-pane-css.mjs:100, 124-128; the fixtures comparison is a partial backstop.

## harness-static-structure-03: orca-pin goes SKIP, not FAIL, when both orca_tag and orca_commit are removed from configuration.toml

- **Severity:** low
- **Verdict:** CONFIRMED
- **Location:** `scripts/verify-orca-pin.mjs:135`

**What is wrong.** If neither [upstreams] key is present, check() returns skip and render() exits 0. Orca is integral to this tree, so absence of the pin is a defect, not a downstream configuration. None of the nine self-test plants covers removing both keys (tag-without-commit covers only one removed), so this path is unguarded. Nothing else in the quick tier derives that the keys must exist; the fetch-orca.sh refusal is not run in CI.

**Scenario.** A change deletes both orca_tag and orca_commit lines (or the whole pin block). orca-pin prints "SKIP -- configuration.toml states no [upstreams] orca_tag/orca_commit" and counts as PASS. The fragment, the literal sweep, the orca/ HEAD check and the flake check are all skipped. The pin gate has disappeared without a red row.

**Preconditions.** A commit that removes the pin keys.

**Evidence.** verify-orca-pin.mjs:135-137: `if (tag === undefined && commit === undefined) { return { skip: `${MANIFEST_REL} states no [upstreams] orca_tag/orca_commit, so there is no Orca pin to agree with`, fails, notes }; }`. Header line 11: "both keys absent SKIPs the whole row (a downstream with no Orca)".

**Suggested fix.** Make absence a FAIL in this tree. If a downstream with no Orca is genuinely supported, derive that from a flag such as orca-overlay/ or flake devShells.orca being absent, never from the pin alone. Add a plant for both keys removed.

**Verifier (CONFIRMED, low).** verify-orca-pin.mjs:135-137 returns skip when both keys are undefined, and the header (line 11) documents this as intended for a downstream with no Orca. Deleting both keys therefore gives SKIP/PASS, and no self-test plant covers it. generate.mjs:3152-3163 only validates keys when present, and fetch-orca.sh is not run in the hosted gate. The finding is correct, but it is a deliberate design choice and the removal is visible in the diff, so I rate it low. *Checked at:* scripts/verify-orca-pin.mjs:135-137; configuration.toml:161-162 holds the keys today

## harness-static-structure-09: orca-slotless-start trusts orcad's self-reported boundEndpoint for the loopback requirement, and can leak the terminal daemon when orcad fails before its ready line

- **Severity:** low
- **Verdict:** CONFIRMED
- **Location:** `scripts/verify-orca-slotless-start.mjs:97`

**What is wrong.** Loopback bind is proven only by orcad's own ready line, which is the subject. It is not compared with /proc/net/tcp or the listening sockets of the process tree. A defect that reports ws://127.0.0.1 while listening on 0.0.0.0 passes. The only independent control is the `--bind 127.0.0.1` argument this script itself passes in startOrcad.
On the failure path, probeOrcad catches a startOrcad rejection and sets run.child = e.child but run.ready stays null. The terminal daemon pid is only known from the ready line. stopOrcad is called with daemonPid null, so the daemon that orcad may have spawned is not stopped by this script. The driver's leak leg later names an orcad that is still in the row's session.
The row also SKIPs whenever an installed Orca exists in the real ~/.local/bin, even though orcad itself runs under liveEnv's scratch HOME.

**Scenario.** An Orca re-pin changes how --bind is honoured. Orcad reports 127.0.0.1 but binds all interfaces. The row stays green.

**Preconditions.** An orcad bind bug that misreports its endpoint, or a startup failure after the daemon starts.

**Evidence.** verify-orca-slotless-start.mjs:97 `if (!ready.boundEndpoint?.startsWith('ws://127.0.0.1:'))`; :224-228 `catch (e) { run.child = e.child ?? null; fails.push(...); return; }` followed by :198-200 `const daemonPid = run.ready?.daemonPid ?? null; ... stopOrcad(run.child, daemonPid)`.

**Suggested fix.** After the ready line, read /proc/net/tcp and /proc/net/tcp6 for the listener inode of the orcad pid and require every listening address to be 127.0.0.1 or ::1. On a startOrcad failure, scan the process tree for descendants (descendants() already exists) and stop them as well.

**Verifier (CONFIRMED, low).** checkReady (verify-orca-slotless-start.mjs:96-99) validates only the self-reported boundEndpoint; no /proc/net/tcp or socket check exists, so a misreporting orcad passes. probeOrcad's catch (line ~224) sets run.child but leaves run.ready null, so the finally block calls stopOrcad with daemonPid null. checkSurvivors would still report survivors if stopOrcad does not reap the tree, so the leak is partly detected rather than silent. The installed-Orca SKIP uses the real home (skipReason, ~line 133). Hardening gap only. *Checked at:* scripts/verify-orca-slotless-start.mjs:96-99, 198-200, 224-228; the self-test 'bind 0.0.0.0' at :359 exercises only the string check.

## harness-static-structure-14: orca-terminal-keys self-test copies orca/ source paths unconditionally, so it errors, not SKIPs, where the Orca half would SKIP

- **Severity:** low
- **Verdict:** CONFIRMED
- **Location:** `scripts/verify-orca-terminal-keys.mjs:863`

**What is wrong.** check() prints a named SKIP for the Orca half when orca/ is absent, and the header documents this. runSelfTest, however, does `cpSync(join(REPO_ROOT, rel), ...)` for the orcaTypes, orcaEffective, orcaDefs, orcaPane, InputPane, platform-defaults and chat-reveal paths with no existence guard. Without orca/ this throws ENOENT as an unhandled error, giving a red crash that is inconsistent with the sibling self-tests (pane-routes, editor-routes), which SKIP. In the hosted verify job, which has no orca/, the row is either red for an unrelated reason or has been tolerated. I could not run it to tell which.

**Scenario.** orca-terminal-keys-self-test is run on a checkout without orca/. It throws ENOENT from cpSync instead of printing a named SKIP.

**Preconditions.** No orca/ checkout.

**Evidence.** verify-orca-terminal-keys.mjs:863-866 `for (const rel of COPIED) { mkdirSync(...); cpSync(join(REPO_ROOT, rel), join(tmp, rel), { recursive: true, filter: ... }); }`; :911-912 the main path skips only on missing typescript.

**Suggested fix.** Guard the self-test with the same orca/ presence check and print a named SKIP, or fetch orca/ in CI (see the first finding). Make the row's policy consistent across sibling checks.

**Verifier (CONFIRMED, low).** runSelfTest (verify-orca-terminal-keys.mjs:~860) does cpSync on every COPIED entry unconditionally. COPIED (line 801) includes the orca/ source paths. orca/ has zero tracked files (git ls-files orca is empty), so a clean hosted checkout lacks it and cpSync throws ENOENT. The normal check() path SKIPs the Orca half at line 645, so the self-test is inconsistent with it. The result is a crash on an unrelated cause, not a missed defect. I did not determine whether the hosted verify job runs this row. *Checked at:* scripts/verify-orca-terminal-keys.mjs:801, 860-866; the skip logic at :645 applies only to check().

## harness-static-structure-10: verify-upstream-pins' new rebase-orca.yml rules ban a schedule key and defaults, but do not assert the trigger set or script-injection safety

- **Severity:** low
- **Verdict:** CONFIRMED
- **Location:** `scripts/verify-upstream-pins.mjs:277`

**What is wrong.** workflowFailures for rebase-orca.yml requires workflow_dispatch and workflow_call with tag and commit inputs. It also requires no default, no schedule key, no pin literal, and replay inside nix develop .#orca. It does not assert that those are the only triggers, and does not forbid `${{ inputs.* }}` inside a run: body. Today the workflow reads the inputs through env (REBASE_TAG, REBASE_COMMIT), which is safe, but nothing keeps it that way. Adding `pull_request`, `pull_request_target` or `push` to the on: block, or interpolating inputs directly into the shell, still passes. This workflow clones and builds a third-party tree.

**Scenario.** A contributor adds `pull_request_target:` to rebase-orca.yml, or changes the replay step to `bash scripts/rebase-orca.sh --tag ${{ inputs.tag }}`. The pin check stays green, and a fork pull request or a crafted input then reaches a build job that clones and runs third-party code.

**Preconditions.** A change to rebase-orca.yml's triggers or run steps.

**Evidence.** verify-upstream-pins.mjs:293-301 loops `for (const trigger of WORKFLOW_TRIGGERS)` checking presence only, then `if (directChild(lines, on, 'schedule') !== -1)`. Nothing enumerates the children of `on`. The d) literal check at ~:326 only scans for tag or commit literals.

**Suggested fix.** Require the set of direct children of `on` to equal {workflow_dispatch, workflow_call}, derived from the file and compared as set equality. Fail any `${{ inputs.` or `${{ github.event.` inside a run: body (allow only env: and with: contexts). Add one plant for each.

**Verifier (CONFIRMED, low).** workflowFailures checks that workflow_dispatch and workflow_call are present, that no schedule key exists, that inputs have no default, that commands run in nix shells, and that no tag or commit literals appear. It never enumerates the children of on:, and it does not scan run: bodies for inputs interpolation. Adding pull_request_target or interpolating ${{ inputs.* }} into a run step would pass. The path needs a maintainer-written change to the workflow, so this is a hardening gap, not an outsider-reachable flaw. *Checked at:* scripts/verify-upstream-pins.mjs:277-335 contains no trigger-set equality and no injection rule.

