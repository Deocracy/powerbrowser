---
phase: 43-release-train-skeleton-and-upstream-bump-automation-a
plan: 08
status: complete
gap_closure: true
subsystem: infra
tags: [scheduler, wrangler, cloudflare, INF-03, G-cmd]
requirements-completed: []
requirements-advanced: [INF-03]
key-files:
  modified: [docs/RELEASING.md]
commits: [dfb4d13a]
---

# 43-08 summary: scheduler wrangler.toml reference

Gap G-cmd, scheduler half. docs/RELEASING.md, beside the Worker scaffold that 43-05 Task 2 step 3
copies, now holds the scheduler repo's `wrangler.toml`: `name = "powerbrowser-scheduler"`,
`main = "src/index.ts"`, `compatibility_date = "2025-01-01"`, `workers_dev = true`,
`preview_urls = false`, `crons = ["17 * * * *"]`, `[[send_email]] name = "MAIL"` with
`destination_address` limited to the owner mailbox, and vars `CLOCK_APP_ID`, `REPO_OWNER`,
`REPO_NAME`, `ALERT_FROM`, `ALERT_TO`. Owner-supplied values are `REPLACE-WITH-…` placeholders. No
secret is in the file. The owner command sequence follows it: npm install
`universal-github-app-jwt@2.2.2`, wrangler version, `secret put CLOCK_PRIVATE_KEY`, shred, deploy.
Claude deployed nothing.

`REPO_OWNER` is a placeholder rather than the org name because the brand scan admits the org
token only in its listed files, and docs/RELEASING.md is not one of them.

Verification: the block parses with Python `tomllib` (triggers, send_email and vars read back);
the brand scan PASS; `--quick` only the three known reds.
