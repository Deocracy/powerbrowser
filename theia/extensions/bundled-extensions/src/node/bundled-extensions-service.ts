// 68-11: the explicit reinstall of a pre-installed extension the user removed. It reuses the
// seed's shipped folders and copy, then hands the profile's deployment folder to Theia's own
// PluginServer.install as a user entry, the same local-dir entry Theia deploys at every start.
// Nothing calls it except the frontend command, so an uninstall is never undone automatically.
import * as fs from 'fs';
import * as path from 'path';
import { inject, injectable, named } from '@theia/core/shared/inversify';
import { ILogger } from '@theia/core/lib/common/logger';
import { FileUri } from '@theia/core/lib/common/file-uri';
import { SettingService } from '@theia/core/lib/node/setting-service';
import { PluginServer, PluginType } from '@theia/plugin-ext/lib/common/plugin-protocol';
import { PluginVSCodeEnvironment } from '@theia/plugin-ext-vscode/lib/common/plugin-vscode-environment';
import { BundledExtensionsService, ReinstallResult } from '../common/bundled-extensions-protocol';
import { BundledExtensionsSeed, SEED_RECORD_KEY, absentBundledExtensions, parseRecord, reinstallBundledExtension } from './bundled-extensions-seed';

@injectable()
export class BundledExtensionsServiceImpl implements BundledExtensionsService {

    @inject(ILogger) @named('powerbrowser:bundled-extensions')
    protected readonly logger: ILogger;

    @inject(SettingService)
    protected readonly settings: SettingService;

    @inject(PluginVSCodeEnvironment)
    protected readonly environments: PluginVSCodeEnvironment;

    @inject(BundledExtensionsSeed)
    protected readonly seed: BundledExtensionsSeed;

    @inject(PluginServer)
    protected readonly pluginServer: PluginServer;

    /** Reinstalls run one at a time, so two clicks never copy the same folder twice. */
    protected queue: Promise<unknown> = Promise.resolve();

    async absent(): Promise<string[]> {
        try {
            return await absentBundledExtensions({ sources: this.seed.sources, deploymentDir: await this.deploymentDir() });
        } catch (err) {
            this.logger.error('could not list removed bundled extensions', err);
            return [];
        }
    }

    reinstall(id: string): Promise<ReinstallResult> {
        const run = this.queue.then(() => this.doReinstall(id));
        this.queue = run.catch(() => undefined);
        return run;
    }

    protected async doReinstall(id: string): Promise<ReinstallResult> {
        try {
            // id comes from the frontend: only a shipped id is ever copied (the pure rule refuses others).
            const deploymentDir = await this.deploymentDir();
            const outcome = await reinstallBundledExtension({ sources: this.seed.sources, deploymentDir, id: String(id) });
            if (outcome.result !== 'reinstalled') return outcome.result;
            try {
                await this.pluginServer.install(FileUri.create(deploymentDir).withScheme('local-dir').toString(), PluginType.User);
            } catch (err) {
                // WR-06: undo the copy, so the extension still reads as absent and the command the
                // failure message points to ("Try the command again") stays offered.
                await fs.promises.rm(path.join(deploymentDir, id), { recursive: true, force: true });
                throw err;
            }
            // Recorded only after the deploy; a record write failure does not undo a working reinstall.
            try {
                const record = parseRecord(await this.settings.get(SEED_RECORD_KEY));
                record[id] = outcome.version;
                await this.settings.set(SEED_RECORD_KEY, JSON.stringify(record));
            } catch (err) {
                this.logger.error(`bundled extension ${id} was reinstalled but not recorded`, err);
            }
            this.logger.info(`bundled extension ${id}@${outcome.version} reinstalled`);
            return 'reinstalled';
        } catch (err) {
            this.logger.error(`bundled extension ${id} was not reinstalled`, err);
            return 'failed';
        }
    }

    protected async deploymentDir(): Promise<string> {
        return FileUri.fsPath(await this.environments.getDeploymentDirUri());
    }
}
