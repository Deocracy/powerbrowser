# API Coverage — GitHub REST API (release-train derivation reads, withdraw writes, pinned-issue maintenance)

> Full coverage by default. Opt-outs are explicit, reasoned decisions.

Scope is the GitHub API surface that Phase 50 integrates: the new derivation reads
(runs, pending deployments, releases, powerbrowser-updates contents), the withdraw
writes, and the issue create/PATCH surface. Every INTEGRATE row is read by
`scripts/release-train.mjs` (`collectFacts`, plan 50-01), written by
`powerbrowser-updates/.github/workflows/withdraw.yml` (plan 50-03), or maintained by
the `release-train.yml` report job (plan 50-04). The exceptions are rows marked
read-only, owner-probe, or executor-probe. No-analog rows from 50-PATTERNS are OPT-OUT
with reasons or executor-probe notes.

| capability | decision | reason |
|---|---|---|
| actions workflow runs list filtered by head_sha and event (`GET repos/{o}/{r}/actions/workflows/release.yml/runs?head_sha={sha}&event=workflow_dispatch`) | INTEGRATE | train run resolution by head_sha equality, never recency (50-01 Task 1) |
| actions run get (`GET repos/{o}/{r}/actions/runs/{run_id}`) plus jobs (`.../jobs`) | INTEGRATE | BUILDING derivation: status, conclusion, html_url, head_sha, per-job name/status/conclusion |
| pending deployments get (`GET repos/{o}/{r}/actions/runs/{run_id}/pending_deployments`) | INTEGRATE | AWAITING_APPROVAL / DESCRIPTOR_WAIT derivation; verified `[]` on completed runs, waiting shape executor-probed on the first real waiting run |
| release get by tag (`GET repos/{o}/{r}/releases/tags/{tag}`) | INTEGRATE | PUBLISHED / WITHDRAWN derivation: draft, prerelease, tag_name, assets, body marker; 404 maps to null, not red |
| updates-repo contents get per target (`GET repos/{o}/{updates}/contents/{channel}/{target}/update.xml?ref=main`) | INTEGRATE | DESCRIPTOR_LIVE / LIVE_RED derivation: base64 content plus sha, byte-compared with served bytes; targets from the manifest, never a hand list |
| workflow dispatch post (`POST repos/{o}/{r}/actions/workflows/release.yml/dispatches` with ref main plus inputs merge_sha) | INTEGRATE | dispatch-release job (50-01 Task 2) on a token with actions:write (clock App token or GITHUB_TOKEN actions:write); bot App token alone 403s |
| issue search by label plus key (`GET search/issues?q=repo:{o}/{r}+label:release-train+{key}`) | INTEGRATE | tracking-issue lookup on every run; 2-plus duplicates red |
| issue get (`GET repos/{o}/{r}/issues/{n}`) | INTEGRATE | DONE / WITHDRAWN bookkeeping reads state and locked only; body never parsed as state |
| issue create (`POST repos/{o}/{r}/issues`) | INTEGRATE | tracking issue plus one KNOWN-ISSUES pinned issue (create once, plan 50-04 Task 1) |
| issue update (`PATCH repos/{o}/{r}/issues/{n}` body only on bytes-differ) | INTEGRATE | report job renders then PATCHes only when rendered bytes differ; otherwise no-op |
| release update (`PATCH repos/{o}/{r}/releases/{id}` prerelease true plus body append) | INTEGRATE | withdraw marking per the recorded probe verdict (flag branch iff allowed, else notes-only); assets, tag, draft untouched |
| updates-repo contents write (commit no-update descriptor per target) | INTEGRATE | withdraw job commits `Withdraw <tag>: no-update descriptors (<reason>)` to updates main, re-read and set-compared |
| GraphQL `pinIssue` mutation (issue node id) | INTEGRATE | pinning has no REST endpoint; primary pin path with the bot App token (1 of max 3 pinned, budget in RELEASING.md); fallback one owner click recorded with date plus who |
| release download (`gh release download <tag>`) | INTEGRATE | hop drill fetches the MAR bytes plus the attestation bundle on the host (read-only into the clean container) |
| attestation verify (`gh attestation verify <mar> [--bundle <bundle>] --repo <owner>/<repo>`) | INTEGRATE | hop attestation assertion; offline bundle form preferred in the credential-free container, host-side login form as recorded fallback; absent bundle plus absent login is red, never SKIP |
| `gh api` pending-deployments waiting-run shape (`[{environment:{name}}]`) | INTEGRATE | executor-probe on the first real waiting run (or a drill wait); projection adjusted if nested, semantics unchanged |
| immutable-release flag-vs-notes branch (PATCH prerelease sticks or not) | INTEGRATE | owner probe before the first public release decides the withdraw marking branch; verdict checked into RELEASING.md as configuration |
| App installation token mint (`actions/create-github-app-token`, per-step permission-contents write, mint-just-before-use, 1-hour expiry) | INTEGRATE | withdraw plus report token handling; never minted before a 24h-spanning wait |
| release delete (`DELETE repos/{o}/{r}/releases/{id}`) | OPT-OUT | explicitly out of scope: Releases are never deleted; immutable releases burn a deleted tag name forever |
| tag delete (`DELETE git/refs/tags/<tag>`) | OPT-OUT | explicitly out of scope: tags are never reused; the fix is always a new revision |
| organisation runners, runner groups, 2FA, members | OPT-OUT | not needed: owned by Phase 41 repo-controls, read back there |
| rulesets, environments, Actions policy, Apps and installations | OPT-OUT | not needed: owned by Phase 41 repo-controls; Phase 50 reads deployments only |
| Dependabot, CodeQL, code scanning alerts | OPT-OUT | not needed yet: Phase 51 owns them |
| webhooks | OPT-OUT | not needed: both Apps run with webhooks inactive and nothing consumes one |
| deploy keys, collaborators, teams | OPT-OUT | explicitly out of scope: Apps only, by owner decision |
| GitHub Pages API | OPT-OUT | explicitly out of scope: the site and descriptors are on Cloudflare Pages (Phase 47) |
| Actions cache, OIDC subject customisation | OPT-OUT | explicitly out of scope in the release path: no cache in release jobs; Phase 52 owns fixer auth |
| notification settings | OPT-OUT | not needed: no REST API exists; GH-18 drills prove delivery |
| powerbrowser-updates repo layout (`<channel>/<BUILD_TARGET>/update.xml`, `_redirects`, Pages) | OPT-OUT | no-analog row from PATTERNS: repo 404 today (Phase 47 creates it); executor derives from the landed tree per assumption A9, set-equality absorbs renames |
| docs/KNOWN-ISSUES.md content authorship | OPT-OUT | no-analog row from PATTERNS: Phase 42 (GH-14) creates the file; Phase 50 copies bytes verbatim at the merge SHA, never authors content |
