#!/usr/bin/env node
// scripts/verify-toolchain-container.mjs
//
// The toolchain-container row (Phase 49, AUTO-05, threat T-49-17). The release build must refuse a
// toolchain that drifted from toolchain-baseline.txt. Every expectation is derived at check time:
//
//  1. gate     In build-linux of .github/workflows/release.yml, the step that runs ./mach build also
//              runs `toolchain-baseline.sh --container` in the same container (the bootstrap state does
//              not outlive `podman run --rm`) and writes its output to a file. A later step runs this
//              script with --measured on that same file, carries the key gate's if:, fails closed, and
//              precedes the package step and every upload, so a drifted toolchain never reaches an artifact.
//  2. lines    The baseline's non-comment lines name the keys the emitter's --container block prints
//              (derived from scripts/toolchain-baseline.sh: each `<tool> --version` line and each stdout
//              `echo "<key> ..."` line), in the same order. Each value is UNMEASURED or has the form the
//              emitter prints: x.y.z for a --version key, the echo template for the others.
//  3. image    The baseline's recorded base image pin and apt snapshot equal the Containerfile's FROM
//              digest and its snapshot.debian.org timestamps; a measured `image` line names the FROM tag.
//  4. date     No build-date pin (the pattern scripts/verify-no-build-date-pin.mjs exports) in the
//              workflow, the Containerfile, the baseline or the measured output: same-ESR revisions would
//              share a BuildID and descriptor-monotonic would never offer the later one.
//  5. measured With --measured <file>, the container's output must equal the baseline's non-comment
//              lines line for line, and an UNMEASURED baseline line is red (the build-time half).
//
// Honest tier: the row is quick (text reads and YAML parsing; js-yaml from theia/). The --measured run is
// the build-time gate in build-linux. --self-test applies every plant in memory and writes nothing. Two
// concurrent runs change nothing: the row only reads.
//
// Usage:
//   node scripts/verify-toolchain-container.mjs
//   node scripts/verify-toolchain-container.mjs --measured <container-output-file>
//   node scripts/verify-toolchain-container.mjs --self-test

import { readFileSync, realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { failOpenFaults, loadYaml, stepsOf } from './lib/release-workflow.mjs';
import { PIN, PIN_VARIABLES } from './verify-no-build-date-pin.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'toolchain-container';
const SELF_REL = 'scripts/verify-toolchain-container.mjs';
const RELEASE_REL = '.github/workflows/release.yml';
const BASELINE_REL = 'toolchain-baseline.txt';
const EMITTER_REL = 'scripts/toolchain-baseline.sh';
const CONTAINERFILE_REL = 'powerbrowser/packaging/Containerfile';
const BUILD_JOB = 'build-linux';
const KEY_IF = "steps.key_gate.outputs.build == 'true'";
const UNMEASURED = 'UNMEASURED';

const DIRECT_RUN = (() => {
    try {
        return process.argv[1] !== undefined
            && realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url));
    } catch {
        return false;
    }
})();

const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The emitter's --container keys, in print order, each with the value form it prints. */
export function emitterLines(emitter) {
    const block = /if \[ "\$\{1:-\}" = "--container" \]; then\n([\s\S]*?)\nfi\n/.exec(emitter)?.[1];
    if (block === undefined) return null;
    const out = [];
    for (const raw of block.split('\n')) {
        const line = raw.trim();
        if (line.startsWith('#') || line.includes('>&2')) continue;
        const tool = /^([a-z][a-z0-9-]*) --version\b/.exec(line);
        // shortcut: every --version line greps x.y.z; derive per line if one ever prints another form.
        if (tool) { out.push({ key: tool[1], form: new RegExp(`^${esc(tool[1])} \\d+\\.\\d+\\.\\d+$`) }); continue; }
        const echo = /^echo "([a-z][a-z0-9-]*) ([^"]*)"$/.exec(line);
        if (echo) {
            const tmpl = echo[2].split(/(\$\([^)]*\)|\$\{?[A-Za-z_][A-Za-z0-9_]*\}?)/).map((p, i) => (i % 2 ? '\\S+' : esc(p))).join('');
            out.push({ key: echo[1], form: new RegExp(`^${esc(echo[1])} ${tmpl}$`) });
        }
    }
    return out;
}

const valueLines = text => text.split('\n').filter(l => l !== '' && !l.startsWith('#'));

/**
 * Returns { failures, notes }. texts: { workflow, baseline, emitter, containerfile, measured? }; any
 * missing key is read from the tree. measured is null for the static row.
 */
export function runChecks(root, texts = {}) {
    const failures = [];
    const notes = [];
    const read = rel => {
        try {
            return readFileSync(join(root, rel), 'utf8');
        } catch {
            failures.push(`${rel} could not be read. Next step: restore it.`);
            return '';
        }
    };
    const workflow = texts.workflow ?? read(RELEASE_REL);
    const baseline = texts.baseline ?? read(BASELINE_REL);
    const emitter = texts.emitter ?? read(EMITTER_REL);
    const containerfile = texts.containerfile ?? read(CONTAINERFILE_REL);
    const measured = texts.measured ?? null;

    // 1. the build-time gate in build-linux
    let wf = null;
    try {
        wf = loadYaml().load(workflow);
    } catch (e) {
        failures.push(`${RELEASE_REL} could not be parsed (${String(e.message).split('\n')[0]}). Next step: fix the YAML.`);
    }
    const steps = stepsOf(wf?.jobs?.[BUILD_JOB]);
    const buildAt = steps.findIndex(s => /\.\/mach build/.test(String(s.run ?? '')));
    const out = buildAt < 0 ? null : /\.\/mach build[^\n]*?&& bash \/src\/scripts\/toolchain-baseline\.sh --container > \/src\/(\S+?)['"\s]/.exec(String(steps[buildAt].run));
    if (out === null) {
        failures.push(`${RELEASE_REL} ${BUILD_JOB} has no step that runs ./mach build and then, in the same container, toolchain-baseline.sh --container into a file under /src, so the release toolchain is never measured. Next step: append '&& bash /src/scripts/toolchain-baseline.sh --container > /src/<objdir>/toolchain-measured.txt' to the mach build command.`);
    } else {
        const hostPath = out[1];
        const gateRe = new RegExp(`node scripts/verify-toolchain-container\\.mjs --measured ${esc(hostPath)}(\\s|$)`);
        const gateAt = steps.findIndex(s => gateRe.test(String(s.run ?? '')));
        const lastAllowed = steps.findIndex(s => /package-linux\.sh/.test(String(s.run ?? '')) || /^actions\/upload-artifact@/.test(String(s.uses ?? '')));
        if (gateAt < 0) {
            failures.push(`${RELEASE_REL} ${BUILD_JOB} measures the toolchain into ${hostPath} but no step runs 'node scripts/verify-toolchain-container.mjs --measured ${hostPath}', so drift does not fail the build. Next step: add the drift step after the build.`);
        } else {
            if (gateAt < buildAt) failures.push(`${RELEASE_REL} ${BUILD_JOB} runs the toolchain drift step before the build that measures it. Next step: move it after the build step.`);
            if (lastAllowed >= 0 && gateAt > lastAllowed) failures.push(`${RELEASE_REL} ${BUILD_JOB} runs the toolchain drift step after '${steps[lastAllowed].name ?? steps[lastAllowed].uses}', so a drifted toolchain can reach an artifact. Next step: move it before the package step and every upload.`);
            for (const f of failOpenFaults(steps[gateAt], KEY_IF)) failures.push(`${RELEASE_REL} ${BUILD_JOB} toolchain drift step ${f}, so drift can pass. Next step: remove it.`);
        }
    }

    // 2. baseline lines against the emitter's --container lines
    const want = emitterLines(emitter);
    const have = valueLines(baseline);
    if (want === null || want.length === 0) {
        failures.push(`${EMITTER_REL} has no --container block printing any line, so the baseline has nothing to match. Next step: restore the container mode.`);
    } else {
        const keyOf = l => l.split(' ')[0];
        if (have.map(keyOf).join(' ') !== want.map(w => w.key).join(' ')) {
            failures.push(`${BASELINE_REL} names the keys [${have.map(keyOf).join(', ')}] but ${EMITTER_REL} --container prints [${want.map(w => w.key).join(', ')}], so the drift diff can never match. Next step: copy the container output line for line.`);
        }
        for (const line of have) {
            const w = want.find(x => x.key === keyOf(line));
            if (w === undefined || line === `${w.key} ${UNMEASURED}`) continue;
            if (!w.form.test(line)) failures.push(`${BASELINE_REL} line '${line}' is not the form ${EMITTER_REL} prints for ${w.key} (${w.form.source}), so a drifted ${w.key} line can never match the container. Next step: copy the ${w.key} line from the container output; do not type it.`);
        }
        const open = have.filter(l => l.endsWith(` ${UNMEASURED}`)).map(keyOf);
        if (open.length > 0) notes.push(`${open.length} line(s) UNMEASURED (${open.join(', ')}); the build-time drift step refuses until they are copied from a container build`);
    }

    // 3. image pins against the Containerfile
    const from = /^FROM\s+([^\s@]+)@(sha256:[0-9a-f]{64})\s*$/m.exec(containerfile);
    const base = /^#\s+base\s+([^\s@]+)@(sha256:[0-9a-f]{64})\s*$/m.exec(baseline);
    if (from === null) {
        failures.push(`${CONTAINERFILE_REL} has no digest-pinned FROM line, so the image is not pinned. Next step: pin the base by digest.`);
    } else if (base === null) {
        failures.push(`${BASELINE_REL} records no base image pin ('# base <image>@sha256:<digest>'), so the image digest is not part of the baseline. Next step: record the Containerfile's FROM pin.`);
    } else if (base[1] !== from[1] || base[2] !== from[2]) {
        failures.push(`${BASELINE_REL} records the base image ${base[1]}@${base[2]} but ${CONTAINERFILE_REL} builds FROM ${from[1]}@${from[2]}, so the baseline describes another image. Next step: re-measure the container and record the FROM pin in the same commit.`);
    }
    const snaps = [...new Set([...containerfile.matchAll(/snapshot\.debian\.org\/archive\/[^/\s]+\/(\d{8}T\d{6}Z)/g)].map(m => m[1]))];
    const snap = /^#\s+apt snapshot (\d{8}T\d{6}Z)\b/m.exec(baseline)?.[1];
    if (snaps.length !== 1 || snap !== snaps[0]) {
        failures.push(`${BASELINE_REL} records the apt snapshot ${JSON.stringify(snap ?? null)} but ${CONTAINERFILE_REL} reads [${snaps.join(', ')}], so the baseline describes another package set. Next step: record the one snapshot the Containerfile reads.`);
    }
    const codename = from?.[1].split(':')[1];
    const image = have.find(l => l.startsWith('image ') && !l.endsWith(` ${UNMEASURED}`));
    if (image !== undefined && codename !== undefined && image.split(' ').at(-1) !== codename) {
        failures.push(`${BASELINE_REL} line '${image}' names another release than the FROM tag ${codename}. Next step: re-measure the container.`);
    }

    // 4. no build-date pin in anything this row reads
    for (const [rel, text] of [[RELEASE_REL, workflow], [CONTAINERFILE_REL, containerfile], [BASELINE_REL, baseline], ['the measured output', measured ?? '']]) {
        text.split('\n').forEach((line, i) => {
            const m = PIN.exec(line);
            if (m) failures.push(`${rel}:${i + 1} names ${m[1]}, a build-date pin: same-ESR revisions would share a BuildID and never be offered. Next step: remove it; the BuildID comes from the build time.`);
        });
    }

    // 5. the build-time comparison
    if (measured !== null) {
        const got = valueLines(measured);
        for (const l of have.filter(x => x.endsWith(` ${UNMEASURED}`))) failures.push(`drift: ${BASELINE_REL} line '${l}' is UNMEASURED, so it can never match the container. Next step: copy the measured line into the baseline in a reviewed commit.`);
        for (let i = 0; i < Math.max(got.length, have.length); i += 1) {
            if (got[i] !== have[i] && !String(have[i]).endsWith(` ${UNMEASURED}`)) {
                failures.push(`drift: the container prints ${JSON.stringify(got[i] ?? null)} where ${BASELINE_REL} pins ${JSON.stringify(have[i] ?? null)}. Next step: if the toolchain change is intended, copy the measured line into the baseline in a reviewed commit; otherwise rebuild from the pinned image.`);
            }
        }
    }
    return { failures, notes };
}

function main(args) {
    let measured = null;
    for (let i = 0; i < args.length; i += 1) {
        if (args[i] === '--measured' && args[i + 1] !== undefined) {
            try {
                measured = readFileSync(args[i + 1], 'utf8');
            } catch (e) {
                console.error(`${NAME}: FAIL -- the measured toolchain output ${args[i + 1]} could not be read (${e.code ?? e.message}). Next step: run the container build step, which writes it.`);
                return 1;
            }
            i += 1;
        } else {
            console.error(`${NAME}: FAIL -- unknown argument '${args[i]}'`);
            console.error(`  Next step: run: node ${SELF_REL} [--measured <file>], or add --self-test to prove the row discriminates.`);
            return 2;
        }
    }
    const { failures, notes } = runChecks(REPO_ROOT, { measured });
    if (failures.length > 0) {
        console.error(`${NAME}: FAIL -- ${failures.length} problem(s).`);
        failures.forEach(f => console.error(`  ${f}`));
        return 1;
    }
    const tail = notes.length > 0 ? `; ${notes.join('; ')}` : '';
    console.log(`${NAME}: PASS -- ${BUILD_JOB} measures the container toolchain and refuses drift before packaging; the baseline matches the emitter's lines and the Containerfile's image pins; no build-date pin${measured === null ? '' : '; the measured output equals the baseline'}${tail}`);
    return 0;
}

// --- self-test ---------------------------------------------------------------

function selfTest() {
    const tree = rel => readFileSync(join(REPO_ROOT, rel), 'utf8');
    const real = { workflow: tree(RELEASE_REL), baseline: tree(BASELINE_REL), emitter: tree(EMITTER_REL), containerfile: tree(CONTAINERFILE_REL) };
    // A fully measured fixture: every UNMEASURED line filled with a value of the emitter's form.
    const fill = { clang: 'clang 17.0.1', sysroot: 'sysroot jessie glibc-2.19', 'sysroot-glibcxx': 'sysroot-glibcxx GLIBCXX_3.4.30', image: `image pb-gecko-build ${/^FROM\s+[^:\s]+:([^\s@]+)@/m.exec(real.containerfile)?.[1]}` };
    const measuredBaseline = real.baseline.split('\n').map(l => (l.endsWith(` ${UNMEASURED}`) ? fill[l.split(' ')[0]] ?? l : l)).join('\n');
    const measuredOut = valueLines(measuredBaseline).join('\n') + '\n';
    const run = over => runChecks(REPO_ROOT, { ...real, ...over }).failures;
    const edit = (text, from, to) => {
        if (!text.includes(from)) throw new Error(`self-test anchor missing: ${JSON.stringify(from)}`);
        return text.replace(from, to);
    };

    let failed = 0;
    const control = [...run({}), ...run({ baseline: measuredBaseline, measured: measuredOut })];
    if (control.length > 0) {
        console.error(`${NAME}: --self-test FAIL -- the green control went red: ${control.join(' | ')}`);
        return 1;
    }
    console.log('  ok  green: the tree\'s workflow, baseline, Containerfile and emitter, and a fully measured container output equal to the baseline');

    const rustc = valueLines(real.baseline).find(l => l.startsWith('rustc '));
    const digest = /^FROM\s+[^\s@]+@(sha256:[0-9a-f]{64})/m.exec(real.containerfile)[1];
    const drifted = `sha256:${'0'.repeat(64)}`;
    const pinVar = PIN_VARIABLES[0];
    const gateStep = /\n {6}- name: [^\n]*drift[^\n]*\n(?: {8}[^\n]*\n)+/.exec(real.workflow)?.[0] ?? '';
    const noGate = edit(real.workflow, gateStep, '\n');
    const firstUpload = '      # Data only: the signer is built on a hosted runner';
    // Each family: one fault class, every route by which it could escape the build, each red naming it.
    const families = [
        ['drifted rustc line', [
            ['the container prints another rustc', { baseline: measuredBaseline, measured: measuredOut.replace(rustc, 'rustc 1.99.0') }, ['drift', 'rustc 1.99.0', rustc]],
            ['a baseline rustc the emitter cannot print', { baseline: edit(real.baseline, `${rustc}\n`, 'rustc 1.97\n') }, ['rustc 1.97', 'not the form']],
            ['the drift step removed', { workflow: edit(real.workflow, gateStep, '\n') }, ['drift does not fail the build']],
            ['the drift step after the package step', { workflow: edit(noGate, firstUpload, `${gateStep.slice(1)}\n${firstUpload}`) }, ['after', 'Package the tarball']],
            ['the drift step failing open', { workflow: real.workflow.replace(/(\n {6}- name: [^\n]*drift[^\n]*\n)/, '$1        continue-on-error: true\n') }, ['continue-on-error']],
        ]],
        ['drifted image digest', [
            ['the baseline base pin off the Containerfile FROM', { baseline: edit(real.baseline, digest, drifted) }, [drifted, digest]],
            ['the Containerfile FROM re-pinned without the baseline', { containerfile: edit(real.containerfile, digest, drifted) }, [drifted, digest]],
            ['the apt snapshot off the Containerfile', { baseline: real.baseline.replace(/(apt snapshot )\d{8}T\d{6}Z/, '$120990101T000000Z') }, ['20990101T000000Z', 'apt snapshot']],
        ]],
        [`pinned ${pinVar}`, [
            ['in the build step env', { workflow: edit(real.workflow, '          PB_KEYDIR: ${{ vars.PB_KEYDIR }}\n', `          PB_KEYDIR: \${{ vars.PB_KEYDIR }}\n          ${pinVar}: "20261020000000"\n`) }, [RELEASE_REL, pinVar]],
            ['in the Containerfile', { containerfile: `${real.containerfile}ENV ${pinVar}=20261020000000\n` }, [CONTAINERFILE_REL, pinVar]],
            ['in the measured output', { baseline: measuredBaseline, measured: `${measuredOut}${pinVar}=1\n` }, ['measured output', pinVar]],
        ]],
    ];
    for (const [family, plants] of families) {
        const missed = [];
        for (const [what, over, needles] of plants) {
            const got = run(over);
            if (!got.some(f => needles.every(n => f.includes(n)))) missed.push(`${what} (got: ${got.join(' | ') || 'nothing red'})`);
        }
        if (missed.length > 0) {
            console.error(`${NAME}: --self-test FAIL -- '${family}' escaped the row: ${missed.join('; ')}`);
            failed += 1;
        } else {
            console.log(`  ok  ${family} -> red naming the drift, by every route: ${plants.map(p => p[0]).join('; ')}`);
        }
    }
    if (failed > 0) return 1;
    console.log(`${NAME}: --self-test PASS -- the green control first, then ${families.reduce((n, f) => n + f[1].length, 0)} plants in ${families.length} families each went red naming the drift. It writes nothing.`);
    return 0;
}

if (DIRECT_RUN) {
    const args = process.argv.slice(2);
    process.exit(args.length === 1 && args[0] === '--self-test' ? selfTest() : main(args));
}
