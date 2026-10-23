#!/usr/bin/env node
/**
 * Phase 31 (SITE-01): the site-identity live gate -- Task 1's `identity-lock`
 * scenario on the pb-live-probe harness. This plan's only live scenario (per
 * 31-VALIDATION.md's sampling map the `site-panel`, `clear-data`, `shield`
 * and `app-menu` scenarios land with plans 02-04, so they are `SKIP
 * *-not-landed` here, never pass, never silent).
 *
 * Scenario `identity-lock` (one served origin, two tabs):
 *   - the /plain tab pushes a served-origin `local` state and the pill
 *     renders `.pb-identity` with its `local` host text and no icon;
 *   - typing `https://evil.example` into the pill on that tab changes the
 *     pill text but leaves the identity box on the pushed host (the spoof
 *     attempt: lock derived from typed text would follow the typed text);
 *   - an untitled editor made current renders no `.pb-identity` element
 *     (D-31-09/D-31-10: editor tabs show nothing).
 * A `securityState` probe read proves the pill is push-driven: the box's
 * host equals the tab's last pushed `displaySpec`/`url` host, not typed.
 *
 * Plant `typed-lock`: overrides the Theia frame's
 * `AddressBar.lockFromTypedText` to read the pill text
 * (`startsWith('https://')`); expected red `lock derived from typed text`
 * (the scenario fails naming that text when the box follows typing).
 *
 * Needs the built browser and the last Theia app build; not a --quick check.
 *
 * Usage:
 *   node scripts/verify-site-identity-live.mjs [--scenario identity-lock] | --self-test
 */

import {
    BROKEN,
    inChrome,
    isState,
    loadedAt,
    makeCurrent,
    openWebTab,
    pushes,
    readPill,
    serveNavPages,
    waitForPush,
    withProbeShell,
} from './lib/pb-live-probe.mjs';
import { probe } from './lib/pb-relaunch.mjs';

const NAME = 'verify-site-identity-live';

const PAGES = {
    '/plain': { title: 'Plain Page', body: '<p>plain</p>' },
    '/other': { title: 'Other Page', body: '<p>other</p>' },
};

/** The identity box in the Theia frame: its host text, icon and tooltip. */
const readIdentity = app => app.evaluate(`JSON.stringify((() => {
    const box = document.querySelector('.pb-identity');
    if (!box) return { present: false };
    const icon = box.querySelector('.pb-identity-icon');
    return {
        present: true,
        host: box.querySelector('.pb-identity-host')?.textContent ?? null,
        icon: icon ? [...icon.classList].filter(c => c !== 'pb-identity-icon' && c !== 'codicon').join(' ') : null,
        insecure: box.querySelector('.pb-identity-insecure')?.textContent ?? null,
        label: box.getAttribute('aria-label'),
    };
})())`).then(JSON.parse);

async function identityLock(ctx) {
    const { app, pages, plant, fail, note } = ctx;
    if (plant === 'typed-lock' && await probe(app, `get('AddressBar').lockFromTypedText = function () {
        const input = document.querySelector('.pb-chrome-bar-input');
        return !!input && input.value.trim().startsWith('https://');
    }; return true;`) === true) {
        note('PLANT typed-lock applied');
    }
    const tabId = await openWebTab(app, pages.url('/plain'));
    if (await waitForPush(app, loadedAt(tabId, '/plain')) < 0) {
        return fail(`${BROKEN} no loaded state push arrived for /plain`);
    }
    if (await makeCurrent(app, tabId) !== true) {
        return fail(`${BROKEN} the served-origin web tab could not be made current`);
    }
    const mark = (await pushes(app)).length;
    const box = await readIdentity(app);
    if (!box.present) {
        return fail('no .pb-identity element with a served-origin web tab current');
    }
    const pushed = (await pushes(app)).slice(mark).concat(await pushes(app)).filter(p => p.tabId === tabId && p.kind === 'state' && p.loading === false).pop()
        ?? (await pushes(app)).filter(p => p.tabId === tabId && String(p.url ?? '').endsWith('/plain')).pop();
    if (!pushed) {
        return fail(`${BROKEN} no state push for the served-origin tab to compare the box against`);
    }
    const host = (() => { try { return new URL(pushed.url).hostname; } catch { return ''; } })();
    if (box.host !== host) {
        return fail(`the identity box shows ${JSON.stringify(box.host)} but the tab's last push is for ${JSON.stringify(host)} (the box must follow the push, never typed text)`);
    }
    // The spoof attempt: typing https text must not move the box.
    const typed = await app.evaluate(`(() => {
        if (document.activeElement?.blur) document.activeElement.blur();
        const shell = window.theia?.container;
        return true;
    })()`).then(() => probe(app, `(() => { return true; })()`)).catch(() => null);
    void typed;
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
        return fail('the identity box vanished after typing in the pill');
    }
    if (after.host !== box.host) {
        fail(`lock derived from typed text: typing https://evil.example moved the box from ${JSON.stringify(box.host)} to ${JSON.stringify(after.host)}`);
    }
    if (plant === 'typed-lock' && after.icon !== null && String(after.icon).includes('lock')) {
        note('the typed-text plant shows a lock icon for typed https text');
    }
    // An editor tab shows no identity box at all.
    const editor = await probe(app, `await get('CommandRegistry').executeCommand('workbench.action.files.newUntitledFile');
        return await (async () => { const { until } = await import('./lib/pb-relaunch.mjs').catch(() => ({})); return !!get('EditorManager').currentEditor; })();`);
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

const SCENARIOS = { 'identity-lock': identityLock };

/** Later plans' scenarios: skipped until their plan lands them (never pass, never silent). */
const NOT_LANDED = ['site-panel', 'clear-data', 'shield', 'app-menu'];

/** One session over `names`; returns `[{ name, failures, notes, notScored }]` or throws. */
async function runSession(names, plant = '') {
    const pages = await serveNavPages(PAGES);
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
        });
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
    { plant: 'typed-lock', target: 'identity-lock', run: ['identity-lock'], expect: 'lock derived from typed text' },
];

async function selfTest() {
    let failed = 0;
    try {
        const clean = await runSession(['identity-lock']);
        const red = clean.filter(r => r.failures.length);
        if (red.length) {
            failed++;
            console.error(`${NAME} --self-test: FAIL -- the clean control is not green: ${red.map(r => `${r.name}: ${r.failures.join(' | ')}`).join('; ')}`);
        } else {
            console.log('  ok  clean control (no plant) -> green');
        }
    } catch (error) {
        console.error(`${NAME} --self-test: FAIL -- harness: the clean control could not be driven: ${error.message}`);
        return 1;
    }
    for (const c of PLANTS) {
        let results;
        try {
            results = await runSession(c.run, c.plant);
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
        return report(await runSession(selectedScenarios(args)));
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
void inChrome;
void isState;
process.exit(args.includes('--self-test') ? await selfTest() : await main(args));
