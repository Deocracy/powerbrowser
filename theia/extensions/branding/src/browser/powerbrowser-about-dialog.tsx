import * as React from '@theia/core/shared/react';
import { injectable, inject } from '@theia/core/shared/inversify';
import { AboutDialog, AboutDialogProps, ABOUT_CONTENT_CLASS } from '@theia/core/lib/browser/about-dialog';
import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
import { powerBrowserMarkInline, inlineMarkFromSvg } from './powerbrowser-mark';
import { POWERBROWSER_REPO_URL } from './powerbrowser-welcome-widget';
import { readBrandingConfig } from './powerbrowser-branding-config';

// GEN-05 (04-01, carried over from the welcome widget): the boot fallback
// for the dialog title. The title itself resolves at runtime through the
// frontend application config (see displayName below), which the generator
// owns from configuration.toml -- so a rebrand is a manifest edit plus the
// app-bundle step, never a .ts edit. Must stay exactly one quoted
// occurrence, which scripts/verify-branding-preflight.mjs asserts from the
// inventory value.
const FALLBACK_DISPLAY_NAME = 'PowerBrowser';

// GEN-05 legal-notice channel (06-04): the boot fallback for the three
// About-dialog notices, and the ONLY notice literals this file carries.
// The rendered notices resolve at runtime through readBrandingConfig (see
// legalNotices below), which the generator owns from configuration.toml
// plus brand/mark.svg -- so a rebrand is a manifest edit plus the
// app-bundle step, never a .ts edit. Each entry must stay exactly one
// quoted occurrence, which scripts/verify-branding-preflight.mjs asserts
// from the manifest through the emitter.
const FALLBACK_LEGAL_NOTICES = [
    'PowerBrowser is a trademark of Deocracy Institute.',
    'PowerBrowser Dev is not officially associated with Mozilla or its products.',
    'This product (powerbrowser.org) includes Eclipse Theia, a trademark of Eclipse Foundation AISBL.',
];

// D-35: `render()` is overridden entirely -- not just the title -- because
// the base `AboutDialog`'s two identity-leaking renderers are unavoidable
// otherwise: `renderHeader()` hard-links
// eclipse-theia.github.io/vscode-theia-comparator, and `renderExtensions()`
// lists every `@theia/*` package by name and version. Both are dropped, not
// restyled. `applicationInfo` is populated by the inherited `doInit()`
// (already called by the base class's `@postConstruct` init) -- not
// re-implemented here.
@injectable()
export class PowerBrowserAboutDialog extends AboutDialog {

    constructor(@inject(AboutDialogProps) protected override readonly props: AboutDialogProps) {
        super(props);
    }

    protected override render(): React.ReactNode {
        return <div className={ABOUT_CONTENT_CLASS}>
            {this.renderContent()}
        </div>;
    }

    // GEN-05 (04-04): the title, the about text, the repo link and the mark
    // are the RUNTIME config values -- applicationName and
    // powerbrowserBranding from theia.frontend.config, which
    // scripts/generate.mjs owns from configuration.toml and brand/mark.svg.
    // Same synchronous read and boot fallbacks as the welcome widget: the
    // compiled name literal, the compiled link literal, the compiled mark
    // twin. An unset about text renders no element.
    protected get displayName(): string {
        try {
            return FrontendApplicationConfigProvider.get().applicationName || FALLBACK_DISPLAY_NAME;
        } catch {
            return FALLBACK_DISPLAY_NAME;
        }
    }

    protected get aboutText(): string | undefined {
        return readBrandingConfig().aboutText;
    }

    // GEN-05 legal-notice channel (06-04): the rendered notices are the
    // RUNTIME powerbrowserBranding.legalNotices array -- the same
    // synchronous read as above, with the compiled notices as the boot
    // fallback where the provider is unset. Rendered as text nodes below,
    // so the strings are escaped, never markup (T-06-04).
    protected get legalNotices(): string[] {
        return readBrandingConfig().legalNotices ?? FALLBACK_LEGAL_NOTICES;
    }

    protected get repoUrl(): string {
        return readBrandingConfig().repoUrl || POWERBROWSER_REPO_URL;
    }

    protected get markInline(): string {
        const channel = readBrandingConfig().markSvg;
        return channel !== undefined ? inlineMarkFromSvg(channel, 48) : powerBrowserMarkInline(48);
    }

    // PowerBrowser's own body -- mark, name, version, one repo link. No
    // renderExtensions() call, no eclipse-theia.github.io link (D-35,
    // criterion 1).
    protected renderContent(): React.ReactNode {
        return <div className='ad-container'>
            {/* INLINE, not an <img> -- see the same note in
                powerbrowser-welcome-widget.tsx. currentColor needs the SVG
                to be part of this document. */}
            {/* eslint-disable-next-line react/no-danger */}
            <span dangerouslySetInnerHTML={{ __html: this.markInline }} />
            <h3>{this.displayName}</h3>
            {this.aboutText && <p>{this.aboutText}</p>}
            {this.applicationInfo && <p>Version {this.applicationInfo.version}</p>}
            {/* The runtime legal notices, one paragraph each. Mapped from
                the channel value, never a literal: no notice string may
                appear here as render text, only the mapping over it. */}
            {this.legalNotices.map((notice) => <p key={notice}>{notice}</p>)}
            <p>
                <a
                    role='button'
                    tabIndex={0}
                    onClick={() => this.windowService.openNewWindow(this.repoUrl, { external: true })}>
                    {this.repoUrl}
                </a>
            </p>
        </div>;
    }
}
