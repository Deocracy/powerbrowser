/**
 * UPD-20/21/22/23/32 (46-02): the single site for every in-app-update string
 * the user can read: notification bodies, status-bar text, button labels and
 * command titles. The update client (tab-uris) imports these; no literal
 * user-facing string lives in the client (the update-copy row
 * scripts/verify-update-copy.mjs checks that by derivation).
 *
 * Key suffix is the classification the row derives: Title (a command or
 * notification title), Body (a notification sentence that must end with a
 * next step wired to a button in the client), Status (status-bar text; a
 * progress message ends with an ellipsis, anything else ends with a next
 * step), Label (a button label, the affordance a Body or Status names).
 *
 * Copy contract (REQUIREMENTS.md, verbatim seed values): every body names
 * "PowerBrowser", carries no pref key, port, timeout, sentinel or exception
 * text, and ends with the affordance it names. The version interpolates at
 * render, never stored.
 */
export const POWERBROWSER_UPDATE_COPY = Object.freeze({
    readyTitle: 'PowerBrowser update is ready',
    readyBody: 'PowerBrowser <version> is ready to install. Restart PowerBrowser to finish updating.',
    cannotUpdateBody: 'PowerBrowser cannot update this copy because its folder is read-only. Unpack PowerBrowser somewhere you own, or install it with your package manager.',
    cannotUpdateMacBody: 'PowerBrowser cannot update itself from this location. Move PowerBrowser to your Applications folder, then open it again.',
    couldNotCheckBody: 'PowerBrowser could not check for updates. Check your internet connection, then choose Check again.',
    restartNothingStagedBody: 'PowerBrowser has no update ready to install. Choose Check now to look for one.',
    checkNotStartedBody: 'PowerBrowser did not start an update check. Updates may be turned off for this copy. Choose Try again to retry.',
    restartUnavailableBody: 'PowerBrowser could not restart to update. Close PowerBrowser, open it again, then choose Try again.',
    restartToUpdateTitle: 'PowerBrowser: Restart to Update',
    checkForUpdatesTitle: 'PowerBrowser: Check for Updates',
    checkingStatus: 'PowerBrowser: checking for updates…',
    availableStatus: 'PowerBrowser: an update is downloading…',
    readyStatus:'PowerBrowser update is ready. Choose Restart now to finish updating.',
    cannotUpdateStatus: 'PowerBrowser: this copy cannot update. Choose Open download page to get a new copy.',
    checkFailedStatus: 'PowerBrowser: update check failed. Choose Check again to retry.',
    restartNowLabel: 'Restart now',
    laterLabel: 'Later',
    openDownloadPageLabel: 'Open download page',
    checkAgainLabel: 'Check again',
    checkNowLabel: 'Check now',
    tryAgainLabel: 'Try again',
});

export type PowerBrowserUpdateCopy = typeof POWERBROWSER_UPDATE_COPY;

/**
 * The page "Open download page" opens: the product site, the one public URL
 * the tree names (no release page exists yet). Opened through the stock
 * browser-window command, never a bespoke window.
 */
export const POWERBROWSER_DOWNLOAD_URL = 'https://powerbrowser.org/';
