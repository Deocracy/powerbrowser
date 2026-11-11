/**
 * Phase 65 (TAB-05; P65-01..P65-07, P65-21): frontend composition of
 * @powerbrowser/orca-workspace. Theia's own extension points only; no
 * @theia/* file is edited (CLAUDE.md hard rule 1).
 */
import { ContainerModule } from '@theia/core/shared/inversify';
import { FrontendApplicationContribution, WebSocketConnectionProvider } from '@theia/core/lib/browser';
import { ResourceResolver } from '@theia/core/lib/common/resource';
import { ORCA_GIT_SERVICE_PATH, OrcaGitService } from '../common/orca-git-protocol';
import { OrcaEditorRouter } from './orca-editor-routes';
import { OrcaGitResourceResolver } from './orca-git-resource';

export default new ContainerModule(bind => {
    // P65-03: the pb-orca-git: blob reader, over Theia's authenticated websocket.
    bind(OrcaGitService).toDynamicValue(ctx =>
        WebSocketConnectionProvider.createProxy<OrcaGitService>(ctx.container, ORCA_GIT_SERVICE_PATH)
    ).inSingletonScope();
    bind(OrcaGitResourceResolver).toSelf().inSingletonScope();
    bind(ResourceResolver).toService(OrcaGitResourceResolver);

    bind(OrcaEditorRouter).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(OrcaEditorRouter);
});
