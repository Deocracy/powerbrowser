import { injectable, inject } from '@theia/core/shared/inversify';
import { ApplicationShell, OpenHandler, OpenerOptions, WidgetManager } from '@theia/core/lib/browser';
import URI from '@theia/core/lib/common/uri';
import { OutputContribution } from '@theia/output/lib/browser/output-contribution';
import { OutputChannelManager } from '@theia/output/lib/browser/output-channel';
import { OutputUri } from '@theia/output/lib/common/output-uri';
import { OutputWidget } from '@theia/output/lib/browser/output-widget';
import { VSCodeExtensionUri } from '@theia/plugin-ext-vscode/lib/common/plugin-vscode-uri';
import { VSXExtensionEditor } from '@theia/vsx-registry/lib/browser/vsx-extension-editor';
import { WebviewWidget, WebviewWidgetIdentifier } from '@theia/plugin-ext/lib/main/browser/webview/webview';

/**
 * Same D-39/D-40 lenient-parse rule `TabUriRegistry.parseName` implements,
 * duplicated as a tiny pure function rather than importing `TabUriRegistry`
 * here -- that class already imports this module's reverse-lookup helpers
 * (`extensionDetailUriOf`, `webviewUriOf`), and importing it back would be
 * a circular module dependency for one one-line helper.
 */
function parseName(uri: URI): string {
    if (uri.authority) {
        return uri.authority;
    }
    const raw = uri.path.toString();
    return raw.startsWith('/') ? raw.slice(1) : raw;
}

/** Reverse-lookup helper for the extension detail editor's widget-manager
 * construction options -- `WidgetManager.getDescription` reconstructs the
 * exact `{id, version}` `VSCodeExtensionUri.toId` produced, so this is a
 * pure, total function of it (D-46's own dedup key, reused rather than
 * reimplemented). */
export function extensionDetailUriOf(factoryId: string, options: unknown): URI | undefined {
    if (factoryId !== VSXExtensionEditor.ID) {
        return undefined;
    }
    const { id, version } = (options as { id?: string, version?: string } | undefined) ?? {};
    return id ? VSCodeExtensionUri.fromId(id, version) : undefined;
}

/** Reverse-lookup helper for a plugin-contributed webview panel.
 * `WebviewWidgetIdentifier` (`{id, viewId}`) IS the panel's construction
 * options verbatim (`webviews-main.ts`:
 * `getOrCreateWidget(WebviewWidget.FACTORY_ID, {id: panelId, viewId: viewType})`),
 * so no separate lookup table is needed -- same reasoning as the
 * plugin-view-container row in view-factory-table.ts. Session-scoped only
 * (D-51 carve-out 4): a panel id is minted per `createWebviewPanel` call by
 * the plugin host, so this address is meaningful only while the widget it
 * names is still cached in this session's `WidgetManager`. */
export function webviewUriOf(factoryId: string, options: unknown): URI | undefined {
    if (factoryId !== WebviewWidget.FACTORY_ID) {
        return undefined;
    }
    const { id, viewId } = (options as Partial<WebviewWidgetIdentifier> | undefined) ?? {};
    return id ? new URI(`webview:${viewId ?? ''}/${id}`) : undefined;
}

/**
 * `OutputUri.channelName`'s own slicing (`toString(true).slice('output:/'.length)`)
 * assumes the canonical `output:/<name>` form vscode-uri produces for a
 * URI built via `URI.parse(x).with({ scheme })` (verified: a bare
 * `URI.from({ scheme, path })` does NOT get the leading slash, only the
 * parse-then-retarget-scheme path does) -- brittle against any other
 * scheme:path-shaped `output:` URI a caller might construct by hand.
 * Reuses D-39/D-40's lenient-parse rule instead (same as `parseName`
 * above), which tolerates both forms. The parsed path is already
 * percent-decoded, which undoes `OutputUri.create`'s own
 * `encodeURIComponent`; a second decode would throw on a name containing `%`.
 */
function outputChannelNameOf(uri: URI): string {
    return parseName(uri);
}

function parseWebviewPath(path: string): WebviewWidgetIdentifier {
    const slash = path.indexOf('/');
    if (slash === -1) {
        // No view type recorded -- a degenerate identity. WR-03: a real
        // webview panel is always constructed with both `id` and `viewId`
        // populated (`webviews-main.ts`:
        // `getOrCreateWidget(WebviewWidget.FACTORY_ID, {id, viewId})`), so
        // `{id}` alone would serialize to a different `options` object
        // under `WidgetManager`'s dedup key than any real panel's whenever
        // that panel has a non-empty `viewId` -- silently minting a second,
        // empty widget under the same apparent id instead of resolving to
        // the one meant. `PowerBrowserWebviewOpenHandler.open()` below never
        // passes this shape straight to `getOrCreateWidget`; it looks up an
        // already-cached widget by `id` alone first and throws if none is
        // found, rather than treating an under-specified address as valid.
        return { id: path };
    }
    return { viewId: path.slice(0, slash), id: path.slice(slash + 1) };
}

/**
 * D-51 carve-out 1 fix. `@theia/output`'s own `OutputContribution.open()`
 * (priority 200) validates the `output:` scheme and then discards the
 * channel -- **found live**: opening `output:B` after `output:A` left
 * `OutputChannelManager.selectedChannel` on `A`, because `open()` only
 * calls `this.openView(options)`, never reading `uri`'s channel at all.
 * This handler (priority 1000, clears the in-tree bidder per D-45's rule)
 * selects the channel first, then delegates the actual reveal to the
 * already-bound `OutputContribution` for its correct panel placement --
 * D-46's "Theia supplies ... correct panel placement", reused rather than
 * reimplemented. `OutputContribution`'s own `onChannelWasShown` listener
 * (tied to channel *visibility*, not *selection*) never re-fires from a
 * plain `selectedChannel =` assignment, so this cannot loop.
 */
@injectable()
export class PowerBrowserOutputOpenHandler implements OpenHandler {

    readonly id = 'powerbrowser.output-uri-open-handler';

    @inject(OutputChannelManager)
    protected readonly outputChannelManager: OutputChannelManager;

    @inject(OutputContribution)
    protected readonly outputContribution: OutputContribution;

    canHandle(uri: URI): number {
        return OutputUri.is(uri) ? 1000 : 0;
    }

    async open(uri: URI, options?: OpenerOptions): Promise<OutputWidget> {
        this.outputChannelManager.selectedChannel = this.outputChannelManager.getChannel(outputChannelNameOf(uri));
        return this.outputContribution.open(uri, options);
    }
}

/**
 * D-43's session-scoped fourth scheme. A bare `OpenHandler` -- `webview:`
 * addresses a single fixed widget per panel, so `WidgetManager`'s own dedup
 * (keyed on `{id, viewId}`, identical to the plugin host's own creation
 * call) is enough; no extra restore machinery is added (the plan's own
 * prohibition on session-restore machinery for webview panels). Within the
 * session that created it, `getOrCreateWidget` is a cache hit against the
 * real, plugin-populated widget. Across a restart, with no
 * `WebviewPanelSerializer`, it is a cache miss that creates a fresh, empty
 * iframe widget under the same identity -- the documented "restores a
 * blank panel" degradation (D-51 carve-out 4), not engineered around here.
 */
@injectable()
export class PowerBrowserWebviewOpenHandler implements OpenHandler {

    readonly id = 'powerbrowser.webview-uri-open-handler';

    @inject(WidgetManager)
    protected readonly widgetManager: WidgetManager;

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    canHandle(uri: URI): number {
        return uri.scheme === 'webview' ? 1000 : 0;
    }

    async open(uri: URI): Promise<WebviewWidget> {
        const identifier = parseWebviewPath(parseName(uri));
        // WR-03: a bare `webview:<id>` (no `/viewId`) must resolve to an
        // already-cached panel by `id` alone, never fall through to
        // `getOrCreateWidget` with a `{id}`-only options object -- that
        // shape never matches a real panel's `{id, viewId}` construction
        // options under the dedup key, so it would silently create a
        // second, empty widget instead of the one meant.
        const widget = identifier.viewId === undefined
            ? this.findExistingById(identifier.id)
            : await this.widgetManager.getOrCreateWidget<WebviewWidget>(WebviewWidget.FACTORY_ID, identifier);
        if (!widget) {
            throw new Error(
                `powerbrowser.webview-uri-open-handler: no open webview panel with id '${identifier.id}' -- ` +
                'a bare webview:<id> address must name an already-open panel; copy the full ' +
                'webview:<viewType>/<id> address out of the registry instead of typing one from memory'
            );
        }
        if (!widget.isAttached) {
            this.shell.addWidget(widget, { area: 'main' });
        }
        await this.shell.activateWidget(widget.id);
        return widget;
    }

    protected findExistingById(id: string): WebviewWidget | undefined {
        return this.widgetManager.getWidgets(WebviewWidget.FACTORY_ID).find(widget => {
            const options = this.widgetManager.getDescription(widget)?.options as Partial<WebviewWidgetIdentifier> | undefined;
            return options?.id === id;
        }) as WebviewWidget | undefined;
    }
}

/**
 * URI-04's four unavoidable carve-outs (D-51), named once here so
 * `docs/URI-SCHEMES.md` (Task 3) and `scripts/verify-uri-roundtrip.mjs`
 * (Plan 02) can be checked against identical wording rather than drifting
 * copies. Never engineered around -- each is a documented degradation.
 */
export const CARVE_OUTS: ReadonlyArray<{ readonly name: string, readonly reason: string }> = Object.freeze([
    {
        name: 'output',
        reason: "@theia/output's widget is a singleton whose content swaps per channel -- output:A and output:B resolve to the same tab (factory id 'outputView').",
    },
    {
        name: 'editor-preview',
        reason: "@theia/editor-preview swaps the document a tab shows without user navigation, so a tab's resource URI mutates in place -- not mechanically probable without a live preview-triggering navigation.",
    },
    {
        name: 'vscode-notebook-cell',
        reason: "notebook's vscode-notebook-cell: handler is a registered scheme that opens no tab and returns undefined.",
    },
    {
        name: 'webview',
        reason: 'webview: addresses only round-trip within a session -- panel ids are minted per createWebviewPanel call by the plugin host, so without a live plugin-contributed panel this cannot be probed mechanically.',
    },
]);

/**
 * `preference:` (D-43) needs no code here at all: `preference-open-handler.ts`
 * already claims the scheme at priority 500, and this phase adds only a
 * documentation entry (Task 3) -- registering a competing handler, or
 * reimplementing preference navigation, is explicitly out of scope. The
 * only thing worth asserting is the negative: no `@powerbrowser` handler's
 * `canHandle` claims it (verified live against `ViewUriOpenHandler`,
 * `TerminalUriOpenHandler`, `PowerBrowserOutputOpenHandler` and
 * `PowerBrowserWebviewOpenHandler` -- all scheme-gated, none match `preference`).
 */
