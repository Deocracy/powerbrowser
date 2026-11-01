# Phase 42: Community surface and release documentation (A) - Research

**Researched:** 2026-10-22
**Domain:** GitHub community surface (issue forms, labels, health files, Discussions) + owner release documentation (cadence, RENEWALS register, secrets/runner rewrite, draft reconciliation)
**Confidence:** HIGH for in-tree mechanics (every load-bearing claim was Read this session), HIGH for `gh` label/API shapes (probed live read-only this session), MEDIUM for GitHub issue-form schema details (no network docs fetch available; grounded in competitor precedent recorded in FEATURES.md and in the S8 draft's existing `bug.yml` reference).

## Summary

Phase 42 is a pure tree-text phase: YAML, Markdown and two small Node check scripts. Nothing builds, no browser launches, no network is needed by any quick row, and no package is installed. The live GitHub org/repo is read-only during research and owner-written at the checkpoint.

The work splits cleanly into three local builds plus doc edits:

1. **Labels as code (GH-13).** A new declared `.github/settings/labels.json` becomes the label set. `scripts/verify-repo-controls.mjs` gains one `labels` control (live `GET labels?per_page=100` names compared as a set against the declared names). A new quick row (`labels`, suggested `scripts/verify-labels.mjs`) asserts every label named in `.github/ISSUE_TEMPLATE/*.yml` and in workflow files is in `labels.json`. Both scripts get `--self-test` plants.
2. **Community files (GH-01, GH-14).** `.github/ISSUE_TEMPLATE/bug.yml`, `feature.yml`, `config.yml` (blank issues off, links to Discussions + security policy); product-repo `SECURITY.md`, `SUPPORT.md`, `docs/KNOWN-ISSUES.md`; org `.github` repo `SECURITY.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md` (new repo, owner-created). Field ids `version`, `os`, `install_format` stay stable for TEL-05 (Phase 53).
3. **Release documentation (DOC-03..DOC-06).** `docs/RELEASING.md` text fixes located **by content, not by line number** (the CONTEXT line numbers have drifted); a new `docs/RENEWALS.md` plus a structure-only quick row (`renewals`); and a reconciliation record marking drafts S2/S3/S8 superseded-or-current against NG-065/NG-067 (both `done` in the ledger).

**Primary recommendation:** Extend the Phase 41 instruments, do not invent new ones. Copy `verify-update-channel.mjs` as the gate shape (header comment, injectable `runChecks(root, overrides)`, green-baseline-then-plants `--self-test`), copy `verify-release-identity.mjs` for any filesystem-fixture self-test (mkdtemp), copy `verify-workflows.mjs` for the derive-and-compare + admission-set-equality idiom, and append rows to `scripts/verify-platform.sh` CHECKS beside `repo-controls-self-test` / `workflows` / `zizmor`. Plans end with one `checkpoint:human-action` (label apply, `.github` repo creation, Discussions verify, `powerbrowser-updates`/tap creation if Phase 41 has not, live read-back).

<user_constraints>
## Implementation Decisions

### Already decided (owner, 2026-10-20)
- All owner decisions in REQUIREMENTS.md "Owner Decisions" are binding (SEED-002 §12 recommended defaults plus the research additions): Apps only, no PATs; bot App without Workflows; non-ephemeral legion runner later (Phase 49); fork approval for all external contributors; tags created only by the bot App after `release` approval.
- D-77 holds: no `schedule:` key in the product repo (GH-12, Phase 41). The `workflows` row stays the trust-boundary gate; every new workflow file in this phase (none planned) would fall under it.
- Website carries no version facts and no `release.json` (owner decision 13); `/download` MAR-size line waits for Phase 45 measurement (ROADMAP ordering note).
- The RENEWALS split is decided (ARCHITECTURE §1 item 122, CRITIQUE C19): `renewals` (quick: structure only, every row has a date and an owner action) and `renewals-due` (maintenance sweep, Phase 48). This phase builds only the quick half.

### Owner gates in this phase (stop points for autonomous execution)
- Every change to the LIVE GitHub org or repo is an owner action: applying the label set (`gh label create --force` from `labels.json`), creating the org `.github` repository if absent, enabling or verifying Discussions, creating `powerbrowser-updates` and Homebrew tap repos if Phase 41 has not (GH-10), and any `repo-controls` live apply. Plans build everything locally — declared `labels.json`, the extended `repo-controls` read for labels, the `labels` quick row and its self-test, issue forms, SECURITY/SUPPORT/KNOWN-ISSUES/CONTRIBUTING/CODE_OF_CONDUCT, `docs/RENEWALS.md`, the `renewals` row and its self-test, `docs/RELEASING.md` doc fixes, and the S2/S3/S8 reconciliation record — and end with one `checkpoint:human-action` listing the exact commands, after which the live reads run.
- Read-only `gh api` calls against the live org/repo are allowed for research and for the read-back rows.

### Claude's Discretion
All other implementation choices are at Claude's discretion — discuss phase was skipped per user setting. Use the ROADMAP phase goal, success criteria, and codebase conventions to guide decisions.

### Deferred Ideas (OUT OF SCOPE)
None — discuss phase skipped.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description (abridged from REQUIREMENTS.md) | Research Support |
|----|---------------------------------------------|------------------|
| GH-13 | `labels.json` is the label set (families type/\*, os/\*, format/\*, area/\*, plus needs-triage, needs-info, confirmed, duplicate, wontfix, good-first-issue, security, upstream, release-train, claude-fix, train:blocked), applied with `gh label create --force` before the issue forms land; `repo-controls` compares live vs declared as set equality; quick row asserts every label in `.github/ISSUE_TEMPLATE/*.yml` and workflow files is in `labels.json`, self-test plants an undeclared label | §Patterns 1–2, §Code Examples, §Validation |
| GH-01 | Issue forms: `bug.yml` (labels `type/bug` + `needs-triage`; field ids `version`, `os`, `install_format` as URL-prefillable text inputs, plus steps, expected, diagnostics), `feature.yml`, `config.yml` with blank issues off + links to Discussions and the security policy | §Patterns 2, §State of the Art, §Validation |
| GH-14 | `SECURITY.md` (private reporting first, security@ second, latest release only, acknowledgement window), `SUPPORT.md`, `docs/KNOWN-ISSUES.md` in product repo; org `.github` repo carries `SECURITY.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md` | §State of the Art, §Validation |
| DOC-03 | Cadence text says two weeks; ESR 175 dates current; queued self-hosted job cancelled after 24h | §Patterns 4 (locate by content: RELEASING.md:728 four-weeks text, README.md:47, rebase-upstream.yml:7-9 D-77 note), §Validation |
| DOC-04 | `docs/RENEWALS.md` lists every renewable item with a date + owner action (domain, Apple membership, Developer ID cert, Azure validation, App keys, Cachix token, Safe Browsing key, each Cloudflare token, Codeberg token, Anthropic keys, winget credential, MAR cert 2046, Node 24 EOL, ESR 175 train dates); quick row `renewals` checks structure only | §Patterns 3, §Code Examples, §Validation |
| DOC-05 | `docs/RELEASING.md` rewritten secrets inventory (App keys per environment, no PAT/App key on legion, descriptor PAT → scoped App token), non-ephemeral runner shape, `release` env policy `main`, legion-rebuild runbook (four objdirs ~14 GB each) | §Patterns 4 (stale sections at RELEASING.md:257-304, :531-545, :957-968), §Validation |
| DOC-06 | Drafts S2, S3, S8 under `.planning/drafts/distribution/` reconciled with NG-065 + NG-067 or marked superseded | §Patterns 5, §Validation |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

Every directive below binds this phase. Source: `CLAUDE.md` [VERIFIED: CLAUDE.md:1-171].

- **Never fork or patch Theia core.** Theia additions are `@powerbrowser/*` extensions; adopt upstream by re-pinning, never by editing. `scripts/diff-theia-core.sh` is the check [VERIFIED: CLAUDE.md:24-31] ("`scripts/diff-theia-core.sh` is the check. If a change seems to require editing Theia core, that is the signal to reshape the change, not to edit core."). Not touched by this phase (no UI work; the sketch skill is out of scope).
- **Never modify Gecko outside the patch stack.** `upstream/` is fetched by `scripts/fetch-upstream.sh` and never hand-edited; `git -C upstream diff` staying empty is the invariant [VERIFIED: CLAUDE.md:33-37]. Firefox internals only through `powerbrowser/shell/PowerBrowserAPI.sys.mjs`, catalogued in `powerbrowser/INTERNAL-APIS.md` [VERIFIED: CLAUDE.md:39-44]. Not touched by this phase.
- **Design for the bridge.** Nothing may weld Theia to full-window presentation (`TabUriRegistry` shape asserted) [VERIFIED: CLAUDE.md:46-51]. Not touched by this phase.
- **Repo path contains no space.** `pkgs.mkShell` appends an rpath to space-separated `NIX_LDFLAGS`; a space breaks every native link step [VERIFIED: CLAUDE.md:53-59]. New files get space-free names.
- **Theia is the default GUI; stock browser chrome is reachable. No custom browser chrome is authored** [VERIFIED: CLAUDE.md:60-77]. The TEL-05 "Report a Bug" stock-window affordance is Phase 53, not this phase; GH-01 forms only declare the prefillable ids it will later use.
- **Patches are regenerated, never text-edited.** Editing a hunk body without recomputing blob hashes degrades the three-way merge into a silent no-op [VERIFIED: CLAUDE.md:106-111]. This phase touches no patch.
- **The residual-brand scan is a permanent gate.** `node scripts/scan-brand-residue.mjs` must exit 0; it iterates `git ls-files`, so **stage new files before trusting a green scan**; token classification lives only in `inventory/brand-tokens.json` [VERIFIED: CLAUDE.md:91-104]. Every new `.md`/`.yml`/`.json` in this phase must be `git add`ed before the scan is trusted.
- **One driver, one registry.** Every new check is one row appended to `scripts/verify-platform.sh` CHECKS; no sibling driver [VERIFIED: CLAUDE.md:117-128] ("Adding a check means appending one row to that registry. It does not mean creating a sibling driver").
- **Derive and compare; do not hand-keep an expectation list.** A hand-kept list can only agree with the tree it was copied from. Every new check gets a `--self-test` that plants faults, each going red naming the drift [VERIFIED: CLAUDE.md:130-139]. Applies to `labels` and `renewals` rows.
- **Never assert on the absence of a log line** unless proven emitted by the code under test rather than own instrumentation [VERIFIED: CLAUDE.md:130-139]. Applies to the doc-consistency checks (assert presence + value, never absence of prose).
- **No internal identifier in user-facing copy.** No pref key, sentinel, port, timeout, or raw exception text in user-facing text; error strings name the product "PowerBrowser", state the problem plainly, end with a next step that is a real on-screen affordance [VERIFIED: CLAUDE.md:143-153]. GH-14 files and issue-form copy must pass this; UPD-32 extends the shape test in Phase 46, but this phase writes the copy as if it will be tested.
- **Environment: builds run inside Nix dev shells** (`nix develop .#firefox` / `.#theia`); `node` works outside, `yarn` does not [VERIFIED: CLAUDE.md:157-166]. This phase needs no shell at all for its quick rows (Node + file reads only), same honesty-comment standard as `verify-update-channel.mjs`.
- **Sketch skill only for UI work.** `Skill("sketch-findings-Power-Browser")` is for design/CSS/visual direction [VERIFIED: CLAUDE.md:13]. This phase has no UI work (per additional context); do not load it.
- **Project instructions + ledger rules from the workspace root.** `scripts/verify-platform.sh --quick` is the commit gate; commit explicit paths only; never edit `upstream/` or `ledger/` [ASSUMED from project instructions in prompt; consistent with CLAUDE.md hard rules above and STATE.md kit-gate note].

## Package Legitimacy Audit

No package install is recommended. This phase is pure YAML/Markdown plus Node built-ins and the already-locked `js-yaml 4.3.2` reached through `createRequire(join(REPO_ROOT,'theia','package.json'))` — the same mechanism `verify-workflows.mjs` uses [VERIFIED: scripts/verify-workflows.mjs:88-94] ("`yaml = createRequire(join(REPO_ROOT, 'theia', 'package.json'))('js-yaml')`"). `js-yaml` version confirmed on this tree this session: `js-yaml 4.3.2` [VERIFIED: shell `node -e ...` output `js-yaml 4.3.2`]. No npm/PyPI/crates fetch, no flake change, no vendoring.

**Packages removed due to [SLOP] verdict:** none. **Flagged as suspicious [SUS]:** none.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Declared label set | Repo tree (`.github/settings/labels.json`) | — | GH-13: declaration is tracked, reviewed, diffed; applied with `gh label create --force` |
| Applying labels | Owner workstation (`gh label create --force`, owner token) | — | CONTEXT: every live change is an owner action; `--force` updates color/description idempotently [VERIFIED: shell `gh label create --help`: "Create a new label on GitHub, or update an existing one with `--force`"] |
| Label drift detection | `repo-controls` full row (network, read-only) extended with a `labels` control | Later: maintenance sweep (Phase 48) | Network needed, so never `--quick`; mirrors env/App set-equality pattern |
| Form↔label agreement | `labels` quick row (static, offline) | `workflows` row (unchanged gate) | Must hold on every commit, offline; D-77 unchanged, no new workflow files planned |
| Community copy | Tracked `.md`/`.yml` in tree | Review against the no-internal-identifier rule | UPD-32 shape test lands in Phase 46; this phase writes compliant copy now |
| Release documentation | `docs/RELEASING.md`, `docs/RENEWALS.md` (tracked) | `renewals` quick row (structure only) | DOC-04 quick half only; calendar-sensitive `renewals-due` is Phase 48 per CONTEXT |
| Draft reconciliation | Reconciliation record (tracked, e.g. in `docs/RELEASING.md` or phase record) | Ledger (read-only evidence) | DOC-06: S2/S3/S8 predate the non-GUI wave E proofs; record supersede-or-current per draft |

## Standard Stack

| Tool | Version | Purpose | Why Standard |
|------|---------|---------|--------------|
| `gh` CLI (`gh api`, `gh label create --force`) | 2.102.0 (nixpkgs, on PATH) [VERIFIED: shell `gh --version`: "gh version 2.102.0 (nixpkgs)"] | All label reads/writes; read-only REST for research and read-back | Already the documented apply path; no token handling in our code; auth confirmed this session [VERIFIED: shell `gh auth status`: "Logged in to github.com account ServerDestroyer (keyring) … Token scopes: 'read:org', 'repo', 'workflow'"] |
| GitHub REST labels | `GET repos/{owner}/{repo}/labels?per_page=100`, pinned `X-GitHub-Api-Version: 2022-11-28` | Label read-back | Same header/pagination discipline as `verify-repo-controls.mjs` [VERIFIED: scripts/verify-repo-controls.mjs:42,60-74] ("export const API_VERSION_HEADER = 'X-GitHub-Api-Version: 2022-11-28'" and "Lists are read with per_page=100 and refused, not paginated") |
| js-yaml | 4.3.2 via `createRequire` from `theia/` | Parse `bug.yml`/`feature.yml`/`config.yml` + workflow files for the label-agreement row | No new dependency; same reach-in `verify-workflows.mjs` uses; duplicate-key throw refused on purpose [VERIFIED: scripts/verify-workflows.mjs:88-94] |
| Node | v24 (host) | All new check scripts | Same runtime as existing rows |
| `scripts/verify-platform.sh` | registry at `run_own_checks()` CHECKS [VERIFIED: scripts/verify-platform.sh:3570-3573] ("run_own_checks() { … local -a CHECKS=(") | One driver, one registry | New `labels`, `labels-self-test`, `renewals`, `renewals-self-test` rows appended beside `repo-controls-self-test`/`workflows`/`zizmor` [VERIFIED: scripts/verify-platform.sh:4706-4730] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `labels.json` under `.github/settings/` + CONTROLS entry | A standalone `labels.json` at repo root with its own script | Loses the settings-set equality invariant (`loadBodies` orphans/missing bodies go red [VERIFIED: scripts/verify-repo-controls.mjs:680-693]); reject |
| `gh label create --force` loop from `labels.json` | REST `POST /labels` per label in the apply script | `gh label` already handles create-or-update idempotently (`--force`); hand-rolled REST adds pagination/error surface for nothing |
| js-yaml via theia | Vendored parser or regex scan of `labels:` lines | Regex misses folded `labels: [a, b]` vs block lists, quoted labels with spaces (`good first issue`), and workflow `labels:` keys that are runner labels not issue labels; reject (same rationale as 41-RESEARCH Pattern 3) |
| Calendar-aware `renewals` row (red ≤30 days) | Structure-only row now + `renewals-due` sweep in Phase 48 | Calendar rows redden unrelated commits and block the required check (ARCHITECTURE §1 item 122, CRITIQUE C19 — carried as decided in CONTEXT); reject |

## Architecture Patterns

### Pattern 1: Extend CONTROLS with a `labels` control (GH-13 live half)

`scripts/verify-repo-controls.mjs` exports `CONTROLS`, `planWrites`, `runChecks`, `SETTINGS_REL`, `API_VERSION_HEADER` [VERIFIED: scripts/verify-repo-controls.mjs:24-28,42,551,711,738] ("CONTROLS is the one table: scripts/apply-repo-controls.mjs imports planWrites" and "export const CONTROLS = Object.freeze([", "export function runChecks(", "export function planWrites("). The settings-set equality (`loadBodies`: orphan/missing/empty each red naming the file [VERIFIED: scripts/verify-repo-controls.mjs:680-693]) automatically covers a new `labels.json` once a control references it. `apply-repo-controls.mjs` executes exactly what `planWrites` returns and defines no endpoint of its own [VERIFIED: scripts/apply-repo-controls.mjs:4-8].

Recommended control shape (planner details; executor follows the file's existing idioms):

- `id: 'labels'`, `file: 'labels.json'`, `write: null` (owner applies via `gh label`, same as Apps/org which are `write: null` + `ownerSteps` [VERIFIED: scripts/verify-repo-controls.mjs:631-645]), `read: 'repos/{owner}/{repo}/labels?per_page=100'`, `compare: compareLabels`.
- `compareLabels`: project live objects to `name` strings; compare as **sets** (canon/same helpers already in file [VERIFIED: scripts/verify-repo-controls.mjs:140-148]). Name one missing and one extra label each. Fail closed on non-2xx/unparseable via the existing `ghGet`/`safeGetter` path [VERIFIED: scripts/verify-repo-controls.mjs:60-97].
- `ownerSteps`: print the exact `gh label create --force` loop (name, `--color`, `--description`) derived from `labels.json`.
- Self-test: extend `fakeState` + `getterOf` in-memory pattern [VERIFIED: scripts/verify-repo-controls.mjs:786-814,895-923] with one fake labels endpoint; plants: live extra label, missing declared label, renamed color-only drift (green — color/description are presentation, names are the set; planner to confirm), getter throw (red, never green).

Why this shape: the live label baseline today is 9 GitHub defaults (`accessibility`, `bug`, `documentation`, `duplicate`, `enhancement`, `good first issue`, `help wanted`, `invalid`, `question`, `wontfix` — 10 shown including `wontfix`) plus 5 `gsd:*` automation labels, and `has_discussions: false` [VERIFIED: shell `gh api .../labels?per_page=100` and `gh api ... --jq '{has_discussions, has_issues}'` outputs this session: `"has_discussions":false,"has_issues":true`]. The declared set will therefore delete/rename several defaults on apply — the plan must list the deletions explicitly so review sees them, and the apply must run **before the issue forms land** per GH-13 ordering.

### Pattern 2: The `labels` quick row — form↔set agreement (GH-13 static half + GH-01)

Copy `verify-update-channel.mjs` as the gate skeleton: header comment stating the derivation, `runChecks(root, overrides)` with injectable `read`/`files`, green-baseline-then-plants `--self-test`, sorted consumer output [VERIFIED: scripts/verify-update-channel.mjs:1-40,150-239,259-299]. Copy the mention-sweep idiom (structured regexes per kind, sorted `rel:line` output) and the vacuity guard ("no mention outside X is a FAIL" [VERIFIED: scripts/verify-update-channel.mjs:217-220]).

Recommended assertions (derive from the tree, compare as set equality):

1. `labels.json` parses; every entry has `name` (+ optional `color` 6-hex, `description`); names unique case-insensitively (GitHub treats label names case-insensitively for match; keep the check strict).
2. Every label referenced in `.github/ISSUE_TEMPLATE/*.yml` (`labels:` front-matter scalar or list at form level or per-`issues:` block — derive both) is in the declared set.
3. Every label referenced in workflow files (`triage.yml` label steps, `release-train.yml` report job `train:blocked`/`claude-fix` usage when those files land — in **this** phase: scan `.github/workflows/*.yml` for `labels`/`add-labels`/`label:` string literals the same way `verify-workflows.mjs` scans `uses:`/`runs-on` over every file via `readdir` [VERIFIED: scripts/verify-workflows.mjs:139-145]) is in the declared set.
4. Vacuity: at least one form references at least one label, otherwise FAIL (an agreement over nothing is vacuous — same rule as `verify-workflows.mjs` zero-workflows FAIL [VERIFIED: scripts/verify-workflows.mjs:182-185]).
5. `--self-test` plants: undeclared label in a form (red naming file+label), undeclared label in a workflow snippet (red), malformed `labels.json` (red), zero forms (red), plus green controls (all-declared forms, `good first issue` quoted-with-space label).

Issue-form syntax to use (STANDARD GitHub Issue Forms — no research needed beyond the CONTEXT contract): `bug.yml` with `name:`, `description:`, `labels: ["type/bug", "needs-triage"]`, `body:` of `type: input`/`textarea`/`dropdown`/`checkboxes` with stable `id:` values `version`, `os`, `install_format` (URL-prefillable `?template=bug.yml&version=…&os=…&install_format=…` — the `id` is the query key; keep ids frozen for TEL-05); `feature.yml` parallel; `config.yml` with `blank_issues_enabled: false` + `contact_links:` to Discussions (`https://github.com/DeBIOS-Foundation/powerbrowser/discussions`) and the security policy (`SECURITY.md` / `security@powerbrowser.org` per GH-14). The S8 draft already assumes this shape (`bug.yml` "with the six contracted field ids" [VERIFIED: .planning/drafts/distribution/S8-reports-bug-error-crash-PLAN.md:27-29]).

### Pattern 3: `renewals` structure-only row (DOC-04 quick half)

Split is decided (CONTEXT + ARCHITECTURE §1 item 122 + CRITIQUE C19). This phase builds ONLY the quick half: every row has a date and an owner action; no calendar math, no network, no red-30-days logic (that is `renewals-due`, Phase 48 maintenance sweep).

Recommended check (`scripts/verify-renewals.mjs` or equivalent): parse `docs/RENEWALS.md` table rows; each row must carry a recognizable date (ISO `YYYY-MM-DD` or `Month YYYY` plus explicit expiry where applicable) and an imperative owner-action cell (renew/rotate/re-verify/replace). Self-test plants: row with no date, row with no action, unparseable table (each red naming the row); green control with the full declared family (domain, Apple membership, Developer ID certificate, Azure validation, App keys, Cachix token, Safe Browsing key, each Cloudflare token, Codeberg token, Anthropic keys, winget credential, MAR certificate 2046, Node 24 EOL 2028-04-30, ESR 175 train dates — the DOC-04 family from REQUIREMENTS.md [VERIFIED: .planning/workstreams/deploy/REQUIREMENTS.md:214-215]).

Grounding notes: Node 24 Maintenance ends 2028-04-30 and the MAR secondary/rotation expectations come from the v1.6 research (FEATURES RENEWALS rows [VERIFIED: .planning/research/v1.6-deploy/FEATURES.md:156]). The winget credential caveat (likely a PAT on a fork-owner account, against the Apps-only rule) is an owner decision recorded in the External Gates table [VERIFIED: .planning/workstreams/deploy/REQUIREMENTS.md External Gates winget row]. `brand/` today holds no `.der` files [VERIFIED: shell `ls brand/`: `HUMAN-REVIEW.md`, `mark.svg`], so the MAR-cert RENEWALS row is forward-looking to the Phase B ceremony — state that, do not invent an expiry.

### Pattern 4: Doc fixes located by content, never by line number (DOC-03, DOC-05)

The CONTEXT line numbers have drifted (file is 1032 lines; cadence text is at `:728`, not `:681`). Plans must cite content anchors:

- **DOC-03 cadence:** `docs/RELEASING.md:728` reads "One release per ESR point release, roughly every four weeks, plus out-of-cycle" [VERIFIED: docs/RELEASING.md:726-729]; `README.md:46-47` reads "ESR rebases roughly every four weeks" [VERIFIED: README.md:46-47]; `rebase-upstream.yml:1-9` carries the D-77 no-schedule note, not a cadence line [VERIFIED: .github/workflows/rebase-upstream.yml:1-9]. Fix: "roughly every two weeks" in both prose files (ESR point-release cadence per owner decision 5 [VERIFIED: .planning/workstreams/deploy/REQUIREMENTS.md:280-284]); leave the workflow comment alone except to confirm D-77 still holds.
- **DOC-03 ESR 175 / queued-job:** CONTEXT cites `RELEASING.md:750-756` and `:909-910`; the current tree's Schedule-posture section (`:753-758` [VERIFIED: docs/RELEASING.md:753-758]) and queued-runner note (`:957-968` [VERIFIED: docs/RELEASING.md:957-968] — "The runner is offline. `release.yml`'s build job queues forever rather than failing") are the anchors. Fix per requirement text: current ESR 175 dates + 24-hour queued-job cancellation (ARCHITECTURE correction 6 / CRITIQUE claim 26: self-hosted job cancelled after 24h in queue).
- **DOC-05 runner shape:** stale ephemeral-runner + PAT sections at `RELEASING.md:257-304` (ephemeral `github-runner-powerbrowser-release.service`, `tokenFile = "/var/lib/secrets/github-runner-pat"`, `ephemeral = true`) [VERIFIED: docs/RELEASING.md:257-304] contradict owner decision 2 (non-ephemeral, registration token, no PAT/App key on legion [VERIFIED: .planning/workstreams/deploy/REQUIREMENTS.md:280-284]). Rewrite to non-ephemeral + `release`/`descriptor`/`bot` env shape already documented at `:327-337` [VERIFIED: docs/RELEASING.md:327-337].
- **DOC-05 secrets inventory:** table at `:531-545` still lists the descriptor-repository PAT and the legion PAT file [VERIFIED: docs/RELEASING.md:531-545]. Rewrite: App keys per environment (bot/release/descriptor/fixer/triage envs exist as settings bodies [VERIFIED: shell `ls .github/settings/` listing `environment-*.json` × 5 + `environment-branch-policy-main.json`]), no PAT/App key on legion, descriptor PAT replaced by the scoped App token (ARCHITECTURE §6 permission matrix: descriptor job uses App token scoped to `powerbrowser-updates` [VERIFIED: .planning/research/v1.6-deploy/ARCHITECTURE.md:326-330]).
- **DOC-05 release-env policy:** already `main`-only branch policy in the current text (`:327-334` [VERIFIED: docs/RELEASING.md:327-334]) — ARCHITECTURE §1 item 5 resolved this (tag-pattern → branch `main`) [VERIFIED: .planning/research/v1.6-deploy/ARCHITECTURE.md:17-18]. Verify-and-keep, do not re-change.
- **DOC-05 rebuild runbook:** extend Runner-upkeep (`:773-785`, objdir ~14 GB + 5.6 GB upstream checkout [VERIFIED: docs/RELEASING.md:773-785]) into a legion-rebuild runbook (four objdirs ≈14 GB each per CONTEXT).

### Pattern 5: S2/S3/S8 reconciliation record (DOC-06)

Both cross-referenced ledger items are `done` [VERIFIED: shell `python3 -c ... ledger/REQUIREMENTS.json`: "NG-065 | done", "NG-067 | done"; full texts: NG-065 "Update MARs are signed with the fork's key and verified", NG-067 "Uncaught frontend errors and unhandled rejections reach the telemetry logger"]. The drafts predate those proofs:

- S2 (release identity) assumed `update.channel = "release"`, revision display versions feeding Gecko, and an `AppUpdateURL` policy file — all superseded by landed Phase 40 (channel `default`/`powerbrowser-default`, version files as release metadata not Gecko input, `MOZ_APPUPDATE_HOST` baked host; see 40-RESEARCH summary findings 1–3).
- S3 (MAR signing) assumed an unsigned baseline and flag removal work — superseded-or-current per NG-065 proof (verify against `ng065` row in tree: `scripts/verify-ng-065-mar-signature.mjs` exists [VERIFIED: shell `ls scripts/verify*.mjs` includes `verify-ng-065-mar-signature.mjs`]).
- S8 (reports) assumed a `message` field in error payloads and a `diagnostics`-in-URL design — corrected by landed TEL-06 work (payload: type/basename/line/column/version/buildID/OS, no message/stack; diagnostics via Copy button, never in URL — per CONTEXT GH-01 specifics and S8 front-matter requirements TEL-05/06/08 [VERIFIED: .planning/drafts/distribution/S8-reports-bug-error-crash-PLAN.md:9]).

Record per draft: SUPERSEDED (with the superseding landed fact) or CURRENT (with the surviving action, e.g. S8's `bug.yml` field ids which this phase implements). Do not edit the draft files; write the record in the phase (or `docs/RELEASING.md` if the planner prefers a tracked home — planner's discretion).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Label apply + read-back | Bespoke REST label client | `gh label create --force` loop + `gh api .../labels?per_page=100` with pinned API version | `gh` already holds auth; `--force` is idempotent; same header discipline as repo-controls |
| YAML parsing of forms/workflows | Regex/indent scan | js-yaml 4.3.2 via createRequire from `theia/` | Quoted labels with spaces, flow lists, anchors; duplicate-key throw refuses a hiding second `labels:` |
| Form↔label agreement | Hand-kept expected-label list | Derive from tree, compare as set equality | A hand-kept list agrees only with the tree it was copied from (CLAUDE.md rule) |
| RENEWALS calendar logic in quick | Date-arithmetic in the quick row | Structure-only quick row; calendar math lives in Phase 48 `renewals-due` | Calendar rows redden unrelated commits |
| Community-file templates | Copy-paste from memory | GitHub-competitor shape already recorded in FEATURES.md (Zen/Floorp/Waterfox `bug_report.yml` + `config.yml` [VERIFIED: .planning/research/v1.6-deploy/FEATURES.md:22]) + S8's contracted field ids | Table stakes shape is known; ids must match TEL-05's future prefill |
| Org `.github` repo scaffolding | API-created repo with content | Owner `gh repo create DeBIOS-Foundation/.github --public` (empty), then normal PRs for the three files | No `.github` repo exists today [VERIFIED: shell `gh api repos/DeBIOS-Foundation/.github`: "Not Found … 404"]; content arrives by review, not by script |

**Key insight:** every control here is a GitHub-side or tree-side declaration whose truth is derived at check time. The value is in the read-back being exact (projection + set equality) and fail-closed — the same lesson as 41-RESEARCH Pattern 2.

## Runtime State Inventory

None — this is not a rename phase. No identifier or path migration; no state table required.

## Common Pitfalls

1. **Label names with spaces vs slugs.** `good first issue` (with spaces) is the GitHub default name [VERIFIED: shell `gh api .../labels` output `"name":"good first issue"`]. The CONTEXT family writes `good-first-issue` (hyphenated). GitHub issue-form `labels:` entries must match the **actual label name** (spaces or hyphens) — decide one canonical name in `labels.json`, apply with `--force` (which updates name? No — `--force` updates color/description; a rename is delete+create). Plan the delete list explicitly; the self-test must cover a space-vs-hyphen mismatch going red.
2. **Default labels linger.** Live today: 9–10 GitHub defaults + 5 `gsd:*` labels [VERIFIED: shell label list output]. The declared set (~20 names in GH-13 families) will delete most defaults. If the apply only creates, `repo-controls` set-equality stays red forever. The `checkpoint:human-action` must include the `gh label delete` lines (or `--force` where applicable) and the plan must state which defaults survive (`duplicate`, `wontfix`, `good first issue`/`good-first-issue`, `security` overlap the GH-13 family already).
3. **`blank_issues_enabled` typo'd or omitted.** Omitted means blank issues stay open and success criterion 1 fails silently. The quick row must assert `config.yml` parses with `blank_issues_enabled: false` explicitly, plus ≥1 `contact_links:` entry each with `name:`, `url:`, `about:`.
4. **Runner labels vs issue labels confused in the sweep.** Workflow `runs-on: [self-hosted, legion]` contains the word `labels` nowhere, but a naive `labels:` grep over workflows matches nothing today and would vacuously pass. The row must parse YAML and only inspect **issue-label writers** (`issues.create`, `add-labels`, `labels:` under issue-template-adjacent steps, `gh issue edit --add-label`), not `runs-on`. Name the writer patterns in the row's header comment.
5. **Discussions linked but not enabled.** Live `has_discussions: false` today [VERIFIED: shell output above]; Phase 41 declares `has_discussions: true` in `repo.json` [VERIFIED: .github/settings/repo.json:1-4] but the apply (owner checkpoint 41-04) may not have run. `config.yml` links to `.../discussions` regardless — if Discussions is still off at this phase's checkpoint, the link 404s. The plan's live-read step must verify Discussions and gate the checkpoint on it.
6. **Org `.github` repo name collision.** `gh api repos/DeBIOS-Foundation/.github` 404s today, but org repos present are `powerbrowser`, `powerbrowser-website`, `MelodyScribe`, `powerbrowser-docs` [VERIFIED: shell `gh api orgs/DeBIOS-Foundation/repos` output]. The checkpoint must create the literal repo named `.github` (community health files only take org-wide effect there), not a docs repo.
7. **Internal identifiers leak into community copy.** SECURITY.md/SUPPORT.md/issue-form boilerplate must name the product "PowerBrowser", carry `security@powerbrowser.org` (GH-14 per REQUIREMENTS.md [VERIFIED: .planning/workstreams/deploy/REQUIREMENTS.md:93]), state the acknowledgement window, and end diagnostics guidance with the Copy-button affordance — never a pref key, port, or raw exception text (CLAUDE.md user-facing-copy rule).
8. **Line-number drift in doc-fix plans.** CONTEXT cites `RELEASING.md:681`, `:750-756`, `:909-910`, `:258-288`, `:476-478`, `:917-920`, `:320-321`; the file as read has cadence at `:728`, runner text at `:257-304`, secrets at `:531-545`, queue note at `:957-968`. Plans that cite lines will misfire. Cite content anchors (section headings + quoted strings) and re-derive at plan time.
9. **Stale `gsd:*` labels in the declared set.** The 5 `gsd:*` labels are automation working labels, not community labels. The planner decides: declare them (they exist live, so set-equality demands it) or delete them at apply. Either is consistent; mixing (undeclared but present) is red by design.
10. **Phase 41 dependency drift.** CONTEXT assumes Phase 41 lands as written (`.github/settings/*.json` bodies, CONTROLS with `planWrites`, `workflows`/`zizmor` rows, RELEASING.md Phase 41 text) [VERIFIED: 42-CONTEXT.md:33-39]. If Phase 41 changed the CONTROLS shape, settings-file list, or registry insertion points, the Phase 42 executor adapts the label-control extension to the landed shape instead of the researched one. All three assumed anchors verified present this session: settings bodies exist [VERIFIED: shell `ls .github/settings/`], CONTROLS/`planWrites`/`runChecks` exported [VERIFIED: scripts/verify-repo-controls.mjs:551,711,738], `workflows`+`zizmor` rows registered [VERIFIED: scripts/verify-platform.sh:4716-4730].

## Code Examples

### `labels.json` shape (declaration)

```jsonc
// .github/settings/labels.json — the GH-13 set; names are the set, colors/descriptions presentation
{
  "labels": [
    { "name": "type/bug", "color": "d73a4a", "description": "Something isn't working" },
    { "name": "type/feature", "color": "a2eeef", "description": "New feature or request" },
    { "name": "os/linux", "color": "0075ca", "description": "Linux-only" },
    { "name": "format/tarball", "color": "0075ca", "description": "Linux tarball" },
    { "name": "area/updates", "color": "5319e7", "description": "Self-update and descriptors" },
    { "name": "needs-triage", "color": "fbca04", "description": "Awaiting triage" },
    { "name": "train:blocked", "color": "b60205", "description": "Release train blocked" }
  ]
}
```

Apply (owner, idempotent — `gh label create --force` updates color/description when the name exists [VERIFIED: shell `gh label create --help` excerpt above]):

```sh
jq -c '.labels[]' .github/settings/labels.json | while read -r l; do
  n=$(jq -r .name <<<"$l"); c=$(jq -r .color <<<"$l"); d=$(jq -r .description <<<"$l")
  gh label create "$n" --color "$c" --description "$d" --force
done
gh api 'repos/{owner}/{repo}/labels?per_page=100' --jq '[.[].name] | sort'
```

### Label compare sketch (extends `verify-repo-controls.mjs`)

```js
// compareLabels: names as sets; color/description are presentation, names are the contract
function compareLabels(c, declared, live, ctx) {
  const want = new Set((declared.labels ?? []).map(l => l.name));
  const got = Array.isArray(live) ? live.map(l => l.name) : null;
  if (got === null) return [`${c.id}: GET labels did not return a list. Next step: check the endpoint in ${SELF_REL}.`];
  const f = [];
  for (const n of [...want].filter(n => !got.includes(n)))
    f.push(`${c.id} (${SETTINGS_REL}/${c.file}): declared label ${JSON.stringify(n)} is missing live. Next step: the owner runs the gh label create --force loop.`);
  for (const n of [...got].filter(n => ![...want].includes(n)))
    f.push(`${c.id}: live label ${JSON.stringify(n)} is extra: no entry declares it. Next step: declare it in a reviewed commit, or delete it with gh label delete.`);
  return f;
}
```

Follows the file's existing `setDiff`/fail-closed idioms [VERIFIED: scripts/verify-repo-controls.mjs:391,422-446].

### `config.yml` + `bug.yml` skeleton (GH-01)

```yaml
# .github/ISSUE_TEMPLATE/config.yml
blank_issues_enabled: false
contact_links:
  - name: Discussions
    url: https://github.com/DeBIOS-Foundation/powerbrowser/discussions
    about: Ask questions and discuss ideas with the community.
  - name: Security policy
    url: https://github.com/DeBIOS-Foundation/powerbrowser/blob/main/SECURITY.md
    about: Report a vulnerability privately instead of filing an issue.
```

```yaml
# .github/ISSUE_TEMPLATE/bug.yml (excerpt — ids frozen for TEL-05 prefill)
name: Bug report
description: Report a problem with PowerBrowser.
labels: ["type/bug", "needs-triage"]
body:
  - type: input
    id: version
    attributes: { label: Version, description: "The PowerBrowser version (see About).", placeholder: "153.5.1-1" }
    validations: { required: true }
  - type: input
    id: os
    attributes: { label: Operating system, placeholder: "Linux / Windows / macOS + version" }
    validations: { required: true }
  - type: input
    id: install_format
    attributes: { label: Install format, placeholder: "tarball / NSIS / DMG / Nix" }
    validations: { required: true }
```

### `renewals` row sketch (DOC-04 structure-only)

```js
// every table row in docs/RENEWALS.md must carry a date cell and an owner-action cell; no Date.now(), no fetch
const rows = parseMarkdownTable(read('docs/RENEWALS.md'));
for (const [i, r] of rows.entries()) {
  if (!/\d{4}-\d{2}-\d{2}|(January|February|March|April|May|June|July|August|September|October|November|December) \d{4}/.test(r.date))
    fail(`docs/RENEWALS.md row ${i + 1} (${r.item}) carries no date`);
  if (!/(renew|rotate|re-verify|replace|re-apply|request|obtain|review)/i.test(r.action))
    fail(`docs/RENEWALS.md row ${i + 1} (${r.item}) carries no owner action`);
}
```

## State of the Art

- **GitHub Issue Forms (GH-01).** Standard `name/description/labels/body` schema with `blank_issues_enabled: false` + `contact_links` in `config.yml` is the competitor-table-stakes shape (Zen, Floorp, Waterfox all ship `bug_report.yml` + `config.yml` [VERIFIED: .planning/research/v1.6-deploy/FEATURES.md:22]). URL prefill via `?template=bug.yml&<id>=…` keys off stable field `id:`s — hence CONTEXT freezing `version`/`os`/`install_format` for TEL-05 [VERIFIED: 42-CONTEXT.md:54-57]. No network research performed (web_search unavailable in this session [ASSUMED: provider has no API key — tool error observed]); the schema above is the long-stable GitHub form and the planner should verify keys against a live form preview at apply time (owner step, not a row).
- **Labels API (GH-13).** List endpoint paginated (`?per_page=100`), label objects carry `name/color/description/default`; `gh label create --force` is create-or-update [VERIFIED: shell helps/outputs above]. Labels are org-wide-visible but per-repo; the bot App holds `issues: write` [VERIFIED: .github/settings/app-powerbrowser-bot.json:1-17], so future triage/report jobs can label without new scopes.
- **Community health files (GH-14).** `SECURITY.md` (private-reporting route first), `SUPPORT.md`, `CODE_OF_CONDUCT.md`, `CONTRIBUTING.md` are file-presence conventions surfaced by GitHub's community profile; org-wide defaults live in the literal `.github` repo (absent today, owner-created). `docs/KNOWN-ISSUES.md` is product-specific (no platform convention; content per GH-15 handoff in Phase 49 — this phase creates the file with current known items, it does not pre-build the train copy job).
- **Release documentation (DOC-03..05).** No platform novelty: cadence statement, renewal register with owner actions, secrets/runner runbook. The research value is the split (`renewals` vs `renewals-due`) and the content-anchor discipline, both decided above.
- **Draft reconciliation (DOC-06).** S2/S3/S8 are pre-proof plans; NG-065/NG-067 landed since. The record pattern (supersede-or-current with the superseding fact) is the same one Phase 40 used for owner sign-off [VERIFIED: STATE.md Phase 40 rows].

## Assumptions Log

1. **Phase 41 lands as written** (CONTROLS shape, settings files, `workflows`/`zizmor` rows, RELEASING.md Phase 41 text) — stated as the CONTEXT assumption [VERIFIED: 42-CONTEXT.md:33-39]; verified present this session (§Pitfall 10). Executor adapts if Phase 41 moved.
2. **Label color/description are presentation; names are the contract.** Set-equality runs on names only [ASSUMED: GitHub matches issue-form `labels:` by name; color drift must not go red or every rebrand-tint breaks the gate — planner to ratify].
3. **Issue-form schema keys (`blank_issues_enabled`, `contact_links`, `id:` prefill) are as stated** [ASSUMED: no network docs fetch available this session; verify at owner preview before apply].
4. **`train:blocked` / `claude-fix` / `release-train` labels are declared now though their writers land in Phases 43/52.** Declaring early keeps the agreement row green when those workflows arrive [ASSUMED: consistent with GH-13 family list in REQUIREMENTS.md].
5. **`gsd:*` labels are either declared or deleted at apply** — planner picks; the row stays red until the live set equals the declared set [ASSUMED: no requirement text covers them].
6. **No new workflow files in this phase** (CONTEXT: "none planned") [VERIFIED: 42-CONTEXT.md:26-28]; if the planner adds one, it falls under the existing `workflows`/`zizmor` rows with no new research.
7. **Acknowledgement window + support channels in SECURITY.md/SUPPORT.md follow GH-14 requirement text verbatim** (private first, security@ second, latest release only) [VERIFIED: .planning/workstreams/deploy/REQUIREMENTS.md:93]; exact window wording is planner's discretion.

## Open Questions

1. **Space-vs-hyphen canonical label names** (`good first issue` vs `good-first-issue`; `train:blocked` colon form) — RESOLVED as a planner decision, not research: pick one per label in `labels.json`, list renames explicitly in the checkpoint, cover the mismatch in self-test (§Pitfall 1).
2. **Whether `GET /user/installations/{id}/repositories` reads with the owner token** (Phase 41 Open Question 1, affects App repo-list read-back) — NOT BLOCKING this phase: the labels control reads public label endpoints with the same `repo`+`read:org` token that already lists labels/empties today; no App-token or device-flow needed for GH-13.
3. **Runner-group "selected workflows" on Free** (Phase 41 GH-11 probe) — NOT BLOCKING: no runner work in this phase (runner registers Phase 49 per owner decision 2).
4. **Homebrew tap repo name** (Phase 41 Open Question 3: `homebrew-tap` vs `homebrew-powerbrowser`) — RESOLVED as: reuse whatever Phase 41 created; if Phase 41 has not, this phase's checkpoint creates `homebrew-tap` per the bot App's declared repository list [VERIFIED: .github/settings/app-powerbrowser-bot.json:12-16]. No research beyond the declared body.
5. **Keep-or-delete the GH-18 drill workflow** (Phase 41 Open Question 4) — NOT BLOCKING: `notify-drill.yml` exists [VERIFIED: shell `ls .github/workflows/`] and passes current `workflows`/`zizmor` rows; this phase adds no workflow.
6. **Exact ESR 175 calendar dates for DOC-03** — RESOLVED as: derive at plan time from the ESR calendar in REQUIREMENTS.md External Gates (153.6 2026-10-27, every two weeks; 175 nightly 2027-05-27, beta 2027-06-10, release 2027-06-29; 153 ends 153.27 on 2027-09-07) [VERIFIED: .planning/workstreams/deploy/REQUIREMENTS.md External Gates ESR rows]; do not hard-code beyond what the requirement text states.
7. **MAR certificate 2046 expiry + Safe Browsing key procurement details** — RESOLVED as forward-looking RENEWALS rows with the ceremony/keyfile work owned by Phases B/C (SEC-05 ceremony, UPD-29 keyfile); this phase records the row with the best-known date and a named owner action to confirm it.

## Environment Availability

| Need | Availability | Evidence / Note |
|------|--------------|-----------------|
| `gh` read-only GETs (labels, repo flags, org repos) | Available (owner token, `read:org`+`repo`+`workflow`) | `gh auth status` green this session (see §Stack) |
| `gh` writes (label apply, `.github` repo create, Discussions enable) | Owner-only at checkpoint | Same rule as Phase 41 `--yes` (terminal-only [VERIFIED: scripts/apply-repo-controls.mjs:37-40]) |
| Node 24 + js-yaml 4.3.2 (quick rows + self-tests) | Available, no install | `js-yaml 4.3.2` resolved from `theia/` this session |
| Nix shells (`#firefox`/`#theia`) | Not needed | No build, no rasterise, no browser in this phase |
| Network in quick rows | Forbidden (honesty comments) | `labels`/`renewals` rows read files only; `repo-controls` extension stays full-tier |
| Web docs fetch | Unavailable this session | `web_search` returned a provider-key error; used in-tree + live `gh api` only — confidence adjusted accordingly |

## Validation Architecture

Nyquist enabled. Framework: `scripts/verify-platform.sh` registry + per-row `--self-test` (same contract as 41-VALIDATION.md: test infrastructure table, per-task verification map, sampling after every commit, Wave 0 statement, manual-only section [VERIFIED: .planning/workstreams/deploy/phases/41-repository-controls-and-github-apps-a/41-VALIDATION.md:1-86]).

| Requirement | Test Type | Automated Command (planner to register) |
|-------------|-----------|------------------------------------------|
| GH-13 (live set) | Full-tier read-back (network, read-only) | `--only repo-controls` (extended `labels` control: set equality live vs `labels.json`); `--only repo-controls-self-test` (in-memory plants: extra/missing label, throwing getter) |
| GH-13 (agreement) | Static quick | `--only labels` (every label in forms + workflow label-writers ∈ `labels.json`; vacuity guard); `--only labels-self-test` (undeclared-label plants, malformed JSON, zero-forms) |
| GH-01 | Static quick (+ owner preview) | `--only labels` covers label agreement; YAML parse + `blank_issues_enabled:false` + contact-links presence in same row or a sibling form-shape assertion; owner opens form preview URLs at checkpoint (manual) |
| GH-14 | Static quick (presence + copy rule) | `--only labels` unaffected; new presence check or extended doc-consistency assertion (all six files exist; `SECURITY.md` names private reporting + security@ + latest-only + window; no-internal-identifier review by pattern, full UPD-32 shape test deferred to Phase 46) |
| DOC-03 | Static doc grep (quick) | Negated/positive greps: no "four weeks" remains in `docs/RELEASING.md` cadence section / `README.md:46-47` / workflow cadence comments; ESR 175 dates present; 24h queued-job text present (same idiom as 41-02-03 negated grep + `--only update-channel` [VERIFIED: 41-VALIDATION.md:44-47]) |
| DOC-04 | Static quick | `--only renewals` (every row has a date + owner action); `--only renewals-self-test` (dateless/actionless plants) |
| DOC-05 | Static doc grep (quick) | Greps: no ephemeral-runner/PAT text remains (`github-runner-pat`, `ephemeral = true`, descriptor PAT); non-ephemeral shape + per-environment App-key inventory + `release`→`main` policy + rebuild runbook present |
| DOC-06 | Review artifact (quick) | Reconciliation record exists; each of S2/S3/S8 marked SUPERSEDED (with superseding landed fact: NG-065/NG-067 `done`, Phase 40 channel/revision/host) or CURRENT (with surviving action) |

**Wave 0 gaps: none.** Infrastructure exists (registry, `--self-test` conventions, CONTROLS/`planWrites`, js-yaml reach-in, `gh` auth). The deliverables are the new rows/scripts themselves, mirroring how Phase 41's Wave 0 was stated ("existing infrastructure covers all phase requirements… the new scripts are the deliverables").

Sampling: `--quick` after every task commit (after `git add` — brand scan iterates `git ls-files`); `--only <label>` per task; full `--quick` + owner checkpoint before verify-work. Max feedback latency <90s (no build/browser/network in any quick row).

Manual-only verifications (owner at checkpoint): label apply (`gh label create --force` loop + deletions), `.github` repo creation if absent, Discussions enabled check, `powerbrowser-updates`/tap creation if Phase 41 has not, live `--only repo-controls` green, form preview URLs render, GH-18-style phone/notification checks are out of scope (Phase 41 GH-18).

## Security Domain

ASVS L1 (client + GitHub control plane; no application auth boundary in this phase). STRIDE over the three new surfaces:

| Threat | Example | Mitigation (this phase) |
|--------|---------|-------------------------|
| **Spoofing** — fake security contact | Attacker files "security" issue publicly instead of private channel | `config.yml` links SECURITY.md first; SECURITY.md states private-reporting-first + security@ second; blank issues off removes the bypass |
| **Tampering** — label-set drift re-opens triage bypass | Extra live label routes fixer/triage elsewhere; deleted label breaks form `labels:` | `repo-controls` set-equality (extra/missing red); `labels` agreement row (form label ∉ set red); apply is owner-only |
| **Repudiation** — doc fix without review | Silent cadence/secrets edit | All docs tracked + reviewed; doc greps assert presence, never mere absence |
| **Information disclosure** — internal identifiers in community copy | Pref keys, ports, exception text in SECURITY.md/forms | CLAUDE.md no-internal-identifier rule applied at author time; UPD-32 shape test (Phase 46) will enforce |
| **Denial of service** — Discussions linked but disabled | `config.yml` 404s | Checkpoint verifies `has_discussions` live before landing the link |
| **Elevation of privilege** — App token scope creep | Bot App gains `workflows` to "manage labels" | Labels need no App scope at all (`gh label` with owner token; bot already lacks `workflows` and `repo-controls` asserts no App holds it [VERIFIED: scripts/verify-repo-controls.mjs:407-414]); fixer/triage label writes use the existing `issues: write` grant |

No secrets are added in this phase (no environment secret, no PAT, no App key). The DOC-05 rewrite **removes** secret material (PATs) from the docs, it does not introduce any.

## Sources

- In-tree (Read 2026-10-22): `42-CONTEXT.md` (full); `REQUIREMENTS.md` (GH-13/GH-01/GH-14/DOC-03..06, Owner Decisions 1–22, External Gates, Out of Scope); `STATE.md`; `CLAUDE.md`; `scripts/verify-repo-controls.mjs` (CONTROLS/`planWrites`/`runChecks`, settings-set equality, pinned API version, env/App compare, fake-state self-test); `scripts/apply-repo-controls.mjs` (dry-run default, terminal-only `--yes`); `scripts/verify-workflows.mjs` (js-yaml reach-in, derive-and-compare, admission set equality, self-test plants); `scripts/verify-update-channel.mjs` (gate skeleton, consumer sweep, vacuity guard, green-baseline self-test); `scripts/verify-release-identity.mjs` (mkdtemp fixture self-test); `scripts/verify-zizmor.mjs` (offline audit shape); `scripts/verify-platform.sh` (registry, `repo-controls` full-tier row, quick rows); `docs/RELEASING.md` (`:257-304` runner, `:327-337` envs, `:531-545` secrets, `:728` cadence, `:753-758` posture, `:773-785` upkeep, `:957-968` queue note); `configuration.toml` (`[urls]` release_notes/homepage/update); `README.md:46-47`; `.github/workflows/rebase-upstream.yml:1-9`; `.github/settings/*.json` (all 19 bodies incl. `repo.json`, `app-powerbrowser-bot.json`, `environment-descriptor.json`); `.github/workflows/` (verify/notify-drill/rebase only — no forms yet); `brand/` (no `.der`); `41-VALIDATION.md`, `41-RESEARCH.md` (controls/self-test/registry idioms), `COVERAGE.md` (labels + Discussions OPT-OUT rows for Phase 42); `ARCHITECTURE.md` (§1.5, §1.122, §3.4, §4, §6, R2–R6, A7); `SUMMARY.md` (Phase A7); `FEATURES.md` (issue-form + RENEWALS rows); `PITFALLS.md`, `STACK.md`, `CRITIQUE.md` (C19, claim 26, C4/C7/C13/C14); S2/S3/S8 draft front-matter; `ledger/REQUIREMENTS.json` (NG-065/NG-067 `done`).
- Live read-only probes (2026-10-22, `gh` 2.102.0 as ServerDestroyer): `.../labels?per_page=100` (defaults + 5 `gsd:*`), `... --jq '{has_discussions, has_issues}'` (`false`/`true`), `orgs/DeBIOS-Foundation/repos` (no `.github` repo; `.github` 404), `gh label create --help` (`--force` semantics), `gh auth status`, `node -e` js-yaml version.
- Prior art cited, not re-fetched: Zen/Floorp/Waterfox issue-form + descriptor precedents per FEATURES.md; GitHub REST/issue-form schema per 41-RESEARCH citations.
- No web_search/web_fetch sources (provider unavailable this session) — reflected in Confidence.

## Metadata

- **Phase:** 42 — Community surface and release documentation (A)
- **Researched:** 2026-10-22 · **Confidence:** HIGH (tree + `gh` shapes) / MEDIUM (issue-form schema keys, verify at preview)
- **Wave 0 gaps:** none — registry, self-test, CONTROLS, js-yaml, and `gh` auth all exist
- **New rows:** `labels`, `labels-self-test`, `renewals`, `renewals-self-test` (quick) + `labels` control inside `repo-controls`/`repo-controls-self-test` (full)
- **New files:** `.github/settings/labels.json`, `.github/ISSUE_TEMPLATE/{bug,feature,config}.yml`, `SECURITY.md`, `SUPPORT.md`, `docs/KNOWN-ISSUES.md`, `docs/RENEWALS.md`, org `.github` repo ×3 files, `scripts/verify-labels.mjs`, `scripts/verify-renewals.mjs` (names planner-adjustable), RELEASING.md edits, S2/S3/S8 reconciliation record
- **Owner checkpoint:** one `checkpoint:human-action` — label apply loop + deletions, `.github` repo create if absent, Discussions verify, `powerbrowser-updates`/tap create if Phase 41 has not, live `--only repo-controls`, form previews
- **Next consumer:** planner (plan-phase) — Tables `<phase_requirements>` + §Validation Architecture are the plan skeleton
