# Phase 47: Hosting, website and mail (D) - Context

**Gathered:** 2026-10-22
**Status:** Ready for planning
**Mode:** Auto-generated (discuss skipped via workflow.skip_discuss)

<domain>
## Phase Boundary

powerbrowser.org serves a static site with download, privacy and legal pages, updates.powerbrowser.org serves the descriptors, and mail to security@, contact@ and privacy@ reaches the owner.

Requirements: INF-01, INF-06, DIST-03, INF-02, WEB-01, WEB-02, WEB-03, WEB-04, WEB-05, TEL-08 (full text in `.planning/workstreams/deploy/REQUIREMENTS.md`).

</domain>

<decisions>
## Implementation Decisions

### Already decided (owner, 2026-10-20)
- All owner decisions in REQUIREMENTS.md "Owner Decisions" are binding (SEED-002 §12 recommended defaults plus the research additions): clock-only Worker (decision 1, amends SEED-002 rows 1/4/7/13); Apps only, no PATs; bot App without the Workflows permission; one release per ESR point release plus revision bumps (decision 5); static hosting on Cloudflare Pages (decision 8); `identity.fxaccounts.enabled=false` (decision 6); Safe Browsing keyfile outside the repo (decision 7); keep Cachix request first with R2 S3 fallback and keep Flathub (decision 22).
- WEB-05: `powerbrowser-website` deploys to a Cloudflare Pages project at powerbrowser.org on push to its default branch; home page carries zero per-release version facts (decision 13) and the Mozilla non-association footer sentence; security.txt is served through Cloudflare's zone-level security.txt feature (WEB-04), which avoids the Pages `.well-known` question.
- DIST-03: `powerbrowser-updates` deploys to Cloudflare Pages at updates.powerbrowser.org with one `update.xml` per channel and BUILD_TARGET plus one `_redirects` 200 rule; the full-tier row `updates-repo-static` asserts through `gh api` that the repo has no `functions/` and no `_worker.js`.
- TEL-08: /privacy states the opt-in `/events` payload (type, basename, line, column, version, buildID, OS; no message, no stack), the 30-day retention, Cloudflare as the only processor, the hosts contacted unattended, privacy@ and the postal address.
- INF-06: every Cloudflare credential has one named holder and a `docs/RENEWALS.md` row; the maintenance sweep holds no Cloudflare token and writes download counts through the telemetry Worker (TEL-11).

### Owner gates in this phase (stop points for autonomous execution)
- Every live Cloudflare and GitHub action is an owner action: creating the Cloudflare account with 2FA; the Namecheap inventory, DNSSEC-off and nameserver change (up to 24 hours to propagate); R2 enablement (a payment method may be required); creating the `powerbrowser-website` repo if absent (GH-10 created `powerbrowser-updates` and the Homebrew tap repo empty in Phase 41); creating both Pages projects and attaching the custom domains; enabling zone-level security.txt and Email Routing; sending the three test messages; running the live `_redirects` 11-segment probe and the four page GETs. Plans build everything locally — site sources, the updates-repo placeholder tree and `_redirects`, the `updates-repo-static` row and its self-test, RENEWALS rows, RELEASING.md controls text — and end with one `checkpoint:human-action` listing the exact commands, after which the live probes are run.
- Read-only `gh api` calls against the live org/repo and unauthenticated `curl` GETs against the public site/descriptors are allowed for research and for the read-back rows.

### Assumptions about unfinished dependencies
- Phase 41 is not finished (41-04 owner checkpoint pending at plan time): the `powerbrowser-updates` repo may not exist yet, neither GitHub App may be installed, and the live `repo-controls` row is not green. Plans treat the empty `powerbrowser-updates` repo as the Phase 41 deliverable and do not re-create its controls; if the repo is absent at execution time, the executor records it and stops at the owner checkpoint rather than creating org repos itself.
- WEB-02's MAR-size line uses Phase 45's PKG-21 measurement, which does not exist yet. Plans carry the measured tarball size from the local tree where derivable and mark the published MAR-size sentence as pending the Phase 45 measurement, stated explicitly in /download copy and in the plan's flagged assumption.

### Claude's Discretion
All other implementation choices are at Claude's discretion — discuss phase was skipped per user setting. Use the ROADMAP phase goal, success criteria, and codebase conventions to guide decisions.

</decisions>

<code_context>
## Existing Code Insights

Start from `.planning/research/v1.6-deploy/ARCHITECTURE.md` §5 table (release-train ↔ powerbrowser-updates App token; `_redirects` placeholder rule), §8 rows (Pages serves 25 MiB cap, MAR bytes stay on Releases) and Phase D row (INF-01, DIST-03, INF-02, TEL-06/08, WEB-01; INF-03 becomes the maintenance sweep plus the external watchdog), `docs/RELEASING.md:394-429` (the `_redirects` eleven-segment rule, the placeholder `default/Linux_x86_64-gcc3/update.xml` no-update document, the single-page website note with the `/download /#download 302` line, and the open probe questions), `scripts/verify-workflows.mjs` + `scripts/verify-zizmor.mjs` (Phase 41 trust-boundary rows this phase's new Pages/deploy workflows must also satisfy), and `scripts/verify-platform.sh` (the CHECKS registry this phase extends with exactly one row plus its self-test row).

</code_context>

<specifics>
## Specific Ideas

- The `_redirects` 200 rule must be probed live with the segment shapes a real client sends, including an `OS_VERSION` segment carrying a percent-escaped space and literal parentheses and a `SYSTEM_CAPABILITIES` segment carrying `%3A` and `%2C`; an unknown BUILD_TARGET must return 404, not another target's descriptor. If a placeholder does not match an escaped segment, the fallback is a minimal `_worker.js` on the same project — but the `updates-repo-static` row forbids `functions/` and `_worker.js`, so the fallback needs its own recorded decision and never lands silently.
- The home page spells the product "PowerBrowser", carries the footer sentence "DeBIOS Foundation and PowerBrowser are not officially associated with Mozilla or its products", makes zero third-party requests, and states no per-release version facts.
- /download states the attestation covers the upload rather than the legion build, notes that `gh` needs a GitHub login, and offers the offline `--bundle` alternative.

</specifics>

<deferred>
## Deferred Ideas

None — discuss phase skipped.

</deferred>
