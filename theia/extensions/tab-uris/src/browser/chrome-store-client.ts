/**
 * NG-021/NG-022 (non-GUI wave B): Theia's reader for chrome-owned stores --
 * history, bookmarks, bookmark folders and the sessionstore projection --
 * through the PowerBrowserGroup actor.
 *
 * Same wire as GroupActorClient and WebTabChannel: a PowerBrowserGroupRequest
 * DOM event out, a PowerBrowserGroupResponse event back, matched by
 * requestId. The event names are spelled locally because the canonical
 * exports live in @powerbrowser/modes, which depends on this package. The
 * parent dispatches these kinds in handleStoreRequest, not handleGroupMutation.
 */
import { injectable } from '@theia/core/shared/inversify';
import { StoreMessage, StoreReply } from './tab-store-access-protocol';

const GROUP_REQUEST_EVENT = 'PowerBrowserGroupRequest';
const GROUP_RESPONSE_EVENT = 'PowerBrowserGroupResponse';

/** Ack timeout for a read. */
export const STORE_ACK_TIMEOUT_MS = 8000;

export interface HistoryEntry {
    url: string;
    title: string;
}

export interface BookmarkEntry {
    guid: string;
    title: string;
    url: string;
    /** Phase 33 (BMK-02): the root folder the bookmark sits in ('toolbar' | 'menu' | 'unfiled'), '' for any other; absent on folder-listing rows. */
    folder?: string;
}

/** Phase 38 plan 02 (D-02): the clicked button's rect in Theia-frame CSS pixels; chrome anchors the native popup panel to it. */
export interface ExtensionAnchorRect {
    left: number;
    top: number;
    width: number;
    height: number;
}

export interface SessionTabRow {
    uri: string;
    url: string;
    title: string;
    last_active: number;
}

/** A saved page copy (NG-028): its directory under <profile>/saved-pages/ and its size. */
export interface SavedPageCopy {
    dir: string;
    bytes: number;
}

/** A page capture writes files; it gets longer than a read. */
export const SAVE_PAGE_ACK_TIMEOUT_MS = 120000;

/** Clear Recent History (Everything) walks all of Places and deletes saved pages; on a large profile it outlasts a read. */
export const CLEAR_HISTORY_ACK_TIMEOUT_MS = 120000;

/** One history or bookmark match for the address bar (NG-023). */
export interface PlaceMatch {
    url: string;
    title: string;
    frecency: number | null;
    bookmarked: boolean;
}

/** One tab row joined to Places (NG-024). */
export interface TabPlacesRow {
    uri: string;
    url: string;
    title: string;
    group_id: string | null;
    last_active: number;
    closed_at: number | null;
    open: boolean;
    visited: boolean;
    frecency: number | null;
    visit_count: number;
    last_visit: number | null;
    bookmark_guid: string | null;
    bookmark_title: string | null;
}

/** One tab row joined to Places (NG-024), with the scan-cap flag. */
export interface TabPlacesResult {
    rows: TabPlacesRow[];
    truncated: boolean;
}

/** Phase 29 (BAR-01): chrome's resolution of typed pill text. Only chrome mints a search URL. */
export interface ResolvedAddress {
    kind: 'visit' | 'search' | 'refused' | 'no-engine';
    url?: string;
    engineName?: string;
}

/** Phase 29 (BAR-04): one bar engine; the icon is a data:image/ URI or null. */
export interface SearchEngineInfo {
    name: string;
    icon: string | null;
    /** Phase 30 (SMODE-04): Gecko's engine.aliases, at most 8 of at most 64 characters; empty when it has none. */
    aliases: string[];
}

/** Phase 29 (BAR-04): the bar's engines in order and the configured default's name. */
export interface SearchEngineList {
    engines: SearchEngineInfo[];
    defaultName: string;
}

/** Phase 33 (BMK-03, BMK-06): one closed tabs.sqlite row, newest first; `closedAt` in ms since the epoch. */
export interface ClosedTabRow {
    uri: string;
    url: string;
    title: string;
    closedAt: number;
}

/**
 * Phase 33 (BMK-03): the closed row to reopen. `key` is the web row key to reopen it on (webTabOpen's key), null for a
 * stock row; `withHistory` says chrome kept its back/forward history, which armWebTabHistory(key) restores.
 */
export interface ReopenableTab {
    uri: string;
    url: string;
    title: string;
    key: string | null;
    withHistory: boolean;
}

/** Phase 33 (BMK-05): the Clear Recent History ranges, Firefox's set minus the site-specific rows. */
export type ClearHistoryRange = 'last-hour' | 'last-2-hours' | 'last-4-hours' | 'today' | 'everything';

export interface TabPlacesQuery {
    bookmarked?: boolean;
    open?: boolean;
    limit?: number;
}

@injectable()
export class ChromeStoreClient {
    private seq = 0;

    /** One request; resolves the parent's reply or a timeout reply, never rejects. */
    request(msg: StoreMessage, timeoutMs = STORE_ACK_TIMEOUT_MS): Promise<StoreReply> {
        const requestId = `store-${msg.kind}-${Date.now().toString(36)}-${(this.seq += 1)}`;
        return new Promise<StoreReply>(resolve => {
            const settle = (reply: StoreReply): void => {
                window.removeEventListener(GROUP_RESPONSE_EVENT, onResponse);
                window.clearTimeout(timer);
                resolve(reply);
            };
            const onResponse = (event: Event): void => {
                const detail = (event as CustomEvent).detail as { requestId?: unknown; reply?: unknown } | undefined;
                if (!detail || detail.requestId !== requestId) {
                    return;
                }
                settle(detail.reply && typeof detail.reply === 'object'
                    ? detail.reply as StoreReply
                    : { ok: false, reason: 'validation', message: 'malformed reply' });
            };
            const timer = window.setTimeout(() => settle({ ok: false, reason: 'timeout', message: `no reply to ${msg.kind}` }), timeoutMs);
            window.addEventListener(GROUP_RESPONSE_EVENT, onResponse);
            // document + bubbles: the actor child listens on the window root (GroupActorClient records why).
            document.dispatchEvent(new CustomEvent(GROUP_REQUEST_EVENT, { bubbles: true, detail: { requestId, msg } }));
        });
    }

    readHistoryEntry(url: string): Promise<HistoryEntry | null> {
        return this.field<HistoryEntry | null>({ kind: 'readHistoryEntry', url }, 'entry');
    }

    readBookmarkByUrl(url: string): Promise<BookmarkEntry | null> {
        return this.field<BookmarkEntry | null>({ kind: 'readBookmarkByUrl', url }, 'bookmark');
    }

    listBookmarkFolder(folderGuid: string): Promise<BookmarkEntry[]> {
        return this.field<BookmarkEntry[]>({ kind: 'listBookmarkFolder', folderGuid }, 'rows');
    }

    projectSessionStoreTabs(): Promise<SessionTabRow[]> {
        return this.field<SessionTabRow[]>({ kind: 'projectSessionStoreTabs' }, 'rows');
    }

    /** NG-028: stores a full copy of the tab's page; rejects with chrome's reason. */
    async savePageCopy(uri: string): Promise<SavedPageCopy> {
        const reply = await this.request({ kind: 'savePageCopy', uri }, SAVE_PAGE_ACK_TIMEOUT_MS);
        if (!reply.ok) {
            throw new Error(reply.message ?? `savePageCopy failed (${reply.reason ?? 'store'})`);
        }
        return { dir: String(reply.dir), bytes: Number(reply.bytes) };
    }

    /**
     * NG-023: http(s) history and bookmark matches for typed text, bookmarks first.
     * Phase 30 (SMODE-01): `restrict` lists one source alone, newest first, empty text included.
     */
    searchPlaces(text: string, limit: number, restrict?: 'bookmark' | 'history'): Promise<PlaceMatch[]> {
        return this.field<PlaceMatch[]>(restrict === undefined ? { kind: 'searchPlaces', text, limit } : { kind: 'searchPlaces', text, limit, restrict }, 'rows');
    }

    /** Phase 29 (BAR-01): URI fixup, then the bar engine's submission, then the http(s) wall, all chrome-side. `canonize` (BAR-13) completes a bare name to www.name.com first; `forceSearch` (BAR-05 one-off) skips fixup and searches the text with the engine. */
    resolveTypedAddress(text: string, engineName = '', canonize = false, forceSearch = false): Promise<ResolvedAddress> {
        return this.field<ResolvedAddress>({ kind: 'resolveTypedAddress', text, engineName, canonize, forceSearch }, 'resolved');
    }

    /** Phase 29 (BAR-04): the bar's engines, for the Default Search Engine setting and the placeholder. */
    async listSearchEngines(): Promise<SearchEngineList> {
        const reply = await this.request({ kind: 'listSearchEngines' });
        if (!reply.ok) {
            throw new Error(reply.message ?? `listSearchEngines failed (${reply.reason ?? 'store'})`);
        }
        // An older chrome sends no aliases: an engine without them has none.
        const engines = (reply['engines'] as SearchEngineInfo[]).map(engine => ({ ...engine, aliases: Array.isArray(engine.aliases) ? engine.aliases.map(String) : [] }));
        return { engines, defaultName: String(reply['defaultName'] ?? '') };
    }

    /** Phase 29 (BAR-11): cached favicons for up to 10 page urls, keyed by url; each a data:image/ URI. A url without one is absent. */
    placesFavicons(urls: string[]): Promise<Record<string, string>> {
        return this.field<Record<string, string>>({ kind: 'placesFavicons', urls }, 'icons');
    }

    /** Phase 29 (BAR-03): up to 4 engine suggestions for typed text; [] when chrome resolves it as an address or the engine fails. */
    searchSuggestions(text: string, engineName = ''): Promise<string[]> {
        return this.field<string[]>({ kind: 'searchSuggestions', text, engineName }, 'rows');
    }

    /** Phase 29 (BAR-07): the best visited origin completing typed text, `{ text, url }`, or null. */
    autofillOrigin(text: string): Promise<{ text: string; url: string } | null> {
        return this.field<{ text: string; url: string } | null>({ kind: 'autofillOrigin', text }, 'completion');
    }

    /** Phase 29 (BAR-09): removes a page from history; true when Places held it. Privileged: only the widget's Shift+Delete handler calls it. */
    removeHistoryEntry(url: string): Promise<boolean> {
        return this.field<boolean>({ kind: 'removeHistoryEntry', url }, 'removed');
    }

    /** Phase 29 (BAR-10): the global clipboard's text, at most 8192 characters; "" when empty. Privileged: only the pill menu's Paste and Paste & Go call it. */
    readClipboardText(): Promise<string> {
        return this.field<string>({ kind: 'readClipboardText' }, 'text');
    }

    /** Phase 31 plan 04 (MENU-02, D-31-07): opens one stock page by its enum name; chrome holds the URL. Resolves chrome's outcome word. A store-write, sent only from the app menu's row handler. */
    async openStockPage(page: string): Promise<string> {
        const reply = await this.request({ kind: 'openStockPage', page });
        if (!reply.ok) {
            throw new Error(reply.message ?? `openStockPage failed (${reply.reason ?? 'store'})`);
        }
        return String(reply.where);
    }

    /**
     * Phase 31 plan 05 (MENU-04, D-31-13): quits the application through chrome's one quit path. Resolves
     * 'applied', or 'cancelled' when a quit-requested observer declined (a page's leave prompt): an answer, not
     * an error. A lifecycle kind, sent only from the chrome bar widget's Quit row handler.
     */
    async quitRequest(): Promise<string> {
        const reply = await this.request({ kind: 'quitRequest' });
        if (reply.ok) {
            return String(reply.where);
        }
        if (reply.reason === 'cancelled') {
            return 'cancelled';
        }
        throw new Error(reply.message ?? `quitRequest failed (${reply.reason ?? 'store'})`);
    }

    /**
     * Phase 33 (BMK-01): bookmarks an http(s) page; resolves its bookmark (the existing one when the page already has
     * one). `folderGuid` is 'toolbar' | 'menu' | 'unfiled' or a Places GUID; absent, Firefox's default location.
     * Privileged: only the pill's star and Ctrl+D handlers call it.
     */
    bookmarkPage(url: string, title: string, folderGuid?: string): Promise<BookmarkEntry> {
        return this.field<BookmarkEntry>(folderGuid === undefined ? { kind: 'bookmarkPage', url, title } : { kind: 'bookmarkPage', url, title, folderGuid }, 'bookmark');
    }

    /** Phase 33 (BMK-02): renames and/or moves one bookmark. Privileged: only the editor's handlers call it. */
    updateBookmark(guid: string, title?: string, folderGuid?: string): Promise<BookmarkEntry> {
        const msg: { kind: string; guid: string; title?: string; folderGuid?: string } = { kind: 'updateBookmark', guid };
        if (title !== undefined) {
            msg.title = title;
        }
        if (folderGuid !== undefined) {
            msg.folderGuid = folderGuid;
        }
        return this.field<BookmarkEntry>(msg, 'bookmark');
    }

    /**
     * Phase 33 (BMK-02): removes one bookmark by GUID, or every bookmark of an http(s) page by its url; resolves how
     * many were removed (0 when none). Privileged: only the editor's Remove handler calls it.
     */
    removeBookmark(guidOrUrl: string): Promise<number> {
        return this.field<number>({ kind: 'removeBookmark', target: guidOrUrl }, 'removed');
    }

    /** Phase 33 (BMK-03, BMK-06): up to `limit` (1..25, default 10) closed web and stock tabs, newest first. */
    listClosedTabs(limit?: number): Promise<ClosedTabRow[]> {
        return this.field<ClosedTabRow[]>(limit === undefined ? { kind: 'listClosedTabs' } : { kind: 'listClosedTabs', limit }, 'rows');
    }

    /** Phase 33 (BMK-03): the closed row named by `uri`, or the newest; null when none is left (a no-op, not an error). */
    reopenClosedTab(uri?: string): Promise<ReopenableTab | null> {
        return this.field<ReopenableTab | null>(uri === undefined ? { kind: 'reopenClosedTab' } : { kind: 'reopenClosedTab', uri }, 'tab');
    }

    /**
     * Phase 33 (BMK-05): clears history in `range` from every PowerBrowser store (Places, closed tabs, thumbnails,
     * saved pages, web-tab histories); the sign-in cookie is never touched. Resolves the range cleared; rejects with
     * chrome's reason. Privileged: only the range picker's confirm handler calls it.
     */
    async clearHistory(range: ClearHistoryRange): Promise<string> {
        const reply = await this.request({ kind: 'clearHistory', range }, CLEAR_HISTORY_ACK_TIMEOUT_MS);
        if (!reply.ok) {
            throw new Error(reply.message ?? `clearHistory failed (${reply.reason ?? 'store'})`);
        }
        return String(reply['cleared']);
    }

    /**
     * Phase 33 (MENU-03, D-14/D-14b): toggles the shell window's full screen; resolves 'entered' or 'left'. A
     * window-chrome kind: the Full Screen row and command reach it through the chrome bar widget's handler only,
     * and it is never relayed. Phase 35's fullscreen path replaces the chrome side behind the same command id.
     */
    async fullScreen(): Promise<string> {
        const reply = await this.request({ kind: 'fullScreen' });
        if (!reply.ok) {
            throw new Error(reply.message ?? `fullScreen failed (${reply.reason ?? 'store'})`);
        }
        return String(reply.where);
    }

    /**
     * Phase 38 plan 01 (EXT-06, D-03): makes this frame the target of chrome's extensionAction pushes and asks for the
     * current set, which arrives as a push (WebTabChannel.onDidChangeExtensionActions). A read.
     */
    async extensionActionsSubscribe(): Promise<void> {
        const reply = await this.request({ kind: 'extensionActionsSubscribe' });
        if (!reply.ok) {
            throw new Error(reply.message ?? `extensionActionsSubscribe failed (${reply.reason ?? 'store'})`);
        }
    }

    /**
     * Phase 38 plan 01 (EXT-07, D-11): a toolbar button's click, run by chrome on the selected web tab. Resolves
     * 'popup', 'action', 'disabled' or 'no-tab'. Privileged: only the button's click handler calls it. `pageAction`
     * (38-03) runs the extension's page action instead, for the pill icon.
     */
    async extensionClick(extensionId: string, anchorRect: ExtensionAnchorRect, pageAction = false): Promise<string> {
        const reply = await this.request({ kind: 'extensionClick', extensionId, anchorRect, ...(pageAction ? { pageAction: true } : {}) });
        if (!reply.ok) {
            throw new Error(reply.message ?? `extensionClick failed (${reply.reason ?? 'store'})`);
        }
        return String(reply.where);
    }

    /** Phase 38 plan 01 (D-08, D-11): Pin to Toolbar and its undo; resolves 'pinned' or 'unpinned'. Privileged: only the menu row's handler calls it. */
    async extensionPin(extensionId: string, pinned: boolean): Promise<string> {
        const reply = await this.request({ kind: 'extensionPin', extensionId, pinned });
        if (!reply.ok) {
            throw new Error(reply.message ?? `extensionPin failed (${reply.reason ?? 'store'})`);
        }
        return String(reply.where);
    }

    /** Phase 38 plan 01 (D-08, D-11): uninstalls an extension; resolves 'removed' or 'refused'. Privileged: only the confirm row's handler calls it. */
    async extensionRemove(extensionId: string): Promise<string> {
        const reply = await this.request({ kind: 'extensionRemove', extensionId });
        if (!reply.ok) {
            throw new Error(reply.message ?? `extensionRemove failed (${reply.reason ?? 'store'})`);
        }
        return String(reply.where);
    }

    /**
     * Phase 38 plan 05 (EXT-09, D-04, D-11): the puzzle menu's install footer. Chrome opens the add-ons site in the stock
     * browser window, whose stock install prompt is the only install UI; resolves 'opened-tab' or 'opened-window'. A
     * network kind: it sends the user off the machine, so it is never relayed.
     */
    async extensionInstallSite(): Promise<string> {
        const reply = await this.request({ kind: 'extensionInstallSite' });
        if (!reply.ok) {
            throw new Error(reply.message ?? `extensionInstallSite failed (${reply.reason ?? 'store'})`);
        }
        return String(reply.where);
    }

    /**
     * Phase 38 plan 04 (B5): Show Sidebar (`open` true) or Hide Sidebar for an extension's sidebar page; resolves 'opened'
     * or 'closed'. Privileged: only the gear row and the sidebar view's close, through the extension buttons widget.
     */
    async extensionSidebar(extensionId: string, open: boolean): Promise<string> {
        const reply = await this.request({ kind: 'extensionSidebar', extensionId, open });
        if (!reply.ok) {
            throw new Error(reply.message ?? `extensionSidebar failed (${reply.reason ?? 'store'})`);
        }
        return String(reply.where);
    }

    /** Phase 38 plan 04 (B5): the sidebar view's rect, where chrome paints the sidebar page; resolves 'applied' or 'not-open'. Privileged, as extensionSidebar. */
    async extensionSidebarGeometry(extensionId: string, rect: { x: number; y: number; w: number; h: number; visible: boolean }): Promise<string> {
        const reply = await this.request({ kind: 'extensionSidebarGeometry', extensionId, ...rect });
        if (!reply.ok) {
            throw new Error(reply.message ?? `extensionSidebarGeometry failed (${reply.reason ?? 'store'})`);
        }
        return String(reply.where);
    }

    /** NG-024: tab rows joined to history and bookmarks, highest frecency first. Keeps the row-array shape; the cap flag rides the reply. */
    queryTabsWithPlaces(query: TabPlacesQuery = {}): Promise<TabPlacesRow[]> {
        return this.field<TabPlacesRow[]>({ kind: 'queryTabsWithPlaces', ...query }, 'rows');
    }

    /** NG-024 with the scan-cap flag: `{ rows, truncated }` from the same reply. */
    async queryTabsWithPlacesResult(query: TabPlacesQuery = {}): Promise<TabPlacesResult> {
        const reply = await this.request({ kind: 'queryTabsWithPlaces', ...query });
        if (!reply.ok) {
            throw new Error(reply.message ?? `queryTabsWithPlaces failed (${reply.reason ?? 'store'})`);
        }
        return { rows: reply['rows'] as TabPlacesRow[], truncated: reply['truncated'] === true };
    }

    protected async field<T>(msg: StoreMessage, name: string, timeoutMs?: number): Promise<T> {
        const reply = await this.request(msg, timeoutMs);
        if (!reply.ok) {
            throw new Error(reply.message ?? `${msg.kind} failed (${reply.reason ?? 'store'})`);
        }
        return reply[name] as T;
    }
}
