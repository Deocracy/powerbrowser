# Phase 44: Trust path (B) - Research

**Researched:** 2026-10-22
**Domain:** MAR trust path (secondary signing key, patch 030 two-slot certificates), per-BUILD_TARGET descriptor emission, descriptor buildID monotonicity, release documentation for ceremony and rotation
**Confidence:** HIGH for in-tree mechanics (every load-bearing claim was read or executed this session); MEDIUM for the secondary-key ceremony shape (no second key exists yet, extrapolated from the recorded primary ceremony); LOW for release-pipeline touchpoints owned by Phases 45/49/50 (no code exists yet)

## Summary

Everything Phase 44 needs already exists in the tree in a nearby form. Patch 030's two updater slots already accept *either* slot at verify time, so carrying two distinct DERs is a data change, not a code change. `buildUpdateXml` in `scripts/verify-mar-update-hop.mjs` is already the tree's single descriptor emitter with a proven idempotency assertion, so `scripts/build-update-xml.mjs` is a CLI wrapper plus a per-target loop, not a new format. The `update-channel` and `release-identity` rows are the exact shape to copy for the two new rows. Phase 44 adds no new framework and no package.

Seven facts change the plan's shape:

1. **The updater already implements either-slot acceptance.** `upstream/toolkit/mozapps/update/updater/archivereader.cpp:85-96` verifies the MAR against `primaryCertData` and falls back to `secondaryCertData` on failure, so a MAR "signed by the secondary key only" needs no updater code change — only a second DER in the secondary slot and a second key in the owner's custody. [VERIFIED: archivereader.cpp:85-96 read this session]
2. **Patch 030 today fills both slots with one DER.** `patches/030-powerbrowser-mar-certificates.patch:30-31` point both `primary_cert.inputs` and `secondary_cert.inputs` at `/powerbrowser/packaging/mar/mar-primary.der`. The regenerated two-DER patch changes exactly one line (the secondary slot) plus its comment. `patches-regenerated --check` stays green by construction because the script derives from the applied `upstream/`, not from a hand-kept expectation. [VERIFIED: patch read this session]
3. **The secondary DER lives at `powerbrowser/packaging/mar/mar-secondary.der`, not `brand/mar-*.der`.** The tree carries exactly one tracked DER (`powerbrowser/packaging/mar/mar-primary.der`, 1279 bytes, `git ls-files -s` mode `100644` blob `356daa8`); no `brand/mar-*.der` file exists anywhere. The `brand/mar-*.der` string survives only in the FIX-11 deny list (`.planning/workstreams/deploy/REQUIREMENTS.md:132`) and in superseded wave-E draft text that explicitly records the rename from `brand/` to `powerbrowser/packaging/mar/` (`wave-e-PLAN.md:2249`: "`brand/mar-primary.der` becomes `powerbrowser/packaging/mar/mar-primary.der`"). The plan uses the `powerbrowser/` path and creates no `brand/` file. [VERIFIED: `ls`, `git ls-files -s`, grep this session]
4. **`buildUpdateXml` has no `detailsURL` parameter today.** Its signature is `{ marBytes, marUrl, appVersion, platformVersion, buildID, displayVersion, updateType = 'minor' }` (`scripts/verify-mar-update-hop.mjs:114-122`); it emits `<update>` + `<patch type="complete" ... hashFunction="sha512">`. UPD-14 therefore extends the shared emitter (adds `detailsURL`, emitted as the `<update detailsURL="">` attribute the updater already parses at `UpdateService.sys.mjs:2384-2385,2440-2448,2544`) and wraps it in a CLI that loops over BUILD_TARGETs. The value grounds to `[urls].release_notes` through the UPD-13 pref derivation, never to a literal. [VERIFIED: emitter read; updater attribute lines located by grep this session]
5. **BUILD_TARGET is `OS + "_" + ABI`, and every input the CLI needs is already in the built tree.** `upstream/toolkit/modules/UpdateUtils.sys.mjs:89-90` formats `%BUILD_TARGET%` as `Services.appinfo.OS + "_" + this.ABI`, where ABI is `Services.appinfo.XPCOMABI` (`UpdateUtils.sys.mjs:1052-1057`, plus `-asan` / Windows `-arch` suffixes). This worktree's built tree carries all of it: `objdir/config.status` has `TARGET_XPCOM_ABI: x86_64-gcc3` (`:740`), `OS_TARGET: Linux` (`:698`), `MOZ_UPDATE_CHANNEL: default` (`:150,554`), `MAR_CHANNEL_ID` / `ACCEPTED_MAR_CHANNEL_IDS: powerbrowser-default` (`:176,339,401-402`); `objdir/dist/bin/application.ini` has `Version=153.5.1`, `BuildID=20261020215955` and the baked eleven-segment `[AppUpdate]` URL. Today's only observed BUILD_TARGET is `Linux_x86_64-gcc3`; Windows/macOS strings are explicitly deferred to stages 6/7 (`docs/RELEASING.md:1005-1007`, open question 6), so the CLI validates against an explicit target table and refuses unknown tokens. [VERIFIED: all files read this session]
6. **`release-manifest.json` does not exist, and neither do its readers.** No `release-manifest.json`, no `scripts/build-update-xml.mjs`, no `--rollback-to`, no `MOZ_BUILD_DATE` reference, and no `descriptor-monotonic` anywhere in the tree (all greps empty); the repo has zero Releases and `powerbrowser-updates` is 404 (41-RESEARCH.md live baseline: `GET repos/$R/releases` → `[]`, `GET .../powerbrowser-updates` → 404). The `descriptor-monotonic` row therefore reads published buildIDs from live Releases via `gh api` (each Release's `release-manifest.json` asset, immutable once GH-09 lands) and is full-tier with an in-memory quick self-test; an empty Release set is green with a named count line, following the `release-identity` zero-descriptor precedent (`scripts/verify-release-identity.mjs:159`). [VERIFIED: greps + absence checks + `ls scripts/build-update-xml.mjs` (no such file) this session]
7. **`docs/RELEASING.md` contradicts SEC-05/SEC-09 in three places the plan must rewrite, not append to.** The `.p12` backup is "Optional, the owner's call" (`docs/RELEASING.md:381`) but the requirement makes two offline copies mandatory; the rotation section (`:760-771`) ends with "There is no rotation runbook beyond this paragraph today; writing one is open work"; the one-key-fills-both-slots rationale (`:762`, R12) is exactly what the secondary key retires. The ceremony block (`:364-392`) already records machine (`legion`), NSS database (`~/.config/powerbrowser-release/mar-key/`), and the DER extraction command, so the secondary ceremony is a second stanza in the same shape, not a new document. [VERIFIED: RELEASING.md read this session]

**Primary recommendation:** Run in order (waves respect the tool boundary: the executor never touches keys, the owner never edits the tree):
1. **Wave 1 — SEC-05 key material (owner + executor handshake).** Owner runs the secondary ceremony (new NSS directory, new nickname or new directory per the ceremony's refusal-to-overwrite guard) and hands the executor only the public `mar-secondary.der` bytes. Executor tracks the file, regenerates patch 030 with `regenerate-patches.sh` in write mode so the secondary slot points at it, and `patches-regenerated --check` stays green. `ng065` gains the secondary-only plant (fifth case, expects `succeeded`).
2. **Wave 2 — UPD-14 descriptor builder.** Extend `buildUpdateXml` with `detailsURL` (shared emitter, imported by both the hop gate and the new CLI), write `scripts/build-update-xml.mjs` (per-target emit from the built artifacts + byte-identical re-emission), land the quick `build-update-xml-self-test` row first, then the full-tier `build-update-xml` row against the built tree.
3. **Wave 3 — UPD-26 monotonicity (consumes the Wave-2 shape).** Full-tier `descriptor-monotonic` reads published `release-manifest.json` assets from live Releases; its quick self-test is in-memory and plants a same-version older-buildID descriptor. No `--rollback-to` is built here (Phase 49/50 boundary).
4. **Wave 4 — SEC-09 docs (records what Waves 1-3 actually did).** Rewrite the ceremony, rotation, secrets-inventory and verification-map sections; make two offline `.p12` copies mandatory; delete the "no runbook" sentence by replacing it with the runbook.

Every new check is one registry row plus its `-self-test` sibling; the self-tests for script rows are `--quick`, the live rows are full-tier.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Updater trust anchors (which DERs the client accepts) | Patch 030 (`toolkit/mozapps/update/updater/moz.build` `primary_cert` / `secondary_cert` inputs) regenerated from an applied `upstream/` | Tracked DERs under `powerbrowser/packaging/mar/` | CLAUDE.md: patches are regenerated, never text-edited; AUTO-10 gates it |
| MAR signing keys (private halves) | Owner workstation `legion`, NSS directories under `~/.config/powerbrowser-release/` | Offline medium (two `.p12` copies) | Private key custody is an owner step; nothing under `~/.config/...` ever enters the repo (RELEASING.md:383) |
| Descriptor format (one source) | `buildUpdateXml` exported from `scripts/verify-mar-update-hop.mjs` | `scripts/build-update-xml.mjs` imports it (UPD-14) | One emitter so the hop gate and the ship path cannot disagree |
| Per-target descriptor inputs (version, buildID, channel, ABI) | The built tree (`objdir/dist/bin/application.ini`, `objdir/config.status`) read at check time | `configuration.toml` (`[urls]`, `[upstreams]`, `[product]`) via `resolveConfig` / `releaseIdentity` | Derive and compare; never hand-keep an expectation list |
| Published buildID truth (what monotonicity compares against) | Live GitHub Releases' `release-manifest.json` assets via `gh api` (Phase 49 DIST-07 writes them) | In-memory fixtures in `--self-test` | Truth lives at GitHub once Releases exist; the tree can only declare intent |
| Enforcement of descriptor monotonicity | Full-tier row `descriptor-monotonic` (network, `gh`) | Quick in-memory `--self-test` sibling | `--quick` promises no network; the live read needs it |
| Ceremony and rotation record | `docs/RELEASING.md` (ceremony, rotation, secrets inventory, verification map) | `docs/BUILD.md` "Key-custody rung" (command reference) | RELEASING.md is the operator manual; BUILD.md records what each build step costs |

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
#### Already decided (owner, 2026-10-20)
- All owner decisions in REQUIREMENTS.md "Owner Decisions" are binding (SEED-002 §12 recommended defaults plus the research additions).
- UPD-33: `user-initiated` is a third allowlist disposition; an unattended request to such a host fails like `deny`.
- The update channel name is chosen once and derived everywhere (UPD-11); record the choice in PROJECT.md Key Decisions.

#### Owner gates in this phase (stop points for autonomous execution)
- The secondary MAR key ceremony is an owner action (offline, private key custody). Plans build everything local — the tracked secondary DER, the regenerated patch 030, the extended emitter, the CLI, the `descriptor-monotonic` full row and its in-memory self-test, the RELEASING.md rewrites — and end with exact ceremony/rotation commands; they never generate a private key, never touch `~/.config/powerbrowser-release/`, never `git push`.
- Read-only `gh api` calls against the live org/repo are allowed for research and for the read-back row.

### Claude's Discretion
All other implementation choices are at Claude's discretion — discuss phase was skipped per user setting. Use ROADMAP phase goal, success criteria, and codebase conventions to guide decisions.

### Deferred Ideas (OUT OF SCOPE)
None — discuss phase skipped.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description (abridged from REQUIREMENTS.md) | Research Support |
|----|-------------|------------------|
| SEC-05 | Offline secondary MAR key in a recorded ceremony. Patch 030, regenerated with `regenerate-patches.sh`, carries the primary DER in one slot and the secondary in the other. Two offline `.p12` copies mandatory in RELEASING.md. `ng065` gains a "signed by the secondary key only" plant that must be accepted | Either-slot fallback at `archivereader.cpp:85-96`; today's one-DER patch (`030:30-31`); secondary path resolution (Pattern 1); ng065 four-case drive (`verify-ng-065-mar-signature.mjs:1-109`) plus fifth plant |
| UPD-14 | `scripts/build-update-xml.mjs` imports `buildUpdateXml` from `verify-mar-update-hop.mjs`, writes one descriptor per BUILD_TARGET with `detailsURL`, idempotently, from the built artifacts | Emitter signature/shape (`verify-mar-update-hop.mjs:114-150`); BUILD_TARGET = OS_ABI (`UpdateUtils.sys.mjs:89-90,1052-1057`); inputs grounded in `objdir/` + `application.ini` (Pattern 2); `detailsURL` updater attribute (`UpdateService.sys.mjs:2384-2385,2440-2448,2544`) |
| UPD-26 | Full-tier `descriptor-monotonic`: every offered `buildID` strictly greater than every buildID already published for that appVersion, read from the Releases' `release-manifest.json`. Self-test plants a same-version older-buildID descriptor. `MOZ_BUILD_DATE` never pinned to the ESR tag; rollback only through an owner-dispatched `--rollback-to` | No manifest/row/flag in tree today (greps empty); zero Releases baseline; empty-set green precedent (`verify-release-identity.mjs:159`); `gh api` read pattern (`verify-repo-controls.mjs:58,160-181`) (Pattern 3) |
| SEC-09 | RELEASING.md documents the secondary-key ceremony and rotation: which machine, which NSS database, how the DER reaches patch 030, how the primary `.p12` reaches `MAR_SIGNING_P12_B64`. Two offline `.p12` copies mandatory | Ceremony block `:364-392`, secrets inventory `:531-545`, rotation `:760-771`, verification map `:827-852`, troubleshooting `:925-947` — exact rewrite list (Pattern 4) |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- Never fork or patch Theia core. Never modify Gecko outside `patches/`; `git -C upstream diff` against the applied stack is the invariant. Firefox internals only through `PowerBrowserAPI.sys.mjs`. This phase touches no internals.
- Repo path contains no space. New files get names without spaces.
- **Patches are regenerated, never text-edited.** AUTO-10 turns this rule into the `patches-regenerated` gate (`scripts/verify-platform.sh:4646,4653`).
- **The residual-brand scan is a permanent gate.** It iterates `git ls-files`, so **stage new files before trusting a green scan**. Only `inventory/brand-tokens.json` may name the originating product. `.der` is not in `binary_extensions` (`inventory/brand-tokens.json` scope: `.png .ico .icns .jpg .gif .woff .woff2 .zip`), but the scan's residue probes are `sourcerer`/`deocracy` only, so DER bytes cannot match; the tracked-DER risk is nil, the un-staged-new-file risk is the live one.
- **One driver, one registry:** `scripts/verify-platform.sh`. Adding a check means appending one row. No sibling driver. External `bash`/`node` rows go through the `bash\ */*|node\ */*` dispatch arm (`verify-platform.sh:5134-5136`); anything else must be a bare argument-free shell function name (WR-02 guard at `:5148-5156`).
- **Derive and compare; do not hand-keep an expectation list.** Every new check gets a `--self-test` that plants faults and requires each to go red naming the drift. Never assert on the absence of a log line your own instrumentation emits.
- **No internal identifier in user-facing text.** The descriptors carry `appVersion`/`buildID`/URLs (machine surface, not user copy); the RELEASING.md rotation prose names the product "PowerBrowser" and states plain-language consequences.
- Builds run in `nix develop .#firefox` / `.#theia`; `yarn` works only inside the theia shell, while `node` works outside. **A `--quick` row must not call `yarn`.** No current quick row does.
- `scripts/verify-platform.sh --quick` is the commit gate. Its CHECKS array opens at `:3573`; the full-tier `CHECKS+=(` opens at `:4733`.
- Commit with explicit paths, because concurrent sessions may commit on main. This worktree is `workspace/deploy`.
- **Hash-locked files:** the BAK kit hash-locks `scripts/verify-ng-NNN-*.mjs`. Do not create or edit files with that prefix. `ng065` is edited *in place* (it already exists); no new `verify-ng-*` file is created. Shell commands containing the substring `ledger/` are blocked by a hook.
- **Plan gate:** the plan gate for this workstream is `python3 scripts/plan-gate.py --root . --phase 44 --plans <dir> --stream deploy`. Any v1.6 ledger row carries `"stream": "deploy"`.
- **Quick baseline:** `docs/non-gui/quick-baseline.txt` is empty (0 lines), so a new quick row must be green on the tree when it lands.

## Standard Stack

No new packages. Everything uses what is already in the tree or the dev shell.

| Tool | Version (verified) | Purpose | Note |
|------|--------------------|---------|------|
| node | v24.21.0 (host) | All new check scripts | Same as the existing rows |
| git | 2.54.0 | `diff HEAD --abbrev=10` regeneration | Pin flags against user config (40-RESEARCH Pitfall 1) |
| `scripts/lib/built-tree.mjs` | in-tree | `OBJDIR`, `builtVersion()`, `configStatus()`, `extractPackage()` | ng065 already imports it; the new full rows reuse it |
| `scripts/generate.mjs` exports | in-tree | `resolveConfig`, `releaseIdentity` (`:2796`), `updateChannel` (`:1393`), `UPDATE_CHANNEL` (`:1387`) | Same resolver as the generator, so gates cannot disagree |
| NSS tools from the built tree | `objdir/dist/bin/{certutil,pk12util,signmar}` present; `objdir/dist/bin/updater` present; `objdir/dist/host/bin/mar` present | Ceremony, signing, verification | [VERIFIED: `ls` this session] `objdir/dist/host/bin/signmar` does not exist (container-build question belongs to Phase 45) |
| `gh` CLI | on PATH | `descriptor-monotonic` live reads; `release-manifest.json` asset downloads | `verify-repo-controls.mjs:58,160-181` is the `gh api` read pattern; pin `X-GitHub-Api-Version: 2022-11-28` |
| python3 | host + `.#theia` | Nothing new in this phase | No licensing-style preprocessing needed |

**Installation:** none.

## Package Legitimacy Audit

No external packages are installed by this phase. No npm, PyPI, crates, or nixpkgs addition.

| Package | Verdict | Reason |
|---------|---------|--------|
| (none) | — | Emitter extension, CLI wrapper, two registry rows and docs prose use node built-ins + the built tree only |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
~/.config/powerbrowser-release/mar-key/          ~/.config/powerbrowser-release/mar-secondary/ (NEW, owner only)
  key4.db + password.txt (primary)                 key4.db + password.txt (secondary)
        │ certutil -L -r                            │ certutil -L -r
        ▼                                           ▼
powerbrowser/packaging/mar/mar-primary.der   powerbrowser/packaging/mar/mar-secondary.der (NEW, tracked)
        │                                           │
        └───────────────┬───────────────────────────┘
                        ▼
patches/030-powerbrowser-mar-certificates.patch ──regenerate-patches.sh──> upstream/
  primary_cert.inputs += [.../mar-primary.der]         toolkit/mozapps/update/updater/moz.build
  secondary_cert.inputs += [.../mar-secondary.der]      (primaryCertData / secondaryCertData)
                        │
                        ▼ archivereader.cpp: verify primary, fall back to secondary
              ng065-mar-signature-enforced (FULL): fork-signed / unsigned /
                    throwaway-key / other-channel / secondary-only (NEW, must be "succeeded")

objdir/dist/bin/application.ini ──┐ (Version, BuildID, [AppUpdate] URL)
objdir/config.status ─────────────┼─> scripts/build-update-xml.mjs (NEW) ──imports buildUpdateXml──> <channel>/<BUILD_TARGET>/update.xml × N
  TARGET_XPCOM_ABI, OS_TARGET,     │   from scripts/verify-mar-update-hop.mjs
  MOZ_UPDATE_CHANNEL,              │   one descriptor per BUILD_TARGET, detailsURL from [urls].release_notes,
  MAR_CHANNEL_ID                  │   second run byte-identical
configuration.toml [urls] ────────┘
  .release_notes, .update

GitHub Releases (live, zero today) ── release-manifest.json asset per Release ──> descriptor-monotonic (FULL)
  every offered buildID  >  every published buildID for that appVersion (strict)
  self-test (QUICK, in-memory): same-version older-buildID plant goes red

docs/RELEASING.md: ceremony + rotation + secrets inventory + verification map (SEC-09 rewrite)
```

### Recommended file layout (new or changed)

```
powerbrowser/packaging/mar/mar-secondary.der   # NEW tracked public certificate (secondary)
patches/030-powerbrowser-mar-certificates.patch # REGENERATED (secondary slot line + comment only)
scripts/verify-ng-065-mar-signature.mjs        # MOD: fifth case, secondary-only sign -> "succeeded" (+ self-test note; full-tier, no new self-test row)
scripts/verify-mar-update-hop.mjs              # MOD: buildUpdateXml gains detailsURL (shared emitter, keeps import guard at :504-513)
scripts/build-update-xml.mjs                   # NEW: CLI --emit/--check + per-BUILD_TARGET loop + target table; imports buildUpdateXml
scripts/verify-descriptor-monotonic.mjs         # NEW: full row + in-memory --self-test (name TBD by planner; see Pattern 3 note)
scripts/verify-platform.sh                     # MOD: 2-4 new rows + self-test siblings (quick array :3573-4731 vs full array :4733+)
docs/RELEASING.md                              # MOD: ceremony, rotation, secrets inventory, verification map, troubleshooting (Pattern 4 list)
```

### Pattern 1: SEC-05, the two-DER patch and the secondary-only plant

**Verified state:**
- `patches/030-powerbrowser-mar-certificates.patch` (34 lines) replaces the channel-conditional `release_primary.der` / `release_secondary.der` selection with two fork lines [VERIFIED: read this session]:
  ```
  +# The updater verifies every MAR against the fork's own certificate, on every
  +# update channel (non-GUI NG-065). One key fills both slots.
  +primary_cert.inputs += ["/powerbrowser/packaging/mar/mar-primary.der"]
  +secondary_cert.inputs += ["/powerbrowser/packaging/mar/mar-primary.der"]
  ```
- `scripts/regenerate-patches.sh` derives every patch from the applied `upstream/`: `patch_paths` reads both sides of each `diff --git a/X b/Y` header (`:49-52`); `regenerate_one` runs `git -C "$UPSTREAM_DIR" -c core.abbrev=10 diff --no-ext-diff --no-color --no-textconv --diff-algorithm=myers --abbrev=10 HEAD -- <paths>` with user/system config off (`:84-90`); `--check` (`run_check`, `:120-147`) `cmp`s byte-for-byte, with the CR-01 moved-file carve-out (compare `+`/`-` lines only, NOTE + regenerate) and the WR-01 dropped-path refusal (`check_kept`, `:57-65`). Self-test is hermetic (`run_self_test`, `:185-338`). [VERIFIED: script read this session]
- The applied `upstream/toolkit/mozapps/update/updater/moz.build:69-70` today carries the same two lines; the pre-image at `git -C upstream show HEAD:...` carries the stock channel-conditional. [VERIFIED: both read this session]
- Upstream trust semantics: `archivereader.cpp:85-96` tries `primaryCertData`, and only on failure tries `secondaryCertData` (`#else` branch; `DEP_UPDATER` uses dep1/dep2, `TEST_UPDATER` uses xpcshell). Either slot accepting is upstream behaviour, not a fork change. `gen_cert_header.py:create_header` bakes each DER into a `*Cert.h` byte array. [VERIFIED: read this session]
- `ng065` (`scripts/verify-ng-065-mar-signature.mjs:1-109`, full-tier) drives the *packaged tree's own updater* over four full MARs: fork-signed → `succeeded` + payload applied; unsigned → `failed: <CERT_VERIFY_ERROR>`; throwaway-key → `failed: <CERT_VERIFY_ERROR>`; fork-signed-for-another-channel → `failed: <MAR_CHANNEL_MISMATCH_ERROR>`. Codes come from `upstream/toolkit/mozapps/update/common/updatererrors.h` at check time; the updater argument version from `upstream/toolkit/xre/nsUpdateDriver.cpp`. Key DB `~/.config/powerbrowser-release/mar-key` (`KEY_DB`, `:21`), nickname `powerbrowser-mar` (`NICK`, `:23`), password from `password.txt` (`:22,39,79`), public CERT `powerbrowser/packaging/mar/mar-primary.der` (`:24`), preconditions at `:30-39` (`.mozconfig` must not carry `--enable-unverified-updates`; `MOZ_VERIFY_MAR_SIGNATURE` set; channel ids equal; CERT present; `key4.db` + non-empty password present). `NSS_ENV` sets `LD_LIBRARY_PATH` to `objdir/dist/bin` (`:25`). This worktree has all of it: `objdir/dist/bin/{certutil,signmar,updater}` present, `objdir/dist/host/bin/mar` present, `~/.config/powerbrowser-release/mar-key/{cert9.db,key4.db,password.txt,pkcs11.txt}` present. [VERIFIED: script + `ls` this session]
- FIX-11 deny-list resolution: `.planning/workstreams/deploy/REQUIREMENTS.md:132` lists both `powerbrowser/packaging/mar/**` and `brand/mar-*.der`. The first covers the new file (the fixer may never touch key-adjacent material). The second is a vestigial guard for the pre-rename path — no `brand/mar-*.der` file exists in any `git ls-files` output, and wave-E explicitly records the rename (`wave-e-PLAN.md:2249`). The plan tracks the secondary at `powerbrowser/packaging/mar/mar-secondary.der` and creates nothing under `brand/`. [VERIFIED: greps + `ls brand/` (only `HUMAN-REVIEW.md`, `mark.svg`) this session]
- Scan implications of a new tracked `.der`: `check-patch-surface.sh` reads added `+` lines only; `+++` header paths are never read (`:98-101`), so the patch line `+secondary_cert.inputs += ["/powerbrowser/packaging/mar/mar-secondary.der"]` is scanned as text and contains no required-string manifest value (`powerbrowser` as a path segment is hook syntax, green per the `:92-93,211-227` control; the longest-first ordered match at `:145` cannot fire on it). The DER bytes themselves never enter a patch. `scan-brand-residue.mjs` excludes only the `binary_extensions` in `inventory/brand-tokens.json` (`.png .ico .icns .jpg .gif .woff .woff2 .zip` — no `.der`), but its residue probes are `sourcerer`/`deocracy` substrings over decoded text; DER bytes cannot match a brand token. `git check-attr` reports the existing DER as `text: auto, eol: lf` (`.gitattributes: * text=auto eol=lf`); the new DER inherits the same handling — keep it, do not add a `-text` exception without a reason. Stage the new file before trusting the brand scan (CLAUDE.md Pitfall). [VERIFIED: scripts + `git check-attr` + `ls -la` (1279 bytes) this session]

**Do:**
1. Owner (offline, `checkpoint:human-action`): run the secondary ceremony on `legion` in a *new* NSS directory (the ceremony block refuses to run over an existing store: `[ -e "$D/key4.db" ] && { ...; exit 1; }`, RELEASING.md:371). Suggested `D=$HOME/.config/powerbrowser-release/mar-secondary` reusing the same `certutil -N/-S` shape (4096-bit RSA, `CN=PowerBrowser MAR secondary`, `-Z SHA384 -v 240`), then `certutil -L -r > powerbrowser/packaging/mar/mar-secondary.der` and **two** `pk12util -o` copies to two separately stored offline media (SEC-05/SEC-09 mandatory, not optional). Record date, machine, NSS paths, key nicknames, DER SHA256, and `.p12` copy locations *as counts and media labels, never secrets*.
2. Executor: `git add` the DER, edit the applied `upstream/toolkit/mozapps/update/updater/moz.build` secondary line + comment to the new path, run `bash scripts/regenerate-patches.sh` (write mode), confirm `git diff` shows the one-line slot change plus comment, run `--check` (green) and `--quick` (green).
3. Executor: extend ng065 with the fifth case — build an unsigned MAR for the channel, `signmar -d <secondary-DB> -n <secondary-nick> -s`, drive the packaged updater, require `update.status` exactly `succeeded` and the marker applied. The secondary DB path must come from an env var (e.g. `PB_MAR_SECONDARY_DB`) with a named SKIP/FAIL when unset, so CI without the owner key never goes green-by-construction. Name the nickname distinctly (`powerbrowser-mar-secondary`) so the "signed by the secondary key only" proof cannot pass with the primary key by accident.
4. Keep `patches/030-*` in the FIX-11 deny file as-is; the deny entry already covers the regenerated patch, which is the point (the fixer must route through `regenerate-patches.sh` per FIX-02).

**Why it is low risk:** the trust-semantics change is zero lines of C++; the patch change is one input path; `patches-regenerated` derives rather than expects, so it cannot be hand-kept stale; ng065 already proves the negative cases, so the fifth case only adds the positive proof the requirement names.

### Pattern 2: UPD-14, one descriptor per BUILD_TARGET with detailsURL

**Verified state:**
- `export function buildUpdateXml({ marBytes, marUrl, appVersion, platformVersion, buildID, displayVersion, updateType = 'minor' })` (`verify-mar-update-hop.mjs:114-122`): `marDigest` = sha512 hex + byte size (`:95-100`); `xmlEscape` (`:102-104`); emits `<?xml?><updates><update type displayVersion appVersion platformVersion buildID><patch type="complete" URL hashFunction="sha512" hashValue size/></updates>` (`:116-121`). `parseUpdateXml` (`:125-150`) returns the attribute object or `null`. The import guard (`:504-522`) lets another module `import { buildUpdateXml }` without running the gate (`INVOKED_DIRECTLY` check). [VERIFIED: read this session]
- `%BUILD_TARGET%` = `Services.appinfo.OS + "_" + this.ABI` (`UpdateUtils.sys.mjs:89-90`); `ABI` = `Services.appinfo.XPCOMABI` with Windows `-arch` and `-asan` suffixes (`:1052-1070`); `%CHANNEL%` = update channel (`getUpdateChannel`), `%VERSION%`/`%BUILD_ID%` = `appinfo.version`/`appBuildID`, `%PLATFORM_VERSION%` = `platformVersion`. The remaining eleven-segment placeholders (`%PRODUCT% %LOCALE% %OS_VERSION% %SYSTEM_CAPABILITIES% %DISTRIBUTION% %DISTRIBUTION_VERSION%`) are enumerated at `:76-112`. [VERIFIED: read this session]
- `detailsURL` is a first-class `<update>` attribute upstream: `_attrNames` includes it (`UpdateService.sys.mjs:2307`); the parser stores it (`:2384-2385`); absence falls back to the `app.update.url.details` distribution pref (`:2440-2448`); the serializer re-emits it (`:2544`). Adding it to the fork descriptor is compatible, not novel. [VERIFIED: `sed` read this session]
- Ground truth for inputs today (this worktree, no Phase 45/49): `application.ini` (`objdir/dist/bin/application.ini`): `Name=powerbrowser Version=153.5.1 BuildID=20261020215955`, `[AppUpdate] URL=https://updates.powerbrowser.org/update/6/%PRODUCT%/...`. `config.status`: `TARGET_XPCOM_ABI x86_64-gcc3`, `OS_TARGET Linux`, `MOZ_UPDATE_CHANNEL default`, `MAR_CHANNEL_ID=ACCEPTED=powerbrowser-default`. `configuration.toml [urls]`: `update`, `release_notes=https://github.com/DeBIOS-Foundation/powerbrowser/releases`, `homepage`. `powerbrowser/packaging/version/{version,release}.txt`: `153.5.1` / `v153.5.1-1`. Observed BUILD_TARGET set: exactly one, `Linux_x86_64-gcc3` (config `x86_64-gcc3` + OS `Linux`, matching `UpdateUtils` order). [VERIFIED: all read this session]
- The two new files the requirement presupposes do not exist: `scripts/build-update-xml.mjs` (no such file), `release-manifest.json` (no such file), `powerbrowser-updates` repo (404). The hop-evidence directory `.mozbuild/mar-hop/` does not exist here either (Phase 45/49 work). [VERIFIED: `ls` failures + greps this session]
- Naming precedent: `docs/RELEASING.md:832` already names the quick row `build-update-xml-self-test` with plants "an unknown target token; an `application.ini` with no BuildID; a `TARGET_XPCOM_ABI` disagreeing with the table; `--channel` given the MAR channel id while the fixture `config.status` carries the update channel". The full row is therefore `build-update-xml` (same stem, no suffix), exactly like `release-identity`/`release-identity-self-test` and `update-channel`/`update-channel-self-test`. [CITED: RELEASING.md:832]

**Do:**
1. Extend the shared emitter first: add `detailsURL` to the `buildUpdateXml` parameter object, `xmlEscape` it, emit `detailsURL="..."` on `<update>`, extend `parseUpdateXml` to return it, and extend the hop gate's idempotency assertion (generate twice, byte-equal) to cover it. Keep the import guard untouched so `import { buildUpdateXml }` stays side-effect-free. Value rule: `detailsURL` = `[urls].release_notes` (the UPD-13 release-notes link, already `user-initiated`); the CLI takes `--details-url` only as an override and fails when it is not `https:`.
2. Write `scripts/build-update-xml.mjs` in the `verify-update-channel.mjs` shape (header comment with numbered derivation steps; strict arg parse; injectable `runChecks(root, overrides)`; `main` with PASS/FAIL + `process.exit(main())`; green-baseline-first self-test): inputs per target are `{ application.ini (Version, BuildID), config.status (TARGET_XPCOM_ABI, OS_TARGET, MOZ_UPDATE_CHANNEL, MAR_CHANNEL_ID), MAR bytes on disk, channel flag }`; outputs are `<outdir>/<channel>/<BUILD_TARGET>/update.xml` (one per target in an explicit target table derived from `OS_TARGET × TARGET_XPCOM_ABI`, with the Darwin/Windows rows marked pending until stages 6/7 observe them); `--check` re-emits and byte-compares; a second run over identical inputs is byte-identical (no timestamps, no nonces — same determinism the hop gate asserts at `verify-mar-update-hop.mjs:273-292`).
3. Bake in the four RELEASING.md:832 plants from day one: unknown target token (refuse, naming the table); `application.ini` with no BuildID (refuse); `TARGET_XPCOM_ABI` disagreeing with the table (refuse, naming both); `--channel` given the MAR channel id while `config.status` carries the update channel (refuse, naming both — the exact `failed: 22` conflation `docs/RELEASING.md:920-933` warns about; the emitter takes the side that cannot be guessed, per `:928-932`).
4. Register two rows: quick `build-update-xml-self-test` (synthetic fixtures in mkdtemp, the four plants + byte-identity control) and full `build-update-xml` (reads the real `objdir/` + MARs; FAILs naming the missing prerequisite when `objdir/` is absent — Pitfall 4 — never SKIPs green). Cross-check `--channel` against `MOZ_UPDATE_CHANNEL` in the given `config.status` (RELEASING.md:928-932).

**Why it is low risk:** the format, the hash-pinning, the idempotency proof and the `TARGETS`-table idea all exist; the CLI only wires built-tree facts the tree already bakes.

### Pattern 3: UPD-26, descriptor-monotonic (full-tier + in-memory self-test)

**Verified state:**
- Nothing with this name exists: `descriptor-monotonic`, `release-manifest.json`, `--rollback-to`, `MOZ_BUILD_DATE` all grep empty across `scripts/ docs/ powerbrowser/ configuration.toml .mozconfig inventory/ .github/`. The requirement's world (Phase 49 DIST-07 writing `release-manifest.json` per build; DIST-09 `descriptor` job committing per-target `update.xml` to `powerbrowser-updates` after this row passes; REL-02 withdraw job) is entirely future. [VERIFIED: greps this session]
- The read pattern to copy is `verify-repo-controls.mjs`: every live `gh api` GET goes through one fail-closed helper (`ghGet`, `:58ff`); a non-2xx, missing/authless `gh`, or JSON parse error is a FAIL naming the endpoint + `gh auth status` next step, never a SKIP (`:76ff`, `NEXT_AUTH` at `:58`). Pinned header `X-GitHub-Api-Version: 2022-11-28` (41-RESEARCH §Live baseline). Zero-Releases handling precedent: `RELEASES_PATH = 'repos/{owner}/{repo}/releases?per_page=1'` (`:160`) with a BLOCKED line when the zero-Releases check cannot run (`:171-181`). [VERIFIED: read this session]
- The derive-and-compare shape to copy is `verify-update-channel.mjs` / `verify-release-identity.mjs`: `runChecks(root, overrides)` with injectable reads (`update-channel:150-153`, `release-identity:83-92`); sorted consumer output; green-baseline-first self-test with a plants table, each plant red naming file + value, one control staying green, writes nothing (`update-channel:259-330`; `release-identity:200-326` mkdtemp variant). [VERIFIED: read this session]
- Upstream version semantics the row must not contradict: `updateIsAtLeastAsOldAs` treats equal `appVersion` + different `buildID` as newer (40-RESEARCH Pattern 1 §3, `UpdateService.sys.mjs:1954-1963`), which is why UPD-26 can demand strictly increasing buildIDs at a fixed ESR version instead of a version bump. The hop gate already treats a same-version loop as plumbing-only and fails it (`verify-mar-update-hop.mjs:250-261`); monotonicity is the release-channel version of the same invariant. [CITED: 40-RESEARCH.md Pattern 1; VERIFIED: hop gate lines read this session]
- `MOZ_BUILD_DATE` today: unset everywhere (no reference in tree). Configure's default derives the build ID from time unless overridden; "never pinned to the ESR tag" forbids setting it (or any buildID source) to a tag-derived constant (e.g. the tag's commit date), which would freeze the buildID across rebuilds and make every later descriptor fail this row while looking reproducible. The row does not need to read `MOZ_BUILD_DATE` — it compares *offered vs published* buildIDs — but the plan must grep-assert no such pinning lands in `generated/`, `.mozconfig` emitter, or `release.yml`. [ASSUMED: configure default behaviour; standard Mozilla build semantics]

**Do:**
1. Write `scripts/verify-descriptor-monotonic.mjs` (planner confirms the filename; the label is fixed as `descriptor-monotonic` by the requirement): inputs are the candidate descriptor set (paths or `--manifest`+`--descriptors`, planner's choice, defaulting to the `build-update-xml.mjs` output tree) and the published set (every non-draft Release's `release-manifest.json` asset fetched by `gh api`, parsed for `{appVersion, buildID}` per BUILD_TARGET). Rule: for each candidate `(appVersion, buildID, target)`, `buildID` (lexicographic-numeric string compare — buildIDs are fixed-length `%Y%m%d%H%M%S`, so lexicographic equals numeric) must be strictly greater than *every* published `buildID` for the same `appVersion` (any target). A same-version older-or-equal buildID fails naming the descriptor, the offered buildID, and the published buildID + Release tag. Zero published Releases (today's state) is green with a named count line (`0 published buildID(s)`), never a vacuous pass — the `release-identity:159` precedent.
2. Self-test (quick, in-memory through `overrides.get` + fixture descriptors, no network, no `gh`): green control first (candidate above the only published buildID), then plants — same-version older buildID (red, naming both); same-version equal buildID (red); older appVersion with newer buildID (green control — different version line); malformed `release-manifest.json` asset (red, naming the Release); getter that throws (red, naming the endpoint, never green). It writes nothing.
3. Register `descriptor-monotonic` as **full-tier** (needs network + `gh auth` with `repo` scope) after `repo-controls` (`verify-platform.sh:5092`), with the "Full tier: read-only `gh api`..." honesty comment, and `descriptor-monotonic-self-test` in the quick array beside `build-update-xml-self-test`. Both commands must match `node */*` (dispatch guard `:5134`).
4. Record `--rollback-to` as a Phase 49/50 boundary, not a Phase 44 build: the requirement makes rollback possible *only* through an owner-dispatched flag on the withdraw/descriptor path (REL-02/DIST-09), which does not exist yet. Phase 44 builds the refusal (a downgrade descriptor goes red); it does not build the override. State this in RELEASING.md so a future flag cannot be mistaken for a second downgrade path.

### Pattern 4: SEC-09, the RELEASING.md rewrite (five edits, no new document)

**Verified state — what is there today (all [VERIFIED: read this session]):**
- Architecture paragraph (`:50-63`): `sign-upload` "decodes the MAR signing key from two environment secrets, imports the decoded `.p12` ... with `pk12util -i`, signs every MAR with `signmar -d <db> -n powerbrowser-mar -s`, verifies each one against the tracked certificate ... (`signmar -d <db> -n powerbrowser-mar -v` ..., writes `SHA256SUMS`, creates the GitHub Release as a **draft** ..., attests build provenance, emits one `update.xml` per BUILD_TARGET with `scripts/build-update-xml.mjs --emit`, commits the descriptor tree to `DeBIOS-Foundation/powerbrowser-updates`, and only then publishes."
- Operator table (`:197-198`): two `mar-signing-and-update-integrity` rows — "The MAR key ceremony (below)" and "The MAR key ceremony (key store lives on `legion` at `~/.config/powerbrowser-release/mar-key/`; optional `.p12` backup to the offline medium) and one MAR signed with that store's key for the loopback proof".
- Ceremony + custody (`:364-392`): machine `legion`, `PB=$HOME/coding/Power-Browser; D=$HOME/.config/powerbrowser-release/mar-key`, refusal guard over an existing store, `certutil -N`, `certutil -S ... -n powerbrowser-mar -s "CN=PowerBrowser MAR signing,O=..." -x -t ",," -k rsa -g 4096 -Z SHA384 -v 240`, `shred -u noise`, `certutil -L -r > powerbrowser/packaging/mar/mar-primary.der`, *optional* `pk12util -o <medium>/powerbrowser-mar.p12`, `ls -l` hygiene ("nothing from this directory ever enters the repo"), "One key fills both slots (R12)", "Only the public certificate ... is tracked" (`:386-390`).
- Secrets inventory (`:531-545`): `MAR_SIGNING_P12_B64` + `MAR_SIGNING_P12_PASSWORD` in `release` env (from `mar-signing-and-update-integrity`); offline medium holds `powerbrowser-mar.p12` + key-store password (`:541`).
- Rotation (`:760-771`): "One key fills both slots (R12), so a rotation needs a client rebuild ... ship the transition release signed with the **old** key whose updater embeds the new certificate ..., and only then switch signing to the new store" plus "There is no rotation runbook beyond this paragraph today; writing one is open work."
- Verification map (`:827-852`): `mar-sign-self-test` row (`:831`) and `build-update-xml-self-test` row (`:832`) already named; the `releasing-maintenance` row (`:852`) plants include "a DER basename removed", so the docs gate already watches DER references.
- Troubleshooting (`:920-947`): `--channel` vs `--mar-channel-id` conflation (`failed: 22`, `:920-933`) and the `signmar -T/-v` verify form (`failed: 19`, `:935-947`).

**Do — the plan rewrites these five places (edit, never append a sibling section):**
1. **Ceremony (`:364-392`)**: add a second stanza "Secondary key" with the same fields — machine (`legion`), new NSS database path (e.g. `~/.config/powerbrowser-release/mar-secondary/`), nickname, `certutil -L -r > powerbrowser/packaging/mar/mar-secondary.der` line, SHA256 of the DER, and how the DER reaches patch 030 (`regenerate-patches.sh` write mode from the applied `upstream/`, never a hand edit). Change "Optional, the owner's call" (`:381`) to **two mandatory offline `.p12` copies on two separately stored media** (SEC-05), and say the doc records their existence + date, never their location.
2. **Rotation (`:760-771`)**: delete the "no runbook" sentence by replacing it with the runbook — transition release signed with the old key while embedding the new DER; `descriptor-monotonic` green on the transition; switch `MAR_SIGNING_P12_B64` to the new `.p12`; retire the old store only after the transition release's N+1 hop proves. Retire the "One key fills both slots (R12)" rationale (it describes the pre-secondary world).
3. **Secrets inventory (`:531-545`)**: add the secondary `.p12` (base64) + password rows if the secondary ever signs releases, or state the secondary signs nothing until rotation and its `.p12`s live offline only. Either way, "how the primary `.p12` reaches `MAR_SIGNING_P12_B64`" (decode → `release` env secret, owner-handled, never through `legion` per SEC-08) must read as a procedure, not a pointer.
4. **Verification map (`:827-852`)**: update `mar-sign-self-test` (secondary-only accept plant), add `build-update-xml` (full) beside the existing `build-update-xml-self-test`, add `descriptor-monotonic` + `descriptor-monotonic-self-test`, and note the `ng065` fifth case. Keep the one-row-per-row rule (no sibling table).
5. **Stage plan index (`:985-987`)**: row 3 keeps "The key-rotation runbook" as its deferred item only if the runbook lands in rotation; otherwise the row must say where the runbook now lives. Remove the deferral once written — a shipped runbook must not sit beside a pointer that says it is missing.

### Anti-Patterns to Avoid

- **Text-editing patch 030.** Editing the `secondary_cert.inputs` line by hand without recomputing blob hashes degrades `git apply --3way` into a silent no-op (CLAUDE.md; 40-RESEARCH Pitfall 1). Regenerate from the patched `upstream/`; `patches-regenerated --check` is the proof.
- **Tracking a private key or password.** `key4.db`, `password.txt`, any `.p12` under the repo root trips the brand scan's staging discipline and, worse, ships a secret. Only `.der` (public) is tracked. The ceremony's `ls -l` hygiene line (`:383`) exists for this.
- **A bare `powerbrowser-release` grep in a new row.** That string legitimately names the MAR key store (`~/.config/powerbrowser-release/mar-key/`, RELEASING.md:330) — the `update-channel` row already excludes by structured-pattern matching (Pattern 3 in 40-RESEARCH); copy that, not a substring search.
- **Feeding a revisioned display version into the descriptor.** `is_esr` clears when the display version does not end in `esr` (40-RESEARCH Pitfall 3); `displayVersion` in the descriptor is the release key without `v` (`verify-release-identity.mjs:154-156`), never a Gecko build input.
- **Calling `yarn` or the network from a quick row.** Quick = no build, no browser, no display, no network (`verify-platform.sh` honesty comments). `descriptor-monotonic` live reads are full-tier; only its in-memory self-test is quick.
- **Asserting on the absence of a log line** unless the line is proven emitted by the code under test (CLAUDE.md rule 1).
- **Hand-keeping a BUILD_TARGET list in two places.** One target table (in `build-update-xml.mjs`, derived from `OS_TARGET × TARGET_XPCOM_ABI` with Darwin/Windows rows marked pending) read by both emit and `--check`; the `update-channel` row picks new consumers up with no edit (40-RESEARCH Pattern 3).
- **Routing `detailsURL` through `mozillaEndpointPrefs` or the allowlist gate.** It is a click destination (`user-initiated` disposition family, UPD-33), never an unattended fetch; `verify-theia-endpoints` check 2 requires presence in *some* disposition, which the UPD-13 commit already established for the homepage/release-notes hosts.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Patch diffs | A custom differ, or `--full-index` | `git -C upstream diff HEAD --abbrev=10` with pinned config (regenerate-patches.sh:84-90) | Byte-identical with the tracked patches |
| Descriptor XML | String templates in two places, or a second XML library | `buildUpdateXml` imported from `verify-mar-update-hop.mjs` (import guard :504-513) | One emitter; the hop gate and the ship path cannot disagree |
| Update-URL / channel derivation | Fresh TOML reads per script | `resolveConfig()` + `releaseIdentity()` + `updateChannel()` from `scripts/generate.mjs` | Same resolver as the generator, so gates cannot disagree |
| Endpoint verdicts | A new matcher | The existing exact-or-leading-dot rule (shared `scripts/lib/endpoint-verdict.mjs` per 40-RESEARCH Pattern 5) | Three copies already collapsed to one |
| Live GitHub reads | fetch + token plumbing | `gh api -H 'X-GitHub-Api-Version: 2022-11-28'` through one fail-closed helper (`verify-repo-controls.mjs:58,76ff`) | Owner token stays in `gh`; our code never holds a secret |
| `detailsURL` semantics | Guessing what the client does with it | Upstream `UpdateService.sys.mjs:2384-2385,2440-2448,2544` (parse → pref fallback → serialize) | Read this session |
| BUILD_TARGET semantics | Guessing the join order | Upstream `UpdateUtils.sys.mjs:89-90` (`OS + "_" + ABI`) + `application.ini`/`config.status` at check time | Read this session |
| Version comparison in the updater | Assumptions about revision ordering | Upstream `updateIsAtLeastAsOldAs` (equal appVersion + different buildID = offered) | Read in 40-RESEARCH; relied on by UPD-26 |

## Common Pitfalls

### Pitfall 1: `git diff` without `HEAD` regenerates nothing
**What goes wrong:** the 0-byte output makes every patch look "regenerated empty", or a write mode truncates the patches. **Why:** `apply-patches.sh` uses `git apply --3way`, which stages the result into the index. **Avoid:** `diff HEAD` with pinned `core.abbrev`, `--diff-algorithm=myers`, `--no-ext-diff`/`--no-color`, global/system config off (regenerate-patches.sh:84-90). **Warning sign:** any regenerated patch smaller than its tracked copy.

### Pitfall 2: the secondary ceremony overwrites the primary store
The ceremony block refuses to run over an existing store (`[ -e "$D/key4.db" ] && { ...; exit 1; }`, RELEASING.md:371). The secondary ceremony **must** use a new directory (and a distinct nickname); reusing `mar-key/` destroys the primary key. The planner states the exact new path in the checkpoint commands.

### Pitfall 3: `descriptor-monotonic` green on an empty world
Zero Releases + zero candidate descriptors must print named count lines (following `release-identity:159`'s "`N` tracked update.xml descriptor(s)"), not pass silently. An agreement over nothing proves nothing (`update-channel` vacuity rule, `verify-update-channel.mjs:217-220`).

### Pitfall 4: full-tier rows need a built tree this worktree may not keep
This worktree **has** `objdir/` (`dist/bin/{updater,signmar,certutil,application.ini,update-settings.ini}`, `dist/host/bin/mar`, `config.status`) but **lacks** `.mozbuild/mar-hop/` and `objdir-release/`. `ng065` is runnable here; `mar-update-hop` FAILs naming the missing evidence (by design); the new full `build-update-xml` row must FAIL naming the missing MAR/`objdir` rather than SKIP. Never claim a full row green without its inputs. [VERIFIED: `ls` this session]

### Pitfall 5: the update-channel row red on day one of Wave 2
A new `--channel`/`--mar-channel-id` consumer with the wrong value, or a new `update.xml` path with a wrong channel segment, reddens `update-channel`. The descriptor output tree (`<channel>/<BUILD_TARGET>/update.xml`) is a consumer the day it lands — emit it under `default/` (UPDATE_CHANNEL, `generate.mjs:1387`) and confirm `--quick` before committing.

### Pitfall 6: `planning-paths` row
New scripts must not reference live `.planning/workstreams/deploy/phases/...` paths (`verify-platform.sh:4627-4633`). Keep provenance in comments without paths, or point at archived paths.

### Pitfall 7: `MOZ_BUILD_DATE` pinned for "reproducibility"
Pinning the build date to the ESR tag (or any constant) freezes the buildID and makes every later descriptor fail `descriptor-monotonic` while looking deliberate. Reproducibility work belongs to Phase 45's container build, never to a date pin. The plan grep-asserts no such pinning.

### Pitfall 8: building `--rollback-to` in Phase 44
Rollback is an owner-dispatched override on the Phase 49/50 withdraw path (REL-02/DIST-09). Building a second downgrade mechanism here — or silently accepting a downgrade descriptor — violates UPD-26. Phase 44 builds only the refusal; the flag is recorded as a boundary.

## Code Examples

### Regenerated two-DER patch 030 (shape only; bytes come from regenerate-patches.sh)
```diff
 # The updater verifies every MAR against the fork's certificates, on every
 # update channel (non-GUI NG-065). The secondary slot carries the offline
 # secondary key so losing the primary no longer strands users (SEC-05).
 primary_cert.inputs += ["/powerbrowser/packaging/mar/mar-primary.der"]
-secondary_cert.inputs += ["/powerbrowser/packaging/mar/mar-primary.der"]
+secondary_cert.inputs += ["/powerbrowser/packaging/mar/mar-secondary.der"]
```
Only the secondary line and the comment change; the `index` line is recomputed by the script, never typed.

### ng065 fifth case (shape only; DB path from the environment)
```js
// scripts/verify-ng-065-mar-signature.mjs — append inside drive():
const secondaryDb = process.env.PB_MAR_SECONDARY_DB; // owner-provided, never in repo
// precondition names it when unset; the case below requires 'succeeded':
['secondary-only', sign(secondaryDb, 'powerbrowser-mar-secondary', unsigned, 'secondary-only.mar', secondaryPassword), 'succeeded'],
```
`sign()` already reads the NSS password from stdin (`:74-77`); the secondary password follows the same `password.txt`-beside-the-DB convention, never a literal.

### CLI derivation core (shape only; values come from the built tree)
```js
// scripts/build-update-xml.mjs (new). TARGETS is derived, not hand-kept twice:
import { buildUpdateXml } from './verify-mar-update-hop.mjs';
// per target: read application.ini (Version, BuildID), config.status
// (TARGET_XPCOM_ABI, OS_TARGET, MOZ_UPDATE_CHANNEL), MAR bytes from disk,
// detailsURL from resolveConfig().config.urls.release_notes (https, non-empty).
// emit `<outdir>/<channel>/<BUILD_TARGET>/update.xml`; --check re-emits and cmp's.
```

### Registry rows (append; quick array vs full array by honesty comment)
```bash
    # NEW (Phase 44, UPD-14): one descriptor per BUILD_TARGET from the built tree, detailsURL
    # from [urls].release_notes, byte-identical on re-emission. Honestly --quick for the
    # self-test only: synthetic application.ini/config.status/MAR bytes in mkdtemp, no build,
    # browser, display or network. The live row reads objdir/ and is full-tier.
    "build-update-xml-self-test|node $REPO_ROOT/scripts/build-update-xml.mjs --self-test"
    # NEW (Phase 44, UPD-26): every offered buildID strictly above every published buildID
    # for that appVersion, published set from Releases' release-manifest.json. Honestly
    # --quick for the self-test only: in-memory fixtures, no network, no gh. The live row
    # below is full-tier: read-only gh api (network, gh auth with repo scope).
    "descriptor-monotonic-self-test|node $REPO_ROOT/scripts/verify-descriptor-monotonic.mjs --self-test"
```
Full-tier additions inside `if [ "$QUICK" -eq 0 ]`:
```bash
      # NEW (Phase 44, UPD-14): the per-target descriptors equal a fresh emission from the
      # built tree. Full tier: reads objdir/ (application.ini, config.status) and the MARs;
      # FAILs naming the missing prerequisite when they are absent, never SKIP.
      "build-update-xml|node $REPO_ROOT/scripts/build-update-xml.mjs --check"
      # NEW (Phase 44, UPD-26): ... Full tier: read-only gh api against live Releases ...
      "descriptor-monotonic|node $REPO_ROOT/scripts/verify-descriptor-monotonic.mjs"
```
The dispatch accepts only `bash */*` or `node */*` (`verify-platform.sh:5134-5136`); both new commands comply.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| One key fills both updater slots (R12) | Two keys: primary + offline secondary, one DER per slot | Phase 44 (this phase) | Losing/rotating the primary no longer strands users |
| `.p12` backup optional ("owner's call", RELEASING.md:381) | Two offline `.p12` copies mandatory (SEC-05/SEC-09) | Phase 44 | Rotation is possible without the live store |
| No descriptor builder (`build-update-xml.mjs` absent) | CLI importing the hop gate's `buildUpdateXml`, per BUILD_TARGET, `detailsURL`, idempotent | Phase 44 | Ship path and proof gate share one emitter |
| Descriptors unchecked against history | `descriptor-monotonic`: offered buildID strictly above all published for the appVersion | Phase 44 | An older build can never be offered |
| "No rotation runbook" (RELEASING.md:770-771) | Runbook in rotation section (transition release → switch → retire) | Phase 44 | Rotation is a procedure, not a paragraph |
| `powerbrowser-updates` 404, zero Releases | Local descriptor work only; live reads degrade to named-count green | Phase 44 assumes; Phase 49 creates | No writes to a repo that does not exist |

**Deprecated/outdated:**
- `brand/mar-*.der` as a path: superseded by `powerbrowser/packaging/mar/mar-primary.der` (wave-E rename, `wave-e-PLAN.md:2249`); survives only as a FIX-11 deny fragment.
- One-key-fills-both-slots (R12) as rationale: retired by the secondary key; keep the R12 label in history, not in the rotation section.
- `docs/RELEASING.md:381` "Optional" `.p12`: superseded by the two-copy mandate.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Secondary ceremony mirrors the primary (`certutil -N/-S`, 4096-bit RSA, `SHA384`, `-v 240`) with a new directory + distinct nickname | Pattern 1 | If the owner prefers ECDSA or a different validity, the stanza values change but the DER→patch→ng065 mechanics do not |
| A2 | `detailsURL` = `[urls].release_notes` (the UPD-13 release-notes link) | Pattern 2 | If the owner wants a per-release notes URL with the tag interpolated, the CLI gains a `--details-url` default rule; the emitter shape is unchanged |
| A3 | `release-manifest.json` asset per Release is `{appVersion, buildID}` per BUILD_TARGET (+ asset names per DIST-07) | Pattern 3 | If Phase 49 adds fields, the row ignores unknown keys (projection, like `repo-controls`) — shape risk only |
| A4 | BuildIDs stay fixed-length `%Y%m%d%H%M%S` so lexicographic compare equals numeric | Pattern 3 | If the format changes, the row must parse to bigint; note the comparator choice in the commit |
| A5 | Secondary key signs nothing until rotation (primary stays the release signer through Phase 49) | Patterns 1, 4 | If the owner wants dual-signing from day one, SEC-07/DIST-07 gain a second `signmar -s` pass — record the decision in RELEASING.md |
| A6 | `powerbrowser-updates` creation + first descriptors land in Phase 49 (DIST-09), so Phase 44 writes no descriptors outside `objdir`-adjacent output / fixtures | All | If Phase 44 is asked to commit a placeholder descriptor, it goes under the same `<channel>/<BUILD_TARGET>/` path with the two-line no-update body (RELEASING.md:400-402 precedent) |
| A7 | `gh` with `repo` scope suffices for the monotonicity read (public Releases + manifest assets) | Pattern 3 | If asset download needs more, the row fails closed naming the scope (fail-closed precedent, `verify-repo-controls.mjs`) |
| A8 | The container-built `signmar` (Phase 45) accepts the same `-d/-n/-s/-v` surface | Pattern 1 | If it does not, SEC-07 owns the delta; ng065 keeps proving the dev-tree surface |

## Open Questions (ANSWERED where answerable without the owner)

1. **Which path does the plan use for the secondary DER?**
   - What we know: tree carries `powerbrowser/packaging/mar/mar-primary.der` only; `brand/mar-*.der` exists nowhere; FIX-11 denies both `powerbrowser/packaging/mar/**` and `brand/mar-*.der`; wave-E records the `brand/` → `powerbrowser/` rename. [VERIFIED this session]
   - Recommendation: `powerbrowser/packaging/mar/mar-secondary.der`. No `brand/` file. RESOLVED.
2. **Does the "signed by the secondary key only" plant need updater changes?**
   - What we know: `archivereader.cpp:85-96` already falls back from primary to secondary. [VERIFIED]
   - Recommendation: no C++ change; data-only patch + fifth ng065 case expecting `succeeded`. RESOLVED.
3. **What grounds `detailsURL`?**
   - What we know: updater parses the attribute with a pref fallback (`UpdateService.sys.mjs:2384-2385,2440-2448`); UPD-13 already derives `app.update.url.details` from `[urls].release_notes`. [VERIFIED]
   - Recommendation: `[urls].release_notes`, https-validated. RESOLVED (owner can override with `--details-url`).
4. **What published-buildID source can the row read today?**
   - What we know: zero Releases, no manifest, updates repo 404. [VERIFIED]
   - Recommendation: live `gh api` reads with empty-set green + named count; in-memory self-test carries all proof until Phase 49 writes the first manifest. RESOLVED as a design (not as live proof).
5. **Where does `--rollback-to` live?**
   - What we know: string absent tree-wide; requirement scopes it to an owner-dispatched override on the withdraw/descriptor path (REL-02/DIST-09, Phase E). [VERIFIED absent]
   - Recommendation: Phase 49/50 boundary; Phase 44 records the boundary and builds only the refusal. RESOLVED as a boundary.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| node | all rows | ✓ | v24.21.0 | — |
| git | regeneration | ✓ | 2.54.0 | — |
| `upstream/` at the pin with patches applied | AUTO-10 gate, ng065 code reads | ✓ (153.5.1 BUILD1 checkout, patch 030 applied) | — | `rebase-upstream.sh` re-materialises it |
| `objdir/` built tree | ng065, full `build-update-xml` | ✓ in this worktree (`dist/bin/{updater,signmar,certutil,application.ini}`, `dist/host/bin/mar`, `config.status`) | dev build | One tier-3 rebuild if stale |
| `objdir-release/` | release-variant proofs | ✗ in this worktree | — | Phase 45 container build |
| `.mozbuild/mar-hop/` evidence | `mar-update-hop` full row | ✗ (absent by design here) | — | N/N+1 rebuilds + hop drive per BUILD.md |
| Primary NSS store + password | ng065 | ✓ (`~/.config/powerbrowser-release/mar-key/{key4.db,password.txt}`) | — | Owner ceremony (already done) |
| Secondary NSS store | ng065 fifth case | ✗ (owner ceremony creates it) | — | Env-var SKIP/FAIL until the ceremony |
| `gh` + live Releases | `descriptor-monotonic` live row | `gh` ✓; Releases ✗ (zero) | — | Empty-set green + fixtures until Phase 49 |
| `powerbrowser-updates` repo | UPD-14/UPD-26 live paths | ✗ (404 per 41 baseline) | — | All descriptor work local; no writes |
| Network to github.com | live rows only | ✓ for research reads | — | Quick rows never need it |
| zizmor / js-yaml | — (Phase 41 rows, not this phase) | — | — | not needed now |

**Missing dependencies with no fallback:** secondary key material (owner ceremony — the phase's external gate).
**Missing dependencies with fallback:** `objdir-release/`, hop evidence, live Releases (all owned by later phases).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `scripts/verify-platform.sh` registry plus per-script `--self-test` (node built-ins, bash) |
| Config file | none (rows are the `CHECKS=(` array, `verify-platform.sh:3573`) |
| Quick run command | `scripts/verify-platform.sh --only <label>` |
| Full suite command | `scripts/verify-platform.sh --quick` (commit gate) then full `scripts/verify-platform.sh` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| SEC-05 | Two-DER patch 030 equals regeneration; secondary-only MAR accepted | quick (`patches-regenerated`) + full (`ng065`) | `--only patches-regenerated` / `--only patches-regenerated-self-test`; `--only ng065-mar-signature-enforced` (needs built tree + both key DBs) | ✅ (extend ng065) |
| UPD-14 | One descriptor per BUILD_TARGET with detailsURL, byte-identical on re-emission | quick self-test + full `--check` | `--only build-update-xml-self-test` / `--only build-update-xml` | ❌ Wave 2 |
| UPD-26 | Offered buildID strictly above all published for the appVersion | full row + quick in-memory self-test | `--only descriptor-monotonic-self-test` (quick) / `--only descriptor-monotonic` (full, needs `gh`) | ❌ Wave 3 |
| SEC-09 | Ceremony/rotation/secrets/map prose matches the tree | doc review + `releasing-maintenance` row (existing, widened if needed) | `--only releasing-maintenance` (Phase 41+; check its plant list covers DER basenames — it already plants "a DER basename removed" per RELEASING.md:852) | ✅ (edit prose) |

### Sampling Rate
- **Per task commit:** `scripts/verify-platform.sh --only <new label>` and its `-self-test`, then `node scripts/scan-brand-residue.mjs` after `git add`.
- **Per wave merge:** `scripts/verify-platform.sh --quick`.
- **Phase gate:** `--quick` green, plus `ng065` with both key DBs present and one `build-update-xml --check` against the built `objdir/`, before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `powerbrowser/packaging/mar/mar-secondary.der`: SEC-05 (owner hands bytes; executor tracks)
- [ ] `patches/030` regenerated secondary slot: SEC-05
- [ ] `scripts/verify-ng-065-mar-signature.mjs` fifth case: SEC-05
- [ ] `buildUpdateXml` + `detailsURL`: UPD-14 (shared emitter edit)
- [ ] `scripts/build-update-xml.mjs`: UPD-14
- [ ] `scripts/verify-descriptor-monotonic.mjs`: UPD-26
- [ ] `docs/RELEASING.md` five-place rewrite: SEC-09

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V2 Authentication | no | — |
| V3 Session Management | no | — |
| V4 Access Control | yes (CI + release jobs) | `contents: read` build job; `release`/`descriptor` environments gate sign + publish (GH-07, DIST-07/09) |
| V5 Input Validation | yes | Target-table validation (unknown BUILD_TARGET refused); `--channel` vs `MOZ_UPDATE_CHANNEL` cross-check; `detailsURL` https parse; schema-typed manifest reads |
| V6 Cryptography | **yes — the point of the phase** | 4096-bit RSA secondary, SHA384, `-v 240` (same shape as primary); two offline `.p12` copies; DERs public, keys never in repo; either-slot verify already in the updater |
| V10 Malicious code / supply chain | yes | Regeneration gate on patch 030; single emitter (no forked XML); monotonicity blocks downgrade-offer attacks |
| V14 Configuration | yes | One update URL source (UPD-12, unchanged); one channel (UPD-11, unchanged); `MOZ_BUILD_DATE` never pinned |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Primary key loss/compromise strands users | Availability | Secondary slot pre-deployed; rotation runbook (transition release → switch → retire) |
| Downgrade offered as an "update" (older buildID, same version) | Tampering / Elevation | `descriptor-monotonic` strict-greater rule; updater's `updateIsAtLeastAsOldAs` as backstop |
| Hand-edited patch 030 silently no-ops | Tampering | `patches-regenerated --check` byte equality; CR-01/WR-01 carve-outs |
| Descriptor hand-edit (hash, URL, version) | Spoofing / Tampering | Byte-compare against fresh emission from MAR bytes + manifest; `release-identity` version agreement |
| MAR channel confusion (`--channel` vs `--mar-channel-id`) | Spoofing | Emitter cross-check against `config.status` `MOZ_UPDATE_CHANNEL`; `failed: 22` troubleshooting recorded |
| Secret exfiltration via repo | Information disclosure | No `key4.db`/`password.txt`/`.p12` tracked; FIX-11 denies `powerbrowser/packaging/mar/**`; ceremony hygiene `ls -l` |
| Fixer bypasses the trust path | Tampering | FIX-02 (patch changes only via `regenerate-patches.sh`) + FIX-11 deny entries + `fix-gate-self-test` plants |

## Sources

### Primary (HIGH confidence)
- In-tree files read this session: `patches/030-powerbrowser-mar-certificates.patch` (34 lines); `scripts/regenerate-patches.sh` (355 lines, esp. `:46-90,120-147,185-338`); `scripts/verify-ng-065-mar-signature.mjs` (109 lines); `scripts/verify-mar-update-hop.mjs` (`:94-150` emitter, `:504-522` import guard); `scripts/verify-release-identity.mjs` (`:159` count precedent); `scripts/verify-update-channel.mjs` (332 lines, esp. `:150-153,217-220,259-330`); `scripts/verify-platform.sh` (`:3573,4646-4731` quick rows, `:4733,4847,5092` full rows, `:5134-5156` dispatch guard, `:4627-4633` planning-paths); `scripts/check-patch-surface.sh` (`:90-101,145-166`); `inventory/brand-tokens.json` (scope `binary_extensions`); `.gitattributes`; `configuration.toml` (`[urls]`, `[upstreams]`, `[product] revision`); `.mozconfig` (`:8-10` channel lines); `objdir/config.status` (`TARGET_XPCOM_ABI`, `OS_TARGET`, `MOZ_UPDATE_CHANNEL`, `MAR_CHANNEL_ID`); `objdir/dist/bin/application.ini` (Version/BuildID/`[AppUpdate]` URL); `powerbrowser/packaging/version/{version,release}.txt`; `docs/RELEASING.md` (`:50-63,197-198,364-392,531-545,760-771,827-852,920-947,1005-1007`); `docs/BUILD.md` (`:758-778` key custody); `.planning/workstreams/deploy/REQUIREMENTS.md` (`:132` FIX-11, `:144-147` SEC-05/UPD-14/UPD-26/SEC-07, `:218` SEC-09, phase table `:314-316`); `.planning/workstreams/deploy/ROADMAP.md` (`:177-186` Phase 44); `40-RESEARCH.md` (653 lines) + `40-PATTERNS.md` (112 lines); `41-RESEARCH.md` + `41-PATTERNS.md` (168 lines)
- Upstream read this session: `toolkit/mozapps/update/updater/moz.build` (applied `:61-70` + `HEAD` pre-image); `updater/archivereader.cpp:85-96` (either-slot fallback); `updater/gen_cert_header.py`; `toolkit/modules/UpdateUtils.sys.mjs:76-112,1052-1070` (placeholder map + ABI); `toolkit/mozapps/update/UpdateService.sys.mjs:2307,2384-2385,2440-2448,2544` (detailsURL), `:5455-5510` (getUpdateURL), `common/updatererrors.h` + `xre/nsUpdateDriver.cpp` (via ng065); `update/InAppUpdateProcess.rst:54` (eleven-segment path)
- Executions/absences verified this session: `ls` of `patches/ powerbrowser/packaging/mar/ brand/ scripts/ objdir/ objdir/dist/bin/ .mozbuild/ ~/.config/powerbrowser-release/mar-key/ .github/`; `git ls-files -s` (one DER, blob `356daa8`); `git check-attr` (`text: auto, eol: lf`); `git tag -l` (`v1.0`-`v1.4` only); absence greps for `release-manifest.json`, `build-update-xml`, `descriptor-monotonic`, `--rollback-to`, `MOZ_BUILD_DATE` (all empty); `ls scripts/build-update-xml.mjs` + `ls .mozbuild/mar-hop/` (both absent)

### Secondary (MEDIUM confidence)
- Mozilla build semantics for `MOZ_BUILD_DATE` / buildID defaulting (standard behaviour, not re-read this phase; 40-RESEARCH did not need it either)
- `gh api` Releases + asset download surface (shape per 41-RESEARCH REST baseline; endpoint paths standard)

### Tertiary (LOW confidence)
- Phase 45 container `signmar` CLI parity; Phase 49 `release-manifest.json` exact field set beyond `{appVersion, buildID}` per target

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH. No new packages; all tools probed (`node`, `git`, built NSS tools, `gh`).
- Architecture: HIGH for patch/DER/ng065/emitter/registry mechanics (every integration point read); MEDIUM for the ceremony stanza (extrapolated from the recorded primary); LOW for DIST-07/DIST-09/REL-02 touchpoints (no code exists).
- Pitfalls: HIGH for 1-6 and 8 (observed or read); MEDIUM for 7 (`MOZ_BUILD_DATE` defaulting not re-probed this session).

**Research date:** 2026-10-22
**Valid until:** 2026-11-10 (ESR 153.7 ships; the pin moves but the trust-path mechanics do not)

---

## Appendix: prior verify commands the planner should reuse (proven in 40/41 PLAN frontmatter)

1. `test "$(git -C upstream rev-parse HEAD)" = 6cd88e7d45fe7a5b0b87b984fb32a8779151860e && scripts/verify-platform.sh --only verify-upstream-pins && scripts/verify-platform.sh --quick` — the 40-01 plan `<verify>` block: pin proof + row proof + gate proof in one line. Copy the shape for Phase 44 (`--only patches-regenerated`, `--only build-update-xml-self-test`, `--only descriptor-monotonic-self-test`, then `--quick`).
2. Per-task-commit loop from every 40 plan (`40-01-PLAN.md:81`): `scripts/verify-platform.sh --only <label>` + `--only <label>-self-test`, then `node scripts/scan-brand-residue.mjs` **after `git add`** (the scan iterates `git ls-files`; an unstaged DER is invisible to it).
3. 41-01 plan convention (`41-01-PLAN.md:124-167`): new scripts import the shape from `verify-update-channel.mjs` (header list, strict arg guard, injectable `runChecks`, green-baseline-first self-test) and new `gh` reads copy `verify-repo-controls.mjs` (`execFileSync('gh', ...)` + fail-closed helper + pinned API version). Do not invent a third shape.
