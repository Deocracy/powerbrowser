/**
 * Phase 65 (TAB-05; P65-01, P65-02, P65-21, D-01; interfaces B-2, B-3): Orca's
 * editor-type tabs open in Theia's editor, diff editor and merge editor, so
 * Orca's own EditorPanel is never mounted.
 *
 * ORCA_EDITOR_ROUTES is the handler table, keyed by OpenFile mode, diff source
 * and conflict kind; scripts/verify-orca-editor-routes.mjs derives those sets
 * from the pinned Orca source and compares them with the keys. routeOpenFile
 * is pure (the check transpiles it); OrcaEditorRouter observes the bundle's
 * subscribeOpenFiles and opens each record through Theia's own openers.
 */
import { inject, injectable } from '@theia/core/shared/inversify';
import { FrontendApplicationContribution, OpenerService, Widget, open } from '@theia/core/lib/browser';
import URI from '@theia/core/lib/common/uri';
import { EditorManager } from '@theia/editor/lib/browser';
import { OrcaPaneBundle } from '@powerbrowser/orca-panes/lib/browser/orca-pane-bundle';

const LOG_PREFIX = '[@powerbrowser/orca-workspace]';

export type OrcaEditorTarget = 'theia-editor' | 'theia-diff' | 'theia-merge' | 'hosted:check-details';

/** P65-01: one row per mode, diff source and conflict kind. check-details is the one named hosted row (orca-panes mounts CheckRunDetailsPanel). */
export const ORCA_EDITOR_ROUTES: { readonly [key: string]: OrcaEditorTarget } = Object.freeze({
    'edit': 'theia-editor',
    'markdown-preview': 'theia-editor',
    'diff:unstaged': 'theia-diff',
    'diff:staged': 'theia-diff',
    'diff:branch': 'theia-diff',
    'diff:commit': 'theia-diff',
    'diff:combined-all': 'theia-diff',
    'diff:combined-uncommitted': 'theia-diff',
    'diff:combined-branch': 'theia-diff',
    'diff:combined-commit': 'theia-diff',
    'conflict-review:both_modified': 'theia-merge',
    'conflict-review:both_added': 'theia-merge',
    'conflict-review:both_deleted': 'theia-editor',
    'conflict-review:added_by_us': 'theia-editor',
    'conflict-review:added_by_them': 'theia-editor',
    'conflict-review:deleted_by_us': 'theia-editor',
    'conflict-review:deleted_by_them': 'theia-editor',
    'check-details': 'hosted:check-details',
});

/** B-2: one editor-type Orca tab, as the bundle's subscribeOpenFiles reports it. Object ids are 40 or 64 lower-case hex, or null. */
export interface OrcaOpenFile {
    id: string;
    tabId: string;
    worktreeId: string;
    worktreePath: string;
    filePath: string;
    relativePath: string;
    mode: string;
    diffSource?: string;
    isPreview: boolean;
    active: boolean;
    local: boolean;
    oldPath?: string;
    branch?: { mergeBase: string | null; headOid: string | null };
    commit?: { parentOid: string | null; commitOid: string | null };
    combinedFirst?: { relativePath: string; oldPath?: string; area?: string };
    conflicts?: { selectedPath?: string; entries: Array<{ relativePath: string; conflictKind: string }> };
}

/** B-3: the store's worktrees and folder workspaces. */
export interface OrcaWorkspaceSnapshot {
    worktrees: Array<{ id: string; path: string; isArchived: boolean; local: boolean }>;
    folders: Array<{ id: string; path: string; local: boolean }>;
}

/** The bundle exports this extension calls (B-2, B-3, C64-1); orca-pane-entry's consumer clause compares them with the entry's exports. */
export interface OrcaWorkspaceBundleApi {
    subscribeOpenFiles(listener: (files: OrcaOpenFile[]) => void): () => void;
    subscribeWorktrees(listener: (snapshot: OrcaWorkspaceSnapshot) => void): () => void;
    closePane(pick: { worktreeId: string; tabId: string; paneKey: string | null }): void;
    activeWorktree(): string | null;
}

/** Narrows the loaded bundle; undefined when an export is missing (lane p65-01 not merged), so callers log once and do nothing. */
export function narrowWorkspaceApi(api: unknown): OrcaWorkspaceBundleApi | undefined {
    const m = api as Partial<Record<keyof OrcaWorkspaceBundleApi, unknown>> | undefined;
    return m && typeof m.subscribeOpenFiles === 'function' && typeof m.subscribeWorktrees === 'function'
        && typeof m.closePane === 'function' && typeof m.activeWorktree === 'function'
        ? m as OrcaWorkspaceBundleApi : undefined;
}

/** A side of a diff or merge: rev undefined is the working file (file:), a string is a pb-orca-git: blob ('' is an empty side). */
export interface OrcaSide {
    path: string;
    rev?: string;
}

export type OrcaRoute =
    | { open: 'editor'; path: string; preview: boolean; note?: string }
    | { open: 'diff'; left: OrcaSide; right: OrcaSide; label: string }
    | { open: 'merge'; base: OrcaSide; side1: OrcaSide; side2: OrcaSide; result: OrcaSide }
    | { open: 'hosted' }
    | { open: 'log'; line: string };

/** What routeOpenFile cannot know by itself; the router fills it in before routing. */
export interface OrcaRouteHelpers {
    /** HEAD resolved to an object id at open; null when unborn. */
    headOid?: string | null;
    /** Whether the working file of the selected conflict exists. */
    workingFileExists?: boolean;
}

/** The ORCA_EDITOR_ROUTES key of a record. */
export function routeKeyOf(file: OrcaOpenFile): string {
    return file.mode === 'diff' ? `diff:${file.diffSource}` : file.mode;
}

const joinPath = (root: string, rel: string): string => `${root.replace(/\/+$/, '')}/${rel}`;

/** P65-01, P65-02: the Theia route of one record. Pure. */
export function routeOpenFile(file: OrcaOpenFile, helpers: OrcaRouteHelpers = {}): OrcaRoute {
    if (!file.local) {
        return { open: 'log', line: `${file.mode} tab not opened in Theia: remote host` };
    }
    const target = ORCA_EDITOR_ROUTES[routeKeyOf(file)];
    if (!target) {
        return { open: 'log', line: `${routeKeyOf(file)} has no Theia route` };
    }
    if (target === 'hosted:check-details') {
        return { open: 'hosted' };
    }
    if (file.mode === 'markdown-preview') {
        return { open: 'editor', path: file.filePath, preview: file.isPreview, note: 'markdown-preview opens the source file in the Theia editor' };
    }
    if (file.mode === 'edit') {
        return { open: 'editor', path: file.filePath, preview: file.isPreview };
    }
    void helpers;
    void joinPath;
    return { open: 'log', line: `${routeKeyOf(file)} is not routed yet` };
}

interface Mapping {
    widget: Widget;
    /** Orca record id -> the ids closePane takes. */
    records: Map<string, { worktreeId: string; tabId: string }>;
}

/**
 * P65-02: observes the bundle's editor-type tabs and opens each in Theia. One
 * widget per resource: a second Orca tab naming the same resource maps to the
 * widget EditorManager returns.
 */
@injectable()
export class OrcaEditorRouter implements FrontendApplicationContribution {

    @inject(OrcaPaneBundle)
    protected readonly bundle: OrcaPaneBundle;

    @inject(EditorManager)
    protected readonly editorManager: EditorManager;

    @inject(OpenerService)
    protected readonly openerService: OpenerService;

    protected api: OrcaWorkspaceBundleApi | undefined;
    /** Opened URI (string) -> its widget and the Orca records naming it. */
    protected readonly byUri = new Map<string, Mapping>();
    /** Orca record id -> [routing signature, opened URI or undefined when nothing opened]. */
    protected readonly known = new Map<string, { signature: string; uri: string | undefined }>();
    protected readonly logged = new Set<string>();
    protected firstSnapshot = true;
    protected queue: Promise<void> = Promise.resolve();
    protected latest: OrcaOpenFile[] | undefined;

    onStart(): void {
        this.bundle.ready().then(loaded => {
            this.api = narrowWorkspaceApi(loaded);
            if (!this.api) {
                console.warn(`${LOG_PREFIX} the Orca pane bundle has no subscribeOpenFiles, so Orca files do not open in Theia`);
                return;
            }
            this.api.subscribeOpenFiles(files => this.schedule(files));
        }, () => { /* orca-panes logged the failed step */ });
    }

    /** Coalesces snapshots: only the latest one waiting is applied, one at a time. */
    protected schedule(files: OrcaOpenFile[]): void {
        const idle = this.latest === undefined;
        this.latest = files;
        if (idle) {
            this.queue = this.queue.then(async () => {
                const next = this.latest ?? [];
                this.latest = undefined;
                await this.apply(next).catch(err => console.warn(`${LOG_PREFIX} an Orca file did not open: ${(err as Error)?.message ?? 'unknown error'}`));
            });
        }
    }

    protected async apply(files: OrcaOpenFile[]): Promise<void> {
        const first = this.firstSnapshot;
        this.firstSnapshot = false;
        const activeWorktree = this.api?.activeWorktree() ?? null;
        const seen = new Set<string>();
        for (const file of files) {
            seen.add(file.id);
            const signature = signatureOf(file);
            if (this.known.get(file.id)?.signature === signature) {
                continue;
            }
            this.forget(file.id);
            const mode = first ? 'open' : file.active && file.worktreeId === activeWorktree ? 'activate' : file.active ? 'reveal' : 'open';
            const uri = await this.openRecord(file, mode);
            this.known.set(file.id, { signature, uri });
            if (uri) {
                this.byUri.get(uri)?.records.set(file.id, { worktreeId: file.worktreeId, tabId: file.tabId });
            }
        }
        for (const id of [...this.known.keys()]) {
            if (!seen.has(id)) {
                this.forget(id);
            }
        }
    }

    /** Drops a record from the maps. */
    protected forget(id: string): void {
        const uri = this.known.get(id)?.uri;
        this.known.delete(id);
        const mapping = uri ? this.byUri.get(uri) : undefined;
        mapping?.records.delete(id);
    }

    protected async routeHelpers(_file: OrcaOpenFile): Promise<OrcaRouteHelpers> {
        return {};
    }

    /** Opens one record; resolves the opened URI string, or undefined when nothing opened. */
    protected async openRecord(file: OrcaOpenFile, mode: 'open' | 'reveal' | 'activate'): Promise<string | undefined> {
        const route = routeOpenFile(file, await this.routeHelpers(file));
        let uri: URI;
        if (route.open === 'log' || route.open === 'hosted') {
            if (route.open === 'log') {
                this.logOnce(file.id, route.line);
            }
            return undefined;
        } else if (route.open === 'editor') {
            if (route.note) {
                this.logOnce(file.id, route.note);
            }
            uri = URI.fromFilePath(route.path);
            const widget = await this.editorManager.open(uri, { mode, preview: route.preview });
            this.track(uri.toString(), widget);
            return uri.toString();
        } else {
            uri = this.uriOfRoute(route);
        }
        const widget = await open(this.openerService, uri, { mode });
        if (widget instanceof Widget) {
            this.track(uri.toString(), widget);
            return uri.toString();
        }
        return undefined;
    }

    protected uriOfRoute(route: OrcaRoute): URI {
        throw new Error(`no URI for the ${route.open} route`);
    }

    protected track(uri: string, widget: Widget): void {
        const mapping = this.byUri.get(uri);
        if (mapping && mapping.widget === widget) {
            return;
        }
        this.byUri.set(uri, { widget, records: mapping?.records ?? new Map() });
    }

    protected logOnce(id: string, line: string): void {
        const key = `${id}\n${line}`;
        if (!this.logged.has(key)) {
            this.logged.add(key);
            console.info(`${LOG_PREFIX} ${line}`);
        }
    }
}

/** The fields routing reads; a record whose signature is unchanged is not reopened. */
function signatureOf(file: OrcaOpenFile): string {
    const { mode, diffSource, filePath, relativePath, worktreePath, oldPath, branch, commit, combinedFirst, conflicts, local, isPreview } = file;
    return JSON.stringify({ mode, diffSource, filePath, relativePath, worktreePath, oldPath, branch, commit, combinedFirst, conflicts, local, isPreview });
}
