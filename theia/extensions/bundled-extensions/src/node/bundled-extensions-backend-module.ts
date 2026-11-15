import { ContainerModule } from '@theia/core/shared/inversify';
import { ConnectionHandler, RpcConnectionHandler } from '@theia/core/lib/common';
import { PluginDeployerParticipant } from '@theia/plugin-ext/lib/common/plugin-protocol';
import { BUNDLED_EXTENSIONS_SERVICE_PATH, BundledExtensionsService } from '../common/bundled-extensions-protocol';
import { BundledExtensionsSeed } from './bundled-extensions-seed';
import { BundledExtensionsServiceImpl } from './bundled-extensions-service';

export default new ContainerModule(bind => {
    bind(BundledExtensionsSeed).toSelf().inSingletonScope();
    bind(PluginDeployerParticipant).toService(BundledExtensionsSeed);
    bind(BundledExtensionsServiceImpl).toSelf().inSingletonScope();
    bind(ConnectionHandler).toDynamicValue(ctx =>
        new RpcConnectionHandler<BundledExtensionsService>(BUNDLED_EXTENSIONS_SERVICE_PATH, () => ctx.container.get(BundledExtensionsServiceImpl))
    ).inSingletonScope();
});
