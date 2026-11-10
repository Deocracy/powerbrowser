/**
 * Phase 64 (P64-05, P64-08; TAB-04, TAB-06, TERM-01, TERM-04): frontend
 * composition of @powerbrowser/orca-panes. All binds are static at module load
 * (D-50).
 */
import { ContainerModule } from '@theia/core/shared/inversify';
import { FrontendApplicationContribution, WebSocketConnectionProvider } from '@theia/core/lib/browser';
import { ORCA_PANES_SERVICE_PATH, OrcaPanesService } from '../common/orca-panes-protocol';
import { OrcaPaneBundle } from './orca-pane-bundle';

export default new ContainerModule(bind => {
    bind(OrcaPanesService).toDynamicValue(ctx =>
        WebSocketConnectionProvider.createProxy<OrcaPanesService>(ctx.container, ORCA_PANES_SERVICE_PATH)
    ).inSingletonScope();
    bind(OrcaPaneBundle).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(OrcaPaneBundle);
});
