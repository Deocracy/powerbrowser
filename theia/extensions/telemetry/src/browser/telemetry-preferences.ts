// The telemetry.telemetryLevel preference (04-03, TEL-01).
//
// @theia/core ships no telemetryLevel preference, but @theia/telemetry
// (pulled in by @theia/plugin-ext at 1.76) registers the same key with its
// own text. This contribution carries no static `schema`: its initSchema
// awaits one microtask, so it runs after every contribution's synchronous
// addSchema and PowerBrowser's text and default win in any module order
// (Phase 19, UPD-10). It updates the existing property when the key is
// already registered, and adds its own schema when it is not (a tree
// without @theia/telemetry). Composition, not a core patch: the sender
// reads the live value per event, so a runtime change takes effect without
// restart, and the manifest level (powerbrowserTelemetry fragment) stays
// the default for users who never touch the setting --
// PreferenceService.get(name, manifestDefault) in the frontend module.
//
// The contribution default agrees with the manifest default (`off`), so
// the two agree even before the module wires them together.

import { interfaces } from '@theia/core/shared/inversify';
import {
    createPreferenceProxy,
    PreferenceContribution,
    PreferenceProxy,
    PreferenceSchema,
    PreferenceSchemaService,
    PreferenceService,
} from '@theia/core/lib/common/preferences';
import { TELEMETRY_LEVELS } from './telemetry-sender';

export const TELEMETRY_LEVEL_PREFERENCE = 'telemetry.telemetryLevel';

export const TelemetryPreferenceSchema: PreferenceSchema = {
    properties: {
        [TELEMETRY_LEVEL_PREFERENCE]: {
            type: 'string',
            enum: [...TELEMETRY_LEVELS],
            enumDescriptions: [
                'Send nothing. No telemetry event leaves the application.',
                'Send error telemetry only (uncaught errors). Usage events are dropped.',
                'Send error telemetry only (uncaught errors). Usage events are dropped.',
                'Send usage and error telemetry to the configured endpoint.',
            ],
            default: 'off',
            description: 'Send error reports to PowerBrowser. When this is on, PowerBrowser sends the error type, file name, line number, version and operating system when something goes wrong. It never sends page content or error messages. Turning this on also lets installed VS Code extensions send their own telemetry.',
        },
    },
};

export interface TelemetryConfiguration {
    [TELEMETRY_LEVEL_PREFERENCE]: string;
}

export const TelemetryPreferenceContribution = Symbol('TelemetryPreferenceContribution');
export const TelemetryPreferences = Symbol('TelemetryPreferences');
export type TelemetryPreferences = PreferenceProxy<TelemetryConfiguration>;

export function createTelemetryPreferences(preferences: PreferenceService, schema: PreferenceSchema = TelemetryPreferenceSchema): TelemetryPreferences {
    return createPreferenceProxy(preferences, schema);
}

export function bindTelemetryPreferences(bind: interfaces.Bind): void {
    bind(TelemetryPreferences).toDynamicValue(ctx =>
        createTelemetryPreferences(ctx.container.get<PreferenceService>(PreferenceService))).inSingletonScope();
    const contribution: PreferenceContribution = {
        initSchema: async (service: PreferenceSchemaService) => {
            await Promise.resolve(); // run after every contribution's synchronous addSchema
            const own = TelemetryPreferenceSchema.properties[TELEMETRY_LEVEL_PREFERENCE];
            if (service.getSchemaProperty(TELEMETRY_LEVEL_PREFERENCE)) {
                // Full property: an update with a different default fires a change event.
                service.updateSchemaProperty(TELEMETRY_LEVEL_PREFERENCE, { ...own });
            } else {
                service.addSchema(TelemetryPreferenceSchema);
            }
        },
    };
    bind(TelemetryPreferenceContribution).toConstantValue(contribution);
    bind(PreferenceContribution).toService(TelemetryPreferenceContribution);
}
