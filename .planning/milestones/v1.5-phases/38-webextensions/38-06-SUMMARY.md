---
phase: 38-webextensions
plan: "06"
subsystem: extensions-security
tags: [webextensions, webrequest, cookies, windows-api, patch-stack, gap-closure, uf-31.1-01, uf-31.1-02, uf-31.1-03]
status: complete
live_proof: deferred
requires:
  - phase: 31.1-extension-tab-host
    provides: the findings UF-31.1-01, -02, -03 (31.1-SECURITY.md) and the D-06 wall (the Theia frame has no messagemanagergroup)
  - phase: 38-webextensions plans 01-05
    provides: patch 050 as amended, the live harness verify-ext-tab-host-live.mjs and its plant pattern
provides:
  - patches/060-extension-network-wall.patch (webRequest, declarativeNetRequest, proxy.onRequest and browser.cookies wall)
  - the windows.remove / windows.update refusal on a tab host window in patch 050
  - patch 055 (the crash-ping consent patch, renamed from the duplicate 050 prefix)
  - scripts/verify-ext-network-wall.mjs (6 families, 24 plants) and guards G12/G13 in verify-ext-tab-host-patch-guards.mjs (51 plants)
  - live scenarios network-wall, windows-refusal and worker-wall with plants network-wall-off, windows-guard-off and worker-wall-off; theia-never without the known-gap exemption
affects:
  - the end-of-milestone live pass (full-stack Gecko build, a second stamp objdir/.pb-060-build.sha256, 38-UAT 41-44)
key-files:
  created:
    - patches/060-extension-network-wall.patch
    - scripts/verify-ext-network-wall.mjs
  modified:
    - patches/050-extension-tab-host.patch
    - patches/055-powerbrowser-crash-ping-consent.patch (renamed)
    - powerbrowser/shell/powerbrowser.xhtml
    - powerbrowser/shell/powerbrowser-sidecar.js
    - powerbrowser/shell/PowerBrowserAPI.sys.mjs
    - powerbrowser/INTERNAL-APIS.md
    - scripts/verify-ext-tab-host-patch-guards.mjs
    - scripts/verify-ext-tab-host-live.mjs
    - scripts/verify-crash-ping-consent.mjs
    - scripts/verify-shell-gbrowser-standin.mjs
    - scripts/verify-platform.sh
    - docs/BUILD.md
    - docs/RELEASING.md
key-decisions:
  - "Discriminator for the network wall: the channel's top-level browser element (ChannelWrapper.browserElement, the same element tabTracker uses for tabId) carrying the attribute extensionnetworkhidden, set statically on the Theia frame in powerbrowser.xhtml. It is set before the frame loads anything, only chrome can write it, it covers every frame and dedicated worker inside the Theia browser, and web tabs on loopback origins are unaffected. A URL test was rejected by the owner; a messagemanagergroup test would also have hidden other group-less browsers."
  - "One choke point per consumer: runChannelListener carries every webRequest event and both declarativeNetRequest calls; shouldHookListener keeps the AuthRequestor off; applyFilter returns into its finally block, so the channel takes the default proxy. The StreamFilter path needs a registered traceable channel, which only runChannelListener registers."
  - "browser.cookies is covered: the audit's harm is the token reaching an <all_urls> extension, and cookies.getAll hands it over directly. A cookie has no browsing context, so the discriminator is an embedder pref (extensions.cookies.hidden, name@host) that keeps the patch brand-free; the shell lists POWERBROWSER_TOKEN@127.0.0.1 and the gate derives that value from TheiaService and PowerBrowserAPI."
  - "webNavigation needed no change: ext-webNavigation.js drops every event with tabId < 0, and the frame has no tab id (T-31.1-07)."
  - "windows.update stays allowed for focused and drawAttention (owner confirmed 2026-11-01): neither closes, moves, resizes nor retitles the shell, and tab-switching extensions focus the window. state, left, top, width, height and titlePreface are refused."
  - "Worker branch (owner decision 2026-11-01): a channel with no browser element is hidden when its loading principal (falling back to the triggering principal) has an origin on extensions.webRequest.hiddenOrigins. An entry scheme://*.host:port matches every subdomain of host:port, because Theia mints one origin per webview ({{uuid}}.webview.{{hostname}}, @theia/plugin-ext defaultPattern; TheiaService sets no THEIA_WEBVIEW_EXTERNAL_ENDPOINT). The pref cannot be static in powerbrowser-sidecar.js: the sidecar port is chosen at the first spawn (--port 0). powerbrowser-sidecar.js declares it empty and PowerBrowserAPI.setGroupSenderPort writes it on the default branch when the port is recorded, before the Theia frame navigates. That is a new touchpoint with its INTERNAL-APIS.md row; the catalogue was renumbered from the git diff -U0 hunk mapping (316 references, +4 after line 2294)."
  - "browsingData.removeCookies deleting the token is an accepted residual (Chris, 2026-11-01): sign-out only, no disclosure."
  - "The duplicate 050 prefix is fixed: the crash-ping patch is now 055, keeping its apply order (after 050-extension-tab-host, before 060). Live references moved (verify-crash-ping-consent.mjs, docs/RELEASING.md, a verify-platform.sh comment). .planning/workstreams/deploy/phase 57 files still name 050; they are dated records and were left as written."
  - "UF-31.1-03 needed no new rule: verify-ext-tab-host-scope.mjs family messagemanagergroup (b38ab95) already asserts the frame carries no group, with plants at the XHTML and the JS write; re-run green."
requirements-completed: []
duration: one session
completed: 2026-11-01
---

# Plan 38-06 Summary: UF-31.1-01/02/03 gap closure

## What was done

1. Build prep: `scripts/fetch-upstream.sh` re-cloned upstream/ at the pin `FIREFOX_153_5_1esr_RELEASE` (commit 6cd88e7d, the identity docs/BUILD.md records; clone 462 s) and `scripts/apply-patches.sh` applied the full stack. This cleared the four `--quick` reds that read upstream/.
2. Gecko edits made in the patched upstream/ tree, then every patch produced by `scripts/regenerate-patches.sh` (a new file was seeded with its `diff --git` header only). upstream/ was then reset and rebuilt from the stack alone: `apply-patches: all 7 patches applied and verified non-vacuous`, fetch-upstream `fully-applied`, `regenerate-patches.sh --check` PASS, `git -C upstream diff` empty, `check-patch-surface.sh` and its self-test PASS, `apply-patches.sh --self-test` PASS.
3. Shell: the Theia frame carries `extensionnetworkhidden="true"`; `powerbrowser-sidecar.js` sets `extensions.cookies.hidden`. No new Firefox-internal import, so no PowerBrowserAPI touchpoint or INTERNAL-APIS.md row.
4. Gates: `verify-ext-network-wall.mjs` (wall with its worker branch, consumers, cookies, frame, pref, origins; 24 plants) registered as `ext-network-wall` and `ext-network-wall-self-test`; G12 (update) and G13 (remove) in the patch-guards gate (45 to 51 plants); the D-74 logic-patch list in BUILD.md names 060.
5. `verify-shell-gbrowser-standin.mjs --self-test` plant (s2) assumed upstream/ carried the old 050. With the current 050 applied, the applied `tabContainer` reads kept the plant green. The plant now drops those lines from staged copies of the extension files as well as from the patch text.
6. Live (written, not run): `network-wall`, `windows-refusal`, `worker-wall`, plants `network-wall-off`, `windows-guard-off`, `worker-wall-off`; `theia-never` now uses a chrome-scope channel witness as its positive control and allows no record naming the Theia origin. The script checks a second stamp, `objdir/.pb-060-build.sha256`.

7. Follow-up the same day (owner decisions): patch 060's helper gained the worker branch; the shell writes the hidden-origins pref; gate family `origins` and plants for an unset pref and a removed worker branch; live `worker-wall` (38-UAT 45).

## Residual for the owner

- Theia's webview origin `{{uuid}}.webview.127.0.0.1:<port>` does not resolve on this host (glibc refuses names under an IP literal, and Gecko special-cases only `*.localhost`), so Theia webviews and their service worker cannot load in PowerBrowser today. The pattern is hidden anyway; `worker-wall` exercises the same branch with a worker on the sidecar origin. Making webviews load is separate work.
- `browsingData.removeCookies` deleting the token: accepted (2026-11-01).
- Nothing here was built or run live; behaviour is proven only by the end-of-milestone pass (38-UAT 41-45).
