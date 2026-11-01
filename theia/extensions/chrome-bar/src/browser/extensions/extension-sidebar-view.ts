/**
 * Phase 38 plan 04 (B5, Chris 2026-10-22): the Theia side-panel view an extension's sidebar page shows in.
 *
 * The page is chrome's: a chrome-privileged panel browser painted over this node's rect, the way an overlay is painted
 * over a web tab, and never a web tab itself. This node only reports where it is and whether it can be seen; it draws
 * nothing of the extension's. Its title is the sidebar title chrome pushed. The extension buttons widget owns it: it
 * shows the view while a pushed row says its sidebar is open, and sends the store kinds this view's callbacks name.
 */
import { BaseWidget, Message, Widget } from '@theia/core/lib/browser';
import { Disposable } from '@theia/core/lib/common';
import { blockingLayerOpen, watchBlockingLayers } from '@powerbrowser/tab-uris/lib/browser/web-tab';

export interface ExtensionSidebarRect {
    x: number;
    y: number;
    w: number;
    h: number;
    visible: boolean;
}

export class ExtensionSidebarView extends BaseWidget {

    static readonly ID = 'powerbrowser.extension-sidebar';

    /** The extension whose sidebar this shows; empty once chrome closed it, so the close sends nothing back. */
    extensionId = '';
    protected raf = 0;
    protected lastSent = '';

    constructor(
        protected readonly report: (extensionId: string, rect: ExtensionSidebarRect) => void,
        protected readonly closed: (extensionId: string) => void,
    ) {
        super();
        this.id = ExtensionSidebarView.ID;
        this.title.closable = true;
        this.title.iconClass = 'codicon codicon-extensions';
        this.addClass('pb-extension-sidebar');
        this.toDispose.push(watchBlockingLayers(this));
        const onResize = (): void => this.publish();
        window.addEventListener('resize', onResize);
        this.toDispose.push(Disposable.create(() => window.removeEventListener('resize', onResize)));
    }

    /** Shows the pushed sidebar: its title, and a fresh rect for chrome even when the extension changed but the node did not. */
    showSidebar(extensionId: string, title: string): void {
        if (this.extensionId !== extensionId) {
            this.extensionId = extensionId;
            this.lastSent = '';
        }
        this.title.label = title;
        this.title.caption = title;
        this.publish();
    }

    /** Chrome closed the sidebar (Hide Sidebar, a shortcut, the extension stopping): the view closes without answering. */
    dismiss(): void {
        this.extensionId = '';
        this.close();
    }

    /** One rect per animation frame, latest wins, identical messages skipped (WebTabWidget.publish's discipline). */
    publish(): void {
        cancelAnimationFrame(this.raf);
        this.raf = requestAnimationFrame(() => {
            if (this.isDisposed || !this.extensionId) {
                return;
            }
            const r = this.node.getBoundingClientRect();
            const rect: ExtensionSidebarRect = {
                x: Math.round(r.left),
                y: Math.round(r.top),
                w: Math.round(r.width),
                h: Math.round(r.height),
                visible: this.isAttached && this.isVisible && !blockingLayerOpen(),
            };
            const key = JSON.stringify([this.extensionId, rect]);
            if (key !== this.lastSent) {
                this.lastSent = key;
                this.report(this.extensionId, rect);
            }
        });
    }

    protected override onAfterAttach(msg: Message): void {
        super.onAfterAttach(msg);
        this.publish();
    }

    protected override onBeforeDetach(msg: Message): void {
        super.onBeforeDetach(msg);
        this.publish();
    }

    protected override onAfterShow(msg: Message): void {
        super.onAfterShow(msg);
        this.publish();
    }

    protected override onAfterHide(msg: Message): void {
        super.onAfterHide(msg);
        this.publish();
    }

    protected override onResize(msg: Widget.ResizeMessage): void {
        super.onResize(msg);
        this.publish();
    }

    /** The view's own close affordance closes the sidebar in chrome too. */
    protected override onCloseRequest(msg: Message): void {
        if (this.extensionId) {
            this.closed(this.extensionId);
        }
        super.onCloseRequest(msg);
    }
}
