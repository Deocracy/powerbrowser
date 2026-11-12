#!/usr/bin/env node
// scripts/verify-orca-browser-agent-live.mjs
//
// orca-browser-agent-live (Phase 66, BRW-02/BRW-03; P66-30, P66-29, P66-26, P66-09, P66-03,
// A1, A3, A7; ROADMAP Phase 66 criteria 1 and 2): Orca agents drive PowerBrowser web tabs
// through PB's orcad and the client host, on the merged, built tree, through the Orca CLI.
//
// Clauses, in run order (each a pure exported verdict over recorded observations):
//  (k) no Orca pane, first in the session: zero Orca-pane widgets before and after, after a
//      positive read that the pane bundle booted and the link global is present; one CLI
//      tab create gives exactly one web tab within 1 s (the host comes up at frontend start).
//  (a) with a user web tab current, tab create makes exactly one new agent web tab, not
//      current, within 1 s measured to addWidget, bound in the page table.
//  (b) goto gives the fixture title; click raises the button's counter; type sets the input;
//      screenshot's pixel at CSS (120, 100) x DPR is the planted red, a pixel outside is not;
//      the screenshot half runs again in a second launch at layout.css.devPixelsPerPx 2.
//  (c) focus: the agent document's activeElement moves to the input on a CLI focus (the
//      positive read), then the user tab's document focus and activeElement, chrome's
//      focused overlay and the user's blur log are unchanged, and chrome's elementFromPoint
//      at the agent target is not the agent overlay (A1 parking).
//  (d) refusals: an invented page id fails with orcad's error.code; a raw webTabAgent for a
//      real user tab answers not-agent-tab and for a real stock-window tab unknown-tab.
//  (e) container (P66-26): the agent tab reads a cookie it set itself (positive), then a
//      cookie a user tab set on the same host is not visible to the agent.
//  (e2) container id (66-06): chrome reads the agent overlay's userContextId, which must equal
//      the agent container's pref and not be 0, after the positive read of a user overlay at 0.
//  (l) saved logins (66-06, coordinator finding 3): a login saved in the scratch profile for the
//      fixture origin is autofilled in a user web tab (the positive read, and chrome finds the
//      LoginManager actor on the user tab's window global); in an agent tab the same form stays
//      empty, the window global has no LoginManager actor, and an agent-typed submit adds no
//      login. The saved password is generated in memory, compared by length only, never printed.
//  (m) HTTP auth (66-06): an agent tab loads a loopback page answering 401 Basic; chrome must
//      find the auth commonDialog the page opened (the detector), then the agent's
//      browser.dialogAccept is refused with browser_command_unavailable and the prompt stays;
//      closing the tab then closes the prompt (an orphaned window-modal prompt keeps the keyboard).
//  (c2) typing focus (66-06): the user types into a user tab (positive read: the keys land);
//      then the parked agent page calls window.focus() and element.focus() on a timer (positive
//      read: its own activeElement moves) while the user keeps typing; every key must land in
//      the user tab, none in the agent page, and the user records no blur.
//  (f) decoy (P66-29): verify-orca-hidden-electron's exported run proves both orcad-emitted
//      detectors fire on stock orcad in this invocation; then, with the decoy at
//      ~/.local/bin/orca-ide in this session's scratch HOME, tab create and goto through PB's
//      orcad give the expected title and no decoy record file in orcad's data root.
//  (g) renderer path (A3): in the Theia document, Orca's own window.api placement call
//      answers the client host, and browser.tabCreate through the pane client's own
//      connection arrives as createPage (bound in the page table), with no
//      browser_host_lease_stale; the record names the credential path (token or device-key).
//  (h) user close (A7): a Lumino close of an agent tab removes its page from tab list.
//  (j) activation (P66-09, D-34): a CLI create with a user tab current leaves the current
//      widget and the user's focus alone (after the positive read that the page is bound and
//      listed); the page then has an Orca store row, listed inactive (D-34: the pane entry
//      adds it); Orca's own selection of that row (the bundle's selectBrowserPage, which runs
//      focusBrowserTabInWorktree) must first turn the record active (the detector), then the
//      bound web tab must become current within 1000 ms, and no second web tab opens. A CLI
//      tab switch cannot be the source: orcad's session snapshot lists no client-hosted page
//      (measured, 66-07), so no client store sees it.
//  (n) agent opens (66-08, D-35): from a user web tab on /opener, a target=_blank link click and a
//      window.open each adopt as exactly one non-agent web tab, and a window.open with features opens
//      one stock window (the detectors: tab count, window count and the server's request log). Then,
//      from an agent tab on the same page, a target=_blank link click, a target=_blank form submit,
//      window.open with and without features (browser.eval), a middle-click on a link
//      (browser.mouseClick) and Control+Enter on a focused link (browser.keypress) create no web tab
//      and no window and load nothing; window.open answers null or throws; the middle-click and the
//      Control+Enter commands answer failed browser_command_unavailable; the main area's current tab,
//      chrome's focused overlay and the active window are unchanged; chrome reads
//      SANDBOXED_AUXILIARY_NAVIGATION on the agent overlay and not on the user's. Last, the agent's own
//      plain link click still navigates its own tab (D-35 keeps it).
//  (o) downloads (66-09, D-37): a user web tab's click on a PDF attachment link saves the file into the scratch
//      profile's download folder first (the detector). Then, from an agent tab, the same kind of link (browser.click)
//      and a browser.goto of an attachment each reach the fixture server (the second detector) and leave the folder's
//      listing and the downloads list unchanged, open no window, leave the main area's current tab alone, and answer
//      failed browser_command_unavailable.
//  (p) external protocols (66-09, D-37): with a stub application registered in the scratch profile for mailto:, for a
//      scheme whose launch the fixture origin was granted (in the user's and the agent's container) and for a scheme
//      that asks, a user tab's clicks launch the stub for the first two and raise one dialog window for the third (the
//      detectors). The same three clicks from an agent tab launch nothing, open no window and each answer failed
//      browser_command_unavailable.
//  (q) first document (66-09, D-37): an agent tab created for a URL whose headers are held is on its initial
//      about:blank (chrome reads isInitialDocument, the detector); there a browser.mouseClick and a browser.eval of
//      window.open with features each answer failed browser_command_unavailable, and no window opens and nothing loads.
//      Once the first load commits, an eval answers again (the guard ends with the initial document).
//  (r) clipboard (66-10, D-38): in a user tab on /clip, with user activation, an execCommand copy, a same-origin frame's
//      writeText and the page's writeText each put their marker on the clipboard, and a user Control+v pastes the user
//      marker (the detectors). Then the agent's click on the same page's button (whose handler runs execCommand copy,
//      writeText from the page and its frame, and readText) leaves the clipboard on the user marker, each async call
//      answers rejected NotAllowedError, and the agent's Control+v, Shift+Insert and Control+c answer failed
//      browser_command_unavailable and paste nothing, while its Control+a still runs. Chrome compares the clipboard with
//      the run's markers and answers a marker name only; the user's own clipboard text is restored, never printed.
//  (s) site permissions (66-10, D-39): with permissions.isolateBy.userContext true, a notification permission granted
//      to the fixture origin in the default container reads granted in a user tab (the detector) and default in the
//      agent tab; granted in the agent container, the agent tab reads granted (the second detector).
//  (i) reload, last: a frontend reload leaves no agent web tab, the host re-attaches, and
//      tab list no longer lists the old pages.
//
// Agent documents are read through the bridge's own browser.eval (ctx.inAgent): agent tabs are
// not WebDriver BiDi contexts, because their message manager group has no BiDi frame actor.
//
// Tier: full, under flock /home/chris/coding/Power-Browser/.git/pb-live.lock. A named SKIP
// (exit 0) without lane p66-03's AGENT_METHODS, lane p66-02's extension, a built PowerBrowser
// or lane p66-01's built host bundle. --self-test is quick and hermetic: the verdicts over a
// control observation set and one planted fault each.
//
// Usage:
//   node scripts/verify-orca-browser-agent-live.mjs
//   node scripts/verify-orca-browser-agent-live.mjs --self-test

import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CLIP_MARKERS, INSIDE, OUTSIDE, PROTOCOL_ASK, PROTOCOL_PROBE, PROTOCOL_RUN, RED, SLOW_HEADERS_MS, prerequisites } from './lib/orca-browser-live.mjs';

const NAME = 'orca-browser-agent-live';
const REPO_ROOT = resolve(fileURLToPath(import.meta.url), '..', '..');
const CREATE_MS = 1000;
const REVEAL_MS = 1000;
const sameRgb = (a, b) => Array.isArray(a) && a.length >= 3 && a.slice(0, 3).every((v, i) => Math.abs(v - b[i]) <= 8);

// ---------------------------------------------------------------- verdicts

export function verdictNoPane(o) {
    if (!o.bundleBooted || !o.linkPresent) return ['detector blind: the no-pane clause ran without the booted bundle and the link global'];
    const f = [];
    if (o.paneWidgetsBefore !== 0 || o.paneWidgetsAfter !== 0) f.push(`Orca-pane widget present during the no-pane clause (${o.paneWidgetsBefore} before, ${o.paneWidgetsAfter} after)`);
    if (o.newTabs === 0) f.push('no web tab from the no-pane create');
    if (o.newTabs > 1) f.push(`two tabs for one page from the no-pane create (${o.newTabs})`);
    if (o.newTabs === 1 && !(o.ms !== null && o.ms <= CREATE_MS)) f.push(`the no-pane create was slower than ${CREATE_MS} ms (${o.ms})`);
    return f;
}

export function verdictCreate(o) {
    if (!o.ok) return [`tab create failed: ${o.code}`];
    if (o.newTabs.length === 0) return ['no web tab from tab create'];
    const f = [];
    if (o.newTabs.length > 1) f.push(`two tabs for one page (${o.newTabs.length})`);
    const [t] = o.newTabs;
    if (t.current) f.push('a tab current at create');
    if (!t.agent) f.push('the created tab is not an agent tab');
    if (!(o.ms !== null && o.ms <= CREATE_MS)) f.push(`create slower than ${CREATE_MS} ms (${o.ms}) measured to addWidget`);
    if (o.boundTab !== t.tabId) f.push('the page table does not bind the new tab');
    return f;
}

export function verdictActs(o) {
    const f = [];
    if (o.title !== o.expectedTitle) f.push(`goto gave title ${JSON.stringify(o.title)}, not ${JSON.stringify(o.expectedTitle)}`);
    if (o.clickCount !== '1') f.push(`click left the counter at ${JSON.stringify(o.clickCount)}, not "1"`);
    if (o.typed !== o.expectedTyped) f.push(`type gave input value ${JSON.stringify(o.typed)}, not ${JSON.stringify(o.expectedTyped)}`);
    return f;
}

export function verdictScreenshot(o) {
    if (o.deviceDpr !== o.dpr) return [`device check: the page's devicePixelRatio is ${o.deviceDpr}, not ${o.dpr}`];
    if (!o.ok) return [`screenshot failed: ${o.code}`];
    const f = [];
    if (o.size[0] !== Math.round(o.viewportCss[0] * o.dpr)) f.push(`screenshot pixel off by the DPR: the image is ${o.size[0]} px wide for a ${o.viewportCss[0]} CSS px viewport at DPR ${o.dpr}`);
    if (!sameRgb(o.inside, RED)) f.push(`screenshot pixel at CSS (${INSIDE.x}, ${INSIDE.y}) x DPR ${o.dpr} is ${JSON.stringify(o.inside)}, not the planted red`);
    if (sameRgb(o.outside, RED)) f.push(`screenshot pixel at CSS (${OUTSIDE.x}, ${OUTSIDE.y}) outside the target is red`);
    return f;
}

export function verdictFocus(o) {
    if (o.agentActiveAfterFocus !== 'in') return [`detector blind: a CLI focus never moved the agent document's activeElement (${JSON.stringify(o.agentActiveAfterFocus)})`];
    const f = [];
    if (o.before.chrome !== o.after.chrome) f.push(`chrome focus moved: ${o.before.chrome} -> ${o.after.chrome}`);
    if (o.before.userHasFocus !== o.after.userHasFocus || o.before.userActive !== o.after.userActive) f.push('user focus changed while the agent typed');
    if (o.userBlurs.length) f.push(`a user blur was recorded: ${o.userBlurs.join(', ')}`);
    if (o.chromeHitIsAgent) f.push('the agent overlay is under the pointer at its target in chrome (not parked)');
    return f;
}

export function verdictRefusals(o) {
    const f = [];
    if (o.invented.ok) f.push('an invented page id was served');
    else if (!o.invented.code) f.push('the invented page refusal carries no error.code');
    if (o.userTab !== 'not-agent-tab') f.push(`the user tab answered ${o.userTab}, not not-agent-tab`);
    if (o.stockTab !== 'unknown-tab') f.push(`the stock-window tab answered ${o.stockTab}, not unknown-tab`);
    return f;
}

export function verdictContainer(o) {
    if (!o.ownRead) return ['detector blind: the agent tab did not read the cookie it set itself'];
    if (!o.userCookieSet) return ['detector blind: the user tab did not hold its own cookie'];
    return o.userVisible ? ['the user cookie is visible to the agent tab'] : [];
}

export function verdictContainerId(o) {
    if (o.userContext !== 0) return [`detector blind: the user overlay's userContextId read ${JSON.stringify(o.userContext)}, not 0`];
    const f = [];
    if (!Number.isInteger(o.agentContext) || o.agentContext === 0) f.push(`the agent tab is not in a container (userContextId ${JSON.stringify(o.agentContext)})`);
    else if (o.agentContext !== o.containerPref) f.push(`the agent tab's userContextId ${o.agentContext} is not the agent container ${o.containerPref}`);
    return f;
}

export function verdictLogins(o) {
    if (!o.saved) return ['detector blind: the scratch login was not saved'];
    if (!o.userFilled || !o.userActor) return [`detector blind: the saved login was not autofilled in the user tab (filled ${o.userFilled}, LoginManager actor ${o.userActor})`];
    const f = [];
    if (o.agentFilled) f.push('the saved login was autofilled in the agent tab');
    if (o.agentActor) f.push("the agent tab's window global has a LoginManager actor");
    if (!o.agentSubmitted) f.push('detector blind: the agent submit did not leave the login page');
    if (o.capturedAfter > 0) f.push(`the agent submit stored ${o.capturedAfter} login(s)`);
    return f;
}

export function verdictAuth(o) {
    if (!o.promptSeen) return ['detector blind: no HTTP auth dialog was found for the agent tab'];
    const f = [];
    if (o.reply.where !== 'failed' || o.reply.code !== 'browser_command_unavailable') f.push(`the agent's dialogAccept on an HTTP auth prompt answered ${o.reply.where}${o.reply.code ? ` ${o.reply.code}` : ''}, not failed browser_command_unavailable`);
    if (!o.promptAfter) f.push('the HTTP auth prompt was closed by the agent');
    if (o.authorized) f.push('the server received credentials from the agent tab');
    if (o.promptAfterClose) f.push("the HTTP auth prompt outlived its closed tab (it keeps the user's keyboard)");
    return f;
}

export function verdictTyping(o) {
    if (o.controlTyped !== o.controlExpected) return [`detector blind: the user's keys did not land in the user tab before the agent ran (${JSON.stringify(o.controlTyped)}${o.controlDiag ? `; ${o.controlDiag}` : ''})`];
    if (o.agentSelfActive !== 'in') return [`detector blind: the agent page's own focus() never moved its activeElement (${JSON.stringify(o.agentSelfActive)})`];
    const f = [];
    if (o.userTyped !== o.userExpected) f.push(`keys typed while the agent page called focus() landed elsewhere: the user input reads ${JSON.stringify(o.userTyped)}, not ${JSON.stringify(o.userExpected)}`);
    if (o.agentValue !== '') f.push(`the parked agent page received keys (${JSON.stringify(o.agentValue)})`);
    if (o.userBlurs.length) f.push(`a user blur was recorded while typing: ${o.userBlurs.join(', ')}`);
    if (o.chromeBefore !== o.chromeAfter) f.push(`chrome focus moved while typing: ${o.chromeBefore} -> ${o.chromeAfter}`);
    return f;
}

export function verdictDecoy(o) {
    if (!o.stock?.pass) return [`detector blind: the stock decoy run did not prove both detectors (${(o.stock?.fails ?? []).join('; ') || 'no result'})`];
    const f = [];
    if (!o.createOk) f.push(`tab create through PB's orcad failed: ${o.code}`);
    if (o.title !== o.expectedTitle) f.push(`goto through PB's orcad gave ${JSON.stringify(o.title)}, not ${JSON.stringify(o.expectedTitle)}${o.gotoCode ? ` (${o.gotoCode})` : ''}`);
    if (o.quietMs < o.minQuietMs) f.push(`judged after ${o.quietMs} ms, before the ${o.minQuietMs} ms quiet window`);
    if (o.markerPresent) f.push("a decoy marker is present: PB's orcad launched the decoy");
    return f;
}

export function verdictRenderer(o) {
    if (o.reply.code === 'browser_host_lease_stale') return ['device mismatch: the renderer create was refused with browser_host_lease_stale'];
    const f = [];
    if (o.placement.kind !== 'client') f.push(`the renderer's placement is ${o.placement.kind}, not the client host`);
    if (!o.reply.ok) f.push(`the renderer's browser.tabCreate failed: ${o.reply.code}`);
    else if (!o.createPageArrived) f.push('the renderer page did not arrive as createPage on the host');
    if (o.credential !== 'token' && o.credential !== 'device-key') f.push('the credential path was not recorded');
    return f;
}

export function verdictUserClose(o) {
    if (!o.closed) return ['the Lumino close found no agent widget'];
    return o.listedAfter ? ['the page is still listed after a user close'] : [];
}

export function verdictReload(o) {
    const f = [];
    if (o.agentWidgetsAfter > 0) f.push(`an agent widget survived a reload (${o.agentWidgetsAfter})`);
    if (!o.reattached) f.push(`the host did not re-attach after the reload${o.diag ? ` (${o.diag})` : ''}`);
    if (o.oldListed.length) f.push(`old pages are still listed after the reload (${o.oldListed.length})`);
    return f;
}

export function verdictActivation(o) {
    if (!o.bound || !o.listed) return ['detector blind: the new page was not bound and listed before the create was judged'];
    if (o.currentBefore !== o.userWidget) return [`detector blind: the user tab was not the main area's current tab before the create (${o.currentBefore ?? 'none'})`];
    const f = [];
    if (o.currentAfterCreate !== o.currentBefore) f.push('a tab revealed at its own create');
    if (o.userFocusAfter !== o.userFocusBefore) f.push('the user focus changed at create');
    if (!o.rowListed) return [...f, 'the page has no Orca store row after its create (D-34)'];
    if (o.rowActive) f.push('the page\'s store row was active at its create');
    if (!o.activationSeen) return [...f, 'detector blind: store activation not observed'];
    if (o.currentAfterActivation !== o.boundWidget || !(o.revealMs !== null && o.revealMs <= REVEAL_MS)) f.push(`the store activation revealed nothing within ${REVEAL_MS} ms (current ${o.currentAfterActivation ?? 'none'})`);
    if (o.webTabsAfter !== o.webTabsBefore) f.push(`the store activation changed the web tab count (${o.webTabsBefore} -> ${o.webTabsAfter})`);
    return f;
}

export function verdictOpens(o) {
    const u = o.user;
    const a = o.agent;
    if (u.linkTabs !== 1 || u.openTabs !== 1 || u.linkLoads < 1 || u.openLoads < 1) return [`detector blind: a user tab's target link and window.open did not each adopt as one loaded tab (link ${u.linkTabs} tab(s) ${u.linkLoads} load(s), window.open ${u.openTabs} tab(s) ${u.openLoads} load(s))`];
    if (u.agentAmong) return ['detector blind: a tab a user page opened is an agent tab'];
    if (u.popupWindows !== 1) return [`detector blind: a user tab's window.open with features opened ${u.popupWindows} window(s), not one`];
    if (!a.currentBefore) return ['detector blind: no main-area current tab before the agent opens'];
    const f = [];
    if (a.newTabs) f.push(`the agent page's opens created ${a.newTabs} web tab(s)`);
    if (a.newWindows) f.push(`the agent page's opens created ${a.newWindows} window(s)`);
    if (a.loads) f.push(`the agent page's opens loaded ${a.loads} page(s)`);
    if (a.openReturned !== 'null' && !String(a.openReturned).startsWith('threw')) f.push(`the agent page's window.open answered ${a.openReturned}, not null`);
    if (a.popupReturned !== 'null' && !String(a.popupReturned).startsWith('threw')) f.push(`the agent page's window.open with features answered ${a.popupReturned}, not null`);
    for (const [what, reply] of [['middle-click on a link', a.middleReply], ['Control+Enter on a link', a.enterReply]]) {
        if (reply !== 'failed browser_command_unavailable') f.push(`the agent's ${what} answered ${reply}, not failed browser_command_unavailable`);
    }
    if (a.currentAfter !== a.currentBefore) f.push(`the main area's current tab changed (${a.currentBefore} -> ${a.currentAfter})`);
    if (a.chromeAfter !== a.chromeBefore || a.shellActiveAfter !== a.shellActiveBefore) f.push('the user focus moved during the agent opens');
    if (!(a.sandboxFlags & 2)) f.push(`the agent overlay lacks SANDBOXED_AUXILIARY_NAVIGATION (sandboxFlags ${a.sandboxFlags})`);
    if (u.sandboxFlags & 2) f.push('a user overlay has SANDBOXED_AUXILIARY_NAVIGATION');
    if (!a.ownNavigation) f.push("the agent's own plain link click did not navigate its own tab");
    return f;
}

const REFUSED = 'failed browser_command_unavailable';

export function verdictDownloads(o) {
    const u = o.user;
    const a = o.agent;
    if (!u.saved) return [`detector blind: a user tab's PDF attachment download saved no file to the profile's download folder (${u.files.join(', ') || 'empty'})`];
    if (u.rowsAdded < 1) return ['detector blind: a user tab\'s download added no row to the downloads list'];
    if (a.requests < 2) return [`detector blind: the agent's click and goto reached the fixture server ${a.requests} time(s), not twice, so the wall was never asked`];
    const f = [];
    if (a.filesAfter.join('|') !== a.filesBefore.join('|')) f.push(`the agent page's downloads changed the download folder (${a.filesBefore.join(', ') || 'empty'} -> ${a.filesAfter.join(', ') || 'empty'})`);
    if (a.rowsAfter !== a.rowsBefore) f.push(`the agent page's downloads added ${a.rowsAfter - a.rowsBefore} row(s) to the downloads list`);
    if (a.newWindows) f.push(`the agent page's downloads opened ${a.newWindows} window(s)`);
    for (const [what, reply] of [['click on a PDF attachment link', a.clickReply], ['goto of a PDF attachment', a.gotoReply]]) {
        if (reply !== REFUSED) f.push(`the agent's ${what} answered ${reply}, not ${REFUSED}`);
    }
    if (a.currentAfter !== a.currentBefore) f.push(`the main area's current tab changed during the agent downloads (${a.currentBefore} -> ${a.currentAfter})`);
    return f;
}

export function verdictProtocols(o) {
    const u = o.user;
    const a = o.agent;
    if (!u.mailtoLaunched || !u.runLaunched) return [`detector blind: a user tab's mailto: and ${PROTOCOL_RUN}: clicks did not each launch the stub application (mailto ${u.mailtoLaunched}, ${PROTOCOL_RUN} ${u.runLaunched})`];
    if (u.askWindows !== 1) return [`detector blind: a user tab's ${PROTOCOL_ASK}: click opened ${u.askWindows} dialog window(s), not one`];
    const f = [];
    if (a.launches) f.push(`the agent page's protocol links launched the stub application ${a.launches} time(s)`);
    if (a.newWindows) f.push(`the agent page's protocol links opened ${a.newWindows} window(s)`);
    for (const [what, reply] of Object.entries(a.replies)) {
        if (reply !== REFUSED) f.push(`the agent's click on a ${what} link answered ${reply}, not ${REFUSED}`);
    }
    return f;
}

export function verdictFirstDocument(o) {
    if (!o.created) return ['the agent tab for the held first load was not created'];
    if (o.initialBefore !== true) return [`detector blind: the agent overlay was not on its initial about:blank when the commands ran (isInitialDocument ${o.initialBefore})`];
    const f = [];
    for (const [what, reply] of [['browser.mouseClick', o.clickReply], ['browser.eval of window.open with features', o.popupReply]]) {
        if (reply !== REFUSED) f.push(`${what} on the initial about:blank answered ${reply}, not ${REFUSED}`);
    }
    if (o.newWindows) f.push(`a command on the initial about:blank opened ${o.newWindows} window(s)`);
    if (o.loads) f.push(`a command on the initial about:blank loaded ${o.loads} page(s)`);
    if (o.initialAfter !== false || o.evalAfter !== 'done /slow') f.push(`after the first load committed an eval answered ${o.evalAfter} (isInitialDocument ${o.initialAfter}), so the guard outlived the initial document`);
    return f;
}

const REJECTED = 'rejected NotAllowedError';

export function verdictClipboard(o) {
    const u = o.user;
    const a = o.agent;
    if (u.copy !== 'copy' || u.frame !== 'frame' || u.write !== 'user') return [`detector blind: a user tab's execCommand copy, frame writeText and writeText left the clipboard on ${u.copy}, ${u.frame}, ${u.write}, not copy, frame, user`];
    if (u.pasted !== 'user') return [`detector blind: a user tab's Control+v pasted ${u.pasted}, not the user marker`];
    if (a.clickReply !== 'done' || a.rec?.clicked !== true) return [`detector blind: the agent's click on the clipboard button answered ${a.clickReply} and its handler ${a.rec?.clicked ? 'ran' : 'never ran'}`];
    if (a.rec.active === false) return ['detector blind: the agent click gave the page no user activation, so a refusal proves nothing'];
    if (a.controlReply !== 'done') return [`detector blind: the agent's Control+a answered ${a.controlReply}, so keypress itself is broken`];
    const f = [];
    if (a.afterClick !== 'user') f.push(`the agent page's click changed the clipboard to ${a.afterClick}`);
    for (const k of ['writeText', 'frameWrite', 'readText']) {
        if (a.rec[k] !== REJECTED) f.push(`the agent page's ${k} answered ${a.rec[k]}, not ${REJECTED}`);
    }
    for (const [what, reply] of [['Control+v', a.ctrlV], ['Shift+Insert', a.shiftInsert], ['Control+c', a.ctrlC]]) {
        if (reply !== REFUSED) f.push(`the agent's ${what} answered ${reply}, not ${REFUSED}`);
    }
    if (a.input !== 'empty') f.push(`the agent page's input holds ${a.input} after the agent's paste keys`);
    if (a.afterKeys !== 'user') f.push(`the agent's keys changed the clipboard to ${a.afterKeys}`);
    return f;
}

export function verdictPermissions(o) {
    if (o.pref !== true) return [`permissions.isolateBy.userContext reads ${o.pref} in the running browser, not true`];
    if (o.user !== 'granted') return [`detector blind: a user tab read the default-container grant as ${o.user}, not granted`];
    if (o.agentOwn !== 'granted') return [`detector blind: the agent tab read its own container's grant as ${o.agentOwn}, not granted`];
    return o.agent === 'default' ? [] : [`the agent tab read the user's default-container grant as ${o.agent}, not default`];
}

export const VERDICTS = {
    k: verdictNoPane, a: verdictCreate, b: verdictActs, b1: verdictScreenshot, b2: verdictScreenshot, c: verdictFocus,
    d: verdictRefusals, e: verdictContainer, e2: verdictContainerId, l: verdictLogins, m: verdictAuth, c2: verdictTyping, n: verdictOpens,
    o: verdictDownloads, p: verdictProtocols, q: verdictFirstDocument, r: verdictClipboard, s: verdictPermissions, f: verdictDecoy, g: verdictRenderer, h: verdictUserClose, j: verdictActivation, i: verdictReload,
};

/** Every clause's fails, each prefixed by its letter; skipped clauses ({ skip }) are listed apart. */
export function judgeAll(obs) {
    const fails = [];
    const skips = [];
    for (const [k, verdict] of Object.entries(VERDICTS)) {
        if (!obs[k]) fails.push(`(${k}) broken instrument: no observation recorded`);
        else if (obs[k].skip) skips.push(`(${k}) ${obs[k].skip}`);
        else for (const s of verdict(obs[k])) fails.push(`(${k}) ${s}`);
    }
    return { fails, skips };
}

// ---------------------------------------------------------------- live run

const listIds = (r) => (r.ok ? (r.result?.tabs ?? []).map((t) => t.browserPageId) : []);
const cookieNames = (r) => (r.ok ? (r.result?.cookies ?? []).map((c) => c.name) : []);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** tab create with the addWidget clock; resolves the (a) observation plus pageId. */
async function createObserved(ctx) {
    const before = (await ctx.webTabs()).map((w) => w.id);
    const r = await ctx.cli('tab', 'create', '--worktree', ctx.worktree);
    const pageId = r.result?.browserPageId ?? null;
    const { tabs, addT } = await ctx.newWebTab(before, r.t0);
    const boundTab = pageId ? await ctx.tabOfPage(pageId) : null;
    return { ok: r.ok, code: r.error?.code ?? r.error?.message, pageId, newTabs: tabs, ms: addT === null ? null : addT - r.t0, boundTab, widgetId: tabs[0]?.id ?? null };
}

async function screenshotObserved(ctx, pageId) {
    await ctx.cli('goto', '--url', ctx.url('/agent'), '--page', pageId);
    const tabId = await ctx.tabOfPage(pageId);
    const [w, h, deviceDpr] = (await ctx.inAgent(tabId, '[innerWidth, innerHeight, devicePixelRatio]')) ?? [0, 0, null];
    const r = await ctx.cli('screenshot', '--page', pageId);
    const base = { dpr: ctx.dpr, deviceDpr, ok: r.ok && !!r.result?.path, code: r.error?.code ?? r.error?.message, viewportCss: [w, h] };
    if (!base.ok) return { ...base, size: [0, 0], inside: null, outside: null };
    const at = (p) => ({ x: Math.round(p.x * ctx.dpr), y: Math.round(p.y * ctx.dpr) });
    const { size, px } = await ctx.pixels(r.result.path, [at(INSIDE), at(OUTSIDE)]);
    return { ...base, size, inside: px[0], outside: px[1] };
}

const userFocus = (ctx) => ctx.inPage('/user', '({ hasFocus: document.hasFocus(), active: document.activeElement && (document.activeElement.id || document.activeElement.nodeName), blurs: __log.filter(e => e.type === "blur").map(e => e.target) })');

const LOGIN_USER = 'pbuser';
const countLogins = (ctx, username) => ctx.inChrome(`return Services.logins.getAllLogins().then(all => all.filter(l => l.username === ${JSON.stringify(username)}).length);`);
const loginActor = (ctx, tabId) => ctx.inChrome(`const o = overlayOf(${JSON.stringify(tabId)}); const wg = o && o.browsingContext && o.browsingContext.currentWindowGlobal;
    if (!wg) return null; try { return !!wg.getExistingActor('LoginManager'); } catch (e) { return false; }`);

/** (l): a scratch login, autofilled in a user tab, absent from the agent tab; the password never leaves memory. */
async function loginsObserved(ctx, agentTabId, page) {
    const origin = new URL(ctx.url('/login')).origin;
    const secret = `pb-${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
    // The harness's WebDriver session sets signon.rememberSignons and signon.autofillForms to false (remote agent
    // recommended prefs); a user's profile has them at the default true, so the clause restores the defaults first.
    await ctx.inChrome(`Services.prefs.clearUserPref('signon.rememberSignons'); Services.prefs.clearUserPref('signon.autofillForms');
        Services.prefs.setBoolPref('signon.rememberSignons', true); Services.prefs.setBoolPref('signon.autofillForms', true); return true;`);
    const saved = await ctx.inChrome(`const li = Cc['@mozilla.org/login-manager/loginInfo;1'].createInstance(Ci.nsILoginInfo);
        li.init(${JSON.stringify(origin)}, ${JSON.stringify(origin)}, null, ${JSON.stringify(LOGIN_USER)}, ${JSON.stringify(secret)}, 'u', 'p');
        return Services.logins.addLoginAsync(li).then(() => true, () => false);`);
    const userTab = await ctx.openWebTab(ctx.url('/login'));
    const userFilled = await ctx.pollFor(() => ctx.inPage('/login', `document.getElementById('u').value === ${JSON.stringify(LOGIN_USER)} && document.getElementById('p').value.length === ${secret.length}`).then((v) => v || null), 10000, 'the user tab autofill').catch(() => false);
    const userActor = await loginActor(ctx, userTab);
    await ctx.cli('goto', '--url', ctx.url('/login'), '--page', page);
    await sleep(2000);
    const agentFilled = (await ctx.inAgent(agentTabId, `document.getElementById('u').value.length + document.getElementById('p').value.length`)) !== 0;
    const agentActor = await loginActor(ctx, agentTabId);
    await ctx.cli('focus', '--element', '#u', '--page', page);
    await ctx.cli('type', '--input', 'pbagent', '--page', page);
    await ctx.cli('focus', '--element', '#p', '--page', page);
    await ctx.cli('type', '--input', 'agent-typed-word', '--page', page);
    await ctx.cli('click', '--element', '#go', '--page', page);
    const agentSubmitted = await ctx.pollFor(() => ctx.inAgent(agentTabId, 'location.pathname === "/agent2"').then((v) => v || null), 10000, 'the agent submit').catch(() => false);
    await sleep(1500);
    const closed = (await ctx.webTabs()).find((w) => w.tabId === userTab)?.id;
    if (closed) await ctx.luminoClose(closed);
    return { saved: saved === true, userFilled: userFilled === true, userActor: userActor === true, agentFilled, agentActor: agentActor === true, agentSubmitted: agentSubmitted === true, capturedAfter: await countLogins(ctx, 'pbagent') };
}

/** (m): an agent page that answers 401 Basic; the auth dialog must be found, and the agent's accept refused. */
async function authObserved(ctx) {
    const { createServer } = await import('node:http');
    let authorized = false;
    const server = createServer((req, res) => {
        if (req.headers.authorization) authorized = true;
        res.writeHead(401, { 'www-authenticate': 'Basic realm="pb-agent-auth"', 'content-type': 'text/plain' });
        res.end('auth');
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const authUrl = `http://127.0.0.1:${server.address().port}/auth`;
    try {
        const c = await createObserved(ctx);
        const tabId = c.boundTab;
        if (!tabId) return { promptSeen: false, reply: {}, promptAfter: false, authorized };
        const pendingGoto = ctx.cli('goto', '--url', authUrl, '--page', c.pageId);
        const dialog = (id) => ctx.inChrome(`const o = overlayOf(${JSON.stringify(id)}); if (!o) return null;
            for (const w of Services.wm.getEnumerator(null)) { if (!w.closed && String(w.location && w.location.href) === 'chrome://global/content/commonDialog.xhtml' && w.args && w.args.owningBrowsingContext && w.args.owningBrowsingContext.top && w.args.owningBrowsingContext.top.embedderElement === o) return w.args.promptType || 'unknown'; }
            return null;`);
        const promptType = await ctx.pollFor(() => dialog(tabId), 15000, 'the HTTP auth dialog').catch(() => null);
        const reply = promptType ? await ctx.agentRaw(tabId, 'browser.dialogAccept', {}) : null;
        await sleep(500);
        const promptAfter = promptType ? !!(await dialog(tabId)) : false;
        if (c.widgetId) await ctx.luminoClose(c.widgetId);
        await sleep(1000);
        const promptAfterClose = promptType ? await ctx.inChrome(`for (const w of Services.wm.getEnumerator(null)) { if (!w.closed && String(w.location && w.location.href) === 'chrome://global/content/commonDialog.xhtml') return true; } return false;`) : false;
        // The goto waits on a load the prompt holds; it ends with the closed tab, before the next clause drives orcad.
        await Promise.race([pendingGoto, sleep(30000)]);
        return { promptSeen: !!promptType, promptType, reply: { where: reply?.where ?? null, code: reply?.code ?? null }, promptAfter, promptAfterClose: promptAfterClose === true, authorized };
    } finally {
        server.close();
    }
}

/** (c2): keys typed into the user tab while the parked agent page tries to take focus. */
async function typingObserved(ctx, agentTabId, page) {
    await ctx.cli('goto', '--url', ctx.url('/agent'), '--page', page);
    // A fresh user tab on /user: the clause (a) user tab is on /cookie by now, and (j) reads it there.
    const userTab = await ctx.openWebTab(ctx.url('/user'));
    await ctx.pollFor(() => ctx.inPage('/user', 'document.readyState === "complete"').then((v) => v || null), 10000, 'the typing user tab').catch(() => null);
    const userWidget = (await ctx.webTabs()).find((w) => w.tabId === userTab)?.id;
    await ctx.activate(userWidget);
    // Clause (d) opened a stock window, which holds the window focus; the user comes back to the PowerBrowser window.
    await ctx.inChrome('window.focus(); return true;');
    await ctx.pollFor(() => ctx.inChrome('return Services.focus.activeWindow === window || null;'), 5000, 'the shell window to be active').catch(() => null);
    const focused = await ctx.focusOverlay(userTab);
    const pageFocus = await ctx.inPage('/user', '(document.getElementById("in").value = "", document.getElementById("in").focus(), __log.length = 0, document.hasFocus())');
    const chromeAt = await ctx.chromeActiveTabId();
    await ctx.typeText('ab');
    const controlTyped = await ctx.inPage('/user', 'document.getElementById("in").value');
    const controlDiag = controlTyped === 'ab' ? null : `overlay focused ${focused}, page hasFocus ${pageFocus}, chrome focus on the user tab ${chromeAt === userTab}, dialogs ${await ctx.inChrome(`let n = 0; for (const w of Services.wm.getEnumerator(null)) if (!w.closed && w !== window) n++; return n;`)}`;
    const chromeBefore = await ctx.chromeActiveTabId();
    await ctx.inAgent(agentTabId, '(document.getElementById("in").value = "", window.__pbSteal = setInterval(() => { window.focus(); document.getElementById("in").focus(); }, 25), true)');
    await sleep(1500);
    const agentSelfActive = await ctx.inAgent(agentTabId, 'document.activeElement && document.activeElement.id');
    for (const ch of 'cdefgh') { await ctx.typeText(ch); await sleep(300); }
    const userTyped = await ctx.inPage('/user', 'document.getElementById("in").value');
    const userBlurs = (await userFocus(ctx))?.blurs ?? [];
    const chromeAfter = await ctx.chromeActiveTabId();
    const agentValue = await ctx.inAgent(agentTabId, '(clearInterval(window.__pbSteal), document.getElementById("in").value)');
    if (userWidget) await ctx.luminoClose(userWidget);
    return { controlTyped, controlDiag, controlExpected: 'ab', agentSelfActive, userTyped, userExpected: 'abcdefgh', agentValue, userBlurs, chromeBefore, chromeAfter };
}

/** (n) D-35: a user tab's opens adopt (the detectors); the same opens from an agent page create and load nothing. */
async function opensObserved(ctx, agentTabId, page) {
    const windows = () => ctx.inChrome('let n = 0; for (const w of Services.wm.getEnumerator(null)) { if (!w.closed) n++; } return n;');
    const loadsOf = (tag) => ctx.requests().filter((r) => r.path === '/agent2' && r.search.includes(`via=${tag}`)).length;
    const agent2Loads = () => ctx.requests().filter((r) => r.path === '/agent2').length;
    const sandboxOf = (tabId) => ctx.inChrome(`const o = overlayOf(${JSON.stringify(tabId)}); return o ? o.browsingContext.sandboxFlags : null;`);
    const shellActive = () => ctx.inChrome('return Services.focus.activeWindow === window;');
    // New web tabs since `before`, after a settle; the adopt ack is the frontend's, so poll first.
    const freshTabs = async (before, ms = 5000) => {
        await ctx.pollFor(async () => ((await ctx.webTabs()).some((w) => !before.includes(w.id)) || null), ms, 'a new web tab').catch(() => null);
        await sleep(500);
        return (await ctx.webTabs()).filter((w) => !before.includes(w.id));
    };
    const closeAll = async (tabs) => { for (const t of tabs) await ctx.luminoClose(t.id); await sleep(300); };
    const backToShell = async () => {
        await ctx.inChrome('window.focus(); return true;');
        await ctx.pollFor(() => ctx.inChrome('return Services.focus.activeWindow === window || null;'), 5000, 'the shell window to be active').catch(() => null);
    };

    // The detectors, from a user tab.
    const userTab = await ctx.openWebTab(ctx.url('/opener'));
    await ctx.pollFor(() => ctx.inPage('/opener', 'document.readyState === "complete"').then((v) => v || null), 10000, 'the opener user tab').catch(() => null);
    const userWidget = (await ctx.webTabs()).find((w) => w.tabId === userTab)?.id;
    await ctx.activate(userWidget);
    let before = (await ctx.webTabs()).map((w) => w.id);
    await ctx.inPage('/opener', '(document.getElementById("blank").click(), true)');
    const linkTabs = await freshTabs(before);
    const linkLoads = loadsOf('blank');
    await closeAll(linkTabs);
    before = (await ctx.webTabs()).map((w) => w.id);
    await ctx.inPage('/opener', `(window.open(${JSON.stringify(ctx.url('/agent2?via=useropen'))}), true)`);
    const openTabs = await freshTabs(before);
    const openLoads = loadsOf('useropen');
    await closeAll(openTabs);
    const windowsBefore = await windows();
    await ctx.inPage('/opener', `(window.open(${JSON.stringify(ctx.url('/agent2?via=userpopup'))}, 'pbpopup', 'width=320,height=240'), true)`);
    const popupWindows = (await ctx.pollFor(async () => ((await windows()) > windowsBefore ? await windows() : null), 10000, 'the user popup window').catch(() => windowsBefore)) - windowsBefore;
    await ctx.inChrome(`for (const w of Services.wm.getEnumerator('navigator:browser')) { if (!w.closed && w.gBrowser && w.gBrowser.browsers.some(b => b.currentURI.spec.includes('via=userpopup'))) w.close(); } return true;`);
    await sleep(500);
    await backToShell();
    const user = { linkTabs: linkTabs.length, linkLoads, openTabs: openTabs.length, openLoads, agentAmong: [...linkTabs, ...openTabs].some((t) => t.agent), popupWindows, sandboxFlags: await sandboxOf(userTab) };

    // The agent page: the same opens, every route.
    await ctx.cli('goto', '--url', ctx.url('/opener'), '--page', page);
    await ctx.activate(userWidget);
    await ctx.focusOverlay(userTab);
    const tabsBefore = (await ctx.webTabs()).map((w) => w.id);
    const agentBefore = { current: await ctx.currentId(), chrome: await ctx.chromeActiveTabId(), shell: await shellActive(), windows: await windows(), loads: agent2Loads() };
    await ctx.cli('click', '--element', '#blank', '--page', page);
    await ctx.cli('click', '--element', '#fs', '--page', page);
    const openReturned = await ctx.inAgent(agentTabId, `(() => { try { return window.open(${JSON.stringify(ctx.url('/agent2?via=agentopen'))}) === null ? 'null' : 'a window'; } catch (e) { return 'threw ' + e.name; } })()`);
    const popupReturned = await ctx.inAgent(agentTabId, `(() => { try { return window.open(${JSON.stringify(ctx.url('/agent2?via=agentpopup'))}, 'pbagentpopup', 'width=320,height=240') === null ? 'null' : 'a window'; } catch (e) { return 'threw ' + e.name; } })()`);
    const plain = await ctx.inAgent(agentTabId, '(() => { const r = document.getElementById("plain").getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()');
    const middle = plain ? await ctx.agentRaw(agentTabId, 'browser.mouseClick', { x: plain.x, y: plain.y, button: 'middle' }) : null;
    await ctx.agentRaw(agentTabId, 'browser.focus', { element: '#plain' });
    const enter = await ctx.agentRaw(agentTabId, 'browser.keypress', { key: 'Control+Enter' });
    await sleep(3000);
    const fresh = (await ctx.webTabs()).filter((w) => !tabsBefore.includes(w.id));
    const reply = (r) => (r ? `${r.where}${r.code ? ` ${r.code}` : ''}` : 'no reply');
    const agent = {
        currentBefore: agentBefore.current, currentAfter: await ctx.currentId(),
        chromeBefore: agentBefore.chrome, chromeAfter: await ctx.chromeActiveTabId(),
        shellActiveBefore: agentBefore.shell, shellActiveAfter: await shellActive(),
        newTabs: fresh.length, newWindows: (await windows()) - agentBefore.windows, loads: agent2Loads() - agentBefore.loads,
        openReturned, popupReturned, middleReply: reply(middle), enterReply: reply(enter),
        sandboxFlags: await sandboxOf(agentTabId),
    };
    await closeAll(fresh);
    // D-35 keeps the agent's own navigation: a plain link click moves its own tab.
    await ctx.cli('click', '--element', '#plain', '--page', page);
    agent.ownNavigation = (await ctx.pollFor(() => ctx.inAgent(agentTabId, 'location.search === "?via=plain"').then((v) => v || null), 10000, 'the agent navigation').catch(() => false)) === true;
    if (userWidget) await ctx.luminoClose(userWidget);
    return { user, agent };
}

const replyWord = (r) => (r ? `${r.where}${r.code ? ` ${r.code}` : ''}` : 'no reply');
const windowCount = (ctx) => ctx.inChrome('let n = 0; for (const w of Services.wm.getEnumerator(null)) { if (!w.closed) n++; } return n;');
const windowHrefs = (ctx) => ctx.inChrome('return [...Services.wm.getEnumerator(null)].filter(w => !w.closed).map(w => String(w.location.href));');
/** Closes every window not in `keep` (a list of hrefs with multiplicity), oldest kept first. */
const closeWindowsBut = (ctx, keep) => ctx.inChrome(`const left = new Map(); for (const h of ${JSON.stringify(keep)}) left.set(h, (left.get(h) || 0) + 1);
    for (const w of [...Services.wm.getEnumerator(null)].filter(x => !x.closed)) { const h = String(w.location.href); if ((left.get(h) || 0) > 0) left.set(h, left.get(h) - 1); else w.close(); }
    window.focus(); return true;`);

/** (o) D-37: a user tab's download saves (the detector); the agent's click and goto of attachments save and open nothing. */
export async function downloadsObserved(ctx, agentTabId, page) {
    const dir = await ctx.inChrome(`const dir = PathUtils.join(Services.dirsvc.get('ProfD', Ci.nsIFile).path, 'pb-downloads');
        return IOUtils.makeDirectory(dir, { ignoreExisting: true }).then(() => { Services.prefs.setIntPref('browser.download.folderList', 2);
            Services.prefs.setStringPref('browser.download.dir', dir); Services.prefs.setBoolPref('browser.download.useDownloadDir', true); return dir; });`);
    const files = () => ctx.inChrome(`return IOUtils.getChildren(${JSON.stringify(dir)}).then(a => a.map(p => PathUtils.filename(p)).sort());`);
    const rows = () => ctx.inChrome("const { Downloads } = ChromeUtils.importESModule('resource://gre/modules/Downloads.sys.mjs'); return Downloads.getList(Downloads.ALL).then(l => l.getAll()).then(a => a.length);");
    const pdfRequests = () => ctx.requests().filter((r) => r.path === '/pb-agent.pdf' || r.path === '/pb-agent-goto.pdf').length;

    const keep = await windowHrefs(ctx);
    const rowsUser = await rows();
    const userTab = await ctx.openWebTab(ctx.url('/dlpage'));
    await ctx.pollFor(() => ctx.inPage('/dlpage', 'document.readyState === "complete"').then((v) => v || null), 10000, 'the download user tab').catch(() => null);
    await ctx.inPage('/dlpage', '(document.getElementById("user").click(), true)');
    const saved = (await ctx.pollFor(async () => ((await files()).includes('pb-user.pdf') || null), 10000, 'the user download').catch(() => false)) === true;
    await sleep(1500);
    const user = { saved, files: await files(), rowsAdded: (await rows()) - rowsUser, windows: (await windowCount(ctx)) - keep.length };
    await closeWindowsBut(ctx, keep);
    const userWidget = (await ctx.webTabs()).find((w) => w.tabId === userTab)?.id;
    if (userWidget) await ctx.luminoClose(userWidget);
    await sleep(500);

    await ctx.cli('goto', '--url', ctx.url('/dlpage'), '--page', page);
    const before = { files: await files(), rows: await rows(), windows: await windowCount(ctx), current: await ctx.currentId(), requests: pdfRequests() };
    const click = await ctx.agentRaw(agentTabId, 'browser.click', { element: '#agent' });
    const goto = await ctx.agentRaw(agentTabId, 'browser.goto', { url: ctx.url('/pb-agent-goto.pdf') });
    await sleep(3000);
    const agent = {
        filesBefore: before.files, filesAfter: await files(), rowsBefore: before.rows, rowsAfter: await rows(),
        newWindows: (await windowCount(ctx)) - before.windows, currentBefore: before.current, currentAfter: await ctx.currentId(),
        requests: pdfRequests() - before.requests, clickReply: replyWord(click), gotoReply: replyWord(goto),
    };
    await closeWindowsBut(ctx, keep);
    return { user, agent };
}

/** (p) D-37: a user tab's protocol links launch or ask (the detectors); the agent's launch nothing and show nothing. */
export async function protocolsObserved(ctx, agentTabId, page) {
    const scratch = mkdtempSync(join(tmpdir(), 'pb-protocol-stub-'));
    const marker = join(scratch, 'launched');
    const stub = join(scratch, 'stub.sh');
    writeFileSync(stub, `#!/bin/sh\nprintf '%s\\n' "$1" >> '${marker}'\n`);
    chmodSync(stub, 0o755);
    const launched = () => (existsSync(marker) ? readFileSync(marker, 'utf8').split('\n').filter(Boolean) : []);
    try {
        const origin = new URL(ctx.url('/proto')).origin;
        await ctx.inChrome(`const eps = Cc['@mozilla.org/uriloader/external-protocol-service;1'].getService(Ci.nsIExternalProtocolService);
            const hs = Cc['@mozilla.org/uriloader/handler-service;1'].getService(Ci.nsIHandlerService);
            for (const scheme of ['mailto', ${JSON.stringify(PROTOCOL_RUN)}, ${JSON.stringify(PROTOCOL_ASK)}]) {
                const info = eps.getProtocolHandlerInfo(scheme);
                const file = Cc['@mozilla.org/file/local;1'].createInstance(Ci.nsIFile); file.initWithPath(${JSON.stringify(stub)});
                const app = Cc['@mozilla.org/uriloader/local-handler-app;1'].createInstance(Ci.nsILocalHandlerApp); app.executable = file; app.name = 'PB protocol stub';
                info.possibleApplicationHandlers.appendElement(app); info.preferredApplicationHandler = app;
                info.preferredAction = Ci.nsIHandlerInfo.useHelperApp; info.alwaysAskBeforeHandling = false; hs.store(info);
            }
            // The granted scheme is granted in the user's and the agent's container: without the wall, an agent page of
            // that origin would launch it with no dialog (67-VERIFICATION finding 3).
            const agentContext = Services.prefs.getIntPref('powerbrowser.orca.agentUserContextId', 0);
            for (const userContextId of [0, agentContext]) {
                const principal = Services.scriptSecurityManager.createContentPrincipal(Services.io.newURI(${JSON.stringify(origin)}), { userContextId });
                Services.perms.addFromPrincipal(principal, 'open-protocol-handler^' + ${JSON.stringify(PROTOCOL_RUN)}, Services.perms.ALLOW_ACTION);
            }
            return true;`);
        const keep = await windowHrefs(ctx);
        const userTab = await ctx.openWebTab(ctx.url('/proto'));
        await ctx.pollFor(() => ctx.inPage('/proto', 'document.readyState === "complete"').then((v) => v || null), 10000, 'the protocol user tab').catch(() => null);
        await ctx.inPage('/proto', '(document.getElementById("mailto").click(), true)');
        await ctx.inPage('/proto', '(document.getElementById("run").click(), true)');
        await ctx.pollFor(() => (launched().length >= 2 || null), 10000, 'the user launches').catch(() => null);
        const userLaunches = launched();
        await ctx.inPage('/proto', '(document.getElementById("ask").click(), true)');
        const askWindows = (await ctx.pollFor(async () => { const n = (await windowCount(ctx)) - keep.length; return n > 0 ? n : null; }, 10000, 'the ask dialog').catch(() => 0));
        const user = {
            mailtoLaunched: userLaunches.includes(`mailto:${PROTOCOL_PROBE}`), runLaunched: userLaunches.includes(`${PROTOCOL_RUN}:${PROTOCOL_PROBE}`), askWindows,
        };
        await closeWindowsBut(ctx, keep);
        const userWidget = (await ctx.webTabs()).find((w) => w.tabId === userTab)?.id;
        if (userWidget) await ctx.luminoClose(userWidget);
        await sleep(500);

        await ctx.cli('goto', '--url', ctx.url('/proto'), '--page', page);
        const launchesBefore = launched().length;
        const windowsBefore = await windowCount(ctx);
        const replies = {};
        for (const [what, id] of [['mailto:', 'mailto'], [`${PROTOCOL_RUN}:`, 'run'], [`${PROTOCOL_ASK}:`, 'ask']]) {
            replies[what] = replyWord(await ctx.agentRaw(agentTabId, 'browser.click', { element: `#${id}` }));
        }
        await sleep(3000);
        const agent = { launches: launched().length - launchesBefore, newWindows: (await windowCount(ctx)) - windowsBefore, replies };
        await closeWindowsBut(ctx, keep);
        return { user, agent };
    } finally {
        rmSync(scratch, { recursive: true, force: true });
    }
}

/** (q) D-37: commands on an agent overlay's initial about:blank are refused until its first load commits. */
export async function firstDocumentObserved(ctx) {
    const keep = await windowHrefs(ctx);
    const before = (await ctx.webTabs()).map((w) => w.id);
    const pending = ctx.cli('tab', 'create', '--worktree', ctx.worktree, '--url', ctx.url('/slow'));
    const fresh = await ctx.pollFor(async () => (await ctx.webTabs()).find((w) => !before.includes(w.id) && w.agent) ?? null, 10000, 'the held agent tab').catch(() => null);
    if (!fresh) { await pending; return { created: false }; }
    const initial = () => ctx.inChrome(`const o = overlayOf(${JSON.stringify(fresh.tabId)}); const wg = o && o.browsingContext.currentWindowGlobal; return wg ? wg.isInitialDocument : null;`);
    const initialBefore = await initial();
    const click = await ctx.agentRaw(fresh.tabId, 'browser.mouseClick', { x: 5, y: 5 });
    const popup = await ctx.agentRaw(fresh.tabId, 'browser.eval', { expression: `(() => { try { return window.open(${JSON.stringify(ctx.url('/agent2?via=firstdoc'))}, 'pbfirstdoc', 'width=320,height=240') === null ? 'null' : 'a window'; } catch (e) { return 'threw ' + e.name; } })()` });
    await sleep(2000);
    const newWindows = (await windowCount(ctx)) - keep.length;
    const loads = ctx.requests().filter((r) => r.search.includes('via=firstdoc')).length;
    await ctx.pollFor(async () => ((await initial()) === false || null), SLOW_HEADERS_MS + 20000, 'the held first load').catch(() => null);
    const after = await ctx.agentRaw(fresh.tabId, 'browser.eval', { expression: 'location.pathname' });
    const out = {
        created: true, initialBefore, clickReply: replyWord(click), popupReply: replyWord(popup), newWindows, loads,
        initialAfter: await initial(), evalAfter: after?.where === 'done' ? `done ${after.result?.result}` : replyWord(after),
    };
    await pending;
    await closeWindowsBut(ctx, keep);
    await ctx.luminoClose(fresh.id);
    return out;
}

// Chrome's clipboard helpers (66-10): text read, text write. Every caller compares in chrome and returns a word.
const CHROME_CLIP = `const clip = {
    read() { try { const t = Cc['@mozilla.org/widget/transferable;1'].createInstance(Ci.nsITransferable); t.init(null); t.addDataFlavor('text/plain');
        Services.clipboard.getData(t, Services.clipboard.kGlobalClipboard); const o = {}; t.getTransferData('text/plain', o); return o.value.QueryInterface(Ci.nsISupportsString).data; } catch { return null; } },
    set(s) { Cc['@mozilla.org/widget/clipboardhelper;1'].getService(Ci.nsIClipboardHelper).copyString(s); },
};`;
const clipName = `(v => { const m = ${JSON.stringify(CLIP_MARKERS)}; return Object.keys(m).find(k => m[k] === v) ?? (v ? 'other' : 'empty'); })`;

/** (r) D-38: a user tab writes and reads the clipboard (the detectors); an agent page and the agent's keys do neither. */
export async function clipboardObserved(ctx, agentTabId, page) {
    const M = CLIP_MARKERS;
    const state = () => ctx.inChrome(`${CHROME_CLIP} return ${clipName}(clip.read());`);
    // The user's clipboard text stays in chrome memory and is put back at the end; it never reaches this process.
    await ctx.inChrome(`${CHROME_CLIP} window.__pbClipSaved = clip.read(); clip.set('pb-clip-start'); return true;`);
    try {
        const userTab = await ctx.openWebTab(ctx.url('/clip'));
        await ctx.pollFor(() => ctx.inPage('/clip', 'document.readyState === "complete"').then((v) => v || null), 10000, 'the clipboard user tab').catch(() => null);
        const context = await ctx.contentOf('/clip');
        const activated = async (expression) => {
            if (!context) return null;
            try { return (await ctx.app.send('script.evaluate', { expression, target: { context }, awaitPromise: true, userActivation: true }))?.result?.value ?? null; } catch { return null; }
        };
        await activated('(() => { const t = document.getElementById("src"); t.focus(); t.select(); return String(document.execCommand("copy")); })()');
        const copy = await state();
        await activated(`document.getElementById("f").contentWindow.navigator.clipboard.writeText(${JSON.stringify(M.frame)}).then(() => "resolved", e => "rejected " + e.name)`);
        const frame = await state();
        await activated(`navigator.clipboard.writeText(${JSON.stringify(M.user)}).then(() => "resolved", e => "rejected " + e.name)`);
        const write = await state();
        const userWidget = (await ctx.webTabs()).find((w) => w.tabId === userTab)?.id;
        if (userWidget) await ctx.activate(userWidget);
        await ctx.inChrome('window.focus(); return true;');
        await ctx.focusOverlay(userTab);
        await ctx.inPage('/clip', '(document.getElementById("in").value = "", document.getElementById("in").focus(), true)');
        await ctx.pressKey({ key: 'v', code: 'KeyV', modifiers: ['control'] });
        await sleep(500);
        const pasted = await ctx.inPage('/clip', `${clipName}(document.getElementById("in").value)`);
        const user = { copy, frame, write, pasted };
        if (userWidget) await ctx.luminoClose(userWidget);
        await sleep(500);

        await ctx.cli('goto', '--url', ctx.url('/clip'), '--page', page);
        const clickReply = replyWord(await ctx.agentRaw(agentTabId, 'browser.click', { element: '#go' }));
        const rec = await ctx.pollFor(() => ctx.inAgent(agentTabId, 'window.__clip'), 15000, 'the agent click handler').catch(() => null);
        const afterClick = await state();
        await ctx.agentRaw(agentTabId, 'browser.focus', { element: '#in' });
        const press = async (key) => replyWord(await ctx.agentRaw(agentTabId, 'browser.keypress', { key }));
        const agent = { clickReply, rec, afterClick, ctrlV: await press('Control+v'), shiftInsert: await press('Shift+Insert'), ctrlC: await press('Control+c'), controlReply: await press('Control+a') };
        await sleep(500);
        agent.input = await ctx.inAgent(agentTabId, `${clipName}(document.getElementById("in").value)`);
        agent.afterKeys = await state();
        return { user, agent };
    } finally {
        await ctx.inChrome(`${CHROME_CLIP} if (typeof window.__pbClipSaved === 'string' && window.__pbClipSaved) clip.set(window.__pbClipSaved); delete window.__pbClipSaved; return true;`).catch(() => undefined);
    }
}

/** (s) D-39: a default-container grant reads granted in a user tab (the detector) and default in the agent tab. */
export async function permissionsObserved(ctx, agentTabId, page) {
    const origin = new URL(ctx.url('/perm')).origin;
    const grant = (op, userContextId) => ctx.inChrome(`const agentContext = Services.prefs.getIntPref('powerbrowser.orca.agentUserContextId', 0);
        const principal = Services.scriptSecurityManager.createContentPrincipal(Services.io.newURI(${JSON.stringify(origin)}), { userContextId: ${userContextId === 'agent' ? 'agentContext' : 0} });
        ${op === 'add' ? "Services.perms.addFromPrincipal(principal, 'desktop-notification', Services.perms.ALLOW_ACTION);" : "Services.perms.removeFromPrincipal(principal, 'desktop-notification');"} return true;`);
    try {
        const pref = await ctx.inChrome("return Services.prefs.getBoolPref('permissions.isolateBy.userContext', false);");
        await grant('add', 0);
        const userTab = await ctx.openWebTab(ctx.url('/perm'));
        await ctx.pollFor(() => ctx.inPage('/perm', 'document.readyState === "complete"').then((v) => v || null), 10000, 'the permission user tab').catch(() => null);
        const user = await ctx.inPage('/perm', 'Notification.permission');
        const userWidget = (await ctx.webTabs()).find((w) => w.tabId === userTab)?.id;
        if (userWidget) await ctx.luminoClose(userWidget);
        await ctx.cli('goto', '--url', ctx.url('/perm'), '--page', page);
        const agent = await ctx.inAgent(agentTabId, 'Notification.permission');
        await grant('add', 'agent');
        await ctx.cli('goto', '--url', ctx.url('/perm?own=1'), '--page', page);
        const agentOwn = await ctx.inAgent(agentTabId, 'Notification.permission');
        return { pref, user, agent, agentOwn };
    } finally {
        await grant('remove', 0).catch(() => undefined);
        await grant('remove', 'agent').catch(() => undefined);
    }
}

async function liveRun(log) {
    const { withBrowserSession, decoyRecordFile } = await import('./lib/orca-browser-live.mjs');
    const { ensurePbNode } = await import('./lib/orca-run.mjs');
    const { run: hiddenElectronRun } = await import('./verify-orca-hidden-electron.mjs');
    const obs = {};
    const nodeBin = (await ensurePbNode()).path;

    // (f), first half: both detectors proven on stock orcad in this invocation.
    const stock = await hiddenElectronRun({ orcaDir: join(REPO_ROOT, 'orca'), overlayDir: join(REPO_ROOT, 'orca-overlay'), nodeBin });
    log(`(f) stock decoy half: ${stock.pass ? `detectors proven (${stock.pass.stockMs} ms)` : stock.skip ? `SKIP ${stock.skip}` : stock.fails.join('; ')}`);
    const recordFile = decoyRecordFile(REPO_ROOT);
    const home = mkdtempSync(join(tmpdir(), 'pb-agent-home-'));
    mkdirSync(join(home, '.local', 'bin'), { recursive: true });
    symlinkSync(nodeBin, join(home, '.local', 'bin', 'orca-ide'));
    try {
        await withBrowserSession({ log, home }, async (ctx) => {
            const W = ctx.worktree;
            const readyAt = Date.now();
            // (k) first: no Orca pane widget, a booted bundle, the link.
            const bundleBooted = (await ctx.bundle('m.state().booted')) === true;
            const linkPresent = await ctx.linkPresent();
            await ctx.hostAttached();
            const paneWidgetsBefore = await ctx.paneWidgetCount();
            const k = await createObserved(ctx);
            obs.k = { bundleBooted, linkPresent, paneWidgetsBefore, paneWidgetsAfter: await ctx.paneWidgetCount(), newTabs: k.newTabs.length, ms: k.ms };

            // (a) with a user tab current.
            const userTab = await ctx.openWebTab(ctx.url('/user'));
            const userWidget = (await ctx.webTabs()).find((w) => w.tabId === userTab)?.id;
            await ctx.activate(userWidget);
            const a = await createObserved(ctx);
            obs.a = a;
            const page = a.pageId;

            // (c) focus, with the user's page focused first.
            await ctx.focusOverlay(userTab);
            await ctx.inPage('/user', '(document.getElementById("in").focus(), __log.length = 0, true)');
            await ctx.cli('goto', '--url', ctx.url('/agent'), '--page', page);
            const before = { chrome: await ctx.chromeActiveTabId(), ...(await userFocus(ctx)) };
            const agentTabId = a.boundTab;
            await ctx.cli('focus', '--element', '#in', '--page', page);
            const agentActiveAfterFocus = await ctx.inAgent(agentTabId, 'document.activeElement && document.activeElement.id');
            await ctx.cli('type', '--input', 'pb-typed', '--page', page);
            const after = { chrome: await ctx.chromeActiveTabId(), ...(await userFocus(ctx)) };
            const chromeHitIsAgent = await ctx.inChrome(`const o = overlayOf(${JSON.stringify(agentTabId)}); if (!o) return false; const r = o.getBoundingClientRect();
                const e = document.elementFromPoint(r.x + ${INSIDE.x}, r.y + ${INSIDE.y}); return W.tabIdOfBrowser(e) === ${JSON.stringify(agentTabId)};`);
            obs.c = { agentActiveAfterFocus, before: { chrome: before.chrome, userHasFocus: before.hasFocus, userActive: before.active }, after: { chrome: after.chrome, userHasFocus: after.hasFocus, userActive: after.active }, userBlurs: after.blurs ?? [], chromeHitIsAgent };

            // (b) goto, click, type; (b1) screenshot at DPR 1.
            const g = await ctx.cli('goto', '--url', ctx.url('/agent'), '--page', page);
            await ctx.cli('click', '--element', '#btn', '--page', page);
            const clickCount = await ctx.inAgent(agentTabId, 'document.getElementById("btn").dataset.count || "0"');
            await ctx.cli('focus', '--element', '#in', '--page', page);
            await ctx.cli('type', '--input', 'pb-typed', '--page', page);
            obs.b = { title: g.result?.title ?? null, expectedTitle: 'PB agent fixture', clickCount, typed: await ctx.inAgent(agentTabId, 'document.getElementById("in").value'), expectedTyped: 'pb-typed' };
            obs.b1 = await screenshotObserved(ctx, page);

            // (d) refusals, naming a real user tab and a real stock-window tab.
            const invented = await ctx.cli('goto', '--url', ctx.url('/agent2'), '--page', 'pb-invented-page');
            const stockContext = await ctx.openStock();
            const stockBrowserId = (await ctx.stockChrome(stockContext)).browserId;
            obs.d = {
                invented: { ok: invented.ok, code: invented.error?.code ?? null },
                userTab: (await ctx.agentRaw(userTab, 'browser.cookie.get', {}))?.where ?? 'no reply',
                stockTab: (await ctx.agentRaw(`stock-${stockBrowserId}`, 'browser.cookie.get', {}))?.where ?? 'no reply',
            };

            // (e) container: own cookie first, then the user's.
            await ctx.cli('cookie', 'set', '--name', 'pbagent', '--value', '1', '--page', page);
            const ownRead = cookieNames(await ctx.cli('cookie', 'get', '--page', page)).includes('pbagent');
            await ctx.probe(`return await get('WebTabChannel').widgetOf(${JSON.stringify(userTab)}).navigate(${JSON.stringify(ctx.url('/cookie'))});`);
            await ctx.pollFor(() => ctx.inPage('/cookie', 'document.readyState === "complete"'), 10000, 'the cookie page').catch(() => null);
            const userCookieSet = String(await ctx.inPage('/cookie', 'document.cookie')).includes('pbuser=1');
            obs.e = { ownRead, userCookieSet, userVisible: cookieNames(await ctx.cli('cookie', 'get', '--page', page)).includes('pbuser') };

            // (e2) the agent tab's container, read in chrome; the user overlay at 0 first.
            obs.e2 = JSON.parse(await ctx.inChrome(`const u = overlayOf(${JSON.stringify(userTab)}); const g = overlayOf(${JSON.stringify(agentTabId)});
                return JSON.stringify({ userContext: u ? u.browsingContext.originAttributes.userContextId : null, agentContext: g ? g.browsingContext.originAttributes.userContextId : null,
                    containerPref: Services.prefs.getIntPref('powerbrowser.orca.agentUserContextId', -1) });`));

            // (l) saved logins: a login saved for the fixture origin; the user tab is the positive read.
            obs.l = await loginsObserved(ctx, agentTabId, page);

            // (m) an HTTP auth prompt in a second agent tab, refused to the agent.
            obs.m = await authObserved(ctx);

            // (c2) the user types while the parked agent page calls focus().
            obs.c2 = await typingObserved(ctx, agentTabId, page);

            // (n) D-35: opens from a user tab adopt; the same opens from the agent page open nothing.
            obs.n = await opensObserved(ctx, agentTabId, page);

            // (o), (p), (q) D-37: downloads, external protocols and the initial document.
            obs.o = await downloadsObserved(ctx, agentTabId, page);
            obs.p = await protocolsObserved(ctx, agentTabId, page);
            obs.q = await firstDocumentObserved(ctx);

            // (r) D-38 the clipboard, (s) D-39 site permissions per container.
            obs.r = await clipboardObserved(ctx, agentTabId, page);
            obs.s = await permissionsObserved(ctx, agentTabId, page);

            // (f) second half, in the scratch HOME holding the decoy.
            if (stock.skip) obs.f = { skip: stock.skip };
            else {
                const fCreate = await ctx.cli('tab', 'create', '--worktree', W);
                const fPage = fCreate.result?.browserPageId;
                const fGoto = fPage ? await ctx.cli('goto', '--url', ctx.url('/agent2'), '--page', fPage) : { result: null };
                const minQuietMs = Math.max(10000, 2 * (stock.pass?.stockMs ?? 0));
                const waited = Date.now() - readyAt;
                if (waited < minQuietMs) await sleep(minQuietMs - waited);
                const roots = [ctx.state.dataRoot, ctx.state.effectiveRoot].filter(Boolean);
                obs.f = { stock, createOk: fCreate.ok, code: fCreate.error?.code, gotoCode: fGoto.error ? `${fGoto.error.code}: ${String(fGoto.error.message).slice(0, 80)}` : null, title: fGoto.result?.title ?? null, expectedTitle: 'PB agent fixture two', quietMs: Date.now() - readyAt, minQuietMs, markerPresent: roots.some((r) => existsSync(join(r, recordFile))) };
            }

            // (g) the renderer path through the pane client's own connection.
            obs.g = await ctx.probe(`const api = window.api && window.api.runtimeEnvironments;
                const link = globalThis[Symbol.for('powerbrowser.orca-browser.link')];
                if (!api || !link) return { placement: { kind: 'none' }, reply: { ok: false, code: 'no window.api or link' }, createPageArrived: false, credential: null };
                const placement = await api.prepareBrowserClientHostPlacement({ selector: 'active' });
                let credential = null;
                try { credential = (await link.connection()).credential.kind; } catch (e) { credential = null; }
                const r = await api.call({ selector: 'active', method: 'browser.tabCreate', params: { worktree: ${JSON.stringify(W)}, ...(placement.kind === 'client' ? { placement } : {}), navigation: 'caller', waitForRegistration: false }, timeoutMs: 15000 });
                const pageId = r && r.ok && r.result ? r.result.browserPageId : null;
                const arrived = pageId ? await until(() => !!get('OrcaBrowserPages').tabOf(pageId), 5000) : false;
                return { placement: { kind: placement.kind }, reply: { ok: !!(r && r.ok), code: r && r.error ? r.error.code : null }, createPageArrived: arrived, credential };`, 60000);

            // (h) user close of the (a) tab.
            const closed = a.widgetId ? await ctx.luminoClose(a.widgetId) : false;
            let listedAfter = true;
            for (let i = 0; i < 20 && listedAfter; i++) { await sleep(250); listedAfter = listIds(await ctx.cli('tab', 'list', '--worktree', W)).includes(page); }
            obs.h = { closed, listedAfter };

            // (j) activation: create with the user tab current, then a store activation.
            await ctx.activate(userWidget);
            await ctx.focusOverlay(userTab);
            const currentBefore = await ctx.currentId();
            const userFocusBefore = JSON.stringify(await ctx.inPage('/cookie', 'document.hasFocus()'));
            const j = await createObserved(ctx);
            const listed = listIds(await ctx.cli('tab', 'list', '--worktree', W)).includes(j.pageId);
            const currentAfterCreate = await ctx.currentId();
            const userFocusAfter = JSON.stringify(await ctx.inPage('/cookie', 'document.hasFocus()'));
            // D-34: the pane entry's row for the page, read from the pane list (positive read before the activation).
            const row = await ctx.pollFor(() => ctx.bundle(`(() => { let r = null; m.subscribePanes((l) => { r = l.find((p) => p.browserPageId === ${JSON.stringify(j.pageId)}) ?? null; })(); return r && { active: r.active }; })()`), 5000, 'the page\'s store row').catch(() => null);
            const webTabsBefore = (await ctx.webTabs()).length;
            const tSwitch = Date.now();
            await ctx.bundle(`m.selectBrowserPage(${JSON.stringify(j.pageId)})`);
            let tAct = null;
            for (let i = 0; i < 40 && tAct === null; i++) {
                const hit = (await ctx.paneLog(tSwitch)).find((e) => e.browser.some((r) => r.id === j.pageId && r.active));
                if (hit) tAct = hit.t; else await sleep(125);
            }
            let currentAfterActivation = null;
            let revealMs = null;
            if (tAct !== null) {
                for (let i = 0; i < 12 && currentAfterActivation !== j.widgetId; i++) { currentAfterActivation = await ctx.currentId(); if (currentAfterActivation !== j.widgetId) await sleep(100); }
                if (currentAfterActivation === j.widgetId) revealMs = Date.now() - tAct;
            }
            obs.j = { bound: !!j.boundTab, listed, userWidget, currentBefore, currentAfterCreate, userFocusBefore, userFocusAfter, rowListed: !!row, rowActive: row?.active === true, activationSeen: tAct !== null, boundWidget: j.widgetId, currentAfterActivation, revealMs, webTabsBefore, webTabsAfter: (await ctx.webTabs()).length };

            // (i) reload, last.
            const oldPages = listIds(await ctx.cli('tab', 'list', '--worktree', W));
            await ctx.app.evaluate('(location.reload(), true)').catch(() => undefined);
            await sleep(2000);
            // A probe started while the new frontend has no container yet answers { error } (truthy): only true counts.
            const reattached = await ctx.pollFor(async () => { try { return (await ctx.hostAttached()) === true || null; } catch { return null; } }, 180000, 'the host to re-attach').catch(() => false);
            let oldListed = oldPages;
            for (let i = 0; i < 40 && oldListed.length; i++) { await sleep(250); const now = listIds(await ctx.cli('tab', 'list', '--worktree', W)); oldListed = oldPages.filter((p) => now.includes(p)); }
            const diag = reattached === true ? null : await ctx.probe(`const l = globalThis[Symbol.for('powerbrowser.orca-browser.link')]; let c = 'no link';
                if (l) { try { c = 'connection ' + (await l.connection()).credential.kind; } catch (e) { c = 'connection ' + String(e && e.message).slice(0, 40); } }
                let attach = 'not tried';
                const host = globalThis[Symbol.for('powerbrowser.orca-browser.host-module')];
                if (l && host) {
                    try { const k = await l.connection(); const s = await host.attachBrowserHost({ connection: { endpoint: k.endpoint, hostPublicKeyB64: k.hostPublicKeyB64 }, credential: k.credential, browserHostClientId: 'pb-host-diag-' + crypto.randomUUID(), inventory: () => [], onCommand: () => undefined, onDetached: () => undefined }); s.detach(); attach = 'a second attach succeeds'; }
                    catch (e) { attach = 'a second attach fails: ' + String(e && e.message).slice(0, 60); }
                }
                return c + ', host module ' + !!host + ', bundle booted ' + !!(globalThis[Symbol.for('powerbrowser.orca-panes.module')] && globalThis[Symbol.for('powerbrowser.orca-panes.module')].state().booted) + ', ' + attach;`, 60000).catch((e) => `probe: ${String(e?.message ?? e).slice(0, 80)}`);
            obs.i = { agentWidgetsAfter: (await ctx.webTabs()).filter((w) => w.agent).length, reattached: reattached === true, oldListed, diag };
        });
        // (b2) the screenshot half in a second launch at DPR 2.
        await withBrowserSession({ log, dpr: 2 }, async (ctx) => {
            await ctx.hostAttached();
            const c = await createObserved(ctx);
            obs.b2 = c.pageId ? await screenshotObserved(ctx, c.pageId) : { dpr: 2, deviceDpr: 2, ok: false, code: c.code, size: [0, 0], viewportCss: [0, 0] };
        });
    } finally {
        rmSync(home, { recursive: true, force: true });
    }
    return obs;
}

async function main() {
    const pre = prerequisites(REPO_ROOT);
    if (pre.skip) { console.log(`${NAME}: SKIP -- ${pre.skip}`); return 0; }
    if (pre.fail) { console.error(`${NAME}: FAIL -- ${pre.fail}`); return 1; }
    const log = (s) => console.log(`${NAME}: ${s}`);
    let obs;
    try { obs = await liveRun(log); } catch (e) { console.error(`${NAME}: FAIL -- harness: ${String(e?.message ?? e).split('\n')[0]}`); return 1; }
    const { fails, skips } = judgeAll(obs);
    // One line per clause, so a run records every clause, not only the failing ones.
    for (const k of Object.keys(VERDICTS)) {
        const own = fails.filter((f) => f.startsWith(`(${k}) `));
        console.log(`${NAME}: clause (${k}) ${obs[k]?.skip ? 'SKIP' : own.length ? 'FAIL' : 'ok'}${k === 'g' && obs.g ? ` (credential ${obs.g.credential}, placement ${obs.g.placement?.kind})` : ''}${['k', 'a'].includes(k) && obs[k] ? ` (${obs[k].ms} ms)` : ''}${k === 'j' && obs.j?.revealMs != null ? ` (reveal ${obs.j.revealMs} ms)` : ''}${k === 'm' && obs.m?.promptType ? ` (${obs.m.promptType})` : ''}${k === 'e2' && obs.e2 ? ` (userContextId ${obs.e2.agentContext})` : ''}${k === 'n' && obs.n?.agent ? ` (user: link ${obs.n.user.linkTabs} tab, window.open ${obs.n.user.openTabs} tab, popup ${obs.n.user.popupWindows} window; agent: ${obs.n.agent.newTabs} tabs, ${obs.n.agent.newWindows} windows, ${obs.n.agent.loads} loads, window.open ${obs.n.agent.openReturned}, with features ${obs.n.agent.popupReturned}, middle-click ${obs.n.agent.middleReply}, Control+Enter ${obs.n.agent.enterReply}, sandboxFlags ${obs.n.agent.sandboxFlags})` : ''}${(k === 'b1' || k === 'b2') && obs[k] ? ` (DPR ${obs[k].deviceDpr}, ${obs[k].size?.join('x')} px)` : ''}${k === 'o' && obs.o?.agent ? ` (user: saved ${obs.o.user.saved}, ${obs.o.user.rowsAdded} row, ${obs.o.user.windows} window; agent: ${obs.o.agent.requests} requests, folder ${obs.o.agent.filesBefore.length} -> ${obs.o.agent.filesAfter.length} file(s), rows ${obs.o.agent.rowsBefore} -> ${obs.o.agent.rowsAfter}, ${obs.o.agent.newWindows} windows, click ${obs.o.agent.clickReply}, goto ${obs.o.agent.gotoReply})` : ''}${k === 'p' && obs.p?.agent ? ` (user: mailto launched ${obs.p.user.mailtoLaunched}, ${PROTOCOL_RUN} launched ${obs.p.user.runLaunched}, ${PROTOCOL_ASK} ${obs.p.user.askWindows} dialog; agent: ${obs.p.agent.launches} launches, ${obs.p.agent.newWindows} windows, ${Object.entries(obs.p.agent.replies).map(([s, r]) => `${s} ${r}`).join(', ')})` : ''}${k === 'q' && obs.q?.created ? ` (initial ${obs.q.initialBefore}; mouseClick ${obs.q.clickReply}, popup ${obs.q.popupReply}, ${obs.q.newWindows} windows, ${obs.q.loads} loads; after the first load: ${obs.q.evalAfter})` : ''}${k === 'r' && obs.r?.agent ? ` (user: copy ${obs.r.user.copy}, frame ${obs.r.user.frame}, write ${obs.r.user.write}, paste ${obs.r.user.pasted}; agent: click ${obs.r.agent.clickReply}, activation ${obs.r.agent.rec?.active}, execCommand ${obs.r.agent.rec?.execCopy}, writeText ${obs.r.agent.rec?.writeText}, frame ${obs.r.agent.rec?.frameWrite}, readText ${obs.r.agent.rec?.readText}, clipboard ${obs.r.agent.afterClick}; Control+v ${obs.r.agent.ctrlV}, Shift+Insert ${obs.r.agent.shiftInsert}, Control+c ${obs.r.agent.ctrlC}, Control+a ${obs.r.agent.controlReply}, input ${obs.r.agent.input}, clipboard ${obs.r.agent.afterKeys})` : ''}${k === 's' && obs.s ? ` (pref ${obs.s.pref}; user tab ${obs.s.user}, agent tab ${obs.s.agent}, agent's own grant ${obs.s.agentOwn})` : ''}`);
    }
    for (const s of skips) console.log(`${NAME}: SKIP ${s}`);
    if (fails.length) { for (const f of fails) console.error(`${NAME}: FAIL -- ${f}`); return 1; }
    const g = obs.g.credential;
    console.log(`${NAME}: PASS -- (k) no-pane create one tab in ${obs.k.ms} ms; (a) one background agent tab in ${obs.a.ms} ms; (b) goto, click, type, screenshot at DPR 1 and 2; (c) parked focus held; (d) refusals; (e) container; (e2) agent container ${obs.e2.agentContext}; (l) saved login filled for the user only, no LoginManager actor or capture in the agent tab; (m) HTTP auth (${obs.m.promptType}) refused to the agent; (c2) typing kept while the parked page called focus(); (n) agent opens refused after user opens adopted; (o) agent downloads refused after a user download saved; (p) agent protocol links refused after user launches and a dialog; (q) commands refused on the initial about:blank; (r) agent clipboard writes, reads and keys refused after user writes and a paste; (s) a default-container grant not effective in the agent tab; (f) ${obs.f.skip ? 'SKIP' : 'no decoy'}; (g) renderer createPage over ${g}; (h) user close; (j) reveal in ${obs.j.revealMs} ms after store activation; (i) reload`);
    return 0;
}

// ---------------------------------------------------------------- self-test

const CONTROL = {
    k: { bundleBooted: true, linkPresent: true, paneWidgetsBefore: 0, paneWidgetsAfter: 0, newTabs: 1, ms: 180 },
    a: { ok: true, code: null, pageId: 'p1', newTabs: [{ tabId: 't1', agent: true, current: false }], ms: 170, boundTab: 't1' },
    b: { title: 'PB agent fixture', expectedTitle: 'PB agent fixture', clickCount: '1', typed: 'pb-typed', expectedTyped: 'pb-typed' },
    b1: { dpr: 1, deviceDpr: 1, ok: true, size: [800, 600], viewportCss: [800, 600], inside: [255, 0, 0], outside: [255, 255, 255] },
    b2: { dpr: 2, deviceDpr: 2, ok: true, size: [1600, 1200], viewportCss: [800, 600], inside: [255, 0, 0], outside: [255, 255, 255] },
    c: { agentActiveAfterFocus: 'in', before: { chrome: 'u', userHasFocus: true, userActive: 'in' }, after: { chrome: 'u', userHasFocus: true, userActive: 'in' }, userBlurs: [], chromeHitIsAgent: false },
    d: { invented: { ok: false, code: 'browser_unavailable' }, userTab: 'not-agent-tab', stockTab: 'unknown-tab' },
    e: { ownRead: true, userCookieSet: true, userVisible: false },
    e2: { userContext: 0, agentContext: 7, containerPref: 7 },
    l: { saved: true, userFilled: true, userActor: true, agentFilled: false, agentActor: false, agentSubmitted: true, capturedAfter: 0 },
    m: { promptSeen: true, promptType: 'promptUserAndPass', reply: { where: 'failed', code: 'browser_command_unavailable' }, promptAfter: true, promptAfterClose: false, authorized: false },
    c2: { controlTyped: 'ab', controlExpected: 'ab', agentSelfActive: 'in', userTyped: 'abcdefgh', userExpected: 'abcdefgh', agentValue: '', userBlurs: [], chromeBefore: 'u', chromeAfter: 'u' },
    n: {
        user: { linkTabs: 1, linkLoads: 1, openTabs: 1, openLoads: 1, agentAmong: false, popupWindows: 1, sandboxFlags: 0 },
        agent: { currentBefore: 'u', currentAfter: 'u', chromeBefore: 'u', chromeAfter: 'u', shellActiveBefore: true, shellActiveAfter: true, newTabs: 0, newWindows: 0, loads: 0, openReturned: 'null', popupReturned: 'null', middleReply: 'failed browser_command_unavailable', enterReply: 'failed browser_command_unavailable', sandboxFlags: 2, ownNavigation: true },
    },
    o: {
        user: { saved: true, files: ['pb-user.pdf'], rowsAdded: 1, windows: 1 },
        agent: { filesBefore: ['pb-user.pdf'], filesAfter: ['pb-user.pdf'], rowsBefore: 1, rowsAfter: 1, newWindows: 0, currentBefore: 'u', currentAfter: 'u', requests: 2, clickReply: 'failed browser_command_unavailable', gotoReply: 'failed browser_command_unavailable' },
    },
    p: {
        user: { mailtoLaunched: true, runLaunched: true, askWindows: 1 },
        agent: { launches: 0, newWindows: 0, replies: { 'mailto:': 'failed browser_command_unavailable', 'pbrun:': 'failed browser_command_unavailable', 'pbask:': 'failed browser_command_unavailable' } },
    },
    q: { created: true, initialBefore: true, clickReply: 'failed browser_command_unavailable', popupReply: 'failed browser_command_unavailable', newWindows: 0, loads: 0, initialAfter: false, evalAfter: 'done /slow' },
    r: {
        user: { copy: 'copy', frame: 'frame', write: 'user', pasted: 'user' },
        agent: {
            clickReply: 'done', rec: { clicked: true, active: true, execCopy: 'true', writeText: 'rejected NotAllowedError', frameWrite: 'rejected NotAllowedError', readText: 'rejected NotAllowedError' }, afterClick: 'user',
            ctrlV: 'failed browser_command_unavailable', shiftInsert: 'failed browser_command_unavailable', ctrlC: 'failed browser_command_unavailable', controlReply: 'done', input: 'empty', afterKeys: 'user',
        },
    },
    s: { pref: true, user: 'granted', agent: 'default', agentOwn: 'granted' },
    f: { stock: { pass: { stockMs: 900 } }, createOk: true, title: 'PB agent fixture two', expectedTitle: 'PB agent fixture two', quietMs: 30000, minQuietMs: 10000, markerPresent: false },
    g: { placement: { kind: 'client' }, reply: { ok: true, code: null }, createPageArrived: true, credential: 'device-key' },
    h: { closed: true, listedAfter: false },
    j: { bound: true, listed: true, userWidget: 'u', currentBefore: 'u', currentAfterCreate: 'u', userFocusBefore: 'true', userFocusAfter: 'true', rowListed: true, rowActive: false, activationSeen: true, boundWidget: 'w2', currentAfterActivation: 'w2', revealMs: 140, webTabsBefore: 3, webTabsAfter: 3 },
    i: { agentWidgetsAfter: 0, reattached: true, oldListed: [] },
};

const set = (clause, patch) => (o) => ({ ...o, [clause]: { ...o[clause], ...patch } });
const setN = (side, patch) => (o) => ({ ...o, n: { ...o.n, [side]: { ...o.n[side], ...patch } } });
const setIn = (clause, side, patch) => (o) => ({ ...o, [clause]: { ...o[clause], [side]: { ...o[clause][side], ...patch } } });
const setRec = (patch) => (o) => ({ ...o, r: { ...o.r, agent: { ...o.r.agent, rec: { ...o.r.agent.rec, ...patch } } } });
const PLANTS = [
    ['two-tabs-one-page', set('a', { newTabs: [{ tabId: 't1', agent: true, current: false }, { tabId: 't9', agent: true, current: false }] }), 'two tabs for one page'],
    ['tab-current-at-create', set('a', { newTabs: [{ tabId: 't1', agent: true, current: true }] }), 'a tab current at create'],
    ['create-slower-than-1s', set('a', { ms: 1400 }), 'create slower than 1000 ms'],
    ['screenshot-off-by-dpr', set('b2', { size: [800, 600], inside: [255, 255, 255] }), 'screenshot pixel off by the DPR'],
    ['user-blur-recorded', set('c', { userBlurs: ['in'] }), 'a user blur was recorded'],
    ['chrome-focus-change', set('c', { after: { chrome: 'a', userHasFocus: true, userActive: 'in' } }), 'chrome focus moved'],
    ['focus-detector-blind', set('c', { agentActiveAfterFocus: 'BODY', userBlurs: [] }), 'detector blind'],
    ['user-tab-answers-done', set('d', { userTab: 'done' }), 'the user tab answered done'],
    ['user-cookie-visible', set('e', { userVisible: true }), 'the user cookie is visible'],
    ['own-cookie-unread', set('e', { ownRead: false, userVisible: false }), 'detector blind'],
    ['decoy-without-detectors', set('f', { stock: { fails: ['the warning was not printed'] } }), 'detector blind'],
    ['decoy-marker-present', set('f', { markerPresent: true }), 'a decoy marker is present'],
    ['device-mismatch-lease-stale', set('g', { reply: { ok: false, code: 'browser_host_lease_stale' } }), 'browser_host_lease_stale'],
    ['page-listed-after-close', set('h', { listedAfter: true }), 'still listed after a user close'],
    ['agent-widget-survives-reload', set('i', { agentWidgetsAfter: 1 }), 'an agent widget survived a reload'],
    ['tab-revealed-at-create', set('j', { currentAfterCreate: 'w2' }), 'a tab revealed at its own create'],
    ['activation-revealed-nothing', set('j', { currentAfterActivation: 'u', revealMs: null }), 'revealed nothing'],
    ['activation-detector-blind', set('j', { activationSeen: false, currentAfterActivation: 'w2', revealMs: 10 }), 'store activation not observed'],
    ['user-tab-not-current', set('j', { currentBefore: null, currentAfterCreate: null }), "user tab was not the main area's current tab"],
    ['no-store-row', set('j', { rowListed: false, rowActive: false }), 'no Orca store row'],
    ['store-row-active-at-create', set('j', { rowActive: true }), 'store row was active at its create'],
    ['second-tab-on-activation', set('j', { webTabsAfter: 4 }), 'changed the web tab count'],
    ['orca-pane-during-no-pane', set('k', { paneWidgetsAfter: 1 }), 'Orca-pane widget present'],
    ['no-web-tab-from-no-pane', set('k', { newTabs: 0, ms: null }), 'no web tab from the no-pane create'],
    ['stock-tab-not-unknown', set('d', { stockTab: 'not-agent-tab' }), 'the stock-window tab answered'],
    ['invented-page-served', set('d', { invented: { ok: true, code: null } }), 'an invented page id was served'],
    ['no-pane-detector-blind', set('k', { linkPresent: false }), 'detector blind'],
    ['agent-tab-outside-container', set('e2', { agentContext: 0 }), 'the agent tab is not in a container'],
    ['agent-tab-in-another-container', set('e2', { agentContext: 3 }), 'is not the agent container'],
    ['container-detector-blind', set('e2', { userContext: null }), 'detector blind'],
    ['login-autofilled-in-agent-tab', set('l', { agentFilled: true }), 'autofilled in the agent tab'],
    ['login-actor-on-agent-tab', set('l', { agentActor: true }), 'has a LoginManager actor'],
    ['agent-submit-captured', set('l', { capturedAfter: 1 }), 'the agent submit stored 1 login'],
    ['login-detector-blind', set('l', { userFilled: false }), 'detector blind'],
    ['auth-prompt-answered', set('m', { reply: { where: 'done', code: null }, promptAfter: false }), 'not failed browser_command_unavailable'],
    ['auth-detector-blind', set('m', { promptSeen: false }), 'detector blind'],
    ['auth-prompt-outlives-tab', set('m', { promptAfterClose: true }), 'outlived its closed tab'],
    ['agent-took-the-keys', set('c2', { userTyped: 'ab', agentValue: 'cdefgh' }), 'the parked agent page received keys'],
    ['typing-user-blur', set('c2', { userBlurs: ['in'] }), 'a user blur was recorded while typing'],
    ['typing-control-blind', set('c2', { controlTyped: '' }), 'detector blind'],
    ['agent-focus-never-ran', set('c2', { agentSelfActive: 'BODY' }), 'detector blind'],
    ['agent-open-made-a-tab', setN('agent', { newTabs: 1 }), "the agent page's opens created 1 web tab"],
    ['agent-open-made-a-window', setN('agent', { newWindows: 1 }), "the agent page's opens created 1 window"],
    ['agent-open-loaded-a-page', setN('agent', { loads: 1 }), "the agent page's opens loaded 1 page"],
    ['agent-window-open-returned-a-window', setN('agent', { openReturned: 'a window' }), "window.open answered a window"],
    ['agent-popup-returned-a-window', setN('agent', { popupReturned: 'a window' }), 'window.open with features answered a window'],
    ['agent-middle-click-done', setN('agent', { middleReply: 'done' }), 'middle-click on a link answered done'],
    ['agent-enter-done', setN('agent', { enterReply: 'done' }), 'Control+Enter on a link answered done'],
    ['agent-open-moved-current', setN('agent', { currentAfter: 'w9' }), "the main area's current tab changed"],
    ['agent-open-moved-focus', setN('agent', { shellActiveAfter: false }), 'the user focus moved'],
    ['agent-overlay-unsandboxed', setN('agent', { sandboxFlags: 0 }), 'lacks SANDBOXED_AUXILIARY_NAVIGATION'],
    ['user-overlay-sandboxed', setN('user', { sandboxFlags: 2 }), 'a user overlay has SANDBOXED_AUXILIARY_NAVIGATION'],
    ['agent-own-navigation-blocked', setN('agent', { ownNavigation: false }), "own plain link click did not navigate"],
    ['opens-link-detector-blind', setN('user', { linkTabs: 0 }), 'detector blind'],
    ['opens-popup-detector-blind', setN('user', { popupWindows: 0 }), 'detector blind'],
    ['opens-load-detector-blind', setN('user', { openLoads: 0 }), 'detector blind'],
    // 66-09 (D-37): downloads, external protocols, the initial document.
    ['agent-download-saved', setIn('o', 'agent', { filesAfter: ['pb-agent.pdf', 'pb-user.pdf'] }), 'changed the download folder'],
    ['agent-download-partial-left', setIn('o', 'agent', { filesAfter: ['pb-agent.pdf.part', 'pb-user.pdf'] }), 'changed the download folder'],
    ['agent-download-listed', setIn('o', 'agent', { rowsAfter: 2 }), 'added 1 row(s) to the downloads list'],
    ['agent-download-viewer-window', setIn('o', 'agent', { newWindows: 1 }), "the agent page's downloads opened 1 window"],
    ['agent-download-click-done', setIn('o', 'agent', { clickReply: 'done' }), 'click on a PDF attachment link answered done'],
    ['agent-download-goto-done', setIn('o', 'agent', { gotoReply: 'done' }), 'goto of a PDF attachment answered done'],
    ['agent-download-moved-current', setIn('o', 'agent', { currentAfter: 'w9' }), "the main area's current tab changed during the agent downloads"],
    ['download-detector-blind', setIn('o', 'user', { saved: false }), 'detector blind'],
    ['download-row-detector-blind', setIn('o', 'user', { rowsAdded: 0 }), 'detector blind'],
    ['agent-download-never-asked', setIn('o', 'agent', { requests: 0 }), 'detector blind'],
    ['agent-protocol-launched', setIn('p', 'agent', { launches: 1 }), 'launched the stub application 1 time'],
    ['agent-protocol-dialog', setIn('p', 'agent', { newWindows: 1 }), "the agent page's protocol links opened 1 window"],
    ['agent-protocol-click-done', setIn('p', 'agent', { replies: { 'mailto:': 'done', 'pbrun:': 'failed browser_command_unavailable', 'pbask:': 'failed browser_command_unavailable' } }), 'click on a mailto: link answered done'],
    ['protocol-launch-detector-blind', setIn('p', 'user', { runLaunched: false }), 'detector blind'],
    ['protocol-dialog-detector-blind', setIn('p', 'user', { askWindows: 0 }), 'detector blind'],
    ['first-document-click-done', set('q', { clickReply: 'done' }), 'browser.mouseClick on the initial about:blank answered done'],
    ['first-document-popup-opened', set('q', { popupReply: 'done', newWindows: 1, loads: 1 }), 'opened 1 window'],
    ['first-document-guard-outlives', set('q', { evalAfter: 'failed browser_command_unavailable' }), 'the guard outlived the initial document'],
    ['first-document-detector-blind', set('q', { initialBefore: false }), 'detector blind'],
    // 66-10 (D-38, D-39): the clipboard and per-container permissions.
    ['agent-click-wrote-clipboard', setIn('r', 'agent', { afterClick: 'write' }), "the agent page's click changed the clipboard to write"],
    ['agent-execcommand-copied', setIn('r', 'agent', { afterClick: 'copy' }), "the agent page's click changed the clipboard to copy"],
    ['agent-writetext-resolved', setRec({ writeText: 'resolved' }), "the agent page's writeText answered resolved"],
    ['agent-frame-write-resolved', setRec({ frameWrite: 'resolved' }), "the agent page's frameWrite answered resolved"],
    ['agent-readtext-read-user', setRec({ readText: 'resolved user-marker' }), "the agent page's readText answered resolved user-marker"],
    ['agent-readtext-pending', setRec({ readText: 'pending' }), "the agent page's readText answered pending"],
    ['agent-ctrl-v-done', setIn('r', 'agent', { ctrlV: 'done' }), "the agent's Control+v answered done"],
    ['agent-shift-insert-done', setIn('r', 'agent', { shiftInsert: 'done' }), "the agent's Shift+Insert answered done"],
    ['agent-ctrl-c-done', setIn('r', 'agent', { ctrlC: 'done' }), "the agent's Control+c answered done"],
    ['agent-pasted-user-clipboard', setIn('r', 'agent', { input: 'user' }), "the agent page's input holds user"],
    ['agent-keys-changed-clipboard', setIn('r', 'agent', { afterKeys: 'other' }), "the agent's keys changed the clipboard to other"],
    ['clipboard-copy-detector-blind', setIn('r', 'user', { copy: 'other' }), 'detector blind'],
    ['clipboard-frame-detector-blind', setIn('r', 'user', { frame: 'copy' }), 'detector blind'],
    ['clipboard-paste-detector-blind', setIn('r', 'user', { pasted: 'empty' }), 'detector blind'],
    ['clipboard-agent-handler-never-ran', setIn('r', 'agent', { rec: null }), 'detector blind'],
    ['clipboard-agent-no-activation', setRec({ active: false }), 'detector blind'],
    ['clipboard-keypress-broken', setIn('r', 'agent', { controlReply: 'failed browser_error' }), 'detector blind'],
    ['agent-reads-user-grant', set('s', { agent: 'granted' }), "the agent tab read the user's default-container grant as granted"],
    ['isolation-pref-off', set('s', { pref: false }), 'permissions.isolateBy.userContext reads false'],
    ['permission-user-detector-blind', set('s', { user: 'default' }), 'detector blind'],
    ['permission-agent-detector-blind', set('s', { agentOwn: 'default' }), 'detector blind'],
];

export function runSelfTest() {
    const control = judgeAll(CONTROL);
    if (control.fails.length || control.skips.length) { console.error(`${NAME} self-test: FAIL -- control is not green: ${[...control.fails, ...control.skips].join(' | ')}`); return 1; }
    console.log(`${NAME} self-test: control green -- ${Object.keys(VERDICTS).length} clause observations`);
    let failures = 0;
    for (const [name, plant, naming] of PLANTS) {
        const r = judgeAll(plant(CONTROL));
        if (!r.fails.some((s) => s.includes(naming))) { console.error(`  FAIL ${name} -> ${r.fails.join(' | ') || 'green'} (expected '${naming}')`); failures++; } else console.log(`  ok ${name} -> red, naming '${naming}'`);
    }
    // The (f) clause with a skipped stock half is a named SKIP, never a PASS of the absence.
    const skipped = judgeAll({ ...CONTROL, f: { skip: 'an installed Orca exists' } });
    if (skipped.fails.length || skipped.skips.length !== 1) { console.error('  FAIL decoy-skip -> the skipped decoy clause was not reported as a SKIP'); failures++; } else console.log('  ok decoy-skip -> (f) reported as a named SKIP');
    if (failures) { console.error(`${NAME} self-test: FAIL -- ${failures} case(s) did not behave`); return 1; }
    console.log(`${NAME} self-test: PASS -- ${PLANTS.length} planted faults each went red naming the drift`);
    return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const arg = process.argv[2];
    if (arg && arg !== '--self-test') { console.error('usage: node scripts/verify-orca-browser-agent-live.mjs [--self-test]'); process.exit(2); }
    process.exit(arg === '--self-test' ? runSelfTest() : await main());
}
