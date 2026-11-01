# Phase 43: Release train skeleton and upstream bump automation (A) - Research

**Researched:** 2026-10-22
**Domain:** GitHub Actions orchestration (idempotent reconciler), upstream-release detection (ESR tags, Node dist), bot-PR automation, Cloudflare Worker clock
**Confidence:** HIGH for in-tree mechanics (every load-bearing claim was read this session or verified by a spawned researcher against the tree); MEDIUM for platform mechanics (GitHub/Cloudflare official-docs facts via prior research, re-checked); LOW for the one open measurement (Worker JWT CPU).

## Summary

Everything this phase wires together already exists in the tree in a nearby form. Phase 40 landed the pin (`FIREFOX_153_5_1esr_RELEASE`), the callable `rebase-upstream.yml` with no `tag` default, `scripts/regenerate-patches.sh`, and `releaseIdentity()`. Phase 41 built the `workflows` trust-boundary row (14 rules), the `repo-controls` table (five environments, both Apps declared), and the `zizmor` row. Phase 43 adds the reconciler on top: a detector, a state table, five workflow jobs, and a clock. It adds no new framework and no package.

Six facts change the plan's shape:

1. **The rebase workflow is callable but has no `outputs:`.** `rebase-upstream.yml:22-34` declares `workflow_dispatch` + `workflow_call` `tag` inputs with no default (AUTO-08, asserted by `verify-upstream-pins.mjs`). It has no `outputs:` block, but the train's BUMPING/CONFLICT/BUMP_RED derivation needs the bump conclusion plus its uploaded `stage` artifact (ARCHITECTURE.md §4.2). Phase 43 adds `outputs.stage` — the only edit to that workflow, and it carries no tag.
2. **The `workflows` row has no dry-run rule.** TRAIN-08 requires every train stage to take a `dry-run` input that validates and renders but commits, opens, comments and dispatches nothing. The 14 rules in `scripts/verify-workflows.mjs:96` cover triggers, runners, permissions, guards and event text, but nothing asserts that every write step is gated by `inputs.dry-run`. Phase 43 adds that rule with plants, following the `workflow-run-guard`/`event-text` assertion pattern.
3. **The bump must never touch workflow files.** An App without the Workflows permission cannot push a commit whose target adds or modifies a file under `.github/workflows/` relative to the default branch (Phase 41 RESEARCH Pitfall 2, verified). The bump edits `configuration.toml` + `patches/` only. `rebase-upstream.yml` carries no tag by design so a bump never edits a workflow file — this is why AUTO-08 deleted the default.
4. **Only App-token PRs skip the approval click.** PRs created with `GITHUB_TOKEN` now create runs that need approval; App-created PRs trigger `verify.yml` directly (SUMMARY correction 9). The `bump-pr` job (env `bot`) must mint the bot-App token and open `chore/esr-<tag>` with it, or every bump waits on a click and the exit test fails.
5. **Detection is tag-first, product-details never decides.** On 2027-06-29 `FIREFOX_ESR` flips to `175.0esr` while 153.x continues to 153.27 (2027-09-07). A detector driven by product-details goes blind in exactly the window this tree stays on 153. The detector lists `FIREFOX_<pinned-major>_*esr_RELEASE` tags, applies the pinned-major guard, and reads `FIREFOX_ESR` as an advisory cross-check only. The required fixture (`FIREFOX_ESR=175.0esr` + `FIREFOX_153_23_0esr_RELEASE` present) must yield a 153.23 detection.
6. **The Worker lives in its own repo, so this tree cannot deliver it.** INF-03's `powerbrowser-scheduler` is a separate repo on workers.dev first. This tree produces the dispatch contract in `release-train.yml`, the detector + train scripts with self-tests, the bump-PR pipeline, the dry-run gating, the docs records, and a Worker source scaffold. The Cloudflare account, the scheduler repo, the clock App and its key secret, and the calendar exit test are owner actions behind one checkpoint.

**Primary recommendation:** Run in order:
1. Tracer: `scripts/detect-upstreams.mjs` ESR pure functions + `scripts/release-train.mjs` STATES skeleton + both self-test rows green.
2. `release-train.yml` skeleton (triggers, concurrency, five jobs, guards, input validation, dry-run) + `outputs.stage` on the rebase workflow + the workflows dry-run rule.
3. Full `derive`/`next`/`render` + tracking-issue protocol + conflict-issue path + the five TRAIN-09 plants.
4. Bump wiring (AUTO-06) + Node detector (AUTO-04) + the BUILD.md manual-step removal.
5. Worker scaffold + `docs/RELEASING.md` records (JWT CPU, clock, Node, train, dry-run) + the owner checkpoint.

Every new check is one registry row plus its `-self-test` sibling in the `--quick` array of `scripts/verify-platform.sh`. Live detection runs in the train's `detect` job on `ubuntu-latest`, never in `--quick` (no network in quick).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Release key derivation | `releaseIdentity()` in `scripts/generate.mjs` | `scripts/verify-release-identity.mjs` (tuple compare pattern) | REL-01 landed; the train reuses it, never a literal |
| ESR/Node detection (pure) | `scripts/detect-upstreams.mjs` (no fs, no network in checks) | `--self-test` fixtures incl. the 175-vs-153.23 case | Quick rows must not use network; parsing half is unit-testable |
| Train states | `scripts/release-train.mjs` (`STATES` frozen table + `derive`/`next`/`render`) | `release-train-logic-self-test` row (set-equality + 5 plants) | Derive-and-compare; a state without a fixture (or reverse) goes red |
| Replay (one definition) | `.github/workflows/rebase-upstream.yml` via `workflow_call` | `scripts/rebase-upstream.sh` + `regenerate-patches.sh --check` (unchanged) | AUTO-06 calls it; Phase 43 adds only `outputs.stage` |
| Bot PRs | `bump-pr` job, env `bot`, App token minted there only | `verify.yml` runs on the App-token branch without a click | GITHUB_TOKEN PRs need approval; App PRs do not |
| Issue protocol | `report` job, `GITHUB_TOKEN` `issues:write`, sole writer | Tracking issue (view) + conflict issue (exactly-one) | GH-12 `issues-write` rule admits only this job |
| Clock | `powerbrowser-scheduler` Worker (own repo) | `release-train.yml` dispatch contract (`reason=tick`) | Decision 15: Worker is a clock only; all logic in Actions |
| Trust boundary | `scripts/verify-workflows.mjs` (+ new dry-run rule) | `zizmor --offline` row (unchanged) | Every new workflow must satisfy all 14+1 rules |

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
#### Already decided (owner, 2026-10-20)
- All owner decisions in REQUIREMENTS.md "Owner Decisions" are binding (SEED-002 §12 recommended defaults plus the research additions): Apps only, no PATs; bot App without the Workflows permission; the Worker is a clock only (decision 15); self-hosted Renovate dispatched by the train (decision 16); fixer opens PRs only, never merges/approves/touches signing keys, spend-limited, patches only through `regenerate-patches.sh` (decisions 20–21).
- No `schedule:` key in the product repo (D-77). No App holds the Workflows permission.
- The kit plan gate runs as `python3 scripts/plan-gate.py --root . --phase N --plans <dir> --stream deploy`; main's ledger rows use main's phase numbers and are not due against phases 40+.

#### Owner gates in this phase (stop points for autonomous execution)
- Cloudflare account with 2FA (now, no cost), scheduler repo creation, clock-App creation/installation with its PKCS#8 key as a Worker secret, both Apps' installation, and the calendar exit test (153.7 on 2026-11-10, else 153.8 on 2026-11-24) are owner actions. Plans build locally and end with one `checkpoint:human-action`; they do not create repos, Apps, secrets, or dispatches.
- Read-only `gh api` GETs are allowed. Any write to GitHub (dispatch, PR, issue, comment, lock) is forbidden except through `dry-run`-proven paths at the checkpoint.
- Every train stage takes a `dry-run` input (TRAIN-08); the `workflows` row asserts every write step is gated by it.

### Claude's Discretion
All other implementation choices are at Claude's discretion — discuss phase was skipped per user setting. Use ROADMAP phase goal, success criteria, and codebase conventions to guide decisions.

### Specific Ideas (from CONTEXT.md)
- `detect-upstreams-self-test` includes the `175.0esr` fixture that must yield a 153.23 detection (AUTO-01).
- `release-train-logic-self-test` compares the state list derived from the state table as set equality, plus five fault plants (merged PR with unchanged pin, draft Release, fork-head `workflow_run`, duplicate tracking issue, 175.x ESR under the 153 guard) (TRAIN-09). Release-stage fixtures land with Phase 50 and supersede with Phase 52.
- The bump job calls `rebase-upstream.yml` through `workflow_call` with `contents: read` + `persist-credentials: false`; `bump-pr` (env `bot`) opens `chore/esr-<tag>` with the App token (AUTO-06). The bump edits `configuration.toml` + patches only, never workflow files (Phase 41 Pitfall 2).
- A replay failure opens/updates exactly one `ESR <tag>: patch <NNN> did not apply` issue with the apply log and diff, assigned to the owner; the automation never hand-edits a patch (AUTO-07).
- The scheduler Worker lives in its OWN repo; this tree produces the dispatch contract, a scaffold, and the docs records — not the deployed Worker.

### Deferred Ideas (OUT OF SCOPE)
None — discuss phase skipped.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description (abridged from REQUIREMENTS.md) | Research Support |
|----|-------------|------------------|
| INF-03 | `powerbrowser-scheduler` Worker (own repo, workers.dev first) is a clock only: hourly JWT → installation token → one `workflow_dispatch` (`reason=tick`, `return_run_details: true`) + `User-Agent`; Email Routing on dispatch failure; no detection/liveness/descriptor logic; JWT-mint CPU measured vs 10 ms Free limit, recorded in `docs/RELEASING.md` | Clock-only decision 15; cron `17 * * * *` UTC; 3 subrequests/tick; PKCS#8 secret; Worker scaffold in plan 43-05 |
| TRAIN-01 | `release-train.yml` starts only from `workflow_dispatch` (tick/owner/self) + single-level `workflow_run` on `verify.yml`/`release.yml`; one `release-train` concurrency group, no `cancel-in-progress`, no `queue: max`; validates every dispatched input (tag regex, release key > latest Release tag) | Trigger block, guard string, tuple-compare pattern, plan 43-02 |
| TRAIN-02 | Exactly one tracking issue per release key, found by label+title every run, rendered from facts by `report`; PATCHed only when bytes differ, never read as state; locked, closed on DONE, reopened on withdraw; owner mention+assign only on gate entry | Issue protocol §4.3; labels assumed from Phase 42; plan 43-03 |
| TRAIN-03 | States from GitHub facts, no stored state, one table in `scripts/release-train.mjs`; Phase A: DETECTED, BUMPING, CONFLICT, BUMP_RED, BUMP_PR_GREEN; ≤1 transition/release/run; ends at merge gate; calendar exit test | Pure trio + frozen STATES; plans 43-01 (skeleton) and 43-03 (full) |
| TRAIN-08 | Every stage takes `dry-run` (validate+render, commit/open/comment/dispatch nothing); `workflows` row asserts every write step is gated by it | New workflows rule + plants; plan 43-02 |
| TRAIN-09 | Quick row `release-train-logic-self-test`: `derive`/`next`/`render` over fixtures, one fixture per state with set-equality, plus five plants (unchanged-pin merge, draft Release, fork-head run, duplicate issue, 175.x under 153 guard), each red naming the drift | In-memory plant matrix; plans 43-01 (harness) and 43-03 (full) |
| AUTO-01 | `scripts/detect-upstreams.mjs`: list `FIREFOX_<pinned-major>_*esr_RELEASE` (never `_BUILDn`), product-details `FIREFOX_ESR` as cross-check only; `detect-upstreams-self-test` covers tag mapping + major guard incl. the 175.0esr→153.23 fixture | Pure parsers reusing `generate.mjs:2795`; plan 43-01 |
| AUTO-06 | On detection: `bump` (rebase-upstream.yml via `workflow_call`, `contents: read`, `persist-credentials: false`) moves pin, regenerates, replays, runs surface/scan/identity/`--quick`; `bump-pr` (env `bot`) opens/updates `chore/esr-<tag>` with the App token so `verify.yml` runs without a click | One-definition replay; plan 43-04 |
| AUTO-07 | Replay failure → `report` opens/updates exactly one `ESR <tag>: patch <NNN> did not apply` issue with apply log + `git -C upstream diff`, assigned to owner; never hand-edits a patch | FAIL-line taxonomy; plan 43-03 |
| AUTO-04 | Node detector reads nodejs.org `index.json` for the Node 24 line, verifies `SHASUMS256.txt` + signature in the job, opens `chore/node-v24.x` bumping `node-runtime.json`; `docs/BUILD.md:1041-1049` manual gpg step removed | `gpgv` + release-keys keyring; plan 43-04 |

</phase_requirements>

## Project Constraints (from CLAUDE.md)

- Never fork or patch Theia core. Never modify Gecko outside `patches/`; `git -C upstream diff` against the applied stack is the invariant. This phase touches no Gecko code and no Theia code — only `scripts/`, `.github/workflows/`, `docs/`, and planning files.
- Patches are regenerated, never text-edited. AUTO-07's conflict path opens an issue; it never edits a patch. The fixer (Phase 52) may only change patches through `regenerate-patches.sh`.
- The residual-brand scan is a permanent gate over `git ls-files`: **stage new files before trusting a green scan**. Only `inventory/brand-tokens.json` may name the originating product. New planning prose must not spell brand tokens; code identifiers stay `powerbrowser`-shaped.
- One driver, one registry: `scripts/verify-platform.sh`. Each new check is one row plus its `-self-test` sibling. No sibling driver.
- Derive and compare; do not hand-keep an expectation list. The STATES export is compared as set equality; the admission set equals the used set; the tag candidate derives from listing, never a literal.
- Every new check gets a `--self-test` that plants faults and requires each to go red naming the drift. Never assert on the absence of a log line the check's own instrumentation emits.
- No internal identifier in user-facing copy. Tracking-issue bodies name states and evidence links; owner mentions happen only on gate entry. Docs prose names "PowerBrowser".
- Builds run in `nix develop .#firefox` / `.#theia`; `yarn` only inside the theia shell. **A `--quick` row must not call `yarn`, must not use network, must not build, browse, or display.** Both new rows are fixture-only.
- Commit with explicit paths, because concurrent sessions may commit on this branch. Never `-a`, `--amend`, `stash`.
- Never touch `ledger/` or any `scripts/verify-ng-NNN-*.mjs`; never put the word "ledger" in a commit message. Read hash-locked scripts as analogs only.

## Live baseline (read-only, 2026-10-22)

- Pin: `configuration.toml:125` `firefox_esr_tag = "FIREFOX_153_5_1esr_RELEASE"` under `[upstreams]` (`:124-126`); `[product] revision = 1` at `:38` (reset-to-1-on-ESR-move comment `:36-38`). `releaseIdentity()` at `scripts/generate.mjs:2796-2807`; `ESR_RELEASE_TAG` at `:2795`.
- Rebase workflow: `rebase-upstream.yml:22-34` both triggers with `tag`, no default; `permissions: contents: read` + `persist-credentials: false` (`:48-54`); no `outputs:` block (gap this phase fills).
- Workflows row: `scripts/verify-workflows.mjs` with 14 rules (`:96`); guard constant `:99`; `issues-write` admits only `release-train.yml` job `report` (`:300-302`); zero dry-run rules (gap this phase fills).
- Node pin: `powerbrowser/packaging/node-runtime.json:2-6` `linux-x64` `v24.19.0` + sha `14b342e7…`; enforced by `package-linux.sh:27-38` (`sha256sum -c`, delete+fail) and staged `:61-62`; manual provenance paragraph at `docs/BUILD.md:1041-1049` (removed by AUTO-04 once the job owns it).
- Registry: quick array closes after `zizmor-self-test`; full block holds `repo-controls`. New quick rows append after `zizmor-self-test`; no full-tier rows for this phase (live detection runs in Actions, not in the registry).
- Absent (greenfield): `scripts/detect-upstreams.mjs`, `scripts/release-train.mjs`, `.github/workflows/release-train.yml` — none exist; every plan creates its share.
- Apps: `powerbrowser-bot` (no Workflows) and `powerbrowser-clock` (Actions write, on `powerbrowser` only) are declared (RELEASING.md) but pending the Phase 41 owner checkpoint — assumed, never asserted, by Phase 43 plans.

## Standard Stack

No new packages. Everything uses what is already in the tree or the dev shell.

| Tool | Version (verified) | Purpose | Note |
|------|--------------------|---------|------|
| node | v24.21.0 (host) | Both new scripts, both rows | Same as existing rows; scripts import nothing from `theia/node_modules` (textual YAML asserts stay in the workflows row) |
| git | 2.54.0 | `git ls-remote --tags` listing in the `detect` job | Quote the `*esr_RELEASE` pattern so the shell never expands it; capture-first, `-F` literal match (WR-06/WR-07 precedent) |
| js-yaml | 4.3.2 (theia/node_modules) | `verify-workflows.mjs` parsing of the new workflow | `createRequire` load; duplicate `on:` throws (a second trigger cannot hide a schedule) |
| zizmor | 1.29.0 (theia shell) | Offline audit of `release-train.yml` | Unchanged row; the new workflow must be green under it |
| `actions/create-github-app-token` | github-owned (admitted) | Minting bot/clock tokens in `bump-pr` | Token revoked in the action post-step; never crosses jobs |
| `nodejs/release-keys` | out-of-band verified | `gpgv` keyring for SHASUMS in the Node job | Replaces the BUILD.md manual step; `sha256sum -c` stays as second layer |
| `universal-github-app-jwt` 2.2.2 | Worker dep (own repo) | RS256 JWT mint in the scheduler | CPU fit unmeasured — INF-03 measures it |

**Installation:** none in this tree (`pkgs.zizmor` already in the theia shell; no flake change).

## Package Legitimacy Audit

No external packages are installed by this phase. Both new scripts are dependency-free Node (node built-ins only), following `verify-release-identity.mjs` / `verify-upstream-pins.mjs`. The Worker scaffold (own repo, plan 43-05) names `universal-github-app-jwt` 2.2.2 pinned by version; it is not installed here and no lockfile in this tree changes.

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
product-details FIREFOX_ESR ──advisory only──┐
mozilla-firefox refs/tags ──git ls-remote──>│ detect job (ubuntu-latest, contents:read)
nodejs.org index.json/SHASUMS ──gpgv────────┘   │  scripts/detect-upstreams.mjs (pure parsers)
                                                │  candidate > pin? (pinned-major guard)
configuration.toml [upstreams]/[product] ───────┤  releaseIdentity() → release key v<ESR>-<revision>
                                                ▼
                        release-train.yml (concurrency: release-train)
                          derive (read-only synthesis, no env)
                          detect (network lives here only)
                          bump ──workflow_call──> rebase-upstream.yml (+outputs.stage NEW)
                            │  pin move + regenerate + replay + surface/scan/identity/--quick
                            ▼
                          bump-pr (env bot, App token minted HERE only)
                            │  branch chore/esr-<tag> + PR → verify.yml runs, no click
                            ▼
                          report (issues:write, SOLE writer)
                            ├── tracking issue: release-train: v<ESR>-<rev> (render from facts,
                            │   PATCH iff bytes differ, lock/close/reopen, mention+assign on gate)
                            └── conflict issue: ESR <tag>: patch <NNN> did not apply (exactly-one,
                                apply log + git -C upstream diff, assigned owner, never edits patch)

powerbrowser-scheduler (OWN repo, workers.dev first)
  cron 17 * * * * → RS256 JWT (WebCrypto) → clock-App installation token
  → POST workflow_dispatch {reason: tick} (+ return_run_details) → Email Routing on failure
  (no detection, liveness, pin-age, or descriptor logic — all in Actions)
```

### Recommended file layout (new or changed)

```
scripts/detect-upstreams.mjs        # NEW: pinnedMajor/tagToVersion/pickLatest/crossCheckEsr/
                                    #   selectNode24/shasumsEntry/decide + --self-test (plan 43-01, 43-04)
scripts/release-train.mjs           # NEW: STATES + derive/next/render + --self-test (plan 43-01, 43-03)
.github/workflows/release-train.yml # NEW: dispatch enum + 2 workflow_runs, concurrency group,
                                    #   derive/detect/bump/bump-pr/report (plan 43-02)
.github/workflows/rebase-upstream.yml  # outputs.stage ADDED ONLY (plan 43-02)
scripts/verify-workflows.mjs        # dry-run-gate rule + plants ADDED (plan 43-02)
scripts/verify-platform.sh          # detect-upstreams-self-test + release-train-logic-self-test
                                    #   rows ADDED after zizmor-self-test (plan 43-01)
powerbrowser/packaging/node-runtime.json  # bumped by the Node job path (plan 43-04 proves the shape)
docs/BUILD.md                       # manual gpg 1041-1049 REMOVED (plan 43-04)
docs/RELEASING.md                   # JWT CPU + clock + Node + train + dry-run records (plan 43-05)
scheduler scaffold (own repo)       # Worker source scaffold, NOT deployed here (plan 43-05)
```

### Pattern 1: Pure parsers behind injectable overrides

`runChecks(root, overrides = {})` with `read`/`listTags`/`getProductDetails`/`getNodeIndex`/`getShasums` injectables, mirroring `verify-release-identity.mjs:83-92` (`{git,read,files}`) and `verify-upstream-pins.mjs:366-373` (`{read,files}`). `--self-test` feeds fixtures only: tag list incl. the 175-vs-153.23 case, product-details JSON, index.json slice, SHASUMS snippet. No network, no writes, no `REPO_ROOT` leak in output (pattern `verify-release-identity.mjs:309-315`).

### Pattern 2: State list derived from the module, compared as set equality

`export const STATES = Object.freeze({...})`; the self-test imports its keys and compares as a SET against the fixture file list — a state without a fixture, or a fixture without a state, goes red. Precedent: EXPECTED-vs-derived in `verify-registry-shape.mjs` and TARGETS-vs-EXPECTED in `verify-generated-identity.mjs`. Release-stage fixtures land with Phase 50 and supersede with Phase 52 as those states are added (TRAIN-09 text).

### Pattern 3: Exactly-one issue via find-by-title, byte-compare PATCH

Tracking issue and conflict issue share the shape: find by label+title (or title) every run, number never stored; PATCH the body only when rendered bytes differ; the debug JSON comment block is never read as input. Duplicate find results are a FAIL naming both numbers — no PATCH. Precedent: the `issues-write` single-writer rule and the report-job ownership.

### Pattern 4: Per-job least privilege with the token minted at use

`derive`/`detect` read-only `GITHUB_TOKEN`; `bump` read-only + no persisted credential; `bump-pr` empty `GITHUB_TOKEN` + App token minted in that job only; `report` `issues:write` only. App tokens expire after 1 hour — mint just before use. Precedent: the fixer three-job split (Phase 52) and the WR-09 posture comments.

### Anti-Patterns to Avoid

- **Driving detection from `FIREFOX_ESR`.** It flips to 175 while this tree stays on 153. Advisory only; the five-plant self-test proves it.
- **A second `push` trigger on the train.** Merge pushes already wake the train through `verify.yml` completion. A second route double-transitions.
- **`queue: max` or `cancel-in-progress` on the reconciler.** Kills mid-flight transitions or replays stale wake-ups. One group, defaults.
- **Bump editing `.github/workflows/`.** The bot App cannot push it (Pitfall 2). Pin + patches only.
- **Storing state in the issue body.** Facts re-derive every run; the body is a view. Attempt counts (later phases) come from counting labelled PRs.
- **Hand-editing a patch on conflict.** The conflict path opens an issue with log + diff. Regeneration is the only writer.

## Don't Hand-Roll

- Do not re-implement ESR tag parsing: reuse `ESR_RELEASE_TAG` (`scripts/generate.mjs:2795`) and the `slice(1).join('.')` mapping (`:2805`). `_BUILDn` refusal comes free.
- Do not re-implement release-key comparison: reuse the `tupleOf`/`lower` shape (`scripts/verify-release-identity.mjs:72-81`) in the dispatch validation.
- Do not re-implement YAML trigger asserts: extend `verify-workflows.mjs` (indentation-aware scans + js-yaml) rather than a new parser.
- Do not invent a second concurrency primitive: one `group: release-train` with defaults is the reconciler contract.
- Do not fetch upstream tags with `describe`: compare tag names/versions, and resolve `refs/tags/$TAG^{commit}` vs `HEAD` where a commit is needed (153.4 re-point precedent).

## Common Pitfalls

### Pitfall 1: `--tag '*'` lists everything, then `rm -rf upstream/`
`rebase-upstream.sh:60-65` guards `^[A-Za-z0-9._-]+$` before any destructive step. The detector's listing interpolates the pinned major only, and every dispatched tag re-validates through the same shape plus `ESR_RELEASE_TAG` (ESR) or `RELEASE_TAG` (release key) before acting.

### Pitfall 2: The bot App cannot push workflow files
Git push, contents API, and Release/ref creation 404/403 when the target diverges in `.github/workflows/` vs default (Phase 41 Pitfall 2). Bump commits carry `configuration.toml`, `generated/*`, version files, and `patches/` — never workflow files. The `verify-upstream-pins` sweep (which covers `.github/`) stays green on bump commits.

### Pitfall 3: `GITHUB_TOKEN` PRs stall on approval
App-token branches run `verify.yml` immediately; `GITHUB_TOKEN` branches wait for a click. `bump-pr` mints the App token in env `bot`. If the exit test shows a bump PR stuck on approval, the token path regressed — the self-test cannot catch this; the calendar run proves it.

### Pitfall 4: Tag re-pointing (153.4 precedent)
`RELEASE` once sat on `BUILD3`'s commit, not `BUILD1`'s; `git describe` ties non-deterministically (`fetch-upstream.sh:275-283`). The detector compares parsed versions, never commit equality, to pick latest.

### Pitfall 5: Network inside `--quick`
`--quick` means no build, no browser, no display, no network. Only the fixture self-tests are quick rows. The live `detect` half runs in the train's `detect` job. A quick row that fetches is red by construction review, not by test.

### Pitfall 6: Unstaged files are invisible to the brand scan
The scan reads `git ls-files`. Stage `detect-upstreams.mjs`, `release-train.mjs`, and `release-train.yml` before trusting a green scan — and keep originating-product tokens out of all three (inventory file is the only carrier).

### Pitfall 7: App-token 1-hour expiry
Mint each token just before its use (`bump-pr` mints, opens/updates the PR, stops). Never pass a token between jobs.

### Pitfall 8: Dispatch without `User-Agent` 403s; PKCS#1 key rejected
The Worker sends a `User-Agent` (`powerbrowser-scheduler`) and converts the clock-App key to PKCS#8 (`openssl pkcs8 -topk8 -nocrypt`). Both are in the scaffold with comments, proven at the owner checkpoint, not in this tree.

### Pitfall 9: Labels assumed from Phase 42
`release-train`, `state/*`, and `train:blocked` are declared by Phase 42 (GH-13, unplanned). Phase 43 uses them verbatim and records the dependency; it creates no second label source. If Phase 42 renames one, the train's render changes with it.

### Pitfall 10: Node major drift
Bumping `node-runtime.json` across majors without `flake.nix:21` (`nodejs_24`) + `theia/package.json` engines trips `verify-node-major-agreement.mjs`. AUTO-04 stays on the Node 24 line; a major move is a separate decision with its own agreement update.

## Code Examples

### Tag listing (detect job; pattern quoted, major from manifest only)

```sh
MAJOR="$(node -e '...pinnedMajor from configuration.toml...')"
TAGS="$(git ls-remote --tags "$REMOTE" "refs/tags/FIREFOX_${MAJOR}_*esr_RELEASE" || true)"
# client-side: keep /esr_RELEASE$/, drop /_BUILD[0-9]*$/, drop peeled ^{} lines
```

### Concurrency + triggers (release-train.yml skeleton)

```yaml
concurrency:
  group: release-train
on:
  workflow_dispatch:
    inputs:
      reason: { required: true, type: string }   # tick | owner | self
      dry-run: { required: false, type: boolean, default: false }
      release: { required: false, type: string }
      tag: { required: false, type: string }
  workflow_run:
    workflows: ['Verify static layers']
    types: [completed]
```

Every `workflow_run` job carries `if: github.event.workflow_run.head_repository.full_name == github.repository`. No `push`, no `pull_request`, no `schedule`. `release.yml` joins the `workflows:` list in Phase 50; the train never appears as a source.

### Dispatch validation (before acting)

- `reason` in `{tick, owner, self}`; `tag` matches `ESR_RELEASE_TAG`, never `_BUILDn`; `release` matches `RELEASE_TAG` and its tuple is strictly greater than the latest Release tag (tuple-compare shape from `verify-release-identity.mjs:72-81`).
- `dry-run: true` validates and renders but commits, opens, comments and dispatches nothing; the workflows dry-run rule asserts every write step checks it.

### Worker scaffold (own repo; contract, not deployment)

cron `17 * * * *` → `scheduled()` → RS256 JWT (WebCrypto, PKCS#8 secret) → clock-App installation token (Actions:write, repo `powerbrowser`) → `POST .../release-train.yml/dispatches` `{ref: main, inputs: {reason: tick}}` with `return_run_details: true` + `User-Agent: powerbrowser-scheduler` → Email Routing to the owner on non-2xx. ~40 lines, 3 subrequests/tick, zero detection logic.

## Doc edits this phase owns (docs/RELEASING.md, docs/BUILD.md)

- **RELEASING.md — clock + JWT record (INF-03):** Worker cron, token chain, `User-Agent`, Email Routing on failure, clock-only scope, and the measured JWT-mint CPU vs the 10 ms Free limit (with fallback: Paid or watchdog dispatch).
- **RELEASING.md — train skeleton record:** dispatch contract (tick/owner/self), concurrency group, five jobs with per-job permissions, `workflow_run` guard + chain ban, input validation, dry-run semantics, tracking-issue + conflict-issue protocol.
- **RELEASING.md — Node detector record (AUTO-04):** `index.json` 24-line selection, in-job `SHASUMS256.txt` + signature verification via `nodejs/release-keys`, `chore/node-v24.x` PR shape, and the pointer replacing the BUILD.md manual step.
- **BUILD.md — remove the manual gpg step (`:1041-1049`):** once the job owns keyring + `gpgv` + SHASUMS→pin chain. `package-linux.sh`'s `sha256sum -c` stays as the second layer (enforcement, not provenance).
- **RELEASING.md — exit-test record:** calendar (153.7 on 2026-11-10, else 153.8 on 2026-11-24), what "arrives as a bot PR with one tracking issue and no owner dispatch" observes, and the proof (reason inputs, `return_run_details` linkage, rendered issue).

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `FIREFOX_ESR`-mapped tag guess | Tag listing with pinned-major guard, product-details advisory | This phase (PITFALLS prescription) | Survives the 175 flip while on 153 |
| Manual Node provenance (owner gpg) | In-job `gpgv` + SHASUMS→pin assert, bot PR | This phase (AUTO-04) | Provenance on every bump, not per-owner-run |
| `tag` default on the rebase workflow | Caller passes tag; no default (AUTO-08) | Phase 40 | Bumps edit the manifest only |
| `GITHUB_TOKEN` bot pushes | App-token `bump-pr` in env `bot` | This phase (AUTO-06) | No approval click; exit test passes |
| Worker-as-detector (SEED-002 §4) | Worker clock-only; logic in Actions (decision 15) | Owner 2026-10-20 | Testable, self-tested, 10 ms-safe |
| Stored train state | Facts re-derived every run; issue is a view | This phase (TRAIN-03) | Idempotent reconciler; coalesced ticks lose nothing |

**Deprecated/outdated in the tree:** nothing this phase deprecates. `docs/RELEASING.md` Schedule posture (D-77 daily-liveness note) stays; the maintenance sweep + watchdog are Phase 48.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Phase 41 owner checkpoint lands: `bot` env, clock-App installation, live-green `repo-controls` | CONTEXT deps | Train plans assume them; if absent, `bump-pr`/`report` go red at the assumption citation, never silently green |
| A2 | Phase 42 declares `release-train`, `state/*`, `train:blocked` labels verbatim | Pitfall 9 | Render uses them; a rename moves with Phase 42 |
| A3 | ESR calendar: 153.7 on 2026-11-10, else 153.8 on 2026-11-24; 153.6 (2026-10-27) out of reach | ROADMAP/REQUIREMENTS | Exit test runs on the first post-landing point release, whichever it is |
| A4 | Workers Free caps (10 ms CPU, 50 subrequests, 5 crons) per official docs | SUMMARY/STACK | If lower, the JWT measurement forces the Paid/watchdog fallback sooner |
| A5 | `nodejs/release-keys` fetchable in the job; `gpgv` available on `ubuntu-latest` | AUTO-04 | Fallback: vendor the keyring fingerprint set in-repo (recorded, never a key literal) |
| A6 | No `FIREFOX_ESR153` product-details key appears (undocumented) | Cross-check | Detector does not need it; if it appears, a later phase may adopt it as a second advisory |
| A7 | `workflow_dispatch` response carries run linkage (`return_run_details`) for issue links | Report | Fallback: link the workflow run list filtered by the dispatch time |

## Open Questions (RESOLVED except one)

1. **Does the RS256 JWT mint fit the 10 ms Workers Free CPU limit?** — OPEN. INF-03 measures it and records the number in `docs/RELEASING.md` (plan 43-05). Fallback, in order: Workers Paid, or dispatch from the external watchdog (Phase 48). This is the phase's only research-flag item.
2. **Tag-listing pattern shape?** — RESOLVED: `refs/tags/FIREFOX_<major>_*esr_RELEASE`, client filters for `esr_RELEASE$`, drop `_BUILD`, drop `^{}`.
3. **Third fixer attempt vs duplicate tracking issue as plant 5?** — RESOLVED: REQUIREMENTS.md (authoritative, newer) lists the duplicate tracking issue; attempt-counting is Phase 52 (FIX-05).
4. **Release-stage fixtures now?** — RESOLVED: no. Phase-A fixtures cover the 5 Phase-A states; E and fixer states land with Phase 50 and supersede with Phase 52 (TRAIN-09 text).
5. **`release.yml` in `workflow_run.workflows` now?** — RESOLVED: no. `release.yml` does not exist until Phase 49; Phase 50 adds it to the list. Listing it now would fail the chain/trigger rules against a missing workflow.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| node | both scripts + rows | ✓ | v24.21.0 | — |
| git | tag listing (job) | ✓ | 2.54.0 | matching-refs API in the job |
| gh CLI | read-only research | ✓ | 2.102.0 | — |
| js-yaml | workflows row | ✓ (theia/node_modules) | 4.3.2 | Vendor into scripts/lib |
| zizmor | new workflow audit | ✓ via theia shell | 1.29.0 | `nix develop .#theia --command zizmor` |
| nix | zizmor provisioning | ✓ | — | — |
| Cloudflare account + 2FA | INF-03 checkpoint | ✗ | — | Owner creates now (no cost); Worker runs on workers.dev before any DNS move |
| scheduler repo, clock App + key | INF-03 checkpoint | ✗ | — | Owner creates; plans scaffold only |
| ESR point release | exit test | ✗ (calendar) | 153.7 2026-11-10 else 153.8 | `dry-run` proves every path now; calendar run closes the test |

**Missing dependencies with no fallback:** the owner-created Cloudflare/App objects and the calendar release. They are the planned checkpoint and do not block the local work.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `scripts/verify-platform.sh` registry rows. Each script carries its own `--self-test` |
| Config file | none. Rows are appended to the CHECKS array: quick rows after `zizmor-self-test`, full rows untouched |
| Quick run command | `scripts/verify-platform.sh --only detect-upstreams-self-test` (likewise `release-train-logic-self-test`, `workflows`, `workflows-self-test`) |
| Full suite command | `scripts/verify-platform.sh --quick` |
| Estimated runtime | ~70 seconds (`--quick`) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AUTO-01 | tag mapping + pinned-major guard from fixtures incl. 175→153.23 | fixture, quick | `--only detect-upstreams-self-test` | ❌ new `scripts/detect-upstreams.mjs` |
| AUTO-04 | Node 24 selection + SHASUMS parse from fixtures; in-job gpgv path | fixture, quick | covered by `detect-upstreams-self-test` (parse half); live half in the train job | ❌ same file |
| TRAIN-03 | 5 Phase-A states from facts; ≤1 transition; ends at merge gate | fixture, quick | `--only release-train-logic-self-test` | ❌ new `scripts/release-train.mjs` |
| TRAIN-09 | one fixture per state (set equality) + 5 plants, each red naming drift | fixture, quick | same row | ❌ same file |
| TRAIN-01 | triggers/concurrency/guards/input validation/dry-run threading | static, quick | `--only workflows` / `--only workflows-self-test` | ❌ new `release-train.yml` (+ `outputs.stage` edit) |
| TRAIN-08 | every write step gated by `dry-run` | static, quick | same rows (new dry-run rule + plants) | ❌ same files |
| TRAIN-02 | exactly-one tracking issue; PATCH-iff-differ; lock/close/reopen; gate-only mention | fixture, quick | covered by `release-train-logic-self-test` (render/exactly-one plants) | ❌ same files |
| AUTO-06 | bump via `workflow_call` read-only; `bump-pr` App-token PR without click | static + calendar | `workflows` rows now; exit test on calendar | ❌ workflow wiring |
| AUTO-07 | exactly-one conflict issue with log+diff, assigned owner, never edits patch | fixture, quick | covered by `release-train-logic-self-test` (conflict plants) | ❌ same files |
| INF-03 | clock-only Worker; JWT CPU measured + recorded; dispatch contract | scaffold + docs | docs grep + scaffold review; live tick at checkpoint | ❌ scaffold (own repo) |

### Sampling Rate
- **Per task commit:** `scripts/verify-platform.sh --quick`, after `git add` of the new files (the residual-brand scan reads `git ls-files`).
- **Per wave merge:** `--quick` plus each new row's `--self-test`.
- **Phase gate:** `--quick` green, owner checkpoint, then the calendar exit test closes TRAIN-03/AUTO-06.

### Wave 0 Gaps
None. The registry, the self-test conventions, and the analog harnesses (`verify-release-identity.mjs`, `verify-upstream-pins.mjs`, `verify-workflows.mjs`) exist. The new scripts and the new workflow are the deliverables.

## Security Domain

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes (Apps) | Clock App Actions:write-only on one repo; bot App no Workflows; tokens minted at use, 1-hour expiry; no PATs |
| V4 Access Control | yes | Per-job least privilege; env `bot` branch policy `main` (assumed from Phase 41); `report` sole `issues:write`; owner-only `reason=owner` by repo permission |
| V5 Input Validation | yes | Tag/key regexes before acting; `head_repository` guard on every `workflow_run` job; no event text in `run:`/`prompt:`; dry-run gate on every write step |
| V6 Cryptography | partial | SHASUMS signature verified in-job (`gpgv` + release-keys); MAR signing is Phase 44/49, not here |
| V10 Malicious Code / supply chain | yes | SHA-pinned admitted `uses:`; set-equal admission; zizmor offline audit of the new workflow |
| V14 Configuration | yes | Declared workflow + declared inputs; drift rows (`workflows`, pins, identity); fail-closed reads |

### Known Threat Patterns
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Fork run triggers the train | Elevation | `head_repository` guard on every job; chain ban (train never a source) |
| Issue/PR text reaches shell or dispatch | Tampering | Event-text rule over `run:`/`prompt:`; inputs validated by regex before use |
| App token exfiltrated across jobs | Information disclosure | Minted in `bump-pr` only; revoked post-step; 1-hour expiry |
| Bump pushed as workflow edit | Tampering | Bump edits manifest+patches only; pins sweep covers `.github/` |
| `GITHUB_TOKEN` PR stalls the train | Denial | `bump-pr` uses the App token; exit test proves no click needed |
| Duplicate tracking/conflict issues | Tampering/Repudiation | Exactly-one find; duplicate is FAIL, no PATCH |
| Issue body mistaken for state | Tampering | Render-from-facts every run; bytes-compare PATCH; snapshot comment never read |
| Worker key leak | Information disclosure | Clock App can only dispatch idempotent reconcilers (Actions:write, one repo) |
| Draft Release misread as published | Spoofing | `draft:false` required; draft plant goes red |
| 175.x mistaken for a 153 candidate | Spoofing | Pinned-major guard; 175 plant goes red |

## Sources

### Primary (HIGH confidence)
- **Tree files read this session (or by researchers against this worktree):** `configuration.toml:31-38, 114-126`, `scripts/generate.mjs:2775-2830`, `scripts/verify-release-identity.mjs` (whole: `RELEASE_TAG :58`, `tupleOf/lower :72-81`, harness `:83-92, 200-326`), `scripts/verify-upstream-pins.mjs` (`:20-28, 96, 99, 125-126, 162-180, 250-294, 601-636`), `scripts/verify-workflows.mjs` (`:96-99, 214-350, 466-543`), `.github/workflows/rebase-upstream.yml` (whole), `.github/workflows/verify.yml` (triggers + job), `.github/workflows/notify-drill.yml` (skeleton), `scripts/rebase-upstream.sh` (`:40-43, 60-83, 108-192`), `scripts/apply-patches.sh` (`:48-57`), `powerbrowser/packaging/node-runtime.json`, `powerbrowser/packaging/package-linux.sh:19-62`, `docs/BUILD.md:1041-1049`, `docs/RELEASING.md` (Apps, cadence, schedule posture, Node provenance), `scripts/verify-platform.sh` (registry syntax + insertion area).
- **Planning record:** `.planning/workstreams/deploy/REQUIREMENTS.md` (10 Phase-43 requirement texts, Owner Decisions 15/16/18/20/21, External Gates), `.planning/workstreams/deploy/ROADMAP.md` (Phase 43 goal/deps/criteria/gate/flag), `.planning/research/v1.6-deploy/{ARCHITECTURE,SUMMARY,STACK,PITFALLS}.md` (orchestrator §4, A5/A6, limits, corrections).
- **Prior phase artifacts:** `40-RESEARCH.md` (generator/licensing patterns), `41-RESEARCH.md` (controls table, workflows rules, Pitfalls 2/9, Open Questions), `41-03-PLAN.md` (GH-12 rule text + plant matrix shape), `41-COVERAGE.md` (matrix form).

### Secondary (MEDIUM)
- Official-docs facts via prior research (re-checked, not re-fetched): GitHub `workflow_dispatch`/`workflow_run`/concurrency semantics, App-token vs `GITHUB_TOKEN` PR runs, environment branch policies, `return_run_details` linkage; Cloudflare Workers Free limits (10 ms CPU, 50 subrequests, 5 crons); nodejs.org `index.json`/`SHASUMS256.txt` shape; product-details `firefox_versions.json` shape.
- `github.blog` / `create-github-app-token` notes on App push refusal and token revocation (via Phase 41 research).

### Tertiary (LOW)
- Homebrew tap naming (Phase 41, unrelated here); Apple/Azure lead times (later phases).

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH. No new packages; versions already locked in the tree.
- Detector parsers + fixtures: HIGH. Regexes and pins verified against the tree; live values confirmed by researchers.
- Train skeleton + issue protocol: HIGH in-tree (rules, guards, permissions all read); MEDIUM for GitHub runtime behavior (approval-click, dispatch linkage) — closed by the calendar exit test.
- Worker + JWT measurement: MEDIUM. Design is settled; the CPU number is unmeasured by construction (plan 43-05 measures it).
- Platform behaviors: MEDIUM. Same basis as Phase 41 (schema + live GETs there; docs here).

**Research date:** 2026-10-22
**Valid until:** 2026-11-22. The GitHub REST surface and the ESR calendar move; re-check the exit-test release number if planning slips past 2026-11-10.
