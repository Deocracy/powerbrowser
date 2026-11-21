# Fix brief: H8-harness-other

Lane: harness. Items: 12. Files this group owns: `^scripts/` (pattern).

Item IDs: harness-other-03; 61-WR-01; 61-WR-02; 61-WR-03; harness-other-08; harness-other-11; harness-other-05; harness-other-09; harness-other-04; harness-other-06; harness-other-01; harness-other-07.

## harness-other-03: orca-repin workflow rule asserts nothing when bump-pr-orca or detect-orca is renamed or removed

- **Severity:** medium
- **Verdict:** CONFIRMED
- **Location:** `scripts/verify-workflows.mjs:1087`

**What is wrong.** The orca-repin rule enforces several App-token ordering invariants in release-train.yml: the token is minted only after the --replay-only replay and the explicit-path git add, no Orca code (pnpm, corepack, tsc, build-orca.sh) runs in the job that holds the token, the job only arms auto-merge, and TAG and COMMIT are re-checked before use. Every clause sits under `if (bump !== undefined && bump !== null)`, keyed on the literal job id. Rename the job (for example to bump-orca or orca-bump-pr), or move these steps into another job, and the rule is silent: no clause fails and nothing asserts that the bump job exists. The ORCA_CODE scan also covers bump-pr-orca alone, so a new job that mints the bot App token and runs pnpm on the fetched Orca tree is not checked by this rule. detect-orca has the same existence guard.

**Scenario.** A refactor renames bump-pr-orca to bump-orca and moves the 'Mint the bot App token' step above the 'Replay the pin move' step, which clones the tagged upstream Orca tree. That is the P68-35 exposure: the token exists while code from a possibly compromised upstream tag (actor f) is present in the job. scripts/verify-workflows.mjs passes and the workflows row stays green in --quick.

**Preconditions.** A workflow refactor renames or splits the Orca bump job.

**Evidence.** scripts/verify-workflows.mjs:1086-1087 `const bump = jobs['bump-pr-orca']; if (bump !== undefined && bump !== null) { ... mint < replay ... ORCA_CODE ... }` and :1112-1113 `const det = jobs['detect-orca']; if (det !== undefined && det !== null) {`. No else branch and no existence assertion. The orca-repin self-test plants edit only the existing job and never remove or rename it.

**Suggested fix.** Fail when release-train.yml has no bump-pr-orca or detect-orca job while scripts/fetch-orca.sh is tracked (derive the expectation from the tree). Better, identify the bump job structurally: any job that both mints the App token and runs rebase-orca.sh or touches orca/. Apply the ORCA_CODE scan to every job that mints an App token. Add plants that rename the job and require red.

**Verifier (CONFIRMED, medium).** In scripts/verify-workflows.mjs:1086-1087 every orca-repin clause (mint-after-replay/add ordering, ORCA_CODE scan, --auto, TAG/COMMIT re-check) sits inside `if (bump !== undefined && bump !== null)` keyed on the literal 'bump-pr-orca'. detect-orca has the same existence guard at :1112-1113. There is no else branch, and I found no job-set pinning for release-train.yml in the script. The header comment at :141 states the rule applies 'when bump-pr-orca exists', so skipping a missing job is deliberate. A rename or split therefore removes these assertions without a red. Generic rules (issues-write, app-token-inputs, dry-run-gate) still apply to a renamed job. None of them checks mint ordering against the Orca replay or Orca code execution in the token-holding job, so the P68-35 ordering is no longer checked. It needs a maintainer workflow edit, which goes through review. *Checked at:* scripts/verify-workflows.mjs:1086-1111 (bump-pr-orca guard, no else), :1112-1118 (detect-orca guard); release-train.yml:1060 job id; no existence assertion found

## 61-WR-01: Self-test has no plant for the table-refusal branches or several derivation throws it advertises

- **Severity:** warning (not refutation-checked)
- **Verdict:** REPORTED
- **Location:** `scripts/orca-browser-parity.mjs`

*Section WR-01 of `.planning/workstreams/orca/phases/61-spikes-for-pane-hosting-browser-parity-and-live-sharing/61-REVIEW.md`, verbatim:*

**File:** `scripts/orca-browser-parity.mjs:265-275` (branches at 84, 89, 134, 139, 161, 166, 168, 169)
**Issue:** The header (lines 25-34) and the full-tier registry comment (`scripts/verify-platform.sh:6743-6751`) say the check goes red in these cases:
- the header is not exact;
- an ability appears twice;
- a disposition is outside the five;
- any of sets (a) to (d) is empty or has moved.

The nine plants cover orphan row, missing row, empty automation, moved constant, moved automation file, renamed provider class, empty CLI specs, wrong users and i18n row. No plant exercises any of these:
- `table: header not found` (161);
- `row does not have 6 cells` (166);
- `duplicate row` (168);
- the disposition refusal (169);
- `rpc: ... not found` / `rpc: derived set is empty` (84, 89);
- `members: ... has no readonly browser* member` (134);
- the `cliNames.size === 0` half of line 139.

Any of these branches can be deleted or inverted and the self-test stays PASS. This breaks the CLAUDE.md verification rule: "Give a new check a `--self-test` that plants faults and requires each one to go red naming the drift."
**Fix:** Add plants to the `plants` array, for example:
```js
{ name: 'bad-header', naming: ['table', 'header not found'], table: (t) => t.replace('| tier |', '| level |') },
{ name: 'duplicate-row', naming: ['duplicate row for browser.fixtureAlpha'], table: (t) => t.replace(/\n$/, `\n${row('browser.fixtureAlpha', 'CLI, agent, orcad')}\n`) },
{ name: 'bad-disposition', naming: ['browser.fixtureBeta.gamma', 'disposition "CDP"'], table: (t) => t.replace(beta, beta.replace('| BiDi |', '| CDP |')) },
{ name: 'short-row', naming: ['does not have 6 cells'], table: (t) => t.replace(beta, beta.replace(' fixture |', '')) },
{ name: 'empty-rpc', naming: ['rpc', 'empty'], tree: edit(`${METHODS_REL}/fixture-core.ts`, /name:/g, 'x:') },
{ name: 'empty-members', naming: ['members', 'empty'], tree: edit(MEMBERS_REL, /readonly /g, '') },
{ name: 'no-cli-names', naming: ['cli', "no quoted 'browser.*' name"], tree: edit('src/cli/browser/fixture.ts', 'browser.fixtureAlpha', 'fixtureAlpha') },
```
Then update the plant count in the registry comment at `scripts/verify-platform.sh:3872-3874`.

## 61-WR-02: The "hermetic" self-test and the "pure" check() read the live repo's orca-overlay/files for every orcaRoot

- **Severity:** warning (not refutation-checked)
- **Verdict:** REPORTED
- **Location:** `scripts/orca-browser-parity.mjs`

*Section WR-02 of `.planning/workstreams/orca/phases/61-spikes-for-pane-hosting-browser-parity-and-live-sharing/61-REVIEW.md`, verbatim:*

**File:** `scripts/orca-browser-parity.mjs:93, 103, 175, 241-242` (claim at 37)
**Issue:** `OVERLAY_FILES` is fixed to `REPO_ROOT/orca-overlay/files` (93). `quotedNames` consults it for any `orcaRoot`, including the mkdtemp fixture (103). The self-test's overlay control at line 242 only works because the tracked file `orca-overlay/files/src/renderer/src/pb/browser-host/pb-browser-host.ts` exists in the real repo. Two consequences follow:
- A rename or removal of that overlay file turns the quick `orca-browser-parity-self-test` row red with the misleading message "the clean fixture is not green (row browser.fixtureAlpha lists users [CLI, agent, orcad], the Orca tree gives [CLI, agent, orcad, renderer])". Nothing in that change touched this check.
- The docstrings ("quick and hermetic", line 37; "Pure over its inputs so the self-test can plant faults", line 175; and the registry comment at `verify-platform.sh:3869-3870`) are false.

The same hidden input reaches `scripts/verify-orca-browser-abilities.mjs`, which calls `deriveAll` on its own fixture tree (line 280).
**Fix:** Make the overlay root an input and have the self-test build its own:
```js
export function deriveAll(orcaRoot, overlayRoot = join(REPO_ROOT, 'orca-overlay', 'files')) { ... quotedNames(orcaRoot, rel, overlayRoot) ... }
export function check(orcaRoot, dispositionsText, overlayRoot) { ... deriveAll(orcaRoot, overlayRoot) ... }
// self-test:
const overlay = join(tmp, 'overlay');
mkdirSync(join(overlay, 'src/renderer/src/pb/browser-host'), { recursive: true });
writeFileSync(join(overlay, 'src/renderer/src/pb/browser-host/pb-browser-host.ts'), '');
check(root, table, overlay);
```

## 61-WR-03: Test-support exclusion misses Orca's real naming conventions, so a re-pin can record test code as a user or an ability

- **Severity:** warning (not refutation-checked)
- **Verdict:** REPORTED
- **Location:** `scripts/orca-browser-parity.mjs`

*Section WR-03 of `.planning/workstreams/orca/phases/61-spikes-for-pane-hosting-browser-parity-and-live-sharing/61-REVIEW.md`, verbatim:*

**File:** `scripts/orca-browser-parity.mjs:71, 74-79` (used by 86 and 102)
**Issue:** `NOT_SOURCE` excludes only names that end in `.test.ts(x)` or `.test-fixture.ts(x)`, with a dot before `test`. At the pin, the scanned trees hold about 40 non-excluded test-support files that use hyphenated or directory conventions. Examples:
- RPC tree, read by `deriveRpc`: `src/main/runtime/rpc/methods/structured-agent-session-rest-contract-test-fixture.ts`, `.../orchestration/rpc-test-harness.ts`, `.../orchestration/worker-start-card-contract-test-fixture.ts`;
- renderer users tree: `src/renderer/src/runtime/web-runtime-session-test-harness.ts`, `.../web-runtime-browser-creation-placement-test-rig.ts`, `.../stream-remote/remote-browser-stream-lifecycle-test-harness.ts`;
- main users tree: `src/main/browser/browser-manager-test-harness.ts`, `src/main/browser/__mocks__/browser-session-registry-persistence-fixture.ts`, and about 25 more `*-fixture.ts` / `*-test-harness.ts` / `*-test-double.ts` files;
- CLI and orcad users trees: `src/cli/index-test-harness.ts`, `src/cli/test-fixtures.ts`, `src/main/orcad/*-fixture.ts`.

The renderer harnesses already carry `'browser.tabCreate'` and `'browser.tabShow'`. Today production renderer files also carry them, so no row is affected; I checked every tree and found no ability whose only carrier is a test-support file. The check exists to stay correct across re-pins. After a re-pin where a harness is the only carrier, the derivation demands a `renderer`/`main`/`CLI` user that no product code has. A `name: 'browser.*'` in a hyphen-named fixture under `methods/` becomes an ability that the table must then carry. The plan's own wording of the intent ("except *.test.ts and *.test-fixture.ts") is matched literally but not in purpose.
**Fix:** Widen the filter to Orca's conventions and add a self-test plant for each form:
```js
const NOT_SOURCE = /(?:[.-](?:test|spec)(?:-[a-z]+)*|[.-](?:test-)?(?:fixtures?|harness|rig|double|fake|mock)s?)\.tsx?$/;
const NOT_SOURCE_DIR = /(^|\/)(__mocks__|__fixtures__|__tests__)(\/|$)/;
// in sourceFiles: && !NOT_SOURCE_DIR.test(relative(dir, e.parentPath))
```
Add fixture plants such as `src/renderer/src/x-test-harness.ts` carrying `'browser.fixtureAlpha'`, and `${METHODS_REL}/x-test-fixture.ts` carrying `name: 'browser.fixtureHarnessOnly'`. Each must add no user and no ability.

## Info

## harness-other-08: Permanent boundary gate now admits Cc[ and Ci. in the actor child by File:Line alone; the XPCOM contract on a catalogued line is not pinned

- **Severity:** low
- **Verdict:** CONFIRMED
- **Location:** `scripts/check-internals-boundary.sh:118`

**What is wrong.** This is a new exemption in a permanent gate. The reason is in the code (A2, P66-13: nsITextInputProcessor and nsIConsoleAPIStorage). The waiver is wider than that reason. catalogue_has_row matches only a table row whose File:Line cell equals GroupActorChild.sys.mjs:<n>, so any XPCOM contract or interface on a catalogued line is admitted. Today line 675 creates a system principal in the content process (Cc["@mozilla.org/systemprincipal;1"].createInstance(Ci.nsIPrincipal)), in the actor that agent-driven pages run beside. A later edit that changes the contract on lines 293, 674 or 675 without moving them stays green in the boundary scan and in ng-040, which checks the line and the method name, not the contract. The new self-test plant for Services. uses an uncatalogued line, so it does not prove the comment's claim that a Services. line is an offense 'whatever the catalogue says'.

**Scenario.** An edit on line 674 replaces @mozilla.org/consoleAPI-storage;1 with another privileged component (for example a process or file service) inside actorCreated. The line number and method stay the same, the catalogue row still matches, and internals-boundary, internals-catalogue and ng-040 all stay PASS.

**Preconditions.** A later edit changes a catalogued child line in place.

**Evidence.** scripts/check-internals-boundary.sh:118 `ACTOR_CHILD_PATTERNS=('wrappedJSObject' 'JSWindowActorChild' 'Cc[' 'Ci.')`; :131-133 `catalogue_has_row() { grep -Eq "^\|[^|]*\| \`${2//./\\.}:${3}\` \|" "$1"; }`. powerbrowser/shell/GroupActorChild.sys.mjs:675 `const principal = Cc["@mozilla.org/systemprincipal;1"].createInstance(Ci.nsIPrincipal);`. INTERNAL-APIS.md:446-449 rows keyed only by line.

**Suggested fix.** For Cc[/Ci. waivers in the actor child, require the row's first cell to name the exact contract ID and interface found on the line, and compare them. Add a plant that keeps the line number but swaps the contract, and one that catalogues a Services. line and requires red.

**Verifier (CONFIRMED, low).** In scripts/check-internals-boundary.sh, ACTOR_CHILD_PATTERNS includes 'Cc[' and 'Ci.' (:118). The waiver at :204-207 needs only the actor-child file, an allowed pattern, and a catalogue row whose File:Line cell equals GroupActorChild.sys.mjs:<n> (catalogue_has_row, :131-133). The contract string is not compared. INTERNAL-APIS.md:446-449 key the rows on lines 293, 674 and 675, whose current contents match the finding. ng-040 does not pin the contract either. lineHolds() (verify-ng-040-internals-catalogue-lines.mjs:69-83) accepts a line that contains any one of the row's backticked tokens, and every row lists `Cc`, so swapping @mozilla.org/consoleAPI-storage;1 for another component on line 674 inside actorCreated stays green in internals-boundary, internals-catalogue and ng-040. The point about the self-test is also correct: the Services. plant (:462) uses an uncatalogued line 2. The claim that Services. is refused on any line does hold, but by construction, because Services. is not in ACTOR_CHILD_PATTERNS, so is_actor_child_pattern fails whatever the catalogue holds. It needs an in-place developer edit to a reviewed shell file, so I rated it hardening. *Checked at:* scripts/check-internals-boundary.sh:118, 131-133, 204-207, 462; powerbrowser/INTERNAL-APIS.md:446-449; scripts/verify-ng-040-internals-catalogue-lines.mjs:75 (any token match suffices)

## harness-other-11: Snapshot fixture generator runs the pinned agent-browser with the developer's full environment and HOME config

- **Severity:** low
- **Verdict:** CONFIRMED
- **Location:** `scripts/gen-orca-snapshot-fixtures.mjs:93`

**What is wrong.** The generator runs orca/node_modules/agent-browser (third-party, from the Orca pin) with { ...process.env }, so every AGENT_BROWSER_* variable in the developer's shell (PROFILE, AUTO_CONNECT, INIT_SCRIPTS, EXTENSIONS, PROXY, CONFIG) and ~/.agent-browser/config.json under the real HOME apply to the run. The committed reference fixtures, which verify-orca-browser-snapshot-live compares PowerBrowser's snapshot against, then depend on ambient configuration. A set AGENT_BROWSER_AUTO_CONNECT or AGENT_BROWSER_PROFILE drives the developer's real browser profile, not a fresh Chromium.

**Scenario.** The developer's shell exports AGENT_BROWSER_INIT_SCRIPTS (or config.json sets one) that injects DOM. The regenerated <page>.json fixtures carry the injected nodes, they are committed, and the snapshot parity row compares against a format no clean agent-browser produces. Alternatively, AGENT_BROWSER_AUTO_CONNECT=1 attaches to the user's running Chrome and opens the fixture pages in it.

**Preconditions.** A developer has agent-browser configuration in the environment or HOME.

**Evidence.** scripts/gen-orca-snapshot-fixtures.mjs:93 `const env = { ...process.env, AGENT_BROWSER_EXECUTABLE_PATH: chromium };` passed to execFile(process.execPath, [AB_LAUNCHER, '--session', session, ...]) at :97. orca/node_modules/agent-browser/README.md documents AGENT_BROWSER_PROFILE, AGENT_BROWSER_AUTO_CONNECT, AGENT_BROWSER_INIT_SCRIPTS and .agent-browser/config.json.

**Suggested fix.** Build the child env from an allowlist (PATH, plus a scratch HOME and XDG dirs from mkdtemp), drop every inherited AGENT_BROWSER_* variable except EXECUTABLE_PATH, and remove the scratch HOME afterwards.

**Verifier (CONFIRMED, low).** scripts/gen-orca-snapshot-fixtures.mjs:93 builds env = { ...process.env, AGENT_BROWSER_EXECUTABLE_PATH: chromium } and passes it to execFile(process.execPath, [AB_LAUNCHER, '--session', session, ...]) at :97. HOME is not overridden, no --config is passed, and cwd is inherited. The pinned agent-browser README documents that it reads AGENT_BROWSER_INIT_SCRIPTS (README:550, :1053), AGENT_BROWSER_PROFILE (:1048), AGENT_BROWSER_AUTO_CONNECT (:1078), AGENT_BROWSER_CONFIG (:1097) and ~/.agent-browser/config.json as user-level defaults (:1175). Ambient configuration therefore reaches the runs that produce the committed scripts/fixtures/orca-snapshot/<page>.json references. The actor is the developer's own shell and HOME, not an outside attacker. The main effect is fixture reproducibility, not a privilege boundary. A contaminated fixture would most likely make verify-orca-browser-snapshot-live fail with a false red rather than pass with a false green, though that depends on what the injection changes. One step cannot be settled statically: whether AUTO_CONNECT takes precedence over the explicit AGENT_BROWSER_EXECUTABLE_PATH and attaches to the user's running Chrome. The INIT_SCRIPTS and config.json paths apply as documented. *Checked at:* scripts/gen-orca-snapshot-fixtures.mjs:93 (environment passed through unchanged), :97 (execFile with that environment, no --config, no HOME override); orca/node_modules/agent-browser/README.md:550, :1048, :1053, :1078, :1097, :1175

## harness-other-05: Quick-tier checks for bundled extensions, the bundled XPI and Orca licences skip their substantive legs in CI and still exit PASS

- **Severity:** low
- **Verdict:** CONFIRMED
- **Location:** `scripts/verify-bundled-xpi.mjs:212`

**What is wrong.** These scripts print one SKIP line for each leg whose input is not on disk, then exit 0, and the driver counts exit 0 as PASS. verify.yml runs --quick over a built Theia with no fetched orca/ and no .mozbuild/bundled-xpi cache. In that setting: (1) bundled-xpi skips the cached XPI's sha256, manifest id and version, signature presence, and the D-85 endpoint leg (every default-on uBlock filter-list host must have an allow row); (2) bundled-extensions skips the Orca pnpm-lock equality leg (verify-bundled-extensions.mjs:120) and possibly the LICENSE quotation leg (:126); (3) licence-allowlist skips the per-package Orca licence rule (verify-licence-allowlist.mjs:502), the bundled XPI licence line (:303) and the LICENSE digests of absent trees (:115). Each SKIP is named, but in --quick and CI these legs never go red. stage-bundled-xpi.sh re-checks sha256 when it stages, and rebase-orca.sh runs licence-allowlist with SKIP treated as red, so integrity has other guards. The D-85 endpoint-allowlist leg and the SDK lock-equality leg have none in CI.

**Scenario.** A uBlock pin bump adds a new default-on filter-list host. powerbrowser/endpoint-allowlist.json gets no allow row, and the shipped browser contacts an unlisted host with no user action. CI --quick prints 'verify-bundled-xpi: SKIP -- uBlock0@raymondhill.net: no cached ...' and 'PASS -- the pins are well formed'. The gap appears only on a developer host that has staged the XPI.

**Preconditions.** Runs where the cache, orca/ or the built extension copy is absent, which is the CI --quick configuration.

**Evidence.** scripts/verify-bundled-xpi.mjs:212-214 `if (!existsSync(xpi)) { skips.push(...); continue; }` and report() at :590-597 exits 0 with skips. scripts/verify-bundled-extensions.mjs:120 `if (orca === null) skips.push(...)`. scripts/verify-licence-allowlist.mjs:502 `if (d.skip) pr.skips.push(...)`. .github/workflows/verify.yml:83-93 builds Theia and runs --quick with no fetch-orca or stage-bundled-xpi step.

**Suggested fix.** Either stage the pinned XPI in verify.yml (the download is sha256-pinned) so the cached legs run in CI, or give a SKIP its own exit code that the driver reports as SKIP, and make --gate refuse a SKIP for rows whose input CI can produce. At minimum, derive the endpoint leg's host set from a tracked copy of assets.json, so it does not depend on the cache.

**Verifier (CONFIRMED, low).** In scripts/verify-bundled-xpi.mjs:210-214, staticLeg() skips the digest, manifest, signature and D-85 endpoint legs whenever .mozbuild/bundled-xpi/<id>-<version>.xpi is absent. report() at :590-597 exits 0 when there are only skips. .github/workflows/verify.yml:79-93 fetches upstream, builds Theia and runs --quick, with no fetch-orca or stage-bundled-xpi step. release.yml stages the XPI inside package-linux.sh, but its packaged-rows loop (release.yml:207-213) does not run bundled-xpi, and the bundled-xpi-packaged leg (checkPackagedDir, :119-132) checks file set and sha256 only, not endpoints. So the endpoint-allowlist leg runs only on a host that has staged the cache. verify-bundled-extensions.mjs:120 and :126 and verify-licence-allowlist.mjs:502 skip in the same way when orca/ is absent. Each skip is named in the output. The pin bump that triggers the scenario normally happens on a developer host that downloads and stages the XPI, and rebase-orca.sh treats a SKIP as red. That keeps this at hardening level. *Checked at:* scripts/verify-bundled-xpi.mjs:212-214, :590-597; .github/workflows/verify.yml:79-93; release.yml:207-213 label list lacks bundled-xpi; scripts/verify-bundled-extensions.mjs:120,126; scripts/verify-licence-allowlist.mjs:502

## harness-other-09: Windows native check exempts every i386 .exe outside orca/, not just the NSIS helper

- **Severity:** low
- **Verdict:** CONFIRMED
- **Location:** `scripts/verify-package-target-natives.mjs:83`

**What is wrong.** The comment justifies one exception, the NSIS uninstall/helper.exe, which is 32-bit by design. isInstallerHelper instead exempts any .exe outside orca/ whose PE machine is 0x014c, other than node.exe and rg.exe, wherever it sits in the stage. No self-test case shows that an i386 .exe at another path (for example under the Theia sidecar) still goes red, or that helper.exe is exempted (a positive control).

**Scenario.** The Windows sidecar stage picks up a 32-bit tool, for example sidecar/lib/foo.exe built for the wrong arch. package-target-natives for win64 filters it out as an 'installer helper' and passes, although the comment's rule is that only the NSIS helper may be i386.

**Preconditions.** A wrong-arch .exe enters the Windows stage outside orca/.

**Evidence.** scripts/verify-package-target-natives.mjs:83-88 `function isInstallerHelper(rel, head) { if (rel.startsWith('orca/') || !rel.endsWith('.exe') || ['node.exe', 'rg.exe'].includes(basename(rel))) return false; ... return ... head.readUInt16LE(e + 4) === 0x014c; }` and :149 `listNatives(root).filter((p) => !(spec.pe && isInstallerHelper(relOf(p), ...)))`.

**Suggested fix.** Limit the exemption to the NSIS helper's actual staged path (derive it from the NSIS script or package-windows.sh). Add plants: an i386 .exe elsewhere outside orca/ must be red, and helper.exe at its path must be green.

**Verifier (CONFIRMED, low).** isInstallerHelper (scripts/verify-package-target-natives.mjs:83-88) returns true for any path outside orca/ that ends in .exe, is not named node.exe or rg.exe, and has PE machine 0x014c. The path is never compared to uninstall/helper.exe. checkTree (:150) drops every such file from the native universe for a PE target, so an i386 sidecar/lib/foo.exe in a win64 stage is never examined and the row can stay green. The comment at :82 names uninstall/helper.exe. The header comment at :15-17 states the wider rule, so the code follows its own header, but nothing ties the exemption to the helper's location. One part of the finding is wrong: a positive control does exist. At :332-341 the self-test plants exe-names/uninstall-helper.exe as i386 and requires that it is not examined. No negative control exists, meaning no case where an i386 .exe outside orca/ under another name must go red. The i386 plants are i386.node at :309 (not .exe) and orca/out/orcad/helper.exe at :366 (inside orca/). The self-test would therefore stay green if the exemption were widened further. This is a hardening gap in an architecture check, not a security boundary. *Checked at:* scripts/verify-package-target-natives.mjs:83-88 (no path check beyond the orca/ prefix), :150 (filter), :332-341 (positive control only, under the name uninstall-helper.exe), :309 and :366 (the i386 negatives are not a non-orca .exe)

## harness-other-04: Release licence-rulings guard is checked only for position: continue-on-error or '|| true' on it stays green, and the Windows guard is not checked at all

- **Severity:** low
- **Verdict:** CONFIRMED
- **Location:** `scripts/verify-release-shape.mjs:560`

**What is wrong.** Rule 12 (P68-21: no release carries Orca's closure while an owner licence ruling is pending) checks only that a step whose run text contains `scripts/verify-licence-allowlist.mjs --rulings` comes before the build-orca.sh step in build-linux. The rulings step is not passed through failOpenFaults(), which the script applies to the SHA gate, the key gate and the purge step. A `continue-on-error: true`, an `|| true`, a `set +e` or a changed `if:` on it defeats the guard with rule 12 still green. The same guard in build-windows (release.yml:576-582) is checked by no rule in verify-release-shape.mjs or verify-build-windows-shape.mjs, because neither file mentions 'rulings' outside rule 12's build-linux scope.

**Scenario.** An edit adds `continue-on-error: true` under 'Refuse to build while an Orca licence ruling is pending (P68-21)' in release.yml build-linux, so builds go ahead while the bundled SDK's terms check is pending. Or it deletes the build-windows copy of the step. release-shape and build-windows-shape both stay PASS, and the release ships Orca's closure with a ruling open.

**Preconditions.** An edit to release.yml weakens or removes the guard step.

**Evidence.** scripts/verify-release-shape.mjs:560 `const rulingsAt = at(/\bscripts\/verify-licence-allowlist\.mjs --rulings\b/);` :566 `if (rulingsAt.length === 0 || rulingsAt[0] > orcaAt[0]) fail(...)`. There is no failOpenFaults(buildSteps[rulingsAt[0]]). Compare :263 and :281, which apply failOpenFaults to the gate steps. grep -n rulings scripts/verify-build-windows-shape.mjs returns nothing; release.yml:582 holds the Windows copy.

**Suggested fix.** Apply failOpenFaults(step, "steps.key_gate.outputs.build == 'true'") to the rulings step. Add the same position and fail-open rule for build-windows in verify-build-windows-shape.mjs. Add plants for continue-on-error, '|| true' and removal of the Windows guard.

**Verifier (CONFIRMED, low).** Partly confirmed. For build-linux, rule 12 (scripts/verify-release-shape.mjs:560-566) checks only that the --rulings step exists and comes before build-orca.sh. That step is never passed to failOpenFaults, so `continue-on-error: true`, `|| true` or `set +e` on it stays green. A changed `if:` is caught, contrary to the claim: every build-linux step after key_gate must carry exactly KEY_IF (verify-release-shape.mjs:284-288). For build-windows, weakening the step is also caught: verify-build-windows-shape.mjs:343-349 runs failOpenFaults over every build-windows step (continue-on-error, `|| true`, `set +e`, a wrong `if:`). Only deleting the Windows rulings step (release.yml:576-582) goes unchecked, because no rule requires a --rulings step in build-windows. The remaining gaps are continue-on-error, `|| true` or `set +e` on the Linux step, and deletion of the Windows step. The effect is a licence-policy gate that can be bypassed by an in-repo workflow edit. It is not a security boundary, so I rated it low. *Checked at:* Gaps: scripts/verify-release-shape.mjs:560-566 (no failOpenFaults on rulings step); no Windows --rulings presence rule. Guards: verify-release-shape.mjs:284-288 (if: pinned on build-linux steps), scripts/verify-build-windows-shape.mjs:343-349 (fail-open over every build-windows step)

## harness-other-06: Orca failure-page copy scope SKIPs, and the row passes, if orca-panes' failure/ directory moves

- **Severity:** low
- **Verdict:** CONFIRMED
- **Location:** `scripts/verify-shell-error-copy.mjs:1929`

**What is wrong.** The 67-03 Orca hosting copy check (the user-facing copy rule: no internal identifier, names PowerBrowser, each sentence names exactly the buttons it renders) runs only while theia/extensions/orca-panes/src/browser/failure/ exists. If that directory is renamed or moved, both the main run and the self-test print a SKIP line and the row passes. The reinstall-copy scope added in the same diff fails when its sources are missing, so the two scopes are inconsistent. The Orca scope is now in the tree, so a missing directory is drift, not a lane that has not merged yet.

**Scenario.** A refactor moves the failure page to orca-panes/src/browser/errors/ and an ad-hoc 'Orca failed (ORCAD_START_FAILED)' string is added there. shell-error-copy-no-internals prints 'Orca scope SKIP -- ... is absent' and PASS. The self-test prints '  SKIP  Orca copy faults' and returns true.

**Preconditions.** The failure/ directory is renamed or moved.

**Evidence.** scripts/verify-shell-error-copy.mjs:1927-1929 `const orcaSources = readOrcaSources(); if (!orcaSources) { console.log(`verify-shell-error-copy: Orca scope SKIP -- ${ORCA_FAILURE_DIR_REL} is absent`); }`. :1500-1503 in runOrcaCopySelfTest: `if (!clean) { console.log(`  SKIP  Orca copy faults ...`); return true; }`. Contrast :1937-1939 `if (!bundledSources) { fail(...) }`.

**Suggested fix.** Make the absent failure/ directory a FAIL whenever theia/extensions/orca-panes exists, as the reinstall scope already does. Or locate the copy table by the ORCA_FAILURE_COPY export across orca-panes/src, not by a fixed path.

**Verifier (CONFIRMED, low).** readOrcaSources() returns null when readdirSync of theia/extensions/orca-panes/src/browser/failure/ throws (scripts/verify-shell-error-copy.mjs:1380-1386). The main run then only prints 'Orca scope SKIP' (:1927-1929). runOrcaCopySelfTest returns true with a SKIP line (:1500-1503). The bundled scope fails when its sources are missing (:1937-1939), so the two scopes behave differently as the finding says. The move itself does not go unnoticed elsewhere: verify-orca-offer-file.mjs hard-codes failure/orca-failure-copy.ts (:43). Its read() returns null, importTs('') yields no ORCA_CLIENT_REASON_CLASS, and fail('reasons', ...) turns that --quick row red (:187-189). That red forces attention to the move. Once someone repoints offer-file, though, shell-error-copy keeps skipping and a new identifier-bearing string in the moved directory is not checked. *Checked at:* scripts/verify-shell-error-copy.mjs:1380-1386, 1927-1929, 1500-1503 vs 1937-1939; partial signal: scripts/verify-orca-offer-file.mjs:43,187-189 goes red if the copy file moves

## harness-other-01: Privileged agent kinds (webTabAgent, webTabAgentStop) are fenced only inside three extension directories; senders in orca-panes, modes or orca-agents are never read

- **Severity:** low
- **Verdict:** CONFIRMED
- **Location:** `scripts/verify-web-tab-bridge.mjs:795`

**What is wrong.** The privileged-kind rule for the two v1.7 agent kinds claims that webTabAgent is sent only from orca-browser-frontend-module.ts and that webTabAgentStop (WebTabWidget.agentStop()) is called only from the chrome bar's Stop click handler (P66-21). Both rules run only over the files readSources() loads: chrome-bar/src/browser, tab-uris/src/browser, orca-browser/src and a few named files. theia/extensions/orca-panes (orca-pane-observer.ts, orca-pane-routes.ts) and theia/extensions/modes (group-model.ts, setups-service.ts, organising-widget.ts) already import WebTabWidget and can reach its public request() channel, and orca-agents is next to them. None of these are scanned, so the fence has a blind spot exactly where a second sender is most likely to appear.

**Scenario.** A later change in orca-panes/src/browser/orca-pane-routes.ts calls tab.agentStop() from a route handler, or sends channel.request({ kind: 'webTabAgent', tabId, method: 'browser.eval', params }) when a pane opens. The agent-control Stop and the agent automation entry point can then be driven without the user's click or outside the orca-browser dispatcher. gui02-web-tab-bridge stays PASS, because neither file is in src, so neither the 'is sent from ... outside its owning file' rule nor the 'is called outside the chrome-bar event-handler tree' rule sees it.

**Preconditions.** A frontend extension outside chrome-bar, tab-uris and orca-browser obtains a WebTabWidget, which orca-panes and modes already do.

**Evidence.** scripts/verify-web-tab-bridge.mjs:795-799 `const dirs = [CHROME_BAR_DIR, TAB_URIS_DIR]; if (existsSync(join(REPO_ROOT, ORCA_BROWSER_DIR))) { dirs.push(ORCA_BROWSER_DIR); }`; :287 `function isFrontendFile(file) { return file.startsWith(`${CHROME_BAR_DIR}/`) || file.startsWith(`${TAB_URIS_DIR}/`) || file.startsWith(`${ORCA_BROWSER_DIR}/`); }`; :702 the method-call fence iterates `Object.entries(src)`, which holds only those files. grep shows WebTabWidget imported in theia/extensions/orca-panes/src/browser/orca-pane-observer.ts, orca-pane-routes.ts and theia/extensions/modes/src/browser/{group-model,setups-service,organising-widget}.ts.

**Suggested fix.** For the sender and caller fences, read every .ts/.tsx under theia/extensions/*/src (derive the set from the directory listing, not a hand-kept list). Add plants that put a webTabAgent literal and an agentStop( call in an orca-panes fixture file and require each to go red.

**Verifier (CONFIRMED, low).** The scan scope is as described. readSources() (scripts/verify-web-tab-bridge.mjs:792-807) loads the named files plus chrome-bar/src/browser, tab-uris/src/browser and orca-browser/src (when that directory exists). The literal-sender fence (:686-695) iterates only isFrontendFile() files (:287-289). The method-call fence for webTabAgentStop (:702-709) iterates Object.entries(src), which holds the same set. From the modes extension only group-actor-client.ts is loaded (CLIENT, :43). modes/src/browser/group-model.ts, setups-service.ts and organising-widget.ts import WebTabWidget (group-model.ts:30) and are never read, so a tab.agentStop() call or a kind: 'webTabAgent' literal placed there would leave gui02-web-tab-bridge green. No other check fences these senders across the tree: verify-orca-browser-tab-scope only reads the chrome arms. One part of the claim is wrong: orca-panes does not import WebTabWidget or WebTabChannel (grep finds only ORCA_PANE_FACTORY_ID and ProfileStorageService imported from tab-uris), and orca-agents does not import them either. The blind spot that exists today is therefore modes. I lowered the severity because a sender in any of these directories is a reviewed in-tree frontend edit inside the same trusted Theia frame. No attacker-controlled input reaches it. This is a gap in the fence's coverage, not a boundary crossing. *Checked at:* scripts/verify-web-tab-bridge.mjs:795-799 (dirs), :287-289 (isFrontendFile), :702 (Object.entries(src)); theia/extensions/modes/src/browser/group-model.ts:30 imports WebTabWidget; theia/extensions/orca-panes/src has no WebTabWidget import (claim misstated there)

## harness-other-07: Agent-contract exemption in the web-tab bridge check reactivates silently if orca-browser/src disappears

- **Severity:** low
- **Verdict:** CONFIRMED
- **Location:** `scripts/verify-web-tab-bridge.mjs:58`

**What is wrong.** Lane-merge scaffolding that is still in place: when no file under theia/extensions/orca-browser/src exists, the kinds parity, push parity and privileged-kind rules leave out webTabAgent, webTabAgentStop and agentControlChanged. orca-browser is merged now, so the exemption is off. If the extension is renamed or moved, chrome's privileged webTabAgent arm, which drives a page on an agent's behalf, drops out of the parity and owner-file fences again, and the only signal is a note on the PASS line.

**Scenario.** orca-browser is renamed to orca-agent-browser. PowerBrowserAPI keeps serving case "webTabAgent", and its frontend sender is now in a directory that is not scanned. The check prints PASS with '; agent contract SKIP (lane p66-02 not merged)' instead of going red on the moved owner file.

**Preconditions.** orca-browser/src is moved or renamed.

**Evidence.** scripts/verify-web-tab-bridge.mjs:58 `const agentContractSkipped = src => !Object.keys(src).some(file => file.startsWith(`${ORCA_BROWSER_DIR}/`));` :358 `const skipped = agentContractSkipped(raw) ? new Set(AGENT_CONTRACT_NAMES) : new Set();` :668 `const privileged = classedPrivileged.filter(kind => !skipped.has(kind));`

**Suggested fix.** Remove the lane-merge skip now that orca-browser is merged. A missing orca-browser source while PowerBrowserAPI serves webTabAgent should be a FAIL naming the owner file.

**Verifier (CONFIRMED, low).** agentContractSkipped (scripts/verify-web-tab-bridge.mjs:58) is true whenever no loaded file starts with orca-browser/src/. readSources() adds that directory only if existsSync is true (:796-798). A rename therefore sets skipped to AGENT_CONTRACT_NAMES (:358). The privileged-kind rule then drops webTabAgent and webTabAgentStop (:668), and push parity filters agentControlChanged (:583). The PASS line only carries the skip note (:1319). The rename is not silent overall: verify-orca-browser-abilities.mjs reads REL.abilities with an unguarded readFileSync (:266, :269, outside the try block), which throws ENOENT and turns the orca-browser-abilities --quick row red whenever typescript is installed, as it is in CI. After that script's paths are updated, the bridge exemption stays active without a red, which is the gap the finding describes. *Checked at:* scripts/verify-web-tab-bridge.mjs:58, 358, 583, 668, 796-798, 1319; partial signal: scripts/verify-orca-browser-abilities.mjs:266-269 crashes red when orca-browser/src moves

