#!/usr/bin/env node
// scripts/verify-labels.mjs
//
// The labels agreement row (Phase 42, GH-13 static half, and GH-01). Every
// label an issue form or a workflow issue-label writer names must be declared
// in .github/settings/labels.json, the set the repo-controls row reads back
// from the live repository.
//
//  1. Declared set. labels.json parses, carries a non-empty labels array, each
//     entry with a name, and no two names equal ignoring case.
//  2. Forms. .github/ISSUE_TEMPLATE/ holds exactly bug.yml, feature.yml and
//     config.yml. The bug form names type/bug and needs-triage and carries the
//     text fields version, os and install_format under their frozen ids. The
//     feature form names type/feature and needs-triage.
//  3. Workflow writers. Every .github/workflows/*.yml is parsed, and only
//     label writers are read: a run: command, with backslash continuations
//     joined, calling gh issue or gh pr create or edit with --label, --label=,
//     --add-label or -l; a gh api .../labels call with a labels[] body field; a
//     step whose uses: names a label or issue action and whose with.labels is
//     set; and a github-script step whose script calls addLabels or sets a
//     labels: [ ... ] array of quoted names. runs-on is never read, so a runner
//     name can never satisfy the agreement. A label held in a variable is not
//     read here and is not checked.
//  4. Agreement. Every referenced label equals a declared name exactly, case
//     sensitive. A declared label that no form or workflow names is a triage
//     label applied by hand and is not a fault.
//  5. Config. config.yml sets blank_issues_enabled: false explicitly and carries
//     contact links, each with name, url and about, one pointing at the
//     repository security policy and one at Discussions.
//  6. Vacuity. No form that references any label is a FAIL: an agreement over
//     nothing is vacuous.
//
// Failures print sorted by file, then label, then text, so two runs over one
// tree print identical output. This row reads files and parses YAML (js-yaml
// from theia/) and writes nothing. No build, browser, display or network. The
// --self-test plants each fault in memory through runChecks' overrides.

import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'labels';
const SELF_REL = 'scripts/verify-labels.mjs';
const LABELS_REL = '.github/settings/labels.json';
const FORMS_DIR = '.github/ISSUE_TEMPLATE';
const WORKFLOWS_DIR = '.github/workflows';
const FORM_FILES = Object.freeze(['bug.yml', 'feature.yml', 'config.yml']);
// The labels each form must name, and the text fields the bug form freezes for the in-app report link.
const REQUIRED_LABELS = Object.freeze({
    'bug.yml': Object.freeze(['type/bug', 'needs-triage']),
    'feature.yml': Object.freeze(['type/feature', 'needs-triage']),
});
const BUG_IDS = Object.freeze(['version', 'os', 'install_format']);

const args = process.argv.slice(2);
for (const a of args) {
    if (a !== '--self-test') {
        console.error(`${NAME}: FAIL -- unknown argument '${a}'`);
        console.error(`  Next step: run: node ${SELF_REL}, or add --self-test to prove the agreement discriminates.`);
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

const show = (v) => JSON.stringify(v ?? null);
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const firstLine = (e) => String(e?.message ?? e).split('\n')[0];

// The tree this row reads: the real files, with overrides for the self-test.
// overrides.extra maps a path to the text that replaces or adds that file;
// overrides.hidden lists paths or directories the listing omits.
function tree(root, overrides = {}) {
    const extra = overrides.extra ?? {};
    const hidden = overrides.hidden ?? [];
    const isHidden = (rel) => hidden.some(h => rel === h || rel.startsWith(`${h}/`));
    return {
        read(rel) {
            if (Object.hasOwn(extra, rel)) return extra[rel];
            return readFileSync(join(root, rel), 'utf8');
        },
        list(dir) {
            let real = [];
            try {
                real = readdirSync(join(root, dir));
            } catch { /* an absent directory lists as empty; the vacuity check reports it */ }
            const prefix = `${dir}/`;
            const added = Object.keys(extra).filter(p => p.startsWith(prefix) && !p.slice(prefix.length).includes('/')).map(p => p.slice(prefix.length));
            return [...new Set([...real, ...added])].filter(n => !isHidden(`${dir}/${n}`)).sort(cmp);
        },
    };
}

// Lists a label value: a scalar or a list, comma-separated inside a scalar.
function labelValues(rel, value, fail) {
    const items = Array.isArray(value) ? value : [value];
    const out = [];
    for (const x of items) {
        if (typeof x !== 'string') {
            fail(rel, show(x), `${rel}: label entry ${show(x)} is not text. Next step: write the label name as text.`);
            continue;
        }
        for (const part of x.split(',')) {
            const s = part.trim();
            if (s !== '') out.push(s);
        }
    }
    return out;
}

// A backslash at a line end continues the command, so run: text is joined before any line is matched.
const joinContinuations = (text) => text.replace(/\\\r?\n[ \t]*/g, ' ');
const ISSUE_CMD = /\bgh\s+(?:issue|pr)\s+(?:create|edit)\b/;
// --label x, --label=x, --label "x", --add-label x, and -l x. The -l form needs a
// leading space, so a flag such as --tail is not read as a label.
const LABEL_FLAG = /(?:--(?:add-)?label|(?<=\s)-l)(?:\s+|=)(?:"([^"]*)"|'([^']*)'|([^\s"']+))/g;
// gh api .../labels with a labels[] or labels body field, given by -f, -F, --field or --raw-field.
const API_LABELS_PATH = /\bgh\s+api\b.*\/labels\b/;
const API_LABEL_FIELD = /(?:-f|-F|--field|--raw-field)(?:\s+|=)["']?labels(?:\[\])?=([^\s"']+)/g;
// github-script: the quoted names inside a labels: [ ... ] array, in a script that adds labels.
const SCRIPT_WRITER = /\baddLabels\s*\(|\blabels\s*:/;
const SCRIPT_LABEL_ARRAY = /\blabels\s*:\s*\[([^\]]*)\]/g;
const SCRIPT_LITERAL = /(['"])([^'"\n]*)\1/g;

function workflowWriters(rel, doc, addRef) {
    const jobs = isObj(doc?.jobs) ? Object.values(doc.jobs) : [];
    for (const job of jobs) {
        const steps = Array.isArray(job?.steps) ? job.steps : [];
        for (const step of steps) {
            if (typeof step?.run === 'string') {
                for (const line of joinContinuations(step.run).split('\n')) {
                    if (ISSUE_CMD.test(line)) {
                        for (const m of line.matchAll(LABEL_FLAG)) {
                            for (const label of labelValues(rel, m[1] ?? m[2] ?? m[3], () => {})) addRef(rel, label);
                        }
                    }
                    if (API_LABELS_PATH.test(line)) {
                        for (const m of line.matchAll(API_LABEL_FIELD)) {
                            for (const label of labelValues(rel, m[1], () => {})) addRef(rel, label);
                        }
                    }
                }
            }
            const w = step?.with;
            if (isObj(w) && w.labels !== undefined && typeof step.uses === 'string' && /label|issue/i.test(step.uses)) {
                for (const label of labelValues(rel, w.labels, () => {})) addRef(rel, label);
            }
            if (isObj(w) && typeof w.script === 'string' && /github-script/i.test(String(step.uses)) && SCRIPT_WRITER.test(w.script)) {
                for (const m of w.script.matchAll(SCRIPT_LABEL_ARRAY)) {
                    for (const lit of m[1].matchAll(SCRIPT_LITERAL)) {
                        if (lit[2].trim() !== '') addRef(rel, lit[2].trim());
                    }
                }
            }
        }
    }
}

function parseFile(t, rel, fail) {
    let text;
    try {
        text = t.read(rel);
    } catch (e) {
        fail(rel, '', `${rel} could not be read (${firstLine(e)}). Next step: restore it from git.`);
        return undefined;
    }
    try {
        return yaml.load(text);
    } catch (e) {
        fail(rel, '', `${rel} could not be parsed as YAML (${firstLine(e)}). Next step: fix the file.`);
        return undefined;
    }
}

function declaredSet(t, fail) {
    let body;
    try {
        body = JSON.parse(t.read(LABELS_REL));
    } catch (e) {
        fail(LABELS_REL, '', `${LABELS_REL} could not be read as JSON (${firstLine(e)}). Next step: fix the file.`);
        return null;
    }
    const list = isObj(body) && Array.isArray(body.labels) ? body.labels : null;
    if (list === null || list.length === 0) {
        fail(LABELS_REL, '', `${LABELS_REL} has no labels array, or it is empty, so no label is declared. Next step: restore the declared set from git.`);
        return null;
    }
    const names = [];
    for (const l of list) {
        if (typeof l?.name === 'string' && l.name !== '') names.push(l.name);
        else fail(LABELS_REL, show(l?.name), `${LABELS_REL}: entry ${show(l)} has no name. Next step: give it a name.`);
    }
    const byKey = new Map();
    for (const n of names) byKey.set(n.toLowerCase(), [...(byKey.get(n.toLowerCase()) ?? []), n]);
    for (const k of [...byKey.keys()].sort(cmp)) {
        const same = byKey.get(k);
        if (same.length > 1) {
            fail(LABELS_REL, same[0], `${LABELS_REL}: declared names ${same.map(show).join(', ')} are one label when case is ignored, so the set holds a duplicate. Next step: keep one spelling.`);
        }
    }
    return new Set(names);
}

function checkBugFields(rel, doc, fail) {
    const body = Array.isArray(doc.body) ? doc.body : [];
    for (const id of BUG_IDS) {
        const entry = body.find(e => e?.id === id);
        if (entry === undefined || entry.type !== 'input') {
            fail(rel, id, `${rel}: field ${show(id)} is missing or is not a text input. Next step: restore it; the id is frozen for the in-app report link.`);
        }
    }
}

function checkConfig(rel, doc, fail) {
    if (!isObj(doc)) {
        fail(rel, '', `${rel} is not a mapping. Next step: fix the file.`);
        return;
    }
    if (doc.blank_issues_enabled !== false) {
        fail(rel, 'blank_issues_enabled', `${rel}: blank_issues_enabled is ${show(doc.blank_issues_enabled)}, not false, so blank issues stay open. Next step: set blank_issues_enabled: false.`);
    }
    const links = Array.isArray(doc.contact_links) ? doc.contact_links : [];
    if (links.length === 0) fail(rel, 'contact_links', `${rel}: contact_links is empty. Next step: add the security policy and Discussions links.`);
    links.forEach((l, i) => {
        for (const k of ['name', 'url', 'about']) {
            if (typeof l?.[k] !== 'string' || l[k] === '') {
                fail(rel, `contact_links[${i}]`, `${rel}: contact link ${i + 1} has no ${k}. Next step: give it a ${k}.`);
            }
        }
    });
    const urls = links.map(l => String(l?.url ?? ''));
    if (!urls.some(u => u.includes('/security/policy'))) {
        fail(rel, 'security', `${rel}: no contact link points at the security policy. Next step: add a link to the repository security policy (GH-14).`);
    }
    if (!urls.some(u => u.includes('/discussions'))) {
        fail(rel, 'discussions', `${rel}: no contact link points at Discussions. Next step: add a link to the Discussions index.`);
    }
}

export function runChecks(root, overrides = {}) {
    const t = tree(root, overrides);
    const found = [];
    const fail = (file, label, text) => found.push({ file, label: String(label ?? ''), text });
    const refs = [];
    const addRef = (file, label) => {
        if (label.includes('${')) {
            fail(file, label, `${file}: label ${show(label)} is an expression, which this row cannot read. Next step: write the label name literally.`);
            return;
        }
        refs.push({ file, label });
    };

    const declared = declaredSet(t, fail);

    const listed = t.list(FORMS_DIR);
    for (const f of listed.filter(x => !FORM_FILES.includes(x))) {
        fail(`${FORMS_DIR}/${f}`, f, `${FORMS_DIR}/${f} is not one of the forms this row allows (bug.yml, feature.yml, config.yml). Next step: delete it, or change this row in a reviewed commit.`);
    }
    for (const f of FORM_FILES.filter(x => !listed.includes(x))) {
        fail(`${FORMS_DIR}/${f}`, f, `${FORMS_DIR}/${f} is missing. Next step: restore it from git.`);
    }
    for (const f of FORM_FILES.filter(x => listed.includes(x))) {
        const rel = `${FORMS_DIR}/${f}`;
        const doc = parseFile(t, rel, fail);
        if (doc === undefined) continue;
        if (f === 'config.yml') {
            checkConfig(rel, doc, fail);
            continue;
        }
        if (!isObj(doc)) {
            fail(rel, '', `${rel} is not a mapping. Next step: fix the file.`);
            continue;
        }
        const names = labelValues(rel, doc.labels, fail);
        for (const label of names) addRef(rel, label);
        for (const need of REQUIRED_LABELS[f] ?? []) {
            if (!names.includes(need)) fail(rel, need, `${rel}: required label ${show(need)} is not named. Next step: restore it; the form must carry it.`);
        }
        if (f === 'bug.yml') checkBugFields(rel, doc, fail);
    }

    for (const f of t.list(WORKFLOWS_DIR).filter(x => /\.ya?ml$/.test(x))) {
        const rel = `${WORKFLOWS_DIR}/${f}`;
        const doc = parseFile(t, rel, fail);
        if (doc !== undefined) workflowWriters(rel, doc, addRef);
    }

    if (declared !== null) {
        for (const r of refs) {
            if (!declared.has(r.label)) {
                fail(r.file, r.label, `${r.file}: label ${show(r.label)} is not declared in ${LABELS_REL}. Next step: declare it there in a reviewed commit, or change ${r.file} to a declared label.`);
            }
        }
    }
    if (!refs.some(r => r.file.startsWith(`${FORMS_DIR}/`))) {
        fail(FORMS_DIR, '', `${FORMS_DIR}: no form references any label, so the agreement would be vacuous. Next step: restore the bug and feature forms, which name their labels.`);
    }

    found.sort((a, b) => cmp(a.file, b.file) || cmp(a.label, b.label) || cmp(a.text, b.text));
    return { failures: found.map(f => f.text), refs: refs.length, forms: listed.length };
}

function main() {
    const { failures, refs, forms } = runChecks(REPO_ROOT);
    if (failures.length > 0) {
        console.error(`${NAME}: FAIL -- ${failures.length} problem(s) between the issue forms, the workflows and ${LABELS_REL}`);
        failures.forEach(f => console.error(`  ${f}`));
        return 1;
    }
    console.log(`${NAME}: PASS -- ${refs} label reference(s) in ${forms} issue form file(s) and the workflow issue-label writers are declared in ${LABELS_REL}`);
    return 0;
}

// --- self-test --------------------------------------------------------------

const readTree = (rel) => readFileSync(join(REPO_ROOT, rel), 'utf8');
const formPlant = (rel, mutate) => ({ extra: { [rel]: yaml.dump(mutate(yaml.load(readTree(rel)))) } });
const labelsPlant = (mutate) => {
    const body = JSON.parse(readTree(LABELS_REL));
    mutate(body);
    return { extra: { [LABELS_REL]: `${JSON.stringify(body, null, 2)}\n` } };
};
const workflowPlant = (name, runsOn, run) => ({
    extra: {
        [`${WORKFLOWS_DIR}/${name}`]: `on: workflow_dispatch\njobs:\n  triage:\n    runs-on: [${runsOn}]\n    steps:\n      - run: ${JSON.stringify(run)}\n`,
    },
});
const stepPlant = (name, step) => ({
    extra: { [`${WORKFLOWS_DIR}/${name}`]: yaml.dump({ on: 'workflow_dispatch', jobs: { triage: { 'runs-on': 'ubuntu-latest', steps: [step] } } }) },
});
const SCRIPT = 'actions/github-script@v7';
const merged = (...plants) => ({ extra: Object.assign({}, ...plants.map(p => p.extra ?? {})), hidden: plants.flatMap(p => p.hidden ?? []) });

const BUG = `${FORMS_DIR}/bug.yml`;
const FEATURE = `${FORMS_DIR}/feature.yml`;
const CONFIG = `${FORMS_DIR}/config.yml`;

function selfTest() {
    const base = runChecks(REPO_ROOT);
    if (base.failures.length > 0) {
        console.error(`${NAME}: --self-test FAIL -- the tree is not green, so the planted-fault results below would mean nothing:`);
        base.failures.forEach(f => console.error(`  ${f}`));
        return 1;
    }
    console.log(`  ok  baseline: the tree agrees -> green (${base.refs} reference(s) in ${base.forms} form file(s))`);

    const plants = [
        ['an undeclared label in a form', formPlant(BUG, d => { d.labels.push('planted-undeclared'); return d; }), [BUG, 'planted-undeclared']],
        ['an undeclared label in a workflow snippet', workflowPlant('planted-labels.yml', 'self-hosted, legion', 'gh issue edit 1 --add-label planted-undeclared'), ['planted-labels.yml', 'planted-undeclared']],
        ['a case-variant form label', formPlant(BUG, d => { d.labels = ['Type/Bug', 'needs-triage']; return d; }), ['"Type/Bug"', 'not declared']],
        ['a --label flag with a space', workflowPlant('planted-space.yml', 'ubuntu-latest', 'gh issue edit 1 --label planted-undeclared'), ['planted-space.yml', 'planted-undeclared']],
        ['a --label=value flag', workflowPlant('planted-equals.yml', 'ubuntu-latest', 'gh issue edit 1 --label=planted-undeclared'), ['planted-equals.yml', 'planted-undeclared']],
        ['a -l short flag', workflowPlant('planted-short.yml', 'ubuntu-latest', 'gh issue create --title x -l planted-undeclared'), ['planted-short.yml', 'planted-undeclared']],
        ['a --label on a backslash-continued line', stepPlant('planted-continued.yml', { run: 'gh issue create \\\n  --title planted \\\n  --label planted-undeclared' }), ['planted-continued.yml', 'planted-undeclared']],
        ['a gh api labels body field', stepPlant('planted-api.yml', { run: 'gh api repos/o/r/issues/1/labels -f labels[]=planted-undeclared' }), ['planted-api.yml', 'planted-undeclared']],
        ['a github-script addLabels array', stepPlant('planted-addlabels.yml', { uses: SCRIPT, with: { script: "await github.rest.issues.addLabels({ owner, repo, issue_number: 1, labels: ['planted-undeclared'] });" } }), ['planted-addlabels.yml', 'planted-undeclared']],
        ['a github-script labels array', stepPlant('planted-array.yml', { uses: SCRIPT, with: { script: 'await github.rest.issues.create({ owner, repo, title: "x", labels: ["planted-undeclared"] });' } }), ['planted-array.yml', 'planted-undeclared']],
        ['an expression as a workflow label', workflowPlant('planted-labels.yml', 'ubuntu-latest', 'gh issue edit 1 --add-label "${{ inputs.label }}"'), ['planted-labels.yml', 'expression']],
        ['a malformed labels.json', { extra: { [LABELS_REL]: '{ "labels": [ ' } }, [LABELS_REL, 'JSON']],
        ['a case-variant duplicate in labels.json', labelsPlant(b => { b.labels.push({ name: 'TYPE/BUG', color: 'd73a4a', description: 'planted' }); }), ['"TYPE/BUG"', 'one label']],
        ['zero issue forms', { hidden: [FORMS_DIR] }, [FORMS_DIR, 'no form']],
        ['an extra issue form', { extra: { [`${FORMS_DIR}/extra.yml`]: 'name: Extra\ndescription: planted\nbody: []\n' } }, ['extra.yml', 'not one of the forms']],
        ['feature.yml removed', { hidden: [FEATURE] }, [FEATURE, 'missing']],
        ['bug form drops needs-triage', formPlant(BUG, d => { d.labels = ['type/bug']; return d; }), [BUG, 'needs-triage']],
        ['bug form field os renamed', formPlant(BUG, d => { d.body.find(e => e.id === 'os').id = 'operating_system'; return d; }), [BUG, '"os"']],
        ['config.yml with blank issues on', formPlant(CONFIG, d => { d.blank_issues_enabled = true; return d; }), [CONFIG, 'blank_issues_enabled']],
        ['config.yml without a Discussions link', formPlant(CONFIG, d => { d.contact_links = d.contact_links.filter(l => !l.url.includes('/discussions')); return d; }), [CONFIG, 'Discussions']],
        ['config.yml contact link without about', formPlant(CONFIG, d => { delete d.contact_links[0].about; return d; }), [CONFIG, 'about']],
        ['a duplicate key in a form', { extra: { [BUG]: `${readTree(BUG)}\nlabels: ["planted"]\n` } }, [BUG, 'could not be parsed']],
    ];

    let failed = 0;
    for (const [name, overrides, needles] of plants) {
        const { failures } = runChecks(REPO_ROOT, overrides);
        if (failures.some(f => needles.every(n => f.includes(n)))) {
            console.log(`  ok  ${name} -> red, naming ${needles.map(n => `'${n}'`).join(' and ')}`);
        } else {
            console.error(`${NAME}: --self-test FAIL -- '${name}' did not go red naming ${needles.join(' and ')}; got: ${failures.join(' | ') || '(no failures at all)'}`);
            failed += 1;
        }
    }

    const controls = [
        ['a runner name in runs-on that no label declares', workflowPlant('planted-runner.yml', 'self-hosted, planted-undeclared', 'echo ok')],
        ['a quoted label with a space, declared and used', merged(
            labelsPlant(b => { b.labels.push({ name: 'good first issue', color: '7057ff', description: 'planted' }); }),
            formPlant(BUG, d => { d.labels.push('good first issue'); return d; }),
        )],
    ];
    for (const [name, overrides] of controls) {
        const { failures } = runChecks(REPO_ROOT, overrides);
        if (failures.length === 0) {
            console.log(`  ok  control: ${name} -> green`);
        } else {
            console.error(`${NAME}: --self-test FAIL -- the control '${name}' went red: ${failures.join(' | ')}`);
            failed += 1;
        }
    }

    if (failed > 0) return 1;
    console.log(`${NAME}: --self-test PASS -- ${plants.length} planted faults went red naming the file and label, and ${controls.length} control(s) stayed green`);
    return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    process.exit(args.includes('--self-test') ? selfTest() : main());
}
