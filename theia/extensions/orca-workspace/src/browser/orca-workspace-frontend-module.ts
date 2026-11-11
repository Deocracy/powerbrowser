/**
 * Phase 65 (TAB-05; P65-01..P65-07, P65-21): frontend composition of
 * @powerbrowser/orca-workspace. Theia's own extension points only; no
 * @theia/* file is edited (CLAUDE.md hard rule 1).
 */
import { ContainerModule } from '@theia/core/shared/inversify';
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { OrcaEditorRouter } from './orca-editor-routes';

export default new ContainerModule(bind => {
    bind(OrcaEditorRouter).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(OrcaEditorRouter);
});
