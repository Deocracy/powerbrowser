#!/usr/bin/env node
// scripts/verify-update-copy.mjs
//
// The update-copy shape gate (Phase 46, UPD-32; review WR-05, WR-06, CR-06).
// Every user-readable update string lives once in the @powerbrowser/branding
// contribution (theia/extensions/branding/src/browser/
// powerbrowser-update-copy.ts). This row derives all of them at check time:
//
//   1. Classification by key suffix (Title, Body, Status, Label). An
//      unclassified key is red.
//   2. Shape: every Title, Body and Status names "PowerBrowser" and carries
//      no ALL-CAPS token or dotted key (no internal identifier).
//   3. Next step: a Body is wired in the client to one of the copy's own
//      Label or Title keys in the same method that renders it. A Status
//      either is a progress message (ends in an ellipsis) or its last sentence
//      names a Label or a command Title as the next step.
//   4. Client literals: the client's code (comments and console calls
//      stripped) carries no string literal that contains whitespace or equals
//      a copy value. User-facing text reaches the client only through the
//      copy module.
//   5. Single site: the client imports the copy module, and no 24-character
//      slice of a Body or Title appears literally in the client.
//   6. Once-per-session (UPD-22, CR-06): the real update client is
//      transpiled from the tree and driven through its push path, stubbed only
//      at the Theia import boundary. No constant stands in for the transition.
//   7. macOS cannot-update variant (UPD-21, Phase 55): the body the client
//      renders on a Mac (read from its `mac ?` branch) must tell the user to
//      move PowerBrowser to the folder the DMG's drag-to-install symlink points
//      at, read from upstream/python/mozbuild/mozpack/dmg.py.
//   8. macOS signing status on the download page (website-staging/
//      download.html): the claims its macOS line makes (ad-hoc or Developer ID
//      signed, notarized or not) must equal, as a set, the posture the release
//      workflow implements: a Developer ID only when a macos-sign step passes a
//      p12 file, notarized only when a notarization step exists. An overclaim
//      and an underclaim are both red.
//
// No expectation list is hand-kept: the key set, the affordance set and the
// classification are all read from the contribution at check time.
//
// Usage:
//   node scripts/verify-update-copy.mjs
//   node scripts/verify-update-copy.mjs --self-test
//
// Exit 0 pass, 1 fail. --self-test plants each fault in memory and requires
// each to go red naming its drift; a check that can only go green is not a
// check.

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';

const SELF = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(SELF), '..');
const NAME = 'update-copy';
const SELF_REL = 'scripts/verify-update-copy.mjs';

const args = process.argv.slice(2);
for (const a of args) {
    if (a !== '--self-test') {
        console.error(`${NAME}: FAIL -- unknown argument '${a}'`);
        console.error(`  Next step: run: node ${SELF_REL}, or add --self-test to prove the copy contract discriminates.`);
        process.exit(2);
    }
}

const COPY_REL = 'theia/extensions/branding/src/browser/powerbrowser-update-copy.ts';
const CLIENT_REL = 'theia/extensions/tab-uris/src/browser/update-client.ts';
const THEIA_PKG_REL = 'theia/package.json';
const DMG_PY_REL = 'upstream/python/mozbuild/mozpack/dmg.py';
const DOWNLOAD_REL = 'website-staging/download.html';
const RELEASE_YML_REL = '.github/workflows/release.yml';

// An ALL-CAPS underscored token, four characters or more.
const ALL_CAPS_TOKEN = /\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/g;
// A dotted key of three or more segments.
const DOTTED_KEY = /\b[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*){2,}\b/g;
const CLIENT_NAME = 'POWERBROWSER_UPDATE_COPY';

function readText(root, rel) {
    try {
        return readFileSync(join(root, rel), 'utf8');
    } catch {
        return null;
    }
}

/** The exported const's NAME = "..." string values, in file order. */
export function deriveStrings(src) {
    const m = src.match(/export\s+const\s+POWERBROWSER_UPDATE_COPY\s*=\s*Object\.freeze\(\{([\s\S]*?)\}\);/);
    if (!m) return null;
    const out = [];
    for (const x of m[1].matchAll(/([A-Za-z_$][\w$]*)\s*:\s*('(?:[^'\\\n]|\\.)*'|"(?:[^"\\]|\\.)*")/g)) {
        let value;
        try {
            value = JSON.parse(x[2].startsWith("'") ? `"${x[2].slice(1, -1).replace(/"/g, '\\"')}"` : x[2]);
        } catch {
            return null;
        }
        out.push({ key: x[1], value });
    }
    return out;
}

/** The suffix classification (Title | Body | Status | Label), or null when unclassified. */
export function classify(key) {
    const m = key.match(/(Title|Body|Status|Label)$/);
    return m ? m[1] : null;
}

/** The client's code with comments and console statements removed. */
export function clientCode(src) {
    const noBlock = src.replace(/\/\*[\s\S]*?\*\//g, '');
    const noLine = noBlock.split('\n').map(line => line.replace(/\/\/.*$/, '')).join('\n');
    return noLine.replace(/console\.\w+\([^;]*\);/g, '');
}

/** Method-sized blocks of the client's class body (four-space indented declarations). */
export function methodBlocks(code) {
    const starts = [...code.matchAll(/^ {4}(?:protected |public |private )?(?:async )?[A-Za-z_]\w*\s*\(/gm)].map(m => m.index);
    return starts.map((start, i) => code.slice(start, i + 1 < starts.length ? starts[i + 1] : code.length));
}

/** Every string literal in the client code: quoted or backticked. */
export function literalsIn(code) {
    const out = [];
    for (const m of code.matchAll(/'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\\n]|\\.)*)`/g)) {
        // A template's ${...} expressions are code, not text: only its static parts count.
        out.push(m[3] !== undefined ? m[3].replace(/\$\{[^}]*\}/g, '') : (m[1] ?? m[2] ?? ''));
    }
    return out;
}

function lastSentence(text) {
    const parts = text.split(/(?<=[.!?])\s+/);
    return parts[parts.length - 1] ?? text;
}

/** Transpiles one TypeScript source to CommonJS and evaluates it against `requireFn`. */
function loadTsModule(ts, src, requireFn) {
    const out = ts.transpileModule(src, {
        compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2017,
            experimentalDecorators: true,
            esModuleInterop: true,
        },
    }).outputText;
    const mod = { exports: {} };
    runInNewContext(out, { require: requireFn, module: mod, exports: mod.exports }, { filename: 'transpiled-tree-source.js' });
    return mod.exports;
}

const flush = () => new Promise(resolveFlush => setImmediate(resolveFlush));

/**
 * Behavioural once-per-session check (UPD-22, review CR-06). Loads the REAL
 * update client from the tree and drives it through its push path: a failure
 * prompts once, a Check-again click starts a check (the warn stub answers the
 * click), a second failure in the same session does not prompt, a completed
 * check clears the flag, and the next failure prompts again. The prompt
 * counts must be 1, 1, 2. Returns failures; empty when the rule holds.
 */
export async function onceSessionFailures(read) {
    let ts;
    try {
        ts = createRequire(join(REPO_ROOT, THEIA_PKG_REL))('typescript');
    } catch {
        return [`theia/node_modules/typescript is not installed, so the once-per-session behaviour is unproven. Next step: run yarn install in theia/ (nix develop .#theia).`];
    }
    const copySrc = read(COPY_REL);
    const clientSrc = read(CLIENT_REL);
    if (copySrc === null || clientSrc === null) {
        return [`${COPY_REL} or ${CLIENT_REL} could not be read, so the once-per-session behaviour is unproven. Next step: restore them.`];
    }
    const copy = loadTsModule(ts, copySrc, () => ({}));
    const client = loadTsModule(ts, clientSrc, (id) => {
        switch (id) {
            case 'inversify':
            case '@theia/core/shared/inversify':
                return { inject: () => () => {}, injectable: () => () => {}, postConstruct: () => () => {} };
            case '@theia/core/lib/common':
                return { MessageService: class {}, CommandRegistry: class {}, CommandService: class {} };
            case './browser-window-command':
                return { OPEN_BROWSER_WINDOW_COMMAND_ID: 'powerbrowser.open-browser-window' };
            case '@theia/core/lib/browser':
                return { FrontendApplication: class {}, StatusBar: class {}, StatusBarAlignment: { LEFT: 0, RIGHT: 1 } };
            case './web-tab':
                return { WEB_TAB_STATE_EVENT: 'PowerBrowserWebTabState' };
            case '@powerbrowser/branding/src/browser/powerbrowser-update-copy':
                return copy;
            default:
                throw new Error(`unexpected import '${id}' in the update client`);
        }
    });

    const instance = new client.UpdateClientContribution();
    let prompts = 0;
    instance.messages = {
        info: async () => undefined,
        warn: async (_body, action) => {
            prompts += 1;
            return action;
        },
    };
    instance.statusBar = { setElement: async () => undefined };
    instance.request = async () => ({ ok: true, accepted: true });
    const push = async (status) => {
        instance.onAppUpdatePush({ detail: { kind: 'appUpdate', status } });
        await flush();
        await flush();
    };

    await push('error');
    const first = prompts;
    await push('error');
    const second = prompts;
    await push('available');
    await push('error');
    const third = prompts;
    if (first !== 1 || second !== 1 || third !== 2) {
        return [`once-per-session: Check-again prompts were ${first}, ${second}, ${third} after failure, failure, completed check + failure; want 1, 1, 2. Next step: clear checkAgainShown only on an observed completed check in onAppUpdatePush, never on request acceptance (CR-06).`];
    }
    return [];
}

export function runChecks(root, overrides = {}) {
    const failures = [];
    const read = overrides.read ?? ((rel) => readText(root, rel));

    const copySrc = read(COPY_REL);
    if (copySrc === null) {
        failures.push(`${COPY_REL} could not be read, so the update copy contract is unproven. Next step: restore it.`);
        return { failures, strings: [] };
    }
    const strings = deriveStrings(copySrc);
    if (strings === null || strings.length === 0) {
        failures.push(`${COPY_REL} carries no POWERBROWSER_UPDATE_COPY strings this check can read, so the contract is unproven. Next step: check the instrument (${SELF_REL}: its derivation) against the contribution.`);
        return { failures, strings: [] };
    }

    const kindOf = new Map(strings.map(s => [s.key, classify(s.key)]));
    const byKind = (kind) => strings.filter(s => kindOf.get(s.key) === kind);
    for (const s of strings) {
        if (kindOf.get(s.key) === null) {
            failures.push(`${COPY_REL} string '${s.key}' has no classification suffix (Title, Body, Status or Label), so the row cannot apply its rules to it. Next step: rename the key with its kind suffix.`);
        }
    }
    const labelKeys = byKind('Label').map(s => s.key);
    const titleKeys = byKind('Title').map(s => s.key);
    const bodies = byKind('Body');
    const statuses = byKind('Status');
    if (labelKeys.length === 0 || bodies.length === 0) {
        failures.push(`${COPY_REL} has no Label or no Body string, so the affordance contract is unproven. Next step: restore the button labels and the notification bodies.`);
    }

    // 2. Shape: names the product and carries no internal identifier.
    for (const s of strings) {
        const kind = kindOf.get(s.key);
        if (kind !== 'Label' && !s.value.includes('PowerBrowser')) {
            failures.push(`${COPY_REL} string '${s.key}' does not name the product ("PowerBrowser"): ${JSON.stringify(s.value)}. Next step: name PowerBrowser in the string.`);
        }
        for (const hit of s.value.match(ALL_CAPS_TOKEN) ?? []) {
            failures.push(`${COPY_REL} string '${s.key}' leaks the internal identifier "${hit}" (all-caps underscored token) into user-facing copy -- it belongs in a diagnostics field row. Next step: reword without the token.`);
        }
        for (const hit of s.value.match(DOTTED_KEY) ?? []) {
            failures.push(`${COPY_REL} string '${s.key}' leaks the internal identifier "${hit}" (dotted multi-segment key) into user-facing copy -- it belongs in a diagnostics field row. Next step: reword without the key.`);
        }
    }

    // The affordances a sentence can name: the button labels, and the command
    // titles without their "PowerBrowser: " product prefix.
    const affordanceValues = [
        ...byKind('Label').map(s => s.value),
        ...byKind('Title').map(s => s.value.replace(/^PowerBrowser:\s*/, '')),
    ];
    const affordanceKeys = [...labelKeys, ...titleKeys];

    const clientSrc = read(CLIENT_REL);
    if (clientSrc === null) {
        failures.push(`${CLIENT_REL} could not be read, so the single-site rule is unproven. Next step: restore it.`);
        return { failures, strings };
    }
    const code = clientCode(clientSrc);
    const blocks = methodBlocks(code);

    // 3. Next step: every Body is rendered by a method that wires one of the
    // copy's own affordances; every progress-free Status ends with one.
    for (const body of bodies) {
        const users = blocks.filter(b => b.includes(`${CLIENT_NAME}.${body.key}`));
        if (users.length === 0) {
            failures.push(`${CLIENT_REL} never renders ${CLIENT_NAME}.${body.key} -- the notification body is not on screen. Next step: render it through the messages service.`);
            continue;
        }
        const wired = users.some(b => affordanceKeys.some(k => b.includes(`${CLIENT_NAME}.${k}`)));
        if (!wired) {
            failures.push(`${CLIENT_REL} renders '${body.key}' without any of its affordances (${affordanceKeys.join(', ')}) in the same method; every update body must end with a next step that is a real affordance. Next step: pass a Label from ${CLIENT_NAME} beside this body.`);
        }
    }
    for (const status of statuses) {
        if (status.value.includes('…')) continue;
        const sentence = lastSentence(status.value);
        if (!affordanceValues.some(a => a !== '' && sentence.includes(a))) {
            failures.push(`${COPY_REL} status '${status.key}' ends without a next step (no button label or command title in its last sentence): ${JSON.stringify(status.value)}. Next step: end it with the affordance the user takes.`);
        }
    }

    // Every label is on screen somewhere in the client.
    for (const key of labelKeys) {
        if (!code.includes(`${CLIENT_NAME}.${key}`)) {
            failures.push(`${CLIENT_REL} never uses ${CLIENT_NAME}.${key} -- a button label with no client path. Next step: wire it or remove it.`);
        }
    }

    // 4. No user-facing literal in the client: whitespace-bearing literals and
    // copy values are red wherever they appear in the client code.
    const copyValues = new Set(strings.map(s => s.value));
    for (const literal of literalsIn(code)) {
        if (/\s/.test(literal) || copyValues.has(literal)) {
            failures.push(`${CLIENT_REL} carries the literal ${JSON.stringify(literal)} -- user-facing text lives once in the copy module. Next step: replace it with a ${CLIENT_NAME} key.`);
        }
    }

    // 5. Single site: the client imports the copy module; no 24-char slice of
    // a body or title appears literally in the client.
    if (!clientSrc.includes('powerbrowser-update-copy')) {
        failures.push(`${CLIENT_REL} does not import the update copy module -- a literal sentence in the client would ship beside the contribution. Next step: import ${CLIENT_NAME} and use it.`);
    }
    for (const s of [...bodies, ...byKind('Title')]) {
        const needle = s.value.slice(0, 24);
        if (needle.length >= 24 && clientSrc.includes(needle)) {
            failures.push(`${CLIENT_REL} carries the literal sentence slice ${JSON.stringify(needle)}... -- update sentences live once in the branding contribution. Next step: replace it with the ${CLIENT_NAME} import.`);
        }
    }

    // 7. The macOS variant names the folder the DMG installs into.
    const macKey = /\bmac\s*\?\s*POWERBROWSER_UPDATE_COPY\.(\w+)/.exec(code)?.[1] ?? null;
    const target = /"symlink",\s*"\/[^"]*",\s*"([^"]+)"/.exec(read(DMG_PY_REL) ?? '')?.[1] ?? null;
    if (macKey === null || target === null) {
        failures.push(`the macOS cannot-update variant cannot be derived (${macKey === null ? `${CLIENT_REL} has no mac ? ${CLIENT_NAME}.<key> branch` : `${DMG_PY_REL} names no create_app_symlink target`}). Next step: restore it, or check this row's derivation.`);
    } else {
        const folder = target.split('/').filter(Boolean).pop();
        const macBody = strings.find(s => s.key === macKey);
        if (!macBody) failures.push(`${CLIENT_REL} renders ${CLIENT_NAME}.${macKey} on a Mac, but ${COPY_REL} has no such string. Next step: add it.`);
        else if (!macBody.value.includes(`${folder} folder`)) failures.push(`${COPY_REL} string '${macKey}' (the macOS cannot-update text) does not tell the user to move PowerBrowser to the ${folder} folder, where the DMG installs it: ${JSON.stringify(macBody.value)}. Next step: name the ${folder} folder in the next step.`);
    }

    // 8. The download page states the macOS signing status the release workflow implements.
    const page = read(DOWNLOAD_REL);
    const macLine = page === null ? null : (/<li><strong>macOS:<\/strong>([^<]*)<\/li>/.exec(page)?.[1] ?? null);
    if (macLine === null) {
        failures.push(`${DOWNLOAD_REL} carries no "macOS:" signing-status line, so the macOS signing claim is unproven. Next step: restore the Signing status list.`);
    } else {
        const wf = read(RELEASE_YML_REL) ?? '';
        const posture = new Set([
            /macos-sign[^\n]*--rcodesign-p12-file/.test(wf) ? 'Developer ID signed' : 'ad-hoc signed',
            /\b(notary-submit|notarytool)\b/.test(wf) ? 'notarized' : 'not notarized',
        ]);
        const claims = new Set();
        if (/\bad-hoc signed\b/.test(macLine)) claims.add('ad-hoc signed');
        if (/\bDeveloper ID\b/.test(macLine)) claims.add('Developer ID signed');
        if (/\bnot notarized\b/.test(macLine)) claims.add('not notarized');
        if (/(?<!not )\bnotarized\b/.test(macLine)) claims.add('notarized');
        const over = [...claims].filter(c => !posture.has(c));
        const under = [...posture].filter(c => !claims.has(c));
        if (over.length || under.length) {
            failures.push(`${DOWNLOAD_REL} macOS signing status ${JSON.stringify(macLine.trim())} claims [${[...claims].join(', ')}] but ${RELEASE_YML_REL} implements [${[...posture].join(', ')}]${over.length ? `; overclaim: ${over.join(', ')}` : ''}${under.length ? `; unstated: ${under.join(', ')}` : ''}. Next step: state the posture the release workflow implements.`);
        }
    }

    return { failures, strings };
}

async function main() {
    if (args.includes('--self-test')) return selfTest();
    const { failures, strings } = runChecks(REPO_ROOT);
    failures.push(...await onceSessionFailures((rel) => readText(REPO_ROOT, rel)));
    console.log(`${NAME}: ${strings.length} update string(s) derived from the branding contribution: ${strings.map(s => s.key).join(', ')}`);
    if (failures.length > 0) {
        console.error(`${NAME}: FAIL -- ${failures.length} problem(s) with the update copy contract.`);
        failures.forEach(f => console.error(`  ${f}`));
        return 1;
    }
    console.log(`${NAME}: PASS -- every update string names PowerBrowser or is a label, carries no internal identifier, and ends with an on-screen affordance; the client renders only copy-module text; the once-per-session rule holds in the real client`);
    return 0;
}

async function selfTest() {
    const cache = new Map();
    const realRead = (rel) => {
        if (!cache.has(rel)) cache.set(rel, readText(REPO_ROOT, rel));
        return cache.get(rel);
    };
    const baseline = runChecks(REPO_ROOT, { read: realRead });
    const baselineOnce = await onceSessionFailures(realRead);
    if (baseline.failures.length > 0 || baseline.strings.length === 0 || baselineOnce.length > 0) {
        console.error(`${NAME}: --self-test FAIL -- the unmodified tree is already red, so the planted-fault results below would mean nothing:`);
        [...baseline.failures, ...baselineOnce].forEach(f => console.error(`  ${f}`));
        return 1;
    }
    console.log(`  ok  baseline -> green (${baseline.strings.length} strings; once-per-session holds in the real client)`);

    const withCopy = (fn) => ({
        read: (rel) => (rel === COPY_REL ? fn(realRead(rel)) : realRead(rel)),
    });
    const withClient = (fn) => ({
        read: (rel) => (rel === CLIENT_REL ? fn(realRead(rel)) : realRead(rel)),
    });
    const bodyKey = 'readyBody';
    const bodyValue = baseline.strings.find(s => s.key === bodyKey).value;
    const titleKey = 'readyTitle';
    const titleValue = baseline.strings.find(s => s.key === titleKey).value;
    const macValue = baseline.strings.find(s => s.key === 'cannotUpdateMacBody').value;
    const withFile = (target, fn) => ({
        read: (rel) => (rel === target ? fn(realRead(rel)) : realRead(rel)),
    });

    // Each plant must change its file, or it proves nothing.
    const plants = [
        ['pref key in one body', withCopy(t => t.replace(bodyValue.slice(0, 20), 'app.update.url.manual is not here ')), bodyKey, 'pref'],
        ['ALL-CAPS token in one body', withCopy(t => t.replace(bodyValue.slice(0, 20), 'POWERBROWSER_TOKEN reached here ')), bodyKey, 'caps'],
        ['product name removed from a title', withCopy(t => t.replace(titleValue, titleValue.replace('PowerBrowser', 'Browser'))), titleKey, 'name'],
        ['affordance unwired (client drops the Check-again label)', withClient(t => t.split('\n').filter(l => !l.includes('checkAgainLabel')).join('\n')), 'couldNotCheckBody', 'affordance'],
        ['status with no next step', withCopy(t => t.replace('PowerBrowser: update check failed. Choose Check again to retry.', 'PowerBrowser: update check failed.')), 'checkFailedStatus', 'status'],
        ['unclassified string added', withCopy(t => t.replace('});', `    extraString: 'PowerBrowser extra string. Choose Check again.',\n});`)), 'extraString', 'extra'],
        ['literal user-facing text in the client', withClient(t => t.replace('export class UpdateClientContribution', "export const STRAY = 'PowerBrowser stray literal. Choose Later.';\nexport class UpdateClientContribution")), 'stray literal', 'literal'],
        ['single-word copy value typed into the client', withClient(t => t.replace('export class UpdateClientContribution', "export const STRAY = 'Later';\nexport class UpdateClientContribution")), 'Later', 'literal'],
        ['pref key in the macOS cannot-update body', withCopy(t => t.replace(macValue, `app.update.url.manual blocks this. ${macValue}`)), 'cannotUpdateMacBody', 'pref'],
        ['macOS body drops the Applications folder', withCopy(t => t.replace(macValue, macValue.replace('Applications folder', 'home folder'))), 'Applications folder', 'folder'],
        ['notarization overclaim on the download page', withFile(DOWNLOAD_REL, t => t.replace('ad-hoc signed and not notarized', 'ad-hoc signed and notarized')), 'overclaim: notarized', 'page'],
        ['Developer ID overclaim on the download page', withFile(DOWNLOAD_REL, t => t.replace('ad-hoc signed and not notarized', 'signed with a Developer ID and not notarized')), 'overclaim: Developer ID signed', 'page'],
    ];

    let failed = 0;
    for (const [name, overrides, needle] of plants) {
        const planted = [COPY_REL, CLIENT_REL, DOWNLOAD_REL].some(rel => overrides.read(rel) !== realRead(rel));
        if (!planted) {
            console.error(`${NAME}: --self-test FAIL -- '${name}' did not apply (its search text is gone); the plant proves nothing.`);
            failed += 1;
            continue;
        }
        const { failures } = runChecks(REPO_ROOT, overrides);
        const hit = failures.some(f => f.includes(needle));
        if (hit) {
            console.log(`  ok  ${name} -> red naming '${needle}'`);
        } else {
            console.error(`${NAME}: --self-test FAIL -- '${name}' did not go red naming '${needle}'; got: ${failures.join(' | ') || '(no failures at all)'}`);
            failed += 1;
        }
    }

    // CR-06 plants, driven through the real client.
    const clientPlants = [
        ['Check-again flag reset on request acceptance', (t) => t.replace("await this.request({ kind: 'checkForUpdates' });", "await this.request({ kind: 'checkForUpdates' }); this.checkAgainShown = false;")],
        ['flag never cleared by a completed check', (t) => t.replace('CHECK_COMPLETED_STATUSES.has(status) ? false : alreadyShown', 'alreadyShown')],
    ];
    for (const [name, mutate] of clientPlants) {
        const planted = withClient(mutate);
        if (planted.read(CLIENT_REL) === realRead(CLIENT_REL)) {
            console.error(`${NAME}: --self-test FAIL -- '${name}' did not apply (its search text is gone); the plant proves nothing.`);
            failed += 1;
            continue;
        }
        const failures = await onceSessionFailures(planted.read);
        if (failures.some(f => f.includes('Check-again prompts'))) {
            console.log(`  ok  ${name} -> red naming the Check-again prompt count`);
        } else {
            console.error(`${NAME}: --self-test FAIL -- '${name}' did not go red naming the Check-again prompt count; got: ${failures.join(' | ') || '(no failures at all)'}`);
            failed += 1;
        }
    }

    if (failed > 0) return 1;
    console.log(`${NAME}: --self-test PASS -- ${plants.length + clientPlants.length} planted faults went red naming their drift, and the control stayed green`);
    return 0;
}

process.exit(await main());
