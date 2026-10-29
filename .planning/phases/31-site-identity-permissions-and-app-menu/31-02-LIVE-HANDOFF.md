# 31-02 Live Handoff — permission writes, site panel, identity-box icons

Built from HEAD after commit `fc09872` with the Theia app build:

```sh
nix develop .#theia --command bash -c 'cd theia && yarn build' > "${TMPDIR:-/tmp}/pb-31-02-build.log" 2>&1
```

Exit 0 (the build ran after every Theia source change in this plan).

The live gate runs with the startup cache purged by the harness itself
(`MOZ_PURGE_CACHES=1`, set in `withProbeShell`). The browser is the
`objdir/dist/bin/powerbrowser` the 31-01 run used.

## Scenario names

The plan's verify line names `--scenario identity-lock,site-panel`. No
`identity-lock` scenario exists: 31-01 landed `identity-tls` and
`identity-local`. The commands below use the real names.

## Commands and PASS definitions

### 1. Identity scenarios (31-01, regression check)

```sh
node scripts/verify-site-identity-live.mjs --scenario identity-tls
node scripts/verify-site-identity-live.mjs --scenario identity-local
```

- PASS: `identity-tls: PASS` and `identity-local: PASS`, no `FAIL --`, no
  `NOT SCORED`, no `harness:` line, no `error TS` line.
- Last run (after the build above): both PASS.

### 2. Site panel (31-02)

```sh
node scripts/verify-site-identity-live.mjs --scenario site-panel
```

- PASS: `site-panel: PASS`.
- What it proves, in order:
  - the https page shows `Connection secure` and the certificate block
    (`Issued to:` and `Issued by:`);
  - six rows in table order (`camera`, `microphone`, `geo`,
    `desktop-notification`, `autoplay-media`, `popup`), with the empty copy
    `No special permissions set for this site` while all are default;
  - camera `default` → `allow` (`Allowed`) → `block` (`Blocked`) → `default`
    (`Use default`), each state read back from chrome's reply, and `allow`
    still present after closing and reopening the panel;
  - the identity box shows the eye icon after the camera reply;
  - autoplay-media `allow` → `block-audible` (`Block sounds`) →
    `block-all` (`Block all`) → `default`;
  - the origin race (review fix): the panel shows origin A, the tab
    navigates to origin B, a camera write is refused (the panel shows the
    unavailable copy), and on reopen camera is `default` on B, B reads
    `Connection not secure`, and B has no certificate block;
  - four non-default permissions show three icons and `+1`; resetting all four
    to default shows no icons;
  - an autoplay-media `block-audible` or `block-all` keeps its icon in the box.
- Last run: **FAIL** on the autoplay-media steps only. See "Open blocker"
  below. Every other step passed in that run.

### 3. Live self-test (plants go red)

```sh
node scripts/verify-site-identity-live.mjs --self-test
```

- PASS: `--self-test: PASS` with a green clean control for each session and
  every planted fault red on its target: `typed-lock` (naming
  `lock derived from typed text`), `perm-refused` (naming
  `can't show site information`), `icons-stale` (naming `icons did not update`).
- Last run: the three plants went red on their targets as required. The
  clean `site-panel` control is red, for the autoplay-media reason only, so
  the overall self-test is FAIL.

### 4. Static gates (no browser)

```sh
node scripts/verify-site-identity.mjs
node scripts/verify-site-identity.mjs --self-test
node scripts/verify-web-tab-bridge.mjs
node scripts/verify-web-tab-bridge.mjs --self-test
scripts/verify-platform.sh --quick
node scripts/scan-brand-residue.mjs
```

- PASS: `verify-site-identity: PASS -- 17 cases`; self-test names 21 planted
  faults all red; bridge PASS with 25 planted faults red; `--quick` exit 0;
  brand scan PASS.

## Open blocker: autoplay-media "Block sounds" is not storable under the default pref

Upstream's default for `media.autoplay.default` is `BLOCKED`
(`upstream/modules/libpref/init/StaticPrefList.yaml:11938-11940`, value 1).
`SitePermissions.getDefault("autoplay-media")` maps that to `SitePermissions.BLOCK`
(`upstream/browser/modules/SitePermissions.sys.mjs:863-884`). `setForPrincipal`
removes any entry equal to the default (`SitePermissions.sys.mjs:575-580`),
so a per-site `block-audible` write is a removal and reads back as
`default` ("Use default"). The product sets no autoplay pref, so this is the
shipped behaviour. The plan's round trip `default → allow → block-audible →
block-all → default` cannot pass as written.

Options for a decision, not taken here:
1. Read the effective state with `SitePermissions.getForPrincipal` (its
   fallback is `getDefault`, `SitePermissions.sys.mjs:461-462`, which is what
   upstream's panel shows). Absent autoplay then reads as `block-audible`
   ("Block sounds") under the default pref.
2. Store `block-audible` through `Services.perms.addFromPrincipal` directly,
   with catalogue rows. This bypasses upstream's equal-to-default removal.
3. Remove `block-audible` from the autoplay cycle. This contradicts the
   plan's must-have "autoplay-media four-state incl. block-audible".

## Files this handoff covers

- `scripts/verify-site-identity-live.mjs`: `site-panel`, `PLANTS` entries
  `perm-refused` and `icons-stale`, `openPanelReady`, `PANEL_READ`, `ICON_READ`.
- `scripts/verify-site-identity.mjs`: cases 12-14 and the four new plants.
- `scripts/verify-platform.sh`: rows `site-identity-live` and
  `site-identity-live-self-test` (full run, not `--quick`).
