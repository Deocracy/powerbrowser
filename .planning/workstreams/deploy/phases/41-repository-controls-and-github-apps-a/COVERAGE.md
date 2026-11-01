# API Coverage — GitHub REST API (org and repository governance settings)

> Full coverage by default. Opt-outs are explicit, reasoned decisions.

Scope is the settings surface that Phase 41's controls rely on. Every INTEGRATE row is
written by `scripts/apply-repo-controls.mjs` (by the owner, at plan 41-04) and read back by
`scripts/verify-repo-controls.mjs`. The exceptions are rows marked read-only or owner-probe.

| capability | decision | reason |
|---|---|---|
| repository rulesets: list, get, create, update | INTEGRATE | |
| environments: list, create or update | INTEGRATE | |
| environment deployment branch policies: list, create | INTEGRATE | |
| repository Actions permissions (allowed_actions, sha_pinning_required) | INTEGRATE | |
| repository selected actions | INTEGRATE | |
| repository default workflow token permissions | INTEGRATE | |
| fork pull-request contributor approval | INTEGRATE | |
| repository Actions secrets (read-only count) | INTEGRATE | |
| immutable releases | INTEGRATE | |
| private vulnerability reporting | INTEGRATE | |
| repository update: has_discussions, allow_auto_merge | INTEGRATE | |
| releases list (read-only, zero-Releases guard) | INTEGRATE | |
| organisation get (two_factor_requirement_enabled) | INTEGRATE | |
| organisation members, role admin | INTEGRATE | |
| organisation App installations | INTEGRATE | |
| installation repository list (read-only, owner token; probed at plan 41-04) | INTEGRATE | |
| GitHub App user access token by device flow (owner-probe: client id only, owner-minted at run time for the list read) | INTEGRATE | used only if the owner token cannot read the list and the owner picks DEVICE-FLOW at plan 41-04 |
| organisation runner groups (owner probe, GH-11; needs admin:org) | INTEGRATE | |
| environment custom deployment protection rules | OPT-OUT | not needed: required reviewers and the wait timer are the gates; no protection App exists |
| environment secrets and variables | OPT-OUT | not needed yet: Phases 43, 44 and 49 add environment secrets, and their own plans extend repo-controls |
| repository Actions variables | OPT-OUT | not needed: no workflow reads a repository variable |
| repository update: other keys (merge methods, branch deletion, visibility) | OPT-OUT | not needed: no v1.6 requirement sets them; merge methods are constrained by main-review |
| organisation-level Actions permissions | OPT-OUT | not needed: needs admin:org, and the repository-level policy binds the one product repository |
| organisation rulesets | OPT-OUT | not needed: repository rulesets cover the one product repository |
| classic branch protection | OPT-OUT | explicitly out of scope: superseded by rulesets, which work on Free public repos |
| legacy tag protection | OPT-OUT | explicitly out of scope: deprecated and replaced by tag rulesets |
| repository self-hosted runners | OPT-OUT | not needed yet: Phase 49 (SEC-08) registers the legion runner |
| labels | OPT-OUT | not needed yet: Phase 42 (GH-13) declares labels.json and extends repo-controls |
| Discussions categories | OPT-OUT | not needed yet: Phase 42 community surface |
| webhooks | OPT-OUT | not needed: both Apps are created with webhooks inactive and nothing consumes one |
| deploy keys | OPT-OUT | explicitly out of scope: Apps only, by owner decision |
| collaborators and teams | OPT-OUT | not needed: two owner accounts, no teams |
| code security (secret scanning, push protection, Dependabot, code scanning) | OPT-OUT | not needed yet: Phase 51 (Dependabot and CodeQL) |
| GitHub App manifest creation flow | OPT-OUT | explicitly out of scope: the manifest conversion forces a private key into the response before any consumer exists; Apps are created in the UI |
| App JWT and installation access tokens | OPT-OUT | not needed yet: Phase 43 mints the first App token |
| notification settings | OPT-OUT | not needed: no REST API exists; the owner sets them in the UI and the GH-18 drills prove delivery |
| organisation 2FA requirement write | OPT-OUT | not needed: no REST key exists; the owner sets it in the UI and repo-controls reads it back |
| GitHub Pages | OPT-OUT | explicitly out of scope: the site is on Cloudflare Pages (Phase 47) |
| Actions OIDC subject claim customisation | OPT-OUT | not needed yet: Phase 52 fixer authentication |
