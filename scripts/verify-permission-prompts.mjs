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
 * Rules (j) and (k) are the furniture-gate rows for this plan; at the Phase 35
 * merge they move to verify-shell-furniture.mjs with rule (a).
 *
 * Every expectation is derived from the tree at check time. --self-test runs
 * the unmodified fixture green first (the same-session positive control), then
 * plants one fault per rule in memory and requires each to go red naming the
 * drift. Text reads only: --quick.
 */

import { readFileSync, readdirSync } from 'node:fs';
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
const GATE = 'scripts/verify-permission-prompts.mjs';
const FRONTEND_DIRS = ['theia/extensions/tab-uris/src/browser', 'theia/extensions/chrome-bar/src/browser'];
const SHELL_DIR = 'powerbrowser/shell';
/** Every grant or revoke call of SitePermissions and the permission manager. */
const PERMISSION_WRITE = /\b(?:setForPrincipal|removeFromPrincipal|addFromPrincipal)\s*\(|\bperms\.(?:add|remove)\w*\s*\(/g;

const MODULE_FILE = 'PopupNotifications.sys.mjs';
const SECTION_MARKER = '// Phase 37: permission prompts.';
const INSTALLER = 'installPermissionPromptFurniture';
const PANEL_ID = 'notification-popup';
const TEMPLATE_ID = 'webRTC-shareDevices-notification';
const PREVIEW_ELEMENT = 'webrtc-preview';
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

/** The `<popupnotification id="TEMPLATE_ID">` element's text up to its close tag (either prefix), comments out; '' when absent. */
function templateBlock(text) {
    const open = new RegExp(`<((?:xul:)?popupnotification)\\s[^>]*?\\bid="${TEMPLATE_ID}"`).exec(text);
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
    const files = new Set([API, SHELL, XHTML, WEB_TAB, UPSTREAM_PANEL, UPSTREAM_MOZBUILD, UPSTREAM_BROWSER_JS, GATE]);
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
    return Object.fromEntries([...files].map(file => [file, readFileSync(join(REPO_ROOT, file), 'utf8')]));
}

/**
 * @param raw sources keyed by repo path
 * @param facadeNames the facade names verify-shell-gbrowser-standin.mjs audits
 * @returns {string[]} failures; empty means the contract holds
 */
function checkPrompts(raw, facadeNames = FACADES.map(f => f.name)) {
    const failures = [];
    const api = stripComments(raw[API]);
    const markup = raw[XHTML].replace(/<!--[\s\S]*?-->/g, '');
    const sectionAt = raw[API].indexOf(SECTION_MARKER);
    const section = sectionAt === -1 ? '' : stripComments(raw[API].slice(sectionAt));
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
    if (/\[\s*['"`]webRTC-[\w-]+['"`]\s*,/.test(ownSource)) {
        failures.push(`template: ${GATE} holds a hand-kept array of template ids -- the expectation must be derived from ${UPSTREAM_PANEL} (CLAUDE.md verification rule 2)`);
    }

    // (k) The webrtc-preview creation callback, on the module URL upstream's browser.js imports.
    const previewUrl = new RegExp(`setElementCreationCallback\\(\\s*"${PREVIEW_ELEMENT}"[\\s\\S]*?importESModule\\(\\s*"([^"]+)"`).exec(raw[UPSTREAM_BROWSER_JS])?.[1];
    if (!previewUrl) {
        failures.push(`preview-callback: ${UPSTREAM_BROWSER_JS} registers no ${PREVIEW_ELEMENT} creation callback (broken instrument)`);
    } else if (!new RegExp(`setElementCreationCallback\\(\\s*"${PREVIEW_ELEMENT}"[^;]*importESModule\\(\\s*"${previewUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`).test(installer)) {
        failures.push(`preview-callback: ${INSTALLER} registers no ${PREVIEW_ELEMENT} creation callback importing ${previewUrl} -- WebRTCParent's lazy preview insert would throw`);
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

    const writes = (api.match(/\bactiveTabByFrame\.set\(/g) ?? []).length;
    const setter = functionBody(api, 'setActiveTabOfFrame');
    if (writes !== 1 || !setter.includes('activeTabByFrame.set(')) {
        failures.push(`visible-tab: activeTabByFrame is written ${writes} times, or outside setActiveTabOfFrame -- a focus move would not refresh the waiting prompts`);
    } else if (!setter.includes('anchorVisibilityChange(')) {
        failures.push(`visible-tab: setActiveTabOfFrame does not call the stock anchorVisibilityChange -- a waiting prompt would not hide or show with focus`);
    }
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
    const sectionAt = clean[API].indexOf(SECTION_MARKER);
    const inSection = text => clean[API].slice(0, sectionAt) + clean[API].slice(sectionAt).replace(/\n$/, `\n${text}\n`);
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
    const failures = checkPrompts(readSources());
    if (failures.length) {
        console.error(`${NAME}: FAIL -- the permission-prompt contract does not hold:`);
        failures.forEach(f => console.error(`  ${f}`));
        return 1;
    }
    console.log(`${NAME}: PASS -- #${PANEL_ID} matches upstream, one PopupNotifications construction inside ${INSTALLER}, own principal only, no allow/grant/permit/doorhanger/prompt kind, the facade is audited, no request kind, the doorhanger subscriber is display-only, #${TEMPLATE_ID} matches upstream element by element, the ${PREVIEW_ELEMENT} callback is registered, the stock PermissionUI write is the only prompt-path permission writer, no remember field exists, and the sharing indicator follows chrome-observed webrtcUI state only`);
    return 0;
}

process.exit(main());
