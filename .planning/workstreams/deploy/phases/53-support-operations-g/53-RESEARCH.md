# Phase 53: Support operations (G) - Research

**Researched:** 2026-10-23
**Domain:** In-browser bug reporting, Claude issue triage, security notification routing, Codeberg mirroring, Upptime status page, support-operations docs
**Confidence:** MEDIUM overall (HIGH for in-tree integration points read this session; MEDIUM for GitHub/Cloudflare/Codeberg/Upptime platform mechanics from official docs and live read-only probes; LOW where marked [ASSUMED])

## Summary

Phase 53 makes support work without building a server: a "PowerBrowser: Report a Bug" command in the Theia sidecar opens the GitHub `bug.yml` form prefilled in the stock browser window; a `triage.yml` workflow running Claude Haiku labels every new issue and posts a fixed template comment; private vulnerability reports and `security@` mail reach the owner as phone notifications within the `SECURITY.md` window; a legion systemd timer mirrors git+tags to Codeberg daily; an Upptime repo serves `status.powerbrowser.org`; and `docs/RELEASING.md` gains a support-operations section.

All three dependencies (Phase 47 mail, Phase 51 Codeberg sweep row, Phase 52 FIX-08 pinning) are unfinished. This research records the assumed contracts and does not plan their work. Every live-state change (landing `triage.yml`, Upptime repo creation, `status` CNAME, Codeberg mirror creation), every secret/token, every legion `/etc/nixos` edit finished with `nrs`, and every phone-notification proof are owner actions — Phase 53 plans build everything locally and end with one `checkpoint:human-action`.

**Primary recommendation:** Build TEL-05 as a `FrontendApplicationContribution` binding in the existing branding module plus a diagnostics Copy button that never puts diagnostics in a URL; build GH-03 as a `triage.yml` that follows PITFALLS.md Pitfall 1 verbatim (Haiku, `issues: write` only, `allowed_non_write_users: "*"`, Claude picks label-set + template-id, non-AI step posts fixed text, never closes); build GH-04 as a legion systemd timer + sweep SHA-compare row; build MON-02 as an Upptime template repo (which alone may use `schedule:`); prove GH-17 by notification drill plus window-text assertion, not by building private-reporting UI; gate everything with `verify-platform.sh` registry rows that derive expectations from the tree and compare as set equality with `--self-test` siblings.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Report-a-Bug command + prefill URL | Browser client (Theia frontend) | — | User gesture in the sidecar; opens stock window via existing GUI-01 path |
| Diagnostics Copy button | Browser client (Theia frontend + chrome diagnostics layer) | — | Clipboard-only transport; never URL query params |
| Issue triage (labels + template comment) | CI / GitHub Actions (`triage.yml`) | Anthropic API (Haiku) | No server; stateless per-`issues: opened` run, exactly like fixer split |
| Spend limits / workspaces | External service (Anthropic Console) | — | Hard ceiling lives outside the repo; repo only asserts key scoping |
| Security notification routing | External service (GitHub Mobile + phone + mail routing) | CI (drill workflow precedent) | Notification path is platform-owned; repo proves window text + drill evidence |
| Codeberg mirror push | Host (legion systemd timer) | — | Needs a persistent host credential; hosted runner has no push secret |
| Mirror-lag detection | CI (maintenance sweep job) | Public Codeberg API | Unauthenticated SHA compare; failure lands in maintenance issue |
| Status page | External repo (Upptime on Pages) | CI (sweep liveness row) | D-77 forbids `schedule:` in product repo; Upptime repo is outside it |
| Support-operations docs | Repo docs (`docs/RELEASING.md`) | — | Derived-from-tree section checked by a doc-to-automation row |

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

### Already decided (owner, 2026-10-20)
- All owner decisions in REQUIREMENTS.md "Owner Decisions" are binding (SEED-002 §12 recommended defaults plus the research additions): Apps only, no PATs; bot App without the Workflows permission; non-ephemeral legion runner later (Phase 49); fork approval for all external contributors; tags created only by the bot App after `release` approval.
- Decision 13: no version facts on the home page; no `release.json` committed by any workflow.
- Decision 21: fixer limits (PRs only, never merge/approve/sign; spend-limited; patches only through `regenerate-patches.sh`) apply by analogy to triage: triage never closes an issue, never merges, never holds a write credential beyond `issues: write`.
- The `triage` environment admits only `main` (GH-07, already declared in `.github/settings/environment-triage.json`).

### Owner gates in this phase (stop points for autonomous execution)
- Every change to live GitHub state (landing `triage.yml`, issue-form/label changes owned by Phase 42, Upptime repo creation, `status` CNAME, Codeberg mirror repo creation), every secret or token (Anthropic triage workspace key or OIDC federation, Codeberg deploy token on legion), every legion `/etc/nixos` edit finished with `nrs`, and every phone-notification proof (private vulnerability report, security@ message, GH-17 acknowledgement-window timing) are owner actions. Plans build everything locally — declared workflow files, scripts, verifier rows and their self-tests, `docs/RELEASING.md` support-operations section draft, timer unit file — and end with one `checkpoint:human-action` listing the exact commands, after which the live rows run.
- Read-only `gh api` calls against the live org/repo are allowed for research and for read-back rows.

### Claude's Discretion
All other implementation choices are at Claude's discretion — discuss phase was skipped per user setting. Use the ROADMAP phase goal, success criteria, and codebase conventions to guide decisions.

### Deferred Ideas (OUT OF SCOPE)
None — discuss phase skipped.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TEL-05 | Command "PowerBrowser: Report a Bug" opens `issues/new?template=bug.yml` in the stock window, prefilled with version, OS and install format; Copy button on diagnostics layer copies diagnostics which never appear in a URL; one `github.com` allowlist row carries `user-initiated` disposition (UPD-33). | Architecture Patterns §TEL-05 (branding-module binding + `window.open`/stock-tab path + prefill-subset row); Standard Stack (no new package); Validation `bug-report-affordance` row; Env `github.com user-initiated` already in tree |
| GH-03 | `triage.yml` runs on `issues: opened` in env `triage` with `claude-haiku-5-5`, `allowed_non_write_users`, explicit `GITHUB_TOKEN` with `issues: write` only, concurrency group, under FIX-08 pinning rules. Claude selects labels + template id; non-AI step posts fixed template text. Never closes. Planted-instruction issue gets only template comment. | Architecture Patterns §GH-03 (two-step AI-select/human-post split per PITFALLS Pitfall 1); Standard Stack triage pin + Haiku; Security STRIDE prompt-injection row; Validation `triage-workflow` + `workflows` widen |
| GH-16 | Triage uses its own Anthropic Console workspace with monthly spend limit. | Standard Stack workspace row [ASSUMED]; Validation `renewals` + manual checkpoint (no API to assert a Console limit from CI) |
| GH-17 | Private vulnerability reports and security@ mail reach owner as GitHub Mobile + phone notifications within `SECURITY.md` acknowledgement window. | Architecture Patterns §GH-17 (drill precedent `notify-drill.yml` + GH-18 assignment/proof pattern); Validation manual-only phone proof + `repo-controls` private-reporting flag; Open Question: private-reporting route carried-unresearched |
| GH-04 | Daily systemd timer on legion pushes git+tags to Codeberg mirror with deploy token held on legion; sweep Codeberg row red on lag. | Architecture Patterns §GH-04 (timer unit + unauthenticated SHA compare); Standard Stack systemd row; Validation `codeberg-mirror` rows; Pitfall silent-mirror |
| MON-02 | Upptime repo on GitHub Pages serves status page at status.powerbrowser.org covering updates host, website, `/events`; sweep reports Upptime workflow state + last-run age. | Architecture Patterns §MON-02 (Upptime template repo outside product repo, may use `schedule:`); Standard Stack Upptime row [ASSUMED]; Validation `upptime-sweep` row |
| DOC-07 | `docs/RELEASING.md` gains support-operations section: triage, Discussions moderation, private vulnerability reports, CodeQL alerts after each rebase, rule that no fork PR workflow run is approved without reading its diff. | Architecture Patterns §DOC-07 (derived doc section + doc-to-automation gate following `releasing-maintenance` precedent); Validation doc row |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

1. **Never fork or patch Theia core.** Theia-side additions are `@powerbrowser/*` extensions composed into the sidecar; upstream Theia adopted by re-pinning only. Check: `scripts/diff-theia-core.sh`. TEL-05 therefore binds its contribution in the existing branding module — no new package, no core edit [VERIFIED: theia/extensions/branding/src/browser/powerbrowser-frontend-module.ts:9-28].
2. **Never modify Gecko outside the patch stack.** `upstream/` fetched by `scripts/fetch-upstream.sh`, never hand-edited (`git -C upstream diff` empty invariant). Firefox internals only through `powerbrowser/shell/PowerBrowserAPI.sys.mjs`, catalogued in `powerbrowser/INTERNAL-APIS.md`, enforced by `scripts/check-internals-boundary.sh`. TEL-05 adds no new Gecko internal; if a new shell message kind is needed it is catalogued (current kinds verbatim: `new Set(["shellStateLoad", "shellStateSave", "shellFlushed", "shellArmWebTabHistory"])` [VERIFIED: powerbrowser/shell/PowerBrowserAPI.sys.mjs:295]).
3. **Design for the bridge.** Nothing welds Theia to full-window presentation; `TabUriRegistry` shape asserted by `scripts/verify-registry-shape.mjs`. Report-a-Bug must not assume full-window Theia.
4. **Repo at a path with no space.** Reference host `/home/chris/coding/Power-Browser` compliant; this worktree `/home/chris/gsd-workspaces/deploy/dsh/phase-53` compliant. Do not move under a spaced path (breaks `NIX_LDFLAGS` splitting).
5. **Theia is default GUI; stock browser chrome is reachable.** Stock window opens via `window.open(url, '_blank')` from Theia frontend [VERIFIED: theia/extensions/tab-uris/src/browser/browser-window-command.ts:174-192]; `BROWSER_CHROME_URL` is stock upstream chrome; no chrome-side command registered (ratified design). TEL-05 reuses exactly this path. No custom browser chrome authored.
6. **Residual-brand scan is a permanent gate.** `node scripts/scan-brand-residue.mjs` exit 0, wired into rebase. Stage new files before trusting a green scan (`git ls-files` iteration trap). `inventory/brand-tokens.json` is the only place the originating product may be named.
7. **Patches regenerated, never text-edited.** Via `scripts/regenerate-patches.sh`; hand-edited hunk degrades to silent no-op.
8. **One driver, one registry.** `scripts/verify-platform.sh`; adding a check = appending one row. Commands: `scripts/verify-platform.sh --quick` (commit gate), `scripts/verify-platform.sh --only <label>` (single check), full, `--gate`. Never assert on absence of a log line unless the emitter is proven; derive expectation from tree and compare as set equality; every row gets `--self-test` planting each fault red naming the drift.
9. **User-facing copy.** Names product "PowerBrowser", no internal identifier (no pref key, sentinel, port, timeout, raw exception), ends with a real on-screen next step; identifiers live as labelled rows in diagnostics layer. Enforced by `shell-error-copy-no-internals` pattern (extend to TEL-05/updater strings per UPD-32).
10. **Environment.** Builds inside Nix dev shells (`nix develop .#firefox`, `nix develop .#theia`); `node` works outside, `yarn` does not. Cheap static gates before expensive builds.

## Standard Stack

### Core

| Library / Unit | Version | Purpose | Why Standard |
|---|---|---|---|
| `anthropics/claude-code-action` pinned by commit `db77d4d3c98f3f6380e7cd45ffba2342a3dbde3c` (v1.0.254, NOT tag object `c335fd6d`) [ASSUMED — pin value from prior research, not re-fetched this session; in-tree `verify-workflows.mjs` admits the mechanism but no `triage.yml` exists yet] | `db77d4d3c98f3f6380e7cd45ffba2342a3dbde3c` | Claude triage job | FIX-08 contract; tag object `c335fd6d` must NOT be used [CITED: .planning/research/v1.6-deploy/STACK.md:38; CITED: .planning/research/v1.6-deploy/CRITIQUE.md:64] |
| Claude Code binary via `path_to_claude_code_executable` (exact version, integrity-checked install step) [ASSUMED] | exact version recorded in workflow + allow-list at plan time | Pins the agent binary the action SHA does not cover | ARCHITECTURE.md §5: action "downloads Claude Code at run time outside the pin"; `path_to_claude_code_executable` skips auto-install [CITED: .planning/research/v1.6-deploy/ARCHITECTURE.md:285] |
| Triage model `claude-haiku-5-5` [ASSUMED — model id from prior stack research, not re-queried against Anthropic API this session] | `claude-haiku-5-5` | Labels + template-id selection only | Cheap (USD 0.10/0.50 per MTok per STACK.md), sufficient for classification; fixer uses Opus, triage uses Haiku with separate workspace/budget [CITED: .planning/research/v1.6-deploy/STACK.md:88] |
| Upptime (`upptime/upptime` template) [ASSUMED — template existence confirmed read-only via `gh api repos/upptime/upptime` (`default_branch: master`, description uptime monitor); no status repo exists yet] | template HEAD at creation time, recorded in plan | Public status page + dead-man watchdog host | Owner decision 22 keeps Upptime alongside MON-01 watchdog; only repo allowed `schedule:` (D-77 binds product repo only) |
| legion `systemd` timer + service (`systemd 260` [VERIFIED: Bash probe `systemctl --version`]) | OS-provided 260 | Daily Codeberg push | SEED-002 row-14 shape; host credential never leaves legion; failure made visible by sweep row instead of silent |
| `scripts/verify-workflows.mjs` trust-boundary gate [VERIFIED: scripts/verify-workflows.mjs:16-56 — rules table comments: `uses-pinned`, `uses-admitted`, `no-schedule`, `runner`, `legion`, `claude-code-action`, `issues-write`, `workflow-run-guard`, `workflow-run-chain`, `write-trio`, `no-pr-trigger`, `no-cache`, `event-text`] | in-tree | Commit-time enforcement of GH-03/FIX-08 shape | Already green; Phase 53 widens `issues-write` (triage.yml) and FIX-08 assertions, never weakens |

### Supporting

| Library / Unit | Version | Purpose | When to Use |
|---|---|---|---|
| `actions/checkout` SHA-pinned + `persist-credentials: false` precedent [VERIFIED: .github/workflows/verify.yml:42-45 — `uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4.4.0` with `persist-credentials: false`] | v4.4.0 at cited SHA | Triage checkout (if any) without leaving credential | Every triage/fixer job touching third-party text |
| `notify-drill.yml` pattern [VERIFIED: .github/workflows/notify-drill.yml:17-25 — `permissions: {}` + `environment: release` + `timeout-minutes: 5`, re-runnable drill] | in-tree | GH-17/GH-18 phone-proof template | GH-17 proof dispatches from main, waits on required reviewer, owner rejects from phone |
| `environment-triage.json` shell [VERIFIED: .github/settings/environment-triage.json:1-6 — `"deployment_branch_policy": {"protected_branches": false, "custom_branch_policies": true}`] | in-tree | Triage env admission base | GH-07 owns shell; Phase 53 asserts `main`-only policy via `repo-controls`, does not create env |
| `workflow-permissions.json` default [VERIFIED: .github/settings/workflow-permissions.json:1-4 — `"default_workflow_permissions": "read", "can_approve_pull_request_reviews": false`] | in-tree | Least-privilege default | Triage declares explicit `issues: write` only; effective-permissions logic in verifier [VERIFIED: scripts/verify-workflows.mjs:126-134] |
| `actions-selected.json` admission base [VERIFIED: .github/settings/actions-selected.json:1-7 — `"github_owned_allowed": true, "verified_allowed": false, "patterns_allowed": ["cachix/install-nix-action@*"]`] | in-tree | Action allow-list | Phase 53 adds `anthropics/claude-code-action@*` admission in same commit as `triage.yml` |
| `endpoint-allowlist.json` `github.com` row [VERIFIED: powerbrowser/endpoint-allowlist.json:89-94 — `"host": "github.com", "disposition": "user-initiated"`] | in-tree | TEL-05 egress gate | Unattended resolution fails like `deny` (UPD-33); prefetch closed by `network.dns.disablePrefetch = true` per row reason |
| `verify-platform.sh` registry [VERIFIED: scripts/verify-platform.sh:3555 — `Every check in this repo, in one array. Each entry is "label|command"`; quick block opens ~3565] | in-tree | All new checks land here | `scripts/verify-platform.sh --only <label>` per-row gate |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|---|---|---|
| Upptime status page | Custom static page + Worker liveness | Custom page needs a new clock; Upptime is the owner-kept decision 22 — do not revisit |
| legion systemd timer | Release-train push job with mirror env secret | Hosted job exposes failure in tracking issue but puts a push credential in Actions; timer keeps credential on legion per Apps-only/no-PAT posture — use timer |
| Haiku triage | Opus triage | 40x cost for classification; Haiku + template-only post is the researched shape |
| OIDC federation for Anthropic | Static `ANTHROPIC_API_KEY` in `triage` env | OIDC leaves no static key; fallback is key in `triage` env only (branch `main`) if federation blocked — record outcome in RELEASING.md per FIX-12 |

**Installation:** No package installation. No `npm install`, no new Theia package, no new binary. Triage action version arrives via SHA pin; Claude Code binary via `path_to_claude_code_executable` install step with integrity check (plan records exact version); Upptime via template-repo creation (owner action); timer via `/etc/nixos` (owner action).

**Version verification:** No registry query run (nothing to install). The two pre-pinned inputs carried verbatim: action commit `db77d4d3c98f3f6380e7cd45ffba2342a3dbde3c` and model id `claude-haiku-5-5`, both [ASSUMED] pending plan-time re-verification against action source and Anthropic model table.

## Package Legitimacy Audit

No npm, PyPI, or crates installs in this phase. Statement of compliance:

| Package | Registry | Verdict | Disposition |
|---|---|---|---|
| (none — no installs) | — | — | — |

- **Packages removed due to [SLOP] verdict:** none (nothing proposed).
- **Packages flagged as suspicious [SUS]:** none.
- **Pre-pinned inputs carried (not installs, legitimacy gate does not apply but planner must re-verify at plan time):** `anthropics/claude-code-action@db77d4d3c98f3f6380e7cd45ffba2342a3dbde3c` (GitHub Action commit pin, FIX-08) [ASSUMED]; model id `claude-haiku-5-5` (Anthropic model id, GH-03) [ASSUMED]. Planner adds a verification task: confirm commit `db77d4d3…` is the `v1.0.254` commit (not tag object `c335fd6d`) and confirm the Haiku model id is current before landing `triage.yml`.

## Architecture Patterns

### System Architecture Diagram

```
 THEIA SIDECAR (user gesture)          STOCK WINDOW (GUI-01 path)         GITHUB
 ┌──────────────────────────┐          ┌──────────────────────┐          ┌────────────────────────┐
 │ branding contribution     │  prefill │ issues/new?template=  │          │ bug.yml (Phase 42)      │
 │ "PowerBrowser: Report    │  URL     │ bug.yml?version=&os=  │─────────▶│ field ids version/os/   │
 │  a Bug" command           │─────────▶│ &install_format=      │ user-    │ install_format          │
 │ + diagnostics Copy button │ clipboard│ (diagnostics NEVER    │ initiated│ labels type/bug,        │
 │   (clipboard only)        │  only    │  in URL)              │ github.com│ needs-triage            │
 └──────────────────────────┘          └──────────────────────┘          └───────────┬────────────┘
                                                                             issues: opened
                                                                                  │
                                                                                  ▼
                                                                     ┌────────────────────────┐
                                                                     │ triage.yml (env triage)│
                                                                     │ Haiku selects labels + │
                                                                     │ template id; NON-AI    │
                                                                     │ step posts fixed text  │
                                                                     │ never closes           │
                                                                     └───────────┬────────────┘
                                                                                 │ issues: write only
                                                                                 ▼
                                                                     ┌────────────────────────┐
                                                                     │ issue: labels +        │
                                                                     │ template comment       │
                                                                     └────────────────────────┘

 SECURITY ROUTE (out of band)            MIRROR / STATUS (outage cover)
 ┌──────────────────────────┐          ┌──────────────────────┐     ┌───────────────────────┐
 │ SECURITY.md window text   │ drill    │ legion systemd timer  │push │ Codeberg mirror       │
 │ + private-reporting flag  │─────────▶│ git+tags daily (token │────▶│ main SHA (public API) │
 │ + security@ routing       │ phone    │ on legion only)       │     └──────────┬────────────┘
 │ (Phase 47 mail assumed)   │ proof    └──────────────────────┘                │ compare
 └──────────────────────────┘          ┌──────────────────────┐                ▼
 │ GH Mobile + phone notify  │◀────────│ maintenance sweep row │◀── red on lag
 └──────────────────────────┘          │ + Upptime workflow   │
                                       │   state + last-run   │
                                       └──────────────────────┘
                                                  │
                                                  ▼
                                       ┌──────────────────────┐
                                       │ Upptime repo (Pages) │
                                       │ status.powerbrowser  │
                                       │ .org: updates host,  │
                                       │ website, /events     │
                                       └──────────────────────┘
```

Reader trace: click Report-a-Bug → prefilled form in stock window (TEL-05); open issue → template reply in seconds (GH-03); security report → phone buzz inside window (GH-17); GitHub down → Codeberg SHA + status page still answer (GH-04/MON-02).

### Recommended Project Structure

```
.github/workflows/triage.yml          # GH-03 (NEW, declared locally, landed by owner)
scripts/verify-triage.mjs             # GH-03 row logic (NEW) or widen verify-workflows.mjs
scripts/verify-codeberg-mirror.mjs    # GH-04 sweep-row helper (NEW, full-tier network half in sweep)
scripts/verify-upptime.mjs            # MON-02 sweep-row helper (NEW)
theia/extensions/branding/src/browser/
  powerbrowser-frontend-module.ts     # TEL-05 binding added (no new package)
  powerbrowser-report-bug-contribution.ts  # TEL-05 contribution (NEW file in branding ext)
powerbrowser/endpoint-allowlist.json  # github.com row already user-initiated (assert, don't add)
docs/RELEASING.md                     # DOC-07 section appended (support-operations)
/etc/nixos/configuration.nix          # GH-04 timer (owner action, declared unit file in repo)
```

### Pattern 1: TEL-05 prefill-subset + clipboard-only diagnostics

**What:** Command `PowerBrowser: Report a Bug` builds `https://github.com/<org>/<repo>/issues/new?template=bug.yml&version=<v>&os=<os>&install_format=<fmt>` with exactly the three prefill fields; opens via the GUI-01 path (`window.open(target, '_blank')` fallback, or `openStockTab` channel when alive [VERIFIED: theia/extensions/tab-uris/src/browser/browser-window-command.ts:174-192]). Diagnostics travel via the diagnostics layer Copy button (clipboard) only — never query params. A verifier row derives the prefill param set from the contribution source and asserts subset of `bug.yml` field ids, plus origin/path agreement with the manifest key (precedent: `bug-report-affordance` row contract in RELEASING.md verification map [VERIFIED: docs/RELEASING.md:848]).

**When to use:** Every user-initiated GitHub navigation from the sidecar.

**Example:**

```typescript
// Source pattern: GUI-01 openBrowserWindow(url?) contribution
// [VERIFIED: theia/extensions/tab-uris/src/browser/browser-window-command.ts:174-192]
const params = new URLSearchParams({ template: 'bug.yml', version, os, install_format: installFormat });
const target = `https://github.com/${owner}/${repo}/issues/new?${params.toString()}`;
// route through the same sink the GUI-01 command owns:
commands.executeCommand('powerbrowser.open-browser-window', target);
// diagnostics: navigator.clipboard.writeText(diagnosticsText) — never appended to target
```

### Pattern 2: GH-03 two-step triage (AI selects, deterministic step posts)

**What:** `triage.yml` on `issues: opened`, `environment: triage`, explicit `permissions: { issues: write }` (effective issues write only on triage jobs per verifier rule [VERIFIED: scripts/verify-workflows.mjs:39-40]), `concurrency: { group: triage }`, FIX-08 pins verbatim. Step 1 (claude-code-action, Haiku, `allowed_non_write_users: "*"`, no `Bash` except two capped label/comment scripts, `show_full_output: false`, no `ACTIONS_STEP_DEBUG`) outputs only `{ labels: [...], template_id: "..." }` constrained to `labels.json` + tracked templates. Step 2 (non-AI, `gh issue edit/comment` or script) applies labels and posts the fixed template text. No close step exists. `verify-workflows.mjs` `event-text` rule (no `github.event.(issue|comment|pull_request|head_commit|review)` inside `run:`/`prompt:` [VERIFIED: scripts/verify-workflows.mjs:53-56]) plus `issues-write` rule enforce the shape at commit time.

**When to use:** All stranger-triggered AI (the only job allowed `allowed_non_write_users: "*"` per PITFALLS.md Pitfall 1 [VERIFIED: .planning/research/v1.6-deploy/PITFALLS.md:28]).

### Pattern 3: GH-04 timer + unauthenticated SHA compare

**What:** legion `systemd` timer (`OnCalendar=daily`, `Persistent=true`) runs a oneshot service that `git fetch origin` + `git push --mirror` (or `+refs/heads/*:+refs/heads/*` + tags) to Codeberg over a deploy token stored on legion only (mode 0600, never in repo, RENEWALS row per DOC-04). Sweep row fetches Codeberg `main` SHA via public unauthenticated API (`GET https://codeberg.org/api/v1/repos/{owner}/{repo}/branches/main`) and GitHub `main` SHA, compares; red on mismatch older than threshold. This converts "failed timer is silent" into a detected failure (ARCHITECTURE.md §4.4 item 6 [VERIFIED: .planning/research/v1.6-deploy/ARCHITECTURE.md:236-237]).

**When to use:** Any host-held mirror; same shape would serve future forges.

### Pattern 4: MON-02 Upptime outside the product repo

**What:** Separate `powerbrowser-status` repo created from `upptime/upptime` template, Pages branch serves `status.powerbrowser.org` via `status` CNAME. Its own `schedule:` workflow polls updates host, website, `/events` (D-77 binds product repo only, so this is permitted). Sweep reports Upptime workflows enabled-state + last-run age via `gh api repos/{org}/powerbrowser-status/actions/runs`. No `schedule:` ever lands in product repo (`no-schedule` rule [VERIFIED: scripts/verify-workflows.mjs:25-26]).

### Pattern 5: DOC-07 derived doc section

**What:** `docs/RELEASING.md` support-operations section follows the `releasing-maintenance` precedent (doc agrees with automation by derivation [VERIFIED: docs/RELEASING.md:852]): each documented trigger/job id/template id is derived from the workflow files at check time; plants (removed trigger, renamed job, deleted template) go red. Extends the existing maintenance section (sweep rows pattern for Codeberg/Upptime additions per CONTEXT.md code context).

### Anti-Patterns to Avoid

- **Free-text bot post:** letting Claude write the comment body — attacker-controlled text ships under the bot identity. Post fixed template text only (Pitfall 1 §5).
- **`allowed_bots: '*'` on triage/fixer:** any third-party App can then trigger; use explicit list or none (PITFALLS integration gotcha).
- **Bare `Bash` in triage:** turns prompt injection into code execution; allow only two capped label/comment scripts.
- **Mirroring inside release-train with an Actions secret:** puts a push credential where fork-triggered code could reach; keep the token on legion.
- **`schedule:` in product repo to poll Codeberg/Upptime:** violates D-77 and hits the 60-day disable; cadence lives in timer + Upptime repo + train tick.
- **Hand-kept label/template lists in the verifier:** derive from `labels.json` + `ISSUE_TEMPLATE/*.yml` + workflow files and compare as set equality.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---|---|---|---|
| Status page + polling + incident history | Custom Worker cron poller + hand-built page | Upptime template repo (owner decision 22) | Scheduled checks, history, Pages hosting already solved; custom build re-adds the `schedule:`/quota problems Pitfall 9 warns about |
| Mirror-and-alert | Custom daemon with its own state file | systemd timer + sweep SHA-compare row | Timer is the platform primitive (persistent, logged, `Persistent=true` catches up); sweep makes silence visible without new infra |
| AI classification + reply | Custom API caller step with free-text post | `anthropics/claude-code-action` pinned SHA + Haiku + deterministic post step | Pinning, OIDC/key handling, `allowed_non_write_users` semantics already reviewed; custom caller re-litigates prompt-injection boundary |
| Workflow trust checks | Ad-hoc grep in CI | `verify-workflows.mjs` (`workflows` row) + `zizmor --offline` row | Whole-set invariants (no `schedule:`, SHA pins, `issues: write` scope, event-text) only checkable over every file; already green |
| Prefill/URL correctness | Manual QA of the bug URL | `bug-report-affordance`-shaped row (prefill ⊆ field ids, origin/path vs manifest) | Derives from tree, goes red on addition and removal; manual QA drifts |
| Phone-notification proof | Synthetic unit test of a mail config | `notify-drill.yml` re-runnable drill + GH-18 assignment proof pattern | Only a real pending-deployment approval + real assignment proves the phone path |

**Key insight:** Support operations are trust-boundary work, not feature work. Every custom solution re-opens the exact hole the in-tree gates already close (prompt injection, silent mirror, schedule creep). Reuse the gate; add rows.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|---|---|---|---|---|
| `gh` CLI + auth | Triage landing, sweep read-back rows, Upptime probe | ✓ (logged in as ServerDestroyer, repo `powerbrowser` public, `default_branch: main`) | `gh 2.102.0 (nixpkgs)` | None — owner actions need `gh`; planner must keep all `gh` writes behind `checkpoint:human-action` |
| GitHub REST (read-only GETs) | Research probes, `repo-controls`/`workflows` rows | ✓ (`GET repos/DeBIOS-Foundation/powerbrowser` 200; `branches/main` SHA `0efb116c…`; `repos/upptime/upptime` 200) | REST v3 | Fixture-based `--self-test` for offline CI |
| Codeberg API | GH-04 sweep SHA compare | ✓ (`https://codeberg.org/api/v1/version` 200; `api.codeberg.org` host itself 000 — use `codeberg.org/api/v1` base) | v1 | None for the compare itself; timer creation is owner action regardless |
| Upptime template + Pages | MON-02 | ✓ (`https://upptime.js.org` 200; `upptime/upptime` template reachable) | template HEAD at creation | None — owner creates repo; sweep reports state after |
| `systemd` timers | GH-04 timer shape | ✓ (`systemd 260`, `systemctl list-timers` works) | 260 | None on legion (NixOS owns timers); unit file drafted in repo, applied by owner via `nrs` |
| `node` | All verifier rows | ✓ | `v24.9.0` | None needed |
| `js-yaml` via `theia/` | `workflows` row instrument | ✓ (row green in tree; instrument failure is a named FAIL, not a skip) | — | `yarn install` in `theia/` per row message |
| `SECURITY.md` / `SUPPORT.md` / `docs/KNOWN-ISSUES.md` / `.github/ISSUE_TEMPLATE/` | GH-01/GH-14 (Phase 42) assumed present | ✗ (all absent in this worktree: no `SECURITY.md`, no `SUPPORT.md`, no `docs/KNOWN-ISSUES.md`, no `.github/ISSUE_TEMPLATE/`) | — | Phase 53 reads them and fails closed if absent; does NOT create them (GH-14 owns files; GH-07 owns env shell) |
| `triage.yml` | GH-03 | ✗ (only `notify-drill.yml`, `rebase-upstream.yml`, `verify.yml` present) | — | Phase 53 creates the declaration; owner lands it |
| Anthropic Console (triage workspace + spend limit / OIDC) | GH-16, FIX-12 fallback | Unverified (owner Console; no API probe from here) | — | Plan ends with `checkpoint:human-action`; `renewals` row carries the key date |
| Cloudflare (`status` CNAME, Email Routing) | MON-02, GH-17 (Phase 47 mail assumed) | Unverified (owner account) | — | Owner actions; plans assume `security@`/`contact@`/`privacy@powerbrowser.org` deliver via Email Routing and `SECURITY.md` states a concrete window |

**Missing dependencies with no fallback (owner-gated, plans stop at checkpoint):** Anthropic triage workspace/key-or-OIDC; Codeberg account + mirror repo + deploy token; Upptime repo + `status` CNAME; `SECURITY.md` window text + mail routing (Phase 47); issue forms/labels (Phase 42).

**Missing dependencies with fallback:** None — every Phase 53 build step runs locally (declared YAML, scripts, verifier rows + self-tests, RELEASING.md draft, timer unit file).

## Validation Architecture

### Test Framework

| Property | Value |
|---|---|
| Framework | `scripts/verify-platform.sh` registry + per-script `--self-test` (no new driver) |
| Config file | none — registry array in `scripts/verify-platform.sh` (~:3555ff) |
| Quick run command | `scripts/verify-platform.sh --quick` |
| Full suite command | `scripts/verify-platform.sh` |
| Single-row command | `scripts/verify-platform.sh --only <label>` |

Sampling: per-task commit `--quick`; per-wave merge full suite; phase gate full suite green before verify-work. Every new row derives expectation from the tree, compares as set equality, plants each fault in `--self-test` red naming the drift, never asserts on absence of a log line.

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|---|---|---|---|---|
| TEL-05 | Prefill params ⊆ `bug.yml` field ids; origin/path vs manifest; diagnostics never in URL; `github.com` row `user-initiated` | unit (static, quick) | `scripts/verify-platform.sh --only bug-report-affordance` + `scripts/verify-platform.sh --only endpoint-dispositions-self-test` | ❌ Wave 0 (`bug-report-affordance` in RELEASING.md map only, no registry row yet; `endpoint-dispositions-self-test` ✅ exists) |
| GH-03 | triage.yml shape: `issues: opened`, env `triage`, Haiku, `allowed_non_write_users`, `issues: write` only, concurrency, FIX-08 pins, no event text in `run:`/`prompt:`, no close step; planted-instruction issue → template comment only | unit (static, quick) | `scripts/verify-platform.sh --only workflows` (widened) + `scripts/verify-platform.sh --only triage-workflow` (new) + `node scripts/verify-workflows.mjs --self-test` | ❌ Wave 0 for `triage-workflow`; ✅ `workflows` exists and already enforces `issues-write`/`event-text`/`claude-code-action` |
| GH-16 | Triage workspace spend limit exists; key scoped to `triage` env / OIDC rule recorded; RENEWALS row present | manual + structural (quick) | `scripts/verify-platform.sh --only renewals` (structure) + `checkpoint:human-action` proof (Console screenshot/limit record) | ❌ Wave 0 for triage-specific RENEWALS rows; `renewals` pattern assumed from DOC-04 |
| GH-17 | Window text states acknowledgement window; private-reporting flag on; assignment + pending-deployment each reach phone within window | manual-only (phone proof) + static (quick) | `scripts/verify-platform.sh --only repo-controls` (flags/env) + drill dispatch (owner rejects from phone, cf. `notify-drill.yml`) | ✅ `repo-controls-self-test` exists; live `repo-controls` full-tier exists; phone proof manual |
| GH-04 | Timer unit valid (`OnCalendar=daily`, pushes heads+tags, token ref absent from repo); sweep SHA compare red on lag | unit (quick, fixture) + full (network) | `scripts/verify-platform.sh --only codeberg-mirror` + `scripts/verify-platform.sh --only codeberg-mirror-live` (full) | ❌ Wave 0 (both new) |
| MON-02 | Upptime config targets = {updates host, website, `/events`}; Pages serves status host; sweep reports workflow enabled + last-run age | unit (quick, fixture) + full (network) | `scripts/verify-platform.sh --only upptime-config` + `scripts/verify-platform.sh --only upptime-sweep-live` (full) | ❌ Wave 0 (both new) |
| DOC-07 | RELEASING.md support-operations section agrees with automation by derivation (triggers, job ids, template ids, moderation + CodeQL + fork-approval rules) | unit (quick) | `scripts/verify-platform.sh --only releasing-support-ops` (new; precedent `releasing-maintenance`) | ❌ Wave 0 (new) |

### Sampling Rate

- **Per task commit:** `scripts/verify-platform.sh --quick`
- **Per wave merge:** `scripts/verify-platform.sh`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `scripts/verify-triage.mjs` (or widen `verify-workflows.mjs`) — covers GH-03 `triage-workflow` row + self-test (good-fixture green; plants: missing `issues: opened`, wrong env, non-Haiku model, missing `allowed_non_write_users`, `issues: write` widened, missing concurrency, tag-object pin, `show_full_output: true`, bare `Bash`, `ACTIONS_STEP_DEBUG`, event text in `prompt:`, close-issue step)
- [ ] `bug-report-affordance` registry row — covers TEL-05 (prefill ⊆ field ids, diagnostics-in-URL plant red, origin/path mismatch red)
- [ ] `codeberg-mirror` + `codeberg-mirror-live` rows — cover GH-04 (fixture lag red; live SHA compare)
- [ ] `upptime-config` + `upptime-sweep-live` rows — cover MON-02 (target-set equality; enabled/last-run-age report)
- [ ] `releasing-support-ops` row — covers DOC-07 (derivation gate per `releasing-maintenance` precedent)
- [ ] Triage RENEWALS rows (Anthropic key/workspace, Codeberg token) — covered by DOC-04 `renewals` structure row
- [ ] Framework install: none (registry + node exist; `js-yaml` via `theia/` already wired)

## Security Domain

`security_enforcement` is not set to `false` in `.planning/config.json` (key absent; `workflow.nyquist_validation: true` [VERIFIED: .planning/config.json:21]), so this section applies. Target ASVS Level 1. Block on HIGH-severity findings.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---|---|---|
| V2 Authentication | yes | GitHub env branch policy `main`-only + required reviewers; no PAT; App without Workflows; deploy token on legion only (0600) |
| V3 Session Management | no | No sessions in Phase 53 |
| V4 Access Control | yes | Effective `issues: write`-only triage token; `contents: read` default; bot/fixer/triage envs `main`-only; fork-approval for external contributors |
| V5 Input Validation | yes | Prefill-subset assertion; template-id allow-list; fixed-text post (no free-text model output); Codeberg/Upptime inputs validated as SHA/URL shapes |
| V6 Cryptography | partial | Token/key hygiene only (no new crypto; MAR/R2 keys out of scope) |
| V7 Error Handling / Logging | yes | `show_full_output: false`; no debug secret; user copy carries no internals (UPD-32 shape) |
| V10 Malicious Code | yes | No `schedule:` in product repo; no cache in release path; SHA-pinned `uses:` admitted by allow-list |
| V14 Configuration | yes | `repo-controls` read-back of envs/labels/reporting flags; `workflows` row commit-time gate |

### Known Threat Patterns (STRIDE)

| Pattern | STRIDE | Standard Mitigation |
|---|---|---|
| Triage prompt injection (issue title/body carries instructions; "Clinejection" precedent per PITFALLS.md Pitfall 1) | Spoofing / Tampering / Elevation | Haiku only; `allowed_non_write_users: "*"` ONLY on triage; `issues: write` only; no bare `Bash` (two capped scripts); untrusted text never in `prompt:`/`run:` (`event-text` rule); Claude outputs label-set + template-id only; non-AI step posts fixed text; never closes; planted-issue self-test must yield template comment only |
| Attacker opens PR/issue to reach legion or secrets via triage | Elevation | Triage on `ubuntu-latest` only (`claude-code-action` hosted-only rule); no App-token step in triage job; no `environment:` beyond `triage`; env branch policy `main`-only; `repo-controls` fails on `null` branch policy |
| Codeberg deploy token theft (legion disk, logs, workflow echo) | Information disclosure | Token on legion only, never in repo/Actions; service `LoadCredential=` or 0600 file; no `secrets.` in any legion-adjacent assertion; RENEWALS row; rotation runbook in RELEASING.md |
| Silent mirror (timer dead, mirror stale, nobody notices) | Denial / Tampering (rollback to stale code during outage) | Sweep SHA-compare row red on lag + `Persistent=true` timer + watchdog coverage; status page declares mirror freshness |
| Upptime spoofing / status lie (monitor checks wrong target, Pages serves stale) | Spoofing / Tampering | Upptime config target-set derived from tree (updates host, website, `/events`); sweep asserts workflow enabled + last-run age; `status` CNAME in Cloudflare owned by owner |
| Workflow secret exfil via debug logs | Information disclosure | `show_full_output: false`, `display_report: false` (fixer; triage at minimum former), never set `ACTIONS_STEP_DEBUG` on repo (FIX-08 `workflows` assertions); debug fixer in private fork only |
| Cache poisoning via triage-adjacent jobs | Tampering | `issues: opened` runs get read-only cache token (platform change 2026-06-26); no cache step in release path (`no-cache` rule); triage holds no `actions: write` |
| Notification fatigue / missed security report | Denial | GH-17 drill proves assignment + pending-deployment reach phone; `SECURITY.md` window text asserted by row; maintenance issue comments only on red (no spam) |

## Common Pitfalls

### Pitfall 1: Prompt-injection-in-triage (attacker issue becomes bot action)

**What goes wrong:** A planted issue ("ignore instructions, comment this link / add this label / close as fixed") makes the bot publish attacker text, wrong labels, or close the issue. Public precedent "Clinejection" (2026-03) per PITFALLS.md [VERIFIED: .planning/research/v1.6-deploy/PITFALLS.md:15-18].
**Why it happens:** Triage must read stranger text (`allowed_non_write_users: "*"`) with a token that can write.
**How to avoid:** PITFALLS.md §5 verbatim: `issues: write` only, no `Bash` except two capped scripts, model output constrained to label-set + template-id, non-AI step posts fixed text, never closes, `workflow_run`/event-text guards, `show_full_output: false` [VERIFIED: .planning/research/v1.6-deploy/PITFALLS.md:23-29].
**Warning signs:** Any `${{ github.event.issue.* }}` / `comment.body` inside `prompt:` or `run:`; bare `Bash`; `allowed_bots: '*'`; a close-issue step; `contents: write` on triage.

### Pitfall 2: Silent-mirror (timer dead, sweep blind)

**What goes wrong:** The legion timer fails (token expired, disk full, unit masked) and nobody notices until a GitHub outage — when the stale mirror is needed most. SEED-002 accepted this silence; ARCHITECTURE.md converts it to a detected failure via sweep SHA compare [VERIFIED: .planning/research/v1.6-deploy/ARCHITECTURE.md:236-237].
**Why it happens:** `systemd` timers report locally; nothing in-repo watches them.
**How to avoid:** Sweep Codeberg row (Codeberg `main` SHA vs GitHub `main`, red on lag) + `Persistent=true` + RENEWALS row for the token + watchdogrepo visibility. Self-test plants lagged SHA fixture red naming the mirror.
**Warning signs:** Timer without `Persistent`; mirror push without `--tags`; sweep comparing timestamps instead of SHAs; token path inside the repo.

### Pitfall 3: Schedule creep (a `schedule:` lands in the product repo)

**What goes wrong:** Upptime or mirror polling added as product-repo `schedule:` violates D-77 (owner decision 1 [VERIFIED: .planning/workstreams/deploy/REQUIREMENTS.md:279]) and hits GitHub's 60-day scheduled-workflow disable.
**How to avoid:** `no-schedule` rule over every workflow file [VERIFIED: scripts/verify-workflows.mjs:25-26]; Upptime repo (outside product repo) alone may use `schedule:`.
**Warning signs:** Any `on: schedule` / cron string in `.github/workflows/`; a "keepalive" workflow.

### Pitfall 4: Triage spend blowout (flood of issues burns the fixer budget)

**What goes wrong:** One Anthropic key/workspace serves fixer + triage; an issue flood eats the fixer's budget (or vice versa).
**How to avoid:** Separate triage Console workspace with monthly limit (GH-16) + `concurrency: group: triage` + `timeout-minutes` + `--max-turns`; fixer budget untouched (STACK.md spend-layers precedent [VERIFIED: .planning/research/v1.6-deploy/STACK.md:89]).
**Warning signs:** Shared key across fixer/triage; no concurrency group; no workspace limit recorded.

### Pitfall 5: Diagnostics in the URL (secrets-adjacent data leaks into browser history/logs)

**What goes wrong:** Diagnostics (paths, versions, log lines) appended as query params leak into history, server logs, and referrers.
**How to avoid:** Query string carries only `version`, `os`, `install_format`; diagnostics via Copy button → clipboard only. Row asserts prefill ⊆ field ids + red on any diagnostics-bearing plant.
**Warning signs:** A `diagnostics=` / `log=` / `body=` query param in the contribution; `encodeURIComponent(diagnostics)` anywhere near the URL builder.

### Pitfall 6: Triage env without branch policy (any branch mints the key)

**What goes wrong:** A branch workflow naming `environment: triage` reads the Anthropic credential (same hole as Pitfall 4 in PITFALLS.md for `bot` [VERIFIED: .planning/research/v1.6-deploy/PITFALLS.md:80-87]).
**How to avoid:** `triage` env `main`-only branch policy (GH-07 shell already declares the policy shape [VERIFIED: .github/settings/environment-triage.json:1-6]); `repo-controls` fails on `null` policy.
**Warning signs:** `gh api .../environments` showing `deployment_branch_policy: null` for `triage`.

### Pitfall 7: Status page checks the wrong thing (green while updates are down)

**What goes wrong:** Upptime monitors `powerbrowser.org/` only; updates host or `/events` outage stays green.
**How to avoid:** Target set derived from tree (updates host, website, `/events`) compared as set equality; plant a dropped target red.
**Warning signs:** Upptime config with fewer targets than the sweep expects; last-run age never asserted.

## Code Examples

### Triage workflow skeleton (FIX-08 pins applied verbatim)

```yaml
# Source shapes: notify-drill env/permissions precedent
# [VERIFIED: .github/workflows/notify-drill.yml:17-25]
# + verify-workflows rules [VERIFIED: scripts/verify-workflows.mjs:36-56]
name: Triage new issues
on:
  issues:
    types: [opened]
permissions:
  issues: write   # explicit; effective issues: write only (GH-03)
concurrency:
  group: triage
jobs:
  triage:
    runs-on: ubuntu-latest
    environment: triage
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4.4.0 precedent
        with:
          persist-credentials: false
      - uses: anthropics/claude-code-action@db77d4d3c98f3f6380e7cd45ffba2342a3dbde3c
        with:
          model: claude-haiku-5-5
          path_to_claude_code_executable: /pinned/claude-code --version-recorded-at-plan-time
          show_full_output: false
          allowed_non_write_users: "*"
          # allowedTools: two capped label/comment scripts only; no bare Bash; no ACTIONS_STEP_DEBUG
      # non-AI step posts the fixed template text; no close-issue step exists
```

FIX-08 verbatim pins enforced by the `workflows` row: commit `db77d4d3c98f3f6380e7cd45ffba2342a3dbde3c` (not tag), exact Claude Code via `path_to_claude_code_executable`, `show_full_output: false`, `display_report: false` (fixer; triage follows by analogy per CONTEXT.md), no bare `Bash`, no `ACTIONS_STEP_DEBUG`.

### Codeberg timer unit (draft shape, applied by owner via `nrs`)

```ini
# /etc/nixos-adjacent declaration drafted in repo; applied by owner
[Unit]
Description=Push git and tags to Codeberg mirror
[Service]
Type=oneshot
ExecStart=/run/current-system/sw/bin/git push --mirror codeberg
```

```ini
[Unit]
Description=Daily Codeberg mirror push
[Timer]
OnCalendar=daily
Persistent=true
[Install]
WantedBy=timers.target
```

Token lives on legion only (never in repo); RENEWALS row carries its rotation date.

### Sweep SHA-compare sketch (lives in release-train maintenance job, Phase 51 owns aggregation)

```bash
GH_SHA=$(gh api repos/DeBIOS-Foundation/powerbrowser/branches/main --jq .commit.sha)
CB_SHA=$(curl -s https://codeberg.org/api/v1/repos/<owner>/<mirror>/branches/main | node -e "console.log(JSON.parse(require('fs').readFileSync(0,'utf8')).commit.id)")
test "$GH_SHA" = "$CB_SHA" || echo "codeberg-mirror: FAIL -- lag (github $GH_SHA, codeberg $CB_SHA)"
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|---|---|---|---|
| Mend Renovate hosted | Self-hosted `renovatebot/github-action` dispatched by train | Owner decision 16 | No second clock; no workflow-scope App |
| Worker does detection/liveness | Worker is clock only; Actions does detection/liveness | Owner decision 15 (SUMMARY gap 1) | Fits 10 ms CPU / 50-subrequest Free caps |
| `allowed_non_write_users` on fixer | Only triage may set it; fixer never does | PITFALLS.md Pitfall 1 | Fixer cannot be stranger-triggered |
| Upptime dropped (STACK "What NOT to add") | Upptime kept per owner decision 22 as status page alongside MON-01 watchdog | Owner 2026-10-20 | MON-02 stays; product repo still has no `schedule:` |
| Ephemeral runner + PAT on legion | Non-ephemeral, registration token, no PAT/key on legion | Owner decision 2 | Timer follows same posture: token on legion is a push-only deploy token, not a PAT |

**Deprecated/outdated:** Tag-object pin `c335fd6d` (use commit `db77d4d3…`); `schedule:` in product repo (D-77); `allowed_bots: '*'`; bare `Bash` in AI jobs; diagnostics-in-URL prefill.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|---|---|---|
| A1 | Action commit `db77d4d3c98f3f6380e7cd45ffba2342a3dbde3c` = v1.0.254 and current FIX-08 pin | Standard Stack | Triage pins a stale/vulnerable action; mitigate by plan-time re-verify against action source |
| A2 | Model id `claude-haiku-5-5` current and priced as researched | Standard Stack | Workflow fails on unknown model; mitigate by plan-time model-table check |
| A3 | Upptime template `upptime/upptime` + Pages + `status` CNAME suffice for status.powerbrowser.org | MON-02 | Plan builds wrong hosting shape; mitigate by owner creating repo from template at checkpoint |
| A4 | Codeberg `codeberg.org/api/v1` unauthenticated branch-SHA read suffices for lag detection | GH-04 | Sweep needs auth; mitigate by live probe in Phase 51/53 (read-only GET already 200 this session) |
| A5 | Phase 47 mail delivers `security@`/`contact@`/`privacy@powerbrowser.org` to owner; `SECURITY.md` states concrete window | GH-17 | Notification proof has no address/window; plans fail closed if absent, do not create routing |
| A6 | Phase 51 sweep aggregation exists to host Codeberg/Upptime rows | GH-04/MON-02 | Rows land with no caller; plans define row contract, Phase 51 owns aggregation |
| A7 | Phase 52 FIX-08 contract unchanged; if it moves, triage follows | GH-03 | Pin drift; plans apply FIX-08 verbatim and note follow-rule |
| A8 | `SECURITY.md`/`SUPPORT.md`/`KNOWN-ISSUES.md`, `bug.yml` field ids, `labels.json`, `triage` branch policy present per Phase 42/41 | All | Plans read-and-fail-closed; do not own creation |
| A9 | OIDC-vs-key outcome for Anthropic (FIX-12 research flag) resolved by Phase 52 or recorded at checkpoint | GH-16 | Triage auth shape wrong; plans carry both branches, owner picks at checkpoint |

## Open Questions (RESOLVED)

1. **Private-vulnerability-reporting route — carried-unresearched.**
   - What we know: GH-09 enables private vulnerability reporting; GH-14 owns `SECURITY.md` (private reporting first, `security@` second, acknowledgement window); GH-18 drill proves phone reachability for assignments/pending-deployments.
   - What's unclear: the GitHub private-reporting UI/route mechanics were never researched (ROADMAP research flag: "Carried unresearched: the private vulnerability reporting route").
   - Recommendation: plans prove the notification path (report → phone buzz inside window) and the window-text assertion, NOT the reporting UI. Carry the route as unresearched into planning; owner demonstrates one private report reaching the phone at the checkpoint.
    - RESOLVED: carried as an explicit plan constraint — 53-04 proves the notification path + window text only.

2. **Anthropic triage auth: OIDC federation vs static key?**
   - What we know: FIX-12 research flag open (whether `github_token` suppresses the action's App-token exchange); fallback is `ANTHROPIC_API_KEY` in `triage` env.
   - What's unclear: which branch this account supports.
   - Recommendation: plans carry both branches; owner action at checkpoint records the outcome in RELEASING.md.
    - RESOLVED: 53-02/53-04 carry both branches; owner records the outcome at checkpoint.

3. **Upptime repo name + Pages project shape?**
   - What we know: template reachable; Pages serves the status host; `status` CNAME is owner action.
   - What's unclear: org repo name (`powerbrowser-status` assumed), Pages branch, custom-domain wiring order.
   - Recommendation: planner leaves names as plan-time variables confirmed at `checkpoint:human-action`.
    - RESOLVED: 53-03 declares the target set as data; repo/branch/CNAME are checkpoint-confirmed.

4. **Codeberg owner/namespace + token scope?**
   - What we know: public SHA read works unauthenticated (200 this session); push needs a deploy token held on legion.
   - What's unclear: mirror namespace, token minimal scope, tag-protection rules.
   - Recommendation: owner creates account/repo/token at checkpoint; plans never invent the token.
    - RESOLVED: 53-03 asserts token-absent-from-repo; owner creates at checkpoint.

## Sources

### Primary (HIGH confidence — read this session)

- `theia/extensions/branding/src/browser/powerbrowser-frontend-module.ts:9-28` — TEL-05 binding point (no new package)
- `theia/extensions/tab-uris/src/browser/browser-window-command.ts:174-192` — GUI-01 `window.open` fallback path TEL-05 reuses
- `powerbrowser/shell/PowerBrowserAPI.sys.mjs:295` — `SHELL_MESSAGE_KINDS` verbatim set
- `powerbrowser/endpoint-allowlist.json:89-94` — `github.com` `user-initiated` row + UPD-33 reason
- `scripts/verify-workflows.mjs:16-56` — rules table (`uses-pinned` … `event-text`); implementation `:126-134` (effective perms), `:293-296` (claude-code-action)
- `scripts/verify-platform.sh:3555` — one-registry rule; quick/full/`--only` driver
- `.github/workflows/verify.yml:39-45` — `contents: read` + `persist-credentials: false` precedent
- `.github/workflows/notify-drill.yml:17-25` — `permissions: {}` + `environment: release` drill precedent
- `.github/settings/environment-triage.json:1-6`, `workflow-permissions.json:1-4`, `actions-selected.json:1-7` — admission base
- `.planning/config.json:21` — `nyquist_validation: true` (validation section required)
- `.planning/workstreams/deploy/REQUIREMENTS.md:195,222-227` — TEL-05/GH-03/GH-16/GH-17/GH-04/MON-02/DOC-07 text; `:273-300` owner decisions 1-22; `:317-323` external gates
- `.planning/workstreams/deploy/ROADMAP.md:331-342` — Phase 53 goal, deps, success criteria, gates
- `docs/RELEASING.md:848,852` — `bug-report-affordance` + `releasing-maintenance` row contracts
- Live read-only probes: `gh api repos/DeBIOS-Foundation/powerbrowser` (public, `main`), `branches/main` SHA, `repos/upptime/upptime` (template, `master`); `https://codeberg.org/api/v1/version` 200; `https://upptime.js.org` 200; `systemd 260`; `node v24.9.0`; `gh 2.102.0`

### Secondary (MEDIUM confidence — prior v1.6 research, official-docs backed)

- `.planning/research/v1.6-deploy/ARCHITECTURE.md:§5` (fixer/triage trust split, triage row G), `§6` (permission matrix + new rows), `§9` Phase G row (order 0/A3 context)
- `.planning/research/v1.6-deploy/STACK.md:38,86-89` (action pin, Haiku/OIDC/spend layers), `What NOT to add` (Upptime row overridden by decision 22)
- `.planning/research/v1.6-deploy/PITFALLS.md: Pitfall 1` (prompt injection; triage-only `allowed_non_write_users`), Pitfalls 4/5/9 (env policy, cache, clock)
- `.planning/research/v1.6-deploy/CRITIQUE.md:64` (commit vs tag-object pin), `SUMMARY.md:57` (pin by commit)

### Tertiary (LOW confidence — carried [ASSUMED], plan-time re-verify)

- Action commit ↔ version mapping, Haiku model id/pricing, Upptime template HEAD behavior, Codeberg token minimal scope, Anthropic OIDC-vs-key outcome, Cloudflare `status` CNAME + Email Routing delivery, `SECURITY.md` window text (Phase 47).

## Metadata

**Confidence breakdown:**
- Standard stack: MEDIUM — in-tree gates HIGH (read this session); action pin + Haiku + Upptime + timer mechanics [ASSUMED] pending plan-time re-verify, no installs to legitimate.
- Architecture: MEDIUM — reuse paths verified in tree (GUI-01, diagnostics layer, drill, sweep); cross-repo pieces (Upptime repo, mirror, mail) depend on unfinished phases and owner actions.
- Pitfalls: HIGH — Pitfall 1 + §5 trust split directly govern GH-03; silent-mirror/schedule-creep/spend/env-policy all have in-tree rule precedents.
- Validation: HIGH — registry + `--self-test` + `--only` mechanics verified; Wave 0 gaps explicitly listed.
- Security: MEDIUM — ASVS L1 + STRIDE mitigations map to existing rules; phone-proof and Console-limit halves are manual.

**Research date:** 2026-10-23
**Valid until:** 30 days (stable domain; re-verify action pin + Haiku id if landing slips past 2026-11-23)
