---
phase: 57-native-crash-reporting-k
plan: 07
gap_closure: true
gap: G-57 hostname (section 2 crash.powerbrowser.org)
status: complete
requirements: [TEL-07]
key-files:
  modified: [worker/wrangler-crash.toml, docs/RELEASING.md, .planning/workstreams/deploy/phases/57-native-crash-reporting-k/BLOCKED.md]
commits: [f1e9fe22]
---

# 57-07 summary: crash hostname in the routes block

- `worker/wrangler-crash.toml` routes now reads `pattern = "crash.powerbrowser.org"`, so no
  `REPLACE-WITH-CRASH-HOSTNAME` remains in the tree outside the planning notes.
- Runbook step 6 is now an explicit owner check: the routes host, the rate-limit rule host and the host of
  `[urls].crash_report` must match before step 7. The owner still runs every deploy step.
- `[urls].crash_report` is still unset. Stating it repoints `breakpad.reportURL` and needs the allowlist row, so it
  follows the owner's deploy record (B3). B3 also now notes that the runbook's order (rate-limit rule before the
  deploy) overrides its own older list.
- `crash-submit` and its self-test pass, as does `--quick` apart from the known red.
