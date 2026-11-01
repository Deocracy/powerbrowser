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

export type RowSource = 'heuristic' | 'search' | 'history' | 'bookmark' | 'tab' | 'action' | 'pick' | 'group' | 'goto';

/** One dropdown row. `key` is stable across arrivals; an engine row's url is empty until resolved. */
export interface Row {
    key: string;
    source: RowSource;
    title: string;
    caption: string;
    url: string;
    engineName?: string;
    icon?: string | null;
    /** Phase 30: the web tab a Tabs-mode row switches to; preferred over the url, so two tabs on one url stay two rows. */
    widgetId?: string;
    /** Phase 30: an Actions row's keybinding labels, shown trailing. */
    badges?: string[];
    /** Phase 30: what choosing the row does, when it is not an address (an action, the trailing search row, a pick). */
    run?: () => void | Promise<void>;
    /** Phase 30 (SMODE-05): a Command-centre pick's second line. */
    detail?: string;
    /** Phase 30 (SMODE-05): a pick's own icon classes, applied as given (file-icon theme, codicons). */
    iconClasses?: string[];
    /** Phase 30 (SMODE-05): choosing the row keeps the dropdown and the mode (a help row puts its prefix in the pill). */
    stays?: boolean;
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

export type RowIcon = { image: string } | { codicon: string } | { classes: string };

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
    if (row.iconClasses || row.source === 'pick') {
        // SMODE-05: a pick's icon classes as given; a pick without any (most commands) keeps an empty slot.
        return { leading: { classes: (row.iconClasses ?? []).join(' ') }, trailing };
    }
    if (row.source === 'action') {
        return { leading: { codicon: 'codicon-zap' }, trailing: null };
    }
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

/**
 * Ctrl+Enter (BAR-13): true for a bare name Firefox completes to
 * www.<name>.com -- no dot, colon or space before an optional path. The same
 * test as UrlbarInput._maybeCanonizeURL; chrome applies it again.
 */
export function isCanonizable(text: string): boolean {
    return /^\s*[^.:\/\s]+(?:\/.*|\s*)$/i.test(text);
}

export type AddressClass = 'url' | 'ambiguous' | 'text';

/**
 * SMODE-06 (D-29, D-30): whether typed text is an unambiguous address, a bare
 * dotted name that may be a file (README.md, main.py:12) or plain text.
 * Local and pure, so classifying sends nothing to chrome. A dotted host with a
 * port is ambiguous, because the file provider reads main.py:12 as file plus
 * line (30-RESEARCH A3). In a file search (`files` set, Command centre) an
 * undotted host:port and a trailing / are ambiguous too: Makefile:12 is a
 * file plus line and src/ a folder (WR-01).
 */
export function classifyAddress(raw: string, { files = false }: { files?: boolean } = {}): AddressClass {
    const t = raw.trim();
    if (!t || /\s/.test(t)) {
        return 'text';
    }
    const url = [
        /^[a-z][a-z0-9+.-]*:\/\//i,                    // a scheme
        /^localhost(:\d{1,5})?(\/.*)?$/i,               // localhost[:port]
        /^\d{1,3}(\.\d{1,3}){3}(:\d{1,5})?(\/.*)?$/,     // IPv4[:port]
        /^\[[0-9a-f:.]+\](:\d{1,5})?(\/.*)?$/i,          // [IPv6][:port]
        /^www\.[^/]+\.[^/]+/i,                          // a leading www.
    ];
    if (url.some(re => re.test(t))) {
        return 'url';
    }
    const fileShaped = [
        /^[^./:]+:\d{1,5}(\/.*)?$/,                      // an undotted host:port (devbox:3000), or a file and line (Makefile:12)
        /\/$/,                                          // a trailing /, or a folder (src/)
    ];
    if (fileShaped.some(re => re.test(t))) {
        return files ? 'ambiguous' : 'url';
    }
    return /^[^/:]+\.[^/:]+(:\d+)?$/.test(t) ? 'ambiguous' : 'text';
}

/** NAV-06: drag types that are links, as distinct from plain text. Here so the strip shares it without importing the widget. */
export const LINK_DRAG_TYPES = ['text/uri-list', 'text/x-moz-url'];

/** The dropped payload: first non-comment uri-list line, else x-moz-url's first line, else plain text, trimmed. */
export function droppedTextOf(data: DataTransfer): string {
    const uriList = data.getData('text/uri-list').split(/\r?\n/).find(line => line.trim() && !line.startsWith('#'));
    return (uriList || data.getData('text/x-moz-url').split(/\r?\n/)[0] || data.getData('text/plain')).trim();
}
