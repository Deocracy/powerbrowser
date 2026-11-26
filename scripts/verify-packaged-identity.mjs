#!/usr/bin/env node
// scripts/verify-packaged-identity.mjs -- PKG-04 half + PKG-05 (Phase 45):
// the staged package carries release-variant identity. Expected values are
// derived at check time from releaseIdentity() plus the release-variant
// emitters (never typed): application.ini Name/Version/BuildID/Vendor plus
// the staged theia/package.json powerbrowserBranding block (name/about/legal
// notices with release name_suffix ""), plus absence of dev-variant markers.
// The About-dialog notices assertion folds in here as the
// staged-fragment-equals-release-emission check (install-closure half of the
// verify-branding-preflight source-tree half).
//
// The About dialog does not read the staged package.json: `yarn build`
// compiles the block into the frontend bundle, and the branding extension
// compiles its fallback notices in beside it. So every file under the staged
// theia/ is also searched for the notices the dev emission carries and the
// release emission does not (derived, the difference of the two emissions);
// one found is red naming the file. A package whose package.json was
// corrected while its bundle still shows the dev sentence is that case.
//
// --self-test twin: mkdtemp fixtures, control green first, then expectRed
// plants (dev suffix planted in the staged notice per the contract's own
// plant; one dropped legal notice for the PKG-05 fold-in; the dev notice
// planted in a staged frontend bundle beside a release package.json), each
// red naming file plus value.
//
// Honestly --quick for the twin only: mkdtemp fixtures, no build, no browser,
// no display, no network. The full row needs the container-built tarball and
// FAILs naming the container-build procedure when it is absent (mar-hop
// precedent), never skips green.
//
// Usage:
//   node scripts/verify-packaged-identity.mjs
//   node scripts/verify-packaged-identity.mjs --self-test

import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { emitTheiaBranding, releaseIdentity, resolveConfig } from './generate.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'verify-packaged-identity';
const BUILD_CMD = 'podman run --rm -v "$PWD:/src:rw" -w /src pb-gecko-build bash powerbrowser/packaging/package-linux.sh (after the plan 45-01 container build)';

const args = process.argv.slice(2);
const SELF_TEST = args.includes('--self-test');
for (const a of args) {
    if (a !== '--self-test') {
        console.error(`${NAME}: FAIL -- unknown argument '${a}'`);
        process.exit(2);
    }
}

function expectedIdentity() {
    const { failures, config } = resolveConfig(join(REPO_ROOT, 'configuration.toml'));
    if (failures.length > 0) throw new Error(`configuration.toml does not pass its own checks: ${failures.join(' | ')}`);
    // releaseIdentity derives the key from the ESR pin + product revision --
    // the same derivation release.txt carries, never a typed version.
    const identity = releaseIdentity(config);
    const release = config.variants.find((v) => v.id === 'release');
    if (!release) throw new Error('the manifest declares no build variant with id "release"');
    const branding = JSON.parse(emitTheiaBranding(config, release));
    // The dev-variant markers: every notice a non-release variant emits that
    // the release emission does not carry. Derived, so a manifest whose
    // variants emit the same notices yields none and the file search is void.
    const devOnlyNotices = [...new Set(config.variants.filter((v) => v.id !== 'release')
        .flatMap((v) => JSON.parse(emitTheiaBranding(config, v)).legalNotices)
        .filter((n) => !branding.legalNotices.includes(n)))];
    return {
        esrVersion: identity.esrVersion,
        releaseKey: identity.releaseKey,
        binaryName: config.identity.binary_name,
        vendor: config.product.vendor_machine,
        legalNotices: branding.legalNotices,
        devOnlyNotices,
    };
}

function parseIni(text) {
    const out = {};
    for (const line of text.split('\n')) {
        const m = /^([^=]+)=(.*)$/.exec(line.trim());
        if (m) out[m[1].trim()] = m[2].trim();
    }
    return out;
}

function checkStaged(prefix, expected) {
    const failures = [];
    let ini;
    try {
        ini = parseIni(readFileSync(join(prefix, 'application.ini'), 'utf8'));
    } catch (err) {
        return { failures: [`application.ini unreadable under ${prefix}: ${err.message}`] };
    }
    const eq = (label, actual, want, where) => {
        if (actual !== want) failures.push(`${label}: ${where} carries ${JSON.stringify(actual)} but the release derivation requires ${JSON.stringify(want)}`);
    };
    eq('Name', ini.Name, expected.binaryName, 'application.ini');
    eq('Version', ini.Version, expected.esrVersion, 'application.ini');
    eq('Vendor', ini.Vendor, expected.vendor, 'application.ini');
    if (!ini.BuildID || !/^\d{14,}$/.test(ini.BuildID)) {
        failures.push(`BuildID: application.ini carries ${JSON.stringify(ini.BuildID)} -- expected a 14+ digit build id (same-ESR revisions need distinct buildIDs)`);
    }
    let staged;
    try {
        staged = JSON.parse(readFileSync(join(prefix, 'theia', 'package.json'), 'utf8'));
    } catch (err) {
        failures.push(`theia/package.json unreadable under ${prefix}: ${err.message}`);
        return { failures };
    }
    const block = staged?.theia?.frontend?.config?.powerbrowserBranding ?? staged?.powerbrowserBranding;
    if (!block) {
        failures.push('theia/package.json carries no powerbrowserBranding block (theia.frontend.config.powerbrowserBranding) -- the staged sidecar lost its branding channel');
        return { failures };
    }
    const notices = block.legalNotices;
    if (!Array.isArray(notices)) {
        failures.push('theia/package.json powerbrowserBranding.legalNotices is not an array -- cannot compare against the release emission');
        return { failures };
    }
    // Set equality against the release emission: a dev suffix in any staged
    // notice, or a dropped notice, goes red naming file plus value.
    const missing = expected.legalNotices.filter((n) => !notices.includes(n));
    const surplus = notices.filter((n) => !expected.legalNotices.includes(n));
    for (const n of missing) failures.push(`theia/package.json staged notice set lacks the release-emitted notice ${JSON.stringify(n)} -- staged theia/package.json vs emitLegalNotices(release)`);
    for (const n of surplus) failures.push(`theia/package.json staged notice ${JSON.stringify(n)} is not in the release emission -- dev marker? staged theia/package.json vs emitLegalNotices(release)`);
    // The built files: the bundle the About dialog reads at run time, and
    // everything else staged beside it. package.json is judged above.
    const theiaRoot = join(prefix, 'theia');
    for (const p of listFiles(theiaRoot)) {
        const rel = relative(prefix, p);
        if (rel === join('theia', 'package.json')) continue;
        const bytes = readFileSync(p);
        for (const n of expected.devOnlyNotices) {
            if (bytes.includes(n)) failures.push(`${rel} carries the dev-variant notice ${JSON.stringify(n)}, which the release emission does not -- the built sidecar shows it whatever the staged theia/package.json says`);
        }
    }
    return { failures };
}

function listFiles(dir, out = []) {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) listFiles(p, out);
        else if (e.isFile()) out.push(p);
    }
    return out;
}

function selfTest() {
    let ok = true;
    const dir = mkdtempSync(join(tmpdir(), 'verify-packaged-identity-selftest-'));
    try {
        const expected = expectedIdentity();

        // Control green first: a fixture stage carrying the derived identity.
        const clean = join(dir, 'clean-stage');
        mkdirSync(join(clean, 'theia'), { recursive: true });
        writeFileSync(join(clean, 'application.ini'), `Name=${expected.binaryName}\nVersion=${expected.esrVersion}\nVendor=${expected.vendor}\nBuildID=20261023000000\n`);
        writeFileSync(join(clean, 'theia', 'package.json'), JSON.stringify({ theia: { frontend: { config: { powerbrowserBranding: { legalNotices: expected.legalNotices } } } } }));
        const control = checkStaged(clean, expected);
        if (control.failures.length !== 0) {
            console.error(`${NAME}: --self-test FAIL -- the unplanted fixture stage is already red, so a red result after a plant would prove nothing:`);
            for (const f of control.failures) console.error(`  - ${f}`);
            ok = false;
        } else {
            console.log(`${NAME}: --self-test -- the unplanted fixture stage is GREEN (release derivation vs staged copy agree)`);
        }

        const expectRed = (label, mutate, needleFile, needleValue) => {
            const fix = join(dir, `plant-${label.replace(/[^a-z0-9]+/gi, '-')}`);
            mkdirSync(join(fix, 'theia'), { recursive: true });
            writeFileSync(join(fix, 'application.ini'), `Name=${expected.binaryName}\nVersion=${expected.esrVersion}\nVendor=${expected.vendor}\nBuildID=20261023000000\n`);
            writeFileSync(join(fix, 'theia', 'package.json'), JSON.stringify({ theia: { frontend: { config: { powerbrowserBranding: { legalNotices: expected.legalNotices } } } } }));
            mutate(fix);
            const res = checkStaged(fix, expected);
            const msg = res.failures.find((f) => f.includes(needleFile) && f.includes(needleValue));
            if (!msg) {
                console.error(`${NAME}: --self-test FAIL -- ${label} was NOT rejected naming ${needleFile} and ${needleValue}`);
                for (const f of res.failures) console.error(`  - ${f}`);
                ok = false;
            } else {
                console.log(`${NAME}: --self-test -- ${label} REJECTED: ${msg}`);
            }
        };

        // Plant 1 (contract's own plant): a dev suffix in the staged notice.
        expectRed(
            'dev suffix in staged notice',
            (fix) => {
                const pkg = JSON.parse(readFileSync(join(fix, 'theia', 'package.json'), 'utf8'));
                const block = pkg.theia.frontend.config.powerbrowserBranding;
                block.legalNotices = block.legalNotices.map((n) => (n.includes('not officially associated') ? n.replace('PowerBrowser is', 'PowerBrowser' + ' Dev is') : n));
                writeFileSync(join(fix, 'theia', 'package.json'), JSON.stringify(pkg));
            },
            'theia/package.json',
            'PowerBrowser' + ' Dev is',
        );

        // Plant 3: the staged package.json carries the release notices while
        // a staged frontend bundle still carries a dev-variant notice.
        if (expected.devOnlyNotices.length === 0) {
            console.error(`${NAME}: --self-test FAIL -- the dev and release emissions carry the same notices, so the dev-notice-in-bundle plant has nothing to plant`);
            ok = false;
        } else {
            expectRed(
                'dev notice in the staged frontend bundle',
                (fix) => {
                    mkdirSync(join(fix, 'theia', 'lib', 'frontend'), { recursive: true });
                    writeFileSync(join(fix, 'theia', 'lib', 'frontend', 'bundle.js'), `x=${JSON.stringify({ legalNotices: [expected.devOnlyNotices[0]] })};\n`);
                },
                join('theia', 'lib', 'frontend', 'bundle.js'),
                expected.devOnlyNotices[0],
            );
        }

        // Plant 2 (PKG-05 fold-in): one dropped legal notice. The missing
        // notice text itself is the drift value the red must name.
        const droppedNoticeText = expected.legalNotices[expected.legalNotices.length - 1].slice(0, 40);
        expectRed(
            'dropped legal notice',
            (fix) => {
                const pkg = JSON.parse(readFileSync(join(fix, 'theia', 'package.json'), 'utf8'));
                const block = pkg.theia.frontend.config.powerbrowserBranding;
                const dropped = block.legalNotices.pop();
                void dropped;
                writeFileSync(join(fix, 'theia', 'package.json'), JSON.stringify(pkg));
            },
            'theia/package.json',
            droppedNoticeText,
        );
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
    if (!ok) {
        console.error(`${NAME}: --self-test FAIL -- one or more plants misbehaved`);
        process.exit(1);
    }
    console.log(`${NAME}: --self-test PASS -- control green first, then all planted faults behaved as pinned`);
}

if (SELF_TEST) {
    selfTest();
} else {
    import('./lib/built-tree.mjs').then(({ extractPackage }) => {
        let root;
        try {
            root = extractPackage();
        } catch (err) {
            console.error(`${NAME}: FAIL -- no container-built tarball: ${err.message}. Next step: run: ${BUILD_CMD}`);
            process.exit(1);
        }
        let expected;
        try {
            expected = expectedIdentity();
        } catch (err) {
            rmSync(join(root, '..'), { recursive: true, force: true });
            console.error(`${NAME}: FAIL -- broken instrument: ${err.message}`);
            process.exit(1);
        }
        const { failures } = checkStaged(root, expected);
        rmSync(join(root, '..'), { recursive: true, force: true });
        if (failures.length) {
            console.error(`${NAME}: FAIL -- ${failures.length} failure(s) (release key ${expected.releaseKey}):\n  ${failures.join('\n  ')}`);
            process.exit(1);
        }
        console.log(`${NAME}: PASS -- staged application.ini + theia/package.json branding equal the release derivation, and no staged theia/ file carries a dev-variant notice (${expected.releaseKey})`);
    }).catch((err) => {
        console.error(`${NAME}: FAIL -- ${err.message}. Next step: run: ${BUILD_CMD}`);
        process.exit(1);
    });
}
