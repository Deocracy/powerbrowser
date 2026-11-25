import { injectable, inject } from '@theia/core/shared/inversify';
import { ApplicationShell, FrontendApplicationContribution } from '@theia/core/lib/browser';
import {
    PerspectiveDescriptor,
    PerspectiveService,
    PerspectiveServiceInternal,
} from '@theia/core/lib/browser/perspective-service';

/**
 * GUI-07: the main-area exemption at the perspective deactivate seam.
 *
 * 14-UI-SPEC.md:223 and :232-233 contract that content tabs never unmount,
 * close, move windows, or detach on a mode switch. Stock Theia breaks that on
 * the SECOND and later visit to a mode, and the whole failure lives inside
 * @theia/core -- hard rule 1 forbids editing it, so this file reshapes the
 * DATA stock reads rather than the code that reads it.
 *
 * The stock sequence (@theia/core/lib/browser/perspective-service.js,
 * doSwitchPerspective):
 *
 *     :122-124  oldPerspective.onDeactivate(shell)            <- this seam
 *     :126      savedLayouts.set(oldId, shell.getLayoutData())
 *     :131      const savedLayout = savedLayouts.get(targetId)
 *     :135      await shell.setLayoutData(savedLayout)        <- destructive
 *     :136      detachStrayWidgets(layoutWidgetIds)
 *
 * setLayoutData reaches application-shell.js:727
 * `if (mainPanel) { this.mainPanel.restoreLayout(mainPanel) }`, and Lumino's
 * restoreLayout unparents every widget absent from the restored config. So a
 * mode's second visit restores a snapshot taken before today's tabs existed
 * and unparents every tab opened since. The teardown is CONDITIONAL on the
 * target already having a saved layout, which is exactly why a first visit
 * looks clean and the bug reads as intermittent. Snapshots survive relaunch
 * through ShellLayoutRestorer, so it survives a restart too.
 *
 * One seam, not one call site: onDeactivate fires BEFORE both the save at :126
 * and the read at :131, and inside the `switchInProgress` lock, so stripping
 * the main-area and bottom-area keys out of every saved layout here covers
 * every switch path -- the toggle, the stock perspective picker, setups
 * restore, launch -- without any of them knowing this file exists.
 *
 * Stripping works because stock's own guards are key-PRESENCE guards:
 * application-shell.js:702 `if (bottomPanel.config)` and :727 `if (mainPanel)`.
 * An absent key means Lumino's unparenting loop is never entered and the live
 * main area is left exactly as it is. Side panels keep restoring normally --
 * reshaping those is what a mode is for.
 *
 * The bottom panel is deleted whole rather than by its `config` key alone,
 * because `bottomPanel.expanded` (application-shell.js:708) and
 * `bottomPanel.pinned` (:715) are read OUTSIDE the config guard: keeping the
 * key would expand or collapse the panel from a stale flag and re-pin the LIVE
 * bottom widgets positionally against a stale pinned array. Modes assert
 * bottom-panel visibility themselves on every switch, so nothing is lost.
 *
 * The keep-set hazard, and why the repair below exists: stock derives
 * `layoutWidgetIds` from the SAME layout object (collectWidgetIds
 * :325-339, which walks mainPanel.main at :333-338), and detachStrayWidgets
 * (:364-376) unparents every LEFT/RIGHT dock widget whose id is missing from
 * that set. Clearing mainPanel therefore SHRINKS the set. A widget that is
 * side-docked right now but named in the target's stale main config used to
 * survive by being moved into the main area; with the main config gone it is
 * neither moved nor protected, so stock would newly unparent it. That is the
 * one behaviour this exemption would otherwise regress, and `afterSwitch`
 * re-docks exactly those widgets and nothing else. No other widget loses
 * protection: side-panel restore is purely additive (side-panel-handler.js
 * :229-262 adds a tab per item and removes none), so the left/right halves of
 * the keep-set are untouched by the strip.
 */

/**
 * The dock-config shape stock's own collectDockWidgetIds walks
 * (perspective-service.js:350-363). Declared structurally rather than imported
 * from Lumino: both arms are optional here, so one walk covers `tab-area` and
 * `split-area` without repeating stock's type discriminant.
 */
interface DockAreaLike {
    widgets?: Array<{ id?: string } | undefined>;
    children?: DockAreaLike[];
}

function collectDockIds(config: DockAreaLike | undefined, into: Set<string>): void {
    if (!config) {
        return;
    }
    for (const widget of config.widgets ?? []) {
        if (widget?.id) {
            into.add(widget.id);
        }
    }
    for (const child of config.children ?? []) {
        collectDockIds(child, into);
    }
}

@injectable()
export class MainAreaExemption implements FrontendApplicationContribution {

    @inject(PerspectiveService)
    protected readonly perspectives: PerspectiveService;

    @inject(PerspectiveServiceInternal)
    protected readonly internal: PerspectiveServiceInternal;

    /** Descriptors already chained. Re-chaining one would run the strip twice. */
    protected readonly exempted = new WeakSet<PerspectiveDescriptor>();

    /** Per perspective id, the widget ids the strip took out of its saved layout. */
    protected readonly strippedIds = new Map<string, Set<string>>();

    /** Where each side-docked widget sat when the current switch began. */
    protected sideDockedBefore = new Map<string, 'left' | 'right'>();

    onStart(): void {
        // Stock registers the 'default' descriptor itself (perspective-service.js
        // :77-81, from the initialize() hook, which runs before any onStart) and
        // gives it no onDeactivate -- so the first hole to close is the switch
        // AWAY from default on launch. Chaining it here rather than only at
        // onDidInitializeLayout makes the exemption independent of the order the
        // container happened to enumerate contributions in.
        this.exemptRegistered();
    }

    onDidInitializeLayout(): void {
        // Runs strictly after initializeLayout (frontend-application.js:66, then
        // :68) and therefore after ShellLayoutRestorer has hydrated savedLayouts
        // from disk: this is the first moment a PERSISTED stale main area exists
        // to strip. It is also late enough that every contribution which
        // registers descriptors in its own onStart has run, whichever order they
        // were enumerated in.
        this.exemptRegistered();
        this.stripSavedLayouts();
    }

    /**
     * Chain the strip onto every registered descriptor. Idempotent, and cheap
     * enough to repeat on every switch. `getRegisteredPerspectives()` hands back
     * stock's own descriptor objects (perspective-service.js:390-392 returns the
     * map values, not copies), so assigning the hooks here is what stock will
     * call at :123 and :146.
     */
    protected exemptRegistered(): void {
        for (const descriptor of this.perspectives.getRegisteredPerspectives()) {
            this.exempt(descriptor);
        }
    }

    protected exempt(descriptor: PerspectiveDescriptor): void {
        if (this.exempted.has(descriptor)) {
            return;
        }
        this.exempted.add(descriptor);
        const priorDeactivate = descriptor.onDeactivate?.bind(descriptor);
        const priorActivate = descriptor.onActivate?.bind(descriptor);
        // Both stock call sites (:122-124 and :145-147) sit OUTSIDE
        // doSwitchPerspective's try, so a hook that throws is the one way a
        // switch can reject -- and it would reject having half-applied the
        // layout. The guard covers the descriptor's own prior hook too, so the
        // organising slot seam can no longer break a switch either.
        descriptor.onDeactivate = shell => {
            try {
                priorDeactivate?.(shell);
                this.beforeSwitch(shell);
            } catch {
                // Nothing to report to the user: the worst case is that this one
                // switch restores a stale main area, which is stock behaviour.
            }
        };
        descriptor.onActivate = shell => {
            try {
                priorActivate?.(shell);
                this.afterSwitch(descriptor.id, shell);
            } catch {
                // As above -- a failed repair leaves a widget detached, never a
                // half-switched shell.
            }
        };
    }

    protected beforeSwitch(shell: ApplicationShell): void {
        // Custom modes register from user storage long after startup, so they are
        // chained here rather than only at boot: a custom is always registered
        // before the first switch INTO it, and that switch's deactivate hook runs
        // on the mode being left -- which chains the custom before the first
        // switch AWAY from it, the one that would read its saved layout.
        this.exemptRegistered();
        // Side docks only GAIN widgets between here and detachStrayWidgets --
        // side-panel restore adds tabs and removes none -- so a widget recorded
        // now is still side-docked when stock decides whether to unparent it.
        this.sideDockedBefore = new Map();
        for (const area of ['left', 'right'] as const) {
            for (const widget of shell.getWidgets(area)) {
                this.sideDockedBefore.set(widget.id, area);
            }
        }
        this.stripSavedLayouts();
    }

    /**
     * Strip every saved layout, not just the target's: onDeactivate is not told
     * where the switch is going. Stripping all of them is the same work and
     * leaves nothing for the read at :131 to find. The perspective being left is
     * re-saved whole a moment later at :126 and is stripped again the next time
     * a switch leaves it -- always before anyone reads it.
     */
    protected stripSavedLayouts(): void {
        for (const id of this.internal.getSavedPerspectiveIds()) {
            const layout = this.internal.getSavedLayout(id);
            if (!layout) {
                continue;
            }
            // A layout this pass already stripped (no switch has re-saved it since)
            // keeps the ids its first strip recorded: recording the empty set here
            // would leave afterSwitch nothing to repair once any other switch had
            // run in between.
            const fresh = layout.mainPanel !== undefined || layout.bottomPanel !== undefined;
            const removed = new Set<string>();
            collectDockIds(layout.mainPanel?.main as DockAreaLike | undefined, removed);
            collectDockIds(layout.bottomPanel?.config?.main as DockAreaLike | undefined, removed);
            delete layout.mainPanel;
            delete layout.mainPanelPinned;
            delete layout.bottomPanel;
            // Written back rather than relying on the object being stock's own
            // map value: the exemption should not depend on that aliasing.
            this.internal.setSavedLayout(id, layout);
            if (fresh) {
                this.strippedIds.set(id, removed);
            }
        }
    }

    /**
     * Repair the one thing the strip costs: a widget that was side-docked when
     * the switch began, was named in this perspective's now-stripped main or
     * bottom config, and so fell out of stock's keep-set and was unparented at
     * :136. Anything stock detached for its own reasons is left alone -- that
     * intersection is the whole point of tracking the removed ids.
     */
    protected afterSwitch(perspectiveId: string, shell: ApplicationShell): void {
        const removed = this.strippedIds.get(perspectiveId);
        if (!removed || removed.size === 0) {
            return;
        }
        for (const [widgetId, area] of this.sideDockedBefore) {
            if (!removed.has(widgetId)) {
                continue;
            }
            // getWidgetById resolves against the shell's FocusTracker
            // (application-shell.js:1923-1929), which RETAINS a detached widget
            // until disposal. That makes it the wrong answer to "is this docked?"
            // and the right one here: the widget being looked for is precisely
            // the one stock just unparented. Parentage decides, membership does
            // not.
            const widget = shell.getWidgetById(widgetId);
            if (widget && !widget.isDisposed && !widget.isAttached) {
                void shell.addWidget(widget, { area }).catch(() => undefined);
            }
        }
    }
}
