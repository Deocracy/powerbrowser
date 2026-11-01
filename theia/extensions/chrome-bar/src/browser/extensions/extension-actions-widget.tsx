/**
 * Phase 38 (EXT-06, EXT-07; D-01, D-03, D-08, D-11): the extension buttons in the chrome bar row and the puzzle menu.
 *
 * Everything shown comes from chrome's extensionAction push (WebTabChannel.extensionActions): title, icon, badge,
 * enabled and pinned are chrome-chosen for the 31.1 host's selected tab, and nothing here derives or polls them. A
 * button or menu row sends the extensionClick store kind with its anchorRect; chrome runs the click on the selected web
 * tab and opens any popup in a native XUL panel (D-02), never in Theia DOM. The privileged kinds are called only from
 * the handlers below: no command id or key row names them.
 *
 * Rendered into the chrome bar widget's row like the address pill (attach + render), between the pill and New Tab.
 */
import * as React from '@theia/core/shared/react';
import { createPortal } from '@theia/core/shared/react-dom';
import { inject, injectable } from '@theia/core/shared/inversify';
import { ApplicationShell, ContextMenuRenderer, ReactWidget } from '@theia/core/lib/browser';
import { CommandMenu, CompoundMenuNode, MenuPath } from '@theia/core/lib/common';
import { ChromeStoreClient } from '@powerbrowser/tab-uris/lib/browser/chrome-store-client';
import { ExtensionActionRow, WebTabChannel } from '@powerbrowser/tab-uris/lib/browser/web-tab';
import { CHROME_BAR_COPY, appSubject } from '../chrome-bar-copy';
import { focusAddressPill, openStockPage } from '../chrome-bar-commands';
import { DROPDOWN_MAX_HEIGHT } from '../address-bar/address-bar';
import { anchorRectOf } from './extension-popup-anchor';
import { ExtensionSidebarView } from './extension-sidebar-view';

/** One extension's menu (the gear on its puzzle row, or a right-click on its button). Built per request, never registered. */
export const EXTENSIONS_MENU_PATH: MenuPath = ['powerbrowser-chrome-bar-extensions'];

/** 38-UI-SPEC: pinned buttons shown inline; the rest stay in the puzzle menu. A constant this milestone. */
const MAX_INLINE = 3;
/** 38-UI-SPEC: badge text is capped at four characters. */
const BADGE_CAP = 4;

function ExtensionIcon({ row }: { row: ExtensionActionRow }): React.ReactElement {
    // An icon is a data:image/ URL chrome read, shown only through <img src>: SVG text is never inlined.
    if (row.icon) {
        return <img className='pb-ext-icon' src={row.icon} alt='' />;
    }
    return <span className='pb-ext-icon codicon codicon-extensions' />;
}

/** 38-04 (B5): a button's tooltip, which names the shortcut bound to its action. */
function tooltipOf(row: ExtensionActionRow): string {
    return row.shortcut ? CHROME_BAR_COPY.extensionWithShortcut(row.title, row.shortcut) : row.title;
}

function ExtensionBadge({ row }: { row: ExtensionActionRow }): React.ReactElement | null {
    // An empty badge renders nothing, not an empty pill.
    return row.badgeText ? <span className='pb-ext-badge'>{row.badgeText.slice(0, BADGE_CAP)}</span> : null;
}

interface ExtensionsMenuProps {
    rows: ExtensionActionRow[];
    /** A failure sentence shown above the rows (copy only, never an id). */
    notice: string | undefined;
    /** D-08: the extension the Remove confirm row asks about, while it is showing. */
    confirm: ExtensionActionRow | undefined;
    onRemove: (row: ExtensionActionRow) => void;
    onCancelRemove: () => void;
    top: number;
    right: number;
    puzzle: HTMLButtonElement | null;
    onRun: (row: ExtensionActionRow) => void;
    onRowMenu: (row: ExtensionActionRow, anchor: HTMLElement) => void;
    onInstall: () => void;
    onClose: (restoreFocus: boolean) => void;
}

/**
 * The puzzle menu, a `.pb-chrome-bar-dropdown` portal anchored under the puzzle button (the Clear History picker's
 * pattern). Esc closes it with focus back on the puzzle button; focus leaving it closes it where focus went.
 */
function ExtensionsMenu(props: ExtensionsMenuProps): React.ReactElement {
    const { rows, notice, confirm, top, right, puzzle, onRun, onRowMenu, onInstall, onClose } = props;
    const panelRef = React.useRef<HTMLDivElement>(null);
    React.useEffect(() => {
        panelRef.current?.focus();
    }, []);
    const row = (r: ExtensionActionRow): React.ReactNode => <div key={r.extensionId} className='pb-ext-row' data-extension-id={r.extensionId}>
        <button type='button' className='pb-ext-row-main' aria-disabled={!r.enabled} title={r.title} onClick={() => onRun(r)}>
            <span className='pb-ext-row-icon'><ExtensionIcon row={r} /><ExtensionBadge row={r} /></span>
            <span className='pb-ext-row-text'>
                <span className='pb-ext-row-name'>{r.title}</span>
                {!r.enabled && <span className='pb-ext-row-caption'>{CHROME_BAR_COPY.extensionDisabledCaption}</span>}
            </span>
        </button>
        <button
            type='button'
            className='pb-ext-row-menu'
            aria-label={CHROME_BAR_COPY.extensionOptions(r.title)}
            title={CHROME_BAR_COPY.extensionOptions(r.title)}
            aria-haspopup='menu'
            onClick={e => onRowMenu(r, e.currentTarget)}
        >
            <span className='codicon codicon-gear' />
        </button>
    </div>;
    const pinned = rows.filter(r => r.pinned);
    const others = rows.filter(r => !r.pinned);
    let body: React.ReactNode;
    if (confirm) {
        body = <>
            <div className='pb-ext-menu-heading'>{CHROME_BAR_COPY.removeExtensionHeading(confirm.title)}</div>
            <div className='pb-ext-menu-body'>{CHROME_BAR_COPY.removeExtensionBody}</div>
            <div className='pb-ext-confirm-footer'>
                <button type='button' className='pb-ext-confirm-remove' onClick={() => props.onRemove(confirm)}>{CHROME_BAR_COPY.removeExtensionConfirm}</button>
                <button type='button' className='pb-ext-confirm-cancel' onClick={props.onCancelRemove}>{CHROME_BAR_COPY.removeExtensionCancel}</button>
            </div>
        </>;
    } else if (rows.length === 0) {
        body = <>
            <div className='pb-ext-menu-heading'>{CHROME_BAR_COPY.extensionsEmptyHeading}</div>
            <div className='pb-ext-menu-body'>{CHROME_BAR_COPY.extensionsEmptyBody(appSubject())}</div>
            <div className='pb-ext-menu-separator' />
            <button type='button' className='pb-ext-menu-footer' onClick={onInstall}>{CHROME_BAR_COPY.extensionsInstallFooter}</button>
        </>;
    } else if (rows.length === 1) {
        body = row(rows[0]);
    } else {
        body = <>
            {pinned.length !== 0 && <div className='pb-ext-menu-heading'>{CHROME_BAR_COPY.extensionsPinnedHeading}</div>}
            {pinned.map(row)}
            {pinned.length !== 0 && others.length !== 0 && <div className='pb-ext-menu-separator' />}
            {others.length !== 0 && <div className='pb-ext-menu-heading'>{CHROME_BAR_COPY.extensionsHeading}</div>}
            {others.map(row)}
        </>;
    }
    return createPortal(
        <div
            ref={panelRef}
            className='pb-chrome-bar-dropdown pb-ext-menu'
            role='dialog'
            aria-label={CHROME_BAR_COPY.extensionsButton}
            tabIndex={-1}
            style={{ position: 'fixed', top, right, maxHeight: Math.max(0, Math.min(DROPDOWN_MAX_HEIGHT, window.innerHeight - top - 8)) }}
            onKeyDown={e => {
                if (e.key === 'Escape') {
                    e.stopPropagation();
                    e.preventDefault();
                    onClose(true);
                }
            }}
            onBlur={e => {
                const to = e.relatedTarget as Node | null;
                // A click on the puzzle button toggles the menu itself.
                if (!e.currentTarget.contains(to) && !(puzzle && to && puzzle.contains(to))) {
                    onClose(false);
                }
            }}
        >
            {notice && <div className='pb-ext-menu-notice' role='alert'>{notice}</div>}
            {body}
        </div>,
        document.body
    );
}

@injectable()
export class ExtensionActionsWidget {

    @inject(WebTabChannel)
    protected readonly webTabs: WebTabChannel;

    @inject(ChromeStoreClient)
    protected readonly store: ChromeStoreClient;

    @inject(ContextMenuRenderer)
    protected readonly menus: ContextMenuRenderer;

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    /** The bar widget this renders into; its update() repaints the buttons. */
    protected host: ReactWidget | undefined;
    protected rows: ExtensionActionRow[] = [];
    /** Whether the puzzle menu is open. */
    protected menuOpen = false;
    /** The last bridge failure, shown at the top of the puzzle menu until the next request succeeds. */
    protected notice: string | undefined;
    /** D-08: the extension whose Remove is waiting for the confirm row. */
    protected confirm: ExtensionActionRow | undefined;
    protected puzzle: HTMLButtonElement | null = null;
    /** Phase 38 plan 04 (B5): the side-panel view the open extension sidebar shows in, made on first use. */
    protected sidebar: ExtensionSidebarView | undefined;
    /** Stable, so React calls it only on mount and unmount. */
    protected puzzleRef = (el: HTMLButtonElement | null): void => {
        this.puzzle = el;
    };

    /** Called once by the host widget at construction; subscribes, so chrome re-sends the whole set (also after a reload). */
    attach(host: ReactWidget): void {
        this.host = host;
        this.rows = this.webTabs.extensionActions;
        this.webTabs.onDidChangeExtensionActions(rows => {
            // A popup closed (Esc, a click outside, page focus, a tab switch, a second click): chrome has focused this
            // frame, and focus goes back to the pill (38-UI-SPEC focus contract).
            const popupClosed = this.rows.some(row => row.popupOpen) && !rows.some(row => row.popupOpen);
            this.rows = rows;
            this.update();
            this.syncSidebar();
            if (popupClosed) {
                focusAddressPill();
            }
        });
        this.store.extensionActionsSubscribe().catch(error => this.failed('subscribe', error, false));
    }

    protected update(): void {
        this.host?.update();
    }

    /**
     * A bridge failure: logged by error name only and shown at the top of the puzzle menu. A failed click opens the menu
     * so the sentence is seen; a failed subscribe waits for the user to open it.
     */
    protected failed(what: string, error: unknown, open = true): void {
        console.error(`[@powerbrowser/chrome-bar] extension ${what} failed:`, error instanceof Error ? error.name : typeof error);
        this.notice = CHROME_BAR_COPY.extensionBridgeFailed(appSubject());
        this.menuOpen ||= open;
        this.update();
    }

    /** EXT-07: a button or puzzle row click, run by chrome on the selected web tab with the popup anchored at `anchor`. */
    protected async run(row: ExtensionActionRow, anchor: HTMLElement | null): Promise<void> {
        if (!row.enabled || !anchor) {
            return;
        }
        const anchorRect = anchorRectOf(anchor);
        this.menuOpen = false;
        this.update();
        try {
            const where = await this.store.extensionClick(row.extensionId, anchorRect, row.pageActionShown);
            this.notice = where === 'popup-failed' ? CHROME_BAR_COPY.extensionPopupFailed : undefined;
            this.menuOpen = where === 'popup-failed';
            this.update();
        } catch (error) {
            this.failed('click', error);
        }
    }

    /**
     * Phase 38 plan 04 (B5): the side-panel view follows the push. A row with sidebarOpen shows the view in the right side
     * panel, titled as chrome pushed it; none closes it. Chrome paints the page over the rect the view reports.
     */
    protected syncSidebar(): void {
        const open = this.rows.find(row => row.sidebarOpen && row.sidebarTitle !== null);
        if (!open) {
            this.sidebar?.dismiss();
            return;
        }
        if (!this.sidebar || this.sidebar.isDisposed) {
            this.sidebar = new ExtensionSidebarView(
                (extensionId, rect) => {
                    this.store.extensionSidebarGeometry(extensionId, rect).catch(error => this.failed('sidebar geometry', error, false));
                },
                extensionId => void this.setSidebar(extensionId, false),
            );
        }
        this.sidebar.showSidebar(open.extensionId, open.sidebarTitle ?? '');
        if (!this.sidebar.isAttached) {
            void this.shell.addWidget(this.sidebar, { area: 'right' }).then(() => this.shell.revealWidget(ExtensionSidebarView.ID));
        }
    }

    /** Phase 38 plan 04 (B5): Show Sidebar / Hide Sidebar; chrome opens or closes the page and the push moves the view. */
    protected async setSidebar(extensionId: string, open: boolean): Promise<void> {
        try {
            await this.store.extensionSidebar(extensionId, open);
            this.notice = undefined;
        } catch (error) {
            this.failed('sidebar', error);
        }
    }

    /** D-08: Pin to Toolbar and its undo; chrome persists the pinned set and pushes it back. */
    protected async pin(row: ExtensionActionRow): Promise<void> {
        try {
            await this.store.extensionPin(row.extensionId, !row.pinned);
            this.notice = undefined;
        } catch (error) {
            this.failed('pin', error);
        }
    }

    /** D-08: the Remove row opens the confirm row in the puzzle menu; nothing is removed until Remove is chosen there. */
    protected askRemove(row: ExtensionActionRow): void {
        this.confirm = row;
        this.menuOpen = true;
        this.update();
    }

    /** D-08: the confirm row's Remove; chrome uninstalls and the extension's shutdown pushes the set without it. */
    protected async remove(row: ExtensionActionRow): Promise<void> {
        this.confirm = undefined;
        try {
            const where = await this.store.extensionRemove(row.extensionId);
            this.notice = where === 'refused' ? CHROME_BAR_COPY.extensionRemoveRefused(row.title) : undefined;
            this.menuOpen = where === 'refused';
        } catch (error) {
            this.failed('remove', error);
            return;
        }
        this.update();
        if (!this.menuOpen) {
            this.puzzle?.focus();
        }
    }

    protected openRowMenu(row: ExtensionActionRow, anchor: HTMLElement): void {
        const rect = anchor.getBoundingClientRect();
        const leaf = (id: string, label: string, run: () => unknown): CommandMenu => ({
            id, label, sortString: id, isVisible: () => true, isEnabled: () => true, isToggled: () => false, run: async () => { await run(); },
        } as CommandMenu);
        const menu: CompoundMenuNode = {
            id: 'extension-row',
            sortString: '',
            isVisible: () => true,
            isEmpty: () => false,
            children: [
                leaf('0-pin', row.pinned ? CHROME_BAR_COPY.unpinFromToolbarRow : CHROME_BAR_COPY.pinToToolbarRow, () => this.pin(row)),
                // 38-04 (B5): only for an extension with a sidebar page.
                ...(row.sidebarTitle === null ? [] : [leaf('1-sidebar', row.sidebarOpen ? CHROME_BAR_COPY.hideSidebarRow : CHROME_BAR_COPY.showSidebarRow, () => this.setSidebar(row.extensionId, !row.sidebarOpen))]),
                leaf('2-manage', CHROME_BAR_COPY.manageExtensionRow, () => openStockPage('addons')),
                leaf('3-remove', CHROME_BAR_COPY.removeExtensionRow, () => this.askRemove(row)),
            ],
        };
        this.menus.render({ menuPath: EXTENSIONS_MENU_PATH, menu, anchor: { x: rect.left, y: rect.bottom }, context: anchor, includeAnchorArg: false });
    }

    protected closeMenu(restoreFocus: boolean): void {
        this.menuOpen = false;
        this.confirm = undefined;
        this.update();
        if (restoreFocus) {
            this.puzzle?.focus();
        }
    }

    protected onPuzzleClick = (): void => {
        this.menuOpen = !this.menuOpen;
        this.confirm = undefined;
        this.update();
    };

    protected renderButton(row: ExtensionActionRow): React.ReactNode {
        return <button
            key={row.extensionId}
            type='button'
            className={'pb-chrome-bar-button pb-ext-action' + (row.popupOpen ? ' is-open' : '')}
            data-extension-id={row.extensionId}
            aria-label={row.title}
            title={tooltipOf(row)}
            aria-disabled={!row.enabled}
            aria-pressed={row.popupOpen}
            onClick={e => void this.run(row, e.currentTarget)}
            onContextMenu={e => {
                e.preventDefault();
                this.openRowMenu(row, e.currentTarget);
            }}
        >
            <ExtensionIcon row={row} />
            <ExtensionBadge row={row} />
        </button>;
    }

    /**
     * Phase 38 plan 03 (EXT-08 SC3, B2): the page actions shown on the selected tab, as icons in the address pill's
     * leading slot. Shown exactly when chrome sent the row (pageActionShown, isShownForTab chrome-side); nothing here
     * matches a page against the extension's patterns. A click is the toolbar buttons' run.
     */
    renderPageActions(): React.ReactNode {
        return this.rows.filter(row => row.pageActionShown).map(row => <button
            key={row.extensionId}
            type='button'
            className={'pb-chrome-bar-button pb-page-action' + (row.popupOpen ? ' is-open' : '')}
            data-extension-id={row.extensionId}
            aria-label={row.title}
            title={tooltipOf(row)}
            aria-pressed={row.popupOpen}
            onClick={e => void this.run(row, e.currentTarget)}
        >
            <ExtensionIcon row={row} />
        </button>);
    }

    protected renderMenu(): React.ReactNode {
        if (!this.menuOpen || !this.puzzle) {
            return undefined;
        }
        const rect = this.puzzle.getBoundingClientRect();
        return <ExtensionsMenu
            rows={this.rows.filter(row => !row.pageActionShown)}
            notice={this.notice}
            confirm={this.confirm}
            onRemove={row => void this.remove(row)}
            onCancelRemove={() => this.closeMenu(true)}
            top={rect.bottom + 4}
            right={Math.max(0, window.innerWidth - rect.right)}
            puzzle={this.puzzle}
            onRun={row => void this.run(row, this.puzzle)}
            onRowMenu={(row, anchor) => this.openRowMenu(row, anchor)}
            onInstall={() => {
                this.closeMenu(false);
                openStockPage('addons');
            }}
            onClose={restoreFocus => this.closeMenu(restoreFocus)}
        />;
    }

    render(): React.ReactNode {
        return <div className='pb-ext-actions'>
            {this.rows.filter(row => row.pinned).slice(0, MAX_INLINE).map(row => this.renderButton(row))}
            <button
                ref={this.puzzleRef}
                type='button'
                className={'pb-chrome-bar-button pb-ext-puzzle' + (this.menuOpen ? ' is-open' : '')}
                aria-label={CHROME_BAR_COPY.extensionsButton}
                title={CHROME_BAR_COPY.extensionsButton}
                aria-haspopup='dialog'
                aria-expanded={this.menuOpen}
                onClick={this.onPuzzleClick}
            >
                <span className='codicon codicon-extensions' />
            </button>
            {this.renderMenu()}
        </div>;
    }
}
