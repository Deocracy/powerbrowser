---
phase: 44-trust-path-b
plan: 02
reviewed: 2026-10-31T00:00:00Z
depth: standard
files_reviewed: 3
files_reviewed_list:
  - scripts/verify-mar-update-hop.mjs
  - scripts/build-update-xml.mjs
  - scripts/verify-platform.sh
findings:
  blocker: 0
  warning: 6
  info: 3
  total: 9
status: issues_found
---

# Phase 44 Plan 02: Code Review Report

**Scope:** `git diff 4804013f..07524bdf -- scripts/` (commits 32db3520, ee7efca1, b2ef66ee).
**Verified by running:** `build-update-xml.mjs --self-test` PASS, `verify-mar-update-hop.mjs --self-test` PASS,
`verify-platform.sh --only build-update-xml-self-test` PASS, `--only build-update-xml` FAIL naming the absent MAR
(no SKIP; the only failure, so config.status and application.ini parse against the real objdir).

No blocker found. No path traversal or injection reaches the filesystem: `--channel` must equal both
`MOZ_UPDATE_CHANNEL` and `UPDATE_CHANNEL`, and the target token must be a `TARGETS` row, before either is joined
into the output path (build-update-xml.mjs:215-224, 186-198, 282). Emission is withheld whenever `failures` is non-empty.

## Warnings

### WR-01: The hop gate now always injects detailsURL, so pre-UPD-14 evidence and the documented procedure go red with a misleading message

**File:** `scripts/verify-mar-update-hop.mjs:656` (also `:401`), `docs/BUILD.md:899-903`
**Issue:** The header comment (lines 56-58) and the SUMMARY say a descriptor with no detailsURL "stays byte-identical". That holds only for the emitter. The gate passes `hop.detailsURL ?? notes.url` and `notes.url` is always set (a missing release_notes is a hard failure at :519-520), so the fresh emission always carries `detailsURL`. A served `update.xml` produced by the BUILD.md procedure (which still calls `buildUpdateXml` without detailsURL) or by any 08-04-era evidence now fails the byte comparison at :663 / :408 with "a hand edit may have intervened". `hop.json` cannot express "no detailsURL" because `??` falls through on null. No evidence exists on this host today, so nothing is red yet; the first person to follow BUILD.md hits it.
**Fix:** Either update the BUILD.md procedure to pass `detailsURL` (read from `[urls] release_notes`) and make the gate require `hop.detailsURL` explicitly, or fall back only when the served descriptor itself carries the attribute (`parseUpdateXml(served).detailsURL`). Correct the "stays byte-identical" claim in the header and SUMMARY.

### WR-02: DIRECT_RUN compares an un-realpathed argv[1], so a symlinked invocation of `--self-test` now exits 0 having run nothing

**File:** `scripts/verify-mar-update-hop.mjs:97-107`
**Issue:** `import.meta.url` is already realpath-resolved by Node; `resolve(process.argv[1])` is not. Reproduced: a symlink to the script run with `--self-test` prints nothing and exits 0. Before the change, `args` was always `process.argv.slice(2)`, so a symlinked `--self-test` still ran the self-test and an unknown flag was still refused. `DIRECT_RUN` therefore widens the existing `INVOKED_DIRECTLY` flaw (which already made the main gate a silent no-op under a symlink) to the self-test and the argument refusal. `scripts/generate.mjs:146-154` documents exactly this trap and uses `realpathSync` on both sides. The two IIFEs (:97-104 and :1250-1256) are also identical code.
**Fix:** One shared helper, applied to both uses, with `realpathSync` on both sides as `generate.mjs` `isEntryPoint()` does:
```js
const DIRECT_RUN = (() => { try { return process.argv[1] !== undefined
  && realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; } })();
```
and replace `INVOKED_DIRECTLY` with `DIRECT_RUN`.

### WR-03: The patch URL's asset name is the local MAR file name, not the published asset name

**File:** `scripts/build-update-xml.mjs:262` (default at `:68`)
**Issue:** `marUrl = ${origin}/${tag}/${basename(paths.mar)}`. The default MAR is `nplus1.mar`, but the Release assets are named `<app>-<version>.<token>.complete.mar` and `<app>-<token>.complete.mar` (`scripts/verify-release-asset-set.mjs:132-133`). `--emit` therefore writes a descriptor whose URL names an asset that will not exist, and `--check` passes because it only compares the URL to the string it built. An update client would get a 404 on the download. `--mar` with another file name silently produces yet another URL.
**Fix:** Derive the asset name from the same source as `verify-release-asset-set.mjs` (`app`, `version`, `token`), or at minimum refuse a MAR whose basename does not equal `<app>-<version>.<token>.complete.mar`, naming both.

### WR-04: No cross-check between release.txt and the built tree's Version

**File:** `scripts/build-update-xml.mjs:250-273`
**Issue:** `appVersion` comes from `objdir/dist/bin/application.ini`; the URL path segment and `displayVersion` come from `release.txt`. A stale objdir (built before the key was bumped) emits `appVersion="153.5.1"` with `displayVersion="153.6.0-1"` and a URL under the new tag, and everything is green. `docs/RELEASING.md:1002` requires `displayVersion` to equal the release key and `appVersion` the ESR version for any tracked descriptor, so such an output is one the release-identity gate would later reject.
**Fix:** After the tag regex, require `tag.slice(1).startsWith(`${version}-`)` (or the repository's own version/key relation) and fail naming both `release.txt` and `application.ini` values.

### WR-05: platformVersion is hard-coded to Version on a claim the repo's own evidence contradicts

**File:** `scripts/build-update-xml.mjs:45-46, 267`
**Issue:** The `shortcut:` comment says platformVersion equals Version "(the Gecko ESR convention)". The 08-04 proof recorded in `docs/BUILD.md:908-910` had `appVersion 153.1.1` with `platformVersion 153.1.0`, and `hop.json` models them separately (`hop.nplus1.platformVersion ?? ...`). `application.ini [Gecko] MaxVersion` carries the value (currently `153.5.1`, so no output differs today) and is a one-line read. The first chemspill release (x.y.1 on a x.y.0 platform) emits a wrong platformVersion silently.
**Fix:** Read `MaxVersion` in `appIniOf`, fail naming `application.ini` when absent, and pass it as `platformVersion`; drop the shortcut.

### WR-06: The self-test never plants the fail-closed paths the plan makes its headline requirement

**File:** `scripts/build-update-xml.mjs:416-422`
**Issue:** The five plants cover target token, BuildID, ABI, channel and https. None removes `config.status`, `application.ini`, the MAR or `release.txt`, none uses a pending OS (`Darwin`, `WINNT`), a malformed tag, or an unset `mar_origin`. "FAIL naming the first missing input, never SKIP" is therefore verified only by running the full tier on a host that happens to lack the MAR (as done for this review), not by the check's own `--self-test` as CLAUDE.md requires. A regression that turned an absent MAR into `return { failures: [], outputs: [] }` would stay green.
**Fix:** Add plants: `texts` empty for `CONFIG_STATUS_REL` (absent status), absent application.ini, `mar` override to a nonexistent path, OS `Darwin` (naming "pending"), release.txt `garbage`. Each must name its file and value.

## Info

### IN-01: The byte-identity and parse-back checks are largely tautological

**File:** `scripts/build-update-xml.mjs:290-305`
**Issue:** "Emit twice" is two in-process calls a few microseconds apart, so a timestamp in the emitter would usually still match. The `expect` object is built from the same variables as `args`, so only `hashValue` and `size` are independent. The on-disk compare (only with `--outdir`) is the one real comparison, and the full-tier row does not pass `--outdir`.
**Fix:** Have the row compare against the tracked descriptor tree once Phase 49 lands one, and say so in the row comment (it already states the limit honestly).

### IN-02: detailsURL validation is thin

**File:** `scripts/build-update-xml.mjs:236-240`; `scripts/verify-mar-update-hop.mjs:401, 656`
**Issue:** `new URL(x).protocol === 'https:'` accepts a value with embedded tab/newline (the URL parser strips them) while `xmlEscape` leaves them raw in the attribute, where XML attribute normalisation turns them into spaces. The hop gate does no https check on `hop.detailsURL` or `release_notes` at all. Inputs are repository-controlled, so impact is low.
**Fix:** Refuse any value where `new URL(x).href !== x` (or that matches `/[\s\x00-\x1f]/`) in both places.

### IN-03: The hop self-test cannot go red on a dropped detailsURL

**File:** `scripts/verify-mar-update-hop.mjs:739, 822, 1023`
**Issue:** `FIXTURE_DETAILS` is passed to the fixtures through the same `buildUpdateXml` the gate regenerates with, so if the emitter ignored `detailsURL` both sides would still agree. Coverage of the attribute lives only in `build-update-xml.mjs` (`expect.detailsURL` parse-back).
**Fix:** One plant: serve a descriptor built without `detailsURL` against a gate that expects it, and require red naming `detailsURL`.

---

_Reviewed: 2026-10-31_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
