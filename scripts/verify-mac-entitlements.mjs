#!/usr/bin/env node
// scripts/verify-mac-entitlements.mjs
//
// The macOS entitlement gate (Phase 55, PKG-24). The entitlement plists are
// what macOS binds to the signed bundle's identity: a Mozilla Team ID or a
// Mozilla bundle identifier in them is a Mozilla identity on a PowerBrowser
// signature, and a restricted key is a claim the Apple account must grant.
// The gate reads the signing inputs back from the tree and fails on either.
//
//  1. Derivation. Read the hardened-sign-config block of
//     upstream/taskcluster/config.yml and collect every entitlement file each
//     signing group names (production, default). The group-to-directory
//     mapping is the one entitlement_repo_path uses in
//     upstream/tools/signing/macos/mach_commands.py: production maps to
//     security/mac/hardenedruntime/production/, default maps to
//     security/mac/hardenedruntime/developer/. No file list is kept by hand.
//  2. Set equality, both ways. The .xml files present in those two
//     directories (observed) must equal the files the config names (derived).
//     An added file and a removed file each go red, naming the file.
//  3. Content. Strip XML comments, then collect every <key> and every <string>
//     in each file. Fail on a forbidden substring (43AQ936H96 or org.mozilla)
//     in any key or string, and on a restricted key (the pair
//     strip_restricted_entitlements removes, mach_commands.py:732-738).
//  4. Known-open exclusions (the D-127 model, as in verify-platform.sh). The
//     three upstream production files carry Mozilla's identifiers and the two
//     restricted keys on the unmodified tree. The cure is a hook-only Team-ID
//     patch, which needs the owner's Apple Team ID. Until that patch lands, the
//     exact ten hits in KNOWN_OPEN_HITS are excluded, and only while
//     .planning/WINDOWS.md entry KNOWN_OPEN_WINDOWS_ID is status "open". The
//     observed hit set must equal the excluded set: a new hit is red, and an
//     excluded hit that no longer exists is red (the exclusion went stale).
//     A closed entry excludes nothing, so every hit goes red.
//  5. Vacuity. Zero derived files, or zero observed files, is a FAIL: an
//     agreement over nothing proves nothing.
//
// Quick tier: text reads and XML parsing only. No build, no browser, no
// display, no network. The Team-ID patch, once it exists, changes the upstream
// plists it patches, so this gate reads the patched tree and needs no second
// input. Under .planning/ the gate reads one file, WINDOWS.md, for the status of
// entry 22 only. Its prose is never scanned, so no .planning/ text is a signing
// input.
//
// This script and its --self-test only read the tree; every plant is applied
// in memory through runChecks' overrides.

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'mac-entitlements';
const SELF_REL = 'scripts/verify-mac-entitlements.mjs';

const args = process.argv.slice(2);
for (const a of args) {
    if (a !== '--self-test') {
        console.error(`${NAME}: FAIL -- unknown argument '${a}'`);
        console.error(`  Next step: run: node ${SELF_REL}, or add --self-test to prove the gate discriminates.`);
        process.exit(2);
    }
}

const SIGN_CONFIG_REL = 'upstream/taskcluster/config.yml';
const HARDENED_REL = 'upstream/security/mac/hardenedruntime';
const WINDOWS_REL = '.planning/WINDOWS.md';
const FORBIDDEN_SUBSTRINGS = Object.freeze(['43AQ936H96', 'org.mozilla']);
const RESTRICTED_KEYS = Object.freeze([
    'com.apple.developer.web-browser.public-key-credential',
    'com.apple.application-identifier',
]);
// Signing group (hardened-sign-config key) to its repo directory.
const GROUP_DIRS = Object.freeze({ production: 'production', default: 'developer' });

// The known-open defect this gate excludes. Keyed on the broken-windows entry,
// never on a bare assertion: the exclusion stops applying when the entry is no
// longer open.
const KNOWN_OPEN_WINDOWS_ID = 22;
const PROD = `${HARDENED_REL}/production`;
// Each hit is `<file>|<kind>|<value>`; kind is forbidden (substring in a key or
// string) or restricted (a restricted key).
const KNOWN_OPEN_HITS = Object.freeze([
    `${PROD}/firefox.browser.xml|forbidden|43AQ936H96.org.mozilla.firefox`,
    `${PROD}/firefox.browser.xml|restricted|com.apple.application-identifier`,
    `${PROD}/firefox.browser.xml|restricted|com.apple.developer.web-browser.public-key-credential`,
    `${PROD}/firefoxdeveloperedition.browser.xml|forbidden|43AQ936H96.org.mozilla.firefoxdeveloperedition`,
    `${PROD}/firefoxdeveloperedition.browser.xml|restricted|com.apple.application-identifier`,
    `${PROD}/firefoxdeveloperedition.browser.xml|restricted|com.apple.developer.web-browser.public-key-credential`,
    `${PROD}/nightly.browser.xml|forbidden|43AQ936H96.org.mozilla.nightly`,
    `${PROD}/nightly.browser.xml|forbidden|43AQ936H96.org.mozilla.firefox.browserprofiles`,
    `${PROD}/nightly.browser.xml|restricted|com.apple.application-identifier`,
    `${PROD}/nightly.browser.xml|restricted|com.apple.developer.web-browser.public-key-credential`,
]);

function readText(root, rel) {
    try {
        return readFileSync(join(root, rel), 'utf8');
    } catch {
        return null;
    }
}

function listXml(root, rel) {
    try {
        return readdirSync(join(root, rel)).filter(n => n.endsWith('.xml')).sort();
    } catch {
        return null;
    }
}

// The status of one broken-windows entry, read from the fenced JSON block of the WINDOWS.md text. The
// caller reads the text through the injectable reader. null (unreadable, unknown id) is treated as
// not open: fail closed.
function windowsStatus(text, id) {
    const m = text?.match(/````json\n([\s\S]*?)\n````/);
    if (!m) return null;
    let entries;
    try {
        entries = JSON.parse(m[1]);
    } catch {
        return null;
    }
    const entry = Array.isArray(entries) ? entries.find(e => e.id === id) : undefined;
    return typeof entry?.status === 'string' ? entry.status : null;
}

function indentOf(line) {
    return line.length - line.trimStart().length;
}

// The entitlement file names each signing group names, read from the
// hardened-sign-config block by indentation. Returns null when the block or
// its groups cannot be found.
function signingGroups(text) {
    const lines = text.split('\n');
    const start = lines.findIndex(l => /^\s*hardened-sign-config:\s*$/.test(l));
    if (start < 0) return null;
    const baseIndent = indentOf(lines[start]);
    let end = lines.length;
    for (let i = start + 1; i < lines.length; i++) {
        if (lines[i].trim() !== '' && indentOf(lines[i]) <= baseIndent) {
            end = i;
            break;
        }
    }
    const block = lines.slice(start + 1, end);
    const typeIdx = block.findIndex(l => /^\s*by-hardened-signing-type:\s*$/.test(l));
    if (typeIdx < 0) return null;
    const typeIndent = indentOf(block[typeIdx]);
    const body = block.slice(typeIdx + 1);
    const first = body.find(l => l.trim() !== '' && !l.trim().startsWith('#'));
    if (first === undefined || indentOf(first) <= typeIndent) return null;
    const groupIndent = indentOf(first);
    const groups = {};
    let current = null;
    for (const line of body) {
        if (line.trim() === '' || line.trim().startsWith('#')) continue;
        const ind = indentOf(line);
        if (ind <= typeIndent) break;
        if (ind === groupIndent) {
            const m = /^\s*([A-Za-z][\w-]*):\s*$/.exec(line);
            current = m ? m[1] : null;
            if (current !== null) groups[current] = groups[current] ?? new Set();
            continue;
        }
        if (current === null) continue;
        for (const m of line.matchAll(/public\/build\/security\/([A-Za-z0-9._-]+\.xml)/g)) {
            groups[current].add(m[1]);
        }
    }
    return groups;
}

// Keys and strings of one plist, with XML comments removed first so a comment
// that names a restricted key never counts as a declaration.
function plistFacts(text) {
    const body = text.replace(/<!--[\s\S]*?-->/g, '');
    return {
        keys: [...body.matchAll(/<key>([^<]*)<\/key>/g)].map(m => m[1]),
        strings: [...body.matchAll(/<string>([^<]*)<\/string>/g)].map(m => m[1]),
    };
}

const hitId = (rel, kind, value) => `${rel}|${kind}|${value}`;

function runChecks(root, overrides = {}) {
    const failures = [];
    const hits = [];
    const read = overrides.read ?? ((rel) => readText(root, rel));
    const list = overrides.list ?? ((rel) => listXml(root, rel));
    const status = overrides.windowsStatus ?? (() => windowsStatus(read(WINDOWS_REL), KNOWN_OPEN_WINDOWS_ID));

    // --- 1. derivation -----------------------------------------------------
    const configText = read(SIGN_CONFIG_REL);
    if (configText === null) {
        failures.push(`${SIGN_CONFIG_REL} could not be read, so the signing groups are unknown. Next step: run this check inside the repository with the upstream checkout present (./mach or scripts/fetch-upstream.sh).`);
        return { failures, hits, derived: [], observed: [], excluded: [] };
    }
    const groups = signingGroups(configText);
    const derived = new Set();
    for (const group of Object.keys(GROUP_DIRS)) {
        const names = groups?.[group];
        if (!names || names.size === 0) {
            failures.push(`${SIGN_CONFIG_REL} names no entitlement file for the '${group}' signing group, so that group has no derived inputs. Next step: check the hardened-sign-config block the instrument reads (${SELF_REL}, signingGroups).`);
            continue;
        }
        for (const name of names) derived.add(`${HARDENED_REL}/${GROUP_DIRS[group]}/${name}`);
    }
    if (failures.length > 0) return { failures, hits, derived: [...derived], observed: [], excluded: [] };

    // --- 2. observed, set equality both ways -------------------------------
    const observed = new Set();
    for (const dir of new Set(Object.values(GROUP_DIRS))) {
        const names = list(`${HARDENED_REL}/${dir}`);
        if (names === null) {
            failures.push(`${HARDENED_REL}/${dir} could not be listed, so the signing inputs are unknown. Next step: restore the upstream checkout (scripts/fetch-upstream.sh).`);
            continue;
        }
        for (const name of names) observed.add(`${HARDENED_REL}/${dir}/${name}`);
    }

    // --- 5. vacuity --------------------------------------------------------
    if (derived.size === 0 || observed.size === 0) {
        failures.push(`${NAME} found no entitlement file to check -- an agreement over nothing proves nothing. Next step: check the instrument (${SELF_REL}: the hardened-sign-config reader and the directory listing) against ${SIGN_CONFIG_REL}.`);
        return { failures, hits, derived: [...derived], observed: [...observed], excluded: [] };
    }

    for (const rel of observed) {
        if (!derived.has(rel)) {
            failures.push(`${rel} is in the signing inputs but ${SIGN_CONFIG_REL} names no such file. Next step: remove it, or add it to the hardened-sign-config group that signs with it.`);
        }
    }
    for (const rel of derived) {
        if (!observed.has(rel)) {
            failures.push(`${rel} is named by ${SIGN_CONFIG_REL} but is missing from the tree. Next step: restore it from upstream, or remove the name from the hardened-sign-config group.`);
        }
    }

    // --- 3. content --------------------------------------------------------
    for (const rel of [...derived].filter(r => observed.has(r)).sort()) {
        const text = read(rel);
        if (text === null) {
            failures.push(`${rel} could not be read, so its entitlements are unproven. Next step: restore the file from upstream.`);
            continue;
        }
        const { keys, strings } = plistFacts(text);
        // One hit per declared value: a value carrying two forbidden substrings is one finding.
        for (const key of keys) {
            if (FORBIDDEN_SUBSTRINGS.some(s => key.includes(s))) hits.push({ rel, kind: 'forbidden', value: key });
            if (RESTRICTED_KEYS.includes(key)) hits.push({ rel, kind: 'restricted', value: key });
        }
        for (const value of strings) {
            if (FORBIDDEN_SUBSTRINGS.some(s => value.includes(s))) hits.push({ rel, kind: 'forbidden', value });
        }
    }

    // --- 4. known-open exclusions ------------------------------------------
    const open = status() === 'open';
    const expected = new Set(open ? KNOWN_OPEN_HITS : []);
    const seen = new Set();
    const excluded = [];
    for (const h of hits) {
        const id = hitId(h.rel, h.kind, h.value);
        seen.add(id);
        if (expected.has(id)) {
            excluded.push(id);
            continue;
        }
        const what = h.kind === 'restricted' ? `restricted key '${h.value}'` : `forbidden value '${h.value}'`;
        failures.push(`${h.rel} carries ${what}, which the signing inputs must not carry. Next step: remove it through the hook-only Team-ID patch (scripts/regenerate-patches.sh), never by text-editing the upstream plist.`);
    }
    for (const id of expected) {
        if (!seen.has(id)) {
            failures.push(`${WINDOWS_REL} entry ${KNOWN_OPEN_WINDOWS_ID} is open, but the known-open hit ${id} is no longer in the tree -- the exclusion is stale. Next step: mark entry ${KNOWN_OPEN_WINDOWS_ID} fixed and remove its hits from KNOWN_OPEN_HITS in ${SELF_REL}.`);
        }
    }

    return { failures, hits, derived: [...derived].sort(), observed: [...observed].sort(), excluded };
}

function main() {
    if (args.includes('--self-test')) return selfTest();
    const { failures, derived, excluded } = runChecks(REPO_ROOT);
    if (failures.length > 0) {
        console.error(`${NAME}: FAIL -- ${failures.length} problem(s) with the macOS signing inputs.`);
        failures.forEach(f => console.error(`  ${f}`));
        return 1;
    }
    excluded.forEach(id => console.log(`${NAME}: EXCLUDED (known-open, ${WINDOWS_REL} entry ${KNOWN_OPEN_WINDOWS_ID}) -- ${id}`));
    console.log(`${NAME}: PASS -- ${derived.length} signing input(s) named by ${SIGN_CONFIG_REL} match the tree, with no forbidden identifier or restricted key outside the ${excluded.length} known-open hit(s)`);
    return 0;
}

function selfTest() {
    const cache = new Map();
    const realRead = (rel) => {
        if (!cache.has(rel)) cache.set(rel, readText(REPO_ROOT, rel));
        return cache.get(rel);
    };
    const realList = (rel) => listXml(REPO_ROOT, rel);
    const DEV = `${HARDENED_REL}/developer`;
    const DEV_BROWSER = `${DEV}/browser.xml`;
    const PROD_FIREFOX = `${PROD}/firefox.browser.xml`;
    const baseline = runChecks(REPO_ROOT, { read: realRead, list: realList });
    if (baseline.failures.length > 0) {
        console.error(`${NAME}: --self-test FAIL -- the unmodified tree is already red, so the planted-fault results below would mean nothing:`);
        baseline.failures.forEach(f => console.error(`  ${f}`));
        return 1;
    }
    console.log(`  ok  baseline -> green`);

    // Inserts one plist entry before the closing dict of a real file.
    const withEntry = (target, entry) => (rel) => (rel === target
        ? realRead(rel).replace(/<\/dict>/, `${entry}</dict>`)
        : realRead(rel));
    const plantedFile = `${DEV}/zzz-planted.xml`;
    const PLANT_PLIST = '<?xml version="1.0" encoding="UTF-8"?>\n<plist version="1.0"><dict><key>com.apple.security.cs.allow-jit</key><true/></dict></plist>\n';
    const addedRead = (rel) => (rel === plantedFile ? PLANT_PLIST : realRead(rel));
    const addedList = (rel) => (rel === DEV ? [...realList(DEV), 'zzz-planted.xml'].sort() : realList(rel));
    const removedList = (rel) => (rel === DEV ? realList(DEV).filter(n => n !== 'utility.xml') : realList(rel));
    const emptyList = () => [];

    // A copy of the real file with one value replaced, applied in memory.
    const withReplaced = (target, from, to) => (rel) => (rel === target
        ? realRead(rel).replaceAll(from, to)
        : realRead(rel));
    // The config with every signing-group entitlement name removed: no group derives a file.
    const noSigningNames = (rel) => (rel === SIGN_CONFIG_REL
        ? realRead(rel).replace(/public\/build\/security\/[A-Za-z0-9._-]+\.xml/g, 'none')
        : realRead(rel));

    // Each plant names the file and the value it must name. The optional `needle` is
    // text the same failure must also carry. The file must appear in the same message.
    const plants = [
        ['43AQ936H96 string in a developer input', { read: withEntry(DEV_BROWSER, '<key>planted</key><string>43AQ936H96.org.planted</string>') }, DEV_BROWSER, '43AQ936H96'],
        ['org.mozilla string in a developer input', { read: withEntry(DEV_BROWSER, '<key>planted</key><string>org.mozilla.planted</string>') }, DEV_BROWSER, 'org.mozilla'],
        ['restricted key in a developer input', { read: withEntry(DEV_BROWSER, '<key>com.apple.developer.web-browser.public-key-credential</key><true/>') }, DEV_BROWSER, 'com.apple.developer.web-browser.public-key-credential'],
        ['added developer input not named by the config', { read: addedRead, list: addedList }, plantedFile, 'zzz-planted.xml'],
        ['removed developer input the config names', { list: removedList }, `${DEV}/utility.xml`, 'utility.xml'],
        ['new forbidden value beyond the known-open set', { read: withEntry(PROD_FIREFOX, '<key>planted</key><string>43AQ936H96.org.mozilla.planted</string>') }, PROD_FIREFOX, '43AQ936H96.org.mozilla.planted'],
        ['known-open entry closed, its hits still present', { windowsStatus: () => 'fixed' }, PROD_FIREFOX, '43AQ936H96.org.mozilla.firefox'],
        // Vacuity, observed side: zero entitlement files must name the instrument, not pass.
        ['zero entitlement files (observed side)', { list: emptyList }, NAME, 'no entitlement file'],
        // Vacuity, derived side: a signing group that derives no file is red naming the group. Without
        // this, a broken hardened-sign-config reader that returns empty groups would pass the self-test.
        ['signing group that derives no file (derived side)', { read: noSigningNames }, SIGN_CONFIG_REL, "'production' signing group"],
        // Stale exclusion: entry 22 is open and its hit is excluded, but the hit is gone from the tree.
        ['known-open hit removed from the tree (stale exclusion)', { read: withReplaced(PROD_FIREFOX, '43AQ936H96.org.mozilla.firefox', 'PowerBrowser.example.firefox') }, PROD_FIREFOX, '43AQ936H96.org.mozilla.firefox', 'stale'],
    ];

    let failed = 0;
    for (const [name, overrides, file, value, needle = ''] of plants) {
        const { failures } = runChecks(REPO_ROOT, { read: realRead, list: realList, ...overrides });
        const hit = failures.some(f => f.includes(file) && f.includes(value) && f.includes(needle));
        if (hit) {
            console.log(`  ok  ${name} -> red, naming '${file}' and '${value}'`);
        } else {
            console.error(`${NAME}: --self-test FAIL -- '${name}' did not go red naming '${file}' and '${value}'; got: ${failures.join(' | ') || '(no failures at all)'}`);
            failed += 1;
        }
    }

    // Control: .planning/ text never counts as a signing input. WINDOWS.md is a .planning/ file the gate
    // does read, for its status only, through the same injectable reader. Forbidden text planted in its
    // prose must stay green. If the gate ever scanned that file for hits, this control would go red.
    {
        const control = (rel) => (rel === WINDOWS_REL ? `${realRead(rel)}\n43AQ936H96 org.mozilla planted in prose\n` : realRead(rel));
        const { failures } = runChecks(REPO_ROOT, { read: control, list: realList });
        if (failures.length === 0) {
            console.log(`  ok  control: forbidden text in the prose of ${WINDOWS_REL} -> green`);
        } else {
            console.error(`${NAME}: --self-test FAIL -- the control went red: ${failures.join(' | ')}`);
            failed += 1;
        }
    }

    if (failed > 0) return 1;
    console.log(`${NAME}: --self-test PASS -- ${plants.length} planted faults went red naming the drifted file, and the control stayed green`);
    return 0;
}

process.exit(main());
