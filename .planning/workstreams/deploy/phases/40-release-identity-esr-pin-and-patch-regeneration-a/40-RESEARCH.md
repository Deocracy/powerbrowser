# Phase 40: Release identity, ESR pin and patch regeneration (A) - Research

**Researched:** 2026-10-20
**Domain:** Gecko patch-set repo maintenance: manifest-driven release identity, update-origin prefs, endpoint allowlist, patch regeneration, reusable GitHub workflow, licence notices
**Confidence:** HIGH for in-tree mechanics (every load-bearing claim was read or executed this session); MEDIUM for the licensing design (two inputs are not available offline)

## Summary

Every mechanism this phase needs already exists in the tree in a nearby form. The generator owns a frozen `TARGETS` table with tracked comparands that `generated-byte-identity` byte-compares. `verify-upstream-pins.mjs` already checks the workflow's `tag` default as a mirror. `verify-theia-endpoints.mjs` already derives manifest hosts. `verify-endpoints.sh` already fails any unattended resolution of a non-`allow` host. Phase 40 extends these. It adds no new framework and no package.

Five facts change the plan's shape:

1. **The update channel is `default`, not `release`.** The built tree, `.mozconfig`, NG-065 and the 08-04 hop drill all use channel `default` with MAR channel `powerbrowser-default`. Switching to `release` would need a tier-3 rebuild and re-proving ng065 and mar-update-hop, and the stated reasons for it no longer hold: patch 030 removed the channel-dependent certificate selection, and `AppConstants.IS_ESR` already overrides the channel for Remote Settings and search. Keep `default`. The `update-channel` row then goes red on today's tree because `docs/RELEASING.md:203,361` names a `release/Linux_x86_64-gcc3/update.xml` descriptor path and `:878` names `--enable-update-channel=release`. Those lines are drift the row exists to catch, and the plan fixes them.
2. **Patch regeneration must diff against `HEAD`, not the worktree.** `apply-patches.sh` uses `git apply --3way`, which stages the result into the index. So the `git -C upstream diff --abbrev=10` that SUMMARY correction 7 names produces **0 bytes**. `git -C upstream diff HEAD --abbrev=10 -- <+++ b/ paths>` reproduces all four tracked patches byte-for-byte (executed this session, with user git config neutralised).
3. **Do not feed a revisioned display version into Gecko.** `is_esr = app_version_display.endswith("esr")` (`init.configure:1151`). A display version like `153.5.1-1` clears `IS_ESR`, which changes the Remote Settings and search channel to `default` and changes enterprise detection. A revision-only update is offered anyway, because `updateIsAtLeastAsOldAs` treats an equal `appVersion` with a different `buildID` as newer. The version files are therefore release metadata (the release key, the descriptor version and the asset names), not a Gecko build input.
4. **`about:license` can be reproduced exactly from source.** Preprocessing `toolkit/content/license.html` with Mozilla's own `mozbuild.preprocessor`, using `APP_LICENSE_BLOCK` plus the three defines `MOZ_JXL`, `MOZ_ZUCCHINI` and `XP_LINUX` read from `objdir/config.status`, produced a file **byte-identical** to the built `browser/content/browser/license.html` (0 diff lines, run against the main checkout's objdir). Theia licences can be collected offline. The Node licence cannot: it lives only inside the pinned nodejs.org tarball.
5. **The pin bump replays cleanly.** `FIREFOX_153_5_1esr_RELEASE` resolves to `6cd88e7d45fe7a5b0b87b984fb32a8779151860e`. Between 153.5.0 and 153.5.1, upstream changed none of the five files the patches touch (only version files, test files, security data and Remote Settings dumps), so the four patches re-apply with unchanged bytes.

**Primary recommendation:** Run in order:
1. DIST-06: the pin bump, through `scripts/rebase-upstream.sh`.
2. AUTO-08 and AUTO-10, both reading the new `upstream/`.
3. REL-01 and UPD-11, both generator work in `generate.mjs`.
4. UPD-12, UPD-13, UPD-25 and UPD-33: the update-origin prefs and the allowlist. These also edit `generate.mjs`, so they run after step 3, not in parallel with it.
5. PKG-08 and PKG-09.

Every new check is one registry row plus its `-self-test` sibling in the `--quick` array of `scripts/verify-platform.sh`.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Release key, version files, channel derivation | Generator (`scripts/generate.mjs`) | Tracked comparands under `powerbrowser/` | CFG-01: `configuration.toml` + `brand/` are the only rebrand inputs; the generator is the only writer |
| Update URL (one source) | Gecko build config (`MOZ_APPUPDATE_HOST` via `generated/identity.configure`) | `powerbrowser/distribution/policies.json` loses `AppUpdateURL` | The policy wins over `application.ini`; two sources can disagree |
| About-dialog links | Gecko default prefs (`firefox-branding.js`, generated) | Upstream `aboutDialog.js` / `aboutDialog-appUpdater.js` (read-only) | Upstream reads the prefs. Never patch upstream for this. |
| Endpoint dispositions | `powerbrowser/endpoint-allowlist.json` (data) | `verify-endpoints.sh` layer 3/4 verdicts, `allowlist-schema` row | One machine-readable source of truth, D-85 |
| Patch regeneration | `scripts/regenerate-patches.sh` over `upstream/` | `apply-patches.sh` (unchanged) | CLAUDE.md: patches are regenerated, never text-edited |
| Replay in CI | `.github/workflows/rebase-upstream.yml` (`workflow_call` + `workflow_dispatch`) | `scripts/rebase-upstream.sh` (unchanged) | AUTO-06 (Phase 43) calls it; the default must not exist |
| Licence notices | New generator script (tracked outputs at repo root) | Release assets (Phase 49) | Inputs are upstream source, the installed Theia tree, and the pinned Node tarball |

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
#### Already decided (owner, 2026-10-20)
- All owner decisions in REQUIREMENTS.md "Owner Decisions" are binding (SEED-002 §12 recommended defaults plus the research additions).
- UPD-33: `user-initiated` is a third allowlist disposition; an unattended request to such a host fails like `deny`.
- The update channel name is chosen once and derived everywhere (UPD-11); record the choice in PROJECT.md Key Decisions.

#### Owner gates in this phase (stop points for autonomous execution)
- Pushing to GitHub and dispatching the first `rebase-upstream.yml` run against `FIREFOX_153_5_1esr_RELEASE` are owner actions. Plans prepare everything locally and end with the exact push/dispatch commands; they do not push.

### Claude's Discretion
All other implementation choices are at Claude's discretion — discuss phase was skipped per user setting. Use ROADMAP phase goal, success criteria, and codebase conventions to guide decisions.

### Specific Ideas (from CONTEXT.md)
- `scripts/regenerate-patches.sh` uses `git -C upstream diff --abbrev=10` over each patch's own `+++ b/` paths, never `--full-index`; `--check` byte-compares with the tracked patch (SUMMARY correction 7). **Research correction: it must be `git -C upstream diff HEAD --abbrev=10`. See Pitfall 1.**
- Pin bump changes `configuration.toml:115` and the `rebase-upstream.yml:33` default together (DIST-06) before AUTO-08 deletes the default.

### Deferred Ideas (OUT OF SCOPE)
None — discuss phase skipped.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description (abridged from REQUIREMENTS.md) | Research Support |
|----|-------------|------------------|
| DIST-06 | Pin `FIREFOX_153_5_1esr_RELEASE` (6cd88e7d): `configuration.toml:115` and the `rebase-upstream.yml:33` default change together, regenerate, `--quick` green; first dispatched run green; lands before AUTO-08 | Tag SHA verified by `git ls-remote`; the 153.5.0 to 153.5.1 diff touches no patched file; local path is `rebase-upstream.sh --tag` (Pattern 1) |
| AUTO-08 | `rebase-upstream.yml` gains `on: workflow_call` with a `tag` input that has no default; generate runs inside `nix develop .#theia`; `verify-upstream-pins.mjs` asserts the absence | Current workflow and checker read; `workflow_call` input `type` is required (Pattern 6) |
| REL-01 | `[product] revision`; the generator derives version files and the release key `v<ESR>-<revision>`; quick row `release-identity` plus self-test (a hand-written version literal; a descriptor version that disagrees) | Integer key avoids the brand-value scan; TARGETS and comparand mechanics (Pattern 2) |
| UPD-11 | One channel name; quick row `update-channel` derives from the generated `.mozconfig` and compares with every consumer; self-test plants `release`/`powerbrowser-release`; recorded in PROJECT.md | Channel `default` / `powerbrowser-default` verified in the tree; known drift in RELEASING.md (Pattern 3) |
| UPD-12 | `policies.json` has no `AppUpdateURL`; `MOZ_APPUPDATE_HOST` is the only source; the ng064 comparand and the `endpoint-allowlist.json:22` reason change in the same commit | Consumers enumerated: ng064:65, mar-update-hop:177-213 and :344, two comments (Pattern 4) |
| UPD-13 | `app.releaseNotesURL`, `.aboutDialog`, `app.update.url.manual` and `.details` come from `[urls]`; the fallback link stops throwing; `powerbrowser.org` becomes `user-initiated`; record how verify-theia-endpoints treats the homepage | Upstream dialog code read; `new URL("")` throws inside a try; mapping and anchor splice (Pattern 4) |
| UPD-33 | `user-initiated` disposition; an unattended request fails like `deny`; self-test plants an unattended prefetch | Consumers: `allowlist-schema` (`verify-platform.sh:2620`), layer 3 (`verify-endpoints.sh:364`), layer 4 (`ng069:44`) (Pattern 5) |
| UPD-25 | `app.update.langpack.enabled=false` in both variants; a row derives the update-pref set from generator output and forbids five prefs; self-test plants one | Pref names verified upstream; leaving `app.update.interval` unset gives the 21600 s default (Pattern 4) |
| PKG-08 | Script generates `LICENSING.md` and `THIRD-PARTY-NOTICES.txt` from about:license, Theia dependency licences and the Node licence; drift row | about:license reproduced byte-exactly; offline Theia walk; Node input gap (Pattern 7) |
| PKG-09 | en-US-only scope in README and PROJECT.md (/download and release notes are later phases) | README has a `## Status` section at :84 |
| AUTO-10 | `regenerate-patches.sh` plus `--check`; quick row `patches-regenerated` plus a self-test with a hand-edited hunk | Byte-exact regeneration executed for all four patches (Pattern 8) |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- Never fork or patch Theia core. Never modify Gecko outside `patches/`; `git -C upstream diff` against the applied stack is the invariant. Firefox internals only through `PowerBrowserAPI.sys.mjs`. This phase touches no internals.
- Repo path contains no space. New files get names without spaces.
- **Patches are regenerated, never text-edited.** AUTO-10 turns this rule into a gate.
- **The residual-brand scan is a permanent gate.** It iterates `git ls-files`, so **stage new files before trusting a green scan**. Only `inventory/brand-tokens.json` may name the originating product.
- **One driver, one registry:** `scripts/verify-platform.sh`. Adding a check means appending one row. No sibling driver.
- **Derive and compare; do not hand-keep an expectation list.** Every new check gets a `--self-test` that plants faults and requires each to go red naming the drift. Never assert on the absence of a log line your own instrumentation emits.
- **No internal identifier in user-facing text.** This phase adds no UI copy; the About-dialog link labels are upstream's.
- Builds run in `nix develop .#firefox` / `.#theia`; `yarn` works only inside the theia shell, while `node` works outside. **A `--quick` row must not call `yarn`.** No current quick row does.
- `verify-platform.sh --quick` is the commit gate; it took 58 s on this worktree, 2026-10-20, exit 0.
- Commit with explicit paths, because concurrent sessions may commit on main (memory note). This worktree is `workspace/deploy`.

## Standard Stack

No new packages. Everything uses what is already in the tree or the dev shell.

| Tool | Version (verified) | Purpose | Note |
|------|--------------------|---------|------|
| node | v24.21.0 (host) | All new check scripts | Same as the existing rows |
| git | 2.54.0 | `diff HEAD --abbrev=10` regeneration | Pin flags against user config (Pitfall 1) |
| python3 | host `/run/current-system/sw/bin/python3`; also in `.#theia` (`flake.nix:35`) | Runs upstream's `mozbuild.preprocessor` for about:license | Spawned from node; a row command must start `node` or `bash` (`verify-platform.sh:5024`) |
| `scripts/lib/toml.cjs` | vendored | Parses `revision = 1` as `number` (verified) | Integer support exists |
| `cachix/install-nix-action` | `@13d8dd58da0234aa297dedd986986ccb8e7f3e24 # v31.11.1` (`verify.yml:53`) | Nix in `rebase-upstream.yml` | Reuse the exact SHA (GH-08 allow-list later) |
| inkscape | 1.4.4 (host and flake) | Generator icon rasteriser | The reason R1 exists |

**Installation:** none.

## Package Legitimacy Audit

No external packages are installed by this phase. `theia/node_modules/yaml` and `js-yaml` exist, but no script under `scripts/` imports a Theia dependency. Keep it that way and parse the workflow textually (Pattern 6).

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
configuration.toml ──(resolveConfig)──> generate.mjs ──┬─> generated/.mozconfig ──copy-over──> .mozconfig (tracked comparand)
 [product].revision                                     │      (channel line + MAR ids)                │
 [upstreams].firefox_esr_tag                            ├─> generated/packaging/version/* ──> powerbrowser/packaging/version/* (tracked)
 [urls].update/.release_notes/.homepage                 ├─> generated/identity.configure (MOZ_APPUPDATE_HOST)  ──> application.ini [AppUpdate]
                                                        └─> generated/branding/{dev,release}/pref/firefox-branding.js ──> tracked prefs
                                                                                   │
            generated-byte-identity (exists) <── byte-compare ─────────────────────┘
            release-identity (NEW)  <── tag pattern + version files + tracked update.xml + upstream/config/milestone.txt
            update-channel  (NEW)   <── generated .mozconfig  vs  structured channel mentions in git ls-files
            update-prefs    (NEW)   <── TARGETS' firefox-branding emitters (in memory)

patches/*.patch ──apply-patches.sh (git apply --3way, stages to index)──> upstream/ (index)
                                                                         │
                     regenerate-patches.sh --check:  git diff HEAD --abbrev=10 -- <+++ b/ paths>  ==bytes==  patches/NNN

rebase-upstream.yml (workflow_dispatch | workflow_call, input tag, no default)
   checkout → free disk → install Nix → scan-brand-residue → nix develop .#theia: generate / --check / identity
   → nix develop .#theia: rebase-upstream.sh --tag <tag> → nix develop .#theia: identity again

endpoint-allowlist.json {allow | deny | user-initiated}
   layer 3 (unattended, Gecko MOZ_LOG) : pass ⇔ allow
   layer 4 (session with a user action) : pass ⇔ allow ∪ user-initiated
```

### Recommended file layout (new or changed)

```
configuration.toml                         # [product] revision = 1; [urls] release_notes, homepage; [upstreams] pin
scripts/generate.mjs                       # releaseIdentity(), version emitters, channel line, link prefs, langpack
scripts/lib/config-schema.json             # product.revision (integer, required)
powerbrowser/packaging/version/            # NEW tracked comparands (version.txt, release.txt)
scripts/verify-release-identity.mjs        # NEW row + --self-test
scripts/verify-update-channel.mjs          # NEW row + --self-test
scripts/verify-update-prefs.mjs            # NEW row + --self-test
scripts/regenerate-patches.sh              # NEW: write | --check | --self-test
scripts/generate-licensing.mjs             # NEW: write | --check | --self-test
LICENSING.md, THIRD-PARTY-NOTICES.txt      # NEW tracked outputs
```

### Pattern 1: DIST-06, the pin bump (local, before any automation)

**Verified state:**
- `configuration.toml:114-116` reads verbatim:
  ```
  [upstreams]
  firefox_esr_tag = "FIREFOX_153_5_0esr_BUILD1"
  theia_release = "1.76.0"
  ```
- `rebase-upstream.yml:33` reads `        default: FIREFOX_153_5_0esr_BUILD1`.
- `git ls-remote` (2026-10-20): `6cd88e7d45fe7a5b0b87b984fb32a8779151860e refs/tags/FIREFOX_153_5_1esr_RELEASE`, and the same SHA for `_BUILD1`.
- `upstream/` is a depth-1 clone (`fetch-upstream.sh:315` `git clone --depth 1 --branch "$TAG" "$REMOTE" "$UPSTREAM_DIR"`). Its origin is the main checkout's local clone, which carries no 153.5.1 tags.

**Do:**
1. Edit `configuration.toml:115` to `firefox_esr_tag = "FIREFOX_153_5_1esr_RELEASE"` and `rebase-upstream.yml:33` to the same tag.
2. Run `node scripts/generate.mjs`.
3. Run `bash scripts/rebase-upstream.sh --tag FIREFOX_153_5_1esr_RELEASE`. It runs `rm -rf upstream`, clones from `https://github.com/mozilla-firefox/firefox.git`, applies the patches, runs check-patch-surface and the brand scan, then re-classifies. The previous re-pin took 340 s wall (clone 279 s) per `docs/BUILD.md:1149-1151`.
4. Update the other hand-written mentions: `README.md:87`, and the "Pinned ESR" paragraph at `docs/BUILD.md:1139-1149`, which records the commit SHA as identity. Leave the attributed timing rows #4/#5 at :580-581 as history.
5. Run `--quick`.

**Why it is low risk:** the GitHub compare from `FIREFOX_153_5_0esr_RELEASE` to `FIREFOX_153_5_1esr_RELEASE` lists 12 commits. The changed files include `browser/config/version.txt`, `version_display.txt` and `config/milestone.txt`. They do not include `browser/moz.configure`, `browser/moz.build`, `toolkit/mozapps/update/updater/moz.build` or any NSIS file, so every patch's preimage blob is unchanged and `patches-regenerated --check` stays byte-identical after the bump. [VERIFIED: gh api compare]

**Revision on the bump:** the first REL-01 commit sets `revision = 1`. Later ESR bumps reset the revision to 1, and AUTO-06 (Phase 43) owns that rule; state it in RELEASING.md when convenient.

### Pattern 2: REL-01, release identity through the generator

- Add `[product] revision = 1` as a TOML **integer**. Schema entry `product.revision`: `type: "integer"`, `required: true`, minimum 1.
  - `validate()` knows only `type === 'string'` today (`generate.mjs:1018-1023`), so it needs one integer branch.
  - **Integer is load-bearing:** `check-patch-surface.sh:119-127` puts every *required string* leaf of `[identity]`, `[product]` and `[legal]` into the brand-value set, but skips any value whose `typeof` is not string (`if (typeof value !== \"string\" || value === \"\") continue;`, line 125). A string revision `"1"` would flag every bounded `1` on a patch `+` line.
- Export `releaseIdentity(config)`, which returns `{esrVersion, revision, releaseKey, channel, marChannelId}`.
  - Parse the ESR version from the tag with `^[A-Za-z]+_(\d+)_(\d+)_(\d+)esr_RELEASE$`, so a `_BUILDn` pin is refused with a message naming `upstreams.firefox_esr_tag`. That is why REL-01 lands after DIST-06.
  - `FIXTURE_BASE` (`generate.mjs:4146`) uses `firefox_esr_tag = "ACME_1_2_3esr_RELEASE"`, which matches.
- Emit version files as new `TARGETS` rows with tracked comparands, and add them to `EXPECTED` in `scripts/verify-generated-identity.mjs:74`. Its "thirty-three" count comment (lines 4, 12, 18, 43) changes too. Recommended contents:
  - `powerbrowser/packaging/version/version.txt` holds the ESR version (`153.5.1`), the value a descriptor's `appVersion` must carry.
  - `powerbrowser/packaging/version/release.txt` holds the release key (`v153.5.1-1`).
- **Do not** emit `--with-version-file-path`. See Pitfall 3.
- **The `release-identity` row derives everything:**
  1. The tracked version files equal `releaseIdentity()`. This check always applies.
  2. When `upstream/` exists, `version.txt` equals the last line of `upstream/config/milestone.txt`. This catches a manifest pin that disagrees with the checkout.
  3. Every `git ls-files -- '*update.xml'` descriptor's `appVersion` equals the ESR version, and its `displayVersion`, if present, equals the key without the `v`. The tree has zero descriptors today, so the row prints that count by name.
  4. Release tags matching `^v\d+\.\d+\.\d+-\d+$` that do not point at HEAD compare strictly lower than the derived (major, minor, patch, revision). An empty set gets a named line. `verify.yml:46` uses `fetch-depth: 0`, so CI sees tags. The tree today has tags `v1.0` through `v1.4`, none of which match.
  5. If HEAD carries a release tag, it equals the derived key.
- **Self-test** in a mkdtemp git repo with a fixture manifest through `resolveConfig(fixturePath)`. Plants: a hand-written literal in `version.txt`; a tracked `update.xml` whose version disagrees with the key; HEAD tagged one revision higher; an equal tag on an older commit. Control: an untagged HEAD stays green with its named SKIP line.
- **Fixture churn, because `revision` is required:** `FIXTURE_BASE` (`generate.mjs:4128`) and every committed downstream fixture manifest need `revision = 1`. The fixture manifests are:
  - six under `.planning/milestones/v1.0-phases/07-sourcerer-as-downstream/fixtures/*/configuration.toml`
  - three under `.planning/milestones/v1.1-phases/09-extensions-crash-pipeline/fixtures/*/configuration.toml`

  The fixture driver is `verify-platform.sh:267-307`. `missing-required-key/expect-fail.txt` reads `identity.display_name`, which stays valid only if that fixture still omits nothing else. Also grep the scripts that write their own `[product]` tables: `verify-downstream-fixture.mjs`, `verify-extension-pins.mjs`, `verify-manifest-literals.mjs`, `verify-trademark-surface.mjs`, `verify-branding-identity.mjs`, `verify-branding-preflight.mjs`.
- `docs/REBRANDING.md` needs a `product.revision` row under `### [product]` (:244), because `verify-rebranding-docs.mjs` requires every schema key to appear.

### Pattern 3: UPD-11, one channel

**Verified state.** `.mozconfig:8-9` reads verbatim:
```
ac_add_options MAR_CHANNEL_ID=powerbrowser-default
ac_add_options ACCEPTED_MAR_CHANNEL_IDS=powerbrowser-default
```
`generate.mjs:1429` reads `` const marChannel = `${assertEmittable('identity.app_basename', config.identity.app_basename)}-default`; ``. No `--enable-update-channel` line exists, so configure uses `default="default"` (`init.configure:1196-1205`).

**Decision (recommended, to record in PROJECT.md Key Decisions):** update channel `default`, MAR channel id `<app_basename>-default` (`powerbrowser-default`).
- **Do** emit `ac_add_options --enable-update-channel=default` explicitly, so the channel can be derived from the generated `.mozconfig` as UPD-11 requires. The configure result is identical (same value), so this triggers a reconfigure, not a different build.
- Hold the channel as one exported generator constant, and build `marChannel` from it.
- **Do not add a manifest key.** One channel is platform policy: a second channel is Out of Scope. The precedent is the "FIXED platform content, not manifest keys" ruling for the telemetry-policy lines at `generate.mjs:1478-1488`. The MAR id already derives from `identity.app_basename`, so a rebrand needs no second edit.

**`update-channel` row:**
- Derive `{MOZ_UPDATE_CHANNEL, MAR_CHANNEL_ID, ACCEPTED_MAR_CHANNEL_IDS}` from the `.mozconfig` emission (call the `TARGETS` row's `emit` in memory).
- Derive the consumer set from `git ls-files` (scripts/, docs/, .github/, powerbrowser/, root files; exclude `.planning/` as history, as `verify-upstream-pins.mjs:164-171` does). Search with **structured patterns only**:
  - `MAR_CHANNEL_ID=<x>` and `ACCEPTED_MAR_CHANNEL_IDS=<x>`
  - `--enable-update-channel=<x>`
  - `--channel <x>` and `--mar-channel-id <x>`
  - `<x>/<BUILD_TARGET-shaped segment>/update.xml`
  - backticked `` `<app_basename>-<x>` `` channel ids
- Compare as set equality.
- **Never use a bare `powerbrowser-release` grep.** That string legitimately names the MAR key store (`~/.config/powerbrowser-release/mar-key/`, BUILD.md:758, RELEASING.md:330) and the runner unit (`github-runner-powerbrowser-release.service`, RELEASING.md:293,728).
- **Known red on today's tree, which the plan must fix:**
  - `docs/RELEASING.md:203` and `:361`: `release/Linux_x86_64-gcc3/update.xml`, which should be `default/...`
  - `:878`: the hypothetical `--enable-update-channel=release` sentence; reword it.
- `build-update-xml.mjs` and `release-manifest.json` do not exist yet (Phase 44/49). The derived consumer set picks them up when they land, with no edit to the row.
- Fold UPD-12's "no `AppUpdateURL` in `policies.json`" assertion into this row. It is the same "where updates come from" fact and needs a plant.

### Pattern 4: UPD-12, UPD-13 and UPD-25, update-origin prefs

**UPD-12.**
- `powerbrowser/distribution/policies.json:3` reads `    "AppUpdateURL": "https://updates.powerbrowser.org/update.xml",`. Delete that key only. `verify-webextensions.mjs` pins only `ExtensionSettings`, and its comment at :22 plus `generate.mjs:1952` say "three sibling keys"; update both comments.
- Consumers that must change in the same commit:
  - `verify-ng-064-update-url.mjs:65`: `if (policy.AppUpdateURL !== update) ...`. Invert it to require absence.
  - `verify-mar-update-hop.mjs`: `readPolicyUrl` (:177-191) and its static half (:193-213) read the tracked policy. Repoint the static half to the manifest via `resolveConfig().config.urls.update` (https, not a Mozilla host). Its self-test fixture write at :344 changes with it.
  - `endpoint-allowlist.json:22` (aus5 reason; it also wrongly says `--enable-unverified-updates`) and `:27` (updates.powerbrowser.org reason).
  - The `configuration.toml:78-82` comment.
- The loopback test-prefix `policies.json` at `docs/BUILD.md:915` is a test override and stays.

**UPD-13.**
- Upstream behaviour (read this session):
  - `aboutDialog.js:89-101` shows `#releasenotes` only if `app.releaseNotesURL.aboutDialog` exists and is not `about:blank`. The pref is unset today, so the link is hidden.
  - `aboutDialog-appUpdater.js:55-71` runs `new URL(Services.urlFormatter.formatURLPref("app.update.url.manual"))` inside a try. Today's `""` throws, the error is logged, and `.manualLink` / `#failedLink` get no href.
  - about:license is reached through `chrome://browser/content/license.html` (`browser/base/jar.mn:96-97`). It is unrelated to these prefs.
- The generator emits blanks at `generate.mjs:2373-2374`:
  ```
      'pref("app.update.url.manual", "");',
      'pref("app.update.url.details", "");',
  ```
- Replace those two lines with a splice point and add an exported derivation (for example `releaseLinkPrefs(config)`):

  | Pref | Source | When unset |
  |------|--------|-----------|
  | `app.releaseNotesURL` | `urls.release_notes` | `about:blank` |
  | `app.releaseNotesURL.aboutDialog` | `urls.release_notes` | `about:blank` |
  | `app.update.url.details` | `urls.release_notes` | `""` |
  | `app.update.url.manual` | `urls.homepage` | `""` |

- Manifest values: SEED-002 §7 says release notes are the GitHub Releases page, so state `release_notes = "https://github.com/DeBIOS-Foundation/powerbrowser/releases"` (repo remote verified: `origin https://github.com/DeBIOS-Foundation/powerbrowser.git`). State `homepage = "https://powerbrowser.org"`.
- Do **not** route these through `mozillaEndpointPrefs`. That function is the gate list for unattended callouts, and `verify-theia-endpoints.mjs` check 4 would then require allowlist `prefs` entries, which would turn layer 1 red on every unrebuilt objdir. `generated-byte-identity` already proves the tracked files equal the derivation.
- How verify-theia-endpoints treats the stated homepage, to record in the commit:
  - `manifestEndpointSources` (`generate.mjs:2645`, `for (const key of ['release_notes', 'update', 'crash_report', 'homepage', 'search'])`) already includes `urls.homepage` and `urls.release_notes`.
  - Check 2 requires each host to be *present* in any disposition.
  - powerbrowser.org is already present and already derived through `installer.support_url`; `generated/endpoint-hosts.json` today is `["powerbrowser.org","updates.powerbrowser.org"]`.
  - github.com becomes a newly derived host, so it **needs a new allowlist row** (`user-initiated`, optionally `"manifest": "urls.release_notes"`).
- Fix the stale generated comment at `generate.mjs:2479`, `// speculative prefetch. github.com stays a \`deny\` entry in`, in the same regeneration, since it becomes false. UPD-15 lists it, but leaving it in place while adding a github.com row is a contradiction.

**UPD-25.**
- Add `pref("app.update.langpack.enabled", false);` to `FIREFOX_BRANDING_BASE_LINES`. Upstream default is `true` at `browser/app/profile/firefox.js:175`. Regenerate and copy over both tracked branding files; both are byte-compared via `TARGETS` (`generate.mjs:3619-3620`, `3661-3662`).
- `update-prefs` row:
  - Call each `TARGETS` row whose `generated` ends in `pref/firefox-branding.js` (emit in memory).
  - Parse every `pref("app.update.*"` and `pref("app.releaseNotesURL*"`.
  - Assert none of these is set: `app.update.auto`, `app.update.staging.enabled`, `app.update.interval`, `app.update.promptWaitTime`, `app.update.badgeWaitTime`. These five names come from the requirement; all are verified upstream at `firefox.js:148,153` and in the branding templates.
  - Assert `langpack.enabled` is `false` in both variants.
  - Assert the four link prefs equal the derivation, and each non-blank value parses with `new URL()`, the exact call the dialog makes.
  - Self-test: plant `app.update.auto` into the emitted text.
- Leaving `app.update.interval` unset is safe: `nsUpdateService.manifest:1` registers `background-update-timer,app.update.interval,21600,86400`, a 6 h default.

### Pattern 5: UPD-33, the `user-initiated` disposition

Consumers of `disposition`, every one read this session:

| Consumer | Today | Change |
|---|---|---|
| `allowlist-schema` row, `verify-platform.sh:2620` | `!["allow", "deny"].includes(h.disposition)` | Accept `"user-initiated"` (this is the enum gate; "allowlist-doc-consistency accepts" in the requirement means this row) |
| `allowlist-doc-consistency`, `verify-platform.sh:2659` | filters `h.disposition === "allow"` Mozilla hosts | No change is needed to accept the value. Optionally include `user-initiated` Mozilla hosts; none exist |
| Layer 3, `verify-endpoints.sh:364` | `process.exit(match && match.disposition === "allow" ? 0 : 1);` | Already fails a `user-initiated` host, because the whole capture is unattended. Behaviour is unchanged; move the verdict into a shared function so the self-test exercises it |
| Layer 4, `verify-ng-069-sidecar-egress.mjs:44` | `covered = h => allow.some(...)`, so **any** disposition passes, `deny` included | This probe has a user action (an extension install), so pass `allow` and `user-initiated` and fail `deny`. This tightens the probe (risk: Open Q3) |
| `verify-theia-endpoints.mjs` check 2 | presence, any disposition | No change |
| Generator | reads no disposition (no allowlist read in `generate.mjs`) | No change; state this in the commit |

- Recommended shape: one pure function, for example in `scripts/lib/endpoint-verdict.mjs`: `violations(allowHosts, observedHosts, { userAction })`. Exact or leading-dot suffix match, as today. It is imported by layer 4 and called from layer 3's inline `node` (as an ES import).
- The self-test row runs layer 3's real extraction (the `grep -oE 'Resolving host \[[^]]+\]'` pipeline at `verify-endpoints.sh:420-424`) over a fixture log containing `Resolving host [powerbrowser.org]`, and requires red naming `powerbrowser.org`. Controls: the same host with `userAction` passes, and a `deny` host fails in both modes.
- Re-disposition two rows to `user-initiated`:
  - `powerbrowser.org`, currently `deny` at `:84-88`; rewrite its reason.
  - the new `github.com` row.
- Leave `open-vsx.org` and the AI provider hosts as `allow`. They are outside UPD-33's scope (Open Q3).

### Pattern 6: AUTO-08, a callable workflow inside Nix

Current workflow (`.github/workflows/rebase-upstream.yml`, read in full):
- `workflow_dispatch` only (:22-33).
- generate, `--check` and `verify-generated-identity` run bare at :108-115 and :136-137. Bare means no inkscape, so the workflow is red by construction; `verify.yml:15-20` records the identical failure "at the 16-pixel icon".
- `gh run list --workflow rebase-upstream.yml` returned no runs, which confirms this is the first real run.

Target shape:
```yaml
on:
  workflow_dispatch:
    inputs:
      tag:
        description: "Upstream Firefox-ESR tag to rebase onto"
        required: true
        type: string
  workflow_call:
    inputs:
      tag:
        description: "Upstream Firefox-ESR tag to rebase onto"
        required: true
        type: string        # required for workflow_call inputs
jobs:
  rebase:
    runs-on: ubuntu-latest
    timeout-minutes: 60
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4.4.0
        with: { persist-credentials: false }
      - name: Free disk space          # move ahead of Nix
      - uses: cachix/install-nix-action@13d8dd58da0234aa297dedd986986ccb8e7f3e24 # v31.11.1
      - run: node scripts/scan-brand-residue.mjs
      - run: nix develop .#theia --command node scripts/generate.mjs
      - run: nix develop .#theia --command node scripts/generate.mjs --check
      - run: nix develop .#theia --command node scripts/verify-generated-identity.mjs
      - env: { REBASE_TAG: "${{ inputs.tag }}" }
        run: nix develop .#theia --command bash scripts/rebase-upstream.sh --tag "$REBASE_TAG"
      - run: nix develop .#theia --command node scripts/verify-generated-identity.mjs
```
- Keep `${{ inputs.tag }}` in `env:`, never inline in `run:`. That is the existing pattern, and GH-12/zizmor in Phase 41 will enforce it.
- Fix the stale "~4-weekly" header comment at :1-4.
- Add no `outputs:` yet; AUTO-06 (Phase 43) adds what it consumes.
- [CITED: docs.github.com workflow-syntax: "`on.workflow_call.inputs` requires a `type` parameter"]

**`verify-upstream-pins.mjs` changes:**
- Step 2 at :297-308 currently requires exactly one tag literal in the workflow (`found.length !== 1 || found[0] !== expected`). Replace it:
  1. Remove `WORKFLOW_REL` from `sweepExcluded` (:164-171), so a tag literal there fails like anywhere else.
  2. Add an indentation-aware scan: for each `tag:` key inside an `inputs:` block, fail if a deeper-indented `default:` follows before the indent returns.
  3. Require both triggers to declare `tag`.
  4. Recommended addition: require every `run:` that invokes `scripts/generate.mjs` or `verify-generated-identity.mjs` to start with `nix develop .#theia --command`. This guards against an R1 regression.
- Self-test plant 1 (:532-555, "drifted workflow mirror") becomes:
  - "a `default:` reintroduced under the `workflow_call` tag input": red, naming the workflow
  - "a tag literal in the workflow": red, naming the workflow
  - optionally "a bare generate step"
- Update the header comment (:19-22, :34-36).

**Owner dispatch after push (the plan ends with these commands, and does not run them):**
```sh
git push origin workspace/deploy
gh workflow run rebase-upstream.yml --ref workspace/deploy -f tag=FIREFOX_153_5_1esr_RELEASE
gh run watch "$(gh run list --workflow rebase-upstream.yml --limit 1 --json databaseId -q '.[0].databaseId')"
```
The workflow is already registered on the default branch (`gh workflow list`: "Rebase upstream active 350520027"), so a `--ref` dispatch runs this branch's file. [ASSUMED: GitHub dispatch-on-ref semantics; standard behaviour]

### Pattern 7: PKG-08, licence notices

Three inputs:

1. **about:license (Gecko).** This session, upstream's preprocessor reproduced the built file byte-for-byte:
   ```python
   import sys, io, os; sys.path.insert(0, 'python/mozbuild')     # cwd = upstream/
   from mozbuild.preprocessor import Preprocessor
   pp = Preprocessor()
   pp.context.update({'MOZ_JXL': '1', 'MOZ_ZUCCHINI': '1', 'XP_LINUX': '1',
                      'APP_LICENSE_BLOCK': os.path.abspath('browser/base/content/overrides/app-license.html')})
   out = io.StringIO(); pp.out = out; pp.do_include('toolkit/content/license.html')
   ```
   - The defines are exactly those of the 13 condition names in `license.html` that `objdir/config.status` sets for the Linux build.
   - Result: `diff` with `objdir/dist/bin/browser/chrome/browser/content/browser/license.html` gave 0 lines (main checkout, 153.5.0 objdir).
   - At quick tier there is no `config.status`. Record the define set in the tracked notices' header line. The `--check` re-derivation reads it from there. A full-tier assertion (or the Phase 45 release build) compares the header set with the release objdir's `config.status`.
   - Convert the HTML to text with a small tag-strip and entity decode, or ship the preprocessed HTML as a section; this is planner's discretion.
2. **Theia dependency licences.**
   - `yarn licenses generate-disclaimer --production` works offline (0.6 s, 908 KB), but its first line carries a random `WORKSPACE AGGREGATOR <uuid>` that differs on every run. It also needs yarn, which a quick row cannot use outside the shell, and it includes devDependencies (`typescript` and `mocha` appeared).
   - **Use a node walk instead:** start from `theia/applications/browser/package.json` `dependencies`, resolve recursively through `theia/node_modules` using Node resolution, take `license` plus `LICENSE*`/`LICENCE*`/`COPYING*`/`NOTICE*` text, group identical texts, sort, and skip workspace `@powerbrowser/*` packages. This is the closure `package-linux.sh:47,57-60` ships (`lib/` plus `better-sqlite3`).
3. **Node.**
   - `package-linux.sh:61` already extracts `node-v24.19.0-linux-x64/LICENSE` into the package.
   - The text exists only inside the pinned archive `https://nodejs.org/dist/v24.19.0/node-v24.19.0-linux-x64.tar.xz`, sha256 `14b342e7...` (`node-runtime.json`). The Nix node has no LICENSE file. The archive is cached at the main checkout's `.mozbuild/node-dist/`, not in this worktree.
   - Recommended: the generator reads the archive, downloading and verifying the pin if it is absent, as package-linux.sh does. `--check` always asserts that the Node section header names `node-runtime.json`'s version. It byte-re-derives the Node text only when the archive is cached; otherwise it prints a named SKIP line for that section alone.

**Tracked outputs and the gates they touch:**
- `LICENSING.md` and `THIRD-PARTY-NOTICES.txt` at the repo root.
- LICENSING.md derives the product licence from `legal.license` (`PolyForm Noncommercial 1.0.0`) and the holder from `legal.copyright_holder`, so it carries the multi-word literal "DeBIOS Foundation". **`verify-manifest-literals.mjs` will flag it** unless an `EXCLUDED_FILES` entry is added with a reason ("derived output"). The same applies to the notices if they quote a manifest literal.
- Stage both files before running the brand scan.
- Upkeep: every ESR or Theia bump changes the notices. AUTO-06 (Phase 43) and Renovate (Phase 51) must run the licensing generator, or the drift row turns their PRs red. Record this as a Phase 43/51 input.

### Pattern 8: AUTO-10, `regenerate-patches.sh`

Executed this session. All four patches were IDENTICAL:
```sh
GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1 \
git -C upstream -c core.abbrev=10 diff --no-ext-diff --no-color --no-textconv \
    --diff-algorithm=myers --abbrev=10 HEAD -- $(grep -E '^\+\+\+ b/' "$p" | sed 's#^+++ b/##')
```
- Headers are plain `git diff` output, with no mbox header. For example `patches/010:1-4`: `diff --git a/browser/moz.configure b/browser/moz.configure` / `index 3ea3d88b93..89317a4be2 100644`. `040` carries mode `100755` on `installer.nsi`. The patches touch disjoint files: 010 `browser/moz.configure`; 020 `browser/moz.build`; 030 `toolkit/mozapps/update/updater/moz.build`; 040 `defines.nsi.in` and `installer.nsi`.
- Modes:
  - write mode: regenerate each tracked patch in place
  - `--check`: regenerate into a temp file and `cmp` against each tracked patch; red names the patch
  - `--self-test`: hermetic mkdtemp git repo. Commit a file, modify it, `git add`, generate a patch with the script's own function, then plant one edited `+` line in a copy. `--check --upstream <tmp> --patches <tmpdir>` must go red naming that patch, and the unedited copy must stay green.
- Empty output is a named failure telling the user to run `scripts/apply-patches.sh` (an unpatched or pristine `upstream/`). A missing `upstream/` is a named failure, never a skip. The row is quick because CI's verify.yml already provides an applied `upstream/` (`verify.yml:79-80`).
- Why a hand-edited hunk goes red: `apply-patches.sh` applies the edited patch, so the regenerated `index` post-image hash differs from the stale one in the edited file. If the 3-way apply silently no-ops, the regenerated body differs instead. Both cases are red.

### Anti-Patterns to Avoid

- **Bare-string channel greps.** `powerbrowser-release` is also a key-store path and a runner name (Pattern 3).
- **Feeding `--with-version-file-path` with a revisioned display version.** It flips `IS_ESR` (Pitfall 3).
- **Routing the About-dialog prefs through `mozillaEndpointPrefs`.** It turns layer 1 red on unrebuilt objdirs and mislabels click destinations as unattended gates.
- **Calling yarn from a quick row.** It fails outside `nix develop .#theia`.
- **Reading `yaml` from `theia/node_modules` in `scripts/`.** It adds a Theia-install dependency to a pin checker.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Preprocessing `license.html` | A JS reimplementation of `#ifdef`/`#includesubst` | `upstream/python/mozbuild/mozbuild/preprocessor.py` via python3 | Reproduced byte-identical this session |
| Patch diffs | A custom differ, or `--full-index` | `git diff HEAD --abbrev=10` with pinned config | Byte-identical with the tracked patches |
| Version comparison in the updater | Assumptions about revision ordering | Upstream `updateIsAtLeastAsOldAs` semantics (equal version plus different buildID means offered) | Read at `UpdateService.sys.mjs:1954-1963` |
| Manifest parsing in new checks | Ad-hoc TOML reads | `resolveConfig()` from `generate.mjs` (exported, takes a manifest path) | Same resolver as the generator, so the gates cannot disagree |
| Endpoint host matching | A new matcher | The existing exact or leading-dot rule, moved into one shared function | Three copies exist today (`verify-endpoints.sh:358-361`, `ng069:44`, theia-endpoints) |

## Common Pitfalls

### Pitfall 1: `git diff` without `HEAD` regenerates nothing
**What goes wrong:** the 0-byte output makes every patch look "regenerated empty", or a write mode truncates the patches. **Why:** `git apply --3way` stages to the index (`upstream` `git status` shows `M ` in column 1 for all five files). **Avoid:** use `diff HEAD`, and pin `core.abbrev`, `--diff-algorithm=myers` and `--no-ext-diff`/`--no-color`, with global and system config off. **Warning sign:** any regenerated patch smaller than its tracked copy.

### Pitfall 2: the update-channel row red on day one
`docs/RELEASING.md:203,361` (`release/...` path) and `:878` (`--enable-update-channel=release`) are real drift. The plan must correct them in the same commit that lands the row, or the row ships red.

### Pitfall 3: the display version and `IS_ESR`
`init.configure:1151`: `is_esr=app_version_display.endswith("esr") or None`. Consumers: `RustSharedRemoteSettingsService.sys.mjs:44` (`channel: AppConstants.IS_ESR ? "esr" : AppConstants.MOZ_UPDATE_CHANNEL`), `SearchUtils.sys.mjs:361`, `EnterprisePoliciesParent.sys.mjs:634`, and `backgroundtasks.js:61`. A `153.5.1-1` display version would silently move Remote Settings and search config to the `default` channel. Keep Gecko's own version files.

### Pitfall 4: rows that read the built tree
This worktree has **no objdir**. `mar-update-hop`, `ng064` and `verify-endpoints` are full tier, and they will read `policies.json` and the prefs differently after UPD-12/13. Change their comparands in the same commit, and do not claim them green without a build. A live About-dialog check (success criterion 3) needs a tier-3 dev build in this worktree, roughly 40-55 min on legion per BUILD.md timings. Schedule it once, at the end of the phase. The build also proves 153.5.1 compiles.

### Pitfall 5: the brand-value and manifest-literal scans
A required **string** under `[product]` enters `check-patch-surface`'s value set. Generated docs carrying "DeBIOS Foundation" trip `verify-manifest-literals`. Both scans read `git ls-files`, so stage first.

### Pitfall 6: `planning-paths` row
New scripts must not reference live `.planning/workstreams/deploy/phases/...` paths (`verify-platform.sh:4625-4626`). Keep provenance in comments without paths, or point at archived paths.

### Pitfall 7: notices drift on every bump
After PKG-08, each ESR or Theia bump PR is red until the notices are regenerated. Hand this to Phase 43 (bump job) and Phase 51 (Renovate).

### Pitfall 8: the tag name is not identity
`docs/BUILD.md:1141-1146` records that `_RELEASE` and `_BUILDn` tags have moved before (at 153.4). Record `6cd88e7d45fe7a5b0b87b984fb32a8779151860e` in the DIST-06 commit message and in BUILD.md's pinned-ESR paragraph.

## Code Examples

### releaseIdentity (shape only; values come from the manifest)
```js
// scripts/generate.mjs (new export). Tag shape per DIST-06; FIXTURE_BASE uses ACME_1_2_3esr_RELEASE.
const ESR_TAG = /^[A-Za-z]+_(\d+)_(\d+)_(\d+)esr_RELEASE$/;
export function releaseIdentity(config) {
    const m = ESR_TAG.exec(config.upstreams.firefox_esr_tag);
    if (!m) report([`upstreams.firefox_esr_tag is ${JSON.stringify(config.upstreams.firefox_esr_tag)}, which names no ESR release. Write a *esr_RELEASE tag in ${MANIFEST_NAME}, then run: ${RERUN}`]);
    const esrVersion = `${m[1]}.${m[2]}.${m[3]}`;
    const revision = config.product.revision;            // integer, schema-validated
    return { esrVersion, revision, releaseKey: `v${esrVersion}-${revision}`,
             channel: UPDATE_CHANNEL, marChannelId: `${config.identity.app_basename}-${UPDATE_CHANNEL}` };
}
```

### Registry rows (append to the `--quick` array, honesty comment first)
```bash
    # NEW (Phase 40, REL-01): ... Honestly --quick: git plumbing and text reads only.
    "release-identity|node $REPO_ROOT/scripts/verify-release-identity.mjs"
    "release-identity-self-test|node $REPO_ROOT/scripts/verify-release-identity.mjs --self-test"
    "update-channel|node $REPO_ROOT/scripts/verify-update-channel.mjs"
    "update-channel-self-test|node $REPO_ROOT/scripts/verify-update-channel.mjs --self-test"
    "update-prefs|node $REPO_ROOT/scripts/verify-update-prefs.mjs"
    "update-prefs-self-test|node $REPO_ROOT/scripts/verify-update-prefs.mjs --self-test"
    "patches-regenerated|bash $REPO_ROOT/scripts/regenerate-patches.sh --check"
    "patches-regenerated-self-test|bash $REPO_ROOT/scripts/regenerate-patches.sh --self-test"
    "licensing|node $REPO_ROOT/scripts/generate-licensing.mjs --check"
    "licensing-self-test|node $REPO_ROOT/scripts/generate-licensing.mjs --self-test"
    "endpoint-dispositions-self-test|bash $REPO_ROOT/scripts/verify-endpoints.sh --disposition-self-test"
```
The dispatch accepts only `bash */*` or `node */*` commands (`verify-platform.sh:5024`). Use the existing label `verify-upstream-pins` for AUTO-08; it already exists at :3656-3657.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `AppUpdateURL` policy as the effective update URL | `MOZ_APPUPDATE_HOST` baked from `[urls].update` (NG-064) | NG-064 landed the host half; UPD-12 removes the policy | One source |
| Pin at `_BUILD1` tags | Pin at `_RELEASE` tags | DIST-06 | AUTO-01's detector lists `_RELEASE` only |
| Workflow default mirrors the manifest | No default; the caller passes `tag` | AUTO-08 | An ESR bump never edits a workflow file (an App without Workflows permission can push the bump) |

**Deprecated/outdated:**
- SUMMARY correction 7's literal command (`git -C upstream diff --abbrev=10`): needs `HEAD`.
- ARCHITECTURE.md line 73 (`--full-index`): superseded by correction 7.
- `powerbrowser/packaging/version-nplus1/*` (`153.1.1`/`153.1.1esr`) is older than the pin. That matters only for the Phase 44/50 hop drill.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Channel `default` is the right single channel. A rebuild to `release` buys nothing, given patch 030 and IS_ESR | Pattern 3 | If the owner wants `release`: one tier-3 rebuild plus re-proof of ng065/mar-update-hop, and RELEASING.md flips the other way |
| A2 | Version files are release metadata, not a Gecko input. The revision is not visible in the About dialog | Pattern 2, Pitfall 3 | If the owner wants the revision shown in-app, it needs a display version ending in `esr`, which is untested |
| A3 | `release.txt` naming and `powerbrowser/packaging/version/` location | Pattern 2 | Cosmetic; Phase 44/49 consumers read whatever is chosen |
| A4 | The Node licence section may SKIP byte-re-derivation, by name, when the pinned archive is not cached | Pattern 7 | A Node bump with stale text passes the quick row until a release build; the version check still catches a version mismatch |
| A5 | about:license define set {MOZ_JXL, MOZ_ZUCCHINI, XP_LINUX} holds for the release container build (Phase 45) | Pattern 7 | Notices are off by a few entries; the full-tier cross-check catches it |
| A6 | `gh workflow run --ref workspace/deploy` runs this branch's workflow file | Pattern 6 | The owner dispatches from main after merge instead |
| A7 | The Theia node-walk closure equals what the bundle ships | Pattern 7 | It over-includes, never under-includes, if the walk follows `dependencies` only |
| A8 | Tightening layer 4 (ng069) to fail `deny` hosts does not break an existing green run | Pattern 5 | ng069 is full tier and was not run here; if it goes red, a real denied host was being contacted after an extension install |

## Open Questions (RESOLVED)

1. **Who makes the DIST-06 commit?**
   - What we know: ROADMAP's external gate says "Owner commits the pin bump". CONTEXT.md (same date, later) limits owner gates to push and dispatch.
   - Recommendation: the executor commits locally, and the owner pushes and dispatches. The planner should put a `checkpoint:human-verify` before the push.
   - RESOLVED: the executor commits locally in 40-01; push and first dispatch are the owner's `checkpoint:human-action` in 40-08 Task 3.
2. **Should `app.update.url.manual` point at a download page rather than the site root?**
   - What we know: UPD-13 says it derives from `[urls].homepage`. SEED §7 plans a `/download` page.
   - Recommendation: follow the requirement and use the homepage. A `urls.download` key is a later decision; adding it now is scope creep.
   - RESOLVED: homepage, per UPD-13 (40-05, 40-08).
3. **Layer 4 strictness (A8).**
   - Recommendation: adopt the shared verdict function with `userAction: true`, and run ng069 at the end-of-phase build if time allows. Otherwise record it as unverified.
   - RESOLVED: the shared verdict function (40-05) is the UPD-33 mechanism; tightening ng069 layer 4 is out of scope (40-08 Deferred).
4. **The `app-license.html` attribution.**
   - What we know: about:license prints "Binaries of this product have been made available to you by the Mozilla Project", read verbatim from `browser/base/content/overrides/app-license.html`. That is false for PowerBrowser binaries.
   - Recommendation: out of Phase 40 scope (PKG-05 and trademark work). Note it in LICENSING.md, and raise it for Phase 45/46. Fixing it needs either a patch (an `APP_LICENSE_BLOCK` override) or a branding define.
   - RESOLVED: deferred to Phase 45/46 (40-08 Deferred).
5. **Ledger entries.**
   - What we know: `ledger/REQUIREMENTS.json` holds only NG-001..NG-089.
   - Recommendation: the v1.6 IDs need no ledger rows unless the phase gate demands them; check `scripts/phase-gate.py` at plan time.
   - RESOLVED: `scripts/phase-gate.py` checks only due rows in the ledger's current phase (unset); no v1.6 ledger rows are created (40-08 Deferred).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| node | all rows | ✓ | v24.21.0 | — |
| python3 | licensing preprocessor | ✓ host and `.#theia` | system | — |
| git | regeneration | ✓ | 2.54.0 | — |
| inkscape (pinned) | generate | ✓ | 1.4.4 | `nix develop .#theia` |
| nix | `.#theia`, `.#firefox` | ✓ | — | — |
| gh | compare, dispatch commands (owner) | ✓ | — | — |
| Network to github.com/mozilla-firefox | DIST-06 re-clone (about 1.1 GB, about 5 min) | ✓ (ls-remote worked) | — | — |
| `upstream/` at the pin with patches applied | quick rows, AUTO-10 | ✓ (153.5.0 BUILD1) | — | `rebase-upstream.sh` re-materialises it |
| objdir in this worktree | live About-dialog check; full-tier rows | ✗ | — | One tier-3 dev build at the end of the phase (about 40-55 min), or human-verify on a build |
| Pinned Node archive in `.mozbuild/node-dist/` | Node licence text | ✗ in this worktree (present in the main checkout) | v24.19.0 | Download with the sha256 pin, as package-linux.sh does |
| zizmor | — (Phase 41) | ✗ | — | not needed now |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** objdir (one build), Node archive (pinned download).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `scripts/verify-platform.sh` registry plus per-script `--self-test` (node built-ins, bash) |
| Config file | none (rows are the `CHECKS=(` array, `verify-platform.sh:3565`) |
| Quick run command | `scripts/verify-platform.sh --only <label>` |
| Full suite command | `scripts/verify-platform.sh --quick` (58 s, green, 2026-10-20) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DIST-06 | Manifest pin = workflow default = fragment; upstream at 6cd88e7d | quick | `scripts/verify-platform.sh --only verify-upstream-pins && test "$(git -C upstream rev-parse HEAD)" = 6cd88e7d45fe7a5b0b87b984fb32a8779151860e` | ✅ |
| DIST-06 | First real workflow run green | manual (owner) | `gh run watch <id>` | — |
| AUTO-08 | No `tag` default; generate inside Nix | quick + self-test | `--only verify-upstream-pins` / `--only verify-upstream-pins-self-test` | ✅ (extend) |
| REL-01 | Version files and tags agree with the derivation | quick + self-test | `--only release-identity` / `--only release-identity-self-test` | ❌ Wave 0 |
| UPD-11 | One channel across consumers | quick + self-test | `--only update-channel` / `--only update-channel-self-test` | ❌ Wave 0 |
| UPD-12 | No `AppUpdateURL` | quick (in update-channel) + full | `--only update-channel`; `--only ng064-update-url-from-manifest` (needs build) | ❌ / ✅ (edit) |
| UPD-13 | Link prefs derived; parse as URLs | quick | `--only update-prefs`, `--only generated-byte-identity` | ❌ / ✅ |
| UPD-13 | Dialog links open without throwing | manual / full | About dialog on a rebuilt dev objdir | — |
| UPD-33 | `user-initiated` accepted; unattended red naming host | quick | `--only allowlist-schema`, `--only endpoint-dispositions-self-test` | ✅ (edit) / ❌ |
| UPD-25 | langpack false; five prefs absent | quick + self-test | `--only update-prefs` / `--only update-prefs-self-test` | ❌ |
| PKG-08 | Notices equal re-derivation | quick + self-test | `--only licensing` / `--only licensing-self-test` | ❌ |
| PKG-09 | en-US stated | grep in plan verify | `grep -n 'en-US' README.md .planning/PROJECT.md` | ✅ (edit) |
| AUTO-10 | Patches equal regeneration; hand edit red | quick + self-test | `--only patches-regenerated` / `--only patches-regenerated-self-test` | ❌ |

### Sampling Rate
- **Per task commit:** `scripts/verify-platform.sh --only <new label>` and its `-self-test`, then `node scripts/scan-brand-residue.mjs` after `git add`.
- **Per wave merge:** `scripts/verify-platform.sh --quick`.
- **Phase gate:** `--quick` green, plus one dev build with `--only ng064-update-url-from-manifest`, `--only mar-update-hop` and the manual About-dialog check, before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `scripts/verify-release-identity.mjs`: REL-01
- [ ] `scripts/verify-update-channel.mjs`: UPD-11, UPD-12
- [ ] `scripts/verify-update-prefs.mjs`: UPD-13, UPD-25
- [ ] `scripts/regenerate-patches.sh`: AUTO-10
- [ ] `scripts/generate-licensing.mjs`: PKG-08
- [ ] `verify-endpoints.sh --disposition-self-test` plus a shared verdict function: UPD-33

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | — |
| V3 Session Management | no | — |
| V4 Access Control | yes (CI) | `permissions: contents: read`, `persist-credentials: false` kept in the called workflow |
| V5 Input Validation | yes | Schema regex and integer type on manifest values; `assertEmittable` on every pref and mozconfig interpolation; `rebase-upstream.sh:60` tag shape `^[A-Za-z0-9._-]+$` |
| V6 Cryptography | no change | MAR signing untouched (patch 030 is not regenerated with new content) |
| V10 Malicious code / supply chain | yes | SHA-pinned actions; regeneration gate on patches; no new packages |
| V14 Configuration | yes | One update URL source; `user-initiated` cannot widen unattended egress |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Template injection via `inputs.tag` in `run:` | Tampering | Pass through `env:` (existing); tag-shape check in `rebase-upstream.sh` |
| Hand-edited patch hunk that silently no-ops | Tampering | `patches-regenerated --check` byte equality |
| Two update URL sources disagreeing (policy beats application.ini) | Spoofing | Delete `AppUpdateURL`; ng064 asserts absence |
| A `user-initiated` host fetched unattended (prefetch) | Information disclosure | Layer 3 fails non-`allow`; `network.dns.disablePrefetch=true` stays; self-test plant |
| Release tag not matching the shipped version | Repudiation | `release-identity` |
| Incomplete third-party notices | Legal and compliance | Derived notices with a drift row; full-tier define cross-check |

## Sources

### Primary (HIGH confidence)
- In-tree files read or executed this session: `configuration.toml`; `scripts/generate.mjs` (:1424-1450, 1520-1580, 2340-2760, 3425-3470, 4128-4190, 940-1040); `scripts/lib/config-schema.json`; `scripts/check-patch-surface.sh:102-167`; `scripts/verify-upstream-pins.mjs`; `scripts/verify-theia-endpoints.mjs`; `scripts/verify-endpoints.sh`; `scripts/verify-ng-064-update-url.mjs`; `scripts/verify-ng-069-sidecar-egress.mjs`; `scripts/verify-mar-update-hop.mjs:50-230`; `scripts/verify-platform.sh` (:2605-2750, 3555-3660, 4600-4630, 4996-5035); `scripts/apply-patches.sh`; `scripts/fetch-upstream.sh`; `scripts/rebase-upstream.sh`; `.github/workflows/rebase-upstream.yml`; `.github/workflows/verify.yml`; `powerbrowser/endpoint-allowlist.json`; `powerbrowser/distribution/policies.json`; `powerbrowser/packaging/package-linux.sh`; `node-runtime.json`; `patches/*.patch`; `docs/RELEASING.md:860-895`; `docs/BUILD.md:1136-1152`
- Upstream (153.5.0): `build/moz.configure/init.configure:1140-1211`; `browser/base/content/aboutDialog.js:88-101`; `aboutDialog-appUpdater.js:55-71`; `UpdateService.sys.mjs:1954-1975`; `nsUpdateService.manifest:1`; `toolkit/content/license.html`; `browser/base/jar.mn:96-97`; `docshell/base/nsAboutRedirector.cpp:141`
- Executions: patch regeneration (4/4 identical); about:license reproduction (0 diff lines); `yarn licenses generate-disclaimer` (nondeterministic line 1); `git ls-remote` tags; `gh api compare`; `gh run list`; `--quick` (58 s, PASS)

### Secondary (MEDIUM confidence)
- docs.github.com workflow syntax (`workflow_call` inputs require `type`)

### Tertiary (LOW confidence)
- None used for recommendations.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH. No new packages; all tools probed.
- Architecture: HIGH. Every integration point read; regeneration and license reproduction executed.
- Pitfalls: HIGH for 1-3 and 5-8 (observed); MEDIUM for 4 (no objdir here to run the full rows).

**Research date:** 2026-10-20
**Valid until:** 2026-10-27 (ESR 153.6 ships that day; DIST-06's target becomes one behind, which does not invalidate the mechanics)
