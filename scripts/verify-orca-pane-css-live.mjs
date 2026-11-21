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
//                first on the merged tree): PowerBrowser runs its own orcad; the frontend reloads
//                with the bridge folder's offer file set aside, so the loader has no hand-off (the
//                baseline: no Orca sheet, no Orca writes); the file is restored, the loader boots the
//                bundle, "New Orca Terminal" (powerbrowser.orca.newTerminal) opens a hosted terminal
//                beside a hosted chat ("New Orca Chat") and the measure runs on that OrcaPaneWidget. An app without orca-panes while the directory
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
//   - Side-panel probe (Phase 65, P65-08): the sidebar kind mounted through the entry into a host
//     carrying data-pb-orca-pane="sidebar" in the Theia document and on the standalone page; its
//     values compared (a planted host rule on the side mount must register first), Theia's values
//     while it is mounted, and Orca's tooltip on its Add-project button against the standalone page's.
//   - Add-project dialog probe (D-18): Orca's own Add-project button in that sidebar mount opens
//     Orca's dialog, which portals to document.body; its portal nodes against the standalone page's
//     (a planted rule on the dialog must register first), Theia's values and the side mount's values
//     while it is open. Both probes run after the Theia and pane controls registered.
//
// Tier: full (live). A row started without PB_LIVE_LOCK_HELD=1 takes <git common dir>/pb-live.lock
// itself (lib/live-lock-reexec.mjs) before anything is launched; every inherited ORCA_* is unset.
// --self-test quick (pure verdicts over fixtures). Exit 77 with one "SKIP -- <reason>" line when nothing
// is built (SKIP-PROTOCOL.md).
//
// Usage:
//   node scripts/verify-orca-pane-css-live.mjs
//   node scripts/verify-orca-pane-css-live.mjs --self-test

import { spawnSync } from 'node:child_process';
import { existsSync, renameSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { GET_BY_NAME as harness_GET } from './lib/pb-relaunch.mjs';
import { takeLiveLock } from './lib/live-lock-reexec.mjs';
import { SKIP_EXIT, skipLine } from './lib/skip-verdict.mjs';

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
/**
 * The fewest non-"absent" values the Theia snapshot may hold: the nine targets that always exist (the probe box's html,
 * body, button, input, a, h1, ul and p, and Theia's own shell element) carry every PROPS entry, and the scrollbar width
 * is one more. A snapshot that holds only "absent" markers for Theia's own elements measures far fewer.
 */
export const MIN_THEIA_KEYS = 9 * PROPS.length + 1;
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
 * One Phase 65 probe (side-panel or Add-project dialog). p: { measured, reason, controlDelta, theiaChanged,
 * paneChanged, portalChanged, compared, addPresent, portalCompared, portalKinds, portalControlDelta }. Returns null or
 * the failure naming the probe. Nothing compared is red: opts.tooltip (the side-panel probe) also needs the Add-project
 * button in both mounts, a tooltip portal ('popper') compared in both documents and a planted portal rule that
 * registered; opts.dialog needs at least one portal node compared (audit harness-live-panels-07).
 */
export function probeVerdict(name, p, { tooltip = false, dialog = false } = {}) {
    if (!p || p.measured === false) return `${name} probe not measured${p?.reason ? `: ${p.reason}` : ''}`;
    if (!(p.compared >= 1)) return `${name} probe: nothing was compared (${p.compared ?? 0} values)`;
    if (!(p.controlDelta >= 1)) return `${name} probe: its planted control did not register (the detector is blind)`;
    if (tooltip) {
        if (p.addPresent !== true) return `${name} probe: the Add-project button was not found in both mounts (its label may have changed), so its tooltip was never compared`;
        if (!(p.portalCompared >= 1) || !p.portalKinds?.includes('popper')) return `${name} probe: no tooltip portal was compared in both documents (portal ${p.portalCompared ?? 0} of 0, kinds [${(p.portalKinds ?? []).join(', ')}])`;
        if (!(p.portalControlDelta >= 1)) return `${name} probe: its planted portal rule did not register (the portal detector is blind)`;
    }
    if (dialog && !(p.portalCompared >= 1)) return `${name} probe: no portal node was compared in both documents`;
    if (p.theiaChanged.length) return `${name} probe: ${p.theiaChanged.length} Theia value(s) changed, first ${p.theiaChanged[0].key}: ${p.theiaChanged[0].before} -> ${p.theiaChanged[0].after}`;
    if (p.paneChanged.length) return `${name} probe: ${p.paneChanged.length} pane value(s) differ from the standalone page, first ${p.paneChanged[0].key}: ${p.paneChanged[0].before} -> ${p.paneChanged[0].after}`;
    if (p.portalChanged.length) return `${name} probe: ${p.portalChanged.length} portal value(s) differ from the standalone page, first ${p.portalChanged[0].key}`;
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
    if (!(t.measuredKeys >= MIN_THEIA_KEYS)) return `Theia snapshot blind: ${t.measuredKeys ?? 0} measured values, ${MIN_THEIA_KEYS} needed (Theia's own elements read "absent" in both snapshots, which compare equal)`;
    if (!p || p.measured === false) return `pane values not measured${p?.reason ? `: ${p.reason}` : ''}`;
    if (!(p.controlDelta >= 1)) return 'pane control: a planted host rule on the pane did not register (the detector is blind)';
    if (!q || q.measured === false) return `portal probe not measured${q?.reason ? `: ${q.reason}` : ''}`;
    if (!q.kinds?.includes('popper') || !q.kinds?.some(k => k !== 'popper')) return `portal probe not measured: needs an Orca tooltip and an Orca dialog, opened [${(q.kinds ?? []).join(', ')}]`;
    if (t.changed.length) return `${t.changed.length} Theia element property value(s) changed, first ${t.changed[0].key}: ${t.changed[0].before} -> ${t.changed[0].after}`;
    if (p.changed.length) return `${p.changed.length} pane value(s) differ from the standalone page, first ${p.changed[0].key}: ${p.changed[0].before} -> ${p.changed[0].after}`;
    if (q.changed.length) return `${q.changed.length} portal value(s) differ from the standalone page, first ${q.changed[0].key}`;
    if (q.theiaChanged.length) return `${q.theiaChanged.length} Theia value(s) changed while Orca's portals were open, first ${q.theiaChanged[0].key}`;
    return probeVerdict('side-panel', obs.side, { tooltip: true }) ?? probeVerdict('Add-project dialog', obs.addProject, { dialog: true }) ?? htmlVerdict(obs.html);
}

/**
 * The side-panel probe's tooltip half from the collected maps (pure; the self-test feeds it fixtures). inTheia and
 * reference: __pbSideStyles of the two mounts, where a missing Add-project button records 'side-add|present: absent'.
 * tips: { theia, standalone, planted } portal style maps of the open tooltip, `planted` being the Theia document with a
 * planted rule on the portal. Returns { addPresent, portalChanged, portalCompared, portalKinds, portalControlDelta }.
 */
export function tooltipObservation({ inTheia, reference, tips }) {
    const addPresent = !('side-add|present' in (inTheia ?? {})) && !('side-add|present' in (reference ?? {}));
    const keys = Object.keys(tips.standalone ?? {}).filter(k => k in (tips.theia ?? {}) && !k.endsWith('|present'));
    const only = m => Object.fromEntries(keys.map(k => [k, m?.[k]]));
    const portalChanged = diffMaps(only(tips.standalone), only(tips.theia));
    return {
        addPresent, portalChanged, portalCompared: keys.length,
        portalKinds: [...new Set(keys.map(k => k.split('|')[0].replace(/>text$/, '')))],
        portalControlDelta: tips.planted ? diffMaps(only(tips.standalone), only(tips.planted)).length - portalChanged.length : 0,
    };
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
    window.__pbSideStyles = scope => { const root = scope && scope.querySelector('[data-pb-orca-pane-root]'); if (!root) return null;
        const add = root.querySelector('button[aria-label="Add project"]');
        const leaf = [...root.querySelectorAll('*')].find(e => e.childElementCount === 0 && (e.textContent || '').trim() && e.getBoundingClientRect().width > 0);
        return window.__pbStyles({ 'side-root': root, 'side-body': root.firstElementChild, 'side-add': add, 'side-add-icon': add && add.querySelector('svg'), 'side-text': leaf }); };
    window.__pbPortalStyles = onlyNew => { const nodes = [...document.body.children].filter(e => (e.hasAttribute('data-radix-popper-content-wrapper') || e.hasAttribute('data-slot')) && !(onlyNew && e.hasAttribute('data-pb-pre')));
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
    obs.theia = { controlBaseline: diffMaps(base0, base1).length, controlDelta: diffMaps(base0, planted).length, compared: Object.keys(base0).length,
        measuredKeys: Object.keys(base0).filter(k => !k.endsWith('|present')).length };
    const html0 = JSON.parse(await ev('JSON.stringify(window.__pbHtmlState())'));

    const pick = await s.mountInTheia();
    await lib.sleep(2500);
    const theiaAfter = JSON.parse(await ev('JSON.stringify(window.__pbTheiaSnapshot())'));
    obs.theia.changed = diffMaps(base0, theiaAfter);
    const html1 = JSON.parse(await ev('JSON.stringify(window.__pbHtmlState())'));
    const inTheia = JSON.parse(await ev(`JSON.stringify(window.__pbPaneStyles(document.querySelector('[data-pb-orca-pane="terminal"]:has(.xterm)')))`));

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
        const plantedPane = JSON.parse(await ev(`JSON.stringify(window.__pbPaneStyles(document.querySelector('[data-pb-orca-pane="terminal"]:has(.xterm)')))`));
        await ev(`(() => { document.getElementById('pb-css-pane-control').remove(); return true; })()`);
        obs.pane = { measured: true, changed, compared: Object.keys(reference).length, control: control[0], controlDelta: diffMaps(reference, plantedPane).length - changed.length };
    }

    // Portal probe: an Orca tooltip and an Orca dialog, opened in both documents.
    obs.portal = await portalProbe(s, ref, pick, refPick, base0);

    // Phase 65: the side-panel and Add-project dialog probes, after both controls above registered.
    Object.assign(obs, await sideProbes(s, ref, base0));

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
/** The same focus-opened Radix tooltip, on one trigger element. */
const OPEN_TOOLTIP_ON = sel => `(() => { const t = document.querySelector(${J(sel)}); if (!t) return false; t.focus(); t.dispatchEvent(new FocusEvent('focusin', { bubbles: true })); t.dispatchEvent(new FocusEvent('focus')); return true; })()`;
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
        if (!opened && process.env.PB_ORCA_PANE_DEBUG === '1') console.log(`debug: ${label} tooltip scope ${await evx(`(() => { const sc = document.querySelector(${J(scope)}); if (!sc) return 'no scope'; const r = sc.getBoundingClientRect();
            return JSON.stringify({ scope: [r.width, r.height], triggers: [...sc.querySelectorAll('[data-slot="tooltip-trigger"]')].map(e => e.getBoundingClientRect().width), slots: [...new Set([...sc.querySelectorAll('[data-slot]')].map(e => e.getAttribute('data-slot')))].slice(0, 30), text: sc.innerText.slice(0, 200) }); })()`)}`);
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

/** Mounts the sidebar kind in both documents, then opens Orca's Add-project dialog from each mount. */
async function sideProbes(s, ref, base0) {
    const { app, lib } = s;
    const ev = expr => app.evaluate(expr), evRef = expr => s.evalIn(ref, expr);
    const side = { measured: false, theiaChanged: [], paneChanged: [], portalChanged: [], compared: 0 };
    const add = { measured: false, theiaChanged: [], paneChanged: [], portalChanged: [], compared: 0 };
    const pick = { kind: 'sidebar', worktreeId: '', tabId: '', paneKey: null };
    const scope = { theia: '#pb-css-side', standalone: '#pb-host-css-side' };
    await ev(`(() => { const host = document.createElement('div'); host.id = 'pb-css-side'; host.setAttribute('data-pb-orca-pane', 'sidebar');
        host.style.cssText = 'position:fixed;left:0;top:0;width:320px;height:640px;display:flex;overflow:hidden;z-index:2147483000';
        const root = document.createElement('div'); root.style.cssText = 'display:flex;flex:1;min-width:0;min-height:0'; host.appendChild(root); document.body.appendChild(host);
        window.__pbSideUnmount = window.PbPanes.mountPane(root, ${J(pick)}); return true; })()`);
    await evRef(`(() => { const root = window.__pbHost('sidebar', 'css-side', [0, 620, 320, 640]); window.__pbSideUnmount = window.PbPanes.mountPane(root, ${J(pick)}); return true; })()`);
    const addReady = async (evx, sel) => evx(`!!document.querySelector(${J(sel + ' button[aria-label="Add project"]')})`);
    try { await lib.pollFor(async () => (await addReady(ev, scope.theia)) && (await addReady(evRef, scope.standalone)), 30000, "the sidebar mounts' Add-project buttons"); } catch { /* measured below */ }
    await lib.sleep(1500);
    const styles = async (evx, sel) => JSON.parse(await evx(`JSON.stringify(window.__pbSideStyles(document.querySelector(${J(sel)})))`));
    const inTheia = await styles(ev, scope.theia), reference = await styles(evRef, scope.standalone);
    if (!inTheia || !reference) {
        side.reason = !inTheia ? 'no sidebar mount in the Theia document' : 'no sidebar mount on the standalone page';
        add.reason = 'no sidebar mount to open it from';
    } else {
        side.measured = true;
        side.paneChanged = diffMaps(reference, inTheia);
        side.compared = Object.keys(reference).length;
        side.theiaChanged = diffMaps(base0, JSON.parse(await ev('JSON.stringify(window.__pbTheiaSnapshot())')));
        await ev(`(() => { const st = document.createElement('style'); st.id = 'pb-css-side-control'; st.textContent = '#pb-css-side [data-pb-orca-pane-root] { letter-spacing: 3px !important }'; document.head.appendChild(st); return true; })()`);
        side.controlDelta = diffMaps(reference, await styles(ev, scope.theia)).length - side.paneChanged.length;
        await ev(`(() => { document.getElementById('pb-css-side-control').remove(); return true; })()`);
        // Orca's tooltip on the Add-project button, in both documents.
        const tips = {};
        for (const [label, evx, sel] of [['theia', ev, scope.theia], ['standalone', evRef, scope.standalone]]) {
            await evx(OPEN_TOOLTIP_ON(`${sel} button[aria-label="Add project"]`));
            try { await lib.pollFor(async () => JSON.parse(await evx(`JSON.stringify(${PORTALS_OPEN})`)).includes('popper'), 5000, `${label} side tooltip`); } catch { /* recorded */ }
            tips[label] = JSON.parse(await evx('JSON.stringify(window.__pbPortalStyles())'));
            if (label === 'theia') {
                // Control: a planted rule on the open tooltip's portal must register against the standalone page's values.
                await evx(`(() => { const st = document.createElement('style'); st.id = 'pb-css-tip-control'; st.textContent = 'body > [data-radix-popper-content-wrapper], body > [data-radix-popper-content-wrapper] * { letter-spacing: 3px !important }'; document.head.appendChild(st); return true; })()`);
                tips.planted = JSON.parse(await evx('JSON.stringify(window.__pbPortalStyles())'));
                await evx(`(() => { document.getElementById('pb-css-tip-control').remove(); return true; })()`);
            }
            await evx(CLOSE_TOOLTIP);
        }
        Object.assign(side, tooltipObservation({ inTheia, reference, tips }));
        await lib.sleep(800);

        // Add-project dialog: Orca's own trigger in each sidebar mount. Only portal nodes that appear after the click
        // are measured (an earlier probe's dialog may still be open in a document).
        const open = {};
        const NEW_DIALOG = `[...document.body.children].some(e => e.hasAttribute('data-slot') && !e.hasAttribute('data-pb-pre'))`;
        for (const [label, evx, sel] of [['theia', ev, scope.theia], ['standalone', evRef, scope.standalone]]) {
            await evx(`(() => { for (const e of document.body.children) e.setAttribute('data-pb-pre', ''); const b = document.querySelector(${J(sel + ' button[aria-label="Add project"]')}); if (b) b.click(); return !!b; })()`);
            try { await lib.pollFor(async () => (await evx(NEW_DIALOG)) === true, 10000, `${label} Add-project dialog`); } catch { /* recorded */ }
            await lib.sleep(800);
            open[label] = JSON.parse(await evx('JSON.stringify(window.__pbPortalStyles(true))'));
        }
        const keys = Object.keys(open.standalone).filter(k => k in open.theia && !k.endsWith('|present') && !k.startsWith('popper'));
        add.kinds = [...new Set(keys.map(k => k.split('|')[0].replace(/>text$/, '')))];
        if (!keys.length) add.reason = `Orca's Add-project dialog opened in neither or one document (theia [${Object.keys(open.theia).map(k => k.split('|')[0]).filter((v, i, a) => a.indexOf(v) === i).join(', ')}], standalone [${Object.keys(open.standalone).map(k => k.split('|')[0]).filter((v, i, a) => a.indexOf(v) === i).join(', ')}])`;
        else {
            add.measured = true;
            add.compared = Object.keys(reference).length;
            add.portalCompared = keys.length;
            if (process.env.PB_ORCA_PANE_DEBUG === '1') for (const [label, evx] of [['theia', ev], ['standalone', evRef]]) console.log(`debug: ${label} dialog leaf ${await evx(`(() => { const n = [...document.body.children].find(e => e.getAttribute('data-slot') === 'dialog-content' && !e.hasAttribute('data-pb-pre')); const t = n && [...n.querySelectorAll('*')].find(e => e.childElementCount === 0 && (e.textContent || '').trim()); return t ? t.tagName + '.' + String(t.className).slice(0, 80) + ' :: ' + t.textContent.trim().slice(0, 60) : 'none'; })()`)}`);
            add.portalChanged = diffMaps(Object.fromEntries(keys.map(k => [k, open.standalone[k]])), Object.fromEntries(keys.map(k => [k, open.theia[k]])));
            add.theiaChanged = diffMaps(base0, JSON.parse(await ev('JSON.stringify(window.__pbTheiaSnapshot())')));
            add.paneChanged = diffMaps(reference, await styles(ev, scope.theia));
            if (process.env.PB_ORCA_PANE_DEBUG === '1') console.log(`debug: add-project portal changed ${J(add.portalChanged)}`);
            await ev(`(() => { const st = document.createElement('style'); st.id = 'pb-css-add-control'; st.textContent = 'body > [data-slot="dialog-content"], body > [data-slot="dialog-content"] * { letter-spacing: 3px !important }'; document.head.appendChild(st); return true; })()`);
            const planted = JSON.parse(await ev('JSON.stringify(window.__pbPortalStyles(true))'));
            await ev(`(() => { document.getElementById('pb-css-add-control').remove(); return true; })()`);
            add.controlDelta = diffMaps(Object.fromEntries(keys.map(k => [k, open.standalone[k]])), Object.fromEntries(keys.map(k => [k, planted[k]]))).length - add.portalChanged.length;
        }
        for (const evx of [ev, evRef]) await evx(`(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); for (const e of document.querySelectorAll('[data-pb-pre]')) e.removeAttribute('data-pb-pre'); return true; })()`);
    }
    for (const evx of [ev, evRef]) await evx('(() => { try { window.__pbSideUnmount && window.__pbSideUnmount(); } catch (e) {} return true; })()');
    await ev(`(() => { document.getElementById('pb-css-side')?.remove(); return true; })()`);
    return { side, addProject: add };
}

async function live() {
    const harness = await import('./lib/orca-pane-harness.mjs');
    const skips = harness.skipReasons();
    if (skips.length) { console.log(skipLine(NAME, skips.join('; '))); return SKIP_EXIT; }
    // Nothing is built or launched before this: a row started by hand takes the live lock itself (harness-live-panels-02).
    const held = takeLiveLock(import.meta.url, NAME);
    if (held !== null) return held;
    if (!existsSync(join(harness.STANDALONE_DIR, 'pb-panes.js'))) {
        const b = spawnSync('bash', [join(REPO_ROOT, 'scripts', 'build-orca-panes.sh'), '--standalone'], { encoding: 'utf8' });
        if (b.status !== 0) { console.log(`${NAME}: FAIL -- harness: build-orca-panes.sh --standalone: ${(b.stdout ?? '').trim().split('\n').pop()}`); return 1; }
    }
    const mode = existsSync(ORCA_PANES_EXT) ? 'real-widget' : 'lane-build';
    const { pollFor } = await import('./lib/pb-live-probe.mjs');
    let obs = null, harnessError = null;
    try {
        await harness.withOrcaPaneSession({ log: line => console.log(line), pbOrcad: mode === 'real-widget' }, async s => {
            s.lib = { pollFor, sleep: harness.sleep };
            s.mode = mode;
            const ev = expr => s.app.evaluate(expr);
            try {
                if (mode === 'lane-build') await laneBuildSetup(s, ev, harness);
                else await realWidgetSetup(s, ev, harness);
                obs = await measure(s, mode);
            } finally {
                s.restoreOffer?.();
            }
        });
    } catch (error) {
        harnessError = String(error?.message ?? error).slice(0, 500);
    }
    if (harnessError) { console.log(`${NAME}: FAIL -- harness: ${harnessError}`); return 1; }
    const verdict = cssVerdict(obs);
    if (process.env.PB_ORCA_PANE_DEBUG === '1') console.log(`debug: ${J({ pane: obs.pane?.changed?.slice(0, 60), portal: obs.portal?.changed?.slice(0, 40), opened: obs.portal?.opened })}`);
    const t = obs.theia, p = obs.pane, q = obs.portal, h = obs.html;
    console.log(`${NAME}: measured -- Theia ${t.changed.length} of ${t.compared} changed (control ${t.controlDelta} from a ${t.controlBaseline}-diff baseline); pane ${p.measured === false ? 'not measured' : `${p.changed.length} of ${p.compared} changed (control ${p.control} ${p.controlDelta})`}; portal ${q.measured ? `${q.changed.length} of ${q.compared} changed [${q.kinds.join(', ')}], Theia while open ${q.theiaChanged.length}` : `not measured (${q.reason})`}; tooltip/dialog opened ${J(q.opened ?? {}).length > 2 ? Object.entries(q.opened).map(([k, v]) => `${k}=${(v.portals ?? []).length}`).join(' ') : 'none'}; html classes added [${h.classesAdded.join(' ')}] (now [${h.classesNow.join(' ')}], ${h.propsNow} inline), ${h.propsAdded.length} inline propert(y/ies) added or changed [${h.propsAdded.slice(0, 8).join(' ')}] (${h.propsAdded.filter(n => !n.startsWith('--')).length} non-custom), readers ${h.readers.classes.length + h.readers.props.length} over ${h.rules} rule(s), probe ${h.probe.classDetected}/${h.probe.propDetected}`);
    const probeLine = (name, p) => !p ? `${name} not reached` : p.measured === false ? `${name} not measured (${p.reason})`
        : `${name}: Theia ${p.theiaChanged.length}, pane ${p.paneChanged.length} of ${p.compared}, portal ${p.portalChanged.length}${p.portalCompared !== undefined ? ` of ${p.portalCompared}` : ''} changed (control ${p.controlDelta})${p.kinds ? ` [${p.kinds.join(', ')}]` : ''}`;
    console.log(`${NAME}: probes -- ${probeLine('side-panel', obs.side)}; ${probeLine('Add-project dialog', obs.addProject)}`);
    if (verdict) { console.log(`${NAME}: FAIL -- ${mode} mode: ${verdict}`); return 1; }
    console.log(`${NAME}: PASS -- ${mode} mode; Theia 0 of ${t.compared} and pane 0 of ${p.compared} values changed with both controls registered; portal probe 0 of ${q.compared}; Orca's <html> writes (${h.classesAdded.length} class(es), ${h.propsAdded.length} custom propert(y/ies)) read by no Theia rule; side-panel and Add-project dialog probes 0 changed with their controls registered`);
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

/** Real-widget mode: the merged tree's orca-panes on PowerBrowser's orcad, its baseline load without a hand-off. */
async function realWidgetSetup(s, ev, harness) {
    const { app } = s;
    const hasCommand = async () => ev(`(() => { ${harness_GET} try { return !!__getByName(window.theia.container, 'CommandRegistry').getCommand('powerbrowser.orca.newTerminal'); } catch (e) { return false; } })()`);
    if (!(await hasCommand())) throw new Error('theia/extensions/orca-panes exists but the app has no powerbrowser.orca.newTerminal (not built into this frontend; never a lane-build fallback)');
    // The widgets pair with PowerBrowser's own orcad (C5 hand-off); the throwaway repo is registered there.
    // One CLI terminal there first: the Orca commands act on the active worktree, else the first worktree
    // of the pane list, so a fresh orcad with no pane gives them none (a lane p64-02 owner item).
    const pb = await s.startPbOrcad();
    s.pbOrca('terminal', 'create', '--worktree', `path:${s.repoDir}`);
    // The standalone reference runs on the harness orcad: one CLI terminal there, made before any mount.
    const created = s.orca('terminal', 'create', '--worktree', `path:${s.repoDir}`);
    s.terminalHandle = /"(term_[A-Za-z0-9_-]+)"/.exec(J(created))?.[1];
    s.typeInTheiaPane = async text => {
        const href = await ev('location.href');
        const theiaCtx = (await harness.allContexts(app)).find(c => c.top && c.url === href)?.context;
        const focused = await ev(`(() => { const t = document.querySelector('[data-pb-orca-pane="terminal"] .xterm-helper-textarea'); if (!t) return false; t.focus(); return document.activeElement === t; })()`);
        if (theiaCtx && focused) await s.typeIn(theiaCtx, text);
    };
    // The baseline load: the offer file (C5) is set aside inside the 0700 bridge folder, so the loader's
    // hand-off stays undefined and the reloaded document loads no Orca sheet and makes no Orca writes.
    // (A BiDi intercept cannot hold it: a held stylesheet request stays pending across the reload and the
    // client cannot release it, so the mounted pane ran unstyled.) s.restoreOffer always runs.
    const { ORCA_WEB_PAIRING_FILE } = await import('../powerbrowser/shell/OrcaEnv.sys.mjs');
    const offerFile = join(pb.bridgeDir, ORCA_WEB_PAIRING_FILE), heldFile = `${offerFile}.css-live-held`;
    renameSync(offerFile, heldFile);
    s.restoreOffer = () => { if (existsSync(heldFile)) renameSync(heldFile, offerFile); };
    await ev('(() => { setTimeout(() => location.reload(), 0); return true; })()');
    await s.lib.sleep(3000);
    await s.lib.pollFor(async () => ev(`(() => { ${harness_GET} try { return __getByName(window.theia.container, 'FrontendApplicationStateService').state === 'ready'; } catch (e) { return false; } })()`), 120000, 'the baseline frontend');
    await s.lib.sleep(6000); // past the loader's longest hand-off backoff
    if ((await ev(`!!document.querySelector('link[href*="/orca-panes/"]') || !!globalThis[Symbol.for(${J(MODULE_KEY)})]`)) !== false) throw new Error('the baseline document already holds the Orca bundle');
    s.realBaseline = true;
    let shown = [];
    s.mountInTheia = async () => {
        s.restoreOffer();
        await ev(HELPERS);
        await s.lib.pollFor(async () => ev(`!!globalThis[Symbol.for(${J(MODULE_KEY)})] && globalThis[Symbol.for(${J(MODULE_KEY)})].state().booted`), 60000, 'the orca-panes bundle to boot');
        // The seed terminal listed first; its widget stays unshown, and the measured pane is the one holding an xterm.
        await s.lib.pollFor(async () => ev(`(() => { let n = 0; globalThis[Symbol.for(${J(MODULE_KEY)})].subscribePanes(l => { n = l.filter(r => r.kind === 'terminal').length; })(); return n > 0; })()`), 30000, 'the seed terminal record');
        // 64-06 (P64-37): with no active Orca worktree the commands ask through a quick pick; select Orca's first
        // worktree through the store's own action (P64-23) so they act on it, as orca-tabs-live stage (a) proves the pick.
        await ev(`(() => { const m = globalThis[Symbol.for(${J(MODULE_KEY)})]; const w = m.state().worktrees[0]; if (w && !m.activeWorktree()) m.setActiveWorktree(w.id); return true; })()`);
        await ev(`(() => { ${harness_GET} __getByName(window.theia.container, 'CommandRegistry').executeCommand('powerbrowser.orca.newTerminal'); return true; })()`);
        await s.lib.pollFor(async () => (await ev(`document.querySelector('[data-pb-orca-pane="terminal"] .xterm') ? true : false`)) === true, 30000, 'the hosted terminal widget');
        await ev(`(() => { ${harness_GET} __getByName(window.theia.container, 'CommandRegistry').executeCommand('powerbrowser.orca.newChat'); return true; })()`);
        await s.lib.pollFor(async () => (await ev(`document.querySelector('[data-pb-orca-pane="agent-session"] [data-pb-orca-pane-root] *') ? true : false`)) === true, 30000, 'the hosted chat widget');
        // Both measured panes visible at once, as in lane-build mode: the chat docked split-right of the terminal.
        const docked = await ev(`(async () => { ${harness_GET} const shell = __getByName(window.theia.container, 'ApplicationShell'); const main = shell.getWidgets('main');
            const t = main.find(w => w.node.matches('[data-pb-orca-pane="terminal"]') && w.node.querySelector('.xterm')); const c = main.find(w => w.node.matches('[data-pb-orca-pane="agent-session"]'));
            if (!t || !c) return 'missing'; await shell.addWidget(c, { area: 'main', mode: 'split-right', ref: t }); await shell.activateWidget(t.id); return !t.isHidden && !c.isHidden ? JSON.stringify([t.id, c.id]) : 'hidden'; })()`);
        if (!docked.startsWith('[')) throw new Error(`the hosted terminal and chat widgets could not be shown side by side (${docked})`);
        shown = JSON.parse(docked);
        await s.lib.sleep(1500);
        return JSON.parse(await ev(`(() => { const m = globalThis[Symbol.for(${J(MODULE_KEY)})]; window.PbPanes = m; let list = []; m.subscribePanes(l => { list = l; })();
            const r = list.filter(x => x.kind === 'terminal').pop(); return JSON.stringify({ kind: 'terminal', worktreeId: r.worktreeId, tabId: r.tabId, paneKey: r.paneKey }); })()`));
    };
    // As in lane-build mode: the reference web tab may take a main-area tab bar, so both are re-activated.
    s.showTheiaPane = async () => { await ev(`(async () => { ${harness_GET} const shell = __getByName(window.theia.container, 'ApplicationShell'); for (const id of ${J(shown)}) await shell.activateWidget(id); return true; })()`); await s.lib.sleep(1500); };
}


// ---------------------------------------------------------------- self-test

function selfTest() {
    let failed = 0;
    const ok = (name, cond) => { console.log(`  ${cond ? 'ok ' : 'NOT OK '} ${name}`); if (!cond) failed += 1; };
    const html = (o = {}) => ({ classesAdded: ['light'], propsAdded: ['--background'], readers: { classes: [], props: [] }, unreadable: 0, rules: 900, probe: { classDetected: true, propDetected: true }, ...o });
    const probe = (o = {}) => ({ measured: true, controlDelta: 2, theiaChanged: [], paneChanged: [], portalChanged: [], compared: 25, ...o });
    const sideProbe = (o = {}) => probe({ addPresent: true, portalCompared: 12, portalKinds: ['popper', 'popper>text'].map(k => k.replace(/>text$/, '')), portalControlDelta: 2, ...o });
    const good = (o = {}) => ({ theia: { controlBaseline: 0, controlDelta: 1, changed: [], compared: 200, measuredKeys: 200 }, pane: { measured: true, changed: [], compared: 126, control: 'letter-spacing', controlDelta: 2 },
        portal: { measured: true, changed: [], compared: 72, theiaChanged: [], kinds: ['popper', 'dialog-content'] }, side: sideProbe(), addProject: probe({ portalCompared: 8 }), html: html(), ...o });
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
    ok('side-panel: a changed Theia value is red naming the probe', /^side-panel probe: 1 Theia value/.test(cssVerdict(good({ side: sideProbe({ theiaChanged: [d] }) })) ?? ''));
    ok('side-panel: a changed pane value is red naming the probe', /^side-panel probe: 1 pane value/.test(cssVerdict(good({ side: sideProbe({ paneChanged: [d] }) })) ?? ''));
    ok('side-panel: a changed tooltip portal value is red naming the probe', /^side-panel probe: 1 portal value/.test(cssVerdict(good({ side: sideProbe({ portalChanged: [d] }) })) ?? ''));
    ok('side-panel: a control that did not register is red naming the probe', /^side-panel probe: its planted control did not register/.test(cssVerdict(good({ side: sideProbe({ controlDelta: 0 }) })) ?? ''));
    // harness-live-panels-07: a probe that compared nothing is red. The Add-project label changing records 'absent' in both
    // mounts, the tooltip never opens, and the pre-fix verdict printed PASS with 'portal 0 of 0'.
    ok('side-panel: nothing compared is red', /^side-panel probe: nothing was compared/.test(cssVerdict(good({ side: sideProbe({ compared: 0 }) })) ?? ''));
    ok('side-panel: the Add-project button missing is red', /^side-panel probe: the Add-project button was not found/.test(cssVerdict(good({ side: sideProbe({ addPresent: false }) })) ?? ''));
    ok('side-panel: portal 0 of 0 is red', /^side-panel probe: no tooltip portal was compared in both documents \(portal 0 of 0/.test(cssVerdict(good({ side: sideProbe({ portalCompared: 0, portalKinds: [] }) })) ?? ''));
    ok('side-panel: portal values without a tooltip popper are red', /^side-panel probe: no tooltip portal was compared/.test(cssVerdict(good({ side: sideProbe({ portalKinds: ['slot-dialog-content'] }) })) ?? ''));
    ok('side-panel: a planted portal rule that did not register is red', /^side-panel probe: its planted portal rule did not register/.test(cssVerdict(good({ side: sideProbe({ portalControlDelta: 0 }) })) ?? ''));
    ok('Add-project dialog: no portal node compared is red', /^Add-project dialog probe: no portal node was compared/.test(cssVerdict(good({ addProject: probe({ portalCompared: 0 }) })) ?? ''));
    ok('a Theia snapshot of "absent" markers is blind', /^Theia snapshot blind: 40 measured values/.test(cssVerdict(good({ theia: { ...good().theia, measuredKeys: 40 } })) ?? ''));
    ok('a Theia snapshot at the minimum is not blind', cssVerdict(good({ theia: { ...good().theia, measuredKeys: MIN_THEIA_KEYS } })) === null);
    {
        // The collector's tooltip half over fixtures: a missing button and an unopened tooltip must read as nothing compared.
        const styles = { 'side-root|color': 'x', 'side-add|color': 'y' };
        const open = { 'popper|letter-spacing': 'normal', 'popper>text|letter-spacing': 'normal' };
        const live = tooltipObservation({ inTheia: styles, reference: styles, tips: { theia: open, standalone: open, planted: { 'popper|letter-spacing': '3px', 'popper>text|letter-spacing': '3px' } } });
        ok('collector: a present button and an opened tooltip read as compared, kinds popper, control registered', live.addPresent && live.portalCompared === 2 && live.portalKinds.join() === 'popper' && live.portalControlDelta === 2);
        const noButton = tooltipObservation({ inTheia: { ...styles, 'side-add|present': 'absent' }, reference: { ...styles, 'side-add|present': 'absent' }, tips: { theia: {}, standalone: {}, planted: {} } });
        ok('collector: Add-project absent in both mounts and no tooltip reads as 0 of 0, not present', noButton.addPresent === false && noButton.portalCompared === 0 && noButton.portalKinds.length === 0);
        ok('collector fixture: that observation goes red through the verdict', /^side-panel probe: the Add-project button was not found/.test(cssVerdict(good({ side: sideProbe(noButton) })) ?? ''));
    }
    ok('side-panel: not measured is red', /^side-panel probe not measured: no sidebar/.test(cssVerdict(good({ side: { measured: false, reason: 'no sidebar mount in the Theia document' } })) ?? ''));
    ok('Add-project dialog: a changed portal value is red naming the probe', /^Add-project dialog probe: 1 portal value/.test(cssVerdict(good({ addProject: probe({ portalCompared: 8, portalChanged: [d] }) })) ?? ''));
    ok('Add-project dialog: a changed Theia value while open is red', /^Add-project dialog probe: 1 Theia value/.test(cssVerdict(good({ addProject: probe({ portalCompared: 8, theiaChanged: [d] }) })) ?? ''));
    ok('Add-project dialog: a control that did not register is red naming the probe', /^Add-project dialog probe: its planted control did not register/.test(cssVerdict(good({ addProject: probe({ portalCompared: 8, controlDelta: 0 }) })) ?? ''));
    ok('Add-project dialog: not reached is red', /^Add-project dialog probe not measured/.test(cssVerdict(good({ addProject: undefined })) ?? ''));
    ok('the probes are judged only after the Theia control registered', /^Theia control/.test(cssVerdict(good({ theia: { ...good().theia, controlDelta: 0 }, side: sideProbe({ paneChanged: [d] }) })) ?? ''));
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
