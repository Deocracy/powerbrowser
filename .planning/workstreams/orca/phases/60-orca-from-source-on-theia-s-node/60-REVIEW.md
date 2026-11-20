---
phase: 60-orca-from-source-on-theia-s-node
reviewed: 2026-11-20T22:40:13Z
depth: deep
files_reviewed: 9
files_reviewed_list:
  - .gitignore
  - configuration.toml
  - flake.nix
  - inventory/licence-allowlist.json
  - scripts/build-orca.sh
  - scripts/fetch-orca.sh
  - scripts/generate-licensing.mjs
  - scripts/generate.mjs
  - scripts/scan-brand-residue.mjs
findings:
  critical: 0
  warning: 3
  info: 6
  total: 9
  necessity: 0
status: issues_found
---

# Phase 60: Code Review Report

**Reviewed:** 2026-11-20T22:40:13Z
**Depth:** deep
**Files Reviewed:** 9
**Status:** issues_found

## Summary

Reviewed the nine files at HEAD e0c19c54. For the pre-existing files, the review covered the v1.7 diff against 2b5f4609 (generate.mjs, generate-licensing.mjs, scan-brand-residue.mjs, .gitignore, configuration.toml, flake.nix). The new files (fetch-orca.sh, build-orca.sh, licence-allowlist.json) were read in full. Call chains were traced into scripts/rebase-orca.sh, scripts/apply-patches.sh, scripts/build-orca-panes.sh, scripts/build-orca-browser-host.sh, .github/workflows/release.yml and release-train.yml, and the built orca/ tree.

Confirmed correct:
- fetch-orca.sh's clone, peel and rename logic.
- generate.mjs's pin validation. report() exits, so a bad pin never reaches the unquoted assignment.
- The anchored /orca/ and /orca.partial/ ignore rules, and the !orca-overlay/upstream/ negation (checked with git check-ignore).
- The licence digest ff1b611f... against orca/LICENSE at the pin.
- The D-39 pref citations against upstream/ (StaticPrefList.yaml:16999-17002, PermissionManager.cpp near 4456).
- The scanner's split between residue_probes and tracked_residue_probes for --extra-root.

The de-slot step is ratified by D-14. The source-build scope is ratified by D-04 and D-16, and the per-package licence set by D-42, D-43 and D-44. None of these is reported as a defect.

The defects found:
- build-orca.sh does not isolate itself from TAG and COMMIT in the caller's environment.
- build-orca.sh runs its scrub after the steps that the scrub is documented to protect.
- generate-licensing.mjs attributes a bundled extension's licence text to a version it never checked.

## Warnings

### WR-01: build-orca.sh forwards inherited TAG/COMMIT to fetch-orca.sh, then reports configuration.toml's pin as what it built

**File:** `scripts/build-orca.sh:72`, `scripts/build-orca.sh:234-236`
**Issue:** Step 1 runs `bash "$REPO_ROOT/scripts/fetch-orca.sh"` with the caller's whole environment. fetch-orca.sh treats an exported `TAG` (with `COMMIT`) as a re-pin override (fetch-orca.sh:197-218). These are generic variable names, and this repo's own workflows already export them at job level (release-train.yml:1068-1069 `TAG:`/`COMMIT:` in bump-pr-orca). rebase-orca.sh:119 deliberately runs `env -u TAG -u COMMIT` before fetch-orca.sh for this reason, but build-orca.sh does not.
- If a caller has `TAG` exported without `COMMIT`, every build fails at fetch-verify with a message about a re-pin nobody asked for.
- If both are exported, the overlay and build run against a tree verified at the override pin. Lines 235-236 then source generated/upstream-pins.env and print `PASS -- built $UPSTREAM_ORCA_TAG ($UPSTREAM_ORCA_COMMIT)`, which names configuration.toml's pin, not the tree that was built.
- If the fragment is absent in that case, the `.` at line 235 fails under `set -e` after the whole build has finished, and no `build-orca: FAIL` line is printed.
**Fix:** Make the pin build-orca.sh verifies the configuration pin. Read it once at the start and report the same values at the end:
```bash
# step 1
[ -f "$REPO_ROOT/generated/upstream-pins.env" ] || fail "generated/upstream-pins.env is missing; run node scripts/generate.mjs"
# shellcheck source=/dev/null
. "$REPO_ROOT/generated/upstream-pins.env"
run_step fetch-verify env -u TAG -u COMMIT bash "$REPO_ROOT/scripts/fetch-orca.sh"
...
echo "build-orca: PASS -- built $UPSTREAM_ORCA_TAG ($UPSTREAM_ORCA_COMMIT) ..."
```

### WR-02: Bundled-extension licence text is read from a copy whose version is never checked against the lock

**File:** `scripts/generate-licensing.mjs:413-417`
**Issue:** For each dependency of a bundled-extensions/*/ extension, `bundledItems` takes `version` and `resolved` from the extension's package-lock.json. It then reads the licence text from the first file that exists among these two:
- `theia/applications/browser/plugins/.user/<id>/extension/node_modules/<dep>/LICENSE.md`
- `orca/node_modules/<dep>/LICENSE.md`

Neither copy's package.json version is compared with `entry.version`. orca/node_modules holds Orca's own dependency, at the version Orca's lockfile pins (orca/package.json:228). That version moves on every Orca re-pin, independently of the extension's lock. The .user copy can also be left over from an earlier theia build. The SDK is 0.3.284 in both places today, so nothing fails now. After the next Orca re-pin that bumps the SDK, THIRD-PARTY-NOTICES.txt would print the newer licence text under the header `@anthropic-ai/claude-agent-sdk 0.3.284`, and `--check` would accept it because it re-derives the same wrong text. The lookup also tries only `LICENSE.md`, so a future carried package that ships `LICENSE` or `LICENSE.txt` falls through to the quote path or fails.
**Fix:** Accept a candidate copy only when its version matches the lock:
```js
const candidates = [join(root, USER_PLUGINS_REL, extId, 'extension', 'node_modules', dep), join(root, 'orca', 'node_modules', dep)];
it.text = candidates
    .filter((d) => readIf(join(d, 'package.json')) !== null && readJson(join(d, 'package.json')).version === entry.version)
    .map((d) => licenceText(d))   // the shared lib reader, not a fixed LICENSE.md name
    .find((t) => t !== null) ?? null;
```

### WR-03: The ORCA_* / NODE_OPTIONS scrub runs after the fetch and overlay steps it is documented to cover

**File:** `scripts/build-orca.sh:16-18`, `scripts/build-orca.sh:72-146`, `scripts/build-orca.sh:168-172`
**Issue:** The header says this tree is worked on from inside Orca desktop, "whose variables must never reach the build". The scrub (step 3, lines 170-172) runs only after the following, all with the inherited `NODE_OPTIONS`, `ELECTRON_RUN_AS_NODE`, `NODE_REPL_EXTERNAL_MODULE` and every `ORCA_*` variable:
- step 1 (fetch-orca.sh)
- step 1b: `node -e` reading seams.json (line 86) and `scripts/apply-patches.sh` writing into orca/ (line 112)

An inherited `NODE_OPTIONS=--require ...` loads into the seams.json reader. The `--panes-only` path exits at line 154 and never reaches build-orca.sh's scrub at all; it relies on build-orca-panes.sh:66-67 and build-orca-browser-host.sh:53-54 scrubbing for themselves. The invariant holds in those two scripts only because each one re-implements it.
**Fix:** Move step 3 (and the `ELECTRON_SKIP_BINARY_DOWNLOAD` and corepack knobs, if desired) to just after `exec > >(tee ...)`, before step 1, so both paths scrub before any child process starts:
```bash
for name in "${!ORCA_@}"; do unset "$name"; done
unset ELECTRON_RUN_AS_NODE NODE_OPTIONS NODE_REPL_EXTERNAL_MODULE
if env | grep -q '^ORCA_'; then fail "scrub: an ORCA_ variable survived the scrub"; fi
run_step fetch-verify ...
```

## Info

### IN-01: Conflicting mode flags are accepted; `--check --write-orca` writes

**File:** `scripts/generate-licensing.mjs:791-802`
**Issue:** Each flag is validated on its own, but combinations are not checked.
- `--check --write-orca` takes the `orcaOnly` branch with `write = true` and rewrites THIRD-PARTY-NOTICES.txt. A run that asks for a check writes the file.
- `--check --check-orca` silently drops the full check.
**Fix:** Refuse more than one mode flag. For example, `if (args.length > 1) { console.error(...); process.exit(2); }`.

### IN-02: Programming errors are flattened to a one-line FAIL with no stack

**File:** `scripts/generate-licensing.mjs:805-809`
**Issue:** Before v1.7, a non-`Fail` error was rethrown. Now every exception is printed as `licensing: FAIL -- <message>`, and the stack appears only when `LICENSING_DEBUG` is set. A `TypeError` from a malformed bundled-xpi.json or a missing package-lock.json (`readJson`, line 410, raw ENOENT) reads as a named, plain-language red, with nothing pointing to the line that threw.
**Fix:** Print the stack for non-`Fail` errors by default, or wrap the expected I/O failures (lock or pin file absent) in `Fail` with a next step.

### IN-03: The undeclared-modification check is implemented twice, with diverging path parsing

**File:** `scripts/build-orca.sh:96-101` (vs `scripts/rebase-orca.sh:134-139`)
**Issue:** build-orca.sh extracts the path with `${line##* }` (the last space-separated word). rebase-orca.sh uses `${line:3}`. On a rename entry (`R  old -> new`) or on a quoted path, the two scripts name different paths. Both fail closed, but the two copies already differ, and the seam reset and apply sequence is duplicated as well.
**Fix:** Use `git status --porcelain -z` in one shared helper that both scripts source.

### IN-04: Several failure exits print no `build-orca: FAIL` line

**File:** `scripts/build-orca.sh:183`, `scripts/build-orca.sh:235`
**Issue:**
- `want_pnpm="$(node -p ...)"` throws when packageManager is absent or malformed.
- `. generated/upstream-pins.env` fails when the file is missing.

In both cases `set -e` terminates the script without a FAIL line. rebase-orca.sh:170 tells the reader to "read the build-orca FAIL line above". The overlay step also runs `node` before the node-24 shell-entry check, so a shell without node reports "seams.json could not be read" instead of the shell-entry message.
**Fix:** Append `|| fail "..."` to both commands, and move the shell-entry check ahead of step 1b.

### IN-05: Write mode can emit notices with no Orca section while LICENSING.md still points to one

**File:** `scripts/generate-licensing.mjs:556-561`, `scripts/generate-licensing.mjs:526-528`
**Issue:** With orca/ not built, `orcaPart` keeps `orcaSectionOf(trackedNotices)?.text`. When the tracked notices file is absent or has no Orca section, that value is `undefined`, so `renderNotices` omits the section. The only sign is a SKIP line. `renderLicensing` still unconditionally says the Orca packages are listed in that section.
**Fix:** In write mode, throw `Fail` when the derivation is skipped and no tracked Orca section exists.

### IN-06: allProbes was inserted between assertNoProbeSwallowingRow's JSDoc and its function; hand-kept counts in comments

**File:** `scripts/scan-brand-residue.mjs:157-183`, `scripts/scan-brand-residue.mjs:34-35`, `scripts/scan-brand-residue.mjs:583-584`
**Issue:** The long block comment that describes the probe-swallowing invariant now sits directly above `allProbes`, so editors and doc tools attach it to the wrong function. The figure "1598 files" for Gecko's substring hits is written into two comments and is not derived. It goes stale on the next ESR rebase.
**Fix:** Move `allProbes` above the block comment. Drop the literal count, or mark it as measured at a named tag.

---

_Reviewed: 2026-11-20T22:40:13Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
