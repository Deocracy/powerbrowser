# API Coverage — Phase 47

No external API integration: the only live reads are read-only `gh api` GETs reusing the existing `repo-controls` row instrument (`X-GitHub-Api-Version: 2022-11-28`, `git/trees/main?recursive=1`), and unauthenticated `curl` GETs against the public site/descriptors — no new API surface.
