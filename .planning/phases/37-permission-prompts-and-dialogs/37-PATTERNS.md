# Phase 37: Permission Prompts and Dialogs - Pattern Map

**Mapped:** 2026-10-22
**Files analyzed:** 14 (4 new, 10 modified)
**Analogs found:** 14 / 14

All analogs below are git-tracked. Verbatim line anchors in 37-RESEARCH.md still apply.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match |
|---|---|---|---|---|
| `powerbrowser/shell/PowerBrowserAPI.sys.mjs` (end-of-file prompt section) | service (boundary) | request-response + event (observer) | itself §§4079+ (27 web-tab section), §§4303+ (29 store section) | exact |
| `powerbrowser/shell/powerbrowser.js` (furniture call + relay table guard) | bootstrap | event-driven | itself PAGE_KEYS block (27-01) | exact |
| `powerbrowser/shell/powerbrowser.xhtml` (`#notification-popup`, password inputs) | config (XUL furniture) | n/a | Phase 35 furniture rows (assumed; else `#contentAreaContextMenu` stub pattern ARCH §5d) | role-match |
| `powerbrowser/INTERNAL-APIS.md` (append-only rows) | doc/catalogue | — | itself + `verify-ng-040-...--fix` | exact |
| `theia/extensions/tab-uris/src/browser/web-tab.ts` (push kinds + geometry shrink) | component | event-driven | itself `onPush` router + `webTabGeometry` (27-02) | exact |
| `theia/extensions/tab-uris/src/browser/chrome-store-client.ts` (+site-info reads) | client | request-response | itself `searchPlaces`/`savePageCopy` (29) | exact |
| `theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx` (rect report + indicator) | component | event-driven | itself drag-region re-measure `:1003-1040` + nav buttons | exact |
| `theia/extensions/chrome-bar/src/browser/address-bar/` (no change; anchor precedent) | component | event-driven | 30-01 move | exact |
| `theia/extensions/chrome-bar/src/browser/chrome-bar-copy.ts` (bar/indicator/relay rows) | config (copy) | — | itself `CHROME_BAR_COPY` + `appSubject()` | exact |
| `theia/extensions/tab-uris/src/browser/tab-store-access-protocol.ts` | protocol | — | read only; new tab-scoped kinds stay out of `TAB_STORE_RELAY_KINDS` | n/a (do not edit) |
| `scripts/verify-permission-prompts.mjs` NEW (+`--self-test`) | test (static gate) | derive-compare | `scripts/verify-web-tab-bridge.mjs` (rule 11/12 shape) | role-match |
| `scripts/verify-prompts-live.mjs` NEW (+`--self-test`) | test (live BiDi) | event-driven | `scripts/verify-address-bar-live.mjs` + `scripts/lib/pb-live-probe.mjs` | role-match |
| `scripts/verify-platform.sh` (registry rows) | config (registry) | — | itself rows for 27/29/30 gates | exact |
| `scripts/check-internals-boundary.sh` + `verify-shell-gbrowser-standin.mjs` (extended, not rewritten) | test | derive-compare | themselves | exact |

## Pattern Assignments

### `PowerBrowserAPI.sys.mjs` prompt section (service, request-response + event)

**Analog:** 27 web-tab action section + 29 store section.

- New `case` arms + helper functions live in a new end-of-file section; `STORE_REQUEST_KINDS`-style kind sets extended in place; no catalogued line moves.
- Chrome holds payload: `Map<token, {browser, principal, callbacks, kind}>` cleared on `webTabClose`/`webTabDropOwnedBy` (ARCH Pattern 2 precedent: pending-overlay map, context-menu token map).
- Permission answers keyed by tab's own `contentPrincipal` (`browser-custom-element.mjs:684` precedent from ARCH §3); never a sender-supplied origin.
- `moz-src:///` imports for `PopupNotifications.sys.mjs` follow the STACK compatibility note; confirm `check-internals-boundary.sh:84-89` conditional-import rule treats them like existing lines.

### `powerbrowser.js` + `powerbrowser.xhtml` furniture (bootstrap + XUL)

**Analog:** 27-01 PAGE_KEYS block + Phase 35 `installShellFurniture(win)` (assumed present at run start; else create it here per ARCH Pattern 5 and let Phase 35 rebase onto it).

- `installShellFurniture(win)` (Phase 35 plan 35-02, NOT in the tree today) is the single caller; `powerbrowser.js` calls it once first. Windowtype stays `powerbrowser:main`. Absence at execution time is a blocker the executor reports, never re-implemented. The 35-02 furniture gate's upstream comparison list gains every new 37 furniture element (X1); the context-menu shim lives in 35-03, autocomplete/form-validation in 35-06, fullscreen in 35-07.
- `PopupNotifications` constructed with minimal tabbrowser façade (`selectedBrowser`/`selectedTab`/`tabContainer`); every facade member audited per Pitfall 2 against every upstream `gBrowser` reader reachable from overlay actors (the real derivation is `UPSTREAM_SCOPE` + `DELIBERATELY_ABSENT` in `scripts/verify-shell-gbrowser-standin.mjs:87,132`); `getTabDialogBox` has NO deliberately-absent option (D-06 fix): stock outcome keeps it absent-as-fallback, relay outcome adds it audited.
- Stock `password-notification` template verbatim (`popup-notifications.inc.xhtml:100-115`); the stock prompter owns fill (`LoginManagerPrompter.sys.mjs:290-303`) + read-back (`:308-314`). No Theia credential sync (D-07 correction).

### `web-tab.ts` pushes + bars (component, event-driven)

**Analog:** 27-02 `onPush` router + `scheduleWebTabState` coalescer.

- New kinds `doorhanger|sharingChanged|dialogRequest|notificationBar` each get an `onPush` subscriber in chrome-bar/tab-uris (or bridge gate goes red naming it — 27-02 pattern).
- `sharingChanged` rides the coalesced state push (fields read live at flush).
- Notification bars render inside `WebTabWidget` flow above page; placeholder shrinks; published `webTabGeometry` shrinks by bar height. Bar classes never enter `BLOCKING_LAYER_SELECTOR` (derived check).

### `chrome-bar-widget.tsx` rect + indicator (component, event-driven)

**Analog:** drag-region re-measure path `:1003-1040`.

- Identity-box rect re-reported on layout/mode/resize through the same re-measure hook; sender wall `groupSenderIsTheia` before any rect is honored.
- Sharing indicator: 16px Codicon + accent ring, hidden when nothing shared; click opens Phase 31 site panel.

### Copy (config)

**Analog:** 29/30 copy discipline.

- Every new sentence in `CHROME_BAR_COPY`, rendered via `appSubject()`; `EXPECTED_*` in `verify-shell-error-copy.mjs` moves in the same commit as the copy; no internal identifier in text.

### Gates (derive-compare + live)

**Analog:** `verify-web-tab-bridge.mjs` rules + `verify-address-bar-live.mjs` scenarios + `pb-live-probe.mjs` harness.

- Static gate derives: furniture ids from `powerbrowser.xhtml`; `PopupNotifications` construction + façade members from boundary source; `SitePermissions` keyed-principal call shape; forbidden `allow`-family kind names across `webTab*` + store kinds; bar classes vs `BLOCKING_LAYER_SELECTOR`; `UPSTREAM_SCOPE` actor-registry derivation widened with a planted new caller (W2).
- Live script asserts page-side outcomes only (permission state, opener, geometry delta, SitePermissions read-back); every scenario has a plant in `PLANTS` that must go red; KWin screenshots are manual rows, never BiDi DOM on panels.

## Shared Patterns

- **Append-only boundary** (INTERNAL-APIS.md:26-30): end-of-file sections; `--fix` + `--catalogue` after every edit.
- **Privileged-kind rule:** new tab-scoped mutating kinds classified in bridge gate; no command id / key row / relay membership for privileged or network classes.
- **Token-not-payload / enum-not-URL:** chrome resolves every action from its own stored object; Theia answers token + fixed enum.
- **Recursive scans:** any gate reading `chrome-bar/src/browser` recurses into `address-bar/` (30-01 precedent).
- **Stage before scanning:** `git add` new files by explicit path before trusting `scan-brand-residue.mjs`.

## No Analog Found

None. The `PopupNotifications` façade has no in-tree precedent; the upstream constructor (`toolkit/modules/PopupNotifications.sys.mjs:266,634`) plus the Pitfall-2 audit procedure in 37-RESEARCH.md govern it.

## Threat Model

| Boundary | Description |
|----------|-------------|
| pattern → plan | wrong analog copies a bug; planner must follow excerpts + line anchors, not names |
| gate → tree | hand-kept expectation lists rot; every rule derives and compares as a set |

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-37-P-01 | Tampering | stale analog | medium | mitigate | analogs pinned to file + line; 37-01 Task 1 re-derives UPSTREAM_SCOPE from actor registries (W2) |
| T-37-P-02 | Tampering | blind gate after move | medium | mitigate | recursive-scan precedent (30-01); nested-directory plants in self-test |

## Must_Haves

- truths: ["Every new/modified file maps to an analog above or is listed under No Analog Found", "Shared patterns name the boundary, privileged-kind, token-not-payload and derive-and-compare disciplines"]
- artifacts: [`37-PATTERNS.md` this file]

## Verify

- `scripts/verify-platform.sh --quick` — green (no code changed by this file).
- fails_when: a 37-01..37-04 plan references a file with no row above, or an analog path:line does not exist.

## Metadata

**Analog search scope:** `powerbrowser/shell`, `scripts`, `scripts/lib`, `theia/extensions/{chrome-bar,tab-uris}/src/browser`
**Files scanned:** ~20
**Date:** 2026-10-22

## PATTERN MAPPING COMPLETE
