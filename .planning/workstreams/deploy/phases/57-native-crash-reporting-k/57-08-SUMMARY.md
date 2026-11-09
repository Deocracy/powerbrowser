---
phase: 57-native-crash-reporting-k
plan: 08
gap_closure: true
gap: G-57 part 3 (B6 MOZ_CRASHREPORTER_AUTO_SUBMIT clear, WR-05)
status: complete
requirements: [TEL-13]
executed_in: Phase 59 lane 59-02 (workstream orca, branch ServerDestroyer/p59-02), 2026-11-08
key-files:
  created: [scripts/verify-crash-autosubmit-env.mjs]
  modified: [powerbrowser/shell/PowerBrowserAPI.sys.mjs, powerbrowser/INTERNAL-APIS.md, docs/CRASH-POLICY.md, .planning/workstreams/deploy/phases/57-native-crash-reporting-k/BLOCKED.md]
commits: [b03b6b53]
---

# 57-08 summary: the crash client's auto-submit variable is cleared at startup

Tasks 1 and 2 are complete. The live proof is deferred to the TEL-13 reporter build (Phase 59 plans 59-05 and
59-07), because no reporter-enabled build exists. The plan's `blocked_on` (another session held
`PowerBrowserAPI.sys.mjs`) no longer applied; Phase 59 lane 59-02 ran the plan. Its PLAN.md frontmatter still says
`status: blocked`, because that file is outside the lane's file set.

- Task 1 (commit b03b6b53): `PowerBrowserAPI.clearEnv(name)` sits next to `getEnv` and sets the variable to `""`
  through `Services.env.set`. `PowerBrowserSingleInstanceHandler.handle` calls
  `PowerBrowserAPI.clearEnv("MOZ_CRASHREPORTER_AUTO_SUBMIT")` as the first statement inside its existing try, before
  `cliUrl`, so a throw is logged and cannot abort the handler. `nsEnvironment::Set`
  (`upstream/xpcom/threads/nsEnvironment.cpp`) writes `NAME=` through `PR_SetEnv`, which leaves the variable set to
  the empty string; `env_bool` reads an empty or absent variable as false. The Windows behaviour was not checked
  (Windows is out of Phase 59). INTERNAL-APIS.md has the new `Services.env.set` row. `check-internals-boundary.sh` (scan,
  `--catalogue`, `--self-test`) and `ng-040-internals-catalogue-lines` pass.
- Catalogue renumbering: `verify-ng-040-internals-catalogue-lines.mjs --fix` was run as planned, and it left 33
  occurrences uncatalogued. It parses only the Touchpoints table, so it never renumbers the rows filed under
  "Deliberately not touched", which `check-internals-boundary.sh --catalogue` also counts. Every File:Line cell in
  both tables was therefore shifted deterministically instead: old lines after 425 moved by 5, and after 4460 by 7.
  A normalised diff against the previous commit shows that only those numbers changed.
- Task 2 (gate, policy, B6): `scripts/verify-crash-autosubmit-env.mjs` reads text only, so it runs in `--quick`.
  It derives `MOZ_CRASHREPORTER_AUTO_SUBMIT` at check time from the `ekey!` prefix
  (`upstream/toolkit/crashreporter/client/app/src/main.rs`, `concat!("MOZ_CRASHREPORTER_", $name)`) and the
  `auto_submit` assignment in `config.rs`. It requires `env_bool`'s
  `std::env::var(name).map(|s| !s.is_empty()).unwrap_or(false)`, a `clearEnv` body that is exactly
  `Services.env.set(<param>, "")`, and the call as the first statement inside the handler's try. The self-test plants
  six faults and each goes red naming the drifted file: call removed, call moved after `cliUrl`, a different name, a
  non-empty value, a renamed `config.rs` key, and `env_bool` reading any set value as true. The gate was red on the
  tree before Task 1 (2 problems naming `PowerBrowserAPI.sys.mjs`). It also fails closed, naming `main.rs` and
  `config.rs`, when `upstream/` is absent.
- `docs/CRASH-POLICY.md`: both other send paths are now recorded as closed (the 57-05 pref lock and this clear), with
  the limit that a crash before the command-line handler runs still sees the variable. In BLOCKED.md, the B6 env
  bullet is closed with commit b03b6b53 and the B6 heading reads CLOSED in the tree.
- Registry rows `crash-autosubmit-env` and `crash-autosubmit-env-self-test` are not in `scripts/verify-platform.sh`
  yet. That file belongs to lane 59-03 in wave 1, so the coordinator appends both rows at the 59-02 merge, directly
  after `crash-autosubmit-lock-self-test`. The row text is in
  `.planning/workstreams/orca/phases/59-carry-forward-from-v1-5-and-v1-6/59-02-SUMMARY.md`.
- Not checked live: whether a reporter-enabled build started with `MOZ_CRASHREPORTER_AUTO_SUBMIT=1` shows the dialog
  after a content-process crash. That check needs a tier-3 reporter build and `-purgecaches`.
