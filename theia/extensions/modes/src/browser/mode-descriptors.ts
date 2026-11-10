import { ApplicationShell } from '@theia/core/lib/browser';
import { PerspectiveDescriptor } from '@theia/core/lib/browser/perspective-service';

/**
 * GUI-07 (14-01): the three shipped mode defaults as stock perspective
 * descriptors, in contracted toggle order (Coding, Browsing, Organising).
 *
 * Modes are data with shipped defaults, never manifest flags: no `[modes]`
 * section exists anywhere, and custom modes (plan 14-02) register as
 * additional descriptors built from user-storage JSON — a custom mode never
 * mutates an entry of SHIPPED_MODES in place.
 *
 * Strip binding: the 13-01 spike re-probed GREEN and 14-UI-SPEC was amended
 * on 2026-09-08, so the tab strip changes home per mode. The chrome bar owns
 * that rule (chrome-bar-widget.tsx, applyStripHome), not a descriptor, so no
 * descriptor names the strip or the top area. Descriptors reshape side-panel
 * visibility and the main-area view only: Browsing (launch default) and
 * Organising collapse all three side areas; Coding leaves Explorer visible
 * with the remaining areas per saved layout.
 * Organising view is the Panorama canvas (Phase 15).
 */
const coding: PerspectiveDescriptor = {
    id: 'coding',
    label: 'Coding',
    viewPlacements: new Map<string, ApplicationShell.Area>([
        ['explorer-view-container', 'left'],
    ]),
};

const browsing: PerspectiveDescriptor = {
    id: 'browsing',
    label: 'Browsing',
    viewPlacements: new Map<string, ApplicationShell.Area>(),
    chromeOptions: { collapseAreas: ['left', 'right', 'bottom'] },
};

const organising: PerspectiveDescriptor = {
    id: 'organising',
    label: 'Organising',
    viewPlacements: new Map<string, ApplicationShell.Area>(),
    chromeOptions: { collapseAreas: ['left', 'right', 'bottom'] },
    // GUI-07 (14-02): the placeholder slot shows through the contribution
    // open path on activation and hides on deactivation; every other
    // descriptor stays untouched.
    onActivate: () => { openOrganisingSlot(); },
    onDeactivate: () => { closeOrganisingSlot(); },
};

// P64-18: the Orca mode. No activation hook: a mode switch starts no agent
// session and no PTY, and the switch path stays free of shell mutations. The
// main area is shared across modes, so Orca's hosted panes show here as the
// main-area tabs they are; Phase 65 adds the Orca side panel to the left area.
const orca: PerspectiveDescriptor = {
    id: 'orca',
    label: 'Orca',
    viewPlacements: new Map<string, ApplicationShell.Area>(),
    chromeOptions: { collapseAreas: ['left', 'right', 'bottom'] },
};

/** The shipped defaults in contracted order. Later plans append; never reorder here. */
export const SHIPPED_MODES: ReadonlyArray<PerspectiveDescriptor> = [coding, browsing, organising, orca];

/**
 * GUI-07 (14-02): the organising main-area slot seam.
 *
 * The organising descriptor's activation hooks (task 2) and the mode
 * service's switch path share these module functions so placeholder show and
 * hide stay one seam: the placeholder contribution registers its
 * contribution-routed open and close here at startup, and both callers stay
 * idempotent (open when open reveals, close when closed no-ops). Before the
 * contribution registers, both are silent no-ops -- never a throw.
 */
export interface OrganisingSlot {
    open(): void;
    close(): void;
}

let organisingSlot: OrganisingSlot | undefined = undefined;

/** Called once by the placeholder contribution at startup; never by anyone else. */
export function registerOrganisingSlot(slot: OrganisingSlot | undefined): void {
    organisingSlot = slot;
}

/** Show the organising placeholder through the registered contribution. */
export function openOrganisingSlot(): void {
    organisingSlot?.open();
}

/** Hide the organising placeholder through the registered contribution. */
export function closeOrganisingSlot(): void {
    organisingSlot?.close();
}
