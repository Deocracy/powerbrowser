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

/** One row per ability derived from the pin (92 at Orca 1.4.248), sorted by ability. */
export const ORCA_BROWSER_ABILITIES: readonly OrcaBrowserAbility[] = Object.freeze([
    { ability: 'browser.back', tier: '1', mechanism: 'native', proof: 'orca-browser-agent-live' },
    { ability: 'browser.capture.start', tier: '1', mechanism: 'native', proof: 'orca-browser-agent-live' },
    { ability: 'browser.capture.stop', tier: '1', mechanism: 'native', proof: 'orca-browser-agent-live' },
    { ability: 'browser.certificate.proceed', tier: '2', mechanism: 'unavailable', proof: 'P66-18 (browser_command_unavailable)' },
    { ability: 'browser.check', tier: '1', mechanism: 'actor', proof: 'G2, orca-browser-agent-live' },
    { ability: 'browser.clear', tier: '1', mechanism: 'actor', proof: 'G2, orca-browser-agent-live' },
    { ability: 'browser.click', tier: '1', mechanism: 'actor', proof: 'G2, orca-browser-agent-live' },
    { ability: 'browser.clientHost.attach', tier: '1', mechanism: 'client', proof: 'G1, orca-browser-host-bundle' },
    { ability: 'browser.clientHost.commandResult', tier: '1', mechanism: 'client', proof: 'G1' },
    { ability: 'browser.clientHost.fileChannel.abort', tier: '2', mechanism: 'unavailable', proof: 'P66-18 (browser_command_unavailable)' },
    { ability: 'browser.clientHost.fileChannel.read', tier: '2', mechanism: 'unavailable', proof: 'P66-18 (browser_command_unavailable)' },
    { ability: 'browser.clientHost.fileChannel.write', tier: '2', mechanism: 'unavailable', proof: 'P66-18 (browser_command_unavailable)' },
    { ability: 'browser.clientHost.pageMetadata', tier: '1', mechanism: 'client', proof: 'G1' },
    { ability: 'browser.clipboardRead', tier: '2', mechanism: 'unavailable', proof: 'P66-18 (browser_command_unavailable)' },
    { ability: 'browser.clipboardWrite', tier: '2', mechanism: 'unavailable', proof: 'P66-18 (browser_command_unavailable)' },
    { ability: 'browser.console', tier: '1', mechanism: 'actor', proof: 'G8, orca-browser-agent-live' },
    { ability: 'browser.cookie.delete', tier: '1', mechanism: 'native', proof: 'orca-browser-agent-live' },
    { ability: 'browser.cookie.get', tier: '1', mechanism: 'native', proof: 'orca-browser-agent-live' },
    { ability: 'browser.cookie.set', tier: '1', mechanism: 'native', proof: 'orca-browser-agent-live' },
    { ability: 'browser.dblclick', tier: '1', mechanism: 'actor', proof: 'G2, orca-browser-agent-live' },
    { ability: 'browser.dialogAccept', tier: '1', mechanism: 'native', proof: 'G3 (A4)' },
    { ability: 'browser.dialogDismiss', tier: '1', mechanism: 'native', proof: 'G3 (A4)' },
    { ability: 'browser.download', tier: '2', mechanism: 'unavailable', proof: 'P66-18 (browser_command_unavailable)' },
    { ability: 'browser.drag', tier: '1', mechanism: 'actor', proof: 'G2, orca-browser-agent-live' },
    { ability: 'browser.eval', tier: '1', mechanism: 'actor', proof: 'G2, orca-browser-agent-live' },
    { ability: 'browser.exec', tier: '1 (subset)', mechanism: 'actor', proof: 'G2, orca-browser-agent-live' },
    { ability: 'browser.fill', tier: '1', mechanism: 'actor', proof: 'G2, orca-browser-agent-live' },
    { ability: 'browser.find', tier: '2', mechanism: 'unavailable', proof: 'P66-18 (browser_command_unavailable)' },
    { ability: 'browser.focus', tier: '1', mechanism: 'actor', proof: 'G2, orca-browser-agent-live' },
    { ability: 'browser.forward', tier: '1', mechanism: 'native', proof: 'orca-browser-agent-live' },
    { ability: 'browser.fullScreenshot', tier: '1', mechanism: 'native', proof: 'G4, orca-browser-agent-live' },
    { ability: 'browser.geolocation', tier: '2', mechanism: 'unavailable', proof: 'P66-18 (browser_command_unavailable)' },
    { ability: 'browser.get', tier: '2', mechanism: 'unavailable', proof: 'P66-18 (browser_command_unavailable)' },
    { ability: 'browser.goto', tier: '1', mechanism: 'native', proof: 'orca-browser-agent-live' },
    { ability: 'browser.highlight', tier: '2', mechanism: 'unavailable', proof: 'P66-18 (browser_command_unavailable)' },
    { ability: 'browser.hover', tier: '1', mechanism: 'actor', proof: 'G2, orca-browser-agent-live' },
    { ability: 'browser.identity.get', tier: '2', mechanism: 'unavailable', proof: 'P66-18 (browser_command_unavailable)' },
    { ability: 'browser.identity.set', tier: '2', mechanism: 'unavailable', proof: 'P66-18 (browser_command_unavailable)' },
    { ability: 'browser.intercept.disable', tier: '2', mechanism: 'unavailable', proof: 'P66-18 (browser_command_unavailable)' },
    { ability: 'browser.intercept.enable', tier: '2', mechanism: 'unavailable', proof: 'P66-18 (browser_command_unavailable)' },
    { ability: 'browser.intercept.list', tier: '2', mechanism: 'unavailable', proof: 'P66-18 (browser_command_unavailable)' },
    { ability: 'browser.is', tier: '2', mechanism: 'unavailable', proof: 'P66-18 (browser_command_unavailable)' },
    { ability: 'browser.keyboardInsertText', tier: '1', mechanism: 'actor', proof: 'G2, orca-browser-agent-live' },
    { ability: 'browser.keypress', tier: '1', mechanism: 'actor', proof: 'G2, orca-browser-agent-live' },
    { ability: 'browser.mouseClick', tier: '1', mechanism: 'actor', proof: 'G2, orca-browser-agent-live' },
    { ability: 'browser.mouseDown', tier: '1', mechanism: 'actor', proof: 'G2, orca-browser-agent-live' },
    { ability: 'browser.mouseMove', tier: '1', mechanism: 'actor', proof: 'G2, orca-browser-agent-live' },
    { ability: 'browser.mouseUp', tier: '1', mechanism: 'actor', proof: 'G2, orca-browser-agent-live' },
    { ability: 'browser.mouseWheel', tier: '1', mechanism: 'actor', proof: 'G2, orca-browser-agent-live' },
    { ability: 'browser.network', tier: '1', mechanism: 'native', proof: 'orca-browser-agent-live' },
    { ability: 'browser.openUrl', tier: '1', mechanism: 'orcad', proof: 'G6, orca-browser-agent-live' },
    { ability: 'browser.pdf', tier: '1', mechanism: 'native', proof: 'orca-browser-agent-live' },
    { ability: 'browser.profileClearDefaultCookies', tier: '3', mechanism: 'unavailable', proof: 'P66-18 (browser_command_unavailable)' },
    { ability: 'browser.profileClearGoogleCookies', tier: '3', mechanism: 'unavailable', proof: 'P66-18 (browser_command_unavailable)' },
    { ability: 'browser.profileCreate', tier: '3', mechanism: 'unavailable', proof: 'P66-18 (browser_command_unavailable)' },
    { ability: 'browser.profileDelete', tier: '3', mechanism: 'unavailable', proof: 'P66-18 (browser_command_unavailable)' },
    { ability: 'browser.profileDetectBrowsers', tier: '3', mechanism: 'unavailable', proof: 'P66-18 (browser_command_unavailable)' },
    { ability: 'browser.profileImportFromBrowser', tier: '3', mechanism: 'unavailable', proof: 'P66-18 (browser_command_unavailable)' },
    { ability: 'browser.profileList', tier: '3', mechanism: 'unavailable', proof: 'P66-18 (browser_command_unavailable)' },
    { ability: 'browser.reload', tier: '1', mechanism: 'native', proof: 'orca-browser-agent-live' },
    { ability: 'browser.screencast', tier: '3', mechanism: 'unavailable', proof: 'P66-18 (browser_command_unavailable)' },
    { ability: 'browser.screencast.unsubscribe', tier: '3', mechanism: 'unavailable', proof: 'P66-18 (browser_command_unavailable)' },
    { ability: 'browser.screenshot', tier: '1', mechanism: 'native', proof: 'G4, orca-browser-agent-live' },
    { ability: 'browser.scroll', tier: '1', mechanism: 'actor', proof: 'G2, orca-browser-agent-live' },
    { ability: 'browser.scrollIntoView', tier: '1', mechanism: 'actor', proof: 'G2, orca-browser-agent-live' },
    { ability: 'browser.select', tier: '1', mechanism: 'actor', proof: 'G2, orca-browser-agent-live' },
    { ability: 'browser.selectAll', tier: '1', mechanism: 'actor', proof: 'G2, orca-browser-agent-live' },
    { ability: 'browser.setCredentials', tier: '2', mechanism: 'unavailable', proof: 'P66-18 (browser_command_unavailable)' },
    { ability: 'browser.setDevice', tier: '2', mechanism: 'unavailable', proof: 'P66-18 (browser_command_unavailable)' },
    { ability: 'browser.setHeaders', tier: '2', mechanism: 'unavailable', proof: 'P66-18 (browser_command_unavailable)' },
    { ability: 'browser.setMedia', tier: '2', mechanism: 'unavailable', proof: 'P66-18 (browser_command_unavailable)' },
    { ability: 'browser.setOffline', tier: '2', mechanism: 'unavailable', proof: 'P66-18 (browser_command_unavailable)' },
    { ability: 'browser.snapshot', tier: '1', mechanism: 'actor', proof: 'G9, orca-browser-snapshot-live' },
    { ability: 'browser.storage.local.clear', tier: '2', mechanism: 'unavailable', proof: 'P66-18 (browser_command_unavailable)' },
    { ability: 'browser.storage.local.get', tier: '2', mechanism: 'unavailable', proof: 'P66-18 (browser_command_unavailable)' },
    { ability: 'browser.storage.local.set', tier: '2', mechanism: 'unavailable', proof: 'P66-18 (browser_command_unavailable)' },
    { ability: 'browser.storage.session.clear', tier: '2', mechanism: 'unavailable', proof: 'P66-18 (browser_command_unavailable)' },
    { ability: 'browser.storage.session.get', tier: '2', mechanism: 'unavailable', proof: 'P66-18 (browser_command_unavailable)' },
    { ability: 'browser.storage.session.set', tier: '2', mechanism: 'unavailable', proof: 'P66-18 (browser_command_unavailable)' },
    { ability: 'browser.tabClose', tier: '1', mechanism: 'orcad', proof: 'G7' },
    { ability: 'browser.tabCreate', tier: '1', mechanism: 'orcad', proof: 'G6, orca-browser-agent-live' },
    { ability: 'browser.tabCurrent', tier: '1', mechanism: 'orcad', proof: 'G6, orca-browser-agent-live' },
    { ability: 'browser.tabList', tier: '1', mechanism: 'orcad', proof: 'G6, orca-browser-agent-live' },
    { ability: 'browser.tabProfileClone', tier: '3', mechanism: 'unavailable', proof: 'P66-18 (browser_command_unavailable)' },
    { ability: 'browser.tabProfileShow', tier: '3', mechanism: 'unavailable', proof: 'P66-18 (browser_command_unavailable)' },
    { ability: 'browser.tabSetProfile', tier: '3', mechanism: 'unavailable', proof: 'P66-18 (browser_command_unavailable)' },
    { ability: 'browser.tabShow', tier: '1', mechanism: 'orcad', proof: 'G6, orca-browser-agent-live' },
    { ability: 'browser.tabSwitch', tier: '1', mechanism: 'orcad', proof: 'G6, orca-browser-agent-live' },
    { ability: 'browser.type', tier: '1', mechanism: 'actor', proof: 'G2, orca-browser-agent-live' },
    { ability: 'browser.upload', tier: '2', mechanism: 'unavailable', proof: 'P66-18 (browser_command_unavailable)' },
    { ability: 'browser.viewport', tier: '2', mechanism: 'unavailable', proof: 'P66-18 (browser_command_unavailable)' },
    { ability: 'browser.wait', tier: '1', mechanism: 'actor', proof: 'G2, orca-browser-agent-live' },
]);
