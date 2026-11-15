/**
 * 68-11: every word the reinstall affordance shows. Each notification names PowerBrowser,
 * states what happened in plain language and ends with a step the user can take (01-UI-SPEC
 * copywriting contract). No other file of this extension holds a user-facing string.
 *
 * Imports nothing, so a Node check can type-strip and import it (shell-error-copy-no-internals).
 */

/** The command palette and Help menu label. */
export const REINSTALL_COMMAND_LABEL = 'Reinstall the Claude Extension';

export const REINSTALL_MESSAGES = {
    reinstalled: 'PowerBrowser reinstalled the Claude extension. Start a new Claude chat session to use it.',
    present: 'PowerBrowser already has the Claude extension installed. Switch it on in the Extensions view if Claude chat sessions are missing it.',
    failed: "PowerBrowser couldn't reinstall the Claude extension. Try the command again, or restart PowerBrowser and then try it.",
} as const;
