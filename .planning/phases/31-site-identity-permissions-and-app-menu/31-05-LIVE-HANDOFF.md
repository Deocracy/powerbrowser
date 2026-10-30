# 31-05 Live Handoff — quit (MENU-04) and phase close

Built from the tree at `61c8f44` (the last commit of this plan). The Theia bundle was rebuilt after
the last Theia source change (`408d437`):

```sh
nix develop .#theia --command bash -c 'cd theia && yarn build'
```

Exit 0; the build log reports `Finished with 0 errors` for the browser and node builds.

The Gecko binary is unchanged. `powerbrowser/shell/*.sys.mjs` and `powerbrowser/shell/powerbrowser.js`
are read from the tree through the symlink, and the harness purges the startup cache itself
(`MOZ_PURGE_CACHES=1`, set in `withProbeShell`). The browser is `objdir/dist/bin/powerbrowser`.

## Scenario names

`app-menu` (31-04) is the menu scenario and now reads Quit as enabled. `quit-key` and `quit-row` are
new in this plan: each is one launch, so each runs in a session of its own. `identity-tls`,
`identity-local`, `site-panel`, `clear-data` and `shield` are the 31-01..31-03 scenarios, run again
as regression.

## Commands and PASS definitions

### 1. Quit by Ctrl+Q (31-05 task 1)

```sh
node scripts/verify-site-identity-live.mjs --scenario quit-key
```

- PASS: `quit-key: PASS`; no `FAIL --`, no `harness:` line.
- What it proves, in order:
  - a served page loads twice (two loads, so the tab has back/forward history);
  - an untitled editor with one unsaved change reads `dirty`;
  - the Theia frame takes focus (`focusTheiaFrame`) before the key;
  - the profile holds no `powerbrowser-web-tab-history.json` (the file name is read from
    `PowerBrowserAPI.sys.mjs`, `WEB_TAB_HISTORY_FILE_NAME`);
  - Ctrl+Q through `pressKey` (`route tip`);
  - the browser exits within 15 s (socket closed, profile lock released), with status 0;
  - the history file now exists and holds at least one web tab (the quit flush ran).
- Plants: none in this scenario. The dead-row plant is in `quit-row`.

### 2. Quit by the Quit row (31-05 task 2)

```sh
node scripts/verify-site-identity-live.mjs --scenario quit-row
```

- PASS: `quit-row: PASS`.
- What it proves: the same setup and the same three exit checks, triggered by a click on the
  `Quit PowerBrowser (Ctrl+Q)` row. The row is read enabled before the click.
- Plant `quit-dead-row` (`--self-test`): `quitRequest` resolves without quitting. Must go red
  naming `quit did not exit`.

### 3. The menu scenario (31-04, step 3 changed here)

```sh
node scripts/verify-site-identity-live.mjs --scenario app-menu
```

- PASS: `app-menu: PASS`. Step 3 now reads the Quit row as enabled (it used to read disabled).
  The click on Quit is not in this scenario, because it would end the launch.

### 4. Full live run (all eight scenarios)

```sh
node scripts/verify-site-identity-live.mjs
```

- PASS: `identity-tls: PASS`, `site-panel: PASS`, `identity-local: PASS`, `clear-data: PASS`,
  `shield: PASS`, `app-menu: PASS`, `quit-key: PASS`, `quit-row: PASS`; exit 0.

### 5. Live self-test (every plant red)

```sh
node scripts/verify-site-identity-live.mjs --self-test
```

- PASS: `--self-test: PASS -- the clean control is green and all 8 planted faults went red`.
  Plants: `typed-lock`, `perm-refused`, `icons-stale`, `clear-signout`, `shield-stale`,
  `shield-leak`, `menu-dead-stock`, `quit-dead-row`.

### 6. Key regression (the shortcut relay and nav keys)

```sh
scripts/verify-platform.sh --only nav-keys-live
scripts/verify-platform.sh --only nav-keys-live-self-test
```

- PASS: each row ends `verify-platform: PASS -- all checks passed`.

### 7. Static gates (no browser)

```sh
node scripts/verify-site-identity.mjs
node scripts/verify-site-identity.mjs --self-test
node scripts/verify-shortcut-relay.mjs
node scripts/verify-shortcut-relay.mjs --self-test
node scripts/verify-web-tab-bridge.mjs
node scripts/verify-web-tab-bridge.mjs --self-test
node scripts/verify-shell-error-copy.mjs
node scripts/verify-ng-040-internals-catalogue-lines.mjs
bash scripts/check-internals-boundary.sh --catalogue
scripts/verify-platform.sh --quick
node scripts/scan-brand-residue.mjs
```

## Last run (final tree, after commit `61c8f44`)

- Full run `node scripts/verify-site-identity-live.mjs`: all eight PASS, exit 0.
- `--self-test`: PASS (clean controls green for eight sessions; eight plants red, names above).
- `nav-keys-live` and `nav-keys-live-self-test`: PASS.
- `verify-platform.sh --quick`: PASS (exit 0).
- Static gates: PASS (see the SUMMARY's static results).

## Notes for the next reader

- Quit ends the launch, so a quit check must be the last step of its session. The runner does this
  (`main` and `selfTest` give `quit-key` and `quit-row` their own sessions).
- The quit flush file is the same-launch mark. A fresh profile has no such file before a quit; the
  scenario checks that before the key or click, so a leftover file cannot pass the check.
- `app.awaitExit`, `app.exitCode()` and `app.profileDir` are new on the probe's app object
  (`scripts/lib/pb-relaunch.mjs`, `scripts/lib/firefox-bidi.mjs`, `scripts/lib/pb-live-probe.mjs`).
- The Ctrl+Q badge is label text (`Quit PowerBrowser (Ctrl+Q)`). No Theia keybinding exists for
  Ctrl+Q; `verify-shortcut-relay.mjs` rule 11 fails if one is added.

## Files this handoff covers

- `scripts/verify-site-identity-live.mjs`: `quit-key`, `quit-row`, `afterQuit`, the `quit-dead-row`
  plant, the app-menu step 3 change, the session list in `main` and `selfTest`.
- `scripts/lib/pb-relaunch.mjs`, `scripts/lib/pb-live-probe.mjs`, `scripts/lib/firefox-bidi.mjs`:
  `awaitExit`, `exitCode`, `profileDir`.
- `scripts/verify-site-identity.mjs`, `scripts/verify-shortcut-relay.mjs`,
  `scripts/verify-web-tab-bridge.mjs`: the quit cases and plants (static).

## Deferred human verification

- Real keyboard Ctrl+Q with the Theia frame focused, and with focus inside the Monaco editor
  (KDE Wayland), with an unsaved editor open.
- Pixel review of the Quit row (`Quit PowerBrowser (Ctrl+Q)`), the hamburger, the 280px sheet and
  the separators against UI-SPEC.
- Keyboard use of the menu, including Quit, and focus after quit.
- Product check: the badge as text in the label, in place of a Theia accelerator.
