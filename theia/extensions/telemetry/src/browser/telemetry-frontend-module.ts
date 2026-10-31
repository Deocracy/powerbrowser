// The @powerbrowser/telemetry frontend module (04-03, TEL-01/TEL-02).
//
// WIRING. The manifest-owned half ({level, endpoint}) arrives through the
// 04-01 channel: the powerbrowserTelemetry key of theia.frontend.config,
// copied surgically from generated/theia-telemetry.json, read here once
// (customize's powerbrowserPrivilegedJs idiom) with a fail-closed
// fallback -- an unreadable fragment is level off with no endpoint, never
// a live sender. The live half is the telemetry.telemetryLevel preference
// this extension contributes: the sender reads it PER EVENT with the
// manifest level as the PreferenceService.get default, so a user who never
// touches the setting gets the manifest level, and a runtime change takes
// effect without restart.
//
// No TelemetryLogger/TelemetrySender DI token exists in @theia/core
// (TelemetrySender is not even an exported symbol), so this module binds
// the concrete classes -- the same way branding binds its concrete
// contributions. plugin-ext mints its own loggers for extensions; this
// sender is the enforcement point that nothing leaves the application at
// level off regardless of caller.

import { ContainerModule } from '@theia/core/shared/inversify';
import { PreferenceService } from '@theia/core/lib/common/preferences';
import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
import { PowerBrowserTelemetrySender } from './telemetry-sender';
import { TELEMETRY_LEVEL_PREFERENCE, bindTelemetryPreferences } from './telemetry-preferences';
import { PowerBrowserTelemetryLogger } from './telemetry-logger';
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { TelemetryErrorCapture } from './telemetry-error-capture';
import { readTelemetryBuildID, readTelemetryVersion } from './telemetry-enrichment';

export interface PowerBrowserTelemetryConfig {
    level?: unknown;
    endpoint?: unknown;
    version?: unknown;
    buildID?: unknown;
}

// GEN-05's read-site shape carried over: synchronous read, try/catch with
// a fail-closed fallback (an empty value or an unset provider is off, and
// version and buildID are omitted, never guessed).
export function readTelemetryConfig(): { level: string; endpoint: string | undefined; version: string | undefined; buildID: string | undefined } {
    try {
        const raw = FrontendApplicationConfigProvider.get()['powerbrowserTelemetry'] as PowerBrowserTelemetryConfig | undefined;
        const level = typeof raw?.level === 'string' && raw.level !== '' ? raw.level : 'off';
        const endpoint = typeof raw?.endpoint === 'string' && raw.endpoint !== '' ? raw.endpoint : undefined;
        return { level, endpoint, version: readTelemetryVersion(raw?.version), buildID: readTelemetryBuildID(raw?.buildID) };
    } catch {
        return { level: 'off', endpoint: undefined, version: undefined, buildID: undefined };
    }
}

export default new ContainerModule(bind => {
    bindTelemetryPreferences(bind);

    const configured = readTelemetryConfig();
    bind(PowerBrowserTelemetrySender).toDynamicValue(ctx => {
        const preferences = ctx.container.get<PreferenceService>(PreferenceService);
        return new PowerBrowserTelemetrySender({
            endpoint: configured.endpoint,
            getLevel: () => {
                try {
                    return preferences.get<string>(TELEMETRY_LEVEL_PREFERENCE, configured.level);
                } catch {
                    return configured.level;
                }
            },
        });
    }).inSingletonScope();
    bind(PowerBrowserTelemetryLogger).toSelf().inSingletonScope();
    // NG-067: the call site that makes the logger reachable from uncaught errors.
    bind(TelemetryErrorCapture).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(TelemetryErrorCapture);
});
