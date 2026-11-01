# Phase 52: Claude fixer (F) - Pattern Map

**Mapped:** 2026-10-23
**Files analyzed:** 11 / **Analogs found:** 10/11
**Research flag F:** RESOLVED → WIF `id-token: write`-only path (proof in 52-RESEARCH.md §12)

All analog paths below are git-tracked source (verified with `git ls-files`; never mirror paths like `.gsd/` or `node_modules`). Excerpt shapes reuse the pattern established by Phase 41's `41-PATTERNS.md` (verified: `.planning/workstreams/deploy/phases/41-repository-controls-and-github-apps-a/41-PATTERNS.md:1-168`).

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `.github/fix-gate-deny.json` (NEW, FIX-11 list) | config | declared state read by gate + self-test | `inventory/brand-tokens.json` (single token source read by `scan-brand-residue.mjs`) + `.github/settings/actions-selected.json` (`patterns_allowed` shape, git-tracked) | role-match |
| `scripts/verify-fix-gate.mjs` (NEW, FIX-07/FIX-11 gate + `--self-test`) | test/gate | transform (diff artifact → verdict artifact; file-I/O + subprocess) | `scripts/verify-update-channel.mjs` (332 lines: header, injectable reads, `runChecks`+overrides, plant/control) + `scripts/verify-workflows.mjs` (rule catalogue + plants table + `good-release.yml` fixture) | exact shape |
| `scripts/verify-platform.sh` row `fix-gate-self-test` (MODIFY, registry) | config/registry | — | its own Phase 41 rows at `scripts/verify-platform.sh:4706-4730` (`repo-controls-self-test`, `workflows`, `workflows-self-test`, `zizmor`, `zizmor-self-test`) | exact |
| `scripts/verify-workflows.mjs` (MODIFY, additive FIX-08/FIX-09 rules + plants) | test/gate | transform (YAML parse + derive/compare) | itself (`scripts/verify-workflows.mjs:15-65` rule list, `:292-297` claude-code-action rule, `:320-327` event-text, `:366-543` selfTest) | exact |
| `.github/settings/actions-selected.json` (MODIFY, admit fixer actions) | config | declared state | itself, git-tracked (`{"github_owned_allowed": true, "patterns_allowed": ["cachix/install-nix-action@*"]}`, verified: `.github/settings/actions-selected.json:1-7`) | exact |
| `.github/workflows/release-train.yml` `fix`/`fix-gate`/`fix-pr` jobs (NEW FILE content, three-job chain) | input/automation | artifact-only handoffs, never credentials | `.github/workflows/verify.yml:22-53` (job shape: `runs-on`, `permissions`, `timeout-minutes`, pinned `uses:` anchors, Nix-wrapped steps) + `.github/workflows/rebase-upstream.yml:22-34` (`workflow_call`/`workflow_dispatch` tag inputs with no default; `persist-credentials: false` posture) | exact shape |
| `scripts/fixer-prepare.sh` (NEW, tiny: fetch upstream at tag, rebase markers, regenerate only) | utility | file-I/O + subprocess (no network beyond fetch) | `scripts/regenerate-patches.sh:1-40` (regeneration semantics, `--check` ±-only compare, 10-hex pins, never text-edit hunks) + `scripts/rebase-upstream.sh` (regeneration, not text-edit) | role-match |
| `scripts/fix-open-pr.mjs` (NEW, template-renders PR body, pushes branch, opens labelled PR, assigns owner) | utility | request-response (`gh api` writes via short-lived App token) | `scripts/apply-repo-controls.mjs:20-42` (arg parse + `spawnSync('gh', …)` write shape; verified via `scripts/download-plugins.mjs:19` `spawnSync` precedent) | partial (no `gh api` PR-opener exists in tree) |
| `scripts/release-train.mjs` additions: NEEDS_OWNER row + FIX-01 dispatch + fixtures (MODIFY, Phase 43 owns file — contract + fixtures only here) | state machine addition | derive-from-facts (`derive`/`next`/`render` pure functions) | none in tree (file does not exist yet; CONTEXT A2; Phase 43 lands the skeleton) — see No Analog Found | none, use RESEARCH §9.5 contract |
| `docs/RELEASING.md` sections (MODIFY: auth outcome, spend limits, support) | docs | — | itself (settings/automation sections, verified: `docs/RELEASING.md:306-360`) | exact |
| `docs/RENEWALS.md` rows (NEW: fixer/triage workspace, fallback key, MAR-adjacent dates) | docs | — | `docs/RELEASING.md` secrets-inventory table shape (`docs/RELEASING.md:531-545`); file itself does not exist yet (`git ls-files` reports ABSENT) | role-match |

DO NOT create: any second verify driver (`scripts/verify-platform.sh` is the one driver); any `scripts/verify-ng-NNN-*.mjs` (hash-locked, read-only); `ledger/` (owner-locked); any new workflow-verifier script (extend `verify-workflows.mjs`, do not fork); any stored attempt-counter state (derive from `fix` run-names + `claude-fix` labels every run).

Load-bearing control facts the classification rows assume (all git-tracked, verified this session):

- Bot App `powerbrowser-bot` (`.github/settings/app-powerbrowser-bot.json:1-17`): `contents: write`, `pull_requests: write`, `issues: write`, `administration/metadata/vulnerability_alerts: read`, **no `workflows` permission** (FIX-03/FIX-04 load-bearing; `repo-controls` asserts no installed App holds `workflows`).
- `main-review` (`.github/settings/ruleset-main-review.json`): exactly 1 approving review, `dismiss_stale_reviews_on_push: true`, required `verify` check, bypass `OrganizationAdmin/always` only. `main-integrity` (`ruleset-main-integrity.json`): `bypass_actors: []` — binds the owner too. `release-tags` bypass: `Integration/app:powerbrowser-bot` only.
- `repo.json`: `allow_auto_merge: true` — the ruleset (owner-only bypass, App-as-author cannot self-approve) is what still gates a fixer self-merge, not the auto-merge flag.
- All five env files (`environment-bot/fixer/triage/descriptor/release.json`) carry `custom_branch_policies: true` (branch-`main` restriction mechanism; verified: `environment-fixer.json:1-6`); the `environment-branch-policy-main.json` body is `{"name": "main", "type": "branch"}`.

## Pattern Assignments

### 1. `scripts/verify-platform.sh` — registry row shape + insertion point

**Analog:** own Phase 41 rows, `scripts/verify-platform.sh:4706-4730` (quick) and `:5088-5092` (full).

Append inside the quick `CHECKS=(` array, **after** the `zizmor-self-test` row (line 4730) and **before** the closing `)` at 4731. Shape (copied from lines 4706-4711 and 4712-4721):

```sh
    # NEW (Phase 41, GH-02): repo-controls-self-test serves the declared .github/settings/
    # bodies back in GitHub's live response shape and plants each widening -- allowed_actions
    # all, sha_pinning_required false, an orphan, missing or empty settings set, and a getter
    # that throws -- each red naming the control. Honestly --quick: in-memory, with no network
    # and no gh; it writes nothing. The live read-back is the full-tier repo-controls row.
    "repo-controls-self-test|node $REPO_ROOT/scripts/verify-repo-controls.mjs --self-test"
```

New row follows the same shape:

```sh
    # NEW (Phase 52, FIX-07/FIX-11): fix-gate-self-test serves a green control diff,
    # then one planted diff per .github/fix-gate-deny.json entry (plant list read from
    # the deny file itself) plus a hand-edited hunk and a registry-named-file touch;
    # each rejected naming the path. Honestly --quick: in-memory fixture plus the
    # hermetic gate chain (apply -> deny filter -> --check replay -> non-vacuity ->
    # check-patch-surface -> scan-brand-residue -> diff-theia-core.sh -> --quick);
    # no build, browser, display or network. It writes nothing.
    "fix-gate-self-test|node $REPO_ROOT/scripts/verify-fix-gate.mjs --self-test"
```

No full-tier row: the gate script itself is the `--quick` row (like `workflows`/`zizmor`); there is no live endpoint to read back (contrast `repo-controls` full-tier row at 5092 with its "Full tier: read-only gh api" comment). `--only fix-gate-self-test` dispatch works through the existing `--only` filter (lines 5104-5119); external invocations run under `setsid` (lines 5135-5137).

### 2. `scripts/verify-workflows.mjs` — FIX-08/FIX-09 rule + plant shape

**Analog:** itself. Rule catalogue header (`scripts/verify-workflows.mjs:15-65`), `RULES` array (line 96), `claude-code-action` block (lines 292-297), `event-text` block (lines 320-327), plants table + controls (lines 466-519).

Additive rules only — extend `RULES`, never fork the file. New rule blocks follow the existing `fail(rel, jobId, rule, msg)` shape with `Next step:` closers:

```js
// FIX-08: pin + executable + output flags (additive; existing uses-pinned stays).
// fail(rel, jobId, 'fixer-pin', ...) when a step using anthropics/claude-code-action@
// is not exactly @db77d4d3c98f3f6380e7cd45ffba2342a3dbde3c, or lacks
// path_to_claude_code_executable, or sets show_full_output/display_report true.
// fail(..., 'fixer-debug', ...) when ACTIONS_STEP_DEBUG appears in any fixer job env.
```

```js
// FIX-09: tool allowlist + prompt hygiene (additive; existing event-text stays).
// fail(rel, jobId, 'fixer-tools', ...) when the fix job's claude_args lacks an
// explicit --allowedTools list or carries a bare `Bash` entry (unscoped Bash);
// fail(..., 'fixer-prompt', ...) when WebFetch/WebSearch are not denied, when a
// fixer job starts on claude-fix/* heads or for the bot actor, or when
// allowed_bots is '*' instead of the explicit list.
```

Plant shape (copied from lines 466-507 — `[name, overrides, file, job, rule, value]`):

```js
['claude-code-action tag object instead of commit pin', edit(ASSIST_FIX, COMMIT_SHA, 'anthropics/claude-code-action@c335fd6d...'), rel('release-train.yml'), 'fix', 'fixer-pin', 'db77d4d3'],
['missing path_to_claude_code_executable', edit(...) /* strip the key */, rel('release-train.yml'), 'fix', 'fixer-pin', 'path_to_claude_code_executable'],
['show_full_output true', edit(...) /* false -> true */, rel('release-train.yml'), 'fix', 'fixer-pin', 'show_full_output'],
['ACTIONS_STEP_DEBUG set on fix', edit(...) /* add env */, rel('release-train.yml'), 'fix', 'fixer-debug', 'ACTIONS_STEP_DEBUG'],
['bare Bash in claude_args', edit(...) /* scoped Bash(...) -> bare Bash */, rel('release-train.yml'), 'fix', 'fixer-tools', 'Bash'],
['allowed_bots star', edit(...) /* explicit list -> '*' */, rel('release-train.yml'), 'fix', 'fixer-prompt', "allowed_bots"],
```

Controls to keep green (extend lines 512-519): hosted read-only `claude-code-action` job; the good `fix`/`fix-gate`/`fix-pr` triple over a `GOOD_TRAIN` fixture (mirrors the `GOOD_RELEASE` fixture at lines 391-420: literal YAML string joined with `'\n'`, job builder `job(id, lines)`, `with_`/`edit`/`append` overrides). Job fixtures reference `H40 = 'abcdef0123456789abcdef0123456789abcdef01'` for non-fixer pins; the fixer SHA `db77d4d3c98f3f6380e7cd45ffba2342a3dbde3c` is the literal under test and must be spelled in full (UPD-11 precedent: `release-identity` spells full pins, and the `uses-pinned` plants at lines 468-472 assert exact 40-hex).

Admission change rides in the same plan: `actions-selected.json` gains exactly two entries —

```json
"patterns_allowed": [
    "cachix/install-nix-action@*",
    "anthropics/claude-code-action@*",
    "actions/create-github-app-token@*"
]
```

— so `admission-used` set-equality (lines 339-341) stays green only when `release-train.yml` uses both. `attest-build-provenance` admission arrives via Phase 41 per CONTEXT A1; do not add it here.

js-yaml loading stays as-is (lines 88-94): `createRequire(join(REPO_ROOT, 'theia', 'package.json'))('js-yaml')`, fail closed with "broken instrument … (run yarn install in theia/ first)".

### 3. `scripts/verify-fix-gate.mjs` — gate script main/selfTest shape

**Analog:** `scripts/verify-update-channel.mjs:1-60` (header, imports, `REPO_ROOT`/`NAME`/`SELF_REL`, strict arg parse), `:122-153` (injectable reads), `:246-257` (main), `:259-330` (selfTest: green baseline, plants table, controls).

Header comment (numbered derivation chain, mirroring update-channel lines 1-39): what the gate derives and compares, ending with the same contract line — "This script and its --self-test only read the tree (plus the supplied diff artifact); every plant is applied in memory through runChecks' overrides."

```js
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'fix-gate';
const SELF_REL = 'scripts/verify-fix-gate.mjs';
const DENY_REL = '.github/fix-gate-deny.json';

const args = process.argv.slice(2);
for (const a of args) {
    if (a !== '--self-test' && !a.startsWith('--diff=') && !a.startsWith('--tag=')) {
        console.error(`${NAME}: FAIL -- unknown argument '${a}'`);
        console.error(`  Next step: run: node ${SELF_REL} --diff work.diff --tag <target-tag>, or add --self-test to prove the gate discriminates.`);
        process.exit(2);
    }
}
```

Injectable reads (mirrors update-channel lines 122-139 and repo-controls `safeGetter` at `verify-repo-controls.mjs:79-97`):

```js
function readText(root, rel) {
    try {
        return readFileSync(join(root, rel), 'utf8');
    } catch {
        return null;
    }
}

function listTracked(root) { /* git ls-files, null on failure */ }

function runChecks(root, overrides = {}) {
    const failures = [];
    const read = overrides.read ?? ((rel) => readText(root, rel));
    const deny = overrides.deny ?? JSON.parse(read(DENY_REL));
    // 1. path filter: diff ---/+++ paths vs deny globs + registry-derived set
    //    (parsed from verify-platform.sh CHECKS rows + referenced scripts/*.mjs at gate time)
    // 2. apply diff to a fresh checkout of the target branch (never fix's workspace)
    // 3. regenerate-patches.sh --check fresh replay byte-compare (CR-01 ±-only on moved files)
    // 4. apply non-vacuity (zero files changed = FAIL, cf. update-channel check 3)
    // 5. check-patch-surface -> scan-brand-residue -> diff-theia-core.sh -> --quick
    return { failures, verdict: failures.length === 0 ? 'pass' : 'reject' };
}
```

main / PASS-FAIL output (mirrors update-channel lines 246-257 and workflows lines 354-364):

```js
function main() {
    if (args.includes('--self-test')) return selfTest();
    const { failures, verdict } = runChecks(REPO_ROOT);
    if (failures.length > 0) {
        console.error(`${NAME}: FAIL -- ${failures.length} problem(s) with the fix diff; verdict: reject.`);
        failures.forEach(f => console.error(`  ${f}`));
        return 1;
    }
    console.log(`${NAME}: PASS -- verdict: pass; <n> file(s) gated, chain <steps> green`);
    return 0;
}
...
process.exit(main());
```

selfTest (mirrors update-channel lines 259-330 and workflows lines 366-543):

```js
function selfTest() {
    const files = listTracked(REPO_ROOT); // or the hermetic mkdtemp fixture, cf. regenerate-patches.sh --self-test
    const baseline = runChecks(REPO_ROOT, { /* green control diff */ });
    if (baseline.failures.length > 0) {
        console.error(`${NAME}: --self-test FAIL -- the unmodified tree is already red, so the planted-fault results below would mean nothing:`);
        ...return 1;
    }
    console.log(`  ok  baseline -> green`);
    // plants: one per DENY_REL entry (list read from the file itself — never hand-kept),
    // plus each registry-row-named file, plus a hand-edited hunk (regenerate --check red).
    const plants = [ [name, overrides, file, value], ... ];
    for (const [name, overrides, file, value] of plants) {
        const { failures } = runChecks(REPO_ROOT, { files, ...overrides });
        const hit = failures.some(f => f.includes(file) && f.includes(value));
        if (hit) console.log(`  ok  ${name} -> red, naming '${file}' and '${value}'`);
        else { console.error(`${NAME}: --self-test FAIL -- '${name}' did not go red ...; got: ${failures.join(' | ') || '(no failures at all)'}`); failed += 1; }
    }
    // control: a docs-only diff touching none of the deny entries stays green.
}
```

Ordering constraint (Wave 0): the deny file lands before this script; this script lands before the registry row and before any workflow file references the gate.

### 4. `.github/fix-gate-deny.json` — deny JSON shape

**Analog:** `.github/settings/actions-selected.json` (admission-list JSON, git-tracked) + `inventory/brand-tokens.json` (single token source; scan reads it, never a hand-kept copy). Body prescribed by RESEARCH §9.4 (mirrors FIX-11 verbatim):

```json
{
  "version": 1,
  "paths": [
    ".github/**",
    ".claude/**",
    "CLAUDE.md",
    "scripts/verify-platform.sh",
    "patches/030-*",
    "powerbrowser/packaging/mar/**",
    "brand/mar-*.der",
    "inventory/brand-tokens.json",
    "powerbrowser/endpoint-allowlist.json",
    ".github/settings/actions-selected.json",
    "quick-baseline.txt",
    "toolchain-baseline.txt",
    "flake.lock"
  ],
  "notes": "Plus every file a verify-platform.sh registry row names, derived by parsing the registry at gate time (never hand-kept). Entries are path globs matched against the unified diff's ---/+++ paths."
}
```

Both the gate and `fix-gate-self-test` read this file; a deny entry without a corresponding plant (or vice versa) is a self-test failure (derive-don't-hand-keep). F1 explicitly excepts `patches/030-*` at dispatch time (the fixer may regenerate it through `regenerate-patches.sh` only — the gate still rejects hand edits via `--check`).

### 5. `release-train.yml` `fix` / `fix-gate` / `fix-pr` job YAML shape

**Analog:** `.github/workflows/verify.yml:22-53` (name/on/jobs, `runs-on: ubuntu-latest`, `timeout-minutes`, `permissions:`, pinned `uses:` with `# vX.Y.Z` comments, `persist-credentials: false`, Nix-wrapped `run:`) + `rebase-upstream.yml:22-34` (`workflow_dispatch` + `workflow_call` inputs, `required: true`, no defaults) + `notify-drill.yml` (`permissions: {}` + `environment:` shape for a secretless/minimal job).

Pinned SHAs (exact; RESEARCH §5 stack): `actions/checkout@11d5960a326750d5838078e36cf38b85af677262` (v4.4.0), `cachix/install-nix-action@13d8dd58da0234aa297dedd986986ccb8e7f3e24` (v31.11.1), `anthropics/claude-code-action@db77d4d3c98f3f6380e7cd45ffba2342a3dbde3c` (v1.0.254, NOT the tag object), `actions/create-github-app-token@64ab729a6294000f5aa4a4bc0b73d1f32bc45510` (v3.3.0), `actions/upload-artifact` / `actions/download-artifact@v8.0.2` (SHA-pinned per `actions-selected.json` at plan time).

`fix` job (FIX-03/04/06/08/09/12; full skeleton in RESEARCH §9.1):

```yaml
  fix:
    runs-on: ubuntu-latest            # hosted only (FIX-04; legion rule asserts)
    environment: fixer                # branch-main only (custom_branch_policies)
    concurrency: claude-fixer         # own group, separate from release-train
    timeout-minutes: 90
    permissions:
      contents: read
      actions: read
      id-token: write                 # WIF HERE ONLY (F flag resolved); fallback path has NO id-token anywhere
    if: >-
      github.event.workflow_run.head_repository.full_name == github.repository &&
      !startsWith(github.event.workflow_run.head_branch, 'claude-fix/') &&
      github.actor != 'powerbrowser-bot[bot]'
    steps:
      - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4.4.0
        with:
          persist-credentials: false
          ref: main                   # trusted root: .claude/ + CLAUDE.md (FIX-06)
      - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4.4.0
        with:
          persist-credentials: false
          ref: ${{ inputs.target-branch }}
          path: work                  # untrusted target, never the workspace root
      - uses: cachix/install-nix-action@13d8dd58da0234aa297dedd986986ccb8e7f3e24 # v31.11.1
      - name: Resolve conflict markers, regenerate only
        run: nix develop .#theia --command bash scripts/fixer-prepare.sh
      - uses: anthropics/claude-code-action@db77d4d3c98f3f6380e7cd45ffba2342a3dbde3c # v1.0.254
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}   # suppresses the action's own App-token OIDC exchange (F flag)
          anthropic_federation_rule_id: ${{ vars.ANTHROPIC_FEDERATION_RULE_ID }}
          anthropic_organization_id: ${{ vars.ANTHROPIC_ORGANIZATION_ID }}
          path_to_claude_code_executable: /opt/claude-pinned/claude  # exact pinned version, integrity-checked
          allowed_bots: 'renovate[bot],powerbrowser-bot[bot]'         # explicit, never '*'
          show_full_output: false
          display_report: false
          prompt: ${{ inputs.trusted-prompt }}    # trusted fields only; untrusted log/diff as framed data file
          claude_args: '--max-turns 40 --allowedTools "Bash(git -C work diff:*),Bash(scripts/regenerate-patches.sh:*),Bash(scripts/verify-platform.sh --quick),Edit(work/**),Read"'
```

`fix-gate` (no secrets; RESEARCH §9.2): `needs: fix`, `runs-on: ubuntu-latest`, NO `environment:`, NO `secrets.*`, NO `id-token`, `permissions: contents: read`; fresh checkout at `inputs.target-branch` + `download-artifact` + Nix + `node scripts/verify-fix-gate.mjs --diff work.diff --tag "${{ inputs.target-tag }}"`. `fix-pr` (RESEARCH §9.3): `needs: fix-gate`, `if: needs.fix-gate.outputs.verdict == 'pass'`, `environment: bot`, `permissions: {}`, sole `create-github-app-token` minter (`permission-contents: write`, `permission-pull-requests: write`, NO `workflows`), then `node scripts/fix-open-pr.mjs` with `GH_TOKEN` from the App step (pushes `claude-fix/<key>-<n>`, labels `claude-fix` + `release:<key>`, template body, assigns owner; never merges/approves).

Attempt counting (FIX-05): `fix` job `run-name: "fix ${{ inputs.release-key }} ${{ inputs.class }} attempt ${{ inputs.attempt }}"`; `derive` lists `fix` runs by name prefix per (key, class) — gate-rejected runs count because the count is over `fix` runs, not `fix-pr` outcomes; third failure → NEEDS_OWNER (TRAIN-03 row this phase adds).

### 6. `scripts/fixer-prepare.sh` — regeneration-only prep

**Analog:** `scripts/regenerate-patches.sh:1-40` (header: "--check re-derives every tracked patch … so a hand edit goes red"; `set -euo pipefail`; `REPO_ROOT` resolution; `fail()` with `Next step:`) + `scripts/check-patch-surface.sh:39-70` (`scan_patch_surface` reading target paths from the patch's own `+++ b/` headers, never body-grep).

Shape: `#!/usr/bin/env bash` + `set -euo pipefail` + `REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"` + `fail()` helper + strict arg parse (`--tag` required, unknown args exit 2). Body: fetch upstream at `inputs.tag`, enter `work/`, surface conflict markers, run `regenerate-patches.sh` (the only patch path; never text-edit hunks — CLAUDE.md hard rule), emit `work.diff` via `git -C work diff` excluding `upstream/`. No network beyond the fetch; no secrets read. `--self-test` analogue is the staged red-branch drill (VALIDATION manual row), not a flag on this script.

### 7. `scripts/fix-open-pr.mjs` — template-renders the fix PR

**Analog:** `scripts/apply-repo-controls.mjs:20-42` (subprocess `spawnSync('gh', …)` write shape from `scripts/download-plugins.mjs:19`; dry-run/`--yes` discipline becomes `--self-test`/run discipline here) + `docs/RELEASING.md` user-copy rule (no internal identifiers in prose; SHAs/diffs in labelled rows).

Shape: `runChecks`-free renderer — pure `renderBody(summary)` (failing check, diff stat, paths, attempt count, gate log link) + `gh api` POST via `spawnSync('gh', ['api', …], { encoding: 'utf8' })` with `GH_TOKEN` from the App-token step; `r.status !== 0` → FAIL naming the endpoint with `Next step:` (mirrors `apply-repo-controls.mjs:73-80`). `--self-test` renders the template over a fixture summary and asserts: no model prose passes through, labels are exactly `claude-fix` + `release:<key>`, assignee is the owner, branch is `claude-fix/<key>-<n>`. Never merges, never approves, never reads signing material.

### 8. `docs/RELEASING.md` + `docs/RENEWALS.md` — doc sections

**Analog:** `docs/RELEASING.md:306-360` (rulesets/environments register), `:512-529` (actions policy), `:531-545` (secrets inventory). RELEASING gains: auth-outcome section (WIF rule-ID var, fallback confinement to `fixer` env, FIX-12), spend-limits section (workspace cap, `--max-turns`, `timeout-minutes: 90`, ≤2 attempts, `claude-fixer` group), support section (TRAIN-06 routing, live-proof pointer). RENEWALS.md does not exist yet — rows follow the secrets-inventory table shape (`| Scope | Name | Arrives in | Holder |`): fixer Console workspace cap review date, fallback `ANTHROPIC_API_KEY` rotation row (only if the fallback path activates), triage workspace row. Values are pending-until-owner-checkpoint, named as pending rather than guessed (RELEASING.md:38-39 rule).

## Shared Patterns

- **Message format:** `${NAME}: FAIL -- …` / `${NAME}: PASS -- …` / `  ok  <plant> -> red, naming …`; exit 0/1, 2 for bad args (update-channel 53-59/246-257; workflows 79-86/354-364; repo-controls 763-782; zizmor `NO_TOOL` FAIL naming the shell).
- **Every failure ends with a next step** (`Next step: run …`), never a bare red (update-channel 56-57; workflows `Next step:` closers on every rule; regenerate-patches `fail()`; apply-repo-controls 31-33).
- **Derive, don't hand-keep:** deny list read by both gate and self-test from `.github/fix-gate-deny.json`; registry-named file set parsed from `verify-platform.sh` at gate time; admissions compared as set equality (`admission-used`); deny entry without a plant (or vice versa) is a self-test failure.
- **Fail closed:** unreadable file/endpoint, missing instrument (js-yaml, zizmor, gh auth), or zero parsed workflows/files = FAIL naming the cause, never SKIP; `fix-gate` has no secrets to fail open with (`permissions: contents: read` at most).
- **Self-test writes nothing** in the repo: plants in memory through `runChecks` overrides (update-channel, workflows, repo-controls) or in `mkdtemp` fixtures (release-identity, zizmor, scan-brand-residue, regenerate-patches); the one allowed tree read is the green-baseline control.
- **Stage before you trust the scan:** new files staged before trusting `scan-brand-residue` (it iterates `git ls-files`; unstaged files are invisible — CLAUDE.md brand rule); Wave 0 order is deny file → gate script → registry row → `workflows` extensions → fixer workflow; train contract + fixtures → dispatch wiring; owner `checkpoint:human-action` → any live dispatch.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `scripts/release-train.mjs` NEEDS_OWNER row + FIX-01 dispatch + attempt counter | state machine | derive-from-facts (`derive`/`next`/`render` pure functions) | File does not exist in this tree (CONTEXT A2; Phase 43 owns the skeleton, Phase 50 the states). This phase adds only the contract + fixtures: RESEARCH §9.5 `derive/next` transitions (BUMP_RED/CONFLICT → `dispatchFixer({key, class: F1/F2/F3})`; VERIFY_RED on `main` → F3; release.yml failure → issue-only; `fixAttempts >= 2` from `fix` run-names → NEEDS_OWNER), validated `workflow_dispatch` inputs (`reason/key/class/target-branch/target-tag/fingerprint`), and the TRAIN-03 state-table row fixture. Retarget the contract if the Phase 43 shape differs. |
| `gh api` PR-open in `fix-open-pr.mjs` | utility | request-response (writes) | No `gh api` PR-opener exists in tree; only read-side `gh api` GETs (`verify-repo-controls.mjs:60-74`) and the `spawnSync('gh', ['api', '-X', …])` write shape (`apply-repo-controls.mjs:66-80` via `download-plugins.mjs:19`). |
| `docs/RENEWALS.md` | docs | — | File does not exist (`git ls-files` ABSENT); shape borrowed from RELEASING.md secrets-inventory table. |

## Metadata

**Analog search scope:** `scripts/`, `.github/workflows/`, `.github/settings/`, `docs/`, `inventory/`
**Files scanned:** ~20 (11 classified + 9 supporting: `download-plugins.mjs`, `rebase-upstream.sh`, `diff-theia-core.sh`, `scan-brand-residue.mjs`, `verify-release-identity.mjs`, `verify-zizmor.mjs`, `notify-drill.yml`, `environment-*.json`, `app-powerbrowser-bot.json` + rulesets + `repo.json`)
**Pattern extraction date:** 2026-10-23
**Precedent reused:** `41-PATTERNS.md` excerpt shapes (header/imports/args, exclusion table, injectable reads, main/PASS-FAIL, selfTest plants+controls, registry quick/full rows, CONTROLS/`planWrites` + `spawnSync` gh shape)
**Git-track verification:** every analog path above confirmed via `git ls-files` (full list in session record); `scripts/verify-ng-NNN-*.mjs` read never, `ledger/` never touched
**Wave 0 order (from 52-VALIDATION.md):** deny file → gate script → registry row → `workflows` extensions → fixer workflow; train contract + fixtures → dispatch wiring; `fixer-prepare.sh` + `fix-open-pr.mjs` before the workflow references them; `docs/RENEWALS.md` rows before the live proof; owner `checkpoint:human-action` before any live dispatch
