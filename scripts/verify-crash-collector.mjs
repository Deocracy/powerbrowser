#!/usr/bin/env node
// scripts/verify-crash-collector.mjs
//
// The crash-collector contract gate (09-02, TEL-04): the Antenna-protocol
// surface stays pinned while the native reporter stays compiled out.
//
// WHAT IT ASSERTS. Every expectation is DERIVED at check time -- from
// scripts/crash-collector.mjs's own exports -- never kept here:
//
//  1. docs/CRASH-POLICY.md states every contract literal the code exports
//     (submit path, minidump part name, response shapes, rejection
//     vocabulary, retention window, throttle rule and budget, annotation
//     allowlist). A policy edit that drops a literal fails NAMING it: the
//     doc is the reviewable source, so drift there is the defect.
//  2. The contract builders emit their exact shapes (CrashID=, Discarded=).
//  3. --self-test exercises handleSubmit in process with byte fixtures in a
//     temp dir and no sockets: well-formed input answers the CrashID body
//     plus a matching store record, each malformed class answers its named
//     discard reason on the rejection status, over-cap input answers the
//     oversized rejection in every direction (total-body, part-count, and
//     per-part caps), an unwritable store answers the 500 reason without
//     consuming throttle budget, and a tripped throttle rule answers the
//     soft-reject body on the success status -- with the store dir proven
//     empty after every rejection, so no plant passes vacuously.
//
// Honestly --quick: node:crypto plus text/bytes in mkdtemp. No build, no
// browser, no display, no network.
//
// Usage:
//   node scripts/verify-crash-collector.mjs
//   node scripts/verify-crash-collector.mjs --self-test
//
// The self-test runs a green control first, then one plant per contract
// direction, each required to go red naming its rule.

import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import {
    ANNOTATION_ALLOWLIST,
    EXTRA_PART_NAME,
    LOOPBACK_HOST,
    MAX_ANNOTATION_BYTES,
    MAX_BODY_BYTES,
    MAX_BODY_MIB,
    MAX_PARTS,
    MAX_PART_BYTES,
    MAX_PART_MIB,
    MINIDUMP_PART_NAME,
    OTHER_PART_NAME,
    REASON_NO_MINIDUMP,
    REASON_OVERSIZED,
    REASON_STORE_UNAVAILABLE,
    REASON_WRONG_CONTENT_TYPE,
    RETENTION_DAYS,
    SUBMIT_PATH,
    THROTTLE_MAX_SUBMITS,
    THROTTLE_RULE,
    THROTTLE_WINDOW_MS,
    buildCrashIdResponse,
    buildDiscardResponse,
    checkThrottle,
    createThrottleState,
    handleSubmit,
    parseMultipart,
} from './crash-collector.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'verify-crash-collector';

const args = process.argv.slice(2);
const SELF_TEST = args.includes('--self-test');
for (const a of args) {
    if (a !== '--self-test') {
        console.error(`${NAME}: FAIL -- unknown argument '${a}'`);
        process.exit(2);
    }
}

const POLICY_REL = 'docs/CRASH-POLICY.md';

// --- assertion plumbing (the installer-schema skeleton) ----------------------
//
// Failures accumulate rather than throwing: one run should report every
// wrong literal, not just the first.
function makeReporter() {
    const failures = [];
    return {
        failures,
        fail(msg) { failures.push(msg); },
        eq(label, actual, expected, where) {
            if (actual === expected) return true;
            failures.push(
                `${label}: ${where} carries ${JSON.stringify(actual)} but must equal ` +
                `${JSON.stringify(expected)}`,
            );
            return false;
        },
    };
}

function runChecks(root) {
    const r = makeReporter();

    // --- 1. the policy states every contract literal the code exports ------
    let policy;
    try {
        policy = readFileSync(join(root, POLICY_REL), 'utf8');
    } catch {
        r.fail(`${POLICY_REL} is absent, so the enforced crash policy has no reviewable source. Next step: restore it; the collector enforces what that page states.`);
        return { failures: r.failures };
    }
    const states = (literal, what) => {
        if (!policy.includes(literal)) {
            r.fail(`${POLICY_REL} no longer states ${what} (${JSON.stringify(literal)}) but the collector enforces it -- policy drift. Next step: restore the literal in the doc (the doc wins; the code is not the place to fix this).`);
        }
    };
    states(SUBMIT_PATH, 'the submit path');
    states(MINIDUMP_PART_NAME, 'the minidump part name');
    states('CrashID=', 'the accept response shape');
    states('Discarded=', 'the rejection response shape');
    states(REASON_WRONG_CONTENT_TYPE, 'the wrong-content-type reason');
    states(REASON_NO_MINIDUMP, 'the missing-minidump reason');
    states(REASON_OVERSIZED, 'the oversized reason');
    states(REASON_STORE_UNAVAILABLE, 'the store-unavailable reason');
    states(THROTTLE_RULE, 'the throttle rule');
    states(String(RETENTION_DAYS), 'the retention window');
    states(String(THROTTLE_MAX_SUBMITS), 'the throttle budget');
    states(String(THROTTLE_WINDOW_MS / 1000), 'the throttle window seconds');
    states(String(MAX_PARTS), 'the part-count cap');
    states(`${MAX_PART_MIB} MiB`, 'the per-part size cap');
    states(`${MAX_BODY_MIB} MiB`, 'the total-body cap');
    states(String(MAX_ANNOTATION_BYTES), 'the annotation value cap');
    states(LOOPBACK_HOST, 'the loopback bind');
    for (const field of ANNOTATION_ALLOWLIST) {
        states(field, `the allowlisted annotation ${JSON.stringify(field)}`);
    }

    // --- 2. the contract surface is importable and shaped -------------------
    for (const f of ['parseMultipart', 'buildCrashIdResponse', 'buildDiscardResponse']) {
        if (f === 'parseMultipart' && typeof parseMultipart !== 'function') r.fail(`the collector no longer exports a parseMultipart function -- the contract surface moved. Next step: restore the export; this gate imports it, never a kept copy.`);
        if (f === 'buildCrashIdResponse' && typeof buildCrashIdResponse !== 'function') r.fail(`the collector no longer exports a buildCrashIdResponse function -- the contract surface moved. Next step: restore the export; this gate imports it, never a kept copy.`);
        if (f === 'buildDiscardResponse' && typeof buildDiscardResponse !== 'function') r.fail(`the collector no longer exports a buildDiscardResponse function -- the contract surface moved. Next step: restore the export; this gate imports it, never a kept copy.`);
    }
    r.eq('CrashID shape', buildCrashIdResponse('test-id'), 'CrashID=test-id', 'buildCrashIdResponse');
    r.eq('Discard shape', buildDiscardResponse('some_rule'), 'Discarded=some_rule', 'buildDiscardResponse');

    return { failures: r.failures };
}

function main() {
    const { failures } = runChecks(REPO_ROOT);
    if (failures.length > 0) {
        console.error(`${NAME}: FAIL -- ${failures.length} problem(s)`);
        for (const f of failures) console.error(`  - ${f}`);
        process.exit(1);
    }
    console.log(`${NAME}: PASS -- policy states the enforced contract and the response shapes hold`);
}

// --- --self-test ---------------------------------------------------------------

const SELFTEST_BOUNDARY = 'SELFTEST-BOUNDARY';

function buildMultipart(parts) {
    const chunks = [];
    for (const part of parts) {
        chunks.push(Buffer.from(
            `--${SELFTEST_BOUNDARY}\r\n`
            + `Content-Disposition: ${part.disposition ?? `form-data; name="${part.name}"${part.filename ? `; filename="${part.filename}"` : ''}`}\r\n`
            + `Content-Type: ${part.contentType ?? 'application/octet-stream'}\r\n\r\n`,
            'latin1',
        ));
        chunks.push(part.data);
        chunks.push(Buffer.from('\r\n', 'latin1'));
    }
    chunks.push(Buffer.from(`--${SELFTEST_BOUNDARY}--\r\n`, 'latin1'));
    return Buffer.concat(chunks);
}

const SELFTEST_CONTENT_TYPE = `multipart/form-data; boundary=${SELFTEST_BOUNDARY}`;
const NOW = 1720000000000;

// TEL-07 (57-02): Gecko's extra part shape is DERIVED from the pinned client source at check time, never
// a literal here. The same declaration ng068 reads, so the two gates cannot disagree on the wire.
const REPORT_RS = join(REPO_ROOT, 'upstream/toolkit/crashreporter/client/app/src/net/report.rs');
function geckoExtraShape() {
    const m = /name:\s*"extra",[\s\S]*?filename:\s*Some\("([^"]+)"\),\s*mime_type:\s*Some\("([^"]+)"\)/.exec(readFileSync(REPORT_RS, 'utf8'));
    if (!m) throw new Error('broken instrument: report.rs no longer declares an `extra` MimePart with filename and mime_type');
    return { filename: m[1], mime: m[2] };
}

function wellFormedBody() {
    return buildMultipart([
        { name: MINIDUMP_PART_NAME, filename: 'a1b2.dmp', data: Buffer.from('MINIDUMP-BYTES-FIXTURE') },
        { name: 'ProductName', data: Buffer.from('PowerBrowser') },
        { name: 'Version', data: Buffer.from('1.0') },
        { name: 'SecretField', data: Buffer.from('must-never-be-stored') },
    ]);
}

function selfTest() {
    const dir = mkdtempSync(join(tmpdir(), 'crash-collector-selftest-'));
    let ok = true;
    try {
        const storeOf = (plant) => join(dir, `store-${plant}`);
        const storeIsEmpty = (storeDir) => {
            try {
                return readdirSync(storeDir).length === 0;
            } catch {
                return true; // never created: nothing was written, which is the claim
            }
        };
        const expectVerdict = (label, verdict, wantStatus, wantBody, storeDir) => {
            const namesRule = verdict.body.includes(wantBody);
            if (verdict.status !== wantStatus || !namesRule) {
                console.error(`${NAME}: --self-test FAIL -- ${label} answered ${verdict.status} ${JSON.stringify(verdict.body)}, want ${wantStatus} naming ${JSON.stringify(wantBody)}`);
                ok = false;
            } else if (!storeIsEmpty(storeDir)) {
                console.error(`${NAME}: --self-test FAIL -- ${label} wrote to the store on a rejection path -- rejections must leave no record`);
                ok = false;
            } else {
                console.log(`${NAME}: --self-test -- ${label} REJECTED: ${verdict.status} ${verdict.body}`);
            }
        };

        // Control: well-formed input is GREEN -- answers CrashID plus a
        // matching store record with the allowlist enforced. Without this,
        // a red after a plant below could be fixture-shaped rather than
        // plant-caused.
        {
            const storeDir = storeOf('control');
            const verdict = handleSubmit({
                body: wellFormedBody(),
                contentType: SELFTEST_CONTENT_TYPE,
                storeDir,
                throttle: createThrottleState(),
                nowMs: NOW,
            });
            const idMatch = /^CrashID=([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/.exec(verdict.body);
            if (verdict.status !== 200 || !idMatch) {
                console.error(`${NAME}: --self-test FAIL -- the well-formed control is already red (${verdict.status} ${JSON.stringify(verdict.body)}), so a red result after a plant would prove nothing`);
                ok = false;
            } else {
                const id = idMatch[1];
                let record;
                try {
                    record = JSON.parse(readFileSync(join(storeDir, `${id}.json`), 'utf8'));
                } catch {
                    record = null;
                }
                const dump = (() => {
                    try {
                        return readFileSync(join(storeDir, `${id}.dmp`));
                    } catch {
                        return null;
                    }
                })();
                if (!record || record.id !== id) {
                    console.error(`${NAME}: --self-test FAIL -- the well-formed control left no matching store record for ${id}`);
                    ok = false;
                } else if (record.annotations.SecretField !== undefined) {
                    console.error(`${NAME}: --self-test FAIL -- the well-formed control stored the unlisted annotation SecretField -- the allowlist is not enforced`);
                    ok = false;
                } else if (record.annotations.ProductName !== 'PowerBrowser') {
                    console.error(`${NAME}: --self-test FAIL -- the well-formed control dropped the allowlisted annotation ProductName`);
                    ok = false;
                } else if (!dump || dump.toString() !== 'MINIDUMP-BYTES-FIXTURE') {
                    console.error(`${NAME}: --self-test FAIL -- the well-formed control stored wrong minidump bytes`);
                    ok = false;
                } else {
                    console.log(`${NAME}: --self-test -- the well-formed control is GREEN (${verdict.body}, record matches, allowlist holds)`);
                }
            }
        }

        // Plant 1: non-multipart content -- the wrong-content-type reason on 400.
        expectVerdict(
            'non-multipart content',
            handleSubmit({
                body: Buffer.from('{"not":"multipart"}'),
                contentType: 'application/json',
                storeDir: storeOf('content-type'),
                throttle: createThrottleState(),
                nowMs: NOW,
            }),
            400,
            REASON_WRONG_CONTENT_TYPE,
            storeOf('content-type'),
        );

        // Plant 2: multipart framing with no minidump part -- the
        // missing-minidump reason on 400.
        expectVerdict(
            'multipart with no minidump part',
            handleSubmit({
                body: buildMultipart([{ name: 'ProductName', data: Buffer.from('PowerBrowser') }]),
                contentType: SELFTEST_CONTENT_TYPE,
                storeDir: storeOf('no-minidump'),
                throttle: createThrottleState(),
                nowMs: NOW,
            }),
            400,
            REASON_NO_MINIDUMP,
            storeOf('no-minidump'),
        );

        // Plant 3: body past the total cap -- the oversized rejection on 413.
        expectVerdict(
            'over-cap body',
            handleSubmit({
                body: Buffer.concat([Buffer.alloc(MAX_BODY_BYTES + 1, 0x41)]),
                contentType: SELFTEST_CONTENT_TYPE,
                storeDir: storeOf('oversized'),
                throttle: createThrottleState(),
                nowMs: NOW,
            }),
            413,
            REASON_OVERSIZED,
            storeOf('oversized'),
        );

        // Plant 4: more parts than the count cap -- the oversized
        // rejection on 413. Proves the count cap is not the total-body
        // cap wearing a second message: this body is far under it.
        {
            const many = [{ name: MINIDUMP_PART_NAME, filename: 'a.dmp', data: Buffer.from('D') }];
            for (let i = 0; i < MAX_PARTS; i++) many.push({ name: 'ProductName', data: Buffer.from(`v${i}`) });
            expectVerdict(
                'over-count parts',
                handleSubmit({
                    body: buildMultipart(many),
                    contentType: SELFTEST_CONTENT_TYPE,
                    storeDir: storeOf('count'),
                    throttle: createThrottleState(),
                    nowMs: NOW,
                }),
                413,
                REASON_OVERSIZED,
                storeOf('count'),
            );
        }

        // Plants 4b-4e (WR-01, WR-02): a name smuggled through filename=, two minidump parts, and the
        // one-character and many-delimiter bodies. The parser must answer the named verdict for each, and
        // the record must never carry a client-chosen part name.
        expectVerdict(
            'filename before name',
            handleSubmit({
                body: buildMultipart([{ disposition: `form-data; filename="${MINIDUMP_PART_NAME}"; name="zzz"`, data: Buffer.from('D') }]),
                contentType: SELFTEST_CONTENT_TYPE,
                storeDir: storeOf('fname'),
                throttle: createThrottleState(),
                nowMs: NOW,
            }),
            400,
            REASON_NO_MINIDUMP,
            storeOf('fname'),
        );
        expectVerdict(
            'two minidump parts',
            handleSubmit({
                body: buildMultipart([
                    { name: MINIDUMP_PART_NAME, data: Buffer.from('D') },
                    { name: MINIDUMP_PART_NAME, data: Buffer.from('E') },
                ]),
                contentType: SELFTEST_CONTENT_TYPE,
                storeDir: storeOf('twodump'),
                throttle: createThrottleState(),
                nowMs: NOW,
            }),
            400,
            REASON_NO_MINIDUMP,
            storeOf('twodump'),
        );
        expectVerdict(
            'one-character boundary',
            handleSubmit({
                body: Buffer.from('\r\n--a'.repeat(100000), 'latin1'),
                contentType: 'multipart/form-data; boundary=a',
                storeDir: storeOf('onechar'),
                throttle: createThrottleState(),
                nowMs: NOW,
            }),
            400,
            REASON_WRONG_CONTENT_TYPE,
            storeOf('onechar'),
        );
        expectVerdict(
            'delimiter flood',
            handleSubmit({
                body: Buffer.from('\r\n--abc'.repeat(100000), 'latin1'),
                contentType: 'multipart/form-data; boundary=abc',
                storeDir: storeOf('flood'),
                throttle: createThrottleState(),
                nowMs: NOW,
            }),
            413,
            REASON_OVERSIZED,
            storeOf('flood'),
        );
        {
            const storeDir = storeOf('longname');
            const verdict = handleSubmit({
                body: buildMultipart([
                    { name: MINIDUMP_PART_NAME, data: Buffer.from('D') },
                    { name: 'N'.repeat(100000), data: Buffer.from('x') },
                ]),
                contentType: SELFTEST_CONTENT_TYPE,
                storeDir,
                throttle: createThrottleState(),
                nowMs: NOW,
            });
            const record = verdict.crashId ? JSON.parse(readFileSync(join(storeDir, `${verdict.crashId}.json`), 'utf8')) : null;
            if (!record || record.partNames.some(n => n !== MINIDUMP_PART_NAME && n !== OTHER_PART_NAME)) {
                console.error(`${NAME}: --self-test FAIL -- a 100 KB part name reached the stored record: ${JSON.stringify(record && record.partNames).slice(0, 120)}`);
                process.exit(1);
            }
            console.log(`${NAME}: --self-test -- a hostile part name was recorded as ${OTHER_PART_NAME}, not stored`);
        }

        // Plant 4f: a minidump whose payload ends in CRLF is stored byte for byte (the CRLF before a delimiter is the
        // delimiter's, not data).
        {
            const storeDir = storeOf('crlf');
            const sent = Buffer.concat([Buffer.from('MDMP-FIXTURE'), Buffer.from('\r\n\r\n', 'latin1')]);
            const verdict = handleSubmit({
                body: buildMultipart([{ name: MINIDUMP_PART_NAME, data: sent }]),
                contentType: SELFTEST_CONTENT_TYPE,
                storeDir,
                throttle: createThrottleState(),
                nowMs: NOW,
            });
            const stored = verdict.crashId ? readFileSync(join(storeDir, `${verdict.crashId}.dmp`)) : null;
            if (!stored || !stored.equals(sent)) {
                console.error(`${NAME}: --self-test FAIL -- a minidump whose payload ends in CRLF was not stored byte for byte (sent ${sent.length} bytes, stored ${stored ? stored.length : 'none'})`);
                process.exit(1);
            }
            console.log(`${NAME}: --self-test -- a minidump ending in CRLF was stored byte for byte`);
        }

        // Plant 5: a tripped throttle rule -- the soft-reject body on the
        // SUCCESS status. The body is well-formed (it would be accepted
        // but for the throttle), so the soft-reject proves the throttle
        // fired rather than the parser.
        {
            const storeDir = storeOf('throttle');
            const throttle = createThrottleState();
            for (let i = 0; i < THROTTLE_MAX_SUBMITS; i++) checkThrottle(throttle, NOW - 1000);
            expectVerdict(
                'tripped throttle',
                handleSubmit({
                    body: wellFormedBody(),
                    contentType: SELFTEST_CONTENT_TYPE,
                    storeDir,
                    throttle,
                    nowMs: NOW,
                }),
                200,
                THROTTLE_RULE,
                storeDir,
            );
        }

        // Plant 6: one part past the per-part cap in a body well under the
        // total cap -- the oversized rejection on 413. Proves the per-part
        // cap is not the total-body cap wearing a second message.
        expectVerdict(
            'over-size part',
            handleSubmit({
                body: buildMultipart([
                    { name: MINIDUMP_PART_NAME, filename: 'big.dmp', data: Buffer.alloc(MAX_PART_BYTES + 1, 0x42) },
                ]),
                contentType: SELFTEST_CONTENT_TYPE,
                storeDir: storeOf('part-size'),
                throttle: createThrottleState(),
                nowMs: NOW,
            }),
            413,
            REASON_OVERSIZED,
            storeOf('part-size'),
        );

        // Plant 7: a store dir that cannot be created -- the
        // store-unavailable reason on 500. A path under a regular file
        // makes mkdirSync throw ENOTDIR. The failed writes must consume no
        // throttle budget (only accepted submits count): after a full
        // budget's worth of failed submits the same throttle state still
        // accepts a well-formed one.
        {
            const blocker = join(dir, 'store-blocker');
            writeFileSync(blocker, 'not-a-directory');
            const unwritable = join(blocker, 'store');
            const throttle = createThrottleState();
            expectVerdict(
                'unwritable store',
                handleSubmit({
                    body: wellFormedBody(),
                    contentType: SELFTEST_CONTENT_TYPE,
                    storeDir: unwritable,
                    throttle,
                    nowMs: NOW,
                }),
                500,
                REASON_STORE_UNAVAILABLE,
                unwritable,
            );
            for (let i = 1; i < THROTTLE_MAX_SUBMITS; i++) {
                handleSubmit({
                    body: wellFormedBody(),
                    contentType: SELFTEST_CONTENT_TYPE,
                    storeDir: unwritable,
                    throttle,
                    nowMs: NOW,
                });
            }
            const retry = handleSubmit({
                body: wellFormedBody(),
                contentType: SELFTEST_CONTENT_TYPE,
                storeDir: storeOf('store-retry'),
                throttle,
                nowMs: NOW,
            });
            if (retry.status !== 200 || !retry.body.startsWith('CrashID=')) {
                console.error(`${NAME}: --self-test FAIL -- ${THROTTLE_MAX_SUBMITS} failed store writes consumed throttle budget: the retry answered ${retry.status} ${JSON.stringify(retry.body)}, want 200 CrashID=`);
                ok = false;
            } else {
                console.log(`${NAME}: --self-test -- failed store writes consumed no throttle budget (retry accepted)`);
            }
        }

        // Plant 8: a deeply nested allowlisted value in Gecko's extra part.
        // JSON.parse accepts this depth; JSON.stringify overflows the stack on
        // it. Allowlisted fields are scalars, so the report must be stored with
        // the nested field dropped -- never lost as a 500. ProductName rides
        // the same part, so a collector that ignored the extra part entirely
        // would not pass.
        {
            const storeDir = storeOf('nested-extra');
            const depth = 100_000;
            const extra = `{"ProductName":"PowerBrowser","Version":${'['.repeat(depth)}${']'.repeat(depth)}}`;
            let verdict;
            try {
                verdict = handleSubmit({
                    body: buildMultipart([
                        { name: MINIDUMP_PART_NAME, filename: 'n.dmp', data: Buffer.from('D') },
                        { name: EXTRA_PART_NAME, filename: 'extra.json', contentType: 'application/json', data: Buffer.from(extra) },
                    ]),
                    contentType: SELFTEST_CONTENT_TYPE,
                    storeDir,
                    throttle: createThrottleState(),
                    nowMs: NOW,
                });
            } catch (err) {
                verdict = { status: 'threw', body: String(err && err.message ? err.message : err) };
            }
            const id = /^CrashID=(.+)$/.exec(verdict.body)?.[1];
            let record = null;
            try {
                record = id ? JSON.parse(readFileSync(join(storeDir, `${id}.json`), 'utf8')) : null;
            } catch {
                record = null;
            }
            if (verdict.status !== 200 || !record) {
                console.error(`${NAME}: --self-test FAIL -- a deeply nested extra value lost the report: answered ${verdict.status} ${JSON.stringify(verdict.body)}, want 200 CrashID= with a stored record`);
                ok = false;
            } else if (record.annotations.Version !== undefined) {
                console.error(`${NAME}: --self-test FAIL -- a nested (non-scalar) extra value was stored as Version -- allowlisted fields are scalars`);
                ok = false;
            } else if (record.annotations.ProductName !== 'PowerBrowser') {
                console.error(`${NAME}: --self-test FAIL -- the extra part's scalar ProductName was not stored alongside the dropped nested field`);
                ok = false;
            } else {
                console.log(`${NAME}: --self-test -- a deeply nested extra value was dropped and the report kept (${verdict.body})`);
            }
        }

        // Plant 9 (TEL-07, 57-02): a Gecko-shaped extra part, its filename and MIME derived from report.rs.
        // Allowlisted scalars are stored; a non-allowlisted key, an oversized allowlisted value and a
        // non-scalar allowlisted value are each dropped -- one named rule per field, so a regression in
        // any one of them goes red naming that rule.
        {
            const storeDir = storeOf('gecko-extra-mixed');
            const shape = geckoExtraShape();
            const extra = JSON.stringify({
                ProductName: 'PowerBrowser',
                Version: '1.6.0',
                BuildID: '20261031000000',
                OS: 'Linux',
                CPUArchitecture: 'amd64',
                ReleaseChannel: 'release',
                CrashTime: { unix: 1761900000 },
                NotAllowlisted: 'dropped',
                StartupTime: 'x'.repeat(MAX_ANNOTATION_BYTES + 1),
                Nested: { a: 1 },
            });
            const verdict = handleSubmit({
                body: buildMultipart([
                    { name: MINIDUMP_PART_NAME, filename: 'g.dmp', data: Buffer.from('D') },
                    { name: EXTRA_PART_NAME, filename: shape.filename, contentType: shape.mime, data: Buffer.from(extra) },
                ]),
                contentType: SELFTEST_CONTENT_TYPE,
                storeDir,
                throttle: createThrottleState(),
                nowMs: NOW,
            });
            const id = /^CrashID=(.+)$/.exec(verdict.body)?.[1];
            const record = id ? JSON.parse(readFileSync(join(storeDir, `${id}.json`), 'utf8')) : null;
            const stored = record ? Object.keys(record.annotations).sort() : [];
            // Non-allowlisted (NotAllowlisted, Nested), oversized (StartupTime) and non-scalar (CrashTime) keys are dropped.
            const wantStored = ['BuildID', 'CPUArchitecture', 'OS', 'ProductName', 'ReleaseChannel', 'Version'];
            if (verdict.status !== 200 || !record) {
                console.error(`${NAME}: --self-test FAIL -- a Gecko-shaped extra part (${shape.filename}, ${shape.mime}) lost the report: answered ${verdict.status}, want 200 CrashID= with a stored record`);
                ok = false;
            } else if (JSON.stringify(stored) !== JSON.stringify(wantStored)) {
                console.error(`${NAME}: --self-test FAIL -- the Gecko-shaped extra stored ${JSON.stringify(stored)}, want exactly the allowlisted scalars ${JSON.stringify(wantStored)} (non-allowlisted, oversized and non-scalar keys must be dropped)`);
                ok = false;
            } else {
                console.log(`${NAME}: --self-test -- a Gecko-shaped extra stored the allowlisted scalars and dropped the non-allowlisted, oversized and non-scalar keys`);
            }
        }

        // Plant 10 (TEL-07, 57-02): a malformed extra part. Its annotations are dropped with nothing stored,
        // and the report is kept: the minidump bytes land and the record carries no annotation from the part.
        {
            const storeDir = storeOf('gecko-extra-malformed');
            const shape = geckoExtraShape();
            const verdict = handleSubmit({
                body: buildMultipart([
                    { name: MINIDUMP_PART_NAME, filename: 'm.dmp', data: Buffer.from('D') },
                    { name: EXTRA_PART_NAME, filename: shape.filename, contentType: shape.mime, data: Buffer.from('{"ProductName":"PowerBrowser",') },
                ]),
                contentType: SELFTEST_CONTENT_TYPE,
                storeDir,
                throttle: createThrottleState(),
                nowMs: NOW,
            });
            const id = /^CrashID=(.+)$/.exec(verdict.body)?.[1];
            const record = id ? JSON.parse(readFileSync(join(storeDir, `${id}.json`), 'utf8')) : null;
            if (verdict.status !== 200 || !record) {
                console.error(`${NAME}: --self-test FAIL -- a malformed extra part cost the whole report: answered ${verdict.status}, want 200 CrashID= with the minidump stored`);
                ok = false;
            } else if (Object.keys(record.annotations).length !== 0) {
                console.error(`${NAME}: --self-test FAIL -- a malformed extra part stored annotations ${JSON.stringify(record.annotations)}, want none`);
                ok = false;
            } else if (record.minidumpBytes !== 1) {
                console.error(`${NAME}: --self-test FAIL -- the minidump was not kept beside a malformed extra part (minidumpBytes ${record.minidumpBytes}, want 1)`);
                ok = false;
            } else {
                console.log(`${NAME}: --self-test -- a malformed Gecko-shaped extra part stored nothing and the report was kept`);
            }
        }
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }

    if (!ok) {
        console.error(`${NAME}: --self-test FAIL`);
        process.exit(1);
    }
    console.log(`${NAME}: --self-test PASS -- control green first, then all planted faults behaved as pinned`);
    process.exit(0);
}

if (SELF_TEST) selfTest();
else if (args.length === 0) main();
