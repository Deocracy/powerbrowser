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
const FRONTEND_DIRS = ['theia/extensions/tab-uris/src/browser', 'theia/extensions/chrome-bar/src/browser'];

const MODULE_FILE = 'PopupNotifications.sys.mjs';
const SECTION_MARKER = '// Phase 37: permission prompts.';
const INSTALLER = 'installPermissionPromptFurniture';
const PANEL_ID = 'notification-popup';
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
    const files = new Set([API, SHELL, XHTML, WEB_TAB, UPSTREAM_PANEL, UPSTREAM_MOZBUILD]);
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
    return failures;
}

/**
 * shortcut: until plan 37-01 Task 2 lands the furniture, the fixture adds a minimal correct copy of each absent
 * piece in memory (the panel from upstream's own attributes); Task 2 deletes this, so the control is the real tree.
 */
function seedFixture(sources) {
    const out = { ...sources };
    const url = moduleUrl(out[UPSTREAM_MOZBUILD]);
    if (!out[XHTML].includes(`id="${PANEL_ID}"`)) {
        const attrs = /<panel\s+id="notification-popup"([^>]*?)\/?>/.exec(out[UPSTREAM_PANEL])[1].replace(/\s+/g, ' ').trim();
        out[XHTML] = out[XHTML].replace('</body>', `<xul:panel id="${PANEL_ID}" ${attrs}/><div id="powerbrowser-notification-anchor"/></body>`);
    }
    if (!out[API].includes(SECTION_MARKER)) {
        out[API] += `\n${SECTION_MARKER}\nconst PROMPT_ANCHOR_ID = "powerbrowser-notification-anchor";\n` +
            `export function ${INSTALLER}(window) {\n  const { PopupNotifications } = ChromeUtils.importESModule("${url}");\n` +
            '  const promptTabbrowser = { documentGlobal: window };\n  window.PopupNotifications = new PopupNotifications(promptTabbrowser, null, null);\n' +
            '  return window.document.contentPrincipal;\n}\n';
    }
    if (!out[SHELL].includes(`${INSTALLER}(`)) {
        out[SHELL] += `\n${INSTALLER}(window);\n`;
    }
    if (!/onPush\(\s*'doorhanger'/.test(out[WEB_TAB])) {
        out[WEB_TAB] += "\nexport const seeded = (c: WebTabChannel) => c.onPush('doorhanger', detail => { void detail; });\n";
    }
    return out;
}

/** Proves every rule discriminates on in-memory copies of the real sources, after the same-session green control. */
function selfTest() {
    const clean = seedFixture(readSources());
    const facadeNames = FACADES.length ? FACADES.map(f => f.name) : ['promptTabbrowser'];
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
    console.log(`${NAME}: PASS -- #${PANEL_ID} matches upstream, one PopupNotifications construction inside ${INSTALLER}, own principal only, no allow/grant/permit/doorhanger/prompt kind, the facade is audited, no request kind, and the doorhanger subscriber is display-only`);
    return 0;
}

process.exit(main());
