#!/usr/bin/env node
/**
 * GUI-07's shipped-mode defaults gate (14-01): the three shipped modes are
 * the contract between the modes extension, the mode service's switch path,
 * and the chrome-bar toggle. Three sources that must agree, and this gate is
 * where they are made to.
 *
 * Everything here is DERIVED from the tree on both sides and compared as SET
 * EQUALITY. There is no declared copy of the shipped modes in this file: a
 * hand-kept expectation list can only ever agree with the tree it was copied
 * from, so `mode-descriptors.ts` IS the expectation and every comparison
 * below runs it against an independent second source:
 *
 * 1. ORDER, IDS AND LABELS vs the chrome-bar toggle. The shipped modes are
 *    read in `SHIPPED_MODES` export order -- the array the toggle's order
 *    actually comes from, not the order the consts happen to be written in --
 *    and compared to the widget's `MODES` literal. The widget never imports
 *    the descriptors, so the bridge rule it relies on (a segment label
 *    lowercased IS the descriptor id) is asserted here rather than trusted.
 *
 * 2. VIEW PLACEMENTS vs `SHIPPED_MODE_RULES` on the switch path. A descriptor's
 *    `viewPlacements` is applied by stock on a mode's FIRST activation only
 *    (perspective-service.js:151-193): every later activation reaches
 *    `expand(id)`, which is a pure find over the widgets already docked
 *    (side-panel-handler.js:282-289) and does nothing on a miss. That gap is
 *    the defect that left Coding showing no Theia view at all, and
 *    `SHIPPED_MODE_RULES`' `views` docks are the every-activation half that
 *    closes it. A placement with no matching rules `view` is first-visit-only
 *    by construction, so the two sets are required to be equal.
 *
 * 3. COLLAPSE AREAS vs the `SHIPPED_MODE_RULES` `'closed'` rules on the
 *    switch path. Same split: the descriptor's
 *    `chromeOptions.collapseAreas` collapses on first activation,
 *    the rules table decides what every activation asserts. An area collapsed
 *    by one and left open by the other makes a mode look different on its
 *    second visit than its first.
 *
 * 4. THE TOGGLE'S CHANNEL. Shipped segments must reach the mode command, not
 *    stock perspective switching: everything a mode contracts -- the panel
 *    map, the organising slot, the Explorer dock -- lives behind
 *    `MODES_ACTIVATE_COMMAND_ID`, and a direct `switchPerspective` from the
 *    widget skips all of it. Derived from the anchored `selectMode` body, so
 *    an import that nothing calls does not satisfy it.
 *
 * 5. THE IDE DRESS (P64-19). The chrome bar decides dress by mode in three
 *    places -- applyStripHome's `ideDress` initializer, publishDragRegions'
 *    menubar row and chrome-bar.css's top-panel rules that reserve the
 *    menubar height -- and the mode service shows the IDE furniture for the
 *    `furniture: true` rows of SHIPPED_MODE_RULES. All four mode sets are
 *    derived and required equal: a mode in one and not another shows a
 *    menubar with no room for it, or drag regions over the wrong row.
 *
 * Modes ship as data, never manifest flags: a scoped negated search fails on
 * any bare `[modes]` section in the configuration schema, the generator, or
 * the modes sources. Backtick-wrapped prose mentions (this file's own
 * contract discussion, descriptor comments) are exempt -- and the self-test
 * plants a bare flag in every scope to prove the search is not vacuous.
 *
 * Every derivation above fails as a broken instrument when it yields nothing:
 * no descriptors, no toggle segments, no placements, no visibility flags.
 * None of them can pass green-by-empty-set.
 *
 * Honestly --quick: reads text sources only. No build, no browser, no
 * display, no network.
 *
 * Usage:
 *   node scripts/verify-mode-toggle-commands.mjs
 *   node scripts/verify-mode-toggle-commands.mjs --self-test
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'verify-mode-toggle-commands';

const DESCRIPTORS_REL = 'theia/extensions/modes/src/browser/mode-descriptors.ts';
const SERVICE_REL = 'theia/extensions/modes/src/browser/mode-service.ts';
const WIDGET_REL = 'theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx';
const CSS_REL = 'theia/extensions/chrome-bar/src/browser/chrome-bar.css';
const SCHEMA_REL = 'scripts/lib/config-schema.json';
const GENERATOR_REL = 'scripts/generate.mjs';
const MODES_GLOB_RELS = [
    'theia/extensions/modes/src/browser/mode-descriptors.ts',
    'theia/extensions/modes/src/browser/modes-frontend-module.ts',
    'theia/extensions/modes/src/browser/mode-service.ts',
    'theia/extensions/modes/src/browser/modes-commands.ts',
    'theia/extensions/modes/src/browser/setups-service.ts',
    'theia/extensions/modes/src/browser/setups-commands.ts',
    'theia/extensions/modes/src/browser/dependent-windows.ts',
];

/** The shell areas a mode can collapse, per the stock chrome options. */
const AREAS = Object.freeze(['left', 'right', 'bottom']);

function diff(actual, expected) {
    const a = new Set(actual);
    const e = new Set(expected);
    return {
        surplus: [...a].filter(x => !e.has(x)),
        missing: [...e].filter(x => !a.has(x)),
    };
}

/**
 * Blank every string literal and comment with SAME-LENGTH whitespace, so
 * brace matching sees code shape only while every offset still indexes the
 * raw source -- the derivations below need the string VALUES, so bodies are
 * located on the mask and sliced out of the original.
 */
function maskLiterals(src) {
    const blank = m => m.replace(/[^\n]/g, ' ');
    return src
        .replace(/`(?:[^`\\]|\\.)*`/g, blank)
        .replace(/'(?:[^'\\\n]|\\.)*'/g, blank)
        .replace(/"(?:[^"\\\n]|\\.)*"/g, blank)
        .replace(/\/\*[\s\S]*?\*\//g, blank)
        .replace(/(^|[^:])\/\/.*$/gm, (m, lead) => lead + blank(m.slice(lead.length)));
}

/**
 * The raw text between the braces of the first definition matching `anchor`.
 * Scanning starts at the END of the match, not its start: a method whose
 * anchor spans its return type (`visibilityFor(...): { left: boolean ... }`)
 * would otherwise have that type object read as its body.
 */
function bodyOf(src, anchor) {
    const masked = maskLiterals(src);
    const match = anchor.exec(masked);
    if (!match) {
        return undefined;
    }
    const open = masked.indexOf('{', match.index + match[0].length - 1);
    if (open < 0) {
        return undefined;
    }
    let depth = 0;
    for (let i = open; i < masked.length; i += 1) {
        if (masked[i] === '{') {
            depth += 1;
        } else if (masked[i] === '}') {
            depth -= 1;
            if (depth === 0) {
                return src.slice(open + 1, i);
            }
        }
    }
    return undefined;
}

/**
 * The shipped modes, in `SHIPPED_MODES` export order. Order comes from the
 * export array rather than the order the descriptor consts are written in:
 * the export is what the toggle's order is actually built from, so reordering
 * it -- without moving a single descriptor block -- must be what this sees.
 */
function derivedShippedModes(source) {
    const exported = /export const SHIPPED_MODES[^=]*=\s*\[([^\]]*)\]/.exec(source);
    if (!exported) {
        return { error: `${DESCRIPTORS_REL}: no SHIPPED_MODES export array found -- the shipped-mode order cannot be derived, so every comparison below would prove nothing` };
    }
    const constNames = [...exported[1].matchAll(/[A-Za-z_$][\w$]*/g)].map(m => m[0]);
    const modes = [];
    const failures = [];
    for (const constName of constNames) {
        const block = bodyOf(source, new RegExp(`const\\s+${constName}\\s*:\\s*PerspectiveDescriptor\\s*=\\s*\\{`));
        if (block === undefined) {
            failures.push(`${DESCRIPTORS_REL}: no descriptor block found for exported mode '${constName}' -- it is listed in SHIPPED_MODES but has no PerspectiveDescriptor literal`);
            continue;
        }
        const id = /\bid:\s*'([^']+)'/.exec(block);
        const label = /\blabel:\s*'([^']+)'/.exec(block);
        if (!id || !label) {
            failures.push(`${DESCRIPTORS_REL}: descriptor '${constName}' is missing an ${id ? 'label' : 'id'} literal -- the id/label pair the toggle bridge maps on is broken`);
            continue;
        }
        const collapse = /collapseAreas:\s*\[([^\]]*)\]/.exec(block);
        const placementRegion = /viewPlacements:\s*new Map[^(]*\(\s*\[([\s\S]*?)\]\s*\)/.exec(block);
        modes.push({
            constName,
            id: id[1],
            label: label[1],
            collapseAreas: collapse ? [...collapse[1].matchAll(/'([^']+)'/g)].map(m => m[1]) : [],
            placements: placementRegion
                ? [...placementRegion[1].matchAll(/\[\s*'([^']+)'\s*,\s*'([^']+)'\s*\]/g)].map(m => `${m[1]}->${m[2]}`)
                : [],
        });
    }
    return { modes, failures };
}

/** The widget `MODES = [...]` literal, in source order. */
function derivedModesLiteralOf(source) {
    const m = /MODES\s*=\s*\[([^\]]*)\]/.exec(source);
    if (!m) {
        return [];
    }
    return [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]);
}

/**
 * NG-035: the shipped rows of the mode service's SHIPPED_MODE_RULES table,
 * one row per line: `{ byId: { <id>: { left, right, bottom, placements } } }`,
 * each area rule the literal 'open' | 'closed' | 'keep' and each placement a
 * `view->area` string. Undefined when the table cannot be read.
 */
function derivedShippedRules(source) {
    const at = source.search(/export const SHIPPED_MODE_RULES\b/);
    if (at < 0) {
        return undefined;
    }
    const end = source.indexOf('});', at);
    const block = source.slice(at, end < 0 ? undefined : end);
    const byId = {};
    for (const row of block.matchAll(/^\s*(\w+):\s*\{(.*)\},?\s*$/gm)) {
        const text = row[2];
        const rule = { placements: [] };
        for (const area of AREAS) {
            const m = new RegExp(`\\b${area}:\\s*'(open|closed|keep)'`).exec(text);
            if (m) {
                rule[area] = m[1];
            }
        }
        const furniture = /\bfurniture:\s*(true|false)\b/.exec(text);
        rule.furniture = furniture ? furniture[1] === 'true' : undefined;
        const views = /views:\s*\{([^}]*)\}/.exec(text);
        for (const area of views ? AREAS : []) {
            const list = new RegExp(`\\b${area}:\\s*\\[([^\\]]*)\\]`).exec(views[1]);
            for (const view of list ? list[1].matchAll(/'([^']+)'/g) : []) {
                rule.placements.push(`${view[1]}->${area}`);
            }
        }
        if (AREAS.every(area => rule[area])) {
            byId[row[1]] = rule;
        }
    }
    return Object.keys(byId).length ? { byId } : undefined;
}

/** The quoted mode ids `<name> === '<id>'` compares against in `text`. */
function comparedIds(text, name) {
    return [...text.matchAll(new RegExp(`\\b${name}\\s*===\\s*'([^']+)'`, 'g'))].map(m => m[1]);
}

/**
 * P64-19: the four mode sets that decide the IDE dress, each derived from its
 * own source. An empty set means the rule moved, never "no mode".
 */
function derivedDressSets(widgetSrc, cssSrc, rules) {
    const strip = bodyOf(widgetSrc, /applyStripHome\s*\([^)]*\)\s*:\s*void\s*\{/);
    const init = strip === undefined ? undefined : /\bconst\s+ideDress\s*=\s*([^;]*);/.exec(strip);
    const drag = bodyOf(widgetSrc, /publishDragRegions\s*\(\s*\)\s*:\s*void\s*\{/);
    const branch = drag === undefined ? undefined : /if\s*\(([^{]*&&\s*menubar)\s*\)\s*\{/.exec(drag);
    const css = cssSrc.replace(/\/\*[\s\S]*?\*\//g, '');
    const cssIds = [];
    for (const rule of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        if (rule[2].includes('--theia-private-menubar-height')) {
            cssIds.push(...[...rule[1].matchAll(/data-pb-mode="([^"]+)"/g)].map(m => m[1]));
        }
    }
    return [
        { name: `${WIDGET_REL} applyStripHome ideDress`, ids: init ? comparedIds(init[1], 'modeId') : [] },
        { name: `${WIDGET_REL} publishDragRegions menubar row`, ids: branch ? comparedIds(branch[1], 'mode') : [] },
        { name: `${CSS_REL} top-panel menubar height rule`, ids: cssIds },
        { name: `${SERVICE_REL} SHIPPED_MODE_RULES furniture:true rows`, ids: rules ? Object.keys(rules.byId).filter(id => rules.byId[id].furniture === true) : [] },
    ];
}

/**
 * Bare `[modes]` section markers per scoped file, with backtick-wrapped
 * prose mentions exempted. Returns { rel, line } rows -- empty is clean.
 */
function derivedManifestFlags(sources, rels) {
    const rows = [];
    for (const rel of rels) {
        const src = sources[rel] ?? '';
        const lines = src.split('\n');
        lines.forEach((line, index) => {
            const stripped = line.replace(/`\[modes\]`/g, '');
            if (stripped.includes('[modes]')) {
                rows.push({ rel, line: index + 1 });
            }
        });
    }
    return rows;
}

/** @returns {string[]} failure messages -- empty means the gate holds. */
function checkModes(sources) {
    const failures = [];
    const descriptorsSrc = sources[DESCRIPTORS_REL] ?? '';
    const serviceSrc = sources[SERVICE_REL] ?? '';
    const widgetSrc = sources[WIDGET_REL] ?? '';

    const shipped = derivedShippedModes(descriptorsSrc);
    if (shipped.error) {
        failures.push(shipped.error);
        return failures;
    }
    failures.push(...shipped.failures);
    const modes = shipped.modes;
    if (modes.length === 0) {
        failures.push(`${DESCRIPTORS_REL}: derived ZERO shipped modes -- no descriptor block resolved from SHIPPED_MODES, so every comparison below would pass on an empty set`);
        return failures;
    }
    const ids = modes.map(m => m.id);
    const labels = modes.map(m => m.label);

    // 1. Descriptors vs the toggle. The widget never imports the descriptors:
    // the two literals agree here or nowhere.
    const segments = derivedModesLiteralOf(widgetSrc);
    if (segments.length === 0) {
        failures.push(`${WIDGET_REL}: derived ZERO toggle segments -- no MODES = [...] literal found, so the agreement comparison proves nothing`);
    } else {
        const labelDiff = diff(segments, labels);
        if (labelDiff.surplus.length) {
            failures.push(`${WIDGET_REL}: toggle segments with no shipped descriptor (dead segment): ${labelDiff.surplus.join(', ')}`);
        }
        if (labelDiff.missing.length) {
            failures.push(`${DESCRIPTORS_REL}: shipped descriptor labels with no toggle segment (unreachable mode): ${labelDiff.missing.join(', ')}`);
        }
        if (segments.join(',') !== labels.join(',')) {
            failures.push(`toggle order drifted: segments [${segments.join(', ')}] against SHIPPED_MODES [${labels.join(', ')}] -- the toggle contract is order-sensitive`);
        }
        if (segments.map(s => s.toLowerCase()).join(',') !== ids.join(',')) {
            failures.push(`${WIDGET_REL}: lowercased toggle segments [${segments.map(s => s.toLowerCase()).join(', ')}] are not the descriptor ids [${ids.join(', ')}] -- the widget sends the lowercased label as the mode id, so the toggle would switch nothing`);
        }
    }

    // 2 and 3. First-activation placements and collapse areas (the
    // descriptors) vs the every-activation rules (SHIPPED_MODE_RULES, NG-035).
    // Stock applies viewPlacements and collapseAreas once; activateMode applies
    // the rules on every visit, so the two must agree or a mode looks different
    // on its second visit than its first.
    const declaredPlacements = modes.flatMap(m => m.placements);
    const rules = derivedShippedRules(serviceSrc);
    if (declaredPlacements.length === 0) {
        failures.push(`${DESCRIPTORS_REL}: derived ZERO view placements across every shipped mode -- no descriptor places a view, so the placement comparison would pass on an empty set`);
    }
    if (!rules) {
        failures.push(`${SERVICE_REL}: could not derive SHIPPED_MODE_RULES -- the every-activation half of the mode contract is unreadable, so the comparison proves nothing`);
    } else {
        const applied = Object.values(rules.byId).flatMap(rule => rule.placements);
        const placementDiff = diff(applied, declaredPlacements);
        if (placementDiff.surplus.length) {
            failures.push(`${SERVICE_REL}: SHIPPED_MODE_RULES docks a view no shipped descriptor places: ${placementDiff.surplus.join(', ')} -- the switch path moves a view the mode contract does not declare`);
        }
        if (placementDiff.missing.length) {
            failures.push(`${SERVICE_REL}: shipped view placement with no SHIPPED_MODE_RULES view: ${placementDiff.missing.join(', ')} -- stock applies viewPlacements on a mode's FIRST activation only, so this view would be missing on every later visit`);
        }
        for (const mode of modes) {
            const rule = rules.byId[mode.id];
            if (!rule) {
                failures.push(`${SERVICE_REL}: SHIPPED_MODE_RULES has no row for shipped mode '${mode.id}'`);
                continue;
            }
            const collapseDiff = diff(AREAS.filter(area => rule[area] === 'closed'), mode.collapseAreas);
            if (collapseDiff.surplus.length) {
                failures.push(`${SERVICE_REL}: SHIPPED_MODE_RULES closes [${collapseDiff.surplus.join(', ')}] for '${mode.id}' but its descriptor does not -- the mode would look different on its first activation than on every later one`);
            }
            if (collapseDiff.missing.length) {
                failures.push(`${DESCRIPTORS_REL}: descriptor '${mode.id}' collapses [${collapseDiff.missing.join(', ')}] on first activation but SHIPPED_MODE_RULES leaves it open afterwards -- the mode would not stay collapsed`);
            }
        }
    }

    // 4. The toggle's channel: shipped segments activate the MODE, not a bare
    // perspective. Anchored on selectMode so an unused import cannot satisfy
    // it, and named as a const so the string is never re-spelled.
    const selectModeBody = bodyOf(widgetSrc, /selectMode\s*=\s*\([^)]*\)\s*=>/);
    if (selectModeBody === undefined) {
        failures.push(`${WIDGET_REL}: the selectMode body was not found -- the shipped-segment channel cannot be derived, so this proves nothing`);
    } else if (!/executeCommand\(\s*MODES_ACTIVATE_COMMAND_ID\s*,/.test(selectModeBody)) {
        failures.push(`${WIDGET_REL}: selectMode does not execute MODES_ACTIVATE_COMMAND_ID -- a shipped segment that switches the perspective directly skips the mode's panel map, its Explorer dock and the organising slot, which is exactly why Coding used to show no view`);
    }

    // 5. The IDE dress (P64-19): the three chrome-bar decisions and the
    // furniture rows name the same modes.
    const dress = derivedDressSets(widgetSrc, sources[CSS_REL] ?? '', rules);
    for (const set of dress) {
        if (set.ids.length === 0) {
            failures.push(`${set.name}: derived ZERO mode ids -- dress rule moved, so the dress comparison proves nothing`);
        }
    }
    const reference = dress[dress.length - 1];
    if (reference.ids.length) {
        for (const set of dress.slice(0, -1).filter(s => s.ids.length)) {
            const d = diff(set.ids, reference.ids);
            if (d.surplus.length || d.missing.length) {
                failures.push(`IDE dress drift: ${set.name} [${set.ids.join(', ')}] against ${reference.name} [${reference.ids.join(', ')}]${d.missing.length ? ` -- missing ${d.missing.join(', ')}` : ''}${d.surplus.length ? ` -- extra ${d.surplus.join(', ')}` : ''}`);
            }
        }
    }

    // Modes ship as data: no manifest flag in schema, generator, or sources.
    const flagRels = [SCHEMA_REL, GENERATOR_REL, ...MODES_GLOB_RELS];
    for (const row of derivedManifestFlags(sources, flagRels)) {
        failures.push(`${row.rel}:${row.line}: bare [modes] manifest flag -- modes ship as descriptors plus user data only`);
    }

    return failures;
}

function readSources() {
    const out = {};
    for (const rel of [DESCRIPTORS_REL, SERVICE_REL, WIDGET_REL, CSS_REL, SCHEMA_REL, GENERATOR_REL, ...MODES_GLOB_RELS]) {
        try {
            out[rel] = readFileSync(join(REPO_ROOT, rel), 'utf8');
        } catch {
            out[rel] = '';
        }
    }
    return out;
}

function main() {
    if (process.argv.includes('--self-test')) {
        return selfTest();
    }
    const sources = readSources();
    const failures = checkModes(sources);
    if (failures.length) {
        console.error(`${NAME}: FAIL -- the shipped-mode sources disagree.`);
        console.error(`Nothing here is hand-kept: mode-descriptors.ts, mode-service.ts and the chrome-bar toggle are each derived and compared, so a deliberate change means changing them TOGETHER.`);
        failures.forEach(f => console.error(`  - ${f}`));
        return 1;
    }
    const count = derivedShippedModes(sources[DESCRIPTORS_REL] ?? '').modes.length;
    const dressIds = derivedDressSets(sources[WIDGET_REL] ?? '', sources[CSS_REL] ?? '', derivedShippedRules(sources[SERVICE_REL] ?? ''))[0].ids;
    console.log(`${NAME}: PASS -- ${count} shipped modes agree across the descriptors, the switch path and the toggle (order, ids, labels, placements, collapse), the toggle activates modes through the mode command, and the IDE dress is [${dressIds.join(', ')}] in all four places`);
    return 0;
}

function selfTest() {
    const clean = readSources();
    const baseline = checkModes(clean);
    if (baseline.length !== 0) {
        console.error(`${NAME} --self-test: FAIL -- the unmodified tree is already red, so the planted-fault results below would be meaningless:`);
        baseline.forEach(f => console.error(`  ${f}`));
        return 1;
    }

    const cleanDescriptors = clean[DESCRIPTORS_REL];
    const cleanService = clean[SERVICE_REL];
    const cleanWidget = clean[WIDGET_REL];
    const cleanCss = clean[CSS_REL];
    // Reorder anchors built from the clean sources, so an appended mode never
    // breaks them: swap the first two entries of each array literal.
    const swapFirstTwo = (text, re) => {
        const m = re.exec(text);
        const parts = m[2].split(',').map(p => p.trim());
        [parts[0], parts[1]] = [parts[1], parts[0]];
        return text.slice(0, m.index) + m[1] + parts.join(', ') + m[3] + text.slice(m.index + m[0].length);
    };
    const cases = [
        {
            name: 'planted id removal',
            mutate: sources => ({ ...sources, [DESCRIPTORS_REL]: cleanDescriptors.replace(
                "    id: 'browsing',\n",
                '// planted removal: browsing id line deleted\n'
            ) }),
            expect: 'browsing',
        },
        {
            name: 'planted label drift',
            mutate: sources => ({ ...sources, [DESCRIPTORS_REL]: cleanDescriptors.replace(
                "    label: 'Browsing',",
                "    label: 'Surfing',"
            ) }),
            expect: 'Browsing',
        },
        {
            // Reordering the EXPORT, without moving a descriptor block: the
            // toggle's order comes from this array, so this is the reorder
            // that a block-order derivation would have missed entirely.
            name: 'planted SHIPPED_MODES export reorder',
            mutate: sources => ({ ...sources, [DESCRIPTORS_REL]: swapFirstTwo(cleanDescriptors, /(export const SHIPPED_MODES[^=]*=\s*\[)([^\]]*)(\])/) }),
            expect: 'order drifted',
        },
        {
            name: 'planted collapse drift',
            mutate: sources => ({ ...sources, [DESCRIPTORS_REL]: cleanDescriptors.replace(
                "    chromeOptions: { collapseAreas: ['left', 'right', 'bottom'] },\n};\n\nconst organising",
                "    chromeOptions: { collapseAreas: ['left', 'right'] },\n};\n\nconst organising"
            ) }),
            expect: 'bottom',
        },
        {
            // The D3 shape: the descriptor still places the view, but nothing
            // docks it on a later activation.
            name: 'planted rules view removal (placement becomes first-visit-only)',
            mutate: sources => ({ ...sources, [SERVICE_REL]: cleanService.replace(
                "views: { left: ['explorer-view-container'], right: [], bottom: [] }",
                "views: { left: [], right: [], bottom: [] }"
            ) }),
            expect: 'explorer-view-container',
        },
        {
            name: 'planted manifest flag',
            mutate: sources => ({ ...sources, [DESCRIPTORS_REL]: cleanDescriptors + "\n// planted flag below\n[modes]\n" }),
            expect: '[modes]',
        },
        {
            name: 'planted toggle reorder',
            mutate: sources => ({ ...sources, [WIDGET_REL]: swapFirstTwo(cleanWidget, /(static readonly MODES\s*=\s*\[)([^\]]*)(\])/) }),
            expect: 'order drifted',
        },
        {
            // The regression F2 fixed: a shipped segment switching the
            // perspective directly, one hop shallower than the mode command.
            name: 'planted direct perspective switch in selectMode',
            mutate: sources => ({ ...sources, [WIDGET_REL]: cleanWidget.replace(
                'await this.commands.executeCommand(MODES_ACTIVATE_COMMAND_ID, next.toLowerCase());',
                'await this.perspectives.switchPerspective(next.toLowerCase());'
            ) }),
            expect: 'MODES_ACTIVATE_COMMAND_ID',
        },
        {
            name: 'planted orca dropped from the top-panel menubar height rule',
            mutate: sources => ({ ...sources, [CSS_REL]: cleanCss.replace(
                ',\nbody[data-pb-mode="orca"] #theia-top-panel {',
                ' {'
            ) }),
            expect: 'top-panel menubar height rule [coding] against',
        },
        {
            name: 'planted ideDress naming coding only',
            mutate: sources => ({ ...sources, [WIDGET_REL]: cleanWidget.replace(
                "const ideDress = modeId === 'coding' || modeId === 'orca';",
                "const ideDress = modeId === 'coding';"
            ) }),
            expect: 'applyStripHome ideDress [coding] against',
        },
        {
            name: 'planted drag-region menubar branch without orca',
            mutate: sources => ({ ...sources, [WIDGET_REL]: cleanWidget.replace(
                "} else if ((mode === 'coding' || mode === 'orca') && menubar) {",
                "} else if (mode === 'coding' && menubar) {"
            ) }),
            expect: 'publishDragRegions menubar row [coding] against',
        },
        {
            name: 'planted orca rules row with furniture false',
            mutate: sources => ({ ...sources, [SERVICE_REL]: cleanService.replace(
                /(\n\s*orca: \{[^\n]*?)furniture: true/,
                '$1furniture: false'
            ) }),
            expect: 'furniture:true rows [coding] -- extra orca',
        },
        {
            name: 'planted ideDress initializer renamed',
            mutate: sources => ({ ...sources, [WIDGET_REL]: cleanWidget.replace(
                'const ideDress = modeId',
                'const wearsIde = modeId'
            ) }),
            expect: 'dress rule moved',
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
        const failures = checkModes(mutated);
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
