# API Coverage — GitHub REST API, product-details and nodejs.org (175 dual-major scope)

> Full coverage by default. Opt-outs are explicit, reasoned decisions.

Scope is the read surface the 175 detector needs plus the write surface the replay-only bump and the train report need. Phase 41's COVERAGE.md owns the settings surface (rulesets, environments, Apps, runner groups); this file owns only what Phase 58 adds for the second major. Same GitHub REST API as Phase 41, re-decided for the 175 surface per the coverage checkpoint (no silent carry-over).

| capability | decision | reason |
|---|---|---|
| matching-refs tag list: `GET repos/{o}/{r}/git/matching-refs/tags/FIREFOX_<major>_` | INTEGRATE | per-major source of truth for both lines (Pitfall 10) |
| product-details `FIREFOX_ESR` read (advisory cross-check only) | INTEGRATE | |
| nodejs.org `index.json` + SHASUMS256 read (unchanged Node line) | INTEGRATE | detector already reads it (AUTO-04); 175 changes nothing |
| tracking-issue open, PATCH-body, comment, label, assign, close, reopen (per release key) | INTEGRATE | one open issue per key: `release-train: v153…` and `release-train: v175…` |
| `chore/esr-<TAG>` branch PR open/update (bot token, existing Phase 43 path) | INTEGRATE | 175 branches carry the full tag so the major is visible |
| `ESR <tag>: patch <NNN> did not apply` conflict issue open/update, assigned to owner | INTEGRATE | AUTO-07 shape, replay-only failures |
| check-run / commit-status read for `verify` on bump heads | INTEGRATE | BUMP_PR_GREEN derivation |
| `release.yml` workflow-dispatch with merge SHA + run-link readback | INTEGRATE | same path as the 153 line (TRAIN-10 validation is major-agnostic) |
| App installation token mint for `powerbrowser-updates` descriptor commit | OPT-OUT | not needed yet: 175 descriptors ship at execution through the Phase 49 path, which owns the token |
| runner-group restriction read/write | OPT-OUT | not needed: GH-11 probe recorded in Phase 41; 175 adds no runner |
| environment secrets and variables | OPT-OUT | not needed: no new environment, no new secret in Phase 58 |
| notification settings | OPT-OUT | not needed: no REST API exists (Phase 41 precedent) |
| Releases create/publish/tag for 175 | OPT-OUT | not needed yet: ship happens at execution through `release.yml`; this phase only prepares the detector, rebase and measurement |
| `FIREFOX_ESR153` product-details key | OPT-OUT | explicitly out of scope: undocumented, may never appear; tags are the source |
