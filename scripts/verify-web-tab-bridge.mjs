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
]);

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
function checkBridge(raw) {
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
        } else if (kindClass === 'privileged') {
            failures.push(`classification: ${kind} is privileged -- Phase 27's rule admits no privileged webTab kind without a deliberate change to this gate and INTERNAL-APIS.md`);
        }
    }

    return failures;
}

function readSources() {
    const files = new Set([API, CHILD, CLIENT, BWC, WEB_TAB, MODULE]);
    for (const dir of [CHROME_BAR_DIR, TAB_URIS_DIR]) {
        for (const name of readdirSync(join(REPO_ROOT, dir))) {
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
    const cases = [
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
    ];

    let failed = 0;
    for (const testCase of cases) {
        const mutated = Object.keys(clean).some(file => testCase.sources[file] !== clean[file]);
        if (!mutated) {
            console.error(`verify-web-tab-bridge --self-test: FAIL -- '${testCase.name}' did not modify any source; the anchor it edits has drifted`);
            failed++;
            continue;
        }
        const failures = checkBridge(testCase.sources);
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
            'Derives the web-tab bridge contract (kinds, event names, open-handler priority, overlay attributes, origin wall, no stock-window escape, actor-child purity, push-kind parity, action routing, kind classification) from the tree and compares it.');
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
        'push-kind parity, action routing and kind classification ' +
        `agree across ${Object.keys(sources).length} sources`
    );
    return 0;
}

process.exit(main());
