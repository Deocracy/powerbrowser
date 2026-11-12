---
phase: 66-powerbrowser-web-tabs-as-orca-s-browser
plan: 10
subsystem: chrome agent bridge / agent-tab isolation
status: complete
tags: [security, agent-isolation, gap-closure, D-38, D-39, clipboard, permissions]
requires: [66-09]
provides:
  - "D-38: agent tabs get no clipboard access (Clipboard API rejected, copy/cut/paste cancelled, the agent's clipboard keys refused before any key is sent)"
  - "D-39: permissions.isolateBy.userContext=true in both branding variants"
  - "orca-browser-tab-scope clipboardClause and permissionsClause (derived from the pinned Gecko source)"
  - "orca-browser-agent-live clauses (r) clipboard and (s) site permissions"
affects: [powerbrowser/shell/GroupActorChild.sys.mjs, powerbrowser/shell/PowerBrowserAPI.sys.mjs, website-staging/privacy.html]
key-files:
  created:
    - .planning/workstreams/orca/phases/66-powerbrowser-web-tabs-as-orca-s-browser/66-10-PLAN.md
    - .planning/workstreams/orca/phases/66-powerbrowser-web-tabs-as-orca-s-browser/66-10-SUMMARY.md
  modified:
    - powerbrowser/shell/GroupActorChild.sys.mjs
    - powerbrowser/shell/PowerBrowserAPI.sys.mjs
    - powerbrowser/INTERNAL-APIS.md
    - scripts/generate.mjs
    - powerbrowser/branding/dev/pref/firefox-branding.js
    - powerbrowser/branding/release/pref/firefox-branding.js
    - scripts/verify-orca-browser-tab-scope.mjs
    - scripts/verify-orca-browser-agent-live.mjs
    - scripts/lib/orca-browser-live.mjs
    - inventory/brand-tokens.json
    - website-staging/privacy.html
    - .planning/workstreams/orca/DECISIONS.md
decisions:
  - "D-38 (owner ruling 2026-11-11, \"No clipboard access\"): agent tabs can neither write nor read the system clipboard"
  - "D-39 (owner ruling 2026-11-11, \"Separate per container\"): site permissions are kept per container for all of PowerBrowser"
---

# Phase 66 Plan 10: clipboard and site permissions for agent tabs (D-38, D-39) Summary

## Mechanism

- **Clipboard (D-38):**
  - `GroupActorChild.sys.mjs`: `AGENT_CLIPBOARD_KEYS` (9 bindings derived from the pinned shortcut tables) are refused at the top of `agentPress` with `browser_command_unavailable` before any key is sent.
  - New `PowerBrowserAgentPage` actor pair, registered only for the agent message-manager group, all frames: at `DOMWindowCreated` it replaces `Clipboard.prototype` read, readText, write and writeText with the page's own rejected promise (`NotAllowedError`), and cancels trusted copy, cut and paste events.
- **Permissions (D-39):** `pref("permissions.isolateBy.userContext", true);` in the shared branding lines (generated, byte-identical in both variants).

## Tasks

1. `730830ad` feat(66-10): walls, pref, tab-scope clauses, INTERNAL-APIS rows, DECISIONS D-38/D-39, plan.
2. `bf7bca84` test(66-10): live clauses (r) and (s), fixtures `/clip` and `/perm`.
3. group-channel fix, privacy paragraph and tracking (this commit).

## Checks

- orca-browser-tab-scope: PASS; `--self-test` PASS (62 plants).
- orca-browser-agent-live `--self-test` PASS (96 plants).
- check-internals-boundary, `--catalogue`, ng-040, verify-generated-identity, scan-brand-residue: PASS.
- privacy-hosts, website-publish-ready, orca-credential-store, verify-manifest-literals, events-worker: PASS after the privacy edit.

## Live results (under the lock, ORCA_* unset, MOZ_PURGE_CACHES=1)

- orca-browser-agent-live: PASS, every clause including (r) "agent clipboard writes, reads and keys refused after user writes and a paste" and (s) "a default-container grant not effective in the agent tab".
- Negative control (lane, before commit): with the pref off and the child walls removed, the agent page wrote and read the clipboard, Control+v pasted, and the agent tab read the user's grant as granted.
- Re-runs for the pref's reach: orca-agent-mark-live, new-window-adopt-live, prompts-live, site-identity-live: all PASS.
- `./mach build faster` was not run: the build's `firefox-branding.js` is a symlink into `generated/`, so the pref reached the live runs without it.

## Quick gate

`nix develop .#theia --command scripts/verify-platform.sh --quick`: PASS, 413 of 413. The first run failed group-channel: that check derives the group request name from the child file's only `event.type !==` guard, and the new actor added a second. The new guard is now written as `===` (behaviour unchanged); INTERNAL-APIS rows renumbered, one tab-scope plant anchor moved, and orca-browser-agent-live re-run PASS.

## Brand rows

- `pref("` 77 -> 79 (+1 per variant, the D-39 line).
- `orca` 5367 -> 5370, no new file.
- The pref comment says "the agent container" rather than naming Orca, so the branding files gain no `Orca` occurrence.

## Privacy paragraph

`website-staging/privacy.html` gains one sentence: an agent page cannot read or change your clipboard, and site permissions you have granted do not carry over into its tabs.

## Owner items (end-of-milestone pass)

- Accepted risk recorded in D-38: on Linux, text the agent itself selects (mouse drag or select-all) is copied to the PRIMARY (middle-click) selection by `AutoCopyListener`. Gecko has no per-document switch; closing it needs a Gecko patch or turning `clipboard.autocopy` off for the user too. Flagged again by the background security review of `730830ad`.
- D-39 side effect: other containers the user has also get separate permissions.
- Accepted risks from the final verification: prompts and the file picker need the user; the agent container is visible; audio and WebRTC without devices; a compromised content process.

## Self-Check: PASSED
