/**
 * GUI-06 (13-02 foundation, 13-03 presentation): frontend composition for
 * the chrome bar.
 *
 * Binds the suggestion interface to a websocket proxy on the existing
 * authenticated channel -- the mirror of the backend's connection handler
 * at the same `CHROME_SUGGESTION_PATH`, so no new transport exists to
 * review. Static at module load (D-50): a contribution bound after first
 * enumeration is permanently invisible, and the same holds for a proxy the
 * widget injects at startup. The 13-03 command, keybinding, widget, and
 * contribution binds sit beside the 13-02 proxy bind in the same voice.
 */

import { ContainerModule } from '@theia/core/shared/inversify';
import { CommandContribution } from '@theia/core/lib/common';
import {
    ApplicationShellOptions,
    FrontendApplicationContribution,
    KeybindingContribution,
    WebSocketConnectionProvider,
} from '@theia/core/lib/browser';
import { CHROME_SUGGESTION_PATH, ChromeBarSuggestionService, ChromeBarTabSuggestions } from './chrome-bar-suggestion-service';
import { ChromeBarPlacesSuggestions } from './chrome-bar-places-suggestions';
import { ChromeBarCommandContribution } from './chrome-bar-commands';
import { ChromeBarKeybindingContribution } from './chrome-bar-keybindings';
import { ChromeBarShortcutRelay } from './chrome-bar-shortcuts';
import { bindChromeBarPreferences } from './chrome-bar-preferences';
import { ChromeBarContribution, ChromeBarWidget } from './chrome-bar-widget';
import { AddressBar } from './address-bar/address-bar';
import { TabStripWidget } from './tab-strip-widget';
import { LayoutControlsWidget } from './layout-controls-widget';
import { TopTabsSidePanelHandler } from './side-panel-top-tabs';
import { SidePanelHandler } from '@theia/core/lib/browser/shell/side-panel-handler';
import '../../src/browser/side-panel-top-tabs.css';

export default new ContainerModule((bind, _unbind, _isBound, rebind) => {
    // Dragging a tab must not summon the IDE.
    //
    // The shell watches every widget drag and expands whichever side panel
    // the pointer comes near, so it can be dropped there -- correct in an
    // IDE, wrong in a browser. Dragging a tab toward either edge of a
    // Browsing window made both icon rails and the file explorer appear, and
    // dropping there did not split the pane: it docked the tab INTO the
    // sidebar, where a web page is not something the user can get back to.
    // Reported live 2026-09-09, with the tab visible in the left panel.
    //
    // `expandThreshold` is the width of that edge band, and it is a shell
    // option the framework already exposes for configuring exactly this. Zero
    // means the band has no width, so no drag can ever reach it. It is read
    // in one place -- `ApplicationShell.onDragOver` -- and nowhere else, so
    // this removes the reveal and changes nothing else.
    //
    // Coding is untouched in practice: its panels are already expanded, and
    // the shell only auto-expands a panel whose tab bar has no current title.
    // Dropping a widget into a side panel that is open still works there.
    //
    // Partial by design: the shell spreads this over its own defaults per
    // panel, so `emptySize`, `expandDuration` and `initialSizeRatio` keep
    // their framework values.
    // Both side panels carry their view icons across the top (VS Code's
    // activity bar at the top); see side-panel-top-tabs.ts.
    rebind(SidePanelHandler).to(TopTabsSidePanelHandler);
    rebind(ApplicationShellOptions).toConstantValue({
        leftPanel: { expandThreshold: 0 },
        rightPanel: { expandThreshold: 0 },
        bottomPanel: { expandThreshold: 0 },
    });
    // NG-023: the backend proxy serves open-tab rows; the service the widget
    // injects adds history and bookmark matches from chrome.
    bind(ChromeBarTabSuggestions).toDynamicValue(ctx =>
        WebSocketConnectionProvider.createProxy<ChromeBarSuggestionService>(ctx.container, CHROME_SUGGESTION_PATH)
    ).inSingletonScope();
    bind(ChromeBarSuggestionService).to(ChromeBarPlacesSuggestions).inSingletonScope();
    bind(ChromeBarCommandContribution).toSelf().inSingletonScope();
    bind(CommandContribution).toService(ChromeBarCommandContribution);
    bind(ChromeBarKeybindingContribution).toSelf().inSingletonScope();
    bind(KeybindingContribution).toService(ChromeBarKeybindingContribution);
    bind(ChromeBarWidget).toSelf().inSingletonScope();
    // 30-01 (D-04): the address pill the widget renders, static like every bind here (D-50).
    bind(AddressBar).toSelf().inSingletonScope();
    bind(TabStripWidget).toSelf().inSingletonScope();
    bind(LayoutControlsWidget).toSelf().inSingletonScope();
    bind(ChromeBarContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(ChromeBarContribution);
    // Phase 27: the page-focus key relay (chrome-bar-shortcuts.ts). Static
    // like every bind above (D-50): its onStart subscribes to chrome's pushes.
    bind(ChromeBarShortcutRelay).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(ChromeBarShortcutRelay);
    // NAV-04: the Home settings, static at module load (D-50).
    bindChromeBarPreferences(bind);
});
