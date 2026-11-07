# Phase 29: Address Bar Search and Fixup - Pattern Map

**Mapped:** 2026-10-21
**Files analyzed:** 22 (new 5, modified 17)
**Analogs found:** 21 / 22

All analogs below are git-tracked. The file list is taken from the 29-RESEARCH.md file map; the verbatim line anchors listed under "Verified In-Repo Values" in 29-RESEARCH.md still apply and are not repeated here.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match |
|---|---|---|---|---|
| `configuration.toml` (+`[[search_engines]]`) | config | build input | `[[webextensions]]` table, same file | exact |
| `scripts/lib/config-schema.json` | config schema | validate | `webextensions[].*` rows (lines 245-260) | exact |
| `scripts/generate.mjs` (+`emitSearchEngines`, frozen row, `manifestEndpointSources`) | generator | transform | `emitWebExtensionSettings` (lines 1944-2017) | exact |
| `powerbrowser/distribution/policies.json` (+`SearchEngines`) | config | build output fragment | `ExtensionSettings` key (EXT-03) | exact |
| `powerbrowser/endpoint-allowlist.json` | config | allowlist | existing rows with `manifest` field | exact |
| `powerbrowser/shell/PowerBrowserAPI.sys.mjs` (store kinds, search section, cookie strip) | service (boundary) | request-response + event (observer) | store section 3686-3790; Phase 27 section 4079+ | exact |
| `powerbrowser/INTERNAL-APIS.md` | doc/catalogue | — | existing rows; `verify-ng-040-...--fix` | exact |
| `theia/extensions/tab-uris/src/browser/chrome-store-client.ts` (+7 methods) | client | request-response | `searchPlaces`, `savePageCopy` (lines 130-142) | exact |
| `theia/extensions/chrome-bar/src/browser/address-bar-rows.ts` NEW | utility (pure) | transform | none (zero-import module); shape per RESEARCH | no analog |
| `theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx` | component | event-driven | itself; history menu `openHistoryMenu` (lines 480-525) | exact |
| `chrome-bar-places-suggestions.ts` | service | request-response | itself (adds `source`) | exact |
| `chrome-bar-copy.ts` | config (copy) | — | `CHROME_BAR_COPY` + `appSubject()` | exact |
| `chrome-bar-preferences.ts` | config | — | `browser.showHomeButton` / `browser.homePage` (lines 13-33) | exact |
| `chrome-bar.css` | style | — | existing pill/dropdown rules | exact |
| `scripts/verify-search-engines.mjs` NEW | test (static gate) | derive-compare | `scripts/verify-webextensions.mjs` | exact |
| `scripts/verify-address-bar-rows.mjs` NEW | test (unit) | derive-compare | `scripts/verify-chrome-bar-suggestions.mjs` (`selfTest` 501+) | role-match |
| `scripts/verify-token-cookie-strip.mjs` NEW | test (static gate) | derive-compare | `scripts/verify-chrome-bar-suggestions.mjs` | role-match |
| `scripts/verify-address-bar-live.mjs` NEW | test (live BiDi) | event-driven | `scripts/verify-nav-keys-live.mjs` + `scripts/lib/pb-live-probe.mjs` | exact |
| `scripts/verify-web-tab-bridge.mjs` (+rule 12) | test | derive-compare | its rule 11 (lines 376-394) | exact |
| `scripts/verify-shell-error-copy.mjs` | test | derive-compare | `EXPECTED_WIDGET_COPY` (548), `NAV_BRAND_LITERAL` (596) | exact |
| `scripts/verify-platform.sh` (rows) | config (registry) | — | lines 3756-3757 (quick) and 4978-4979 (live) | exact |
| `theia/extensions/tab-uris/src/browser/tab-store-access-protocol.ts` | protocol | — | read only; new kinds must stay out of `TAB_STORE_RELAY_KINDS` | n/a (do not edit) |

## Pattern Assignments

### `PowerBrowserAPI.sys.mjs` store kinds (service, request-response)

Edit `STORE_REQUEST_KINDS` in place (line 3694) and add one `case` per new kind in `handleStoreRequest` that calls a function defined in the new end-of-file section, so no catalogued line moves:

```js
case "searchPlaces": {
  return { ok: true, kind, rows: await searchPlaces(data.text, data.limit) };
}
case "savePageCopy": {
  const saved = await savePageCopy(data.uri);
  return { ok: true, kind, dir: saved.dir, bytes: saved.bytes };
}
```

Argument validation uses `storeUrlArg(value)` (rejects non-string, empty or over 8192 chars) and thrown messages of the form `"<function>: refusing ..."`. These are the only errors the catch block passes back unchanged; any Places/IOUtils error text is withheld. Reply values are plain strings (`String(entry.url)`), because a URL object does not survive structured clone. The walls `groupSenderIsTheia` + `storeSenderInShellWindow` apply automatically.

### `PowerBrowserAPI.sys.mjs` end-of-file "Phase 29: search area" + cookie strip

Analog: header comment and layout of `// Phase 27: the web-tab action section.` (line 4079). Copy its paragraph saying the section sits at the end of the file so INTERNAL-APIS.md line refs stay valid. Use a second `ChromeUtils.defineESModuleGetters(searchLazy, {...})` inside this section. Never add to the top block at line 15. Validation shape to copy from `handleWebTabAction`:

```js
if (!webTabIdIsValid(data.tabId)) {
  return { ok: false, reason: "validation", message: "handleWebTabAction: refusing malformed tabId" };
}
```

After each boundary edit run `node scripts/verify-ng-040-internals-catalogue-lines.mjs --fix` and then `bash scripts/check-internals-boundary.sh --catalogue`.

### `chrome-store-client.ts` (+7 methods)

Analog lines 130-142. Use `field` for a single-field read and `request` + an `ok` check when the call can be refused:

```ts
searchPlaces(text: string, limit: number): Promise<PlaceMatch[]> {
    return this.field<PlaceMatch[]>({ kind: 'searchPlaces', text, limit }, 'rows');
}
async savePageCopy(uri: string): Promise<SavedPageCopy> {
    const reply = await this.request({ kind: 'savePageCopy', uri }, SAVE_PAGE_ACK_TIMEOUT_MS);
    if (!reply.ok) { throw new Error(reply.message ?? `savePageCopy failed (${reply.reason ?? 'store'})`); }
    return { dir: String(reply.dir), bytes: Number(reply.bytes) };
}
```

### `generate.mjs` `emitSearchEngines` (generator, fragment)

Analog `emitWebExtensionSettings` (lines 1944-2017). Copy these parts in order: the doc block ("FRAGMENT, NOT THE WHOLE POLICY FILE", "no tracked comparand row", "WHY NO GENERATED_BANNER"), the per-entry `report([...])` when an entry cannot be resolved, `assertEmittable(prefix+field, value)` on every value, the per-line build, stripping the trailing comma, and `lines.join('\n') + '\n'`. The copy-over sets only the `SearchEngines` key and leaves sibling keys byte-identical. Add a frozen-table row with no comparand, the same as the webextensions row. In `manifestEndpointSources` (around 2626-2650), add `take(\`search_engines[${i}].url\`)` and `take(\`search_engines[${i}].suggest_url\`)` alongside the `urls.*` loop.

### `config-schema.json`

Copy the shape of the `webextensions[].id|installation_mode|install_url` entries (lines 245-260) to `search_engines[].name|url|suggest_url`, and reuse the `regex_example` style from `urls.search` (line 125).

### `chrome-bar-preferences.ts`

```ts
export const SHOW_HOME_BUTTON_PREFERENCE = 'browser.showHomeButton';
[SHOW_HOME_BUTTON_PREFERENCE]: { type: 'boolean', default: false, scope: PreferenceScope.User, description: CHROME_BAR_COPY.showHomeButtonDescription },
```

Add `browser.searchSuggestions` (boolean, default `true`) and `browser.defaultSearchEngine` (string, default `''`), both `PreferenceScope.User`, with descriptions taken from `CHROME_BAR_COPY`.

### `chrome-bar-widget.tsx` pill context menu (Paste / Paste & Go / select-all)

Analog `openHistoryMenu` (lines ~480-518): build a `CompoundMenuNode` inline, pass it to `this.menus.render({ menuPath, menu, anchor, context, includeAnchorArg: false, onHide })`, and declare a module-level `MenuPath` constant next to `HISTORY_MENU_PATH` (line 56). Disabled rows use `isEnabled: () => false`. Restore focus in `onHide` via `setTimeout`. `contextmenu` covers right-click, the context-menu key and Shift+F10 (`onHistoryContextMenu`). New-tab targets call `WebTabOpenHandler.open` / `.openInBackground(url, ref)` (`web-tab.ts:768,782`). Every async reply checks `dropdownArmed` and the sequence number, as `runQuery` does.

### `chrome-bar-copy.ts`

Every new string goes in `CHROME_BAR_COPY` as a function of `appSubject()` (the configured `applicationName`, falling back to `noAppName`). Remove the two hard-coded `PowerBrowser` literals at widget lines 1041 and 1047.

### `scripts/verify-search-engines.mjs` (static gate, `--self-test`)

Analog `scripts/verify-webextensions.mjs`: compare key equality against the emitter output, reject stale keys, check URL origin coverage against `endpoint-allowlist.json`. Plants: a renamed engine, a missing allowlist host, and an extra policy key.

### `scripts/verify-address-bar-rows.mjs` / `verify-token-cookie-strip.mjs`

Analog `scripts/verify-chrome-bar-suggestions.mjs`. Constants: `REPO_ROOT`, `NAME`, and `*_REL` paths (lines 70-77). Entry point: `main()` dispatches `--self-test` (line 485). `selfTest()` (501+) first requires the clean tree to be green, then scopes each plant to the derived body and fails when a plant did not apply. `verify-address-bar-rows.mjs` imports `../theia/extensions/chrome-bar/src/browser/address-bar-rows.ts` directly (Node 24 type stripping).

### `scripts/verify-address-bar-live.mjs` (live BiDi)

Analog `scripts/verify-nav-keys-live.mjs`. Structure: a `SCENARIOS` map (line 1961), a `PLANTS` array of `{ plant, target, run, expect }` (line 2062), parsing of `--scenario a,b` (2048), and a `selfTest` that requires a green clean control, fails on a plant that never applied, and requires the target to go red with `expect` (2075-2119). Helpers from `scripts/lib/pb-live-probe.mjs`: `withProbeShell`, `installPushRecorder`, `waitForPush`, `openWebTab`, `inChrome`, `focusOverlay`, `focusTheiaFrame`, `pressKey`, `serveNavPages`. The `serveNavPages` request log is the independent observer for the cookie-absence assertion, with a positive control.

### `scripts/verify-web-tab-bridge.mjs` rule 12

Copy rule 11 (lines 376-394): `diff(derived, [...MAP.keys()])` produces surplus and missing failures, plus an unknown-class check. Add `STORE_KIND_CLASSES` derived from `STORE_REQUEST_KINDS`. Privileged kinds must be absent from `TAB_STORE_RELAY_KINDS`, must be called only from `chrome-bar-widget.tsx`, and must not be referenced in any command or keybinding. The plant entry follows the format at line 507.

## Shared Patterns

- **End-of-file boundary sections.** Source: `PowerBrowserAPI.sys.mjs:3686-3691` and `4079-4091`. Apply to all chrome-side additions.
- **Refusal message convention.** Write `"<function>: refusing ..."`, return `{ ok:false, reason:"validation", message }`, and never echo a URL, title or path from a foreign error.
- **Registry rows.** In `verify-platform.sh`, each gate gets a `label|cmd` row and a `label-self-test|cmd --self-test` row. The quick block is near 3756, the live block near 4978.
- **Brand-neutral copy.** User-facing text uses `CHROME_BAR_COPY` + `appSubject()`. `verify-shell-error-copy.mjs` pins move in the same commit.
- **Stage before scanning.** Run `git add` on new files before `node scripts/scan-brand-residue.mjs`.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `address-bar-rows.ts` | pure utility | transform | No zero-import module that Node tests directly exists yet. Use the export list in 29-RESEARCH.md (`composeRows`, `nextHighlight`, `isCanonizable`, `autofillSplice`). |

The `http-on-modify-request` observer also has no in-tree analog. Its upstream precedent is `Policies.sys.mjs:188-194` (cited in RESEARCH).

Decided (autonomous, recommended): `tab-store-access-protocol.ts` is classified read-only. The new privileged kinds are not added to the relay list.

## Metadata

**Search scope:** `powerbrowser/shell`, `scripts`, `scripts/lib`, `theia/extensions/{chrome-bar,tab-uris}/src/browser`
**Files scanned:** 12
**Date:** 2026-10-21

## PATTERN MAPPING COMPLETE
