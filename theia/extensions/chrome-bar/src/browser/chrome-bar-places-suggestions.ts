/**
 * NG-023 (non-GUI wave B): the address bar's suggestion data -- open tabs
 * from the backend reader, then history and bookmark matches from chrome
 * through the actor ("Typing filters history/bookmark suggestions",
 * 13-UI-SPEC.md). Rows keep the TabQueryRow shape the widget commits by url,
 * and (Phase 29, BAR-11) each carries its source for the row's type marker.
 */
import { inject, injectable } from '@theia/core/shared/inversify';
import type { TabQueryRow } from '@powerbrowser/tab-uris/lib/node/tab-query-service';
import { ChromeStoreClient, PlaceMatch } from '@powerbrowser/tab-uris/lib/browser/chrome-store-client';
import { CHROME_SUGGESTION_LIMIT, ChromeBarSuggestionService, ChromeBarTabSuggestions } from './chrome-bar-suggestion-service';

/** A suggestion row with its source: an open tab, a bookmark, or a history visit. */
export type SourcedRow = TabQueryRow & { source: 'tab' | 'bookmark' | 'history' };

@injectable()
export class ChromeBarPlacesSuggestions implements ChromeBarSuggestionService {
    @inject(ChromeBarTabSuggestions)
    protected readonly tabs: ChromeBarSuggestionService;

    @inject(ChromeStoreClient)
    protected readonly store: ChromeStoreClient;

    async searchByPrefix(prefix: string, limit: number): Promise<SourcedRow[]> {
        const cap = Number.isFinite(limit) ? Math.min(Math.max(Math.floor(limit), 1), CHROME_SUGGESTION_LIMIT) : CHROME_SUGGESTION_LIMIT;
        const [tabRows, places] = await Promise.all([
            this.tabs.searchByPrefix(prefix, cap),
            // History and bookmarks are an addition: when chrome cannot answer, the open tabs still show.
            this.store.searchPlaces(prefix, cap).catch((err: unknown): PlaceMatch[] => {
                console.warn('[@powerbrowser/chrome-bar] history and bookmark suggestions unavailable:', err);
                return [];
            }),
        ]);
        const seen = new Set<string>();
        const rows: SourcedRow[] = [];
        for (const row of tabRows) {
            if (!seen.has(row.url)) {
                seen.add(row.url);
                rows.push({ ...row, source: 'tab' });
            }
        }
        for (const place of places) {
            if (!seen.has(place.url)) {
                seen.add(place.url);
                // The address doubles as the list key: a history or bookmark row has no store identity.
                rows.push({ uri: place.url, url: place.url, title: place.title, last_active: 0, source: place.bookmarked ? 'bookmark' : 'history' });
            }
        }
        return rows.slice(0, cap);
    }
}
