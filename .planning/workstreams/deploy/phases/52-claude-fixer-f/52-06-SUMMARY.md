---
phase: 52-claude-fixer-f
plan: 06
gap_closure: true
gap: G-52
status: complete
requirements: [FIX-01, TRAIN-06]
key-files:
  modified:
    - .github/workflows/release-train.yml
    - scripts/release-train.mjs
commits: [b4a06c23]
---

# 52-06 summary: OWNER_LOGIN for the fixer guard and the fix-pr assignee (R11)

- release-train.yml: `OWNER` now reads `${{ vars.OWNER_LOGIN }}` in the derive job's
  fixer-inputs step (line 245) and the fix-pr publish step (line 1861). FINISH-PLAN's lines 178
  and 1619 had moved to these lines on main. The three `owner:` inputs of
  `actions/create-github-app-token` in these jobs stay `github.repository_owner`: they name the
  App installation account (the organisation), not a person.
- release-train.mjs `fixerGuard`: refuses with guard `owner-login` when the owner login does not
  match `OWNER_RE`. Without it, an unset variable yields `''`, and `fixerDispatch`'s
  `f.author !== f.ownerLogin` would admit a base commit whose author login is also `''`.
- Self-test: two new plants (unset owner with empty author; `two words`) go red naming
  `owner-login`. `release-train-logic: --self-test PASS -- 74 planted faults ... 69 controls`.
- `--only workflows` PASS, `--only workflows-self-test` PASS. `node scripts/generate.mjs`: no
  change under generated/. `--quick`: only `fixer-isolate-self-test` red (known sandbox red).
- Owner action (not done here, no network writes): set repository variable
  `OWNER_LOGIN=ServerDestroyer` on Deocracy/powerbrowser:
  `gh variable set OWNER_LOGIN --repo Deocracy/powerbrowser --body ServerDestroyer`.
  Until it is set every fixer dispatch is refused at derive with guard `owner-login`.
