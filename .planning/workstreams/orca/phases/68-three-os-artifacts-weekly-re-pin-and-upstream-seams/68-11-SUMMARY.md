---
phase: 68-three-os-artifacts-weekly-re-pin-and-upstream-seams
plan: 11
subsystem: theia-bundled-extensions
status: complete
gap_closure: true
requirements-completed: [BEXT-01]
tags: [BEXT-01, D-30, P68-38, reinstall, owner-ruling-2026-11-15]
requires:
  - "68-09 seed (bundled-extensions-seed.ts, the bundledExtensions.seeded record)"
  - "Theia 1.76 PluginServer.install, HostedPluginWatcher.onDidDeploy"
provides:
  - "command powerbrowser.bundled-extensions.reinstall-claude (palette and Help menu), visible only while the Claude extension is absent"
  - "RPC service /services/powerbrowser-bundled-extensions: absent(), reinstall(id)"
  - "copy table bundled-extensions-copy.ts, checked by shell-error-copy-no-internals"
key-files:
  created:
    - theia/extensions/bundled-extensions/src/common/bundled-extensions-protocol.ts
    - theia/extensions/bundled-extensions/src/common/bundled-extensions-copy.ts
    - theia/extensions/bundled-extensions/src/node/bundled-extensions-service.ts
    - theia/extensions/bundled-extensions/src/browser/reinstall-command.ts
    - theia/extensions/bundled-extensions/src/browser/bundled-extensions-frontend-module.ts
  modified:
    - theia/extensions/bundled-extensions/package.json
    - theia/extensions/bundled-extensions/src/node/bundled-extensions-seed.ts
    - theia/extensions/bundled-extensions/src/node/bundled-extensions-backend-module.ts
    - bundled-extensions/claude-agent-sdk/README.md
    - scripts/verify-bundled-extensions.mjs
    - scripts/verify-shell-error-copy.mjs
completed: 2026-11-15
---

# Phase 68 Plan 11: Reinstall the bundled Claude extension (gap closure) Summary

A user who removed the pre-installed Claude extension can now get it back. The command "Reinstall
the Claude Extension" appears in the command palette and the Help menu only while the extension's
folder is absent from the profile. It copies the shipped folder from the installed PowerBrowser
package back into the profile and deploys it through Theia's own `PluginServer.install`. Nothing
reinstalls it automatically.

## Commits

| Task | Commit | Message |
|------|--------|---------|
| plan | 768fd88e | docs(68-11): plan the bundled Claude extension reinstall affordance |
| 1 | 76fb6e33 | feat(68-11): reinstall the Claude extension from the Help menu or palette, offered only while it is absent |
| 2 | 9af326e8 | test(68-11): reinstall legs and plants in bundled-extensions and shell-error-copy-no-internals |

## Design

- **Seed (unchanged behaviour).** The shipped-folder walk is factored into `shippedExtensions`, and the seed's rule is unchanged. Two pure functions are added:
  - `absentBundledExtensions` lists the shipped ids whose deployed folder is gone.
  - `reinstallBundledExtension` refuses an id that is not shipped (`unknown`, which covers traversal and dot names) and leaves a present copy alone (`present`). Otherwise it calls the seed's `copyInto` (temporary sibling, then rename, symlinks refused).
  - The seed keeps the start's `sources` so the service reads the same shipped folders.
- **Service (`node/bundled-extensions-service.ts`).** It serves `absent()` and `reinstall(id)` over JSON-RPC on Theia's authenticated websocket.
  - Reinstalls are queued, so they run one at a time.
  - On `reinstalled` it writes the version into `bundledExtensions.seeded`, so the next start's seed does nothing. It then calls `PluginServer.install('local-dir:<deployedPlugins>', PluginType.User)`. That is the same entry `PluginVSCodeDeployerParticipant` deploys at every start.
  - Theia skips plugins that are already deployed and calls `markAsInstalled`, which clears an in-session uninstall mark. It then fires `onDidDeploy`, so the Extensions view refreshes.
  - Errors are logged and returned as `failed`.
- **Command (`browser/reinstall-command.ts`).**
  - `isVisible` and `isEnabled` are both `this.absent.has(CLAUDE_EXTENSION_ID)`.
  - The absent set is refreshed at `onStart` and on `HostedPluginWatcher.onDidDeploy`. Theia's backend also fires that event after an uninstall, once the folder has been removed.
  - The command's `execute` is the only caller of `service.reinstall`. Each outcome shows one notification from the copy table.
  - The command is registered in `CommonMenus.HELP` and in the palette (it has a label).
- **No Theia core edit, no powerbrowser/shell change.** `powerbrowser/shell` is untouched, so check-internals-boundary and ng-040 were not run. `OrcaEnv`'s SDK path is the same folder the reinstall restores.

## User-facing strings (for owner approval, verbatim)

From `theia/extensions/bundled-extensions/src/common/bundled-extensions-copy.ts`:

- Command label (palette and Help menu): `Reinstall the Claude Extension`
- Reinstalled: `PowerBrowser reinstalled the Claude extension. Start a new Claude chat session to use it.`
- Already present (only reachable through a race, because the command is hidden while present): `PowerBrowser already has the Claude extension installed. Switch it on in the Extensions view if Claude chat sessions are missing it.`
- Failed (error notification): `PowerBrowser couldn't reinstall the Claude extension. Try the command again, or restart PowerBrowser and then try it.`

`bundled-extensions/claude-agent-sdk/README.md`, last paragraph. It replaces the 68-09 sentence "Removing it cannot be undone in this version of PowerBrowser, ...":

> To get Claude chat sessions back, switch this extension on again in the Extensions view. If you
> removed it, choose Reinstall the Claude Extension from the Help menu or the command palette.
> PowerBrowser never reinstalls it on its own.

## Checks

| Check | Result |
|-------|--------|
| `tsc --noEmit` over the extension, against the main checkout's Theia 1.76 typings (scratch tsconfig, nothing written there) | PASS |
| `bundled-extensions` (new reinstall leg: id equals a shipped manifest, gate on isVisible/isEnabled, `.reinstall(` only in `execute:`, `reinstallBundledExtension` only in the service) | PASS |
| `bundled-extensions-seed` with the extension compiled into the ignored `lib/` (`NODE_PATH` at the main checkout's node_modules) | PASS, 13 scenarios (8 seed, 5 reinstall: absent, present, three refused ids) |
| `bundled-extensions-self-test` (compiled) | PASS. Tree control, then plants: visible while present, enabled whatever the state, a reinstall at start, the seed copying back, an unshipped id, a reinstall that overwrites a present copy. Each went red naming its fault |
| `shell-error-copy-no-internals` | PASS. Reinstall scope: 3 messages and the label |
| `shell-error-copy-no-internals-self-test` | PASS. 4 new plants: dotted key leaked, product not named, ad-hoc notification literal, declared message never shown |
| `scan-brand-residue` after staging | PASS (842 files). No inventory row moved, because no new file spells a brand token |
| `verify-platform.sh --quick` in `nix develop .#theia` | rc 1 with 124 red rows. Every red row comes from the lane environment (no `upstream/`, no `theia/node_modules`, no `generated/upstream-pins.env`). Every row touching these files is green: bundled-extensions, -seed, -self-test, shell-error-copy-no-internals, -self-test, theia-build-order, -self-test, scan-brand-residue, -self-test. In --quick, without `lib/`, the seed leg and the two compiled plants print SKIP lines, as on any unbuilt tree |

## Live rows for the coordinator (not run here)

1. Build (`yarn build` in `theia/`), then `scripts/verify-platform.sh --only bundled-extensions-live`. Its contract is unchanged; the PASS line now ends "an uninstall is not undone automatically".
2. Re-run `--only bundled-extensions-seed` and `--only bundled-extensions-self-test` on the built tree. This exercises the reinstall table and the overwrite plant against the real `lib/`.
3. GUI pass (human or gsd-browser on the standalone sidecar):
   - (a) In a fresh profile the palette does not list "Reinstall the Claude Extension", and the Help menu does not show it.
   - (b) Uninstall the Claude Agent SDK in the Extensions view. The command appears without a reload.
   - (c) Run it. The "reinstalled" notification shows, the folder is back under `deployedPlugins/powerbrowser.claude-agent-sdk`, the Extensions view lists it as installed, and the command disappears.
   - (d) Restart. It stays installed, and the record holds the shipped version.
   - (e) Uninstall, then restart without running the command. It stays removed.
4. Confirm the "Start a new Claude chat session to use it" claim. The orcad environment carries the SDK path from spawn, so a session started after the reinstall should load it without restarting orcad. If it does not, the reinstalled message needs to say "restart PowerBrowser" instead (owner copy decision).

## Deviations

- Copy is in title case for the command label ("Reinstall the Claude Extension"), following the palette convention (Save Setup, Restore Setup). The brief suggested "Reinstall the Claude extension"; the owner approves the final wording.
- The command is specific to the Claude extension (`CLAUDE_EXTENSION_ID`), because there is one bundled extension. The service and the pure rules are generic over shipped ids. The check requires the command's id to equal a shipped manifest's `publisher.name`.

## Known limits

- The `present` and `unknown` outcomes are reachable only through a race or a tampered RPC call. `unknown` shows the failed message.
- No check ties the README's quoted command name to `REINSTALL_COMMAND_LABEL`. If the label changes, update the README by hand.

## Self-Check: PASSED

## Live rows run (2026-11-15, coordinator)

Tree 0247ebdb, Theia built in `nix develop .#theia` (lib newer than 4c265724). Standalone sidecar on :4000 with a fresh `THEIA_CONFIG_DIR` and a scratch HOME, driven through chrome-devtools (real key and click input).

1. `bundled-extensions-live`: PASS ("an uninstall is not undone automatically").
2. `bundled-extensions-seed`: PASS (13 scenarios). `bundled-extensions-self-test`: PASS (control green, every plant red).
3. GUI pass:
   - (a) PASS. Fresh profile: the palette lists nothing for "Reinstall"; Help (Coding mode) shows About, Welcome, Open Walkthrough only.
   - (b) PASS. After Uninstall in the Extensions view, the palette lists "Reinstall the Claude Extension" without a reload.
   - (c) PASS. Running it shows one toast "PowerBrowser reinstalled the Claude extension. Start a new Claude chat session to use it."; `deployedPlugins/powerbrowser.claude-agent-sdk` is back; the Extensions view shows it installed (Uninstall button); the palette no longer lists the command; the log reads "reinstalled".
   - (d) PASS. After a backend restart it stays installed, no seed runs, and `bundledExtensions.seeded` holds `0.3.284`.
   - (e) PASS. Uninstall, then restart without the command: "Deploy batch of 0 accepted plugins", folder absent. Help (Coding mode) then lists "Reinstall the Claude Extension".
4. Not run: the "Start a new Claude chat session" claim needs a full PowerBrowser with orcad and a real claude, which the standalone sidecar does not have. It stays a coordinator or owner live row.

Finding: Theia's menu bar is hidden outside Coding mode, and the Application menu's Help submenu is hand-built (Get Help, About; `chrome-bar-widget.tsx:1273`), so in Browsing, Organising and Orca modes the command is reachable only from the palette. Owner decision: add the row to the Application menu's Help submenu, or accept palette plus Coding-mode Help.

## Review fixes (2026-11-16)

All 14 findings of `68-11-REVIEW.md` (ffbefe01: 2 critical, 8 warnings, 4 info) are fixed:

- CR-01 2fea5fa8 (remove the scratch HOME on SIGTERM/SIGHUP/SIGINT, sweep the folders of dead runs); CR-02 b12906fc (write a refresh token claude rotated in the scratch HOME back, never delete it)
- WR-01 04fe4400; WR-02 740fcc79; WR-03 1c7630de; WR-04 200a5820 (scratch-HOME findings)
- WR-05 98777f97 (checkReinstall goes red on a negated gate, executeCommand and a fixed absent set); WR-06 9018e1e5 (the reinstall copy is undone when deployment fails, recorded only after the deploy); WR-07 e6dd6a25 (the copy scan requires every notification text to be a REINSTALL_MESSAGES entry)
- WR-08 0a7d9a72 (owner ruling D-48: "Reinstall the Claude Extension" in the Application menu's Help submenu, so it is reachable in every mode)
- IN-01 9fab2fd5; IN-02 f62fe981; IN-03 c62a5d38; IN-04 3f067596 (scratch-HOME findings)

The scratch-HOME range is 2fea5fa8..04fe4400. Per D-48 the Help-submenu row was not yet run in a rebuilt GUI (END-OF-MILESTONE-CHECKLIST.md section 3).
