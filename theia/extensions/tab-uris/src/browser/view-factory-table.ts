// The `view:` target table -- URI-03's coverage contract. Transcribed
// row-by-row from 02-RESEARCH.md's "FactoryId Table" (NOT from
// 02-CONTEXT.md D-43, whose prose list carries five wrong strings and
// omits one shipped widget entirely -- see the `[D-43: ...]` notes below
// and RESEARCH's own correction column). Every row cites the Theia source
// file:line the id was traced to.
//
// Two things a later reader would otherwise have to rediscover the hard
// way:
//
// 1. `keybindings.view.widget` contains dots, which the "no dots in the
//    final path segment" rule (D-42) would seem to forbid. That rule
//    exists because a *Navigatable* URI feeds the resource context key,
//    which derives a file extension from the path -- `view:` addresses
//    never enter that path (only Terminal implements `Navigatable`, and
//    only in Plan 07), so the hazard does not fire here. Theia's own
//    widget id cannot be changed, so the id is kept verbatim and this note
//    kept alongside it.
// 2. This table is a coverage CONTRACT, not the lookup mechanism.
//    `TabUriRegistry` discovers its targets at runtime from the running
//    container's `AbstractViewContribution` instances and cross-checks
//    this table against that discovery at first use. This table's job is
//    to fail loudly -- at startup, not at the moment a human types a URI
//    -- if a shipped view disappears or is renamed by an upstream bump.

export interface ViewFactoryTableRow {
    /** The factory id, verbatim -- also the `view:` path for this row. */
    readonly factoryId: string;
    /** True for the rows addressed as a view *container*, not a part. */
    readonly container: boolean;
}

export const POWERBROWSER_VIEW_FACTORY_IDS: readonly ViewFactoryTableRow[] = Object.freeze([
    { factoryId: 'problems', container: false }, // packages/markers/src/browser/problem/problem-widget.tsx:32 PROBLEMS_WIDGET_ID
    { factoryId: 'explorer-view-container', container: true }, // packages/navigator/src/browser/navigator-widget-factory.ts:29 EXPLORER_VIEW_CONTAINER_ID
    { factoryId: 'outline-view', container: false }, // packages/outline-view/src/browser/outline-view-contribution.ts:29 OUTLINE_WIDGET_FACTORY_ID
    { factoryId: 'search-view-container', container: true }, // packages/search-in-workspace/src/browser/search-in-workspace-factory.ts:28 SEARCH_VIEW_CONTAINER_ID
    { factoryId: 'scm-view-container', container: true }, // packages/scm/src/browser/scm-contribution.ts:52 SCM_VIEW_CONTAINER_ID
    { factoryId: 'debug', container: false }, // packages/debug/src/browser/view/debug-widget.ts:42 static ID
    { factoryId: 'debug-console', container: false }, // packages/debug/src/browser/console/debug-console-contribution.tsx:187 ConsoleOptions.id
    { factoryId: 'disassembly-view-widget', container: false }, // packages/debug/src/browser/disassembly-view/disassembly-view-widget.ts:62 static readonly ID
    { factoryId: 'test-view-container', container: true }, // packages/test/src/browser/view/test-view-contribution.ts:130 TEST_VIEW_CONTAINER_ID (shared with TestRunViewContribution; its own TestRunTreeWidget id 'test-run-widget' is a part, correctly out of scope per D-49)
    { factoryId: 'test-result-widget', container: false }, // packages/test/src/browser/view/test-result-widget.ts:31 static readonly ID
    { factoryId: 'test-output-view', container: false }, // packages/test/src/browser/view/test-output-widget.ts:33 static ID
    { factoryId: 'callhierarchy', container: false }, // packages/callhierarchy/src/browser/callhierarchy.ts:21 CALLHIERARCHY_ID
    { factoryId: 'theia-typehierarchy', container: false }, // packages/typehierarchy/src/browser/tree/typehierarchy-tree-widget.tsx:97 WIDGET_ID -- [D-43: wrongly said 'typehierarchy']
    { factoryId: 'keybindings.view.widget', container: false }, // packages/keymaps/src/browser/keybindings-widget.tsx:105 static readonly ID -- [D-43: wrongly said 'keybindings'; see header note 1 re: dots]
    { factoryId: 'chat-view-widget', container: false }, // packages/ai-chat-ui/src/browser/chat-view-widget.tsx:43 public static ID -- [D-43: wrongly said 'chat-view']
    { factoryId: 'ai-configuration', container: false }, // packages/ai-ide/src/browser/ai-configuration/ai-configuration-widget.tsx:34 static readonly ID -- [D-43: wrongly said 'ai-config']
    { factoryId: 'ai-sessions-widget', container: false }, // packages/ai-ide/src/browser/ai-sessions-widget.tsx:33 static readonly ID -- [D-43: missing from the table entirely]
    { factoryId: 'bulkedit', container: false }, // packages/bulk-edit/src/browser/bulk-edit-tree/bulk-edit-tree-widget.tsx:33 BULK_EDIT_TREE_WIDGET_ID
    { factoryId: 'plugins', container: false }, // packages/plugin-ext/src/main/browser/plugin-frontend-view-contribution.ts:24 PLUGINS_WIDGET_FACTORY_ID
    { factoryId: 'vsx-extensions-view-container', container: true }, // packages/vsx-registry/src/browser/vsx-extensions-view-container.ts:30 static ID
    { factoryId: 'welcome', container: false }, // theia/extensions/branding/src/browser/powerbrowser-frontend-module.ts:18 -- @powerbrowser/branding's own WidgetFactory id, Claude's Discretion per 02-CONTEXT.md (not a Theia-source citation)
    { factoryId: 'powerbrowser-orca-view-container', container: true }, // theia/extensions/orca-panes/src/browser/side-panel/orca-side-panel-module.ts ORCA_LEFT_CONTAINER_ID -- the orca-panes extension's own WidgetFactory id, P65-09 (not a Theia-source citation)
    { factoryId: 'powerbrowser-orca-right-view-container', container: true }, // theia/extensions/orca-panes/src/browser/side-panel/orca-side-panel-module.ts ORCA_RIGHT_CONTAINER_ID -- the orca-panes extension's own WidgetFactory id, P65-09 (not a Theia-source citation)
]);

/**
 * `settings_widget` is deliberately NOT a row above: URI-01/D-38/D-44 route
 * it through the bespoke `settings:` scheme, never `view:`, because
 * `PreferencesWidget extends Panel` (Lumino's raw Panel, not `BaseWidget`),
 * so it can never satisfy the tab bar's navigable check by any amount of
 * method stamping.
 * Source: packages/preferences/src/browser/views/preference-widget.tsx:39
 * `static readonly ID = 'settings_widget'`.
 */
export const SETTINGS_WIDGET_FACTORY_ID = 'settings_widget';

/**
 * Plugin-contributed view containers (dynamic, `@theia/plugin-ext`, D-50)
 * need no lookup table: `ViewContainerWidget.id` is assigned directly from
 * `options.id` (packages/core/src/browser/view-container.ts:185), and
 * `PluginViewRegistry.toViewContainerIdentifier` sets `identifier.id` to
 * `PLUGIN_VIEW_CONTAINER_FACTORY_ID + ':' + viewContainerId`
 * (packages/plugin-ext/src/main/browser/view/plugin-view-registry.ts:982-987)
 * -- so the widget's own `.id` already equals the full `view:` path.
 * `toViewContainerIdentifier`/`toViewContainerId` are `protected` on
 * `PluginViewRegistry`, not reachable from here; the formula is one string
 * op, reimplemented locally per 02-RESEARCH.md's own code example rather
 * than reaching into `PluginViewRegistry`.
 */
export const PLUGIN_VIEW_CONTAINER_FACTORY_ID = 'plugin-view-container';
