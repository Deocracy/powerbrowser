---
phase: 68-three-os-artifacts-weekly-re-pin-and-upstream-seams
plan: 08
subsystem: packaging
status: complete
tags: [BEXT-02, uBlock-Origin, distribution-extensions, licensing, endpoint-allowlist, lane]
requires: ["68-01", "68-04", "68-09", "68-10"]
provides:
  - "uBlock Origin 1.76.0 pinned (version, url, sha256) and staged as distribution/extensions/<id>.xpi by all three package scripts"
  - "verify-bundled-xpi.mjs: static, --packaged, --live [--dev], --self-test, --self-test --static, --self-test --live"
  - "Bundled extensions section in THIRD-PARTY-NOTICES.txt and LICENSING.md, generated"
  - "bundled_extensions inventory rows and their check"
affects: [68-06]
tech-stack:
  added: []
  patterns: ["Gecko distribution-directory add-on (installed once into the profile, removal sticks)", "endpoint rows derived from the XPI's own asset table, set equality over BEXT-02 rows"]
key-files:
  created:
    - powerbrowser/packaging/bundled-xpi.json
    - powerbrowser/packaging/stage-bundled-xpi.sh
    - scripts/verify-bundled-xpi.mjs
  modified:
    - powerbrowser/packaging/package-linux.sh
    - powerbrowser/packaging/package-windows.sh
    - powerbrowser/packaging/package-macos.sh
    - powerbrowser/endpoint-allowlist.json
    - scripts/generate-licensing.mjs
    - THIRD-PARTY-NOTICES.txt
    - LICENSING.md
    - inventory/licence-allowlist.json
    - scripts/verify-licence-allowlist.mjs
    - docs/BUILD.md
    - scripts/verify-platform.sh
decisions:
  - "uBlock Origin 1.76.0, the AMO current version on 2026-11-10, file 5225273; sha256 equals the hash AMO's API reports"
  - "Licence recorded as GPL-3.0-or-later from the XPI's source headers (version 3 or any later); AMO's listing slug says GPL-3.0-only"
  - "The live row writes extensions.installDistroAddons=true into user.js: the remote agent's recommended prefs persist it as false, which made the relaunch legs vacuous"
  - "The SDK extension's licence text falls back to the byte-for-byte quote in bundled-extensions/claude-agent-sdk/LICENSE.md, so the notices are the same bytes on every host"
metrics:
  duration: "about 2 h 45 min"
  completed: 2026-11-10
estimate:
  tokens: 130000
  tasks: 3
actuals:
  tokens: 32500
  tasks: 3
  commits: 3
plan_head_before: 86d211c0463d637b0a30dda458ef3220b3c2f061
plan_head_after: d8643e27e6cdc3a06ad86e76a77c04ed8fea9789
---

# Phase 68 Plan 08: uBlock Origin pre-installed through the distribution directory Summary

PowerBrowser now ships uBlock Origin 1.76.0 pre-installed and enabled. It is the AMO-signed XPI, unmodified, pinned by sha256 and staged as `distribution/extensions/uBlock0@raymondhill.net.xpi` by the Linux, Windows and macOS package scripts. The live row passed on a dev build in this lane: the add-on installed and blocked the test request on first start, still blocked it after a relaunch with no stock window, let it through when disabled, and stayed removed after a relaunch. Its GPL-3.0-or-later text is generated into the notices.

## The pin

| Field | Value |
|---|---|
| id | `uBlock0@raymondhill.net` |
| version | 1.76.0 (AMO `current_version`, file created 2026-11-08T17:02:02Z) |
| url | https://addons.mozilla.org/firefox/downloads/file/5225273/ublock_origin-1.76.0.xpi |
| sha256 | `6f20ff6749193599548770539103069c20948dfcd3e61c3089a67da7bfc3be39` (computed on the download; equals AMO's reported `sha256:` hash) |
| size | 6341734 bytes |
| licence | GPL-3.0-or-later |
| source | https://github.com/gorhill/uBlock/tree/1.76.0 (tag present, commit aa9236cb351e369cbb68113dbe8175b87f3cd134) |
| signed | META-INF/mozilla.rsa, mozilla.sf, manifest.mf, cose.sig, cose.manifest |

Manifest id and version were checked against the pin. The licence is GPL-3.0-or-later because `LICENSE.txt` is GPL v3 and the source headers (`js/background.js:6-9`) say "either version 3 of the License, or (at your option) any later version". AMO's listing slug says `GPL-3.0-only`. That is coarser than the file headers, so the headers win.

## Commits

| Task | Commit | Files |
|---|---|---|
| 1 (tracer) | 792c9572 | bundled-xpi.json, stage-bundled-xpi.sh, package-linux.sh, verify-bundled-xpi.mjs, verify-platform.sh |
| 2 | 91cf31bb | package-windows.sh, package-macos.sh, endpoint-allowlist.json, verify-bundled-xpi.mjs, docs/BUILD.md |
| 3 | d8643e27 | generate-licensing.mjs, THIRD-PARTY-NOTICES.txt, LICENSING.md, licence-allowlist.json, verify-licence-allowlist.mjs, verify-bundled-xpi.mjs, verify-platform.sh |

The SUMMARY itself is in a follow-up docs commit.

## Derived host sets (from the XPI's assets/assets.json)

On by default, `allow` (8): cdn.jsdelivr.net, curbengh.github.io, malware-filter.gitlab.io, pgl.yoyo.org, publicsuffix.org, raw.githubusercontent.com, ublockorigin.github.io, ublockorigin.pages.dev.

Opt-in, `user-initiated` (11): cdn.statically.io, easylist-downloads.adblockplus.org, easylist.to, filters.adtidy.org, hole.cert.pl, phishing-filter.pages.dev, secure.fanboy.co.nz, someonewhocares.org, stanev.org, ubo-et.lepik.io, www.void.gr.

That makes 19 rows, and `grep -c BEXT-02 powerbrowser/endpoint-allowlist.json` prints 19. No regional list with a `lang` value is on by default.

## The live row's filter rule

`/ea/fl.js` is the first plain generic filter outside any `!#if` block in the first default-on filter list, `ublock-filters` (`assets/ublock/filters.min.txt`). It is derived at check time. The fixture page on 127.0.0.1 requests `/bext02-<k>/ea/fl.js` plus a control image.

## Check results

- `bundled-xpi`: PASS (pins, cached XPI digest, id, version and signature, 19 endpoint hosts).
- `bundled-xpi-self-test`: PASS (control green; 8 plants red; 4 audit plants red).
- `node scripts/verify-bundled-xpi.mjs --self-test --static`: PASS. `--bogus` exits 2.
- `allowlist-schema`, `allowlist-doc-consistency`, `webextensions`, `theia-endpoints`: PASS.
- `licensing` (`--check`), `licensing-self-test` (5 new cases), `licence-allowlist`, `licence-allowlist-self-test` (3 new plants): PASS. A regeneration on the committed tree leaves `git diff -- THIRD-PARTY-NOTICES.txt LICENSING.md` empty.
- **Live row, lane, dev target.** The integration worktree's `objdir/dist/bin` was reflink-copied (dereferenced) into the session scratchpad. The row ran there with `PB_FIREFOX_BIN` under `flock /home/chris/coding/Power-Browser/.git/pb-live.lock`, with `ORCA_*` unset. It never wrote into the integration objdir.
  - `--live --dev`: `verify-bundled-xpi --live --dev: PASS -- on the dev objdir: first start installed and enabled it in the profile scope and it blocked the fixture request; after a relaunch with no stock window it still filtered; disabled, the request arrived; removed, it stayed removed after a relaunch`
  - `--self-test --live --dev`: PASS. Control green; `distro-pref-cleared` went red with "removed after relaunch: the removed add-on was reinstalled after a relaunch"; `filter-unproven` went red with "first start: the filtered request reached the loopback server with uBlock Origin installed". It took 4 min 2 s.
- `--quick` against the Setup baseline. The baseline reds were gui07-strip-spike-verdict (+self-test), gui09-dependent-window-content (+self-test), tab-uris-typecheck and chrome-bar-typecheck. Three reds are new:
  - `scan-brand-residue` and `scan-brand-residue-self-test`: the expected brand-scan red. Count drift only: Orca 1064 to 1069, orca 2667 to 2673, ORCA 441 to 442, renderOrcaSection 5 to 6, runOrca( 4 to 5. The report is at `.mozbuild/p68-08/brand-report.md`, and `inventory/brand-tokens.json` was not touched.
  - `privacy-hosts`: see Coordinator items.
- The lane diff against the merge base stays inside files_modified (14 files plus this SUMMARY).

## Coordinator items

1. **privacy-hosts is red.** It derives the unattended `allow` rows and compares them with `website-staging/privacy.html`'s `data-unattended-host` list. That file is outside this plan's files_modified, so it was not edited. Add one line to the unattended list:
   `<li><code data-unattended-host="ublockorigin.github.io">ublockorigin.github.io</code>, <code data-unattended-host="ublockorigin.pages.dev">ublockorigin.pages.dev</code>, <code data-unattended-host="raw.githubusercontent.com">raw.githubusercontent.com</code>, <code data-unattended-host="cdn.jsdelivr.net">cdn.jsdelivr.net</code>, <code data-unattended-host="publicsuffix.org">publicsuffix.org</code>, <code data-unattended-host="pgl.yoyo.org">pgl.yoyo.org</code>, <code data-unattended-host="malware-filter.gitlab.io">malware-filter.gitlab.io</code>, <code data-unattended-host="curbengh.github.io">curbengh.github.io</code>: uBlock Origin, which comes pre-installed, updating the filter lists it has turned on by default. Removing uBlock Origin stops these.</li>`
2. **versioncheck-bg.addons.mozilla.org.** Its allow row and the privacy page both say it is contacted "only once you have installed" an AMO add-on. Every profile now has one: uBlock is AMO-signed and has no `update_url`. The periodic background check will therefore reach that host on every profile. It still does not install the update, because `extensions.update.autoUpdateDefault` is false. The row reason and the privacy sentence need rewording; the disposition stays `allow`.
3. Live runs on the built package, in 68-06 Task 2 (every other packaged live row now runs with uBlock installed too):
   - `flock /home/chris/coding/Power-Browser/.git/pb-live.lock node scripts/verify-bundled-xpi.mjs --packaged`
   - `flock /home/chris/coding/Power-Browser/.git/pb-live.lock node scripts/verify-bundled-xpi.mjs --live`
   - optionally `... --self-test --live` (about 4 min).
   - `--live --dev` from the integration worktree places the XPI in `objdir/dist/bin/distribution/extensions/` for the run and removes it after.
4. The cache `.mozbuild/bundled-xpi/` is not shared with the integration worktree. Until `stage-bundled-xpi.sh` or a package build fills it there, `bundled-xpi` prints one SKIP line and `licensing` keeps the tracked uBlock text with one SKIP line.

## Open items

- **GPL-3.0 section 6 (owner reading, WINDOWS entry 44 family).** PowerBrowser conveys the unmodified object code (the signed XPI). The notices and LICENSING.md give the licence text and link the corresponding source at the pinned upstream tag. Whether that link satisfies section 6 (6(d), equivalent access from a designated place), or whether the source tarball should be mirrored, is the owner's call.
- **Update path.** The add-on is not updated automatically (`extensions.update.autoUpdateDefault` is false), so a pin bump (version, url and sha256 together) is how users get a newer uBlock. That bump reaches a profile only when the application changes: Gecko reinstalls a newer distribution XPI over an older one on an app upgrade.
- **Private windows.** uBlock is not granted private-window access by default. Gecko does not grant it, and this plan does not change that.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The live row's relaunch legs were vacuous under the remote agent**
- **Found during:** Task 2, the `distro-pref-cleared` plant stayed green.
- **Issue:** WebDriver BiDi's recommended preferences set `extensions.installDistroAddons` to false during a session, and that value was written to prefs.js. Every relaunch therefore skipped the distribution directory, so "removed stays removed" proved nothing.
- **Fix:** `liveSession` appends `user_pref("extensions.installDistroAddons", true);` to the profile's user.js, which is read at every start before the add-on manager starts. The plant now goes red.
- **Commit:** 91cf31bb

**2. [Rule 1 - Bug] `orcaSectionOf` would have swallowed the new section**
- **Found during:** Task 3.
- **Issue:** The Orca section ended at the Node heading. With the Bundled extensions section in between, `--check-orca` would go red and `--write-orca` would delete the new section.
- **Fix:** The Orca section now ends at the Bundled extensions heading when there is one. A self-test control proves `--write-orca` leaves it byte-identical.
- **Commit:** d8643e27

**3. [Rule 3 - Blocking] Lane Setup inputs**
- `upstream/` and `theia/node_modules` were reflink-copied from the finished p68-04 lane. `upstream/` was then reset, cleaned and re-applied by `fetch-upstream.sh` and `apply-patches.sh`. The two workspace links missing from that install (`@powerbrowser/bundled-extensions`, `@powerbrowser/orca-agents`, both relative symlinks) were added by hand. The yarn.lock digests were equal. No package install was run.

**4. [Plan detail] SDK licence text source**
- The plan reads it from the built `plugins/.user` copy. That copy is used when present, then `orca/node_modules`. Otherwise the generator reads the byte-for-byte quote in `bundled-extensions/claude-agent-sdk/LICENSE.md`, and `verify-bundled-extensions` holds that quote equal to the package's file. The quote was compared with the integration worktree's `orca/node_modules/@anthropic-ai/claude-agent-sdk/LICENSE.md` and matched exactly. This keeps the notices the same bytes on every host.

**5. [Plan detail] Live row run in the lane**
- Setup step 3 planned only `--self-test --static` in the lane. A dev live run was possible on a private copy of the integration dev objdir, so it was run. It found deviation 1. The packaged runs remain the coordinator's.

## Known Stubs

None.

## Threat Flags

None beyond the plan's threat register. The new unattended egress hosts are T-68-40; they are allowlisted by name and derived from the XPI.

## Self-Check: PASSED

- All created files exist: bundled-xpi.json, stage-bundled-xpi.sh, verify-bundled-xpi.mjs.
- Commits 792c9572, 91cf31bb and d8643e27 are ancestors of HEAD.
