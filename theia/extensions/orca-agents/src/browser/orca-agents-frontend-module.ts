/**
 * Phase 63 (EXT-02, P63-15 as amended by P63-26): registers the launcher the
 * backend wrote as the default-scope value of the Claude Code extension's
 * claudeCode.claudeProcessWrapper setting.
 *
 * A default override only: no preference setter is called and no user or
 * workspace settings file is written, so a value the user sets still wins.
 * registerOverride accepts a key whose schema is not registered yet (it logs a
 * warning). Whether this default reaches the extension's own contributed
 * property is verified with EXT-01 in the end-of-milestone pass (research
 * assumption A5).
 */
import { ContainerModule, inject, injectable } from '@theia/core/shared/inversify';
import { Disposable } from '@theia/core/lib/common';
import { PreferenceSchemaService } from '@theia/core/lib/common/preferences/preference-schema';
import { FrontendApplicationContribution, WebSocketConnectionProvider } from '@theia/core/lib/browser';
import { CLAUDE_PROCESS_WRAPPER_PREFERENCE, ORCA_AGENTS_SERVICE_PATH, OrcaAgentsService } from '../common/orca-agents-protocol';

@injectable()
export class OrcaAgentsFrontendContribution implements FrontendApplicationContribution {
    @inject(WebSocketConnectionProvider)
    protected readonly connections: WebSocketConnectionProvider;

    @inject(PreferenceSchemaService)
    protected readonly schema: PreferenceSchemaService;

    protected override: Disposable | undefined;

    onStart(): void {
        const service = this.connections.createProxy<OrcaAgentsService>(ORCA_AGENTS_SERVICE_PATH);
        service.getClaudeWrapperPath().then(path => {
            if (path) {
                this.override = this.schema.registerOverride(CLAUDE_PROCESS_WRAPPER_PREFERENCE, undefined, path);
            }
        }).catch(err => console.warn('[@powerbrowser/orca-agents] the claude wrapper default was not registered:', err));
    }

    onStop(): void {
        this.override?.dispose();
    }
}

export default new ContainerModule(bind => {
    bind(OrcaAgentsFrontendContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(OrcaAgentsFrontendContribution);
});
