# Phase 55: macOS (I) - Research

**Researched:** 2026-10-23
**Domain:** macOS universal DMG + MAR, Developer ID signing, notarization, entitlements gate, hosted macOS runners
**Confidence:** MEDIUM overall (HIGH in-tree/upstream mechanics; MEDIUM signing/update wiring; LOW live Apple flag-I items that need owner credentials)

<user_constraints>
## User Constraints (from CONTEXT.md — verbatim copy)

# Phase 55: macOS (I) - Context

**Gathered:** 2026-10-23
**Status:** Ready for planning
**Mode:** Auto-generated (discuss skipped via workflow.skip_discuss)

<domain>
## Phase Boundary

macOS users install a signed, notarized universal DMG that updates itself.

Requirements: SEC-13, PKG-24, PKG-14, PKG-15, PKG-16, SEC-04 (full text in `.planning/workstreams/deploy/REQUIREMENTS.md`).

Depends on: Phase 47 (live site for the fee waiver), Phase 50 (release pipeline).
</domain>

<decisions>
## Implementation Decisions

### Already decided (owner, 2026-10-20)
- All owner decisions in REQUIREMENTS.md "Owner Decisions" are binding (SEED-002 §12 recommended defaults plus the research additions): Apps only, no PATs; signing only on GitHub-hosted runners behind the `release` environment; D-77 no `schedule:` in the product repo; 24-hour canary wait with owner `release` and `descriptor` approvals; Apple enrolment after the Phase 47 site is live with a D-U-N-S number; Homebrew cask only after notarization.
- SEC-13 is a record-before-build gate: the Apple SDK licence position for cross builds, rcodesign's maintenance status and the Developer ID CA expiry date are checked and recorded before any Phase I build.
- PKG-24: the quick row `mac-entitlements` fails on any `43AQ936H96`, `org.mozilla` or restricted entitlement key in the signing inputs derived from `developer/browser.xml`; its self-test plants each.
- SEC-04: the bundle is signed inside-out with a Developer ID (natives, `node`, `rg`, then frameworks, then the bundle) and notarized through an App Store Connect API key held as a `release` secret, with the Team ID supplied by a hook-only patch.

### Owner gates in this phase (stop points for autonomous execution)
- Every live Apple action is an owner action: requesting the D-U-N-S number, Apple Developer Program enrolment with the nonprofit fee-waiver application (after the Phase 47 site is live), creating and storing the Developer ID certificate and the App Store Connect API key (held as a `release` secret), and any signing or notarization submission that needs those credentials.
- Any real-Mac session (hosted `macos-26` runner use beyond what an agent can dispatch, borrowed/rented Mac install matrix, Gatekeeper observation) is an owner action or owner-provisioned host. Plans build everything locally (cross-toolchain probe, mozconfigs, branding inputs, universal build shape, DMG shape, entitlements row, signing/notarization wiring, matrix record shape) and end with one `checkpoint:human-action` listing the exact commands and observations, after which the live rows run.
- Read-only probes that need no Apple credential (SDK licence text, rcodesign release status, Developer ID CA expiry from public data, upstream source reads) are agent actions.

### Assumptions about unfinished dependencies (recorded per autonomous rules)
- A1: Phase 47 (live site, `powerbrowser-updates` on Cloudflare Pages, WEB-01..05) is assumed as written in ROADMAP.md/REQUIREMENTS.md: the fee-waiver application can proceed because the site is live, and per-target Darwin descriptors have a host. If Phase 47 changes the updates host or the download-page contract, Phase 55 plans cite the host/path only through the shared descriptor builder and download-copy gate so the change is absorbed.
- A2: Phase 50 (release pipeline, `release.yml`, TRAIN-10/BULDING..DONE states, UPD-16 hop drill, channel-live) is assumed as written: a `build-macos` job shape, a per-OS sign job, per-target descriptors and the draft-then-publish gate exist to attach the macOS job to. If Phase 50 changes the release job names or the manifest asset set, the macOS job follows the same `build-*`/`matrix-*` and `contents: read` conventions the `workflows` row enforces.
- A3: Phase 41 waits on the owner (repos, Apps, second owner, probes). Phase 55 plans assume the GH-05 tag ruleset, the five environments with branch policy `main`, and the `workflows` row (no `schedule:`, legion label only in `release.yml` `build-*`/`matrix-*`, SHA-pinned admitted `uses:`) hold as written, and add no second mechanism.

### Claude's Discretion
All other implementation choices are at Claude's discretion — discuss phase was skipped per user setting. Use the ROADMAP phase goal, success criteria, and codebase conventions to guide decisions.
</decisions>

<code_context>
## Existing Code Insights

Start from `.planning/research/v1.6-deploy/SUMMARY.md` Phase I and §"Also" (mac-entitlements row, MAR-channel match, inside-out signing), `.planning/research/v1.6-deploy/ARCHITECTURE.md`, `.planning/drafts/distribution/S7-macos-adhoc-signed-PLAN.md` (ad-hoc predecessor: toolchain probe, `.#firefox-macos` shell shape, per-target mozconfig split, five branding inputs, universal build through `unify.sh`/`unify.py`, staged darwin sidecar, download copy gate, borrowed-Mac matrix), `upstream/taskcluster/scripts/misc/unify.sh`, `upstream/toolkit/mozapps/installer/unify.py`, `upstream/tools/signing/macos/mach_commands.py` (`macos-sign --use_rcodesign`), `powerbrowser/packaging/` (mar, node-runtime.json, package-linux.sh analog), `scripts/generate.mjs` (emitMozconfig, TARGETS rows), `scripts/verify-platform.sh` (registry; every new check is one row plus `--self-test`), `docs/RELEASING.md` (macOS rows, macos-adhoc-signed deferred record) and `docs/BUILD.md` (packaging-hosts capability record, per-OS install matrix).
</code_context>

<specifics>
## Specific Ideas

- Research flag I: the Apple SDK licence position for cross builds on Linux; whether rcodesign is still viable (maintenance status, version); the Developer ID CA expiry date.
- The `mac-entitlements` row derives its expectation from the signing inputs (`developer/browser.xml` shape) at check time and compares as set equality, red on both addition and removal; its self-test plants `43AQ936H96`, `org.mozilla` and one restricted entitlement key, each required to go red naming the drift.
- Inside-out signing order (natives, `node`, `rg`, then frameworks, then the bundle) with the Team ID from a hook-only patch regenerated through `scripts/regenerate-patches.sh`, never text-edited; `check-patch-surface.sh` guards the surface.
- Universal DMG plus complete MAR through `unify.sh`; darwin sidecar built per architecture on hosted macOS runners with natives/`rg`/`node` merged by `lipo`; `package-target-natives` passes on the DMG.
- One Mac matrix row on a hosted runner against the draft DMG plus one real Mac session recording the Gatekeeper copy; user-facing copy names "PowerBrowser" with no internal identifier and states the signing/notarization status honestly.

</specifics>

<deferred>
## Deferred Ideas

None — discuss phase skipped.
</deferred>
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SEC-13 | Apple SDK licence position for cross builds, rcodesign maintenance status and Developer ID CA expiry checked and recorded before Phase I builds | §State of the Art (flag I), §Open Questions, §Assumptions Log; record-before-build gate |
| PKG-24 | Quick row `mac-entitlements` fails on any `43AQ936H96`, `org.mozilla` or restricted entitlement key in signing inputs derived from `developer/browser.xml`; self-test plants each | §Architecture Patterns Pattern 2, §Code Examples, §Validation Architecture |
| PKG-14 | Universal DMG plus complete MAR through `unify.sh`; Gecko cross-built on legion in `release.yml` `build-macos` with bootstrap macOS SDK; hosted `macos-26` fallback recorded | §Standard Stack, §Architecture Patterns Pattern 1, §Pitfalls |
| PKG-15 | Darwin Theia sidecar per-arch on hosted macOS runners; natives, `rg`, `node` merged with `lipo`; `package-target-natives` passes on DMG | §Standard Stack, §Architecture Patterns Pattern 3, §Pitfalls |
| PKG-16 | Mac matrix row on hosted macOS runner against draft DMG; one real Mac session records Gatekeeper copy | §Validation Architecture, §Environment Availability |
| SEC-04 | Bundle signed inside-out with Developer ID (natives, `node`, `rg`, then frameworks, then bundle) and notarized via App Store Connect API key as `release` secret; Team ID via hook-only patch | §Standard Stack, §Architecture Patterns Pattern 4, §Security Domain |
</phase_requirements>

## Summary

Phase 55 turns the ad-hoc-signed predecessor (S7 draft) into a production macOS artifact: two per-arch Gecko cross builds unified into one universal `.app`, packaged as a notarized universal DMG, with a per-arch Theia sidecar merged by `lipo`, one universal complete MAR behind two Darwin descriptors, and an inside-out Developer ID signature applied through Mozilla's own `macos-sign` + `hardened-sign-config` machinery.

The standard path is already in the tree: `upstream/taskcluster/scripts/misc/unify.sh` unpacks both `target.dmg` files, runs `toolkit/mozapps/installer/unify.py` with `LIPO` exported, and repackages via `make_dmg` [VERIFIED: upstream/taskcluster/scripts/misc/unify.sh:8-14], quoting `export LIPO=$MOZ_FETCHES_DIR/cctools/bin/x86_64-apple-darwin-lipo`, `$GECKO_PATH/mach python $GECKO_PATH/toolkit/mozapps/installer/unify.py x64/*.app aarch64/*.app`, `$GECKO_PATH/mach python -m mozbuild.action.make_dmg x64 target.dmg`. The unify step merges Mach-O slices with `lipo -create` [VERIFIED: upstream/python/mozbuild/mozpack/unify.py:84-85], quoting `[lipo, "-create"] + tmpfiles + ["-output", dest]`, and refuses any differing non-binary file outside narrow exceptions [VERIFIED: upstream/python/mozbuild/mozpack/unify.py:196-205 pattern], so both per-arch builds must share one fourteen-digit `MOZ_BUILD_DATE` [VERIFIED: upstream/build/variables.py:22-27], quoting `buildid = os.environ.get("MOZ_BUILD_DATE")`, `if buildid and len(buildid) != 14:`, `buildid = datetime.now().strftime("%Y%m%d%H%M%S")`.

The two load-bearing gates are new but conventional: `mac-entitlements` (quick, static, derive-from-`developer/browser.xml` set equality) and the existing `package-target-natives` design extended to the DMG. Signing uses `./mach macos-sign --use_rcodesign` with a pkcs12 Developer ID identity [VERIFIED: upstream/tools/signing/macos/mach_commands.py:103-115], quoting `--use_rcodesign`, `Enables signing with rcodesign instead of codesign`, `--rcodesign-p12-file` / `--rcodesign-p12-password-file`; production entitlements require an Apple-issued cert [VERIFIED: upstream/tools/signing/macos/mach_commands.py:80-93], quoting `Production entitlements require a valid Apple Developer ID certificate`. The Team ID `43AQ936H96` is Mozilla's and must never ship [VERIFIED: upstream/security/mac/hardenedruntime/production/firefox.browser.xml:30-32], quoting `<key>com.apple.application-identifier</key>`, `<string>43AQ936H96.org.mozilla.firefox</string>`, and the elevated-update helper is pinned to it [VERIFIED: upstream/build/moz.configure/update-programs.configure:69-75], quoting `certificate leaf[subject.OU] = "43AQ936H96"`.

**Primary recommendation:** Build per-arch on legion with the bootstrap SDK 26.5, unify with Mozilla's own scripts, sign inside-out with `macos-sign --use_rcodesign` on a hosted runner only after SEC-13 is recorded, and gate every step with derive-and-compare rows that reuse the `package-linux.sh` / `TARGETS` / registry conventions.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Per-arch Gecko cross builds + unify + DMG | CI build tier (legion `build-macos` job, container/bootstrap) | Hosted `macos-26` fallback | Only the build tier holds the SDK, cctools, dmg tools; fallback is a recorded alternate host, not a second mechanism |
| Theia sidecar per-arch + `lipo` merge | Hosted macOS tier (`macos-26` arm64/x64 builds) | Release job assembly | Natives must be built on matching OS/arch; legion only merges |
| Developer ID signing + notarization + staple | Hosted sign tier (`release` environment, secrets) | — | Signing material never reaches legion; owner approval gates it |
| Entitlements / Team-ID hygiene | Repo tree (hook-only patch + `mac-entitlements` quick row) | — | Declaration is tracked, reviewed, diffed; row reads it back |
| Descriptors + download copy + matrix record | Repo tree (shared builder, copy gate, matrix gate) | Static host (`powerbrowser-updates`, assumed Phase 47) | Descriptors cite host/path only through the shared emitter so a Phase 47 change is absorbed |
| Trust boundary (no schedule, label placement, SHA pins) | Repo tree (`workflows` row) | Server (environments, rulesets, assumed Phase 41) | Static rows catch at commit time; server enforces at run time |

## Project Constraints (from CLAUDE.md)

Directives extracted from `CLAUDE.md` read this session (171 lines):

- **Never fork or patch Theia core.** Theia additions are `@powerbrowser/*` extensions; adopt upstream by re-pinning. `scripts/diff-theia-core.sh` is the check.
- **Never modify Gecko outside the patch stack.** `upstream/` is fetched by `scripts/fetch-upstream.sh` and never hand-edited (`git -C upstream diff` empty invariant). Firefox internals only through `powerbrowser/shell/PowerBrowserAPI.sys.mjs`, catalogued in `powerbrowser/INTERNAL-APIS.md`; `scripts/check-internals-boundary.sh` enforces.
- **Design for the bridge.** Nothing welds Theia to full-window presentation; `TabUriRegistry` shape asserted by `scripts/verify-registry-shape.mjs`.
- **Repo path contains no space.** `pkgs.mkShell` appends space-separated `NIX_LDFLAGS`; `/home/chris/coding/Power-Browser` compliant. Workspace `/home/chris/gsd-workspaces/deploy/dsh/phase-55` is compliant.
- **Theia is default GUI; stock chrome reachable** via `window.open(url,'_blank')`; no custom chrome authored.
- **Patches regenerated, never text-edited.** Via `scripts/regenerate-patches.sh`; `scripts/check-patch-surface.sh` guards surface; `apply-patches.sh --self-test` guards mechanism.
- **Residual-brand scan permanent gate.** `node scripts/scan-brand-residue.mjs` exit 0; iterates `git ls-files` so stage before trusting green; originating-product token only in `inventory/brand-tokens.json`.
- **One driver, one registry.** `scripts/verify-platform.sh` [VERIFIED: scripts/verify-platform.sh:52-56 pattern, quoting `local -a CHECKS=(` and `Adding a check means appending one row to the registry`]. No sibling driver. Commands: `--quick`, `--only <label>`, full, `--gate` [VERIFIED: CLAUDE.md:120-125 read this session].
- **Derive-and-compare, never hand-kept lists.** Rows derive expectation at check time, compare as set equality, red on addition and removal; every new check has `--self-test` planting each fault red naming drift. Never assert absence of a self-emitted log line.
- **User-facing copy.** Names `PowerBrowser`, no internal identifier (pref key, port, timeout, sentinel, exception), ends with a real on-screen next step; diagnostics layer carries identifiers.
- **Environment.** Builds in Nix dev shells: `nix develop .#firefox` (Gecko), `nix develop .#theia` (Node/yarn) [VERIFIED: CLAUDE.md:159-166]; `node` and `objdir/dist/bin/powerbrowser` work outside; `yarn` does not. Full `./mach build` tier 3 ~47–54 min; `--quick` in seconds.

## Standard Stack

### Core

| Library / Tool | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Mozilla bootstrap SDK + `unpack-sdk.py` | macOS SDK `26.5` floor [VERIFIED: upstream/build/moz.configure/toolchain.configure:254-255], quoting `def mac_sdk_min_version():`, `return "26.5"`; SDK entry `macosx64-sdk-26.5` with swcdn URL + sha512 + `MacOSX26.5.sdk` prefix (read `upstream/taskcluster/kinds/toolchain/macos-sdk.yml:33-46` this session) | Cross-build Gecko for Darwin on legion | Mozilla ships Firefox with the same toolchains; `unpack-sdk.py` is sha512-verified and takes the real URL when `MOZ_AUTOMATION` is unset (read `upstream/taskcluster/scripts/misc/unpack-sdk.py:19-40` this session) |
| `unify.sh` + `toolkit/mozapps/installer/unify.py` + `mozpack/unify.py` | Pinned tree | Merge two per-arch `.app` trees into one universal `.app` | Mozilla's own release path; order unpack → `unify.py` → `make_dmg` is fixed [VERIFIED: upstream/taskcluster/scripts/misc/unify.sh:10-14] |
| `lipo` (LLVM `llvm-lipo`) | Via nixpkgs `llvm` | Merge Mach-O slices (Gecko via unify, sidecar `.node`/`rg`/`node` directly) | `unify.py` shells to exactly `lipo -create -output` [VERIFIED: upstream/python/mozbuild/mozpack/unify.py:84-85]; S7 probe records `llvm-lipo` satisfies configure without `cctools-port` |
| `./mach macos-sign --use_rcodesign` (`upstream/tools/signing/macos/mach_commands.py`) | Tree-pinned; rcodesign `0.29.0` per prior STACK (see Flag I) | Sign bundle with entitlements from `taskcluster/config.yml` `mac-signing.hardened-sign-config` | Tree-wrapped standard: reads `taskcluster/config.yml`, maps `production`→`security/mac/hardenedruntime/production/`, `developer`→`.../developer/` [VERIFIED: upstream/tools/signing/macos/mach_commands.py:386-398], quoting `security/mac/hardenedruntime/production/`, `security/mac/hardenedruntime/developer/`; validates with `codesign -vv` [VERIFIED: upstream/tools/signing/macos/mach_commands.py:590-600] |
| Apple `codesign` / `notarytool` on `macos-26` | Hosted runner image | Fallback signer/notarizer; stapler; Gatekeeper observer | Apple tools are the ground truth when `rcodesign` is doubted; hosted `macos-26` is arm64 per prior STACK |
| App Store Connect API key (`release` secret) + Developer ID Application cert (pkcs12) | Owner-provisioned | Notarization submission (`notary-submit` / `notarytool submit`), Developer ID signature identity | CONTEXT-locked: key held as `release` secret; every live Apple action is owner action |
| `dmg` / `hfsplus` / `newfs_hfs` from pinned fetches + `make_dmg` / `dmg.py` | `libdmg-hfsplus` rev + `diskdev_cmds` sha pinned in `toolchains.yml:281-297` (read via S7 plan this session) | Build universal DMG on Linux | Mozilla `local-toolchain`s; mozconfig exports `MKFSHFS`, `DMG_TOOL`, `HFS_TOOL` [VERIFIED: upstream/build/macosx/cross-mozconfig.common:15-17], quoting `export MKFSHFS=$MOZ_FETCHES_DIR/hfsplus/newfs_hfs`, `export DMG_TOOL=$MOZ_FETCHES_DIR/dmg/dmg`, `export HFS_TOOL=$MOZ_FETCHES_DIR/dmg/hfsplus` |
| Node darwin tarballs (nodejs.org) + per-arch Theia `yarn build` | Node 24 line; `linux-x64` pin shape today [VERIFIED: powerbrowser/packaging/node-runtime.json:1-7], quoting `"linux-x64": {`, `"version": "v24.19.0"`, `"sha256": "14b342e..."` | Darwin sidecar payload + staged `node` | Same pin-and-hash discipline as `package-linux.sh` [VERIFIED: powerbrowser/packaging/package-linux.sh:27-38], quoting `["linux-x64"]`, `sha256sum -c`, `does not hash to the pin in powerbrowser/packaging/node-runtime.json` |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `emitMozconfig` + frozen `TARGETS` | Tree | Per-target mozconfigs (`mozconfig-macos-aarch64`, `mozconfig-macos-x86_64`) with own objdir suffixes | Extending the single-`.mozconfig` emission [VERIFIED: scripts/generate.mjs:1464-1495 `function emitMozconfig(config, variant)` + 13-line body] and row [VERIFIED: scripts/generate.mjs:3540-3546], quoting `generated: '.mozconfig'`, `tracked: '.mozconfig'`, `emit: emitMozconfig` |
| `scripts/build-update-xml.mjs` (imports `buildUpdateXml` from `verify-mar-update-hop.mjs`) | Tree | Emit two Darwin descriptors (`Darwin_aarch64-gcc3`, `Darwin_x86_64-gcc3`) over one universal MAR | Always; never hand-write descriptors. BUILD_TARGET is `OS_ABI` [VERIFIED: upstream/toolkit/modules/UpdateUtils.sys.mjs:89-90], quoting `replacement = Services.appinfo.OS + "_" + this.ABI;` |
| `signmar` (container-built) | Tree build output | Sign + verify complete MAR | MAR path unchanged; SEC-07 channel check precedes `-s` |
| `strip_restricted_entitlements` | Tree [VERIFIED: upstream/tools/signing/macos/mach_commands.py:732-738], quoting `restricted_entitlements = [`, `"com.apple.developer.web-browser.public-key-credential",`, `"com.apple.application-identifier",` | `production-without-restricted` fallback when account lacks restricted grants | Only if Apple grants are missing; default is full `production` |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `rcodesign` on Linux | Apple `codesign`/`notarytool` on `macos-26` | Ground truth, but needs owner-dispatched hosted runner + key material on it; keep as fallback per CONTEXT |
| Cross-build on legion | Full native build on `macos-26` | Avoids SDK-licence question entirely but doubles hosted minutes and still needs unify; keep as recorded fallback (PKG-14) |
| Hook-only Team-ID patch | Generator-emitted bundle ID | Bundle ID is Gecko build input consumed by `macos-sign --channel auto` via `CFBundleIdentifier`; patch keeps it reviewable through `regenerate-patches.sh` per CONTEXT — do not emit |

**Installation:** no new registry install. `rcodesign`, `llvm`/`lld`, `rsync`, `cmake`, `openssl`, `zlib`, `gnupatch` enter via the `.#firefox-macos` Nix shell (same pattern as `.#firefox`); Node darwin binaries are hash-pinned downloads, not package installs.

## Package Legitimacy Audit

No npm, PyPI, or crates package is installed by this phase's recommended path. Toolchain binaries come from nixpkgs (`rcodesign 0.29.0`, `llvm`, `lld`) and from nodejs.org tarballs verified against `SHASUMS256.txt` + pinned sha256 (AUTO-04 discipline). The `apple-codesign`/`rcodesign` crate identity could not be re-verified live this session (`web_search` has no `DEEPSEEK_API_KEY`; `web_fetch` of the releases pages returned 404/truncated chrome) — prior in-tree research records `0.29.0`, last release 2024-11-29 [CITED: .planning/research/v1.6-deploy/STACK.md:24]. Treat that version/date as [ASSUMED] until the SEC-13 probe re-checks it.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| (none — no new registry dependency) | — | — | — | — | OK | Approved: nothing to install |
| rcodesign 0.29.0 (nixpkgs/crates, already referenced by RELEASING.md:297-302) | nixpkgs/crates.io | long-lived [ASSUMED] | — | Mozilla/indygreg `apple-platform-rs` [ASSUMED] | OK (toolchain, not a code dependency) | Approved with SEC-13 re-check |
| Node darwin-arm64/x64 tarballs | nodejs.org dist | per-release | — | nodejs.org | OK | Approved: pin + SHASUMS + signature verify in-job |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
per-arch Gecko cross builds (legion, bootstrap SDK 26.5, one shared MOZ_BUILD_DATE)
  aarch64-apple-darwin ──┐
                         ├─► unpack both target.dmg ─► unify.py (LIPO=lipo) ─► universal .app
  x86_64-apple-darwin ───┘         (unify.sh order)        │ refuses any differing
                                                           │ non-binary (except
                                                           │ *.manifest/buildconfig/install.rdf)
per-arch Theia builds (hosted macos-26, darwin-arm64 + darwin-x64)
  .node / rg / node ──► lipo -create ─► Contents/Resources (via @RESPATH@ staging)
                                    │
universal .app + sidecar ─► mac-entitlements row (quick, static, green)
  ─► inside-out Developer-ID sign (natives→node→rg→frameworks→bundle, macos-sign
       --use_rcodesign, hardened-sign-config, hook-only Team ID)
  ─► make_dmg (Linux branch, MKFSHFS/DMG_TOOL/HFS_TOOL) ─► universal DMG
  ─► complete MAR (signmar) ─► build-update-xml.mjs ─► Darwin_aarch64-gcc3 +
                                                   Darwin_x86_64-gcc3 descriptors
  ─► hosted matrix row (draft DMG install/launch) + real-Mac Gatekeeper session
  ─► release.yml build-macos → sign-publish (release env) → descriptor (24h + approval)
```

### Recommended Project Structure

```
powerbrowser/packaging/
├── mozconfig-macos-aarch64        # tracked comparand, TARGETS row (variant-scoped)
├── mozconfig-macos-x86_64         # tracked comparand, TARGETS row
├── node-runtime.json              # gains darwin-arm64 + darwin-x64 pins (linux-x64 exists today)
└── package-macos.sh               # analog of package-linux.sh (mach package → stage → precomplete → DMG)
scripts/
├── verify-mac-entitlements.mjs    # mac-entitlements row + --self-test
├── verify-package-natives.mjs     # extended: Mach-O universal assertion on DMG staging
├── verify-macos-package-payload.mjs  # full-tier: slices, BuildID, ad-hoc→DevID, MAR, descriptors
├── verify-macos-download-copy.mjs    # copy gate (PowerBrowser, signing status, no internals)
└── verify-macos-install-matrix.mjs   # matrix record + BUILD_TARGET set equality
flake.nix                             # .#firefox-macos shell (llvm, lld, rcodesign, rsync, cmake…)
docs/BUILD.md                         # packaging-hosts row + shared-MOZ_BUILD_DATE rule + timings
docs/RELEASING.md                     # macOS rows filled (no longer "pending stage macos-adhoc-signed")
```

### Pattern 1: Two cross builds, one shared BuildID, Mozilla's own unify order

**What:** Export one fourteen-digit `MOZ_BUILD_DATE` for the whole task; build each target in its own objdir (`objdir-macos-aarch64`, `objdir-macos-x86_64`); then follow `unify.sh` exactly: unpack each `target.dmg`, run `unify.py x64/*.app aarch64/*.app` with `LIPO` set, `make_dmg` the result.
**When to use:** Every universal build. Without the shared date, `application.ini`, `platform.ini`, and preprocessed `Info.plist` (whose `MAC_BUNDLE_VERSION` comes from `buildid.h` [VERIFIED: upstream/browser/app/Makefile.in:67], quoting `MAC_BUNDLE_VERSION = $(shell $(PYTHON3) $(srcdir)/macversion.py --version=$(MOZ_APP_VERSION) --buildid=$(DEPTH)/buildid.h)`) differ and `unify_file` returns `None`.
**Example:** `unify.sh` lines 8-14 (quoted in Summary).

### Pattern 2: `mac-entitlements` derives from signing inputs, compares as set equality

**What:** Parse the entitlement XML files the `hardened-sign-config` names (developer set resolves under `security/mac/hardenedruntime/developer/`, production under `.../production/`), plus the `globs` mapping, at check time; fail on any key or string matching `43AQ936H96`, `org.mozilla`, or a restricted key (`com.apple.developer.web-browser.public-key-credential`, `com.apple.application-identifier` — the exact pair `strip_restricted_entitlements` strips [VERIFIED: upstream/tools/signing/macos/mach_commands.py:732-738]). Red on addition and removal; self-test plants all three fault classes.
**When to use:** Always (quick tier: text reads only, no build/browser/display/network).

### Pattern 3: Sidecar natives built per-arch, merged with `lipo`, staged at `@RESPATH@`

**What:** Build Theia twice on hosted macOS (`darwin-arm64`, `darwin-x64`) so integrity-pinned darwin packages resolve; `lipo -create` each `.node`, `rg`, and `node` pair; stage under `Contents/Resources` (which is `@RESPATH@` on macOS, `@BINPATH@` elsewhere — no macOS special case). Extend `package-target-natives` to require Mach-O (universal where merged) on the DMG.
**When to use:** Every macOS package. Never ship a Linux `.node` under a darwin name (cf. `package-linux.sh:60` hard-codes `linux-x64` [VERIFIED: powerbrowser/packaging/package-linux.sh:60], quoting `cp "$ROOT/theia/node_modules/better-sqlite3/prebuilds/linux-x64.node"`).

### Pattern 4: Inside-out Developer ID signing driven by `hardened-sign-config`

**What:** Strip xattrs/signatures, then sign leaf-first: nested `.app`s with their entitlement files (`plugin-container.app`, `media-plugin-helper.app`, helpers), then unsigned-but-hardened files (`XUL`, `*.dylib`, updater, frameworks), then the bundle root `/` with the browser entitlement — the exact group order in `taskcluster/config.yml:924-1035` (production `entitlements: public/build/security/...` + `globs:` per group, root glob `"/"` last). Invoke via `mach macos-sign --use_rcodesign --rcodesign-p12-file … --rcodesign-p12-password-file … -e production -c release -a <extracted .app>`; verify with `codesign -vv`; notarize with `notary-submit`/API key; staple; then `mach repackage dmg` + MAR.
**When to use:** Only on hosted runners behind `release`, never on legion, never with the generic-certs switch (forbidden: `--enable-mac-elevated-updates-with-generic-certs` widens privileged-update trust [VERIFIED: upstream/build/moz.configure/update-programs.configure:61-66], quoting `option(`, `"--enable-mac-elevated-updates-with-generic-certs",`).

### Anti-Patterns to Avoid

- **Hand-keeping an entitlement or branding-file list.** Derive from `hardened-sign-config` + `developer/browser.xml` shape and from both cocoa consumers (`Makefile.in:85-87` `cp -RL` trio [VERIFIED: upstream/browser/app/Makefile.in:85-87], quoting `cp -RL $(topsrcdir)/$(MOZ_BRANDING_DIRECTORY)/firefox.icns`, `document.icns`, `Assets.car`; and `moz.configure:3992-3999` DMG branch [VERIFIED: upstream/toolkit/moz.configure:3992-3999], quoting `"--dsstore", join(brand, "dsstore"),`, `"--background", join(brand, "background.png"),`, `"--icon", join(brand, "disk.icns"),`). A hand-kept list agrees only with the tree it was copied from.
- **`--target=arm64-apple-darwin`.** The canonical CPU is `aarch64`; `arm64` mis-canonicalises. Emit `--target=aarch64-apple-darwin` / `--target=x86_64-apple-darwin` only (per S7 probe).
- **Text-editing a patch for the Team ID.** Team ID arrives via a hook-only patch regenerated with `scripts/regenerate-patches.sh`; `check-patch-surface.sh` guards it.
- **Notarizing before the entitlements row is green.** Notarization attests a signed bundle; a bundle carrying `43AQ936H96` or `org.mozilla` identifiers wastes a submission and risks a misleading ticket.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Universal merge | Own rsync-and-hope merger | `unify.sh` + `unify.py` + `lipo` | Non-binary divergence rules, `*.manifest` sorted-compare, `buildconfig.html`/`install.rdf` special cases, Mach-O fattening — all edge cases already handled |
| macOS signing | Direct `rcodesign sign` argument soup | `mach macos-sign --use_rcodesign` | Reads `hardened-sign-config`, scopes entitlements per glob (`--entitlements-xml-path <rel>:<file>`), strips restricted set on request, verifies |
| Notarization submission + history | Own `altool` polling loop | `rcodesign notary-submit` / Apple `notarytool submit --wait` + `staple` | Async polling, API-key auth, ticket stapling, history semantics |
| DMG packaging | Own hdiutil/DMG writer | `make_dmg` + `dmg.py` Linux branch via `MKFSHFS/DMG_TOOL/HFS_TOOL` | Sizing, `newfs_hfs`, `hfsplus addall`, extra-file copies with no existence guard |
| Entitlement hygiene | Regex over the built bundle | `mac-entitlements` row over signing inputs | Catches the cause (inputs) not the symptom (bundle); fast and deterministic |
| Cross-OS native check | `file(1)` one-liners in CI | `package-target-natives` row (ELF/PE32+/Mach-O per target token) | Uniform per-target assertion with self-test plants |
| Update descriptors | Hand-written XML | `build-update-xml.mjs` over built bytes | Hash/size/`detailsURL`/BUILD_TARGET derived, idempotent, byte-compared |
| SDK fetch | Curl-and-pray | `unpack-sdk.py` (sha512-verified, 3 retries) | Hash-mismatch raise; `MOZ_AUTOMATION` tooltool path |

**Key insight:** every macOS release step is Mozilla's own automation repurposed with PowerBrowser identifiers; custom tooling in this domain re-implements (badly) what `unify`, `macos-sign`, `make_dmg`, and `notarytool` already prove.

## Runtime State Inventory

None — this is a greenfield packaging/signing phase, not a rename/refactor/migration. No stored data, live-service config, OS-registered state, secret-key renames, or build-artifact renames are in scope. (Secrets are created fresh: Developer ID pkcs12 + App Store Connect API key as `release` secrets; no existing key is renamed.)

## Common Pitfalls

### Pitfall 1: Two builds, two BuildIDs, unify refuses everything
**What goes wrong:** `unify.py` reports differences in `application.ini` / `platform.ini` / `Info.plist` after both tier-3 builds are paid for.
**Why:** `variables.py:22-27` falls back to `datetime.now()` unless a fourteen-character `MOZ_BUILD_DATE` is exported.
**How to avoid:** One `MOZ_BUILD_DATE` per task, recorded in the evidence dir, asserted equal across both `application.ini` files and the unified bundle.
**Warning signs:** BuildIDs differ in the last digits (timestamps seconds apart).

### Pitfall 2: The generic-certs switch ships
**What goes wrong:** Elevated updates accept any generic cert; privileged helper trust is widened permanently.
**Why:** `--enable-mac-elevated-updates-with-generic-certs` looks like a convenience for unsigned testing.
**How to avoid:** Forbid the string in emitted + tracked mozconfigs by assertion; keep the helper pinned to `mac_prod_requirements_string` (`43AQ936H96`).
**Warning signs:** The string appears anywhere under `powerbrowser/packaging/` or `generated/`.

### Pitfall 3: Mozilla Team ID or bundle ID leaks into signing inputs
**What goes wrong:** Notarization submits (or a shipped bundle carries) `43AQ936H96` / `org.mozilla.firefox` / restricted passkey keys.
**Why:** `firefox.browser.xml:31-35` carries all three by default.
**How to avoid:** `mac-entitlements` row + hook-only Team-ID patch; self-test plants each.
**Warning signs:** `grep -r 43AQ936H96` hits outside the deferred-record documentation.

### Pitfall 4: Wrong triple spelling (`arm64-apple-darwin`)
**What goes wrong:** Configure canonicalises to the wrong CPU; unify/XPCOM ABI strings drift from descriptors.
**Why:** Apple marketing name vs. GNU canonical name confusion.
**How to avoid:** Assert `--target=aarch64-apple-darwin` / `--target=x86_64-apple-darwin` and forbid `arm64-apple-darwin` in mozconfig surfaces.

### Pitfall 5: Placeholder `Assets.car` degrades the Dock icon
**What goes wrong:** App launches but shows a generic icon; Mac session records a failure nobody planned.
**Why:** `Info.plist` declares both `CFBundleIconFile firefox.icns` and `CFBundleIconName AppIcon`; macOS prefers the latter out of `Assets.car`.
**How to avoid:** Record the placeholder honestly; upgrade path is a real catalog via `actool`; Mac session observes the icon explicitly.

### Pitfall 6: Linux natives shipped under darwin names
**What goes wrong:** Sidecar fails to load on macOS; `package-target-natives` red after the expensive builds.
**Why:** `package-linux.sh:60` hard-codes `linux-x64`; copying the pattern blindly repeats it.
**How to avoid:** Per-arch hosted builds + `lipo`; stage check asserts Mach-O before unify.

### Pitfall 7: DMG attempted with macOS-only tools on Linux
**What goes wrong:** `dmg.py` shells to `hdiutil`/`SetFile` and fails (BUILD.md's stale line still says exactly this [VERIFIED: docs/BUILD.md:1026-1027], quoting ``macOS-only `hdiutil`/`SetFile` — a real macOS host/VM``).
**Why:** Reading the stale packaging-hosts note instead of the S7 correction.
**How to avoid:** Use the Linux branch (`rsync`, `newfs_hfs`, `hfsplus addall`, `dmg build`) via the mozconfig-exported tools.

### Pitfall 8: Cache or secret reaches the wrong job
**What goes wrong:** Cache-poisoned release bytes; signing material on legion.
**Why:** Convenience cache steps; passing secrets to build jobs.
**How to avoid:** No cache step in any release-path job; `build-macos` has `contents: read`, no environment, no `secrets.` reference (the `workflows` row asserts this).

## Code Examples

### `mac-entitlements` row skeleton (quick, static)

```js
// scripts/verify-mac-entitlements.mjs — derives from signing inputs, set equality both ways.
// Sources: upstream/tools/signing/macos/mach_commands.py (entitlement_repo_path),
// upstream/taskcluster/config.yml (mac-signing.hardened-sign-config),
// upstream/security/mac/hardenedruntime/{developer,production}/*.xml
import { readFileSync, readdirSync } from 'node:fs';
// Restricted pair — must match strip_restricted_entitlements exactly:
// "com.apple.developer.web-browser.public-key-credential", "com.apple.application-identifier"
const FORBIDDEN_SUBSTRINGS = ['43AQ936H96', 'org.mozilla'];
const RESTRICTED_KEYS = [
  'com.apple.developer.web-browser.public-key-credential',
  'com.apple.application-identifier',
];
export function checkEntitlements(root, { selfTest = null } = {}) {
  // 1. Resolve hardened-sign-config groups for default+production, collect
  //    entitlement repo paths via entitlement_repo_path() mapping.
  // 2. Parse each plist, collect key set + string values.
  // 3. FAIL on any FORBIDDEN_SUBSTRINGS hit or RESTRICTED_KEYS presence
  //    (production-without-restricted mode strips them instead — assert which
  //    mode the release claims and check accordingly).
  // 4. Set-equality: observed key set vs. union derived from the tree —
  //    red on addition AND removal.
  // --self-test plants: '43AQ936H96' string, 'org.mozilla' string,
  // one RESTRICTED_KEYS key; each must go red naming the file+key.
}
```

### Shared BuildID + unify invocation

```sh
# One fourteen-character date for the whole task (YYYYMMDDHHMMSS):
export MOZ_BUILD_DATE=20261110120000
# Per-target builds in separate objdirs through per-target mozconfigs:
POWERBROWSER_OBJDIR=objdir-macos-aarch64 MOZCONFIG=../generated/packaging/mozconfig-macos-aarch64 ./mach build
POWERBROWSER_OBJDIR=objdir-macos-x86_64  MOZCONFIG=../generated/packaging/mozconfig-macos-x86_64  ./mach build
# Mozilla's own order (unify.sh:10-14):
# unpack each target.dmg, unify, make_dmg — with LIPO exported:
export LIPO="$(which llvm-lipo)"   # legion analog of $MOZ_FETCHES_DIR/cctools/bin/x86_64-apple-darwin-lipo
./mach python -m mozbuild.action.unpack_dmg x64/target.dmg x64
./mach python -m mozbuild.action.unpack_dmg aarch64/target.dmg aarch64
./mach python toolkit/mozapps/installer/unify.py 'x64/*.app' 'aarch64/*.app'
./mach python -m mozbuild.action.make_dmg x64 target.dmg
```

### Inside-out signing (hosted runner, `release` env)

```sh
# Extract the packaged .app from the DMG to a writable dir first
# (macos-sign cannot sign the in-objdir .app: symlinks/unbundled).
./mach macos-sign -a ./signed/PowerBrowser.app \
  -e production -c release \
  --use_rcodesign \
  --rcodesign-p12-file "$RUNNER_TEMP/devid.p12" \
  --rcodesign-p12-password-file "$RUNNER_TEMP/devid.pw"
codesign -vv ./signed/PowerBrowser.app   # macos-sign already runs this; repeat is cheap proof
# Notarize through the App Store Connect API key (release secret), then staple:
rcodesign notary-submit --api-key-path "$RUNNER_TEMP/auth.json" --wait ./PowerBrowser.dmg
xcrun stapler staple ./PowerBrowser.dmg   # hosted macOS runner only
```

### Registry row append (one row + self-test per check)

```sh
# scripts/verify-platform.sh CHECKS array — quick rows before the QUICK guard,
# full rows inside it (see verify-platform.sh:4733 `if [ "$QUICK" -eq 0 ]; then`):
"mac-entitlements|node $REPO_ROOT/scripts/verify-mac-entitlements.mjs"
"mac-entitlements-self-test|node $REPO_ROOT/scripts/verify-mac-entitlements.mjs --self-test"
```

### Per-target mozconfig tail (generator-emitted, TARGETS-gated)

```
# powerbrowser/packaging/mozconfig-macos-aarch64 (tracked comparand):
ac_add_options --target=aarch64-apple-darwin
mk_add_options "export MACOS_SDK_DIR=<bootstrap SDK>/MacOSX26.5.sdk"
mk_add_options "export MKFSHFS=.../newfs_hfs"
mk_add_options "export DMG_TOOL=.../dmg"
mk_add_options "export HFS_TOOL=.../hfsplus"
# Carries the shared lines verbatim: --enable-update-channel=default,
# MAR_CHANNEL_ID=powerbrowser-default, ACCEPTED_MAR_CHANNEL_IDS=powerbrowser-default
# (today's values [VERIFIED: .mozconfig:8-10], quoting
# `ac_add_options --enable-update-channel=default`,
# `ac_add_options MAR_CHANNEL_ID=powerbrowser-default`,
# `ac_add_options ACCEPTED_MAR_CHANNEL_IDS=powerbrowser-default`).
# Never: --enable-mac-elevated-updates-with-generic-certs. Never: arm64-apple-darwin.
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Ad-hoc signature only, no notarization, Gatekeeper Open-Anyway (RELEASING.md macOS posture [VERIFIED: docs/RELEASING.md:124-141]) | Developer ID + notarization + staple; /download states signing status honestly | Phase 55 | DMG opens without Open-Anyway; Homebrew cask unblocked (DIST-11 needs notarization) |
| `dmg.py` needs macOS (`hdiutil`/`SetFile`) — BUILD.md staged-hosts note | Linux-branch DMG via pinned `dmg`/`hfsplus`/`newfs_hfs` + mozconfig exports (S7 probe) | S7 draft / Phase 55 | No Mac needed to *build* the DMG; Mac still needed to *observe* Gatekeeper |
| Native Apple `codesign` only | `rcodesign` from Linux (`--use_rcodesign`) with hosted-Apple fallback | Tree already wraps it | Signing without a Mac; fallback when viability doubted |
| Single-arch artifacts | Universal (2 cross builds + unify + one MAR + 2 descriptors) | Phase 55 | One DMG/MAR serves both Apple Silicon and Intel |
| Mozilla Team ID in inputs | Hook-only Team-ID patch + `mac-entitlements` row | Phase 55 | Fork identity in signature; elevated-update trust stays narrow |

**Research flag I — answered as far as possible without owner actions:**

- **Apple SDK licence for cross builds on Linux: NOT SETTLED this session [ASSUMED].** Mechanism is verified: `unpack-sdk.py` downloads the `CLTools_macOSNMOS_SDK.pkg` from `swcdn.apple.com` (public CDN) and verifies sha512 (read `macos-sdk.yml:33-46` + `unpack-sdk.py` this session); Mozilla's automation does the same on Linux workers. The licence *text* (Xcode SLA / Command Line Tools terms governing redistribution/use of the SDK on non-Apple hosts) was not read this session — `web_search` is unusable here (no `DEEPSEEK_API_KEY`) and `web_fetch` returned no licence body. Planner must add a SEC-13 task: fetch the current Apple SLA + `CLTools` package licence, record the position (Mozilla-practice + hosted-`macos-26` fallback if "no"), before any Phase I build.
- **rcodesign maintenance status/version: NOT RE-VERIFIED live this session [ASSUMED at 0.29.0].** Prior research records `0.29.0`, last release 2024-11-29, no release in ~23 months [CITED: .planning/research/v1.6-deploy/STACK.md:24]. `web_fetch` of the releases pages returned GitHub chrome/404 with no version table, so no newer or older release can be claimed here. Planner must add a SEC-13 task: read `crates.io/crates/apple-codesign` + the source repo releases live (agent action, no credential) and record version/date/commit-activity; the hosted-Apple-tools fallback in PKG-14 already covers a "not viable" outcome.
- **Developer ID CA expiry: NOT VERIFIED live this session [ASSUMED].** Prior research: Developer ID *certificates* valid 5 years (MEDIUM), apps timestamped while valid keep running; one LOW secondary claim says the original Developer ID CA expires 2027-02-01 [CITED: .planning/research/v1.6-deploy/SUMMARY.md:408 + STACK.md:185]. No Apple PKI notice was fetched this session. Planner must add a SEC-13 task: read Apple's PKI/Developer-ID CA notice + `security.apple.com` intermediates live and record the CA + cert dates as a `docs/RENEWALS.md` row.

**What remains an owner probe (per CONTEXT):** D-U-N-S request; Developer Program enrolment + nonprofit fee-waiver (after Phase 47 live site); Developer ID certificate creation/storage; App Store Connect API key creation/storage as `release` secret; any signing/notarization submission; hosted-`macos-26` use beyond agent-dispatchable reads; borrowed/rented-Mac matrix + Gatekeeper observation.

**Deprecated/outdated in the tree:**
- `docs/BUILD.md:1001-1003` "MSIX and DMG are never attempted on Linux" + `:1026-1027` `hdiutil`/`SetFile` note — superseded for DMG by the S7 Linux-branch path; Phase 55 rewrites the macOS half, keeps the MSIX half.
- `docs/BUILD.md:1013` `pkg-macos staged-unexecuted` + matrix `:1078` macOS row — Phase 55 replaces with hosted-runner + real-Mac record.
- `docs/RELEASING.md:713` macOS asset row `pending stage macos-adhoc-signed` — Phase 55 fills from built names.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Phase 47 delivers live site + `powerbrowser-updates` host as written (CONTEXT A1) | Map, Patterns | Fee-waiver blocked; descriptors have no host — absorb via shared builder indirection |
| A2 | Phase 50 delivers `release.yml` + per-OS sign job + draft-then-publish + TRAIN-10 states as written (CONTEXT A2) | Map, Validation | `build-macos` has nothing to attach to — follow `build-*`/`matrix-*` + `contents: read` conventions when 50 lands |
| A3 | Phase 41 controls hold (tag ruleset, 5 envs branch-policy `main`, `workflows` row) (CONTEXT A3) | Security | Signing secrets mis-scoped — add no second mechanism; re-verify at plan time |
| A4 | SDK 26.5 satisfies `mac_sdk_min_version() = "26.5"` for this ESR (verified floor, assumed availability of the 26.5 pkg URL at build time) | Stack | URL rotated by Apple — re-resolve `macos-sdk.yml` alias at build time |
| A5 | rcodesign 0.29.0 viable until SEC-13 probe says otherwise; hosted-Apple fallback recorded | State of Art | Signing path re-planned onto `macos-26` native tools — PKG-14 already records it |
| A6 | Developer ID cert 5-yr validity; CA date as LOW claim until SEC-13 probe | State of Art | RENEWALS row wrong — probe corrects before build |
| A7 | `llvm-lipo` satisfies `LIPO` for both Gecko unify and sidecar merge (S7 probe routing) | Patterns | `cctools-port` source build needed — probe records RED cause |
| A8 | `drivelist` darwin outcome routes sidecar (cross-build vs. Mac-session stand-in, never Linux binary) | Patterns | Sidecar incomplete — matrix record labels stand-in |

## Open Questions

1. **SEC-13 licence text.** What we know: fetch mechanics verified (swcdn + sha512). Unclear: Apple SLA position on Linux cross builds. Recommendation: agent `web_fetch` of the Apple SLA + package licence, record verbatim excerpt + position before any build.
2. **rcodesign viability.** What we know: tree wrapper verified; prior version/date assumed. Unclear: releases since 2024-11. Recommendation: live crates/repo read at plan time; keep hosted fallback regardless.
3. **Developer ID CA date.** What we know: 5-yr cert (MEDIUM), 2027-02-01 CA (LOW). Unclear: current CA hierarchy dates. Recommendation: live Apple PKI read; RENEWALS row follows.
4. **Hosted runner truth.** What we know: `macos-26` arm64 assumed from prior STACK (not re-verified; no workflow in tree uses `macos-*` — `ls .github/workflows` shows only `notify-drill.yml`, `rebase-upstream.yml`, `verify.yml`). Unclear: current `macos-26` arch, Xcode/SDK, minutes cost on Free. Recommendation: owner-dispatched probe job at plan time; record image version + `xcrun --show-sdk-path`.
5. **Notarization latency/retry.** What we know: `notary-submit --wait` pattern assumed. Unclear: queue times, staple-offline behaviour for direct-download DMG. Recommendation: first notarization is the measurement; record wall time in BUILD.md.
6. **DMG artwork + real `Assets.car`.** Deferred per S7 (placeholder `dsstore`/`background.png`/`disk.icns`, `actool` upgrade path). Recommendation: ship placeholder honestly; Mac session observes icon; designed artwork is a later plan.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| legion (NixOS, podman, bootstrap-capable) | PKG-14 cross builds | ✓ [ASSUMED — prior BUILD.md reference host] | — | Hosted `macos-26` full build (PKG-14 fallback) |
| `nix develop .#firefox-macos` shell | PKG-14 configure/build | ✗ (new file) | — | Create in Phase 55 (llvm, lld, rcodesign, rsync, cmake, openssl, zlib, gnupatch) |
| macOS SDK 26.5 via `unpack-sdk.py` | PKG-14 | ✗ (not fetched this session) | floor `26.5` [VERIFIED] | Hosted runner SDK |
| Hosted `macos-26` runner | PKG-15/16, SEC-04 fallback | ✗ (owner-dispatched) | — | Borrowed/rented Mac for matrix only (slower) |
| Real Mac (Apple Silicon preferred) | PKG-16 Gatekeeper session | ✗ | — | No fallback — owner action, release gate stays shut without it |
| Developer ID cert + ASC API key | SEC-04 | ✗ | — | Ad-hoc only (S7 posture); no cask, no Open-Anyway relief |
| D-U-N-S + enrolment + fee waiver | SEC-04 gate | ✗ | — | Nothing in Phase 55 signs production without it |
| node v24.x, yarn (theia shell) | PKG-15 sidecar | ✓ (node v24.21.0 observed in 41-RESEARCH) | 24.x | — |
| `lipo`/`llvm-lipo`, `codesign`, `notarytool`, `stapler` | unify/merge/sign/notarize | `lipo` via nixpkgs [ASSUMED]; Apple tools on hosted runner only | — | `cctools-port` source build (RED route) |

**Missing dependencies with no fallback:** D-U-N-S/enrolment/cert/API key; real-Mac session. These are the planned `checkpoint:human-action` and do not block local work.
**Missing dependencies with fallback:** legion cross-build failure → hosted build; rcodesign doubt → native Apple tools; SDK-licence "no" → hosted build.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `scripts/verify-platform.sh` registry rows; each script carries its own `--self-test` |
| Config file | none — rows appended to `CHECKS` array: quick rows before `if [ "$QUICK" -eq 0 ]` [VERIFIED: scripts/verify-platform.sh:4733], quoting `if [ "$QUICK" -eq 0 ]; then`, full rows inside it |
| Quick run command | `scripts/verify-platform.sh --only mac-entitlements` (likewise `mac-entitlements-self-test`) |
| Full suite command | `scripts/verify-platform.sh --quick`, then `--only macos-package-payload`, `--only macos-install-matrix` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PKG-24 | No `43AQ936H96`/`org.mozilla`/restricted key in signing inputs; set equality both ways | static, quick | `--only mac-entitlements` / `--only mac-entitlements-self-test` | ❌ new `scripts/verify-mac-entitlements.mjs` |
| PKG-14 | Universal slices in every Mach-O; one shared BuildID; DMG via Linux branch; 2 descriptors → 1 MAR | full (needs built tree) | `--only macos-package-payload` (+ `-self-test` quick) | ❌ new `scripts/verify-macos-package-payload.mjs` |
| PKG-23 (DMG leg) | Every `.node`/`rg`/`node` in DMG staging is Mach-O (universal where merged) | full | existing `package-target-natives` extended | ❌ extend per S7/PITFALLS design |
| PKG-15 | Darwin payload staged under `Contents/Resources`, no dev-tree paths, space-name spawn proven | full | payload gate extension | ❌ same payload script |
| PKG-16 | Hosted matrix green on draft DMG; real-Mac Gatekeeper copy recorded; observed `Darwin_*` == descriptor set | full + manual | `--only macos-install-matrix` + human session record | ❌ new `scripts/verify-macos-install-matrix.mjs` |
| SEC-04 | Inside-out Developer ID order; notarization ticket stapled; Team ID from hook-only patch | full + manual | payload gate (order/ticket) + owner attestation | ❌ same payload script |
| SEC-13 | Licence position + rcodesign status + CA date recorded before build | manual (read-only) | none — recorded memo in `docs/RELEASING.md` + `docs/RENEWALS.md` row | — |
| UPD-21 (macOS text) | Cannot-update copy carries macOS Applications-folder variant | static, quick | extend update-copy shape row | ❌ extend |

### Sampling Rate
- **Per task commit:** `scripts/verify-platform.sh --quick` after `git add` (residue scan reads `git ls-files`).
- **Per wave merge:** `--quick` plus each new row's `--self-test`.
- **Phase gate:** `--quick` green → owner checkpoint (credentials, hosted runs, Mac session) → full rows green.

### Wave 0 Gaps
None — registry, `TARGETS` byte-identity, and `--self-test` conventions exist (41-RESEARCH format analog). New scripts are the deliverables; no framework install needed.

## Security Domain

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes (Apple/CI) | D-U-N-S → enrolment → Developer ID issuance; ASC API key as `release` secret + owner reviewer; no credential on legion |
| V4 Access Control | yes | `release` env (owner reviewer, branch policy `main`), per-OS sign job only in `release.yml`, `workflows` row (no `schedule:`, legion/`build-*` scoping, SHA pins) |
| V5 Input Validation | yes | Entitlement plist keys/strings allowlist-derived; descriptor `buildID` monotonic; `MOZ_BUILD_DATE` 14-digit shape |
| V6 Cryptography | yes | Developer ID (Apple CA) + `runtime` hardened flag + timestamp; MAR `signmar -v`; `SHA256SUMS`; no hand-rolled crypto — `rcodesign`/`codesign`/`notarytool` only |
| V8 Data Protection | yes | pkcs12 + password files via ephemeral runner temp, never committed; `xattr -c` + signature reset before signing |
| V10 Malicious Code / supply chain | yes | SDK/dmg-tools/Node hash pins; no cache in release path; `package-target-natives`; attested provenance |
| V14 Configuration | yes | Hook-only Team-ID patch via regeneration; `mac-entitlements` drift row; fail-closed reads |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Mozilla Team ID / bundle ID ships in signature | Spoofing | `mac-entitlements` row; hook-only patch; `production-without-restricted` strip when grants missing |
| Generic-certs switch widens privileged updater | Elevation | Permanent forbid assertion; updater requirements stay `mac_prod_requirements_string` |
| Signing key / ASC key exfiltrated via build job | Information disclosure | Sign only on hosted runners in `release` env; `build-macos` secretless (`contents: read`, no env, no `secrets.`) |
| Cache-poisoned universal bytes | Tampering | No cache in release path; draft-asset-set equality before publish (assumed Phase 50 gate) |
| Downgrade via same-version older BuildID descriptor | Tampering | `descriptor-monotonic` (assumed Phase 44) covers Darwin descriptors too |
| Stale approval builds stale SHA | Repudiation/Elevation | Mint App token just before use; sign job exits when a newer Release exists (assumed Phase 50) |
| Unnotarized DMG social-engineered past Gatekeeper | Spoofing | Honest /download copy (Open-Anyway path + user-writable-install update limit); cask only after notarization |
| Linux native under darwin name executes attacker-influenced search path | Tampering | `package-target-natives` Mach-O assertion; RUNPATH discipline from `package-linux.sh` |

## Sources

### Primary (HIGH confidence — read this session)
- `55-CONTEXT.md` (61 lines), `REQUIREMENTS.md` macOS rows :245-250 + Owner Decisions :273-301 + External Gates :302-328 + Out of Scope :346-374, `ROADMAP.md` Phase 55 :364-378, `STATE.md`, `SUMMARY.md` Phase I + flags, `S7-macos-adhoc-signed-PLAN.md` (probe/mozconfigs/branding/unify/sidecar/matrix), `41-RESEARCH.md` (format/rows/self-test conventions).
- `upstream/taskcluster/scripts/misc/unify.sh:1-45`; `upstream/toolkit/mozapps/installer/unify.py:25-77`; `upstream/python/mozbuild/mozpack/unify.py:50-149,196-271`; `upstream/tools/signing/macos/mach_commands.py:1-751` (esp. :73-135, :386-398, :590-608, :732-751); `upstream/taskcluster/config.yml:919-1035` (`mac-signing.hardened-sign-config`).
- `upstream/build/macosx/cross-mozconfig.common:1-32`; `upstream/build/moz.configure/toolchain.configure:244-318` (SDK floor `26.5`); `upstream/build/moz.configure/update-programs.configure:58-106` (generic-certs + `43AQ936H96`); `upstream/build/variables.py:13-29` (BuildID); `upstream/browser/app/Makefile.in:64-95` (repackage + branding copies); `upstream/toolkit/moz.configure:3992-4003` (DMG extra args); `upstream/toolkit/modules/UpdateUtils.sys.mjs:80-115` (BUILD_TARGET); `upstream/security/mac/hardenedruntime/developer/browser.xml` + `production/firefox.browser.xml` (full key sets).
- `upstream/taskcluster/kinds/toolchain/macos-sdk.yml:14-46`; `upstream/taskcluster/scripts/misc/unpack-sdk.py:1-80`; `upstream/taskcluster/kinds/toolchain/misc.yml:43-91` (cctools-port/hfsplus/libdmg local-toolchains).
- `powerbrowser/packaging/node-runtime.json:1-7`; `powerbrowser/packaging/package-linux.sh:1-97`; `scripts/generate.mjs:1464-1495` (`emitMozconfig`) + `:3540-3546` (TARGETS `.mozconfig` row); `scripts/verify-platform.sh:1-120,3573-3720,4730-4789`; `.mozconfig:1-18`; `configuration.toml:31-126`.
- `docs/RELEASING.md` macOS posture :122-172, operator Mac rows :211-213, `rcodesign 0.29.0` :296-302, asset table :696-713, S7 gates :842-847; `docs/BUILD.md` packaging-hosts :997-1019, DMG mechanics :1021-1030, matrix :1065-1078.

### Secondary (MEDIUM — prior in-tree research, carried)
- `.planning/research/v1.6-deploy/STACK.md:21-24,112,127,157,167,185,197` (SDK fallback, rcodesign 0.29.0/2024-11-29, `macos-26` arm64, hosted-runner images, CA 5-yr + 2027-02-01 LOW); `PITFALLS.md:118-120,291,318,330,348` (`package-target-natives` design); `ARCHITECTURE.md:348,367-368`; `CRITIQUE.md:73,119,124,131`.

### Tertiary (LOW — attempted, not obtained)
- `web_fetch https://github.com/mozilla/rcodesign/releases` → 404 chrome (wrong org path; canonical source is `indygreg/apple-platform-rs` per training memory [ASSUMED]); `web_fetch .../indygreg/apple-platform-rs/releases` and `crates.io/crates/apple-codesign` → truncated chrome, no version table. `web_search` unusable (no `DEEPSEEK_API_KEY`). No live version/date/licence/CA claim is made from these fetches.

## Metadata

**Confidence breakdown:**
- Standard stack (unify/lipo/signing/DMG/descriptors): HIGH — every step verified against pinned upstream sources read this session.
- Architecture (job split, inside-out order, row designs): MEDIUM-HIGH — mechanics verified; Phase 47/50/41 halves assumed per CONTEXT.
- Pitfalls: HIGH — most reproduce S7/upstream reads; Mac-observed cells explicitly deferred.
- Flag I (SDK licence / rcodesign currency / CA date): LOW — recorded as SEC-13 pre-build tasks; web surface unavailable this session.

**Research date:** 2026-10-23
**Valid until:** 2026-11-22. Re-check `macos-sdk.yml` SDK pin, `macos-26` image, and rcodesign releases if planning slips; re-read Apple SLA/CA notices at SEC-13 time regardless.
