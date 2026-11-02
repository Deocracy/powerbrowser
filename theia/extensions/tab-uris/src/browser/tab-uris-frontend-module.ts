import { ContainerModule } from '@theia/core/shared/inversify';
import { FrontendApplicationContribution, OpenHandler, OpenerService, WidgetFactory, WidgetManager } from '@theia/core/lib/browser';
import { CommandContribution, Disposable } from '@theia/core/lib/common';
import { ChatViewWidget } from '@theia/ai-chat-ui/lib/browser/chat-view-widget';
import { TerminalFrontendContribution } from '@theia/terminal/lib/browser/terminal-frontend-contribution';
import { TerminalWidget } from '@theia/terminal/lib/browser/base/terminal-widget';
import { TabUriRegistry } from './tab-uri-registry';
import { ViewUriOpenHandler } from './view-open-handler';
import { PowerBrowserTerminalFrontendContribution, PowerBrowserTerminalWidget } from './terminal-naming-contribution';
import { TerminalUriOpenHandler } from './terminal-open-handler';
import { PowerBrowserOutputOpenHandler, PowerBrowserWebviewOpenHandler } from './existing-scheme-coverage';
import { BrowserWindowCommandContribution } from './browser-window-command';
import { UpdateClientContribution } from './update-client';
import { WEB_TAB_FACTORY_ID, WebTabActivationContribution, WebTabChannel, WebTabOpenHandler, WebTabOptions, WebTabWidget, isCurrentSessionTabId } from './web-tab';
import { LocalStorageService } from '@theia/core/lib/browser/storage-service';
import { ProfileStorageService, ShellStateFlushContribution } from './profile-storage';
import { WebviewEnvironment } from '@theia/plugin-ext/lib/main/browser/webview/webview-environment';
import { WebviewLoopbackEnvironment } from './webview-loopback-environment';

/**
 * Registers an `OpenHandler` after the app's first `OpenerService.open()`
 * call, when a static `bind(OpenHandler)` would be permanently invisible:
 * `ContributionProvider.getContributions()` caches its array on first call
 * and drops its container reference (D-50). Exported for anything that
 * must register a `view:`/`settings:`-adjacent handler at runtime,
 * including a user's privileged `customize.js` (D-67's `container` on the
 * privileged-JS surface).
 */
export function registerLateOpenHandler(openerService: OpenerService, handler: OpenHandler): Disposable {
    if (!openerService.addHandler) {
        throw new Error('@powerbrowser/tab-uris: OpenerService.addHandler is not available on this OpenerService implementation');
    }
    return openerService.addHandler(handler);
}

export default new ContainerModule((bind, _unbind, isBound, rebind) => {
    bind(TabUriRegistry).toSelf().inSingletonScope();

    // Registered as a static open-handler binding at module load -- the
    // ordinary path, reached by `DefaultOpenerService`'s
    // `ContributionProvider<OpenHandler>` before its first `getContributions()`
    // call caches. `registerLateOpenHandler` above is the escape hatch for
    // anything binding after that point.
    bind(ViewUriOpenHandler).toSelf().inSingletonScope();
    bind(OpenHandler).toService(ViewUriOpenHandler);

    // D-47: guarded rebind -- the in-tree idiom (see @powerbrowser/branding's
    // own rebinds), keeps this module loadable even in a container where
    // @theia/terminal's own binding is somehow absent. Every terminal
    // binding in @theia/terminal is `.toService(TerminalFrontendContribution)`
    // (TerminalService, CommandContribution, MenuContribution,
    // KeybindingContribution, TabBarToolbarContribution, ColorContribution,
    // FrontendApplicationContribution -- verified against
    // terminal-frontend-module.ts's own binding block, broader than
    // CONTEXT.md's own summary of it), so this one rebind reaches all of
    // them.
    if (isBound(TerminalFrontendContribution)) {
        rebind(TerminalFrontendContribution).to(PowerBrowserTerminalFrontendContribution).inSingletonScope();
    } else {
        bind(TerminalFrontendContribution).to(PowerBrowserTerminalFrontendContribution).inSingletonScope();
    }
    // D-38: Terminal is the one widget type with a real `Navigatable`
    // implementation -- rebinding the `TerminalWidget` DI token (not a
    // subclass of the `terminal` WidgetFactory's own `createWidget`, which
    // stays untouched) means every terminal, regardless of which code path
    // created it, resolves through `PowerBrowserTerminalWidget`.
    if (isBound(TerminalWidget)) {
        rebind(TerminalWidget).to(PowerBrowserTerminalWidget).inTransientScope();
    } else {
        bind(TerminalWidget).to(PowerBrowserTerminalWidget).inTransientScope();
    }

    bind(TerminalUriOpenHandler).toSelf().inSingletonScope();
    bind(OpenHandler).toService(TerminalUriOpenHandler);

    // D-51 carve-out 1 fix (existing-scheme-coverage.ts's own header has
    // the full story): @theia/output's own OutputContribution.open()
    // discards the URI's channel, found live. Priority 1000 clears its
    // 200 and delegates the actual reveal to it once the channel is
    // selected.
    bind(PowerBrowserOutputOpenHandler).toSelf().inSingletonScope();
    bind(OpenHandler).toService(PowerBrowserOutputOpenHandler);

    // D-43's session-scoped fourth scheme -- reuses WidgetManager's own
    // dedup, no restore machinery added (D-51 carve-out 4).
    bind(PowerBrowserWebviewOpenHandler).toSelf().inSingletonScope();
    bind(OpenHandler).toService(PowerBrowserWebviewOpenHandler);

    // GUI-02 (14.1-01): in-shell web tabs. The channel is one per frontend
    // (one state listener routing chrome pushes by tabId); the widget is
    // transient so every `getOrCreateWidget` call with fresh options mints
    // a fresh placeholder; the factory is what WidgetManager keys the
    // {factoryId, options} dedup on. The open handler is bound statically
    // at module load for the same D-50 reason as every handler above --
    // and it is what makes `OpenerService.open(https URI)` land in a web
    // tab rather than in stock HttpOpenHandler's external OS window.
    bind(WebTabChannel).toSelf().inSingletonScope();
    bind(WebTabWidget).toSelf().inTransientScope();
    bind(WidgetFactory).toDynamicValue(ctx => ({
        id: WEB_TAB_FACTORY_ID,
        createWidget: (options: WebTabOptions) => {
            // G-14.1.1-5: the single construction seam, so the single place a
            // web tab from a persisted layout can be refused. The stock
            // ShellLayoutRestorer describes every widget that has a
            // WidgetManager description -- StatefulWidget or not -- and
            // re-creates it here; its own `convertToWidget` catch logs a
            // warning and drops the widget, which is exactly the contracted
            // "no web tabs at startup". Throwing is therefore the supported
            // opt-out and needs zero Theia-core edits. The message is an
            // internal diagnostic that only reaches that log, never a user
            // surface.
            if (!isCurrentSessionTabId(options.id)) {
                throw new Error(`@powerbrowser/tab-uris: refusing to construct a web tab for '${options.id}', which was not minted by this frontend session`);
            }
            const widget = ctx.container.get(WebTabWidget);
            widget.init(options);
            return widget;
        },
    })).inSingletonScope();
    bind(WebTabOpenHandler).toSelf().inSingletonScope();
    bind(OpenHandler).toService(WebTabOpenHandler);
    // Phase 36 (PROMPT-05): subscribes the adopt pushes at startup, before any page can open a window.
    bind(FrontendApplicationContribution).toService(WebTabOpenHandler);
    bind(WebTabActivationContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(WebTabActivationContribution);

    // GUI-01 (01-05): the palette-reachable "Open Browser Window" command.
    // Bound statically at module load for the same reason the open-handler
    // bindings above are: `ContributionProvider.getContributions()` caches its
    // array on first call and drops its container reference (D-50), so a
    // `CommandContribution` bound after the command registry's first
    // enumeration is permanently invisible -- including to the command palette,
    // which is this command's ONLY affordance.
    bind(BrowserWindowCommandContribution).toSelf().inSingletonScope();
    bind(CommandContribution).toService(BrowserWindowCommandContribution);

    // UPD-20/21/22/23 (46-02): the in-app-update experience. Bound statically
    // at module load for the same D-50 reason as the command above: the two
    // palette commands' ONLY affordance is the palette, and the appUpdate push
    // listener must exist before chrome's first push.
    bind(UpdateClientContribution).toSelf().inSingletonScope();
    bind(CommandContribution).toService(UpdateClientContribution);
    bind(FrontendApplicationContribution).toService(UpdateClientContribution);

    // D-27: the AI chat widget must never escape into a secondary window
    // -- the future unified tab strip has no way to model a chrome-owned
    // tab living outside the shell it tracks. Lives here rather than in
    // @powerbrowser/branding because it is a tab-model constraint, not a
    // branding one.
    //
    // Implemented via `WidgetManager.onDidCreateWidget` rather than a
    // `rebind(ChatViewWidget)` subclass: `ChatViewWidget`'s constructor
    // takes seven injected parameters with no property-injection
    // equivalent, so a subclass rebind would have to re-declare and
    // forward all seven, silently drifting from upstream on the next
    // Theia version bump. `isExtractable` is a plain mutable field (not
    // `readonly`, not behind a getter), so setting it directly on the
    // just-created instance is the smaller, more robust surface for the
    // identical outcome -- no `rebind(ApplicationShell)`, no Navigatable,
    // no shell-hiding, none of this plan's other prohibitions touched.
    bind(FrontendApplicationContribution).toDynamicValue(ctx => ({
        onStart: () => {
            const widgetManager = ctx.container.get(WidgetManager);
            const markNonExtractable = (widget: unknown) => {
                if (widget instanceof ChatViewWidget) {
                    widget.isExtractable = false;
                }
            };
            // Covers both orderings relative to whichever
            // FrontendApplicationContribution creates the chat widget
            // first: a pre-existing widget (found live -- another AI
            // contribution's own `onStart` can create it before this one
            // runs, and `onDidCreateWidget` only fires once, on first
            // creation, so subscribing afterward misses that event) is
            // fixed immediately; any future creation is caught by the
            // subscription below.
            widgetManager.getWidgets(ChatViewWidget.ID).forEach(markNonExtractable);
            widgetManager.onDidCreateWidget(({ factoryId, widget }) => {
                if (factoryId === ChatViewWidget.ID) {
                    markNonExtractable(widget);
                }
            });
        },
    })).inSingletonScope();

    // NG-033: Theia's storage lives in the browser profile, not in the
    // per-launch frontend origin's localStorage (profile-storage.ts header).
    // A guarded rebind, the in-tree idiom (D-47), of LocalStorageService, not
    // StorageService: StorageService stays @theia/workspace's
    // WorkspaceStorageService, which prefixes each key with the workspace and
    // writes through LocalStorageService (ruling F8), so ShellLayoutRestorer's
    // perspective layouts and ModeService reach the profile store per workspace.
    bind(ProfileStorageService).toSelf().inSingletonScope();
    if (isBound(LocalStorageService)) {
        rebind(LocalStorageService).toService(ProfileStorageService);
    } else {
        bind(LocalStorageService).toService(ProfileStorageService);
    }
    bind(ShellStateFlushContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(ShellStateFlushContribution);
    // Plan 38-07: webview origins on <uuid>.webview.localhost:<port>, which Gecko resolves to loopback.
    rebind(WebviewEnvironment).to(WebviewLoopbackEnvironment).inSingletonScope();
});
