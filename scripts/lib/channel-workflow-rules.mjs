// scripts/lib/channel-workflow-rules.mjs
//
// The structural rules of the channel-release-jobs row (Phase 56 review fix WR-09). The workflow is read as a
// parsed YAML document, never as substrings of the file: a rule looks at a job key, a permission map, a step's
// run text with its quoted strings handled, and the order of the steps. Each rule has a plant in the row's
// self-test, so removing a control, widening a scope or reordering a step goes red naming the job.
//
//  A. workflow      triggers; boolean live and dry_run inputs and the digest and asset inputs; concurrency per
//                   release key; bash as the default shell; empty workflow permissions;
//  B. every job     runner family; needs derive (and verify-assets for the legs that publish); the if: gate
//                   (inputs.live and !inputs.dry_run, never github.event_name); the exact permission map;
//                   the exact environment (bot, bot, winget; never release); persist-credentials false on
//                   checkouts; no sed, no expression inside a run text, no credential shape; SHA-pinned and
//                   admitted actions; secrets by an allow-listed name in an allow-listed place only;
//  C. verify-assets attestation pinned to release.yml on main on a hosted runner, then the recomputed digest;
//  D. flake-hash-pr the verified digest is compared (no optional guard), --release runs before the push, the push is
//                   to the chore/channel- branch and never main, the re-run is idempotent, the App token scope;
//  E. tap-commit    the cask is rendered and checked with --release --rendered before the push, the App token scope;
//  F. winget-submit pinned wingetcreate, token only in the submit step by environment variable, no --token flag,
//                   the tracked set rendered and checked before the submission;
//  G. dry-run       renders and submits, pushes, opens and holds nothing;
//  H. checker       the checker template is checked for the key.

const SHA_PIN = /@[0-9a-f]{40}\b/;
const CREDENTIAL_SHAPES = [new RegExp(`${'gh'}p_[A-Za-z0-9]{20,}`), new RegExp(`${'github'}_pat_[A-Za-z0-9_]{20,}`), /-----BEGIN [A-Z ]*PRIVATE KEY-----/];
const LEGS = ['flake-hash-pr', 'tap-commit', 'winget-submit', 'checker-freshness'];
const LIVE_JOBS = ['verify-assets', ...LEGS];
const ALL_JOBS = ['derive', 'dry-run', ...LIVE_JOBS];
const EXPECT_PERMISSIONS = {
    derive: { contents: 'read' },
    'dry-run': { contents: 'read' },
    'verify-assets': { contents: 'read', attestations: 'read' },
    'flake-hash-pr': {},
    'tap-commit': {},
    'winget-submit': {},
    'checker-freshness': { contents: 'read' },
};
const EXPECT_ENVIRONMENT = { 'flake-hash-pr': 'bot', 'tap-commit': 'bot', 'winget-submit': 'winget' };
const INPUTS = {
    release_key: 'string', live: 'boolean', dry_run: 'boolean', tarball_sha256: 'string',
    dmg_asset: 'string', dmg_sha256: 'string', winget_asset: 'string', winget_sha256: 'string',
};
// App token scope per leg: the repository list and exactly these permission-* keys.
const APP_TOKEN = {
    'flake-hash-pr': { repositories: 'powerbrowser', permissions: { 'permission-contents': 'write', 'permission-pull-requests': 'write' } },
    'tap-commit': { repositories: 'homebrew-tap', permissions: { 'permission-contents': 'write' } },
};

const stepsOf = job => (Array.isArray(job?.steps) ? job.steps : []);
const runOf = step => String(step?.run ?? '');
const allRuns = job => stepsOf(job).map(runOf).join('\n');
const findStep = (job, re) => stepsOf(job).findIndex(s => re.test(runOf(s)));
const canon = value => JSON.stringify(Object.fromEntries(Object.entries(value ?? {}).sort()));

// Logical shell lines: continuations joined, comments dropped.
function logicalLines(run) {
    return run.replace(/\\\n\s*/g, ' ').split('\n').map(l => l.trim()).filter(l => l !== '' && !l.startsWith('#'));
}

// The text after `push` for each git push on a logical line, with git's -c <value> options removed first
// (the value may be a quoted string holding spaces, as the extraheader form is).
export function gitPushes(run) {
    const out = [];
    for (const line of logicalLines(run)) {
        const bare = line.replace(/\s-c\s+(?:"[^"]*"|'[^']*'|\S+)/g, ' ');
        const m = /\bgit\s+(?:-\S+\s+)*push\b(.*)$/.exec(bare);
        if (m) out.push(m[1]);
    }
    return out;
}

const pushesMain = tail => /(?:^|[\s:/"'])main(?:["'\s]|$)/.test(tail);

/** Returns the list of { where, msg, next } faults. */
export function workflowFaults(wf, { admitted }) {
    const out = [];
    const fail = (where, msg, next) => out.push({ where, msg, next });
    const jobs = wf?.jobs ?? {};
    const on = wf?.on ?? {};

    // --- A. the workflow -----------------------------------------------------------
    if (!('workflow_call' in on)) fail('workflow', 'has no workflow_call trigger, so the train cannot call the stage', 'add the workflow_call trigger.');
    if (!('workflow_dispatch' in on)) fail('workflow', 'has no workflow_dispatch trigger, so the dry run cannot be started', 'add the workflow_dispatch trigger for the dry run.');
    if ('schedule' in (wf ?? {}) || 'schedule' in on) fail('workflow', 'has a schedule key, so the stage would run on a clock of its own (D-77)', 'delete the schedule; the Worker clock owns timing.');
    if ('pull_request' in on || 'pull_request_target' in on) fail('workflow', 'has a pull_request trigger, so untrusted branches would reach the bot App', 'remove the pull_request trigger.');
    const inputs = on.workflow_call?.inputs ?? {};
    for (const [name, type] of Object.entries(INPUTS)) {
        if (inputs[name]?.type !== type) fail('workflow', `has no workflow_call input ${name} of type ${type}, so the stage cannot be told what to publish or whether to publish`, `add the ${name} input as ${type}.`);
    }
    if (inputs.live?.default !== false || inputs.dry_run?.default !== false) fail('workflow', 'does not default live and dry_run to false', 'default both booleans to false so a bare call is a dry run.');
    const group = String(wf?.concurrency?.group ?? '');
    if (!/inputs\.release_key/.test(group) || wf?.concurrency?.['cancel-in-progress'] !== false) {
        fail('workflow', 'has no per-release-key concurrency group with cancel-in-progress false, so two calls would race on chore/channel-<key> and the tap', 'add concurrency: { group: channel-manifests-${{ inputs.release_key }}, cancel-in-progress: false }.');
    }
    if (wf?.defaults?.run?.shell !== 'bash') fail('workflow', 'does not default run steps to the bash shell, so they run without pipefail', 'add defaults: { run: { shell: bash } }.');
    if (canon(wf?.permissions) !== '{}') fail('workflow', `holds workflow-level permissions ${JSON.stringify(wf?.permissions ?? null)}, but no job may inherit a scope`, 'set permissions: {} at the workflow level.');

    // --- B. every job -----------------------------------------------------------------
    for (const leg of LEGS) {
        if (!jobs[leg]) fail(`job ${leg}`, 'is missing, so one release leg would not run', `restore the ${leg} job.`);
    }
    for (const job of ALL_JOBS) {
        const j = jobs[job];
        if (!j) {
            if (!LEGS.includes(job)) fail(`job ${job}`, 'is missing', `restore the ${job} job.`);
            continue;
        }
        const where = `job ${job}`;
        const text = JSON.stringify(j);
        const gate = String(j.if ?? '');

        if (job !== 'derive' && !(Array.isArray(j.needs) ? j.needs : [j.needs]).includes('derive')) {
            fail(where, 'does not wait on the derive job, so it would run on an unchecked key and unvalidated inputs', 'add derive to needs.');
        }
        if (['flake-hash-pr', 'tap-commit', 'winget-submit'].includes(job) && !(Array.isArray(j.needs) ? j.needs : [j.needs]).includes('verify-assets')) {
            fail(where, 'does not wait on verify-assets, so it could publish a digest nobody recomputed or attested', 'add verify-assets to needs.');
        }
        const runner = String(j['runs-on'] ?? '');
        if (job === 'winget-submit' ? !/^windows-/.test(runner) : !/^ubuntu-/.test(runner)) {
            fail(where, `runs on ${JSON.stringify(j['runs-on'] ?? null)}, but ${job === 'winget-submit' ? 'wingetcreate is a Windows tool' : 'this job needs a Linux hosted runner'}`, job === 'winget-submit' ? 'run on windows-latest.' : 'run on ubuntu-latest.');
        }

        // the gate: inputs, never the event
        if (/github\.event_name/.test(gate) || stepsOf(j).some(s => /github\.event_name/.test(String(s.if ?? '')))) {
            fail(where, 'gates on github.event_name, which is the caller\'s event inside a called workflow, so the leg would silently skip or run (CR-01)', 'gate on the boolean inputs live and dry_run.');
        }
        if (LIVE_JOBS.includes(job)) {
            if (!/inputs\.live\b/.test(gate)) fail(where, 'is not gated on inputs.live, so it could run on a dry or dispatched call', 'add inputs.live to the job if.');
            if (!/!\s*inputs\.dry_run\b/.test(gate)) fail(where, 'is not gated on !inputs.dry_run, so a train dry run would publish', 'add !inputs.dry_run to the job if.');
        }
        if (job === 'dry-run' && !(/!\s*inputs\.live\b/.test(gate) && /\binputs\.dry_run\b/.test(gate))) {
            fail(where, 'is not gated on !inputs.live || inputs.dry_run, so a direct dispatch or a dry call would render nothing', 'gate the dry-run job on !inputs.live || inputs.dry_run.');
        }
        if (job === 'tap-commit' && !/inputs\.dmg_asset\s*!=\s*''/.test(gate)) fail(where, 'is not gated on the macOS asset the train names (A3), so it could commit a fixture cask', 'gate the job on inputs.dmg_asset != \'\'.');
        if (job === 'winget-submit' && !/inputs\.winget_asset\s*!=\s*''/.test(gate)) fail(where, 'is not gated on the Windows asset the train names (A2), so it could submit the fixture', 'gate the job on inputs.winget_asset != \'\'.');

        // permissions and environment
        if (canon(j.permissions) !== canon(EXPECT_PERMISSIONS[job])) {
            const write = JSON.stringify(j.permissions ?? null);
            fail(where, `holds permissions ${write}, not ${JSON.stringify(EXPECT_PERMISSIONS[job])}; a write scope here reaches the repository from a job that needs none`, `set the job permissions to ${JSON.stringify(EXPECT_PERMISSIONS[job])}.`);
        }
        if ((j.environment ?? null) !== (EXPECT_ENVIRONMENT[job] ?? null)) {
            fail(where, `uses environment ${JSON.stringify(j.environment ?? null)}, not ${JSON.stringify(EXPECT_ENVIRONMENT[job] ?? null)}${j.environment === 'release' ? '; the release environment holds the signing key and is never entered from this stage' : ''}`, `set the environment to ${JSON.stringify(EXPECT_ENVIRONMENT[job] ?? null)}.`);
        }

        // the run text: no sed, no expression, no credential shape; checkouts do not persist the token
        for (const [n, step] of stepsOf(j).entries()) {
            const run = runOf(step);
            if (/\bsed\b/.test(run)) fail(`${where} step ${n}`, 'runs sed, and caller text reaching a sed program can execute commands (sed e and w)', 'render with scripts/verify-channel-release-jobs.mjs --render-live, which replaces literally.');
            if (/\$\{\{/.test(run)) fail(`${where} step ${n}`, 'places a ${{ }} expression inside a run script, so a caller value would be parsed as shell', 'pass the value in env: and read it as an environment variable.');
            if (typeof step.uses === 'string' && /^actions\/checkout@/.test(step.uses) && step.with?.['persist-credentials'] !== false) {
                fail(`${where} step ${n}`, 'checks out without persist-credentials: false, so the token stays in .git/config', 'set persist-credentials: false.');
            }
        }
        for (const shape of CREDENTIAL_SHAPES) {
            const hit = shape.exec(text);
            if (hit) fail(where, `carries a credential-shaped literal (${JSON.stringify(hit[0].slice(0, 6))}...)`, 'remove it; reference the secret by name only.');
        }
        for (const step of [...stepsOf(j), j.uses ? { uses: j.uses } : null].filter(Boolean)) {
            if (step.uses && !SHA_PIN.test(step.uses)) fail(where, `uses ${step.uses} without a 40-hex SHA pin`, 'pin the action to a full commit SHA.');
            const m = /^([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)@/.exec(step.uses ?? '');
            if (m && !m[1].startsWith('actions/') && !m[1].startsWith('github/') && !admitted.has(`${m[1]}@*`)) {
                fail(where, `uses ${m[1]}, which .github/settings/actions-selected.json does not admit`, `admit ${m[1]}@* in patterns_allowed in the same commit.`);
            }
        }
        // secrets: allow-listed names, each in its one place
        for (const [n, step] of stepsOf(j).entries()) {
            const blob = JSON.stringify({ env: step.env, with: step.with, run: step.run });
            for (const m of blob.matchAll(/secrets\.([A-Za-z0-9_]+)/g)) {
                const secret = m[1];
                const okApp = secret === 'BOT_APP_PRIVATE_KEY' && /^actions\/create-github-app-token@/.test(step.uses ?? '') && ['flake-hash-pr', 'tap-commit'].includes(job);
                const okWinget = secret === 'WINGET_TOKEN' && job === 'winget-submit' && /wingetcreate\.exe"? submit/.test(runOf(step)) && Object.keys(step.env ?? {}).includes('WINGET_CREATE_GITHUB_TOKEN');
                if (!okApp && !okWinget) {
                    fail(`${where} step ${n}`, `references the secret ${secret} outside its one place (the App-token step for BOT_APP_PRIVATE_KEY, the wingetcreate submit step for WINGET_TOKEN)`, 'reference each secret by name only where it is used.');
                }
            }
        }
        if (job === 'dry-run' && /\bsecrets\./.test(text)) fail(where, 'references a secret, but the dry run holds none', 'delete it.');
        for (const tail of gitPushes(allRuns(j))) {
            if (job !== 'tap-commit' && pushesMain(tail)) fail(where, `pushes to main (${JSON.stringify(tail.trim().slice(0, 60))}), bypassing review (GH-05)`, 'push the chore/channel- branch and open a pull request; never push to main.');
            if (job === 'dry-run') fail(where, 'runs a git push, but the dry run pushes nothing', 'delete it.');
            if (job === 'winget-submit') fail(where, 'runs a git push, but the winget leg submits through wingetcreate', 'delete it.');
        }
    }

    // --- derive -----------------------------------------------------------------------
    const derive = jobs.derive;
    if (derive) {
        const runs = allRuns(derive);
        if (!/--check-key\b/.test(runs)) fail('job derive', 'does not check the release key against the tree', 'run --check-key before any leg.');
        if (!/--check-inputs\b/.test(runs)) fail('job derive', 'does not validate the inputs (plain names, 64-character digests), so caller text would reach later steps', 'run --check-inputs.');
    }

    // --- C. verify-assets ---------------------------------------------------------------
    const verify = jobs['verify-assets'];
    if (verify) {
        const run = allRuns(verify);
        for (const pin of ['--signer-workflow', '--source-ref refs/heads/main', '--deny-self-hosted-runners']) {
            if (!run.includes(`gh attestation verify`) || !run.includes(pin)) fail('job verify-assets', `does not verify the build attestation with ${pin}, so any workflow of the repository could have attested the asset`, 'run gh attestation verify with --signer-workflow <repo>/.github/workflows/release.yml, --source-ref refs/heads/main and --deny-self-hosted-runners.');
        }
        if (!run.includes('release.yml')) fail('job verify-assets', 'does not pin the signer workflow to release.yml', 'pin --signer-workflow to release.yml.');
        if (!/--check-asset\b/.test(run) || !/check tarball\b/.test(run)) fail('job verify-assets', 'does not recompute the Linux tarball digest against SHA256SUMS', 'run --check-asset tarball on the downloaded asset.');
        if (!(run.indexOf('attest "$2"') >= 0 && run.indexOf('attest "$2"') < run.indexOf('--check-asset'))) fail('job verify-assets', 'checks the digest before the attestation, so SHA256SUMS is trusted unattested', 'verify the attestation before comparing the digest.');
        if (!/attest SHA256SUMS/.test(run)) fail('job verify-assets', 'does not verify the SHA256SUMS attestation', 'attest SHA256SUMS before using it.');
    }

    // --- D. flake-hash-pr ---------------------------------------------------------------
    const flake = jobs['flake-hash-pr'];
    if (flake) {
        const where = 'job flake-hash-pr';
        const prefetch = findStep(flake, /nix store prefetch-file/);
        const release = findStep(flake, /verify-flake-repack\.mjs --release/);
        const push = findStep(flake, /\bgit\b[^\n]*\bpush\b/);
        const create = findStep(flake, /gh pr create/);
        if (prefetch < 0) fail(where, 'does not prefetch the published tarball (nix store prefetch-file), which is where the hash comes from', 'add the prefetch step.');
        if (release < 0) fail(where, 'does not run verify-flake-repack.mjs --release before the pull request, so a placeholder hash could be proposed', 'run verify-flake-repack.mjs --release on the written record.');
        if (push < 0 || create < 0) fail(where, 'opens no pull request from a pushed branch', 'push chore/channel-<key> and run gh pr create --base main.');
        if (prefetch >= 0 && release >= 0 && push >= 0 && !(prefetch <= release && release < push)) fail(where, 'runs the steps out of order; the prefetch must precede verify-flake-repack.mjs --release, which must precede the push', 'order: prefetch, --release check, push.');
        const run = allRuns(flake);
        for (const [needle, what] of [
            ['chore/channel-', 'the chore/channel- branch'],
            ['--base main', 'main as the pull request base'],
            ['nix/pkg/release-hash.json', 'the hash record the flake reads'],
            ['nix hash convert', 'a comparison of the prefetched hash with the verified digest'],
            ['needs.verify-assets.outputs.tarball', 'the recomputed, attested digest'],
        ]) {
            if (!run.includes(needle) && !JSON.stringify(flake).includes(needle)) fail(where, `lacks ${what} (${needle})`, `add ${needle}.`);
        }
        if (/-n\s+"\$\{?TARBALL_SHA\}?"/.test(run) || /\bif \[ -n "\$[A-Z_]*SHA" \]/.test(run)) fail(where, 'compares the digest only when one was supplied (an optional guard), so the flake hash could be trust-on-first-fetch', 'compare unconditionally; the verified digest is always present.');
        if (/--force(?!-with-lease)\b|\s-f\s/.test(run)) fail(where, 'force-pushes', 'use --force-with-lease only.');
        if (!/git diff --cached --quiet/.test(run) || !/gh pr list/.test(run) || !/--force-with-lease/.test(run)) fail(where, 'is not idempotent: a re-run would fail at the push, the commit or the pull request', 'exit when the record is current, push with --force-with-lease and check gh pr list before gh pr create.');
    }

    // --- App token scope (D and E) --------------------------------------------------------
    for (const [leg, want] of Object.entries(APP_TOKEN)) {
        const job = jobs[leg];
        if (!job) continue;
        const step = stepsOf(job).find(s => /^actions\/create-github-app-token@/.test(s.uses ?? ''));
        if (!step) {
            fail(`job ${leg}`, 'mints no bot App token', 'add the actions/create-github-app-token step.');
            continue;
        }
        const w = step.with ?? {};
        if (w.repositories !== want.repositories) fail(`job ${leg}`, `mints a token for repositories ${JSON.stringify(w.repositories ?? null)}, not ${JSON.stringify(want.repositories)}`, `set repositories: ${want.repositories}.`);
        const got = Object.fromEntries(Object.entries(w).filter(([k]) => k.startsWith('permission-')));
        if (canon(got) !== canon(want.permissions)) fail(`job ${leg}`, `mints a token with ${JSON.stringify(got)}, not exactly ${JSON.stringify(want.permissions)}`, `set only ${Object.keys(want.permissions).join(', ')}.`);
        const mint = stepsOf(job).indexOf(step);
        const checkouts = stepsOf(job).map((s, n) => (/^actions\/checkout@/.test(s.uses ?? '') ? n : -1)).filter(n => n >= 0);
        if (checkouts.length > 0 && Math.min(...checkouts) < mint) fail(`job ${leg}`, 'checks out before the token is minted', 'mint the token first.');
    }

    // --- E. tap-commit --------------------------------------------------------------------
    const tap = jobs['tap-commit'];
    if (tap) {
        const where = 'job tap-commit';
        const render = findStep(tap, /--render-live tap/);
        const release = findStep(tap, /verify-homebrew-cask\.mjs --release --rendered/);
        const push = findStep(tap, /\bgit\b[^\n]*\bpush\b/);
        if (render < 0) fail(where, 'does not render the cask with --render-live tap (literal replacement, leftover-token check)', 'render with scripts/verify-channel-release-jobs.mjs --render-live tap.');
        if (release < 0) fail(where, 'does not run verify-homebrew-cask.mjs --release --rendered on the rendered cask, so a fixture asset or a stale digest could be pushed', 'run the release check on the rendered file before the push.');
        if (push < 0) fail(where, 'never pushes the cask to the tap', 'push the rendered cask to the tap.');
        if (render >= 0 && release >= 0 && push >= 0 && !(render < release && release < push)) fail(where, 'runs the release check out of order; render, then verify-homebrew-cask.mjs --release --rendered, and only then the push', 'order: render, --release --rendered, push.');
        const blob = JSON.stringify(tap);
        for (const [needle, what] of [['homebrew-tap', 'the tap repository checkout'], ['Casks/powerbrowser.rb', 'the cask path in the tap'], ['needs.verify-assets.outputs.dmg', 'the recomputed, attested disk-image digest'], ['inputs.dmg_asset', 'the macOS asset name input']]) {
            if (!blob.includes(needle)) fail(where, `lacks ${what} (${needle})`, `add ${needle}.`);
        }
        if (/wingetcreate/.test(blob)) fail(where, 'runs wingetcreate, which belongs to the winget leg', 'move it to winget-submit.');
    }

    // --- F. winget-submit -------------------------------------------------------------------
    const winget = jobs['winget-submit'];
    if (winget) {
        const where = 'job winget-submit';
        const version = String(winget.env?.WINGETCREATE_VERSION ?? '');
        const hash = String(winget.env?.WINGETCREATE_SHA256 ?? '');
        if (!/^\d+(?:\.\d+){3}$/.test(version) || !/^[0-9a-f]{64}$/.test(hash)) fail(where, `does not pin wingetcreate by version and SHA-256 (${JSON.stringify(version)}, ${JSON.stringify(hash.slice(0, 12))})`, 'set WINGETCREATE_VERSION (a four-part version) and WINGETCREATE_SHA256 (64 hex) in the job env.');
        const run = allRuns(winget);
        if (/\bwinget\s+install\b/.test(run)) fail(where, 'installs wingetcreate with winget install, which takes whatever version is current', 'download the pinned release asset and check its SHA-256.');
        if (/--token\b|\s-t\s/.test(run)) fail(where, 'passes the token with --token, which wingetcreate can log', 'pass it as WINGET_CREATE_GITHUB_TOKEN in the submit step env.');
        const pin = findStep(winget, /sha256sum[^\n]*wingetcreate|WINGETCREATE_SHA256/);
        const render = findStep(winget, /--render-live winget/);
        const check = findStep(winget, /verify-winget-manifest\.mjs --release --rendered/);
        const submit = findStep(winget, /wingetcreate\.exe"? submit/);
        if (render < 0) fail(where, 'does not render the tracked winget set with --render-live winget, so what is submitted is not what the rows guard', 'render the tracked winget/ set for the first version.');
        if (check < 0) fail(where, 'does not run verify-winget-manifest.mjs --release --rendered on the rendered set', 'run the release check on the rendered set before the submission.');
        if (submit < 0) fail(where, 'never runs wingetcreate submit', 'submit the chosen set.');
        if (!/wingetcreate\.exe"? update/.test(run)) fail(where, 'has no wingetcreate update path for later versions', 'use update only when the package already exists.');
        if (pin >= 0 && render >= 0 && check >= 0 && submit >= 0 && !(pin < render && render <= check && check < submit)) fail(where, 'runs the steps out of order; pin check, render, release check, then submit', 'order: pinned download, render, --release --rendered, submit.');
        // the token: one step only, in the environment, never an input to the install or the render
        const tokenSteps = stepsOf(winget).filter(s => JSON.stringify(s.env ?? {}).includes('WINGET_TOKEN'));
        if (tokenSteps.length !== 1 || !/wingetcreate\.exe"? submit/.test(runOf(tokenSteps[0]))) fail(where, 'holds WINGET_TOKEN in a step other than the one that submits', 'reference the secret only in the submit step env.');
    }

    // --- G. dry-run -------------------------------------------------------------------------
    const dry = jobs['dry-run'];
    if (dry) {
        const blob = JSON.stringify(dry);
        if (!/--render\b/.test(blob)) fail('job dry-run', 'does not render the payloads', 'run --render into the runner temp directory.');
        for (const [re, what] of [[/gh\s+pr\s/, 'a pull request'], [/wingetcreate\S*\s+submit/, 'a winget submission'], [/--submit\b/, 'the --submit flag']]) {
            if (re.test(blob)) fail('job dry-run', `contains ${what}, but the dry run submits and pushes nothing and holds no secret`, 'delete it; the dry run renders payloads only.');
        }
    }

    // --- H. checker ---------------------------------------------------------------------------
    const checker = jobs['checker-freshness'];
    if (checker && !/--check-checker/.test(allRuns(checker))) fail('job checker-freshness', 'does not check the x-checker-data template for the key', 'run --check-checker on the release key.');

    // --- every secret name in the file is one of the two --------------------------------------
    for (const m of JSON.stringify(wf).matchAll(/secrets\.([A-Za-z0-9_]+)/g)) {
        if (!['BOT_APP_PRIVATE_KEY', 'WINGET_TOKEN'].includes(m[1])) fail('workflow', `references the secret ${m[1]}, which the channel stage does not use`, 'reference only BOT_APP_PRIVATE_KEY or WINGET_TOKEN, by name.');
    }
    return out;
}
