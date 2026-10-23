# Phase 32: Page Tools - Pattern Map

**Mapped:** 2026-10-22
**Files analyzed:** 19 (new 3, modified 16)
**Analogs found:** 19 / 19

All analogs below are git-tracked. The file list is taken from the 32-RESEARCH.md file map; the verbatim line anchors listed under "Verified In-Repo Values" in 32-RESEARCH.md still apply and are not repeated here.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match |
|---|---|---|---|---|
| `powerbrowser/shell/PowerBrowserAPI.sys.mjs` (end-of-file web-tab section grows; `WEB_TAB_ACTION_KINDS`, `handleWebTabAction`, `webTabPush`, `scheduleWebTabState`) | service (privileged boundary) | request-response + push | same file, Phase 27 section :4079+ and Phase 29 search area; `webTabStop` arm :4131-4142, `webTabHistory` :4148-4174, `webTabGotoIndex` :4175-4189 | exact |
| `powerbrowser/INTERNAL-APIS.md` (+ rows) | doc/catalogue | — | rows :28-141; `verify-ng-040-... --fix` | exact |
| `powerbrowser/shell/powerbrowser.js` (`PAGE_KEYS` additions, overlay listener discipline) | config/bootstrap | event-driven | same file, `<keyset>`/`<key>` block :305-333, F6 reply listener :403-434 | exact |
| `theia/extensions/tab-uris/src/browser/web-tab.ts` (union + state + widget methods) | service (channel) | request-response + push | same file, `WebTabMessage` :172-184, `WebTabChannel` :283-309, `reload()`/`history()`/`gotoIndex()` :580-610 | exact |
| `theia/extensions/tab-uris/src/browser/chrome-store-client.ts` | client | request-response | `placesFavicons`, `savePageCopy` (lines 130-142) — read-only unless a new Places-backed read appears | exact |
| `theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx` (find bar, zoom chip, downloads button/panel, reader toggle, crash reload) | component | event-driven | itself; history menu `openHistoryMenu` (Phase 27 pattern); pill commit path (Phase 29) | exact |
| `theia/extensions/chrome-bar/src/browser/chrome-bar-commands.ts` (command-per-action) | config | — | same file, Back/Forward/Reload/NewTab, `Browser` category, `currentWebTab()` | exact |
| `theia/extensions/chrome-bar/src/browser/chrome-bar-keybindings.ts` (page-focus scope) | config | — | same file + `ADDRESS_FOCUSED_CONTEXT_KEY`, F6/WR-02 passthrough | exact |
| `theia/extensions/chrome-bar/src/browser/chrome-bar-shortcuts.ts` (`PAGE_SHORTCUTS` additions) | utility + contribution | event-driven | whole file; `PAGE_SHORTCUTS` :36-64, relay rule :195-226, "no privileged kind (T-27-19)" :126-129 | exact |
| `theia/extensions/chrome-bar/src/browser/chrome-bar-copy.ts` (new strings) | config (copy) | — | `CHROME_BAR_COPY` + `appSubject()` | exact |
| `theia/extensions/chrome-bar/src/browser/chrome-bar.css` (find-bar/dropdown/panel rules) | style | — | existing pill/dropdown rules, 40px bar, 32×32 buttons | exact |
| `theia/extensions/chrome-bar/src/browser/tab-strip-widget.tsx` (favicon/audio marks) | component | event-driven | existing `render()` order | exact (self) |
| `theia/extensions/chrome-bar/src/browser/chrome-bar-frontend-module.ts` (static binds) | config (DI) | — | same file :71-109 (D-50) | exact |
| `scripts/verify-page-tools-find.mjs` NEW (static gate) | test | derive-compare | `scripts/verify-web-tab-bridge.mjs` rule 11/12 | exact |
| `scripts/verify-page-tools-zoom-mute.mjs` NEW | test | derive-compare | same | exact |
| `scripts/verify-page-tools-print-save.mjs` NEW | test | derive-compare | same + `verify-token-cookie-strip.mjs` (absence shape) | role-match |
| `scripts/verify-page-tools-downloads.mjs` NEW | test | derive-compare | same + `verify-webextensions.mjs` (lifecycle) | role-match |
| `scripts/verify-page-tools-edit.mjs` NEW | test | derive-compare | same (frozen literal set) | exact |
| `scripts/verify-page-tools-reader-crash.mjs` NEW | test | derive-compare | same (scheme-wall shape) | exact |
| `scripts/verify-page-tools-live.mjs` NEW (live BiDi) | test (live) | event-driven | `scripts/verify-nav-keys-live.mjs` + `scripts/verify-address-bar-live.mjs` + `scripts/lib/pb-live-probe.mjs` | exact |
| `scripts/verify-web-tab-bridge.mjs` (+ KIND_CLASSES growth) | test | derive-compare | its rule 11/12 | exact (self) |
| `scripts/verify-shell-error-copy.mjs` (+ pins) | test | derive-compare | `EXPECTED_WIDGET_COPY`, `EXPECTED_NAV_COPY` | exact (self) |
| `scripts/verify-shortcut-relay.mjs` (+ rows) | test | derive-compare | `PAGE_KEYS`↔`PAGE_SHORTCUTS` set equality | exact (self) |
| `scripts/verify-platform.sh` (registry rows) | config (registry) | — | lines ~3796 (quick) and live block | exact |

## Pattern Assignments

### `PowerBrowserAPI.sys.mjs` web-tab kinds (service, request-response + push)

Grow the end-of-file web-tab section downward (after `PowerBrowserWebTabs`), so no catalogued line above moves. One routing line per kind, beside the Phase 27 arms. Copy the `webTabStop` arm shape (`:4131-4142`):

```js
case "webTabFind": {
  if (!webTabIdIsValid(data.tabId)) {
    return { ok: false, reason: "validation", message: "handleWebTabAction: refusing malformed tabId" };
  }
  return { ok: true, kind, ...PowerBrowserAPI.webTabFind(data.tabId, data) };
}
```

Validation shape per kind (Pitfall 7; D-43):
- `webTabFind`: `query` non-empty string with length cap, booleans defaulted chrome-side; overlay from `webTabs` map, never a frontend browser reference.
- `webTabZoomIn/Out/Reset` or `webTabZoom{value?}`: finite number clamped chrome-side to `zoomValues` MIN..MAX; Ctrl+0 path sets `1`.
- `webTabMute{muted}`: explicit boolean (not a toggle); overlay derived by `tabId`.
- `webTabPrint{selectionOnly?,frameOnly?}`: booleans only; no URL/pref input.
- `webTabEdit{cmd}`: `cmd` must be in the frozen literal set (`cmd_undo/redo/cut/copy/paste/pasteNoFormatting/selectAll/delete`); `isCommandEnabled`-guarded.
- `webTabViewSource{tabId,outerWindowID?,lineNumber?}`: inner URL validated http(s)/file chrome-side; Theia wall stays http(s)+`about:blank`.
- Downloads actions: `{id, action: 'cancel'|'launch'|'showContainingDirectory'|'remove'|'retry'}`; `launch`/`showContainingDirectory` stay chrome-side.

Sender walls (`groupSenderIsTheia` at the top of `handleWebTabAction`, `webTabIdIsValid` per kind) are module-level and reachable from the end-of-file section. After EVERY boundary edit run `node scripts/verify-ng-040-internals-catalogue-lines.mjs --fix`, then `bash scripts/check-internals-boundary.sh --catalogue`, and append one Touchpoints row per new forbidden-pattern line (append-only rule).

### `webTabPush` widening (service, push)

Copy `webTabPush` (`:3388-3404`, try/catch + `PowerBrowserAPI.log("error", …)`, primitives only) and `scheduleWebTabState` coalescer (`:4247-4263`). Read the new fields live off the overlay like URL/title today:

```js
{ kind: "state", tabId, url, title, loading, canGoBack, canGoForward,
  zoom: entry.browser.fullZoom, audioMuted: entry.browser.audioMuted,
  soundPlaying, favicon, crashed, ... }
```

Primitives/small enums only (D-29) — never prefs, tokens or objects. Zoom rides the same push as URL (Pitfall 5 item 3). `soundPlaying` is derived chrome-side (event + flag; `audioPlaybackStarted` is suppressed while muted). Favicon is bounded `data:image/` (64 KiB cap, `safeIcon` precedent); this phase consumes the Phase 31.1 tab-host icon fields via the push + Places reads — it never re-derives the `LinkHandlerParent` path. Listener discipline copies `pagetitlechanged` (`:3350-3359`, removed at `:3491`): `addEventListener` on each overlay at creation (`DOMAudioPlaybackStarted/Stopped`), fanned out via `sendWebTabPush` (`:4207-4215`). Crash is signalled by ONE `oop-browser-crashed` addEventListener per overlay at creation (fires on the element itself — `nsFrameLoader.cpp:3717/3728/3736`, dispatched `:3765`) + the CONTRACTED Theia crash UI over the overlay (N3/D-25e — never `displayLoadError` on the crashed overlay, never the stock copy beside it).

### `web-tab.ts` union + state + widget methods (channel)

Analog `reload()`/`history()`/`gotoIndex()` (`:580-610`). Add union members; update the count comment. The bridge gate derives from this union.

```typescript
| { kind: 'webTabFind'; tabId: string; query: string; caseSensitive?: boolean; entireWord?: boolean; highlightAll?: boolean }
| { kind: 'webTabFindNext'; tabId: string; backwards?: boolean }
| { kind: 'webTabFindClose'; tabId: string }
| { kind: 'webTabZoomIn'; tabId: string }
| { kind: 'webTabMute'; tabId: string; muted: boolean }
// … print / downloads / save / edit / reader / source / crash kinds, same shape
```

`WebTabState` gains the pushed fields (`zoom`, `soundPlaying`, `audioMuted`, `favicon`, `crashed`, find counts). `applyState` renders chip/marks from the push; the chip never reads prefs. Use `channel.request` when the reply decides UI (find/next/close, zoom, mute, edit, print), `channel.send` for fire-and-forget (`webTabStop` precedent :662-664). New pushes subscribe via `onPush(kind, handler)` — never edit the router (`:326-338`). Unknown-tab folds through `settle`/`settleUnknownTab` (`:644-655`).

### `chrome-bar-widget.tsx` composition (component)

Analog `openHistoryMenu` (build a `CompoundMenuNode` inline, `menus.render({ menuPath, menu, anchor, context, includeAnchorArg: false, onHide })`, module-level `MenuPath` const, disabled rows `isEnabled: () => false`, focus restore in `onHide` via `setTimeout`). Composition order per 32-UI-SPEC: pill gains zoom-chip slot + reader toggle; downloads button + panel beside the mode toggle; find bar docks above the page region (page rect shrinks — granted exception); crash reload affordance in tab/strip. Every async reply checks `dropdownArmed` and the sequence number, as `runQuery` does. No `row.uri` reads outside React keys; no engine host/name literals.

### `chrome-bar-shortcuts.ts` + `powerbrowser.js` relay (config)

Analog whole file. New `PAGE_SHORTCUTS` rows mirror `PAGE_KEYS` row-for-row (header :4-7): Ctrl+F/F3/Shift+F3 (find), Ctrl+plus/minus/0 (zoom), Ctrl+P (print), Ctrl+S (save), Ctrl+M (mute), Ctrl+U (source), F12 (devtools). Page-focus scope only (`powerbrowser.webTabActive`/pill-focus when-clauses; F6 reply-listener precedent). Actions run only against `channel.widgetOf(tabId)` (push-only-the-pushed-tab rule :195-226). Privileged follow-ups stay widget-handler-only, never bare command ids (T-27-19 shape).

### `chrome-bar-copy.ts` (config)

Every new string lives in `CHROME_BAR_COPY` as a literal or `appSubject()` function; engine names are never literals. The pins in `scripts/verify-shell-error-copy.mjs` (`EXPECTED_WIDGET_COPY`, `EXPECTED_NAV_COPY`) move in the same commit as the copy. No internal identifier in user-facing text (kind name, pref key, actor name, port, timeout, raw exception).

### `scripts/verify-page-tools-*.mjs` (static gates, `--self-test`)

Analog `scripts/verify-web-tab-bridge.mjs` rules 11/12 and `scripts/verify-chrome-bar-suggestions.mjs` (`selfTest` 501+). Constants: `REPO_ROOT`, `NAME`, `*_REL` paths. Entry `main()` dispatches `--self-test`. `selfTest()` first requires the clean tree green, scopes each plant to the derived body, fails when a plant did not apply, and requires the target to go red naming the drift. Each gate: derive the kind set from `handleWebTabAction` + `WEB_TAB_ACTION_KINDS` and compare with the `WebTabMessage` union as set equality; surplus and missing each fail by name; plus one family-specific assertion (find copy rows; chip-never-reads-prefs; no `getTabDialogBox`/`_openTabModalPrint`/browserDOMWindow shim; no `DownloadsPanel`; frozen edit literals; no `view-source:` literal in Theia). Relay rows (`PAGE_KEYS`/`PAGE_SHORTCUTS`) are asserted only by `verify-shortcut-relay.mjs` (Task 3's gate) — no family gate names them.

### `scripts/verify-page-tools-live.mjs` (live BiDi)

Analog `scripts/verify-nav-keys-live.mjs` + `scripts/verify-address-bar-live.mjs`. Structure: `SCENARIOS` map, `PLANTS` array of `{ plant, target, run, expect }`, `--scenario a,b` selection, `CONTROL_OF` ordering, `selfTest` requiring green clean control + red-on-plant naming `expect`. Helpers from `scripts/lib/pb-live-probe.mjs`: `withProbeShell`, `installPushRecorder`, `openWebTab`, `inChrome`, `focusOverlay`, `focusTheiaFrame`, `pressKey`, `serveNavPages`. One served fixture set: multi-frame page (find counts), media page (audio), download endpoint (no-silent-save + request log), reader article + non-article, five same-site tabs on one origin (remoteness regression), scratch overlay loading `about:crashcontent` (crash, closed after the verdict — never a `window.print()` fixture, D-09a). Probes 4/6/9 run first as scenarios `downloads-today`, `print-today`, `edit-today`, each recorded as a probe verdict before its build plan.

### `scripts/verify-web-tab-bridge.mjs` KIND_CLASSES growth

Copy rule 11/12: `diff(derived, [...MAP.keys()])` surplus + missing + unknown-class check. Every new `webTab*` arm gets exactly one class: find/zoom/print/save-pick/save-export/edit/reader/view-source/devtools → `tab-navigation`; mute/downloads-subscribe/downloads-action → `selection` (per-tab content/tool state beside `webTabActivated`). Privileged stays empty (no plan adds the first privileged action here). Store-kind rule unchanged (no new store kinds — tab-host members ride the state push; STORE_KIND_CLASSES untouched).

## Shared Patterns

- **End-of-file boundary sections.** Source: `PowerBrowserAPI.sys.mjs:4079-4091` (Phase 27) + Phase 29 search area. All chrome-side additions grow downward.
- **Refusal message convention.** `"<function>: refusing ..."`, `{ ok:false, reason:"validation", message }`, never echo a URL, title, path or foreign error text.
- **Registry rows.** In `verify-platform.sh`, each gate gets a `label|cmd` row and a `label-self-test|cmd --self-test` row. Quick block ≈3796, live block after nav-keys-live/address-bar-live rows.
- **Brand-neutral copy.** `CHROME_BAR_COPY` + `appSubject()`; pins move in the same commit.
- **Stage before scanning.** `git add` new files by explicit path before `node scripts/scan-brand-residue.mjs` (`git ls-files` visibility trap).
- **Static binds (D-50).** New widgets/contributions bind at module load in `chrome-bar-frontend-module.ts`, beside the existing binds.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `scripts/verify-page-tools-downloads.mjs` view-lifecycle half | test | derive-compare on `addView`/`removeView` + serialized row fields | No existing gate derives a `Downloads` view lifecycle; use the `DownloadList.sys.mjs:247/269` anchors in 32-RESEARCH.md Pattern 7. |
| `scripts/verify-page-tools-live.mjs` probe-first shape | test (live) | probe verdicts EXECUTED in 32-01 and read from `scripts/lib/pb-probe-verdicts.json` by 32-03/32-04/32-06 | No existing live script runs research probes as scenarios before build scenarios; use `CONTROL_OF` ordering (`downloads-today`/`print-today`/`edit-today` before `panel`/`dialog`/`edit-ui`); verdict file created in 32-01 Task 2, read as the first step of each probe-gated build task. |

## Metadata

**Search scope:** `powerbrowser/shell`, `scripts`, `scripts/lib`, `theia/extensions/{chrome-bar,tab-uris}/src/browser`
**Files scanned:** 19
**Date:** 2026-10-22

## PATTERN MAPPING COMPLETE
