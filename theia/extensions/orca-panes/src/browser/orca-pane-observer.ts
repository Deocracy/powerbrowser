/**
 * Phase 64 (TAB-04, TAB-06; P64-01, P64-10, P64-12, P64-13, P64-23, P64-28;
 * research A8): mirrors Orca's pane list into Lumino, read-only.
 *
 * Once the bundle is ready it adopts the OrcaPaneWidgets Theia's layout
 * restorer recreated, subscribes with subscribePanes and applies planPanes:
 * a new hosted pane becomes one widget added beside its nearest open Orca
 * neighbour (never activated), a dropped pane disposes its widget, a label
 * change retitles it, and a kind that is not hosted logs one line. Orca's
 * later layout changes are not mirrored and PB drags are never written back.
 * PB writes to Orca only the active worktree when a hosted tab activates
 * (A8, P64-23); close requests go from the widget itself (P64-11).
 *
 * Phase 65 (TAB-08; P65-18, P65-35, P65-38): planPanes is seeded with the
 * persisted name map, every mint and adoption is recorded there, and a mapped
 * pane gone from Orca becomes a tombstone. Restored widgets (Theia's layout
 * restorer's and the restore opener's) are recomputed at every list and held
 * in place until a list holds their worktree or ORCA_RESTORE_HOLD_MS has passed
 * since the first list: after a frontend reload the first list arrives empty
 * (the store has not hydrated when the bundle boots), and disposing on it
 * re-created and renumbered every hosted tab. A page tab (no Orca tab, empty
 * worktree) never sets Orca's active worktree and is never disposed from a list.
 *
 * D-36 (67-07): a re-pair within the document (Reconnect, or the automatic one
 * after a restart of Orca's server) makes Orca's store hydrate again, and its lists come
 * empty for some seconds; rehold() returns every tracked widget to the
 * restored set, so the same hold keeps each tab and its name.
 */
import { inject, injectable } from '@theia/core/shared/inversify';
import { Emitter } from '@theia/core/lib/common';
import { ApplicationShell, FrontendApplicationContribution, WidgetManager } from '@theia/core/lib/browser';
import { FrontendApplicationStateService } from '@theia/core/lib/browser/frontend-application-state';
import { ORCA_PANE_FACTORY_ID } from '@powerbrowser/tab-uris/lib/browser/orca-scheme-coverage';
import { OrcaPaneBundleApi, OrcaPaneOptions, OrcaPaneRecord } from '../common/orca-panes-protocol';
import { OrcaPaneBundle } from './orca-pane-bundle';
import { OrcaHostingStatus } from './failure/orca-hosting-status';
import { KnownPane, ORCA_PANE_ROUTES, PanePlan, keyOfOptions, planPanes } from './orca-pane-routes';
import { OrcaPaneWidget } from './orca-pane-widget';
import { OrcaPaneNameMap } from './restore/orca-pane-name-map';
import { OrcaBrowserPages } from '@powerbrowser/orca-browser/lib/browser/orca-browser-frontend-module'; // NEW (66-02)

const LOG_PREFIX = '[@powerbrowser/orca-panes]';

/** P65-35: how long after the first pane list a restored widget is held before an absent pane counts as gone. */
export const ORCA_RESTORE_HOLD_MS = 15000;

@injectable()
export class OrcaPaneObserver implements FrontendApplicationContribution {

    @inject(OrcaPaneBundle)
    protected readonly bundle: OrcaPaneBundle;

    @inject(WidgetManager)
    protected readonly widgetManager: WidgetManager;

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    @inject(FrontendApplicationStateService)
    protected readonly appState: FrontendApplicationStateService;

    @inject(OrcaPaneNameMap)
    protected readonly names: OrcaPaneNameMap;

    @inject(OrcaHostingStatus)
    protected readonly hosting: OrcaHostingStatus;

    /** Phase 66 (P66-09): the browser host's page table; a browser record resolves through it. */
    @inject(OrcaBrowserPages)
    protected readonly browserPages: OrcaBrowserPages;

    /** Phase 66: browser pages already logged as having no web tab; each is logged once. */
    protected readonly loggedUnbound = new Set<string>();

    protected readonly known = new Map<string, KnownPane>();
    protected readonly widgets = new Map<string, OrcaPaneWidget>();
    protected readonly loggedPending = new Set<string>();
    protected latest: OrcaPaneRecord[] | undefined;
    /** The newest list seen, re-applied once when the restore bound passes. */
    protected newest: OrcaPaneRecord[] | undefined;
    protected hydrated = false;
    /** Which hold the pending restore-bound timer belongs to (rehold() starts a new one). */
    protected hold = 0;
    protected loggedHold = false;
    protected applying = false;

    /** The most recently active hosted tab, for the empty pb-orca: path. */
    lastActive: OrcaPaneWidget | undefined;

    protected readonly onDidAddWidgetEmitter = new Emitter<OrcaPaneWidget>();
    readonly onDidAddWidget = this.onDidAddWidgetEmitter.event;

    onStart(): void {
        this.hosting.onWillRepair(() => this.rehold());
        this.shell.onDidChangeActiveWidget(({ newValue }) => {
            if (newValue instanceof OrcaPaneWidget && !newValue.isDisposed) {
                this.lastActive = newValue;
                const worktreeId = newValue.options.worktreeId;
                // P65-38: a page tab has no worktree; never send Orca an empty one.
                if (worktreeId) {
                    this.bundle.ready().then(api => api.setActiveWorktree(worktreeId)).catch(() => { /* logged by the bundle */ });
                }
            }
        });
        this.bundle.ready().then(api => this.start(api)).catch(() => { /* logged by the bundle */ });
    }

    /** The hosted widget a pb-orca: name addresses, if one is open. */
    widgetByName(name: string): OrcaPaneWidget | undefined {
        return [...this.widgets.values(), ...this.restoredWidgets()].find(w => w.options.name === name && !w.isDisposed);
    }

    /** D-36: before a re-pair; every tracked widget is held again as a restored one until a list holds it (P65-35). */
    rehold(): void {
        this.widgets.clear();
        this.known.clear();
        this.hydrated = false;
        this.newest = undefined;
        this.hold += 1;
    }

    /** P65-35: every live hosted widget this observer does not track yet (layout-restored or restore-opened); page widgets excluded. */
    protected restoredWidgets(): OrcaPaneWidget[] {
        const tracked = new Set(this.widgets.values());
        return (this.widgetManager.getWidgets(ORCA_PANE_FACTORY_ID) as OrcaPaneWidget[]).filter(w => !w.isDisposed && !!w.options.tabId && !tracked.has(w));
    }

    protected async start(api: OrcaPaneBundleApi): Promise<void> {
        // Restored widgets exist only once Theia has applied the stored layout (P64-28).
        await this.appState.reachedState('initialized_layout');
        api.subscribePanes(panes => {
            if (!this.newest) {
                const hold = this.hold;
                setTimeout(() => {
                    if (hold !== this.hold) {
                        return;
                    }
                    this.hydrated = true;
                    this.latest ??= this.newest;
                    this.drain();
                }, ORCA_RESTORE_HOLD_MS);
            }
            this.newest = panes;
            this.latest = panes;
            this.revealBrowserTabs(panes);
            this.drain();
        });
    }

    /** Applies the newest list, one at a time, because addWidget is asynchronous. */
    protected async drain(): Promise<void> {
        if (this.applying) {
            return;
        }
        this.applying = true;
        try {
            while (this.latest) {
                const records = this.latest;
                this.latest = undefined;
                await this.apply(records);
            }
        } catch (err) {
            console.warn(`${LOG_PREFIX} the Orca pane list was not applied: ${(err as Error)?.message ?? 'unknown error'}`);
        } finally {
            this.applying = false;
        }
    }

    protected async apply(records: OrcaPaneRecord[]): Promise<void> {
        const restored = this.restoredWidgets();
        const hydrated = this.hydrated;
        const plan: PanePlan = planPanes({
            known: this.known, restored: restored.map(w => w.options), loggedPending: this.loggedPending,
            namesByKey: await this.names.namesByKey(), reservedNames: await this.names.reservedNames(), hydrated,
        }, records);
        const byKey = new Map(records.map(r => [r.key, r]));
        if (plan.held.length && !this.loggedHold) {
            this.loggedHold = true;
            console.info(`${LOG_PREFIX} ${plan.held.length} restored Orca tab(s) wait for Orca's pane list`);
        }

        for (const kind of plan.pending) {
            this.loggedPending.add(kind);
            const route = ORCA_PANE_ROUTES[kind];
            if (route?.target === 'theia-editor') {
                continue; // N-2: @powerbrowser/orca-workspace opens these through subscribeOpenFiles; nothing here
            }
            if (route?.target === 'pb-web-tab') {
                continue; // Phase 66: revealBrowserTabs resolves these through the browser host's page table
            }
            console.info(route && 'requirement' in route
                ? `${LOG_PREFIX} Orca ${kind} panes open nothing until ${route.requirement}`
                : `${LOG_PREFIX} Orca ${kind} panes have no route`);
        }
        for (const { key, widgetId } of plan.adopt) {
            const widget = restored.find(w => w.id === widgetId);
            const record = byKey.get(key);
            if (widget && record) {
                this.track(key, widget, record);
                await this.names.record(widget.options.name, widget.options);
            }
        }
        // 64-WR-03: a terminal tab's leaf-less record became its first leaf's: same widget, same name, new pane key.
        for (const { from, to, paneKey, widgetId } of plan.rekey) {
            const widget = this.widgets.get(from) ?? restored.find(w => w.id === widgetId);
            const record = byKey.get(to);
            this.known.delete(from);
            this.widgets.delete(from);
            if (widget && record && !widget.isDisposed) {
                widget.rekey(paneKey);
                this.track(to, widget, record);
                await this.names.record(widget.options.name, widget.options); // the name follows; nothing is tombstoned
            }
        }
        for (const key of plan.dispose) {
            const tracked = this.widgets.get(key);
            const widget = tracked ?? restored.find(w => keyOfOptions(w.options) === key);
            this.known.delete(key);
            this.widgets.delete(key);
            if (!widget?.options.tabId) {
                continue; // N-2: a page widget has no Orca tab to lose
            }
            if (!tracked) {
                console.info(`${LOG_PREFIX} pb-orca:${widget.options.name} was restored, but Orca no longer has its pane; closed`);
            }
            widget.disposeFromStore();
        }
        // P65-18: a mapped pane absent from a list that holds its worktree (or any list once the bound passed) is gone.
        const listedKeys = new Set(records.map(r => r.key));
        const listedWorktrees = new Set(records.map(r => r.worktreeId));
        for (const [, entry] of await this.names.live()) {
            const key = keyOfOptions(entry);
            if (!listedKeys.has(key) && (hydrated || listedWorktrees.has(entry.worktreeId))) {
                await this.names.markGone(key);
            }
        }
        for (const { key, title } of plan.retitle) {
            const record = byKey.get(key);
            const known = this.known.get(key);
            if (known) {
                known.title = title;
            }
            this.widgets.get(key)?.setRecordTitle(title, record?.worktreeLabel ?? '');
        }
        for (const { record, name, placement } of plan.create) {
            if (ORCA_PANE_ROUTES[record.kind]?.target !== 'hosted-pane') {
                continue;
            }
            const options: OrcaPaneOptions = { name, kind: record.kind, worktreeId: record.worktreeId, tabId: record.tabId, paneKey: record.paneKey };
            const widget = await this.widgetManager.getOrCreateWidget<OrcaPaneWidget>(ORCA_PANE_FACTORY_ID, options);
            this.track(record.key, widget, record);
            await this.names.record(name, options);
            const ref = placement && [...this.widgets.values()].find(w => w.id === placement.ref && w.isAttached);
            // Never activated: an agent opening a pane must not take focus (P64-10).
            await this.shell.addWidget(widget, ref ? { area: 'main', mode: placement!.mode, ref } : { area: 'main' });
            this.onDidAddWidgetEmitter.fire(widget);
        }
    }

    /**
     * Phase 66 (P66-07, P66-09, D-01): every list's browser records against the browser host's page table, on every
     * list (not only the drained ones), so the reveal tracker sees each activation. No widget is created and no Orca
     * component is mounted; only the tabs reveal() returns are brought forward. A page with no web tab logs one line.
     * Audit fix (theia-pane-hosting-02, D-34): brought forward without focus. The store's active tab cannot tell a
     * user's selection from an agent's (browser.tabSwitch), and an agent opening or switching a pane must not take
     * focus (P64-10), so keystrokes never move into an agent-driven page on their own.
     */
    protected revealBrowserTabs(records: OrcaPaneRecord[]): void {
        const browser = records.filter(record => ORCA_PANE_ROUTES[record.kind]?.target === 'pb-web-tab');
        for (const record of browser) {
            const pageId = record.browserPageId;
            if (pageId && !this.browserPages.tabOf(pageId) && !this.loggedUnbound.has(pageId)) {
                this.loggedUnbound.add(pageId);
                console.info(`${LOG_PREFIX} an Orca browser page opens nothing until PowerBrowser's browser host creates it`);
            }
        }
        for (const widget of this.browserPages.reveal(browser)) {
            void this.shell.revealWidget(widget.id);
        }
    }

    protected track(key: string, widget: OrcaPaneWidget, record: OrcaPaneRecord): void {
        widget.setRecordTitle(record.title, record.worktreeLabel);
        this.known.set(key, { name: widget.options.name, title: record.title, widgetId: widget.id });
        this.widgets.set(key, widget);
    }
}
