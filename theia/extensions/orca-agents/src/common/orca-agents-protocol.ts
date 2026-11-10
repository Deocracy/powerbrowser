/**
 * Phase 63 (EXT-02, P63-15 as amended by P63-26): the names shared by the
 * orca-agents backend, its frontend and bin/claude-wrapper.mjs.
 *
 * The backend writes a per-profile launcher <bridge dir>/claude-wrapper that
 * runs bin/claude-wrapper.mjs on PowerBrowser's Node; the frontend registers
 * its path as the default-scope value of the Claude Code extension's
 * claudeCode.claudeProcessWrapper setting. No settings file is ever written.
 */

/** The Claude Code extension's setting whose value wraps every claude it starts. */
export const CLAUDE_PROCESS_WRAPPER_PREFERENCE = 'claudeCode.claudeProcessWrapper';

export const ORCA_AGENTS_SERVICE_PATH = '/services/powerbrowser/orca-agents';

export const OrcaAgentsService = Symbol('OrcaAgentsService');
export interface OrcaAgentsService {
    /** The launcher's absolute path, or undefined when the backend is inert (no bridge directory). */
    getClaudeWrapperPath(): Promise<string | undefined>;
}

/** Bridge-directory file names. ORCAD_DATA_ROOT_FILE is the literal OrcaEnv exports (lane p63-05). */
export const CLAUDE_WRAPPER_FILE = 'claude-wrapper';
export const CLAUDE_WRAPPER_LOG_FILE = 'claude-wrapper.log';
export const ORCAD_DATA_ROOT_FILE = 'orcad-data-root';
