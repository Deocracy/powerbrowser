---
phase: "33"
slug: "bookmarks-history-and-the-full-menu"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-10-22"
---

# Phase 33 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Source: `33-RESEARCH.md` § Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Plain-node derive-and-compare scripts plus BiDi live scripts on `scripts/lib/pb-live-probe.mjs`, one driver: `scripts/verify-platform.sh` |
| **Config file** | The registry inside `scripts/verify-platform.sh` (quick block for `--quick`; the live block for full runs) |
| **Quick run command** | `scripts/verify-platform.sh --quick` |
| **Full suite command** | `scripts/verify-platform.sh` (needs the built binary and the last Theia app build) |
| **Estimated runtime** | ~90 seconds quick; live rows add minutes (one probe-shell session takes about 40 s) |

Proof tiers: **S** is a static gate (`--quick`, with `--self-test`). **L** is the live built shell with `-purgecaches` (`withProbeShell`, `MOZ_PURGE_CACHES=1`), page-realm `probe()`, and TIP keys.

---

## Per-Task Verification Map

This map is at requirement level. Plans bind task IDs to these rows.

| Requirement | Behavior | Threat Ref | Tier | Automated Command | File Exists | Status |
|-------------|----------|------------|------|-------------------|-------------|--------|
| BMK-01 | Star at pill right end, outline/filled by `readBookmarkByUrl` for active URL; Ctrl+D toggles from pill/widget handler only; filled state visible in Coding/Browsing/Organising | T-33-01 | S + L | `verify-web-tab-bridge.mjs` (rule 12 classes) + `verify-address-bar-live.mjs --scenario bookmark-star` | ❌ W0 | ⬜ pending |
| BMK-02 | Star popover edits name/folder or removes; Remove unbookmarks; Esc/Done closes and focus returns to star; failure row on refused write | T-33-01 | S + L | `verify-shell-error-copy.mjs` (copy pins) + `--scenario bookmark-editor` | ❌ W0 | ⬜ pending |
| BMK-03 | Ctrl+Shift+T reopens most-recently-closed row in new web tab with back/forward history via `shellArmWebTabHistory`; empty closed set is a no-op | T-33-02 | L | `--scenario reopen-closed` | ❌ W0 | ⬜ pending |
| BMK-04 | `browser.showBookmarksToolbar` shows collapsible row in every mode; rows equal `listBookmarkFolder('toolbar')`; Places bookmark observer push refreshes without reload | T-33-03 | S + L | `verify-web-tab-bridge.mjs` (rule 12 classes + push-kind parity for `bookmarks-changed`) + `--scenario bookmarks-toolbar` | ❌ W0 | ⬜ pending |
| BMK-05 | One `clearHistory` kind fans out to Places range clear + closed-row delete + thumbnails + saved pages + web-tab history; open rows survive; token cookie exempt; five ranges | T-33-04 | S + L | `node scripts/verify-clear-history.mjs` (+ `--self-test`) + `--scenario clear-history` | ❌ W0 | ⬜ pending |
| BMK-06 | History submenu sections Recent pages + Recently closed tabs; per-request build; reopen row restores; no second chrome-bar button | — | L | `--scenario history-menu` | ❌ W0 | ⬜ pending |
| MENU-03 | Hamburger carries exactly the Firefox-ordered MENU-03 entries (ROADMAP §Phase 33 success criterion 5 at `.planning/ROADMAP.md:378` parsed at check time in `verify-address-bar-modes.mjs` T2 of 33-05, W4; each missing entry fails or records a gap); each runs the same `Browser`-category command id Actions lists; New Window via `openBrowserWindow`/`openStockTab`, no second shell; Full Screen id stable across Phase 35 (`fullScreen` classed `window-chrome`, N1) | T-33-05 | S + L | `verify-chrome-bar-commands.mjs` (+ `--self-test`, EXPECTED grows) + `--scenario app-menu` | ❌ W0 | ⬜ pending |
| SMODE-07 | Actions lists every `Browser` command present at enumeration (missing Phase 32 commands simply absent); row runs command id and nothing else (same-session same-recorder positive control catches a store kind from an action that does send one, B3-leftover); Command centre `MODE_SENDS` row all false and live typing sends zero chrome/network requests (`command-centre-privacy` extended in place — exists at `:3729` with "hello" control + `cc-sends` plant — never a second scenario) | T-33-06 | S + L | `verify-address-bar-modes.mjs` (+ `--self-test`, MODE_SENDS guard) + `--scenario command-centre-privacy,actions-list` | ✅ grows | ⬜ pending |
| KEY ruling | Ctrl+D / Ctrl+Shift+T / Ctrl+Shift+B / Ctrl+Shift+Del work Theia-focused via chrome-bar keybindings AND page-focused via relay rows; browser meaning wins only while page focused | — | S + L | `verify-shortcut-relay.mjs` (+ `--self-test`) + `--scenario bookmark-keys` (created in 33-02 T3 action+verify, W3) | ✅ grows | ⬜ pending |
| all | chrome-bar and tab-uris compile; boundary catalogue rows and lines; brand residue; privileged kinds absent from relay, never a command/key | — | S | `--only chrome-bar-typecheck`, `--only internals-catalogue`, `--only ng-040-internals-catalogue-lines`, `--only scan-brand-residue`, `--only gui02-web-tab-bridge` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

Threat refs:

- **T-33-01:** a Places write reachable outside `PowerBrowserAPI`, or a privileged bookmark kind called from a command/key/relay path.
- **T-33-02:** reopen fabricates history instead of restoring the closed row's session history.
- **T-33-03:** toolbar reads a stale snapshot (no observer push) or shows in one mode only.
- **T-33-04:** clear-history deletes open rows, misses a store, or clears the token cookie (signs the IDE out).
- **T-33-05:** a menu entry runs a different implementation than its Actions twin (two behaviours, one label).
- **T-33-06:** Command centre sends typed text to chrome or an engine; an Actions row reaches a store kind.

---

## Wave 0 Requirements

- [ ] `scripts/verify-clear-history.mjs` (+ `--self-test`): derives the `clearHistory` fan-out targets from `PowerBrowserAPI.sys.mjs` (Places range clear via `PlacesUtils.history.removeVisitsByFilter({beginDate,endDate})` — filter shape verified at `upstream/toolkit/components/places/History.sys.mjs:429-448`, five D-09 ranges map to begin/end Date pairs — + closed-row delete preserving `closed_at IS NULL` + thumbnails + saved pages + web-tab history; never `Sanitizer` at all — its `showUI` needs `gDialogBox` at `upstream/browser/modules/Sanitizer.sys.mjs:124-133`, absent in the `powerbrowser:main` shell which loads no `browser.js`/`browser-init.js`/stock popupsets, and its item prefs are never set there) and the token-cookie exemption (fan-out never enumerates the token host; range literal set exact); carries the BMK-04 observer-install check (install site beside `startTabStoreTriggers`/`installTokenCookieStrip` present, `PlacesUtils.observers`-derived event names `bookmark-added|removed|moved|url-changed` subscribed per `upstream/browser/base/content/browser-places.js:1783-1789`, single install — no second static gate owns it); plants: a dropped target, a token-enumerating fan-out, a removed observer site, each going red naming the drift
- [ ] `scripts/verify-address-bar-live.mjs` new scenarios: `bookmark-star`, `bookmark-editor`, `bookmarks-toolbar`, `reopen-closed`, `history-menu`, `clear-history`, `app-menu`, `actions-list`, `command-centre-privacy` (EXTENDED in place — it already exists at `:3560`/`:4276` with Address-mode "hello" control and plant `cc-sends` at `:4380`; the extension adds the remaining SMODE-07 silent-mode/type-shape asserts, never a second scenario), `bookmark-keys`; each with a `PLANTS` fault that must go red naming its expect; `-purgecaches`, positive controls, no absence assertion without one
- [ ] `scripts/verify-web-tab-bridge.mjs` rule 12: `STORE_KIND_CLASSES` entries for every new kind (`bookmarkPage`/`updateBookmark`/`removeBookmark` privileged, `clearHistory` privileged, `listClosedTabs`/`reopenClosedTab` read) in 33-01, plus `fullScreen` classed `window-chrome` in 33-05 — command-reachable, never relayed — with the rule text recording why `window-chrome` and not `privileged` (command-reachable window chrome state: no Places write, no clipboard read, no off-machine send; the `full-screen` command id MENU-03/D-13/SMODE-07 require Actions to also run would trip the privileged command-named fence at `:495-497`, and `chrome-bar-commands.ts:145-196` is nothing but `registerCommand(` calls); `window-chrome` joins `STORE_KIND_CLASS_NAMES` so the unknown-class check at `:458-462` accepts it; `verify-shell-gbrowser-standin.mjs` needs no edit (enumerates only `gBrowser`-receiver members, never store classes); `window.fullScreen` needs no `FORBIDDEN_PATTERNS` exemption (Phase 27 policy at `scripts/check-internals-boundary.sh:61-62` covers only stock-shell shim globals, and no new global is defined); push-kind parity entry for the `bookmarks-changed` push (`sendWebTabPush`/`sendAsyncMessage` kind vs `WebTabChannel.onPush` subscriber, derived both sides; push target named: the shell window's own Theia frame via `findShellWindow()` at `PowerBrowserAPI.sys.mjs:1003-1004` → `#powerbrowser-content` at `powerbrowser.xhtml:58` / `SHELL_CONTENT_BROWSER_ID` at `PowerBrowserAPI.sys.mjs:287-288`, because the observer fires chrome-side with no actor sender); plants for unclassified / stale / relayed-privileged / called-outside / command-named / chrome-only-push / missing-subscription; the `fullScreen` kind+arm+class+method+plant all land in 33-05 (never classified in 33-01 — the rule-12 stale check `:455-456` fails 33-01's own verify otherwise; 33-05 `files_modified` therefore carries `chrome-store-client.ts` + `verify-web-tab-bridge.mjs`)
- [ ] `scripts/verify-chrome-bar-commands.mjs`: `EXPECTED_IDS`/`EXPECTED_LABELS` grow in the same commit as the MENU-03 commands; derivation stays set-equality with the empty-derivation failure
- [ ] `scripts/verify-shell-error-copy.mjs`: new copy pinned in `EXPECTED_NAV_COPY` (+ toolbar/menu/panel strings)
- [ ] `scripts/verify-shortcut-relay.mjs`: new `PAGE_SHORTCUTS` rows + `powerbrowser.js` parity + Theia-focus twins
- [ ] `scripts/verify-address-bar-modes.mjs`: Actions enumeration guard (rows equal the `Browser` commands present) + `MODE_SENDS` command-centre all-false call-site guard
- [ ] `scripts/verify-platform.sh`: quick rows for `verify-clear-history.mjs` (+ self-test twin); live scenarios ride the existing `address-bar-live` rows

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Star fill, editor popover, toolbar row, clear panel and hamburger order match 33-UI-SPEC (geometry, colours, no accent chip) | BMK-01, BMK-02, BMK-04, BMK-05, MENU-03 | Pixel appearance on KDE Wayland; the gates read DOM and strings, not rendering | Launch the shell, bookmark a page, open the editor, toggle the toolbar, open the History submenu and hamburger; screenshot with the KWin raise and spectacle; compare against `33-UI-SPEC.md` |
| Clear-history range labels and empty-closed-set behaviour read as Firefox-parity | BMK-03, BMK-05 | Copy judgement for Chris | Open the clear panel with no closed tabs; reopen with an empty closed set; confirm the copy |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 90s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
