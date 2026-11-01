#!/usr/bin/env node
/**
 * PROMPT-05's chrome-half gate (plan 36-01): the shell window's new-window
 * receivers in PowerBrowserAPI.sys.mjs, derived from the tree and compared.
 *
 * Everything is DERIVED at check time, comments stripped first:
 *   - the IDL member set: every method and attribute of `interface
 *     nsIBrowserDOMWindow` in upstream/dom/interfaces/base/nsIBrowserDOMWindow.idl
 *     (constants excluded);
 *   - the call-site member set: every `browserDOMWindow.<member>` read in the
 *     pinned upstream JS (git -C upstream grep, test directories excluded) and
 *     in powerbrowser/shell outside the boundary file;
 *   - the shim's member set: the `win.browserDOMWindow = {` literal in the
 *     boundary file, plus its generateQI interface list.
 * A derivation that yields nothing is a broken instrument, never a pass.
 *
 * Rules:
 *   (a) shim members (QueryInterface aside) == IDL members UNION call-site
 *       members, both directions; the QI lists nsIBrowserDOMWindow only;
 *       `win.openLinkIn =` is defined exactly once and is NOT an IDL member
 *       (it is the chrome-window JS companion, utilityOverlay.js:123).
 *   (b) null fall-through: adoptContentWindow opens with an `if` that tests
 *       the opener (tabIdOfBrowser) AND OPEN_PRINT_BROWSER and returns null,
 *       and nothing before that return creates, appends, pushes or writes;
 *       adoptLinkIn's opener guard holds the same way. The single definition
 *       site of browserDOMWindow/openLinkIn is the boundary guard's own
 *       FORBIDDEN_PATTERNS plants (check-internals-boundary.sh --self-test,
 *       its own --quick row), not re-derived here.
 *   (c) one overlay factory: the adopt section builds no element of its own
 *       and sets or removes no attribute -- the pending overlay comes from
 *       webTabOpen's pending mode, so its attribute set IS webTabOpen's.
 *       webTabOpen's remoteType reads the pending value, the adopt call passes
 *       the opener's remoteType, openWindowInfo is assigned before
 *       appendChild, and the pending return precedes webTabAttach.
 *   (d) split load rule: no fixupAndLoadURIString / loadURI( / .src = /
 *       webTabNavigate( / firstWebTabLoad( from the InFrame entry to the
 *       section-end marker, nor in webTabOpen's pending path; adoptLinkIn
 *       carries one browser.loadURI( with triggeringPrincipal.
 *   (e) kinds, chrome side: one `case "webTabAdopt"` arm walled by
 *       webTabIdIsValid and the pc-<n> shape; adoptPendingOverlay's reply
 *       words == { opened, unknown-tab, validation }; the adoptTab push keys
 *       == { pcKey, openerTabId, url, background } and the dropAdoptedTab
 *       push keys == { tabId }. Push-vs-subscription parity is the bridge
 *       gate's rule (verify-web-tab-bridge.mjs), not this one's.
 *   (f) pc-* hygiene: no store write (writeTabRow/removeTabRow/webTabAttach)
 *       names pcKey or a pc- literal, the ack attaches under tabId with a null
 *       key, no adopt-section log line carries pcKey, a URL or a title, and no
 *       frontend source (tab-uris, chrome-bar) puts a pc- value in copy.
 *   (g) ack id (36-REVIEW CR-01/WR-08): every `tabId:` the frontend's
 *       adopt() sends (the webTabAdopt ack and its webTabClose) is
 *       `widget.<F>`, where F is the field WebTabWidget.init registers with
 *       WebTabChannel.register; and F's value -- derived from init's
 *       assignment and createWidget's id template -- passes the regex
 *       derived from chrome's webTabIdIsValid. Neither end is hand-kept.
 *   (h) adopted blank is page content (36-REVIEW WR-04): hasPage includes
 *       the adopted flag, publish()'s showable reads hasPage (no second
 *       visibility test that the title and identity paths would not share),
 *       adopt() calls markAdopted() before addWidget, markAdopted re-renders
 *       the title, and webTabIdentity reads its host through
 *       webTabIdentityURI, which takes an about:blank's documentPrincipal.
 *
 * Honestly --quick: text reads plus one git grep over the pinned upstream. No
 * build, no browser, no display, no network.
 *
 * Usage:
 *   node scripts/verify-new-window-adopt.mjs
 *   node scripts/verify-new-window-adopt.mjs --self-test
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'verify-new-window-adopt';
const API = 'powerbrowser/shell/PowerBrowserAPI.sys.mjs';
const SHELL_DIR = 'powerbrowser/shell';
const IDL = 'upstream/dom/interfaces/base/nsIBrowserDOMWindow.idl';
const FRONTEND_DIRS = ['theia/extensions/tab-uris/src/browser', 'theia/extensions/chrome-bar/src/browser'];
const SECTION_END = '// Phase 36: new-window adopt section end.';
const LOADS = /fixupAndLoadURIString|loadURI\(|\.src\s*=|webTabNavigate\(|firstWebTabLoad\(/;
const CREATES = /createXULElement|appendChild|webTabOpen\(|createPendingOverlay\(|sendWebTabPush\(|writeTabRow\(|pendingContent\.set|webTabs\.set/;
const REPLY_WORDS = ['opened', 'unknown-tab', 'validation'];
const ADOPT_PUSH_KEYS = ['background', 'openerTabId', 'pcKey', 'url'];
const DROP_PUSH_KEYS = ['tabId'];
const WEB_TAB_TS = 'theia/extensions/tab-uris/src/browser/web-tab.ts';

function stripComments(text) {
    return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');
}

/** Set difference reported by name, so a failure says WHICH name drifted. */
function diff(actual, expected) {
    const a = new Set(actual);
    const e = new Set(expected);
    return { surplus: [...a].filter(n => !e.has(n)).sort(), missing: [...e].filter(n => !a.has(n)).sort() };
}

/** A module-level function's text, `function name(` to the first column-0 `}`; null when absent. */
function moduleFn(code, name) {
    const at = code.search(new RegExp(`\\n(?:async )?function ${name}\\(`));
    if (at === -1) return null;
    const end = code.indexOf('\n}', at + 1);
    return end === -1 ? null : code.slice(at, end + 2);
}

/** A two-space literal member's text, `  name(` to its closing `  }`; null when absent. */
function member(code, name) {
    const at = code.search(new RegExp(`\\n  (?:async )?${name}\\([^\\n]*\\) \\{\\n`));
    if (at === -1) return null;
    const end = code.slice(at + 1).search(/\n {2}\},?\n/);
    return end === -1 ? null : code.slice(at, at + 1 + end + 6);
}

/** The keys at depth 1 of the `{` that follows `anchor` (values skipped); null when absent or unbalanced. */
function objectLiteralMembers(code, anchor) {
    const at = code.indexOf(anchor);
    if (at === -1) return null;
    const members = new Set();
    let depth = 0;
    let expectKey = false;
    for (let i = code.indexOf('{', at); i < code.length; i++) {
        const c = code[i];
        if (c === '"' || c === "'" || c === '`') {
            for (i++; i < code.length && code[i] !== c; i++) if (code[i] === '\\') i++;
            continue;
        }
        if ('{[('.includes(c)) { if (++depth === 1) expectKey = true; continue; }
        if ('}])'.includes(c)) { if (--depth === 0) return members; continue; }
        if (depth === 1 && c === ',') { expectKey = true; continue; }
        if (depth === 1 && expectKey && /[A-Za-z_$]/.test(c)) {
            let j = i;
            while (j < code.length && /[\w$]/.test(code[j])) j++;
            const word = code.slice(i, j);
            let k = j;
            while (k < code.length && /\s/.test(code[k])) k++;
            // `get name()`, `set name(v)`, `async name()`: the key is the next word.
            if (/^(get|set|async)$/.test(word) && /[A-Za-z_$]/.test(code[k] ?? '')) { i = j - 1; continue; }
            if (code[k] === ':' || code[k] === '(' || code[k] === ',' || code[k] === '}') members.add(word);
            expectKey = false;
            i = j - 1;
        }
    }
    return null;
}

/** IDL members of `interface nsIBrowserDOMWindow`, with their 1-based lines; constants excluded. */
function idlMembers(idlText) {
    const lines = idlText.split('\n');
    const start = lines.findIndex(l => /^interface nsIBrowserDOMWindow\b/.test(l));
    if (start === -1) return null;
    const out = new Map();
    let inBlock = false;
    for (let i = start; i < lines.length && !/^\};/.test(lines[i]); i++) {
        let l = lines[i];
        if (inBlock) {
            if (!l.includes('*/')) continue;
            l = l.slice(l.indexOf('*/') + 2);
            inBlock = false;
        }
        l = l.replace(/\/\*.*?\*\//g, '').replace(/\/\/.*$/, '');
        if (l.includes('/*')) { inBlock = true; l = l.slice(0, l.indexOf('/*')); }
        if (/^\s*const\b/.test(l)) continue;
        const attr = /\battribute\s+[\w\s]+?\s(\w+)\s*;/.exec(l);
        if (attr) { out.set(attr[1], i + 1); continue; }
        const method = /^\s*(?:[\w]+\s+)?([a-z]\w*)\s*\(/.exec(l);
        if (method && !/^(in|out)$/.test(method[1])) out.set(method[1], i + 1);
    }
    return out;
}

/** `browserDOMWindow.<member>` reads in upstream JS at the pinned HEAD, test directories excluded. */
function upstreamCallSites() {
    const res = spawnSync('git', ['-C', join(REPO_ROOT, 'upstream'), 'grep', '-hoE', 'browserDOMWindow\\??\\.[A-Za-z_]+', 'HEAD', '--',
        '*.js', '*.mjs', ':!*/test/*', ':!*/tests/*'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    if (res.status !== 0 && res.status !== 1) return null;
    return [...new Set(res.stdout.split('\n').filter(Boolean).map(s => s.replace(/^HEAD:/, '').replace(/^browserDOMWindow\??\./, '')))];
}

function readSources() {
    const read = rel => { try { return readFileSync(join(REPO_ROOT, rel), 'utf8'); } catch { return null; } };
    const sources = { [API]: read(API), [IDL]: read(IDL) };
    for (const f of readdirSync(join(REPO_ROOT, SHELL_DIR)).filter(f => /\.(js|mjs)$/.test(f))) {
        sources[`${SHELL_DIR}/${f}`] = read(`${SHELL_DIR}/${f}`);
    }
    for (const dir of FRONTEND_DIRS) {
        for (const f of readdirSync(join(REPO_ROOT, dir), { recursive: true }).filter(f => /\.tsx?$/.test(f))) {
            sources[`${dir}/${f}`] = read(`${dir}/${f}`);
        }
    }
    return sources;
}

function checkAdopt(sources, callSites) {
    const failures = [];
    const fail = (rule, msg) => failures.push(`${rule}: ${msg}`);
    if (sources[API] === null) return [`broken instrument: ${API} unreadable`];
    const api = stripComments(sources[API]);

    // (a) shim members vs IDL UNION call sites.
    const idl = sources[IDL] === null ? null : idlMembers(sources[IDL]);
    if (!idl || idl.size === 0) {
        fail('shim', `broken instrument: derived ZERO nsIBrowserDOMWindow members from ${IDL}`);
    }
    const treeSites = Object.entries(sources)
        .filter(([rel, text]) => rel.startsWith(`${SHELL_DIR}/`) && rel !== API && text !== null)
        .flatMap(([, text]) => [...stripComments(text).matchAll(/browserDOMWindow\??\.([A-Za-z_]+)/g)].map(m => m[1]));
    if (callSites === null) fail('shim', 'broken instrument: git grep over upstream/ failed, so the call-site set is unknown');
    const required = new Set([...(idl ? idl.keys() : []), ...(callSites ?? []), ...treeSites]);
    const shimCount = (api.match(/\bwin\.browserDOMWindow\s*=\s*\{/g) || []).length;
    const shim = shimCount === 1 ? objectLiteralMembers(api, 'win.browserDOMWindow = {') : null;
    if (!shim || shim.size === 0) {
        fail('shim', `broken instrument: ${shimCount} \`win.browserDOMWindow = {\` literal(s) in ${API} (need exactly one with members)`);
    } else if (required.size) {
        const implemented = [...shim].filter(m => m !== 'QueryInterface');
        const { surplus, missing } = diff(implemented, [...required]);
        for (const m of missing) fail('shim', `UNIMPLEMENTED browserDOMWindow.${m} -- the IDL or a call site needs it and the shim lacks it (Gecko throws on the call)`);
        for (const m of surplus) fail('shim', `SURPLUS browserDOMWindow.${m} -- neither the pinned IDL nor any call site has it`);
        if (!shim.has('QueryInterface')) fail('shim', 'the receiver has no QueryInterface member');
    }
    const qi = /win\.browserDOMWindow = \{\s*QueryInterface: ChromeUtils\.generateQI\(\[([^\]]*)\]\)/.exec(api);
    const qiNames = qi ? [...qi[1].matchAll(/"([^"]+)"/g)].map(m => m[1]) : [];
    if (qiNames.join() !== 'nsIBrowserDOMWindow') fail('shim', `the receiver's generateQI lists [${qiNames.join(', ')}], not exactly nsIBrowserDOMWindow`);
    if ((api.match(/\bwin\.openLinkIn\s*=/g) || []).length !== 1) fail('shim', 'win.openLinkIn is not defined exactly once in the boundary file');
    if (idl && idl.has('openLinkIn')) fail('shim', 'broken instrument: openLinkIn parsed as an nsIBrowserDOMWindow member; it is the JS-only companion');

    // (b) null fall-through before anything exists.
    const inFrame = moduleFn(api, 'adoptContentWindow');
    const linkIn = moduleFn(api, 'adoptLinkIn');
    if (!inFrame || !linkIn) {
        fail('null-path', `broken instrument: ${!inFrame ? 'adoptContentWindow' : 'adoptLinkIn'} not found in ${API}`);
    } else {
        for (const [fn, body, needsPrint] of [['adoptContentWindow', inFrame, true], ['adoptLinkIn', linkIn, false]]) {
            const guard = /\n\s*if \(([^\n]*)\) \{\n\s*return null;/.exec(body);
            if (!guard || !guard[1].includes('tabIdOfBrowser(') || (needsPrint && !guard[1].includes('OPEN_PRINT_BROWSER'))) {
                fail('null-path', `${fn} has no opening \`if (...) { return null; }\` that tests the opener${needsPrint ? ' and OPEN_PRINT_BROWSER' : ''}`);
                continue;
            }
            const before = body.slice(0, guard.index);
            const made = CREATES.exec(before);
            if (made) fail('null-path', `${fn} reaches ${made[0]} before its null return -- a Theia-frame opener must create, append, push and write nothing`);
        }
    }

    // (c) one overlay factory.
    const sectionStart = sources[API].indexOf('\nconst pendingContent = new Map()');
    const sectionEnd = sources[API].indexOf(SECTION_END);
    const section = sectionStart === -1 || sectionEnd < sectionStart ? null : stripComments(sources[API].slice(sectionStart, sectionEnd));
    const open = member(api, 'webTabOpen');
    if (section === null || !open) {
        fail('factory', `broken instrument: ${section === null ? 'the adopt section (pendingContent .. section-end marker)' : 'webTabOpen'} not found in ${API}`);
    } else {
        const own = /createXULElement|setAttribute\(|removeAttribute\(|toggleAttribute\(/.exec(section);
        if (own) fail('factory', `the adopt section calls ${own[0]} -- the pending overlay's attributes must be webTabOpen's own literal, set before append`);
        const call = /PowerBrowserAPI\.webTabOpen\(([^\n]*)\);/.exec(section);
        if (!call) fail('factory', 'the adopt section never builds its overlay through PowerBrowserAPI.webTabOpen(..., pending)');
        else {
            if (!/remoteType: opener\.remoteType/.test(call[1])) fail('factory', "the adopt call does not pass the opener's remoteType (tabbrowser.js:4249-4251)");
            if (!/\bopenWindowInfo\b/.test(call[1])) fail('factory', 'the adopt call does not pass openWindowInfo (the window.opener truth)');
        }
        if (!/remoteType: pending\?\.remoteType/.test(open)) fail('factory', "webTabOpen's attribute literal does not read remoteType from the pending request");
        const owi = open.search(/browser\.openWindowInfo = openWindowInfo;/);
        const append = open.indexOf('appendChild(');
        const pendingReturn = open.search(/if \(pending\) \{\n\s*return browser;/);
        const attach = open.indexOf('webTabAttach(');
        if (owi === -1) fail('factory', 'webTabOpen never assigns browser.openWindowInfo = openWindowInfo (tabbrowser.js:2801)');
        else if (append !== -1 && owi > append) fail('factory', 'webTabOpen assigns openWindowInfo after appendChild -- the frameloader reads it at connect');
        if (pendingReturn === -1 || append === -1 || pendingReturn < append || (attach !== -1 && pendingReturn > attach)) {
            fail('factory', 'webTabOpen\'s pending return is not between appendChild and webTabAttach -- a pending overlay must get no entry, row or load');
        }
        // (d) split load rule, InFrame half: webTabOpen's pending path and the InFrame entry to the marker.
        if (pendingReturn !== -1) {
            const loaded = LOADS.exec(open.slice(0, pendingReturn));
            if (loaded) fail('load', `webTabOpen's pending path reaches ${loaded[0]} -- Gecko loads into the returned element`);
        }
    }
    const inFrameAt = sources[API].indexOf('\nfunction adoptContentWindow(');
    if (inFrameAt === -1 || sectionEnd === -1 || sectionEnd < inFrameAt) {
        fail('load', 'broken instrument: the InFrame entry or the section-end marker is missing or out of order');
    } else {
        const loaded = LOADS.exec(stripComments(sources[API].slice(inFrameAt, sectionEnd)));
        if (loaded) fail('load', `${loaded[0]} between adoptContentWindow and the section end -- the InFrame path must issue no navigation (ContentParent.cpp:5490-5522)`);
    }
    if (linkIn && !/browser\.loadURI\([^\n]*triggeringPrincipal/.test(linkIn)) {
        fail('load', 'adoptLinkIn has no browser.loadURI( with triggeringPrincipal -- stock openLinkIn opens AND loads (URILoadingHelper.sys.mjs:465)');
    }

    // (e) kinds, chrome side.
    const arms = api.match(/case "webTabAdopt": \{[\s\S]*?\n {4}\}/g) || [];
    if (arms.length !== 1) fail('kinds', `${arms.length} case "webTabAdopt" arm(s) (need exactly one)`);
    else if (!arms[0].includes('webTabIdIsValid(data.tabId)') || !arms[0].includes('/^pc-[0-9]+$/')) {
        fail('kinds', 'the webTabAdopt arm is not walled by webTabIdIsValid and the pc-<n> shape');
    }
    const ack = moduleFn(api, 'adoptPendingOverlay');
    if (!ack) fail('kinds', 'broken instrument: adoptPendingOverlay not found');
    else {
        const words = [...ack.matchAll(/\b(?:reason|where): "([^"]+)"/g)].map(m => m[1]);
        const { surplus, missing } = diff(words, REPLY_WORDS);
        if (surplus.length) fail('kinds', `adoptPendingOverlay replies the unexpected word(s) ${surplus.join(', ')} (vocabulary: ${REPLY_WORDS.join(', ')})`);
        if (missing.length) fail('kinds', `adoptPendingOverlay no longer replies ${missing.join(', ')}`);
    }
    for (const [kind, keys] of [['adoptTab', ADOPT_PUSH_KEYS], ['dropAdoptedTab', DROP_PUSH_KEYS]]) {
        const pushes = [...api.matchAll(new RegExp(`sendWebTabPush\\(\\s*[\\w$.]+\\s*,\\s*\\{\\s*kind:\\s*"${kind}"([^}]*)\\}`, 'g'))];
        if (pushes.length !== 1) { fail('kinds', `${pushes.length} sendWebTabPush(..., { kind: "${kind}" }) site(s) (need exactly one)`); continue; }
        const got = pushes[0][1].split(',').map(s => s.trim().split(':')[0].trim()).filter(Boolean);
        const { surplus, missing } = diff(got, keys);
        if (surplus.length || missing.length) fail('kinds', `the ${kind} push carries {${got.sort().join(', ')}}, not {${keys.join(', ')}}`);
    }

    // (f) pc-* hygiene.
    for (const line of api.split('\n').filter(l => /writeTabRow\(|removeTabRow\(|webTabAttach\(/.test(l))) {
        if (/pcKey|["'`]pc-/.test(line)) fail('pc-hygiene', `a store write names the pending key: ${line.trim()}`);
    }
    if (ack && !/webTabAttach\(theiaBrowser, actorRef, tabId, pending\.browser, null,/.test(ack)) {
        fail('pc-hygiene', 'adoptPendingOverlay does not attach the overlay under the frontend tabId with a null row key');
    }
    if (section !== null) {
        for (const line of section.split('\n').filter(l => /\.log\(/.test(l))) {
            if (/\bpcKey\b|\burl\b|\bspec\b|\btitle\b|\blive\b/.test(line)) fail('pc-hygiene', `an adopt-section log line carries a key, URL or title: ${line.trim()}`);
        }
    }
    const frontend = Object.entries(sources).filter(([rel, text]) => FRONTEND_DIRS.some(d => rel.startsWith(`${d}/`)) && text !== null);
    if (frontend.length === 0) fail('pc-hygiene', 'broken instrument: derived ZERO frontend sources');
    for (const [rel, text] of frontend) {
        for (const line of stripComments(text).split('\n')) {
            if (/["'`]pc-/.test(line) || (/\bpcKey\b/.test(line) && /\b(label|caption|title|aria-label|textContent|innerText)\b/.test(line))) {
                fail('pc-hygiene', `${rel} puts a pending key in copy: ${line.trim()}`);
            }
        }
    }

    // (g) ack id: both ends derived, then compared.
    const wtText = sources[WEB_TAB_TS] ? stripComments(sources[WEB_TAB_TS]) : null;
    const shape = /function webTabIdIsValid\(tabId\) \{\n[^\n]*\/(\^[^\n]*?\$)\/\.test\(tabId\)/.exec(api);
    const adoptFn = wtText && /\n {4}async adopt\([\s\S]*?\n {4}\}\n/.exec(wtText);
    const init = wtText && /\n {4}init\(options: WebTabOptions\): void \{[\s\S]*?\n {4}\}\n/.exec(wtText);
    const registered = wtText && /this\.channel\.register\(this\.(\w+), this\)/.exec(wtText);
    const mint = wtText && /\bid: `(wt-[^`]*)`/.exec(wtText);
    if (!shape || !adoptFn || !init || !registered || !mint) {
        fail('ack-id', `broken instrument: could not derive ${!shape ? "chrome's webTabIdIsValid pattern" : !adoptFn ? 'WebTabOpenHandler.adopt' : !init ? 'WebTabWidget.init' : !registered ? 'the WebTabChannel.register field' : "createWidget's id template"}`);
    } else {
        const validId = new RegExp(shape[1]);
        // A concrete minted id: the session is a base36 slice, the counter a positive integer.
        const minted = mint[1].replace(/\$\{WEB_TAB_SESSION\}/g, 'a1b2c3').replace(/\$\{\+\+\w+\}/g, '1');
        const consts = Object.fromEntries([...wtText.matchAll(/export const (\w+) = '([^']*)';/g)].map(m => [m[1], m[2]]));
        const valueOf = rhs => {
            if (rhs === 'options.id') return minted;
            const tpl = /^`([^`]*)`$/.exec(rhs);
            if (!tpl) return null;
            const out = tpl[1].replace(/\$\{options\.id\}/g, minted).replace(/\$\{(\w+)\}/g, (all, name) => consts[name] ?? all);
            return out.includes('${') ? null : out;
        };
        const assigned = Object.fromEntries([...init[0].matchAll(/\bthis\.(\w+) = ([^;\n]+);/g)].map(m => [m[1], m[2].trim()]));
        const sends = [...adoptFn[0].matchAll(/\btabId: ([\w$.]+)/g)].map(m => m[1]);
        if (!/kind: 'webTabAdopt', tabId: /.test(adoptFn[0])) fail('ack-id', 'adopt() sends no webTabAdopt ack with a tabId');
        for (const expr of new Set(sends)) {
            if (expr !== `widget.${registered[1]}`) {
                fail('ack-id', `adopt() sends tabId: ${expr}, not widget.${registered[1]} (the field WebTabChannel.register keys on)`);
            }
            const field = /^widget\.(\w+)$/.exec(expr);
            const value = field && assigned[field[1]] ? valueOf(assigned[field[1]]) : null;
            if (value === null) fail('ack-id', `broken instrument: cannot derive the value adopt() sends as tabId: ${expr}`);
            else if (!validId.test(value)) fail('ack-id', `adopt() sends tabId: ${expr}, whose value (e.g. "${value}") fails chrome's webTabIdIsValid /${shape[1]}/ -- chrome refuses every adopt`);
        }
    }

    // (h) an adopted about:blank is shown, titled and identified as the content it is.
    if (wtText && adoptFn) {
        const hasPage = /\n {4}get hasPage\(\): boolean \{([\s\S]*?)\n {4}\}/.exec(wtText);
        const mark = /\n {4}markAdopted\(\): void \{([\s\S]*?)\n {4}\}/.exec(wtText);
        const showable = /const showable = ([^;\n]*);/.exec(wtText);
        if (!hasPage || !/\|\| this\.adopted\b/.test(hasPage[1])) fail('adopted-blank', 'hasPage does not include the adopted flag -- an adopted about:blank would show as a trusted New Tab with no identity');
        if (!showable || !/\bthis\.hasPage\b/.test(showable[1]) || /\bthis\.adopted\b/.test(showable[1])) fail('adopted-blank', "publish()'s showable does not read hasPage alone -- visibility and the title/identity paths must share one test");
        if (!mark || !/this\.refreshTitle\(\)/.test(mark[1])) fail('adopted-blank', 'markAdopted() does not re-render the title, so the tab keeps the New Tab label');
        const markAt = adoptFn[0].indexOf('widget.markAdopted()');
        const addAt = adoptFn[0].indexOf('this.shell.addWidget(');
        if (markAt === -1 || addAt === -1 || markAt > addAt) fail('adopted-blank', 'adopt() does not call widget.markAdopted() before addWidget');
    }
    const identity = member(api, 'webTabIdentity');
    const identityUri = moduleFn(api, 'webTabIdentityURI');
    if (!identity || !/const uri = webTabIdentityURI\(browser\);/.test(identity)) fail('adopted-blank', 'webTabIdentity does not read its host through webTabIdentityURI -- an adopted about:blank would show no origin');
    if (!identityUri || !/documentPrincipal/.test(identityUri)) fail('adopted-blank', "webTabIdentityURI does not read the about:blank's inherited documentPrincipal");
    return failures;
}

function plant(text, from, to) {
    return text !== null && text.includes(from) ? text.replace(from, to) : null;
}

function selfTest() {
    const clean = readSources();
    const sites = upstreamCallSites();
    const baseline = checkAdopt(clean, sites);
    if (baseline.length) {
        console.error(`${NAME} --self-test: FAIL -- the unmodified tree is already red, so the planted-fault results below would be meaningless:`);
        for (const f of baseline) console.error(`  ${f}`);
        return 1;
    }
    const WT = 'theia/extensions/tab-uris/src/browser/web-tab.ts';
    const cases = [
        { name: 'shim drops canClose', sources: { [API]: plant(clean[API], '      canClose() {\n        return true;\n      },\n', '') }, expect: 'UNIMPLEMENTED browserDOMWindow.canClose' },
        { name: 'IDL gains a member the shim lacks', sources: { [IDL]: plant(clean[IDL], '  boolean canClose();', '  boolean canClose();\n  void plantedMember();') }, expect: 'UNIMPLEMENTED browserDOMWindow.plantedMember' },
        { name: 'a call site reads a member the shim lacks', sites: [...(sites ?? []), 'plantedCallSite'], expect: 'UNIMPLEMENTED browserDOMWindow.plantedCallSite' },
        { name: 'IDL interface renamed (empty derivation)', sources: { [IDL]: plant(clean[IDL], 'interface nsIBrowserDOMWindow : nsISupports', 'interface nsIPlantedRename : nsISupports') }, expect: 'derived ZERO nsIBrowserDOMWindow members' },
        { name: 'Theia-opener branch creates before returning null', sources: { [API]: plant(clean[API], '  const opener = params?.openerBrowser ?? null;\n  if (tabIdOfBrowser(opener) === null || aWhere === OPEN_PRINT_BROWSER) {', '  const opener = params?.openerBrowser ?? null;\n  createPendingOverlay(opener, "about:blank", false, null);\n  if (tabIdOfBrowser(opener) === null || aWhere === OPEN_PRINT_BROWSER) {') }, expect: 'adoptContentWindow reaches createPendingOverlay( before its null return' },
        { name: 'print location no longer answers null', sources: { [API]: plant(clean[API], 'if (tabIdOfBrowser(opener) === null || aWhere === OPEN_PRINT_BROWSER) {', 'if (tabIdOfBrowser(opener) === null) {') }, expect: 'tests the opener and OPEN_PRINT_BROWSER' },
        { name: 'adopt section drops an overlay attribute', sources: { [API]: plant(clean[API], '  const pending = { browser, theiaBrowser, url: spec };', '  browser.removeAttribute("messagemanagergroup");\n  const pending = { browser, theiaBrowser, url: spec };') }, expect: 'calls removeAttribute(' },
        { name: 'openWindowInfo assigned after append', sources: { [API]: plant(clean[API], '    const openWindowInfo = pending?.openWindowInfo;\n    if (openWindowInfo) {\n      browser.openWindowInfo = openWindowInfo;\n    }\n    doc.body.appendChild(browser);', '    doc.body.appendChild(browser);\n    const openWindowInfo = pending?.openWindowInfo;\n    if (openWindowInfo) {\n      browser.openWindowInfo = openWindowInfo;\n    }') }, expect: 'assigns openWindowInfo after appendChild' },
        { name: 'remoteType not taken from the opener', sources: { [API]: plant(clean[API], '{ remoteType: opener.remoteType, openWindowInfo }', '{ remoteType: "web", openWindowInfo }') }, expect: "does not pass the opener's remoteType" },
        { name: 'load call on the InFrame path', sources: { [API]: plant(clean[API], '  // refused-scheme: null, so', '  browser.loadURI(aURI, {});\n  // refused-scheme: null, so') }, expect: 'between adoptContentWindow and the section end' },
        { name: 'missing load on the openLinkIn path', sources: { [API]: plant(clean[API], '  browser.loadURI(Services.io.newURI(spec), { triggeringPrincipal });\n', '') }, expect: 'adoptLinkIn has no browser.loadURI(' },
        { name: 'unexpected reply word in the adopt arm', sources: { [API]: plant(clean[API], 'return { ok: true, kind, where: "opened" };\n}\n// Phase 36', 'return { ok: true, kind, where: "adopted-maybe" };\n}\n// Phase 36') }, expect: 'unexpected word(s) adopted-maybe' },
        { name: 'adoptTab push drops a payload key', sources: { [API]: plant(clean[API], '{ kind: "adoptTab", pcKey, openerTabId, url: spec, background }', '{ kind: "adoptTab", pcKey, url: spec, background }') }, expect: 'the adoptTab push carries' },
        { name: 'pc- key written to the store', sources: { [API]: plant(clean[API], 'webTabAttach(theiaBrowser, actorRef, tabId, pending.browser, null,', 'webTabAttach(theiaBrowser, actorRef, pcKey, pending.browser, null,') }, expect: 'a store write names the pending key' },
        { name: 'pc- key in frontend copy', sources: { [WT]: clean[WT] === undefined ? null : `${clean[WT]}\nexport const plantedCopy = (w: { title: { label: string } }, pcKey: string) => { w.title.label = pcKey; };\n` }, expect: 'puts a pending key in copy' },
        { name: 'the ack sends the widget id', sources: { [WT]: plant(clean[WT], "kind: 'webTabAdopt', tabId: widget.tabId", "kind: 'webTabAdopt', tabId: widget.id") }, expect: "tabId: widget.id, whose value (e.g. \"powerbrowser.web-tab:wt-a1b2c3-1\") fails chrome's webTabIdIsValid" },
        { name: 'the failure-branch close sends the widget id', sources: { [WT]: plant(clean[WT], "kind: 'webTabClose', tabId: widget.tabId", "kind: 'webTabClose', tabId: widget.id") }, expect: 'sends tabId: widget.id, not widget.tabId' },
        { name: 'hasPage ignores the adopted flag', sources: { [WT]: plant(clean[WT], 'return this.url !== EMPTY_PAGE_URL || this.adopted;', 'return this.url !== EMPTY_PAGE_URL;') }, expect: 'hasPage does not include the adopted flag' },
        { name: 'showable gets its own adopted test', sources: { [WT]: plant(clean[WT], 'this.isVisible && this.hasPage && !this.crashed', 'this.isVisible && (this.hasPage || this.adopted) && !this.crashed') }, expect: "showable does not read hasPage alone" },
        { name: 'adopt() never marks the widget adopted', sources: { [WT]: plant(clean[WT], '        widget.markAdopted();\n', '') }, expect: 'does not call widget.markAdopted() before addWidget' },
        { name: 'identity reads currentURI directly', sources: { [API]: plant(clean[API], 'const uri = webTabIdentityURI(browser);', 'const uri = browser.currentURI;') }, expect: 'webTabIdentity does not read its host through webTabIdentityURI' },
        { name: 'adopt log line carries the URL', sources: { [API]: plant(clean[API], '`[web-tab] adoptTab fallback failed: ${err && err.message ? err.message : err}`', '`[web-tab] adoptTab fallback failed for ${url}`') }, expect: 'log line carries a key, URL or title' },
    ];
    let failed = 0;
    for (const c of cases) {
        if (c.sources && Object.values(c.sources).some(t => t === null || t === undefined)) {
            console.error(`${NAME} --self-test: FAIL -- '${c.name}' did not modify any source; the anchor it edits has drifted`);
            failed++;
            continue;
        }
        const failures = checkAdopt({ ...clean, ...(c.sources ?? {}) }, c.sites ?? sites);
        if (!failures.some(f => f.includes(c.expect))) {
            console.error(`${NAME} --self-test: FAIL -- '${c.name}' did not go red naming '${c.expect}'; got: ${failures.join(' | ') || '(no failures at all)'}`);
            failed++;
        } else {
            console.log(`  ok  ${c.name} -> red, naming '${c.expect}'`);
        }
    }
    if (failed) return 1;
    console.log(`${NAME} --self-test: PASS -- ${cases.length} planted faults all went red`);
    return 0;
}

function main() {
    if (process.argv.includes('--help')) {
        console.log('usage: verify-new-window-adopt.mjs [--self-test]\n' +
            'Derives the shell new-window receiver contract (IDL member set, null fall-through, one overlay factory, split load rule, adopt kinds, pc-* hygiene) from the tree and compares it.');
        return 0;
    }
    if (process.argv.includes('--self-test')) return selfTest();
    const sources = readSources();
    const failures = checkAdopt(sources, upstreamCallSites());
    if (failures.length) {
        console.error(`${NAME}: FAIL -- the shell's new-window receivers no longer match the pinned IDL or the adopt contract.`);
        for (const f of failures) console.error(`  ${f}`);
        return 1;
    }
    const idl = idlMembers(sources[IDL]);
    console.log(`${NAME}: PASS -- the receiver implements exactly the nsIBrowserDOMWindow set {${[...idl.keys()].sort().join(', ')}} (call sites included), Theia and print openers fall through to null, the InFrame path never loads, openLinkIn loads, the ack sends the registered tab id that webTabIdIsValid admits, and no pending key reaches a store row, a log or copy`);
    return 0;
}

process.exit(main());
