# API Coverage — GitHub REST labels API (community surface)

> Scope is the label surface that Phase 42 relies on. Every INTEGRATE row is
> applied by the owner at plan 42-04 (`gh label create --force` loop plus
> explicit deletes) and read back by `scripts/verify-repo-controls.mjs`
> (labels control, full-tier `repo-controls` row). Static agreement is read
> from the tree by `scripts/verify-labels.mjs` (quick `labels` row, no API).
> Prior-phase COVERAGE.md OPT-OUT rows for labels and Discussions categories
> are INTEGRATEd here.

| capability | decision | reason |
|---|---|---|
| labels list (`GET repos/{owner}/{repo}/labels?per_page=100`) | INTEGRATE | read back by the labels control; compared as a name set against labels.json |
| labels create-or-update via `gh label create --force` (owner terminal) | INTEGRATE | the apply path; colors and descriptions are presentation, names are the contract |
| labels delete via `gh label delete` (owner terminal) | INTEGRATE | removes the defaults and automation labels the declared set does not name, so set equality can go green |
| repo read (`has_discussions`, `has_issues` flags) | INTEGRATE | verifies Discussions is enabled before the config.yml link ships |
| org `.github` repo create (`gh repo create DeBIOS-Foundation/.github --public`, owner terminal) | INTEGRATE | community health defaults take org-wide effect only in the literal `.github` repo |
| org `.github` repo content via normal PRs | INTEGRATE | three staged bodies merged after review, never by script |
| `powerbrowser-updates` and tap repo create (owner terminal, only if Phase 41 has not) | INTEGRATE | GH-10 repos the bot App install list needs |
| Discussions categories | OPT-OUT | not needed: no requirement customizes categories; enabling Discussions suffices |
| webhooks | OPT-OUT | not needed: no App or workflow in this phase consumes one |
| notification settings | OPT-OUT | not needed: no REST API exists; form previews are verified manually at the checkpoint |
| Issues write (triage/report jobs) | OPT-OUT | not needed yet: triage.yml lands in Phase 53 (GH-03), the train report job in Phase 43 |
