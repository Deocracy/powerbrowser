/**
 * Phase 29 (BAR-11): the address bar's result rows -- what a row is, how the
 * rows are composed, how the highlight moves and which icons a row shows
 * (29-UI-SPEC "Suggestions").
 *
 * Pure on purpose: the widget imports it, and so does
 * scripts/verify-address-bar-rows.mjs under Node's type stripping. It has no
 * import statement and uses only syntax Node strips natively (annotations,
 * interfaces, type aliases; no enum, namespace or parameter property), so it
 * must stay dependency-free.
 */

export type RowSource = 'heuristic' | 'search' | 'history' | 'bookmark' | 'tab';

/** One dropdown row. `key` is stable across arrivals; an engine row's url is empty until resolved. */
export interface Row {
    key: string;
    source: RowSource;
    title: string;
    caption: string;
    url: string;
    engineName?: string;
    icon?: string | null;
}

export const ENGINE_ROW_LIMIT = 4;
export const PLACE_ROW_LIMIT = 5;
export const ROW_LIMIT = 10;

/** The longest icon URI a row may carry; the boundary applies the same cap. */
const ICON_MAX_LENGTH = 65536;

/** A cached icon as a bounded data:image/ URI, else null: showing an icon never fetches anything. */
export function safeIcon(src: unknown): string | null {
    return typeof src === 'string' && src.startsWith('data:image/') && src.length <= ICON_MAX_LENGTH ? src : null;
}

/** True when `row` should replace `held` for the same url: an open tab wins. */
function wins(row: Row, held: Row | undefined): boolean {
    return !held || (row.source === 'tab' && held.source !== 'tab');
}

/**
 * The heuristic row, up to 4 engine rows, then up to 5 open-tab, bookmark and
 * history rows in their merge order, deduplicated by url (an open tab wins,
 * and the heuristic row's own url is dropped), 10 at most.
 */
export function composeRows(heuristic: Row | null, engineRows: Row[], placeRows: Row[]): Row[] {
    const byUrl = new Map<string, Row>();
    for (const row of placeRows) {
        if (heuristic && heuristic.url && row.url === heuristic.url) {
            continue;
        }
        if (wins(row, byUrl.get(row.url))) {
            byUrl.set(row.url, row);
        }
    }
    const head = heuristic ? [heuristic] : [];
    const places = Array.from(byUrl.values()).slice(0, PLACE_ROW_LIMIT);
    return head.concat(engineRows.slice(0, ENGINE_ROW_LIMIT), places).slice(0, ROW_LIMIT);
}

/** The key one step from `current`, wrapping; an unknown key steps from the first row. */
export function nextHighlight(keys: string[], current: string | undefined, step: 1 | -1): string | undefined {
    if (keys.length === 0) {
        return undefined;
    }
    const from = Math.max(current === undefined ? -1 : keys.indexOf(current), 0);
    return keys[(from + step + keys.length) % keys.length];
}

export type RowIcon = { image: string } | { codicon: string };

const TYPE_MARKERS: { [source: string]: string } = {
    history: 'codicon-history',
    bookmark: 'codicon-star-full',
    tab: 'codicon-browser',
};

/**
 * The 16px leading icon and the muted trailing type marker (29-UI-SPEC row
 * icon table). An engine suggestion always shows the search glyph; every other
 * row shows its cached icon, else the search glyph for a heuristic search or
 * the globe.
 */
export function iconFor(row: Row): { leading: RowIcon; trailing: string | null } {
    const trailing = TYPE_MARKERS[row.source] ?? null;
    if (row.source === 'search') {
        return { leading: { codicon: 'codicon-search' }, trailing };
    }
    const image = safeIcon(row.icon);
    if (image) {
        return { leading: { image }, trailing };
    }
    const searching = row.source === 'heuristic' && !!row.engineName;
    return { leading: { codicon: searching ? 'codicon-search' : 'codicon-globe' }, trailing };
}

/**
 * Inline autofill (BAR-07): the pill's value and the selected completed part
 * when `completion` extends `typed` (compared case-insensitively), else null.
 * The typed characters keep the case they were typed in.
 */
export function autofillSplice(typed: string, completion: string): { value: string; start: number; end: number } | null {
    if (!typed || completion.length <= typed.length || !completion.toLowerCase().startsWith(typed.toLowerCase())) {
        return null;
    }
    const value = typed + completion.slice(typed.length);
    return { value, start: typed.length, end: value.length };
}
