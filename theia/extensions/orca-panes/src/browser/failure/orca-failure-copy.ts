/**
 * Phase 67 (RUN-06; P67-02, P67-18, P67-30, P67-36): every word the Orca
 * failure page shows. One sentence per class names PowerBrowser, states the
 * problem plainly and ends with a step a button on the page performs (01-UI-SPEC
 * copywriting contract; 01-13: the stated step and the rendered buttons are one
 * fact). No other orca-panes file holds a sentence of this page; identifiers the
 * sentences omit are rows in chrome's diagnostics layer.
 *
 * Imports nothing, so a Node check can type-strip and import it
 * (shell-error-copy-no-internals, orca-failure-classes, orca-credential-store).
 */

/** The eight classes, in order (interfaces block; browser-not-attached is P67-36, D-33). */
export type OrcaFailureClass =
    | 'restarting'
    | 'could-not-start'
    | 'port-in-use'
    | 'files-missing'
    | 'temporary-profile'
    | 'plaintext-setting'
    | 'pairing-lost'
    | 'browser-not-attached';

export type OrcaFailureButton = 'restart' | 'reconnect' | 'details';

/** P67-18: byte-identical to privacy.html's data-orca-credential-protection paragraph and OrcaEnv's constant. */
export const ORCA_PROTECTION_SENTENCE = "PowerBrowser protects Orca sign-ins with a key file that only your user account can read, not with your system's keyring.";

/** protection: the class adds ORCA_PROTECTION_SENTENCE as a second line (the two RUN-09 classes). */
export const ORCA_FAILURE_COPY: Record<OrcaFailureClass, { message: string; protection: boolean }> = {
    'restarting': {
        message: "PowerBrowser's Orca server stopped and is starting again. This tab comes back when it is ready; open Details if it doesn't.",
        protection: false,
    },
    'could-not-start': {
        message: "PowerBrowser couldn't start Orca. Choose Restart Orca, or open Details to see the error.",
        protection: false,
    },
    'port-in-use': {
        message: "PowerBrowser couldn't start Orca because another program is using the connection Orca needs. Close other copies of Orca, then choose Restart Orca, or open Details.",
        protection: false,
    },
    'files-missing': {
        message: "PowerBrowser can't find its Orca files. This build looks incomplete. Reinstall, or open Details for the missing path.",
        protection: false,
    },
    'temporary-profile': {
        message: "PowerBrowser won't start Orca from a temporary profile, because Orca would keep your sign-ins there without protection. Open PowerBrowser with a regular profile, or open Details.",
        protection: true,
    },
    'plaintext-setting': {
        message: "PowerBrowser won't start Orca while a setting asks it to save sign-ins without encryption. Remove that setting and restart PowerBrowser, or open Details to see its name.",
        protection: true,
    },
    'pairing-lost': {
        message: "PowerBrowser lost its connection to Orca's server. Choose Reconnect, or open Details if this keeps happening.",
        protection: false,
    },
    'browser-not-attached': {
        message: "PowerBrowser couldn't connect Orca's agents to its web tabs, so agents can't open pages. Choose Reconnect, or open Details if this keeps happening.",
        protection: false,
    },
};

/** The buttons each class renders, in order (interfaces block). */
export const ORCA_FAILURE_BUTTONS: Record<OrcaFailureClass, readonly OrcaFailureButton[]> = {
    'restarting': ['details'],
    'could-not-start': ['restart', 'details'],
    'port-in-use': ['restart', 'details'],
    'files-missing': ['details'],
    'temporary-profile': ['details'],
    'plaintext-setting': ['details'],
    'pairing-lost': ['reconnect', 'details'],
    'browser-not-attached': ['reconnect', 'details'],
};

export const ORCA_BUTTON_LABELS: Record<OrcaFailureButton, string> = {
    restart: 'Restart Orca',
    reconnect: 'Reconnect',
    details: 'Details',
};

/**
 * Each ORCA_CLIENT_REASONS member (the frontend's closed set) to its class: Orca's
 * WebRuntimeAuthFailureReason members and PowerBrowser's offer-file refusals are
 * pairing-lost; browser-host-attach-failed is browser-not-attached (P67-36).
 */
export const ORCA_CLIENT_REASON_CLASS: Record<string, OrcaFailureClass> = {
    'unauthorized': 'pairing-lost',
    'device-revoked': 'pairing-lost',
    'device-downgraded': 'pairing-lost',
    'insecure-origin': 'pairing-lost',
    'offer-missing': 'pairing-lost',
    'offer-unreadable': 'pairing-lost',
    'offer-symlink': 'pairing-lost',
    'offer-not-regular': 'pairing-lost',
    'offer-owner': 'pairing-lost',
    'offer-mode': 'pairing-lost',
    'offer-endpoint': 'pairing-lost',
    'browser-host-attach-failed': 'browser-not-attached',
};
