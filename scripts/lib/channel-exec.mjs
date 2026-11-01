// scripts/lib/channel-exec.mjs
//
// Executes the two policies merges and the Flatpak build commands on fixture bytes (Phase 56 review fixes
// CR-03 and WR-11). The text rows only matched strings; a merge that deleted a sibling, or a build command
// that copied the wrong path, passed them. These helpers run the real command text from the tracked files
// in a scratch directory under os.tmpdir() and return what it produced, so a row compares results.
//
// Requires bash, tar, jq and python3 on PATH (every hosted runner and the Nix dev shells carry them). A missing
// tool is reported as a failure, never a pass. Writes only under a fresh scratch directory that is removed.

import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync, lstatSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

// The jq program the derivation applies to the repacked policies copy: jq '<program>' "$policies".
export function nixJqProgram(nixText) {
    const m = /jq\s+'([^']+)'\s+"\$policies"/.exec(nixText ?? '');
    return m ? m[1] : null;
}

// The directory the derivation expects the tarball to unpack to: test -d $out/lib/<top>.
export function nixTarballTop(nixText) {
    const m = /test -d \$out\/lib\/([A-Za-z0-9._-]+)/.exec(nixText ?? '');
    return m ? m[1] : null;
}

export function runJq(program, jsonText) {
    try {
        const out = execFileSync('jq', [program], { input: jsonText, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
        return { ok: true, value: JSON.parse(out) };
    } catch (e) {
        return { ok: false, error: String(e.stderr || e.message).split('\n')[0] };
    }
}

function scratch() {
    return mkdtempSync(join(tmpdir(), 'pb-channel-exec-'));
}

// Rewrite the absolute /app prefix to the scratch prefix, token by token, so no command touches the real /app.
function rebase(command, prefix) {
    return command.replace(/(^|[\s'"=])\/app(?=[\/\s'"]|$)/g, (_m, lead) => `${lead}${prefix}`);
}

/**
 * Run a Flatpak manifest's module build-commands the way flatpak-builder would, on a fixture tarball.
 *
 *   manifest        the parsed manifest (one module with an archive source and file sources)
 *   top             the tarball's single top-level directory name
 *   tarballFiles    { relative path under top: text } the fixture tarball content
 *   fileSources     { source path: text } the content of each `file` source (copied into the build dir)
 *
 * The archive is really packed with tar and unpacked with --strip-components set to the source's
 * strip-components (flatpak-builder defaults it to 1 when absent). Returns { ok, error, app, cleanup }.
 */
export function simulateFlatpakBuild({ manifest, top, tarballFiles, fileSources }) {
    const root = scratch();
    const cleanup = () => rmSync(root, { recursive: true, force: true });
    try {
        const pkg = join(root, 'pkg');
        for (const [rel, text] of Object.entries(tarballFiles)) {
            const file = join(pkg, top, rel);
            mkdirSync(dirname(file), { recursive: true });
            writeFileSync(file, text);
            if (rel === top) chmodSync(file, 0o755);
        }
        const tarball = join(root, 'fixture.tar');
        execFileSync('tar', ['-C', pkg, '-cf', tarball, top]);

        const module = (manifest.modules ?? [])[0];
        const archive = (module?.sources ?? []).find(s => s.type === 'archive');
        if (!archive) return { ok: false, error: 'the module has no archive source', cleanup };
        const strip = Number.isInteger(archive['strip-components']) ? archive['strip-components'] : 1;

        const build = join(root, 'build');
        mkdirSync(build, { recursive: true });
        execFileSync('tar', ['-C', build, `--strip-components=${strip}`, '-xf', tarball]);
        for (const src of module.sources.filter(s => s.type === 'file')) {
            if (typeof src.path !== 'string' || !/^[A-Za-z0-9._-]+$/.test(src.path)) return { ok: false, error: `the file source path ${JSON.stringify(src.path)} is not a plain file name`, cleanup };
            const text = fileSources[src.path];
            if (text === undefined) return { ok: false, error: `no fixture content for the file source ${src.path}`, cleanup };
            writeFileSync(join(build, src.path), text);
        }

        const app = join(root, 'app');
        for (const command of module['build-commands'] ?? []) {
            try {
                // Manifest text runs here, so give it nothing to inherit: no tokens, no HOME, a fixed PATH.
                execFileSync('bash', ['--noprofile', '--norc', '-ec', rebase(command, app)], { cwd: build, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', env: { PATH: process.env.PATH, LC_ALL: 'C' } });
            } catch (e) {
                const detail = String(e.stderr || e.message).trim().split('\n').slice(-1)[0];
                return { ok: false, error: `the build command ${JSON.stringify(command.slice(0, 70))} failed (${detail})`, cleanup };
            }
        }
        return { ok: true, app, cleanup };
    } catch (e) {
        return { ok: false, error: String(e.message).split('\n')[0], cleanup };
    }
}

export function readText(path) {
    return readFileSync(path, 'utf8');
}

export function isRegularFile(path) {
    try {
        return statSync(path).isFile();
    } catch {
        return false;
    }
}

export function resolvesTo(link, target) {
    try {
        return lstatSync(link).isSymbolicLink() && realpathSync(link) === realpathSync(target);
    } catch {
        return false;
    }
}
