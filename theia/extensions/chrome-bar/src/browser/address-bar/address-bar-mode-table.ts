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
    /** Typed text adds a trailing "Search with {engine}" row (30-UI-SPEC "Result lists by mode"). */
    searchRow?: boolean;
    /** The most rows the mode lists; absent: no cap, the list scrolls. */
    cap?: number;
}

/** The local modes in D-08 menu order. Address is not a menu row: it is the mode button's own form. */
export const LOCAL_MODES: readonly LocalModeEntry[] = Object.freeze([
    { id: 'command-centre', iconClass: 'codicon-compass', group: 'top' },
    { id: 'bookmarks', iconClass: 'codicon-star-full', restrictToken: '*', group: 'local', searchRow: true, cap: 10 },
    { id: 'tabs', iconClass: 'codicon-browser', restrictToken: '%', group: 'local', searchRow: true },
    { id: 'history', iconClass: 'codicon-history', restrictToken: '^', group: 'local', searchRow: true, cap: 10 },
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

/** SMODE-04: what tokenise reads beyond the text and the mode. */
export interface TokenContext {
    /** Each engine alias and its engine's name, from chrome's engine list (Gecko engine.aliases). */
    aliases: ReadonlyArray<readonly [string, string]>;
    /** The engine searches go to now; `?` enters its mode. */
    defaultEngine: string | undefined;
    /** True for a token Command centre keeps as text: one that is exactly a Theia quick-access prefix. */
    keepInCommandCentre: (token: string) => boolean;
}

/**
 * SMODE-04 (D-18): a mode token at the start of `text`, followed by a space,
 * enters that mode and is consumed with its space; returns the new mode and
 * the remaining text, else null. The single-character tokens are the
 * LOCAL_MODES restrict tokens plus `?` (the default engine's mode); `@alias`
 * enters that alias's engine (compared case-insensitively). In Command centre
 * a token it keeps (a Theia prefix) stays text, and so does every `@` token
 * (the symbol hand-off). A token without a following space stays text.
 */
export function tokenise(text: string, mode: ModeId, context: TokenContext): { mode: ModeId; text: string } | null {
    const space = text.indexOf(' ');
    if (space <= 0) {
        return null;
    }
    const token = text.slice(0, space);
    const rest = text.slice(space + 1);
    if (mode === 'command-centre' && (token.startsWith('@') || context.keepInCommandCentre(token))) {
        return null;
    }
    const local = LOCAL_MODES.find(entry => entry.restrictToken === token);
    if (local) {
        return { mode: local.id, text: rest };
    }
    if (token === '?') {
        return context.defaultEngine ? { mode: engineModeId(context.defaultEngine), text: rest } : null;
    }
    if (token.length > 1 && token.startsWith('@')) {
        const folded = token.toLowerCase();
        const pair = context.aliases.find(([alias]) => alias.toLowerCase() === folded);
        return pair ? { mode: engineModeId(pair[1]), text: rest } : null;
    }
    return null;
}
