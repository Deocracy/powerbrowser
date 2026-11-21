#!/usr/bin/env node
// scripts/verify-orca-browser-tools.mjs
//
// orca-browser-tools (Phase 66, BRW-05; P66-24, P66-25, P66-30): every user-facing
// tool of Orca's browser has a home in PowerBrowser.
//
// Derived at check time, never hand-kept:
//  a. the U-row ids from spike 005's README table (lines starting "| U-");
//  b. ORCA_BROWSER_TOOLS from theia/extensions/orca-browser/src/common/orca-browser-tools.ts,
//     transpiled with theia/node_modules/typescript and evaluated;
//  c. the registered command ids: every registerCommand(...) first argument in
//     theia/extensions/*/src (comments stripped), resolved through the
//     `const X = { id: ... }` command objects and `const Y = '<id>'` constants;
//  d. the chrome bar's render methods: defined in chrome-bar-widget.tsx and called
//     as this.<name>() in it;
//  e. KIND_CLASSES' keys in scripts/verify-web-tab-bridge.mjs;
//  f. the v2 requirement ids (bold **ID** rows under "## v2 Requirements") in
//     .planning/workstreams/orca/REQUIREMENTS.md.
//  g. the user-facing tool sources of Orca's browser at the pin
//     (harness-static-browser-08): each subdirectory of
//     orca/src/renderer/src/components/browser-pane except assemble-chrome, each
//     subdirectory of assemble-chrome, and each non-test .ts or .tsx module directly in
//     browser-pane or in assemble-chrome (the toolbar, menus, chrome controls, prompts
//     and notices).
// Compared: the U-row set equals the map's keys (both ways); a command entry is a
// registered id, a render entry a defined and called method, a kind entry a
// classified kind, a deferral a v2 id, a skip a non-empty reason; every entry has
// exactly one of the five shapes. An empty U-row parse is red ("broken instrument").
// The derived tool sources equal ORCA_TOOL_SOURCES' keys (both ways), so a re-pin
// that adds a browser tool module is red until it is classified; each source names
// U-rows of the table, or is internal with a reason; and every U-row is carried by a
// source or is in UNSOURCED_ROWS with a reason (set equality). Limits: a control added
// inside an existing module is not a new source, and the classification itself (which
// U-rows a module carries, or that it is internal) is hand-kept: the check proves it
// complete and consistent with the table, not correct.
//
// Tier: quick. SKIP (exit 77, one line) when theia/node_modules/typescript is absent,
// and when orca/src is absent (then clause g did not run). --self-test runs the
// verdict over in-memory fixture sources: the control must be green, then each
// planted fault must go red naming its drift.
//
// Usage:
//   node scripts/verify-orca-browser-tools.mjs
//   node scripts/verify-orca-browser-tools.mjs --self-test

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SKIP_EXIT, skipLine, verdictExit } from './lib/skip-verdict.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'orca-browser-tools';
export const REL = {
    readme: '.planning/spikes/005-orca-browser-parity/README.md',
    tools: 'theia/extensions/orca-browser/src/common/orca-browser-tools.ts',
    widget: 'theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx',
    bridge: 'scripts/verify-web-tab-bridge.mjs',
    requirements: '.planning/workstreams/orca/REQUIREMENTS.md',
    extensions: 'theia/extensions',
    browserPane: 'orca/src/renderer/src/components/browser-pane',
};

const internal = (reason) => ({ internal: reason });
/**
 * Each user-facing tool source of Orca's browser (clause g) classified onto the U-rows of the spike table, or internal
 * with a reason. The keys are compared with the derived set as set equality; a new upstream module is red until it is
 * added here.
 */
export const ORCA_TOOL_SOURCES = Object.freeze({
    'agent-cursor/': ['U-09'],
    'annotate/': ['U-06', 'U-07', 'U-08'],
    'describe-page/': internal('page description helpers (types, URL display, favicon, annotation geometry); no control of its own'),
    'devtools-dock/': ['U-05'],
    'history/': ['U-11'],
    'host-guest/': ['U-10'],
    'navigate/': ['U-02', 'U-13'],
    'new-tab/': ['U-12'],
    'stream-remote/': ['U-29'],
    'workspace-doc/': ['U-26'],
    'BrowserPane.tsx': internal('the pane container that composes the chrome and the page'),
    'ClientHostedBrowserPagePane.tsx': internal('the client-hosted page container of the chrome and the page'),
    'ReopenBrowserPageOnServerButton.tsx': ['U-29'],
    'browser-page-prompts.tsx': ['U-15'],
    'client-hosted-browser-host-row-pane.tsx': internal('the client-hosted host row container'),
    'client-hosted-browser-load-failure.tsx': ['U-16'],
    'client-hosted-browser-unavailable-notice.tsx': ['U-29'],
    'assemble-chrome/BrowserAddressBar.tsx': ['U-01'],
    'assemble-chrome/BrowserAddressBarSuggestionList.tsx': ['U-01'],
    'assemble-chrome/BrowserFind.tsx': ['U-03'],
    'assemble-chrome/BrowserImportHintButton.tsx': ['U-20'],
    'assemble-chrome/BrowserMobileDriverOverlay.tsx': ['U-28'],
    'assemble-chrome/BrowserPaneOverlayLayer.tsx': internal('the overlay layer that positions the page views'),
    'assemble-chrome/BrowserToolbarMenu.tsx': ['U-04', 'U-19', 'U-20'],
    'assemble-chrome/DeferredBrowserContent.tsx': internal('deferred mounting of the page content'),
    'assemble-chrome/browser-chrome-element-tool-buttons.tsx': ['U-06', 'U-08'],
    'assemble-chrome/browser-chrome-folded-tools.tsx': ['U-06', 'U-08'],
    'assemble-chrome/browser-chrome-toolbar.tsx': ['U-06', 'U-08'],
    'assemble-chrome/browser-egress-indicator.tsx': ['U-25'],
    'assemble-chrome/browser-extension-action-menu.tsx': ['U-21'],
    'assemble-chrome/browser-extension-toolbar.tsx': ['U-21'],
    'assemble-chrome/browser-link-status-bubble.tsx': ['U-23'],
    'assemble-chrome/browser-load-progress.tsx': ['U-02'],
    'assemble-chrome/browser-navigation-control-row.tsx': ['U-02'],
    'assemble-chrome/browser-page-chrome-banners.tsx': ['U-07'],
    'assemble-chrome/browser-page-chrome-header.tsx': internal('the chrome header container (toolbar, download list, banners)'),
    'assemble-chrome/browser-page-context-menu-items.tsx': ['U-18', 'U-27'],
    'assemble-chrome/browser-page-context-menu.tsx': ['U-18'],
    'assemble-chrome/browser-page-extension-menu-items.tsx': ['U-21'],
    'assemble-chrome/browser-page-feedback-badge.tsx': ['U-06'],
    'assemble-chrome/browser-page-pane.tsx': internal('the page pane container'),
    'assemble-chrome/browser-page-toolbar.tsx': internal('the toolbar container that composes the tool modules'),
    'assemble-chrome/browser-page-viewport-overlays.tsx': internal('the viewport overlay container'),
    'assemble-chrome/browser-reload-control.tsx': ['U-02'],
    'assemble-chrome/browser-toolbar-menu-dropdown.tsx': ['U-20', 'U-22'],
    'assemble-chrome/browser-toolbar-page-display-items.tsx': ['U-04'],
    'assemble-chrome/browser-toolbar-profile-dialogs.tsx': ['U-19'],
    'assemble-chrome/browser-workspace-pane.tsx': internal('the workspace pane container'),
    'assemble-chrome/managed-browser-profile-hold.tsx': ['U-19'],
    'assemble-chrome/ssh-routed-browser-page-gate.tsx': ['U-24'],
    // Second review: the .ts modules (prompts and notices live in .ts files too).
    'browser-client-hosted-download-notices.ts': ['U-13'],
    'browser-client-hosted-permission-notices.ts': ['U-17'],
    'browser-client-hosted-popup-notices.ts': ['U-14'],
    'browser-client-page-guest-metadata.ts': internal('client-hosted page plumbing: guest metadata'),
    'browser-client-page-metadata-publish-e2e-fault.ts': internal("fault injection for Orca's own end-to-end suite"),
    'browser-client-page-metadata-publisher.ts': internal('client-hosted page plumbing: metadata publishing'),
    'browser-client-page-metadata-reporting.ts': internal('client-hosted page plumbing: metadata reporting'),
    'browser-client-page-paint-retention.ts': internal('client-hosted page plumbing: paint retention'),
    'browser-client-page-position-driver.ts': internal('client-hosted page plumbing: page positioning'),
    'browser-client-page-renderer-installation.ts': internal('client-hosted page plumbing: renderer installation'),
    'browser-client-page-retained-elements.ts': internal('client-hosted page plumbing: retained elements'),
    'browser-client-page-retained-host-fixture.ts': internal("a test fixture of Orca's own suite"),
    'browser-client-page-retained-key.ts': internal('client-hosted page plumbing: retention keys'),
    'browser-client-page-retained-memory-profile.ts': internal('client-hosted page plumbing: retention memory profile'),
    'browser-client-page-retained-registry.ts': internal('client-hosted page plumbing: retention registry'),
    'browser-client-page-retained-rekey.ts': internal('client-hosted page plumbing: retention rekeying'),
    'browser-client-page-retained-state.ts': internal('client-hosted page plumbing: retention state'),
    'browser-client-page-visible-attachment.ts': internal('client-hosted page plumbing: visible attachment'),
    'browser-download-destination-toast.ts': ['U-13'],
    'browser-external-app-prompt.ts': ['U-23'],
    'browser-http-auth-prompt.ts': ['U-15'],
    'browser-javascript-dialog-prompt.ts': ['U-15'],
    'browser-reopen-on-server.ts': ['U-29'],
    'browser-site-permission-copy.ts': ['U-17'],
    'browser-site-permission-prompt.ts': ['U-17'],
    'browser-user-agent-migration-notice.ts': ['U-22'],
    'client-hosted-browser-pane-test-rig.ts': internal("a test rig of Orca's own suite"),
    'restored-client-hosted-recovery-window.ts': internal('client-hosted page plumbing: recovery after a restore'),
    'use-client-hosted-browser-intro-tour.ts': internal("an onboarding tour of Orca's own pane, not a browser tool"),
    'use-ssh-workspace-browser-route.ts': ['U-24'],
    'assemble-chrome/browser-address-bar-edit-session.ts': ['U-01'],
    'assemble-chrome/browser-address-bar-expansion.ts': ['U-01'],
    'assemble-chrome/browser-address-bar-suggestions.ts': ['U-01'],
    'assemble-chrome/browser-chrome-address-slot.ts': ['U-01'],
    'assemble-chrome/browser-detected-browsers-summary.ts': ['U-20'],
    'assemble-chrome/browser-extension-action-context-items.ts': ['U-21'],
    'assemble-chrome/browser-import-hint-visibility.ts': ['U-20'],
    'assemble-chrome/browser-page-guest-focus.ts': internal('focus plumbing between the chrome and the page'),
    'assemble-chrome/browser-pane-page-selection.ts': internal('page selection plumbing of the pane'),
    'assemble-chrome/browser-viewport-preset-label.ts': ['U-22'],
    'assemble-chrome/use-browser-address-bar-click-select.ts': ['U-01'],
    'assemble-chrome/use-browser-address-bar-dismissal.ts': ['U-01'],
    'assemble-chrome/use-browser-address-bar-edit-handoff.ts': ['U-01'],
    'assemble-chrome/use-browser-address-bar-edit-session.ts': ['U-01'],
    'assemble-chrome/use-browser-address-bar-escape.ts': ['U-01'],
    'assemble-chrome/use-browser-address-bar-inline-completion.ts': ['U-01'],
    'assemble-chrome/use-browser-address-bar-row-removal.ts': ['U-01'],
    'assemble-chrome/use-browser-address-bar-suggestion-preview.ts': ['U-01'],
    'assemble-chrome/use-browser-address-bar-switch-to-tab.ts': ['U-01'],
    'assemble-chrome/use-browser-chrome-tool-fold.ts': ['U-06', 'U-08'],
    'assemble-chrome/use-browser-extension-toolbar.ts': ['U-21'],
    'assemble-chrome/use-browser-page-chrome-focus.ts': internal('focus plumbing of the chrome'),
    'assemble-chrome/use-browser-page-find-shortcuts.ts': ['U-03', 'U-30'],
});

/** U-rows no Orca source module carries, each with its reason; compared as set equality with the uncovered rows. */
export const UNSOURCED_ROWS = Object.freeze({});

const NOT_TOOL_SOURCE = /\.(test|spec)\.tsx?$|\.d\.ts$/;
const MODULE = /\.tsx?$/;

/**
 * Clause g's derived set from a list of browser-pane entries ({ name, dir }), at the top and under assemble-chrome:
 * every subdirectory (assemble-chrome itself expanded) and every non-test .ts or .tsx module.
 */
export function toolSources(top, chrome) {
    const out = [];
    for (const e of top) {
        if (e.dir && e.name !== 'assemble-chrome') out.push(`${e.name}/`);
        else if (!e.dir && MODULE.test(e.name) && !NOT_TOOL_SOURCE.test(e.name)) out.push(e.name);
    }
    for (const e of chrome) {
        if (e.dir) out.push(`assemble-chrome/${e.name}/`);
        else if (MODULE.test(e.name) && !NOT_TOOL_SOURCE.test(e.name)) out.push(`assemble-chrome/${e.name}`);
    }
    return out.sort();
}

/**
 * Clause g's verdict: the derived sources against the classification and the U-rows, both ways: every source is
 * classified, every classified source exists, and every U-row is carried by some source or is in `unsourced` with a
 * reason (set equality), so a row whose last source moved away is red.
 */
export function sourceFailures(derived, classified, rows, unsourced = UNSOURCED_ROWS) {
    if (!derived.length) return ['broken instrument: no Orca browser tool source was derived under the pinned browser-pane directory'];
    const fails = [];
    const keys = Object.keys(classified);
    for (const d of derived) if (!keys.includes(d)) fails.push(`unclassified Orca browser source: ${d} is at the pin and not in ORCA_TOOL_SOURCES (map it to its U-rows, or to internal with a reason)`);
    for (const k of keys) if (!derived.includes(k)) fails.push(`stale tool source: ${k} is in ORCA_TOOL_SOURCES and not at the pin`);
    for (const [k, v] of Object.entries(classified)) {
        if (Array.isArray(v)) {
            if (!v.length) fails.push(`tool source ${k} names no U-row`);
            for (const id of v) if (!rows.includes(id)) fails.push(`tool source ${k} names ${id}, which is not a U-row of the spike table`);
        } else if (typeof v?.internal !== 'string' || !v.internal.trim()) fails.push(`tool source ${k} is neither U-rows nor internal with a reason`);
    }
    const carried = new Set(Object.entries(classified).filter(([k, v]) => Array.isArray(v) && derived.includes(k)).flatMap(([, v]) => v));
    for (const id of rows) {
        if (!carried.has(id) && !(id in unsourced)) fails.push(`uncovered U-row: ${id} is carried by no Orca source in ORCA_TOOL_SOURCES and not in UNSOURCED_ROWS`);
        if (carried.has(id) && id in unsourced) fails.push(`stale unsourced row: ${id} is in UNSOURCED_ROWS but a source carries it`);
    }
    for (const [id, why] of Object.entries(unsourced)) {
        if (!rows.includes(id)) fails.push(`stale unsourced row: ${id} is not a U-row of the spike table`);
        else if (typeof why !== 'string' || !why.trim()) fails.push(`unsourced row ${id} has no reason`);
    }
    return fails;
}

/** The browser-pane entries at the pin, or null when orca/src is absent. */
export function readToolSources(root = REPO_ROOT) {
    const dir = join(root, REL.browserPane);
    if (!existsSync(join(root, 'orca', 'src'))) return null;
    if (!existsSync(dir)) return [];
    const list = (d) => readdirSync(d, { withFileTypes: true }).map((e) => ({ name: e.name, dir: e.isDirectory() }));
    return toolSources(list(dir), existsSync(join(dir, 'assemble-chrome')) ? list(join(dir, 'assemble-chrome')) : []);
}
export const SHAPES = ['command', 'render', 'webTabKind', 'skip', 'deferred'];

/** theia/node_modules/typescript, or undefined when it is not installed. */
export function loadTypescript(root = REPO_ROOT) {
    try { return createRequire(join(root, 'theia', 'package.json'))('typescript'); } catch { return undefined; }
}

/** Removes // and block comments outside string and template literals. */
export function stripComments(text) {
    let out = '';
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (c === '"' || c === "'" || c === '`') {
            let j = i + 1;
            while (j < text.length && text[j] !== c) j += text[j] === '\\' ? 2 : 1;
            out += text.slice(i, j + 1);
            i = j;
        } else if (c === '/' && text[i + 1] === '/') {
            while (i < text.length && text[i] !== '\n') i++;
            out += '\n';
        } else if (c === '/' && text[i + 1] === '*') {
            const end = text.indexOf('*/', i + 2);
            i = end < 0 ? text.length : end + 1;
        } else out += c;
    }
    return out;
}

/** The U-row ids of the README table, in order. */
export function parseURows(readme) {
    return readme.split('\n').map((l) => /^\|\s*(U-\d+)\s*\|/.exec(l)?.[1]).filter(Boolean);
}

/** The ids registered through registerCommand(...) across the given sources (text per file). */
export function registeredCommands(sources) {
    const texts = sources.map(stripComments);
    const strings = new Map();
    const objects = new Map();
    for (const t of texts) {
        for (const m of t.matchAll(/\bconst\s+(\w+)(?:\s*:\s*[\w.<>[\]]+)?\s*=\s*'([^']+)'/g)) strings.set(m[1], m[2]);
        for (const m of t.matchAll(/\bconst\s+(\w+)(?:\s*:\s*[\w.<>]+)?\s*=\s*\{([^{}]*)\}/g)) {
            const id = /\bid\s*:\s*('([^']+)'|\w+)/.exec(m[2]);
            if (id) objects.set(m[1], id[2] ?? id[1]);
        }
    }
    const value = (ref) => (ref.startsWith("'") ? ref.slice(1, -1) : strings.get(ref));
    const ids = new Set();
    for (const t of texts) {
        for (const m of t.matchAll(/registerCommand\(\s*(\{[^{}]*\}|[A-Za-z_]\w*)/g)) {
            const arg = m[1];
            const ref = arg.startsWith('{') ? /\bid\s*:\s*('([^']+)'|\w+)/.exec(arg)?.[1] : objects.get(arg);
            const id = ref && value(ref);
            if (id) ids.add(id);
        }
    }
    return ids;
}

/** Render methods defined in the widget source and called as this.<name>() in it. */
export function renderMethods(widget) {
    const t = stripComments(widget);
    const defined = [...t.matchAll(/^\s*(?:protected|private|public)?\s*(render\w*)\s*\([^)]*\)\s*:/gm)].map((m) => m[1]);
    return new Set(defined.filter((n) => t.includes(`this.${n}(`)));
}

/** KIND_CLASSES' keys in verify-web-tab-bridge.mjs. */
export function classifiedKinds(bridge) {
    const body = /const KIND_CLASSES = new Map\(\[([\s\S]*?)\n\]\);/.exec(stripComments(bridge))?.[1] ?? '';
    return new Set([...body.matchAll(/\[\s*'(\w+)'\s*,/g)].map((m) => m[1]));
}

/** Bold requirement ids under "## v2 Requirements", up to the next level-2 heading. */
export function v2Ids(requirements) {
    const at = requirements.indexOf('\n## v2 Requirements');
    if (at < 0) return new Set();
    const rest = requirements.slice(at + 1);
    const end = rest.indexOf('\n## ', 1);
    return new Set([...(end < 0 ? rest : rest.slice(0, end)).matchAll(/\*\*([A-Z]+-\d+)\*\*/g)].map((m) => m[1]));
}

/** Transpiles and evaluates the map source; returns ORCA_BROWSER_TOOLS. */
export function loadTools(ts, source) {
    const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } }).outputText;
    const module = { exports: {} };
    new Function('module', 'exports', js)(module, module.exports);
    return module.exports.ORCA_BROWSER_TOOLS;
}

/**
 * The verdict. inputs: { rows: string[], tools: Record<string, object>, commands: Set,
 * renders: Set, kinds: Set, v2: Set }. Returns { fails: string[], counts }.
 */
export function judge({ rows, tools, commands, renders, kinds, v2 }) {
    const fails = [];
    const counts = { contributions: 0, mark: 0, skips: 0, deferrals: 0 };
    if (rows.length === 0) return { fails: ['broken instrument: the README table parse yielded zero U-rows'], counts };
    if (!tools || typeof tools !== 'object') return { fails: ['broken instrument: ORCA_BROWSER_TOOLS is not exported'], counts };
    const keys = Object.keys(tools);
    for (const id of rows) if (!keys.includes(id)) fails.push(`unmapped U-row: ${id} is in the spike table and not in ORCA_BROWSER_TOOLS`);
    for (const id of keys) if (!rows.includes(id)) fails.push(`stale map entry: ${id} is in ORCA_BROWSER_TOOLS and not in the spike table`);
    for (const [id, entry] of Object.entries(tools)) {
        const shape = Object.keys(entry ?? {});
        if (shape.length !== 1 || !SHAPES.includes(shape[0])) { fails.push(`bad entry shape: ${id} has ${JSON.stringify(shape)}`); continue; }
        const [k] = shape;
        const v = entry[k];
        if (k === 'command') { counts.contributions++; if (!commands.has(v)) fails.push(`command not registered: ${id} -> ${v}`); }
        if (k === 'render') {
            if (!renders.has(v)) fails.push(`render method missing: ${id} -> ${v} is not defined and called in chrome-bar-widget.tsx`);
            if (v === 'renderAgentControl') counts.mark++; else counts.contributions++;
        }
        if (k === 'webTabKind') { counts.contributions++; if (!kinds.has(v)) fails.push(`kind not classified: ${id} -> ${v} is not a KIND_CLASSES key`); }
        if (k === 'deferred') { counts.deferrals++; if (!v2.has(v)) fails.push(`deferral to unknown id: ${id} -> ${v} is not a v2 requirement`); }
        if (k === 'skip') { counts.skips++; if (typeof v !== 'string' || !v.trim()) fails.push(`empty skip reason: ${id}`); }
    }
    return { fails, counts };
}

function walk(dir, out = []) {
    for (const name of readdirSync(dir)) {
        if (name === 'node_modules' || name === 'lib') continue;
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p, out);
        else if (/\.tsx?$/.test(name)) out.push(p);
    }
    return out;
}

/** Reads the tree into the verdict's inputs. */
export function gather(ts, root = REPO_ROOT) {
    const read = (rel) => readFileSync(join(root, rel), 'utf8');
    const ext = join(root, REL.extensions);
    const sources = readdirSync(ext).flatMap((e) => (existsSync(join(ext, e, 'src')) ? walk(join(ext, e, 'src')) : []));
    return {
        rows: parseURows(read(REL.readme)),
        tools: loadTools(ts, read(REL.tools)),
        commands: registeredCommands(sources.map((p) => readFileSync(p, 'utf8'))),
        renders: renderMethods(read(REL.widget)),
        kinds: classifiedKinds(read(REL.bridge)),
        v2: v2Ids(read(REL.requirements)),
        files: sources.length,
    };
}

// ---------------------------------------------------------------- self-test

const FIX = {
    readme: '| ID | Tool | PB | Note |\n|---|---|---|---|\n| U-01 | Address | chrome bar | x |\n| U-02 | Mark | chrome bar | x |\n| U-03 | Popups | native | x |\n| U-04 | Grab | panel | x |\n| U-05 | Profiles | skip | x |\n',
    tools: "export const ORCA_BROWSER_TOOLS = Object.freeze({ 'U-01': { command: 'pb.focus' }, 'U-02': { render: 'renderAgentControl' }, 'U-03': { webTabKind: 'webTabAdopt' }, 'U-04': { deferred: 'BRW-06' }, 'U-05': { skip: 'one profile' } });\n",
    commands: "export const FOCUS_ID = 'pb.focus';\nexport const FOCUS: Command = { id: FOCUS_ID, label: 'Focus' };\nclass C { registerCommands(c) { c.registerCommand(FOCUS, { execute: () => 1 }); } }\n",
    widget: 'class W {\n    protected renderAgentControl(): React.ReactNode { return 1; }\n    protected render(): React.ReactNode { return this.renderAgentControl(); }\n}\n',
    bridge: "const KIND_CLASSES = new Map([\n    ['webTabOpen', 'tab-lifecycle'],\n    ['webTabAdopt', 'tab-lifecycle'],\n]);\n",
    requirements: '## v1 Requirements\n- **BRW-02**: x\n## v2 Requirements\n- **BRW-06**: Grab.\n## Out of Scope\n- **BRW-99**: no.\n',
};

const PLANTS = [
    ['added-u-row', (f) => ({ ...f, readme: `${f.readme}| U-06 | New | native | x |\n` }), 'unmapped U-row: U-06'],
    ['removed-map-entry', (f) => ({ ...f, tools: f.tools.replace(" 'U-05': { skip: 'one profile' } ", ' ') }), 'unmapped U-row: U-05'],
    ['command-not-registered', (f) => ({ ...f, commands: f.commands.replace('c.registerCommand(FOCUS,', 'c.other(FOCUS,') }), 'command not registered: U-01'],
    ['render-method-missing', (f) => ({ ...f, widget: f.widget.replace('return this.renderAgentControl();', 'return 0;') }), 'render method missing: U-02'],
    ['kind-not-classified', (f) => ({ ...f, bridge: f.bridge.replace("    ['webTabAdopt', 'tab-lifecycle'],\n", '') }), 'kind not classified: U-03'],
    ['deferral-unknown-id', (f) => ({ ...f, tools: f.tools.replace("'BRW-06'", "'BRW-99'") }), 'deferral to unknown id: U-04'],
    ['empty-skip-reason', (f) => ({ ...f, tools: f.tools.replace("'one profile'", "' '") }), 'empty skip reason: U-05'],
    ['zero-row-parse', (f) => ({ ...f, readme: f.readme.replaceAll('| U-', '| V-') }), 'broken instrument'],
    ['stale-map-entry', (f) => ({ ...f, readme: f.readme.replace('| U-05 | Profiles | skip | x |\n', '') }), 'stale map entry: U-05'],
];

const FIX_SOURCES = {
    top: [{ name: 'annotate', dir: true }, { name: 'assemble-chrome', dir: true }, { name: 'BrowserPane.tsx', dir: false }, { name: 'BrowserPane.test.tsx', dir: false }, { name: 'helpers.ts', dir: false }],
    chrome: [{ name: 'BrowserFind.tsx', dir: false }, { name: 'BrowserFind.test.tsx', dir: false }],
    classified: { 'annotate/': ['U-04'], 'BrowserPane.tsx': { internal: 'the container' }, 'assemble-chrome/BrowserFind.tsx': ['U-01'], 'helpers.ts': ['U-02'] },
    unsourced: { 'U-03': 'native in PowerBrowser', 'U-05': 'skip' },
};

const SOURCE_PLANTS = [
    ['new-tool-module-at-re-pin', (f) => ({ ...f, chrome: [...f.chrome, { name: 'BrowserRecordPage.tsx', dir: false }] }), 'unclassified Orca browser source: assemble-chrome/BrowserRecordPage.tsx'],
    ['new-tool-directory-at-re-pin', (f) => ({ ...f, top: [...f.top, { name: 'record', dir: true }] }), 'unclassified Orca browser source: record/'],
    ['tool-module-gone', (f) => ({ ...f, chrome: [] }), 'stale tool source: assemble-chrome/BrowserFind.tsx'],
    ['source-names-unknown-row', (f) => ({ ...f, classified: { ...f.classified, 'annotate/': ['U-99'] } }), 'names U-99, which is not a U-row'],
    ['internal-without-reason', (f) => ({ ...f, classified: { ...f.classified, 'BrowserPane.tsx': { internal: ' ' } } }), 'neither U-rows nor internal with a reason'],
    ['nothing-derived', (f) => ({ ...f, top: [], chrome: [] }), 'broken instrument: no Orca browser tool source'],
    // Second review: .ts modules and chrome subdirectories are sources; every row is covered or unsourced.
    ['new-ts-prompt-module', (f) => ({ ...f, top: [...f.top, { name: 'browser-record-prompt.ts', dir: false }] }), 'unclassified Orca browser source: browser-record-prompt.ts'],
    ['new-chrome-subdirectory', (f) => ({ ...f, chrome: [...f.chrome, { name: 'record-tools', dir: true }] }), 'unclassified Orca browser source: assemble-chrome/record-tools/'],
    ['row-losing-its-last-source', (f) => ({ ...f, classified: { ...f.classified, 'assemble-chrome/BrowserFind.tsx': ['U-02'] } }), 'uncovered U-row: U-01'],
    ['unsourced-row-carried', (f) => ({ ...f, unsourced: { ...f.unsourced, 'U-04': 'stale' } }), 'stale unsourced row: U-04'],
];

function judgeSources(f) {
    return sourceFailures(toolSources(f.top, f.chrome), f.classified, parseURows(FIX.readme), f.unsourced);
}

function judgeFixture(ts, f) {
    return judge({
        rows: parseURows(f.readme), tools: loadTools(ts, f.tools), commands: registeredCommands([f.commands]),
        renders: renderMethods(f.widget), kinds: classifiedKinds(f.bridge), v2: v2Ids(f.requirements),
    });
}

export function runSelfTest() {
    const ts = loadTypescript();
    if (!ts) { console.log(skipLine(`${NAME} self-test`, 'theia/node_modules/typescript is not installed. Next step: run the audited yarn install in theia/')); return SKIP_EXIT; }
    const control = judgeFixture(ts, FIX);
    const sourceControl = judgeSources(FIX_SOURCES);
    if (sourceControl.length) { console.error(`${NAME} self-test: FAIL -- the tool-source control is not green: ${sourceControl.join(' | ')}`); return 1; }
    if (control.fails.length) { console.error(`${NAME} self-test: FAIL -- control is not green: ${control.fails.join(' | ')}`); return 1; }
    console.log(`${NAME} self-test: control green -- 5 fixture rows, one of each shape`);
    let failures = 0;
    for (const [name, plant, naming] of PLANTS) {
        const r = judgeFixture(ts, plant(FIX));
        if (!r.fails.some((s) => s.includes(naming))) { console.error(`  FAIL ${name} -> ${r.fails.join(' | ') || 'green'} (expected '${naming}')`); failures++; } else console.log(`  ok ${name} -> red, naming '${naming}'`);
    }
    for (const [name, plant, naming] of SOURCE_PLANTS) {
        const r = judgeSources(plant(FIX_SOURCES));
        if (!r.some((x) => x.includes(naming))) { console.error(`  FAIL ${name} -> ${r.join(' | ') || 'green'} (expected '${naming}')`); failures++; } else console.log(`  ok ${name} -> red, naming '${naming}'`);
    }
    if (failures) { console.error(`${NAME} self-test: FAIL -- ${failures} plant(s) did not go red naming the drift`); return 1; }
    console.log(`${NAME} self-test: PASS -- ${PLANTS.length + SOURCE_PLANTS.length} planted faults each went red naming the drift`);
    return 0;
}

export function main() {
    const ts = loadTypescript();
    if (!ts) { console.log(skipLine(NAME, 'theia/node_modules/typescript is not installed. Next step: run the audited yarn install in theia/')); return SKIP_EXIT; }
    const g = gather(ts);
    const { fails, counts } = judge(g);
    const sources = readToolSources();
    const skips = [];
    if (sources === null) skips.push('no fetched Orca tree (orca/src absent), so the pinned tool sources were not compared with ORCA_TOOL_SOURCES. Next step: bash scripts/fetch-orca.sh');
    else fails.push(...sourceFailures(sources, ORCA_TOOL_SOURCES, g.rows));
    for (const f of fails) console.error(`${NAME}: FAIL -- ${f}`);
    const code = verdictExit(NAME, fails, skips);
    if (code === 0) console.log(`${NAME}: PASS -- ${g.rows.length} U-rows equal the map's ${Object.keys(g.tools).length} entries: ${counts.contributions} existing contributions, ${counts.mark} mark, ${counts.skips} skips, ${counts.deferrals} deferrals; ${g.commands.size} registered command ids over ${g.files} extension sources, ${g.kinds.size} classified kinds, v2 ids ${[...g.v2].join(', ')}; the ${sources.length} tool sources at the pin equal ORCA_TOOL_SOURCES, each on U-rows or internal`);
    return code;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const arg = process.argv[2];
    if (arg && arg !== '--self-test') { console.error('usage: node scripts/verify-orca-browser-tools.mjs [--self-test]'); process.exit(2); }
    process.exit(arg === '--self-test' ? runSelfTest() : main());
}
