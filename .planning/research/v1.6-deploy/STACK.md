# Stack Research: v1.6 Deployment setup

**Domain:** release pipeline, signing, update hosting, upstream-tracking automation, and an AI fixer for a Gecko + Theia browser maintained by one owner
**Researched:** 2026-10-20
**Confidence:** HIGH for versions, GitHub/Cloudflare/Anthropic mechanics and the upstream-tree findings. MEDIUM for the cross-toolchain and signing paths (they are documented and present in the source tree but no build was run). LOW where a row says so.

Scope: only what v1.6 adds. The existing tree (Gecko 153.5.0esr, Theia 1.76.0, Node 24, the Nix dev shells, `verify-platform.sh`, the generator, patches 010-040, the NG-063/064/065 rows) is not re-researched here.

Every version in this file was read on 2026-10-20 from the GitHub releases API (`gh api repos/<r>/releases/latest`), the npm registry, crates.io, or `nix eval` at the flake's locked nixpkgs rev `ffb3c9b7`, unless the row says otherwise.

---

## Recommended Stack

### Core: build, package and sign

| Technology | Version | Purpose | Why |
|---|---|---|---|
| **Mozilla bootstrap toolchains inside a podman container on legion** (base `debian:bookworm`, package list copied from `upstream/taskcluster/docker/debian-build/Dockerfile`) | toolchains pinned by the ESR tree itself; podman 5.8.6 (already enabled, `/etc/nixos/configuration.nix:657`) | Portable Linux build (PKG-17), and the Windows and macOS cross builds | This replaces both the Nix-shell build for releases and the nixpkgs cctools/apple-sdk idea. `--enable-bootstrap` downloads Mozilla's own clang, rust, cbindgen, nasm, sccache and the **Debian jessie sysroot (glibc 2.19)**: `upstream/taskcluster/scripts/misc/build-sysroot.sh:19-22`, `taskcluster/kinds/toolchain/sysroot.yml:31-44`. The result runs on any glibc ≥ 2.19 system, so it fixes the `/nix/store` interpreter and GLIBC_2.42 problem at its source. Mozilla ships Firefox with the same toolchains. |
| Windows cross: `--target=x86_64-pc-windows-msvc --enable-bootstrap` + `msitools` | in-tree | setup.exe + MAR built on legion | The pinned tree documents this exact two-line mozconfig: bootstrap fetches the VS/Windows SDK sysroot and selects clang-cl and lld-link (`upstream/docs/contributing/build/working_with_esr_115.md:62-86`). `win64-vs2026` is `local-toolchain: true` (`taskcluster/kinds/toolchain/misc.yml:692-710`). |
| macOS cross: `--target=aarch64-apple-darwin` and `x86_64-apple-darwin` builds, merged by `taskcluster/scripts/misc/unify.sh` | macOS SDK 26.5 (`taskcluster/kinds/toolchain/macos-sdk.yml:31-44`) | Universal DMG + MAR built on legion | The SDK and VS artifacts are private on Taskcluster. For private artifacts, bootstrap runs the toolchain's own script locally: `unpack-sdk.py` downloads from Apple's public CDN and `get_vs.py` downloads from Microsoft (`build/moz.configure/bootstrap.configure:188-250`). No Mac or Windows host is needed. Free `macos-26` (arm64) hosted runners stay the fallback. |
| `signmar` built by that same container build (`objdir/dist/bin/signmar` + its NSS libraries) | tree | MAR signing in the hosted sign job | `signmar` is a target `Program` in `upstream/modules/libmar/tool/moz.build:22-34`. Built against the jessie sysroot, it runs on `ubuntu-latest` with `LD_LIBRARY_PATH=dist/bin`, the same form as `docs/RELEASING.md:892`. **This removes Nix from the sign job entirely** and settles the "signmar Nix closure size" risk. `pk12util` comes from Ubuntu's `libnss3-tools`. |
| **jsign** | 7.6 upstream (nixpkgs 7.5) | Authenticode for Windows inner binaries and setup.exe | Runs on Linux, signs NSIS-generated executables, and supports Azure Artifact Signing (added in 7.0) (github.com/ebourg/jsign). `osslsigncode` 2.14 needs a local key, which Artifact Signing never releases, so it cannot do this job. |
| **rcodesign** (apple-codesign) | 0.29.0 (crates.io and nixpkgs; last release 2024-11-29) | macOS signing and notarization from Linux | The tree already wraps it: `./mach macos-sign --use_rcodesign --rcodesign-p12-file … --rcodesign-p12-password-file …` (`upstream/tools/signing/macos/mach_commands.py:103-134`). That command applies Mozilla's entitlements. Notarize with `rcodesign notary-submit` using an App Store Connect API key. **Risk:** no release in 23 months. The fallback is Apple's `codesign`/`notarytool` on a hosted `macos-26` runner. |
| Azure Artifact Signing, Basic | USD 9.99 per account per month, 5,000 signatures (Microsoft SKU docs; the pricing page shows "$-") | Windows Public Trust signing | Public Trust is open to organizations in the US and 11 other regions; the DeBIOS Foundation (US) qualifies. **Free, trial and sponsored subscriptions are refused** (Artifact Signing FAQ), so Azure nonprofit-grant credit cannot pay for it. Use pay-as-you-go. Billing is not prorated, and identity validation takes 1-20 business days. Authenticate the job with `azure/login` v3.1.0 over OIDC, with no stored secret. |

### Core: GitHub automation

| Technology | Version (SHA) | Purpose | Why |
|---|---|---|---|
| GitHub App **powerbrowser-bot** | — | PRs, tags, issue updates, workflow dispatch | Runs started with GITHUB_TOKEN create no workflow runs, except `workflow_dispatch` and `repository_dispatch` (GitHub "Events that trigger workflows"). An App token fixes that, and App keys do not expire, so the renewal register needs no PAT row. |
| GitHub App **powerbrowser-runner** (second App, new) | — | Self-hosted runner registration only | Its only permission is org "Self-hosted runners: read & write", so the key stored on legion can only register runners. See the runner row. |
| `actions/create-github-app-token` | v3.3.0 `64ab729a6294000f5aa4a4bc0b73d1f32bc45510` | Mint installation tokens in jobs | Use the `client-id` input (`app-id` is deprecated in v3) and the per-step `permission-*` inputs, so each step gets only the scope it needs. |
| `actions/checkout` | v7.0.1 `3d3c42e5aac5ba805825da76410c181273ba90b1` | — | The tree pins v4.4.0 (`verify.yml:43`, `rebase-upstream.yml:51`). Bump both in the same PR that adds the new workflows. |
| `actions/upload-artifact` / `download-artifact` | v7.0.2 `cf430e030ddbb5b0abf93d22962f4752f3646cd9` / v8.0.2 `9000827ccba6bdab643e8b6fd33ac0654aef8333` | legion build → hosted sign hand-off (decision 11) | Set `retention-days: 1`. |
| `actions/attest-build-provenance` | v4.2.2 `4d101475d8b20a2381f78447822ac1eab6504dd8` | SLSA provenance on the uploaded assets | Public repos sign with public-good Sigstore. Immutable releases also generate a release attestation automatically (GitHub "Immutable releases"). |
| `cachix/install-nix-action` | v31.11.2 `448cde739abec1eaf0646249e3d25bb8d9bc7702` | Jobs that need `nix develop .#theia` (pin-bump job A, fixer) | Already used at v31.11.1 (`verify.yml:53`). |
| `anthropics/claude-code-action` | v1.0.254 `db77d4d3c98f3f6380e7cd45ffba2342a3dbde3c` | Claude fixer and issue triage | Details are in "Claude fixer stack" below. |
| `renovatebot/github-action` | v46.3.9 `a63d9a7bc606f7336fd20b47f2f32259a35e6213` (Renovate 44.172.1) | Theia group bump, action digests | Self-hosted and dispatched by release-train, not Mend-hosted. Rationale is under Alternatives. |
| CodeQL **default setup** (no workflow file) | codeql-action v4.39.0 runs behind it | JS/TS, Python and **Actions** analysis | Default setup needs no YAML. Under a "selected actions" policy, set `github_owned_allowed: true` so GitHub's own actions are allowed. |
| zizmor | v1.31.1 | Static audit of `.github/workflows` as a `--quick` row (`zizmor --offline`) | Offline and derived from the tree, which fits the verification rules. It flags `pull_request_target`, template injection and unpinned uses. The self-hosted runner makes workflow mistakes costly. |
| Actions policy `sha_pinning_required: true` | GitHub repo setting | Enforces SHA pins server-side | The live repo reads `allowed_actions: all, sha_pinning_required: false` (gh api, 2026-10-20). This setting replaces most of the hand-kept SHA list idea in `.github/settings/actions-selected.json`. |

### Core: self-hosted runner on legion

| Technology | Version | Purpose | Why |
|---|---|---|---|
| NixOS `services.github-runners.<name>` with `githubApp = { id; login; privateKeyFile; }`, `ephemeral = true`, `user`, `workDir`, `extraLabels` | NixOS 26.05 on legion; module in nixpkgs `nixos/modules/services/continuous-integration/github-runner/options.nix:61-200, 392-412` | Build jobs | The module mints a registration token from an App key, and its docs say this "pairs well with `ephemeral` runners". That removes the PAT that `docs/RELEASING.md:478, 917-920` assume and gives a clean runner per job. The runner user needs rootless podman (`autoSubUidGidRange`). |
| github-runner package | nixpkgs 2.336.0; upstream 2.338.0 (2026-10-06) | — | **Risk:** runners registered with `--disableupdate` must be updated within 30 days of a new release (GitHub docs; secondary sources say jobs queue forever after that). The liveness Worker must compare the runner version with `actions/runner` latest. Override the package from nixpkgs-unstable when it lags. |

### Core: Cloudflare (Free)

| Technology | Version | Purpose | Why / limits |
|---|---|---|---|
| Workers + Cron Triggers | wrangler 4.151.3; `cloudflare/wrangler-action` v4.1.3 `953926a2e2182532811c01a25e53647d93bf07c0`; `@cloudflare/workers-types` 5.20261019.1 | Scheduler (the external clock under D-77) and `/events` | Free plan: 100,000 requests/day, **10 ms CPU per invocation including cron**, **5 Cron Triggers per account**, 50 subrequests per invocation, 100 MB request body (Workers limits page). One scheduler cron that dispatches everything fits. Keep each tick to under 50 GitHub/HTTP calls. Use two Workers: the scheduler gets no public route, and only `/events` is public. That keeps the App key out of the internet-facing isolate. |
| `universal-github-app-jwt` | 2.2.2 | App JWT inside the Worker (WebCrypto) | It is small and runs on WebCrypto. GitHub issues PKCS#1 keys and WebCrypto needs PKCS#8, so convert the key once before storing it as a Worker secret (its README, "Converting PKCS#1 to PKCS#8"). Do not add Octokit. |
| D1 | — | Telemetry rows, download counts | Free: 10 databases, 500 MB per database, 5 GB total, 7-day Time Travel (D1 limits page). |
| Pages | — | powerbrowser.org and updates.powerbrowser.org | `_redirects`: 2,000 static + 100 dynamic rules. A **200 rewrite works only to paths on the same site**. `:placeholder` matches one segment and `*` matches across segments (Pages redirects docs). Workers static assets also support `_redirects` and `_headers` natively, so decision 8 can move later without a rewrite. |
| R2 | — | MAR fallback origin | 10 GB free (SEED-002). There is no new tooling: `wrangler r2 object put` runs from the sign job. |

### Supporting libraries and tools

| Library / tool | Version | Purpose | When |
|---|---|---|---|
| `libnss3-tools` (Ubuntu apt) | Ubuntu 24.04 package | `pk12util` and `certutil` to build the throwaway NSS db in the sign job | Every release |
| cosign | v3.1.4 | Documented anonymous verification of the Sigstore bundle on /download | Docs only, not in CI |
| `gpgv` + `nodejs/release-keys` keyring | keyring repo pushed 2026-09-09 | In-job SHASUMS256.txt signature check (AUTO-04) | Node detector PR |
| `flatpak-builder-tools` (flatpak-node-generator) | — | Offline yarn sources, if Flathub ever requires a source build | Phase J only, and only after a Flathub ruling |
| `wingetcreate` | v1.12.13.0 | winget manifest PRs | Phase J |
| floorp-bin derivation as a template | nixpkgs `pkgs/by-name/fl/floorp-bin-unwrapped/package.nix` (floorp-bin 12.16.4) | Flake repack (PKG-19) | Phase J. It uses `fetchurl` + `autoPatchelfHook` + `patchelfUnstable --no-clobber-old-sections` (lines 46-47, 74), a `DisableAppUpdate` policies.json (25-29, 105), and `wrapFirefox`. |

### New in-tree scripts (no new dependency)

| Script | Purpose | Why |
|---|---|---|
| `scripts/regenerate-patch.sh <NNN>` | Rewrites `patches/NNN-*.patch` from `git -C upstream diff` over that patch's own path set, in the existing format (`index <10-hex>..<10-hex>`, see `patches/010-powerbrowser-identity.patch:1-2`) | No regeneration command exists today (only `apply-patches.sh` and `rebase-upstream.sh`). The project rule says patches are regenerated and never text-edited. The fixer needs one sanctioned command so it never writes a hunk. Add a `--self-test` that plants a hand-edited hunk and requires red. |
| `scripts/release-train.mjs` | Computes the current state of a release from GitHub itself (pin vs product-details, open bump PR, CI result, draft or published Release, descriptor commit, liveness) and prints the next step | The orchestrator advances by re-deriving state on each run, so there is no state file to drift. The tracking issue body is output, not input. This follows the "derive and compare" rule. |
| `.mozconfig` release/container variant from the generator | Drops `--with-libclang-path="$LIBCLANG_PATH"` and `--without-wasm-sandboxed-libraries` (`.mozconfig:12,14`, Nix-specific) and adds `--enable-bootstrap` | It is a new generator target, so it stays under `generated-byte-identity`. Do not hand-write it. |

---

## Claude fixer stack (owner addition 2)

| Item | Value | Source / why |
|---|---|---|
| Action | `anthropics/claude-code-action@db77d4d3…` (v1.0.254) | It installs **Claude Code 2.1.304** at run time through `curl -fsSL https://claude.ai/install.sh \| bash -s -- 2.1.304` (`src/entrypoints/run.ts:53,80` at that SHA) and Bun 1.3.14 through a SHA-pinned setup-bun. The version is pinned by the action SHA; the install script is not hash-pinned. Record this in the allow-list. |
| Auth | **Workload Identity Federation**: `anthropic_federation_rule_id` + `anthropic_organization_id` (+ `anthropic_service_account_id`), job `permissions: id-token: write` | Action inputs at v1.0.254 (`action.yml:73-87`); WIF is GA in the Claude API. No long-lived Anthropic key is stored in GitHub, which drops a secret and a renewal-register row. |
| Models | Fixer: `claude-opus-5-5` (USD 4 / 20 per MTok). Triage: `claude-haiku-5-5` (USD 0.10 / 0.50) | Claude API model table, cached 2026-10-06. Opus is the default for long agentic coding. Haiku is enough for labels and comments. |
| Spend limits | `claude_args: --max-turns N --max-budget-usd X`, job `timeout-minutes`, a dedicated Console workspace with a monthly spend limit, and a `concurrency:` group | `--max-budget-usd` exists in Claude Code 2.1.x (`claude --help`). The workspace cap is the hard ceiling and the CLI flag is the per-run ceiling. |
| Patch rule, enforced | `--disallowedTools "Edit(patches/**)" "Write(patches/**)"`, and the Bash allow-list holds only `scripts/apply-patches.sh`, `scripts/regenerate-patch.sh`, `scripts/rebase-upstream.sh`, `scripts/verify-platform.sh --quick`, `node scripts/generate.mjs`, and git | This turns "regenerate, never text-edit" from a prompt instruction into a permission. |
| GitHub token for the fixer | An App token minted with only `permission-contents: write` + `permission-pull-requests: write`, and **no `workflows`** | Without `workflows: write` the fixer cannot change any workflow file. The PR is opened by the App, so CI runs on it. |
| Where it runs | `ubuntu-latest` only, in a `fixer` environment with no signing secrets; never on the legion label | Keeps "never touches signing keys" structural. |
| Triggers | (a) a job inside release-train with `if: failure()` on the replay, bump or check step; (b) `workflow_run` with `conclusion == 'failure'`, filtered to `head_repository.full_name == github.repository` and bot branch prefixes | `workflow_run` runs the default-branch workflow file. The action also checks the upstream run's actor for write access and stops if it has none (`docs/security.md:23-27`). Fork PRs never reach the fixer. Never set `allowed_non_write_users` on the fixer. |
| Disk | The fixer clones `upstream/` (`upstream/.git` is 1.1 GB locally, a shallow fetch via `scripts/fetch-upstream.sh`) | This fits a hosted runner. A Gecko *build* does not, so the fixer proves its fix with `--quick` plus replay, and the PR's CI or the legion job runs the full build. |

---

## Installation

```bash
# legion (NixOS, through /etc/nixos and nrs -- verify every option name first)
#   services.github-runners.pb-release = { enable; url; githubApp = {...}; ephemeral = true;
#     user = "pb-runner"; workDir = "/var/lib/pb-runner"; extraLabels = [ "pb-release" ]; };
#   users.users.pb-runner.autoSubUidGidRange = true;   # rootless podman
#   podman is already enabled (configuration.nix:657)

# container image for Gecko release builds (Containerfile in powerbrowser/packaging/)
podman build -t pb-gecko-build -f powerbrowser/packaging/Containerfile .

# sign job (ubuntu-latest), apt only, no Nix
sudo apt-get install -y libnss3-tools openjdk-21-jre-headless   # pk12util; jsign needs a JRE
# jsign jar 7.6 and rcodesign 0.29.0 come from their GitHub release assets, checksum-verified in the job

# Workers repo (powerbrowser-ops: scheduler + events)
npm install -D wrangler@4.151.3 @cloudflare/workers-types@5.20261019.1
npm install universal-github-app-jwt@2.2.2
```

---

## Alternatives Considered

| Recommended | Alternative | When to use the alternative |
|---|---|---|
| Mozilla bootstrap toolchains in a Debian container | Unwrapped Nix toolchain, or patchelf after the build | Never. patchelf fails because libxul needs GLIBC_2.42 (SEED-002 §9.6), and the nixpkgs clang wrapper hard-codes the loader. |
| Mozilla bootstrap for the macOS cross build | nixpkgs cctools/apple-sdk cross toolchain | Do not use it. It is unproven for Gecko, and Mozilla's path is in the tree. |
| Cross-build macOS on legion | Hosted `macos-26` (arm64) runner | If the legion cross build fails, or if the Apple SDK licence question (below) is answered "no". |
| Self-hosted Renovate action dispatched by release-train | Mend Renovate Community Cloud | Mend's runtime and concurrency limits are not documented (hosted-apps-config and job-scheduling pages), only "a limited set of approved postUpgradeTasks" is allowed, and Mend runs on its own clock, which conflicts with the one-orchestrator rule. Use Mend only if the owner accepts a second clock. |
| Renovate for action digests (`helpers:pinGitHubActionDigests`), Dependabot for alerts + security updates only | Dependabot github-actions version updates | Dependabot version updates run on Dependabot's own schedule, which cannot be dispatched. Dependabot does update the SHA and the version comment together (GitHub changelog 2022-10-31), so it is an acceptable fallback. |
| flake.lock bump as a release-train step (`nix flake update` + `toolchain-baseline.sh` + PR) | Renovate nix manager | Renovate's nix manager is beta and opt-in, and its datasource is `git-refs` only (Renovate nix manager docs). It also cannot regenerate `toolchain-baseline.txt`. |
| jsign + Azure Artifact Signing | osslsigncode with an OV/EV certificate on a token | Only if the foundation buys a hardware-token certificate instead. |
| WIF for Anthropic | `anthropic_api_key` environment secret | Only if WIF setup in the Console is blocked. |
| Codeberg push as a release-train job (hosted runner, `mirror` environment secret) | systemd timer on legion (SEED-002 row 14) | The timer fails silently, which SEED-002 accepts. As a job, a failure lands in the tracking issue. |
| Two Workers in one repo `powerbrowser-ops` | Separate `powerbrowser-telemetry` and scheduler repos | Separate repos only if different people maintain them. One repo means one Cloudflare API token and one wrangler config pattern. |

## What NOT to add

| Avoid | Why | Use instead |
|---|---|---|
| **Cachix / R2 Nix cache (INF-05)** | The flake *repacks* the release tarball. `fetchurl` + autoPatchelf compiles nothing (floorp-bin shows the pattern), so "every install compiles Gecko" does not apply. Cachix free OSS is 5 GB and its licence eligibility is unstated (cachix.org/pricing). | Nothing. Revisit only if a from-source flake output ships. |
| Nix in the sign job | Its closure size was an open risk, and the container `signmar` makes it unnecessary | `objdir/dist/bin/signmar` + `libnss3-tools` |
| `--generate-notes` as the release-notes body | It lists only PR titles, and this repo commits to main directly (SEED-002 row 6) | Notes derived by script |
| Upptime (MON-02) | It needs `schedule:`, so the 60-day disable applies, and "repository activity" is undefined in GitHub's docs. The liveness Worker already covers it. | Liveness Worker + its one failure email |
| `allowed_non_write_users` / `allowed_bots: '*'` on any Claude job | The action's own docs mark these as prompt-injection risks | Triage on `issues: opened` with an `issues: write`-only GITHUB_TOKEN |
| A PAT anywhere it can be avoided | App tokens expire in 1 hour; PATs leak and need renewal | Apps (bot, runner) and OIDC (Anthropic, Azure) |
| `mach repackage flatpak` | It refuses any product except firefox and thunderbird (`python/mozbuild/mozbuild/repackaging/flatpak.py:186-191`) | Own manifest, Phase J |
| MSIX / MSI / PKG / Snap | Approved skip list (SEED-002 §1) | — |
| Octokit in the Worker | Larger than needed under a 10 ms CPU budget | `universal-github-app-jwt` + `fetch` |
| A `default:` on `rebase-upstream.yml`'s `tag` input | It mirrors `configuration.toml:115`, so every ESR bump edits a workflow file. That forces `workflows: write` on the bot token, which a fixer or bump job should never hold. The input is already `required: true` and the dispatcher always passes it. | Delete the default. Change `scripts/verify-upstream-pins.mjs:10-36` to assert that no default exists. |

## Stack patterns by variant

**Linux tar.xz (first release):** container build on legion → artifact → hosted sign job (`signmar -s`/`-v`, SHA256SUMS, attest, draft, publish) → descriptor commit after the 24 h delay.

**Windows:** container cross build → hosted job runs jsign on the inner `.exe`/`.dll` → `mach repackage installer` (needs `upstream/python` and makensis 3.12) → jsign on setup.exe → MAR → signmar. This is Mozilla's build-signing → repackage → repackage-signing → mar-signing chain (`upstream/taskcluster/kinds/repackage/kind.yml`). The inner binaries must be signed **before** the MAR and the installer are built.

**macOS:** two container cross builds + `unify.sh` → hosted job runs `mach macos-sign --use_rcodesign` → notarize → staple → `mach repackage dmg` (libdmg/hfsplus are public `local-toolchain`s, `misc.yml:62-96`) → MAR → signmar.

**Nix:** `fetchurl` of the Release tarball + autoPatchelf + `wrapFirefox`. **Merge** `DisableAppUpdate` into the product's `distribution/policies.json` instead of replacing it the way floorp's `ln -s` does (line 105): EXT-03's `ExtensionSettings` lives in that file.

## Version compatibility and live facts (2026-10-20)

| Fact | Value | Source |
|---|---|---|
| ESR | product-details `FIREFOX_ESR` = `153.5.1esr`; `FIREFOX_ESR_NEXT` = `""` (it becomes the 175 train trigger); tags `FIREFOX_153_5_1esr_BUILD1` and `_RELEASE` exist | product-details.mozilla.org, `gh api …/matching-refs` |
| Node 24 line | v24.22.0 (2026-10-14); packaged runtime is v24.19.0 (`node-runtime.json:3`) | nodejs.org/dist/index.json. The detector's first PR is three releases behind. |
| Hosted runners | `ubuntu-latest` = 24.04 (glibc 2.39, a useful portability target); `ubuntu-26.04` available; `macos-26`/`macos-latest` = arm64 | actions/runner-images README |
| Live repo controls | 0 rulesets, 0 environments, 0 Releases, immutable releases disabled, fork-PR approval `first_time_contributors` (**must become all external contributors before the runner registers**), org plan `free` | `gh api` 2026-10-20 |
| Liveness Worker's runner check | `GET /repos/.../actions/runners` needs admin-level permission (403 for a normal token) | gh api. Give the bot App "Administration: read", or let the runner App answer it. |

## SEED-002 "Unverified" list: status

| Item | Status | Evidence |
|---|---|---|
| MAR symlink claim | **Open**. It needs `find <stage> -type l` on a fresh package. | — |
| signmar Nix closure on a hosted runner | **Resolved (designed out)**: the container-built signmar needs no Nix | `modules/libmar/tool/moz.build:22-34` |
| Mend 30-min cap; Mend runs the nix manager | **Moot**: self-hosted Renovate is used. Mend limits are undocumented, and the nix manager is beta opt-in. | Renovate docs |
| Fine-grained PAT expiry | **Resolved**: infinite lifetime is allowed unless an org or enterprise max-lifetime policy blocks it. The design uses Apps anyway. | GitHub PAT docs |
| Bot commits count as activity for the 60-day rule | **Open but moot**: the docs never define "activity". No `schedule:` remains once Upptime is dropped. | GitHub events docs |
| Pages serves `.well-known` | **Open**: not documented. Test at first deploy; the fallback is a Worker route. | — |
| `gh attestation verify` for anonymous users | **Resolved by test**: with no token, gh refuses and prints the `gh auth login` prompt, but `GET /repos/cli/cli/attestations/sha256:<d>` returns **200 anonymously**. /download should say gh needs a login and offer the bundle + cosign. | local test 2026-10-20 |
| Mozilla partner search codes | Open (not stack) | — |
| Windows updater rename with a live node.exe; Windows background-task path | Open (needs the Windows matrix) | — |
| Azure price and country eligibility | **Resolved**: Basic USD 9.99/month, not prorated; Public Trust for orgs in the US, CA, EU, UK, AU, NZ, JP, KR, SG, CH, NO, IL; free, trial and sponsored subscriptions refused | Artifact Signing quickstart + FAQ |
| Apple certificate validity | **Resolved**: Developer ID certificates are valid 5 years, and timestamped signed apps keep running after expiry. One secondary source says the original Developer ID CA expires 2027-02-01 (**LOW**; check Apple's notice before Phase I). | developer.apple.com/support/developer-id; eclecticlight |
| Dependabot rewrites SHA pins with the comment | **Resolved: yes** | GitHub changelog 2022-10-31 |
| Rulesets on Free public repos | **Resolved: yes**. The docs say so, and live `GET /rulesets` on the Free org returned `[]` rather than an error. | docs.github.com about-rulesets |
| Open Collective fiscal host | Open (not stack) | — |
| Node sidecar egress vs verify-endpoints layer 3 | Open (not stack) | — |
| nixpkgs cctools/apple-sdk macOS cross | **Replaced**: Mozilla bootstrap does it, in tree. A live build is still unproven. | `bootstrap.configure:188-250` |
| Gecko WebGL on WSLg | Open (not stack) | — |
| Flathub build-from-source for a repack | **Resolved: the rule applies**. "All source available submissions must be built entirely from source code", and exceptions for well-known vendors are case by case. There is no network during builds, and the PolyForm NC licence is not addressed. | docs.flathub.org requirements |
| Cachix PolyForm NC eligibility | **Moot**: no cache is needed (What NOT to add) | cachix.org/pricing |
| 500 MB artifact cap on public repos | **Partly**: the limits page lists 500 MB storage for Free, while the billing page says Actions are free on public repos and describes storage caps for private repos. Treat it as unmetered, keep `retention-days: 1`, and measure on the first run. | GitHub limits + billing docs |
| `_redirects` against the 11-segment update path | **Resolved on paper**: every URL substitution is `encodeURIComponent`'d (`upstream/toolkit/modules/UpdateUtils.sys.mjs:114`), so there are no raw slashes. A rule such as `/update/6/:product/:version/:build/:target/:locale/:channel/*  /:channel/:target/update.xml  200` is in-spec (same-site 200, single-segment placeholders, multi-segment splat). One live probe is still required. | Pages redirects docs; `build/application.ini.in:55` |

**New open items this research adds:** whether Apple's SDK licence permits the legion cross build (LOW, legal); the github-runner 30-day update rule against nixpkgs lag (MEDIUM); rcodesign has had no release since 2024-11 (MEDIUM); and the toolchain-baseline meaning changes once releases build in the container rather than the flake (decide which toolchain `toolchain-baseline.txt` pins).

## Sources

- Upstream tree (pinned 153.5.0esr): `taskcluster/scripts/misc/build-sysroot.sh:19-22`; `taskcluster/kinds/toolchain/{sysroot.yml,macos-sdk.yml,misc.yml}`; `build/moz.configure/bootstrap.configure:188-250`; `docs/contributing/build/working_with_esr_115.md:62-86`; `tools/signing/macos/mach_commands.py:23-170`; `modules/libmar/tool/moz.build`; `toolkit/modules/UpdateUtils.sys.mjs:114`; `build/application.ini.in:55`; `taskcluster/docker/debian-build/Dockerfile` (HIGH)
- nixpkgs @ ffb3c9b7: `nixos/modules/services/continuous-integration/github-runner/options.nix`; `pkgs/by-name/fl/floorp-bin-unwrapped/package.nix` (HIGH)
- anthropics/claude-code-action v1.0.254: `action.yml`, `docs/security.md`, `src/entrypoints/run.ts` (HIGH); Claude API model table via the claude-api skill (HIGH)
- [GitHub: events that trigger workflows](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows); [PAT docs](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens); [Actions limits](https://docs.github.com/en/actions/reference/limits); [Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions); [About rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets); [Immutable releases](https://docs.github.com/en/code-security/supply-chain-security/understanding-your-software-supply-chain/immutable-releases); [Dependabot comment updates](https://github.blog/changelog/2022-10-31-dependabot-now-updates-comments-in-github-actions-workflows-referencing-action-versions/); [disable runner auto-update](https://github.blog/changelog/2022-02-01-github-actions-self-hosted-runners-can-now-disable-automatic-updates) (HIGH); [runner enforcement report](https://devops.com/github-actions-gets-serious-about-self-hosted-runner-versions/) (MEDIUM)
- [Cloudflare Workers limits](https://developers.cloudflare.com/workers/platform/limits/); [Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/); [D1 limits](https://developers.cloudflare.com/d1/platform/limits/); [Pages redirects](https://developers.cloudflare.com/pages/configuration/redirects/); [Pages→Workers migration](https://developers.cloudflare.com/workers/static-assets/migration-guides/migrate-from-pages/) (HIGH)
- [Renovate nix manager](https://docs.renovatebot.com/modules/manager/nix/); [Mend hosted apps config](https://docs.renovatebot.com/mend-hosted/hosted-apps-config/); [Mend job scheduling](https://docs.renovatebot.com/mend-hosted/job-scheduling/) (HIGH)
- [Azure Artifact Signing FAQ](https://learn.microsoft.com/en-us/azure/artifact-signing/faq); [quickstart](https://learn.microsoft.com/en-us/azure/artifact-signing/quickstart) (HIGH); SKU price via [Azure pricing](https://azure.microsoft.com/pricing/details/artifact-signing/) search result (MEDIUM)
- [jsign](https://github.com/ebourg/jsign); [Flathub requirements](https://docs.flathub.org/docs/for-app-authors/requirements); [Cachix pricing](https://www.cachix.org/pricing); [Apple Developer ID](https://developer.apple.com/support/developer-id); [eclecticlight on signing certificates](https://eclecticlight.co/2026/01/20/is-that-signing-certificate-still-valid/) (MEDIUM-LOW for the 2027 CA claim)
- Live: `gh api` on DeBIOS-Foundation/powerbrowser (repo controls), product-details.mozilla.org, nodejs.org/dist/index.json, actions/runner-images README, and an anonymous `gh attestation verify` test (HIGH)
