/**
 * Phase 65 (TAB-05; P65-05, P65-06, P65-07, CA-04, CA-05, CA-15; interfaces B-3,
 * N-4, N-6): every local, non-archived Orca worktree and local folder workspace
 * is a Theia workspace folder, kept in sync with Orca's store.
 *
 * The sync applies the differences of the wanted set between store events
 * (CA-15), never a full reconcile on every event: PB removes only roots it added
 * (powerbrowser.orca.ownedRoots), and a PB-owned root the user removes through
 * Theia stays removed (powerbrowser.orca.userRemovedRoots) until its worktree
 * leaves the store. Both sets are file-URI arrays in ProfileStorageService,
 * unprefixed, so they outlive a workspace switch.
 *
 * Before the first root while no workspace or a folder workspace is open, every
 * key of the current workspace prefix is copied to the prefix of one fixed
 * workspace file, which is then saved: no reload, no Untitled workspace (whose
 * name makes every quit ask to save it), and every mode's layout carried over
 * (CA-04, CA-05; copy strictly before save, Pitfall 2).
 */
import { inject, injectable } from '@theia/core/shared/inversify';
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { EnvVariablesServer } from '@theia/core/lib/common/env-variables';
import URI from '@theia/core/lib/common/uri';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import { OrcaPaneBundle } from '@powerbrowser/orca-panes/lib/browser/orca-pane-bundle';
import { ProfileStorageService } from '@powerbrowser/tab-uris/lib/browser/profile-storage';
import { OrcaEditorRouter, OrcaWorkspaceSnapshot, narrowWorkspaceApi } from './orca-editor-routes';

const LOG_PREFIX = '[@powerbrowser/orca-workspace]';

/** N-4: the roots PB added, and the PB-owned roots the user removed through Theia (file-URI string arrays). */
export const ORCA_OWNED_ROOTS_KEY = 'powerbrowser.orca.ownedRoots';
export const ORCA_USER_REMOVED_ROOTS_KEY = 'powerbrowser.orca.userRemovedRoots';
/** N-6: the fixed workspace file under <Theia config dir>/workspaces/. */
export const ORCA_WORKSPACE_FILE = 'powerbrowser.theia-workspace';
/** WorkspaceStorageService's prefix with no workspace open. */
export const GLOBAL_PREFIX = '_global_';
/**
 * Store events are applied once the store has been quiet this long, so a store
 * hydrating repository by repository is not read as worktrees leaving.
 * shortcut: a time bound, not a hydration signal (B-3 carries none); upgrade if the bundle reports hydration.
 */
const SETTLE_MS = 750;

export interface RootPlanInput {
    wanted: readonly string[];
    previousWanted: readonly string[];
    roots: readonly string[];
    owned: readonly string[];
    userRemoved: readonly string[];
}

export interface RootPlan {
    add: string[];
    remove: string[];
    /** Wanted before, not wanted now: the worktrees the store dropped. */
    dropped: string[];
    owned: string[];
    userRemoved: string[];
}

/** CA-15: the roots to add and remove for one store event, and the sets after it. Pure. */
export function planRoots({ wanted, previousWanted, roots, owned, userRemoved }: RootPlanInput): RootPlan {
    const wantedSet = new Set(wanted);
    const previousSet = new Set(previousWanted);
    const rootSet = new Set(roots);
    const ownedSet = new Set(owned);
    const removedSet = new Set(userRemoved);
    const add = wanted.filter(w => !previousSet.has(w) && !rootSet.has(w) && !removedSet.has(w));
    const dropped = previousWanted.filter(p => !wantedSet.has(p));
    const remove = dropped.filter(d => ownedSet.has(d) && rootSet.has(d));
    return {
        add,
        remove,
        dropped,
        owned: [...owned.filter(o => wantedSet.has(o)), ...add.filter(a => !ownedSet.has(a))],
        userRemoved: userRemoved.filter(u => wantedSet.has(u)),
    };
}

/** CA-15: an owned root missing from the roots after a change PB did not make was removed by the user. Pure. */
export function noteUserRemovals({ roots, owned, userRemoved }: { roots: readonly string[]; owned: readonly string[]; userRemoved: readonly string[] }): { owned: string[]; userRemoved: string[] } {
    const rootSet = new Set(roots);
    const gone = owned.filter(o => !rootSet.has(o));
    return { owned: owned.filter(o => rootSet.has(o)), userRemoved: [...userRemoved, ...gone.filter(g => !userRemoved.includes(g))] };
}

/** CA-04: each key of the old prefix and its name under the fixed file's prefix. Pure. */
export function planMigration({ prefix, keys, fixedUri }: { prefix: string; keys: readonly string[]; fixedUri: string }): Array<[string, string]> {
    const head = `${prefix}:`;
    return keys.filter(k => k.startsWith(head)).map(k => [k, `${fixedUri}:${k.slice(head.length)}`]);
}

/** P65-05: the wanted roots of one store snapshot, as file-URI strings. */
export function wantedRootsOf(snapshot: OrcaWorkspaceSnapshot, toUri: (path: string) => string): string[] {
    const paths = [
        ...(snapshot.worktrees ?? []).filter(w => w.local && !w.isArchived).map(w => w.path),
        ...(snapshot.folders ?? []).filter(f => f.local).map(f => f.path),
    ];
    return [...new Set(paths.filter(p => typeof p === 'string' && p.startsWith('/')).map(toUri))];
}

const stringList = (value: unknown): string[] => (Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []);

@injectable()
export class OrcaRootSync implements FrontendApplicationContribution {

    @inject(OrcaPaneBundle)
    protected readonly bundle: OrcaPaneBundle;

    @inject(WorkspaceService)
    protected readonly workspace: WorkspaceService;

    @inject(ProfileStorageService)
    protected readonly storage: ProfileStorageService;

    @inject(EnvVariablesServer)
    protected readonly env: EnvVariablesServer;

    @inject(OrcaEditorRouter)
    protected readonly router: OrcaEditorRouter;

    /** The wanted set applied last; undefined until the first sync of this session. */
    protected previousWanted: string[] | undefined;
    protected pending: string[] | undefined;
    protected seenWorktree = false;
    protected applying = false;
    protected timer: number | undefined;
    protected queue: Promise<void> = Promise.resolve();

    /** File-system paths of the store's current local roots (the resolver also trusts these, once the store has spoken). */
    liveRootPaths(): string[] {
        return (this.previousWanted ?? []).map(u => new URI(u).path.fsPath());
    }

    onStart(): void {
        this.bundle.ready().then(loaded => {
            const api = narrowWorkspaceApi(loaded);
            if (!api) {
                console.warn(`${LOG_PREFIX} the Orca pane bundle has no subscribeWorktrees, so Orca worktrees are not workspace folders`);
                return;
            }
            api.subscribeWorktrees(snapshot => this.onSnapshot(snapshot));
        }, () => { /* orca-panes logged the failed step */ });
        this.workspace.onWorkspaceChanged(() => {
            if (!this.applying && this.previousWanted !== undefined) {
                this.enqueue(() => this.recordUserRemovals());
            }
        });
    }

    protected onSnapshot(snapshot: OrcaWorkspaceSnapshot): void {
        this.pending = wantedRootsOf(snapshot, path => URI.fromFilePath(path).toString());
        this.seenWorktree ||= this.pending.length > 0;
        window.clearTimeout(this.timer);
        this.timer = window.setTimeout(() => this.enqueue(() => this.sync()), SETTLE_MS);
    }

    protected enqueue(step: () => Promise<void>): void {
        this.queue = this.queue.then(step).catch(err => console.warn(`${LOG_PREFIX} the workspace folder sync failed: ${(err as Error)?.message ?? 'unknown error'}`));
    }

    protected async sets(): Promise<{ owned: string[]; userRemoved: string[] }> {
        return {
            owned: stringList(await this.storage.getData(ORCA_OWNED_ROOTS_KEY)),
            userRemoved: stringList(await this.storage.getData(ORCA_USER_REMOVED_ROOTS_KEY)),
        };
    }

    protected async writeSets(owned: string[], userRemoved: string[]): Promise<void> {
        await this.storage.setData(ORCA_OWNED_ROOTS_KEY, owned);
        await this.storage.setData(ORCA_USER_REMOVED_ROOTS_KEY, userRemoved);
    }

    protected async currentRoots(): Promise<string[]> {
        return (await this.workspace.roots).map(root => root.resource.toString());
    }

    protected async sync(): Promise<void> {
        const wanted = this.pending;
        // An empty list before any worktree was ever reported is the store before hydration, not a drop.
        if (!wanted || (!wanted.length && !this.seenWorktree)) {
            return;
        }
        this.pending = undefined;
        await this.workspace.ready;
        const roots = await this.currentRoots();
        const { owned, userRemoved } = await this.sets();
        // At session start the persisted owned roots still in the workspace stand for the last wanted set,
        // so a relaunch reconciles once; an owned root missing from a workspace the user switched to is added again.
        const previousWanted = this.previousWanted ?? owned.filter(o => roots.includes(o));
        const plan = planRoots({ wanted, previousWanted, roots, owned, userRemoved });
        this.applying = true;
        try {
            if (plan.add.length) {
                await this.moveToFixedWorkspace();
                await this.workspace.spliceRoots(this.workspace.tryGetRoots().length, 0, ...plan.add.map(u => new URI(u)));
            }
            if (plan.remove.length) {
                // P65-07: only after the store reported the drop (this is that report), never on Orca's delete request.
                await this.workspace.removeRoots(plan.remove.map(u => new URI(u)));
            }
        } finally {
            this.applying = false;
        }
        for (const dropped of plan.dropped) {
            this.router.closeCleanUnder(new URI(dropped).path.fsPath());
        }
        this.previousWanted = wanted;
        await this.writeSets(plan.owned, plan.userRemoved);
    }

    /** CA-04, CA-05: copy the current prefix's keys, then save the fixed workspace file; a workspace file already open is kept. */
    protected async moveToFixedWorkspace(): Promise<void> {
        const current = this.workspace.workspace;
        if (current && !current.isDirectory) {
            return;
        }
        const prefix = current ? current.resource.toString() : GLOBAL_PREFIX;
        const fixed = new URI(await this.env.getConfigDirUri()).resolve('workspaces').resolve(ORCA_WORKSPACE_FILE);
        for (const [from, to] of planMigration({ prefix, keys: await this.storage.keysWithPrefix(`${prefix}:`), fixedUri: fixed.toString() })) {
            await this.storage.setData(to, await this.storage.getData(from));
        }
        await this.workspace.save(fixed);
    }

    protected async recordUserRemovals(): Promise<void> {
        const { owned, userRemoved } = await this.sets();
        const next = noteUserRemovals({ roots: await this.currentRoots(), owned, userRemoved });
        if (next.owned.length !== owned.length) {
            await this.writeSets(next.owned, next.userRemoved);
        }
    }
}
