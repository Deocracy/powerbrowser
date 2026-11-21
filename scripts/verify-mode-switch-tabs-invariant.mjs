#!/usr/bin/env node
/**
 * GUI-07's mode-switch tabs-invariant gate (14-02): no anchored switch-path
 * body can close, move, or detach a tab without this gate going red by name.
 *
 * It DERIVES at check time, from the mode service and the chrome-bar widget
 * sources, the set of shell-mutating calls on every mode-switch path and
 * compares as SET EQUALITY against the one EXPECTED_SWITCH_CALLS allowlist
 * below: stock perspective switching, side-panel expand and collapse (plus
 * the bottom dock's expandPanel/collapsePanel spelling), contribution-routed
 * placeholder open and close through the descriptor slot seam, and the chip
 * re-assertion. A surplus call is an unreviewed shell mutation on the switch
 * path; a missing call is a dropped invariant surface; an empty derivation
 * fails as a broken instrument, never passes as clean.
 *
 * The switch path is scoped to named functions, not whole files: the save
 * and load paths legitimately touch storage, the file service, and input,
 * and scanning them here would either allowlist storage calls on the switch
 * path or red on every save. The anchors are the function definitions; a
 * renamed function fails distinctly as anchor drift, not as a false clean.
 *
 * That anchored half has a known ceiling, and two whole-file derivations sit
 * behind it to cover what it cannot see:
 *
 * 1. THE FORBIDDEN LAYOUT VOCABULARY. Moving a shell mutation one hop into a
 *    private helper leaves the anchored bodies clean, so the anchors alone
 *    can be walked around. The vocabulary is DERIVED from stock's own type
 *    declarations -- every method of `PerspectiveService` and
 *    `PerspectiveServiceInternal`, plus every `*LayoutData` method of
 *    `ApplicationShell` -- and every `.ts`/`.tsx` under the modes and
 *    chrome-bar sources is searched WHOLE-FILE for a call to one. Each name is
 *    compared as set equality against DECLARED_LAYOUT_USES: an undeclared file
 *    calling one is an unreviewed layout swap, a declared file that stopped
 *    calling one is a stale exception. Deriving the vocabulary from the `.d.ts`
 *    rather than listing it is the only mechanism in the tree that goes red
 *    when an upstream @theia re-pin ADDS a layout-swapping method: a new
 *    interface method is a new forbidden word the moment it is pinned.
 *
 * 2. THE STOCK ORDERING. The main-area exemption
 *    (modes/src/browser/main-area-exemption.ts) works only because stock calls
 *    `descriptor.onDeactivate` BEFORE it snapshots the live layout and before
 *    it reads the target's snapshot back. That ordering lives in
 *    @theia/core, which hard rule 1 forbids editing and a re-pin can rewrite
 *    silently: nothing else in this tree would notice, and the mode switch
 *    would quietly go back to destroying main-area tabs. It is derived from
 *    the stock source at check time and required.
 *
 * Reading `theia/node_modules` from a --quick check is precedented
 * (verify-theia-branding.mjs:72) and is the entire point here: the upstream
 * re-pin is the event these two derivations exist to catch.
 *
 * The last part derives the two mode command ids from the commands source
 * with set equality plus the contracted save label verbatim and the labelless
 * activate command, and requires code call sites to import the exported
 * consts rather than re-spelling the strings.
 *
 * Honestly --quick: reads text sources only. No build, no browser, no
 * display, no network.
 *
 * Usage:
 *   node scripts/verify-mode-switch-tabs-invariant.mjs
 *   node scripts/verify-mode-switch-tabs-invariant.mjs --self-test
 */

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'verify-mode-switch-tabs-invariant';

const SERVICE_REL = 'theia/extensions/modes/src/browser/mode-service.ts';
const WIDGET_REL = 'theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx';
const COMMANDS_REL = 'theia/extensions/modes/src/browser/modes-commands.ts';
const DESCRIPTORS_REL = 'theia/extensions/modes/src/browser/mode-descriptors.ts';
const MODES_MODULE_REL = 'theia/extensions/modes/src/browser/modes-frontend-module.ts';
const EXEMPTION_REL = 'theia/extensions/modes/src/browser/main-area-exemption.ts';
const SETUPS_REL = 'theia/extensions/modes/src/browser/setups-service.ts';

/** Stock sources the two whole-file derivations read. Never written to. */
const STOCK_PERSPECTIVE_DTS_REL = 'theia/node_modules/@theia/core/lib/browser/perspective-service.d.ts';
const STOCK_PERSPECTIVE_JS_REL = 'theia/node_modules/@theia/core/lib/browser/perspective-service.js';
const STOCK_SHELL_DTS_REL = 'theia/node_modules/@theia/core/lib/browser/shell/application-shell.d.ts';

/** Every `.ts`/`.tsx` below these roots is scanned whole-file for the vocabulary. */
const SCANNED_SRC_DIRS = Object.freeze([
    'theia/extensions/modes/src',
    'theia/extensions/chrome-bar/src',
]);

/**
 * The declared layout-API call sites: derived vocabulary name -> the files
 * allowed to call it. Every derived name absent from this table is forbidden
 * outright, which is what makes an upstream re-pin's NEW method start life
 * banned rather than silently permitted.
 *
 * The exemption module is the one declared user of the internal snapshot API:
 * reshaping the saved layout is exactly its job (main-area-exemption.ts:205),
 * and confining those four names to it is what keeps a second, unreviewed
 * writer of stock's snapshots from appearing. `switchPerspective` stays
 * declared where the fix deliberately keeps it -- the mode service's one
 * anchored call (the setups restore goes through ModeService since NG-029)
 * -- so the reroute of the toggle
 * (which now dispatches the mode command instead) cannot be undone without
 * this going red. Registration and the active-id read are neither destructive
 * nor layout-swapping, and are declared where they already are.
 */
const DECLARED_LAYOUT_USES = Object.freeze({
    registerPerspective: Object.freeze([MODES_MODULE_REL, SERVICE_REL]),
    switchPerspective: Object.freeze([SERVICE_REL]),
    getActivePerspectiveId: Object.freeze([SERVICE_REL, SETUPS_REL, WIDGET_REL]),
    getRegisteredPerspectives: Object.freeze([EXEMPTION_REL]),
    getSavedPerspectiveIds: Object.freeze([EXEMPTION_REL]),
    getSavedLayout: Object.freeze([EXEMPTION_REL]),
    setSavedLayout: Object.freeze([EXEMPTION_REL]),
});

/**
 * The declared switch-path contract, and the sibling of DECLARED_LAYOUT_USES
 * above: editing it is how a deliberate switch-path change is made -- it
 * shows up in the diff for review. Everything it is compared against is
 * derived at check time.
 */
const EXPECTED_SWITCH_CALLS = Object.freeze([
    'switchPerspective',
    'expand',
    'collapse',
    'expandPanel',
    'collapsePanel',
    'openOrganisingSlot',
    'closeOrganisingSlot',
    // 'setElement' left with the tab-count chip (14-UI-SPEC amended
    // 2026-09-08): the chip was the only status-bar element the switch path
    // wrote, and the invariant it displayed is now asserted by the
    // before/after countTabs comparison in selectMode plus the live row,
    // never by a rendered count.
    //
    // 'setHidden' arrives with the same amendment's per-mode furniture rule:
    // Coding keeps the left icon rail and the status bar, Browsing and
    // Organising do not. It is allowlisted for the FURNITURE only. Both
    // targets are chrome -- the status-bar widget and the left panel's
    // container -- and neither is a content tab, so the tabs invariant is
    // untouched by it. A setHidden reaching a main-area widget would be the
    // regression this gate exists to catch; DECLARED_LAYOUT_USES still bounds
    // which files may touch layout at all.
    'setHidden',
]);

const EXPECTED_COMMAND_IDS = Object.freeze([
    'powerbrowser.modes.activate',
    'powerbrowser.modes.save-as-mode',
]);

const SAVE_LABEL = 'Save as Mode';

/** Switch-path function anchors: [rel, name, definition-pattern]. */
const SWITCH_FUNCTIONS = Object.freeze([
    { rel: SERVICE_REL, name: 'activateMode', pattern: /async\s+activateMode\s*\([^)]*\)\s*(?::\s*[^{]+)?\{/ },
    { rel: WIDGET_REL, name: 'selectMode', pattern: /selectMode\s*=\s*\([^)]*\)\s*=>/ },
    { rel: WIDGET_REL, name: 'selectCustomMode', pattern: /selectCustomMode\s*=\s*\([^)]*\)\s*=>/ },
    { rel: WIDGET_REL, name: 'syncModeFromPerspective', pattern: /syncModeFromPerspective\s*\([^)]*\)\s*(?::\s*[^{]+)?\{/ },
]);

function diff(actual, expected) {
    const a = new Set(actual);
    const e = new Set(expected);
    return {
        surplus: [...a].filter(x => !e.has(x)),
        missing: [...e].filter(x => !a.has(x)),
    };
}

/**
 * Blank strings (then comments) so brace matching and call derivation see
 * code shape only. Strings go first: a `//` inside a string is not a
 * comment, and an apostrophe inside a comment is not a string.
 */
function stripTs(src) {
    const noStrings = src
        .replace(/`(?:[^`\\]|\\.)*`/g, '``')
        .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
        .replace(/"(?:[^"\\\n]|\\.)*"/g, '""');
    return noStrings
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .split('\n')
        .filter(line => !/^\s*\/\//.test(line))
        .join('\n')
        .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/** Body of the anchored definition via brace matching on stripped source. */
function bodyOf(stripped, anchor, fnName, rel) {
    const at = stripped.search(anchor);
    if (at < 0) {
        return { error: `${rel}: switch-path anchor '${fnName}' not found -- the function was renamed or removed, so this comparison proves nothing` };
    }
    const open = stripped.indexOf('{', at);
    if (open < 0) {
        return { error: `${rel}: no body brace after switch-path anchor '${fnName}' -- the anchor pattern no longer matches the definition` };
    }
    let depth = 0;
    for (let i = open; i < stripped.length; i += 1) {
        if (stripped[i] === '{') {
            depth += 1;
        } else if (stripped[i] === '}') {
            depth -= 1;
            if (depth === 0) {
                return { body: stripped.slice(open + 1, i) };
            }
        }
    }
    return { error: `${rel}: unbalanced braces after switch-path anchor '${fnName}' -- the body cannot be derived` };
}

/**
 * Shell-mutating calls in an ANCHORED switch-path body: dotted calls on the
 * shell objects plus the descriptor slot seam both callers share. Optional
 * chaining (`?.`) at any hop derives the same call name as plain dots, so a
 * `?.` spelling cannot evade derivation. Callee bodies (visibilityFor,
 * resolveTarget) are out of scope by design -- the header claim covers the
 * anchored bodies only.
 */
function switchCallsOf(body) {
    const out = new Set();
    for (const m of body.matchAll(/this\.(?:shell|perspectives|statusBar)(?:\??\.[\w$]+)*\??\.(\w+)\s*\(/g)) {
        out.add(m[1]);
    }
    for (const m of body.matchAll(/(openOrganisingSlot|closeOrganisingSlot)\s*\(/g)) {
        out.add(m[1]);
    }
    return [...out];
}

/** Every `*_COMMAND_ID = '...'` value in the commands source. */
function derivedCommandIdsOf(source) {
    const ids = [];
    for (const m of source.matchAll(/\b[A-Z][A-Z0-9_]*_COMMAND_ID\s*=\s*'([^']+)'/g)) {
        ids.push(m[1]);
    }
    return ids;
}

/** Every `label: '...'` value in the commands source. */
function derivedCommandLabelsOf(source) {
    const labels = [];
    for (const m of source.matchAll(/label:\s*'([^']+)'/g)) {
        labels.push(m[1]);
    }
    return labels;
}

/**
 * Method names declared in an `export interface <name> { ... }` block of a
 * `.d.ts`. Signatures only: `readonly onDidChangePerspective: Event<string>`
 * is a property, not a layout operation, and subscribing to it is what the
 * chrome bar contribution is supposed to do.
 */
function interfaceMethodsOf(dts, interfaceName) {
    const at = dts.search(new RegExp(`export interface ${interfaceName}\\s*\\{`));
    if (at < 0) {
        return undefined;
    }
    const open = dts.indexOf('{', at);
    let depth = 0;
    for (let i = open; i < dts.length; i += 1) {
        if (dts[i] === '{') {
            depth += 1;
        } else if (dts[i] === '}') {
            depth -= 1;
            if (depth === 0) {
                const block = dts.slice(open + 1, i).replace(/\/\*[\s\S]*?\*\//g, '');
                return [...block.matchAll(/^\s*(\w+)\s*\(/gm)].map(m => m[1]);
            }
        }
    }
    return undefined;
}

/**
 * The forbidden layout vocabulary, derived from stock's declarations: both
 * perspective interfaces in full, plus every `*LayoutData` method the shell
 * declares. The shell half is matched by shape rather than named, so a stock
 * `restoreLayoutData` added in a future re-pin joins the vocabulary by itself.
 */
function layoutVocabularyOf(sources) {
    const failures = [];
    const names = new Set();

    const dts = sources[STOCK_PERSPECTIVE_DTS_REL] ?? '';
    for (const interfaceName of ['PerspectiveService', 'PerspectiveServiceInternal']) {
        const methods = interfaceMethodsOf(dts, interfaceName);
        if (!methods || methods.length === 0) {
            failures.push(`${STOCK_PERSPECTIVE_DTS_REL}: derived ZERO methods from interface ${interfaceName} -- the upstream declaration moved or was renamed, so the forbidden vocabulary is empty and the whole-file scan below proves nothing`);
            continue;
        }
        methods.forEach(name => names.add(name));
    }

    const shellDts = sources[STOCK_SHELL_DTS_REL] ?? '';
    const shellLayout = [...shellDts.matchAll(/^\s*(?:protected\s+|readonly\s+|abstract\s+)*(\w*LayoutData)\s*\(/gm)].map(m => m[1]);
    if (shellLayout.length === 0) {
        failures.push(`${STOCK_SHELL_DTS_REL}: derived ZERO *LayoutData methods -- the shell's layout API moved, so the destructive half of the vocabulary is missing and the scan below proves nothing`);
    }
    shellLayout.forEach(name => names.add(name));

    return { names: [...names].sort(), failures };
}

/** The scanned source set, enumerated from what readSources found on disk. */
function scannedRelsOf(sources) {
    return Object.keys(sources)
        .filter(rel => SCANNED_SRC_DIRS.some(dir => rel.startsWith(`${dir}/`)))
        .sort();
}

/**
 * Whole-file, receiverless: which scanned sources call each vocabulary name.
 * Receiverless on purpose -- the anchored half above is receiver-scoped, and
 * the hop it cannot follow is exactly a call moved onto some other object.
 * Strings and comments are blanked first, so this file's own prose about
 * `switchPerspective` and the exemption module's header (which quotes stock's
 * `getLayoutData` sequence verbatim) are not call sites.
 */
function layoutCallSitesOf(sources, names) {
    const rels = scannedRelsOf(sources);
    const byName = new Map(names.map(name => [name, new Set()]));
    for (const rel of rels) {
        const stripped = stripTs(sources[rel] ?? '');
        for (const name of names) {
            if (new RegExp(`\\.${name}\\s*\\(`).test(stripped)) {
                byName.get(name).add(rel);
            }
        }
    }
    return { rels, byName };
}

/** Vocabulary derivation plus the per-name set-equality comparison. */
function checkLayoutVocabulary(sources, failures) {
    const vocabulary = layoutVocabularyOf(sources);
    failures.push(...vocabulary.failures);
    if (vocabulary.names.length === 0) {
        return;
    }
    const { rels, byName } = layoutCallSitesOf(sources, vocabulary.names);
    if (rels.length === 0) {
        failures.push(`derived ZERO scanned sources under ${SCANNED_SRC_DIRS.join(' and ')} -- the whole-file scan found no file to read, so a clean result here would be green-by-empty-set`);
        return;
    }
    for (const name of vocabulary.names) {
        const siteDiff = diff([...byName.get(name)].sort(), [...(DECLARED_LAYOUT_USES[name] ?? [])].sort());
        if (siteDiff.surplus.length) {
            failures.push(`undeclared layout call '${name}' in ${siteDiff.surplus.join(', ')} -- a stock layout operation on the mode-switch surface that no declared exception covers`);
        }
        if (siteDiff.missing.length) {
            failures.push(`declared layout call '${name}' is GONE from ${siteDiff.missing.join(', ')} -- the declared exception is stale, or the call it covers was dropped`);
        }
    }
}

/**
 * The ordering the main-area exemption rests on, derived from the stock
 * source: `descriptor.onDeactivate` must run BEFORE the live layout is
 * snapshotted under the old id and before the target's snapshot is read back.
 * The exemption strips the main-area keys out of the saved layouts from that
 * hook, so a re-pin that moves the hook after either statement restores the
 * defect in full while every other check in the tree stays green.
 */
function checkStockOrdering(sources, failures) {
    const stripped = stripTs(sources[STOCK_PERSPECTIVE_JS_REL] ?? '');
    const found = bodyOf(stripped, /async\s+doSwitchPerspective\s*\([^)]*\)\s*\{/, 'doSwitchPerspective', STOCK_PERSPECTIVE_JS_REL);
    if (found.error) {
        failures.push(`${found.error} (upstream @theia moved the switch implementation; the ordering the main-area exemption depends on can no longer be derived)`);
        return;
    }
    const steps = [
        { label: 'descriptor onDeactivate (the exemption seam)', at: found.body.search(/onDeactivate\s*\(/) },
        { label: 'savedLayouts.set of the live layout', at: found.body.search(/savedLayouts\.set\s*\(/) },
        { label: 'savedLayouts.get of the target snapshot', at: found.body.search(/savedLayouts\.get\s*\(/) },
    ];
    const absent = steps.filter(step => step.at < 0);
    if (absent.length) {
        failures.push(`${STOCK_PERSPECTIVE_JS_REL}: derived NO position for ${absent.map(s => s.label).join(' and ')} inside doSwitchPerspective -- the ordering assertion has nothing to compare and proves nothing`);
        return;
    }
    for (let i = 1; i < steps.length; i += 1) {
        if (steps[i - 1].at >= steps[i].at) {
            failures.push(`${STOCK_PERSPECTIVE_JS_REL}: '${steps[i - 1].label}' no longer precedes '${steps[i].label}' in doSwitchPerspective -- the main-area exemption strips the saved layouts from a hook that now runs too late, so a mode's second visit would detach every main-area tab again`);
        }
    }
}

/** @returns {string[]} failure messages -- empty means the gate holds. */
function checkInvariant(sources) {
    const failures = [];
    const serviceSrc = sources[SERVICE_REL] ?? '';
    const widgetSrc = sources[WIDGET_REL] ?? '';
    const commandsSrc = sources[COMMANDS_REL] ?? '';
    const stripped = {
        [SERVICE_REL]: stripTs(serviceSrc),
        [WIDGET_REL]: stripTs(widgetSrc),
    };

    const derived = new Set();
    for (const fn of SWITCH_FUNCTIONS) {
        const found = bodyOf(stripped[fn.rel], fn.pattern, fn.name, fn.rel);
        if (found.error) {
            failures.push(found.error);
            continue;
        }
        for (const call of switchCallsOf(found.body)) {
            derived.add(call);
        }
    }
    if (derived.size === 0 && failures.length === 0) {
        failures.push('derived ZERO switch-path calls -- no shell call found in any switch-path body, so this comparison proves nothing');
    } else {
        const callDiff = diff([...derived].sort(), [...EXPECTED_SWITCH_CALLS].sort());
        if (callDiff.surplus.length) {
            failures.push(`switch path calls NOT in the allowlist (unreviewed shell mutation on a mode switch): ${callDiff.surplus.join(', ')}`);
        }
        if (callDiff.missing.length) {
            failures.push(`allowlisted switch path calls are GONE (dropped invariant surface): ${callDiff.missing.join(', ')}`);
        }
    }

    checkLayoutVocabulary(sources, failures);
    checkStockOrdering(sources, failures);

    const ids = derivedCommandIdsOf(commandsSrc);
    if (ids.length === 0) {
        failures.push(`${COMMANDS_REL}: derived ZERO mode command ids -- no *_COMMAND_ID = '...' line found, so this comparison proves nothing`);
    } else {
        const idDiff = diff(ids, [...EXPECTED_COMMAND_IDS]);
        if (idDiff.surplus.length) {
            failures.push(`${COMMANDS_REL}: mode command ids NOT in the declared contract (unreviewed command): ${idDiff.surplus.join(', ')}`);
        }
        if (idDiff.missing.length) {
            failures.push(`${COMMANDS_REL}: declared mode command ids are GONE: ${idDiff.missing.join(', ')}`);
        }
    }

    const labels = derivedCommandLabelsOf(commandsSrc);
    if (labels.length !== 1 || labels[0] !== SAVE_LABEL) {
        failures.push(`${COMMANDS_REL}: the mode commands must carry exactly one label, the contracted '${SAVE_LABEL}' (got [${labels.join(', ')}]) -- the activate command stays labelless`);
    }
    const activateBlock = /export const MODES_ACTIVATE[^;]*;/.exec(commandsSrc);
    if (!activateBlock) {
        failures.push(`${COMMANDS_REL}: the MODES_ACTIVATE declaration was not found -- the labelless activate command cannot be checked`);
    } else if (activateBlock[0].includes('label')) {
        failures.push(`${COMMANDS_REL}: the activate command gained a label -- it stays labelless by contract, toggle-invoked only`);
    }

    for (const id of ['MODES_ACTIVATE', 'MODES_SAVE_AS_MODE']) {
        if (!commandsSrc.includes(`registerCommand(${id},`)) {
            failures.push(`${COMMANDS_REL}: registration must use the ${id} const (registerCommand(${id}, ...) not found -- a re-spelled string bypasses const discipline)`);
        }
    }

    // Call-site const discipline: the bare command strings live in the const
    // definitions only; every other modes source imports the consts.
    for (const id of EXPECTED_COMMAND_IDS) {
        for (const rel of [SERVICE_REL, DESCRIPTORS_REL, WIDGET_REL, MODES_MODULE_REL]) {
            if ((sources[rel] ?? '').includes(`'${id}'`)) {
                failures.push(`${rel}: re-spelled mode command string '${id}' -- import the exported const from modes-commands instead`);
            }
        }
    }
    for (const [rel, from] of [
        [WIDGET_REL, "'@powerbrowser/modes/lib/browser/modes-commands'"],
    ]) {
        const src = sources[rel] ?? '';
        if (!new RegExp(`import\\s*\\{[^}]*MODES_ACTIVATE_COMMAND_ID[^}]*\\}\\s*from\\s*${from.replace(/[./]/g, m => `\\${m}`)}`).test(src)) {
            failures.push(`${rel}: no MODES_ACTIVATE_COMMAND_ID const import from the mode commands -- call sites import the const, never re-spell the string`);
        }
    }

    return failures;
}

function readSources() {
    const out = {};
    for (const rel of [
        SERVICE_REL, WIDGET_REL, COMMANDS_REL, DESCRIPTORS_REL, MODES_MODULE_REL,
        STOCK_PERSPECTIVE_DTS_REL, STOCK_PERSPECTIVE_JS_REL, STOCK_SHELL_DTS_REL,
    ]) {
        try {
            out[rel] = readFileSync(join(REPO_ROOT, rel), 'utf8');
        } catch {
            out[rel] = '';
        }
    }
    // The whole-file scan set: enumerated from the tree, never listed, so a
    // new source file under either extension is in scope the day it lands.
    for (const dir of SCANNED_SRC_DIRS) {
        let entries = [];
        try {
            entries = readdirSync(join(REPO_ROOT, dir), { recursive: true });
        } catch {
            entries = [];
        }
        for (const entry of entries) {
            const rel = `${dir}/${String(entry).split(sep).join('/')}`;
            if (!/\.tsx?$/.test(rel) || rel in out) {
                continue;
            }
            try {
                out[rel] = readFileSync(join(REPO_ROOT, rel), 'utf8');
            } catch {
                // A directory entry that is not readable as a file is not a source.
            }
        }
    }
    return out;
}

function main() {
    if (process.argv.includes('--self-test')) {
        return selfTest();
    }
    const sources = readSources();
    const failures = checkInvariant(sources);
    if (failures.length) {
        console.error(`${NAME}: FAIL -- the mode-switch surface drifted from the declared contract.`);
        console.error(`If the change is deliberate, edit EXPECTED_SWITCH_CALLS or DECLARED_LAYOUT_USES in this script in the SAME commit so the contract change is visible in the diff.`);
        failures.forEach(f => console.error(`  - ${f}`));
        return 1;
    }
    const vocabulary = layoutVocabularyOf(sources).names.length;
    const scanned = scannedRelsOf(sources).length;
    console.log(`${NAME}: PASS -- ${EXPECTED_SWITCH_CALLS.length} allowlisted switch calls and ${EXPECTED_COMMAND_IDS.length} mode commands match the declared contract; ${vocabulary} stock layout methods are forbidden across ${scanned} scanned sources except where declared; stock still deactivates before it saves and reads`);
    return 0;
}

function selfTest() {
    const clean = readSources();
    const baseline = checkInvariant(clean);
    if (baseline.length !== 0) {
        console.error(`${NAME} --self-test: FAIL -- the unmodified tree is already red, so the planted-fault results below would be meaningless:`);
        baseline.forEach(f => console.error(`  ${f}`));
        return 1;
    }

    const cleanService = clean[SERVICE_REL];
    const cleanCommands = clean[COMMANDS_REL];
    const cleanStockJs = clean[STOCK_PERSPECTIVE_JS_REL];
    const cases = [
        {
            name: 'planted switch-path close call',
            mutate: sources => {
                const anchor = "        if (rules.organising) {\n            openOrganisingSlot();";
                if (!cleanService.includes(anchor)) {
                    return sources;
                }
                return {
                    ...sources,
                    [SERVICE_REL]: cleanService.replace(
                        anchor,
                        "        if (target === 'organising') {\n            this.shell.closeWidget('planted');\n            openOrganisingSlot()"
                    ),
                };
            },
            expect: 'closeWidget',
        },
        {
            name: 'planted command-id removal',
            mutate: sources => ({
                ...sources,
                [COMMANDS_REL]: cleanCommands.replace(
                    "export const MODES_SAVE_AS_MODE_COMMAND_ID = 'powerbrowser.modes.save-as-mode';\n",
                    '// planted removal: save-as-mode id line deleted\n'
                ),
            }),
            expect: 'powerbrowser.modes.save-as-mode',
        },
        {
            name: 'planted label drift',
            mutate: sources => ({
                ...sources,
                [COMMANDS_REL]: cleanCommands.replace(
                    "    label: 'Save as Mode',",
                    "    label: 'Save Mode',"
                ),
            }),
            expect: 'Save as Mode',
        },
        {
            // The hop the anchored half cannot follow, and the reason the
            // whole-file vocabulary exists: the destructive call sits in a
            // private helper, so every anchored body stays clean.
            name: 'planted setLayoutData in a callee, not an anchored body',
            mutate: sources => ({
                ...sources,
                [SERVICE_REL]: cleanService.replace(
                    "    protected async ensureInArea(",
                    "    protected async plantedRestore(): Promise<void> {\n"
                    + "        await this.shell.setLayoutData({} as never);\n"
                    + "    }\n\n"
                    + "    protected async ensureInArea("
                ),
            }),
            expect: 'setLayoutData',
        },
        {
            // The re-introduced destructive snapshot write: saving the LIVE
            // layout under a perspective id on the switch path is precisely
            // what the exemption strips back out, so doing it here would undo
            // the fix from inside our own code.
            name: 'planted destructive setSavedLayout(id, getLayoutData()) on the switch path',
            mutate: sources => ({
                ...sources,
                [SERVICE_REL]: cleanService.replace(
                    "        const target = this.resolveTarget(id);",
                    "        const target = this.resolveTarget(id);\n"
                    + "        this.internal.setSavedLayout(target, this.shell.getLayoutData());"
                ),
            }),
            expect: 'setSavedLayout',
        },
        {
            // An upstream re-pin that moves the deactivate hook after the
            // snapshot. Nothing in our own tree changes, every other check
            // stays green, and the defect is back in full.
            name: 'planted stock reordering: onDeactivate after the layout save',
            mutate: sources => ({
                ...sources,
                [STOCK_PERSPECTIVE_JS_REL]: cleanStockJs.replace(
                    "        if (oldPerspective?.onDeactivate) {\n"
                    + "            oldPerspective.onDeactivate(this.shell);\n"
                    + "        }\n"
                    + "        if (this.activePerspectiveId) {\n"
                    + "            this.savedLayouts.set(this.activePerspectiveId, this.shell.getLayoutData());\n"
                    + "        }\n",
                    "        if (this.activePerspectiveId) {\n"
                    + "            this.savedLayouts.set(this.activePerspectiveId, this.shell.getLayoutData());\n"
                    + "        }\n"
                    + "        if (oldPerspective?.onDeactivate) {\n"
                    + "            oldPerspective.onDeactivate(this.shell);\n"
                    + "        }\n"
                ),
            }),
            expect: 'onDeactivate',
        },
        {
            // The claim the derived vocabulary is here for, planted rather
            // than asserted in prose: an upstream re-pin that ADDS a
            // layout-swapping method, and one of our sources that starts
            // calling it. The name is forbidden the moment it is pinned,
            // because the vocabulary is read off the interface, not listed.
            name: 'planted upstream method + a call site for it',
            mutate: sources => ({
                ...sources,
                [STOCK_PERSPECTIVE_DTS_REL]: (clean[STOCK_PERSPECTIVE_DTS_REL] ?? '').replace(
                    '    resetCurrentPerspective(): Promise<void>;',
                    '    resetCurrentPerspective(): Promise<void>;\n    swapLayoutWholesale(id: string): Promise<void>;'
                ),
                [SERVICE_REL]: cleanService.replace(
                    "        const target = this.resolveTarget(id);",
                    "        const target = this.resolveTarget(id);\n"
                    + "        await this.perspectives.swapLayoutWholesale(target);"
                ),
            }),
            expect: 'swapLayoutWholesale',
        },
    ];

    let failed = 0;
    for (const testCase of cases) {
        const mutated = testCase.mutate(clean);
        // A planted fault that does not change the source at all would make
        // the case vacuous -- assert the mutation actually landed.
        if (JSON.stringify(mutated) === JSON.stringify(clean)) {
            console.error(`${NAME} --self-test: FAIL -- '${testCase.name}' did not modify the source; the anchor it edits has drifted`);
            failed++;
            continue;
        }
        const failures = checkInvariant(mutated);
        if (!failures.some(f => f.includes(testCase.expect))) {
            console.error(`${NAME} --self-test: FAIL -- '${testCase.name}' did not go red naming '${testCase.expect}'; got: ${failures.join(' | ') || '(no failures at all)'}`);
            failed++;
        } else {
            console.log(`  ok  ${testCase.name} -> red, naming '${testCase.expect}'`);
        }
    }

    if (failed) {
        return 1;
    }
    console.log(`${NAME} --self-test: PASS -- all planted faults went red`);
    return 0;
}

process.exit(main());
