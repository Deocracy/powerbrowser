#!/usr/bin/env node
// scripts/verify-mar-channel-gate.mjs
//
// The mar-channel-gate row (Phase 49, SEC-07). It checks that the sign-publish job of
// .github/workflows/release.yml refuses a MAR whose product-info channel is not the accepted
// MAR channel id, before any signing, and that it signs and then verifies against the tracked
// DER before any upload.
//
// It derives, at check time:
//  1. the MAR channel id and the update channel from updateChannel() in scripts/generate.mjs
//     (the UPDATE_CHANNEL constant and <app_basename>-<channel>);
//  2. the emitted comparands in powerbrowser/packaging/mozconfig.release, which must carry
//     --enable-update-channel=<channel> and ACCEPTED_MAR_CHANNEL_IDS=<marChannelId>, so the
//     emission and the derivation agree (the fixture-read shape of verify-release-identity).
// It then asserts over the sign-publish steps, found by id:
//  gate        mar_channel_gate compares the MAR product-info channel with
//              ACCEPTED_MAR_CHANNEL_IDS read from the emission, exits 1 inside the mismatch branch,
//              and cross-checks the `--channel` value against MOZ_UPDATE_CHANNEL, naming both.
//  fail-open   the gate, sign and verify steps carry no continue-on-error, no `|| true`, no
//              `set +e`, no if:, and run the signmar built from the pinned source.
//  conflation  the gate never compares the MAR channel with the update channel (--channel).
//  order       mar_channel_gate runs before sign_mar, and sign_mar before verify_mar.
//  der         verify_mar verifies with signmar -v and then with scripts/verify-mar-signature.mjs
//              (node:crypto, independent of signmar) against powerbrowser/packaging/mar/mar-primary.der,
//              the tracked certificate, and that file exists in the tree.
//
// Honestly --quick: reads the tree (release.yml, mozconfig.release, configuration.toml, the DER)
// and parses YAML (js-yaml from theia/). Its self-test plants each fault in memory and writes
// nothing. The live product-info read runs in the workflow at release time, never in this row,
// and this row reads no signing material.

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveConfig, updateChannel } from './generate.mjs';
import { failOpenFaults, ifBody, loadYaml, stepsOf } from './lib/release-workflow.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'mar-channel-gate';
const SELF_REL = 'scripts/verify-mar-channel-gate.mjs';
const RELEASE_REL = '.github/workflows/release.yml';
const MOZCONFIG_REL = 'powerbrowser/packaging/mozconfig.release';
const DER_REL = 'powerbrowser/packaging/mar/mar-primary.der';

const args = process.argv.slice(2);
for (const a of args) {
    if (a !== '--self-test') {
        console.error(`${NAME}: FAIL -- unknown argument '${a}'`);
        console.error(`  Next step: run: node ${SELF_REL}, or add --self-test to prove the gate discriminates.`);
        process.exit(2);
    }
}

let yaml;
try {
    yaml = loadYaml();
} catch {
    console.error(`${NAME}: FAIL -- broken instrument: js-yaml is not installed in theia/. Next step: run yarn install in theia/ first.`);
    process.exit(1);
}

function readText(root, rel) {
    try {
        return readFileSync(join(root, rel), 'utf8');
    } catch {
        return null;
    }
}

const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Splits the sign-publish steps by id; a missing step is reported by the caller.
function signPublishSteps(wf) {
    return stepsOf(wf?.jobs?.['sign-publish']);
}

function runChecks(root, overrides = {}) {
    const failures = [];
    const fail = (rule, msg, file = RELEASE_REL) => failures.push({ file, job: 'sign-publish', rule, msg });
    const read = overrides.read ?? (rel => readText(root, rel));

    // 1. The derivation, and the emitted comparands it must match.
    const { config, failures: configFailures } = resolveConfig(join(root, 'configuration.toml'));
    if (configFailures.length > 0) {
        fail('emission', `configuration.toml does not resolve (${configFailures[0]}). Next step: fix the manifest.`, 'configuration.toml');
        return { failures };
    }
    const { channel, marChannelId } = updateChannel(config);
    const moz = read(MOZCONFIG_REL);
    if (moz === null) {
        fail('emission', `${MOZCONFIG_REL} could not be read. Next step: run node scripts/generate.mjs.`, MOZCONFIG_REL);
    } else {
        if (!new RegExp(`^ac_add_options --enable-update-channel=${escapeRe(channel)}$`, 'm').test(moz)) {
            fail('emission', `${MOZCONFIG_REL} does not carry --enable-update-channel=${channel}, the update channel the derivation names. Next step: run node scripts/generate.mjs.`, MOZCONFIG_REL);
        }
        if (!new RegExp(`^ac_add_options ACCEPTED_MAR_CHANNEL_IDS=${escapeRe(marChannelId)}$`, 'm').test(moz)) {
            fail('emission', `${MOZCONFIG_REL} does not carry ACCEPTED_MAR_CHANNEL_IDS=${marChannelId}, the MAR channel id the derivation names. Next step: run node scripts/generate.mjs.`, MOZCONFIG_REL);
        }
    }

    // 2. The workflow text, parsed.
    const text = overrides.text ?? read(RELEASE_REL);
    if (text === null || text === undefined) {
        fail('parse', `${RELEASE_REL} could not be read. Next step: restore the release workflow.`);
        return { failures };
    }
    let wf;
    try {
        wf = yaml.load(text);
    } catch (e) {
        fail('parse', `does not parse as YAML 1.2 (${e.message.split('\n')[0]}). Next step: fix the file.`);
        return { failures };
    }
    const steps = signPublishSteps(wf);
    const at = id => steps.findIndex(s => s.id === id);
    const gateAt = at('mar_channel_gate');
    const signAt = at('sign_mar');
    const verifyAt = at('verify_mar');
    for (const [id, i] of [['mar_channel_gate', gateAt], ['sign_mar', signAt], ['verify_mar', verifyAt]]) {
        if (i < 0) fail('gate', `sign-publish has no step with id ${id}. Next step: restore the step, so the channel gate, the signing and the verification are all present.`);
    }
    if (gateAt < 0 || signAt < 0 || verifyAt < 0) return { failures };

    const gate = String(steps[gateAt].run ?? '');
    const sign = String(steps[signAt].run ?? '');
    const verify = String(steps[verifyAt].run ?? '');

    // gate: the accepted MAR id, read from the emission, refuses a mismatch with the mismatch branch's own exit 1.
    if (!/ACCEPTED_MAR_CHANNEL_IDS/.test(gate) || !/mozconfig\.release/.test(gate)) {
        fail('gate', `mar_channel_gate does not read ACCEPTED_MAR_CHANNEL_IDS from ${MOZCONFIG_REL}, so the accepted MAR channel is not derived from the emission.`);
    }
    const mismatch = ifBody(gate, /if \[ -z "\$ACCEPTED" \] \|\| \[ "\$MAR_CHANNEL" != "\$ACCEPTED" \]/);
    if (mismatch === null || !/\bexit 1\b/.test(mismatch)) {
        fail('gate', `mar_channel_gate does not refuse a MAR whose product-info channel differs from ACCEPTED_MAR_CHANNEL_IDS with an exit 1 inside the mismatch branch; a foreign-channel MAR would be signed. Next step: compare the product-info channel with ACCEPTED_MAR_CHANNEL_IDS and exit 1 in that branch.`);
    }
    const crossCheck = ifBody(gate, /if \[ "\$UPDATE_CHANNEL_MANIFEST" != "\$UPDATE_CHANNEL_MOZCONFIG" \]/);
    if (!/--enable-update-channel=/.test(gate) || !/MOZ_UPDATE_CHANNEL/.test(gate) || !/--channel/.test(gate) || crossCheck === null || !/\bexit 1\b/.test(crossCheck)) {
        fail('gate', `mar_channel_gate does not cross-check the \`--channel\` value against MOZ_UPDATE_CHANNEL with an exit 1, naming both on a mismatch. Next step: compare the manifest update channel with the mozconfig MOZ_UPDATE_CHANNEL.`);
    }
    // fail-open: no continue-on-error, no `|| true`, no `set +e`, no if: on the gate, sign or verify step.
    for (const [id, i] of [['mar_channel_gate', gateAt], ['sign_mar', signAt], ['verify_mar', verifyAt]]) {
        for (const f of failOpenFaults(steps[i])) fail('gate', `${id} step ${f}, so the ${id === 'verify_mar' ? 'verification' : id === 'sign_mar' ? 'signing' : 'channel gate'} can pass without doing its work. Next step: remove it.`);
    }
    // the signer is the one built from the pinned source, never a runner-supplied binary.
    for (const [id, i] of [['mar_channel_gate', gateAt], ['sign_mar', signAt], ['verify_mar', verifyAt]]) {
        if (steps[i].env?.SIGNMAR !== '${{ steps.signmar.outputs.path }}' || /signing-tools|LD_LIBRARY_PATH/.test(String(steps[i].run ?? ''))) {
            fail('sign', `${id} does not run the signmar built by the signmar step (env SIGNMAR from steps.signmar.outputs.path), or references signing-tools or LD_LIBRARY_PATH. Next step: use the signmar built from the pinned source.`);
        }
    }

    // conflation: the MAR channel is never compared with the update channel named by --channel.
    if (/\$MAR_CHANNEL"?\s*!=\s*"?\$(UPDATE|\{?UPDATE)/.test(gate)) {
        fail('conflation', `mar_channel_gate compares the MAR product-info channel with the \`--channel\` update value. The MAR channel id is ACCEPTED_MAR_CHANNEL_IDS, never \`--channel\`. Next step: compare with ACCEPTED_MAR_CHANNEL_IDS.`);
    }

    // order: gate, then sign, then verify.
    if (!(gateAt < signAt)) {
        fail('order', `mar_channel_gate runs after sign_mar, so a foreign-channel MAR is signed before the gate refuses it. Next step: move the gate before the signing step.`);
    }
    if (!(signAt < verifyAt)) {
        fail('order', `verify_mar runs before sign_mar, so the MAR is verified before it is signed; a sign-before-verify order is refused. Next step: move verify_mar after sign_mar.`);
    }

    // der: sign, then verify against the tracked certificate, twice (signmar, then node:crypto).
    if (!/SIGNMAR/.test(sign) || !/\s-s\s/.test(sign)) {
        fail('sign', `sign_mar does not sign with signmar -s. Next step: sign the complete MAR with signmar -s.`);
    }
    if (!/SIGNMAR/.test(verify) || !/\s-v\s/.test(verify)) {
        fail('der', `verify_mar does not verify with signmar -v. Next step: verify the signed MAR with signmar -v.`);
    }
    if (!new RegExp(`certutil -A [^\\n]*-i ${escapeRe(DER_REL)}`).test(verify)) {
        fail('der', `verify_mar does not import ${DER_REL}, the tracked certificate, into the verification database. Next step: point the verification at ${DER_REL}.`);
    }
    if (!new RegExp(`node scripts/verify-mar-signature\\.mjs "\\$SIGNED" ${escapeRe(DER_REL)}`).test(verify)) {
        fail('der', `verify_mar does not run the independent node:crypto check (scripts/verify-mar-signature.mjs) against ${DER_REL}, so only the signer's own tool vouches for the signature. Next step: restore the second verifier.`);
    }
    if (read(DER_REL) === null) {
        fail('der', `${DER_REL} is not in the tree, so there is no tracked comparand. Next step: restore the tracked DER.`, DER_REL);
    }

    failures.sort((a, b) => (a.rule < b.rule ? -1 : a.rule > b.rule ? 1 : a.msg < b.msg ? -1 : 1));
    return { failures, channel, marChannelId };
}

const fmt = f => `${f.file} job ${f.job} [${f.rule}]: ${f.msg}`;

function main() {
    if (args.includes('--self-test')) return selfTest();
    const { failures, channel, marChannelId } = runChecks(REPO_ROOT);
    if (failures.length > 0) {
        console.error(`${NAME}: FAIL -- ${failures.length} problem(s) with the MAR channel gate and the sign-verify order.`);
        failures.forEach(f => console.error(`  ${fmt(f)}`));
        return 1;
    }
    console.log(`${NAME}: PASS -- sign-publish refuses a MAR whose product-info channel is not ACCEPTED_MAR_CHANNEL_IDS '${marChannelId}' (update channel '${channel}') before signmar -s; signmar -v verifies against ${DER_REL} before any upload.`);
    return 0;
}

// Swaps two steps of the workflow text by line range: a step runs from its `      - ` line to the
// next step or the next job-level key, so the job below sign-publish is never moved.
function swapSteps(text, idA, idB) {
    const lines = text.split('\n');
    const blockOf = id => {
        const at = lines.findIndex(l => l === `        id: ${id}`);
        if (at < 0) throw new Error(`self-test anchor ${id} is absent from ${RELEASE_REL}`);
        let start = at;
        while (start > 0 && !/^ {6}- /.test(lines[start])) start -= 1;
        let end = at + 1;
        while (end < lines.length && !/^( {6}- |\s{0,5}\S)/.test(lines[end])) end += 1;
        return [start, end];
    };
    const [a1, a2] = blockOf(idA);
    const [b1, b2] = blockOf(idB);
    const [[f1, f2], [s1, s2]] = a1 < b1 ? [[a1, a2], [b1, b2]] : [[b1, b2], [a1, a2]];
    return [...lines.slice(0, f1), ...lines.slice(s1, s2), ...lines.slice(f2, s1), ...lines.slice(f1, f2), ...lines.slice(s2)].join('\n');
}

function selfTest() {
    const real = readText(REPO_ROOT, RELEASE_REL);
    if (real === null) {
        console.error(`${NAME}: --self-test FAIL -- ${RELEASE_REL} could not be read. Next step: restore the release workflow.`);
        return 1;
    }
    const baseline = runChecks(REPO_ROOT, { text: real });
    if (baseline.failures.length > 0) {
        console.error(`${NAME}: --self-test FAIL -- the unmodified tree is already red, so the planted-fault results below would mean nothing:`);
        baseline.failures.forEach(f => console.error(`  ${fmt(f)}`));
        return 1;
    }
    console.log(`  ok  baseline -> green`);

    const edit = (from, to) => {
        if (!real.includes(from)) throw new Error(`self-test anchor '${from}' is absent from ${RELEASE_REL}`);
        return real.replace(from, to);
    };
    const plants = [
        // A foreign-channel MAR is accepted: the mismatch refusal is removed.
        ['foreign-channel MAR accepted (mismatch refusal removed)', edit('[ "$MAR_CHANNEL" != "$ACCEPTED" ]', 'false'), 'ACCEPTED_MAR_CHANNEL_IDS'],
        // The gate conflates the MAR id with --channel (the update channel).
        ['gate compares the MAR channel with --channel', edit('[ "$MAR_CHANNEL" != "$ACCEPTED" ]', '[ "$MAR_CHANNEL" != "$UPDATE_CHANNEL_MANIFEST" ]'), '--channel'],
        // The verification runs against a key other than the tracked DER.
        ['signmar -v against a non-tracked DER', edit(`-i ${DER_REL}`, '-i scratch/other.der'), 'mar-primary.der'],
        // The independent second verifier is dropped.
        ['independent node:crypto verification removed', edit('node scripts/verify-mar-signature.mjs "$SIGNED" ' + DER_REL, 'true'), 'independent node:crypto check'],
        // The mismatch branch loses its own exit 1 (the cross-check's exit 1 elsewhere must not satisfy the row).
        ['channel mismatch no longer exits', edit('is not ACCEPTED_MAR_CHANNEL_IDS \'$ACCEPTED\' (MAR_CHANNEL_MISMATCH_ERROR); nothing is signed" >&2\n            exit 1', 'is not ACCEPTED_MAR_CHANNEL_IDS \'$ACCEPTED\' (MAR_CHANNEL_MISMATCH_ERROR); nothing is signed" >&2'), 'mismatch branch'],
        ['update-channel cross-check no longer exits', edit('disagrees with MOZ_UPDATE_CHANNEL $UPDATE_CHANNEL_MOZCONFIG; nothing is signed" >&2\n            exit 1', 'disagrees with MOZ_UPDATE_CHANNEL $UPDATE_CHANNEL_MOZCONFIG; nothing is signed" >&2'), 'cross-check'],
        ['continue-on-error on the channel gate', edit('        id: mar_channel_gate\n', '        id: mar_channel_gate\n        continue-on-error: true\n'), 'continue-on-error'],
        ['|| true after signmar -v', edit('-v "$SIGNED"\n', '-v "$SIGNED" || true\n'), '|| true'],
        ['if: always() on the sign step', edit('        id: sign_mar\n', "        id: sign_mar\n        if: always()\n"), 'if:'],
        ['signer taken from the runner artifact', edit('SIGNMAR: ${{ steps.signmar.outputs.path }}', 'SIGNMAR: signing-tools/signmar'), 'pinned source'],
        // Signing and verification swapped: the MAR is verified before it is signed.
        ['sign-before-verify swap', swapSteps(real, 'sign_mar', 'verify_mar'), 'verify_mar runs before sign_mar'],
    ];

    let failed = 0;
    for (const [name, text, value] of plants) {
        const { failures } = runChecks(REPO_ROOT, { text });
        const hit = failures.some(f => f.file === RELEASE_REL && f.msg.includes(value));
        if (hit) {
            console.log(`  ok  ${name} -> red, naming ${RELEASE_REL} and '${value}'`);
        } else {
            console.error(`${NAME}: --self-test FAIL -- '${name}' did not go red naming ${RELEASE_REL} and '${value}'; got: ${failures.map(fmt).join(' | ') || '(no failures at all)'}`);
            failed += 1;
        }
    }
    if (failed > 0) return 1;
    console.log(`${NAME}: --self-test PASS -- the unmodified sign-publish is green and ${plants.length} planted faults each went red naming the file and the fault. It writes nothing.`);
    return 0;
}

process.exit(main());
