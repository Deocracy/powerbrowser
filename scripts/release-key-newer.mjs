#!/usr/bin/env node
// scripts/release-key-newer.mjs <release-key> <latest-release-tag>
//
// The one comparator behind the key>tag gate (build-linux) and the stale-approval guard
// (sign-publish) in .github/workflows/release.yml (review WR-09). Exit codes:
//   0  the key is strictly newer than the tag: build / sign
//   1  the key is equal or older: nothing to release
//   2  either value is not a release key v<esr groups>-<revision>: an error, never "not newer"
// The ESR groups compare numerically with a missing group as 0 (v153.5 < v153.5.1), then the
// revision. `--self-test` plants the boundary inputs and writes nothing.

const KEY = /^v(\d+(?:\.\d+)*)-(\d+)$/;

export function parseKey(s) {
    const m = KEY.exec(s);
    return m === null ? null : { esr: m[1].split('.').map(Number), rev: Number(m[2]) };
}

// -1, 0 or 1; throws on a value outside the release-key grammar.
export function compareKeys(a, b) {
    const [x, y] = [parseKey(a), parseKey(b)];
    if (x === null || y === null) throw new Error(`'${x === null ? a : b}' is not a release key (v<esr>-<revision>)`);
    for (let i = 0; i < Math.max(x.esr.length, y.esr.length); i += 1) {
        const [p, q] = [x.esr[i] ?? 0, y.esr[i] ?? 0];
        if (p !== q) return p > q ? 1 : -1;
    }
    return x.rev === y.rev ? 0 : x.rev > y.rev ? 1 : -1;
}

function selfTest() {
    const cases = [
        ['v153.5.1-2', 'v153.5.1-1', 0], ['v153.5.1-1', 'v153.5.1-1', 1], ['v153.5.1-1', 'v153.5.1-2', 1],
        ['v153.6-1', 'v153.5.1-9', 0], ['v153.5-1', 'v153.5.1-1', 1], ['v153.5.1-1', 'v153.5-9', 0],
        ['v154.0-1', 'v153.9.9-99', 0], ['v153.5.1-10', 'v153.5.1-9', 0],
        ['v153.5.1-2', 'v153.5.1-rc1', 2], ['v153.5.1-2', 'latest', 2], ['v153.5.1', 'v153.5.1-1', 2], ['', 'v1-1', 2],
    ];
    let failed = 0;
    for (const [key, tag, want] of cases) {
        let got;
        try { got = compareKeys(key, tag) > 0 ? 0 : 1; } catch { got = 2; }
        if (got !== want) { console.error(`  BAD ${key} vs ${tag}: exit ${got}, wanted ${want}`); failed += 1; }
    }
    if (failed > 0) { console.error('release-key-newer: --self-test FAIL'); return 1; }
    console.log(`release-key-newer: --self-test PASS -- ${cases.length} cases (newer, equal, older, longer, shorter, non-numeric) give the wanted exit code.`);
    return 0;
}

const argv = process.argv.slice(2);
if (argv[0] === '--self-test') process.exit(selfTest());
if (argv.length !== 2) { console.error('usage: release-key-newer.mjs <release-key> <latest-release-tag>'); process.exit(2); }
try {
    process.exit(compareKeys(argv[0], argv[1]) > 0 ? 0 : 1);
} catch (e) {
    console.error(`::error::release-key-newer: ${e.message}`);
    process.exit(2);
}
