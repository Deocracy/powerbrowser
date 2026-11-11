/**
 * Phase 66 (BRW-05; P66-24, P66-25, D-19): where each user-facing tool of Orca's
 * browser lives in PowerBrowser.
 *
 * The inventory is spike 005's table (.planning/spikes/005-orca-browser-parity/README.md,
 * "User-facing tools", rows U-01..U-30). Each row maps to exactly one of:
 * - { command }: a Theia command id registered by a PB extension;
 * - { render }: a render method of the chrome bar widget, called in its render tree;
 * - { webTabKind }: a web-tab message kind (not `kind:`, which verify-web-tab-bridge.mjs reads as a sender) classified in scripts/verify-web-tab-bridge.mjs;
 * - { skip }: the spike's reason the tool has no PB counterpart;
 * - { deferred }: the v2 requirement id in REQUIREMENTS.md that carries it.
 * orca-browser-tools compares the U-row set with this record's keys both ways and
 * proves each mapped contribution exists in the tree.
 *
 * No import: the check transpiles and evaluates this file on its own.
 */

export type OrcaBrowserToolHome =
    | { readonly command: string }
    | { readonly render: string }
    | { readonly webTabKind: string }
    | { readonly skip: string }
    | { readonly deferred: string };

export const ORCA_BROWSER_TOOLS: Readonly<Record<string, OrcaBrowserToolHome>> = Object.freeze({
    // Chrome bar (spike: "chrome bar"); workspace-doc suggestions are skipped, no PB source.
    'U-01': { command: 'powerbrowser.chrome-bar.focus-address' },
    // Spike: existing back, forward, reload; Back stands for the row.
    'U-02': { command: 'powerbrowser.chrome-bar.back' },
    // Spike: native, PAGE-01.
    'U-03': { command: 'powerbrowser.chrome-bar.find-in-page' },
    // Spike: native, PAGE-02.
    'U-04': { command: 'powerbrowser.chrome-bar.zoom-in' },
    // Spike: native, webTabDevtools exists.
    'U-05': { command: 'powerbrowser.chrome-bar.devtools' },
    'U-06': { deferred: 'BRW-06' },
    'U-07': { deferred: 'BRW-06' },
    'U-08': { deferred: 'BRW-07' },
    // The new mark (P66-21).
    'U-09': { render: 'renderAgentControl' },
    'U-10': { skip: 'no UI: a requirement on the agent input rows (spike Q3)' },
    // Spike: native, PB history; the hamburger History submenu and its Clear Recent History row.
    'U-11': { command: 'powerbrowser.chrome-bar.clear-history' },
    // PB has its own new-tab page; only the dev-server tile is deferred.
    'U-12': { deferred: 'BRW-08' },
    // Spike: native, webTabDownloads*.
    'U-13': { command: 'powerbrowser.chrome-bar.downloads' },
    // Spike: native; a page's new window lands as a web tab through the adopt ack (PROMPT-05).
    'U-14': { webTabKind: 'webTabAdopt' },
    // Spike: native; Gecko's own page prompt in the overlay browser webTabOpen creates (agent side dialogAccept/dialogDismiss).
    'U-15': { webTabKind: 'webTabOpen' },
    // Spike: native; Gecko's certificate error page in the overlay, the certificate block of the site panel.
    'U-16': { webTabKind: 'webTabSiteInfo' },
    // Spike: native, webTabPermission*, webTabSiteInfo.
    'U-17': { webTabKind: 'webTabSetPermission' },
    // Spike: native, PB's page context menu.
    'U-18': { webTabKind: 'webTabContextMenuAction' },
    'U-19': { skip: 'one PowerBrowser profile in v1.7' },
    'U-20': { skip: "anti-feature; Firefox's own import covers it" },
    'U-21': { skip: 'PowerBrowser has its own extension track' },
    'U-22': { skip: 'tier 2 at the earliest' },
    // Spike: native; Orca-originated links open as PB web tabs through the client host (Q6), which opens them with webTabOpen.
    'U-23': { webTabKind: 'webTabOpen' },
    'U-24': { skip: 'anti-feature' },
    'U-25': { skip: 'PowerBrowser has its own egress allow-list' },
    'U-26': { skip: 'later; Theia previews local files' },
    // Spike: native, webTabViewSource; the open-browser-window command covers the second half.
    'U-27': { command: 'powerbrowser.chrome-bar.view-source' },
    'U-28': { skip: 'Orca mobile only' },
    'U-29': { skip: "replaced by PowerBrowser tabs; Orca's entry point is hidden" },
    // Spike: existing keybindings (chrome-bar-keybindings.ts bind the chrome-bar commands); Reload stands for the set.
    'U-30': { command: 'powerbrowser.chrome-bar.reload' },
});
