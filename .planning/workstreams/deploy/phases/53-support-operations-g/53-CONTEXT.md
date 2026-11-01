# Phase 53: Support operations (G) - Context

**Gathered:** 2026-10-23
**Status:** Ready for planning
**Mode:** Auto-generated (discuss skipped via workflow.skip_discuss)

<domain>
## Phase Boundary

Bug reports arrive prefilled from inside the browser, every new issue gets a template triage reply, security reports reach the owner's phone, and code and status stay reachable during a GitHub outage.

Requirements: TEL-05, GH-03, GH-16, GH-17, GH-04, MON-02, DOC-07 (full text in `.planning/workstreams/deploy/REQUIREMENTS.md`).

Depends on: Phase 47 (mail), Phase 51 (Codeberg sweep row), Phase 52 (FIX-08 pinning rules apply to `triage.yml`).

**Assumptions on unfinished dependencies (recorded per autonomous rules):**
- Phase 47 mail is not finished. Phase 53 plans assume `security@`, `contact@`, `privacy@powerbrowser.org` deliver to the owner via Cloudflare Email Routing (INF-02), and that `SECURITY.md` states a concrete acknowledgement window. GH-17 plans assert the window text exists but do not create the mail routing.
- Phase 51 Codeberg sweep row is not finished. Phase 53 plans create the mirror timer and the `powerbrowser-updates`-style public read surface, and define the sweep row contract (`Codeberg main SHA vs GitHub main SHA, red on lag`), but the Phase 51 maintenance-sweep aggregation itself is out of scope.
- Phase 52 FIX-08 pinning rules are not finished. Phase 53 plans apply the FIX-08 pinning contract verbatim to `triage.yml` (`anthropics/claude-code-action@db77d4d3c98f3f6380e7cd45ffba2342a3dbde3c`, exact Claude Code version via `path_to_claude_code_executable`, `show_full_output: false`, no bare `Bash`, no `ACTIONS_STEP_DEBUG`), and the `workflows` row asserts each. If Phase 52 later changes the pin, triage follows it.
- `SECURITY.md`, `SUPPORT.md`, `docs/KNOWN-ISSUES.md` and the `triage` environment branch policy are assumed present per Phase 42 / Phase 41 GH-07. Phase 53 plans read them and fail closed if absent, but do not own their creation (GH-14 owns the files; GH-07 owns the environment shell).

</domain>

<decisions>
## Implementation Decisions

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

</decisions>

<code_context>
## Existing Code Insights

Start from `.planning/research/v1.6-deploy/ARCHITECTURE.md` §5 (fixer/triage trust split), §6 (new `verify-platform.sh` rows) and §9 Phase G row; `STACK.md` Claude fixer stack (action pin `db77d4d3c98f3f6380e7cd45ffba2342a3dbde3c`, Haiku for triage, `--max-budget-usd`, workspace spend cap `concurrency:` group) and "What NOT to add" (Upptime dropped there — owner decision 22 overrides: Upptime stays as the public status page alongside MON-01); `PITFALLS.md` Pitfall 1 (prompt injection in fixer and triage: `allowed_non_write_users: "*"` only on triage, `issues: write` only, no `Bash` except two capped label/comment scripts, event text never in `prompt:`) and Pitfall 9 (drill workflow must be on `main`).

In-tree: `.github/workflows/verify.yml` (hosted `ubuntu-latest`, SHA-pinned `uses:`, `persist-credentials: false` precedent), `.github/workflows/notify-drill.yml` (GH-18 drill: `permissions: {}`, `environment: release`, kept re-runnable), `scripts/verify-workflows.mjs` (GH-12: no `schedule:`, legion label only in `release.yml` `build-*`/`matrix-*`, SHA-pinned admitted `uses:`, `issues: write` only on `release-train.yml` report and `triage.yml`, guarded `workflow_run`, no event text in `run:`/`prompt:`), `.github/settings/environment-triage.json` + `workflow-permissions.json` + `actions-selected.json` (admission base), `theia/extensions/branding/src/browser/powerbrowser-frontend-module.ts` (bind the Report-a-Bug `FrontendApplicationContribution` here; no new package), `powerbrowser/shell/PowerBrowserAPI.sys.mjs` `SHELL_MESSAGE_KINDS` (new request kinds catalogued in `powerbrowser/INTERNAL-APIS.md`, enforced by `scripts/check-internals-boundary.sh`), `powerbrowser/endpoint-allowlist.json` `github.com` `user-initiated` row (UPD-33 verdict: unattended request fails like `deny`), `docs/RELEASING.md` maintenance section (sweep rows pattern for Codeberg/Upptime additions).

</code_context>

<specifics>
## Specific Ideas

- TEL-05 "PowerBrowser: Report a Bug" opens the prefilled bug form in the stock browser window (candidate A precedent: `window.open` from the Theia command handler, GUI-01), prefilled with version, OS and install format as URL query params matching Phase 42 `bug.yml` field ids (`version`, `os`, `install_format`). The diagnostics layer's Copy button copies diagnostics that never appear in a URL (query string carries only the three prefill fields; diagnostics travel via clipboard only).
- GH-03 `triage.yml` runs on `issues: opened` in env `triage` with `claude-haiku-5-5`, explicit `GITHUB_TOKEN` with `issues: write` only, a concurrency group, and the FIX-08 pinning rules. Claude selects labels and a template id; a non-AI step posts the fixed template text. Triage never closes an issue. A planted issue carrying instructions produces only the template comment.
- GH-17 private vulnerability reports and security@ mail reach the owner as GitHub Mobile + phone notifications within the `SECURITY.md` acknowledgement window. The private-reporting route itself is the carried-unresearched item: plans prove the notification path and the window text, not the GitHub private-reporting UI.
- GH-04 legion systemd timer pushes git and tags to the Codeberg mirror daily with a deploy token held on legion; the sweep's Codeberg row compares Codeberg `main` SHA (public unauthenticated API) with GitHub `main` and goes red on lag.
- MON-02 Upptime repo on GitHub Pages serves the public status page at status.powerbrowser.org covering the updates host, the website and `/events`; the sweep reports whether its workflows are enabled and last-run age. No `schedule:` key in the product repo (D-77); the Upptime repo may use `schedule:` (it is outside the product repo).
- DOC-07 `docs/RELEASING.md` gains a support-operations section: triage, Discussions moderation, private vulnerability reports, CodeQL alerts after each rebase, and the rule that no fork PR workflow run is approved without reading its diff.
- New checks are registry rows in `scripts/verify-platform.sh` with `--self-test` siblings that plant each fault and must go red naming the drift; rows derive their expectation from the tree and compare as set equality.

</specifics>

<deferred>
## Deferred Ideas

None — discuss phase skipped.
</deferred>
