/**
 * 68-11: the reinstall service for PowerBrowser's pre-installed extensions. One JSON-RPC
 * service over Theia's authenticated websocket. Nothing here runs on its own: the frontend
 * calls reinstall only from the user's command, so an uninstall is never undone automatically.
 */
export const BUNDLED_EXTENSIONS_SERVICE_PATH = '/services/powerbrowser-bundled-extensions';

/** The pre-installed extension carrying the Claude agent SDK (publisher.name of its manifest). */
export const CLAUDE_EXTENSION_ID = 'powerbrowser.claude-agent-sdk';

export type ReinstallResult = 'reinstalled' | 'present' | 'unknown' | 'failed';

export const BundledExtensionsService = Symbol('BundledExtensionsService');
export interface BundledExtensionsService {
    /** Shipped ids whose deployed copy is absent from the profile. */
    absent(): Promise<string[]>;
    /** Copies one absent shipped extension back into the profile and deploys it. */
    reinstall(id: string): Promise<ReinstallResult>;
}
