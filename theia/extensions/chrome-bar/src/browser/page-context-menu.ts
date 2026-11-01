/**
 * PROMPT-04 (35-03, D-02, D-09): the page context menu, rendered by Theia.
 *
 * Chrome captures ContextMenuParent's data through the shell's shim, builds the
 * rows from it with Firefox's ids and strings, and pushes them as
 * `pageContextMenu`. This contribution renders them as a stock `.lm-Menu` at
 * the pointer (the openHistoryMenu pattern; `.lm-Menu` is in the overlay's
 * blocking-layer selector, so the page hides while it is open). Rows have no
 * command id (D-09): each one's `run` sends `webTabContextMenuAction` naming
 * the tab, chrome's menu id and the row, and nothing else. Exactly one action
 * message leaves per menu: the pick, or the dismiss when the menu closes with
 * no row run.
 */

import { inject, injectable } from '@theia/core/shared/inversify';
import { ApplicationShell, ContextMenuRenderer, FrontendApplicationContribution } from '@theia/core/lib/browser';
import { CommandMenu, CompoundMenuNode, MenuNode, MenuPath, Submenu } from '@theia/core/lib/common';
import { WebTabChannel, WebTabOpenHandler, WebTabReply, WebTabWidget } from '@powerbrowser/tab-uris/lib/browser/web-tab';
import { CHROME_BAR_COPY, appSubject } from './chrome-bar-copy';

export const PAGE_CONTEXT_MENU_PATH: MenuPath = ['powerbrowser-page-context-menu'];

/** One pushed row: chrome's label (Firefox's string), never a URL. */
interface PageMenuItem {
    id: string;
    label: string;
    enabled: boolean;
    checked?: boolean;
    group: string;
    /** The refusal row (a link the shell cannot open): disabled, labelled from CHROME_BAR_COPY here. */
    refused?: boolean;
    children?: PageMenuItem[];
}

interface FrontendRow {
    run: (widget: WebTabWidget) => unknown;
    /** Enablement from the widget's own state; chrome's `enabled` when absent. */
    enabled?: (widget: WebTabWidget) => boolean;
}

/**
 * Rows the frontend performs with the widget's existing methods, keyed by upstream id. Their keys equal the
 * `runs: "frontend"` rows of chrome's PAGE_MENU_ROWS (furniture rule 6).
 */
const FRONTEND_ROWS: Readonly<Record<string, FrontendRow>> = Object.freeze({
    'context-back': { run: widget => widget.back(), enabled: widget => widget.canGoBack },
    'context-forward': { run: widget => widget.forward(), enabled: widget => widget.canGoForward },
    'context-reload': { run: widget => widget.reload() },
    'context-stop': { run: widget => widget.stop() },
});

const sortKey = (index: number): string => String(index).padStart(3, '0');

function itemsOf(value: unknown): PageMenuItem[] {
    return Array.isArray(value)
        ? value.filter((item): item is PageMenuItem => !!item && typeof item.id === 'string' && typeof item.label === 'string')
        : [];
}

@injectable()
export class PageContextMenuContribution implements FrontendApplicationContribution {

    @inject(WebTabChannel)
    protected readonly channel: WebTabChannel;

    @inject(ContextMenuRenderer)
    protected readonly menus: ContextMenuRenderer;

    @inject(WebTabOpenHandler)
    protected readonly webTabs: WebTabOpenHandler;

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    onStart(): void {
        this.channel.onPush('pageContextMenu', detail => this.open(detail));
    }

    protected open(detail: Record<string, unknown>): void {
        const { tabId, menuId, x, y } = detail;
        if (typeof tabId !== 'string' || typeof menuId !== 'number' || typeof x !== 'number' || typeof y !== 'number') {
            return;
        }
        const widget = this.channel.widgetOf(tabId);
        // A tab this frontend no longer has gets the dismiss, never the current tab's menu.
        if (!widget) {
            void this.send(tabId, menuId, null);
            return;
        }
        let sent = false;
        const pick = (itemId: string | null): void => {
            if (!sent) {
                sent = true;
                void this.send(tabId, menuId, itemId).then(reply => this.settle(widget, itemId, reply)).catch(() => widget.focusPage());
            }
        };
        const menu: CompoundMenuNode = {
            id: 'page-context-menu',
            sortString: '0',
            children: this.groups(itemsOf(detail.items), widget, pick),
            isVisible: () => true,
            isEmpty: () => false,
        };
        this.menus.render({
            menuPath: PAGE_CONTEXT_MENU_PATH,
            menu,
            anchor: { x, y },
            context: widget.node,
            includeAnchorArg: false,
            // Deferred past the stock close: Lumino closes the menu before it runs the row, so a row's
            // run has already marked the pick by the time this fires.
            onHide: () => setTimeout(() => {
                if (!sent) {
                    pick(null);
                }
            }),
        });
    }

    /** Consecutive items with one `group` form one Theia group, so a separator falls between groups as in Firefox. */
    protected groups(items: PageMenuItem[], widget: WebTabWidget, pick: (itemId: string | null) => void): MenuNode[] {
        const groups: { id: string; items: PageMenuItem[] }[] = [];
        for (const item of items) {
            const last = groups[groups.length - 1];
            if (last && last.id === item.group) {
                last.items.push(item);
            } else {
                groups.push({ id: item.group, items: [item] });
            }
        }
        return groups.map((group, index): CompoundMenuNode => ({
            id: `page-menu-group-${index}`,
            sortString: sortKey(index),
            children: group.items.map((item, position) => this.node(item, position, widget, pick)),
            isVisible: () => true,
            isEmpty: () => false,
        }));
    }

    protected node(item: PageMenuItem, position: number, widget: WebTabWidget, pick: (itemId: string | null) => void): MenuNode {
        if (item.children) {
            const submenu: Submenu = {
                id: item.id,
                label: item.label,
                sortString: sortKey(position),
                children: this.groups(item.children, widget, pick),
                isVisible: () => true,
                isEmpty: () => false,
            };
            return submenu;
        }
        const frontendRow = FRONTEND_ROWS[item.id];
        const enabled = !item.refused && (frontendRow?.enabled ? frontendRow.enabled(widget) : item.enabled);
        const row: CommandMenu = {
            id: item.id,
            label: item.refused ? CHROME_BAR_COPY.pageMenuRefusedLink(appSubject()) : item.label,
            sortString: sortKey(position),
            isVisible: () => true,
            isEnabled: () => enabled,
            isToggled: () => item.checked === true,
            run: async () => pick(item.id),
        };
        return row;
    }

    protected send(tabId: string, menuId: number, itemId: string | null): Promise<WebTabReply> {
        return this.channel.request({ kind: 'webTabContextMenuAction', tabId, menuId, itemId });
    }

    /**
     * After chrome answers: a frontend row runs on the widget; a grant (D-06) opens a new web tab after the
     * opener with chrome's target and grant id, activated unless chrome said background. Otherwise, and for a
     * background tab, the page gets focus back.
     */
    protected async settle(widget: WebTabWidget, itemId: string | null, reply: WebTabReply): Promise<void> {
        if (itemId !== null && reply.ok && reply.where === 'frontend') {
            FRONTEND_ROWS[itemId]?.run(widget);
        }
        if (reply.ok && reply.where === 'grant' && typeof reply.url === 'string' && typeof reply.grantId === 'string') {
            const opened = await this.webTabs.openInBackground(reply.url, widget, reply.grantId);
            if (reply.background === false) {
                await this.shell.activateWidget(opened.id);
                return;
            }
        }
        widget.focusPage();
    }
}
