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
 * A pending route opens nothing: browser waits for the PB web tab (BRW-02,
 * Phase 66). Orca's own editor or screencast pane is never mounted (D-01).
 *
 * Phase 66 (BRW-02; P66-09): browser is a PowerBrowser web tab. Pages are
 * created only by @powerbrowser/orca-browser's host; the observer resolves a
 * browser record through its page table and creates nothing.
 *
 * Phase 65 (TAB-05; P65-01, P65-10; interfaces N-2): editor, diff and
 * conflict-review open in Theia's own editors, delivered by
 * @powerbrowser/orca-workspace (it observes them through subscribeOpenFiles),
 * so planPanes neither creates nor logs them; the word conflicts is retired.
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
    // theia-editor rows: delivered by @powerbrowser/orca-workspace (TAB-05).
    'conflict-review': { target: 'theia-editor' },
    'check-details': { target: 'hosted-pane', word: 'checks' },
    'editor': { target: 'theia-editor' },
    'diff': { target: 'theia-editor' },
    'browser': { target: 'pb-web-tab' },
});

/**
 * N-2 (P65-10): Orca's top-level views, keyed by every TopLevelView member of the pinned Orca. A page is a
 * singleton tab pb-orca:<word> mounting kind page:<view>; settings reveals the side panel's Settings part;
 * terminal stands for the creation surface while an Orca worktree creation is pending.
 */
export type OrcaPageRoute =
    | { readonly word: string; readonly kind: string; readonly whilePendingCreation?: true }
    | { readonly reveal: string };

export const ORCA_PAGE_ROUTES: { readonly [view: string]: OrcaPageRoute } = Object.freeze({
    'tasks': { word: 'tasks', kind: 'page:tasks' },
    'activity': { word: 'activity', kind: 'page:activity' },
    'automations': { word: 'automations', kind: 'page:automations' },
    'space': { word: 'space', kind: 'page:space' },
    'skills': { word: 'skills', kind: 'page:skills' },
    'artifacts': { word: 'artifacts', kind: 'page:artifacts' },
    'mobile': { word: 'mobile', kind: 'page:mobile' },
    'settings': { reveal: 'powerbrowser-orca-settings-view' },
    'terminal': { word: 'creating', kind: 'page:creation', whilePendingCreation: true },
});

/** The pb-orca: page word -> mount kind, derived from ORCA_PAGE_ROUTES. */
export const PAGE_WORDS: { readonly [word: string]: string } = Object.freeze(Object.values(ORCA_PAGE_ROUTES).reduce((words, route) =>
    'word' in route ? { ...words, [route.word]: route.kind } : words, {} as { [word: string]: string }));

/** The page words that open only while an Orca worktree creation is pending, derived from ORCA_PAGE_ROUTES. */
export const PENDING_CREATION_WORDS: ReadonlySet<string> = new Set(Object.values(ORCA_PAGE_ROUTES).flatMap(route =>
    'word' in route && route.whilePendingCreation ? [route.word] : []));

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
    /** P65-18: key -> name of the persisted name map's live entries; a record with a stored name takes it back. */
    namesByKey?: Map<string, string>;
    /** P65-18: every name in the map, live or tombstone; never minted again while held there. */
    reservedNames?: Iterable<string>;
    /** P65-35: true once the observer's restore bound has passed; absent reads as false. */
    hydrated?: boolean;
}

export interface PanePlan {
    create: Array<{ record: OrcaPaneRecord; name: string; placement: { mode: OrcaNeighbourMode; ref: string } | undefined }>;
    adopt: Array<{ key: string; widgetId: string }>;
    dispose: string[];
    retitle: Array<{ key: string; title: string }>;
    pending: string[];
    /** P65-35: restored keys kept in place (neither adopted nor disposed) until a list holds their worktree or the bound passes. */
    held: string[];
    /**
     * 64-WR-03: a terminal tab first listed with no leaf (key: its tab id, paneKey null) whose first leaf is now
     * listed (key: the leaf's pane key). The widget moves to the leaf's key under the same name and remounts with
     * the pane key; nothing is disposed, created or tombstoned.
     */
    rekey: Array<{ from: string; to: string; paneKey: string; widgetId: string }>;
}

/**
 * One full Orca pane list against what PB already shows. Hosted kinds only:
 * a known key whose title changed is retitled; a restored widget with the same
 * key is adopted under its stored name; anything else is created under a
 * minted name (restored names are reserved first) and placed beside its
 * nearest neighbour already open, including one created earlier in this plan
 * (P64-12). A key the name map knows takes its stored name back; a mint skips
 * every name the map holds (P65-18). Known keys missing from the list are
 * disposed; a restored key missing from it is disposed only once the list holds
 * a record of its worktree or the restore bound has passed (hydrated), and is
 * held otherwise, so an empty first list after a reload renumbers nothing
 * (P65-35). Kinds that are not hosted come back in pending, once each. A
 * terminal tab listed first without a leaf and then with its first leaf keeps
 * its widget and name through rekey (64-WR-03).
 */
export function planPanes(state: PlanState, records: OrcaPaneRecord[]): PanePlan {
    const plan: PanePlan = { create: [], adopt: [], dispose: [], retitle: [], pending: [], held: [], rekey: [] };
    const listed = new Set(records.map(record => record.key));
    const restoredByKey = new Map(state.restored.map(options => [keyOfOptions(options), options]));
    const inUse = new Set<string>([...state.restored.map(o => o.name), ...[...state.known.values()].map(k => k.name)]);
    const taken = new Set<string>([...inUse, ...(state.reservedNames ?? [])]);
    const widgetIdByKey = new Map<string, string>([...state.known].map(([key, k]) => [key, k.widgetId]));
    const seen = new Set<string>();
    for (const options of state.restored) {
        widgetIdByKey.set(keyOfOptions(options), ORCA_PANE_WIDGET_ID_PREFIX + options.name);
    }
    for (const record of records) {
        const route = ORCA_PANE_ROUTES[record.kind];
        if (route?.target === 'theia-editor') {
            continue; // orca-workspace opens these in Theia's editors
        }
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
        } else if (record.paneKey !== null && record.tabId !== record.key && !listed.has(record.tabId) && !seen.has(record.tabId)
            && (state.known.has(record.tabId) || restoredByKey.get(record.tabId)?.paneKey === null)) {
            // 64-WR-03: the tab's leaf-less record became its first leaf's record; the first leaf takes the widget over.
            const from = record.tabId;
            const widgetId = state.known.get(from)?.widgetId ?? ORCA_PANE_WIDGET_ID_PREFIX + restoredByKey.get(from)!.name;
            seen.add(from);
            plan.rekey.push({ from, to: record.key, paneKey: record.paneKey, widgetId });
            widgetIdByKey.set(record.key, widgetId);
        } else {
            const stored = state.namesByKey?.get(record.key);
            const name = stored && !inUse.has(stored) ? stored : mintName(route.word, taken);
            taken.add(name);
            inUse.add(name);
            plan.create.push({ record, name, placement: placementFor(record, widgetIdByKey) });
            widgetIdByKey.set(record.key, ORCA_PANE_WIDGET_ID_PREFIX + name);
        }
    }
    for (const key of state.known.keys()) {
        if (!seen.has(key)) {
            plan.dispose.push(key);
        }
    }
    const listedWorktrees = new Set(records.map(record => record.worktreeId));
    for (const [key, options] of restoredByKey) {
        if (!seen.has(key)) {
            (state.hydrated || listedWorktrees.has(options.worktreeId) ? plan.dispose : plan.held).push(key);
        }
    }
    return plan;
}
