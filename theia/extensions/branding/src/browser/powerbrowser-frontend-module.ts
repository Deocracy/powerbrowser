import { ContainerModule } from '@theia/core/shared/inversify';
import { FrontendApplicationContribution, WidgetFactory, bindViewContribution } from '@theia/core/lib/browser';
import { AboutDialog } from '@theia/core/lib/browser/about-dialog';
import { CommandContribution } from '@theia/core/lib/common';
import { PowerBrowserReportBugContribution } from './powerbrowser-report-bug-contribution';
import { PowerBrowserFaviconContribution } from './powerbrowser-favicon-contribution';
import { PowerBrowserWelcomeWidget } from './powerbrowser-welcome-widget';
import { PowerBrowserWelcomeViewContribution } from './powerbrowser-welcome-contribution';
import { PowerBrowserAboutDialog } from './powerbrowser-about-dialog';

export default new ContainerModule((bind, _unbind, isBound, rebind) => {
    bind(PowerBrowserFaviconContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(PowerBrowserFaviconContribution);

    bind(PowerBrowserWelcomeWidget).toSelf();
    bind(WidgetFactory).toDynamicValue(context => ({
        id: 'welcome', // D-43: the path is the factory id verbatim -- view:welcome
        createWidget: () => context.container.get<PowerBrowserWelcomeWidget>(PowerBrowserWelcomeWidget),
    })).inSingletonScope();
    bindViewContribution(bind, PowerBrowserWelcomeViewContribution);
    bind(FrontendApplicationContribution).toService(PowerBrowserWelcomeViewContribution);

    bind(CommandContribution).to(PowerBrowserReportBugContribution).inSingletonScope();

    // D-35: guarded rebind -- the in-tree idiom, keeps the module loadable
    // in a container where the base AboutDialog binding is absent.
    if (isBound(AboutDialog)) {
        rebind(AboutDialog).to(PowerBrowserAboutDialog).inSingletonScope();
    } else {
        bind(AboutDialog).to(PowerBrowserAboutDialog).inSingletonScope();
    }
});
