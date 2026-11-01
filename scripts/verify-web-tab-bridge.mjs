#!/usr/bin/env node
/**
 * GUI-02's bridge-contract gate: the chrome host and the Theia web tab agree
 * on every wire token they share, and the chrome bar cannot escape to a
 * stock window.
 *
 * The in-shell web tab is two halves joined by strings: the frontend sends
 * `kind: 'webTab…'` messages that `handleGroupMutation` dispatches by
 * `case "webTab…"`; the actor child re-dispatches chrome's push as a DOM
 * event whose name the widget listens for; the open handler's priority must
 * beat the stock http handler or every URL becomes an OS window again. None
 * of that is checked by a compiler -- a renamed kind, a re-spelled event or
 * a lowered priority ships green and fails only in the window (which is how
 * every earlier GUI phase shipped green while the window was broken).
 *
 * ## Derived, never hand-kept
 *
 * Every expectation here is DERIVED from the tree at check time and compared
 * as SET EQUALITY in both directions, after the pattern
 * `verify-registry-shape.mjs` established: an addition is a surplus, a
 * removal is a shortfall, both reported by name, and a derivation that
 * yields nothing fails as a broken instrument rather than passing as a
 * comparison against nothing. The one rule that only BANS something (no
 * chrome-bar source may reach the stock-window command, the openStockTab
 * kind or a bare popup) carries a registered positive control --
 * `browser-window-command.ts` must still send openStockTab, as the one
 * allow-listed sender (Phase 36) -- so "removed everywhere" cannot pass it.
 *
 * Comments are stripped before every derivation so header prose (this
 * file's, and the sources' own) never counts as a spelling.
 *
 * Static by construction: text reads only, no build, no browser, no display,
 * no network -- it belongs in `verify-platform.sh --quick`.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const API = 'powerbrowser/shell/PowerBrowserAPI.sys.mjs';
const CHILD = 'powerbrowser/shell/GroupActorChild.sys.mjs';
const CLIENT = 'theia/extensions/modes/src/browser/group-actor-client.ts';
const BWC = 'theia/extensions/tab-uris/src/browser/browser-window-command.ts';
const WEB_TAB = 'theia/extensions/tab-uris/src/browser/web-tab.ts';
const MODULE = 'theia/extensions/tab-uris/src/browser/tab-uris-frontend-module.ts';
const CHROME_BAR_DIR = 'theia/extensions/chrome-bar/src/browser';
const TAB_URIS_DIR = 'theia/extensions/tab-uris/src/browser';

/**
 * Phase 27 privileged-kind rule (powerbrowser/INTERNAL-APIS.md): every
 * `case "webTab…"` arm chrome serves, in either handler, has exactly one class.
 * Compared as set equality against the derived arms, so an unclassified arm
 * and a stale entry each go red by name. `privileged` (state outside a tab's
 * own navigation, lifecycle or selection) exists and is empty: Phase 27 adds
 * no such kind, and the first one must be a deliberate edit here.
 * Phase 31 (SITE-04..06): `webTabSiteInfo` is tab-navigation -- the panel's
 * read of this tab's own site, keyed chrome-side by the overlay's principal,
 * never a sender field, so it reaches no other tab's state.
 * Phase 31 plan 02 (D-31-05/D-31-11): `webTabSetPermission` is the first
 * privileged webTab kind (it writes site permissions). The gate admits the
 * privileged class only under checkWebTabPrivileged: the frontend method
 * exists, it is called only from the chrome-bar event-handler tree, and no
 * command or keybinding file names the kind or calls its method.
 * Phase 35 plan 03 (D-09): `webTabContextMenuAction` is the first privileged kind
 * with a literal sender rather than a web-tab.ts method; PRIVILEGED_WEB_TAB_KINDS
 * below names each privileged kind's reason and owning file.
 */
const KIND_CLASS_NAMES = ['tab-navigation', 'tab-lifecycle', 'selection', 'privileged'];
const KIND_CLASSES = new Map([
    ['webTabNavigate', 'tab-navigation'],
    ['webTabBack', 'tab-navigation'],
    ['webTabForward', 'tab-navigation'],
    ['webTabReload', 'tab-navigation'],
    ['webTabStop', 'tab-navigation'],
    ['webTabHistory', 'tab-navigation'],
    ['webTabGotoIndex', 'tab-navigation'],
    ['webTabOpen', 'tab-lifecycle'],
    ['webTabClose', 'tab-lifecycle'],
    ['webTabFocus', 'tab-lifecycle'],
    ['webTabGeometry', 'tab-lifecycle'],
    ['webTabActivated', 'selection'],
    ['webTabSiteInfo', 'tab-navigation'],
    ['webTabSetPermission', 'privileged'],
    // Phase 31 plan 03 (SITE-07, D-31-12): clearing a site's data is a site-state write, so privileged.
    ['webTabClearSiteData', 'privileged'],
    // Phase 31 plan 03 (SITE-08, D-31-06): the per-site shield exception is a site-state write, so privileged.
    ['webTabShieldToggle', 'privileged'],
    // Phase 32 plan 01 (PAGE-01/02): find and zoom change only the tab's own page view (its find state and
    // its fullZoom), so they are tab-navigation. No pref, file or site state is written by either.
    ['webTabFind', 'tab-navigation'],
    ['webTabFindNext', 'tab-navigation'],
    ['webTabFindClose', 'tab-navigation'],
    ['webTabZoomIn', 'tab-navigation'],
    ['webTabZoomOut', 'tab-navigation'],
    ['webTabZoomReset', 'tab-navigation'],
    // Phase 32 plan 01 (PAGE-05): mute changes this tab's audio state only; it is per-tab selection state
    // beside webTabActivated, so selection. It is an explicit boolean, never a toggle.
    ['webTabMute', 'selection'],
    ['webTabDownloadsSubscribe', 'selection'],
    ['webTabDownloadsAction', 'selection'],
    // Phase 32 plan 03 (PAGE-03): the print reads the tab's page and changes no tab, pref or site state; it
    // sits with navigation as the one tab-scoped page action that opens a system dialog.
    ['webTabPrint', 'tab-navigation'],
    // Phase 32 plan 05 (PAGE-08): save pick and export sit with navigation, as CONTEXT's class log records.
    ['webTabSavePick', 'tab-navigation'],
    ['webTabSaveExport', 'tab-navigation'],
    // Phase 32 plan 06 (PAGE-09): the frozen edit commands sit with navigation, per CONTEXT's class log.
    ['webTabEdit', 'tab-navigation'],
    // Phase 32 plan 07 (PAGE-10): reader, view source and DevTools change the overlay's own page, so they are tab-navigation.
    ['webTabReader', 'tab-navigation'],
    ['webTabViewSource', 'tab-navigation'],
    ['webTabDevtools', 'tab-navigation'],
    // Phase 36 plan 01 (PROMPT-05): the adopt ack binds one new overlay to one new widget, so tab-lifecycle. Its
    // companions adoptTab and dropAdoptedTab are chrome->frontend push kinds, which push-kind parity covers, not this map.
    ['webTabAdopt', 'tab-lifecycle'],
    // Phase 37 plan 04 (D-08, D-12): a notification bar's button. A token and a fixed-enum action on a chrome-held
    // record of the sender's own tab; it writes no permission, so tab-lifecycle (the bar lives and goes with the tab).
    ['webTabBarAction', 'tab-lifecycle'],
    // Phase 35 plan 03 (PROMPT-04, D-09): the page menu pick performs a row outside the tab's own navigation
    // (clipboard writes, a new tab with the page's principal), so privileged; fenced to its owning file below.
    ['webTabContextMenuAction', 'privileged'],
]);

/**
 * Phase 35 plan 03 (D-09): each privileged webTab kind, with its reason and the one file that owns its sender.
 * Owner WEB_TAB is the Phase 31 shape: a same-named web-tab.ts method called only from the chrome-bar
 * event-handler tree (checkWebTabPrivileged). Any other owner is a literal sender: the literal
 * `kind: '<kind>'` appears in that file and in the web-tab.ts union only, derived over every chrome-bar and
 * tab-uris source. Compared with the privileged entries of KIND_CLASSES as set equality.
 */
const PAGE_CONTEXT_MENU = `${CHROME_BAR_DIR}/page-context-menu.ts`;
const PRIVILEGED_WEB_TAB_KINDS = new Map([
    ['webTabSetPermission', { owner: WEB_TAB, reason: 'writes a site permission' }],
    ['webTabClearSiteData', { owner: WEB_TAB, reason: "clears a site's stored data" }],
    ['webTabShieldToggle', { owner: WEB_TAB, reason: 'writes the per-site shield exception' }],
    ['webTabContextMenuAction', { owner: PAGE_CONTEXT_MENU, reason: 'performs a page menu row: a clipboard write, a new tab with the page principal, a page media or frame command' }],
]);

/**
 * Rule 12 (Phase 29): every store kind chrome serves (STORE_REQUEST_KINDS,
 * routed to handleStoreRequest) has exactly one class, compared as set
 * equality so an unclassified kind and a stale entry each go red by name.
 * `network` = sends user input off the machine; `privileged` = Places writes
 * or clipboard reads. Neither may enter TAB_STORE_RELAY_KINDS (the backend
 * relay), and a privileged kind runs only from the two sanctioned handler files,
 * address-bar/address-bar.tsx (the pill: Shift+Delete, paste, the star and its
 * editor) and chrome-bar-widget.tsx (Phase 33: the History submenu, the bookmarks
 * toolbar and the Clear Recent History confirm), through its same-named
 * ChromeStoreClient method, never from a command or a key row.
 * savePageCopy runs from a command, so it is store-write, not privileged.
 * searchSuggestions (29-06) is the first network kind and removeHistoryEntry
 * (29-09) the first privileged one. The first entry of each was a deliberate
 * edit here and in powerbrowser/INTERNAL-APIS.md.
 * `lifecycle` (Phase 31 plan 05, D-31-13) = a chrome-lifetime transition: it
 * ends the application, never touches user data, and is never relayed. Its
 * only senders are the chrome bar widget's own row handler and its client
 * method, and no command or keybinding may name it (the Ctrl+Q key is a
 * chrome <key> row, not a store kind). quitRequest is the first entry.
 * `window-chrome` (Phase 33 plan 05, D-14b/N1) = command-reachable window chrome
 * state: it writes no Places row, reads no clipboard and sends nothing off the
 * machine, so -- unlike a privileged kind -- a command id may reach it (the
 * MENU-03 Full Screen row and its Actions twin run one `full-screen` id, which
 * the privileged command-naming fence would forbid). It is still never relayed,
 * has a same-named ChromeStoreClient method, and is called only from the chrome
 * bar widget's handler, which the command reaches through its module-level opener.
 * fullScreen is the first entry.
 */
const STORE_KIND_CLASS_NAMES = ['read', 'store-write', 'network', 'privileged', 'lifecycle', 'window-chrome'];
const STORE_KIND_CLASSES = new Map([
    ['readHistoryEntry', 'read'],
    ['readBookmarkByUrl', 'read'],
    ['listBookmarkFolder', 'read'],
    ['projectSessionStoreTabs', 'read'],
    ['queryTabsWithPlaces', 'read'],
    ['searchPlaces', 'read'],
    ['resolveTypedAddress', 'read'],
    ['listSearchEngines', 'read'],
    ['placesFavicons', 'read'],
    ['autofillOrigin', 'read'],
    ['searchSuggestions', 'network'],
    ['setSetting', 'store-write'],
    ['savePageCopy', 'store-write'],
    ['removeHistoryEntry', 'privileged'],
    ['readClipboardText', 'privileged'],
    // Phase 31 plan 04 (MENU-02, D-31-07): opens a stock page from an app-menu row. It writes no
    // Places row, reads no clipboard and sends nothing off the machine, so it is a store-write
    // (the class savePageCopy has), never privileged and never relayed.
    ['openStockPage', 'store-write'],
    // Phase 31 plan 05 (MENU-04, D-31-13): the Quit row. The one existing quit path, reached only from the widget's row.
    ['quitRequest', 'lifecycle'],
    // Phase 33 (BMK-01/02/05): the bookmark writes and the one history clear write Places, so they are
    // privileged -- clearHistory runs only from the range picker's confirm, never a command, key or the relay.
    ['bookmarkPage', 'privileged'],
    ['updateBookmark', 'privileged'],
    ['removeBookmark', 'privileged'],
    ['clearHistory', 'privileged'],
    // Phase 33 (BMK-03/06): the closed-tab list reads tabs.sqlite and writes nothing. The reopen claims the row it
    // answers (WR-01/WR-02: the tabs row, and a stock row's sessionstore record) so one row opens once; the
    // Ctrl+Shift+T command reaches it, so it is a store-write, never privileged.
    ['listClosedTabs', 'read'],
    ['reopenClosedTab', 'store-write'],
    // Phase 33 plan 05 (MENU-03, D-14b): the Full Screen toggle, window chrome state the full-screen command may reach.
    ['fullScreen', 'window-chrome'],
    // Phase 38 plan 01 (EXT-06/07, D-11): the subscribe only makes the frame the extensionAction push target and reads
    // the action set, so it is a read. Click (it grants activeTab and runs the extension), pin (a persisted pref) and
    // remove (an uninstall) change chrome state outside any tab, so they are privileged: same-named ChromeStoreClient
    // methods, widget-handler callers only (38-02), no command id, no key row, never relayed.
    ['extensionActionsSubscribe', 'read'],
    ['extensionClick', 'privileged'],
    ['extensionPin', 'privileged'],
    ['extensionRemove', 'privileged'],
    // Phase 38 plan 04 (B5): Show/Hide Sidebar opens or closes a chrome panel browser holding an extension page, and the
    // geometry kind places it over the Theia view. Both change chrome state outside any tab: privileged, sent only by the
    // extension buttons widget (its gear row and its sidebar view's callbacks), no command id, no key row, never relayed.
    ['extensionSidebar', 'privileged'],
    ['extensionSidebarGeometry', 'privileged'],
    // Phase 38 plan 05 (EXT-09, D-11): the puzzle menu's install footer opens the add-ons site in the stock window. It
    // sends the user off the machine, so it is network (never relayed); it writes nothing and reads no user data.
    ['extensionInstallSite', 'network'],
]);
/**
 * Phase 31 plan 04: store kinds the app menu sends straight from the Theia window to chrome. Each
 * must be classed and must stay out of TAB_STORE_RELAY_KINDS: a set-equality absence, so a relayed
 * menu kind goes red by name.
 */
const MENU_ONLY_STORE_KINDS = ['openStockPage'];
const STORE_PROTOCOL = `${TAB_URIS_DIR}/tab-store-access-protocol.ts`;
const STORE_CLIENT = `${TAB_URIS_DIR}/chrome-store-client.ts`;
const CHROME_BAR_WIDGET = `${CHROME_BAR_DIR}/address-bar/address-bar.tsx`;
/** Phase 31 plan 05: the chrome bar widget, which sends the Quit row's `quitRequest` (the lifecycle caller). */
const CHROME_BAR_WIDGET_FILE = `${CHROME_BAR_DIR}/chrome-bar-widget.tsx`;
/** Phase 38 plan 02 (D-11): the extension buttons and puzzle menu, which send extensionClick/Pin/Remove from their handlers. */
const EXTENSION_ACTIONS_WIDGET_FILE = `${CHROME_BAR_DIR}/extensions/extension-actions-widget.tsx`;
/** Phase 33: the sanctioned privileged callers -- the pill and the chrome bar widget -- and nothing else. */
const PRIVILEGED_CALLERS = [CHROME_BAR_WIDGET, CHROME_BAR_WIDGET_FILE];
/**
 * 38-REVIEW WR-08: the extension kinds (every privileged kind named extension*) are sent by the extension buttons widget
 * alone, and the earlier privileged kinds are never sent from it: one fence per group, so adding the widget to one list
 * cannot widen the other.
 */
const EXTENSION_CALLERS = [EXTENSION_ACTIONS_WIDGET_FILE];
const privilegedCallersOf = kind => (/^extension/.test(kind) ? EXTENSION_CALLERS : PRIVILEGED_CALLERS);

/** Stock `HttpOpenHandler`'s priority; the web-tab handler must exceed it. */
const STOCK_HTTP_HANDLER_PRIORITY = 500;

/** Stock-window escape hatches no chrome-bar source may reach. */
const STOCK_WINDOW_COMMAND = 'OPEN_BROWSER_WINDOW_COMMAND_ID';
/**
 * Phase 33 plan 05 (MENU-03, D-12): the one sanctioned reach -- the New Window command in chrome-bar-commands.ts
 * opens the stock window through GUI-01's command (no second shell window). Its import line and its own
 * registration are admitted; any other mention, in that file or any chrome-bar source, still fails.
 */
const NEW_WINDOW_COMMANDS_FILE = `${CHROME_BAR_DIR}/chrome-bar-commands.ts`;
const NEW_WINDOW_IMPORT = /^import \{ OPEN_BROWSER_WINDOW_COMMAND_ID \} from '@powerbrowser\/tab-uris\/lib\/browser\/browser-window-command';$/m;
const NEW_WINDOW_REGISTRATION = /commands\.registerCommand\(CHROME_BAR_NEW_WINDOW, \{\s*execute: \(\) => this\.commands\.executeCommand\(OPEN_BROWSER_WINDOW_COMMAND_ID\),/;
const WINDOW_OPEN = /window\.open\s*\(/;
/** Phase 36: the stock-window actor kind; only `browser-window-command.ts` may send it. */
const STOCK_TAB_KIND = /openStockTab|OPEN_STOCK_TAB_KIND/;

/**
 * Strip `/* … *\/` blocks and `//` line comments. A `//` counts only when it
 * begins a line or follows whitespace, so `http://…` inside a string and
 * `\/\//` inside a regex literal survive.
 */
function stripComments(text) {
    return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');
}

function derive(text, re) {
    return [...text.matchAll(re)].map(m => m[1]);
}

/** Set difference reported by name, so a failure says WHICH name drifted. */
function diff(actual, expected) {
    const a = new Set(actual);
    const e = new Set(expected);
    return {
        surplus: [...a].filter(name => !e.has(name)),
        missing: [...e].filter(name => !a.has(name)),
    };
}

/** The body of a top-level `[async] function name(…) { … }`, up to its column-0 `}`. */
function functionBody(text, name) {
    const start = text.search(new RegExp(`^(?:async )?function ${name}\\(`, 'm'));
    if (start === -1) {
        return '';
    }
    const end = text.indexOf('\n}', start);
    return end === -1 ? text.slice(start) : text.slice(start, end);
}

/**
 * The body of the `PowerBrowserAPI` object method `name(…) {` (two-space
 * indentation), up to the next method declared at the same indentation.
 */
function apiMethodBody(text, name) {
    const start = text.search(new RegExp(`^ {2}${name}\\([^)]*\\)\\s*\\{`, 'm'));
    if (start === -1) {
        return '';
    }
    const rest = text.slice(start + 1);
    const next = rest.search(/^ {2}(?:async\s+)?[A-Za-z_$][\w$]*\([^)]*\)\s*\{/m);
    return next === -1 ? text.slice(start) : text.slice(start, start + 1 + next);
}

/**
 * The bodies of every four-space-indented class member `name(…) {` (with any
 * `protected`/`private`/`public`, `static`, `async` prefix), keyed by name,
 * each running to the next member declared at the same indentation.
 * @returns {Map<string, string>}
 */
function classMethodBodies(text) {
    const member = /^ {4}(?:protected |private |public )?(?:static )?(?:async )?([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*(?::[^{]*)?\{/gm;
    const matches = [...text.matchAll(member)];
    const bodies = new Map();
    matches.forEach((m, i) => {
        const end = i + 1 < matches.length ? matches[i + 1].index : text.length;
        bodies.set(m[1], text.slice(m.index, end));
    });
    return bodies;
}

/**
 * @returns {string[]} failure messages -- empty means the bridge contract holds.
 */
function checkBridge(raw, storeClasses = STORE_KIND_CLASSES, kindClasses = KIND_CLASSES, privilegedKinds = PRIVILEGED_WEB_TAB_KINDS) {
    const failures = [];
    const src = Object.fromEntries(Object.entries(raw).map(([file, text]) => [file, stripComments(text)]));

    // 1. KINDS: the chrome dispatch arms vs the frontend message union.
    const apiKinds = derive(src[API], /case "(webTab[A-Za-z]+)"/g);
    const tsKinds = derive(src[WEB_TAB], /kind: '(webTab[A-Za-z]+)'/g);
    if (apiKinds.length === 0) {
        failures.push(`${API}: derived ZERO case "webTab…" arms -- the parse found nothing, so the kind comparison proves nothing`);
    }
    if (tsKinds.length === 0) {
        failures.push(`${WEB_TAB}: derived ZERO kind: 'webTab…' literals -- the parse found nothing, so the kind comparison proves nothing`);
    }
    if (apiKinds.length && tsKinds.length) {
        const { surplus, missing } = diff(apiKinds, tsKinds);
        if (surplus.length) {
            failures.push(`kinds: chrome serves case arms the frontend never sends: ${surplus.join(', ')}`);
        }
        if (missing.length) {
            failures.push(`kinds: the frontend sends kinds chrome has no case arm for: ${missing.join(', ')}`);
        }
    }

    // 2. EVENT NAMES: the DOM-facing names the actor child listens for and
    // dispatches (its chrome-internal sendQuery message name is not a DOM
    // event and is excluded by construction) vs the names web-tab.ts spells.
    const childDom = [
        ...derive(src[CHILD], /event\.type !== "(PowerBrowser[A-Za-z]+)"/g),
        ...derive(src[CHILD], /CustomEvent\("(PowerBrowser[A-Za-z]+)"/g),
    ];
    const webTabEvents = derive(src[WEB_TAB], /'(PowerBrowser[A-Za-z]+)'/g);
    if (childDom.length === 0) {
        failures.push(`${CHILD}: derived ZERO DOM event names -- the listen/dispatch idioms were not found, so the event comparison proves nothing`);
    }
    if (webTabEvents.length === 0) {
        failures.push(`${WEB_TAB}: derived ZERO 'PowerBrowser…' event literals -- the event comparison proves nothing`);
    }
    if (childDom.length && webTabEvents.length) {
        const { surplus, missing } = diff(childDom, webTabEvents);
        if (surplus.length) {
            failures.push(`events: the actor child dispatches or listens for names web-tab.ts never spells: ${surplus.join(', ')}`);
        }
        if (missing.length) {
            failures.push(`events: web-tab.ts spells names the actor child never dispatches or listens for: ${missing.join(', ')}`);
        }
    }
    // The state push: chrome's sendAsyncMessage name must be the one the
    // child's receiveMessage accepts.
    const pushed = derive(src[API], /sendAsyncMessage\("(PowerBrowser[A-Za-z]+)"/g);
    const received = derive(src[CHILD], /message\.name !== "(PowerBrowser[A-Za-z]+)"/g);
    if (pushed.length === 0) {
        failures.push(`${API}: derived ZERO sendAsyncMessage("PowerBrowser…") pushes -- the push comparison proves nothing`);
    } else {
        const { missing } = diff(received, pushed);
        if (missing.length) {
            failures.push(`push: chrome pushes ${missing.join(', ')} but the actor child's receiveMessage does not accept that name`);
        }
    }
    // The request/response pair: every other frontend speller must match
    // the child exactly (derived from the child; the state name is the
    // push above and is not a request-side name).
    const requestPair = childDom.filter(name => !received.includes(name));
    for (const file of [CLIENT, BWC]) {
        for (const name of requestPair) {
            if (!src[file].includes(`'${name}'`)) {
                failures.push(`${file}: does not spell '${name}' as the actor child does`);
            }
        }
    }

    // 3. PRIORITY: the open handler must beat the stock http handler.
    const priority = /canHandle[\s\S]*?\?\s*(\d+)\s*:\s*0/.exec(src[WEB_TAB]);
    if (!priority) {
        failures.push(`${WEB_TAB}: canHandle's numeric priority literal was not found -- the priority comparison proves nothing`);
    } else if (Number(priority[1]) <= STOCK_HTTP_HANDLER_PRIORITY) {
        failures.push(`${WEB_TAB}: canHandle returns ${priority[1]}, which does not exceed stock HttpOpenHandler's ${STOCK_HTTP_HANDLER_PRIORITY} -- every http(s) URI would open an OS window`);
    }
    if (!src[MODULE].includes('toService(WebTabOpenHandler)')) {
        failures.push(`${MODULE}: WebTabOpenHandler is not bound as an OpenHandler (toService(WebTabOpenHandler) absent)`);
    }

    // 4. OVERLAY CONTRACT: the frameloader reads these at connect, so every
    // one must be set BEFORE appendChild.
    const openBody = apiMethodBody(src[API], 'webTabOpen');
    if (!openBody) {
        failures.push(`${API}: webTabOpen method body not found -- the overlay contract cannot be asserted`);
    } else {
        let lastAttr = -1;
        for (const attr of ['type', 'remote', 'remoteType', 'maychangeremoteness', 'manualactiveness', 'autocompletepopup']) {
            const at = openBody.search(new RegExp(`\\b${attr}\\s*:`));
            if (at === -1) {
                failures.push(`${API}: webTabOpen no longer sets the ${attr} attribute on the overlay`);
            } else {
                lastAttr = Math.max(lastAttr, at);
            }
        }
        const append = openBody.indexOf('appendChild(');
        if (append === -1) {
            failures.push(`${API}: webTabOpen never appends the overlay (appendChild absent)`);
        } else if (lastAttr !== -1 && append < lastAttr) {
            failures.push(`${API}: webTabOpen appends the overlay before setting all of its attributes -- the frameloader reads them at connect`);
        }
    }

    // 5. WALL: the embedder-is-primary predicate.
    const wall = functionBody(src[API], 'groupSenderIsTheia');
    if (!wall) {
        failures.push(`${API}: groupSenderIsTheia not found -- the origin wall cannot be asserted`);
    } else {
        for (const token of ['embedderElement', 'primary']) {
            if (!wall.includes(token)) {
                failures.push(`${API}: groupSenderIsTheia no longer checks ${token} -- a loopback page inside an overlay could pass the origin wall`);
            }
        }
    }

    // 6. NO STOCK-WINDOW ESCAPE from the chrome bar, with a positive control.
    const chromeBarFiles = Object.keys(src).filter(file => file.startsWith(`${CHROME_BAR_DIR}/`));
    if (chromeBarFiles.length === 0) {
        failures.push(`${CHROME_BAR_DIR}: derived ZERO sources -- the no-escape rule scanned nothing`);
    }
    for (const file of chromeBarFiles) {
        const text = file === NEW_WINDOW_COMMANDS_FILE ? src[file].replace(NEW_WINDOW_IMPORT, '').replace(NEW_WINDOW_REGISTRATION, '') : src[file];
        if (text.includes(STOCK_WINDOW_COMMAND)) {
            failures.push(`${file}: reaches ${STOCK_WINDOW_COMMAND} -- the chrome bar must land in the in-shell web tab, never the stock window`);
        }
        if (WINDOW_OPEN.test(src[file])) {
            failures.push(`${file}: calls window.open -- the chrome bar must land in the in-shell web tab, never a popup`);
        }
        if (STOCK_TAB_KIND.test(src[file])) {
            failures.push(`${file}: sends openStockTab -- ${BWC} is the one allow-listed stock-window sender`);
        }
    }
    // Positive control (Phase 36): the allow-listed sender still sends the kind, and no longer pops up.
    if (!/const OPEN_STOCK_TAB_KIND = 'openStockTab'/.test(src[BWC]) || !/kind: OPEN_STOCK_TAB_KIND\b/.test(src[BWC])) {
        failures.push(`${BWC}: no longer sends OPEN_STOCK_TAB_KIND ('openStockTab') -- GUI-01's only route to the stock window is gone, and without this positive control the no-escape rule would pass on "removed everywhere"`);
    }
    if (WINDOW_OPEN.test(src[BWC])) {
        failures.push(`${BWC}: calls window.open -- a Phase 36 new-window receiver would divert that popup into a web tab; the command must send openStockTab only`);
    }
    // Dead channel (Phase 36, 36-REVIEW WR-07): a click re-probes a channel not known alive; if it is still down,
    // openBrowserWindow throws user-facing copy (PowerBrowser named, no command id) and opens nothing.
    const bwcOpenBody = src[BWC].match(/openBrowserWindow\([^)]*\)\s*:\s*(?:void|Promise<void>)\s*\{([\s\S]*?)\n {4}\}/)?.[1];
    const aliveGate = bwcOpenBody?.match(/if \(this\.channelAlive === true[\s\S]*?\n {8}\}/);
    if (!aliveGate) {
        failures.push(`${BWC}: dead-channel rule found no openBrowserWindow gated on "this.channelAlive === true" -- the parse found nothing to check`);
    } else {
        const reprobe = /if \(this\.channelAlive !== true\) \{\s*await this\.probeChannel\(\);/.exec(bwcOpenBody);
        if (!reprobe || reprobe.index > aliveGate.index) {
            failures.push(`${BWC}: openBrowserWindow no longer re-probes a channel not known alive before its gate -- one lost startup probe would disable the stock window for the session`);
        }
        const deadBranch = bwcOpenBody.slice(aliveGate.index + aliveGate[0].length);
        if (WINDOW_OPEN.test(deadBranch)) {
            failures.push(`${BWC}: dead-channel branch of openBrowserWindow calls window.open -- with the channel down it must throw the actionable error, never pop up`);
        }
        const thrown = /throw new Error\(([^;]*)\);/.exec(deadBranch);
        const copyNames = thrown ? [...thrown[1].matchAll(/\b(OPEN_BROWSER_WINDOW_\w+_COPY)\b/g)].map(m => m[1]) : [];
        if (!thrown || copyNames.length === 0 || /OPEN_BROWSER_WINDOW_COMMAND_ID|`/.test(thrown[1])) {
            failures.push(`${BWC}: dead-channel branch of openBrowserWindow no longer throws the actionable error -- it must throw an OPEN_BROWSER_WINDOW_*_COPY constant, never the command id or an inline string`);
        }
        for (const name of copyNames) {
            const copy = new RegExp(`const ${name} =\\s*'([^']*)'`).exec(src[BWC])?.[1];
            if (copy === undefined) failures.push(`${BWC}: ${name} is thrown but has no string literal definition`);
            else if (!/^PowerBrowser\b/.test(copy) || /powerbrowser\.|open-browser-window/i.test(copy)) {
                failures.push(`${BWC}: ${name} does not start by naming PowerBrowser, or carries an internal identifier: ${JSON.stringify(copy)}`);
            }
        }
    }

    // 7. CHILD PURITY: zero privileged reach (belt to the boundary scan).
    for (const token of ['Cu.', 'Services.', 'Ci.', 'cloneInto']) {
        if (src[CHILD].includes(token)) {
            failures.push(`${CHILD}: contains ${token} -- the actor child must carry zero privileged reach`);
        }
    }
    if (!src[CHILD].includes('receiveMessage(')) {
        failures.push(`${CHILD}: receiveMessage( absent -- chrome's state push has no content-side receiver`);
    }

    // 8. LOST REPLY (G-14.1.1-48): one reading of "chrome no longer renders
    // this tab". Every setLostView call-site argument is a bare identifier or
    // boolean (the setter's own parameter; publish()'s documented `true`) or
    // a call to the class's shared predicate -- never an inline expression.
    // The call-site pattern requires the member-call `.`, so the method
    // declaration itself is not a site; the argument may carry one level of
    // nested parentheses (the predicate call), and stops at the paren that
    // closes setLostView rather than at the one that closes an enclosing
    // arrow function.
    const lostSites = derive(src[WEB_TAB], /\.setLostView\(\s*((?:[^();]|\([^()]*\))*?)\s*\)/g);
    if (lostSites.length === 0) {
        failures.push(`lost-reply: ${WEB_TAB}: derived ZERO setLostView call sites -- the parse found nothing, so this comparison proves nothing (broken instrument, never a clean pass)`);
    }
    for (const arg of lostSites) {
        if (!/^(?:[A-Za-z_$][\w$]*|true|false|WebTabWidget\.lostReply\([^)]*\))$/.test(arg)) {
            failures.push(`lost-reply: ${WEB_TAB} folds a reply into lost-view state with the inline expression "${arg}" -- the one reading of "chrome no longer renders this tab" lives in lostReply(), and a second spelling is how the two drift apart`);
        }
    }
    // Every outcome constant the file exports must be folded by lostReply():
    // both sides derive from the same file, so a fourth constant added later
    // is red until folded, and a deleted arm is red too.
    const outcomeNames = derive(src[WEB_TAB], /export const ([A-Z][A-Z0-9_]*_OUTCOME)\s*=/g);
    const lostReplyBody = classMethodBodies(src[WEB_TAB]).get('lostReply') || '';
    if (outcomeNames.length === 0 || !lostReplyBody) {
        failures.push(`lost-reply: ${WEB_TAB}: derived ZERO exported outcome constants (or no lostReply body) -- the parse found nothing, so this comparison proves nothing (broken instrument, never a clean pass)`);
    }
    for (const name of outcomeNames) {
        if (!lostReplyBody.includes(name)) {
            failures.push(`lost-reply: ${WEB_TAB} exports the outcome constant ${name} but lostReply() does not fold it -- a reply naming that outcome would read as a rendered tab at every site the predicate serves`);
        }
    }

    // 9. PUSH KINDS: what chrome pushes on the one state event vs what the
    // frontend subscribes through WebTabChannel.onPush, both directions.
    const pushedKinds = [
        // Phase 33: a push kind may carry a hyphen (bookmarks-changed); [A-Za-z]+ alone left it underived.
        ...derive(src[API], /sendWebTabPush\(\s*[\w$.]+\s*,\s*\{\s*kind:\s*"([A-Za-z][A-Za-z-]*)"/g),
        ...derive(src[API], /sendAsyncMessage\(\s*"PowerBrowserWebTabState"\s*,\s*\{\s*kind:\s*"([A-Za-z][A-Za-z-]*)"/g),
    ];
    const frontendFiles = Object.keys(src).filter(file => file.startsWith(`${CHROME_BAR_DIR}/`) || file.startsWith(`${TAB_URIS_DIR}/`));
    const frontendText = frontendFiles.map(file => src[file]).join('\n');
    const constants = new Map(derive(frontendText, /export const ([A-Za-z_$][\w$]*\s*=\s*'[A-Za-z][A-Za-z-]*')/g)
        .map(pair => /^(\S+)\s*=\s*'([A-Za-z][A-Za-z-]*)'$/.exec(pair)).map(m => [m[1], m[2]]));
    const subscribedKinds = derive(frontendText, /onPush\(\s*'([A-Za-z][A-Za-z-]*)'/g);
    // `\s*,` after the identifier: the method's own declaration (`onPush(kind: string`) is not a call.
    for (const ident of derive(frontendText, /onPush\(\s*([A-Za-z_$][\w$]*)\s*,/g)) {
        if (constants.has(ident)) {
            subscribedKinds.push(constants.get(ident));
        } else {
            failures.push(`push-kinds: onPush(${ident}, …) names an identifier with no export const ${ident} = '<kind>' in the tab-uris or chrome-bar sources, so its kind cannot be derived`);
        }
    }
    if (pushedKinds.length === 0) {
        failures.push(`push-kinds: ${API}: derived ZERO pushed kinds -- the parse found nothing, so this comparison proves nothing (broken instrument, never a clean pass)`);
    }
    if (subscribedKinds.length === 0) {
        failures.push('push-kinds: derived ZERO onPush subscriptions in the tab-uris and chrome-bar sources -- the parse found nothing, so this comparison proves nothing (broken instrument, never a clean pass)');
    }
    if (pushedKinds.length && subscribedKinds.length) {
        const { surplus, missing } = diff(pushedKinds, subscribedKinds);
        if (surplus.length) {
            failures.push(`push-kinds: chrome pushes kinds no frontend source subscribes to: ${surplus.join(', ')}`);
        }
        if (missing.length) {
            failures.push(`push-kinds: the frontend subscribes to kinds chrome never pushes: ${missing.join(', ')}`);
        }
    }

    // 10. ACTION ROUTING: the WEB_TAB_ACTION_KINDS Set literal is exactly the
    // case arms of handleWebTabAction (a kind in one and not the other is
    // either unroutable or routed to "unknown kind").
    const setLiteral = /const WEB_TAB_ACTION_KINDS = new Set\(\[([^\]]*)\]\)/.exec(src[API]);
    const routed = setLiteral ? derive(setLiteral[1], /"([A-Za-z]+)"/g) : [];
    const actionArms = derive(functionBody(src[API], 'handleWebTabAction'), /case "([A-Za-z]+)"/g);
    if (routed.length === 0 || actionArms.length === 0) {
        failures.push(`action-routing: ${API}: derived ZERO WEB_TAB_ACTION_KINDS members (${routed.length}) or handleWebTabAction arms (${actionArms.length}) -- the parse found nothing, so this comparison proves nothing (broken instrument, never a clean pass)`);
    } else {
        const { surplus, missing } = diff(routed, actionArms);
        if (surplus.length) {
            failures.push(`action-routing: WEB_TAB_ACTION_KINDS routes kinds handleWebTabAction has no case arm for: ${surplus.join(', ')}`);
        }
        if (missing.length) {
            failures.push(`action-routing: handleWebTabAction has case arms WEB_TAB_ACTION_KINDS does not route: ${missing.join(', ')}`);
        }
    }

    // 11. CLASSIFICATION (privileged-kind rule): every webTab arm in either
    // handler has one class, and each privileged kind is listed with its reason
    // and sent only from its owning file.
    if (apiKinds.length) {
        const { surplus, missing } = diff(apiKinds, [...kindClasses.keys()]);
        if (surplus.length) {
            failures.push(`classification: webTab arms with no KIND_CLASSES entry (classify each under the privileged-kind rule): ${surplus.join(', ')}`);
        }
        if (missing.length) {
            failures.push(`classification: KIND_CLASSES entries with no case arm left (stale): ${missing.join(', ')}`);
        }
    }
    for (const [kind, kindClass] of kindClasses) {
        if (!KIND_CLASS_NAMES.includes(kindClass)) {
            failures.push(`classification: ${kind} has the unknown class '${kindClass}'`);
        }
    }
    failures.push(...checkWebTabPrivileged(src, kindClasses, privilegedKinds));

    failures.push(...checkStoreKinds(src, storeClasses));
    return failures;
}

/**
 * Privileged webTab kinds (Phase 31 plan 02): a kind that changes site state
 * outside a tab's own navigation, lifecycle or selection. The frontend method is
 * the kind without its `webTab` prefix, first letter lower-cased
 * (webTabSetPermission -> setPermission). Each privileged kind must have that
 * method in web-tab.ts, be called only from the chrome-bar event-handler tree,
 * and be named or called by no command or keybinding file.
 */
function checkWebTabPrivileged(src, classes, privilegedKinds) {
    const failures = [];
    const commandLike = Object.entries(src).filter(([file, text]) =>
        (text.includes('registerCommand(') || text.includes('registerKeybinding(')) && file.startsWith(`${CHROME_BAR_DIR}/`));
    const privileged = [...classes].filter(([, kindClass]) => kindClass === 'privileged').map(([kind]) => kind);
    const listed = diff(privileged, [...privilegedKinds.keys()]);
    for (const kind of listed.surplus) {
        failures.push(`classification: the privileged webTab kind ${kind} is not listed in PRIVILEGED_WEB_TAB_KINDS with its reason and owning file`);
    }
    for (const kind of listed.missing) {
        failures.push(`classification: PRIVILEGED_WEB_TAB_KINDS lists ${kind}, which KIND_CLASSES does not class privileged (stale)`);
    }
    const frontendFiles = Object.keys(src).filter(file => file.startsWith(`${CHROME_BAR_DIR}/`) || file.startsWith(`${TAB_URIS_DIR}/`));
    for (const kind of privileged) {
        for (const [file, text] of commandLike) {
            if (new RegExp(`\\b${kind}\\b`).test(text)) {
                failures.push(`classification: the privileged webTab kind ${kind} is named by a command or keybinding file, ${file}`);
            }
        }
        const owner = privilegedKinds.get(kind)?.owner;
        if (!owner || owner === WEB_TAB) {
            continue;
        }
        // A literal sender: the kind literal lives in its owning file and the web-tab.ts union, nowhere else.
        const literal = new RegExp(`kind:\\s*['"]${kind}['"]`);
        if (!literal.test(src[owner] ?? '')) {
            failures.push(`classification: the privileged webTab kind ${kind} is no longer sent from its owning file ${owner}`);
        }
        for (const file of frontendFiles) {
            if (file !== owner && file !== WEB_TAB && literal.test(src[file])) {
                failures.push(`classification: the privileged webTab kind ${kind} is sent from ${file}, outside its owning file ${owner}`);
            }
        }
    }
    for (const kind of privileged.filter(name => privilegedKinds.get(name)?.owner === WEB_TAB)) {
        const method = kind.replace(/^webTab/, '').replace(/^[A-Z]/, c => c.toLowerCase());
        if (!new RegExp(`^\\s+${method}\\(`, 'm').test(src[WEB_TAB] ?? '')) {
            failures.push(`classification: the privileged webTab kind ${kind} has no frontend method ${method}( in ${WEB_TAB}`);
        }
        for (const [file, text] of Object.entries(src)) {
            if (text.includes(`.${method}(`) && !file.startsWith(`${CHROME_BAR_DIR}/`) && file !== WEB_TAB) {
                failures.push(`classification: the privileged webTab kind ${kind} is called outside the chrome-bar event-handler tree, in ${file}`);
            }
            if (text.includes(`.${method}(`) && file.startsWith(`${CHROME_BAR_DIR}/`) && (text.includes('registerCommand(') || text.includes('registerKeybinding('))) {
                failures.push(`classification: the privileged webTab kind ${kind} is called from a command or keybinding file, ${file}`);
            }
        }
    }
    return failures;
}

/** Rule 12 over comment-stripped sources `src`: store-kind routing, classification and the network/privileged fences. */
function checkStoreKinds(src, storeClasses) {
    const failures = [];
    const setLiteral = /const STORE_REQUEST_KINDS = new Set\(\[([^\]]*)\]\)/.exec(src[API]);
    const members = setLiteral ? derive(setLiteral[1], /"([A-Za-z]+)"/g) : [];
    const arms = derive(functionBody(src[API], 'handleStoreRequest'), /case "([A-Za-z]+)"/g);
    if (members.length === 0 || arms.length === 0) {
        failures.push(`store-kinds: ${API}: derived ZERO STORE_REQUEST_KINDS members (${members.length}) or handleStoreRequest arms (${arms.length}) -- the parse found nothing, so this comparison proves nothing (broken instrument, never a clean pass)`);
        return failures;
    }
    const routing = diff(members, arms);
    if (routing.surplus.length) {
        failures.push(`store-kinds: STORE_REQUEST_KINDS routes kinds handleStoreRequest has no case arm for: ${routing.surplus.join(', ')}`);
    }
    if (routing.missing.length) {
        failures.push(`store-kinds: handleStoreRequest has case arms STORE_REQUEST_KINDS does not route: ${routing.missing.join(', ')}`);
    }
    const classed = diff(members, [...storeClasses.keys()]);
    if (classed.surplus.length) {
        failures.push(`store-kinds: store kinds with no STORE_KIND_CLASSES entry (classify each under the privileged-kind rule): ${classed.surplus.join(', ')}`);
    }
    if (classed.missing.length) {
        failures.push(`store-kinds: STORE_KIND_CLASSES entries with no store kind left (stale): ${classed.missing.join(', ')}`);
    }
    for (const [kind, kindClass] of storeClasses) {
        if (!STORE_KIND_CLASS_NAMES.includes(kindClass)) {
            failures.push(`store-kinds: ${kind} has the unknown class '${kindClass}'`);
        }
    }

    const protocol = src[STORE_PROTOCOL] ?? '';
    const writeFields = /TAB_STORE_WRITE_FIELDS[^=]*=\s*\{([\s\S]*?)\n\};/.exec(protocol);
    const writeOps = writeFields ? derive(writeFields[1], /^\s*([A-Za-z]+):/gm) : [];
    const relayLiteral = /TAB_STORE_RELAY_KINDS[^=]*=\s*\[([\s\S]*?)\];/.exec(protocol);
    if (!relayLiteral || writeOps.length === 0) {
        failures.push(`store-kinds: ${STORE_PROTOCOL}: TAB_STORE_RELAY_KINDS (${relayLiteral ? 'found' : 'missing'}) or TAB_STORE_WRITE_FIELDS keys (${writeOps.length}) did not derive (broken instrument, never a clean pass)`);
    } else {
        const relayed = new Set(derive(relayLiteral[1], /'([A-Za-z]+)'/g));
        if (relayLiteral[1].includes('...TAB_STORE_WRITE_OPS')) {
            writeOps.forEach(op => relayed.add(op));
        }
        for (const kind of MENU_ONLY_STORE_KINDS) {
            if (relayed.has(kind)) {
                failures.push(`store-kinds: the menu-only kind ${kind} is relayed from the backend (TAB_STORE_RELAY_KINDS)`);
            }
        }
        for (const [kind, kindClass] of storeClasses) {
            if ((kindClass === 'network' || kindClass === 'privileged' || kindClass === 'lifecycle' || kindClass === 'window-chrome') && relayed.has(kind)) {
                failures.push(`store-kinds: the ${kindClass} kind ${kind} is relayed from the backend (TAB_STORE_RELAY_KINDS)`);
            }
        }
    }

    for (const [kind, kindClass] of storeClasses) {
        if (kindClass !== 'privileged' && kindClass !== 'lifecycle' && kindClass !== 'window-chrome') {
            continue;
        }
        // A privileged kind is sent from the pill or the chrome bar widget (an extension kind from the extension widget alone); a lifecycle or window-chrome kind from the
        // widget alone (its Quit row; its Full Screen handler, which the command reaches through an opener).
        const homes = kindClass === 'privileged' ? privilegedCallersOf(kind) : [CHROME_BAR_WIDGET_FILE];
        const home = homes.join(' or ');
        const callers = new Set([STORE_CLIENT, ...homes]);
        if (!new RegExp(`^\\s+(?:async\\s+)?${kind}\\(`, 'm').test(src[STORE_CLIENT] ?? '')) {
            failures.push(`store-kinds: the ${kindClass} kind ${kind} has no same-named ChromeStoreClient method ${kind}( in ${STORE_CLIENT}`);
        }
        const named = new RegExp(`\\b${kind}\\b`);
        for (const [file, text] of Object.entries(src)) {
            if (!callers.has(file) && text.includes(`.${kind}(`)) {
                failures.push(`store-kinds: the ${kindClass} kind ${kind} is called outside ${home}, in ${file}`);
            }
            if (kindClass !== 'window-chrome' && (text.includes('registerCommand(') || text.includes('registerKeybinding(')) && named.test(text)) {
                failures.push(`store-kinds: the ${kindClass} kind ${kind} is named by a command or keybinding file, ${file}`);
            }
        }
    }
    return failures;
}

function readSources() {
    const files = new Set([API, CHILD, CLIENT, BWC, WEB_TAB, MODULE]);
    // Recursive (30-01): the pill lives under chrome-bar/src/browser/address-bar/.
    for (const dir of [CHROME_BAR_DIR, TAB_URIS_DIR]) {
        for (const name of readdirSync(join(REPO_ROOT, dir), { recursive: true })) {
            if (/\.tsx?$/.test(name)) {
                files.add(`${dir}/${name}`);
            }
        }
    }
    return Object.fromEntries([...files].map(file => [file, readFileSync(join(REPO_ROOT, file), 'utf8')]));
}

/** Replace inside one region of a source only, leaving the rest byte-identical. */
function replaceWithin(text, regionStart, regionEnd, from, to) {
    const start = text.indexOf(regionStart);
    const end = text.indexOf(regionEnd, start);
    return text.slice(0, start) + text.slice(start, end).replace(from, to) + text.slice(end);
}

/**
 * Proves every rule discriminates before it is trusted. Each case mutates
 * one source in memory, asserts the mutation landed, and requires the
 * failure text to name the drifted token.
 */
function selfTest() {
    const clean = readSources();
    const baseline = checkBridge(clean);
    if (baseline.length !== 0) {
        console.error('verify-web-tab-bridge --self-test: FAIL -- the unmodified tree is already red, so the planted-fault results below would be meaningless:');
        baseline.forEach(f => console.error(`  ${f}`));
        return 1;
    }

    const WIDGET = `${CHROME_BAR_DIR}/chrome-bar-widget.tsx`;
    const COMMANDS = `${CHROME_BAR_DIR}/chrome-bar-commands.ts`;
    const KEYBINDINGS = `${CHROME_BAR_DIR}/chrome-bar-keybindings.ts`;
    // Rule 12 plants: a planted store kind is a Set member plus a case arm, so routing stays in parity.
    const withStoreKind = kind => replaceWithin(
        clean[API].replace('const STORE_REQUEST_KINDS = new Set([', `const STORE_REQUEST_KINDS = new Set([\n  "${kind}",`),
        'async function handleStoreRequest(', '\n}', 'case "resolveTypedAddress": {', `case "${kind}": { break; }\n      case "resolveTypedAddress": {`);
    const relaying = kind => clean[STORE_PROTOCOL].replace("    'queryTabsWithPlaces',\n", `    'queryTabsWithPlaces',\n    '${kind}',\n`);
    const classedAs = (kind, kindClass) => new Map([...STORE_KIND_CLASSES, [kind, kindClass]]);
    const cases = [
        {
            name: 'planted unclassified store kind',
            sources: { ...clean, [API]: withStoreKind('plantedKind') },
            expect: 'store kinds with no STORE_KIND_CLASSES entry (classify each under the privileged-kind rule): plantedKind',
        },
        {
            name: 'planted stale store-kind class entry',
            sources: clean,
            storeClasses: classedAs('plantedStale', 'read'),
            expect: 'STORE_KIND_CLASSES entries with no store kind left (stale): plantedStale',
        },
        {
            name: 'planted unclassified openStockPage',
            sources: clean,
            storeClasses: new Map([...STORE_KIND_CLASSES].filter(([kind]) => kind !== 'openStockPage')),
            expect: 'store kinds with no STORE_KIND_CLASSES entry (classify each under the privileged-kind rule): openStockPage',
        },
        {
            name: 'planted openStockPage in the backend relay',
            sources: { ...clean, [STORE_PROTOCOL]: relaying('openStockPage') },
            expect: 'the menu-only kind openStockPage is relayed from the backend (TAB_STORE_RELAY_KINDS)',
        },
        {
            name: 'planted privileged kind in the backend relay',
            sources: { ...clean, [API]: withStoreKind('plantedPrivileged'), [STORE_PROTOCOL]: relaying('plantedPrivileged') },
            storeClasses: classedAs('plantedPrivileged', 'privileged'),
            expect: 'the privileged kind plantedPrivileged is relayed from the backend',
        },
        {
            name: 'planted privileged kind called from chrome-bar-commands.ts',
            sources: { ...clean, [API]: withStoreKind('plantedPrivileged'), [COMMANDS]: clean[COMMANDS] + '\nvoid this.store.plantedPrivileged();\n' },
            storeClasses: classedAs('plantedPrivileged', 'privileged'),
            expect: `the privileged kind plantedPrivileged is called outside ${PRIVILEGED_CALLERS.join(' or ')}, in ${COMMANDS}`,
        },
        {
            name: 'planted privileged call in a nested chrome-bar file',
            sources: { ...clean, [`${CHROME_BAR_DIR}/nested/planted.ts`]: 'void this.store.readClipboardText();\n' },
            expect: `the privileged kind readClipboardText is called outside ${PRIVILEGED_CALLERS.join(' or ')}, in ${CHROME_BAR_DIR}/nested/planted.ts`,
        },
        {
            name: 'planted privileged kind named in chrome-bar-keybindings.ts',
            sources: { ...clean, [API]: withStoreKind('plantedPrivileged'), [KEYBINDINGS]: clean[KEYBINDINGS] + "\nconst plantedRow = 'plantedPrivileged';\n" },
            storeClasses: classedAs('plantedPrivileged', 'privileged'),
            expect: `the privileged kind plantedPrivileged is named by a command or keybinding file, ${KEYBINDINGS}`,
        },
        {
            name: 'planted unclassified quitRequest',
            sources: clean,
            storeClasses: new Map([...STORE_KIND_CLASSES].filter(([kind]) => kind !== 'quitRequest')),
            expect: 'store kinds with no STORE_KIND_CLASSES entry (classify each under the privileged-kind rule): quitRequest',
        },
        {
            name: 'planted quitRequest in the backend relay',
            sources: { ...clean, [STORE_PROTOCOL]: relaying('quitRequest') },
            expect: 'the lifecycle kind quitRequest is relayed from the backend (TAB_STORE_RELAY_KINDS)',
        },
        {
            name: 'planted quitRequest without its client method',
            sources: { ...clean, [STORE_CLIENT]: clean[STORE_CLIENT].replace('async quitRequest(', 'async quitRequestGone(') },
            expect: 'the lifecycle kind quitRequest has no same-named ChromeStoreClient method quitRequest(',
        },
        {
            name: 'planted lifecycle call from chrome-bar-commands.ts',
            sources: { ...clean, [COMMANDS]: clean[COMMANDS] + '\nvoid this.store.quitRequest();\n' },
            expect: `the lifecycle kind quitRequest is called outside ${CHROME_BAR_WIDGET_FILE}, in ${COMMANDS}`,
        },
        {
            name: 'planted lifecycle kind named in chrome-bar-keybindings.ts',
            sources: { ...clean, [KEYBINDINGS]: clean[KEYBINDINGS] + "\nconst plantedRow = 'quitRequest';\n" },
            expect: `the lifecycle kind quitRequest is named by a command or keybinding file, ${KEYBINDINGS}`,
        },
        {
            name: 'window-chrome-relayed',
            sources: { ...clean, [STORE_PROTOCOL]: relaying('fullScreen') },
            expect: 'the window-chrome kind fullScreen is relayed from the backend (TAB_STORE_RELAY_KINDS)',
        },
        {
            name: 'planted unclassified fullScreen',
            sources: clean,
            storeClasses: new Map([...STORE_KIND_CLASSES].filter(([kind]) => kind !== 'fullScreen')),
            expect: 'store kinds with no STORE_KIND_CLASSES entry (classify each under the privileged-kind rule): fullScreen',
        },
        {
            name: 'planted fullScreen without its client method',
            sources: { ...clean, [STORE_CLIENT]: clean[STORE_CLIENT].replace('async fullScreen(', 'async fullScreenGone(') },
            expect: 'the window-chrome kind fullScreen has no same-named ChromeStoreClient method fullScreen(',
        },
        {
            name: 'planted fullScreen call from chrome-bar-commands.ts',
            sources: { ...clean, [COMMANDS]: clean[COMMANDS] + '\nvoid this.store.fullScreen();\n' },
            expect: `the window-chrome kind fullScreen is called outside ${CHROME_BAR_WIDGET_FILE}, in ${COMMANDS}`,
        },
        {
            name: 'planted fullScreen arm without its kind',
            sources: { ...clean, [API]: clean[API].replace('  "fullScreen",\n]);', ']);') },
            expect: 'handleStoreRequest has case arms STORE_REQUEST_KINDS does not route: fullScreen',
        },
        {
            name: 'planted network kind in the backend relay',
            sources: { ...clean, [API]: withStoreKind('plantedNetwork'), [STORE_PROTOCOL]: relaying('plantedNetwork') },
            storeClasses: classedAs('plantedNetwork', 'network'),
            expect: 'the network kind plantedNetwork is relayed from the backend',
        },
        {
            name: 'planted chrome-only kind',
            sources: { ...clean, [API]: clean[API] + '\ncase "webTabPlanted": {}\n' },
            expect: 'webTabPlanted',
        },
        {
            name: 'planted frontend kind respelling',
            sources: { ...clean, [WEB_TAB]: clean[WEB_TAB].replaceAll("kind: 'webTabClose'", "kind: 'webTabCloze'") },
            expect: 'webTabClose',
        },
        {
            name: 'planted child state-event respelling',
            sources: { ...clean, [CHILD]: clean[CHILD].replaceAll('"PowerBrowserWebTabState"', '"PowerBrowserWebtabState"') },
            expect: 'PowerBrowserWebTabState',
        },
        {
            name: 'planted stock-window reach in the chrome bar widget',
            sources: { ...clean, [WIDGET]: clean[WIDGET] + '\nvoid this.commands.executeCommand(OPEN_BROWSER_WINDOW_COMMAND_ID);\n' },
            expect: `${WIDGET}: reaches ${STOCK_WINDOW_COMMAND}`,
        },
        {
            name: 'planted second stock-window reach in chrome-bar-commands.ts (outside New Window)',
            sources: { ...clean, [COMMANDS]: clean[COMMANDS] + '\nconst planted = () => this.commands.executeCommand(OPEN_BROWSER_WINDOW_COMMAND_ID);\n' },
            expect: `${COMMANDS}: reaches ${STOCK_WINDOW_COMMAND}`,
        },
        {
            name: 'planted popup in the chrome bar',
            sources: { ...clean, [WIDGET]: clean[WIDGET] + "\nwindow.open(url, '_blank');\n" },
            expect: 'window.open',
        },
        {
            name: 'planted priority below the stock http handler',
            sources: { ...clean, [WEB_TAB]: clean[WEB_TAB].replace('? 1000 : 0', '? 100 : 0') },
            expect: '100',
        },
        {
            name: 'planted overlay without maychangeremoteness',
            sources: { ...clean, [API]: clean[API].replace(/^\s*maychangeremoteness: "true",\n/m, '') },
            expect: 'maychangeremoteness',
        },
        {
            // 35-06 (D-03): AutoCompleteParent reads browser.autoCompletePopup from this attribute.
            name: 'planted overlay without autocompletepopup',
            sources: { ...clean, [API]: clean[API].replace(/^\s*autocompletepopup: "PopupAutoComplete",\n/m, '\n') },
            expect: 'autocompletepopup attribute',
        },
        {
            name: 'planted wall without the primary check',
            sources: {
                ...clean,
                [API]: replaceWithin(clean[API], 'function groupSenderIsTheia(', '\n}', '"primary"', '"main"'),
            },
            expect: 'primary',
        },
        {
            name: 'planted loss of the openStockTab send (positive control)',
            sources: { ...clean, [BWC]: clean[BWC].replace('kind: OPEN_STOCK_TAB_KIND', "kind: 'plantedKind'") },
            expect: `${BWC}: no longer sends OPEN_STOCK_TAB_KIND`,
        },
        {
            name: 'planted second openStockTab sender in the chrome bar',
            sources: { ...clean, [`${CHROME_BAR_DIR}/planted-sender.ts`]: "document.dispatchEvent(new CustomEvent('PowerBrowserGroupRequest', { bubbles: true, detail: { msg: { kind: 'openStockTab', url } } }));\n" },
            expect: `${CHROME_BAR_DIR}/planted-sender.ts: sends openStockTab`,
        },
        {
            name: 'dead-channel-opens',
            sources: { ...clean, [BWC]: replaceWithin(clean[BWC], 'protected async openBrowserWindow(', '\n    }', 'throw new Error(', "window.open(target, '_blank');\n        throw new Error(") },
            expect: 'dead-channel branch of openBrowserWindow calls window.open',
        },
        {
            name: 'planted dead-channel branch that no longer throws',
            sources: { ...clean, [BWC]: replaceWithin(clean[BWC], 'protected async openBrowserWindow(', '\n    }', 'throw new Error(', 'console.error(') },
            expect: 'dead-channel branch of openBrowserWindow no longer throws',
        },
        {
            name: 'planted dead-channel error that names the command id',
            sources: { ...clean, [BWC]: replaceWithin(clean[BWC], 'protected async openBrowserWindow(', '\n    }', "throw new Error(cause === 'not-web'", "throw new Error(OPEN_BROWSER_WINDOW_COMMAND_ID + cause === 'not-web'") },
            expect: 'never the command id or an inline string',
        },
        {
            name: 'planted copy that drops the product name',
            sources: { ...clean, [BWC]: clean[BWC].replace("'PowerBrowser could not open a browser window because", "'Could not open a browser window because") },
            expect: 'OPEN_BROWSER_WINDOW_NO_ANSWER_COPY does not start by naming PowerBrowser',
        },
        {
            name: 'planted click that never re-probes',
            sources: { ...clean, [BWC]: replaceWithin(clean[BWC], 'protected async openBrowserWindow(', '\n    }', 'await this.probeChannel();', '') },
            expect: 'no longer re-probes a channel not known alive',
        },
        {
            name: 'planted inline lost-reply spelling',
            sources: { ...clean, [WEB_TAB]: clean[WEB_TAB].replaceAll('WebTabWidget.lostReply(reply)', 'reply.ok !== true') },
            expect: 'folds a reply into lost-view state with the inline expression',
        },
        {
            name: 'planted unfolded outcome constant',
            sources: { ...clean, [WEB_TAB]: clean[WEB_TAB].replace(' || reply.where === REFUSED_SCHEME_OUTCOME', '') },
            expect: 'does not fold it',
        },
        {
            name: 'planted chrome-only push kind',
            sources: { ...clean, [API]: clean[API] + '\nsendWebTabPush(theiaBrowser, { kind: "plantedPush" });\n' },
            expect: 'chrome pushes kinds no frontend source subscribes to: plantedPush',
        },
        {
            // Phase 35 (35-02): the overLink status line's one subscription removed.
            name: 'planted overLink subscription removed',
            sources: { ...clean, [WIDGET]: clean[WIDGET].replace(/\s*this\.toDispose\.push\(this\.webTabs\.onPush\('overLink'[\s\S]*?\n {8}\}\)\);/, '') },
            expect: 'chrome pushes kinds no frontend source subscribes to: overLink',
        },
        {
            name: 'planted frontend-only subscription',
            sources: { ...clean, [WIDGET]: clean[WIDGET] + "\nthis.channel.onPush('plantedSub', () => undefined);\n" },
            expect: 'the frontend subscribes to kinds chrome never pushes: plantedSub',
        },
        {
            name: 'planted webTabStop dropped from WEB_TAB_ACTION_KINDS',
            sources: { ...clean, [API]: clean[API].replace(/(const WEB_TAB_ACTION_KINDS = new Set\(\[)"webTabStop",\s*/, '$1') },
            expect: 'handleWebTabAction has case arms WEB_TAB_ACTION_KINDS does not route: webTabStop',
        },
        {
            name: 'planted webTabBarAction dropped from WEB_TAB_ACTION_KINDS',
            sources: { ...clean, [API]: clean[API].replace(/(const WEB_TAB_ACTION_KINDS = new Set\(\[[^\]]*?),\s*"webTabBarAction"/, '$1') },
            expect: 'handleWebTabAction has case arms WEB_TAB_ACTION_KINDS does not route: webTabBarAction',
        },
        {
            name: 'planted extra arm in handleWebTabAction',
            sources: {
                ...clean,
                [API]: replaceWithin(clean[API], 'async function handleWebTabAction(', '\n}', 'switch (kind) {', 'switch (kind) {\n    case "webTabPlantedArm": { break; }'),
            },
            expect: 'webTab arms with no KIND_CLASSES entry (classify each under the privileged-kind rule): webTabPlantedArm',
        },
        // Phase 36 plan 01: the adopt ack's arm renamed away leaves an unclassified arm and a stale entry, both by name.
        {
            name: 'webTabAdopt arm unclassified (renamed away from its KIND_CLASSES entry)',
            sources: { ...clean, [API]: clean[API].replace('case "webTabAdopt": {', 'case "webTabAdoptUnclassified": {') },
            expect: 'webTab arms with no KIND_CLASSES entry (classify each under the privileged-kind rule): webTabAdoptUnclassified',
        },
        // Phase 31 plan 02: the privileged webTab class is admitted only under its call-site rules.
        {
            name: 'planted privileged permission call from a command file',
            sources: {
                ...clean,
                [COMMANDS]: clean[COMMANDS] + "\nexport const plantedCommand = () => { registerCommand({}); currentWebTab()?.setPermission('camera', 'allow'); };\n",
            },
            expect: `the privileged webTab kind webTabSetPermission is called from a command or keybinding file, ${COMMANDS}`,
        },
        {
            name: 'planted privileged permission call outside the chrome-bar tree',
            sources: { ...clean, [MODULE]: clean[MODULE] + "\nexport const plantedCall = (tab) => tab.setPermission('camera', 'allow');\n" },
            expect: `the privileged webTab kind webTabSetPermission is called outside the chrome-bar event-handler tree, in ${MODULE}`,
        },
        {
            name: 'planted privileged kind named in a keybinding file',
            sources: { ...clean, [KEYBINDINGS]: clean[KEYBINDINGS] + "\nexport const plantedKey = 'webTabSetPermission'; registerKeybinding({});\n" },
            expect: `the privileged webTab kind webTabSetPermission is named by a command or keybinding file, ${KEYBINDINGS}`,
        },
        // Phase 33 plants: the six new store kinds and the bookmarks-changed push.
        {
            name: 'planted unclassified clearHistory',
            sources: clean,
            storeClasses: new Map([...STORE_KIND_CLASSES].filter(([kind]) => kind !== 'clearHistory')),
            expect: 'store kinds with no STORE_KIND_CLASSES entry (classify each under the privileged-kind rule): clearHistory',
        },
        {
            name: 'planted stale bookmarkPage class (kind dropped from the boundary)',
            sources: {
                ...clean,
                [API]: replaceWithin(clean[API].replace('  "bookmarkPage",\n', ''), 'async function handleStoreRequest(', '\n}', 'case "bookmarkPage": {', 'case "bookmarkPageGone": {'),
            },
            expect: 'STORE_KIND_CLASSES entries with no store kind left (stale): bookmarkPage',
        },
        {
            name: 'planted clearHistory in the backend relay',
            sources: { ...clean, [STORE_PROTOCOL]: relaying('clearHistory') },
            expect: 'the privileged kind clearHistory is relayed from the backend',
        },
        {
            name: 'planted bookmarkPage called from chrome-bar-commands.ts',
            sources: { ...clean, [COMMANDS]: clean[COMMANDS] + "\nvoid this.store.bookmarkPage('https://example.com/', '');\n" },
            expect: `the privileged kind bookmarkPage is called outside ${PRIVILEGED_CALLERS.join(' or ')}, in ${COMMANDS}`,
        },
        {
            // Phase 38 plan 02 (D-11): pin and remove stay with the extension widget's handlers.
            name: 'planted extensionRemove called from chrome-bar-commands.ts',
            sources: { ...clean, [COMMANDS]: clean[COMMANDS] + "\nvoid this.store.extensionRemove(id);\n" },
            expect: `the privileged kind extensionRemove is called outside ${EXTENSION_CALLERS.join(' or ')}, in ${COMMANDS}`,
        },
        {
            // 38-REVIEW WR-08: one fence per group. An earlier privileged kind from the extension widget, an extension kind from the pill or the chrome bar widget.
            name: 'planted readClipboardText called from the extension widget',
            sources: { ...clean, [EXTENSION_ACTIONS_WIDGET_FILE]: clean[EXTENSION_ACTIONS_WIDGET_FILE] + "\nvoid this.store.readClipboardText();\n" },
            expect: `the privileged kind readClipboardText is called outside ${PRIVILEGED_CALLERS.join(' or ')}, in ${EXTENSION_ACTIONS_WIDGET_FILE}`,
        },
        {
            name: 'planted extensionRemove called from the pill',
            sources: { ...clean, [CHROME_BAR_WIDGET]: clean[CHROME_BAR_WIDGET] + "\nvoid this.store.extensionRemove(id);\n" },
            expect: `the privileged kind extensionRemove is called outside ${EXTENSION_CALLERS.join(' or ')}, in ${CHROME_BAR_WIDGET}`,
        },
        {
            name: 'planted extensionClick called from the chrome bar widget',
            sources: { ...clean, [CHROME_BAR_WIDGET_FILE]: clean[CHROME_BAR_WIDGET_FILE] + "\nvoid this.store.extensionClick(id);\n" },
            expect: `the privileged kind extensionClick is called outside ${EXTENSION_CALLERS.join(' or ')}, in ${CHROME_BAR_WIDGET_FILE}`,
        },
        {
            name: 'planted extensionPin named in chrome-bar-keybindings.ts',
            sources: { ...clean, [KEYBINDINGS]: clean[KEYBINDINGS] + "\nconst plantedRow = 'extensionPin';\n" },
            expect: `the privileged kind extensionPin is named by a command or keybinding file, ${KEYBINDINGS}`,
        },
        {
            name: 'planted clearHistory named in chrome-bar-keybindings.ts',
            sources: { ...clean, [KEYBINDINGS]: clean[KEYBINDINGS] + "\nconst plantedRow = 'clearHistory';\n" },
            expect: `the privileged kind clearHistory is named by a command or keybinding file, ${KEYBINDINGS}`,
        },
        {
            name: 'planted removeBookmark without its client method',
            sources: { ...clean, [STORE_CLIENT]: clean[STORE_CLIENT].replace(/^(\s+)removeBookmark\(/m, '$1removeBookmarkGone(') },
            expect: `the privileged kind removeBookmark has no same-named ChromeStoreClient method removeBookmark( in ${STORE_CLIENT}`,
        },
        {
            name: 'planted chrome-only bookmarks-changed push (subscription dropped)',
            sources: { ...clean, [WEB_TAB]: clean[WEB_TAB].replace("onPush('bookmarks-changed'", "onPush('bookmarksGone'") },
            expect: 'chrome pushes kinds no frontend source subscribes to: bookmarks-changed',
        },
        {
            name: 'planted bookmarks-changed subscription with no chrome push',
            sources: { ...clean, [API]: clean[API].replace('{ kind: "bookmarks-changed" }', '{ kind: "bookmarksGone" }') },
            expect: 'the frontend subscribes to kinds chrome never pushes: bookmarks-changed',
        },
        {
            name: 'planted loss of the privileged frontend method',
            sources: { ...clean, [WEB_TAB]: clean[WEB_TAB].replace(/^(\s+)setPermission\(/m, '$1setPermissionGone(') },
            expect: 'the privileged webTab kind webTabSetPermission has no frontend method setPermission(',
        },
        // Phase 35 plan 03 (D-09): the page menu pick, the first literal-sender privileged kind.
        {
            name: 'planted unclassified webTabContextMenuAction arm',
            sources: clean,
            kindClasses: new Map([...KIND_CLASSES].filter(([kind]) => kind !== 'webTabContextMenuAction')),
            expect: 'webTab arms with no KIND_CLASSES entry (classify each under the privileged-kind rule): webTabContextMenuAction',
        },
        {
            name: 'planted privileged kind missing from PRIVILEGED_WEB_TAB_KINDS',
            sources: clean,
            privilegedKinds: new Map([...PRIVILEGED_WEB_TAB_KINDS].filter(([kind]) => kind !== 'webTabContextMenuAction')),
            expect: 'the privileged webTab kind webTabContextMenuAction is not listed in PRIVILEGED_WEB_TAB_KINDS',
        },
        {
            name: 'planted page menu pick sent from a second chrome-bar file',
            sources: { ...clean, [WIDGET]: clean[WIDGET] + "\nexport const plantedPick = (channel) => channel.request({ kind: 'webTabContextMenuAction', tabId: 'x', menuId: 1, itemId: null });\n" },
            expect: `the privileged webTab kind webTabContextMenuAction is sent from ${WIDGET}, outside its owning file ${PAGE_CONTEXT_MENU}`,
        },
        {
            name: 'planted page menu without its pageContextMenu subscription',
            sources: { ...clean, [PAGE_CONTEXT_MENU]: clean[PAGE_CONTEXT_MENU].replace("this.channel.onPush('pageContextMenu',", 'this.channel.onPushGone(') },
            expect: 'chrome pushes kinds no frontend source subscribes to: pageContextMenu',
        },
        {
            // Phase 35 (35-05, D-08): the freeze-frame still's one subscription removed.
            name: 'planted web tab without its pageStill subscription',
            sources: { ...clean, [WEB_TAB]: clean[WEB_TAB].replace("this.onPush('pageStill',", 'this.onPushGone(') },
            expect: 'chrome pushes kinds no frontend source subscribes to: pageStill',
        },
    ];

    let failed = 0;
    // Positive control (Phase 33): the widget is a sanctioned privileged caller, so its clearHistory call stays green.
    const widgetCall = checkBridge({ ...clean, [WIDGET]: clean[WIDGET] + "\nvoid this.store.clearHistory('today');\n" });
    if (widgetCall.length) {
        console.error(`verify-web-tab-bridge --self-test: FAIL -- a privileged call from ${WIDGET} went red, but it is a sanctioned caller: ${widgetCall.join(' | ')}`);
        failed++;
    } else {
        console.log(`  ok  privileged clearHistory call from ${WIDGET} -> green (sanctioned caller)`);
    }
    for (const testCase of cases) {
        const mutated = Object.keys({ ...clean, ...testCase.sources }).some(file => testCase.sources[file] !== clean[file]);
        if (!mutated && !testCase.storeClasses && !testCase.kindClasses && !testCase.privilegedKinds) {
            console.error(`verify-web-tab-bridge --self-test: FAIL -- '${testCase.name}' did not modify any source; the anchor it edits has drifted`);
            failed++;
            continue;
        }
        const failures = checkBridge(testCase.sources, testCase.storeClasses, testCase.kindClasses, testCase.privilegedKinds);
        if (!failures.some(f => f.includes(testCase.expect))) {
            console.error(`verify-web-tab-bridge --self-test: FAIL -- '${testCase.name}' did not go red naming '${testCase.expect}'; got: ${failures.join(' | ') || '(no failures at all)'}`);
            failed++;
        } else {
            console.log(`  ok  ${testCase.name} -> red, naming '${testCase.expect}'`);
        }
    }

    if (failed) {
        return 1;
    }
    console.log(`verify-web-tab-bridge --self-test: PASS -- ${cases.length} planted faults all went red`);
    return 0;
}

function main() {
    if (process.argv.includes('--help')) {
        console.log('usage: verify-web-tab-bridge.mjs [--self-test]\n' +
            'Derives the web-tab bridge contract (kinds, event names, open-handler priority, overlay attributes, origin wall, no stock-window escape, actor-child purity, push-kind parity, action routing, kind classification, store-kind classification) from the tree and compares it.');
        return 0;
    }
    if (process.argv.includes('--self-test')) {
        return selfTest();
    }
    const sources = readSources();
    const failures = checkBridge(sources);
    if (failures.length) {
        console.error('verify-web-tab-bridge: FAIL -- the chrome host, the actor child and the Theia web tab no longer agree on the bridge contract.');
        failures.forEach(f => console.error(`  ${f}`));
        return 1;
    }
    const kinds = derive(stripComments(sources[API]), /case "(webTab[A-Za-z]+)"/g);
    console.log(
        `verify-web-tab-bridge: PASS -- ${kinds.length} webTab kinds, the request/response/state event names, ` +
        'the open-handler priority, the overlay attribute order, the embedder-is-primary wall, the no-stock-window rule, ' +
        'push-kind parity, action routing, kind classification and store-kind classification ' +
        `agree across ${Object.keys(sources).length} sources`
    );
    return 0;
}

process.exit(main());
