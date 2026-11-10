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
 */
import * as React from '@theia/core/shared/react';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { Message } from '@theia/core/shared/@lumino/messaging';
import { ReactWidget } from '@theia/core/lib/browser/widgets/react-widget';
import { ContextKeyService } from '@theia/core/lib/browser/context-key-service';
import { ORCA_TERMINAL_FOCUS_KEY, OrcaPaneOptions } from '../common/orca-panes-protocol';
import { OrcaPaneBundle } from './orca-pane-bundle';
import { ORCA_PANE_WIDGET_ID_PREFIX } from './orca-pane-routes';

const LOG_PREFIX = '[@powerbrowser/orca-panes]';

export const OrcaPaneWidgetOptions = Symbol('OrcaPaneWidgetOptions');

@injectable()
export class OrcaPaneWidget extends ReactWidget {

    protected host: HTMLElement | null = null;
    protected shown = false;
    protected mounting = false;
    protected unmount: (() => void) | undefined;

    @inject(OrcaPaneWidgetOptions)
    readonly options: OrcaPaneOptions;

    @inject(OrcaPaneBundle)
    protected readonly bundle: OrcaPaneBundle;

    @inject(ContextKeyService)
    protected readonly contextKeys: ContextKeyService;

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
        this.update();
    }

    /** Title from Orca's own label; the tooltip names the worktree (P64-13). */
    setRecordTitle(title: string, worktreeLabel: string): void {
        this.title.label = title;
        this.title.caption = worktreeLabel ? `${title} (${worktreeLabel})` : title;
    }

    protected render(): React.ReactNode {
        return <div className='pb-orca-pane-host' style={{ width: '100%', height: '100%' }} ref={this.setHost} />;
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

    protected mountOnce(): void {
        if (!this.shown || !this.host || this.mounting || this.isDisposed) {
            return;
        }
        this.mounting = true;
        const host = this.host;
        const { kind, worktreeId, tabId, paneKey } = this.options;
        this.bundle.ready().then(api => {
            if (!this.isDisposed) {
                this.unmount = api.mountPane(host, { kind, worktreeId, tabId, paneKey });
            }
        }).catch(() => { /* the bundle logged its failed step once */ });
    }

    protected override onActivateRequest(msg: Message): void {
        super.onActivateRequest(msg);
        const focusable = this.host?.querySelector<HTMLElement>('textarea, input, [tabindex]:not([tabindex="-1"]), button, [contenteditable="true"]');
        (focusable ?? this.node).focus();
    }

    /** P64-11: ask Orca's own close (with its confirmation); never dispose here. */
    protected override onCloseRequest(_msg: Message): void {
        const { worktreeId, tabId, paneKey } = this.options;
        if (this.bundle.failed) {
            console.info(`${LOG_PREFIX} Orca ${this.options.kind} pane close not sent: the pane bundle did not boot`);
            return;
        }
        this.bundle.ready().then(api => api.closePane({ worktreeId, tabId, paneKey }))
            .catch(() => { /* the bundle logged its failed step once */ });
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
