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
