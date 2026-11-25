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
import { ApplicationShell, FrontendApplicationContribution, Navigatable, OpenerService, Saveable, Widget, open } from '@theia/core/lib/browser';
import { DiffUris } from '@theia/core/lib/browser/diff-uris';
import URI from '@theia/core/lib/common/uri';
import { EditorManager } from '@theia/editor/lib/browser';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { MergeEditorUri } from '@theia/scm/lib/browser/merge-editor/merge-editor';
import { OrcaPaneBundle } from '@powerbrowser/orca-panes/lib/browser/orca-pane-bundle';
import { ORCA_GIT_SCHEME, OrcaGitService, orcaGitUri } from '../common/orca-git-protocol';
import { SetupsService } from '@powerbrowser/modes/lib/browser/setups-service';

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

/**
 * 65-WR-05: the words a diff tab title shows for each diff rule, Orca's own strings where it has them. A combined
 * diff opens its first entry by that entry's rule, so the title names the rule, never Orca's diff-source identifier.
 */
export const ORCA_DIFF_RULE_LABELS: { readonly [rule: string]: string } = Object.freeze({
    'unstaged': 'Unstaged',
    'staged': 'Staged',
    'branch': 'Branch',
    'commit': 'Commit',
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
    /** 65-WR-03: the store's hasHydratedWorktreePurge; false while Orca is still listing repositories, absent from an older bundle. */
    hydrated?: boolean;
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

/** CA-01: a conflict-review tab names the worktree root; its file is the selected entry, else the first. */
export function selectedConflict(file: OrcaOpenFile): { relativePath: string; conflictKind: string } | undefined {
    const entries = file.conflicts?.entries ?? [];
    return entries.find(e => e.relativePath === file.conflicts?.selectedPath) ?? entries[0];
}

/** The ORCA_EDITOR_ROUTES key of a record. */
export function routeKeyOf(file: OrcaOpenFile): string {
    if (file.mode === 'diff') {
        return `diff:${file.diffSource}`;
    }
    if (file.mode === 'conflict-review') {
        return `conflict-review:${selectedConflict(file)?.conflictKind}`;
    }
    return file.mode;
}

/** Whether a diff record needs HEAD resolved before routing (the staged rule). */
export function needsHead(file: OrcaOpenFile): boolean {
    return file.mode === 'diff' && (file.diffSource === 'staged'
        || ((file.diffSource === 'combined-uncommitted' || file.diffSource === 'combined-all') && file.combinedFirst?.area === 'staged'));
}

const trimSlash = (path: string): string => path.replace(/\/+$/, '');
const joinPath = (root: string, rel: string): string => `${trimSlash(root)}/${rel}`;
const blob = (id: string | null | undefined): string => id ?? '';

/** CA-03: the sides of one diff rule; a null object id is an empty side. */
function diffSides(file: OrcaOpenFile, rule: string, rel: string, oldRel: string | undefined, area: string | undefined, helpers: OrcaRouteHelpers): [OrcaSide, OrcaSide] {
    const at = (r: string) => joinPath(file.worktreePath, r);
    const left = at(oldRel ?? rel);
    switch (rule) {
        case 'staged':
            return [{ path: left, rev: blob(helpers.headOid) }, { path: at(rel), rev: ':0' }];
        case 'branch':
            // Pitfall 7: Orca's branch diff is merge base vs the head commit, never the working file.
            return [{ path: left, rev: blob(file.branch?.mergeBase) }, { path: at(rel), rev: blob(file.branch?.headOid) }];
        case 'commit':
            return [{ path: left, rev: blob(file.commit?.parentOid) }, { path: at(rel), rev: blob(file.commit?.commitOid) }];
        default:
            // unstaged; an untracked entry has no stage 0, so its left side is empty.
            return [{ path: at(rel), rev: area === 'untracked' ? '' : ':0' }, { path: at(rel) }];
    }
}

/** P65-01, P65-02, CA-01..CA-03: the Theia route of one record. Pure. */
export function routeOpenFile(file: OrcaOpenFile, helpers: OrcaRouteHelpers = {}): OrcaRoute {
    if (!file.local) {
        return { open: 'log', line: `${file.mode} tab not opened in Theia: remote host` };
    }
    const key = routeKeyOf(file);
    const target = ORCA_EDITOR_ROUTES[key];
    if (!target) {
        return { open: 'log', line: `${key} has no Theia route` };
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
    if (file.mode === 'diff') {
        const source = file.diffSource ?? '';
        const combined = source.startsWith('combined-');
        const first = file.combinedFirst;
        if (combined && !first) {
            return { open: 'log', line: `diff ${source} has no entry to open` };
        }
        // Theia 1.76 has no multi-diff editor: a combined diff opens its snapshot's first entry by that entry's own rule.
        const rule = !combined ? source
            : source === 'combined-branch' ? 'branch'
                : source === 'combined-commit' ? 'commit'
                    : first?.area === 'staged' ? 'staged' : 'unstaged';
        const rel = combined ? first!.relativePath : file.relativePath;
        const oldRel = combined ? first!.oldPath : file.oldPath;
        const [left, right] = diffSides(file, rule, rel, oldRel, combined ? first!.area : undefined, helpers);
        return { open: 'diff', left, right, label: `${rel.split('/').pop()} (${ORCA_DIFF_RULE_LABELS[rule] ?? 'Changes'})` };
    }
    // conflict-review (CA-02): the merge editor needs stages 2 and 3; the one-sided kinds open the working file.
    const conflict = selectedConflict(file)!;
    const path = joinPath(file.worktreePath, conflict.relativePath);
    if (target === 'theia-merge') {
        return {
            open: 'merge',
            base: { path, rev: conflict.conflictKind === 'both_added' ? '' : ':1' },
            side1: { path, rev: ':2' },
            side2: { path, rev: ':3' },
            result: { path },
        };
    }
    return helpers.workingFileExists
        ? { open: 'editor', path, preview: false }
        : { open: 'log', line: `conflict-review ${conflict.conflictKind}: the working file does not exist, so nothing opens` };
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

    @inject(OrcaGitService)
    protected readonly git: OrcaGitService;

    @inject(FileService)
    protected readonly fileService: FileService;

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    @inject(SetupsService)
    protected readonly setups: SetupsService;

    protected api: OrcaWorkspaceBundleApi | undefined;
    /** Opened URI (string) -> its widget and the Orca records naming it. */
    protected readonly byUri = new Map<string, Mapping>();
    /**
     * Orca record id -> [routing signature, opened URI or undefined when nothing opened]. failed: the open threw;
     * released: PB closed its widget because the store dropped its root (closeCleanUnder).
     */
    protected readonly known = new Map<string, { signature: string; uri: string | undefined; failed?: boolean; released?: boolean }>();
    /** The last snapshot applied, replayed by retry(). */
    protected lastFiles: OrcaOpenFile[] | undefined;
    protected readonly logged = new Set<string>();
    protected firstSnapshot = true;
    protected queue: Promise<void> = Promise.resolve();
    protected latest: OrcaOpenFile[] | undefined;
    /** Widgets PB itself disposes: their disposal never calls Orca's close. */
    protected readonly pbDisposing = new WeakSet<Widget>();
    protected readonly watched = new WeakSet<Widget>();

    onStart(): void {
        // The last session's tabs are re-applied first, so an Orca record finds a file the session already reopened.
        Promise.all([this.bundle.ready(), this.setups.sessionRestored]).then(([loaded]) => {
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

    /**
     * 65-WR-02, 65-WR-03: OrcaRootSync calls this after it applied the roots (rootPaths: the store's local roots, as
     * file-system paths). A record whose open failed (its worktree was not yet a trusted root) is opened again from the
     * last snapshot, so a failed open is never cached for good under an unchanged signature; a record whose widget
     * closeCleanUnder disposed is opened again once its worktree is a root again.
     */
    retry(rootPaths: readonly string[]): void {
        const roots = new Set(rootPaths.map(trimSlash));
        const byId = new Map((this.lastFiles ?? []).map(f => [f.id, f]));
        let replay = false;
        for (const [id, entry] of [...this.known]) {
            const file = byId.get(id);
            if (entry.failed || (entry.released && file !== undefined && roots.has(trimSlash(file.worktreePath)))) {
                this.known.delete(id);
                replay = true;
            }
        }
        // A newer snapshot already waiting is the one to apply; the last applied one never replaces it.
        if (replay && this.latest === undefined && this.lastFiles) {
            this.schedule(this.lastFiles);
        }
    }

    /** Records that failed in the first snapshot: their retry opens them the way that snapshot would, without focus. */
    protected readonly openQuietly = new Set<string>();

    protected async apply(files: OrcaOpenFile[]): Promise<void> {
        this.lastFiles = files;
        const first = this.firstSnapshot;
        this.firstSnapshot = false;
        const activeWorktree = this.api?.activeWorktree() ?? null;
        const seen = new Set<string>();
        for (const file of files) {
            seen.add(file.id);
            const signature = signatureOf(file);
            const previous = this.known.get(file.id);
            if (previous?.signature === signature) {
                continue;
            }
            this.detach(file.id);
            const quiet = first || this.openQuietly.has(file.id);
            const mode = quiet ? 'open' : file.active && file.worktreeId === activeWorktree ? 'activate' : file.active ? 'reveal' : 'open';
            // One record that cannot open (a refused read, a missing file) never holds up the rest of the snapshot.
            let failed = false;
            const uri = await this.openRecord(file, mode).catch(err => {
                failed = true;
                this.logOnce(file.id, `${routeKeyOf(file)} did not open in Theia: ${(err as Error)?.message ?? 'unknown error'}`);
                return undefined;
            });
            this.known.set(file.id, failed ? { signature, uri, failed } : { signature, uri });
            if (failed && first) {
                this.openQuietly.add(file.id);
            } else if (!failed) {
                this.openQuietly.delete(file.id);
            }
            if (uri) {
                this.byUri.get(uri)?.records.set(file.id, { worktreeId: file.worktreeId, tabId: file.tabId });
            }
            if (previous?.uri && previous.uri !== uri) {
                this.releaseIfOrphan(previous.uri);
            }
        }
        for (const id of [...this.known.keys()]) {
            if (!seen.has(id)) {
                // P65-02: an Orca-side close.
                this.openQuietly.delete(id);
                const uri = this.detach(id);
                if (uri) {
                    this.releaseIfOrphan(uri);
                }
            }
        }
    }

    /** Drops a record from the maps; resolves the URI it mapped to. */
    protected detach(id: string): string | undefined {
        const uri = this.known.get(id)?.uri;
        this.known.delete(id);
        if (uri) {
            this.byUri.get(uri)?.records.delete(id);
        }
        return uri;
    }

    /** T-65-07: a widget no Orca tab names any more is disposed only when it holds no unsaved text; a dirty one stays as a plain Theia editor. */
    protected releaseIfOrphan(uri: string): void {
        const mapping = this.byUri.get(uri);
        if (!mapping || mapping.records.size > 0) {
            return;
        }
        this.byUri.delete(uri);
        if (!Saveable.isDirty(mapping.widget)) {
            this.pbDisposing.add(mapping.widget);
            mapping.widget.dispose();
        }
    }

    /** A Theia-side close of a mapped widget closes every Orca tab mapped to it, through Orca's own close (P65-02). */
    protected onWidgetDisposed(widget: Widget): void {
        for (const [uri, mapping] of this.byUri) {
            if (mapping.widget !== widget) {
                continue;
            }
            this.byUri.delete(uri);
            if (this.pbDisposing.has(widget)) {
                // 65-WR-03: PB closed it for a dropped root; its records stay closed until retry() sees the root again.
                for (const id of mapping.records.keys()) {
                    this.known.set(id, { signature: this.known.get(id)?.signature ?? '', uri: undefined, released: true });
                }
                return;
            }
            for (const [id, pick] of mapping.records) {
                // Kept as known with nothing open, so the record is not reopened while Orca closes its tab.
                this.known.set(id, { signature: this.known.get(id)?.signature ?? '', uri: undefined });
                this.api?.closePane({ worktreeId: pick.worktreeId, tabId: pick.tabId, paneKey: null });
            }
            return;
        }
    }

    /**
     * P65-07: closes every clean editor, diff and merge widget with a resource or a side under root (a
     * file-system path) after the store dropped that worktree; dirty widgets stay open.
     */
    closeCleanUnder(root: string): void {
        const under = (u: URI | undefined): boolean => {
            if (!u) {
                return false;
            }
            if (DiffUris.isDiffUri(u)) {
                return DiffUris.decode(u).some(under);
            }
            if (MergeEditorUri.isMergeEditorUri(u)) {
                const m = MergeEditorUri.decode(u);
                return [m.baseUri, m.side1Uri, m.side2Uri, m.resultUri].some(under);
            }
            if (u.scheme !== 'file' && u.scheme !== ORCA_GIT_SCHEME) {
                return false;
            }
            const path = u.path.fsPath();
            return path === root || path.startsWith(`${root}/`);
        };
        for (const widget of [...this.shell.getWidgets('main'), ...this.shell.getWidgets('bottom')]) {
            const merge = widget as Widget & { resultUri?: URI; baseUri?: URI };
            const uris = [Navigatable.is(widget) ? widget.getResourceUri() : undefined, merge.resultUri, merge.baseUri];
            if (uris.some(under) && !Saveable.isDirty(widget)) {
                this.pbDisposing.add(widget);
                widget.dispose();
            }
        }
    }

    /** HEAD is resolved to an object id at open (staged rule); a one-sided conflict needs its working file. */
    protected async routeHelpers(file: OrcaOpenFile): Promise<OrcaRouteHelpers> {
        if (!file.local) {
            return {};
        }
        if (needsHead(file)) {
            return { headOid: await this.git.resolveHead(file.worktreePath) };
        }
        const conflict = file.mode === 'conflict-review' ? selectedConflict(file) : undefined;
        if (conflict && ORCA_EDITOR_ROUTES[routeKeyOf(file)] === 'theia-editor') {
            return { workingFileExists: await this.fileService.exists(URI.fromFilePath(joinPath(file.worktreePath, conflict.relativePath))) };
        }
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
            const counter = this.openCounterOf(uri);
            const widget = await this.editorManager.open(uri, counter === undefined ? { mode, preview: route.preview } : { mode, counter });
            this.track(uri.toString(), widget);
            return uri.toString();
        } else {
            uri = this.uriOfRoute(route);
        }
        const counter = this.openCounterOf(uri);
        const widget = counter === undefined ? await open(this.openerService, uri, { mode }) : await this.editorManager.open(uri, { mode, counter });
        if (widget instanceof Widget) {
            this.track(uri.toString(), widget);
            return uri.toString();
        }
        return undefined;
    }

    /**
     * Stock reuses an editor only in the target tab bar; an Orca record names a file or diff, so an editor of that URI
     * already in any tab bar (a restored session, a Setup) is revealed by its counter instead of opened a second time.
     */
    protected openCounterOf(uri: URI): number | undefined {
        const existing = this.editorManager.all.find(w => w.editor.uri.toString() === uri.toString() && !!this.shell.getTabBarFor(w));
        return existing ? Number(existing.id.slice(existing.id.lastIndexOf(':') + 1)) : undefined;
    }

    /** diff: and merge-editor: URIs whose sides are pb-orca-git: blobs or the working file. */
    protected uriOfRoute(route: OrcaRoute): URI {
        const side = (s: OrcaSide): URI => s.rev === undefined ? URI.fromFilePath(s.path) : new URI(orcaGitUri(s.path, s.rev));
        if (route.open === 'diff') {
            return DiffUris.encode(side(route.left), side(route.right), route.label);
        }
        if (route.open === 'merge') {
            return MergeEditorUri.encode({ baseUri: side(route.base), side1Uri: side(route.side1), side2Uri: side(route.side2), resultUri: side(route.result) });
        }
        throw new Error(`no URI for the ${route.open} route`);
    }

    protected track(uri: string, widget: Widget): void {
        if (!this.watched.has(widget)) {
            this.watched.add(widget);
            widget.disposed.connect(() => this.onWidgetDisposed(widget));
        }
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
