#!/usr/bin/env node
// scripts/verify-codeberg-mirror.mjs
//
// The codeberg-mirror row (Phase 53, GH-04). Quick mode reads the tracked legion timer and
// service text, checks that no token material is in them or in the tracked workflow and
// settings files, and proves the SHA-compare logic on in-memory pairs. Live mode (full tier)
// compares the unauthenticated Codeberg main SHA with the GitHub main SHA.
//
// Quick rules (each failure names the file and the drift, and ends with a next step):
//  timer        codeberg-mirror.timer carries OnCalendar=daily, Persistent=true and WantedBy=timers.target.
//  service      codeberg-mirror.service is Type=oneshot; its ExecStart pushes the codeberg remote by
//               name with the heads and the tags refspecs, never with --mirror, --prune, --force or a
//               + refspec; its ExecStartPre refuses a mirror without refs/heads/main.
//  sandbox      the unit runs as DynamicUser with StateDirectory=codeberg-mirror, NoNewPrivileges,
//               ProtectSystem=strict, ProtectHome and PrivateTmp, and TimeoutStartSec is at most 15min;
//               RestrictAddressFamilies is exactly AF_INET AF_INET6 AF_UNIX.
//  credential   the one LoadCredential line names mirror-push and an absolute source path outside this repository.
//  no-token     no non-comment line of the unit files names a token, secret, password, credential or
//               EnvironmentFile (LoadCredential is checked by credential); no tracked workflow, settings
//               or unit file assigns a Codeberg token literal.
//  sha-compare  the Codeberg main SHA equals the GitHub main SHA; a lagged pair is red naming the mirror.
//
// Live mode reads the declared mirror slug (owner/repo) from --slug= or the CODEBERG_MIRROR
// environment variable. An undeclared slug is a FAIL, never a SKIP.

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'codeberg-mirror';
const SELF_REL = 'scripts/verify-codeberg-mirror.mjs';
const TIMER_REL = 'systemd/codeberg-mirror.timer';
const SERVICE_REL = 'systemd/codeberg-mirror.service';
const MANIFEST_REL = 'configuration.toml';
const toml = createRequire(import.meta.url)(join(REPO_ROOT, 'scripts', 'lib', 'toml.cjs'));
const SCAN_DIRS = ['systemd', '.github'];
const SCAN_EXT = /\.(ya?ml|json|timer|service)$/;
const TOKEN_LINE = /token|secret|passw|credential|EnvironmentFile|LoadCredential|Authorization/i;
const TOKEN_ASSIGN = /codeberg[_-]?(deploy[_-]?)?token\s*[:=]\s*\S+/i;
const HEX40 = /^[0-9a-f]{40}$/;

const args = process.argv.slice(2);
let live = false;
let slugArg;
for (const a of args) {
    if (a === '--self-test') continue;
    if (a === '--live') { live = true; continue; }
    if (a.startsWith('--slug=')) { slugArg = a.slice('--slug='.length); continue; }
    console.error(`${NAME}: FAIL -- unknown argument '${a}'`);
    console.error(`  Next step: run: node ${SELF_REL}, node ${SELF_REL} --self-test, or node ${SELF_REL} --live --slug=owner/repo.`);
    process.exit(2);
}

// The GitHub repository is the owner/repo of urls.release_notes, derived here so a move of the
// release home cannot leave the live compare reading the old repository's main.
export function githubSlugFrom(manifestText) {
    const path = new URL(toml.parse(manifestText).urls.release_notes).pathname.replace(/^\/|\/releases\/?$/g, '');
    if (!/^[^/\s]+\/[^/\s]+$/.test(path)) throw new Error(`urls.release_notes names no owner/repo (got '${path}')`);
    return path;
}

function isComment(line) {
    return line === '' || line.startsWith('#') || line.startsWith(';');
}

// systemd unit reader: section headers and key=value lines; comments dropped.
export function parseUnit(text) {
    const sections = {};
    let cur = '';
    for (const raw of text.split('\n')) {
        const line = raw.trim();
        if (isComment(line)) continue;
        const h = line.match(/^\[(.+)\]$/);
        if (h) { cur = h[1]; sections[cur] = sections[cur] ?? []; continue; }
        const kv = line.match(/^([A-Za-z]+)=(.*)$/);
        if (kv && cur) sections[cur].push([kv[1], kv[2]]);
    }
    return sections;
}

const valuesOf = (s, section, key) => (s[section] ?? []).filter(([k]) => k === key).map(([, v]) => v);

export function timerRules(text) {
    const s = parseUnit(text);
    const out = [];
    if (!valuesOf(s, 'Timer', 'OnCalendar').includes('daily')) out.push('OnCalendar is not daily. Next step: set OnCalendar=daily.');
    if (!valuesOf(s, 'Timer', 'Persistent').includes('true')) out.push('Persistent is not true, so a missed run is lost. Next step: set Persistent=true.');
    if (!valuesOf(s, 'Install', 'WantedBy').includes('timers.target')) out.push('WantedBy is not timers.target. Next step: set WantedBy=timers.target.');
    return out;
}

// TimeoutStartSec as seconds: a bare number or an s/sec or min/m suffix. NaN when unparseable.
function seconds(v) {
    const m = /^(\d+)(s|sec|min|m)?$/.exec(v ?? '');
    if (!m) return NaN;
    const n = Number(m[1]);
    return m[2] === 'min' || m[2] === 'm' ? n * 60 : n;
}

export function serviceRules(text) {
    const s = parseUnit(text);
    const out = [];
    if (!valuesOf(s, 'Service', 'Type').includes('oneshot')) out.push('Type is not oneshot. Next step: set Type=oneshot.');
    const exec = valuesOf(s, 'Service', 'ExecStart').join(' ');
    if (!/\bpush\b/.test(exec) || !/\bcodeberg\b/.test(exec)) out.push('ExecStart does not push to the codeberg remote by name. Next step: push to the codeberg remote.');
    if (!exec.includes("'refs/heads/*:refs/heads/*'") || !exec.includes("'refs/tags/*:refs/tags/*'")) out.push('ExecStart does not push both the heads and the tags refspecs. Next step: push refs/heads/* and refs/tags/*.');
    if (/--mirror\b/.test(exec)) out.push('ExecStart uses --mirror, which pushes refs beyond heads and tags. Next step: push the heads and tags refspecs.');
    if (/--prune\b/.test(exec)) out.push('ExecStart uses --prune, so a bad fetch could delete Codeberg refs. Next step: drop --prune from the push; git then refuses non-fast-forward updates.');
    if (/--force\b/.test(exec) || /'\+refs\//.test(exec)) out.push('ExecStart forces the update with --force or a + refspec, which can rewrite Codeberg history. Next step: drop the force.');
    for (const [key, want] of [['DynamicUser', 'yes'], ['NoNewPrivileges', 'yes'], ['ProtectSystem', 'strict'], ['ProtectHome', 'yes'], ['PrivateTmp', 'yes'], ['StateDirectory', 'codeberg-mirror']]) {
        if (!valuesOf(s, 'Service', key).includes(want)) out.push(`${key} is not ${want}. Next step: set ${key}=${want} so the unit runs sandboxed as a dynamic user with its own state directory.`);
    }
    const timeout = valuesOf(s, 'Service', 'TimeoutStartSec')[0];
    if (!(seconds(timeout) > 0 && seconds(timeout) <= 900)) out.push(`TimeoutStartSec is ${timeout ?? 'unset'}, not at most 15min, so a stalled fetch or push holds the unit forever. Next step: set TimeoutStartSec=15min.`);
    const families = valuesOf(s, 'Service', 'RestrictAddressFamilies').join(' ').split(/\s+/).filter(Boolean).sort().join(' ');
    if (families !== 'AF_INET AF_INET6 AF_UNIX') out.push(`RestrictAddressFamilies is '${families || 'unset'}', not AF_INET AF_INET6 AF_UNIX. Next step: allow only those three families.`);
    if (!/show-ref --verify --quiet refs\/heads\/main/.test(valuesOf(s, 'Service', 'ExecStartPre').join(' '))) {
        out.push('ExecStartPre has no check that refs/heads/main exists, so a mirror without main could publish. Next step: add the show-ref --verify check for refs/heads/main.');
    }
    return out;
}

// The one LoadCredential line: exactly one, named mirror-push, with an absolute source path that is
// not inside this repository. The token value is never in the unit.
export function credentialRules(text, repoRoot) {
    const lines = valuesOf(parseUnit(text), 'Service', 'LoadCredential');
    if (lines.length !== 1) return [`has ${lines.length} LoadCredential lines, not one. Next step: keep one LoadCredential=mirror-push:<absolute path outside the repository>.`];
    const m = /^([^:]+):(.*)$/.exec(lines[0]);
    if (!m || m[1] !== 'mirror-push') return [`LoadCredential names '${(m ? m[1] : lines[0])}', not mirror-push. Next step: name the credential mirror-push.`];
    const src = m[2];
    if (!src.startsWith('/')) return [`LoadCredential source '${src}' is not an absolute path. Next step: point it at a root-owned file outside the repository.`];
    if (src === repoRoot || src.startsWith(`${repoRoot}/`)) return [`LoadCredential source '${src}' is inside the repository. Next step: move the credential file outside the tree.`];
    return [];
}

// units: { rel: text } for the two unit files; scanned: { rel: text } for the tracked files.
export function tokenFailures(units, scanned) {
    const out = [];
    for (const [rel, text] of Object.entries(units)) {
        for (const raw of text.split('\n')) {
            const line = raw.trim();
            if (isComment(line)) continue;
            if (/^LoadCredential=/.test(line)) continue; // checked by credentialRules
            if (TOKEN_LINE.test(line)) out.push([rel, `names token material on the line '${line.split('=')[0]}'. Next step: move the credential helper into the legion-local mirror repository config, outside this repository.`]);
        }
    }
    for (const [rel, text] of Object.entries(scanned)) {
        if (TOKEN_ASSIGN.test(text)) out.push([rel, 'assigns a Codeberg token literal. Next step: remove the literal; the token lives on legion only.']);
    }
    return out;
}

export function shaCompare(githubMain, codebergMain) {
    if (!HEX40.test(githubMain ?? '')) return [`GitHub main SHA '${githubMain}' is not a 40-character commit SHA. Next step: re-read the branch head.`];
    if (!HEX40.test(codebergMain ?? '')) return [`Codeberg main SHA '${codebergMain}' is not a 40-character commit SHA. Next step: re-read the mirror branch head.`];
    if (githubMain !== codebergMain) return [`the Codeberg mirror main is ${codebergMain.slice(0, 12)} and GitHub main is ${githubMain.slice(0, 12)}: the mirror lags. Next step: start codeberg-mirror.service on legion and re-run this row.`];
    return [];
}

function listFiles(dir) {
    if (!existsSync(dir)) return [];
    return readdirSync(dir).flatMap(name => {
        const p = join(dir, name);
        return statSync(p).isDirectory() ? listFiles(p) : [p];
    });
}

function quick(root) {
    const failures = [];
    const timerText = readFileSync(join(root, TIMER_REL), 'utf8');
    const serviceText = readFileSync(join(root, SERVICE_REL), 'utf8');
    for (const msg of timerRules(timerText)) failures.push({ file: TIMER_REL, rule: 'timer', msg });
    for (const msg of serviceRules(serviceText)) failures.push({ file: SERVICE_REL, rule: 'service', msg });
    for (const msg of credentialRules(serviceText, root)) failures.push({ file: SERVICE_REL, rule: 'credential', msg });
    const scanned = {};
    for (const d of SCAN_DIRS) {
        for (const p of listFiles(join(root, d))) {
            const rel = p.slice(root.length + 1);
            if (SCAN_EXT.test(rel)) scanned[rel] = readFileSync(p, 'utf8');
        }
    }
    for (const [file, msg] of tokenFailures({ [TIMER_REL]: timerText, [SERVICE_REL]: serviceText }, scanned)) {
        failures.push({ file, rule: 'no-token', msg });
    }
    return failures;
}

function sortFailures(f) {
    return f.sort((a, b) => `${a.file}|${a.rule}|${a.msg}`.localeCompare(`${b.file}|${b.rule}|${b.msg}`));
}

function quickMain() {
    const failures = sortFailures(quick(REPO_ROOT));
    if (failures.length > 0) {
        console.error(`${NAME}: FAIL -- ${failures.length} problem(s) in the legion mirror timer.`);
        failures.forEach(f => console.error(`  ${f.file} [${f.rule}]: ${f.msg}`));
        return 1;
    }
    console.log(`${NAME}: PASS -- ${TIMER_REL} runs daily and persistent; ${SERVICE_REL} is a oneshot that pushes the heads and tags to codeberg; no token material is in the units or the tracked workflow and settings files; the SHA-compare logic is proven on fixtures`);
    return 0;
}

async function liveMain() {
    const slug = slugArg ?? process.env.CODEBERG_MIRROR ?? '';
    if (!/^[^/\s]+\/[^/\s]+$/.test(slug)) {
        console.error(`${NAME}: FAIL -- the Codeberg mirror slug is not declared (got '${slug}'). The owner records owner/repo at the 53-04 checkpoint. Next step: re-run with --slug=owner/repo or CODEBERG_MIRROR=owner/repo.`);
        return 1;
    }
    let codebergMain;
    try {
        const res = await fetch(`https://codeberg.org/api/v1/repos/${slug}/branches/main`, { signal: AbortSignal.timeout(15000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        codebergMain = (await res.json()).commit?.id;
    } catch (e) {
        console.error(`${NAME}: FAIL -- the main branch of ${slug} on Codeberg could not be read (${e.message}). Next step: check the mirror repository exists and is public.`);
        return 1;
    }
    let githubRepo;
    try {
        githubRepo = githubSlugFrom(readFileSync(join(REPO_ROOT, MANIFEST_REL), 'utf8'));
    } catch (e) {
        console.error(`${NAME}: FAIL -- the GitHub repository cannot be derived from ${MANIFEST_REL} urls.release_notes (${e.message.split('\n')[0]}). Next step: restore the release_notes key.`);
        return 1;
    }
    let githubMain;
    try {
        githubMain = execFileSync('gh', ['api', `repos/${githubRepo}/branches/main`, '--jq', '.commit.sha'], { encoding: 'utf8' }).trim();
    } catch (e) {
        console.error(`${NAME}: FAIL -- the main branch of ${githubRepo} could not be read with gh (${e.message.split('\n')[0]}). Next step: run gh auth login.`);
        return 1;
    }
    const failures = shaCompare(githubMain, codebergMain);
    if (failures.length > 0) {
        console.error(`${NAME}: FAIL -- ${failures.join(' ')}`);
        return 1;
    }
    console.log(`${NAME}: PASS -- the Codeberg mirror ${slug} and GitHub main are both at ${githubMain.slice(0, 12)}`);
    return 0;
}

function selfTest(root) {
    const timerText = readFileSync(join(root, TIMER_REL), 'utf8');
    const serviceText = readFileSync(join(root, SERVICE_REL), 'utf8');
    const baseline = sortFailures(quick(root));
    if (baseline.length > 0) {
        console.error(`${NAME}: --self-test FAIL -- the unmodified tree is already red, so the planted-fault results below would mean nothing:`);
        baseline.forEach(f => console.error(`  ${f.file} [${f.rule}]: ${f.msg}`));
        return 1;
    }
    console.log('  ok  baseline -> green (timer, service, token scan)');

    // The live slug follows the manifest: a moved release home moves the derived repository with it.
    const manifestText = readFileSync(join(root, MANIFEST_REL), 'utf8');
    const derived = githubSlugFrom(manifestText);
    let slugFailed = 0;
    if (githubSlugFrom(manifestText.split(derived).join('example-owner/example-repo')) === 'example-owner/example-repo') {
        console.log('  ok  derived GitHub slug follows a moved release home');
    } else {
        console.error(`${NAME}: --self-test FAIL -- the derived GitHub slug did not follow a moved release home`);
        slugFailed += 1;
    }
    try {
        githubSlugFrom('[urls]\nrelease_notes = "https://github.com/"\n');
        console.error(`${NAME}: --self-test FAIL -- a release_notes URL with no owner/repo was accepted`);
        slugFailed += 1;
    } catch {
        console.log("  ok  release_notes with no owner/repo -> red, naming 'owner/repo'");
    }

    const H = 'a'.repeat(40);
    const L = 'b'.repeat(40);
    // [name, red?, the failure texts the probe returns, fragment the red text must name].
    // A red plant passes only when a failure text contains the fragment; a green plant passes only when none is returned.
    const texts = list => list.map(x => (Array.isArray(x) ? x.join(' ') : x));
    const plants = [
        ['lagged SHA pair', true, shaCompare(H, L), 'the mirror lags'],
        ['matching SHA pair', false, shaCompare(H, H), null],
        ['token literal in the service', true, tokenFailures({ [SERVICE_REL]: `${serviceText}\nEnvironment=CODEBERG_TOKEN=abc\n` }, {}), 'names token material'],
        ['credential named for a token, not mirror-push', true, credentialRules(serviceText.replace('LoadCredential=mirror-push:', 'LoadCredential=codeberg:'), root), 'LoadCredential'],
        ['credential source inside the repository', true, credentialRules(serviceText.replace('/etc/codeberg-mirror/mirror-push', `${root}/systemd/mirror-push`), root), 'inside the repository'],
        ['credential source relative', true, credentialRules(serviceText.replace('/etc/codeberg-mirror/mirror-push', 'systemd/mirror-push'), root), 'absolute'],
        ['--prune added to the push', true, serviceRules(serviceText.replace('git push codeberg', 'git push --prune codeberg')), '--prune'],
        ['force refspec added to the push', true, serviceRules(serviceText.replace("'refs/heads/*:refs/heads/*' 'refs/tags", "'+refs/heads/*:refs/heads/*' 'refs/tags")), 'force'],
        ['DynamicUser removed', true, serviceRules(serviceText.replace('DynamicUser=yes\n', '')), 'DynamicUser'],
        ['TimeoutStartSec removed', true, serviceRules(serviceText.replace('TimeoutStartSec=15min\n', '')), 'TimeoutStartSec'],
        ['TimeoutStartSec widened to an hour', true, serviceRules(serviceText.replace('TimeoutStartSec=15min', 'TimeoutStartSec=60min')), 'TimeoutStartSec'],
        ['ProtectSystem dropped', true, serviceRules(serviceText.replace('ProtectSystem=strict\n', '')), 'ProtectSystem'],
        ['address families widened', true, serviceRules(serviceText.replace('AF_INET AF_INET6 AF_UNIX', 'AF_INET AF_INET6 AF_UNIX AF_NETLINK')), 'RestrictAddressFamilies'],
        ['main guard removed', true, serviceRules(serviceText.replace(/ExecStartPre=.*show-ref.*\n/, '')), 'refs/heads/main'],
        ['weekly timer', true, timerRules(timerText.replace('OnCalendar=daily', 'OnCalendar=weekly')), 'OnCalendar'],
        // Anchored on the setting line: the header comment also spells Persistent=true.
        ['Persistent dropped', true, timerRules(timerText.replace('\nPersistent=true\n', '\nPersistent=false\n')), 'Persistent'],
        ['--mirror added', true, serviceRules(serviceText.replace('git push codeberg', 'git push --mirror codeberg')), '--mirror'],
    ];
    let failed = slugFailed;
    for (const [name, red, found, fragment] of plants) {
        const msgs = texts(found);
        const ok = red ? msgs.some(m => m.includes(fragment)) : msgs.length === 0;
        if (!ok) {
            console.error(`${NAME}: --self-test FAIL -- '${name}' did not go ${red ? `red naming '${fragment}'` : 'green'}; got: ${msgs.join(' | ') || '(no failures at all)'}`);
            failed += 1;
        } else {
            console.log(`  ok  ${name} -> ${red ? `red, naming '${fragment}'` : 'green'}`);
        }
    }
    if (failed > 0) return 1;
    console.log(`${NAME}: --self-test PASS -- ${plants.length} checks: lag, token and unit-drift plants went red naming the drift; the matching pair stayed green`);
    return 0;
}

if (args.includes('--self-test')) {
    process.exit(selfTest(REPO_ROOT));
} else if (live) {
    process.exit(await liveMain());
} else {
    process.exit(quickMain());
}
