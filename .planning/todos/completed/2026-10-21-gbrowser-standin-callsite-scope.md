---
created: 2026-10-21
title: Widen gBrowser stand-in call-site derivation to every actor parent (T-27-11)
area: shell
resolves_phase: 35
files:
  - scripts/verify-shell-gbrowser-standin.mjs
  - powerbrowser/shell/powerbrowser.js
---

## Problem

verify-shell-gbrowser-standin derives upstream gBrowser call sites only from
`*Parent.sys.mjs` under upstream/browser/actors and upstream/toolkit/actors.
Component-directory actor parents (ProfilesParent `addTrustedTab`,
AboutLoginsParent, TranslationsParent, ...) are not scanned, so a rebase that
adds a call there is not caught. Phase 27 security audit T-27-11 (medium,
non-blocking); REVIEW IN-15.

## Solution

Derive the parent list from DesktopActorRegistry.sys.mjs / ActorManagerParent.sys.mjs,
add the new members to the implemented set or DELIBERATELY_ABSENT with reasons,
plant a component-parent call in the self-test. Correct 27-03-SUMMARY's
"any actor parent" wording.

## Resolution

Resolved by Phase 35 plan 35-01 (2026-10-31). `verify-shell-gbrowser-standin.mjs`
derives its actor scope from both actor registries as well as the two directories
(84 parent entries, 78 URIs, 36 modules outside the directories; 83 actor-scope
files). `addTrustedTab`, `getPanel`, `getFindBar` and `getCachedFindBar` carry
verified DELIBERATELY_ABSENT reasons; `shouldActivateDocShell` is implemented
through the tab host. Self-test plant (h) is the component-parent plant.
27-03-SUMMARY's wording is corrected and T-27-11 is closed in 27-SECURITY.md.
