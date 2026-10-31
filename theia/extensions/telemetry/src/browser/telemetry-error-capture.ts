// NG-067: uncaught frontend errors and unhandled rejections reach the telemetry logger.
// The sender applies the level: off drops, crash/error/all admit error events. The payload
// is the event name plus the error's type (constructor name), the script's base name, line
// and column -- no message text and no stack, because both carry file paths and URLs.
// telemetry-error-report.ts shapes the payload and skips repeats; this class only wires it,
// handing the reporter the fragment's version and buildID.
import { inject, injectable } from '@theia/core/shared/inversify';
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { PowerBrowserTelemetryLogger } from './telemetry-logger';
import { ErrorReporter } from './telemetry-error-report';
import { readTelemetryConfig } from './telemetry-frontend-module';

@injectable()
export class TelemetryErrorCapture implements FrontendApplicationContribution {
    @inject(PowerBrowserTelemetryLogger)
    protected readonly logger: PowerBrowserTelemetryLogger;

    protected reporter: ErrorReporter | undefined;

    onStart(): void {
        const { version, buildID } = readTelemetryConfig();
        this.reporter = new ErrorReporter(this.logger, { version, buildID });
        window.addEventListener('error', this.reporter.onError);
        window.addEventListener('unhandledrejection', this.reporter.onRejection);
    }

    onStop(): void {
        if (this.reporter === undefined) return;
        window.removeEventListener('error', this.reporter.onError);
        window.removeEventListener('unhandledrejection', this.reporter.onRejection);
    }
}
