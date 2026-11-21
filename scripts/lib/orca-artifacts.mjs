// scripts/lib/orca-artifacts.mjs -- Orca's own artifact tables, for the Phase 68 packaging checks
// (PLAT-01, P68-06, P68-31, P68-33).
//
// What is derived, at check time, from the pinned Orca source:
//   - the slot-marker file names (the *_FILENAME constants a Node or Bun slot writes into out/orcad,
//     which a de-slotted PowerBrowser tree must not carry), from orca/src/shared/orcad-artifacts.ts;
//   - ORCAD_RIPGREP_ARTIFACTS, the per-target ripgrep paths, from the same file;
//   - orcadAgentBrowserNativeName, the per-target agent-browser binary name, from
//     orca/src/shared/orcad-agent-browser-name.ts.
// Both files are imported by Node's type stripping (Orca keeps them erasable-only TypeScript for
// exactly this). No value is copied into this repository: a copy could only ever agree with the pin it
// was copied from. An import failure or an empty table throws "Orca's artifact tables moved", so every
// check built on this module is red, never vacuously green, after an upstream rename.
//
// macosMergePlan (P68-31) turns two thin macOS Orca trees (package.json, out/orcad, out/web; anything else
// at the tree root, such as BUILD_ROOT or SHA256SUMS, is not part of the packaged root and is ignored) into
// the actions package-macos.sh orca-universal executes:
//   pair     an arch-named file (darwin-arm64 in one tree, darwin-x64 in the other): one fat file staged
//            under both names. The names come only from ORCAD_RIPGREP_ARTIFACTS and
//            orcadAgentBrowserNativeName('darwin', arm64|x64); a table that yields no pair is "source moved".
//   inplace  a same-name file that is a thin Mach-O in both trees: merged in place.
//   same     every other file: byte-identical in both trees, else red naming it. A symbolic link is a same
//            line when both trees carry it with the same target inside the packaged root; a link in one
//            tree only, with differing targets, or pointing outside the root is red naming it (audit
//            harness-driver-11: cp -a took every link from the arm64 tree, unchecked).
// An arch-named file without its partner, or a file present in one tree only, is red naming it.
//
// CLI:
//   node scripts/lib/orca-artifacts.mjs macos-merge-plan ARM X64 ORCA_SRC   one tab-separated action per line,
//                                                                           or FAIL lines and exit 1
//   node scripts/lib/orca-artifacts.mjs --self-test                         synthetic trees, no lipo needed

import { createHash } from 'node:crypto';
import { closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, readSync, readdirSync, readlinkSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, posix, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ARTIFACTS_REL = 'src/shared/orcad-artifacts.ts';
const AGENT_BROWSER_REL = 'src/shared/orcad-agent-browser-name.ts';
// The constants whose values are slot markers. The names are Orca's API; the values are read from the pin.
const MARKER_CONSTANTS = ['ORCAD_SERVER_TARGET_FILENAME', 'ORCAD_NODE_RUNTIME_MARKER_FILENAME', 'ORCAD_VERSION_FILENAME', 'ORCAD_BUILD_TARGET_FILENAME'];

function moved(rel, why) {
    return new Error(`Orca's artifact tables moved (orca/${rel}: ${why}); re-read orca/src/shared/orcad-artifacts.ts`);
}

function readTs(orcaRoot, rel) {
    const file = join(orcaRoot, rel);
    if (!existsSync(file)) throw moved(rel, 'file absent');
    return readFileSync(file, 'utf8');
}

// One single- or double-quoted string literal with no escape and no newline.
const STR = String.raw`'([^'\\\n]*)'|"([^"\\\n]*)"`;

/**
 * The value of `export const NAME = '<literal>'`, or of a [...] list of string literals (`as const` allowed), read
 * from pinned source text. Nothing in orca/ is imported or executed (review point 9, handed over by lane G5a: the old
 * loader imported the pinned .ts files, so the check ran third-party code on every machine that ran it, the
 * persistent self-hosted runner included). Any other form returns undefined, which the caller reports as moved.
 */
export function exportedLiteral(source, name) {
    const scalar = new RegExp(String.raw`^export const ${name}\s*=\s*(?:${STR})\s*;?\s*$`, 'm').exec(source);
    if (scalar) return scalar[1] ?? scalar[2];
    const list = new RegExp(String.raw`^export const ${name}\s*=\s*\[([^\]]*)\](?:\s*as const)?\s*;?\s*$`, 'm').exec(source);
    if (!list) return undefined;
    const items = list[1].split(',').map((s) => s.trim()).filter(Boolean).map((s) => new RegExp(String.raw`^(?:${STR})$`).exec(s));
    return items.length && items.every(Boolean) ? items.map((m) => m[1] ?? m[2]) : undefined;
}

/**
 * orcadAgentBrowserNativeName, read as text and evaluated by this file, never run: its first two parameters
 * (platform, architecture), the template literal it returns, and the `const` aliases that template uses. An alias
 * must have one of the two forms Orca writes, else the name is null (moved):
 *   const X = <platform> === '<lit>' ? '<a>' : '<b>'        evaluated for the platform asked
 *   const X = <platform> === 'linux' && ... ? '<lit>' : <platform>   the platform itself off Linux
 */
export function agentBrowserNameFrom(source) {
    const fn = /export function orcadAgentBrowserNativeName\s*\(([\s\S]*?)\)\s*:\s*string\s*\{([\s\S]*?)\}\s*$/m.exec(source);
    if (!fn) return null;
    const params = fn[1].split(',').map((p) => p.trim().split(/[\s:=?]/)[0]).filter(Boolean);
    if (params.length < 2) return null;
    const [plat, arch] = params;
    const tpl = /return\s+`([^`]*)`/.exec(fn[2]);
    if (!tpl) return null;
    const aliases = {};
    for (const m of fn[2].matchAll(/const\s+(\w+)\s*=\s*([\s\S]*?)(?:\n\s*(?=const\b|return\b)|$)/g)) aliases[m[1]] = m[2].replace(/\s+/g, ' ').trim();
    const value = (id, platform, a) => {
        if (id === plat) return platform;
        if (id === arch) return a;
        const expr = aliases[id];
        if (expr === undefined) return null;
        const eq = new RegExp(String.raw`^${plat} === '([^']*)' \? '([^']*)' : '([^']*)'$`).exec(expr);
        if (eq) return platform === eq[1] ? eq[2] : eq[3];
        const offLinux = new RegExp(String.raw`^${plat} === 'linux' && [^?]* \? '[^']*' : ${plat}$`).exec(expr);
        if (offLinux && platform !== 'linux') return platform;
        return null;
    };
    return (platform, a) => {
        let ok = true;
        const name = tpl[1].replace(/\$\{(\w+)\}/g, (_, id) => { const v = value(id, platform, a); if (v === null) ok = false; return v ?? ''; });
        return ok ? name : null;
    };
}

/** { markerNames, ripgrepArtifacts, agentBrowserName(platform, arch) } read from orcaRoot's source text. */
export async function orcaArtifactTables(orcaRoot) {
    const artifacts = readTs(orcaRoot, ARTIFACTS_REL);
    const browser = readTs(orcaRoot, AGENT_BROWSER_REL);
    const markerNames = MARKER_CONSTANTS.map((c) => exportedLiteral(artifacts, c)).filter((v) => typeof v === 'string' && v !== '');
    if (markerNames.length !== MARKER_CONSTANTS.length) {
        throw moved(ARTIFACTS_REL, `derived ${markerNames.length} of ${MARKER_CONSTANTS.length} slot-marker names (${MARKER_CONSTANTS.join(', ')})`);
    }
    const rg = exportedLiteral(artifacts, 'ORCAD_RIPGREP_ARTIFACTS');
    const ripgrepArtifacts = Array.isArray(rg) ? [...rg] : [];
    if (ripgrepArtifacts.length === 0) throw moved(ARTIFACTS_REL, 'ORCAD_RIPGREP_ARTIFACTS is absent, empty or not a list of string literals');
    const name = agentBrowserNameFrom(browser);
    if (!name || name('darwin', 'arm64') === null) throw moved(AGENT_BROWSER_REL, 'orcadAgentBrowserNativeName is absent or not in a shape this check reads');
    return { markerNames, ripgrepArtifacts, agentBrowserName: name };
}

/** [armSuffix, x64Suffix] pairs from Orca's tables; empty means the source moved. */
export function archPairs(tables) {
    const rg = tables.ripgrepArtifacts;
    const pairs = rg.filter((a) => a.includes('darwin-arm64')).map((a) => [a, a.replace('darwin-arm64', 'darwin-x64')]).filter(([, x]) => rg.includes(x));
    const arm = tables.agentBrowserName('darwin', 'arm64');
    const x64 = tables.agentBrowserName('darwin', 'x64');
    if (arm !== x64) pairs.push([arm, x64]);
    return pairs;
}

/**
 * The packaged regular files, sorted. Symbolic links (to files or directories; readdir's Dirent is lstat-based, so
 * a link is neither) go to `links` as rel -> target, so the plan can judge them instead of skipping them (audit
 * harness-driver-11: cp -a took every link from the arm64 tree unchecked). Any other entry type goes to `others`.
 */
function packagedFiles(root, links = new Map(), others = []) {
    const out = [];
    if (existsSync(join(root, 'package.json'))) out.push('package.json');
    const walkDir = (dir) => {
        let entries;
        try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
        for (const e of entries) {
            const p = join(dir, e.name);
            const rel = relative(root, p).split('\\').join('/');
            if (e.isDirectory()) walkDir(p);
            else if (e.isFile()) out.push(rel);
            else if (e.isSymbolicLink()) links.set(rel, readlinkSync(p));
            else others.push(rel);
        }
    };
    for (const sub of ['out/orcad', 'out/web']) walkDir(join(root, sub));
    return out.sort();
}

/**
 * Failure lines for the two trees' symbolic links: one only in one tree, a target that differs between them, or
 * a target outside the packaged root (cp -a would ship it dangling). Pushes each agreeing link to `same`.
 */
function linkFails(armLinks, x64Links, same) {
    const fails = [];
    for (const rel of [...new Set([...armLinks.keys(), ...x64Links.keys()])].sort()) {
        const a = armLinks.get(rel);
        const x = x64Links.get(rel);
        if (a === undefined || x === undefined) { fails.push(`symlink ${rel} is only in the ${a !== undefined ? 'arm64' : 'x64'} tree`); continue; }
        if (a !== x) { fails.push(`symlink ${rel} points at ${a} in the arm64 tree and at ${x} in the x64 tree`); continue; }
        const resolved = posix.normalize(posix.join(posix.dirname(rel), a));
        const packaged = resolved === 'package.json' || ['out/orcad', 'out/web'].some((d) => resolved === d || resolved.startsWith(`${d}/`));
        if (posix.isAbsolute(a) || !packaged) { fails.push(`symlink ${rel} points outside the packaged tree (${a})`); continue; }
        same.push(rel);
    }
    return fails;
}

function head4(p) {
    const b = Buffer.alloc(4);
    let fd;
    try { fd = openSync(p, 'r'); return readSync(fd, b, 0, 4, 0) === 4 ? b.toString('hex') : ''; } catch { return ''; } finally { if (fd !== undefined) closeSync(fd); }
}
const THIN = new Set(['cffaedfe', 'cefaedfe', 'feedfacf', 'feedface']);
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');

export function macosMergePlan({ armDir, x64Dir, tables }) {
    const plan = { pairs: [], inPlace: [], identical: [], links: [], fails: [] };
    const pairs = archPairs(tables);
    if (pairs.length === 0) {
        plan.fails.push('zero arch-named pairs derived from ORCAD_RIPGREP_ARTIFACTS and orcadAgentBrowserNativeName: Orca\'s artifact tables moved (source moved); re-read orca/src/shared/orcad-artifacts.ts');
        return plan;
    }
    const armLinks = new Map();
    const x64Links = new Map();
    const others = [];
    const arm = packagedFiles(armDir, armLinks, others);
    const x64 = packagedFiles(x64Dir, x64Links, others);
    plan.fails.push(...linkFails(armLinks, x64Links, plan.links));
    for (const rel of [...new Set(others)].sort()) plan.fails.push(`${rel} is neither a regular file, a directory nor a symlink, so the merge cannot judge it`);
    const armSet = new Set(arm);
    const x64Set = new Set(x64);
    const consumed = new Set();
    const matchTail = (rel, suffix) => (rel === suffix || rel.endsWith(`/${suffix}`) ? rel.slice(0, rel.length - suffix.length) : null);
    for (const [a, x] of pairs) {
        for (const rel of arm) {
            const prefix = matchTail(rel, a);
            if (prefix === null) continue;
            consumed.add(`a:${rel}`);
            if (x64Set.has(prefix + x)) { consumed.add(`x:${prefix + x}`); plan.pairs.push({ arm: rel, x64: prefix + x, names: [rel, prefix + x] }); }
            else plan.fails.push(`arch-named ${rel} has no partner ${prefix + x} in the x64 tree`);
        }
        for (const rel of x64) {
            const prefix = matchTail(rel, x);
            if (prefix === null || consumed.has(`x:${rel}`)) continue;
            consumed.add(`x:${rel}`);
            plan.fails.push(`arch-named ${rel} has no partner ${prefix + a} in the arm64 tree`);
        }
    }
    for (const rel of [...new Set([...arm, ...x64])].sort()) {
        if (consumed.has(`a:${rel}`) || consumed.has(`x:${rel}`)) continue;
        if (!armSet.has(rel) || !x64Set.has(rel)) { plan.fails.push(`${rel} is only in the ${armSet.has(rel) ? 'arm64' : 'x64'} tree`); continue; }
        if (THIN.has(head4(join(armDir, rel))) && THIN.has(head4(join(x64Dir, rel)))) plan.inPlace.push(rel);
        else if (sha(join(armDir, rel)) === sha(join(x64Dir, rel))) plan.identical.push(rel);
        else plan.fails.push(`${rel} differs between the two trees and is not a thin Mach-O pair lipo can merge`);
    }
    return plan;
}

function planLines(plan) {
    if (plan.fails.length) return plan.fails.map((f) => `FAIL\t${f}`);
    return [
        ...plan.pairs.map((p) => `pair\t${p.arm}\t${p.x64}`),
        ...plan.inPlace.map((r) => `inplace\t${r}`),
        ...plan.identical.map((r) => `same\t${r}`),
        // A link with the same in-tree target in both trees: cp -a of the arm64 tree carries it as is.
        ...plan.links.map((r) => `same\t${r}`),
    ];
}

async function selfTest() {
    const NAME = 'orca-macos-merge';
    const tmp = mkdtempSync(join(tmpdir(), `${NAME}-`));
    try {
        const repoOrca = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'orca');
        let tables;
        let from;
        if (existsSync(join(repoOrca, ARTIFACTS_REL))) {
            tables = await orcaArtifactTables(repoOrca);
            from = 'the real orca/ tables';
        } else {
            const fx = join(tmp, 'orca-src', 'src', 'shared');
            mkdirSync(fx, { recursive: true });
            writeFileSync(join(fx, 'orcad-artifacts.ts'), `${MARKER_CONSTANTS.map((c, i) => `export const ${c} = '.fixture-${i}'`).join('\n')}\nexport const ORCAD_RIPGREP_ARTIFACTS = ['ripgrep/darwin-x64/rg', 'ripgrep/darwin-arm64/rg'] as const\n`);
            writeFileSync(join(fx, 'orcad-agent-browser-name.ts'), 'export function orcadAgentBrowserNativeName(p: string, a: string): string { return `agent-browser-${p}-${a}` }\n');
            writeFileSync(join(tmp, 'orca-src', 'package.json'), '{ "type": "module" }\n');
            tables = await orcaArtifactTables(join(tmp, 'orca-src'));
            from = 'a fixture source (orca/ is not fetched here)';
        }
        const pairs = archPairs(tables);
        const macho = (cpu) => { const b = Buffer.alloc(64); b.write('cffaedfe', 0, 'hex'); b.writeUInt32LE(cpu, 4); return b; };
        const ARM = 0x0100000c;
        const X86 = 0x01000007;
        const put = (root, rel, body) => { mkdirSync(dirname(join(root, rel)), { recursive: true }); writeFileSync(join(root, rel), body); };
        const make = (tag) => {
            const a = join(tmp, `arm-${tag}`);
            const x = join(tmp, `x64-${tag}`);
            for (const [root, cpu] of [[a, ARM], [x, X86]]) {
                put(root, 'package.json', '{ "name": "fixture" }\n');
                put(root, 'out/web/web-index.html', '<!doctype html>\n');
                put(root, 'out/orcad/node_modules/node-pty/build/Release/pty.node', macho(cpu));
                put(root, 'BUILD_ROOT', `/Users/runner/${tag}-${cpu}\n`); // outside the packaged root: ignored
            }
            for (const [pa, px] of pairs) { put(a, `out/orcad/${pa}`, macho(ARM)); put(x, `out/orcad/${px}`, macho(X86)); }
            // One in-tree link in both trees, same target: a same line, not a skip.
            for (const root of [a, x]) symlinkSync('build/Release/pty.node', join(root, 'out/orcad/node_modules/node-pty/pty.node'));
            return [a, x];
        };
        const relink = (root, rel, target) => { rmSync(join(root, rel), { force: true }); symlinkSync(target, join(root, rel)); };
        const [ca, cx] = make('control');
        const control = macosMergePlan({ armDir: ca, x64Dir: cx, tables });
        if (control.fails.length || control.pairs.length !== pairs.length || control.inPlace.length !== 1 || control.identical.length !== 2 || control.links.length !== 1) {
            console.error(`${NAME} self-test: FAIL -- the unplanted trees are not green with ${pairs.length} pair(s), 1 in-place, 2 identical and 1 link: ${JSON.stringify(control)}`);
            return 1;
        }
        console.log(`  ok control -> green: ${pairs.length} arch-named pair(s) from ${from} (${pairs.map(([a]) => a).join(', ')}), 1 in-place, 2 identical, 1 agreeing link`);
        const plants = [
            ['unpaired arch-named file', () => { const [a, x] = make('unpaired'); rmSync(join(x, 'out/orcad', pairs[0][1])); return macosMergePlan({ armDir: a, x64Dir: x, tables }); }, `has no partner out/orcad/${pairs[0][1]}`],
            ['differing non-native file', () => { const [a, x] = make('differ'); put(x, 'out/web/web-index.html', '<!doctype html><!-- x64 -->\n'); return macosMergePlan({ armDir: a, x64Dir: x, tables }); }, 'out/web/web-index.html differs'],
            ['file in one tree only', () => { const [a, x] = make('onlyone'); put(a, 'out/web/extra.js', ''); return macosMergePlan({ armDir: a, x64Dir: x, tables }); }, 'out/web/extra.js is only in the arm64 tree'],
            ['symlink in the x64 tree only', () => { const [a, x] = make('linkx'); symlinkSync('web-index.html', join(x, 'out/web/alias.html')); return macosMergePlan({ armDir: a, x64Dir: x, tables }); }, 'symlink out/web/alias.html is only in the x64 tree'],
            ['symlink targets differ', () => { const [a, x] = make('linkdiff'); relink(x, 'out/orcad/node_modules/node-pty/pty.node', 'build/Debug/pty.node'); return macosMergePlan({ armDir: a, x64Dir: x, tables }); }, 'points at build/Release/pty.node in the arm64 tree and at build/Debug/pty.node'],
            ['symlink pointing outside the packaged tree', () => { const [a, x] = make('linkout'); for (const r of [a, x]) relink(r, 'out/orcad/node_modules/node-pty/pty.node', '../../../../BUILD_ROOT'); return macosMergePlan({ armDir: a, x64Dir: x, tables }); }, 'points outside the packaged tree'],
            ['absolute symlink', () => { const [a, x] = make('linkabs'); for (const r of [a, x]) relink(r, 'out/orcad/node_modules/node-pty/pty.node', '/usr/lib/pty.node'); return macosMergePlan({ armDir: a, x64Dir: x, tables }); }, 'points outside the packaged tree (/usr/lib/pty.node)'],
            ['zero-pair table', () => macosMergePlan({ armDir: ca, x64Dir: cx, tables: { ...tables, ripgrepArtifacts: ['ripgrep/linux-x64/rg'], agentBrowserName: () => 'agent-browser' } }), 'source moved'],
        ];
        let failed = 0;
        for (const [name, run, naming] of plants) {
            const r = run();
            const text = r.fails.join('\n');
            if (!r.fails.length) { console.error(`  FAIL ${name} -> stayed green`); failed++; }
            else if (!text.includes(naming)) { console.error(`  FAIL ${name} -> red, but not naming '${naming}': ${text}`); failed++; }
            else console.log(`  ok ${name} -> red, naming '${naming}'`);
        }
        // Review point 9: the tables are read as text. A source with a top-level side effect (it writes a file when
        // run) must yield the same tables and leave no file; and the same source imported, as the old loader did,
        // must write it, which proves the plant can fire. Both function shapes Orca and the fixtures use are read.
        const se = join(tmp, 'side-effect-src');
        const ran = join(tmp, 'side-effect-ran');
        mkdirSync(join(se, 'src', 'shared'), { recursive: true });
        const effect = `import { writeFileSync } from 'node:fs'\nwriteFileSync(${JSON.stringify(ran)}, 'ran')\n`;
        writeFileSync(join(se, 'src', 'shared', 'orcad-artifacts.ts'), `${effect}${MARKER_CONSTANTS.map((c, i) => `export const ${c} = '.se-${i}'`).join('\n')}\nexport const ORCAD_RIPGREP_ARTIFACTS = [\n  'ripgrep/darwin-x64/rg',\n  'ripgrep/darwin-arm64/rg'\n]\n`);
        writeFileSync(join(se, 'src', 'shared', 'orcad-agent-browser-name.ts'), `${effect}export function orcadAgentBrowserNativeName(\n  platformName: NodeJS.Platform,\n  architecture: string,\n  linuxLibc: 'glibc' | 'musl' = 'glibc'\n): string {\n  const ext = platformName === 'win32' ? '.exe' : ''\n  const platformToken =\n    platformName === 'linux' && linuxLibc === 'musl' ? 'linux-musl' : platformName\n  return \`agent-browser-\${platformToken}-\${architecture}\${ext}\`\n}\n`);
        writeFileSync(join(se, 'package.json'), '{ "type": "module" }\n');
        const seTables = await orcaArtifactTables(se);
        const seGot = `${seTables.markerNames.join(',')} | ${seTables.ripgrepArtifacts.join(',')} | ${seTables.agentBrowserName('darwin', 'x64')} | ${seTables.agentBrowserName('win32', 'arm64')}`;
        const seWant = '.se-0,.se-1,.se-2,.se-3 | ripgrep/darwin-x64/rg,ripgrep/darwin-arm64/rg | agent-browser-darwin-x64 | agent-browser-win32-arm64.exe';
        if (seGot !== seWant) { console.error(`  FAIL text parse -> got '${seGot}', want '${seWant}'`); failed++; }
        else console.log('  ok text parse of a multi-line source -> the same tables a run would give');
        if (existsSync(ran)) { console.error('  FAIL reading the tables ran the pinned source (its side effect wrote a file)'); failed++; }
        else console.log('  ok reading the tables ran nothing (the planted side effect did not fire)');
        const ts = join(se, 'src', 'shared', 'orcad-artifacts.ts');
        const asJs = join(se, 'probe.mjs');
        writeFileSync(asJs, readFileSync(ts, 'utf8'));
        await import(pathToFileURL(asJs).href);
        if (!existsSync(ran)) { console.error('  FAIL plant: importing the source did not fire its side effect, so the control above proves nothing'); failed++; }
        else console.log('  ok plant: the old loader (import) runs the side effect -> red, a file was written');
        if (failed) { console.error(`${NAME} self-test: FAIL -- ${failed} of ${plants.length + 3} case(s) did not behave`); return 1; }
        console.log(`${NAME} self-test: PASS -- ${plants.length} planted faults each went red naming the drift; the tables are read as text and a planted side effect did not run`);
        return 0;
    } finally {
        rmSync(tmp, { recursive: true, force: true });
    }
}

const isEntryPoint = (() => {
    try { return realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; }
})();
if (isEntryPoint) {
    const [cmd, ...rest] = process.argv.slice(2);
    if (cmd === '--self-test' && rest.length === 0) process.exit(await selfTest());
    if (cmd === 'macos-merge-plan' && rest.length === 3) {
        const [armDir, x64Dir, orcaSrc] = rest;
        let plan;
        try {
            plan = macosMergePlan({ armDir, x64Dir, tables: await orcaArtifactTables(orcaSrc) });
        } catch (err) {
            plan = { fails: [err.message] };
        }
        for (const l of planLines(plan)) console.log(l);
        process.exit(plan.fails.length ? 1 : 0);
    }
    console.error(`orca-artifacts: unknown arguments '${process.argv.slice(2).join(' ')}' (usage: node scripts/lib/orca-artifacts.mjs macos-merge-plan ARM X64 ORCA_SRC | --self-test)`);
    console.error('  Next step: run node scripts/lib/orca-artifacts.mjs --self-test');
    process.exit(2);
}
