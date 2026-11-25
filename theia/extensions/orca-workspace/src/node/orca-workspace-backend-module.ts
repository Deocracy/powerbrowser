/**
 * Phase 65 (TAB-05; P65-03, CA-06; T-65-04..T-65-06): the backend half of the
 * read-only pb-orca-git: scheme. One JSON-RPC service at ORCA_GIT_SERVICE_PATH
 * over Theia's authenticated websocket (the tab-query-backend-module shape).
 *
 * Every input is validated here, whatever the frontend checked: the root is an
 * absolute, realpath-stable repository toplevel; the path and rev follow the
 * shared grammar. The read is git cat-file blob through spawn (no shell, no
 * textconv or filter, '--' before the spec, fsmonitor off), with every GIT_*
 * name removed from the environment, no fetch and no prompt (gitReadEnv), a
 * 50 MB cap and a 10 s bound that kills git's whole process group. A path
 * absent at its side reads as 'missing' (an empty side), not as a failure. A
 * refusal or failure logs one line naming the reason, never the blob or the spec.
 */
import { ChildProcess, spawn } from 'child_process';
import { promises as fs } from 'fs';
import { ContainerModule, injectable } from '@theia/core/shared/inversify';
import { ConnectionHandler, JsonRpcConnectionHandler } from '@theia/core/lib/common';
import {
    ORCA_GIT_MAX_BYTES, ORCA_GIT_MISSING, ORCA_GIT_SERVICE_PATH, ORCA_GIT_TIMEOUT_MS, OrcaGitRead, OrcaGitService, RootDeps,
    catFileArgs, gitReadEnv, sideIsMissing, specRefusal, validateRoot
} from '../common/orca-git-protocol';

const LOG_PREFIX = '[@powerbrowser/orca-workspace]';
const POSIX = process.platform !== 'win32';

/** sidecar-gate-backends-02: git is its own process-group leader on POSIX, so a timeout also ends any child it started. */
function killTree(child: ChildProcess): void {
    try {
        if (POSIX && child.pid) {
            process.kill(-child.pid, 'SIGKILL');
        } else {
            child.kill('SIGKILL');
        }
    } catch { /* already gone */ }
}

/** One git run (argv array, no shell); resolves stdout bytes or a reason word. */
function runGit(args: string[]): Promise<{ out: Buffer } | { reason: string }> {
    return new Promise(resolve => {
        let settled = false;
        let failure: string | undefined;
        const chunks: Buffer[] = [];
        let size = 0;
        const child = spawn('git', args, { env: gitReadEnv(process.env), stdio: ['ignore', 'pipe', 'ignore'], detached: POSIX, windowsHide: true });
        const finish = (r: { out: Buffer } | { reason: string }) => {
            if (!settled) {
                settled = true;
                clearTimeout(timer);
                resolve(r);
            }
        };
        const stop = (reason: string) => {
            failure ??= reason;
            killTree(child);
        };
        const timer = setTimeout(() => stop('timeout'), ORCA_GIT_TIMEOUT_MS);
        child.stdout!.on('data', (chunk: Buffer) => {
            size += chunk.length;
            if (size > ORCA_GIT_MAX_BYTES) {
                stop('too-large');
            } else if (failure === undefined) {
                chunks.push(chunk);
            }
        });
        child.on('error', () => finish({ reason: failure ?? 'git-failed' }));
        child.on('close', code => finish(failure === undefined && code === 0 ? { out: Buffer.concat(chunks) } : { reason: failure ?? 'git-failed' }));
    });
}

const ROOT_DEPS: RootDeps = {
    realpath: path => fs.realpath(path),
    toplevel: async root => {
        const r = await runGit(['-c', 'core.fsmonitor=false', '-C', root, 'rev-parse', '--show-toplevel']);
        return 'out' in r ? r.out.toString('utf8').trim() : undefined;
    },
};

@injectable()
export class OrcaGitServiceImpl implements OrcaGitService {

    async readBlob(root: string, relativePath: string, rev: string): Promise<OrcaGitRead> {
        const refusal = specRefusal(relativePath, rev) ?? await validateRoot(root, ROOT_DEPS);
        if (refusal) {
            return this.refuse(refusal);
        }
        if (rev === '') {
            return { ok: true, text: '' };
        }
        const r = await runGit(catFileArgs(root, rev, relativePath));
        if ('out' in r) {
            return { ok: true, text: r.out.toString('utf8') };
        }
        // 65-CR-01: an added, deleted or untracked file has no blob on one side; that side is empty, not a failed diff.
        if (r.reason === 'git-failed' && await sideIsMissing(runGit, root, rev, relativePath)) {
            return { ok: false, reason: ORCA_GIT_MISSING };
        }
        return this.refuse(r.reason);
    }

    async resolveHead(root: string): Promise<string | null> {
        if (await validateRoot(root, ROOT_DEPS)) {
            return null;
        }
        const r = await runGit(['-c', 'core.fsmonitor=false', '-C', root, 'rev-parse', '--verify', '--quiet', 'HEAD^{commit}']);
        const id = 'out' in r ? r.out.toString('utf8').trim() : '';
        // Only an object id may enter a URI; anything else is treated as unborn.
        return specRefusal('x', id) === undefined && id !== '' ? id : null;
    }

    protected refuse(reason: string): OrcaGitRead {
        console.warn(`${LOG_PREFIX} a pb-orca-git read was refused: ${reason}`);
        return { ok: false, reason };
    }
}

export default new ContainerModule(bind => {
    bind(OrcaGitServiceImpl).toSelf().inSingletonScope();
    bind(ConnectionHandler).toDynamicValue(ctx =>
        new JsonRpcConnectionHandler<OrcaGitService>(ORCA_GIT_SERVICE_PATH, () => ctx.container.get(OrcaGitServiceImpl))
    ).inSingletonScope();
});
