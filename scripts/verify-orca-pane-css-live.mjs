#!/usr/bin/env node
// scripts/verify-orca-pane-css-live.mjs
//
// orca-pane-css-live (Phase 64, TAB-04, spike 004 condition 1; P64-14, P64-15; 64-RESEARCH A3, A9,
// Pitfalls 4 and 5; auto-mode ruling of Open Question 4): Orca's scoped pane sheet in the Theia
// document, measured both ways.
//
// Modes:
//   lane-build   only while theia/extensions/orca-panes is absent (lane p64-01): the lane Theia
//                build publishes React and ReactWidget under two Symbol.for keys (64-01 Setup 2);
//                the bundle comes from the harness server, a ReactWidget carrying
//                data-pb-orca-pane holds a terminal pane mounted with mountPane.
//   real-widget  required when theia/extensions/orca-panes exists (the coordinator, P64-15 runs it
//                first on the merged tree): the first frontend load runs with every /orca-panes/
//                request held by a BiDi network intercept (the baseline: no Orca sheet, no Orca
//                writes), the intercept is removed, the frontend reloads in the same session, "New
//                Orca Terminal" (powerbrowser.orca.newTerminal) opens a hosted terminal and the
//                measure runs on that OrcaPaneWidget. An app without orca-panes while the directory
//                exists is red, never a fallback.
//
// Both modes, every control before any absence is judged (CLAUDE.md verification rule 1):
//   - Theia element property values: a snapshot before the Orca sheet and one with the pane
//     mounted; 0 changed. Control: from a 0-diff baseline a planted Theia-side rule must register.
//   - Pane values: the pane's Orca elements against the same tab on the standalone page (a PB web
//     tab, harness); 0 changed. Control (A9): a host rule on a property that differs nowhere in
//     the measured diff must register.
//   - Portal probe: an Orca tooltip and an Orca dialog opened in the pane; their body-level portal
//     nodes against the standalone page's, and Theia's values while they are open; 0 changed.
//   - The derived <html> clause (replaces the raw html|class and html|style-attribute-length keys):
//     C = classes added to <html>, P = inline properties added or changed on it; every name in P
//     is a custom property; no rule of any Theia stylesheet (pb-panes.css excluded; CSSOM through
//     @media, @supports, @container and @layer) has a selector reading a class of C or a
//     declaration reading var() of a name of P. A planted probe sheet (synthetic names when C or P
//     is empty) must be detected first.
//   An unmeasured value is measured:false and red, never a zero.
//
// Tier: full (live) under flock /home/chris/coding/Power-Browser/.git/pb-live.lock with every
// inherited ORCA_* unset; --self-test quick (pure verdicts over fixtures). SKIP named when nothing
// is built.
//
// Usage:
//   node scripts/verify-orca-pane-css-live.mjs
//   node scripts/verify-orca-pane-css-live.mjs --self-test

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { GET_BY_NAME as harness_GET } from './lib/pb-relaunch.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'orca-pane-css-live';
const SELF = fileURLToPath(import.meta.url);
const J = JSON.stringify;
const ORCA_PANES_EXT = join(REPO_ROOT, 'theia', 'extensions', 'orca-panes');
const REACT_KEY = 'powerbrowser.orca-panes.react';
const LANE_WIDGETS_KEY = 'powerbrowser.orca-panes.lane-widgets';
const MODULE_KEY = 'powerbrowser.orca-panes.module';

export const PROPS = ['font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing', 'color', 'background-color', 'margin-top', 'margin-bottom',
    'padding-left', 'border-top-width', 'border-top-style', 'border-top-color', 'border-radius', 'box-sizing', 'text-decoration-line', 'cursor', 'list-style-type'];
// Leak-in control candidates: properties Orca sets on none of the measured elements in any variant.
const CONTROL_CANDIDATES = [['letter-spacing', '3px'], ['text-decoration-line', 'underline'], ['list-style-type', 'square'], ['cursor', 'wait']];

// ---------------------------------------------------------------- pure verdicts

export const diffMaps = (before, after) => Object.keys({ ...before, ...after }).filter(k => before[k] !== after[k])
    .map(k => ({ key: k, before: before[k] ?? null, after: after[k] ?? null }));

/** html clause: { classesAdded, propsAdded, readers: { classes, props }, probe: { classDetected, propDetected }, unreadable } */
export function htmlVerdict(h) {
    if (!h || h.measured === false) return `html clause not measured${h?.reason ? `: ${h.reason}` : ''}`;
    if (h.probe?.classDetected !== true || h.probe?.propDetected !== true) return `html clause blind: the planted probe sheet was not detected (class ${h.probe?.classDetected}, var() ${h.probe?.propDetected})`;
    if (h.unreadable > 0) return `html clause not measured: ${h.unreadable} Theia stylesheet(s) unreadable through CSSOM`;
    const nonCustom = (h.propsAdded ?? []).filter(p => !p.startsWith('--'));
    if (nonCustom.length) return `Orca wrote non-custom inline propert(y/ies) on <html>: ${nonCustom.join(', ')}`;
    if (h.readers?.classes?.length) return `a Theia rule reads a class Orca added to <html>: ${h.readers.classes[0]}`;
    if (h.readers?.props?.length) return `a Theia rule reads an inline property Orca wrote on <html>: ${h.readers.props[0]}`;
    return null;
}

/**
 * The whole judgment. obs: { theia: { controlBaseline, controlDelta, changed: [], compared },
 * pane: { measured, changed, compared, controlDelta }, portal: { measured, changed, compared, theiaChanged }, html }.
 */
export function cssVerdict(obs) {
    const t = obs.theia, p = obs.pane, q = obs.portal;
    if (!t || t.controlBaseline !== 0) return `Theia control: the baseline is not 0-diff (${t?.controlBaseline})`;
    if (!(t.controlDelta >= 1)) return 'Theia control: a planted Theia-side rule did not register (the detector is blind)';
    if (!p || p.measured === false) return `pane values not measured${p?.reason ? `: ${p.reason}` : ''}`;
    if (!(p.controlDelta >= 1)) return 'pane control: a planted host rule on the pane did not register (the detector is blind)';
    if (!q || q.measured === false) return `portal probe not measured${q?.reason ? `: ${q.reason}` : ''}`;
    if (!q.kinds?.includes('popper') || !q.kinds?.some(k => k !== 'popper')) return `portal probe not measured: needs an Orca tooltip and an Orca dialog, opened [${(q.kinds ?? []).join(', ')}]`;
    if (t.changed.length) return `${t.changed.length} Theia element property value(s) changed, first ${t.changed[0].key}: ${t.changed[0].before} -> ${t.changed[0].after}`;
    if (p.changed.length) return `${p.changed.length} pane value(s) differ from the standalone page, first ${p.changed[0].key}: ${p.changed[0].before} -> ${p.changed[0].after}`;
    if (q.changed.length) return `${q.changed.length} portal value(s) differ from the standalone page, first ${q.changed[0].key}`;
    if (q.theiaChanged.length) return `${q.theiaChanged.length} Theia value(s) changed while Orca's portals were open, first ${q.theiaChanged[0].key}`;
    return htmlVerdict(obs.html);
}

/**
 * Whether one selector list can match <html> through a class of `added` (pure; also sent to the
 * page). <html> has no ancestor and no sibling, so only the leftmost compound of a complex selector
 * can match it; that compound reads an added class when it names one and every other class it
 * names is on <html> and its type selector, if any, is html, :root or *. A class on another
 * element (Monaco's .picked-color.light) is not a read of <html>'s class.
 */
export function selectorReadsHtmlClass(selectorText, added, htmlClasses) {
    const parts = [];
    let depth = 0, start = 0;
    for (let i = 0; i < selectorText.length; i += 1) {
        const c = selectorText[i];
        if (c === '(' || c === '[') depth += 1;
        else if (c === ')' || c === ']') depth -= 1;
        else if (c === ',' && depth === 0) { parts.push(selectorText.slice(start, i)); start = i + 1; }
    }
    parts.push(selectorText.slice(start));
    for (const part of parts) {
        const sel = part.trim();
        let end = sel.length; depth = 0;
        for (let i = 0; i < sel.length; i += 1) {
            const c = sel[i];
            if (c === '(' || c === '[') depth += 1;
            else if (c === ')' || c === ']') depth -= 1;
            else if (depth === 0 && (c === ' ' || c === '>' || c === '+' || c === '~')) { end = i; break; }
        }
        const head = sel.slice(0, end);
        const classes = [...head.replace(/\[[^\]]*\]/g, '').matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map(m => m[1]);
        if (!classes.some(c => added.includes(c))) continue;
        const type = /^([a-zA-Z][\w-]*|\*)/.exec(head)?.[1];
        if (type && !['html', '*'].includes(type.toLowerCase())) continue;
        if (/#/.test(head.replace(/\[[^\]]*\]/g, ''))) continue;
        if (classes.every(c => added.includes(c) || htmlClasses.includes(c))) return true;
    }
    return false;
}

// ---------------------------------------------------------------- page-realm pieces

const HELPERS = `(() => {
    const PROPS = ${J(PROPS)};
    window.__pbStyles = targets => { const out = {};
        for (const [name, el] of Object.entries(targets)) { if (!el) { out[name + '|present'] = 'absent'; continue; }
            const cs = getComputedStyle(el); for (const p of PROPS) out[name + '|' + p] = cs.getPropertyValue(p); }
        return out; };
    window.__pbTheiaSnapshot = () => {
        let box = document.querySelector('[data-pb-css-probe]');
        if (!box) { box = document.createElement('div'); box.setAttribute('data-pb-css-probe', ''); box.style.cssText = 'position:absolute;left:-9999px;top:0';
            box.innerHTML = '<button>b</button><input value="i"><a href="#">a</a><h1>h</h1><ul><li>x</li></ul><p>p</p><div data-scroll style="width:100px;height:100px;overflow:scroll"></div>';
            document.body.appendChild(box); }
        const out = window.__pbStyles({ html: document.documentElement, body: document.body, button: box.querySelector('button'), input: box.querySelector('input'),
            a: box.querySelector('a'), h1: box.querySelector('h1'), ul: box.querySelector('ul'), p: box.querySelector('p'),
            'theia-shell': document.getElementById('theia-app-shell'), 'theia-tab': document.querySelector('#theia-main-content-panel .lm-TabBar-tab, .lm-TabBar-tab'),
            'theia-toolbar-button': document.querySelector('.pb-chrome-bar button, #theia-top-panel button'), 'theia-input': document.querySelector('.pb-chrome-bar-input, input.theia-input') });
        const scroll = box.querySelector('[data-scroll]'); out['scrollbar|width'] = String(scroll.offsetWidth - scroll.clientWidth);
        return out; };
    window.__pbHtmlState = () => { const el = document.documentElement; const props = {};
        for (let i = 0; i < el.style.length; i += 1) { const n = el.style[i]; props[n] = el.style.getPropertyValue(n); }
        return { classes: [...el.classList], props }; };
    window.__pbPaneStyles = scope => { const root = scope && scope.querySelector('[data-pb-orca-pane-root]'); if (!root) return null;
        const xterm = [...root.querySelectorAll('.xterm')].find(x => x.getBoundingClientRect().width > 0) || root.querySelector('.xterm');
        return window.__pbStyles({ root, body: root.firstElementChild, xterm, rows: xterm && xterm.querySelector('.xterm-rows'), row: xterm && xterm.querySelector('.xterm-rows > div'),
            viewport: xterm && xterm.querySelector('.xterm-viewport'), helper: xterm && xterm.querySelector('.xterm-helper-textarea') }); };
    window.__pbPortalStyles = () => { const nodes = [...document.body.children].filter(e => e.hasAttribute('data-radix-popper-content-wrapper') || e.hasAttribute('data-slot'));
        const out = {}; nodes.forEach((n, i) => { const k = n.hasAttribute('data-radix-popper-content-wrapper') ? 'popper' : 'slot-' + n.getAttribute('data-slot');
            Object.assign(out, window.__pbStyles({ [k]: n, [k + '>text']: [...n.querySelectorAll('*')].find(e => e.childElementCount === 0 && (e.textContent || '').trim()) || null })); });
        return out; };
    // CSSOM walk of every same-document sheet except the pane sheet: selectors reading a class of C, declarations reading var() of P.
    const selectorReadsHtmlClass = ${selectorReadsHtmlClass.toString()};
    window.__pbHtmlReaders = (classes, props) => { const out = { classes: [], props: [], unreadable: 0, rules: 0 };
        const htmlClasses = [...document.documentElement.classList];
        const propRe = props.length ? new RegExp('var\\\\(\\\\s*(' + props.map(p => p.replace(/[^\\w-]/g, '\\\\$&')).join('|') + ')\\\\s*[,)]') : null;
        const walk = rules => { for (const r of rules) { if (r.selectorText !== undefined) { out.rules += 1;
                if (classes.length && selectorReadsHtmlClass(r.selectorText, classes, htmlClasses)) out.classes.push(r.selectorText.slice(0, 160));
                if (propRe && r.style && propRe.test(r.style.cssText)) out.props.push(r.selectorText.slice(0, 120) + ' { ' + (r.style.cssText.match(propRe) || [''])[0] + ' }'); }
            if (r.cssRules && r.cssRules.length) walk(r.cssRules); } };
        for (const sheet of document.styleSheets) { if (sheet.href && /pb-panes\\.css(\\?|$)/.test(sheet.href)) continue;
            let rules; try { rules = sheet.cssRules; } catch (e) { out.unreadable += 1; continue; } walk(rules); }
        return out; };
    return true; })()`;

// ---------------------------------------------------------------- live

async function measure(s, mode) {
    const { app, lib } = s;
    const ev = expr => app.evaluate(expr);
    const obs = { mode };
    await ev(HELPERS);
    // Theia control from a 0-diff baseline.
    const base0 = JSON.parse(await ev('JSON.stringify(window.__pbTheiaSnapshot())'));
    const base1 = JSON.parse(await ev('JSON.stringify(window.__pbTheiaSnapshot())'));
    await ev(`(() => { const st = document.createElement('style'); st.id = 'pb-css-theia-control'; st.textContent = '[data-pb-css-probe] p { letter-spacing: 3px !important }'; document.head.appendChild(st); return true; })()`);
    const planted = JSON.parse(await ev('JSON.stringify(window.__pbTheiaSnapshot())'));
    await ev(`(() => { document.getElementById('pb-css-theia-control').remove(); return true; })()`);
    obs.theia = { controlBaseline: diffMaps(base0, base1).length, controlDelta: diffMaps(base0, planted).length, compared: Object.keys(base0).length };
    const html0 = JSON.parse(await ev('JSON.stringify(window.__pbHtmlState())'));

    const pick = await s.mountInTheia();
    await lib.sleep(2500);
    const theiaAfter = JSON.parse(await ev('JSON.stringify(window.__pbTheiaSnapshot())'));
    obs.theia.changed = diffMaps(base0, theiaAfter);
    const html1 = JSON.parse(await ev('JSON.stringify(window.__pbHtmlState())'));
    const inTheia = JSON.parse(await ev(`JSON.stringify(window.__pbPaneStyles(document.querySelector('[data-pb-orca-pane="terminal"]')))`));

    // The standalone reference: the same tab on the standalone page.
    // lane-build: the same tab (one orcad); real-widget: a terminal of the harness orcad.
    const ref = await s.openStandalone();
    const evRef = expr => s.evalIn(ref, expr);
    await evRef(HELPERS);
    await evRef('(() => { window.__pbPanes = []; window.PbPanes.subscribePanes(l => { window.__pbPanes = l; }); return true; })()');
    const refRec = await lib.pollFor(async () => JSON.parse(await evRef('JSON.stringify(window.__pbPanes)')).find(r => r.kind === 'terminal' && (mode !== 'lane-build' || r.tabId === pick.tabId)), 30000, 'the reference terminal record');
    const refPick = { kind: 'terminal', worktreeId: refRec.worktreeId, tabId: refRec.tabId, paneKey: refRec.paneKey };
    await evRef(`(() => { const root = window.__pbHost('terminal', 'css-ref', [0, 0, 700, 600]); window.PbPanes.mountPane(root, ${J(refPick)}); return true; })()`);
    // The tooltip's pane: the same chat (lane-build) or a chat of the harness orcad (real-widget).
    let refChat = mode === 'lane-build' ? s.chatPick : null;
    if (!refChat) {
        await evRef(`window.PbPanes.createChat(${J(refPick.worktreeId)}).then(() => true, () => false)`);
        const r = await lib.pollFor(async () => JSON.parse(await evRef('JSON.stringify(window.__pbPanes)')).find(x => x.kind === 'agent-session'), 20000, 'the reference chat');
        refChat = { kind: 'agent-session', worktreeId: r.worktreeId, tabId: r.tabId, paneKey: null };
    }
    await evRef(`(() => { const root = window.__pbHost('agent-session', 'css-chat', [720, 0, 700, 600]); window.PbPanes.mountPane(root, ${J(refChat)}); return true; })()`);
    try { await lib.pollFor(async () => (await evRef(`document.querySelector('#pb-host-css-ref .xterm') ? true : false`)) === true, 30000, 'the reference pane'); } catch { /* measured below */ }
    await lib.sleep(2500);
    const reference = JSON.parse(await evRef(`JSON.stringify(window.__pbPaneStyles(document.getElementById('pb-host-css-ref')))`));
    if (!inTheia || !reference || Object.values(inTheia).every(v => v === '')) {
        obs.pane = { measured: false, reason: !inTheia ? 'no pane root in the Theia widget' : !reference ? 'no pane root on the standalone page' : 'the pane reads empty computed styles' };
    } else {
        const changed = diffMaps(reference, inTheia);
        await s.showTheiaPane();
        const control = CONTROL_CANDIDATES.find(([prop]) => !changed.some(d => d.key.endsWith('|' + prop)));
        await ev(`(() => { const st = document.createElement('style'); st.id = 'pb-css-pane-control'; st.textContent = '[data-pb-orca-pane="terminal"] .xterm { ${control[0]}: ${control[1]} !important }'; document.head.appendChild(st); return true; })()`);
        const plantedPane = JSON.parse(await ev(`JSON.stringify(window.__pbPaneStyles(document.querySelector('[data-pb-orca-pane="terminal"]')))`));
        await ev(`(() => { document.getElementById('pb-css-pane-control').remove(); return true; })()`);
        obs.pane = { measured: true, changed, compared: Object.keys(reference).length, control: control[0], controlDelta: diffMaps(reference, plantedPane).length - changed.length };
    }

    // Portal probe: an Orca tooltip and an Orca dialog, opened in both documents.
    obs.portal = await portalProbe(s, ref, pick, refPick, base0);

    // The derived html clause, its probe sheet detected first.
    const C = html1.classes.filter(c => !html0.classes.includes(c));
    const P = Object.keys(html1.props).filter(n => html0.props[n] !== html1.props[n]);
    const pc = C[0] ?? 'pb-css-synthetic-class', pp = P.find(n => n.startsWith('--')) ?? '--pb-css-synthetic-prop';
    await ev(`(() => { const st = document.createElement('style'); st.id = 'pb-css-html-probe'; st.textContent = '@media all { .${pc} .pb-x { opacity: 1 } } .pb-y { color: var(${pp}, red) }'; document.head.appendChild(st); return true; })()`);
    const probe = JSON.parse(await ev(`JSON.stringify(window.__pbHtmlReaders(${J([pc])}, ${J([pp])}))`));
    await ev(`(() => { document.getElementById('pb-css-html-probe').remove(); return true; })()`);
    const readers = JSON.parse(await ev(`JSON.stringify(window.__pbHtmlReaders(${J(C)}, ${J(P)}))`));
    obs.html = { classesAdded: C, propsAdded: P, classesNow: html1.classes, propsNow: Object.keys(html1.props).length, readers, unreadable: readers.unreadable, rules: readers.rules,
        probe: { classDetected: probe.classes.length >= 1, propDetected: probe.props.length >= 1 } };
    return obs;
}

/** Focus on a Radix tooltip trigger opens its tooltip (Radix opens on focus without a pointer down). */
const OPEN_TOOLTIP = scopeSel => `(() => { const scope = document.querySelector(${J(scopeSel)});
    const t = scope && [...scope.querySelectorAll('[data-slot="tooltip-trigger"]')].find(e => e.getBoundingClientRect().width > 0);
    if (!t) return false; t.focus(); t.dispatchEvent(new FocusEvent('focusin', { bubbles: true })); t.dispatchEvent(new FocusEvent('focus')); return true; })()`;
const CLOSE_TOOLTIP = `(() => { if (document.activeElement) document.activeElement.blur(); document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return true; })()`;
const PORTALS_OPEN = `[...document.body.children].filter(e => e.hasAttribute('data-radix-popper-content-wrapper') || e.hasAttribute('data-slot')).map(e => e.hasAttribute('data-slot') ? e.getAttribute('data-slot') : 'popper')`;

/**
 * An Orca tooltip (from the chat pane) and an Orca dialog (Orca's own close confirmation of a
 * terminal running a job), each opened in the Theia document and on the standalone page; their
 * body-level portal nodes compared, and Theia's values while each is open.
 */
async function portalProbe(s, ref, pick, refPick, base0) {
    const { app, lib } = s;
    const ev = expr => app.evaluate(expr), evRef = expr => s.evalIn(ref, expr);
    const out = { measured: false, changed: [], theiaChanged: [], compared: 0, kinds: [], opened: {} };
    const docs = [['theia', ev, '[data-pb-orca-pane="agent-session"]', pick], ['standalone', evRef, '#pb-host-css-chat', refPick]];
    const styles = { theia: {}, standalone: {} };
    const collect = async phase => {
        for (const [label, evx] of docs) Object.assign(styles[label], JSON.parse(await evx('JSON.stringify(window.__pbPortalStyles())')));
        out.theiaChanged.push(...diffMaps(base0, JSON.parse(await ev('JSON.stringify(window.__pbTheiaSnapshot())'))).map(d => ({ ...d, key: `${phase}:${d.key}` })));
    };
    // Tooltip.
    if (s.showTheiaPane) await s.showTheiaPane();
    for (const [label, evx, scope] of docs) {
        const opened = await evx(OPEN_TOOLTIP(scope));
        let portals = [];
        try { portals = await lib.pollFor(async () => { const k = JSON.parse(await evx(`JSON.stringify(${PORTALS_OPEN})`)); return k.includes('popper') ? k : null; }, 5000, `${label} tooltip`); } catch { /* recorded */ }
        out.opened[`${label} tooltip`] = { trigger: opened, portals };
    }
    await lib.sleep(800);
    await collect('tooltip');
    for (const [, evx] of docs) await evx(CLOSE_TOOLTIP);
    await lib.sleep(800);
    // Dialog: a job in the terminal, then Orca's own close asks.
    s.orca('terminal', 'send', '--terminal', s.terminalHandle, '--text', 'sleep 600', '--enter');
    if (s.mode === 'real-widget') await s.typeInTheiaPane('sleep 600');
    await lib.sleep(2500);
    for (const [label, evx, , p] of docs) {
        await evx(`(() => { window.PbPanes.closePane(${J(p)}); return true; })()`);
        let portals = [];
        try { portals = await lib.pollFor(async () => { const k = JSON.parse(await evx(`JSON.stringify(${PORTALS_OPEN})`)); return k.some(x => x !== 'popper') ? k : null; }, 10000, `${label} dialog`); } catch { /* recorded */ }
        out.opened[`${label} dialog`] = { portals };
    }
    await lib.sleep(800);
    await collect('dialog');
    for (const [, evx] of docs) await evx(`(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return true; })()`);
    const keys = Object.keys(styles.standalone).filter(k => k in styles.theia && !k.endsWith('|present'));
    out.kinds = [...new Set(keys.map(k => k.split('|')[0].replace(/>text$/, '')))];
    out.compared = keys.length;
    out.changed = diffMaps(Object.fromEntries(keys.map(k => [k, styles.standalone[k]])), Object.fromEntries(keys.map(k => [k, styles.theia[k]])));
    out.measured = keys.length > 0;
    if (!out.measured) out.reason = `no Orca portal opened in both documents (${J(out.opened)})`;
    return out;
}

async function live() {
    const harness = await import('./lib/orca-pane-harness.mjs');
    const skips = harness.skipReasons();
    if (skips.length) { console.log(`${NAME}: SKIP -- ${skips.join('; ')}`); return 0; }
    if (!existsSync(join(harness.STANDALONE_DIR, 'pb-panes.js'))) {
        const b = spawnSync('bash', [join(REPO_ROOT, 'scripts', 'build-orca-panes.sh'), '--standalone'], { encoding: 'utf8' });
        if (b.status !== 0) { console.log(`${NAME}: FAIL -- harness: build-orca-panes.sh --standalone: ${(b.stdout ?? '').trim().split('\n').pop()}`); return 1; }
    }
    const mode = existsSync(ORCA_PANES_EXT) ? 'real-widget' : 'lane-build';
    const { pollFor } = await import('./lib/pb-live-probe.mjs');
    let obs = null, harnessError = null;
    try {
        await harness.withOrcaPaneSession({ log: line => console.log(line) }, async s => {
            s.lib = { pollFor, sleep: harness.sleep };
            s.mode = mode;
            const ev = expr => s.app.evaluate(expr);
            if (mode === 'lane-build') await laneBuildSetup(s, ev, harness);
            else await realWidgetSetup(s, ev, harness);
            obs = await measure(s, mode);
        });
    } catch (error) {
        harnessError = String(error?.message ?? error).slice(0, 500);
    }
    if (harnessError) { console.log(`${NAME}: FAIL -- harness: ${harnessError}`); return 1; }
    const verdict = cssVerdict(obs);
    const t = obs.theia, p = obs.pane, q = obs.portal, h = obs.html;
    console.log(`${NAME}: measured -- Theia ${t.changed.length} of ${t.compared} changed (control ${t.controlDelta} from a ${t.controlBaseline}-diff baseline); pane ${p.measured === false ? 'not measured' : `${p.changed.length} of ${p.compared} changed (control ${p.control} ${p.controlDelta})`}; portal ${q.measured ? `${q.changed.length} of ${q.compared} changed [${q.kinds.join(', ')}], Theia while open ${q.theiaChanged.length}` : `not measured (${q.reason})`}; tooltip/dialog opened ${J(q.opened ?? {}).length > 2 ? Object.entries(q.opened).map(([k, v]) => `${k}=${(v.portals ?? []).length}`).join(' ') : 'none'}; html classes added [${h.classesAdded.join(' ')}] (now [${h.classesNow.join(' ')}], ${h.propsNow} inline), ${h.propsAdded.length} inline propert(y/ies) added or changed [${h.propsAdded.slice(0, 8).join(' ')}] (${h.propsAdded.filter(n => !n.startsWith('--')).length} non-custom), readers ${h.readers.classes.length + h.readers.props.length} over ${h.rules} rule(s), probe ${h.probe.classDetected}/${h.probe.propDetected}`);
    if (verdict) { console.log(`${NAME}: FAIL -- ${mode} mode: ${verdict}`); return 1; }
    console.log(`${NAME}: PASS -- ${mode} mode; Theia 0 of ${t.compared} and pane 0 of ${p.compared} values changed with both controls registered; portal probe 0 of ${q.compared}; Orca's <html> writes (${h.classesAdded.length} class(es), ${h.propsAdded.length} custom propert(y/ies)) read by no Theia rule`);
    return 0;
}

/** Lane-build mode: the lane Theia build's hand-off keys, the bundle from the harness, one ReactWidget. */
async function laneBuildSetup(s, ev, harness) {
    const keys = await ev(`[!!globalThis[Symbol.for(${J(REACT_KEY)})], !!globalThis[Symbol.for(${J(LANE_WIDGETS_KEY)})]]`);
    if (!keys[0] || !keys[1]) throw new Error('lane-build mode needs the lane Theia build with the React hand-off line (64-01 Setup 2)');
    // A terminal tab exists before any pane mounts in this client (a mount stops later host terminals becoming tabs).
    const created = s.orca('terminal', 'create', '--worktree', `path:${s.repoDir}`);
    s.terminalHandle = /"(term_[A-Za-z0-9_-]+)"/.exec(J(created))?.[1];
    const addWidget = (id, p, placement) => ev(`(async () => { ${harness_GET} const R = globalThis[Symbol.for(${J(REACT_KEY)})].React; const W = globalThis[Symbol.for(${J(LANE_WIDGETS_KEY)})];
            class PbCssPaneWidget extends W.ReactWidget {
                constructor() { super(); this.id = ${J(id)}; this.title.label = ${J(p.kind)}; this.title.closable = true; this.node.setAttribute('data-pb-orca-pane', ${J(p.kind)});
                    this.node.style.display = 'flex'; this.host = null; }
                render() { return R.createElement('div', { ref: el => { if (el && !this.host) { this.host = el; window.PbPanes.mountPane(el, ${J(p)}); } },
                    style: { display: 'flex', flex: 1, minWidth: 0, minHeight: 0, height: '100%' } }); } }
            const w = new PbCssPaneWidget();
            const shell = __getByName(window.theia.container, 'ApplicationShell'); await shell.addWidget(w, ${placement}); await shell.activateWidget(w.id); w.update(); return true; })()`);
    let pick = null;
    // Everything Orca does to the Theia document happens from here on (the baseline is taken before).
    s.mountInTheia = async () => {
        await ev(`(() => { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = ${J(`${s.origin}/pb-panes/pb-panes.css`)}; document.head.appendChild(l);
            window.__pbBoot = null; import(${J(`${s.origin}/pb-panes/pb-panes.js`)}).then(m => { window.PbPanes = m; window.__pbPanes = []; }).then(() => ${s.withPairing(p => `window.PbPanes.bootstrap({ pairing: ${J(p)} })`)}).then(() => { window.PbPanes.subscribePanes(l => { window.__pbPanes = l; }); window.__pbBoot = 'ok'; },
                e => { window.__pbBoot = 'failed: ' + String(e && e.message || e).slice(0, 300); }); return true; })()`);
        const boot = await s.lib.pollFor(async () => ev('window.__pbBoot'), 60000, 'the bundle to boot in the Theia document');
        if (boot !== 'ok') throw new Error(`Theia document bootstrap ${boot}`);
        if ((await ev(`window.PbPanes.reactIdentity === globalThis[Symbol.for(${J(REACT_KEY)})].React`)) !== true) throw new Error('the bundle does not run on the Theia document\'s React');
        const rec = await s.lib.pollFor(async () => JSON.parse(await ev('JSON.stringify(window.__pbPanes)')).find(r => r.kind === 'terminal'), 30000, 'the terminal record');
        pick = { kind: 'terminal', worktreeId: rec.worktreeId, tabId: rec.tabId, paneKey: rec.paneKey };
        // The tooltip's pane: an Orca chat, through Orca's own launch.
        await ev(`window.PbPanes.createChat(${J(rec.worktreeId)}).then(() => true, () => false)`);
        const chat = await s.lib.pollFor(async () => JSON.parse(await ev('JSON.stringify(window.__pbPanes)')).find(r => r.kind === 'agent-session'), 20000, 'the chat record');
        s.chatPick = { kind: 'agent-session', worktreeId: chat.worktreeId, tabId: chat.tabId, paneKey: null };
        await addWidget('pb-css-orca-pane', pick, `{ area: 'main' }`);
        await s.lib.pollFor(async () => (await ev(`document.querySelector('[data-pb-orca-pane="terminal"] .xterm') ? true : false`)) === true, 30000, 'the hosted terminal in the Theia widget');
        await addWidget('pb-css-orca-chat', s.chatPick, `{ area: 'main', mode: 'split-right', ref: shell.getWidgetById('pb-css-orca-pane') }`);
        return pick;
    };
    s.showTheiaPane = async () => { await ev(`(async () => { ${harness_GET} const shell = __getByName(window.theia.container, 'ApplicationShell'); await shell.activateWidget('pb-css-orca-pane'); await shell.activateWidget('pb-css-orca-chat'); return true; })()`); await s.lib.sleep(1500); };
}

/** Real-widget mode: the merged tree's orca-panes, its baseline load held by a BiDi intercept. */
async function realWidgetSetup(s, ev, harness) {
    const { app } = s;
    const hasCommand = async () => ev(`(() => { ${harness_GET} try { return !!__getByName(window.theia.container, 'CommandRegistry').getCommand('powerbrowser.orca.newTerminal'); } catch (e) { return false; } })()`);
    if (!(await hasCommand())) throw new Error('theia/extensions/orca-panes exists but the app has no powerbrowser.orca.newTerminal (not built into this frontend; never a lane-build fallback)');
    // The standalone reference runs on the harness orcad: one CLI terminal there, made before any mount.
    const created = s.orca('terminal', 'create', '--worktree', `path:${s.repoDir}`);
    s.terminalHandle = /"(term_[A-Za-z0-9_-]+)"/.exec(J(created))?.[1];
    s.typeInTheiaPane = async text => {
        const href = await ev('location.href');
        const theiaCtx = (await harness.allContexts(app)).find(c => c.top && c.url === href)?.context;
        const focused = await ev(`(() => { const t = document.querySelector('[data-pb-orca-pane="terminal"] .xterm-helper-textarea'); if (!t) return false; t.focus(); return document.activeElement === t; })()`);
        if (theiaCtx && focused) await s.typeIn(theiaCtx, text);
    };
    await app.send('session.subscribe', { events: ['network.beforeRequestSent'] });
    const { intercept } = await app.send('network.addIntercept', { phases: ['beforeRequestSent'], urlPatterns: [{ type: 'string', pattern: `${await ev('location.origin')}/orca-panes/` }, { type: 'pattern', pathname: '/orca-panes/*' }] });
    // The baseline load: every /orca-panes/ request is held, so no Orca sheet and no Orca writes.
    await ev('(() => { setTimeout(() => location.reload(), 0); return true; })()');
    await s.lib.sleep(3000);
    await s.lib.pollFor(async () => ev(`(() => { ${harness_GET} try { return __getByName(window.theia.container, 'FrontendApplicationStateService').state === 'ready'; } catch (e) { return false; } })()`), 120000, 'the baseline frontend');
    s.realBaseline = true;
    s.mountInTheia = async () => {
        await app.send('network.removeIntercept', { intercept });
        await ev('(() => { setTimeout(() => location.reload(), 0); return true; })()');
        await s.lib.sleep(3000);
        await s.lib.pollFor(async () => ev(`(() => { ${harness_GET} try { return __getByName(window.theia.container, 'FrontendApplicationStateService').state === 'ready'; } catch (e) { return false; } })()`), 120000, 'the reloaded frontend');
        await ev(HELPERS);
        await s.lib.pollFor(async () => ev(`!!globalThis[Symbol.for(${J(MODULE_KEY)})] && globalThis[Symbol.for(${J(MODULE_KEY)})].state().booted`), 60000, 'the orca-panes bundle to boot');
        await ev(`(() => { ${harness_GET} __getByName(window.theia.container, 'CommandRegistry').executeCommand('powerbrowser.orca.newTerminal'); return true; })()`);
        await s.lib.pollFor(async () => (await ev(`document.querySelector('[data-pb-orca-pane="terminal"] .xterm') ? true : false`)) === true, 30000, 'the hosted terminal widget');
        await ev(`(() => { ${harness_GET} __getByName(window.theia.container, 'CommandRegistry').executeCommand('powerbrowser.orca.newChat'); return true; })()`);
        await s.lib.pollFor(async () => (await ev(`document.querySelector('[data-pb-orca-pane="agent-session"] [data-pb-orca-pane-root] *') ? true : false`)) === true, 30000, 'the hosted chat widget');
        return JSON.parse(await ev(`(() => { const m = globalThis[Symbol.for(${J(MODULE_KEY)})]; window.PbPanes = m; let list = []; m.subscribePanes(l => { list = l; })();
            const r = list.filter(x => x.kind === 'terminal').pop(); return JSON.stringify({ kind: 'terminal', worktreeId: r.worktreeId, tabId: r.tabId, paneKey: r.paneKey }); })()`));
    };
    s.showTheiaPane = async () => { await s.lib.sleep(500); };
}


// ---------------------------------------------------------------- self-test

function selfTest() {
    let failed = 0;
    const ok = (name, cond) => { console.log(`  ${cond ? 'ok ' : 'NOT OK '} ${name}`); if (!cond) failed += 1; };
    const html = (o = {}) => ({ classesAdded: ['light'], propsAdded: ['--background'], readers: { classes: [], props: [] }, unreadable: 0, rules: 900, probe: { classDetected: true, propDetected: true }, ...o });
    const good = (o = {}) => ({ theia: { controlBaseline: 0, controlDelta: 1, changed: [], compared: 200 }, pane: { measured: true, changed: [], compared: 126, control: 'letter-spacing', controlDelta: 2 },
        portal: { measured: true, changed: [], compared: 72, theiaChanged: [], kinds: ['popper', 'dialog-content'] }, html: html(), ...o });
    const d = { key: 'button|color', before: 'a', after: 'b' };
    ok('control green', cssVerdict(good()) === null);
    ok('a changed Theia value is red', /1 Theia element property value\(s\) changed, first button\|color/.test(cssVerdict(good({ theia: { ...good().theia, changed: [d] } })) ?? ''));
    ok('a changed pane value is red', /1 pane value\(s\) differ/.test(cssVerdict(good({ pane: { ...good().pane, changed: [d] } })) ?? ''));
    ok('a Theia control that did not register is red', /Theia control: a planted Theia-side rule did not register/.test(cssVerdict(good({ theia: { ...good().theia, controlDelta: 0 } })) ?? ''));
    ok('a Theia control from a non-zero baseline is red', /baseline is not 0-diff/.test(cssVerdict(good({ theia: { ...good().theia, controlBaseline: 2 } })) ?? ''));
    ok('a pane control that did not register is red', /pane control/.test(cssVerdict(good({ pane: { ...good().pane, controlDelta: 0 } })) ?? ''));
    ok('measured:false is red, never a zero', /pane values not measured/.test(cssVerdict(good({ pane: { measured: false, changed: [], compared: 0, controlDelta: 0 } })) ?? ''));
    ok('an unmeasured portal probe is red', /portal probe not measured/.test(cssVerdict(good({ portal: { measured: false, changed: [], theiaChanged: [] } })) ?? ''));
    ok('a portal difference is red', /portal value/.test(cssVerdict(good({ portal: { ...good().portal, changed: [d] } })) ?? ''));
    ok('a Theia change while portals are open is red', /while Orca's portals were open/.test(cssVerdict(good({ portal: { ...good().portal, theiaChanged: [d] } })) ?? ''));
    ok('a Theia rule reading an added class is red', /reads a class Orca added to <html>: \.light \.x/.test(cssVerdict(good({ html: html({ readers: { classes: ['.light .x'], props: [] } }) })) ?? ''));
    ok('selector: a leading added class reads <html>', selectorReadsHtmlClass('.light .x', ['light'], ['light']) && selectorReadsHtmlClass('html.light > body .x', ['light'], ['light']) && selectorReadsHtmlClass('.a, :root.light.notranslate .y', ['light'], ['light', 'notranslate']));
    ok('selector: the class on another element is not a read of <html>', !selectorReadsHtmlClass('.colorpicker-header .picked-color.light', ['light'], ['light']) && !selectorReadsHtmlClass('.picked-color.light', ['light'], ['light']) && !selectorReadsHtmlClass('div.light', ['light'], ['light']));
    ok('a Theia rule reading an inline property is red', /reads an inline property/.test(cssVerdict(good({ html: html({ readers: { classes: [], props: ['.x { var(--background) }'] } }) })) ?? ''));
    ok('a non-custom inline property is red', /non-custom inline propert\(y\/ies\) on <html>: color-scheme/.test(cssVerdict(good({ html: html({ propsAdded: ['--background', 'color-scheme'] }) })) ?? ''));
    ok('a missing tooltip is red', /needs an Orca tooltip and an Orca dialog/.test(cssVerdict(good({ portal: { ...good().portal, kinds: ['slot-dialog-content'] } })) ?? ''));
    ok('the probe sheet not detected is red', /html clause blind/.test(cssVerdict(good({ html: html({ probe: { classDetected: true, propDetected: false } }) })) ?? ''));
    ok('an unreadable Theia sheet is red', /unreadable through CSSOM/.test(cssVerdict(good({ html: html({ unreadable: 1 }) })) ?? ''));
    ok('diffMaps counts additions and removals', diffMaps({ a: '1', b: '2' }, { a: '1', c: '3' }).length === 2);
    const child = spawnSync(process.execPath, ['--input-type=module', '-e', `await import(${J(SELF)})`], { encoding: 'utf8', timeout: 30000 });
    ok('importing the module prints and starts nothing', child.status === 0 && child.stdout === '' && child.stderr === '');
    console.log(failed ? `${NAME} self-test: FAIL -- ${failed} case(s)` : `${NAME} self-test: PASS -- every planted fault went red naming it`);
    return failed ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === SELF) {
    const args = process.argv.slice(2);
    if (args.some(a => a !== '--self-test')) { console.error('usage: node scripts/verify-orca-pane-css-live.mjs [--self-test]'); process.exit(2); }
    process.exit(args.includes('--self-test') ? selfTest() : await live());
}
