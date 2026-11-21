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
    action: 'seeded' | 'upgraded';
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

/**
 * The seed rule, free of Theia: returns the record to store and what it did.
 * - no record for an id: copy it and record its version;
 * - the shipped version recorded: leave everything alone, so a user's uninstall sticks;
 * - another version recorded: replace the deployed copy only when it is still present.
 */
export async function seedBundledExtensions(input: SeedInput): Promise<{ record: Record<string, string>; actions: SeedAction[] }> {
    const fs = input.fs ?? nodeFs.promises;
    const record = parseRecord(input.record);
    const actions: SeedAction[] = [];
    const shipped = await shippedExtensions(fs, input.sources);
    // 68-WR-04: an upgrade the backend did not finish is put back before the rules read the folder.
    for (const { id } of shipped) await recoverParked(fs, input.deploymentDir, id);
    for (const { id, version, dir } of shipped) {
        // Recorded at this version: nothing to do, whether or not the user removed it.
        if (record[id] === version) continue;
        // Recorded at another version: upgrade a present copy only, so an uninstall sticks.
        if (record[id] !== undefined && !await exists(fs, path.join(input.deploymentDir, id))) continue;
        await copyInto(fs, dir, input.deploymentDir, id);
        actions.push({ id, version, action: record[id] === undefined ? 'seeded' : 'upgraded' });
        record[id] = version; // only after the copy succeeded
    }
    return { record, actions };
}

export interface ShippedExtension {
    id: string;
    version: string;
    /** The shipped folder, <source>/<id>. */
    dir: string;
}

/** Every extension the installed PowerBrowser ships; the first source wins for an id. */
export async function shippedExtensions(fs: typeof nodeFs.promises, sources: string[]): Promise<ShippedExtension[]> {
    const out: ShippedExtension[] = [];
    const seen = new Set<string>();
    for (const source of sources) {
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
            out.push({ id, version, dir: path.join(source, id) });
        }
    }
    return out;
}

export interface ReinstallInput {
    sources: string[];
    deploymentDir: string;
    id: string;
    fs?: typeof nodeFs.promises;
}

export type ReinstallOutcome = { result: 'reinstalled'; version: string } | { result: 'present' | 'unknown' };

/** The shipped ids whose deployed copy is gone from the profile: what a reinstall can bring back. */
export async function absentBundledExtensions(input: Omit<ReinstallInput, 'id'>): Promise<string[]> {
    const fs = input.fs ?? nodeFs.promises;
    const absent: string[] = [];
    for (const { id } of await shippedExtensions(fs, input.sources)) {
        if (!await exists(fs, path.join(input.deploymentDir, id))) absent.push(id);
    }
    return absent;
}

/**
 * The reinstall rule (68-11). Only the user's explicit command runs it, never the seed:
 * an id that is not shipped is refused, a present copy is left alone, and an absent one is
 * copied back from the shipped folder. The caller deploys it and updates the record.
 */
export async function reinstallBundledExtension(input: ReinstallInput): Promise<ReinstallOutcome> {
    const fs = input.fs ?? nodeFs.promises;
    const shipped = (await shippedExtensions(fs, input.sources)).find(s => s.id === input.id);
    if (!shipped) return { result: 'unknown' };
    if (await exists(fs, path.join(input.deploymentDir, shipped.id))) return { result: 'present' };
    await copyInto(fs, shipped.dir, input.deploymentDir, shipped.id);
    return { result: 'reinstalled', version: shipped.version };
}

async function exists(fs: typeof nodeFs.promises, p: string): Promise<boolean> {
    try {
        await fs.lstat(p);
        return true;
    } catch {
        return false;
    }
}

async function readVersion(fs: typeof nodeFs.promises, dir: string): Promise<string | undefined> {
    try {
        const pck = JSON.parse(await fs.readFile(path.join(dir, 'extension', 'package.json'), 'utf8'));
        return typeof pck.version === 'string' ? pck.version : undefined;
    } catch {
        return undefined;
    }
}

/** The hidden sibling an upgrade parks the old copy in: <deploymentDir>/.<id>-old-<random>/<id>. */
const parkedPrefix = (id: string): string => `.${id}-old-`;

/**
 * Copy into a temporary sibling, then rename, so a failure never leaves a half-built plugin.
 * 68-WR-04: an upgrade parks the old copy in a hidden sibling (a rename: atomic, and a link is
 * moved as a link, never followed), renames the new copy in, and only then deletes the old one.
 * At no step is <id> absent with nothing to restore it from, so a crash is never read as an uninstall.
 */
async function copyInto(fs: typeof nodeFs.promises, from: string, deploymentDir: string, id: string): Promise<void> {
    await fs.mkdir(deploymentDir, { recursive: true });
    const dest = path.join(deploymentDir, id);
    const tmp = await fs.mkdtemp(path.join(deploymentDir, `.${id}-`));
    let park: string | undefined;
    try {
        // Links are refused, so nothing outside the shipped folder is ever copied.
        await fs.cp(from, tmp, { recursive: true, force: true, filter: src => !nodeFs.lstatSync(src).isSymbolicLink() });
        if (await exists(fs, dest)) {
            park = await fs.mkdtemp(path.join(deploymentDir, parkedPrefix(id)));
            await fs.rename(dest, path.join(park, id));
        }
        await fs.rename(tmp, dest);
    } catch (err) {
        await fs.rm(tmp, { recursive: true, force: true });
        if (park) await recoverParked(fs, deploymentDir, id);
        throw err;
    }
    if (park) await fs.rm(park, { recursive: true, force: true });
}

/**
 * 68-WR-04: finishes an upgrade that stopped part way. While <id> is absent, a parked old copy
 * that is a real directory (a link is never restored) is renamed back; every parked sibling of
 * <id> is then removed.
 */
async function recoverParked(fs: typeof nodeFs.promises, deploymentDir: string, id: string): Promise<void> {
    let names: string[];
    try {
        names = await fs.readdir(deploymentDir);
    } catch {
        return; // no deployment folder yet
    }
    const dest = path.join(deploymentDir, id);
    // mkdtemp's suffix is six letters or digits, so another id's folders never match.
    const mine = (n: string) => n.startsWith(parkedPrefix(id)) && /^[A-Za-z0-9]{6}$/.test(n.slice(parkedPrefix(id).length));
    for (const name of names.filter(mine).sort()) {
        const park = path.join(deploymentDir, name);
        const parked = path.join(park, id);
        try {
            if (!await exists(fs, dest) && (await fs.lstat(parked)).isDirectory()) {
                await fs.rename(parked, dest);
            }
        } catch { /* nothing parked in it */ }
        await fs.rm(park, { recursive: true, force: true });
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

    /** The shipped-extension directories this start read; the reinstall service reuses them. */
    sources: string[] = [];

    async onWillStart(context: PluginDeployerStartContext): Promise<void> {
        try {
            this.sources = sourcesOf(context.systemEntries);
            const deploymentDir = FileUri.fsPath(await this.environments.getDeploymentDirUri());
            const stored = await this.settings.get(SEED_RECORD_KEY);
            const { record, actions } = await seedBundledExtensions({ sources: this.sources, deploymentDir, record: stored });
            for (const a of actions) this.logger.info(`bundled extension ${a.id}@${a.version} ${a.action}`);
            const next = JSON.stringify(record);
            if (next !== stored) await this.settings.set(SEED_RECORD_KEY, next);
        } catch (err) {
            // The deployer must start whatever happens here.
            this.logger.error('bundled extensions were not seeded', err);
        }
    }
}
