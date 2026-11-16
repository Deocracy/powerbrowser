// 68-11: "Reinstall the Claude Extension", in the command palette and the Help menu (and, through
// this command's isVisible, the chrome bar's Application menu Help), offered only while the
// extension is absent from the profile. The absent list is refreshed at start
// and on every deploy notification, which Theia also sends after an uninstall. Running the
// command is the only path to a reinstall; nothing here runs it.
import { inject, injectable } from '@theia/core/shared/inversify';
import { Command, CommandContribution, CommandRegistry, MenuContribution, MenuModelRegistry, MessageService } from '@theia/core/lib/common';
import { CommonMenus, FrontendApplicationContribution } from '@theia/core/lib/browser';
import { HostedPluginWatcher } from '@theia/plugin-ext/lib/hosted/browser/hosted-plugin-watcher';
import { BundledExtensionsService, CLAUDE_EXTENSION_ID } from '../common/bundled-extensions-protocol';
import { REINSTALL_COMMAND_LABEL, REINSTALL_MESSAGES } from '../common/bundled-extensions-copy';

export const REINSTALL_CLAUDE: Command = {
    id: 'powerbrowser.bundled-extensions.reinstall-claude',
    label: REINSTALL_COMMAND_LABEL,
};

@injectable()
export class ReinstallCommandContribution implements CommandContribution, MenuContribution, FrontendApplicationContribution {

    @inject(BundledExtensionsService)
    protected readonly service: BundledExtensionsService;

    @inject(HostedPluginWatcher)
    protected readonly watcher: HostedPluginWatcher;

    @inject(MessageService)
    protected readonly messages: MessageService;

    protected absent = new Set<string>();

    onStart(): void {
        this.refresh();
        this.watcher.onDidDeploy(() => this.refresh());
    }

    protected async refresh(): Promise<void> {
        try {
            this.absent = new Set(await this.service.absent());
        } catch {
            this.absent = new Set();
        }
    }

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(REINSTALL_CLAUDE, {
            isVisible: () => this.absent.has(CLAUDE_EXTENSION_ID),
            isEnabled: () => this.absent.has(CLAUDE_EXTENSION_ID),
            execute: async () => {
                const result = await this.service.reinstall(CLAUDE_EXTENSION_ID).catch(() => 'failed' as const);
                await this.refresh();
                if (result === 'reinstalled') this.messages.info(REINSTALL_MESSAGES.reinstalled);
                else if (result === 'present') this.messages.info(REINSTALL_MESSAGES.present);
                else this.messages.error(REINSTALL_MESSAGES.failed);
            },
        });
    }

    registerMenus(menus: MenuModelRegistry): void {
        menus.registerMenuAction(CommonMenus.HELP, { commandId: REINSTALL_CLAUDE.id });
    }
}
