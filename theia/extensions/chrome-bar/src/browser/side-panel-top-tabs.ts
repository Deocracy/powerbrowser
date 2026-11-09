/**
 * VS Code's "activity bar at the top" for both side panels (sketch 005 item 4,
 * adopted 2026-10-17; built 2026-10-20 at Chris's request).
 *
 * Stock Theia stands a 48px vertical icon rail beside each side panel and puts
 * a title row ("EXPLORER ...") over the view. This lays the side out top to
 * bottom instead: one header row holding the view icons, left to right, with
 * the view's own actions at its right end, and the view below. The rail's foot
 * menus are not placed at all -- the gear and the account button live in the
 * title row (LayoutControlsWidget), as in VS Code.
 *
 * A collapsed side is hidden outright, not shrunk to a rail: with no rail
 * there is nothing to show. The layout toggles reopen it.
 *
 * Theia allows exactly this through DI: the shell builds each side with
 * whatever `SidePanelHandler` is bound, so no core file changes.
 */

import { injectable } from '@theia/core/shared/inversify';
import { BoxLayout, BoxPanel, Panel } from '@theia/core/shared/@lumino/widgets';
import { SidePanelHandler } from '@theia/core/lib/browser/shell/side-panel-handler';
import { SideTabBar } from '@theia/core/lib/browser/shell/tab-bars';

@injectable()
export class TopTabsSidePanelHandler extends SidePanelHandler {

    protected override createSideBar(): SideTabBar {
        const bar = super.createSideBar();
        bar.orientation = 'horizontal';
        // Stock overflow measures a vertical rail and reads a menu this row lacks (WINDOWS 41); a row never overflows.
        Object.assign(bar, { hideOverflowingTabs: (): number => -1 });
        return bar;
    }

    protected override createContainer(): BoxPanel {
        // A plain Panel laid out by CSS flex, as stock lays out its rail: a
        // BoxLayout cannot size the actions to their content, so it gave them
        // zero width.
        const header = new Panel();
        header.addClass('pb-side-header');
        header.addWidget(this.tabBar);
        header.addWidget(this.toolBar);

        const container = new BoxPanel({ layout: new BoxLayout({ direction: 'top-to-bottom', spacing: 0 }) });
        container.id = 'theia-' + this.side + '-content-panel';
        container.addClass('pb-side-top-tabs');
        BoxPanel.setStretch(header, 0);
        BoxPanel.setStretch(this.dockPanel, 1);
        container.addWidget(header);
        container.addWidget(this.dockPanel);
        return container;
    }

    override refresh(): void {
        super.refresh();
        // Stock leaves a collapsed side showing its rail; this side has none.
        if (this.dockPanel.isHidden) {
            this.container.setHidden(true);
        }
    }
}
