/**
 * Phase 64 (TAB-04, TAB-06, TERM-01, TERM-04; P64-05..P64-09, P64-34): the names
 * shared by the orca-panes backend, its frontend and the Orca pane bundle that
 * lane p64-01 builds (interfaces C2, C3, C5, C6, C10).
 *
 * The bridge folder (P64-34) holds two files OrcaService writes after orcad's
 * ready line: the web pairing offer and the bundle directory. The backend
 * reads both, checks they are private, serves the bundle under
 * ORCA_PANES_ROUTE_PREFIX and hands the offer to the authenticated frontend
 * over JSON-RPC only (P64-06, P64-07). The offer is a credential: no log line,
 * URL, environment variable or diagnostics row ever carries it.
 */

/** C5: bridge-folder file names, the literals OrcaEnv spells ORCA_WEB_PAIRING_FILE and ORCA_PANES_DIR_FILE. */
export const WEB_PAIRING_FILE = 'web-pairing';
export const PANES_DIR_FILE = 'orca-panes-dir';

/** C6: the token-gated static route for the bundle directory, and the bundle's two entry files (C1). */
export const ORCA_PANES_ROUTE_PREFIX = '/orca-panes/';
export const ORCA_PANES_ENTRY = 'pb-panes.js';
export const ORCA_PANES_STYLE = 'pb-panes.css';

/** C6: the JSON-RPC path of the hand-off service. */
export const ORCA_PANES_SERVICE_PATH = '/services/powerbrowser-orca-panes';

import type { OfferHandOff } from '../node/offer-file-policy';

export const OrcaPanesService = Symbol('OrcaPanesService');
export interface OrcaPanesService {
    /**
     * The pairing offer orcad issued at its current start, undefined until both bridge files are written, or
     * { refused: <reason code> } when the offer file is not private or not loopback (P67-09). Never logged.
     */
    handOff(): Promise<OfferHandOff>;
}

/** C2: the Symbol.for key under which orca-panes hands Theia's React to the bundle (P64-08). */
export const ORCA_PANES_REACT_KEY = 'powerbrowser.orca-panes.react';

/**
 * C10' (D-32, P64-33): in a hosted Orca terminal the shell keys, the reserved
 * PAGE_KEYS rows with a letter key, reach the shell, as Theia's own terminals
 * give them. The switch keys (Ctrl+Tab, Ctrl+PageUp/PageDown) are not here:
 * they switch PowerBrowser tabs from every tab, terminals included. Literal
 * ctrl, so macOS Cmd keeps PowerBrowser's tab commands. The context key is
 * scoped to each hosted terminal widget's node.
 */
export const ORCA_TERMINAL_PASSTHROUGH_KEYS: readonly string[] = Object.freeze([
    'ctrl+w', 'ctrl+t',
]);
export const ORCA_TERMINAL_FOCUS_KEY = 'powerbrowser.orcaTerminalFocus';
export const ORCA_TERMINAL_KEYS_WHEN = 'powerbrowser.orcaTerminalFocus';

export type OrcaNeighbourMode = 'split-right' | 'split-left' | 'split-bottom' | 'split-top' | 'tab-after';

/** C3: one record per Orca pane of every content type, every worktree (P64-13). key is the pane key for a terminal leaf, the tab id otherwise. */
export interface OrcaPaneRecord {
    key: string;
    kind: string;
    worktreeId: string;
    worktreeLabel: string;
    tabId: string;
    paneKey: string | null;
    browserPageId?: string | null;
    active: boolean;
    title: string;
    /** Nearest first, from Orca's layout; mode is where this pane sits relative to that neighbour. */
    neighbours: Array<{ key: string; mode: OrcaNeighbourMode }>;
}

export interface OrcaPanePick {
    kind: string;
    worktreeId: string;
    tabId: string;
    paneKey: string | null;
}

/** C7: an OrcaPaneWidget's construction options. The name is the pb-orca: address; the ids stay here, never in the address (P64-16). */
export interface OrcaPaneOptions extends OrcaPanePick {
    name: string;
}

/** C3': one Orca worktree as the bundle's state() lists it. */
export interface OrcaWorktree {
    id: string;
    label: string;
    path: string;
}

/** C3: the bundle's named exports this extension calls (orca-pane-routes compares them with the entry's exports). */
export interface OrcaPaneBundleApi {
    bootstrap(options: { pairing: string }): Promise<void>;
    subscribePanes(listener: (panes: OrcaPaneRecord[]) => void): () => void;
    mountPane(element: HTMLElement, pick: OrcaPanePick): () => void;
    closePane(pick: { worktreeId: string; tabId: string; paneKey: string | null }): void;
    createTerminal(worktreeId: string): Promise<void>;
    createChat(worktreeId: string): Promise<void>;
    activeWorktree(): string | null;
    setActiveWorktree(worktreeId: string): void;
    /** C3': worktrees in Orca's own recency order; no credential. */
    state(): { booted: boolean; worktrees: OrcaWorktree[]; panes: number; mountErrors: Array<{ kind: string; phase: string; message: string }> };
    reactIdentity: unknown;
}
