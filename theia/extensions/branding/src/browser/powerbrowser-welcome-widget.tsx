import * as React from '@theia/core/shared/react';
import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import { ReactWidget } from '@theia/core/lib/browser/widgets/react-widget';
import { ApplicationServer } from '@theia/core/lib/common/application-protocol';
import { WindowService } from '@theia/core/lib/browser/window/window-service';
import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
import { powerBrowserMarkInline, inlineMarkFromSvg } from './powerbrowser-mark';
import { readBrandingConfig } from './powerbrowser-branding-config';

// D-33: `@powerbrowser/branding` ships its own welcome widget rather than
// subclassing `@theia/getting-started`'s `GettingStartedWidget` (D-24).
// Registered under the `WidgetFactory` id `welcome` in
// `powerbrowser-frontend-module.ts`, so its `view:` address is `view:welcome`
// verbatim (D-43).
// D-12 fixes the domain `powerbrowser.org` and nothing else. The inherited
// value was a github.com org URL that did not exist at the time --
// so this points at the one host the project owns.
// GEN-05 (04-04): the boot fallback for the repo link, and the ONLY link
// literal this file carries. The link itself resolves at runtime through the
// frontend application config (see repoUrl below), which the generator owns
// from installer.support_url -- so a rebrand is a manifest edit plus the
// app-bundle step, never a .ts edit. Must stay exactly one quoted
// occurrence, which scripts/verify-branding-preflight.mjs asserts from the
// inventory domain value.
export const POWERBROWSER_REPO_URL = 'https://powerbrowser.org/';

// GEN-05 (04-01): the boot fallback for the welcome heading, and the ONLY
// display literal this file carries. The heading itself resolves at runtime
// through the frontend application config (see displayName below), which the
// generator owns from configuration.toml -- so a rebrand is a manifest edit
// plus the app-bundle step, never a .ts edit. The fallback keeps the tree
// bootable where the provider is unset (specs, stories outside the built
// app): it must stay exactly one quoted occurrence, which
// scripts/verify-branding-preflight.mjs asserts from the inventory value.
const FALLBACK_DISPLAY_NAME = 'PowerBrowser';

@injectable()
export class PowerBrowserWelcomeWidget extends ReactWidget {

    @inject(ApplicationServer)
    protected readonly appServer: ApplicationServer;

    @inject(WindowService)
    protected readonly windowService: WindowService;

    protected version: string | undefined;

    constructor() {
        super();
        this.id = 'welcome';
        this.title.label = 'Welcome';
        this.title.caption = 'Welcome';
        this.title.closable = true;
    }

    @postConstruct()
    protected init(): void {
        this.doInit();
    }

    protected async doInit(): Promise<void> {
        try {
            const info = await this.appServer.getApplicationInfo();
            this.version = info?.version;
        } catch (error) {
            console.error('[@powerbrowser/branding] failed to load application info for welcome widget:', error);
        } finally {
            this.update();
        }
    }

    protected openRepo = (e: React.SyntheticEvent): void => {
        e.preventDefault();
        this.windowService.openNewWindow(this.repoUrl, { external: true });
    };

    // GEN-05 (04-01): the welcome heading is the RUNTIME application name --
    // the `applicationName` the app-bundle step injects into index.js from
    // theia/applications/browser/package.json's theia.frontend.config block,
    // which scripts/generate.mjs owns from identity.display_name. Read
    // synchronously: the provider is set at page load before any widget
    // renders, so there is no fetch, no state, no loading flash. An empty
    // value or an unset provider falls back to FALLBACK_DISPLAY_NAME above.
    protected get displayName(): string {
        try {
            return FrontendApplicationConfigProvider.get().applicationName || FALLBACK_DISPLAY_NAME;
        } catch {
            return FALLBACK_DISPLAY_NAME;
        }
    }

    // GEN-05 (04-04): the welcome text, the repo link and the mark are the
    // RUNTIME powerbrowserBranding values -- the `powerbrowserBranding` key
    // of that same config block, which scripts/generate.mjs owns from
    // theia.welcome_text, installer.support_url and brand/mark.svg. Same
    // synchronous read, same boot fallbacks: the compiled link literal and
    // the compiled mark twin below. An unset text renders no element --
    // the shipped manifest states none, so nothing is invented here.
    protected get welcomeText(): string | undefined {
        return readBrandingConfig().welcomeText;
    }

    protected get repoUrl(): string {
        return readBrandingConfig().repoUrl || POWERBROWSER_REPO_URL;
    }

    protected get markInline(): string {
        const channel = readBrandingConfig().markSvg;
        return channel !== undefined ? inlineMarkFromSvg(channel, 64) : powerBrowserMarkInline(64);
    }

    // Per CONTEXT.md's discretion leaning: product name, version, and one
    // repo link only -- no invented marketing copy or tagline.
    protected render(): React.ReactNode {
        return <div className='gs-container'>
            {/* INLINE, not an <img>. The mark inherits the Theia theme's
                foreground through currentColor, and an <img> is a separate
                document that inherits nothing -- which is how the OS-driven
                variant came to render #1a1a1a on the shell's own dark
                background on a light-mode OS and disappear. The markup is the
                runtime channel value with the compiled twin as fallback. */}
            {/* eslint-disable-next-line react/no-danger */}
            <span dangerouslySetInnerHTML={{ __html: this.markInline }} />
            {/* The DISPLAY form, with the space. `PowerBrowser` is the
                identifier form (class names, the chrome: package, the API
                object) and inventory/brand-tokens.json records it as the value
                that must never appear in a display string. This heading was
                the identifier form until 01-07 -- exactly what a token-boundary
                rename produces -- and verify-branding.mjs had been renamed to
                expect it, so the two agreed and neither noticed. Resolved at
                runtime since 04-01 (see displayName above), never a literal. */}
            <h1>{this.displayName}</h1>
            {/* The manifest welcome text, rendered as a React text node (so
                it is escaped, never markup) only when the manifest states
                one -- the shipped manifest states none. */}
            {this.welcomeText && <p>{this.welcomeText}</p>}
            {this.version && <p>Version {this.version}</p>}
            <p>
                <a href={this.repoUrl} onClick={this.openRepo}>{this.repoUrl}</a>
            </p>
        </div>;
    }
}
