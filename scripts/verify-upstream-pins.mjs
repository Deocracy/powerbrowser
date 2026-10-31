#!/usr/bin/env node
// scripts/verify-upstream-pins.mjs
//
// The pin-agreement gate: both upstream pins are declared once in
// configuration.toml ([upstreams]) and every consumer reads that
// declaration. This check derives each expected pin from the manifest at
// check time via the vendored parser and asserts agreement in both
// directions.
//
// ESR half (05-02, UPD-01): firefox_esr_tag agreement over four steps:
//
//  1. generated/upstream-pins.env carries the manifest tag (stale output
//     fails naming the fragment and the rerun command). An absent
//     fragment SKIPS this step only: generated/ is git-ignored, so that
//     is the state of every fresh clone, and a gate red on it would be a
//     gate its readers skip (generate-check's own rule). A present but
//     unreadable fragment FAILs -- that is broken output, not a fresh
//     clone.
//  2. .github/workflows/rebase-upstream.yml carries no tag and no default
//     (Phase 40, AUTO-08): the caller passes the tag. Three assertions over
//     its text, each failing naming the workflow: (a) both a
//     workflow_dispatch and a workflow_call trigger declare a `tag` input;
//     (b) no `default:` key sits under any `tag` input; (c) every `run:`
//     command that invokes scripts/generate.mjs,
//     scripts/verify-generated-identity.mjs or scripts/rebase-upstream.sh
//     starts with `nix develop .#theia --command`, because generate.mjs
//     needs the pinned inkscape. Indentation-aware line scan, no YAML
//     library: scripts/ imports nothing from theia/node_modules.
//  3. scripts/fetch-upstream.sh's effective default equals the manifest
//     tag, resolved by PARSING, never by executing the clone path: the
//     script must source the fragment and must carry no tag literal of
//     its own. Either half missing fails naming the script.
//  4. No other in-scope tracked file carries a tag literal. Scope is the
//     build-relevant tree -- scripts/, theia/, .github/ and the root
//     toml/nix/mk files, read off `git ls-files` so the set is derived,
//     not kept. generated/ is excluded as derived output; .planning/ and
//     inventory/ are excluded as historical record, not build input
//     (they quote past pins the way they quote everything else, and
//     renaming history would destroy the provenance the project keeps).
//     The two allowed carriers -- the manifest (authoritative) and this
//     script's own self-test fixtures -- are excluded from the sweep by
//     path. The workflow is not a carrier: it holds no tag and is swept
//     like any other file.
//
// A tag literal is `FIREFOX_` followed by a digit. The narrower shape is
// deliberate: the variable and constant names around it (the fragment key,
// the driver's path constants) carry letters after the prefix, so a bare
// prefix match would flag every legitimate reader and the gate would
// train its readers to ignore it.
//
// Theia half (05-03, CFG-06/UPD-02): theia_release agreement over three
// steps. The generator never rewrites a package.json (GEN-04: generator
// output lands only under gitignored generated/, and package.json files
// are committed build input), so the manifest pin is the declaration and
// this check is the enforcement -- set-equality, failing by file name on
// any drift in either direction:
//
//  5. the manifest pin: upstreams.theia_release must be set and must be a
//     strict numeric triple (the schema enforces the same shape; the
//     re-check here names the dotted path, the way the ESR half does).
//  6. every @theia/* pin in theia/package.json resolutions and in every
//     member theia/applications/*/package.json and
//     theia/extensions/*/package.json (dependencies, devDependencies,
//     peerDependencies and optionalDependencies alike) equals the manifest
//     pin. The one exception is @theia/monaco-editor-core, excluded by
//     exact package name: it tracks upstream's own monaco line rather
//     than the Theia release (measured apart from the release at the time
//     of writing; the name, not the value, is what the exclusion keys
//     on). An empty resolutions block, an unreadable member, or zero
//     member files each fail naming the file -- an agreement over nothing
//     is vacuous, not clean. A manifest pin no @theia entry carries fails
//     naming the manifest.
//  7. every resolved @theia tarball stanza in theia/yarn.lock (same
//     exception) carries the manifest pin as its version. The stanza
//     version is the resolved tarball's version, so this is the lockfile
//     half of the agreement; the header ranges and the upstream-authored
//     transitive constraint lines inside stanzas are not asserted.
//
// Uptake lane (step 8, Phase 58, TRAIN-05/UPS-01): the 175 tag is not a second manifest key. It
// is the detector's uptake candidate, and the release-train uptake-replay job must take its tag from
// needs.detect.outputs.uptake-candidate and from nothing else. The literal sweep (step 4) covers the
// file's text; step 8 covers the job's source and the chain that carries the candidate there (the
// detector's uptake-candidate= line, the Decide allowlist and the detect job's output mapping, WR-04).
//
// Honestly --quick: it reads text files and runs one git ls-files. No
// clone, no fetch, no build, no browser, no display, no network.
//
// Usage:
//   node scripts/verify-upstream-pins.mjs
//   node scripts/verify-upstream-pins.mjs --self-test
//
// The self-test plants eight faults and requires each to go red naming the
// file -- five on the workflow (a default under the workflow_call tag, a
// default under the workflow_dispatch tag, the workflow_call trigger
// removed, a generator step outside nix develop, a tag literal in a
// comment), an ESR second literal under scripts/, a patch-bumped @theia pin
// in one member package.json, and a drifted @theia stanza version in the
// lockfile -- with the unmutated tree
// as the clean control proving each red is plant-caused. Every plant lands
// in memory: no tracked file is edited, not even temporarily.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parse } from './lib/toml.cjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'verify-upstream-pins';
const SELF_REL = 'scripts/verify-upstream-pins.mjs';

const args = process.argv.slice(2);
for (const a of args) {
    if (a !== '--self-test') {
        console.error(`${NAME}: FAIL -- unknown argument '${a}'`);
        console.error(`  Next step: run: node ${SELF_REL}, or add --self-test to prove the agreement discriminates.`);
        process.exit(2);
    }
}

const MANIFEST_REL = 'configuration.toml';
const FRAGMENT_REL = 'generated/upstream-pins.env';
const WORKFLOW_REL = '.github/workflows/rebase-upstream.yml';
const FETCH_REL = 'scripts/fetch-upstream.sh';
const FRAGMENT_KEY = 'FIREFOX_ESR_TAG';
const RERUN_GENERATE = 'node scripts/generate.mjs';

// A tag literal: the prefix followed by a digit. Reader names (the
// fragment key, driver constants) carry letters there and never match.
const TAG_LITERAL = /FIREFOX_[0-9][A-Za-z0-9._-]*/g;
const TAG_SHAPE = /^[A-Za-z0-9._-]+$/;
const PIN_DOTTED = 'upstreams.firefox_esr_tag';
const PIN_SECTION = '[upstreams]';

// The Theia half. The pin is a strict numeric triple; the shape is
// re-checked here (the schema enforces it too) so the failure names the
// dotted path instead of deferring to the generator's report.
const THEIA_DOTTED = 'upstreams.theia_release';
const THEIA_SHAPE = /^[0-9]+\.[0-9]+\.[0-9]+$/;
const THEIA_ROOT_REL = 'theia/package.json';
const THEIA_LOCK_REL = 'theia/yarn.lock';
const THEIA_MEMBER_PATTERN = /^theia\/(applications|extensions)\/[^/]+\/package\.json$/;
const THEIA_DEP_BLOCKS = Object.freeze(['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']);
// The one @theia package that does NOT track the release. Excluded by
// exact name everywhere below; see the step-6 comment.
const THEIA_MONACO_EXCEPTION = '@theia/monaco-editor-core';

function readBytes(root, rel) {
    const p = join(root, rel);
    if (!existsSync(p)) return null;
    return readFileSync(p);
}

// The in-scope set, derived from version control -- never a hand-kept
// list, which could only ever agree with the tree it was copied from.
function listTracked(root) {
    try {
        return execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' })
            .split('\n')
            .map(l => l.trim())
            .filter(l => l !== '');
    } catch {
        return null;
    }
}

function inScope(rel) {
    if (rel.startsWith('scripts/') || rel.startsWith('theia/') || rel.startsWith('.github/')) return true;
    if (!rel.includes('/')) {
        return /\.toml$/.test(rel) || /\.nix$/.test(rel) || /\.mk$/.test(rel)
            || rel === '.mozconfig' || rel.startsWith('Makefile');
    }
    return false;
}

// The allowed carriers: the manifest (authoritative) and this script
// (whose self-test plants tag-shaped fixtures). Everything else in scope,
// the rebase workflow included, must be clean.
function sweepExcluded(rel) {
    return rel.startsWith('generated/')
        || rel.startsWith('.planning/')
        || rel.startsWith('inventory/')
        || rel === MANIFEST_REL
        || rel === SELF_REL;
}

// --- workflow structure, by indentation (step 2) ------------------------------
// Commands that need the pinned toolchain, and the prefix that supplies it.
const NIX_SCRIPTS = Object.freeze(['scripts/generate.mjs', 'scripts/verify-generated-identity.mjs', 'scripts/rebase-upstream.sh']);
const NIX_PREFIX = 'nix develop .#theia --command ';
const WORKFLOW_TRIGGERS = Object.freeze(['workflow_dispatch', 'workflow_call']);

const indentOf = (line) => line.match(/^ */)[0].length;
const isContent = (line) => line.trim() !== '' && !line.trim().startsWith('#');
const keyRe = (key) => new RegExp(`^\\s*(?:-\\s+)?["']?${key}["']?\\s*:(?:\\s|$)`);

// Indices of the content lines nested under line i (deeper indentation),
// stopping at the first content line back at i's level or shallower.
function childLines(lines, i) {
    const out = [];
    if (i < 0) return out;
    const base = indentOf(lines[i]);
    for (let j = i + 1; j < lines.length; j += 1) {
        if (!isContent(lines[j])) continue;
        if (indentOf(lines[j]) <= base) break;
        out.push(j);
    }
    return out;
}

// The direct child of line i (or of the top level when i is -1) keyed `key`.
function directChild(lines, i, key) {
    const kids = i === -1
        ? lines.map((_, j) => j).filter(j => isContent(lines[j]) && indentOf(lines[j]) === 0)
        : childLines(lines, i);
    if (kids.length === 0) return -1;
    const depth = indentOf(lines[kids[0]]);
    return kids.find(j => indentOf(lines[j]) === depth && keyRe(key).test(lines[j])) ?? -1;
}

function parentOf(lines, i) {
    const ind = indentOf(lines[i]);
    for (let j = i - 1; j >= 0; j -= 1) {
        if (isContent(lines[j]) && indentOf(lines[j]) < ind) return j;
    }
    return -1;
}

const keyName = (line) => line.trim().replace(/^-\s+/, '').split(':')[0].replace(/["']/g, '');

// Every `run:` command as { line, cmd }: the value of a single-line run, or
// each non-empty line of a `|` / `>` block.
// shortcut: a command continued over a trailing backslash is read line by
// line; fine while no step does that, upgrade to joining continuations if one does.
function runCommands(lines) {
    const out = [];
    for (let i = 0; i < lines.length; i += 1) {
        const m = lines[i].match(/^(\s*(?:-\s+)?)run:\s*(.*)$/);
        if (m === null) continue;
        const value = m[2].trim();
        if (/^[|>][-+]?\s*(#.*)?$/.test(value)) {
            const keyCol = m[1].length;
            for (let j = i + 1; j < lines.length; j += 1) {
                if (lines[j].trim() === '') continue;
                if (indentOf(lines[j]) <= keyCol) break;
                out.push({ line: j + 1, cmd: lines[j].trim() });
            }
        } else if (value !== '') {
            out.push({ line: i + 1, cmd: value.replace(/^(["'])(.*)\1$/, '$2') });
        }
    }
    return out;
}

function workflowFailures(text) {
    const failures = [];
    const lines = text.split('\n');

    // (a) both triggers, each declaring a tag input.
    const on = directChild(lines, -1, 'on');
    if (on === -1) {
        failures.push(`${WORKFLOW_REL} declares no top-level on: block, so nothing can start it. Next step: restore the workflow_dispatch and workflow_call triggers, each with a tag input.`);
    } else {
        for (const trigger of WORKFLOW_TRIGGERS) {
            const t = directChild(lines, on, trigger);
            if (t === -1) {
                failures.push(`${WORKFLOW_REL} declares no ${trigger} trigger, so ${trigger === 'workflow_call' ? 'the release train cannot call it' : 'the owner cannot dispatch it'}. Next step: restore on.${trigger} with a required tag input of type string and no default.`);
                continue;
            }
            const tag = directChild(lines, directChild(lines, t, 'inputs'), 'tag');
            if (tag === -1) {
                failures.push(`${WORKFLOW_REL} ${trigger} trigger declares no tag input, so the caller cannot name the tag to replay. Next step: add on.${trigger}.inputs.tag, required, of type string, with no default.`);
            }
        }
    }

    // (b) no default under any tag input.
    for (let i = 0; i < lines.length; i += 1) {
        if (!keyRe('tag').test(lines[i]) || !isContent(lines[i])) continue;
        const inputs = parentOf(lines, i);
        if (inputs === -1 || keyName(lines[inputs]) !== 'inputs') continue;
        const trigger = parentOf(lines, inputs);
        const where = trigger === -1 ? 'a' : `the ${keyName(lines[trigger])}`;
        for (const j of childLines(lines, i)) {
            if (keyRe('default').test(lines[j])) {
                failures.push(`${WORKFLOW_REL}:${j + 1} gives ${where} tag input a default, so a run can replay a tag nobody chose and an ESR bump would have to edit this file. Next step: delete the default line; the pin lives in ${MANIFEST_REL} and the caller passes it.`);
            }
        }
    }

    // (c) every generator, identity and rebase command runs inside the Nix shell.
    for (const { line, cmd } of runCommands(lines)) {
        const script = NIX_SCRIPTS.find(s => cmd.includes(s));
        if (script !== undefined && !cmd.startsWith(NIX_PREFIX)) {
            failures.push(`${WORKFLOW_REL}:${line} runs ${script} outside nix develop .#theia, so it gets the runner's tools instead of the pinned ones (generate.mjs has no inkscape there). Next step: start that command with '${NIX_PREFIX.trim()}'.`);
        }
    }
    return failures;
}

function tagLiterals(text) {
    return text.match(TAG_LITERAL) ?? [];
}

function theiaEntriesOf(doc, blocks) {
    // Every @theia/* entry the document declares in the given blocks, as
    // [name, version, block] triples. The monaco exception is excluded by
    // exact package name here, once, so neither caller can forget it.
    const entries = [];
    for (const block of blocks) {
        const deps = doc?.[block];
        if (deps === null || typeof deps !== 'object' || Array.isArray(deps)) continue;
        for (const [name, version] of Object.entries(deps)) {
            if (!name.startsWith('@theia/') || name === THEIA_MONACO_EXCEPTION) continue;
            entries.push([name, version, block]);
        }
    }
    return entries;
}

function lockTheiaStanzas(text) {
    // Yarn v1 lockfile, parsed line-wise: each stanza opens with one or
    // more quoted `name@range` headers ending in a colon, followed by
    // indented fields including `version "..."`. Returns one row per
    // @theia package per stanza carrying it. The monaco exception is
    // excluded by exact package name, like the manifest entries above.
    // Header ranges and upstream-authored transitive constraint lines are
    // deliberately not returned: the stanza version is the resolved
    // tarball's version, which is what the agreement asserts.
    const rows = [];
    const lines = text.split('\n');
    let names = null;
    let version = null;
    const flush = () => {
        if (names !== null) {
            for (const name of names) {
                if (name.startsWith('@theia/') && name !== THEIA_MONACO_EXCEPTION) {
                    rows.push({ name, version });
                }
            }
        }
        names = null;
        version = null;
    };
    for (const line of lines) {
        if (line === '' || line.startsWith('#')) {
            flush();
            continue;
        }
        if (!line.startsWith(' ') && !line.startsWith('\t')) {
            flush();
            const m = line.match(/^((?:"[^"]*"(?:, )?)+):$/);
            if (m === null) continue;
            names = [];
            for (const raw of m[1].split(', ')) {
                const bare = raw.slice(1, -1);
                const at = bare.lastIndexOf('@');
                if (at > 0) names.push(bare.slice(0, at));
            }
            continue;
        }
        if (names !== null && version === null) {
            const vm = line.match(/^\s+version "([^"]*)"\s*$/);
            if (vm !== null) version = vm[1];
        }
    }
    flush();
    return rows;
}

// --- the uptake lane's tag source (step 8, TRAIN-05) -----------------------------------------
// The train workflow carries one uptake-replay job; its tag input must be exactly the detector's
// uptake candidate. A line scan by indentation, the same style as the rebase workflow scan.
const TRAIN_WF_REL = '.github/workflows/release-train.yml';
const UPTAKE_JOB = 'uptake-replay';
const UPTAKE_SOURCE = /^\s*tag:\s*\$\{\{\s*needs\.detect\.outputs\.uptake-candidate\s*\}\}\s*$/;

/** Failures for the uptake-replay job's tag source. Pure: text in, named failures out. */
function uptakeSourceFailures(text) {
    const lines = text.split('\n');
    const start = lines.findIndex(l => new RegExp(`^  ${UPTAKE_JOB}:\\s*$`).test(l));
    if (start < 0) {
        return [`${TRAIN_WF_REL} declares no ${UPTAKE_JOB} job, so the 175 uptake lane replays nothing. Next step: restore the ${UPTAKE_JOB} job beside bump.`];
    }
    let end = start + 1;
    while (end < lines.length && (lines[end].trim() === '' || indentOf(lines[end]) > 2)) end += 1;
    const tags = lines.slice(start + 1, end).filter(l => /^\s*tag:/.test(l));
    if (tags.length !== 1) {
        return [`${TRAIN_WF_REL} ${UPTAKE_JOB} carries ${tags.length} tag input(s), not one. Next step: give it exactly one tag, sourced from needs.detect.outputs.uptake-candidate.`];
    }
    if (!UPTAKE_SOURCE.test(tags[0])) {
        return [`${TRAIN_WF_REL} ${UPTAKE_JOB} takes its tag from ${tags[0].trim()}, not from needs.detect.outputs.uptake-candidate. Next step: source the tag from the detect listing, never a literal, a default or the 153 candidate.`];
    }
    return [];
}

// The uptake-candidate chain (WR-04): the detector prints it, the detect job's Decide step allowlists
// it, and the detect job maps it to its output. Each link is required. Removing one leaves the lane
// silently off: the candidate is empty, uptake-replay is skipped and the report says idle.
const DETECTOR_REL = 'scripts/detect-upstreams.mjs';
const DETECT_JOB = 'detect';
const UPTAKE_PRINT = /console\.log\(`uptake-candidate=\$\{/;
const UPTAKE_OUTPUT = /^\s*uptake-candidate:\s*\$\{\{\s*steps\.decide\.outputs\.uptake-candidate\s*\}\}\s*$/;
const DECIDE_ALLOWLIST = /grep -E '\^\(([^)]*)\)=' /;

/** The lines of one top-level job, by indentation, or null when the job is absent. */
function jobLines(text, jobId) {
    const lines = text.split('\n');
    const start = lines.findIndex(l => new RegExp(`^  ${jobId}:\\s*$`).test(l));
    if (start < 0) return null;
    let end = start + 1;
    while (end < lines.length && (lines[end].trim() === '' || indentOf(lines[end]) > 2)) end += 1;
    return lines.slice(start + 1, end);
}

/** Failures for the uptake-candidate links. Pure: texts in, named failures out. */
function uptakeLinkFailures(workflowText, detectorText) {
    const failures = [];
    if (!UPTAKE_PRINT.test(detectorText)) {
        failures.push(`${DETECTOR_REL} no longer prints uptake-candidate=, so the detect job has no uptake candidate to pass on. Next step: restore the uptake-candidate= line in ${DETECTOR_REL}.`);
    }
    const block = jobLines(workflowText, DETECT_JOB);
    if (block === null) {
        return [...failures, `${TRAIN_WF_REL} declares no ${DETECT_JOB} job, so the uptake candidate has no source. Next step: restore the detect job.`];
    }
    const allow = DECIDE_ALLOWLIST.exec(block.join('\n'));
    if (allow === null || !allow[1].split('|').includes('uptake-candidate')) {
        failures.push(`${TRAIN_WF_REL} ${DETECT_JOB} job's Decide step has no uptake-candidate in its grep allowlist, so the candidate never reaches the job outputs. Next step: add uptake-candidate to that allowlist.`);
    }
    if (!block.some(l => UPTAKE_OUTPUT.test(l))) {
        failures.push(`${TRAIN_WF_REL} ${DETECT_JOB} job does not map the uptake-candidate output from steps.decide, so uptake-replay reads an empty tag. Next step: restore that output in the detect job.`);
    }
    return failures;
}

function runChecks(root, overrides = {}) {
    const failures = [];
    const skipped = [];
    const read = overrides.read ?? ((rel) => readBytes(root, rel)?.toString('utf8') ?? null);
    // The tracked set, derived from version control once and shared by the
    // ESR sweep (step 4) and the Theia member walk (step 6) -- one
    // derivation, never a hand-kept list.
    const tracked = overrides.files ?? listTracked(root);

    // --- 0. the manifest pin ------------------------------------------------
    let expected = null;
    {
        const text = read(MANIFEST_REL);
        if (text === null) {
            failures.push(`${MANIFEST_REL} could not be read, so the pin proves nothing. Next step: restore it at the top of the project.`);
        } else {
            let manifest = null;
            try {
                manifest = parse(text);
            } catch {
                failures.push(`${MANIFEST_REL} could not be read as a settings file, so the pin proves nothing. Next step: run ${RERUN_GENERATE} -- it reports the faulty line.`);
            }
            if (manifest !== null) {
                const pin = manifest?.upstreams?.firefox_esr_tag;
                if (typeof pin !== 'string' || pin.trim() === '') {
                    failures.push(`${PIN_DOTTED} is not set. Open ${MANIFEST_REL}, find the ${PIN_SECTION} section, and give firefox_esr_tag a value. Then run: ${RERUN_GENERATE}`);
                } else if (!TAG_SHAPE.test(pin)) {
                    failures.push(`${PIN_DOTTED} is ${JSON.stringify(pin)}, which is not a plain tag name. Write it as letters, digits, dots, underscores and hyphens only in ${MANIFEST_REL}, then run: ${RERUN_GENERATE}`);
                } else {
                    expected = pin;
                }
            }
        }
    }

    // --- 1. the generated fragment ------------------------------------------
    let fragmentPin = null;
    {
        const text = read(FRAGMENT_REL);
        if (text === null) {
            skipped.push(`${FRAGMENT_REL} is absent (nothing generated in this copy yet) -- fragment equality unchecked; run ${RERUN_GENERATE} to cover it.`);
        } else {
            const m = text.match(new RegExp(`^${FRAGMENT_KEY}=(\\S+)\\s*$`, 'm'));
            if (m === null) {
                failures.push(`${FRAGMENT_REL} is present but carries no ${FRAGMENT_KEY}= line -- broken output. Next step: run ${RERUN_GENERATE} to rewrite it, then re-run this check.`);
            } else {
                fragmentPin = m[1];
            }
        }
    }
    if (expected !== null && fragmentPin !== null && fragmentPin !== expected) {
        failures.push(`${FRAGMENT_REL} carries ${FRAGMENT_KEY}=${fragmentPin} but ${MANIFEST_REL} declares ${expected} -- stale output. Next step: run ${RERUN_GENERATE}, then re-run this check.`);
    }

    // --- 2. the workflow: both triggers, no tag default, generators in Nix --------
    {
        const text = read(WORKFLOW_REL);
        if (text === null) {
            failures.push(`${WORKFLOW_REL} could not be read, so its triggers and steps prove nothing. Next step: restore it.`);
        } else {
            failures.push(...workflowFailures(text));
        }
    }

    // --- 3. fetch's effective default, by parsing -----------------------------
    {
        const text = read(FETCH_REL);
        if (text === null) {
            failures.push(`${FETCH_REL} could not be read, so its default proves nothing. Next step: restore it.`);
        } else {
            if (!text.includes('upstream-pins.env')) {
                failures.push(`${FETCH_REL} no longer sources the generated pin fragment, so its default is not the manifest pin. Next step: source ${FRAGMENT_REL} for the TAG default instead of carrying one.`);
            }
            const found = tagLiterals(text);
            if (found.length > 0) {
                failures.push(`${FETCH_REL} carries its own tag literal ${found.join(', ')} instead of reading the single pin. Next step: remove the literal and let the TAG default come from ${FRAGMENT_REL}.`);
            }
        }
    }

    // --- 4. no second literal anywhere else in scope ----------------------------
    {
        if (tracked === null) {
            failures.push(`the project's version control could not be read, so the literal sweep proves nothing. Next step: run this from a working copy of the project, with git available.`);
        } else {
            for (const rel of tracked) {
                if (!inScope(rel) || sweepExcluded(rel)) continue;
                const text = read(rel);
                if (text === null) continue;
                const lines = text.split('\n');
                for (let i = 0; i < lines.length; i += 1) {
                    const found = tagLiterals(lines[i]);
                    if (found.length > 0) {
                        failures.push(`${rel}:${i + 1} carries a tag literal ${found.join(', ')} outside the two allowed carriers -- the pin lives in ${MANIFEST_REL} alone. Next step: read the pin from ${FRAGMENT_REL} instead of restating it.`);
                    }
                }
            }
        }
    }

    // --- 5. the manifest Theia pin ------------------------------------------------
    let theia = null;
    {
        const text = read(MANIFEST_REL);
        if (text === null) {
            failures.push(`${MANIFEST_REL} could not be read, so the Theia pin proves nothing. Next step: restore it at the top of the project.`);
        } else {
            let manifest = null;
            try {
                manifest = parse(text);
            } catch {
                failures.push(`${MANIFEST_REL} could not be read as a settings file, so the Theia pin proves nothing. Next step: run ${RERUN_GENERATE} -- it reports the faulty line.`);
            }
            if (manifest !== null) {
                const pin = manifest?.upstreams?.theia_release;
                if (typeof pin !== 'string' || pin.trim() === '') {
                    failures.push(`${THEIA_DOTTED} is not set. Open ${MANIFEST_REL}, find the ${PIN_SECTION} section, and give theia_release a value. Then run: ${RERUN_GENERATE}`);
                } else if (!THEIA_SHAPE.test(pin)) {
                    failures.push(`${THEIA_DOTTED} is ${JSON.stringify(pin)}, which is not an exact release triple. Write it as three numeric parts separated by dots in ${MANIFEST_REL}, then run: ${RERUN_GENERATE}`);
                } else {
                    theia = pin;
                }
            }
        }
    }

    // --- 6. resolutions plus every member package.json ---------------------------
    // Set-equality against the manifest pin in both directions: any entry
    // that is not the pin fails naming its file, and a manifest pin no
    // entry carries fails naming the manifest.
    let theiaCarriers = 0;
    let theiaMembers = 0;
    {
        const agree = (rel, entries) => {
            for (const [name, version, block] of entries) {
                if (version === theia) {
                    theiaCarriers += 1;
                } else if (theia !== null) {
                    failures.push(`${rel} ${block} ${name} is ${JSON.stringify(version)} but ${MANIFEST_REL} declares ${theia} -- the pin drifted. Next step: move every @theia/* entry to the manifest pin (except ${THEIA_MONACO_EXCEPTION}), then re-run this check.`);
                }
            }
        };

        const rootText = read(THEIA_ROOT_REL);
        if (rootText === null) {
            failures.push(`${THEIA_ROOT_REL} could not be read, so the release proves nothing over the root manifest. Next step: restore it.`);
        } else {
            let doc = null;
            try {
                doc = JSON.parse(rootText);
            } catch {
                failures.push(`${THEIA_ROOT_REL} is not valid JSON, so its resolutions prove nothing. Next step: restore it -- move the manifest pin first, never hand-edit a package.json pin to make this check green.`);
            }
            if (doc !== null) {
                const res = doc.resolutions;
                if (res === null || typeof res !== 'object' || Array.isArray(res)) {
                    failures.push(`${THEIA_ROOT_REL} carries no resolutions block, so the release proves nothing over the root manifest. Next step: restore the block -- it is what forces one release across the tree.`);
                } else {
                    const entries = theiaEntriesOf(doc, ['resolutions']);
                    if (entries.length === 0) {
                        failures.push(`${THEIA_ROOT_REL} resolutions carries no @theia/* pin at all -- an agreement over nothing is vacuous, not clean. Next step: restore the block.`);
                    } else {
                        agree(THEIA_ROOT_REL, entries);
                    }
                }
            }
        }

        if (tracked !== null) {
            const memberRels = tracked.filter(rel => THEIA_MEMBER_PATTERN.test(rel));
            theiaMembers = memberRels.length;
            if (memberRels.length === 0) {
                failures.push(`no theia/applications/*/package.json or theia/extensions/*/package.json found in version control -- the member walk proves nothing. Next step: run this from a working copy of the project, with git available.`);
            }
            for (const rel of memberRels) {
                const text = read(rel);
                if (text === null) continue;
                let doc = null;
                try {
                    doc = JSON.parse(text);
                } catch {
                    failures.push(`${rel} is not valid JSON, so its @theia pins prove nothing. Next step: restore it.`);
                    continue;
                }
                agree(rel, theiaEntriesOf(doc, THEIA_DEP_BLOCKS));
            }
        }
        // Step 4 already reported unreadable version control; the member
        // walk cannot run without it, and the root and lockfile halves
        // above still ran.

        if (theia !== null && theiaCarriers === 0) {
            failures.push(`${MANIFEST_REL} declares ${THEIA_DOTTED} ${theia} but no @theia pin in the tree carries it -- the manifest pin names a release nothing resolves to. Next step: move the pins to the manifest pin, or correct the manifest pin.`);
        }
    }

    // --- 7. the resolved @theia tarballs in the lockfile --------------------------
    {
        const text = read(THEIA_LOCK_REL);
        if (text === null) {
            failures.push(`${THEIA_LOCK_REL} could not be read, so the locked tree proves nothing. Next step: restore it -- it is committed, so its absence is breakage, not a fresh clone.`);
        } else {
            const rows = lockTheiaStanzas(text);
            if (rows.length === 0) {
                failures.push(`${THEIA_LOCK_REL} resolves no @theia tarball at all -- an agreement over nothing is vacuous, not clean. Next step: restore it.`);
            } else if (theia !== null) {
                for (const { name, version } of rows) {
                    if (version === null) {
                        failures.push(`${THEIA_LOCK_REL} resolves ${name} with no version line -- broken lockfile output. Next step: re-resolve with yarn inside nix develop .#theia, then re-run this check.`);
                    } else if (version !== theia) {
                        failures.push(`${THEIA_LOCK_REL} resolves ${name} to ${version} but ${MANIFEST_REL} declares ${theia} -- the locked tree drifted. Next step: move the pins to the manifest pin and re-resolve, then re-run this check.`);
                    } else {
                        theiaCarriers += 1;
                    }
                }
            }
        }
    }

    // --- 8. the uptake lane's tag comes from the train's listing (TRAIN-05, UPS-01) -----------
    // The 175 tag is not a second manifest key (A-58-6): it is the detector's uptake candidate, passed
    // into the uptake-replay job. The literal sweep (step 4) already refuses a tag literal in that file.
    // This step requires the job's tag input to be sourced from that one output, and from nothing else.
    {
        const text = read(TRAIN_WF_REL);
        if (text === null) {
            failures.push(`${TRAIN_WF_REL} could not be read, so the uptake tag source proves nothing. Next step: restore it.`);
        } else {
            failures.push(...uptakeSourceFailures(text));
            const detectorText = read(DETECTOR_REL);
            if (detectorText === null) failures.push(`${DETECTOR_REL} could not be read, so the uptake candidate chain proves nothing. Next step: restore it.`);
            else failures.push(...uptakeLinkFailures(text, detectorText));
        }
    }

    return { failures, skipped, expected, theia, theiaMembers };
}

function main() {
    if (args.includes('--self-test')) return selfTest();
    const { failures, skipped, theia, theiaMembers } = runChecks(REPO_ROOT);
    for (const s of skipped) console.log(`${NAME}: SKIP -- ${s}`);
    if (failures.length > 0) {
        console.error(`${NAME}: FAIL -- ${failures.length} problem(s) with the upstream pin agreement.`);
        failures.forEach(f => console.error(`  ${f}`));
        return 1;
    }
    console.log(`${NAME}: PASS -- the manifest ESR pin agrees with the fragment and fetch's default, with no second literal in scope; the rebase workflow is callable and dispatchable with no tag default and runs its generator steps inside nix develop .#theia; the Theia pin ${theia} agrees across resolutions, ${theiaMembers} member files and the lockfile`);
    return 0;
}

// A tag-shaped neighbour of the pin, derived -- never a literal kept in
// this file, which would be a hand-kept tag the sweep excludes by path.
function neighborTag(pin) {
    return pin.replace(/\d+/, d => String(Number(d) + 1));
}

function selfTest() {
    const baseline = runChecks(REPO_ROOT);
    if (baseline.failures.length > 0) {
        console.error(`${NAME}: --self-test FAIL -- the unmodified tree is already red, so the planted-fault results below would mean nothing:`);
        baseline.failures.forEach(f => console.error(`  ${f}`));
        return 1;
    }
    const { expected } = baseline;
    if (expected === null) {
        console.error(`${NAME}: --self-test FAIL -- the unmodified tree states no pin, so no plant could mean anything.`);
        return 1;
    }
    const neighbor = neighborTag(expected);
    if (neighbor === expected || !TAG_SHAPE.test(neighbor)) {
        console.error(`${NAME}: --self-test FAIL -- planted no fault at all: the neighbour tag did not land.`);
        return 1;
    }
    const { theia } = baseline;
    if (theia === null) {
        console.error(`${NAME}: --self-test FAIL -- the unmodified tree states no Theia pin, so no plant could mean anything.`);
        return 1;
    }
    // A patch-bumped neighbour of the Theia pin, derived -- never a
    // literal kept in this file, which would be a hand-kept pin no sweep
    // excludes.
    const theiaNeighbor = theia.replace(/(\d+)$/, d => String(Number(d) + 1));
    if (theiaNeighbor === theia || !THEIA_SHAPE.test(theiaNeighbor)) {
        console.error(`${NAME}: --self-test FAIL -- planted no fault at all: the Theia neighbour pin did not land.`);
        return 1;
    }

    let failed = 0;
    const checkNoRoot = (caseName, lines) => {
        const text = lines.join('\n');
        if (text.length === 0) {
            console.error(`${NAME}: --self-test FAIL -- '${caseName}' produced no output text at all, so the no-path predicate would pass vacuously`);
            return false;
        }
        if (text.includes(REPO_ROOT)) {
            console.error(`${NAME}: --self-test FAIL -- '${caseName}' leaked this checkout's path into its output: ${text}`);
            return false;
        }
        return true;
    };

    // Plants 1a-1e: five faults on the rebase workflow, each substituted in
    // memory on the real text -- the tracked file is never edited, not even
    // temporarily -- and each required to go red NAMING the workflow with
    // the marker of the assertion it targets, so a plant cannot pass on
    // another assertion's failure.
    {
        const real = readBytes(REPO_ROOT, WORKFLOW_REL)?.toString('utf8') ?? '';
        const lines = real.split('\n');
        const on = directChild(lines, -1, 'on');
        const tagLineOf = (trigger) => directChild(lines, directChild(lines, directChild(lines, on, trigger), 'inputs'), 'tag');
        const withDefault = (trigger) => {
            const t = tagLineOf(trigger);
            if (t === -1) return null;
            const copy = [...lines];
            copy.splice(t + 1, 0, `${' '.repeat(indentOf(lines[t]) + 2)}default: self-test-plant`);
            return copy.join('\n');
        };
        const withoutCall = () => {
            const t = directChild(lines, on, 'workflow_call');
            if (t === -1) return null;
            const kids = childLines(lines, t);
            const last = kids.length === 0 ? t : kids[kids.length - 1];
            return [...lines.slice(0, t), ...lines.slice(last + 1)].join('\n');
        };
        const bareGenerator = () => {
            const i = lines.findIndex(l => /^\s*(?:-\s+)?run:\s/.test(l) && l.includes(NIX_PREFIX) && NIX_SCRIPTS.some(sc => l.includes(sc)));
            if (i === -1) return null;
            const copy = [...lines];
            copy[i] = copy[i].replace(NIX_PREFIX, '');
            return copy.join('\n');
        };
        const plants = [
            ['default under workflow_call tag', withDefault('workflow_call'), 'workflow_call tag input a default'],
            ['default under workflow_dispatch tag', withDefault('workflow_dispatch'), 'workflow_dispatch tag input a default'],
            ['workflow_call trigger removed', withoutCall(), 'declares no workflow_call trigger'],
            ['bare generator step', bareGenerator(), 'outside nix develop .#theia'],
            ['tag literal in the workflow', `# self-test plant only: ${neighbor}\n${real}`, neighbor],
        ];
        for (const [name, planted, marker] of plants) {
            if (planted === null || planted === real) {
                console.error(`${NAME}: --self-test FAIL -- '${name}' planted no fault at all: the substitution did not land.`);
                failed += 1;
                continue;
            }
            const { failures } = runChecks(REPO_ROOT, { read: (rel) => (rel === WORKFLOW_REL ? planted : readBytes(REPO_ROOT, rel)?.toString('utf8') ?? null) });
            if (failures.some(f => f.includes(WORKFLOW_REL) && f.includes(marker))) {
                console.log(`  ok  ${name} -> red, naming '${WORKFLOW_REL}'`);
                if (!checkNoRoot(name, failures)) failed += 1;
            } else {
                console.error(`${NAME}: --self-test FAIL -- '${name}' did not go red naming '${WORKFLOW_REL}'; got: ${failures.join(' | ') || '(no failures at all)'}`);
                failed += 1;
            }
        }
    }

    // Plant 2: a second tag literal under scripts/ must go red NAMING the
    // planted path. The file is synthetic and in-memory only -- writing it
    // to disk would dirty the tree the sweep reads.
    {
        const name = 'second tag literal under scripts/';
        const plantedRel = 'scripts/self-test-planted-pin.sh';
        const plantedText = `# self-test plant only\nTAG=${neighbor}\n`;
        if (tagLiterals(plantedText).length === 0) {
            console.error(`${NAME}: --self-test FAIL -- '${name}' planted no fault at all: the literal did not land.`);
            failed += 1;
        } else {
            const tracked = listTracked(REPO_ROOT) ?? [];
            const { failures } = runChecks(REPO_ROOT, {
                files: [...tracked, plantedRel],
                read: (rel) => {
                    if (rel === plantedRel) return plantedText;
                    return readBytes(REPO_ROOT, rel)?.toString('utf8') ?? null;
                },
            });
            if (failures.some(f => f.includes(plantedRel))) {
                console.log(`  ok  ${name} -> red, naming '${plantedRel}'`);
                if (!checkNoRoot(name, failures)) failed += 1;
            } else {
                console.error(`${NAME}: --self-test FAIL -- '${name}' did not go red naming '${plantedRel}'; got: ${failures.join(' | ') || '(no failures at all)'}`);
                failed += 1;
            }
        }
    }

    // Plant 3: one member package.json with a single @theia pin bumped by
    // a patch version must go red NAMING the member file. The substitution
    // lands in memory and must still parse as JSON -- otherwise the plant
    // would prove the JSON guard, not the agreement.
    {
        const name = 'bumped member @theia pin';
        const memberRel = 'theia/extensions/branding/package.json';
        const real = readBytes(REPO_ROOT, memberRel)?.toString('utf8') ?? '';
        const needle = `"@theia/core": "${theia}"`;
        let planted = null;
        if (real.includes(needle)) {
            const candidate = real.replace(needle, `"@theia/core": "${theiaNeighbor}"`);
            try {
                JSON.parse(candidate);
                planted = candidate;
            } catch {
                planted = null;
            }
        }
        if (planted === null) {
            console.error(`${NAME}: --self-test FAIL -- '${name}' planted no fault at all: the anchor pin did not land as valid JSON.`);
            failed += 1;
        } else {
            const { failures } = runChecks(REPO_ROOT, { read: (rel) => (rel === memberRel ? planted : readBytes(REPO_ROOT, rel)?.toString('utf8') ?? null) });
            if (failures.some(f => f.includes(memberRel) && f.includes(theiaNeighbor))) {
                console.log(`  ok  ${name} -> red, naming '${memberRel}'`);
                if (!checkNoRoot(name, failures)) failed += 1;
            } else {
                console.error(`${NAME}: --self-test FAIL -- '${name}' did not go red naming '${memberRel}'; got: ${failures.join(' | ') || '(no failures at all)'}`);
                failed += 1;
            }
        }
    }

    // Plant 4: the first @theia stanza in the lockfile resolving to the
    // neighbour pin must go red NAMING the lockfile. The version line is
    // located structurally (first @theia header, then its indented version
    // field), never by blind ordinal, so a lockfile reorder cannot make
    // the plant land on the wrong stanza.
    {
        const name = 'drifted lockfile @theia stanza';
        const real = readBytes(REPO_ROOT, THEIA_LOCK_REL)?.toString('utf8') ?? '';
        const lines = real.split('\n');
        let planted = null;
        for (let i = 0; i < lines.length && planted === null; i += 1) {
            if (!/^"@theia\/(?!monaco-editor-core\b)[^"]*":$/.test(lines[i])) continue;
            for (let j = i + 1; j < lines.length && /^[ \t]/.test(lines[j]); j += 1) {
                const vm = lines[j].match(/^(\s+version ")([^"]*)("\s*)$/);
                if (vm !== null && vm[2] === theia) {
                    const copy = [...lines];
                    copy[j] = `${vm[1]}${theiaNeighbor}${vm[3]}`;
                    planted = copy.join('\n');
                    break;
                }
            }
        }
        if (planted === null) {
            console.error(`${NAME}: --self-test FAIL -- '${name}' planted no fault at all: no @theia stanza carrying the pin was found.`);
            failed += 1;
        } else {
            const { failures } = runChecks(REPO_ROOT, { read: (rel) => (rel === THEIA_LOCK_REL ? planted : readBytes(REPO_ROOT, rel)?.toString('utf8') ?? null) });
            if (failures.some(f => f.includes(THEIA_LOCK_REL) && f.includes(theiaNeighbor))) {
                console.log(`  ok  ${name} -> red, naming '${THEIA_LOCK_REL}'`);
                if (!checkNoRoot(name, failures)) failed += 1;
            } else {
                console.error(`${NAME}: --self-test FAIL -- '${name}' did not go red naming '${THEIA_LOCK_REL}'; got: ${failures.join(' | ') || '(no failures at all)'}`);
                failed += 1;
            }
        }
    }

    // Plants 5-7 (step 8, TRAIN-05): the uptake job's tag is sourced from the detector's uptake
    // candidate and from nothing else. Each plant lands in memory on the real train workflow.
    {
        const trainReal = readBytes(REPO_ROOT, TRAIN_WF_REL)?.toString('utf8') ?? null;
        const sourceLine = '      tag: ${{ needs.detect.outputs.uptake-candidate }}';
        const plants = [
            ['uptake tag as a literal', trainReal?.replace(sourceLine, `      tag: ${neighbor}`), 'takes its tag from'],
            ['uptake tag from the 153 candidate', trainReal?.replace(sourceLine, '      tag: ${{ needs.detect.outputs.candidate }}'), 'takes its tag from'],
            [`${UPTAKE_JOB} job renamed away`, trainReal?.replace(`\n  ${UPTAKE_JOB}:\n`, '\n  uptake-renamed:\n'), `declares no ${UPTAKE_JOB} job`],
        ];
        for (const [name, planted, marker] of plants) {
            if (trainReal === null || typeof planted !== 'string' || planted === trainReal) {
                console.error(`${NAME}: --self-test FAIL -- '${name}' planted no fault at all: the substitution did not land in ${TRAIN_WF_REL}.`);
                failed += 1;
                continue;
            }
            const { failures } = runChecks(REPO_ROOT, { read: (rel) => (rel === TRAIN_WF_REL ? planted : readBytes(REPO_ROOT, rel)?.toString('utf8') ?? null) });
            if (failures.some(f => f.includes(TRAIN_WF_REL) && f.includes(marker))) {
                console.log(`  ok  ${name} -> red, naming '${TRAIN_WF_REL}'`);
                if (!checkNoRoot(name, failures)) failed += 1;
            } else {
                console.error(`${NAME}: --self-test FAIL -- '${name}' did not go red naming '${TRAIN_WF_REL}'; got: ${failures.join(' | ') || '(no failures at all)'}`);
                failed += 1;
            }
        }
    }

    // Plants 8-10 (WR-04): each link of the uptake-candidate chain is required. Removing the detector's
    // print, the Decide allowlist entry or the detect job's output mapping must each go red naming its file.
    {
        const workflowReal = readBytes(REPO_ROOT, TRAIN_WF_REL)?.toString('utf8') ?? null;
        const detectorReal = readBytes(REPO_ROOT, DETECTOR_REL)?.toString('utf8') ?? null;
        const plants = [
            ['detector stops printing uptake-candidate=', detectorReal?.replace(/^.*console\.log\(`uptake-candidate=.*\n/m, ''), DETECTOR_REL, 'no longer prints uptake-candidate='],
            ['Decide allowlist drops uptake-candidate', workflowReal?.replace('|uptake-candidate)=', ')='), TRAIN_WF_REL, 'grep allowlist'],
            ['detect job drops the uptake-candidate output', workflowReal?.replace(/^ *uptake-candidate: \$\{\{ steps\.decide\.outputs\.uptake-candidate \}\}\n/m, ''), TRAIN_WF_REL, 'does not map the uptake-candidate output'],
        ];
        for (const [name, planted, file, marker] of plants) {
            const real = file === TRAIN_WF_REL ? workflowReal : detectorReal;
            if (typeof planted !== 'string' || planted === real) {
                console.error(`${NAME}: --self-test FAIL -- '${name}' planted no fault at all: the substitution did not land in ${file}.`);
                failed += 1;
                continue;
            }
            const { failures } = runChecks(REPO_ROOT, { read: (rel) => (rel === file ? planted : readBytes(REPO_ROOT, rel)?.toString('utf8') ?? null) });
            if (failures.some(f => f.includes(file) && f.includes(marker))) {
                console.log(`  ok  ${name} -> red, naming '${file}'`);
                if (!checkNoRoot(name, failures)) failed += 1;
            } else {
                console.error(`${NAME}: --self-test FAIL -- '${name}' did not go red naming '${file}'; got: ${failures.join(' | ') || '(no failures at all)'}`);
                failed += 1;
            }
        }
    }

    if (failed > 0) return 1;
    console.log(`${NAME}: --self-test PASS -- 14 planted faults went red naming the drifted file (8 pin plants, 3 uptake-source plants and 3 uptake-link plants)`);
    return 0;
}

process.exit(main());
