import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
import { EMPTY_PAGE_URL, NEW_TAB_LABEL, NotificationBar, NotificationBarText, WebTabHistoryEntry } from '@powerbrowser/tab-uris/lib/browser/web-tab';

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
    // Phase 37 plan 01 (D-11): the tab strip's pending-prompt mark. The stock prompt's own strings are not copied here.
    pendingPrompt: 'This page asked for a permission. Open the tab to answer it.',
    // Phase 37 plan 02 (D-05): the sharing indicator's tooltip, one per kind (37-UI-SPEC copy row).
    sharingCamera: (subject: string) => `${subject} is sharing your camera with this tab.`,
    sharingMicrophone: (subject: string) => `${subject} is sharing your microphone with this tab.`,
    sharingScreen: (subject: string) => `${subject} is sharing your screen with this tab.`,
    // Phase 37 plan 04 (D-08, D-10): the notification bars (37-UI-SPEC copy rows). Counts are chrome-computed numbers.
    barPopupBlocked: (subject: string, count: number) => count === 1 ? `${subject} blocked a popup from this page.` : `${subject} blocked ${count} popups from this page.`,
    barRedirectBlocked: (subject: string) => `${subject} stopped this page from sending you to another page.`,
    barAllow: 'Allow',
    barDismiss: 'Dismiss',
    barHungScript: 'A script on this page is taking too long.',
    barStopScript: 'Stop script',
    barKeepWaiting: 'Keep waiting',
    barProtocolHandler: (host: string, scheme: string) => `Allow ${host} to open ${scheme} links?`,
    barAddHandler: 'Add',
    barDenyHandler: "Don't allow",
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
    // Phase 34 plan 01 (TAB-01, BMK-07): the tab menu's rows (34-UI-SPEC Copywriting Contract). Keyed by row.
    tabMenu: Object.freeze({
        reload: 'Reload',
        mute: 'Mute Tab',
        unmute: 'Unmute Tab',
        pin: 'Pin Tab',
        unpin: 'Unpin Tab',
        duplicate: 'Duplicate Tab',
        bookmark: 'Bookmark Tab',
        bookmarkAll: 'Bookmark All Tabs',
        moveToStart: 'Move to Start',
        moveToEnd: 'Move to End',
        closeOthers: 'Close Other Tabs',
        closeLeft: 'Close Tabs to the Left',
        closeRight: 'Close Tabs to the Right',
        closeDuplicates: 'Close Duplicate Tabs',
        close: 'Close Tab',
        // Phase 34 plan 03 (TAB-06): the bulk rows a selection of two or more tabs offers; N is the selection count.
        closeN: (count: number) => `Close ${count} Tabs`,
        moveNToStart: (count: number) => `Move ${count} Tabs to Start`,
        moveNToEnd: (count: number) => `Move ${count} Tabs to End`,
        muteN: (count: number) => `Mute ${count} Tabs`,
        unmuteN: (count: number) => `Unmute ${count} Tabs`,
        bookmarkN: (count: number) => `Bookmark ${count} Tabs`,
    }),
    // One failure sentence per verb (34-UI-SPEC Failures), shown in the strip; never an id, URL or raw error.
    reloadTabFailed: (subject: string) => `${subject} couldn't reload that tab. Try again.`,
    muteTabFailed: (subject: string) => `${subject} couldn't mute that tab. Try again.`,
    duplicateTabFailed: (subject: string) => `${subject} couldn't duplicate that tab. Try again.`,
    bookmarkTabFailed: (subject: string) => `${subject} couldn't bookmark that tab. Try again.`,
    closeTabFailed: (subject: string) => `${subject} couldn't close that tab. Try again.`,
    // Phase 34 plan 02 (TAB-03, TAB-08): the empty strip's tooltip, and the sentence for a dropped link the strip refuses.
    emptyStripTooltip: 'Double-click to open a new tab',
    dropTabFailed: (subject: string) => `${subject} can't open that link in a tab. Drop a link to a web page instead.`,
    // Phase 34 plan 02 (TAB-04): the overflow chevron's tooltip and label.
    listAllTabs: 'List All Tabs',
    // Phase 34 plan 03 (TAB-05): a pinned tab shows its icon only; its accessible name keeps the label and says so.
    pinnedTabLabel: (label: string) => `${label}, pinned`,
    // Phase 34 plan 04 (TAB-09): a background tab whose title changed since it was last active: the tooltip addition
    // and the accessible-name addition beside the attention dot.
    updatedTabTooltip: (label: string) => `${label} — Updated`,
    updatedTabLabel: (label: string) => `${label}, updated`,
    // Phase 35 plan 03 (PROMPT-04, 35-UI-SPEC Refused target): the page menu's row for a link the shell cannot open.
    pageMenuRefusedLink: (subject: string) => `${subject} can't open that link here. Choose Copy Link to copy it instead.`,
    // 35-REVIEW WR-06: a page menu row chrome refused or that failed after the menu offered it.
    pageMenuRowRefused: (subject: string) => `${subject} couldn't do that on this page. Right-click the page to choose something else.`,
    // Phase 35 plan 04 (PROMPT-04): the save dialog titles of the page menu's save rows, and their failure line.
    saveLinkTitle: 'Save link as',
    saveImageTitle: 'Save image as',
    saveVideoTitle: 'Save video as',
    saveAudioTitle: 'Save audio as',
    saveTargetFailed: (subject: string) => `${subject} couldn't save that file. Choose a different place and try again.`,
    saveTargetExpired: (subject: string) => `${subject} didn't save that file because its menu had already closed. Right-click it again and choose the save option.`,
    // Phase 33 plan 02 (BMK-01, BMK-02): the star and its editor (33-UI-SPEC Copywriting Contract); {shortcut} is the bound key's label.
    bookmarkStarTip: (shortcut: string) => `Bookmark this page (${shortcut})`,
    editBookmarkTip: (shortcut: string) => `Edit this bookmark (${shortcut})`,
    cantBookmark: "You can't bookmark this page",
    editBookmarkHeading: 'Edit bookmark',
    bookmarkPageHeading: 'Bookmark this page',
    bookmarkName: 'Name',
    bookmarkFolder: 'Folder',
    bookmarkFolderToolbar: 'Bookmarks Toolbar',
    bookmarkFolderMenu: 'Bookmarks Menu',
    bookmarkFolderOther: 'Other Bookmarks',
    removeBookmark: 'Remove bookmark',
    bookmarkCancel: 'Cancel',
    bookmarkDone: 'Done',
    bookmarkSaveFailed: (subject: string) => `${subject} couldn't save that bookmark. Press Enter to try again.`,
    bookmarkRemoveFailed: (subject: string) => `${subject} couldn't remove that bookmark. Press Enter to try again.`,
    // Phase 33 plan 03 (BMK-04): the bookmarks toolbar row, its overflow chevron, its item menu and its setting.
    showBookmarksToolbarDescription: 'Show the bookmarks toolbar below the address bar.',
    bookmarksToolbar: 'Bookmarks toolbar',
    bookmarksToolbarMore: 'More bookmarks',
    bookmarksToolbarFailed: (subject: string) => `${subject} couldn't load your bookmarks toolbar. Press Ctrl+Shift+B twice to try again.`,
    bookmarkOpen: 'Open',
    bookmarkOpenInNewTab: 'Open in New Tab',
    // Phase 33 plan 03 (BMK-03, BMK-06): the hamburger's History submenu.
    menuHistory: 'History',
    reopenClosedTab: 'Reopen Closed Tab',
    recentlyClosedTabs: 'Recently closed tabs',
    recentPages: 'Recent pages',
    noClosedTabs: 'No recently closed tabs.',
    noRecentPages: 'No recent pages.',
    historyMenuFailed: (subject: string) => `${subject} couldn't read your history. Open this menu again to try again.`,
    // Phase 33 plan 04 (BMK-05, D-10): the History submenu's clear row and the range picker it opens.
    clearRecentHistoryRow: 'Clear Recent History…',
    clearHistoryHeading: 'Clear Recent History',
    clearHistoryLastHour: 'Last hour',
    clearHistoryLast2Hours: 'Last 2 hours',
    clearHistoryLast4Hours: 'Last 4 hours',
    clearHistoryToday: 'Today',
    clearHistoryEverything: 'Everything',
    clearHistoryFootnote: (subject: string) => `This also clears ${subject}'s closed tabs, thumbnails, saved pages and web-tab history. Your open tabs stay open.`,
    clearHistoryConfirm: 'Clear',
    clearHistoryCancel: 'Cancel',
    clearHistoryFailed: (subject: string) => `${subject} couldn't clear that history. Press Enter to try again.`,
    // Phase 33 plan 05 (MENU-03): the hamburger's new rows and submenus (33-UI-SPEC strings, Firefox's casing).
    menuNewWindow: 'New Window',
    menuBookmarks: 'Bookmarks',
    menuDownloads: 'Downloads',
    menuPrint: 'Print…',
    menuSavePage: 'Save Page As…',
    menuFindInPage: 'Find in Page…',
    menuZoom: 'Zoom',
    menuFullScreen: 'Full Screen',
    menuMoreTools: 'More Tools',
    bookmarkThisPageRow: 'Bookmark This Page',
    showBookmarksToolbarRow: 'Show Bookmarks Toolbar',
    bookmarksMenuFailed: (subject: string) => `${subject} couldn't read your bookmarks. Open this menu again to try again.`,
    zoomInRow: 'Zoom In',
    zoomOutRow: 'Zoom Out',
    zoomResetRow: 'Reset',
    zoomLevelRow: (percent: number) => `Zoom: ${percent}%`,
    pageSourceRow: 'Page Source',
    readerViewRow: 'Reader View',
    pageDevToolsRow: 'Page Developer Tools',
    getHelpRow: 'Get Help',
    aboutAppRow: (subject: string) => `About ${subject}`,
    // Phase 33 plan 05 (PAGE-09): the Edit submenu, stock labels (32-UI-SPEC Edit menu).
    menuEdit: 'Edit',
    editUndoRow: 'Undo',
    editRedoRow: 'Redo',
    editCutRow: 'Cut',
    editCopyRow: 'Copy',
    editPasteRow: 'Paste',
    editSelectAllRow: 'Select All',
    // Phase 38 plan 02 (EXT-06, 38-UI-SPEC Copywriting): the extension buttons and the puzzle menu. An extension is named
    // by the title chrome pushes, never by its id.
    extensionsButton: 'Extensions',
    extensionsPinnedHeading: 'Pinned',
    extensionsHeading: 'Extensions',
    extensionsEmptyHeading: 'No extensions installed',
    extensionsEmptyBody: (subject: string) => `Install one from ${subject} Add-ons.`,
    extensionsInstallFooter: 'Install from add-ons site',
    extensionDisabledCaption: 'Disabled for this page',
    extensionOptions: (name: string) => `Options for ${name}`,
    manageExtensionRow: 'Manage Extension',
    extensionBridgeFailed: (subject: string) => `${subject} could not reach the extension. Restart ${subject} and try again.`,
});

/** The sentence subject naming the product: the configured application name, or "The browser". */
export function appSubject(): string {
    return FrontendApplicationConfigProvider.get().applicationName?.trim() || CHROME_BAR_COPY.noAppName;
}

/** Phase 37 plan 04 (D-08): a notification bar's message and labels; an action left without a label is not offered. */
export function notificationBarCopy(bar: NotificationBar): NotificationBarText | undefined {
    const fields = bar.displayFields;
    if (bar.barKind === 'blocked-popup') {
        const count = typeof fields.popupCount === 'number' ? fields.popupCount : 0;
        return count > 0
            ? { message: CHROME_BAR_COPY.barPopupBlocked(appSubject(), count), labels: { 'allow-popup': CHROME_BAR_COPY.barAllow, dismiss: CHROME_BAR_COPY.barDismiss } }
            : { message: CHROME_BAR_COPY.barRedirectBlocked(appSubject()), labels: { dismiss: CHROME_BAR_COPY.barDismiss } };
    }
    if (bar.barKind === 'hung-script') {
        return { message: CHROME_BAR_COPY.barHungScript, labels: { 'stop-script': CHROME_BAR_COPY.barStopScript, 'wait-longer': CHROME_BAR_COPY.barKeepWaiting }, destructive: ['stop-script'] };
    }
    if (bar.barKind === 'protocol-handler' && typeof fields.displayHost === 'string' && typeof fields.scheme === 'string') {
        return { message: CHROME_BAR_COPY.barProtocolHandler(fields.displayHost, fields.scheme), labels: { 'add-handler': CHROME_BAR_COPY.barAddHandler, 'deny-handler': CHROME_BAR_COPY.barDenyHandler } };
    }
    return undefined;
}

const HISTORY_LABEL_MAX = 60;

/** A history-menu label: New Tab for the empty page, else title, else URL, else "Untitled page"; cut to 57 + "…" past 60. */
export function historyLabel(entry: WebTabHistoryEntry): string {
    const label = entry.url === EMPTY_PAGE_URL ? NEW_TAB_LABEL : (entry.title || entry.url || CHROME_BAR_COPY.untitledPage);
    return label.length > HISTORY_LABEL_MAX ? `${label.slice(0, HISTORY_LABEL_MAX - 3)}…` : label;
}
