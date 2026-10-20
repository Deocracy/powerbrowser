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
import { ApplicationShell, FrontendApplicationContribution } from '@theia/core/lib/browser';
import { ContextKey, ContextKeyService } from '@theia/core/lib/browser/context-key-service';
import { WebTabChannel, WebTabWidget } from '@powerbrowser/tab-uris/lib/browser/web-tab';

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
];

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

    protected pageFocused: ContextKey<boolean> | undefined;

    /** Row id -> action on the tab whose page had focus when the key fired. */
    protected readonly actions = new Map<string, (tab: WebTabWidget) => unknown>([
        ['stop', tab => tab.loading && tab.stop()],
    ]);

    onStart(): void {
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
            try {
                action(tab);
            } catch (error) {
                console.error('[@powerbrowser/chrome-bar] shortcut failed:', id, error instanceof Error ? error.name : typeof error);
            }
        });
    }
}
