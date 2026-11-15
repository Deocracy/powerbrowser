import { ContainerModule } from '@theia/core/shared/inversify';
import { CommandContribution, MenuContribution } from '@theia/core/lib/common';
import { FrontendApplicationContribution, WebSocketConnectionProvider } from '@theia/core/lib/browser';
import { BUNDLED_EXTENSIONS_SERVICE_PATH, BundledExtensionsService } from '../common/bundled-extensions-protocol';
import { ReinstallCommandContribution } from './reinstall-command';

export default new ContainerModule(bind => {
    bind(BundledExtensionsService).toDynamicValue(ctx =>
        WebSocketConnectionProvider.createProxy<BundledExtensionsService>(ctx.container, BUNDLED_EXTENSIONS_SERVICE_PATH)
    ).inSingletonScope();
    bind(ReinstallCommandContribution).toSelf().inSingletonScope();
    bind(CommandContribution).toService(ReinstallCommandContribution);
    bind(MenuContribution).toService(ReinstallCommandContribution);
    bind(FrontendApplicationContribution).toService(ReinstallCommandContribution);
});
