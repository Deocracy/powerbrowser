/**
 * Phase 65 (TAB-05; P65-03, CA-06; T-65-04): the frontend half of the
 * read-only pb-orca-git: scheme. The resolver accepts a URI only when its path
 * lies under a PB-owned root as persisted in ProfileStorageService (Pitfall 3:
 * at layout restore the live Orca store is still empty) or under a root of the
 * live store once it has reported, then reads through the
 * backend, which validates everything again. A refused read rejects, so Theia
 * shows its own cannot-open state (the merge editor falls back to an empty base).
 */
import { inject, injectable } from '@theia/core/shared/inversify';
import { Resource, ResourceResolver } from '@theia/core/lib/common/resource';
import URI from '@theia/core/lib/common/uri';
import { ProfileStorageService } from '@powerbrowser/tab-uris/lib/browser/profile-storage';
import { ORCA_GIT_SCHEME, OrcaGitService, specRefusal } from '../common/orca-git-protocol';
import { ORCA_OWNED_ROOTS_KEY, OrcaRootSync } from './orca-root-sync';

/** The longest root (a filesystem path) containing path, with path relative to it; undefined when none does. */
export function rootOf(path: string, roots: readonly string[]): { root: string; relativePath: string } | undefined {
    const root = roots.filter(r => path.startsWith(`${r}/`)).sort((a, b) => b.length - a.length)[0];
    return root === undefined ? undefined : { root, relativePath: path.slice(root.length + 1) };
}

export class OrcaGitResource implements Resource {
    readonly readOnly = true;

    constructor(readonly uri: URI, protected readonly read: () => ReturnType<OrcaGitService['readBlob']>) { }

    async readContents(): Promise<string> {
        const r = await this.read();
        if (!r.ok) {
            throw new Error(`pb-orca-git read refused: ${r.reason}`);
        }
        return r.text;
    }

    dispose(): void { /* nothing held */ }
}

@injectable()
export class OrcaGitResourceResolver implements ResourceResolver {

    @inject(OrcaGitService)
    protected readonly git: OrcaGitService;

    @inject(ProfileStorageService)
    protected readonly storage: ProfileStorageService;

    @inject(OrcaRootSync)
    protected readonly rootSync: OrcaRootSync;

    /**
     * File-system paths of the roots a pb-orca-git URI may read under: the persisted PB-owned roots, plus the
     * store's live local roots once it has spoken (a worktree that was already a user root is not PB-owned).
     */
    protected async trustedRoots(): Promise<string[]> {
        const owned = await this.storage.getData<unknown>(ORCA_OWNED_ROOTS_KEY, []);
        const persisted = (Array.isArray(owned) ? owned : []).filter((u): u is string => typeof u === 'string').map(u => new URI(u).path.fsPath());
        return [...persisted, ...this.rootSync.liveRootPaths()];
    }

    async resolve(uri: URI): Promise<Resource> {
        if (uri.scheme !== ORCA_GIT_SCHEME) {
            throw new Error('not a pb-orca-git URI');
        }
        const rev = uri.query;
        const hit = rootOf(uri.path.fsPath(), await this.trustedRoots());
        if (!hit || specRefusal(hit.relativePath, rev)) {
            throw new Error('pb-orca-git URI outside the Orca worktree roots or not a valid spec');
        }
        return new OrcaGitResource(uri, () => this.git.readBlob(hit.root, hit.relativePath, rev));
    }
}
