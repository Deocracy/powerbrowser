---
phase: 46-in-app-update-experience-and-egress-pass-c
plan: 04
subsystem: release-egress
tags: [endpoint-allowlist, fxa-sync-off, doc-consistency, verify-row]

requires:
  - phase: 46-03 (same phase, wave 3)
    provides: evidence rows the final egress sweep keeps green
provides:
  - Endpoint-allowlist release pass (asset rows, crash deny, geolocation correction, stale-text fixes)
  - identity.fxaccounts.enabled=false in both branding variants from the generator
  - update-prefs FxA assertion with true/absent plants
  - Partner-search status record and Phase 50 live-observation pointer
affects: [Phase 50 (live asset-host observation criterion 5, packaged re-run)]

actuals:
  tokens: 12000
  tasks: 3
  commits: 1

tech-stack:
  added: []
  patterns: [same-commit doc-consistency, fixed-false pref from emitter base lines]

key-files:
  created: []
  modified: [powerbrowser/endpoint-allowlist.json, scripts/generate.mjs, powerbrowser/branding/release/pref/firefox-branding.js, powerbrowser/branding/dev/pref/firefox-branding.js, scripts/verify-update-prefs.mjs, scripts/verify-platform.sh, docs/RELEASING.md, inventory/brand-tokens.json]

key-decisions:
  - "release-assets.githubusercontent.com is allow (unattended MAR fetch), not user-initiated; live layer-3 observation stays Phase 50 criterion 5"
  - "crash-reports.mozilla.com is deny (reporter compiled out, owner decision 9), paired with the blanked breakpad.reportURL expect"
  - "FxA kill is a fixed false in FIREFOX_BRANDING_BASE_LINES (no manifest key, owner decision 6), asserted per variant by update-prefs"
  - "No Mozilla host newly dispositioned allow: Inherited egress sections verified byte-unchanged in the same commit"

patterns-established:
  - "Allowlist release pass: asset rows + crash deny + geolocation split + stale-text fixes + partner record in one commit with doc-consistency green"

requirements-completed: [UPD-15, UPD-28]

coverage:
  - id: D1
    description: "Allowlist carries asset rows, crash deny row, corrected geolocation row and corrected stale texts; doc-consistency green with self-test red on plants; partner-code status recorded"
    requirement: "UPD-15"
    verification:
      - kind: other
        ref: "bash scripts/verify-platform.sh --only allowlist-doc-consistency"
        status: pass
      - kind: other
        ref: "node scripts/verify-theia-endpoints.mjs"
        status: pass
    human_judgment: false
  - id: D2
    description: "Generated branding prefs set identity.fxaccounts.enabled=false; no FxA/Sync host contacted in the endpoints run"
    requirement: "UPD-28"
    verification:
      - kind: other
        ref: "node scripts/verify-update-prefs.mjs && node scripts/verify-update-prefs.mjs --self-test"
        status: pass
    human_judgment: true
    rationale: "The contacted-host half needs the full-tier verify-endpoints run with a real capture; the FxA/Sync family is derived from the tree now and the live proof is Phase 50 criterion 5."
  - id: D3
    description: "Egress regression sweep green on the final tree (theia-endpoints, ng064, dispositions, update-prefs, update-channel)"
    requirement: "UPD-15"
    verification:
      - kind: other
        ref: "scripts/verify-platform.sh --only theia-endpoints / update-prefs / update-channel / ng064-update-url-from-manifest"
        status: pass
    human_judgment: false

duration: 15min
completed: 2026-10-26
status: complete
---

# Phase 46 Plan 04: Allowlist release pass and FxA off Summary

**The allowlist carries the release pass and the generator switches Firefox Accounts/Sync off, with every derived egress row green.**

## Performance

- **Duration:** 15 min
- **Started:** 2026-10-26T03:33:00Z
- **Completed:** 2026-10-26T03:48:00Z
- **Tasks:** 3 completed
- **Files modified:** 8

## Accomplishments
- Allowlist: `release-assets.githubusercontent.com` allow (UPD-15, Phase 50 observation ref), `crash-reports.mozilla.com` deny (owner decision 9), geolocation reason split (region blanked vs geo.provider untouched, no pref change), branding region/Push comment scope fix.
- `identity.fxaccounts.enabled=false` in both variants from `FIREFOX_BRANDING_BASE_LINES` (owner decision 6); regenerated tracked files byte-compared; `generate --check` green.
- `verify-update-prefs.mjs`: FXA_PREF joins the owned set, per-variant false assertion (4b), true/absent plants (12-plant self-test PASS).
- `docs/RELEASING.md`: partner-search status note (stock machinery untouched, no custom code, no search-host change; live Suggest observation is Phase 50.5).
- FxA/Sync family derived from the tree (`accounts.firefox.com`, `profile/oauth.accounts.firefox.com`, `token.services.mozilla.com`, `channelserver.services.mozilla.com` from firefox.js:1930-2332); contacted-host proof is set-difference over the capture at Phase 50 (verify-endpoints already fails any unlisted host).
- Inherited egress sections verified unchanged; doc-consistency green in the same commit.
- Egress sweep green: theia-endpoints, update-prefs, update-channel, ng064, dispositions, allowlist-doc-consistency (+ self-tests).

## Task Commits

Each task was committed atomically:

1. **Task 1: allowlist release pass** - `8a083de` (feat)
2. **Task 2: FxA/Sync off** - `8a083de` (feat, same commit: emitter + regenerated files + row)
3. **Task 3: egress regression sweep** - `8a083de` (feat, same commit: no drift found)

**Plan metadata:** `8a083de` (feat: allowlist release pass and FxA off at generator)

## Files Created/Modified
- `powerbrowser/endpoint-allowlist.json` - two new rows + geolocation rewrite.
- `scripts/generate.mjs` - FxA kill line + branding comment fix in BASE_LINES.
- `powerbrowser/branding/{release,dev}/pref/firefox-branding.js` - regenerated (fxaccounts line + comment fix).
- `scripts/verify-update-prefs.mjs` - FXA_PREF owned + 4b assertion + 2 plants.
- `scripts/verify-platform.sh` - no new rows (existing rows cover the pass).
- `docs/RELEASING.md` - partner-search note.
- `inventory/brand-tokens.json` - `pref("` 75 to 77 (two new pref lines, COUNT MOVED).

## Decisions Made
- github.com stays `user-initiated` (click destinations); release-assets is `allow` because the updater fetches MAR bytes unattended (Phase 40 user-initiated pattern does not apply).
- UPD-12 (`endpoint-allowlist.json:22`) and region/Push comment verified vs landed wording; only the stale scope phrase changed, no disposition change.
- ng064/update-channel/theia-endpoints all re-run green; no registry change needed for the sweep (backstop truth, no new code).

## Deviations from Plan
None - plan executed exactly as written.

## Self-Check: PASSED

- `grep -c release-assets` allowlist = `1`; crash-reports = `1`; geo.provider.network.url >= `1`.
- `grep -c partner` RELEASING.md >= `1` (2 with the UPD-15 requirement text).
- `grep -c identity.fxaccounts.enabled` release branding = `1`; dev = `1`; both `false`.
- `node scripts/generate.mjs --check` green (tracked files regenerated through the generator, never hand-edited).
- `update-prefs` + self-test (12 plants) green; doc-consistency + self-test green; theia-endpoints green.
