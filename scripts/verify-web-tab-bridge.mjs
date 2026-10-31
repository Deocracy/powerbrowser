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
 * chrome-bar source may reach the stock-window command or a bare popup)
 * carries a registered positive control -- `browser-window-command.ts`
 * must still open its popup -- so "removed everywhere" cannot pass it.
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
]);

/**
 * Rule 12 (Phase 29): every store kind chrome serves (STORE_REQUEST_KINDS,
 * routed to handleStoreRequest) has exactly one class, compared as set
 * equality so an unclassified kind and a stale entry each go red by name.
 * `network` = sends user input off the machine; `privileged` = Places writes
 * or clipboard reads. Neither may enter TAB_STORE_RELAY_KINDS (the backend
 * relay), and a privileged kind runs only from address-bar/address-bar.tsx through
 * its same-named ChromeStoreClient method, never from a command or a key row.
 * savePageCopy runs from a command, so it is store-write, not privileged.
 * searchSuggestions (29-06) is the first network kind and removeHistoryEntry
 * (29-09) the first privileged one. The first entry of each was a deliberate
 * edit here and in powerbrowser/INTERNAL-APIS.md.
 * `lifecycle` (Phase 31 plan 05, D-31-13) = a chrome-lifetime transition: it
 * ends the application, never touches user data, and is never relayed. Its
 * only senders are the chrome bar widget's own row handler and its client
 * method, and no command or keybinding may name it (the Ctrl+Q key is a
 * chrome <key> row, not a store kind). quitRequest is the first entry.
 */
const STORE_KIND_CLASS_NAMES = ['read', 'store-write', 'network', 'privileged', 'lifecycle'];
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

/** Stock `HttpOpenHandler`'s priority; the web-tab handler must exceed it. */
const STOCK_HTTP_HANDLER_PRIORITY = 500;

/** Stock-window escape hatches no chrome-bar source may reach. */
const STOCK_WINDOW_COMMAND = 'OPEN_BROWSER_WINDOW_COMMAND_ID';
const WINDOW_OPEN = /window\.open\s*\(/;

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
function checkBridge(raw, storeClasses = STORE_KIND_CLASSES) {
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
        for (const attr of ['type', 'remote', 'remoteType', 'maychangeremoteness', 'manualactiveness']) {
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
        if (src[file].includes(STOCK_WINDOW_COMMAND)) {
            failures.push(`${file}: reaches ${STOCK_WINDOW_COMMAND} -- the chrome bar must land in the in-shell web tab, never the stock window`);
        }
        if (WINDOW_OPEN.test(src[file])) {
            failures.push(`${file}: calls window.open -- the chrome bar must land in the in-shell web tab, never a popup`);
        }
    }
    if (!WINDOW_OPEN.test(src[BWC])) {
        failures.push(`${BWC}: no longer calls window.open -- GUI-01's popup fallback is gone, and without this positive control the no-escape rule would pass on "removed everywhere" (browser-window-command must keep it)`);
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
        ...derive(src[API], /sendWebTabPush\(\s*[\w$.]+\s*,\s*\{\s*kind:\s*"([A-Za-z]+)"/g),
        ...derive(src[API], /sendAsyncMessage\(\s*"PowerBrowserWebTabState"\s*,\s*\{\s*kind:\s*"([A-Za-z]+)"/g),
    ];
    const frontendFiles = Object.keys(src).filter(file => file.startsWith(`${CHROME_BAR_DIR}/`) || file.startsWith(`${TAB_URIS_DIR}/`));
    const frontendText = frontendFiles.map(file => src[file]).join('\n');
    const constants = new Map(derive(frontendText, /export const ([A-Za-z_$][\w$]*\s*=\s*'[A-Za-z]+')/g)
        .map(pair => /^(\S+)\s*=\s*'([A-Za-z]+)'$/.exec(pair)).map(m => [m[1], m[2]]));
    const subscribedKinds = derive(frontendText, /onPush\(\s*'([A-Za-z]+)'/g);
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
    // handler has one class, and the privileged class is empty.
    if (apiKinds.length) {
        const { surplus, missing } = diff(apiKinds, [...KIND_CLASSES.keys()]);
        if (surplus.length) {
            failures.push(`classification: webTab arms with no KIND_CLASSES entry (classify each under the privileged-kind rule): ${surplus.join(', ')}`);
        }
        if (missing.length) {
            failures.push(`classification: KIND_CLASSES entries with no case arm left (stale): ${missing.join(', ')}`);
        }
    }
    for (const [kind, kindClass] of KIND_CLASSES) {
        if (!KIND_CLASS_NAMES.includes(kindClass)) {
            failures.push(`classification: ${kind} has the unknown class '${kindClass}'`);
        }
    }
    failures.push(...checkWebTabPrivileged(src, KIND_CLASSES));

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
function checkWebTabPrivileged(src, classes) {
    const failures = [];
    const commandLike = Object.entries(src).filter(([file, text]) =>
        (text.includes('registerCommand(') || text.includes('registerKeybinding(')) && file.startsWith(`${CHROME_BAR_DIR}/`));
    for (const [kind, kindClass] of classes) {
        if (kindClass !== 'privileged') {
            continue;
        }
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
        for (const [file, text] of commandLike) {
            if (new RegExp(`\\b${kind}\\b`).test(text)) {
                failures.push(`classification: the privileged webTab kind ${kind} is named by a command or keybinding file, ${file}`);
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
            if ((kindClass === 'network' || kindClass === 'privileged' || kindClass === 'lifecycle') && relayed.has(kind)) {
                failures.push(`store-kinds: the ${kindClass} kind ${kind} is relayed from the backend (TAB_STORE_RELAY_KINDS)`);
            }
        }
    }

    for (const [kind, kindClass] of storeClasses) {
        if (kindClass !== 'privileged' && kindClass !== 'lifecycle') {
            continue;
        }
        // A privileged kind is sent from the address pill; a lifecycle kind from the chrome bar widget (its Quit row).
        const home = kindClass === 'lifecycle' ? CHROME_BAR_WIDGET_FILE : CHROME_BAR_WIDGET;
        const callers = new Set([STORE_CLIENT, home]);
        if (!new RegExp(`^\\s+(?:async\\s+)?${kind}\\(`, 'm').test(src[STORE_CLIENT] ?? '')) {
            failures.push(`store-kinds: the ${kindClass} kind ${kind} has no same-named ChromeStoreClient method ${kind}( in ${STORE_CLIENT}`);
        }
        const named = new RegExp(`\\b${kind}\\b`);
        for (const [file, text] of Object.entries(src)) {
            if (!callers.has(file) && text.includes(`.${kind}(`)) {
                failures.push(`store-kinds: the ${kindClass} kind ${kind} is called outside ${home}, in ${file}`);
            }
            if ((text.includes('registerCommand(') || text.includes('registerKeybinding(')) && named.test(text)) {
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
            expect: `the privileged kind plantedPrivileged is called outside ${CHROME_BAR_WIDGET}, in ${COMMANDS}`,
        },
        {
            name: 'planted privileged call in a nested chrome-bar file',
            sources: { ...clean, [`${CHROME_BAR_DIR}/nested/planted.ts`]: 'void this.store.readClipboardText();\n' },
            expect: `the privileged kind readClipboardText is called outside ${CHROME_BAR_WIDGET}, in ${CHROME_BAR_DIR}/nested/planted.ts`,
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
            name: 'planted wall without the primary check',
            sources: {
                ...clean,
                [API]: replaceWithin(clean[API], 'function groupSenderIsTheia(', '\n}', '"primary"', '"main"'),
            },
            expect: 'primary',
        },
        {
            name: 'planted loss of the GUI-01 popup (positive control)',
            sources: { ...clean, [BWC]: clean[BWC].replace(/window\.open\(/, 'windowOpen(') },
            expect: 'browser-window-command',
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
            name: 'planted extra arm in handleWebTabAction',
            sources: {
                ...clean,
                [API]: replaceWithin(clean[API], 'async function handleWebTabAction(', '\n}', 'switch (kind) {', 'switch (kind) {\n    case "webTabPlantedArm": { break; }'),
            },
            expect: 'webTab arms with no KIND_CLASSES entry (classify each under the privileged-kind rule): webTabPlantedArm',
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
        {
            name: 'planted loss of the privileged frontend method',
            sources: { ...clean, [WEB_TAB]: clean[WEB_TAB].replace(/^(\s+)setPermission\(/m, '$1setPermissionGone(') },
            expect: 'the privileged webTab kind webTabSetPermission has no frontend method setPermission(',
        },
    ];

    let failed = 0;
    for (const testCase of cases) {
        const mutated = Object.keys({ ...clean, ...testCase.sources }).some(file => testCase.sources[file] !== clean[file]);
        if (!mutated && !testCase.storeClasses) {
            console.error(`verify-web-tab-bridge --self-test: FAIL -- '${testCase.name}' did not modify any source; the anchor it edits has drifted`);
            failed++;
            continue;
        }
        const failures = checkBridge(testCase.sources, testCase.storeClasses);
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
