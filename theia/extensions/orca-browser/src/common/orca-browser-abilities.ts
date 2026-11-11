/**
 * Phase 66 (BRW-03; P66-11, P66-12, P66-17, P66-18, P66-19; research A4): what
 * Phase 66 built for each ability of Orca's browser at the pin.
 *
 * SERVED_AUTOMATION_METHODS is the dispatcher's served set: the 40 automation
 * methods of tier 1 or 1 (subset), the same list as chrome's AGENT_METHODS
 * (bridge message contract). An automation method outside it is answered
 * failed browser_command_unavailable and never reaches chrome (P66-18).
 *
 * ORCA_BROWSER_ABILITIES is the built record, one row per ability derived from
 * the pinned source: tier from the spike's DISPOSITIONS.md, the mechanism that
 * serves it, and the row or gate answer that proves it. DISPOSITIONS.md stays
 * the Phase 61 record and is not edited (P66-19). orca-browser-abilities derives
 * the abilities and tiers from the pin and compares them with this file.
 *
 * No import: the check transpiles and evaluates this file on its own.
 */

/** native: chrome-side code; actor: the PowerBrowserAgent child; client: this extension's host; orcad: orcad's client-page table; unavailable: answered browser_command_unavailable. */
export type OrcaBrowserMechanism = 'native' | 'actor' | 'client' | 'orcad' | 'unavailable';

export interface OrcaBrowserAbility {
    readonly ability: string;
    readonly tier: string;
    readonly mechanism: OrcaBrowserMechanism;
    readonly proof: string;
}

/** The served set, in the contract's order (66-02-PLAN interfaces, AGENT_METHODS). */
export const SERVED_AUTOMATION_METHODS: readonly string[] = Object.freeze([
    'browser.back', 'browser.capture.start', 'browser.capture.stop', 'browser.check', 'browser.clear', 'browser.click',
    'browser.console', 'browser.cookie.delete', 'browser.cookie.get', 'browser.cookie.set', 'browser.dblclick',
    'browser.dialogAccept', 'browser.dialogDismiss', 'browser.drag', 'browser.eval', 'browser.exec', 'browser.fill',
    'browser.focus', 'browser.forward', 'browser.fullScreenshot', 'browser.goto', 'browser.hover',
    'browser.keyboardInsertText', 'browser.keypress', 'browser.mouseClick', 'browser.mouseDown', 'browser.mouseMove',
    'browser.mouseUp', 'browser.mouseWheel', 'browser.network', 'browser.pdf', 'browser.reload', 'browser.screenshot',
    'browser.scroll', 'browser.scrollIntoView', 'browser.select', 'browser.selectAll', 'browser.snapshot', 'browser.type',
    'browser.wait',
]);

/** One row per derived ability (Task 2 of 66-02 fills all of them). */
export const ORCA_BROWSER_ABILITIES: readonly OrcaBrowserAbility[] = Object.freeze([]);
