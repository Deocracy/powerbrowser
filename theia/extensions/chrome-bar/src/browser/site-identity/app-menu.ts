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
 * The rows whose action this tree wires: the new-tab command and the stock
 * pages. Quit joins in plan 05 (31-05), when its `quitRequest` kind lands; until
 * then it renders disabled. The static gate derives this set from
 * chrome-bar-commands.ts and STOCK_PAGES.
 */
export const WIRED_MENU_IDS: readonly string[] = Object.freeze(['new-tab', 'settings', 'passwords', 'addons', 'help']);

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
}

/**
 * The per-request menu for the given rows: the root, with one group per
 * separator group, in table order. A disabled row keeps its place and its
 * caption and runs nothing.
 */
export function buildAppMenu(rows: readonly AppMenuRow[], wired: readonly string[], phase: number, view: AppMenuView): AppMenuGroup {
    const groups: { group: number; leaves: AppMenuLeaf[] }[] = [];
    for (const { row, enabled } of applyMenuOrder(rows, wired, phase)) {
        let current = groups[groups.length - 1];
        if (!current || current.group !== row.group) {
            current = { group: row.group, leaves: [] };
            groups.push(current);
        }
        current.leaves.push({
            id: `${APP_MENU_ID}.${row.menuId}`,
            label: view.label(row.menuId, enabled),
            sortString: String(current.leaves.length).padStart(2, '0'),
            isVisible: () => true,
            isEnabled: () => enabled,
            isToggled: () => false,
            run: async () => {
                if (enabled) {
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
