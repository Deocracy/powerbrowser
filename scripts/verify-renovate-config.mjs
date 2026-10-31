#!/usr/bin/env node
// scripts/verify-renovate-config.mjs
//
// The renovate-config row (Phase 51, AUTO-02). The workflows row reads workflow YAML only, so it
// cannot assert the semantics of the Renovate config: the Theia packageRule grouping, the monaco
// exception, the regex customManager that reads theia_release, automerge, nix, the branch prefix,
// the post-upgrade hook and the absence of any clock key. This row checks .github/renovate.json5
// read as text. It does not replace zizmor or the workflows row, which audit any workflow a later
// job adds.
//
// Derivation at check time. Nothing is hand-kept except the licensing contract:
//  - The Theia members are the theia/package.json resolutions keys under @theia/, minus
//    @theia/monaco-editor-core. The theia packageRule's matchPackageNames must select exactly that
//    set. A /regex/ matcher is evaluated as a regex, so the monaco exception is a lookahead.
//  - The monaco packageRule must select exactly @theia/monaco-editor-core.
//  - The regex customManager's matchStrings must capture the live theia_release read from
//    configuration.toml. A pattern that captures nothing, or another value, is red.
//  - The post-upgrade commands and fileFilters are the licensing contract. Each named input must
//    exist in the tree.
//  - No clock key (schedule, timezone) exists at any depth of the config.
//
// Rules (the name in brackets is the rule a red line names):
//  [config-file]            .github/renovate.json5 exists.
//  [config-parse]           it parses as JSON5 (comments and trailing commas only).
//  [automerge]              automerge is false.
//  [platform-automerge]     platformAutomerge is false.
//  [nix]                    the nix manager is off: nix.enabled is not true (owner decision, BLOCKED.md item 5).
//  [branch-prefix]          branchPrefix starts with chore/theia-.
//  [no-clock]               no schedule or timezone key at any depth (D-77).
//  [vulnerability-alerts]   vulnerabilityAlerts is { enabled: false } and osvVulnerabilityAlerts is false (WR-02).
//  [theia-group]            one packageRule with groupName theia selects exactly the @theia/*
//                           resolutions minus monaco-editor-core.
//  [theia-group-slug]       that rule's groupSlug is theia.
//  [theia-group-pin]        that rule's rangeStrategy is pin.
//  [monaco-group]           one packageRule with groupName theia-monaco-editor-core selects only
//                           monaco-editor-core, with that groupSlug and rangeStrategy pin.
//  [theia-release-manager]  a regex customManager covers configuration.toml through
//                           managerFilePatterns (no deprecated fileMatch), its matchStrings
//                           capture the live theia_release, and it uses npm and @theia/core.
//  [manager-file-patterns]  every regex customManager's managerFilePatterns match exactly the root
//                           configuration.toml among the git-tracked copies (git ls-files), and no other.
//  [ignore-paths]           ignorePaths skips every tracked configuration.toml copy other than the root,
//                           so Renovate never rewrites a frozen fixture (BL-01).
//  [scope]                  every non-@theia/* dependency (devDependencies, dependencies, engines, and
//                           the flake root inputs) is disabled by a packageRule, and no @theia/*
//                           resolution is. Without it Renovate opens chore/theia- branches for them.
//  [licensing-hook]         postUpgradeTasks commands are the two licensing commands, fileFilters
//                           are the four inputs, and executionMode is branch.
//  [licensing-inputs]       each fileFilters entry and each licensing generator exists in the tree.
//  [allowed-post-upgrade]   allowedPostUpgradeCommands is absent from the repository config: it is
//                           a self-hosted option, and Renovate ignores a repository value.
//  [allow-list]             WR-03: every key at the top level, in a packageRule, a customManager, the post-upgrade
//                           hook and vulnerabilityAlerts is in the explicit set AUTO-02 needs (TOP_KEYS etc.).
//  [required-key]           each AUTO-02 key (REQUIRED_TOP) is present.
//  [extends]                no preset: extends pulls in defaults that AUTO-02 does not want.
//  [lock-file-maintenance]  the lockfile-maintenance key is absent.
//  [dependency-dashboard]   the dashboard key is absent (the sweep tick and owner dispatch are the only surfaces).
//  [custom-managers]        exactly one customManager.
//  [automerge]              automerge and platformAutomerge appear only at the top level, set false.
//  [theia-group-narrowed]   a Theia or monaco group selects by matchPackageNames only; no matchUpdateTypes.
//  [rule-order]             packageRules are simulated in order: every non-@theia name, and an unlisted probe,
//                           ends with enabled false, so a later catch-all cannot re-enable a dependency.
//
// Not checked here: the admission of renovatebot/github-action. No workflow uses it in this change,
// so there is nothing to admit. The workflows row's admission-used and uses-admitted rules cover
// it when a job lands.
//
// Usage: node scripts/verify-renovate-config.mjs              the tree (quick)
//        node scripts/verify-renovate-config.mjs --self-test  one planted fault per rule, in memory
// It reads files and writes nothing. No network, no gh, no renovate binary.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'renovate-config';
const CONFIG_REL = '.github/renovate.json5';
const PKG_REL = 'theia/package.json';
const TOML_REL = 'configuration.toml';
const MONACO = '@theia/monaco-editor-core';
const THEIA_GROUP = 'theia';
const MONACO_GROUP = 'theia-monaco-editor-core';
const BRANCH_PREFIX = 'chore/theia-';
const LICENSING_COMMANDS = ['node scripts/generate-licensing.mjs', 'node scripts/generate.mjs --check'];
const LICENSING_SCRIPTS = ['scripts/generate-licensing.mjs', 'scripts/generate.mjs'];
const FILE_FILTERS = ['THIRD-PARTY-NOTICES.txt', 'LICENSING.md', 'theia/yarn.lock', 'configuration.toml'];
const CLOCK_KEYS = ['schedule', 'timezone'];
const TOML_LINE = /^theia_release\s*=\s*"([^"]+)"/m;
// WR-03 allow-list: exactly the keys AUTO-02 needs. Any other key, at any of these levels, is refused.
const TOP_KEYS = ['$schema', 'automerge', 'platformAutomerge', 'rangeStrategy', 'branchPrefix', 'ignorePaths', 'packageRules', 'customManagers', 'postUpgradeTasks', 'vulnerabilityAlerts', 'osvVulnerabilityAlerts'];
const REQUIRED_TOP = ['automerge', 'platformAutomerge', 'rangeStrategy', 'branchPrefix', 'ignorePaths', 'packageRules', 'customManagers', 'postUpgradeTasks', 'vulnerabilityAlerts', 'osvVulnerabilityAlerts'];
const RULE_KEYS = ['matchPackageNames', 'enabled', 'groupName', 'groupSlug', 'rangeStrategy'];
const GROUP_KEYS = ['matchPackageNames', 'groupName', 'groupSlug', 'rangeStrategy'];
const MANAGER_KEYS = ['customType', 'managerFilePatterns', 'matchStrings', 'datasourceTemplate', 'depNameTemplate'];
const HOOK_KEYS = ['commands', 'fileFilters', 'executionMode'];
const ALERT_KEYS = ['enabled'];

const args = process.argv.slice(2);
for (const a of args) {
    if (a !== '--self-test') {
        console.error(`${NAME}: FAIL -- unknown argument '${a}'`);
        console.error('  Next step: run with no arguments, or with --self-test.');
        process.exit(2);
    }
}

// JSON5 subset: // and /* */ comments, and trailing commas before } or ]. A scanner tracks string
// state, so a // inside a URL or a regex is data. The result goes to JSON.parse, which throws on error.
function parseJson5(text) {
    let noComments = '';
    let quote = null;
    for (let i = 0; i < text.length; i += 1) {
        const c = text[i];
        if (quote) {
            noComments += c;
            if (c === '\\') { noComments += text[i + 1] ?? ''; i += 1; }
            else if (c === quote) quote = null;
            continue;
        }
        if (c === '"') { quote = c; noComments += c; continue; }
        if (c === '/' && text[i + 1] === '/') {
            while (i < text.length && text[i] !== '\n') i += 1;
            continue;
        }
        if (c === '/' && text[i + 1] === '*') {
            const end = text.indexOf('*/', i + 2);
            if (end < 0) throw new SyntaxError('unterminated block comment');
            i = end + 1;
            continue;
        }
        noComments += c;
    }
    let out = '';
    quote = null;
    for (let i = 0; i < noComments.length; i += 1) {
        const c = noComments[i];
        if (quote) {
            out += c;
            if (c === '\\') { out += noComments[i + 1] ?? ''; i += 1; }
            else if (c === quote) quote = null;
            continue;
        }
        if (c === '"') { quote = c; out += c; continue; }
        if (c === ',') {
            let j = i + 1;
            while (j < noComments.length && /\s/.test(noComments[j])) j += 1;
            if (noComments[j] === '}' || noComments[j] === ']') continue;
        }
        out += c;
    }
    return JSON.parse(out);
}

const toList = v => (Array.isArray(v) ? v : v === undefined ? [] : [v]);
const sameSet = (a, b) => [...a].sort().join('\n') === [...b].sort().join('\n');
const diff = (a, b) => a.filter(x => !b.includes(x));

// A matcher written as /body/flags is a regex; anything else is an exact package name.
function matcherTest(matcher, name) {
    const m = /^\/(.*)\/([a-z]*)$/s.exec(matcher);
    if (m) return new RegExp(m[1], m[2]).test(name);
    return matcher === name;
}

// A managerFilePatterns entry is a slash-regex; a malformed one is a non-match, never a throw.
function patternTest(pattern, name) {
    try { return matcherTest(pattern, name); } catch { return false; }
}

function captureOf(pattern, text) {
    try { return new RegExp(pattern, 'm').exec(text)?.groups?.currentValue ?? null; } catch { return null; }
}

// Renovate's ignorePaths glob, reduced to the forms this config uses: ** spans directories, * does not.
// shortcut: no [] classes or ? wildcards, so a config that needs them fails closed here; upgrade to minimatch if it does.
function globTest(glob, path) {
    const body = glob.split('**').map(part => part.replace(/[.+^${}()|[\]\\?]/g, '\\$&').replace(/\*/g, '[^/]*')).join('.*');
    return new RegExp(`^${body}$`).test(path);
}

// Every path at which one of the named keys appears, at any depth.
function findKeys(node, names, path = '$', hits = []) {
    if (Array.isArray(node)) {
        node.forEach((v, i) => findKeys(v, names, `${path}[${i}]`, hits));
    } else if (node && typeof node === 'object') {
        for (const k of Object.keys(node)) {
            if (names.includes(k)) hits.push(`${path}.${k}`);
            findKeys(node[k], names, `${path}.${k}`, hits);
        }
    }
    return hits;
}

const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);

// Pure check over the config text and the derived inputs. Overrides replace one input in memory:
// configText (null means missing), resolutions, theiaRelease. Every other input is read from root.
function runChecks(root = REPO_ROOT, overrides = {}) {
    const failures = [];
    const fail = (rule, value, message) => failures.push({ rule, value, message });
    const read = rel => {
        const p = join(root, rel);
        return existsSync(p) ? readFileSync(p, 'utf8') : null;
    };
    // Renovate sees only git-tracked files, so the copies it could match are derived from git ls-files.
    let tracked = [];
    if ('trackedFiles' in overrides) {
        tracked = overrides.trackedFiles;
    } else {
        try {
            tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).split('\0').filter(Boolean);
        } catch (err) {
            fail('manager-file-patterns', 'git ls-files', `cannot list the tracked files (${err.message.split('\n')[0]}), so the configuration.toml copies cannot be derived`);
        }
    }
    const tomlCopies = tracked.filter(p => p === TOML_REL || p.endsWith(`/${TOML_REL}`));

    const configText = 'configText' in overrides ? overrides.configText : read(CONFIG_REL);
    if (configText === null) {
        fail('config-file', CONFIG_REL, `${CONFIG_REL} is missing. Next step: restore the Renovate config.`);
        return { failures, facts: null };
    }
    let cfg;
    try {
        cfg = parseJson5(configText);
    } catch (err) {
        fail('config-parse', CONFIG_REL, `does not parse as JSON5: ${err.message}. Next step: fix the syntax named above.`);
        return { failures, facts: null };
    }
    if (!isObj(cfg)) {
        fail('config-parse', CONFIG_REL, 'the config is not a JSON object. Next step: wrap the settings in { }.');
        return { failures, facts: null };
    }

    let resolutions = {};
    if ('resolutions' in overrides) {
        resolutions = overrides.resolutions;
    } else {
        const pkgText = read(PKG_REL);
        try {
            resolutions = pkgText === null ? {} : (JSON.parse(pkgText).resolutions ?? {});
        } catch (err) {
            fail('theia-group', PKG_REL, `${PKG_REL} does not parse: ${err.message}`);
        }
    }
    const names = Object.keys(resolutions).sort();
    if (names.length === 0) {
        fail('theia-group', PKG_REL, `${PKG_REL} carries no resolutions pins, so the group cannot be derived`);
    }
    const expectedTheia = names.filter(n => n.startsWith('@theia/') && n !== MONACO);

    const tomlText = read(TOML_REL) ?? '';
    const liveRelease = 'theiaRelease' in overrides ? overrides.theiaRelease : (TOML_LINE.exec(tomlText)?.[1] ?? null);
    if (liveRelease === null) {
        fail('theia-release-manager', TOML_REL, `${TOML_REL} has no theia_release line to derive the live value from`);
    }

    // WR-03 allow-list: AUTO-02 needs exactly these keys. A key outside the set is refused at its own level.
    for (const k of Object.keys(cfg)) {
        if (!TOP_KEYS.includes(k)) fail('allow-list', `$.${k}`, `${k} is not in the AUTO-02 allow-list. Remove it, or extend the allow-list with a reason`);
    }
    for (const k of REQUIRED_TOP) {
        if (!(k in cfg)) fail('required-key', k, `${k} is required by AUTO-02 and is missing`);
    }
    const allowLevel = (where, obj, allowed) => {
        for (const k of Object.keys(obj)) {
            if (!allowed.includes(k)) fail('allow-list', `${where}.${k}`, `${k} is not in the AUTO-02 allow-list for this level. Remove it, or extend the allow-list with a reason`);
        }
    };
    toList(cfg.packageRules).forEach((r, i) => { if (isObj(r)) allowLevel(`$.packageRules[${i}]`, r, RULE_KEYS); });
    toList(cfg.customManagers).forEach((m, i) => { if (isObj(m)) allowLevel(`$.customManagers[${i}]`, m, MANAGER_KEYS); });
    if (isObj(cfg.postUpgradeTasks)) allowLevel('$.postUpgradeTasks', cfg.postUpgradeTasks, HOOK_KEYS);
    if (isObj(cfg.vulnerabilityAlerts)) allowLevel('$.vulnerabilityAlerts', cfg.vulnerabilityAlerts, ALERT_KEYS);

    // Named refusals, one rule each, for the settings a presence check alone would let through.
    if ('extends' in cfg) {
        fail('extends', 'extends', 'a preset adds dashboard, pinned digests and other defaults that AUTO-02 does not want. Remove it');
    }
    if ('lockFileMaintenance' in cfg) {
        fail('lock-file-maintenance', 'lockFileMaintenance', 'lockfile maintenance is outside AUTO-02 and opens branches the Theia group does not own. Remove it');
    }
    if ('dependencyDashboard' in cfg) {
        fail('dependency-dashboard', `dependencyDashboard = ${JSON.stringify(cfg.dependencyDashboard)}`, 'the dashboard is a second surface beside the sweep tick and owner dispatch. Remove it');
    }
    if (!Array.isArray(cfg.customManagers) || cfg.customManagers.length !== 1) {
        fail('custom-managers', `customManagers length ${Array.isArray(cfg.customManagers) ? cfg.customManagers.length : 'not an array'}`, 'AUTO-02 has exactly one customManager, the theia_release regex manager; a second one can read every file it matches');
    }
    // automerge may appear only at the top level, where the check above pins it false.
    for (const hit of findKeys(cfg, ['automerge', 'platformAutomerge']).filter(h => h !== '$.automerge' && h !== '$.platformAutomerge')) {
        fail('automerge', hit, 'automerge is allowed only at the top level, set false. Anywhere else it can merge a PR without owner review');
    }

    // Automerge and the rest of the flags.
    if (cfg.automerge !== false) {
        fail('automerge', `automerge = ${JSON.stringify(cfg.automerge)}`, 'automerge must be false so the Theia PR never merges itself');
    }
    if (cfg.platformAutomerge !== false) {
        fail('platform-automerge', `platformAutomerge = ${JSON.stringify(cfg.platformAutomerge)}`, 'platformAutomerge must be false so the platform never merges the Theia PR');
    }
    // WR-02: remediation PRs are force-enabled by Renovate and bypass the scope rule, so both alert sources are off.
    if (cfg.vulnerabilityAlerts?.enabled !== false) {
        fail('vulnerability-alerts', `vulnerabilityAlerts = ${JSON.stringify(cfg.vulnerabilityAlerts)}`, 'vulnerabilityAlerts must be { "enabled": false }, or Renovate opens chore/theia-*-vulnerability PRs outside the Theia group');
    }
    if (cfg.osvVulnerabilityAlerts !== false) {
        fail('vulnerability-alerts', `osvVulnerabilityAlerts = ${JSON.stringify(cfg.osvVulnerabilityAlerts)}`, 'osvVulnerabilityAlerts must be false, or OSV remediation PRs bypass the scope rule');
    }
    // WR-01: nix is off by owner decision. Renovate defaults the manager to off, and the nixpkgs input is the only
    // flake input, which the scope rule disables. Turning it on needs the separate nixpkgs group or an AUTO-02 amendment first.
    if (cfg.nix?.enabled === true) {
        fail('nix', `nix.enabled = ${JSON.stringify(cfg.nix.enabled)}`, 'the nix manager is off by owner decision (BLOCKED.md item 5); the Theia PR must not move flake.lock until AUTO-02 is amended or the nixpkgs group exists');
    }
    if (typeof cfg.branchPrefix !== 'string' || !cfg.branchPrefix.startsWith(BRANCH_PREFIX)) {
        fail('branch-prefix', `branchPrefix = ${JSON.stringify(cfg.branchPrefix)}`, `branchPrefix must start with ${BRANCH_PREFIX} so the fixer class matches the Theia branch`);
    }
    for (const hit of findKeys(cfg, CLOCK_KEYS)) {
        fail('no-clock', hit, 'a clock key is a second trigger beside the sweep tick and owner dispatch (D-77)');
    }

    const rules = Array.isArray(cfg.packageRules) ? cfg.packageRules : [];

    // The Theia group.
    const theiaRules = rules.filter(r => r?.groupName === THEIA_GROUP);
    if (theiaRules.length !== 1) {
        fail('theia-group', `groupName ${THEIA_GROUP}`, `expected exactly one packageRule with groupName ${THEIA_GROUP}, found ${theiaRules.length}`);
    } else {
        const [g] = theiaRules;
        let got = [];
        try {
            got = names.filter(n => toList(g.matchPackageNames).some(m => matcherTest(m, n)));
        } catch (err) {
            fail('theia-group', JSON.stringify(g.matchPackageNames), `a matcher is not a valid regex: ${err.message}`);
        }
        const extra = diff(got, expectedTheia);
        const missing = diff(expectedTheia, got);
        if (extra.length || missing.length) {
            fail('theia-group', JSON.stringify(g.matchPackageNames), `the group selects ${got.length} packages, expected the ${expectedTheia.length} @theia/* pins minus ${MONACO}; extra [${extra.join(', ')}], missing [${missing.join(', ')}]`);
        }
        if (g.groupSlug !== THEIA_GROUP) {
            fail('theia-group-slug', `groupSlug = ${JSON.stringify(g.groupSlug)}`, `the theia group must carry groupSlug ${THEIA_GROUP}`);
        }
        if (g.rangeStrategy !== 'pin') {
            fail('theia-group-pin', `rangeStrategy = ${JSON.stringify(g.rangeStrategy)}`, 'the theia group must pin: the resolutions are exact pins');
        }
        // A second matcher such as matchUpdateTypes narrows the group, and the set check above never sees it.
        const narrowed = Object.keys(g).filter(k => !GROUP_KEYS.includes(k));
        if (narrowed.length) {
            fail('theia-group-narrowed', narrowed.join(', '), `the theia group selects by matchPackageNames only; ${narrowed.join(', ')} would drop Theia pins out of the group`);
        }
    }

    // The monaco group.
    const monacoRules = rules.filter(r => r?.groupName === MONACO_GROUP);
    if (monacoRules.length !== 1) {
        fail('monaco-group', `groupName ${MONACO_GROUP}`, `expected exactly one packageRule with groupName ${MONACO_GROUP}, found ${monacoRules.length}`);
    } else {
        const [m] = monacoRules;
        let got = [];
        try {
            got = names.filter(n => toList(m.matchPackageNames).some(p => matcherTest(p, n)));
        } catch (err) {
            fail('monaco-group', JSON.stringify(m.matchPackageNames), `a matcher is not a valid regex: ${err.message}`);
        }
        const extra = diff(got, [MONACO]);
        const missing = diff([MONACO], got);
        if (extra.length || missing.length) {
            fail('monaco-group', JSON.stringify(m.matchPackageNames), `the monaco group must select only ${MONACO}; extra [${extra.join(', ')}], missing [${missing.join(', ')}]`);
        }
        if (m.groupSlug !== MONACO_GROUP) {
            fail('monaco-group', `groupSlug = ${JSON.stringify(m.groupSlug)}`, `the monaco group must carry groupSlug ${MONACO_GROUP}`);
        }
        if (m.rangeStrategy !== 'pin') {
            fail('monaco-group', `rangeStrategy = ${JSON.stringify(m.rangeStrategy)}`, 'the monaco group must pin to upstream\'s own monaco line');
        }
        const narrowedMonaco = Object.keys(m).filter(k => !GROUP_KEYS.includes(k));
        if (narrowedMonaco.length) {
            fail('theia-group-narrowed', narrowedMonaco.join(', '), `the monaco group selects by matchPackageNames only; ${narrowedMonaco.join(', ')} would change what it carries`);
        }
    }

    // The theia_release customManager.
    const managers = Array.isArray(cfg.customManagers) ? cfg.customManagers : [];
    for (const m of managers) {
        if (m && 'fileMatch' in m) {
            fail('theia-release-manager', 'fileMatch', 'fileMatch is deprecated: Renovate migrates it, so a config that carries it is not migration-free. Use managerFilePatterns with the slash-regex form.');
        }
    }
    const covering = managers.filter(m => m?.customType === 'regex' && toList(m.managerFilePatterns).some(p => patternTest(p, TOML_REL)));
    if (!tomlCopies.includes(TOML_REL)) {
        fail('theia-release-manager', TOML_REL, `${TOML_REL} is not git-tracked, so Renovate never sees the live theia_release`);
    }
    // Exact match: the regex manager must select the root file among the tracked copies, and no other copy.
    for (const m of managers.filter(x => x?.customType === 'regex')) {
        const hit = tomlCopies.filter(p => toList(m.managerFilePatterns).some(pat => patternTest(pat, p)));
        if (!sameSet(hit, [TOML_REL])) {
            fail('manager-file-patterns', `managerFilePatterns matches [${hit.join(', ')}]`, `a regex manager must match exactly ${TOML_REL} among the tracked copies; extra [${diff(hit, [TOML_REL]).join(', ')}]. Anchor it: "/^configuration\\.toml$/"`);
        }
    }
    // Every other tracked copy must be skipped by ignorePaths, with Renovate's own substring-or-glob test.
    const ignored = toList(cfg.ignorePaths).filter(g => typeof g === 'string');
    for (const f of tomlCopies.filter(p => p !== TOML_REL)) {
        if (!ignored.some(g => f.includes(g) || globTest(g, f))) {
            fail('ignore-paths', f, `${f} is a tracked configuration.toml copy that ignorePaths does not skip, so Renovate could rewrite it. Add its directory to ignorePaths`);
        }
    }
    if (liveRelease !== null) {
        if (covering.length === 0) {
            fail('theia-release-manager', 'managerFilePatterns', `no regex customManager covers ${TOML_REL}; add managerFilePatterns "/(^|/)configuration\\.toml$/"`);
        } else {
            const hits = covering.filter(m => toList(m.matchStrings).some(p => captureOf(p, tomlText) === liveRelease));
            if (hits.length === 0) {
                const got = covering.flatMap(m => toList(m.matchStrings).map(p => captureOf(p, tomlText) ?? 'nothing'));
                fail('theia-release-manager', 'matchStrings', `no matchStrings captures the live theia_release ${liveRelease}; captured [${got.join(', ')}]`);
            } else {
                const [m] = hits;
                if (m.datasourceTemplate !== 'npm') {
                    fail('theia-release-manager', `datasourceTemplate = ${JSON.stringify(m.datasourceTemplate)}`, 'the theia_release manager must read the npm datasource');
                }
                if (m.depNameTemplate !== '@theia/core') {
                    fail('theia-release-manager', `depNameTemplate = ${JSON.stringify(m.depNameTemplate)}`, 'the version anchor must be @theia/core');
                }
            }
        }
    }

    // The scope: Renovate updates every dependency by default, and the branch prefix is global.
    const disabledRules = rules.filter(r => r?.enabled === false);
    const selectsName = (r, n) => toList(r.matchPackageNames).some(m => patternTest(m, n));
    const pkgJson = (() => { try { return JSON.parse(read(PKG_REL) ?? 'null') ?? {}; } catch { return {}; } })();
    // Kept although the nix manager is off: if it is ever re-enabled, nixpkgs must already be disabled.
    let flakeInputs = [];
    try { flakeInputs = Object.keys(JSON.parse(read('flake.lock') ?? 'null')?.nodes?.root?.inputs ?? {}); } catch { flakeInputs = []; }
    const nonTheia = [...new Set([
        ...Object.keys(pkgJson.dependencies ?? {}),
        ...Object.keys(pkgJson.devDependencies ?? {}),
        ...Object.keys(pkgJson.engines ?? {}),
        ...flakeInputs,
    ])].filter(n => !n.startsWith('@theia/')).sort();
    for (const n of nonTheia) {
        if (!disabledRules.some(r => selectsName(r, n))) {
            fail('scope', n, `${n} is not disabled by a packageRule, so Renovate would open a ${BRANCH_PREFIX}* branch for it`);
        }
    }
    for (const n of names.filter(x => x.startsWith('@theia/'))) {
        if (disabledRules.some(r => selectsName(r, n))) {
            fail('scope', n, `${n} is disabled by a packageRule, so the Theia group would miss it`);
        }
    }

    // Rule order: Renovate applies packageRules in sequence and a later enabled value wins. Simulate it for every
    // non-@theia name, plus a probe no package has, and require the final value to be disabled.
    for (const n of [...nonTheia, 'zz-unlisted-probe']) {
        let final;
        for (const r of rules) {
            if (isObj(r) && 'enabled' in r && toList(r.matchPackageNames).some(m => patternTest(m, n))) final = r.enabled;
        }
        if (final !== false) {
            fail('rule-order', n, `the last packageRule that sets enabled for ${n} leaves it ${final === undefined ? 'enabled by default' : `enabled: ${JSON.stringify(final)}`}; a later rule re-enables a non-@theia dependency`);
        }
    }

    // The licensing hook.
    const pu = cfg.postUpgradeTasks ?? {};
    const commands = toList(pu.commands);
    const fileFilters = toList(pu.fileFilters);
    if (!sameSet(commands, LICENSING_COMMANDS)) {
        fail('licensing-hook', `commands [${commands.join(', ')}]`, `the post-upgrade commands must be exactly: ${LICENSING_COMMANDS.join('; ')}`);
    }
    if (!sameSet(fileFilters, FILE_FILTERS)) {
        fail('licensing-hook', `fileFilters [${fileFilters.join(', ')}]`, `extra [${diff(fileFilters, FILE_FILTERS).join(', ')}], missing [${diff(FILE_FILTERS, fileFilters).join(', ')}]; the inputs are exactly the four notice and pin files`);
    }
    if (pu.executionMode !== 'branch') {
        fail('licensing-hook', `executionMode = ${JSON.stringify(pu.executionMode)}`, 'executionMode must be branch: update runs the generator once per package, not once per branch');
    }
    for (const f of [...FILE_FILTERS, ...LICENSING_SCRIPTS]) {
        if (!existsSync(join(root, f))) {
            fail('licensing-inputs', f, `${f} is named by the licensing hook but is not in the tree`);
        }
    }

    // A repository config cannot allow post-upgrade commands; the job environment does.
    if ('allowedPostUpgradeCommands' in cfg) {
        fail('allowed-post-upgrade', 'allowedPostUpgradeCommands', 'a self-hosted option that Renovate ignores in the repository config; set RENOVATE_ALLOWED_POST_UPGRADE_COMMANDS in the job environment instead');
    }

    const facts = {
        theiaMembers: expectedTheia.length,
        release: liveRelease,
        nonTheia: nonTheia.length,
    };
    return { failures, facts };
}

function printFailures(failures) {
    for (const f of [...failures].sort((a, b) => (a.rule + a.value).localeCompare(b.rule + b.value))) {
        console.error(`${NAME}: FAIL -- [${f.rule}] ${f.value}: ${f.message}`);
    }
}

function run() {
    const { failures, facts } = runChecks(REPO_ROOT);
    if (failures.length > 0) {
        printFailures(failures);
        console.error(`${NAME}: FAIL -- ${failures.length} rule(s) red in ${CONFIG_REL}. Next step: fix the rule named above in ${CONFIG_REL}, or the file it names.`);
        return 1;
    }
    console.log(`${NAME}: PASS -- ${CONFIG_REL}: the theia group selects ${facts.theiaMembers} @theia/* pins with ${MONACO} in its own pinned group; theia_release ${facts.release} is captured by one regex manager; automerge and platformAutomerge off; nix manager off (flake.lock not moved, BLOCKED.md item 5); branchPrefix ${BRANCH_PREFIX}; no clock key; every non-Theia dependency disabled (${facts.nonTheia}); ${LICENSING_COMMANDS.length} post-upgrade commands and ${FILE_FILTERS.length} file filters`);
    return 0;
}

// Plants are applied to a clone of the live config. Each names the one rule it must turn red.
function selfTest() {
    const base = runChecks(REPO_ROOT);
    if (base.failures.length > 0) {
        printFailures(base.failures);
        console.error(`${NAME}: --self-test FAIL -- the unmodified tree is already red, so the plants would prove nothing. Next step: fix the rules above first.`);
        return 1;
    }
    let failed = 0;
    console.log('  ok  unmodified tree -> green');

    const minimal = {
        automerge: false,
        platformAutomerge: false,
        rangeStrategy: 'pin',
        branchPrefix: BRANCH_PREFIX,
        ignorePaths: ['.planning/**'],
        vulnerabilityAlerts: { enabled: false },
        osvVulnerabilityAlerts: false,
        packageRules: [
            { matchPackageNames: ['/^(?!@theia\\/)/'], enabled: false },
            { matchPackageNames: ['/^@theia\\/(?!monaco-editor-core$)/'], groupName: THEIA_GROUP, groupSlug: THEIA_GROUP, rangeStrategy: 'pin' },
            { matchPackageNames: [MONACO], groupName: MONACO_GROUP, groupSlug: MONACO_GROUP, rangeStrategy: 'pin' },
        ],
        customManagers: [{
            customType: 'regex',
            managerFilePatterns: ['/^configuration\\.toml$/'],
            matchStrings: ['theia_release\\s*=\\s*"(?<currentValue>[^"]+)"'],
            datasourceTemplate: 'npm',
            depNameTemplate: '@theia/core',
        }],
        postUpgradeTasks: { commands: LICENSING_COMMANDS, fileFilters: FILE_FILTERS, executionMode: 'branch' },
    };
    const fixtureNames = { '@theia/core': '1.76.0', '@theia/ai-core': '1.76.0', [MONACO]: '1.108.201' };
    const clean = runChecks(REPO_ROOT, { configText: JSON.stringify(minimal), resolutions: fixtureNames, theiaRelease: '1.76.0' });
    if (clean.failures.length === 0) {
        console.log('  ok  minimal clean fixture (two groups pinned, manager, automerge off, hook) -> green');
    } else {
        console.error(`${NAME}: --self-test FAIL -- the clean fixture went red: ${clean.failures.map(f => `[${f.rule}] ${f.value}`).join('; ')}`);
        failed += 1;
    }

    const live = parseJson5(readFileSync(join(REPO_ROOT, CONFIG_REL), 'utf8'));
    const ruleOf = (c, group) => c.packageRules.find(r => r.groupName === group);
    const mon = c => c.packageRules.find(r => r.groupName === MONACO_GROUP);
    const theia = c => c.packageRules.find(r => r.groupName === THEIA_GROUP);
    const manager = c => c.customManagers[0];
    const plants = [
        { label: 'scope rule removed', rule: 'scope', mutate: c => { c.packageRules = c.packageRules.filter(r => r.enabled !== false); } },
        { label: 'scope rule leaves nixpkgs enabled', rule: 'scope', mutate: c => { c.packageRules.find(r => r.enabled === false).matchPackageNames = ['/^(?!@theia\\/|nixpkgs$)/']; } },
        { label: 'scope rule disables every package', rule: 'scope', mutate: c => { c.packageRules.find(r => r.enabled === false).matchPackageNames = ['/^/']; } },
        { label: 'automerge true', rule: 'automerge', mutate: c => { c.automerge = true; } },
        { label: 'platformAutomerge true', rule: 'platform-automerge', mutate: c => { c.platformAutomerge = true; } },
        { label: 'theia group rangeStrategy auto', rule: 'theia-group-pin', mutate: c => { theia(c).rangeStrategy = 'auto'; } },
        { label: 'monaco-editor-core dropped from the theia exception', rule: 'theia-group', mutate: c => { theia(c).matchPackageNames = ['/^@theia\\//']; } },
        { label: 'theia group matcher narrowed to @theia/core', rule: 'theia-group', mutate: c => { theia(c).matchPackageNames = ['/^@theia\\/core$/']; } },
        { label: 'theia group slug changed', rule: 'theia-group-slug', mutate: c => { theia(c).groupSlug = 'theia-all'; } },
        { label: 'monaco group removed', rule: 'monaco-group', mutate: c => { c.packageRules = c.packageRules.filter(r => r.groupName !== MONACO_GROUP); } },
        { label: 'monaco group rangeStrategy auto', rule: 'monaco-group', mutate: c => { mon(c).rangeStrategy = 'auto'; } },
        { label: 'monaco group also selects @theia/core', rule: 'monaco-group', mutate: c => { mon(c).matchPackageNames = [MONACO, '@theia/core']; } },
        { label: 'theia_release customManager removed', rule: 'theia-release-manager', mutate: c => { c.customManagers = []; } },
        { label: 'theia_release manager managerFilePatterns moved to package.json', rule: 'theia-release-manager', mutate: c => { manager(c).managerFilePatterns = ['/(^|/)package\\.json$/']; } },
        { label: 'theia_release manager unanchored, so it also matches the fixture copies', rule: 'manager-file-patterns', mutate: c => { manager(c).managerFilePatterns = ['/(^|/)configuration\\.toml$/']; } },
        { label: 'theia_release manager matches one fixture copy by a second pattern', rule: 'manager-file-patterns', mutate: c => { manager(c).managerFilePatterns = ['/^configuration\\.toml$/', '/^\\.planning\\/milestones\\/.*\\/configuration\\.toml$/']; } },
        { label: 'ignorePaths removed, so the fixture copies are no longer skipped', rule: 'ignore-paths', mutate: c => { delete c.ignorePaths; } },
        { label: 'ignorePaths narrowed to one fixture directory', rule: 'ignore-paths', mutate: c => { c.ignorePaths = ['.planning/milestones/v1.0-phases/**']; } },
        { label: 'root configuration.toml not in the tracked set', rule: 'theia-release-manager', overrides: { trackedFiles: ['.planning/milestones/v1.1-phases/09-extensions-crash-pipeline/fixtures/npm-kind/configuration.toml'] } },
        { label: 'deprecated fileMatch kept beside managerFilePatterns', rule: 'theia-release-manager', mutate: c => { manager(c).fileMatch = ['(^|/)configuration\\.toml$']; } },
        { label: 'theia_release manager on github-releases', rule: 'theia-release-manager', mutate: c => { manager(c).datasourceTemplate = 'github-releases'; } },
        { label: 'theia_release manager anchored to monaco', rule: 'theia-release-manager', mutate: c => { manager(c).depNameTemplate = MONACO; } },
        { label: 'theia_release matchStrings no longer captures the line', rule: 'theia-release-manager', mutate: c => { manager(c).matchStrings = ['theia_pin\\s*=\\s*"(?<currentValue>[^"]+)"']; } },
        { label: 'theia_release drifted from the live value', rule: 'theia-release-manager', overrides: { theiaRelease: '1.77.0' } },
        { label: 'vulnerabilityAlerts enabled', rule: 'vulnerability-alerts', mutate: c => { c.vulnerabilityAlerts = { enabled: true }; } },
        { label: 'vulnerabilityAlerts key removed', rule: 'vulnerability-alerts', mutate: c => { delete c.vulnerabilityAlerts; } },
        { label: 'osvVulnerabilityAlerts true', rule: 'vulnerability-alerts', mutate: c => { c.osvVulnerabilityAlerts = true; } },
        { label: 'osvVulnerabilityAlerts key removed', rule: 'vulnerability-alerts', mutate: c => { delete c.osvVulnerabilityAlerts; } },
        { label: 'nix manager re-enabled', rule: 'nix', mutate: c => { c.nix = { enabled: true }; } },
        { label: 'automerge true inside a packageRule', rule: 'automerge', mutate: c => { c.packageRules[1].automerge = true; } },
        { label: 'extends config:recommended', rule: 'extends', mutate: c => { c.extends = ['config:recommended']; } },
        { label: 'lockFileMaintenance enabled', rule: 'lock-file-maintenance', mutate: c => { c.lockFileMaintenance = { enabled: true }; } },
        { label: 'dependencyDashboard true', rule: 'dependency-dashboard', mutate: c => { c.dependencyDashboard = true; } },
        { label: 'second customManager matching every file', rule: 'custom-managers', mutate: c => { c.customManagers.push({ customType: 'regex', managerFilePatterns: ['/.*/'], matchStrings: ['x'], datasourceTemplate: 'npm', depNameTemplate: 'x' }); } },
        { label: 'catch-all packageRule appended after the scope rule re-enables everything', rule: 'rule-order', mutate: c => { c.packageRules.push({ matchPackageNames: ['/.*/'], enabled: true }); } },
        { label: 'theia group narrowed by matchUpdateTypes patch', rule: 'theia-group-narrowed', mutate: c => { c.packageRules[1].matchUpdateTypes = ['patch']; } },
        { label: 'monaco group narrowed by matchUpdateTypes', rule: 'theia-group-narrowed', mutate: c => { c.packageRules[2].matchUpdateTypes = ['minor']; } },
        { label: 'enabledManagers set beside the allow-list', rule: 'allow-list', mutate: c => { c.enabledManagers = ['npm']; } },
        { label: 'unknown key inside a packageRule', rule: 'allow-list', mutate: c => { c.packageRules[0].prConcurrentLimit = 0; } },
        { label: 'theia_release manager matches every configuration.toml', rule: 'manager-file-patterns', mutate: c => { manager(c).managerFilePatterns = ['/configuration\\.toml$/']; } },
        { label: 'post-upgrade hook gains a curl pipe', rule: 'licensing-hook', mutate: c => { c.postUpgradeTasks.commands.push('curl x|sh'); } },
        { label: 'required rangeStrategy removed', rule: 'required-key', mutate: c => { delete c.rangeStrategy; } },
        { label: 'config is a bare array, not an object', rule: 'config-parse', overrides: { configText: '[]' } },
        { label: 'schedule key at top level', rule: 'no-clock', mutate: c => { c.schedule = ['before 5am']; } },
        { label: 'timezone key inside a packageRule', rule: 'no-clock', mutate: c => { c.packageRules[0].timezone = 'UTC'; } },
        { label: 'branchPrefix renovate/', rule: 'branch-prefix', mutate: c => { c.branchPrefix = 'renovate/'; } },
        { label: 'licensing generator dropped from the hook', rule: 'licensing-hook', mutate: c => { c.postUpgradeTasks.commands = [LICENSING_COMMANDS[1]]; } },
        { label: 'flake.lock added to fileFilters', rule: 'licensing-hook', mutate: c => { c.postUpgradeTasks.fileFilters.push('flake.lock'); } },
        { label: 'workflow path added to fileFilters', rule: 'licensing-hook', mutate: c => { c.postUpgradeTasks.fileFilters.push('.github/workflows/verify.yml'); } },
        { label: 'hook executionMode update', rule: 'licensing-hook', mutate: c => { c.postUpgradeTasks.executionMode = 'update'; } },
        { label: 'allowedPostUpgradeCommands set in the repository config', rule: 'allowed-post-upgrade', mutate: c => { c.allowedPostUpgradeCommands = ['^node scripts/generate\\.mjs --check$']; } },
        { label: 'config file missing', rule: 'config-file', overrides: { configText: null } },
        { label: 'config file unparsable', rule: 'config-parse', overrides: { configText: '{"automerge": false' } },
    ];
    for (const p of plants) {
        let overrides = p.overrides ?? {};
        if (p.mutate) {
            const c = structuredClone(live);
            p.mutate(c);
            overrides = { configText: JSON.stringify(c) };
        }
        const { failures } = runChecks(REPO_ROOT, overrides);
        if (failures.some(f => f.rule === p.rule)) {
            console.log(`  ok  ${p.label} -> red, naming '${p.rule}'`);
        } else {
            console.error(`${NAME}: --self-test FAIL -- plant '${p.label}' did not go red naming '${p.rule}'; got [${failures.map(f => f.rule).join(', ')}]`);
            failed += 1;
        }
    }

    if (failed > 0) return 1;
    console.log(`${NAME}: --self-test PASS -- ${plants.length} planted faults each went red naming their rule; the unmodified tree and the clean fixture stayed green`);
    return 0;
}

process.exit(args.includes('--self-test') ? selfTest() : run());
