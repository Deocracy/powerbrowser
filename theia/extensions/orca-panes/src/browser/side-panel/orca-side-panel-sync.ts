/**
 * Phase 65 (TAB-07; P65-10, P65-11, P65-12 as amended by P65-30; CA-11;
 * interfaces N-1): keeps Orca's store and the Theia shell in step for the side
 * panel.
 *
 * (a) Orca's activeView: each of the seven pages opens or focuses its singleton
 *     pb-orca:<view> tab through OpenerService; settings reveals the Settings
 *     part; terminal opens pb-orca:creating while a creation is pending and
 *     closes it when the creation clears.
 * (b) Activating a page tab writes its view back; closing the page tab whose
 *     view is the store's activeView writes 'terminal', so the next sidebar
 *     click on that page is a change and reopens it.
 * (c) A worktree selected in the hosted sidebar activates the most recently
 *     active main-area tab of that worktree (an Orca pane of it, or an editor
 *     under its path). A change to the worktree the active tab already belongs
 *     to (the value PB itself writes when an Orca tab activates, P64-23) does
 *     nothing, so the two directions never loop.
 * (d) The Agents part exists only while Orca's experimentalOrchestrationPanel
 *     setting is on.
 * (e) The focused Orca chat or terminal tab is the orchestration focus.
 * (f) (debug orca-mode-fresh-profile-look, 2026-11-18, defect B) Orca's right
 *     sidebar open flag and the Theia right panel that hosts RightSidebar are
 *     one state while the active mode docks Orca's right container on the right:
 *     Orca's close button and RightSidebarToggle (toggleRightSidebar) and its own
 *     setRightSidebarOpen(true) callers open and close the panel; the panel
 *     opened or closed from Theia (Toggle Right Panel, a tab click, a mode)
 *     writes the flag through Orca's own setRightSidebarOpen, so Orca renders
 *     its content and its close button again. While that panel is collapsed,
 *     Orca's own RightSidebarToggle shows at the main area's top right
 *     (orca-right-sidebar-toggle.ts). Each direction writes only a changed
 *     value, so the two never loop; a mode that does not dock the container
 *     (judged from the active perspective's own view placements) changes
 *     neither side.
 * PB creates no Orca pane and writes no copy; failures are log lines.
 *
 * Audit fixes: (b) also writes 'terminal' when a main-area tab that is not a page
 * activates while the store's view is a page or settings, and when the Settings
 * part collapses or the left panel shows another container or closes, so that a
 * second sidebar click on the same page or on Settings is a change and is acted
 * on (65-WR-04). The creating page exists only while a creation is pending: the
 * first report with none pending closes a restored one, and pendingCreation is
 * public so that the restore opener refuses it once the store has reported
 * (theia-pane-hosting-05).
 */
import { inject, injectable } from '@theia/core/shared/inversify';
import { Widget } from '@theia/core/shared/@lumino/widgets';
import {
    ApplicationShell, FrontendApplicationContribution, Navigatable, OpenerService, ViewContainer, WidgetManager, open
} from '@theia/core/lib/browser';
import { FrontendApplicationStateService } from '@theia/core/lib/browser/frontend-application-state';
import { PerspectiveService } from '@theia/core/lib/browser/perspective-service';
import URI from '@theia/core/lib/common/uri';
import { ORCA_PANE_FACTORY_ID } from '@powerbrowser/tab-uris/lib/browser/orca-scheme-coverage';
import { OrcaPaneBundle } from '../orca-pane-bundle';
import { OrcaPaneWidget } from '../orca-pane-widget';
import { OrcaSidePanelBundleApi, sidePanelApi } from './orca-side-view-widget';
import { OrcaRightSidebarToggleHost } from './orca-right-sidebar-toggle';
import {
    ORCA_AGENTS_PART_OPTIONS, ORCA_AGENTS_VIEW_ID, ORCA_LEFT_CONTAINER_ID, ORCA_RIGHT_CONTAINER_ID, ORCA_SETTINGS_VIEW_ID
} from './orca-side-panel-module';

const LOG_PREFIX = '[@powerbrowser/orca-panes]';

/** N-1: the seven page views, each a singleton pb-orca:<view> tab mounting page:<view>. */
export const ORCA_PAGE_VIEWS: readonly string[] = ['tasks', 'activity', 'automations', 'space', 'skills', 'artifacts', 'mobile'];
/** N-1, CA-11: the creation surface's tab, mounting page:creation while a creation is pending. */
export const ORCA_CREATING_NAME = 'creating';

/** The store view a page tab stands for: page:<view>, and page:creation for the terminal view. */
export function pageViewOf(widget: unknown): string | undefined {
    if (!(widget instanceof OrcaPaneWidget) || !widget.options.kind.startsWith('page:')) {
        return undefined;
    }
    const view = widget.options.kind.slice('page:'.length);
    return view === 'creation' ? 'terminal' : view;
}

const ORCHESTRATION_KINDS = new Set(['terminal', 'agent-session']);

/** Whether a URI's file path lies at or under a worktree's directory. */
export function isUnderPath(uri: URI, dir: string): boolean {
    if (uri.scheme !== 'file' || !dir) {
        return false;
    }
    const root = dir.replace(/\/+$/, '');
    const path = uri.path.toString();
    return path === root || path.startsWith(root + '/');
}

@injectable()
export class OrcaSidePanelSync implements FrontendApplicationContribution {

    @inject(OrcaPaneBundle)
    protected readonly bundle: OrcaPaneBundle;

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    @inject(OpenerService)
    protected readonly opener: OpenerService;

    @inject(WidgetManager)
    protected readonly widgetManager: WidgetManager;

    @inject(FrontendApplicationStateService)
    protected readonly appState: FrontendApplicationStateService;

    @inject(PerspectiveService)
    protected readonly perspectives: PerspectiveService;

    protected api: OrcaSidePanelBundleApi | undefined;
    /** (f) Orca's right-sidebar flag, as last read or written; undefined until the first read. */
    protected rightOpen: boolean | undefined;
    protected rightToggle: OrcaRightSidebarToggleHost | undefined;
    /** The store's activeView, as last reported. */
    protected activeView: string | undefined;
    protected pendingCreation = false;
    /** Whether the store has reported its view once; until then whether a creation is pending is not known. */
    protected reported = false;
    protected readonly watchedSettingsParts = new WeakSet<object>();
    protected orchestrationEnabled = false;
    protected readonly worktreePaths = new Map<string, string>();
    /** Main-area widgets, most recently active last. */
    protected recent: Widget[] = [];
    protected readonly watchedPages = new WeakSet<Widget>();

    onStart(): void {
        this.shell.onDidChangeActiveWidget(({ newValue }) => this.onActiveWidget(newValue ?? undefined));
        this.widgetManager.onDidCreateWidget(({ factoryId, widget }) => {
            if (factoryId === ORCA_PANE_FACTORY_ID) {
                this.watchPage(widget);
            } else if (factoryId === ORCA_LEFT_CONTAINER_ID) {
                this.applyAgents();
            }
        });
        sidePanelApi(this.bundle).then(api => this.start(api)).catch(() => { /* the bundle logged its failed step once */ });
    }

    protected async start(api: OrcaSidePanelBundleApi): Promise<void> {
        await this.appState.reachedState('initialized_layout');
        this.api = api;
        for (const widget of this.widgetManager.getWidgets(ORCA_PANE_FACTORY_ID)) {
            this.watchPage(widget);
        }
        try {
            api.subscribeWorktrees(({ worktrees, folders }) => {
                this.worktreePaths.clear();
                for (const { id, path } of [...folders, ...worktrees]) {
                    this.worktreePaths.set(id, path);
                }
            });
            api.subscribeActiveView(value => this.onActiveView(value));
            this.subscribeWorktreeChanges(api);
            api.subscribeOrchestrationEnabled(enabled => {
                this.orchestrationEnabled = enabled;
                this.applyAgents();
            });
        } catch (err) {
            console.warn(`${LOG_PREFIX} the Orca side panel did not subscribe to the store: ${(err as Error)?.name ?? 'Error'}`);
        }
        this.applyAgents();
        this.startRightSidebar(api);
        // 65-WR-04: the left panel showing another container, or closing, hides Settings.
        this.shell.leftPanelHandler.tabBar.currentChanged.connect(() => this.leftPanelChanged());
    }

    /** theia-pane-hosting-05: whether an Orca worktree creation is pending; undefined until the store has reported. */
    get creationPending(): boolean | undefined {
        return this.reported ? this.pendingCreation : undefined;
    }

    /** 65-WR-04: Settings is no longer shown, so the store's view goes back to terminal and the next click acts. */
    protected settingsHidden(): void {
        if (this.api && this.activeView === 'settings') {
            this.activeView = 'terminal';
            this.api.setActiveView('terminal');
        }
    }

    protected leftPanelChanged(): void {
        const current = this.shell.leftPanelHandler.tabBar.currentTitle;
        if (current?.owner.id !== ORCA_LEFT_CONTAINER_ID) {
            this.settingsHidden();
        }
    }

    // (f) Orca's right sidebar and the Theia right panel
    protected startRightSidebar(api: OrcaSidePanelBundleApi): void {
        try {
            this.rightToggle = new OrcaRightSidebarToggleHost(this.shell, api);
            const handler = this.shell.rightPanelHandler;
            // A panel opens or closes by changing its tab bar's current title (stock expand and collapse); a mode
            // switch changes the active perspective, whose placements decide whether the container belongs here.
            handler.tabBar.currentChanged.connect(() => this.rightPanelChanged());
            this.perspectives.onDidChangePerspective(() => this.rightPanelChanged());
            api.subscribeRightSidebarOpen(open => {
                if (open === null) {
                    return; // Orca has not read its saved UI yet; its default would be read as a choice
                }
                const starting = this.rightOpen === undefined;
                this.rightOpen = open;
                // The first value after hydration is the starting state, not a choice: the panel as the mode left it
                // wins (the Orca mode opens its right panel on every activation, launch included).
                if (starting) {
                    this.rightPanelChanged();
                } else {
                    this.applyRightOpen(open);
                }
            });
            this.rightPanelChanged();
        } catch (err) {
            console.warn(`${LOG_PREFIX} the Orca right sidebar did not join the right panel: ${(err as Error)?.name ?? 'Error'}`);
        }
    }

    /** Orca's right container, when the active mode docks it on the right and it is there; else undefined. */
    protected dockedRightContainer(): Widget | undefined {
        if (this.perspectives.getActivePerspective()?.viewPlacements.get(ORCA_RIGHT_CONTAINER_ID) !== 'right') {
            return undefined;
        }
        const container = this.widgetManager.tryGetWidget(ORCA_RIGHT_CONTAINER_ID);
        return container && container.isAttached && this.shell.getAreaFor(container) === 'right' ? container : undefined;
    }

    protected rightPanelOpen(): boolean {
        return this.shell.rightPanelHandler.tabBar.currentTitle !== null;
    }

    /** Theia's right panel opened or closed (or the mode changed): carry it to Orca's flag, then show or hide the toggle. */
    protected rightPanelChanged(): void {
        const docked = !!this.dockedRightContainer();
        const open = this.rightPanelOpen();
        if (docked && this.api && this.rightOpen !== undefined && open !== this.rightOpen) {
            this.rightOpen = open;
            this.api.setRightSidebarOpen(open);
        }
        this.rightToggle?.setShown(docked && !open);
    }

    /** Orca's flag changed in Orca (its close button, RightSidebarToggle, an action that reveals the sidebar). */
    protected applyRightOpen(open: boolean): void {
        if (this.dockedRightContainer()) {
            if (open && !this.rightPanelOpen()) {
                this.shell.rightPanelHandler.expand(ORCA_RIGHT_CONTAINER_ID);
            } else if (!open && this.rightPanelOpen()) {
                this.shell.collapsePanel('right').catch(() => undefined);
            }
        }
        this.rightPanelChanged();
    }

    // (a) store -> shell
    protected onActiveView({ view, pendingCreation }: { view: string; pendingCreation: boolean }): void {
        const changed = view !== this.activeView;
        const creationChanged = pendingCreation !== this.pendingCreation;
        const first = !this.reported;
        this.reported = true;
        this.activeView = view;
        this.pendingCreation = pendingCreation;
        if (view === 'terminal' && pendingCreation && (changed || creationChanged)) {
            this.openPage(ORCA_CREATING_NAME);
        }
        // theia-pane-hosting-05: the first report closes a creating tab restored with no creation pending.
        if (!pendingCreation && (creationChanged || first)) {
            this.pageWidget(ORCA_CREATING_NAME)?.close();
        }
        if (!changed) {
            return;
        }
        if (ORCA_PAGE_VIEWS.includes(view)) {
            this.openPage(view);
        } else if (view === 'settings') {
            this.revealSettings();
        }
    }

    protected openPage(name: string): void {
        open(this.opener, new URI(`pb-orca:${name}`)).catch(err =>
            console.info(`${LOG_PREFIX} the Orca ${name} page did not open: ${(err as Error)?.name ?? 'Error'}`));
    }

    protected pageWidget(name: string): OrcaPaneWidget | undefined {
        return (this.widgetManager.getWidgets(ORCA_PANE_FACTORY_ID) as OrcaPaneWidget[])
            .find(w => w.options.name === name && !w.options.tabId && !w.isDisposed);
    }

    protected async revealSettings(): Promise<void> {
        const container = await this.shell.revealWidget(ORCA_LEFT_CONTAINER_ID);
        if (container instanceof ViewContainer) {
            container.activateWidget(ORCA_SETTINGS_VIEW_ID);
            // 65-WR-04: collapsing the Settings part hides Settings.
            const settings = this.widgetManager.tryGetWidget(ORCA_SETTINGS_VIEW_ID);
            const part = settings ? container.getPartFor(settings) : undefined;
            if (part && !this.watchedSettingsParts.has(part)) {
                this.watchedSettingsParts.add(part);
                part.onCollapsed(collapsed => {
                    if (collapsed) {
                        this.settingsHidden();
                    }
                });
            }
        }
    }

    // (b) shell -> store for page tabs, and (c)'s recency list, and (e)
    protected onActiveWidget(widget: Widget | undefined): void {
        if (!widget || widget.isDisposed) {
            return;
        }
        if (this.shell.getAreaFor(widget) === 'main') {
            this.recent = [...this.recent.filter(w => w !== widget && !w.isDisposed), widget];
        }
        const view = pageViewOf(widget);
        if (view && this.api && view !== this.activeView) {
            this.activeView = view;
            this.api.setActiveView(view);
        } else if (!view && this.api && this.shell.getAreaFor(widget) === 'main'
            && (ORCA_PAGE_VIEWS.includes(this.activeView ?? '') || this.activeView === 'settings')) {
            // 65-WR-04: another main-area tab is in front, so the next click on that page (or on Settings) is a change.
            this.activeView = 'terminal';
            this.api.setActiveView('terminal');
        }
        if (widget instanceof OrcaPaneWidget && ORCHESTRATION_KINDS.has(widget.options.kind) && this.api) {
            const { worktreeId, tabId, paneKey } = widget.options;
            this.api.setOrchestrationFocus(paneKey ? { worktreeId, tabId, paneKey } : { worktreeId, tabId });
        }
    }

    protected watchPage(widget: Widget): void {
        if (!pageViewOf(widget) || this.watchedPages.has(widget)) {
            return;
        }
        this.watchedPages.add(widget);
        widget.disposed.connect(() => {
            const view = pageViewOf(widget);
            // Without this the store keeps the closed page's view and the next sidebar click on it changes nothing.
            if (this.api && view && view !== 'terminal' && view === this.activeView) {
                this.activeView = 'terminal';
                this.api.setActiveView('terminal');
            }
        });
    }

    // (c) store -> shell for the active worktree
    protected subscribeWorktreeChanges(api: OrcaSidePanelBundleApi): void {
        let primed = false;
        let last: string | null = null;
        api.subscribeActiveWorktree(worktreeId => {
            const isChange = worktreeId !== last;
            last = worktreeId;
            // The value reported while subscribing is the starting state, not a selection.
            if (primed && isChange && worktreeId) {
                this.activateWorktree(worktreeId);
            }
        });
        primed = true;
    }

    protected belongsTo(widget: Widget, worktreeId: string): boolean {
        if (widget instanceof OrcaPaneWidget) {
            return widget.options.worktreeId === worktreeId;
        }
        const path = this.worktreePaths.get(worktreeId);
        const uri = Navigatable.is(widget) ? widget.getResourceUri() : undefined;
        return !!(path && uri && isUnderPath(uri, path));
    }

    protected activateWorktree(worktreeId: string): void {
        const active = this.shell.currentWidget ?? this.shell.activeWidget;
        if (active && this.belongsTo(active, worktreeId)) {
            return; // PB's own write (P64-23) or a tab of that worktree is already in front
        }
        this.recent = this.recent.filter(w => !w.isDisposed);
        const target = [...this.recent].reverse().find(w => w.isAttached && this.belongsTo(w, worktreeId));
        if (target) {
            this.shell.activateWidget(target.id);
        }
    }

    // (d) the Agents part
    protected applyAgents(): void {
        const container = this.widgetManager.tryGetWidget<ViewContainer>(ORCA_LEFT_CONTAINER_ID);
        if (!container || container.isDisposed) {
            return;
        }
        const agents = this.widgetManager.tryGetWidget(ORCA_AGENTS_VIEW_ID);
        if (this.orchestrationEnabled) {
            if (!agents || !container.getPartFor(agents)) {
                this.widgetManager.getOrCreateWidget(ORCA_AGENTS_VIEW_ID).then(widget => {
                    if (this.orchestrationEnabled && !container.isDisposed && !container.getPartFor(widget)) {
                        container.addWidget(widget, ORCA_AGENTS_PART_OPTIONS);
                    }
                }).catch(err => console.warn(`${LOG_PREFIX} the Orca agents view was not added: ${(err as Error)?.name ?? 'Error'}`));
            }
        } else if (agents) {
            // A disabled panel is absent, as in Orca; a layout restore may have brought the part back.
            container.removeWidget(agents);
            agents.dispose();
        }
    }
}
