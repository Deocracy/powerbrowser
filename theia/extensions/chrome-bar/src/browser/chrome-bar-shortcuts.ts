/**
 * Phase 27 (NAV-01, KEY-01..05): THE shortcut table for browser keys pressed
 * while a web page has focus. A focused overlay page owns the keyboard, so the
 * Theia frame never sees these keys; chrome catches each one with a
 * page-scoped `<key>` row and pushes `{ kind: 'shortcut', id, tabId }` here.
 * `PAGE_KEYS` in `powerbrowser/shell/powerbrowser.js` mirrors this table row
 * for row (same ids, same key and modifiers); the action for each id lives in
 * `ChromeBarShortcutRelay.actions` below and nowhere else.
 *
 * The relay also owns the page-focus signal: chrome pushes `pageFocus` with
 * the focused page's tab id (or null), which sets a context key and makes that
 * tab current without stealing DOM focus from the page.
 */

import { inject, injectable } from '@theia/core/shared/inversify';
import { ApplicationShell, FrontendApplicationContribution, Widget } from '@theia/core/lib/browser';
import { CommandRegistry } from '@theia/core/lib/common/command';
import { isOSX } from '@theia/core/lib/common/os';
import { ContextKey, ContextKeyService } from '@theia/core/lib/browser/context-key-service';
import { WebTabChannel, WebTabWidget } from '@powerbrowser/tab-uris/lib/browser/web-tab';
import { CHROME_BAR_NEW_TAB_COMMAND_ID, chooseSaveDestination, focusAddressPill, openBookmarkStar, openFindBarFor } from './chrome-bar-commands';
import { AddressBar } from './address-bar/address-bar';
import { TabStripWidget } from './tab-strip-widget';

export interface PageShortcut {
    /** The row id chrome pushes; `[A-Za-z0-9]{1,32}`. */
    id: string;
    key?: string;
    keycode?: string;
    modifiers: string;
    /** Display text for tooltips (non-Mac). */
    label: string;
    macLabel: string;
}

export const PAGE_SHORTCUTS: readonly PageShortcut[] = [
    { id: 'stop', keycode: 'VK_ESCAPE', modifiers: '', label: 'Esc', macLabel: '⎋' },
    { id: 'newTab', key: 'T', modifiers: 'accel', label: 'Ctrl+T', macLabel: '⌘T' },
    { id: 'closeTab', key: 'W', modifiers: 'accel', label: 'Ctrl+W', macLabel: '⌘W' },
    { id: 'reload', key: 'R', modifiers: 'accel', label: 'Ctrl+R', macLabel: '⌘R' },
    { id: 'reloadF5', keycode: 'VK_F5', modifiers: '', label: 'F5', macLabel: 'F5' },
    { id: 'hardReload', key: 'R', modifiers: 'accel,shift', label: 'Ctrl+Shift+R', macLabel: '⇧⌘R' },
    { id: 'hardReloadF5', keycode: 'VK_F5', modifiers: 'accel', label: 'Ctrl+F5', macLabel: '⌘F5' },
    { id: 'back', keycode: 'VK_LEFT', modifiers: 'alt', label: 'Alt+Left Arrow', macLabel: '⌥←' },
    { id: 'forward', keycode: 'VK_RIGHT', modifiers: 'alt', label: 'Alt+Right Arrow', macLabel: '⌥→' },
    { id: 'home', keycode: 'VK_HOME', modifiers: 'alt', label: 'Alt+Home', macLabel: '⌥↖' },
    { id: 'focusAddress', key: 'D', modifiers: 'alt', label: 'Alt+D', macLabel: '⌥D' },
    { id: 'focusAddressL', key: 'L', modifiers: 'accel', label: 'Ctrl+L', macLabel: '⌘L' },
    { id: 'nextTab', keycode: 'VK_TAB', modifiers: 'accel', label: 'Ctrl+Tab', macLabel: '⌘⇥' },
    { id: 'prevTab', keycode: 'VK_TAB', modifiers: 'accel,shift', label: 'Ctrl+Shift+Tab', macLabel: '⇧⌘⇥' },
    { id: 'nextTabPage', keycode: 'VK_PAGE_DOWN', modifiers: 'accel', label: 'Ctrl+Page Down', macLabel: '⌘⇟' },
    { id: 'prevTabPage', keycode: 'VK_PAGE_UP', modifiers: 'accel', label: 'Ctrl+Page Up', macLabel: '⌘⇞' },
    { id: 'selectTab1', key: '1', modifiers: 'alt', label: 'Alt+1', macLabel: '⌥1' },
    { id: 'selectTab2', key: '2', modifiers: 'alt', label: 'Alt+2', macLabel: '⌥2' },
    { id: 'selectTab3', key: '3', modifiers: 'alt', label: 'Alt+3', macLabel: '⌥3' },
    { id: 'selectTab4', key: '4', modifiers: 'alt', label: 'Alt+4', macLabel: '⌥4' },
    { id: 'selectTab5', key: '5', modifiers: 'alt', label: 'Alt+5', macLabel: '⌥5' },
    { id: 'selectTab6', key: '6', modifiers: 'alt', label: 'Alt+6', macLabel: '⌥6' },
    { id: 'selectTab7', key: '7', modifiers: 'alt', label: 'Alt+7', macLabel: '⌥7' },
    { id: 'selectTab8', key: '8', modifiers: 'alt', label: 'Alt+8', macLabel: '⌥8' },
    { id: 'selectLastTab', key: '9', modifiers: 'alt', label: 'Alt+9', macLabel: '⌥9' },
    { id: 'focusAddressF6', keycode: 'VK_F6', modifiers: '', label: 'F6', macLabel: 'F6' },
    { id: 'focusAddressShiftF6', keycode: 'VK_F6', modifiers: 'shift', label: 'Shift+F6', macLabel: '⇧F6' },
    // Phase 32 plan 02 (PAGE-01, PAGE-02, PAGE-05): page-focus only. Ids are camelCase: the chrome side
    // refuses any relay id outside [A-Za-z0-9]{1,32} (PowerBrowserAPI relayShortcut).
    { id: 'findOpen', key: 'F', modifiers: 'accel', label: 'Ctrl+F', macLabel: '⌘F' },
    { id: 'findNext', keycode: 'VK_F3', modifiers: '', label: 'F3', macLabel: 'F3' },
    { id: 'findPrevious', keycode: 'VK_F3', modifiers: 'shift', label: 'Shift+F3', macLabel: '⇧F3' },
    { id: 'zoomIn', key: '=', modifiers: 'accel', label: 'Ctrl+=', macLabel: '⌘=' },
    { id: 'zoomInPlus', key: '+', modifiers: 'accel', label: 'Ctrl++', macLabel: '⌘+' },
    { id: 'zoomOut', key: '-', modifiers: 'accel', label: 'Ctrl+-', macLabel: '⌘-' },
    { id: 'zoomReset', key: '0', modifiers: 'accel', label: 'Ctrl+0', macLabel: '⌘0' },
    { id: 'muteToggle', key: 'M', modifiers: 'accel', label: 'Ctrl+M', macLabel: '⌘M' },
    { id: 'printOpen', key: 'P', modifiers: 'accel', label: 'Ctrl+P', macLabel: '⌘P' },
    { id: 'saveOpen', key: 'S', modifiers: 'accel', label: 'Ctrl+S', macLabel: '⌘S' },
    // Phase 32 plan 08 (PAGE-10): view source in the same tab; chrome mints the source load, Theia never holds its URL.
    { id: 'viewSource', key: 'U', modifiers: 'accel', label: 'Ctrl+U', macLabel: '⌘U' },
    // PAGE-10 (32-07 gap closure): F12 opens the stock DevTools toolbox window for the focused page.
    { id: 'devtoolsOpen', keycode: 'VK_F12', modifiers: '', label: 'F12', macLabel: 'F12' },
    // Phase 33 plan 02 (BMK-01, D-15): Ctrl+D with a page focused; the Theia-focused twin is chrome-bar-keybindings.ts.
    { id: 'bookmarkPage', key: 'D', modifiers: 'accel', label: 'Ctrl+D', macLabel: '⌘D' },
];

export type NavButton = 'back' | 'forward' | 'reload' | 'stop' | 'home' | 'newTab';

export interface ButtonShortcut {
    /** The verb-only accessible name, also the tooltip's first word(s). */
    verb: string;
    /** PAGE_SHORTCUTS ids this button's keys are; the first names the tooltip. */
    rows: readonly string[];
    /** The `aria-keyshortcuts` value for those rows. */
    aria: string;
}

/**
 * NAV-05: each nav button's shortcut, named by table row so the tooltip can
 * only show a key the relay binds (never KeybindingRegistry, which would show
 * Theia's binding where the relay handles the Firefox key).
 * verify-shortcut-relay.mjs rule (10) holds rows and aria to the table.
 */
export const BUTTON_SHORTCUTS: Readonly<Record<NavButton, ButtonShortcut>> = Object.freeze({
    back: { verb: 'Back', rows: ['back'], aria: 'Alt+ArrowLeft' },
    forward: { verb: 'Forward', rows: ['forward'], aria: 'Alt+ArrowRight' },
    reload: { verb: 'Reload', rows: ['reload', 'reloadF5'], aria: 'Control+R F5' },
    stop: { verb: 'Stop', rows: ['stop'], aria: 'Escape' },
    home: { verb: 'Home', rows: ['home'], aria: 'Alt+Home' },
    newTab: { verb: 'New Tab', rows: ['newTab'], aria: 'Control+T' },
});

/** "Back (Alt+Left Arrow)": the verb and the first row's label (macOS: its macLabel). */
export function tooltipFor(button: NavButton): string {
    const { verb, rows } = BUTTON_SHORTCUTS[button];
    const row = PAGE_SHORTCUTS.find(r => r.id === rows[0]);
    return row ? `${verb} (${isOSX ? row.macLabel : row.label})` : verb;
}

/** True while a web page (an overlay) has keyboard focus. */
export const PAGE_FOCUS_CONTEXT_KEY = 'powerbrowser.webPageFocused';

@injectable()
export class ChromeBarShortcutRelay implements FrontendApplicationContribution {

    @inject(WebTabChannel)
    protected readonly channel: WebTabChannel;

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    @inject(ContextKeyService)
    protected readonly contextKeys: ContextKeyService;

    @inject(CommandRegistry)
    protected readonly commands: CommandRegistry;

    @inject(AddressBar)
    protected readonly addressBar: AddressBar;

    @inject(TabStripWidget)
    protected readonly strip: TabStripWidget;

    protected pageFocused: ContextKey<boolean> | undefined;

    /**
     * Row id -> action on the tab whose page had focus when the key fired.
     * Only that tab's own navigation, New Tab, closing it, switching tabs and
     * focusing the pill: no palette command and no privileged kind (T-27-19).
     */
    protected readonly actions = new Map<string, (tab: WebTabWidget) => unknown>([
        ['stop', tab => tab.loading && tab.stop()],
        ['newTab', () => this.commands.executeCommand(CHROME_BAR_NEW_TAB_COMMAND_ID)],
        ['closeTab', tab => this.closeTab(tab)],
        ['reload', tab => tab.reload()],
        ['reloadF5', tab => tab.reload()],
        ['hardReload', tab => tab.reload(true)],
        ['hardReloadF5', tab => tab.reload(true)],
        ['back', tab => tab.canGoBack && tab.back()],
        ['forward', tab => tab.canGoForward && tab.forward()],
        ['home', async tab => (await this.addressBar.goHome(tab)) === 'opened' && tab.focusPage()],
        ['focusAddress', () => focusAddressPill()],
        ['focusAddressL', () => focusAddressPill()],
        ['focusAddressF6', () => focusAddressPill()],
        ['focusAddressShiftF6', () => focusAddressPill()],
        ['nextTab', tab => this.step(tab, 1)],
        ['nextTabPage', tab => this.step(tab, 1)],
        ['prevTab', tab => this.step(tab, -1)],
        ['prevTabPage', tab => this.step(tab, -1)],
        ...[1, 2, 3, 4, 5, 6, 7, 8].map((n): [string, (tab: WebTabWidget) => unknown] =>
            [`selectTab${n}`, tab => this.switchTo(this.strip.switchOrder(tab)[n - 1], tab)]),
        ['selectLastTab', tab => {
            const order = this.strip.switchOrder(tab);
            return this.switchTo(order[order.length - 1], tab);
        }],
        // Phase 32 plan 02: each action is a widget method on the pushed tab, never a bare command id (T-32-06b).
        ['findOpen', tab => openFindBarFor(tab)],
        ['findNext', tab => tab.findNext(false)],
        ['findPrevious', tab => tab.findNext(true)],
        ['zoomIn', tab => tab.zoomIn()],
        ['zoomInPlus', tab => tab.zoomIn()],
        ['zoomOut', tab => tab.zoomOut()],
        ['zoomReset', tab => tab.zoomReset()],
        ['muteToggle', tab => tab.setMuted(!tab.audioMuted)],
        ['printOpen', tab => tab.print()],
        // PAGE-08 (32-05): the 32-02 focus stub is upgraded; the Theia save dialog picks the destination, chrome writes the copy.
        ['saveOpen', tab => tab.savePage(chooseSaveDestination)],
        // PAGE-10 (32-08): the widget method, never a kind; the reader toggle has no key (the button and command only).
        ['viewSource', tab => tab.viewSource()],
        ['devtoolsOpen', tab => tab.openDevtools()],
        // BMK-01 (T-27-19): the star's own path, which owns the editor and the write; never the store kind.
        ['bookmarkPage', () => openBookmarkStar()],
    ]);

    /** Pitfall P9: Theia moves activation on close only for a focused widget, so focus the new current one here. */
    protected async closeTab(tab: WebTabWidget): Promise<void> {
        const order = this.strip.switchOrder(tab);
        const at = order.indexOf(tab);
        const fallback = order[at + 1] ?? order[at - 1];
        await this.shell.closeWidget(tab.id);
        // A tab made current only by markAsCurrent gets no activation fallback,
        // and closing the last tab of a split pane leaves no current title.
        const next = this.shell.mainPanel.currentTitle?.owner
            ?? (fallback && !fallback.isDisposed ? fallback : undefined)
            ?? this.shell.mainAreaTabBars.map(bar => bar.currentTitle?.owner).find(owner => owner !== undefined);
        if (next) {
            // Activated first, as a switch does: focusing the page alone lost focus to Theia's own activation.
            await this.switchTo(next, tab);
        }
    }

    /** Next (+1) or previous (-1) in the visible order, wrapping at both ends. */
    protected step(tab: WebTabWidget, delta: number): Promise<void> {
        const order = this.strip.switchOrder(tab);
        const at = order.indexOf(tab);
        return this.switchTo(at < 0 ? undefined : order[(at + delta + order.length) % order.length], tab);
    }

    /** Activates `target` and focuses its page; with no target (Alt+5 of three) focus goes back to `from`'s page. */
    protected async switchTo(target: Widget | undefined, from: WebTabWidget): Promise<void> {
        if (!target) {
            from.focusPage();
            return;
        }
        await this.shell.activateWidget(target.id);
        if (target instanceof WebTabWidget) {
            target.focusPage();
        }
    }

    onStart(): void {
        // BMK-01: the star's tooltip names only the key this table binds (the pill cannot import this module).
        const star = PAGE_SHORTCUTS.find(row => row.id === 'bookmarkPage');
        this.addressBar.starShortcut = star ? (isOSX ? star.macLabel : star.label) : '';
        this.pageFocused = this.contextKeys.createKey<boolean>(PAGE_FOCUS_CONTEXT_KEY, false);
        this.channel.onPush('pageFocus', detail => {
            const tabId = typeof detail.tabId === 'string' ? detail.tabId : null;
            this.pageFocused?.set(tabId !== null);
            const tab = tabId === null ? undefined : this.channel.widgetOf(tabId);
            // Pitfall P8: the bar follows the current title, and a click into a
            // page never gives Theia DOM focus, so make the focused page's tab
            // current without activating (which would steal focus).
            if (tab && this.shell.mainPanel.currentTitle !== tab.title) {
                this.shell.mainPanel.markAsCurrent(tab.title);
            }
        });
        this.channel.onPush('shortcut', detail => {
            const { id, tabId } = detail;
            if (typeof id !== 'string' || typeof tabId !== 'string') {
                return;
            }
            const action = this.actions.get(id);
            // Only the pushed tab, never the current widget as a fallback.
            const tab = this.channel.widgetOf(tabId);
            if (!action || !tab) {
                return;
            }
            const failed = (error: unknown) =>
                console.error('[@powerbrowser/chrome-bar] shortcut failed:', id, error instanceof Error ? error.name : typeof error);
            try {
                Promise.resolve(action(tab)).catch(failed);
            } catch (error) {
                failed(error);
            }
        });
    }
}
