# Feature Research: v1.6 Deployment setup

**Domain:** release, self-update, upstream-tracking and support operations for an independent Firefox-ESR-based browser run by one owner
**Researched:** 2026-10-20
**Confidence:** MEDIUM overall. Facts read from this tree, the upstream/ checkout, the live GitHub API, competitor repos (gh api) and official doc sources (GitHub docs markdown API, cloudflare-docs, renovate, flathub-infra, MicrosoftDocs, Tor GitLab) are HIGH. The research-plan/classify-confidence seam rates every web provider LOW. This file therefore labels each claim by how it was obtained, not by the seam's tier. Forum and search-snippet claims are LOW and marked as such.

Scope: SEED-002 phases A to L, plus the two owner additions of 2026-10-20: (1) the release-and-maintenance orchestrator (`release-train.yml`) and (2) Claude fixer steps. Everything in PROJECT.md "Validated" is treated as already built.

---

## 0. How the comparable browsers operate

| Concern | Zen | Floorp | LibreWolf | Waterfox | Mullvad Browser | PowerBrowser plan |
|---|---|---|---|---|---|---|
| Binary host | GitHub Releases (all OS, MARs as release assets) | GitHub Releases | Codeberg/GitLab releases, distro repos | Own site | GitHub `mullvad/mullvad-browser` releases plus dist.torproject.org | GitHub Releases, MAR copy on R2 as fallback |
| Update descriptor | Separate repo `zen-browser/updates-server` on GitHub Pages at updates.zen-browser.app. One static `updates/browser/<BUILD_TARGET>/<channel>/update.xml`, committed by the release job (gh api, verified) | Separate repo `Floorp-Projects/Floorp-Updates` at updates.floorp.app `/browser/stable/<OS>/<arch>/update.xml`. Written by a `workflow_dispatch` with MAR URLs, `request-id` and `dry-run` inputs (verified) | **No built-in updater on any platform.** Package managers or Flatpak; WinUpdater is a separate Windows tool (forum/FAQ quotes, LOW) | Own updater (not verified) | Separate repo `mullvad-browser-update-responses.git` (Tor template, verified) | Separate repo `powerbrowser-updates` on Cloudflare Pages, one descriptor per BUILD_TARGET, published with a delay |
| Withdraw / hold | Not observed | **Live "stable hold":** empty `<updates/>` served for 5 targets. `verify-stable-hold.yml` fetches the public URLs and requires the bytes to equal the repo copy (verified) | n/a | n/a | Not observed | REL-02 no-update descriptor plus a channel-live byte-equality check. Floorp is the direct precedent |
| Release gate | Release job uses environment `Deploy-Release`; signmar runs in CI from secrets; Windows signing happens in a separate repo `windows-binaries` (verified) | Not inspected | n/a | n/a | Human "do-all-signing" on a signing host (template) | `release` environment with the owner as reviewer; signing on a hosted runner, never legion |
| Upstream tracking | `sync-upstream.yml` opens the `chore/upstream-sync` PR. The body says "Some patches did not apply cleanly" when the import fails, and the PR still opens (verified). Clock: `schedule:` cron | Not inspected | Release within about 3 days of upstream (LOW) | On ESR 153 since 6.7 beta (FreeBSD ports review, LOW) | Rebased by Tor per ESR point release | AUTO-01 detector (Worker cron) opens the pin-bump PR. A conflict opens an issue; the fixer may then open a fix PR |
| Per-release tracking | GitHub PR plus run | Workflow `run-name` carries version and request-id | n/a | n/a | **One GitLab issue per release from template "051 Release Prep - Mullvad Browser Stable"**: Build Configuration, Signing, Publishing, Communications checklists, labels `Priority::Blocker` (verified) | TRAIN-02: one tracking issue per release, updated by each stage |
| Downstream channels | Flathub `app.zen_browser.zen` repacks the release tarball (verified); AppImage plus zsync | PPA, Flathub `one.ablaze.floorp` | Distro-maintained, AUR by volunteers | — | Flathub, Arch and NixOS maintainers emailed per release; Homebrew cask bumped by a bot (template) | Phase J: own flake (floorp-bin style), tap, winget; Flathub only after its rules are cleared |
| Issue intake | `.github/ISSUE_TEMPLATE/bug_report.yml` plus `config.yml`; `issue-labeler.yml` (verified) | `bug_report.yml` plus `config.yml` (verified) | Codeberg issues | `bug_report.yml` plus `config.yml` (verified) | Tor GitLab | GH-01 forms plus GH-03 Claude triage |
| Telemetry | Mozilla telemetry off | Off | None | Removed | None | Opt-in JS-error reports to the project's Worker; no analytics |
| Known failure | **CVE-2026-41431: Zen shipped a MAR updater with signature verification stripped before 1.19.9b** (advisory snippet, MEDIUM) | — | Stale distro packages (LOW) | — | — | ng065 already enforces the MAR signature; SEC-05 adds the secondary key |

Conclusions that drive the tables below:
- Every MAR-updating competitor keeps descriptors in a separate repo served as static files. Zen and Floorp both serve **one static descriptor per target** and ignore the version segments. The `_redirects` placeholder rule, or a URL-shortening patch, is the standard pattern, not a novelty.
- Floorp's public hold check and Mullvad's per-release issue are the closest precedents for REL-02/UPD-07 and for TRAIN-02. No competitor runs an AI fixer or a single orchestrator across ESR, Theia and Node. Those two are differentiators.
- LibreWolf shows the cost of having no updater: users depend on volunteer packagers and stale packages. A working self-update is table stakes for a direct-download browser.

---

## Feature Landscape

Each table row: feature, complexity, the SEED-002 ID (or **(new)** with a proposed ID), the phase, and dependencies on built features. Categories are proposed REQUIREMENTS.md categories.

### Category REL: Release identity and cadence (Phase A, E, F)

| Feature | Table stakes / Diff | Complexity | ID | Notes / dependencies |
|---|---|---|---|---|
| Pin on the current ESR security release (153.5.1esr, then each two-week point release) | Table stakes | LOW per bump | DIST-05 start | `configuration.toml:115` and `rebase-upstream.yml:33` move together (verify-upstream-pins.mjs). Depends on the built UPD-01/02 uptake tooling |
| One channel name, derived and checked | Table stakes | LOW | UPD-01 | `.mozconfig` says `powerbrowser-default`, docs say `release`. This blocks everything that names a channel (descriptor path, MAR_CHANNEL_ID) |
| `[product].revision`, version `v<ESR>-<rev>`, release-identity quick row | Table stakes | LOW | REL-01 | Needed by the train's "is this already released?" test and by the tag |
| One release per ESR point release plus out-of-band revision bumps | Table stakes | LOW | DIST-05 | About 25 releases in 12 months (SEED-002 §0). Owner work per release must stay at a merge plus an approval |
| Withdraw without deleting: no-update descriptor, mark pre-release, fix is N+2 | Table stakes | MEDIUM | REL-02 | **Immutable releases allow editing title, notes and the pre-release flag, but lock assets and tag. A deleted immutable release's tag name can never be reused** (GitHub docs, immutable-releases). So the "mark pre-release" withdraw path works, and "delete and re-tag" is impossible by design |

### Category GH: Repository controls and community surface (Phase A, G)

| Feature | T/D | Complexity | ID | Notes |
|---|---|---|---|---|
| Issue forms (bug, feature, config.yml), about 20 labels, release-note categories, SECURITY.md, SUPPORT.md, KNOWN-ISSUES.md | Table stakes (every competitor has bug_report.yml plus config.yml) | LOW | GH-01 (new) | Form field ids `version`, `os`, `install_format` are what TEL-05 prefills |
| Settings by `gh api` and read back by a repo-controls row | Table stakes | MEDIUM | GH-02 (new), SEC-01 | Live state 2026-10-20 (gh api): org plan `free`, org 2FA requirement **false**, **zero environments**, Discussions off, rulesets `[]` |
| Rulesets on the public Free repo | Table stakes | LOW | GH-02 | **Partly resolved:** the docs page says Team/Enterprise, but `GET /repos/DeBIOS-Foundation/powerbrowser/rulesets` answers `[]` on a free-plan org, not a plan error. Creating one in GH-02 is the proof |
| Bot-created tags only, tag creation restricted to the App, drop the signed-tag claim | Table stakes | LOW | GH-02, decision 3 | The "Restrict creations" rule exists for tags (available-rules doc). Required signatures binds commits only |
| Fork-PR approval for all external contributors; runner label used only by release jobs | Table stakes (security) | LOW | SEC-01 item 15 | Must be in place before the legion runner registers |
| Claude triage of new issues (label, ask for missing fields, link duplicates, never close) | Differentiator | MEDIUM | GH-03 (new) | **claude-code-action blocks users without write access by default.** Triage on `issues: opened` needs `allowed_non_write_users` together with `github_token: GITHUB_TOKEN` and minimal `issues: write`. That input does not work with App auth (action security.md). Spend limit at the Anthropic workspace |
| Codeberg push mirror | Differentiator (resilience) | LOW | GH-04 (new) | Its health becomes a maintenance row (TRAIN-07) instead of a silent timer |

### Category AUTO / UPS: Upstream tracking (Phase A, F, L)

| Feature | T/D | Complexity | ID | Notes |
|---|---|---|---|---|
| ESR detector: product-details FIREFOX_ESR, 153 major guard, tag confirm, pin-age assertion | Table stakes for a security-sensitive fork | MEDIUM | AUTO-01 (new) | Zen runs the same thing on `schedule:`. Here it is a Worker cron (D-77). It becomes stage 1 of the train |
| Pin-bump PR via the GitHub App, with the patch-replay status in the PR body | Table stakes | MEDIUM | AUTO-01 | Zen prints a patches-applied line in its PR body. **Correction to SEED-002 §3:** a PR created with GITHUB_TOKEN now creates `pull_request` runs in an *approval-required* state rather than no runs (GitHub docs, github_token concept). The App stays the right choice so CI runs without a click |
| Patch-conflict issue with the apply log and `git -C upstream diff` | Table stakes | LOW | AUTO-01 | The automation never edits a patch. The fixer (FIX-02) may propose a regenerated one |
| Node 24 runtime detector with in-job SHASUMS verification | Differentiator | MEDIUM | AUTO-04 (new) | Replaces BUILD.md:1041-1049 |
| Renovate grouped `@theia/**` PR plus a `theia_release` customManager | Table stakes | MEDIUM | AUTO-02 (new) | **Resolved limits** (renovate docs mend-hosted/overview.md): Community plan has 1 concurrent job, a run every 4 h, 1 vCPU, **3 GB RAM**, 15 GB disk, **30 min timeout**. Whether a Theia yarn.lock regeneration fits in 3 GB/30 min is still a measurement. The nix manager ships `enabled: false` and installs nix through containerbase `nix-prebuild` (renovate source), so Mend hosted can run it once enabled. That is source-level evidence, not a live run |
| Dependabot (actions weekly, npm security-only), CodeQL default setup | Table stakes | LOW | AUTO-03 (new) | SHA pin plus version comment are rewritten together in practice, but **a compound comment (`# v4 # zizmor: …`) goes stale** (several PRs, MEDIUM). Keep pin comments plain |
| Node line decision recorded | Table stakes | LOW | UPS-02 (new) | Node 24 maintenance ends 2028-04-30 |
| ESR 175 rebase, dual-build window, release on 175.x before 153.27 | Table stakes (calendar) | HIGH | UPS-01 (new), Phase L | The train must accept a second major as a parallel track (TRAIN-05) |

### Category TRAIN (new): Release-and-maintenance orchestrator, owner addition 1

What the owner sees: **one issue per release**, titled for example `Release 153.6.0-1`, with one checklist row per stage. Each row carries a state (waiting, running, passed, failed, needs-owner) and a link to the run or PR. The issue is assigned to the owner only when a row needs a human (merge, approve, regenerate a patch, read a fixer PR). It closes itself when liveness passes. Mullvad's "Release Prep" issue is the human-driven version of this; the train is the machine-driven one.

| Feature | T/D | Complexity | ID (proposed) | Notes |
|---|---|---|---|---|
| One workflow `release-train.yml`, started only by `workflow_dispatch` from the scheduler Worker or the owner; no `schedule:` key | Differentiator | MEDIUM | TRAIN-01 (new) | D-77 kept. **A GITHUB_TOKEN `workflow_dispatch` always creates a run** (GitHub docs), so the train can dispatch its own later stages with `actions: write` and needs no App for chaining. **Do not chain through `workflow_run`:** GitHub stops a `workflow_run` chain after three levels (events doc), and the train has six or more stages |
| Per-release tracking issue, idempotently found by a hidden marker, updated in place by every stage | Differentiator | MEDIUM | TRAIN-02 (new) | Must survive re-runs: a stage re-run edits its own row and never creates a second issue. Keep identifiers (run ids, SHAs) in the issue. The owner's notification is the GitHub Mobile assignment/mention |
| Stage chain: detect, pin-bump PR, CI green, owner merge, legion build, per-OS sign and publish (`release` approval), delayed descriptor publish, channel liveness | Differentiator | HIGH | TRAIN-03 (new); wraps AUTO-01, DIST-02, UPD-06/07, INF-03 | The human gates (merge, approve) end a run, and the next event (push to main, or the approval) resumes the train. **The 24 h canary delay can be an environment wait timer** (1 to 43,200 min, available on public Free repos; the run limit is 35 days including waiting; GitHub environments and limits docs). That replaces a Worker step and keeps the delay visible in the run |
| Supersede rule: a newer ESR detected while a train is open marks the old train superseded and starts a new one; a chemspill takes priority | Table stakes for a two-week cadence | MEDIUM | TRAIN-04 (new) | One `concurrency` group per major line |
| Second major line (ESR 175) as a parallel train during the dual-build window | Table stakes in Phase L | MEDIUM | TRAIN-05 (new) | The major guard from AUTO-01 picks the line |
| Failure routing: a red stage labels the issue `train:blocked`, assigns the owner, links the log, and starts the fixer when the failure class is fixable (FIX-01) | Differentiator | MEDIUM | TRAIN-06 (new) | Only failures signal the owner. That keeps principle 1 ("a job the owner must remember is a defect") |
| Standing maintenance issue, one pinned issue updated daily by the same workflow: renewal register (RENEWALS.md dates), open Dependabot PRs and alerts, CodeQL alerts, Codeberg mirror last push, runner online, descriptor and MAR liveness, pin age, download_count | Differentiator | MEDIUM | TRAIN-07 (new); absorbs INF-03 checks, DOC-01 renewals, GH-04 health | Mirror and timer failures become visible rows, not silent ones. **Worker Free limits are 10 ms CPU per cron invocation, 50 subrequests per invocation, 5 cron triggers per account** (cloudflare-docs workers limits). So the Worker should only dispatch, and the checks run in Actions. The Worker keeps one self-check: if the dispatch itself fails, it emails through Email Routing |
| Dry-run input on every stage (validate and render, commit nothing) | Table stakes for an automation the owner cannot watch | LOW | TRAIN-08 (new) | Floorp's descriptor workflow has `dry-run` and `request-id` inputs |
| Self-test: plant a failed stage, a duplicate issue and a superseded train; each must go red naming the drift | Table stakes (project rule: derive and compare) | MEDIUM | TRAIN-09 (new) | Registered as rows in `scripts/verify-platform.sh`, not a sibling driver |

### Category FIX (new): Claude fixer steps, owner addition 2

What the owner sees: a red stage in the train produces, within one run, either a PR labelled `ai-fix` against the failing branch, linked from the tracking issue, or a diagnosis comment saying why no fix was attempted. The owner reviews and merges, or ignores it. Nothing the fixer does can ship bytes.

| Feature | T/D | Complexity | ID (proposed) | Notes |
|---|---|---|---|---|
| Trigger classes: patch-replay conflict, red Theia bump (Renovate PR), red Node bump, failed `--quick` or full-tier check in the train | Differentiator | MEDIUM | FIX-01 (new) | Started by the train with `workflow_dispatch`. **The action skips its actor check for `workflow_dispatch`** (only write users can dispatch), which avoids `allowed_bots` and the warning that allowed bots are not permission-checked on public repos (action security.md) |
| Patch fixes go only through a regeneration script that rebuilds the patch from a patched upstream tree | Table stakes for this repo (CLAUDE.md rule) | MEDIUM | FIX-02 (new) | **`scripts/` has no patch-regeneration script today** (only apply-patches.sh and check-patch-surface.sh). That script is a prerequisite. The fixer's allowed tools exclude writing `patches/*.patch` directly. The gate is the non-vacuous apply, `apply-patches.sh --self-test`, `check-patch-surface.sh` and the brand scan |
| PR only, never merge, never approve an environment, never read signing material | Table stakes (owner rule) | LOW | FIX-03 (new) | By default the action commits to a branch and only offers a "create PR" link (action security.md). A follow-up step creates the PR with the App token. The fixer job declares no `environment:`, so `release` and `bot` secrets are unreachable by construction. Its token gets `contents: write` on `ai-fix/*` branches only, and a ruleset restricts those branches |
| Runs on GitHub-hosted runners only, never legion; never on fork PR events | Table stakes | LOW | FIX-04 (new) | The upstream checkout is about 1.1 GB (`upstream/.git` on legion), which fits a hosted runner. `rebase-upstream.yml` already replays on ubuntu-latest |
| Spend limits: per-run `--max-turns`, a job timeout, one attempt per failure, monthly cap on a dedicated Anthropic workspace | Table stakes | LOW | FIX-05 (new) | **Use workload identity federation** (`anthropic_federation_rule_id` plus `id-token: write`, action.yml), which removes the static API key from GitHub secrets. Pin Claude Code itself with `path_to_claude_code_executable` (action.yml), which closes SEED-002 row 17's "downloads outside the pin" note |
| Repo rules loaded from the base branch | Table stakes | LOW | FIX-06 (new) | On PR events the action restores `.claude/` and `CLAUDE.md` from the base branch (security.md), so the "regenerate, never text-edit" rule cannot be overridden from a PR. Everything else (package.json, lockfiles, Makefile) stays at the PR head, so tool allow-lists still matter |
| Self-test: plant a hand-edited hunk and a fixer PR touching `patches/` without the regen marker; both must go red | Table stakes | MEDIUM | FIX-07 (new) | Same pattern as other `--self-test` rows |

### Category SEC: Trust path (Phase B, H, I)

| Feature | T/D | Complexity | ID | Notes |
|---|---|---|---|---|
| MAR signature enforced (built), plus an offline secondary key, regenerated patch 030, mandatory .p12 copies, ceremony runbook, secondary-only plant | Table stakes; Zen's CVE-2026-41431 shows the cost of skipping it | MEDIUM | SEC-05 (new), SEC-02 | Blocker for the first release |
| `buildUpdateXml --emit` per BUILD_TARGET with detailsURL | Table stakes | LOW | UPD-04 | |
| Windows Authenticode via Azure Artifact Signing | Table stakes for Windows | MEDIUM | SEC-03 | **Resolved:** Basic plan USD 9.99/month for 5,000 signatures (Microsoft pricing page). Public Trust is open to organizations in the US, Canada, EU, UK and other listed countries (MicrosoftDocs artifact-signing quickstart:29), so a US 501(c)(3) is eligible |
| Apple Developer ID plus notarization | Table stakes for macOS | MEDIUM | SEC-04 | **Resolved:** Developer ID certificates last 5 years, apps signed while valid keep running, and renewal needs an active membership (Apple developer-id support page). RENEWALS row: membership yearly, certificate 5-yearly |
| Provenance on /download | Differentiator | LOW | DIST-02, WEB-01 | **Immutable releases generate a release attestation automatically** (GitHub docs), which partly overlaps attest-build-provenance. **`gh attestation verify` requires a gh login:** gh's root auth gate applies because the command does not set DisableAuthCheck (cli/cli source). /download should lead with SHA256SUMS and say gh needs a GitHub account; `--bundle` exists for offline use |

### Category PKG: Packages (Phase C, H, I, J)

| Feature | T/D | Complexity | ID | Notes |
|---|---|---|---|---|
| Portable Linux tarball (no /nix/store interpreter) | Table stakes | HIGH | PKG-17 (new) | Blocker. One long rebuild in Mozilla's Debian image under podman |
| MAR symlink check | Table stakes | LOW (was CHECK FIRST) | PKG-18 (new) | **Resolved:** the 153.5.0 tarball built 2026-10-17 (`objdir/dist/powerbrowser-153.5.0.en-US.linux-x86_64.tar.xz` in the main checkout) holds **0 symlinks** among 78 `powerbrowser/theia/` entries, and the staged dir has 0. `package-linux.sh:47` copies the bundled `lib/`. PKG-18 shrinks to a permanent row asserting `find <stage> -type l` is empty; the dereference work is not needed |
| MAR size measured; partial-MAR decision | Table stakes | LOW | PKG-21 (new) | **Estimate:** the PB tar.xz is 129,529,524 bytes (569 MB unpacked). Zen's complete Linux MAR is 116,134,540 bytes (its update.xml). Expect a complete MAR of about 120 to 135 MB; still measure it. At a two-week cadence Zen ships complete MARs only, which is a precedent for deferring partial MARs |
| Sidecar/Node relative paths re-proved; release legal notices; Theia state under the profile; URL argument; notices; en-US statement | Table stakes | MEDIUM | PKG-04..09 | PKG-06 blocks the install-matrix rows, so do it early |
| Windows NSIS cross-build, MAR, matrix | Table stakes for Windows | HIGH | PKG-10..13, MTX-01 | |
| macOS universal DMG, rcodesign, notarization | Table stakes for macOS | HIGH | PKG-14..16 | Zen uses free hosted macOS runners for the universal build |
| Nix flake repack (updater off) | Differentiator | MEDIUM | PKG-19 (new) | Mirrors nixpkgs floorp-bin |
| Flathub | Later | HIGH | PKG-20 (new) | **Resolved against the repack plan:** Flathub requires source-available submissions to be "built entirely from source"; exceptions go to "well-known vendors on a case-by-case basis". It also rejects apps with insufficient development history (flathub-infra requirements doc, updated 2026-10-04). Zen's Flathub app repacks its tarball, but that is a precedent, not a rule. Default: not this milestone |

### Category UPD: Update experience (Phase C, E, H)

| Feature | T/D | Complexity | ID | Notes |
|---|---|---|---|---|
| Silent background download and staging; apply on next launch | Table stakes (stock Gecko, built) | — | built | |
| "Ready to install, Restart now / Later", read-only folder (cant-apply) message, error with Check again, two commands | Table stakes; today the user never sees "restart to update" (SEED-002 §5) | MEDIUM | UPD-08 | Inside the boundary: PowerBrowserAPI observers plus `@powerbrowser/branding`; copy passes `shell-error-copy-no-internals` |
| About-dialog and release-notes links | Table stakes | LOW | UPD-03 | |
| AppUpdateURL removed from the shipped policies.json; MOZ_APPUPDATE_HOST is the only source | Table stakes | LOW | UPD-02 | `endpoint-allowlist.json:22` still cites the policy |
| Allowlist release pass (github.com, release-assets, crash-reports deny, FxA, geolocation, Safe Browsing) | Table stakes | MEDIUM | UPD-05 | 28 hosts today |
| Real N to N+1 hop drill on a release; update-channel-live | Table stakes | MEDIUM | UPD-06, UPD-07 | UPD-07 should check byte equality of the public descriptor, as Floorp does |
| Windows: sidecar kill blocks quit before the updater rename | Table stakes for Windows | MEDIUM | UPD-09 (new) | |

### Category INF / WEB / TEL: Infrastructure, website, telemetry (Phase D, G, K)

| Feature | T/D | Complexity | ID | Notes |
|---|---|---|---|---|
| DNS to Cloudflare; updates host on Pages with the `_redirects` rule | Table stakes | MEDIUM | INF-01, DIST-03 | **Partly resolved:** Pages `_redirects` supports per-segment `:placeholders`, one splat, and `200` proxying to relative URLs only (limits: 100 dynamic rules, 1,000 characters each; cloudflare-docs pages/configuration/redirects). The stock URL is `application.ini.in:55`, and each substitution is `encodeURIComponent`-ed (`UpdateUtils.sys.mjs:114`), so every value occupies exactly one segment. A rule like `/update/6/:p/:v/:b/:target/:l/:channel/:o/:s/:d/:dv/update.xml /browser/:target/:channel/update.xml 200` is supported as documented, but not yet probed live |
| Email Routing security@, contact@, privacy@ | Table stakes | LOW | INF-02 (new) | |
| `/events` Worker plus D1, 30-day deletion, one rate rule; level-off opt-in; enrichment | Differentiator (opt-in, no analytics) | MEDIUM | TEL-06 | |
| Site refresh, /download, /privacy, /legal, security.txt, Mozilla disclaimer | Table stakes | LOW | WEB-01 (new), TEL-08 | **Still open:** whether Pages serves `/.well-known/` (no doc statement found). Probe it after the first deploy; Worker route as fallback |
| Scheduler Worker (the clock only) | Table stakes under D-77 | LOW | INF-03 (new) | Shrinks to "dispatch the train on cron, email if the dispatch fails"; checks move to TRAIN-07 |
| Report a Bug command, Copy diagnostics, github.com user-initiated row | Table stakes | LOW | TEL-05 | Prefills form fields; diagnostics are never in the URL |
| Native crash reporting | Later, gated | HIGH | TEL-09, TEL-07, Phase K | Only after the Glean crash ping is gated |
| Status page (Upptime) | Differentiator, later | LOW | MON-02 (new) | **Open:** whether bot commits count as activity for the 60-day disable (no primary source). Avoid the question: have the Worker dispatch Upptime's workflows too, or drop Upptime in favour of TRAIN-07 plus a static status.json |
| Cachix or R2 Nix cache | Needed by PKG-19 | MEDIUM | INF-05 (new) | |
| One measured hosted fallback build | Table stakes (single-host risk) | MEDIUM | INF-04 (new) | |

### Category DOC: Owner documentation (Phase A, G)

| Feature | T/D | Complexity | ID | Notes |
|---|---|---|---|---|
| Two-week cadence text, ESR 175 dates, RENEWALS.md with a red-30-days quick row, secrets inventory, runner shape, legion-rebuild runbook, support section | Table stakes | LOW | DOC-01 (new) | Renewal entries: Developer ID certificate 5-yearly. **Fine-grained PATs may be non-expiring** unless an org maximum-lifetime policy blocks it, and GitHub deletes PATs unused for a year (GitHub PAT docs). The App needs no renewal; a PAT row only if a PAT is used |
| Mozilla-mark gate over identity surfaces | Table stakes | MEDIUM | LEG-01 (new) | **Correction:** SEED-002 item 18 says MISSING, but `scripts/verify-trademark-surface.mjs` already scans brand.ftl, brand.properties, the Theia fragments and desktop Name lines. The gap is NSIS (`defines.nsi.in`, uninstaller), application.ini Name/Vendor and Info.plist |

---

### Anti-Features

| Anti-feature | Why requested | Why problematic | Alternative |
|---|---|---|---|
| `schedule:` keys in the product repo | Zen does it; simplest clock | D-77; GitHub disables scheduled workflows in public repos after 60 days without activity (events doc) | Worker cron dispatches the train |
| Own update server (Balrog-like, dynamic per-version responses) | "Real" update service | It is a server; principle 2 says no server | One static descriptor per target (Zen and Floorp do this); a watershed is added only if ESR 153 to 175 needs a stepping stone |
| Fixer auto-merge, or fixer on the `release`/`bot` environment | Fewer owner clicks | A prompt-injected or wrong fix ships to every user | FIX-03: PR only, no environment, owner merges |
| Fixer editing patch hunks as text | Fast conflict fix | Breaks blob hashes; the 3-way apply becomes a silent no-op (CLAUDE.md) | FIX-02 regeneration script plus gates |
| Fixer or triage on legion (self-hosted) | Faster, warm caches | A public-repo self-hosted runner plus a model taking untrusted text input is the worst-case exposure | Hosted runners only (FIX-04) |
| Chaining stages through `workflow_run` | Looks native | Three-level cap (events doc); hard to see as one train | Self-dispatch plus a tracking issue |
| A second updater (Theia/electron-updater, AppImage zsync, in-app downloader) | Per-component updates | Principle 3: one complete MAR carries Gecko, Theia, extensions and Node | Gecko MAR only; package channels turn it off |
| Deleting a bad Release, or re-using its tag | Clean history | Immutable releases forbid tag reuse after deletion | REL-02 withdraw, then N+2 |
| Nightly/"twilight" channel | Zen ships one | Doubles train load for one owner | Single channel; revisit after Phase J |
| Product analytics / usage pings | Adoption numbers | Contradicts opt-in principle and /privacy | Release download_count plus Pages request metrics |
| Discord/Telegram/Slack notifications | Zen pings Discord | Another inbox and another secret | GitHub Mobile: assignment, mention, approval |
| Flathub tarball repack now | Reach | Build-from-source rule and history rule (flathub-infra) | Defer PKG-20; Nix flake first |
| MSI, MSIX, macOS PKG, Snap | Enterprise asks | Host-bound or out of plan (SEED-002 §1) | NSIS, DMG, tar.xz |
| Enabling the native crash reporter early | Crash data | Unattended Glean ping to Mozilla before consent (SEED-002 §8) | Phase K only, with TEL-09 |

---

## Feature Dependencies

```
UPD-01 channel ──> REL-01 revision/tag ──> TRAIN-02 tracking issue (keyed on version)
GH-02 settings/rulesets/environments ──> GitHub App ──> AUTO-01 pin-bump PR ──> TRAIN-03 stage 1-2
SEC-01 fork approval + runner rules ──> legion runner ──> DIST-02 build stage
SEC-05 secondary key ──> DIST-02 sign stage
PKG-17 portable build ──> PKG-21 MAR size ──> UPD-06 hop drill
INF-01 DNS ──> DIST-03 updates host (_redirects probe) ──> UPD-07 channel-live ──> TRAIN-03 liveness stage
UPD-08 update UI ──requires── existing PowerBrowserWebTabState path + branding extension (built)
TRAIN-01/02 ──> TRAIN-06 failure routing ──> FIX-01 triggers
regeneration script ──> FIX-02 patch fixes
AUTO-02 Renovate ──> FIX-01 (red Theia PR class)
AUTO-04 Node detector ──> FIX-01 (red Node PR class)
DOC-01 RENEWALS.md + GH-04 mirror + INF-03 ──> TRAIN-07 maintenance issue
TEL-06 Worker /events ──> TEL-08 /privacy ──> WEB-01 site
SEC-03 Azure ──> PKG-10..13 Windows ;  SEC-04 Apple ──> PKG-14..16 macOS ──> PKG-19 aarch64-darwin
UPS-01 ESR 175 ──requires── TRAIN-05 parallel line
GH-03 triage ──enhances── GH-01 forms + TEL-05 prefill
FIX (any) ──conflicts── release/bot environments (must never share a job)
```

### Dependency notes
- **The train wraps existing pieces; it does not replace them.** AUTO-01, DIST-02, UPD-06/07 and INF-03 each stay independently dispatchable. The train calls them and records their state. So TRAIN-01/02 can land in Phase A around AUTO-01, and gain stages in E (build, sign, descriptor, liveness) and F/G (maintenance).
- **The fixer needs failure classes before it is useful.** Patch-conflict fixing works from Phase A (AUTO-01 exists), but red-Theia and red-Node fixing need AUTO-02/AUTO-04. FIX belongs after the first release, in Phase F, apart from the regeneration script, which can land in A.
- **The descriptor delay is a choice:** an environment wait timer inside the train (recommended, visible in the run) or the Worker (SEED-002 row 7). The two must not both exist.

---

## MVP Definition

### Launch with (Phases A to E, first public Linux release)
- [ ] UPD-01, REL-01, DIST-05 start (153.5.1 pin): the release has an identity
- [ ] GH-01, GH-02, SEC-01: safe repo before the runner exists
- [ ] AUTO-01 plus TRAIN-01/02/03 (detect, PR, build, sign, delayed descriptor, liveness) plus TRAIN-08 dry-run: the owner's work per release stays at a merge and an approval
- [ ] SEC-05, UPD-04: trust path
- [ ] PKG-17, PKG-18 (row only), PKG-04..09, PKG-21, UPD-02/03/05/08: portable, updatable, explained
- [ ] INF-01/02/03, DIST-03, TEL-06/08, WEB-01: host, site, privacy
- [ ] DIST-02, UPD-06/07, REL-02, AUTO-05, INF-04: ship, prove the hop, can withdraw
- [ ] DOC-01: renewals and runbooks

### Add after the first release (Phases F and G)
- [ ] AUTO-02/03/04, UPS-02: Theia, Node and Dependabot flow into the train
- [ ] FIX-01..07: trigger is the first red bump PR or conflict after release
- [ ] TRAIN-04/06/07/09: supersede, failure routing, maintenance issue, self-tests
- [ ] TEL-05, GH-03, GH-04, MON-02: support operations

### Later (H to L)
- [ ] Windows (H) and macOS (I) once signing accounts exist
- [ ] Package channels (J); Flathub only after its rules are cleared
- [ ] Native crashes (K), only if the exclusion is retired
- [ ] ESR 175 (L) with TRAIN-05; calendar-driven 2027-06-10 to 2027-09-07

## Feature Prioritization Matrix

| Feature | User value | Cost | Priority |
|---|---|---|---|
| Portable tarball + MAR self-update + update UI | HIGH | HIGH | P1 |
| Pin-bump automation + release train core | HIGH (security cadence) | MEDIUM | P1 |
| Secondary MAR key, withdraw path | HIGH | MEDIUM | P1 |
| Repo controls, forms, SECURITY.md | MEDIUM | LOW | P1 |
| Site /download /privacy | MEDIUM | LOW | P1 |
| Maintenance issue (TRAIN-07) | MEDIUM (owner) | MEDIUM | P2 |
| Claude fixer | MEDIUM (owner time) | MEDIUM | P2 |
| Claude triage | LOW to MEDIUM | LOW | P2 |
| Windows, macOS | HIGH | HIGH | P2 (accounts first) |
| Nix flake, tap, winget | MEDIUM | MEDIUM | P3 |
| Flathub, Upptime, crash reports | LOW to MEDIUM | MEDIUM to HIGH | P3 |

## SEED-002 "Unverified" list: status after this research

**Resolved:**
1. MAR symlinks: none in the current package (tarball and stage inspected).
2. Fine-grained PAT expiry: infinite lifetime allowed unless org policy; unused tokens deleted after 1 year.
3. 500 MB artifact cap: that is the private-repo storage quota; public-repo Actions usage is free.
4. gh attestation verify: needs a gh login.
5. Azure price and eligibility: USD 9.99/month; US organizations are eligible.
6. Apple certificate validity: 5 years.
7. Mend limits: Community plan is 1 vCPU, 3 GB, 30 min. The nix manager is off by default and installable on hosted.
8. Flathub build-from-source: the rule exists and blocks a repack without an exception.
9. Claude Code pin: `path_to_claude_code_executable` pins it.

**Partly resolved:**
- Rulesets on Free: the list API works; creation is unproven.
- Dependabot SHA comments: rewritten together, except compound comments.
- `_redirects` on the 11-segment path: supported as documented, not yet probed live.

**Still open:**
- Bot commits and the 60-day rule
- Pages and `.well-known`
- signmar closure size on a hosted runner
- Mend yarn.lock regeneration time
- Mozilla partner search codes under org.debios
- Windows updater rename with a live node.exe
- Windows background-task path
- Open Collective as a fiscal host
- Node sidecar egress in verify-endpoints layer 3
- nixpkgs cctools/apple-sdk cross toolchain
- Gecko WebGL on WSLg
- Cachix PolyForm NC eligibility

**Corrections to SEED-002:**
- A PR created with GITHUB_TOKEN now creates approval-required runs.
- The trademark gate is partial, not missing.
- Worker Free limits (10 ms CPU, 50 subrequests, 5 cron triggers) argue for a dispatch-only Worker.

## Sources

- Tree: `powerbrowser/packaging/package-linux.sh:47`; `upstream/build/application.ini.in:55`; `upstream/toolkit/modules/UpdateUtils.sys.mjs:114`; `configuration.toml:115`; `powerbrowser/endpoint-allowlist.json:22,25,85`; `scripts/verify-trademark-surface.mjs:1-25`; `scripts/` listing (no regeneration script); `/home/chris/coding/Power-Browser/objdir/dist/powerbrowser-153.5.0.en-US.linux-x86_64.tar.xz` (tar -tv inspection)
- Live GitHub API (2026-10-20): DeBIOS-Foundation org plan, 2FA requirement, rulesets, environments; zen-browser/desktop `.github/workflows/{build,sync-upstream,check-candidate-release}.yml`; zen-browser/updates-server tree and `Linux_x86_64-gcc3/release/update.xml`; Floorp-Projects/Floorp-Updates `verify-stable-hold.yml`, `update-stable-updatexml-files-v2.yml`; flathub/app.zen_browser.zen manifest; issue templates of Zen, Floorp, Waterfox; anthropics/claude-code-action `action.yml`, `docs/security.md`, `docs/configuration.md` (v1.0.254)
- Tor GitLab: tor-browser-build `.gitlab/issue_templates/051 Release Prep - Mullvad Browser Stable.md`
- GitHub docs (markdown API): about-rulesets, available-rules-for-rulesets, events-that-trigger-workflows (60-day rule, workflow_run three-level cap), github_token concept, actions limits, actions billing, deployments-and-environments (wait timer, required reviewers on public Free), immutable-releases, managing-your-personal-access-tokens
- Cloudflare docs (cloudflare-docs repo): pages/configuration/redirects, pages/platform/limits (25 MiB), workers/platform/limits
- Renovate: docs/usage/mend-hosted/overview.md; lib/modules/manager/nix/{readme.md,index.ts,artifacts.ts}; lib/util/exec/containerbase.ts
- flathub-infra/documentation `docs/02-for-app-authors/02-requirements.md`
- MicrosoftDocs azure-docs `articles/artifact-signing/quickstart.md:29`; Azure Artifact Signing pricing page (via search)
- Apple: https://developer.apple.com/support/developer-id (via search)
- cli/cli `pkg/cmd/attestation/verify/verify.go`
- LOW (search snippets/forums): CVE-2026-41431 Zen MAR verification (releasealert.dev); LibreWolf no-updater FAQ quotes (privacyguides, EndeavourOS forum); Waterfox on ESR 153 (FreeBSD reviews-dev); Dependabot compound-comment caveat (basecamp/fizzy-cli PR)

---
*Feature research for: release and support operations of an independent ESR-based browser*
*Researched: 2026-10-20*
