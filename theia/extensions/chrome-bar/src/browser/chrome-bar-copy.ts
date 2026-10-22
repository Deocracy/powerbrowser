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
    searchOrEnterAddress: 'Search or enter address',
    searchPlaceholder: (engine: string) => `Search with ${engine} or enter address`,
    defaultSearchEngineDescription: 'The search engine the address bar uses when what you type is not an address.',
    noSearch: (subject: string) => `${subject} can't search right now. Type a full address, such as https://example.com, and press Enter.`,
    visit: 'Visit',
    searchWith: (engine: string) => `Search with ${engine}`,
    dropdownFooter: 'Enter opens · Alt+Enter opens in a new tab · Esc closes suggestions',
    commitFailed: (subject: string) => `${subject} couldn't open that address. Press Enter to try again.`,
    suggestionsFailed: (subject: string) => `${subject} couldn't load suggestions. Press Enter to go to what you typed.`,
    oneOffLabel: 'This time, search with:',
    switchToTab: 'Switch to Tab',
    removeFailed: (subject: string) => `${subject} couldn't remove that page from your history. Press Shift+Delete to try again.`,
    cut: 'Cut',
    copy: 'Copy',
    paste: 'Paste',
    pasteAndGo: 'Paste & Go',
    selectAll: 'Select All',
    pasteFailed: (subject: string) => `${subject} couldn't read the clipboard. Press Ctrl+V to paste, then press Enter.`,
    searchSuggestionsDescription: 'Show suggestions from your search engine while you type in the address bar. What you type is sent to the search engine.',
    // Phase 30 (SMODE-01..03): the address bar's modes. modeLabels is keyed by the LOCAL_MODES ids.
    modeLabels: Object.freeze({
        'command-centre': 'Command centre',
        bookmarks: 'Bookmarks',
        tabs: 'Tabs',
        history: 'History',
        actions: 'Actions',
    }),
    addressModeLabel: 'Address',
    searchSettings: 'Search Settings',
    chooseMode: (label: string) => `${label}, choose a mode`,
    modesMenuLabel: 'Modes',
    returnTo: (label: string) => `Return to ${label}`,
    engineFooter: 'Enter searches · Alt+Enter searches in a new tab · Esc closes suggestions',
    // Phase 30 (SMODE-01): the local modes' lists (30-UI-SPEC "Strings").
    searchTabs: 'Search tabs',
    searchBookmarks: 'Search bookmarks',
    searchHistory: 'Search history',
    searchActions: 'Search actions',
    noOtherTabs: (engine: string) => `No other open tabs. Type an address, or words to search with ${engine}.`,
    noBookmarks: (engine: string) => `No bookmarks yet. Type an address, or words to search with ${engine}.`,
    noHistory: (engine: string) => `No history yet. Type an address, or words to search with ${engine}.`,
    noMatchingTabs: 'No matching tabs.',
    noMatchingBookmarks: 'No matching bookmarks.',
    noMatchingHistory: 'No matching history.',
    noMatchingActions: 'No matching actions. Press Esc to go back.',
    bookmarksFailed: (subject: string) => `${subject} couldn't load your bookmarks. Keep typing to try again.`,
    historyFailed: (subject: string) => `${subject} couldn't load your history. Keep typing to try again.`,
    tabsFooter: 'Enter switches to the tab · Esc closes suggestions',
    actionsFooter: 'Enter runs the action · Esc closes suggestions',
    // Phase 30 (SMODE-05): Command centre's rows and footer; {addressKey} is the address key's shortcut label.
    noRecentFiles: 'No recent files. Type a file name, or > to run a command.',
    noMatchingResults: 'No matching results. Type ? to see what you can search.',
    commandCentreFailed: (subject: string) => `${subject} couldn't load these results. Keep typing to try again.`,
    commandCentreFooter: (addressKey: string) => `Enter opens · Type ? for more · ${addressKey} enters an address · Esc closes`,
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
