/**
 * Phase 65 (TAB-07; P65-08, P65-09, P65-26; CA-10; interfaces N-3): Orca's
 * sidebar, Agents, Settings and right sidebar as parts of two Theia view
 * containers, through Theia's own view-container pattern (the navigator's
 * WidgetFactory plus one AbstractViewContribution per container), no core edit.
 *
 * The Orca mode docks both containers from its rules row (mode-service.ts,
 * ensureInArea); modes and tab-uris spell the container ids as literals. The
 * Agents part is added and removed at run time by OrcaSidePanelSync (P65-12),
 * bound here with the factories.
 * No command, menu, toolbar item or keybinding is registered here: no
 * toggleCommandId, so the only PB-authored strings are the 'Orca' labels.
 */
import { injectable, interfaces } from '@theia/core/shared/inversify';
import {
    AbstractViewContribution, FrontendApplicationContribution, ViewContainer, WidgetFactory, WidgetManager, bindViewContribution, codicon
} from '@theia/core/lib/browser';
import { OrcaSideViewOptions, OrcaSideViewWidget } from './orca-side-view-widget';
import { OrcaSidePanelSync } from './orca-side-panel-sync';

export const ORCA_LEFT_CONTAINER_ID = 'powerbrowser-orca-view-container';
export const ORCA_RIGHT_CONTAINER_ID = 'powerbrowser-orca-right-view-container';
export const ORCA_SIDEBAR_VIEW_ID = 'powerbrowser-orca-sidebar-view';
export const ORCA_AGENTS_VIEW_ID = 'powerbrowser-orca-agents-view';
export const ORCA_SETTINGS_VIEW_ID = 'powerbrowser-orca-settings-view';
export const ORCA_RIGHT_SIDEBAR_VIEW_ID = 'powerbrowser-orca-right-sidebar-view';

/** Part id to the B-1 mount kind it shows. */
export const ORCA_SIDE_VIEW_KINDS: ReadonlyArray<readonly [string, string]> = [
    [ORCA_SIDEBAR_VIEW_ID, 'sidebar'],
    [ORCA_AGENTS_VIEW_ID, 'orchestration'],
    [ORCA_SETTINGS_VIEW_ID, 'settings'],
    [ORCA_RIGHT_SIDEBAR_VIEW_ID, 'right-sidebar'],
];

/** The Agents part's place in the left container while Orca's setting is on (P65-12). */
export const ORCA_AGENTS_PART_OPTIONS: ViewContainer.Factory.WidgetOptions = { order: 1, canHide: false };

const ORCA_LABEL = 'Orca';

@injectable()
export class OrcaLeftContainerContribution extends AbstractViewContribution<ViewContainer> {
    constructor() {
        super({ widgetId: ORCA_LEFT_CONTAINER_ID, widgetName: ORCA_LABEL, defaultWidgetOptions: { area: 'left' } });
    }
}

@injectable()
export class OrcaRightContainerContribution extends AbstractViewContribution<ViewContainer> {
    constructor() {
        super({ widgetId: ORCA_RIGHT_CONTAINER_ID, widgetName: ORCA_LABEL, defaultWidgetOptions: { area: 'right' } });
    }
}

function bindContainer(
    bind: interfaces.Bind, id: string, iconClass: string, parts: Array<[string, ViewContainer.Factory.WidgetOptions]>
): void {
    bind(WidgetFactory).toDynamicValue(ctx => ({
        id,
        createWidget: async () => {
            const container = ctx.container.get<ViewContainer.Factory>(ViewContainer.Factory)({ id });
            container.setTitleOptions({ label: ORCA_LABEL, iconClass, closeable: true });
            const widgets = ctx.container.get(WidgetManager);
            for (const [partId, options] of parts) {
                container.addWidget(await widgets.getOrCreateWidget(partId), options);
            }
            return container;
        },
    })).inSingletonScope();
}

export function bindOrcaSidePanel(bind: interfaces.Bind): void {
    for (const [id, kind] of ORCA_SIDE_VIEW_KINDS) {
        bind(WidgetFactory).toDynamicValue(ctx => ({
            id,
            createWidget: () => {
                const child = ctx.container.createChild();
                child.bind(OrcaSideViewOptions).toConstantValue({ id, kind });
                child.bind(OrcaSideViewWidget).toSelf();
                return child.get(OrcaSideViewWidget);
            },
        })).inSingletonScope();
    }
    bindContainer(bind, ORCA_LEFT_CONTAINER_ID, codicon('list-tree'), [
        [ORCA_SIDEBAR_VIEW_ID, { order: 0, canHide: false }],
        [ORCA_SETTINGS_VIEW_ID, { order: 2, initiallyCollapsed: true }],
    ]);
    bindContainer(bind, ORCA_RIGHT_CONTAINER_ID, codicon('layout-sidebar-right'), [
        [ORCA_RIGHT_SIDEBAR_VIEW_ID, { order: 0, canHide: false }],
    ]);
    bindViewContribution(bind, OrcaLeftContainerContribution);
    bindViewContribution(bind, OrcaRightContainerContribution);
    bind(OrcaSidePanelSync).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(OrcaSidePanelSync);
}
