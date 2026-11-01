# Phase 54: Windows (H) - Research

**Researched:** 2026-10-23
**Domain:** Windows cross-build (Gecko NSIS + MAR on legion), per-target Theia sidecar packaging, AsyncShutdown sidecar-reap blocker, Windows background-update task, libvirt Windows 11 matrix, Authenticode via jsign + Azure Artifact Signing, NSIS trademark surface
**Confidence:** HIGH for tree mechanics (every claim below marked [VERIFIED] was read or run this session); MEDIUM for the cross-toolchain and signing paths (documented and present in the source tree, but no build was run — same standing as STACK.md's cross rows)

## Summary

Windows is a cross-compile phase, not a new-host phase. Gecko cross-builds on legion in the release container (`--target=x86_64-pc-windows-msvc --enable-bootstrap`, the exact two-line mozconfig at `upstream/docs/contributing/build/working_with_esr_115.md:62-86` [VERIFIED: read this session]); the Theia sidecar must be built per target OS on a `windows-latest` hosted runner (PITFALLS 6, confirmed in-tree: `package-linux.sh:60` hard-codes `prebuilds/linux-x64.node` and `node-runtime.json` carries only `linux-x64` [VERIFIED]). Assembling a Windows Gecko with a Linux sidecar is the failure this phase exists to prevent, and it shows up only at first launch on the target OS — after signing and publishing.

The work splits into five builds-plus-gates:

1. **Generator + mozconfig (PKG-11).** `emitMozconfig` in `scripts/generate.mjs:1464` today emits one 13-line Linux mozconfig with no maintenance-service line [VERIFIED]. It gains a per-target Windows emission carrying `--disable-maintenance-service`, derived from the manifest, byte-identity gated through the existing `TARGETS` table (`.mozconfig` → `.mozconfig` row [VERIFIED]). No hand-written mozconfig.
2. **NSIS patch by regeneration (PKG-12, LEG-01).** `patches/040-powerbrowser-nsis.patch` today touches exactly two files (`defines.nsi.in`, `installer.nsi`) and three behaviours (AppName from `@MOZ_APP_NAME@`, CERTIFICATE_NAME from `${CompanyName}`, telemetry URL blanked, install ping neutered) [VERIFIED: read whole patch, 43 lines]. It does **not** cover the uninstaller ping (`uninstaller.nsi:373,1141` still formats and sends `${TELEMETRY_BASE_URL}/…` [VERIFIED]), the `Software\Mozilla\…` registry namespace (`defines.nsi.in:77`, `uninstaller.nsi:462,483-484,536,638-641,1068` [VERIFIED]), `CERTIFICATE_ISSUER` (still upstream DigiCert [VERIFIED]), or artwork. PKG-12 extends it by regeneration only; LEG-01 extends `verify-trademark-surface.mjs` (today: brand.ftl/properties, Theia fragments, desktop Name lines, 5-plant self-test [VERIFIED: read full script]) to the NSIS surface, application.ini Name/Vendor, Info.plist, and `MOZ_LAUNCHER_SUBKEY`, one plant per surface.
3. **Sidecar per target (PKG-13).** `windows-latest` builds the Theia app; `node-runtime.json` gains a `win32-x64` entry (name TBD — see Open Question 2) verified by SHASUMS in the Node detector; `package-target-natives` (PKG-23 shape, prescribed by PITFALLS 6 but the script does not exist yet [VERIFIED: no `*natives*` or `*package-target*` in `scripts/`]) asserts PE32+ on every `.node`/`rg`/`node` in the Windows package. Node download bytes for `win32-x64` were already retrieved live once (19001308 bytes, sha256 `b7c12c0e…`, recorded in `docs/BUILD.md:339-343` [VERIFIED]).
4. **Updater + background task (UPD-30, UPD-31).** The hardest technical answer of this phase. `UpdateService.sys.mjs:5006`'s only AsyncShutdown blocker writes `updates.xml` via DeferredTask — there is **no** sidecar-reap blocker anywhere [VERIFIED: read surrounding code; `TheiaService.stop()` is fire-and-forget `void killProcess` with a 3 s grace on `quit-application-granted`]. And `updater.cpp`'s `rename_file` fails on locked files, shunting in-use files to a `tobedeleted` dir deleted on reboot, while the callback-app exclusive-open path fails the update outright (`BACKGROUND_TASK_SHARING_VIOLATION`) when run silent [VERIFIED: read `updater.cpp:4495-4570,3808-3830`]. So a live `node.exe` at rename time is a real, load-bearing race — the fix is a new AsyncShutdown blocker that awaits the sidecar reap on the quit/restart path, and the proof is a matrix row that updates with the sidecar running. The background-task path (`BackgroundUpdate.sys.mjs`, `TASK_DEF_CURRENT_VERSION = 4`, Task Scheduler registration from the default profile [VERIFIED: read `_registerBackgroundUpdateTask` and the `REASON` table]) is verified live in the matrix, or deferred with the reason recorded (CONTEXT permits the deferral).
5. **Signing in two steps (SEC-03 then SEC-12, DIST-10).** Ship unsigned first with the verbatim SmartScreen warning; then hosted `sign-publish` runs jsign on inner PE files → `mach repackage installer` → jsign on `setup.exe` → MAR → `signmar`, per `upstream/taskcluster/kinds/repackage/kind.yml` (build-signing → repackage → mar-signing chain [VERIFIED: read kind.yml repackage section]). `osslsigncode` cannot do this job (needs a local key; Artifact Signing never releases one).

All three research flags are answered as far as they can be without the matrix (§Research Flags). The MTX-01 design is fully specified from the stale-but-precise `docs/RELEASING.md` + `docs/BUILD.md` capability records, with every stale line named in §State of the Art so plans reconcile rather than silently rename.

**Primary recommendation:** mirror the Linux staging pattern exactly — `powerbrowser/packaging/package-windows.sh` beside `package-linux.sh`, per-target generator emissions through the existing `TARGETS` table, one registry row per new behaviour with a `--self-test` that plants each fault. Keep every owner-side action (Azure account, `/etc/nixos` libvirt access, VM licence, any `release.yml` dispatch) behind one `checkpoint:human-action`; plans build everything else locally.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Gecko cross-build (setup.exe + complete MAR) | legion release container, `build-windows` job (`release.yml`, Phase 50 shape) | — | Only legion holds the bootstrap toolchain cache; `contents: read`, no secrets, no environment (GH-12 shape, assumed from Phase 41 `workflows` row) |
| Windows mozconfig | Generator (`scripts/generate.mjs`, new per-target emission) | Tracked `.mozconfig`-per-target comparand via `TARGETS` | PKG-11: no hand-written mozconfig; byte-identity proves generator-only writer |
| NSIS branding | Regenerated patch (`patches/040-…`, extended) | `installer-build-proof` + `ng066` rows (exist, widen) | Patches are regenerated, never text-edited — a hand edit degrades to a silent no-op |
| Windows sidecar | `windows-latest` hosted runner (`yarn install --frozen-lockfile && yarn build`) | Artifact handed to legion/sign job for assembly | PITFALLS 6: node-gyp natives are host-built; legion can never produce win32 `.node` files |
| Node per target | `node-runtime.json` + Node detector (Phase 43 shape) with in-job SHASUMS + signature check | — | Owner decision 14: detector verifies SHASUMS in-job; Windows wires into it |
| Sidecar reap before rename | New AsyncShutdown blocker in `powerbrowser/shell/` (awaited reap on quit/restart path) | `INTERNAL-APIS.md` catalogue + `check-internals-boundary.sh` | Every Firefox internal touchpoint goes through the one anti-corruption layer |
| Background task | Upstream `BackgroundUpdate` (unchanged); verified, not reimplemented | Deferral with recorded reason if unverifiable | No Gecko modification outside the patch stack |
| Install/launch/update/uninstall proof | `pkg-win11` libvirt guest, five-cell matrix, `win-matrix-record` row | `clean-baseline` snapshot revert per cell | Matrix is the only place a live `node.exe` meets the updater rename |
| Signing | Hosted `sign-publish` per-OS sign job (jsign + Azure OIDC, then signmar) | `release` environment, owner approval | No signing material on legion; token minted immediately before use |
| Descriptors | Per-target `update.xml` per BUILD_TARGET (Phase 44 `build-update-xml.mjs` shape assumed) | `descriptor-monotonic` + `channel-live` extended per target | One complete MAR per target; DIST-10 adds the Windows pair |
| Unsigned-first copy | Verbatim SEC-03 block in matrix record → tracked doc → live /download, `win-download-copy` row | — | A paraphrase is what the gate exists to catch |

## User Constraints (from CONTEXT.md)

<user_constraints>
### Locked Decisions
#### Already decided (owner, 2026-10-20)
- All owner decisions in REQUIREMENTS.md "Owner Decisions" are binding (SEED-002 §12 recommended defaults plus the research additions).
- Decision 10 (signing timing): Apple enrolment after site live + D-U-N-S; Azure account only when the Windows phase is 3 to 4 weeks out (billed from creation, ~USD 10/month Basic). Decision 9: keep `--disable-crashreporter` through the first Windows release.
- Decision 2: legion on the public repo, non-ephemeral, registered once with a registration token; no PAT or App key on legion; fork approval for all external contributors; `release.yml` never on `pull_request`. Decision 3: `sign-publish` creates the tag and publishes with the App token after approval. Decision 11: Actions artifacts between legion build and hosted sign job; legion keeps `contents: read`.
- Decision 5: one release per ESR point release plus out-of-band revision bumps. Decision 13: no `release.json`, no version facts on home page (per-target descriptors live under the updates host, Phase 47/49).

#### Owner gates in this phase (stop points for autonomous execution)
- Creating the Azure Artifact Signing account + identity validation (1–20 business days), any legion `/etc/nixos` change (runner libvirt access for the runner user, finished with `nrs` under `pkexec`), the Windows VM licence and its update handling, and any live dispatch/approval of `release.yml` or the `release`/`descriptor` environments are owner actions. Plans build everything locally — generator changes, NSIS patch by regeneration, `package-target-natives` and trademark rows plus self-tests, matrix harness and docs — and end with one `checkpoint:human-action` listing the exact owner commands; they do not create accounts, touch legion, or dispatch workflows.
- Read-only `gh api` GETs against the live org/repo are allowed for research and for read-back rows. No `gh api` PUT/POST/PATCH/DELETE, no `gh workflow run`, no repo/App creation from an agent shell.

### Claude's Discretion
All other implementation choices are at Claude's discretion — discuss phase was skipped per user setting. Use the ROADMAP phase goal, success criteria, and codebase conventions to guide decisions.

### Assumptions about unfinished dependencies (recorded per workstream rule)
- Phase 50 (release pipeline and train) is still pending. Plans assume its contracts as written: `release.yml` exists with a legion build job + hosted sign/publish shape, per-target descriptors under the Phase 47 updates host, and per-release approval gates. Plans add the Windows `build-windows` and per-OS sign jobs and per-target Windows descriptors as extensions of that shape; they do not redesign Phase 49/50.
- Phase 45 (portable Linux release build) is still pending. Plans assume the container bootstrap toolchain (`--enable-bootstrap` in a Debian bookworm container on legion, jessie sysroot) and the `package-linux.sh` staging pattern as written, and extend them to the Windows cross target. If Phase 45 lands a different container shape, the Windows job follows it.
- Phase 43 (Node detector with per-target entries + SHASUMS verification) and Phase 44 (per-target descriptor builder `build-update-xml.mjs`, `descriptor-monotonic` row) are still pending. Plans assume `powerbrowser/packaging/node-runtime.json` gains a per-target Windows entry verified by SHASUMS in the detector, and that the descriptor builder emits one descriptor per BUILD_TARGET idempotently; Windows wires into both rather than inventing parallel mechanisms.
- Phase 41 (repo controls, Apps, `workflows` row) is in progress. Plans assume the `workflows` row assertions hold for any new `release.yml` jobs (no `schedule:`, legion label only in `release.yml` build-*/matrix-* jobs with no `secrets.`/`environment:`, SHA-pinned admitted `uses:`, no event text in `run:`/`prompt:`) and the fixer deny-list shape (FIX-11) for `patches/**`.
- Phase 47 (/download, updates host) is still pending. Plans carry the exact SEC-03 warning copy into `docs/RELEASING.md` and the /download source so Phase 47 renders it verbatim, and record the signed/unsigned status flip as a content change, not a second page.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PKG-10 | Gecko for Windows cross-built on legion in the release container with `--enable-bootstrap` in a `release.yml` `build-windows` job; `mach repackage installer` produces NSIS `setup.exe` + complete MAR | §Pattern 1 (two-line mozconfig, WINSYSROOT, repackage chain); §Code Examples (mozconfig emission); Validation `windows-mozconfig`, `build-windows-shape` (static half) |
| PKG-11 | Generator emits a per-target Windows mozconfig with `--disable-maintenance-service` | §Pattern 1; emitMozconfig extension through `TARGETS`; Validation `windows-mozconfig` quick row + self-test |
| PKG-12 | Regenerated hook-only NSIS patch replaces Mozilla literals, removes install + uninstall pings, moves registry namespace, carries PowerBrowser artwork | §Pattern 2 (040 extension surface); Validation `installer-schema` + `installer-build-proof` widened, `ng066` extended |
| PKG-13 | Windows Theia sidecar built on `windows-latest`; `node-runtime.json` per-target Windows entry verified by SHASUMS in the Node detector; `package-target-natives` passes on the Windows package | §Pattern 3 (PITFALLS 6 wiring); Validation `node-runtime-targets` quick row, `package-target-natives` full row |
| LEG-01 | `verify-trademark-surface.mjs` extends to NSIS surface (`defines.nsi.in`, uninstaller), application.ini Name/Vendor, Info.plist, `MOZ_LAUNCHER_SUBKEY`; self-test plants a Mozilla mark in each; Windows no-residue registry diff in matrix | §Pattern 2 + §Code Examples (surface table); Validation `trademark-nsis` quick row, `win-matrix-record` no-residue cell |
| MTX-01 | Automated Windows 11 libvirt VM matrix on legion from a `release.yml` `matrix-*` job: installs, launches, updates, uninstalls; covers runner-user libvirt access, snapshot revert, guest transport, Windows-side script, VM licence + update handling | §Pattern 4 (pkg-win11 design); Validation `win-matrix-record` full row |
| UPD-30 | On Windows, quitting for an update waits on an AsyncShutdown blocker until the sidecar is reaped, so the updater rename never meets a live `node.exe`; matrix row proves the update applies | §Research Flag 1 (updater rename mechanics + blocker placement); Validation `win-matrix-record` update cell + static `sidecar-reap-blocker` row |
| UPD-31 | Windows background update task path verified live in the matrix, or deferred with the reason recorded | §Research Flag 2 (task mechanics + what "verified" means); Validation matrix cell or recorded deferral |
| SEC-03 | First Windows release ships unsigned with maintenance service disabled; /download states the verbatim warning | §Doc edits (verbatim block); Validation `win-download-copy` row |
| SEC-12 | Windows Authenticode through Azure Artifact Signing Basic with jsign on Linux: inner PE files, then installer, then MAR; /download updates signing status | §Pattern 5 (jsign chain); Validation `sign-chain-windows` full row + `releasing-maintenance` deferral flip |
| DIST-10 | `release.yml` gains a per-OS sign job and per-target descriptors for the Windows BUILD_TARGET | §Pattern 5; Validation `build-update-xml` Windows target + `channel-live` per-target extension (Phase 44/49 shapes) |

## Project Constraints (from CLAUDE.md)

- **One driver, one registry.** Every new check is one row appended to `scripts/verify-platform.sh` CHECKS (quick rows before the `if [ "$QUICK" -eq 0 ]` boundary at :4733 [VERIFIED: read]; full rows inside). No sibling driver. New row = one row + `--self-test`.
- **Self-test.** Every new check carries `--self-test` that plants each named fault and must go red naming the drift (green control first).
- **Derive and compare.** Derive the expectation from the tree at check time and compare as set equality — red on addition *and* removal. Never hand-keep an expectation list (e.g. the Windows BUILD_TARGET strings are read off `config.status`/built `application.ini`, not copied into the script).
- **Absence-of-log assertions.** Never assert on the absence of a log line unless that line is proven emitted by the code under test. (Bears directly on UPD-30: assert the version *changed* and the sidecar *process is gone*, not that a log line is missing.)
- **Quick tier.** `--quick` rows run with no build, no browser, no display, no network. Matrix, signing, and live-page rows are full-tier; their *self-tests* are hermetic/quick.
- **Residual-brand scan.** `node scripts/scan-brand-residue.mjs` must stay exit 0. It iterates `git ls-files` — **stage new files before trusting a green scan**. The originating product's name may appear only in `inventory/brand-tokens.json`.
- **Patches are regenerated, never text-edited.** Regenerate from a patched tree; `scripts/regenerate-patches.sh --check` + `patches-regenerated` stay green. A hand edit degrades to a silent no-op.
- **Rebrand inputs.** `configuration.toml` + `brand/` are the only rebrand inputs; no second-copy literals (repo slug derives from `[urls].release_notes`, channel from `UPDATE_CHANNEL`).
- **Theia core / upstream.** Never fork or patch Theia core; never hand-edit `upstream/`. UPD-30/UPD-31 touch upstream update behaviour only through the shell boundary + patch stack.
- **User-facing copy.** No internal identifier in user-facing text (SEC-03 warning names "PowerBrowser", states the problem, ends with the next step: "choose More info and Run anyway"). Diagnostics layer carries identifiers instead.
- **Builds inside Nix dev shells** (`nix develop .#firefox` / `.#theia`). Note: the anticipated `.#firefox-win64` shell from `docs/RELEASING.md` does **not** exist in `flake.nix` today (only `theia` + `firefox` [VERIFIED: read]) — see §State of the Art reconciliation.
- **Plan gate.** `python3 scripts/plan-gate.py --root . --phase 54 --plans <dir> --stream deploy` (currently 0/0 — no deploy-stream rows exist yet in the main ledger). Every plan carries `requirements: [PKG-10, …]` frontmatter citing each Phase 54 ID (convention [VERIFIED: `41-01-PLAN.md:22`]) so deploy REQUIREMENTS.md coverage holds.

## Standard Stack

### Core
| Tool | Version | Purpose | Why Standard |
|------|---------|---------|--------------|
| Mozilla bootstrap toolchain (`--enable-bootstrap`, Debian bookworm container on legion) | Pinned by the ESR tree itself (`build/moz.configure/bootstrap.configure`); jessie sysroot glibc 2.19 | Portable Linux build + Windows/macOS cross builds | STACK.md: replaces Nix-shell release builds and the nixpkgs cctools idea; Mozilla ships Firefox with the same toolchains. Assumed per CONTEXT (Phase 45 shape) |
| Windows cross target | `--target=x86_64-pc-windows-msvc` + `--enable-bootstrap` (+ `msitools` for `msiextract`) | legion cross-compile, no Windows host needed | Exact two-line mozconfig at `upstream/docs/contributing/build/working_with_esr_115.md:62-86` [VERIFIED: read]. `win64-vs2026` is `local-toolchain: true`; bootstrap runs `get_vs.py` to fetch the VS/Windows SDK sysroot from Microsoft (`bootstrap.configure:188-250` per STACK) |
| `mach repackage installer` + `mach repackage mar` | In-tree (`upstream/python/mozbuild/mozbuild/repackaging/installer.py`, `mar.py`) [VERIFIED: both exist] | setup.exe + complete MAR from the cross-built stage | Mozilla's own chain: `upstream/taskcluster/kinds/repackage/kind.yml` (`repackage/base.py` + `win64_signed.py`, package-formats `win64: [mar, installer]`) [VERIFIED: read] |
| makensis | 3.12 via `nix shell nixpkgs#nsis` | NSIS compile on Linux | `docs/BUILD.md:974,1009-1011`: NSIS plugins execute on the install target, never in makensis, so Linux compile is sound; `installer-build-proof` PASS in 3.4 s on legion |
| jsign | 7.6 upstream (nixpkgs 7.5) — version per STACK, **not** re-verified this session (nix eval blocked by read-only sandbox) | Authenticode signing on Linux; Azure Artifact Signing support (added in 7.0) | Runs on Linux, signs NSIS-generated executables. `osslsigncode` 2.14 is rejected: it needs a local key, which Artifact Signing never releases |
| Azure Artifact Signing, Basic | ~USD 10/month, 5,000 signatures; Public Trust open to US orgs; free/trial/sponsored subscriptions refused; validation 1–20 business days; billed from creation | Windows Public Trust signing | STACK/FEATURES (MEDIUM). Authenticate with `azure/login` v3.1.0 over OIDC, no stored secret |
| signmar (container-built) | Built by the same container build (`upstream/modules/libmar/tool/moz.build:22-34`), runs on `ubuntu-latest` with `LD_LIBRARY_PATH=dist/bin` | MAR signing/verifying in the hosted sign job | Removes Nix from the sign job; `pk12util` from Ubuntu `libnss3-tools` (STACK) |
| `windows-latest` hosted runner | GitHub-hosted | Windows Theia sidecar build (`yarn install --frozen-lockfile && yarn build`) | PITFALLS 6: node-gyp natives are host-built; this is the only conforming source of win32 `.node` files |
| nodejs.org dist + SHASUMS256.txt | Node 24 line (tree pins v24.19.0 for linux-x64 [VERIFIED]) | Per-target Node runtime (`win32-x64` entry added) | Owner decision 14: in-job SHASUMS + signature verification in the detector |
| libvirt + QEMU guest agent, `pkg-win11` | New domain, new disk, qcow2 nvram, NAT network, `clean-baseline` snapshot | MTX-01 matrix on legion from a `matrix-*` job | Design in `docs/RELEASING.md:209-210,436-449` (see §State of the Art); guest is a test target, never a build host |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `--enable-bootstrap` cross toolchain | nixpkgs cctools/apple-sdk style cross, or patchelf after build | Rejected (STACK): unproven for Gecko; patchelf fails on libxul GLIBC requirements |
| jsign + Azure | osslsigncode with OV/EV cert on a hardware token | Only if the foundation buys a token cert instead; osslsigncode cannot use Artifact Signing (no local key) |
| `windows-latest` sidecar build | Cross-built sidecar on legion | Never: produces ELF `.node` files in a PE package (PITFALLS 6) |
| New `pkg-win11` domain | Reuse the pre-existing shut-off `win11` domain | Rejected: RELEASING.md is explicit — leave `win11` and its stub disk alone; the stub is a 200704-byte fresh-image with no OS |
| WINSYSROOT inside the repo | Cache outside the repository (RELEASING: "written outside the repository") | A toolchain cache in the repo would pollute `git ls-files` scope for every scan row |

**Installation:** container image + `get_vs.py` one-time WINSYSROOT population (owner-privileged, runs from `upstream/`, cached outside the repo); `windows-latest` needs no installation; jsign jar 7.6 + `libnss3-tools` + `openjdk-21-jre-headless` apt-installed in the sign job; Azure OIDC via `azure/login`.

## Package Legitimacy Audit

No new npm/PyPI/crates package is installed by the *research*; the phase installs toolchain pieces at build time. Verdicts:

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| jsign 7.6 | GitHub release asset (checksum-verified in job) | long-lived | — | github.com/ebourg/jsign | not run through the seam (release asset, not npm) | Approved pattern per STACK: checksum-verified in-job, same as rcodesign 0.29.0 handling |
| `azure/login` v3.1.0 | GitHub Action (SHA-pinned, admitted in `actions-selected.json`) | long-lived | — | github.com/Azure/login | OIDC, no stored secret | Admit `Azure/login@<sha>`; the `workflows` row enforces SHA + admission |
| win32-x64 Node tarball | nodejs.org dist, SHASUMS + release-key signature verified in-job | official release | — | nodejs.org | official bytes, hash-pinned | Pin sha256 in `node-runtime.json`; detector verifies per decision 14 |
| win32-x64 vsix bytes | Open VSX file URLs (already retrieved live once: 19001308 bytes, sha256 `b7c12c0e…`, `docs/BUILD.md:339-343`) | — | — | open-vsx.org | already-trusted pattern (NG-071 `download:plugins`) | Target-qualified pins resolved on the `windows-latest` runner via the same pin gate |
| Windows 11 install media | Local ISO (`win11-install.iso`, 8471603200 bytes, verified listable `CCCOMA_X64FRE_EN-US_DV9` + `virtio-win.iso`, `docs/BUILD.md:1012`) | — | — | Microsoft | media present | Owner-provisioned guest install; licence is an owner action |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
  configuration.toml ([installer], per-target mozconfig inputs)
        │  generator = only writer (TARGETS table)
        ▼
  ┌─ emitMozconfig(windows) ──► per-target Windows mozconfig ──► legion container
  │     --disable-maintenance-service                              --enable-bootstrap
  │     --target=x86_64-pc-windows-msvc                            get_vs.py → WINSYSROOT (outside repo)
  │                                                                │
  ├─ 040 NSIS patch (regenerated) ──► patched installer.nsi ──────┤
  │     AppName/CERT_NAME/pings/registry/artwork                   │ ./mach package
  ├─ windows-latest runner ──► sidecar lib/ + win32 natives ───────┤
  │     yarn build; upload artifact                                 │ ./mach repackage installer ──► setup.exe
  ├─ node-runtime.json[win32-x64] ──► staged node/ ────────────────┤ (unsigned first)
  │                                                                │ ./mach repackage mar ──► complete MAR
  └─ sign job (ubuntu-latest, env release): jsign inner → repackage → jsign setup → MAR → signmar
                                                                   │
  pkg-win11 (libvirt, clean-baseline snapshot) ◄── matrix-* job ───┘
   install → launch → update (sidecar reaped) → uninstall → registry diff
        │                                                  │
        ▼                                                  ▼
  win-matrix-record (full)                     win-download-copy (SEC-03 ↔ live page)
  descriptor per WINNT BUILD_TARGET ──► powerbrowser-updates ──► channel-live
```

### Recommended Project Structure
```
powerbrowser/packaging/
├── package-linux.sh          # unchanged staging pattern (the mirror source)
├── package-windows.sh        # NEW: mirrors package-linux.sh per target —
│                             #   ./mach package → stage windows-latest sidecar
│                             #   + win32-x64 Node + policies.json → refresh
│                             #   precomplete → rewrite installer inputs + MAR
├── node-runtime.json         # gains per-target Windows entry (name: Open Q2)
└── mar/                      # unchanged (fork MAR certs, patch 030)
patches/
├── 040-powerbrowser-nsis.patch   # EXTENDED by regeneration (never text edit)
└── ... (numbering: reconcile 050 vs 040, §State of the Art)
scripts/
├── verify-windows-mozconfig.mjs   # NEW quick: per-target mozconfig derived, --disable-maintenance-service present
├── verify-package-natives.mjs     # NEW full (PKG-23 shape): .node/rg/node match package target (PE32+ for Windows)
├── verify-node-runtime-targets.mjs# NEW quick (or fold into detector): node-runtime.json keys == expected target set
├── verify-trademark-surface.mjs   # EXTENDED (LEG-01): +NSIS/app.ini/Info.plist/MOZ_LAUNCHER_SUBKEY surfaces + plants
├── verify-installer-build-proof.mjs # WIDENED: fork defines, no Mozilla telemetry/survey host, still compiles
├── verify-ng-066-nsis-branding.mjs  # EXTENDED: CERT_NAME/issuer, uninstall ping dead, registry namespace
├── verify-win-matrix-record.mjs   # NEW full: five cells, verdicts + verbatim evidence, BUILD_TARGET parses,
│                                  #   registry diff names fork root, Software\Mozilla untouched, update applied
├── verify-win-download-copy.mjs   # NEW full: SEC-03 block identical across record/track-doc/live page
├── verify-win-sign-chain.mjs      # NEW full: jsign inner → repackage → jsign setup → MAR → signmar order evidence
└── verify-platform.sh             # one registry row per new check + self-test row
docs/
├── RELEASING.md                   # windows-unsigned stage executed; stale lines corrected (see §Doc edits)
└── WINDOWS-DISTRIBUTION.md        # NEW tracked doc (RELEASING vocabulary): verbatim SmartScreen block + matrix record pointer
```

### Pattern 1: Cross-build the Gecko, never the sidecar — and say which is which
**What:** legion builds Windows Gecko (`build-windows` job, two-line mozconfig, WINSYSROOT populated once via `get_vs.py` from `upstream/`, cache outside the repo). The sidecar is built on `windows-latest` and handed over as an artifact. `package-windows.sh` stages — it never compiles natives.
**Why:** PITFALLS 6, confirmed this session: `theia/…/lib/backend/native/*.node` + `lib/prebuilds/linux-x64/pty.node` are host-built; `yarn` installs only the host OS's optional packages (`@parcel/watcher-*`, `@msgpackr-extract/*`); `package-linux.sh:60` hard-codes the linux prebuild. A Windows package assembled from legion's `theia/` tree fails at first launch — after signing and publishing.
**Rows that prove it:** `package-target-natives` on the Windows package (plants a Linux `.node` into a Windows staging copy, must go red naming the file); `node-runtime-targets` (keys of `node-runtime.json` equal the expected target set — a Windows entry missing goes red before any build is spent).

### Pattern 2: Extend 040 by regeneration; kill both pings; move the registry root
**What:** PKG-12 adds, at minimum: (a) uninstall-ping removal in `uninstaller.nsi` (today live at :373/:1141 [VERIFIED] — patch 040 only neuters `installer.nsi`'s `SendPingIfApplicable`); (b) registry namespace move off `Software\Mozilla\` (today `MOZ_LAUNCHER_SUBKEY` = `Software\Mozilla\${AppName}\Launcher` plus six `Software\Mozilla\${AppName}` read/delete sites [VERIFIED]) to the fork root, so `win-matrix-record`'s "leaves `Software\Mozilla` untouched" assertion can pass; (c) fork installer artwork (today's compile still embeds `upstream/browser/branding/unofficial/` stand-ins, honestly labelled in `verify-installer-build-proof.mjs:33-41` [VERIFIED]); (d) `CERTIFICATE_ISSUER` stays upstream's until SEC-12 (deferred with the signing row, as `docs/BUILD.md:994` already records [VERIFIED]).
**Why:** LEG-01 + matrix no-residue need all four; the `040` surface is hook-only today, and every addition rides the same regeneration command (`regenerate-patches.sh --check` stays green).
**LEG-01 surface table** (each surface derived at check time, each with a self-test plant):

| Surface | Mozilla mark today [VERIFIED] | Fork expectation |
|---|---|---|
| `defines.nsi.in` | AppName ✓ forked; CERT_NAME ✓ forked; `MOZ_LAUNCHER_SUBKEY` under `Software\Mozilla\` | Namespace under fork root |
| `uninstaller.nsi` | `Software\Mozilla\${AppName}` ×6 (incl. TaskBarIDs, Run key `Mozilla-${AppName}-…`), uninstall ping URL | Fork namespace; no ping |
| `application.ini` (`build/application.ini.in`) | `Vendor=@MOZ_APP_VENDOR@`, `Name=@MOZ_APP_BASENAME@` — tokens, resolved at build | Resolved values carry no Mozilla token |
| `Info.plist.in` | `firefox.icns`, `org.mozilla.updater` (SMPrivilegedExecutables), `MozillaDeveloper{Repo,Obj}Path` | Fork identifiers (macOS-joined row in Phase 55; LEG-01 covers the scan + plants) |
| `MOZ_LAUNCHER_SUBKEY` | `Software\Mozilla\…\Launcher` | Fork-rooted subkey |

### Pattern 3: Per-target Node + descriptors ride the pending Phase 43/44 shapes
**What:** `node-runtime.json` gains the Windows entry; the Phase 43 detector verifies its SHASUMS in-job; the Phase 44 `build-update-xml.mjs` (today only `buildUpdateXml` inside `verify-mar-update-hop.mjs:114-135` — byte-identical idempotent emission, `detailsURL` TBD [VERIFIED]) emits one descriptor per BUILD_TARGET; DIST-10 adds the Windows BUILD_TARGET pair (`WINNT_x86_64-msvc`-family strings are read off the built `application.ini`/`config.status` at check time — cf. `bootstrap.configure:85-86` mapping `WINNT → win64` [VERIFIED]).
**Why:** CONTEXT forbids parallel mechanisms. Windows wires into the detector and descriptor builder; it does not invent its own.

### Pattern 4: pkg-win11 is a new domain, a test target, and a snapshot machine
**What:** new `pkg-win11` disk (leave the shut-off `win11` stub alone), qcow2 nvram (libvirt refuses internal snapshots for pflash domains with raw nvram), NAT network, Windows 11 + QEMU guest agent + stock Firefox (coexistence cell's other party), `clean-baseline` snapshot; every matrix cell reverts first. Runner-user libvirt access via `/etc/nixos` + `nrs` (owner, `pkexec`). Guest transport: guest-agent exec (preferred) with WinRM/SSH fallback — recorded by the stage. Windows-side driver: one PowerShell script (install → launch probe → update → uninstall → registry export diff), invoked per cell, evidence captured verbatim. Windows Update frozen (metered/pause + snapshot revert); the VM licence and its update handling are owner actions.
**Five cells** (RELEASING vocabulary, `win-matrix-record`): install, launch (+coexistence with stock Firefox), update (UPD-30: sidecar running at apply time), uninstall, no-residue registry diff. Each cell: verdict + verbatim evidence; BUILD_TARGET parses; diff names the fork root; `Software\Mozilla` untouched; SmartScreen block present.
**Why qcow2 nvram:** the whole matrix depends on snapshot revert; without it there is no matrix, only five snowflake runs.

### Pattern 5: Sign inside-out, in Mozilla's order, on the hosted runner
**What:** `sign-publish` per-OS job (ubuntu-latest, env `release`): jsign on inner `.exe`/`.dll` → `mach repackage installer` (needs `upstream/python` + makensis 3.12 in the job) → jsign on `setup.exe` → MAR → `signmar -s` (SEC-07 shape: channel check + `-v` against tracked DER). This is `kind.yml`'s build-signing → repackage → repackage-signing → mar-signing chain [VERIFIED]. Azure auth via `azure/login` OIDC (no secret). /download flips the signing status as a content change (SEC-12); the `releasing-maintenance` deferral items 1–4 flip with it.
**Why this order:** the inner binaries must be signed *before* the installer and MAR are built — signing after packaging signs the wrapper while the payload stays unsigned.

## Code Examples

### Research Flag H1 — the updater rename with a live node.exe (ANSWERED)

**Mechanism [VERIFIED this session in `updater.cpp`]:**
- `rename_file` (`updater.cpp:960-1000`): on Windows, renaming over a locked file fails; the updater moves in-use files to a `tobedeleted` directory (`gDeleteDirPath`, :4563+) deleted post-update or on OS reboot via `MoveFileEx` (:1027, :1138-1143).
- Callback-app exclusive open (`updater.cpp:4495-4570`): `CreateFileW` fails if the callback executable is in use. If the error is not `ERROR_SHARING_VIOLATION` → `WRITE_ERROR_CALLBACK_APP`. **If it is a sharing violation *and* the update is silent (background task) → `BACKGROUND_TASK_SHARING_VIOLATION` and the update fails.** Non-silent proceeds without exclusive access.
- Staged updates change cwd to the system dir so the install dir isn't locked (`updater.cpp:3818-3827`).

**What this means for `node.exe`:** the sidecar's `node.exe` lives *inside* the application directory the updater renames. It is not the updater's callback app, so the exclusive-open guard does not cover it — a live `node.exe` meets the plain `rename_file` path: rename fails or the file is shunted to `tobedeleted`, leaving a broken install (stale `node.exe` resurrected on reboot, or `BACKGROUND_TASK_SHARING_VIOLATION` from a background apply).

**The fix (UPD-30):** a new AsyncShutdown blocker that awaits the sidecar reap *before* the updater's rename can run — i.e. on the quit/restart path that precedes apply. Placement facts [VERIFIED]:
- Today `TheiaService.stop()` kills fire-and-forget (`void killProcess(proc, graceMs).catch(()=>{})`, 3 s grace, on `quit-application-granted`) — nothing awaits it.
- Today `PowerBrowserAPI.quitApplication()` does `eAttemptQuit` with `fastShutdownStage=0` (full shutdown so XREMain releases the profile lock).
- The only existing AsyncShutdown blocker in the update path (`UpdateService.sys.mjs:5006`) writes `updates.xml` — a DeferredTask saver, not a reap gate. The new blocker is separate.
- Restart path exists: `UpdateService` `#maybeRestartBrowser` → `Ci.nsIAppStartup.eRestart` (:7584-7637).

```js
// Shape (new code in powerbrowser/shell/, boundary-catalogued in INTERNAL-APIS.md):
// on quit-application-granted AND on restartToUpdate: register
// AsyncShutdown.<phase>.addBlocker("PowerBrowser: reap sidecar",
//   async () => { await TheiaService.stopAndReap(); }); // awaited, bounded by killGraceMs
// stopAndReap resolves only when the sidecar pid is gone (poll bounded, loud on timeout).
```

**What the matrix row observes:** update N→N+1 applied *with the sidecar running at apply time*; PASS = version flips, layout restored (UPD-24 shape), no `tobedeleted` residue. A plant: sidecar held alive past the blocker timeout → update must not apply (red naming the live pid). Never assert on a missing log line — assert the version change and the process table.

### Research Flag H2 — the background-task path (ANSWERED)

**Mechanism [VERIFIED in `BackgroundUpdate.sys.mjs` + upstream docs]:**
- Registered at Firefox startup (default profile only): `_registerBackgroundUpdateTask` calls `TaskScheduler.registerTask(taskId, binary.path, interval, {workingDirectory, args, description, executionTimeoutSec: 20 min})` with `--backgroundtask backgroundupdate`, log to `UpdRootD/backgroundupdate.moz_log`, cadence from `app.update.background.interval` (default 7 h).
- Windows backend: Task Scheduler API (`TaskSchedulerWinImpl.sys.mjs`); per-OS-user tasks, no elevation (`BackgroundUpdates.rst:134-145` [VERIFIED: read]).
- Skip reasons are enumerated in `BackgroundUpdate.REASON` (incl. `SERVICE_REGISTRY_KEY_MISSING`, `APPBASEDIR_NOT_WRITABLE`, `NO_APP_UPDATE_BACKGROUND_ENABLED`) and `TASK_DEF_CURRENT_VERSION = 4` gates re-registration.

**What "verified" means for UPD-31:** after a normal launch, the Task Scheduler entry exists (name from `taskId`), `backgroundupdate.moz_log` is written to `UpdRootD`, and a staged update completes while the app is closed. **Maintenance-service-disabled interaction:** with `--disable-maintenance-service`, `shouldUseService()` is false and background applies run unelevated — `APPBASEDIR_NOT_WRITABLE` then correctly refuses admin installs (the UPD-21 cannot-update copy covers the UX on Linux/mac; the Windows matrix records what the user sees).

**Deferral is allowed** (CONTEXT: "verified or deferred with the reason recorded") — e.g. if the guest's Task Scheduler blocks task creation (policy/licence SKUs) the plan records *which* precondition failed (REASON value + scheduler error) and defers; the task is never silently enabled nor silently dropped.

### Research Flag H3 — the MTX-01 libvirt design (ANSWERED)

Covered by §Pattern 4. Remaining tree facts [VERIFIED]: no `matrix-*` job exists (`release.yml` itself does not exist — Phase 50 pending); `virsh`/libvirt state on legion is owner-provisioned (`sudo -n true` fails per `docs/BUILD.md:1012` capability record); the pre-existing `win11` stub domain must be left alone. The plan therefore builds the harness (domain XML with qcow2 nvram, NAT definition, guest-agent wait, PowerShell driver, record writer, `win-matrix-record` row + self-test) entirely locally against fixtures, and the owner runs provisioning + the live matrix at the `checkpoint:human-action`.

### Per-target Windows mozconfig (PKG-11 shape)

```python
# New emission (emitMozconfigWindows), values from configuration.toml, no literals:
ac_add_options --enable-application=browser
ac_add_options --target=x86_64-pc-windows-msvc   # pinned-tree cross target (working_with_esr_115.md:62-86)
ac_add_options --enable-bootstrap                 # fetches VS/SDK sysroot via get_vs.py into WINSYSROOT
ac_add_options --disable-maintenance-service      # PKG-11 / SEC-03: service stays out while unsigned
# + channel/MAR ids from updateChannel(config) (same as Linux emission), app basename/remoting lines
```
The row derives the expected lines from the generator at check time and compares against the emitted per-target mozconfig as set equality; self-test plants `--enable-maintenance-service` (inverted flag) and a missing `--target` line.

### NSIS patch extension (PKG-12 shape — regenerated, shown for scope only)

```
 defines.nsi.in      : MOZ_LAUNCHER_SUBKEY → fork root; CERTIFICATE_* (SEC-12 step)
 installer.nsi       : (already neutered SendPingIfApplicable — keep)
 uninstaller.nsi     : remove uninstall-ping send (cf. :373/:1141); registry cleanup → fork root
 artwork             : fork wizard bitmaps + firefox64.ico replacement (stand-ins today)
```

### jsign chain (SEC-12 shape)

```sh
# sign job (ubuntu-latest, env release), OIDC via azure/login v3.1.0:
jsign --storetype AZURE --alias <cert> --storepass <oidc> objdir/dist/bin/*.exe objdir/dist/bin/*.dll
./mach repackage installer   # needs upstream/python + makensis 3.12 in the job
jsign --storetype AZURE --alias <cert> objdir/dist/*.setup.exe
./mach repackage mar
signmar -d <db> -n powerbrowser-mar -s <in.mar> <out.mar> && signmar -d <vdb> -n powerbrowser-mar -v <out.mar>
```

## Pitfalls

### Pitfall 1: A Windows package with a Linux sidecar passes every static gate
**What goes wrong:** Gecko cross-builds fine; the packager copies `theia/…/lib` from legion; the NSIS installer, the MAR, and the signature are all valid — and the app never starts on Windows because `drivelist.node` is ELF.
**Why:** node-gyp natives + yarn optional packages are host-only (PITFALLS 6, re-confirmed this session).
**How to avoid:** build the sidecar on `windows-latest`, hand it over as an artifact, and gate assembly on `package-target-natives` (PE32+ magic on every `.node`/`rg`/`node`). The row's self-test plants a Linux `.node` into a Windows staging copy.
**Warning signs:** a `package-windows.sh` that reads `$ROOT/theia/…` on legion; `file` reporting ELF inside a `.exe` payload.

### Pitfall 2: The `050` vs `040` patch number drift
**What goes wrong:** `docs/RELEASING.md`'s `windows-unsigned` stage names `patches/050-powerbrowser-installer.patch` and a `.#firefox-win64` shell; the tree has `patches/040-powerbrowser-nsis.patch` and only `.#firefox` + `.#theia` shells.
**Why:** RELEASING.md was written against a planned layout, not the landed tree.
**How to avoid:** plans reconcile the numbering explicitly (extend `040` by regeneration; do not create `050` as a second NSIS patch) and correct the stale doc lines in the same commit, the way Phase 40 corrected RELEASING drift rather than forking new names.

### Pitfall 3: The maintenance service ships because the flag was emitted for the wrong target
**What goes wrong:** one shared `emitMozconfig` gains a conditional; a later refactor drops it; the Windows build silently carries the service. With the Authenticode check compiled out, the service would run `updater.exe` as `LocalSystem` on admin installs (`docs/RELEASING.md:112-114,153-155` state this consequence twice [VERIFIED: read]).
**Why:** a single emission function with a branch is one edit away from the wrong default.
**How to avoid:** per-target emission (separate function or explicit target parameter), and the `windows-mozconfig` row asserts `--disable-maintenance-service` present *and* `--enable-maintenance-service` absent as set equality. `config.status` (`MOZ_MAINTENANCE_SERVICE` in `update-programs.configure:167-174` [VERIFIED: read]) is the built-tree proof.
**Warning signs:** a mozconfig test that greps for the target line but not the service line.

### Pitfall 4: A hand-edited 040 hunk degrades to a silent no-op
**What goes wrong:** someone text-edits the patch to add the uninstaller hunk; blob hashes no longer match; the three-way merge applies nothing while reporting success; the installer ships the Mozilla namespace with every row green.
**Why:** hard rule — patches are regenerated, never text-edited (`CLAUDE.md`; `regenerate-patches.sh --check` + `patches-regenerated` row, AUTO-10 shape [VERIFIED: row exists in registry]).
**How to avoid:** regenerate only; `check-patch-surface.sh` brand-values mode guards the added hunks.
**Warning signs:** a `patches/` diff whose `index` lines do not match `git -C upstream diff --abbrev=10` output.

### Pitfall 5: The matrix proves the installer but not the update
**What goes wrong:** five cells go green with the sidecar closed during update; the first real-world update (sidecar running, background task) hits the live-`node.exe` rename race and bricks installs.
**Why:** the rename race only exists when the sidecar is alive at apply time.
**How to avoid:** the update cell *requires* the sidecar running at apply time (UPD-30 proof), plus a background-task-staged apply (UPD-31) or a recorded deferral. The row asserts version flip + restored layout, never a log-line absence (hard-rule violation otherwise).

### Pitfall 6: `Software\Mozilla` residue goes unnoticed because the diff scope is wrong
**What goes wrong:** the no-residue diff scans only the fork key; the installer wrote `TaskBarIDs` under `Software\Mozilla\${AppName}` (`uninstaller.nsi:1068` [VERIFIED]) and it survives uninstall.
**How to avoid:** the registry diff covers both hives' `Software\Mozilla` (must be untouched) and the fork root (must be clean after uninstall) — exactly what `win-matrix-record` asserts.

### Pitfall 7: `CERTIFICATE_ISSUER` ships fork-signed binaries under a DigiCert name
**What goes wrong:** SEC-12 signs with Azure while `defines.nsi.in` still declares `CERTIFICATE_ISSUER "DigiCert Trusted G4 …"` ([VERIFIED] line 57); the installer UI names a CA that never signed anything.
**How to avoid:** the SEC-12 step owns the issuer line (deferred with the signing row per `docs/BUILD.md:994` [VERIFIED]); the extended `ng066` row asserts issuer consistency post-signing and its absence pre-signing.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Windows PE magic / target detection | `file` output parsing in shell | `node` magic-byte read (`MZ` + PE offset → `PE\0\0` + machine `0x8664`; ELF `0x7FELF`; Mach-O fat/universal) in `verify-package-natives.mjs` | `file` is host tooling, not guaranteed in the sign job; magic bytes are deterministic |
| MAR descriptor emission | New per-OS descriptor script | Phase 44 `build-update-xml.mjs` shape (today `buildUpdateXml` in `verify-mar-update-hop.mjs:114-135`, idempotent, byte-identical [VERIFIED]) | CONTEXT forbids parallel mechanisms; one emitter, one format |
| NSIS branding verification | Whole-`installer.nsi` string scan | `defines`-level derivation (same technique as `verify-ng-066-nsis-branding.mjs`: substitute `@VAR@` from `config.status`, expand `${X}` from generated `branding.nsi` [VERIFIED: read]) | Full-file scans false-positive on comments and upstream stand-ins |
| Updater test drive | Custom update harness | Existing `verify-mar-update-hop.mjs` WebDriver path (UPD-24 shape) extended to the Windows cell | The four-outcome proof (fork-signed applies, unsigned/foreign-channel refused) already exists as `ng065` |
| Background-task scheduling | Custom scheduled-task wrapper | Upstream `TaskScheduler.sys.mjs` (already the registration path [VERIFIED]) — verify, don't reimplement | No Gecko modification outside the patch stack |
| Signing | `osslsigncode`, self-signed cert, or guest-side `signtool` | jsign 7.6 + Azure Artifact Signing via OIDC | Only jsign speaks Artifact Signing (no local key); guest-side `signtool` needs the key on the test VM |

**Key insight:** every Windows behaviour here is either Mozilla's own chain (cross-build → repackage → sign → MAR) or a per-target instance of an existing project shape (staging script, TARGETS emission, registry row). The phase adds instances, not mechanisms — except the AsyncShutdown reap blocker, which is the one genuinely new code.

## Doc edits this phase owns (docs/RELEASING.md + docs/BUILD.md)

Locate by content; line numbers below were read this session and will drift — plans cite labels, not lines.
- **`docs/RELEASING.md` `windows-unsigned` stage rows (:237 automated table; :209-210 operator table).** Execute the stage: five routing verdicts, `.#firefox-win64` shell + Windows mozconfig, WINSYSROOT population, fork artwork + registry defines, `050`-numbered patch work, Windows build/sidecar/installer/MAR, matrix gate, copy gate, WINNT descriptor row, `build-windows` job. Reconcile the three vocabulary deviations below; do not silently rename.
- **`docs/RELEASING.md` "Current posture: Windows" + "Deferred signing items" 1–4.** Unsigned-first posture stays; SEC-12 flips items 1–4 (certificate exists, service decision revisited, `CERTIFICATE_*` emitted, /download status updated). `win-download-copy` asserts the flip as content change.
- **`docs/RELEASING.md` "The Windows VM" (:436-449).** Correct the stale `virsh list --all` zero-domains line and the read-access claim beside it (RELEASING already orders the correction); record qcow2 nvram, agent, stock Firefox, snapshot.
- **`docs/RELEASING.md` troubleshooting ("A Windows admin install updates as LocalSystem").** Keep — it is the `--disable-maintenance-service` invariant. Add the UPD-30 blocker reference once it lands.
- **`docs/WINDOWS-DISTRIBUTION.md` (NEW tracked doc per RELEASING vocabulary).** Verbatim SmartScreen block + matrix record pointer; `win-download-copy` compares it against the live /download page as set equality.
- **`docs/BUILD.md` capability record (:1009-1013).** Flip `pkg-win11` from `staged-unexecuted` with evidence; record SDK/NSIS versions present, WINSYSROOT population log, media hashes already on record.
- **SEC-03 warning copy** into the /download source (Phase 47 renders verbatim): "Windows may show a 'Windows protected your PC' warning when you open the PowerBrowser installer, because this release is not yet code-signed. Check the download against SHA256SUMS, then choose More info and Run anyway." (REQUIREMENTS.md SEC-03 full text [VERIFIED: read]).

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Linux-only `node-runtime.json` (`linux-x64` only) | Per-target entries (`win32-x64` +); detector verifies SHASUMS in-job | This phase (PKG-13) | Windows Node is hash-pinned, not downloaded on trust |
| One `.mozconfig` (Linux dev) | Per-target emissions via `TARGETS` (Windows carries `--disable-maintenance-service`) | This phase (PKG-11) | Service can never leak into the wrong target |
| Hook-only 040 patch (AppName/CERT_NAME/install ping) | Full NSIS surface (uninstall ping, registry root, artwork, issuer at SEC-12) | This phase (PKG-12) | Matrix no-residue assertion becomes passable |
| `verify-trademark-surface.mjs` over brand.ftl/properties/fragments/desktop | + NSIS/app.ini/Info.plist/`MOZ_LAUNCHER_SUBKEY`, one plant each | This phase (LEG-01) | Mozilla marks in installer/updater surfaces go red |
| No Windows build/sidecar/matrix/sign rows | `windows-mozconfig`, `package-target-natives`, `win-matrix-record`, `win-download-copy`, `win-sign-chain` + self-tests | This phase | Each success criterion has a gate |

**`docs/RELEASING.md` `windows-unsigned` vocabulary — three deviations reconciled here (not silently renamed):**
1. **`patches/050-powerbrowser-installer.patch` vs tracked `040`.** RELEASING's stage table names a `050`-numbered installer patch; the tree carries `040-powerbrowser-nsis.patch` and no 050 of any kind [VERIFIED: `ls patches/`]. The 050 number belongs to the non-GUI wave-E plan series (the `packaged-product-correctness-linux` row cites `050-powerbrowser-package.patch`, likewise absent from the tree). **Reconciliation:** the plan extends **040 by regeneration** and records the number mapping in the plan (RELEASING's 050 = this tree's 040 lineage); it does not create a second installer patch file.
2. **`{.#firefox-win64, .#firefox-macos}` shells vs `flake.nix`.** RELEASING assumes per-target dev shells; `flake.nix` today exposes only `theia` + `firefox` [VERIFIED: read `devShells` block]. **Reconciliation:** the plan either adds the `firefox-win64` shell (bootstrap-capable, `msitools`, `get_vs.py` prerequisites) or documents the container-only path and corrects RELEASING's shell reference in the same commit. Silent reliance on an undeclared shell is the failure.
3. **`scripts/stage-sidecar.sh` + `scripts/run-install-matrix.sh` vs `powerbrowser/packaging/package-linux.sh`.** RELEASING's Linux stage names scripts that do not exist under those names [VERIFIED: no such files in `scripts/`]; the tree's staging pattern is `package-linux.sh` (NG-063/072). **Reconciliation:** `package-windows.sh` mirrors `package-linux.sh` (the verified pattern), and the plan notes the name mapping. Same for `build-update-xml.mjs` (assumed Phase 44 shape; today lives as `buildUpdateXml` inside `verify-mar-update-hop.mjs`).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Phase 50 `release.yml` shape (legion `build-*` + hosted sign/publish, `contents: read` on legion, artifacts `retention-days: 1`) exists as CONTEXT describes | Arch Map | Windows jobs follow a different shape; plan re-baselines against the landed Phase 50 |
| A2 | Phase 45 container (`--enable-bootstrap`, bookworm, jessie sysroot) is the build substrate; if it lands differently, `build-windows` follows it | Pattern 1 | WINSYSROOT/`get_vs.py` path changes; mozconfig lines stay the same (upstream-documented) |
| A3 | Phase 43 detector + Phase 44 descriptor builder accept per-target Windows wiring with no parallel mechanism | Pattern 3 | Windows carries its own pin/descriptor script, which the Phase 44 plan must then absorb |
| A4 | `win32-x64` is the `node-runtime.json` key and the sidecar triple the Windows row asserts (vs `win64`, `windows-x64`, `x86_64-pc-windows-msvc`) | Open Q2 | Key renamed once; row + detector + packager change together (all derive from one table) |
| A5 | jsign 7.6 runs in the sign job with `azure/login` v3.1.0 OIDC and no stored secret (STACK versions, not re-run this session — `nix eval` blocked by read-only sandbox) | Stack | Version bump or auth-shape change; the sign plan re-verifies versions before writing the job |
| A6 | `get_vs.py` output is cacheable outside the repo and reusable across builds (WINSYSROOT one-time population) | Pattern 1 | Per-build VS fetch; build time + network dependency recorded, cache step added |
| A7 | The `windows-latest` runner produces `yarn build` output whose natives + `rg` + `node` are all PE32+ (no legion-built stragglers in the artifact) | Pattern 1 | `package-target-natives` catches it at assembly — defence in depth, not an assumption of success |
| A8 | A Windows 11 licence (or evaluation media terms the owner accepts) covers the `pkg-win11` guest; Windows Update can be frozen for matrix determinism | Pattern 4 | Owner decision recorded; evaluation expiry becomes a RENEWALS row |

## Open Questions

1. **Does the background task survive `--disable-maintenance-service` for the matrix's admin-install cell?**
   - What we know: `shouldUseService()` returns false without the service, so background applies run unelevated; `APPBASEDIR_NOT_WRITABLE` then correctly refuses admin installs by design (`UpdateService.sys.mjs:1225-1260` [VERIFIED]).
   - Recommendation: the plan asserts the *refusal* (not the apply) for admin installs, and proves the apply for user-writable installs. No owner probe needed — the matrix answers it.
2. **Exact Windows target token (`win32-x64` vs alternatives)?**
   - What we know: `docs/BUILD.md:339-343` already uses `win32-x64` for the vsix pin record; `bootstrap.configure:85-86` maps `WINNT → win64`; Gecko BUILD_TARGET strings are read off the built tree, never hard-coded.
   - Recommendation: adopt `win32-x64` for the Node/vsix namespace (continuity with the recorded pin); derive the Gecko BUILD_TARGET from the build. Never hard-code either in two places.
3. **040 vs 050 patch numbering — answered (§State of the Art).** Extend 040 by regeneration; record the mapping. No second installer patch file.
4. **Keep or delete the `win11` stub domain once `pkg-win11` exists?**
   - Recommendation: keep (RELEASING orders leaving it alone); the matrix row asserts `pkg-win11` only and never touches `win11`. Deletion is an owner decision, never a plan step.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| legion container toolchain (`--enable-bootstrap`) | PKG-10 | assumed (Phase 45 pending) | ESR-pinned | — |
| `windows-latest` runner | PKG-13 | ✓ (GitHub-hosted) | — | — |
| `pkg-win11` guest (libvirt, agent, SDK, NSIS) | MTX-01, UPD-30/31 proof | ✗ (staged-unexecuted; `sudo -n true` fails per `docs/BUILD.md:1012` [VERIFIED]) | install media verified listable | Owner provisions at checkpoint; no fallback |
| Azure Artifact Signing account + validation | SEC-12 | ✗ (owner creates 3–4 weeks out) | Basic ~USD 10/mo | Unsigned ships first (SEC-03); signing is a later step in the same phase |
| `release.yml` + `release`/`descriptor` envs | PKG-10, DIST-10, MTX-01 jobs | ✗ (Phase 50 pending; `ls .github/workflows/` shows only `notify-drill`, `rebase-upstream`, `verify` [VERIFIED]) | — | Plans write jobs against the assumed shape; dispatch is owner-gated |
| makensis | installer rows | ✓ via `nix shell nixpkgs#nsis` | 3.12 | — |
| node | all rows | ✓ | v24.21.0 | — |
| jsign 7.6 jar | SEC-12 job | ✗ (fetched checksum-verified in job) | 7.6 | — |

**Missing dependencies with no fallback:** the owner-created objects (Azure account, libvirt access, VM licence, Phase 50 pipeline). They are the planned checkpoint and do not block the local work.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `scripts/verify-platform.sh` registry rows. Each script carries its own `--self-test` |
| Config file | none. Rows appended to CHECKS: quick rows before `if [ "$QUICK" -eq 0 ]` (:4733 [VERIFIED: read]); full rows inside it |
| Quick run command | `scripts/verify-platform.sh --only <label>` (likewise `<label>-self-test`) |
| Full suite command | `scripts/verify-platform.sh --quick`, then (after checkpoint + builds) the full-tier rows |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| PKG-11 | Per-target Windows mozconfig derived from generator; `--disable-maintenance-service` present, `--enable-maintenance-service` absent | static, quick | `--only windows-mozconfig` / `--only windows-mozconfig-self-test` | ❌ new `scripts/verify-windows-mozconfig.mjs` |
| PKG-10 (static half) | `build-windows` job shape: legion-only label, no secrets/env, SHA-pinned uses, no event text, `mach repackage installer` step present | static, quick | `--only build-windows-shape` (+ self-test) | ❌ new script (or `workflows`-row extension) |
| PKG-13 (static half) | `node-runtime.json` target set == expected set; each entry has version/url/sha256 | static, quick | `--only node-runtime-targets` (+ self-test) | ❌ new script |
| PKG-12 (schema) | Staged NSIS sources carry fork defines, no Mozilla host, still compile | full (needs makensis + generated/ + objdir) | `--only installer-build-proof` (widened) + `--only installer-schema` (widened) | exists, widen |
| PKG-12 (ping/brand) | AppName + CERT_NAME from build/manifest; both pings dead; namespace fork-rooted | full (built tree) | `--only ng066-nsis-branding-no-ping` (extended) | exists, extend |
| LEG-01 (scan) | No Mozilla mark on any NSIS/app.ini/Info.plist/`MOZ_LAUNCHER_SUBKEY` surface | static, quick | `--only trademark-surface` / `--only trademark-surface-self-test` (extended: +5 plants) | exists, extend |
| LEG-01 (residue) | Registry diff names fork root; `Software\Mozilla` untouched | full (matrix) | `--only win-matrix-record` (no-residue cell) | ❌ new `scripts/verify-win-matrix-record.mjs` |
| PKG-13 (natives) | Every `.node`/`rg`/`node` in the Windows package matches target (PE32+) | full (packaged tree) | `--only package-target-natives` (+ self-test plants Linux `.node` in Windows staging) | ❌ new `scripts/verify-package-natives.mjs` (PKG-23 shape) |
| UPD-30 | Sidecar reap awaited on quit/restart (static: blocker registered, catalogue row); update applies with sidecar live (matrix cell) | static quick + full matrix | `--only sidecar-reap-blocker` (+ self-test) and `win-matrix-record` update cell | ❌ new static row + matrix cell |
| UPD-31 | Background task entry exists + staged apply while closed, or deferral with reason | full matrix (or recorded deferral) | `win-matrix-record` task cell | same matrix row |
| MTX-01 | Five cells, verdicts + verbatim evidence, BUILD_TARGET parses, SmartScreen present | full (matrix) | `--only win-matrix-record` | ❌ new |
| SEC-03 | SEC-03 block identical across record/track-doc/live page | full (network for live page) | `--only win-download-copy` | ❌ new `scripts/verify-win-download-copy.mjs` |
| SEC-12 | jsign inner → repackage → jsign setup → MAR → signmar order; /download status flips | full (sign job evidence) | `--only win-sign-chain` | ❌ new |
| DIST-10 | Per-OS sign job + per-target Windows descriptors; `channel-live` covers the Windows target | full | extend `channel-live` + descriptor builder per target (Phase 44/49 shapes) | extend |
| PKG-10 (live) | `build-windows` green on legion; setup.exe + complete MAR in artifacts | full (tier-3 build) | `release.yml` job status (no separate row; evidence via artifacts + manifest) | Phase 50 shape |

### Sampling Rate
- **Per task commit:** `scripts/verify-platform.sh --quick`, after `git add` of new files (the residual-brand scan reads `git ls-files`).
- **Per wave merge:** `--quick` plus each new row's `--self-test`.
- **Phase gate:** `--quick` green, then the owner checkpoint (Azure/libvirt/licence/dispatch), then full-tier rows (`package-target-natives`, `win-matrix-record`, `win-download-copy`, `win-sign-chain`) green.

### Wave 0 Gaps
None in the registry mechanism. Gaps this phase fills: no `*natives*`/`*package-target*` script exists yet [VERIFIED: `ls scripts/`]; `release.yml` (and therefore `build-windows`/`matrix-*` jobs) is Phase 50-pending; `build-update-xml.mjs` is Phase 44-pending (logic today embedded in `verify-mar-update-hop.mjs`); the `.#firefox-win64` shell is RELEASING-assumed but absent from `flake.nix`.

## Security Domain

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V2 Authentication | yes (jobs) | Azure OIDC (`azure/login`, no stored secret); App tokens minted immediately before use; legion holds no secrets |
| V4 Access Control | yes | `release` env owner-review + branch policy; legion label only on build/matrix jobs; no `secrets.` on legion jobs; `win11` stub untouched |
| V5 Input Validation | yes (installer) | NSIS sink guard on every interpolated manifest value (`assertNsisEmittable` precedent in `generate.mjs:1142` [VERIFIED]); no event text in `run:`/`prompt:` |
| V6 Cryptography | yes | MAR `signmar -s/-v` against tracked DER; Authenticode jsign inner-first order; SHA512 descriptor hashes; SHASUMS-pinned Node |
| V10 Malicious Code / supply chain | yes | SHA-pinned admitted `uses:`; no cache steps in release path (poisoning); sidecar artifact from `windows-latest`, never legion |
| V14 Configuration | yes | Per-target mozconfig derivation; `--disable-maintenance-service` assertion; `releasing-maintenance` deferral fidelity |

### Known Threat Patterns
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Linux `.node` in Windows package pulls an attacker-writable search path | Tampering | `package-target-natives` PE32+ gate at assembly |
| Unsigned installer spoofed post-download | Spoofing | SEC-03 SHA256SUMS check instruction; SEC-12 Authenticode; attestation `verify` |
| Maintenance service as `LocalSystem` updater without Authenticode check | Elevation | `--disable-maintenance-service` + row asserting it (Pitfall 3) |
| Orphaned `node.exe` (quit observer missed) survives update with user token | Elevation/Persistence | AsyncShutdown reap blocker; SIDE-04 lineage (`signalBarePid` + start-tick check precedent in `INTERNAL-APIS.md` [VERIFIED]) |
| Registry residue under `Software\Mozilla` leaks fork identity / breaks coexistence | Tampering | Fork-root namespace + no-residue diff cell |
| Signing key on legion or test VM | Information disclosure | Keys only in `release` env / Azure; OIDC, no secret in job logs |

## Sources

### Primary (HIGH confidence — read or run this session)
- **Tree.** `powerbrowser/packaging/package-linux.sh` (97 lines, staging pattern); `powerbrowser/packaging/node-runtime.json` (`linux-x64` only); `patches/040-powerbrowser-nsis.patch` (43 lines, 2 files); `scripts/verify-trademark-surface.mjs` (637 lines, 5-plant self-test); `scripts/verify-ng-066-nsis-branding.mjs` (55 lines); `scripts/verify-installer-build-proof.mjs` header; `scripts/verify-platform.sh` registry (:3560–:4848 sampled, quick/full boundary :4733); `scripts/generate.mjs` (`emitMozconfig` :1464, `emitBrandingNsi` :3394, `TARGETS` :3540, `UPDATE_CHANNEL` :1393, `assertNsisEmittable` :1142); `configuration.toml` (126 lines); `.mozconfig` (generated banner); `flake.nix` (`theia`+`firefox` shells only); `powerbrowser/shell/TheiaService.sys.mjs:345-373` (fire-and-forget kill) + `PowerBrowserAPI.sys.mjs:602-742` (killProcess/quitApplication); `INTERNAL-APIS.md` quit rows; `verify-mar-update-hop.mjs:114-135` (`buildUpdateXml`); `docs/RELEASING.md` (windows-unsigned :108-161, VM :209-210/:436-449, gates :841-842, troubleshooting); `docs/BUILD.md` (NSIS-on-Nix :972-1013, sidecar cells :330-380, key custody :740-800).
- **Upstream (pinned ESR tree).** `working_with_esr_115.md:62-86` (two-line cross mozconfig); `build/moz.configure/bootstrap.configure:85-86,188-250` (WINNT→win64, get_vs.py); `build/moz.configure/update-programs.configure:160-175` (maintenance flag); `taskcluster/kinds/repackage/kind.yml` (build-signing→repackage→mar-signing; `win64: [mar, installer]`); `taskcluster/kinds/build/windows.yml` (win64 platform); `toolkit/mozapps/update/updater/updater.cpp` (:960-1143 rename/tobedeleted, :3808-3827 staged cwd, :4495-4570 callback exclusive-open/`BACKGROUND_TASK_SHARING_VIOLATION`); `toolkit/mozapps/update/UpdateService.sys.mjs` (:5006 AsyncShutdown saver, :7584-7637 restart, :1225-1260 shouldUseService); `toolkit/mozapps/update/BackgroundUpdate.sys.mjs` (:351-400 register, :1163 REASON, TASK_DEF v4); `BackgroundUpdates.rst:120-180` + `Concepts.md:395-430` (Task Scheduler, per-user, no elevation); `browser/installer/windows/nsis/{defines.nsi.in,installer.nsi,uninstaller.nsi}` (namespace + ping sites); `browser/app/macbuild/Contents/Info.plist.in` (`org.mozilla.updater` et al.); `build/application.ini.in` (Name/Vendor tokens); `modules/libmar/tool/moz.build` (signmar target).
- **Deploy workstream.** REQUIREMENTS.md Phase 54 rows + Owner Decisions + External Gates (Azure 1–20 days, libvirt `nrs`, VM licence); ROADMAP Phase 54 (goal, 5 success criteria, deps, research flag); 54-CONTEXT.md (80 lines, decisions/gates/assumptions); STATE.md (Phase 41 executing); 41-RESEARCH.md (format reference, 689 lines); `41-01-PLAN.md:22` (requirements frontmatter convention); `plan-gate.py --stream deploy` (0/0 today — no deploy-stream rows in the main ledger yet).

### Secondary (MEDIUM — research docs, consistent with tree where checkable)
- `.planning/research/v1.6-deploy/{SUMMARY.md:321-332,377-410, ARCHITECTURE.md §3 (H row, sidecar-quit), STACK.md:19-25,100-160,180-200 (cross/jsign/Azure/sign order), FEATURES.md:108,120,135,157 (pricing/eligibility, cross-build, sidecar-reap), PITFALLS.md:112-123 (Pitfall 6), CRITIQUE.md:56,C13,C18 (two-line mozconfig, updater-rename open, cross-vs-natives)}`.

### Tertiary (LOW — cited but not independently verified this session)
- jsign 7.6 / `azure/login` v3.1.0 versions, Azure Basic ~USD 10/mo pricing, Task Scheduler behaviour on licence-constrained SKUs, Windows 11 media edition terms.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH for in-tree mechanics; MEDIUM for cross-toolchain + signing (documented, present, unbuilt).
- Architecture patterns: HIGH — every pattern mirrors a verified in-tree precedent.
- Research flags H1–H3: ANSWERED from upstream source + tree (matrix proof still pending by definition).
- RELEASING reconciliation: HIGH —all three deviations verified by `ls`/`grep`/read this session.
- Pitfalls: HIGH — each is anchored to a verified line or an explicit pending dependency.

**Research date:** 2026-10-23
**Valid until:** 2026-11-23. Re-check `working_with_esr_115.md` lines and jsign/Azure versions if the plan slips; re-verify the `win11` stub state on legion before provisioning `pkg-win11`.
## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `scripts/verify-platform.sh` registry plus per-script `--self-test` (node built-ins, bash) |
| Config file | none (rows are the `CHECKS=(` arrays) |
| Quick run command | `scripts/verify-platform.sh --only <label>` |
| Full suite command | `scripts/verify-platform.sh --quick` (~70 s green baseline) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PKG-10 | legion container cross-build + `build-windows` static shape | quick + self-test | `--only build-windows-shape` / `--only build-windows-shape-self-test` | ❌ Wave 0 |
| PKG-11 | per-target Windows mozconfig, `--disable-maintenance-service`, no literals | quick + self-test | `--only windows-mozconfig` / `--only windows-mozconfig-self-test` | ❌ Wave 0 |
| PKG-12 | regenerated 040: uninstall-ping removal, fork registry namespace, fork artwork | quick (regen) + full (compile) | `--only patches-regenerated`, `--only installer-build-proof` | ✅ (extend) |
| PKG-13 | win32 sidecar + node-runtime target set + PE natives | quick + full + self-test | `--only node-runtime-targets`, `--only package-target-natives(-self-test)` | ❌ Wave 0 |
| LEG-01 | NSIS/app.ini/Info.plist/MOZ_LAUNCHER_SUBKEY carry no Mozilla mark; each plant red | quick + self-test | `--only trademark-nsis` (inside verify-trademark-surface) / `--only trademark-nsis-self-test` | ✅ (extend) |
| MTX-01 | five cells, verdicts + verbatim evidence, BUILD_TARGET parses, fork-root diff, `Software\Mozilla` untouched | full + fixture self-test | `--only win-matrix-record` / `--only win-matrix-record-self-test` | ❌ Wave 0 |
| UPD-30 | reap awaited before rename; version flips with sidecar running, no `tobedeleted` residue | static quick + full matrix cell | `--only sidecar-reap-blocker(-self-test)` + matrix update cell | ❌ Wave 0 |
| UPD-31 | background-task entry + log + staged apply while closed, or recorded REASON deferral | full matrix cell or deferral | `--only win-matrix-record` background cell or tracked deferral | ✅ (verify upstream) |
| SEC-03 | verbatim SmartScreen warning identical across record/track-doc/live page | full | `--only win-download-copy` | ✅ (edit) |
| SEC-12 | jsign inner → repackage → jsign setup → MAR → signmar order; OIDC; status flip | full + order-fixture self-test | `--only win-sign-chain` / `--only win-sign-chain-self-test` | ❌ Wave 0 |
| DIST-10 | per-OS sign job + per-target Windows descriptors (Phase 44 builder shape) | quick + full | descriptor rows + `--only channel-live` per-target | ❌ (Phase 44 shape) |

### Sampling Rate
- **Per task commit:** `scripts/verify-platform.sh --only <new label>` and its `-self-test`, then `node scripts/scan-brand-residue.mjs` after `git add`.
- **Per wave merge:** `scripts/verify-platform.sh --quick`.
- **Phase gate:** `--quick` green, then the full-tier Windows rows green on fixtures/guest, before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `scripts/verify-windows-mozconfig.mjs` — PKG-11
- [ ] `scripts/verify-build-windows-shape.mjs` (or widened workflows row) — PKG-10
- [ ] `scripts/verify-node-runtime-targets.mjs` (or Phase 43 detector fold-in) — PKG-13
- [ ] `scripts/verify-package-natives.mjs` — PKG-13 / PKG-23 shape
- [ ] `scripts/verify-sidecar-reap-blocker.mjs` (static half) — UPD-30
- [ ] `scripts/verify-win-matrix-record.mjs` — MTX-01
- [ ] `scripts/verify-win-download-copy.mjs` — SEC-03
- [ ] `scripts/verify-win-sign-chain.mjs` — SEC-12
