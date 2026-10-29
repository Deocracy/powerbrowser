---
phase: 31-site-identity-permissions-and-app-menu
plan: 01
subsystem: ui
tags: [site-identity, gecko-bridge, react, theia, chrome-bar]

# Dependency graph
requires:
  - phase: 27-web-tab-host
    provides: [webTabs overlay host, scheduleWebTabState, WebTabChannel push router]
provides:
  - site-identity decode pushed atomically with url (securityState/displaySpec/baseDomain/blockedTrackers)
  - pure site-identity table (SECURITY_STATES, PERMISSION_IDS, STOCK_PAGES, MENU_ORDER)
  - pill identity box rendered from pushed state only, plus panel shell
  - verify-site-identity.mjs static gate plus live harness with identity-lock
affects: [31-02 panel rows, 31-03 clear-data and shield, 31-04 hamburger menu]

# Actuals — pairs with the plan's `estimate` to calibrate future estimates.
actuals:
  tokens: 92000
  tasks: 3
  commits: 13
  plan_head_before: 3e8d991
  plan_head_after: a9aeb1b

# Tech tracking
tech-stack:
  added: []
  patterns: [derived-set-equality gate, skip-until-landed live scenarios, push-only pill identity]

key-files:
  created:
    - theia/extensions/chrome-bar/src/browser/site-identity/site-identity-table.ts
    - scripts/verify-site-identity.mjs
    - scripts/verify-site-identity-live.mjs
  modified:
    - powerbrowser/shell/PowerBrowserAPI.sys.mjs
    - powerbrowser/INTERNAL-APIS.md
    - theia/extensions/tab-uris/src/browser/web-tab.ts
    - theia/extensions/chrome-bar/src/browser/address-bar/address-bar.tsx
    - theia/extensions/chrome-bar/src/browser/chrome-bar-copy.ts
    - theia/extensions/chrome-bar/src/browser/chrome-bar.css
    - scripts/verify-shell-error-copy.mjs
    - scripts/verify-web-tab-bridge.mjs
    - scripts/verify-platform.sh
    - inventory/brand-tokens.json

key-decisions:
  - "Decode chrome-side with the browser-siteIdentity.js recipe; push the enum, never the bitfield (D-31-01/D-31-04)"
  - "Local-origin trust reads securityUI.isSecureContext with the principal's isOriginPotentiallyTrustworthy as fallback (HIGH-1 loopback fix)"
  - "Identity box reads pushed state only; the lockFromTypedText seam is deleted and both plants re-insert the original render-line derivation (HIGH-3/MEDIUM-5)"
  - "webTabSiteInfo is tab-navigation under the privileged-kind rule: tabId only, principal from the overlay (D-31-05)"
  - "Later plans' live scenarios run as SKIP *-not-landed, never pass, until plans 02-04 land them"

patterns-established:
  - "Static gate derives decode arms, mask flags, upstream IDs and copy pins from the tree and compares as set equality"
  - "Panel shell lives in the .pb-chrome-bar-dropdown portal family; no new BLOCKING_LAYER_SELECTOR entry"

requirements-completed: [SITE-01, SITE-02, SITE-03]

coverage:
  - id: D1
    description: "Widened push carries the site identity decode with url"
    requirement: "SITE-01"
    verification:
      - kind: unit
        ref: "node scripts/verify-site-identity.mjs"
        status: pass
  - id: D2
    description: "Pill identity box renders pushed state; typing cannot spoof it"
    requirement: "SITE-02"
    verification:
      - kind: e2e
        ref: "node scripts/verify-site-identity-live.mjs --scenario identity-tls,identity-local"
        status: unknown
  - id: D3
    description: "Host display with registrable-domain highlight and panel shell"
    requirement: "SITE-03"
    verification:
      - kind: unit
        ref: "theia/node_modules/.bin/tsc --noEmit -p theia/extensions/chrome-bar"
        status: pass

---

# 31-01 Summary — site identity tracer

## Accomplishments

- Chrome computes `securityState`/`displaySpec`/`baseDomain`/`blockedTrackers`
  in the same push as `url` (reset on location change); the overlay mask
  carries `NOTIFY_SECURITY` and `NOTIFY_CONTENT_BLOCKING`.
- Pure `site-identity-table.ts` lands with `SECURITY_STATES`, `PERMISSION_IDS`
  (the six upstream IDs), `STOCK_PAGES` and `MENU_ORDER`.
- The pill identity box renders pushed state only; the typed-text seam is
  deleted -- both plants re-insert the original
  `this.inputValue.trim().startsWith('https://')` render-line derivation
  and go red naming it.
- `webTabSiteInfo` read path (principal-keyed) plus the panel shell with
  state-specific `aria-label`, base-domain caption and connection text
  (local renders properly, no fallback), Esc and outside-click close.
- `verify-site-identity.mjs` (10 cases, 10 plants, all red-naming) plus
  `verify-site-identity-live.mjs` (TLS `identity-tls` + `identity-local`
  sessions, two-session 4-tab split, `typed-lock` plant);
  `site-identity` / `site-identity-self-test` registry rows.

## Commits

Plan 31-01 commits, oldest first. The count is measured with
`git rev-list --count --grep=31-01 3e8d991..a9aeb1b`; the range also holds
other phases' commits, so the grep restricts it to this plan. The docs
commit that carries this file is not counted here.

- `2fda8d5` feat(31-01): widen web-tab push with site identity decode
- `ee57320` feat(31-01): pill identity box plus site panel shell
- `024ce71` test(31-01): site-identity static gate plus live harness
- `f4da947` docs(31-01): live handoff plus plan summary
- `b79dd84` test(31-01): live harness fixes found running the site-identity checks (Claude harness commit)
- `f07eb4b` test(31-01): test-only TLS fixture (CA certificate, pb-fixture.test leaf) for the site-identity live checks
- `f54869a` fix(31-01): loopback trust via isSecureContext, JSON shield count, https trim, panel copy
- `00ab49f` test(31-01): TLS live sessions, derived gates, handoff and summary
- `33049dc` docs(31-01): correct plant counts and brand scan file count
- `0f27a5c` test(31-01): typed-lock plant follows typed text; IDN pill and warning colour asserted (Claude harness commit)
- `0e65416` fix(31-01): trim https in the unfocused pill, displaySpec host, blocked-only shield count, panel copy (fix round 3)
- `417d15e` test(31-01): static gate derives the managed IDs, pins shield and copy; live pill flip; plain identifiers (fix round 3)
- `a9aeb1b` test(31-01): drop a plan-file citation that moved the brand-residue count (fix round 3)

## Fix round 3

Live check failed on the pill and the shield count. The round's ten items:

1. Unfocused secure pill trims `https://`; focus restores the full URL.
   `address-bar.tsx` `pillText`, `onInputFocus`, `onInputBlur`. Harness flipped
   in `verify-site-identity-live.mjs`; the never-failing host check is gone.
2. `identityHostText` reads `displaySpec` again and strips a `:port`.
   `address-bar.tsx` `identityHostText`.
3. Shield count counts blocked origins only, with the six `STATE_BLOCKED_*`
   terms; the reset runs only on a top-level, non-same-document change.
   `PowerBrowserAPI.sys.mjs` `webTabBlockedTrackerCount` and the progress
   listener's `onLocationChange`. Static case plus two plants.
4. `startsWith('https://')` appears nowhere in `address-bar.tsx`, comments
   included; the two comments were reworded.
5. The hand-kept PINNED list is gone. The managed set is taken from the
   UI-SPEC sentence that names it, and each ID is checked against upstream's
   `_permissions` keys (see Deviations).
6. The identifier splits in `scripts/lib/pb-live-probe.mjs` are reverted to
   `Cc`, `Ci`, `Components`, `addCertFromBase64`.
7. The unused `trustFixtureCA` import is removed.
8. Identity box `aria-label` is `sitePanelOpen(host)`; panel header reads
   `Connection secure` / `Connection not secure`, with the base domain as a
   12px caption. Static copy case pins both.
9. Font-family plant added beside the hex plant.
10. This file: `plan_head_before` is `3e8d991`, and every 31-01 commit is listed.

## Static results

- `node scripts/verify-site-identity.mjs`: PASS (13 cases)
- `node scripts/verify-site-identity.mjs --self-test`: PASS (17 plants)
- `node scripts/verify-web-tab-bridge.mjs` + `--self-test`: PASS (13 kinds, 21 plants)
- `node scripts/verify-shell-error-copy.mjs`: PASS
- `tsc --noEmit` chrome-bar + tab-uris: green
- `check-internals-boundary.sh` plain + `--catalogue`: PASS
- `verify-ng-040-internals-catalogue-lines.mjs`: PASS
- `node scripts/scan-brand-residue.mjs`: PASS (392 files; inventory
  `-PLAN.md` count reconciled 49 → 59 for the ten new catalogue rows)
- `scripts/verify-platform.sh --only site-identity`: PASS
- `scripts/verify-platform.sh --only site-identity-self-test`: PASS

## --quick result

`scripts/verify-platform.sh --quick` after fix round 3: PASS, all rows
(`verify-platform: PASS -- all checks passed`). The brand-residue scan
(`node scripts/scan-brand-residue.mjs`) is PASS over 392 files.

## Deviations

- `inventory/brand-tokens.json` (not plan-named): reconciled the frozen
  `-PLAN.md` count 49 → 59. Required — the ten new INTERNAL-APIS.md
  provenance citations would otherwise fail the permanent brand gate.
- `site-panel.tsx` (plan-named) was not created: the panel shell lives in
  `address-bar.tsx`'s `.pb-chrome-bar-dropdown` portal family (same
  family as every other pill dropdown), so no new blocking-layer entry
  and no new file. Recorded here as the deviation, not a silent rename.
- Live scenarios split across two sessions (`identity-tls`,
  `identity-local`) for the harness's 4-tab limit; the TLS twin serves
  beside `serveNavPages` (`node:https` with the committed
  `scripts/fixtures/tls/` leaf) with the fixture hosts in
  `network.dns.localDomains` and the CA trusted in the probe profile only.
- Fix round 3, item 5: the managed permission set cannot be derived from
  upstream `gPermissions` alone. Upstream's enabled set depends on
  preferences and holds about twenty IDs. The gate takes the six managed IDs
  from the UI-SPEC sentence that names them, and checks each against the
  `_permissions` keys parsed at check time.
- Fix round 3, item 8: the panel header is 48px (was 32px), and the base
  domain is a separate caption line. `siteConnectionSecure` and
  `siteConnectionInsecure` are fixed strings now, so `verify-shell-error-copy.mjs`
  pins `Connection not secure` in place of the two retired host-bearing lines.
- Fix round 3: the `--fix` mode of `verify-ng-040-internals-catalogue-lines.mjs`
  moved three rows to the wrong lines. The catalogue was restored from HEAD
  and every row remapped by a line diff of `PowerBrowserAPI.sys.mjs`; six
  rows were added for the `STATE_BLOCKED_*` terms.
- Fix round 3: the `-PLAN.md` brand-residue count (59 held) moved once when
  a comment named the plan file. The citation was removed, not reconciled.

## Blockers

- None for static work. Live rows pending (Claude): Theia build +
  `identity-tls` + `identity-local` scenarios + live `--self-test`
  per 31-01-LIVE-HANDOFF.md (two sessions, 4-tab limit).

## Handoff

`.planning/phases/31-site-identity-permissions-and-app-menu/31-01-LIVE-HANDOFF.md`
