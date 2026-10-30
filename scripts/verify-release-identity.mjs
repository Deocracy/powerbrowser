#!/usr/bin/env node
// scripts/verify-release-identity.mjs
//
// The release-identity gate (Phase 40, REL-01). A release is named by one
// key, v<ESR>-<revision>, derived by releaseIdentity() in scripts/generate.mjs
// from [upstreams] firefox_esr_tag and [product] revision. Every other place
// the identity appears is derived from the tree at check time and required to
// agree with that derivation:
//
//  1. powerbrowser/packaging/version/version.txt is the ESR version and
//     powerbrowser/packaging/version/release.txt is the release key, each
//     followed by one newline. A hand-written literal in either goes red
//     naming the file and both values.
//  2. upstream/config/milestone.txt, when the upstream/ checkout exists:
//     its last non-empty line is the ESR version. Red names the manifest pin
//     and the checkout. An absent upstream/ SKIPs this step only.
//  3. Every tracked update.xml descriptor (git ls-files): each <update>
//     element's appVersion is the ESR version, and its displayVersion, when
//     present, is the release key without its leading v. The descriptor count
//     is printed by name, even when it is 0.
//  4. Every git tag shaped v<ESR>-<revision> that HEAD contains (git tag
//     --merged HEAD) and whose commit is not HEAD compares lower than or equal
//     to the derived (major, minor, patch, revision): a tree never goes
//     backwards from a release it descends from. Equal is green, so an
//     ordinary commit after a release tag stays green (WR-02). A tag on a
//     commit HEAD does not contain -- another branch or worktree -- is not
//     read. Red names the tag. Milestone tags such as v1.4 never match the
//     shape.
//  5. A release-shaped tag that points at HEAD equals the release key.
//
// NOT HERE: that the key is new -- above every earlier release tag and the
// latest published GitHub Release -- is checked where a tag is created, in
// release.yml (DIST-02) and the release train (TRAIN-01), never in --quick.
//
// Honestly --quick: git plumbing and text reads only. No build, no browser, no
// display, no network. It writes nothing in the repository: the self-test's
// fixtures live in one mkdtemp git repo removed in a finally.
//
// Usage:
//   node scripts/verify-release-identity.mjs
//   node scripts/verify-release-identity.mjs --self-test

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { releaseIdentity, resolveConfig } from './generate.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'release-identity';
const MANIFEST_REL = 'configuration.toml';
const VERSION_REL = 'powerbrowser/packaging/version/version.txt';
const RELEASE_REL = 'powerbrowser/packaging/version/release.txt';
const MILESTONE_REL = 'upstream/config/milestone.txt';
const RERUN = 'node scripts/generate.mjs';
const RELEASE_TAG = /^v(\d+)\.(\d+)(?:\.(\d+))?-(\d+)$/;

const args = process.argv.slice(2);
for (const a of args) {
    if (a !== '--self-test') {
        console.error(`${NAME}: FAIL -- unknown argument '${a}'`);
        process.exit(2);
    }
}

function defaultGit(root, gitArgs) {
    return execFileSync('git', ['-C', root, ...gitArgs], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
}

/** (major, minor, patch or 0, revision) as numbers, from a tag or from the derivation. */
function tupleOf(esrVersion, revision) {
    const [major, minor, patch = 0] = esrVersion.split('.').map(Number);
    return [major, minor, patch, Number(revision)];
}

function lower(a, b) {
    for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return a[i] < b[i];
    return false;
}

function runChecks(root, overrides = {}) {
    const git = overrides.git ?? (gitArgs => defaultGit(root, gitArgs));
    const read = overrides.read ?? (rel => {
        try {
            return readFileSync(join(root, rel), 'utf8');
        } catch {
            return null;
        }
    });
    const files = overrides.files ?? (() => git(['ls-files', '-z']).split('\0').filter(Boolean));
    const failures = [];
    const skipped = [];
    const notes = [];

    const { failures: configFailures, config } = resolveConfig(join(root, MANIFEST_REL));
    if (configFailures.length > 0) {
        failures.push(...configFailures.map(f => `${MANIFEST_REL}: ${f}`));
        return { failures, skipped, notes, identity: null };
    }
    const identity = releaseIdentity(config);
    const { esrVersion, revision, releaseKey } = identity;

    // --- 1. the two version files -------------------------------------------
    for (const [rel, want] of [[VERSION_REL, esrVersion], [RELEASE_REL, releaseKey]]) {
        const got = read(rel);
        if (got === null) {
            failures.push(`${rel} is missing, so the release identity has no tracked comparand. Next step: run ${RERUN} and copy generated/${rel.replace('powerbrowser/', '')} into place.`);
        } else if (got !== `${want}\n`) {
            failures.push(`${rel} reads ${JSON.stringify(got)} but ${MANIFEST_REL} derives ${JSON.stringify(`${want}\n`)} -- it was hand-written or is stale. Next step: run ${RERUN} and copy the generated file over it; never edit it by hand.`);
        }
    }

    // --- 2. the upstream milestone ------------------------------------------
    if (!existsSync(join(root, 'upstream'))) {
        skipped.push(`step 2: no upstream/ checkout, so ${MILESTONE_REL} was not compared with the manifest pin`);
    } else {
        const text = read(MILESTONE_REL);
        const last = text === null ? null : text.split('\n').map(l => l.trim()).filter(Boolean).pop() ?? null;
        if (last !== esrVersion) {
            failures.push(`the manifest pin upstreams.firefox_esr_tag derives ESR ${esrVersion} but the upstream/ checkout's ${MILESTONE_REL} reads ${JSON.stringify(last)} -- the checkout is not the pinned tag. Next step: run scripts/fetch-upstream.sh, then re-run this check.`);
        }
    }

    // --- 3 to 5 need version control ----------------------------------------
    let tracked = null;
    let head = null;
    let tags = null;
    try {
        tracked = files();
        head = git(['rev-parse', 'HEAD']).trim();
        tags = git(['tag', '--merged', 'HEAD']).split('\n').map(t => t.trim()).filter(Boolean);
    } catch {
        failures.push('git could not list the tracked files, HEAD or the tags, so the descriptors and release tags prove nothing. Next step: run this from a working copy of the project, with git available.');
        return { failures, skipped, notes, identity };
    }

    // --- 3. tracked update.xml descriptors ----------------------------------
    const descriptors = tracked.filter(rel => rel === 'update.xml' || rel.endsWith('/update.xml'));
    const displayWant = releaseKey.slice(1);
    // A no-update document (Phase 47, the updates-host placeholder): an explicit
    // empty updates element offers no update, so it states no version to agree with.
    // A file with no updates element at all is still unreadable and stays red.
    const NO_UPDATE = /<updates(\s[^>]*)?>\s*<\/updates>|<updates(\s[^>]*)?\/>/;
    for (const rel of descriptors) {
        const text = read(rel) ?? '';
        const elements = text.match(/<update\s[^>]*>/g) ?? [];
        if (elements.length === 0 && !NO_UPDATE.test(text)) {
            failures.push(`${rel} carries no <update> element and no empty <updates> document, so it states no version to agree with. Next step: restore the descriptor or remove it from version control.`);
        }
        for (const el of elements) {
            const app = /\bappVersion="([^"]*)"/.exec(el)?.[1];
            const display = /\bdisplayVersion="([^"]*)"/.exec(el)?.[1];
            if (app !== esrVersion) {
                failures.push(`${rel} offers appVersion ${JSON.stringify(app ?? null)} but ${MANIFEST_REL} derives ESR ${esrVersion}. Next step: regenerate the descriptor from the release identity; never edit its version by hand.`);
            }
            if (display !== undefined && display !== displayWant) {
                failures.push(`${rel} offers displayVersion ${JSON.stringify(display)} but the release key ${releaseKey} derives ${displayWant}. Next step: regenerate the descriptor from the release identity; never edit its version by hand.`);
            }
        }
    }
    notes.push(`${descriptors.length} tracked update.xml descriptor(s)`);

    // --- 4 and 5. release-shaped tags ---------------------------------------
    const derived = tupleOf(esrVersion, revision);
    const releaseTags = tags.filter(t => RELEASE_TAG.test(t));
    for (const tag of releaseTags) {
        let commit;
        try {
            commit = git(['rev-list', '-n', '1', tag]).trim();
        } catch {
            failures.push(`release tag ${tag} names no commit git can resolve. Next step: fetch the tag again, then re-run this check.`);
            continue;
        }
        const m = RELEASE_TAG.exec(tag);
        const tuple = [Number(m[1]), Number(m[2]), Number(m[3] ?? 0), Number(m[4])];
        if (commit === head) {
            if (tag !== releaseKey) {
                failures.push(`release tag ${tag} points at HEAD but ${MANIFEST_REL} derives ${releaseKey}. Next step: delete the tag and tag HEAD as ${releaseKey}, or correct [product] revision and regenerate.`);
            }
        } else if (lower(derived, tuple)) {
            failures.push(`release tag ${tag} is on an earlier commit of this branch but is higher than the derived ${releaseKey}, so this tree goes backwards from a released name. Next step: set [product] revision in ${MANIFEST_REL} so the key is at least ${tag}, then run ${RERUN}.`);
        }
    }
    notes.push(`${releaseTags.length} release tag(s) on this branch matching v<ESR>-<revision>`);

    return { failures, skipped, notes, identity };
}

function main() {
    if (args.includes('--self-test')) return selfTest();
    const { failures, skipped, notes, identity } = runChecks(REPO_ROOT);
    for (const s of skipped) console.log(`${NAME}: SKIP -- ${s}`);
    if (failures.length > 0) {
        console.error(`${NAME}: FAIL -- ${failures.length} problem(s) with the release identity.`);
        failures.forEach(f => console.error(`  ${f}`));
        return 1;
    }
    console.log(`${NAME}: PASS -- the release key ${identity.releaseKey} (ESR ${identity.esrVersion}) agrees with both version files; ${notes.join('; ')}`);
    return 0;
}

function selfTest() {
    const tmp = mkdtempSync(join(tmpdir(), 'release-identity-'));
    const env = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };
    const g = (...a) => execFileSync('git', ['-C', tmp, '-c', 'user.name=self-test', '-c', 'user.email=self-test@example.invalid', '-c', 'tag.gpgSign=false', '-c', 'commit.gpgSign=false', ...a], { encoding: 'utf8', env, stdio: ['ignore', 'pipe', 'ignore'] });
    const put = (rel, text) => {
        mkdirSync(dirname(join(tmp, rel)), { recursive: true });
        writeFileSync(join(tmp, rel), text, 'utf8');
    };
    const overrides = { git: a => g(...a) };
    let failed = 0;
    try {
        g('init', '-q');
        // The manifest is copied, so the tag and key are derived, never typed here.
        put(MANIFEST_REL, readFileSync(join(REPO_ROOT, MANIFEST_REL), 'utf8'));
        const { config } = resolveConfig(join(tmp, MANIFEST_REL));
        const { esrVersion, revision, releaseKey } = releaseIdentity(config);
        put(VERSION_REL, `${esrVersion}\n`);
        put(RELEASE_REL, `${releaseKey}\n`);
        g('add', '-A');
        g('commit', '-q', '-m', 'base');
        g('commit', '-q', '--allow-empty', '-m', 'head');
        const older = g('rev-parse', 'HEAD~1').trim();

        const baseline = runChecks(tmp, overrides);
        if (baseline.failures.length > 0) {
            console.error(`${NAME}: --self-test FAIL -- the fixture repo is already red, so the planted-fault results would mean nothing:`);
            baseline.failures.forEach(f => console.error(`  ${f}`));
            return 1;
        }

        const neighbor = esrVersion.replace(/(\d+)$/, d => String(Number(d) + 1));
        const [major, minor] = esrVersion.split('.');
        const lowerTag = `v${Number(major) - 1}.${minor}-${revision}`;
        const descriptor = (attrs) => `<?xml version="1.0"?>\n<updates>\n  <update type="minor" ${attrs} buildID="20260101000000">\n  </update>\n</updates>\n`;
        const DESC_REL = 'dist/self-test/update.xml';

        const cases = [
            {
                name: 'hand-written version literal', expect: VERSION_REL,
                plant: () => put(VERSION_REL, `${neighbor}\n`), undo: () => put(VERSION_REL, `${esrVersion}\n`),
            },
            {
                name: 'hand-written release key', expect: RELEASE_REL,
                plant: () => put(RELEASE_REL, `v${neighbor}-${revision}\n`), undo: () => put(RELEASE_REL, `${releaseKey}\n`),
            },
            {
                name: 'upstream milestone off the pin', expect: MILESTONE_REL,
                plant: () => put(MILESTONE_REL, `# milestone\n${neighbor}\n`), undo: () => rmSync(join(tmp, 'upstream'), { recursive: true, force: true }),
            },
            {
                name: 'descriptor appVersion a neighbouring version', expect: DESC_REL,
                plant: () => { put(DESC_REL, descriptor(`appVersion="${neighbor}" displayVersion="${releaseKey.slice(1)}"`)); g('add', DESC_REL); },
                undo: () => { g('rm', '-q', '-f', DESC_REL); },
            },
            {
                name: 'descriptor displayVersion off the key', expect: DESC_REL,
                plant: () => { put(DESC_REL, descriptor(`appVersion="${esrVersion}" displayVersion="${esrVersion}-${revision + 1}"`)); g('add', DESC_REL); },
                undo: () => { g('rm', '-q', '-f', DESC_REL); },
            },
            {
                // A truncated descriptor with no updates element is unreadable, not a no-update document.
                name: 'descriptor truncated before its updates element', expect: DESC_REL,
                plant: () => { put(DESC_REL, '<?xml version="1.0"?>\n<upd'); g('add', DESC_REL); },
                undo: () => { g('rm', '-q', '-f', DESC_REL); },
            },
            {
                name: 'HEAD tagged one revision above the key', expect: `v${esrVersion}-${revision + 1}`,
                plant: () => g('tag', `v${esrVersion}-${revision + 1}`), undo: () => g('tag', '-d', `v${esrVersion}-${revision + 1}`),
            },
            {
                name: 'older commit tagged one revision above the key', expect: `v${esrVersion}-${revision + 1}`,
                plant: () => g('tag', `v${esrVersion}-${revision + 1}`, older), undo: () => g('tag', '-d', `v${esrVersion}-${revision + 1}`),
            },
            {
                // WR-02: a commit after a release tag, manifest unchanged.
                name: 'control: older commit tagged at the key', expect: null,
                plant: () => g('tag', releaseKey, older), undo: () => g('tag', '-d', releaseKey),
            },
            {
                // WR-02: tags are shared across worktrees; one HEAD does not contain is not read.
                name: 'control: higher release tag on a commit HEAD does not contain', expect: null,
                plant: () => g('tag', `v${esrVersion}-${revision + 1}`, g('commit-tree', 'HEAD^{tree}', '-p', older, '-m', 'side').trim()),
                undo: () => g('tag', '-d', `v${esrVersion}-${revision + 1}`),
            },
            {
                name: 'control: HEAD tagged as the key', expect: null,
                plant: () => g('tag', releaseKey), undo: () => g('tag', '-d', releaseKey),
            },
            {
                name: 'control: lower release tag on an older commit', expect: null,
                plant: () => g('tag', lowerTag, older), undo: () => g('tag', '-d', lowerTag),
            },
            {
                name: 'control: matching descriptor', expect: null,
                plant: () => { put(DESC_REL, descriptor(`appVersion="${esrVersion}" displayVersion="${releaseKey.slice(1)}"`)); g('add', DESC_REL); },
                undo: () => { g('rm', '-q', '-f', DESC_REL); },
            },
            {
                // The updates-host placeholder: an explicit empty updates element offers no update.
                name: 'control: empty updates document (no update offered)', expect: null,
                plant: () => { put(DESC_REL, '<?xml version="1.0"?>\n<updates></updates>\n'); g('add', DESC_REL); },
                undo: () => { g('rm', '-q', '-f', DESC_REL); },
            },
        ];

        for (const c of cases) {
            c.plant();
            const { failures } = runChecks(tmp, overrides);
            c.undo();
            const text = failures.join('\n');
            if (c.expect === null) {
                if (failures.length > 0) {
                    console.error(`${NAME}: --self-test FAIL -- '${c.name}' went red but must stay green:\n${text}`);
                    failed += 1;
                } else {
                    console.log(`  ${c.name}: green`);
                }
                continue;
            }
            if (!failures.some(f => f.includes(c.expect))) {
                console.error(`${NAME}: --self-test FAIL -- '${c.name}' did not go red naming ${c.expect}:\n${text || '(no failure)'}`);
                failed += 1;
            } else if (text.includes(REPO_ROOT) || text.includes(tmp)) {
                console.error(`${NAME}: --self-test FAIL -- '${c.name}' leaked a checkout path into its output: ${text}`);
                failed += 1;
            } else {
                console.log(`  ${c.name}: red -- ${failures.find(f => f.includes(c.expect))}`);
            }
        }
    } finally {
        rmSync(tmp, { recursive: true, force: true });
    }
    if (failed > 0) {
        console.error(`${NAME}: --self-test FAIL -- ${failed} case(s) did not behave as required`);
        return 1;
    }
    console.log(`${NAME}: --self-test PASS -- all eight planted faults went red naming the file or tag, and the six controls stayed green`);
    return 0;
}

process.exit(main());
