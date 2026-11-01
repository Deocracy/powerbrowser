---
phase: 40-release-identity-esr-pin-and-patch-regeneration-a
plan: 05
subsystem: infra
tags: [endpoint-allowlist, user-initiated, about-dialog, release-notes, verify-endpoints, generate]
status: complete

requires:
  - phase: 40-04
    provides: "update-channel quick rows (the new row appends after them); [urls] update as the only update URL source"
provides:
  - "scripts/lib/endpoint-verdict.mjs: DISPOSITIONS, entryFor, violations -- the one host-matching and verdict rule"
  - "verify-endpoints.sh extract_resolved_hosts and --disposition-self-test; layer 3 decides through violations(..., { userAction: false })"
  - "quick row endpoint-dispositions-self-test; allowlist-schema derives its accepted set from DISPOSITIONS"
  - "exported releaseLinkPrefs(config) and RELEASE_LINK_ANCHOR in scripts/generate.mjs"
  - "configuration.toml [urls] release_notes and homepage; About-dialog link prefs in both branding pref files"
  - "powerbrowser.org and github.com as user-initiated allowlist entries"
affects: [40-08, endpoint layer 3 live run, About dialog click check]

actuals:
  tokens: 10038
  tasks: 2
  commits: 2
plan_head_before: be906494dc0858fd6f934b9effcc3bac22011b11
plan_head_after: abdb3f2138305446b2f2bad96c7b8c195802b42d

tech-stack:
  added: []
  patterns:
    - "One pure verdict module imported by file URL from both the bash layer and the schema check"
    - "A self-test runs the production extraction pipeline over fixture logs and plants every real user-initiated host"

key-files:
  created:
    - scripts/lib/endpoint-verdict.mjs
  modified:
    - scripts/verify-endpoints.sh
    - scripts/verify-platform.sh
    - powerbrowser/endpoint-allowlist.json
    - scripts/generate.mjs
    - configuration.toml
    - powerbrowser/branding/dev/pref/firefox-branding.js
    - powerbrowser/branding/release/pref/firefox-branding.js
    - docs/REBRANDING.md
    - inventory/brand-tokens.json
    - scripts/verify-theia-endpoints.mjs

key-decisions:
  - "Third allowlist disposition user-initiated: reachable only after a user action; an unattended request fails exactly like deny (UPD-33)"
  - "About-dialog link prefs derive from [urls] release_notes and homepage through releaseLinkPrefs, kept out of mozillaEndpointPrefs because they are click destinations, not unattended callouts (UPD-13)"

patterns-established:
  - "Click-destination hosts are user-initiated allowlist rows; network.dns.disablePrefetch=true keeps them off the unattended path"

requirements-completed: [UPD-33, UPD-13]

duration: 25min
completed: 2026-10-21
---

# Phase 40 Plan 05: user-initiated disposition and About-dialog links Summary

**A third allowlist disposition, `user-initiated`, decided by one shared verdict module that layer 3 calls unattended, plus About-dialog release-notes and manual-update prefs derived from `[urls]` with powerbrowser.org and github.com re-dispositioned to match.**

## Performance

- Duration: about 25 min
- Completed: 2026-10-21
- Tasks: 2 of 2
- Files: 1 created, 10 modified

## Accomplishments

- `scripts/lib/endpoint-verdict.mjs` holds the one matching rule (exact host, or a leading-dot suffix) and the verdict. `violations()` fails a host that has no entry, a `deny` entry, or a `user-initiated` entry with no user action.
- In `verify-endpoints.sh`, layer 3's `Resolving host [...]` pipeline is now `extract_resolved_hosts`. The per-host `node` loop is replaced by one verdict call with `userAction: false`. The FAIL header says "unlisted, denied or user-initiated host(s) resolved without a user action".
- `--disposition-self-test` runs that pipeline over fixture logs. It covers six fixture cases: unattended user-initiated goes red naming the host, user-initiated after a click is green, deny is red in both modes, allow unattended is green, unlisted is red. It then plants every real user-initiated host unattended and requires each to go red. After Task 2 it reports 2 hosts, powerbrowser.org and github.com.
- A mutation of the verdict (ignoring `userAction`) was observed turning the self-test red.
- `allowlist-schema` imports `DISPOSITIONS` and lists the accepted set in its malformed-entry message.
- `releaseLinkPrefs(config)` sets four prefs, spliced after `RELEASE_LINK_ANCHOR` and guarded by `report()` if the anchor is missing:
  - `app.releaseNotesURL`, `app.releaseNotesURL.aboutDialog` and `app.update.url.details` come from `urls.release_notes`
  - `app.update.url.manual` comes from `urls.homepage`
  - Fallbacks when unset: `about:blank` for the two release-notes prefs, `""` for the other two.
- Both tracked branding files were regenerated and copied from `generated/`, so `app.update.url.manual` is no longer the empty string.
- `startup.homepage_override_url` stays blank.

## Task Commits

1. **Task 1: shared verdict module, schema, layer-3 rewiring, fixture self-test row** -- `cfce3f3` (feat)
2. **Task 2: About-dialog link prefs from [urls], regenerated branding, user-initiated re-dispositions** -- `abdb3f2` (feat)

## verify-theia-endpoints treatment (recorded in the Task 2 commit body)

Check 2 requires each manifest-derived host to be present in the allowlist under any disposition:
- `urls.homepage` → powerbrowser.org
- `urls.release_notes` → github.com

Both hosts are `user-initiated`. Check 3 validates the github.com `manifest` mark against the current `urls.release_notes` host. The generator reads no disposition. `allowlist-doc-consistency` filters `allow`-dispositioned Mozilla hosts only, so it needs no change.

## Assumption-delta judgment

The detector fired on "fallback" in "the About dialog's release-notes and fallback links". That is not a singular-to-plural identity change. The fallback link is the existing manual-update link (`app.update.url.manual`, shown when an update check fails), not a second instance of any identity the model keys on. No promote-versus-add-alongside question arises. The one real cardinality change in this phase went the other way: plan 40-04 reduced two update URL sources to one.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] scan-brand-residue held-back `pref("` count**
- Found during: Task 2 `--quick`
- Issue: the frozen row in `inventory/brand-tokens.json` expected 69 occurrences. Each variant gained two pref lines, so the scan observed 73.
- Fix: count moved 69 -> 73, with a COUNT MOVED reason naming the four upstream keys.
- Files modified: `inventory/brand-tokens.json`
- Commit: `abdb3f2`

**2. [Rule 1 - Bug] generate --self-test endpoint-host fixtures**
- Found during: Task 2 `--quick`
- Issue: the fixtures merge onto the shipped manifest. The two new `[urls]` keys therefore added github.com and powerbrowser.org to the hosts each fixture derives, so both literal host lists went red.
- Fix:
  - The first fixture now states its own `release_notes` and `homepage`, so it still exercises stated hosts.
  - The second fixture's expectation includes the inherited github.com, which is the real downstream outcome and is named by the D-08 echo.
  - Added a `releaseLinkPrefs` case covering the unset fallbacks and the stated mapping.
- Files modified: `scripts/generate.mjs`
- Commit: `abdb3f2`

**3. [Rule 1 - Stale doc] verify-theia-endpoints.mjs header comment**
- Issue: the comment said the shipped support host is `deny` and that the allowlist carries no marked entries. Both became false in this plan.
- Fix: comment-only correction.
- Files modified: `scripts/verify-theia-endpoints.mjs`
- Commit: `abdb3f2`

## Issues Encountered

At session start the LEDGER hook reported that `scripts/verify-ng-064-update-url.mjs` differs from its locked checksum. That file was changed by plan 40-04, not by this plan, and is left for the orchestrator.

## Verification

- `bash -n scripts/verify-endpoints.sh`: clean.
- `--only endpoint-dispositions-self-test`, `allowlist-schema`, `theia-endpoints`, `generated-byte-identity`: PASS.
- `node scripts/generate.mjs` ran twice, then `--check` PASS. Both tracked branding files are byte-identical to `generated/`.
- `generated/endpoint-hosts.json` lists exactly github.com, powerbrowser.org and updates.powerbrowser.org.
- `scripts/verify-platform.sh --quick`: PASS.
- Not run here, by plan: the live layer-3 run against a built objdir and the About-dialog click check. Both belong to 40-08.

## Next Phase Readiness

Plan 40-08 can run layer 3 live. An unattended resolution of powerbrowser.org or github.com now fails it.

## Self-Check: PASSED

- FOUND: scripts/lib/endpoint-verdict.mjs
- FOUND: scripts/verify-endpoints.sh
- FOUND: cfce3f3
- FOUND: abdb3f2
