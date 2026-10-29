# Roadmap: Power Browser

## Overview

Milestone v1.6 "Deployment setup" (workstream `deploy`, branch `workspace/deploy`) turns a browser that already builds into one that ships and maintains itself with no server. The end state: one installer per OS on GitHub Releases, self-update through Gecko's MAR updater from a static descriptor host, Firefox ESR, Theia and Node tracked by one release-and-maintenance orchestrator (`release-train.yml`), a Claude fixer that proposes fixes as PRs, support on GitHub, opt-in error telemetry, and powerbrowser.org. The owner's steady-state work is one PR merge, one `release` approval and one `descriptor` approval per release, one grouped Dependabot merge per week, and one Theia PR review per month.

Phases follow SEED-002 A to L (letter in each phase name), with the corrections in `.planning/research/v1.6-deploy/SUMMARY.md`. A, C, D, E and F are split into several phases to keep each one executable. Phases 40 to 50 produce the first public Linux release; 51 to 53 complete the automation and support loop; 54 to 58 add Windows, macOS, package channels, native crashes and the ESR 175 move. Phase numbering starts at 40 because main's v1.5 uses 26 to 38.

**Supersedes backlog Phase 999.2.** Backlog Phase 999.2 "Release and distribution" in main's `.planning/ROADMAP.md` (NG-075..NG-082: Windows MSIX, macOS DMG, install matrix and per-OS MAR hop, release pipeline, update host, crash-ingest host) is superseded by this milestone. Main's file is not edited from this workstream; the backlog entry is retired when this workstream merges.

**Owner steps now (no phase, no cost):** request the D-U-N-S number (it gates Apple enrolment, Phase 55) and create the Cloudflare account with 2FA (the Phase 43 Worker runs on workers.dev before the DNS move).

## Milestones

- **v1.6 Deployment setup** — Phases 40–58 (in progress; workstream `deploy`; requirements in `.planning/workstreams/deploy/REQUIREMENTS.md`)

## Hard constraints (every phase)

- Never fork or patch Theia core; never modify Gecko outside the patch stack. Patches change only through `scripts/regenerate-patches.sh` (Phase 40), never by text edit.
- One verification driver, `scripts/verify-platform.sh`. Every new check is one registry row with a `--self-test` that plants each fault and must go red naming the drift; rows derive their expectation from the tree.
- No `schedule:` key in the product repo (D-77). The Cloudflare Worker is a clock only.
- No PAT and no App private key on legion. No App holds the Workflows permission. The fixer never merges, approves an environment or reads signing material.
- User-facing copy names "PowerBrowser" and carries no internal identifier.
- `/etc/nixos` changes (runner, pre-job hook, Codeberg timer, libvirt) finish with `nrs` under `pkexec`.

## Inherited network egress (carried, not decided here)

The imported platform allows exactly three Mozilla hosts, all one feature, Remote Settings (disabling it would also lose CRLite revocation, intermediate preloading and tracking-protection updates): **firefox.settings.services.mozilla.com**, **content-signature-2.cdn.mozilla.net**, and **firefox-settings-attachments.cdn.mozilla.net**. They are named here and in REQUIREMENTS.md because `verify-platform.sh`'s `allowlist-doc-consistency` check requires every allow-dispositioned Mozilla host to be documented in the project's planning record. Any Mozilla host that UPD-15 (Phase 46) dispositions `allow` is added here and in REQUIREMENTS.md in the same commit.

## Phases

**Phase Numbering:**

- Integer phases (40, 41, ...): planned milestone work
- Decimal phases (40.1, ...): urgent insertions (marked INSERTED)

- [x] **Phase 40: Release identity, ESR pin and patch regeneration (A)** - Pin 153.5.1esr; derive release key, channel, update URLs and notices from configuration.toml; patches change only by regeneration (completed 2026-10-22)
- [ ] **Phase 41: Repository controls and GitHub Apps (A)** - Rulesets, environments, Actions policy, Apps and the workflows trust-boundary row, all declared in the tree and read back
- [ ] **Phase 42: Community surface and release documentation (A)** - Labels, issue forms, security and support files, RENEWALS.md and corrected release docs
- [ ] **Phase 43: Release train skeleton and upstream bump automation (A)** - Hourly clock, tag-based ESR and Node detectors, bot bump PRs, one tracking issue per release
- [ ] **Phase 44: Trust path (B)** - Offline secondary MAR key, per-target descriptors, buildID-monotonic descriptor row
- [ ] **Phase 45: Portable Linux release build (C)** - Container bootstrap build producing a Nix-free tarball and complete MAR
- [ ] **Phase 46: In-app update experience and egress pass (C)** - Update notifications and commands through PowerBrowserAPI; allowlist release pass
- [ ] **Phase 47: Hosting, website and mail (D)** - DNS on Cloudflare, static site with download/privacy/legal pages, updates host, Email Routing
- [ ] **Phase 48: Error telemetry, maintenance sweep and watchdog (D)** - /events Worker on D1, pinned maintenance issue, external watchdog
- [ ] **Phase 49: Release pipeline and legion runner (E)** - release.yml: secretless legion build, hosted sign-publish, delayed descriptor, channel-live
- [ ] **Phase 50: Release train stages and first public Linux release (E)** - Train drives a release to DONE; withdraw job; hop drill; first public release
- [ ] **Phase 51: Dependency flow and train supersede (F)** - Renovate Theia group, Dependabot and CodeQL, supersede and chemspill rules, extended sweep
- [ ] **Phase 52: Claude fixer (F)** - fix, fix-gate, fix-pr chain with deny list, spend limits and a live proof
- [ ] **Phase 53: Support operations (G)** - Report a Bug command, Claude triage, security routing, Codeberg mirror, status page
- [ ] **Phase 54: Windows (H)** - Cross-built NSIS installer and MAR, VM matrix, unsigned first release, then Authenticode
- [ ] **Phase 55: macOS (I)** - Universal DMG and MAR, entitlements row, inside-out signing and notarization
- [ ] **Phase 56: Package channels (J)** - Nix flake with binary cache, Flathub, winget, Homebrew tap, per-release manifest PRs
- [ ] **Phase 57: Native crash reporting (K)** - Consent-gated crash ping, minidump store, symbols, crash reporter enabled
- [ ] **Phase 58: ESR 175 (L)** - Early 175 replay, parallel 175 train, 175.x shipped before 153.27

## Phase Details

### Phase 40: Release identity, ESR pin and patch regeneration (A)

**Goal**: The tree is on the current ESR security release, every release identity fact (release key, update channel, version files, update and release-notes URLs, licence notices) derives from `configuration.toml`, a patch can change only through regeneration, and `rebase-upstream.yml` replays the pin green inside Nix as a callable workflow.
**Depends on**: Nothing (first phase of the milestone)
**Requirements**: DIST-06, AUTO-08, REL-01, UPD-11, UPD-12, UPD-13, UPD-33, UPD-25, PKG-08, PKG-09, AUTO-10
**Success Criteria** (what must be TRUE):

  1. `configuration.toml` pins `FIREFOX_153_5_1esr_RELEASE` with `--quick` green (DIST-06 first); then `rebase-upstream.yml` gains `on: workflow_call`, runs `node scripts/generate.mjs` inside `nix develop .#theia`, and its `tag` input has no default, which `verify-upstream-pins.mjs` asserts (AUTO-08); a dispatched run against that tag is green (the workflow's first real run).
  2. The quick rows `release-identity` and `update-channel` are green, and their self-tests go red naming a planted hand-written version literal, a descriptor version that disagrees with the release key, and a `powerbrowser-release` channel in one consumer.
  3. The shipped `policies.json` carries no `AppUpdateURL`; the About dialog's release-notes and fallback links open the pages derived from `[urls]` without throwing; `endpoint-allowlist.json` accepts the `user-initiated` disposition, and a planted unattended prefetch to powerbrowser.org goes red naming the host.
  4. The quick row `patches-regenerated` passes on every tracked patch and goes red naming the patch when a hunk body is hand-edited; the update-prefs row goes red when a planted `app.update.auto` appears in generator output.
  5. `LICENSING.md` and `THIRD-PARTY-NOTICES.txt` are generated with a drift row green, and the README and PROJECT.md state the en-US-only scope.

**External gate**: The executor commits the pin bump (DIST-06) locally; the owner pushes and, after AUTO-08 lands, dispatches the first `rebase-upstream.yml` run with an explicit `tag`.
**Research flag**: None (SUMMARY: A1/A2 generator work is a standard pattern).
**Plans**: 8/8 plans complete

Plans:
**Wave 1**

- [x] 40-01-PLAN.md — DIST-06 pin bump to FIREFOX_153_5_1esr_RELEASE (own commit), then AUTO-08 callable Nix workflow with no tag default

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 40-02-PLAN.md — AUTO-10 regenerate-patches.sh with --check and --self-test; rows patches-regenerated(-self-test); wired into rebase-upstream.sh

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 40-03-PLAN.md — REL-01 [product] revision, releaseIdentity(), tracked version files, release-identity row and self-test

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 40-04-PLAN.md — UPD-11 one channel constant and update-channel row; UPD-12 update-URL policy removed with ng064/mar-update-hop/allowlist changed together

**Wave 5** *(blocked on Wave 4 completion)*

- [x] 40-05-PLAN.md — UPD-33 user-initiated disposition with a shared verdict and fixture self-test; UPD-13 About-dialog link prefs from [urls]

**Wave 6** *(blocked on Wave 5 completion)*

- [x] 40-06-PLAN.md — UPD-25 langpack updates off; update-prefs row and self-test

**Wave 7** *(blocked on Wave 6 completion)*

- [x] 40-07-PLAN.md — PKG-08 generated LICENSING.md and THIRD-PARTY-NOTICES.txt with drift row; PKG-09 en-US scope in README and PROJECT.md

**Wave 8** *(blocked on Wave 7 completion)*

- [x] 40-08-PLAN.md — End-of-phase dev build, full-tier evidence, About-dialog human check, owner push and first rebase-upstream.yml dispatch

### Phase 41: Repository controls and GitHub Apps (A)

**Goal**: Before any App token, bot workflow or self-hosted runner exists, the org and repo enforce every control the pipeline relies on, and each setting is declared in the tree and read back by a row.
**Depends on**: Phase 40
**Requirements**: GH-02, SEC-06, SEC-11, GH-05, GH-06, GH-07, GH-08, GH-09, GH-10, GH-11, GH-12, AUTO-09, GH-18
**Success Criteria** (what must be TRUE):

  1. The full-tier row `repo-controls` is green against the live org and repo (rulesets, the five environments with branch policy `main`, selected actions with `sha_pinning_required`, fork approval for all external contributors, both Apps' permission sets and installation lists), and its self-test goes red on a missing ruleset, a `null` environment branch policy and an App holding Workflows.
  2. A force-push or deletion on `main` is refused, a tag created by anyone but `powerbrowser-bot` is refused, and immutable releases, Discussions, private vulnerability reporting and auto-merge are on while the repo has zero Releases.
  3. The quick rows `workflows` and `zizmor --offline` are green on the tree, and the `workflows` self-test goes red on each planted fault (a `schedule:` key, the legion label outside `release.yml` `build-*`/`matrix-*` jobs, an unadmitted or non-SHA `uses:`, an unguarded `workflow_run`, event text inside `run:` or `prompt:`).
  4. The org requires 2FA, a second owner account exists with offline recovery codes for both, and the runner-group "selected workflows" probe result is recorded in `docs/RELEASING.md`.
  5. One test assignment and one test pending deployment reach the owner's phone, recorded in `docs/RELEASING.md`.

**External gate**: Owner creates the `powerbrowser-updates` and Homebrew tap repos empty in this phase (GH-10 needs both for the bot App installation that `repo-controls` reads back; Phases 47 and 56 fill them), creates and installs both GitHub Apps (bot App on `powerbrowser`, `powerbrowser-updates` and the tap repo; clock App on `powerbrowser`), adds the second org owner and stores recovery codes offline, and runs the runner-group probe as org admin.
**Research flag**: Yes (A3): whether runner-group "selected workflows" exists on the Free plan; whether the App's missing Workflows permission blocks pushes that touch workflow files.
**Plans**: 3/4 plans executed

Plans:
**Wave 1**

- [x] 41-01-PLAN.md — GH-02 controls table, apply script (dry-run default, --yes from the owner's terminal only) and repo-controls rows; Actions policy, fork approval, repo flags, zero secrets; main-integrity, main-review and release-tags rulesets

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 41-02-PLAN.md — GH-07 five environments with branch policy main; GH-10 both Apps and SEC-06 org facts declared and read back; RELEASING.md controls rewrite with the signed-tag claim removed (GH-06)

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 41-03-PLAN.md — GH-12 workflows row and AUTO-09 zizmor row with self-tests; zizmor in the theia shell; GH-18 drill workflow

**Wave 4** *(blocked on Wave 3 completion)*

- [ ] 41-04-PLAN.md — Owner checkpoint (repos, Apps, second owner, 2FA, apply, tag/runner-group/App-list probes, notification drills), then repo-controls green live and the results recorded

### Phase 42: Community surface and release documentation (A)

**Goal**: A user who wants to report a bug, ask a question or disclose a vulnerability finds the right channel, and the release documentation matches the pipeline being built.
**Depends on**: Phase 41
**Requirements**: GH-13, GH-01, GH-14, DOC-03, DOC-04, DOC-05, DOC-06
**Success Criteria** (what must be TRUE):

  1. New issue offers only the bug and feature forms, with blank issues off and links to Discussions and the security policy; a URL carrying `version`, `os` and `install_format` prefills the bug form.
  2. The live label set equals `labels.json` as read by `repo-controls`, and the quick label row goes red naming a planted undeclared label in an issue form or workflow.
  3. `SECURITY.md`, `SUPPORT.md` and `docs/KNOWN-ISSUES.md` exist in the product repo, and `SECURITY.md`, `CONTRIBUTING.md` and `CODE_OF_CONDUCT.md` exist in the org `.github` repo.
  4. `docs/RENEWALS.md` lists every renewable item with a date and an owner action, and the quick row `renewals` is green; `docs/RELEASING.md` states the two-week cadence, the current ESR 175 dates, the 24-hour queued-job cancellation, the rewritten secrets inventory, the non-ephemeral runner shape and the legion-rebuild runbook.
  5. Drafts S2, S3 and S8 under `.planning/drafts/distribution/` are reconciled with NG-065 and NG-067 or marked superseded.

**External gate**: None.
**Research flag**: None (SUMMARY: A7 is a standard pattern).
**Plans**: 4 plans

Plans:
**Wave 1**

- [ ] 42-01-PLAN.md — GH-13 live half: labels.json plus the labels control in repo-controls with self-test plants (tracer)

**Wave 2** *(blocked on Wave 1 completion)*

- [ ] 42-02-PLAN.md — GH-13 static agreement plus GH-01: labels quick row with self-test and the three issue-form files

**Wave 3** *(blocked on Wave 2 completion)*

- [ ] 42-03-PLAN.md — GH-14 health files, DOC-04 RENEWALS.md with renewals row and self-test, DOC-06 S2/S3/S8 reconciliation record

**Wave 4** *(blocked on Wave 3 completion)*

- [ ] 42-04-PLAN.md — DOC-03/DOC-05 RELEASING.md and README corrections plus the single owner checkpoint (label apply, repos, Discussions, live read-back, form previews)

### Phase 43: Release train skeleton and upstream bump automation (A)

**Goal**: A new ESR point release or Node 24 release arrives as a green bot PR with one tracking issue, started by the hourly clock, with no owner dispatch.
**Depends on**: Phase 40 (pin, callable `rebase-upstream.yml`, regeneration script), Phase 41 (Apps, `bot` environment, `workflows` row), Phase 42 (labels)
**Requirements**: INF-03, TRAIN-01, TRAIN-02, TRAIN-03, TRAIN-08, TRAIN-09, AUTO-01, AUTO-06, AUTO-07, AUTO-04
**Success Criteria** (what must be TRUE):

  1. Exit test: the first ESR 153 point release after the Phase 43 train lands (153.7 on 2026-11-10, else 153.8 on 2026-11-24, and so on) arrives as a `chore/esr-<tag>` bot PR on which `verify.yml` runs without an approval click, with exactly one tracking issue for its release key, and the owner dispatched nothing.
  2. The `powerbrowser-scheduler` Worker on workers.dev dispatches `release-train.yml` every hour with `reason=tick`, a failed dispatch emails the owner, and the measured JWT-mint CPU time is recorded in `docs/RELEASING.md`.
  3. The quick rows `detect-upstreams-self-test` (including the `175.0esr` fixture that must yield a 153.23 detection) and `release-train-logic-self-test` (one fixture per state in the state table, compared as set equality, plus the five named fault plants) are green and go red on their plants.
  4. A replay failure opens or updates exactly one "ESR <tag>: patch <NNN> did not apply" issue assigned to the owner with the apply log and diff, and a `dry-run` run of each stage commits, opens, comments and dispatches nothing.
  5. A new Node 24 release opens a `chore/node-v24.x` PR with SHASUMS and their signature verified in the job.

**External gate**: Cloudflare account (owner step now); clock App key stored as a Worker secret; ESR 153 calendar for the exit test (the first point release after the train lands: 153.7 on 2026-11-10, else 153.8 on 2026-11-24, and so on).
**Research flag**: Partial. SUMMARY marks the A5 report protocol and A6 as standard; open item: whether the RS256 JWT mint fits the Workers Free 10 ms CPU limit (INF-03 measures it).
**Plans**: TBD

### Phase 44: Trust path (B)

**Goal**: Losing or rotating the primary MAR key no longer strands users, and every descriptor the pipeline writes is per build target and can never offer an older build.
**Depends on**: Phase 40 (regeneration script, channel name)
**Requirements**: SEC-05, UPD-14, UPD-26, SEC-09
**Success Criteria** (what must be TRUE):

  1. Patch 030, regenerated with `regenerate-patches.sh`, carries the primary DER in one slot and a distinct secondary DER in the other; `patches-regenerated` stays green, and `ng065` accepts a MAR signed by the secondary key only.
  2. `scripts/build-update-xml.mjs` writes one descriptor per BUILD_TARGET with `detailsURL` from the built artifacts, and a second run produces byte-identical output.
  3. The full-tier row `descriptor-monotonic` is green, and its self-test rejects a same-version descriptor with an older buildID.
  4. `docs/RELEASING.md` documents the secondary-key ceremony and rotation (machine, NSS database, DER path to patch 030, primary `.p12` path to `MAR_SIGNING_P12_B64`) and makes two offline `.p12` copies mandatory.

**External gate**: Secondary MAR key ceremony (owner, offline).
**Research flag**: None (SUMMARY: B is a standard pattern).
**Plans**: TBD

### Phase 45: Portable Linux release build (C)

**Goal**: The release build produces a Linux tarball and complete MAR that run on mainstream Linux with no Nix installed, and the packaged app keeps its state in the profile.
**Depends on**: Phase 40 (version files, channel, licence notices)
**Requirements**: PKG-17, PKG-22, PKG-18, PKG-23, PKG-04, PKG-05, PKG-06, PKG-07, PKG-21, UPD-29
**Success Criteria** (what must be TRUE):

  1. A Debian bookworm container build under podman on legion with `--enable-bootstrap` produces the Linux tar.xz and the complete MAR, and the full-tier rows `portable-elf`, `sidecar-no-symlinks` and `package-target-natives` are green with each self-test red on its plant.
  2. The packaged-launch and packaged-identity rows pass on the container-built tarball; its Theia About dialog shows the release-variant legal notices; a URL given on the command line opens in the stock browser window.
  3. Theia state lives under the Gecko profile directory, and the matrix no-residue checks inspect those real paths.
  4. The release build reads the Safe Browsing key from a keyfile outside the repo mounted into the container, a `docs/RENEWALS.md` row exists for it, and a live check shows the Safe Browsing lists updating.
  5. The complete MAR size is measured and the partial-MAR decision (complete MARs only unless measured too large) is recorded.

**External gate**: Google Safe Browsing API key, keyfile stored on legion.
**Research flag**: Yes (C, PKG-17): the first container bootstrap build; whether the jessie-built `signmar` runs on `ubuntu-latest`; what `toolchain-baseline.txt` means under a container build.
**Plans**: TBD

### Phase 46: In-app update experience and egress pass (C)

**Goal**: A user sees when an update is ready, restarts into it with one click, is told in plain words when this copy cannot update or a check failed, and the browser reaches no host the allowlist has not dispositioned.
**Depends on**: Phase 40 (`user-initiated` disposition, branding emitter); Phase 45 for the packaged `mar-update-hop` run (UPD-24)
**Requirements**: UPD-18, UPD-19, UPD-20, UPD-21, UPD-22, UPD-23, UPD-32, UPD-24, UPD-27, UPD-15, UPD-28
**Success Criteria** (what must be TRUE):

  1. With an update staged, the user sees "PowerBrowser <version> is ready to install..." with Restart now and Later plus a status-bar item, and Restart now brings up version N+1 with the layout restored, asserted by the full-tier `mar-update-hop` row.
  2. A read-only app directory produces the cannot-update message (with the macOS variant text present), a failed check shows the could-not-check message with Check again at most once per session, and the command palette offers "PowerBrowser: Restart to Update" and "PowerBrowser: Check for Updates".
  3. The quick row `shell-request-kinds` and the update-copy shape row are green, and their self-tests go red on a stray request kind and on a pref key planted in one string; `check-internals-boundary.sh` is green with every new touchpoint catalogued in `INTERNAL-APIS.md`.
  4. `endpoint-allowlist.json` carries `github.com` and `release-assets.githubusercontent.com` rows (their layer-3 observation of a real update is Phase 50 criterion 5), a `crash-reports.mozilla.com` deny row, a corrected geolocation row and corrected stale texts; `allowlist-doc-consistency` is green and its self-test goes red on a planted undocumented Mozilla allow host; the partner-search-code status is recorded.
  5. A verify-endpoints run contacts no Firefox Accounts or Sync host, and the Nimbus `recordExposureEvent` check passes with no throw and no network request.

**External gate**: None.
**Research flag**: None in SUMMARY. Carried open items: sidecar egress against verify-endpoints layer 3; Mozilla partner search codes under `org.debios`.
**Plans**: TBD
**UI hint**: yes

### Phase 47: Hosting, website and mail (D)

**Goal**: powerbrowser.org serves a static site with download, privacy and legal pages, updates.powerbrowser.org serves the descriptors, and mail to security@, contact@ and privacy@ reaches the owner.
**Depends on**: Phase 41 (repo controls, Apps, empty `powerbrowser-updates` repo); WEB-02's MAR-size line uses Phase 45's PKG-21 measurement
**Requirements**: INF-01, INF-06, DIST-03, INF-02, WEB-01, WEB-02, WEB-03, WEB-04, WEB-05, TEL-08
**Success Criteria** (what must be TRUE):

  1. DNS for powerbrowser.org is served by Cloudflare, every inventoried Namecheap record resolves after the move, and one test message each to security@, contact@ and privacy@ reaches the owner.
  2. A live GET of `/`, `/download`, `/privacy` and `/legal` returns 200 with zero third-party requests, `/.well-known/security.txt` is served, and the home page spells "PowerBrowser" and carries the Mozilla non-association footer sentence.
  3. /download offers the stable-name Release links, `SHA256SUMS`, `gh attestation verify` with the login note and the offline `--bundle` alternative, per-OS signing status, system requirements, the en-US scope and the MAR size; /privacy and /legal state the payload, retention, processor, licence and trademark lines.
  4. A live probe of a real 11-segment update URL against updates.powerbrowser.org returns the descriptor, and the full-tier row `updates-repo-static` is green with its self-test red on a planted `functions/` and `_worker.js`.
  5. Every Cloudflare credential has one named holder and a `docs/RENEWALS.md` row, and the maintenance sweep holds no Cloudflare token.

**External gate**: Namecheap nameserver change (up to 24 hours to propagate, DNSSEC off during the move); Cloudflare account with 2FA; R2 enablement for the R2 token (a payment method may be required). This phase's live site unblocks the Apple fee-waiver application (D-U-N-S/Apple gate, Phase 55).
**Research flag**: None (SUMMARY: the D site and Email Routing are standard). Open: one live `_redirects` probe on the 11-segment path; zone-level security.txt avoids the Pages `.well-known` question.
**Plans**: 4/4 plans

Plans:
**Wave 1**

- [ ] 47-01-PLAN.md — updates-repo-static row end to end (absence property, fail-closed read-back, in-memory self-test with functions/ and _worker.js plants, both registry rows)

- [ ] 47-02-PLAN.md — Four static site pages with the locked copy (PowerBrowser spelling, footer sentence, attestation/login/bundle lines, payload/licence/trademark lines, zero external requests, MAR size pending-flagged for Phase 45)

**Wave 2** *(blocked on Wave 1 completion)*

- [ ] 47-03-PLAN.md — Updates staging tree (one 11-segment 200 rule + placeholder descriptor) plus RELEASING.md multi-page correction and RENEWALS.md Cloudflare rows

**Wave 3** *(blocked on Wave 2 completion)*

- [ ] 47-04-PLAN.md — Blocking owner checkpoint (DNS inventory/move/verify, Pages projects + domains, security.txt, Email Routing + 3 test messages, 4 page GETs, 11-segment escaped probes + unknown-target 404), then the live record and green rows
**UI hint**: yes

### Phase 48: Error telemetry, maintenance sweep and watchdog (D)

**Goal**: Error reports from users who opted in land in a 30-day store, and the owner learns from one pinned issue, or from an external watchdog, when any part of the release machinery stops.
**Depends on**: Phase 43 (train report job), Phase 47 (Cloudflare zone)
**Requirements**: TEL-06, TEL-10, TEL-11, TRAIN-07, MON-01
**Success Criteria** (what must be TRUE):

  1. With the preference raised, a loopback live-delivery row observes one POST from a running sidecar carrying type, basename, line, column, version, buildID and OS and no message or stack, and the preference description reads exactly as TEL-06 states.
  2. The telemetry Worker's `POST /events` rejects an invalid payload, stores a valid one in D1, deletes rows older than 30 days, and is protected by one rate-limiting rule.
  3. The pinned `release-train: maintenance` issue is re-rendered daily with the initial rows (runner online, ESR pin age, channel liveness, watchdog age, synthetic `/events` POST) plus the download-count row; the runner-online, channel-liveness and download-count rows exist and render their no-data state; the issue comments only when a row turns red, and the sweep's self-test plants a red row and requires exactly one comment; the authenticated download-count route rejects an unauthenticated POST.
  4. Stopping the Worker cron for 26 hours opens an issue in `powerbrowser-updates`.

**External gate**: None beyond Phase 47's Cloudflare setup. The runner-online, channel-liveness and download-count rows have nothing to observe until Phases 49 and 50; their live values are Phase 50 criterion 5.
**Research flag**: Open item (SUMMARY): whether bot commits count as activity for GitHub's 60-day scheduled-workflow rule, which matters to the watchdog repo.
**Plans**: TBD

### Phase 49: Release pipeline and legion runner (E)

**Goal**: An owner-approved dispatch of `release.yml` builds on legion with no secrets, signs and publishes on a hosted runner, and releases the descriptor after the canary wait, with no credential stored on legion.
**Depends on**: Phase 41 (fork approval, environments), Phase 44 (descriptor builder, `descriptor-monotonic`), Phase 45 (container build), Phase 47 (updates host)
**Requirements**: SEC-08, SEC-10, DIST-02, AUTO-05, SEC-07, DIST-07, DIST-08, DIST-09, UPD-17, INF-04
**Success Criteria** (what must be TRUE):

  1. The legion runner is registered once, non-ephemeral, only after SEC-11, SEC-10 and GH-07 are in place, and a planted job from another branch is rejected by the pre-job hook before any step runs.
  2. A dispatched `release.yml` run builds on legion with `contents: read` and no secrets, passes `toolchain-baseline.sh`, the packaged-launch and install-matrix rows, and exits without building when the release key is not greater than the latest Release tag.
  3. `sign-publish` refuses a MAR whose embedded channel differs from `ACCEPTED_MAR_CHANNEL_IDS`, signs and verifies with `signmar -v`, checks the draft's asset set against the manifest before the single publish, creates tag `v<ESR>-<revision>` with the bot App token, and copies the MAR to R2.
  4. After the 24-hour wait timer and owner approval, the `descriptor` job commits one `update.xml` per BUILD_TARGET to `powerbrowser-updates`, and `channel-live` is green (public descriptor byte-equals the repo copy, MAR URLs answer HEAD 200, offered version equals the latest Release).
  5. One cold hosted fallback Linux build is measured with duration and disk use in `docs/BUILD.md`, and artifact storage per release is measured against the 500 MB cap.

**External gate**: legion NixOS changes (runner user, `ACTIONS_RUNNER_HOOK_JOB_STARTED` hook) finished with `nrs`; runner registration after SEC-11, SEC-10 and GH-07; Cloudflare R2 enabled.
**Research flag**: Yes (E): the Actions artifact storage cap; the environment approval timeout; the github-runner 30-day update rule against nixpkgs lag.
**Plans**: TBD

### Phase 50: Release train stages and first public Linux release (E)

**Goal**: The train carries a release from a merged bump PR to a live descriptor by itself, a bad release can be withdrawn without deleting it, and the first public Linux release is live.
**Depends on**: Phase 43 (train), Phase 46 (update experience), Phase 48 (maintenance sweep), Phase 49 (release pipeline)
**Requirements**: TRAIN-10, REL-02, GH-15, UPD-16, REL-03
**Success Criteria** (what must be TRUE):

  1. After the bump PR merges, the train dispatches `release.yml` with the merge SHA, links the exact run, and the tracking issue moves through BUILDING to DONE as derived from GitHub facts; `release.yml` refuses a SHA that is neither `main`'s tip nor a `configuration.toml`-changing ancestor; `release-train-logic-self-test` covers every new state.
  2. The real-release hop drill (`served: release`) runs N to N+1 from a clean non-Nix container or VM on legion and proves hosts, hash, version, signature, allowed channels and attestation, with each fault plant red.
  3. The withdraw job commits the no-update descriptor for every target (or repoints at the R2 copy), reruns `channel-live`, and marks the Release per the recorded immutable-release probe; no Release is deleted.
  4. The first public Linux release is published: bump PR merged, `release` approved, hop drill passed, /download live, descriptor released after the owner's `descriptor` approval, and `docs/KNOWN-ISSUES.md` copied into one pinned issue.
  5. At the first public release, the update download from `downloads.powerbrowser.org` (the R2 MAR origin) is observed at layer 3 with no unattended `github.com` or `release-assets.githubusercontent.com` request, and the sweep's runner-online, channel-liveness and download-count rows report live values.

**External gate**: Per-release owner approvals (`release`; `descriptor` after the owner's own N-1 to N hop); the ESR 153 calendar decides which point release becomes the first public release.
**Research flag**: Shares Phase 49's E flags.
**Plans**: TBD

### Phase 51: Dependency flow and train supersede (F)

**Goal**: Theia, GitHub Actions and npm security updates arrive as grouped PRs on a fixed rhythm, a newer ESR supersedes an open train cleanly, and the maintenance issue reports every renewal, alert and mirror drift.
**Depends on**: Phase 48 (maintenance sweep), Phase 50 (release states)
**Requirements**: AUTO-02, AUTO-03, DIST-05, UPS-02, TRAIN-04, TRAIN-11
**Success Criteria** (what must be TRUE):

  1. On the first tick after a last-Thursday Theia release, self-hosted Renovate opens one grouped `@theia/**` PR (with `@theia/monaco-editor-core` separate), pinned, rewriting `theia_release` in `configuration.toml` and updating `flake.lock`, with automerge off.
  2. Dependabot opens one weekly grouped github-actions PR that keeps SHA pins with plain version comments and applies npm security-only updates to `theia/yarn.lock`; CodeQL default setup covers `theia/extensions` and `scripts/`.
  3. A newer ESR detected while a train is open moves the old train to SUPERSEDED, cancels its pending `release` deployment and starts the new train; a chemspill revision takes priority; the sign job exits when a newer Release exists; supersede fixtures are in `release-train-logic-self-test`.
  4. The maintenance issue carries the renewals-due, repo-controls, Dependabot PR count, Dependabot and CodeQL alert counts, CodeQL push age and Codeberg-versus-GitHub `main` rows; `docs/RELEASING.md` states the release cadence and the npm-advisory response time; `docs/RENEWALS.md` carries the Node 24 Maintenance-end row (2028-04-30).

**External gate**: Theia release calendar (last Thursday of each month). The Codeberg row has no mirror to compare until Phase 53.
**Research flag**: Yes (F): whether a Theia `yarn.lock` regeneration fits the self-hosted Renovate run.
**Plans**: TBD

### Phase 52: Claude fixer (F)

**Goal**: When a bump PR goes red, a patch fails to replay or `main` goes red, a Claude-written fix arrives as a gated PR for the owner to review, and the fixer can never merge, approve, sign or weaken a gate.
**Depends on**: Phase 50 (release states), Phase 51 (Renovate Theia branch is a fixer class)
**Requirements**: FIX-01, FIX-02, FIX-03, FIX-04, FIX-05, FIX-06, FIX-07, FIX-08, FIX-09, FIX-10, FIX-11, FIX-12, TRAIN-06
**Success Criteria** (what must be TRUE):

  1. A red stage labels its tracking issue `train:blocked`, assigns the owner and links the failing log; for the three fixable classes the train dispatches the fixer, and a `release.yml` failure opens an issue only.
  2. The fixer runs as `fix`, `fix-gate` and `fix-pr` on GitHub-hosted runners; only `fix-pr` mints an App token; its PR is labelled `claude-fix` and `release:<key>`, carries the templated body and is assigned to the owner; the `workflows` row asserts the pinned action commit, the pinned Claude Code version, `show_full_output` and `display_report` off and no bare `Bash`.
  3. The quick row `fix-gate-self-test`, after a green control, rejects one planted diff per entry of `.github/fix-gate-deny.json` plus a hand-edited patch hunk, each naming the path.
  4. A third failure for the same (release key, class) moves the release to NEEDS_OWNER, attempts rejected by `fix-gate` are counted, the spend limits are in place, and the authentication outcome (OIDC federation or `fixer`-only API key) is recorded in `docs/RELEASING.md`.
  5. Before 2027-05-27 a fixer PR for a real red PR (expected: the Theia 1.77 bump needing TypeScript 6.0) passes `fix-gate` and is reviewed and merged by the owner.

**External gate**: Anthropic Console fixer workspace with a monthly limit; OIDC federation or the `fixer` environment key; FIX-10 deadline 2027-05-27 (ESR 175 nightly).
**Research flag**: Yes (F): whether passing `github_token` suppresses the action's own OIDC App-token exchange, which decides OIDC versus `ANTHROPIC_API_KEY`.
**Plans**: 5 plans

Plans:
**Wave 1**

- [ ] 52-01-PLAN.md — FIX-11/FIX-07/FIX-02 tracer: `.github/fix-gate-deny.json`, `scripts/verify-fix-gate.mjs`, `fix-gate-self-test` row, deny→gate→row slice green via --only + --quick

**Wave 2** *(blocked on Wave 1 completion)*

- [ ] 52-02-PLAN.md — FIX-08/FIX-09/FIX-04: additive `workflows` rules + plants, `actions-selected.json` admissions (claude-code-action + create-github-app-token), hosted-only assertion

**Wave 3** *(blocked on Wave 2 completion)*

- [ ] 52-03-PLAN.md — TRAIN-06/FIX-01/FIX-05/FIX-12: `release-train.mjs` contract + fixtures (NEEDS_OWNER, dispatch guards, run-name counting), `fixer-prepare.sh`, spend/auth rules, RELEASING.md auth outcome

**Wave 4** *(blocked on Wave 3 completion)*

- [ ] 52-04-PLAN.md — FIX-03/FIX-06/TRAIN-06/FIX-09: `fix`/`fix-gate`/`fix-pr` skeleton in release-train.yml, `fix-open-pr.mjs`, staged red-branch drill, RELEASING.md spend/routing + RENEWALS.md rows

**Wave 5** *(blocked on Wave 4 completion)*

- [ ] 52-05-PLAN.md — FIX-10/FIX-05/FIX-12 owner checkpoint (autonomous:false): workspace + credential, drill sign-off, live red-PR dispatch + fix-gate pass + owner merge before 2027-05-27

### Phase 53: Support operations (G)

**Goal**: Bug reports arrive prefilled from inside the browser, every new issue gets a template triage reply, security reports reach the owner's phone, and code and status stay reachable during a GitHub outage.
**Depends on**: Phase 47 (mail), Phase 51 (Codeberg sweep row), Phase 52 (FIX-08 pinning rules apply to `triage.yml`)
**Requirements**: TEL-05, GH-03, GH-16, GH-17, GH-04, MON-02, DOC-07
**Success Criteria** (what must be TRUE):

  1. "PowerBrowser: Report a Bug" opens the prefilled bug form in the stock window, the diagnostics layer's Copy button copies diagnostics that never appear in a URL, and the `github.com` allowlist row is `user-initiated`.
  2. A new issue receives labels and a fixed template comment from `triage.yml`; a planted issue carrying instructions produces only a template comment; triage never closes an issue and runs under its own Anthropic workspace spend limit.
  3. A private vulnerability report and a security@ message each reach the owner as phone notifications within the acknowledgement window `SECURITY.md` states.
  4. A legion timer pushes git and tags to Codeberg daily and the sweep's Codeberg row goes red when the mirror lags; status.powerbrowser.org shows the updates host, the website and `/events`, and the sweep reports the Upptime workflows' state and last-run age.
  5. `docs/RELEASING.md` has a support-operations section covering triage, Discussions moderation, private vulnerability reports, CodeQL alerts after each rebase and the fork-PR approval rule.

**External gate**: Anthropic triage workspace; Codeberg account, mirror repo and deploy token on legion; legion NixOS timer finished with `nrs`; Upptime repo and `status` CNAME.
**Research flag**: None (SUMMARY: G is standard). Carried unresearched: the private vulnerability reporting route.
**Plans**: TBD
**UI hint**: yes

### Phase 54: Windows (H)

**Goal**: Windows users install PowerBrowser from a `setup.exe` on GitHub Releases and it updates itself, first unsigned with a stated warning, then Authenticode-signed.
**Depends on**: Phase 50 (release pipeline and train)
**Requirements**: PKG-10, PKG-11, PKG-12, PKG-13, LEG-01, MTX-01, UPD-30, UPD-31, SEC-03, SEC-12, DIST-10
**Success Criteria** (what must be TRUE):

  1. A `release.yml` `build-windows` job cross-builds Gecko on legion in the release container and `mach repackage installer` produces the NSIS `setup.exe` and a complete MAR; the generated Windows mozconfig disables the maintenance service; `package-target-natives` passes on the Windows package with a sidecar built on `windows-latest`.
  2. The installer carries PowerBrowser artwork, its own registry namespace and no install or uninstall ping, and the `verify-trademark-surface.mjs` self-test goes red on a Mozilla mark planted in each NSIS, application.ini, Info.plist and `MOZ_LAUNCHER_SUBKEY` surface.
  3. The Windows 11 libvirt matrix installs, launches, updates and uninstalls with a clean registry no-residue diff, the update applies with the sidecar reaped before the rename, and the background-task path is verified or deferred with the reason recorded.
  4. The first Windows release ships unsigned with the maintenance service disabled, per-target descriptors and the stated /download warning text.
  5. After Azure validation, jsign signs the inner PE files, then the installer, then the MAR is produced, and /download shows the updated signing status.

**External gate**: Azure Artifact Signing identity validation (1 to 20 business days; create the account 3 to 4 weeks before the matrix is ready; billed from creation); legion NixOS libvirt access for the runner user, finished with `nrs`; Windows VM licence.
**Research flag**: Yes (H): the Windows updater rename with a live `node.exe`; the background-task path; the MTX-01 libvirt design.
**Plans**: TBD

### Phase 55: macOS (I)

**Goal**: macOS users install a signed, notarized universal DMG that updates itself.
**Depends on**: Phase 47 (live site for the fee waiver), Phase 50 (release pipeline)
**Requirements**: SEC-13, PKG-24, PKG-14, PKG-15, PKG-16, SEC-04
**Success Criteria** (what must be TRUE):

  1. Before any macOS build, the Apple SDK licence position for cross builds, rcodesign's maintenance status and the Developer ID CA expiry date are checked and recorded.
  2. A `release.yml` `build-macos` job produces a universal DMG and complete MAR through `unify.sh` (cross-built on legion, with the hosted `macos-26` fallback recorded), the sidecar natives, `rg` and `node` are `lipo`-merged, and `package-target-natives` passes on the DMG.
  3. The quick row `mac-entitlements` is green, and its self-test goes red on a planted `43AQ936H96`, `org.mozilla` and restricted entitlement key.
  4. The bundle is signed inside-out with a Developer ID and notarized, the hosted macOS matrix row passes on the draft DMG, and one real Mac session records the Gatekeeper copy.

**External gate**: D-U-N-S number, then Apple Developer Program enrolment with the nonprofit fee-waiver application (after the Phase 47 site is live); App Store Connect API key as a `release` secret.
**Research flag**: Yes (I): the Apple SDK licence; whether rcodesign is still viable; the Developer ID CA date.
**Plans**: TBD

### Phase 56: Package channels (J)

**Goal**: Users install and update PowerBrowser through Nix, Flathub, winget and Homebrew, and each channel's manifest follows every release without an owner edit.
**Depends on**: Phase 50 (Linux release), Phase 54 (Windows release for winget), Phase 55 (notarized DMG for the cask and aarch64-darwin)
**Requirements**: PKG-19, INF-05, PKG-20, DIST-04, DIST-11, DIST-12
**Success Criteria** (what must be TRUE):

  1. The flake package repacks the Release tarball with `fetchurl` and autoPatchelf, uses `pkgs.nodejs_24` and exports an overlay; a row asserts the release tarball's `policies.json` has no `DisableAppUpdate`; a clean machine's `nix build` substitutes from the binary cache.
  2. PowerBrowser is listed on Flathub (DNS TXT verified, with the build-from-source exception in writing or a from-source manifest), on winget, and in the own Homebrew tap with a cask after notarization; /download gains Nix and Flatpak rows when those channels are live.
  3. For each release the train opens a bot PR with the flake hash, the bot App commits the tap update, `wingetcreate` submits the winget PR, and Flathub's external-data-checker opens its own PR.

**External gate**: Tap repo exists (created in Phase 41); winget submission credential decision (likely a PAT on a fork-owning account, against the Apps-only rule; record holder and RENEWALS row); Flathub account and build-from-source exception request; Cachix open-source licence (R2 S3 cache fallback); Apple notarization for the cask and aarch64-darwin.
**Research flag**: None in SUMMARY (the J flake follows the floorp-bin template). Open: Cachix eligibility under PolyForm Noncommercial.
**Plans**: 0/5 plans planned

Plans:
**Wave 1**

- [ ] 56-01-PLAN.md — PKG-19 flake repack (fetchurl + autoPatchelf, nodejs_24, overlay) + Flatpak x86_64-linux manifest shape; flake-repack + policies-update-split rows

**Wave 2** *(blocked on Wave 1 completion)*

- [ ] 56-02-PLAN.md — INF-05 binary-cache config (Cachix + R2) + PKG-20 Flathub verification half; binary-cache + flathub-manifest rows; cache-token RENEWALS row

**Wave 3** *(blocked on Wave 2 completion)*

- [ ] 56-03-PLAN.md — DIST-04 winget set + DIST-11 staged cask (darwin deferred); winget-manifest + homebrew-cask rows; WINGET_TOKEN custody row

**Wave 4** *(blocked on Wave 3 completion)*

- [ ] 56-04-PLAN.md — DIST-12 four-leg channel-manifests train stage; channel-release-jobs row; train-interface mapping

**Wave 5** *(blocked on Wave 4 completion)*

- [ ] 56-05-PLAN.md — Owner checkpoint (accounts, exception, submissions, substitute proof, /download rows), then the live record

### Phase 57: Native crash reporting (K)

**Goal**: Native crashes are reported only after consent, to PowerBrowser's own store, with the symbols needed to read them, and the crash reporter is switched on.
**Depends on**: Phase 48 (telemetry Worker), Phase 54 (first Windows release shipped)
**Requirements**: TEL-09, TEL-07, TEL-12, TEL-13
**Success Criteria** (what must be TRUE):

  1. A verify-endpoints run with the crash reporter enabled shows no request to `incoming.telemetry.mozilla.org` before consent.
  2. The Worker's `POST /submit` stores minidumps in R2 under a 30-day lifecycle, the collector's self-test passes a Gecko-shaped `extra` plant, and the submit URL key is reconciled with `[urls].crash_report`.
  3. `mach buildsymbols` output is attached to each Release as part of the DIST-07 manifest asset set, a stackwalk runbook exists, and `docs/CRASH-POLICY.md` is rewritten.
  4. `--disable-crashreporter` is removed only after criteria 1 to 3 pass and the first Windows release has shipped.

**External gate**: Cloudflare R2 enabled; the first Windows release (Phase 54) shipped (owner decision 9).
**Research flag**: None in SUMMARY.
**Plans**: TBD

Plans:
**Wave 1**

- [ ] 57-01-PLAN.md — TEL-09 hook-only Glean crash-ping consent patch (regenerated) with static consent gate + self-test; layer-3 reporter-enabled no-request assertion with positive-control twin

**Wave 2** *(blocked on Wave 1 completion)*

- [ ] 57-02-PLAN.md — TEL-07 single-key submit-URL derivation (inert while unset) + crash-host allowlist row + expect flip; Worker POST /submit to R2 with 30-day lifecycle + contract gate; Gecko-shaped extra plant in collector self-test; owner deploy checkpoint

**Wave 3** *(blocked on Wave 2 completion)*

- [ ] 57-03-PLAN.md — TEL-12 mach buildsymbols per-BUILD_TARGET into the DIST-07 asset seam (manifest entry + equality extension + SHA256SUMS) with symbols gate; docs/CRASH-POLICY.md rewritten with stackwalk runbook

**Wave 4** *(blocked on Wave 3 completion)*

- [ ] 57-04-PLAN.md — TEL-13 retirement flip staged on scratch, proven green, restored unexecuted; DSH-BLOCKED.md owner unblock steps; plan ends at checkpoint:human-action (no flip, no build, no push)

### Phase 58: ESR 175 (L)

**Goal**: PowerBrowser moves to ESR 175 before ESR 153 ends, with 153.x security releases continuing in parallel through the overlap.
**Depends on**: Phase 43 (tag-based detector), Phase 49 (hosted fallback build), Phase 52 (fixer proven)
**Requirements**: UPS-01, TRAIN-05, UPS-03
**Success Criteria** (what must be TRUE):

  1. From the 175 beta (2027-06-10) the bump job runs replay-only against 175 tags, so patch conflicts surface as issues before the 175 release.
  2. A 175 train runs with its own release keys and tracking issues while the 153.x security trains continue.
  3. The hook-only patches are rebased onto 175, the toolchain baseline is updated, and PowerBrowser ships on 175.x before 153.27 (2027-09-07).
  4. The dual-build window fits legion's disk (two objdirs of about 14 GB each), the measured disk use is recorded, and the hosted fallback build is available.

**External gate**: ESR 175 calendar: nightly 2027-05-27, beta 2027-06-10, release 2027-06-29; ESR 153 ends with 153.27 on 2027-09-07.
**Research flag**: Yes (L): 175 patch drift; whether product-details adds a `FIREFOX_ESR153` key after the flip.
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order. Phase 42 depends only on 41. Phases 44 and 45 can run alongside 41 to 43; 46 follows 45; 47 can start after 41, so the live site starts the Apple clock early, but its /download MAR-size line waits for 45. Observations that need a real GitHub Release (UPD-15's asset hosts, the sweep's runner, channel and download rows) are Phase 50 criterion 5.

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 40. Release identity, ESR pin and patch regeneration (A) | 8/8 | Complete    | 2026-10-22 |
| 41. Repository controls and GitHub Apps (A) | 3/4 | In Progress | - |
| 42. Community surface and release documentation (A) | 0/TBD | Not started | - |
| 43. Release train skeleton and upstream bump automation (A) | 0/TBD | Not started | - |
| 44. Trust path (B) | 0/TBD | Not started | - |
| 45. Portable Linux release build (C) | 0/TBD | Not started | - |
| 46. In-app update experience and egress pass (C) | 0/TBD | Not started | - |
| 47. Hosting, website and mail (D) | 0/TBD | Not started | - |
| 48. Error telemetry, maintenance sweep and watchdog (D) | 0/TBD | Not started | - |
| 49. Release pipeline and legion runner (E) | 0/TBD | Not started | - |
| 50. Release train stages and first public Linux release (E) | 0/TBD | Not started | - |
| 51. Dependency flow and train supersede (F) | 0/TBD | Not started | - |
| 52. Claude fixer (F) | 0/TBD | Not started | - |
| 53. Support operations (G) | 0/TBD | Not started | - |
| 54. Windows (H) | 0/TBD | Not started | - |
| 55. macOS (I) | 0/TBD | Not started | - |
| 56. Package channels (J) | 0/TBD | Not started | - |
| 57. Native crash reporting (K) | 0/TBD | Not started | - |
| 58. ESR 175 (L) | 0/TBD | Not started | - |
