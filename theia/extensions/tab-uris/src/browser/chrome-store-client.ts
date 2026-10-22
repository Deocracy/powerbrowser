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
}

/** Phase 29 (BAR-04): the bar's engines in order and the configured default's name. */
export interface SearchEngineList {
    engines: SearchEngineInfo[];
    defaultName: string;
}

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
        return { engines: reply['engines'] as SearchEngineInfo[], defaultName: String(reply['defaultName'] ?? '') };
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
