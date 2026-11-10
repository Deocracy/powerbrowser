import { injectable, inject, named } from '@theia/core/shared/inversify';
import {
    AbstractViewContribution, ViewContainerIdentifier, Widget, WidgetManager
} from '@theia/core/lib/browser';
import { CommandContribution, ContributionProvider } from '@theia/core';
import URI from '@theia/core/lib/common/uri';
import { TerminalWidgetFactoryOptions, TERMINAL_WIDGET_FACTORY_ID } from '@theia/terminal/lib/browser/terminal-widget-impl';
import { OutputChannelManager } from '@theia/output/lib/browser/output-channel';
import { OutputUri } from '@theia/output/lib/common/output-uri';
import { OutputWidget } from '@theia/output/lib/browser/output-widget';
import {
    PLUGIN_VIEW_CONTAINER_FACTORY_ID, SETTINGS_WIDGET_FACTORY_ID, POWERBROWSER_VIEW_FACTORY_IDS
} from './view-factory-table';
import { extensionDetailUriOf, webviewUriOf } from './existing-scheme-coverage';
import { orcaPaneUriOf } from './orca-scheme-coverage';
import { WEB_TAB_FACTORY_ID, WebTabWidget } from './web-tab';

/**
 * The `factoryId <-> URI` registry (D-38). Its exported shape is the
 * public interface `@powerbrowser/browser-bridge` consumes post-4.0 -- treat
 * it as an API, not an implementation detail.
 *
 * Resolution (URI -> target) discovers its targets at runtime rather than
 * hard-coding twenty imports: `bindViewContribution` binds every
 * `AbstractViewContribution` as a `CommandContribution` too, so filtering
 * that provider's contributions to `AbstractViewContribution` instances and
 * indexing them by `effectiveWidgetId` reaches all of them for free,
 * including plugin-contributed and future views this phase never names.
 * `view-factory-table.ts`'s static list is a *coverage contract*,
 * cross-checked against this discovery on first use -- never itself the
 * lookup mechanism (see that file's header for the full reasoning).
 */
@injectable()
export class TabUriRegistry {

    @inject(ContributionProvider) @named(CommandContribution)
    protected readonly commandContributionProvider: ContributionProvider<CommandContribution>;

    @inject(WidgetManager)
    protected readonly widgetManager: WidgetManager;

    @inject(OutputChannelManager)
    protected readonly outputChannelManager: OutputChannelManager;

    private _index: Map<string, AbstractViewContribution<Widget>> | undefined;

    // Resolved lazily, never during container-module load:
    // `ContributionProvider.getContributions()` caches its array on first
    // call and drops its container reference, so an early call here would
    // freeze an incomplete set before every extension has bound its own
    // view contribution.
    protected get index(): Map<string, AbstractViewContribution<Widget>> {
        if (!this._index) {
            const index = new Map<string, AbstractViewContribution<Widget>>();
            for (const contribution of this.commandContributionProvider.getContributions()) {
                if (contribution instanceof AbstractViewContribution) {
                    index.set(contribution.effectiveWidgetId, contribution as AbstractViewContribution<Widget>);
                }
            }
            // The cross-check that converts a mis-transcribed table string
            // from a silent no-op -- a `view:` URI that quietly does
            // nothing at exactly the moment a human types it -- into a
            // startup complaint (D-46's sibling hazard for the table
            // itself, not just the options fork).
            for (const row of POWERBROWSER_VIEW_FACTORY_IDS) {
                if (!index.has(row.factoryId)) {
                    console.error(
                        `[@powerbrowser/tab-uris] view-factory-table.ts names '${row.factoryId}', but no ` +
                        'AbstractViewContribution is registered under that id -- a view was renamed, ' +
                        'removed, or never bound.'
                    );
                }
            }
            this._index = index;
        }
        return this._index;
    }

    /** The `AbstractViewContribution` a `view:`/`settings:` name resolves to, or `undefined`. */
    getViewContribution(name: string): AbstractViewContribution<Widget> | undefined {
        return this.index.get(name);
    }

    /**
     * Parses `scheme:x`, `scheme:/x`, `scheme:///x` and `scheme://x` to the
     * identical name (D-39/D-40). Reads `uri.authority` directly (never
     * `uri.toString()`): the authority form lower-cases its authority only
     * on *serialization*, and Theia's widget ids are not uniformly
     * lowercase, so two typeable spellings of one address would otherwise
     * fork into two widgets.
     */
    parseName(uri: URI): string {
        if (uri.authority) {
            return uri.authority;
        }
        const raw = uri.path.toString();
        return raw.startsWith('/') ? raw.slice(1) : raw;
    }

    /**
     * A pure, canonical, total function of a parsed `view:` name to the
     * `options` argument the widget manager expects. Returns `undefined`
     * -- never `{}` -- for every factory with no path payload (D-46): an
     * absent `options` key and an explicit `undefined` serialize
     * identically under `WidgetManager`'s `stableJsonStringify`; an empty
     * object does not, and passing one where the native/menu path passes
     * nothing silently forks the widget.
     */
    createWidgetOptions(name: string): ViewContainerIdentifier | undefined {
        if (name.startsWith(PLUGIN_VIEW_CONTAINER_FACTORY_ID + ':')) {
            return { id: name, progressLocationId: name.substring(PLUGIN_VIEW_CONTAINER_FACTORY_ID.length + 1) };
        }
        return undefined;
    }

    /**
     * The widget -> URI direction. Reads `WidgetManager.getDescription`,
     * the only reliable source of the `{factoryId, options}` a widget was
     * actually created with -- never walks the shell's widgets guessing at
     * id schemes, and never adds a `getResourceUri` to any widget (that
     * would light up Save-As through the saveable-service gate). Returns
     * `undefined` for a widget this registry does not own, rather than a
     * guessed address.
     */
    uriOf(widget: Widget): URI | undefined {
        const description = this.widgetManager.getDescription(widget);
        if (!description) {
            return undefined;
        }
        const { factoryId } = description;
        if (factoryId === SETTINGS_WIDGET_FACTORY_ID) {
            // Settings is addressed through the bespoke `settings:` scheme,
            // never `view:` -- D-38/D-44.
            return new URI('settings:');
        }
        if (factoryId === TERMINAL_WIDGET_FACTORY_ID) {
            // `description.options` is the exact object the widget was
            // constructed with (WidgetManager.getDescription reconstructs
            // it from the dedup key, not from the widget's own injected
            // fields) -- `terminalIdentityOptions` (terminal-naming-
            // contribution.ts) always sets `created` to the same name as
            // `id`/`title`, so this is the widget's typeable `terminal:`
            // address (D-47).
            const options = description.options as Partial<TerminalWidgetFactoryOptions> | undefined;
            const name = options?.created ?? widget.id;
            return new URI('terminal:' + name);
        }
        if (factoryId === OutputWidget.ID) {
            // D-51 carve-out 1: the output widget is a singleton with no
            // per-channel construction options (its own WidgetFactory
            // takes none) -- the address has to come from the *active*
            // channel, not from `description.options`. `undefined` here
            // means no channel has ever been shown, which cannot happen
            // for an already-existing widget the tab bar could call this
            // on.
            const channel = this.outputChannelManager.selectedChannel;
            return channel ? OutputUri.create(channel.name) : undefined;
        }
        const extensionDetailUri = extensionDetailUriOf(factoryId, description.options);
        if (extensionDetailUri) {
            return extensionDetailUri;
        }
        const webviewUri = webviewUriOf(factoryId, description.options);
        if (webviewUri) {
            return webviewUri;
        }
        const orcaPaneUri = orcaPaneUriOf(factoryId, description.options);
        if (orcaPaneUri) {
            return orcaPaneUri;
        }
        if (factoryId === WEB_TAB_FACTORY_ID) {
            // GUI-02 (14.1-02): a web tab's address is the widget's LIVE page
            // URL. A navigated tab has moved on from `description.options.url`
            // (getDescription reconstructs that object from the dedup key, so
            // it is the URL the tab was OPENED on, never the one it shows).
            // The per-session counter stays in the options and out of the URI
            // (docs/URI-SCHEMES.md general rule 4).
            return new URI((widget as WebTabWidget).url);
        }
        if (factoryId === PLUGIN_VIEW_CONTAINER_FACTORY_ID) {
            // The widget's own `.id` already equals the full `view:` path
            // -- see view-factory-table.ts's PLUGIN_VIEW_CONTAINER_FACTORY_ID note.
            return new URI('view:' + widget.id);
        }
        if (this.index.has(factoryId)) {
            return new URI('view:' + factoryId);
        }
        return undefined;
    }
}
