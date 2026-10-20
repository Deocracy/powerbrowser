import * as React from '@theia/core/shared/react';
import { createPortal } from '@theia/core/shared/react-dom';
import { injectable, inject } from '@theia/core/shared/inversify';
import {
    ApplicationShell,
    FrontendApplicationContribution,
    OpenerService,
    ReactWidget,
    Widget,
} from '@theia/core/lib/browser';
import { CommandRegistry, Disposable } from '@theia/core/lib/common';
import URI from '@theia/core/lib/common/uri';
import { NavigatableWidget } from '@theia/core/lib/browser/navigatable-types';
import { PerspectiveService } from '@theia/core/lib/browser/perspective-service';
import pDebounce from 'p-debounce';
import type { TabQueryRow } from '@powerbrowser/tab-uris/lib/node/tab-query-service';
import { WebTabChannel, WebTabWidget } from '@powerbrowser/tab-uris/lib/browser/web-tab';
import { TabUriRegistry } from '@powerbrowser/tab-uris/lib/browser/tab-uri-registry';
import {
    CHROME_BAR_BACK_COMMAND_ID,
    CHROME_BAR_FORWARD_COMMAND_ID,
    CHROME_BAR_INPUT_CLASS,
    CHROME_BAR_NEW_TAB_COMMAND_ID,
    CHROME_BAR_RELOAD_COMMAND_ID,
    chromeBarHasNavigableTab,
    currentWebTab,
    focusAddressPill,
    setCurrentWebTab,
} from './chrome-bar-commands';
import { CHROME_SUGGESTION_LIMIT, ChromeBarSuggestionService } from './chrome-bar-suggestion-service';
import { MODES_ACTIVATE_COMMAND_ID } from '@powerbrowser/modes/lib/browser/modes-commands';
import { ModeService } from '@powerbrowser/modes/lib/browser/mode-service';
// The organising placeholder's own id, imported for the same const-discipline
// reason every command id here is imported: the tab count excludes that widget
// by identity, and a re-spelled string would keep counting it the day the
// widget renames.
import { OrganisingWidget } from '@powerbrowser/modes/lib/browser/organising-widget';
import { TabStripWidget } from './tab-strip-widget';
import { LayoutControlsWidget } from './layout-controls-widget';
import { MODE_ATTRIBUTE } from '@powerbrowser/modes/lib/browser/mode-attribute';
import '../../src/browser/chrome-bar.css';

/**
 * Maps raw typed text onto the contracted search-or-address routing.
 * Returns the URL to open, or undefined when the text is not an address
 * this tree can visit (the caller surfaces the contracted in-bar failure
 * row). No search-engine host is minted here by design.
 */
function typedAddressTargetOf(text: string): string | undefined {
    if (/^https?:\/\//i.test(text)) {
        return text;
    }
    if (!/\s/.test(text) && !/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(text) && text.includes('.')) {
        return `https://${text}`;
    }
    return undefined;
}

/**
 * GUI-06 (13-03): the chrome bar widget -- nav buttons, address pill with
 * suggestions, new-tab, and the mode toggle.
 *
 * A React contribution added once at startup to the top shell area -- the
 * plain Lumino panel above the main dock, so no core patch and no dock
 * surgery (13-RESEARCH.md Pattern 1). Ratified Variant-A order is menubar,
 * chrome bar, tab strip, workarea, status bar (13-UI-SPEC.md Bar placement
 * and order). Structural class hooks below are the
 * style layer's contract (chrome-bar.css targets them verbatim): bar,
 * buttons, pill, input, dropdown, rows, toggle, segments, tab count.
 *
 * Menu-visibility coupling (13-RESEARCH.md Pitfall 1): the whole top panel
 * hides with `window.menuBarVisibility`, so this bar vanishes with the
 * menu. The menu stays visible by default and no check ever asserts bar
 * visibility while the menu is hidden.
 *
 * Threat notes (13-03 threat model): suggestion titles and captions render
 * as React text nodes only, never markup (T-13-03-01); address commits
 * route through the existing opener with empty as a no-op and no
 * evaluation surface (T-13-03-03); the toggle is selection state only and
 * never touches a tab, with the before/after countTabs comparison in
 * selectMode asserting the invariant on every
 * switch (T-13-03-04); a refused or unacknowledged web-tab navigation takes
 * the same throw-and-catch path a blocked popup once did, with no new dialog
 * authored (T-13-03-05).
 *
 * GUI-02 (14.1-02): http(s) commits, suggestion rows and "+" all land in an
 * in-shell web tab (navigateWebTab below and the New Tab command); the pill
 * is bound to the shell's current widget and to the active web tab's state
 * pushes; nav enablement follows those pushes. No path from this file reaches
 * the stock window -- that survives only behind the GUI-01 palette command.
 *
 * No chrome-side command is registered and nothing opens at startup: the
 * bar only issues commands through the registry on user gestures (a
 * startup-opened window would break the stock chrome per the candidate-A
 * constraint).
 */
@injectable()
export class ChromeBarWidget extends ReactWidget {

    static readonly ID = 'powerbrowser.chrome-bar';

    /** The three shipped mode defaults, in contracted order. */
    static readonly MODES = ['Coding', 'Browsing', 'Organising'];

    @inject(CommandRegistry)
    protected readonly commands: CommandRegistry;

    @inject(OpenerService)
    protected readonly openerService: OpenerService;

    @inject(ChromeBarSuggestionService)
    protected readonly suggestions: ChromeBarSuggestionService;

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;


    // No PerspectiveService here by design: every mode switch this widget
    // issues -- shipped segment and custom row alike -- goes through the mode
    // command, which owns the stock switch plus the contracted panel work.
    // The contribution below still holds the service, to LISTEN for the stock
    // perspective event and to read the live id at startup; it never switches.

    /**
     * GUI-07 (14-02): custom modes listed beside the shipped defaults. The
     * shipped MODES literal above stays the fallback behind customs: customs
     * append as menu rows after the shipped segments, truncated by ellipsis
     * at row width with full names in tooltips, the active row carrying the
     * inherited selected-row marker. Shipped rows are never mutated.
     */
    @inject(ModeService)
    protected readonly modes: ModeService;

    /** GUI-02: the widget -> URI direction, for the pill's address on non-web tabs (UI-SPEC A6). */
    @inject(TabUriRegistry)
    protected readonly tabUris: TabUriRegistry;

    /** The active web tab's state-push subscription; replaced on every current-widget change. */
    protected stateSubscription: Disposable | undefined;

    protected customModes: Array<{ id: string; name: string }> = [];
    protected activeCustomId: string | undefined = undefined;

    protected inputValue = '';
    protected committedAddress = '';
    protected rows: TabQueryRow[] = [];
    protected dropdownOpen = false;
    protected highlightIndex = -1;
    protected providerFailed = false;
    protected commitFailed = false;
    protected shimmer = false;
    protected mode = ChromeBarWidget.MODES[0];
    protected querySeq = 0;
    /** True from a keystroke until the dropdown is closed on user intent; a debounced query fires only while armed. */
    protected dropdownArmed = false;
    protected pillRef: HTMLDivElement | null = null;

    /**
     * Re-derives the portalled dropdown geometry after a window resize
     * (every keystroke already re-renders, so only resize needs a push).
     */
    repositionDropdown(): void {
        if (this.dropdownOpen) {
            this.update();
        }
    }

    /** Debounced pill queries over the RPC proxy (in-tree p-debounce pin, 150ms precedent). */
    protected readonly debouncedQuery = pDebounce((prefix: string) => this.runQuery(prefix), 150);

    constructor() {
        super();
        // ReactWidget's constructor opts every subclass into perfect-scrollbar.
        // On a fixed-height bar that is actively harmful: it set overflow:hidden
        // on a node the shell had sized to the 32px menubar row while the bar
        // itself is 40px, so 8px was clipped and the bar drifted to y=-4 as the
        // hidden scroll position moved. The bar is one fixed row and scrolls in
        // no direction, so it takes no scrollbar.
        this.scrollOptions = undefined;
        this.id = ChromeBarWidget.ID;
        this.title.label = 'Chrome Bar';
        this.title.caption = 'Chrome Bar';
        this.title.closable = false;
    }

    /** NAV-01: Stop while the active web tab loads, otherwise the Reload command. */
    protected onReloadClick = async (): Promise<void> => {
        const tab = currentWebTab();
        if (tab?.loading) {
            tab.stop();
            this.update();
            return;
        }
        await this.runCommand(CHROME_BAR_RELOAD_COMMAND_ID)();
    };

    protected runCommand = (id: string) => async (): Promise<void> => {
        try {
            await this.commands.executeCommand(id);
        } catch (error) {
            console.error('[@powerbrowser/chrome-bar] command failed:', id, error);
        }
        this.update();
    };

    /**
     * Closes the dropdown on user intent (commit, Escape, blur) AND
     * invalidates any query still in flight. Without the bump, a query
     * started by the last keystroke and still outstanding at Enter would
     * finish after the commit and re-open the dropdown over the page --
     * measured live by 14.1-03's web-tab check, where the reopened
     * dropdown counted as a blocking layer and the overlay stayed hidden.
     */
    protected closeDropdown(): void {
        this.querySeq += 1;
        this.dropdownArmed = false;
        this.dropdownOpen = false;
        this.highlightIndex = -1;
    }

    protected async runQuery(prefix: string): Promise<void> {
        // Only text typed since the last close may open the dropdown. The
        // debounce delays this call, so a query scheduled by the last
        // keystroke BEFORE Enter still arrives here AFTER the commit; the
        // sequence bump in closeDropdown cannot see it because the sequence
        // is taken below. Without this guard that late query re-opened the
        // dropdown over the committed page.
        if (!this.dropdownArmed) {
            return;
        }
        const seq = ++this.querySeq;
        // Row-level shimmer only past the contracted delay: local matches
        // paint synchronously with no spinner; the shimmer row appears only
        // when the provider is still outstanding after 150ms.
        const timer = setTimeout(() => {
            if (this.querySeq === seq) {
                this.shimmer = true;
                this.dropdownOpen = true;
                this.update();
            }
        }, 150);
        try {
            const rows = await this.suggestions.searchByPrefix(prefix, CHROME_SUGGESTION_LIMIT);
            if (this.querySeq !== seq) {
                return;
            }
            this.rows = rows.slice(0, CHROME_SUGGESTION_LIMIT);
            this.providerFailed = false;
        } catch {
            if (this.querySeq !== seq) {
                return;
            }
            this.rows = [];
            this.providerFailed = true;
        } finally {
            clearTimeout(timer);
            if (this.querySeq === seq) {
                this.shimmer = false;
                this.dropdownOpen = true;
                this.highlightIndex = -1;
                this.update();
            }
        }
    }

    protected onInputChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
        this.inputValue = e.target.value;
        this.commitFailed = false;
        this.dropdownArmed = true;
        this.update();
        void this.debouncedQuery(this.inputValue);
    };

    /**
     * Opens a committed URL on the GUI-02 routing: http and https navigate
     * the active in-shell web tab, or open a new one when the active tab is
     * not a web tab (navigateWebTab below); every other scheme (view:,
     * settings:) keeps the existing two-step opener routing (getOpener plus
     * handler open), which already navigates in-Theia views correctly. No
     * path from here reaches the stock window: that survives only behind
     * the GUI-01 palette command.
     */
    protected openCommittedUrl = async (url: string): Promise<void> => {
        if (/^https?:\/\//i.test(url)) {
            await this.navigateWebTab(url);
        } else {
            const uri = new URI(url);
            const handler = await this.openerService.getOpener(uri);
            await handler.open(uri);
        }
    };

    /**
     * The one http(s) route. With an active web tab, navigates it in place
     * and turns a refused or unacknowledged reply into a throw so the
     * caller's catch surfaces the carried in-bar failure row (no new copy);
     * without one, the two-step opener resolves to WebTabOpenHandler at
     * priority 1000 and opens a new web tab.
     */
    protected async navigateWebTab(url: string): Promise<void> {
        const tab = currentWebTab();
        if (tab) {
            const reply = await tab.navigate(url);
            if (!reply.ok) {
                throw new Error('web tab did not acknowledge the navigation');
            }
            return;
        }
        const uri = new URI(url);
        const handler = await this.openerService.getOpener(uri);
        await handler.open(uri);
    }

    /** Surfaces a commit failure in-bar per the copy contract: one failure row, Enter retries. */
    protected showCommitFailure(): void {
        this.commitFailed = true;
        this.dropdownOpen = true;
        this.highlightIndex = -1;
        this.update();
    }

    /**
     * Activates a suggestion row through its url field, never its opaque
     * uri key: the key is a store identity (kept as the React list key
     * below), not an address any opener could route.
     */
    protected commitRow = async (row: TabQueryRow): Promise<void> => {
        const url = row.url;
        this.committedAddress = url;
        this.inputValue = url;
        this.commitFailed = false;
        this.closeDropdown();
        this.update();
        try {
            await this.openCommittedUrl(url);
        } catch {
            this.showCommitFailure();
        }
    };

    /**
     * Commits typed text by scheme, inventing no search addressability:
     * text already carrying http or https goes to the web-tab route as-is;
     * host-like text (no spaces, no scheme, containing a dot) is normalized
     * with an https prefix onto the same route; anything else is not an
     * address this tree can visit, so it surfaces the contracted in-bar
     * failure row instead of a file-scheme editor open, and no search-engine
     * host is minted anywhere (non-address text stays local). Empty commits
     * are no-ops.
     */
    protected commitText = async (raw: string): Promise<void> => {
        const text = raw.trim();
        if (!text) {
            return;
        }
        this.committedAddress = text;
        this.inputValue = text;
        this.commitFailed = false;
        this.closeDropdown();
        this.update();
        const target = typedAddressTargetOf(text);
        if (!target) {
            this.showCommitFailure();
            return;
        }
        try {
            await this.openCommittedUrl(target);
        } catch {
            this.showCommitFailure();
        }
    };

    protected onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            if (!this.dropdownOpen || this.rows.length === 0) {
                return;
            }
            const step = e.key === 'ArrowDown' ? 1 : -1;
            const next = this.highlightIndex + step;
            this.highlightIndex = (next + this.rows.length) % this.rows.length;
            this.update();
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (this.commitFailed) {
                // Retry affordance: Enter re-commits the typed text.
                this.commitFailed = false;
                void this.commitText(this.inputValue);
                return;
            }
            const highlighted = this.highlightIndex >= 0 ? this.rows[this.highlightIndex] : undefined;
            if (highlighted) {
                void this.commitRow(highlighted);
            } else {
                void this.commitText(this.inputValue);
            }
        } else if (e.key === 'Escape') {
            // Two-stage dismissal: first press closes the dropdown, second
            // restores the committed address.
            if (this.dropdownOpen) {
                this.closeDropdown();
                this.update();
            } else {
                this.inputValue = this.committedAddress;
                this.update();
            }
        }
    };

    protected onInputBlur = (): void => {
        this.closeDropdown();
        this.update();
    };

    /**
     * The address the pill shows for a widget (UI-SPEC "The address pill,
     * bound to the active tab"): a web tab's live page URL when it has one;
     * any other tab's registry URI string; the empty string for a page-less
     * web tab, a widget with no registry URI, a mode surface such as
     * Organising (a mode, not a tab: it has no address), or no widget at
     * all. The empty-page URL, factory ids and tab counters never reach here.
     */
    protected addressOf(widget: Widget | undefined): string {
        if (!widget || TabStripWidget.MODE_SURFACES.includes(widget.id)) {
            return '';
        }
        if (widget instanceof WebTabWidget) {
            return widget.hasPage ? widget.url : '';
        }
        // Editors are Theia Navigatables addressed by their own resource
        // URI (docs/URI-SCHEMES.md), not registry rows -- fall back to it so
        // a file tab shows its path (found live 2026-09-07: empty pill).
        return this.tabUris.uriOf(widget)?.toString(true)
            ?? NavigatableWidget.getUri(widget)?.toString(true)
            ?? '';
    }

    /**
     * Re-derives the pill from a widget, unless the user is typing: while
     * the input has focus AND carries an uncommitted edit, neither a tab
     * change nor a state push overwrites it (the carried two-stage Esc
     * restores the committed address). Focus alone is not the guard: after
     * Enter the input keeps focus and the value equals the committed text,
     * and that is exactly when chrome's canonical URL must replace it.
     */
    protected syncAddressFromWidget(widget: Widget | undefined): void {
        const input = this.pillRef?.querySelector('input');
        if (input && document.activeElement === input && this.inputValue !== this.committedAddress) {
            return;
        }
        const address = this.addressOf(widget);
        this.inputValue = address;
        this.committedAddress = address;
        this.commitFailed = false;
        this.update();
    }

    /**
     * Current-widget change from the contribution: follows the new widget's
     * state pushes when it is a web tab (dropping the previous
     * subscription), then syncs the pill and re-renders nav enablement.
     */
    onCurrentWidgetChanged(widget: Widget | undefined): void {
        this.stateSubscription?.dispose();
        this.stateSubscription = undefined;
        if (widget instanceof WebTabWidget) {
            this.stateSubscription = widget.onDidChangeState(() => {
                this.syncAddressFromWidget(widget);
                this.update();
            });
        }
        this.syncAddressFromWidget(widget);
        this.update();
    }

    /**
     * The MAIN-AREA tab count, and only that. `allTabBars` is
     * mainAreaTabBars plus bottomAreaTabBars plus the left and right panel
     * tab bars, so counting it folded in exactly the surfaces a mode switch
     * is contracted to change: Browsing and Organising collapse all three
     * side areas, Coding expands the left one. The before/after comparison
     * in selectMode was therefore false-red by construction -- it reported
     * the contracted panel reshape as a broken tabs invariant on every
     * switch, which is permanent noise in the one log used to diagnose a
     * real tab loss.
     *
     * The organising placeholder is excluded one hop further down for the
     * same reason: the Organising slot opens exactly one main-area widget on
     * entry and closes it on exit, so counting it would move the number by
     * one on each of the two switches that cross the Organising boundary --
     * again a contracted change, not a lost tab.
     */
    protected countTabs(): number {
        return this.shell.mainAreaTabBars.reduce(
            (total, tabBar) => total + tabBar.titles.filter(title => title.owner.id !== OrganisingWidget.ID).length,
            0
        );
    }

    /**
     * Segment selection activates the matching shipped mode through the
     * imported mode command const -- the identical channel selectCustomMode
     * uses below, never a re-spelled string.
     *
     * The three shipped segments used to call the stock perspective service
     * directly, one hop shallower, and that was the whole reason a shipped
     * mode reshaped nothing: the contracted per-mode panel map, the panel
     * expand/collapse flags, and the organising slot all live behind the
     * mode command, so a direct stock switch skipped every one of them.
     * Coding switched perspective and then showed no Theia view. Custom rows
     * never had the bug because they always routed through the command.
     *
     * The toggle stays selection state only: the segment is set and
     * repainted even when activation throws, and a tab-count mismatch is
     * logged, never thrown. Segment labels map to mode ids by lowercasing --
     * the shipped-mode defaults gate asserts that rule, so a label that stops
     * mapping fails the gate instead of silently switching nothing. The
     * repaint path is unchanged: the stock perspective event still fires at
     * the end of the switch (one hop deeper now, inside the command), and
     * the contribution's onDidChangePerspective subscription re-asserts the
     * toggle from it.
     */
    protected selectMode = (next: string) => async (): Promise<void> => {
        if (this.mode === next && this.activeCustomId === undefined) {
            return;
        }
        const before = this.countTabs();
        this.mode = next;
        this.activeCustomId = undefined;
        try {
            await this.commands.executeCommand(MODES_ACTIVATE_COMMAND_ID, next.toLowerCase());
        } catch (error) {
            console.error('[@powerbrowser/chrome-bar] mode activation failed:', next, error);
        }
        const after = this.countTabs();
        if (before !== after) {
            console.error(
                `[@powerbrowser/chrome-bar] tabs invariant broken by a mode switch: ${before} tabs before, ${after} after`
            );
        }
        this.update();
    };

    /**
     * GUI-07 (14-02): custom-mode activation routes through the imported mode
     * command const (never a re-spelled string) so panel flags, the
     * placeholder slot re-assert run the same switch path as
     * shipped segments. The stock perspective event repaints the toggle.
     */
    protected selectCustomMode = (id: string) => async (): Promise<void> => {
        try {
            await this.commands.executeCommand(MODES_ACTIVATE_COMMAND_ID, id);
        } catch (error) {
            console.error('[@powerbrowser/chrome-bar] custom mode activation failed:', id, error);
        }
        this.update();
    };

    protected refreshCustomModes(): void {
        let customs: Array<{ id: string; name: string }> = [];
        try {
            customs = this.modes.getCustomModes();
        } catch {
            customs = [];
        }
        this.customModes = customs;
        if (this.activeCustomId !== undefined && !customs.some(row => row.id === this.activeCustomId)) {
            this.activeCustomId = undefined;
        }
    }

    /**
     * Stock perspective changes from anywhere else (commands, palette,
     * layout restore) re-assert the toggle. Unknown ids leave
     * the shipped selection untouched and still re-assert the count.
     */
    syncModeFromPerspective(id: string): void {
        this.refreshCustomModes();
        const label = ChromeBarWidget.MODES.find(candidate => candidate.toLowerCase() === id);
        if (label !== undefined) {
            this.mode = label;
            this.activeCustomId = undefined;
        } else if (this.modes.hasCustomMode(id)) {
            this.activeCustomId = id;
        } else {
            this.activeCustomId = undefined;
        }
        this.update();
    }

    protected renderDropdown(): React.ReactNode {
        if (!this.dropdownOpen) {
            return undefined;
        }
        const body = this.dropdownBody();
        // Body portal: the bar lives under a PerfectScrollbar `.ps` wrapper
        // with overflow hidden, which clips any in-tree dropdown at the
        // 40px bar edge (rows render in DOM but are neither visible nor
        // hittable). Portalling to body with fixed geometry escapes the
        // clipping ancestor; no ancestor carries transform/filter, so fixed
        // positions against the viewport. Geometry re-derives on every
        // render (each keystroke re-renders) plus on window resize.
        const pill = this.pillRef?.getBoundingClientRect();
        const style: React.CSSProperties | undefined = pill ? {
            position: 'fixed',
            top: Math.round(pill.bottom + 4),
            left: Math.round(pill.left),
            width: Math.round(pill.width),
        } : undefined;
        return createPortal(
            <div className='pb-chrome-bar-dropdown' role='listbox' aria-label='Suggestions' style={style}>
                {body}
            </div>,
            document.body
        );
    }

    protected dropdownBody(): React.ReactNode {
        if (this.commitFailed) {
            return <>
                <div className='pb-chrome-bar-row'>PowerBrowser couldn&apos;t open that address. Press Enter to try again.</div>
                <div className='pb-chrome-bar-dropdown-footer'>Enter opens the address · Esc closes suggestions</div>
            </>;
        }
        return <>
            {this.providerFailed ? (
                <div className='pb-chrome-bar-row'>PowerBrowser couldn&apos;t load suggestions. Press Enter to visit what you typed.</div>
            ) : this.rows.length === 0 && !this.shimmer ? (
                <div className='pb-chrome-bar-row'>
                    <div className='pb-chrome-bar-row-title'>No suggestions</div>
                    <div className='pb-chrome-bar-row-caption'>No matches for what you typed — press Enter to visit it as an address.</div>
                </div>
            ) : (
                this.rows.map((row, index) => (
                    <div
                        key={row.uri}
                        role='option'
                        aria-selected={index === this.highlightIndex}
                        className={'pb-chrome-bar-row' + (index === this.highlightIndex ? ' is-highlighted' : '')}
                        onMouseDown={e => {
                            e.preventDefault();
                            void this.commitRow(row);
                        }}
                    >
                        <div className='pb-chrome-bar-row-title' title={row.title}>{row.title}</div>
                        <div className='pb-chrome-bar-row-caption' title={row.url}>{row.url}</div>
                    </div>
                ))
            )}
            {this.shimmer && <div className='pb-chrome-bar-row is-shimmer' aria-hidden='true' />}
            <div className='pb-chrome-bar-dropdown-footer'>Enter opens the address · Esc closes suggestions</div>
        </>;
    }

    protected render(): React.ReactNode {
        // One shared navigable-tab predicate (GUI-02-owned) narrowed by the
        // active web tab's last state push: all three controls dim with
        // their contracted tooltips retained and the layout never shifts.
        const canNavigate = chromeBarHasNavigableTab();
        const tab = currentWebTab();
        const stopping = !!tab?.loading;
        const secure = this.inputValue.trim().startsWith('https://');
        return <div className='pb-chrome-bar'>
            <button
                className='pb-chrome-bar-button'
                title='Back'
                aria-label='Back'
                disabled={!canNavigate || !tab?.canGoBack}
                onClick={this.runCommand(CHROME_BAR_BACK_COMMAND_ID)}
            >
                <span className='codicon codicon-chevron-left' />
            </button>
            <button
                className='pb-chrome-bar-button'
                title='Forward'
                aria-label='Forward'
                disabled={!canNavigate || !tab?.canGoForward}
                onClick={this.runCommand(CHROME_BAR_FORWARD_COMMAND_ID)}
            >
                <span className='codicon codicon-chevron-right' />
            </button>
            {/* NAV-01: ONE element is Reload or Stop by the pushed loading flag, so
                keyboard focus on it survives every load (no remount, no key change). */}
            <button
                className='pb-chrome-bar-button'
                title={stopping ? 'Stop' : 'Reload'}
                aria-label={stopping ? 'Stop' : 'Reload'}
                disabled={!stopping && (!canNavigate || !tab?.canReload)}
                onClick={this.onReloadClick}
            >
                <span className={stopping ? 'codicon codicon-close' : 'codicon codicon-refresh'} />
            </button>
            <div className='pb-chrome-bar-pill' ref={el => { this.pillRef = el; }}>
                {secure && <span className='codicon codicon-lock pb-chrome-bar-lock' aria-hidden='true' />}
                <input
                    className={CHROME_BAR_INPUT_CLASS}
                    placeholder='Search or enter address'
                    aria-label='Search or enter address'
                    spellCheck={false}
                    value={this.inputValue}
                    onChange={this.onInputChange}
                    onKeyDown={this.onInputKeyDown}
                    onBlur={this.onInputBlur}
                />
            </div>
            {this.renderDropdown()}
            <button
                className='pb-chrome-bar-button'
                title='New Tab'
                aria-label='New Tab'
                onClick={this.runCommand(CHROME_BAR_NEW_TAB_COMMAND_ID)}
            >
                <span className='codicon codicon-plus' />
            </button>
            <div className='pb-chrome-bar-toggle' role='group' aria-label='Mode'>
                {ChromeBarWidget.MODES.map(name => (
                    <button
                        key={name}
                        type='button'
                        className={'pb-chrome-bar-segment' + (this.mode === name && this.activeCustomId === undefined ? ' is-active' : '')}
                        aria-pressed={this.mode === name && this.activeCustomId === undefined}
                        onClick={this.selectMode(name)}
                    >
                        {name}
                    </button>
                ))}
                {this.customModes.length > 0 && (
                    <div className='pb-modes-custom-menu'>
                        {this.customModes.map(row => (
                            <button
                                key={row.id}
                                type='button'
                                className={'pb-chrome-bar-segment pb-modes-custom-row' + (this.activeCustomId === row.id ? ' is-active' : '')}
                                aria-pressed={this.activeCustomId === row.id}
                                title={row.name}
                                onClick={this.selectCustomMode(row.id)}
                            >
                                {row.name}
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>;
    }
}

@injectable()
export class ChromeBarContribution implements FrontendApplicationContribution {

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    @inject(ChromeBarWidget)
    protected readonly barWidget: ChromeBarWidget;

    @inject(TabStripWidget)
    protected readonly tabStrip: TabStripWidget;

    @inject(LayoutControlsWidget)
    protected readonly layoutControls: LayoutControlsWidget;

    /**
     * Top-panel widgets that belong to the IDE dress and not the browser one,
     * by their stock ids. Browsing hides them; the strip takes the space.
     */
    static readonly IDE_TOP_FURNITURE: readonly string[] = ['theia:menubar', 'theia:icon'];

    @inject(PerspectiveService)
    protected readonly perspectives: PerspectiveService;

    /** GUI-02: the frontend end of the web-tab bridge, for chrome's reserved accel+L. */
    @inject(WebTabChannel)
    protected readonly webTabs: WebTabChannel;

    /**
     * One current-widget sync for the subscription and the startup seed:
     * the shared navigable-tab predicate and the pill's address both
     * follow the shell's current widget.
     */
    protected syncCurrentWidget(widget: Widget | undefined): void {
        setCurrentWebTab(widget);
        this.barWidget.onCurrentWidgetChanged(widget);
    }

    /**
     * GUI-07 strip relocation: put the tabs in the home this mode contracts.
     *
     * Browsing shows the top-panel strip, hides the menubar whose 30px it
     * occupies, and hides the dock's own tab bar. Every other mode is the
     * reverse. 14-UI-SPEC per-mode shell map, amended 2026-09-08.
     *
     * This lives here rather than in `ModeService.activateMode` with the rest
     * of the per-mode shell work, and the reason is a dependency cycle, not
     * taste: `@powerbrowser/chrome-bar` already imports `@powerbrowser/modes`
     * (the activate command, ModeService, OrganisingWidget), so the mode
     * service cannot import the strip back. Reaching it by
     * `shell.getWidgetById` instead does not work either -- Theia's
     * `addWidget` only tracks main/bottom/left/right, `case 'top'` is a bare
     * `topPanel.addWidget`, so no top-panel widget is ever in the registry.
     * That was not theory: the first cut hid the dock's bar and left the
     * strip hidden with it, showing no tabs at all in Browsing.
     *
     * Driven by `body[data-pb-mode]`, which `ModeService.activateMode`
     * writes at the end of EVERY switch including the launch one. The
     * perspective event was the obvious hook and is the wrong one: stock
     * `switchPerspective` returns silently for an already-active id, so
     * arriving in Browsing when Browsing is already the perspective fires
     * nothing, and the launch seed lost the same race the toggle's own seed
     * exists to work around. Live, that showed as a correct strip after any
     * real switch and no strip at all on a fresh page.
     *
     * An attribute the mode service already publishes has neither problem:
     * it is set once per activation, it is set last, and reading it here
     * needs no import that would close the cycle.
     */
    protected observeMode(): void {
        const apply = () => {
            this.applyStripHome(document.body.getAttribute(MODE_ATTRIBUTE) ?? '');
            this.scheduleDragRegions();
        };
        new MutationObserver(apply).observe(document.body, { attributeFilter: [MODE_ATTRIBUTE] });
        // Re-assert on every shell add and remove, not only on a mode change.
        // The dock creates its tab bars as it needs them, and a bar that
        // appears after the switch has never been told which mode it is in --
        // it takes Lumino's default, which is visible. Reported live as tabs
        // vanishing in Coding after opening a tab in Browsing, and it is a
        // race, not a wrong flag: the same switch is correct when the dock
        // happens to settle first. Re-applying is idempotent, so the cure is
        // to stop depending on the order at all.
        this.shell.onDidAddWidget(() => apply());
        this.shell.onDidRemoveWidget(() => apply());
        // And on every dock layout change. A split or an un-split is neither
        // an add nor a remove -- the widget is the same, only its pane moved
        // -- but it changes how many tab bars exist, which is what decides
        // whether Browsing shows them.
        this.shell.mainPanel.layoutModified.connect(() => apply());
        // The launch activation may have landed before this ran, in which
        // case no mutation is coming and the attribute is already correct.
        apply();
    }

    protected applyStripHome(modeId: string): void {
        // An unknown mode arranges NOTHING. Every rule below is phrased by
        // exclusion -- not coding, not browsing -- so an empty id used to
        // satisfy both and hide the dock bar AND the strip, leaving no tabs
        // anywhere. That is not hypothetical: it fired 22 times during
        // startup before the attribute existed, and once on every tab open
        // and close whose re-assert read the attribute mid-transition. It is
        // the "tabs vanish after switching back and forth" report, and the
        // earlier re-assert fix made it easier to hit rather than causing it.
        //
        // Leaving the shell alone is the only safe reading of "I do not know
        // which mode this is": the arrangement already on screen was applied
        // by a mode that did know.
        if (!modeId) {
            return;
        }
        // One rule, phrased by exclusion: Coding wears the IDE dress, every
        // other mode wears the browser one. The same rule the rails and the
        // status bar already follow in ModeService, so a mode cannot end up
        // half-dressed -- and a future mode gets the browser shell unless it
        // asks for the IDE, rather than inheriting the IDE from a list nobody
        // updated.
        //
        // Organising is why this is not `=== 'browsing'`. It had the menubar
        // and no strip, which was both wrong to look at and geometrically
        // stuck: the top panel is pinned at 72px, so hiding the menubar with
        // nothing to take its place leaves 32px of dead space above the
        // canvas. Showing the strip there fills exactly that, and the tabs
        // stay reachable while their cards are being arranged below.
        const ideDress = modeId === 'coding';
        // The strip is Browsing's home only. Organising's tabs are the cards
        // on its canvas, so a strip there would be the same tabs twice -- it
        // was carried there briefly only to fill the space the menubar left,
        // which the per-mode top-panel height in chrome-bar.css now removes
        // the need for.
        this.tabStrip.setHidden(modeId !== 'browsing');
        this.layoutControls.setHidden(!ideDress);
        // The mode just opened or closed panels; the toggles show that state.
        this.layoutControls.update();
        for (const widget of this.shell.topPanel.widgets) {
            if (ChromeBarContribution.IDE_TOP_FURNITURE.includes(widget.id)) {
                widget.setHidden(!ideDress);
            }
        }
        // The dock's own tab bars, one per pane.
        //
        // Unsplit, Browsing hides the single bar: the strip above the URL row
        // shows the same tabs, and showing both is the same list twice. Split,
        // the bars come back, because they are the only thing on screen that
        // says which tabs are in WHICH pane -- the strip is one flat row over
        // the whole dock and cannot. Each bar sits under the URL row, holds
        // its pane's tabs with the current one lit, and is a drop target for
        // the next tab, so parking one tab on the left is what makes the
        // right side grow a place to put another. The strip stays as the
        // master list to drag from, in either direction.
        //
        // The leftmost pane is the exception in both cases: the strip IS its
        // tab bar (TabStripWidget.primaryBar), so its own bar stays hidden
        // and a tab is listed exactly once. Every other pane shows its bar.
        //
        // Read fresh, in layout order, every time this runs: the dock
        // creates and removes bars as the layout changes, and which one is
        // first is a fact about the layout, not a flag to keep in step.
        //
        // Split, every pane shows its own bar with its own tabs, the leftmost
        // included -- the user is in a tab and expects to see it in the bar
        // under the URL row, whichever side it is on (2026-09-10, with a
        // screenshot of a blank left bar circled). The strip above still
        // lists the leftmost pane's tabs as the row to drag from and back to;
        // that one pane's tabs therefore appear in both places while split,
        // and that is the Theia arrangement the user asked for by name.
        // The home bar shows while the window is split OR while tabs are
        // stacked on the home side with no other pane left -- closing the
        // last tab of the other pane must not make the stacked ones vanish
        // (they are not in the strip either; reported 2026-09-10).
        const bars = [...this.shell.mainPanel.tabBars()];
        const showHome = bars.length > 1 || this.tabStrip.hasStack();
        const home = this.tabStrip.primaryBar();
        for (const bar of bars) {
            bar.setHidden(!ideDress && bar === home && !showHome);
        }
        // The two 48px icon rails, re-asserted here for the same reason the
        // tab bars are: the mode service hides them once, on the switch, and
        // anything that shows them afterwards wins by default.
        //
        // Dragging a tab is exactly such a thing. The shell reveals its side
        // panels while a widget drag is in flight, because in an IDE they are
        // places you might drop it -- so dragging a tab toward either edge of
        // a Browsing window pops out a strip of IDE icons, and they stay out
        // after the drop. Reported live 2026-09-09 with a screenshot of both
        // rails standing in a browser window.
        //
        // Re-asserting rather than suppressing the reveal: the drag is stock
        // shell behaviour reached through stock APIs, and this widget already
        // owns "what furniture does this mode keep". A drop fires
        // onDidAddWidget, which is what runs this.
        // A collapsed side stays hidden even in Coding: its icons are across
        // its own top, so there is no rail to leave standing.
        this.shell.leftPanelHandler.container.setHidden(!ideDress || this.shell.leftPanelHandler.dockPanel.isHidden);
        this.shell.rightPanelHandler.container.setHidden(!ideDress || this.shell.rightPanelHandler.dockPanel.isHidden);
        // Showing a tab bar changes its class; it does not, on its own, make
        // the dock re-run its layout. Without this the dock kept allocating
        // the content as if the bar were still hidden, so the page was drawn
        // at the bar's own y and the bar was underneath it -- present,
        // not hidden, and invisible. That is the "tab bar disappears" report,
        // and the geometry log is what identified it: in Coding the web tab's
        // content node was at y=72, the bar's position, instead of the 107 a
        // 35px bar puts it at.
        //
        // fit() re-measures, update() repaints. Cheap, and only on a mode
        // switch or a tab add/remove.
        this.shell.mainPanel.fit();
        this.shell.mainPanel.update();
    }

    /**
     * Ends a Lumino drag whose release never arrived.
     *
     * Lumino finishes a drag on the document's `pointerup`. In the shipped
     * shell that event has been observed not to arrive: a tab dragged out of
     * the strip and released stayed in flight -- ghost still on screen, the
     * strip tab still dimmed, the drop never made (2026-09-10, with a
     * screenshot). Every variant of the same gesture completes in a stock
     * Chromium build of the same frontend, so this is about how the release
     * reaches a remote Gecko frame, not about the drag.
     *
     * The next move tells the truth regardless: a `pointermove` with no
     * button held while a drag image is still attached means the button was
     * released somewhere this document did not hear. Dispatching the missing
     * `pointerup` at that point is enough -- Lumino's own handler takes it
     * from there, hit-tests the current target and completes the drop
     * exactly as it would have. It applies to every Lumino drag in the
     * shell, the dock's own tab bars included, which matters because a dock
     * whose drag never ended refuses to start another.
     *
     * ponytail: papers over a release the frame did not see; the real fix is
     * finding why Gecko withheld it and belongs in the chrome layer.
     */
    protected armDragRelease(): void {
        window.addEventListener('pointermove', event => {
            // Trusted moves only. `Drag.start()` dispatches a synthetic
            // pointermove of its own, with no buttons, the instant the drag
            // image is attached -- reacting to that ended every drag inside
            // its own start() call, which then returned null (2026-09-10,
            // from the shell's console: "drag.start(...) is null").
            if (!event.isTrusted || event.buttons !== 0 || !document.querySelector('.lm-mod-drag-image')) {
                return;
            }
            console.warn('[@powerbrowser/chrome-bar] drag still in flight with no button held; ending it');
            document.dispatchEvent(new PointerEvent('pointerup', {
                bubbles: true,
                cancelable: true,
                button: 0,
                buttons: 0,
                clientX: event.clientX,
                clientY: event.clientY,
                pointerId: event.pointerId,
                pointerType: event.pointerType,
                isPrimary: event.isPrimary,
            }));
        }, true);
    }

    /**
     * Custom title bar. The shell window draws no OS title bar, so the
     * window moves by the empty parts of its top rows: the strip and the
     * URL row in Browsing, the menubar and the URL row in Coding, the
     * toolbar and the URL row in Organising -- as a Firefox toolbar does, every
     * pixel that is not a control. Dragging is
     * chrome-only in Gecko, so this measures the rects and chrome lays
     * invisible handles over them. Chrome's own window buttons overlay the
     * top-right corner; `windowChrome` answers how wide they are, and
     * `--pb-window-controls` keeps the first row clear of them.
     *
     * Re-measured on every mode/layout re-assert, on resize, and on any
     * change inside the strip (a tab's title growing moves the tail), all
     * coalesced to one frame and sent only when different.
     */
    protected dragFrame: number | undefined;
    protected lastDragRegions = '';

    protected scheduleDragRegions(): void {
        if (this.dragFrame !== undefined) {
            return;
        }
        this.dragFrame = window.requestAnimationFrame(() => {
            this.dragFrame = undefined;
            this.publishDragRegions();
        });
    }

    protected publishDragRegions(): void {
        const mode = document.body.getAttribute(MODE_ATTRIBUTE);
        const controls = parseFloat(getComputedStyle(document.body).getPropertyValue('--pb-window-controls')) || 0;
        // Every row the mode shows at the top, first row first, with the
        // things on it that must stay clickable. What is left of each row is
        // where the window moves -- the same rule as a Firefox toolbar.
        const rows: { row: Element; items: Element[] }[] = [];
        const bar = this.barWidget.node.querySelector('.pb-chrome-bar');
        const menubar = this.shell.topPanel.widgets.find(w => w.id === 'theia:menubar')?.node;
        const toolbar = document.querySelector('.pb-org-toolbar');
        if (mode === 'browsing') {
            rows.push({ row: this.tabStrip.node, items: Array.from(this.tabStrip.node.querySelectorAll('.pb-tab')) });
        } else if (mode === 'coding' && menubar) {
            rows.push({
                row: menubar,
                items: [...Array.from(menubar.querySelectorAll('.lm-MenuBar-item')), ...Array.from(this.layoutControls.node.children)],
            });
        } else if (mode === 'organising' && toolbar) {
            rows.push({ row: toolbar, items: Array.from(toolbar.children) });
        }
        if (bar) {
            rows.push({ row: bar, items: Array.from(bar.children) });
        }
        // Chrome's window buttons overlay the first row's right end only.
        // The first row spans the whole panel, not just its element: the
        // menubar is only as wide as its menus, so measured alone everything
        // right of "Help" (and the logo's margin left of "File") was not a
        // handle (reported 2026-10-20).
        const panel = this.shell.topPanel.node.getBoundingClientRect();
        const limit = panel.right - controls;
        const rects = rows.flatMap(({ row, items }, index) => {
            const r = row.getBoundingClientRect();
            if (r.height === 0) {
                return [];
            }
            const right = index === 0 ? limit : r.right;
            const spans = items.map(el => el.getBoundingClientRect()).filter(s => s.width > 0).sort((a, b) => a.left - b.left);
            const out: { x: number; y: number; w: number; h: number }[] = [];
            let x = index === 0 ? panel.left : r.left;
            for (const s of spans) {
                if (s.left - x > 4) {
                    out.push({ x, y: r.top, w: s.left - x, h: r.height });
                }
                x = Math.max(x, s.right);
            }
            if (right - x > 4) {
                out.push({ x, y: r.top, w: right - x, h: r.height });
            }
            return out;
        });
        const height = rows[0]?.row.getBoundingClientRect().height ?? 0;
        const key = JSON.stringify([rects, height]);
        if (key === this.lastDragRegions) {
            return;
        }
        this.lastDragRegions = key;
        this.webTabs.send({ kind: 'windowDragRegions', rects, height });
    }

    async onStart(): Promise<void> {
        this.armDragRelease();
        window.addEventListener('resize', () => this.scheduleDragRegions());
        new MutationObserver(() => this.scheduleDragRegions())
            .observe(this.tabStrip.node, { childList: true, subtree: true, characterData: true, attributes: true });
        void this.webTabs.request({ kind: 'windowChrome' }).then(reply => {
            if (reply.ok && typeof reply.width === 'number') {
                document.body.style.setProperty('--pb-window-controls', `${reply.width}px`);
            }
            this.scheduleDragRegions();
        });
        if (!this.shell.getWidgetById(ChromeBarWidget.ID)) {
            await this.shell.addWidget(this.barWidget, { area: 'top' });
        }
        // Two calls, both load-bearing. `addWidget` is what REGISTERS the
        // widget with the shell, so `getWidgetById` can find it -- the mode
        // service reaches the strip that way, because importing the class
        // there would close a dependency cycle (chrome-bar already imports
        // @powerbrowser/modes). Registering via topPanel.insertWidget alone
        // looked right and was not: the strip rendered, `getWidgetById`
        // returned undefined, the mode service's `strip?.setHidden` no-opped,
        // and Browsing hid the dock's bar with nothing put in its place.
        //
        // `insertWidget(0, ...)` then HOISTS it, because addWidget appends and
        // the top panel is a BoxPanel that stacks in child order -- appended,
        // the strip would sit under the URL row instead of above it. Moving an
        // already-parented child is what Panel.insertWidget does.
        if (!this.shell.getWidgetById(TabStripWidget.ID)) {
            await this.shell.addWidget(this.tabStrip, { area: 'top' });
            this.shell.topPanel.insertWidget(0, this.tabStrip);
        }
        // Right after the menubar, so it shares the menubar's row and the
        // chrome bar (full basis) still wraps below both.
        if (!this.shell.getWidgetById(LayoutControlsWidget.ID)) {
            await this.shell.addWidget(this.layoutControls, { area: 'top' });
            const menubar = this.shell.topPanel.widgets.findIndex(w => w.id === 'theia:menubar');
            if (menubar >= 0) {
                this.shell.topPanel.insertWidget(menubar + 1, this.layoutControls);
            }
        }
        this.perspectives.onDidChangePerspective(id => {
            this.barWidget.syncModeFromPerspective(id);
        });
        // The toggle's opening selection is the LIVE perspective, never the
        // first shipped label. Mode activation and this contribution are both
        // FrontendApplicationContributions with no ordering guarantee between
        // them, so a perspective activated before this subscription fires no
        // event we can hear -- and the toggle would keep asserting Coding
        // while the shell sat in the Browsing launch default. That
        // disagreement was not cosmetic: activateMode() early-returns when the
        // requested mode is already selected, so clicking the segment the
        // toggle already claimed was a no-op and Coding was unreachable until
        // the user round-tripped through another mode.
        this.observeMode();
        const activePerspective = this.perspectives.getActivePerspectiveId();
        if (activePerspective !== undefined) {
            this.barWidget.syncModeFromPerspective(activePerspective);
        }
        // GUI-02: the SELECTED MAIN-AREA TAB drives the navigable-tab
        // predicate and the pill -- the dock's current title, not the
        // focus-derived shell.currentWidget. A web tab's body is covered by
        // the chrome overlay, so its placeholder node never receives DOM
        // focus in real use ("+" focuses the pill, a click lands in the
        // overlay): keyed on focus, the bar never subscribed to the tab's
        // state pushes and the pill stayed on the typed text (found live
        // 2026-09-07). Seeded once because an activation can precede this
        // subscription (the perspective seed above exists for the same
        // ordering hazard).
        this.shell.mainPanel.onDidChangeCurrent(title => this.syncCurrentWidget(title?.owner));
        this.syncCurrentWidget(this.shell.mainPanel.currentTitle?.owner);
        // The landing half of chrome's reserved accel+L: from inside a page
        // the shell key asks the frontend to focus the address, the channel
        // re-emits it here, and the pill takes focus with its content
        // selected -- the same result as the in-Theia keybinding.
        this.webTabs.onDidRequestFocusAddress(() => focusAddressPill());
        // The portalled dropdown positions against the viewport, so a
        // window resize re-derives its geometry while open.
        window.addEventListener('resize', () => this.barWidget.repositionDropdown());
    }
}
