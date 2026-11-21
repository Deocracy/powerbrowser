/**
 * Phase 64 (TAB-04, TAB-06, TERM-01, TERM-04; P64-05, P64-11, P64-13, P64-26,
 * P64-32, P64-33; interfaces C3, C4, C7, C10): one Lumino tab per hosted Orca
 * pane (one per terminal leaf).
 *
 * The pane's own React root, on Theia's React, mounts into a host element on
 * the first show, stays mounted while hidden (chat scroll and composer state
 * survive tab and mode switches) and unmounts on dispose. A Lumino close is a
 * request to Orca's own close with Orca's own confirmation; the widget
 * disposes only when the store drops the pane (disposeFromStore). The node
 * carries the CSS scope attribute (C4). No PB-authored text is rendered: until
 * the store has the tab, Orca's own waiting state shows (P64-26).
 * Phase 65 (N-1): a tab-less page tab (page:<view>, empty tabId) takes Orca's
 * viewTitle and closes by disposing itself.
 * Phase 67 (P67-01, P67-32): while OrcaHostingStatus reports a failure class,
 * the pane root is hidden (its React root stays mounted) and the PowerBrowser
 * failure page renders in its place; Orca's own connection states inside the
 * hidden root are never revealed while the page is up.
 */
import * as React from '@theia/core/shared/react';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { Message } from '@theia/core/shared/@lumino/messaging';
import { ReactWidget } from '@theia/core/lib/browser/widgets/react-widget';
import { ContextKeyService } from '@theia/core/lib/browser/context-key-service';
import { ApplicationShell } from '@theia/core/lib/browser/shell/application-shell';
import { ORCA_TERMINAL_FOCUS_KEY, OrcaPaneActivity, OrcaPaneOptions } from '../common/orca-panes-protocol';
import { OrcaPaneBundle } from './orca-pane-bundle';
import { ORCA_PANE_WIDGET_ID_PREFIX } from './orca-pane-routes';
import { OrcaFailurePage } from './failure/orca-failure-page';
import { OrcaHostingStatus } from './failure/orca-hosting-status';

const LOG_PREFIX = '[@powerbrowser/orca-panes]';

export const OrcaPaneWidgetOptions = Symbol('OrcaPaneWidgetOptions');

@injectable()
export class OrcaPaneWidget extends ReactWidget {

    protected host: HTMLElement | null = null;
    protected shown = false;
    protected mounting = false;
    protected unmount: (() => void) | undefined;
    protected mountGeneration = 0;

    @inject(OrcaPaneWidgetOptions)
    readonly options: OrcaPaneOptions;

    @inject(OrcaPaneBundle)
    protected readonly bundle: OrcaPaneBundle;

    @inject(ContextKeyService)
    protected readonly contextKeys: ContextKeyService;

    @inject(OrcaHostingStatus)
    protected readonly hostingStatus: OrcaHostingStatus;

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    /**
     * Owner ruling 2026-11-17 ("Fix now"): Orca takes focus in this pane only while this is Theia's active widget (the user
     * activated its tab, ran a command that activates it, or clicked inside it); being shown or created never moves focus.
     */
    protected readonly activity: OrcaPaneActivity = {
        isActive: () => this.shell.activeWidget === this,
        onDidChange: listener => {
            const subscription = this.shell.onDidChangeActiveWidget(() => listener());
            return () => subscription.dispose();
        },
    };

    @postConstruct()
    protected init(): void {
        this.id = ORCA_PANE_WIDGET_ID_PREFIX + this.options.name;
        this.title.closable = true;
        this.node.tabIndex = -1;
        this.node.setAttribute('data-pb-orca-pane', this.options.kind);
        if (this.options.kind === 'terminal') {
            // C10: the passthrough rows' when clause holds only with focus inside this node.
            const scoped = this.contextKeys.createScoped(this.node);
            scoped.createKey<boolean>(ORCA_TERMINAL_FOCUS_KEY, true);
            this.toDispose.push(scoped);
        }
        this.toDispose.push(this.hostingStatus.onDidChange(() => this.update()));
        this.update();
        if (this.tabless) {
            // N-1: a page tab has no Orca tab record to retitle it; its title is Orca's own (P65-26).
            this.bundle.ready().then(api => {
                const title = (api as unknown as { viewTitle(kind: string): string }).viewTitle(this.options.kind);
                if (title && !this.isDisposed) {
                    this.setRecordTitle(title, '');
                }
            }).catch(() => { /* the bundle logged its failed step once */ });
        }
    }

    /** N-1: a page tab (page:<view>) has no Orca tab behind it. */
    get tabless(): boolean {
        return !this.options.tabId;
    }

    /** Title from Orca's own label; the tooltip names the worktree (P64-13). */
    setRecordTitle(title: string, worktreeLabel: string): void {
        this.title.label = title;
        this.title.caption = worktreeLabel ? `${title} (${worktreeLabel})` : title;
    }

    protected render(): React.ReactNode {
        const failureClass = this.hostingStatus.failureClass;
        return <React.Fragment>
            <div className='pb-orca-pane-host' style={{ width: '100%', height: '100%', display: failureClass ? 'none' : undefined }} ref={this.setHost} />
            {failureClass ? <OrcaFailurePage failureClass={failureClass} status={this.hostingStatus} /> : undefined}
        </React.Fragment>;
    }

    protected setHost = (element: HTMLDivElement | null): void => {
        this.host = element;
        this.mountOnce();
    };

    protected override onAfterShow(msg: Message): void {
        super.onAfterShow(msg);
        this.shown = true;
        this.mountOnce();
    }

    /** A widget attached where it is already visible (a new split tab bar) gets no after-show message. */
    protected override onAfterAttach(msg: Message): void {
        super.onAfterAttach(msg);
        if (this.isVisible) {
            this.shown = true;
            this.mountOnce();
        }
    }

    protected mountOnce(): void {
        if (!this.shown || !this.host || this.mounting || this.isDisposed) {
            return;
        }
        this.mounting = true;
        const host = this.host;
        const { kind, worktreeId, tabId, paneKey } = this.options;
        const generation = this.mountGeneration;
        this.bundle.ready().then(api => {
            // A rekey since this mount began (64-WR-03) mounts with the new pane key instead.
            if (!this.isDisposed && generation === this.mountGeneration) {
                this.unmount = api.mountPane(host, { kind, worktreeId, tabId, paneKey }, this.activity);
            }
        }).catch(() => { /* the bundle logged its failed step once */ });
    }

    protected override onActivateRequest(msg: Message): void {
        super.onActivateRequest(msg);
        // Rendered elements only: an isolated terminal leaf's root also holds its tab's other leaves' xterms, hidden.
        // The node, not the host: while the failure page is up its buttons are the rendered ones.
        const candidates = this.node.querySelectorAll<HTMLElement>('textarea, input, [tabindex]:not([tabindex="-1"]), button, [contenteditable="true"]');
        const focusable = Array.from(candidates).find(element => element.getClientRects().length > 0);
        (focusable ?? this.node).focus();
    }

    /**
     * P64-11: ask Orca's own close (with its confirmation); never dispose here while Orca can receive it.
     * Audit fix (64-CR-02, theia-pane-hosting-01): until the pane bundle has booted, Orca cannot receive a close (the
     * boot failed or is still waiting for orcad), so the tab closes here: only the restored record is behind it. An
     * Orca pane that does exist comes back by key on the first list after the boot (P64-28).
     */
    protected override onCloseRequest(_msg: Message): void {
        if (this.tabless) {
            this.dispose(); // no Orca tab backs a page tab, so there is no Orca close to ask
            return;
        }
        if (!this.bundle.isBooted) {
            console.info(`${LOG_PREFIX} Orca ${this.options.kind} tab closed in PowerBrowser only: the pane bundle has not booted`);
            this.dispose();
            return;
        }
        const { worktreeId, tabId, paneKey } = this.options;
        this.bundle.ready().then(api => api.closePane({ worktreeId, tabId, paneKey }))
            .catch(() => { /* the bundle logged its failed step once */ });
    }

    /**
     * 64-WR-03: the terminal tab this widget shows now has its first leaf. The widget keeps its id and name, takes the
     * leaf's pane key and remounts Orca's pane with it (at the next show when it is not shown yet).
     */
    rekey(paneKey: string): void {
        if (this.options.paneKey === paneKey) {
            return;
        }
        this.options.paneKey = paneKey;
        this.mountGeneration += 1;
        const unmount = this.unmount;
        this.unmount = undefined;
        unmount?.();
        this.mounting = false;
        this.mountOnce();
    }

    /** The store dropped this pane: dispose for real. */
    disposeFromStore(): void {
        this.dispose();
    }

    override dispose(): void {
        const unmount = this.unmount;
        this.unmount = undefined;
        try {
            unmount?.();
        } finally {
            super.dispose();
        }
    }
}
