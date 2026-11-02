import { ContainerModule } from '@theia/core/shared/inversify';
import { BackendApplicationContribution } from '@theia/core/lib/node';
import { WsRequestValidatorContribution } from '@theia/core/lib/node/ws-request-validators';
import { PowerBrowserTokenGateContribution } from './token-gate-backend-contribution';
import { PowerBrowserParentWatchdogContribution } from './parent-watchdog-backend-contribution';

export default new ContainerModule(bind => {
    bind(PowerBrowserTokenGateContribution).toSelf().inSingletonScope();
    bind(BackendApplicationContribution).toService(PowerBrowserTokenGateContribution);
    // Plan 38-07: the token cookie on every WebSocket upgrade, beside Theia's own validators.
    bind(WsRequestValidatorContribution).toService(PowerBrowserTokenGateContribution);

    bind(PowerBrowserParentWatchdogContribution).toSelf().inSingletonScope();
    bind(BackendApplicationContribution).toService(PowerBrowserParentWatchdogContribution);
});
