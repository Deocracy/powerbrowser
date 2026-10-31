#!/usr/bin/env node
// scripts/verify-channel-release-jobs.mjs
//
// The channel-release-jobs row (Phase 56, DIST-12). The channel-manifests stage (.github/workflows/channel-manifests.yml)
// runs a derive job, a verify-assets job, four live legs and a dry run per release. The row parses the workflow as
// YAML and checks its structure (scripts/lib/channel-workflow-rules.mjs lists every rule, and each rule has a plant
// in --self-test): the triggers and boolean live and dry_run inputs; the job gates (never github.event_name); the exact
// permission map and environment of each job (bot, bot, winget; never release); the order of the --release steps
// against the push or the submission; the App token repositories and permission-* keys; the attestation pins; the
// wingetcreate pin and the single step that holds WINGET_TOKEN; quoted git push forms parsed after stripping -c
// options; no sed and no expression inside a run script; SHA pins and the admission list.
//
// The live legs run only with the train, the Apps and the stores (plan 56-05): this row proves the shape.
//
// Modes (the workflow calls these; the row itself takes none):
//   --facts                       print every token value the tree derives, as JSON
//   --check-key <key>             the key matches the release-key grammar and equals the key the tree derives
//   --check-inputs                validate the stage inputs, read from the environment (KEY, LIVE, TARBALL_SHA,
//                                 DMG_ASSET, DMG_SHA, WINGET_ASSET, WINGET_SHA): names and digests, never a program
//   --check-asset <kind> <file> <sums>   recompute the digest of a downloaded asset (kind tarball, dmg or installer),
//                                 compare it with SHA256SUMS and with EXPECT_SHA, and print it; ASSET_NAME names the asset
//   --render-live <tap|winget> <out>     render the tracked cask (out is a file) or winget set (out is a directory)
//                                 with ASSET_NAME and ASSET_SHA from the environment; a left-over token fails
//   --check-checker <key>         the Flatpak x-checker-data template resolves to the tarball URL for the key
//   --render <dir> --key <key>    render the four payloads into <dir> (outside the repository); submits nothing
//   --self-test                   plants each fault in memory; writes nothing in the tree
//
// Honestly --quick: YAML parse (js-yaml from theia/), text reads and in-memory plants. No network, no gh, no
// wingetcreate, no secret.

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { RELEASE_KEY_RE, channelTokenValues, deriveChannel, diskReader, renderTemplate } from './lib/channel-identity.mjs';
import { assetNameFault, checkAsset, digestFault, inputFaults, renderLive } from './lib/channel-render.mjs';
import { workflowFaults } from './lib/channel-workflow-rules.mjs';
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
        '@TARBALL_ASSET@': facts.tarballName,
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

function modeCheckInputs() {
    const { facts } = factsOf(REPO_ROOT, diskReader(REPO_ROOT));
    if (facts === null) {
        console.error(`${NAME}: FAIL -- the release identity does not derive. Next step: fix configuration.toml.`);
        return 1;
    }
    const faults = inputFaults(process.env, facts);
    if (faults.length > 0) {
        console.error(`${NAME}: FAIL -- ${faults.length} stage input(s) rejected.`);
        faults.forEach(f => console.error(`  ${f}. Next step: pass a plain asset name and a 64-character lowercase SHA-256 from the Release.`));
        return 1;
    }
    console.log(`${NAME}: PASS -- the stage inputs are plain names and 64-character digests`);
    return 0;
}

function modeCheckAsset(kind, file, sums) {
    const { facts } = factsOf(REPO_ROOT, diskReader(REPO_ROOT));
    if (facts === null) {
        console.error(`${NAME}: FAIL -- the release identity does not derive. Next step: fix configuration.toml.`);
        return 1;
    }
    let bytes;
    let sumsText;
    try {
        bytes = readFileSync(file);
        sumsText = readFileSync(sums, 'utf8');
    } catch (e) {
        console.error(`${NAME}: FAIL -- cannot read the downloaded asset or SHA256SUMS (${e.code ?? e.message}). Next step: download the Release asset first.`);
        return 1;
    }
    const { failures, hex } = checkAsset({ kind, name: process.env.ASSET_NAME, expect: process.env.EXPECT_SHA, bytes, sumsText, facts });
    if (failures.length > 0) {
        failures.forEach(f => console.error(`${NAME}: FAIL -- ${f}. Next step: do not publish; compare the Release asset, its SHA256SUMS and the digest the train passed.`));
        return 1;
    }
    console.log(hex);
    return 0;
}

function modeRenderLive(leg, out) {
    const read = diskReader(REPO_ROOT);
    const { facts } = factsOf(REPO_ROOT, read);
    if (facts === null || out === undefined) {
        console.error(`${NAME}: FAIL -- the release identity does not derive, or --render-live has no output path. Next step: pass <tap|winget> <out>.`);
        return 1;
    }
    const kind = leg === 'tap' ? 'dmg' : 'installer';
    const asset = process.env.ASSET_NAME;
    const sha = process.env.ASSET_SHA;
    const faults = [assetNameFault(kind, asset, facts), digestFault('the verified digest', sha)].filter(Boolean);
    if (faults.length > 0) {
        faults.forEach(f => console.error(`${NAME}: FAIL -- ${f}. Next step: pass the asset name and the digest the verify-assets job printed.`));
        return 1;
    }
    let files;
    try {
        files = renderLive(leg, facts, read, { asset, sha });
    } catch (e) {
        console.error(`${NAME}: FAIL -- ${e.message}. Next step: restore the tracked template and its tokens.`);
        return 1;
    }
    for (const [file, text] of Object.entries(files)) {
        const target = leg === 'tap' ? resolve(out) : join(resolve(out), file);
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, text, 'utf8');
        console.log(`  wrote ${target}`);
    }
    console.log(`${NAME}: PASS -- rendered the ${leg} payload for ${facts.releaseKey} from the tracked template; no token is left over`);
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
    // The structural rules (WR-09): parsed YAML, not substrings. See scripts/lib/channel-workflow-rules.mjs.
    const admission = JSON.parse(read(ADMISSION_REL) ?? '{"patterns_allowed":[]}');
    const admitted = new Set(admission.patterns_allowed ?? []);
    for (const f of workflowFaults(wf, { admitted })) fail(`${WF_REL} ${f.where}`, f.msg + '.', f.next.replace(/\.$/, '') + '.');
    const jobs = wf?.jobs ?? {};

    // The Flatpak checker template resolves to the tarball URL for the key (the Flatpak side of the checker leg).
    if (jobs['checker-freshness']) {
        for (const f of checkerFaults(read, facts)) {
            fail(`${WF_REL} job checker-freshness`, `the Flatpak checker data is stale for ${facts.releaseKey} (${f})`, 'regenerate x-checker-data from the derived checker URL.');
        }
    }

    return { failures };
}

function selfTest() {
    const base = diskReader(REPO_ROOT);
    const { facts } = deriveChannel(REPO_ROOT, base);
    void facts;
    // A plant is a structural edit of the parsed workflow, dumped back to YAML (never a text patch that could miss
    // its anchor). mutate(doc) edits the document; the helper functions find a step by a word in its run text.
    const yaml = loadYaml();
    const withDoc = (mutate) => {
        const doc = yaml.load(base(WF_REL));
        mutate(doc);
        return { read: r => (r === WF_REL ? yaml.dump(doc, { lineWidth: -1 }) : base(r)) };
    };
    const stepWith = (doc, job, re) => {
        const step = doc.jobs[job].steps.find(x => re.test(String(x.run ?? x.name ?? '')));
        if (!step) throw new Error(`plant anchor ${re} is absent from job ${job}`);
        return step;
    };
    const appStep = (doc, job) => doc.jobs[job].steps.find(x => /^actions\/create-github-app-token@/.test(x.uses ?? ''));
    const dropStep = (job, re) => withDoc(d => { d.jobs[job].steps = d.jobs[job].steps.filter(x => !re.test(String(x.run ?? ''))); });
    const editRun = (job, re, from, to) => withDoc(d => {
        const st = stepWith(d, job, re);
        if (!st.run.includes(from)) throw new Error(`plant anchor ${from} is absent from job ${job}`);
        st.run = st.run.replace(from, to);
    });
    const withFlatpak = (transform) => {
        const original = base(FLATPAK_REL);
        const planted = transform(original);
        if (planted === original) throw new Error(`plant on ${FLATPAK_REL} did not apply`);
        return { read: r => (r === FLATPAK_REL ? planted : base(r)) };
    };
    const dropJob = name => withDoc(d => { delete d.jobs[name]; });
    const PLANT_PUSH = 'git -c "http.https://github.com/.extraheader=AUTHORIZATION: basic $AUTH" push origin "HEAD:refs/heads/main"';

    const cases = [
        // A. the workflow
        { name: 'pull_request trigger added', expect: 'pull_request', overrides: withDoc(d => { d.on.pull_request = null; }) },
        { name: 'schedule key added', expect: 'schedule', overrides: withDoc(d => { d.on.schedule = [{ cron: '0 * * * *' }]; }) },
        { name: 'live input removed', expect: 'input live', overrides: withDoc(d => { delete d.on.workflow_call.inputs.live; }) },
        { name: 'digest input typed as a boolean', expect: 'input tarball_sha256', overrides: withDoc(d => { d.on.workflow_call.inputs.tarball_sha256.type = 'boolean'; }) },
        { name: 'concurrency removed', expect: 'concurrency', overrides: withDoc(d => { delete d.concurrency; }) },
        { name: 'cancel-in-progress true', expect: 'concurrency', overrides: withDoc(d => { d.concurrency['cancel-in-progress'] = true; }) },
        { name: 'bash default shell removed (no pipefail)', expect: 'pipefail', overrides: withDoc(d => { delete d.defaults; }) },
        { name: 'workflow-level write permission', expect: 'workflow-level permissions', overrides: withDoc(d => { d.permissions = { contents: 'write' }; }) },
        // B. every job: gate, permissions, environment, needs, pins
        { name: 'github.event_name gate on a live leg (CR-01)', expect: 'github.event_name', overrides: withDoc(d => { d.jobs['flake-hash-pr'].if = "${{ github.event_name == 'workflow_call' }}"; }) },
        { name: 'live leg without the live input', expect: 'not gated on inputs.live', overrides: withDoc(d => { d.jobs['flake-hash-pr'].if = '${{ !inputs.dry_run }}'; }) },
        { name: 'live leg without the dry_run negation', expect: 'not gated on !inputs.dry_run', overrides: withDoc(d => { d.jobs['tap-commit'].if = "${{ inputs.live && inputs.dmg_asset != '' }}"; }) },
        { name: 'dry-run job gated live-only', expect: 'not gated on !inputs.live || inputs.dry_run', overrides: withDoc(d => { d.jobs['dry-run'].if = '${{ inputs.live }}'; }) },
        { name: 'tap leg not gated on the macOS asset', expect: 'macOS asset', overrides: withDoc(d => { d.jobs['tap-commit'].if = '${{ inputs.live && !inputs.dry_run }}'; }) },
        { name: 'winget leg not gated on the Windows asset', expect: 'Windows asset', overrides: withDoc(d => { d.jobs['winget-submit'].if = '${{ inputs.live && !inputs.dry_run }}'; }) },
        { name: 'contents write on the derive job', expect: 'job derive: holds permissions', overrides: withDoc(d => { d.jobs.derive.permissions.contents = 'write'; }) },
        { name: 'id-token write on the winget leg', expect: 'job winget-submit: holds permissions', overrides: withDoc(d => { d.jobs['winget-submit'].permissions = { 'id-token': 'write' }; }) },
        { name: 'winget leg back in the release environment', expect: 'release environment holds the signing key', overrides: withDoc(d => { d.jobs['winget-submit'].environment = 'release'; }) },
        { name: 'flake leg without the bot environment', expect: 'job flake-hash-pr: uses environment null', overrides: withDoc(d => { delete d.jobs['flake-hash-pr'].environment; }) },
        { name: 'needs derive removed from the tap leg', expect: 'does not wait on the derive job', overrides: withDoc(d => { d.jobs['tap-commit'].needs = ['verify-assets']; }) },
        { name: 'needs verify-assets removed from the winget leg', expect: 'does not wait on verify-assets', overrides: withDoc(d => { d.jobs['winget-submit'].needs = ['derive']; }) },
        { name: 'winget leg on a Linux runner', expect: 'wingetcreate is a Windows tool', overrides: withDoc(d => { d.jobs['winget-submit']['runs-on'] = 'ubuntu-latest'; }) },
        { name: 'checkout that persists the token', expect: 'persist-credentials', overrides: withDoc(d => { delete d.jobs.derive.steps[0].with['persist-credentials']; }) },
        { name: 'action without a SHA pin', expect: '40-hex SHA pin', overrides: withDoc(d => { d.jobs.derive.steps[0].uses = 'actions/checkout@v4'; }) },
        { name: 'third-party action the admission does not list', expect: 'does not admit', overrides: withDoc(d => { d.jobs.derive.steps.push({ uses: `foo/bar@${'a'.repeat(40)}` }); }) },
        { name: 'sed used on a caller value', expect: 'runs sed', overrides: withDoc(d => { d.jobs['tap-commit'].steps.push({ run: 'sed -f "$RUNNER_TEMP/render.sed" a > b' }); }) },
        { name: 'expression placed inside a run script', expect: 'expression inside a run', overrides: withDoc(d => { d.jobs.derive.steps.push({ run: 'echo ${{ inputs.winget_asset }}' }); }) },
        { name: 'credential-shaped literal in the winget leg', expect: 'credential-shaped', overrides: withDoc(d => { stepWith(d, 'winget-submit', /submit --prtitle/).env.WINGET_CREATE_GITHUB_TOKEN = `${'gh'}${'p_'}${'A'.repeat(36)}`; }) },
        { name: 'secret the stage does not use', expect: 'DOCKER_PASSWORD', overrides: withDoc(d => { d.jobs.derive.steps[1].env.X = '${{ secrets.DOCKER_PASSWORD }}'; }) },
        { name: 'BOT_APP_PRIVATE_KEY read outside the App-token step', expect: 'outside its one place', overrides: withDoc(d => { d.jobs['tap-commit'].steps.push({ run: 'true', env: { K: '${{ secrets.BOT_APP_PRIVATE_KEY }}' } }); }) },
        { name: 'leg removed: tap', expect: 'job tap-commit: is missing', overrides: dropJob('tap-commit') },
        { name: 'leg removed: winget', expect: 'job winget-submit: is missing', overrides: dropJob('winget-submit') },
        // derive and verify-assets
        { name: 'input validation removed from derive', expect: 'does not validate the inputs', overrides: editRun('derive', /check-inputs/, 'node scripts/verify-channel-release-jobs.mjs --check-inputs\n', '') },
        { name: 'attestation signer pin dropped', expect: '--signer-workflow', overrides: editRun('verify-assets', /attestation verify/, '--signer-workflow "$SIGNER"', '') },
        { name: 'attestation source ref dropped', expect: '--source-ref refs/heads/main', overrides: editRun('verify-assets', /attestation verify/, '--source-ref refs/heads/main', '') },
        { name: 'digest recompute removed from verify-assets', expect: 'recompute the Linux tarball digest', overrides: editRun('verify-assets', /attestation verify/, 'echo "tarball=$(check tarball "$TARBALL" "$TARBALL_SHA")" >> "$GITHUB_OUTPUT"\n', '') },
        // D. flake-hash-pr
        { name: 'hash not derived from the published asset (prefetch removed)', expect: 'nix store prefetch-file', overrides: editRun('flake-hash-pr', /prefetch-file/, 'nix store prefetch-file --hash-type sha256 --json "$URL"', "echo '{\"hash\":\"sha256-AAAA\"}'") },
        { name: 'optional digest guard reintroduced', expect: 'optional guard', overrides: editRun('flake-hash-pr', /prefetch-file/, 'WANT=', 'if [ -n "$TARBALL_SHA" ]; then :; fi; WANT=') },
        { name: 'verify-flake-repack --release deleted', expect: 'verify-flake-repack.mjs --release', overrides: editRun('flake-hash-pr', /prefetch-file/, '          node scripts/verify-flake-repack.mjs --release\n'.trim(), 'true') },
        { name: 'direct push to main, the quoted extraheader form', expect: 'pushes to main', overrides: withDoc(d => { d.jobs['flake-hash-pr'].steps.push({ run: PLANT_PUSH }); }) },
        { name: 'direct push to main, the bare form', expect: 'pushes to main', overrides: withDoc(d => { d.jobs['flake-hash-pr'].steps.push({ run: 'git push origin HEAD:main' }); }) },
        { name: 'force push in the flake leg', expect: 'force-pushes', overrides: withDoc(d => { d.jobs['flake-hash-pr'].steps.push({ run: 'git push --force origin HEAD:refs/heads/chore/channel-x' }); }) },
        { name: 'idempotency checks removed from the flake leg', expect: 'not idempotent', overrides: editRun('flake-hash-pr', /gh pr create/, 'gh pr list', 'gh pr view') },
        { name: 'flake App token widened with workflows write', expect: 'permission-workflows', overrides: withDoc(d => { appStep(d, 'flake-hash-pr').with['permission-workflows'] = 'write'; }) },
        { name: 'tap App token minted for the release repository', expect: 'repositories "powerbrowser"', overrides: withDoc(d => { appStep(d, 'tap-commit').with.repositories = 'powerbrowser'; }) },
        // E. tap-commit
        { name: 'cask release check deleted', expect: 'verify-homebrew-cask.mjs --release --rendered', overrides: dropStep('tap-commit', /verify-homebrew-cask/) },
        { name: 'cask pushed before the release check', expect: 'runs the release check out of order', overrides: withDoc(d => { const s = d.jobs['tap-commit'].steps; const i = s.findIndex(x => /verify-homebrew-cask/.test(x.run ?? '')); s.push(s.splice(i, 1)[0]); }) },
        { name: 'cask rendered without --render-live', expect: '--render-live tap', overrides: dropStep('tap-commit', /--render-live tap/) },
        // F. winget-submit
        { name: 'wingetcreate left unpinned', expect: 'does not pin wingetcreate', overrides: withDoc(d => { d.jobs['winget-submit'].env.WINGETCREATE_VERSION = 'latest'; }) },
        { name: 'wingetcreate installed with winget install', expect: 'winget install', overrides: withDoc(d => { d.jobs['winget-submit'].steps.push({ run: 'winget install --id Microsoft.WingetCreate' }); }) },
        { name: 'token passed with --token', expect: '--token', overrides: editRun('winget-submit', /submit --prtitle/, '--no-open', '--no-open --token "$WINGET_CREATE_GITHUB_TOKEN"') },
        { name: 'WINGET_TOKEN in the install step env', expect: 'outside its one place', overrides: withDoc(d => { stepWith(d, 'winget-submit', /wingetcreate\.exe"/).env = { WINGET_CREATE_GITHUB_TOKEN: '${{ secrets.WINGET_TOKEN }}' }; }) },
        { name: 'winget set not rendered from the tracked files', expect: '--render-live winget', overrides: dropStep('winget-submit', /--render-live winget/) },
        { name: 'rendered winget set not checked', expect: 'verify-winget-manifest.mjs --release --rendered', overrides: editRun('winget-submit', /--render-live winget/, 'node scripts/verify-winget-manifest.mjs --release --rendered "$RUNNER_TEMP/winget"', 'true') },
        // G. dry-run and H. checker
        { name: 'submit step planted into the dry run', expect: 'winget submission', overrides: withDoc(d => { d.jobs['dry-run'].steps.push({ run: 'wingetcreate submit ./out' }); }) },
        { name: 'git push planted into the dry run', expect: 'job dry-run: runs a git push', overrides: withDoc(d => { d.jobs['dry-run'].steps.push({ run: 'git push origin HEAD:refs/heads/x' }); }) },
        { name: 'checker leg without --check-checker', expect: '--check-checker', overrides: editRun('checker-freshness', /check-checker/, '--check-checker', '--check-key') },
        { name: 'stale Flatpak checker template', expect: 'checker-freshness', overrides: withFlatpak(t => t.replace(/"url-template": "[^"]*"/, '"url-template": "https://github.com/example.invalid/releases/download/v$version/x-$version.tar.xz"')) },
        { name: 'control: unmodified stage stays green', expect: null, overrides: {} },
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
    // The input, asset and render functions the live legs call (CR-02, WR-01, WR-02): pure, so planted directly.
    const f = deriveChannel(REPO_ROOT, base).facts;
    const bytes = Buffer.from('release asset bytes\n');
    const hex = createHash('sha256').update(bytes).digest('hex');
    const dmgAsset = `${f.app}-${f.version}.macos-universal.dmg`;
    const sums = `${hex}  ${f.tarballName}\n${'f'.repeat(64)}  ${dmgAsset}\n`;
    const asset = over => checkAsset({ kind: 'tarball', name: f.tarballName, expect: hex, bytes, sumsText: sums, facts: f, ...over }).failures;
    const inputs = env => inputFaults({ LIVE: 'true', TARBALL_SHA: hex, ...env }, f);
    const injected = 'x|g;1e id>/tmp/pwn;s|a|b';
    const pure = [
        ['asset: recomputed digest equals SHA256SUMS and the caller digest', () => asset({}), null],
        ['asset: caller digest differs from the recomputed one', () => asset({ expect: '0'.repeat(64) }), 'the caller supplied'],
        ['asset: SHA256SUMS lists another digest for the name', () => asset({ sumsText: `${'0'.repeat(64)}  ${f.tarballName}\n` }), 'SHA256SUMS lists'],
        ['asset: name absent from SHA256SUMS', () => asset({ sumsText: `${hex}  other.tar.xz\n` }), 'zero or several times'],
        ['asset: the caller digest is injection text', () => asset({ expect: injected }), 'not 64 lowercase hex'],
        ['asset: upper-case digest refused', () => asset({ expect: hex.toUpperCase() }), 'not 64 lowercase hex'],
        ['asset: empty digest refused', () => asset({ expect: '' }), 'not 64 lowercase hex'],
        ['asset: tarball name is not the derived one', () => asset({ name: dmgAsset, sumsText: sums }), 'by the derivation'],
        ['asset: name with a path separator', () => asset({ kind: 'dmg', name: '../x.dmg' }), 'plain file name'],
        ['asset: disk image kind with the fixture-shaped name passes the grammar', () => asset({ kind: 'dmg', name: dmgAsset, expect: 'f'.repeat(64), bytes: Buffer.from('x'), sumsText: sums }), 'hashes to'],
        ['inputs: live with the tarball digest only', () => inputs({}), null],
        ['inputs: live with no tarball digest', () => inputs({ TARBALL_SHA: '' }), 'tarball_sha256'],
        ['inputs: tarball digest is injection text', () => inputs({ TARBALL_SHA: injected }), 'tarball_sha256'],
        ['inputs: disk image digest without its asset name', () => inputs({ DMG_SHA: hex }), 'without dmg_asset'],
        ['inputs: asset name is shell text', () => inputs({ DMG_ASSET: 'a;rm -rf /.dmg', DMG_SHA: hex }), 'plain file name'],
        ['inputs: installer asset with the wrong extension', () => inputs({ WINGET_ASSET: `${f.app}-${f.version}.windows-x86_64.msi`, WINGET_SHA: hex }), 'winget_asset'],
        ['inputs: a dry run may omit the digests', () => inputFaults({ LIVE: 'false' }, f), null],
        ['render: the cask renders by literal replacement', () => { const out = renderLive('tap', f, base, { asset: dmgAsset, sha: hex })['Casks/powerbrowser.rb']; return out.includes(hex) && out.includes(dmgAsset) ? [] : ['missing']; }, null],
        ['render: a value with sed and regex metacharacters is written literally', () => { const out = renderLive('tap', f, base, { asset: 'a&b\\1.dmg', sha: hex })['Casks/powerbrowser.rb']; return out.includes('a&b\\1.dmg') ? [] : ['not literal']; }, null],
        ['render: a template that gains a token nothing supplies', () => { try { renderLive('tap', f, r => (r === TEMPLATE_CASK_REL ? `${base(r)}\n# @NOT_A_TOKEN@\n` : base(r)), { asset: dmgAsset, sha: hex }); return []; } catch (e) { return [e.message]; } }, 'still holds the token'],
        ['render: the winget set loses its fixture header', () => { const out = renderLive('winget', f, base, { asset: `${f.app}-${f.version}.windows-x86_64.exe`, sha: hex }); return Object.values(out).some(t => /^#/m.test(t)) ? ['comment kept'] : []; }, null],
    ];
    for (const [name, run, expect] of pure) {
        const out = run();
        const text = out.join(' | ');
        if (expect === null) {
            if (out.length > 0) {
                console.error(`${NAME}: --self-test FAIL -- '${name}' went red but must stay green: ${text}`);
                failed += 1;
            } else {
                greens += 1;
                console.log(`  ${name}: green`);
            }
        } else if (out.some(x => x.includes(expect))) {
            reds += 1;
            console.log(`  ${name}: red -- ${text.slice(0, 140)}`);
        } else {
            console.error(`${NAME}: --self-test FAIL -- '${name}' did not go red naming ${expect}: ${text || '(no failure)'}`);
            failed += 1;
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
    if (args.includes('--check-inputs')) return modeCheckInputs();
    if (flag('--check-asset') >= 0) return modeCheckAsset(args[flag('--check-asset') + 1], args[flag('--check-asset') + 2], args[flag('--check-asset') + 3]);
    if (flag('--render-live') >= 0) return modeRenderLive(args[flag('--render-live') + 1], args[flag('--render-live') + 2]);
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
