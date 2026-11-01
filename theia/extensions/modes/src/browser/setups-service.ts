import { injectable, inject } from '@theia/core/shared/inversify';
import {
    ApplicationShell,
    FrontendApplicationContribution,
    OpenerService,
    StatusBar,
    StatusBarAlignment,
    Widget,
    WidgetManager,
    open,
} from '@theia/core/lib/browser';
import { FrontendApplicationStateService } from '@theia/core/lib/browser/frontend-application-state';
import { DockLayout, DockPanel } from '@theia/core/shared/@lumino/widgets';
import type { Title } from '@theia/core/shared/@lumino/widgets';
import { GroupQueryService } from '@powerbrowser/tab-uris/lib/browser/group-query-service';
import { WEB_TAB_FACTORY_ID, WEB_TAB_OPEN_HANDLER_ID, WEB_TAB_SESSION, WebTabOptions, WebTabWidget } from '@powerbrowser/tab-uris/lib/browser/web-tab';
import { PerspectiveService } from '@theia/core/lib/browser/perspective-service';
import { SecondaryWindowHandler, extractSecondaryWindow } from '@theia/core/lib/browser/secondary-window-handler';
import { ExtractableWidget } from '@theia/core/lib/browser/widgets/extractable-widget';
import { ConfirmDialog } from '@theia/core/lib/browser/dialogs';
import { QuickInputService } from '@theia/core/lib/common/quick-pick-service';
import URI from '@theia/core/lib/common/uri';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { FileChangeType } from '@theia/filesystem/lib/common/files';
import { UserStorageUri } from '@theia/userstorage/lib/browser/user-storage-uri';
import { TabUriRegistry } from '@powerbrowser/tab-uris/lib/browser/tab-uri-registry';
import { ProfileStorageService } from '@powerbrowser/tab-uris/lib/browser/profile-storage';
import pDebounce from 'p-debounce';
import { SHIPPED_MODES } from './mode-descriptors';
import { ModeService } from './mode-service';
import { GroupModel, planWebTabRestore } from './group-model';
import { inputCappedName } from './capped-name-input';

/**
 * GUI-09 (14-03): named setups as user-storage data owned entirely
 * Theia-side (14-RESEARCH.md Pattern 2 idiom, 14-PATTERNS.md section 3).
 *
 * Schema (resolves 14-RESEARCH.md Open Question 2, setups half): the store
 * file holds an object with a numeric version, a setups array whose rows
 * carry a name, a mode id, a windows array of verbatim rects with tab-URI
 * lists and an active tab, plus a saved timestamp, and a last-session
 * pointer naming the setup to auto-restore or null. Snapshots reference
 * opaque tab URIs so the bridge stays landable; setup tab-placement for
 * file tabs uses the editor resource URI the opener already resolves
 * (14-PROBE Constraint 3: the registry covers views and terminals only).
 *
 * Validation discipline (14-PATTERNS.md section 3): hand-rolled total
 * parsing -- unknown fields dropped, corrupt data degrading to the
 * contracted empty state, restore dropping unresolvable URIs with the
 * contracted explanation, geometry numbers validated before any move call
 * (T-14-03-01), failures leaving current windows and tabs untouched
 * (T-14-03-02). Lifecycle mirrors the customize precedent: absence is the
 * default and is never created; the first read runs fire-and-forget after
 * startup (boot-chain deadlock); later read failures keep last good;
 * DELETED resets immediately; other changes reload debounced.
 *
 * Restore (14-UI-SPEC.md named-setups section): geometry verbatim with
 * reachability clamping as the documented backstop (a rect no display can
 * contain is pulled into view, never stranded off-screen); tabs placed
 * through the contribution open path (the opener, which delegates to each
 * contribution's own options); gone tabs dropped with the contracted
 * variant explanation while geometry plus mode still complete; failure
 * leaving the session untouched with the contracted restore-failure error.
 * The mode is applied through ModeService (NG-029).
 * Delete is the only destructive action (contracted confirmation, no undo):
 * it clears the current marker and changes nothing on screen. Core-close
 * carries no confirmation: the quit flush saves the session and the last-session pointer (NG-032),
 * and the ready-ordered applicator restores that session -- or, with none saved, the pointer's setup -- after core layout restore.
 */

/** Accepted store versions. Newer writers are read leniently: unknown fields drop. */
export const SETUPS_STORE_VERSION = 1;

/** Contracted name cap (14-UI-SPEC.md): inputCappedName cuts typed and pasted overflow while typing; the commit slice is a backstop. */
export const SETUP_NAME_MAX = 60;

/** User-storage file beside modes.json (never SQLite: single-writer rule). */
export const SETUPS_STORE_FILENAME = 'setups.json';

/**
 * NG-032: the key of the unnamed session a quit saves and the next launch
 * restores. It lives in the profile store (profile-storage.ts), not in
 * setups.json: setups are app-wide user data, a session belongs to one profile.
 */
export const SESSION_STORAGE_KEY = 'powerbrowser.setups.session';

/** NG-032: the session saved at quit -- the windows as a setup records them, plus when it was saved. */
export interface SessionSnapshot {
    modeId: string;
    windows: SetupWindowSnapshot[];
    /** Milliseconds since the epoch. */
    savedAt: number;
    /** NG-034: the web tabs to reopen on their own rows; empty in a snapshot saved before this field. */
    webTabs: SavedSessionWebTab[];
}

/** NG-034: one web tab of the saved session, as wave A's restore plan reads it (planWebTabRestore). */
export interface SavedSessionWebTab {
    rowKey: string;
    url: string;
    /** Milliseconds since the epoch the tab was last the current tab; null when never recorded. */
    lastAccessed: number | null;
}

/**
 * NG-036: one dock area of a window as tab URIs. A tab area keeps its tab
 * order and its current tab; a split keeps its orientation and the children's
 * relative sizes.
 */
export type SetupDockNode =
    | { type: 'tabs'; tabs: string[]; current: string | null }
    | { type: 'split'; orientation: 'horizontal' | 'vertical'; sizes: number[]; children: SetupDockNode[] };

/** NG-036: where each tab of a window is docked -- the main area's split tree and the bottom panel's. */
export interface SetupDock {
    main: SetupDockNode | null;
    bottom: SetupDockNode | null;
}

/** NG-036: the deepest split nesting a stored tree is read to; a deeper subtree is dropped. */
const SETUP_DOCK_MAX_DEPTH = 8;

export interface SetupWindowSnapshot {
    x: number;
    y: number;
    width: number;
    height: number;
    tabs: string[];
    activeTab: string | null;
    /** NG-036: the mode this window was in; null for a dependent, which hosts tab content only and has no mode. */
    modeId: string | null;
    /** NG-036: the dock layout; absent on rows written before it, which restore from `tabs`. */
    dock?: SetupDock;
}

export interface SetupSnapshot {
    name: string;
    modeId: string;
    windows: SetupWindowSnapshot[];
    savedAt: string;
}

export interface SetupStoreShape {
    version: number;
    setups: SetupSnapshot[];
    lastSession: string | null;
}

/** Contracted save-dialog title (14-UI-SPEC.md, verbatim). */
export const SETUP_DIALOG_TITLE = 'Save Setup';

/** Contracted save-dialog name placeholder (14-UI-SPEC.md, verbatim). */
export const SETUP_NAME_PLACEHOLDER = 'Setup name';

/** Contracted empty-name error (14-UI-SPEC.md, verbatim): writes nothing. */
export const SETUP_EMPTY_NAME_ERROR = 'Give the setup a name — type a name and choose Save Setup.';

/** Contracted duplicate-name error (14-UI-SPEC.md, verbatim): no overwrite offer. */
export const SETUP_DUPLICATE_NAME_ERROR = 'A setup with this name already exists. Choose a different name, or delete the existing setup first.';

/** Contracted empty-list heading (14-UI-SPEC.md, verbatim). */
export const SETUPS_EMPTY_HEADING = 'No saved setups';

/** Contracted empty-list body (14-UI-SPEC.md, verbatim). */
export const SETUPS_EMPTY_BODY = 'Save the current windows, tabs, and mode as a setup to restore them later — choose Save Setup.';

/** Contracted restore-failure error (14-UI-SPEC.md, verbatim): session untouched. */
export const SETUP_RESTORE_FAILURE = 'PowerBrowser couldn\'t restore this setup. Your current windows and tabs are unchanged — try again, or delete the setup and save a new one.';

/**
 * Contracted save-failure error (14-UI-SPEC.md, verbatim): flashes on the
 * status bar when the setups write fails during Save Setup. The saved
 * setups are left exactly as they were, so the copy says so and points at
 * Save Setup, which is on screen and re-runnable. The caught error is
 * never interpolated: it is diagnostics, not user copy.
 */
export const SETUP_SAVE_FAILURE = 'PowerBrowser couldn\'t save this setup. Your saved setups are unchanged \u2014 try again, or choose a different name.';

/**
 * Contracted delete-failure error (14-UI-SPEC.md, verbatim): flashes on the
 * status bar when the setups write fails during Delete Setup. It names the
 * delete and says the setup is still listed -- never the restore-failure
 * copy, which would tell the user to delete the setup that just failed to
 * delete. The caught error is never interpolated.
 */
export const SETUP_DELETE_FAILURE = 'PowerBrowser couldn\'t delete this setup. It\'s still in your list \u2014 try again.';

/**
 * Contracted gone-tabs variant (14-UI-SPEC.md): the restore still completes
 * on geometry plus mode with this explanation naming the dropped tabs as
 * "some tabs no longer exist" -- the row is never left half-applied with no
 * explanation.
 */
export const SETUP_GONE_TABS_NOTICE = 'PowerBrowser restored this setup, but some tabs no longer exist. Geometry and mode are applied.';

/**
 * Contracted dependent-window refusal (14-UI-SPEC.md, verbatim): thrown when
 * the current tab hosts no extractable content, so there is nothing a
 * dependent window could show. It names no command id. NG-031 gave the
 * command a palette label and a menu entry, which 14-UI-SPEC.md:233 says
 * makes a retry clause true again; the string is left as contracted until
 * the spec row and this constant change together (questions-wave-c.md Q6).
 */
export const SETUP_DEPENDENT_UNSUPPORTED = 'PowerBrowser can\'t open this tab in its own window. Select a terminal or editor tab first.';

/**
 * Contracted unknown-mode fallback notice (14-UI-SPEC.md): activateMode
 * resolves unknown ids to Browsing itself; the restore pre-validates only to
 * decide whether this notice is shown.
 * The stored id is never interpolated: custom ids are internal identifiers.
 */
export const SETUP_MODE_FALLBACK_NOTICE = 'PowerBrowser restored this setup, but its saved mode is no longer available. Browsing is shown instead.';

/** Contracted saved confirmation shape: `Setup "<name>" saved.` */
export function setupSavedConfirmation(name: string): string {
    return `Setup "${name}" saved.`;
}

/** Contracted delete body shape: `Delete "<name>"? You can't undo this.` */
export function setupDeleteBody(name: string): string {
    return `Delete "${name}"? You can't undo this.`;
}

interface ParsedSetupStore {
    ok: boolean;
    setups: SetupSnapshot[];
    lastSession: string | null;
}

function isFiniteNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
}

function parseSetupDockNode(entry: unknown, depth: number): SetupDockNode | null {
    if (depth > SETUP_DOCK_MAX_DEPTH || typeof entry !== 'object' || entry === null) {
        return null;
    }
    const node = entry as Record<string, unknown>;
    if (node['type'] === 'tabs' && Array.isArray(node['tabs'])) {
        const tabs = (node['tabs'] as unknown[]).filter((tab): tab is string => typeof tab === 'string' && tab.length > 0);
        if (tabs.length === 0) {
            return null;
        }
        const current = typeof node['current'] === 'string' && tabs.includes(node['current']) ? node['current'] as string : null;
        return { type: 'tabs', tabs, current };
    }
    const orientation = node['orientation'];
    if (node['type'] === 'split' && (orientation === 'horizontal' || orientation === 'vertical')
        && Array.isArray(node['children']) && Array.isArray(node['sizes'])) {
        const sizesIn = node['sizes'] as unknown[];
        const children: SetupDockNode[] = [];
        const sizes: number[] = [];
        (node['children'] as unknown[]).forEach((child, index) => {
            const parsed = parseSetupDockNode(child, depth + 1);
            if (parsed) {
                children.push(parsed);
                const size = sizesIn[index];
                sizes.push(isFiniteNumber(size) && size > 0 ? size : 1);
            }
        });
        if (children.length === 0) {
            return null;
        }
        return children.length === 1 ? children[0] : { type: 'split', orientation, sizes, children };
    }
    return null;
}

function parseSetupDock(entry: unknown): SetupDock | undefined {
    if (typeof entry !== 'object' || entry === null) {
        return undefined;
    }
    const dock = entry as Record<string, unknown>;
    return { main: parseSetupDockNode(dock['main'], 0), bottom: parseSetupDockNode(dock['bottom'], 0) };
}

function widgetsOfArea(area: DockLayout.AreaConfig | null): Widget[] {
    if (!area) {
        return [];
    }
    return area.type === 'tab-area' ? area.widgets : area.children.flatMap(widgetsOfArea);
}

function firstTabArea(area: DockLayout.AreaConfig): DockLayout.ITabAreaConfig {
    return area.type === 'tab-area' ? area : firstTabArea(area.children[0]);
}

/**
 * Total parse of one window row: rect numbers must be finite (validated
 * before any move call, T-14-03-01); tab lists keep strings only; anything
 * else degrades the row to null (dropped, never thrown).
 */
function parseSetupWindow(entry: unknown): SetupWindowSnapshot | null {
    if (typeof entry !== 'object' || entry === null) {
        return null;
    }
    const row = entry as Record<string, unknown>;
    if (!isFiniteNumber(row['x']) || !isFiniteNumber(row['y'])
        || !isFiniteNumber(row['width']) || !isFiniteNumber(row['height'])) {
        return null;
    }
    if (!Array.isArray(row['tabs'])) {
        return null;
    }
    const tabs = row['tabs'].filter((tab): tab is string => typeof tab === 'string' && tab.length > 0);
    const activeTab = typeof row['activeTab'] === 'string' && row['activeTab'].length > 0
        ? row['activeTab'] as string
        : null;
    const modeId = typeof row['modeId'] === 'string' && row['modeId'].length > 0 ? row['modeId'] as string : null;
    const dock = parseSetupDock(row['dock']);
    return { x: row['x'], y: row['y'], width: row['width'], height: row['height'], tabs, activeTab, modeId, ...(dock ? { dock } : {}) };
}

/** Total parse of one setup row: nameless or windowless rows drop silently. */
function parseSetupRow(entry: unknown): SetupSnapshot | null {
    if (typeof entry !== 'object' || entry === null) {
        return null;
    }
    const row = entry as Record<string, unknown>;
    if (typeof row['name'] !== 'string') {
        return null;
    }
    const name = (row['name'] as string).trim().slice(0, SETUP_NAME_MAX);
    if (!name || typeof row['modeId'] !== 'string' || !Array.isArray(row['windows'])) {
        return null;
    }
    const windows: SetupWindowSnapshot[] = [];
    for (const windowEntry of row['windows'] as unknown[]) {
        const parsed = parseSetupWindow(windowEntry);
        if (parsed) {
            windows.push(parsed);
        }
    }
    if (windows.length === 0) {
        return null;
    }
    const savedAt = typeof row['savedAt'] === 'string' ? row['savedAt'] as string : new Date(0).toISOString();
    return { name, modeId: row['modeId'] as string, windows, savedAt };
}

/**
 * Total parse of the setups file: never throws, always produces a value.
 * Whole-file failure (unparseable, not an object, non-numeric version,
 * non-array setups) reports ok:false and the caller degrades to the
 * contracted empty state.
 */
function parseSetupStore(raw: string): ParsedSetupStore {
    const empty: ParsedSetupStore = { ok: false, setups: [], lastSession: null };
    let top: unknown;
    try {
        top = JSON.parse(raw);
    } catch {
        return empty;
    }
    if (typeof top !== 'object' || top === null) {
        return empty;
    }
    const record = top as Record<string, unknown>;
    if (typeof record['version'] !== 'number' || !Array.isArray(record['setups'])) {
        return empty;
    }
    const setups: SetupSnapshot[] = [];
    const seen = new Set<string>();
    for (const entry of record['setups'] as unknown[]) {
        const parsed = parseSetupRow(entry);
        if (!parsed || seen.has(parsed.name.toLowerCase())) {
            continue;
        }
        seen.add(parsed.name.toLowerCase());
        setups.push(parsed);
    }
    const lastSession = typeof record['lastSession'] === 'string' ? record['lastSession'] as string : null;
    return { ok: true, setups, lastSession };
}

/** NG-032: total parse of the saved session; anything unreadable is no session. */
function parseSessionSnapshot(entry: unknown): SessionSnapshot | undefined {
    if (typeof entry !== 'object' || entry === null) {
        return undefined;
    }
    const row = entry as Record<string, unknown>;
    if (typeof row['modeId'] !== 'string' || !Array.isArray(row['windows'])) {
        return undefined;
    }
    const windows = (row['windows'] as unknown[])
        .map(parseSetupWindow)
        .filter((win): win is SetupWindowSnapshot => win !== null);
    if (windows.length === 0) {
        return undefined;
    }
    const webTabs: SavedSessionWebTab[] = (Array.isArray(row['webTabs']) ? row['webTabs'] as unknown[] : []).flatMap(item => {
        const tab = typeof item === 'object' && item !== null ? item as Record<string, unknown> : {};
        return typeof tab['rowKey'] === 'string' && /^web:[A-Za-z0-9_-]{1,64}$/.test(tab['rowKey']) && typeof tab['url'] === 'string'
            ? [{ rowKey: tab['rowKey'], url: tab['url'], lastAccessed: isFiniteNumber(tab['lastAccessed']) ? tab['lastAccessed'] : null }]
            : [];
    });
    return { modeId: row['modeId'] as string, windows, savedAt: isFiniteNumber(row['savedAt']) ? row['savedAt'] : 0, webTabs };
}

/**
 * Reachability clamp (documented backstop, 14-RESEARCH.md Pitfall 5): the
 * contract restores verbatim, but a rect no display can contain (stored
 * display gone) is pulled into view so dependents never strand off-screen.
 * A fully reachable rect passes through untouched.
 */
export function clampRectForDisplay(rect: { x: number; y: number; width: number; height: number }): { x: number; y: number; width: number; height: number } {
    const availWidth = window.screen?.availWidth ?? 1280;
    const availHeight = window.screen?.availHeight ?? 800;
    const width = Math.min(Math.max(Math.round(rect.width), 200), Math.max(availWidth, 200));
    const height = Math.min(Math.max(Math.round(rect.height), 150), Math.max(availHeight, 150));
    let x = Math.round(rect.x);
    let y = Math.round(rect.y);
    if (!Number.isFinite(x) || x + width < 100 || x > availWidth - 100) {
        x = Math.max(0, Math.min(100, availWidth - width));
    }
    if (!Number.isFinite(y) || y + height < 50 || y > availHeight - 50) {
        y = Math.max(0, Math.min(80, availHeight - height));
    }
    return { x, y, width, height };
}

/** Row meta contract: "{Mode} · {N} window(s) · {M} tab(s)", singular/plural exact. */
export function setupRowMeta(modeLabel: string, windows: number, tabs: number): string {
    const windowWord = windows === 1 ? 'window' : 'windows';
    const tabWord = tabs === 1 ? 'tab' : 'tabs';
    return `${modeLabel} · ${windows} ${windowWord} · ${tabs} ${tabWord}`;
}

@injectable()
export class SetupsService implements FrontendApplicationContribution {

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    @inject(PerspectiveService)
    protected readonly perspectives: PerspectiveService;

    @inject(ModeService)
    protected readonly modes: ModeService;

    @inject(OpenerService)
    protected readonly opener: OpenerService;

    @inject(TabUriRegistry)
    protected readonly tabUris: TabUriRegistry;

    @inject(SecondaryWindowHandler)
    protected readonly secondaryWindows: SecondaryWindowHandler;

    @inject(FrontendApplicationStateService)
    protected readonly stateService: FrontendApplicationStateService;

    @inject(QuickInputService)
    protected readonly quickInput: QuickInputService;

    @inject(FileService)
    protected readonly fileService: FileService;

    @inject(StatusBar)
    protected readonly statusBar: StatusBar;

    @inject(ProfileStorageService)
    protected readonly profileStorage: ProfileStorageService;

    @inject(WidgetManager)
    protected readonly widgets: WidgetManager;

    /** NG-034: read by wave A's restore plan (GroupQueryService.getSettings, wave A Task 10). */
    @inject(GroupQueryService)
    protected readonly groupReader: GroupQueryService;

    /** PAN-04 (A4): a web tab of a group in its undo window never enters the session snapshot. */
    @inject(GroupModel)
    protected readonly groupModel: GroupModel;

    /** NG-034: when each web tab (by row key) was last the current main-area tab. */
    protected webTabAccess = new Map<string, number>();
    protected restoreSeq = 0;
    protected readonly lastSessionApplied = new Deferred<void>();
    /** TAB-05 (34-03): settles once the launch restore has run, restored or not; the tab strip re-pins after it. */
    readonly sessionRestored: Promise<void> = this.lastSessionApplied.promise;

    protected readonly setupsUri = UserStorageUri.resolve(SETUPS_STORE_FILENAME);
    protected readonly debouncedReload = pDebounce(() => this.reloadSetups(), 150);
    protected lastGoodSetups: SetupSnapshot[] = [];
    protected currentSetup: string | null = null;
    protected secondaryByWidget = new Map<string, Window>();

    onStart(): void {
        // Fire-and-forget: awaiting this read here re-enters the boot-chain
        // deadlock documented in the customize-css header.
        void this.loadSetups();
        // Track dependent windows for geometry snapshots (the Window rides
        // the add event; close handling lives in the dependents
        // contribution, which owns focus return and the closed state).
        this.secondaryWindows.onDidAddWidget(([widget, win]) => {
            this.secondaryByWidget.set(widget.id, win);
        });
        this.secondaryWindows.onDidRemoveWidget(([widget]) => {
            this.secondaryByWidget.delete(widget.id);
        });
        // NG-032: the quit flush (profile-storage.ts) collects every listener's
        // last writes while the backend still runs: the session snapshot, and
        // the last-session pointer, which onStop could never write (the
        // backend is stopped before the page unloads).
        this.profileStorage.onWillFlush(event => event.waitUntil(this.saveSession()));
        // NG-034: the last-accessed time wave A's restore plan ages tabs by.
        // M1: activation in any area counts (a bottom-panel tab too), as well
        // as becoming the main area's current tab.
        const recordAccess = (widget: Widget | null | undefined): void => {
            if (widget instanceof WebTabWidget) {
                this.webTabAccess.set(widget.rowKey, Date.now());
            }
        };
        this.shell.mainPanel.onDidChangeCurrent((title: Title<Widget> | undefined) => recordAccess(title?.owner));
        this.shell.onDidChangeActiveWidget(({ newValue }) => recordAccess(newValue));
        // Ready-ordered applicator: runs after core layout restore, so the
        // last-session pointer re-applies onto the restored shell with no
        // race (14-RESEARCH.md Pattern 1 ordering).
        void this.stateService.reachedState('ready').then(() => this.applyLastSession()).finally(() => this.lastSessionApplied.resolve());
        this.fileService.onDidFilesChange(event => {
            // A DELETED change is a deliberate absence: reset immediately,
            // bypassing the keep-last-good guard (same shape as customize).
            if (event.contains(this.setupsUri, FileChangeType.DELETED)) {
                this.handleStoreDeleted();
                return;
            }
            if (event.contains(this.setupsUri)) {
                void this.debouncedReload();
            }
        });
    }

    onStop(): void {
        // Auto-save the last-session pointer on shutdown so relaunch
        // restores automatically with no core-close confirmation.
        void this.persistLastSession(this.currentSetup);
    }

    /** NG-032: the unnamed session snapshot and the last-session pointer, written inside the quit flush. */
    protected async saveSession(): Promise<void> {
        const now = Date.now();
        const current = this.shell.mainPanel.currentTitle?.owner;
        // Final-review M5: collect from main and bottom -- the areas
        // snapshotWindows records in the dock -- so a web tab the dock places
        // in the bottom panel is not dropped silently at relaunch.
        const webTabs: SavedSessionWebTab[] = (['main', 'bottom'] as const)
            .flatMap(area => this.shell.getWidgets(area))
            .filter((widget): widget is WebTabWidget => widget instanceof WebTabWidget)
            // PAN-04: even if the flush commit misses its bound, a pending tab must not be revived next launch.
            .filter(tab => !this.groupModel.isClosingKey(tab.rowKey))
            .map(tab => ({ rowKey: tab.rowKey, url: tab.url, lastAccessed: tab === current ? now : this.webTabAccess.get(tab.rowKey) ?? null }));
        const session: SessionSnapshot = { modeId: this.currentModeId(), windows: this.snapshotWindows(), savedAt: now, webTabs };
        await this.profileStorage.setData(SESSION_STORAGE_KEY, session);
        await this.persistLastSession(this.currentSetup);
    }

    /**
     * NG-034: reopens one of last session's web tabs on its own tabs.sqlite row
     * (wave A: WebTabOptions.key), so the row keeps its group, place and
     * thumbnail. With `withHistory`, chrome first arms the tab's saved
     * back/forward history, which webTabOpen restores instead of loading
     * `url`. Wave A's Task 10 decides withHistory per tab (planWebTabRestore);
     * this call shape is fixed for it.
     */
    async restoreWebTab(tab: { rowKey: string; url: string; withHistory: boolean }): Promise<Widget | undefined> {
        if (tab.withHistory) {
            await this.profileStorage.armWebTabHistory(tab.rowKey);
        }
        // This session's discriminator in the id, so the web-tab factory admits it.
        const options: WebTabOptions = { id: `wt-${WEB_TAB_SESSION}-restored-${(this.restoreSeq += 1)}`, url: tab.url, key: tab.rowKey };
        try {
            const widget = await this.widgets.getOrCreateWidget<WebTabWidget>(WEB_TAB_FACTORY_ID, options);
            if (!widget.isAttached) {
                await this.shell.addWidget(widget, { area: 'main' });
            }
            return widget;
        } catch {
            return undefined;
        }
    }

    /** Save the current windows, tabs, and mode under a typed name. */
    async saveCurrentAsSetup(): Promise<void> {
        const answer = await inputCappedName(this.quickInput, { prompt: SETUP_DIALOG_TITLE, placeHolder: SETUP_NAME_PLACEHOLDER }, SETUP_NAME_MAX);
        if (answer === undefined) {
            return;
        }
        const name = answer.trim().slice(0, SETUP_NAME_MAX);
        if (!name) {
            void this.flash(SETUP_EMPTY_NAME_ERROR);
            return;
        }
        if (this.isDuplicateName(name)) {
            void this.flash(SETUP_DUPLICATE_NAME_ERROR);
            return;
        }
        const row: SetupSnapshot = {
            name,
            modeId: this.currentModeId(),
            windows: this.snapshotWindows(),
            savedAt: new Date().toISOString(),
        };
        const setups = [...this.lastGoodSetups, row];
        try {
            // One file-service write: atomic from the reader's view, never a
            // truncate-then-read-your-own-write.
            await this.fileService.write(this.setupsUri, JSON.stringify({ version: SETUPS_STORE_VERSION, setups, lastSession: name }, undefined, 2));
        } catch {
            void this.flash(SETUP_SAVE_FAILURE);
            return;
        }
        this.lastGoodSetups = setups;
        this.currentSetup = name;
        void this.flash(setupSavedConfirmation(name));
    }

    /**
     * Restore a setup by name (or pick from the list when omitted): geometry
     * verbatim with reachability clamping, tabs through the contribution
     * open path with unresolvable URIs dropped, then the stored mode.
     * Completes on geometry plus mode with the contracted variant
     * explanation when tabs are gone; on failure the session is untouched
     * with the contracted restore-failure error.
     */
    async restoreSetup(name?: string): Promise<void> {
        const target = name ?? await this.pickSetup('Restore Setup');
        if (target === undefined) {
            return;
        }
        const row = this.lastGoodSetups.find(setup => setup.name === target);
        // Validate before touching the session: a row that cannot restore
        // leaves current windows and tabs untouched.
        if (!row || row.windows.length === 0) {
            void this.flash(SETUP_RESTORE_FAILURE);
            return;
        }
        await this.applySnapshot(row, true);
        this.currentSetup = row.name;
        void this.persistLastSession(row.name);
    }

    /**
     * Geometry verbatim with reachability clamping, tabs through the placer
     * (NG-030, NG-036), then the mode through ModeService (NG-029). `notify`
     * shows the contracted gone-tabs and mode-fallback notices; the launch
     * restore of the unnamed session (NG-032) passes false -- the session
     * never shows a chosen setup's gone-tabs notice, but a mode it can no
     * longer resolve still gets the contracted fallback notice.
     *
     * NG-036: the two phases stay ordered -- geometry and tabs first so the
     * mode toggle (NG-029) still sees the live shell, then the mode, then a
     * re-assertion of the saved dock sizes. The mode switch resizes the main
     * area (its panels and furniture rules change the available space), and
     * Lumino's resize takes the pixels equally from every split child, so a
     * restore into a mode that changes the panel width would otherwise report
     * the saved relative sizes against the wrong width. Re-applying the saved
     * sizes last writes the recorded fractions against the settled geometry.
     * Modes own the side panels and furniture; setups own the main and bottom
     * dock splits, so the re-assertion cannot move a view the mode placed.
     */
    protected async applySnapshot(row: { modeId: string; windows: SetupWindowSnapshot[] }, notify: boolean, openWebTabs = true): Promise<void> {
        this.applyGeometry(row.windows[0]);
        const dropped = await this.placeTabs(row, openWebTabs);
        const modeId = row.windows[0].modeId ?? row.modeId;
        // NG-029: the mode goes through ModeService.activateMode, the path the
        // mode toggle takes (GUI-DEFECTS item 6), so the panel map, the Explorer
        // dock, the Organising slot, the furniture and the mode attribute all
        // apply. A bare switchPerspective applied the perspective and none of
        // those. activateMode resolves an unknown id to Browsing by itself;
        // `known` only chooses the contracted fallback notice below.
        const shippedKnown = SHIPPED_MODES.some(descriptor => descriptor.id === modeId);
        if (!notify && !shippedKnown) {
            // NG-032 round 1: the launch restore waits (bounded) for the
            // custom-mode load before resolving the session's mode, so a
            // custom-mode session does not fall back to Browsing merely
            // because loadCustomModes had not settled yet. The named-setup
            // path (notify=true) keeps its synchronous check.
            await this.waitForCustomModes();
        }
        const knownCustom = this.modes.getCustomModes().some(custom => custom.id === modeId);
        const known = shippedKnown || knownCustom;
        try {
            await this.modes.activateMode(known ? modeId : 'browsing');
        } catch {
            // activateMode has no rejecting path today; geometry and tabs still stand.
        }
        // The saved splits are fractions of the settled (post-mode) main area:
        // see the header note above. Re-assert them only when the same widgets
        // are still bar-for-bar where restoreDock put them; anything the mode
        // switch moved or added (a side view, a dropped tab) skips the sizes
        // while the tabs still stand. Best-effort like the geometry above: a
        // failed re-assertion leaves the placed tabs and the mode untouched.
        try {
            this.reassertDockSizes(row.windows[0].dock);
        } catch {
            // Geometry, tabs and mode still stand.
        }
        if (!notify) {
            // NG-032 round 1: a wait that timed out, or a mode that is
            // genuinely gone, falls back to Browsing with the contracted
            // notice -- never silently. Gone tabs stay silent on the
            // session path (no setup was chosen).
            if (!known) {
                void this.flash(SETUP_MODE_FALLBACK_NOTICE);
            }
            return;
        }
        // Both notices share one status-bar element, so two sequential
        // flashes would overwrite each other: when both fire, combine them
        // into a single flash built only from the two contracted literals
        // (no new user-facing copy).
        if (dropped > 0 && !known) {
            void this.flash(`${SETUP_GONE_TABS_NOTICE} ${SETUP_MODE_FALLBACK_NOTICE}`);
        } else if (dropped > 0) {
            void this.flash(SETUP_GONE_TABS_NOTICE);
        } else if (!known) {
            void this.flash(SETUP_MODE_FALLBACK_NOTICE);
        }
    }

    /**
     * NG-032 round 1: bounded wait (5 s) on the custom-mode load. Resolves
     * once the customs settle; a slow load falls through after the bound so
     * a launch never stalls on storage. Never throws.
     */
    protected async waitForCustomModes(): Promise<void> {
        try {
            await Promise.race([
                this.modes.whenCustomModesLoaded(),
                new Promise<void>(resolve => window.setTimeout(resolve, 5000)),
            ]);
        } catch {
            // whenCustomModesLoaded never rejects; a timer failure still
            // leaves the launch on the synchronous known check below.
        }
    }

    /** Delete a setup: the ONLY destructive action -- contracted confirmation, no undo. */
    async deleteSetup(): Promise<void> {
        const target = await this.pickSetup('Delete Setup');
        if (target === undefined) {
            return;
        }
        const row = this.lastGoodSetups.find(setup => setup.name === target);
        if (!row) {
            return;
        }
        // G-14.1.1-22: this is the ONLY destructive confirmation in the phase
        // (14-UI-SPEC.md:136 reserves the danger token for exactly this
        // button), so the dialog instance is tagged through the public Widget
        // addClass and the scoped rule in modes.css paints it. Same shape as
        // the Close Group precedent in organising-widget.ts: a dialog failure
        // logs and returns rather than throwing through the command.
        let confirmed: boolean | undefined = false;
        try {
            const dialog = new ConfirmDialog({
                title: 'Delete Setup',
                msg: setupDeleteBody(row.name),
                ok: 'Delete',
                cancel: 'Cancel',
            });
            dialog.addClass('pb-setup-delete-confirm');
            confirmed = await dialog.open();
        } catch (error) {
            console.error('[@powerbrowser/modes] delete-setup dialog failed:', error);
            return;
        }
        if (!confirmed) {
            return;
        }
        const setups = this.lastGoodSetups.filter(setup => setup.name !== row.name);
        try {
            await this.fileService.write(this.setupsUri, JSON.stringify({
                version: SETUPS_STORE_VERSION,
                setups,
                lastSession: this.currentSetup === row.name ? null : this.currentSetup,
            }, undefined, 2));
        } catch {
            void this.flash(SETUP_DELETE_FAILURE);
            return;
        }
        this.lastGoodSetups = setups;
        // Deleting the current setup clears the current marker while
        // changing nothing on screen.
        if (this.currentSetup === row.name) {
            this.currentSetup = null;
        }
    }

    /**
     * Open a dependent window hosting one tab-content widget through the
     * stock secondary-window handler (14-PROBE verdict GREEN). Defaults to
     * the active widget; reuses the blocked path voice with no new dialog.
     */
    async openDependent(widgetId?: string): Promise<void> {
        const widget = widgetId !== undefined ? this.findWidget(widgetId) : this.shell.activeWidget;
        if (!widget || !ExtractableWidget.is(widget)) {
            // Theia renders a thrown command error verbatim, so the message
            // is the contracted constant and nothing else -- never an id.
            throw new Error(SETUP_DEPENDENT_UNSUPPORTED);
        }
        this.secondaryWindows.moveWidgetToSecondaryWindow(widget);
    }

    /** Rows for the list surface: name over the contracted meta line, current marked. */
    listRows(): Array<{ name: string; meta: string; current: boolean }> {
        return this.lastGoodSetups.map(row => ({
            name: row.name,
            meta: setupRowMeta(this.modeLabelFor(row.modeId), row.windows.length, row.windows.reduce((total, win) => total + win.tabs.length, 0)),
            current: this.currentSetup === row.name,
        }));
    }

    /** Snapshot the core window plus tracked dependents, rects verbatim. */
    protected snapshotWindows(): SetupWindowSnapshot[] {
        const coreTabs = this.tabsOfShell();
        const active = this.shell.activeWidget?.id;
        const core: SetupWindowSnapshot = {
            x: window.screenX,
            y: window.screenY,
            width: window.outerWidth,
            height: window.outerHeight,
            tabs: coreTabs.map(entry => entry.uri),
            activeTab: coreTabs.some(entry => entry.id === active) ? (coreTabs.find(entry => entry.id === active)?.uri ?? null) : null,
            modeId: this.currentModeId(),
            dock: {
                main: this.dockNodeOf(this.shell.mainPanel.saveLayout().main),
                bottom: this.dockNodeOf(this.shell.bottomPanel.saveLayout().main),
            },
        };
        const dependents: SetupWindowSnapshot[] = [];
        for (const widget of this.secondaryWindows.widgets) {
            const win = this.secondaryByWidget.get(widget.id);
            const uri = this.tabUriOf(widget);
            dependents.push({
                x: win?.screenX ?? window.screenX,
                y: win?.screenY ?? window.screenY,
                width: win?.outerWidth ?? 800,
                height: win?.outerHeight ?? 600,
                tabs: uri !== undefined ? [uri] : [],
                activeTab: uri ?? null,
                modeId: null,
            });
        }
        return [core, ...dependents];
    }

    /**
     * NG-036: a Lumino area config as tab URIs. Web tabs keep the area's tab
     * order verbatim (the NG-036 contract, asserted per tab bar); other
     * URI-bearing tabs ride along in place (they restore with the area, never
     * duplicated). Tabs with no URI (the Organising canvas, unowned widgets)
     * are left out; empty areas and one-child splits collapse.
     */
    protected dockNodeOf(area: DockLayout.AreaConfig | null): SetupDockNode | null {
        if (!area) {
            return null;
        }
        if (area.type === 'tab-area') {
            const tabs: string[] = [];
            for (const widget of area.widgets) {
                const uri = this.tabUriOf(widget);
                if (uri !== undefined && !tabs.includes(uri)) {
                    tabs.push(uri);
                }
            }
            if (tabs.length === 0) {
                return null;
            }
            const currentWidget = area.widgets[area.currentIndex];
            const current = currentWidget ? this.tabUriOf(currentWidget) ?? null : null;
            return { type: 'tabs', tabs, current: current !== null && tabs.includes(current) ? current : null };
        }
        const children: SetupDockNode[] = [];
        const sizes: number[] = [];
        area.children.forEach((child, index) => {
            const node = this.dockNodeOf(child);
            if (node) {
                children.push(node);
                sizes.push(area.sizes[index] ?? 1);
            }
        });
        if (children.length === 0) {
            return null;
        }
        return children.length === 1 ? children[0] : { type: 'split', orientation: area.orientation, sizes, children };
    }

    /** All core-model tabs as opaque URIs (registry first, editor resource fallback), with their widgets. */
    protected tabsOfShell(): Array<{ id: string; uri: string; widget: Widget }> {
        const out: Array<{ id: string; uri: string; widget: Widget }> = [];
        for (const tabBar of this.shell.allTabBars) {
            for (const title of tabBar.titles) {
                const widget = title.owner;
                if (!widget) {
                    continue;
                }
                const uri = this.tabUriOf(widget);
                if (uri !== undefined) {
                    out.push({ id: widget.id, uri, widget });
                }
            }
        }
        return out;
    }

    /**
     * One tab's opaque identity: the registry URI where it owns the widget,
     * else the editor resource URI the opener resolves (never a widget id or
     * shell-internal key, so the bridge stays landable). Unowned widgets
     * return undefined and are skipped, never guessed.
     */
    protected tabUriOf(widget: Widget): string | undefined {
        try {
            const uri = this.tabUris.uriOf(widget);
            if (uri !== undefined) {
                return uri.toString();
            }
        } catch {
            // A throwing registry lookup falls through to the editor
            // resource-URI fallback below instead of losing the tab.
        }
        try {
            const navigable = widget as unknown as { getResourceUri?: () => { toString(): string } };
            const resource = navigable.getResourceUri?.();
            if (resource) {
                return resource.toString();
            }
        } catch {
            return undefined;
        }
        return undefined;
    }

    protected currentModeId(): string {
        try {
            return this.perspectives.getActivePerspectiveId();
        } catch {
            return 'browsing';
        }
    }

    protected modeLabelFor(modeId: string): string {
        const shipped = SHIPPED_MODES.find(descriptor => descriptor.id === modeId);
        if (shipped) {
            return shipped.label;
        }
        const custom = this.modes.getCustomModes().find(row => row.id === modeId);
        // The stored id is never shown (14-UI-SPEC.md Copywriting Contract):
        // an unknown id falls back to the shipped Browsing label, mirroring
        // the restore path's Browsing fallback.
        return custom?.name ?? 'Browsing';
    }

    protected isDuplicateName(name: string): boolean {
        const folded = name.toLowerCase();
        return this.lastGoodSetups.some(row => row.name.toLowerCase() === folded);
    }

    /** Geometry verbatim with reachability clamping (backstop, never silent stranding). */
    protected applyGeometry(rect: SetupWindowSnapshot): void {
        const clamped = clampRectForDisplay(rect);
        try {
            window.moveTo(clamped.x, clamped.y);
            window.resizeTo(clamped.width, clamped.height);
        } catch {
            // Headless and managed displays ignore placement without
            // throwing or with a denial: geometry is best-effort, the tabs
            // and mode below still apply.
        }
    }

    /**
     * NG-030: one placer per restore. A URI this restore already placed, or a
     * tab already open in the shell when it began, resolves to that widget and
     * is never opened again; only an unseen URI goes through the opener. Two
     * web tabs on one page share one registry address (docs/URI-SCHEMES.md:250-254),
     * so a setup restores that page once.
     */
    protected tabPlacer(openWebTabs = true): (tab: string) => Promise<Widget | true | null> {
        const placed = new Map<string, Widget>();
        for (const entry of this.tabsOfShell()) {
            if (!placed.has(entry.uri)) {
                placed.set(entry.uri, entry.widget);
            }
        }
        // T6-M2: a URI open only in a dependent (secondary) window never
        // appears in `allTabBars`, so seed the placer from the secondary
        // handler too, first-wins as above -- otherwise a restore would
        // reopen (duplicate) the dependent's tab instead of reusing it.
        for (const widget of this.secondaryWindows.widgets) {
            const uri = this.tabUriOf(widget);
            if (uri !== undefined && !placed.has(uri)) {
                placed.set(uri, widget);
            }
        }
        return async tab => {
            const existing = placed.get(tab);
            if (existing) {
                return existing;
            }
            // NG-034: in the session restore, web tabs come back only through
            // restoreWebTab (on their rows, per wave A's plan); a web page the
            // plan left closed must not come back through the opener instead.
            if (!openWebTabs && await this.isWebTabUri(tab)) {
                return null;
            }
            const opened = await this.openTabUri(tab);
            if (opened instanceof Widget) {
                placed.set(tab, opened);
            }
            return opened;
        };
    }

    protected async isWebTabUri(tab: string): Promise<boolean> {
        try {
            return (await this.opener.getOpener(new URI(tab))).id === WEB_TAB_OPEN_HANDLER_ID;
        } catch {
            return false;
        }
    }

    /**
     * Place every recorded tab through the placer. Returns the count of URIs
     * that no longer resolve (dropped, never forced -- T-14-03-02). Dependent
     * rows re-host through the stock handler after their tabs resolve.
     */
    protected async placeTabs(row: Pick<SetupSnapshot, 'windows'>, openWebTabs = true): Promise<number> {
        const place = this.tabPlacer(openWebTabs);
        let dropped = 0;
        const core = row.windows[0];
        if (core.dock) {
            dropped += await this.restoreDock(core.dock, place);
        } else {
            for (const tab of core.tabs) {
                if ((await place(tab)) === null) {
                    dropped += 1;
                }
            }
        }
        // NG-030: the active tab is activated, never opened a second time.
        if (core.activeTab) {
            const active = await place(core.activeTab);
            if (active instanceof Widget) {
                await this.shell.activateWidget(active.id);
            }
        }
        for (const dependent of row.windows.slice(1)) {
            const widgets: Widget[] = [];
            for (const tab of dependent.tabs) {
                const widget = await place(tab);
                if (widget === null) {
                    dropped += 1;
                } else if (widget instanceof Widget) {
                    widgets.push(widget);
                }
            }
            this.hostDependent(widgets, dependent);
        }
        return dropped;
    }

    /**
     * NG-036: rebuilds the main area's split tree and the bottom panel's from a
     * saved dock, placing every tab through `place` (so nothing already open is
     * opened again). Lumino's restoreLayout unparents every widget of a panel
     * the config leaves out, so each widget already in the panel and not placed
     * by the setup rides along in the config's first tab area: a restore never
     * closes or detaches a tab (notes/browser-window-model.md:46-49). Returns
     * the number of saved tabs that no longer open.
     */
    protected async restoreDock(dock: SetupDock, place: (tab: string) => Promise<Widget | true | null>): Promise<number> {
        let dropped = 0;
        const build = async (node: SetupDockNode | null): Promise<DockLayout.AreaConfig | null> => {
            if (!node) {
                return null;
            }
            if (node.type === 'tabs') {
                const widgets: Widget[] = [];
                for (const tab of node.tabs) {
                    const placed = await place(tab);
                    if (placed === null) {
                        dropped += 1;
                    } else if (placed instanceof Widget && !widgets.includes(placed)) {
                        widgets.push(placed);
                    }
                }
                if (widgets.length === 0) {
                    return null;
                }
                const current = node.current === null ? 0 : widgets.findIndex(widget => this.tabUriOf(widget) === node.current);
                return { type: 'tab-area', widgets, currentIndex: Math.max(0, current) };
            }
            const children: DockLayout.AreaConfig[] = [];
            const sizes: number[] = [];
            for (let index = 0; index < node.children.length; index += 1) {
                const child = await build(node.children[index]);
                if (child) {
                    children.push(child);
                    sizes.push(node.sizes[index] ?? 1);
                }
            }
            if (children.length === 0) {
                return null;
            }
            return children.length === 1 ? children[0] : { type: 'split-area', orientation: node.orientation, children, sizes };
        };
        const main = await build(dock.main);
        const bottom = await build(dock.bottom);
        const assigned = new Set<Widget>([...widgetsOfArea(main), ...widgetsOfArea(bottom)]);
        this.applyDockArea(this.shell.bottomPanel, bottom, assigned);
        this.applyDockArea(this.shell.mainPanel, main, assigned);
        return dropped;
    }

    protected applyDockArea(panel: DockPanel, area: DockLayout.AreaConfig | null, assigned: Set<Widget>): void {
        if (!area) {
            return;
        }
        const others = Array.from(panel.widgets()).filter(widget => !assigned.has(widget));
        firstTabArea(area).widgets.push(...others);
        panel.restoreLayout({ main: area });
    }

    /**
     * NG-036: re-assert the saved split sizes against the settled post-mode
     * geometry; see the applySnapshot header note. Matches only: the live
     * layout must hold the same tab areas, in the same order, with the same
     * widgets in the same order in each area. A partial match is still
     * re-asserted where it lines up (a split whose children all match keeps
     * its saved sizes; a child that drifted keeps its live size). Never moves
     * a tab, never reorders, never changes an orientation -- sizes only. A
     * no-op when the saved dock is absent (pre-wave rows restore from `tabs`),
     * when the live panel holds one bar or none, or when nothing matches.
     */
    protected reassertDockSizes(dock: SetupDock | undefined): void {
        if (!dock) {
            return;
        }
        this.reassertPanelSizes(this.shell.mainPanel, dock.main);
        this.reassertPanelSizes(this.shell.bottomPanel, dock.bottom);
    }

    protected reassertPanelSizes(panel: DockPanel, saved: SetupDockNode | null): void {
        if (!saved) {
            return;
        }
        const live = panel.saveLayout().main;
        if (!live || live.type !== 'split-area') {
            return;
        }
        const next = this.sizedArea(live, saved);
        if (next) {
            panel.restoreLayout({ main: next });
        }
    }

    /**
     * A copy of the live area with the saved sizes written back onto the
     * splits whose children still line up tab-for-tab. Returns null when no
     * saved size lines up anywhere, so the caller leaves the live layout
     * untouched; mutates nothing, the live config included (restoreLayout
     * normalises what it is given).
     */
    protected sizedArea(live: DockLayout.AreaConfig, saved: SetupDockNode): DockLayout.AreaConfig | null {
        if (live.type === 'tab-area') {
            return saved.type === 'tabs' && this.sameBar(live.widgets, saved.tabs) ? live : null;
        }
        if (saved.type !== 'split' || live.children.length !== saved.children.length
            || saved.orientation !== live.orientation) {
            return null;
        }
        let matched = false;
        const children = live.children.map((child, index) => {
            const sized = this.sizedArea(child, saved.children[index]);
            if (sized) {
                matched = true;
                return sized;
            }
            return child;
        });
        if (!matched) {
            return null;
        }
        // Lumino normalises sizes to fractions on restore (its dock sizes are
        // relative, never pixels): write the saved fractions straight back.
        // A child that drifted keeps its live size; a dropped saved size (a
        // legacy or partial row) keeps the live one.
        const liveSizes = (live as DockLayout.ISplitAreaConfig).sizes;
        const sizes = children.map((_, index) => saved.sizes[index] ?? liveSizes[index]);
        return { type: 'split-area', orientation: live.orientation, children, sizes };
    }

    /** True when the live tab area still holds exactly the saved URIs in saved order. */
    protected sameBar(widgets: Widget[], tabs: string[]): boolean {
        return widgets.length === tabs.length
            && widgets.every((widget, index) => this.tabUriOf(widget) === tabs[index]);
    }

    /** One tab through the opener: unresolvable URIs drop (null), never throw out. */
    protected async openTabUri(tab: string): Promise<Widget | true | null> {
        try {
            const opened = await open(this.opener, new URI(tab));
            if (opened instanceof Widget) {
                return opened;
            }
            // A truthy non-widget (e.g. a boolean from a delegating handler)
            // means the tab placed without a hostable widget.
            return opened ? true : null;
        } catch {
            return null;
        }
    }

    /** Re-host resolved dependents in the stock secondary window with verbatim rects. */
    protected hostDependent(widgets: Widget[], rect: SetupWindowSnapshot): void {
        const extractables = widgets.filter(ExtractableWidget.is);
        if (extractables.length === 0) {
            return;
        }
        try {
            this.secondaryWindows.moveWidgetToSecondaryWindow(extractables[0]);
            const win = extractSecondaryWindow(extractables[0]) ?? this.secondaryByWidget.get(extractables[0].id);
            for (const widget of extractables.slice(1)) {
                if (win) {
                    this.secondaryWindows.addWidgetToSecondaryWindow(widget, win);
                } else {
                    this.secondaryWindows.moveWidgetToSecondaryWindow(widget);
                }
            }
            if (win) {
                const clamped = clampRectForDisplay(rect);
                try {
                    win.moveTo(clamped.x, clamped.y);
                    win.resizeTo(clamped.width, clamped.height);
                } catch {
                    // Placement is best-effort (see applyGeometry).
                }
            }
        } catch {
            // A dependent that cannot re-host leaves its tabs in core: the
            // restore still completed on geometry plus mode above.
        }
    }

    protected findWidget(id: string): Widget | undefined {
        for (const tabBar of this.shell.allTabBars) {
            for (const title of tabBar.titles) {
                if (title.owner?.id === id) {
                    return title.owner;
                }
            }
        }
        return undefined;
    }

    /** The list surface: quick pick rows with the contracted meta line; zero setups flash the empty copy. */
    protected async pickSetup(placeHolder: string): Promise<string | undefined> {
        const rows = this.listRows();
        if (rows.length === 0) {
            void this.flash(`${SETUPS_EMPTY_HEADING} — ${SETUPS_EMPTY_BODY}`);
            return undefined;
        }
        const picked = await this.quickInput.showQuickPick(
            rows.map(row => {
                // Names are user data stored verbatim, but `$(...)` renders
                // a stock icon in labels -- neutralise the sequence for
                // display only; the stored name and row id stay exact.
                const display = row.name.replace(/\$\(/g, '(');
                return {
                    label: row.current ? `$(check) ${display}` : display,
                    description: row.meta,
                    id: row.name,
                };
            }),
            { placeholder: placeHolder }
        );
        return picked?.id;
    }

    protected async flash(text: string): Promise<void> {
        const id = 'powerbrowser.setups.notice';
        try {
            await this.statusBar.setElement(id, { text, alignment: StatusBarAlignment.RIGHT });
        } catch {
            return;
        }
        window.setTimeout(() => {
            void this.statusBar.removeElement(id).catch(() => undefined);
        }, 4000);
    }

    protected async loadSetups(): Promise<void> {
        let raw: string;
        try {
            raw = (await this.fileService.read(this.setupsUri)).value;
        } catch {
            // First-ever read: absence is the untouched default, never created.
            return;
        }
        this.applyStoreText(raw);
    }

    protected async reloadSetups(): Promise<void> {
        let raw: string;
        try {
            raw = (await this.fileService.read(this.setupsUri)).value;
        } catch {
            // A later read failure is a mid-save race: keep last good, leave
            // the session untouched.
            return;
        }
        this.applyStoreText(raw);
    }

    protected handleStoreDeleted(): void {
        this.lastGoodSetups = [];
        this.currentSetup = null;
    }

    /** Corrupt data degrades to the contracted empty state: zero rows, no marker, never a throw. */
    protected applyStoreText(raw: string): void {
        const parsed = parseSetupStore(raw);
        if (!parsed.ok) {
            this.lastGoodSetups = [];
            this.currentSetup = null;
            return;
        }
        this.lastGoodSetups = parsed.setups;
        if (this.currentSetup !== null && !parsed.setups.some(row => row.name === this.currentSetup)) {
            this.currentSetup = null;
        }
    }

    /**
     * The launch-restore entry point (ready-ordered: runs after core layout
     * restore). NG-032: the session the last quit saved comes back first,
     * with no saved setup needed; the last-session pointer then only marks
     * which named setup is current. A profile with no saved session (its first
     * launch, or a build before this one) keeps the pointer's auto-restore.
     */
    protected async applyLastSession(): Promise<void> {
        let parsed: ParsedSetupStore = { ok: false, setups: [], lastSession: null };
        try {
            parsed = parseSetupStore((await this.fileService.read(this.setupsUri)).value);
        } catch {
            // No setups.json: nothing named to restore or mark.
        }
        if (parsed.ok) {
            this.lastGoodSetups = parsed.setups;
        }
        const pointer = parsed.ok && parsed.lastSession && parsed.setups.some(setup => setup.name === parsed.lastSession)
            ? parsed.lastSession
            : null;
        let saved: SessionSnapshot | undefined;
        try {
            saved = parseSessionSnapshot(await this.profileStorage.getData<unknown>(SESSION_STORAGE_KEY));
        } catch {
            // A throwing storage backend degrades to the pointer path below
            // (or a normal launch with none): a storage failure never skips
            // the saved-setup restore.
            saved = undefined;
        }
        if (saved) {
            this.currentSetup = pointer;
            for (const tab of saved.webTabs) {
                if (tab.lastAccessed !== null) {
                    this.webTabAccess.set(tab.rowKey, tab.lastAccessed);
                }
            }
            // NG-011: the launch restore reopens the last session's web tabs
            // per restore_behaviour and the age tiers. Every reopened tab
            // opens on its saved row (restoreWebTab's rowKey), with its
            // history only when the plan asks.
            const settings = (await this.groupReader.getSettings().catch(() => ({} as Record<string, string>))) ?? {};
            const plan = planWebTabRestore(settings, saved.webTabs.map(tab => ({ key: tab.rowKey, url: tab.url, lastAccessed: tab.lastAccessed ?? null })), saved.savedAt);
            for (const tab of plan) {
                await this.restoreWebTab({ rowKey: tab.key, url: tab.url, withHistory: tab.withHistory });
            }
            await this.applySnapshot(saved, false, false);
            return;
        }
        if (pointer) {
            await this.restoreSetup(pointer);
        }
    }

    protected async persistLastSession(name: string | null): Promise<void> {
        let setups = this.lastGoodSetups;
        try {
            const raw = (await this.fileService.read(this.setupsUri)).value;
            const parsed = parseSetupStore(raw);
            if (parsed.ok) {
                setups = parsed.setups;
                this.lastGoodSetups = parsed.setups;
            }
        } catch {
            if (name === null) {
                return;
            }
        }
        try {
            await this.fileService.write(this.setupsUri, JSON.stringify({ version: SETUPS_STORE_VERSION, setups, lastSession: name }, undefined, 2));
        } catch {
            return;
        }
    }
}
