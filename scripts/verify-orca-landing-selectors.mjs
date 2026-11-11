#!/usr/bin/env node
/**
 * orca-landing-selectors (--quick; Phase 67 plan 05, INJ-01, P67-24, A-10, P67-29).
 *
 * The PowerBrowserOrcaLogo actor puts the PowerBrowser mark on Orca's landing tile through a selector list keyed by
 * Orca version (OrcaEnv.ORCA_LANDING_SELECTORS). Derived at check time and compared:
 *   1. the pinned Orca version (generated/upstream-pins.env UPSTREAM_ORCA_TAG minus its v) has an entry;
 *   2. every class token of every selector part occurs in a className string literal of the built Landing chunk
 *      (orca/out/web/assets/Landing-*.js, exactly one file);
 *   3. the parent part's class tokens occur together in exactly one className string across out/web/assets/*.js,
 *      and the element directly inside that parent is an img whose className carries the child part's tokens;
 *   4. OrcaEnv.logoAnswerFor over a derived case table answers only orcad's own port (the powerbrowser.orca.port
 *      default in powerbrowser-sidecar.js), not shell-embedded, on the pinned version with a data: mark, and refuses
 *      the sidecar's port, the shell-embedded sender, an unknown version and a non-data mark.
 * Clauses 2 and 3 print one SKIP line while orca/out/web/assets is absent (no Orca build). A re-pin that moves Orca's
 * landing markup turns this row red before a user sees Orca's logo come back.
 *
 * --self-test runs the check on mkdtemp copies (OrcaEnv, the pins file, the sidecar prefs, a fixture assets folder
 * with a synthetic Landing chunk and a second asset): the copies green, then each planted fault red by name.
 */
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const NAME = 'orca-landing-selectors';
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export const defaultPaths = (root = REPO_ROOT) => ({
    orcaEnv: join(root, 'powerbrowser/shell/OrcaEnv.sys.mjs'),
    pins: join(root, 'generated/upstream-pins.env'),
    prefs: join(root, 'powerbrowser/shell/powerbrowser-sidecar.js'),
    assets: join(root, 'orca/out/web/assets'),
});

const classNamesOf = (text) => [...text.matchAll(/className:\s*(?:`([^`$]*)`|"([^"]*)")/g)]
    .map((m) => ({ value: m[1] ?? m[2], index: m.index, end: m.index + m[0].length }));
const tokensOf = (value) => new Set(value.split(/\s+/).filter(Boolean));

/** A selector's parts, split on child/descendant combinators: { tag, classes }. */
export function selectorParts(selector) {
    return selector.split(/\s*>\s*|\s+/).filter(Boolean).map((part) => {
        const [tag, ...classes] = part.split('.');
        return { tag: tag || null, classes };
    });
}

export async function check(paths) {
    const passes = [];
    const failures = [];
    const fail = (rule, text) => failures.push({ rule, text });

    const pins = existsSync(paths.pins) ? readFileSync(paths.pins, 'utf8') : '';
    const version = pins.match(/^UPSTREAM_ORCA_TAG=v?(\S+)$/m)?.[1];
    if (!version) {
        fail('pins', `${paths.pins} has no UPSTREAM_ORCA_TAG. Next step: run node scripts/generate.mjs`);
        return { passes, failures, version };
    }
    // A cache-busting query keeps a planted copy from being served by an earlier import.
    const env = await import(`${pathToFileURL(paths.orcaEnv).href}?t=${Date.now()}${Math.random()}`);
    const selectors = env.logoSelectorsFor(version);
    if (!Array.isArray(selectors) || selectors.length === 0) {
        fail('entry', `no selector entry for ${version} in OrcaEnv.ORCA_LANDING_SELECTORS`);
    } else {
        passes.push(`ok entry: ${version} -> ${selectors.join(', ')}`);
    }

    // Clauses 2 and 3: the built client.
    if (!existsSync(paths.assets)) {
        passes.push(`SKIP of the bundle clauses only -- ${paths.assets} is absent (no Orca build; nix develop .#orca --command bash scripts/build-orca.sh)`);
    } else if (selectors?.length) {
        const files = readdirSync(paths.assets).filter((f) => f.endsWith('.js'));
        const landing = files.filter((f) => /^Landing-[^/]+\.js$/.test(f));
        if (landing.length !== 1) {
            fail('chunk', `expected exactly one Landing-*.js under ${paths.assets}, found ${landing.length}`);
        } else {
            const chunk = readFileSync(join(paths.assets, landing[0]), 'utf8');
            const names = classNamesOf(chunk);
            for (const selector of selectors) {
                const parts = selectorParts(selector);
                for (const token of parts.flatMap((p) => p.classes)) {
                    if (!names.some((n) => tokensOf(n.value).has(token))) fail('token', `token not in bundle: ${token} (${landing[0]})`);
                }
                if (parts.length < 2) continue;
                const parent = parts[parts.length - 2];
                const child = parts[parts.length - 1];
                const holds = (n, classes) => classes.every((c) => tokensOf(n.value).has(c));
                let count = 0;
                for (const f of files) {
                    count += classNamesOf(readFileSync(join(paths.assets, f), 'utf8')).filter((n) => holds(n, parent.classes)).length;
                }
                if (count !== 1) {
                    fail('unique', `selector not unique: the className pair ${parent.classes.join(' ')} occurs ${count} time(s) across ${paths.assets}/*.js`);
                    continue;
                }
                const at = names.find((n) => holds(n, parent.classes));
                if (!at) {
                    fail('unique', `selector not unique: the className pair ${parent.classes.join(' ')} is not in ${landing[0]}`);
                    continue;
                }
                // The parent's direct child: the next element call after its className, with no className between.
                const rest = chunk.slice(at.end);
                const nextEl = /\(\s*`([a-zA-Z][\w-]*)`\s*,\s*\{/.exec(rest);
                const nextName = classNamesOf(rest)[0];
                const childTag = child.tag ?? nextEl?.[1];
                if (!nextEl || nextEl[1] !== childTag || !nextName || nextName.index < nextEl.index || !holds(nextName, child.classes)) {
                    fail('child', `the element inside ${parent.classes.join(' ')} is not ${childTag} with ${child.classes.join(' ')} in ${landing[0]}`);
                    continue;
                }
                passes.push(`ok bundle: ${selector} -- every token in ${landing[0]}, the parent className unique across ${files.length} asset(s), its child an ${childTag}`);
            }
        }
    }

    // Clause 4: the parent's gate over derived cases.
    const prefs = existsSync(paths.prefs) ? readFileSync(paths.prefs, 'utf8') : '';
    const orcaPort = Number(prefs.match(/pref\("powerbrowser\.orca\.port",\s*(\d+)\)/)?.[1]);
    if (!Number.isInteger(orcaPort)) {
        fail('gate', `no powerbrowser.orca.port default in ${paths.prefs}`);
    } else {
        const mark = 'data:image/svg+xml,%3Csvg%2F%3E';
        const base = { senderPort: orcaPort, orcaPort, embeddedByShell: false, orcaVersion: version, markDataUri: mark };
        const cases = [
            ['orcad-origin document', base, true],
            ['the sidecar port', { ...base, senderPort: orcaPort + 1 }, false],
            ['the shell-embedded sender', { ...base, embeddedByShell: true }, false],
            ['an unknown version', { ...base, orcaVersion: '0.0.0-unknown' }, false],
            ['a non-data mark', { ...base, markDataUri: 'https://example.invalid/mark.svg' }, false],
        ];
        for (const [label, input, answers] of cases) {
            const got = env.logoAnswerFor(input);
            const ok = answers ? (got && got.src === mark && got.alt === env.ORCA_LOGO_ALT && Array.isArray(got.selectors)) : got === null;
            if (!ok) fail('gate', `logoAnswerFor ${answers ? 'refused' : 'answered'} ${label}`);
        }
        if (!failures.some((f) => f.rule === 'gate')) passes.push(`ok gate: only orcad's port ${orcaPort}, not shell-embedded, ${version}, a data: mark is answered (${cases.length} cases)`);
    }
    return { passes, failures, version };
}

const FIXTURE_LANDING = 'import{C}from"./App-x.js";const L=()=>(0,F.jsx)(`div`,{className:`flex flex-col items-center gap-4 py-8`,children:[(0,F.jsx)(`div`,{className:`flex items-center justify-center size-20 rounded-2xl border border-border/80`,children:(0,F.jsx)(`img`,{src:C,alt:`Orca logo`,className:`size-12`})}),(0,F.jsx)(`h1`,{className:`text-4xl font-bold`})]});export{L as default};\n';
const FIXTURE_OTHER = 'const B=()=>(0,F.jsx)(`div`,{className:`size-10 rounded-lg`});export{B};\n';

async function selfTest() {
    const dir = mkdtempSync(join(tmpdir(), 'pb-landing-selectors-'));
    try {
        const real = defaultPaths();
        const paths = {
            orcaEnv: join(dir, 'OrcaEnv.sys.mjs'),
            pins: join(dir, 'upstream-pins.env'),
            prefs: join(dir, 'powerbrowser-sidecar.js'),
            assets: join(dir, 'assets'),
        };
        const reset = () => {
            copyFileSync(real.orcaEnv, paths.orcaEnv);
            copyFileSync(real.pins, paths.pins);
            copyFileSync(real.prefs, paths.prefs);
            rmSync(paths.assets, { recursive: true, force: true });
            mkdirSync(paths.assets);
            writeFileSync(join(paths.assets, 'Landing-fixture.js'), FIXTURE_LANDING);
            writeFileSync(join(paths.assets, 'Other-fixture.js'), FIXTURE_OTHER);
        };
        const swap = (file, from, to) => () => {
            const text = readFileSync(file, 'utf8');
            if (!text.includes(from)) throw new Error(`plant did not land in ${file}: ${from}`);
            writeFileSync(file, text.replace(from, to));
        };
        reset();
        const clean = await check(paths);
        if (clean.failures.length) {
            console.log(`${NAME} self-test: FAIL -- the copies are not green: ${clean.failures.map((f) => f.text).join('; ')}`);
            return 1;
        }
        console.log(`  ok  control: the copies are green (${clean.passes.length} clauses)`);
        const plants = [
            ['the version entry removed', 'no selector entry', swap(paths.orcaEnv, '"1.4.248": Object.freeze(', '"0.0.1": Object.freeze(')],
            ['a token absent from the Landing chunk', 'token not in bundle', swap(join(paths.assets, 'Landing-fixture.js'), 'className:`size-12`', 'className:`size-14`')],
            ['a second asset holding the same className pair', 'selector not unique', () => writeFileSync(join(paths.assets, 'Other-fixture.js'), 'const B=(0,F.jsx)(`div`,{className:`size-20 rounded-2xl`});\n')],
            ['the tile holding a span, not the img', 'is not img', swap(join(paths.assets, 'Landing-fixture.js'), '(0,F.jsx)(`img`,{src:C,alt:`Orca logo`,className:`size-12`})', '(0,F.jsx)(`span`,{className:`size-12`})')],
            ['a gate that admits any port', "refused orcad-origin document|answered the sidecar port", swap(paths.orcaEnv, 'senderPort !== orcaPort || ', '')],
            ['a gate that admits the shell-embedded sender', 'answered the shell-embedded sender', swap(paths.orcaEnv, ' || embeddedByShell !== false)', ')')],
        ];
        let bad = 0;
        for (const [label, naming, plant] of plants) {
            reset();
            plant();
            const got = (await check(paths)).failures;
            const hit = got.find((f) => new RegExp(naming).test(f.text));
            if (hit) console.log(`  ok  ${label} -> red, naming '${hit.text}'`);
            else {
                console.log(`  FAIL ${label} did not go red naming '${naming}'; got: ${got.map((f) => f.text).join(' | ') || 'green'}`);
                bad += 1;
            }
        }
        console.log(bad
            ? `${NAME} self-test: FAIL -- ${bad} of ${plants.length} plant(s) did not go red naming the drift`
            : `${NAME} self-test: PASS -- ${plants.length} planted faults each went red naming the drift`);
        return bad ? 1 : 0;
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    const args = process.argv.slice(2);
    if (args.some((a) => a !== '--self-test')) {
        console.log(`${NAME}: FAIL -- unknown argument ${args.find((a) => a !== '--self-test')}. Usage: node scripts/verify-orca-landing-selectors.mjs [--self-test]`);
        process.exit(2);
    }
    if (args.includes('--self-test')) process.exit(await selfTest());
    const res = await check(defaultPaths());
    for (const p of res.passes) console.log(`  ${p}`);
    for (const f of res.failures) console.log(`  FAIL ${f.rule} -- ${f.text}`);
    const landing = existsSync(defaultPaths().assets) ? readdirSync(defaultPaths().assets).find((f) => /^Landing-.*\.js$/.test(f)) : null;
    console.log(res.failures.length
        ? `${NAME}: FAIL -- ${res.failures.length} rule failure(s)`
        : `${NAME}: PASS -- Orca ${res.version}'s landing logo selector matches ${landing ?? 'no built chunk (SKIP)'} and the gate answers orcad's origin only`);
    process.exit(res.failures.length ? 1 : 0);
}
