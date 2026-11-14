/**
 * Phase 65 (TAB-05; P65-03, CA-06; T-65-04..T-65-06): the backend half of the
 * read-only pb-orca-git: scheme. One JSON-RPC service at ORCA_GIT_SERVICE_PATH
 * over Theia's authenticated websocket (the tab-query-backend-module shape).
 *
 * Every input is validated here, whatever the frontend checked: the root is an
 * absolute, realpath-stable repository toplevel; the path and rev follow the
 * shared grammar. The read is git cat-file blob through execFile (no shell, no
 * textconv or filter, '--' before the spec, fsmonitor off), with every GIT_*
 * name removed from the environment, a 50 MB cap and a 10 s bound. A refusal
 * or failure logs one line naming the reason, never the blob or the spec.
 */
import { execFile } from 'child_process';
import { promises as fs } from 'fs';
import { ContainerModule, injectable } from '@theia/core/shared/inversify';
import { ConnectionHandler, JsonRpcConnectionHandler } from '@theia/core/lib/common';
import {
    ORCA_GIT_MAX_BYTES, ORCA_GIT_SERVICE_PATH, ORCA_GIT_TIMEOUT_MS, OrcaGitRead, OrcaGitService, RootDeps,
    catFileArgs, specRefusal, validateRoot, withoutGitVars
} from '../common/orca-git-protocol';

const LOG_PREFIX = '[@powerbrowser/orca-workspace]';

/** One git run; resolves stdout bytes or a reason word. */
function runGit(args: string[]): Promise<{ out: Buffer } | { reason: string }> {
    return new Promise(resolve => {
        execFile('git', args, {
            env: withoutGitVars(process.env),
            encoding: 'buffer',
            maxBuffer: ORCA_GIT_MAX_BYTES,
            timeout: ORCA_GIT_TIMEOUT_MS,
            windowsHide: true,
        }, (err, stdout) => {
            if (!err) {
                resolve({ out: stdout });
                return;
            }
            const e = err as NodeJS.ErrnoException & { killed?: boolean };
            resolve({ reason: e.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER' ? 'too-large' : e.killed ? 'timeout' : 'git-failed' });
        });
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
        return 'out' in r ? { ok: true, text: r.out.toString('utf8') } : this.refuse(r.reason);
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
