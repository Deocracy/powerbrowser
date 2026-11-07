---
phase: 31-site-identity-permissions-and-app-menu
plan: 02
subsystem: ui
tags: [site-identity, permissions, gecko-bridge, react, theia, chrome-bar]

# Dependency graph
requires:
  - phase: 31-site-identity-permissions-and-app-menu
    plan: 01
    provides: [webTabSiteInfo read path, site-identity-table.ts, identity box, verify-site-identity gates]
provides:
  - webTabSetPermission kind (principal-keyed, origin-echo checked, browser-scoped revoke)
  - site panel in site-identity/site-panel.tsx with six tri-state permission rows and the certificate block
  - permission icons in the identity box, pushed with url and refreshed on each permission reply
  - static gate cases 12-14 and four new plants; live site-panel scenario with two plants

# Actuals — pairs with the plan's `estimate` to calibrate future estimates.
actuals:
  tokens: 22000    # chars/4 over the added lines of the 7 code commits (git diff 60bc121..HEAD)
  tasks: 3
  commits: 9       # MEASURED: git rev-list --count --grep=31-02 60bc121..HEAD over the code commits (the docs commits carrying this file are not counted, as in 31-01)
  plan_head_before: 60bc1216298ffbf61e7a21d244c40cb7821b6059
  plan_head_after: 7a964f4

# Tech tracking
tech-stack:
  added: []
  patterns: [origin-echo compare on privileged writes, browser-scoped revoke, pure cycle table with derived gate, live race step (navigate after read)]

key-files:
  created:
    - theia/extensions/chrome-bar/src/browser/site-identity/site-panel.tsx
  modified:
    - powerbrowser/shell/PowerBrowserAPI.sys.mjs
    - powerbrowser/INTERNAL-APIS.md
    - theia/extensions/tab-uris/src/browser/web-tab.ts
    - theia/extensions/chrome-bar/src/browser/site-identity/site-identity-table.ts
    - theia/extensions/chrome-bar/src/browser/address-bar/address-bar.tsx
    - theia/extensions/chrome-bar/src/browser/chrome-bar-copy.ts
    - theia/extensions/chrome-bar/src/browser/chrome-bar.css
    - scripts/verify-web-tab-bridge.mjs
    - scripts/verify-shell-error-copy.mjs
    - scripts/verify-site-identity.mjs
    - scripts/verify-site-identity-live.mjs
    - scripts/verify-platform.sh

key-decisions:
  - "A permission write lands only when the tab still shows the origin the panel displayed and the principal is http/https content (review fix, ffe1599 → 6501cc3)"
  - "Every write passes the overlay browser to removeFromPrincipal, clearing tab-scoped temporary state for that id (SitePermissions.sys.mjs:631-644; browser-sitePermissionPanel.js:949-957)"
  - "The first privileged webTab kind is admitted in verify-web-tab-bridge.mjs only under call-site rules (chrome-bar event-handler tree only; no command or keybinding file names it)"
  - "Permission row labels come from SitePermissions.getPermissionLabel through the reply; no hand-kept label table on either side"
  - "Panel focus: opening focuses the panel; focus moving from the pill into the panel does not close it, focus leaving the panel does"

patterns-established:
  - "Privileged webTab kinds: frontend method derived from the kind name, call-site and command-file checks in the bridge gate"
  - "Derive-and-compare for the write arm: its state literals equal the table cycles; its autoplay constants equal the upstream states array"

requirements-completed: [SITE-04, SITE-05, SITE-06]

coverage:
  - id: D1
    description: "Clicking the lock opens a panel with connection details and the certificate (issuer/subject/validity, read-only)"
    requirement: "SITE-04"
    verification:
      - kind: e2e
        ref: "node scripts/verify-site-identity-live.mjs --scenario site-panel"
        status: pass
  - id: D2
    description: "Camera, microphone, geo, desktop-notification, autoplay-media and popup set per site via tri-state rows; writes keyed by the overlay's principal"
    requirement: "SITE-05"
    verification:
      - kind: e2e
        ref: "node scripts/verify-site-identity-live.mjs --scenario site-panel (camera round trip, reopen persistence and the autoplay-media cycle pass)"
        status: pass
      - kind: unit
        ref: "node scripts/verify-site-identity.mjs"
        status: pass
  - id: D3
    description: "A site with non-default permissions shows its icons in the identity box"
    requirement: "SITE-06"
    verification:
      - kind: e2e
        ref: "node scripts/verify-site-identity-live.mjs --scenario site-panel (3 icons + +1 and back to none pass)"
        status: pass
  - id: D4
    description: "Permission labels come from SitePermissions.getPermissionLabel; no hand-kept label list"
    requirement: "SITE-05"
    verification:
      - kind: unit
        ref: "node scripts/verify-site-identity.mjs (case 13, plant hand-labels)"
        status: pass

---

# 31-02 Summary — site panel, permission writes, identity-box icons

## Accomplishments

- `webTabSetPermission {tabId, id, state, origin}` (`PowerBrowserAPI.sys.mjs:4633`)
  writes one of the six upstream permission IDs on the overlay's own
  `contentPrincipal`, through `SitePermissions.setForPrincipal` (persistent) or
  `removeFromPrincipal` (default). The arm refuses unless the tab still shows the
  origin the panel displayed and the principal is http/https content
  (`:4646`). Its reply carries the refreshed rows.
- `webTabSiteInfo` returns six rows in table order, each with the state
  (`allow`, `block`, `block-audible`, `block-all`, `default`) and the upstream label
  (`webTabPermissionRows`, `:4512`). The origin it displayed is returned as `origin`
  (`:3705`).
- The site panel moved out of `address-bar.tsx` into
  `site-identity/site-panel.tsx` (`SitePanel`, `:48`). It has the connection
  header, the certificate block (secure pages only: issued to, issued by,
  validity), and one `<button>` per permission whose click sends the next state
  of its cycle (`nextPermissionState`, `site-identity-table.ts:90`).
- The identity box shows up to three permission icons, then `+n`, and a tooltip
  of the labels (`renderPermissionIcons`, `address-bar.tsx:368`). The icons come
  from the same atomic state push as `url` (`PowerBrowserAPI.sys.mjs:3481`) and
  are refreshed by each permission reply (`web-tab.ts:765`).
- Static gate: `verify-site-identity.mjs` has 17 cases (new: 12 write-arm states
  equal the table cycles; 13 autoplay constants equal the upstream states array,
  no hand-kept label map, glyph map keyed by `PERMISSION_IDS`; 14 the only
  sender-origin use is the echo compare) and 21 planted faults, all red.
- Bridge gate: `verify-web-tab-bridge.mjs` classifies `webTabSetPermission` as
  privileged and admits that class only under call-site rules (25 planted faults).
- Live: `verify-site-identity-live.mjs` gains the `site-panel` scenario and the
  `perm-refused` and `icons-stale` plants.

## Commits

Plan 31-02 commits, oldest first. The count is measured with
`git rev-list --count --grep=31-02 60bc121..7a964f4` (9 code commits); the docs
commits that carry this file are not counted here.

- `ffe1599` feat(31-02): webTabSetPermission kind and the six permission rows in webTabSiteInfo
- `6501cc3` fix(31-02): permission writes land only on the origin the panel showed; revoke clears tab temporaries (review fix)
- `d267577` feat(31-02): site panel in site-panel.tsx with permission rows and certificate block
- `0c845b3` feat(31-02): permission icons in the identity box, tracking pushes and replies
- `4464134` test(31-02): permission gate cases and the site-panel live scenario with plants
- `56f2548` fix(31-02): live site-panel reopens wait for rows; typed-lock plant matches the identity shape
- `fc09872` docs(31-02): catalogue rows name the plan task without the plan filename
- `150a0e2` fix(31-02): permission rows show the effective state; cycle and icons key on the saved state (orchestrator decision on the autoplay blocker)
- `7a964f4` test(31-02): effective-versus-stored static case; autoplay live steps read the pref default in chrome
- `0dfb3da` docs(31-02): live handoff and plan summary (the first version)
- the docs commit that carries this revision (not counted above)

## Review fix (orchestrator security review of ffe1599)

Both findings were fixed in `6501cc3`:

1. **Wrong-target write (TOCTOU).** The write keyed on the tab's principal at
   write time. The panel now echoes the origin it displayed; chrome compares it
   with `entry.browser.contentPrincipal.origin` and refuses on mismatch (log:
   kind and reason only, no URL). Non-content and non-http(s) principals are
   refused too. Upstream references: `nsIPrincipal.isContentPrincipal` and
   `origin` (`upstream/caps/nsIPrincipal.idl:607`, `:276`). The static gate pins
   the echo compare as the one permitted sender-origin use, and the
   `origin-compare` plant (drop the compare) goes red. The live origin-race step
   covers it (see Live results).
2. **Incomplete revocation.** `removeFromPrincipal(principal, id)` left the
   tab-scoped temporary state. Every write now passes the overlay `browser`
   (`SitePermissions.sys.mjs:631-644`, `removeFromPrincipalForBrowser`), matching
   upstream's panel revoke (`browser-sitePermissionPanel.js:949-957`). A
   persistent value is then set on the same principal. The orchestrator asked
   for a temporary-state clear on a persistent write. This is the same effect
   through the one upstream call that clears temporaries. Upstream's own menulist
   write (`browser-sitePermissionPanel.js:785`) passes no browser and leaves
   temporaries in place; the revoke path is the one mirrored here.

## Static results

- `node scripts/verify-site-identity.mjs`: PASS (18 cases)
- `node scripts/verify-site-identity.mjs --self-test`: PASS (22 planted faults)
- `node scripts/verify-web-tab-bridge.mjs` + `--self-test`: PASS (14 webTab kinds; 25 planted faults)
- `node scripts/verify-ng-040-internals-catalogue-lines.mjs`: PASS
- `scripts/check-internals-boundary.sh` plain + `--catalogue`: PASS
- `node scripts/verify-shell-error-copy.mjs`: PASS (new panel copy pinned in `EXPECTED_NAV_COPY`)
- `tsc --noEmit` tab-uris and chrome-bar: green (after `tsc -b theia/extensions/tab-uris`)
- `node scripts/scan-brand-residue.mjs`: PASS (393 files; the `-PLAN.md` held count stays at 59)
- `scripts/verify-platform.sh --quick`: PASS (all checks passed)

## Live results

Theia built with `yarn build` (exit 0) after `150a0e2`; the sequence and PASS
definitions are in `31-02-LIVE-HANDOFF.md`.

- `identity-tls: PASS` (earlier run, after 0c845b3; not re-run after 150a0e2)
- `identity-local: PASS` (same)
- `site-panel: PASS` (after 150a0e2). Passing steps, in order: `Connection secure`
  and the certificate block (`Issued to:`, `Issued by:`); six rows in table order;
  camera `Allowed` → `Blocked` → `Use default` with reopen persistence; the eye icon
  after the camera reply; the autoplay-media cycle at the pref default (`Block sounds`
  with no saved entry), then `Allowed` (icon), `Block sounds` (no saved entry, no
  icon), `Block all` (icon), `Block sounds` (no icon); the origin race (camera write
  refused after the tab moved; on the new origin camera is `default`,
  `Connection not secure`, no certificate block); four non-default → three icons
  and `+1`; reset → no icons.
- `--self-test: PASS -- the clean control is green and all 3 planted faults went red: typed-lock, perm-refused, icons-stale`.
  The three clean controls (`identity-local`, `identity-tls`, `site-panel`) are
  green. The plants: `typed-lock` red on `identity-tls` (`lock derived from typed text`),
  `perm-refused` red on `site-panel` (`can't show site information`), `icons-stale`
  red on `site-panel` (`icons did not update`).

## Deviations

- **Autoplay effective-state read (Firefox parity); block-audible equals the shipped default so it is not stored.**
  Decided by the orchestrator (option 1 of the blocker). Rows read the effective
  state with `SitePermissions.getForPrincipal` (fallback `getDefault`,
  `upstream/browser/modules/SitePermissions.sys.mjs:461-462`), as upstream's
  panel does (`upstream/browser/base/content/browser-sitePermissionPanel.js:755-780`).
  Writes are unchanged: a default-equal write is a removal
  (`SitePermissions.sys.mjs:575-580`). The cycle and the identity-box icons key on
  the saved state (`stored`). The pref default is read in chrome at check time and mapped through
  `upstream/dom/media/autoplay/nsIAutoplay.idl:13-15`, never assumed.

- **`site-panel.tsx` now exists** (the 31-01 deviation is resolved as the plan
  directs): the panel moved out of `address-bar.tsx`. The identity click still
  lives in `address-bar.tsx`.
- **Bridge gate changed on purpose.** The gate refused any privileged webTab kind
  ("without a deliberate change to this gate"). The change admits the class under
  call-site checks (`checkWebTabPrivileged`, `verify-web-tab-bridge.mjs:451`) with
  three plants.
- **Sender-origin static case narrowed** to the one echo compare (review fix). The
  old case forbade every `data.origin`; the compare is the fix itself.
- **Labels are chrome's, not a table.** The plan's `PERMISSION_DISPLAY` table is not
  built: the static gate forbids a label map in `site-identity/`, and the plan's
  must-have says labels come from `getPermissionLabel`. A row whose label chrome
  returns as null shows `CHROME_BAR_COPY.permissionLabelFallback` ("Site permission").
- **Load-failure text.** The plan's `perm-refused` plant expects `Site information is not available`. The
  implemented copy (`siteUnavailable`, pinned by 31-01 in `verify-shell-error-copy.mjs`)
  reads `PowerBrowser can't show site information for this page. Try reloading the page.`
  The plant expects the implemented copy. UI-SPEC's wording differs and was not changed.
- **Empty-row rule.** The six rows always show. The empty row
  (`noPermissions`) appears above them only while all six are default. UI-SPEC's
  "empty" row and the plan's "rows always" are both kept this way.
- **Tooltip labels are a parallel array.** The plan's push field is `permissionIcons`
  (ids). The tooltip needs chrome's labels, so `permissionLabels` is pushed in
  the same atomic object, in the same order.
- **Catalogue rows were remapped by a line diff against HEAD**, not with `--fix`, as the
  orchestrator's note asks. The `SitePermissions` lazy-getter row text changed in
  place; three new rows were appended; the `removeFromPrincipal` row was re-cited
  to its new line by hand after the review fix.
- **Commit trailer.** The plan's standing rule says `Claude Opus 5.5`; the commits
  carry `Claude Haiku 5.5` per the instruction in force for this run.
- **Live scenario names.** The plan's `identity-lock` does not exist (31-01 landed
  `identity-tls` and `identity-local`). The runs use the real names. `site-panel`
  runs in its own TLS session (its tabs would exceed the 4-tab limit with
  `identity-tls`).
- **The plan's `verify-platform.sh` live rows** `site-identity-live` and
  `site-identity-live-self-test` are added in the full-run section.

## Blockers

None open. The autoplay-media blocker from the first run is resolved by the
effective-state read above (orchestrator decision; see Deviations).

## Not done

- Pixel check on KDE Wayland against UI-SPEC (manual; not run).
- The plan's `identity-lock,site-panel` verify line (scenario name does not exist).

## Deferred human verification

- None requested by this plan (no checkpoint task). The visual check in the UI-SPEC
  validation section (panel geometry, punycode against Firefox chrome) was not performed.

## Handoff

`.planning/phases/31-site-identity-permissions-and-app-menu/31-02-LIVE-HANDOFF.md`
