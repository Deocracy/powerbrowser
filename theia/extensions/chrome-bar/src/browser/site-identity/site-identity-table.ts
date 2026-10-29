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

/** One hamburger row: its stable id, the stock page it opens (absent: a bar feature), and the plan that lands it. */
export interface MenuEntry {
    menuId: string;
    stockPage?: StockPage;
    minPhase: number;
}

/**
 * D-31-08/D-31-11: the hamburger in Firefox order, filtered at render time
 * to rows whose `minPhase` has landed. The gate reads the same table; plans
 * 02/04 land the rows this plan only skips over.
 */
export const MENU_ORDER: readonly MenuEntry[] = Object.freeze([
    { menuId: 'new-tab', minPhase: 27 },
    { menuId: 'history', minPhase: 27 },
    { menuId: 'settings', stockPage: 'settings', minPhase: 31 },
    { menuId: 'passwords', stockPage: 'passwords', minPhase: 31 },
    { menuId: 'addons', stockPage: 'addons', minPhase: 31 },
    { menuId: 'help', stockPage: 'support', minPhase: 31 },
    { menuId: 'quit', minPhase: 31 },
]);

/**
 * Phase 31 plan 02 (D-31-05/D-31-06, SITE-04): the panel's tri-state cycle.
 * Every managed permission cycles Allow -> Block -> Use default, except
 * autoplay-media, whose upstream states are ALLOW, BLOCK and
 * AUTOPLAY_BLOCKED_ALL (SitePermissions.sys.mjs:888-892): it cycles
 * Allow -> Block sounds -> Block all -> Use default. The chrome write arm
 * (webTabPermissionCapability) accepts exactly these names; the gate derives
 * that set from the arm and compares it with these lists.
 */
export const PERMISSION_STATES: readonly string[] = Object.freeze(['allow', 'block', 'default']);
export const AUTOPLAY_PERMISSION_STATES: readonly string[] = Object.freeze(['allow', 'block-audible', 'block-all', 'default']);

/** The state a click on a permission row moves to: the next entry of its cycle, wrapping. */
export function nextPermissionState(id: string, state: string): string {
    const cycle = id === 'autoplay-media' ? AUTOPLAY_PERMISSION_STATES : PERMISSION_STATES;
    const at = cycle.indexOf(state);
    return cycle[(at + 1) % cycle.length];
}
