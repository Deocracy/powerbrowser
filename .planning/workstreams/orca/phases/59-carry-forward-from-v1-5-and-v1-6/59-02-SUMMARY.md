# Phase 59 Plan 02: CF-15 lane Summary (in progress: Tasks 1-3 done; Task 4 completes this file)

## Registry rows for the coordinator

`scripts/verify-platform.sh` belongs to lane 59-03 in wave 1, so this lane does not edit it. At the 59-02 merge,
append these four lines directly after the `crash-autosubmit-lock-self-test` row (line 3805 on the lane base):

```bash
    # NEW (Phase 57, 57-08, WR-05; run in Phase 59 lane 59-02): MOZ_CRASHREPORTER_AUTO_SUBMIT is cleared first in
    # PowerBrowserSingleInstanceHandler.handle via PowerBrowserAPI.clearEnv; name from config.rs + main.rs ekey!. Text reads only.
    "crash-autosubmit-env|node $REPO_ROOT/scripts/verify-crash-autosubmit-env.mjs"
    # Green first, then six plants (call removed, call moved after other work, different name, non-empty value,
    # config.rs key renamed, env_bool reading any set value as true), each red naming the drifted file.
    "crash-autosubmit-env-self-test|node $REPO_ROOT/scripts/verify-crash-autosubmit-env.mjs --self-test"
```
