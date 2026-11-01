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
// --self-test twin: mkdtemp fixtures, control green first, then expectRed
// plants (dev suffix planted in the staged notice per the contract's own
// plant; one dropped legal notice for the PKG-05 fold-in), each red naming
// file plus value.
//
// Honestly --quick for the twin only: mkdtemp fixtures, no build, no browser,
// no display, no network. The full row needs the container-built tarball and
// FAILs naming the container-build procedure when it is absent (mar-hop
// precedent), never skips green.
//
// Usage:
//   node scripts/verify-packaged-identity.mjs
//   node scripts/verify-packaged-identity.mjs --self-test

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
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
    return {
        esrVersion: identity.esrVersion,
        releaseKey: identity.releaseKey,
        binaryName: config.identity.binary_name,
        vendor: config.product.vendor_machine,
        legalNotices: branding.legalNotices,
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
    return { failures };
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
        console.log(`${NAME}: PASS -- staged application.ini + theia/package.json branding equal the release derivation (${expected.releaseKey})`);
    }).catch((err) => {
        console.error(`${NAME}: FAIL -- ${err.message}. Next step: run: ${BUILD_CMD}`);
        process.exit(1);
    });
}
