import * as React from '@theia/core/shared/react';
import { createPortal } from '@theia/core/shared/react-dom';
import { injectable, inject, named, postConstruct } from '@theia/core/shared/inversify';
import {
    ApplicationShell,
    CommonCommands,
    ContextMenuRenderer,
    HoverService,
    OpenerService,
    ReactWidget,
    Widget,
} from '@theia/core/lib/browser';
import { CancellationTokenSource, CommandMenu, CommandRegistry, CompoundMenuNode, ContributionProvider, Disposable, MenuPath } from '@theia/core/lib/common';
import URI from '@theia/core/lib/common/uri';
import { PreferenceSchemaService, PreferenceScope, PreferenceService } from '@theia/core/lib/common/preferences';
import { NavigatableWidget } from '@theia/core/lib/browser/navigatable-types';
import { ClipboardService } from '@theia/core/lib/browser/clipboard-service';
import { LabelParser } from '@theia/core/lib/browser/label-parser';
import { isOSX } from '@theia/core/lib/common/os';
import { ContextKeyService } from '@theia/core/lib/browser/context-key-service';
import { ConfirmDialog } from '@theia/core/lib/browser/dialogs';
import pDebounce from 'p-debounce';
import { MessageLoop } from '@theia/core/shared/@lumino/messaging';
import { EMPTY_PAGE_URL, WebTabChannel, WebTabOpenHandler, WebTabShieldReply, WebTabSiteInfo, WebTabWidget } from '@powerbrowser/tab-uris/lib/browser/web-tab';
import { GroupModel } from '@powerbrowser/modes/lib/browser/group-model';
import { TabUriRegistry } from '@powerbrowser/tab-uris/lib/browser/tab-uri-registry';
import { BookmarkEntry, ChromeStoreClient, ResolvedAddress, SearchEngineList } from '@powerbrowser/tab-uris/lib/browser/chrome-store-client';
import { CHROME_BAR_INPUT_CLASS, CHROME_BAR_NEW_TAB_COMMAND_ID, bookmarkablePageUrl, currentWebTab, focusAddressPill, setAddressFocus, setOpenBookmarkStar } from '../chrome-bar-commands';
import { ChromeBarSuggestionService } from '../chrome-bar-suggestion-service';
import type { SourcedRow } from '../chrome-bar-places-suggestions';
import {
    LINK_DRAG_TYPES, PLACE_ROW_LIMIT, Row, autofillSplice, classifyAddress, composeRows, droppedTextOf, iconFor, isCanonizable, nextHighlight, safeIcon,
} from './address-bar-rows';
import { LOCAL_MODES, MODE_SENDS, ModeId, cycleOrder, defaultModeFor, engineModeId, engineNameOf, modeKindOf, nextMode, tokenise } from './address-bar-mode-table';
import { AddressBarMode, AddressBarModeContribution } from './address-bar-modes';
// Type only: command-centre.ts imports the shortcut table, which imports this file.
import type { CommandCentreAddressBarMode } from './command-centre';
import { CHROME_BAR_COPY, appSubject } from '../chrome-bar-copy';
import { SECURITY_STATES } from '../site-identity/site-identity-table';
import { PERMISSION_GLYPH_CLASS, SitePanel } from '../site-identity/site-panel';
import {
    DEFAULT_SEARCH_ENGINE_PREFERENCE, DEFAULT_SEARCH_ENGINE_PROPERTY, HOME_PAGE_PREFERENCE, SEARCH_SUGGESTIONS_PREFERENCE,
} from '../chrome-bar-preferences';
import { ADDRESS_FOCUSED_CONTEXT_KEY } from '../chrome-bar-keybindings';
import { TabStripWidget } from '../tab-strip-widget';
/** BAR-10: the pill's Cut/Copy/Paste menu, built per request like the history menu, never registered. */
const PILL_MENU_PATH: MenuPath = ['powerbrowser-chrome-bar-pill'];

export type DropTargetDragEvent = React.DragEvent<HTMLElement>;

/** BAR-11: the heuristic row's key; the one row present for every non-empty text. */
const HEURISTIC_KEY = 'heuristic';

/** BAR-05: a one-off engine button's highlight key prefix, after the row keys. */
const ONE_OFF_KEY = 'oneoff:';

/** BAR-11: the dropdown's tallest size (29-UI-SPEC Spacing Scale); a short window caps it at its bottom less 8px. */
export const DROPDOWN_MAX_HEIGHT = 432;

/** SMODE-01: the trailing "Search with {engine}" row's key in Bookmarks, Tabs and History. */
const SEARCH_ROW_KEY = 'search-row';
const GOTO_ROW_KEY = 'goto-row';

/** SMODE-01: a local mode's strings: placeholder and aria-label, the empty and no-match rows, a failed read, the footer. */
interface LocalModeCopy {
    label: string;
    empty: (engine: string) => string;
    noMatch: string;
    failed?: (subject: string) => string;
    /** Absent: the mode's contribution supplies its footer (Command centre derives its address key). */
    footer?: string;
}

/** SMODE-01: the strings of each local mode that lists its own rows (30-UI-SPEC "Strings"). */
const LOCAL_MODE_COPY: { [mode: string]: LocalModeCopy } = {
    bookmarks: {
        label: CHROME_BAR_COPY.searchBookmarks, empty: CHROME_BAR_COPY.noBookmarks, noMatch: CHROME_BAR_COPY.noMatchingBookmarks,
        failed: CHROME_BAR_COPY.bookmarksFailed, footer: CHROME_BAR_COPY.dropdownFooter,
    },
    history: {
        label: CHROME_BAR_COPY.searchHistory, empty: CHROME_BAR_COPY.noHistory, noMatch: CHROME_BAR_COPY.noMatchingHistory,
        failed: CHROME_BAR_COPY.historyFailed, footer: CHROME_BAR_COPY.dropdownFooter,
    },
    actions: {
        // Never empty in this phase (D-11): the Browser commands always include New Tab.
        label: CHROME_BAR_COPY.searchActions, empty: () => CHROME_BAR_COPY.noMatchingActions,
        noMatch: CHROME_BAR_COPY.noMatchingActions, footer: CHROME_BAR_COPY.actionsFooter,
    },
    tabs: {
        label: CHROME_BAR_COPY.searchTabs, empty: CHROME_BAR_COPY.noOtherTabs,
        noMatch: CHROME_BAR_COPY.noMatchingTabs, footer: CHROME_BAR_COPY.tabsFooter,
    },
    // SMODE-05: the label is the input's aria-label; the placeholder is the provider's own (D-25).
    'command-centre': {
        label: CHROME_BAR_COPY.modeLabels['command-centre'], empty: () => CHROME_BAR_COPY.noRecentFiles,
        noMatch: CHROME_BAR_COPY.noMatchingResults, failed: CHROME_BAR_COPY.commandCentreFailed,
    },
};

/** SMODE-01: the Search Settings item's key in the modes menu; every other item's key is its mode id. */
const SEARCH_SETTINGS_KEY = 'search-settings';

/** SMODE-01: one modes-menu item: a mode (an engine's carries its name), or Search Settings (no mode). */
interface ModeMenuItem {
    key: string;
    label: string;
    icon: React.ReactNode;
    mode?: ModeId;
    engine?: string;
}

/** The dropped http(s) URL, else undefined. */
export function droppedUrlOf(data: DataTransfer): string | undefined {
    const value = droppedTextOf(data);
    return /^https?:\/\//i.test(value) ? value : undefined;
}

/**
 * How New Tab treats a drag while it is over the button. A real drag hides
 * its data until drop (Pitfall P10), so a link type alone shows the ring;
 * link data that is readable and not http(s) is refused now. Plain text
 * cannot be told apart from a URL until drop, so it gets no ring.
 */
function dropKindOf(data: DataTransfer): 'link' | 'text' | 'none' {
    const types = Array.from(data.types);
    if (LINK_DRAG_TYPES.some(type => types.includes(type))) {
        const readable = LINK_DRAG_TYPES.some(type => data.getData(type));
        return !readable || droppedUrlOf(data) ? 'link' : 'none';
    }
    return types.includes('text/plain') ? 'text' : 'none';
}

/**
 * The address pill (30-01, D-04): its state, query, commit, keys, result
 * dropdown, one-offs, drafts, paste menu, drop handlers and the Home path,
 * moved verbatim out of ChromeBarWidget. A plain injectable, not a widget:
 * the bar widget attaches itself as the host, renders this in the pill slot
 * between Home and New Tab, and keeps the nav buttons, the mode toggle and
 * the layout. The class name is the live probes' lookup name; keep it.
 *
 * Threat notes carried from the widget (13-03, Phase 29): suggestion titles
 * and captions render as React text nodes only, never markup; typed text
 * resolves chrome-side through resolveTypedAddress, with empty as a no-op;
 * the privileged store kinds (removeHistoryEntry, readClipboardText, and
 * Phase 33's bookmark writes) run only from this file's event handlers.
 */
@injectable()
export class AddressBar {

    @inject(CommandRegistry)
    protected readonly commands: CommandRegistry;

    @inject(OpenerService)
    protected readonly openerService: OpenerService;

    @inject(ChromeBarSuggestionService)
    protected readonly suggestions: ChromeBarSuggestionService;

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    /** GUI-02: the widget -> URI direction, for the pill's address on non-web tabs (UI-SPEC A6). */
    @inject(TabUriRegistry)
    protected readonly tabUris: TabUriRegistry;

    /** NAV-03: renders the Back/Forward session-history menu as a stock `.lm-Menu`. */
    @inject(ContextMenuRenderer)
    protected readonly menus: ContextMenuRenderer;

    /** NAV-06: middle-click and Ctrl+click open a background tab; a dropped link a foreground one. */
    @inject(WebTabOpenHandler)
    protected readonly webTabOpener: WebTabOpenHandler;

    /** PAN-03: a tab the bar opens joins the active group, as New Tab's does. */
    @inject(GroupModel)
    protected readonly groups: GroupModel;

    /** NAV-04: the Home settings (chrome-bar-preferences.ts). */
    @inject(PreferenceService)
    protected readonly preferences: PreferenceService;

    /** NAV-05: nav-button tooltips (native title tooltips are dead in the shell until Phase 35). */
    @inject(HoverService)
    protected readonly hover: HoverService;

    @inject(ContextKeyService)
    protected readonly contextKeys: ContextKeyService;

    /** Phase 29 (BAR-01): typed text and the home page resolve chrome-side. */
    @inject(ChromeStoreClient)
    protected readonly store: ChromeStoreClient;

    /** Phase 29 (BAR-04): the Default Search Engine setting's options come from chrome's engine list. */
    @inject(PreferenceSchemaService)
    protected readonly preferenceSchema: PreferenceSchemaService;

    /** Phase 29 (BAR-10): Cut and Copy write through it; nothing here reads it (Paste reads chrome-side). */
    @inject(ClipboardService)
    protected readonly clipboard: ClipboardService;

    /** Phase 30 (SMODE-05): a pick's label renders its $(icon) parts as codicons, its text as text nodes (T-30-03). */
    @inject(LabelParser)
    protected readonly labelParser: LabelParser;

    /** Phase 33 (BMK-01): chrome's Places bookmark push; the star re-reads on it. */
    @inject(WebTabChannel)
    protected readonly webTabs: WebTabChannel;

    /** Phase 29 (BAR-04): chrome's engine list; undefined until it arrives or when it failed. */
    protected engineList: SearchEngineList | undefined;

    /** Phase 30 (D-06): the contributed modes, read lazily and never at construction (D-50). */
    @inject(ContributionProvider) @named(AddressBarModeContribution)
    protected readonly modeProvider: ContributionProvider<AddressBarMode>;

    /** Phase 30 (SMODE-03): the active mode; a picked mode returns to the default after a commit, Esc, a tab change or a PowerBrowser-mode change (D-15). */
    protected mode: ModeId = 'address';
    /** The PowerBrowser mode id the bar last reported; the default mode is that mode's row in the D-03 table. */
    protected uiMode = '';
    /** Phase 30 (SMODE-01): a local mode's list request, cancelled by the next keystroke or a close. */
    protected localQuery: CancellationTokenSource | undefined;
    /** Phase 30 (SMODE-01): the local list's empty, no-match or failure row, above any rows. */
    protected localMessage: string | undefined;
    /** Phase 30 (SMODE-01): the modes menu is open; the element that opened it keeps focus and drives it. */
    protected modesOpen = false;
    /** The highlighted modes-menu item, by key. */
    protected modesHighlight: string | undefined;

    /** The bar widget this renders into; its update() repaints the pill. */
    protected host: ReactWidget | undefined;

    /** Called once by the host widget at construction. */
    attach(host: ReactWidget): void {
        this.host = host;
        setAddressFocus(() => this.focusAddress());
        setOpenBookmarkStar(() => void this.openBookmarkStar());
    }

    /**
     * D-28 (SMODE-06): every address key and New Tab -- the pill in Address
     * mode, focused, its whole text selected (the current address unless text
     * was typed). An instance method, so a live plant can keep the mode.
     */
    focusAddress(): void {
        this.closeModesMenu();
        this.closeDropdown();
        this.mode = 'address';
        this.renderNow();
        const input = this.pillRef?.querySelector('input');
        if (input) {
            input.focus();
            input.select();
        }
    }

    /** The moved code's repaint: the host widget's update(). */
    protected update(): void {
        this.host?.update();
    }

    /**
     * Phase 31 (SITE-01, D-31-01/D-31-09): this pill's identity, from the
     * current web tab's last pushed state only -- never from pill text, so
     * typing cannot spoof it. A non-web widget (an editor) has no identity.
     */
    protected identityState(): { state: string; displaySpec: string; baseDomain: string | null; permissionIcons: string[]; permissionLabels: string[]; shieldExcepted: boolean } | undefined {
        const tab = this.shell.currentWidget instanceof WebTabWidget ? this.shell.currentWidget : currentWebTab();
        if (!(tab instanceof WebTabWidget) || !tab.hasPage) {
            return undefined;
        }
        // Read through the pushed-state fields; `in` keeps this compiling
        // against the published tab-uris lib until the next Theia build.
        const pushed = tab as WebTabWidget & { securityState?: unknown; displaySpec?: unknown; baseDomain?: unknown; permissionIcons?: unknown; permissionLabels?: unknown; shieldExcepted?: unknown };
        const raw = typeof pushed.securityState === 'string' ? pushed.securityState : 'none';
        const state = (SECURITY_STATES as readonly string[]).includes(raw) ? raw : 'none';
        const displaySpec = typeof pushed.displaySpec === 'string' ? pushed.displaySpec : '';
        const baseDomain = typeof pushed.baseDomain === 'string' ? pushed.baseDomain : null;
        const permissionIcons = Array.isArray(pushed.permissionIcons) ? pushed.permissionIcons.filter((id): id is string => typeof id === 'string') : [];
        const permissionLabels = Array.isArray(pushed.permissionLabels) ? pushed.permissionLabels.filter((label): label is string => typeof label === 'string') : [];
        const shieldExcepted = pushed.shieldExcepted === true;
        return { state, displaySpec, baseDomain, permissionIcons, permissionLabels, shieldExcepted };
    }

    /**
     * Phase 31 (SITE-03, D-31-10): the host line for the identity box, from
     * Chrome's `displaySpec` (Unicode for a secure IDN host, punycode
     * otherwise). The `https://` trim is the pill input's (`pillText`), not
     * this line. Chrome's displaySpec is nsIURI.host: no port, and no brackets
     * for an IPv6 literal (nsStandardURL.h:604-618), so it is used as it is
     * (WR-02: stripping a `:digits` suffix turned `::1` into `:`). The fallback
     * reads the committed address, where a port can appear; it is stripped there,
     * and the brackets of an IPv6 literal are removed so both paths agree.
     */
    protected identityHostText(identity: { state: string; displaySpec: string; baseDomain: string | null }): string {
        if (identity.displaySpec) {
            return identity.displaySpec;
        }
        const authority = this.committedAddress.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').split('/')[0];
        const parts = /^(\[[^\]]+\]|[^:]+)(?::\d+)?$/.exec(authority);
        return parts ? parts[1].replace(/^\[|\]$/g, '') : authority;
    }
    protected identityHost(identity: { state: string; displaySpec: string; baseDomain: string | null }): React.ReactNode {
        const host = this.identityHostText(identity);
        const base = identity.baseDomain;
        if (base && host.length > base.length && host.toLowerCase().endsWith(base.toLowerCase()) && host[host.length - base.length - 1] === '.') {
            const at = host.length - base.length;
            return <>{host.slice(0, at)}<strong>{host.slice(at)}</strong></>;
        }
        return <>{host}</>;
    }

    /**
     * Phase 31 (SITE-01..03, D-31-09/D-31-10/D-31-14): the identity box, the
     * pill's first child, from pushed state only. `secure` is the lock;
     * `insecure` the crossed lock + `Not Secure`; `mixed-passive`/`broken`
     * the warning; `local` the host with no icon; `none`/non-web renders
     * nothing. Click opens the panel shell (plan 02). No typed-text input is
     * read anywhere here: the plan's static case asserts that no scheme test
     * on the typed text survives in this file, so a restored text-derived
     * lock would have to re-add one to go red.
     */
    protected renderIdentityBox(): React.ReactNode {
        const identity = this.identityState();
        if (!identity || identity.state === 'none') {
            return undefined;
        }
        const tip = identity.state === 'secure' ? CHROME_BAR_COPY.connectionSecure
            : identity.state === 'insecure' ? CHROME_BAR_COPY.connectionInsecure
                : identity.state === 'local' ? CHROME_BAR_COPY.connectionLocal
                    : CHROME_BAR_COPY.connectionWarning;
        const host = this.identityHost(identity);
        // UI-SPEC "Identity box": the box's aria-label is the panel's open copy plus the host.
        const label = CHROME_BAR_COPY.sitePanelOpen(this.identityHostText(identity));
        if (identity.state === 'local') {
            return <button
                type='button'
                className='pb-identity'
                aria-label={label}
                onMouseDown={e => e.preventDefault()}
                onClick={e => this.openSitePanel(e.currentTarget)}
            >
                {this.renderPermissionIcons(identity)}
                {this.renderShieldIcon(identity)}
                <span className='pb-identity-host'>{host}</span>
            </button>;
        }
        const icon = identity.state === 'secure' ? 'codicon-lock'
            : identity.state === 'insecure' ? 'codicon-unlock' : 'codicon-warning';
        const warning = identity.state === 'mixed-passive' || identity.state === 'broken';
        return <button
            type='button'
            className='pb-identity'
            aria-label={label}
            onPointerEnter={e => this.hover.requestHover({
                content: tip,
                target: e.currentTarget,
                position: 'bottom',
                cssClasses: ['pb-chrome-bar-hover'],
            })}
            onMouseDown={e => e.preventDefault()}
            onClick={e => this.openSitePanel(e.currentTarget)}
        >
            <span className={`pb-identity-icon codicon ${icon}${warning ? ' is-warning' : ''}`} aria-hidden='true' />
            {identity.state === 'insecure' && <span className='pb-identity-insecure'>{CHROME_BAR_COPY.connectionInsecure}</span>}
            {this.renderPermissionIcons(identity)}
            {this.renderShieldIcon(identity)}
            <span className='pb-identity-host'>{host}</span>
        </button>;
    }

    /**
     * Phase 31 plan 03 (SITE-08, UI-SPEC identity box): the shield for a site
     * with a non-default tracking-protection exception, in warning ink. A site
     * on the default protection shows no shield. Rendered from pushed state
     * (and the shield reply's refresh), never from a stored copy.
     */
    protected renderShieldIcon(identity: { shieldExcepted: boolean }): React.ReactNode {
        if (!identity.shieldExcepted) {
            return undefined;
        }
        return <span
            className='pb-identity-shield codicon codicon-shield'
            aria-hidden='true'
            onPointerEnter={e => this.hover.requestHover({
                content: CHROME_BAR_COPY.shieldExcepted,
                target: e.currentTarget,
                position: 'bottom',
                cssClasses: ['pb-chrome-bar-hover'],
            })}
        />;
    }

    /**
     * Phase 31 plan 02 (SITE-06, UI-SPEC identity box): up to three 12px icons
     * for the non-default permissions, then `+n`. The tooltip lists every
     * non-default permission by chrome's label. Rendered from pushed state
     * (and the permission reply's refresh), never from a stored copy.
     */
    protected renderPermissionIcons(identity: { permissionIcons: string[]; permissionLabels: string[] }): React.ReactNode {
        const icons = identity.permissionIcons;
        if (icons.length === 0) {
            return undefined;
        }
        const shown = icons.slice(0, 3);
        const overflow = icons.length > shown.length ? CHROME_BAR_COPY.permissionOverflow(icons.length - shown.length) : undefined;
        const tip = CHROME_BAR_COPY.permissionIconsTip(identity.permissionLabels.filter(label => label).join(', '));
        return <span
            className='pb-identity-perms'
            onPointerEnter={e => this.hover.requestHover({
                content: tip,
                target: e.currentTarget,
                position: 'bottom',
                cssClasses: ['pb-chrome-bar-hover'],
            })}
        >
            {shown.map(id => <span key={id} className={`pb-identity-perm codicon ${PERMISSION_GLYPH_CLASS[id] ?? ''}`} aria-hidden='true' />)}
            {overflow !== undefined && <span className='pb-identity-overflow'>{overflow}</span>}
        </span>;
    }

    /**
     * Phase 31 (SITE-01/02, plan 02): the panel opener. Requests this tab's
     * site information from the click handler only, anchors the panel under
     * the identity box that was clicked, and shows the panel when chrome
     * answered `done` with its rows. Any other reply (unknown-tab, refused,
     * no answer) opens the panel with the unavailable copy.
     */
    protected async openSitePanel(anchor?: HTMLElement): Promise<void> {
        const tab = this.shell.currentWidget instanceof WebTabWidget ? this.shell.currentWidget : currentWebTab();
        const rect = (anchor ?? this.pillRef)?.getBoundingClientRect();
        this.sitePanelAnchor = { top: Math.round((rect?.bottom ?? 0) + 4), left: Math.round(rect?.left ?? 0) };
        let info: WebTabSiteInfo | null = null;
        if (tab instanceof WebTabWidget) {
            try {
                info = await tab.siteInfo();
            } catch {
                info = null;
            }
        }
        this.sitePanelTab = tab instanceof WebTabWidget ? tab : null;
        this.sitePanelInfo = info && info.ok === true && info.where === 'done' && Array.isArray(info.permissions) && typeof info.origin === 'string' ? info : null;
        this.sitePanelOpen = true;
        this.update();
    }

    /** Phase 31 (SITE-01/02): the panel's last `webTabSiteInfo` reply, or null when the panel shows the unavailable copy. */
    protected sitePanelInfo: WebTabSiteInfo | null = null;

    /**
     * Phase 31 (plan 02, Firefox parity): the state the user last chose per row in the open panel.
     * An autoplay-media "block-audible" equal to the shipped default is never saved
     * (SitePermissions.sys.mjs:575-580), so the next click must come from the choice, not the read-back.
     */

    /** Phase 31 (SITE-04, plan 02): the tab the open panel describes; its permission writes go to this tab only. */
    protected sitePanelTab: WebTabWidget | null = null;

    /** Phase 31 (plan 02): the panel's top-left corner in viewport pixels, under the identity box. */
    protected sitePanelAnchor: { top: number; left: number } = { top: 0, left: 0 };

    /** Phase 31 (SITE-01): whether the panel shows. */
    protected sitePanelOpen = false;

    /** Phase 31 (SITE-02): closes the panel.  */
    protected closeSitePanel = (): void => {
        if (this.sitePanelOpen) {
            this.sitePanelOpen = false;
            this.sitePanelInfo = null;
            this.sitePanelTab = null;
                this.sitePanelNotice = null;
            this.update();
        }
    };

    /** Phase 31 plan 03: a one-line failure notice shown at the top of the reopened panel; cleared on close. */
    protected sitePanelNotice: string | null = null;

    /**
     * Phase 31 plan 03 (SITE-07, D-31-12): the panel's clear-data row. The
     * panel closes first (its blur handler would close it under the dialog),
     * the confirm is a ConfirmDialog (never the window-modal site-data prompt),
     * and only its accept handler sends the clear, for the origin the panel
     * displayed. A refused or failed clear reopens the panel with the notice.
     */
    protected async clearSiteDataFromPanel(): Promise<void> {
        const tab = this.sitePanelTab;
        const origin = this.sitePanelInfo?.origin;
        const host = this.identityHostText({ state: 'none', displaySpec: this.sitePanelInfo?.displaySpec ?? '', baseDomain: null });
        // CR-03: the scope of the clear is the registrable domain (browser-siteIdentity.js:473-475); the dialog names it.
        const site = this.sitePanelInfo?.baseDomain || host;
        this.closeSitePanel();
        if (!(tab instanceof WebTabWidget) || typeof origin !== 'string') {
            return;
        }
        let confirmed: boolean | undefined = false;
        try {
            const dialog = new ConfirmDialog({
                title: CHROME_BAR_COPY.clearDataTitle(site),
                msg: `${CHROME_BAR_COPY.clearDataScope(site)} ${CHROME_BAR_COPY.clearDataClosedTabs(site)} ${CHROME_BAR_COPY.clearDataStaysSignedIn(appSubject())}`,
                ok: CHROME_BAR_COPY.clearDataConfirm,
                cancel: CHROME_BAR_COPY.clearDataCancel,
            });
            confirmed = await dialog.open();
        } catch {
            return;
        }
        if (!confirmed) {
            return;
        }
        let reply: { ok?: boolean; where?: string } | null = null;
        try {
            reply = await tab.clearSiteData(origin);
        } catch {
            reply = null;
        }
        if (reply && reply.ok === true && reply.where === 'cleared') {
            return;
        }
        this.sitePanelNotice = CHROME_BAR_COPY.clearDataFailed(appSubject());
        await this.openSitePanel();
    }

    /**
     * Phase 31 (SITE-04/06, plan 02, D-31-05/D-31-06): one permission row's
     * change, sent to the panel's tab. Chrome's reply carries the refreshed
     * rows, which replace the panel's; a refused or failed write takes the
     * panel to the unavailable copy instead of showing a state chrome did not confirm.
     */
    protected async setSitePermission(id: string, state: string): Promise<void> {
        const tab = this.sitePanelTab;
        const origin = this.sitePanelInfo?.origin;
        let reply: WebTabSiteInfo | null = null;
        if (tab && typeof origin === 'string') {
            try {
                reply = await tab.setPermission(id, state, origin);
            } catch {
                reply = null;
            }
        }
        if (reply && reply.ok === true && reply.where === 'applied' && Array.isArray(reply.permissions) && this.sitePanelInfo) {
            this.sitePanelInfo = { ...this.sitePanelInfo, permissions: reply.permissions };
        } else {
            this.sitePanelInfo = null;
        }
        this.update();
    }

    /**
     * Phase 31 plan 03 (SITE-08, D-31-06): the shield row's change, sent to the
     * panel's tab only. The identity box's shield follows the reply (the tab's
     * refresh); an applied change closes the panel, since the tab reloads. A
     * refused or failed change takes the panel to the unavailable copy, as a
     * refused permission write does.
     */
    protected async setSiteShield(except: boolean): Promise<void> {
        const tab = this.sitePanelTab;
        const origin = this.sitePanelInfo?.origin;
        let reply: WebTabShieldReply | null = null;
        if (tab && typeof origin === 'string') {
            try {
                reply = await tab.shieldToggle(origin, except);
            } catch {
                reply = null;
            }
        }
        // Applied: the tab reloads, so the panel closes as upstream's does (browser-siteProtections.js:2754-2757);
        // the next open reads the count from the reloaded page. Refused: the panel shows the unavailable copy.
        if (reply && reply.ok === true && reply.where === 'applied' && typeof reply.excepted === 'boolean') {
            this.closeSitePanel();
            return;
        }
        this.sitePanelInfo = null;
        this.update();
    }

    protected inputValue = '';
    protected committedAddress = '';
    /** Phase 31 (SITE-03): whether the pill input holds focus; see `pillText`. */
    protected pillFocused = false;
    /** BAR-11: the rows on screen, composed by address-bar-rows from the parts below. */
    protected rows: Row[] = [];
    protected dropdownOpen = false;
    /** BAR-11: the highlighted row, tracked by key so rows arriving late never move it. */
    protected highlightKey: string | undefined = undefined;
    /** BAR-11: the first row for the typed text; null until chrome's resolve arrives. */
    protected heuristic: Row | null = null;
    /** BAR-11: chrome found no engine for the typed words; the heuristic row is the no-search row. */
    protected heuristicNoEngine = false;
    /** BAR-03: the engine's suggestions for search-shaped text; empty for an address, a failure or the setting off. */
    protected engineRows: Row[] = [];
    /** BAR-03: an IME composition is open in the pill; nothing typed during one is sent to an engine. */
    protected compositionOpen = false;
    /** BAR-11: the pill already had focus when the current press began; only a focusing press selects all. */
    protected focusedAtPress = false;
    /** BAR-12: typed, unsubmitted text of the tabs not on screen, in memory only; never stored, pushed or logged. */
    protected readonly drafts = new WeakMap<Widget, string>();
    /** BAR-12: the widget whose address the pill currently shows; its own text lives in inputValue, not in drafts. */
    protected draftOwner: Widget | undefined;
    /** BAR-07: the pill's autofilled value and the origin it opens; cleared by any input, a commit or a close. */
    protected autofill: { value: string; url: string } | undefined;
    /** BAR-07: Backspace or Delete removed a completion; nothing autofills until the next inserting keystroke. */
    protected autofillSuppressed = false;
    /** BAR-07: the last input event may autofill; read by the debounced query it schedules. */
    protected autofillWanted = false;
    /** BAR-11: open-tab, bookmark and history rows for the typed text. */
    protected placeRows: Row[] = [];
    /** BAR-09: the row whose Shift+Delete removal failed; its failure notice shows under it until the next query. */
    protected removeFailedKey: string | undefined;
    /** BAR-11: cached favicons by page url, from chrome's Places cache only. */
    protected icons: Record<string, string> = {};
    /** The heuristic row could not be computed: the first row is the suggestions-failure row. */
    protected providerFailed = false;
    protected commitFailed = false;
    /** What Enter on the commit-failure row repeats; undefined: commit the pill text again. */
    protected retry: (() => Promise<void>) | undefined;
    /** BAR-10: Paste or Paste & Go could not read the clipboard; one failure row shows until the next edit or close. */
    protected pasteFailed = false;
    /** Phase 29 (BAR-01): chrome found no engine for typed words; Enter retries, typing or closing clears it. */
    protected noSearch = false;
    /** NAV-04: the Home-failure row is showing; Enter or a click opens Settings on the home-page setting. */
    protected homeFailed = false;
    protected shimmer = false;
    protected querySeq = 0;
    /** True from a keystroke until the dropdown is closed on user intent; a debounced query fires only while armed. */
    protected dropdownArmed = false;
    protected pillRef: HTMLDivElement | null = null;
    /** The pill input's element-local context key; see ADDRESS_FOCUSED_CONTEXT_KEY. */
    protected addressScope: Disposable | undefined;

    /** Stable, so React calls it only on mount and unmount, not on every render. */
    protected inputRef = (el: HTMLInputElement | null): void => {
        this.addressScope?.dispose();
        this.addressScope = undefined;
        if (el) {
            const scope = this.contextKeys.createScoped(el);
            scope.createKey(ADDRESS_FOCUSED_CONTEXT_KEY, true);
            this.addressScope = scope;
        }
    };

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

    /** Phase 30 (D-26): a mode that sends nothing while typing lists its own rows on the same debounce. */
    protected readonly debouncedLocalQuery = pDebounce(() => {
        const local = this.localMode();
        return local ? this.runLocalQuery(local) : Promise.resolve();
    }, 150);

    @postConstruct()
    protected init(): void {
        // Lives as long as the app, as the singleton widget did.
        this.preferences.onPreferenceChanged(change => {
            if (change.preferenceName === DEFAULT_SEARCH_ENGINE_PREFERENCE) {
                void this.refreshEngines();
            }
        });
        void this.refreshEngines();
        // BMK-01: a bookmark added, removed or moved anywhere re-reads the star for the page on screen.
        this.webTabs.onDidChangeBookmarks(() => this.refreshStar(true));
    }

    /**
     * BAR-04: re-reads chrome's engines and fills the setting's options; the
     * empty option is labelled with the configured default's name.
     */
    protected async refreshEngines(): Promise<void> {
        try {
            this.engineList = await this.store.listSearchEngines();
        } catch (error) {
            this.engineList = undefined;
            console.error('[@powerbrowser/chrome-bar] reading the search engines failed:', error instanceof Error ? error.name : typeof error);
        }
        if (this.engineList) {
            const names = this.engineList.engines.map(engine => engine.name);
            this.preferenceSchema.updateSchemaProperty(DEFAULT_SEARCH_ENGINE_PREFERENCE, {
                ...DEFAULT_SEARCH_ENGINE_PROPERTY,
                enum: ['', ...names],
                enumItemLabels: [this.engineList.defaultName, ...names],
            });
        }
        this.update();
    }

    /** Phase 30: the contributed modes of a menu group, in LOCAL_MODES order; a contribution outside the table is ignored. */
    contributedIn(group: 'top' | 'local'): AddressBarMode[] {
        const contributed = this.modeProvider.getContributions();
        return LOCAL_MODES.filter(entry => entry.group === group)
            .map(entry => contributed.find(mode => mode.id === entry.id))
            .filter((mode): mode is AddressBarMode => mode !== undefined);
    }

    /** Phase 30 (D-03, D-17): the PowerBrowser mode's default mode; Address when that mode is not contributed. */
    defaultMode(): ModeId {
        return defaultModeFor(this.uiMode, id => this.modeProvider.getContributions().some(mode => mode.id === id));
    }

    /** Phase 30: an engine mode's engine name, else undefined. An instance-replaceable method, so a live plant can ignore the mode. */
    protected modeEngine(): string | undefined {
        return engineNameOf(this.mode);
    }

    /** Phase 30 (D-26): what the active mode may send to chrome while typing. */
    protected modeSends(): { resolve: boolean; suggestions: boolean; autofill: boolean; places: boolean } {
        return MODE_SENDS[modeKindOf(this.mode)] ?? MODE_SENDS['address'];
    }

    /** Phase 30 (SMODE-01): the active mode's contribution when it lists its own rows, else undefined. */
    protected localMode(): AddressBarMode | undefined {
        const mode = this.modeProvider.getContributions().find(entry => entry.id === this.mode);
        return mode && mode.provide && LOCAL_MODE_COPY[mode.id] ? mode : undefined;
    }

    /** Phase 30 (SMODE-05): the Command centre contribution while it is the active mode, else undefined. */
    protected commandCentre(): CommandCentreAddressBarMode | undefined {
        const local = this.localMode();
        if (!local || local.id !== 'command-centre') {
            return undefined;
        }
        const centre = local as CommandCentreAddressBarMode;
        centre.attach(this);
        return centre;
    }

    /** SMODE-05: a help row's prefix becomes the pill's text, and that provider's picks are listed; focus stays. */
    acceptText(text: string): void {
        this.textEdited(text, false);
        this.focusInputAtEnd();
    }

    /** Firefox's search string: empty while the pill still shows the committed address, else the trimmed text. */
    protected queryText(): string {
        return this.inputValue === this.committedAddress ? '' : this.inputValue.trim();
    }

    /** SMODE-05: the text as typed, untrimmed: a provider prefix such as "debug " ends in its space. */
    protected rawQueryText(): string {
        return this.inputValue === this.committedAddress ? '' : this.inputValue;
    }

    /**
     * SMODE-01: a local mode's list for the query text, in place of runQuery
     * (nothing else is sent while typing). Rows past the mode's cap are
     * dropped; Bookmarks, Tabs and History end with the search row. With text
     * the first row is highlighted (the search row only when nothing else
     * matched); the zero-query list has no highlight, so Enter on an unedited
     * address still reloads it. A rejected read shows the mode's failure row.
     */
    protected async runLocalQuery(mode: AddressBarMode): Promise<void> {
        if (!this.dropdownArmed || !mode.provide) {
            return;
        }
        this.localQuery?.cancel();
        const source = this.localQuery = new CancellationTokenSource();
        const seq = ++this.querySeq;
        const typed = mode.id === 'command-centre' ? this.rawQueryText() : this.queryText();
        const text = typed.trim();
        const entry = LOCAL_MODES.find(candidate => candidate.id === mode.id);
        const copy = LOCAL_MODE_COPY[mode.id];
        // The shimmer row only past the contracted delay, while the list is still outstanding.
        const timer = setTimeout(() => {
            if (this.dropdownArmed && this.querySeq === seq) {
                this.shimmer = true;
                this.dropdownOpen = true;
                this.update();
            }
        }, 150);
        let rows: Row[] | undefined;
        try {
            rows = await mode.provide(typed, source.token);
        } catch {
            rows = undefined;
        }
        clearTimeout(timer);
        if (!this.dropdownArmed || this.querySeq !== seq || source.token.isCancellationRequested) {
            return;
        }
        this.shimmer = false;
        const listed = (rows ?? []).slice(0, entry?.cap ?? Infinity)
            .map(row => row.url && row.icon === undefined ? { ...row, icon: this.icons[row.url] ?? null } : row);
        const search = entry?.searchRow && text ? [this.searchRowFor(text)] : [];
        // SMODE-06 (D-29, D-30): an address leads the list; a dotted name that may be a file follows the mode's rows.
        const goto = this.gotoRowFor(mode, typed);
        this.rows = goto?.first ? [goto.row, ...listed, ...search] : [...listed, ...(goto ? [goto.row] : []), ...search];
        this.providerFailed = false;
        this.heuristicNoEngine = false;
        this.localMessage = rows === undefined && copy.failed ? copy.failed(appSubject())
            : listed.length || goto ? undefined
                : text ? copy.noMatch : copy.empty(this.effectiveEngine() ?? '');
        // The first row that can act; a group header or a message pick never takes the highlight, nor a trailing Go-to row.
        this.highlightKey = text ? this.highlightKeys().find(key => key !== GOTO_ROW_KEY || goto?.first) : undefined;
        this.dropdownOpen = true;
        this.update();
        void this.requestIcons(seq);
    }

    /**
     * SMODE-06 (D-29..D-31): the Go-to row for the typed text, and whether it
     * leads the list (an unambiguous address) or follows the mode's rows (a
     * dotted name that may be a file), in Command centre with no Theia prefix
     * and in Tabs, Bookmarks and History; undefined otherwise and for plain
     * text. Classified locally, so nothing is sent to decide it. Choosing it
     * commits visit-only through chrome's resolve.
     */
    protected gotoRowFor(mode: AddressBarMode, typed: string): { row: Row; first: boolean } | undefined {
        const text = typed.trim();
        const kind = classifyAddress(text, { files: mode.id === 'command-centre' });
        const offers = mode.id === 'command-centre' ? this.commandCentre()?.descriptorFor(typed)?.prefix === ''
            : LOCAL_MODES.some(entry => entry.id === mode.id && entry.searchRow);
        if (!offers || kind === 'text') {
            return undefined;
        }
        return {
            first: kind === 'url',
            row: {
                key: GOTO_ROW_KEY, source: 'goto', title: CHROME_BAR_COPY.goTo(text), caption: '', url: '',
                run: () => this.commitText(text, { visitOnly: true }),
            },
        };
    }

    /** SMODE-01: the trailing row that searches `text` with the default engine, only when chosen. */
    protected searchRowFor(text: string): Row {
        const engine = this.effectiveEngine() ?? '';
        return {
            key: SEARCH_ROW_KEY, source: 'heuristic', title: text, caption: CHROME_BAR_COPY.searchWith(engine), url: '',
            engineName: engine, icon: this.engineList?.engines.find(e => e.name === engine)?.icon ?? null,
            run: () => this.runOneOff(this.engineNameForRequest(), 'current', text),
        };
    }

    /** BAR-04: the User-scope engine choice when chrome lists it, else '' (chrome's default); an engine mode's engine first. */
    protected engineNameForRequest(): string {
        const modeEngine = this.modeEngine();
        if (modeEngine) {
            return modeEngine;
        }
        const chosen = String(this.userPreference(DEFAULT_SEARCH_ENGINE_PREFERENCE, ''));
        return chosen && this.engineList?.engines.some(engine => engine.name === chosen) ? chosen : '';
    }

    /** BAR-04: the engine searches actually go to, for the placeholder; undefined before the list arrives. */
    protected effectiveEngine(): string | undefined {
        return this.engineNameForRequest() || this.engineList?.defaultName || undefined;
    }

    /** NAV-06, BAR-13: dragenter/dragover on New Tab and the pill; anything but a link or text is refused (no preventDefault). */
    onDropTargetDragOver = (e: DropTargetDragEvent): void => {
        const kind = dropKindOf(e.dataTransfer);
        e.currentTarget.classList.toggle('is-drop-target', kind === 'link');
        if (kind === 'none') {
            e.dataTransfer.dropEffect = 'none';
            return;
        }
        e.preventDefault();
        // Theia's document-level listener sets dropEffect 'none' on every drag
        // (frontend-application.js, file drops); stopping here keeps the copy.
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'copy';
    };

    /**
     * BAR-13: a drag that started on the pill's own text. Dropping it back on
     * the pill is the native in-field move, never a load; the pill's handlers
     * only stop Theia's document-level listener from cancelling that move.
     */
    protected pillDragActive = false;

    protected onPillDragOver = (e: DropTargetDragEvent): void => {
        if (this.pillDragActive) {
            e.stopPropagation();
            return;
        }
        this.onDropTargetDragOver(e);
    };

    onDropTargetDragLeave = (e: DropTargetDragEvent): void => {
        e.currentTarget.classList.remove('is-drop-target');
    };

    /**
     * BAR-13: a link or text dropped on the pill loads in the current tab, as
     * in Firefox: through chrome's resolve wall, so an address loads, other
     * text searches the bar's engine and anything refused shows the
     * commit-failure row. The payload is never put in the pill for editing.
     */
    protected onPillDrop = async (e: DropTargetDragEvent): Promise<void> => {
        e.currentTarget.classList.remove('is-drop-target');
        if (this.pillDragActive) {
            e.stopPropagation();
            return;
        }
        e.preventDefault();
        e.stopPropagation();
        const payload = droppedTextOf(e.dataTransfer);
        if (payload) {
            await this.openDropped(payload);
        }
    };

    /** BAR-13: the dropped payload's load; a failure's retry drops the same payload again. Also TAB-08's text drop on the strip. */
    async openDropped(payload: string): Promise<void> {
        let resolved: ResolvedAddress | undefined;
        try {
            // Over 2048 characters chrome refuses it; it is never cut short into another address.
            resolved = payload.length <= 2048 ? await this.store.resolveTypedAddress(payload, this.engineNameForRequest()) : undefined;
        } catch {
            resolved = undefined;
        }
        if (!resolved || (resolved.kind !== 'visit' && resolved.kind !== 'search') || !resolved.url) {
            this.showCommitFailure(() => this.openDropped(payload));
            return;
        }
        // Drops any typed text, so the load's state push can update the pill.
        this.inputValue = this.committedAddress;
        this.commitFailed = false;
        this.closeDropdown();
        this.update();
        try {
            await this.openCommittedUrl(resolved.url);
        } catch {
            this.showCommitFailure(() => this.openDropped(payload));
        }
    }

    /**
     * BMK-05: after Clear Recent History succeeds, history rows and their cached
     * favicons are dropped at once; the next query re-reads both from chrome.
     */
    forgetHistoryRows(): void {
        this.placeRows = this.placeRows.filter(row => row.source !== 'history');
        this.icons = {};
        if (this.dropdownOpen) {
            this.rows = this.composeVisibleRows();
        }
        this.update();
    }

    async joinActiveGroup(widget: Widget): Promise<void> {
        try {
            await this.groups.joinActiveGroup(widget);
        } catch (error) {
            console.error('[@powerbrowser/chrome-bar] joining the active group failed:', error instanceof Error ? error.name : typeof error);
        }
    }

    /** BAR-10: right-click, the context-menu key and Shift+F10 on the pill open its menu instead of the native one. */
    protected onPillContextMenu = (e: React.MouseEvent<HTMLInputElement>): void => {
        e.preventDefault();
        const rect = e.currentTarget.getBoundingClientRect();
        const keyboard = e.button !== 2 || (e.clientX === 0 && e.clientY === 0);
        void this.openPillMenu(keyboard ? { x: rect.left, y: rect.bottom } : { x: e.clientX, y: e.clientY });
    };

    /**
     * BAR-10: Cut, Copy, Paste, Paste & Go, a separator, Select All, as a
     * stock `.lm-Menu` built per request. Enablement reads only the input:
     * Paste and Paste & Go are always enabled, so opening the menu never reads
     * the clipboard; it is read only when one of them is chosen. Focus returns
     * to the pill on close, except after Paste & Go, which moves it to the page.
     * A prototype method, so a live plant can replace it per instance.
     */
    protected async openPillMenu(anchor: { x: number; y: number }): Promise<void> {
        const input = this.pillRef?.querySelector('input');
        if (!input) {
            return;
        }
        const start = input.selectionStart ?? input.value.length;
        const end = input.selectionEnd ?? start;
        let went = false;
        const item = (id: string, label: string, sortString: string, enabled: boolean, run: () => Promise<void>): CommandMenu => ({
            id: `pill-${id}`, label, sortString, isVisible: () => true, isEnabled: () => enabled, isToggled: () => false, run,
        });
        const group = (id: string, sortString: string, children: CommandMenu[]): CompoundMenuNode => ({
            id, sortString, children, isVisible: () => true, isEmpty: () => false,
        });
        const menu: CompoundMenuNode = {
            id: 'pill', sortString: '0', isVisible: () => true, isEmpty: () => false, children: [
                group('pill-edit', '0', [
                    item('cut', CHROME_BAR_COPY.cut, '0', start !== end, () => this.cutSelection(input, start, end)),
                    item('copy', CHROME_BAR_COPY.copy, '1', start !== end, async () => {
                        await this.clipboard.writeText(input.value.slice(start, end));
                    }),
                    item('paste', CHROME_BAR_COPY.paste, '2', true, () => this.pasteClipboard(input, start, end)),
                    item('paste-and-go', CHROME_BAR_COPY.pasteAndGo, '3', true, () => {
                        went = true;
                        return this.pasteAndGo();
                    }),
                ]),
                group('pill-select', '1', [
                    item('select-all', CHROME_BAR_COPY.selectAll, '0', input.value !== '', async () => input.select()),
                ]),
            ],
        };
        this.menus.render({
            menuPath: PILL_MENU_PATH,
            menu,
            anchor,
            context: input,
            includeAnchorArg: false,
            // Deferred past the stock focus restore, as the history menu does.
            onHide: () => setTimeout(() => {
                if (!went) {
                    input.focus();
                }
            }),
        });
    }

    /** BAR-10: Cut removes the selection only once the clipboard took it, so a failed write loses no text. */
    protected async cutSelection(input: HTMLInputElement, start: number, end: number): Promise<void> {
        let written = !this.clipboard.onDidWriteText;
        const listener = this.clipboard.onDidWriteText?.(() => { written = true; });
        try {
            await this.clipboard.writeText(input.value.slice(start, end));
        } finally {
            listener?.dispose();
        }
        if (written) {
            input.setRangeText('', start, end, 'end');
            this.textEdited(input.value, false);
        }
    }

    /** BAR-10: inserts the clipboard text at the selection as typing does (suggestions refresh, no autofill). */
    protected async pasteClipboard(input: HTMLInputElement, start: number, end: number): Promise<void> {
        let text: string;
        try {
            text = await this.store.readClipboardText();
        } catch {
            this.showPasteFailure();
            return;
        }
        if (typeof text !== 'string' || !text) {
            return;
        }
        input.setRangeText(text, start, end, 'end');
        this.textEdited(input.value, false);
    }

    /** BAR-10: replaces the text with the clipboard text and commits it as Enter would, then focuses the page. */
    protected async pasteAndGo(): Promise<void> {
        let text: string;
        try {
            text = await this.store.readClipboardText();
        } catch {
            this.showPasteFailure();
            return;
        }
        if (typeof text !== 'string' || !text.trim()) {
            return;
        }
        await this.commitText(text);
        const tab = currentWebTab();
        // The focus survives the load: Gecko keeps a focused overlay focused across a browsing-context switch.
        if (tab && !this.commitFailed && !this.noSearch) {
            tab.focusPage();
        }
    }

    /** BAR-10: the clipboard could not be read: one failure row under the pill. */
    protected showPasteFailure(): void {
        this.pasteFailed = true;
        this.dropdownOpen = true;
        this.highlightKey = undefined;
        this.update();
    }

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
        this.highlightKey = undefined;
        this.homeFailed = false;
        this.noSearch = false;
        this.engineRows = [];
        // Rows kept here would come back under a later failure or paste row, or be chosen unseen.
        this.rows = [];
        this.heuristic = null;
        this.placeRows = [];
        this.autofill = undefined;
        this.removeFailedKey = undefined;
        this.pasteFailed = false;
        this.retry = undefined;
        this.localQuery?.cancel();
        this.localMessage = undefined;
    }

    protected async runQuery(prefix: string): Promise<void> {
        // Only text typed since the last close may open the dropdown. The
        // debounce delays this call, so a query scheduled by the last
        // keystroke BEFORE Enter still arrives here AFTER the commit; the
        // sequence bump in closeDropdown cannot see it because the sequence
        // is taken below. Without this guard that late query re-opened the
        // dropdown over the committed page.
        // Phase 30 (D-26): a mode whose MODE_SENDS row forbids the resolve sends nothing from here; that also
        // keeps a query debounced before a switch to a local mode from replacing the mode's list.
        if (!this.dropdownArmed || !this.modeSends().resolve) {
            return;
        }
        const seq = ++this.querySeq;
        // Each reply re-checks both guards on arrival (29-RESEARCH Pitfall 9).
        const current = (): boolean => this.dropdownArmed && this.querySeq === seq;
        // Row-level shimmer only past the contracted delay: local matches
        // paint synchronously with no spinner; the shimmer row appears only
        // when a request is still outstanding after 150ms.
        const timer = setTimeout(() => {
            if (current()) {
                this.shimmer = true;
                this.dropdownOpen = true;
                this.update();
            }
        }, 150);
        // Phase 30 (D-26): each request is sent only when the mode's MODE_SENDS row allows it.
        const sends = this.modeSends();
        const heuristic = !sends.resolve ? Promise.resolve() : this.store.resolveTypedAddress(prefix, this.engineNameForRequest(), false, this.modeEngine() !== undefined).then(
            resolved => {
                if (current()) {
                    this.setHeuristic(prefix, resolved);
                    return this.fetchEngineRows(prefix, resolved, current);
                }
            },
            () => {
                if (current()) {
                    this.setHeuristic(prefix, undefined);
                }
            }
        );
        if (sends.autofill && this.autofillWanted) {
            void this.requestAutofill(prefix, current);
        }
        const places = !sends.places ? Promise.resolve() : this.suggestions.searchByPrefix(prefix, PLACE_ROW_LIMIT).then(
            rows => {
                if (current()) {
                    this.placeRows = this.placeRowsOf(rows as SourcedRow[]);
                    this.showComposedRows(seq);
                }
            },
            () => {
                // Places and open tabs are an addition: their failure is silent, as in Firefox.
                if (current()) {
                    this.placeRows = [];
                    this.showComposedRows(seq);
                }
            }
        );
        await Promise.all([heuristic, places]);
        clearTimeout(timer);
        if (current()) {
            this.shimmer = false;
            this.update();
        }
    }

    /**
     * BAR-07: completes the typed text inline to chrome's best visited origin,
     * under the query's guards and only while the pill still holds `prefix`.
     * The completed part is selected at once, so the next keystroke replaces
     * it; the heuristic row becomes a visit of the origin.
     */
    protected async requestAutofill(prefix: string, current: () => boolean): Promise<void> {
        let completion: { text: string; url: string } | null;
        try {
            completion = await this.store.autofillOrigin(prefix);
        } catch {
            return;
        }
        if (!completion || !current() || this.autofillSuppressed || this.inputValue !== prefix
            || typeof completion.url !== 'string' || !/^https?:\/\//i.test(completion.url)) {
            return;
        }
        const input = this.pillRef?.querySelector('input');
        const splice = typeof completion.text === 'string' ? autofillSplice(prefix, completion.text) : null;
        if (!splice || !input || input.value !== prefix) {
            return;
        }
        this.inputValue = splice.value;
        this.autofill = { value: splice.value, url: completion.url };
        // Set on the element now, not after the render: a keystroke landing in between would append to the completion.
        input.value = splice.value;
        input.setSelectionRange(splice.start, splice.end);
        this.heuristic = this.autofillRow(completion.url);
        this.showComposedRows(this.querySeq);
    }

    /** BAR-07: the heuristic row for an autofilled origin. */
    protected autofillRow(url: string): Row {
        return { key: HEURISTIC_KEY, source: 'heuristic', title: url, caption: CHROME_BAR_COPY.visit, url };
    }

    /**
     * BAR-07: only typed characters autofill: an insertText input with the
     * caret at the end, no space, no composition and no suppression. A paste
     * never does. An instance-replaceable method, so a live plant can widen it.
     */
    protected autofillEligible(e: React.ChangeEvent<HTMLInputElement>): boolean {
        const native = e.nativeEvent as InputEvent;
        const input = e.target;
        return native.inputType === 'insertText' && native.isComposing !== true && !this.autofillSuppressed
            && input.selectionStart === input.value.length && input.selectionEnd === input.value.length
            && !/\s/.test(input.value);
    }

    /** BAR-07: the autofilled completion is still selected in `input`. */
    protected autofillSelected(input: HTMLInputElement): boolean {
        return !!this.autofill && input.value === this.autofill.value
            && input.selectionStart !== null && input.selectionStart < input.value.length && input.selectionEnd === input.value.length;
    }

    /** BAR-03: the User-scope Search Suggestions setting; on unless the user turned it off. */
    protected suggestionsOn(): boolean {
        return this.userPreference(SEARCH_SUGGESTIONS_PREFERENCE, true) === true;
    }

    /**
     * BAR-03: the engine's suggestions, only when chrome resolved the text as
     * a search, the setting is on and no composition is open; chrome
     * re-resolves and refuses an address itself. A failure is silent.
     */
    protected async fetchEngineRows(prefix: string, resolved: ResolvedAddress, current: () => boolean): Promise<void> {
        if (resolved.kind !== 'search' || !this.modeSends().suggestions || !this.suggestionsOn() || this.compositionOpen) {
            return;
        }
        let values: string[];
        try {
            values = await this.store.searchSuggestions(prefix, this.engineNameForRequest());
        } catch {
            return;
        }
        if (!current() || !Array.isArray(values)) {
            return;
        }
        const caption = CHROME_BAR_COPY.searchWith(resolved.engineName ?? '');
        this.engineRows = Array.from(new Set(values.filter(value => typeof value === 'string' && value)))
            .map((value): Row => ({ key: 'search:' + value, source: 'search', title: value, caption, url: '' }));
        this.showComposedRows(this.querySeq);
    }

    /** BAR-11: the heuristic row from chrome's resolve of the typed text; undefined when the resolve failed. */
    protected setHeuristic(text: string, resolved: ResolvedAddress | undefined): void {
        this.providerFailed = !resolved;
        this.heuristicNoEngine = resolved?.kind === 'no-engine';
        const row: Row = { key: HEURISTIC_KEY, source: 'heuristic', title: text, caption: CHROME_BAR_COPY.visit, url: '' };
        if (resolved?.kind === 'search' && resolved.url) {
            const engine = resolved.engineName ?? '';
            row.caption = CHROME_BAR_COPY.searchWith(engine);
            row.url = resolved.url;
            row.engineName = engine;
            row.icon = this.engineList?.engines.find(e => e.name === engine)?.icon ?? null;
        } else if (resolved?.kind === 'visit' && resolved.url) {
            row.title = resolved.url;
            row.url = resolved.url;
        }
        // BAR-07: an autofilled origin keeps the heuristic row on that origin.
        this.heuristic = this.autofill && this.inputValue === this.autofill.value ? this.autofillRow(this.autofill.url) : row;
        this.showComposedRows(this.querySeq);
    }

    /**
     * BAR-11: sourced service rows as dropdown rows (the service keeps an
     * open-tab row only while a shell web tab shows it); a row with no title
     * shows its address.
     */
    protected placeRowsOf(rows: SourcedRow[]): Row[] {
        return rows
            .map(row => ({ key: `${row.source}:${row.url}`, source: row.source, title: row.title || row.url, caption: row.url, url: row.url }));
    }

    /** BAR-11: the one composition path, through address-bar-rows; cached icons ride along. */
    protected composeVisibleRows(): Row[] {
        const withIcon = (row: Row): Row => row.engineName ? row : { ...row, icon: this.icons[row.url] ?? null };
        return composeRows(this.heuristic && withIcon(this.heuristic), this.engineRows, this.placeRows.map(withIcon));
    }

    /** Rebuilds the rows, keeps the highlighted row by key (else the heuristic row), then asks for missing favicons. */
    protected showComposedRows(seq: number): void {
        this.rows = this.composeVisibleRows();
        if (!this.highlightKeys().includes(this.highlightKey ?? '')) {
            this.highlightKey = HEURISTIC_KEY;
        }
        this.dropdownOpen = true;
        this.update();
        void this.requestIcons(seq);
    }

    /** BAR-11: favicons for the rows' addresses from chrome's Places cache, under the same guards as the query. */
    protected async requestIcons(seq: number): Promise<void> {
        const urls = this.rows
            .filter(row => row.url && !row.engineName && this.icons[row.url] === undefined)
            .map(row => row.url);
        if (!urls.length) {
            return;
        }
        let icons: Record<string, string>;
        try {
            icons = await this.store.placesFavicons(urls);
        } catch {
            return;
        }
        if (!this.dropdownArmed || this.querySeq !== seq) {
            return;
        }
        const found = Object.keys(icons).filter(url => typeof icons[url] === 'string');
        if (!found.length) {
            return;
        }
        for (const url of found) {
            this.icons[url] = icons[url];
        }
        this.rows = this.localMode()
            ? this.rows.map(row => row.url && !row.engineName ? { ...row, icon: this.icons[row.url] ?? null } : row)
            : this.composeVisibleRows();
        this.update();
    }

    protected onInputChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
        if ((e.nativeEvent as InputEvent).inputType === 'insertText') {
            this.autofillSuppressed = false;
        }
        this.textEdited(e.target.value, this.autofillEligible(e), this.composing(e));
    };

    /**
     * BAR-11: an IME composition is open for this event. An instance-replaceable
     * method, so a live plant can turn the guard off.
     */
    protected composing(e: { nativeEvent: Event; keyCode?: number }): boolean {
        return (e.nativeEvent as KeyboardEvent).isComposing === true || e.keyCode === 229;
    }

    /** BAR-11: the composed text is queried once, now (never autofilled: it is not an insertText input). */
    protected onCompositionEnd = (e: React.CompositionEvent<HTMLInputElement>): void => {
        this.textEdited(e.currentTarget.value, false);
    };

    /** BAR-11: records whether this press found the pill focused (in a focused document). */
    protected onInputMouseDown = (e: React.MouseEvent<HTMLInputElement>): void => {
        this.focusedAtPress = document.hasFocus() && document.activeElement === e.currentTarget;
    };

    /** BAR-11: a primary click that gave the pill focus selects it all; a drag's range and later clicks stay stock. */
    protected onInputMouseUp = (e: React.MouseEvent<HTMLInputElement>): void => {
        const input = e.currentTarget;
        if (e.button === 0 && !this.focusedAtPress && input.selectionStart === input.selectionEnd) {
            input.select();
        }
        this.focusedAtPress = true;
    };

    /** New pill text, from a keystroke or from the pill menu's Cut and Paste (which never autofill). */
    protected textEdited(value: string, autofillWanted: boolean, composing = false): void {
        // Replies still in flight describe the old text; the debounced query takes a new sequence later.
        this.querySeq += 1;
        this.inputValue = value;
        this.autofill = undefined;
        this.autofillWanted = autofillWanted;
        this.commitFailed = false;
        this.retry = undefined;
        this.pasteFailed = false;
        this.noSearch = false;
        this.homeFailed = false;
        // New text: the old rows describe other text, and the highlight returns to the heuristic row.
        this.heuristic = null;
        this.heuristicNoEngine = false;
        this.providerFailed = false;
        this.placeRows = [];
        this.engineRows = [];
        this.rows = [];
        this.highlightKey = undefined;
        this.removeFailedKey = undefined;
        this.localMessage = undefined;
        // BAR-03: text typed while an IME composition is open is never queried (onCompositionEnd queries it).
        this.compositionOpen = composing;
        if (this.compositionOpen) {
            this.renderNow();
            return;
        }
        if (this.applyToken()) {
            // SMODE-04: the remaining text renders now, so the caret can be put at its end.
            this.renderNow();
            const input = this.pillRef?.querySelector('input');
            if (input && document.activeElement === input) {
                input.setSelectionRange(this.inputValue.length, this.inputValue.length);
            }
        }
        const aliasRows = this.aliasRows();
        if (aliasRows.length) {
            // SMODE-04: "@" alone lists the engines that have an alias; nothing is sent while it does, and a
            // query debounced before it is disarmed so it cannot replace the list.
            this.localQuery?.cancel();
            this.dropdownArmed = false;
            this.rows = aliasRows;
            this.dropdownOpen = true;
            this.renderNow();
            return;
        }
        if (!this.modeSends().resolve) {
            // D-26: a mode that may not resolve typed text never reaches runQuery; a local mode lists its own
            // rows, empty text included (the zero-query list), on a fresh token per keystroke.
            this.localQuery?.cancel();
            const centre = this.commandCentre();
            if (centre && centre.handsOff(this.rawQueryText())) {
                // D-22, D-23: no Theia provider takes this text; Theia's own quick input does, and the pill keeps it.
                this.closeDropdown();
                this.renderNow();
                centre.handOff(this.rawQueryText());
                return;
            }
            if (!this.localMode()) {
                this.closeDropdown();
                this.renderNow();
                return;
            }
            this.dropdownArmed = true;
            this.renderNow();
            void this.debouncedLocalQuery();
            return;
        }
        if (!this.inputValue.trim()) {
            // Empty text opens no dropdown.
            this.closeDropdown();
            this.renderNow();
            return;
        }
        this.dropdownArmed = true;
        this.renderNow();
        void this.debouncedQuery(this.inputValue);
    }

    /**
     * SMODE-04 (D-18): a leading mode token and its space enter that mode, the
     * token consumed; true when one did. Command centre keeps a token that is
     * exactly a Theia quick-access prefix, derived from the registry. An
     * instance-replaceable method, so a live plant can ignore tokens.
     */
    protected applyToken(): boolean {
        const next = tokenise(this.inputValue, this.mode, {
            aliases: this.engineAliases(),
            defaultEngine: this.effectiveEngine(),
            keepInCommandCentre: token => {
                const centre = this.commandCentre();
                const descriptor = centre ? centre.descriptorFor(token) : undefined;
                return !!descriptor && descriptor.prefix === token;
            },
        });
        if (!next) {
            return false;
        }
        this.mode = next.mode;
        this.inputValue = next.text;
        return true;
    }

    /** SMODE-04: each engine alias chrome lists, with its engine's name, in chrome's order. */
    protected engineAliases(): Array<[string, string]> {
        const engines = this.engineList ? this.engineList.engines : [];
        return ([] as Array<[string, string]>).concat(...engines.map(engine => engine.aliases.map((alias): [string, string] => [alias, engine.name])));
    }

    /**
     * SMODE-04: "@" alone outside Command centre lists the engines that have
     * an alias -- the alias, the engine's name, its icon; choosing one enters
     * its mode with empty text. Empty when no engine has an alias, so "@"
     * stays plain text.
     */
    protected aliasRows(): Row[] {
        if (this.inputValue !== '@' || this.mode === 'command-centre') {
            return [];
        }
        const engines = this.engineList ? this.engineList.engines : [];
        return this.engineAliases().map(([alias, name]): Row => ({
            key: `alias:${alias}`, source: 'heuristic', title: alias, caption: name, url: '', engineName: name,
            icon: engines.find(engine => engine.name === name)?.icon ?? null,
            stays: true,
            run: () => {
                this.inputValue = '';
                this.closeDropdown();
                this.pickMode(engineModeId(name));
            },
        }));
    }

    /**
     * Renders inside the current handler. React puts a controlled input's old
     * value back after onChange unless it re-rendered in the handler, and
     * Theia's update() renders a frame later; during an IME composition that
     * write ends the composition (measured live: compositionend straight
     * after the first input event, the pill back on the old address).
     */
    protected renderNow(): void {
        if (this.host) {
            MessageLoop.sendMessage(this.host, Widget.Msg.UpdateRequest);
        }
    }

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
    protected async navigateWebTab(url: string, tab = currentWebTab()): Promise<void> {
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

    /**
     * NAV-04: opens the home page in `tab` (the active web tab for a click,
     * the pushed tab for 27-06's Alt+Home), or in a new web tab without one.
     * A non-empty value resolves through chrome's resolveTypedAddress kind and
     * opens only as a visit: a search result is never a home page. Empty opens the empty page and focuses the
     * pill, as New Tab does; a rejected or unacknowledged value shows the
     * Home-failure row.
     */
    /**
     * The Home settings are read from user settings only: a workspace's own
     * settings file must not be able to point Home at a page of its choosing.
     */
    userPreference<T extends string | boolean>(name: string, fallback: T): T {
        return this.preferences.inspectInScope<T>(name, PreferenceScope.User) ?? fallback;
    }

    async goHome(tab: WebTabWidget | undefined): Promise<'opened' | 'empty' | 'failed'> {
        const page = String(this.userPreference(HOME_PAGE_PREFERENCE, '')).trim();
        if (!page) {
            if (tab) {
                await tab.navigate(EMPTY_PAGE_URL);
            } else {
                await this.commands.executeCommand(CHROME_BAR_NEW_TAB_COMMAND_ID);
            }
            focusAddressPill();
            return 'empty';
        }
        try {
            const resolved = await this.store.resolveTypedAddress(page, this.engineNameForRequest());
            if (resolved.kind !== 'visit' || !resolved.url) {
                throw new Error('the home page is not an address');
            }
            await this.navigateWebTab(resolved.url, tab);
            return 'opened';
        } catch {
            this.commitFailed = false;
            this.homeFailed = true;
            this.dropdownOpen = true;
            this.highlightKey = undefined;
            this.update();
            // Focus only: the address keys' path would close the Home-failure row just shown.
            const input = this.pillRef?.querySelector('input');
            input?.focus();
            input?.select();
            return 'failed';
        }
    }

    /** NAV-04: the Home-failure affordance -- Settings filtered to the home-page setting. */
    protected openHomeSettings = async (): Promise<void> => {
        this.closeDropdown();
        this.update();
        try {
            await this.commands.executeCommand(CommonCommands.OPEN_PREFERENCES.id, HOME_PAGE_PREFERENCE);
        } catch (error) {
            console.error('[@powerbrowser/chrome-bar] opening Settings failed:', error instanceof Error ? error.name : typeof error);
        }
    };

    /** Surfaces a commit failure in-bar per the copy contract: one failure row, Enter retries. */
    protected showCommitFailure(retry?: () => Promise<void>): void {
        this.commitFailed = true;
        this.retry = retry;
        this.dropdownOpen = true;
        this.highlightKey = undefined;
        this.update();
    }

    /** Phase 29 (BAR-01): chrome has no engine for typed words: one no-search row, Enter retries. */
    protected showNoSearch(retry?: () => Promise<void>): void {
        this.noSearch = true;
        this.retry = retry;
        this.dropdownOpen = true;
        this.highlightKey = undefined;
        this.update();
    }

    /**
     * Activates a suggestion row through its url field, never its opaque
     * uri key: the key is a store identity (kept as the React list key
     * below), not an address any opener could route.
     */
    protected commitRow = async (row: Row): Promise<void> => {
        if (row.source === 'search') {
            // An engine suggestion commits its text through the same resolve path as typed text.
            return this.commitText(row.title);
        }
        const url = row.url;
        this.committedAddress = url;
        this.inputValue = url;
        this.commitFailed = false;
        this.closeDropdown();
        this.resetMode();
        this.update();
        try {
            await this.openCommittedUrl(url);
        } catch {
            this.showCommitFailure();
        }
    };

    /** BAR-06: the live web tab showing an open-tab row's address (the match the places service keeps tab rows by). */
    protected liveTabFor(row: Row): WebTabWidget | undefined {
        const tabs = this.shell.getWidgets('main').filter((w): w is WebTabWidget => w instanceof WebTabWidget && w.hasPage);
        // Phase 30: a Tabs-mode row names its own tab, so two tabs on one url each switch to their own.
        return tabs.find(w => row.widgetId !== undefined && w.id === row.widgetId) ?? tabs.find(w => w.url === row.url);
    }

    /**
     * BAR-06: shows the tab an open-tab row names, as a tab-strip click does.
     * Nothing navigates, so the page keeps its state; the pill re-syncs from
     * the activation. A tab closed since the query commits the row's address.
     * A prototype method, so a live plant can replace it per instance.
     */
    protected async switchToTab(row: Row): Promise<void> {
        const widget = this.liveTabFor(row);
        if (!widget) {
            return this.commitRow(row);
        }
        // Drops the typed text so the activation's sync is not held off as an edit in progress.
        this.inputValue = this.committedAddress;
        this.closeDropdown();
        this.resetMode();
        this.update();
        await this.shell.activateWidget(widget.id);
        widget.focusPage();
    }

    /**
     * BAR-08: the address a row opens in a new tab. Tab, bookmark and history
     * rows carry theirs; the typed text (no row, or the heuristic row) and an
     * engine row's text go through chrome's resolve wall, and only a visit or
     * search reply gives an address. The text is read before the first await.
     */
    protected async urlForRow(row: Row | undefined): Promise<string | undefined> {
        if (row && row.source !== 'heuristic' && row.source !== 'search') {
            return row.url;
        }
        const text = (row?.source === 'search' ? row.title : this.inputValue).trim();
        if (!text) {
            return undefined;
        }
        try {
            // An engine mode searches address-shaped text too, as its Enter does.
            const resolved = await this.store.resolveTypedAddress(text, this.engineNameForRequest(), false, this.modeEngine() !== undefined);
            return (resolved.kind === 'visit' || resolved.kind === 'search') && resolved.url ? resolved.url : undefined;
        } catch {
            return undefined;
        }
    }

    /**
     * BAR-08: opens a row (undefined: the typed text) in a new web tab
     * directly after the current one, joined to the active group. Foreground
     * (Alt+Enter) activates it with focus in its page; background (Ctrl+click,
     * middle-click) leaves the current tab selected. Either way the dropdown
     * closes and the pill reverts to the committed address. An open-tab row
     * opens its address again rather than switching. With no current widget
     * to open after, the tab is appended (and so selected).
     */
    protected async openRowInNewTab(row: Row | undefined, foreground: boolean): Promise<void> {
        if (row?.key === SEARCH_ROW_KEY) {
            // SMODE-01: the trailing search row searches its text with the default engine in the new tab.
            return this.runOneOff(this.engineNameForRequest(), foreground ? 'foreground' : 'background', row.title);
        }
        if (row?.run) {
            // An action has no address to open elsewhere: it runs.
            return this.chooseRow(row);
        }
        if (this.commandCentre()) {
            // D-26: nothing typed in Command centre is resolved; a row with no run has nothing to open.
            return;
        }
        const url = await this.urlForRow(row);
        if (!url || !/^https?:\/\//i.test(url)) {
            this.showCommitFailure(() => this.openRowInNewTab(row, foreground));
            return;
        }
        await this.openUrlInNewTab(url, foreground);
    }

    /** BAR-08: opens `url` in a new tab after the current one; a failure's retry opens the same address again. */
    protected async openUrlInNewTab(url: string, foreground: boolean): Promise<void> {
        const ref = currentWebTab() ?? this.shell.currentWidget;
        this.inputValue = this.committedAddress;
        this.commitFailed = false;
        this.closeDropdown();
        this.resetMode();
        this.update();
        let widget: WebTabWidget;
        try {
            widget = ref ? await this.webTabOpener.openInBackground(url, ref) : await this.webTabOpener.openUrl(url);
        } catch (error) {
            console.error('[@powerbrowser/chrome-bar] opening a row in a new tab failed:', error instanceof Error ? error.name : typeof error);
            this.showCommitFailure(() => this.openUrlInNewTab(url, foreground));
            return;
        }
        await this.joinActiveGroup(widget);
        if (foreground) {
            await this.shell.activateWidget(widget.id);
            widget.focusPage();
        }
    }

    /** Choosing a row by plain click or Enter: the heuristic commits the typed text, an open tab switches, the rest commit their address. */
    protected async chooseRow(row: Row): Promise<void> {
        if (!row.run && (row.source === 'group' || row.source === 'pick')) {
            // SMODE-05: a group header or a message pick (no execute) chooses nothing.
            return;
        }
        if (row.run && row.stays) {
            // SMODE-05: a help row keeps the dropdown and the mode; it changes the pill's text.
            return row.run();
        }
        if (row.run) {
            // Phase 30: an action, the trailing search row or a pick; the choice ends the picked mode (D-15).
            this.inputValue = this.committedAddress;
            this.closeDropdown();
            this.resetMode();
            this.update();
            await row.run();
            if (row.source === 'pick') {
                this.returnFocusAfterPick();
            }
            return;
        }
        if (row.source === 'heuristic') {
            return this.commitTyped();
        }
        return row.source === 'tab' ? this.switchToTab(row) : this.commitRow(row);
    }

    /**
     * 30-RESEARCH A5: a pick that left focus in the pill (a > command refocuses
     * the element active when its picks were read) gives it back, on the next
     * task, to the shell's current widget. Top-panel widgets are not tracked,
     * so that is the editor or tab the user was in.
     */
    protected returnFocusAfterPick(): void {
        setTimeout(() => {
            const input = this.pillRef?.querySelector('input');
            if (!input || document.activeElement !== input) {
                return;
            }
            input.blur();
            const widget = this.shell.currentWidget ?? this.shell.mainPanel.currentTitle?.owner;
            if (widget) {
                void this.shell.activateWidget(widget.id);
            }
        });
    }

    /** BAR-07: an autofilled value opens the completed origin; any other text commits as typed. */
    protected commitTyped(): Promise<void> {
        return this.autofill && this.inputValue === this.autofill.value
            ? this.commitRow(this.autofillRow(this.autofill.url))
            : this.commitText(this.inputValue);
    }

    /**
     * Commits typed text: typed text resolves chrome-side; search URLs are
     * minted only by chrome's resolveTypedAddress. A visit or search reply
     * opens on the web-tab route; no-engine shows the no-search row; anything
     * else (refused, no reply) surfaces the contracted in-bar failure row. This widget keeps no address rule
     * of its own. Empty commits are no-ops.
     */
    protected commitText = async (raw: string, { canonize = false, engine = this.modeEngine(), visitOnly = false }: { canonize?: boolean; engine?: string; visitOnly?: boolean } = {}): Promise<void> => {
        const text = raw.trim();
        if (!text) {
            return;
        }
        // Phase 30: an engine mode's commit always searches with that engine (forceSearch), and its retry does too.
        const engineName = engine ?? this.engineNameForRequest();
        const retry = (): Promise<void> => this.commitText(text, { canonize, engine, visitOnly });
        this.committedAddress = text;
        this.inputValue = text;
        this.commitFailed = false;
        this.closeDropdown();
        this.resetMode();
        this.update();
        let resolved: ResolvedAddress | undefined;
        try {
            resolved = await this.store.resolveTypedAddress(text, engineName, canonize, engine !== undefined);
        } catch {
            resolved = undefined;
        }
        if (resolved?.kind === 'no-engine') {
            this.showNoSearch(retry);
            return;
        }
        if (!resolved || (resolved.kind !== 'visit' && resolved.kind !== 'search') || !resolved.url || this.refusesSearch(resolved, visitOnly)) {
            this.showCommitFailure(retry);
            return;
        }
        try {
            await this.openCommittedUrl(resolved.url);
        } catch {
            this.showCommitFailure(retry);
        }
    };

    /** D-31 (30-RESEARCH A4): a Go-to commit that chrome resolves to a search loads nothing. An instance method, so a live plant can turn it off. */
    protected refusesSearch(resolved: ResolvedAddress, visitOnly: boolean): boolean {
        return visitOnly && resolved.kind === 'search';
    }

    /**
     * D-26 (CR-01, WR-02): Enter (Alt+Enter: in a new tab) in a local mode
     * with typed text chooses the highlighted row, never the text itself (no
     * web search from Tabs, Bookmarks, History or Actions). Pressed inside the
     * debounce, the list settles first, so its default row (the first
     * actionable one, 30-UI-SPEC) wins; with no row (Actions with no match),
     * Enter does nothing.
     */
    protected async enterLocalRow(mode: AddressBarMode, newTab: boolean): Promise<void> {
        const value = this.inputValue;
        if (!this.highlightedRow() && this.dropdownArmed) {
            await this.runLocalQuery(mode);
        }
        const row = this.highlightedRow();
        if (row && this.inputValue === value) {
            await (newTab ? this.openRowInNewTab(row, true) : this.chooseRow(row));
        }
    }

    protected highlightedRow(): Row | undefined {
        return this.dropdownOpen ? this.rows.find(row => row.key === this.highlightKey) : undefined;
    }

    protected onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
        if (this.composing(e)) {
            // BAR-11: the IME owns every key while a composition is open; nothing commits or moves early.
            return;
        }
        if (this.modesOpen) {
            // SMODE-01: a menu the input opened is driven from the input.
            this.onModesKeyDown(e);
            return;
        }
        const accel = isOSX ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey;
        if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && !e.shiftKey && ((accel && !e.altKey) || (e.altKey && !e.ctrlKey && !e.metaKey))) {
            // SMODE-04 (D-19): Accel+Up/Down cycles the mode without opening the dropdown; Alt+Up/Down opens the
            // modes menu. The pill-scoped passthrough let the key through; nothing past the pill sees it.
            e.preventDefault();
            e.stopPropagation();
            if (e.altKey) {
                this.openModesMenu();
            } else {
                this.cycleMode(e.key === 'ArrowDown' ? 1 : -1);
            }
        } else if (e.key === 'F6' && !e.ctrlKey && !e.altKey && !e.metaKey) {
            e.preventDefault();
            if (this.mode !== 'address') {
                // D-28: in a non-Address mode F6 switches to Address and keeps focus, the text selected.
                this.focusAddress();
                return;
            }
            // The pill is chrome, not an editor: in Address mode F6 and Shift+F6 go back to the page.
            this.closeDropdown();
            this.update();
            const tab = currentWebTab();
            if (tab?.hasPage) {
                tab.focusPage();
            }
        } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            if (!this.dropdownOpen || this.rows.length === 0) {
                return;
            }
            this.highlightKey = nextHighlight(this.highlightKeys(), this.highlightKey, e.key === 'ArrowDown' ? 1 : -1);
            this.update();
            this.scrollHighlightIntoView();
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (this.homeFailed) {
                void this.openHomeSettings();
                return;
            }
            const local = this.localMode();
            if (local && this.queryText()) {
                // D-26 (CR-01, WR-02): in a local mode Enter, Alt+Enter and Ctrl+Enter act on a row; typed text never reaches chrome's resolve.
                void this.enterLocalRow(local, e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey);
                return;
            }
            if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
                // BAR-08: Alt+Enter opens the highlighted row (by default the typed text) in a new foreground tab.
                if (this.dropdownOpen && this.highlightKey?.startsWith(ONE_OFF_KEY)) {
                    void this.runOneOff(this.highlightKey.slice(ONE_OFF_KEY.length), 'foreground');
                    return;
                }
                const row = this.dropdownOpen ? this.rows.find(r => r.key === this.highlightKey) : undefined;
                void this.openRowInNewTab(row, true);
                return;
            }
            // BAR-13: with a completion still selected, Ctrl+Enter acts on the typed part, not the autofilled origin.
            const typed = this.autofillSelected(e.currentTarget) ? this.inputValue.slice(0, e.currentTarget.selectionStart ?? undefined) : this.inputValue;
            if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && !local && isCanonizable(typed.trim())) {
                // BAR-13: Ctrl+Enter completes a bare name to www.name.com in the current tab; other text is plain Enter.
                void this.commitText(typed, { canonize: true });
                return;
            }
            if (this.commitFailed || this.noSearch) {
                // Retry affordance: Enter repeats the failed drop, new-tab open or search, else re-commits the typed text.
                const retry = this.retry;
                this.commitFailed = false;
                this.noSearch = false;
                if (retry) {
                    this.closeDropdown();
                    this.update();
                    void retry();
                } else {
                    void this.commitText(this.inputValue);
                }
                return;
            }
            // The heuristic row (and Enter before any row arrived) commits the typed text through a
            // fresh resolve, never the cached heuristic; any other row commits its own address.
            if (this.dropdownOpen && this.highlightKey?.startsWith(ONE_OFF_KEY)) {
                void this.runOneOff(this.highlightKey.slice(ONE_OFF_KEY.length), 'current');
                return;
            }
            const highlighted = this.dropdownOpen ? this.rows.find(row => row.key === this.highlightKey) : undefined;
            const centre = this.commandCentre();
            if (!highlighted && centre) {
                // D-26: Command centre never sends its text to chrome's resolve; with no row chosen, Enter does nothing,
                // unless the text is an unambiguous address, which goes through the Go-to row's visit-only commit (D-29).
                const goto = this.gotoRowFor(centre, this.rawQueryText());
                if (goto?.first) {
                    void this.chooseRow(goto.row);
                }
                return;
            }
            void (highlighted ? this.chooseRow(highlighted) : this.commitTyped());
        } else if (e.key === 'Tab' && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey && this.autofillSelected(e.currentTarget)) {
            // BAR-07: Tab accepts the completion; focus and the dropdown stay. Without one, Tab moves focus as usual.
            e.preventDefault();
            const end = e.currentTarget.value.length;
            e.currentTarget.setSelectionRange(end, end);
        } else if (e.key === 'Delete' && e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey && this.removableHighlighted()) {
            // BAR-09: Shift+Delete removes a highlighted history row; on any other row, or none, it keeps its default.
            e.preventDefault();
            void this.removeHighlightedRow();
        } else if (e.key === 'Backspace' && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey
            && e.currentTarget.selectionStart === 0 && e.currentTarget.selectionEnd === 0 && this.mode !== this.defaultMode()) {
            // SMODE-03 (D-14): Backspace at the start leaves a picked mode for the default and re-runs the query.
            e.preventDefault();
            this.resetMode({ requery: true });
            this.update();
        } else if ((e.key === 'Backspace' || e.key === 'Delete') && this.autofillSelected(e.currentTarget)) {
            // BAR-07: the default action removes the selected completion; the re-query must not complete it again.
            this.autofillSuppressed = true;
        } else if (e.key === 'Escape') {
            // Staged dismissal: close the dropdown, then the site panel,
            // then restore the committed address, then (NAV-01) stop a loading page.
            if (this.dropdownOpen) {
                this.closeDropdown();
                this.update();
            } else if (this.sitePanelOpen) {
                this.closeSitePanel();
            } else if (this.inputValue !== this.committedAddress || this.mode !== this.defaultMode()) {
                // D-15: the restore step also returns a picked mode to the default.
                this.inputValue = this.committedAddress;
                this.resetMode();
                this.update();
            } else if (currentWebTab()?.loading) {
                currentWebTab()?.stop();
            }
        }
    };

    /** BAR-09: the highlighted row when Shift+Delete may remove it, else undefined. */
    protected removableHighlighted(): Row | undefined {
        const row = this.dropdownOpen ? this.rows.find(r => r.key === this.highlightKey) : undefined;
        return row && this.removableRow(row) ? row : undefined;
    }

    /**
     * BAR-09: only a history row is removable. A bookmark row's page keeps its
     * visits, and open-tab, engine and heuristic rows are not history entries.
     * An instance-replaceable method, so a live plant can widen it.
     */
    protected removableRow(row: Row): boolean {
        return row.source === 'history';
    }

    /**
     * BAR-09: removes a history row's page from Places through chrome (the
     * only caller of the privileged kind). On success the row goes and the
     * highlight moves to the row that followed it, else the one before; on
     * failure the row stays with the failure notice under it.
     */
    protected async removeHighlightedRow(): Promise<void> {
        const row = this.removableHighlighted();
        if (!row) {
            return;
        }
        this.removeFailedKey = undefined;
        // A close, commit or keystroke during the Places write leaves the dropdown closed or replaced.
        const seq = this.querySeq;
        const current = (): boolean => this.dropdownArmed && this.querySeq === seq;
        try {
            await this.store.removeHistoryEntry(row.url);
        } catch {
            if (current() && this.rows.some(r => r.key === row.key)) {
                this.removeFailedKey = row.key;
                this.update();
            }
            return;
        }
        const keys = this.rows.map(r => r.key);
        const at = keys.indexOf(row.key);
        if (at < 0 || !current()) {
            return;
        }
        this.highlightKey = keys[at + 1] ?? keys[at - 1];
        if (this.localMode()) {
            // History mode: the list is the mode's own, not the composed Address rows.
            this.rows = this.rows.filter(r => r.key !== row.key);
            this.update();
            return;
        }
        this.placeRows = this.placeRows.filter(r => r.key !== row.key);
        this.rows = this.composeVisibleRows();
        this.showComposedRows(seq);
    }

    /** Keeps the highlighted row visible in a list that scrolls, after the render that moves the highlight. */
    protected scrollHighlightIntoView(): void {
        const index = this.rows.findIndex(row => row.key === this.highlightKey);
        if (index >= 0) {
            requestAnimationFrame(() => document.getElementById(this.rowId(index))?.scrollIntoView({ block: 'nearest' }));
        }
    }

    /** BAR-05: the visible engines except the one in use, in chrome's order. */
    protected oneOffEngines(): Array<{ name: string; icon: string | null }> {
        // A local mode offers the default engine through its own search row instead.
        if (!this.inputValue.trim() || this.localMode()) {
            return [];
        }
        const inUse = this.effectiveEngine();
        return (this.engineList?.engines ?? []).filter(engine => engine.name !== inUse);
    }

    /** BAR-05: the row keys, then one key per one-off button: the arrow keys' one wrap-around list. */
    protected highlightKeys(): string[] {
        // SMODE-05: group headers and picks without an execute are never highlighted.
        return this.rows.filter(row => row.source !== 'group' && !(row.source === 'pick' && !row.run)).map(row => row.key).concat(this.oneOffEngines().map(engine => ONE_OFF_KEY + engine.name));
    }

    /**
     * BAR-05: searches the typed text with `name` this time only. The engine
     * name rides this one request; Gecko's default and the setting are never
     * written. 'current' searches in the current tab; 'background' opens a new
     * background tab, the current tab stays selected and the pill reverts;
     * 'foreground' (Alt+Enter) opens the new tab and selects it. `text` is
     * passed by a retry: a new-tab one-off has already put the page address back in the pill.
     */
    protected async runOneOff(name: string, target: 'current' | 'background' | 'foreground', text = this.inputValue.trim()): Promise<void> {
        if (!text) {
            return;
        }
        if (target === 'current') {
            this.committedAddress = text;
            this.inputValue = text;
        } else {
            this.inputValue = this.committedAddress;
        }
        this.commitFailed = false;
        this.closeDropdown();
        this.resetMode();
        this.update();
        let resolved: ResolvedAddress | undefined;
        try {
            // A one-off always searches: address-shaped text too (BAR-05).
            resolved = await this.store.resolveTypedAddress(text, name, false, true);
        } catch {
            resolved = undefined;
        }
        if (resolved?.kind !== 'search' || !resolved.url) {
            // Enter repeats this one-off; re-committing the pill would reload the page (WR-05) or use the default engine.
            this.showNoSearch(() => this.runOneOff(name, target, text));
            return;
        }
        // With no tab to open after, a new-tab one-off searches in place.
        const ref = target !== 'current' ? currentWebTab() ?? this.shell.currentWidget : undefined;
        if (!ref) {
            await this.openSearchUrl(resolved.url);
            return;
        }
        let widget: WebTabWidget;
        try {
            widget = await this.webTabOpener.openInBackground(resolved.url, ref);
        } catch (error) {
            console.error('[@powerbrowser/chrome-bar] opening a background tab failed:', error instanceof Error ? error.name : typeof error);
            return;
        }
        await this.joinActiveGroup(widget);
        if (target === 'foreground') {
            // BAR-08: Alt+Enter on a highlighted one-off.
            await this.shell.activateWidget(widget.id);
            widget.focusPage();
        }
    }

    /** BAR-05: a one-off's search in place; a failure's retry opens the same search again. */
    protected async openSearchUrl(url: string): Promise<void> {
        try {
            await this.openCommittedUrl(url);
        } catch {
            this.showCommitFailure(() => this.openSearchUrl(url));
        }
    }

    /** BAR-05: the one-off strip above the footer; absent for empty text or a single engine. */
    protected renderOneOffs(): React.ReactNode {
        const engines = this.oneOffEngines();
        if (!engines.length) {
            return undefined;
        }
        return <div className='pb-chrome-bar-oneoffs'>
            <span className='pb-chrome-bar-oneoffs-label'>{CHROME_BAR_COPY.oneOffLabel}</span>
            {engines.map((engine, index) => {
                const icon = safeIcon(engine.icon);
                const highlighted = this.highlightKey === ONE_OFF_KEY + engine.name;
                return <button
                    key={engine.name}
                    id={this.oneOffId(index)}
                    type='button'
                    className={'pb-chrome-bar-oneoff' + (highlighted ? ' is-highlighted' : '')}
                    aria-label={CHROME_BAR_COPY.searchWith(engine.name)}
                    onPointerEnter={e => this.hover.requestHover({
                        content: engine.name,
                        target: e.currentTarget,
                        position: 'top',
                        cssClasses: ['pb-chrome-bar-hover'],
                    })}
                    onMouseDown={e => e.preventDefault()}
                    onClick={e => void this.runOneOff(engine.name, e.ctrlKey || e.metaKey ? 'background' : 'current')}
                    onAuxClick={e => {
                        if (e.button === 1) {
                            void this.runOneOff(engine.name, 'background');
                        }
                    }}
                >
                    {icon
                        ? <img className='pb-chrome-bar-row-icon' src={icon} alt='' />
                        : <span className='pb-chrome-bar-row-icon codicon codicon-search' aria-hidden='true' />}
                </button>;
            })}
        </div>;
    }

    /** The DOM id of a one-off button, for the input's aria-activedescendant. */
    protected oneOffId(index: number): string {
        return `pb-chrome-bar-oneoff-${index}`;
    }

    protected onInputBlur = (e: React.FocusEvent<HTMLInputElement>): void => {
        this.pillFocused = false;
        e.currentTarget.value = this.pillText();
        this.closeDropdown();
        this.closeModesMenu();
        // Focus moving into the site panel is not an outside click; the panel closes itself on blur.
        const next = e.relatedTarget;
        if (!(next instanceof Element && next.closest('.pb-site-panel'))) {
            this.closeSitePanel();
        }
        this.update();
    };

    /**
     * Phase 31 (SITE-03, D-31-10): the pill's text. Unfocused, on a `secure`
     * page showing its committed URL, the `https://` scheme is trimmed. Focus
     * restores the full URL first, so select-all and copy act on it. Typed or
     * drafted text (not the committed URL) is never trimmed.
     */
    protected pillText(): string {
        const trim = !this.pillFocused && this.inputValue === this.committedAddress
            && /^https:\/\//i.test(this.inputValue) && this.identityState()?.state === 'secure';
        return trim ? this.inputValue.replace(/^https:\/\//i, '') : this.inputValue;
    }

    /** BAR-04: engines can change after startup (added in a stock window), so focus re-reads them. */
    protected onInputFocus = (e: React.FocusEvent<HTMLInputElement>): void => {
        // Phase 31 (SITE-03): focus shows the full URL before the press or Tab selects it.
        this.pillFocused = true;
        e.currentTarget.value = this.inputValue;
        this.update();
        void this.refreshEngines();
        // SMODE-01: focus in a local mode opens its zero-query list (or the list for the kept text).
        const local = this.localMode();
        if (local && !this.dropdownOpen) {
            this.dropdownArmed = true;
            void this.runLocalQuery(local);
        }
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
     * Re-derives the pill from a widget. BAR-12: while the pill carries an
     * uncommitted edit, focused or not, a state push only updates the
     * committed address (so a page-initiated navigation keeps the typed text,
     * and Esc's restore step shows the new address). The guard is the edit,
     * not focus: after Enter the value equals the committed text, and that is
     * exactly when chrome's canonical URL must replace it. `keepEdit` false
     * (a tab switch) always syncs.
     */
    syncAddressFromWidget(widget: Widget | undefined, keepEdit = true): void {
        // BMK-01: a navigation re-reads the star; an unchanged page reads nothing.
        this.refreshStar();
        const address = this.addressOf(widget);
        if (keepEdit && this.inputValue !== this.committedAddress) {
            this.committedAddress = address;
            return;
        }
        this.inputValue = address;
        this.committedAddress = address;
        if (this.commitFailed || this.noSearch) {
            // The failure row described the old text; it closes with it.
            this.closeDropdown();
        }
        this.commitFailed = false;
        this.update();
    }

    /**
     * Current-widget change, the address and draft half: keeps the outgoing
     * tab's draft, closes the dropdown, then brings back the new tab's draft
     * or syncs its address. ChromeBarWidget keeps the state subscription.
     */
    onCurrentWidgetChanged(widget: Widget | undefined): void {
        this.saveDraft();
        this.closeDropdown();
        // D-15: a tab change ends a picked mode.
        this.closeModesMenu();
        this.resetMode();
        // BMK-02: the editor belongs to the page it was opened on.
        this.closeBookmarkEditor(false);
        this.refreshStar();
        this.draftOwner = widget;
        const draft = widget && this.drafts.get(widget);
        if (widget && draft !== undefined) {
            // BAR-12: the tab's own typed text comes back; setting the value puts the caret at its end, focus stays put.
            this.drafts.delete(widget);
            this.committedAddress = this.addressOf(widget);
            this.inputValue = draft;
            this.commitFailed = false;
        } else {
            this.syncAddressFromWidget(widget, false);
        }
        this.update();
    }

    /**
     * BAR-12: keeps the outgoing widget's uncommitted text for its return.
     * Every commit path and Esc's restore leave the value equal to the
     * committed address, so nothing is kept for them. An instance-replaceable
     * method, so a live plant can drop drafts.
     */
    protected saveDraft(): void {
        const owner = this.draftOwner;
        if (owner && !owner.isDisposed && this.inputValue !== this.committedAddress) {
            this.drafts.set(owner, this.inputValue);
        }
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
        const top = pill ? Math.round(pill.bottom + 4) : 0;
        const style: React.CSSProperties | undefined = pill ? {
            position: 'fixed',
            top,
            left: Math.round(pill.left),
            width: Math.round(pill.width),
            // A short window caps the panel at its bottom less 8px; the panel scrolls inside.
            maxHeight: Math.max(0, Math.min(DROPDOWN_MAX_HEIGHT, window.innerHeight - top - 8)),
        } : undefined;
        return createPortal(
            <div className='pb-chrome-bar-dropdown' role='listbox' id='pb-chrome-bar-dropdown' aria-label='Suggestions' style={style}>
                {body}
            </div>,
            document.body
        );
    }

    protected dropdownBody(): React.ReactNode {
        if (this.homeFailed) {
            return <div
                role='option'
                aria-selected={true}
                className='pb-chrome-bar-row is-highlighted'
                onMouseDown={e => {
                    e.preventDefault();
                    void this.openHomeSettings();
                }}
            >
                {CHROME_BAR_COPY.homeFailed(appSubject())}
            </div>;
        }
        if (this.noSearch) {
            return <>
                <div className='pb-chrome-bar-row is-message'>{CHROME_BAR_COPY.noSearch(appSubject())}</div>
                <div className='pb-chrome-bar-dropdown-footer'>{CHROME_BAR_COPY.dropdownFooter}</div>
            </>;
        }
        if (this.pasteFailed) {
            return <>
                <div className='pb-chrome-bar-row is-message'>{CHROME_BAR_COPY.pasteFailed(appSubject())}</div>
                <div className='pb-chrome-bar-dropdown-footer'>{CHROME_BAR_COPY.dropdownFooter}</div>
            </>;
        }
        if (this.commitFailed) {
            return <>
                <div className='pb-chrome-bar-row is-message'>{CHROME_BAR_COPY.commitFailed(appSubject())}</div>
                <div className='pb-chrome-bar-dropdown-footer'>{CHROME_BAR_COPY.dropdownFooter}</div>
            </>;
        }
        return <>
            {this.localMessage !== undefined && <div className='pb-chrome-bar-row is-message'>{this.localMessage}</div>}
            {this.rows.map((row, index) => <React.Fragment key={row.key}>
                {this.renderRow(row, index)}
                {row.key === this.removeFailedKey && <div className='pb-chrome-bar-row is-message'>{CHROME_BAR_COPY.removeFailed(appSubject())}</div>}
            </React.Fragment>)}
            {this.shimmer && <div className='pb-chrome-bar-row is-shimmer' aria-hidden='true' />}
            {this.renderOneOffs()}
            <div className='pb-chrome-bar-dropdown-footer'>{this.footerText()}</div>
        </>;
    }

    /** The footer hint for the active mode. */
    protected footerText(): string {
        const local = this.localMode();
        const centre = this.commandCentre();
        return centre ? centre.footer()
            : local ? LOCAL_MODE_COPY[local.id].footer ?? CHROME_BAR_COPY.dropdownFooter
            : this.modeEngine() !== undefined ? CHROME_BAR_COPY.engineFooter : CHROME_BAR_COPY.dropdownFooter;
    }

    /** The DOM id of a row, for the input's aria-activedescendant. */
    protected rowId(index: number): string {
        return `pb-chrome-bar-row-${index}`;
    }

    /**
     * BAR-11: one single-line row -- a 16px leading icon (a cached favicon or
     * engine icon as a data:image/ URI, else a codicon), the title, the
     * caption, then the muted type marker. Titles and captions render as React
     * text nodes only (T-29-18). An open-tab row ends with the Switch to Tab
     * caption (BAR-06); choosing a row goes through chooseRow.
     */
    protected renderRow(row: Row, index: number): React.ReactNode {
        if (row.source === 'group') {
            // SMODE-05: a provider separator, a 24px caption header; the rule above it marks every group but the first.
            return <div key={row.key} id={this.rowId(index)} role='presentation'
                className={'pb-chrome-bar-row is-group' + (index > 0 ? ' has-rule' : '')}>{row.title}</div>;
        }
        const highlighted = row.key === this.highlightKey;
        const message = (row.source === 'heuristic' && (this.providerFailed || this.heuristicNoEngine)) || (row.source === 'pick' && !row.run);
        const icon = iconFor(row);
        const pick = row.source === 'pick';
        const titleLine = <>
            <div className='pb-chrome-bar-row-title' title={pick ? this.labelParser.stripIcons(row.title) : row.title}>
                {pick ? this.pickLabel(row.title) : row.title}
            </div>
            <div className='pb-chrome-bar-row-caption' title={row.caption}>{row.caption}</div>
        </>;
        return <div
            key={row.key}
            id={this.rowId(index)}
            role='option'
            aria-selected={highlighted}
            aria-disabled={row.source === 'pick' && !row.run ? true : undefined}
            className={'pb-chrome-bar-row' + (highlighted ? ' is-highlighted' : '') + (message ? ' is-message' : '') + (row.detail ? ' has-detail' : '')}
            onMouseDown={e => {
                // preventDefault keeps focus in the pill and stops a middle-button autoscroll.
                e.preventDefault();
                if (e.button === 1 || (e.button === 0 && (e.ctrlKey || e.metaKey))) {
                    void this.openRowInNewTab(row, false);
                } else if (e.button === 0) {
                    // Right-click and the side buttons choose nothing, as in Firefox.
                    void this.chooseRow(row);
                }
            }}
        >
            {this.providerFailed && row.source === 'heuristic' ? (
                <div className='pb-chrome-bar-row-title'>{CHROME_BAR_COPY.suggestionsFailed(appSubject())}</div>
            ) : message && row.source === 'heuristic' ? (
                <div className='pb-chrome-bar-row-title'>{CHROME_BAR_COPY.noSearch(appSubject())}</div>
            ) : <>
                {'image' in icon.leading
                    ? <img className='pb-chrome-bar-row-icon' src={icon.leading.image} alt='' />
                    : 'classes' in icon.leading
                        ? <span className={`pb-chrome-bar-row-icon ${icon.leading.classes}`} aria-hidden='true' />
                        : <span className={`pb-chrome-bar-row-icon codicon ${icon.leading.codicon}`} aria-hidden='true' />}
                {row.detail
                    ? <div className='pb-chrome-bar-row-lines'>
                        <div className='pb-chrome-bar-row-line'>{titleLine}</div>
                        <div className='pb-chrome-bar-row-detail' title={row.detail}>{row.detail}</div>
                    </div>
                    : titleLine}
                {icon.trailing && <span className={`pb-chrome-bar-row-type codicon ${icon.trailing}`} aria-hidden='true' />}
                {!!row.badges?.length && <span className='pb-chrome-bar-row-badges'>
                    {row.badges.map(badge => <span key={badge} className='pb-chrome-bar-row-badge'>{badge}</span>)}
                </span>}
                {row.source === 'tab' && <span className='pb-chrome-bar-row-switch'>{CHROME_BAR_COPY.switchToTab}</span>}
            </>}
        </div>;
    }

    /** SMODE-05 (T-30-03): a pick's label as $(name) codicon spans and React text nodes; never markup. */
    protected pickLabel(label: string): React.ReactNode {
        return this.labelParser.parse(label).map((part, index) => <React.Fragment key={index}>
            {typeof part === 'string' ? part : <span className={`codicon codicon-${part.name}`} aria-hidden='true' />}
        </React.Fragment>);
    }

    /** The pill and its portalled dropdown, rendered by the bar widget between Home and New Tab. */
    render(): React.ReactNode {
        const engine = this.effectiveEngine();
        const modeEngine = this.modeEngine();
        const local = this.localMode();
        const addressLabel = local ? LOCAL_MODE_COPY[local.id].label
            : modeEngine ? CHROME_BAR_COPY.searchWith(modeEngine)
                : engine ? CHROME_BAR_COPY.searchPlaceholder(engine) : CHROME_BAR_COPY.searchOrEnterAddress;
        // D-25: Command centre's placeholder is the selected provider's own, read now; its aria-label stays the mode label.
        const centre = this.commandCentre();
        const placeholder = (centre && centre.placeholder(this.rawQueryText())) || addressLabel;
        const activeIndex = this.dropdownOpen ? this.rows.findIndex(row => row.key === this.highlightKey) : -1;
        const oneOffIndex = this.dropdownOpen ? this.oneOffEngines().findIndex(engine => ONE_OFF_KEY + engine.name === this.highlightKey) : -1;
        const activeId = activeIndex >= 0 ? this.rowId(activeIndex) : oneOffIndex >= 0 ? this.oneOffId(oneOffIndex) : undefined;
        return <>
            <div
                className='pb-chrome-bar-pill'
                ref={el => { this.pillRef = el; }}
                onDragEnter={this.onPillDragOver}
                onDragOver={this.onPillDragOver}
                onDragLeave={this.onDropTargetDragLeave}
                onDrop={this.onPillDrop}
            >
                {this.renderIdentityBox()}
                {this.renderModeButton()}
                <input
                    className={CHROME_BAR_INPUT_CLASS}
                    placeholder={placeholder}
                    aria-label={addressLabel}
                    role='combobox'
                    aria-expanded={this.dropdownOpen}
                    aria-controls='pb-chrome-bar-dropdown'
                    aria-autocomplete='both'
                    aria-activedescendant={activeId}
                    spellCheck={false}
                    value={this.pillText()}
                    onChange={this.onInputChange}
                    ref={this.inputRef}
                    onKeyDown={this.onInputKeyDown}
                    onCompositionEnd={this.onCompositionEnd}
                    onMouseDown={this.onInputMouseDown}
                    onMouseUp={this.onInputMouseUp}
                    onContextMenu={this.onPillContextMenu}
                    onDragStart={() => { this.pillDragActive = true; }}
                    onDragEnd={() => { this.pillDragActive = false; }}
                    onBlur={this.onInputBlur}
                    onFocus={this.onInputFocus}
                />
                {this.renderStar()}
            </div>
            {this.renderDropdown()}
            {this.renderModesMenu()}
            {this.renderSitePanel()}
            {this.renderBookmarkEditor()}
        </>;
    }

    /**
     * Phase 31 (SITE-01/02, plan 02): the site panel, rendered by
     * `site-identity/site-panel.tsx` in the `.pb-chrome-bar-dropdown` portal
     * family (D-31-14). Esc and outside-click close it.
     */
    protected renderSitePanel(): React.ReactNode {
        if (!this.sitePanelOpen) {
            return undefined;
        }
        return <SitePanel
            info={this.sitePanelInfo}
            anchor={this.sitePanelAnchor}
            committedAddress={this.committedAddress}
            notice={this.sitePanelNotice}
            onClose={this.closeSitePanel}
            onSetPermission={(id, state) => { void this.setSitePermission(id, state); }}
            onClearSiteData={() => { void this.clearSiteDataFromPanel(); }}
            onToggleShield={except => { void this.setSiteShield(except); }}
        />;
    }

    /** Phase 33 (BMK-01): the page the star last read for ('' when none is bookmarkable). */
    protected starUrl = '';
    /** Phase 33 (BMK-01): that page's bookmark, or null; null until the read arrives (the unbookmarked form still accepts a click). */
    protected starBookmark: BookmarkEntry | null = null;
    /** Drops a read that a newer navigation or push overtook. */
    protected starSeq = 0;
    protected starRef: HTMLButtonElement | null = null;
    /**
     * Phase 33 (BMK-01): the bound Ctrl+D label from the page-shortcut table,
     * set by the relay that owns the table (this file must not import it at
     * runtime: the table's module imports this one). '' names no key.
     */
    starShortcut = '';
    /** Phase 33 (BMK-02): the open editor, or undefined. */
    protected bookmarkEditor: BookmarkEditorState | undefined;
    /** WR-03: a bookmarkPage request from the star is in flight. */
    protected bookmarkStarPending = false;

    /**
     * BMK-01: re-reads the active page's bookmark through the readBookmarkByUrl
     * point-read. Without `force` an unchanged page reads nothing; the
     * `bookmarks-changed` push forces it. The pill never reads Places itself.
     */
    protected refreshStar(force = false): void {
        const url = bookmarkablePageUrl();
        if (!force && url === this.starUrl) {
            return;
        }
        if (url !== this.starUrl) {
            this.starBookmark = null;
        }
        this.starUrl = url;
        const seq = ++this.starSeq;
        if (!url) {
            this.update();
            return;
        }
        this.store.readBookmarkByUrl(url).then(bookmark => bookmark, () => null).then(bookmark => {
            if (seq === this.starSeq) {
                this.starBookmark = bookmark;
                this.update();
            }
        });
    }

    /** The star's tooltip and accessible name: the state's copy with the bound key, or the bare heading when no key is bound. */
    protected starLabel(url: string, bookmarked: boolean): string {
        if (!url) {
            return CHROME_BAR_COPY.cantBookmark;
        }
        if (bookmarked) {
            return this.starShortcut ? CHROME_BAR_COPY.editBookmarkTip(this.starShortcut) : CHROME_BAR_COPY.editBookmarkHeading;
        }
        return this.starShortcut ? CHROME_BAR_COPY.bookmarkStarTip(this.starShortcut) : CHROME_BAR_COPY.bookmarkPageHeading;
    }

    /** BMK-01 (D-01): the star, last in the pill in every mode; disabled-not-removed when no http(s) page is on screen. */
    protected renderStar(): React.ReactNode {
        const url = bookmarkablePageUrl();
        const bookmarked = !!url && url === this.starUrl && !!this.starBookmark;
        const label = this.starLabel(url, bookmarked);
        return <button
            type='button'
            ref={el => { this.starRef = el; }}
            className={'pb-address-star' + (bookmarked ? ' is-bookmarked' : '')}
            disabled={!url}
            aria-label={label}
            aria-haspopup='dialog'
            aria-expanded={!!this.bookmarkEditor}
            // Pointer, not mouse, enter: a disabled star keeps its tooltip.
            onPointerEnter={e => this.hover.requestHover({
                content: label,
                target: e.currentTarget,
                position: 'top',
                cssClasses: ['pb-chrome-bar-hover'],
            })}
            onClick={() => void this.openBookmarkStar()}
        >
            <span className={'codicon ' + (bookmarked ? 'codicon-star-full' : 'codicon-star-empty')} aria-hidden='true' />
        </button>;
    }

    /**
     * BMK-01: the star's click, the bookmark-page command (Ctrl+D with Theia
     * focused) and the page relay's Ctrl+D all come here. An unbookmarked page
     * is bookmarked in Firefox's default folder, then the editor opens; a
     * bookmarked page opens the editor directly. A failed bookmark opens the
     * editor on its failure row, where Enter retries.
     */
    async openBookmarkStar(): Promise<void> {
        const tab = currentWebTab();
        const url = bookmarkablePageUrl(tab);
        if (!tab || !url) {
            return;
        }
        // WR-03: a held Ctrl+D or a click then a key must not send a second bookmarkPage while the first is in flight.
        if (this.bookmarkEditor || this.bookmarkStarPending) {
            return;
        }
        this.closeDropdown();
        this.closeModesMenu();
        this.closeSitePanel();
        let bookmark = url === this.starUrl ? this.starBookmark : null;
        let created = false;
        let failure: string | undefined;
        if (!bookmark) {
            this.bookmarkStarPending = true;
            try {
                bookmark = await this.store.bookmarkPage(url, tab.pageTitle);
                created = true;
            } catch {
                failure = CHROME_BAR_COPY.bookmarkSaveFailed(appSubject());
            } finally {
                this.bookmarkStarPending = false;
            }
        }
        // The tab or its page changed while chrome answered: the editor would describe the wrong page.
        if (bookmarkablePageUrl() !== url || this.bookmarkEditor) {
            return;
        }
        if (bookmark) {
            this.starUrl = url;
            this.starBookmark = bookmark;
        }
        const name = bookmark ? bookmark.title : tab.pageTitle;
        const folder = bookmark?.folder ?? '';
        this.bookmarkEditor = {
            url, guid: bookmark?.guid, created: created || !bookmark, name, initialName: name, folder, initialFolder: folder,
            failure, retry: 'save', busy: false,
        };
        this.update();
    }

    /** BMK-02: closes the editor without saving; focus returns to the star (history-menu onHide precedent). */
    protected closeBookmarkEditor = (restoreFocus = true): void => {
        if (!this.bookmarkEditor) {
            return;
        }
        this.bookmarkEditor = undefined;
        this.update();
        if (restoreFocus) {
            setTimeout(() => this.starRef?.focus());
        }
    };

    /**
     * BMK-02: Done (and Enter in the Name field). An existing bookmark sends
     * only what changed through updateBookmark; a bookmark the star could not
     * create is created now with the chosen name and folder. A refusal keeps
     * the panel and its text with the failure row.
     */
    protected async saveBookmarkEditor(): Promise<void> {
        const editor = this.bookmarkEditor;
        if (!editor || editor.busy || !editor.name.trim()) {
            return;
        }
        editor.busy = true;
        try {
            if (editor.guid) {
                const title = editor.name !== editor.initialName ? editor.name : undefined;
                const folder = editor.folder !== editor.initialFolder && editor.folder ? editor.folder : undefined;
                if (title !== undefined || folder !== undefined) {
                    await this.store.updateBookmark(editor.guid, title, folder);
                }
            } else {
                await this.store.bookmarkPage(editor.url, editor.name, editor.folder || undefined);
            }
        } catch {
            this.failBookmarkEditor(editor, 'save');
            return;
        }
        editor.busy = false;
        if (this.bookmarkEditor === editor) {
            this.closeBookmarkEditor();
        }
        this.refreshStar(true);
    }

    /** BMK-02: Remove runs at once (the panel is the confirmation) and removes the one bookmark the panel shows, by guid (WR-04); copies filed elsewhere stay. */
    protected async removeFromBookmarkEditor(): Promise<void> {
        const editor = this.bookmarkEditor;
        if (!editor || editor.busy || !editor.guid) {
            return;
        }
        editor.busy = true;
        try {
            await this.store.removeBookmark(editor.guid);
        } catch {
            this.failBookmarkEditor(editor, 'remove');
            return;
        }
        editor.busy = false;
        if (this.bookmarkEditor === editor) {
            this.closeBookmarkEditor();
        }
        this.refreshStar(true);
    }

    protected failBookmarkEditor(editor: BookmarkEditorState, retry: 'save' | 'remove'): void {
        editor.busy = false;
        editor.retry = retry;
        editor.failure = retry === 'save' ? CHROME_BAR_COPY.bookmarkSaveFailed(appSubject()) : CHROME_BAR_COPY.bookmarkRemoveFailed(appSubject());
        this.update();
    }

    /** BMK-02 (D-02): the editor, a `.pb-chrome-bar-dropdown` portal anchored under the star, never a Theia dialog. */
    protected renderBookmarkEditor(): React.ReactNode {
        const editor = this.bookmarkEditor;
        if (!editor) {
            return undefined;
        }
        // 33-UI-SPEC geometry: 4px under the pill, the panel's right edge on the star's.
        const pill = this.pillRef?.getBoundingClientRect();
        const star = this.starRef?.getBoundingClientRect();
        return <BookmarkEditor
            editor={editor}
            top={Math.round((pill?.bottom ?? 0) + 4)}
            right={Math.round(window.innerWidth - (star?.right ?? window.innerWidth))}
            onName={name => { editor.name = name; this.update(); }}
            onFolder={folder => { editor.folder = folder; this.update(); }}
            onDone={() => void this.saveBookmarkEditor()}
            onEnter={() => void (editor.failure && editor.retry === 'remove' ? this.removeFromBookmarkEditor() : this.saveBookmarkEditor())}
            onRemove={() => void this.removeFromBookmarkEditor()}
            onClose={() => this.closeBookmarkEditor()}
        />;
    }

    /** SMODE-03: a mode's label -- Address, the engine's name, or the contribution's label. */
    protected modeLabel(mode: ModeId): string {
        const engine = engineNameOf(mode);
        if (engine !== undefined) {
            return engine;
        }
        const local = this.modeProvider.getContributions().find(entry => entry.id === mode);
        return local ? local.label : CHROME_BAR_COPY.addressModeLabel;
    }

    /** SMODE-03: a mode's 16px icon -- a local mode's codicon, else the engine's icon (Address: the default engine's), else the search codicon. */
    protected modeIcon(mode: ModeId): React.ReactNode {
        const local = this.modeProvider.getContributions().find(entry => entry.id === mode);
        if (local) {
            return <span className={`pb-address-mode-icon codicon ${local.iconClass}`} aria-hidden='true' />;
        }
        const name = mode === 'address' ? this.effectiveEngine() : engineNameOf(mode);
        const engine = this.engineList ? this.engineList.engines.find(entry => entry.name === name) : undefined;
        const icon = safeIcon(engine ? engine.icon : null);
        return icon
            ? <img className='pb-address-mode-icon' src={icon} alt='' />
            : <span className='pb-address-mode-icon codicon codicon-search' aria-hidden='true' />;
    }

    /**
     * SMODE-03 (D-12, D-13): the pill's first child. Address is the icon form
     * with no label; every other mode is the chip, icon plus label. A press,
     * or Enter, Space or ArrowDown, opens the modes menu.
     */
    protected renderModeButton(): React.ReactNode {
        const label = this.modeLabel(this.mode);
        const items = this.modesOpen ? this.modeMenuItems() : [];
        const active = items.findIndex(item => item.key === this.modesHighlight);
        const button = <button
            type='button'
            className='pb-address-mode'
            aria-haspopup='menu'
            aria-expanded={this.modesOpen}
            aria-controls={this.modesOpen ? 'pb-address-modes' : undefined}
            aria-activedescendant={active >= 0 ? this.modeItemId(active) : undefined}
            aria-label={CHROME_BAR_COPY.chooseMode(label)}
            onPointerEnter={e => this.hover.requestHover({
                content: CHROME_BAR_COPY.chooseMode(label),
                target: e.currentTarget,
                position: 'bottom',
                cssClasses: ['pb-chrome-bar-hover'],
            })}
            onClick={this.onModeButtonClick}
            onKeyDown={this.onModeButtonKeyDown}
            onBlur={this.onModeButtonBlur}
        >
            {this.modeIcon(this.mode)}
            {this.mode !== 'address' && <span className='pb-address-mode-label'>{label}</span>}
            <span className='pb-address-mode-chevron codicon codicon-chevron-down' aria-hidden='true' />
        </button>;
        if (this.mode === 'address') {
            return button;
        }
        const resetLabel = CHROME_BAR_COPY.returnTo(this.modeLabel(this.defaultMode()));
        return <span className='pb-address-mode-chip'>
            {button}
            {this.mode !== this.defaultMode() && <button
                type='button'
                className='pb-address-mode-reset'
                aria-label={resetLabel}
                onPointerEnter={e => this.hover.requestHover({
                    content: resetLabel,
                    target: e.currentTarget,
                    position: 'bottom',
                    cssClasses: ['pb-chrome-bar-hover'],
                })}
                // Focus stays in the pill: the x never takes it, so the dropdown it re-opens is not closed by a blur.
                onMouseDown={e => e.preventDefault()}
                onClick={() => this.onModeReset()}
            >
                <span className='codicon codicon-close' aria-hidden='true' />
            </button>}
        </span>;
    }

    /**
     * SMODE-03 (D-14): the x returns to the default mode, keeps the text and
     * re-runs the query. A prototype method, so a live plant can replace it.
     */
    protected onModeReset(): void {
        this.resetMode({ requery: true });
        this.focusInputAtEnd();
        this.update();
    }

    /**
     * D-15: returns the pill to the PowerBrowser mode's default; `requery`
     * re-runs the query for the kept text. Every commit path, Esc's restore,
     * a tab change and a PowerBrowser-mode change call it. A prototype
     * method, so a live plant can make a picked mode stick.
     */
    protected resetMode({ requery = false }: { requery?: boolean } = {}): void {
        this.mode = this.defaultMode();
        if (requery) {
            this.requery();
        }
    }

    /** D-15: the bar reports every PowerBrowser-mode change; a change returns the pill to that mode's default. */
    uiModeChanged(id: string): void {
        if (id === this.uiMode) {
            return;
        }
        this.uiMode = id;
        this.closeModesMenu();
        this.resetMode();
        this.update();
    }

    protected onModeButtonClick = (): void => {
        if (this.modesOpen) {
            this.closeModesMenu();
        } else {
            this.openModesMenu();
        }
    };

    protected onModeButtonKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>): void => {
        if (this.modesOpen) {
            this.onModesKeyDown(e);
        } else if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
            // preventDefault: the native click that Enter and Space make would close it again.
            e.preventDefault();
            this.openModesMenu();
        }
    };

    protected onModeButtonBlur = (): void => {
        this.closeModesMenu();
    };

    /**
     * SMODE-01: the open menu's keys, from whichever element opened it.
     * ArrowUp/Down move and wrap, Home/End jump; an access letter picks the
     * one item it starts, or cycles the highlight through several; Enter (or
     * Space on the button) picks, Shift+Enter searches with an engine item
     * now; Esc closes the menu with the mode kept and focus in the input.
     */
    protected onModesKeyDown(e: React.KeyboardEvent<HTMLElement>): void {
        const items = this.modeMenuItems();
        const keys = items.map(item => item.key);
        const plain = !e.ctrlKey && !e.altKey && !e.metaKey;
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            const down = e.key === 'ArrowDown';
            this.modesHighlight = this.modesHighlight === undefined
                ? keys[down ? 0 : keys.length - 1]
                : nextHighlight(keys, this.modesHighlight, down ? 1 : -1);
        } else if (e.key === 'Home' || e.key === 'End') {
            this.modesHighlight = keys[e.key === 'Home' ? 0 : keys.length - 1];
        } else if (e.key === 'Enter' || (e.key === ' ' && e.currentTarget.tagName === 'BUTTON')) {
            e.preventDefault();
            const item = items.find(entry => entry.key === this.modesHighlight);
            if (item) {
                this.chooseModeItem(item, e.shiftKey && e.key === 'Enter' ? 'current' : 'pick');
            } else {
                this.closeModesMenu();
            }
            return;
        } else if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            this.closeModesMenu();
            this.focusInputAtEnd();
            return;
        } else if (e.key === 'Tab') {
            this.closeModesMenu();
            return;
        } else if (plain && e.key.length === 1 && e.key.trim()) {
            const letter = e.key.toLocaleLowerCase();
            const matches = items.filter(item => item.label.slice(0, 1).toLocaleLowerCase() === letter);
            if (matches.length === 1) {
                e.preventDefault();
                this.chooseModeItem(matches[0], 'pick');
                return;
            }
            if (matches.length > 1) {
                const from = matches.findIndex(item => item.key === this.modesHighlight);
                this.modesHighlight = matches[(from + 1) % matches.length].key;
            }
        } else {
            return;
        }
        e.preventDefault();
        this.update();
    }

    /** SMODE-01: opens the modes menu with the active mode's item highlighted (none in Address); the result dropdown closes. */
    protected openModesMenu(): void {
        this.closeDropdown();
        this.modesOpen = true;
        this.modesHighlight = this.mode === 'address' ? undefined : this.mode;
        this.update();
        // BAR-04: engines can change after startup, and the menu may open before the pill was ever focused.
        void this.refreshEngines();
    }

    protected closeModesMenu(): void {
        if (this.modesOpen) {
            this.modesOpen = false;
            this.modesHighlight = undefined;
            this.update();
        }
    }

    /**
     * SMODE-01 (D-07, D-08): the menu's groups in order -- the top modes, one
     * item per engine in chrome's order, the local modes, Search Settings. A
     * group with no item is left out, and with it its separator.
     */
    protected modeMenuGroups(): ModeMenuItem[][] {
        const modes = (group: 'top' | 'local'): ModeMenuItem[] => this.contributedIn(group)
            .map(mode => ({ key: mode.id, label: mode.label, icon: this.modeIcon(mode.id), mode: mode.id }));
        const engines = (this.engineList ? this.engineList.engines : []).map((engine): ModeMenuItem => {
            const mode = engineModeId(engine.name);
            return { key: mode, label: engine.name, icon: this.modeIcon(mode), mode, engine: engine.name };
        });
        const settings: ModeMenuItem = {
            key: SEARCH_SETTINGS_KEY,
            label: CHROME_BAR_COPY.searchSettings,
            icon: <span className='pb-address-mode-icon codicon codicon-settings-gear' aria-hidden='true' />,
        };
        return [modes('top'), engines, modes('local'), [settings]].filter(group => group.length > 0);
    }

    protected modeMenuItems(): ModeMenuItem[] {
        return ([] as ModeMenuItem[]).concat(...this.modeMenuGroups());
    }

    /** The DOM id of a modes-menu item, for aria-activedescendant. */
    protected modeItemId(index: number): string {
        return `pb-address-modes-item-${index}`;
    }

    /**
     * SMODE-01: a mode item enters its mode; with Shift an engine item
     * searches the text in the current tab now, with Ctrl (or a middle
     * press) in a new background tab, and the mode is not changed. Search
     * Settings opens the setting.
     */
    protected chooseModeItem(item: ModeMenuItem, how: 'pick' | 'current' | 'background'): void {
        if (!item.mode) {
            void this.openSearchSettings();
        } else if (item.engine !== undefined && how !== 'pick') {
            this.closeModesMenu();
            void this.runOneOff(item.engine, how);
        } else {
            this.pickMode(item.mode);
        }
    }

    /**
     * SMODE-01: enters `mode`. The text is kept when it differs from the
     * committed address and cleared when it is the page's own address; focus
     * returns to the input with the caret at the end, and remaining text is
     * queried again in the new mode.
     */
    protected pickMode(mode: ModeId): void {
        this.closeModesMenu();
        if (this.inputValue === this.committedAddress) {
            this.inputValue = '';
        }
        this.mode = mode;
        this.requery();
        this.focusInputAtEnd();
    }

    /**
     * SMODE-04 (D-19): Accel+Up/Down steps through cycleOrder -- Address, the
     * engines, the contributed local modes, Command centre. An open result
     * list is re-run for the current text in the new mode; a closed one stays
     * closed (Firefox re-queries only an open view). A prototype method, so a
     * live plant can replace it.
     */
    protected cycleMode(step: 1 | -1): void {
        const engines = this.engineList ? this.engineList.engines.map(engine => engine.name) : [];
        const contributed = this.modeProvider.getContributions();
        const next = nextMode(cycleOrder(engines, id => contributed.some(mode => mode.id === id)), this.mode, step);
        // D-26 (IN-03): leaving Command centre for a mode that resolves keeps the text but sends none of it.
        const open = this.dropdownOpen && !(this.commandCentre() && (MODE_SENDS[modeKindOf(next)] ?? MODE_SENDS['address']).resolve);
        this.mode = next;
        this.closeDropdown();
        if (open) {
            this.requery();
        }
        this.update();
    }

    /**
     * Re-runs the query for the pill's text in the active mode. Empty text in a
     * resolving mode closes the list (WR-03): textEdited drops the old mode's
     * rows and bumps querySeq, so a late reply cannot land either.
     */
    protected requery(): void {
        this.textEdited(this.inputValue, false);
    }

    protected focusInputAtEnd(): void {
        const input = this.pillRef?.querySelector('input');
        if (input) {
            input.focus();
            input.setSelectionRange(this.inputValue.length, this.inputValue.length);
        }
    }

    /** SMODE-01 (D-09): Search Settings opens Theia's preferences editor on the default-engine setting; no URL crosses to chrome. */
    protected openSearchSettings = async (): Promise<void> => {
        this.closeModesMenu();
        try {
            await this.commands.executeCommand(CommonCommands.OPEN_PREFERENCES.id, DEFAULT_SEARCH_ENGINE_PREFERENCE);
        } catch (error) {
            console.error('[@powerbrowser/chrome-bar] opening Search Settings failed:', error instanceof Error ? error.name : typeof error);
        }
    };

    /**
     * SMODE-01 (D-10): the modes menu, a `.pb-chrome-bar-dropdown` body portal
     * like the result dropdown, so layer rule (a) covers it with no new
     * selector. Anchored at the pill's left edge.
     */
    protected renderModesMenu(): React.ReactNode {
        if (!this.modesOpen) {
            return undefined;
        }
        const pill = this.pillRef?.getBoundingClientRect();
        const top = pill ? Math.round(pill.bottom + 4) : 0;
        const style: React.CSSProperties | undefined = pill ? {
            position: 'fixed',
            top,
            left: Math.round(pill.left),
            maxHeight: Math.max(0, Math.min(DROPDOWN_MAX_HEIGHT, window.innerHeight - top - 8)),
        } : undefined;
        let index = 0;
        return createPortal(
            <div className='pb-chrome-bar-dropdown pb-address-modes' role='menu' id='pb-address-modes' aria-label={CHROME_BAR_COPY.modesMenuLabel} style={style}>
                <div className='pb-address-modes-heading' role='presentation'>{CHROME_BAR_COPY.oneOffLabel}</div>
                {this.modeMenuGroups().map((group, groupIndex) => <React.Fragment key={group[0].key}>
                    {groupIndex !== 0 && <div className='pb-address-modes-separator' role='separator' />}
                    {group.map(item => this.renderModeItem(item, index++))}
                </React.Fragment>)}
            </div>,
            document.body
        );
    }

    /** One 32px menu item: icon, then the label with its access letter underlined. Labels render as text nodes only. */
    protected renderModeItem(item: ModeMenuItem, index: number): React.ReactNode {
        const highlighted = item.key === this.modesHighlight;
        return <div
            key={item.key}
            id={this.modeItemId(index)}
            role='menuitem'
            className={'pb-address-modes-item' + (highlighted ? ' is-highlighted' : '')}
            onMouseDown={e => {
                // preventDefault keeps focus where it is until the choice moves it.
                e.preventDefault();
                if (e.button === 1) {
                    if (item.engine !== undefined) {
                        this.chooseModeItem(item, 'background');
                    }
                } else if (e.button === 0) {
                    this.chooseModeItem(item, e.shiftKey ? 'current' : e.ctrlKey || e.metaKey ? 'background' : 'pick');
                }
            }}
        >
            {item.icon}
            <span className='pb-address-modes-label'>
                <span className='pb-address-modes-access'>{item.label.slice(0, 1)}</span>{item.label.slice(1)}
            </span>
        </div>;
    }
}

/** Phase 33 (BMK-02): the open star editor. `guid` undefined: the star's bookmark write failed, so Done creates it. */
export interface BookmarkEditorState {
    url: string;
    guid: string | undefined;
    /** The star made this bookmark just now (heading "Bookmark this page"), else "Edit bookmark". */
    created: boolean;
    name: string;
    initialName: string;
    /** 'toolbar' | 'menu' | 'unfiled', or '' (another folder, or not known). */
    folder: string;
    initialFolder: string;
    failure: string | undefined;
    /** What Enter repeats while the failure row shows. */
    retry: 'save' | 'remove';
    busy: boolean;
}

/** BMK-02: the three root folders, one level (nested folders are deferred), keyed by the names chrome resolves. */
const BOOKMARK_FOLDERS: ReadonlyArray<{ folder: string; label: () => string }> = [
    { folder: 'toolbar', label: () => CHROME_BAR_COPY.bookmarkFolderToolbar },
    { folder: 'menu', label: () => CHROME_BAR_COPY.bookmarkFolderMenu },
    { folder: 'unfiled', label: () => CHROME_BAR_COPY.bookmarkFolderOther },
];

interface BookmarkEditorProps {
    editor: BookmarkEditorState;
    top: number;
    right: number;
    onName(name: string): void;
    onFolder(folder: string): void;
    onDone(): void;
    onEnter(): void;
    onRemove(): void;
    onClose(): void;
}

/**
 * BMK-02: the editor body. Calls back only: the store writes stay in the
 * AddressBar handlers (rule 12). The name renders as an input value, never
 * markup (T-33-01b). Enter is Done (or the failed action's retry), Esc and
 * focus leaving the panel close it without saving.
 */
function BookmarkEditor(props: BookmarkEditorProps): React.ReactElement {
    const { editor, top, right, onName, onFolder, onDone, onEnter, onRemove, onClose } = props;
    const nameRef = React.useRef<HTMLInputElement>(null);
    // Mount only: a re-render (each keystroke) must not reselect the text.
    React.useEffect(() => {
        nameRef.current?.focus();
        nameRef.current?.select();
    }, []);
    const heading = editor.created ? CHROME_BAR_COPY.bookmarkPageHeading : CHROME_BAR_COPY.editBookmarkHeading;
    return createPortal(
        <div
            className='pb-chrome-bar-dropdown pb-bookmark-editor'
            role='dialog'
            aria-label={heading}
            tabIndex={-1}
            style={{ position: 'fixed', top, right, maxHeight: Math.max(0, Math.min(DROPDOWN_MAX_HEIGHT, window.innerHeight - top - 8)) }}
            onKeyDown={e => {
                if (e.key === 'Escape') {
                    e.stopPropagation();
                    e.preventDefault();
                    onClose();
                } else if (e.key === 'Enter' && !(e.target instanceof HTMLButtonElement)) {
                    e.preventDefault();
                    onEnter();
                }
            }}
            onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) { onClose(); } }}
        >
            <div className='pb-bookmark-editor-heading'>{heading}</div>
            {editor.failure && <div className='pb-bookmark-editor-failure' role='alert'>{editor.failure}</div>}
            <label className='pb-bookmark-editor-field'>
                <span className='pb-bookmark-editor-label'>{CHROME_BAR_COPY.bookmarkName}</span>
                <input
                    ref={nameRef}
                    className='pb-bookmark-editor-name'
                    spellCheck={false}
                    maxLength={512}
                    value={editor.name}
                    onChange={e => onName(e.currentTarget.value)}
                />
            </label>
            <div className='pb-bookmark-editor-folders' role='radiogroup' aria-label={CHROME_BAR_COPY.bookmarkFolder}>
                <span className='pb-bookmark-editor-label'>{CHROME_BAR_COPY.bookmarkFolder}</span>
                {BOOKMARK_FOLDERS.map(({ folder, label }) => <label key={folder} className='pb-bookmark-editor-folder'>
                    <input type='radio' name='pb-bookmark-folder' checked={editor.folder === folder} onChange={() => onFolder(folder)} />
                    <span>{label()}</span>
                </label>)}
            </div>
            <div className='pb-bookmark-editor-footer'>
                <button type='button' className='pb-bookmark-editor-remove' disabled={!editor.guid || editor.busy} onClick={onRemove}>
                    {CHROME_BAR_COPY.removeBookmark}
                </button>
                <span className='pb-bookmark-editor-spacer' />
                <button type='button' className='pb-bookmark-editor-button' onClick={onClose}>{CHROME_BAR_COPY.bookmarkCancel}</button>
                <button type='button' className='pb-bookmark-editor-button is-primary' disabled={!editor.name.trim() || editor.busy} onClick={onDone}>
                    {CHROME_BAR_COPY.bookmarkDone}
                </button>
            </div>
        </div>,
        document.body
    );
}
