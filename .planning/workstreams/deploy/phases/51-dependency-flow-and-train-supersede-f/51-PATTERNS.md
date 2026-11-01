# Phase 51: Dependency flow and train supersede (F) — Pattern Mapping

**Phase:** 51-dependency-flow-and-train-supersede-f (workstream `deploy`, milestone v1.6)
**Mapped:** 2026-10-23
**Sources:** `51-CONTEXT.md` (user decisions), `51-RESEARCH.md` (technical research),
ROADMAP.md Phase 51 section, REQUIREMENTS.md AUTO-02, AUTO-03, DIST-05, UPS-02,
TRAIN-04, TRAIN-11, CLAUDE.md hard rules.
**Checkout verified:** every `file:line` below was read in this tree on 2026-10-23.

> **Read-only rule for this task:** this document is the only write. Nothing under
> `ledger/` or `scripts/verify-ng-NNN-*.mjs` was touched; no network writes, no git
> push, no dispatch. Owner gates from 51-CONTEXT §"Owner gates in this phase" apply
> to every plan built from this mapping.

---

## 0. Missing-premise rule (binding on all Phase 51 plans)

The following artifacts are **assumed** to exist exactly as ROADMAP/REQUIREMENTS
describe them, because Phases 41 (plan 41-04 live apply), 43, 48, and 50 are
unexecuted in this checkout (verified absent: `scripts/release-train*`,
`scripts/detect-upstreams*`, `docs/RENEWALS.md`, `.github/renovate*`,
`.github/dependabot*`; verified present-only: `.github/workflows/` holds
`verify.yml`, `rebase-upstream.yml`, `notify-drill.yml`):

| Assumed artifact | Assumed from | Phase 51 relationship |
|---|---|---|
| `scripts/release-train.mjs` (`derive`/`next`/`render`, state table DETECTED→BUMP_PR_GREEN) | Phase 43, TRAIN-03 | **Extend only:** add `SUPERSEDED`, chemspill ordering, cancel-pending-deployment, sign-exit render |
| `release-train-logic-self-test` (set-equality fixtures over the state table) | Phase 43, TRAIN-09 | **Fixtures only:** one per new state/transition |
| `scripts/detect-upstreams.mjs` | Phase 43, AUTO-01 | Read-only reference (detection math stays there) |
| scheduler Worker (`powerbrowser-scheduler`, hourly `reason=tick` dispatch) | Phase 43, INF-03 | Read-only reference (the only clock; D-77) |
| `.github/workflows/release-train.yml` (sweep tick, report job) | Phase 43/48, TRAIN-01/02/07 | **Extend only:** Renovate dispatch job + six TRAIN-11 rows |
| maintenance sweep renderer + pinned `release-train: maintenance` issue | Phase 48, TRAIN-07 | **Rows only:** six new row objects, same `{key,state,evidence,since}` shape |
| release states BUILDING→DONE + `release.yml` sign-publish | Phase 50, TRAIN-10 | **Guard only:** newer-Release exit as first sign step |
| `.github/settings/*` bodies + `repo-controls`/`workflows`/`zizmor` rows as built in 41-01–41-03 | Phase 41 | **Do not re-declare;** extend CONTROLS and admission only |
| `docs/RENEWALS.md` in the Phase 42 (DOC-04) shape | Phase 42, DOC-04 | **Row only:** Node 24 Maintenance-end 2028-04-30 |
| `powerbrowser-updates` + Homebrew tap repos created empty | Phase 41 external gate | No plan creates repos or Apps |
| Codeberg mirror | Phase 53, GH-04 | Codeberg row renders **no-data** until then |

**Executor rule (from 51-CONTEXT):** if any assumed file is absent at execution
time, record the missing premise and stop. Never redefine the train, the sweep,
the Worker, or DOC-04's file shape.

---

## 1. File inventory (create / modify / use)

| # | File | Disposition | Requirement | Role |
|---|---|---|---|---|
| F1 | `.github/renovate.json5` | **NEW** | AUTO-02 | Declarative updater config (Theia group) |
| F2 | `.github/dependabot.yml` | **NEW** | AUTO-03 | Declarative updater config (actions + npm security) |
| F3 | `.github/settings/<code-security>.json` (e.g. `code-security.json`, exact endpoint names resolved at plan time via read-only `gh api` GETs) | **NEW** | AUTO-03 | Desired-state declaration for alerts + default setup |
| F4 | `.github/settings/actions-selected.json` | **MOD** (admission only) | AUTO-02 | Trust-boundary admission set |
| F5 | `.github/workflows/release-train.yml` (assumed) | **MOD** (extension only) | AUTO-02, TRAIN-04, TRAIN-11 | Sweep dispatch + supersede + sweep rows |
| F6 | `scripts/release-train.mjs` (assumed) | **MOD** (extension only) | TRAIN-04 | Pure state machine: `SUPERSEDED`, chemspill, cancel, render |
| F7 | `release-train-logic-self-test` (assumed) | **MOD** (fixtures only) | TRAIN-04 | Set-equality fixture table |
| F8 | `.github/workflows/release.yml` sign-publish (assumed) | **MOD** (guard step only) | TRAIN-04 | Newer-Release exit, first step |
| F9 | `scripts/verify-workflows.mjs` | **MOD only if** a new trust rule is needed | AUTO-02/03 | Trust-boundary row (plants in-memory) |
| F10 | `scripts/verify-repo-controls.mjs` | **MOD** (CONTROLS entries + plants) | AUTO-03 | Desired-state read-back row |
| F11 | `scripts/verify-platform.sh` | **MOD** (one `label\|command` row per new check + `--self-test` sibling) | All | The one registry |
| F12 | `docs/RELEASING.md` | **MOD** (text) | DIST-05, TRAIN-04 ordering | Operator manual: cadence + advisory path + thresholds |
| F13 | `docs/RENEWALS.md` (assumed) | **MOD** (one row) | UPS-02 | Renewal calendar: Node 24 end 2028-04-30 |
| F14 | `scripts/generate-licensing.mjs` | **USE, do not modify** | AUTO-02 (PKG-08 upkeep) | Notices re-derivation inside the Renovate flow |

No other file is created or modified. In particular: no new driver beside
`verify-platform.sh`, no CodeQL workflow file (default setup needs none), no
`schedule:` key anywhere (D-77), no Mend app, no PAT, no App key on legion.

Data-flow overview (steady state, post-51; see 51-RESEARCH §2):

```
last-Thursday Theia release → sweep tick (first tick after, F5) → dispatch Renovate job (F1, bot App token)
  → grouped @theia/** PR (theia_release [F14 regen in-flow] + resolutions + yarn.lock + flake.lock)
  → verify.yml → workflow_run wake → train BUMP_RED/BUMP_PR_GREEN (F6)
  → owner merges (automerge OFF) → out-of-band revision (revision+1)
weekly → Dependabot grouped actions PR + npm security-only PRs (F2) → same verify path → owner merges
newer ESR while train open → old train SUPERSEDED, pending `release` deployment cancelled (F6/F8) → new train
daily sweep (first tick after 06:00 UTC) → re-render maintenance issue (+6 rows, F5), comment only on red
```

---

## 2. Cross-cutting conventions every plan must follow

These are extracted from the analogs; each per-file section below cites the exact
lines that prove them.

### 2.1 One registry row per check (`scripts/verify-platform.sh`)

**Analog:** `scripts/verify-platform.sh` — quick rows at :4699–4730, full-tier
`repo-controls` row at :5088–5092, registry mechanics at :5096–5179.

```bash
# Exact row shape — label|command, double-quoted, inside CHECKS=() or CHECKS+=():
"licensing|node $REPO_ROOT/scripts/generate-licensing.mjs --check"          # verify-platform.sh:4699
"licensing-self-test|node $REPO_ROOT/scripts/generate-licensing.mjs --self-test"  # :4705
"repo-controls-self-test|node $REPO_ROOT/scripts/verify-repo-controls.mjs --self-test"  # :4711
"workflows|node $REPO_ROOT/scripts/verify-workflows.mjs"                    # :4716
"workflows-self-test|node $REPO_ROOT/scripts/verify-workflows.mjs --self-test"    # :4721
"zizmor|node $REPO_ROOT/scripts/verify-zizmor.mjs"                          # :4726
"zizmor-self-test|node $REPO_ROOT/scripts/verify-zizmor.mjs --self-test"    # :4730
# Full-tier (network) rows live in the second array, with the tier rationale inline:
"repo-controls|node $REPO_ROOT/scripts/verify-repo-controls.mjs"            # :5092
```

Comment convention (copy verbatim): `# NEW (Phase 51, REQ-ID): <what it proves>.`
followed by `Honestly --quick: <why it needs no build/browser/display/network>.`
plus `It writes nothing [in the tree].` for self-tests. Precedents:
`verify-platform.sh:4706-4710` (repo-controls-self-test),
`:4712-4715` (workflows), `:4722-4725` (zizmor).

Quick vs full-tier split: text-only derivation is `--quick`; anything needing
`gh api` (repo-controls live read-back, alert counts, Codeberg SHA compare) is
full-tier and runs daily on hosted runners, never `--quick` (precedent
:5088–5092: "Full tier: read-only gh api … green only after the owner applies").

### 2.2 Derive, don't hand-keep (set equality everywhere)

**Analog:** `scripts/verify-workflows.mjs:339-341`, `scripts/verify-repo-controls.mjs:140-148`.

```js
// verify-workflows.mjs:339-341 — admitted-but-unused is red too:
for (const repo of [...admitted].sort()) {
    if (!used.has(repo)) fail(SELECTED_REL, WF_LEVEL, 'admission-used', `patterns_allowed admits '${repo}@*', which no workflow uses. ...`);
}
// verify-repo-controls.mjs:140-148 — canonical set comparison:
function canon(v) {
    if (Array.isArray(v)) return `[${v.map(canon).sort().join(',')}]`;
    if (isObj(v)) return `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canon(v[k])}`).join(',')}}`;
    return JSON.stringify(v ?? null);
}
const same = (decl, live) => canon(decl) === canon(project(decl, live));
```

Applies to: admission set (F4), `release-train.mjs` STATES list (F7 derives it —
"never duplicate it in docs or fixtures", 51-RESEARCH §11.3), sweep row keys,
label sets. A hand-kept list can only agree with the tree it was copied from.

### 2.3 Self-test shape: green control first, then one plant per fault

**Analog:** `scripts/verify-workflows.mjs:366-375` (baseline-green gate),
`scripts/verify-zizmor.mjs:119-139` (bad/clean mkdtemp fixtures),
`scripts/verify-repo-controls.mjs:917-926` (declared-state-served-back green).

```js
// verify-workflows.mjs:369-375 — the unmodified tree must be green or plants mean nothing:
const baseline = runChecks(REPO_ROOT, { files, selected });
if (baseline.failures.length > 0) {
    console.error(`${NAME}: --self-test FAIL -- the unmodified tree is already red, ...`);
    return 1;
}
// verify-zizmor.mjs:81-103 — BAD fixture pairs event-text with a tag pin; CLEAN is minimal:
const BAD = ['on: issues', 'jobs:', '  echo:', '    runs-on: ubuntu-latest', '    steps:',
  '      - uses: actions/checkout@v4', '      - run: echo "${{ github.event.issue.title }}"', ''].join('\n');
const CLEAN = ['name: Clean', 'on: workflow_dispatch', 'permissions: {}', 'jobs:', '  echo:',
  '    name: Echo', '    runs-on: ubuntu-latest', '    steps:', '      - run: echo clean', ''].join('\n');
```

Every new/changed check gets a `--self-test` sibling that plants **each** fault
and must go red naming the drift (file + job + rule + value). Self-tests are
in-memory (`runChecks` overrides) or `mkdtemp` fixtures; they write nothing in the
tree and use no network and no `gh`.

### 2.4 Trust-boundary rules new workflow text must satisfy (F5, fixer-adjacent)

**Analog:** `scripts/verify-workflows.mjs:15-56` (rule catalogue), `:271-290`
(runner/legion), `:292-327` (claude/permissions/cache/event-text).

- `uses-pinned`: every non-local `uses:` is `owner/repo[/path]@<40 lowercase
  hex>`; `docker://` is red (`:225-228`, PIN regex `:102`).
- `uses-admitted` / `admission-used`: non-`actions`/`github` owners need a
  `patterns_allowed` `owner/repo@*` entry, and every entry must be used.
- `no-schedule`: no `schedule` event in any form (`:250`); D-77.
- `runner`/`legion`: `runs-on` literal; legion only in `release.yml` jobs
  `build-*`/`matrix-*` with no `environment:`, no `secrets.` reference, no
  `secrets: inherit` (`:278-284`). **Phase 51 adds no legion job** — Renovate,
  Dependabot and sweep all run on `ubuntu-latest`.
- `issues-write`: effective `issues: write` only on `release-train.yml` job
  `report` and in `triage.yml` (`:300-302`) — the sweep renderer keeps its
  existing `report` job; no new issues-writer.
- `workflow-run-guard`/`workflow-run-chain`: guarded single-level wake only
  (`:307-311`, `:330-337`).
- `write-trio`: `contents`+`id-token`+`attestations` write together only on
  `release.yml` job `sign-publish` (`:303-305`).
- `no-pr-trigger`: no `pull_request`/`pull_request_target` on `release.yml` or
  `release-train.yml` (`:251-255`).
- `no-cache`: no cache step/input in `release.yml`; Renovate job carries no
  cache step either (51-RESEARCH §6 table: "No `schedule:` key; no cache step").
- `event-text`: no `${{ github.event.(issue|comment|pull_request|head_commit|review) }}`
  inside `run:` or `with.prompt:` (`:322-327`); new dispatch inputs validated by
  regex (tag-regex precedent) before use.

### 2.5 Brand-scan invisibility of new files

`node scripts/scan-brand-residue.mjs` iterates `git ls-files` — **stage new files
before trusting a green scan** (CLAUDE.md; `verify-platform.sh:20-25`). Token
classification lives only in `inventory/brand-tokens.json`; never spell the
originating-product token elsewhere.

---

## 3. Per-file patterns

### F1 — `.github/renovate.json5` (NEW, AUTO-02)

**Role:** Declarative updater config. Owns the Theia inflow shape: one grouped
`@theia/**` PR, `@theia/monaco-editor-core` separate, `rangeStrategy: pin`,
`customManager` rewriting `theia_release`, nix manager for `flake.lock`,
automerge off, licensing regen in-flow. Must not own: cadence (the sweep tick is
the clock — no Renovate `schedule` as trigger), automerge, workflow-file edits.

**Data flow:** input = upstream npm datasource (`@theia/core` as version anchor)
+ `configuration.toml:theia_release` + `theia/package.json` resolutions +
`flake.lock` inputs; output = one `chore/theia-<version>` branch/PR carrying the
pin moves + regenerated `theia/yarn.lock` + `flake.lock` + regenerated
`THIRD-PARTY-NOTICES.txt`; downstream = `verify.yml` → train `BUMP_RED`/`BUMP_PR_GREEN`.

**Closest analogs:**

1. `configuration.toml:114-126` — the single-source contract the customManager
   must preserve (this comment is load-bearing; a second copy fails byte-identity):
   ```toml
   # theia_release is the one Theia release this project composes: every @theia/* pin in
   # theia/package.json resolutions, ... and the resolved @theia tarballs in theia/yarn.lock
   # agree with it (the @theia/monaco-editor-core exception carries upstream's own
   # monaco line). Edit one value, run `node scripts/generate.mjs`, and every
   # consumer follows -- no second copy lives anywhere else in the tree.
   [upstreams]
   firefox_esr_tag = "FIREFOX_153_5_1esr_RELEASE"
   theia_release = "1.76.0"                                                   # configuration.toml:125-126
   ```
2. `theia/package.json:7-58` — the resolutions surface: every `@theia/*` at
   `1.76.0` **except** line 35 `"@theia/monaco-editor-core": "1.108.201"`
   (upstream's own monaco line — keep the exception), plus `:64`
   `"typescript": "~5.9.3"` (why Theia 1.77 is the expected first red PR) and
   `:59-62` `engines: { yarn >=1.7.0 <2, node >=24 }`.
3. `scripts/verify-zizmor.mjs` (offline row shape) — a new static config gets a
   text-only check + `--self-test` sibling, never a driver; zizmor must stay
   green over any workflow the Renovate job touches (template-injection,
   unpinned-uses).

**Pattern to follow (shape; exact action SHA re-resolved at plan time):**
51-RESEARCH §11.1. `packageRules` group `^@theia/` minus monaco-editor-core,
separate monaco group; regexManager on `(^|/)configuration\.toml$` capturing
`theia_release\s*=\s*"(?<currentValue>[^\"]+)"` with `datasourceTemplate: npm`,
`depNameTemplate: @theia/core`; `nix: {enabled: true}`; `automerge: false` +
`platformAutomerge: false`; `allowedPostUpgradeCommands` + `postUpgradeTasks`
running `node scripts/generate-licensing.mjs` (+ byte-identity `--check`).

**Pitfalls (from 51-RESEARCH §10):** #1 Renovate `schedule` becoming a second
clock; #2 re-litigating Mend (decision 16 settled: self-hosted; Mend's App holds
workflow scope); #3 leaving research flag F open — measure wall/RAM/disk of a
`yarn install` regen under `nix develop .#theia` (`theia/yarn.lock` is 336,014
bytes today) and record in the plan; #4 licensing drift (the post-upgrade hook
is load-bearing — Phase 40 Pitfall 7); #7 `flake.lock` writer collision —
Renovate is the sanctioned `flake.lock` writer; FIX-11 (Phase 52) denies the
*fixer* `flake.lock`, a different actor, so state the distinction in the plan;
#12 Renovate PR bodies copy upstream release notes (third-party text) — keep
PR-body templating deterministic for the Phase 52 fixer prompt, which treats
them as framed data.

---

### F2 — `.github/dependabot.yml` (NEW, AUTO-03)

**Role:** Declarative updater config. Owns: weekly grouped `github-actions` PR
(one PR) + npm **security-only** updates scoped to `/theia`. Must not own:
version updates for npm (off), automerge, SHA-comment invention.

**Data flow:** input = GitHub Advisory DB + upstream action repos; output = one
grouped actions PR/week (SHA pins + plain `# vX.Y.Z` comments rewritten
together) + npm security PRs against `theia/yarn.lock`; downstream = same verify
path as F1 → owner weekly merge.

**Closest analogs:**

1. `.github/workflows/verify.yml:22-54` — the SHA-pin-with-plain-comment
   convention Dependabot must preserve:
   ```yaml
   on:
     push:
     pull_request:                                                     # verify.yml:24-26 (no schedule:)
   jobs:
     verify:
       runs-on: ubuntu-latest                                         # :30 (hosted label literal)
       permissions:
         contents: read                                              # :39-40
       steps:
         - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4.4.0  # :43 (pin + plain comment)
         - uses: cachix/install-nix-action@13d8dd58da0234aa297dedd986986ccb8e7f3e24 # v31.11.1  # :53
   ```
   **Compound comments (`# v4 # zizmor: …`) go stale** — Dependabot rewrites pin
   + plain comment together (FEATURES, 2022-10-31 changelog); keep pin comments
   plain (51-RESEARCH §8.2, pitfall #5).
2. `.github/workflows/rebase-upstream.yml:1-9` — the no-`schedule:` precedent
   with its rationale comment ("D-77: there is deliberately no `schedule:` key…
   the release train is the caller that runs this on a cadence"). Note:
   `dependabot.yml`'s own `schedule: {interval: weekly}` is Dependabot's native
   cadence key, not a workflow `schedule:` event — the `workflows` row parses
   `.github/workflows/*.yml` only, so it is unaffected; still, never add a
   workflow `schedule:` key alongside it (pitfall #1's sibling).
3. `scripts/verify-workflows.mjs:244-243` — the `uses-admitted` set-equality
   stays green across SHA bumps because the `owner/repo` set is unchanged; no
   new admission is needed for F2 (no new action).

**Pattern to follow:** 51-RESEARCH §11.2. `github-actions` `/` weekly group
`actions: {patterns: ["*"]}`, `open-pull-requests-limit: 5`; `npm` `/theia`
weekly security-only (`allow: [{dependency-type: all}]` constrained — exact key
per the live Dependabot schema at plan time; requirement text "version updates
off, security-only on" governs over schema drift — open question §15.3).

---

### F3 — `.github/settings/<code-security>.json` (NEW, AUTO-03; owner applies)

**Role:** Desired-state declaration for "Dependabot alerts on + CodeQL default
setup". Owns the bodies + comparators; the **owner** enables (plan ends with
exact owner commands, never applies live state).

**Data flow:** input = tracked JSON body (desired state); apply = owner-run
`gh api` writes (plan 41-04 pattern); read-back = `repo-controls` full-tier row
(F10) via GET endpoints resolved at plan time (open question §15.2); output =
green/red per control.

**Closest analogs:**

1. `scripts/verify-repo-controls.mjs:150-155` — the `projection` comparator new
   controls reuse (declared keys decide; GitHub-added keys never do):
   ```js
   function projection(c, declared, live) {
       if (!isObj(live)) return [`${where(c)}: the live response is ${show(live)}, not an object. ...`];
       return Object.keys(declared)
           .filter(k => !same(declared[k], live[k]))
           .map(k => `${where(c)}: ${k} is ${show(live[k])} live but ${show(declared[k])} declared. Next step: ${APPLY}.`);
   }
   ```
   With `APPLY = 'the owner runs node scripts/apply-repo-controls.mjs --yes from
   a terminal (plan 41-04)'` (`verify-repo-controls.mjs:43`).
2. Minimal-body precedent — `.github/settings/private-vulnerability-reporting.json`:
   ```json
   { "enabled": true }                                               # whole file
   ```
   and `.github/settings/fork-pr-approval.json` (`{"approval_policy":
   "all_external_contributors"}`), each read back by one CONTROLS entry
   (`verify-repo-controls.mjs:609-615`, `:575-580`) with plants
   (`:994` unreadable endpoint, `:998` disabled). New code-security bodies copy
   this one-key shape where the API allows it.
3. Settings-set equality — `verify-repo-controls.mjs:670-695` (`loadBodies`):
   an orphan body, a missing body, and an absent/empty dir are each red naming
   the file. So F3's bodies **and** F10's CONTROLS entries land in the same plan
   or the tree is red in between (orphan vs missing).
4. No code-security control exists today (grep-verified — `code-security`,
   `dependabot`, `codeql` appear nowhere in `verify-repo-controls.mjs` or
   `.github/settings/`); AUTO-03 must be declared-and-read-back like every other
   control (GH-02 pattern), not clicked in the UI (51-RESEARCH §1 step 4).

**Pattern to follow:** new CONTROLS entries with `write` = owner-step
(`write: null` + `ownerSteps`, the `org`/`apps` precedent at
`verify-repo-controls.mjs:630-645` — "Neither has a write endpoint … owner UI
steps, which planWrites lists instead of writing", `:384-386`), `read` = the
resolved GET path, `compare` = `projection` (or `compareEnvironments`-style only
if the endpoint is list-shaped). Languages: plan asserts default-setup coverage
of TS (`theia/extensions/**`) + JS (`scripts/**`) at minimum; no YAML file to
admit (`github_owned_allowed: true` already covers GitHub's own actions).
Self-test plants mirror the existing style: disabled body, unreadable endpoint,
each red naming the control.

**Pitfall:** #8 CodeQL silent disable — default setup auto-disables after ~6
months without a push; the `codeql-push-age` sweep row (F5) is the detector, not
an afterthought.

---

### F4 — `.github/settings/actions-selected.json` (MOD, AUTO-02)

**Role:** Trust-boundary admission set. Owns exactly the set of non-GitHub-owned
`owner/repo` prefixes workflows may use. Current content (whole file):

```json
{
  "github_owned_allowed": true,                                     # actions-selected.json:2
  "verified_allowed": false,                                        # :3
  "patterns_allowed": [
    "cachix/install-nix-action@*"                                   # :5
  ]
}
```

**Data flow:** F4 admits → F5's Renovate job consumes
(`renovatebot/github-action@<40-hex>` + `actions/create-github-app-token@<40-hex>`
for the bot-token mint, both SHA-pinned with plain comments) → `workflows` row
asserts set equality both directions.

**Closest analog:** `scripts/verify-workflows.mjs:187-243` (admission table
build + `uses-admitted` check) and `:339-341` (`admission-used`). Plus the
`requiresSelected` gate (`verify-repo-controls.mjs:163-169`): while
`allowed_actions` is not `selected`, GitHub answers 409 and the admission list
"does not apply" — plans keep `actions-permissions.json`
(`{"allowed_actions": "selected", "sha_pinning_required": true}`) untouched.

**Pattern to follow:** admit exactly the new `uses:` set — `renovatebot/github-action@*`
plus `actions/create-github-app-token@*` **only if** the Renovate job mints via
that action (it is `actions`-owned, so `github_owned_allowed: true` may already
admit it — resolve at plan time; an admitted-but-unused entry is red by
construction, pitfall #6). Verified current file admits only cachix, so a
Renovate job without this update is red by construction (51-RESEARCH §10.6).

---

### F5 — `.github/workflows/release-train.yml` (assumed Phase 43 file; MOD extension only, AUTO-02/TRAIN-04/TRAIN-11)

**Role:** Sweep tick handler + Renovate dispatcher + supersede actor + sweep
renderer host. Owns: dispatch Renovate on first tick after last-Thursday Theia
release + owner dispatch; cancel-pending-`release`-deployment on supersede;
six new TRAIN-11 rows. Must not own: detection math (F-assumed
`detect-upstreams.mjs`), descriptor bytes, any `schedule:` key (D-77 forbids),
stored state (issue body is a view).

**Data flow:** Worker hourly `reason=tick` → `report` job renders; Renovate
dispatch job (new, `ubuntu-latest`, `bot` environment, bot App token) runs F1's
flow; supersede path calls the pending-deployments cancellation with exactly
the ARCH §6 scopes (`dispatch-release`/`maintenance`), no new token.

**Closest analogs:**

1. `.github/workflows/rebase-upstream.yml:20-54` — the callable-with-explicit-input,
   no-default, least-privilege job shape to copy:
   ```yaml
   on:
     workflow_dispatch:
       inputs:
         tag: { description: "Upstream Firefox-ESR tag to rebase onto", required: true, type: string }  # :23-28
     workflow_call:
       inputs:
         tag: { description: "...", required: true, type: string }                                      # :29-34
   jobs:
     rebase:
       runs-on: ubuntu-latest                                       # :38
       timeout-minutes: 60                                         # :47
       permissions:
         contents: read                                            # :48-49
       steps:
         - uses: actions/checkout@11d5960a... # v4.4.0
           with: { persist-credentials: false }                     # :52-54
   ```
   New dispatch inputs validated by regex (tag-regex precedent, WR-07) before use;
   no `cache:` input, no `schedule:`, `persist-credentials: false` on checkout.
2. `.github/workflows/notify-drill.yml` (whole file, 25 lines) — the minimal
   environment-gated job shape (`runs-on: ubuntu-latest`, `environment: release`,
   `permissions: {}`, one `run:` step). The Renovate dispatch job mirrors this
   with `environment: bot` (bot App token, 1 h expiry — mint immediately before
   use, PITFALLS 8) on **hosted** runners only (bot App lacks Workflows, so a
   Renovate push touching `.github/workflows/` fails closed — by design, §8 table).
3. `scripts/verify-workflows.mjs:300-302` — `issues: write` admitted only on
   `release-train.yml` job `report`; the sweep renderer keeps that job and PATCHes
   the body only on byte-difference, commenting (+ @-mention/assign) only on
   transition into a red-needing-owner state (TRAIN-02 protocol).

**Sweep rows (TRAIN-11) — one object each, renderer PATCHes only on byte-difference:**

```js
// 51-RESEARCH §11.4 — assumed Phase 48 renderer shape; Phase 51 adds keys only:
{ key: 'renewals-due',     state: 'red',     evidence: 'docs/RENEWALS.md: Node 24 2028-04-30 ≤30d', since: '...' }
{ key: 'repo-controls',    state: 'ok',      evidence: 'repo-controls full-tier green ...',         since: '...' }
{ key: 'dependabot-prs',   state: 'ok',      evidence: '2 open (0 security)',                       since: '...' }
{ key: 'dependabot-alerts',state: 'ok',      evidence: '0 open',                                    since: '...' }
{ key: 'codeql-alerts',    state: 'ok',      evidence: '0 open; last push 3d ago',                   since: '...' }
{ key: 'codeberg-mirror',  state: 'no-data', evidence: 'mirror lands in Phase 53 (GH-04)',          since: '...' }
```

Row rules: `renewals-due` parses RENEWALS dates, red ≤30 days (quick `renewals`
row = structure only — CRITIQUE C19 split); `repo-controls` is full-tier daily;
Dependabot/CodeQL counts via App token (`dependabot-alerts: read`,
`security-events: read`); `codeql-push-age` guards the ~6-month auto-disable;
`codeberg-mirror` compares Codeberg `main` SHA (public API) vs GitHub `main`,
**no-data until Phase 53** (CONTEXT binding). Self-test: plant one red row →
exactly one comment (TRAIN-07 pattern); plant Codeberg-no-data → green-with-note,
no comment. Pitfall #10: `SUPERSEDED` rendering must not assign/mention beyond
the informational link — every two-week overlap paging the owner is a non-event
made noise.

---

### F6 — `scripts/release-train.mjs` (assumed Phase 43 file; MOD extension only, TRAIN-04)

**Role:** Pure state machine `derive(facts) → state`, `next(state) → action`,
`render(state) → issue body`. Owns: `SUPERSEDED` state, chemspill priority,
cancel-pending-deployment action, sign-job newer-Release exit contract,
tracking-issue supersede render. Must not own: stored state, `workflow_run`
chaining, attempt counts (labelled PRs).

**Data flow:** inputs = GitHub facts (ESR tags, open trains, pending
deployments, latest Release, merge SHAs); `derive` emits state; `next` emits at
most one transition action per release per run; `render` emits issue bytes.

**Closest analogs (in-tree structural precedents for a pure derive/compare module):**

1. `scripts/verify-repo-controls.mjs:126-148` — `project`/`canon`/`same`:
   derive-then-compare-as-set-equality is the house pattern F6's `derive` follows
   (supersede is derived-state, not stored — PITFALLS 8's 1 h token expiry and
   immutable tag-reuse are why).
2. `scripts/verify-workflows.mjs:147-350` — `runChecks(root, overrides)`: pure
   function over inputs with in-memory overrides, failures sorted deterministically
   (`:343-349`, "two runs over one tree print identical output"). F6's
   `derive`/`next`/`render` take the same shape so the self-test (F7) can run
   fixture API JSON with no network.
3. `scripts/verify-zizmor.mjs:40-54` — `resolveZizmor`/`runZizmor` fail-closed
   instrument precedent: a missing input is FAIL naming the prerequisite, never a
   skip (F6's `next` on unreadable facts behaves the same).

**Pattern to follow (51-RESEARCH §11.3):** `STATES` gains exactly one terminal
state `SUPERSEDED` (next to `DONE`/`WITHDRAWN`); `derive()` ordering, first match
wins: (1) chemspill revision (same ESR, revision+1) proceeds, (2) newer ESR tag
with open older train → older `SUPERSEDED`, (3) rest of Phase 43/50 ordering
unchanged; `next(SUPERSEDED)` cancels the pending `release` deployment via API
and links the new train with no owner assign; `render` writes "superseded by
<new key>" + link and follows the Phase 43 tracking-issue close/lock protocol
(do not invent a second one). Chemspill-withdraw still goes through
`descriptor-monotonic`, not around it (PITFALLS 7: `updateIsAtLeastAsOldAs`
accepts older buildID at equal version).

---

### F7 — `release-train-logic-self-test` (assumed; MOD fixtures only, TRAIN-04)

**Role:** Fixture table over F6's `derive`/`next`/`render`. Owns one fixture per
new state + supersede/chemspill/sign-exit plants.

**Closest analogs:**

1. `scripts/verify-workflows.mjs:466-507` — the `plants` array shape to copy:
   `[name, overrides, file, job, rule, value]` with the assertion "went red
   naming the file and job" (`:524-529`), plus green `controls` (`:513-519`,
   `:531-539`). F7's plants: newer-ESR-while-open, chemspill-vs-scheduled
   ordering, duplicate tracking issue under supersede, fork-head `workflow_run`
   during supersede, sign-job newer-Release exit (51-RESEARCH §8.4).
2. `scripts/verify-repo-controls.mjs:954-1015` — the plant catalogue style
   (`['name', mutation, ['needle-a', 'needle-b']]`) with needle-substring
   matching (`:1018-1026`). F7 copies the naming, not the bodies.
3. TRAIN-09 rule (REQUIREMENTS): "the state list derived from
   `release-train.mjs`'s state table and compared as set equality, so a state
   without a fixture, or a fixture without a state, goes red" — the same
   `admission-used` bidirectionality as §2.2.

---

### F8 — `release.yml` sign-publish guard (assumed Phase 50 file; MOD guard step only, TRAIN-04)

**Role:** Stale-approval race closer. First step of sign-publish compares its
version with the latest published Release and exits 0-with-note when a newer
Release exists (handles approve-stale-run at the two-week cadence — PITFALLS 8).
Supersede cancellation (F6) alone leaves the race; the sign exit alone leaves
the dangling deployment — both required (pitfall #11).

**Closest analog:** `.github/workflows/rebase-upstream.yml:119-143` — ordered,
commented gate steps ("THE ORDER … IS LOAD-BEARING", pre-check as fail-fast
`:107-115`, post-observation `:133-143`). The sign guard is the pre-step
fail-fast in the same style. Must respect the `write-trio` rule
(`verify-workflows.mjs:303-305`: trio-write only on `sign-publish`) and the
legion rules (guard runs on the hosted sign job, not legion).

---

### F9 — `scripts/verify-workflows.mjs` (MOD only if new trust rules needed)

**Role:** Trust-boundary row. Phase 51 extends its **plants only as needed** —
no new driver, no rule changes unless a new `uses:`/trigger/permission shape
appears.

**Data flow:** inputs = every `.github/workflows/*.yml|yaml` via `readdir`
(un-staged workflows checked too — header `:7`) + `actions-selected.json` +
`workflow-permissions.json`; output = sorted failures by file→job→rule or PASS
with counts (`:352-364`).

**Closest analog (itself — extension points):**

- Rule catalogue `:15-56` (add a rule name + implementation + self-test plant
  together, or not at all); `RULES` array `:96` (printed in the PASS line).
- In-memory plants via `runChecks' overrides` (`:63-65`): "This script and its
  `--self-test` only read the tree; every plant is applied in memory" — F5's new
  dispatch job needs **no** script change if it uses only already-covered shapes
  (hosted `runs-on`, SHA pins, `bot` environment, guarded `workflow_run`); the
  self-test's good-`release.yml` fixture (`:391-419`) and `assist`/`wfRun`
  builders (`:429-460`) are the templates if a plant is added.
- `HOSTED = /^(ubuntu|windows|macos)-[\w.-]+$/` (`:98`): Renovate/sweep jobs
  match `ubuntu-latest` — no regex change.

**Pattern to follow:** prefer zero changes. If F5 introduces a shape no rule
covers, add the rule + plant + control in one commit, following the
`['name', overrides, file, job, rule, value]` row format (`:466-507`).

---

### F10 — `scripts/verify-repo-controls.mjs` (MOD: CONTROLS entries + plants, AUTO-03)

**Role:** Desired-state read-back. Owns the new code-security/Dependabot
CONTROLS entries, comparators, and self-test plants (in-memory, no network).

**Data flow:** inputs = tracked bodies under `.github/settings/` + live `gh api`
GETs pinned to `X-GitHub-Api-Version: 2022-11-28` (`:42`); settings-set equality
(`:660-695`) → per-control gate/read/compare; output = failures naming
`control (file): key is <live> but <declared>` or PASS with compared list.

**Closest analogs (itself — extension points):**

1. CONTROLS table `verify-repo-controls.mjs:551-646` — the full registry:
   one-file controls (`actions-permissions` … `:552-558`, with `gate:
   requiresSelected` for the 409 case at `:163-169`), the multi-file
   `environments` control (`:582-588` with `envNames`/`compareEnvironments`
   `:192-252` + `planEnvironments` `:257-276`), the `ruleset()` factory
   (`:538-545`), write-less owner-step controls (`org`/`apps` `:630-645` with
   `OWNER_STEP` `:390`). New entries append in apply order (comment `:547-550`:
   "environments sit directly before the rulesets… The repo PATCH stays last").
2. `compareApps` (`:407-448`) — the exact comparator shape for permission-set
   read-back: Workflows-holding installation red (`:412-414`), undeclared
   installation red (`:416-418`), exact permission match (`canon(inst.permissions)
   !== canon(a.permissions)`, `:426-428`), repository-list set diff (`:433-445`).
   The Dependabot/CodeQL read-back copies this structure against its endpoints.
3. `fakeState` (`:790-814`) + `fakeEnvironments`/`fakeRulesets` (`:818-893`) +
   `getterOf` (`:895-897`): "The live state the declared bodies would produce,
   in GitHub's response shape, with the extra keys GitHub adds so the
   projection is exercised" (`:788-789`). New controls add their live shape here
   **including** GitHub's extra keys; plants (`:954-1015`) + controls
   (`:1029-1037`) + `planWrites` order assertions (`:1048-1076`) extend in the
   same style. Fail closed on non-2xx/unauthenticated/unparseable (`:60-74`,
   `safeGetter` `:78-97`).

---

### F11 — `scripts/verify-platform.sh` (MOD: registry rows, all requirements)

**Role:** The one driver. Every new check is one `label|command` row + a
`--self-test` sibling; expectations derived at check time, set-equality, never
hand-kept lists (CLAUDE.md Verification rules 1–2).

**Closest analogs (itself):** §2.1 rows; the `CHECKS`/`CHECKS+=` declaration
structure (`:3573` quick array, `:4734` full array); `--only` dispatch
(`:5104-5119`); external invocations under `setsid` (`:5134-5144`).

**Candidate rows (prefer extending existing scripts over new ones — 51-RESEARCH §1 step 8):**

```bash
# If a new script is justified (else extend the workflows/repo-controls rows):
"renovate-config|node $REPO_ROOT/scripts/verify-renovate-config.mjs"              # 51-RESEARCH §11.5
"renovate-config-self-test|node $REPO_ROOT/scripts/verify-renovate-config.mjs --self-test"
# Preferred — no new scripts:
#   workflows (+self-test) — new uses:/trigger/permission shapes (F5, F9)
#   repo-controls (+self-test) — new CONTROLS entries (F3, F10)
#   release-train-logic-self-test — SUPERSEDED/chemspill/sign-exit fixtures (F7)
#   sweep self-test — one red row → exactly one comment; Codeberg-no-data → green-with-note (F5)
```

---

### F12 — `docs/RELEASING.md` (MOD text, DIST-05 + TRAIN-04 ordering)

**Role:** Operator manual. Owns: two-week cadence text, ESR-calendar pointer,
npm-advisory path + response time (defines the sweep's red threshold — keep the
number in one place, reference it from the row), chemspill-vs-scheduled ordering
rule (if the Phase 43 doc doesn't already state it), sweep red thresholds +
CodeQL push-age warning age (owner-decided, open question §15.5).

**Closest analog (itself — stale text to fix):**

```markdown
One release per ESR point release, roughly every four weeks, plus out-of-cycle   # docs/RELEASING.md:728 (STALE)
security releases. ...
```

DIST-05 plans fix "four weeks" → "two weeks" at `RELEASING.md:728` **together
with** `README.md:46-47` + `rebase-upstream.yml:1-4` per DOC-03 (pitfall #14 —
fix all three or the doc row stays red-by-stale-text), with the ESR 153 calendar
(External Gates: 153.6 on 2026-10-27, then every two weeks) authoritative for
dates. No `release.json`, no homepage version facts (decision 13). Related live
precedent: `flake.nix:14-22` documents *why* `nodejs_24` is pinned (PITFALLS #7);
RELEASING text should explain with the same "reason, not just value" density.

---

### F13 — `docs/RENEWALS.md` (assumed Phase 42 file; MOD one row, UPS-02)

**Role:** Renewal calendar. Owns the row: `Node 24 Maintenance end —
2028-04-30 — owner action: track AUTO-04 detector / plan ESR-175-era Node move`.

**Data flow:** row feeds two readers — the quick `renewals` row (structure only)
and the sweep `renewals-due` row (dates ≤30 days red; F5). If the file is still
absent at execution, record the missing premise; do not redefine DOC-04.

**Closest analogs:** `powerbrowser/packaging/node-runtime.json` (packaged
`v24.19.0`, SHASUMS-verified pin — the live version the row watches) +
`flake.nix:21` (`nodejs = pkgs.nodejs_24`) + `theia/package.json:59-62`
(`engines.node >=24`): the `node-major-agreement` row (`verify-platform.sh:4621-4626`,
"the packaged Node major in node-runtime.json agrees with flake.nix's nodejs_NN,
and both meet theia/package.json engines.node … three text reads") already
watches the Node-major triangle; the RENEWALS row watches the calendar end.
Default: no new credential rows — Renovate reuses the bot App token whose key
has no expiry (51-RESEARCH §8.6).

---

### F14 — `scripts/generate-licensing.mjs` (USE, do not modify; AUTO-02 via PKG-08)

**Role:** Notices re-derivation inside the Theia-bump flow. Interface (header
`:24-34`, `NAME = 'licensing'` at `:49`):

```
node scripts/generate-licensing.mjs              # write both files (temp file + rename each)
node scripts/generate-licensing.mjs --check      # re-derive in memory; fail naming file + first differing line
node scripts/generate-licensing.mjs --self-test  # hermetic fixtures in a temp dir
```

`--check` runs python over `upstream/` and reads files — no build/browser/display/
network (`:31-34`); the Renovate `postUpgradeTasks` hook (§F1) runs the write
mode so the first Theia PR doesn't go red on the `licensing` row
(`verify-platform.sh:4699-4705`). Inputs: `configuration.toml` via
`resolveConfig()`, preprocessed about:license, the Theia production closure
(`@powerbrowser/*` walked but not listed), the pinned Node LICENSE
(SHA-checked). Never hand-edit notices output.

---

## 4. Settings bodies read-only in Phase 51 (assert, don't widen)

| Body | Content (verified) | Phase 51 implication |
|---|---|---|
| `app-powerbrowser-bot.json` | Contents/PRs/Issues write, Administration + vulnerability-alerts read, **no Workflows**; repos `powerbrowser`, `powerbrowser-updates`, `homebrew-tap` | Renovate-with-bot-token inherits no-Workflows: pushes touching `.github/workflows/` fail closed (F5 keeps the Renovate flow out of workflows) |
| `environment-bot.json` | `deployment_branch_policy` custom-only (no reviewers/timer) | Renovate dispatch job's environment |
| `environment-descriptor.json` | `wait_timer: 1440` + owner reviewer | Supersede cancels this env's pending deployments; sign-exit guards stale approvals |
| `workflow-permissions.json` | `default_workflow_permissions: read`, no approve | Effective-permission baseline the `workflows` row assumes |
| `org.json` / `fork-pr-approval.json` / `repo.json` / `actions-permissions.json` | 2FA on, single owner (Phase 41 step); `all_external_contributors`; discussions+auto-merge on; `selected` + `sha_pinning_required` | Untouched; second owner + App installs remain Phase 41 owner steps |

## 5. Owner enable/merge checklist (every plan ends with these; plans never execute them)

Per 51-CONTEXT owner gates: enabling CodeQL default setup, enabling Dependabot
alerts, merging the first Renovate `@theia/**` PR, merging the first grouped
Dependabot PR, and any live GitHub setting change are **owner actions**. Plans
build everything locally and end with exact owner merge/enable commands
(`gh api` PUTs via `apply-repo-controls.mjs --yes` from the owner's terminal,
`gh pr merge`, enablement clicks/probes). Read-only `gh api` GETs are allowed
for research and read-back rows. No push, no dispatch, no live apply from plans.

## 6. Open questions plans must close (51-RESEARCH §15, Phase 51 subset)

1. **Flag F:** wall/RAM/disk of a Theia-minor `yarn install` + licensing regen
   under `nix develop .#theia` → Renovate job `runs-on` + `timeout-minutes`.
2. CodeQL default-setup settings endpoints/bodies at execution time (probe read
   endpoints first, then write bodies + comparators to match).
3. Dependabot npm security-only schema key at execution time (requirement text governs).
4. Renovate datasource anchor: `@theia/core` single anchor vs per-package mapping
   (confirm lockstep per Theia release).
5. Sweep red thresholds (Dependabot-PR count, alert counts, CodeQL push-age) —
   owner-decided, recorded in RELEASING next to the npm-advisory response time.
6. nixpkgs-input coupling: separate Theia-group vs nixpkgs-input paths by default;
   couple only with `toolchain-baseline.txt` re-measurement + inkscape
   byte-identity re-proof.

Carried (not 51's): 60-day-rule vs bot commits (watchdog repo only), 500 MB
artifact cap, and the H/I/A3/L items listed in §15.8 — 51 plans must not absorb them.

---

*Pattern mapping complete. Planner entry: start with 51-RESEARCH §1 steps 1–4
(configs + admission + settings bodies + supersede fixtures), keep every new
check inside the existing registry/scripts per §8, and end every plan with the
owner enable/merge commands per §3 above.*
