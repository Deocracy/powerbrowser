# 31-04 Live Handoff — application menu and stock pages

Built from the tree at `124a744` (the last Theia source change of this plan). The Theia bundle
was rebuilt after that commit:

```sh
nix develop .#theia --command bash -c 'cd theia && yarn build'
```

Exit 0; the build log reports `Finished with 0 errors` for the browser and node builds.

The Gecko binary is unchanged. `powerbrowser/shell/*.sys.mjs` is reached through a symlink into
the tree, so the boundary change needs only the startup-cache purge, which the harness sets itself
(`MOZ_PURGE_CACHES=1`, in `withProbeShell`). The browser is `objdir/dist/bin/powerbrowser`.

## Scenario names

`app-menu` is new in this plan. `identity-tls`, `identity-local`, `site-panel`, `clear-data` and
`shield` are the 31-01..31-03 scenarios, run again as regression. Each session opens at most four
web tabs and runs in its own probe profile. The TLS sessions use a fixed port, so live runs are
sequential.

## Commands and PASS definitions

### 1. The menu scenario (31-04 tasks 1 and 2)

```sh
node scripts/verify-site-identity-live.mjs --scenario app-menu
```

- PASS: `app-menu: PASS`; no `FAIL --`, no `harness:` line.
- What it proves, in order:
  - the mode segments `Coding`, `Browsing`, `Organising` each become the pressed segment, and the
    hamburger (`button[aria-label="Application menu"]`) opens `.lm-Menu.pb-app-menu` in each;
  - the drawn sequence (rows and label-less separator items) equals the sequence this tree
    should draw: `New Tab`, separator, `Settings`, `Passwords`, `Add-ons`, separator, `Help`,
    separator, `Quit PowerBrowser (Coming soon)`; the labels come from the widget's switch and
    `CHROME_BAR_COPY`, the configured name is read from the page;
  - the Quit row reads disabled, the other rows enabled;
  - for each of Settings, Passwords, Add-ons and Help: every stock window is closed first (the
    control: zero stock windows before the click), then one stock window shows the expected
    address with exactly one tab on it, and the web tab's pushed address is unchanged;
  - the disabled Quit row: a click on it opens or closes no stock window, and the shell still
    answers a probe.
- Plant `menu-dead-stock` (`--self-test`): `openStockPage` resolves without opening. Must go red
  naming `did not open its stock page`.

### 2. Site-identity regression (31-01..31-03 scenarios)

```sh
node scripts/verify-site-identity-live.mjs
```

- PASS: `identity-tls: PASS`, `site-panel: PASS`, `identity-local: PASS`, `clear-data: PASS`,
  `shield: PASS`, `app-menu: PASS`.

### 3. Live self-test (every plant red)

```sh
node scripts/verify-site-identity-live.mjs --self-test
```

- PASS: `--self-test: PASS -- the clean control is green and all 7 planted faults went red`.
  Plants: `typed-lock`, `perm-refused`, `icons-stale`, `clear-signout`, `shield-stale`,
  `shield-leak`, `menu-dead-stock`.

### 4. Chrome-bar regression (the bar gained a button)

```sh
scripts/verify-platform.sh --only nav-keys-live
scripts/verify-platform.sh --only address-bar-live
scripts/verify-platform.sh --only gui02-web-tab-live
```

- PASS: each row ends `verify-platform: PASS -- all checks passed`.

### 5. Static gates (no browser)

```sh
node scripts/verify-site-identity.mjs
node scripts/verify-site-identity.mjs --self-test
node scripts/verify-web-tab-bridge.mjs
node scripts/verify-web-tab-bridge.mjs --self-test
node scripts/verify-shell-error-copy.mjs
node scripts/verify-ng-040-internals-catalogue-lines.mjs
bash scripts/check-internals-boundary.sh --catalogue
scripts/verify-platform.sh --quick
node scripts/scan-brand-residue.mjs
```

## Last run (final build, after commit `124a744`)

- `app-menu: PASS`.
- Full run `node scripts/verify-site-identity-live.mjs`: identity-tls, site-panel, identity-local,
  clear-data, shield, app-menu: all PASS; exit 0.
- `--self-test`: PASS (clean controls green for six sessions; seven plants red, names as above).
- `nav-keys-live`, `address-bar-live`, `gui02-web-tab-live`: PASS (exit 0 each).
- `verify-platform.sh --quick`: PASS (exit 0).

## Notes for plan 31-05

- The `app-menu` scenario's step 3 asserts the Quit row is disabled, because plan 04 does not
  wire it. When plan 05 adds the `quitRequest` kind and wires Quit (add `'quit'` to
  `WIRED_MENU_IDS` in `site-identity/app-menu.ts`), the static gate's wired-set case flips to
  require the `quitRequest(` method on `ChromeStoreClient`, and the live step 3 must change to
  expect an enabled Quit row. Both are plan 05's edits.
- The Quit row's label is `Quit PowerBrowser (Coming soon)` in this build; plan 05 removes the
  caption suffix through the widget's `label` function (the copy key `comingSoonRow` stays for the
  other unwired rows).

## Files this handoff covers

- `scripts/verify-site-identity-live.mjs`: the `app-menu` scenario, the `menu-dead-stock` plant,
  the Application menu reads (`readAppMenu`, `clickMenuRow`, `closeMenu`, `closeStockWindows`).
- `scripts/verify-site-identity.mjs`: the menu cases and the seven menu plants, plus the leading
  separator plant.
- `scripts/verify-web-tab-bridge.mjs`: the `openStockPage` classification and its two plants.

## Deferred human verification

- Visual check of the hamburger, the 280px sheet, the 32px rows, the separators and the Coming
  soon caption (KDE Wayland; pixels against UI-SPEC).
- Keyboard use of the menu (arrow keys, Enter, Escape) and focus after a stock page opens.
- Product confirmation of the History and Downloads rows (UI-SPEC lists them; the plan leaves
  them to Phase 33).
