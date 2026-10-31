import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import { ApplicationServer } from '@theia/core/lib/common/application-protocol';
import { Command, CommandContribution, CommandRegistry, CommandService } from '@theia/core/lib/common';

// TEL-05 command half (Phase 53, plan 01). The palette command opens the Phase 42
// bug form in the stock browser window through the GUI-01 opener, prefilled with
// the three bug.yml fields the sidecar can know. Diagnostics never enter the URL:
// the query string carries the template selector and the prefill fields only.
// The verifier scripts/verify-bug-report.mjs derives the prefill set, the origin
// and path, and the opener id from this file and compares them at check time.

export const REPORT_BUG_COMMAND_ID = 'powerbrowser.report-bug';
export const REPORT_BUG_COMMAND: Command = { id: REPORT_BUG_COMMAND_ID, label: 'PowerBrowser: Report a Bug' };

// The GUI-01 opener id, spelled here rather than imported: branding does not
// depend on tab-uris, and browser-window-command.ts exports the same string.
const OPEN_BROWSER_WINDOW_ID = 'powerbrowser.open-browser-window';
const ISSUES_NEW_URL = 'https://github.com/Deocracy/powerbrowser/issues/new';
const BUG_TEMPLATE = 'bug.yml';
// shortcut: install format has no in-tree source (the install channel lives on the chrome side), so the field stays empty and the reporter fills it; upgrade when the shell publishes the install channel to the sidecar.
const INSTALL_FORMAT_UNKNOWN = '';

function operatingSystem(userAgent: string): string {
    if (/Windows/i.test(userAgent)) return 'Windows';
    if (/Macintosh|Mac OS X/i.test(userAgent)) return 'macOS';
    if (/Linux|X11/i.test(userAgent)) return 'Linux';
    return '';
}

@injectable()
export class PowerBrowserReportBugContribution implements CommandContribution {
    @inject(CommandService)
    protected readonly commands: CommandService;

    @inject(ApplicationServer)
    protected readonly appServer: ApplicationServer;

    /** Read once off the click path; the opener's window.open fallback needs the click's user activation. */
    private version = '';

    @postConstruct()
    protected initVersion(): void {
        this.appServer.getApplicationInfo().then(
            info => { this.version = info?.version ?? ''; },
            () => { this.version = ''; },
        );
    }

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(REPORT_BUG_COMMAND, {
            execute: () => this.reportBug(),
        });
    }

    protected reportBug(): void {
        const params = new URLSearchParams({
            template: BUG_TEMPLATE,
            version: this.version,
            os: operatingSystem(navigator.userAgent),
            install_format: INSTALL_FORMAT_UNKNOWN,
        });
        void this.commands.executeCommand(OPEN_BROWSER_WINDOW_ID, `${ISSUES_NEW_URL}?${params.toString()}`);
    }
}
