# Architecture Research: v1.6 Deployment setup

**Domain:** Release, update-channel and maintenance automation for a Gecko + Theia patch-set browser (single owner, no server)
**Researched:** 2026-10-20
**Confidence:** MEDIUM overall. In-tree integration points are HIGH: every file:line below was read in this worktree today. GitHub and Cloudflare platform facts come from official docs fetched today. The research seam rates the `webfetch` provider LOW, so those facts are marked "official docs" rather than HIGH. Anything that rests on community sources only is marked MEDIUM or open.

Scope: SEED-002 phases A–L, plus the two owner additions of 2026-10-20: (1) the `release-train.yml` orchestrator and (2) the Claude fixer jobs. This file does not re-derive anything already Validated in PROJECT.md.

---

## 1. Headline design decisions (opinionated)

1. **`release-train.yml` is an idempotent reconciler, not a long-running pipeline.** Each run starts from a wake-up (Worker tick, `workflow_run`, or owner dispatch), re-derives the state of every open release from GitHub facts, does at most one transition per release, re-renders the tracking issue, and exits. One run cannot wait across the owner's PR merge, so a single run cannot hold the train. A reconciler also needs no stored state, which follows CLAUDE.md's "derive and compare, never hand-keep" rule.
2. **The tracking issue is a rendered view. GitHub API facts are the state.** The issue body is regenerated from facts on every run: PR open or merged, the pin on `main`, the `release.yml` run and its pending deployment, Release draft or published, descriptor content in `powerbrowser-updates`, the liveness result. Nothing in the issue is read back as authority. Fixer attempt counts come from counting labelled PRs, not from a counter.
3. **The Cloudflare Worker is a clock and nothing else.** On the Free plan a cron invocation gets **10 ms CPU and 50 subrequests**, and an account gets 5 cron triggers (official docs, developers.cloudflare.com/workers/platform/limits). The ESR, Node and liveness logic therefore moves out of the Worker (where SEED-002 §4 rows 1, 4 and 13 put it) and into `scripts/*.mjs` run by `release-train.yml`. There it is testable with `--self-test`, registered in `verify-platform.sh`, and reads `configuration.toml` directly. The Worker mints a token and issues one `workflow_dispatch`.
4. **Claude never holds a write credential.** The fixer runs in a job with a read-only `GITHUB_TOKEN` and uploads a diff. A separate deterministic gate job re-derives the patches and runs the gates. A third job, in the `bot` environment, is the only one that mints the App token and opens the PR. The App is installed **without the `workflows` permission**, so no bot or Claude output can change `.github/workflows/`, and so none can retarget the self-hosted runner label.
5. **The `release` environment's deployment policy must move from the release-tag pattern to branch `main`.** SEED-002 decision 3 makes the tag a post-approval product of the sign job, and `release.yml` is not tag-triggered. A tag-pattern policy (docs/RELEASING.md:320-321) then matches no run, and the sign job can never deploy. Environment rules match the run's `GITHUB_REF` (official docs), which for a dispatch on `main` is `refs/heads/main`.

---

## 2. System overview

```
 EXTERNAL CLOCKS / SOURCES                         GITHUB: DeBIOS-Foundation/powerbrowser
 ┌───────────────────────────┐   workflow_dispatch ┌──────────────────────────────────────────────┐
 │ powerbrowser-scheduler     │ ─────────────────▶ │ release-train.yml  (reconciler, NEW)          │
 │ CF Worker, 1 cron (hourly) │  (clock App token, │  wake → derive → act(≤1 step/release) → render│
 │ holds clock-App key only   │   Actions:write)   │                                              │
 └───────────────────────────┘                     │  jobs: derive · detect · bump(→rebase-upstream│
 ┌───────────────────────────┐   read by detect    │        .yml via workflow_call) · bump-pr ·    │
 │ product-details (ESR)      │ ◀───────────────── │        fix · fix-gate · fix-pr ·              │
 │ api.github.com matching-   │                     │        dispatch-release · maintenance · report│
 │   refs (mozilla-firefox)   │                     └───────┬───────────────┬──────────────┬───────┘
 │ nodejs.org index.json +    │                             │ App-token PR   │ GITHUB_TOKEN │ issues:write
 │   SHASUMS256.txt           │                             ▼                │ dispatch     ▼
 └───────────────────────────┘                     ┌────────────────┐       │      ┌───────────────────┐
                                                    │ PR chore/esr-T │       │      │ Tracking issue    │
 ┌───────────────────────────┐   PR (Mend app)      │ PR claude-fix/*│       │      │ "release-train:   │
 │ Mend Renovate (Theia)      │ ──────────────────▶ │ PR renovate/*  │       │      │  v153.6.0-1"      │
 │ Dependabot (actions, npm)  │                     └──────┬─────────┘       │      │ + pinned          │
 └───────────────────────────┘                            │ verify.yml       │      │ "maintenance"     │
                                                           ▼ (push/PR, exists)│      └───────────────────┘
                                                    ┌────────────────┐       │
                                                    │ verify.yml     │──workflow_run(completed)──▶ release-train
                                                    └────────────────┘       │
                                                           owner merges ─────┤
                                                                             ▼
                                   ┌─────────────────────────────────────────────────────────────┐
                                   │ release.yml (NEW, S5 draft reshaped)  workflow_dispatch only │
                                   │  build-linux  [self-hosted, powerbrowser-release] (legion)   │
                                   │     contents:read, no env, no secrets → artifacts            │
                                   │  sign-publish ubuntu-latest, env `release` (owner approves)  │
                                   │     signmar, SHA256SUMS, attest, draft→publish, App tag      │
                                   │  descriptor   ubuntu-latest, env `descriptor` (wait 1440 min)│
                                   │     App token → powerbrowser-updates update.xml commit       │
                                   │  channel-live ubuntu-latest, contents:read                   │
                                   └─────────────────────────────────────────────────────────────┘
                                                    │                     │
                                                    ▼                     ▼
                                   GitHub Releases (immutable)   powerbrowser-updates → CF Pages
                                                                 updates.powerbrowser.org/update.xml
```

### Component responsibilities

| Component | New / Modified | Owns | Implementation |
|---|---|---|---|
| `powerbrowser-scheduler` Worker (own repo) | NEW | The clock only: hourly `scheduled()` → JWT → installation token (Actions:write, repo `powerbrowser`) → `POST .../release-train.yml/dispatches` with `inputs.reason=tick` | About 40 lines. 3 subrequests per tick. Clock App private key as a Worker secret (PKCS#8) |
| `.github/workflows/release-train.yml` | NEW | Reconcile loop, step dispatch, fixer orchestration, maintenance sweep, tracking-issue render | Thin YAML; logic in `scripts/release-train.mjs` |
| `scripts/release-train.mjs` | NEW | Pure functions: `derive(facts) → state`, `next(state) → action`, `render(state) → issue body`; `--self-test` over fixture API JSON | Node, no deps, same style as `verify-*.mjs` |
| `scripts/detect-upstreams.mjs` | NEW | ESR: product-details `FIREFOX_ESR` → `FIREFOX_153_X_Yesr_RELEASE`, major guard, matching-refs confirm, pin-age. Node 24: index.json + SHASUMS256 sha + signature check. Compared with `configuration.toml:115` and `powerbrowser/packaging/node-runtime.json:2-6` | Network half runs in the job; parsing half under `--self-test` (quick) |
| `.github/workflows/rebase-upstream.yml` | MODIFIED | The one definition of the replay job | Add `on: workflow_call` with `inputs.tag` and `outputs.stage`. Run generate inside `nix develop .#theia` (see §7 risk R1). Fix the stale 4-week comment at :1-4 |
| `scripts/regenerate-patches.sh` | NEW | Writes `patches/NNN-*.patch` from `git -C upstream diff --full-index --abbrev=10 -- <paths the patch's own +++ b/ headers name>`. `--check` mode re-derives and byte-compares | Patches touch disjoint files today (010: browser/moz.configure; 020: browser/moz.build; 030: toolkit/mozapps/update/updater/moz.build; 040: two NSIS files), so per-patch regeneration is well-defined |
| `.github/workflows/release.yml` | NEW | Build, sign, publish, delayed descriptor, liveness | S5 draft lines 268-278 reshaped by SEED-002 decisions 2, 3, 11, 12 |
| `scripts/verify-workflows.mjs` | NEW (replaces S5's planned `verify-release-workflow.mjs`) | Static cross-workflow gate (§6) | One script over every `.github/workflows/*.yml`, because "the legion label appears in exactly one job" and "no `schedule:` anywhere" can only be checked over the whole set |
| `scripts/verify-repo-controls.mjs` | NEW (named at RELEASING.md:231, :431 but **absent from the tree**) | Live settings vs `.github/settings/*.json` | Needs network, so it is a **full** row plus a daily maintenance step, never `--quick` |
| `scripts/build-update-xml.mjs` | NEW CLI over existing `buildUpdateXml` (scripts/verify-mar-update-hop.mjs:109) | One descriptor per BUILD_TARGET | Import, do not copy |
| GitHub Apps | NEW | `powerbrowser-bot`: Contents RW, Pull requests RW, Issues RW, Administration R (runner list), Dependabot alerts R. **No Workflows.** `powerbrowser-clock`: Actions RW only | Two Apps so a leaked Worker secret can only dispatch idempotent reconcilers |
| Environments | NEW | `release` (owner reviewer, branch `main`), `descriptor` (wait timer 1440, branch `main`), `bot` (branch `main`), `fixer` (branch `main`, Anthropic credential), `triage` (G) | `.github/settings/environment-*.json`, read back by `repo-controls` |

---

## 3. Integration points with the existing architecture (file:line)

### 3.1 Patch stack

| Point | File:line | Change |
|---|---|---|
| Replay entry | scripts/rebase-upstream.sh:40-43 (exits without `--tag`), :114-118 (apply failure), :120-124 (surface), :151-154 (brand scan with `--extra-root`), :172 (toolchain follow-up printed only) | Unchanged. The bump job calls it through `rebase-upstream.yml`. The failure stage is derived from which `FAIL --` line was printed, not from a new exit-code scheme |
| 3-way apply | scripts/apply-patches.sh:48 (`git apply --3way`), :54-57 (non-vacuity) | Unchanged. A conflict leaves markers in `upstream/`. The fixer resolves them there, then `regenerate-patches.sh` writes the patch |
| Patch hygiene | CLAUDE.md "Patches are regenerated, never text-edited"; scripts/check-patch-surface.sh | New row `patches-regenerated` (§6) turns that rule into a gate: after `apply-patches.sh` on a fresh `upstream/`, `regenerate-patches.sh --check` must reproduce every tracked patch byte-for-byte. A hand-edited hunk with stale `index` hashes either fails to apply or re-derives to different bytes. Both go red |
| MAR certificate patch | patches/030-powerbrowser-mar-certificates.patch:28-31 (same DER in both slots) | SEC-05 regenerates it with the secondary DER. **Fixer is forbidden on 030** (path deny list) |
| Pin mirror | configuration.toml:115-116; .github/workflows/rebase-upstream.yml:33; scripts/verify-upstream-pins.mjs:10-36 | Bump job edits both lines in one commit. `verify-upstream-pins` already reddens on drift |

### 3.2 PowerBrowserAPI boundary (UPD-08; no patch)

| Point | File:line | Change |
|---|---|---|
| Message kinds | powerbrowser/shell/PowerBrowserAPI.sys.mjs:295 (`SHELL_MESSAGE_KINDS`, 4 kinds) | Add `appUpdateState`, `checkForUpdates`, `restartToUpdate` |
| Dispatcher | PowerBrowserAPI.sys.mjs:2217-2277 (`handleShellMessage`, unknown kind rejected at :2270) | Three new branches |
| Push to Theia | PowerBrowserAPI.sys.mjs:2292, :3389 (`PowerBrowserWebTabState` sends); :3676 (actor routes kinds) | `{kind:'appUpdate', status, version?}` over the existing path |
| Restart | PowerBrowserAPI.sys.mjs:701 (`quitApplication`) | Add the `eRestart` variant |
| Catalogue | powerbrowser/INTERNAL-APIS.md:28 (table) | One row per update observer and per `nsIApplicationUpdateService` read. `check-internals-boundary.sh` enforces it |
| Sidecar quit | powerbrowser/shell/TheiaService.sys.mjs:345-373 (fire-and-forget kill, 3 s grace at :363-365) | Windows (H): AsyncShutdown blocker awaiting the reap |
| Theia state dir | TheiaService.sys.mjs:522-527 (`_resolveConfigDir` reads XDG_CONFIG_HOME/HOME) | PKG-06: move under the profile. Do it early in C; it blocks the install-matrix rows |

### 3.3 Generator / configuration.toml

| Point | File:line | Change |
|---|---|---|
| Revision | configuration.toml:31-35 (`[product]` has no `revision`) | REL-01: add `revision`. Generator emits version files. Tag shape `v<ESR>-<revision>`. `release-train.mjs` derives the release key from the same two values, never from a literal |
| Update prefs | scripts/generate.mjs:2373-2374 (`app.update.url.manual/details` blank), near :2401-2406 | Add `app.update.langpack.enabled=false`. Both tracked branding files are byte-compared through the target table (:3619-3620 dev, :3661-3662 release), so regenerate and commit both |
| URL keys | scripts/generate.mjs:2645 (`release_notes, update, crash_report, homepage, search` reach only endpoint-hosts) | UPD-03 wires `release_notes` to `app.releaseNotesURL` |
| Channel | .mozconfig:8-9 (`powerbrowser-default`) | UPD-01: release-train and `build-update-xml.mjs --channel` read the channel from `release-manifest.json` (S5:268). Never a literal |
| Update host | configuration.toml:78-84; package-linux.sh:63 stages policies.json | UPD-02: stop staging AppUpdateURL. ng064 comparand changes in the same commit |

### 3.4 verify-platform.sh registry

- The quick array opens at scripts/verify-platform.sh:3565 and closes at :4627. The full block opens at :4629. Relevant full rows: `mar-update-hop` :4725, `ng063..065` :4740-4742. The quick self-test is `mar-update-hop-self-test` :4461. **The S5 draft's line numbers (3572, 4453, 4282, 4547) are stale.** Plans must cite labels, not lines.
- Quick means "no build, no browser, no display, no network" (verify-platform.sh:3563-3564). Two consequences that SEED-002 gets wrong:
  - `repo-controls` calls `gh api`, so it is **full**, not quick.
  - The RENEWALS row in SEED-002 §4 row 15 goes red 30 days before a date. That makes the commit gate depend on the calendar: unrelated commits and CI on `main` turn red, and a red required check blocks the pin-bump PR it should not touch. Split it: `renewals` (quick: structure, every row has a date and an owner action) and `renewals-due` (a release-train maintenance check that comments on the maintenance issue).
- New rows: see §6.

### 3.5 Workflows

| Point | File:line | Change |
|---|---|---|
| verify.yml triggers | .github/workflows/verify.yml:161-163 (`push`, `pull_request`) | Unchanged. It is the required check. Its completion wakes release-train through `workflow_run`. App-created PRs trigger it; `GITHUB_TOKEN`-created PRs would now run only after approval (official docs) |
| verify.yml token | verify.yml:176-177, :180-182 | Unchanged |
| rebase-upstream.yml | :22-33, :47-48, :108-115, :122-125 | Add `workflow_call`. Wrap generate in `nix develop .#theia` (R1) |
| No schedule (D-77) | rebase-upstream.yml:1-4 | Kept. `verify-workflows.mjs` asserts no `schedule:` key in any workflow |

### 3.6 Packaging

| Point | File:line | Change |
|---|---|---|
| Node pin | package-linux.sh:27-38; node-runtime.json:2-6 | AUTO-04: the bot PR bumps the JSON. `detect-upstreams.mjs` verifies the SHASUMS256 entry and its signature in the job, replacing docs/BUILD.md:1041-1049 |
| Sidecar staging | package-linux.sh:45-63 (`cp -a lib`, copied better-sqlite3) | PKG-18 reduces to one assertion (see §8, resolved). Add `test -z "$(find "$STAGE" -type l)"` before :87 and a full row |
| precomplete / tarball | package-linux.sh:87, :90-95 | Unchanged. The build job adds `make_full_update.sh` and `release-manifest.json` |

### 3.7 Theia extensions

| Point | File:line | Change |
|---|---|---|
| Branding module | theia/extensions/branding/src/browser/powerbrowser-frontend-module.ts:10-26 | Bind an update `FrontendApplicationContribution` (status bar plus two commands) and TEL-05 "Report a Bug". No new package |
| Copy rules | scripts/verify-shell-error-copy.mjs | All update and report copy passes `shell-error-copy-no-internals` |

---

## 4. Orchestrator design: `release-train.yml`

### 4.1 Triggers and how they interact

| Trigger | Who fires it | Why | Guard |
|---|---|---|---|
| `workflow_dispatch` `reason=tick` | Worker hourly (`17 * * * *` UTC) with the clock App token | Detect new ESR/Node, advance time-based steps, daily maintenance in the first tick after 06:00 UTC | none needed: dispatch requires Actions write |
| `workflow_dispatch` `reason=owner, release=<key>, action=<publish-descriptor-now\|retry\|withdraw>` | Owner (GitHub Mobile or `gh workflow run`) | Manual override paths | Owner-only by repo permission |
| `workflow_dispatch` `reason=self` | release-train itself, through `GITHUB_TOKEN` with `actions: write` | Run the next step immediately instead of waiting up to an hour | `GITHUB_TOKEN` dispatch creates runs (official docs) |
| `workflow_run: workflows: ["Verify static layers"], types: [completed]` | verify.yml finishing on a bump PR, a fixer PR, a Renovate PR or `main` | Low-latency wake on red or green | Job-level `if: github.event.workflow_run.head_repository.full_name == github.repository`. The payload is a **wake-up only**; state is re-derived from the API |
| `workflow_run: workflows: ["Release"], types: [completed]` | release.yml finishing | Advance published → descriptor / channel-live, or record a failure | same |

No `push`, no `pull_request`, no `schedule`. Merging the bump PR is a push to `main`. That push runs verify.yml, and verify's completion wakes the train. That is one path; a second `push` trigger would only add a second route to the same transition.

**Concurrency:** `concurrency: { group: release-train }`, default `queue: single`, no `cancel-in-progress`. A new pending run replaces the older pending one (official docs). For an idempotent reconciler this is the right behaviour, because coalesced wake-ups lose nothing. Do not use `queue: max`; it cannot be combined with `cancel-in-progress` and it replays stale wake-ups. The fixer has its own group, `claude-fixer`, so a 60-minute fix does not block ticks.

### 4.2 State machine (per release key `v<ESR>-<rev>`)

```
                    detect: FIREFOX_ESR (153.x only) maps to tag T, T exists, T != pin
                                              │
                                              ▼
   ┌──────────── DETECTED ── open issue, dispatch bump(T) ──▶ BUMPING
   │                                                           │
   │                     replay FAIL (apply-patches) ◀─────────┤──── gates FAIL (scan/identity/quick)
   │                              │                            │              │
   │                              ▼                            ▼              ▼
   │                         CONFLICT ──fix(F1)──▶ FIX_PR_OPEN ◀──fix(F2)── BUMP_RED
   │                              │ attempts≥2        │ owner merges fix into chore/esr-T
   │                              ▼                   ▼
   │                       NEEDS_OWNER            BUMP_PR_GREEN ── assign owner ── [GATE 1: merge]
   │                                                                │
   │                                                                ▼
   │                                                main pins T ── dispatch release.yml(sha)
   │                                                                │
   │                                                    BUILDING (legion) ── fail ─▶ BUILD_FAILED (issue only)
   │                                                                │
   │                                         AWAITING_APPROVAL ── [GATE 2: env `release`]
   │                                                                │
   │                                                    PUBLISHED (immutable Release + App tag)
   │                                                                │
   │                                      DESCRIPTOR_WAIT (env `descriptor`, 24 h wait timer;
   │                                         owner may bypass to publish sooner)
   │                                                                │
   │                                                    DESCRIPTOR_LIVE ── channel-live
   │                                                                │ green          │ red
   │                                                                ▼                ▼
   └──────────────────────────────────────────────────────────── DONE (close)   LIVE_RED → withdraw path (REL-02)
```

How each state is derived (no stored state):

| State | Derived from |
|---|---|
| DETECTED | `detect-upstreams.mjs`: product-details tag > `configuration.toml:115` and no open PR `chore/esr-T` |
| BUMPING / CONFLICT / BUMP_RED | latest release-train run's `bump` job conclusion plus its uploaded `stage` output; check runs on head `chore/esr-T` |
| FIX_PR_OPEN | open PR labelled `claude-fix` and `release:<key>` |
| BUMP_PR_GREEN | the PR's required check `verify` is success |
| BUILDING / AWAITING_APPROVAL | `release.yml` run whose `inputs.sha` = merge commit; `GET /actions/runs/{id}/pending_deployments` |
| PUBLISHED | `GET /releases/tags/v<key>` with `draft:false` |
| DESCRIPTOR_LIVE | `powerbrowser-updates` `main` contains `update.xml` naming the version |
| DONE | channel-live job success on that run |

`workflow_dispatch` returns `workflow_run_id`, `run_url` and `html_url` in its 200 response (official docs, REST "Create a workflow dispatch event"). release-train can link the exact run in the issue without polling for it.

### 4.3 Tracking-issue protocol

- **One open issue per release key.** Title `release-train: v153.6.0-1`, labels `release-train` and `state/<STATE>` (filterable on GitHub Mobile). The issue is found by label and title search on every run; its number is never stored.
- **Body = render(state).** A step table (Step | State | Evidence link | Since) followed by `<!-- release-train:v1 {"key":…,"facts":…,"runs":[…]} -->`. The comment block is a debugging snapshot and is never read as input. The body is PATCHed only when the rendered bytes differ.
- **Signals:**
  - Editing the body sends no notification. A **comment** with an `@owner` mention goes out only on a transition into a state that needs the owner: BUMP_PR_GREEN, FIX_PR_OPEN, AWAITING_APPROVAL, NEEDS_OWNER, BUILD_FAILED, LIVE_RED.
  - The owner is assigned on entering a gate and unassigned on leaving it. That keeps the steady state at SEED-002's "merge one PR, approve one deployment".
- **Writer:** the `report` job, `GITHUB_TOKEN` `issues: write`. Issue edits need to trigger no workflow, so no App token is needed. The concurrency group makes it the single writer.
- **Close** on DONE. **Reopen** on withdraw.
- **Two ESR majors at once (Phase L):** keys differ by tag, so 153.x security trains and the 175 uptake train have separate issues.
- **Maintenance issue:** one pinned `release-train: maintenance` issue, re-rendered by the daily sweep. It comments only when an item turns red.

### 4.4 Recurring maintenance sweep (daily, first tick after 06:00 UTC)

All of these run in release-train on `ubuntu-latest`, not in the Worker (CPU and subrequest caps):

1. Runner online. `GET /repos/.../actions/runners` needs admin access (official docs), so the bot App token is minted with `permission-administration: read` only. **Correction to RELEASING.md:909-910:** a self-hosted job is cancelled after 24 h in the queue (official docs, Actions limits); it does not wait forever. The cancellation still sends the owner nothing useful, so the check stays.
2. ESR pin age vs `FIREFOX_ESR` (> 3 days behind → red), with the 153 major guard.
3. `renewals-due` from docs/RENEWALS.md (≤ 30 days → red).
4. `repo-controls` (live settings vs tracked bodies).
5. Dependabot and CodeQL open-alert counts. CodeQL default setup disables itself after 6 months without a push, so the last-push age is checked as well.
6. Codeberg mirror: compare the Codeberg `main` SHA (public API, unauthenticated) with GitHub `main`. This turns SEED-002 §4 row 14's "a failed timer is silent; accepted" into a detected failure at no cost.
7. Channel liveness (update.xml per target, HEAD of each MAR, version = latest Release). These subrequests no longer count against the Worker's 50 per invocation.
8. **Dead-man check for the clock.** If the Worker stops, nothing runs, and nothing in this repo can report it. Put the watchdog outside the product repo: a `schedule:` workflow in `powerbrowser-updates` (D-77 binds the product repo only) or in the Upptime repo (G). It asserts that the last release-train run is under 26 h old and opens an issue in its own repo if not. Two independent clocks watch each other.

Download counts (SEED-002 §4 row 13 → D1) stay in a Worker because D1 is bound there. That costs one subrequest.

---

## 5. Claude fixer design

### 5.1 When it runs (derived by the reconciler)

| Class | Trigger state | Target branch for the fix PR | Allowed |
|---|---|---|---|
| F1 patch-replay conflict | CONFLICT | `chore/esr-T` | yes, except patch 030 |
| F2 red bump PR | BUMP_RED on `chore/esr-*`, `chore/node-*`, `renovate/*` (Theia group) | that PR's head branch | yes |
| F3 red `main` | verify.yml failure on `push` to `main` | `main` | yes |
| release.yml failures (legion build, signing, publish, descriptor) | BUILD_FAILED etc. | — | **no**: issue only. A hosted runner cannot reproduce the Gecko build (about 14 GB disk), and signing is out of bounds |
| Fork PRs, external authors, anything whose head repo ≠ this repo | — | — | **never** |
| Triage (G) | `issues: opened` | — | separate `triage.yml`, `triage` env, Haiku, label/comment tools only |

Attempts: at most 2 per (release key, class). The count is derived from PRs labelled `claude-fix` and `release:<key>`. On the third failure the state goes to NEEDS_OWNER.

### 5.2 Job chain (three jobs, three trust levels)

```
fix (ubuntu-latest, env `fixer`)                 fix-gate (ubuntu-latest, no env)         fix-pr (ubuntu-latest, env `bot`)
  GITHUB_TOKEN: contents:read, actions:read        GITHUB_TOKEN: contents:read             GITHUB_TOKEN: {}  (none)
  Anthropic credential (fixer env only)            no secrets                              App token: contents:write,
  NO App token                                     fresh checkout of target branch           pull_requests:write, NO workflows
  1. checkout main at workspace root               1. apply diff artifact                  1. push claude-fix/<key>-<n>
     (trusted CLAUDE.md, .claude/)                 2. path filter: reject .github/**,      2. open PR → target branch,
  2. checkout target into work/                       .github/settings/**, patches/030*,       label claude-fix + release:<key>,
  3. nix develop .#theia; fetch upstream at T;        powerbrowser/packaging/mar/**,           assign owner, body = Claude
     apply-patches (leaves conflict markers)          brand/mar-*.der, toolchain-baseline     summary (structured_output)
  4. claude-code-action (pinned SHA) with             .txt, flake.lock                         + gate log
     path_to_claude_code_executable = pinned       3. regenerate-patches.sh --check        3. never merge, never approve
     Claude Code; prompt per class;                   (replay on fresh upstream at T)         (main ruleset needs an approval
     --max-turns 40; allowedTools limited;         4. apply-patches non-vacuity,              the App cannot give)
     deny Edit on the path list above              check-patch-surface, scan-brand-residue,
  5. upload `git -C work diff` (excl. upstream/)      diff-theia-core.sh, verify-platform --quick
                                                   5. upload gate verdict
```

- **Patch rule enforcement.** The prompt tells Claude to resolve markers in `work/upstream/` and then run `scripts/regenerate-patches.sh`. The gate does not trust that it did: `--check` re-derives the patches from a fresh replay and byte-compares them. A hand-edited hunk cannot pass.
- **Theia rule.** `scripts/diff-theia-core.sh` runs in the gate, so a fix that edits Theia core is rejected (CLAUDE.md hard rule 1).
- **Untrusted content.** `renovate/*` heads carry registry content. The fixer checks out main at the workspace root and the target in `work/`, per claude-code-action's security.md pattern ("Do not check out an untrusted ref into the workspace root"). `yarn install --ignore-scripts` as in verify.yml:220.
- **Credential choice for the Claude API.** Prefer the action's OIDC federation (`anthropic_federation_rule_id`, `anthropic_organization_id`, `id-token: write` on the `fix` job only; action.yml). It leaves no static key to leak. If that is not available to the account, use an `ANTHROPIC_API_KEY` stored only in the `fixer` environment, from a dedicated Console workspace with a monthly spend limit. Either way, the `fixer` env is branch-restricted to `main`, so a workflow edited on any other branch cannot read it.
- **Pinning Claude Code.** SEED-002 §4 row 17 notes the action "downloads Claude Code at run time outside the pin". `path_to_claude_code_executable` skips that auto-install (action.yml). Install an exact Claude Code version, with integrity, in a prior step and pass the path. This resolves that row.
- **Spend limits, in four layers:**
  1. Console workspace monthly limit.
  2. `--max-turns`.
  3. `timeout-minutes: 90`.
  4. 2 attempts per class per release, plus the single `claude-fixer` concurrency group.
- **Logs.** The repo is public: keep `show_full_output` and `display_report` false (action.yml warns that both can expose content).

### 5.3 Why the App lacks `workflows`, and the self-hosted runner

SEED-002 §6 rightly says label hygiene alone does not protect legion, because any workflow file on any pushed branch can name the label. Controls, in order of strength:

1. **Runner group restricted to `DeBIOS-Foundation/powerbrowser/.github/workflows/release.yml@refs/heads/main`.** GitHub supports "selected workflows" pinned to a ref (github.blog 2022-03-23). Whether this is available to a **Free** organisation's default group is **open**: the docs say additional groups need the Team plan and do not settle the default group. Probe it in A3: `gh api /orgs/DeBIOS-Foundation/actions/runner-groups`, then a PATCH to `restricted_to_workflows`.
2. **No principal except the owner can push workflow changes.**
   - `GITHUB_TOKEN` never has workflow-write.
   - The bot App is created without the Workflows permission. GitHub then rejects pushes touching `.github/workflows/`. This is corroborated by actions/create-github-app-token issue #301 and multiple vendor KBs, not by a GitHub doc page (MEDIUM).
   - Dependabot's github-actions updates run with read-only tokens and no secrets.
   - Mend Renovate's app does hold workflow scope. Limit it with `enabledManagers` and accept that residual risk, or self-host `renovatebot/github-action` with the bot App token, which cannot touch workflows.
3. Fork-PR approval for all external contributors (already planned, RELEASING.md:437-450 table).
4. `release.yml` never on `pull_request`, and the label used in exactly one job. `verify-workflows.mjs` asserts both.
5. Non-ephemeral runner registered once with a registration token. No PAT on legion (SEED-002 decision 2). This removes `/var/lib/secrets/github-runner-pat` from RELEASING.md:477 and the S5:240 operator steps.

---

## 6. Job permission matrix

`GITHUB_TOKEN` default is read-only (`workflow-permissions.json`). Every job declares `permissions:` explicitly. Repository-level secrets stay at zero (RELEASING.md:473).

| Workflow / job | Runner | Environment | GITHUB_TOKEN permissions | App token (mint scope) | Secrets visible | Writes |
|---|---|---|---|---|---|---|
| Worker `scheduled()` | Cloudflare | — | — | clock App: `actions:write`, repo powerbrowser | clock App key | dispatch only |
| release-train `derive` | ubuntu-latest | — | contents:read, actions:read, pull-requests:read, issues:read | — | none | none |
| release-train `detect` | ubuntu-latest | — | contents:read | — | none | none (network: product-details, api.github.com, nodejs.org) |
| release-train `bump` (= rebase-upstream.yml via `workflow_call`) | ubuntu-latest | — | contents:read, `persist-credentials: false` | — | none | artifact: diff, apply log, stage |
| release-train `bump-pr` | ubuntu-latest | `bot` | none (`{}`) | bot App: contents:write, pull-requests:write | bot App key | branch `chore/esr-T`, PR |
| release-train `fix` | ubuntu-latest | `fixer` | contents:read, actions:read, (+ id-token:write if OIDC) | — | Anthropic credential | artifact: diff |
| release-train `fix-gate` | ubuntu-latest | — | contents:read | — | none | artifact: verdict |
| release-train `fix-pr` | ubuntu-latest | `bot` | `{}` | bot App: contents:write, pull-requests:write | bot App key | branch `claude-fix/*`, PR |
| release-train `dispatch-release` | ubuntu-latest | — | actions:write | — | none | dispatch release.yml (initiator github-actions[bot], so `prevent_self_review: true` becomes possible) |
| release-train `maintenance` | ubuntu-latest | `bot` | contents:read, security-events:read | bot App: administration:read, dependabot-alerts:read | bot App key | none |
| release-train `report` | ubuntu-latest | — | issues:write | — | none | issue body, comments, assignment, labels |
| release.yml `build-linux` | `[self-hosted, powerbrowser-release]` | — | contents:read | — | **none** (RELEASING.md:481-483 gate) | artifacts (retention 1 day) |
| release.yml `sign-publish` | ubuntu-latest | `release` (owner, branch `main`) | contents:write, id-token:write, attestations:write | bot App: contents:write (tag creation restricted to the App by ruleset) | MAR p12 + password, bot App key | draft → publish, tag, R2 copy, manifest commits |
| release.yml `descriptor` | ubuntu-latest | `descriptor` (wait 1440 min, branch `main`) | `{}` | bot App: contents:write, repo **powerbrowser-updates** only | bot App key | update.xml commit |
| release.yml `channel-live` | ubuntu-latest | — | contents:read | — | none | none |
| powerbrowser-updates `withdraw` | ubuntu-latest | `release` there | contents:write | — | none | no-update descriptor |
| triage.yml (G) | ubuntu-latest | `triage` | issues:write, contents:read | — | Anthropic (Haiku) | labels, comments |

Notes:
- The App key secret has to exist in every environment whose job mints the bot token (`bot`, `release`, `descriptor`), because a job references exactly one environment. The descriptor-repository PAT in RELEASING.md:476 is replaced by an App token scoped with `repositories: powerbrowser-updates`, which removes one renewal row.
- `actions/create-github-app-token` (v3) revokes the token in its post step, so a token cannot cross jobs (official README). That is the property that keeps the App token out of the `fix` job.
- A `main` ruleset requiring one approving review, with the owner's admin role as bypass actor, lets the owner keep committing directly. The App and Claude can never merge, because neither can approve its own PR. Rulesets on a Free-org public repo are **still open** (§8). The fallback is classic branch protection with the same shape.

### New `verify-platform.sh` rows

| Label | Tier | Asserts (derived, set-equality, `--self-test` plants) |
|---|---|---|
| `workflows` + `-self-test` | quick | Over all workflow files: no `schedule:`; legion label in exactly one job (release.yml `build-linux`) with no `secrets.`, no `environment:`; `claude-code-action` only on `ubuntu-*` jobs with no App-token step and no `contents: write`; every `workflow_run` job guards `head_repository`; every `uses:` is a 40-hex SHA admissible under `.github/settings/actions-selected.json`; `contents: write` + `id-token: write` + `attestations: write` only on `sign-publish`; release.yml and release-train have no `pull_request`/`pull_request_target` |
| `release-train-logic-self-test` | quick | `release-train.mjs` derive/next/render over fixture API JSON. Plants: a merged PR with an unchanged pin, a draft Release, a fork-head `workflow_run`, a third fixer attempt, a 175.x ESR under the 153 guard |
| `detect-upstreams-self-test` | quick | Tag mapping, major guard, SHASUMS parse, from fixtures |
| `patches-regenerated` + `-self-test` | quick (reads the applied `upstream/` that verify.yml:216-217 already provides) | Every tracked patch equals `regenerate-patches.sh --check` output. Plant: one hunk body edited by hand |
| `renewals` | quick | RENEWALS.md structure only |
| `repo-controls` | **full** (network) | as RELEASING.md:431 |
| `sidecar-no-symlinks` | full | `find <stage> -type l` empty |
| `shell-request-kinds` | quick | SEED-002 §5: `SHELL_MESSAGE_KINDS` ↔ Theia dispatches |

---

## 7. Data and control flows

1. **ESR point release (steady state, about every 2 weeks).** Worker tick → release-train `detect` sees 153.6.0esr → issue opened → `bump` runs rebase-upstream.sh → green → `bump-pr` opens `chore/esr-FIREFOX_153_6_0esr_RELEASE` with the App token → verify.yml runs on it → `workflow_run` wakes the train → BUMP_PR_GREEN, owner assigned → **owner merges** → verify on `main` → wake → `dispatch-release` (sha) → legion build → **owner approves `release`** → publish + App tag → `descriptor` waits 24 h, or the owner bypasses it after their own N-1→N hop → update.xml committed → Pages deploys → `channel-live` → DONE, issue closed.
2. **Replay conflict.** `bump` fails at apply-patches → CONFLICT → `fix` / `fix-gate` / `fix-pr` → PR into `chore/esr-T` → owner reviews and merges it into the bump branch → the bump PR re-runs verify → flow 1 continues. After 2 failed attempts: NEEDS_OWNER, and the owner regenerates the patch locally with the same script.
3. **Theia monthly.** Mend opens `renovate/theia` → verify red (expected: 1.77 needs TypeScript 6.0 against theia/package.json:64 `~5.9.3`) → wake → F2 fixer PR into `renovate/theia` → owner merges → train continues as an out-of-band revision release (`revision`+1).
4. **Node 24 point release.** `detect` finds a new v24.x → verifies SHASUMS256 and signature in the job → `bump-pr` opens `chore/node-v24.x` editing node-runtime.json → same path as flow 1 with `revision`+1.
5. **Update on the client (UPD-08).** Gecko update timer → `UpdateService` stages the update → PowerBrowserAPI observers → `PowerBrowserWebTabState {kind:'appUpdate'}` → branding contribution → "Restart now" → `restartToUpdate` → `quitApplication` with `eRestart`.

---

## 8. SEED-002 "Unverified" list: what this research resolved

| Item | Result | Evidence |
|---|---|---|
| MAR symlink claim (58 node_modules symlinks) | **RESOLVED: false for the current packaging.** The tarball built 2026-10-17 by package-linux.sh, with Node v24.19.0 and Theia 1.76.0 staged, contains **0 symlinks**. The sidecar is a bundled `theia/lib/` plus a copied `node_modules/better-sqlite3`, with no `@powerbrowser/*` package directories. PKG-18 reduces to the `sidecar-no-symlinks` assertion | `tar -tvJf /home/chris/coding/Power-Browser/objdir/dist/powerbrowser-153.5.0.en-US.linux-x86_64.tar.xz` (0 `l` entries, 78 `theia/` entries); package-linux.sh:47, :57-60 |
| MAR size (PKG-21) | **Partly resolved.** Tarball with sidecar and Node: 129,529,524 bytes. Prior Gecko-only complete MAR: 78,654,141 bytes. Expect a complete MAR of about 130 MB, since both are xz. Measure in C | same tarball; `.mozbuild/mar-hop/nplus1.mar` in the main checkout |
| Fine-grained PAT expiry | **Avoided.** Org default max lifetime is 366 days and owner approval is required by default (official docs). The design uses no PAT: two Apps, whose private keys do not expire, plus a one-time runner registration token | docs.github.com …/setting-a-personal-access-token-policy-for-your-organization |
| "Runner offline queues forever" (RELEASING.md:909-910) | **Corrected:** a self-hosted job is cancelled after 24 h in the queue | docs.github.com/en/actions/reference/limits |
| GITHUB_TOKEN-created PRs "trigger no workflows" (SEED-002 §3) | **Refined:** they now create runs in an approval-required state. The App token is still needed for unattended CI | docs.github.com/en/actions/concepts/security/github_token |
| Worker as detector and liveness host | **Resolved against it:** Free cron = 10 ms CPU, 50 subrequests, 5 crons per account | developers.cloudflare.com/workers/platform/limits |
| claude-code-action downloading Claude Code outside the pin (§4 row 17) | **Resolved:** `path_to_claude_code_executable` skips auto-install | action.yml (anthropics/claude-code-action main) |
| 24 h canary delay mechanism (decision 12) | **Resolved without a Worker:** environment wait timer, max 43,200 min. Wait time is not billed. Admins can bypass unless that is disabled, which is the owner's "publish sooner" path | docs.github.com …/deployments-and-environments |
| Required reviewers on a public repo on Free | **Confirmed** available | same page |
| Rulesets on Free public org repos | **Open.** The docs pages fetched today mention only Team/Enterprise for org rulesets and give no Free statement. Probe in A3. Fallback: classic branch protection | docs.github.com …/about-rulesets |
| Runner group "selected workflows" on Free | **Open** (§5.3). Probe in A3 | github.blog 2022-03-23; docs manage-access |
| App `workflows` permission blocks workflow-file pushes | **MEDIUM** (community and issue sources only) | actions/create-github-app-token#301 |

Not addressed by this architecture lens; still open for STACK and PITFALLS: signmar Nix closure on hosted runners, Mend 30-minute cap and the nix manager, bot commits and the 60-day rule (moot for the product repo, relevant to the Upptime/watchdog repo), Pages `.well-known`, anonymous `gh attestation verify`, partner search codes, the Windows updater rename with a live node.exe, Windows background task, Azure price and eligibility, Apple certificate term, Dependabot SHA-comment rewriting, Open Collective, sidecar egress vs layer 3, macOS cross toolchain, WebGL on WSLg, Flathub source rule, Cachix eligibility, the 500 MB artifact cap on public repos (listed as Free plan storage in the limits page; public-repo exemption unconfirmed; mitigate with `retention-days: 1` and deleting artifacts after `sign-publish`), and `_redirects` on the 11-segment path.

### Contradictions in the tree that plans must fix

- **R1.** rebase-upstream.yml:108-115 runs `node scripts/generate.mjs` outside Nix. verify.yml:148-157 states that generate needs the pinned inkscape 1.4.4, or it fails at the 16-pixel icon. The rebase workflow has likely been red-by-construction since the rasteriser landed. Confirm with one dispatch before `workflow_call` builds on it.
- **R2.** RELEASING.md:231 and :431 name `scripts/verify-repo-controls.mjs` and a `repo-controls` row. Neither exists, and `.github/settings/` is absent.
- **R3.** RELEASING.md:258-288, :477 and S5:240 describe an ephemeral runner with a PAT on legion. SEED-002 decision 2 chose non-ephemeral with a registration token.
- **R4.** RELEASING.md:320-321 sets the `release` environment's deployment policy to the tag pattern. It must be branch `main` (§1 item 5). The `release-tag-signatures` ruleset (:314-317) does not bind tag objects (SEED-002 §6), so drop it in favour of App-only tag creation.
- **R5.** RELEASING.md:681 and rebase-upstream.yml:2 say a four-week cadence. It is two weeks.
- **R6.** The S5 draft creates the release with `--generate-notes` and commits descriptors in the sign job (S5:270). SEED-002 replaces both: derived notes, and a delayed descriptor.

---

## 9. Suggested build order (phases A–L, with orchestrator and fixer placed)

External gates: Apple (site live + D-U-N-S + enrolment), Azure (1–20 business-day validation, billed from creation), ESR calendar (153.6 2026-10-27, then every 2 weeks; ESR 175 nightly 2027-05-27, beta 06-10, release 06-29; 153 ends 2027-09-07).

| Order | Phase / item | Depends on | Notes |
|---|---|---|---|
| 0 | Owner, now, zero cost: request a D-U-N-S number; create the Cloudflare account | — | D-U-N-S lead time blocks Apple (I). The Worker can run on `workers.dev` before the DNS move, so the clock does **not** wait for D |
| A1 | Pin bump to `FIREFOX_153_5_1esr_RELEASE` by hand | — | Also the first real run of rebase-upstream.yml; fixes R1 |
| A2 | UPD-01 channel reconcile, REL-01 `revision`, UPD-02/03, PKG-08/09 | A1 | Generator and byte-identity work |
| A3 | GH-02: settings bodies, rulesets probe, environments (`release`/`bot`/`fixer`/`descriptor`, all branch `main`), Actions allow-list (add create-github-app-token, claude-code-action, attest-build-provenance), both Apps (bot without Workflows), runner-group probe, `repo-controls` (full) | — | Resolves the two open platform questions before anything depends on them |
| A4 | `regenerate-patches.sh` + `patches-regenerated` row | A1 | Needed by the owner and the fixer; lands before any automation touches patches |
| A5 | AUTO-01: release-train skeleton (derive, detect, bump via `workflow_call`, bump-pr, report, conflict issue) + `release-train.mjs` + `verify-workflows.mjs`; scheduler Worker on workers.dev | A2, A3, A4 | Exit test: 153.6 (10-27) or 153.7 (11-10) arrives as a bot PR with a tracking issue and no owner dispatch |
| A6 | AUTO-04 Node detector in `detect-upstreams.mjs` | A5 | |
| A7 | GH-01, DOC-01 (RENEWALS split into quick structure + maintenance due; R2–R6 doc fixes) | A3 | Startable in parallel |
| B | SEC-05 secondary key ceremony → patch 030 regenerated with A4's script; UPD-04 `build-update-xml.mjs` CLI | A4 | Owner ceremony is the gate |
| C | PKG-06 first, then PKG-17 container/Debian-sysroot Gecko build (long), PKG-18 assertion only, UPD-08, PKG-04/05/07, UPD-05, PKG-21 measure | A2 | PKG-17 is the longest single item; start the rebuild early in C |
| D | INF-01 DNS move, DIST-03 updates host + `_redirects` probe, INF-02, TEL-06/08, WEB-01; INF-03 becomes the release-train **maintenance sweep** (liveness, runner, mirror, pin age) plus the external watchdog | A5 | Site live → Apple fee-waiver application can start |
| E | DIST-02 `release.yml` (build-linux non-ephemeral, sign-publish, `descriptor` wait-timer env, channel-live), release-train states BUILDING→DONE, REL-02 withdraw, AUTO-05 toolchain baseline in build job, INF-04 hosted fallback measured, runner registered **after** fork-approval and runner-group controls; first public release | B, C, D | Release-train is complete for Linux here |
| F | AUTO-02 Renovate, AUTO-03, DIST-05, UPS-02; **FIX-01 Claude fixer** (fix/fix-gate/fix-pr, `fixer` env, OIDC or spend-limited key, pinned Claude Code) | A4, A5, E (states to wake on) | First real exercise: the Theia 1.77 TypeScript-6 red PR. Must be proven before 2027-05-27 |
| G | TEL-05, GH-03 triage (shares the action pin; separate env and model), GH-04 Codeberg mirror (checked by the sweep), MON-02 Upptime hosting the watchdog | E | |
| H | Windows: PKG-10..13, UPD-09, LEG-01, MTX-01; start the Azure account when H is 3–4 weeks out; release-train gains a per-OS sign job and descriptors per observed BUILD_TARGET | E | Unsigned first |
| I | macOS: PKG-14..16, SEC-04 | D (site), D-U-N-S, Apple enrolment | |
| J | DIST-04, PKG-19 flake repack, INF-05, PKG-20; manifest commits in `sign-publish` | E (I for darwin) | |
| K | TEL-09/07 only if the crash exclusion is retired | H | Optional |
| L | UPS-01 ESR 175 | F proven | From 175 beta (2027-06-10): the major guard opens an uptake train issue and runs the bump job against the 175 beta tag in replay-only mode, so conflicts surface three weeks before release. The fixer works `chore/esr-175` while 153.x trains continue under separate keys. Ship on 175.x before 153.27 (2027-09-07) |

**Ordering rationale:** The orchestrator skeleton and the patch-regeneration script come first (A), because a release every two weeks costs owner time on every cycle until they exist. Signing (B) and the portable build (C) are prerequisites of any public artifact. The fixer waits until the states it reacts to exist (E). It must be proven on a real red PR well before the ESR 175 window, which is the period with the most patch conflicts.

**Research flags:** A3 (two platform probes), C/PKG-17 (toolchain), E (artifact storage cap, signmar closure), F (OIDC federation availability for the account; the current model id), L (175 patch drift) need phase research. A5, A6 and the report protocol use standard patterns.

---

## 10. Anti-patterns

1. **One long workflow run spanning human gates.** It cannot wait on a PR merge, and the 35-day run limit plus environment waits make failures opaque. Use the reconciler instead.
2. **The issue body as the state store.** That is a hand-kept list by another name: it drifts from GitHub facts. Derive the state every run.
3. **Detection logic in the Worker.** 10 ms CPU and 50 subrequests on Free, untestable by `verify-platform.sh`, and a second copy of `configuration.toml` parsing.
4. **Giving claude-code-action an App token, `contents: write`, or a self-hosted runner.** Prompt injection then reaches a write credential. Use the three-job split.
5. **Checking out a PR head at the workspace root before the action** (security.md). Use `work/`.
6. **Network- or calendar-dependent `--quick` rows** (`repo-controls`, renewals due). They redden unrelated commits and block the required check.
7. **Tag-triggered `release.yml` with a signature ruleset.** `required_signatures` binds commits, not tag objects. Use App-created tags after approval.
8. **Text-editing patch hunks** (by Claude or the owner). The 3-way apply then degrades to a silent no-op. Use `regenerate-patches.sh` and the equality row.
9. **`queue: max` or `cancel-in-progress` on the reconciler.** It replays stale wake-ups or kills a mid-flight transition. Use the default single pending run.

## 11. Scaling considerations

Scale here means releases per year and concurrent trains, not users.

| Concern | Now (≈25 Linux releases/yr) | + Windows/macOS | ESR 175 overlap (2 trains) |
|---|---|---|---|
| GitHub API (GITHUB_TOKEN 1,000 req/h/repo) | Hourly tick, about 30 calls | about 50 | about 80. Fine |
| Artifacts (Free limits page: 500 MB) | about 260 MB per release, retention 1 day | about 3× | Can exceed it. Delete artifacts after `sign-publish` |
| Worker | 24 ticks/day, 3 subrequests | same | same |
| legion | One about 50-minute build per release | + cross builds | Two objdirs at about 14 GB each. Hosted fallback (INF-04) |
| Anthropic spend | 0–2 fixer runs/month | same | Peak in L. Workspace limit caps it |

## 12. Integration points summary

### External services

| Service | Pattern | Notes |
|---|---|---|
| GitHub REST | App tokens (bot, clock) + `GITHUB_TOKEN` | Dispatch returns the run id |
| Cloudflare Worker cron | Clock App JWT signed with WebCrypto RS256 | Whether RS256 signing fits in 10 ms CPU is unmeasured; measure once. Fallback: Workers Paid, or dispatch from the external watchdog |
| product-details / matching-refs / nodejs.org | Fetched by `detect` on ubuntu-latest | Never from legion |
| Anthropic API | claude-code-action, OIDC preferred | Spend-limited workspace |
| Codeberg API | Unauthenticated read in the sweep | Mirror health |
| Mend Renovate / Dependabot | Their own Apps open PRs | Wake the train through verify `workflow_run` |

### Internal boundaries

| Boundary | Communication | Notes |
|---|---|---|
| release-train ↔ release.yml | `workflow_dispatch` (sha input) and `workflow_run` back | Separate concurrency and run history per release |
| release-train ↔ rebase-upstream.yml | `workflow_call` | One definition of the replay |
| fix ↔ fix-gate ↔ fix-pr | Artifacts only | No token crosses a job (create-github-app-token revokes at job end) |
| Gecko updater ↔ Theia | PowerBrowserAPI observers → `PowerBrowserWebTabState` | Catalogued in INTERNAL-APIS.md |
| release.yml ↔ powerbrowser-updates | App token scoped to that repo | Replaces the descriptor PAT |

## Sources

- In tree (read 2026-10-20): .github/workflows/rebase-upstream.yml:1-137; .github/workflows/verify.yml:1-119; configuration.toml:31-116; scripts/rebase-upstream.sh:1-172; scripts/apply-patches.sh:1-80; scripts/verify-platform.sh:3555-3575, 4615-4760, 4995-5012; powerbrowser/packaging/package-linux.sh:1-97; powerbrowser/packaging/node-runtime.json; powerbrowser/shell/PowerBrowserAPI.sys.mjs:295, 701, 862, 2217-2292, 3389, 3676; powerbrowser/shell/TheiaService.sys.mjs:345-373, 522-527; scripts/generate.mjs:2373-2406, 2602-2645, 3619-3662; scripts/verify-mar-update-hop.mjs:109; .mozconfig:6-17; patches/*.patch `+++ b/` headers; docs/RELEASING.md:231, 258-322, 430-490, 676-684, 900-984; .planning/drafts/distribution/S5-linux-release-pipeline-and-update-channel-PLAN.md:7-38, 240, 268-312; theia/extensions/branding/src/browser/powerbrowser-frontend-module.ts:10-26.
- Local artifact: /home/chris/coding/Power-Browser/objdir/dist/powerbrowser-153.5.0.en-US.linux-x86_64.tar.xz (2026-10-17, 129,529,524 bytes, 0 symlinks); /home/chris/coding/Power-Browser/.mozbuild/mar-hop/nplus1.mar (78,654,141 bytes).
- Official docs (fetched 2026-10-20; seam tier LOW for provider `webfetch`):
  - https://docs.github.com/en/actions/concepts/security/github_token
  - https://docs.github.com/en/rest/actions/workflows#create-a-workflow-dispatch-event
  - https://docs.github.com/en/rest/authentication/permissions-required-for-github-apps
  - https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments
  - https://docs.github.com/en/actions/reference/limits
  - https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency
  - https://docs.github.com/en/rest/actions/self-hosted-runners
  - https://docs.github.com/en/actions/how-tos/manage-runners/self-hosted-runners/manage-access
  - https://docs.github.com/en/organizations/managing-programmatic-access-to-your-organization/setting-a-personal-access-token-policy-for-your-organization
  - https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets
  - https://developers.cloudflare.com/workers/platform/limits/
  - https://developers.cloudflare.com/workers/configuration/cron-triggers/
  - https://github.com/anthropics/claude-code-action/blob/main/docs/security.md
  - https://github.com/anthropics/claude-code-action/blob/main/docs/usage.md
  - https://raw.githubusercontent.com/anthropics/claude-code-action/main/action.yml
  - https://github.com/actions/create-github-app-token
- Secondary (MEDIUM):
  - https://github.blog/2022-03-23-github-actions-secure-self-hosted-runners-specific-workflows
  - https://github.com/actions/create-github-app-token/issues/301
  - https://jira.mongodb.org/browse/PYTHON-6076

---
*Architecture research for: v1.6 Deployment setup (release-train orchestrator, Claude fixer, SEED-002 A–L)*
*Researched: 2026-10-20*
