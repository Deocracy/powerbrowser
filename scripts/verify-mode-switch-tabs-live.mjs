#!/usr/bin/env node
/**
 * GUI-07's mode-switch tabs invariant, PROVEN BY OBSERVATION (14-04).
 *
 * 14-UI-SPEC.md:223 and :232-233 contract that content tabs never unmount,
 * close, move windows, or detach on a mode switch. Every gate that existed
 * before this one reads TEXT: verify-mode-switch-tabs-invariant.mjs derives the
 * shell-mutating calls inside five anchored function bodies in two of our own
 * files, and verify-mode-toggle-commands.mjs derives ids and labels. Neither
 * can see inside `@theia/core`, and the whole defect lives there -- stock's
 * `doSwitchPerspective` restores the target perspective's SAVED layout over the
 * live one, and Lumino's `restoreLayout` unparents every widget absent from
 * that snapshot (@lumino/widgets/dist/index.js:9564-9571). A product that
 * destroyed a tab on every mode switch shipped with both text gates green.
 * This file is the behavioural half they structurally cannot be: it drives a
 * real frontend and looks at real widgets.
 *
 * THE SECOND VISIT IS THE WHOLE POINT. The teardown is CONDITIONAL --
 * perspective-service.js:131 `const savedLayout = this.savedLayouts.get(id)`,
 * and the destructive branch at :135 runs only when that snapshot exists. A
 * mode's FIRST activation takes the `applyViewPlacements` branch instead, which
 * is additive and destroys nothing. So a protocol that visits each mode once is
 * GREEN ON A BROKEN TREE, and it is the likeliest reason an earlier live run
 * honestly reported this invariant holding. Every hop this file measures is a
 * hop into a perspective that already carries a snapshot, and the seed is
 * opened AFTER those snapshots are taken -- which is the user's own sequence:
 * switch modes, open a tab, switch back.
 *
 * WHAT IT ASSERTS, per measured hop:
 *   - the main-area widget-id set, as SET EQUALITY IN BOTH DIRECTIONS. A loss
 *     is a destroyed tab; a surplus is an unreviewed tab the switch conjured.
 *   - the bottom-area widget-id set, the same way. The bottom area is the other
 *     half of what the exemption strips out of the saved layouts, so leaving it
 *     unasserted would let the fix regress on its second panel.
 *   - `isAttached` on every recorded widget OBJECT, SEPARATELY from the id
 *     sets. Lumino sets `parent = null` (:9569) and disposes the old tab bars
 *     (:9572) as independent statements, so a widget can vanish from
 *     `mainAreaTabBars` while still reporting attached, and vice versa. Held on
 *     the object, never re-looked-up by id: `shell.getWidgetById` resolves
 *     against the shell's FocusTracker (application-shell.js:1923-1929), which
 *     RETAINS a detached widget, so an id lookup would answer about whatever
 *     instance exists now rather than about the tab that was open.
 *
 * WHAT IT DERIVES FROM THE TREE, never hand-keeps:
 *   - the shipped mode ids, from mode-descriptors.ts, compared SET-EQUAL
 *     against the live `getRegisteredPerspectives()`, plus stock's own
 *     `DEFAULT_PERSPECTIVE_ID` literal and the custom ids the live ModeService
 *     reports. Red on a mode in the tree that never registered AND on a
 *     perspective in the app that no source accounts for.
 *   - the registration sinks. There are TWO spellings and the second is the one
 *     that gets missed: `registerPerspective(` and any `registerPerspectives(`
 *     OVERRIDE of the PerspectiveContribution hook, in the extension sources
 *     under theia/extensions/<ext>/src. An override is a sink whether or not it
 *     registers anything today. Both are enumerated from the sources, and any
 *     literal id a sink registers must be one the live app registered -- a mode
 *     that reached the registry without reaching the exemption is exactly the
 *     hole this covers.
 *   - upstream registrations, accounted from the installed @theia/* libs
 *     (upstreamPerspectiveIds), for the SURPLUS assertion only: a stock
 *     perspective a composed package registers is accounted, and one that is
 *     not composed never reads as a missing mode.
 *   - the seed widget and its area, from powerbrowser-welcome-contribution.ts.
 *     If that contribution ever stops declaring area 'main' the seed stops
 *     being a main-area tab, and the check fails as a broken instrument rather
 *     than passing with nothing to lose. `explorer-view-container` is
 *     deliberately never seeded: it is a SIDE-panel view that the Coding
 *     descriptor's own `viewPlacements` moves, so a check seeded with it would
 *     be asserting against a widget the contract says a mode may relocate.
 *   - the organising placeholder's widget id, from organising-widget.ts. The
 *     Organising slot opens and closes exactly one main-area widget as a
 *     CONTRACTED part of that mode (mode-service.ts activateMode), so it is
 *     excluded from both id sets -- the same exclusion chrome-bar's countTabs
 *     makes, for the same reason, and read from the same single definition.
 *
 * ORCA SEEDS (Phase 64, P64-19, P64-27, P64-35; interface C9). After the
 * welcome seed, one hosted chat tab and one hosted terminal tab are seeded
 * through powerbrowser.orca.newChat and powerbrowser.orca.newTerminal, inside
 * scripts/lib/orca-tabs-live.mjs's shared session (PowerBrowser's own orcad, the
 * booted pane bundle, its worktree selected, the stub claude on the launched
 * PowerBrowser's PATH; that relative lib import is the one exception to the rule
 * below, and it runs only when the seeds do). Both must be main-area tabs before the walk,
 * so the set-equality and isAttached assertions cover them on every hop,
 * the Orca mode's included. While theia/extensions/orca-panes is absent the
 * seeds are skipped: the run still walks the modes, and, if nothing failed,
 * ends with the one line "verify-mode-switch-tabs-live: SKIP -- Orca seeds did
 * not run ..." and exit 77 (SKIP-PROTOCOL.md), never a PASS; present but a
 * command unregistered or no hosted widget within 5000 ms is red. The plant
 * 'orca-vanish' disposes an Orca seed (the welcome seed stands in while there
 * is none) after the first hop, and the next hop must name it LOST.
 *
 * NON-VACUITY. A derivation that yields nothing fails as a broken instrument:
 * zero shipped ids, zero registration sinks, an unreadable seed, and -- the one
 * that matters most -- a seed that produced ZERO main-area widgets. A check
 * with nothing to lose cannot detect loss, and would report the strongest
 * possible green for the weakest possible reason.
 *
 * THE CHROME BAR'S OWN TAB-COUNT `console.error` IS CORROBORATION ONLY. It is
 * collected and printed beside the verdict and is never read as an assertion:
 * CLAUDE.md's first verification rule is that a check may not assert on a log
 * line it also arranges to see, and countTabs is instrumentation the switch
 * path emits about itself. Expect it to be SILENT on a normal run and do not
 * read that as breakage: the walk drives the mode command directly, and the
 * before/after comparison lives in the widget's own click handler
 * (chrome-bar-widget.tsx selectMode), which a command-driven switch never
 * enters. The channel is here so a line that does appear is visible, not
 * because its absence means anything.
 *
 * HONESTLY TIERED -- THIS CANNOT BE `--quick`. It launches the built
 * `objdir/dist/bin/powerbrowser` headless and drives the shell's own supervised
 * Theia frontend over WebDriver BiDi, exactly as verify-gui01-command.mjs does.
 * Everything it asserts about is a live widget in a live shell -- there is no
 * `document`, no shell and no widget to observe in a bare Node tier, and on a
 * tree with no `objdir/` it fails at the binary's existence check rather than
 * degrading into a text scan. Register it in the full set, never the commit
 * gate. One clean run is roughly 30 seconds; `--self-test` boots seven sessions
 * and takes about three minutes.
 *
 * WHAT IT DOES NOT PROVE. It observes one profile, one boot and one walk. It
 * says nothing about a layout restored from a PREVIOUS session (the browser
 * profile is a fresh mkdtemp every run, so ShellLayoutRestorer has nothing to
 * hydrate), nothing about custom modes unless the live app happens to carry
 * some, and nothing about what a human sees -- a widget can be attached and
 * still be painted wrong.
 *
 * THE LIVE LOCK (scripts/lib/live-lock.mjs; SKIP-PROTOCOL.md, "The live lock"). The row and its --self-test, which both boot browsers, call
 * holdLiveLock before they launch anything. They go on without taking the lock only when /proc/locks shows it held by the driver's holder
 * (PB_LIVE_LOCK_HOLDER: pid and start ticks) or by an ancestor (flock <git common dir>/pb-live.lock node <row>); an inherited
 * PB_LIVE_LOCK_HELD=1 with neither is a FAIL by name; with nothing set they take the lock themselves and wait, naming the holder.
 * --self-test is a full-tier row.
 *
 * Usage:
 *   node scripts/verify-mode-switch-tabs-live.mjs
 *   node scripts/verify-mode-switch-tabs-live.mjs --self-test
 *   node scripts/verify-mode-switch-tabs-live.mjs --help
 *
 * No import of any package name -- Node built-ins and scripts/lib/firefox-bidi.mjs
 * only (D-69).
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { withFirefoxPage } from './lib/firefox-bidi.mjs';
import { verdictExit } from './lib/skip-verdict.mjs';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'verify-mode-switch-tabs-live';

const DESCRIPTORS_REL = 'theia/extensions/modes/src/browser/mode-descriptors.ts';
const ORGANISING_REL = 'theia/extensions/modes/src/browser/organising-widget.ts';
const COMMANDS_REL = 'theia/extensions/modes/src/browser/modes-commands.ts';
const SEED_REL = 'theia/extensions/branding/src/browser/powerbrowser-welcome-contribution.ts';
const EXTENSIONS_REL = 'theia/extensions';
/** Phase 64 (P64-19, P64-35): the Orca seeds exist only once lane p64-02's extension is in the tree. */
const ORCA_PANES_REL = 'theia/extensions/orca-panes';
const ORCA_PANE_FACTORY_ID = 'powerbrowser.orca-pane';
const ORCA_SEED_COMMANDS = ['powerbrowser.orca.newChat', 'powerbrowser.orca.newTerminal'];

/** Stock source, read never written: the 'default' perspective id is upstream's, not ours. */
const STOCK_PERSPECTIVE_JS_REL = 'theia/node_modules/@theia/core/lib/browser/perspective-service.js';

/** The self-test's planted perspective id; no source defines it, so it must read as surplus. */
const UNACCOUNTED_PLANT_ID = 'unaccounted-plant';

const HELP = `Usage: node scripts/${NAME}.mjs [--self-test]

GUI-07: drives the live Theia frontend through a mode walk in which every
measured hop is a SECOND visit, and asserts that no main-area or bottom-area
tab is lost, gained or detached. Needs the built browser; not a --quick check.

  --self-test  Re-run the protocol with planted faults; each must go red
  --help       Print this message and exit 0
`;

// --------------------------------------------------------------------------
// Tree derivations. Every expectation the live half compares against is read
// off a source here; nothing below is spelled twice.
// --------------------------------------------------------------------------

function read(rel) {
    return readFileSync(join(REPO_ROOT, rel), 'utf8');
}

/** Every `.ts`/`.tsx` under `theia/extensions/<ext>/src`, as repo-relative paths. */
function extensionSources() {
    const out = [];
    const walk = rel => {
        for (const entry of readdirSync(join(REPO_ROOT, rel), { withFileTypes: true })) {
            const child = `${rel}/${entry.name}`;
            if (entry.isDirectory()) {
                if (entry.name !== 'node_modules' && entry.name !== 'lib') {
                    walk(child);
                }
            } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
                out.push(child);
            }
        }
    };
    for (const entry of readdirSync(join(REPO_ROOT, EXTENSIONS_REL), { withFileTypes: true })) {
        if (entry.isDirectory()) {
            try {
                walk(`${EXTENSIONS_REL}/${entry.name}/src`);
            } catch {
                // An extension with no src/ is not a registration sink.
            }
        }
    }
    return out.sort();
}

/** Comments and string bodies blanked, so prose about a call is not a call site. */
function stripTs(text) {
    return text
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}

/**
 * The registration sinks, BOTH spellings. `registerPerspective(` is the call;
 * `registerPerspectives(` is the PerspectiveContribution hook a subclass can
 * override -- stock walks those at perspective-service.js:85-87, so an
 * override is a registration sink whether or not it currently registers
 * anything. Missing the second spelling is how a mode gets registered that the
 * main-area exemption never chains, with every other gate still green.
 */
function registrationSinks() {
    const sinks = [];
    for (const rel of extensionSources()) {
        const src = stripTs(read(rel));
        if (!/\bregisterPerspectives?\s*\(/.test(src)) {
            continue;
        }
        sinks.push({
            rel,
            registers: /\bregisterPerspective\s*\(/.test(src),
            literalIds: [...src.matchAll(/\bid:\s*'([^']+)'/g)].map(m => m[1]),
        });
    }
    return sinks;
}

/**
 * Perspective ids that installed upstream packages register, for the SURPLUS
 * assertion only. Every browser-side lib JS file under
 * theia/node_modules/@theia/<pkg>/lib/browser that calls `registerPerspective(`
 * marks <pkg> as a registering package; the `*_PERSPECTIVE_ID = '...'` string
 * constants that package's lib defines are the ids it can register. Stock's
 * default id is excluded (derived on its own above). An upstream id registered
 * by a literal rather than a constant is not accounted, so it reads as surplus:
 * the derivation fails closed. Zero registering files is a broken instrument --
 * stock's own perspective-service.js registers the default perspective.
 */
function upstreamPerspectiveIds(defaultId) {
    const scopeRel = 'theia/node_modules/@theia';
    const jsUnder = rel => {
        const out = [];
        const walk = r => {
            for (const entry of readdirSync(join(REPO_ROOT, r), { withFileTypes: true })) {
                const child = `${r}/${entry.name}`;
                if (entry.isDirectory()) {
                    if (entry.name !== 'node_modules') walk(child);
                } else if (entry.name.endsWith('.js') && !entry.name.endsWith('.spec.js')) {
                    out.push(child);
                }
            }
        };
        try { walk(rel); } catch { /* a package with no lib/ registers nothing */ }
        return out;
    };
    const registering = [];
    const ids = new Map(); // id -> the lib file that defines its constant
    for (const pkg of readdirSync(join(REPO_ROOT, scopeRel)).sort()) {
        const lib = `${scopeRel}/${pkg}/lib`;
        const files = jsUnder(lib);
        const callers = files.filter(rel => rel.startsWith(`${lib}/browser/`)
            && /\bregisterPerspective\s*\(/.test(stripTs(read(rel))));
        if (callers.length === 0) continue;
        registering.push(...callers);
        for (const rel of files) {
            for (const m of stripTs(read(rel)).matchAll(/\b[A-Z][A-Z0-9_]*_PERSPECTIVE_ID\s*=\s*'([^']+)'/g)) {
                if (m[1] !== defaultId && !ids.has(m[1])) ids.set(m[1], rel);
            }
        }
    }
    return { registering, ids };
}

function derive() {
    const failures = [];
    const shipped = [...read(DESCRIPTORS_REL).matchAll(/^\s*id:\s*'([^']+)'/gm)].map(m => m[1]);
    if (shipped.length === 0) {
        failures.push(`${DESCRIPTORS_REL}: derived ZERO shipped mode ids -- the walk would have no mode to visit twice, so a clean result here would be green-by-empty-set`);
    }

    const defaultId = /DEFAULT_PERSPECTIVE_ID\s*=\s*'([^']+)'/.exec(read(STOCK_PERSPECTIVE_JS_REL))?.[1];
    if (!defaultId) {
        failures.push(`${STOCK_PERSPECTIVE_JS_REL}: derived NO default perspective id -- upstream renamed the constant, and the 'default' hop (the perspective that has no descriptor of its own) can no longer be addressed`);
    }

    const organisingWidgetId = /static readonly ID = '([^']+)'/.exec(read(ORGANISING_REL))?.[1];
    if (!organisingWidgetId) {
        failures.push(`${ORGANISING_REL}: derived NO organising widget id -- the one contracted main-area mutation on a switch cannot be excluded, so the id sets would go red on the mode working correctly`);
    }

    const activateCommandId = /MODES_ACTIVATE_COMMAND_ID\s*=\s*'([^']+)'/.exec(read(COMMANDS_REL))?.[1];
    if (!activateCommandId) {
        failures.push(`${COMMANDS_REL}: derived NO mode activate command id -- the walk drives the product's own switch path through that command, and cannot invent it`);
    }

    const seedSrc = read(SEED_REL);
    const seedId = /widgetId:\s*'([^']+)'/.exec(seedSrc)?.[1];
    const seedArea = /area:\s*'([^']+)'/.exec(seedSrc)?.[1];
    if (!seedId || !seedArea) {
        failures.push(`${SEED_REL}: derived NO seed widget id or area -- the check cannot open a main-area tab it cannot name`);
    } else if (seedArea !== 'main') {
        failures.push(`${SEED_REL}: the seed contribution declares area '${seedArea}', not 'main' -- seeding it would put nothing in the main area, and this check would then prove nothing about main-area tabs`);
    }

    const sinks = registrationSinks();
    if (sinks.length === 0) {
        failures.push(`${EXTENSIONS_REL}: derived ZERO perspective registration sinks -- neither registerPerspective( nor a registerPerspectives( override was found anywhere, so the registry comparison below has no source of truth`);
    }

    const upstream = upstreamPerspectiveIds(defaultId);
    if (upstream.registering.length === 0) {
        failures.push(`theia/node_modules/@theia: derived ZERO upstream registerPerspective( callers -- stock's own perspective-service.js registers the default perspective, so the installed-lib walk is broken and upstream perspectives cannot be accounted`);
    }

    return { failures, shipped, defaultId, organisingWidgetId, activateCommandId, seedId, sinks, upstream };
}

function diff(actual, expected) {
    const a = new Set(actual);
    const e = new Set(expected);
    return {
        surplus: [...a].filter(x => !e.has(x)).sort(),
        missing: [...e].filter(x => !a.has(x)).sort(),
    };
}

// --------------------------------------------------------------------------
// The live half. One expression drives the whole protocol so no BiDi round
// trip can interleave with a switch; it returns a JSON report the Node side
// turns into failures.
// --------------------------------------------------------------------------

/**
 * Inversify identifier lookup by NAME. Identical root cause to
 * verify-gui01-command.mjs's and verify-uri-roundtrip.mjs's: BiDi
 * `script.evaluate` runs a bare expression in the page realm with no module
 * resolution, so the DI identifier VALUES are unreachable and the binding is
 * found by walking inversify's internal `_bindingDictionary`. Pinned against
 * inversify 6.2.2 -- an inversify bump renaming that field breaks this file
 * first, loudly, rather than weakening an assertion.
 */
const GET_BY_NAME = `
function __getByName(container, name) {
    let found;
    container._bindingDictionary.traverse(key => {
        if (found) return;
        const keyStr = typeof key === 'symbol' ? key.toString() : (key && key.name) || String(key);
        if (keyStr === 'Symbol(' + name + ')' || keyStr === name) found = key;
    });
    if (!found) throw new Error('DI binding not found for identifier name: ' + name);
    return container.get(found);
}`;

/**
 * The protocol, as one page-realm expression.
 *
 * `plant` is '' for the real check. The self-test passes one of five fault
 * names; each is applied through the SAME code path the real run takes, so a
 * plant can only go red by the assertions actually working.
 */
function protocolExpression(derived, plant) {
    const cfg = JSON.stringify({
        shipped: derived.shipped,
        defaultId: derived.defaultId,
        organisingWidgetId: derived.organisingWidgetId,
        activateCommandId: derived.activateCommandId,
        seedId: derived.seedId,
        unaccountedId: UNACCOUNTED_PLANT_ID,
        orcaSeeds: existsSync(join(REPO_ROOT, ORCA_PANES_REL)),
        orcaFactoryId: ORCA_PANE_FACTORY_ID,
        orcaSeedCommands: ORCA_SEED_COMMANDS,
        plant,
    });
    return `(async () => { ${GET_BY_NAME}
    const cfg = ${cfg};
    const report = { failures: [], notes: [], steps: [], consoleErrors: [], skips: [] };
    const fail = message => report.failures.push(message);
    try {
        const container = window.theia.container;
        const persp = __getByName(container, 'PerspectiveService');
        const internal = __getByName(container, 'PerspectiveServiceInternal');
        const shell = __getByName(container, 'ApplicationShell');
        const widgets = __getByName(container, 'WidgetManager');
        const commands = __getByName(container, 'CommandRegistry');
        let modeService;
        try { modeService = __getByName(container, 'ModeService'); } catch (e) { modeService = undefined; }

        // Corroboration channel ONLY. The chrome bar logs its own before/after
        // tab count on the switch path; it is collected so a reader can see it
        // beside the verdict, and it is never read as an assertion.
        const priorConsoleError = console.error;
        console.error = (...args) => {
            try { report.consoleErrors.push(args.map(String).join(' ')); } catch (e) { /* unstringifiable */ }
            priorConsoleError.apply(console, args);
        };

        const settle = () => new Promise(resolve => setTimeout(resolve, 600));
        const idsIn = area => (area === 'main' ? shell.mainAreaTabBars : shell.bottomAreaTabBars)
            .flatMap(bar => Array.from(bar.titles).map(title => title.owner.id))
            .filter(id => id !== cfg.organisingWidgetId);
        const widgetsIn = area => (area === 'main' ? shell.mainAreaTabBars : shell.bottomAreaTabBars)
            .flatMap(bar => Array.from(bar.titles).map(title => title.owner))
            .filter(widget => widget.id !== cfg.organisingWidgetId);

        // --- plant (self-test only): a perspective no source accounts for,
        // registered through the same live service before the ids are read.
        // Its hooks are no-ops so only the surplus assertion can name it.
        if (cfg.plant === 'unaccounted') {
            persp.registerPerspective({ id: cfg.unaccountedId, label: 'Unaccounted Plant', onActivate: () => {}, onDeactivate: () => {} });
            report.notes.push("PLANT unaccounted: perspective '" + cfg.unaccountedId + "' registered live");
        }

        // --- registry derivation, compared set-equal against the tree ------
        const descriptors = persp.getRegisteredPerspectives();
        const liveIds = descriptors.map(d => d.id);
        const customIds = modeService && modeService.getCustomModes
            ? modeService.getCustomModes().map(row => row.id)
            : [];
        report.liveIds = liveIds;
        report.customIds = customIds;
        // A descriptor that reached the registry without the exemption chaining
        // it is a mode whose switch still restores a stale main area. The
        // exemption assigns BOTH hooks to every descriptor it chains
        // (main-area-exemption.ts exempt()), including stock's own 'default',
        // which ships with neither.
        report.unchained = descriptors
            .filter(d => typeof d.onDeactivate !== 'function' || typeof d.onActivate !== 'function')
            .map(d => d.id);

        const bootActive = persp.getActivePerspectiveId();
        report.bootActive = bootActive;

        // --- seed hygiene -------------------------------------------------
        // The seed must be ABSENT from the snapshots the pre-walk takes, or
        // restoring one of them would bring it back and the check would pass
        // on a tree that destroys it. Closing it first is the cheapest way to
        // guarantee that, and it is an ordinary user action: the tab has a
        // close button.
        const existing = shell.getWidgetById(cfg.seedId);
        if (existing && !existing.isDisposed) {
            existing.close();
            await settle();
        }

        // --- pre-walk: gives every perspective a snapshot taken BEFORE the
        // seed exists. 'default' first (the perspective with no descriptor of
        // its own, whose hole the exemption closes from onDidInitializeLayout),
        // then every shipped mode in contracted order, then back to whichever
        // mode the app launched in so the baseline is taken somewhere neutral.
        const activate = async id => {
            report.steps.push('activate ' + id);
            if (id === cfg.defaultId) {
                // 'default' is a stock perspective, not a mode: the mode
                // command would resolve it to the launch mode instead. The
                // stock service is the only path that can address it.
                await persp.switchPerspective(id);
            } else {
                await commands.executeCommand(cfg.activateCommandId, id);
            }
            await settle();
        };
        for (const id of [cfg.defaultId, ...cfg.shipped, bootActive]) {
            await activate(id);
        }

        // The unfixed tree, reproduced exactly: a snapshot of the live layout
        // taken BEFORE the seed exists, written back over the target's saved
        // layout from inside the deactivate hook -- i.e. after the exemption
        // has stripped it and before stock reads it at :131. Nothing about the
        // source is changed; only the data stock reads.
        const stale = cfg.plant === 'recontaminate' ? shell.getLayoutData() : undefined;

        // --- seed ---------------------------------------------------------
        report.steps.push('seed ' + cfg.seedId);
        try {
            const seed = await widgets.getOrCreateWidget(cfg.seedId);
            await shell.addWidget(seed, { area: 'main' });
            await settle();
        } catch (e) {
            fail('could not seed a main-area widget from ' + cfg.seedId + ': ' + String(e));
        }

        // --- Orca seeds (Phase 64): one hosted chat, one hosted terminal ----
        const orcaSeeds = [];
        if (!cfg.orcaSeeds) {
            report.skips.push('Orca seeds did not run (lane p64-02 not merged: theia/extensions/orca-panes is absent). Next step: merge that lane, then run scripts/verify-platform.sh --only gui07-mode-switch-tabs-live');
        } else {
            for (const id of cfg.orcaSeedCommands) {
                report.steps.push('seed ' + id);
                if (!commands.getCommand(id)) { fail('Orca seed command ' + id + ' is not registered'); continue; }
                const known = new Set(widgets.getWidgets(cfg.orcaFactoryId).map(w => w.id));
                await commands.executeCommand(id);
                let added;
                for (const end = Date.now() + 5000; !added && Date.now() < end; await new Promise(r => setTimeout(r, 100))) {
                    added = widgets.getWidgets(cfg.orcaFactoryId).find(w => !known.has(w.id));
                }
                if (!added) { fail('Orca seed ' + id + ' gave no hosted widget within 5000 ms'); continue; }
                orcaSeeds.push(added);
            }
            await settle();
            report.notes.push('Orca seeds: ' + orcaSeeds.map(w => w.id).join(', '));
        }

        const baselineWidgets = widgetsIn('main');
        const baselineMain = idsIn('main');
        const baselineBottom = idsIn('bottom');
        report.baselineMain = baselineMain;
        report.baselineBottom = baselineBottom;
        if (baselineMain.length === 0) {
            fail('the seed produced ZERO main-area widgets -- this run had nothing to lose, so a clean result would prove nothing about whether a mode switch destroys tabs');
        }
        for (const w of orcaSeeds) {
            if (!baselineMain.includes(w.id)) fail("the Orca seed '" + w.id + "' is not a main-area tab before the walk");
        }
        if (!baselineMain.includes(cfg.seedId)) {
            fail("the seeded widget '" + cfg.seedId + "' is not in the main area after seeding -- the seed did not take, so the walk below would measure the wrong thing");
        }

        // --- plants (self-test only) --------------------------------------
        if (cfg.plant === 'recontaminate') {
            const active = descriptors.find(d => d.id === persp.getActivePerspectiveId());
            const prior = active.onDeactivate;
            const target = cfg.shipped[0];
            active.onDeactivate = s => { prior(s); internal.setSavedLayout(target, stale); };
            report.notes.push("PLANT recontaminate: '" + target + "' saved layout rewritten from a pre-seed snapshot, inside the deactivate hook");
        } else if (cfg.plant === 'detach' && baselineWidgets.length) {
            // Exactly what Lumino does at @lumino/widgets/dist/index.js:9569.
            baselineWidgets[0].parent = null;
            report.notes.push('PLANT detach: ' + baselineWidgets[0].id + ' unparented');
        } else if (cfg.plant === 'attach-flag' && baselineWidgets.length) {
            // Widget.Flag.IsAttached === 2 (@lumino/widgets/dist/index.js:1480),
            // the same flag Lumino clears on a real detach at :1266. Clearing
            // it alone leaves the widget in its tab bar with its parent intact,
            // which is the point: it proves the attachment assertion fires
            // INDEPENDENTLY of the id-set assertion.
            baselineWidgets[0].clearFlag(2);
            report.notes.push('PLANT attach-flag: ' + baselineWidgets[0].id + ' reports detached while still tabbed');
        } else if (cfg.plant === 'surplus') {
            // A real second widget from the same factory (WidgetManager keys on
            // factory id plus options, so distinct options mint a new instance)
            // renamed before it is attached, so it is a genuine surplus tab
            // rather than a doctored expectation.
            const extra = await widgets.getOrCreateWidget(cfg.seedId, { plant: 'surplus' });
            extra.id = cfg.seedId + '.surplus-plant';
            extra.title.label = 'Surplus Plant';
            await shell.addWidget(extra, { area: 'main' });
            await settle();
            report.notes.push('PLANT surplus: ' + extra.id + ' added to the main area');
        }

        // --- measured walk: every hop is a SECOND visit --------------------
        let hops = 0;
        for (const id of [...cfg.shipped, cfg.defaultId]) {
            await activate(id);
            if (cfg.plant === 'orca-vanish' && ++hops === 1) {
                // After the first hop, so only a later hop's measurement can see it go.
                const target = orcaSeeds[0] || baselineWidgets.find(w => w.id === cfg.seedId);
                if (target) {
                    target.dispose();
                    report.notes.push('PLANT orca-vanish: ' + target.id + ' disposed after the first hop' + (orcaSeeds.length ? '' : ' (stand-in: no Orca seed in this tree)'));
                }
                continue;
            }
            for (const [area, baseline] of [['main', baselineMain], ['bottom', baselineBottom]]) {
                const live = idsIn(area);
                const lost = baseline.filter(x => !live.includes(x));
                const gained = live.filter(x => !baseline.includes(x));
                if (lost.length) {
                    fail(area + "-area tabs LOST across the switch into '" + id + "' (second visit): " + lost.join(', '));
                }
                if (gained.length) {
                    fail(area + "-area tabs APPEARED across the switch into '" + id + "': " + gained.join(', '));
                }
            }
            for (const widget of baselineWidgets) {
                if (!widget.isAttached) {
                    fail("widget '" + widget.id + "' is no longer attached after the switch into '" + id + "' (disposed=" + widget.isDisposed + ", parent=" + (widget.parent ? 'set' : 'null') + ')');
                }
            }
        }
        console.error = priorConsoleError;
    } catch (e) {
        fail('the protocol threw at step [' + report.steps.join(' -> ') + ']: ' + String(e));
    }
    return JSON.stringify(report);
})()`;
}

/**
 * One browser session: boot, wait for a real shell, run the protocol, report.
 *
 * A failure to drive at all -- no built binary, a shell that never reaches
 * 'ready', a BiDi session that drops -- comes back as a named failure rather
 * than an unhandled rejection, so the operator reads a sentence instead of a
 * stack, and so `--self-test` cannot mistake "could not run" for "went red".
 */
async function runProtocol(derived, plant) {
    try {
        return await drive(derived, plant);
    } catch (error) {
        return { driveError: String(error), failures: [], notes: [], steps: [], skips: [] };
    }
}

async function drive(derived, plant) {
    if (existsSync(join(REPO_ROOT, ORCA_PANES_REL))) {
        // The Orca seeds need PowerBrowser's own orcad and a booted pane bundle: the shared Orca tabs session
        // (it puts the stub claude on the launched PowerBrowser's PATH only). Its worktree is selected through
        // the bundle's setActiveWorktree, as an activated Orca tab does (P64-23), and the Theia frame is focused.
        const lib = await import('./lib/orca-tabs-live.mjs');
        const { pollFor } = await import('./lib/pb-relaunch.mjs');
        return lib.withOrcaTabsSession({ log: () => {} }, async (ctx) => {
            const listed = ctx.orca('worktree', 'list');
            const id = (listed?.result?.worktrees ?? []).find((w) => String(w.id).endsWith(`::${ctx.repo}`))?.id;
            if (!id) throw new Error('the session worktree is not in the Orca CLI list');
            await ctx.bundle(`(m.setActiveWorktree(${JSON.stringify(id)}), true)`);
            await ctx.focusTheiaFrame();
            const evaluate = (expr) => ctx.app.evaluate(expr);
            const waitFor = (expr, { timeoutMs = 60000 } = {}) => pollFor(async () => ((await evaluate(expr)) ? true : null), timeoutMs, 'a frontend condition');
            return driveIn(evaluate, waitFor, derived, plant);
        });
    }
    // WINDOWS 14: empty URL -- the shell's own supervised frontend is the app
    // under test, and a URL on the command line would open a redundant stock
    // window beside it.
    return withFirefoxPage('', ({ evaluate, waitFor }) => driveIn(evaluate, waitFor, derived, plant));
}

async function driveIn(evaluate, waitFor, derived, plant) {
    {
        await waitFor('window.theia && window.theia.container ? true : false', { timeoutMs: 60000 });
        await waitFor('!!document.querySelector("#theia-app-shell")', { timeoutMs: 60000 });
        // Waiting for the app's OWN 'ready' state, not for a shell selector and
        // not for a registered mode. The launch mode is applied from
        // ModeService's onDidInitializeLayout, which stock fires at
        // frontend-application.js:68 and awaits at :211-213 BEFORE it sets
        // 'ready' -- so 'ready' is the first moment the launch switch is
        // settled. Measured live while writing this file: a protocol that
        // started as soon as the descriptors were registered found the app
        // still in 'default' with the launch switch in flight, and its first
        // hop raced it. That is a check measuring its own timing rather than
        // the product.
        await waitFor(`(() => { try { ${GET_BY_NAME}
            return __getByName(window.theia.container, 'FrontendApplicationStateService').state === 'ready';
        } catch (e) { return false; } })()`, { timeoutMs: 60000 });
        const raw = await evaluate(protocolExpression(derived, plant));
        return JSON.parse(raw);
    }
}

/** Tree-side assertions over one live report. @returns {string[]} */
function assertReport(derived, report) {
    if (report.driveError) {
        return [`could not drive the live frontend: ${report.driveError}`];
    }
    const failures = [...report.failures];
    const expectedIds = [derived.defaultId, ...derived.shipped, ...(report.customIds ?? [])];
    // Upstream ids widen the surplus side only: one that is not composed must never read as a missing mode.
    const idDiff = {
        surplus: diff(report.liveIds ?? [], [...expectedIds, ...derived.upstream.ids.keys()]).surplus,
        missing: diff(report.liveIds ?? [], expectedIds).missing,
    };
    if ((report.liveIds ?? []).length === 0) {
        failures.push('the live frontend registered ZERO perspectives -- the walk had nothing to switch between, so a clean result would be green-by-empty-set');
    }
    if (idDiff.surplus.length) {
        failures.push(`the live frontend registered perspective(s) no source accounts for: ${idDiff.surplus.join(', ')} -- a mode registered outside ${DESCRIPTORS_REL}, the custom-mode store and the installed @theia libs, which the main-area exemption may never have chained`);
    }
    if (idDiff.missing.length) {
        failures.push(`mode id(s) declared in ${DESCRIPTORS_REL} never reached the live registry: ${idDiff.missing.join(', ')}`);
    }
    if ((report.unchained ?? []).length) {
        failures.push(`registered perspective(s) carry no chained deactivate/activate hook: ${report.unchained.join(', ')} -- the main-area exemption never wrapped them, so their switch still restores a stale main area`);
    }
    for (const sink of derived.sinks) {
        for (const id of sink.literalIds) {
            if (!(report.liveIds ?? []).includes(id)) {
                failures.push(`${sink.rel}: registration sink names perspective id '${id}', which the live frontend never registered -- a registration path this walk does not exercise`);
            }
        }
    }
    return failures;
}

function printReport(report) {
    if (report.driveError) {
        return;
    }
    console.log(`${NAME}: launched in '${report.bootActive}'; walked ${report.steps.length} switches`);
    console.log(`${NAME}: registered perspectives: ${(report.liveIds ?? []).join(', ')}`);
    console.log(`${NAME}: baseline main-area tabs: [${(report.baselineMain ?? []).join(', ')}] bottom-area tabs: [${(report.baselineBottom ?? []).join(', ')}]`);
    for (const note of report.notes ?? []) {
        console.log(`${NAME}: ${note}`);
    }
    // Corroboration, never an assertion (see the file header).
    const corroboration = (report.consoleErrors ?? []).filter(line => /tab/i.test(line));
    if (corroboration.length) {
        console.log(`${NAME}: corroboration only -- the switch path logged: ${corroboration.slice(0, 6).join(' | ')}`);
    }
}

async function main() {
    const derived = derive();
    if (derived.failures.length) {
        for (const message of derived.failures) {
            console.error(`${NAME}: FAIL -- ${message}`);
        }
        return 1;
    }
    console.log(`${NAME}: derived modes [${derived.shipped.join(', ')}] + stock '${derived.defaultId}'; seed '${derived.seedId}'; registration sinks: ${derived.sinks.map(s => s.rel).join(', ')}`);
    console.log(`${NAME}: upstream perspective ids (surplus accounting only): ${[...derived.upstream.ids].map(([id, rel]) => `'${id}' from ${rel}`).join(', ') || '(none)'}; upstream registerPerspective( callers: ${derived.upstream.registering.join(', ')}`);

    const report = await runProtocol(derived, '');
    printReport(report);
    const failures = assertReport(derived, report);
    if (failures.length) {
        for (const message of failures) {
            console.error(`${NAME}: FAIL -- ${message}`);
        }
        console.error(`${NAME}: FAIL -- ${failures.length} assertion(s) failed`);
        return 1;
    }
    // A part of the run that did not run because an input is absent is a partial run: SKIP, never PASS (SKIP-PROTOCOL.md).
    const code = verdictExit(NAME, [], report.skips ?? []);
    if (code === 0) {
        console.log(`${NAME}: PASS -- ${(report.baselineMain ?? []).length} main-area and ${(report.baselineBottom ?? []).length} bottom-area tab(s) survived every second-visit mode switch, attached`);
    }
    return code;
}

/**
 * Fault plants. The clean control runs FIRST: a plant harness whose clean pass
 * is already red proves nothing about the plants that follow.
 *
 * Each plant runs in its OWN browser session. Sharing one would leave the
 * previous plant's damage in the shell -- a detached widget, a surplus tab --
 * and the next plant could then go red for the previous plant's reason, which
 * is the same false-positive shape as a check that passes for the wrong cause.
 */
async function selfTest() {
    const derived = derive();
    if (derived.failures.length) {
        for (const message of derived.failures) {
            console.error(`${NAME} --self-test: FAIL -- derivation is broken before any plant: ${message}`);
        }
        return 1;
    }

    const cases = [
        {
            name: 'clean control (no plant)',
            plant: '',
            expectClean: true,
        },
        {
            // THE plant that matters: it reproduces the UNFIXED tree exactly,
            // without un-fixing a source file and without a rebuild. If this
            // one does not go red, this whole check is decoration.
            name: 're-contaminated saved layout (the unfixed tree)',
            plant: 'recontaminate',
            expect: 'LOST',
        },
        {
            name: 'detached main-area widget',
            plant: 'detach',
            expect: 'LOST',
        },
        {
            name: 'attachment cleared while still tabbed',
            plant: 'attach-flag',
            expect: 'no longer attached',
        },
        {
            name: 'surplus main-area widget',
            plant: 'surplus',
            expect: 'APPEARED',
        },
        {
            // Phase 64: a seeded tab (an Orca seed when the tree has one) vanishing after a hop.
            name: 'Orca seed vanishes after a hop',
            plant: 'orca-vanish',
            expect: 'LOST',
        },
        {
            // Proves the upstream accounting did not widen the surplus
            // assertion into one that cannot fire.
            name: 'unaccounted perspective',
            plant: 'unaccounted',
            expect: `no source accounts for: ${UNACCOUNTED_PLANT_ID} `,
        },
    ];

    let failed = 0;
    const skipped = [];
    {
        // The shared live-lock helper is still awaited on this row's live path (no browser).
        const lib = await import('./lib/orca-tabs-live.mjs');
        const liveLock = await import('./lib/live-lock.mjs');
        for (const message of [...liveLock.lockWiringFails(NAME, import.meta.url), ...(lib.lockWiringPlantFails(liveLock.lockWiringFails).length ? [] : ['a script without the lock call was not caught'])]) {
            console.error(`${NAME} --self-test: FAIL -- ${message}`);
            failed++;
        }
    }
    for (const testCase of cases) {
        const report = await runProtocol(derived, testCase.plant);
        for (const reason of report.skips ?? []) if (!skipped.includes(reason)) skipped.push(reason);
        const failures = assertReport(derived, report);
        if (report.driveError) {
            // Distinct from a plant that failed to go red: the session never
            // ran, so this case proved nothing either way.
            console.error(`${NAME} --self-test: FAIL -- '${testCase.name}' could not be driven at all: ${report.driveError}`);
            failed++;
            continue;
        }
        if (testCase.expectClean) {
            if (failures.length) {
                console.error(`${NAME} --self-test: FAIL -- '${testCase.name}' is red before any fault is planted: ${failures.join(' | ')}`);
                failed++;
            } else {
                console.log(`  ok  ${testCase.name} -> green`);
            }
            continue;
        }
        if (!(report.notes ?? []).some(note => note.startsWith('PLANT'))) {
            console.error(`${NAME} --self-test: FAIL -- '${testCase.name}' never applied its fault (the plant site drifted), so a red or green here would mean nothing`);
            failed++;
            continue;
        }
        if (!failures.some(f => f.includes(testCase.expect))) {
            console.error(`${NAME} --self-test: FAIL -- '${testCase.name}' did not go red naming '${testCase.expect}'; got: ${failures.join(' | ') || '(no failures at all)'}`);
            failed++;
        } else {
            // The matching red is PRINTED, not merely counted: a plant harness
            // that only says "went red" hides whether it went red for the
            // planted reason or for some incidental one.
            console.log(`  ok  ${testCase.name} -> red, naming '${testCase.expect}'`);
            for (const message of failures.filter(f => f.includes(testCase.expect)).slice(0, 3)) {
                console.log(`      ${message}`);
            }
        }
    }

    if (failed) {
        console.error(`${NAME} --self-test: FAIL -- ${failed} case(s) did not behave as required`);
        return 1;
    }
    // A self-test that ran with a skipped input (no Orca seeds) did not cover the seed path: SKIP, not PASS.
    const code = verdictExit(NAME, [], skipped);
    if (code === 0) {
        console.log(`${NAME} --self-test: PASS -- the clean control is green and all ${cases.length - 1} planted faults went red`);
    }
    return code;
}

const args = process.argv.slice(2);
if (args.includes('--help')) {
    console.log(HELP.trimEnd());
    process.exit(0);
}
{
    // Both modes launch a browser: the live lock first (scripts/lib/live-lock.mjs).
    const { holdLiveLock } = await import('./lib/live-lock.mjs');
    const locked = await holdLiveLock({ name: NAME, scriptUrl: import.meta.url, root: REPO_ROOT });
    if (locked !== null) process.exit(locked);
}
process.exit(args.includes('--self-test') ? await selfTest() : await main());
