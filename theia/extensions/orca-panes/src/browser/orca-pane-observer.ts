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
 */
import { inject, injectable } from '@theia/core/shared/inversify';
import { Emitter } from '@theia/core/lib/common';
import { ApplicationShell, FrontendApplicationContribution, WidgetManager } from '@theia/core/lib/browser';
import { FrontendApplicationStateService } from '@theia/core/lib/browser/frontend-application-state';
import { ORCA_PANE_FACTORY_ID } from '@powerbrowser/tab-uris/lib/browser/orca-scheme-coverage';
import { OrcaPaneBundleApi, OrcaPaneOptions, OrcaPaneRecord } from '../common/orca-panes-protocol';
import { OrcaPaneBundle } from './orca-pane-bundle';
import { KnownPane, ORCA_PANE_ROUTES, PanePlan, keyOfOptions, planPanes } from './orca-pane-routes';
import { OrcaPaneWidget } from './orca-pane-widget';

const LOG_PREFIX = '[@powerbrowser/orca-panes]';

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

    protected readonly known = new Map<string, KnownPane>();
    protected readonly widgets = new Map<string, OrcaPaneWidget>();
    protected readonly loggedPending = new Set<string>();
    protected restored: OrcaPaneWidget[] = [];
    protected latest: OrcaPaneRecord[] | undefined;
    protected applying = false;

    /** The worktree ids of the last pane list, in list order. */
    worktreeIds: string[] = [];

    /** The most recently active hosted tab, for the empty pb-orca: path. */
    lastActive: OrcaPaneWidget | undefined;

    protected readonly onDidAddWidgetEmitter = new Emitter<OrcaPaneWidget>();
    readonly onDidAddWidget = this.onDidAddWidgetEmitter.event;

    onStart(): void {
        this.shell.onDidChangeActiveWidget(({ newValue }) => {
            if (newValue instanceof OrcaPaneWidget && !newValue.isDisposed) {
                this.lastActive = newValue;
                this.bundle.ready().then(api => api.setActiveWorktree(newValue.options.worktreeId)).catch(() => { /* logged by the bundle */ });
            }
        });
        this.bundle.ready().then(api => this.start(api)).catch(() => { /* logged by the bundle */ });
    }

    /** The hosted widget a pb-orca: name addresses, if one is open. */
    widgetByName(name: string): OrcaPaneWidget | undefined {
        return [...this.widgets.values(), ...this.restored].find(w => w.options.name === name && !w.isDisposed);
    }

    protected async start(api: OrcaPaneBundleApi): Promise<void> {
        // Restored widgets exist only once Theia has applied the stored layout (P64-28).
        await this.appState.reachedState('initialized_layout');
        this.restored = (this.widgetManager.getWidgets(ORCA_PANE_FACTORY_ID) as OrcaPaneWidget[]).filter(w => !w.isDisposed);
        api.subscribePanes(panes => {
            this.latest = panes;
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
        this.worktreeIds = [...new Set(records.map(r => r.worktreeId))];
        const restoredOptions: OrcaPaneOptions[] = this.restored.map(w => w.options);
        const plan: PanePlan = planPanes({ known: this.known, restored: restoredOptions, loggedPending: this.loggedPending }, records);
        const byKey = new Map(records.map(r => [r.key, r]));

        for (const kind of plan.pending) {
            this.loggedPending.add(kind);
            const route = ORCA_PANE_ROUTES[kind];
            console.info(route?.target === 'pending'
                ? `${LOG_PREFIX} Orca ${kind} panes open nothing until ${route.requirement}`
                : `${LOG_PREFIX} Orca ${kind} panes have no route`);
        }
        for (const { key, widgetId } of plan.adopt) {
            const widget = this.restored.find(w => w.id === widgetId);
            const record = byKey.get(key);
            if (widget && record) {
                this.track(key, widget, record);
            }
        }
        for (const key of plan.dispose) {
            const widget = this.widgets.get(key) ?? this.restored.find(w => keyOfOptions(w.options) === key);
            this.known.delete(key);
            this.widgets.delete(key);
            widget?.disposeFromStore();
        }
        this.restored = [];
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
            const ref = placement && [...this.widgets.values()].find(w => w.id === placement.ref && w.isAttached);
            // Never activated: an agent opening a pane must not take focus (P64-10).
            await this.shell.addWidget(widget, ref ? { area: 'main', mode: placement!.mode, ref } : { area: 'main' });
            this.onDidAddWidgetEmitter.fire(widget);
        }
    }

    protected track(key: string, widget: OrcaPaneWidget, record: OrcaPaneRecord): void {
        widget.setRecordTitle(record.title, record.worktreeLabel);
        this.known.set(key, { name: widget.options.name, title: record.title, widgetId: widget.id });
        this.widgets.set(key, widget);
    }
}
