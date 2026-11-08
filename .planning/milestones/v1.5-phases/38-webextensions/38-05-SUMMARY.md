---
phase: 38-webextensions
plan: "05"
subsystem: extensions-install
tags: [webextensions, amo, endpoint-allowlist, install-prompt, ext-10-fixtures, live-harness, phase-close]
status: complete
live_proof: deferred
requires:
  - phase: 38-webextensions plans 01-04
    provides: the extensionAction push, the puzzle menu and its empty-state install footer (38-02 stub), the native popup panel, the extension tab pages in the stock window, the live harness pattern (static audit, PLANTS, stamp check)
  - phase: 37-permission-prompts-and-dialogs
    provides: the deferral that sends add-on install prompts to the stock window (37-CONTEXT deferred list)
  - phase: 29-address-bar-search-and-fixup
    provides: the store kind classes (network = sends the user off the machine) and the deliberate-egress allowlist voice (29-03)
provides:
  - allow rows for addons.mozilla.org, versioncheck.addons.mozilla.org and versioncheck-bg.addons.mozilla.org, named in ROADMAP.md (Phase 38) and REQUIREMENTS.md (egress footer)
  - allowlist-doc-consistency over mozilla.org hosts as well as mozilla.com/.net
  - verify-webextensions leg 4 (add-ons hosts derived from upstream's install and update prefs, set equality with the allow rows)
  - the extensionInstallSite store kind (network, D-11) behind the puzzle menu's install footer
  - scripts/verify-extension-amo-live.mjs (amo-install, fixtures, 2 live plants, static audit with a Pitfall 7 backstop)
affects:
  - the end-of-milestone live pass (two new scenarios, two plants, network to the add-ons site needed)
tech-stack:
  added: []
  patterns:
    - a network store kind that opens an upstream-pref URL in the stock window through openStockTab, so no host literal reaches Theia
    - an allowlist leg derived from the same upstream pref the code reads, compared as set equality
key-files:
  created:
    - scripts/verify-extension-amo-live.mjs
  modified:
    - powerbrowser/endpoint-allowlist.json
    - .planning/ROADMAP.md
    - .planning/REQUIREMENTS.md
    - powerbrowser/shell/PowerBrowserAPI.sys.mjs
    - powerbrowser/INTERNAL-APIS.md
    - theia/extensions/tab-uris/src/browser/chrome-store-client.ts
    - theia/extensions/chrome-bar/src/browser/extensions/extension-actions-widget.tsx
    - scripts/verify-webextensions.mjs
    - scripts/verify-platform.sh
    - scripts/verify-web-tab-bridge.mjs
    - scripts/verify-extension-actions.mjs
    - .planning/phases/38-webextensions/38-VALIDATION.md
key-decisions:
  - "The install footer opens the add-ons site in the stock browser window, not a web tab. The shell has no add-on install prompt host (Phase 37 sent those prompts to the stock window), and the stock window's own prompt is the only install UI (D-04)."
  - "Exactly three add-ons hosts are allowed: addons.mozilla.org (site and signed XPIs; the probe found no CDN redirect), versioncheck.addons.mozilla.org and versioncheck-bg.addons.mozilla.org (the update checks of an installed AMO add-on). services.addons.mozilla.org stays deny."
  - "allowlist-doc-consistency now selects mozilla.org hosts too; before this, an addons.mozilla.org allow row would not have been checked at all."
  - "The AMO rows carry no `manifest` field: that field names a configuration.toml key and verify-theia-endpoints checks it. The back-pointer is the upstream pref named in each reason, which verify-webextensions derives from."
  - "The EXT-10 password-manager fill is not scored. D-09 forbids a vault account and a vault server, and the manager has no login to fill without one. The scenario proves that the manager's popup opens on the harness-local login page. The fill is an owner decision."
patterns-established:
  - "A live file names third-party extensions by listing slug only; ids, names, versions and XPI URLs are read at check time, and its static audit fails on a quoted add-on id."
requirements-completed: []
duration: "not measured"
completed: "2026-11-01"
commits: 3
plan_head_before: 13ef7eaf1737d50da8fb9c01dc95cd3bfd3fa4dd
plan_head_after: b2e272aa1bbee4e418f183160a61ae3e8d921d21
actuals:
  tokens: 13000
  tasks: 3
  commits: 3
---

# Phase 38 Plan 05: AMO install over the stock prompt, the EXT-10 fixtures and the phase close Summary

**Three add-ons site hosts are allowlisted and documented in the same commit, and a derived gate keeps them tied to upstream's install and update prefs. The puzzle menu's install footer is now the real install trigger: a `network` store kind that opens the add-ons site in the stock browser window, whose stock install prompt is the only install UI. The new live file proves the prompt path (`amo-install`) and the three D-07 extensions' page-side effects in web tabs (`fixtures`). Every static gate and self-test is green. The live runs are written and deferred, and the password-manager fill needs an owner decision.**

## Status

Every static criterion is met. `nix develop .#theia --command scripts/verify-platform.sh --quick` exited 0 before the Task 1 and Task 2 commits and on the final HEAD. `cd theia && nix develop ..#theia --command yarn build` passed after Task 1, the only task that changed `theia/`. **The live proof is deferred** to the end-of-milestone live pass, because there is no objdir. This plan changed no patch, no `jar.mn` and no chrome file list, so it adds no Gecko rebuild of its own. EXT-09 and EXT-10 are not marked complete: their live truths are unproven, and EXT-10's fill is unscored.

## Accomplishments

- **Probe and allow rows (Task 1, EXT-09, T-38-05).**
  - With no binary, the probe was run against the site from the host. The listing API (`/api/v5/addons/addon/<slug>/`) names each current XPI at `addons.mozilla.org/firefox/downloads/file/...`. A HEAD with redirects followed answered 200 with zero redirects for all three D-07 listings, so no CDN host serves the bytes.
  - The update hosts come from upstream prefs. `extensions.update.url` (`firefox.js:229`) is used for user-requested checks. `extensions.update.background.url` (`firefox.js:230`) is used for the periodic check, which `AddonManager.backgroundUpdateCheck` still runs under `extensions.update.autoUpdateDefault=false`; that pref stops only the install of a found update.
  - The three rows use the 29-03 deliberate-egress voice. The site's page subresources (analytics, reCAPTCHA in its CSP) are content of a site the user chose to visit, not browser callouts, so they are not allowlisted, the same as for any other web page.
- **Docs in the same commit.** ROADMAP.md (Phase 38 Notes text only) and REQUIREMENTS.md (the Inherited network egress footer) name all three hosts in bold. `allowlist-doc-consistency` reports 6 Mozilla allow hosts, each found in both files.
- **Gates.**
  - `allowlist-doc-consistency` now selects `mozilla.(com|net|org)`. Its self-test plants a third host, `powerbrowser-selftest-control.addons.mozilla.org`, and requires it rejected.
  - `verify-webextensions.mjs` leg 4 reads `extensions.getAddons.link.url`, `extensions.update.url` and `extensions.update.background.url` from the pinned upstream `firefox.js`, with each branding variant's pref file overriding them, as the build loads them. It requires the hosts to equal the allow rows under `addons.mozilla.org`, so both a missing row and a stale row go red by name. A missing `upstream/` skips this leg only.
  - Three new plants (9 in total): an uncovered derived host, a stale planted row, and a branding blank of the background update URL. The last one proves the override is read.
- **Install trigger (Task 1, D-04, D-11; replaces the 38-02 stub).**
  - `extensionInstallSite` reads `Services.urlFormatter.formatURLPref("extensions.getAddons.link.url")` and refuses anything that is not https. It opens the page through `openStockTab`, which picks the stock window, waits for its startup, and opens a new window when none exists.
  - Its arm sits on the existing extension case line and the function is at the end of the file, so no catalogue row moved. One row was appended.
  - It is classed `network` in `verify-web-tab-bridge.mjs`, and `verify-extension-actions.mjs`'s `REQUIRED_STORE_CLASS` pins that class (D-11).
  - `ChromeStoreClient.extensionInstallSite()` is called only from the footer's handler, and a failure shows the existing bridge-failed notice. Manage Extension still opens the Add-ons Manager.
- **`amo-install` (Task 1).**
  - With `/a` on screen and no extension installed, the scenario clicks the footer. It finds the stock window whose selected tab is on the site's host. It picks the smallest D-07 listing by the XPI size the listing reports.
  - From that stock tab it starts the install through `AddonManager.installAddonFromWebpage` with the page's own principal, the path the site's button takes.
  - It waits for the stock `addon-webext-permissions` notification to open in the panel. It focuses that window if needed, because PopupNotifications opens the panel only in the active window. It asserts that the notification names the add-on the download carries and that the stock element's button shows the stock action label.
  - It presses Add after `security.notification_enable_delay`, then asserts the add-on is installed, active and signed (`signedState >= SIGNEDSTATE_SIGNED`, with signatures required in the session). Last, a click on its puzzle row on `/a` must open its own popup in the native panel.
  - Plant `prompt-bypassed` starts the same install with no prompt handler. It must go red with "the stock install prompt never appeared".
- **`fixtures` (Task 2, D-07, D-09).**
  - The scenario opens `/ad`, `/login` and `/plain`, which is three of the four allowed 127.0.0.1 tabs. Baselines are taken first by the same readers that score the effects:
    - The tracker image loads. Its host `ad.doubleclick.net` resolves to the harness through `network.dns.localDomains` for the session only.
    - The login form is empty.
    - `/plain` paints a light background.
  - The three listings then install signed from the site.
  - Blocker: `/ad` is reloaded until the image fails and the pushed badge for that tab reads a number above zero.
  - Manager: its own popup opens in the native panel on `/login`.
  - Dark mode: `/plain`'s painted luminance falls below 0.3.
  - Plant `fixtures-no-op` disables all three after install. It must go red naming each missing effect.
- **Phase close (Task 3).** The static regression set was re-run on the final tree (table below). The 38-VALIDATION Per-Task Verification Map Status column is bound to 38-05 T3: static rows are green, live rows are deferred, and the EXT-10 fill is flagged.

## Verification results (this lane)

| Check | Result |
|---|---|
| `node scripts/verify-webextensions.mjs` (+ `--self-test`) | PASS (9 plants, 3 new) |
| `scripts/verify-platform.sh --only allowlist-doc-consistency` (+ `-self-test`) | PASS (6 Mozilla allow hosts; 3 planted hosts rejected) |
| `scripts/verify-platform.sh --only allowlist-schema` | PASS |
| `node scripts/verify-extension-amo-live.mjs --static` / `--self-test` | PASS (2 live plants audited; 4 audit plants red, including the hand-kept id) |
| `node scripts/verify-extension-actions.mjs` (+ `--self-test`) | PASS (99 sources; 28 plants) |
| `node scripts/verify-extension-actions-live.mjs --static` / `--self-test` | PASS (13 live plants audited) |
| `node scripts/verify-web-tab-bridge.mjs` (+ `--self-test`) | PASS (64 plants) |
| `node scripts/verify-shell-error-copy.mjs` (+ `--self-test`) | PASS (no copy changed) |
| `node scripts/verify-shell-gbrowser-standin.mjs` (+ `--self-test`) | PASS |
| `bash scripts/check-internals-boundary.sh` / `--catalogue` / `--self-test` | PASS |
| `node scripts/verify-ng-040-internals-catalogue-lines.mjs` (normal mode; `--fix` never run) | PASS |
| `theia/node_modules/.bin/tsc --noEmit -p theia/extensions/chrome-bar` | PASS |
| `cd theia && nix develop ..#theia --command yarn build` | PASS after Task 1 |
| `nix develop .#theia --command scripts/verify-platform.sh --quick` | PASS before the Task 1 and 2 commits and on the final HEAD |
| `grep -rni "password\s*=\|passwd\|secret" scripts/verify-extension-amo-live.mjs \| grep -v plant` | 0 lines |
| All 11 Phase 38 live scenarios, both live `--self-test --live` runs, and the neighbour live suites | NOT RUN: no built binary (deferred, commands below). The neighbour files have no `--static` mode; their plain invocations stop at the missing binary. |

## Task Commits

1. **Task 1: add-ons site hosts allowlisted and documented, install footer opens the site in the stock window** — `ef8dc8e9` (feat)
2. **Task 2: EXT-10 fixtures scenario** — `7eb1bdf5` (test)
3. **Task 3: phase close, VALIDATION map bound** — `b2e272aa` (docs)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] The install prompt cannot appear in the shell, so the install runs from the stock window**
- **Found during:** Task 1
- **Issue:** The plan drives the install "from an overlay on the AMO page". In the shell, `ExtensionsUI.showPermissionsPrompt` (`browser/modules/ExtensionsUI.sys.mjs:557-565`) calls `browser.documentGlobal.gUnifiedExtensions.getPopupAnchorID`. The shell has no `gUnifiedExtensions`. The prompt also needs the `addon-webext-permissions-notification` element, which is defined in `browser-addons.js` and declared in `popup-notifications.inc.xhtml`, and the shell has neither. Phase 37 deferred add-on install prompts "to the stock window". The plan's fallback is to stop when the prompt host is absent; the standing ruling is never to stop.
- **Fix:** The trigger and the scenario use the stock window, where the whole stock flow exists. No prompt was authored and no furniture was added (D-04 holds).
- **Commit:** `ef8dc8e9`

**2. [Rule 2 - Missing functionality] allowlist-doc-consistency did not cover mozilla.org**
- **Found during:** Task 1
- **Issue:** The filter selected only `mozilla.com`/`mozilla.net`, so the "same commit" requirement would have passed without checking any of the new `*.mozilla.org` rows.
- **Fix:** The filter now includes `org`, and the self-test has a third plant.
- **Commit:** `ef8dc8e9`

### Scope and structure deviations

- **No `manifest` back-pointer field.** In this allowlist, `manifest` names a configuration.toml key, which `verify-theia-endpoints.mjs` checks against the manifest. Pointing it at a Firefox pref would make that gate red. Each reason names its pref and line instead, and `verify-webextensions.mjs` derives the hosts from those prefs.
- **The probe ran from the host, not the live shell.** There is no binary. The update hosts are read from the prefs the code uses, not from an observed request.
- **Six files touched beyond the plan's list.** The install trigger needed `PowerBrowserAPI.sys.mjs`, `INTERNAL-APIS.md`, `chrome-store-client.ts`, `extension-actions-widget.tsx`, `verify-web-tab-bridge.mjs` and `verify-extension-actions.mjs`, as the orchestrator asked: "this plan lands the real install trigger … and should replace that stub".
- **Fixtures install without the prompt.** `fixtures` installs each signed XPI through `getInstallForURL(...).install()`, a signed path with signatures required. `amo-install` alone proves the prompt.
- **Password-manager fill not scored** (see Owner decisions). The manager sub-case proves that the popup opens on the login page.
- **Phase 38 live scenarios not re-run.** The plan's Task 3 runs them all; the standing ruling defers every live run. Commands are listed below.
- **The VALIDATION `regression` row** names `verify-extension-actions-live.mjs --scenario regression`, a scenario no plan created. Its live half is covered by the 31.1 live set re-run below, and the row says so.

## Known limits

- **AMO in a web tab does not install.** A user who navigates a web tab to the add-ons site and presses its install button gets no prompt. The prompt code throws on the missing `gUnifiedExtensions`, as described above, and the install waits on a prompt that never resolves. The footer is the supported route. Fixing this means bringing the stock add-on prompt host into the shell (owner decision 2).
- **The install footer exists only in the empty state** (38-02 UI-SPEC). Once any extension is installed, the route to the site is Manage Extension, then the Add-ons Manager's own "Find more add-ons".

## Deferred to the end-of-milestone live pass

Prerequisites (unchanged from 38-04):
1. From `/home/chris/coding/Power-Browser`, re-patch main's `upstream/` with the amended 050: `cd upstream && git checkout HEAD -- $(grep '^+++ b/' ../patches/050-extension-tab-host.patch | sed 's#^+++ b/##') && git apply --3way ../patches/050-extension-tab-host.patch`.
2. Rebuild with `nix develop .#firefox --command bash -c 'cd upstream && MOZCONFIG=../.mozconfig ./mach build'`.
3. Stamp with `sha256sum patches/050-extension-tab-host.patch > objdir/.pb-050-build.sha256`.
4. Build Theia with `nix develop .#theia --command bash -c 'cd theia && yarn build'`.

The AMO file also needs network access to the add-ons site.

Phase-close set, in order:

1. `nix develop .#theia --command scripts/verify-platform.sh --quick`
2. `node scripts/verify-extension-actions-live.mjs --scenario buttons,popup-action,tabs-bridge,content,page-action,manage,sidebar,tab-pages,commands`
3. `node scripts/verify-extension-amo-live.mjs --scenario amo-install,fixtures`
4. `node scripts/verify-extension-actions-live.mjs --self-test --live`
5. `node scripts/verify-extension-amo-live.mjs --self-test --live`. A clean control per scenario, then `prompt-bypassed` must go red naming the prompt and `fixtures-no-op` must go red naming each missing effect.
6. `node scripts/verify-nav-keys-live.mjs && node scripts/verify-nav-keys-live.mjs --self-test`
7. `node scripts/verify-web-tab-live.mjs && node scripts/verify-web-tab-live.mjs --self-test`
8. `node scripts/verify-page-furniture-live.mjs --scenario extension-entry` (the EXT-08 menus proof)
9. `node scripts/verify-ext-tab-host-live.mjs --scenario query,events,active-tab,sender,adversarial-starts,gui01,refused-write` (the SC1 regression; `refused-write`'s highlighted step is from 38-01)
10. The 38-04 private-browsing manual check (38-04-SUMMARY, "Deferred live proof" under its security fixes).

30-04 ordering: every scenario opens its own tabs in a fresh session. `amo-install` uses one 127.0.0.1 tab and `fixtures` uses three, so neither exceeds four. Neither scenario reloads the frontend.

Manual backstops (38-VALIDATION Manual-Only):
- Rendering screenshots of the buttons, puzzle menu, badge and popup anchoring (KWin raise and spectacle).
- A real click-through on the add-ons site's own install button in the stock window, accepting the stock prompt.
- A real keyboard and pointer on the popup.

Live risks to watch:
- The site may serve its bot challenge page to the harness. The install still uses the page's principal, which is the site's origin, so the prompt path is unaffected.
- The ad blocker may need more than the 60 s retry window to compile its bundled lists on a cold profile.
- The dark-mode extension may skip `127.0.0.1` pages if a future version changes its defaults. A failure here names the luminance it measured.

## Owner decisions

1. **EXT-10 password-manager fill (D-09 conflict).** Bitwarden keeps no login without an account on a vault server, and D-09 forbids both, so "offers and fills runtime-invented credentials" cannot be proved as written. The options:
   - (a) A throwaway Bitwarden account, with its credentials supplied at run time from the environment and its vault hosts allowlisted. This adds egress and a credential story.
   - (b) A local Vaultwarden on 127.0.0.1, with the extension's self-hosted server URL pointed at it. No egress, but it adds a server to the harness.
   - (c) Accept the current offer-only proof and leave the fill to the manual backstop.

   Recommended: (b), because it proves the fill with no egress and no committed secret. Until a decision is made, EXT-10 stays incomplete.
2. **AMO install from a web tab.** Should the stock add-on prompt host (`gUnifiedExtensions.getPopupAnchorID`, the `addon-webext-permissions-notification` element from `browser-addons.js`, and its popupnotification) join the shell's furniture, so the site works inside a web tab too? Recommended: defer to the bridge milestone, with the stock-window footer as the supported route now.

## Known Stubs

None. The 38-02 install-footer stub is replaced.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: new-egress | powerbrowser/endpoint-allowlist.json | Three allow rows for the add-ons site (T-38-05). The derived leg in verify-webextensions fails on a fourth row or a missing one; services.addons.mozilla.org stays deny. |
| threat_flag: network-store-kind | powerbrowser/shell/PowerBrowserAPI.sys.mjs | `extensionInstallSite` opens an upstream-pref https URL in the stock window. It runs behind the store walls (Theia sender, shell window), carries no data from Theia, is never relayed, and refuses a non-https pref value. |

## Self-Check: PASSED

- FOUND: scripts/verify-extension-amo-live.mjs (`--scenario fixtures` and `amo-install` defined)
- FOUND: `addons.mozilla.org` in powerbrowser/endpoint-allowlist.json
- FOUND: commits ef8dc8e9, 7eb1bdf5, b2e272aa (ancestors of HEAD)
