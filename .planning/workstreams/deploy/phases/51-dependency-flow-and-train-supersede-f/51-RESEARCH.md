# Phase 51: Dependency flow and train supersede (F) — Research

**Phase:** 51-dependency-flow-and-train-supersede-f (workstream `deploy`, milestone v1.6)
**Researched:** 2026-10-23 (planning research, no live GitHub/Cloudflare probes, no builds)
**Confidence:** HIGH on in-tree facts (every file:line below was read in this checkout); HIGH on GitHub/Cloudflare/Renovate platform mechanics as already adjudicated in `.planning/research/v1.6-deploy/` (SUMMARY is authoritative where it corrects SEED-002; CRITIQUE §5 corrections applied). MEDIUM on Renovate action version currency (re-resolve SHAs at plan time) and on CodeQL-default-setup API shape (new settings bodies, unexecuted).
**Depends on (unexecuted at research time):** Phase 43 (train skeleton, `detect-upstreams.mjs`, `release-train.mjs` DETECTED→BUMP_PR_GREEN, `release-train-logic-self-test`, scheduler Worker), Phase 48 (maintenance sweep, TRAIN-07 pinned issue), Phase 50 (BUILDING→DONE, `release.yml` sign-publish). This research specifies **extension-only** shapes that assume those artifacts exist exactly as ROADMAP/REQUIREMENTS describe them.

Required reading applied: ROADMAP Phase 51 section, REQUIREMENTS AUTO-02/AUTO-03/DIST-05/UPS-02/TRAIN-04/TRAIN-11 + Owner Decisions 4,5,13,16,22, STATE.md, 51-CONTEXT.md, SUMMARY (Phase F) + FEATURES/AUTO/TRAIN + ARCHITECTURE (train, fixer, registry) + PITFALLS 1–5,8–10 + CRITIQUE contradictions C1–C20 + STACK (Renovate, CodeQL, zizmor, runner), CLAUDE.md hard rules, plus the tree files listed under "Key facts verified".

Project skills: `.claude/skills/` holds only `sketch-findings-Power-Browser` (browser-chrome visual direction). Phase 51 is backend automation + docs with no UI surface (ROADMAP 51 carries no UI hint), so no project skill applies. Do not invoke it.

---

## 1. Summary

### Primary recommendation

Implement Phase 51 as **three grouped dependency inflows feeding the existing train, plus two train-logic extensions and one sweep extension** — all declarative, all read back, no new clock, no new server:

1. **Self-hosted `renovatebot/github-action`, dispatched by the maintenance sweep** on the first tick after each last-Thursday Theia release and on owner dispatch, with the bot App token. One grouped `@theia/**` PR (`@theia/monaco-editor-core` separate), `rangeStrategy: pin`, a `customManager` rewriting `theia_release` in `configuration.toml`, the **nix manager updating `flake.lock`**, automerge **off** (owner decision 4). Never Mend Renovate (decision 16; Mend's App holds workflow scope and its 1 vCPU/3 GB/30 min Community limits make a Theia `yarn.lock` regeneration a measured risk — self-hosted has no such cap but the run is still measured).
2. **Dependabot native**: weekly grouped `github-actions` updates that keep SHA pins with plain version comments, plus npm **security-only** updates to `theia/yarn.lock` (version updates off). Dependabot alerts on; CodeQL **default setup** (no workflow file) covering `theia/extensions` and `scripts/`.
3. **Train supersede (TRAIN-04)** as pure-function extensions to the assumed `scripts/release-train.mjs` derive/next/render: new `SUPERSEDED` state, chemspill-revision priority over a scheduled train, cancel-pending-`release`-deployment on supersede, sign-job exit when a newer Release exists. Fixtures land in the assumed `release-train-logic-self-test` (set-equality over the state table).
4. **Sweep extension (TRAIN-11)**: six new rows on the assumed Phase 48 maintenance issue (`renewals-due`, `repo-controls`, open Dependabot PR count, Dependabot alert count, CodeQL alert count + last-push age, Codeberg `main` SHA vs GitHub `main` with no-data render until Phase 53), plus `docs/RELEASING.md` cadence + npm-advisory response text and `docs/RENEWALS.md` Node 24 Maintenance-end row (2028-04-30).
5. **Licensing upkeep in the Renovate flow**: `scripts/generate-licensing.mjs` (PKG-08) must run inside the Theia-bump flow or the `licensing` drift row turns the PR red (Phase 40 Pitfall 7). This is the single most-forgotten wiring in this phase.

### Ordered steps for the planner (each becomes one plan or plan-section)

1. **Renovate config + admission + trust-boundary**: add `.github/renovate.json5` (or `renovate.json`) with the grouped Theia shape (§6.1); admit `renovatebot/github-action@*` in `.github/settings/actions-selected.json` (set-equality: admit exactly what workflows use); add the dispatching workflow job (hosted runner, `bot` environment, no `schedule:` key — the sweep tick is the clock per D-77); extend `scripts/verify-workflows.mjs` plants only as needed (no new driver). Green: `workflows` + self-test.
2. **Theia customManager + nix manager + licensing hook**: `customManager` (regexManager) rewriting `configuration.toml:theia_release` and every `theia/package.json` resolutions pin (monaco-editor-core excepted); nix manager for `flake.lock`; post-upgrade task running `node scripts/generate-licensing.mjs` (+ `generate.mjs` byte-identity) so `licensing` stays green. Measure wall time/RAM/disk of one `yarn install` regeneration under `nix develop .#theia` and record in the plan.
3. **Dependabot config**: `.github/dependabot.yml` — weekly `github-actions` group (one PR) + `npm` security-only on `theia/` scope; plain `# vX.Y.Z` comments (compound `# vX # zizmor:` comments go stale — Dependabot rewrites plain ones, FEATURES confirmed via 2022-10-31 changelog); keep `open-pull-requests-limit`, no automerge. `workflows` row already covers SHA-pin admission; no new action needed.
4. **CodeQL + Dependabot enablement as settings bodies (owner applies)**: new tracked bodies under `.github/settings/` (e.g. `code-security.json` / `dependabot-alerts` state — exact endpoint names resolved at plan time against `gh api`) + new `CONTROLS` entries in `scripts/verify-repo-controls.mjs` with live read-back (`repo-controls` full-tier row). Plans build bodies + comparators + self-test plants; owner runs apply. Rationale: there is **no code-security control in CONTROLS today** (grep-verified); AUTO-03 "alerts on + default setup" must be declared-and-read-back like every other control (GH-02 pattern), not clicked in the UI.
5. **Train supersede logic**: extend the assumed `release-train.mjs` state table with `SUPERSEDED` (+ reuse `NEEDS_OWNER` from fixer scope), chemspill priority (revision bump for same ESR preempts a scheduled-train ESR bump), cancel-pending-deployment via API on supersede, sign-job newer-Release exit. Add one fixture per new state/transition to `release-train-logic-self-test`; the state list is derived from the state table and compared as set equality, so a state without a fixture or vice versa goes red (TRAIN-09 pattern).
6. **Sweep rows**: extend the assumed maintenance-sweep renderer with the six TRAIN-11 rows, each with green/red/no-data render (Codeberg row renders no-data until Phase 53 mirror exists; runner/channel/download rows already no-data until Phase 50 per ROADMAP). Sweep comments only on red→transition (TRAIN-07 pattern); self-test plants one red row and requires exactly one comment.
7. **Docs**: `docs/RELEASING.md` — release cadence (two weeks; ESR calendar authoritative, REQUIREMENTS DOC-03 note), npm-advisory path + response time (DIST-05 observable half is the TRAIN-07 pin-age row); `docs/RENEWALS.md` — Node 24 Maintenance-end 2028-04-30 row (UPS-02) + every new credential/token row if any (Renovate uses the existing bot App token — no new secret, no new RENEWALS row by design).
8. **Registry rows**: every new check is one `label|command` row in `scripts/verify-platform.sh` with a `--self-test` sibling that plants each fault and must go red naming the drift; expectations derived from the tree at check time, set-equality, never hand-kept lists (CLAUDE.md Verification rules). Prefer extending existing scripts (`verify-workflows.mjs`, `verify-repo-controls.mjs`, `release-train-logic-self-test`, sweep renderer) over new scripts.
9. **Owner enable/merge checklist**: enabling CodeQL default setup, enabling Dependabot alerts, merging the first Renovate `@theia/**` PR, merging the first grouped Dependabot PR, and any live settings apply are owner actions. Plans end with exact owner commands (apply, enable, merge) and never push, dispatch, or apply live state (51-CONTEXT owner gates).
10. **First-real-exercise readiness**: the Theia 1.77 bump (needs TypeScript 6.0 against `theia/package.json:64` `~5.9.3`) is the expected first red Theia PR and the Phase 52 fixer proof (FIX-10, before 2027-05-27). Phase 51 must leave that branch in the fixer-eligible class (red bump PR on the Renovate Theia branch) and must not automerge or auto-fix it.

---

## 2. Architectural Responsibility Map

| Component | New / modified in 51 | Owns | Must not own |
|---|---|---|---|
| Maintenance sweep (assumed Phase 48 job in `release-train.yml`, `ubuntu-latest`) | Modified: dispatch Renovate on first tick after last-Thursday Theia release + owner dispatch; render 6 new TRAIN-11 rows | Cadence decisions, row rendering, comment-only-on-red, no-data states | Detection math (stays in `detect-upstreams.mjs`), descriptor bytes, any `schedule:` key (D-77 forbids) |
| `renovatebot/github-action` job | New workflow job(s) | Theia group PR only (`@theia/**` + separate monaco-editor-core, pin strategy, `theia_release` + `flake.lock` + `yarn.lock` + licensing regen) | Automerge (off), workflow-file edits (bot App has no Workflows — push of a Renovate branch touching `.github/workflows/` fails by design), cache restores in release path (none here anyway) |
| `.github/dependabot.yml` | New file | Weekly grouped actions PR + npm security-only PRs | Version updates for npm (off), automerge, SHA-comment invention (keep Dependabot's plain rewrite) |
| CodeQL default setup + Dependabot alerts | New settings bodies + CONTROLS entries | Desired-state declaration + live read-back | Any workflow file (default setup needs none; `github_owned_allowed: true` already admits GitHub's own actions) |
| `scripts/release-train.mjs` derive/next/render | Modified (extension only) | `SUPERSEDED` state, chemspill priority, cancel-pending-deployment action, sign-job newer-Release exit, tracking-issue render of supersede | Stored state (issue body is a view; attempt counts derived from labelled PRs), `workflow_run` chaining (single-level wake only, guarded) |
| `release-train-logic-self-test` | Modified (fixtures only) | One fixture per new state + five inherited fault plants + new supersede/chemspill/sign-exit plants | Hand-kept state list (derive from the state table, set-equality) |
| `scripts/verify-workflows.mjs` | Modified only if new rules needed | Trust boundary (SHA pins, admission set-equality, no-schedule, legion, claude rules, issues-write, workflow_run guard/chain, write-trio, no-pr-trigger, no-cache, event-text) | Any new driver |
| `scripts/verify-repo-controls.mjs` CONTROLS | Modified (new entries) | New code-security/Dependabot bodies + comparators + self-test plants | Owner UI steps (printed, never executed by `--yes`) |
| `docs/RELEASING.md` / `docs/RENEWALS.md` | Modified text | Cadence (two weeks), npm-advisory response time, Node 24 end row | Version facts on the home page / `release.json` (decision 13 forbids) |
| `scripts/generate-licensing.mjs` | Used, not modified | Notices re-derivation inside the Theia-bump flow | Hand-edited notices |

Data flow (steady state, post-51):

```
last-Thursday Theia release → sweep tick (first tick after) → dispatch Renovate job (bot App token)
  → grouped @theia/** PR (theia_release + resolutions + yarn.lock + flake.lock + licensing regen)
  → verify.yml (no approval click: App-token PR) → workflow_run wake → train BUMP_RED/BUMP_PR_GREEN
  → owner merges (automerge OFF) → train continues as out-of-band revision (revision+1)
weekly → Dependabot grouped actions PR + npm security-only PRs → same verify path → owner merges (weekly)
newer ESR detected while train open → old train SUPERSEDED (cancel pending `release` deployment)
  → new train starts; chemspill revision preempts scheduled train; sign job exits if newer Release exists
daily sweep (first tick after 06:00 UTC) → re-render maintenance issue (+6 rows), comment only on red
```

---

## 3. User Constraints (from 51-CONTEXT.md — binding on plans)

- **Owner gates (stop points):** enabling CodeQL default setup, enabling Dependabot alerts, merging the first Renovate `@theia/**` PR, merging the first grouped Dependabot PR, and any live GitHub settings change are **owner actions**. Plans build everything locally (Renovate config, Dependabot config, supersede logic + fixtures, sweep-row extensions, RELEASING/RENEWALS text) and **end with exact owner merge/enable commands**; they do not apply live changes, push, or dispatch. Read-only `gh api` GETs are allowed for research and read-back rows.
- **Phases 41/43/48/50 are partially unexecuted.** Plans assume: `.github/settings/*` bodies + `repo-controls`/`workflows`/`zizmor` rows exist as built in 41-01–41-03 (do not re-declare them); `detect-upstreams.mjs`, `release-train.mjs` (DETECTED/BUMPING/CONFLICT/BUMP_RED/BUMP_PR_GREEN), `release-train-logic-self-test`, the scheduler Worker, the Phase 48 sweep, and Phase 50 states + `release.yml` sign-publish exist exactly as ROADMAP/REQUIREMENTS describe them and are **extended only**. If an assumed file is absent at execution, the executor records the missing premise and stops rather than redefining the train.
- **Codeberg mirror does not exist until Phase 53.** The TRAIN-11 Codeberg row is implemented now but asserts only its **no-data render** until the mirror exists.
- **`powerbrowser-updates` + Homebrew tap repos assumed created empty in Phase 41.** No plan creates repos or Apps.
- **DIST-05 cadence text is two weeks** (REQUIREMENTS DOC-03 note); the ESR calendar in External Gates is authoritative for dates.
- **TRAIN-04 supersede + chemspill priority follow REQUIREMENTS as written**; the sign-job newer-Release exit is part of the same rule.
- **No version facts on the home page; no `release.json`** committed by any workflow (decision 13).
- **Self-hosted Renovate dispatched by the train with the bot App token; Mend not used** (decision 16). **Theia automerge off** (decision 4). **One release per ESR point release + out-of-band revision bumps** (decision 5). **Cachix + Flathub kept; Upptime added alongside the watchdog** (decision 22).

---

## 4. Phase Requirements Table (with research support)

| ID | What must be TRUE (ROADMAP §51 success criteria) | Research support — why this shape |
|---|---|---|
| **AUTO-02** | On the first tick after a last-Thursday Theia release, self-hosted Renovate opens one grouped `@theia/**` PR (`@theia/monaco-editor-core` separate), pinned, rewriting `theia_release` in `configuration.toml` and updating `flake.lock`, automerge off. | SUMMARY Phase F + FEATURES AUTO-02 + STACK Renovate row: self-hosted `renovatebot/github-action` dispatched by the train (decision 16, CRITIQUE C7: keeps one clock, bot App lacks Workflows whereas Mend's App holds workflow scope). Mend Community limits (1 job/3 GB/30 min, CRITIQUE claims 24–25 confirms documented) make a Theia `yarn.lock` regen a risk on Mend; self-hosted has no such cap but the run is still measured (research flag F). `rangeStrategy: pin` + `customManager` (regexManager) is the standard pattern for a version literal outside package.json; nix manager updates `flake.lock` (Renovate nix-manager docs, FEATURES). Tree: `configuration.toml:124-126` (`theia_release = "1.76.0"` + "every consumer follows" comment), `theia/package.json:7-58` (all `@theia/*` at 1.76.0 except `monaco-editor-core 1.108.201` — upstream's own monaco line, keep the exception). Licensing hook required: `scripts/generate-licensing.mjs` closure walk means every Theia bump drifts `THIRD-PARTY-NOTICES.txt` (Phase 40 Pitfall 7; `licensing` row `verify-platform.sh` quick set). |
| **AUTO-03** | Dependabot opens one weekly grouped github-actions PR keeping SHA pins with plain version comments + applies npm security-only updates to `theia/yarn.lock`; Dependabot alerts on; CodeQL default setup covers `theia/extensions` and `scripts/`. | FEATURES AUTO-03 + STACK CodeQL row + PITFALLS Integration Gotchas: Dependabot rewrites SHA pin + plain version comment together (2022-10-31 changelog, MEDIUM-HIGH); **compound comments (`# v4 # zizmor: …`) go stale** — keep pin comments plain. CodeQL default setup needs no YAML; under selected-actions policy set `github_owned_allowed: true` (already true in `actions-selected.json`). No code-security CONTROLS entry exists today (verified by grep) → new settings bodies + read-back (GH-02 pattern). Scope note: default setup analyzes repo languages on the default branch; plan must show `theia/extensions/**` (TS) + `scripts/**` (JS) are covered and record the CodeQL 6-month-inactivity auto-disable → hence the last-push-age sweep row (ARCH §4.4 item 5). |
| **DIST-05** | `docs/RELEASING.md` states one release per ESR point release, out-of-band releases by `revision` bump, and the npm-advisory path + response time. Observable half is the TRAIN-07 pin-age row. | REQUIREMENTS + SUMMARY Phase F + ARCH §4.4: docs-only requirement; the machine-observable half (pin age >3 days red) already belongs to the Phase 48 sweep, not to this phase's rows. Cadence text is **two weeks** (DOC-03 note; `docs/RELEASING.md:728` still says "roughly every four weeks" — stale, fix in this phase). No `release.json`, no homepage version facts (decision 13). |
| **UPS-02** | Node 24 line decision recorded, with Maintenance end 2028-04-30 as a `docs/RENEWALS.md` row. | FEATURES UPS-02 + STACK live facts: packaged runtime `v24.19.0` (`powerbrowser/packaging/node-runtime.json`), Node 24 latest `v24.22.0` (2026-10-14, nodejs.org index); maintenance ends 2028-04-30. `docs/RENEWALS.md` does **not exist yet** in this checkout (verified) — created in Phase 42 (DOC-04); Phase 51 adds the row (or creates the file in the Phase 42 shape if still absent → record missing premise per CONTEXT, do not redefine DOC-04). Related existing rows: `node-major-agreement` (node-runtime.json ↔ flake `nodejs_24` ↔ engines `>=24`) already quick-green. |
| **TRAIN-04** | Newer ESR while a train is open → old train SUPERSEDED, pending `release` deployment cancelled, new train starts; chemspill revision takes priority; sign job exits when a newer Release exists; supersede fixtures in `release-train-logic-self-test`. | SUMMARY Phase F + ARCH §4.2 state machine + PITFALLS 8 (stale-approval + 1 h App-token expiry + immutable-release tag reuse): supersede is derived-state, not stored — `derive()` sees newer tag/PR/Release facts and emits SUPERSEDED; `next()` cancels the pending deployment via API and starts the new train; one `release-train` concurrency group (no cancel-in-progress, no queue-max). Chemspill = same-ESR `revision` bump preempts a scheduled-train ESR bump. Sign-job guard (`signmar` step first compares version with latest published Release, exits if newer) handles the approve-stale-run race. PITFALLS 7 (same-ESR rollback: `updateIsAtLeastAsOldAs` accepts older buildID at equal version) is why chemspill-withdraw still goes through `descriptor-monotonic`, not around it. |
| **TRAIN-11** | Maintenance issue gains `renewals-due`, `repo-controls`, open Dependabot PR count, Dependabot + CodeQL alert counts, CodeQL push age, Codeberg-vs-GitHub `main` rows. | ARCH §4.4 (sweep items 1–8) + SUMMARY Phase F + CRITIQUE C13/C19: `renewals` (quick, structure only) is separate from `renewals-due` (sweep, ≤30 days red) — calendar-dependent quick rows would redden unrelated commits. `repo-controls` is **full-tier** (network `gh api`), so the sweep runs it daily on hosted runners, never `--quick`. Dependabot/CodeQL counts via App token (`dependabot-alerts: read`, `security-events: read` per ARCH §6 matrix). Codeberg row compares SHAs via public API, no-data until Phase 53. Watchdog (MON-01, Phase 48) covers the clock-stopped case; sweep rows cover everything else. |

Owner Decisions mapped: 4→AUTO-02 automerge off; 5→DIST-05/TRAIN-04 chemspill; 13→no homepage/release.json in sweep/site rows; 16→AUTO-02 self-hosted Renovate; 22→Upptime/MON-02 stays alongside watchdog (sweep reports Upptime workflow state — Phase 53, not here).

---

## 5. Project Constraints (hard rules that bind every plan)

From CLAUDE.md + REQUIREMENTS Out of Scope + ROADMAP hard constraints:

1. **Never fork or patch Theia core** — adopt upstream by re-pinning (`theia_release` + resolutions + `yarn.lock`); `scripts/diff-theia-core.sh` is the check. A Renovate PR that edits Theia sources is reshaped to a re-pin, never a patch.
2. **Never modify Gecko outside the patch stack** — `upstream/` stays `git diff`-empty; patches change only via `scripts/regenerate-patches.sh` (AUTO-10). Phase 51 touches no patch.
3. **One verification driver** — `scripts/verify-platform.sh`. New check = one registry row + `--self-test` that plants each fault and must go red naming the drift. No sibling drivers; no resurrected `verify-phase-*.sh`.
4. **Derive, don't hand-keep** — expectations derived from the tree at check time, compared as set equality (admission set, label set, state set, channel mentions). Never assert on the absence of a log line unless the emitter is proven.
5. **New files are invisible to the brand scan until staged** — `scan-brand-residue.mjs` iterates `git ls-files`; stage before trusting green. Token classification lives only in `inventory/brand-tokens.json`.
6. **No `schedule:` in the product repo** (D-77 + `workflows` no-schedule rule). The Worker cron + sweep tick is the only clock; Renovate's own `schedule` config must not become a workflow `schedule:` key.
7. **No PAT, no App private key on legion; no App holds Workflows** (decisions 2/16; `repo-controls` asserts any Workflows-holding installation red; `workflows` self-test plants App-token-beside-Claude). Renovate runs with the bot App token on **hosted** runners only.
8. **Legion label** only in `release.yml` jobs named `build-*`/`matrix-*`, with no `environment:` and no `secrets.` reference (asserted). Phase 51 adds no legion job.
9. **User-facing copy** names "PowerBrowser", carries no internal identifier (pref key, sentinel, port, timeout, raw exception). Website copy by review, not row. Diagnostics carry the identifiers instead.
10. **Builds inside Nix shells** — `nix develop .#theia` (Node/yarn side: Renovate regen measurement, licensing) / `.#firefox` (Gecko side, not used here). `yarn` does not work outside the shell (measured shell entry ~4 s). Repo path must contain no space.
11. **Out-of-scope denials that touch 51**: Mend Renovate (replaced by self-hosted), `release.json`/homepage version facts, Actions cache in any release-path job (cold fallback, INF-04), `workflow_run` chaining (single-level guarded wake only), deleting a Release / reusing a tag (withdraw + new revision instead).

---

## 6. Standard Stack + Install

| Piece | Version / source (re-resolve SHAs at plan time) | Purpose in 51 | Install / enable |
|---|---|---|---|
| `renovatebot/github-action` (self-hosted) | SUMMARY: v46.3.9 `a63d9a7bc606f7336fd20b47f2f32259a35e621` (Renovate 44.172.1); re-resolve `releases/latest` at plan time, SHA-pin, admit in `actions-selected.json` | Theia group PR + `flake.lock` via nix manager, dispatched by sweep | No npm install. New workflow job on `ubuntu-latest`, env `bot`, bot App token via `actions/create-github-app-token` (also to be admitted + SHA-pinned). No `schedule:` key; no cache step; `persist-credentials: false` on checkout where applicable. |
| Renovate nix manager | Built into Renovate (containerbase `nix-prebuild`); `enabledManagers` must include `nix` (ships disabled by default — FEATURES source-level) | `flake.lock` input updates alongside the Theia bump | `nix.enabled: true` (or `enabledManagers` add). Cannot regenerate `toolchain-baseline.txt` (decision 19: baseline pins the release container toolchain) — record as manual owner follow-up when the nixpkgs input moves, not as a Renovate task. |
| Renovate `customManager` (regexManager) | Built into Renovate | Rewrite `theia_release` in `configuration.toml` (+ keep `theia/package.json` resolutions in agreement) | `customManagers`/regexManager block with `matchStrings` on `theia_release = "x.y.z"` and `datasourceTemplate: npm` / `depNameTemplate: @theia/core` (or per-package mapping — see §7.1). `packageRules` group `@theia/**`, separate `@theia/monaco-editor-core`. |
| Dependabot native | GitHub-provided, no version | Weekly grouped actions PRs + npm security-only | Add `.github/dependabot.yml` (no action, no admission). Enable alerts + security updates = settings bodies + owner enable (new CONTROLS entries). |
| CodeQL default setup | `codeql-action` v4.39.0 runs behind it (SUMMARY); no workflow file | JS/TS (`theia/extensions`, `scripts/`) + Actions analysis | Settings body + owner enable; `github_owned_allowed: true` (already). No YAML file to admit. |
| zizmor | v1.31.1 (STACK) / flake `pkgs.zizmor` 1.29.0 — locked nixpkgs wins for the row | `--offline` static audit (AUTO-09, already green) | Already in `.#theia` shell; no change. New workflows must stay zizmor-green (template-injection, unpinned-uses). |
| `universal-github-app-jwt` 2.2.2 / wrangler 4.151.3 | STACK Core/Cloudflare | Assumed Phase 43 scheduler Worker (clock only) | Not installed in 51; referenced only as the dispatcher of the sweep tick. PKCS#8 conversion + `User-Agent` + `return_run_details: true` notes carry over for any Worker touch-up (none planned). |
| Node 24 line | Packaged `v24.19.0`, latest `v24.22.0` (2026-10-14); flake `pkgs.nodejs_24`; engines `>=24` | UPS-02 RENEWALS row; AUTO-04 detector stays Phase 43's | No install in 51. |

```bash
# What Phase 51 installs (nothing on legion, nothing global):
# 1. Tracked config only:
#    .github/renovate.json5          # NEW — Theia group + managers
#    .github/dependabot.yml          # NEW — weekly grouped actions + npm security-only
#    .github/settings/actions-selected.json  # MOD — admit renovatebot/github-action (+ any other new uses:)
#    .github/settings/<code-security bodies> # NEW — Dependabot alerts + CodeQL default setup desired state
#    .github/workflows/release-train.yml     # MOD (assumed Phase 43 file) — sweep dispatch + sweep rows + supersede
# 2. Inside nix develop .#theia (measurement only, not installation):
nix develop .#theia --command bash -c 'cd theia && time yarn install --frozen-lockfile'
node scripts/generate-licensing.mjs --check   # must stay green after any Theia/Node bump
scripts/verify-platform.sh --quick             # commit gate before any push
```

`flake.lock` nix-manager implication (verified): `flake.lock` pins `nixpkgs/nixos-unstable` (locked rev in tree) which supplies `nodejs_24`, `yarn`, `inkscape 1.4.4`, `zizmor`. Renovate's nix manager updates flake **inputs** (git-refs datasource), not the tools directly; the `node-major-agreement` row then asserts node-runtime.json ↔ flake `nodejs_NN` ↔ engines agreement. The Theia bump must not move the nixpkgs input silently — if it does, `toolchain-baseline.txt` (decision 19, container toolchain) and the inkscape byte-identity gate can redden for reasons unrelated to Theia; keep the Theia group and the nixpkgs input on separate upgrade paths unless the plan explicitly couples them with a re-measurement.

---

## 7. Package Legitimacy Audit

| Package / action | Registry / org | Legitimacy signal | Risk / mitigation in 51 |
|---|---|---|---|
| `renovatebot/github-action` | `renovatebot` org (official Renovate action), GH Marketplace | Official action for the documented tool; STACK pins v46.3.9 by 40-hex SHA | Label/permission risk only: run hosted-only, `contents: read` + App-token mint in the same job only where needed, no `workflows` permission anywhere (bot App lacks it — pushes touching workflows fail closed). Admit `renovatebot/github-action@*` explicitly; set-equality removes it if unused. |
| `actions/create-github-app-token` | `actions` org (GitHub-owned) | First-party; v3 revokes token in post step (ARCH §6: tokens cannot cross jobs) | Admit via `github_owned_allowed` (already true) or explicit pattern; mint bot token immediately before use (1 h expiry, PITFALLS 8). |
| `actions/checkout`, `upload/download-artifact`, `attest-build-provenance` | `actions` org | First-party, already in tree / assumed Phase 49 | SHA-pin + plain version comment; `retention-days: 1` on artifacts (500 MB cap, open item). |
| `anthropics/claude-code-action` | `anthropics` org | Official; commit `db77d4d3…` = v1.0.254 (tag object `c335fd6d` must NOT be pinned — CRITIQUE 20) | Phase 52's, not 51's — but the Renovate Theia branch is a fixer class (FIX-01), so 51 must not set `allowed_bots: '*'` or any rule that breaks the Phase 52 guard shape. |
| `cachix/install-nix-action` | `cachix` org, already admitted (`actions-selected.json:5`) | In-tree, SHA-pinned in both workflows | Keep; do not add cache steps to any release-path job (`workflows` no-cache rule). |
| Dependabot / CodeQL | GitHub-provided (no install) | Native, no third-party code in the tree | Compound SHA comments go stale → plain comments; CodeQL auto-disables after 6 months without push → last-push-age row. |
| `universal-github-app-jwt`, `wrangler` | npm (APSL/MIT), Cloudflare-owned action | Assumed Phase 43 Worker deps | No change in 51. |

Do NOT add: Mend Renovate App (workflow scope + second clock, decision 16); any PAT (App tokens expire in 1 h by design); Octokit in hot paths (CPU budget — N/A here, no Worker change); `mach repackage flatpak`; `--generate-notes`; MSI/MSIX/PKG/Snap; a second updater; Upptime-as-clock in the product repo.

---

## 8. Architecture Patterns (file layout + per-requirement patterns)

### 8.0 File layout (new + touched, relative to repo root)

```
.github/
  renovate.json5                    # NEW (AUTO-02) — presets, packageRules, managers
  dependabot.yml                    # NEW (AUTO-03) — weekly grouped actions + npm security-only
  settings/
    actions-selected.json           # MOD — admit renovatebot/github-action (+ others new workflows use)
    <code-security>.json            # NEW — Dependabot alerts + CodeQL default-setup desired state
    app-powerbrowser-bot.json       # READ — bot App: no Workflows (assert, don't widen)
  workflows/
    release-train.yml               # MOD (assumed Phase 43) — sweep dispatch job, supersede, sweep rows
scripts/
  release-train.mjs                 # MOD (assumed Phase 43) — SUPERSEDED + chemspill + sign-exit + render
  verify-workflows.mjs              # MOD only if new trust rules needed (plants in-memory, no network)
  verify-repo-controls.mjs          # MOD — CONTROLS entries for new settings bodies + self-test plants
  generate-licensing.mjs            # USE — runs in the Renovate flow (--check must stay green)
  verify-platform.sh                # MOD — one registry row per new check + --self-test sibling
docs/
  RELEASING.md                      # MOD — cadence (two weeks) + npm-advisory response time
  RENEWALS.md                       # MOD (assumed Phase 42 file) — Node 24 2028-04-30 row
```

### 8.1 Renovate config pattern (AUTO-02)

Requirements driving the shape: one grouped PR; monaco-editor-core separate; `rangeStrategy: pin`; customManager rewrites `theia_release`; nix manager updates `flake.lock`; automerge off; dispatched by the sweep (first tick after last-Thursday release + owner dispatch); bot App token; licensing regen in-flow.

- `extends`: none of the Mend presets that enable automerge/schedule — start minimal (`:pinOnly` spirit but explicit; Renovate's own `config:recommended` is acceptable only with automerge/schedule explicitly overridden off).
- `packageRules`: (1) `matchPackagePatterns: ["^@theia/"]` + `excludePackageNames: ["@theia/monaco-editor-core"]` → `groupName: "theia"`, `groupSlug: "theia"`, one branch/PR; (2) `matchPackageNames: ["@theia/monaco-editor-core"]` → separate group/branch. `rangeStrategy: "pin"` on both (resolutions are exact pins today).
- `customManagers` (regexManager): `fileMatch: ["(^|/)configuration.toml$"]`, `matchStrings` capturing the `theia_release = "x.y.z"` version, `datasourceTemplate: "npm"`, `depNameTemplate: "@theia/core"` (the group's version anchor — all `@theia/*` move in lockstep per release; document this mapping choice). A second fileMatch covers `theia/package.json` resolutions only as a consistency assertion, not as 50 independent bumps (keeps one PR, avoids 50-branch explosion).
- `nix`: `enabled: true` for `flake.lock` (manager ships disabled — must opt in). Document the toolchain-baseline follow-up (manual, decision 19).
- `timezone`, `schedule`: do NOT set Renovate `schedule` as the cadence mechanism — the sweep dispatch is the clock (D-77). If Renovate `schedule` is used at all, it is a no-op guard window, never the trigger.
- `automerge: false` (+ `automergeType` unset); `platformAutomerge: false`. Stability: `minimumReleaseAge` / `prCreation: "not-pending"` optional, owner-decided; default to Renovate defaults unless the plan measures a flake reason.
- `postUpgradeTasks` / `allowedPostUpgradeCommands`: run `node scripts/generate-licensing.mjs` (+ `node scripts/generate.mjs --check` byte-identity) so the PR arrives with notices already regenerated. Self-hosted runner: no 30-min/3 GB cap, but record measured wall/RAM/disk in the plan (research flag F closure).
- Branch/PR naming: `chore/theia-<version>` (FIX-01 class expects the Renovate Theia branch as a fixer trigger — keep the prefix stable and record it).

### 8.2 Dependabot config pattern (AUTO-03)

- `updates`: (1) `package-ecosystem: "github-actions"`, `directory: "/"`, `schedule: { interval: "weekly" }`, `groups: { actions: { patterns: ["*"] } }` → one PR/week; (2) `package-ecosystem: "npm"`, `directory: "/theia"`, `allow: [{ dependency-type: "all" }]` constrained to **security updates only** (`open-pull-requests-limit` small; version updates off — Dependabot `versioning-strategy`/`allow` shape resolved at plan time against the live Dependabot options schema; the requirement text "version updates off, security-only on" is authoritative over any schema drift).
- SHA pins: keep `uses: owner/repo@<40-hex> # vX.Y.Z` plain comments. Dependabot rewrites pin + plain comment together; **no compound comments** (`# v4 # zizmor: …`) — they go stale (FEATURES, MEDIUM-HIGH). `workflows` uses-admitted set-equality stays green because the owner/repo set is unchanged by a SHA bump.
- No automerge on either ecosystem (weekly owner merge = the steady-state "one grouped Dependabot merge per week" from the milestone goal).

### 8.3 CodeQL pattern (AUTO-03)

- Default setup, no workflow file. Desired state in a new tracked settings body (plan resolves exact `gh api` endpoints: code-scanning default-setup + Dependabot alerts enablement); `repo-controls` reads them back (new CONTROLS entries, full-tier). Languages: the repo's analyzable code is TypeScript (`theia/extensions/**`), JavaScript (`scripts/**`), Python (glean/collector pieces), and Actions — plan asserts the default-setup coverage includes the first three at minimum and records what default setup does/doesn't cover for Actions (codeql-action runs behind default setup per SUMMARY; verify at plan time, don't assert from memory).
- Alert-count + push-age rows live in the sweep (TRAIN-11), not in `--quick` (network). CodeQL default setup auto-disables after ~6 months without a push → the push-age row is the detector (ARCH §4.4.5).

### 8.4 Train supersede pattern (TRAIN-04)

Extension to the assumed `release-train.mjs` (pure `derive(facts) → state`, `next(state) → action`, `render(state) → issue body`):

- New state `SUPERSEDED` (terminal, next to `DONE`/`WITHDRAWN`): entered when `derive` sees a newer ESR tag (or newer chemspill revision) with an open older train. `render` writes "superseded by <new key>" + link; issue closes or stays locked per the Phase 43 tracking-issue protocol (do not invent a second protocol).
- `next` on entering SUPERSEDED: cancel the older train's pending `release` deployment via API (`pending_deployments` cancellation — ARCH §6 matrix shows `dispatch-release`/`maintenance` permissions; plan reuses exactly those scopes, no new token).
- Chemspill priority: same-ESR `revision`-bump detection outranks a scheduled-train ESR bump in `derive` ordering (revision train proceeds; scheduled train supersedes). Record the ordering rule in `docs/RELEASING.md` if the Phase 43 doc doesn't already.
- Sign-job exit: first step of assumed sign-publish compares its version with the latest published Release and exits 0-with-note when a newer Release exists (handles stale approvals at the two-week cadence — PITFALLS 8).
- Fixtures: one per new state + plants (newer-ESR-while-open, chemspill-vs-scheduled ordering, duplicate tracking issue under supersede, fork-head `workflow_run` during supersede, sign-job newer-Release exit). State list derived from the state table, set-equality (TRAIN-09).

### 8.5 Sweep rows pattern (TRAIN-11)

Each row: `{ key, label, state: ok|red|no-data, evidence: link-or-API-fact, since }`. Rendered by the existing report job; body PATCHed only on byte-difference; comment + @-mention + assignment only on transition into a state needing the owner (TRAIN-02 protocol).

- `renewals-due`: parse `docs/RENEWALS.md` dates; red when any date ≤30 days out. (Quick `renewals` row = structure only; this sweep row = due dates — CRITIQUE C19 split.)
- `repo-controls`: run the full-tier read-back daily; red names the drifting control.
- `dependabot-prs`: count open Dependabot PRs (informational + red threshold owner-decided; default: red when >N stale or any security PR >response-time — DIST-05 text defines the response time).
- `dependabot-alerts` / `codeql-alerts`: open-alert counts via API (bot App `dependabot-alerts: read` + `security-events: read`); red when >0 (or >threshold with severity filter — owner-decided, recorded).
- `codeql-push-age`: red when default setup approaches auto-disable (age threshold recorded in RELEASING).
- `codeberg-mirror`: compare Codeberg `main` SHA (public API) vs GitHub `main`; **no-data render until Phase 53** (CONTEXT binding); turns red when the mirror lags once it exists.
- Self-test: plant one red row → exactly one comment (TRAIN-07 pattern); plant Codeberg-no-data → green-with-note, no comment.

### 8.6 Docs pattern (DIST-05, UPS-02)

- `docs/RELEASING.md`: two-week cadence (fix the stale "four weeks" at :728 + `README.md:46-47` + `rebase-upstream.yml:1-4` per DOC-03 if still stale), ESR 153 calendar pointer (External Gates authoritative), npm-advisory path (Dependabot security PR → owner merge → out-of-band `revision` bump if needed) + response time (defines the sweep's red threshold — keep the number in one place, reference it from the row).
- `docs/RENEWALS.md`: `Node 24 Maintenance end — 2028-04-30 — owner action: track AUTO-04 detector / plan ESR-175-era Node move` (+ every new credential row if the plan adds one — default: none, Renovate reuses the bot App token whose key has no expiry and no renewal row).

---

## 9. Don't Hand-Roll

| Instead of hand-rolling… | Use (already decided) | Why |
|---|---|---|
| Own Theia-update script / cron | Renovate self-hosted + sweep dispatch | Version resolution, grouping, lockfile + nix rewrites, release-note framing, and Mend-independent hosting are all solved; a script re-implements the datasource. |
| Own action-SHA updater | Dependabot grouped actions updates | Dependabot rewrites pin + plain comment together (changelog-verified); a script fights it. |
| Own CodeQL workflow file | CodeQL default setup | No YAML to pin/admit/audit; GitHub manages the runner version. |
| Own scheduler / delay | Worker clock + environment wait timer (assumed Phases 43/49) | D-77 + 24 h queue-cancel + 1–43,200 min timer are all platform-solved (PITFALLS 8/9). |
| Stored train state / counter file | Derived facts + tracking-issue-as-view + labelled-PR attempt counts | "Derive and compare" rule; stored state drifts (ARCH §1). |
| Text-edited patches in a fixer/renovate flow | `scripts/regenerate-patches.sh` only | Hand edits degrade the 3-way apply to a silent no-op (CLAUDE.md). Fixer is denied `patches/**` writes; Renovate never touches `patches/` (ESR bumps are AUTO-06's path, not Renovate's). |
| Hand-kept allow/admit/state lists | Derive at check time, set-equality | `verify-workflows.mjs` admission-used, `repo-controls` settings-set, `release-train-logic-self-test` state-set patterns. |
| `release.json` / homepage version facts for the sweep | Tracking-issue bodies + RELEASING text | Decision 13 forbids both. |

---

## 10. Common Pitfalls (Phase 51-specific)

1. **Renovate `schedule` becomes the clock.** Setting Renovate's own `schedule:` plus the sweep dispatch creates two clocks that disagree (and a workflow `schedule:` key fails `workflows` no-schedule red). Dispatch is the trigger; Renovate config carries no cadence.
2. **Mend vs self-hosted re-litigation.** Mend's App holds workflow scope (ARCH §5.3, PITFALLS 4) and its 3 GB/30 min cap is documented (CRITIQUE 25). Decision 16 settled this: self-hosted. Plans must not admit Mend's App or its scopes.
3. **`yarn.lock` regen measured nowhere.** Research flag F stays open until a plan records wall time/RAM/disk of a Theia-minor regen under `nix develop .#theia` (shell entry ~4 s measured 2026-10-23). `theia/yarn.lock` is 332 KB / 6445 lines today — small for Theia, but the measurement (not the size) closes the flag. Include the licensing regen in the timed path.
4. **Licensing drift forgotten.** First Renovate PR goes red on `licensing` because `THIRD-PARTY-NOTICES.txt` wasn't regenerated in-flow. The post-upgrade hook (§8.1) is load-bearing, not polish.
5. **Compound SHA comments.** `# v4.1.0 # zizmor: ignore …` next to a pin goes stale on the next Dependabot bump. Keep pin comments plain `# vX.Y.Z`; put auditor notes elsewhere (PITFALLS Gotchas).
6. **Unused admission red.** `actions-selected.json` set-equality fails on an admitted-but-unused `owner/repo@*` (and on a used-but-unadmitted one). Admit exactly the new `uses:` set (renovatebot + any new create-github-app-token/artifact/attest usage) — verified current file admits only `cachix/install-nix-action@*` + `github_owned_allowed: true`, so a Renovate job without an admission update is red by construction.
7. **`flake.lock` writer collision.** FIX-11 (Phase 52) denies the *fixer* `flake.lock` — Renovate is the sanctioned `flake.lock` writer. Plans must state this distinction so the Phase 52 gate isn't misread as forbidding the AUTO-02 nix-manager update.
8. **CodeQL silent disable.** Default setup auto-disables after ~6 months without a push; without the push-age row the repo discovers it on the next audit. The row is the detector (ARCH §4.4.5).
9. **Bot commits vs 60-day rule (watchdog repo).** Whether bot commits count as activity for the scheduled-workflow disable is still open (SUMMARY table) — matters only to the `powerbrowser-updates`/Upptime watchdog (MON-01/MON-02), not to the product repo (no `schedule:` there). Don't block 51 on it; record the assumption.
10. **Supersede vs NEEDS_OWNER confusion.** `SUPERSEDED` (a newer train exists — routine, no owner action) vs `NEEDS_OWNER` (fixer attempts exhausted — owner action). Rendering must not assign/mention on SUPERSEDED beyond the informational link; otherwise every two-week overlap pages the owner for a non-event.
11. **Stale-approval publish.** Approving an old pending `descriptor`/`release` deployment after N+1 exists publishes the older build. The sign-job newer-Release exit (§8.4) + supersede cancellation are both required; either alone leaves the race (PITFALLS 8).
12. **Renovate release-notes injection.** Renovate PR bodies copy upstream release notes (third-party text). The fixer prompt (Phase 52) must treat them as framed data, never trusted fields (PITFALLS 1) — so 51 must keep PR-body templating deterministic and must lock tracking issues (`gh issue lock` pattern) rather than "sanitizing" notes.
13. **Event-text in new workflow text.** Any `${{ github.event.issue|comment|pull_request|head_commit|review }}` inside `run:` or `with.prompt:` fails `workflows` event-text red (self-test plants each). New dispatch inputs are validated by regex (tag regex precedent, `rebase-upstream.sh` WR-07) before use.
14. **Two-week vs four-week text.** The tree still says "four weeks" in `docs/RELEASING.md:728` (+ README + rebase header per DOC-03). DIST-05 plans must fix all three together or the doc row stays red-by-stale-text.

---

## 11. Code Examples (shapes — exact versions/SHAs re-resolved at plan time)

### 11.1 Renovate config shape (`.github/renovate.json5`)

```json5
{
  "$schema": "https://docs.renovatebot.com/renovate-schema.json",
  "automerge": false,
  "platformAutomerge": false,
  "rangeStrategy": "pin",
  "packageRules": [
    {
      "matchPackagePatterns": ["^@theia/"],
      "excludePackageNames": ["@theia/monaco-editor-core"],
      "groupName": "theia",
      "groupSlug": "theia",
      "rangeStrategy": "pin"
    },
    {
      "matchPackageNames": ["@theia/monaco-editor-core"],
      "groupName": "theia-monaco-editor-core",
      "groupSlug": "theia-monaco-editor-core",
      "rangeStrategy": "pin"
    }
  ],
  "customManagers": [
    {
      "customType": "regex",
      "fileMatch": ["(^|/)configuration\\.toml$"],
      // captures theia_release = "1.76.0" and maps it to the @theia/core npm version anchor
      "matchStrings": ["theia_release\\s*=\\s*\"(?<currentValue>[^\\\"]+)\""],
      "datasourceTemplate": "npm",
      "depNameTemplate": "@theia/core"
    }
  ],
  "nix": { "enabled": true },
  // post-upgrade: regenerate notices + byte-identity so `licensing` stays green
  "allowedPostUpgradeCommands": ["^node scripts/generate-licensing\\.mjs$", "^node scripts/generate\\.mjs --check$"],
  "postUpgradeTasks": {
    "commands": ["node scripts/generate-licensing.mjs", "node scripts/generate.mjs --check"],
    "fileFilters": ["THIRD-PARTY-NOTICES.txt", "LICENSING.md", "theia/yarn.lock", "flake.lock", "configuration.toml"],
    "executionOrder": "after-parent"
  }
}
```

### 11.2 Dependabot shape (`.github/dependabot.yml`)

```yaml
version: 2
updates:
  - package-ecosystem: "github-actions"
    directory: "/"
    schedule: { interval: "weekly" }
    groups:
      actions: { patterns: ["*"] }   # one grouped PR/week; SHA pins kept, plain # vX.Y.Z comments
    open-pull-requests-limit: 5
  - package-ecosystem: "npm"
    directory: "/theia"
    schedule: { interval: "weekly" }
    # security-only: version updates off (exact key per live Dependabot schema at plan time)
    allow: [{ dependency-type: "all" }]
    open-pull-requests-limit: 5
```

### 11.3 Train state-table extension (`scripts/release-train.mjs`, assumed Phase 43 file)

```js
// STATES gains exactly one terminal state; ORDER gains the chemspill rule.
// The self-test derives this list — never duplicate it in docs or fixtures.
export const STATES = [
  'DETECTED', 'BUMPING', 'CONFLICT', 'BUMP_RED', 'BUMP_PR_GREEN',
  'BUILDING', 'AWAITING_APPROVAL', 'PUBLISHED', 'DESCRIPTOR_WAIT',
  'DESCRIPTOR_LIVE', 'LIVE_RED', 'WITHDRAWN', 'DONE',
  'SUPERSEDED',          // NEW (TRAIN-04): a newer ESR/revision train superseded this one
  'NEEDS_OWNER',         // (fixer scope; referenced, not redefined)
];
// derive() ordering (first match wins):
//   1. chemspill revision detected (same ESR, revision+1)  → chemspill train proceeds
//   2. newer ESR tag with open older train                  → older train SUPERSEDED
//   3. ...rest of the Phase 43/50 ordering unchanged...
// next(SUPERSEDED): cancel pending `release` deployment via API; link new train; no owner assign.
// sign job guard (release.yml, assumed Phase 50 file — first step):
//   latest=$(gh api repos/{o}/{r}/releases/latest --jq .tag_name); [ "$VERSION" -gt "$latest" ] || exit 0
```

### 11.4 Sweep-row shape (assumed Phase 48 renderer)

```js
// One entry per TRAIN-11 row; renderer PATCHes the issue only on byte-difference,
// comments (+ @-mention/assign) only on transition into a red-needing-owner state.
{ key: 'renewals-due',    state: 'red',    evidence: 'docs/RENEWALS.md: Node 24 2028-04-30 ≤30d', since: '2026-10-23' }
{ key: 'repo-controls',   state: 'ok',     evidence: 'repo-controls full-tier green 2026-10-23',  since: '2026-10-23' }
{ key: 'dependabot-prs',  state: 'ok',     evidence: '2 open (0 security)',                       since: '2026-10-23' }
{ key: 'dependabot-alerts', state: 'ok',   evidence: '0 open',                                    since: '2026-10-23' }
{ key: 'codeql-alerts',   state: 'ok',     evidence: '0 open; last push 3d ago',                   since: '2026-10-23' }
{ key: 'codeberg-mirror', state: 'no-data', evidence: 'mirror lands in Phase 53 (GH-04)',         since: '2026-10-23' }
```

### 11.5 Registry-row shape (`scripts/verify-platform.sh`)

```bash
# New check = one row + --self-test sibling; quick rows read text only (no build/browser/display/network).
"renovate-config|node $REPO_ROOT/scripts/verify-renovate-config.mjs"              # if a new script is justified;
"renovate-config-self-test|node $REPO_ROOT/scripts/verify-renovate-config.mjs --self-test"
# Prefer extending existing rows over new scripts:
#   workflows (+self-test) — new uses:/trigger/permission shapes
#   repo-controls (+self-test) — new CONTROLS entries, in-memory plants, no network
#   release-train-logic-self-test — SUPERSEDED/chemspill/sign-exit fixtures, set-equality over STATES
```

---

## 12. State of the Art (as adjudicated for this milestone)

- **Comparable browsers** (FEATURES §0, HIGH via `gh api`): Zen + Floorp keep one static `update.xml` per BUILD_TARGET in a separate Pages repo, written by the release job; Floorp's `verify-stable-hold.yml` (public bytes = repo bytes) is the direct precedent for UPD-17/`channel-live`; Floorp's `workflow_dispatch` + `dry-run` + `request-id` descriptor flow is the precedent for TRAIN-08; Mullvad's per-release GitLab issue template is the precedent for TRAIN-02 tracking issues. None runs a cross-ESR/Theia/Node orchestrator or an AI fixer — those are this project's differentiators and its largest new attack surface (SUMMARY).
- **Renovate (Oct 2026):** `renovatebot/github-action` v46.3.9 / Renovate 44.172.1 (STACK, re-resolve at plan time); nix manager beta + opt-in, `git-refs` datasource only; Mend Community 1 job / 1 vCPU / 3 GB / 15 GB / 30 min (CRITIQUE 25, documented). Self-hosted per decision 16.
- **Dependabot:** SHA pin + plain version comment rewritten together (2022-10-31 changelog); compound comments stale; weekly groups native. Alerts + security updates are settings state, not files.
- **CodeQL:** default setup (no YAML), `codeql-action` behind it; auto-disable after ~6 months without push (ARCH §4.4) → push-age row.
- **Theia:** monthly, last Thursday; tree at 1.76.0 (`monaco-editor-core` 1.108.201 exception); 1.77 expected to need TypeScript 6.0 vs pinned `~5.9.3` → the expected first red Theia PR and the Phase 52 fixer proof (FIX-10, before 2027-05-27).
- **Node:** 24 line, packaged v24.19.0, latest v24.22.0 (2026-10-14); maintenance ends 2028-04-30 (UPS-02 row).
- **GitHub mechanics relied on:** App tokens expire 1 h (mint before use); `GITHUB_TOKEN` dispatches always create runs; `workflow_run` chains stop at three levels (single-level guarded wake only); self-hosted queue cancels after 24 h (not forever — fixes `docs/RELEASING.md:909-910`); immutable releases lock assets+tag and forbid tag reuse after deletion (withdraw, never delete); environment wait timer 1–43,200 min + required reviewer on `descriptor` (decision 18 keeps the owner hop a gate).
- **Cloudflare Free caps** (clock-only Worker rationale, CRITIQUE 22 confirmed): 10 ms CPU/invocation, 50 subrequests, 5 crons/account, 100k req/day. No Worker change in 51.

---

## 13. Key Facts Verified in the Tree (2026-10-23 checkout)

| Fact | Evidence | Implication for plans |
|---|---|---|
| Theia resolutions pinning | `theia/package.json:7-58` — every `@theia/*` at `1.76.0` **except** `@theia/monaco-editor-core: 1.108.201`; `typescript: ~5.9.3` (:64), engines `yarn >=1.7.0 <2, node >=24` | Renovate group must except monaco-editor-core (separate PR); 1.77 red-PR expectation (TS 6.0) is consistent with the pin |
| `theia_release` single source | `configuration.toml:124-126` — `theia_release = "1.76.0"` + "every consumer follows — no second copy" comment | customManager target; byte-identity gate will catch a second copy |
| `flake.lock` nix-manager surface | `flake.nix` — `nixpkgs/nixos-unstable` input supplying `nodejs_24`, `yarn` (override for node-gyp MODULE_VERSION), `inkscape 1.4.4`, `zizmor`; `flake.lock` present | Enable nix manager explicitly; keep Theia-group and nixpkgs-input bumps on separate paths; `node-major-agreement` row watches the Node-major triangle |
| `yarn.lock` size | `theia/yarn.lock` 332 KB, 6445 lines; no `dependabot.yml`, no `renovate.*`, no `codeql*` in tree (all NEW in 51) | Regen measurement is small-to-medium; flag F closes with a timed run, not an estimate |
| `actions-selected` admission | `.github/settings/actions-selected.json` — `github_owned_allowed: true`, patterns only `cachix/install-nix-action@*` | Any `renovatebot/*` (or other new) `uses:` needs an admission entry; unused admissions also red (set equality) |
| `workflows` row rules | `scripts/verify-workflows.mjs:15-56` (14 rules) + in-memory self-test over a good-`release.yml` fixture | New jobs must be hosted-only (Renovate/Claude), no `schedule:`, no `secrets.` on legion, guarded single-level `workflow_run`, no cache in `release.yml`, no event-text in `run:`/`prompt:` |
| `repo-controls` CONTROLS | `scripts/verify-repo-controls.mjs:551-646` — 15 controls; envs `bot/descriptor/fixer/release/triage` + `environment-branch-policy-main.json`; **no code-security/Dependabot/CodeQL control** (grep-verified); `private-vulnerability-reporting.json: enabled true` already | AUTO-03 needs NEW settings bodies + CONTROLS entries + read-back; env/branch-policy pattern is the template |
| App + org posture | `app-powerbrowser-bot.json` — Contents/PRs/Issues write, Administration + vulnerability-alerts read, **no Workflows**, repos `powerbrowser/powerbrowser-updates/homebrew-tap`; `org.json` — 2FA on, single owner | Renovate-with-bot-token inherits no-Workflows (fail-closed on workflow edits); second-owner + Apps install remain Phase 41 owner steps |
| Workflow files present | `.github/workflows/` = `verify.yml`, `rebase-upstream.yml`, `notify-drill.yml` only; `rebase-upstream.yml:22-34` `workflow_dispatch` + `workflow_call` with required `tag`, **no default** (AUTO-08 landed); no `schedule:` anywhere | Train-assumed files (`release-train.yml`, `release.yml`, `triage.yml`, `dependabot.yml`, `renovate`) are all absent-or-assumed — CONTEXT missing-premise rule applies |
| Licensing drift on bumps | `scripts/generate-licensing.mjs` — Gecko preprocess + Theia closure walk + Node pin; `licensing` + `licensing-self-test` already in the quick registry | Renovate flow must run the generator or the first Theia PR goes red |
| Registry conventions | `scripts/verify-platform.sh` — `label\|command` CHECKS arrays (quick ~line 3600+, full ~line 4729+), `repo-controls-self-test`/`workflows`/`zizmor`/`licensing` precedents with hermetic self-tests | Follow the file's own "Honestly --quick" + self-test-plant comment pattern verbatim for any new row |
| No RENEWALS.md yet | `docs/` has no `RENEWALS.md` (Phase 42 DOC-04 creates it) | UPS-02 row lands in the Phase 42 shape; if still absent, record the missing premise, don't redefine DOC-04 |

---

## 14. Assumptions Log

1. Phase 43/48/50 artifacts exist exactly as ROADMAP/REQUIREMENTS describe (train skeleton + states, sweep, sign-publish). Plans extend; missing file = stop + record, never redefine. (CONTEXT binding.)
2. Phase 41 settings bodies + `repo-controls`/`workflows`/`zizmor` rows exist as built in 41-01–41-03. (CONTEXT binding.)
3. Codeberg mirror, Upptime status, `powerbrowser-updates` content, second owner, Apps installation, runner registration are all future/owner steps; related rows render no-data until their phase. (ROADMAP External gates + CONTEXT.)
4. Renovate action version/SHA re-resolved at plan time (`gh api repos/renovatebot/github-action/releases/latest`); the v46.3.9 SHA above is a starting point, not a pin.
5. `docs/RENEWALS.md` exists in the Phase 42 (DOC-04) shape by execution time; otherwise the UPS-02 row waits on it.
6. Theia releases stay last-Thursday-monthly; the next Theia minor after 1.76 is the Renovate flow's first live exercise (1.77 + TS 6.0 red-PR expectation is the Phase 52 proof, not a 51 failure).
7. Bot commits counting (or not) as activity for the 60-day scheduled-workflow rule affects only the watchdog/Upptime repo, never the product repo. (SUMMARY open item.)

---

## 15. Open Questions (for plans to close, none blocking research)

1. **Renovate regen measurement (flag F):** wall time / peak RAM / disk of a Theia-minor `yarn install` + licensing regen under `nix develop .#theia` on legion vs hosted runner — record numbers, choose the Renovate job's `runs-on` + `timeout-minutes` accordingly. (Closes the last Phase F research flag.)
2. **CodeQL default-setup API shape:** exact settings endpoints/bodies for "alerts on + default setup covering the repo" at execution time (GitHub evolves these); plan probes `gh api` read endpoints first, then writes bodies + CONTROLS comparators to match.
3. **Dependabot npm security-only key:** exact `dependabot.yml` schema key expressing "version updates off, security-only on" for the `npm//theia` block at execution time (schema drifts; requirement text governs).
4. **Renovate datasource anchor:** `@theia/core` as the single `theia_release` version anchor vs per-package mapping — confirm all `@theia/*` move in lockstep per Theia release (tree suggests yes; one mismatch report settles it).
5. **Sweep red thresholds:** Dependabot-PR-count and alert-count red thresholds + CodeQL push-age warning age — owner-decided, recorded in `docs/RELEASING.md` next to the npm-advisory response time (DIST-05).
6. **nixpkgs-input coupling:** whether a Theia bump that also moves the nixpkgs input needs a `toolchain-baseline.txt` re-measurement + inkscape byte-identity re-proof in the same PR (default: separate paths; couple only with measurement).
7. **60-day rule vs bot commits** (watchdog repo only) and **500 MB artifact cap on public repos** (measure on first run) — carried open items, not 51 blockers.
8. **Apple SDK licence / rcodesign viability / Developer ID CA date / runner-group-on-Free / RS256-in-10 ms / `FIREFOX_ESR153` key / approval-timeout / github-runner-30-day-vs-nixpkgs-lag** — carried open items owned by their phases (H/I/A3/L), listed here so 51 plans don't absorb them.

---

*Research complete. Planner entry: start with §1 steps 1–4 (configs + admission + settings bodies + supersede fixtures), keep every new check inside the existing registry/scripts per §8, and end every plan with the owner enable/merge commands per §3.*
