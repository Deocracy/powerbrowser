#!/usr/bin/env node
// scripts/verify-ci-release-integrity.mjs
//
// The ci-release-integrity gate (v1.7 audit, lane G5a). It parses the workflow files and is red, naming
// the file, the job and the clause, when a fix the audit asked for is undone:
//   stage-line     (ci-supply-chain-06) rebase-orca.yml's replay step passes --stage-file, its stage step
//                  reads that file and never takes the stage from the log, and both the stage step and the
//                  release train's stop-issue step cut the stage to a bounded length of a character set with
//                  no backtick before it is published.
//   artifact-digest (ci-supply-chain-01, ci-supply-chain-04) every artifact of this run that a job holding a
//                  credential (a secrets. reference, an App-token step, github.token or GITHUB_TOKEN) downloads is
//                  bound to its producer: the producer (a job of the same file, or the job of a reusable workflow it
//                  calls) exports a *sha256* output from a step, the consumer takes it through needs into an env
//                  variable, and a run step after the download and before the next credential step compares the bytes
//                  with it (check-win-sidecar.sh check, a != "$VAR" test, or a powerbrowser/packaging script whose
//                  text runs check-win-sidecar.sh check on that variable). The set of consumers and artifacts is
//                  derived from the files. A download with run-id (another run's artifact) is out of this clause.
//   mode-carry     (68-CR-03) an artifact keeps no file mode, so every artifact a macOS job uploads is a directory a
//                  run step of that job writes a tar into (tar -c...f "<dir>/tree.tar"), every job downloading it
//                  unpacks tree.tar with tar -x...p...f, and powerbrowser/packaging/package-macos.sh unpacks the
//                  PB_MAC_ORCA_DIR artifact's tree.tar with -p before it stages from it.
//   orca-automerge (ci-supply-chain-03) in release-train.yml's bump-pr-orca, the step that runs gh pr merge reaches it
//                  only past a test that $LOCKS is unchanged, LOCKS comes from a step output computed by git -C orca
//                  diff --quiet over a *-lock.yaml pathspec (git data, no Orca code), and the PR body carries the
//                  upstream compare link ${COMPARE_URL} and says the replay's green is not a review of upstream.
// Every clause derives what it compares from the parsed YAML (job and step lookups by what they run, not by
// a list kept here), so a renamed step is still found.
//
// Tier: quick (reads tracked files, parses YAML). --self-test checks the real tree green first, then plants
// each pre-fix fault on an in-memory copy of the text and requires red naming the clause; it writes nothing.
//
// Usage:
//   node scripts/verify-ci-release-integrity.mjs
//   node scripts/verify-ci-release-integrity.mjs --self-test

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadYaml, stepsOf } from './lib/release-workflow.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'ci-release-integrity';
const WF = '.github/workflows';
export const FILES = ['rebase-orca.yml', 'release-train.yml', 'release.yml'];

const runOf = st => String(st?.run ?? '');

/** True when `text` passes a value through tr -cd with a set lacking a backtick, then cut -c1-N. */
function boundedFilter(text) {
    const tr = /tr -cd (?:"([^"\n]*)"|'([^'\n]*)')/.exec(text);
    return tr !== null && !(tr[1] ?? tr[2]).includes('`') && /\bcut -c1-[0-9]+\b/.test(text.slice(tr.index));
}

export function check(texts) {
    const fails = [];
    const yaml = loadYaml();
    const docs = {};
    for (const f of FILES) {
        try { docs[f] = yaml.load(texts[f]); } catch (e) { fails.push(`${WF}/${f}: does not parse (${e.message.split('\n')[0]}). Next step: fix the file.`); }
    }
    const fail = (f, job, clause, msg) => fails.push(`${WF}/${f} job ${job} [${clause}]: ${msg}`);

    // stage-line (ci-supply-chain-06)
    {
        const job = docs['rebase-orca.yml']?.jobs?.rebase;
        const steps = stepsOf(job);
        const replay = steps.find(st => /scripts\/rebase-orca\.sh\b/.test(runOf(st)));
        const file = /--stage-file\s+("?)([^"\s]+)\1/.exec(runOf(replay))?.[2];
        if (!replay) fail('rebase-orca.yml', 'rebase', 'stage-line', 'has no step running scripts/rebase-orca.sh. Next step: restore the replay step.');
        else if (!file) fail('rebase-orca.yml', 'rebase', 'stage-line', 'runs rebase-orca.sh without --stage-file, so the stage can only be read from the log, which carries what Orca\'s build prints. Next step: pass --stage-file "$RUNNER_TEMP/stage.txt".');
        const stage = steps.find(st => st?.id === 'stage');
        const sRun = runOf(stage);
        if (!stage) fail('rebase-orca.yml', 'rebase', 'stage-line', 'has no step with id stage. Next step: restore the step that names the stage.');
        else {
            if (file && !sRun.includes(file)) fail('rebase-orca.yml', 'rebase', 'stage-line', `the stage step does not read ${file}, the file rebase-orca.sh writes its own FAIL line to. Next step: read the stage from it.`);
            if (/rebase\.log/.test(sRun)) fail('rebase-orca.yml', 'rebase', 'stage-line', 'the stage step reads the replay log, whose first FAIL line can be one Orca\'s build printed. Next step: read the --stage-file instead.');
            if (!boundedFilter(sRun)) fail('rebase-orca.yml', 'rebase', 'stage-line', 'the stage step publishes the line without tr -cd (a set with no backtick) and cut -c1-N, so it can close the issue\'s code span. Next step: filter and bound it.');
        }
        const report = docs['release-train.yml']?.jobs?.report;
        const stop = stepsOf(report).find(st => /orca-stop\.md/.test(runOf(st)) && /Stage: /.test(runOf(st)));
        if (!stop) fail('release-train.yml', 'report', 'stage-line', 'has no step writing the Orca stop issue (orca-stop.md with a Stage: line). Next step: restore it.');
        else {
            const r = runOf(stop);
            const filt = r.search(/STAGE=\$\(printf '%s' "\$STAGE_OUT" \| tr -cd /);
            const printed = r.search(/Stage: /);
            if (filt === -1 || !boundedFilter(r.slice(filt)) || filt > printed) fail('release-train.yml', 'report', 'stage-line', 'prints the rebase-orca stage into the issue without first cutting it to a bounded set with no backtick; the stage comes from the job that ran Orca\'s code. Next step: STAGE=$(printf \'%s\' "$STAGE_OUT" | tr -cd ... | cut -c1-300) before the printf.');
        }
    }

    // artifact-digest (ci-supply-chain-01, ci-supply-chain-04)
    const uploadsOf = j => stepsOf(j).filter(st => /^actions\/upload-artifact@/.test(String(st?.uses ?? '')));
    const holdsCred = st => /\bsecrets\.|\bgithub\.token\b|\bGITHUB_TOKEN\b/.test(JSON.stringify(st)) || /^actions\/create-github-app-token@/.test(String(st?.uses ?? ''));
    const readPkg = name => { try { return (texts.packaging ?? {})[name] ?? readFileSync(join(REPO_ROOT, 'powerbrowser', 'packaging', name), 'utf8'); } catch { return ''; } };
    for (const f of FILES) {
        const jobs = docs[f]?.jobs ?? {};
        // The producers of an artifact name: a job of this file that uploads it, or a reusable-workflow job whose called
        // file uploads it (its outputs are then the called file's workflow_call outputs).
        const producersOf = name => Object.entries(jobs).flatMap(([pId, p]) => {
            if (uploadsOf(p).some(u => u.with?.name === name)) return [[pId, p.outputs ?? {}, 'steps']];
            const called = /^\.\/\.github\/workflows\/([\w.-]+\.ya?ml)$/.exec(String(p?.uses ?? ''))?.[1];
            const cd = called ? docs[called] : undefined;
            if (cd && Object.values(cd.jobs ?? {}).some(j => uploadsOf(j).some(u => u.with?.name === name))) {
                const outs = cd.on?.workflow_call?.outputs ?? {};
                const viaJobs = Object.fromEntries(Object.entries(outs).filter(([, o]) => {
                    const m = /jobs\.([\w-]+)\.outputs\.([\w-]+)/.exec(String(o?.value ?? ''));
                    return m && /\bsteps\.[\w-]+\.outputs\.[\w-]+/.test(String(cd.jobs?.[m[1]]?.outputs?.[m[2]] ?? ''));
                }).map(([k]) => [k, '${{ steps.x.outputs.y }}']));
                return [[pId, viaJobs, 'steps']];
            }
            return [];
        });
        for (const [cId, c] of Object.entries(jobs)) {
            const steps = stepsOf(c);
            if (!steps.some(holdsCred) && !holdsCred({ env: c.env })) continue;
            steps.forEach((d, di) => {
                if (!/^actions\/download-artifact@/.test(String(d?.uses ?? '')) || d.with?.['run-id'] !== undefined) return;
                const name = d.with?.name;
                const producers = producersOf(name);
                if (producers.length !== 1) { fail(f, cId, 'artifact-digest', `downloads ${name}, which ${producers.length === 0 ? 'no job of this file (or of a workflow it calls) uploads' : 'more than one job uploads'}, so no producer digest can bind it. Next step: give it one producer that exports a digest.`); return; }
                const [pId, outs] = producers[0];
                const digestOuts = Object.entries(outs).filter(([k, v]) => /sha256/i.test(k) && /\bsteps\.[\w-]+\.outputs\.[\w-]+/.test(String(v))).map(([k]) => k);
                if (digestOuts.length === 0) { fail(f, pId, 'artifact-digest', `uploads ${name}, which ${cId} downloads while it holds a credential, but exports no *sha256* output from a step, so a copy another job of the run re-uploaded cannot be told apart. Next step: write a digest of the files and export it as a job output.`); return; }
                const envs = [c.env ?? {}, ...steps.map(st => st.env ?? {})].flatMap(e => Object.entries(e));
                const vars = envs.filter(([, val]) => digestOuts.some(k => String(val).replace(/\s+/g, '') === `\${{needs.${pId}.outputs.${k}}}`)).map(([n]) => n);
                if (vars.length === 0) { fail(f, cId, 'artifact-digest', `downloads ${name} but never takes a digest output of ${pId} (${digestOuts.join(', ')}) into an env variable, so the bytes are not compared with what ${pId} uploaded. Next step: pass it in env and compare before any credential step.`); return; }
                // The comparison names the downloaded directory, so a digest is checked against the artifact it belongs to.
                const dir = String(d.with?.path ?? name).replace(/\$\{\{\s*runner\.temp\s*\}\}/g, '$RUNNER_TEMP');
                const nextCred = steps.findIndex((st, i) => i > di && holdsCred(st));
                const compares = (st, v) => {
                    const r = runOf(st);
                    const stepEnv = Object.values(st.env ?? {}).map(x => String(x).replace(/\$\{\{\s*runner\.temp\s*\}\}/g, '$RUNNER_TEMP')).join('\n');
                    if (!r.includes(dir) && !stepEnv.includes(dir)) return false;
                    if (new RegExp(`\\$\\{?${v}\\b`).test(r) && (new RegExp(`check-win-sidecar\\.sh check "?${dir.replace(/[$.*+?^{}()|[\]\\]/g, '\\$&')}"? "\\$\\{?${v}\\b`).test(r) || new RegExp(`!= "\\$\\{?${v}\\}?"`).test(r))) return true;
                    if (!new RegExp(`\\b${v}\\b`).test(r)) return false;
                    return [...r.matchAll(/powerbrowser\/packaging\/([\w.-]+\.sh)\b/g)].some(([, n]) => new RegExp(`check-win-sidecar\\.sh"? check [^\\n]*"\\$\\{?${v}\\b`).test(readPkg(n)));
                };
                const cmp = steps.findIndex((st, i) => i > di && (nextCred === -1 || i < nextCred) && vars.some(v => compares(st, v)));
                if (cmp === -1) fail(f, cId, 'artifact-digest', `downloads ${name} into ${dir} (step ${di}) and has no run step before its next credential step (step ${nextCred}) that compares ${dir} with ${vars.map(v => '$' + v).join(' or ')} (a digest output of ${pId}). Next step: admit it with check-win-sidecar.sh check, or compare its digest, right after the download.`);
            });
        }
    }

    // orca-automerge (ci-supply-chain-03)
    {
        const bump = docs['release-train.yml']?.jobs?.['bump-pr-orca'];
        const steps = stepsOf(bump);
        const pub = steps.find(st => /\bgh pr merge\b/.test(runOf(st)));
        if (!bump) fail('release-train.yml', 'bump-pr-orca', 'orca-automerge', 'is absent. Next step: restore the Orca bump job.');
        else if (!pub) fail('release-train.yml', 'bump-pr-orca', 'orca-automerge', 'runs no gh pr merge. Next step: restore the publish step.');
        else {
            const r = runOf(pub);
            // The LOCKS test that governs the merge: the last one before it, after the PR number is read (the body's
            // own LOCKS test, earlier in the step, decides only the wording).
            const merge = r.search(/\bgh pr merge\b/);
            const before = r.slice(0, merge);
            const gate = before.lastIndexOf('[ "$LOCKS" != "unchanged" ]');
            const prRead = before.search(/\bPR=\$\(gh pr list\b/);
            if (gate === -1 || prRead === -1 || gate < prRead) fail('release-train.yml', 'bump-pr-orca', 'orca-automerge', 'arms gh pr merge --auto without first testing that no Orca lockfile changed in the pin range ([ "$LOCKS" != "unchanged" ]), so a re-pin that moves upstream dependencies is armed on the green of the job that ran them. Next step: arm auto-merge only when LOCKS is unchanged.');
            const m = /^steps\.([\w-]+)\.outputs\.locks$/.exec(String(pub.env?.LOCKS ?? '').replace(/^\$\{\{\s*|\s*\}\}$/g, ''));
            const src = m ? steps.find(st => st.id === m[1]) : undefined;
            if (!src || !/git -C orca diff --quiet\b[^\n]*-lock\.yaml/.test(runOf(src))) fail('release-train.yml', 'bump-pr-orca', 'orca-automerge', 'takes LOCKS from no step that compares the Orca lockfiles across the pin range with git -C orca diff --quiet. Next step: compute it from git data in a step before the token mint.');
            if (!/BODY="[^\n]*\$\{COMPARE_URL\}/.test(r) || !/not a review of what changed upstream/.test(r)) fail('release-train.yml', 'bump-pr-orca', 'orca-automerge', 'writes a PR body without the upstream compare link or without saying the green replay is not a review of upstream. Next step: put both in the body.');
        }
    }

    // mode-carry (68-CR-03)
    {
        const jobs = docs['release.yml']?.jobs ?? {};
        const norm = x => String(x ?? '').replace(/\$\{\{\s*runner\.temp\s*\}\}/g, '$RUNNER_TEMP').replace(/\/$/, '');
        let seen = 0;
        for (const [pId, p] of Object.entries(jobs).filter(([, j]) => /^macos/.test(String([j?.['runs-on']].flat()[0] ?? '')))) {
            const steps = stepsOf(p);
            for (const up of uploadsOf(p)) {
                seen++;
                const dir = norm(up.with?.path);
                const varOf = steps.map(runOf).join('\n').match(new RegExp(`^\\s*(\\w+)="${dir.replace(/[$.*+?^{}()|[\]\\]/g, '\\$&')}"$`, 'm'))?.[1];
                const tarred = steps.some(st => new RegExp(`tar -c\\w*f "(?:${dir.replace(/[$.*+?^{}()|[\]\\]/g, '\\$&')}${varOf ? `|\\$${varOf}` : ''})/tree\\.tar"`).test(runOf(st)));
                if (!tarred) fail('release.yml', pId, 'mode-carry', `uploads ${up.with?.name} from ${dir}, but no run step writes a tar there (tar -cf "<dir>/tree.tar"), so every executable reaches the consumer at 0644. Next step: archive the tree into tree.tar and upload the directory holding it.`);
                for (const [cId, c] of Object.entries(jobs)) {
                    if (!stepsOf(c).some(st => /^actions\/download-artifact@/.test(String(st?.uses ?? '')) && st.with?.name === up.with?.name)) continue;
                    if (!stepsOf(c).some(st => /\btar -x\w*p\w*f\b[^\n]*tree\.tar/.test(runOf(st)))) fail('release.yml', cId, 'mode-carry', `downloads ${up.with?.name} but unpacks no tree.tar with tar -xpf, so the modes the tar carried are dropped. Next step: tar -xpf the admitted tree.tar.`);
                }
            }
        }
        if (seen === 0) fail('release.yml', '(file)', 'mode-carry', 'no macOS job uploads an artifact, so the clause holds over nothing. Next step: restore the macos-orca jobs or retire the clause.');
        const pm = texts.packageMacos ?? readFileSync(join(REPO_ROOT, 'powerbrowser', 'packaging', 'package-macos.sh'), 'utf8');
        if (!/tar -x\w*p\w*f "\$PB_MAC_ORCA_DIR\/tree\.tar"/.test(pm)) fail('powerbrowser/packaging/package-macos.sh', '(script)', 'mode-carry', 'stages the macos-orca artifact without unpacking its tree.tar with tar -xpf, so its executables lose their modes. Next step: tar -xpf "$PB_MAC_ORCA_DIR/tree.tar" into a scratch tree after the admission and stage from it.');
        if (/cp -a "\$PB_MAC_ORCA_DIR\//.test(pm)) fail('powerbrowser/packaging/package-macos.sh', '(script)', 'mode-carry', 'copies from $PB_MAC_ORCA_DIR directly, not from the unpacked tree. Next step: stage from the tree tar -xpf wrote.');
    }

    return fails;
}

export function readTexts(root = REPO_ROOT) {
    return Object.fromEntries(FILES.map(f => [f, readFileSync(join(root, WF, f), 'utf8')]));
}

function selfTest() {
    const real = readTexts();
    const PM = readFileSync(join(REPO_ROOT, 'powerbrowser', 'packaging', 'package-macos.sh'), 'utf8');
    const base = check(real);
    if (base.length) {
        console.error(`${NAME} self-test: FAIL -- the real tree is already red, so the plants below would prove nothing:`);
        for (const f of base) console.error(`  ${f}`);
        return 1;
    }
    console.log(`  ok baseline ${FILES.join(', ')} -> green`);
    const edit = (f, from, to) => (real[f].includes(from) ? { ...real, [f]: real[f].replace(from, to) } : null);
    // Replace the listed occurrences (0-based) of a regex in one file; null when any is absent.
    const nth = (f, re, which, to) => {
        const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
        let i = -1, hit = 0;
        const out = real[f].replace(g, m => { i++; if (which.includes(i)) { hit++; return to; } return m; });
        return hit === which.length ? { ...real, [f]: out } : null;
    };
    const plants = [
        // ci-supply-chain-06, the pre-fix stage step and stop issue.
        ['stage from the log', edit('rebase-orca.yml', `LINE=$(head -n1 "$RUNNER_TEMP/stage.txt" 2>/dev/null || true)`, `LINE=$(grep -m1 '^rebase-orca: FAIL -- ' "$RUNNER_TEMP/rebase.log" 2>/dev/null || true)`), 'stage-line', 'reads the replay log'],
        ['replay without --stage-file', edit('rebase-orca.yml', ' --stage-file "$RUNNER_TEMP/stage.txt"', ''), 'stage-line', 'without --stage-file'],
        ['stage published unfiltered', edit('rebase-orca.yml', `          LINE=$(printf '%s' "$LINE" | tr -cd "A-Za-z0-9 _./:@()'*,=<>+-" | cut -c1-300)\n`, ''), 'stage-line', 'without tr -cd'],
        ['stop issue prints the raw stage', edit('release-train.yml', `STAGE=$(printf '%s' "$STAGE_OUT" | tr -cd "A-Za-z0-9 _./:@()'*,=<>+-" | cut -c1-300)`, 'STAGE="$STAGE_OUT"'), 'stage-line', 'without first cutting it'],
        ['a backtick admitted', edit('release-train.yml', `STAGE=$(printf '%s' "$STAGE_OUT" | tr -cd "A-Za-z0-9 _./:@()'*,=<>+-" | cut -c1-300)`, `STAGE=$(printf '%s' "$STAGE_OUT" | tr -cd "A-Za-z0-9 _./:@()'*,=<>+\`-" | cut -c1-300)`), 'stage-line', 'without first cutting it'],
        // ci-supply-chain-01, the pre-fix sign-publish: no admission of release-linux by build-linux's digest.
        ['sign-publish signs an unbound release-linux', edit('release.yml', '          bash powerbrowser/packaging/check-win-sidecar.sh check release "$SUMS_SHA256"\n', '          echo admitted\n'), 'artifact-digest', 'job sign-publish [artifact-digest]: downloads release-linux into'],
        ['build-linux exports no digest', nth('release.yml', /^      (?:sums|identity_sums|manifest_sums)_sha256: \$\{\{ steps\.release_sums\.outputs\.[\w]+ \}\}\n/m, [0, 1, 2], ''), 'artifact-digest', 'job build-linux [artifact-digest]: uploads release-linux,'],
        ['publish-windows signs an unbound release-windows', nth('release.yml', /bash powerbrowser\/packaging\/check-win-sidecar\.sh check windows "\$SUMS_SHA256"/, [1], 'echo admitted'), 'artifact-digest', 'job publish-windows [artifact-digest]: downloads release-windows into'],
        // The siblings of the signed artifact (review follow-up): identity and manifest read by credential-holding jobs.
        ['descriptor reads an unbound identity', nth('release.yml', /\[ "\$GOT" != "\$IDENTITY_SUMS_SHA256" \]/, [0], 'false'), 'artifact-digest', 'job descriptor [artifact-digest]: downloads release-linux-identity into'],
        ['channel-live (job token only) reads an unbound manifest', nth('release.yml', /bash powerbrowser\/packaging\/check-win-sidecar\.sh check release "\$MANIFEST_SUMS_SHA256"/, [1], 'echo admitted'), 'artifact-digest', 'job channel-live [artifact-digest]: downloads release-linux-manifest into'],
        ['descriptor-windows reads an unbound identity', nth('release.yml', /\[ "\$GOT" != "\$IDENTITY_SUMS_SHA256" \]/, [1], 'false'), 'artifact-digest', 'job descriptor-windows [artifact-digest]: downloads release-windows-identity into'],
        ['descriptor-windows exports no manifest digest', edit('release.yml', '      manifest_sums_sha256: ${{ steps.manifest_sums.outputs.sha256 }}\n', ''), 'artifact-digest', 'job descriptor-windows [artifact-digest]: uploads release-windows-manifest,'],
        // ci-supply-chain-04, the pre-fix publish job: only the file-name listing.
        ['the notices publish compares no digest', nth('release-train.yml', /\[ "\$GOT_SHA256" != "\$NOTICES_SHA256" \]/, [0], 'false'), 'artifact-digest', 'job renovate-licensing-publish [artifact-digest]: downloads renovate-licensing-notices into'],
        ['the notices digest not taken from the generate job', edit('release-train.yml', '      NOTICES_SHA256: ${{ needs.renovate-licensing.outputs.notices-sha256 }}\n', ''), 'artifact-digest', 'never takes a digest output of renovate-licensing'],
        ['bump-pr-orca carries unbound replay notices', edit('release-train.yml', '      NOTICES_SHA256: ${{ needs.rebase-orca.outputs.notices-sha256 }}\n', ''), 'artifact-digest', 'job bump-pr-orca [artifact-digest]: downloads rebase-orca-notices but never takes'],
        ['the reusable replay exports no notices digest', edit('rebase-orca.yml', '      notices-sha256:\n        description: "The SHA-256 of the THIRD-PARTY-NOTICES.txt uploaded as rebase-orca-notices (empty when unchanged)"\n        value: ${{ jobs.rebase.outputs.notices-sha256 }}\n', ''), 'artifact-digest', 'job rebase-orca [artifact-digest]: uploads rebase-orca-notices,'],
        // ci-supply-chain-03, the pre-fix bump: auto-merge armed on the replay's green alone, no range for the owner.
        ['auto-merge armed whatever the lockfiles', edit('release-train.yml', '          elif [ "$LOCKS" != "unchanged" ]; then\n', '          elif false; then\n'), 'orca-automerge', 'without first testing that no Orca lockfile changed'],
        ['the PR body without the compare link', edit('release-train.yml', ' ${COMPARE_URL} .', ' .'), 'orca-automerge', 'without the upstream compare link'],
        ['LOCKS from no lockfile comparison', edit('release-train.yml', "if git -C orca diff --quiet \"$OLD\" \"$COMMIT\" -- ':(glob)**/*-lock.yaml'; then", 'if true; then'), 'orca-automerge', 'takes LOCKS from no step'],
        // 68-CR-03, the pre-fix macOS round trip.
        ['a thin macOS job uploads the loose tree', edit('release.yml', '          path: ${{ runner.temp }}/macos-orca-arm64-artifact/', '          path: ${{ runner.temp }}/macos-orca-arm64/'), 'mode-carry', 'job macos-orca-arm64 [mode-carry]: uploads macos-orca-arm64 from'],
        ['the universal job unpacks without -p', edit('release.yml', 'tar -xpf "macos-orca-$A-artifact/tree.tar"', 'tar -xf "macos-orca-$A-artifact/tree.tar"'), 'mode-carry', 'job macos-orca-universal [mode-carry]: downloads macos-orca-arm64'],
        ['package-macos.sh stages the artifact directly', { ...real, packageMacos: PM.replace('cp -a "$ORCA_TREE/package.json"', 'cp -a "$PB_MAC_ORCA_DIR/package.json"') }, 'mode-carry', 'copies from $PB_MAC_ORCA_DIR directly'],
    ];
    let failed = 0;
    for (const [name, texts, clause, naming] of plants) {
        if (texts === null) { console.error(`${NAME} self-test: FAIL -- '${name}' planted nothing (its anchor is absent)`); failed++; continue; }
        const fails = check(texts);
        const hit = fails.find(f => f.includes(`[${clause}]`) && f.includes(naming));
        if (hit) console.log(`  ok ${name} -> red: ${hit.split('. Next step')[0]}`);
        else { console.error(`${NAME} self-test: FAIL -- '${name}' did not go red naming [${clause}] '${naming}'; got: ${fails.join(' | ') || '(green)'}`); failed++; }
    }
    if (failed) return 1;
    console.log(`${NAME} self-test: PASS -- the real tree is green and ${plants.length} planted faults each went red naming the clause`);
    return 0;
}

const args = process.argv.slice(2);
if (args.some(a => a !== '--self-test')) {
    console.error(`${NAME}: unknown argument '${args.find(a => a !== '--self-test')}' (usage: node scripts/verify-ci-release-integrity.mjs [--self-test])`);
    console.error('  Next step: run node scripts/verify-ci-release-integrity.mjs --self-test');
    process.exit(2);
}
if (args.includes('--self-test')) process.exit(selfTest());
const fails = check(readTexts());
if (fails.length) {
    console.error(`${NAME}: FAIL -- ${fails.length} problem(s):`);
    for (const f of fails) console.error(`  ${f}`);
    process.exit(1);
}
console.log(`${NAME}: PASS -- clauses enforced: stage-line, artifact-digest, mode-carry, orca-automerge`);
