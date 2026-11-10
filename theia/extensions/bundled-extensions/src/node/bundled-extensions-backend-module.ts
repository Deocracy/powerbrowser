import { ContainerModule } from '@theia/core/shared/inversify';
import { PluginDeployerParticipant } from '@theia/plugin-ext/lib/common/plugin-protocol';
import { BundledExtensionsSeed } from './bundled-extensions-seed';

export default new ContainerModule(bind => {
    bind(BundledExtensionsSeed).toSelf().inSingletonScope();
    bind(PluginDeployerParticipant).toService(BundledExtensionsSeed);
});
