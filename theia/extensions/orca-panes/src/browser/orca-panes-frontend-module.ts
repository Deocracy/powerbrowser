/**
 * Phase 64 (P64-05, P64-08, P64-16, P64-21, P64-31, P64-33; TAB-02, TAB-04,
 * TAB-06, TERM-01, TERM-04; interfaces C7, C9, C10): frontend composition of
 * @powerbrowser/orca-panes, the pb-orca: opener, the two Orca commands and the
 * hosted-terminal key rows. All binds are static at module load (D-50).
 */
import { ContainerModule, inject, injectable } from '@theia/core/shared/inversify';
import {
    ApplicationShell, FrontendApplicationContribution, KeybindingContribution, KeybindingRegistry, OpenHandler,
    WebSocketConnectionProvider, WidgetFactory
} from '@theia/core/lib/browser';
import { CommandContribution, CommandRegistry } from '@theia/core/lib/common';
import { QuickInputService } from '@theia/core/lib/common/quick-pick-service';
import URI from '@theia/core/lib/common/uri';
import { ORCA_PANE_FACTORY_ID } from '@powerbrowser/tab-uris/lib/browser/orca-scheme-coverage';
import {
    ORCA_PANES_SERVICE_PATH, ORCA_TERMINAL_KEYS_WHEN, ORCA_TERMINAL_PASSTHROUGH_KEYS, OrcaPaneOptions, OrcaPanesService
} from '../common/orca-panes-protocol';
import { OrcaPaneBundle } from './orca-pane-bundle';
import { OrcaPaneObserver } from './orca-pane-observer';
import { OrcaPaneWidget, OrcaPaneWidgetOptions } from './orca-pane-widget';

const LOG_PREFIX = '[@powerbrowser/orca-panes]';

/**
 * The pb-orca: opener (P64-16). A bare OpenHandler, as ViewUriOpenHandler is:
 * 1000 or 0 on scheme alone. An empty path focuses the most recently active
 * hosted tab; a name focuses its tab; neither ever creates an Orca pane, so a
 * stale name opens nothing and logs one line.
 */
@injectable()
export class OrcaPaneOpenHandler implements OpenHandler {

    readonly id = 'powerbrowser.orca-pane-open-handler';

    @inject(OrcaPaneObserver)
    protected readonly observer: OrcaPaneObserver;

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    canHandle(uri: URI): number {
        return uri.scheme === 'pb-orca' ? 1000 : 0;
    }

    async open(uri: URI): Promise<OrcaPaneWidget | undefined> {
        // Lenient parse, as TabUriRegistry.parseName: pb-orca:x, :/x, :///x and ://x name the same tab.
        const raw = uri.authority || uri.path.toString().replace(/^\/+/, '');
        const widget = raw ? this.observer.widgetByName(raw) : this.observer.lastActive;
        if (!widget || widget.isDisposed) {
            if (raw) {
                console.info(`${LOG_PREFIX} pb-orca:${raw} names no open Orca tab`);
            }
            return undefined;
        }
        if (!widget.isAttached) {
            await this.shell.addWidget(widget, { area: 'main' });
        }
        await this.shell.activateWidget(widget.id);
        return widget;
    }
}

/** The two quick-pick placeholders (P64-37), plain words, no internal identifier. */
const PICK_PLACEHOLDER = {
    'terminal': 'Choose the Orca worktree for the new terminal',
    'agent-session': 'Choose the Orca worktree for the new chat',
} as const;

/**
 * C9' (P64-21, P64-31, P64-37, D-18): command palette only; Orca creates the pane, PB shows it. With no active Orca
 * worktree, a quick pick of Orca's worktrees in Orca's own recency order, the first preselected; accepting it selects
 * that worktree in Orca (P64-10, P64-23), then creates the pane there.
 */
@injectable()
export class OrcaPaneCommands implements CommandContribution {

    @inject(OrcaPaneBundle)
    protected readonly bundle: OrcaPaneBundle;

    @inject(OrcaPaneObserver)
    protected readonly observer: OrcaPaneObserver;

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    @inject(QuickInputService)
    protected readonly quickInput: QuickInputService;

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand({ id: 'powerbrowser.orca.newChat', label: 'New Orca Chat' }, { execute: () => this.create('agent-session') });
        commands.registerCommand({ id: 'powerbrowser.orca.newTerminal', label: 'New Orca Terminal' }, { execute: () => this.create('terminal') });
    }

    protected async create(kind: 'agent-session' | 'terminal'): Promise<void> {
        let api;
        try {
            api = await this.bundle.ready();
        } catch {
            return; // the bundle logged its failed step once
        }
        let worktreeId = api.activeWorktree();
        if (!worktreeId) {
            const worktrees = api.state().worktrees;
            if (!worktrees.length) {
                console.info(`${LOG_PREFIX} no Orca worktree; no ${kind} pane created`);
                return;
            }
            const items = worktrees.map(w => ({ label: w.label, description: w.path, worktree: w.id }));
            const picked = await this.quickInput.showQuickPick(items, { placeholder: PICK_PLACEHOLDER[kind], activeItem: items[0] });
            if (!picked) {
                return; // Escape creates nothing
            }
            worktreeId = picked.worktree;
            api.setActiveWorktree(worktreeId);
        }
        const added = this.nextWidget(kind, worktreeId, 5000);
        try {
            // A4: terminals only through the host's terminal.create, never Orca's client-side creation.
            await (kind === 'terminal' ? api.createTerminal(worktreeId) : api.createChat(worktreeId));
        } catch (err) {
            console.info(`${LOG_PREFIX} Orca did not create the ${kind} pane: ${(err as Error)?.message ?? 'unknown error'}`);
        }
        const widget = await added;
        if (widget) {
            await this.shell.activateWidget(widget.id);
        }
    }

    protected nextWidget(kind: string, worktreeId: string, timeoutMs: number): Promise<OrcaPaneWidget | undefined> {
        return new Promise(resolve => {
            const timer = setTimeout(() => {
                listener.dispose();
                resolve(undefined);
            }, timeoutMs);
            const listener = this.observer.onDidAddWidget(widget => {
                if (widget.options.kind === kind && widget.options.worktreeId === worktreeId) {
                    clearTimeout(timer);
                    listener.dispose();
                    resolve(widget);
                }
            });
        });
    }
}

/** C10' (D-32, P64-33): in a hosted Orca terminal the shell keys (Ctrl+W, Ctrl+T) reach the shell; the switch keys switch PowerBrowser tabs from every tab. */
@injectable()
export class OrcaTerminalKeybindings implements KeybindingContribution {
    registerKeybindings(keybindings: KeybindingRegistry): void {
        for (const keybinding of ORCA_TERMINAL_PASSTHROUGH_KEYS) {
            keybindings.registerKeybinding({ command: KeybindingRegistry.PASSTHROUGH_PSEUDO_COMMAND, keybinding, when: ORCA_TERMINAL_KEYS_WHEN });
        }
    }
}

export default new ContainerModule(bind => {
    bind(OrcaPanesService).toDynamicValue(ctx =>
        WebSocketConnectionProvider.createProxy<OrcaPanesService>(ctx.container, ORCA_PANES_SERVICE_PATH)
    ).inSingletonScope();
    bind(OrcaPaneBundle).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(OrcaPaneBundle);

    // C7: one widget per hosted pane; the options are the widget's identity and replay on layout restore (P64-28).
    bind(WidgetFactory).toDynamicValue(ctx => ({
        id: ORCA_PANE_FACTORY_ID,
        createWidget: (options: OrcaPaneOptions) => {
            const child = ctx.container.createChild();
            child.bind(OrcaPaneWidgetOptions).toConstantValue(options);
            child.bind(OrcaPaneWidget).toSelf();
            return child.get(OrcaPaneWidget);
        },
    })).inSingletonScope();
    bind(OrcaPaneObserver).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(OrcaPaneObserver);

    bind(OrcaPaneOpenHandler).toSelf().inSingletonScope();
    bind(OpenHandler).toService(OrcaPaneOpenHandler);
    bind(OrcaPaneCommands).toSelf().inSingletonScope();
    bind(CommandContribution).toService(OrcaPaneCommands);
    bind(OrcaTerminalKeybindings).toSelf().inSingletonScope();
    bind(KeybindingContribution).toService(OrcaTerminalKeybindings);
});
