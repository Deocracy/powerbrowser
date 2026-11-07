# Phase 39 baseline (plan 39-01)

Measured before any fix plan starts. Every later "fixed" and "green" claim in phase 39 compares against this file.
Logs stay under `${TMPDIR:-/tmp}/pb-39-baseline/` and are not committed.

## Tree state

- Start of 39-01 (2026-11-05T18:13Z): HEAD `e32a090f`; tracked dirt `.claude/settings.json`, `.planning/STATE.md`, `.planning/state.json`.
- `.planning/STATE.md` committed (`e5593190`). `.planning/state.json` left dirty: the orchestrator marked it as another writer's file. `.claude/settings.json` left untouched: it is the owner's local hook removal (backup `.claude/settings.bak-hooks-20261031.json` beside it).
- 34-UAT.md rewritten in the UAT template shape (`2c730f40`): 15 rows, parser status `partial`, 6 pass, 9 pending.
- After Task 1: `git status --short --untracked-files=no` lists only `.claude/settings.json` and `.planning/state.json`.

**Dirty-tree rule for every later live task:** set `PB_NG_ALLOW_DIRTY=1` for an ng-a-live harness only when
`git status --short --untracked-files=no` lists nothing except `.claude/settings.json` and `.planning/` paths.
Any other dirty tracked path means commit first.

## Probes

A1 mechanism: KWin script `print()` of a unique marker line, read back with `journalctl --user --since @<epoch> -o cat` (mechanism (a); (b) callDBus was not needed). Measured on KWin 6.6.6, Plasma Wayland. Implemented in `scripts/lib/pb-kwin.mjs`.

A1 prerequisite found: every harness session is `--headless` (`scripts/lib/firefox-bidi.mjs`), so it has no compositor window to raise or read back. `PB_LIVE_HEADED=1` now drops `--headless` (commit `3fd36bb5`). The headed shell window reads `resourceClass "powerbrowser"`, `caption "PowerBrowser"`, normal, not transient.

A1 self-test output (`node scripts/lib/pb-kwin.mjs --self-test`, sandbox off, at `3fd36bb5`'s tree):

```
clean control: raiseShell true, active {"resourceClass":"powerbrowser","caption":"PowerBrowser","x":384,"y":226,"width":1280,"height":800}
ok  clean-control -> sent shift to powerbrowser
ok  clean-capture -> powerbrowser 1280x800
ok  class-mismatch -> refused
ok  readback-empty -> refused
pb-kwin --self-test: PASS
```

Mutation check: with the gate's `throw` disabled in a scratch copy, the self-test printed `FAIL class-mismatch -> osKeys sent` and `FAIL readback-empty -> osKeys sent` and exited 1. Runtime about 100 s; `spectacle -b` takes about 25 s per capture on this host and succeeds.

A7 ExtensionParent: `objdir/dist/bin/modules/ExtensionParent.sys.mjs` -> `/home/chris/coding/Power-Browser/upstream/toolkit/components/extensions/ExtensionParent.sys.mjs` (under `$PWD/upstream/`: yes)

A7 EnterprisePoliciesParent: `objdir/dist/bin/modules/EnterprisePoliciesParent.sys.mjs` -> `/home/chris/coding/Power-Browser/upstream/toolkit/components/enterprisepolicies/EnterprisePoliciesParent.sys.mjs` (under `$PWD/upstream/`: yes)

A7 result: both JS modules resolve into `upstream/`, so a JS-only 050 change is live after `-purgecaches` with no `./mach build`.

C24 verdict: product-writes-image (inferred; not observed through wl-paste). The planned wl-paste bisect cannot decide C24 on this harness, for two measured reasons, so the verdict rests on the source and the earlier text/html reading:

1. Headless run (`node scripts/verify-page-furniture-live.mjs --scenario menu-edit`, 10:33:11-10:33:25): `menu-edit: FAIL -- Copy Image left no image/png flavour on the clipboard`. All 71 wl-paste readings are identical and list text types only, including every reading around the Copy Image step:
   ```
   10:33:24.883 text/plain text/plain;charset=utf-8
   10:33:25.090 text/plain text/plain;charset=utf-8
   10:33:25.297 text/plain text/plain;charset=utf-8
   10:33:25.504 text/plain text/plain;charset=utf-8
   10:33:25.712 text/plain text/plain;charset=utf-8
   ```
   These readings say nothing about the product: a `--headless` Gecko uses `HeadlessClipboard`, an in-process store that never reaches the Wayland clipboard. `upstream/widget/headless/HeadlessClipboard.cpp:44-47` skips every flavour except `text/plain` and `text/html` when it stores a transferable.
2. Headed run (`PB_LIVE_HEADED=1`, with and without the wl-paste loop, and with the shell raised every 1.5 s): `menu-edit: FAIL -- broken instrument: the /tools page is not shown` all three times, before the Copy Image step. 380 wl-paste readings, text types only, none attributable to the product. The loop did not cause this failure, since the run without the loop failed the same way.

Inference: `cmd_copyImage` defaults to `COPY_IMAGE_DATA | COPY_IMAGE_HTML` in one transferable. The text/html half arrives (35-UAT test 6: "Copy Image leaves only text/html on the clipboard"), so the command runs. The headless clipboard then drops the image half by design. The failing assertion `hasDataMatchingFlavors(['image/png'])` therefore measures the headless widget, not the product.

What 39-05 must do: confirm with a headed observation before calling C24 fixed. That needs the headed overlay to show, which is the new finding below.

New finding (for 39-05 and 39-15): in a headed session the web-tab overlay never reaches `style.visibility === 'visible'` (`openPage` in `verify-page-furniture-live.mjs`), even with the shell raised and active. Real-input rows that need a page on screen depend on this.

## Full run

- Commit: `04938fcde64653a217d976f9fc7f02f32e716388` (`git rev-parse HEAD` when the run started)
- Command: `PB_NG_ALLOW_DIRTY=1 nix develop .#theia --command scripts/verify-platform.sh` (sandbox off; tracked dirt was only `.claude/settings.json` and `.planning/state.json`, so the dirty-tree rule allowed the flag)
- Start: 2026-11-05T18:39:00Z
- Runtime: 11550 s (3 h 12 min). This answers assumption A8: a `--gate` run, which is the same set, takes about the same time in one session.
- Result: exit 1; 448 PASS, 40 FAIL
- Reruns: each FAIL label once with `scripts/verify-platform.sh --only <label>` (4387 s in total). 39 stayed red; one passed (see `flaky:`).
- `--gate` at this commit (computed from the plain run): FAIL. None of the 40 labels is excused. `verify-endpoints` and `branding-variant-divergence` passed. `verify-branding-identity-release` failed, and its exclusion is keyed on ledger 10, which is `fixed`, so the gate would report "exclusion no longer applies".
- Listed defects not red in this run: C11 (999.10), 999.5, 999.6, 999.11, 999.13, 999.14, 999.15, 999.16. Each has its own scenario or plant in its owning plan, and its absence here does not close it.
- `real-input-gate-self-test` (new in this plan) PASSED inside the full run.

| label | class | evidence | owning plan |
|-------|-------|----------|-------------|
| page-furniture-live | listed:C22+C23+C24 | `tooltip-status: FAIL -- page tooltip did not open with "Furniture tooltip" within 3 s`; `menu-edit: FAIL -- Copy Image left no image/png flavour on the clipboard`; `saved-login: FAIL -- no autocomplete popup opened on the username field` (16 of 19 scenarios PASS) | 39-05 (C22, C24), 39-06 (C23) |
| page-furniture-live-self-test | listed:C22+C23+C24 | `the clean control is not green: tooltip-status ... menu-edit: Copy Image left no imag...` | 39-05, 39-06 |
| address-bar-live | listed:999.4 | `bookmarks-toolbar: FAIL -- broken instrument: the session tab's page could not be focused` | 39-08 |
| address-bar-live-self-test | listed:999.4 | `the clean control is not green: bookmarks-toolbar: the chevron menu must list exactly the hidden items [...]` | 39-08 |
| prompts-live | prompt-03-deferred | `dialog-probe: FAIL -- stock dialog blocks the IDE`; `dialog: FAIL -- IDE push traffic stopped while dialog open`; also `sharing: FAIL -- screen share was not granted through the stock Allow` (listed:999.12) | 39-10 (dialog, dialog-probe), 39-09 (sharing, 999.12) |
| prompts-live-self-test | listed:999.12 | `the clean control for sharing is red: screen share was not granted through the stock Allow` | 39-09 |
| site-identity-live | new | `app-menu: FAIL -- the Organising menu disabled rows are [f,f,f,f,t,t,t,t,f,...], want all false`; `app-menu: FAIL -- the Help row did not open its stock page (no stock window shows about:support)` | 39-18 |
| site-identity-live-self-test | new | `the clean control is not green: app-menu: the Organising menu disabled rows are [...]` | 39-18 |
| tel06-error-delivery-live | environment | `the working tree is dirty (2 tracked change(s), first: M .claude/settings.json); the drill rewrites a tracked file and rebuilds over the tree` | 39-18 |
| verify-customize-inert | new | `state 1 (absent) vs state 3 (styled) -- pixels identical, the CSS layer had no effect` | 39-18 |
| verify-branding-identity-release | gate-exclusion-stale | `FAIL application-ini -- Name="powerbrowser" (expected "powerbrowser"), Vendor="DeBIOS" (expected "Deocracy")`: `objdir-release/` predates the vendor rename; exclusion keyed on fixed ledger 10 | 39-18 |
| mar-update-hop | environment | `hop.json is missing required key "served". Next step: re-run the hop procedure` (the N-plus-1 MAR is not built; ledger 24) | 39-18 |
| ng063-packaged-launch | environment | `expected exactly one objdir-release/dist/*-153.5.0.en-US.linux-x86_64.tar.xz, found 0` | 39-18 |
| portable-elf | environment | `no container-built tarball: expected exactly one objdir-release/dist/*-153.5.0...tar.xz, found 0` | 39-18 |
| sidecar-no-symlinks | environment | `no container-built tarball ... found 0` | 39-18 |
| package-target-natives | environment | `no container-built tarball ... found 0` | 39-18 |
| packaged-identity | environment | `no container-built tarball ... found 0` | 39-18 |
| install-matrix | environment | `no release tarball: expected exactly one ...tar.xz, found 0` | 39-18 |
| ng065-mar-signature-enforced | environment | `expected exactly one ...tar.xz, found 0` | 39-18 |
| ng072-policies-packaged-webextension | environment | `expected exactly one ...tar.xz, found 0` | 39-18 |
| search-engines-packaged | environment | `harness: expected exactly one ...tar.xz, found 0` | 39-18 |
| ng074-ci-green-on-main | environment | `no verify.yml run exists for main at 04938fcd... -- push main (Chris) and wait for the run` | 39-18 |
| ng089-uat-sheets | new | `.planning/milestones/v1.2-phases/10-sign-off-closeout/10-UAT.md: test 2: result pending` | 39-18 |
| shell01-theia-is-the-window | new | `SHELL-01 -- powerbrowser/shell/powerbrowser.xhtml contains forbidden custom-chrome string 'tabbrowser'` | 39-18 |
| start-failure-shows-error | new | `MIG-04 -- the failing settings-folder step did not name itself in its diagnostics rows (Failed step = 'waiting for the backend's readiness announcement')` | 39-18 |
| pan04-undo-close-group-live | new | `(g) after the commit focus is on pb-org-new theia-button with 0 Undo controls left, want New Group and none` | 39-18 |
| ng-018-scheduled-integrity-check | new | `the store rebuilt after the scheduled check is not at the head` (rerun PASSED: flaky) | 39-18 |
| ng-023-suggestions-history-bookmarks | new | `an open tab ranks below a history or bookmark match` | 39-18 |
| first-boot-surface-fresh | new | `1 error(s) recorded from document start up to the forced error: TypeError: can't access property "offsetHeight", additionalViewsMenu is null` | 39-18 |
| macos-package-payload | environment | `.mozbuild/macos-package is absent, so the universal macOS payload is unproven` (macOS deferred to v1.7, R4) | 39-18 |
| macos-install-matrix | environment | `0 problem(s) and 25 unobserved item(s) in the matrix record` | 39-18 |
| repo-controls | environment | `78 problem(s) between .github/settings/ and the live state of Deocracy/powerbrowser` (network and live GitHub state) | 39-18 |
| channel-live | environment | `GET repos/Deocracy/powerbrowser/releases/latest found no published Release` | 39-18 |
| updates-repo-static | environment | `gh: Git Repository is empty. (HTTP 409)` for Deocracy/powerbrowser-updates | 39-18 |
| website-publish-ready | environment | `3 placeholder(s) remain in website-staging/ (the website push must wait for them)` (owner-supplied values) | 39-18 |
| codeberg-mirror-live | environment | `the Codeberg mirror slug is not declared (got '')` (owner input at the 53-04 checkpoint) | 39-18 |
| upptime-sweep-live | environment | `the Upptime status repository is not declared (got '')` (owner input at the 53-04 checkpoint) | 39-18 |
| win-matrix-record | environment | `scripts/matrix/win-matrix-record.json is absent. Next step: run the matrix at the 54-04 owner checkpoint` | 39-18 |
| win-download-copy | environment | `https://powerbrowser.org/download.html: fetch failed` | 39-18 |
| win-sign-chain | environment | `https://powerbrowser.org/download.html: fetch failed` | 39-18 |

flaky: ng-018-scheduled-integrity-check

Class counts: listed 5, prompt-03-deferred 1, gate-exclusion-stale 1, environment 23, new 10.

## Final run

Plan 39-19, after every fix plan (39-02 to 39-18). Logs under `${TMPDIR:-/tmp}/pb-39-19/` (`pb-39-final` links to it), not committed.

- **Full run:** commit `6ac27ac2b2e8abec1d009b8e95429564735f3398`, started 2026-11-07T05:30:12Z, `flock <pb-headed.lock> PB_NG_ALLOW_DIRTY=1 nix develop .#theia --command scripts/verify-platform.sh` (sandbox off; tracked dirt only `.claude/settings.json` and `.planning/state.json`). Runtime 13372 s (3 h 43 min). Exit 1: **452 PASS, 36 FAIL**.
- **Reruns:** each red without a fixed known cause once with `--only` (10 labels); the three that went green ran a third time. Flaky by the two-of-three rule: `ng067-frontend-errors-reach-telemetry` (red 1 of 3), `page-furniture-live-self-test` (red 1 of 3). `prompts-live-self-test` was red 2 of 3 (3 of 4 counting the gate), so it is a defect, not a flake.
- **Path 2:** `objdir-release/` predated the vendor rename and the 153.5.1 pin (Version=153.5.0, Vendor=DeBIOS). Rebuilt with `POWERBROWSER_OBJDIR=objdir-release POWERBROWSER_BRANDING=powerbrowser/branding-generated/release MOZCONFIG=../.mozconfig ./mach clobber && ./mach build` in `nix develop .#firefox`: 1429 s (23 min 49 s), application.ini now `Vendor=Deocracy Name=powerbrowser Version=153.5.1 BuildID=20261107024043`. The incremental attempt stopped at once on the "Merge day clobber 2026-09-24" CLOBBER notice. `verify-branding-identity-release` then PASSED alone.
- **Path 1 (harness):** `shell01-theia-is-the-window` read 35-07's stock stylesheet href `chrome://browser/skin/tabbrowser/fullscreen-and-pointerlock.css` as custom chrome; the static scan now skips `chrome://browser/skin/` hrefs (02570bcd) and the row PASSED alone.
- **Path 3:** every other red is keyed in `GATE_KNOWN_OPEN_EXCLUSIONS` to an open WINDOWS.md entry with repro, cause so far and source (entries 25, 28, 29 and the new 30-43), and has a ROADMAP backlog row (999.17, 999.27-999.32). The rows keyed to fixed entries 5 and 10 were removed.
- **--gate:** commit `77e5d0372b447272e8a0317e1fabf7b53e75ef32`, started 2026-11-07T10:41:54Z, same command with `--gate`. Runtime 13410 s. 456 PASS, 32 FAIL, all 32 excluded. Verdict line:

```
verify-platform: --gate PASS-WITH-EXCLUSIONS -- commit 77e5d0372b447272e8a0317e1fabf7b53e75ef32 -- 32 named known-open exclusion(s)
```

- `page-furniture-live` PASSED in both runs. `page-furniture-live-self-test` PASSED in the gate run and in 2 of 3 runs before it (red in the full run, ledger 43).
- EXT-01 (`extension-pins`, `extension-pins-self-test`), EXT-02 (`verify-downstream-fixtures`, its self-test) and EXT-03 (`webextensions`, its self-test, `ng073-declared-extension-loads`) PASSED in both runs.

| label | baseline | final | path |
|-------|----------|-------|------|
| page-furniture-live | FAIL | PASS | fixed (39-05, 39-06) |
| page-furniture-live-self-test | FAIL | FAIL, rerun PASS PASS, gate PASS | flaky, ledger 43 |
| address-bar-live | FAIL | PASS | fixed (39-08) |
| address-bar-live-self-test | FAIL | FAIL | expected, ledger 25 (ctrl-d-everywhere), 999.27 |
| prompts-live | FAIL | PASS | sharing fixed (39-09); dialog rows skipped by derivation, ledger 26, 999.3 |
| prompts-live-self-test | FAIL | FAIL, rerun PASS FAIL, gate FAIL | defect (allow-loads-frame-url plant), ledger 39, 999.30 |
| site-identity-live | FAIL | FAIL, rerun FAIL | defect (app-menu), ledger 40, 999.31 |
| site-identity-live-self-test | FAIL | FAIL | same cause (clean control app-menu), ledger 40 |
| tel06-error-delivery-live | FAIL | FAIL | environment (foreign dirty tree), ledger 33, 999.32 |
| verify-customize-inert | FAIL | FAIL, rerun FAIL | defect, ledger 34, 999.31 |
| verify-branding-identity-release | FAIL | FAIL, after rebuild PASS, gate PASS | path 2, objdir-release rebuilt (1429 s) |
| mar-update-hop | FAIL | FAIL | owner step, ledger 30, 999.32 |
| ng063-packaged-launch | FAIL | FAIL | owner step (container tarball), ledger 30 |
| portable-elf | FAIL | FAIL | ledger 30 |
| sidecar-no-symlinks | FAIL | FAIL | ledger 30 |
| package-target-natives | FAIL | FAIL | ledger 30 |
| packaged-identity | FAIL | FAIL | ledger 30 |
| install-matrix | FAIL | FAIL | ledger 30 |
| ng065-mar-signature-enforced | FAIL | FAIL | ledger 30 |
| ng072-policies-packaged-webextension | FAIL | FAIL | ledger 30 |
| search-engines-packaged | FAIL | FAIL | ledger 30 |
| ng074-ci-green-on-main | FAIL | FAIL | owner push, ledger 31, 999.32 |
| ng089-uat-sheets | FAIL | FAIL | owner-deferred NG-084 UAT pass, ledger 35, 999.32 |
| shell01-theia-is-the-window | FAIL | FAIL, after fix PASS, gate PASS | path 1, harness fix 02570bcd |
| start-failure-shows-error | FAIL | FAIL, rerun FAIL | defect, ledger 36, 999.31 |
| pan04-undo-close-group-live | FAIL | FAIL, rerun FAIL | defect (harness or product), ledger 37, 999.31 |
| ng-018-scheduled-integrity-check | FAIL (flaky) | PASS | baseline flake; PASS in both final runs |
| ng-023-suggestions-history-bookmarks | FAIL | FAIL, rerun FAIL | defect, ledger 38, 999.31 |
| first-boot-surface-fresh | FAIL | FAIL, rerun FAIL | defect, ledger 41, 999.31 |
| macos-package-payload | FAIL | FAIL | macOS deferred to v1.7 (R4), ledger 32 |
| macos-install-matrix | FAIL | FAIL | ledger 32 |
| repo-controls | FAIL (78 problems) | FAIL (5 problems) | owner state, ledger 31 |
| channel-live | FAIL | FAIL | no published Release, ledger 31 |
| updates-repo-static | FAIL | PASS | environment changed (updates repo no longer empty) |
| website-publish-ready | FAIL | PASS | environment changed (placeholders filled) |
| codeberg-mirror-live | FAIL | FAIL | slug undeclared, ledger 31 |
| upptime-sweep-live | FAIL | FAIL | slug undeclared, ledger 31 |
| win-matrix-record | FAIL | FAIL | record absent, ledger 31 |
| win-download-copy | FAIL (fetch failed) | FAIL (record absent) | ledger 31 |
| win-sign-chain | FAIL | PASS | environment changed (site reachable) |
| ng067-frontend-errors-reach-telemetry | PASS | FAIL, rerun PASS PASS, gate PASS | flaky, ledger 42, 999.30 |
| extension-actions-live | PASS (session 2 added later in 39-13) | FAIL | expected, private-access session 2, ledger 29, 999.17 |
| extension-actions-live-self-test | PASS | FAIL | same control, ledger 29 |
| page-tools-live | PASS | PASS | no red; pre-emptive exclusion for the crash-navigate flake, ledger 28, 999.29 |

Class counts for the 36 reds of the final full run: fixed in 39-19 2 (path 1, path 2), expected-documented 3 (ledger 25, 29), flaky with rerun evidence 2, defect with ledger entry and backlog row 8, owner or environment step 21. Baseline reds green in the final run: 7 (3 fixed by fix plans, 3 environment changes, the ng-018 flake).
