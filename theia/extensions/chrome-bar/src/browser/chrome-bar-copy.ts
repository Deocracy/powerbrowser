import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
import { EMPTY_PAGE_URL, NEW_TAB_LABEL, WebTabHistoryEntry } from '@powerbrowser/tab-uris/lib/browser/web-tab';

/** A byte count for a download caption: KB or MB, one decimal. Not copy: it formats a number. */
export function downloadBytes(bytes: number): string {
    return bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

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
    // Phase 32 plan 04 (PAGE-06): the downloads button and panel (32-UI-SPEC Copywriting Contract).
    downloads: 'Downloads',
    downloadsCount: (count: number) => `${count} downloads`,
    noDownloads: 'No downloads yet.',
    noDownloadsHint: 'Files you download appear here.',
    openDownload: 'Open',
    showInFolder: 'Show in folder',
    cancelDownload: 'Cancel',
    retryDownload: 'Retry',
    downloadProgress: (percent: number, bytes: string) => `${percent}% — ${bytes}`,
    downloadFailed: 'Failed — Retry',
    // Phase 32 plan 02 (PAGE-01, PAGE-02, PAGE-05): the find bar, the zoom chip and the audio mark (32-UI-SPEC Copywriting Contract).
    findLabel: 'Find in page',
    findCount: (current: number, total: number) => `${current} of ${total}`,
    findNotFound: 'Phrase not found',
    findHighlightAll: 'Highlight all',
    findMatchCase: 'Match case',
    findWholeWords: 'Whole words',
    findNextMatch: 'Next match (F3)',
    findPreviousMatch: 'Previous match (Shift+F3)',
    findClose: 'Close find bar (Esc)',
    zoomPercent: (percent: number) => `${percent}%`,
    zoomChipTooltip: 'Zoom level — select to reset to 100%',
    zoomIn: 'Zoom in (Ctrl++)',
    zoomOut: 'Zoom out (Ctrl+−)',
    zoomReset: 'Reset zoom (Ctrl+0)',
    muteTab: 'Mute tab',
    unmuteTab: 'Unmute tab',
    // Phase 32 plan 08 (PAGE-10): the reader toggle and view source (32-UI-SPEC Copywriting Contract, Reader toggle and View source).
    readerView: 'Reader view',
    exitReaderView: 'Exit reader view',
    readerUnavailable: "Reader view isn't available for this page",
    viewSourceTooltip: 'View page source (Ctrl+U)',
    // Phase 32 plan 03 (PAGE-03): the print notice (32-UI-SPEC Copywriting Contract, Print failure).
    printFailed: (subject: string) => `${subject} couldn't open the print dialog. Press Ctrl+P to try again.`,
    // Phase 32 plan 05 (PAGE-08): the save dialog title and the save failure notice (32-UI-SPEC Copywriting Contract, Save page).
    savePageTitle: 'Save page as',
    saveFailed: (subject: string) => `${subject} couldn't save that page. Choose a different place and try again.`,
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
    // Phase 30 (SMODE-06): the Go-to row; {address} is the text as typed.
    goTo: (address: string) => `Go to ${address}`,
    // Phase 31 (SITE-01..03): the identity box and the site panel shell.
    // Every pill/panel string lives here; TSX carries no literal.
    connectionSecure: 'Connection secure',
    connectionInsecure: 'Not Secure',
    connectionWarning: 'This page has a security problem',
    connectionLocal: 'This page is served from this device',
    sitePanelOpen: (host: string) => `Show site information for ${host}`,
    identitySecureLabel: (host: string) => `Connection secure, show site information for ${host}`,
    identityInsecureLabel: (host: string) => `Not Secure, show site information for ${host}`,
    identityWarningLabel: (host: string) => `Security problem, show site information for ${host}`,
    identityLocalLabel: (host: string) => `Local page, show site information for ${host}`,
    siteConnectionSecure: 'Connection secure',
    siteConnectionInsecure: 'Connection not secure',
    siteConnectionWarning: (host: string) => `There is a security problem with ${host}`,
    siteConnectionLocal: (host: string) => `Local page on ${host}`,
    siteUnavailable: (subject: string) => `${subject} can't show site information for this page. Try reloading the page.`,
    // Phase 31 plan 02 (SITE-04..06): the panel's permission rows and certificate block.
    permissionsHeading: 'Permissions',
    noPermissions: 'No special permissions set for this site',
    permissionAllow: 'Allowed',
    permissionBlock: 'Blocked',
    permissionBlockAudible: 'Block sounds',
    permissionBlockAll: 'Block all',
    permissionDefault: 'Use default',
    permissionLabelFallback: 'Site permission',
    permissionControlLabel: (permission: string, host: string, state: string) => `${permission} for ${host}: ${state}`,
    permissionIconsTip: (labels: string) => `Site permissions set: ${labels}`,
    permissionOverflow: (count: number) => `+${count}`,
    certificateHeading: 'Certificate',
    certIssuedTo: (name: string) => `Issued to: ${name}`,
    certIssuedBy: (name: string) => `Issued by: ${name}`,
    certValid: (dates: string) => `Valid: ${dates}`,
    certDates: (from: string, to: string) => `${from} to ${to}`,
    // Phase 31 plan 03 (SITE-07, UI-SPEC clear-data row): the row, its confirm and the failure notice.
    clearDataRow: 'Clear cookies and site data…',
    clearDataTitle: (site: string) => `Clear data for ${site}?`,
    clearDataScope: (site: string) => `This clears cookies and site data for ${site} and all of its subdomains.`,
    // WR-06: the tab-store deletion is disclosed (closed-tab rows for the site are removed, not only thumbnails).
    clearDataClosedTabs: (site: string) => `Closed tabs for ${site} are removed too.`,
    clearDataStaysSignedIn: (subject: string) => `You stay signed in to ${subject}.`,
    clearDataConfirm: 'Clear',
    clearDataCancel: 'Cancel',
    clearDataFailed: (subject: string) => `${subject} couldn't clear data for this site. Try again from the site information panel.`,
    // Phase 31 plan 03 (SITE-08, UI-SPEC shield rows): the count line, the exception toggle and the box tooltip.
    shieldClean: 'No trackers detected on this page',
    trackerBlockedOne: '1 tracker blocked',
    trackersBlocked: (count: number) => `${count} trackers blocked`,
    shieldTurnOff: 'Turn off protection for this site',
    shieldTurnOn: 'Turn protection back on',
    shieldExcepted: 'Tracking protection is off for this site',
    // Phase 31 plan 04 (MENU-01/02, UI-SPEC hamburger): the button, the rows and the captions.
    appMenu: 'Application menu',
    menuNewTab: 'New Tab',
    menuSettings: 'Settings',
    menuPasswords: 'Passwords',
    menuAddons: 'Add-ons',
    menuHelp: 'Help',
    // Phase 31 plan 05: a text badge, not a Theia accelerator: the Ctrl+Q key is chrome's reserved <key> row (powerbrowser.js).
    menuQuit: (subject: string) => `Quit ${subject} (Ctrl+Q)`,
    comingSoonRow: (label: string) => `${label} (Coming soon)`,
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
