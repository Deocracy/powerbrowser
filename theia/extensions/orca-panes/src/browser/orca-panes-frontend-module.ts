/**
 * Phase 64 (P64-05, P64-08; TAB-04, TAB-06, TERM-01, TERM-04): frontend
 * composition of @powerbrowser/orca-panes. All binds are static at module load
 * (D-50).
 */
import { ContainerModule } from '@theia/core/shared/inversify';
import { FrontendApplicationContribution, WebSocketConnectionProvider, WidgetFactory } from '@theia/core/lib/browser';
import { ORCA_PANE_FACTORY_ID } from '@powerbrowser/tab-uris/lib/browser/orca-scheme-coverage';
import { ORCA_PANES_SERVICE_PATH, OrcaPaneOptions, OrcaPanesService } from '../common/orca-panes-protocol';
import { OrcaPaneBundle } from './orca-pane-bundle';
import { OrcaPaneObserver } from './orca-pane-observer';
import { OrcaPaneWidget, OrcaPaneWidgetOptions } from './orca-pane-widget';

export default new ContainerModule(bind => {
    bind(OrcaPanesService).toDynamicValue(ctx =>
        WebSocketConnectionProvider.createProxy<OrcaPanesService>(ctx.container, ORCA_PANES_SERVICE_PATH)
    ).inSingletonScope();
    bind(OrcaPaneBundle).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(OrcaPaneBundle);

    // C7: one widget per hosted pane; the options are the widget's identity and replay on layout restore (P64-28).
    bind(WidgetFactory).toDynamicValue(ctx => ({
        id: ORCA_PANE_FACTORY_ID,
        createWidget: (options: OrcaPaneOptions) => {
            const child = ctx.container.createChild();
            child.bind(OrcaPaneWidgetOptions).toConstantValue(options);
            child.bind(OrcaPaneWidget).toSelf();
            return child.get(OrcaPaneWidget);
        },
    })).inSingletonScope();
    bind(OrcaPaneObserver).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(OrcaPaneObserver);
});
