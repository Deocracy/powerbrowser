/**
 * Phase 63 (EXT-02, P63-15 as amended by P63-26; D-31, P63-35): writes the
 * per-profile claude launcher into PowerBrowser's bridge directory and tells
 * the frontend its path over RPC.
 *
 * The bridge directory comes from POWERBROWSER_ENV.POWERBROWSER_ORCA_BRIDGE_DIR
 * (captured and scrubbed at module load by token-gate's powerbrowser-env.ts),
 * never from process.env. Unset means inert: no launcher, and
 * getClaudeWrapperPath() resolves undefined. No environment value is logged.
 */
import * as fs from 'fs';
import { ContainerModule, injectable } from '@theia/core/shared/inversify';
import { ConnectionHandler, JsonRpcConnectionHandler } from '@theia/core/lib/common';
import { BackendApplicationContribution } from '@theia/core/lib/node';
import { POWERBROWSER_ENV } from '@powerbrowser/token-gate/lib/node/powerbrowser-env';
import { ORCA_AGENTS_SERVICE_PATH, OrcaAgentsService } from '../common/orca-agents-protocol';
import { writeLauncher } from './claude-wrapper-launcher';

const LOG_PREFIX = '[@powerbrowser/orca-agents]';
const POSIX = process.platform === 'linux' || process.platform === 'darwin';

@injectable()
export class OrcaAgentsBackend implements BackendApplicationContribution, OrcaAgentsService {
    protected launcherPath: string | undefined;

    onStart(): void {
        const dir = POWERBROWSER_ENV.POWERBROWSER_ORCA_BRIDGE_DIR;
        if (!dir) {
            console.info(`${LOG_PREFIX} no bridge directory; the claude wrapper is not offered`);
            return;
        }
        try {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
            }
            const st = fs.lstatSync(dir);
            if (!st.isDirectory()) {
                throw new Error('the bridge directory is not a directory');
            }
            // win32: the directory sits under LOCALAPPDATA and POSIX mode checks do not apply (P63-30).
            if (POSIX && (st.uid !== process.getuid!() || (st.mode & 0o077) !== 0)) {
                throw new Error('the bridge directory is owned by another user or grants group or other access');
            }
            const wrapper = require.resolve('@powerbrowser/orca-agents/bin/claude-wrapper.mjs');
            if (!fs.existsSync(wrapper)) {
                throw new Error('the claude wrapper script is missing');
            }
            this.launcherPath = writeLauncher(dir, process.execPath, wrapper);
        } catch (err) {
            console.warn(`${LOG_PREFIX} the claude wrapper is not offered: ${(err as Error).message}`);
            this.launcherPath = undefined;
        }
    }

    async getClaudeWrapperPath(): Promise<string | undefined> {
        return this.launcherPath;
    }
}

export default new ContainerModule(bind => {
    bind(OrcaAgentsBackend).toSelf().inSingletonScope();
    bind(BackendApplicationContribution).toService(OrcaAgentsBackend);
    bind(ConnectionHandler).toDynamicValue(ctx =>
        new JsonRpcConnectionHandler(ORCA_AGENTS_SERVICE_PATH, () => ctx.container.get(OrcaAgentsBackend))
    ).inSingletonScope();
});
