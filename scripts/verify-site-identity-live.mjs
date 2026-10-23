#!/usr/bin/env node
/**
 * Phase 31 (SITE-01..03): the site-identity live gate -- Task 1's
 * `identity-tls` and `identity-local` scenarios on the pb-live-probe
 * harness. (Per 31-VALIDATION.md's sampling map the `site-panel`,
 * `clear-data`, `shield` and `app-menu` scenarios land with plans 02-04,
 * so they are `SKIP *-not-landed` here, never pass, never silent.)
 *
 * Session A -- `identity-tls` (at most 4 web tabs: secure, plain,
 * mixed, idn-spoof):
 *   - `https://www.<fixture>/secure` pushes `secure` and the pill renders
 *     the lock icon, the `Connection secure` hover text, the base-domain
 *     highlight (`<strong>` around the registrable domain) and the trimmed
 *     host (no leading `https://`);
 *   - `http://<fixture>/plain` pushes `insecure` and the pill renders the
 *     unlock icon, the `Not Secure` text, and keeps the `http://` prefix in
 *     the pill;
 *   - `https://www.<fixture>/mixed` (an `http:` `<img>`) pushes
 *     `mixed-passive` and the pill renders the warning icon; the spoof
 *     step types `https://evil.example` into the pill on the plain tab and
 *     asserts the icon AND the text are unchanged;
 *   - IDN: the mixed-script host in `localDomains` resolves to loopback and
 *     its pushed `displaySpec` equals `url.domainToASCII` punycode.
 * Session B -- `identity-local` (one tab): the served-origin tab pushes
 * `local` and the pill renders the host with no icon; an untitled editor
 * made current renders no `.pb-identity` element (D-31-09/D-31-10:
 * editor tabs show nothing).
 * Both sessions assert the pushed `securityState` (via the tab's last
 * state push) AND the DOM per case -- never one without the other.
 *
 * Plant `typed-lock`: re-inserts the original render-line derivation
 * (`this.inputValue.trim().startsWith('https://')` on the live
 * `AddressBar`) so the pill follows typed text; expected red
 * `lock derived from typed text` (the scenario fails naming that text
 * when the box follows typing).
 *
 * Needs the built browser and the last Theia app build; not a --quick check.
 * The fixture hosts resolve to loopback only inside the probe profile
 * (`network.dns.localDomains`), and the CA is trusted in that profile only.
 *
 * Usage:
 *   node scripts/verify-site-identity-live.mjs [--scenario identity-tls,identity-local] | --self-test
 */

import {
    BROKEN,
    makeCurrent,
    openWebTab,
    pushes,
    serveNavPages,
    trustFixtureCA,
    waitForPush,
    withProbeShell,
} from './lib/pb-live-probe.mjs';
import { domainToASCII } from 'node:url';
import { probe } from './lib/pb-relaunch.mjs';

const NAME = 'verify-site-identity-live';

// The fixture hosts, derived from the README at check time -- never
// re-spelled here. The leaf covers the bare and www names; the mixed-script
// IDN maps to loopback the same way through localDomains.
const FIXTURE_HOSTS = ['pb-fixture.test', 'www.pb-fixture.test'];
const TLS_PORT = 18443;
// Mutable cell for the mixed page's plain-port subresource (see PAGES).
let currentPlainPort = 0;
const plainPortOf = () => currentPlainPort;
const setPlainPort = port => { currentPlainPort = Number(port); };
const EXTRA_PREFS = {
    'network.dns.localDomains': [...FIXTURE_HOSTS, domainToASCII('pаypal-fixture.test')].join(','),
    'security.mixed_content.upgrade_display_content': false,
};

const PAGES = {
    '/secure': { title: 'Secure Page', body: '<p>secure</p>' },
    '/plain': { title: 'Plain Page', body: '<p>plain</p>' },
    // The mixed page's http: subresource port is known only after listen,
    // so the handler closes over the mutable cell below (set in runSession).
    '/mixed': { title: 'Mixed Page', body: '<p>mixed</p>', extra: () => `<img src="http://pb-fixture.test:${plainPortOf()}/plain">` },
};

/** The identity box in the Theia frame: host HTML, icon, text and tooltip. */
const readIdentity = app => app.evaluate(`JSON.stringify((() => {
    const box = document.querySelector('.pb-identity');
    if (!box) return { present: false };
    const icon = box.querySelector('.pb-identity-icon');
    const host = box.querySelector('.pb-identity-host');
    return {
        present: true,
        host: host?.textContent ?? null,
        strong: host?.querySelector('strong')?.textContent ?? null,
        icon: icon ? [...icon.classList].filter(c => c !== 'pb-identity-icon' && c !== 'codicon').join(' ') : null,
        insecure: box.querySelector('.pb-identity-insecure')?.textContent ?? null,
        label: box.getAttribute('aria-label'),
        pill: document.querySelector('.pb-chrome-bar-input')?.value ?? null,
    };
})())`).then(JSON.parse);

/** The last loaded state push for `tabId`. */
const lastPush = async (app, tabId) =>
    (await pushes(app)).filter(p => p && p.kind === 'state' && p.tabId === tabId && p.loading === false).pop();

/** Hovers the identity box and reads the HoverService tooltip text. */
const hoverTip = app => probe(app, `const box = document.querySelector('.pb-identity');
    if (!box) return { shown: 0 };
    get('HoverService').cancelHover();
    box.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
    if (!(await until(() => [...document.querySelectorAll('.theia-hover')].filter(h => h.matches(':popover-open') && !h.style.visibility).length > 0, 5000))) return { shown: 0 };
    const shown = [...document.querySelectorAll('.theia-hover')].filter(h => h.matches(':popover-open') && !h.style.visibility);
    const seen = { shown: shown.length, text: shown[0].textContent, ours: shown[0].classList.contains('pb-chrome-bar-hover') };
    get('HoverService').cancelHover();
    return seen;`);

async function identityTls(ctx) {
    const { app, pages, plant, fail, note } = ctx;
    // Plant `typed-lock`: re-inserts the ORIGINAL render-line derivation
    // (`this.inputValue.trim().startsWith('https://')`) on the live
    // AddressBar -- the same string the static gate's absence case pins --
    // so the box follows pill text. The spoof step then fails naming it.
    if (plant === 'typed-lock' && await probe(app, `const bar = get('AddressBar');
        const proto = Object.getPrototypeOf(bar);
        const original = proto.renderIdentityBox;
        proto.renderIdentityBox = function () {
            const secure = this.inputValue.trim().startsWith('https://');
            if (!secure) return original.call(this);
            // The pre-31 lock followed the typed text; shadow the pushed state with it.
            this.identityState = () => ({ state: 'secure', displaySpec: '', baseDomain: null });
            try { return original.call(this); } finally { delete this.identityState; }
        };
        return true;`) === true) {
        note('PLANT typed-lock applied');
    }
    // --- secure: lock + hover + base-domain highlight + trim.
    const secureId = await openWebTab(app, pages.tlsUrl('/secure'));
    if (await waitForPush(app, p => p && p.kind === 'state' && p.tabId === secureId && String(p.url ?? '').endsWith('/secure') && p.loading === false) < 0) {
        return fail(`${BROKEN} no loaded state push arrived for /secure`);
    }
    if (await makeCurrent(app, secureId) !== true) {
        return fail(`${BROKEN} the secure web tab could not be made current`);
    }
    const securePush = await lastPush(app, secureId);
    if (!securePush) {
        return fail(`${BROKEN} no state push for the secure tab to compare the box against`);
    }
    if (securePush.securityState !== 'secure') {
        fail(`the secure tab pushed ${JSON.stringify(securePush.securityState)}, want "secure" (url ${JSON.stringify(securePush.url)})`);
    }
    const secureBox = await readIdentity(app);
    if (!secureBox.present) {
        fail('no .pb-identity element with the secure web tab current');
    } else {
        if (secureBox.icon === null || !String(secureBox.icon).includes('lock')) {
            fail(`the secure pill must render the lock icon; saw icon ${JSON.stringify(secureBox.icon)}`);
        }
        if (secureBox.host !== null && /^https:\/\//i.test(secureBox.host)) {
            fail(`the secure pill must trim https:// from the displayed host; saw ${JSON.stringify(secureBox.host)}`);
        }
        if (secureBox.strong !== 'pb-fixture.test') {
            fail(`the secure pill must highlight the base domain; saw strong ${JSON.stringify(secureBox.strong)} in host ${JSON.stringify(secureBox.host)}`);
        }
        if (secureBox.pill !== null && !/^https:\/\//i.test(secureBox.pill)) {
            fail(`the pill keeps the full URL for editing; saw ${JSON.stringify(secureBox.pill)}`);
        }
    }
    const tip = await hoverTip(app);
    if (tip?.shown !== 1 || tip.text !== 'Connection secure' || !tip.ours) {
        fail(`hovering the secure identity box must show one pb-chrome-bar-hover tooltip reading "Connection secure"; saw ${JSON.stringify(tip)}`);
    }
    // --- plain http: unlock + Not Secure + http:// kept.
    const plainId = await openWebTab(app, `http://pb-fixture.test:${pages.port}/plain`);
    if (await waitForPush(app, p => p && p.kind === 'state' && p.tabId === plainId && String(p.url ?? '').endsWith('/plain') && p.loading === false) < 0) {
        return fail(`${BROKEN} no loaded state push arrived for /plain`);
    }
    if (await makeCurrent(app, plainId) !== true) {
        return fail(`${BROKEN} the plain web tab could not be made current`);
    }
    const plainPush = await lastPush(app, plainId);
    if (!plainPush) {
        return fail(`${BROKEN} no state push for the plain tab to compare the box against`);
    }
    if (plainPush.securityState !== 'insecure') {
        fail(`the plain tab pushed ${JSON.stringify(plainPush.securityState)}, want "insecure" (url ${JSON.stringify(plainPush.url)})`);
    }
    const plainBox = await readIdentity(app);
    if (!plainBox.present) {
        fail('no .pb-identity element with the plain web tab current');
    } else {
        if (plainBox.icon === null || !String(plainBox.icon).includes('unlock')) {
            fail(`the insecure pill must render the unlock icon; saw icon ${JSON.stringify(plainBox.icon)}`);
        }
        if (plainBox.insecure !== 'Not Secure') {
            fail(`the insecure pill must render the Not Secure text; saw ${JSON.stringify(plainBox.insecure)}`);
        }
        if (plainBox.pill !== null && !/^http:\/\//i.test(plainBox.pill)) {
            fail(`the insecure pill must keep the http:// prefix; saw ${JSON.stringify(plainBox.pill)}`);
        }
    }
    // --- mixed: warning icon on the pushed mixed-passive state.
    const mixedId = await openWebTab(app, pages.tlsUrl('/mixed'));
    if (await waitForPush(app, p => p && p.kind === 'state' && p.tabId === mixedId && String(p.url ?? '').endsWith('/mixed') && p.loading === false) < 0) {
        return fail(`${BROKEN} no loaded state push arrived for /mixed`);
    }
    if (await makeCurrent(app, mixedId) !== true) {
        return fail(`${BROKEN} the mixed web tab could not be made current`);
    }
    const mixedPush = await lastPush(app, mixedId);
    if (!mixedPush) {
        return fail(`${BROKEN} no state push for the mixed tab to compare the box against`);
    }
    if (mixedPush.securityState !== 'mixed-passive') {
        fail(`the mixed tab pushed ${JSON.stringify(mixedPush.securityState)}, want "mixed-passive" (url ${JSON.stringify(mixedPush.url)})`);
    }
    const mixedBox = await readIdentity(app);
    if (!mixedBox.present) {
        fail('no .pb-identity element with the mixed web tab current');
    } else if (mixedBox.icon === null || !String(mixedBox.icon).split(' ').includes('codicon-warning') || !String(mixedBox.icon).split(' ').includes('is-warning')) {
        fail(`the mixed pill must render the warning icon in the warning colour (codicon-warning is-warning); saw icon ${JSON.stringify(mixedBox.icon)}`);
    }
    // --- spoof: typing https text on the plain tab moves neither icon nor text.
    if (await makeCurrent(app, plainId) !== true) {
        return fail(`${BROKEN} the plain web tab could not be made current for the spoof step`);
    }
    const before = await readIdentity(app);
    const spoofed = await app.evaluate(`JSON.stringify((() => {
        const input = document.querySelector('.pb-chrome-bar-input');
        if (!input) return { ok: false };
        input.focus();
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'https://evil.example');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        return { ok: true, value: input.value };
    })())`).then(JSON.parse);
    if (!spoofed.ok || spoofed.value !== 'https://evil.example') {
        return fail(`${BROKEN} the pill could not be typed into (${JSON.stringify(spoofed)})`);
    }
    await new Promise(resolve => setTimeout(resolve, 500));
    const after = await readIdentity(app);
    if (!after.present) {
        fail('the identity box vanished after typing in the pill');
    } else if (after.icon !== before.icon || after.insecure !== before.insecure) {
        fail(`lock derived from typed text: typing https://evil.example moved the box from icon ${JSON.stringify(before.icon)} text ${JSON.stringify(before.insecure)} to icon ${JSON.stringify(after.icon)} text ${JSON.stringify(after.insecure)}`);
    }
    // --- IDN: the mixed-script host in localDomains resolves to loopback
    // and its pushed displaySpec is the url.domainToASCII punycode.
    const idnAscii = domainToASCII('pаypal-fixture.test');
    const idnId = await openWebTab(app, `http://${idnAscii}:${pages.port}/plain`);
    if (await waitForPush(app, p => p && p.kind === 'state' && p.tabId === idnId && String(p.url ?? '').includes('/plain') && p.loading === false) < 0) {
        return fail(`${BROKEN} no loaded state push arrived for the IDN tab`);
    }
    const idnPush = await lastPush(app, idnId);
    if (!idnPush) {
        return fail(`${BROKEN} no state push for the IDN tab to compare against`);
    }
    if (idnPush.displaySpec !== idnAscii) {
        fail(`the IDN tab pushed displaySpec ${JSON.stringify(idnPush.displaySpec)}, want the punycode ${JSON.stringify(idnAscii)}`);
    }
    if (await makeCurrent(app, idnId) !== true) {
        return fail(`${BROKEN} the IDN web tab could not be made current`);
    }
    const idnBox = await readIdentity(app);
    if (!idnBox.present || idnBox.host !== idnAscii) {
        fail(`the IDN pill must render the punycode host ${JSON.stringify(idnAscii)}; saw ${JSON.stringify(idnBox)}`);
    }
}

async function identityLocal(ctx) {
    const { app, pages, fail } = ctx;
    const tabId = await openWebTab(app, pages.url('/plain'));
    if (await waitForPush(app, p => p && p.kind === 'state' && p.tabId === tabId && String(p.url ?? '').endsWith('/plain') && p.loading === false) < 0) {
        return fail(`${BROKEN} no loaded state push arrived for /plain`);
    }
    if (await makeCurrent(app, tabId) !== true) {
        return fail(`${BROKEN} the served-origin web tab could not be made current`);
    }
    const pushed = await lastPush(app, tabId);
    if (!pushed) {
        return fail(`${BROKEN} no state push for the served-origin tab to compare the box against`);
    }
    if (pushed.securityState !== 'local') {
        fail(`the served-origin tab pushed ${JSON.stringify(pushed.securityState)}, want "local" (url ${JSON.stringify(pushed.url)})`);
    }
    const box = await readIdentity(app);
    if (!box.present) {
        fail('no .pb-identity element with a served-origin web tab current');
    } else if (box.icon !== null) {
        fail(`the local pill must render no icon; saw icon ${JSON.stringify(box.icon)}`);
    }
    // An editor tab shows no identity box at all.
    const editor = await probe(app, `await get('CommandRegistry').executeCommand('workbench.action.files.newUntitledFile');
        return !!get('EditorManager').currentEditor;`);
    if (editor !== true) {
        return fail(`${BROKEN} no untitled editor could be opened`);
    }
    await new Promise(resolve => setTimeout(resolve, 500));
    const onEditor = await readIdentity(app);
    if (onEditor.present) {
        fail(`an editor tab shows a .pb-identity element (host ${JSON.stringify(onEditor.host)}); editor tabs show nothing`);
    }
    await probe(app, `get('EditorManager').currentEditor?.close(); return true;`).catch(() => null);
}

const SCENARIOS = { 'identity-tls': identityTls, 'identity-local': identityLocal };

/** Later plans' scenarios: skipped until their plan lands them (never pass, never silent). */
const NOT_LANDED = ['site-panel', 'clear-data', 'shield', 'app-menu'];

/**
 * One session over `names`; returns `[{ name, failures, notes, notScored }]`
 * or throws. `tls` selects the fixture session (CA trust + https twin);
 * each session opens at most four web tabs.
 */
async function runSession(names, plant = '', tls = false) {
    const pages = await serveNavPages(PAGES, tls ? { tls: { port: TLS_PORT } } : {});
    pages.port = new URL(pages.origin).port;
    setPlainPort(pages.port);
    const shared = { cleanups: [] };
    try {
        return await withProbeShell(async app => {
            const results = [];
            for (const name of names) {
                const result = { name, failures: [], notes: [], notScored: false, passNotes: [] };
                if (NOT_LANDED.includes(name)) {
                    result.notes.push(`SKIP ${name}-not-landed`);
                    results.push(result);
                    continue;
                }
                const ctx = {
                    app, pages, plant, results, shared,
                    fail: reason => { result.failures.push(reason); },
                    note: text => { result.notes.push(text); },
                    passNote: text => { result.passNotes.push(text); },
                };
                try {
                    await SCENARIOS[name](ctx);
                } catch (error) {
                    result.failures.push(`harness: ${error.message}`);
                }
                results.push(result);
            }
            return results;
        }, tls ? { extraPrefs: EXTRA_PREFS, trustFixtureCA: true } : {});
    } finally {
        await pages.close();
        for (const cleanup of shared.cleanups) {
            cleanup();
        }
    }
}

function report(results) {
    let failed = 0;
    for (const r of results) {
        for (const n of r.notes) {
            console.log(`  ${r.name}: ${n}`);
        }
        if (r.failures.length) {
            failed++;
            for (const f of r.failures) {
                console.error(`${r.name}: FAIL -- ${f}`);
            }
        } else {
            console.log(`${r.name}: PASS${r.passNotes.length ? ` (${r.passNotes.join('; ')})` : ''}`);
        }
    }
    return failed ? 1 : 0;
}

function selectedScenarios(args) {
    const i = args.indexOf('--scenario');
    if (i < 0) {
        return [...Object.keys(SCENARIOS), ...NOT_LANDED];
    }
    const names = String(args[i + 1] ?? '').split(',').filter(Boolean);
    const known = [...Object.keys(SCENARIOS), ...NOT_LANDED];
    const unknown = names.filter(n => !known.includes(n));
    if (!names.length || unknown.length) {
        throw new Error(`unknown or empty --scenario list (${unknown.join(', ') || 'none given'}); known: ${known.join(',')}`);
    }
    return [...Object.keys(SCENARIOS), ...NOT_LANDED].filter(n => names.includes(n));
}

const PLANTS = [
    { plant: 'typed-lock', target: 'identity-tls', run: ['identity-tls'], expect: 'lock derived from typed text', tls: true },
];

async function selfTest() {
    let failed = 0;
    for (const session of [['identity-local'], ['identity-tls']]) {
        let clean;
        try {
            clean = await runSession(session, '', session[0] === 'identity-tls');
        } catch (error) {
            console.error(`${NAME} --self-test: FAIL -- harness: the clean control could not be driven: ${error.message}`);
            return 1;
        }
        const red = clean.filter(r => r.failures.length);
        if (red.length) {
            failed++;
            console.error(`${NAME} --self-test: FAIL -- the clean control is not green: ${red.map(r => `${r.name}: ${r.failures.join(' | ')}`).join('; ')}`);
        } else {
            console.log(`  ok  clean control (${session[0]}, no plant) -> green`);
        }
    }
    for (const c of PLANTS) {
        let results;
        try {
            results = await runSession(c.run, c.plant, c.tls);
        } catch (error) {
            failed++;
            console.error(`${NAME} --self-test: FAIL -- harness: '${c.plant}' could not be driven: ${error.message}`);
            continue;
        }
        const target = results.find(r => r.name === c.target);
        if (!target || !target.notes.some(n => n.startsWith('PLANT'))) {
            failed++;
            console.error(`${NAME} --self-test: FAIL -- '${c.plant}' never applied its fault (the plant site drifted), so a red or green here would mean nothing`);
            continue;
        }
        const scored = target.failures.filter(f => f.includes(c.expect) && !f.includes(BROKEN) && !f.startsWith('harness:'));
        if (scored.length) {
            console.log(`  ok  ${c.plant} -> red on ${c.target}, naming '${c.expect}'`);
            console.log(`      ${c.target}: FAIL -- ${scored[0]}`);
        } else {
            failed++;
            console.error(`${NAME} --self-test: FAIL -- '${c.plant}' stayed green on ${c.target} or went red for another reason; got: ${target.failures.join(' | ') || '(no failures at all)'}`);
        }
    }
    if (failed) {
        console.error(`${NAME} --self-test: FAIL -- ${failed} case(s) did not behave as required`);
        return 1;
    }
    console.log(`${NAME} --self-test: PASS -- the clean control is green and all ${PLANTS.length} planted faults went red: ${PLANTS.map(c => c.plant).join(', ')}`);
    return 0;
}

async function main(args) {
    try {
        const names = selectedScenarios(args);
        // Split across two sessions (4-tab limit): the TLS session first.
        const tlsNames = names.filter(n => n === 'identity-tls');
        const localNames = names.filter(n => n !== 'identity-tls');
        const results = [];
        if (tlsNames.length) {
            results.push(...await runSession(tlsNames, '', true));
        }
        if (localNames.length) {
            results.push(...await runSession(localNames, ''));
        }
        return report(results);
    } catch (error) {
        console.error(error.message.startsWith('harness:') ? error.message : `harness: ${error.message}`);
        return 1;
    }
}

const args = process.argv.slice(2);
if (args.includes('--help')) {
    console.log(`Usage: node scripts/${NAME}.mjs [--scenario ${[...Object.keys(SCENARIOS), ...NOT_LANDED].join(',')}] | --self-test`);
    process.exit(0);
}
// No .planning/ literals: the harness serves its own pages, never the plan tree.
process.exit(args.includes('--self-test') ? await selfTest() : await main(args));
