# Project Research Summary

**Project:** Power Browser, milestone v1.6 "Deployment setup"
**Domain:** Release, signing, self-update hosting, upstream-tracking automation and an AI fixer for a single-owner Gecko-ESR + Theia patch-set browser
**Researched:** 2026-10-20
**Confidence:** MEDIUM overall. In-tree and upstream-source findings are HIGH (the critic re-checked 24 claims and confirmed 20). GitHub and Cloudflare platform mechanics are HIGH to MEDIUM, from official docs. Cross-toolchain builds and signing are MEDIUM: they are documented and present in the tree but have never been run. Prices, the CVE and the incident reports are MEDIUM to LOW.

Inputs: STACK.md, FEATURES.md, ARCHITECTURE.md, PITFALLS.md and CRITIQUE.md in this directory. Every item in CRITIQUE.md §5 is applied. Where the critic refuted a claim, the corrected fact is used here.

## Executive Summary

v1.6 turns a browser that is already built into one that ships itself. The pieces are per-OS packages on GitHub Releases, signed MARs, a static update descriptor on Cloudflare Pages, and a two-week ESR cadence. The owner's work per release is one PR merge and one environment approval. Comparable browsers (Zen, Floorp, Mullvad) all work the same way: release assets on a forge, one static `update.xml` per build target in a separate repo, a hold/withdraw descriptor, and one tracking record per release. None of them runs a single orchestrator across ESR, Theia and Node, and none runs an AI fixer. Those two owner additions set Power Browser apart, and they are also its largest new attack surface.

Recommended approach:
- Build release binaries with Mozilla's own `--enable-bootstrap` toolchains, inside a Debian podman container on legion. This gives a Linux build against the jessie sysroot (glibc 2.19). It also cross-builds Gecko for Windows and macOS without a Mac or Windows host.
- Sign only on GitHub-hosted runners, behind a `release` environment that the owner approves.
- Make `release-train.yml` an idempotent reconciler. A run starts in one of three ways: the Cloudflare Worker (which is only a clock), a single-level `workflow_run`, or the owner. Each run re-derives every release's state from GitHub facts, makes at most one transition, and re-renders one tracking issue per release.
- Run the Claude fixer as three jobs: fix → fix-gate → fix-pr. Claude never holds a write credential, and the bot App has no `workflows` permission.
- Change patches only through a new regeneration script. Its byte-equality row makes "regenerate, never text-edit" a gate that can fail, not just a line in the prompt.

Key risks and mitigations:
1. **Prompt injection reaching a write token** (the Clinejection class). Split credentials across jobs, give each token an explicit scope, and have triage post only fixed templates.
2. **Same-repo branches or bot pushes reaching the self-hosted runner.** No App gets `workflows`. Add a legion pre-job hook. Put a branch policy on every environment. Require fork approval for all external contributors before the runner is registered.
3. **Windows or macOS packages carrying Linux Theia natives.** This is confirmed in the tree: `package-linux.sh:60` hard-codes `linux-x64`. Build the sidecar per OS on hosted runners.
4. **Rollback within one ESR version.** The client accepts an older buildID at the same version (`UpdateService.sys.mjs:1954-1962`). Add a check that the descriptor's buildID only increases.
5. **The clock stopping without anyone noticing.** Add an external watchdog.

External gates set the order of the later phases: D-U-N-S and Apple enrolment, Azure identity validation, and the ESR calendar.

## Key Findings

### Recommended Stack

**Build:**
- Releases do not build in the Nix shell. They build in a Debian bookworm container under the podman already on legion (`/etc/nixos/configuration.nix:657`), with `--enable-bootstrap`.
- Bootstrap fetches Mozilla's clang, rust, cbindgen and sccache, plus the jessie sysroot (`upstream/taskcluster/scripts/misc/build-sysroot.sh:19-22`). That removes the `/nix/store` interpreter and GLIBC_2.42 problem at its source.
- The same build produces `signmar`, so the sign job needs no Nix.
- The Windows cross build is the two-line mozconfig documented in the tree (`working_with_esr_115.md:62-86`).
- The macOS cross build gets the SDK from Apple's CDN through `unpack-sdk.py` (`bootstrap.configure:188-250`). Whether Apple's SDK licence allows a cross build is an open LOW item. Hosted `macos-26` runners are the fallback.

**Automation and hosting:** GitHub automation uses GitHub Apps and no PATs. Cloudflare Free hosts the clock Worker, `/events` with D1, Pages and R2.

**Core technologies:**
- **Mozilla bootstrap toolchains in a podman container on legion.** Portable Linux build, plus Gecko cross builds for Windows and macOS. Mozilla ships Firefox with the same toolchains.
- **`signmar` from that build, plus Ubuntu `libnss3-tools`.** MAR signing on `ubuntu-latest` with no Nix.
- **jsign 7.6 + Azure Artifact Signing Basic.** Windows Authenticode from Linux. About USD 9.99/month. US organizations are eligible. Free, trial and sponsored subscriptions are refused. Identity validation takes 1-20 business days.
- **rcodesign 0.29.0 via `./mach macos-sign --use_rcodesign`** (`tools/signing/macos/mach_commands.py:103-134`). macOS signing and notarization from Linux. There has been no release since 2024-11. Fallback: Apple's own tools on a hosted `macos-26` runner.
- **GitHub Apps.**
  - `powerbrowser-bot`: Contents, PRs and Issues read/write; Administration read; Dependabot alerts read; **no Workflows**.
  - A clock App for the Worker: Actions read/write only.
  - App keys do not expire, and App tokens let bot PRs run CI without a click.
- **GitHub actions, all pinned by SHA, with the repo setting `sha_pinning_required: true`:**
  - `actions/create-github-app-token` v3.3.0, which takes per-step `permission-*` inputs and revokes the token at job end.
  - `actions/checkout` v7.0.1, bumped from the current v4.4.0.
  - upload/download-artifact v7/v8, with `retention-days: 1`.
  - `attest-build-provenance` v4.2.2.
- **`anthropics/claude-code-action`, pinned by commit `db77d4d3c98f3f6380e7cd45ffba2342a3dbde3c`** (v1.0.254). Do not pin `c335fd6d`, which is the tag object. Pin Claude Code itself with `path_to_claude_code_executable`.
- **Dependency updates:** self-hosted `renovatebot/github-action` v46.3.9, dispatched by release-train and using the bot App token. This is recommended over Mend and is an owner decision. Dependabot handles alerts and security updates, CodeQL runs in default setup, and zizmor `--offline` is a quick row.
- **Cloudflare Workers Free**, with `universal-github-app-jwt` 2.2.2 and the App key converted to PKCS#8. Free-plan limits: 10 ms CPU per invocation (cron included), 50 subrequests, 5 cron triggers per account, 100k requests per day. The Worker is only a clock.

**Do not add:**
- Cachix / INF-05. The flake repacks the release tarball with `fetchurl` and autoPatchelf and compiles nothing (correction 18).
- Nix in the sign job.
- Octokit in the Worker.
- `mach repackage flatpak`. It refuses any product other than Firefox and Thunderbird (`flatpak.py:186-191`).
- `--generate-notes`.
- The `default:` on the `tag` input of `rebase-upstream.yml`. Delete it, and change `verify-upstream-pins.mjs:10-36` to assert that it is absent. Otherwise every ESR bump edits a workflow file, and an App without the Workflows permission cannot push that commit (correction 1).

### Expected Features

**Must have (table stakes, needed for the first public Linux release):**
- **Release identity:**
  - one derived channel name (UPD-01)
  - a `[product].revision` field and tags of the form `v<ESR>-<rev>` (REL-01)
  - the pin on the current ESR security release, which is 153.5.1esr now
- **Package and trust path:**
  - a portable Linux tarball (PKG-17)
  - a complete MAR with signature enforcement plus an offline secondary key (SEC-05, regenerated patch 030)
  - one descriptor per build target (UPD-04)
- **Update UI** (UPD-08): "Restart now / Later", a cant-apply message, and an error with "Check again". It goes only through PowerBrowserAPI. `SHELL_MESSAGE_KINDS` at `PowerBrowserAPI.sys.mjs:295` gains three kinds.
- **Withdraw without deleting** (REL-02). Immutable releases lock assets and the tag, and a deleted release's tag name can never be reused. The fix is always a new revision.
- **Repo controls, in place before the runner exists:**
  - rulesets, which are available on Free public repos (correction 4)
  - environments with branch policies
  - fork approval for all external contributors
  - issue forms and SECURITY.md
- **Pin-bump automation** (AUTO-01) and the release-train core, so the owner's work per release is one merge and one approval.
- **Update proof:** a real N → N+1 hop drill (UPD-06), and a channel-live check that the public descriptor matches the repo copy byte for byte (UPD-07, as Floorp does).
- **Website and services:** /download, /privacy, security.txt, Email Routing, and opt-in `/events`.

**Should have (differentiators):**
- **TRAIN:**
  - one tracking issue per release, rendered from facts
  - a supersede rule
  - a second ESR major run as a parallel train
  - failure routing
  - a pinned maintenance issue
  - dry-run on every stage
  - self-tests
- **FIX:** the Claude fixer for patch-replay conflicts, red Theia or Node bump PRs, and a red `main`. It only opens PRs, makes at most 2 attempts per class per release, and is spend-limited.
- **GH-03:** Claude triage with Haiku and template-only output.
- **GH-04:** a Codeberg mirror whose health the maintenance sweep checks.
- **AUTO-02:** a grouped Renovate PR for Theia.
- **AUTO-04:** a Node detector that verifies SHASUMS and their signature inside the job.

**Defer (v2+ or later phases):**
- Partial MARs. Zen ships complete MARs only at this cadence.
- Flathub. Its build-from-source rule applies, so PKG-20 is out of this milestone.
- MSI, MSIX, PKG and Snap.
- A nightly channel.
- Native crash reporting (Phase K, optional).
- An Upptime status page. It is optional; the requirement is the watchdog, not Upptime.

**Corrections to SEED-002:**
- Item 18 (the Mozilla-mark gate) is PARTIAL, not missing. `verify-trademark-surface.mjs` already exists. The gap is NSIS, application.ini Name/Vendor, and Info.plist (correction 8).
- PRs created with GITHUB_TOKEN create runs that need approval; they do not create no runs. The App is still needed for unattended CI (correction 9).

### Architecture Approach

**Shape:**
- `release-train.yml` is thin YAML over `scripts/release-train.mjs`. That script has three pure functions, `derive(facts) → state`, `next(state) → action` and `render(state) → issue body`, plus a `--self-test` over fixture JSON.
- State is never stored. The tracking issue is a view, and fixer attempts are counted from labelled PRs.
- A human gate ends a run, and the next wake-up picks up from there.
- `release.yml` runs only on dispatch:
  1. build-linux on legion, with no secrets
  2. sign-publish on `ubuntu-latest` in env `release`
  3. descriptor in env `descriptor`, behind a wait timer
  4. channel-live

**Wake-ups:**
- the Worker's hourly `workflow_dispatch`
- an owner dispatch
- a self-dispatch through the GITHUB_TOKEN with `actions: write`
- a single-level `workflow_run` from verify.yml or release.yml

Every `workflow_run` job checks `head_repository.full_name == github.repository`. No workflow started by `workflow_run` may itself be a `workflow_run` source (correction 14).

**Concurrency:** one `release-train` group with the default single pending run. No `cancel-in-progress`, no `queue: max`. The fixer has its own group.

**Major components:**
1. **Scheduler Worker** (its own repo; on workers.dev first). Every hour it mints a clock-App token, issues one dispatch, and sends an email if the dispatch fails. Detection, liveness, pin-age and descriptor delay all move to Actions (correction 10). This amends SEED-002 automation rows 1, 4, 7 and 13 and is an owner decision.
2. **`release-train.yml` + `release-train.mjs` + `detect-upstreams.mjs`.**
   - Jobs: derive, detect, bump (rebase-upstream.yml through `workflow_call`), bump-pr (env `bot`), fix, fix-gate, fix-pr, dispatch-release, maintenance, and report. Report is the only writer of issues, using the GITHUB_TOKEN with `issues: write`.
   - The ESR detector lists `FIREFOX_<pinned major>_*esr_RELEASE` tags and uses product-details only as a cross-check. Its self-test includes a fixture for the flip to 175 (correction 11).
3. **`release.yml`.**
   - build-linux runs on `[self-hosted, powerbrowser-release]` with contents:read and no environment.
   - sign-publish uses env `release`, with the owner as reviewer and a branch policy of `main` only (correction 12).
   - descriptor uses env `descriptor`, with a 1440-minute wait timer and an App token scoped to `powerbrowser-updates`.
   - channel-live runs last.
4. **Fixer chain.**
   - `fix`: env `fixer`, a read-only GITHUB_TOKEN, and the Anthropic credential. The target is checked out into `work/`, never into the workspace root.
   - `fix-gate`: no secrets. It applies the path deny list, `regenerate-patches.sh --check`, the apply non-vacuity check, the patch-surface check, the brand scan, `diff-theia-core.sh` and `--quick`.
   - `fix-pr`: env `bot`, and the only job that holds an App token.
   - Failures in release.yml (build, signing, publish) only open an issue. They never go to the fixer (correction 2).
5. **`scripts/regenerate-patches.sh`** (one script, one row named `patches-regenerated`). It rebuilds each patch with `git -C upstream diff --abbrev=10` over that patch's own `+++ b/` paths. It must not use `--full-index`, so that `index` lines stay 10-hex as in `patches/010:2`. `--check` byte-compares the result with the tracked patch (correction 7, C11).
6. **Static and live gates.**
   - `verify-workflows.mjs` is a quick row and also serves as the trust-boundary check. It asserts:
     - no `schedule:` key
     - the legion label in exactly one job
     - no cache in the release path
     - claude-code-action only on hosted runners and without App tokens
     - SHA pins
     - guarded `workflow_run`, and no chaining
   - `repo-controls` is a full row, not quick.
   - `renewals` (quick, structure only) is separate from `renewals-due` (run by the maintenance sweep) (correction 13).
7. **Watchdog outside the product repo.** A `schedule:` workflow in `powerbrowser-updates` checks that the last release-train run is less than 26 hours old (C10). D-77 binds only the product repo.

### Critical Pitfalls

1. **Prompt injection reaching a write token** (Clinejection, 2026-03).
   - Use the three-job split.
   - Never allow bare `Bash`. Use an explicit allowlist, and deny Edit/Write on `patches/**`.
   - Build prompts only from trusted fields, and lock tracking issues.
   - Keep `show_full_output` off, and never set `ACTIONS_STEP_DEBUG`.
   - Only triage sets `allowed_non_write_users`. It uses an explicit GITHUB_TOKEN with `issues: write` only, and a non-AI step posts only fixed templates (correction 3).
   - `allowed_bots` gets an explicit list, never `'*'`.
2. **The fixer weakens a gate or text-edits a patch.**
   - fix-gate rejects any diff that touches: `.github/**`, `.claude/**`, CLAUDE.md, `verify-platform.sh`, any file a CHECKS row names (derived by parsing the registry), `patches/030-*`, `packaging/mar/**`, `brand/mar-*.der`, `inventory/brand-tokens.json`, the allowlists, `quick-baseline.txt`, `toolchain-baseline.txt` or `flake.lock`.
   - `patches-regenerated` catches hand edits.
3. **The self-hosted runner can be reached from same-repo branches.**
   - No App gets `workflows`.
   - A legion `ACTIONS_RUNNER_HOOK_JOB_STARTED` hook rejects every job except `release.yml@refs/heads/main`. If runner-group "selected workflows" is unavailable on Free, this hook is the only control bound to the runner itself.
   - Every environment gets a branch policy, and `repo-controls` asserts that none has a `null` policy.
   - Fork approval for all external contributors is in place before the runner is registered.
4. **Cross-OS sidecar natives and cache poisoning.**
   - Build Theia per OS on hosted Windows and macOS runners, and extend `node-runtime.json` per target.
   - Add a `package-target-natives` row in Phase C (correction 15).
   - Use no Actions cache anywhere in the release path. The INF-04 hosted fallback build runs cold, which amends SEED-002 checklist item 22 (correction 17).
5. **Same-ESR rollback and orchestration mechanics.**
   - Add a `descriptor-monotonic` row: the buildID must strictly increase per appVersion, and rollback happens only through an owner-dispatched `--rollback-to`.
   - Do not pin `MOZ_BUILD_DATE` to the ESR tag (correction 16).
   - App tokens expire after 1 hour, so mint each one just before it is used.
   - The sign job exits if a newer Release already exists. This handles stale approvals.
   - Check the draft's asset set before the single publish.
   - A self-hosted job is cancelled after 24 hours in the queue; it does not wait forever (correction 6). Fix `docs/RELEASING.md:909-910`.

**Also:**
- macOS signing must not reuse `firefox.browser.xml:31-35`, which carries Mozilla's Team ID `43AQ936H96` and the restricted passkey entitlement. Add a `mac-entitlements` row, and sign inside-out, including `node`, every `.node` file and `rg`.
- The MAR channel embedded in the build must match `ACCEPTED_MAR_CHANNEL_IDS` before `signmar -s` runs.

## Implications for Roadmap

The phases follow SEED-002 A-L. The orchestrator starts as a skeleton in A and gains stages in D and E. The fixer lands in F, once the states it reacts to exist. The regeneration script the fixer needs lands in A.

**External gates:**
- **ESR calendar:**
  - 153.6 on 2026-10-27, then every two weeks
  - ESR 175: nightly 2027-05-27, beta 2027-06-10, release 2027-06-29
  - 153 ends 2027-09-07, so the last 153.x security release must not ship before 175.x has shipped
- **D-U-N-S, then Apple enrolment:** a long lead time. Request it now; it costs nothing. The site must be live for the fee-waiver application.
- **Azure:** identity validation takes 1-20 business days, and billing starts when the account is created. Create the account when Phase H is 3-4 weeks out.
- **Owner ceremonies:** the secondary MAR key (B), creating and installing the Apps (A), registering the runner (E), and every `release` approval.

### Phase 0 (owner, now): external steps with no cost
**Delivers:**
- the D-U-N-S request
- the Cloudflare account

The Worker can run on workers.dev before the DNS move, so the clock does not wait for Phase D.

### Phase A: Release identity, repo controls, regeneration, train skeleton
**Rationale:** Until detection and bump PRs are automatic, every two-week cycle costs the owner time. Repo controls must exist before any App or runner.

**Delivers:**
- **A1:** a hand bump to `FIREFOX_153_5_1esr_RELEASE`. This is also the first real run of rebase-upstream.yml.
  - Fix R1: `rebase-upstream.yml:108-115` runs generate outside Nix, while verify.yml:14-20 requires the pinned inkscape.
  - Delete the `tag` default.
- **A2:** UPD-01, REL-01, UPD-02/03, PKG-08/09.
- **A3:** GH-02 and SEC-01 fork approval.
  - settings bodies and rulesets
  - environments `release`, `bot`, `fixer` and `descriptor`, all with branch policy `main`
  - the Actions allow-list plus `sha_pinning_required`
  - the Apps, without Workflows
  - the runner-group probe
  - the `repo-controls` full row
- **A4:** `regenerate-patches.sh` and the `patches-regenerated` row.
- **A5:** AUTO-01 plus the TRAIN-01/02/08 skeleton.
  - jobs derive, detect, bump (through `workflow_call`), bump-pr and report, plus the conflict issue
  - `verify-workflows.mjs`
  - the scheduler Worker on workers.dev
- **A6:** AUTO-04, the Node detector.
- **A7:** GH-01 and DOC-01.
  - split RENEWALS
  - doc fixes R2-R6, including RELEASING.md:909-910 and the four-week cadence text

**Avoids:** Pitfalls 2, 4, 8, 10.
**Exit test:** 153.6 or 153.7 arrives as a bot PR with a tracking issue, and the owner dispatched nothing.

### Phase B: Trust path
**Delivers:**
- the SEC-05 secondary-key ceremony
- patch 030 regenerated with A4's script
- the UPD-04 `build-update-xml.mjs` CLI, which imports `buildUpdateXml` from `verify-mar-update-hop.mjs:109`
- the `descriptor-monotonic` row

**Depends on:** A4. **Gate:** the owner ceremony. **Avoids:** Pitfall 7.

### Phase C: Portable, updatable Linux package
**Delivers:**
- PKG-06 first: Theia state moves under the profile. It blocks the matrix rows.
- PKG-17, the container build. It is the longest single item, so start it early.
- PKG-18 as the `sidecar-no-symlinks` row only. 0 symlinks are confirmed today.
- RUNPATH stripped from the natives.
- UPD-08, PKG-04/05/07, and the UPD-05 allowlist pass.
- PKG-21: measure the MAR size.
- The `package-target-natives` row.
- The macOS cant-apply copy.

**Depends on:** A2. **Avoids:** Pitfall 6 (the row is written here).

### Phase D: Hosting, site, telemetry, clock watchdog
**Delivers:**
- INF-01, the DNS move. It is a manual owner step; keep SEED-002's text (Namecheap inventory, DNSSEC off, mail forwarding).
- DIST-03, the updates host, plus a live `_redirects` probe on the 11-segment path.
- INF-02 Email Routing, TEL-06/08 and WEB-01.
- security.txt through Cloudflare's zone-level security.txt feature, which avoids the open question of whether Pages serves `.well-known`.
- INF-03 becomes the maintenance sweep (the first part of TRAIN-07) plus the external watchdog in `powerbrowser-updates`.
- A check that the updates repo has no `functions/` and no `_worker.js`.

**Depends on:** A5. **Unblocks:** the Apple fee-waiver application.

### Phase E: First public Linux release (train complete for Linux)
**Delivers:**
- DIST-02, `release.yml`.
  - Register the runner only after fork approval, the pre-job hook and the branch policies are in place.
  - Runner shape defaults to SEED-002 decision 2: non-ephemeral, a one-time registration token, no credential on legion (C6).
- Train states BUILDING through DONE, and the `descriptor` wait-timer environment.
- REL-02 withdraw, the UPD-06 hop drill, and UPD-07 channel-live.
- AUTO-05, the toolchain baseline.
- INF-04, a cold hosted fallback build, measured.
- Artifact storage measured against the 500 MB cap, with artifacts deleted after sign-publish.

**Depends on:** B, C, D. **Avoids:** Pitfalls 4, 5, 8.

### Phase F: Upstream flow + Claude fixer
**Delivers:**
- AUTO-02 Renovate: self-hosted and dispatched by the train, if the owner accepts.
- AUTO-03 Dependabot and CodeQL, DIST-05, UPS-02, and TRAIN-04/06/07/09.
- FIX-01..07:
  - the fix → fix-gate → fix-pr chain and the `fixer` environment
  - the pinned action commit and pinned Claude Code
  - four spend layers: the Console workspace cap, `--max-turns`, `timeout-minutes`, and 2 attempts plus a concurrency group
  - recursion guards on `claude-fix/*` heads and on the bot actor

**Depends on:** A4, A5, E.
**First real exercise:** the red Theia 1.77 PR, which needs TypeScript 6 while `theia/package.json:64` pins `~5.9.3`. The fixer must be proven before 2027-05-27.
**Avoids:** Pitfalls 1, 2, 3.

### Phase G: Support operations
**Delivers:**
- TEL-05, "Report a Bug" and "Copy diagnostics"
- GH-03 triage: `triage` environment, Haiku, template-only output
- GH-04 Codeberg mirror. The legion timer stays, and the sweep compares Codeberg `main` with GitHub `main` (C12).
- MON-02, optional

**Carried forward unresearched:**
- the private vulnerability reporting route
- the KNOWN-ISSUES pinned issue
- the security-notice atom feed (row 16), which the sweep can absorb

### Phase H: Windows
**Delivers:**
- PKG-10..13
- UPD-09: the sidecar reap blocks quit
- LEG-01: the NSIS, application.ini and Info.plist gap
- MTX-01, the libvirt test matrix
- a per-OS sign job: jsign on the inner binaries, then the installer, then the MAR
- per-target descriptors
- the Theia build on a hosted Windows runner

Ship unsigned first.
**Depends on:** E. **Gate:** Azure validation.

### Phase I: macOS
**Delivers:**
- PKG-14..16 and SEC-04
- a universal build through `unify.sh`, with the per-arch Theia natives merged by `lipo`
- the `mac-entitlements` row
- inside-out signing and notarization

Check the claim that the Developer ID CA expires 2027-02-01 before starting.
**Depends on:** D, the D-U-N-S number and Apple enrolment.

### Phase J: Package channels
**Delivers:**
- DIST-04
- PKG-19, the flake repack using the floorp-bin pattern. Merge `DisableAppUpdate` into the existing policies.json, because EXT-03 lives in that file.
- a Homebrew tap and winget

PKG-20 Flathub stays deferred. No INF-05.
**Depends on:** E (and I for darwin).

### Phase K (optional): Native crash reporting
TEL-09/07, only if the crash exclusion is retired. Depends on H.

### Phase L: ESR 175
**Delivers:**
- UPS-01, with TRAIN-05 running the second line in parallel
- from the 175 beta (2027-06-10), replay-only bump runs, so conflicts show up early
- the fixer working on `chore/esr-175` while 153.x trains continue under separate keys
- 175.x shipped before 153.27 (2027-09-07)

**Depends on:** F proven, and A's tag-based detector.

### Phase Ordering Rationale
- The train skeleton and the regeneration script come first. Without them the owner pays time every two weeks, and every later automation depends on them.
- B and C are prerequisites of any public artifact. D gives the descriptor a host and starts the Apple clock. E closes the Linux loop.
- The fixer waits for E so that the states it reacts to exist. It must be proven before the 175 window, which is when patch conflicts peak.
- H and I are gated by external accounts, not by code.

### Research Flags
**Needs `/gsd-plan-phase --research-phase`:**
- **A3:** whether runner-group "selected workflows" exists on Free (needs an owner-admin probe), and whether the App's missing `workflows` permission blocks workflow-file pushes (MEDIUM; community sources only).
- **C (PKG-17):** the first container bootstrap build; whether the jessie-built signmar runs on ubuntu-latest; what toolchain-baseline means under a container build.
- **E:** the artifact storage cap; the environment approval timeout; the github-runner 30-day update rule against nixpkgs lag.
- **F:** whether passing `github_token` suppresses the action's OIDC App exchange, which decides WIF vs `ANTHROPIC_API_KEY` (C4); whether a Theia yarn.lock regeneration fits the chosen Renovate host.
- **H:** the Windows updater rename with a live node.exe, the background-task path, and the MTX-01 libvirt design.
- **I:** the Apple SDK licence, whether rcodesign is still viable, and the Developer ID CA date.
- **L:** 175 patch drift, and whether product-details adds a `FIREFOX_ESR153` key.

**Standard patterns, no research needed:** A1/A2 generator work, the A5 report protocol, A6, A7, B, the D site and Email Routing, G, and the J flake (floorp-bin template).

## Confidence Assessment

| Area | Confidence | Notes |
|---|---|---|
| Stack | MEDIUM-HIGH | Versions and SHAs were read live. The toolchain and signing paths are in the tree, but no build was run. The Azure price comes from a search snippet. |
| Features | MEDIUM-HIGH | Competitor workflows were read through gh api. Some LibreWolf and Waterfox claims are LOW. |
| Architecture | HIGH in-tree / MEDIUM platform | All file:line references were re-read. The verify.yml citation is corrected to :14-20 (correction 21). |
| Pitfalls | MEDIUM | The upstream-source pitfalls (6, 7, 11) are confirmed in the tree. The incident reports are secondary. Its Unverified list was stale and is replaced by the table below. |

**Overall confidence:** MEDIUM

### SEED-002 "Unverified" list: consolidated status (correction 22)

| Item | Status |
|---|---|
| MAR symlink claim | Resolved: false. The 2026-10-17 tarball has 0 symlinks. Keep the `sidecar-no-symlinks` row |
| signmar Nix closure on a hosted runner | Designed out by the container-built signmar. Still unmeasured: the jessie-built signmar running on ubuntu-latest |
| Mend 30-min cap / nix manager | Limits resolved (1 job, 1 vCPU, 3 GB, 15 GB disk, 30 min). Whether a yarn.lock regeneration fits is open. Moot if Renovate is self-hosted |
| Fine-grained PAT expiry | Resolved: org default maximum is 366 days. Moot, since the design uses Apps only |
| Bot commits and the 60-day rule | Open. Matters only to the watchdog repo |
| Pages serving `.well-known` | Open, and avoided by zone-level security.txt |
| Anonymous `gh attestation verify` | Resolved: gh needs a login. /download offers `--bundle` + cosign |
| Mozilla partner search codes | Open |
| Windows updater rename / background task | Open (Phase H) |
| Azure price / eligibility | Resolved (MEDIUM) |
| Apple certificate validity | Resolved (MEDIUM): 5 years. The CA-expires-2027-02-01 claim is LOW |
| Dependabot rewriting SHA-pin comments | Resolved: yes, except compound comments |
| Rulesets on Free public repos | Resolved: yes |
| Open Collective as a fiscal host | Open |
| Sidecar egress vs verify-endpoints layer 3 | Open |
| nixpkgs cctools/apple-sdk | Replaced by Mozilla bootstrap. A live build is unproven |
| WebGL on WSLg | Open |
| Flathub repack | Resolved: the build-from-source rule applies. Deferred |
| Cachix eligibility | Moot (no cache) |
| 500 MB artifact cap on public repos | Open: measure on the first run |
| `_redirects` vs the 11-segment path | Resolved on paper. One live probe is still required |

### Gaps to Address

**Owner decisions to record in REQUIREMENTS:**
1. The Worker is a clock only, which amends SEED-002 rows 1/4/7/13 (C13).
2. The canary wait timer vs "owner hop first". The timer removes that gate, so either add a required reviewer on `descriptor` or accept that the hop drill becomes advisory (C14).
3. Self-hosted Renovate vs Mend (self-hosted recommended; C7), plus decision 4, Theia automerge off.
4. Runner shape: decision 2 (the default) vs ephemeral with an App key on legion (C6).
5. WIF vs an API key for the fixer (C4).
6. Which toolchain `toolchain-baseline.txt` pins under a container build.
7. Whether release-train or release.yml owns any commit of `release.json` (decision 13).

**Carried forward unresearched (keep SEED-002's text as written):**
- decision 13 / `release.json`, and the website deploy
- row 16, the security notice feed
- decision 6, FxA/Sync off, and whether `identity.fxaccounts.enabled` belongs in the generator
- decision 7, the Safe Browsing key, which needs a RENEWALS row and a keyfile mount in the container build
- the INF-01 DNS move
- the private vulnerability reporting route
- the LICENSING.md / THIRD-PARTY-NOTICES generator: the Yarn 1 vs Berry `licenses` command, and the about:license output

**New open items:**
- the runner-group restriction on Free
- whether RS256 JWT signing fits the Worker's 10 ms CPU limit
- whether a `FIREFOX_ESR153` key appears after the flip
- the environment approval timeout
- the github-runner 30-day update rule vs nixpkgs lag
- rcodesign maintenance
- the Apple SDK licence

## Sources

### Primary (HIGH)
- **Tree:**
  - `configuration.toml:115`
  - `rebase-upstream.yml:33,108-115`; `verify.yml:14-20,43,53`
  - `apply-patches.sh:48`; `verify-platform.sh:3563-3565,4629,4725`
  - `patches/010:2`; `patches/030:28-31`
  - `package-linux.sh:47,60`; `node-runtime.json:3`
  - `PowerBrowserAPI.sys.mjs:295`; `verify-trademark-surface.mjs`
- **Upstream:**
  - `UpdateService.sys.mjs:1954-1962`; `archivereader.cpp:162-164`
  - `UpdateUtils.sys.mjs:114`; `application.ini.in:55`
  - `build-sysroot.sh:19-22`; `taskcluster/kinds/toolchain/{misc,macos-sdk,sysroot}.yml`; `bootstrap.configure:188-250`
  - `working_with_esr_115.md:62-86`; `modules/libmar/tool/moz.build`
  - `firefox.browser.xml:31-35`; `flatpak.py:186-191`
- **Local artifact:** /home/chris/coding/Power-Browser/objdir/dist/powerbrowser-153.5.0.en-US.linux-x86_64.tar.xz (129,529,524 bytes, 0 symlinks).
- **GitHub docs:** events-that-trigger-workflows, actions limits, deployments-and-environments, github_token, about-rulesets, immutable-releases.
- **claude-code-action** `action.yml` and `docs/security.md` at db77d4d3.
- **Cloudflare:** workers limits, pages redirects.
- **Renovate:** mend-hosted overview.
- **Live queries:** gh api, product-details, the nodejs.org index.

### Secondary (MEDIUM)
- Azure Artifact Signing quickstart and FAQ (the price is from a search snippet).
- Apple Developer ID support page.
- github.blog changelogs: 2022-10-31, 2024-10-18, 2026-02-19, 2026-06-26.
- actions/create-github-app-token#301.
- Flathub requirements.

### Tertiary (LOW)
- The Clinejection, PromptPwnd and TanStack write-ups.
- The Zen CVE-2026-41431 snippet.
- LibreWolf and Waterfox forum claims.
- eclecticlight on the 2027 Developer ID CA.

---
*Research completed: 2026-10-20*
*Ready for roadmap: yes*
