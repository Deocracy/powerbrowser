---
phase: 61-spikes-for-pane-hosting-browser-parity-and-live-sharing
reviewed: 2026-11-20T22:38:34Z
depth: deep
files_reviewed: 1
files_reviewed_list:
  - scripts/orca-browser-parity.mjs
findings:
  critical: 0
  warning: 3
  info: 7
  total: 10
  necessity: 1
status: issues_found
---

# Phase 61: Code Review Report

**Reviewed:** 2026-11-20T22:38:34Z
**Depth:** deep
**Files Reviewed:** 1
**Status:** issues_found

## Summary

Scope is one product file, `scripts/orca-browser-parity.mjs`, reviewed at HEAD (e0c19c54). That includes the 66-06 overlay-copy fix (0f3e6434). The review traced the file across module boundaries:

- its consumer `scripts/verify-orca-browser-abilities.mjs`, which imports `deriveAll` and `parseDispositions`;
- its two registry rows in `scripts/verify-platform.sh`, at lines 3869-3875 and 6743-6752;
- the overlay copy step in `scripts/build-orca.sh`, at lines 117-142;
- the pinned Orca tree at `orca/`, commit 965978bc, which equals `configuration.toml` `orca_commit`.

The pin check is owned by `orca-pin` (`scripts/verify-orca-pin.mjs` clause f), so no finding is raised for a stale `orca/` checkout.

I re-derived the sets at the pin statically, with grep only and without running the script:

- 92 `browser.*` RPC names from 8 production files, matching the 92 table rows;
- the automation constant body holds only string literals;
- no seam patch adds a `browser.*` literal under a users tree;
- no Orca test-support file is currently the only carrier of any ability in any users tree.

The script therefore passes for the right reasons at today's pin. The defects are these:

- the self-test does not cover the refusal branches that the header and the registry comment advertise;
- the "hermetic" self-test and the "pure" `check()` read a tracked file outside the fixture;
- the test-support exclusion misses the naming conventions Orca actually uses, so a later re-pin can record test code as a product user or an ability.

Owner decision relied on: the `agent` component equal to `CLI` is ratified by 61-02-PLAN Task 2 action (1) ("agent+CLI when the name appears under src/cli/"). The widening of `main` to `src/main/browser/` is a recorded deviation (61-02-SUMMARY, Deviations item 3). Neither is a defect.

## Warnings

### WR-01: Self-test has no plant for the table-refusal branches or several derivation throws it advertises

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

### WR-02: The "hermetic" self-test and the "pure" check() read the live repo's orca-overlay/files for every orcaRoot

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

### WR-03: Test-support exclusion misses Orca's real naming conventions, so a re-pin can record test code as a user or an ability

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

### IN-01: memberOf throws on an ability with an empty dotted segment

**File:** `scripts/orca-browser-parity.mjs:70, 114, 199-201`
**Issue:** `ABILITY` (`browser\.[A-Za-z0-9.]+`) accepts `browser.x.` or `browser..y`. `memberOf` then evaluates `p[0].toUpperCase()` on an empty part and throws a TypeError. That happens in `check()` outside any try, so the run dies with a stack trace instead of a named FAIL.
**Fix:** Tighten the pattern to `browser(?:\.[A-Za-z0-9]+)+`, or guard with `(p ? p[0].toUpperCase() + p.slice(1) : p)`.

### IN-02: Source regexes count commented-out entries, skip non-literal entries silently, and scan members past the class end

**File:** `scripts/orca-browser-parity.mjs:87, 125-127, 133`
**Issue:**
- A commented-out `// name: 'browser.x'` or `// 'browser.x',` is derived as real.
- A spread or constant reference inside `BROWSER_CLIENT_AUTOMATION_METHODS` drops names silently while the set stays non-empty. `verify-orca-browser-abilities.mjs` builds its tier-1 served-set equality from `derived.automation`, so this matters there.
- The members regex runs from the class keyword to end of file, so it also picks up later classes and interfaces, and it misses `private readonly browserX`.

None of these occurs at the pin; I checked that the automation body holds only literals.
**Fix:** Strip `//` and `/* */` comments before matching. Refuse any automation-body token that is not a quoted literal or a comma. Bound the members slice at the class's closing brace, for example with the next `^}` after `classAt`.

### IN-03: A moved users tree is silent; it surfaces only as per-row users mismatches

**File:** `scripts/orca-browser-parity.mjs:75, 143-149`
**Issue:** `sourceFiles` returns `[]` for a missing directory. If upstream moves `src/main/browser` or `src/main/orcad`, the run reports many "row X lists users [main, ...], the Orca tree gives [...]" lines and never names the moved directory. Sets (a) to (d) get a named "moved upstream?" error; (e) does not.
**Fix:** In `deriveAll`, throw `users: <rel>/ not found under the Orca tree (moved upstream?)` when any users root is absent.

### IN-04: Overlay exclusion keys on the current overlay source, not on what the build copied; seam patches are not excluded

**File:** `scripts/orca-browser-parity.mjs:93-107`
**Issue:**
- `build-orca.sh` removes stale copies only on the next build (lines 127-133). Until that build, a file renamed or deleted under `orca-overlay/files/` stays in `orca/` and counts as Orca code.
- A seam patch under `orca-overlay/patches/` that adds a `browser.*` literal to an Orca file in a users tree would count as an Orca user, which is the 66-06 failure mode by a second route. None does today: `orcad-browser-provider.ts`'s seam hunk adds no literal.
- On a fetched tree that has not been built, an upstream file that collides with an overlay path is silently excluded. `build-orca.sh:125` refuses such a collision only at build time.

**Fix:** Read `orca/.pb-overlay-copied` (the build's own record) when it exists, falling back to the overlay listing. Derive users from `git -C orca show HEAD:<path>` content for tracked paths, so seam edits never count.

### IN-05: Table parser does not validate the separator row or the tier column

**File:** `scripts/orca-browser-parity.mjs:163-170`
**Issue:**
- `lines.slice(at + 2)` assumes line `at + 1` is the `|---|` separator. If it is missing, the first data row is skipped silently and later reported misleadingly as "ability ... has no row".
- The tier cell is stored but never validated. `verify-orca-browser-abilities.mjs:238-246` classifies tier-1 with `TIER_ONE` over this exact cell, so a typo there changes that gate's served-set expectation with no red here.

**Fix:** Require `/^\|(\s*:?-+:?\s*\|){6}$/` on line `at + 1`. Refuse a tier outside `1`, `1 (subset)`, `2`, `3`, the values the table uses today.

### IN-06: Generality without instantiation: `agent` is bound to the same set as `CLI`

**File:** `scripts/orca-browser-parity.mjs:144-145`
**Category:** necessity
**Issue:** `agent: cliNames, CLI: cliNames` means the derived `agent` user equals `CLI` for every ability by construction. The `agent` token in a users cell therefore records no independent evidence, and no fixture or row can make the two differ. This is ratified by 61-02-PLAN Task 2 action (1), so the finding is Info: removal is an owner call.
**Fix:** Either drop `agent` from the derivation and the table, or derive it from a distinct source, such as the agent-browser bridge under `src/main/browser/agent-browser/`.

### IN-07: Read errors are reported as "moved upstream" or "header not found"

**File:** `scripts/orca-browser-parity.mjs:110, 316`
**Issue:** `readOrThrow` turns every read error (EACCES, EISDIR) into "not found ... (moved upstream?)". The CLI swallows a missing or unreadable `DISPOSITIONS.md` into `table: header not found`, which points the operator at the wrong cause.
**Fix:** Include `err.code` in the message. Report a missing table as `table: <TABLE_REL> could not be read (<code>)`.

---

_Reviewed: 2026-11-20T22:38:34Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
