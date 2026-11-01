/**
 * Phase 31 (SITE-01..03): the site-identity table -- the connection-state
 * enum, the upstream permission IDs, the stock pages and the hamburger
 * order. The pill's identity box renders from this, and so does
 * scripts/verify-site-identity.mjs under Node's type stripping.
 *
 * Pure on purpose: no import statement and only syntax Node strips natively
 * (annotations, type aliases; no enum, namespace or parameter property), so
 * it must stay dependency-free. Labels are copy and live in
 * CHROME_BAR_COPY, keyed by the IDs below and never by renamed IDs.
 */

/** D-31-01: the connection states chrome's decode pushes with `url`. */
export type SecurityState = 'secure' | 'insecure' | 'mixed-passive' | 'broken' | 'local' | 'none';

/** The pushed states, in D-31-01 order. The gate derives the same set from the boundary decode. */
export const SECURITY_STATES: readonly SecurityState[] = Object.freeze([
    'secure',
    'insecure',
    'mixed-passive',
    'broken',
    'local',
    'none',
]);

/**
 * D-31-11: the six upstream Firefox permission IDs this phase manages
 * (`SitePermissions.sys.mjs`: `camera` `:935`, `microphone` `:954`, `geo`
 * `:1014`, `desktop-notification` `:930`, `autoplay-media` `:863`, `popup`
 * `:971`). The gate parses the same set out of `upstream/` at check time
 * and compares by set equality; Theia labels come from `CHROME_BAR_COPY`
 * keyed by these IDs, never renamed IDs.
 */
export const PERMISSION_IDS: readonly string[] = Object.freeze([
    'camera',
    'microphone',
    'geo',
    'desktop-notification',
    'autoplay-media',
    'popup',
]);

/** D-31-07: the stock pages the menu may open, by enum value (never a URL). */
export type StockPage = 'settings' | 'passwords' | 'addons' | 'processes' | 'support';

/** The stock pages, in the order the hamburger lists them. */
export const STOCK_PAGES: readonly StockPage[] = Object.freeze([
    'settings',
    'passwords',
    'addons',
    'processes',
    'support',
]);

/**
 * One hamburger row: its stable id, the stock page it opens (absent: a bar
 * feature or Quit), the phase that lands it (`minPhase`), and its Firefox
 * separator group (rows of one group sit together; a separator falls between
 * groups).
 */
export interface MenuEntry {
    menuId: string;
    stockPage?: StockPage;
    minPhase: number;
    group: number;
}

/**
 * The phase this tree lands: rows with a higher `minPhase` are MENU-03 slots,
 * reserved and absent. Phase 33 plan 03 lands the History row (BMK-06).
 */
export const MENU_PHASE = 33;

/**
 * D-31-08/D-31-11: the hamburger in Firefox order (UI-SPEC: New Tab, History,
 * Downloads, separator, Settings, Passwords, Add-ons, separator, Help,
 * separator, Quit). History is a MENU-03 row (REQUIREMENTS MENU-03, Phase 33),
 * landed by Phase 33 plan 03 as the History submenu (BMK-06).
 */
export const MENU_ORDER: readonly MenuEntry[] = Object.freeze([
    { menuId: 'new-tab', minPhase: 27, group: 1 },
    { menuId: 'history', minPhase: 33, group: 1 },
    { menuId: 'settings', stockPage: 'settings', minPhase: 31, group: 2 },
    { menuId: 'passwords', stockPage: 'passwords', minPhase: 31, group: 2 },
    { menuId: 'addons', stockPage: 'addons', minPhase: 31, group: 2 },
    { menuId: 'help', stockPage: 'support', minPhase: 31, group: 3 },
    { menuId: 'quit', minPhase: 31, group: 4 },
]);

/**
 * Phase 31 plan 02 (D-31-05/D-31-06, SITE-04): the panel's stored-state cycles,
 * each starting at "default" (no saved entry). Every managed permission
 * cycles Use default -> Allow -> Block -> Use default. autoplay-media has the
 * upstream states ALLOW, BLOCK and AUTOPLAY_BLOCKED_ALL
 * (SitePermissions.sys.mjs:888-892) and cycles Use default -> Allow -> Block
 * sounds -> Block all -> Use default. The chrome write arm
 * (webTabPermissionCapability) accepts exactly these names; the gate derives
 * that set from the arm and compares it with these lists.
 */
export const PERMISSION_STATES: readonly string[] = Object.freeze(['default', 'allow', 'block']);
export const AUTOPLAY_PERMISSION_STATES: readonly string[] = Object.freeze(['default', 'allow', 'block-audible', 'block-all']);

/**
 * WR-05: the effective states of a permission's cycle, in cycle order, each once.
 * "default" reads as `defaultState` (what the permission shows with no saved
 * entry), so an entry equal to the default is the same state as the default and
 * is listed at its first position only. Popup (default block) is [block, allow];
 * autoplay-media with the BLOCKED default is [block-audible, allow, block-all].
 */
export function permissionOrder(id: string, defaultState: string): string[] {
    const cycle = id === 'autoplay-media' ? AUTOPLAY_PERMISSION_STATES : PERMISSION_STATES;
    const order: string[] = [];
    for (const entry of cycle) {
        const effective = entry === 'default' ? defaultState : entry;
        if (!order.includes(effective)) {
            order.push(effective);
        }
    }
    return order;
}

/**
 * The state a click on a permission row moves to: the next effective state of
 * its order after `current` (the reply's effective state), wrapping. A target
 * equal to the default is written as "default", which removes the saved entry
 * (SitePermissions.sys.mjs:575-580). No client memory is needed: the reply's
 * effective state is the only input, so no click can be dead. An unknown
 * `current` starts at the first entry.
 */
export function nextPermissionState(id: string, current: string, defaultState: string): string {
    const order = permissionOrder(id, defaultState);
    const target = order[(order.indexOf(current) + 1) % order.length];
    return target === defaultState ? 'default' : target;
}
