#!/usr/bin/env node
// scripts/build-update-xml.mjs
//
// The per-BUILD_TARGET descriptor builder (Phase 44, UPD-14). It writes one
// update.xml per BUILD_TARGET to <outdir>/<channel>/<BUILD_TARGET>/update.xml.
//
// WHY IT EXISTS. The ship path and the MAR hop gate must not disagree about the
// descriptor format. Both call buildUpdateXml from scripts/verify-mar-update-hop.mjs,
// the one emitter; this CLI imports it and never copies the format. What this CLI
// adds is input derivation: every value comes from the built tree at run time.
//
//  1. Target table. TARGETS lists the BUILD_TARGET rows this tree may emit: each
//     OS_TARGET paired with its TARGET_XPCOM_ABI, formatted the way
//     UpdateUtils.sys.mjs:89-90 formats %BUILD_TARGET%. An OS outside the table is
//     refused, naming the table. An OS inside the table with another ABI is refused
//     as a disagreement. PENDING names the OS values whose rows wait for stages 6
//     and 7 (docs/RELEASING.md) and are refused until observed.
//  2. Build identity. objdir/dist/bin/application.ini gives Version and BuildID.
//     BuildID is refused when absent or not fourteen digits.
//  3. Channel. The channel flag defaults to UPDATE_CHANNEL (scripts/generate.mjs). It must
//     equal MOZ_UPDATE_CHANNEL in objdir/config.status. The MAR channel id is refused
//     by name when given as the channel: it is an identifier, not an update channel.
//  4. detailsURL. [urls] release_notes from configuration.toml. --details-url
//     overrides it and must be https:.
//  5. Patch URL. [urls] mar_origin, the release tag from
//     powerbrowser/packaging/version/release.txt, and the MAR file name, joined as
//     <mar_origin>/<tag>/<asset> (the form generate.mjs documents for marOrigin).
//  6. Digest. The MAR bytes are read from disk. The sha512 and size come from
//     buildUpdateXml, never typed.
//
//  Modes:
//   --emit --outdir <dir>  write <dir>/<channel>/<BUILD_TARGET>/update.xml
//   --check                emit twice and require byte-identical output; parse each
//                          emission back against the inputs; with --outdir, also
//                          byte-compare each file already on disk
//   --self-test            a green control first, then planted faults, each red
//                          naming its file and value; writes nothing outside mkdtemp
//
// Honestly --quick (--self-test): mkdtemp fixtures, node:crypto and text reads. No
// build, browser, display or network. --check reads objdir/ and the MAR (full tier)
// and FAILs naming the first missing input; it never SKIPs.
//
// shortcut: one built tree and one MAR per run, so the target loop has one
// iteration. Upgrade to a per-target MAR map when Darwin or Windows is observed.
// shortcut: platformVersion equals Version (the Gecko ESR convention). Upgrade when
// the build reports a platform version that differs.
//
// Usage:
//   node scripts/build-update-xml.mjs --emit --outdir <dir> [--channel <name>]
//   node scripts/build-update-xml.mjs --check [--outdir <dir>]
//   node scripts/build-update-xml.mjs --self-test

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildUpdateXml, parseUpdateXml } from './verify-mar-update-hop.mjs';
import { UPDATE_CHANNEL, marOrigin, resolveConfig, updateChannel } from './generate.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'build-update-xml';
const SELF_REL = 'scripts/build-update-xml.mjs';
const MANIFEST_REL = 'configuration.toml';
const APP_INI_REL = 'objdir/dist/bin/application.ini';
const CONFIG_STATUS_REL = 'objdir/config.status';
const MAR_REL = '.mozbuild/mar-hop/nplus1.mar';
const RELEASE_TXT_REL = 'powerbrowser/packaging/version/release.txt';
const REQUIRED_SUBSTS = Object.freeze(['OS_TARGET', 'TARGET_XPCOM_ABI', 'MOZ_UPDATE_CHANNEL', 'MAR_CHANNEL_ID']);
// The observed BUILD_TARGET rows. Each token is OS_TARGET + "_" + TARGET_XPCOM_ABI.
const TARGETS = Object.freeze([Object.freeze({ os: 'Linux', abi: 'x86_64-gcc3' })]);
// OS values whose rows are not observed yet (docs/RELEASING.md stages 6 and 7).
const PENDING = Object.freeze({ Darwin: 'stage 6', WINNT: 'stage 7' });
const VALUE_FLAGS = Object.freeze(['--outdir', '--channel', '--details-url', '--config-status', '--application-ini', '--mar']);
const MODE_FLAGS = Object.freeze(['--emit', '--check', '--self-test']);
const DOTTED = /^\d+(\.\d+)*$/;
const BUILD_ID = /^\d{14}$/;
const RELEASE_TAG = /^v\d+(\.\d+)*-\d+$/;

function refuse(msg) {
    console.error(`${NAME}: FAIL -- ${msg}`);
    console.error(`  Next step: run: node ${SELF_REL} --self-test, or read the usage in the header of ${SELF_REL}.`);
    process.exit(2);
}

function parseArgs(argv) {
    const modes = [];
    const opts = {};
    for (let i = 0; i < argv.length; i += 1) {
        const a = argv[i];
        if (MODE_FLAGS.includes(a)) {
            modes.push(a);
        } else if (VALUE_FLAGS.includes(a)) {
            const v = argv[i + 1];
            if (v === undefined || v.startsWith('--')) refuse(`${a} needs a value`);
            opts[a] = v;
            i += 1;
        } else {
            refuse(`unknown argument '${a}'`);
        }
    }
    if (modes.length !== 1) refuse('give exactly one mode: --emit, --check or --self-test');
    if (modes[0] === '--emit' && opts['--outdir'] === undefined) refuse('--emit needs --outdir <dir>');
    if (modes[0] === '--self-test' && Object.keys(opts).length > 0) refuse('--self-test takes no other flags');
    return { mode: modes[0], opts };
}

/** The [substs] block of config.status as a key/value map, or null when the block is absent. Pure. */
export function substsOf(text) {
    // config.status nests lists inside [substs], so the block ends at the next column-0 assignment.
    // Only dictionary entries (three or four spaces of indentation) are read.
    const lines = text.split('\n');
    const open = lines.findIndex(l => l.startsWith('substs = {'));
    if (open < 0) return null;
    const next = lines.findIndex((l, i) => i > open && /^[A-Za-z_][A-Za-z0-9_]* = /.test(l));
    const end = next < 0 ? lines.length : next;
    const out = {};
    for (const line of [lines[open].slice('substs = {'.length), ...lines.slice(open + 1, end)]) {
        const kv = /^\s{3,4}'([A-Za-z0-9_]+)': '([^']*)',?\s*$/.exec(line);
        if (kv) out[kv[1]] = kv[2];
    }
    return out;
}

/** Version and BuildID from application.ini, each null when absent. Pure. */
export function appIniOf(text) {
    return {
        version: /^Version=(\S+)\s*$/m.exec(text)?.[1] ?? null,
        buildID: /^BuildID=(\S+)\s*$/m.exec(text)?.[1] ?? null,
    };
}

function resolvedConfig(root) {
    let resolved;
    try {
        resolved = resolveConfig(join(root, MANIFEST_REL));
    } catch (e) {
        return { error: `${MANIFEST_REL} could not be read (${e.message}). Next step: run node scripts/generate.mjs -- it reports the faulty line` };
    }
    if (resolved.failures.length > 0 || resolved.config === undefined) {
        return { error: `${MANIFEST_REL} does not resolve, so no descriptor input can be derived. Next step: run node scripts/generate.mjs -- it reports the faulty key` };
    }
    return { config: resolved.config };
}

/**
 * Derive one descriptor per observed BUILD_TARGET from the built tree. Returns
 * { failures, outputs }; outputs is empty whenever failures is non-empty. Every
 * failure names its file and value. overrides.texts keys are root-relative paths
 * whose content replaces the file read (the self-test plants use it in memory).
 */
function runChecks(root, overrides = {}) {
    const failures = [];
    const fail = msg => failures.push(msg);
    const none = () => ({ failures, outputs: [] });
    const shown = p => {
        const r = relative(root, p);
        return r.startsWith('..') ? p : r;
    };
    const texts = overrides.texts ?? {};
    const readText = p => (Object.hasOwn(texts, shown(p)) ? texts[shown(p)] : (existsSync(p) ? readFileSync(p, 'utf8') : null));
    const paths = {
        appIni: overrides.applicationIni ?? join(root, APP_INI_REL),
        status: overrides.configStatus ?? join(root, CONFIG_STATUS_REL),
        mar: overrides.mar ?? join(root, MAR_REL),
    };

    // 1. Built target: config.status [substs].
    const statusText = readText(paths.status);
    if (statusText === null) {
        fail(`${shown(paths.status)} is absent, so the built target cannot be read. Next step: build the tree (./mach build) before running this check`);
        return none();
    }
    const subst = substsOf(statusText);
    if (subst === null) {
        fail(`${shown(paths.status)} carries no substs block. Next step: regenerate the tree`);
        return none();
    }
    for (const k of REQUIRED_SUBSTS) {
        if (subst[k] === undefined) fail(`${shown(paths.status)} has no ${k}. Next step: regenerate the tree`);
    }
    if (failures.length > 0) return none();
    const { OS_TARGET: os, TARGET_XPCOM_ABI: abi } = subst;
    const rows = TARGETS.map(t => `${t.os}_${t.abi}`).join(', ');
    if (Object.hasOwn(PENDING, os)) {
        fail(`${shown(paths.status)} OS_TARGET "${os}" is pending (${PENDING[os]}) and has no row in TARGETS. Next step: observe the target at that stage, then add its row`);
        return none();
    }
    if (!TARGETS.some(t => t.os === os)) {
        fail(`unknown target token: ${shown(paths.status)} OS_TARGET "${os}" is not a row of TARGETS (${rows}). Next step: add the row when the stage observes the target`);
        return none();
    }
    if (!TARGETS.some(t => t.os === os && t.abi === abi)) {
        fail(`${shown(paths.status)} TARGET_XPCOM_ABI "${abi}" disagrees with the TARGETS row for "${os}" (${rows}). Next step: rebuild the tree, or correct the row`);
        return none();
    }
    const token = `${os}_${abi}`;

    // 2. Build identity: application.ini.
    const iniText = readText(paths.appIni);
    if (iniText === null) {
        fail(`${shown(paths.appIni)} is absent, so the build identity cannot be read. Next step: build the tree (./mach build) before running this check`);
        return none();
    }
    const { version, buildID } = appIniOf(iniText);
    if (version === null || !DOTTED.test(version)) {
        fail(`${shown(paths.appIni)} carries no dotted Version (got ${JSON.stringify(version)}). Next step: rebuild the tree`);
    }
    if (buildID === null || !BUILD_ID.test(buildID)) {
        fail(`${shown(paths.appIni)} carries no BuildID of fourteen digits (got ${JSON.stringify(buildID)}). Next step: rebuild the tree; a descriptor without a BuildID is refused`);
    }

    // 3. Channel: the update channel, never the MAR channel id.
    const channel = overrides.channel ?? UPDATE_CHANNEL;
    const mozChannel = subst.MOZ_UPDATE_CHANNEL;
    if (channel === subst.MAR_CHANNEL_ID && channel !== mozChannel) {
        fail(`--channel "${channel}" is the MAR channel id, not an update channel; ${shown(paths.status)} MOZ_UPDATE_CHANNEL is "${mozChannel}". Next step: pass the update channel "${mozChannel}", or omit --channel`);
    } else if (channel !== mozChannel) {
        fail(`--channel "${channel}" disagrees with MOZ_UPDATE_CHANNEL "${mozChannel}" in ${shown(paths.status)}. Next step: pass "${mozChannel}", or rebuild the tree`);
    }
    if (channel !== UPDATE_CHANNEL) {
        fail(`--channel "${channel}" is not UPDATE_CHANNEL "${UPDATE_CHANNEL}" in scripts/generate.mjs. Next step: pass "${UPDATE_CHANNEL}", or omit --channel`);
    }

    // 4. Configuration: detailsURL, the patch origin.
    const resolved = resolvedConfig(root);
    if (resolved.error) {
        fail(resolved.error);
        return none();
    }
    const { config } = resolved;
    const details = overrides.detailsURL ?? config.urls?.release_notes;
    const detailsSource = overrides.detailsURL !== undefined ? '--details-url' : `${MANIFEST_REL} [urls] release_notes`;
    let detailsHttps = false;
    try {
        detailsHttps = new URL(details).protocol === 'https:';
    } catch {
        detailsHttps = false;
    }
    if (!detailsHttps) {
        fail(`${detailsSource} is ${JSON.stringify(details)}, which is not an https: URL, so the descriptor's detailsURL is refused. Next step: set it to an https: Releases page`);
    }
    const origin = marOrigin(config);
    if (origin === null) {
        fail(`${MANIFEST_REL} [urls] mar_origin is unset, so the patch URL has no host. Next step: set it to the write-once MAR origin`);
    }

    // 5. Release tag and MAR bytes.
    const tagText = readText(join(root, RELEASE_TXT_REL));
    const tag = tagText === null ? null : tagText.trim();
    if (tag === null || !RELEASE_TAG.test(tag)) {
        fail(`${RELEASE_TXT_REL} must hold one release tag such as v153.5.1-1 (got ${JSON.stringify(tag)}). Next step: restore the file`);
    }
    const marBytes = existsSync(paths.mar) ? readFileSync(paths.mar) : null;
    if (marBytes === null) {
        fail(`${shown(paths.mar)} is absent, so the descriptor has no digest. Next step: produce the N-plus-1 MAR per the docs/BUILD.md packaging procedure, or pass --mar <path>`);
    }
    if (failures.length > 0) return none();

    // 6. Emit through the one shared emitter.
    const marUrl = `${origin}/${tag}/${basename(paths.mar)}`;
    const args = {
        marBytes,
        marUrl,
        appVersion: version,
        platformVersion: version,
        buildID,
        displayVersion: tag.slice(1),
        detailsURL: details,
    };
    const expect = {
        appVersion: version,
        buildID,
        detailsURL: details,
        url: marUrl,
        hashFunction: 'sha512',
        hashValue: createHash('sha512').update(marBytes).digest('hex'),
        size: String(marBytes.length),
    };
    // One built tree per run, so one target. The loop shape stays for the per-target map.
    const outputs = [{ rel: join(channel, token, 'update.xml'), args, expect }];
    return { failures, outputs };
}

/**
 * The byte check. Two fresh emissions of the same inputs must match, each must parse back to
 * the built values, and with outdir each file already on disk must equal the fresh emission.
 */
function checkOutputs(outputs, outdir = null) {
    const failures = [];
    for (const o of outputs) {
        const a = buildUpdateXml(o.args);
        const b = buildUpdateXml(o.args);
        if (a !== b) {
            failures.push(`${o.rel} is not byte-identical across two emissions of the same inputs. Next step: look for a timestamp or random value in buildUpdateXml`);
        }
        const p = parseUpdateXml(a);
        if (p === null) {
            failures.push(`${o.rel} does not carry the descriptor shape. Next step: serve exactly what buildUpdateXml emits`);
        } else {
            for (const [k, want] of Object.entries(o.expect)) {
                if (p[k] !== want) failures.push(`${o.rel} ${k} is ${JSON.stringify(p[k])} but the built tree carries ${JSON.stringify(want)}. Next step: rebuild the descriptor`);
            }
        }
        if (outdir !== null) {
            const file = join(outdir, o.rel);
            if (!existsSync(file)) {
                failures.push(`${o.rel} is absent under ${outdir}. Next step: run --emit --outdir ${outdir} first`);
            } else if (readFileSync(file, 'utf8') !== a) {
                failures.push(`${o.rel} is not byte-identical to a fresh emission from the built tree (a hand edit may have intervened). Next step: re-emit with --emit`);
            }
        }
    }
    return failures;
}

function writeOutputs(outputs, outdir) {
    for (const o of outputs) {
        const file = join(outdir, o.rel);
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, buildUpdateXml(o.args));
    }
}

function printFailures(failures) {
    console.error(`${NAME}: FAIL -- ${failures.length} problem(s)`);
    for (const f of failures) console.error(`  - ${f}`);
}

// --- self-test ---------------------------------------------------------------

const FIXTURE_MAR = Buffer.from('power-browser self-test MAR bytes\n');
const FIXTURE_VERSION = '153.5.1';
const FIXTURE_BUILD_ID = '20261020215955';

function statusFixture({ os = 'Linux', abi = 'x86_64-gcc3', channel = UPDATE_CHANNEL, marId }) {
    return [
        'substs = {',
        `    'MAR_CHANNEL_ID': '${marId}',`,
        `    'MOZ_UPDATE_CHANNEL': '${channel}',`,
        `    'OS_TARGET': '${os}',`,
        `    'TARGET_XPCOM_ABI': '${abi}',`,
        '}',
        '',
    ].join('\n');
}

function iniFixture({ buildID = FIXTURE_BUILD_ID } = {}) {
    return ['[App]', `Version=${FIXTURE_VERSION}`, ...(buildID === null ? [] : [`BuildID=${buildID}`]), '[Gecko]', ''].join('\n');
}

function makeFixture() {
    const dir = mkdtempSync(join(tmpdir(), 'build-update-xml-'));
    writeFileSync(join(dir, MANIFEST_REL), readFileSync(join(REPO_ROOT, MANIFEST_REL)));
    mkdirSync(dirname(join(dir, RELEASE_TXT_REL)), { recursive: true });
    writeFileSync(join(dir, RELEASE_TXT_REL), 'v153.5.1-1\n');
    mkdirSync(dirname(join(dir, MAR_REL)), { recursive: true });
    writeFileSync(join(dir, MAR_REL), FIXTURE_MAR);
    return dir;
}

function selfTest() {
    const resolved = resolvedConfig(REPO_ROOT);
    if (resolved.error) {
        console.error(`${NAME}: --self-test FAIL -- ${resolved.error}`);
        return 1;
    }
    const marId = updateChannel(resolved.config).marChannelId;
    const dirs = [];
    const scratch = (prefix) => {
        const d = mkdtempSync(join(tmpdir(), prefix));
        dirs.push(d);
        return d;
    };
    try {
        const root = makeFixture();
        dirs.push(root);
        const green = {
            [CONFIG_STATUS_REL]: statusFixture({ marId }),
            [APP_INI_REL]: iniFixture(),
        };

        // Control first: a clean fixture emits one descriptor, and it is green.
        const baseline = runChecks(root, { texts: green });
        if (baseline.failures.length > 0) {
            console.error(`${NAME}: --self-test FAIL -- the green control went red: ${baseline.failures.join(' | ')}`);
            return 1;
        }
        const rel = join(UPDATE_CHANNEL, 'Linux_x86_64-gcc3', 'update.xml');
        if (baseline.outputs.length !== 1 || baseline.outputs[0].rel !== rel) {
            console.error(`${NAME}: --self-test FAIL -- the control emitted ${JSON.stringify(baseline.outputs.map(o => o.rel))}, not ${rel}`);
            return 1;
        }
        const controlFailures = checkOutputs(baseline.outputs);
        if (controlFailures.length > 0) {
            console.error(`${NAME}: --self-test FAIL -- the control's descriptor did not check: ${controlFailures.join(' | ')}`);
            return 1;
        }
        console.log(`  ok  control: one descriptor, ${rel}, green`);

        // Byte-identity control: two independent runs write identical trees.
        const again = runChecks(root, { texts: green });
        const outA = scratch('build-update-xml-out-');
        const outB = scratch('build-update-xml-out-');
        writeOutputs(baseline.outputs, outA);
        writeOutputs(again.outputs, outB);
        const sameBytes = readFileSync(join(outA, rel), 'utf8') === readFileSync(join(outB, rel), 'utf8');
        if (!sameBytes || checkOutputs(baseline.outputs, outA).length > 0) {
            console.error(`${NAME}: --self-test FAIL -- two runs over identical inputs did not write identical bytes`);
            return 1;
        }
        console.log('  ok  byte-identity control: two runs over identical inputs write identical bytes');

        let failed = 0;
        const plants = [
            ['unknown target token (OS_TARGET Plan9)', { texts: { [CONFIG_STATUS_REL]: statusFixture({ os: 'Plan9', marId }), [APP_INI_REL]: iniFixture() } }, CONFIG_STATUS_REL, 'Plan9'],
            ['application.ini with no BuildID', { texts: { ...green, [APP_INI_REL]: iniFixture({ buildID: null }) } }, APP_INI_REL, 'BuildID'],
            ['TARGET_XPCOM_ABI disagreeing with the table', { texts: { [CONFIG_STATUS_REL]: statusFixture({ abi: 'i686-gcc3', marId }), [APP_INI_REL]: iniFixture() } }, CONFIG_STATUS_REL, 'i686-gcc3'],
            ['channel flag given the MAR channel id', { texts: green, channel: marId }, CONFIG_STATUS_REL, marId],
            ['--details-url not https', { texts: green, detailsURL: 'http://example.invalid/releases' }, '--details-url', 'http://example.invalid/releases'],
        ];
        for (const [name, overrides, file, value] of plants) {
            const { failures } = runChecks(root, overrides);
            if (failures.some(f => f.includes(file) && f.includes(value))) {
                console.log(`  ok  ${name} -> red, naming '${file}' and '${value}'`);
            } else {
                console.error(`${NAME}: --self-test FAIL -- '${name}' did not go red naming '${file}' and '${value}'; got: ${failures.join(' | ') || '(no failures at all)'}`);
                failed += 1;
            }
        }

        // Hand edit of a written descriptor goes red naming the file.
        writeFileSync(join(outA, rel), `${readFileSync(join(outA, rel), 'utf8')} `);
        const edited = checkOutputs(baseline.outputs, outA);
        if (edited.some(f => f.includes(rel) && f.includes('byte-identical'))) {
            console.log(`  ok  descriptor hand edit -> red, naming '${rel}'`);
        } else {
            console.error(`${NAME}: --self-test FAIL -- a hand-edited descriptor did not go red naming '${rel}'; got: ${edited.join(' | ') || '(no failures at all)'}`);
            failed += 1;
        }

        if (failed > 0) return 1;
        console.log(`${NAME}: --self-test PASS -- control green first, then five planted faults went red naming their file and value`);
        return 0;
    } finally {
        for (const d of dirs) rmSync(d, { recursive: true, force: true });
    }
}

function main() {
    const { mode, opts } = parseArgs(process.argv.slice(2));
    if (mode === '--self-test') return selfTest();

    const overrides = {
        applicationIni: opts['--application-ini'] === undefined ? undefined : resolve(opts['--application-ini']),
        configStatus: opts['--config-status'] === undefined ? undefined : resolve(opts['--config-status']),
        mar: opts['--mar'] === undefined ? undefined : resolve(opts['--mar']),
        channel: opts['--channel'],
        detailsURL: opts['--details-url'],
    };
    const { failures, outputs } = runChecks(REPO_ROOT, overrides);
    if (failures.length > 0) {
        printFailures(failures);
        return 1;
    }
    const names = outputs.map(o => o.rel).join(', ');

    if (mode === '--emit') {
        writeOutputs(outputs, resolve(opts['--outdir']));
        console.log(`${NAME}: PASS -- wrote ${names} under ${resolve(opts['--outdir'])}`);
        return 0;
    }

    // --check: idempotency and parse-back always; the on-disk compare only with --outdir.
    const outdir = opts['--outdir'] === undefined ? null : resolve(opts['--outdir']);
    const checkFailures = checkOutputs(outputs, outdir);
    if (checkFailures.length > 0) {
        printFailures(checkFailures);
        return 1;
    }
    const scope = outdir === null ? 'idempotency and parse-back only (pass --outdir to compare a written tree)' : `compared with ${outdir}`;
    console.log(`${NAME}: PASS -- ${names} re-emit byte-identical from the built tree; ${scope}`);
    return 0;
}

process.exit(main());
