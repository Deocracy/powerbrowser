/**
 * GUI-08 (15-01): the single in-memory group store behind BOTH the canvas
 * and the tree roots. One ordered group list, one membership map, one
 * active-group id -- the view toggle flips visibility only, never reloads
 * and never loses selection, so a canvas/tree mismatch is a render bug in
 * one file, never store divergence (15-RESEARCH.md Pitfall 5).
 *
 * Total parse (modes/setups precedent): unknown fields are dropped, a
 * corrupt payload degrades to the contracted empty state, and load never
 * throws -- the widget paints the contracted empty/load-error copy instead.
 *
 * Every mutation paints optimistically, persists through one actor message,
 * and on nack/timeout keeps the painted change behind the contracted
 * save-error bar with Retry; Retry replays the write once and reverts the
 * painted change only if the replay fails again (15-UI-SPEC.md).
 *
 * Phase 22 (PAN-03): the model loads itself at layout init, so the Browsing
 * strip can follow the active group before Organising ever opens.
 */

import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { ApplicationShell, FrontendApplicationContribution, OpenerService, Widget } from '@theia/core/lib/browser';
import { NavigatableWidget } from '@theia/core/lib/browser/navigatable-types';
import { Emitter, Event } from '@theia/core/lib/common';
import URI from '@theia/core/lib/common/uri';
import pDebounce from 'p-debounce';
import { GroupQueryService } from '@powerbrowser/tab-uris/lib/browser/group-query-service';
import { ProfileStorageService } from '@powerbrowser/tab-uris/lib/browser/profile-storage';
import { TabUriRegistry } from '@powerbrowser/tab-uris/lib/browser/tab-uri-registry';
import { EMPTY_PAGE_URL, WebTabOpenerOptions, WebTabWidget } from '@powerbrowser/tab-uris/lib/browser/web-tab';
import { GroupActorClient } from './group-actor-client';
import type { GroupMutation } from './group-actor-client';

/** Contracted rename cap (15-UI-SPEC.md); duplicates allowed, empty reverts. */
export const GROUP_TITLE_MAX_CHARS = 60;

/** Group-box minimum geometry (15-UI-SPEC.md: fits header plus one card). */
export const GROUP_BOX_MIN_W = 200;
export const GROUP_BOX_MIN_H = 144;

/** Default title for New Group (contracted copy, verbatim). */
export const UNTITLED_GROUP_TITLE = 'Untitled group';

/** PAN-04 (22-UI-SPEC A2): how long a closed group stays restorable before its close is written. */
export const UNDO_CLOSE_MS = 15000;

/** How long a "+" join waits before its one retry when the new web tab's row is not written yet. */
const JOIN_ROW_RETRY_MS = 500;

/** A closed group inside its undo window: hidden everywhere, nothing written yet. */
interface ClosingGroup {
    group: PanoramaGroup;
    index: number;
    tabs: PanoramaTab[];
    wasActive: boolean;
    deadline: number;
    timer: number | undefined;
}

export interface PanoramaGroup {
    id: string;
    title: string;
    x: number;
    y: number;
    w: number;
    h: number;
    isActive: boolean;
}

export interface PanoramaTab {
    uri: string;
    url: string;
    title: string;
    thumbnail?: string | null;
    /**
     * Where a loose tab sits on the canvas, or undefined for one that has
     * never been placed. Never-placed tabs are laid out along the bottom by
     * the canvas itself, so an existing profile upgrades without every tab
     * it has ever seen acquiring a position.
     */
    x?: number;
    y?: number;
    /** false for a card whose tab is not open in the shell (NG-008); undefined when the model was loaded without a shell. */
    open?: boolean;
}

/**
 * One tab the shell actually has open, as `load` needs to see it.
 *
 * `tabs.sqlite` is a tab HISTORY carrying group membership, not a live tab
 * list: `startTabStoreTriggers` writes a row for every tab in every stock
 * browser window as well as for in-shell web tabs, the sessionstore sweep
 * adds whatever sessionstore knows, and `pruneClosedTabRows` only removes a
 * closed tab's row once it is older than the seven-day retention window. So
 * the store on its own answers "which tabs has this profile seen lately",
 * which is not the question the canvas asks.
 *
 * The shell answers that one. `uri` is the tab's row key -- `tabKeyOf` --
 * the same value the chrome-side writer binds, so the two join without a
 * second identity scheme.
 */
export interface LiveTab {
    uri: string;
    url: string;
    title: string;
}

function toFinite(value: unknown, fallback: number): number {
    const n = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(n) ? n : fallback;
}

/** The last key `tabKeyOf` computed for each widget while it was alive. */
const liveKeys = new WeakMap<Widget, string>();

/**
 * NG-001: the one row-key rule, for every kind of tab (docs/TAB-STORE.md).
 * A web tab is keyed by its own identity (`WebTabWidget.rowKey`), never its
 * page; any other tab by its registry address, or its resource URI when the
 * registry has none (an editor), or finally its widget id. Never a page URL,
 * and never a plugin panel's `webview:` address (F5): both fall to the id.
 */
export function tabKeyOf(widget: Widget, registry: TabUriRegistry): string {
    if (widget instanceof WebTabWidget) {
        return widget.rowKey;
    }
    // A `disposed` listener runs after WidgetManager's own, which has already
    // dropped the widget's description, so the registry address is gone by
    // then. Lumino sets isDisposed before it emits, so the key the widget had
    // while alive is returned instead of the `widget:` fallback.
    const last = liveKeys.get(widget);
    if (widget.isDisposed && last !== undefined) {
        return last;
    }
    const address = registry.uriOf(widget) ?? (NavigatableWidget.is(widget) ? widget.getResourceUri() : undefined);
    const key = address?.toString(true);
    const result = key && !/^(webview|https?):/i.test(key) ? key : `widget:${widget.id}`;
    if (!widget.isDisposed) {
        liveKeys.set(widget, result);
    }
    return result;
}

@injectable()
export class GroupModel implements FrontendApplicationContribution {
    private readonly changeEmitter = new Emitter<void>();
    readonly onDidChange: Event<void> = this.changeEmitter.event;

    private groups: PanoramaGroup[] = [];
    private readonly members = new Map<string, PanoramaTab[]>();
    private ungrouped: PanoramaTab[] = [];
    private readonly reopening = new Set<string>();
    /** PAN-04: groups in their undo window, by id. Lives here, not on the widget, so a mode switch never ends it. */
    private readonly closing = new Map<string, ClosingGroup>();
    private activeGroupId: string | undefined;
    private loaded = false;
    private loadFailed = false;
    /**
     * WR-01: one pending write per mutation key, not a single slot. A
     * cross-key failure used to evict the earlier write's revert closure,
     * stranding its painted-but-unpersisted change with no recovery path.
     * Bounded (drop-oldest past 20) so a failure storm cannot grow it.
     */
    private readonly pendingWrites = new Map<string, { attempts: number; revert: () => void; write: () => Promise<unknown> }>();
    private static readonly PENDING_WRITES_MAX = 20;

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    @inject(TabUriRegistry)
    protected readonly registry: TabUriRegistry;

    @inject(GroupActorClient)
    protected readonly actor: GroupActorClient;

    @inject(OpenerService)
    protected readonly openers: OpenerService;

    @inject(GroupQueryService)
    protected readonly reader: GroupQueryService;

    @inject(ProfileStorageService)
    protected readonly profileStorage: ProfileStorageService;

    /** Theia tabs whose close already reaches the store. */
    private readonly watched = new WeakSet<Widget>();

    /** NG-009: every key the store holds a row for, open or not. */
    private readonly stored = new Set<string>();

    /** The row key of a shell tab (`tabKeyOf`). */
    keyOf(widget: Widget): string {
        return tabKeyOf(widget, this.registry);
    }

    /**
     * NG-001: a Theia tab (editor, terminal, view) gets its row the first time
     * it is organised; stock and web rows are written by chrome and the web tab.
     */
    private async ensureRow(client: GroupActorClient, uri: string): Promise<void> {
        if (/^(web|stock):/.test(uri)) {
            return;
        }
        const card = this.locateCard(uri)?.card;
        await client.mutate({ kind: 'trackTab', uri, url: card?.url ?? '', title: card?.title ?? '' });
        this.stored.add(uri);
        this.watchClose(uri);
    }

    @postConstruct()
    protected init(): void {
        // NG-009: a Theia tab with a row records when it was last looked at;
        // web tabs report their own activation.
        this.shell.onDidChangeActiveWidget(({ newValue }) => {
            if (!newValue) {
                return;
            }
            const uri = this.keyOf(newValue);
            if (this.stored.has(uri) && !/^(web|stock):/.test(uri)) {
                this.actor.mutate({ kind: 'touchTab', uri })
                    .catch(error => console.error('[@powerbrowser/modes] recording a tab access failed:', error));
            }
        });
    }

    /**
     * PAN-03: the model loads at layout init, so the Browsing strip has
     * membership to read before Organising ever opens. Returns nothing and
     * awaits nothing: awaiting a backend read in the boot chain re-enters the
     * deadlock modes-frontend-module.ts documents.
     */
    onDidInitializeLayout(): void {
        this.shell.onDidAddWidget(() => void this.scheduleReload());
        this.shell.onDidRemoveWidget(() => void this.scheduleReload());
        // PAN-04 (Pitfall 10): a hidden tab is never the current tab of a bar.
        this.shell.onDidChangeCurrentWidget(() => this.steerFromClosing());
        // PAN-04 (A4): a quit inside an undo window closes the group for good,
        // before the layout is stored (profile-storage.ts flush order).
        this.profileStorage.onWillFlush(event => event.waitUntil(this.commitAllClosing(this.actor)));
        void this.reload();
    }

    /**
     * PAN-04 (Pattern 3): moves each main-area bar whose current tab belongs
     * to a group in its undo window onto that bar's first other tab, and
     * activates it when the hidden tab was the active one. A bar holding only
     * pending tabs is left to the dock (research Open Question 1).
     */
    private steerFromClosing(): void {
        if (!this.closing.size || !this.shell?.mainPanel) {
            return;
        }
        const active = this.shell.activeWidget;
        for (const bar of this.shell.mainPanel.tabBars()) {
            const owner = bar.currentTitle?.owner;
            if (!owner || !this.isClosingKey(this.keyOf(owner))) {
                continue;
            }
            const next = bar.titles.find(title => !this.isClosingKey(this.keyOf(title.owner)));
            if (!next) {
                continue;
            }
            bar.currentTitle = next;
            if (owner === active) {
                this.shell.activateWidget(next.owner.id);
            }
        }
    }

    /** Coalesced, as the canvas's own reload is: a setup adds several widgets in one turn. */
    readonly scheduleReload = pDebounce(() => this.reload(), 120);

    /** Re-reads the store against the tabs the shell has open now. Never throws (`load`). */
    async reload(): Promise<void> {
        if (this.shell?.mainPanel) {
            await this.load(this.reader, this.liveTabs([...this.shell.mainPanel.widgets()]));
        }
    }

    /**
     * The given shell tabs in the shape `load` joins on (see
     * `OrganisingWidget.liveTabs`). Organising is skipped by its id string:
     * it is a mode, not a tab, and importing the widget here would be a cycle.
     */
    liveTabs(widgets: readonly Widget[]): LiveTab[] {
        return widgets.flatMap(widget => {
            if (widget.id === 'powerbrowser.modes.organising') {
                return [];
            }
            const page = widget instanceof WebTabWidget && widget.hasPage ? widget.url : '';
            return [{ uri: this.keyOf(widget), url: page, title: widget.title.label || page }];
        });
    }

    /**
     * PAN-03 (22-UI-SPEC A5, A6; decision D1): whether the Browsing strip
     * paints this tab. Every tab while nothing is loaded or no group is
     * active; otherwise the current tab, the loose tabs (a key not seen yet
     * counts as loose) and the active group's tabs.
     */
    showsInStrip(widget: Widget, current: Widget | undefined): boolean {
        const key = this.keyOf(widget);
        // PAN-04 (A3): a tab of a group in its undo window is shown nowhere, current or not.
        if (this.isClosingKey(key)) {
            return false;
        }
        if (!this.loaded || this.loadFailed || !this.activeGroupId || widget === current) {
            return true;
        }
        const groupId = this.locateCard(key)?.groupId ?? null;
        return groupId === null || groupId === this.activeGroupId;
    }

    /**
     * PAN-03 (22-UI-SPEC A7): a tab opened with "+" joins the active group,
     * appended, through the same writer every card move uses. No active group
     * leaves it loose (D1). Reloads once after the write lands, so a load that
     * read the store before it cannot repaint the card loose.
     */
    async joinActiveGroup(widget: Widget): Promise<void> {
        if (!this.loaded) {
            await this.reload();
        }
        const groupId = this.activeGroupId;
        if (!groupId) {
            return;
        }
        const key = this.keyOf(widget);
        if (!this.locateCard(key)) {
            const [live] = this.liveTabs([widget]);
            if (!live) {
                return;
            }
            this.insertCardLocal(live, null);
        }
        try {
            await this.moveCard(this.actor, key, groupId);
        } catch (error) {
            this.leaveLoose(key, groupId);
            // WR-05: chrome writes a new web tab's row fire-and-forget on the
            // web-tab channel, so the join can arrive first. Retry once.
            if (!key.startsWith('web:') || !/unknown tab URI/.test(error instanceof Error ? error.message : '')) {
                throw error;
            }
            this.pendingWrites.delete(`card:${key}`);
            await new Promise(resolve => window.setTimeout(resolve, JOIN_ROW_RETRY_MS));
            try {
                await this.moveCard(this.actor, key, groupId);
            } catch (again) {
                this.leaveLoose(key, groupId);
                throw again;
            }
        }
        void this.scheduleReload();
    }

    /**
     * A7: a failed join leaves the tab loose in memory, as the store has it.
     * The card: slot's Retry re-paints the join before replaying the write,
     * so a Retry that lands joins it and one that fails reverts it loose.
     */
    private leaveLoose(key: string, groupId: string): void {
        const card = this.locateCard(key)?.card;
        if (!card) {
            return;
        }
        this.removeCardLocal(key);
        this.insertCardLocal(card, null);
        const slot = this.pendingWrites.get(`card:${key}`);
        if (slot) {
            const write = slot.write;
            slot.write = async () => {
                this.removeCardLocal(key);
                this.insertCardLocal(card, groupId);
                await write();
            };
        }
        this.changeEmitter.fire();
    }

    /**
     * NG-005: closing a Theia tab that has a row marks the row closed. Widget
     * disposal is the user's close; a reload or quit disposes nothing, so the
     * row stays and the tab keeps its card.
     * A caller watching many tabs at once passes `byKey` (`mainWidgetsByKey`),
     * so the main area is scanned once rather than once per tab.
     */
    private watchClose(uri: string, byKey?: ReadonlyMap<string, Widget>): void {
        if (/^(web|stock):/.test(uri)) {
            return;
        }
        const widget = byKey
            ? byKey.get(uri)
            : [...this.shell.mainPanel.widgets()].find(candidate => this.keyOf(candidate) === uri);
        if (!widget || this.watched.has(widget)) {
            return;
        }
        this.watched.add(widget);
        widget.disposed.connect(() => {
            this.actor.mutate({ kind: 'closeTab', uri })
                .catch(error => console.error('[@powerbrowser/modes] closing a tab row failed:', error));
        });
    }

    /** Every main-area widget by its row key, the first one winning as `watchClose`'s scan does. */
    private mainWidgetsByKey(): Map<string, Widget> {
        const byKey = new Map<string, Widget>();
        for (const widget of this.shell.mainPanel.widgets()) {
            const key = this.keyOf(widget);
            if (!byKey.has(key)) {
                byKey.set(key, widget);
            }
        }
        return byKey;
    }

    /**
     * Previews for tabs that are not pages -- the Welcome view, an editor, a
     * terminal. Chrome photographs the shell frame for these rather than a
     * document, and there is no store column for the result, so they live for
     * the session. Bounded, because a data URL is not small.
     */
    private readonly sessionThumbs = new Map<string, string>();
    private static readonly SESSION_THUMBS_MAX = 40;

    /** Keeps one captured preview, evicting the oldest past the cap. */
    rememberThumbnail(uri: string, png: string): void {
        if (this.sessionThumbs.has(uri)) {
            this.sessionThumbs.delete(uri);
        } else if (this.sessionThumbs.size >= GroupModel.SESSION_THUMBS_MAX) {
            const oldest = this.sessionThumbs.keys().next().value;
            if (oldest !== undefined) {
                this.sessionThumbs.delete(oldest);
            }
        }
        this.sessionThumbs.set(uri, png);
        this.changeEmitter.fire();
    }

    get isLoaded(): boolean {
        return this.loaded;
    }

    get hasLoadFailed(): boolean {
        return this.loadFailed;
    }

    get hasPendingWrite(): boolean {
        return this.pendingWrites.size > 0;
    }

    listGroups(): readonly PanoramaGroup[] {
        return Object.freeze([...this.groups]);
    }

    getTabs(groupId: string): readonly PanoramaTab[] {
        return Object.freeze([...(this.members.get(groupId) ?? [])]);
    }

    listUngrouped(): readonly PanoramaTab[] {
        return Object.freeze([...this.ungrouped]);
    }

    getActiveGroupId(): string | undefined {
        return this.activeGroupId;
    }

    /** PAN-04: whether this group is in its undo window. */
    isClosing(id: string): boolean {
        return this.closing.has(id);
    }

    /**
     * PAN-06: whether this group may be closed. The last visible group stays;
     * groups in their undo window are already out of `groups`, so they do not count.
     */
    canCloseGroup(id: string): boolean {
        return this.groups.length > 1 && this.groups.some(candidate => candidate.id === id);
    }

    /** PAN-04: whether this row key is a member of a group in its undo window. */
    isClosingKey(key: string): boolean {
        for (const entry of this.closing.values()) {
            if (entry.tabs.some(tab => tab.uri === key)) {
                return true;
            }
        }
        return false;
    }

    /** PAN-04: the groups in their undo window, in group order. */
    listClosing(): readonly { group: PanoramaGroup; index: number; deadline: number }[] {
        return Object.freeze([...this.closing.values()]
            .sort((a, b) => a.index - b.index)
            .map(({ group, index, deadline }) => ({ group, index, deadline })));
    }

    /**
     * Loads groups, membership, and the loose (ungrouped) tabs from the reader. Total parse:
     * unparseable rows are dropped, a corrupt payload lands the contracted
     * empty state, and failures resolve with loadFailed set -- never throws.
     *
     * `live`, when given, is the set of tabs the shell actually has open, and
     * it decides which cards exist -- see `LiveTab`. Omitting it uses the
     * store whole, which is what every caller without a shell wants.
     */
    async load(reader: GroupQueryService, live?: readonly LiveTab[]): Promise<void> {
        try {
            const rows = await reader.listGroups();
            const parsed = Array.isArray(rows) ? rows.flatMap(row => {
                const group = this.parseGroup(row);
                return group ? [group] : [];
            }) : [];
            const nextMembers = new Map<string, PanoramaTab[]>();
            // NG-012 (T3-R1): no per-read catch. A read failing mid-load fails
            // the whole load -- an empty member list would draw an empty box,
            // show its tabs as loose, and have Close Group confirm "0 tabs".
            // The reads are independent, so they go out together: one round
            // trip per load instead of one per group.
            const [memberLists, looseRows] = await Promise.all([
                Promise.all(parsed.map(group => reader.getGroupTabs(group.id))),
                reader.listUngroupedTabs(),
            ]);
            const parseTabs = (tabRows: unknown): PanoramaTab[] => Array.isArray(tabRows) ? tabRows.flatMap(row => {
                const tab = this.parseTab(row);
                return tab ? [tab] : [];
            }) : [];
            parsed.forEach((group, index) => nextMembers.set(group.id, parseTabs(memberLists[index])));
            let loose: PanoramaTab[] = parseTabs(looseRows);
            // NG-009: every key the store holds a row for, open or not.
            this.stored.clear();
            for (const tabs of [...nextMembers.values(), loose]) {
                for (const tab of tabs) {
                    this.stored.add(tab.uri);
                }
            }
            if (live) {
                // The shell decides which cards exist and what they are
                // called; the store decides only which group each one is in
                // and what its last thumbnail was.
                const liveByUri = new Map(live.map(tab => [tab.uri, tab]));
                const thumbnails = new Map<string, string | null | undefined>();
                const placements = new Map<string, { x?: number; y?: number }>();
                for (const tabs of [...nextMembers.values(), loose]) {
                    for (const tab of tabs) {
                        thumbnails.set(tab.uri, tab.thumbnail ?? this.sessionThumbs.get(tab.uri));
                        placements.set(tab.uri, { x: tab.x, y: tab.y });
                    }
                }
                const claimed = new Set<string>();
                for (const [id, tabs] of nextMembers) {
                    nextMembers.set(id, tabs.flatMap((tab): PanoramaTab[] => {
                        const open = liveByUri.get(tab.uri);
                        if (open) {
                            claimed.add(tab.uri);
                            return [{ ...tab, url: open.url || tab.url, title: open.title || tab.title, thumbnail: thumbnails.get(tab.uri) ?? null, open: true }];
                        }
                        // NG-007/NG-008: a grouped tab that is not open keeps its
                        // card -- its row is open or restorable -- and reopens from
                        // it. A stock tab lives in a stock window, never here.
                        return tab.uri.startsWith('stock:') ? [] : [{ ...tab, open: false }];
                    }));
                }
                // Everything else open is loose, placed where the store
                // says -- a tab seconds old whose row does not exist yet included.
                const rest: PanoramaTab[] = [];
                for (const tab of live) {
                    if (claimed.has(tab.uri)) {
                        continue;
                    }
                    const placed = placements.get(tab.uri);
                    rest.push({
                        uri: tab.uri,
                        url: tab.url,
                        title: tab.title,
                        thumbnail: thumbnails.get(tab.uri) ?? this.sessionThumbs.get(tab.uri) ?? null,
                        x: placed?.x,
                        y: placed?.y,
                    });
                }
                loose = rest;
                // Built on the first Theia tab to watch: web and stock tabs never scan.
                let byKey: Map<string, Widget> | undefined;
                for (const tab of live) {
                    if ((claimed.has(tab.uri) || placements.has(tab.uri)) && !/^(web|stock):/.test(tab.uri)) {
                        byKey ??= this.mainWidgetsByKey();
                        this.watchClose(tab.uri, byKey);
                    }
                }
            }
            // PAN-04 (Pitfall 5): the store still holds a group in its undo
            // window. Its open tabs were claimed above, so they are neither a
            // box nor loose; the closing entry keeps the tabs it captured.
            const storeActive = parsed.find(group => group.isActive)?.id;
            const visible = parsed.filter(group => !this.closing.has(group.id));
            for (const id of this.closing.keys()) {
                nextMembers.delete(id);
            }
            this.groups = visible;
            this.members.clear();
            for (const [id, tabs] of nextMembers) {
                this.members.set(id, tabs);
            }
            this.ungrouped = loose;
            // A pending group still flagged active in the store keeps the in-memory hand-off.
            const active = storeActive !== undefined && this.closing.has(storeActive) ? this.activeGroupId : storeActive;
            this.activeGroupId = visible.some(group => group.id === active) ? active : undefined;
            for (const group of visible) {
                group.isActive = group.id === this.activeGroupId;
            }
            this.loaded = true;
            this.loadFailed = false;
        } catch (error) {
            console.error('[@powerbrowser/modes] loading groups failed:', error instanceof Error ? error.name : typeof error);
            this.groups = [];
            this.members.clear();
            this.ungrouped = [];
            this.activeGroupId = undefined;
            this.loaded = true;
            this.loadFailed = true;
        }
        this.changeEmitter.fire();
    }

    /**
     * Creates a box titled Untitled group; the widget puts it in edit mode.
     * `at` may carry a size as well as a position -- a group drawn on the
     * canvas is whatever rectangle was dragged, floored at the contracted
     * minimum; the button passes a position only and gets the default box.
     */
    async createGroup(client: GroupActorClient, at?: { x: number; y: number; w?: number; h?: number }): Promise<PanoramaGroup> {
        const group: PanoramaGroup = {
            id: `group-${Date.now().toString(36)}-${Math.floor(Math.random() * 0x100000).toString(36)}`,
            title: UNTITLED_GROUP_TITLE,
            x: Math.max(0, Math.floor(at?.x ?? 24)),
            y: Math.max(0, Math.floor(at?.y ?? 24)),
            w: Math.max(GROUP_BOX_MIN_W, Math.floor(at?.w ?? 400)),
            h: Math.max(GROUP_BOX_MIN_H, Math.floor(at?.h ?? 300)),
            isActive: false,
        };
        const apply = (): void => {
            this.groups = [...this.groups, group];
            this.members.set(group.id, []);
        };
        const revert = (): void => {
            this.groups = this.groups.filter(candidate => candidate.id !== group.id);
            this.members.delete(group.id);
            if (this.activeGroupId === group.id) {
                this.activeGroupId = undefined;
            }
        };
        await this.persist(`create:${group.id}`, apply, revert, () =>
            client.mutate({ kind: 'createGroup', id: group.id, title: group.title, x: group.x, y: group.y, w: group.w, h: group.h }));
        return group;
    }

    /**
     * Commits a title edit. Empty reverts to the prior title locally with no
     * write; over-long input is cut at the cap before commit; duplicates are
     * allowed. Returns the title now painted.
     */
    async commitTitle(client: GroupActorClient, id: string, raw: string): Promise<string> {
        const group = this.groups.find(candidate => candidate.id === id);
        if (!group) {
            return '';
        }
        const trimmed = raw.trim().slice(0, GROUP_TITLE_MAX_CHARS);
        if (!trimmed) {
            this.changeEmitter.fire();
            return group.title;
        }
        if (trimmed === group.title) {
            return group.title;
        }
        const prior = group.title;
        const apply = (): void => {
            const current = this.groups.find(candidate => candidate.id === id);
            if (current) {
                current.title = trimmed;
            }
        };
        const revert = (): void => {
            const current = this.groups.find(candidate => candidate.id === id);
            if (current) {
                current.title = prior;
            }
        };
        await this.persist(`rename:${id}`, apply, revert, () => client.mutate({ kind: 'renameGroup', id, title: trimmed }));
        return trimmed;
    }

    /** Moves a box (header-drag); bounds are clamped chrome-side as well. */
    async moveGroup(client: GroupActorClient, id: string, x: number, y: number): Promise<void> {
        const group = this.groups.find(candidate => candidate.id === id);
        if (!group) {
            return;
        }
        const next = { x: Math.max(0, Math.floor(x)), y: Math.max(0, Math.floor(y)) };
        if (next.x === group.x && next.y === group.y) {
            return;
        }
        const prior = { x: group.x, y: group.y };
        await this.persist(`move:${id}`, () => {
            const current = this.groups.find(candidate => candidate.id === id);
            if (current) {
                current.x = next.x;
                current.y = next.y;
            }
        }, () => {
            const current = this.groups.find(candidate => candidate.id === id);
            if (current) {
                current.x = prior.x;
                current.y = prior.y;
            }
        }, () => client.mutate({ kind: 'moveGroup', id, x: next.x, y: next.y }));
    }

    /** Resizes a box (corner handle); floors at the contracted minimum. */
    async resizeGroup(client: GroupActorClient, id: string, w: number, h: number): Promise<void> {
        const group = this.groups.find(candidate => candidate.id === id);
        if (!group) {
            return;
        }
        const next = { w: Math.max(GROUP_BOX_MIN_W, Math.floor(w)), h: Math.max(GROUP_BOX_MIN_H, Math.floor(h)) };
        if (next.w === group.w && next.h === group.h) {
            return;
        }
        const prior = { w: group.w, h: group.h };
        await this.persist(`resize:${id}`, () => {
            const current = this.groups.find(candidate => candidate.id === id);
            if (current) {
                current.w = next.w;
                current.h = next.h;
            }
        }, () => {
            const current = this.groups.find(candidate => candidate.id === id);
            if (current) {
                current.w = prior.w;
                current.h = prior.h;
            }
        }, () => client.mutate({ kind: 'resizeGroup', id, w: next.w, h: next.h }));
    }

    /**
     * Moves a card into a group, optionally at a chosen place in it. Dropping
     * a card between two others is a move AND a reorder, so both are written:
     * the membership, then the group's new order as one list.
     *
     * A move within the same group is a pure reorder and is allowed through --
     * before this it early-returned, so a card could only ever be appended.
     */
    async moveCard(client: GroupActorClient, uri: string, toGroupId: string | null, index?: number): Promise<void> {
        const from = this.locateCard(uri);
        if (!from) {
            return;
        }
        const sameGroup = from.groupId === toGroupId;
        if (sameGroup && (index === undefined || toGroupId === null)) {
            return;
        }
        const card = from.card;
        const before = from.groupId !== null
            ? (this.members.get(from.groupId) ?? []).findIndex(tab => tab.uri === uri)
            : undefined;
        const apply = (): void => {
            this.removeCardLocal(uri);
            this.insertCardLocal(card, toGroupId, index);
        };
        const revert = (): void => {
            this.removeCardLocal(uri);
            this.insertCardLocal(card, from.groupId, before);
        };
        await this.persist(`card:${uri}`, apply, revert, async () => {
            if (!sameGroup) {
                await this.writeMembership(client, uri, toGroupId);
            }
            if (toGroupId !== null) {
                await this.writeOrder(client, toGroupId);
            }
        });
    }

    /**
     * Writes one group's running order. Sent as the whole list because a drop
     * between two cards renumbers everything after it -- one transaction is
     * either the new order or the old one, where a write per tab could leave
     * the group half-renumbered. Every tab has a row by now (NG-001: a Theia
     * tab's is written by `ensureRow` when it joins the group), and chrome
     * refuses a list naming a tab that is not a row in the group.
     */
    private async writeOrder(client: GroupActorClient, groupId: string): Promise<void> {
        const uris = (this.members.get(groupId) ?? []).map(tab => tab.uri);
        if (!uris.length) {
            return;
        }
        await client.mutate({ kind: 'setGroupOrder', groupId, uris });
    }

    /**
     * Places a loose tab on the canvas. Paints first, then persists, like
     * every other mutation here; a tab that is in a group is ignored, because
     * a grouped tab's position is decided by its group's grid.
     */
    async placeCard(client: GroupActorClient, uri: string, x: number, y: number): Promise<void> {
        const at = { x: Math.max(0, Math.floor(x)), y: Math.max(0, Math.floor(y)) };
        const index = this.ungrouped.findIndex(candidate => candidate.uri === uri);
        if (index < 0) {
            return;
        }
        const before = { x: this.ungrouped[index].x, y: this.ungrouped[index].y };
        const apply = (): void => {
            const at2 = this.ungrouped.findIndex(candidate => candidate.uri === uri);
            if (at2 >= 0) {
                this.ungrouped[at2] = { ...this.ungrouped[at2], ...at };
            }
        };
        const revert = (): void => {
            const at2 = this.ungrouped.findIndex(candidate => candidate.uri === uri);
            if (at2 >= 0) {
                this.ungrouped[at2] = { ...this.ungrouped[at2], ...before };
            }
        };
        await this.persist(`place:${uri}`, apply, revert, () => this.writePlacement(client, uri, at.x, at.y));
    }

    /**
     * One placement write. Every tab has a key (NG-001), so every position is
     * stored and survives a restart; a Theia tab's row is written first
     * (`ensureRow`), and chrome refuses a key with no row rather than
     * reporting a write that matched nothing.
     */
    private async writePlacement(client: GroupActorClient, uri: string, x: number, y: number): Promise<void> {
        await this.ensureRow(client, uri);
        await client.mutate({ kind: 'setTabPosition', uri, x, y });
    }

    /**
     * One membership write, the same way: the Theia tab's row first, then the
     * group, which chrome refuses for a key with no row.
     */
    private async writeMembership(client: GroupActorClient, uri: string, groupId: string | null): Promise<void> {
        await this.ensureRow(client, uri);
        await client.mutate({ kind: 'setTabGroup', uri, groupId });
    }

    /** Removes an emptied box (last-card-out); tabs survive, ungrouped. */
    async dissolveGroup(client: GroupActorClient, id: string): Promise<void> {
        const index = this.groups.findIndex(candidate => candidate.id === id);
        if (index < 0) {
            return;
        }
        const removed = this.groups[index];
        const stragglers = [...(this.members.get(id) ?? [])];
        const wasActive = this.activeGroupId === id;
        const apply = (): void => {
            this.groups = this.groups.filter(candidate => candidate.id !== id);
            this.members.delete(id);
            for (const tab of stragglers) {
                this.insertCardLocal(tab, null);
            }
            if (this.activeGroupId === id) {
                this.activeGroupId = undefined;
            }
        };
        const revert = (): void => {
            this.groups = [...this.groups.slice(0, index), removed, ...this.groups.slice(index)];
            // Out of the loose list before the group is restored: removeCardLocal
            // searches the groups first and would take them back out of this one.
            this.ungrouped = this.ungrouped.filter(tab => !stragglers.some(other => other.uri === tab.uri));
            this.members.set(id, stragglers);
            if (wasActive) {
                this.activeGroupId = id;
            }
        };
        await this.persist(`dissolve:${id}`, apply, revert, () => client.mutate({ kind: 'dissolveGroup', id }));
    }

    /**
     * PAN-04: closes one group into its undo window. The box and its tabs are
     * hidden at once and nothing is written: `commitClose` writes the close
     * when UNDO_CLOSE_MS ends or PowerBrowser quits; `undoCloseGroup` restores it.
     * PAN-06: the last visible group is never closed, whichever caller asks.
     */
    async closeGroup(client: GroupActorClient, id: string): Promise<{ name: string; count: number } | undefined> {
        if (!this.canCloseGroup(id)) {
            return undefined;
        }
        const index = this.groups.findIndex(candidate => candidate.id === id);
        if (index < 0) {
            return undefined;
        }
        const group = this.groups[index];
        const tabs = [...(this.members.get(id) ?? [])];
        const wasActive = this.activeGroupId === id;
        this.groups = this.groups.filter(candidate => candidate.id !== id);
        this.members.delete(id);
        this.activeGroupId = wasActive ? this.groups[0]?.id : this.activeGroupId;
        for (const other of this.groups) {
            other.isActive = other.id === this.activeGroupId;
        }
        const timer = window.setTimeout(() => {
            this.commitClose(client, id).catch(error =>
                console.error('[@powerbrowser/modes] committing a group close failed:', error instanceof Error ? error.name : typeof error));
        }, UNDO_CLOSE_MS);
        this.closing.set(id, { group, index, tabs, wasActive, deadline: Date.now() + UNDO_CLOSE_MS, timer });
        this.changeEmitter.fire();
        this.steerFromClosing();
        return { name: group.title, count: tabs.length };
    }

    /**
     * PAN-04: restores a group in its undo window: title, bounds, membership,
     * card order and activity. Writes nothing. Activity comes back only if no
     * activity write landed during the window (`activityWritten`).
     */
    undoCloseGroup(id: string): PanoramaGroup | undefined {
        const entry = this.closing.get(id);
        if (!entry) {
            return undefined;
        }
        window.clearTimeout(entry.timer);
        this.closing.delete(id);
        this.restoreClosing(entry);
        this.changeEmitter.fire();
        return entry.group;
    }

    /** Idempotent: a failed commit restores the box, and a failed Retry must not paint it twice. */
    private restoreClosing(entry: ClosingGroup): void {
        if (!this.groups.some(group => group.id === entry.group.id)) {
            const at = Math.min(entry.index, this.groups.length);
            this.groups = [...this.groups.slice(0, at), entry.group, ...this.groups.slice(at)];
        }
        this.members.set(entry.group.id, entry.tabs);
        if (entry.wasActive) {
            this.activeGroupId = entry.group.id;
        }
        for (const group of this.groups) {
            group.isActive = group.id === this.activeGroupId;
        }
    }

    /**
     * PAN-04: writes one pending close through the unchanged chrome-side
     * `closeGroupRows`, persists the activity hand-off, then closes the
     * members' shell widgets (NG-006; a dirty editor keeps Theia's save prompt).
     * A failed write reverts to the restored group (22-UI-SPEC step 9).
     */
    async commitClose(client: GroupActorClient, id: string): Promise<void> {
        const entry = this.closing.get(id);
        if (!entry) {
            return;
        }
        window.clearTimeout(entry.timer);
        const handOff = entry.wasActive ? this.activeGroupId : undefined;
        await this.persist(`close:${id}`, () => {
            this.closing.delete(id);
        }, () => {
            this.restoreClosing(entry);
        }, async () => {
            await client.mutate({ kind: 'closeGroup', id });
            // A Retry that lands after a failed first commit removes the box that failure restored.
            if (this.groups.some(group => group.id === id)) {
                this.groups = this.groups.filter(group => group.id !== id);
                this.members.delete(id);
                if (this.activeGroupId === id) {
                    this.activeGroupId = undefined;
                }
            }
            // Inside the write, so a Retry that lands also closes the widgets.
            for (const tab of entry.tabs) {
                this.widgetOf(tab.uri)?.close();
            }
        }).catch(error => {
            // Step 9: the first failure reverts too; the close: slot stays for the save-error bar's Retry.
            this.restoreClosing(entry);
            this.changeEmitter.fire();
            throw error;
        });
        if (handOff && this.groups.some(group => group.id === handOff)) {
            // The shipped close never wrote the hand-off, so after a reload no group was active.
            this.activityWritten();
            await this.persist(`active:${handOff}`, () => undefined, () => undefined,
                () => client.mutate({ kind: 'setActiveGroup', id: handOff }));
        }
    }

    /**
     * PAN-04 (step 4): once an activity write lands in the store, a group
     * still in its undo window is no longer the stored active group, so Undo
     * must not make it active in memory only; the next reload would override it.
     */
    private activityWritten(): void {
        for (const entry of this.closing.values()) {
            entry.wasActive = false;
        }
    }

    /** PAN-04: commits every pending close (the quit flush). */
    async commitAllClosing(client: GroupActorClient): Promise<void> {
        await Promise.all([...this.closing.keys()].map(id => this.commitClose(client, id).catch(error =>
            console.error('[@powerbrowser/modes] committing a group close failed:', error instanceof Error ? error.name : typeof error))));
    }

    /** The open main-area widget for a row key, matched as `liveTabs` keys it. */
    private widgetOf(uri: string): Widget | undefined {
        return [...this.shell.mainPanel.widgets()].find(widget => widget.id !== 'powerbrowser.modes.organising' && this.keyOf(widget) === uri);
    }

    /**
     * PAN-05 (22-UI-SPEC A8): closes the tab a card stands for, as the strip's
     * × does. An open tab closes through Theia's own close, which awaits the
     * stock save prompt for a dirty editor; its row is marked closed by the web
     * tab or by `watchClose`. A card whose tab is not open has its row marked
     * closed. No membership write (R6): an emptied group stays. Returns whether
     * the card closed; a cancelled save prompt keeps the card and the tab.
     */
    async closeCard(client: GroupActorClient, tab: PanoramaTab): Promise<boolean> {
        const widget = this.widgetOf(tab.uri);
        if (widget) {
            await this.shell.closeWidget(widget.id);
            if (!widget.isDisposed) {
                return false;
            }
            this.removeCardLocal(tab.uri);
            this.changeEmitter.fire();
            return true;
        }
        const from = this.locateCard(tab.uri);
        if (tab.open !== false || !from) {
            return false;
        }
        const index = from.groupId === null ? undefined : (this.members.get(from.groupId) ?? []).findIndex(card => card.uri === tab.uri);
        await this.persist(`closeTab:${tab.uri}`, () => this.removeCardLocal(tab.uri),
            () => this.insertCardLocal(from.card, from.groupId, index),
            () => client.mutate({ kind: 'closeTab', uri: tab.uri }));
        return true;
    }

    /** Marks one group active (accent border + title 600, persisted). */
    async setActiveGroup(client: GroupActorClient, id: string): Promise<void> {
        if (this.activeGroupId === id) {
            return;
        }
        if (!this.groups.some(group => group.id === id)) {
            return;
        }
        const prior = this.activeGroupId;
        const apply = (): void => {
            this.activeGroupId = id;
            for (const group of this.groups) {
                group.isActive = group.id === id;
            }
            this.activityWritten();
        };
        const revert = (): void => {
            this.activeGroupId = prior;
            for (const group of this.groups) {
                group.isActive = group.id === prior;
            }
        };
        await this.persist(`active:${id}`, apply, revert, () => client.mutate({ kind: 'setActiveGroup', id }));
    }

    /**
     * NG-008: reopens a card whose tab is not open, through the opener every
     * other surface uses. A web card reopens on the row it already has (the
     * opener carries its key), so its group, place and thumbnail stay with it;
     * any other tab reopens by its own address, in the main area where cards live.
     */
    async reopen(tab: PanoramaTab): Promise<void> {
        const web = tab.uri.startsWith('web:');
        // M2: one tab per row -- a second reopen of the same card, while the
        // first is in flight or once its web tab exists, opens nothing.
        if (this.reopening.has(tab.uri) || (web && this.shell.widgets.some(widget => widget instanceof WebTabWidget && widget.rowKey === tab.uri))) {
            return;
        }
        this.reopening.add(tab.uri);
        try {
            const target = new URI(web ? (tab.url || EMPTY_PAGE_URL) : tab.uri);
            const options: WebTabOpenerOptions = web ? { rowKey: tab.uri, url: tab.url || EMPTY_PAGE_URL } : { widgetOptions: { area: 'main' } } as WebTabOpenerOptions;
            const opener = await this.openers.getOpener(target, options);
            await opener.open(target, options);
        } finally {
            this.reopening.delete(tab.uri);
        }
    }

    /**
     * Replays every pending write once (save-error Retry). Entries that fail
     * again revert their painted change and clear; entries that succeed
     * clear. Throws the first replay error so the save-error bar stays up.
     */
    async retryPending(client: GroupActorClient): Promise<void> {
        const entries = [...this.pendingWrites.entries()];
        if (!entries.length) {
            return;
        }
        let firstError: unknown;
        for (const [key, current] of entries) {
            try {
                await current.write();
                if (this.pendingWrites.get(key) === current) {
                    this.pendingWrites.delete(key);
                }
            } catch (error) {
                current.attempts += 1;
                if (current.attempts >= 2) {
                    current.revert();
                    this.pendingWrites.delete(key);
                }
                if (firstError === undefined) {
                    firstError = error;
                }
            }
        }
        this.changeEmitter.fire();
        if (firstError !== undefined) {
            throw firstError;
        }
    }

    private async persist(key: string, apply: () => void, revert: () => void, write: () => Promise<unknown>): Promise<void> {
        apply();
        this.changeEmitter.fire();
        // One slot per call: an earlier same-key write still in flight must not
        // clear this one's Retry entry when it lands, and Retry replays this write.
        const slot = { attempts: this.pendingWrites.get(key)?.attempts ?? 0, revert, write };
        this.pendingWrites.delete(key);
        if (this.pendingWrites.size >= GroupModel.PENDING_WRITES_MAX) {
            const oldest = this.pendingWrites.keys().next();
            if (!oldest.done) {
                this.pendingWrites.delete(oldest.value);
            }
        }
        this.pendingWrites.set(key, slot);
        try {
            await write();
            if (this.pendingWrites.get(key) === slot) {
                this.pendingWrites.delete(key);
            }
        } catch (error) {
            slot.attempts += 1;
            if (slot.attempts >= 2) {
                revert();
                this.changeEmitter.fire();
                if (this.pendingWrites.get(key) === slot) {
                    this.pendingWrites.delete(key);
                }
            }
            throw error;
        }
    }

    private locateCard(uri: string): { groupId: string | null; card: PanoramaTab } | undefined {
        for (const [groupId, tabs] of this.members) {
            const card = tabs.find(tab => tab.uri === uri);
            if (card) {
                return { groupId, card };
            }
        }
        const loose = this.ungrouped.find(tab => tab.uri === uri);
        return loose ? { groupId: null, card: loose } : undefined;
    }

    private removeCardLocal(uri: string): void {
        for (const [groupId, tabs] of this.members) {
            const at = tabs.findIndex(tab => tab.uri === uri);
            if (at >= 0) {
                this.members.set(groupId, [...tabs.slice(0, at), ...tabs.slice(at + 1)]);
                return;
            }
        }
        this.ungrouped = this.ungrouped.filter(tab => tab.uri !== uri);
    }

    private insertCardLocal(card: PanoramaTab, groupId: string | null, index?: number): void {
        if (groupId === null) {
            if (!this.ungrouped.some(tab => tab.uri === card.uri)) {
                this.ungrouped = [...this.ungrouped, card];
            }
            return;
        }
        const tabs = this.members.get(groupId);
        if (!tabs || tabs.some(tab => tab.uri === card.uri)) {
            return;
        }
        const at = index === undefined ? tabs.length : Math.max(0, Math.min(tabs.length, index));
        this.members.set(groupId, [...tabs.slice(0, at), card, ...tabs.slice(at)]);
    }

    private parseGroup(raw: unknown): PanoramaGroup | undefined {
        if (!raw || typeof raw !== 'object') {
            return undefined;
        }
        const row = raw as Record<string, unknown>;
        if (typeof row.id !== 'string' || !row.id) {
            return undefined;
        }
        const title = typeof row.title === 'string' && row.title.trim()
            ? row.title.trim().slice(0, GROUP_TITLE_MAX_CHARS)
            : UNTITLED_GROUP_TITLE;
        return {
            id: row.id,
            title,
            x: Math.max(0, toFinite(row.x, 0)),
            y: Math.max(0, toFinite(row.y, 0)),
            w: Math.max(GROUP_BOX_MIN_W, toFinite(row.w, 400)),
            h: Math.max(GROUP_BOX_MIN_H, toFinite(row.h, 300)),
            isActive: row.is_active === 1,
        };
    }

    private parseTab(raw: unknown): PanoramaTab | undefined {
        if (!raw || typeof raw !== 'object') {
            return undefined;
        }
        const row = raw as Record<string, unknown>;
        if (typeof row.uri !== 'string' || !row.uri) {
            return undefined;
        }
        const placed = (value: unknown): number | undefined => {
            const n = typeof value === 'number' ? value : Number(value);
            return value === null || value === undefined || !Number.isFinite(n) ? undefined : Math.max(0, Math.floor(n));
        };
        return {
            uri: row.uri,
            url: typeof row.url === 'string' ? row.url : '',
            // Never the row key: it is internal (NG-001), and a tab with no title shows its page or nothing.
            title: typeof row.title === 'string' && row.title ? row.title : (typeof row.url === 'string' ? row.url : ''),
            thumbnail: typeof row.thumbnail === 'string' && row.thumbnail ? row.thumbnail : null,
            x: placed(row.x),
            y: placed(row.y),
        };
    }
}

/** One web tab a previous session left, as the launch restore knows it. */
export interface SavedWebTab {
    key: string;
    url: string;
    lastAccessed: number | null;
}

/** One web tab the launch restore reopens. */
export interface WebTabRestore {
    key: string;
    url: string;
    withHistory: boolean;
}

/**
 * NG-011: what the launch restore reopens, from the settings in tabs.sqlite.
 * restore_behaviour 'none' reopens nothing. Otherwise a tab last looked at
 * within restore_live_minutes of `quitAt` reopens with its back/forward
 * history, one within restore_url_days at its URL only, and anything older
 * stays closed. restore_live_minutes=0 means URL-only: the live tier applies
 * only when liveMs > 0, so a tab stamped age 0 at quit (saveSession stamps
 * the quit-current tab with lastAccessed = savedAt) never matches it.
 * A tab left closed keeps its card when it is grouped; an
 * ungrouped one is closed-tab history (ruling A-F1, R6).
 */
export function planWebTabRestore(settings: Record<string, string>, tabs: readonly SavedWebTab[], quitAt: number): WebTabRestore[] {
    if (settings.restore_behaviour === 'none') {
        return [];
    }
    // I1: an absent or blank value is NaN, never 0 (Number('') is 0), so it falls back.
    const read = (value: string | undefined): number => ((value ?? '').trim() === '' ? NaN : Number(value));
    const minutes = read(settings.restore_live_minutes);
    const days = read(settings.restore_url_days);
    // A value that is not a number, or is negative, falls back to the default
    // (docs/TAB-STORE.md reader rule). Both restore keys admit 0 (0 to 10080
    // minutes, 0 to 3650 days), so the floor is `>= 0` for both -- the
    // chrome-side sweep reader's shape (`Number.isFinite(x) && x >= 0`); the
    // schedule reader's `> 0` fits integrity_check_minutes (greater than 0)
    // but would wrongly turn restore_live_minutes=0 (URL-only, NG-011's
    // second case) back into the 5-minute default.
    const liveMs = (Number.isFinite(minutes) && minutes >= 0 ? minutes : 5) * 60 * 1000;
    const urlMs = (Number.isFinite(days) && days >= 0 ? days : 30) * 24 * 60 * 60 * 1000;
    // A-T10-m: a session saved without a usable time ages from now.
    const at = quitAt > 0 ? quitAt : Date.now();
    return tabs.flatMap(tab => {
        const age = tab.lastAccessed === null ? Infinity : at - tab.lastAccessed;
        // NG-011: 0 live minutes means URL-only, never history (saveSession
        // stamps the quit-current tab age 0, so `age <= liveMs` with
        // liveMs = 0 would be true); the live tier applies only when
        // liveMs > 0. restore_url_days behaviour is unchanged.
        const withHistory = liveMs > 0 && age <= liveMs;
        return age > urlMs ? [] : [{ key: tab.key, url: tab.url, withHistory }];
    });
}

export type { GroupMutation };
