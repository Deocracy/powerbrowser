# Phase 30: Address-bar modes and command centre - Pattern Map

**Mapped:** 2026-10-21
**Files analyzed:** 17 (6 new, 11 modified)
**Analogs found:** 17 / 17

Defaults are recorded as decided: Browsing=Address, Organising=Tabs, Coding=Command centre (30-UI-SPEC, approved).

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `theia/extensions/chrome-bar/src/browser/address-bar/address-bar.tsx` (new, moved pill) | component (injectable) | event-driven | `theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx` (source of the move) | exact |
| `.../address-bar/address-bar-rows.ts` (moved + `classifyAddress`) | utility (pure) | transform | `theia/extensions/chrome-bar/src/browser/address-bar-rows.ts` | exact |
| `.../address-bar/address-bar-mode-table.ts` (new) | utility (pure table) | transform | `address-bar-rows.ts` (import-free shape) + `modes/src/browser/mode-descriptors.ts` (mode-id table) | exact |
| `.../address-bar/address-bar-modes.ts` (new) | provider (contribution point) | request-response | `tab-uris/src/browser/tab-uri-registry.ts:35-36` (ContributionProvider consumer) | role-match |
| `.../address-bar/command-centre.ts` (new) | service | request-response | `modes/src/browser/mode-service.ts` (QuickInputService consumer) | role-match |
| `.../chrome-bar-widget.tsx` (modified: pill removed, renders `addressBar.render()`) | component | event-driven | itself | exact |
| `.../chrome-bar-frontend-module.ts` (modified: bind AddressBar, contribution provider) | config | n/a | itself | exact |
| `.../chrome-bar-keybindings.ts` (modified: ctrlcmd+up/down, alt+up/down, alt+d) | config | event-driven | itself lines 28-48 | exact |
| `.../chrome-bar-copy.ts` (modified: Phase 30 strings) | config | n/a | itself | exact |
| `.../chrome-bar.css` (modified: mode chip, group header) | config (style) | n/a | itself | exact |
| `theia/extensions/tab-uris/src/browser/chrome-store-client.ts` (optional `restrict` on `searchPlaces`) | service | request-response | itself lines 159-166 | exact |
| `powerbrowser/shell/PowerBrowserAPI.sys.mjs` (`searchPlaces` restrict, `listSearchEngines` aliases) | service (boundary) | request-response | itself 3903-3907, 4439-4447 | exact |
| `powerbrowser/INTERNAL-APIS.md:40` (caller path prose) | doc | n/a | itself | exact |
| `scripts/verify-address-bar-mode-table.mjs` (new, with `--self-test`) | test | transform | `scripts/verify-address-bar-rows.mjs` | exact |
| `scripts/verify-address-bar-live.mjs` (modes/tokens/command-centre/go-to scenarios; ~20 plants re-pointed to `get('AddressBar')`) | test (live) | event-driven | itself | exact |
| gate re-points: `verify-address-bar-rows.mjs:35`, `verify-chrome-bar-suggestions.mjs:390,533,666`, `verify-web-tab-bridge.mjs:107,493,506,536,567`, `verify-shell-error-copy.mjs:525`, `verify-chrome-bar-commands.mjs:35,126,143`, `verify-chrome-bar-placement.mjs:31`, `verify-web-tab-live.mjs:119`, `verify-nav-keys-live.mjs:1517` | test | n/a | table in 30-RESEARCH.md Pattern 1 | exact |
| `scripts/verify-platform.sh` (new rows) | config (registry) | n/a | itself lines 3763-3764, 5032-5033 | exact |

## Pattern Assignments

### `address-bar/address-bar.tsx` (component, event-driven) — plan 30-01 move, no behaviour change

**Analog:** `theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx`

- Class name must be exactly `AddressBar`: `scripts/lib/pb-relaunch.mjs:51-60` `__getByName` matches `key.name`.
- Fields/methods to move are listed in 30-RESEARCH.md Pattern 1. Debounce stays as at line 321:
```typescript
protected readonly debouncedQuery = pDebounce((prefix: string) => this.runQuery(prefix), 150);
```
- `renderNow` must stay synchronous on the host widget (lines 1156-1165); expose via `attach(host)`:
```typescript
protected renderNow(): void {
    MessageLoop.sendMessage(this, Widget.Msg.UpdateRequest);   // becomes this.host
}
```
- Mode reset hooks are existing: `onCurrentWidgetChanged` (1770, called at 2235) and `syncModeFromPerspective` (1914, called at 2586/2601). Mode ids are lowercased labels:
```typescript
const label = ChromeBarWidget.MODES.find(candidate => candidate.toLowerCase() === id);
```
- Stays in widget: `MODES`, `selectMode`, `syncModeFromPerspective`, nav buttons (pinned by `verify-mode-toggle-commands.mjs`, `verify-mode-switch-tabs-invariant.mjs`).

### `address-bar/address-bar-rows.ts` and `address-bar-mode-table.ts` (pure utility, transform)

**Analog:** `theia/extensions/chrome-bar/src/browser/address-bar-rows.ts` lines 1-28. Copy the header contract verbatim in spirit:
```typescript
/**
 * Pure on purpose: the widget imports it, and so does
 * scripts/verify-address-bar-rows.mjs under Node's type stripping. It has no
 * import statement and uses only syntax Node strips natively (annotations,
 * interfaces, type aliases; no enum, namespace or parameter property), so it
 * must stay dependency-free.
 */
export type RowSource = 'heuristic' | 'search' | 'history' | 'bookmark' | 'tab';
export const ENGINE_ROW_LIMIT = 4;
```
Mode-table body: use the sketch in 30-RESEARCH.md Pattern 2 (`DEFAULT_MODE_BY_UI_MODE` keyed `coding`/`browsing`/`organising`, `defaultModeFor` fallback `'address'`, `MODE_SENDS`). No `enum` (type stripping). `git mv` the rows file so history follows.

### `address-bar/address-bar-modes.ts` (contribution point)

**Analog for consumer injection:** `theia/extensions/tab-uris/src/browser/tab-uri-registry.ts:35-36`
```typescript
@inject(ContributionProvider) @named(CommandContribution)
protected readonly commandContributionProvider: ContributionProvider<CommandContribution>;
```
Also copy its lazy-resolution rule (lines 44-48): call `getContributions()` lazily, never at module load. Bind with stock `bindContributionProvider(bind, AddressBarModeContribution)` in the frontend module (no in-tree caller yet; signature at `@theia/core/lib/common/contribution-provider.d.ts:28`).

### `address-bar/command-centre.ts` (service, request-response)

**Analog:** `theia/extensions/modes/src/browser/mode-service.ts` lines 1-12 (import style):
```typescript
import { injectable, inject } from '@theia/core/shared/inversify';
import { QuickInputService } from '@theia/core/lib/common/quick-pick-service';
```
`QuickAccessRegistry`/`QuickHelpService` from `@theia/core/lib/browser`, `CancellationTokenSource` from `@theia/core/lib/common`. Core flow: 30-RESEARCH.md Pattern 3 (getQuickAccessProvider → cancel previous CTS → `substring(prefix.length).trim()` → getPicks → map separators to group headers; no descriptor → `quickInput.open(text)`). No new package dependency.

### `chrome-bar-frontend-module.ts` (config)

**Analog:** itself, lines 69-87. Same voice, static at load (D-50):
```typescript
bind(ChromeBarWidget).toSelf().inSingletonScope();
// add:
bind(AddressBar).toSelf().inSingletonScope();
bindContributionProvider(bind, AddressBarModeContribution);
bind(AddressBarModeContribution).toService(BuiltInAddressBarModes);
```

### `chrome-bar-keybindings.ts` (config)

**Analog:** itself lines 28-48. New keys follow the F6 passthrough loop:
```typescript
for (const keybinding of ['f6', 'shift+f6']) {
    keybindings.registerKeybinding({
        command: KeybindingRegistry.PASSTHROUGH_PSEUDO_COMMAND,
        keybinding,
        when: ADDRESS_FOCUSED_CONTEXT_KEY,
    });
}
```
Alt+D mirrors the `ctrlcmd+l` entry (same command id, same `when`).

### `chrome-bar-copy.ts` (config)

**Analog:** itself. Add entries to the frozen `CHROME_BAR_COPY` object; subject via `appSubject()`; function-valued strings for interpolation (`searchWith: (engine) => ...`). Update `EXPECTED_NAV_COPY` in `verify-shell-error-copy.mjs`.

### `PowerBrowserAPI.sys.mjs` / `chrome-store-client.ts`

Add an optional `restrict` field to the existing `searchPlaces` kind (no new store kind; avoids `STORE_REQUEST_KINDS` change). New boundary code goes in the end-of-file section; existing lines edit in place. After edit: `node scripts/verify-ng-040-internals-catalogue-lines.mjs --fix` then `bash scripts/check-internals-boundary.sh --catalogue`.

### `scripts/verify-address-bar-mode-table.mjs` (test)

**Analog:** `scripts/verify-address-bar-rows.mjs` lines 25-45: `REPO_ROOT`/`NAME`/`MODULE_REL`/`EXPORTS` constants, `cases(m)` returning null-or-got, `--self-test` writing a planted copy to `mkdtempSync(tmpdir())`. Derive the prefix table from the mode contributions at check time and compare as set equality (D-33).

### `scripts/verify-platform.sh` (registry)

Append rows in the existing form (3763-3764 quick, 5032-5033 live):
```sh
"address-bar-rows|node $REPO_ROOT/scripts/verify-address-bar-rows.mjs"
"address-bar-rows-self-test|node $REPO_ROOT/scripts/verify-address-bar-rows.mjs --self-test"
```

## Shared Patterns

- **Static binding (D-50):** every bind at module load — `chrome-bar-frontend-module.ts` header comment. Apply to AddressBar, modes contribution, CommandCentre.
- **Pure modules under Node type stripping:** `address-bar-rows.ts` header. Apply to rows and mode-table.
- **Copy discipline:** `chrome-bar-copy.ts` `CHROME_BAR_COPY` + `appSubject()`; no internal identifiers in text.
- **Recursive scans:** the `readdirSync` scans in `verify-chrome-bar-suggestions.mjs:533,666` and `verify-web-tab-bridge.mjs:506` must recurse into `address-bar/`, or the gates go silently blind.
- **Brand scan:** stage new `address-bar/` files before trusting `scan-brand-residue.mjs`.

## No Analog Found

None. `bindContributionProvider` has no in-tree caller; use the stock Theia helper.

## Metadata

**Analog search scope:** `theia/extensions/{chrome-bar,modes,tab-uris}/src/browser`, `scripts/`
**Files scanned:** ~25
