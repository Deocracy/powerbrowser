/**
 * Phase 38 (EXT-07, D-02, D-11): the only geometry Theia reports for an extension popup. Chrome opens the popup in a
 * native XUL panel at this rect (Theia-frame CSS pixels; chrome adds the frame's offset and clamps it to the window).
 * The popup itself never renders in Theia DOM: overlays sit above the frame, so a DOM popup would be hidden.
 */
import { ExtensionAnchorRect } from '@powerbrowser/tab-uris/lib/browser/chrome-store-client';

/** The clicked button's anchorRect, sent with the extensionClick store kind. */
export function anchorRectOf(element: Element): ExtensionAnchorRect {
    const { left, top, width, height } = element.getBoundingClientRect();
    return { left, top, width, height };
}
