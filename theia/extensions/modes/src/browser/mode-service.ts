import { injectable, inject } from '@theia/core/shared/inversify';
import {
    ApplicationShell,
    FrontendApplicationContribution,
    StatusBar,
    StatusBarAlignment,
    WidgetManager,
} from '@theia/core/lib/browser';
import { StatusBarImpl } from '@theia/core/lib/browser/status-bar/status-bar';
import { PerspectiveService } from '@theia/core/lib/browser/perspective-service';
import { StorageService } from '@theia/core/lib/browser/storage-service';
import { QuickInputService } from '@theia/core/lib/common/quick-pick-service';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { FileChangeType } from '@theia/filesystem/lib/common/files';
import { UserStorageUri } from '@theia/userstorage/lib/browser/user-storage-uri';
import pDebounce from 'p-debounce';
import { SHIPPED_MODES, closeOrganisingSlot, openOrganisingSlot } from './mode-descriptors';
import { publishModeAttribute } from './mode-attribute';
import { inputCappedName } from './capped-name-input';


/**
 * GUI-07 (14-02): custom modes as user-storage data over the shipped defaults.
 *
 * Schema (resolves 14-RESEARCH.md Open Question 2, modes half): the customs
 * file holds an object with a numeric version plus a customs array whose rows
 * carry a name and side-panel visibility flags. A row once also carried a
 * NG-035: a row also carries `furniture` and `views` (which views sit in which side area); both are optional, so a file written before them still loads and the version did not move. Shipped modes resolve to the same shape through SHIPPED_MODE_RULES.
 * Validation is hand-rolled total parsing: unknown fields are dropped, rows
 * with an unusable name are dropped silently, rows with a readable name but
 * unreadable fields are dropped with the contracted fallback notice naming
 * them, and a wholly unreadable file falls back to shipped Browsing with the
 * contracted notice (naming the last-good active custom when one is known,
 * resetting silently otherwise) -- never a blank shell, never a throw during
 * startup (T-14-02-01).
 *
 * Lifecycle (customize-css precedent): absence is the default and is never
 * created; the first read runs fire-and-forget after startup (awaiting a
 * user-storage read inside onStart re-enters the documented boot-chain
 * deadlock); later read failures keep last-good content; DELETED resets
 * immediately; other changes reload through the in-tree 150ms debounce, and
 * the persisted active custom id is re-applied after registration so a custom
 * mode survives relaunch (14-RESEARCH.md Pitfall 3). Stock PerspectiveService
 * exposes no unregister, so a custom deleted mid-session keeps its descriptor
 * until relaunch: the service drops it from every listing and falls back to
 * Browsing when stuck on it, and the stale toggle row clears on relaunch.
 *
 * Save path (14-PATTERNS.md section 3): the name field is cut at the
 * contracted 60-character cap while typing (inputCappedName, G-23), and the
 * commit-time trim and slice stay as a backstop; the contracted empty-name
 * and duplicate-name errors write nothing partial; success flashes the
 * contracted saved confirmation and lands in the new mode (whose stock switch
 * event repaints the toggle). A custom never alters a shipped default in
 * place: shipped-colliding names are duplicates. Names render as text with
 * ellipsis plus tooltip at the toggle (T-14-02-02).
 *
 * The switch path (activateMode) is the allowlisted surface the
 * switch-invariant gate derives at check time: stock perspective switching,
 * side-panel expand and collapse, contribution-routed placeholder open and
 * close through the descriptor slot seam, and -- via the widget's
 * publishTabCount on the same stock event -- the chip re-assertion. No switch
 * path closes, moves, or detaches a tab (T-14-02-04). The one addition is
 * ensureInArea, which DOCKS the Explorer before expanding it: stock's
 * `expand(id)` is a pure find over widgets already in the dock, so with the
 * view absent it returned undefined having done nothing, and Coding showed no
 * Theia view at all. Adding a widget is additive by construction -- it cannot
 * detach one.
 */

/** Accepted store versions. Newer writers are read leniently: unknown fields drop. */
export const MODES_STORE_VERSION = 1;

/** Contracted name cap (14-UI-SPEC.md): inputCappedName cuts typed and pasted overflow while typing; the commit slice is a backstop. */
export const MODE_NAME_MAX = 60;

/** NG-035: what a mode does to one side area -- open it, close it, or leave it as the user left it. */
export type PanelRule = 'open' | 'closed' | 'keep';

/**
 * NG-035: the singleton views a mode docks in each side area, in tab order.
 * Content tabs (terminals, editors, web tabs) are never listed: tabs go with
 * you in every mode (notes/browser-window-model.md:46-49).
 */
export interface ModeViews {
    left: string[];
    right: string[];
    bottom: string[];
}

/**
 * NG-035: one mode's rules, as data. The shipped defaults below and every
 * custom row in modes.json resolve to this one shape, and activateMode reads
 * nothing else -- it branches on no mode id.
 */
export interface ModeRules {
    left: PanelRule;
    right: PanelRule;
    bottom: PanelRule;
    /** The IDE furniture: the status bar and both icon rails (14-UI-SPEC per-mode furniture, amended 2026-09-08). */
    furniture: boolean;
    /** Whether the mode opens the Organising slot (the Panorama canvas). */
    organising: boolean;
    views: ModeViews;
}

/**
 * NG-035: the shipped defaults as data (14-CONTEXT.md:33, "Modes are data
 * with shipped defaults"). One row per shipped descriptor, one line per row:
 * gui07-mode-toggle-commands reads this table and compares it with the
 * descriptors' first-activation placements and collapse areas.
 * P65-09: the orca row docks Orca's two view containers, the left
 * powerbrowser-orca-view-container and the right
 * powerbrowser-orca-right-view-container (literals; modes never imports
 * orca-panes), and adds no activation hook (P64-18).
 */
export const SHIPPED_MODE_RULES: Readonly<Record<string, ModeRules>> = Object.freeze({
    coding: { left: 'open', right: 'keep', bottom: 'open', furniture: true, organising: false, views: { left: ['explorer-view-container'], right: [], bottom: [] } },
    browsing: { left: 'closed', right: 'closed', bottom: 'closed', furniture: false, organising: false, views: { left: [], right: [], bottom: [] } },
    organising: { left: 'closed', right: 'closed', bottom: 'closed', furniture: false, organising: true, views: { left: [], right: [], bottom: [] } },
    orca: { left: 'open', right: 'open', bottom: 'closed', furniture: true, organising: false, views: { left: ['powerbrowser-orca-view-container'], right: ['powerbrowser-orca-right-view-container'], bottom: [] } },
});

export interface CustomModeSnapshot {
    name: string;
    leftVisible: boolean;
    rightVisible: boolean;
    bottomVisible: boolean;
    /** NG-035: whether the IDE furniture shows in this mode. */
    furniture: boolean;
    /** NG-035: the views docked per side area when the mode was saved. */
    views: ModeViews;
}

function viewList(value: unknown): string[] {
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string' && id.length > 0) : [];
}

/** NG-035: a stored views object, or undefined when absent or unreadable. */
function parseModeViews(value: unknown): ModeViews | undefined {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return undefined;
    }
    const record = value as Record<string, unknown>;
    return { left: viewList(record['left']), right: viewList(record['right']), bottom: viewList(record['bottom']) };
}

/**
 * NG-035: a row saved before views existed keeps what it did then -- the
 * shipped Coding views on the left whenever its left panel shows.
 */
function legacyModeViews(leftVisible: boolean): ModeViews {
    return { left: leftVisible ? [...SHIPPED_MODE_RULES.coding.views.left] : [], right: [], bottom: [] };
}

const SHIPPED_IDS: ReadonlySet<string> = new Set(SHIPPED_MODES.map(descriptor => descriptor.id));

/** Custom descriptor ids live in their own namespace, never colliding with shipped ids. */
export function customModeIdFor(name: string): string {
    const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return `custom-${slug || 'mode'}`;
}

interface ParsedModeStore {
    ok: boolean;
    customs: CustomModeSnapshot[];
    badNames: string[];
}

/**
 * Total parse of the customs file: never throws, always produces a value.
 * Whole-file failure (unparseable, not an object, non-numeric version,
 * non-array customs) reports ok:false; row failure drops the row, naming it
 * in badNames only when its name survived (otherwise silent).
 */
function parseModeStore(raw: string): ParsedModeStore {
    const empty: ParsedModeStore = { ok: false, customs: [], badNames: [] };
    let top: unknown;
    try {
        top = JSON.parse(raw);
    } catch {
        return empty;
    }
    if (typeof top !== 'object' || top === null) {
        return empty;
    }
    const record = top as Record<string, unknown>;
    if (typeof record['version'] !== 'number' || !Array.isArray(record['customs'])) {
        return empty;
    }
    const customs: CustomModeSnapshot[] = [];
    const badNames: string[] = [];
    const seen = new Set<string>();
    for (const entry of record['customs']) {
        if (typeof entry !== 'object' || entry === null) {
            continue;
        }
        const row = entry as Record<string, unknown>;
        if (typeof row['name'] !== 'string') {
            continue;
        }
        const name = row['name'].trim().slice(0, MODE_NAME_MAX);
        if (!name) {
            continue;
        }
        const id = customModeIdFor(name);
        // Shipped-colliding NAMES are duplicates (ids live in the separate
        // `custom-<slug>` namespace, so comparing the id against SHIPPED_IDS
        // could never match -- compare the label instead, matching the save
        // path's `isDuplicateName` discipline).
        if (SHIPPED_MODES.some(descriptor => descriptor.label.toLowerCase() === name.toLowerCase()) || seen.has(id)) {
            continue;
        }
        seen.add(id);
        if (typeof row['leftVisible'] !== 'boolean'
            || typeof row['rightVisible'] !== 'boolean'
            || typeof row['bottomVisible'] !== 'boolean') {
            badNames.push(name);
            continue;
        }
        // NG-035: `furniture` and `views` are optional so a row written before
        // them still loads; a `layout` from an older build is an unknown field
        // and drops as before.
        customs.push({
            name,
            leftVisible: row['leftVisible'] as boolean,
            rightVisible: row['rightVisible'] as boolean,
            bottomVisible: row['bottomVisible'] as boolean,
            furniture: row['furniture'] === true,
            views: parseModeViews(row['views']) ?? legacyModeViews(row['leftVisible'] as boolean),
        });
    }
    return { ok: true, customs, badNames };
}

@injectable()
export class ModeService implements FrontendApplicationContribution {

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    @inject(PerspectiveService)
    protected readonly perspectives: PerspectiveService;

    @inject(StorageService)
    protected readonly storage: StorageService;

    @inject(QuickInputService)
    protected readonly quickInput: QuickInputService;

    @inject(FileService)
    protected readonly fileService: FileService;

    @inject(StatusBar)
    protected readonly statusBar: StatusBar;

    @inject(StatusBarImpl)
    protected readonly statusBarWidget: StatusBarImpl;

    @inject(WidgetManager)
    protected readonly widgetManager: WidgetManager;

    protected readonly modesUri = UserStorageUri.resolve('modes.json');
    protected readonly debouncedReload = pDebounce(() => this.reloadCustomModes(), 150);
    protected lastGoodCustoms: CustomModeSnapshot[] = [];
    protected registeredCustomIds = new Set<string>();
    protected droppedCustomIds = new Set<string>();
    protected customModesLoadedPromise: Promise<void> | undefined;

    onStart(): void {
        // Fire-and-forget: awaiting this read here re-enters the boot-chain
        // deadlock documented in the customize-css header. Shipped modes are
        // already registered synchronously by ModesContribution.
        void (this.customModesLoadedPromise = this.loadCustomModes());
        this.fileService.onDidFilesChange(event => {
            // A DELETED change is a deliberate absence: reset immediately,
            // bypassing the keep-last-good guard (same shape as customize).
            if (event.contains(this.modesUri, FileChangeType.DELETED)) {
                void this.handleStoreDeleted();
                return;
            }
            if (event.contains(this.modesUri)) {
                void this.debouncedReload();
            }
        });
    }

    /**
     * GUI-07 (14-UI-SPEC: "Browsing (launch default)"): nothing else activates
     * a mode on a normal launch. ModesContribution only REGISTERS the
     * descriptors, and reapplyPersistedMode() re-activates custom ids only, so
     * a shipped id was restored by nobody. The shell therefore opened on stock
     * Theia's own layout while the toggle asserted its first literal label --
     * and because activateMode() early-returns on the already-active id, the
     * mode the toggle falsely claimed could not be entered by clicking it.
     *
     * This hook, not onStart: a fire-and-forget switch from onStart resolves
     * BEFORE the shell is even attached (frontend-application.js:59-66 runs
     * startContributions, then attachShell, then initializeLayout), so it
     * snapshotted an empty pre-attach layout under 'default' and left the
     * active id pointing at a perspective the restorer then had no layout for
     * -- stock's own "No saved layout for perspective ... falling back to
     * default" warning. onDidInitializeLayout fires at :68, strictly after
     * initializeLayout at :66, and is awaited at :211-213 before the app
     * reaches 'ready'. Awaiting it here is deliberate and is why the promise is
     * returned rather than voided: the launch mode must be settled before
     * SetupsService re-applies the last session at 'ready', which is also why
     * reachedState('ready') is the wrong hook. Nothing on this path touches the
     * backend -- it reads local storage only -- so it cannot re-enter the
     * boot-chain deadlock documented in the customize-css header.
     */
    onDidInitializeLayout(): Promise<void> {
        return this.applyLaunchMode();
    }

    /**
     * The mode switch path: stock switch, explicit panel flags, placeholder
     * slot, and -- through the widget's stock-event subscription -- the chip
     * re-assertion. Unknown ids resolve to shipped Browsing, so this never
     * blanks the shell. The switch-invariant gate derives the shell-mutating
     * calls in this body at check time; keep them to the allowlist.
     */
    async activateMode(id: string): Promise<void> {
        const target = this.resolveTarget(id);
        // Unguarded on purpose, and the fallback switch that used to sit in a
        // catch here is gone with the catch: stock's doSwitchPerspective returns
        // silently for an already-active id (perspective-service.js:114-116) and
        // for an unregistered one (:117-120), and swallows every layout failure
        // into logger.warn (:142-144). The only statements it leaves outside
        // that try are the descriptor hooks at :122-124 and :145-147, and every
        // descriptor this extension registers now wraps its hooks
        // (main-area-exemption.ts), so switchPerspective has no path left to
        // reject -- the catch could never run, and the 'browsing' retry inside
        // it was unreachable code claiming to be a safety net.
        await this.perspectives.switchPerspective(target);
        const rules = this.rulesFor(target);
        // NG-035: dock the mode's views before any panel opens or closes.
        // ensureInArea is additive (see its note below), and stock's
        // expand(id) finds only a view already in the dock.
        for (const area of ['left', 'right', 'bottom'] as const) {
            for (const viewId of rules.views[area]) {
                await this.ensureInArea(viewId, area);
            }
        }
        // collapse() floats a promise (expand is sync void): attach the
        // no-op catch so a shutdown-time rejection is silence, not noise.
        if (rules.left === 'open') {
            this.shell.leftPanelHandler.expand(rules.views.left[0]);
        } else if (rules.left === 'closed') {
            void this.shell.leftPanelHandler.collapse().catch(() => undefined);
        }
        if (rules.right === 'open') {
            this.shell.rightPanelHandler.expand(rules.views.right[0]);
        } else if (rules.right === 'closed') {
            void this.shell.rightPanelHandler.collapse().catch(() => undefined);
        }
        if (rules.bottom === 'open') {
            this.shell.expandPanel('bottom');
        } else if (rules.bottom === 'closed') {
            await this.shell.collapsePanel('bottom');
        }
        if (rules.organising) {
            openOrganisingSlot();
        } else {
            closeOrganisingSlot();
        }
        // 14-UI-SPEC per-mode furniture (amended 2026-09-08): a mode's
        // `furniture` rule decides whether it keeps the icon rails and the
        // status bar (Coding's shipped row does);
        // Browsing is a browser and Organising is a full-screen canvas.
        //
        // Not CSS. Lumino positions both absolutely, so `display: none` hides
        // them while their space stays reserved -- measured live 2026-09-08,
        // the main area kept x=48 h=973 with the furniture hidden by
        // stylesheet. `setHidden` is the shell's own path and relayouts: the
        // same measurement showed main reaching x=0 w=1968 h=995.
        //
        // AFTER the panel flags above, not before, and that order is
        // load-bearing: `leftPanelHandler.collapse()` calls the handler's own
        // refresh(), which re-shows the container. Hiding the rail first
        // therefore did nothing at all -- `container.isHidden` read back
        // false and the rail stayed 48px wide in every mode (measured
        // 2026-09-08 against the built sidecar, which is the only reason this
        // was caught: the gate and the typecheck were both green over it).
        //
        // The menubar is deliberately NOT hidden here: Theia sizes the top
        // panel as a unit (setTopPanelVisibility hides the whole thing) and
        // our URL row shares it, so hiding the menubar alone leaves the main
        // area at y=72 with 32px of dead space above it. It is solved by the
        // strip relocation, which moves the bar out of the top panel anyway.
        this.statusBarWidget.setHidden(!rules.furniture);
        // A collapsed side stays hidden: with the icons across its top there
        // is no rail to show (TopTabsSidePanelHandler).
        this.shell.leftPanelHandler.container.setHidden(!rules.furniture || this.shell.leftPanelHandler.dockPanel.isHidden);
        // Both rails, not just the left: the right one is the same 48px of
        // IDE dress on the other edge.
        this.shell.rightPanelHandler.container.setHidden(!rules.furniture || this.shell.rightPanelHandler.dockPanel.isHidden);

        publishModeAttribute(target);
    }

    /**
     * Put a view in an area before expanding it. Stock's `expand(id)`
     * (side-panel-handler.js:282-289) is a pure find over the widgets ALREADY
     * in that dock: a miss returns undefined having done nothing, which is why
     * Coding could collapse into a mode with no Theia view at all. The only
     * stock code that ever ADDS the view is applyViewPlacements, and that runs
     * on a mode's FIRST activation only -- once Coding has a saved layout
     * without the Explorer, nothing else can put it back.
     *
     * Additive by construction: it creates or fetches the widget and adds it,
     * and has no branch that can detach, move, or close anything. The guard is
     * real parentage, NOT `shell.getWidgetById`, which resolves against the
     * shell's FocusTracker (application-shell.js:1923-1929) and keeps returning
     * a DETACHED widget until it is disposed -- in the exact failure case being
     * fixed here it would report the view present and this would do nothing.
     * The whole body is guarded because a widget-manager failure is a missing
     * side view, never a reason to abandon the rest of the switch.
     */
    protected async ensureInArea(viewId: string, area: 'left' | 'right' | 'bottom'): Promise<void> {
        try {
            const widget = await this.widgetManager.getOrCreateWidget(viewId);
            if (widget.isAttached && this.shell.getAreaFor(widget) === area) {
                return;
            }
            await this.shell.addWidget(widget, { area });
        } catch {
            // The mode still switches; the view is simply not there this time.
        }
    }

    /** Customs listed beside the shipped defaults for the toggle; shipped rows untouched. */
    getCustomModes(): Array<{ id: string; name: string }> {
        return this.lastGoodCustoms.map(row => ({ id: customModeIdFor(row.name), name: row.name }));
    }

    /**
     * NG-032: resolves when the launch-time custom-mode load settles, so the
     * session restore can resolve a custom mode id against loaded customs
     * instead of racing the fire-and-forget load in onStart. Never rejects:
     * loadCustomModes has no rejecting path. Late callers (after the load
     * settled) resolve at once.
     */
    whenCustomModesLoaded(): Promise<void> {
        return this.customModesLoadedPromise ?? Promise.resolve();
    }

    hasCustomMode(id: string): boolean {
        return this.lastGoodCustoms.some(row => customModeIdFor(row.name) === id);
    }

    async saveCurrentAsMode(): Promise<void> {
        const answer = await inputCappedName(this.quickInput, { prompt: 'Save as Mode', placeHolder: 'Mode name' }, MODE_NAME_MAX);
        if (answer === undefined) {
            return;
        }
        const name = answer.trim().slice(0, MODE_NAME_MAX);
        if (!name) {
            void this.flash('Give the mode a name — type a name and choose Save as Mode.');
            return;
        }
        if (this.isDuplicateName(name)) {
            void this.flash('A mode with this name already exists. Choose a different name.');
            return;
        }
        const row: CustomModeSnapshot = {
            name,
            leftVisible: this.shell.isExpanded('left'),
            rightVisible: this.shell.isExpanded('right'),
            bottomVisible: this.shell.isExpanded('bottom'),
            // NG-035: the layout, not only the three flags -- which views sit in
            // which side area, and whether the IDE furniture is showing.
            furniture: !this.statusBarWidget.isHidden,
            views: { left: this.viewsIn('left'), right: this.viewsIn('right'), bottom: this.viewsIn('bottom') },
        };
        const customs = [...this.lastGoodCustoms, row];
        try {
            await this.fileService.write(this.modesUri, JSON.stringify({ version: MODES_STORE_VERSION, customs }, undefined, 2));
        } catch {
            void this.flash('PowerBrowser could not save this mode. Your panels are unchanged — try again.');
            return;
        }
        this.lastGoodCustoms = customs;
        // A re-save after a store delete must clear the stale drop marker:
        // the descriptor was never unregistered by stock, so without this
        // `resolveTarget` keeps rejecting the just-saved id to Browsing.
        this.droppedCustomIds.delete(customModeIdFor(name));
        this.registerCustom(row);
        void this.flash(`Mode "${name}" saved.`);
        await this.activateMode(customModeIdFor(name));
    }

    protected resolveTarget(id: string): string {
        if (SHIPPED_IDS.has(id)) {
            return id;
        }
        if (this.registeredCustomIds.has(id) && !this.droppedCustomIds.has(id)) {
            return id;
        }
        return 'browsing';
    }

    /** NG-035: the rules for a resolved mode id -- its shipped row, its custom row, or Browsing's. */
    protected rulesFor(target: string): ModeRules {
        if (SHIPPED_IDS.has(target) && Object.prototype.hasOwnProperty.call(SHIPPED_MODE_RULES, target)) {
            return SHIPPED_MODE_RULES[target];
        }
        const custom = this.lastGoodCustoms.find(row => customModeIdFor(row.name) === target);
        if (custom) {
            return {
                left: custom.leftVisible ? 'open' : 'closed',
                right: custom.rightVisible ? 'open' : 'closed',
                bottom: custom.bottomVisible ? 'open' : 'closed',
                furniture: custom.furniture,
                organising: false,
                views: custom.views,
            };
        }
        return SHIPPED_MODE_RULES.browsing;
    }

    /**
     * NG-035: the singleton views docked in `area`, as their factory ids. A
     * widget created with options (a terminal, an editor, a plugin view) is a
     * tab or an instance, not layout, and is left out.
     */
    protected viewsIn(area: 'left' | 'right' | 'bottom'): string[] {
        const ids: string[] = [];
        for (const widget of this.shell.getWidgets(area)) {
            const description = this.widgetManager.getDescription(widget);
            if (description && description.options === undefined && !ids.includes(description.factoryId)) {
                ids.push(description.factoryId);
            }
        }
        return ids;
    }

    protected isDuplicateName(name: string): boolean {
        const folded = name.toLowerCase();
        if (SHIPPED_MODES.some(descriptor => descriptor.label.toLowerCase() === folded)) {
            return true;
        }
        const id = customModeIdFor(name);
        return this.lastGoodCustoms.some(row => row.name.toLowerCase() === folded || customModeIdFor(row.name) === id);
    }

    protected async flash(text: string): Promise<void> {
        const id = 'powerbrowser.modes.notice';
        try {
            await this.statusBar.setElement(id, { text, alignment: StatusBarAlignment.RIGHT });
        } catch {
            return;
        }
        window.setTimeout(() => {
            void this.statusBar.removeElement(id).catch(() => undefined);
        }, 4000);
    }

    protected registerCustom(row: CustomModeSnapshot): void {
        const id = customModeIdFor(row.name);
        if (SHIPPED_IDS.has(id) || this.registeredCustomIds.has(id)) {
            return;
        }
        const collapsed: Array<'left' | 'right' | 'bottom'> = [];
        if (!row.leftVisible) {
            collapsed.push('left');
        }
        if (!row.rightVisible) {
            collapsed.push('right');
        }
        if (!row.bottomVisible) {
            collapsed.push('bottom');
        }
        // NG-035: stock applies these on the mode's first activation; activateMode docks them on every one.
        const placements = new Map<string, 'left' | 'right' | 'bottom'>();
        for (const area of ['left', 'right', 'bottom'] as const) {
            for (const viewId of row.views[area]) {
                placements.set(viewId, area);
            }
        }
        try {
            this.perspectives.registerPerspective({
                id,
                label: row.name,
                viewPlacements: placements,
                chromeOptions: { collapseAreas: collapsed },
            });
        } catch {
            return;
        }
        this.registeredCustomIds.add(id);
    }

    protected async loadCustomModes(): Promise<void> {
        let raw: string;
        try {
            raw = (await this.fileService.read(this.modesUri)).value;
        } catch {
            // First-ever read: absence is the untouched default, never created.
            return;
        }
        this.applyStoreText(raw);
    }

    protected async reloadCustomModes(): Promise<void> {
        let raw: string;
        try {
            raw = (await this.fileService.read(this.modesUri)).value;
        } catch {
            // A later read failure is a mid-save race: keep last good, leave
            // the shell untouched.
            return;
        }
        this.applyStoreText(raw);
    }

    protected async handleStoreDeleted(): Promise<void> {
        try {
            const active = this.perspectives.getActivePerspectiveId();
            this.lastGoodCustoms = [];
            this.droppedCustomIds = new Set(this.registeredCustomIds);
            if (this.registeredCustomIds.has(active)) {
                await this.activateMode('browsing');
            }
        } catch {
            this.lastGoodCustoms = [];
        }
    }

    protected applyStoreText(raw: string): void {
        const parsed = parseModeStore(raw);
        if (!parsed.ok) {
            void this.handleCorruptStore();
            return;
        }
        this.lastGoodCustoms = parsed.customs;
        const currentIds = new Set(parsed.customs.map(row => customModeIdFor(row.name)));
        this.droppedCustomIds = new Set(
            [...this.registeredCustomIds].filter(id => !currentIds.has(id) && !SHIPPED_IDS.has(id))
        );
        for (const row of parsed.customs) {
            this.registerCustom(row);
        }
        for (const bad of parsed.badNames) {
            void this.flash(`PowerBrowser couldn't load the "${bad}" mode. Browsing is shown instead.`);
        }
        const active = this.safeActiveId();
        if (active !== undefined && this.droppedCustomIds.has(active)) {
            void this.activateMode('browsing');
        } else {
            void this.reapplyPersistedMode();
        }
    }

    protected async handleCorruptStore(): Promise<void> {
        const fallbackName = await this.corruptFallbackName();
        this.lastGoodCustoms = [];
        this.droppedCustomIds = new Set(this.registeredCustomIds);
        await this.activateMode('browsing');
        if (fallbackName !== undefined) {
            void this.flash(`PowerBrowser couldn't load the "${fallbackName}" mode. Browsing is shown instead.`);
        }
    }

    protected async corruptFallbackName(): Promise<string | undefined> {
        try {
            const persisted = await this.storage.getData<{ activePerspectiveId?: unknown }>('perspective-layouts');
            const id = persisted?.activePerspectiveId;
            if (typeof id === 'string' && id.startsWith('custom-')) {
                const known = this.lastGoodCustoms.find(row => customModeIdFor(row.name) === id);
                if (known) {
                    return known.name;
                }
                const human = id.slice('custom-'.length).replace(/-+/g, ' ').trim();
                if (human) {
                    return human;
                }
            }
        } catch {
            return undefined;
        }
        return undefined;
    }

    /**
     * GUI-07/GUI-09: the mode a launch opens in -- the persisted mode when it
     * is one of the shipped ids, else the contracted Browsing default. Custom
     * ids are deliberately NOT handled here: they register asynchronously from
     * user storage, and reapplyPersistedMode() already owns re-activating them
     * once they exist. An unreadable store is an absence, never a throw, and
     * falls through to the same default.
     */
    protected async applyLaunchMode(): Promise<void> {
        let persistedId: unknown;
        try {
            const data = await this.storage.getData<{ activePerspectiveId?: unknown }>('perspective-layouts');
            persistedId = data?.activePerspectiveId;
        } catch {
            persistedId = undefined;
        }
        const shipped = typeof persistedId === 'string'
            && SHIPPED_MODES.some(descriptor => descriptor.id === persistedId);
        await this.activateMode(shipped ? persistedId as string : 'browsing');
    }

    protected async reapplyPersistedMode(): Promise<void> {
        let persistedId: unknown;
        try {
            const data = await this.storage.getData<{ activePerspectiveId?: unknown }>('perspective-layouts');
            persistedId = data?.activePerspectiveId;
        } catch {
            return;
        }
        if (typeof persistedId !== 'string') {
            return;
        }
        if (this.registeredCustomIds.has(persistedId) && !this.droppedCustomIds.has(persistedId)) {
            if (this.safeActiveId() !== persistedId) {
                await this.activateMode(persistedId);
            }
        } else if (this.droppedCustomIds.has(persistedId) && this.safeActiveId() === persistedId) {
            await this.activateMode('browsing');
        }
    }

    protected safeActiveId(): string | undefined {
        try {
            return this.perspectives.getActivePerspectiveId();
        } catch {
            return undefined;
        }
    }
}
