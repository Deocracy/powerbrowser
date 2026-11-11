/**
 * Phase 65 (TAB-07; P65-08, P65-09, P65-26; CA-10): one part of an Orca view
 * container. Its node carries Phase 64's data-pb-orca-pane scope attribute, so
 * the scoped stylesheet applies unchanged, and it mounts its side kind from the
 * one pane bundle on first show, or on attach when attached already visible
 * (OrcaPaneWidget's 1f46dba0 rule, C64-4). The title is Orca's own (viewTitle);
 * nothing PB-authored is rendered, and a failed mount is one log line (P62-13).
 */
import * as React from '@theia/core/shared/react';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { Message } from '@theia/core/shared/@lumino/messaging';
import { ReactWidget } from '@theia/core/lib/browser/widgets/react-widget';
import { OrcaPaneBundle } from '../orca-pane-bundle';

const LOG_PREFIX = '[@powerbrowser/orca-panes]';

/**
 * C3-65: the bundle exports the side panel calls. Narrowed from the loader's
 * OrcaPaneBundleApi; orca-pane-entry's consumer clause compares these members
 * with the entry's exports on the merged tree.
 */
export interface OrcaSidePanelBundleApi {
    readonly MOUNT_KINDS: readonly string[];
    mountPane(element: HTMLElement, pick: { kind: string; worktreeId?: string; tabId?: string; paneKey?: string | null }): () => void;
    subscribeActiveView(listener: (value: { view: string; pendingCreation: boolean }) => void): () => void;
    setActiveView(view: string): void;
    subscribeActiveWorktree(listener: (worktreeId: string | null) => void): () => void;
    subscribeWorktrees(listener: (value: { worktrees: Array<{ id: string; path: string }>; folders: Array<{ id: string; path: string }> }) => void): () => void;
    subscribeOrchestrationEnabled(listener: (enabled: boolean) => void): () => void;
    setOrchestrationFocus(focus: { worktreeId: string; tabId: string; paneKey?: string } | null): void;
    viewTitle(kind: string): string;
}

/** The loader's api, narrowed to the side-panel exports (C3-65). */
export async function sidePanelApi(bundle: OrcaPaneBundle): Promise<OrcaSidePanelBundleApi> {
    return (await bundle.ready()) as unknown as OrcaSidePanelBundleApi;
}

export const OrcaSideViewOptions = Symbol('OrcaSideViewOptions');
export interface OrcaSideViewOptions {
    id: string;
    kind: string;
}

@injectable()
export class OrcaSideViewWidget extends ReactWidget {

    protected host: HTMLElement | null = null;
    protected shown = false;
    protected mounting = false;
    protected unmount: (() => void) | undefined;

    @inject(OrcaSideViewOptions)
    readonly options: OrcaSideViewOptions;

    @inject(OrcaPaneBundle)
    protected readonly bundle: OrcaPaneBundle;

    @postConstruct()
    protected init(): void {
        this.id = this.options.id;
        this.title.closable = false;
        this.node.tabIndex = -1;
        this.node.setAttribute('data-pb-orca-pane', this.options.kind);
        this.update();
        // The part header shows Orca's own title even while the part is collapsed and unmounted (P65-26).
        sidePanelApi(this.bundle).then(api => {
            const title = api.viewTitle(this.options.kind);
            if (title && !this.isDisposed) {
                this.title.label = title;
            }
        }).catch(() => { /* the bundle logged its failed step once */ });
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

    /** A part docked into an already open container gets no after-show message. */
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
        const { kind } = this.options;
        sidePanelApi(this.bundle).then(api => {
            if (this.isDisposed) {
                return;
            }
            try {
                if (!api.MOUNT_KINDS.includes(kind)) {
                    throw new RangeError(kind);
                }
                this.unmount = api.mountPane(host, { kind });
            } catch (err) {
                console.warn(`${LOG_PREFIX} the Orca ${kind} view did not mount: ${(err as Error)?.name ?? 'Error'}`);
            }
        }).catch(() => { /* the bundle logged its failed step once */ });
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
