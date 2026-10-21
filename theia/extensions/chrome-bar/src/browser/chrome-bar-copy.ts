import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
import { EMPTY_PAGE_URL, NEW_TAB_LABEL, WebTabHistoryEntry } from '@powerbrowser/tab-uris/lib/browser/web-tab';

/**
 * Phase 27 chrome-bar copy (27-UI-SPEC Copywriting Contract). Every new
 * sentence lives in this one object, so `verify-shell-error-copy.mjs` pins
 * it by set equality. The product is named by the configured application
 * name at render time, never by a literal, and there is no literal fallback
 * name: an empty name reads "The browser".
 */
export const CHROME_BAR_COPY = Object.freeze({
    noAppName: 'The browser',
    untitledPage: 'Untitled page',
    historyReadFailed: (subject: string) => `${subject} couldn't read this tab's history. Use Back and Forward to move one page at a time.`,
    showHomeButtonDescription: 'Show the Home button next to Reload.',
    homeFailed: (subject: string) => `${subject} can't open your home page. Press Enter to change it in Settings.`,
    homePageDescription: 'The page the Home button and Alt+Home open, such as https://example.com. Leave it empty to open an empty page.',
    noSearch: (subject: string) => `${subject} can't search right now. Type a full address, such as https://example.com, and press Enter.`,
});

/** The sentence subject naming the product: the configured application name, or "The browser". */
export function appSubject(): string {
    return FrontendApplicationConfigProvider.get().applicationName?.trim() || CHROME_BAR_COPY.noAppName;
}

const HISTORY_LABEL_MAX = 60;

/** A history-menu label: New Tab for the empty page, else title, else URL, else "Untitled page"; cut to 57 + "…" past 60. */
export function historyLabel(entry: WebTabHistoryEntry): string {
    const label = entry.url === EMPTY_PAGE_URL ? NEW_TAB_LABEL : (entry.title || entry.url || CHROME_BAR_COPY.untitledPage);
    return label.length > HISTORY_LABEL_MAX ? `${label.slice(0, HISTORY_LABEL_MAX - 3)}…` : label;
}
