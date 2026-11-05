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
