#!/usr/bin/env node
// scripts/verify-releasing-support-ops.mjs
//
// The releasing-support-ops row (Phase 53, DOC-07 and the static half of GH-17). The
// "Support operations" section of docs/RELEASING.md must agree with the automation it
// describes. Everything is derived from the tree at check time and compared as set
// equality, so a removal and an addition both go red:
//
//  workflows   every workflow the section describes has one bullet line
//              ("- `x.yml` trigger `e.t`; job ids `a`, `b`; environment `env`; model `m`; template ids `t1`, `t2`").
//              The workflows that must be described are derived: every workflow with an issue or
//              discussion trigger, plus every workflow the section names. For each, the documented
//              triggers (event, or event.type), job ids, environments, model and template ids must
//              equal what the workflow file defines. Template ids are the keys of the workflow's
//              fixed-comment table; the model is the --model argument of its claude_args.
//  window      the SECURITY.md sentence that states the acknowledgement window is quoted verbatim in
//              the private-reports subsection. A missing SECURITY.md fails closed, naming the file.
//  flags       the private-reporting flag and the Discussions flag, the code-scanning setup state and
//              languages, and the fork approval policy each equal the tracked settings body.
//  rules       the Discussions moderation, CodeQL-after-rebase and fork-approval rule lines exist in
//              their own subsections; the five DOC-07 subsections each exist.
//
// Honestly --quick: text reads and js-yaml from theia/ only. No network, gh, build or display.
//
// Usage:
//   node scripts/verify-releasing-support-ops.mjs
//   node scripts/verify-releasing-support-ops.mjs --self-test

import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'releasing-support-ops';
const SELF_REL = 'scripts/verify-releasing-support-ops.mjs';
const DOC_REL = 'docs/RELEASING.md';
const SECURITY_REL = 'SECURITY.md';
const WORKFLOWS_REL = '.github/workflows';
const PVR_REL = '.github/settings/private-vulnerability-reporting.json';
const FORK_REL = '.github/settings/fork-pr-approval.json';
const SCAN_REL = '.github/settings/code-scanning-default-setup.json';
const REPO_SETTINGS_REL = '.github/settings/repo.json';
const SECTION_HEADING = '## Support operations';
// The five items DOC-07 names, one subsection each.
const SUBSECTIONS = Object.freeze({
    triage: '### Issue triage',
    discussions: '### Discussions moderation',
    reports: '### Private vulnerability reports',
    codeql: '### CodeQL alerts after each rebase',
    fork: '### Fork pull request approval',
});
const SUPPORT_EVENTS = /^(issues|issue_comment|discussion|discussion_comment)$/;
const CLAUSES = ['trigger', 'job ids', 'environment', 'model', 'template ids'];

const args = process.argv.slice(2);
for (const a of args) {
    if (a !== '--self-test') {
        console.error(`${NAME}: FAIL -- unknown argument '${a}'`);
        console.error(`  Next step: run: node ${SELF_REL}, or add --self-test to prove the rules discriminate.`);
        process.exit(2);
    }
}

let yaml;
try {
    yaml = createRequire(join(REPO_ROOT, 'theia', 'package.json'))('js-yaml');
} catch {
    console.error(`${NAME}: FAIL -- broken instrument: js-yaml is not installed in theia/ (run yarn install in theia/ first)`);
    process.exit(1);
}

const codeSpans = text => [...text.matchAll(/`([^`\n]+)`/g)].map(m => m[1]);
const setOf = xs => [...new Set(xs)].sort();
const listItem = line => line.replace(/^\s*[-*]\s+/, '');

/** The text of a heading's block: up to the next heading of the same or a higher level. */
function block(text, heading) {
    const lines = text.split('\n');
    const start = lines.findIndex(l => l.trimEnd() === heading);
    if (start < 0) return null;
    const level = heading.match(/^#+/)[0].length;
    let end = lines.length;
    for (let i = start + 1; i < lines.length; i++) {
        const m = lines[i].match(/^(#+)\s/);
        if (m && m[1].length <= level) { end = i; break; }
    }
    return lines.slice(start + 1, end).join('\n');
}

/** The first list line that starts with the lead, without its marker; null when absent. */
const leadLine = (text, lead) => text.split('\n').map(listItem).find(l => l.startsWith(lead)) ?? null;

// ---------------------------------------------------------------------------
// Derivation from the workflow files
// ---------------------------------------------------------------------------

/** What a workflow file defines, in the five kinds the section documents. Throws on bad YAML. */
export function deriveWorkflow(text) {
    const doc = yaml.load(text);
    const on = doc?.on ?? doc?.[true] ?? {};
    const triggers = [];
    if (typeof on === 'string') triggers.push(on);
    else if (Array.isArray(on)) triggers.push(...on);
    else {
        for (const [event, cfg] of Object.entries(on)) {
            const types = cfg && Array.isArray(cfg.types) ? cfg.types : [];
            if (types.length === 0) triggers.push(event);
            for (const t of types) triggers.push(`${event}.${t}`);
        }
    }
    const jobs = doc?.jobs ?? {};
    const environments = Object.values(jobs)
        .map(j => (typeof j?.environment === 'string' ? j.environment : j?.environment?.name))
        .filter(e => typeof e === 'string');
    const models = [...text.matchAll(/--model\s+([A-Za-z0-9._-]+)/g)].map(m => m[1]);
    // shortcut: the fixed-comment table is found by its name, TEXT, as the triage workflow
    // writes it; upgrade to a structured parse if a second workflow carries a different shape.
    const tableStart = text.indexOf('const TEXT = {');
    const templates = [];
    if (tableStart >= 0) {
        const rest = text.slice(tableStart).split('\n').slice(1);
        for (const line of rest) {
            if (/^\s*};/.test(line)) break;
            const m = line.match(/^\s*(?:'([^']+)'|"([^"]+)"|([A-Za-z_][\w-]*))\s*:/);
            if (m) templates.push(m[1] ?? m[2] ?? m[3]);
        }
    }
    return {
        trigger: setOf(triggers),
        'job ids': setOf(Object.keys(jobs)),
        environment: setOf(environments),
        model: setOf(models),
        'template ids': setOf(templates),
    };
}

/** The section's workflow bullets: file name to the spans of each clause. */
function documentedWorkflows(section) {
    const out = new Map();
    for (const raw of section.split('\n')) {
        const line = listItem(raw);
        const head = raw.match(/^\s*[-*]\s+`([\w.-]+\.ya?ml)`/);
        if (!head) continue;
        const facts = Object.fromEntries(CLAUSES.map(c => [c, []]));
        for (const clause of line.split(';')) {
            const m = clause.match(new RegExp(`\\b(${CLAUSES.join('|')})\\b`));
            if (m) facts[m[1]].push(...codeSpans(clause.slice(m.index + m[0].length)));
        }
        out.set(head[1], Object.fromEntries(Object.entries(facts).map(([k, v]) => [k, setOf(v)])));
    }
    return out;
}

function diffSets(documented, derived) {
    return {
        missing: derived.filter(x => !documented.includes(x)),
        extra: documented.filter(x => !derived.includes(x)),
    };
}

// ---------------------------------------------------------------------------
// THE gate, a pure function of the inputs so the self-test can plant faults in memory
// ---------------------------------------------------------------------------

/**
 * inputs: { doc, security, workflows: {file: text}, pvr, repo, scan, fork }. A missing file is null.
 * Returns { failures, facts } where facts counts what was compared.
 */
export function checkSupportOps(inputs) {
    const failures = [];
    const fail = (msg, next) => failures.push(`${msg} Next step: ${next}`);
    let facts = 0;

    if (inputs.doc === null) {
        fail(`${DOC_REL} is missing, so there is no support-operations section to compare.`, `restore ${DOC_REL} and its "Support operations" section, then re-run this check.`);
        return { failures, facts };
    }
    const section = block(inputs.doc, SECTION_HEADING);
    if (section === null) {
        fail(`${DOC_REL} has no "${SECTION_HEADING.replace(/^#+\s/, '')}" section.`, `add the support-operations section to ${DOC_REL}, then re-run this check.`);
        return { failures, facts };
    }

    const subs = {};
    for (const [key, heading] of Object.entries(SUBSECTIONS)) {
        subs[key] = block(section, heading);
        if (subs[key] === null) {
            fail(`the support-operations section has no "${heading.replace(/^#+\s/, '')}" subsection.`, `add that subsection to ${DOC_REL}, then re-run this check.`);
        } else facts++;
    }

    // workflows
    const derived = new Map();
    for (const [file, text] of Object.entries(inputs.workflows)) {
        try {
            derived.set(file, deriveWorkflow(text));
        } catch (e) {
            fail(`${WORKFLOWS_REL}/${file} does not parse as a workflow (${String(e.message).split('\n')[0]}).`, `fix the YAML in ${file}, then re-run this check.`);
        }
    }
    const documented = documentedWorkflows(section);
    for (const file of documented.keys()) {
        if (!derived.has(file) && !(file in inputs.workflows)) {
            fail(`the support-operations section describes ${file}, which is not under ${WORKFLOWS_REL}.`, `remove the ${file} line from the section or restore the workflow, then re-run this check.`);
        }
    }
    const required = new Set(documented.keys());
    for (const [file, d] of derived) if (d.trigger.some(t => SUPPORT_EVENTS.test(t.split('.')[0]))) required.add(file);
    for (const file of [...required].sort()) {
        const d = derived.get(file);
        if (!d) continue;
        const doc = documented.get(file);
        if (!doc) {
            fail(`${file} reacts to issue or discussion events, but the support-operations section has no line for it.`, `add a "- \`${file}\` trigger ...; job ids ...;" line to the section, then re-run this check.`);
            continue;
        }
        for (const kind of CLAUSES) {
            const { missing, extra } = diffSets(doc[kind], d[kind]);
            for (const x of missing) fail(`${file} defines ${kind === 'trigger' ? 'trigger' : kind.replace(/s$/, '')} '${x}', which the section does not list.`, `add \`${x}\` to the ${kind} clause of the ${file} line, then re-run this check.`);
            for (const x of extra) fail(`the section lists ${kind === 'trigger' ? 'trigger' : kind.replace(/s$/, '')} '${x}' for ${file}, which the workflow no longer defines.`, `remove or rename \`${x}\` in the ${kind} clause of the ${file} line to match the workflow, then re-run this check.`);
            facts += d[kind].length;
        }
    }

    // window, read-and-fail-closed
    if (subs.reports !== null) {
        if (inputs.security === null) {
            fail(`${SECURITY_REL} is missing, so the acknowledgement window cannot be quoted.`, `restore ${SECURITY_REL} with its "What to expect" window sentence, then re-run this check.`);
        } else {
            const sentence = inputs.security.split('\n').map(listItem).find(l => /acknowledge/i.test(l) && /\bwithin\b/i.test(l));
            if (!sentence) {
                fail(`${SECURITY_REL} has no sentence that states an acknowledgement window.`, `state the window in ${SECURITY_REL}, then re-run this check.`);
            } else if (!subs.reports.includes(sentence.trim())) {
                fail(`the private-reports subsection does not quote the ${SECURITY_REL} acknowledgement sentence: "${sentence.trim()}".`, `quote that sentence verbatim in the private-reports subsection, then re-run this check.`);
            } else facts++;
        }
    }

    // flags and policies read back from the tracked settings bodies
    const flag = (sub, lead, want, source, what) => {
        if (sub === null) return;
        const line = leadLine(sub, lead);
        const got = line === null ? [] : codeSpans(line);
        if (want === undefined) {
            fail(`${source} does not carry ${what}, so the section cannot be compared.`, `restore ${source}, then re-run this check.`);
        } else if (got[0] !== want) {
            fail(`the section says ${lead.replace(/:$/, '')} is '${got[0] ?? '(missing)'}', but ${source} says '${want}'.`, `make the "${lead}" line read \`${want}\`, or correct ${source}, then re-run this check.`);
        } else facts++;
    };
    const onOff = v => (typeof v === 'boolean' ? (v ? 'enabled' : 'disabled') : undefined);
    flag(subs.reports, 'Private vulnerability reporting:', onOff(inputs.pvr?.enabled), PVR_REL, 'an enabled flag');
    flag(subs.discussions, 'Discussions:', onOff(inputs.repo?.has_discussions), REPO_SETTINGS_REL, 'a has_discussions flag');
    flag(subs.codeql, 'Default setup state:', inputs.scan?.state, SCAN_REL, 'a state');
    flag(subs.fork, 'Approval policy:', inputs.fork?.approval_policy, FORK_REL, 'an approval policy');
    if (subs.codeql !== null && Array.isArray(inputs.scan?.languages)) {
        const line = leadLine(subs.codeql, 'Default setup languages:');
        const { missing, extra } = diffSets(setOf(line === null ? [] : codeSpans(line)), setOf(inputs.scan.languages));
        for (const x of missing) fail(`${SCAN_REL} scans language '${x}', which the section does not list.`, `add \`${x}\` to the "Default setup languages:" line, then re-run this check.`);
        for (const x of extra) fail(`the section lists scanned language '${x}', which ${SCAN_REL} does not carry.`, `remove \`${x}\` from the "Default setup languages:" line, then re-run this check.`);
        facts += inputs.scan.languages.length;
    }

    // rule lines
    const rule = (sub, lead, must, label) => {
        if (sub === null) return;
        const line = leadLine(sub, lead);
        if (line === null || !line.includes(must)) {
            fail(`the ${label} subsection has no "${lead}" line stating "${must}".`, `write the ${label.toLowerCase()} rule as a "${lead}" line in that subsection, then re-run this check.`);
        } else facts++;
    };
    rule(subs.discussions, 'Discussions moderation rule:', 'vulnerability', 'Discussions moderation');
    rule(subs.codeql, 'CodeQL rule:', 'rebase', 'CodeQL');
    rule(subs.fork, 'Fork approval rule:', 'without reading its diff', 'fork pull request approval');

    return { failures, facts };
}

// ---------------------------------------------------------------------------
// Tree loading and main
// ---------------------------------------------------------------------------

const readOrNull = rel => { try { return readFileSync(join(REPO_ROOT, rel), 'utf8'); } catch { return null; } };
const jsonOrNull = rel => { const t = readOrNull(rel); try { return t === null ? null : JSON.parse(t); } catch { return null; } };

function loadInputs() {
    const workflows = {};
    for (const f of readdirSync(join(REPO_ROOT, WORKFLOWS_REL)).filter(n => /\.ya?ml$/.test(n)).sort()) {
        workflows[f] = readFileSync(join(REPO_ROOT, WORKFLOWS_REL, f), 'utf8');
    }
    return {
        doc: readOrNull(DOC_REL),
        security: readOrNull(SECURITY_REL),
        workflows,
        pvr: jsonOrNull(PVR_REL),
        repo: jsonOrNull(REPO_SETTINGS_REL),
        scan: jsonOrNull(SCAN_REL),
        fork: jsonOrNull(FORK_REL),
    };
}

function main() {
    const { failures, facts } = checkSupportOps(loadInputs());
    if (failures.length > 0) {
        console.error(`${NAME}: FAIL -- ${failures.length} problem(s) between ${DOC_REL} and the tree`);
        for (const f of failures.sort()) console.error(`  - ${f}`);
        process.exit(1);
    }
    console.log(`${NAME}: PASS -- the support-operations section agrees with the tree on ${facts} derived fact(s)`);
}

// ---------------------------------------------------------------------------
// Self-test: a green control first, then in-memory plants, each red naming the drift
// ---------------------------------------------------------------------------

function selfTest() {
    let failed = 0;
    let ok = 0;
    const complain = (name, why) => { console.error(`${NAME}: --self-test FAIL -- '${name}' ${why}`); failed++; };
    const base = loadInputs();

    const control = checkSupportOps(base);
    if (control.failures.length > 0) {
        complain('green control', `is already red, so the plants prove nothing: ${control.failures.join(' | ')}`);
        return 1;
    }
    console.log('  ok  unmutated tree -> green');
    ok++;

    const edit = (text, from, to) => {
        const out = text.replace(from, to);
        return out === text ? null : out;
    };
    const dropLine = (text, lead) => {
        const lines = text.split('\n');
        const kept = lines.filter(l => !listItem(l).startsWith(lead));
        return kept.length === lines.length ? null : kept.join('\n');
    };
    const wf = (file, from, to) => {
        const text = edit(base.workflows[file], from, to);
        return text === null ? null : { ...base, workflows: { ...base.workflows, [file]: text } };
    };
    const docOf = text => (text === null ? null : { ...base, doc: text });
    const securityLine = base.security === null ? '' : base.security.split('\n').map(listItem).find(l => /acknowledge/i.test(l) && /\bwithin\b/i.test(l)) ?? '';

    const plants = [
        ['a removed trigger', wf('triage.yml', /issues:\s*\n\s*types: \[opened\]/, 'workflow_dispatch:'), 'issues.opened'],
        ['a renamed job id', wf('triage.yml', /^ {2}classify:/m, '  classify-issue:'), 'classify'],
        ['a deleted template id', wf('triage.yml', /^\s*'feature-request':.*\n/m, ''), 'feature-request'],
        ['an added template id', wf('triage.yml', /^(\s*)other: '/m, "$1escalate: 'Thank you.',\n$1other: '"), 'escalate'],
        ['a changed environment', wf('triage.yml', 'environment: triage', 'environment: triage-key'), 'triage-key'],
        ['a changed model', wf('triage.yml', 'claude-haiku-5-5', 'claude-haiku-9'), 'claude-haiku-9'],
        ['a drill workflow removed from the tree', (() => { const w = { ...base.workflows }; delete w['notify-drill.yml']; return { ...base, workflows: w }; })(), 'notify-drill.yml'],
        ['the window sentence missing', docOf(edit(base.doc, securityLine, 'We answer soon.')), 'acknowledgement sentence'],
        ['the moderation rule missing', docOf(dropLine(base.doc, 'Discussions moderation rule:')), 'Discussions moderation rule:'],
        ['the CodeQL-after-rebase rule missing', docOf(dropLine(base.doc, 'CodeQL rule:')), 'CodeQL rule:'],
        ['the fork approval rule missing', docOf(dropLine(base.doc, 'Fork approval rule:')), 'Fork approval rule:'],
        ['a private-reporting flag turned off that the section still says is on', { ...base, pvr: { enabled: false } }, 'Private vulnerability reporting'],
        ['a fork approval policy changed', { ...base, fork: { approval_policy: 'first_time_contributors' } }, 'first_time_contributors'],
        ['a scanned language added', { ...base, scan: { ...base.scan, languages: [...base.scan.languages, 'python'] } }, 'python'],
        ['a missing security policy file', { ...base, security: null }, SECURITY_REL],
        ['the whole subsection of fork approval removed', docOf(edit(base.doc, SUBSECTIONS.fork, '### Fork notes')), 'Fork pull request approval'],
    ];

    for (const [name, inputs, mustName] of plants) {
        if (inputs === null) {
            complain(name, 'could not be planted: the scratch text did not change, so the pattern no longer matches the tree');
            continue;
        }
        const { failures } = checkSupportOps(inputs);
        const hit = failures.find(f => f.includes(mustName));
        if (!hit) complain(name, `did not go red naming '${mustName}'; got: ${failures.join(' | ') || '(no failures at all)'}`);
        else { console.log(`  ok  ${name} -> red, naming '${mustName}'`); ok++; }
    }

    // Controls that must stay green: a reordered clause list and extra prose around the lines.
    const reordered = edit(base.doc, 'job ids `classify`, `apply`', 'job ids `apply`, `classify`');
    if (reordered === null) complain('reordered job ids control', 'could not be planted');
    else if (checkSupportOps(docOf(reordered)).failures.length > 0) complain('reordered job ids control', 'went red, but order is not a fact');
    else { console.log('  ok  job ids listed in another order -> green'); ok++; }

    if (failed > 0) return 1;
    console.log(`${NAME}: --self-test PASS -- ${ok} checks behaved as pinned (the green control, ${plants.length} planted faults, and one order control)`);
    return 0;
}

if (args.includes('--self-test')) process.exit(selfTest());
else main();
