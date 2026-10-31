# Phase 51, plan 51-01: BLOCKED items

Written by the 51-01 executor. The declarative half (config, verifier, registry rows) is
built and committed. The items below need a missing premise or the owner, and were not done.
Nothing was pushed, dispatched, or applied to a live repository.

## 1. Renovate dispatch job is not applied: missing premise (sweep tick)

**Blocked piece:** the `renovate-theia` job in `.github/workflows/release-train.yml`, and the
`renovatebot/github-action@*` entry in `.github/settings/actions-selected.json`.

**Why:** the job's trigger is the maintenance sweep tick (first tick after a last-Thursday Theia
release, plus owner dispatch). That sweep is Phase 48 plan 03. Plan 48-03 has a PLAN and no
SUMMARY, and no sweep renderer exists under `scripts/`. Plan 51-01's missing-premise gate stops
the dispatch job while the sweep is absent. The `release-train.yml` file itself exists (Phase 43),
but its dispatch inputs are `reason` and `dry-run` only. It has no `renovate-theia` input.

The admission is withheld with the job. An admission that no workflow uses turns the
`workflows` row red (`admission-used`), so `actions-selected.json` is unchanged in this plan.

**Owner steps:**

1. Execute Phase 48 plan 03 (maintenance sweep), so the tick source and its renderer exist.
2. Re-resolve the Renovate action at execution time:
   `gh api repos/renovatebot/github-action/releases/latest --jq .tag_name`, then resolve that tag
   to a 40-hex commit with `gh api repos/renovatebot/github-action/git/matching-refs/tags/<TAG>`.
   Dereference an annotated tag object to its commit before pinning.
3. Run a follow-up plan that adds the `renovate-theia` job to `release-train.yml`. The job spec is
   in `51-01-SUMMARY.md` under "Dispatch job spec (not applied)". In the same commit, admit
   exactly `renovatebot/github-action@*` in `actions-selected.json`.
4. Apply the admission body from the owner terminal with
   `node scripts/apply-repo-controls.mjs --yes`. Read back
   `gh api repos/ORG/REPO/actions/permissions/selected-actions` and confirm
   `renovatebot/github-action` is present. Plan 41-04 is a PLAN with no SUMMARY, so confirm it has
   been executed before this step.

## 2. Bot App for the Renovate run: owner

The dispatch job mints a token from the existing bot App, the same App Phase 43 BLOCKED item 2
describes. Nothing new is needed for Renovate. The owner must have the App installed on
`powerbrowser` only, the `BOT_APP_ID` repository variable set, and `BOT_APP_PRIVATE_KEY` in the
`bot` environment. No PAT is used, and none may be added.

## 3. First live run and merge review: owner

After item 1 is applied:

1. Dispatch: `gh workflow run release-train.yml --ref main -f reason=owner -f renovate-theia=true`,
   then watch `gh run list --workflow=release-train.yml` until the `renovate-theia` job reaches
   the PR step.
2. Confirm the rendered branch name. The config's `chore/theia-` prefix with groupSlug `theia`
   is expected to render as `chore/theia-theia`. This is not verified offline.
3. Review the PR with `gh pr view <PR> --files`. It should show `theia_release` in
   `configuration.toml`, the `theia/package.json` resolutions, `theia/yarn.lock`, and the
   regenerated `THIRD-PARTY-NOTICES.txt`. Whether it also carries `flake.lock` is unverified (see
   the summary).
4. Merge only after `verify.yml` is green, with `gh pr merge <PR> --squash`. Never with automerge.

## 4. Not performed by the executor

No push, no `gh workflow run`, no App or token creation, no `gh` write, and no live apply. The
measurements in the summary used local tooling only, plus network reads for the cold install in a
scratch copy.

## 5. Owner decision: flake.lock is not moved by the Theia PR (AUTO-02 partial)

**Blocked piece:** AUTO-02's clause "`flake.lock` updates through the nix manager"
(`.planning/workstreams/deploy/REQUIREMENTS.md`, AUTO-02 line).

**Why:** the config no longer enables the nix manager, which Renovate defaults to off. The only flake
input is `nixpkgs`, and the scope rule disables it, so no flake.lock change is ever proposed. The
earlier config set `nix.enabled: true`; the manager ran and produced nothing. The verifier's `[nix]`
rule now refuses re-enabling it. Research decision 19 keeps nixpkgs out of the Theia PR, and that
reasoning holds, but it does not meet the requirement text.

**Options (owner picks one):**

- (a) Keep the separation and meet the text: a third packageRule for `nixpkgs` with its own groupName
  and groupSlug, `automerge: false`, and its own branch prefix. The verifier's `[scope]` and `[nix]`
  rules then change to "nixpkgs is in its own group, never in theia". Re-open research question 6
  first.
- (b) Amend AUTO-02 and ROADMAP Phase 51 criterion 1 to read "`flake.lock` is not moved by the Theia
  PR". The nix manager stays off, and AUTO-02 can close on its other clauses.

**Until one option is chosen:** AUTO-02 is partial. Nothing in this plan claims that flake.lock is
updated.

## 6. Dispatch-job requirements for the post-upgrade hook (WR-05)

The Theia PR runs `postUpgradeTasks` (executionMode `branch`) on its branch. That hook runs
`node scripts/generate-licensing.mjs` and `node scripts/generate.mjs --check`, and it commits back only the
`fileFilters` files. The hook does not run until the dispatch job of item 1 exists. The job must provide:

1. **Allow-list in the job environment.** Renovate's executor only warns on a post-upgrade command that is
   not on the allow-list, and then skips it (`execute-post-upgrade-commands.js:123`). Set
   `RENOVATE_ALLOWED_POST_UPGRADE_COMMANDS` to `["^node scripts/generate-licensing\\.mjs$", "^node scripts/generate\\.mjs --check$"]`.
   A repository file cannot carry this option (verifier rule `allowed-post-upgrade`). Without it the PR
   opens with `theia/yarn.lock`, the pins and `theia_release` changed, and `THIRD-PARTY-NOTICES.txt` stale,
   and the `licensing` row goes red on the first PR.
2. **`theia/node_modules` present before Renovate runs.** The generator fails on an absent `node_modules`
   (`scripts/generate-licensing.mjs`, hard Fail). Run `yarn install --ignore-scripts --frozen-lockfile` in
   `theia/` inside `nix develop .#theia`, then confirm `git status` is clean. Not verified: whether Renovate's
   own yarn run leaves `node_modules` behind. Renovate runs yarn with `--ignore-platform`, which may change the
   optional-dependency set the generator walks. The cold-install figures in the summary come from a scratch
   tree, not a fresh runner.
3. **`python3` on the runner `PATH`.**
4. **The Node archive** at `.mozbuild/node-dist` (31.6 MB). A fresh runner downloads it once; that cost is
   not in the summary's figures.
5. **A git checkout, not an export.** The generator calls `git rev-parse --git-common-dir`.

`generate.mjs --check` writes nothing. On drift it fails and the job reports an error. It does not repair
the drift, so a failing check leaves the PR for the owner.

**AUTO-02 is complete only after one real PR shows the `licensing` row green.** Until then the hook is
unverified. A follow-up must add a `workflows`-row assertion for `RENOVATE_ALLOWED_POST_UPGRADE_COMMANDS`
when the job lands, so the variable cannot be dropped silently.

## 51-03 items (TRAIN-04 supersede, chemspill ordering, sign guard)

Written by the 51-03 executor. The pure supersede logic, the SUPERSEDED render, the chemspill
ordering and the sign-guard fixtures are built and committed in `scripts/release-train.mjs`
(44f59803). The items below need the owner or a live collector that does not exist, and were not
done. Nothing was dispatched, cancelled, merged, pushed or applied.

## 7. Sign-publish stale-approval exit: keep fail-closed, or change to exit 0 with a note (owner)

**Blocked piece:** the plan's first step of `sign-publish` that exits 0 with a note when a newer
Release exists, with every later step gated on its output.

**Why not done:** `release.yml` already has two fail-closed stale-approval guards in `sign-publish`:
`newer_guard` ("Refuse a stale approval", before the MAR channel gate) and `newer_guard_final` (directly
before the bot token mint). Both call `scripts/release-key-newer.mjs`, the one comparator, and exit 1
when the key is not newer than the latest published Release. Nothing is signed or published. The
plan's premise "no newer-Release guard yet" was therefore false at execution. A new first step that
exits 0 would not end the job in GitHub Actions: the later steps run unless each carries an `if:` on
the new output, so an exit-0 step alone is a no-op. Changing the existing red outcome to a green note
is a policy choice (red pages a run, green hides a stale approval), so it goes to the owner.

**Options (owner picks one):**

- (a) Keep fail-closed (recommended, the status quo): the two existing guards stand. They alone close the
  stale-approval race: a stale approval, once spent, fails the run red before anything is signed. Supersede
  cancellation (item 8) would reject the pending approval earlier, but no executor runs it yet, so it is
  not part of this decision. Nothing is changed.
- (b) Exit 0 with a note: add a first step that writes `proceed=false` and the step summary (both tags
  named), and gate every later `sign-publish` step (21 steps in the job today, so 21 after the new first step) on `steps.<id>.outputs.proceed`,
  including the `if: always()` scratch-database step. `verify-release-asset-set` (`newer_guard_final`
  directly before the mint) and the `workflows` row must stay green under the new `if:` lines. Plan
  wording says "strictly greater"; the existing guards refuse equal keys too, which is the correct
  behaviour, so option (b) must keep the `>=` refusal.

## 8. Pending-release cancel on SUPERSEDED: executor unwired (owner, and the Phase 43 live collector)

**Blocked piece:** the executor of `cancel-pending-and-link` (`next(SUPERSEDED)`). `release-train.mjs` maps the
state to the action name and, for a train waiting on the `release` approval, names the target: `supersedeTarget(facts)`
returns the old train's `runId` (matched by display title to its merge SHA, never the newest run of another SHA) and the
pending `release` approval's `environmentId`. It returns null for every other train, a BUILDING one included (a run past
the approval may be mid-publish and a published Release is immutable, so it is never cancelled by run id; the two sign
guards fail a stale build); the action is then link-only. SUPERSEDED is reachable for BUILDING and AWAITING_APPROVAL
trains (review CR-02 fix; 51-02/03 review WR-03). No workflow step executes the action, because the release-stage states have no live
collector (`release-train.yml` header, "Not here yet"; Phase 43 BLOCKED item 3).

**Why not done:** a live cancel is a write to a `release` environment deployment, and the plan forbids
live cancels. The endpoint shape is not probed: the plan asks for read-only `gh api` GETs at execution time,
which need a real repository with a pending approval. Also unverified: GitHub's pending-deployments entry
carries the environment id (used above), not a deployment id, and rejecting uses `environment_ids`.

**Owner steps when the collector is approved:**

1. Probe the pending-deployment endpoints with read-only GETs against the real repository, then choose
   between rejecting the pending `release` approval (`environmentId`) and cancelling the run (`runId`). Act only
   on `supersedeTarget(facts)`, never on "the pending deployment" or "the newest run", and never on a
   `descriptor` deployment.
2. Gate the executor on the verified mark and the superseder facts (item 10), so a cancel is never decided from a transient or unattributed fact.
3. Confirm the token scopes. The plan says the existing dispatch-release and maintenance scopes suffice
   with no new token. Not verified against GitHub's current App permission map.
4. Wire the executor in `release-train.yml` behind the existing dry-run gates, then add its row to the
   `workflows` row check.

## 9. Fixture gaps inherited from 43's WR-07: duplicate issue and fork-head wake (no plant)

**Blocked pieces:** the plan's `supersede-duplicate-tracking-issue` and `supersede-fork-head-workflow-run`
fixtures, and the inherited TRAIN-09 plants for a draft Release and a fork-head `workflow_run`.

**Why not done:** `findExactlyOne` (duplicate tracking issue), `admitWakeRun` (fork-head wake) and
`classifyRelease` (draft Release) are each marked UNWIRED, with no live caller. The Phase 43 review fix
(WR-07) dropped their plants for that reason, and this plan follows it. The `workflow_run` trigger is held
out in `release-train.yml` (Phase 43 BLOCKED item 1), so there is no fork-head wake to test. The
fork-head guards in the YAML stay in place for when the owner re-adds the trigger.

**Owner step:** when the tracking-issue writer and the `workflow_run` trigger are decided (Phase 43 BLOCKED
items 1 and 3), wire these helpers and add their plants in the same change.

## 10. Supersede facts collector: not built

`derive()` reads these supersede facts. No collector in `release-train.yml` sets them, because the facts source is the
Phase 43 live collector (Phase 43 BLOCKED item 3). Until it exists, a live supersede cannot fire; the self-test covers the
logic over fixtures only. The collector must produce exactly this contract:

- `newerTag`: a newer tag on the same major, taken only from the detector's validated output (`detect-upstreams.mjs`), never
  from a raw tag listing. `newerKey` is the superseding train's release key (`v<esr>-<revision>`); `newerIssueUrl` is that
  train's tracking issue, restricted to the repository's own issue URLs.
- `chemspillOpen`: an open same-ESR revision train exists (a key with the same ESR groups and a higher revision).
- `supersederState`: `'open'` while the superseding train is open or unpublished, `'published'` once its Release is published,
  anything else (closed without publishing, withdrawn, gone) is null or any other string and expires the mark.
- The mark, in three facts: `ownerLogin`, `botLogin` (the bot App's login) and `markIssues`. `markIssues` is the list of issues
  for this key, open and closed (a closed one is how a done train stays done), each `{title, author: {login}, labels: [{name}],
  supersededLabelActor}`. The issue is found by title `release-train: <key>` and the `release-train` label, and only an issue
  authored by the owner or the bot counts (`selectTracked`, the same selection `selectPinned` uses). `supersededLabelActor` is the
  actor of the latest `labeled` event for `state/SUPERSEDED` on that issue (the issue events API; a label alone carries no
  authorship). The mark counts only if that actor is the owner or the bot, exactly one such issue exists, and `newerKey` is a valid
  newer key. Anyone else's label is ignored. The mark yields to BUMP_RED and CONFLICT, which still page.
- Clearing the mark: remove the `state/SUPERSEDED` label (owner), or the superseder closes unpublished (`supersederState` not
  `open`/`published`), or `newerKey` stops being a verified newer key. A published superseder renders the issue closed with a note.
- `releaseFactsFromLive` needs the live runs (`id`) and pending deployments (`environment.id`).

## 51-02 items (AUTO-03: Dependabot, alerts, CodeQL default setup)

Written by the 51-02 executor. The declarative half is built and committed: `.github/dependabot.yml`, the two
`.github/settings/` bodies, and the two CONTROLS entries with plants. Nothing was pushed, dispatched, enabled or applied.
Only read-only `gh api` GETs ran against the live repository.

## 11. Apply the two code-security bodies, and merge the first Dependabot PR (owner)

**Blocked piece:** the live state. At plan time Dependabot alerts were already on (the repository answered 204), and
CodeQL default setup was `not-configured`, so `repo-controls` reads one new red line: the CodeQL state.

**Why not done:** a live write is the owner's. `node scripts/apply-repo-controls.mjs --yes` also refuses while any
`BLOCKED:` line stands, and it does today (`release-tags`: the bot App is not installed on the org, 41-04), so the
two writes need the direct commands below until that is cleared.

**Owner steps:**

1. Dry-run: `node scripts/apply-repo-controls.mjs` (lines 19 and 20 are the two new writes).
2. Enable CodeQL default setup (the body is the tracked file):
   `gh api -X PATCH -H 'X-GitHub-Api-Version: 2022-11-28' repos/Deocracy/powerbrowser/code-scanning/default-setup --input .github/settings/code-scanning-default-setup.json`
   Dependabot alerts need no write (already on); if they are ever off:
   `gh api -X PUT -H 'X-GitHub-Api-Version: 2022-11-28' repos/Deocracy/powerbrowser/vulnerability-alerts`
3. Read back: `node scripts/verify-repo-controls.mjs`. **Check the CodeQL languages line first.** The comparator requires every
   declared language (`actions`, `javascript-typescript`) among the live ones. What GitHub lists once configured was not
   observable before the apply (it listed the repository's available languages, including legacy `javascript` and
   `typescript`, while not configured). If `javascript-typescript` is absent, the declared body is wrong and must follow the live shape.
4. Default setup is repository-wide per language and has no path filter. "Covers `theia/extensions` and `scripts/`" holds
   through `javascript-typescript`, not through a path list. The CodeQL 6-month auto-disable detector (last-push age) is
   TRAIN-11, not this plan.
5. First grouped PR (Monday 04:00 UTC after the file reaches `main`): `gh pr view <n>` then `gh pr merge --merge <n>`. Never automerge.

## 12. Dependabot security updates switch and the guard on dependabot.yml (owner decision)

npm "security-only" in `dependabot.yml` is `open-pull-requests-limit: 0` (version updates off; the schema describes the
key as the limit for version updates). Security updates still need the repository's Dependabot security updates switch,
which was `enabled` at plan time (`GET repos/Deocracy/powerbrowser/automated-security-fixes`: `{"enabled":true,"paused":false}`).
No CONTROLS entry reads that switch back, so turning it off would go unnoticed. The `dependabot.yml` half is now
guarded (51-02/03 review fix): the `workflows` row, rule `dependabot`, requires the npm `open-pull-requests-limit: 0`, a
cooldown, no auto-merge key, the exact ecosystem set, the `anthropics/claude-code-action` ignore and group update-types without
major, each with a plant, and the `zizmor` row audits the file. **Still open (owner decision):** an `automated-security-fixes`
control (same shape as `immutable-releases`: `{enabled}` JSON, PUT bodiless, read `repos/{owner}/{repo}/automated-security-fixes`)
needs a live read to prove its shape and is not added; until then the switch can be turned off unnoticed.

## 51-04 items (TRAIN-11 sweep rows, DIST-05 cadence, UPS-02 row)

## 13. Owner grant: the bot App reads for the sweep's security rows and for repo-controls (owner)

**Blocked piece 1, the `repo-controls` row (deferred, WR-04).** The row, its no-data branch and its red branch are built and
self-tested (`scripts/release-train.mjs`). The facts field `repoControls` is `null` on purpose, marked `deferred:
repo-controls-live-read` in the workflow, and `scripts/verify-sweep-reads.mjs` asserts the marker and the null together. The row
renders no-data every day with the deferral named in its evidence. Wiring it needs Administration read on `powerbrowser`
(BLOCKED.md item 2 records that the same grant was not requested for the runner count) and a follow-up plan that runs
`node scripts/verify-repo-controls.mjs` in the probe with that token and sets `repoControls` to `{ok, drift}` from its FAIL lines.
TRAIN-11 is therefore partly met: five of the seven rows read live data today; `repo-controls` is deferred here and `codeberg-mirror` waits on item 16.

**Blocked piece 2, the security reads' App grants.** The `security-reads` mint (this one repository, read only) requests exactly
three permissions, and the sweep needs the bot App to hold each. The workflows row (rule `app-token-inputs`) checks the input
names against the pinned action, so the names below are the real ones:

| Mint input | App settings label (Repository permissions) | Used by | Declared in `.github/settings/app-powerbrowser-bot.json` today |
| --- | --- | --- | --- |
| `permission-pull-requests: read` | Pull requests: Read-only | `dependabot-prs` | yes (`pull_requests: write` covers it) |
| `permission-vulnerability-alerts: read` | Dependabot alerts: Read-only | `dependabot-alerts` | yes (`vulnerability_alerts: read`) |
| `permission-security-events: read` | Code scanning alerts: Read-only | `codeql-alerts` | **no**: not declared, so granting it is a new owner grant and a change to that file |

`contents` is no longer requested (the default branch, the last push and the Codeberg comparison read through the job's
`github.token`). **Owner steps:** in the powerbrowser-bot App settings, add "Code scanning alerts: Read-only", accept the
permission change on the installation, and add `security_events: read` to `app-powerbrowser-bot.json` in the same change so the
repo-controls row keeps matching. Until then the `codeql-alerts` read answers 403, writes nothing, and the row renders no-data.

**What a failed read does (CR-01).** A read writes its fact only when `gh` exited 0 and the body is a well-formed array of pages;
an empty body, a 401/403/404, a 5xx and an API error object all write nothing, so the fact is `null` and the row renders
no-data: never 0 (green) and never a false red. `scripts/verify-sweep-reads.mjs` runs the shipped steps against a stub `gh` and
`curl` to prove it (the `sweep-reads` rows). A missing grant therefore shows as no-data rows, not as red alerts.

## 14. The first live sweep turns renewals-due red on the MAR certificate cell (owner decision)

**Superseded by the 51-04 review fix (WR-01):** the sweep now accepts a bare year and Month YYYY (dated at the start of the period), so
the 2046 cell no longer turns the row red. The text below is the original finding, kept for the record.

**Finding:** `docs/RENEWALS.md` line 31 (MAR signing certificate) has the Expiry cell `2046`, a bare year. The
renewals-due row reads strict `YYYY-MM-DD` only, and a second format is a red line, not a second parser. The row
therefore renders red on the first live tick: `docs/RENEWALS.md line 31: MAR signing certificate expiry "2046" is not
YYYY-MM-DD`. The plan's expectation that the seven new rows are green or no-data after the first tick does not hold for
this cell.

**Options (the executor did not change the file: the plan forbids hand-edited RENEWALS dates):**
(a) Recommended and in place: keep fail-closed. Confirm the MAR certificate expiry at the Phase B secondary-key ceremony
and enter the ISO date in the Expiry cell. The sweep then reads it and the row returns to green.
(b) Accept precision forms (bare year, Month YYYY) as deadlines evaluated at their last possible day. This is a second
parser and needs an owner ruling on the RENEWALS format.
The 2046 cell is the only non-ISO cell today. `unknown` and blank cells are treated as documented absences, not red.

## 15. docs/RELEASING.md ESR-calendar pointer: placed on a reachable location, owner to confirm (owner)

**Finding:** the DIST-05 sentence "The ESR calendar in External Gates is authoritative for dates." named a heading that exists
only in the workstream `REQUIREMENTS.md`, a planning file the operator manual cannot reach. The 51-04 review fix removed the
unreachable pointer. The Cadence section now ends its first two paragraphs with this text, which points at a file that ships in
`docs/` and that the sweep already checks:

> The dates are the ESR rows of `docs/RENEWALS.md`, each checked against the Mozilla ESR calendar before its train opens; the
> sweep's `renewals-due` row turns red 30 days before the nearest one.

**Owner step (only if wanted):** if the operator manual should carry a dated ESR calendar table of its own (rather than the
four ESR rows in `docs/RENEWALS.md`), place it in `docs/RELEASING.md` and change the sentence above to name that section. The
original plan text ("The ESR calendar in External Gates is authoritative for dates.") must not return unless an "External
Gates" section exists in `docs/`.

## 16. Codeberg mirror slug (Phase 53)

**Blocked piece:** the `codeberg-mirror` row reads `vars.CODEBERG_MIRROR` (the `owner/repo` slug on Codeberg). The
repository variable is unset, so the row renders no-data with the Phase 53 note. Set the variable when the Phase 53 mirror
exists; the compare is full 40-hex SHAs only, and a lagged pair goes red and comments once.

## 17. Owner rulings recorded by 51-04, not decided by it

- TRAIN-07 says the sweep comments on a red row. It does not assign. The sweep keeps the comment with the owner @-mention and
  adds no assignment, so the maintenance issue does not depend on the TRAIN-02 release-key assignment rule.
- Renewal and threshold numbers stay where the owner set them. The thresholds (5 PRs, 7 days, 0 alerts, 150 days) are read
  from `.github/sweep-thresholds.json`; `docs/RELEASING.md` quotes the file and the release-train self-test fails if the quotation
  and the file differ, so a documentation edit alone no longer changes the sweep (changing a number means editing both).
- A bare year or Month YYYY in `docs/RENEWALS.md` is accepted by the register check and dated by the sweep at the start of the
  year or month (the earlier, fail-safe reading). Item 14's first live-tick red no longer occurs; entering the real MAR date at
  the Phase B ceremony is still the owner's step.
- `dependabot-alerts` at a limit of 0 can stay red on alerts with no available patch (review IN-04); the number is the owner's, and
  the steady state is not yet known. Revisit the limit after the first live tick.
