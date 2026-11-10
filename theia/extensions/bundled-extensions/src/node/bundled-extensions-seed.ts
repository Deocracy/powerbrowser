// Seeds PowerBrowser's pre-installed extensions into the profile as user plugins (D-30, P68-38).
// A built-in (system) plugin can be disabled but never uninstalled, so the build places each
// one under <pluginsDir>/.user/<id>/, which the system scan skips (dot prefix), and this
// participant copies it into <THEIA_CONFIG_DIR>/deployedPlugins/<id>/ before the deployer
// resolves anything. Theia then lists it as a user plugin with its own Uninstall and Disable.
import * as nodeFs from 'fs';
import * as path from 'path';
import { inject, injectable, named } from '@theia/core/shared/inversify';
import { ILogger } from '@theia/core/lib/common/logger';
import URI from '@theia/core/lib/common/uri';
import { FileUri } from '@theia/core/lib/common/file-uri';
import { SettingService } from '@theia/core/lib/node/setting-service';
import { PluginDeployerParticipant, PluginDeployerStartContext } from '@theia/plugin-ext/lib/common/plugin-protocol';
import { PluginVSCodeEnvironment } from '@theia/plugin-ext-vscode/lib/common/plugin-vscode-environment';

/** backend-settings.json key; the value is a JSON string of { "<id>": "<version>" }. */
export const SEED_RECORD_KEY = 'bundledExtensions.seeded';

export interface SeedAction {
    id: string;
    version: string;
    action: 'seeded';
}

export interface SeedInput {
    /** Directories holding <id>/extension/package.json, normally <pluginsDir>/.user. */
    sources: string[];
    /** <THEIA_CONFIG_DIR>/deployedPlugins. */
    deploymentDir: string;
    /** The stored record value as SettingService returns it (a JSON string), or undefined. */
    record: unknown;
    fs?: typeof nodeFs.promises;
}

export function parseRecord(value: unknown): Record<string, string> {
    try {
        const parsed = typeof value === 'string' ? JSON.parse(value) : undefined;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)
            && Object.values(parsed).every(v => typeof v === 'string')) {
            return { ...parsed };
        }
    } catch { /* malformed counts as empty */ }
    return {};
}

/** The seed rule, free of Theia: returns the record to store and what it did. */
export async function seedBundledExtensions(input: SeedInput): Promise<{ record: Record<string, string>; actions: SeedAction[] }> {
    const fs = input.fs ?? nodeFs.promises;
    const record = parseRecord(input.record);
    const actions: SeedAction[] = [];
    const seen = new Set<string>();
    for (const source of input.sources) {
        let names: string[];
        try {
            names = await fs.readdir(source);
        } catch {
            continue; // a plugins directory without a .user folder
        }
        for (const id of names.sort()) {
            if (id.startsWith('.') || seen.has(id)) continue;
            const version = await readVersion(fs, path.join(source, id));
            if (!version) continue;
            seen.add(id);
            if (record[id] !== undefined) continue;
            await copyInto(fs, path.join(source, id), input.deploymentDir, id);
            record[id] = version;
            actions.push({ id, version, action: 'seeded' });
        }
    }
    return { record, actions };
}

async function readVersion(fs: typeof nodeFs.promises, dir: string): Promise<string | undefined> {
    try {
        const pck = JSON.parse(await fs.readFile(path.join(dir, 'extension', 'package.json'), 'utf8'));
        return typeof pck.version === 'string' ? pck.version : undefined;
    } catch {
        return undefined;
    }
}

/** Copy into a temporary sibling, then rename, so a failure never leaves a half-built plugin. */
async function copyInto(fs: typeof nodeFs.promises, from: string, deploymentDir: string, id: string): Promise<void> {
    await fs.mkdir(deploymentDir, { recursive: true });
    const tmp = await fs.mkdtemp(path.join(deploymentDir, `.${id}-`));
    try {
        // Links are refused, so nothing outside the shipped folder is ever copied.
        await fs.cp(from, tmp, { recursive: true, force: true, filter: src => !nodeFs.lstatSync(src).isSymbolicLink() });
        await fs.rm(path.join(deploymentDir, id), { recursive: true, force: true });
        await fs.rename(tmp, path.join(deploymentDir, id));
    } catch (err) {
        await fs.rm(tmp, { recursive: true, force: true });
        throw err;
    }
}

/** The local-dir directories the deployer itself reads as system entries, each with /.user. */
export function sourcesOf(systemEntries: string[]): string[] {
    const dirs: string[] = [];
    for (const entry of systemEntries) {
        const uri = new URI(entry.trim());
        if (uri.scheme !== 'local-dir') continue;
        dirs.push(path.join(path.resolve(process.cwd(), FileUri.fsPath(uri)), '.user'));
    }
    return dirs;
}

@injectable()
export class BundledExtensionsSeed implements PluginDeployerParticipant {

    @inject(ILogger) @named('powerbrowser:bundled-extensions')
    protected readonly logger: ILogger;

    @inject(SettingService)
    protected readonly settings: SettingService;

    @inject(PluginVSCodeEnvironment)
    protected readonly environments: PluginVSCodeEnvironment;

    async onWillStart(context: PluginDeployerStartContext): Promise<void> {
        try {
            const deploymentDir = FileUri.fsPath(await this.environments.getDeploymentDirUri());
            const stored = await this.settings.get(SEED_RECORD_KEY);
            const { record, actions } = await seedBundledExtensions({ sources: sourcesOf(context.systemEntries), deploymentDir, record: stored });
            for (const a of actions) this.logger.info(`bundled extension ${a.id}@${a.version} ${a.action}`);
            const next = JSON.stringify(record);
            if (next !== stored) await this.settings.set(SEED_RECORD_KEY, next);
        } catch (err) {
            // The deployer must start whatever happens here.
            this.logger.error('bundled extensions were not seeded', err);
        }
    }
}
