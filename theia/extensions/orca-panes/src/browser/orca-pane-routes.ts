/**
 * Phase 64 (TAB-04, TAB-06, TERM-01; P64-01, P64-12, P64-13, P64-16, P64-28,
 * P64-30, P64-32, P64-35; interfaces C7, C8): the one place an Orca content
 * type is routed, and the pure planner that turns Orca's pane list into widget
 * creations, adoptions, disposals and retitles.
 *
 * No DOM or Theia import, so Node can load the compiled file (orca-pane-routes,
 * the static check, derives Orca's TabContentType members from the pinned
 * source and compares them as a set with this table's keys).
 *
 * A pending route opens nothing: editor and diff wait for the Theia editor
 * (TAB-05, Phase 65), browser for the PB web tab (BRW-02, Phase 66). Orca's own
 * editor or screencast pane is never mounted meanwhile (D-01).
 */
import type { OrcaNeighbourMode, OrcaPaneOptions, OrcaPaneRecord } from '../common/orca-panes-protocol';

export type OrcaPaneRoute =
    | { readonly target: 'hosted-pane'; readonly word: string }
    | { readonly target: 'theia-editor' }
    | { readonly target: 'pb-web-tab' }
    | { readonly target: 'pending'; readonly requirement: string };

/** C8: keyed by every TabContentType member of the pinned Orca. */
export const ORCA_PANE_ROUTES: { readonly [kind: string]: OrcaPaneRoute } = Object.freeze({
    'terminal': { target: 'hosted-pane', word: 'term' },
    'agent-session': { target: 'hosted-pane', word: 'chat' },
    'simulator': { target: 'hosted-pane', word: 'sim' },
    'conflict-review': { target: 'hosted-pane', word: 'conflicts' },
    'check-details': { target: 'hosted-pane', word: 'checks' },
    'editor': { target: 'pending', requirement: 'TAB-05' },
    'diff': { target: 'pending', requirement: 'TAB-05' },
    'browser': { target: 'pending', requirement: 'BRW-02' },
});

/** The pb-orca: name word of each hosted kind. */
export const NAME_WORDS: { readonly [kind: string]: string } = Object.freeze(Object.keys(ORCA_PANE_ROUTES).reduce((words, kind) => {
    const route = ORCA_PANE_ROUTES[kind];
    return route.target === 'hosted-pane' ? { ...words, [kind]: route.word } : words;
}, {} as { [kind: string]: string }));

export const ORCA_PANE_WIDGET_ID_PREFIX = 'orca-pane:';

/** A widget's Orca key: the pane key for a terminal leaf, the tab id otherwise (C3). */
export const keyOfOptions = (options: Pick<OrcaPaneOptions, 'tabId' | 'paneKey'>): string => options.paneKey ?? options.tabId;

/** The word followed by the lowest free index from 1 (P64-16). */
export function mintName(word: string, taken: Iterable<string>): string {
    const used = new Set(taken);
    let n = 1;
    while (used.has(word + n)) {
        n++;
    }
    return word + n;
}

/** The first neighbour that already has a widget gives the Lumino insert mode and its widget id; none gives undefined (main area, no ref). */
export function placementFor(record: OrcaPaneRecord, widgetIdByKey: Map<string, string>): { mode: OrcaNeighbourMode; ref: string } | undefined {
    for (const neighbour of record.neighbours) {
        const ref = widgetIdByKey.get(neighbour.key);
        if (ref) {
            return { mode: neighbour.mode, ref };
        }
    }
    return undefined;
}

export interface KnownPane {
    name: string;
    title: string;
    widgetId: string;
}

export interface PlanState {
    known: Map<string, KnownPane>;
    /** Options of widgets Theia's layout restorer recreated and no list has claimed yet (P64-28). */
    restored: OrcaPaneOptions[];
    /** Kinds already logged as not hosted; each is logged once. */
    loggedPending?: Set<string>;
}

export interface PanePlan {
    create: Array<{ record: OrcaPaneRecord; name: string; placement: { mode: OrcaNeighbourMode; ref: string } | undefined }>;
    adopt: Array<{ key: string; widgetId: string }>;
    dispose: string[];
    retitle: Array<{ key: string; title: string }>;
    pending: string[];
}

/**
 * One full Orca pane list against what PB already shows. Hosted kinds only:
 * a known key whose title changed is retitled; a restored widget with the same
 * key is adopted under its stored name; anything else is created under a
 * minted name (restored names are reserved first) and placed beside its
 * nearest neighbour already open, including one created earlier in this plan
 * (P64-12). Known or restored keys missing from the list are disposed. Kinds
 * that are not hosted come back in pending, once each.
 */
export function planPanes(state: PlanState, records: OrcaPaneRecord[]): PanePlan {
    const plan: PanePlan = { create: [], adopt: [], dispose: [], retitle: [], pending: [] };
    const restoredByKey = new Map(state.restored.map(options => [keyOfOptions(options), options]));
    const taken = new Set<string>([...state.restored.map(o => o.name), ...[...state.known.values()].map(k => k.name)]);
    const widgetIdByKey = new Map<string, string>([...state.known].map(([key, k]) => [key, k.widgetId]));
    const seen = new Set<string>();
    for (const options of state.restored) {
        widgetIdByKey.set(keyOfOptions(options), ORCA_PANE_WIDGET_ID_PREFIX + options.name);
    }
    for (const record of records) {
        const route = ORCA_PANE_ROUTES[record.kind];
        if (route?.target !== 'hosted-pane') {
            if (!state.loggedPending?.has(record.kind) && !plan.pending.includes(record.kind)) {
                plan.pending.push(record.kind);
            }
            continue;
        }
        if (seen.has(record.key)) {
            continue;
        }
        seen.add(record.key);
        const known = state.known.get(record.key);
        const restored = restoredByKey.get(record.key);
        if (known) {
            if (known.title !== record.title) {
                plan.retitle.push({ key: record.key, title: record.title });
            }
        } else if (restored) {
            plan.adopt.push({ key: record.key, widgetId: ORCA_PANE_WIDGET_ID_PREFIX + restored.name });
        } else {
            const name = mintName(route.word, taken);
            taken.add(name);
            plan.create.push({ record, name, placement: placementFor(record, widgetIdByKey) });
            widgetIdByKey.set(record.key, ORCA_PANE_WIDGET_ID_PREFIX + name);
        }
    }
    for (const key of [...state.known.keys(), ...restoredByKey.keys()]) {
        if (!seen.has(key)) {
            plan.dispose.push(key);
        }
    }
    return plan;
}
