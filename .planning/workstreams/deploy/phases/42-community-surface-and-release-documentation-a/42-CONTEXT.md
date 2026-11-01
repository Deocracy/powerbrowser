# Phase 42: Community surface and release documentation (A) - Context

**Gathered:** 2026-10-22
**Status:** Ready for planning
**Mode:** Auto-generated (discuss skipped via workflow.skip_discuss)

<domain>
## Phase Boundary

A user who wants to report a bug, ask a question or disclose a vulnerability finds the right channel, and the release documentation matches the pipeline being built.

Requirements: GH-13, GH-01, GH-14, DOC-03, DOC-04, DOC-05, DOC-06 (full text in `.planning/workstreams/deploy/REQUIREMENTS.md`).

Success criteria (ROADMAP Phase 42):
1. New issue offers only the bug and feature forms, with blank issues off and links to Discussions and the security policy; a URL carrying `version`, `os` and `install_format` prefills the bug form.
2. The live label set equals `labels.json` as read by `repo-controls`, and the quick label row goes red naming a planted undeclared label in an issue form or workflow file.
3. `SECURITY.md`, `SUPPORT.md` and `docs/KNOWN-ISSUES.md` exist in the product repo, and `SECURITY.md`, `CONTRIBUTING.md` and `CODE_OF_CONDUCT.md` exist in the org `.github` repo.
4. `docs/RENEWALS.md` lists every renewable item with a date and an owner action, and the quick row `renewals` is green; `docs/RELEASING.md` states the two-week cadence, the current ESR 175 dates, the 24-hour queued-job cancellation, the rewritten secrets inventory, the non-ephemeral runner shape and the legion-rebuild runbook.
5. Drafts S2, S3 and S8 under `.planning/drafts/distribution/` are reconciled with NG-065 and NG-067 or marked superseded.

</domain>

<decisions>
## Implementation Decisions

### Already decided (owner, 2026-10-20)
- All owner decisions in REQUIREMENTS.md "Owner Decisions" are binding (SEED-002 §12 recommended defaults plus the research additions): Apps only, no PATs; bot App without Workflows; non-ephemeral legion runner later (Phase 49); fork approval for all external contributors; tags created only by the bot App after `release` approval.
- D-77 holds: no `schedule:` key in the product repo (GH-12, Phase 41). The `workflows` row stays the trust-boundary gate; every new workflow file in this phase (none planned) would fall under it.
- Website carries no version facts and no `release.json` (owner decision 13); `/download` MAR-size line waits for Phase 45 measurement (ROADMAP ordering note).
- The RENEWALS split is decided (ARCHITECTURE §1 item 122, CRITIQUE C19): `renewals` (quick: structure only, every row has a date and an owner action) and `renewals-due` (maintenance sweep, Phase 48). This phase builds only the quick half.

### Owner gates in this phase (stop points for autonomous execution)
- Every change to the LIVE GitHub org or repo is an owner action: applying the label set (`gh label create --force` from `labels.json`), creating the org `.github` repository if absent, enabling or verifying Discussions, creating `powerbrowser-updates` and Homebrew tap repos if Phase 41 has not (GH-10), and any `repo-controls` live apply. Plans build everything locally — declared `labels.json`, the extended `repo-controls` read for labels, the `labels` quick row and its self-test, issue forms, SECURITY/SUPPORT/KNOWN-ISSUES/CONTRIBUTING/CODE_OF_CONDUCT, `docs/RENEWALS.md`, the `renewals` row and its self-test, `docs/RELEASING.md` doc fixes, and the S2/S3/S8 reconciliation record — and end with one `checkpoint:human-action` listing the exact commands, after which the live reads run.
- Read-only `gh api` calls against the live org/repo are allowed for research and for the read-back rows.

### Assumption about the unfinished dependency (Phase 41)
- Phase 42 depends on Phase 41 per ROADMAP. Phase 41 is not finished (owner checkpoint 41-04 pending: live apply, App creation, second owner, probes and drills). Plans assume Phase 41 lands as written: `.github/settings/*.json` bodies exist, `scripts/verify-repo-controls.mjs` exports CONTROLS with `planWrites`, the `workflows` and `zizmor` quick rows exist, and `docs/RELEASING.md` carries the Phase 41 settings text. If Phase 41 changes the CONTROLS shape, the settings-file list, or the registry insertion points, the Phase 42 executor adapts the label-control extension to the landed shape instead of the researched one.
- Phase 41 COVERAGE.md marks `labels` as OPT-OUT "not needed yet: Phase 42 (GH-13) declares labels.json and extends repo-controls". This phase performs that extension.

### Claude's Discretion
All other implementation choices are at Claude's discretion — discuss phase was skipped per user setting. Use the ROADMAP phase goal, success criteria, and codebase conventions to guide decisions.

</decisions>

<code_context>
## Existing Code Insights

Start from `.planning/research/v1.6-deploy/ARCHITECTURE.md` (§1 items 5, 122; §3.4 RENEWALS split; §4 A7; R2–R6 doc corrections) and `SUMMARY.md` Phase A7 (GH-01 + DOC-01), `.planning/research/v1.6-deploy/FEATURES.md` (issue-form and RENEWALS rows), `scripts/verify-repo-controls.mjs` (CONTROLS table, settings-set equality, `gh api` read-back with `X-GitHub-Api-Version: 2022-11-28`), `scripts/verify-workflows.mjs` (GH-12 trust boundary, admission from `actions-selected.json`), `docs/RELEASING.md` (cadence lines, ESR 175 lines, queued-job lines, secrets inventory, runner shape, rebuild runbook), `.planning/drafts/distribution/S2-release-identity-PLAN.md`, `S3-mar-signing-and-update-integrity-PLAN.md`, `S8-reports-bug-error-crash-PLAN.md` (reconcile against NG-065/NG-067), and the live NG-065/NG-067 evidence in `ledger/REQUIREMENTS.json` (both `done`).

</code_context>

<specifics>
## Specific Ideas

- GH-13 label families: type/*, os/*, format/*, area/*, plus needs-triage, needs-info, confirmed, duplicate, wontfix, good-first-issue, security, upstream, release-train, claude-fix, train:blocked. `labels.json` is the set; `repo-controls` compares live vs declared as set equality; the quick row asserts every label named in `.github/ISSUE_TEMPLATE/*.yml` and in workflow files is in `labels.json`, self-test plants an undeclared label.
- GH-01 forms: `bug.yml` (labels `type/bug` + `needs-triage`; field ids `version`, `os`, `install_format` as URL-prefillable text inputs, plus steps, expected and diagnostics), `feature.yml`, `config.yml` with blank issues off and links to Discussions and the security policy. TEL-05 (Phase 53) later prefills `version`/`os`/`install_format` — keep those ids stable.
- GH-14: product repo `SECURITY.md` (private reporting first, security@ second, latest release only, acknowledgement window), `SUPPORT.md`, `docs/KNOWN-ISSUES.md`; org `.github` repo `SECURITY.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`. No internal identifiers in user-facing copy (CLAUDE.md rule; UPD-32 shape test is Phase 46, not this phase).
- DOC-03 line targets: cadence two weeks (`docs/RELEASING.md:681`, `README.md:46-47`, `rebase-upstream.yml:1-4`), current ESR 175 dates (`RELEASING.md:750-756`), queued self-hosted job cancelled after 24 hours (`RELEASING.md:909-910`).
- DOC-04 RENEWALS rows: domain, Apple membership, Developer ID certificate, Azure validation, App keys, Cachix token, Safe Browsing key, each Cloudflare token (INF-06), Codeberg token, Anthropic keys, winget submission credential, MAR certificate (2046), Node 24 end of life, ESR 175 train dates. Quick row checks structure only (every row a date + an owner action).
- DOC-05 RELEASING rewrite: App keys per environment, no PAT or App key on legion, descriptor PAT replaced by scoped App token; non-ephemeral runner shape replacing `:258-288`, `:476-478`, `:917-920`; `release` environment policy `main` (`:320-321`); legion-rebuild runbook (four objdirs ~14 GB each).
- DOC-06: S2, S3, S8 reconciled with NG-065 (MAR signature enforced, done) and NG-067 (frontend errors reach telemetry, done) or marked superseded — the drafts predate the non-GUI wave E proofs.
- New checks are registry rows in `scripts/verify-platform.sh` CHECKS plus `--self-test` siblings that plant each fault and go red naming the drift; expectations derived from the tree and compared as set equality; `--quick` rows use no build, browser, display or network.

</specifics>

<deferred>
## Deferred Ideas

None — discuss phase skipped.

</deferred>
