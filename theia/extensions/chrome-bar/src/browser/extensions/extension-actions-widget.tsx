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
import { ContextMenuRenderer, ReactWidget } from '@theia/core/lib/browser';
import { CommandMenu, CompoundMenuNode, MenuPath } from '@theia/core/lib/common';
import { ChromeStoreClient } from '@powerbrowser/tab-uris/lib/browser/chrome-store-client';
import { ExtensionActionRow, WebTabChannel } from '@powerbrowser/tab-uris/lib/browser/web-tab';
import { CHROME_BAR_COPY, appSubject } from '../chrome-bar-copy';
import { openStockPage } from '../chrome-bar-commands';
import { DROPDOWN_MAX_HEIGHT } from '../address-bar/address-bar';
import { anchorRectOf } from './extension-popup-anchor';

/** One extension's menu (the gear on its puzzle row, or a right-click on its button). Built per request, never registered. */
export const EXTENSIONS_MENU_PATH: MenuPath = ['powerbrowser-chrome-bar-extensions'];

/** 38-UI-SPEC: pinned buttons shown inline; the rest stay in the puzzle menu. A constant this milestone. */
const MAX_INLINE = 3;
/** 38-UI-SPEC: badge text is capped at four characters. */
const BADGE_CAP = 4;

function ExtensionIcon({ row }: { row: ExtensionActionRow }): React.ReactElement {
    // An icon is a data:image/ URL chrome read, shown only through <img src>: SVG text is never inlined.
    return row.icon ? <img className='pb-ext-icon' src={row.icon} alt='' /> : <span className='pb-ext-icon codicon codicon-extensions' />;
}

function ExtensionBadge({ row }: { row: ExtensionActionRow }): React.ReactElement | null {
    // An empty badge renders nothing, not an empty pill.
    return row.badgeText ? <span className='pb-ext-badge'>{row.badgeText.slice(0, BADGE_CAP)}</span> : null;
}

interface ExtensionsMenuProps {
    rows: ExtensionActionRow[];
    /** A failure sentence shown above the rows (copy only, never an id). */
    notice: string | undefined;
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
    const { rows, notice, top, right, puzzle, onRun, onRowMenu, onInstall, onClose } = props;
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
    if (rows.length === 0) {
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
            {pinned.length > 0 && <div className='pb-ext-menu-heading'>{CHROME_BAR_COPY.extensionsPinnedHeading}</div>}
            {pinned.map(row)}
            {pinned.length > 0 && others.length > 0 && <div className='pb-ext-menu-separator' />}
            {others.length > 0 && <div className='pb-ext-menu-heading'>{CHROME_BAR_COPY.extensionsHeading}</div>}
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

    /** The bar widget this renders into; its update() repaints the buttons. */
    protected host: ReactWidget | undefined;
    protected rows: ExtensionActionRow[] = [];
    /** Whether the puzzle menu is open. */
    protected menuOpen = false;
    /** The last bridge failure, shown at the top of the puzzle menu until the next request succeeds. */
    protected notice: string | undefined;
    protected puzzle: HTMLButtonElement | null = null;
    /** Stable, so React calls it only on mount and unmount. */
    protected puzzleRef = (el: HTMLButtonElement | null): void => {
        this.puzzle = el;
    };

    /** Called once by the host widget at construction; subscribes, so chrome re-sends the whole set (also after a reload). */
    attach(host: ReactWidget): void {
        this.host = host;
        this.rows = this.webTabs.extensionActions;
        this.webTabs.onDidChangeExtensionActions(rows => {
            this.rows = rows;
            this.update();
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
            await this.store.extensionClick(row.extensionId, anchorRect);
            this.notice = undefined;
        } catch (error) {
            this.failed('click', error);
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
                leaf('1-manage', CHROME_BAR_COPY.manageExtensionRow, () => openStockPage('addons')),
            ],
        };
        this.menus.render({ menuPath: EXTENSIONS_MENU_PATH, menu, anchor: { x: rect.left, y: rect.bottom }, context: anchor, includeAnchorArg: false });
    }

    protected closeMenu(restoreFocus: boolean): void {
        this.menuOpen = false;
        this.update();
        if (restoreFocus) {
            this.puzzle?.focus();
        }
    }

    protected onPuzzleClick = (): void => {
        this.menuOpen = !this.menuOpen;
        this.update();
    };

    protected renderButton(row: ExtensionActionRow): React.ReactNode {
        return <button
            key={row.extensionId}
            type='button'
            className='pb-chrome-bar-button pb-ext-action'
            data-extension-id={row.extensionId}
            aria-label={row.title}
            title={row.title}
            aria-disabled={!row.enabled}
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

    protected renderMenu(): React.ReactNode {
        if (!this.menuOpen || !this.puzzle) {
            return undefined;
        }
        const rect = this.puzzle.getBoundingClientRect();
        return <ExtensionsMenu
            rows={this.rows}
            notice={this.notice}
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
