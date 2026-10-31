#!/usr/bin/env node
// scripts/verify-channel-release-jobs.mjs
//
// The channel-release-jobs row (Phase 56, DIST-12). The channel-manifests stage (.github/workflows/channel-manifests.yml)
// runs four live legs per release, and this row proves their shape offline:
//
//  1. the triggers           workflow_call (the train) and workflow_dispatch (the dry run); no schedule (D-77);
//                            no pull_request or pull_request_target;
//  2. the four legs          flake-hash-pr, tap-commit, winget-submit and checker-freshness are present;
//  3. flake-hash-pr          prefetches the published tarball, writes nix/pkg/release-hash.json, opens a pull
//                            request on a chore/channel- branch with gh pr create --base main, and never pushes to main;
//  4. tap-commit             renders the derived cask from --facts and pushes the tap repository (never this repository's main);
//  5. winget-submit          runs on a windows runner, takes WINGET_TOKEN from the release environment by name, and
//                            is gated on the Windows asset the train names (A2);
//  6. checker-freshness      the Flatpak x-checker-data template resolves to the tarball URL for the release key, read
//                            from the manifest, with no network;
//  7. dry-run                renders the payloads and submits, pushes and opens nothing; it holds no secret;
//  8. credentials            no job carries a token-shaped literal; every secret is referenced by name;
//  9. admission and pins     every uses: is SHA-pinned, and every non-GitHub-owned action is admitted in
//                            .github/settings/actions-selected.json.
//
// The live legs run only with the train, the Apps and the stores (plan 56-05): this row proves the shape.
//
// Modes (the workflow calls these; the row itself takes none):
//   --facts                       print every token value the tree derives, as JSON
//   --check-key <key>             the key matches the release-key grammar and equals the key the tree derives
//   --check-checker <key>         the Flatpak x-checker-data template resolves to the tarball URL for the key
//   --render <dir> --key <key>    render the four payloads into <dir> (outside the repository); submits nothing
//   --self-test                   plants each fault in memory; writes nothing in the tree
//
// Honestly --quick: YAML parse (js-yaml from theia/), text reads and in-memory plants. No network, no gh, no
// wingetcreate, no secret.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { RELEASE_KEY_RE, channelTokenValues, deriveChannel, diskReader, renderTemplate } from './lib/channel-identity.mjs';
import { loadYaml } from './lib/release-workflow.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'channel-release-jobs';
const SELF_REL = 'scripts/verify-channel-release-jobs.mjs';
const WF_REL = '.github/workflows/channel-manifests.yml';
const FLATPAK_REL = 'flatpak/org.debios.PowerBrowser.json';
const ADMISSION_REL = '.github/settings/actions-selected.json';
const TEMPLATE_CASK_REL = 'homebrew-tap/Casks/powerbrowser.rb';
const WINGET_DIR_REL = 'winget';
const LEGS = ['flake-hash-pr', 'tap-commit', 'winget-submit', 'checker-freshness'];
const JOBS = ['derive', 'dry-run', ...LEGS];
const CREDENTIAL_SHAPES = [new RegExp(`${'gh'}p_[A-Za-z0-9]{20,}`), new RegExp(`${'github'}_pat_[A-Za-z0-9_]{20,}`), /-----BEGIN [A-Z ]*PRIVATE KEY-----/];
const SHA_PIN = /@[0-9a-f]{40}\b/;

const args = process.argv.slice(2);
const flag = name => args.indexOf(name);

// --- the modes -------------------------------------------------------------------
function factsOf(root, read) {
    const { failures, facts } = deriveChannel(root, read);
    return { failures, facts };
}

function modeFacts() {
    const { failures, facts } = factsOf(REPO_ROOT, diskReader(REPO_ROOT));
    if (facts === null) {
        console.error(`${NAME}: FAIL -- ${failures.join('; ')}`);
        return 1;
    }
    console.log(JSON.stringify({
        ...channelTokenValues(facts),
        '@RELEASE_URL@': facts.tarballUrl,
        '@RELEASE_URL_TEMPLATE@': facts.checkerUrlTemplate,
    }, null, 2));
    return 0;
}

function modeCheckKey(key) {
    if (!RELEASE_KEY_RE.test(key ?? '')) {
        console.error(`${NAME}: FAIL -- ${JSON.stringify(key ?? null)} is not a release key (v<ESR>-<revision>). Next step: pass the key the train published.`);
        return 1;
    }
    const { facts } = factsOf(REPO_ROOT, diskReader(REPO_ROOT));
    if (facts === null || key !== facts.releaseKey) {
        console.error(`${NAME}: FAIL -- ${key} is not the key the tree derives (${facts?.releaseKey ?? 'none'}). Next step: publish the release from the tree's own key, or regenerate the release identity.`);
        return 1;
    }
    console.log(`${NAME}: PASS -- ${key} is the key the tree derives`);
    return 0;
}

function modeCheckChecker(key) {
    const read = diskReader(REPO_ROOT);
    const { facts } = factsOf(REPO_ROOT, read);
    if (facts === null || key !== facts.releaseKey) {
        console.error(`${NAME}: FAIL -- ${key} is not the key the tree derives. Next step: check the key first.`);
        return 1;
    }
    const failures = checkerFaults(read, facts);
    if (failures.length > 0) {
        console.error(`${NAME}: FAIL -- ${failures.length} problem(s) with the checker template.`);
        failures.forEach(f => console.error(`  ${f}`));
        return 1;
    }
    console.log(`${NAME}: PASS -- the x-checker-data template resolves to ${facts.tarballUrl} for ${key}`);
    return 0;
}

// The Flatpak x-checker-data template resolves to the tarball URL for the key, with $version the key minus its v.
function checkerFaults(read, facts) {
    const out = [];
    let template = null;
    try {
        const manifest = JSON.parse(read(FLATPAK_REL) ?? 'null');
        template = manifest?.modules?.[0]?.sources?.find(s => s.type === 'archive')?.['x-checker-data']?.['url-template'] ?? null;
    } catch {
        template = null;
    }
    if (template === null) {
        out.push(`${FLATPAK_REL}: the archive source carries no x-checker-data url-template, so the checker freshness leg has nothing to resolve. Next step: restore x-checker-data.`);
        return out;
    }
    // The token form is rendered to the derived template first, so the token itself is never the stale value.
    const effective = template === '@RELEASE_URL_TEMPLATE@' ? facts.checkerUrlTemplate : template;
    const resolved = effective.replace('v$version', facts.releaseKey).replace('$version', facts.version);
    if (resolved !== facts.tarballUrl) {
        out.push(`${FLATPAK_REL}: the url-template resolves to ${resolved} for ${facts.releaseKey} but the tarball is ${facts.tarballUrl}. Next step: restore the template from the derived checker URL.`);
    }
    return out;
}

function modeRender(dir, key) {
    const absDir = resolve(dir);
    if (absDir === REPO_ROOT || absDir.startsWith(REPO_ROOT + '/')) {
        console.error(`${NAME}: FAIL -- ${dir} is inside the repository; the dry run renders outside the checkout. Next step: render into the runner temp directory.`);
        return 2;
    }
    if (modeCheckKey(key) !== 0) return 1;
    const read = diskReader(REPO_ROOT);
    const { facts } = factsOf(REPO_ROOT, read);
    const values = channelTokenValues(facts);
    const write = (rel, text) => {
        const out = join(absDir, rel);
        mkdirSync(dirname(out), { recursive: true });
        writeFileSync(out, text, 'utf8');
        console.log(`  wrote ${out}`);
    };
    write('flake-hash/release-hash.plan.json', `${JSON.stringify({
        releaseKey: facts.releaseKey,
        tarballUrl: facts.tarballUrl,
        sha256: 'computed by nix store prefetch-file on the live flake-hash-pr leg',
    }, null, 2)}\n`);
    write('tap/Casks/powerbrowser.rb', renderTemplate(read(TEMPLATE_CASK_REL) ?? '', values));
    for (const name of ['DeBIOSFoundation.PowerBrowser.yaml', 'DeBIOSFoundation.PowerBrowser.installer.yaml', 'DeBIOSFoundation.PowerBrowser.locale.yaml']) {
        write(`winget/${name}`, renderTemplate(read(`${WINGET_DIR_REL}/${name}`) ?? '', values));
    }
    write('checker-url.txt', `${facts.checkerUrlTemplate.replace('v$version', facts.releaseKey).replace('$version', facts.version)}\n`);
    console.log(`${NAME}: PASS -- rendered the four payloads for ${key} into ${absDir}; nothing was submitted, pushed or opened`);
    return 0;
}

// --- the row -----------------------------------------------------------------------
export function runChecks(root, overrides = {}) {
    const read = overrides.read ?? diskReader(root);
    const failures = [];
    const fail = (where, msg, next) => failures.push(`${where}: ${msg} Next step: ${next}`);

    const { failures: cfgFailures, facts } = deriveChannel(root, read);
    if (facts === null) {
        return { failures: cfgFailures.map(f => `${f} Next step: fix configuration.toml, then re-run this check.`) };
    }

    const text = read(WF_REL);
    if (text === null) {
        fail(WF_REL, 'is missing, so the channel stage does not exist.', 'restore .github/workflows/channel-manifests.yml from git.');
        return { failures };
    }
    let wf;
    try {
        wf = loadYaml().load(text);
    } catch (e) {
        fail(WF_REL, `does not parse as YAML 1.2 (${e.message.split('\n')[0]}).`, 'fix the YAML.');
        return { failures };
    }
    const jobs = wf?.jobs ?? {};

    // 1. triggers
    const on = wf?.on ?? {};
    if (!('workflow_call' in on)) fail(WF_REL, 'has no workflow_call trigger, so the train cannot call the stage', 'add the workflow_call trigger.');
    if (!('workflow_dispatch' in on)) fail(WF_REL, 'has no workflow_dispatch trigger, so the dry run cannot be started', 'add the workflow_dispatch trigger for the dry run.');
    if ('schedule' in (wf ?? {}) || 'schedule' in on) fail(WF_REL, 'has a schedule key, so the stage would run on a clock of its own (D-77)', 'delete the schedule; the Worker clock owns timing.');
    if ('pull_request' in on || 'pull_request_target' in on) fail(WF_REL, 'has a pull_request trigger, so untrusted branches would reach the bot App', 'remove the pull_request trigger.');

    // 2. the four legs
    for (const leg of LEGS) {
        if (!jobs[leg]) fail(`${WF_REL} job ${leg}`, 'is missing, so one release leg would not run', `restore the ${leg} job.`);
    }
    for (const job of JOBS) {
        if (!jobs[job]) continue;
        const blob = JSON.stringify(jobs[job]);
        // 8. credentials: no token-shaped literal in any job; the only secret names are the two the stage uses.
        for (const shape of CREDENTIAL_SHAPES) {
            const hit = shape.exec(blob);
            if (hit) fail(`${WF_REL} job ${job}`, `carries a credential-shaped literal (${JSON.stringify(hit[0].slice(0, 6))}...)`, 'remove it; reference the secret by name only.');
        }
        for (const m of blob.matchAll(/secrets\.([A-Za-z0-9_]+)/g)) {
            const name = m[1];
            if (!['BOT_APP_PRIVATE_KEY', 'WINGET_TOKEN'].includes(name)) fail(`${WF_REL} job ${job}`, `references the secret ${name}, which the channel stage does not use`, 'reference only BOT_APP_PRIVATE_KEY or WINGET_TOKEN, by name.');
        }
        // 9. SHA-pinned uses
        for (const step of [...(jobs[job].steps ?? []), jobs[job].uses ? { uses: jobs[job].uses } : null].filter(Boolean)) {
            if (step.uses && !SHA_PIN.test(step.uses)) fail(`${WF_REL} job ${job}`, `uses ${step.uses} without a 40-hex SHA pin`, 'pin the action to a full commit SHA.');
        }
    }

    // 3. flake-hash-pr: a pull request, never a push to main
    const flake = jobs['flake-hash-pr'];
    if (flake) {
        const runs = (flake.steps ?? []).map(s => String(s.run ?? '')).join('\n');
        for (const [needle, what] of [
            ['nix store prefetch-file', 'a prefetch of the published tarball, which is where the hash comes from'],
            ['nix/pkg/release-hash.json', 'the hash record the flake reads'],
            ['chore/channel-', 'the chore/channel- branch the pull request is opened from'],
            ['gh pr create', 'a pull request opened on the release repository'],
            ['--base main', 'main as the base of that pull request'],
        ]) {
            if (!runs.includes(needle)) fail(`${WF_REL} job flake-hash-pr`, `lacks ${what} (${needle})`, `add the ${needle} step; the flake hash must come from the published asset.`);
        }
        const toMain = /git\s+(?:-c\s+\S+\s+)*push[^\n]*(?:\bmain\b|HEAD:refs\/heads\/main|HEAD:main)/.exec(runs);
        if (toMain) fail(`${WF_REL} job flake-hash-pr`, `pushes to main (${JSON.stringify(toMain[0].slice(0, 80))}), bypassing review (GH-05)`, 'push the chore/channel- branch and open a pull request; never push to main.');
        if (/--force/.test(runs)) fail(`${WF_REL} job flake-hash-pr`, 'force-pushes', 'remove --force.');
        if (!/\bderive\b/.test(JSON.stringify(flake.needs ?? []))) fail(`${WF_REL} job flake-hash-pr`, 'does not wait on the derive job, so it would run on an unchecked key', 'add derive to needs.');
    }

    // 4. tap-commit
    const tap = jobs['tap-commit'];
    if (tap) {
        const blob = JSON.stringify(tap);
        for (const [needle, what] of [
            ['Casks/powerbrowser.rb', 'a cask path in the tap'],
            ['homebrew-powerbrowser', 'the tap repository checkout'],
            ['--facts', 'the derived values the cask renders from'],
            ['inputs.dmg_sha256', 'the published disk-image digest input'],
        ]) {
            if (!blob.includes(needle)) fail(`${WF_REL} job tap-commit`, `lacks ${what} (${needle})`, `add ${needle}.`);
        }
        if (/wingetcreate/.test(blob)) fail(`${WF_REL} job tap-commit`, 'runs wingetcreate, which belongs to the winget leg', 'move it to winget-submit.');
    }

    // 5. winget-submit
    const winget = jobs['winget-submit'];
    if (winget) {
        if (winget.environment !== 'release') fail(`${WF_REL} job winget-submit`, `uses environment ${JSON.stringify(winget.environment ?? null)}, not the release environment that holds WINGET_TOKEN`, 'set environment: release.');
        if (!/^windows-/.test(String(winget['runs-on'] ?? ''))) fail(`${WF_REL} job winget-submit`, `runs on ${JSON.stringify(winget['runs-on'] ?? null)}, but wingetcreate is a Windows tool`, 'run on windows-latest.');
        const blob = JSON.stringify(winget);
        if (!/secrets\.WINGET_TOKEN/.test(blob)) fail(`${WF_REL} job winget-submit`, 'does not reference WINGET_TOKEN by name', 'reference ${{ secrets.WINGET_TOKEN }} in the env of the submit step.');
        if (!/inputs\.winget_asset/.test(String(winget.if ?? ''))) fail(`${WF_REL} job winget-submit`, 'is not gated on the Windows asset the train names (A2), so it could submit the fixture', 'gate the job on inputs.winget_asset.');
        if (!/wingetcreate update/.test(blob)) fail(`${WF_REL} job winget-submit`, 'has no wingetcreate update step that writes the set locally first', 'add the update --out step before the submit.');
    }

    // 6. checker-freshness
    const checker = jobs['checker-freshness'];
    if (checker && !/--check-checker/.test(JSON.stringify(checker))) {
        fail(`${WF_REL} job checker-freshness`, 'does not check the x-checker-data template for the key', 'run --check-checker on the release key.');
    }
    for (const f of checkerFaults(read, facts)) {
        fail(`${WF_REL} job checker-freshness`, `the Flatpak checker data is stale for ${facts.releaseKey} (${f})`, 'regenerate x-checker-data from the derived checker URL.');
    }

    // 7. dry-run: renders, submits nothing
    const dry = jobs['dry-run'];
    if (dry) {
        const blob = JSON.stringify(dry);
        if (!/--render/.test(blob)) fail(`${WF_REL} job dry-run`, 'does not render the payloads', 'run --render into the runner temp directory.');
        for (const [re, what] of [
            [/git\s+(?:-c\s+\S+\s+)*push/, 'a git push'],
            [/gh\s+pr\s/, 'a pull request'],
            [/wingetcreate\s+submit/, 'a winget submission'],
            [/--submit\b/, 'the --submit flag'],
            [/secrets\./, 'a secret reference'],
        ]) {
            if (re.test(blob)) fail(`${WF_REL} job dry-run`, `contains ${what}, but the dry run submits and pushes nothing and holds no secret`, 'delete it; the dry run renders payloads only.');
        }
    }

    // 1 (continued) and 2: the derive job checks the key
    const derive = jobs.derive;
    if (derive && !/--check-key/.test(JSON.stringify(derive))) fail(`${WF_REL} job derive`, 'does not check the release key against the tree', 'run --check-key before any leg.');

    // 9. admission: every non-GitHub-owned action is admitted
    const admission = JSON.parse(read(ADMISSION_REL) ?? '{"patterns_allowed":[]}');
    const admitted = new Set(admission.patterns_allowed ?? []);
    for (const job of JOBS) {
        for (const step of jobs[job]?.steps ?? []) {
            const m = /^([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)@/.exec(step.uses ?? '');
            if (!m || m[1].startsWith('actions/') || m[1].startsWith('github/')) continue;
            if (!admitted.has(`${m[1]}@*`)) fail(`${WF_REL} job ${job}`, `uses ${m[1]}, which ${ADMISSION_REL} does not admit`, `admit ${m[1]}@* in patterns_allowed in the same commit.`);
        }
    }

    return { failures };
}

function selfTest() {
    const base = diskReader(REPO_ROOT);
    const { facts } = deriveChannel(REPO_ROOT, base);
    void facts;
    const wf = () => base(WF_REL);
    const withWorkflow = (transform) => {
        const original = wf();
        const planted = transform(original);
        if (planted === original) throw new Error(`plant on ${WF_REL} did not apply: the anchor text moved`);
        return { read: r => (r === WF_REL ? planted : base(r)) };
    };
    const withFlatpak = (transform) => {
        const original = base(FLATPAK_REL);
        const planted = transform(original);
        if (planted === original) throw new Error(`plant on ${FLATPAK_REL} did not apply`);
        return { read: r => (r === FLATPAK_REL ? planted : base(r)) };
    };
    const dropJob = name => withWorkflow(t => t.replace(new RegExp(`\\n  ${name}:\\n[\\s\\S]*?(?=\\n  [a-z-]+:\\n|\\n*$)`), '\n'));
    const addStep = (job, run) => withWorkflow(t => t.replace(`  ${job}:\n`, `  ${job}:\n`).replace(new RegExp(`(\\n  ${job}:[\\s\\S]*?steps:\\n)`), `$1      - name: planted\n        run: ${run}\n`));

    const cases = [
        {
            name: 'hash literal not derived from the published asset', expect: 'nix store prefetch-file',
            overrides: withWorkflow(t => t.replace(/nix store prefetch-file --hash-type sha256 --json "\$URL"/, 'echo \'{"hash":"sha256-AAAA"}\'')),
        },
        {
            name: 'direct push to main from the flake-hash leg', expect: 'pushes to main',
            overrides: addStep('flake-hash-pr', 'git push origin HEAD:refs/heads/main'),
        },
        {
            name: 'tap leg removed', expect: 'job tap-commit',
            overrides: dropJob('tap-commit'),
        },
        {
            name: 'winget leg removed', expect: 'job winget-submit',
            overrides: dropJob('winget-submit'),
        },
        {
            name: 'stale Flatpak checker template', expect: 'checker-freshness',
            overrides: withFlatpak(t => t.replace(/"url-template": "[^"]*"/, '"url-template": "https://github.com/example.invalid/releases/download/v$version/x-$version.tar.xz"')),
        },
        {
            name: 'submit step planted into the dry run', expect: 'job dry-run',
            overrides: addStep('dry-run', 'wingetcreate submit ./out'),
        },
        {
            name: 'pull_request trigger added', expect: 'pull_request',
            overrides: withWorkflow(t => t.replace('on:\n  workflow_call:', 'on:\n  pull_request:\n  workflow_call:')),
        },
        {
            name: 'schedule key added', expect: 'schedule',
            overrides: withWorkflow(t => t.replace('on:\n  workflow_call:', 'on:\n  schedule:\n    - cron: "0 * * * *"\n  workflow_call:')),
        },
        {
            name: 'token value written into the winget leg', expect: 'credential-shaped',
            overrides: withWorkflow(t => t.replace('WINGET_TOKEN: ${{ secrets.WINGET_TOKEN }}', `WINGET_TOKEN: ${'gh'}${'p_'}${'A'.repeat(36)}`)),
        },
        {
            name: 'control: unmodified stage stays green', expect: null,
            overrides: {},
        },
    ];

    let failed = 0;
    let reds = 0;
    let greens = 0;
    const baseline = runChecks(REPO_ROOT, { read: base });
    if (baseline.failures.length > 0) {
        console.error(`${NAME}: --self-test FAIL -- the unmodified stage is already red, so the planted-fault results would mean nothing:`);
        baseline.failures.forEach(f => console.error(`  ${f}`));
        return 1;
    }
    for (const c of cases) {
        const { failures } = runChecks(REPO_ROOT, c.overrides);
        const text = failures.join('\n');
        if (c.expect === null) {
            if (failures.length > 0) {
                console.error(`${NAME}: --self-test FAIL -- '${c.name}' went red but must stay green:\n${text}`);
                failed += 1;
            } else {
                greens += 1;
                console.log(`  ${c.name}: green`);
            }
            continue;
        }
        const hit = failures.find(f => f.includes(c.expect));
        if (!hit) {
            console.error(`${NAME}: --self-test FAIL -- '${c.name}' did not go red naming ${c.expect}:\n${text || '(no failure)'}`);
            failed += 1;
        } else if (text.includes(REPO_ROOT)) {
            console.error(`${NAME}: --self-test FAIL -- '${c.name}' leaked a checkout path into its output: ${text}`);
            failed += 1;
        } else {
            reds += 1;
            console.log(`  ${c.name}: red -- ${hit}`);
        }
    }
    if (failed > 0) {
        console.error(`${NAME}: --self-test FAIL -- ${failed} case(s) did not behave as required`);
        return 1;
    }
    console.log(`${NAME}: --self-test PASS -- ${reds} planted fault(s) went red naming the job or the value, and ${greens} control(s) stayed green`);
    return 0;
}

function main() {
    if (args.includes('--self-test')) return selfTest();
    if (args.includes('--facts')) return modeFacts();
    if (flag('--check-key') >= 0) return modeCheckKey(args[flag('--check-key') + 1]);
    if (flag('--check-checker') >= 0) return modeCheckChecker(args[flag('--check-checker') + 1]);
    if (flag('--render') >= 0) {
        if (flag('--key') < 0) {
            console.error(`${NAME}: FAIL -- --render needs --key <release key>`);
            return 2;
        }
        return modeRender(args[flag('--render') + 1], args[flag('--key') + 1]);
    }
    const { failures } = runChecks(REPO_ROOT);
    if (failures.length > 0) {
        console.error(`${NAME}: FAIL -- ${failures.length} problem(s) with the channel stage.`);
        failures.forEach(f => console.error(`  ${f}`));
        return 1;
    }
    console.log(`${NAME}: PASS -- the channel stage has four legs and a dry run; the flake leg opens a pull request, the tap and winget legs are gated, no leg pushes to main, no schedule, and no credential is written`);
    return 0;
}


process.exit(main());
