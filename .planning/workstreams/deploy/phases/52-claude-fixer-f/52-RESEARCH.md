# Phase 52: Claude fixer (F) — RESEARCH.md

**Phase:** 52 — Claude fixer (F)
**Researched:** 2026-10-23
**Confidence:** MEDIUM-HIGH overall (HIGH on the decisive F flag — pinned action source read line-by-line this session; MEDIUM on train-integration points whose code does not exist yet in this tree)
**Mode:** Nyquist enabled (see § Validation Architecture)

---

## 1. Summary + primary recommendation

**What this phase builds:** a three-job chain (`fix` → `fix-gate` → `fix-pr`) in `release-train.yml` that reacts to exactly three fixable failure classes (patch-replay conflict on `chore/esr-*`; red bump PR on `chore/esr-*`, `chore/node-*`, or the Renovate Theia branch; red `main`), produces a Claude-written fix as a gated, owner-assigned PR labelled `claude-fix` + `release:<key>`, and can never merge, approve, sign, or weaken a gate. TRAIN-06 routing (red stage → `train:blocked` + owner + log link; fixer only for the three classes; `release.yml` failures open an issue only) and the NEEDS_OWNER third-failure state ride in the same phase.

**Primary recommendation:**

1. **Authenticate with GitHub OIDC workload identity federation (`id-token: write` on the `fix` job only).** The F flag is RESOLVED by reading the pinned action source: passing an explicit `github_token` suppresses the action's own OIDC App-token exchange entirely (`setupGitHubToken` returns the provided token before any OIDC call), while the federation path (`setupWorkloadIdentity`) is a *separate, independent* OIDC exchange keyed off `anthropic_federation_rule_id` + `anthropic_organization_id`. The two exchanges do not interfere (details + file:line in § Open Questions). Fallback, only if the Console federation setup is blocked: `ANTHROPIC_API_KEY` stored solely in the `fixer` environment with **no** `id-token` on any job. Record the outcome in `docs/RELEASING.md` (FIX-12).
2. **Extend `scripts/verify-workflows.mjs`; do not fork it.** The `workflows` row already enforces uses-pinned (40-hex SHA), uses-admitted via `actions-selected.json` + admission-used set equality, no-schedule, runner (hosted-or-legion), legion (only `release.yml` `build-*`/`matrix-*`, no env, no `secrets.`), claude-code-action (hosted + no create-github-app-token sibling + contents-not-write), issues-write (only train report + `triage.yml`), write-trio (only `release.yml` `sign-publish`), no-pr-trigger, no-cache, event-text, workflow-run-guard/chain. The fixer needs a small set of additive tightenings (FIX-08/FIX-09 assertions: exact action SHA `db77d4d3…`, exact Claude Code binary via `path_to_claude_code_executable`, `show_full_output`/`display_report` false, no `ACTIONS_STEP_DEBUG`, no bare `Bash` — with the caveat below — WebFetch/WebSearch denied, never on `claude-fix/*` heads or for the bot actor, explicit `allowed_bots`). Add them as new rules in the same script + new self-test plants, following the existing plant/control pattern.
3. **New code surface is minimal and prescribed:** `.github/fix-gate-deny.json` (FIX-11 list), a `verify-fix-gate`-family gate script + one `verify-platform.sh` registry row `fix-gate-self-test`, TRAIN-06 routing + FIX-01 dispatch + NEEDS_OWNER row in `scripts/release-train.mjs` (contract + fixtures first where the train does not exist yet), and `docs/RELEASING.md` sections (auth outcome, spend limits). Everything is offline-verifiable: no network writes during research or planning; read-only `gh api` allowed.
4. **Do not fight the action's PR hardening — route around it:** the action restores `.claude/` + `CLAUDE.md` from the *base* branch on PRs (so FIX-06's "load from `main` checkout" is partly native behavior) but leaves `package.json`/lockfiles/scripts at the PR head, and Claude Code itself is downloaded at runtime outside the action SHA pin (v2.1.304 via `curl | bash`), so `path_to_claude_code_executable` with an integrity-checked binary is load-bearing, not cosmetic.

**Caveat on "no bare `Bash"`:** FIX-09 as written in REQUIREMENTS says "allows an explicit tool list with no bare `Bash`". The action's tool gating is via `claude_args: --allowedTools …` (Claude Code CLI surface), not an action input; "no bare Bash" is enforceable only as (a) a `workflows`-row static assertion that the fix job's `claude_args` contains no unscoped `Bash` entry, plus (b) `fix-gate` rejecting diffs outside the allowlist. The plan should state both halves rather than pretending the prompt alone enforces it.

---

## 2. <user_constraints>

Copied verbatim from `.planning/workstreams/deploy/phases/52-claude-fixer-f/52-CONTEXT.md` (locked user decisions — honored exactly):

<user_constraints>

<domain>
## Phase Boundary

When a bump PR goes red, a patch fails to replay or `main` goes red, a Claude-written fix arrives as a gated PR for the owner to review, and the fixer can never merge, approve, sign or weaken a gate.

Requirements: FIX-01, FIX-02, FIX-03, FIX-04, FIX-05, FIX-06, FIX-07, FIX-08, FIX-09, FIX-10, FIX-11, FIX-12, TRAIN-06 (full text in `.planning/workstreams/deploy/REQUIREMENTS.md`).

Depends on: Phase 50 (release states), Phase 51 (Renovate Theia branch is a fixer class).
External gate: Anthropic Console fixer workspace with a monthly limit; OIDC federation or the `fixer` environment key; FIX-10 deadline 2027-05-27 (ESR 175 nightly).
Research flag: Yes (F): whether passing `github_token` suppresses the action's own OIDC App-token exchange, which decides OIDC versus `ANTHROPIC_API_KEY`.
</domain>

<decisions>
## Implementation Decisions

### Already decided (owner, 2026-10-20)
- All owner decisions in REQUIREMENTS.md "Owner Decisions" are binding (SEED-002 §12 recommended defaults plus the research additions): Apps only, no PATs; bot App without the Workflows permission; fixer opens PRs only, never merges, never approves environments, never touches signing keys; spend-limited; patches only through `scripts/regenerate-patches.sh` (decisions 20, 21).
- Fixer authentication: GitHub OIDC workload identity federation, with an `ANTHROPIC_API_KEY` in the `fixer` environment as fallback (decision 17). The F research flag decides between them by reading the pinned action source at `db77d4d3c98f3f6380e7cd45ffba2342a3dbde3c` for whether passing `github_token` suppresses the action's own App-token exchange.
- No `schedule:` in the product repo (decision 1); the train, not the fixer, owns cadence. One `release-train` concurrency group; the fixer has its own `claude-fixer` group.
- Theia bump automerge is off (decision 4); the Renovate Theia branch is a fixer class like `chore/esr-*` and `chore/node-*`.
- Fixer limits (decision 21) and TRAIN-06 routing (red stage labels `train:blocked`, assigns owner, links log; fixer starts only for the three FIX-01 classes; `release.yml` failures open an issue only) are load-bearing.

### Owner gates in this phase (stop points for autonomous execution)
- Creating the Anthropic Console fixer workspace with a monthly limit, setting up OIDC federation or storing the `fixer`-environment key, creating/installing any GitHub App, applying any live repo/org setting, and the FIX-10 live proof (a real red PR reviewed and merged by the owner before 2027-05-27) are owner actions. Plans build everything locally — workflow files, `scripts/release-train.mjs` routing additions, `fix-gate` logic, `.github/fix-gate-deny.json`, `scripts/verify-fix-gate.mjs` + registry row, `docs/RELEASING.md` sections — and end with one `checkpoint:human-action` listing the exact owner commands, after which the live proof runs.
- Read-only `gh api` calls against the live org/repo are allowed for research and for read-back rows. No network writes: no push, no dispatch, no App creation.

### Assumptions about unfinished dependencies (recorded per autonomous rules)
- A1: Phase 41 (repository controls and GitHub Apps) waits on the owner for live apply. These plans assume the declared controls exist as specified in Phase 41's plans: `fixer`/`bot`/`release`/`descriptor`/`triage` environments branch-restricted to `main`, the bot App without Workflows permission, `actions-selected.json` admitting `anthropics/claude-code-action@*` + `actions/create-github-app-token@*` + `attest-build-provenance`, and the `workflows` row trust rules. If Phase 41 lands differently, the fixer workflow's permissions/env/runner assertions must be re-pinned.
- A2: Phases 43 (train skeleton), 49 (release pipeline), 50 (release states) and 51 (Renovate/supersede) are not finished. These plans assume `release-train.yml` + `scripts/release-train.mjs` exist per ARCHITECTURE.md §4/§5 (report job owns issue writes, `fix`/`fix-gate`/`fix-pr` job names, NEEDS_OWNER in the TRAIN-03 state table, attempt counting from `fix` job `run-name`s carrying release key + class). Where the train does not yet exist, plans specify the contract + fixtures first and touch `release-train.mjs` only to add the NEEDS_OWNER row and the FIX-01 dispatch rule, leaving the rest to Phase 43/50.
- A3: Theia 1.77 + TypeScript 6.0 red PR (FIX-10's expected live proof) does not exist yet. Plans prove the chain on fixtures + a staged red branch and leave the live merge to the owner before 2027-05-27.

### Claude's Discretion
All other implementation choices are at Claude's discretion. Use the ROADMAP phase goal, success criteria, and codebase conventions to guide decisions.
</decisions>

<code_context>
## Existing Code Insights

Start from `.planning/research/v1.6-deploy/ARCHITECTURE.md` §5 (fixer three-job split, credential choice, `work/` checkout, `claude-fixer` group, NEEDS_OWNER) and `SUMMARY.md` Phase F + corrections C2/C4 (three jobs, not two; `github_token`-suppresses-exchange is the open OIDC question), `scripts/verify-workflows.mjs` (the `workflows` row: SHA pinning, admission set-equality, hosted-or-legion runner, legion no-env/no-secrets, claude-code-action hosted + no App-token sibling + contents-not-write, issues admission, event-text, no-cache; extend it, do not fork it), `.github/workflows/verify.yml` + `rebase-upstream.yml` (Nix-wrapped generator steps, pinned `uses:` anchors for the self-test), `.github/settings/` (environment files, `actions-selected.json`), `scripts/regenerate-patches.sh` + `scripts/check-patch-surface.sh` (the only legal patch path; fixer never text-edits hunks), and `docs/RELEASING.md` (where the auth outcome, spend limits and support sections land).
</code_context>

<specifics>
## Specific Ideas

- Research flag F: read the pinned `anthropics/claude-code-action` source at `db77d4d3c98f3f6380e7cd45ffba2342a3dbde3c` for whether passing explicit `github_token` suppresses the action's own App-token OIDC exchange; the answer selects FIX-12's `id-token: write`-only path versus the `fixer`-environment `ANTHROPIC_API_KEY` path (CRITIQUE.md C4).
- The `workflows` row is the trust-boundary check reused by the fixer: no `schedule:`, hosted-only fixer jobs, SHA pin `db77d4d3c98f3f6380e7cd45ffba2342a3dbde3c` + pinned Claude Code version via `path_to_claude_code_executable`, `show_full_output`/`display_report` false, no `ACTIONS_STEP_DEBUG`, no bare `Bash`, WebFetch/WebSearch denied, never on `claude-fix/*` heads or for the bot actor, `allowed_bots` explicit.
- `fix-gate` deny list lives in `.github/fix-gate-deny.json` and is read by both the gate and its self-test; the registry row `verify-fix-gate` derives its plant list from that file plus every file a registry row names (parsed at gate time), then runs apply non-vacuity, check-patch-surface, scan-brand-residue, `diff-theia-core.sh` and `--quick`.
- Attempt counting comes from `fix` job runs whose `run-name` carries the release key and class, so a `fix-gate`-rejected attempt still counts; the third failure moves the release to NEEDS_OWNER (a TRAIN-03 state-table row this phase adds).

</specifics>

<deferred>
## Deferred Ideas

None — discuss skipped.
</deferred>

</user_constraints>

---

## 3. <phase_requirements>

Full requirement text is in `.planning/workstreams/deploy/REQUIREMENTS.md`; research support per ID:

| Req | One-line gist (see REQUIREMENTS.md for binding text) | Research support for planning |
|---|---|---|
| TRAIN-06 | Red stage → `train:blocked` + owner + log link; fixer only for fixable classes; `release.yml` failures open issue only | ARCHITECTURE.md §4.2 state machine (BUILD_FAILED → issue only; BUMP_RED/CONFLICT/verify-red → fix classes) + §5.1 trigger table [VERIFIED: .planning/research/v1.6-deploy/ARCHITECTURE.md:245-258]; plan as `report`-job routing rules in `release-train.mjs` with fixtures |
| FIX-01 | Train dispatches fixer by `workflow_dispatch` for 3 classes only (replay conflict on `chore/esr-*`; red bump PR on `chore/esr-*`/`chore/node-*`/Renovate Theia; red `main`); never for `release.yml` failures, fork heads, external authors | ARCHITECTURE.md §5.1 class table (F1/F2/F3 + explicit never-list) [VERIFIED: .planning/research/v1.6-deploy/ARCHITECTURE.md:245-258]; SECURITY.md upstream-run actor check means fork `workflow_run` stops before Claude runs [CITED: anthropics/claude-code-action docs/security.md at db77d4d3];-plan `workflow_dispatch` inputs (release key, class, fingerprint) validated per TRAIN-08 pattern |
| FIX-02 | Patches change only via `regenerate-patches.sh`; Edit/Write on `patches/**` denied; gate runs `--check` on fresh replay at target tag | `regenerate-patches.sh --check` semantics incl. moved-file ±-only compare (CR-01) [VERIFIED: scripts/regenerate-patches.sh:1-40]; CRITIQUE C11 byte-equality subsumes index-hash check [VERIFIED: .planning/research/v1.6-deploy/CRITIQUE.md:96-104]; PITFALLS 2 (hand-edit → silent no-op) [VERIFIED: .planning/research/v1.6-deploy/PITFALLS.md:50-72] |
| FIX-03 | Three jobs: `fix` (env `fixer`, read-only GITHUB_TOKEN + Anthropic cred, no App token, checkout into `work/`), `fix-gate` (no secrets), `fix-pr` (env `bot`, only App-token minter, PR labelled `claude-fix` + `release:<key>`, templated body, owner assigned; never merges/approves/reads signing material) | ARCHITECTURE.md §5.2 job chain with permission matrix [VERIFIED: .planning/research/v1.6-deploy/ARCHITECTURE.md:260-292]; permission-matrix table [VERIFIED: .planning/research/v1.6-deploy/ARCHITECTURE.md:309-332]; CRITIQUE C2 mandates three jobs over two [VERIFIED: .planning/research/v1.6-deploy/CRITIQUE.md:79-81]; security.md checkout pattern (base at root, head in subdir via `--add-dir`) [CITED: security.md at db77d4d3]; `create-github-app-token` revokes token in post step so App token cannot cross jobs [VERIFIED: .planning/research/v1.6-deploy/ARCHITECTURE.md:333-336] |
| FIX-04 | Every fixer job on GitHub-hosted runners, never legion; `workflows` row asserts | `runner` + `legion` rules already implemented (hosted regex, legion admitted only on `release.yml` `build-*`/`matrix-*`) [VERIFIED: scripts/verify-workflows.mjs:113-122,270-290]; fixer jobs simply never use a legion label set — no new rule needed, only fixtures |
| FIX-05 | Spend bounded: dedicated Console workspace cap, `--max-turns`, `timeout-minutes`, ≤2 attempts per (release key, class), own `claude-fixer` concurrency group; counting from `fix` `run-name`s (gate-rejected counts); 3rd failure → NEEDS_OWNER (TRAIN-03 row) | ARCHITECTURE §5.2 spend layers (workspace cap, `--max-turns`, `timeout-minutes: 90`, 2 attempts, one group) [VERIFIED: .planning/research/v1.6-deploy/ARCHITECTURE.md:260-292]; PITFALLS 3 recursion/spend guards (head-ref exclusion, fingerprint concurrency, timeout, `--max-turns`, separate workspace) [VERIFIED: .planning/research/v1.6-deploy/PITFALLS.md:74-94]; attempt source = PRs labelled `claude-fix`+`release:<key>` [VERIFIED: .planning/research/v1.6-deploy/ARCHITECTURE.md:256-258] — this phase moves the count to `fix` run-names so gate-rejects count |
| FIX-06 | `fix` loads `.claude/` + `CLAUDE.md` from a `main` checkout, never the `work/` target | Action natively restores `.claude/`, `.mcp.json`, `.claude.json`, `.gitmodules`, `.ripgreprc`, `CLAUDE.md`, `CLAUDE.local.md`, `.husky/` from the PR **base** branch before Claude runs [CITED: security.md at db77d4d3]; plan adds explicit root checkout at `main` + target in `work/` per security.md `--add-dir` pattern so the rule holds even outside PR context (`workflow_dispatch`) |
| FIX-07 | `fix-gate-self-test`: green control, then one planted diff per FIX-11 deny entry (list read from the deny file itself) + hand-edited hunk, each rejected naming the path | Precedent: `workflows-self-test` plants in-memory faults over fixtures with control greens [VERIFIED: scripts/verify-workflows.mjs:366-543]; `regenerate-patches.sh --self-test` hermetic fixture [VERIFIED: scripts/regenerate-patches.sh:1-40]; Nyquist table in § Validation Architecture |
| FIX-08 | Action pinned at commit `db77d4d3…` (not tag object); Claude Code pinned via `path_to_claude_code_executable`; `show_full_output` false (+ `display_report` false in fixer); never `ACTIONS_STEP_DEBUG`; `workflows` row asserts each | Commit `db77d4d3` = v1.0.254, tag object is `c335fd6d`, install runs `claude 2.1.304` via `curl | bash` outside the pin [CITED: action.yml + src/entrypoints/run.ts at db77d4d3]; CRITIQUE correction 20 mandates commit pin [VERIFIED: .planning/research/v1.6-deploy/CRITIQUE.md:135-159]; `path_to_claude_code_executable` skips auto-install [CITED: run.ts `installClaudeCode` at db77d4d3]; `show_full_output` default false + auto-enables under `ACTIONS_STEP_DEBUG` [CITED: action.yml + security.md at db77d4d3] |
| FIX-09 | Prompt from trusted fields only; untrusted text as framed data file; explicit tool list, no bare `Bash`; no WebFetch/WebSearch; never on `claude-fix/*` heads or for bot actor; explicit `allowed_bots` | PITFALLS 1 controls (trusted-fields prompt, data-file framing, `--allowedTools` scoping, `github_token` never PAT, `allowed_bots` explicit list e.g. `renovate[bot],powerbrowser-bot[bot]`, `head_repository` guard) [VERIFIED: .planning/research/v1.6-deploy/PITFALLS.md:28-48]; `allowed_bots: '*'` warning + `allowed_non_write_users` only-with-`github_token` semantics [CITED: action.yml + security.md at db77d4d3]; `checkWritePermissions` blocks non-write actors incl. upstream-run actor on `workflow_run` [CITED: run.ts at db77d4d3]; event-text rule precedent [VERIFIED: scripts/verify-workflows.mjs:320-327] |
| FIX-10 | Live proof on a real red PR (expected Theia 1.77/TS 6.0) before 2027-05-27; fixer PR passes `fix-gate`, owner reviews + merges | Owner-gated; plan proves chain on fixtures + staged red branch (CONTEXT A3); SUMMARY Phase F names the same first exercise [VERIFIED: .planning/research/v1.6-deploy/SUMMARY.md:295-307] |
| FIX-11 | `fix-gate` reads `.github/fix-gate-deny.json`, rejects diffs touching the listed entries + every registry-row-named file (derived by parsing the registry at gate time); then apply non-vacuity, check-patch-surface, scan-brand-residue, `diff-theia-core.sh`, `--quick` | Deny-list rationale (030 = MAR trust root; `verify-platform.sh`/allowlist/brand-token edits = gate weakening) [VERIFIED: .planning/research/v1.6-deploy/PITFALLS.md:50-72]; checks `check-patch-surface.sh` (compiled-suffix + brand-value scans from patch's own headers) [VERIFIED: scripts/check-patch-surface.sh:1-60]; `diff-theia-core.sh` two-stage core check [VERIFIED: scripts/diff-theia-core.sh:1-50]; registry-derived file list follows "derive, never hand-keep" (CLAUDE.md) |
| FIX-12 | OIDC WIF (`id-token: write` on `fix` only) once pinned source shows `github_token` suppresses the App-token exchange; else `fixer`-env `ANTHROPIC_API_KEY`, no `id-token`; outcome in `docs/RELEASING.md` | **RESOLVED → WIF path.** `setupGitHubToken` returns `OVERRIDE_GITHUB_TOKEN` (= `github_token` input) before any OIDC call [CITED: src/github/token.ts at db77d4d3]; federation is a separate path requiring rule+org IDs, key/OAuth take precedence, OIDC audience defaults to `https://api.anthropic.com` with 4-min refresh and post-run deletion [CITED: base-action/src/workload-identity.ts at db77d4d3]; full file:line proof in § Open Questions |

---

## 4. CLAUDE.md hard rules (mandatory section)

These hold for every plan in this phase; a plan that violates one is wrong, not creative:

1. **Patches are regenerated, never text-edited.** "Regenerate a patch from a patched tree. Editing a hunk body by hand without recomputing its blob hashes degrades the three-way merge into a **silent no-op**" [VERIFIED: CLAUDE.md:106-111]. The fixer prompt names `scripts/regenerate-patches.sh` as the only patch path (FIX-02); the gate re-derives with `--check` and trusts nothing Claude claims. `scripts/check-patch-surface.sh` guards the surface [VERIFIED: CLAUDE.md:106-111].
2. **Never edit `upstream/` or Theia core.** `upstream/` is fetched by `scripts/fetch-upstream.sh` and "is never hand-edited — `git -C upstream diff` staying empty is the invariant" [VERIFIED: CLAUDE.md:33-44]; Theia is consumed as npm deps, "never by editing it", enforced by `scripts/diff-theia-core.sh` [VERIFIED: CLAUDE.md:24-31]. The fixer resolves conflicts inside `work/upstream/` and regenerates; `fix-gate` runs `diff-theia-core.sh`.
3. **One verify driver, one registry.** "`scripts/verify-platform.sh`. `verify-phase-0{2,3,4,5}.sh` were deleted in the commit that created it and must not come back" [VERIFIED: CLAUDE.md:115-125]. The new check is **one registry row** (`fix-gate-self-test`) with a `--self-test` that plants each fault and requires red naming the drift — "Give a new check a `--self-test` that plants faults and requires each one to go red naming the drift" [VERIFIED: CLAUDE.md:127-139].
4. **Checks derive from the tree; never hand-keep expectation lists.** "A hand-kept list can only ever agree with the tree it was copied from" [VERIFIED: CLAUDE.md:127-139]. Consequences: the deny file is read by both gate and self-test (never duplicated into the test); the "every file a registry row names" set is parsed from the registry at gate time; admission uses the existing set-equality mechanism.
5. **No internal identifiers in user-facing copy.** "Every user-facing error string names the product as 'PowerBrowser', states the problem in plain language, and ends with a next step that is a real affordance on screen" [VERIFIED: CLAUDE.md:143-150]. The `fix-pr` templated body is owner-facing operational text: keep pref keys, SHAs, sentinel names out of prose; SHAs/diffs belong in labelled rows/attachments, which "exists for exactly that" [VERIFIED: CLAUDE.md:143-150].
6. **Builds inside `nix develop .#theia`.** "`node` and `objdir/dist/bin/powerbrowser` work outside a dev shell; `yarn` does not" [VERIFIED: CLAUDE.md:157-171]. The `fix` job's verification steps (`generate`, `--quick`) run Nix-wrapped, following the `verify.yml` precedent of Nix-wrapped generator steps [VERIFIED: .github/workflows/verify.yml:48-70].
7. **Repo path / residual-brand discipline.** New files are staged before trusting `scan-brand-residue` (it iterates `git ls-files`; unstaged files are invisible) and brand tokens live only in `inventory/brand-tokens.json` [VERIFIED: CLAUDE.md:91-104].

---

## 5. Standard Stack

No new toolchain. Everything is already in the tree or already pinned by prior research:

| Component | Version / pin | Role in this phase |
|---|---|---|
| `anthropics/claude-code-action` | commit `db77d4d3c98f3f6380e7cd45ffba2342a3dbde3c` (= v1.0.254; tag object `c335fd6d` must NOT be used) [CITED: action.yml at db77d4d3; CRITIQUE correction 20] | `fix` job actor |
| Claude Code binary | exact version via `path_to_claude_code_executable`, integrity-checked at install time (action default would `curl …/install.sh \| bash -s -- 2.1.304` at runtime, outside the SHA pin) [CITED: run.ts `installClaudeCode` at db77d4d3] | the actual agent; pin closes the runtime-download gap |
| `actions/create-github-app-token` | v3.3.0 (admitted as `actions/create-github-app-token@*` per A1; token revoked in post step so it cannot cross jobs) | `fix-pr` job only (mints bot App token with `contents:write` + `pull-requests:write`, no `workflows`) |
| `actions/checkout` | `11d5960a326750d5838078e36cf38b85af677262` (v4.4.0) [VERIFIED: .github/workflows/verify.yml:42-46] | root (`main`) + `work/` + fresh gate checkouts |
| `cachix/install-nix-action` | `13d8dd58da0234aa297dedd986986ccb8e7f3e24` (v31.11.1) [VERIFIED: .github/workflows/verify.yml:52-53] | `.#theia` shell for generate/verify steps |
| `scripts/verify-workflows.mjs` + `verify-platform.sh` registry | in-tree (rules enumerated §1 rec 2) [VERIFIED: scripts/verify-workflows.mjs:15-65] | trust-boundary gate, extended not forked |
| `scripts/regenerate-patches.sh` (+ `--check`), `check-patch-surface.sh`, `scan-brand-residue.mjs`, `diff-theia-core.sh` | in-tree | `fix-gate` enforcement chain |
| `release-train.yml` + `scripts/release-train.mjs` | assumed per CONTEXT A2 (Phases 43/50 land the skeleton/states); this phase adds NEEDS_OWNER row + FIX-01 dispatch rule + fixtures | orchestrator surface the fixer plugs into |
| Anthropic Console | dedicated fixer workspace, monthly limit (owner-created); model: Opus-class for fixer per SUMMARY Phase F | spend ceiling layer 1 |
| `fixer` / `bot` environments | branch policy `main` only (`environment-fixer.json`, `environment-bot.json` carry `custom_branch_policies: true`) [VERIFIED: .github/settings/environment-fixer.json:1-6] | secret scoping; a workflow edited on any other branch cannot read the Anthropic credential |

**Do not add:** a second workflow-verifier script; a PAT anywhere (Apps only); `schedule:` in the product repo (decision 1); `allowed_non_write_users` on the fixer (triage-only, GH-03); `allowed_bots: '*'` (explicit list: `renovate[bot],powerbrowser-bot[bot]`); Actions cache in any fixer/gate job (release-path cache rule extends to the fixer: poisoned cache → poisoned diff); `ACTIONS_STEP_DEBUG` on the repo (auto-enables `show_full_output`, publicly visible).

---

## 6. Architecture Patterns

### 6.1 Fix → fix-gate → fix-pr data-flow (prose table)

Each row is one handoff. The invariant: **artifacts only, never credentials; each job mints what it needs and nothing else.**

| # | From → To | Payload (artifact) | Credentials in the receiving job | Trust decision |
|---|---|---|---|---|
| 0 | train `report`/`derive` → `fix` | `workflow_dispatch` inputs: release key (`v<ESR>-<rev>`), class (F1/F2/F3), fingerprint (check label + base SHA), target branch + tag | `fix` holds read-only `GITHUB_TOKEN`, the Anthropic credential (WIF `id-token:write`, or `fixer`-env key), NO App token | Train validates inputs (tag regex, key > latest Release) before dispatch; `fix` refuses `claude-fix/*` heads and the bot actor |
| 1 | `fix` (workspace) | root checkout = `main` (trusted `.claude/` + `CLAUDE.md`); `work/` = target branch checkout (untrusted, esp. `renovate/*` heads carrying registry content); conflict markers resolved in `work/upstream/`, patches rewritten **only** by `regenerate-patches.sh` | read-only token + Anthropic cred; mint: none | Mirrors the action security.md pattern (base at root, head in subdir via `--add-dir`); `yarn install --ignore-scripts` as in verify.yml |
| 2 | `fix` → `fix-gate` | `git -C work diff` (excluding `upstream/`) uploaded as artifact; structured summary (failing check, diff stat, paths, attempt count) | `fix-gate` holds **no secrets** (`GITHUB_TOKEN` contents-read at most) and a **fresh** checkout of the target branch — it never trusts `fix`'s workspace, only the diff artifact re-applied | Artifact-only handoff: even a fully compromised `fix` can only submit a diff, which the gate re-derives and re-checks from scratch |
| 3 | `fix-gate` | applies diff → path filter vs `.github/fix-gate-deny.json` + registry-derived file set → `regenerate-patches.sh --check` on fresh replay at target tag → apply non-vacuity → check-patch-surface → scan-brand-residue → `diff-theia-core.sh` → `--quick` → gate verdict artifact | no secrets | "The gate does not trust that [Claude] did [regenerate]: `--check` re-derives the patches from a fresh replay and byte-compares them. A hand-edited hunk cannot pass" (ARCHITECTURE.md §5.2) |
| 4 | `fix-gate` → `fix-pr` | gate verdict `pass` + accepted diff artifact | `fix-pr` (env `bot`) is the **only** job that mints the App token (immediately before use; revoked in post step), pushes `claude-fix/<key>-<n>`, opens the PR labelled `claude-fix` + `release:<key>` with the **template-generated** body (never Claude prose), assigns the owner | UX PITFALLS rule: "PR body generated by F2 from a template: failing check, diff stat, paths, attempt count" — owner reviews the diff, not prose |
| 5 | `fix-pr` → owner | PR into the bump branch (`chore/esr-T`, `chore/node-*`, `renovate/*`) or `main` (F3); PR triggers `verify.yml`; green → owner merges into the bump branch / `main` | App token dead (post-step revocation); the App cannot approve (ruleset: 1 approving review, owner-only bypass, App is author) | "The fixer never merges, never approves an environment and never reads signing material" (FIX-03); main ruleset requires review the App cannot give itself |

### 6.2 `work/` checkout pattern

`fix` checks out `main` at the workspace root and the fix target into `work/` (second `actions/checkout` with `path: work`, `persist-credentials: false` on the read-only token). Claude runs with `--add-dir work` semantics: rules/identity from root, edits confined to `work/`. Rationale: PR-head checkouts leave `package.json`, lockfiles, hooks and scripts attacker-controlled even after the action restores `.claude/`/`CLAUDE.md` from base [CITED: security.md at db77d4d3] — and under `workflow_dispatch` there is no PR base at all, so the explicit `main` root checkout is what makes FIX-06 hold. `fix-gate` uses a third, independent checkout (its own job workspace at the target branch) + the diff artifact; it never executes anything from `fix`'s workspace.

### 6.3 Attempt counting

Attempts derive from `fix` job runs whose `run-name` carries `<release-key> <class>` (e.g. `fix v153.7.0-1 F2`). Counting runs (not PRs, not gate verdicts) is what makes a `fix-gate`-rejected attempt count toward the 2-attempt budget; the 3rd failure transitions the release to NEEDS_OWNER (new TRAIN-03 state-table row + fixture, this phase). Concurrency group `claude-fixer` (one group for the whole fixer, separate from the `release-train` group) serializes attempts so two ticks cannot double-spend the budget. Cap parallel analysis: the counter query (list workflow runs by name) runs in `derive` on every train wake — sampling rate § Validation Architecture.

---

## 7. Don't Hand-Roll

| Instead of hand-rolling… | Use… | Why |
|---|---|---|
| A new `verify-fixer-workflows.mjs` trust check | New rules + plants inside `scripts/verify-workflows.mjs` | Parent directive + CONTEXT code-context: "extend these rules for the fixer; do not fork" |
| A new verify driver for the gate | One registry row in `scripts/verify-platform.sh` | "Adding a check means appending one row to that registry. It does not mean creating a sibling driver" [VERIFIED: CLAUDE.md:115-125] |
| A hand-kept deny list copied into the test | `.github/fix-gate-deny.json` read by **both** gate and self-test | "Derive from the tree and compare; do not hand-keep an expectation list" [VERIFIED: CLAUDE.md:127-139] |
| A hand-kept "registry files" list in the gate | Parse the registry (`verify-platform.sh` rows + referenced `scripts/*.mjs`) at gate time | Same rule; additions/removals to the registry automatically widen/narrow the gate |
| A counter column / stored attempt state | Derive from `fix` run-names + `claude-fix` PR labels every run | "The tracking issue is a rendered view. GitHub API facts are the state" (ARCHITECTURE.md §4.3); no stored state to drift |
| Claude-written PR body prose | Deterministic template rendered by `fix-pr` from the structured summary (failing check, diff stat, paths, attempt count) + gate log link | Prompt-injection surface + UX rule ("owner reviews prose instead of the diff") |
| Custom OIDC/JWT code for Anthropic auth | Action-native `anthropic_federation_rule_id` + `anthropic_organization_id` inputs with `id-token: write` | Implemented, rotated, and cleaned up (`stop()` deletes token material) by the action [CITED: workload-identity.ts at db77d4d3] |
| Custom prompt-injection scrubber | Action's built-in actor checks + `head_repository` guard + event-text rule + prompt-framing discipline | `checkWritePermissions` covers entity + `workflow_run` upstream actors [CITED: run.ts at db77d4d3]; sanitization "reduces but does not eliminate" risk, so layer it with scoping, never replace it |

---

## 8. Common Pitfalls

1. **Prompt injection reaching a write token (Clinejection class).** [VERIFIED: .planning/research/v1.6-deploy/PITFALLS.md:28-48] Controls, all required together: three-job split (Claude never holds App token); prompt from trusted fields only (job name, check label, fetched logs/diffs), untrusted text as a framed data file; explicit `--allowedTools` without bare `Bash`, `Edit`/`Write` denied on `patches/**`; `permissions.deny: ["WebFetch","WebSearch"]` (or env equivalent); `event-text` rule extended to `prompt:` (already implemented [VERIFIED: scripts/verify-workflows.mjs:320-327]); `head_repository` guard on every `workflow_run`-triggered job; `allowed_bots` explicit. Triage-only `allowed_non_write_users` must not leak into the fixer.
2. **Fixer weakens a gate or text-edits a patch.** [VERIFIED: .planning/research/v1.6-deploy/PITFALLS.md:50-72] `fix-gate` rejects diffs touching any deny entry or any registry-named file; `--check` byte-compare (with CR-01 moved-file ±-only semantics) rejects hand-edited hunks; `patches/030-*` is deny-listed (MAR trust root) with F1 explicitly excepting it. The fixer may *report* a wrong gate; only the owner changes gates.
3. **Recursion / runaway spend.** [VERIFIED: .planning/research/v1.6-deploy/PITFALLS.md:74-94] Never start on `claude-fix/*` heads or for the bot actor (the action blocks bots by default; the explicit allow-list must not include the bot App or `claude[bot]`); one attempt per fingerprint; `claude-fixer` concurrency group; `timeout-minutes` + `--max-turns`; separate Console workspace cap; debug via private fork, never `ACTIONS_STEP_DEBUG` on the repo (it flips `show_full_output` on, publicly visible).
4. **Same-repo branch reaching legion.** Unchanged by this phase, but the fixer must not reopen it: fixer jobs are GitHub-hosted only (FIX-04, asserted by existing `legion` rule); the bot App keeps no `workflows` permission (A1); `fix-pr` mints the App token with `contents`+`pull-requests` only.
5. **Cache poisoning into the diff.** No `actions/cache`, no `setup-*` `cache:` inputs, no sccache GHA backend in `fix`/`fix-gate`/`fix-pr` (extends the release-path no-cache rule; the existing `no-cache` rule covers `release.yml` only — extend its file scope to the fixer jobs).
6. **`MOZ_BUILD_DATE`-style determinism traps / stale approvals.** The sign job exits if a newer Release exists (ARCHITECTURE.md §7 flow discipline); fixer PRs target bump branches, never tags; App token minted immediately before use (1-hour expiry).
7. **Approval-shaped holes.** `fix-pr` never approves; ruleset requires 1 approving review with owner-only bypass; owner approves because the App is the PR author. `repo-controls` reads this back (Phase 41).
8. **Silent-clock / lost-update on tracking issues.** Single writer (`report` job), body PATCHed only when rendered bytes differ, @-mention + assignment only on entry to owner-needed states (TRAIN-02 pattern).

---

## 9. Code Examples

All SHAs below are exact pins. `H40` = `abcdef0123456789abcdef0123456789abcdef01` placeholder for the self-test fixture only.

### 9.1 `fix` job skeleton (in `release-train.yml`; new)

```yaml
  fix:
    # FIX-03/FIX-04/FIX-06/FIX-08/FIX-09/FIX-12. Hosted only; env fixer;
    # read-only token; Anthropic via WIF (id-token: write HERE ONLY).
    runs-on: ubuntu-latest
    environment: fixer
    concurrency: claude-fixer
    timeout-minutes: 90
    permissions:
      contents: read
      actions: read
      id-token: write
    if: >-
      github.event.workflow_run.head_repository.full_name == github.repository &&
      !startsWith(github.event.workflow_run.head_branch, 'claude-fix/') &&
      github.actor != 'powerbrowser-bot[bot]'
    steps:
      - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4.4.0
        with:
          persist-credentials: false
          ref: main # trusted root: .claude/ + CLAUDE.md come from here (FIX-06)
      - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4.4.0
        with:
          persist-credentials: false
          ref: ${{ inputs.target-branch }}
          path: work # untrusted target, never the workspace root (FIX-06)
      - uses: cachix/install-nix-action@13d8dd58da0234aa297dedd986986ccb8e7f3e24 # v31.11.1
      - name: Resolve conflict markers, regenerate only
        run: nix develop .#theia --command bash scripts/fixer-prepare.sh
        # fixer-prepare.sh (new, tiny): fetch upstream at inputs.tag,
        # apply-patches (markers stay), NO network beyond fetch.
      - uses: anthropics/claude-code-action@db77d4d3c98f3f6380e7cd45ffba2342a3dbde3c # v1.0.254, NOT the tag object
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }} # suppresses the action's own App-token OIDC exchange (F flag, RESOLVED)
          anthropic_federation_rule_id: ${{ vars.ANTHROPIC_FEDERATION_RULE_ID }}
          anthropic_organization_id: ${{ vars.ANTHROPIC_ORGANIZATION_ID }}
          path_to_claude_code_executable: /opt/claude-pinned/claude # exact pinned version, integrity-checked
          allowed_bots: 'renovate[bot],powerbrowser-bot[bot]' # explicit, never '*'
          show_full_output: false
          display_report: false
          prompt: ${{ inputs.trusted-prompt }} # trusted fields only; untrusted log/diff passed as framed data file
          claude_args: '--max-turns 40 --allowedTools "Bash(git -C work diff:*),Bash(scripts/regenerate-patches.sh:*),Bash(scripts/verify-platform.sh --quick),Edit(work/**),Read"'
      - uses: actions/upload-artifact@v8.0.2 # SHA-pinned per actions-selected.json at plan time
        with:
          name: fix-diff
          path: work.diff
          retention-days: 1
```

Notes: no `actions/create-github-app-token` step in this job (existing `claude-code-action` rule already red-flags the sibling [VERIFIED: scripts/verify-workflows.mjs:292-297]); `contents: read` effective (same rule red-flags `contents: write`); `ACTIONS_STEP_DEBUG` absent (new rule); `prompt:` holds no `${{ github.event.* }}` (existing `event-text` rule covers `with.prompt`).

### 9.2 `fix-gate` job skeleton (no secrets)

```yaml
  fix-gate:
    needs: fix
    runs-on: ubuntu-latest
    # NO environment:, NO secrets.* anywhere, NO id-token.
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262
        with:
          persist-credentials: false
          ref: ${{ inputs.target-branch }} # fresh checkout; fix's workspace is never trusted
      - uses: actions/download-artifact@v8.0.2
        with:
          name: fix-diff
      - uses: cachix/install-nix-action@13d8dd58da0234aa297dedd986986ccb8e7f3e24
      - name: Gate the diff
        run: nix develop .#theia --command node scripts/verify-fix-gate.mjs --diff work.diff --tag "${{ inputs.target-tag }}"
        # verify-fix-gate.mjs (new): deny-list filter -> apply -> --check fresh replay
        # -> non-vacuity -> check-patch-surface -> scan-brand-residue -> diff-theia-core.sh -> --quick
```

### 9.3 `fix-pr` job skeleton (only App-token minter)

```yaml
  fix-pr:
    needs: fix-gate
    if: needs.fix-gate.outputs.verdict == 'pass'
    runs-on: ubuntu-latest
    environment: bot
    permissions: {} # GITHUB_TOKEN carries nothing; App token does the writes
    steps:
      - uses: actions/create-github-app-token@64ab729a6294000f5aa4a4bc0b73d1f32bc45510 # v3.3.0
        id: app
        with:
          app-id: ${{ vars.BOT_APP_ID }}
          private-key: ${{ secrets.BOT_APP_KEY }}
          permission-contents: write
          permission-pull-requests: write # and nothing else: NO workflows
      - name: Open the gated fix PR
        run: node scripts/fix-open-pr.mjs # pushes claude-fix/<key>-<n>, labels claude-fix + release:<key>,
          # templated body (failing check, diff stat, paths, attempt count) + gate log, assigns owner
        env:
          GH_TOKEN: ${{ steps.app.outputs.token }}
```

### 9.4 `.github/fix-gate-deny.json` shape (FIX-11)

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

Entry list mirrors FIX-11 verbatim ("`.github/**`, `.claude/**`, `CLAUDE.md`, `scripts/verify-platform.sh`, `patches/030-*`, `powerbrowser/packaging/mar/**`, `brand/mar-*.der`, `inventory/brand-tokens.json`, `powerbrowser/endpoint-allowlist.json`, `.github/settings/actions-selected.json`, `quick-baseline.txt`, `toolchain-baseline.txt` and `flake.lock`" [VERIFIED: REQUIREMENTS.md:134]). Both the gate and `fix-gate-self-test` read this file; a deny entry without a corresponding plant (or vice versa) is a self-test failure.

### 9.5 `release-train.mjs` dispatch rule (FIX-01 + TRAIN-06, contract)

```js
// derive(facts) -> state; next(state) -> action. New transitions this phase:
//   BUMP_RED | CONFLICT (chore/esr-*, chore/node-*, renovate/theia) -> dispatchFixer({key, class: F1|F2})
//   VERIFY_RED on main -> dispatchFixer({key, class: F3})
//   BUILD_FAILED | any release.yml failure -> openIssueOnly (never dispatchFixer)
//   fixAttempts(key, class) >= 2 counted from `fix` run-names -> NEEDS_OWNER (TRAIN-03 row)
// dispatchFixer uses workflow_dispatch with validated inputs {reason: 'fix', key, class, target-branch, target-tag, fingerprint}.
// Guards (all must hold or no dispatch): head_repository == this repo; head not claude-fix/*;
// actor not bot; class in {F1,F2,F3}; key strictly greater than latest Release tag (TRAIN-01 validation).
```

Where the train does not exist yet (CONTEXT A2): land the state-table rows + fixture JSON + `derive/next/render` pure functions first; wire the jobs in Phase 43/50 order.

### 9.6 Run-name attempt counting (FIX-05)

`fix` job sets `run-name: "fix ${{ inputs.release-key }} ${{ inputs.class }} attempt ${{ inputs.attempt }}"`. `derive` lists `fix` runs by name prefix per (key, class); rejected-by-gate runs count because the count is over `fix` runs, not `fix-pr` outcomes. Third failure (attempts ≥ 2 exhausted) → NEEDS_OWNER; owner clears by merging a manual fix or dispatching a retry with a new fingerprint.

---

## 10. State of the Art

- **The pinned action (v1.0.254, `db77d4d3`) is materially hardened vs. the version PITFALLS describes.** Findings from this session's source read: actor permission checks cover entity contexts *and* `workflow_run` upstream actors (`checkWritePermissions`); Claude config paths (`.claude/`, `CLAUDE.md`, `.mcp.json`, hooks-relevant files) are restored from the base branch on PRs; subprocess env scrub + bubblewrap isolation engage under `allowed_non_write_users`; `show_full_output`/`display_report` default false with debug-mode auto-enable documented; the App-token exchange skips cleanly on validation mismatch (`WorkflowValidationSkipError` — expected on PRs that touch workflows, resolves on merge); OIDC identity tokens are file-backed with 4-minute refresh and post-run deletion. Plans should rely on these behaviors (they are read, not assumed) and add the workflow-side guards on top.
- **WIF is GA in the Claude API** with rule (`fdrl_…`) + organization scoping and optional service-account/workspace binding — no static key, no RENEWALS row for a fixer key if WIF lands (the RENEWALS row exists only for the fallback path).
- **Claude Code runtime pinning is a known gap the action leaves to the caller:** `path_to_claude_code_executable` "skips automatic installation and uses this executable instead" [CITED: action.yml at db77d4d3] — install an exact Claude Code version with checksum verification in a prior step (Nix-provided binary preferred: it inherits `flake.lock` pinning) and pass the path.
- **Three-job split (fix/fix-gate/fix-pr) is the settled pattern** (CRITIQUE C2 for ARCH/PITFALLS over STACK's two-job variant); token-revocation-in-post-step is what makes the split structural rather than conventional.
- **Precedent rows to copy:** `workflows-self-test` (in-memory plants + green controls [VERIFIED: scripts/verify-workflows.mjs:366-543]), `patches-regenerated` (byte-compare + CR-01 moved-file semantics), `verify.yml`'s `contents: read` + `persist-credentials: false` posture [VERIFIED: .github/workflows/verify.yml:38-46], `rebase-upstream.yml`'s `workflow_call` input discipline with no default [VERIFIED: .github/workflows/rebase-upstream.yml:22-34].

---

## 11. Assumptions Log

| # | Assumption | If wrong, plan impact |
|---|---|---|
| A1 | Phase 41 controls land as specified (envs branch-`main`, bot App sans Workflows, admissions, `workflows` row) | Re-pin fixer permissions/env/runner assertions (CONTEXT A1); WIF `id-token` scoping re-checked |
| A2 | `release-train.yml` + `release-train.mjs` skeleton/states arrive via Phases 43/50; this phase adds only NEEDS_OWNER + dispatch rule + fixtures | If train shape differs, the dispatch contract (§9.5) is re-targeted but the job chain is unchanged |
| A3 | No live red PR exists yet; FIX-10 proven on fixtures + staged red branch, live merge stays an owner checkpoint | If a real red PR appears earlier, reorder Wave order to take it (gate must already be green) |
| A4 | `anthropics/claude-code-action` keeps `github_token`-suppresses-exchange + WIF input semantics at the pinned SHA (SHA-pinned, so drift is impossible unless re-pinned; re-verify on any re-pin) | Re-run the F-flag check (exact file:line list in §12) before adopting a new SHA |
| A5 | Anthropic Console supports a dedicated fixer workspace with monthly cap + WIF federation rule for the account | Else fallback path (`fixer`-env `ANTHROPIC_API_KEY`, no `id-token`) activates; RENEWALS row + rotation runbook required |
| A6 | `ubuntu-latest` hosted runners can serve the `fix` workload (1.1 GB upstream fetch + `--quick`, no build) | Follows ARCHITECTURE.md sizing ("fits a hosted runner; a Gecko build does not"); re-measure `timeout-minutes` on first live run |
| A7 | `flake.lock`-pinned tooling can supply an integrity-checked Claude Code binary for `path_to_claude_code_executable` | Else checksum-verified download in a prior step; either way the version is recorded where the `workflows` row can derive it |

---

## 12. Open Questions

### F flag — RESOLVED: passing `github_token` DOES suppress the action's own OIDC App-token exchange (→ FIX-12 takes the WIF path)

Proof from the pinned source (read this session via read-only fetch; verify offline at the cited file:line when online):

1. `setupGitHubToken()` checks `OVERRIDE_GITHUB_TOKEN` (= the `github_token` input) **first** and returns it immediately — "Using provided GITHUB_TOKEN for authentication" — before any OIDC call. The OIDC fetch (`core.getIDToken("claude-code-github-action")`) + exchange (`POST https://api.anthropic.com/api/github/github-app-token-exchange`) runs **only** when no `github_token` was passed [CITED: `src/github/token.ts` at `db77d4d3` — `setupGitHubToken`, `getOidcToken`, `exchangeForAppToken`].
2. Workload identity federation is a **separate, independent** path: `setupWorkloadIdentity()` requires `ANTHROPIC_FEDERATION_RULE_ID` + `ANTHROPIC_ORGANIZATION_ID`, warns and stands down if `ANTHROPIC_API_KEY`/`CLAUDE_CODE_OAUTH_TOKEN` is set ("takes precedence, so federation will not be used"), otherwise fetches a GitHub OIDC token with audience `https://api.anthropic.com` (overridable via `anthropic_oidc_audience`), writes it to `RUNNER_TEMP/claude-workload-identity/identity-token` with 4-minute background refresh, and deletes all token material in `stop()` [CITED: `base-action/src/workload-identity.ts` at `db77d4d3`].
3. Consequence: `github_token: ${{ secrets.GITHUB_TOKEN }}` + federation inputs + `id-token: write` on the `fix` job gives **both** properties at once — no Claude App token minted (no `claude[bot]` identity, no App-token revoke needed; the revoke step is conditioned on `inputs.github_token == ''` [CITED: `action.yml` at `db77d4d3`]) **and** Claude API auth via short-lived federated token. The two OIDC uses (App-exchange audience `claude-code-github-action` vs federation audience `https://api.anthropic.com`) never share a token.
4. `checkWritePermissions` still enforces write-access actors (including the upstream-run actor for `workflow_run`) even with an explicit `github_token` — passing the token does not bypass actor checks (the `OVERRIDE_GITHUB_TOKEN` flag is *consulted by* the permission check, not a bypass of it) [CITED: `src/entrypoints/run.ts` at `db77d4d3`].

**Exact file:line to re-check when online** (in case the pin moves): `src/github/token.ts` → `setupGitHubToken` (override-first branch); `src/entrypoints/run.ts` → `checkWritePermissions(…, !!process.env.OVERRIDE_GITHUB_TOKEN)`; `base-action/src/workload-identity.ts` → `isWorkloadIdentityConfigured` + precedence warning; `action.yml` → `github_token`, `anthropic_federation_rule_id`, `show_full_output`, `display_report`, `path_to_claude_code_executable` inputs.

### Remaining (non-blocking) questions for the planner

1. **Claude Code binary source for `path_to_claude_code_executable`.** [ASSUMED] Prefer Nix-provided binary (inherits `flake.lock`); else checksum-verified download step. The `workflows` row should derive the expected version from wherever it is declared — decide the declaration site in planning.
2. **`--allowedTools` exact list.** [ASSUMED] Draft in §9.1; finalize against the fixer-prepare script's actual command set during planning (list must equal the commands the prompt permits — derive, don't hand-keep).
3. **Attempt-counter query shape.** [ASSUMED] `GET /repos/{r}/actions/workflows/release-train.yml/runs` filtered by `run-name` prefix vs `gh api` search; confirm pagination/retention assumptions in planning (runs retention, not an issue).
4. **Theia 1.77 red-PR availability for FIX-10.** [ASSUMED] per CONTEXT A3; staged red branch covers planning.

---

## 13. Environment Availability

| Need | Availability | Note |
|---|---|---|
| GitHub-hosted `ubuntu-latest` for `fix`/`fix-gate`/`fix-pr` | Available (same label family `verify.yml`/`rebase-upstream.yml` already use) [VERIFIED: .github/workflows/verify.yml:28-30] | FIX-04 compliant by construction; legion never named |
| `nix develop .#theia` (node, inkscape-side not needed here; js-yaml via `theia/`) | In-tree pattern (`verify-workflows.mjs` resolves js-yaml from `theia/package.json` [VERIFIED: scripts/verify-workflows.mjs:87-94]) | Gate scripts run Nix-wrapped in CI, plain `node` locally |
| `upstream/` fetch at target tag + 1.1 GB working space on hosted runner | Follows `rebase-upstream.yml` precedent (fetch + free-disk-space step [VERIFIED: .github/workflows/rebase-upstream.yml:50-59]) | `fix` needs the tree, never a build |
| `fixer` env secret scope (WIF: none needed; fallback: `ANTHROPIC_API_KEY`) | Env exists in settings (`environment-fixer.json`); secret is an owner action (checkpoint) | Branch policy `main` only |
| Anthropic Console fixer workspace + federation rule | **Owner action, external gate** (FIX-10 deadline 2027-05-27) | Plans end at `checkpoint:human-action` |
| Live org/repo reads | Read-only `gh api` allowed now | No writes until owner checkpoint |

---

## 14. ## Validation Architecture

Nyquist framing: every gate samples at ≥2× the rate of the change it guards. Static workflow/diff properties change at commit rate at most → gating on **every commit** (`--quick` in `verify.yml`) oversamples by orders of magnitude. Dynamic properties (attempt counts, red-stage states) change at train-wake rate → they are derived **on every train run** (hourly tick + `workflow_run` wakes), i.e. sampled at the change rate itself with immediate re-render (no aliasing: state is re-derived, never cached).

### Test framework table

| Framework | What it proves | Runtime tier |
|---|---|---|
| `scripts/verify-platform.sh --quick` registry (existing + new `fix-gate-self-test` row) | All static properties below; commit gate | quick (<30 s each row; whole table seconds–minutes, no build/browser/network) |
| `node scripts/verify-workflows.mjs --self-test` (extended) | Trust-boundary rules incl. new fixer rules; in-memory plants, zero network | <30 s [ASSUMED: follows existing in-memory design] |
| `node scripts/verify-fix-gate.mjs --self-test` (new) | Deny-list + gate-chain discrimination; plants read from `.github/fix-gate-deny.json` itself | <30 s (hermetic fixture, cf. `regenerate-patches.sh --self-test` precedent) |
| `scripts/release-train.mjs` logic self-test (extended fixtures) | TRAIN-06 routing, FIX-01 dispatch guards, NEEDS_OWNER transitions, attempt counting | <30 s (fixture JSON, no network) |
| Fixture red-branch drill (local) | End-to-end `fix`→`fix-gate`→`fix-pr` shape on a staged red branch without network writes | minutes; manual/owner-observed |
| Live proof (owner) | FIX-10 on a real red PR before 2027-05-27 | external-gate; not a CI row |

### Requirement → test map (each FIX/TRAIN-06, automated command <30 s unless marked live)

| Req | Automated check (<30 s) | Sampling rate | Wave 0 gap (what planning must sequence) |
|---|---|---|---|
| TRAIN-06 | `release-train.mjs` self-test: red-stage fixture → `train:blocked` + owner + log link rendered; `release.yml`-failure fixture → issue-only, no dispatch | every train wake (hourly + `workflow_run`) | Train skeleton/states are Phases 43/50 — land contract + fixtures first |
| FIX-01 | self-test: 3 class fixtures dispatch; `release.yml`-failure / fork-head / external-author fixtures do NOT dispatch (guard-name red) | every train wake | needs `derive` state inputs from Phase 50 |
| FIX-02 | `regenerate-patches.sh --check` green on control; `--self-test` red on hand-edited hunk | every gate run + every commit (`patches-regenerated` row) | none (in-tree) |
| FIX-03 | `workflows` self-test plants: App-token step in `fix` job → red; `fix-gate` with secrets/env → red; `fix-pr` without env `bot` → red; templated-body renderer unit check | every commit | `fix-open-pr` renderer is new — plan its fixture |
| FIX-04 | existing `legion` rule: any legion label outside `release.yml build-*`/`matrix-*` → red | every commit | none |
| FIX-05 | self-test: 2 prior `fix` run-names → 3rd failure renders NEEDS_OWNER; gate-rejected run still counted; `timeout-minutes`/`max-turns`/concurrency-group presence asserted statically | counter derived every train wake; static presence every commit | run-listing query shape (open q3) |
| FIX-06 | self-test: root checkout `ref: main` + `work/` path asserted; prompt builder test: no `work/`-sourced identity text in trusted fields | every commit | none |
| FIX-07 | `fix-gate-self-test`: green control; one planted diff per deny-file entry → rejected naming path; hand-edited hunk → rejected | every commit | new row + script are this phase's core build |
| FIX-08 | `workflows` self-test plants: tag-object SHA / wrong commit / missing `path_to_claude_code_executable` / `show_full_output: true` / `display_report: true` / `ACTIONS_STEP_DEBUG` set → red each | every commit | decide Claude Code version declaration site (open q1) |
| FIX-09 | `workflows` self-test plants: bare `Bash` in `claude_args` / missing tool allowlist / WebFetch-WebSearch not denied / `claude-fix/*` head start / bot actor / `allowed_bots: '*'` → red each; prompt-framing unit test (untrusted text only in data file) | every commit | finalize `--allowedTools` list (open q2) |
| FIX-10 | staged-red-branch drill (manual) + owner live proof (external) | once per red event; deadline 2027-05-27 | owner-gated by definition |
| FIX-11 | gate self-test derives plant list from deny file + registry parse; each plant rejected naming path; gate-chain (non-vacuity → surface → brand → theia-core → `--quick`) order asserted | every commit | registry-parse helper is new — plan it |
| FIX-12 | `docs/RELEASING.md` auth-outcome section asserted by doc-consistency check (section present, names WIF rule ID var, states fallback); static: `id-token: write` on `fix` only | every commit (static) + owner applies credential | owner-gated credential step |

**Wave 0 gaps** (must be sequenced before dependent waves): (1) `.github/fix-gate-deny.json` + `verify-fix-gate.mjs` + registry row exist before any workflow referencing them; (2) `workflows` rule extensions + plants before the fixer workflow file (otherwise the tree is red at no fault of the workflow); (3) `release-train.mjs` contract + fixtures before dispatch wiring (CONTEXT A2); (4) owner `checkpoint:human-action` (workspace, federation/key, Apps, apply) before any live dispatch; (5) staged red-branch drill before claiming the chain works.

---

## 15. ## Security Domain

### ASVS L1 (per configuration — the fixer has no application code of its own, so L1 maps to its configuration surface)

| ASVS area | Fixer control |
|---|---|
| 1. Architecture / access control | Three-job split; least-privilege `GITHUB_TOKEN`s (`contents:read`/`actions:read` → none → `{}`); App token `contents`+`pull-requests` only, no `workflows`, minted immediately before use, revoked post-step; env branch policies `main`-only |
| 2. Authentication | WIF federation (short-lived, audience-bound, auto-refreshed, post-run deleted) preferred; fallback static key confined to `fixer` env with RENEWALS rotation row |
| 3. Session / credential lifecycle | App tokens expire ≤1 h; OIDC identity tokens refresh every 4 min and are deleted by `stop()`; artifacts `retention-days: 1` |
| 4. Access control (repo) | Ruleset: 1 approving review, owner-only bypass, App-as-author cannot self-approve; `fixer`/`bot` envs unreachable from non-`main` branches |
| 5. Input validation | Train validates all dispatch inputs (tag regex, key > latest Release); prompt built from trusted fields; untrusted text framed as data; `event-text` rule over `run:` and `with.prompt:` |
| 6. Output encoding / safe rendering | `show_full_output`/`display_report` false; no `ACTIONS_STEP_DEBUG`; PR body is template-rendered, never model prose (user-facing copy rule) |
| 7. Logging / errors | No secrets in logs (action redacts; `core.setSecret` on tokens); gate verdicts name paths, not credentials |
| 8. Data protection | No signing material, no App keys, no MAR keys visible to any fixer job; `fix-gate` secretless |
| 9. Communications | All GitHub/Anthropic calls over TLS via pinned actions; no custom HTTP code except `fix-open-pr` via `gh api` with the short-lived App token |

### STRIDE (three abuse cases the phase must defeat)

| Threat | STRIDE | Attack path | Mitigation (each is a planned artifact, not advice) |
|---|---|---|---|
| Prompt injection → write credential | Tampering / Elevation / Info disclosure | Untrusted text (Renovate notes, issue text, log line, commit message) steers Claude in a job holding an App token or static key; key exfiltrated via tool output, cache, or branch content | Three-job split (Claude holds no write token); explicit `github_token` (no App-token mint in `fix`); framed data file; `--allowedTools` without bare `Bash`; no cache steps; subprocess scrub native to the action; `event-text` + actor/bot/head guards; separate Console workspace caps blast radius |
| Patch weakening (gate edits, allowlist edits, hunk text-edits, 030 touch) | Tampering | "Make it green" satisfied by editing the gate instead of the code; hand-edited hunk becomes a silent no-op; 030 edit re-roots update trust | Deny list + registry-derived file set (FIX-11); `--check` re-derivation; non-vacuity; surface/brand/theia-core/`--quick` chain; fixer may report but never touch gates |
| Gate bypass (self-merge, self-approve, env approve, legion reach, recursion) | Elevation / Repudiation | App merges own PR; approves `release`; pushes workflow naming legion; fixer triggers on its own branch in a loop | Ruleset (owner-only bypass, App cannot approve); `fix-pr` never approves/merges; hosted-only jobs; no `workflows` permission; `claude-fix/*` + bot-actor exclusions; `claude-fixer` concurrency; attempt budget + NEEDS_OWNER; audit via run-names/labels |

---

## 16. Sources

Provenance: `[VERIFIED: path:lines]` = read this session and quoted verbatim; `[CITED: url]` = remote source fetched this session; `[ASSUMED]` = planner judgment.

**Tree (VERIFIED this session):**

- [VERIFIED: .planning/workstreams/deploy/phases/52-claude-fixer-f/52-CONTEXT.md:1-62] — phase boundary, locked decisions, owner gates, A1–A3 assumptions, research-flag definition.
- [VERIFIED: .planning/workstreams/deploy/REQUIREMENTS.md:123-141] — TRAIN-06 ("A red stage labels its tracking issue `train:blocked`, assigns the owner and links the failing log. It starts the fixer when the failure class is fixable (FIX-01). Failures in `release.yml` cause the report job to open an issue only; the fixer is not started") and FIX-01…FIX-12 binding text.
- [VERIFIED: .planning/workstreams/deploy/ROADMAP.md:312-327] — Phase 52 goal, dependencies, five success criteria, external gate, research flag F.
- [VERIFIED: CLAUDE.md:24-44,91-171] — hard rules (Theia/upstream, brand scan, regenerate, one driver, user copy, Nix shells).
- [VERIFIED: scripts/verify-workflows.mjs:15-65,113-135,270-327,366-543] — rule catalogue, runner/legion/permission/event-text enforcement, self-test plant/control pattern.
- [VERIFIED: .github/workflows/verify.yml:38-53] — `contents: read` + `persist-credentials: false` + pinned SHA anchors.
- [VERIFIED: .github/workflows/rebase-upstream.yml:22-34] — `workflow_call` tag input with no default (AUTO-08 pattern to copy for fixer dispatch inputs).
- [VERIFIED: .github/settings/actions-selected.json:1-7] — `github_owned_allowed: true`, `cachix/install-nix-action@*` admitted (fixer admissions extend this file).
- [VERIFIED: .github/settings/environment-fixer.json:1-6] — `custom_branch_policies: true` (branch-`main` restriction mechanism).
- [VERIFIED: scripts/regenerate-patches.sh:1-40] — regeneration semantics, CR-01 moved-file ±-only compare, 10-hex pins.
- [VERIFIED: scripts/check-patch-surface.sh:1-60] — compiled-suffix + brand-value scans from patch-owned headers.
- [VERIFIED: scripts/diff-theia-core.sh:1-50] — two-stage Theia-core integrity check.
- [VERIFIED: .planning/research/v1.6-deploy/ARCHITECTURE.md:245-292,309-336] — §5 fixer design (classes, three-job chain, spend layers, credential choice, permission matrix, token revocation).
- [VERIFIED: .planning/research/v1.6-deploy/SUMMARY.md:295-307] — Phase F scope + Theia-1.77 first exercise.
- [VERIFIED: .planning/research/v1.6-deploy/CRITIQUE.md:79-104,135-159] — C2 (three jobs), C4 (F flag), C11 (byte-equality), correction 20 (commit pin).
- [VERIFIED: .planning/research/v1.6-deploy/PITFALLS.md:28-94] — Pitfalls 1–3 (injection, gate weakening, recursion/spend) with controls.
- [VERIFIED: .planning/research/v1.6-deploy/STACK.md:82-94] — fixer stack table (action SHA, WIF inputs, spend flags, patch-rule flags).

**Remote (CITED — read-only fetch, no writes):**

- [CITED: https://raw.githubusercontent.com/anthropics/claude-code-action/db77d4d3c98f3f6380e7cd45ffba2342a3dbde3c/action.yml] — inputs (`github_token`, `anthropic_federation_rule_id/_organization_id/_service_account_id/_workspace_id/_oidc_audience`, `allowed_bots`, `allowed_non_write_users`, `path_to_claude_code_executable`, `show_full_output`/`display_report` defaults false, outputs incl. `github_token`), revoke step conditioned on `inputs.github_token == ''`.
- [CITED: https://raw.githubusercontent.com/anthropics/claude-code-action/db77d4d3c98f3f6380e7cd45ffba2342a3dbde3c/src/github/token.ts] — `setupGitHubToken` override-first (F-flag proof), `getOidcToken("claude-code-github-action")`, `exchangeForAppToken`, `WorkflowValidationSkipError`.
- [CITED: https://raw.githubusercontent.com/anthropics/claude-code-action/db77d4d3c98f3f6380e7cd45ffba2342a3dbde3c/src/entrypoints/run.ts] — `checkWritePermissions` incl. upstream actor, base-branch config restore, `installClaudeCode` (2.1.304 `curl|bash`, custom-executable skip).
- [CITED: https://raw.githubusercontent.com/anthropics/claude-code-action/db77d4d3c98f3f6380e7cd45ffba2342a3dbde3c/base-action/src/workload-identity.ts] — federation requirements, key-precedence warning, audience default, 4-min refresh, `stop()` deletion.
- [CITED: https://raw.githubusercontent.com/anthropics/claude-code-action/db77d4d3c98f3f6380e7cd45ffba2342a3dbde3c/docs/security.md] — actor/bot controls, `allowed_non_write_users` semantics, checkout patterns, config-restore list.

**Judgment (ASSUMED):** open questions 1–3 (§12), Wave-0 sequencing emphasis, `--allowedTools` draft list, run-listing query shape, timing (<30 s) estimates for not-yet-written scripts (based on the in-memory/hermetic precedents cited).

---

## 17. Metadata

- **Phase:** 52 (F) — Claude fixer
- **Requirements covered:** FIX-01…FIX-12, TRAIN-06 (13 IDs, all addressed in §3 + §14 map)
- **Depends on:** Phase 50 (release states), Phase 51 (Renovate Theia branch as fixer class); assumes CONTEXT A1–A3
- **External gates (owner):** Console fixer workspace + monthly cap; OIDC federation or `fixer`-env key; Apps/apply; FIX-10 live proof before 2027-05-27
- **Research flag F:** RESOLVED → WIF `id-token: write`-only path (proof §12)
- **New files planned:** `.github/fix-gate-deny.json`, `scripts/verify-fix-gate.mjs` (+ registry row `fix-gate-self-test`), `scripts/fixer-prepare.sh`, `scripts/fix-open-pr.mjs`, `release-train.mjs` additions (NEEDS_OWNER + dispatch + fixtures), `docs/RELEASING.md` sections, extended `scripts/verify-workflows.mjs` + `actions-selected.json` admissions
- **Files deliberately NOT created:** any new workflow-verifier, any second verify driver, any stored-state counter
- **Network posture of this research:** read-only fetches of pinned public source + in-tree reads; zero network writes
- **Ready for planning:** yes — Wave 0 gaps listed (§14); owner checkpoint shape defined (CONTEXT)

*(End of 52-RESEARCH.md)*
