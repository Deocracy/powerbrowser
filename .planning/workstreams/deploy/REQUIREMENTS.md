# Requirements: Power Browser v1.6 Deployment setup

**Defined:** 2026-10-20
**Workstream:** `deploy` (branch `workspace/deploy`)
**Core Value:** A stranger can clone Power Browser, edit `configuration.toml`, drop in a logo, and build their own branded, working web browser without touching any other file, then reshape its GUI through Theia extensions without forking the platform. If a rebrand ever requires editing a second file, that is a bug.

**Milestone goal:** a single owner runs PowerBrowser as a product with no server: one installer per OS on GitHub Releases, self-update through Gecko's MAR updater, Firefox ESR, Theia and Node tracked automatically by one release-and-maintenance orchestrator, a Claude fixer that proposes fixes as PRs, support on GitHub, opt-in error telemetry, and a website at powerbrowser.org. The owner's steady-state work is: per release, one PR merge, one `release` approval and one `descriptor` approval; weekly, one grouped Dependabot PR merge; monthly, one Theia PR review after each last-Thursday Theia release. Every other recurring job is failure-only.

**Inputs:** `.planning/seeds/SEED-002-deployment-setup.md` (scope, phases A to L), `.planning/research/v1.6-deploy/SUMMARY.md` (authoritative where it corrects SEED-002), FEATURES.md, ARCHITECTURE.md, PITFALLS.md, CRITIQUE.md, and the owner decisions of 2026-10-20 recorded below.

**Conventions:**
- The letter in parentheses at the end of each requirement is its SEED-002 phase (A to L). Where SUMMARY moved an item to a different phase than SEED-002 §10 gives it, the letter follows SUMMARY (for example INF-03 is (A) per SUMMARY Phase A5, workers.dev first, although SEED-002 §10 places it in D).
- A "row" is a `scripts/verify-platform.sh` registry row. Every new row has a `--self-test` sibling that plants each named fault and must go red naming the drift. Rows derive their expectation from the tree and compare as set equality; none keeps a hand-written expectation list.
- "quick" rows run with no build, no browser, no display and no network. Rows that need the network are full-tier.
- User-facing text quoted below names the product "PowerBrowser" and carries no internal identifier (pref key, port, timeout, sentinel, exception text). The existing `shell-error-copy-no-internals` row derives only from `TheiaService.sys.mjs`; UPD-32 extends the same shape test to the Theia-side copy. Website copy is checked by review against this rule, not by a row.

## ID reuse and renumbering

IDs come from SEED-002, SEED-001 and FEATURES.md. These SEED IDs collide with requirements already shipped in `.planning/REQUIREMENTS.md` (v1.4: UPD-05..UPD-10) or `.planning/milestones/*-REQUIREMENTS.md` (v1.0 to v1.2: UPD-01..04, SEC-01, SEC-02, TEL-01..04, DOC-01, DOC-02, PKG-01..03), and are renumbered:

| SEED ID | Meaning | v1.6 ID |
|---|---|---|
| UPD-01 | One update channel name | UPD-11 |
| UPD-02 | Update URL from `[urls].update` only | UPD-12 |
| UPD-03 | About-dialog and release-notes links | UPD-13 |
| UPD-04 | Descriptor per BUILD_TARGET | UPD-14 |
| UPD-05 | Endpoint allowlist release pass | UPD-15 |
| UPD-06 | Real-release hop drill | UPD-16 |
| UPD-07 | update-channel-live | UPD-17 |
| UPD-08 | In-app update experience | UPD-18 to UPD-24, UPD-27, UPD-32 |
| UPD-09 | Windows sidecar reap blocks quit | UPD-30 |
| SEC-01 | Repository process controls | SEC-06, SEC-11 and GH-05 to GH-09 |
| SEC-02 | Every release MAR signed | SEC-07 (the key and enforcement halves shipped as NG-065) |
| DOC-01 | Release documentation | DOC-03 to DOC-06 |

Where one SEED ID covered several independently testable behaviours, it keeps its number for the core behaviour and the others take the next free number in the same prefix. The new IDs GH-18, WEB-05, FIX-12 and UPD-32 were checked against `.planning/REQUIREMENTS.md` and `.planning/milestones/*REQUIREMENTS*.md` and collide with nothing.

### Already satisfied (not re-listed)

- **DIST-01**: `verify-platform.sh --quick` green on GitHub-hosted CI under the flake's inkscape; `main` pushed. Satisfied in tree (SEED-002 §9).
- **SEC-02, key and enforcement halves**: fork MAR certificate in patch 030 and signature enforcement with the unsigned and wrong-channel plants (`ng065`). Only the release-signing half remains, as SEC-07.
- **UPD-02, host half**: `MOZ_APPUPDATE_HOST` baked from `[urls].update` (NG-064). The `policies.json` half remains, as UPD-12.
- **PKG-04, staging half**: sidecar and Node staged with relative `backendMain`/`nodePath` (NG-063). Re-proof on the release build remains, as PKG-04.
- **PKG-18, investigation half**: the 2026-10-17 tarball holds 0 symlinks, so no dereference work is needed. The permanent row remains, as PKG-18.
- Already in tree and not re-required: SHA-pinned actions with `contents: read`, `--disable-crashreporter`, the blanked installer telemetry ping (patch 040), the `rebase-upstream.sh` replay path, `verify-upstream-pins.mjs`, the endpoint allowlist discipline, the telemetry sender and preference, the diagnostics layer, `verify-trademark-surface.mjs` over brand.ftl, brand.properties, Theia fragments and desktop Name lines.

### Inherited network egress (carried, not decided here)

The imported platform allows exactly three Mozilla hosts, all one feature —
Remote Settings (disabling it would also lose CRLite revocation,
intermediate preloading, and tracking-protection updates):
**firefox.settings.services.mozilla.com**,
**content-signature-2.cdn.mozilla.net**, and
**firefox-settings-attachments.cdn.mozilla.net**. Named here and in
ROADMAP.md because `verify-platform.sh`'s `allowlist-doc-consistency`
check requires every allow-dispositioned Mozilla host to be documented in
the project's own planning record. This section must survive when this file replaces `.planning/REQUIREMENTS.md`, and any Mozilla allow host that UPD-15 adds must be named here and in ROADMAP.md in the same commit.

## v1.6 Requirements

### Release identity

- [x] **REL-01**: `configuration.toml [product]` gains a `revision` field. The generator derives the version files and the release key `v<ESR>-<revision>` from it and the ESR pin. The quick row `release-identity` derives the tag, the version files and the descriptor version from the tree and requires them to agree; its self-test plants a hand-written version literal and a descriptor version that disagrees with the key. The network check that the key is strictly greater than the latest Release tag runs in `release.yml` (DIST-02) and in the train's dispatch validation (TRAIN-01), not in this row. (A)
- [x] **UPD-11**: One update channel name is used everywhere. The quick row `update-channel` derives the channel from the generated `.mozconfig` (`MOZ_UPDATE_CHANNEL`, `MAR_CHANNEL_ID`, `ACCEPTED_MAR_CHANNEL_IDS`) and compares it with every consumer (`build-update-xml.mjs`, `docs/RELEASING.md`, `release-manifest.json`, the descriptor path); the self-test plants `release`/`powerbrowser-release` in one consumer. The chosen name is recorded in PROJECT.md Key Decisions. (A)
- [x] **DIST-06**: The owner commits the pin bump to `FIREFOX_153_5_1esr_RELEASE` (6cd88e7d), changing `configuration.toml:115` and the `rebase-upstream.yml:33` `tag` default together, with `configuration.toml` regenerated and `--quick` green. A dispatched run of `rebase-upstream.yml` against that tag is then green; it is the first real run of that workflow. DIST-06 lands before AUTO-08, which deletes the `tag` default and changes `verify-upstream-pins.mjs` to assert its absence. (A)
- [x] **UPD-12**: The shipped `distribution/policies.json` carries no `AppUpdateURL`; `MOZ_APPUPDATE_HOST` from `[urls].update` is the only update URL source. The `ng064` comparand and the reason text at `endpoint-allowlist.json:22` change in the same commit. (A)
- [x] **UPD-13**: `app.releaseNotesURL`, `app.releaseNotesURL.aboutDialog`, `app.update.url.manual` and `app.update.url.details` are generated from `[urls].release_notes` and `[urls].homepage`. The About dialog's release-notes and fallback links open the stated pages, and the fallback link no longer throws on an empty URL. In the same commit, the `powerbrowser.org` entry in `endpoint-allowlist.json` (now `deny`, about lines 85-87) is re-dispositioned to `user-initiated` (UPD-33), and the commit records how `verify-theia-endpoints` treats the stated homepage (SEED-002 §7). (A)
- [x] **UPD-33**: `endpoint-allowlist.json` gains a third disposition, `user-initiated`, for hosts the browser may reach only after a user click (powerbrowser.org, github.com). The endpoint checks treat an unattended request to a `user-initiated` host as a failure, exactly as for a `deny` host, and pass only requests that follow a user action in the same probe; the self-test plants an unattended prefetch to a `user-initiated` host and requires it to go red naming the host. `allowlist-doc-consistency` and the generator accept the new disposition. (A)
- [x] **UPD-25**: The generator's firefox-branding emitter writes `app.update.langpack.enabled=false` for both variants, and both tracked branding files are regenerated and byte-compared. A row derives the set of update prefs from the generator output and asserts it sets none of `app.update.auto`, the staging pref, the check interval, `app.update.promptWaitTime` or `app.update.badgeWaitTime`; its self-test plants one of them. (A)
- [x] **PKG-08**: A script generates `LICENSING.md` and `THIRD-PARTY-NOTICES.txt` from the about:license output, the Theia dependency licences and the Node licence. A row derives both files and fails on drift. Both ship as assets of every Release. (A)
- [x] **PKG-09**: The release scope is en-US only, stated in the README, on /download and in the release notes, and recorded in PROJECT.md. (A)

### Repo controls

- [ ] **GH-02**: Every repository and organisation setting this milestone relies on is declared in a tracked `.github/settings/*.json` body, applied with `gh api`, and read back by the full-tier row `repo-controls` (`scripts/verify-repo-controls.mjs`); its self-test plants a missing ruleset, a `null` environment branch policy and an App holding the Workflows permission. (A)
- [ ] **SEC-06**: The organisation requires 2FA, a second organisation-owner account exists, and offline 2FA recovery codes for both accounts are stored outside GitHub. (A)
- [ ] **SEC-11**: Fork pull-request workflow approval is set to "all external contributors" before any self-hosted runner is registered; `repo-controls` reads it back. (A)
- [ ] **GH-05**: A `main` ruleset blocks force-push and deletion, requires the `verify` check, and requires one approving review on pull requests, with the owner as the only bypass actor. `repo-controls` asserts that no App is a ruleset bypass actor and that the required approving-review count is 1. (A)
- [ ] **GH-06**: A tag ruleset restricts tag creation to the `powerbrowser-bot` App. No required-signatures rule on tags exists, and the claim at `docs/RELEASING.md:922-925` that tags are signature-bound is removed. (A)
- [ ] **GH-07**: Environments exist with branch policy `main` only: `release` (owner as required reviewer, admin bypass disabled), `descriptor` (owner as required reviewer plus a 1440-minute wait timer), `bot`, `fixer` and `triage`. `repo-controls` fails on any environment whose branch policy is `null`. (A)
- [ ] **GH-08**: The Actions policy allows selected actions only, with `sha_pinning_required: true`. `.github/settings/actions-selected.json` admits every action the workflows use, the default workflow token is read-only, and repository-level secrets number zero. (A)
- [ ] **GH-09**: Immutable releases are enabled while the repository has zero Releases; Discussions, private vulnerability reporting and auto-merge are on. (A)
- [ ] **GH-10**: Two GitHub Apps exist: `powerbrowser-bot` (Contents, Pull requests and Issues read/write; Administration read; Dependabot alerts read; no Workflows), installed on `powerbrowser`, `powerbrowser-updates` and the Homebrew tap repo; and a clock App (Actions read/write), installed on `powerbrowser` only. Their permission sets are tracked JSON bodies, and `repo-controls` reads back both permission sets and both installations' repository lists. (A)
- [ ] **GH-11**: The runner-group "selected workflows" restriction is probed on the Free plan. If it is available, the legion runner's group is restricted to `release.yml@refs/heads/main`. The probe result is recorded in `docs/RELEASING.md`. (A)
- [x] **GH-12**: The quick row `workflows` (`scripts/verify-workflows.mjs`) parses every `.github/workflows/*.yml` and asserts: no `schedule:` key; the legion label appears only in `release.yml` jobs named `build-*` or `matrix-*`, none of which has a `secrets.` reference or an `environment:`; `claude-code-action` only on GitHub-hosted jobs, with no App-token step and no `contents: write`; `issues: write` only on the `release-train.yml` report job and on `triage.yml`; every `workflow_run` job guards `head_repository.full_name == github.repository`, and no `workflow_run`-triggered workflow is itself a `workflow_run` source; every `uses:` is a 40-hex SHA admitted by `actions-selected.json`; `contents: write`, `id-token: write` and `attestations: write` together only on `sign-publish`; no `pull_request` or `pull_request_target` trigger on `release.yml` or `release-train.yml`; no cache step in any release-path job; no `github.event.(issue|comment|pull_request|head_commit|review)` text inside `run:` or `prompt:`. The self-test plants each fault. (A)
- [x] **AUTO-09**: `zizmor --offline` runs as a quick row over `.github/workflows/`, green on the tree. (A)
- [ ] **GH-18**: Actions email is set to failed runs only, and GitHub Mobile push is on for deployment approvals, assignments and mentions. One test assignment and one test pending deployment each reach the owner's phone, and the result is recorded in `docs/RELEASING.md`. (A)

### Community surface

- [ ] **GH-13**: `labels.json` is the label set (families type/*, os/*, format/*, area/*, plus needs-triage, needs-info, confirmed, duplicate, wontfix, good-first-issue, security, upstream, release-train, claude-fix, train:blocked), applied with `gh label create --force` before the issue forms land. `repo-controls` compares the live labels with `labels.json` as set equality. A quick row asserts that every label named in `.github/ISSUE_TEMPLATE/*.yml` and in workflow files is in `labels.json`; its self-test plants an undeclared label. (A)
- [ ] **GH-01**: Issue forms exist: `bug.yml` (labels `type/bug` and `needs-triage`; field ids `version`, `os`, `install_format` as URL-prefillable text inputs, plus steps, expected and diagnostics), `feature.yml`, and `config.yml` with blank issues off and links to Discussions and the security policy. (A)
- [ ] **GH-14**: `SECURITY.md` (private vulnerability reporting first, security@powerbrowser.org second, latest release supported only, stated acknowledgement window), `SUPPORT.md` and `docs/KNOWN-ISSUES.md` exist in the product repo; the org `.github` repo carries `SECURITY.md`, `CONTRIBUTING.md` and `CODE_OF_CONDUCT.md`. (A)

### Patch regeneration

- [x] **AUTO-10**: `scripts/regenerate-patches.sh` rewrites each `patches/NNN-*.patch` from `git -C upstream diff --abbrev=10` (no `--full-index`) over the paths that patch's own `diff --git` headers name (both sides, so deletions and renames are kept; a regeneration that drops a file is refused); `--check` re-derives and byte-compares each file whose upstream base is unchanged, and for a file upstream moved compares only the `+`/`-` lines (owner ruling 2026-10-22, CR-01: a hand edit to context lines alone in a moved file is not caught). The quick row `patches-regenerated` passes on all tracked patches, and its self-test plants a hand-edited hunk body that must go red naming the patch. (A)

### Upstream automation

- [x] **AUTO-08**: After DIST-06, `rebase-upstream.yml` gains `on: workflow_call` with a `tag` input that has no default, and runs `node scripts/generate.mjs` inside `nix develop .#theia`. `verify-upstream-pins.mjs` asserts that the input has no default, so an ESR bump never edits a workflow file. (A)
- [ ] **AUTO-01**: `scripts/detect-upstreams.mjs` detects a new ESR point release by listing `FIREFOX_<pinned major>_*esr_RELEASE` tags (never `_BUILDn`), with product-details `FIREFOX_ESR` used only as a cross-check. The quick row `detect-upstreams-self-test` covers the tag mapping and the major guard from fixtures, including one where `FIREFOX_ESR` is `175.0esr` and a `FIREFOX_153_23_0esr_RELEASE` tag exists, which must yield a 153.23 detection. (A)
- [ ] **AUTO-06**: On detection the train's `bump` job (rebase-upstream.yml through `workflow_call`, `contents: read`, `persist-credentials: false`) moves the pin, regenerates, replays the patches and runs check-patch-surface, scan-brand-residue, the generated byte-identity check and `--quick`. The `bump-pr` job (env `bot`) then opens or updates `chore/esr-<tag>` with the App token, so `verify.yml` runs on it without an approval click. (A)
- [ ] **AUTO-07**: A replay failure causes the train's report job to open or update exactly one issue titled "ESR <tag>: patch <NNN> did not apply", carrying the apply log and `git -C upstream diff` and assigned to the owner. The automation never edits a patch by hand. (A)
- [ ] **AUTO-04**: The Node detector reads nodejs.org `index.json` for the Node 24 line, verifies `SHASUMS256.txt` and its signature inside the job, and opens a `chore/node-v24.x` PR bumping `powerbrowser/packaging/node-runtime.json`. The manual gpg step at `docs/BUILD.md:1041-1049` is removed. (A)
- [ ] **AUTO-02**: Self-hosted `renovatebot/github-action`, dispatched by the maintenance sweep on the first tick after each last-Thursday Theia release and on owner dispatch, with the bot App token, opens one grouped `@theia/**` PR (`@theia/monaco-editor-core` separate) with `rangeStrategy: pin`, a customManager that rewrites `theia_release` in `configuration.toml`, and `flake.lock` updates through the nix manager. Automerge is off. (F)
- [ ] **AUTO-03**: Dependabot updates the github-actions ecosystem weekly in one group and applies npm security-only updates to `theia/yarn.lock` (version updates off), with SHA-pin comments kept as plain version comments. Dependabot alerts are on, and CodeQL default setup covers `theia/extensions` and `scripts/`. (F)
- [ ] **DIST-05**: `docs/RELEASING.md` states that PowerBrowser ships one release per ESR point release, that out-of-band releases go out by `revision` bump, and the npm-advisory path and its response time. The observable half is the TRAIN-07 pin-age row. (F)
- [ ] **UPS-02**: The Node 24 line decision is recorded, with its Maintenance end (2028-04-30) as a `docs/RENEWALS.md` row. (F)

### Release train

- [ ] **INF-03**: The `powerbrowser-scheduler` Worker (own repo, workers.dev first) is a clock only. Each hour it mints a clock-App installation token from a PKCS#8 key, sends a `User-Agent`, issues one `workflow_dispatch` of `release-train.yml` with `reason=tick` and `return_run_details: true`, and emails the owner through Email Routing if the dispatch fails. It contains no detection, liveness or descriptor logic. The CPU time of the RS256 JWT mint is measured against the Workers Free 10 ms per-invocation limit and recorded in `docs/RELEASING.md`. (A)
- [ ] **TRAIN-01**: `release-train.yml` starts only from `workflow_dispatch` (`reason` tick, owner or self) and from single-level `workflow_run` on `verify.yml` and `release.yml` completion. It runs in one `release-train` concurrency group with no `cancel-in-progress` and no `queue: max`, and it validates every dispatched input (tag regex, release key strictly greater than the latest Release tag) before acting. (A)
- [ ] **TRAIN-02**: Each release key has exactly one tracking issue, found by label and title on every run and rendered from GitHub facts by the report job. The body is PATCHed only when the rendered bytes differ and is never read back as state. Tracking issues are locked to collaborators, closed on DONE and reopened on withdraw. The owner gets an @-mention comment and an assignment only on entering a state that needs them. (A)
- [ ] **TRAIN-03**: The train derives its states from GitHub facts with no stored state, from one state table in `scripts/release-train.mjs`. Phase A delivers DETECTED, BUMPING, CONFLICT, BUMP_RED and BUMP_PR_GREEN. The train makes at most one transition per release per run and ends the run at the owner's merge gate. Exit test: the first ESR 153 point release after the Phase 43 train lands (153.7 on 2026-11-10, else 153.8 on 2026-11-24, and so on) arrives as a bot PR with a tracking issue and no owner dispatch. (A)
- [ ] **TRAIN-08**: Every train stage takes a `dry-run` input that validates and renders but commits, opens, comments and dispatches nothing; the `workflows` row asserts that every write step is gated by it. (A)
- [ ] **TRAIN-09**: The quick row `release-train-logic-self-test` runs `scripts/release-train.mjs` `derive`, `next` and `render` over fixture API JSON. It plants one fixture per state, with the state list derived from `release-train.mjs`'s state table and compared as set equality, so a state without a fixture, or a fixture without a state, goes red. Additional fault plants: a merged PR with an unchanged pin, a draft Release, a fork-head `workflow_run`, a duplicate tracking issue and a 175.x ESR under the 153 guard; each must go red naming the drift. The release-stage fixtures land with E and the fixer and supersede fixtures with F, as those states are added. (A)
- [ ] **TRAIN-07**: One pinned `release-train: maintenance` issue is re-rendered by the train's report job from a daily sweep (first tick after 06:00 UTC) on a GitHub-hosted runner. It comments only when a row turns red. Initial rows: legion runner online; ESR pin age (red when a `FIREFOX_153_*esr_RELEASE` tag newer than the pin is more than 3 days old with no matching Release); channel liveness; watchdog last-run age; and one synthetic POST to `events.powerbrowser.org/events` that returns 2xx and whose row is deleted or marked synthetic (red otherwise). Later requirements add their own rows. (D)
- [ ] **MON-01**: A `schedule:` watchdog workflow in `powerbrowser-updates` checks every day that the last `release-train` run is less than 26 hours old, and opens an issue in its own repo otherwise. Stopping the Worker cron for 26 hours opens that issue. (D)
- [ ] **TRAIN-10**: The train adds the states BUILDING, AWAITING_APPROVAL, PUBLISHED, DESCRIPTOR_WAIT, DESCRIPTOR_LIVE, LIVE_RED, WITHDRAWN and DONE, derived from the `release.yml` run, pending deployments, the Release and the `powerbrowser-updates` contents. It dispatches `release.yml` with the merge SHA after the bump PR merges, and links the exact run in the tracking issue. Before building, `release.yml` validates that the dispatched SHA is the tip of `main`, or an ancestor of it whose commit changes `configuration.toml`, and exits otherwise. (E)
- [ ] **TRAIN-04**: When a newer ESR is detected while a train is open, the old train enters SUPERSEDED on its issue, its pending `release` deployment is cancelled, and the new train starts. A chemspill (an out-of-band revision for the same ESR) takes priority over a scheduled train. The sign job exits when a newer Release already exists. (F)
- [ ] **TRAIN-06**: A red stage labels its tracking issue `train:blocked`, assigns the owner and links the failing log. It starts the fixer when the failure class is fixable (FIX-01). Failures in `release.yml` cause the report job to open an issue only; the fixer is not started. (F)
- [ ] **TRAIN-11**: The maintenance sweep adds rows for `renewals-due` (any `docs/RENEWALS.md` date within 30 days is red), `repo-controls`, the open Dependabot PR count, open Dependabot and CodeQL alert counts, CodeQL last-push age, and the Codeberg `main` SHA against GitHub `main`. (F)
- [ ] **TRAIN-05**: A second ESR major runs as a parallel train with its own release keys and tracking issues while the 153.x security trains continue (Phase L dual-build window). (L)

### Claude fixer

- [ ] **FIX-01**: The train starts the fixer by `workflow_dispatch` for three classes only: patch-replay conflict on `chore/esr-*`, a red bump PR on `chore/esr-*`, `chore/node-*` or the Renovate Theia branch, and red `main`. It never starts for `release.yml` failures, fork heads or external authors. (F)
- [ ] **FIX-03**: The fixer runs as three jobs. `fix` runs in env `fixer` with a read-only `GITHUB_TOKEN` and the Anthropic credential, holds no App token, and checks the target out into `work/`. `fix-gate` has no secrets. `fix-pr` runs in env `bot`, is the only job that mints the App token, and opens a PR labelled `claude-fix` and `release:<key>` with a templated body (failing check, diff stat, paths, attempt count), assigned to the owner. The fixer never merges, never approves an environment and never reads signing material. (F)
- [ ] **FIX-02**: The fixer changes a patch only through `scripts/regenerate-patches.sh`. Edit and Write on `patches/**` are denied to Claude, and `fix-gate` runs `regenerate-patches.sh --check` on a fresh replay at the target tag. (F)
- [ ] **FIX-11**: `fix-gate` reads one deny-list file, `.github/fix-gate-deny.json`, and rejects a diff that touches any entry: `.github/**`, `.claude/**`, `CLAUDE.md`, `scripts/verify-platform.sh`, `patches/030-*`, `powerbrowser/packaging/mar/**`, `brand/mar-*.der`, `inventory/brand-tokens.json`, `powerbrowser/endpoint-allowlist.json`, `.github/settings/actions-selected.json`, `quick-baseline.txt`, `toolchain-baseline.txt` and `flake.lock`, plus every file a registry row names (derived by parsing the registry at gate time). It then runs apply non-vacuity, check-patch-surface, scan-brand-residue, `diff-theia-core.sh` and `--quick`. (F)
- [ ] **FIX-04**: Every fixer job runs on GitHub-hosted runners, never on legion; the `workflows` row asserts it. (F)
- [ ] **FIX-05**: Fixer spend is bounded by a dedicated Anthropic Console workspace with a monthly limit (separate from triage), `--max-turns`, `timeout-minutes`, at most 2 attempts per (release key, class), and its own `claude-fixer` concurrency group. Attempts are counted from `fix` job runs whose `run-name` carries the release key and class, so an attempt that `fix-gate` rejects is counted. The third failure moves the release to NEEDS_OWNER, a state in the TRAIN-03 state table. (F)
- [ ] **FIX-06**: The `fix` job loads `.claude/` and `CLAUDE.md` from a `main` checkout, never from the `work/` target, so the target branch cannot change Claude's rules. (F)
- [ ] **FIX-12**: The fixer authenticates to Anthropic through GitHub OIDC workload identity federation (`id-token: write` on the `fix` job only), once the pinned action source shows that passing `github_token` suppresses the action's own App-token exchange. Otherwise it uses an `ANTHROPIC_API_KEY` stored only in the `fixer` environment, with no `id-token`. The outcome is recorded in `docs/RELEASING.md`. (F)
- [ ] **FIX-08**: In both the fixer and `triage.yml` (GH-03), `claude-code-action` is pinned by commit `db77d4d3c98f3f6380e7cd45ffba2342a3dbde3c` (not the tag object), Claude Code is pinned to an exact version through `path_to_claude_code_executable`, and `show_full_output` is false; in the fixer `display_report` is also false. `ACTIONS_STEP_DEBUG` is never set on the repo. The `workflows` row asserts each. (F)
- [ ] **FIX-09**: The fixer prompt is built from trusted fields only (job name, check label, logs and diffs the workflow fetched itself), passes untrusted text as a framed data file, allows an explicit tool list with no bare `Bash`, and denies WebFetch and WebSearch. The fixer never starts on a `claude-fix/*` head or for the bot actor, and `allowed_bots` is an explicit list, never `'*'`. (F)
- [ ] **FIX-07**: The quick row `fix-gate-self-test` plants one diff per entry of the FIX-11 deny list, with the list read from `.github/fix-gate-deny.json` (fix-gate's own configuration), plus a hand-edited patch hunk. After a green control, each plant must be rejected naming the path. (F)
- [ ] **FIX-10**: The fixer is proven live on a real red PR (expected: the Theia 1.77 bump needing TypeScript 6.0) before 2027-05-27. The fixer PR passes `fix-gate` and is reviewed and merged by the owner. (F)

### Trust path

- [ ] **SEC-05**: An offline secondary MAR key is generated in a recorded ceremony. Patch 030, regenerated with `regenerate-patches.sh`, carries the primary DER in one slot and the secondary in the other. Two offline `.p12` copies are mandatory in `docs/RELEASING.md`, and `ng065` gains a "signed by the secondary key only" plant that must be accepted. (B)
- [ ] **UPD-14**: `scripts/build-update-xml.mjs` imports `buildUpdateXml` from `verify-mar-update-hop.mjs` and writes one descriptor per BUILD_TARGET with `detailsURL`, idempotently, from the built artifacts. (B)
- [ ] **UPD-26**: The full-tier row `descriptor-monotonic` requires every offered `buildID` to be strictly greater than every buildID already published for that appVersion, read from the Releases' `release-manifest.json`. Its self-test plants a same-version older-buildID descriptor. `MOZ_BUILD_DATE` is never pinned to the ESR tag, and rollback is possible only through an owner-dispatched `--rollback-to`. (B)
- [ ] **SEC-07**: Before `signmar -s`, the sign job reads the MAR product-info block and requires its channel to equal `ACCEPTED_MAR_CHANNEL_IDS`. It then signs with the container-built `signmar` on `ubuntu-latest` and verifies with `signmar -v` against the tracked DER. (E)

### Packaging

- [ ] **PKG-06**: Theia state lives under the Gecko profile directory instead of `XDG_CONFIG_HOME`/`HOME`, and the matrix no-residue checks inspect the real paths. (C)
- [ ] **PKG-17**: Release Gecko builds run in a Debian bookworm container under podman on legion with `--enable-bootstrap` (Mozilla clang, rust, cbindgen and the jessie sysroot) and produce the Linux tar.xz and the complete MAR. (C)
- [ ] **PKG-22**: The full-tier row `portable-elf` asserts that no ELF in the Linux tarball, the sidecar natives included, carries a `/nix/store` interpreter or RUNPATH, and that the maximum required GLIBC symbol version is no greater than the shipped glibc floor, 2.28 (owner ruling 2026-10-22: official Node needs 2.28), declared once in `powerbrowser/packaging/portability-floor.json`. The measured release container sysroot glibc (2.19, jessie) must not exceed that floor. RUNPATH is stripped at staging, and the self-test plants a `/nix/store` RUNPATH and a binary requiring a newer GLIBC symbol. (C)
- [ ] **PKG-18**: The full-tier row `sidecar-no-symlinks` asserts that `find <stage> -type l` is empty; its self-test plants a symlink. (C)
- [ ] **PKG-23**: The full-tier row `package-target-natives` asserts that every `.node`, `rg` and `node` binary in a staged package matches the package's target (ELF x86-64, PE32+, or Mach-O universal); its self-test plants a Linux `.node` into a Windows staging copy. (C)
- [ ] **PKG-04**: The packaged-launch and packaged-identity rows pass on the container-built tarball, with the sidecar resolving `backendMain` and `nodePath` relative to the app directory. (C)
- [ ] **PKG-05**: The release package's Theia About dialog carries the release-variant legal notices. (C)
- [ ] **PKG-07**: A URL given on the command line opens in the stock browser window. (C)
- [ ] **PKG-21**: The complete MAR size is measured and stated on /download. The partial-MAR decision is recorded: complete MARs only, unless the measurement shows complete MARs are too large for a two-week cadence. (C)
- [ ] **AUTO-05**: The release build job runs `toolchain-baseline.sh` against a `toolchain-baseline.txt` that pins the container's Mozilla bootstrap toolchain (clang, rust, cbindgen, sysroot and the container image digest). Drift fails the build. (E)

### Update experience

- [ ] **UPD-18**: `PowerBrowserAPI.sys.mjs` observes `update-staged`, `update-downloaded`, `update-available` and `update-error`, reads `nsIApplicationUpdateService.currentState`, and pushes `{kind: 'appUpdate', status, version?}` over the existing `PowerBrowserWebTabState` path. Each touchpoint is catalogued in `INTERNAL-APIS.md`, and `check-internals-boundary.sh` is green. (C)
- [ ] **UPD-19**: The shell accepts three new request kinds, `appUpdateState`, `checkForUpdates` and `restartToUpdate`; `restartToUpdate` restarts through `eRestart` after `quit-application-requested`, and the layout flush still runs. The quick row `shell-request-kinds` compares the kinds `handleShellMessage` accepts with the kinds the Theia client dispatches, as set equality; its self-test plants a stray kind. (C)
- [ ] **UPD-20**: When an update is staged, the user sees "PowerBrowser <version> is ready to install. Restart PowerBrowser to finish updating." with Restart now and Later, plus a status-bar item. Restart now restarts into the new version. (C)
- [ ] **UPD-21**: When this copy cannot update itself, the user sees "PowerBrowser cannot update this copy because its folder is read-only. Unpack PowerBrowser somewhere you own, or install it with your package manager." with Open download page. On macOS the text is "PowerBrowser cannot update itself from this location. Move PowerBrowser to your Applications folder, then open it again." (C)
- [ ] **UPD-22**: When an update check or download fails, the user sees "PowerBrowser could not check for updates. Check your internet connection, then choose Check again." with Check again, at most once per session. (C)
- [ ] **UPD-23**: The command palette offers "PowerBrowser: Restart to Update" and "PowerBrowser: Check for Updates". (C)
- [ ] **UPD-32**: The `shell-error-copy-no-internals` row, or a new sibling quick row with its own `--self-test`, derives the update-notification strings (UPD-20 to UPD-22) and the command titles (UPD-23, TEL-05) from the `@powerbrowser/branding` contribution and applies the same shape test (names "PowerBrowser", no internal identifier, ends with a next step that is an on-screen affordance). Its self-test plants a pref key into one string. (C)
- [ ] **UPD-24**: The full-tier `mar-update-hop` row drives the in-Gecko WebDriver path to assert the ready notification, clicks Restart now, asserts version N+1 and the restored layout, and plants a read-only app directory that must produce the cannot-update message. (C)
- [ ] **UPD-27**: A check confirms that `UpdateListener`'s `NimbusFeatures.updatePrompt.recordExposureEvent` neither throws nor makes a network request with `MOZ_NORMANDY` removed. (C)
- [ ] **UPD-15**: The endpoint allowlist gets a `user-initiated` `github.com` row, an `allow` row for `downloads.powerbrowser.org` (the R2 MAR origin, DIST-08, owner ruling 2026-10-29) confirmed by a layer-3 observation of a real update, no updater justification on `release-assets.githubusercontent.com`, a `crash-reports.mozilla.com` deny row, a corrected geolocation row, and corrected stale texts (`firefox-branding.js:131-132`, `endpoint-allowlist.json:22`). Any Mozilla host this pass dispositions `allow` is named in REQUIREMENTS.md "Inherited network egress" and in ROADMAP.md in the same commit, so `allowlist-doc-consistency` stays green. The status of Mozilla partner search codes under `org.debios` is recorded. (C)
- [ ] **UPD-28**: Generated branding prefs set `identity.fxaccounts.enabled=false`, and no Firefox Accounts or Sync host is contacted in a verify-endpoints run. (C)
- [ ] **UPD-29**: The release build uses a Google Safe Browsing API key from a keyfile outside the repo, mounted into the container build. A `docs/RENEWALS.md` row exists for the key, and a live check shows the Safe Browsing lists updating. (C)

### Hosting and site

- [ ] **INF-01**: DNS for powerbrowser.org moves from Namecheap to Cloudflare. The Namecheap records, mail forwarding and redirects are inventoried before the move, DNSSEC is off during it, and every inventoried record resolves after it. (D)
- [ ] **INF-06**: The Cloudflare account has 2FA, and every Cloudflare credential has one named holder: a wrangler deploy token in the scheduler and telemetry repos only; an R2 object-write token scoped to the MAR origin bucket (primary, owner ruling 2026-10-29), held only as a `release` environment secret (DIST-08); and no Cloudflare token in the maintenance sweep, which writes download counts through the telemetry Worker (TEL-11). Each token has a `docs/RENEWALS.md` row. (D)
- [ ] **DIST-03**: `powerbrowser-updates` deploys to Cloudflare Pages at updates.powerbrowser.org with one `update.xml` per channel and BUILD_TARGET plus one `_redirects` 200 rule. A live probe of a real 11-segment update URL, with the escapes and parentheses a client sends, returns the descriptor. The full-tier row `updates-repo-static` asserts through `gh api` that `powerbrowser-updates` has no `functions/` and no `_worker.js`; its self-test plants each in a fixture listing. (D)
- [ ] **INF-02**: Cloudflare Email Routing delivers security@, contact@ and privacy@powerbrowser.org to the owner, shown by one test message to each. (D)
- [ ] **WEB-01**: powerbrowser.org's home page is static HTML with zero external requests and no per-release version facts. It spells the product "PowerBrowser" (fixing `index.html:348`) and carries the footer sentence "DeBIOS Foundation and PowerBrowser are not officially associated with Mozilla or its products". (D)
- [ ] **WEB-02**: /download offers static `/releases/latest/download/<stable-name>` links, `SHA256SUMS`, `gh attestation verify` with a note that gh needs a GitHub login plus an offline `--bundle` alternative, and the statement that the attestation covers the upload rather than the legion build. It also gives per-OS signing status, system requirements, the en-US scope and the MAR size. (D)
- [ ] **WEB-03**: /legal states the PolyForm Noncommercial 1.0.0 licence and the trademark lines, and links `LICENSING.md` and `THIRD-PARTY-NOTICES`. (D)
- [ ] **WEB-04**: `/.well-known/security.txt` (RFC 9116) is served through Cloudflare's zone-level security.txt feature. (D)
- [ ] **WEB-05**: `powerbrowser-website` deploys to a Cloudflare Pages project at powerbrowser.org on push to its default branch. A live GET of `/`, `/download`, `/privacy` and `/legal` returns 200 and the page loads make zero third-party requests. (D)
- [ ] **TEL-08**: /privacy states the opt-in `/events` payload (type, basename, line, column, version, buildID, OS; no message, no stack), the 30-day retention, Cloudflare as the only processor, the hosts contacted unattended, privacy@ and the postal address. (D)

### Telemetry and reports

- [ ] **TEL-06**: The Theia error producer sends version, buildID and OS with each report, and no message or stack. `[telemetry]` states the endpoint at level off, so raising the preference is the opt-in. The preference description reads: "Send error reports to PowerBrowser. When this is on, PowerBrowser sends the error type, file name, line number, version and operating system when something goes wrong. It never sends page content or error messages. Turning this on also lets installed VS Code extensions send their own telemetry." A loopback live-delivery row observes one POST from a running sidecar, and the S8 draft's `message` field is corrected. (D)
- [ ] **TEL-10**: The telemetry Worker's `POST /events` validates the payload and writes to D1, a scheduled job deletes rows older than 30 days, and one Cloudflare rate-limiting rule protects the route. (D)
- [ ] **TEL-11**: The maintenance sweep records each Release asset's `download_count` daily by POSTing to an authenticated telemetry Worker route that writes D1; the route's shared secret is held only as a `bot` environment secret and as a Worker secret, each with a `docs/RENEWALS.md` row, and the sweep holds no Cloudflare API token. (D)
- [ ] **TEL-05**: The command "PowerBrowser: Report a Bug" opens `issues/new?template=bug.yml` in the stock window, prefilled with version, OS and install format, and a Copy button on the diagnostics layer copies the diagnostics, which never appear in a URL. One `github.com` allowlist row carries the `user-initiated` disposition (UPD-33). (G)

### Release pipeline

- [ ] **SEC-08**: The legion runner is registered once, non-ephemeral, with a registration token. No PAT and no App private key is stored on legion; only the runner's own registration credential. It runs as its own user with no read access to `~/.config/powerbrowser-release`, with a work directory free of spaces, and its label appears only in `release.yml` jobs named `build-*` or `matrix-*`, none of which has a `secrets.` reference or an `environment:`. It is registered only after SEC-11, SEC-10 and GH-07 are in place. (E)
- [ ] **SEC-10**: A legion `ACTIONS_RUNNER_HOOK_JOB_STARTED` hook fails every job unless `GITHUB_WORKFLOW_REF` is `.../release.yml@refs/heads/main` and the event is `workflow_dispatch`. A planted job from another branch is rejected before any step runs. The SHA check in TRAIN-10 runs as the first step of every legion job. (E)
- [ ] **DIST-02**: `release.yml` runs on `workflow_dispatch` only. Its build-linux job runs on `[self-hosted, powerbrowser-release]` with `contents: read`, no environment and no secrets. It exits without building when the derived release key is not greater than the latest Release tag. The packaged-launch and install-matrix rows run against the packaged tree in this job. It hands the tarball, complete MAR and `release-manifest.json` to later jobs as artifacts with `retention-days: 1`. Artifact storage per release is measured against the 500 MB cap, and artifacts are deleted after sign-publish. (E)
- [ ] **DIST-07**: The `sign-publish` job (ubuntu-latest, env `release`) signs the MAR (SEC-07) and writes `SHA256SUMS`, versioned and stable asset names, the source tarball and `attest-build-provenance`. It derives release notes from the tree (MFSA link, ESR, Theia and Node versions, KNOWN-ISSUES excerpt, the en-US-only release scope (PKG-09); no `--generate-notes`) and creates a draft. Before the single publish it checks that the draft's asset set equals the set derived from this run's manifest, which includes the tarball, the MAR, `SHA256SUMS`, the source tarball, `LICENSING.md`, `THIRD-PARTY-NOTICES.txt` and, once K lands, the symbols (TEL-12). It mints the bot App token immediately before use, and that token both creates tag `v<ESR>-<revision>` and performs the publish, so the GH-06 tag ruleset does not block it. (E)
- [ ] **DIST-08**: `sign-publish` copies each MAR to R2, the primary MAR origin served at `downloads.powerbrowser.org` (owner ruling 2026-10-29), using the R2 object-write token from the `release` environment (INF-06). Keys are `<tag>/<asset>` and write-once: the step refuses to overwrite an existing key. The update descriptor's `patchURL` names this host; the GitHub Release keeps the same signed bytes as the archival copy. (E)
- [ ] **DIST-09**: The `descriptor` job (env `descriptor`, 24-hour wait timer and owner approval given after the owner's own N-1 to N hop) commits one `update.xml` per BUILD_TARGET to `powerbrowser-updates`, using an App token scoped to that repo, after `descriptor-monotonic` passes. (E)
- [ ] **UPD-17**: The `channel-live` job, run last in `release.yml` and daily in the sweep, requires each public `update.xml` to byte-equal its repo copy, each MAR URL to answer HEAD 200, and the offered version to equal the latest Release. (E)
- [ ] **REL-02**: A `workflow_dispatch` withdraw job in `powerbrowser-updates` commits the no-update descriptor for every target and reruns `channel-live`. It marks the product repo's Release as a pre-release with a bot App token (the App is installed on both repos, GH-10). A probe, run before the first public release and recorded in `docs/RELEASING.md`, shows whether immutable releases still allow the pre-release flag change; if not, the withdraw job marks the withdrawal in the Release notes instead. Releases are never deleted, and the fix is a new revision. (E)
- [ ] **GH-15**: Once a train reaches PUBLISHED, the train's report job copies `docs/KNOWN-ISSUES.md` into one pinned issue. (E)
- [ ] **INF-04**: One fallback Linux release build on a GitHub-hosted runner is measured cold, with no Actions cache and sccache off. Its duration and disk use are recorded in `docs/BUILD.md`. (E)
- [ ] **UPD-16**: The real-release hop drill (`served: release`) runs N to N+1 from a clean non-Nix Linux container or VM on legion. It proves hosts, hash, version, signature, allowed channels and attestation, with fault plants. (E)
- [ ] **REL-03**: The first public Linux release is published: the bump PR merged, `release` approved, the hop drill passed, /download live, and the descriptor released after the owner's `descriptor` approval. (E)

### Release documentation

- [ ] **DOC-03**: The cadence text says two weeks (`docs/RELEASING.md:681`, `README.md:46-47`, `rebase-upstream.yml:1-4`), the ESR 175 dates are current (`RELEASING.md:750-756`), and `RELEASING.md:909-910` states that a queued self-hosted job is cancelled after 24 hours. (A)
- [ ] **DOC-04**: `docs/RENEWALS.md` lists every renewable item with a date and an owner action: domain, Apple membership, Developer ID certificate, Azure validation, App keys, Cachix token, Safe Browsing key, each Cloudflare token (INF-06), Codeberg token, Anthropic keys, the winget submission credential, MAR certificate (2046), Node 24 end of life and the ESR 175 train dates. The quick row `renewals` checks structure only. (A)
- [ ] **DOC-05**: `docs/RELEASING.md` carries a rewritten secrets inventory (App keys per environment, no PAT or App key on legion, descriptor PAT replaced by the scoped App token), the non-ephemeral runner shape replacing `:258-288`, `:476-478` and `:917-920`, the `release` environment policy set to `main` (`:320-321`), and a legion-rebuild runbook (four objdirs of about 14 GB each). (A)
- [ ] **DOC-06**: The drafts S2, S3 and S8 under `.planning/drafts/distribution/` are reconciled with NG-065 and NG-067 or marked superseded. (A)
- [ ] **SEC-09**: `docs/RELEASING.md` documents the secondary-key ceremony and key rotation: which machine, which NSS database, how the DER reaches patch 030, and how the primary `.p12` reaches `MAR_SIGNING_P12_B64`. (B)

### Support operations

- [ ] **GH-03**: `triage.yml` runs on `issues: opened` in env `triage` with `claude-haiku-5-5`, `allowed_non_write_users`, an explicit `GITHUB_TOKEN` with `issues: write` only, and a concurrency group, under the FIX-08 pinning rules. Claude selects labels and a template id, and a non-AI step posts the fixed template text. Triage never closes an issue. A planted issue carrying instructions produces only a template comment. (G)
- [ ] **GH-16**: Triage uses its own Anthropic Console workspace with a monthly spend limit. (G)
- [ ] **GH-17**: Private vulnerability reports and security@ mail reach the owner as GitHub Mobile and phone notifications, within the acknowledgement window `SECURITY.md` states. (G)
- [ ] **GH-04**: A daily systemd timer on legion pushes git and tags to a Codeberg mirror with a deploy token held on legion, and the maintenance sweep's Codeberg row turns red when the mirror lags GitHub `main`. (G)
- [ ] **MON-02**: An Upptime repo on GitHub Pages serves a public status page at status.powerbrowser.org covering the updates host, the website and `/events`, in addition to the MON-01 watchdog. The maintenance sweep reports whether its workflows are enabled and how old their last run is. (G)
- [ ] **DOC-07**: `docs/RELEASING.md` gains a support-operations section covering triage, Discussions moderation, private vulnerability reports, CodeQL alerts after each rebase, and the rule that no fork PR workflow run is approved without reading its diff. (G)

### Windows

- [ ] **PKG-10**: Gecko for Windows is cross-built on legion in the release container with `--enable-bootstrap` in a `release.yml` `build-windows` job, and `mach repackage installer` produces the NSIS `setup.exe` plus a complete MAR. (H)
- [ ] **PKG-11**: The generator emits a per-target Windows mozconfig with `--disable-maintenance-service`. (H)
- [ ] **PKG-12**: A regenerated hook-only NSIS patch replaces the Mozilla literals, removes the install and uninstall pings, moves the registry namespace and carries PowerBrowser artwork. (H)
- [ ] **PKG-13**: The Windows Theia sidecar is built on a GitHub-hosted `windows-latest` runner, `node-runtime.json` carries a per-target Windows entry verified by SHASUMS in the Node detector, and `package-target-natives` passes on the Windows package. (H)
- [ ] **MTX-01**: An automated Windows 11 libvirt VM matrix on legion, run from a `release.yml` `matrix-*` job, installs, launches, updates and uninstalls the package. It covers runner-user libvirt access, snapshot revert, guest transport, a Windows-side script, and VM licence and update handling. (H)
- [ ] **UPD-30**: On Windows, quitting for an update waits on an AsyncShutdown blocker until the sidecar process is reaped, so the updater's rename never meets a live `node.exe`. A matrix row proves the update applies. (H)
- [ ] **UPD-31**: The Windows background update task path is verified live in the matrix, or deferred with the reason recorded. (H)
- [ ] **LEG-01**: `verify-trademark-surface.mjs` extends to the NSIS surface (`defines.nsi.in`, the uninstaller), application.ini Name and Vendor, Info.plist and `MOZ_LAUNCHER_SUBKEY`; its self-test plants a Mozilla mark in each. A Windows no-residue registry diff runs in the matrix. (H)
- [ ] **SEC-03**: The first Windows release ships unsigned with the maintenance service disabled, and /download states: "Windows may show a 'Windows protected your PC' warning when you open the PowerBrowser installer, because this release is not yet code-signed. Check the download against SHA256SUMS, then choose More info and Run anyway." (H)
- [ ] **SEC-12**: Windows Authenticode signing through Azure Artifact Signing Basic with jsign on Linux signs the inner PE files, then the installer, then the MAR is produced. /download updates its signing status. (H)
- [ ] **DIST-10**: `release.yml` gains a per-OS sign job and per-target descriptors for the Windows BUILD_TARGET. (H)

### macOS

- [ ] **PKG-14**: A universal DMG plus a complete MAR is built through `unify.sh`. Gecko is cross-built on legion in a `release.yml` `build-macos` job with the bootstrap macOS SDK, with a GitHub-hosted `macos-26` runner as the recorded fallback. (I)
- [ ] **PKG-15**: The darwin Theia sidecar is built per architecture on hosted macOS runners, and its natives, `rg` and `node` are merged with `lipo`; `package-target-natives` passes on the DMG. (I)
- [ ] **PKG-16**: A Mac matrix row runs on a hosted macOS runner against the draft DMG, and one real Mac session records the Gatekeeper copy. (I)
- [ ] **PKG-24**: The quick row `mac-entitlements` fails on any `43AQ936H96`, `org.mozilla` or restricted entitlement key in the signing inputs, which derive from `developer/browser.xml`; its self-test plants each. (I)
- [ ] **SEC-04**: The bundle is signed inside-out with a Developer ID (natives, `node`, `rg`, then frameworks, then the bundle) and notarized through an App Store Connect API key held as a `release` secret, with the Team ID supplied by a hook-only patch. (I)
- [ ] **SEC-13**: The Apple SDK licence position for cross builds, rcodesign's maintenance status and the Developer ID CA expiry date are checked and recorded before Phase I builds. (I)

### Package channels

- [ ] **PKG-19**: A flake package repacks the Release tarball with `fetchurl` and autoPatchelf, floorp-bin style. `DisableAppUpdate` is merged into the existing `policies.json` in the repack only; a row asserts that the release tarball's `policies.json` has no `DisableAppUpdate`. The sidecar uses `pkgs.nodejs_24`, and an overlay output exists. It covers x86_64-linux, and aarch64-darwin only after a signed DMG exists. /download gains a Nix row when the channel is live. (J)
- [ ] **INF-05**: A binary cache serves the flake package. The Cachix open-source licence is requested first, with an R2 S3 cache as the fallback. A clean machine's `nix build` of the package substitutes from the cache, and the cache token has a `docs/RENEWALS.md` row. (J)
- [ ] **PKG-20**: PowerBrowser is listed on Flathub with a manifest on `org.mozilla.firefox.BaseApp` (`--persist=.debios`, `DisableAppUpdate` in the Flatpak only, external-data-checker) and DNS TXT verification at `_flathub.powerbrowser.org`. Either the build-from-source exception is obtained in writing for the tarball repack, or the manifest builds from source. The PKG-19 row also asserts that the release tarball's `policies.json` has no `DisableAppUpdate`. /download gains a Flatpak row when the channel is live. (J)
- [ ] **DIST-04**: PowerBrowser is listed on winget through `wingetcreate`. (J)
- [ ] **DIST-11**: An own Homebrew tap with `auto_updates true` exists, and a cask follows notarization. (J)
- [ ] **DIST-12**: For each release, the train opens a bot PR to `main` carrying the flake hash update (the GH-05 ruleset forbids a direct commit), the bot App commits the Homebrew tap update, and `wingetcreate` submits the winget manifest PR to microsoft/winget-pkgs with the credential the External Gates table names. Flathub's external-data-checker opens its own PR. (J)

### Native crashes

- [ ] **TEL-09**: A hook-only patch gates the Glean crash ping, so no request reaches `incoming.telemetry.mozilla.org` before consent; a verify-endpoints run with the crash reporter enabled shows no such request. (K)
- [ ] **TEL-07**: The collector parses the `extra` part as JSON, and its self-test uses a Gecko-shaped plant. The submit URL key is reconciled with `[urls].crash_report`, and a Worker `POST /submit` stores minidumps in R2 under a 30-day lifecycle. (K)
- [ ] **TEL-12**: `mach buildsymbols` output is attached to each Release as part of the DIST-07 manifest asset set, a stackwalk runbook exists, and `docs/CRASH-POLICY.md` is rewritten. (K)
- [ ] **TEL-13**: `--disable-crashreporter` is retired only after TEL-09, TEL-07 and TEL-12 pass and the first Windows release has shipped. (K)

### ESR 175

- [ ] **UPS-01**: From the 175 beta (2027-06-10) the bump job runs replay-only against 175 tags, so conflicts surface early. The hook-only patches are rebased onto 175, the toolchain baseline is updated, and PowerBrowser ships on 175.x before 153.27 (2027-09-07). (L)
- [ ] **UPS-03**: The dual-build window fits legion's disk (two objdirs of about 14 GB each), with the hosted fallback build (INF-04) available, and the measured disk use is recorded. (L)

## Owner Decisions

All recorded 2026-10-20 by the owner. "§12 n" is SEED-002 section 12, decision n; each was taken at its first (recommended) option.

| # | Decision | Chosen option | Source |
|---|---|---|---|
| 1 | Clock (D-77) | Keep D-77: no `schedule:` in the product repo; one Cloudflare Worker Cron Trigger calls `workflow_dispatch` | §12 1 |
| 2 | Runner placement and shape | legion on the public repo, non-ephemeral, registered once with a registration token; no PAT or App key on legion; fork approval for all external contributors; `release.yml` never on `pull_request` | §12 2; SUMMARY gap 4 (C6) |
| 3 | Release tag creator | `sign-publish` creates the tag and publishes with the App token after approval; the signed-tag rule is dropped | §12 3 |
| 4 | Theia bump automerge | Off | §12 4 |
| 5 | Release cadence | One release per ESR point release, plus out-of-band revision bumps | §12 5 |
| 6 | Firefox Accounts and Sync | `identity.fxaccounts.enabled=false` in generated branding prefs | §12 6 |
| 7 | Safe Browsing | Obtain an API key; keyfile outside the repo; RENEWALS row; live list-update check | §12 7 |
| 8 | Static hosting | Cloudflare Pages | §12 8 |
| 9 | Crash reporter | Keep `--disable-crashreporter` through the first Windows release; retire only with TEL-09 and the Worker `/submit` | §12 9 |
| 10 | Signing timing | Apple enrolment after the site is live and a D-U-N-S number exists; Azure account only when the Windows phase is 3 to 4 weeks out | §12 10 |
| 11 | Build-job hand-off | Actions artifacts between the legion build and the hosted sign job; legion keeps `contents: read` | §12 11 |
| 12 | Canary delay | 24 hours between Release publish and descriptor publish | §12 12 |
| 13 | Website home page | No version facts; no `release.json` is committed by any workflow | §12 13; owner 2026-10-20 |
| 14 | Node bumps | Detector PR with in-job SHASUMS and signature verification | §12 14 |
| 15 | Worker role | Clock only. Detection, liveness, pin age and descriptor delay run in Actions. This amends SEED-002 automation rows 1, 4, 7 and 13 | SUMMARY gap 1 (C13) |
| 16 | Renovate host | Self-hosted `renovatebot/github-action`, dispatched by the train with the bot App token; Mend Renovate is not used | SUMMARY gap 3 (C7) |
| 17 | Fixer authentication | GitHub OIDC workload identity federation, with an `ANTHROPIC_API_KEY` in the `fixer` environment as fallback | SUMMARY gap 5 (C4) |
| 18 | Descriptor gate | The `descriptor` environment has the owner as required reviewer in addition to the 1440-minute wait timer, so the owner's own N-1 to N hop stays a gate | SUMMARY gap 2 (C14) |
| 19 | Toolchain baseline | `toolchain-baseline.txt` pins the release container's Mozilla bootstrap toolchain | SUMMARY gap 6 |
| 20 | Scope | All of SEED-002 phases A to L, plus the release-and-maintenance orchestrator (`release-train.yml` reconciler, one tracking issue per release, maintenance sweep) and the Claude fixer | Owner 2026-10-20 |
| 21 | Fixer limits | Opens PRs only; never merges, never approves environments, never touches signing keys; spend-limited; patches only through `regenerate-patches.sh` | Owner 2026-10-20 |
| 22 | Items research proposed trimming | Kept: Cachix (INF-05) and Flathub (PKG-20, with the exception or a from-source manifest). Added: Upptime (MON-02) as a public status page alongside the external watchdog (MON-01) | Owner 2026-10-20 |

## External Gates

| Gate | Blocks | Lead time or date | Owner action |
|---|---|---|---|
| D-U-N-S number | Apple fee-waiver application, SEC-04, Phase I | Weeks, unknown | Request now (no cost) |
| Apple Developer Program enrolment | SEC-04, PKG-14..16 signing, DIST-11 cask, PKG-19 aarch64-darwin | After the site is live (WEB-01..05) and D-U-N-S exists; USD 99/year or waived | Apply for the nonprofit fee waiver; create the App Store Connect API key |
| Azure Artifact Signing identity validation | SEC-12 | 1 to 20 business days; billed monthly from account creation (about USD 10/month) | Create the account when Phase H is 3 to 4 weeks out |
| ESR 153 calendar | DIST-05, AUTO-01 exit test | 153.6 on 2026-10-27, then every two weeks (153.7 11-10, 153.8 11-24, 153.9 12-08, 153.10 2027-01-12) | Merge and approve each release |
| ESR 175 calendar | UPS-01, TRAIN-05, FIX-10 deadline | Nightly 2027-05-27, beta 2027-06-10, release 2027-06-29; ESR 153 ends with 153.27 on 2027-09-07 | Fixer proven before 2027-05-27; ship 175.x before 153.27 |
| Cloudflare account | INF-03 (workers.dev), INF-01, Phase D | Now (no cost) | Create the account with 2FA |
| Namecheap nameserver change | INF-01 | Up to 24 hours to propagate | Inventory records, then point the nameservers at Cloudflare |
| Cloudflare R2 enablement | DIST-08, TEL-07, INF-05 fallback | Before Phase E; R2 may require a payment method on file even on the free tier (verify) | Enable R2; add a payment method if required |
| GitHub Apps creation and installation | GH-10, AUTO-06, INF-03 | Phase A | Create both Apps; install the bot App on `powerbrowser`, `powerbrowser-updates` and the Homebrew tap, the clock App on `powerbrowser`; store keys in environments and the Worker |
| Second org owner and 2FA recovery codes | SEC-06 | Phase A | Add the account; store codes offline |
| Secondary MAR key ceremony | SEC-05, Phase B | Phase B | Generate the key offline; keep two `.p12` copies |
| legion NixOS changes (runner, pre-job hook, Codeberg timer, libvirt access) | SEC-08, SEC-10, GH-04, MTX-01 | Phases E, G, H | Edit `/etc/nixos/configuration.nix` and finish with `nrs` |
| Runner registration | SEC-08 | Phase E, after SEC-11, SEC-10, GH-07 | Register once with a registration token |
| Per-release approvals | Every release | Every two weeks | Approve `release`; approve `descriptor` after the own-install hop |
| Anthropic Console workspaces | FIX-05, FIX-12, GH-16 | Phase F, G | Create fixer and triage workspaces with monthly limits; set up OIDC federation or the key |
| Google Safe Browsing API key | UPD-29 | Phase C | Obtain the key; store the keyfile on legion |
| Codeberg account and deploy token | GH-04 | Phase G | Create the account and the mirror repo; issue a push token; store it on legion |
| Upptime repo and status CNAME | MON-02 | Phase G | Create the repo from the Upptime template; add the `status` CNAME in Cloudflare |
| Homebrew tap repo | DIST-11, DIST-12 | Phase 41 (created empty with GH-10) | Create the tap repo in the org; install the bot App on it |
| winget submission credential | DIST-04, DIST-12 | Phase J | Decide the credential: `wingetcreate` submits from a fork of microsoft/winget-pkgs, which an org App installation token cannot do, so this likely needs a PAT on an account that owns the fork, against the Apps-only rule. Record the choice, its holder environment and a RENEWALS row |
| Flathub submission account | PKG-20 | Phase J | Create the account and open the submission PR |
| Cachix open-source licence | INF-05 | Phase J | Send the licence email; fall back to R2 if refused |
| Flathub build-from-source exception | PKG-20 | Phase J | Request in writing; otherwise build from source |

## Future Requirements

Acknowledged, not in the v1.6 roadmap.

- **DIST-F1**: AUR `-bin` package (community-maintained).
- **DIST-F2**: `.deb` and `.rpm` packages with own repositories (updater off).
- **DIST-F3**: AppImage.
- **DIST-F4**: GitHub Sponsors and `FUNDING.yml`, once a fiscal host is approved.
- **TEL-F1**: Sidecar (Node) crash reporting; TheiaService already observes the sidecar exit.
- **UPS-F1**: An Open VSX pin script, once `configuration.toml` declares Open VSX pins.
- **AUTO-F1**: A feed reader on mozilla/foundation-security-advisories, if the ESR detector ever misses an MFSA.
- **INF-F1**: Move static hosting from Pages to Workers static assets.
- **GH-F1**: A second required reviewer on `release` once a second maintainer exists.
- **PKG-F1**: Locales beyond en-US.
- **PKG-F2**: aarch64-linux packages.

## Out of Scope

| Feature | Reason |
|---|---|
| MSI installer | Builds only on a Windows host with WiX; Mozilla's CI runs every other repackage step on Linux |
| MSIX | Not in the approved format plan; NSIS covers Windows |
| macOS PKG | Not in the approved format plan; the notarized DMG covers macOS |
| Snap | Not in the approved format plan; tar.xz, Nix and Flatpak cover Linux |
| Partial MARs | Complete MARs only (Zen precedent at the same cadence), unless PKG-21 measures them necessary |
| Nightly or other second channel | Doubles the train load for one owner; one channel |
| x86_64-darwin Nix output | nixpkgs drops x86_64-darwin after 26.05 |
| `schedule:` in the product repo | D-77; also GitHub disables scheduled workflows after 60 days without activity |
| Own dynamic update server (Balrog-like) | It is a server; static per-target descriptors suffice |
| A second updater (Theia, electron-updater, AppImage zsync) | One complete MAR carries Gecko, Theia, extensions and Node |
| Fixer auto-merge, fixer in `release` or `bot` jobs, fixer on legion | A wrong or injected fix would ship to every user |
| `workflow_run` chaining | GitHub stops chains at three levels; the train self-dispatches instead |
| Actions cache in the release path | Cache-poisoning path into release bytes; the hosted fallback build runs cold |
| Deleting a Release or reusing its tag | Immutable releases forbid tag reuse; withdraw and ship a new revision |
| Mend Renovate hosted | Replaced by self-hosted Renovate (decision 16); Mend's App holds workflow scope |
| `release.json` and version facts on the home page | Decision 13 |
| `--generate-notes` and `.github/release.yml` note categories | Lists PR titles only; notes are derived from the tree, so the categories file would have no consumer |
| Nix in the sign job | The container build supplies `signmar` |
| `mach repackage flatpak` | Refuses any product other than Firefox and Thunderbird |
| Ephemeral runner with a PAT or App key on legion | Decision 2: no PAT or App key on legion |
| Product analytics and Mozilla telemetry | Opt-in error reports only; adoption is read from download counts |
| Discord, Telegram or Slack notifications | Another inbox and secret; GitHub Mobile carries every owner signal |
| Socorro, Sentry, GlitchTip, BugSplat | A server or a third-party processor; the Worker plus R2 covers crashes |
| A VPS or paid runners | No-server principle; GitHub Free, Cloudflare Free and legion cover every workload |

## Traceability

The roadmapper fills the Phase column.

| Requirement | Phase | Status |
|---|---|---|
| REL-01 | Phase 40 | Complete |
| UPD-11 | Phase 40 | Complete |
| DIST-06 | Phase 40 | Complete |
| UPD-12 | Phase 40 | Complete |
| UPD-13 | Phase 40 | Complete |
| UPD-25 | Phase 40 | Complete |
| PKG-08 | Phase 40 | Complete |
| PKG-09 | Phase 40 | Complete |
| GH-02 | Phase 41 | Pending |
| SEC-06 | Phase 41 | Pending |
| SEC-11 | Phase 41 | Pending |
| GH-05 | Phase 41 | Pending |
| GH-06 | Phase 41 | Pending |
| GH-07 | Phase 41 | Pending |
| GH-08 | Phase 41 | Pending |
| GH-09 | Phase 41 | Pending |
| GH-10 | Phase 41 | Pending |
| GH-11 | Phase 41 | Pending |
| GH-12 | Phase 41 | Complete |
| AUTO-09 | Phase 41 | Complete |
| GH-18 | Phase 41 | Pending |
| GH-13 | Phase 42 | Pending |
| GH-01 | Phase 42 | Pending |
| GH-14 | Phase 42 | Pending |
| AUTO-10 | Phase 40 | Complete |
| AUTO-08 | Phase 40 | Complete |
| AUTO-01 | Phase 43 | Pending |
| AUTO-06 | Phase 43 | Pending |
| AUTO-07 | Phase 43 | Pending |
| AUTO-04 | Phase 43 | Pending |
| AUTO-02 | Phase 51 | Pending |
| AUTO-03 | Phase 51 | Pending |
| DIST-05 | Phase 51 | Pending |
| UPS-02 | Phase 51 | Pending |
| INF-03 | Phase 43 | Pending |
| TRAIN-01 | Phase 43 | Pending |
| TRAIN-02 | Phase 43 | Pending |
| TRAIN-03 | Phase 43 | Pending |
| TRAIN-08 | Phase 43 | Pending |
| TRAIN-09 | Phase 43 | Pending |
| TRAIN-07 | Phase 48 | Pending |
| MON-01 | Phase 48 | Pending |
| TRAIN-10 | Phase 50 | Pending |
| TRAIN-04 | Phase 51 | Pending |
| TRAIN-06 | Phase 52 | Pending |
| TRAIN-11 | Phase 51 | Pending |
| TRAIN-05 | Phase 58 | Pending |
| FIX-01 | Phase 52 | Pending |
| FIX-03 | Phase 52 | Pending |
| FIX-02 | Phase 52 | Pending |
| FIX-11 | Phase 52 | Pending |
| FIX-04 | Phase 52 | Pending |
| FIX-05 | Phase 52 | Pending |
| FIX-06 | Phase 52 | Pending |
| FIX-12 | Phase 52 | Pending |
| FIX-08 | Phase 52 | Pending |
| FIX-09 | Phase 52 | Pending |
| FIX-07 | Phase 52 | Pending |
| FIX-10 | Phase 52 | Pending |
| SEC-05 | Phase 44 | Pending |
| UPD-14 | Phase 44 | Pending |
| UPD-26 | Phase 44 | Pending |
| SEC-07 | Phase 49 | Pending |
| PKG-06 | Phase 45 | Pending |
| PKG-17 | Phase 45 | Pending |
| PKG-22 | Phase 45 | Pending |
| PKG-18 | Phase 45 | Pending |
| PKG-23 | Phase 45 | Pending |
| PKG-04 | Phase 45 | Pending |
| PKG-05 | Phase 45 | Pending |
| PKG-07 | Phase 45 | Pending |
| PKG-21 | Phase 45 | Pending |
| AUTO-05 | Phase 49 | Pending |
| UPD-18 | Phase 46 | Pending |
| UPD-19 | Phase 46 | Pending |
| UPD-20 | Phase 46 | Pending |
| UPD-21 | Phase 46 | Pending |
| UPD-22 | Phase 46 | Pending |
| UPD-23 | Phase 46 | Pending |
| UPD-32 | Phase 46 | Pending |
| UPD-33 | Phase 40 | Complete |
| UPD-24 | Phase 46 | Pending |
| UPD-27 | Phase 46 | Pending |
| UPD-15 | Phase 46 | Pending |
| UPD-28 | Phase 46 | Pending |
| UPD-29 | Phase 45 | Pending |
| INF-01 | Phase 47 | Pending |
| INF-06 | Phase 47 | Pending |
| DIST-03 | Phase 47 | Pending |
| INF-02 | Phase 47 | Pending |
| WEB-01 | Phase 47 | Pending |
| WEB-02 | Phase 47 | Pending |
| WEB-03 | Phase 47 | Pending |
| WEB-04 | Phase 47 | Pending |
| WEB-05 | Phase 47 | Pending |
| TEL-08 | Phase 47 | Pending |
| TEL-06 | Phase 48 | Pending |
| TEL-10 | Phase 48 | Pending |
| TEL-11 | Phase 48 | Pending |
| TEL-05 | Phase 53 | Pending |
| SEC-08 | Phase 49 | Pending |
| SEC-10 | Phase 49 | Pending |
| DIST-02 | Phase 49 | Pending |
| DIST-07 | Phase 49 | Pending |
| DIST-08 | Phase 49 | Pending |
| DIST-09 | Phase 49 | Pending |
| UPD-17 | Phase 49 | Pending |
| REL-02 | Phase 50 | Pending |
| GH-15 | Phase 50 | Pending |
| INF-04 | Phase 49 | Pending |
| UPD-16 | Phase 50 | Pending |
| REL-03 | Phase 50 | Pending |
| DOC-03 | Phase 42 | Pending |
| DOC-04 | Phase 42 | Pending |
| DOC-05 | Phase 42 | Pending |
| DOC-06 | Phase 42 | Pending |
| SEC-09 | Phase 44 | Pending |
| GH-03 | Phase 53 | Pending |
| GH-16 | Phase 53 | Pending |
| GH-17 | Phase 53 | Pending |
| GH-04 | Phase 53 | Pending |
| MON-02 | Phase 53 | Pending |
| DOC-07 | Phase 53 | Pending |
| PKG-10 | Phase 54 | Pending |
| PKG-11 | Phase 54 | Pending |
| PKG-12 | Phase 54 | Pending |
| PKG-13 | Phase 54 | Pending |
| MTX-01 | Phase 54 | Pending |
| UPD-30 | Phase 54 | Pending |
| UPD-31 | Phase 54 | Pending |
| LEG-01 | Phase 54 | Pending |
| SEC-03 | Phase 54 | Pending |
| SEC-12 | Phase 54 | Pending |
| DIST-10 | Phase 54 | Pending |
| PKG-14 | Phase 55 | Pending |
| PKG-15 | Phase 55 | Pending |
| PKG-16 | Phase 55 | Pending |
| PKG-24 | Phase 55 | Pending |
| SEC-04 | Phase 55 | Pending |
| SEC-13 | Phase 55 | Pending |
| PKG-19 | Phase 56 | Pending |
| INF-05 | Phase 56 | Pending |
| PKG-20 | Phase 56 | Pending |
| DIST-04 | Phase 56 | Pending |
| DIST-11 | Phase 56 | Pending |
| DIST-12 | Phase 56 | Pending |
| TEL-09 | Phase 57 | Pending |
| TEL-07 | Phase 57 | Pending |
| TEL-12 | Phase 57 | Pending |
| TEL-13 | Phase 57 | Pending |
| UPS-01 | Phase 58 | Pending |
| UPS-03 | Phase 58 | Pending |

**Coverage:** v1.6 requirements: 152 total. Listed in Traceability: 152. Mapped to phases: 152 (Phases 40–58, each requirement to exactly one phase). Unmapped: 0.

---
*Requirements defined: 2026-10-20*
*Last updated: 2026-10-20 after applying the 40-item review corrections*
