/**
 * Phase 30 (SMODE-01..03): the address bar's mode table -- the mode ids, the
 * local modes in menu order, the default mode per PowerBrowser mode (D-03)
 * and what each mode may send to chrome while typing.
 *
 * Pure on purpose: the address bar imports it, and so does
 * scripts/verify-address-bar-modes.mjs under Node's type stripping. It has no
 * import statement and uses only syntax Node strips natively (annotations,
 * interfaces, type aliases; no enum, namespace or parameter property), so it
 * must stay dependency-free. Labels are copy and live in CHROME_BAR_COPY.
 */

export type LocalModeId = 'address' | 'command-centre' | 'bookmarks' | 'tabs' | 'history' | 'actions';

/** A local mode, or one engine's mode (D-07: generated from chrome's engine list, never a second list). */
export type ModeId = LocalModeId | `engine:${string}`;

/** A local mode's static fields; its label and rows come from its contribution. */
export interface LocalModeEntry {
    id: LocalModeId;
    iconClass: string;
    restrictToken?: string;
    /** The modes menu group (D-08): top sits above the engines, local below them. */
    group: 'top' | 'local';
}

/** The local modes in D-08 menu order. Address is not a menu row: it is the mode button's own form. */
export const LOCAL_MODES: readonly LocalModeEntry[] = Object.freeze([
    { id: 'command-centre', iconClass: 'codicon-compass', group: 'top' },
    { id: 'bookmarks', iconClass: 'codicon-star-full', restrictToken: '*', group: 'local' },
    { id: 'tabs', iconClass: 'codicon-browser', restrictToken: '%', group: 'local' },
    { id: 'history', iconClass: 'codicon-history', restrictToken: '^', group: 'local' },
    { id: 'actions', iconClass: 'codicon-zap', restrictToken: '>', group: 'local' },
]);

/** D-03: the default mode per PowerBrowser mode id (the lowercased ids the bar sends); the only place a default is written. */
export const DEFAULT_MODE_BY_UI_MODE: Readonly<Record<string, LocalModeId>> = Object.freeze({
    coding: 'command-centre',   // Chris, 2026-10-20
    browsing: 'address',        // D-01, Chris 2026-10-21
    organising: 'tabs',         // D-02, Chris 2026-10-21
});

/**
 * The default mode for `uiMode`: the table's value when `available` says that
 * mode is contributed, else Address. An unknown or custom id is Address (D-17).
 */
export function defaultModeFor(uiMode: string, available: (id: LocalModeId) => boolean): LocalModeId {
    const value = Object.prototype.hasOwnProperty.call(DEFAULT_MODE_BY_UI_MODE, uiMode) ? DEFAULT_MODE_BY_UI_MODE[uiMode] : undefined;
    return value !== undefined && (value === 'address' || available(value)) ? value : 'address';
}

/** What a mode may send to chrome while typing: the resolve, the engine's suggestions, autofill, Places. */
export interface ModeSends {
    resolve: boolean;
    suggestions: boolean;
    autofill: boolean;
    places: boolean;
}

/** One row per mode kind: address, engine, and each LOCAL_MODES id. Command centre sends nothing (D-26). */
export const MODE_SENDS: Readonly<Record<string, ModeSends>> = Object.freeze({
    'address': { resolve: true, suggestions: true, autofill: true, places: true },
    'engine': { resolve: true, suggestions: true, autofill: false, places: false },
    'command-centre': { resolve: false, suggestions: false, autofill: false, places: false },
    'bookmarks': { resolve: false, suggestions: false, autofill: false, places: true },
    'tabs': { resolve: false, suggestions: false, autofill: false, places: false },
    'history': { resolve: false, suggestions: false, autofill: false, places: true },
    'actions': { resolve: false, suggestions: false, autofill: false, places: false },
});

const ENGINE_MODE_PREFIX = 'engine:';

/** The mode id of the engine named `name`. */
export function engineModeId(name: string): ModeId {
    return `${ENGINE_MODE_PREFIX}${name}` as ModeId;
}

/** The engine name of an engine mode, else undefined. */
export function engineNameOf(mode: string): string | undefined {
    return mode.startsWith(ENGINE_MODE_PREFIX) ? mode.slice(ENGINE_MODE_PREFIX.length) : undefined;
}

/** The MODE_SENDS row key for a mode: 'engine' for every engine mode, else the mode id. */
export function modeKindOf(mode: ModeId): string {
    return engineNameOf(mode) === undefined ? mode : 'engine';
}
