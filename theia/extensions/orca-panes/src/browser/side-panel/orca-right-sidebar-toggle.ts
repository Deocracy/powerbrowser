/**
 * Orca's closed-state right-sidebar toggle in the Orca mode (debug orca-mode-fresh-profile-look, 2026-11-18,
 * defect B; checked by orca-side-panel-live clause l).
 *
 * Orca shows its RightSidebarToggle while the right sidebar is closed, at the workspace area's top right, in the
 * titlebar-high row (app-shell/AppWorkspaceShell.tsx: absolute, top 0, right of the workspace area). In
 * PowerBrowser the workspace area is Theia's main area, so the host sits at the main area's top right, in its
 * first tab row, and the main-area tab bar under it keeps the toggle's width clear so no tab or tab-bar action is
 * covered. The button is Orca's own component (bundle kind right-sidebar-toggle) and calls Orca's own
 * toggleRightSidebar; the host carries the pane scope attribute so Orca's scoped stylesheet styles it. Nothing
 * PowerBrowser-authored is rendered.
 */
import { ApplicationShell } from '@theia/core/lib/browser';
import { Disposable, DisposableCollection } from '@theia/core/lib/common/disposable';
import { OrcaSidePanelBundleApi } from './orca-side-view-widget';

const LOG_PREFIX = '[@powerbrowser/orca-panes]';
/** The bundle kind that renders Orca's RightSidebarToggle. */
export const ORCA_RIGHT_TOGGLE_KIND = 'right-sidebar-toggle';
/** The host's class; orca-side-view.css positions it. */
export const ORCA_RIGHT_TOGGLE_CLASS = 'pb-orca-right-toggle';

export class OrcaRightSidebarToggleHost implements Disposable {

    protected readonly host: HTMLElement;
    protected readonly toDispose = new DisposableCollection();
    protected unmount: (() => void) | undefined;
    /** The tab bar whose right end is kept clear, while shown. */
    protected room: HTMLElement | undefined;
    protected shown = false;

    constructor(protected readonly shell: ApplicationShell, protected readonly api: OrcaSidePanelBundleApi) {
        this.host = document.createElement('div');
        this.host.className = ORCA_RIGHT_TOGGLE_CLASS;
        this.host.setAttribute('data-pb-orca-pane', ORCA_RIGHT_TOGGLE_KIND);
        this.host.hidden = true;
        shell.mainPanel.node.appendChild(this.host);
        const relayout = (): void => this.keepRoom();
        shell.mainPanel.layoutModified.connect(relayout);
        // The button renders after the mount returns; its width is what the tab bar keeps clear.
        const resize = new ResizeObserver(relayout);
        resize.observe(this.host);
        this.toDispose.pushAll([
            Disposable.create(() => shell.mainPanel.layoutModified.disconnect(relayout)),
            Disposable.create(() => resize.disconnect()),
            Disposable.create(() => this.release()),
            Disposable.create(() => this.unmount?.()),
            Disposable.create(() => this.host.remove()),
        ]);
    }

    setShown(shown: boolean): void {
        if (shown !== this.shown) {
            this.shown = shown;
            this.host.hidden = !shown;
            if (shown && !this.unmount) {
                try {
                    if (!this.api.MOUNT_KINDS.includes(ORCA_RIGHT_TOGGLE_KIND)) {
                        throw new RangeError(ORCA_RIGHT_TOGGLE_KIND);
                    }
                    this.unmount = this.api.mountPane(this.host, { kind: ORCA_RIGHT_TOGGLE_KIND });
                } catch (err) {
                    console.warn(`${LOG_PREFIX} the Orca right-sidebar toggle did not mount: ${(err as Error)?.name ?? 'Error'}`);
                }
            }
        }
        this.keepRoom();
    }

    /** The main-area tab bar at the main area's top right keeps the toggle's width clear; every other bar is left alone. */
    protected keepRoom(): void {
        // Hidden, no bar keeps room, so the host's box is not read (layoutModified fires per frame of a split drag).
        const width = this.shown ? Math.ceil(this.host.getBoundingClientRect().width) : 0;
        const bar = width > 0 ? this.topRightBar() : undefined;
        if (bar !== this.room) {
            this.release();
            this.room = bar;
        }
        bar?.style.setProperty('padding-right', `${width}px`);
    }

    protected release(): void {
        this.room?.style.removeProperty('padding-right');
        this.room = undefined;
    }

    protected topRightBar(): HTMLElement | undefined {
        const main = this.shell.mainPanel.node.getBoundingClientRect();
        for (const bar of this.shell.mainPanel.tabBars()) {
            const box = bar.node.getBoundingClientRect();
            if (bar.isVisible && Math.abs(box.top - main.top) < 1 && Math.abs(box.right - main.right) < 1) {
                return bar.node;
            }
        }
        return undefined;
    }

    dispose(): void {
        this.toDispose.dispose();
    }
}
