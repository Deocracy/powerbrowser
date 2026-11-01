#!/usr/bin/env node
// scripts/verify-shell-request-kinds.mjs
//
// The shell-request-kinds gate (Phase 46, UPD-19). The chrome/frontend kind
// contract: the kinds `handleShellMessage` accepts in
// powerbrowser/shell/PowerBrowserAPI.sys.mjs must equal the kinds the Theia
// client dispatches, as set equality. A stray kind on either side, a removed
// kind, or a throwing default case goes red naming the kind and the side.
//
// HOW IT ASSERTS, and why it is not a hand-kept list. It DERIVES, from the
// tree at check time:
//
//   1. the ACCEPTED set: the `case "<kind>":` labels inside
//      `handleShellMessage`'s switch plus the `SHELL_MESSAGE_KINDS` set
//      entries, which must agree with each other first (a case without a set
//      entry or vice versa is its own red line);
//   2. the DISPATCHED set: the `kind: '<kind>'` literals in the Theia
//      shell-state channel client code (`theia/extensions/**/src/**/*`,
//      files naming the shell-state request channel), plus the
//      `ShellStateMessage` union members in profile-storage.ts;
//
// and then compares those derived sets as equality. A hand-kept list of
// kinds can only ever agree with the tree it was copied from; these
// comparisons go red on an ADDED kind on either side and a REMOVED kind on
// either side. The default-case rule is static shape: its body must contain
// `ok: false` (a return, never a throw).
//
// Static on purpose: it reads the source, needs no build, no browser and no
// display, and therefore belongs in --quick where a drift costs seconds
// rather than a forty-minute rebuild.
//
// Usage:
//   node scripts/verify-shell-request-kinds.mjs
//   node scripts/verify-shell-request-kinds.mjs --self-test
//
// Exit 0 pass, 1 fail. --self-test plants every fault in memory and requires
// each to go red naming the drift; a check that can only go green is not a
// check.

import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SELF = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(SELF), '..');
const NAME = 'shell-request-kinds';
const SELF_REL = 'scripts/verify-shell-request-kinds.mjs';

const args = process.argv.slice(2);
for (const a of args) {
    if (a !== '--self-test') {
        console.error(`${NAME}: FAIL -- unknown argument '${a}'`);
        console.error(`  Next step: run: node ${SELF_REL}, or add --self-test to prove the agreement discriminates.`);
        process.exit(2);
    }
}

const BOUNDARY_REL = 'powerbrowser/shell/PowerBrowserAPI.sys.mjs';
const PROFILE_STORAGE_REL = 'theia/extensions/tab-uris/src/browser/profile-storage.ts';
const RERUN = 'node scripts/verify-shell-request-kinds.mjs';

function readText(root, rel) {
    try {
        return readFileSync(join(root, rel), 'utf8');
    } catch {
        return null;
    }
}

function listTracked(root) {
    try {
        return execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
            .split('\n')
            .map(l => l.trim())
            .filter(l => l !== '');
    } catch {
        return null;
    }
}

/** The body of `async handleShellMessage(data, actorRef) { ... }`, brace-matched, or null. */
function handleShellMessageBody(src) {
    const decl = src.match(/async\s+handleShellMessage\s*\([^)]*\)\s*\{/);
    if (!decl || decl.index === undefined) {
        return null;
    }
    let depth = 0;
    const open = decl.index + decl[0].length - 1;
    for (let i = open; i < src.length; i += 1) {
        if (src[i] === '{') depth += 1;
        else if (src[i] === '}') {
            depth -= 1;
            if (depth === 0) return src.slice(open + 1, i);
        }
    }
    return null;
}

/** The `new Set([...])` element list of SHELL_MESSAGE_KINDS, or null. */
function shellMessageKindsSet(src) {
    const m = src.match(/const\s+SHELL_MESSAGE_KINDS\s*=\s*new\s+Set\s*\(\s*\[([\s\S]*?)\]\s*\)/);
    if (!m) return null;
    return [...m[1].matchAll(/"([^"]+)"|'([^']+)'/g)].map(x => x[1] ?? x[2]);
}

/**
 * The `case "<kind>":` labels inside a handleShellMessage body. Only the
 * switch that body carries counts; a `case` elsewhere in the file is not an
 * accepted shell-request kind.
 */
function acceptedCases(body) {
    return [...body.matchAll(/case\s+"([^"]+)"\s*:/g)].map(m => m[1]);
}

/** The union members of `type ShellStateMessage = ...` in profile-storage.ts. */
function shellStateUnion(src) {
    const m = src.match(/type\s+ShellStateMessage\s*=\s*([\s\S]*?);/);
    if (!m) return null;
    return [...m[1].matchAll(/kind:\s*'([^']+)'/g)].map(x => x[1]);
}

/** Does the handleShellMessage default-case body contain `ok: false` (return, never throw)? */
function defaultCaseReturnsOkFalse(body) {
    const m = body.match(/default\s*:\s*([\s\S]*?)(\n\s*}\s*\n|\n\s*}\s*$)/);
    // Fall back: the text from `default:` to the switch close. The switch is
    // the last block of the try, so slice to the body's end and require the
    // marker inside the default arm rather than anywhere later.
    const seg = m ? m[1] : body.slice(body.indexOf('default:'));
    return /ok\s*:\s*false/.test(seg);
}

function runChecks(root, overrides = {}) {
    const failures = [];
    const read = overrides.read ?? ((rel) => readText(root, rel));

    // --- 1. accepted: cases vs SHELL_MESSAGE_KINDS, derived from the boundary file ---
    const boundarySrc = read(BOUNDARY_REL);
    if (boundarySrc === null) {
        failures.push(`${BOUNDARY_REL} could not be read, so the accepted kind set is unproven. Next step: restore it.`);
        return { failures, accepted: [], dispatched: [] };
    }
    const body = handleShellMessageBody(boundarySrc);
    if (body === null) {
        failures.push(`${BOUNDARY_REL} carries no handleShellMessage body this check can read, so the accepted kind set is unproven. Next step: check the instrument (${SELF_REL}: its body matcher) against handleShellMessage.`);
        return { failures, accepted: [], dispatched: [] };
    }
    const setKinds = shellMessageKindsSet(boundarySrc);
    if (setKinds === null) {
        failures.push(`${BOUNDARY_REL} carries no SHELL_MESSAGE_KINDS set this check can read. Next step: restore the const.`);
        return { failures, accepted: [], dispatched: [] };
    }
    const caseKinds = acceptedCases(body);
    if (caseKinds.length === 0) {
        failures.push(`${BOUNDARY_REL} handleShellMessage carries no case "<kind>": labels, so the accepted set is empty and asserts nothing. Next step: check the instrument (${SELF_REL}) and handleShellMessage.`);
        return { failures, accepted: [], dispatched: [] };
    }
    const setOnly = setKinds.filter(k => !caseKinds.includes(k));
    const caseOnly = caseKinds.filter(k => !setKinds.includes(k));
    for (const k of setOnly) {
        failures.push(`${BOUNDARY_REL} SHELL_MESSAGE_KINDS admits '${k}' with no handleShellMessage case for it. Next step: add the case or remove the set entry.`);
    }
    for (const k of caseOnly) {
        failures.push(`${BOUNDARY_REL} handleShellMessage accepts '${k}' with no SHELL_MESSAGE_KINDS entry for it. Next step: add the set entry or remove the case.`);
    }
    const accepted = [...new Set(caseKinds)];

    // --- the default case must return { ok: false }, never throw ---
    if (!defaultCaseReturnsOkFalse(body)) {
        failures.push(`${BOUNDARY_REL} handleShellMessage default case does not return { ok: false } -- an unknown kind must be refused with the existing shape, never thrown. Next step: restore the default return.`);
    }

    // --- 2. dispatched: literals in the Theia shell-state channel clients ---
    const files = overrides.files ?? listTracked(root);
    if (files === null) {
        failures.push(`git ls-files failed, so the dispatched kind set could not be derived. Next step: run this check inside the repository.`);
        return { failures, accepted, dispatched: [] };
    }
    const dispatchedSet = new Set();
    const channelFiles = files.filter(rel =>
        rel.startsWith('theia/extensions/') &&
        (rel.endsWith('.ts') || rel.endsWith('.tsx')) &&
        !rel.includes('/lib/') &&
        !rel.includes('/node_modules/')
    );
    let channelSeen = 0;
    // Kinds that ride a DIFFERENT dispatch are out of this contract's scope
    // by construction, not exemption: handleGroupMutation (groups, web tabs,
    // stock kinds, window frame), handleStoreRequest (store reads), and the
    // chrome->frontend pushes (flushShellState, focusAddress, state). Each set
    // below is DERIVED at check time from the union that declares it, never
    // hand-kept: a new kind on another channel cannot redden this row, and a
    // hand list that missed it would agree only with the tree it was copied
    // from. Derivation sites: GroupMutation (group-actor-client.ts),
    // WebTabMessage/WindowMessage/TabRowMessage (web-tab.ts),
    // StoreMessage (tab-store-access-protocol.ts).
    const GROUP_MUTATION_REL = 'theia/extensions/modes/src/browser/group-actor-client.ts';
    const WEB_TAB_REL = 'theia/extensions/tab-uris/src/browser/web-tab.ts';
    const STORE_RELAY_REL = 'theia/extensions/tab-uris/src/browser/tab-store-access-protocol.ts';
    const CHROME_STORE_REL = 'theia/extensions/tab-uris/src/browser/chrome-store-client.ts';
    const outOfScope = new Set(['flushShellState', 'focusAddress', 'state']);
    for (const [rel, patterns] of [
        [GROUP_MUTATION_REL, [/kind:\s*'([^']+)'/g]],
        [WEB_TAB_REL, [/kind:\s*'([^']+)'/g]],
        // The store kinds ride handleStoreRequest, not handleShellMessage.
        // Their declaration site is TAB_STORE_RELAY_KINDS (string list, read
        // below) plus TAB_STORE_WRITE_OPS keys; chrome-store-client.ts spells
        // the same kinds as request literals. Both are derived, never listed.
        [CHROME_STORE_REL, [/kind:\s*'([^']+)'/g]],
    ]) {
        const src = read(rel);
        if (src === null) {
            failures.push(`${rel} could not be read, so the out-of-scope kind set is unproven. Next step: restore it.`);
            return { failures, accepted, dispatched: [] };
        }
        for (const re of patterns) {
            for (const m of src.matchAll(re)) outOfScope.add(m[1]);
        }
    }
    {
        const src = read(STORE_RELAY_REL);
        if (src === null) {
            failures.push(`${STORE_RELAY_REL} could not be read, so the out-of-scope kind set is unproven. Next step: restore it.`);
            return { failures, accepted, dispatched: [] };
        }
        for (const m of src.matchAll(/'([^']+)'/g)) {
            // TAB_STORE_RELAY_KINDS entries + TAB_STORE_WRITE_FIELDS keys are
            // bare identifiers in the same file; the union above already covers
            // the actor kinds, so accept any single-token literal here.
            if (/^[A-Za-z][A-Za-z0-9]*$/.test(m[1])) outOfScope.add(m[1]);
        }
    }
    // probeChannel/openStockTab ride handleGroupMutation but live outside the
    // three unions (browser-window-command.ts spellings); derive them from
    // their own file so they stay derived too.
    const BROWSER_WINDOW_COMMAND_REL = 'theia/extensions/tab-uris/src/browser/browser-window-command.ts';
    {
        const src = read(BROWSER_WINDOW_COMMAND_REL);
        if (src === null) {
            failures.push(`${BROWSER_WINDOW_COMMAND_REL} could not be read, so the out-of-scope kind set is unproven. Next step: restore it.`);
            return { failures, accepted, dispatched: [] };
        }
        for (const m of src.matchAll(/kind:\s*'([^']+)'|OPEN_STOCK_TAB_KIND|PROBE_CHANNEL_KIND/g)) {
            if (m[1]) outOfScope.add(m[1]);
        }
        // The two const-spelled kinds above: read their values, never the names.
        for (const m of src.matchAll(/OPEN_STOCK_TAB_KIND\s*=\s*'([^']+)'|PROBE_CHANNEL_KIND\s*=\s*'([^']+)'/g)) {
            outOfScope.add(m[1] ?? m[2]);
        }
    }
    const OUT_OF_SCOPE = outOfScope;
    for (const rel of channelFiles) {
        const text = read(rel);
        if (text === null || text.includes('\x00')) continue;
        if (!text.includes('PowerBrowserGroupRequest') && !text.includes('SHELL_STATE_REQUEST_EVENT') && !text.includes('GROUP_REQUEST_EVENT')) continue;
        channelSeen += 1;
        for (const m of text.matchAll(/kind:\s*'([^']+)'/g)) {
            if (!OUT_OF_SCOPE.has(m[1])) dispatchedSet.add(m[1]);
        }
    }
    // The ShellStateMessage union is the contract site: it must parse, and
    // its members join the dispatched set the same channel files spell.
    const unionSrc = read(PROFILE_STORAGE_REL);
    if (unionSrc === null) {
        failures.push(`${PROFILE_STORAGE_REL} could not be read, so the ShellStateMessage contract is unproven. Next step: restore it.`);
    } else {
        const union = shellStateUnion(unionSrc);
        if (union === null || union.length === 0) {
            failures.push(`${PROFILE_STORAGE_REL} carries no ShellStateMessage union this check can read, so the dispatched set is unproven. Next step: check the instrument (${SELF_REL}: its union matcher).`);
        } else {
            for (const k of union) dispatchedSet.add(k);
        }
    }
    if (channelSeen === 0) {
        failures.push(`no Theia shell-state channel client found under theia/extensions/ -- an agreement over nothing proves nothing. Next step: check the instrument (${SELF_REL}: its channel-file filter) and that git ls-files lists the tree.`);
        return { failures, accepted, dispatched: [] };
    }
    // Enumeration completeness: the ShellStateMessage union is the contract
    // site for this channel. A union member swallowed by OUT_OF_SCOPE would be
    // invisible to the equality below (green on a kind neither side checks).
    // Only the chrome->frontend push kind may sit in both sets.
    {
        const unionSrc = read(PROFILE_STORAGE_REL);
        const union = unionSrc !== null ? shellStateUnion(unionSrc) : null;
        if (union !== null) {
            for (const k of union) {
                if (OUT_OF_SCOPE.has(k) && k !== 'flushShellState') {
                    failures.push(`${PROFILE_STORAGE_REL} ShellStateMessage member '${k}' is also out-of-scope -- a union kind no side checks. Next step: remove it from the union or from the out-of-scope derivation.`);
                }
            }
        }
    }

    // Only the shell-request kinds participate (OUT_OF_SCOPE already
    // removed the web-tab/stock/store kinds at collection; pushKinds removes
    // the chrome->frontend pushes). Final contract: strict set equality in
    // both directions.
    const dispatched = [...dispatchedSet];
    // Chrome->frontend pushes (never a handleShellMessage request): the
    // flushShellState quit-flush push plus the appUpdate push the 46-02
    // client listens for on WEB_TAB_STATE_EVENT (update-client.ts
    // onAppUpdatePush's `detail.kind !== 'appUpdate'` guard). Excluded from
    // the request equality by construction, not exemption.
    const pushKinds = new Set(['flushShellState', 'appUpdate']);
    const acceptedReq = accepted.filter(k => !pushKinds.has(k));
    const dispatchedReq = dispatched.filter(k => !pushKinds.has(k));
    const dispatchedOnly = dispatchedReq.filter(k => !acceptedReq.includes(k));
    const acceptedOnly = acceptedReq.filter(k => !dispatchedReq.includes(k));
    for (const k of dispatchedOnly) {
        failures.push(`Theia dispatches '${k}' but handleShellMessage accepts no such kind. Next step: add the chrome case (plus the SHELL_MESSAGE_KINDS entry) or stop dispatching it.`);
    }
    for (const k of acceptedOnly) {
        failures.push(`handleShellMessage accepts '${k}' but no Theia client dispatches it. Next step: dispatch it from the client or remove the chrome case (plus the SHELL_MESSAGE_KINDS entry).`);
    }
    return { failures, accepted: acceptedReq, dispatched: dispatchedReq };
}

function main() {
    if (args.includes('--self-test')) return selfTest();
    const { failures, accepted, dispatched } = runChecks(REPO_ROOT);
    console.log(`${NAME}: accepted(${accepted.length}) [${accepted.join(', ')}] vs dispatched(${dispatched.length}) [${dispatched.join(', ')}]`);
    if (failures.length > 0) {
        console.error(`${NAME}: FAIL -- ${failures.length} problem(s) with the shell-request kind agreement.`);
        failures.forEach(f => console.error(`  ${f}`));
        return 1;
    }
    console.log(`${NAME}: PASS -- handleShellMessage accepts exactly the kinds the Theia client dispatches (${accepted.length} kinds); the default case returns { ok: false }`);
    return 0;
}

function selfTest() {
    const cache = new Map();
    const realRead = (rel) => {
        if (!cache.has(rel)) cache.set(rel, readText(REPO_ROOT, rel));
        return cache.get(rel);
    };
    const files = listTracked(REPO_ROOT);
    const baseline = runChecks(REPO_ROOT, { read: realRead, files });
    if (baseline.failures.length > 0 || baseline.accepted.length === 0) {
        console.error(`${NAME}: --self-test FAIL -- the unmodified tree is already red, so the planted-fault results below would mean nothing:`);
        baseline.failures.forEach(f => console.error(`  ${f}`));
        return 1;
    }
    console.log(`  ok  baseline -> green (${baseline.accepted.length} kinds each side)`);

    const withBoundary = (fn) => ({
        read: (rel) => (rel === BOUNDARY_REL ? fn(realRead(rel)) : realRead(rel)),
    });
    const withClient = (target, line) => ({
        read: (rel) => (rel === target ? `${realRead(rel)}\n${line}\n` : realRead(rel)),
    });
    // Remove the last-dispatched request kind from every channel file + the
    // union, so the "removed kind" plant is a true removal on that side.
    const withoutKind = (kind) => ({
        read: (rel) => {
            const text = realRead(rel);
            if (rel === BOUNDARY_REL) return text;
            if (rel === PROFILE_STORAGE_REL) {
                return text.split('\n').filter(l => !l.includes(`'${kind}'`)).join('\n');
            }
            if (!text || !text.includes('PowerBrowserGroupRequest')) return text;
            return text.split('\n').filter(l => !l.includes(`'${kind}'`)).join('\n');
        },
    });

    const strayAccepted = 'shellStrayAccepted';
    const strayDispatched = 'shellStrayDispatched';
    const victim = baseline.dispatched[baseline.dispatched.length - 1];
    const plants = [
        ['stray kind accepted only', withBoundary(t => t.replace('const SHELL_MESSAGE_KINDS = new Set([', `const SHELL_MESSAGE_KINDS = new Set(["${strayAccepted}", `).replace('case "shellStateLoad": {', `case "${strayAccepted}": {\n          return { ok: true, kind };\n        }\n        case "shellStateLoad": {`)), strayAccepted, 'accepted'],
        ['stray kind dispatched only', withClient(PROFILE_STORAGE_REL, `// plant: dispatched-kind literal\nconst PLANT = { kind: '${strayDispatched}' } as const;`), strayDispatched, 'dispatched'],
        [`removed kind on the chrome side (${victim})`, withBoundary(t => t.replace(`"${victim}"`, `"${victim}Removed"`).replace(`case "${victim}":`, `case "${victim}Removed":`)), victim, 'accepted'],
        [`removed kind on the client side (${victim})`, withoutKind(victim), victim, 'dispatched'],
        ['throwing default case', withBoundary(t => t.replace('return { ok: false, reason: "validation", message: `handleShellMessage: unknown kind ${String(kind)}` };', 'throw new Error(`unknown kind ${String(kind)}`);')), 'default', 'throw'],
    ];

    let failed = 0;
    for (const [name, overrides, needle, side] of plants) {
        const { failures } = runChecks(REPO_ROOT, { files, ...overrides });
        const hit = side === 'throw'
            ? failures.some(f => f.includes('default case') && f.includes('ok: false'))
            : failures.some(f => f.includes(`'${needle}'`));
        if (hit) {
            console.log(`  ok  ${name} -> red naming '${needle}' (${side})`);
        } else {
            console.error(`${NAME}: --self-test FAIL -- '${name}' did not go red naming '${needle}' (${side}); got: ${failures.join(' | ') || '(no failures at all)'}`);
            failed += 1;
        }
    }

    if (failed > 0) return 1;
    console.log(`${NAME}: --self-test PASS -- ${plants.length} planted faults went red naming the kind and the side, and the control stayed green`);
    return 0;
}

process.exit(main());
