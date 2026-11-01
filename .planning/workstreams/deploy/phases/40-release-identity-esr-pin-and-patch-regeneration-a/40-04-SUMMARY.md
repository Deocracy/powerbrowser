---
phase: 40-release-identity-esr-pin-and-patch-regeneration-a
plan: 04
subsystem: infra
tags: [update-channel, mar, appupdate, policies, verify-platform, generate]

requires:
  - phase: 40-03
    provides: "release-identity quick rows (new rows append after them)"
provides:
  - "UPDATE_CHANNEL = 'default' and updateChannel(config) exported from scripts/generate.mjs"
  - ".mozconfig line ac_add_options --enable-update-channel=default"
  - "quick rows update-channel and update-channel-self-test"
  - "policies.json without an update URL; ng064 and mar-update-hop repointed at configuration.toml [urls] update"
affects: [40-08, 50, release pipeline, update descriptor host]

actuals:
  tokens: 13166
  tasks: 2
  commits: 2
plan_head_before: 7068357615d0b293c5893cb519c8ae6f3ce65b84
plan_head_after: 119c6b03e18bd09955b4f38aca857ac9291d5003

tech-stack:
  added: []
  patterns:
    - "Channel mentions are compared by kind (update channel vs MAR channel id), never by bare substring"
    - "Exclusion tables carry a reason per entry and the script refuses an entry without one"

key-files:
  created:
    - scripts/verify-update-channel.mjs
  modified:
    - scripts/generate.mjs
    - .mozconfig
    - scripts/verify-platform.sh
    - docs/RELEASING.md
    - .planning/PROJECT.md
    - powerbrowser/distribution/policies.json
    - scripts/verify-ng-064-update-url.mjs
    - scripts/verify-mar-update-hop.mjs
    - powerbrowser/endpoint-allowlist.json
    - configuration.toml
    - scripts/verify-webextensions.mjs
    - docs/REBRANDING.md
    - docs/BUILD.md

key-decisions:
  - "Update channel `default`, MAR channel id `powerbrowser-default`, from one exported generator constant (UPD-11)"
  - "configuration.toml [urls] update (MOZ_APPUPDATE_HOST) is the only update URL source; policies.json carries no AppUpdateURL (UPD-12)"

patterns-established:
  - "update-channel derives both values from the in-memory .mozconfig emission and checks the tracked tree against them"

requirements-completed: [UPD-11, UPD-12]

coverage:
  - id: D1
    description: "One update channel constant drives the .mozconfig channel line and both MAR ids; every structured mention in the tree agrees"
    requirement: UPD-11
    verification:
      - kind: other
        ref: "scripts/verify-platform.sh --only update-channel"
        status: pass
      - kind: other
        ref: "scripts/verify-platform.sh --only update-channel-self-test"
        status: pass
      - kind: other
        ref: "scripts/verify-platform.sh --only generated-byte-identity"
        status: pass
    human_judgment: false
  - id: D2
    description: "Shipped policies.json carries no update-URL policy; update-channel fails on its presence with any value"
    requirement: UPD-12
    verification:
      - kind: other
        ref: "node scripts/verify-update-channel.mjs --self-test (policy https and empty plants)"
        status: pass
    human_judgment: false
  - id: D3
    description: "ng064 requires the policy key's absence; the built application.ini and binaries carry updates.powerbrowser.org"
    requirement: UPD-12
    verification:
      - kind: other
        ref: "node --check scripts/verify-ng-064-update-url.mjs"
        status: pass
    human_judgment: true
    rationale: "ng064 is a full-tier row that reads a built objdir; this worktree has none. Its live run is plan 40-08."
  - id: D4
    description: "mar-update-hop's static half reads the update URL from configuration.toml [urls] update"
    requirement: UPD-12
    verification:
      - kind: other
        ref: "scripts/verify-platform.sh --only mar-update-hop-self-test"
        status: pass
    human_judgment: true
    rationale: "The full mar-update-hop row needs .mozbuild/mar-hop/ evidence from a real hop; its live run is plan 40-08."

duration: 8min
completed: 2026-10-20
status: complete
---

# Phase 40 Plan 04: Update channel and single update URL source Summary

**`UPDATE_CHANNEL = 'default'` in generate.mjs now drives `--enable-update-channel=default` and both `powerbrowser-default` MAR ids. A new update-channel quick row checks every channel mention in the tree by kind. The update-URL policy key is gone from policies.json, so `[urls] update` (MOZ_APPUPDATE_HOST) is the only update URL source.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-10-21T00:07:57Z
- **Completed:** 2026-10-21T00:16:19Z
- **Tasks:** 2
- **Files modified:** 14

## Accomplishments

- `scripts/generate.mjs` exports `UPDATE_CHANNEL` and `updateChannel(config)`, which returns `{ channel, marChannelId }`. `emitMozconfig` builds the channel line and both MAR id lines from it. The tracked `.mozconfig` was regenerated and copied over, and generated-byte-identity is green.
- `scripts/verify-update-channel.mjs` does four things:
  - derives the channel and MAR id from the in-memory emit and checks the tracked `.mozconfig`
  - sweeps `git ls-files` minus a reasoned exclusion table and compares each structured mention with the value of its own kind
  - fails when it finds zero mentions outside `.mozconfig`
  - fails when the update-URL policy key is present
- The self-test runs 10 red plants and one green control, all in memory.
- Today's RELEASING.md drift is fixed: two descriptor paths named `release/`, and the hypothetical-switch sentence named an `=`-valued channel option.
- In policies.json the update-URL key is removed. ng064 now requires its absence and compares `new URL().host`. mar-update-hop uses `readManifestUpdateUrl`. The allowlist reasons for aus5 and updates.powerbrowser.org were rewritten, and the stale "unverified" wording is gone. All of this landed in one commit (UPD-12).

### Derived consumer set printed by update-channel

```
.mozconfig:8 channel default
.mozconfig:9 mar powerbrowser-default
.mozconfig:10 mar powerbrowser-default
docs/BUILD.md:877 mar powerbrowser-default
docs/RELEASING.md:203 channel default
docs/RELEASING.md:361 channel default
docs/RELEASING.md:884 mar powerbrowser-default
```

## Task Commits

1. **Task 1: one channel constant through .mozconfig to the update-channel row** - `68b9d51` (feat)
2. **Task 2: UPD-12 policy removal, absence checks, ng064/mar-update-hop repoint, self-test** - `119c6b0` (feat)

## Files Created/Modified

- `scripts/verify-update-channel.mjs`: the update-channel row and its `--self-test` (new)
- `scripts/generate.mjs`: the `UPDATE_CHANNEL` and `updateChannel` exports, the channel line in emitMozconfig, and comment line counts (thirteen lines; literal lines 2, 6, 7 and 10-12)
- `.mozconfig`: the explicit `--enable-update-channel=default` line
- `scripts/verify-platform.sh`: the rows `update-channel` and `update-channel-self-test`, and the mar-update-hop registry comment
- `docs/RELEASING.md`: lines 203 and 361 now name the `default/` descriptor path, and the channel/MAR paragraph was reworded
- `.planning/PROJECT.md`: a Key Decisions row for the update channel
- `powerbrowser/distribution/policies.json`: the update-URL key is removed
- `scripts/verify-ng-064-update-url.mjs`: requires the key's absence, and hosts compare as `new URL().host`
- `scripts/verify-mar-update-hop.mjs`: `readManifestUpdateUrl(root)` uses `resolveConfig`, and the self-test mirror copies `configuration.toml`
- `powerbrowser/endpoint-allowlist.json`: rewritten reasons for aus5.mozilla.org and updates.powerbrowser.org
- `configuration.toml`, `scripts/verify-webextensions.mjs`, `docs/REBRANDING.md` and `docs/BUILD.md`: comment and doc corrections

## Decisions Made

- The channel stays `default` with MAR id `powerbrowser-default`, following the orchestrator resolution. Switching to `release` would cost a tier-3 rebuild and re-proof for no benefit.
- The policy-absence check is part of update-channel rather than a separate row (RESEARCH Pattern 3).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] docs/BUILD.md line 802 still said policies.json carries the update URL**
- **Found during:** Task 2
- **Issue:** After the key was removed, the "where the update URL lives" bullet in BUILD.md stated something false. The file was not in the plan's file list.
- **Fix:** The sentence now says the policy would win when present, so policies.json carries none and the manifest is the only source (UPD-12).
- **Files modified:** docs/BUILD.md
- **Committed in:** 119c6b0

**2. [Scope note] The self-test landed partly in Task 1**
- The channel plants were written with the script in Task 1. The policy plants and the `update-channel-self-test` registry row landed in Task 2, as planned. The final state matches the plan.

**3. [Additive] Self-test plants beyond the behavior list**
- The plan's behavior list has five red plants. The self-test adds five more for the backstop edges:
  - a doc `MAR_CHANNEL_ID=` set to `<app_basename>-release`
  - the MAR id under the channel kind (adjacency)
  - `Default` letter case
  - the emitter naming `release`
  - zero mentions outside `.mozconfig`
- That makes 10 red plants in total.

---

**Total deviations:** 1 auto-fixed (Rule 1), 2 scope notes.
**Impact on plan:** None on scope. All three keep the docs and gates consistent with the change.

## Issues Encountered

None.

## Known Limits

- Two full-tier rows were edited here, but their live proof belongs to plan 40-08 and is not claimed green:
  - `ng064-update-url-from-manifest` needs a built objdir.
  - `mar-update-hop` needs `.mozbuild/mar-hop/` evidence. Run here, it fails only on the missing evidence, which is expected.
- The `--enable-update-channel=default` line causes a reconfigure on the next build. It does not change the build's output, because configure's default is the same value.

## User Setup Required

None.

## Next Phase Readiness

- Ready for 40-05. Plan 40-08's build must re-run ng064 and mar-update-hop against the regenerated `.mozconfig`.

---
*Phase: 40-release-identity-esr-pin-and-patch-regeneration-a*
*Completed: 2026-10-20*

## Self-Check: PASSED
