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
