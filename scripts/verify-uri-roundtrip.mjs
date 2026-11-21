#!/usr/bin/env node
// scripts/verify-uri-roundtrip.mjs
//
// URI-01 through URI-04's round-trip proof: table-driven, transcribed from
// 02-RESEARCH.md §4's FactoryId table (NOT from 02-CONTEXT.md D-43, which
// carries five wrong strings and omits one shipped widget -- see the
// per-row corrections marked below).
//
// Per D-53, each row asserts the STATE round-trips, not merely that a
// widget appeared:
//   (a) registry.uriOf(widget).toString(true) === the input URI string
//   (b) widgetManager.getWidgets(factoryId).length === 1
// (b) is the check that catches D-46's `options: {}` fork -- the in-tree
// failure mode is a URI-triggered open passing `{}` where the native/menu
// path passes nothing, silently creating a second, identically-labelled
// widget.
//
// It is expected to fail wholesale until Plan 06 (view:/settings:) and
// Plan 07 (terminal:, the remaining reverse lookups) land -- a red script
// written first, against a registry that does not exist yet, is the
// deliverable Wave 0 asks for.
//
// -- Reflection note (unavoidable given D-69's constraint) --
// This script cannot `import` `@theia/core`'s `URI` class -- BiDi
// `script.evaluate` runs as a bare expression string in the page's own
// realm, with no module resolution for a bare specifier, and the class is
// not registered under any DI identifier this script could reach by
// reference. Two reflection tricks work around that, both documented here
// so a future reader does not have to rediscover them:
//   1. DI services (OpenerService, WidgetManager, and the eventual
//      TabUriRegistry) are resolved by walking Inversify's *internal*
//      `container._bindingDictionary` and matching each bound identifier's
//      `.toString()`/`.name` against the service's well-known name --
//      because the identifier VALUES (a bare `Symbol('OpenerService')`, a
//      class reference) are themselves unreachable from this external
//      context, same root cause as D-64/§6's `Symbol.for` requirement, just
//      without a `Symbol.for` escape hatch on core's own services. Pinned
//      against inversify 6.2.2 (theia/node_modules/inversify); a future
//      inversify bump renaming `_bindingDictionary` breaks this file first,
//      not the feature it tests.
//   2. The URI value passed to `OpenerService.open()` is a minimal
//      URI-compatible object (`scheme`, `path.toString()/.base/.ext`,
//      `toString(skipEncoding)`), not a real `@theia/core` `URI` instance --
//      constructed to the exact opaque `scheme:path` form D-39 through D-42
//      specify. `DefaultOpenerService.open()` itself never inspects the uri
//      argument (confirmed: it forwards it untouched to each handler's
//      `canHandle`/`open`), so this holds as long as no handler does an
//      `instanceof URI` check -- none of the in-tree handlers read do, and
//      the view/settings/terminal handlers this phase adds must not either
//      or this script needs updating alongside them.
//
// D-46's "menu-then-URI" full coverage (real command IDs per row) is Plan
// 06 Task 3's job (02-06-PLAN.md: "drive each [row] to green" against a
// running app, including installing a real plugin for the
// plugin-view-container path). This script's Wave-0 approximation of the
// "native path" half of that check is `getOrCreateWidget(factoryId,
// undefined)` -- the same call `AbstractViewContribution.openView()`
// ultimately makes with no caller-supplied options -- which already
// exercises D-46's exact concern (an `options: {}` URI path forking a
// second widget) without needing a per-row command-id table this research
// does not provide.
//
// Usage:
//   node scripts/verify-uri-roundtrip.mjs [--scheme <view|settings|terminal|pb-orca>]
//   node scripts/verify-uri-roundtrip.mjs --help
//
// Phase 64 (TAB-02 criterion 5; P64-16, P64-27, P64-35; interfaces C7, C9):
// the pb-orca rows. pb-orca: before any hosted Orca tab exists opens nothing;
// New Orca Terminal (powerbrowser.orca.newTerminal, found through the
// CommandRegistry by name) gives one hosted widget; pb-orca:<its name> through
// the OpenerService round-trips under D-53 (a) and (b); pb-orca: then focuses
// that widget and creates nothing; pb-orca:<word>99 opens and creates nothing.
// The rows SKIP (exit 77), named, only while the built orca/ or the pane
// bundle is absent. theia/extensions/orca-panes is tracked, so its absence is
// red (source moved), as are a bundle that does not boot within 90 s with a
// built tree and orca-panes present with the scheme unhandled.
//
// Phase 65 (P65-10, P65-27; interfaces N-1): the seven Orca page tabs
// (ORCA_PAGE_ROWS). Each pb-orca:<view> opened twice through the OpenerService
// round-trips (uriOf(widget).toString(true) equals the input) with exactly one
// widget of that name in the factory. pb-orca:creating is not a row: it exists
// only while an Orca worktree creation is pending.
//
// Reads the shell's own supervised frontend; takes no URL argument (WINDOWS
// 14 -- a URL would open a redundant stock window beside the shell).
//
// No import/require of any package name -- only Node built-ins and
// scripts/lib/firefox-bidi.mjs (D-69).

import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { withFirefoxPage } from './lib/firefox-bidi.mjs';
import { SKIP_EXIT, skipLine, verdictExit } from './lib/skip-verdict.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'verify-uri-roundtrip';
// What supplies the pb-orca rows' inputs, ending every SKIP reason (SKIP-PROTOCOL.md rule 3).
const PB_ORCA_NEXT = 'Next step: bash scripts/fetch-orca.sh and bash scripts/build-orca.sh, then re-run this check';

const HELP = `Usage: node scripts/verify-uri-roundtrip.mjs [--scheme <scheme>]

Table-driven URI-01..URI-04 round-trip proof against @powerbrowser/tab-uris.

  --scheme <scheme>  Run only one scheme's rows: view, settings, terminal or
                       pb-orca (default: run everything, including the four
                       D-51 carve-outs). The pb-orca rows (Phase 64, TAB-02)
                       SKIP, named, while the built orca/ or the pane bundle
                       is absent; a missing theia/extensions/orca-panes is red.
  --help             Print this message and exit 0
`;

// The 21 `view:` rows, verbatim from 02-RESEARCH.md §4. Five differ from
// 02-CONTEXT.md D-43's table (marked); `ai-sessions-widget` is missing from
// D-43 entirely.
const VIEW_ROWS = [
    { path: 'problems', container: false },
    { path: 'explorer-view-container', container: true },
    { path: 'outline-view', container: false },
    { path: 'search-view-container', container: true },
    { path: 'scm-view-container', container: true },
    { path: 'debug', container: false },
    { path: 'debug-console', container: false },
    { path: 'disassembly-view-widget', container: false },
    { path: 'test-view-container', container: true },
    { path: 'test-result-widget', container: false },
    { path: 'test-output-view', container: false },
    { path: 'callhierarchy', container: false },
    { path: 'theia-typehierarchy', container: false, correctedFromD43: 'typehierarchy' },
    { path: 'keybindings.view.widget', container: false, correctedFromD43: 'keybindings' },
    { path: 'chat-view-widget', container: false, correctedFromD43: 'chat-view' },
    { path: 'ai-configuration', container: false, correctedFromD43: 'ai-config' },
    { path: 'ai-sessions-widget', container: false, correctedFromD43: '(missing from D-43 entirely)' },
    { path: 'bulkedit', container: false },
    { path: 'plugins', container: false },
    { path: 'vsx-extensions-view-container', container: true },
    { path: 'welcome', container: false },
];

const SETTINGS_ROW = { scheme: 'settings', path: '', factoryId: 'settings_widget' };
const TERMINAL_ROW = { scheme: 'terminal', path: '', factoryId: 'terminal' };

// D-51's four unavoidable carve-outs. Never gate the exit code -- each
// asserts the documented degradation, not the general round-trip rule.
// Two are live-probable today with the packages this phase eventually
// installs (D-19); two (editor-preview's in-place mutation, webview's
// session-scoped identity) need a live editor/plugin-webview session to
// probe meaningfully and are recorded as documented-only.
const CARVE_OUTS = [
    {
        name: 'output',
        reason: "@theia/output's widget is a singleton whose content swaps per channel -- output:A and output:B resolve to the same tab (factory id 'outputView').",
        probe: true,
    },
    {
        name: 'editor-preview',
        reason: "@theia/editor-preview swaps the document a tab shows without user navigation, so a tab's resource URI mutates in place -- not mechanically probable without a live preview-triggering navigation.",
        probe: false,
    },
    {
        name: 'vscode-notebook-cell',
        reason: "notebook's vscode-notebook-cell: handler is a registered scheme that opens no tab and returns undefined.",
        probe: true,
    },
    {
        name: 'webview',
        reason: 'webview: addresses only round-trip within a session -- panel ids are minted per createWebviewPanel call by the plugin host, so without a live plugin-contributed panel this cannot be probed mechanically.',
        probe: false,
    },
];

const args = process.argv.slice(2);
if (args.includes('--help')) {
    console.log(HELP.trimEnd());
    process.exit(0);
}
const schemeIdx = args.indexOf('--scheme');
const onlyScheme = schemeIdx !== -1 ? args[schemeIdx + 1] : null;

// -- Page-eval helpers (all embedded as source text -- see the reflection
// note above for why) --

const PRELUDE = `
function __getByName(container, name) {
    let found;
    container._bindingDictionary.traverse((key) => {
        if (found) return;
        const keyStr = typeof key === 'symbol' ? key.toString() : (key && key.name) || String(key);
        if (keyStr === 'Symbol(' + name + ')' || keyStr === name) found = key;
    });
    if (!found) throw new Error('DI binding not found for identifier name: ' + name);
    return container.get(found);
}
function __makeUri(input) {
    const m = /^([a-zA-Z][a-zA-Z0-9+.-]*):(\\/{0,3})(.*)$/.exec(input);
    if (!m) throw new Error('not a valid scheme:path URI: ' + input);
    const scheme = m[1];
    const path = m[3];
    const lastSeg = path.split('/').pop() || '';
    const dot = lastSeg.lastIndexOf('.');
    const base = {
        scheme,
        authority: '',
        query: '',
        fragment: '',
        path: {
            toString: () => path,
            base: lastSeg,
            ext: dot > 0 ? lastSeg.slice(dot) : '',
            dir: { toString: () => '' },
        },
        toString(skipEncoding) {
            return scheme + ':' + path;
        },
    };
    // Fallback for any URI method this shim does not implement, called by
    // in-tree OpenHandlers unrelated to the scheme under test (e.g. the
    // editor opener's own canHandle probing every candidate URI during
    // OpenerService.getOpener's prioritize() pass) -- returns a chainable
    // no-op rather than crashing an unrelated handler's canHandle. Real
    // assertions never read through this fallback: they only ever inspect
    // scheme and toString(true), both defined above.
    let proxy;
    proxy = new Proxy(base, {
        get(target, prop) {
            if (prop in target) return target[prop];
            if (typeof prop === 'symbol' || prop === 'then') return undefined;
            return (..._args) => proxy;
        },
    });
    return proxy;
}
// CR-01 follow-up, found live while strengthening this check: a widget
// that IS correctly added to the shell can still report isAttached ===
// false for a brief moment after open() resolves -- Lumino's actual DOM
// attach for the side/bottom-panel reveal path completes asynchronously
// (measured live: up to several hundred ms), not synchronously with
// addWidget(). Checking immediately produced false failures on
// legitimately-attached widgets. Poll instead of a single point-in-time
// check, bounded so a genuinely never-attached widget (CR-01's actual bug
// -- addWidget() never called at all) still fails loudly rather than
// hanging.
async function __waitAttached(widget, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (!widget.isAttached) {
        if (Date.now() >= deadline) return false;
        await new Promise(r => setTimeout(r, 50));
    }
    return true;
}
`;

function buildRowExpression(uriString, factoryId) {
    return `
(async function() {
    ${PRELUDE}
    try {
        const container = window.theia.container;
        const openerService = __getByName(container, 'OpenerService');
        const widgetManager = __getByName(container, 'WidgetManager');
        let registry;
        try {
            registry = __getByName(container, 'TabUriRegistry');
        } catch (e) {
            return JSON.stringify({ ok: false, reason: 'TabUriRegistry not bound: ' + e.message });
        }
        // Wave-0 approximation of the "native/menu path" half of D-46's
        // check: create with no caller-supplied options first, matching
        // what AbstractViewContribution.openView ultimately does.
        await widgetManager.getOrCreateWidget(${JSON.stringify(factoryId)}, undefined);

        const opener = await openerService.getOpener(__makeUri(${JSON.stringify(uriString)}));
        const widget = await opener.open(__makeUri(${JSON.stringify(uriString)}));
        if (!widget) {
            return JSON.stringify({ ok: false, reason: 'open() resolved to undefined/falsy' });
        }
        // CR-01: D-53's round-trip assertion alone does not catch a widget
        // that was created but never attached to the shell --
        // WidgetManager.getDescription still reports the correct
        // {factoryId, options} for an unattached cached widget, so the
        // address round-trips even though nothing appeared on screen.
        // Assert attachment explicitly (bounded poll -- see __waitAttached)
        // so this class of bug fails loudly.
        if (!(await __waitAttached(widget, 3000))) {
            return JSON.stringify({ ok: false, reason: 'widget.isAttached stayed false for 3000ms -- open() created the widget but never attached it to the shell' });
        }
        const roundtrip = registry.uriOf(widget);
        if (!roundtrip) {
            return JSON.stringify({ ok: false, reason: 'registry.uriOf(widget) returned undefined' });
        }
        const roundtripStr = roundtrip.toString(true);
        if (roundtripStr !== ${JSON.stringify(uriString)}) {
            return JSON.stringify({ ok: false, reason: 'roundtrip mismatch: got ' + roundtripStr + ', expected ${uriString}' });
        }
        const count = widgetManager.getWidgets(${JSON.stringify(factoryId)}).length;
        if (count !== 1) {
            return JSON.stringify({ ok: false, reason: 'widgetManager.getWidgets(' + ${JSON.stringify(factoryId)} + ').length === ' + count + ', expected 1 -- D-46 options:{} fork?' });
        }
        return JSON.stringify({ ok: true });
    } catch (e) {
        return JSON.stringify({ ok: false, reason: (e && e.message) || String(e) });
    }
})()
`;
}

function buildTerminalExpression() {
    return `
(async function() {
    ${PRELUDE}
    try {
        const container = window.theia.container;
        const openerService = __getByName(container, 'OpenerService');
        const widgetManager = __getByName(container, 'WidgetManager');
        let registry;
        try {
            registry = __getByName(container, 'TabUriRegistry');
        } catch (e) {
            return JSON.stringify({ ok: false, reason: 'TabUriRegistry not bound: ' + e.message });
        }
        const opener = await openerService.getOpener(__makeUri('terminal:'));
        const widget = await opener.open(__makeUri('terminal:'));
        if (!widget) {
            return JSON.stringify({ ok: false, reason: 'open() resolved to undefined/falsy' });
        }
        // CR-01's attachment assertion (bounded poll), mirrored here.
        if (!(await __waitAttached(widget, 3000))) {
            return JSON.stringify({ ok: false, reason: 'widget.isAttached stayed false for 3000ms -- open() created the widget but never attached it to the shell' });
        }
        const roundtrip = registry.uriOf(widget);
        if (!roundtrip) {
            return JSON.stringify({ ok: false, reason: 'registry.uriOf(widget) returned undefined' });
        }
        const roundtripStr = roundtrip.toString(true);
        if (!roundtripStr.startsWith('terminal:')) {
            return JSON.stringify({ ok: false, reason: 'roundtrip does not start with terminal: -- got ' + roundtripStr });
        }
        const count = widgetManager.getWidgets('terminal').length;
        if (count < 1) {
            return JSON.stringify({ ok: false, reason: 'expected at least one terminal widget, found ' + count });
        }
        return JSON.stringify({ ok: true });
    } catch (e) {
        return JSON.stringify({ ok: false, reason: (e && e.message) || String(e) });
    }
})()
`;
}

function buildOutputCarveOutExpression() {
    return `
(async function() {
    ${PRELUDE}
    try {
        const container = window.theia.container;
        const openerService = __getByName(container, 'OpenerService');
        const widgetManager = __getByName(container, 'WidgetManager');
        const openerA = await openerService.getOpener(__makeUri('output:A'));
        await openerA.open(__makeUri('output:A'));
        const openerB = await openerService.getOpener(__makeUri('output:B'));
        await openerB.open(__makeUri('output:B'));
        const count = widgetManager.getWidgets('outputView').length;
        return JSON.stringify({ ok: count === 1, reason: count === 1 ? undefined : ('expected singleton outputView tab, found ' + count) });
    } catch (e) {
        return JSON.stringify({ ok: false, reason: (e && e.message) || String(e) });
    }
})()
`;
}

function buildNotebookCellCarveOutExpression() {
    return `
(async function() {
    ${PRELUDE}
    try {
        const container = window.theia.container;
        const openerService = __getByName(container, 'OpenerService');
        const opener = await openerService.getOpener(__makeUri('vscode-notebook-cell:x'));
        const widget = await opener.open(__makeUri('vscode-notebook-cell:x'));
        return JSON.stringify({ ok: widget === undefined, reason: widget === undefined ? undefined : 'expected undefined (opens no tab), got a widget' });
    } catch (e) {
        // No handler registered at all also satisfies "opens no tab" until
        // @theia/notebook is installed (D-19, a later plan).
        return JSON.stringify({ ok: true, reason: 'no handler registered yet: ' + ((e && e.message) || String(e)) });
    }
})()
`;
}

const ORCA_PANES_REL = 'theia/extensions/orca-panes';
const ORCA_PANE_FACTORY = 'powerbrowser.orca-pane';
/** P65-10, N-1: Orca's page tabs, singletons opened by name (pb-orca:creating excluded). */
const ORCA_PAGE_ROWS = ['pb-orca:tasks', 'pb-orca:activity', 'pb-orca:automations', 'pb-orca:space', 'pb-orca:skills', 'pb-orca:artifacts', 'pb-orca:mobile'];
/**
 * The pb-orca rows' inputs, judged from the tree with no browser: { fail } when a tracked source is missing (red,
 * source moved), { skip } when an untracked build output is absent (SKIP-PROTOCOL.md), or null when they can run.
 */
export function pbOrcaInputs(root = REPO_ROOT) {
    if (!existsSync(join(root, ORCA_PANES_REL))) return { fail: `${ORCA_PANES_REL} is absent, and it is tracked (source moved), so the pb-orca rows cannot run` };
    if (!existsSync(join(root, 'orca/out/orcad/orcad.js'))) return { skip: 'no built orca/ (orca/out/orcad/orcad.js is absent)' };
    if (!existsSync(join(root, 'orca/out/web/assets/pb-panes'))) return { skip: 'the pane bundle is not built (orca/out/web/assets/pb-panes is absent)' };
    return null;
}

function buildPbOrcaExpression() {
    return `
(async function() {
    ${PRELUDE}
    const rows = [];
    const row = (label, ok, reason) => rows.push({ label, ok, reason });
    try {
        const container = window.theia.container;
        const openerService = __getByName(container, 'OpenerService');
        const widgetManager = __getByName(container, 'WidgetManager');
        const registry = __getByName(container, 'TabUriRegistry');
        const commands = __getByName(container, 'CommandRegistry');
        const shell = __getByName(container, 'ApplicationShell');
        const hosted = () => widgetManager.getWidgets('${ORCA_PANE_FACTORY}');
        const open = async (input) => { const u = __makeUri(input); const opener = await openerService.getOpener(u); return opener.open(u); };
        try { await openerService.getOpener(__makeUri('pb-orca:')); } catch (e) {
            return JSON.stringify({ rows: [{ label: 'pb-orca: (scheme handled)', ok: false, reason: 'pb-orca: scheme unhandled while orca-panes is present: ' + e.message }] });
        }
        const m = globalThis[Symbol.for('powerbrowser.orca-panes.module')];
        const deadline = Date.now() + 90000;
        let booted = false;
        while (Date.now() < deadline) { const n = globalThis[Symbol.for('powerbrowser.orca-panes.module')]; try { if (n && n.state().booted) { booted = true; break; } } catch (e) { /* not yet */ } await new Promise(r => setTimeout(r, 250)); }
        // A built tree whose bundle does not boot is a failure, not an absent input.
        if (!booted) return JSON.stringify({ rows: [{ label: 'pb-orca rows', ok: false, reason: 'orcad not ready or the pane bundle did not boot within 90 s, with a built orca/ and pane bundle' }] });
        const before = hosted().length;
        if (before !== 0) row('pb-orca: before any hosted tab', false, before + ' hosted widget(s) existed before the row ran (a restored layout); the empty-address row needs none');
        else {
            const w0 = await open('pb-orca:');
            row('pb-orca: before any hosted tab', !w0 && hosted().length === 0, w0 ? 'opened a widget with no hosted tab open' : 'created ' + hosted().length + ' hosted widget(s)');
        }
        if (!commands.getCommand('powerbrowser.orca.newTerminal')) return JSON.stringify({ rows: [...rows, { label: 'pb-orca:<name>', ok: false, reason: 'powerbrowser.orca.newTerminal is not registered' }] });
        const ids = new Set(hosted().map(w => w.id));
        await commands.executeCommand('powerbrowser.orca.newTerminal');
        let widget;
        for (const end = Date.now() + 5000; !widget && Date.now() < end; await new Promise(r => setTimeout(r, 100))) widget = hosted().find(w => !ids.has(w.id));
        if (!widget) return JSON.stringify({ rows: [...rows, { label: 'pb-orca:<name>', ok: false, reason: 'New Orca Terminal gave no hosted widget within 5000 ms' }] });
        const name = widget.options && widget.options.name;
        const input = 'pb-orca:' + name;
        const opened = await open(input);
        const rt = registry.uriOf(widget);
        const same = hosted().filter(w => w.options && w.options.name === name).length;
        row(input, !!opened && !!rt && rt.toString(true) === input && same === 1,
            'uriOf ' + (rt ? rt.toString(true) : 'undefined') + ', ' + same + ' widget(s) named ' + name + ', open() ' + (opened ? 'resolved a widget' : 'resolved nothing'));
        const count = hosted().length;
        const focused = await open('pb-orca:');
        await new Promise(r => setTimeout(r, 200));
        row('pb-orca: with ' + name + ' open', focused === widget && hosted().length === count && shell.activeWidget === widget,
            'focused ' + (focused ? focused.id : 'nothing') + ', active ' + (shell.activeWidget ? shell.activeWidget.id : 'none') + ', hosted ' + count + ' -> ' + hosted().length);
        const stale = 'pb-orca:' + String(name).replace(/\\d+$/, '') + '99';
        const s = await open(stale);
        row(stale, !s && hosted().length === count, s ? 'a stale name opened a widget' : 'created ' + (hosted().length - count) + ' hosted widget(s)');
        for (const page of ${JSON.stringify(ORCA_PAGE_ROWS)}) {
            const pageName = page.slice('pb-orca:'.length);
            const first = await open(page);
            const again = await open(page);
            const prt = first && registry.uriOf(first);
            const n = hosted().filter(w => w.options && w.options.name === pageName).length;
            row(page, !!first && again === first && !!prt && prt.toString(true) === page && n === 1,
                'uriOf ' + (prt ? prt.toString(true) : 'undefined') + ', ' + n + ' widget(s) named ' + pageName + ', second open ' + (again === first ? 'the same widget' : 'another result'));
        }
        return JSON.stringify({ rows });
    } catch (e) {
        return JSON.stringify({ rows: [...rows, { label: 'pb-orca rows', ok: false, reason: (e && e.message) || String(e) }] });
    }
})()
`;
}

async function main() {
    const results = [];
    const inputs = pbOrcaInputs();
    if (onlyScheme === 'pb-orca' && inputs?.fail) {
        // Nothing to drive: a tracked source is missing, so no browser is launched and the run is red.
        console.error(`${NAME}: FAIL -- ${inputs.fail}. Next step: restore ${ORCA_PANES_REL} from version control`);
        process.exit(1);
    }
    if (onlyScheme === 'pb-orca' && inputs?.skip) {
        // Nothing to drive: no browser is launched for rows that can only SKIP. Exit 77 (SKIP-PROTOCOL.md).
        console.log(skipLine(NAME, `the pb-orca rows did not run: ${inputs.skip}. ${PB_ORCA_NEXT}`));
        process.exit(SKIP_EXIT);
    }

    let runPbOrca = false;
    // WINDOWS 14: empty URL -- this check reads the shell, never a URL page.
    await withFirefoxPage('', async ({ evaluate, waitFor }) => {
        await waitFor('window.theia && window.theia.container ? true : false');

        const rows = [];
        if (!onlyScheme || onlyScheme === 'view') {
            for (const row of VIEW_ROWS) rows.push({ scheme: 'view', ...row, factoryId: row.path });
        }
        if (!onlyScheme || onlyScheme === 'settings') {
            rows.push({ scheme: 'settings', ...SETTINGS_ROW });
        }

        for (const row of rows) {
            const uriString = `${row.scheme}:${row.path}`;
            const expr = buildRowExpression(uriString, row.factoryId);
            let outcome;
            try {
                const raw = await evaluate(expr);
                outcome = JSON.parse(raw);
            } catch (e) {
                outcome = { ok: false, reason: e.message };
            }
            results.push({ label: uriString, carveOut: false, ...outcome });
        }

        if (!onlyScheme || onlyScheme === 'terminal') {
            let outcome;
            try {
                const raw = await evaluate(buildTerminalExpression());
                outcome = JSON.parse(raw);
            } catch (e) {
                outcome = { ok: false, reason: e.message };
            }
            results.push({ label: 'terminal:', carveOut: false, ...outcome });
        }

        if (!onlyScheme || onlyScheme === 'pb-orca') {
            if (inputs?.fail) results.push({ label: 'pb-orca rows', carveOut: false, ok: false, reason: inputs.fail });
            else if (inputs?.skip) results.push({ label: 'pb-orca', skip: inputs.skip });
            else runPbOrca = true; // in their own Orca session after this one
        }

        if (!onlyScheme) {
            for (const carveOut of CARVE_OUTS) {
                if (!carveOut.probe) {
                    results.push({ label: `output-carve-out:${carveOut.name}`, carveOut: true, ok: true, reason: `documented only: ${carveOut.reason}` });
                    continue;
                }
                const expr = carveOut.name === 'output' ? buildOutputCarveOutExpression() : buildNotebookCellCarveOutExpression();
                let outcome;
                try {
                    const raw = await evaluate(expr);
                    outcome = JSON.parse(raw);
                } catch (e) {
                    outcome = { ok: false, reason: e.message };
                }
                results.push({ label: `${carveOut.name} (D-51 carve-out: ${carveOut.reason})`, carveOut: true, ...outcome });
            }
        }
    });

    // The pb-orca rows need PowerBrowser's own orcad and a booted pane bundle: the shared Orca tabs session
    // (scripts/lib/orca-tabs-live.mjs). Its worktree is selected through the bundle's setActiveWorktree, as an
    // activated Orca tab does (P64-23), so New Orca Terminal has a worktree while no hosted tab exists yet.
    if (runPbOrca) {
        const lib = await import('./lib/orca-tabs-live.mjs');
        let outcome;
        try {
            outcome = await lib.withOrcaTabsSession({ log: () => {} }, async (ctx) => {
                const listed = ctx.orca('worktree', 'list');
                const id = (listed?.result?.worktrees ?? []).find((w) => String(w.id).endsWith(`::${ctx.repo}`))?.id;
                if (!id) return { rows: [{ label: 'pb-orca rows', ok: false, reason: 'the session worktree is not in the Orca CLI list' }] };
                await ctx.bundle(`(m.setActiveWorktree(${JSON.stringify(id)}), true)`);
                // Theia's active widget follows DOM focus; the frame is focused as orca-tabs-live does.
                await ctx.focusTheiaFrame();
                return JSON.parse(await ctx.app.evaluate(buildPbOrcaExpression()));
            });
        } catch (e) {
            outcome = { rows: [{ label: 'pb-orca rows', ok: false, reason: e.message }] };
        }
        if (outcome.skip) results.push({ label: 'pb-orca', skip: outcome.skip });
        else for (const r of outcome.rows) results.push({ carveOut: false, ...r });
    }

    let passCount = 0;
    let failCount = 0;
    const skips = [];
    for (const r of results) {
        // A row not run is reported once, in the SKIP line printed last (SKIP-PROTOCOL.md rule 2).
        if (r.skip) { console.log(`verify-uri-roundtrip: not run ${r.label} -- ${r.skip}`); skips.push(`the ${r.label} rows did not run: ${r.skip}`); continue; }
        const verdict = r.ok ? 'PASS' : 'FAIL';
        const suffix = r.ok ? '' : ` -- ${r.reason}`;
        console.log(`verify-uri-roundtrip: ${verdict} ${r.label}${suffix}`);
        if (r.carveOut) continue; // never gates exit code
        if (r.ok) passCount++;
        else failCount++;
    }

    const total = passCount + failCount;
    console.log(`verify-uri-roundtrip: ${passCount}/${total} rows PASS`);
    // FAIL wins; a run with no row at all is red; a run in which some rows did not run exits 77 with the SKIP
    // line last; exit 0 means every row ran.
    if (failCount === 0 && total === 0 && skips.length === 0) process.exit(1);
    if (skips.length > 0) skips.push(PB_ORCA_NEXT);
    process.exit(verdictExit(NAME, failCount > 0 ? [`${failCount} row(s) red`] : [], skips));
}

main().catch(err => {
    console.error(`verify-uri-roundtrip: FAIL -- ${err.message}`);
    process.exit(1);
});
