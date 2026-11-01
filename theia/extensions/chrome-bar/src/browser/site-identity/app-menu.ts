/**
 * Phase 31 plan 04 (MENU-01, MENU-02, D-31-08): the hamburger's per-request
 * menu. The rows come from MENU_ORDER (site-identity-table.ts), filtered to
 * this phase: a MENU-03 slot (minPhase above the phase) is absent, and a row
 * whose action is not wired renders disabled with its caption, never as a dead
 * click. Separators come from the group field: each group is an unlabelled
 * CompoundMenuNode, which Theia draws with a separator on either side
 * (@theia/core browser-menu-plugin.js createItems).
 *
 * Pure and import-free on purpose, like site-identity-table.ts: the static gate
 * imports this file under Node's type stripping and checks the built structure
 * against the table. Copy and the run handler come from the caller, because the
 * copy lives in CHROME_BAR_COPY (a Theia import). Nothing here names a URL: a
 * stock page is a row's enum name, handed to the widget.
 */

/** The menu's id; the per-request render's menu path is `[APP_MENU_ID]`. */
export const APP_MENU_ID = 'powerbrowser-app-menu';

/**
 * The rows whose action this tree wires: the new-tab command, the stock pages and
 * Quit (plan 05, MENU-04: the `quitRequest` store kind), and History (Phase 33
 * plan 03, BMK-06: the widget's History submenu). Phase 33 plan 05 (MENU-03): the
 * command rows (each runs the Browser command id its Actions row runs) and the
 * Bookmarks, Zoom and More Tools submenus. The static gate derives this set from
 * chrome-bar-commands.ts, STOCK_PAGES, the client's quitRequest and the widget.
 */
export const WIRED_MENU_IDS: readonly string[] = Object.freeze([
    'new-tab', 'new-window', 'bookmarks', 'history', 'downloads', 'print', 'save-page', 'find-in-page', 'zoom', 'edit', 'full-screen',
    'settings', 'passwords', 'addons', 'more-tools', 'help', 'quit',
]);

/** A table row, structurally (MenuEntry in site-identity-table.ts). */
export interface AppMenuRow {
    readonly menuId: string;
    readonly stockPage?: string;
    readonly minPhase: number;
    readonly group: number;
}

/** A row this phase renders, with whether its action is wired. */
export interface AppMenuItem {
    readonly row: AppMenuRow;
    readonly enabled: boolean;
}

/**
 * The rows this phase renders, in table order: `minPhase` at or below the
 * phase, and enabled only when wired.
 */
export function applyMenuOrder(rows: readonly AppMenuRow[], wired: readonly string[], phase: number): AppMenuItem[] {
    return rows
        .filter(row => row.minPhase <= phase)
        .map(row => ({ row, enabled: wired.includes(row.menuId) }));
}

/** What the widget gives the builder: the label of a row, and the handler of an enabled row. */
export interface AppMenuView {
    label(menuId: string, enabled: boolean): string;
    run(row: AppMenuRow): void;
    /** Phase 33 (MENU-03): a wired row that needs a web tab dims without one, keeping its place; absent: always enabled. */
    isEnabled?(menuId: string): boolean;
    /** Phase 33 (BMK-06): an enabled row drawn as a submenu instead, with these children; undefined keeps it a row. */
    submenu?(menuId: string): AppMenuSubmenu | undefined;
}

/** A row's submenu: its children, and the menu path Theia gives them (absent: under the root's path). */
export interface AppMenuSubmenu {
    readonly menuPath?: string[];
    readonly children: (AppMenuLeaf | AppMenuGroup)[];
}

/** A row in Theia's CommandMenu shape (structural). */
export interface AppMenuLeaf {
    id: string;
    label: string;
    sortString: string;
    isVisible(): boolean;
    isEnabled(): boolean;
    isToggled(): boolean;
    run(): Promise<void>;
}

/** A separator group, or the root, in Theia's CompoundMenuNode shape (structural). */
export interface AppMenuGroup {
    id: string;
    sortString: string;
    isVisible(): boolean;
    isEmpty(): boolean;
    children: (AppMenuLeaf | AppMenuGroup)[];
    /** Set on a submenu (a labelled group, which Theia draws as a flyout); absent on a separator group. */
    label?: string;
    effectiveMenuPath?: string[];
}

/**
 * The per-request menu for the given rows: the root, with one group per
 * separator group, in table order. A disabled row keeps its place and its
 * caption and runs nothing.
 */
export function buildAppMenu(rows: readonly AppMenuRow[], wired: readonly string[], phase: number, view: AppMenuView): AppMenuGroup {
    const groups: { group: number; leaves: (AppMenuLeaf | AppMenuGroup)[] }[] = [];
    for (const { row, enabled } of applyMenuOrder(rows, wired, phase)) {
        let current = groups[groups.length - 1];
        if (!current || current.group !== row.group) {
            current = { group: row.group, leaves: [] };
            groups.push(current);
        }
        const id = `${APP_MENU_ID}.${row.menuId}`;
        const label = view.label(row.menuId, enabled);
        const sortString = String(current.leaves.length).padStart(2, '0');
        const submenu = enabled ? view.submenu?.(row.menuId) : undefined;
        if (submenu) {
            const children = submenu.children;
            current.leaves.push({
                id,
                label,
                sortString,
                isVisible: () => true,
                isEmpty: () => children.length === 0,
                children,
                ...(submenu.menuPath ? { effectiveMenuPath: submenu.menuPath } : {}),
            });
            continue;
        }
        current.leaves.push({
            id,
            label,
            sortString,
            isVisible: () => true,
            isEnabled: () => enabled && (view.isEnabled?.(row.menuId) ?? true),
            isToggled: () => false,
            run: async () => {
                if (enabled && (view.isEnabled?.(row.menuId) ?? true)) {
                    view.run(row);
                }
            },
        });
    }
    // Theia draws a separator before and after every group node, so a group first would open the
    // menu on a separator (browser-menu-plugin.js createItems). The first group's rows sit at the root.
    const [first, ...rest] = groups;
    return {
        id: APP_MENU_ID,
        sortString: '0',
        isVisible: () => true,
        isEmpty: () => groups.length === 0,
        children: [
            ...(first ? first.leaves : []),
            ...rest.map((g, i) => ({
                id: `${APP_MENU_ID}.group-${g.group}`,
                sortString: String(i + 1).padStart(2, '0'),
                isVisible: () => true,
                isEmpty: () => g.leaves.length === 0,
                children: g.leaves,
            })),
        ],
    };
}
