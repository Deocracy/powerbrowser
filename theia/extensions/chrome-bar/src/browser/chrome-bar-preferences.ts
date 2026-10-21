// NAV-04: the two Home settings (27-UI-SPEC "Home (NAV-04)"). Brand-neutral
// `browser.` keys, so a rebranded build never shows this product's name in
// Settings ("Browser › Show Home Button", "Browser › Home Page"). Home is off
// by default, as in Firefox, and the home page is empty by default, so Home
// contacts no host the user did not configure.
//
// A static `schema`, unlike telemetry-preferences.ts: no installed package
// registers a `browser.` key, so there is no other registration to win over.

import { interfaces } from '@theia/core/shared/inversify';
import { PreferenceContribution, PreferenceSchema } from '@theia/core/lib/common/preferences';
import { CHROME_BAR_COPY } from './chrome-bar-copy';

export const SHOW_HOME_BUTTON_PREFERENCE = 'browser.showHomeButton';
export const HOME_PAGE_PREFERENCE = 'browser.homePage';

export const ChromeBarPreferenceSchema: PreferenceSchema = {
    properties: {
        [SHOW_HOME_BUTTON_PREFERENCE]: {
            type: 'boolean',
            default: false,
            description: CHROME_BAR_COPY.showHomeButtonDescription,
        },
        [HOME_PAGE_PREFERENCE]: {
            type: 'string',
            default: '',
            description: CHROME_BAR_COPY.homePageDescription,
        },
    },
};

export function bindChromeBarPreferences(bind: interfaces.Bind): void {
    const contribution: PreferenceContribution = { schema: ChromeBarPreferenceSchema };
    bind(PreferenceContribution).toConstantValue(contribution);
}
