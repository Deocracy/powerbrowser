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
