// scripts/lib/release-objdir.mjs -- the release build's objdir name, read from
// powerbrowser/packaging/mozconfig.release (the MOZ_OBJDIR default), so the
// packager (package-linux.sh) and the release rows (built-tree.mjs) cannot
// disagree. Prints the name when run directly. POWERBROWSER_OBJDIR overrides
// the default exactly as the mozconfig's own shell expansion does.
//
// Usage:
//   node scripts/lib/release-objdir.mjs            -> objdir-release
//   node scripts/lib/release-objdir.mjs --self-test
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const RELEASE_MOZCONFIG = join(REPO_ROOT, 'powerbrowser', 'packaging', 'mozconfig.release');

// The mozconfig line this reads is exactly:
//   mk_add_options MOZ_OBJDIR=@TOPSRCDIR@/../${POWERBROWSER_OBJDIR:-<default>}
// The default is the only typed value; it lives in the mozconfig, not here.
const MOZ_OBJDIR_LINE = /^mk_add_options MOZ_OBJDIR=@TOPSRCDIR@\/\.\.\/\$\{POWERBROWSER_OBJDIR:-([^}]+)\}\s*$/m;

export function releaseObjdirName(env = process.env, mozconfigText = readFileSync(RELEASE_MOZCONFIG, 'utf8')) {
    const m = MOZ_OBJDIR_LINE.exec(mozconfigText);
    if (!m) throw new Error(`${RELEASE_MOZCONFIG} has no MOZ_OBJDIR line of the form "mk_add_options MOZ_OBJDIR=@TOPSRCDIR@/../\${POWERBROWSER_OBJDIR:-<name>}"`);
    return env.POWERBROWSER_OBJDIR || m[1];
}

function selfTest() {
    const fail = (msg) => { console.error(`release-objdir: --self-test FAIL -- ${msg}`); process.exit(1); };
    // Planted mozconfig text with a default that is not the real one: the parser
    // must return the planted default, so no name is hard-coded anywhere.
    const planted = 'mk_add_options MOZ_OBJDIR=@TOPSRCDIR@/../${POWERBROWSER_OBJDIR:-planted-objdir}\n';
    if (releaseObjdirName({}, planted) !== 'planted-objdir') fail('the default is not read from the mozconfig line');
    if (releaseObjdirName({ POWERBROWSER_OBJDIR: 'override-objdir' }, planted) !== 'override-objdir') fail('POWERBROWSER_OBJDIR does not override the default');
    if (releaseObjdirName({ POWERBROWSER_OBJDIR: '' }, planted) !== 'planted-objdir') fail('an empty POWERBROWSER_OBJDIR does not fall back to the default (bash :- semantics)');
    let threw = false;
    try { releaseObjdirName({}, 'ac_add_options --enable-application=browser\n'); } catch { threw = true; }
    if (!threw) fail('a mozconfig with no MOZ_OBJDIR line was accepted');
    console.log('release-objdir: --self-test PASS -- default read from the mozconfig, override and empty fallback honored, missing line red');
}

if (process.argv.includes('--self-test')) {
    selfTest();
} else if (process.argv[1] === fileURLToPath(import.meta.url)) {
    process.stdout.write(`${releaseObjdirName()}\n`);
}
