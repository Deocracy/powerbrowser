/**
 * Phase 64 (P64-06, P64-07, P64-34; research A6; interfaces C5, C6): serves the
 * Orca pane bundle on the Theia document's own origin and hands the pairing
 * offer to the authenticated frontend.
 *
 * Both inputs are files in PowerBrowser's bridge folder, whose path comes from
 * POWERBROWSER_ENV.POWERBROWSER_ORCA_BRIDGE_DIR (captured and scrubbed by
 * token-gate's powerbrowser-env.ts), never from process.env. Another local user
 * or process must not be able to supply either file, so the folder must be
 * owned by this user with no group or other bit and each file must be a
 * private regular file (on win32 the folder sits under LOCALAPPDATA with the
 * user's ACL and only the file types are checked, 63-06).
 *
 * The bundle route is registered in configure(app), which BackendApplication
 * runs after token-gate's front-inserted check, so it is gated for free; a
 * request resolves only to a regular file inside the bundle directory's
 * realpath (T-64-06). The offer travels only over Theia's authenticated
 * JSON-RPC socket and is never logged (T-64-08).
 *
 * Phase 67 (RUN-07, P67-09): handOff lstats the offer file before any read and
 * reads it only after offerFileVerdict (a regular file, own uid, no group or
 * other bit), through a no-follow open whose fstat must match the lstat; it
 * returns the offer only after decodeOffer and offerEndpointVerdict accept it.
 * A refusal is { refused: <one reason code> }, with no path, mode or content;
 * the log line names the code only. undefined keeps its meaning: the files are
 * not written yet.
 */
import * as fs from 'fs';
import * as path from 'path';
import type * as express from '@theia/core/shared/express';
import { ContainerModule, injectable } from '@theia/core/shared/inversify';
import { ConnectionHandler, JsonRpcConnectionHandler } from '@theia/core/lib/common';
import { BackendApplicationContribution } from '@theia/core/lib/node';
import { POWERBROWSER_ENV } from '@powerbrowser/token-gate/lib/node/powerbrowser-env';
import {
    ORCA_PANES_ROUTE_PREFIX, ORCA_PANES_SERVICE_PATH, OrcaPanesService, PANES_DIR_FILE, WEB_PAIRING_FILE
} from '../common/orca-panes-protocol';
import { OfferHandOff, OfferRefusalReason, decodeOffer, offerEndpointVerdict, offerFileVerdict, offerPortOf } from './offer-file-policy';

const LOG_PREFIX = '[@powerbrowser/orca-panes]';

export interface StatLike {
    isDirectory(): boolean;
    isFile(): boolean;
    mode: number;
    uid: number;
}

export interface Verdict {
    ok: boolean;
    reason?: string;
}

const POSIX_PLATFORMS = ['linux', 'darwin'];

/** The bridge folder: a directory owned by uid with no group or other bit (POSIX); a directory (win32). */
export function privateDirVerdict(stat: StatLike, uid: number, platform: string): Verdict {
    if (!stat.isDirectory()) {
        return { ok: false, reason: 'the bridge folder is not a directory' };
    }
    if (POSIX_PLATFORMS.includes(platform)) {
        if (stat.uid !== uid) {
            return { ok: false, reason: 'the bridge folder is owned by another user' };
        }
        if ((stat.mode & 0o077) !== 0) {
            return { ok: false, reason: 'the bridge folder grants group or other access' };
        }
    }
    return { ok: true };
}

/** A bridge file: a regular file (never a link), mode 0600, owned by uid (POSIX); a regular file (win32). */
export function privateFileVerdict(stat: StatLike, uid: number, platform: string): Verdict {
    if (!stat.isFile()) {
        return { ok: false, reason: 'a bridge file is not a regular file' };
    }
    if (POSIX_PLATFORMS.includes(platform)) {
        if (stat.uid !== uid) {
            return { ok: false, reason: 'a bridge file is owned by another user' };
        }
        if ((stat.mode & 0o777) !== 0o600) {
            return { ok: false, reason: 'a bridge file is not mode 0600' };
        }
    }
    return { ok: true };
}

/**
 * Joins a request path onto the bundle directory's realpath, or undefined for
 * an empty, absolute, backslash, NUL or '..'-segment path. The caller still
 * realpaths the result and requires it to stay under rootReal and be a
 * regular file (a link inside the directory may point out of it).
 */
export function resolveInside(rootReal: string, requestPath: string): string | undefined {
    if (!requestPath || requestPath.startsWith('/') || path.isAbsolute(requestPath)
        || requestPath.includes('\\') || requestPath.includes('\0')
        || requestPath.split('/').includes('..')) {
        return undefined;
    }
    return path.join(rootReal, requestPath);
}

const currentUid = (): number => (typeof process.getuid === 'function' ? process.getuid() : -1);

/** Reads a file already judged by its lstat: no-follow open (POSIX), and the opened file must be that same inode. */
async function readNoFollow(full: string, judged: fs.Stats): Promise<string> {
    const handle = await fs.promises.open(full, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
    try {
        const opened = await handle.stat();
        if (!opened.isFile() || opened.ino !== judged.ino || opened.dev !== judged.dev) {
            throw new Error('changed');
        }
        return await handle.readFile('utf8');
    } finally {
        await handle.close();
    }
}

/** Reads one bridge file after both checks; throws an Error whose message names the failed check, never a value. */
function readBridgeFile(dir: string, file: string): string {
    const dirVerdict = privateDirVerdict(fs.lstatSync(dir), currentUid(), process.platform);
    if (!dirVerdict.ok) {
        throw new Error(dirVerdict.reason);
    }
    const full = path.join(dir, file);
    const fileVerdict = privateFileVerdict(fs.lstatSync(full), currentUid(), process.platform);
    if (!fileVerdict.ok) {
        throw new Error(`${fileVerdict.reason} (${file})`);
    }
    return fs.readFileSync(full, 'utf8').replace(/\r?\n$/, '');
}

function failureOf(err: unknown, file: string): string {
    const code = (err as NodeJS.ErrnoException).code;
    return code === 'ENOENT' ? `${file} is not written yet` : code ? `${file} is not readable (${code})` : (err as Error).message;
}

@injectable()
export class OrcaPanesServiceImpl implements BackendApplicationContribution {

    protected readonly bridgeDir = POWERBROWSER_ENV.POWERBROWSER_ORCA_BRIDGE_DIR;
    protected readonly logged = new Set<string>();
    protected bundleRoot: { mtimeMs: number; real: string } | undefined;

    /** One log line per distinct failure, never a value. */
    protected logOnce(line: string): void {
        if (!this.logged.has(line)) {
            this.logged.add(line);
            console.info(`${LOG_PREFIX} ${line}`);
        }
    }

    /** OrcaPanesService.handOff (64 C6) with P67-09's refusal; not declared through OrcaPanesService, whose type has no refusal. */
    async handOff(): Promise<OfferHandOff> {
        if (!this.bridgeDir) {
            this.logOnce('no bridge folder; Orca panes are not offered');
            return undefined;
        }
        try {
            const dirVerdict = privateDirVerdict(await fs.promises.lstat(this.bridgeDir), currentUid(), process.platform);
            if (!dirVerdict.ok) {
                this.logOnce(`no pairing hand-off: ${dirVerdict.reason}`);
                return undefined;
            }
        } catch (err) {
            this.logOnce(`no pairing hand-off: the bridge folder is not readable (${(err as NodeJS.ErrnoException).code ?? 'error'})`);
            return undefined;
        }
        const full = path.join(this.bridgeDir, WEB_PAIRING_FILE);
        let stat: fs.Stats | null;
        try {
            stat = await fs.promises.lstat(full);
        } catch (err) {
            if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
                return undefined; // not written yet (orcad is starting, or stopped and removed it)
            }
            return this.refuse('offer-unreadable');
        }
        const verdict = offerFileVerdict({ stat, uid: currentUid(), platform: process.platform });
        if (!verdict.ok) {
            return this.refuse(verdict.reason);
        }
        let text: string;
        try {
            text = await readNoFollow(full, stat);
        } catch {
            return this.refuse('offer-unreadable');
        }
        const pairing = text.replace(/\r?\n$/, '');
        const offer = decodeOffer(pairing);
        if (!offer) {
            return this.refuse('offer-unreadable');
        }
        const endpoint = offerEndpointVerdict(offer, offerPortOf(pairing));
        if (!endpoint.ok) {
            return this.refuse(endpoint.reason);
        }
        return { pairing };
    }

    /** One reason code, logged once and returned; never a path, mode, owner or content. */
    protected refuse(reason: OfferRefusalReason): { refused: OfferRefusalReason } {
        this.logOnce(`the pairing hand-off was refused: ${reason}`);
        return { refused: reason };
    }

    /** The bundle directory's realpath, re-read when orca-panes-dir changes (every orcad start rewrites it). */
    protected bundleRootReal(): string | undefined {
        if (!this.bridgeDir) {
            return undefined;
        }
        try {
            const mtimeMs = fs.lstatSync(path.join(this.bridgeDir, PANES_DIR_FILE)).mtimeMs;
            if (this.bundleRoot?.mtimeMs !== mtimeMs) {
                this.bundleRoot = { mtimeMs, real: fs.realpathSync(readBridgeFile(this.bridgeDir, PANES_DIR_FILE)) };
            }
            return this.bundleRoot.real;
        } catch (err) {
            this.bundleRoot = undefined;
            this.logOnce(`the pane bundle is not served: ${failureOf(err, PANES_DIR_FILE)}`);
            return undefined;
        }
    }

    configure(app: express.Application): void {
        // Gated for free: configure() runs after token-gate's front-inserted check (P64-06, T-64-07).
        app.use(ORCA_PANES_ROUTE_PREFIX, (req, res, next) => {
            if (req.method !== 'GET' && req.method !== 'HEAD') {
                next();
                return;
            }
            const root = this.bundleRootReal();
            let rel: string;
            try {
                rel = decodeURIComponent(req.path.replace(/^\//, ''));
            } catch {
                rel = '';
            }
            const joined = root ? resolveInside(root, rel) : undefined;
            let real: string | undefined;
            try {
                real = joined ? fs.realpathSync(joined) : undefined;
            } catch {
                real = undefined;
            }
            if (!root || !real || !real.startsWith(root + path.sep) || !fs.statSync(real).isFile()) {
                res.sendStatus(404);
                return;
            }
            // root makes send's dotfile rule apply to the request part only, not to an install path such as ~/.local.
            res.sendFile(path.relative(root, real), { root });
        });
    }
}

export default new ContainerModule(bind => {
    bind(OrcaPanesServiceImpl).toSelf().inSingletonScope();
    bind(BackendApplicationContribution).toService(OrcaPanesServiceImpl);
    bind(ConnectionHandler).toDynamicValue(ctx =>
        new JsonRpcConnectionHandler<OrcaPanesService>(ORCA_PANES_SERVICE_PATH, () => ctx.container.get(OrcaPanesServiceImpl))
    ).inSingletonScope();
});
