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
import { ContextMenuRenderer, FrontendApplicationContribution } from '@theia/core/lib/browser';
import { CommandMenu, CompoundMenuNode, MenuNode, MenuPath, Submenu } from '@theia/core/lib/common';
import { WebTabChannel, WebTabWidget } from '@powerbrowser/tab-uris/lib/browser/web-tab';

export const PAGE_CONTEXT_MENU_PATH: MenuPath = ['powerbrowser-page-context-menu'];

/** One pushed row: chrome's label (Firefox's string), never a URL. */
interface PageMenuItem {
    id: string;
    label: string;
    enabled: boolean;
    checked?: boolean;
    group: string;
    children?: PageMenuItem[];
}

/** Rows the frontend performs with the widget's own methods, keyed by upstream id (furniture rule 6). */
const FRONTEND_ROWS: Readonly<Record<string, (widget: WebTabWidget) => unknown>> = Object.freeze({});

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
                void this.send(tabId, menuId, itemId).then(reply => this.settle(widget, itemId, reply));
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
        const row: CommandMenu = {
            id: item.id,
            label: item.label,
            sortString: sortKey(position),
            isVisible: () => true,
            isEnabled: () => item.enabled,
            isToggled: () => item.checked === true,
            run: async () => pick(item.id),
        };
        return row;
    }

    protected send(tabId: string, menuId: number, itemId: string | null): ReturnType<WebTabChannel['request']> {
        return this.channel.request({ kind: 'webTabContextMenuAction', tabId, menuId, itemId });
    }

    /** After chrome answers: a frontend row runs on the widget; otherwise the page gets focus back. */
    protected settle(widget: WebTabWidget, itemId: string | null, reply: Awaited<ReturnType<WebTabChannel['request']>>): void {
        const frontendRow = itemId !== null && reply.ok && reply.where === 'frontend' ? FRONTEND_ROWS[itemId] : undefined;
        if (frontendRow) {
            frontendRow(widget);
        }
        widget.focusPage();
    }
}
