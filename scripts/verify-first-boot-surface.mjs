#!/usr/bin/env node
/**
 * first-boot-surface (Phase 19, UPD-10; 19-UI-SPEC N1, N3, N4): what a first boot of the
 * built shell shows, on a fresh config dir. "Config dir" is the Gecko profile (where
 * ProfileStorageService keeps powerbrowser-shell-state.json) plus XDG_CONFIG_HOME.
 *
 * One live session through the supervised shell (withFirefoxPage, kept profile):
 *   - before the Theia document loads, a BiDi preload script counts window `error` and
 *     `unhandledrejection` events into window.__pbBootErrors. A Theia document without that
 *     array is a FAIL: a zero count from a counter that never ran proves nothing;
 *   - the main area holds exactly the seed widget of powerbrowser-welcome-contribution.ts;
 *   - (fresh only) the seed's items are stacked: read again with the seed's node WELCOME_SHRINK px
 *     shorter, no item's offset from the first item moves. Since the 1.76 re-pin @theia/ai-ide brings
 *     @theia/getting-started's `.gs-container` rule (flex column, space-between), which spread the
 *     four items over the full height until the welcome widget wrapped them in Theia's own
 *     `.gs-content-container` (debug session of 2026-11-18);
 *   - the active perspective is the launch-mode fallback of mode-service.ts applyLaunchMode;
 *   - no widget carries the @theia/getting-started widget id. Positive control: its command
 *     must open that widget. When the package is not installed (1.74.1), the expectation is
 *     "not composed" and a notice says so;
 *   - workbench.startupEditor equals the app manifest default, when the manifest declares one;
 *   - the resolved telemetry level equals the manifest level, and Settings shows the
 *     description, default and enumDescriptions of telemetry-preferences.ts;
 *   - a forced React render-phase error (ForcedRenderError) reaches
 *     PowerBrowserTelemetryLogger.logError and the boot counter, which proves the earlier zero
 *     count is real. React may retry a failed render, so "at least one", never "exactly one".
 *
 * Every expectation is derived from the tree at check time. The DOM is not searched for
 * upstream link text: the getting-started links are click handlers, so that absence check
 * is vacuous; the widget-id check with its positive control replaces it.
 *
 * Carried-over config dir (--carried): a fixture captured by --capture on the pristine tree
 * (decisions.md R7: outside the repo, read through PB_FIRST_BOOT_FIXTURE, a printed notice
 * when unset). The fixture is copied into fresh temp dirs and never launched against. The
 * main area must equal the fixture's captured set, compared by tab address (MAIN_ADDRESSES);
 * every other assertion is unchanged.
 *
 * Usage:
 *   node scripts/verify-first-boot-surface.mjs              fresh config dir (full tier)
 *   node scripts/verify-first-boot-surface.mjs --carried    carried-over config dir (full tier)
 *   node scripts/verify-first-boot-surface.mjs --capture <dir>  write a carried-over fixture
 *   node scripts/verify-first-boot-surface.mjs --self-test  judge() against planted faults (--quick)
 */
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { withFirefoxPage } from './lib/firefox-bidi.mjs';
import { GET_BY_NAME, makeProfile, probe, REPO_ROOT, servePages, withShell } from './lib/pb-relaunch.mjs';

const NAME = 'first-boot-surface';
const SEED_REL = 'theia/extensions/branding/src/browser/powerbrowser-welcome-contribution.ts';
const TELEMETRY_PREFS_REL = 'theia/extensions/telemetry/src/browser/telemetry-preferences.ts';
const MANIFEST_REL = 'theia/applications/browser/package.json';
const VIEW_TABLE_REL = 'theia/extensions/tab-uris/src/browser/view-factory-table.ts';
const FIXTURE_ENV = 'PB_FIRST_BOOT_FIXTURE';
// A main-area tab's stable address: TabUriRegistry.uriOf, the product's own typeable address.
// Widget ids do not survive a relaunch for web tabs (the per-session counter is in the id and
// out of the URI, docs/URI-SCHEMES.md rule 4), so the carried mode compares addresses.
const MAIN_ADDRESSES = `(() => {
    const registry = get('TabUriRegistry');
    return get('ApplicationShell').getWidgets('main').map(w => { const u = registry.uriOf(w); return u ? u.toString(true) : 'widget-id:' + w.id; });
})()`;
// The mode a launch opens in when no shipped mode was persisted (applyLaunchMode). Measured
// live: the product, not @theia/core's 'default' perspective, decides the first-boot perspective.
const MODE_SERVICE_REL = 'theia/extensions/modes/src/browser/mode-service.ts';
const GETTING_STARTED_REL = 'theia/node_modules/@theia/getting-started';
const SETTINGS_WIDGET_JS_REL = 'theia/node_modules/@theia/preferences/lib/browser/views/preference-widget.js';
const SETTINGS_COMMANDS_JS_REL = 'theia/node_modules/@theia/preferences/lib/browser/util/preference-types.js';
// The preference the phase locks (19-CONTEXT.md). Its name is the lookup key; the expected
// value comes from the manifest. When getting-started is installed, derive() requires that
// package to read this same key, so a rename upstream goes red here.
const STARTUP_EDITOR_KEY = 'workbench.startupEditor';
const FORCED_ERROR_TYPE = 'ForcedRenderError';
// Welcome layout (debug session of 2026-11-18): the seed's items are read twice, at the
// widget's own height and with its node WELCOME_SHRINK px shorter. Stacked content keeps every item's offset
// from the first; content spread over the free height (a flex container distributing space) moves them.
const WELCOME_SHRINK = 200;

const read = rel => readFileSync(join(REPO_ROOT, rel), 'utf8');
const show = value => JSON.stringify(value);
const sameList = (a, b) => show([...a].sort()) === show([...b].sort());

/** Expectations from the tree. `failures` are broken-instrument reds; `notices` are printed. */
export function derive() {
    const failures = [];
    const notices = [];
    const broken = (rel, what) => failures.push(`broken instrument: ${rel} yielded no ${what}, so the check cannot derive its expectation`);
    const attempt = (rel, fn, what) => {
        try {
            const value = fn(read(rel));
            if (value === undefined || value === null) broken(rel, what);
            return value ?? undefined;
        } catch (error) {
            failures.push(`broken instrument: ${rel} could not be read (${error.message}), so no ${what} was derived`);
            return undefined;
        }
    };

    const seedSrc = attempt(SEED_REL, src => src, 'source');
    const seedId = seedSrc && /widgetId:\s*'([^']+)'/.exec(seedSrc)?.[1];
    const seedArea = seedSrc && /area:\s*'([^']+)'/.exec(seedSrc)?.[1];
    const welcomeClass = seedSrc && /import\s*\{\s*(\w+)\s*\}\s*from\s*'\.\/powerbrowser-welcome-widget'/.exec(seedSrc)?.[1];
    if (seedSrc && (!seedId || !seedArea)) broken(SEED_REL, 'seed widget id or area');
    if (seedArea && seedArea !== 'main') failures.push(`broken instrument: ${SEED_REL} declares area '${seedArea}', not 'main', so the main-area assertion would prove nothing`);
    if (seedSrc && !welcomeClass) broken(SEED_REL, 'welcome widget class import (the forced render error needs it)');

    const defaultPerspective = attempt(MODE_SERVICE_REL, src => {
        const body = /async applyLaunchMode\(\)[^{]*\{([\s\S]*?)\n    \}\n/.exec(src)?.[1];
        return body && /activateMode\([^)]*?:\s*'([^']+)'\s*\)/.exec(body)?.[1];
    }, 'launch-mode fallback in applyLaunchMode');

    let gettingStarted = null;
    if (existsSync(join(REPO_ROOT, GETTING_STARTED_REL))) {
        const widgetId = attempt(`${GETTING_STARTED_REL}/lib/browser/getting-started-widget.js`, src => /this\.ID\s*=\s*'([^']+)'/.exec(src)?.[1], 'getting-started widget id');
        const contribRel = `${GETTING_STARTED_REL}/lib/browser/getting-started-contribution.js`;
        const commandId = attempt(contribRel, src => {
            const block = /GettingStartedCommand\s*=\s*\{\s*id:\s*([^,\n]+)/.exec(src)?.[1]?.trim();
            if (!block) return undefined;
            const literal = /^'([^']+)'$/.exec(block)?.[1];
            return literal ?? (/GettingStartedWidget\.ID$/.test(block) ? widgetId : undefined);
        }, 'getting-started command id');
        const readsKey = attempt(contribRel, src => src.includes(`'${STARTUP_EDITOR_KEY}'`), `read of '${STARTUP_EDITOR_KEY}'`);
        if (readsKey === false) failures.push(`broken instrument: ${contribRel} no longer reads '${STARTUP_EDITOR_KEY}', so the startup-editor assertion names the wrong preference`);
        gettingStarted = { widgetId, commandId };
    } else {
        notices.push(`@theia/getting-started is not installed, so the getting-started widget is not composed; its absence and its positive control do not apply`);
    }

    const settings = {
        widgetId: attempt(SETTINGS_WIDGET_JS_REL, src => /this\.ID\s*=\s*'([^']+)'/.exec(src)?.[1], 'Settings widget id'),
        commandId: attempt(SETTINGS_COMMANDS_JS_REL, src => /OPEN_USER_PREFERENCES\s*=[^{]*\{\s*id:\s*'([^']+)'/.exec(src)?.[1], 'Settings open command id'),
    };

    const level = attempt(TELEMETRY_PREFS_REL, src => {
        const key = /TELEMETRY_LEVEL_PREFERENCE\s*=\s*'([^']+)'/.exec(src)?.[1];
        const description = /description:\s*'([^']+)'/.exec(src)?.[1];
        const dflt = /default:\s*'([^']+)'/.exec(src)?.[1];
        const enumBlock = /enumDescriptions:\s*\[([\s\S]*?)\]/.exec(src)?.[1];
        const enumDescriptions = enumBlock ? [...enumBlock.matchAll(/'([^']+)'/g)].map(m => m[1]) : [];
        if (!key || !description || !dflt || enumDescriptions.length === 0) return undefined;
        return { key, description, default: dflt, enumDescriptions };
    }, 'TELEMETRY_LEVEL_PREFERENCE key, description, default and enumDescriptions');

    const manifest = attempt(MANIFEST_REL, src => JSON.parse(src)?.theia?.frontend?.config, 'theia.frontend.config');
    const manifestLevel = manifest?.powerbrowserTelemetry?.level;
    if (manifest && typeof manifestLevel !== 'string') broken(MANIFEST_REL, 'theia.frontend.config.powerbrowserTelemetry.level');
    const startupEditor = manifest?.preferences?.[STARTUP_EDITOR_KEY];
    if (manifest && startupEditor === undefined) {
        notices.push(`${MANIFEST_REL} declares no '${STARTUP_EDITOR_KEY}' default, so the startup-editor assertion does not apply`);
    }

    return {
        failures,
        notices,
        expected: {
            mainArea: seedId ? [seedId] : [],
            defaultPerspective,
            gettingStarted,
            settings,
            level,
            manifestLevel,
            startupEditor,
            welcomeClass,
        },
    };
}

/** Failure strings for one observation. Pure: the live run and --self-test both call it. */
export function judge(expected, observed) {
    const f = [];
    if (expected.carried && expected.mainArea.length < 2) {
        f.push(`the fixture's main area holds ${expected.mainArea.length} id(s) ${show(expected.mainArea)}; fewer than two could equal a fresh boot, so restoring it proves nothing`);
    }
    const main = expected.carried ? observed.mainAddresses : observed.areas.main;
    if (!sameList(main, expected.mainArea) || main.length !== expected.mainArea.length) {
        const missing = expected.mainArea.filter(id => !main.includes(id));
        const surplus = main.filter(id => !expected.mainArea.includes(id));
        f.push(`main area is ${show(main)}, expected exactly ${show(expected.mainArea)}${expected.carried ? ' (the fixture)' : ''}: missing ${show(missing)}, surplus ${show(surplus)}`);
    }
    if (observed.perspective !== expected.defaultPerspective) {
        f.push(`active perspective is ${show(observed.perspective)}, expected the launch mode ${show(expected.defaultPerspective)}`);
    }
    if (expected.gettingStarted) {
        if (observed.gettingStartedPresent !== false) {
            f.push(`a widget with the getting-started id ${show(expected.gettingStarted.widgetId)} exists at first boot (present: ${show(observed.gettingStartedPresent)})`);
        }
        if (observed.gettingStartedControl !== true) {
            f.push(`getting-started positive control: command ${show(expected.gettingStarted.commandId)} did not open widget ${show(expected.gettingStarted.widgetId)} (${show(observed.gettingStartedControl)}), so its absence proves nothing`);
        }
    }
    if (expected.startupEditor !== undefined && observed.startupEditor !== expected.startupEditor) {
        f.push(`${STARTUP_EDITOR_KEY} resolves to ${show(observed.startupEditor)}, expected the manifest default ${show(expected.startupEditor)}`);
    }
    if (observed.level !== expected.manifestLevel) {
        f.push(`${expected.level.key} resolves to ${show(observed.level)}, expected the manifest level ${show(expected.manifestLevel)}`);
    }
    if (observed.settings.domDescription !== expected.level.description) {
        f.push(`Settings shows description ${show(observed.settings.domDescription)} for ${expected.level.key}, expected ${show(expected.level.description)}`);
    }
    const schema = observed.settings.schema || {};
    if (schema.description !== expected.level.description) {
        f.push(`schema description of ${expected.level.key} is ${show(schema.description)}, expected ${show(expected.level.description)}`);
    }
    if (schema.default !== expected.level.default) {
        f.push(`schema default of ${expected.level.key} is ${show(schema.default)}, expected ${show(expected.level.default)}`);
    }
    if (show(schema.enumDescriptions) !== show(expected.level.enumDescriptions)) {
        f.push(`schema enumDescriptions of ${expected.level.key} are ${show(schema.enumDescriptions)}, expected ${show(expected.level.enumDescriptions)}`);
    }
    if (observed.counterPresent !== true) {
        f.push('boot error counter never reached the Theia document, so a zero error count would prove nothing');
    } else if (observed.bootErrors.length > 0) {
        f.push(`${observed.bootErrors.length} error(s) recorded from document start up to the forced error: ${show(observed.bootErrors)}`);
    }
    if (!(observed.forced.logged >= 1)) {
        f.push(`the forced ${FORCED_ERROR_TYPE} never reached PowerBrowserTelemetryLogger.logError (calls: ${show(observed.forced.logged)})`);
    }
    if (!(observed.forced.counted >= 1)) {
        f.push(`the forced ${FORCED_ERROR_TYPE} never reached the boot error counter (entries: ${show(observed.forced.counted)})`);
    }
    if (!expected.carried) f.push(...welcomeLayoutFailures(observed.welcomeLayout));
    return f;
}

/** The seed's items keep their offsets when its free height shrinks; red names the item and the move. */
export function welcomeLayoutFailures(layout) {
    if (!layout) return ['welcome layout: the seed widget was not shown in the main area, so its layout was not measured'];
    const [full, short] = layout.offsets;
    const shrink = Math.round(layout.heights[0] - layout.heights[1]);
    if (full.length < 2) return [`welcome layout: ${full.length} item(s) found, fewer than two, so the comparison is blind`];
    if (shrink < WELCOME_SHRINK / 2) return [`welcome layout: the seed's height changed by ${shrink}px, not ${WELCOME_SHRINK}px, so the comparison is blind`];
    const f = [];
    full.forEach((y, i) => {
        const d = Math.round(short[i] - y);
        if (Math.abs(d) > 1) f.push(`welcome item ${i + 1} of ${full.length} moved ${d}px when the seed's height shrank by ${shrink}px: the welcome content is spread over the free height, not stacked`);
    });
    return f;
}

// Runs in the page before any page script: the boot error counter (Assumption A2).
const PRELOAD = `() => {
    const errors = [];
    Object.defineProperty(window, '__pbBootErrors', { value: errors, configurable: false });
    const typeOf = v => (v && v.constructor && v.constructor.name) || typeof v;
    window.addEventListener('error', e => errors.push({ type: typeOf(e.error), message: String(e.message) }), true);
    window.addEventListener('unhandledrejection', e => errors.push({ type: typeOf(e.reason), message: String(e.reason && e.reason.message || e.reason) }), true);
}`;

/** One live session on `profileDir` (XDG_CONFIG_HOME already set). Returns the observation. */
async function observe(expected, profileDir) {
    return withFirefoxPage('', async ({ evaluate, send, waitFor }) => {
        await send('script.addPreloadScript', { functionDeclaration: PRELOAD });
        await waitFor('window.theia && window.theia.container ? true : false', { timeoutMs: 120000 });
        await waitFor(`(() => { try { ${GET_BY_NAME}
            return __getByName(window.theia.container, 'FrontendApplicationStateService').state === 'ready';
        } catch (e) { return false; } })()`, { timeoutMs: 120000 });
        const app = { evaluate };
        const counterPresent = await evaluate('Array.isArray(window.__pbBootErrors)');
        const obs = await probe(app, `
            const E = ${show(expected)};
            const logger = get('PowerBrowserTelemetryLogger');
            const orig = logger.logError.bind(logger);
            window.__pbLogged = [];
            logger.logError = (e, d) => { window.__pbLogged.push({ name: String(e), type: d && d.type }); return orig(e, d); };
            const shell = get('ApplicationShell');
            // Carried: web tabs come back from SetupsService.applyLastSession, which runs after
            // 'ready' by design (setups-service.ts onStart), so the read waits for that restore.
            // Measured at 1.76.0: 'ready' shows the core layout alone, the web tab follows ~40 ms
            // later. A restore that never completes still reads, and judge() still names it.
            if (E.carried) {
                const sorted = list => JSON.stringify([...list].sort());
                await until(() => sorted(${MAIN_ADDRESSES}) === sorted(E.mainArea), 20000);
            }
            const areas = {};
            for (const a of ['main', 'left', 'right', 'bottom']) areas[a] = shell.getWidgets(a).map(w => w.id);
            const mainAddresses = ${MAIN_ADDRESSES};
            // Welcome layout: the items are the children of the first element below the node with more than one child.
            let welcomeLayout = null;
            const seed = shell.getWidgets('main').find(w => w.id === E.mainArea[0]);
            if (!E.carried && seed && seed.isVisible) {
                const items = () => { let c = seed.node; while (c && c.childElementCount === 1) c = c.firstElementChild; return c ? [...c.children] : []; };
                const read = () => { const list = items(); const top = list.length ? list[0].getBoundingClientRect().top : 0;
                    return { height: seed.node.getBoundingClientRect().height, offsets: list.map(e => e.getBoundingClientRect().top - top) }; };
                const full = read();
                const saved = seed.node.style.height;
                seed.node.style.height = (full.height - ${WELCOME_SHRINK}) + 'px';
                const short = read();
                seed.node.style.height = saved;
                welcomeLayout = { heights: [full.height, short.height], offsets: [full.offsets, short.offsets] };
            }
            const perspective = get('PerspectiveService').getActivePerspectiveId();
            const prefs = get('PreferenceService');
            await prefs.ready;
            const startupEditor = prefs.get(${show(STARTUP_EDITOR_KEY)}) ?? null;
            const level = prefs.get(E.level.key) ?? null;
            const commands = get('CommandRegistry');
            let gettingStartedPresent = null, gettingStartedControl = null;
            if (E.gettingStarted) {
                gettingStartedPresent = !!shell.getWidgetById(E.gettingStarted.widgetId);
                await commands.executeCommand(E.gettingStarted.commandId);
                gettingStartedControl = await until(() => !!shell.getWidgetById(E.gettingStarted.widgetId), 20000);
                const opened = shell.getWidgetById(E.gettingStarted.widgetId);
                if (opened) opened.close();
            }
            await commands.executeCommand(E.settings.commandId);
            if (!(await until(() => !!shell.getWidgetById(E.settings.widgetId), 20000))) return { error: 'Settings widget ' + E.settings.widgetId + ' never opened' };
            const settingsWidget = shell.getWidgetById(E.settings.widgetId);
            await settingsWidget.setSearchTerm(E.level.key);
            const selector = '[data-pref-id="' + E.level.key + '"] .pref-description';
            await until(() => !!document.querySelector(selector), 20000);
            const node = document.querySelector(selector);
            const domDescription = node ? node.textContent.trim() : null;
            const prop = get('PreferenceSchemaService').getSchemaProperty(E.level.key);
            const schema = prop ? { description: prop.description, default: prop.default, enumDescriptions: prop.enumDescriptions } : null;
            settingsWidget.close();
            return { areas, mainAddresses, welcomeLayout, perspective, startupEditor, level, gettingStartedPresent, gettingStartedControl, settings: { domDescription, schema } };
        `);
        if (obs.error) throw new Error(obs.error);
        obs.counterPresent = counterPresent === true;
        obs.bootErrors = obs.counterPresent ? JSON.parse(await evaluate('JSON.stringify(window.__pbBootErrors)')) : [];
        // Forced render-phase error (19-RESEARCH Code Example 3): the throw must happen inside a
        // component function, so the descriptors of a real element are cloned with a throwing type.
        const forced = await probe(app, `
            const w = get(${show(expected.welcomeClass)});
            const el = w.render();
            class ${FORCED_ERROR_TYPE} extends Error {}
            const Thrower = () => { throw new ${FORCED_ERROR_TYPE}('first-boot-surface forced render error'); };
            const d = Object.getOwnPropertyDescriptors(el);
            d.type = { value: Thrower, enumerable: true };
            d.props = { value: {}, enumerable: true };
            const bad = Object.defineProperties({}, d);
            w.render = () => bad;
            document.body.appendChild(w.node);
            w.onUpdateRequest({});
            const T = ${show(FORCED_ERROR_TYPE)};
            const logged = () => window.__pbLogged.filter(x => x.name === 'frontend.uncaught-error' && x.type === T).length;
            const counted = () => (window.__pbBootErrors || []).filter(x => x.type === T).length;
            await until(() => logged() >= 1 && counted() >= 1, 15000);
            await sleep(500);
            w.node.remove();
            return { logged: logged(), counted: counted() };
        `);
        if (forced.error) throw new Error(forced.error);
        obs.forced = forced;
        return obs;
    }, { profileDir });
}

function report(label, failures, passLine) {
    if (failures.length) {
        for (const reason of failures) console.error(`${label}: FAIL -- ${reason}`);
        process.exit(1);
    }
    console.log(`${label}: PASS -- ${passLine}`);
    process.exit(0);
}

async function runFresh() {
    const label = `${NAME}-fresh`;
    const { failures, notices, expected } = derive();
    for (const n of notices) console.log(`${label}: notice -- ${n}`);
    if (failures.length) report(label, failures);
    const profile = await makeProfile();
    let observed;
    let harness;
    try {
        observed = await observe(expected, profile.profileDir);
    } catch (error) {
        harness = `harness: ${error.message}`;
    } finally {
        await profile.dispose();
    }
    if (harness) report(label, [harness]);
    const a = observed.areas;
    console.log(`${label}: observed -- left ${show(a.left)} right ${show(a.right)} bottom ${show(a.bottom)}; forced error logged ${observed.forced.logged}x, counted ${observed.forced.counted}x`);
    report(label, judge(expected, observed),
        `main area [${a.main.join(', ')}], perspective ${observed.perspective}, telemetry level ${observed.level}, Settings shows the telemetry-preferences.ts description, 0 boot errors, forced ${FORCED_ERROR_TYPE} reached logError and the counter`);
}

function fail(label, reason) {
    report(label, [reason]);
}

/** --capture <dir>: a fresh profile with one web tab and one main-area view: tab, quit, copied out. */
async function runCapture(target) {
    const label = `${NAME}-capture`;
    if (!target) fail(label, '--capture needs a target directory');
    const dir = resolve(target);
    let probeDir = dir;
    while (!existsSync(probeDir)) probeDir = dirname(probeDir);
    const real = join(realpathSync(probeDir), dir.slice(probeDir.length));
    const repo = realpathSync(REPO_ROOT);
    if (real === repo || real.startsWith(repo + sep)) fail(label, `${dir} resolves inside the repo (${repo}); the fixture must live outside it (decisions.md R7)`);
    if (existsSync(dir) && readdirSync(dir).length > 0) fail(label, `${dir} exists and is not empty; refusing to overwrite a fixture`);
    const { failures, expected } = derive();
    if (failures.length) report(label, failures);
    const seed = expected.mainArea[0];
    const candidates = [...read(VIEW_TABLE_REL).matchAll(/factoryId:\s*'([^']+)'/g)].map(m => m[1])
        .filter(id => id !== seed && !/^(ai-|chat-)/.test(id)); // prefer a non-AI view
    if (candidates.length === 0) fail(label, `broken instrument: ${VIEW_TABLE_REL} yielded no non-AI view factory id`);
    const pages = await servePages({ '/carried': { title: 'Carried over', body: 'first-boot-surface fixture page' } });
    const profile = await makeProfile();
    let result;
    let harness;
    try {
        result = await withShell(profile, async app => {
            const seen = await probe(app, `
                const shell = get('ApplicationShell');
                await get('WebTabOpenHandler').openUrl(${show(pages.url('/carried'))});
                if (!(await until(() => webTabs().some(t => t.url === ${show(pages.url('/carried'))}), 20000))) return { error: 'the web tab never opened' };
                const URI = get('TabUriRegistry').uriOf(shell.getWidgetById(${show(seed)})).constructor;
                const opener = get('OpenerService');
                let view = null;
                for (const id of ${show(candidates)}) {
                    const before = !!shell.getWidgetById(id);
                    const uri = new URI('view:' + id);
                    try { await (await opener.getOpener(uri)).open(uri); } catch (e) { continue; }
                    await sleep(300);
                    const w = shell.getWidgetById(id);
                    if (w && shell.getAreaFor(w) === 'main') { view = id; break; }
                    if (w && !before) w.close();
                }
                if (!view) return { error: 'no non-AI view: target opened in the main area' };
                await sleep(1000);
                return { view, ids: shell.getWidgets('main').map(w => w.id), main: ${MAIN_ADDRESSES} };
            `);
            return { seen, quit: seen.error ? 'skipped' : await app.quit() };
        });
    } catch (error) {
        harness = `harness: ${error.message}`;
    }
    await pages.close();
    if (!harness && result.seen.error) harness = `harness: ${result.seen.error}`;
    if (!harness && result.quit !== 'exited') harness = `quitting with the close button returned '${result.quit}', not 'exited'`;
    if (harness) {
        await profile.dispose();
        fail(label, harness);
    }
    mkdirSync(dir, { recursive: true });
    cpSync(profile.profileDir, join(dir, 'profile'), { recursive: true, verbatimSymlinks: true });
    cpSync(profile.configHome, join(dir, 'config'), { recursive: true, verbatimSymlinks: true });
    await profile.dispose();
    const json = JSON.stringify(result.seen.main, null, 2) + '\n';
    writeFileSync(join(dir, 'main-area.json'), json);
    console.log(`${label}: view chosen ${result.seen.view}; main area ids ${show(result.seen.ids)}, addresses ${show(result.seen.main)}`);
    console.log(`${label}: PASS -- wrote ${dir}; main-area.json sha256 ${createHash('sha256').update(json).digest('hex')}`);
    process.exit(0);
}

/** --carried: the fixture named by PB_FIRST_BOOT_FIXTURE, copied, then observed like a fresh boot. */
async function runCarried() {
    const label = `${NAME}-carried`;
    const fixture = process.env[FIXTURE_ENV];
    if (!fixture) {
        console.log(`${label}: notice -- ${FIXTURE_ENV} is not set; the carried-over fixture was skipped (decisions.md R7)`);
        process.exit(0);
    }
    for (const part of ['profile', 'config', 'main-area.json']) {
        if (!existsSync(join(fixture, part))) fail(label, `${FIXTURE_ENV} names ${fixture}, which has no ${part}`);
    }
    let captured;
    try {
        captured = JSON.parse(readFileSync(join(fixture, 'main-area.json'), 'utf8'));
    } catch (error) {
        fail(label, `${fixture}/main-area.json is not JSON (${error.message})`);
    }
    if (!Array.isArray(captured) || !captured.every(id => typeof id === 'string')) fail(label, `${fixture}/main-area.json is not a list of widget ids`);
    const { failures, notices, expected } = derive();
    for (const n of notices) console.log(`${label}: notice -- ${n}`);
    if (failures.length) report(label, failures);
    const carried = { ...expected, carried: true, mainArea: captured };
    const profileDir = mkdtempSync(join(tmpdir(), 'pb-first-boot-carried-profile-'));
    const configHome = mkdtempSync(join(tmpdir(), 'pb-first-boot-carried-config-'));
    cpSync(join(fixture, 'profile'), profileDir, { recursive: true, verbatimSymlinks: true });
    cpSync(join(fixture, 'config'), configHome, { recursive: true, verbatimSymlinks: true });
    process.env.XDG_CONFIG_HOME = configHome;
    let observed;
    let harness;
    try {
        observed = await observe(carried, profileDir);
    } catch (error) {
        harness = `harness: ${error.message}`;
    } finally {
        rmSync(profileDir, { recursive: true, force: true });
        rmSync(configHome, { recursive: true, force: true });
    }
    if (harness) fail(label, harness);
    const a = observed.areas;
    console.log(`${label}: observed -- left ${show(a.left)} right ${show(a.right)} bottom ${show(a.bottom)}; forced error logged ${observed.forced.logged}x, counted ${observed.forced.counted}x`);
    report(label, judge(carried, observed),
        `restored main area [${observed.mainAddresses.join(', ')}] equals the fixture's captured set, perspective ${observed.perspective}, telemetry level ${observed.level}, Settings shows the telemetry-preferences.ts description, 0 boot errors, forced ${FORCED_ERROR_TYPE} reached logError and the counter`);
}

function selfTest() {
    const label = `${NAME}-self-test`;
    const { failures, expected } = derive();
    if (failures.length) report(label, failures);
    const clean = exp => ({
        areas: { main: [...exp.mainArea], left: [], right: [], bottom: [] },
        mainAddresses: [...exp.mainArea],
        perspective: exp.defaultPerspective,
        startupEditor: exp.startupEditor ?? null,
        level: exp.manifestLevel,
        gettingStartedPresent: exp.gettingStarted ? false : null,
        gettingStartedControl: exp.gettingStarted ? true : null,
        settings: { domDescription: exp.level.description, schema: { description: exp.level.description, default: exp.level.default, enumDescriptions: [...exp.level.enumDescriptions] } },
        counterPresent: true,
        bootErrors: [],
        forced: { logged: 2, counted: 2 },
        welcomeLayout: { heights: [695, 495], offsets: [[0, 89, 152, 188], [0, 89, 152, 188]] },
    });
    const withGs = { ...expected, gettingStarted: expected.gettingStarted ?? { widgetId: 'planted.gs.widget', commandId: 'planted.gs.widget' } };
    const declared = { ...expected, startupEditor: expected.startupEditor ?? 'planted-declared-default' };
    const carried = { ...expected, carried: true, mainArea: [...expected.mainArea, 'planted-fixture-view'] };
    const plants = [
        ['surplus main-area id', expected, o => { o.areas.main.push('planted-surplus-tab'); }, /planted-surplus-tab/],
        ['seed missing from the main area', expected, o => { o.areas.main = []; }, /missing \["/],
        ['wrong perspective', expected, o => { o.perspective = 'planted-perspective'; }, /planted-perspective.*launch mode/],
        ['schema description drift, DOM correct', expected, o => { o.settings.schema.description = 'planted-schema-desc'; }, /schema description .*planted-schema-desc/],
        ['enumDescriptions drift', expected, o => { o.settings.schema.enumDescriptions = ['planted-enum']; }, /planted-enum/],
        ['getting-started present', withGs, o => { o.gettingStartedPresent = true; o.gettingStartedControl = true; }, /getting-started id/],
        ['getting-started control failed', withGs, o => { o.gettingStartedPresent = false; o.gettingStartedControl = false; }, /positive control/],
        ['startup editor differs from declared default', declared, o => { o.startupEditor = 'planted-welcomePage'; }, /planted-welcomePage/],
        ['level differs from manifest', expected, o => { o.level = 'planted-all'; }, /planted-all.*manifest level/],
        ['upstream description text', expected, o => { o.settings.domDescription = 'Controls the level of telemetry.'; o.settings.schema.description = 'Controls the level of telemetry.'; }, /Controls the level of telemetry/],
        ['wrong default', expected, o => { o.settings.schema.default = 'planted-default'; }, /planted-default/],
        ['missing counter', expected, o => { o.counterPresent = false; }, /counter never reached/],
        ['one boot error', expected, o => { o.bootErrors = [{ type: 'TypeError', message: 'planted boot error' }]; }, /planted boot error/],
        ['forced error unseen', expected, o => { o.forced = { logged: 0, counted: 0 }; }, /never reached PowerBrowserTelemetryLogger[\s\S]*never reached the boot error counter/],
        ['carried: restored set missing a fixture id', carried, o => { o.mainAddresses = o.mainAddresses.filter(id => id !== 'planted-fixture-view'); }, /missing \["planted-fixture-view"\]/],
        ['carried: restored set with a surplus id', carried, o => { o.mainAddresses.push('planted-carried-surplus'); }, /surplus \["planted-carried-surplus"\]/],
        ['carried: one-id fixture', { ...carried, mainArea: [...expected.mainArea] }, () => {}, /fewer than two/],
        // The 2026-11-18 reproduction: .gs-container's space-between spreading the four items (1280x768, Browsing).
        ['welcome items spread over the free height', expected, o => { o.welcomeLayout = { heights: [695, 495], offsets: [[0, 241, 464, 664], [0, 174, 331, 464]] }; }, /welcome item 2 of 4 moved -67px[\s\S]*spread over the free height/],
        ['welcome layout not measured', expected, o => { o.welcomeLayout = null; }, /welcome layout: the seed widget was not shown/],
        ['welcome height unchanged', expected, o => { o.welcomeLayout.heights = [695, 695]; }, /changed by 0px, not 200px, so the comparison is blind/],
        ['welcome with one item', expected, o => { o.welcomeLayout.offsets = [[0], [0]]; }, /1 item\(s\) found, fewer than two/],
    ];
    const out = [];
    const cleanFailures = [expected, withGs, declared, carried].flatMap(exp => judge(exp, clean(exp)));
    if (cleanFailures.length) out.push(`clean control went red: ${cleanFailures.join(' | ')}`);
    for (const [name, exp, plant, mustName] of plants) {
        const o = clean(exp);
        plant(o);
        const got = judge(exp, o);
        if (got.length === 0) out.push(`plant '${name}' stayed green`);
        else if (!mustName.test(got.join('\n'))) out.push(`plant '${name}' went red without naming its drift: ${got.join(' | ')}`);
    }
    report(label, out, `${plants.length} plants red, clean control green`);
}

const args = process.argv.slice(2);
if (args.includes('--self-test')) selfTest();
else if (args.includes('--capture')) await runCapture(args[args.indexOf('--capture') + 1]);
else if (args.includes('--carried')) await runCarried();
else await runFresh();
