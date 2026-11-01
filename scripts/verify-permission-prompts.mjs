#!/usr/bin/env node
/**
 * Phase 37 (PROMPT-01, D-01..D-04, D-11): the permission-prompt gate.
 *
 * A page's permission request is shown by the stock PopupNotifications object
 * on a native #notification-popup panel, and it is answered only by that
 * panel's own buttons and checkbox. Theia is told where a prompt is (the
 * display-only `doorhanger` push) and never what the answer is. This gate holds
 * the static half of that contract:
 *
 *   (a) panel: powerbrowser.xhtml carries #notification-popup with exactly the
 *       attributes upstream's popup-notifications.inc.xhtml gives it (remote
 *       included), and the anchor id the boundary names exists in the markup;
 *   (b) construction: exactly one PopupNotifications construction site in the
 *       boundary file, inside installPermissionPromptFurniture, importing the
 *       module from the URL upstream's moz.build ships it at; one bootstrap call;
 *   (c) principal: the prompt section reads no principal but the overlay's own
 *       contentPrincipal, reads no sender-supplied field, and its push carries
 *       no principal, URL, origin or callback;
 *   (d) forbidden family: no webTab or store kind whose name contains Allow,
 *       Grant, Permit, Doorhanger or Prompt (D-03, D-11); the derived kind sets
 *       must be non-empty, so the ban cannot pass vacuously;
 *   (e) facade audit: the tabbrowser facade the construction passes is a row of
 *       verify-shell-gbrowser-standin.mjs FACADES, which compares its members;
 *   (f) no request kind: the prompt section serves no case arm and touches no
 *       kind routing set (no wall-crossing kind; KIND_CLASSES stays untouched);
 *   (g) display-only subscriber: the frontend's `doorhanger` subscriber sends
 *       nothing back, so no Theia path answers a prompt.
 *   (h) visible tab (post-review): the facade reports a web tab selected only
 *       while the Theia frame reports one current, and the one write of that
 *       truth (setActiveTabOfFrame) refreshes the stock module on a focus move.
 *   (i) queue scope (post-review): the D-04 cap counts and evicts the
 *       requesting tab's waiting records only.
 *   (j) WebRTC template (37-02, B2): powerbrowser.xhtml carries upstream's
 *       webRTC-shareDevices-notification verbatim. Its ids are derived from
 *       popup-notifications.inc.xhtml and compared as a set, and every element
 *       (tag and attributes) is compared in order. This gate holds no id list of
 *       its own (a hand-kept array of template ids in this file goes red).
 *   (k) preview callback (37-02, N4): the installer registers the webrtc-preview
 *       creation callback on the module URL upstream's browser.js imports.
 *   (l) single writer (37-02, D-02, D-11): no SitePermissions or permission
 *       manager write call appears in any file under powerbrowser/shell
 *       (derived by listing the directory), except inside the Phase 31 site
 *       panel's webTabSetPermission arm, the user's own settings edit. A prompt's
 *       grant is written only by the stock PermissionUI callback when the stock
 *       Remember checkbox is checked.
 *   (m) no remember field (D-11): no webTab kind literal, push payload or case
 *       arm carries or reads a remember field, so no Theia path sets Remember.
 *   (n) chrome-observed sharing (D-05): the one sharingChanged push is in
 *       updateWebTabSharing, which only the shell gBrowser's updateBrowserSharing
 *       (the stock WebRTCParent call) reaches; the frontend writes a tab's
 *       sharing state only in its display-only sharingChanged subscriber and
 *       never reads a sharing field from a message.
 *   (o) sharing destination (37-02 post-review): the push's duplicate check
 *       compares the frontend WindowGlobal too, and webTabOpen of an overlay
 *       chrome already holds re-pushes its last observed state, so a reloaded
 *       frontend never shows a stale or missing indicator.
 *   (p) dialog outcome (37-03, D-06, Pitfall 2): the probe-1 verdict
 *       (.planning/probes/prompt-probe-verdict.json) must equal the tree.
 *       stock-keeps-ide-usable requires powerbrowser.js to define no
 *       getTabDialogBox member, because PromptParent feature-detects it and a
 *       member retargets every content dialog onto the tab-dialog path.
 *       stock-blocks-ide with relayFeasible true requires the member;
 *       relayFeasible false is red (PROMPT-03 cannot be met as written; route
 *       to Chris). A provisional verdict (the owner default, before the live
 *       probe) is accepted and named in the output; it must claim no evidence.
 *       A live verdict must carry its screenshots, push log and build, and the
 *       evidence paths must exist.
 *   (q) password template (37-04, D-07): powerbrowser.xhtml carries upstream's
 *       password-notification verbatim (id set and element by element, derived
 *       from popup-notifications.inc.xhtml), with no hidden input, plus the
 *       PopupAutoComplete panel its username field names, attribute for
 *       attribute against main-popupset.inc.xhtml.
 *   (r) login callback (37-04, N3): the installer registers the
 *       login-doorhanger-username-field creation callback on the module URL
 *       upstream's browser.js imports.
 *   (s) prompter ownership (D-07): upstream LoginManagerPrompter fills
 *       (writeDataToUI) and reads back (readDataFromUI) each template field, and
 *       no shell or frontend source names a field id, so no second value path
 *       exists.
 *   (t) no credential (D-07, T-37-04-01): no sendWebTabPush payload and no
 *       webTab kind literal carries a credential-shaped key, and no log call
 *       under powerbrowser/shell carries a credential-shaped argument. Both
 *       scans walk every call site in the tree.
 *   (u) bar host (37-04, D-08, Pitfall 8): the notification bar host class is
 *       not in BLOCKING_LAYER_SELECTOR, it is a child of the web tab widget's
 *       node, and the published page rect starts below it and shrinks by its
 *       height, so a bar never covers page content.
 *   (v) bar push (rule 9 companion): the one notificationBar push is in
 *       pushNotificationBar, and it carries no URL, principal, origin or
 *       callback (display fields and a token).
 *   (w) bar answers (D-12): webTabBarActionReply resolves the chrome-held
 *       record by token, checks it belongs to the sender's own tab and frame,
 *       and the bar section reads no sender-supplied URL, origin or principal.
 *   (x) Phase 36 call site (D-12): openAdoptedWebTab is called exactly once,
 *       inside openBlockedPopup, behind the http(s) wall, and the superseded
 *       webTabAdopt/adoptTab vocabulary appears nowhere.
 *   (y) enum parity (D-03): the barKind:action pairs web-tab.ts sends
 *       (NOTIFICATION_BAR_ACTIONS, the one webTabBarAction sender's set) equal
 *       the pairs handleWebTabAction accepts (WEB_TAB_BAR_ACTIONS), both derived
 *       from the tree, and every accepted action has a BAR_ANSWERS handler.
 *   (z) no stock bar call (N2): nothing under powerbrowser/shell calls or reads
 *       getNotificationBox or gNotificationBox; the stock boxes throw in the
 *       shell, so the bars replace them wholesale.
 * The prompt section ends where the '// Phase 37: notification bars.' section
 * starts; rules (c), (f) and (h) read the prompt section only.
 * Rules (j), (k), (q) and (r) are the furniture-gate rows for plans 02 and 04; at
 * the Phase 35 merge they move to verify-shell-furniture.mjs with rule (a).
 *
 * Every expectation is derived from the tree at check time. --self-test runs
 * the unmodified fixture green first (the same-session positive control), then
 * plants one fault per rule in memory and requires each to go red naming the
 * drift. Text reads only: --quick.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FACADES } from './verify-shell-gbrowser-standin.mjs';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'verify-permission-prompts';

const API = 'powerbrowser/shell/PowerBrowserAPI.sys.mjs';
const SHELL = 'powerbrowser/shell/powerbrowser.js';
const XHTML = 'powerbrowser/shell/powerbrowser.xhtml';
const WEB_TAB = 'theia/extensions/tab-uris/src/browser/web-tab.ts';
const UPSTREAM_PANEL = 'upstream/browser/base/content/popup-notifications.inc.xhtml';
const UPSTREAM_MOZBUILD = 'upstream/toolkit/modules/moz.build';
const UPSTREAM_BROWSER_JS = 'upstream/browser/base/content/browser.js';
const UPSTREAM_POPUPSET = 'upstream/browser/base/content/main-popupset.inc.xhtml';
const UPSTREAM_PROMPTER = 'upstream/toolkit/components/passwordmgr/LoginManagerPrompter.sys.mjs';
const GATE = 'scripts/verify-permission-prompts.mjs';
const VERDICT = '.planning/probes/prompt-probe-verdict.json';
const OUTCOMES = ['stock-keeps-ide-usable', 'stock-blocks-ide'];
/** A getTabDialogBox member, method, property or assignment on the stand-in. */
const TAB_DIALOG_MEMBER = /\bgetTabDialogBox\s*(?:\(|:|=(?!=))/;
const FRONTEND_DIRS = ['theia/extensions/tab-uris/src/browser', 'theia/extensions/chrome-bar/src/browser'];
const SHELL_DIR = 'powerbrowser/shell';
/** Every grant or revoke call of SitePermissions and the permission manager. */
const PERMISSION_WRITE = /\b(?:setForPrincipal|removeFromPrincipal|addFromPrincipal)\s*\(|\bperms\.(?:add|remove)\w*\s*\(/g;

const MODULE_FILE = 'PopupNotifications.sys.mjs';
const SECTION_MARKER = '// Phase 37: permission prompts.';
const BAR_SECTION_MARKER = '// Phase 37: notification bars.';
const INSTALLER = 'installPermissionPromptFurniture';
const PANEL_ID = 'notification-popup';
const TEMPLATE_ID = 'webRTC-shareDevices-notification';
const PREVIEW_ELEMENT = 'webrtc-preview';
const PASSWORD_TEMPLATE_ID = 'password-notification';
const LOGIN_ELEMENT = 'login-doorhanger-username-field';
const AUTOCOMPLETE_ID = 'PopupAutoComplete';
/** A credential-shaped key or argument (D-07). */
const CREDENTIAL = /passw|credential|username|login/i;
/** Every log call a shell source can make. */
const LOG_CALL = /\b(?:PowerBrowserAPI\.log|console\.(?:log|info|warn|error|debug)|dump)\s*\(/g;
const FORBIDDEN_FAMILY = /allow|grant|permit|doorhanger|prompt/i;
const CONSTRUCTION = /new\s+(?:[\w$]+\.)*PopupNotifications\s*\(\s*([\w$]*)/g;

/** `/* … *\/` blocks and `//` line comments out (a `//` only at line start or after whitespace, so URLs survive). */
function stripComments(text) {
    return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');
}

function derive(text, re) {
    return [...text.matchAll(re)].map(m => m[1]);
}

/** The body of a top-level `[export] [async] function name(`, up to its column-0 `}`; '' when absent. */
function functionBody(text, name) {
    const start = text.search(new RegExp(`^(?:export )?(?:async )?function ${name}\\(`, 'm'));
    if (start === -1) {
        return '';
    }
    const end = text.indexOf('\n}', start);
    return end === -1 ? text.slice(start) : text.slice(start, end);
}

/** The text from the first `{` at or after `from` to its matching `}` (strings not modelled; enough for handlers). */
function braceBlock(text, from) {
    const open = text.indexOf('{', from);
    if (open === -1) {
        return '';
    }
    let depth = 0;
    for (let i = open; i < text.length; i++) {
        if (text[i] === '{') {
            depth++;
        } else if (text[i] === '}' && --depth === 0) {
            return text.slice(open, i + 1);
        }
    }
    return text.slice(open);
}

/** `name="value"` pairs of one tag's attribute text, as a set of strings. */
function attrSet(attrText) {
    return new Set([...attrText.matchAll(/([\w:-]+)="([^"]*)"/g)].map(m => `${m[1]}="${m[2]}"`));
}

/** The `<popupnotification id="…">` element's text up to its close tag (either prefix), comments out; '' when absent. */
function templateBlock(text, id = TEMPLATE_ID) {
    const open = new RegExp(`<((?:xul:)?popupnotification)\\s[^>]*?\\bid="${id}"`).exec(text);
    if (!open) {
        return '';
    }
    const end = text.indexOf(`</${open[1]}>`, open.index);
    return (end === -1 ? text.slice(open.index) : text.slice(open.index, end)).replace(/<!--[\s\S]*?-->/g, '');
}

/** Each start tag of a block as `tag attr="v" ...` (attributes sorted, namespace declarations dropped), in document order. */
function startTags(block) {
    return [...block.matchAll(/<([\w:-]+)((?:\s+[\w:-]+="[^"]*")*)\s*\/?>/g)].map(m => [m[1], ...[...attrSet(m[2])].filter(a => !/^xmlns(?::|=)/.test(a)).sort()].join(' '));
}

/** Each sendWebTabPush payload object literal of `text`, nested braces included, with the call text before it. */
function pushPayloads(text) {
    return [...text.matchAll(/sendWebTabPush\(\s*[\w$.]+\s*,\s*(?=\{)/g)].map(m => ({ call: m[0], body: braceBlock(text, m.index + m[0].length) }));
}

/** The top-level keys of an object literal (nested literals and parentheses skipped). */
function topKeys(body) {
    let depth = 0;
    let flat = '';
    for (const ch of body.slice(1, -1)) {
        depth += '{(['.includes(ch) ? 1 : ')}]'.includes(ch) ? -1 : 0;
        flat += depth === 0 || '{(['.includes(ch) && depth === 1 ? ch : ' ';
    }
    return derive(flat, /(?:^|,)\s*([A-Za-z_$][\w$]*)\s*(?=[:,]|$)/g);
}

/** The argument text of the call whose `(` is at `open`, string literal text blanked (template interpolations kept). */
function callArgs(text, open) {
    let depth = 0;
    let end = open;
    for (; end < text.length; end++) {
        if (text[end] === '(') {
            depth++;
        } else if (text[end] === ')' && --depth === 0) {
            break;
        }
    }
    return text.slice(open + 1, end)
        .replace(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"/g, '""')
        .replace(/`((?:[^`\\]|\\.)*)`/g, (_, body) => derive(body, /\$\{([^}]*)\}/g).join(' '));
}

/** The URL upstream ships `MODULE_FILE` at, from the moz.build block that lists it (MOZ_SRC_FILES or EXTRA_JS_MODULES[.sub]). */
function moduleUrl(mozbuild) {
    const lines = mozbuild.split('\n');
    const at = lines.findIndex(line => line.trim() === `"${MODULE_FILE}",`);
    for (let i = at; i >= 0; i--) {
        const m = /^\s*(MOZ_SRC_FILES|EXTRA_JS_MODULES)((?:\.[\w]+)*)\s*\+=\s*\[/.exec(lines[i]);
        if (m) {
            return m[1] === 'MOZ_SRC_FILES'
                ? `moz-src:///toolkit/modules/${MODULE_FILE}`
                : `resource://gre/modules/${m[2].split('.').filter(Boolean).map(seg => `${seg}/`).join('')}${MODULE_FILE}`;
        }
    }
    return null;
}

function readSources() {
    const files = new Set([API, SHELL, XHTML, WEB_TAB, UPSTREAM_PANEL, UPSTREAM_MOZBUILD, UPSTREAM_BROWSER_JS, UPSTREAM_POPUPSET, UPSTREAM_PROMPTER, GATE]);
    for (const name of readdirSync(join(REPO_ROOT, SHELL_DIR))) {
        if (/\.m?js$/.test(name)) {
            files.add(`${SHELL_DIR}/${name}`);
        }
    }
    for (const dir of FRONTEND_DIRS) {
        for (const name of readdirSync(join(REPO_ROOT, dir), { recursive: true })) {
            if (/\.tsx?$/.test(name)) {
                files.add(`${dir}/${name}`);
            }
        }
    }
    const sources = Object.fromEntries([...files].map(file => [file, readFileSync(join(REPO_ROOT, file), 'utf8')]));
    sources[VERDICT] = existsSync(join(REPO_ROOT, VERDICT)) ? readFileSync(join(REPO_ROOT, VERDICT), 'utf8') : null;
    return sources;
}

/**
 * Rule (p): the probe-1 verdict against the tree's dialog state.
 * @returns {{failures: string[], outcome: string|null, provisional: boolean}}
 */
function checkDialogOutcome(raw, exists = file => existsSync(join(REPO_ROOT, file))) {
    const failures = [];
    let verdict;
    try {
        verdict = JSON.parse(raw[VERDICT] ?? 'null');
    } catch (error) {
        return { failures: [`dialog outcome: ${VERDICT} is not JSON (${error.message})`], outcome: null, provisional: false };
    }
    if (!verdict || typeof verdict !== 'object') {
        return { failures: [`dialog outcome: ${VERDICT} is missing -- probe 1 has no verdict, so the dialog branch is unpinned`], outcome: null, provisional: false };
    }
    const { outcome, provisional, relayFeasible, evidence = {} } = verdict;
    if (!OUTCOMES.includes(outcome)) {
        failures.push(`dialog outcome: '${outcome}' is not one of ${OUTCOMES.join(', ')}`);
    }
    const shots = evidence.screenshots;
    if (provisional === true) {
        if (!Array.isArray(shots) || shots.length || evidence.pushLog != null || evidence.ideEditOk != null || verdict.build != null) {
            failures.push(`dialog outcome: the provisional verdict claims live evidence -- a provisional verdict carries none until the live probe overwrites it`);
        }
    } else if (!Array.isArray(shots) || !shots.length || typeof evidence.pushLog !== 'string' || typeof evidence.ideEditOk !== 'boolean' || !verdict.build || !verdict.date) {
        failures.push(`dialog outcome: the live verdict lacks live evidence (screenshots, pushLog, ideEditOk, build and date are all required)`);
    } else {
        const missing = [...shots, evidence.pushLog].filter(file => !exists(file));
        if (missing.length) {
            failures.push(`dialog outcome: the live verdict names evidence that is not on disk: ${missing.join(', ')}`);
        }
    }
    if (outcome === 'stock-blocks-ide' && typeof relayFeasible !== 'boolean') {
        failures.push(`dialog outcome: stock-blocks-ide needs relayFeasible true or false, got ${JSON.stringify(relayFeasible)}`);
    }
    if (outcome === 'stock-blocks-ide' && relayFeasible === false) {
        failures.push(`dialog outcome: PROMPT-03 cannot be met as written (stock-blocks-ide, relayFeasible false) -- route to Chris`);
    }
    const member = TAB_DIALOG_MEMBER.test(stripComments(raw[SHELL]));
    if (outcome === 'stock-keeps-ide-usable' && member) {
        failures.push(`dialog outcome drift: the verdict says stock-keeps-ide-usable but ${SHELL} defines getTabDialogBox -- PromptParent would retarget every content dialog onto the tab-dialog path (Pitfall 2)`);
    }
    if (outcome === 'stock-blocks-ide' && relayFeasible === true && !member) {
        failures.push(`dialog outcome drift: the verdict says stock-blocks-ide with a feasible relay but ${SHELL} has no getTabDialogBox member -- build the audited relay branch (37-03 Task 3)`);
    }
    return { failures, outcome: outcome ?? null, provisional: provisional === true };
}

/**
 * @param raw sources keyed by repo path
 * @param facadeNames the facade names verify-shell-gbrowser-standin.mjs audits
 * @returns {string[]} failures; empty means the contract holds
 */
function checkPrompts(raw, facadeNames = FACADES.map(f => f.name), exists = undefined) {
    const failures = [];
    const api = stripComments(raw[API]);
    const markup = raw[XHTML].replace(/<!--[\s\S]*?-->/g, '');
    const sectionAt = raw[API].indexOf(SECTION_MARKER);
    const barAt = raw[API].indexOf(BAR_SECTION_MARKER);
    const section = sectionAt === -1 ? '' : stripComments(raw[API].slice(sectionAt, barAt > sectionAt ? barAt : undefined));
    const bars = barAt === -1 ? '' : stripComments(raw[API].slice(barAt));
    if (sectionAt === -1) {
        failures.push(`section: ${API} has no '${SECTION_MARKER}' end-of-file section -- the prompt code has no home, so rules (a), (c) and (f) prove nothing`);
    }

    // (a) The panel, attribute for attribute against upstream's own markup.
    const upstream = /<panel\s+id="notification-popup"([^>]*?)\/?>/.exec(raw[UPSTREAM_PANEL]);
    const upstreamAttrs = upstream ? attrSet(upstream[1]) : new Set();
    if (upstreamAttrs.size === 0) {
        failures.push(`panel: derived ZERO attributes of <panel id="${PANEL_ID}"> from ${UPSTREAM_PANEL} -- the comparison proves nothing (broken instrument)`);
    }
    const ours = /<xul:panel\s+id="notification-popup"([^>]*?)\/?>/.exec(markup);
    if (!ours) {
        failures.push(`panel: ${XHTML} has no <xul:panel id="${PANEL_ID}"> -- PopupNotifications has no panel to show a prompt in`);
    } else if (upstreamAttrs.size) {
        const mine = attrSet(ours[1]);
        const missing = [...upstreamAttrs].filter(a => !mine.has(a));
        const surplus = [...mine].filter(a => !upstreamAttrs.has(a));
        if (missing.length || surplus.length) {
            failures.push(`panel: ${XHTML}'s #${PANEL_ID} is not upstream's verbatim -- missing ${missing.join(' ') || '(none)'}; surplus ${surplus.join(' ') || '(none)'}`);
        }
    }
    const anchorId = /const PROMPT_ANCHOR_ID = "([\w-]+)"/.exec(section)?.[1];
    if (sectionAt !== -1 && !anchorId) {
        failures.push(`panel: the prompt section names no PROMPT_ANCHOR_ID -- the panel has no anchor to open against`);
    } else if (anchorId && !markup.includes(`id="${anchorId}"`)) {
        failures.push(`panel: the anchor id ${anchorId} the boundary names is not an element id in ${XHTML}`);
    }

    // (b) One construction site, inside the installer, on upstream's module URL; one bootstrap call.
    const sites = [...api.matchAll(CONSTRUCTION)];
    if (sites.length !== 1) {
        failures.push(`construction: ${API} has ${sites.length} PopupNotifications construction sites -- exactly one is allowed, inside ${INSTALLER}`);
    }
    const installer = functionBody(api, INSTALLER);
    if (!installer) {
        failures.push(`construction: ${API} has no top-level function ${INSTALLER}`);
    } else if (sites.length === 1 && !installer.includes(sites[0][0])) {
        failures.push(`construction: the PopupNotifications construction is outside ${INSTALLER}`);
    }
    const url = moduleUrl(raw[UPSTREAM_MOZBUILD]);
    if (!url) {
        failures.push(`construction: ${UPSTREAM_MOZBUILD} does not list ${MODULE_FILE} in a MOZ_SRC_FILES or EXTRA_JS_MODULES block (broken instrument)`);
    } else if (installer && !installer.includes(`importESModule("${url}")`)) {
        failures.push(`construction: ${INSTALLER} does not import ${url}, the URL upstream's moz.build ships ${MODULE_FILE} at`);
    }
    const calls = derive(stripComments(raw[SHELL]), new RegExp(`(${INSTALLER})\\s*\\(`, 'g')).length;
    if (calls !== 1) {
        failures.push(`construction: ${SHELL} calls ${INSTALLER} ${calls} times -- the furniture has exactly one bootstrap line`);
    }

    // (c) The overlay's own principal only; no sender field read; a display-only push.
    if (section) {
        for (const token of new Set(section.match(/\b\w*[Pp]rincipal\w*\b/g) ?? [])) {
            if (token !== 'contentPrincipal') {
                failures.push(`principal: the prompt section uses '${token}' -- the only principal it may read is the overlay's own contentPrincipal (D-02)`);
            }
        }
        if (!section.includes('.contentPrincipal')) {
            failures.push(`principal: the prompt section reads no .contentPrincipal -- the display host is not derived chrome-side from the overlay's own principal`);
        }
        for (const read of new Set(section.match(/\b(?:data|detail|message|msg)\s*\??\.\s*(?:origin|principal|host|displayHost|url|uri|spec)\b/g) ?? [])) {
            failures.push(`principal: the prompt section reads the sender-supplied ${read.replace(/\s/g, '')} (D-02)`);
        }
        for (const push of section.matchAll(/sendWebTabPush\(\s*[\w$.]+\s*,\s*\{([^}]*)\}/g)) {
            const leak = derive(push[1], /\b([A-Za-z]+)\s*[:,}]/g).filter(key => /principal|url|uri|origin|spec|callback/i.test(key));
            if (leak.length) {
                failures.push(`principal: a prompt push carries ${leak.join(', ')} -- chrome to Theia is display-only fields and a token`);
            }
        }
    }

    // (d) The forbidden family over every webTab and store kind.
    const frontend = Object.keys(raw).filter(file => FRONTEND_DIRS.some(dir => file.startsWith(`${dir}/`)));
    const webTabKinds = new Set([
        ...derive(api, /case "(webTab[A-Za-z]+)"/g),
        ...frontend.flatMap(file => derive(stripComments(raw[file]), /kind: '(webTab[A-Za-z]+)'/g)),
    ]);
    const storeSet = /const STORE_REQUEST_KINDS = new Set\(\[([^\]]*)\]\)/.exec(api);
    const storeKinds = new Set([
        ...(storeSet ? derive(storeSet[1], /"([A-Za-z]+)"/g) : []),
        ...derive(functionBody(api, 'handleStoreRequest'), /case "([A-Za-z]+)"/g),
    ]);
    if (webTabKinds.size === 0 || storeKinds.size === 0) {
        failures.push(`forbidden-family: derived ${webTabKinds.size} webTab kinds and ${storeKinds.size} store kinds -- an empty set makes the ban vacuous (broken instrument)`);
    }
    for (const kind of [...webTabKinds, ...storeKinds]) {
        if (FORBIDDEN_FAMILY.test(kind)) {
            failures.push(`forbidden-family: the kind ${kind} names allow, grant, permit, doorhanger or prompt -- a frame-callable answer to a prompt (D-03, D-11)`);
        }
    }

    // (e) The facade the construction passes is audited member by member.
    if (sites.length === 1) {
        const facade = sites[0][1];
        if (!facade || !facadeNames.includes(facade)) {
            failures.push(`facade: the tabbrowser facade '${facade || '(not an identifier)'}' passed to the PopupNotifications construction is not a FACADES row of verify-shell-gbrowser-standin.mjs, so no gate compares its members (Pitfall 2)`);
        }
    }

    // (f) The prompt section serves no request kind.
    if (/case\s+"/.test(section) || /WEB_TAB_ACTION_KINDS|STORE_REQUEST_KINDS/.test(section)) {
        failures.push(`no-request-kind: the prompt section serves a case arm or touches a kind routing set -- no Theia message may reach a prompt (D-11)`);
    }

    // (g) The doorhanger subscriber is display-only.
    const subscribers = frontend.flatMap(file => {
        const text = stripComments(raw[file]);
        return [...text.matchAll(/onPush\(\s*'doorhanger'/g)].map(m => ({ file, body: braceBlock(text, m.index) }));
    });
    if (subscribers.length === 0) {
        failures.push(`subscriber: no frontend source subscribes to the doorhanger push -- the pending-prompt indicator has no source`);
    }
    for (const { file, body } of subscribers) {
        if (/\b(?:send|request|dispatch|dispatchEvent)\s*\(|\bkind\s*:/.test(body)) {
            failures.push(`subscriber: the doorhanger subscriber in ${file} sends a message -- a Theia path would answer a prompt (D-11)`);
        }
    }

    // (h) Post-review fix 1 (UI spoofing): the facade reports a web tab selected only while one is current, and the one
    // write of the visible-tab truth refreshes the stock module, so no prompt shows over a page the user is not on.
    if (section) {
        const facadeAt = section.search(/\bpromptTabbrowser\s*=\s*\{/);
        const facadeBody = facadeAt === -1 ? '' : braceBlock(section, facadeAt);
        for (const getter of ['selectedBrowser', 'selectedTab']) {
            const at = facadeBody.search(new RegExp(`get ${getter}\\(`));
            if (at === -1 || !braceBlock(facadeBody, at).includes('promptVisibleTab(')) {
                failures.push(`visible-tab: the facade's ${getter} ignores whether a web tab is current (promptVisibleTab) -- a prompt would show over a page while the IDE is current`);
            }
        }
        if (!functionBody(section, 'promptVisibleTab').includes('activeTabByFrame.get(')) {
            failures.push(`visible-tab: promptVisibleTab does not read activeTabByFrame, the Theia frame's current web tab`);
        }
    }
    // (i) Post-review fix 2 (cross-tab denial): the queue cap counts and evicts the requesting tab's records only.
    if (section) {
        const cap = /\.filter\(([^;]*)\);\s*if \(queued\.length > PROMPT_QUEUE_CAP\)/.exec(section);
        if (!cap) {
            failures.push(`queue-scope: the prompt section has no PROMPT_QUEUE_CAP eviction over a filtered queue -- the D-04 cap cannot be read`);
        } else if (!/\br\.tabId === tabId\b/.test(cap[1]) || /\br\.window\b/.test(cap[1])) {
            failures.push(`queue-scope: the queue cap filters ${cap[1].trim()} -- not the requesting tab alone, so one page's requests can evict another tab's prompt`);
        }
    }
    // (j) The WebRTC template, derived from upstream and compared id set and element by element.
    const upstreamTags = startTags(templateBlock(raw[UPSTREAM_PANEL]));
    const upstreamIds = new Set(derive(templateBlock(raw[UPSTREAM_PANEL]), /\sid="([^"]+)"/g));
    if (upstreamTags.length === 0 || upstreamIds.size === 0) {
        failures.push(`template: derived ZERO elements of #${TEMPLATE_ID} from ${UPSTREAM_PANEL} -- the comparison proves nothing (broken instrument)`);
    } else {
        const ourBlock = templateBlock(markup);
        if (!ourBlock) {
            failures.push(`template: ${XHTML} has no #${TEMPLATE_ID} -- WebRTCParent finds no template, so a camera or microphone request never resolves`);
        } else {
            const ourIds = new Set(derive(ourBlock, /\sid="([^"]+)"/g));
            const missing = [...upstreamIds].filter(id => !ourIds.has(id));
            const surplus = [...ourIds].filter(id => !upstreamIds.has(id));
            if (missing.length || surplus.length) {
                failures.push(`template: #${TEMPLATE_ID} ids differ from upstream -- missing ids ${missing.join(' ') || '(none)'}; surplus ids ${surplus.join(' ') || '(none)'}`);
            }
            const ourTags = startTags(ourBlock);
            const drift = upstreamTags.findIndex((tag, i) => ourTags[i] !== tag);
            if (drift !== -1 || ourTags.length !== upstreamTags.length) {
                const at = drift === -1 ? upstreamTags.length : drift;
                failures.push(`template: #${TEMPLATE_ID} element drift at element ${at + 1} -- upstream <${upstreamTags[at] ?? '(end)'}>, ours <${ourTags[at] ?? '(end)'}>`);
            }
        }
    }
    const ownSource = stripComments(raw[GATE] ?? '');
    if (/\[\s*['"`](?:webRTC|password-notification)-[\w-]+['"`]\s*,/.test(ownSource)) {
        failures.push(`template: ${GATE} holds a hand-kept array of template ids -- the expectation must be derived from ${UPSTREAM_PANEL} (CLAUDE.md verification rule 2)`);
    }

    // (k) The webrtc-preview creation callback, on the module URL upstream's browser.js imports.
    const previewUrl = new RegExp(`setElementCreationCallback\\(\\s*"${PREVIEW_ELEMENT}"[\\s\\S]*?importESModule\\(\\s*"([^"]+)"`).exec(raw[UPSTREAM_BROWSER_JS])?.[1];
    if (!previewUrl) {
        failures.push(`preview-callback: ${UPSTREAM_BROWSER_JS} registers no ${PREVIEW_ELEMENT} creation callback (broken instrument)`);
    } else if (!new RegExp(`setElementCreationCallback\\(\\s*"${PREVIEW_ELEMENT}"[^;]*importESModule\\(\\s*"${previewUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`).test(installer)) {
        failures.push(`preview-callback: ${INSTALLER} registers no ${PREVIEW_ELEMENT} creation callback importing ${previewUrl} -- WebRTCParent's lazy preview insert would throw`);
    }

    // (q) The password template, derived from upstream and compared id set and element by element; no hidden input.
    const upstreamPassword = templateBlock(raw[UPSTREAM_PANEL], PASSWORD_TEMPLATE_ID);
    const upstreamPasswordIds = new Set(derive(upstreamPassword, /\sid="([^"]+)"/g));
    const ourPassword = templateBlock(markup, PASSWORD_TEMPLATE_ID);
    if (!upstreamPassword || upstreamPasswordIds.size === 0) {
        failures.push(`password-template: derived ZERO elements of #${PASSWORD_TEMPLATE_ID} from ${UPSTREAM_PANEL} -- the comparison proves nothing (broken instrument)`);
    } else if (!ourPassword) {
        failures.push(`password-template: ${XHTML} has no #${PASSWORD_TEMPLATE_ID} -- LoginManagerPrompter finds no template, so a login is never offered for saving`);
    } else {
        const ourIds = new Set(derive(ourPassword, /\sid="([^"]+)"/g));
        const missing = [...upstreamPasswordIds].filter(id => !ourIds.has(id));
        const surplus = [...ourIds].filter(id => !upstreamPasswordIds.has(id));
        if (missing.length || surplus.length) {
            failures.push(`password-template: #${PASSWORD_TEMPLATE_ID} ids differ from upstream -- missing ids ${missing.join(' ') || '(none)'}; surplus ids ${surplus.join(' ') || '(none)'}`);
        }
        if (/<(?:html:)?input\b|\btype="hidden"/.test(ourPassword)) {
            failures.push(`password-template: hidden credential input present in #${PASSWORD_TEMPLATE_ID} -- a second value path beside the prompter's own fields (D-07)`);
        }
        const upstreamTags = startTags(upstreamPassword);
        const ourTags = startTags(ourPassword);
        const drift = upstreamTags.findIndex((tag, i) => ourTags[i] !== tag);
        if (drift !== -1 || ourTags.length !== upstreamTags.length) {
            const at = drift === -1 ? upstreamTags.length : drift;
            failures.push(`password-template: #${PASSWORD_TEMPLATE_ID} element drift at element ${at + 1} -- upstream <${upstreamTags[at] ?? '(end)'}>, ours <${ourTags[at] ?? '(end)'}>`);
        }
    }
    const upstreamPopup = new RegExp(`<panel\\s([^>]*?\\bid="${AUTOCOMPLETE_ID}"[^>]*?)\\/?>`).exec(raw[UPSTREAM_POPUPSET]);
    const ourPopup = new RegExp(`<xul:panel\\s([^>]*?\\bid="${AUTOCOMPLETE_ID}"[^>]*?)\\/?>`).exec(markup);
    if (!upstreamPopup) {
        failures.push(`password-template: ${UPSTREAM_POPUPSET} has no #${AUTOCOMPLETE_ID} (broken instrument)`);
    } else if (!ourPopup) {
        failures.push(`password-template: ${XHTML} has no #${AUTOCOMPLETE_ID} -- the prompter's showing callback writes its select hooks and would throw`);
    } else {
        const want = [...attrSet(upstreamPopup[1])].sort().join(' ');
        const got = [...attrSet(ourPopup[1])].sort().join(' ');
        if (want !== got) {
            failures.push(`password-template: #${AUTOCOMPLETE_ID} is not upstream's verbatim -- upstream ${want}; ours ${got}`);
        }
    }

    // (r) The login-doorhanger-username-field creation callback, on the module URL upstream's browser.js imports.
    const loginUrl = new RegExp(`setElementCreationCallback\\(\\s*"${LOGIN_ELEMENT}"[\\s\\S]*?importESModule\\(\\s*"([^"]+)"`).exec(raw[UPSTREAM_BROWSER_JS])?.[1];
    if (!loginUrl) {
        failures.push(`login-callback: ${UPSTREAM_BROWSER_JS} registers no ${LOGIN_ELEMENT} creation callback (broken instrument)`);
    } else if (!new RegExp(`setElementCreationCallback\\(\\s*"${LOGIN_ELEMENT}"[^;]*importESModule\\(\\s*"${loginUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`).test(installer)) {
        failures.push(`login-callback: ${LOGIN_ELEMENT} callback missing from ${INSTALLER} (importing ${loginUrl}) -- the username field never upgrades and the password template is inert`);
    }

    // (s) The stock prompter owns the fields: it fills and reads back each one, and nothing in the tree names them.
    const fieldIds = derive(upstreamPassword, /<html:[\w-]+\s[^>]*?\bid="([^"]+)"/g);
    const prompter = raw[UPSTREAM_PROMPTER] ?? '';
    const writeAt = prompter.indexOf('const writeDataToUI');
    const readAt = prompter.indexOf('const readDataFromUI');
    if (fieldIds.length === 0 || writeAt === -1 || readAt === -1) {
        failures.push(`prompter-ownership: derived ${fieldIds.length} template fields, or ${UPSTREAM_PROMPTER} has no writeDataToUI/readDataFromUI (broken instrument)`);
    } else {
        for (const [name, at] of [['writeDataToUI', writeAt], ['readDataFromUI', readAt]]) {
            const body = braceBlock(prompter, at);
            const unowned = fieldIds.filter(id => !body.includes(`"${id}"`));
            if (unowned.length) {
                failures.push(`prompter-ownership: upstream ${name} no longer touches ${unowned.join(', ')} -- the fill and read-back ownership D-07 rests on has moved`);
            }
        }
    }
    for (const file of Object.keys(raw).filter(f => (f.startsWith(`${SHELL_DIR}/`) && f !== XHTML) || FRONTEND_DIRS.some(dir => f.startsWith(`${dir}/`)))) {
        for (const id of fieldIds) {
            if (stripComments(raw[file] ?? '').includes(id)) {
                failures.push(`prompter-ownership: ${file} names the credential field ${id} -- a second writer or reader beside the stock prompter (D-07)`);
            }
        }
    }

    // (t) No credential crosses to Theia or reaches a log. Derived over every push, kind literal and log call site.
    const apiFiles = Object.keys(raw).filter(file => file.startsWith(`${SHELL_DIR}/`) && /\.m?js$/.test(file));
    let pushSites = 0;
    let logSites = 0;
    for (const file of apiFiles) {
        const text = stripComments(raw[file]);
        for (const push of pushPayloads(text)) {
            pushSites++;
            const leak = topKeys(push.body).filter(key => CREDENTIAL.test(key));
            if (leak.length) {
                failures.push(`no-credential: credential field in a Theia push in ${file} (${leak.join(', ')}) -- the prompter owns credential values; none crosses to Theia (D-07)`);
            }
        }
        for (const call of text.matchAll(LOG_CALL)) {
            logSites++;
            const args = callArgs(text, call.index + call[0].length - 1);
            if (CREDENTIAL.test(args)) {
                failures.push(`no-credential: credential value in log in ${file}: ${call[0]}${args.trim().slice(0, 80)}) -- logs carry kind and class only (D-07)`);
            }
        }
    }
    for (const file of frontend) {
        for (const m of stripComments(raw[file]).matchAll(/\{[^{}]*\bkind:\s*'webTab[A-Za-z]+'[^{}]*\}/g)) {
            const leak = derive(m[0], /\b([A-Za-z_$][\w$]*)\s*[:,}]/g).filter(key => CREDENTIAL.test(key));
            if (leak.length) {
                failures.push(`no-credential: credential field in a Theia message in ${file} (${leak.join(', ')}) -- Theia never syncs a credential to chrome (D-07)`);
            }
        }
    }
    if (pushSites === 0 || logSites === 0) {
        failures.push(`no-credential: derived ${pushSites} push sites and ${logSites} log call sites under ${SHELL_DIR} -- the scan proves nothing (broken instrument)`);
    }

    // (l) One prompt-path writer: the stock PermissionUI callback. The Phase 31 site panel's arm is the user's own edit.
    const shellFiles = Object.keys(raw).filter(file => file.startsWith(`${SHELL_DIR}/`));
    if (shellFiles.length === 0) {
        failures.push(`single-writer: derived ZERO files under ${SHELL_DIR} -- the scan proves nothing (broken instrument)`);
    }
    const panelArmAt = api.indexOf('case "webTabSetPermission"');
    const panelArm = panelArmAt === -1 ? '' : braceBlock(api, panelArmAt);
    const panelStart = panelArmAt === -1 ? -1 : api.indexOf(panelArm, panelArmAt);
    for (const file of shellFiles) {
        const text = stripComments(raw[file]);
        for (const m of text.matchAll(PERMISSION_WRITE)) {
            const inPanelArm = file === API && panelStart !== -1 && m.index > panelStart && m.index < panelStart + panelArm.length;
            if (!inPanelArm) {
                failures.push(`single-writer: ${file} calls ${m[0].replace(/\s*\($/, '')} outside the site panel's webTabSetPermission arm -- a second permission writer; a prompt's grant is written only by the stock PermissionUI callback (D-02, D-11)`);
            }
        }
    }

    // (m) No remember field on any kind, push or arm.
    for (const file of frontend) {
        for (const m of stripComments(raw[file]).matchAll(/\{[^{}]*\bkind:\s*'webTab[A-Za-z]+'[^{}]*\}/g)) {
            if (/\bremember\w*\s*[:,}]/i.test(m[0])) {
                failures.push(`remember: a webTab kind literal in ${file} carries a remember field -- a Theia path would set Remember (D-11)`);
            }
        }
    }
    for (const push of api.matchAll(/sendWebTabPush\(\s*[\w$.]+\s*,\s*\{([^}]*)\}/g)) {
        if (/\bremember\w*\s*[:,}]/i.test(push[1])) {
            failures.push(`remember: a push payload in ${API} carries a remember field -- Remember is the stock checkbox only (D-11)`);
        }
    }
    if (/\b(?:data|detail|message|msg)\s*\??\.\s*remember/i.test(api)) {
        failures.push(`remember: ${API} reads a sender-supplied remember field -- a frame message would set Remember (D-11)`);
    }

    // (n) The sharing indicator follows chrome-observed webrtcUI state only.
    const sharingPushes = [...api.matchAll(/sendWebTabPush\(\s*[\w$.]+\s*,\s*\{\s*kind:\s*"sharingChanged"/g)];
    const sharingFn = functionBody(api, 'updateWebTabSharing');
    const pushFn = functionBody(api, 'pushWebTabSharing');
    if (sharingPushes.length !== 1 || !pushFn.includes(sharingPushes[0][0])) {
        failures.push(`sharing: ${API} has ${sharingPushes.length} sharingChanged pushes, or one outside pushWebTabSharing -- the indicator's source is not the observed webrtcUI state`);
    }
    // Only the observed report and the re-push of its stored state reach the push.
    const pushCallers = [...api.matchAll(/\bpushWebTabSharing\(/g)].length;
    if (pushCallers !== 3 || !sharingFn.includes('pushWebTabSharing(') || !functionBody(api, 'resendWebTabSharing').includes('pushWebTabSharing(')) {
        failures.push(`sharing: pushWebTabSharing is called from somewhere other than updateWebTabSharing and resendWebTabSharing -- the indicator's source is not the observed webrtcUI state`);
    }
    // (o) Post-review: the duplicate check covers the destination, and a re-registered overlay gets its state again.
    if (!/last\.windowGlobal === windowGlobal/.test(pushFn) || !/currentWindowGlobal/.test(pushFn)) {
        failures.push(`sharing-destination: pushWebTabSharing's duplicate check ignores the frontend WindowGlobal -- a reloaded frontend would never be sent a live sharing state (the indicator fails open)`);
    }
    const reopened = /if \(webTabs\.has\(tabId\)\) \{([^}]*)return "already-open";/.exec(api);
    if (!reopened || !reopened[1].includes('resendWebTabSharing(tabId)')) {
        failures.push(`sharing-destination: webTabOpen's already-open branch does not re-push the overlay's sharing state -- a re-registered tab shows no indicator while a track is live`);
    }
    if (sharingFn && !/\.webRTC\b/.test(sharingFn)) {
        failures.push(`sharing: updateWebTabSharing does not read the stock webRTC state WebRTCParent hands updateBrowserSharing`);
    }
    const shellText = stripComments(raw[SHELL]);
    const sharingCalls = [...shellText.matchAll(/\bupdateWebTabSharing\s*\(/g)].filter(m => !/[\w$]\s*$/.test(shellText.slice(Math.max(0, m.index - 1), m.index)));
    const memberAt = shellText.search(/^\s*updateBrowserSharing\(browser, state\) \{/m);
    const member = memberAt === -1 ? '' : braceBlock(shellText, memberAt);
    if (sharingCalls.length !== 1 || !member.includes('updateWebTabSharing(')) {
        failures.push(`sharing: ${SHELL} calls updateWebTabSharing ${sharingCalls.length} times, or outside the gBrowser updateBrowserSharing member -- only the stock WebRTCParent report may drive the indicator`);
    }
    if (/\b(?:data|detail|message|msg)\s*\??\.\s*(?:sharing|camera|microphone|screen)\b/.test(section.replace(functionBody(section, 'updateWebTabSharing'), ''))) {
        failures.push(`sharing: the prompt section reads a sender-supplied sharing field -- the indicator would be driven from a frame flag`);
    }
    const sharingSubscribers = [];
    for (const file of frontend) {
        const text = stripComments(raw[file]);
        const blocks = [...text.matchAll(/onPush\(\s*'sharingChanged'/g)].map(m => braceBlock(text, m.index));
        sharingSubscribers.push(...blocks.map(body => ({ file, body })));
        for (const m of text.matchAll(/\.sharing\s*=(?!=)/g)) {
            if (!blocks.some(body => text.indexOf(body) <= m.index && m.index < text.indexOf(body) + body.length)) {
                failures.push(`sharing: ${file} sets a tab's sharing state outside the sharingChanged subscriber -- indicator driven from a frame flag`);
            }
        }
        if (/\b(?:data|detail|message|msg)\s*\??\.\s*sharing\b/.test(text)) {
            failures.push(`sharing: ${file} reads a sharing field from a message -- indicator driven from a frame flag`);
        }
    }
    if (sharingSubscribers.length === 0) {
        failures.push(`sharing: no frontend source subscribes to the sharingChanged push -- the indicator has no source`);
    }
    for (const { file, body } of sharingSubscribers) {
        if (/\b(?:send|request|dispatch|dispatchEvent)\s*\(|\bkind\s*:/.test(body)) {
            failures.push(`sharing: the sharingChanged subscriber in ${file} sends a message -- it must be display-only`);
        }
    }

    // (u) The bar host is page furniture inside the widget, outside the blocking layer, and the page rect starts below it.
    const webTab = stripComments(raw[WEB_TAB]);
    const hostClass = /const BAR_HOST_CLASS = '([\w-]+)'/.exec(webTab)?.[1];
    const blocking = /const BLOCKING_LAYER_SELECTOR = '([^']*)'/.exec(webTab)?.[1];
    if (!hostClass || blocking === undefined) {
        failures.push(`bar-host: ${WEB_TAB} has no BAR_HOST_CLASS or BLOCKING_LAYER_SELECTOR -- the bar placement cannot be read (broken instrument)`);
    } else {
        if (blocking.split(',').some(sel => sel.trim().split(/\s+/).some(part => part.split('.').includes(hostClass)))) {
            failures.push(`bar-host: bar inside blocking layer -- BLOCKING_LAYER_SELECTOR lists .${hostClass}, so a bar would hide the page instead of shrinking its rect (D-08)`);
        }
        if (!/this\.barsNode\.className = BAR_HOST_CLASS;/.test(webTab) || !/this\.node\.appendChild\(this\.barsNode\)/.test(webTab)) {
            failures.push(`bar-host: the bar host is not a .${hostClass} child of the web tab widget's node -- a bar outside the widget is not the tab's (D-08)`);
        }
        const publish = braceBlock(webTab, webTab.search(/\n\s+publish\(\): void \{/));
        if (!/const bars = [^;]*this\.barsNode\.offsetHeight/.test(publish) || !/r\.top \+ bars/.test(publish) || !/r\.height - bars/.test(publish)) {
            failures.push(`bar-host: bar covers page content -- publish() does not start the page rect below the bar host and shrink it by the bar height (D-08, Pitfall 8)`);
        }
    }
    // (v) One notificationBar push, display-only.
    const barPushes = pushPayloads(api).filter(p => /^\{\s*kind:\s*"notificationBar"/.test(p.body));
    if (barPushes.length !== 1 || !functionBody(api, 'pushNotificationBar').includes(barPushes[0].body)) {
        failures.push(`bar-push: ${API} has ${barPushes.length} notificationBar pushes, or one outside pushNotificationBar -- the bar has more than one source`);
    } else {
        const leak = topKeys(barPushes[0].body).filter(key => /principal|url|uri|origin|spec|callback/i.test(key));
        if (leak.length) {
            failures.push(`bar-push: the notificationBar push carries ${leak.join(', ')} -- chrome to Theia is display fields and a token`);
        }
    }
    // (w) A bar answer acts on the chrome-held record of the sender's own tab; the bar section takes no URL from a frame.
    if (barAt === -1) {
        failures.push(`bar-answer: ${API} has no '${BAR_SECTION_MARKER}' section -- the notification bars have no home`);
    } else {
        const reply = functionBody(api, 'webTabBarActionReply');
        if (!/barRecords\.get\(data\.token\)/.test(reply)) {
            failures.push(`bar-answer: webTabBarActionReply does not resolve the chrome-held record by token`);
        }
        if (!/record\.theiaBrowser !== sender/.test(reply) || !/record\.tabId !== data\.tabId/.test(reply)) {
            failures.push(`bar-answer: a bar answer is not checked against the sending frame and its tab -- one tab's frame could answer another tab's bar`);
        }
        for (const read of new Set(bars.match(/\b(?:data|detail|message|msg)\s*\??\.\s*(?:url|uri|spec|href|origin|principal|triggeringPrincipal|host)\b/g) ?? [])) {
            failures.push(`bar-answer: Allow opened a frame-supplied URL -- the bar section reads ${read.replace(/\s/g, '')} (D-12: the stored record only)`);
        }
    }
    // (x) The one Phase 36 adoption call site, behind the http(s) wall; the superseded vocabulary is absent.
    const adoptCalls = [...api.matchAll(/\bopenAdoptedWebTab\(/g)].length;
    const opener = functionBody(api, 'openBlockedPopup');
    if (adoptCalls !== 1 || !/\bopenAdoptedWebTab\(/.test(opener)) {
        failures.push(`adopt-call: ${API} calls openAdoptedWebTab ${adoptCalls} times, or outside openBlockedPopup -- the blocked-popup Allow has one thin Phase 36 call site (D-12)`);
    } else if (opener.search(/https\?/) === -1 || opener.search(/https\?/) > opener.search(/\bopenAdoptedWebTab\(/)) {
        failures.push(`adopt-call: openBlockedPopup reaches openAdoptedWebTab before an http(s) wall on the stored spec`);
    }
    for (const file of [API, ...frontend]) {
        const hit = /\b(webTabAdopt|adoptTab|dropAdoptedTab|installNewWindowReceivers)\b/.exec(stripComments(raw[file] ?? ''));
        if (hit) {
            failures.push(`adopt-call: ${file} names ${hit[1]} -- the Phase 36 API is openAdoptedWebTab; the plan's adoption vocabulary was superseded`);
        }
    }

    // (y) The bar action enum: what the frontend sends equals what chrome accepts, per bar kind, both derived.
    const pairsOf = body => (body ? [...body.matchAll(/['"]([\w-]+)['"]\s*:\s*\[([^\]]*)\]/g)].flatMap(m => derive(m[2], /['"]([\w-]+)['"]/g).map(a => `${m[1]}:${a}`)) : []);
    const sent = new Set(pairsOf(/export const NOTIFICATION_BAR_ACTIONS = \{([\s\S]*?)\} as const;/.exec(webTab)?.[1]));
    const accepted = new Set(pairsOf(/const WEB_TAB_BAR_ACTIONS = \{([^;]*)\};/.exec(api)?.[1]));
    if (sent.size === 0 || accepted.size === 0) {
        failures.push(`bar-enum: derived ${sent.size} sent and ${accepted.size} accepted bar actions -- the parity proves nothing (broken instrument)`);
    } else {
        const unaccepted = [...sent].filter(pair => !accepted.has(pair));
        const unsent = [...accepted].filter(pair => !sent.has(pair));
        if (unaccepted.length) {
            failures.push(`bar-enum: web-tab.ts sends bar actions chrome does not accept: ${unaccepted.join(', ')}`);
        }
        if (unsent.length) {
            failures.push(`bar-enum: chrome accepts bar actions web-tab.ts never sends (stale): ${unsent.join(', ')}`);
        }
        const answers = /const BAR_ANSWERS = \{([\s\S]*?)\n\};/.exec(api)?.[1] ?? '';
        const handled = new Set(derive(answers, /^\s{2}(?:async\s+)?"?([\w-]+)"?\s*\(/gm));
        const unhandled = [...new Set([...accepted].map(pair => pair.split(':')[1]))].filter(action => !handled.has(action));
        if (unhandled.length) {
            failures.push(`bar-enum: accepted bar actions with no BAR_ANSWERS handler: ${unhandled.join(', ')}`);
        }
    }
    const senders = [...webTab.matchAll(/kind:\s*'webTabBarAction'/g)].length;
    if (senders !== 2 || !/barAction\(token: string, action: NotificationBarAction\)/.test(webTab)) {
        failures.push(`bar-enum: web-tab.ts names webTabBarAction ${senders} times (the message type and one sender expected), or the sender's action is not a NotificationBarAction -- the sent set is not the table`);
    }
    // (z) The stock notification boxes are never reached from the shell.
    for (const file of shellFiles) {
        const hit = /\b(getNotificationBox|gNotificationBox)\b/.exec(stripComments(raw[file]));
        if (hit) {
            failures.push(`no-stock-bar: ${file} reaches ${hit[1]} -- the stock notification box throws in the shell (no box exists); the per-tab bar replaces it`);
        }
    }

    const writes = (api.match(/\bactiveTabByFrame\.set\(/g) ?? []).length;
    const setter = functionBody(api, 'setActiveTabOfFrame');
    if (writes !== 1 || !setter.includes('activeTabByFrame.set(')) {
        failures.push(`visible-tab: activeTabByFrame is written ${writes} times, or outside setActiveTabOfFrame -- a focus move would not refresh the waiting prompts`);
    } else if (!setter.includes('anchorVisibilityChange(')) {
        failures.push(`visible-tab: setActiveTabOfFrame does not call the stock anchorVisibilityChange -- a waiting prompt would not hide or show with focus`);
    }
    failures.push(...checkDialogOutcome(raw, exists).failures);
    return failures;
}

/** Proves every rule discriminates on in-memory copies of the real sources, after the same-session green control. */
function selfTest() {
    const clean = readSources();
    const facadeNames = FACADES.map(f => f.name);
    const baseline = checkPrompts(clean, facadeNames);
    if (baseline.length) {
        console.error(`${NAME} --self-test: FAIL -- the unmodified fixture is red, so the planted results below would be meaningless:`);
        baseline.forEach(f => console.error(`  ${f}`));
        return 1;
    }
    console.log(`  ok  unmodified fixture -> green (same-session positive control)`);
    const verdictWith = patch => JSON.stringify({ ...JSON.parse(clean[VERDICT] ?? '{}'), ...patch });
    // Into the prompt section: just before the notification-bar section that follows it.
    const barAt = clean[API].indexOf(BAR_SECTION_MARKER);
    const promptEnd = clean[API].lastIndexOf('\n// ----', barAt);
    const inSection = text => `${clean[API].slice(0, promptEnd)}\n${text}\n${clean[API].slice(promptEnd)}`;
    const inBars = text => `${clean[API].replace(/\n$/, '')}\n${text}\n`;
    const cases = [
        {
            name: 'missing panel',
            sources: { ...clean, [XHTML]: clean[XHTML].replace(/<xul:panel\s+id="notification-popup"[^>]*\/>/, '') },
            expect: `has no <xul:panel id="${PANEL_ID}">`,
        },
        {
            name: 'second construction site',
            sources: { ...clean, [API]: inSection('const extraNotifications = new PopupNotifications(promptTabbrowser, null, null);') },
            expect: '2 PopupNotifications construction sites',
        },
        {
            name: 'sender-supplied origin',
            sources: { ...clean, [API]: inSection('const sent = Services.scriptSecurityManager.createContentPrincipalFromOrigin(data.origin);') },
            expect: 'sender-supplied data.origin',
        },
        {
            name: 'planted webTabAllow kind',
            sources: { ...clean, [API]: `${clean[API]}\nfunction planted(kind) { switch (kind) { case "webTabAllow": break; } }\n` },
            expect: 'the kind webTabAllow',
        },
        {
            name: 'planted webTabDoorhangerAction kind',
            sources: { ...clean, [WEB_TAB]: `${clean[WEB_TAB]}\nexport const planted = (c: WebTabChannel) => c.send({ kind: 'webTabDoorhangerAction', tabId: '' } as never);\n` },
            expect: 'the kind webTabDoorhangerAction',
        },
        {
            name: 'answering doorhanger subscriber',
            sources: { ...clean, [WEB_TAB]: clean[WEB_TAB].replace(/onPush\(\s*'doorhanger',[^{]*\{/, match => `${match}\n            this.send(detail as never);`) },
            expect: 'sends a message',
        },
        {
            name: 'unaudited facade',
            sources: clean,
            facadeNames: [],
            expect: 'is not a FACADES row',
        },
        {
            name: 'module URL respelt',
            sources: { ...clean, [API]: clean[API].replace(/importESModule\("[^"]*PopupNotifications\.sys\.mjs"\)/, 'importESModule("moz-src:///planted/PopupNotifications.sys.mjs")') },
            expect: 'the URL upstream\'s moz.build ships',
        },
        {
            name: 'prompt section serves a kind',
            sources: { ...clean, [API]: inSection('function plantedArm(kind) { switch (kind) { case "webTabPlanted": break; } }') },
            expect: 'serves a case arm',
        },
        {
            // Post-review fix 1 reverted: the facade reports the host's selection even while the IDE is current.
            name: 'facade ignores the current web tab',
            sources: { ...clean, [API]: clean[API].replace('return promptVisibleTab(host) ? host.selected.linkedBrowser : host.theiaBrowser;', 'return host.selected ? host.selected.linkedBrowser : host.theiaBrowser;') },
            expect: "the facade's selectedBrowser ignores whether a web tab is current",
        },
        {
            // Post-review fix 1 reverted: the webTabActivated arm writes the map directly, so no focus move refreshes prompts.
            name: 'activation writes the map directly',
            sources: { ...clean, [API]: clean[API].replace('setActiveTabOfFrame(actorRef.browsingContext.top.embedderElement, data.tabId);', 'activeTabByFrame.set(actorRef.browsingContext.top.embedderElement, data.tabId);') },
            expect: 'activeTabByFrame is written 2 times',
        },
        {
            // Post-review fix 2 reverted: the cap counts every queued record in the window.
            name: 'window-wide queue cap',
            sources: { ...clean, [API]: clean[API].replace('.filter(r => r.tabId === tabId && r.queued);', '.filter(r => r.window === window && r.queued);') },
            expect: 'not the requesting tab alone',
        },
        {
            name: 'template section removed (camera device list)',
            sources: { ...clean, [XHTML]: clean[XHTML].replace(/<popupnotificationcontent id="webRTC-selectCamera"[\s\S]*?<\/popupnotificationcontent>/, '') },
            expect: 'missing ids webRTC-selectCamera',
        },
        {
            name: 'template id renamed (camera menulist)',
            sources: { ...clean, [XHTML]: clean[XHTML].replace('<menulist id="webRTC-selectCamera-menulist"', '<menulist id="powerbrowser-camera-menulist"') },
            expect: 'surplus ids powerbrowser-camera-menulist',
        },
        {
            name: 'template menulist swapped for a custom widget',
            sources: { ...clean, [XHTML]: clean[XHTML].replace(/<menulist id="webRTC-selectWindow-menulist"\s+size="large">/, '<html:select id="webRTC-selectWindow-menulist" size="large">') },
            expect: 'element drift',
        },
        {
            name: 'preview callback removed',
            sources: { ...clean, [API]: clean[API].replace(/^.*setElementCreationCallback\("webrtc-preview".*\n/m, '') },
            expect: `registers no ${PREVIEW_ELEMENT} creation callback importing`,
        },
        {
            // Built from parts, so this file's own text holds no such array.
            name: 'hand-kept id array in the gate',
            sources: { ...clean, [GATE]: `${clean[GATE]}\nconst KEPT = [${"'"}webRTC-selectCamera${"'"}, ${"'"}webRTC-selectMicrophone${"'"}];\n` },
            expect: 'hand-kept array of template ids',
        },
        {
            name: 'second permission writer in the boundary',
            sources: { ...clean, [API]: inSection('function plantedWriter(browser) { lazy.SitePermissions.setForPrincipal(browser.contentPrincipal, "geolocation", 1); }') },
            expect: 'a second permission writer',
        },
        {
            name: 'remember field on a webTab kind literal',
            sources: { ...clean, [WEB_TAB]: `${clean[WEB_TAB]}\nexport const plantedRemember = (c: WebTabChannel) => c.send({ kind: 'webTabSetPermission', tabId: '', remember: true } as never);\n` },
            expect: 'carries a remember field -- a Theia path would set Remember (D-11)',
        },
        {
            name: 'sharing push outside the observed state',
            sources: { ...clean, [API]: inSection('function plantedSharing(theiaBrowser, tabId) { sendWebTabPush(theiaBrowser, { kind: "sharingChanged", tabId, camera: true, microphone: false, screen: false }); }') },
            expect: '2 sharingChanged pushes',
        },
        {
            name: 'indicator honours a frame flag',
            sources: { ...clean, [WEB_TAB]: `${clean[WEB_TAB]}\nexport function plantedFlag(w: WebTabWidget): void { window.addEventListener('message', e => { w.sharing = e.data.sharing; }); }\n` },
            expect: 'indicator driven from a frame flag',
        },
        {
            // Post-review fix reverted: the duplicate check is keyed on the overlay only.
            name: 'sharing dedupe ignores the destination',
            sources: { ...clean, [API]: clean[API].replace('last.key === key && last.windowGlobal === windowGlobal', 'last.key === key') },
            expect: "duplicate check ignores the frontend WindowGlobal",
        },
        {
            // Post-review fix reverted: a re-registered overlay is not sent its state again.
            name: 'no sharing re-push on re-registration',
            sources: { ...clean, [API]: clean[API].replace(/\n\s*resendWebTabSharing\(tabId\);\n(\s*return "already-open";)/, '\n$1') },
            expect: "already-open branch does not re-push",
        },
        // Plan 04 (D-08, D-12): the bar host, the bar push and the bar answers.
        {
            name: 'bar inside blocking layer',
            sources: { ...clean, [WEB_TAB]: clean[WEB_TAB].replace(/(const BLOCKING_LAYER_SELECTOR = '[^']*)'/, "$1, .pb-web-tab-bars'") },
            expect: 'bar inside blocking layer',
        },
        {
            name: 'bar covers page content',
            sources: { ...clean, [WEB_TAB]: clean[WEB_TAB].replace('y: Math.round(r.top + bars),', 'y: Math.round(r.top),') },
            expect: 'bar covers page content',
        },
        {
            name: 'allow-loads-frame-url',
            sources: { ...clean, [API]: clean[API].replace('openBlockedPopup(record.browser, popup.spec, popup.principal)', 'openBlockedPopup(record.browser, record.data.url, popup.principal)') },
            expect: 'Allow opened a frame-supplied URL',
        },
        {
            name: 'bar answer not checked against the sender',
            sources: { ...clean, [API]: clean[API].replace(' || record.theiaBrowser !== sender', '') },
            expect: 'not checked against the sending frame',
        },
        {
            name: 'second notificationBar push',
            sources: { ...clean, [API]: `${clean[API]}\nfunction plantedBar(b) { sendWebTabPush(b, { kind: "notificationBar", token: "t", tabId: "x", barKind: "blocked-popup", displayFields: {}, visible: true }); }\n` },
            expect: '2 notificationBar pushes',
        },
        {
            name: 'bar push carries a url',
            sources: { ...clean, [API]: clean[API].replace('displayFields: visible ? record.displayFields : {}, visible });', 'displayFields: visible ? record.displayFields : {}, url: record.stored, visible });') },
            expect: 'the notificationBar push carries url',
        },
        {
            name: 'adoption call outside the thin call site',
            sources: { ...clean, [API]: `${clean[API]}\nfunction plantedAdopt(b, u) { return PowerBrowserAPI.openAdoptedWebTab(b, u); }\n` },
            expect: 'calls openAdoptedWebTab 2 times',
        },
        {
            name: 'superseded adoption vocabulary',
            sources: { ...clean, [WEB_TAB]: `${clean[WEB_TAB]}\nexport const plantedAdopt = (c: WebTabChannel) => c.onPush('adoptTab', () => undefined);\n` },
            expect: 'names adoptTab',
        },
        {
            name: 'unaccepted sender value',
            sources: { ...clean, [WEB_TAB]: clean[WEB_TAB].replace("'hung-script': ['stop-script', 'wait-longer'],", "'hung-script': ['stop-script', 'wait-longer', 'planted-action'],") },
            expect: 'web-tab.ts sends bar actions chrome does not accept: hung-script:planted-action',
        },
        {
            name: 'accepted value with no sender',
            sources: { ...clean, [API]: clean[API].replace('"hung-script": ["stop-script", "wait-longer"]', '"hung-script": ["stop-script", "wait-longer", "planted-action"]') },
            expect: 'chrome accepts bar actions web-tab.ts never sends (stale): hung-script:planted-action',
        },
        {
            name: 'stock notification box call',
            sources: { ...clean, [API]: inBars('function plantedBox(win) { return win.gNotificationBox.appendNotification("process-hang", {}, []); }') },
            expect: 'the stock notification box throws in the shell',
        },
        // Plan 04 (D-07): the password template, the login callback and the no-credential scans.
        {
            name: 'theia-credential-sync',
            sources: { ...clean, [API]: inSection('function plantedSync(theiaBrowser, tabId, login) { sendWebTabPush(theiaBrowser, { kind: "doorhanger", tabId, username: login.username }); }') },
            expect: 'credential field in a Theia push',
        },
        {
            name: 'theia-to-chrome credential message',
            sources: { ...clean, [WEB_TAB]: `${clean[WEB_TAB]}\nexport const plantedPw = (c: WebTabChannel) => c.send({ kind: 'webTabStop', tabId: '', password: 'x' } as never);\n` },
            expect: 'credential field in a Theia message',
        },
        {
            name: 'hidden-input-variant',
            sources: { ...clean, [XHTML]: clean[XHTML].replace(/<html:moz-input-password id="password-notification-password"[^>]*\/>/, '<html:input type="hidden" id="password-notification-password"/>') },
            expect: 'hidden credential input present',
        },
        {
            name: 'credential-in-log',
            sources: { ...clean, [API]: inSection('function plantedLog(login) { PowerBrowserAPI.log("error", `[pw] saved ${login.username}`); }') },
            expect: 'credential value in log',
        },
        {
            name: 'template-id-renamed',
            sources: { ...clean, [XHTML]: clean[XHTML].replace('id="password-notification-username"', 'id="powerbrowser-username"') },
            expect: 'missing ids password-notification-username',
        },
        {
            name: 'login-callback-missing',
            sources: { ...clean, [API]: clean[API].replace(/^.*setElementCreationCallback\("login-doorhanger-username-field".*\n/m, '') },
            expect: 'login-doorhanger-username-field callback missing',
        },
        {
            name: 'autocomplete popup removed',
            sources: { ...clean, [XHTML]: clean[XHTML].replace(/<xul:panel is="autocomplete-richlistbox-popup"[\s\S]*?\/>/, '') },
            expect: `has no #${AUTOCOMPLETE_ID}`,
        },
        {
            name: 'second reader of a credential field',
            sources: { ...clean, [API]: inSection('function plantedRead(doc) { return doc.getElementById("password-notification-password").value; }') },
            expect: 'a second writer or reader beside the stock prompter',
        },
        {
            name: 'getTabDialogBox added under the stock verdict',
            sources: { ...clean, [SHELL]: clean[SHELL].replace('window.gBrowser = {', 'window.gBrowser = {\n      getTabDialogBox(browser) { return null; },') },
            expect: 'dialog outcome drift: the verdict says stock-keeps-ide-usable',
        },
        {
            name: 'relay verdict without the member',
            sources: { ...clean, [VERDICT]: verdictWith({ outcome: 'stock-blocks-ide', relayFeasible: true }) },
            expect: 'has no getTabDialogBox member',
        },
        {
            name: 'stock blocks the IDE and no relay is feasible',
            sources: { ...clean, [VERDICT]: verdictWith({ outcome: 'stock-blocks-ide', relayFeasible: false }) },
            expect: 'PROMPT-03 cannot be met as written',
        },
        {
            name: 'provisional verdict claiming evidence',
            sources: { ...clean, [VERDICT]: verdictWith({ provisional: true, evidence: { screenshots: ['shot.png'], pushLog: null, ideEditOk: null } }) },
            expect: 'the provisional verdict claims live evidence',
        },
        {
            name: 'live verdict without evidence',
            sources: { ...clean, [VERDICT]: verdictWith({ provisional: false }) },
            expect: 'the live verdict lacks live evidence',
        },
        {
            name: 'live verdict naming missing evidence',
            sources: { ...clean, [VERDICT]: verdictWith({ provisional: false, evidence: { screenshots: ['.planning/probes/prompt-probe/planted.png'], pushLog: '.planning/probes/prompt-probe/planted.json', ideEditOk: true }, date: '2026-10-31', build: { binaryMtime: 'x' } }) },
            expect: 'names evidence that is not on disk',
        },
        {
            name: 'verdict outcome outside the enum',
            sources: { ...clean, [VERDICT]: verdictWith({ outcome: 'relay' }) },
            expect: "'relay' is not one of",
        },
        {
            name: 'verdict file missing',
            sources: { ...clean, [VERDICT]: null },
            expect: 'probe 1 has no verdict',
        },
    ];
    let failed = 0;
    for (const testCase of cases) {
        const landed = testCase.facadeNames || Object.keys(testCase.sources).some(file => testCase.sources[file] !== clean[file]);
        if (!landed) {
            console.error(`${NAME} --self-test: FAIL -- '${testCase.name}' did not modify any source; the anchor it edits has drifted`);
            failed++;
            continue;
        }
        const got = checkPrompts(testCase.sources, testCase.facadeNames ?? facadeNames);
        if (!got.some(f => f.includes(testCase.expect))) {
            console.error(`${NAME} --self-test: FAIL -- '${testCase.name}' did not go red naming '${testCase.expect}'; got: ${got.join(' | ') || '(green)'}`);
            failed++;
        } else {
            console.log(`  ok  ${testCase.name} -> red, naming '${testCase.expect}'`);
        }
    }
    if (failed) {
        return 1;
    }
    console.log(`${NAME} --self-test: PASS -- the unmodified fixture is green and ${cases.length} planted faults all went red`);
    return 0;
}

function main() {
    if (process.argv.includes('--help')) {
        console.log('usage: verify-permission-prompts.mjs [--self-test]\nDerives the permission-prompt contract (panel, one construction site, own principal, forbidden kind family, facade audit, no request kind, display-only subscriber) from the tree and compares it.');
        return 0;
    }
    if (process.argv.includes('--self-test')) {
        return selfTest();
    }
    const sources = readSources();
    const failures = checkPrompts(sources);
    if (failures.length) {
        console.error(`${NAME}: FAIL -- the permission-prompt contract does not hold:`);
        failures.forEach(f => console.error(`  ${f}`));
        return 1;
    }
    const dialog = checkDialogOutcome(sources);
    console.log(`${NAME}: dialog outcome ${dialog.outcome}${dialog.provisional ? ' (PROVISIONAL: the owner default pending live probe 1; the live dialog-probe run overwrites it with evidence)' : ' (live probe-1 verdict)'}; getTabDialogBox ${dialog.outcome === 'stock-keeps-ide-usable' ? 'absent, the stock window-modal fallback' : 'present, the audited relay member'}`);
    console.log(`${NAME}: PASS -- #${PANEL_ID} matches upstream, one PopupNotifications construction inside ${INSTALLER}, own principal only, no allow/grant/permit/doorhanger/prompt kind, the facade is audited, no request kind, the doorhanger subscriber is display-only, #${TEMPLATE_ID} matches upstream element by element, the ${PREVIEW_ELEMENT} callback is registered, the stock PermissionUI write is the only prompt-path permission writer, no remember field exists, the sharing indicator follows chrome-observed webrtcUI state only, #${PASSWORD_TEMPLATE_ID} and #${AUTOCOMPLETE_ID} match upstream, the ${LOGIN_ELEMENT} callback is registered, the stock prompter alone owns the credential fields, no credential reaches a push, a Theia message or a log, the notification bars sit outside the blocking layer and shrink the page rect, each bar answer resolves a chrome-held record of the sender's own tab, the bar action enum matches between sender and arm, openAdoptedWebTab has one call site, and no stock notification box is reached`);
    return 0;
}

process.exit(main());
