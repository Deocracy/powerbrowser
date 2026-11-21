/**
 * Phase 65 (TAB-05; P65-03, CA-06; interfaces N-5): the read-only pb-orca-git:
 * content scheme. A pb-orca-git URI is pb-orca-git:<absolute file path>?<rev>,
 * rev a 40- or 64-hex lower-case object id, an index stage :0 to :3, or empty
 * (an empty side). It lives inside diff: and merge-editor: URIs only; it is
 * never a tab address and carries no ref name, secret or token.
 *
 * This is a trust boundary: a URI from a link or a restored layout becomes git
 * arguments. Everything here is pure (no Node or DOM import), so the frontend,
 * the backend and scripts/verify-orca-editor-routes.mjs share one grammar.
 */

export const ORCA_GIT_SCHEME = 'pb-orca-git';
export const ORCA_GIT_SERVICE_PATH = '/services/powerbrowser-orca-git';
/** T-65-06: the largest blob read, and the read's time bound. */
export const ORCA_GIT_MAX_BYTES = 50 * 1024 * 1024;
export const ORCA_GIT_TIMEOUT_MS = 10_000;

const OBJECT_ID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const STAGE = /^:[0-3]$/;

/** Why a rev and repository-relative path are refused, or undefined when they are a valid spec. */
export function specRefusal(relativePath: unknown, rev: unknown): string | undefined {
    if (typeof rev !== 'string' || !(rev === '' || OBJECT_ID.test(rev) || STAGE.test(rev))) {
        return 'rev';
    }
    if (typeof relativePath !== 'string' || relativePath.length === 0) {
        return 'path-empty';
    }
    // './' and '../' inside an object name resolve against git's working directory; '-' would read as an option.
    if (relativePath.startsWith('/') || relativePath.startsWith('-') || relativePath.includes('\\') || /[\0\n\r]/.test(relativePath)) {
        return 'path-shape';
    }
    if (relativePath.split('/').some(segment => segment === '' || segment === '.' || segment === '..')) {
        return 'path-segment';
    }
    return undefined;
}

/** T-65-05: the argv for one blob read. Throws on a refused spec and on the empty side (nothing is read for it). */
export function catFileArgs(root: string, rev: string, relativePath: string): string[] {
    const refusal = specRefusal(relativePath, rev);
    if (refusal || rev === '') {
        throw new Error(`refused pb-orca-git spec: ${refusal ?? 'empty-side'}`);
    }
    return ['-c', 'core.fsmonitor=false', '-C', root, 'cat-file', 'blob', '--', `${rev}:${relativePath}`];
}

/** A copy of env without any GIT_* name (any case): an inherited GIT_DIR would redirect the read. */
export function withoutGitVars<T extends Record<string, string | undefined>>(env: T): Record<string, string | undefined> {
    return Object.fromEntries(Object.entries(env).filter(([name]) => !/^GIT_/i.test(name)));
}

/**
 * sidecar-gate-backends-02: the environment of every pb-orca-git git run. No GIT_* name is inherited; then a read
 * never fetches (a partial clone's lazy fetch would run the repository's configured upload-pack, ssh command and
 * credential helpers), never prompts and never starts an askpass dialog. Every transport is set to never through the
 * environment form of `-c`: command-line scope outranks the repository's own config, so a hostile
 * protocol.<name>.allow=always in .git/config (git reads it before protocol.allow) cannot re-open one; it reaches the
 * fetch child git would spawn, and it still holds on a git older than 2.44, which ignores GIT_NO_LAZY_FETCH. The argv
 * stays as catFileArgs builds it.
 */
export const ORCA_GIT_NEVER_PROTOCOLS: readonly string[] = Object.freeze(['file', 'ext', 'ssh', 'http', 'https', 'git']);

export function gitReadEnv<T extends Record<string, string | undefined>>(env: T): Record<string, string | undefined> {
    const keys = ['protocol.allow', ...ORCA_GIT_NEVER_PROTOCOLS.map(p => `protocol.${p}.allow`)];
    const config: Record<string, string> = { GIT_CONFIG_COUNT: String(keys.length) };
    keys.forEach((key, i) => {
        config[`GIT_CONFIG_KEY_${i}`] = key;
        config[`GIT_CONFIG_VALUE_${i}`] = 'never';
    });
    return {
        ...withoutGitVars(env),
        GIT_NO_LAZY_FETCH: '1',
        GIT_TERMINAL_PROMPT: '0',
        GIT_ASKPASS: '',
        SSH_ASKPASS: '',
        SSH_ASKPASS_REQUIRE: 'never',
        ...config,
    };
}

/** 65-CR-01: the reason a read reports when the path is absent at an existing rev or index stage (an added, deleted or untracked file). */
export const ORCA_GIT_MISSING = 'missing';

/** git rev-parse of one spec: resolves only when it names an object, and reads no blob. Throws on an option-shaped spec or a NUL. */
export function resolveArgs(root: string, spec: string): string[] {
    if (spec.startsWith('-') || /[\0\n\r]/.test(spec)) {
        throw new Error('refused pb-orca-git spec: rev-parse');
    }
    return ['-c', 'core.fsmonitor=false', '-C', root, 'rev-parse', '--verify', '--quiet', spec];
}

/**
 * 65-CR-01: after a blob read failed, whether the path is absent at its side (that side is then empty) rather than the
 * read having failed. Absent means the path names nothing at the rev while the rev itself exists; an index stage
 * always exists. A path present in the tree whose blob cannot be read (a partial clone with no fetch) stays a failure.
 * resolves(args) runs git and resolves whether it exited 0.
 */
export async function sideIsMissing(resolves: (args: string[]) => Promise<boolean>, root: string, rev: string, relativePath: string): Promise<boolean> {
    if (specRefusal(relativePath, rev) || rev === '') {
        return false;
    }
    if (await resolves(resolveArgs(root, `${rev}:${relativePath}`))) {
        return false;
    }
    return STAGE.test(rev) || await resolves(resolveArgs(root, `${rev}^{object}`));
}

export interface RootDeps {
    realpath(path: string): Promise<string>;
    /** git -C <root> rev-parse --show-toplevel, trimmed; undefined when git fails. */
    toplevel(root: string): Promise<string | undefined>;
}

/** Why a root is refused, or undefined: an absolute path, realpath-equal to itself and equal to its repository's toplevel. */
export async function validateRoot(root: unknown, deps: RootDeps): Promise<string | undefined> {
    if (typeof root !== 'string' || !root.startsWith('/') || /[\0\n\r]/.test(root)) {
        return 'root-shape';
    }
    const real = await deps.realpath(root).catch(() => undefined);
    if (real !== root) {
        return 'root-realpath';
    }
    return await deps.toplevel(root) === root ? undefined : 'root-toplevel';
}

/** The pb-orca-git URI of an absolute path at a rev, path segments and the rev escaped. */
export function orcaGitUri(absolutePath: string, rev: string): string {
    return `${ORCA_GIT_SCHEME}:${absolutePath.split('/').map(encodeURIComponent).join('/')}?${encodeURIComponent(rev)}`;
}

export type OrcaGitRead = { ok: true; text: string } | { ok: false; reason: string };

export const OrcaGitService = Symbol('OrcaGitService');
export interface OrcaGitService {
    /** One blob as UTF-8 text; ok false with a reason word on a refusal or a failed read. Never logs the blob. */
    readBlob(root: string, relativePath: string, rev: string): Promise<OrcaGitRead>;
    /** HEAD as an object id, or null when unborn or unreadable, so no ref name enters a URI. */
    resolveHead(root: string): Promise<string | null>;
}
