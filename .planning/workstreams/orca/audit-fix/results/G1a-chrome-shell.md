# Result: G1a-chrome-shell

Branch: worktree-agent-a5092d30574b83066   Base: 0f9f2735401a08132a479c95c09c53f03015fa19 (round 2 on 1dd2cbfc)   Final: (this record's commit; code final ad5a5a7b)

| ID | Status | Commit | Check | Note |
|---|---|---|---|---|
| agent-browser-03 | fixed | 377f5449, c2ac1d12 | verify-agent-tab-walls.mjs::cookies | no cookie row reaches an httpOnly cookie: get withholds its value, set refuses httpOnly true and any name the site holds as httpOnly, delete refuses one; rows act on the current site only |
| agent-browser-04 | fixed | 3f42d38c, f766f926, ddd629f5 | verify-agent-tab-walls.mjs::stop | Stop is per shell window and survives a frontend reload: every agent tab stopped, new agent tabs refused until Resume; the mark renders from chrome's agent status in the control push; Orca navigate goes through the agent wall |
| chrome-actor-03 | needs-owner | - | no-check: no code change | Orca's bundle shares the Theia realm; an in-realm nonce or MessagePort is readable by same-realm script, so only a separate origin or frame (Route B') is a boundary |
| agent-browser-02 = chrome-actor-02 = 66-CR-01 | fixed | 9d2e4bd1, ddd629f5, ad5a5a7b | verify-agent-tab-walls.mjs::agentFlag | agent tabs live under a web:agent- row key; chrome makes any open under one an agent tab, after a relaunch too, and refuses an agent tab under any other key; tab ids are also remembered for the session; the widget sends the flag on every open |
| 59-WR-02 | fixed | a20914da | verify-agent-tab-walls.mjs::scroll | scrollIntoView with behavior "instant" in agentCentre and the scrollIntoView row |
| 59-WR-01 | fixed | 93122d51, fb31e37f | verify-agent-tab-walls.mjs::editState | text-field edit rows in agent overlays use the Controllers route |
| 59-WR-03 | fixed | 30f12b86, 17f0683f | verify-agent-tab-walls.mjs::budget | every done result measured once in UTF-8 JSON bytes; a snapshot keeps room for the browserPageId, url and title the dispatcher adds |
| 59-WR-05 | fixed | 0467eafe | verify-agent-tab-walls.mjs::sideHeader | side header scrollbar built on X, icons do not shrink, comment corrected |
| 66-WR-06 | fixed | 3f42d38c | verify-agent-tab-walls.mjs::stop | widget exposes `opened`; the host awaits it and fails createPage (and closes the tab) unless chrome answers opened or loading |
| agent-browser-06 | fixed (in part) | a1726b47, 224a6612, fb31e37f | verify-agent-tab-walls.mjs::services | agent loads to the sidecar and orcad ports are refused before send, by container (workers included), on a normalised address; a DNS-rebinding name can still deliver one request (Needs owner) |
| chrome-actor-04 | fixed (in part) | 377f5449 | verify-agent-tab-walls.mjs::cookies | the no-url whole-container read is gone and httpOnly values are withheld; per-worktree and hidden containers are under Needs owner |
| chrome-actor-05 | fixed | c6bc56b7 | verify-agent-tab-walls.mjs::history | agent overlays carry disableglobalhistory from creation; tab-store rows unchanged |
| chrome-actor-06 | fixed | 93122d51, fb31e37f | verify-agent-tab-walls.mjs::editState | pageEditTargetCommands and webTabEditEnabled do not ask for the edit-state pair in agent overlays |
| 67-WR-04 (from G3b) | fixed | 35c83570 | verify-agent-tab-walls.mjs::orcaStatus | orcaStatus accepts the literal `{ clientReason: null }` and calls `OrcaService.clientRecovered?.()` |
| orcad-hosting-03 (from G2) | fixed | 9a5226ef, ad5a5a7b | verify-agent-tab-walls.mjs::socketTable | `PowerBrowserOrcaHosting.readLoopbackSocketTable()` resolves `{ tcp, tcp6, uid }`, reading both tables; the body is on PowerBrowserProcesses so ng-027 sees its caller |
| review item 6 (catalogue) | fixed | fd3d9a33 | verify-agent-tab-walls.mjs::catalogue | rows for disableglobalhistory, channel.suspend and resume, loadInfo.originAttributes and Components.isSuccessCode |
| harness-other-08 (from H8) | applied | fd3d9a33 | no-check: H8's tightened internals-boundary check confirms it at integration | the three GroupActorChild Cc rows (294, 675, 676) name their contract IDs, in H8's exact text |
| 66-CR-04 (from G1b) | applied | ad5a5a7b | verify-agent-tab-walls.mjs --self-test | the navigate plant derives its anchor from the host's own navigate line, so it fits both G1b's agentRequest wording and the older one |

Security-review follow-up on a1726b47 (coordinator, three points), all in 224a6612:
1. Refusal after send: this applied only in part. a1726b47 already refused a spelled loopback host on a service port at http-on-modify-request, before send, because agentChannelRefused checked the URL on every topic before the examine-response branch. A name that resolves to loopback was caught only at http-on-examine-response. Now a service-port request with a host name is suspended at http-on-modify-request, its name is resolved in the channel's own DNS partition, and the request is cancelled before resume when any resolved address is loopback. The remote-address check stays as a second line.
2. Worker loads: fixed. The wall now judges loads by `loadInfo.originAttributes.userContextId` against the agent containers chrome created (`agentContainerIds`).
3. Recogniser: fixed. Each address is parsed once (IPv4 in 1 to 4 parts, decimal, octal or hex; IPv6 with brackets, a zone, `::` and a dotted tail). The normalised form is then classified: 127/8, 0/8, `::1`, `::`, and IPv4-mapped or IPv4-compatible forms of those, plus localhost and `*.localhost` with or without a trailing dot. Each gap is a planted fault in the self-test.

Review round 2 (on 1dd2cbfc), per point:
1. agent-browser-02 across a relaunch (ddd629f5): I chose to keep agent status in the row key, not to leave agent widgets out of the saved copies.
   - Leaving them out fails open: any saved copy that is missed, or a widget that has no flag of its own, comes back as a user tab.
   - With the key, every saved copy (session snapshot, Setup, closed-tab row, kept history) already carries the agent key, and chrome refuses to make an agent tab under any other key.
   - Planted: session restore (saveSession keeps `rowKey`), Setup and session restore (restoreWebTab opens under `key: tab.rowKey`), and Reopen Closed Tab (openUrl under `tab.key`). In chrome, a fresh world with no remembered ids opens a saved agent row with no flag.
2. agent-browser-03 (c2ac1d12): applied.
   - set refuses httpOnly true, and any name the site holds as httpOnly under any host or path (not only the same host and path), so a longer path or a domain cookie cannot shadow one.
   - delete refuses an httpOnly cookie. The comment is corrected.
3. agent-browser-04 (ddd629f5): applied.
   - agentControlChanged carries `agent`. Chrome pushes it when it creates any agent tab, and the mark and title class render from it.
   - Stop is keyed on the shell window (agentStopScope), so a reload of the Theia document keeps it.
4. 59-WR-03 (17f0683f): applied in chrome; the dispatcher (G1b's file) is unchanged.
   - Bounds: orca/src/shared/browser-client-page-metadata-protocol.ts:14-15 (url 8192, title 4096) and browser-client-host-protocol.ts:15 (384 identity bytes).
5. agent-browser-06 DNS pinning: Gecko gives chrome no point to pin the verdict to the connected address before data is written. The gap is under Needs owner.
6. Catalogue (fd3d9a33): rows added, with a check clause.
7. Behaviour changes: added below.
8. orcad-hosting-03 (9a5226ef, ad5a5a7b): added; it reads both TCP tables.

## Registry requests
- scripts/verify-agent-tab-walls.mjs: quick, `"agent-tab-walls|node $REPO_ROOT/scripts/verify-agent-tab-walls.mjs"`
- scripts/verify-agent-tab-walls.mjs --self-test: quick, `"agent-tab-walls-self-test|node $REPO_ROOT/scripts/verify-agent-tab-walls.mjs --self-test"` (57 plants)

## Red by design
- orca-browser-tab-scope and orca-browser-tab-scope-self-test: the stub world's fake overlay has no current page. Under agent-browser-03 a cookie row on a page with no site is refused, so the cookie scenario's get with a url, set and delete answer browser_command_unavailable. Exact change, in `scripts/verify-orca-browser-tab-scope.mjs` makeWorld/fakeBrowser (line 230): `const browser = { tabIdHint, appended: false, docShellIsActive: false, ownerDocument: doc, removed: false, attrs, currentURI: { host: 'example.com', spec: 'https://example.com/' } };`. I ran a temporary copy with that one change: the check is PASS and its self-test is PASS (64 plants).
- shell-error-copy-no-internals and shell-error-copy-no-internals-self-test: the agent mark's copy changed for agent-browser-04. In `scripts/verify-shell-error-copy.mjs` EXPECTED_NAV_COPY (the "Phase 66 (P66-23)" block, about line 619):
  - Remove `"An Orca agent you started is controlling this tab in ${name}. Select Stop to end it."` and `"Stop the agent's control of this tab in ${name}. The tab stays open."`.
  - Add `"An Orca agent you started is controlling this tab in ${name}. Select Stop to stop every agent's tabs."`, `"Agent tab"`, `"An Orca agent you started opened this tab in ${name}. Select Stop to stop every agent's tabs."`, `"Stop every Orca agent's control of its tabs in ${name}, and stop agents opening new ones. The tabs stay open."`, `"Agents stopped"`, `"You stopped Orca agents in ${name}. Select Resume to let them control their tabs again."`, `"Resume"` and `"Let Orca agents control their tabs in ${name} again."`.
  - `"Agent in control"` and `"Stop"` stay.
- scan-brand-residue and scan-brand-residue-self-test: the Orca coincidental rows count exact occurrences per listed file. Exact change, in `inventory/brand-tokens.json`:
  - Add `scripts/verify-agent-tab-walls.mjs` to expected_files of the `Orca`, `orca`, `ORCA` and `orcad` coincidental rows. The new file holds 28 `Orca`, 60 lowercase `orca` (28 of them inside `orcad`) and 8 `ORCA`.
  - Re-measure expected_count with the scanner. Before the new file is added, the scanner reports: Orca expected 3281, observed 3290; orca expected 5679, observed 5682; ORCA expected 1270, observed 1275; orcad expected 1786, observed 1793. Those deltas come from this lane's comments and copy in files already listed.
  - No inventory row is mine to edit.
  - Round 2, on top of the 1dd2cbfc recount (which already lists this script), the scanner reports:
    - Orca: expected 3630, observed 3636.
    - orca: expected 6128, observed 6129.
    - orcad: expected 2213, observed 2224.
    - The `PowerBrowserOrcaHosting` literal row: expected 12, observed 13.
    - Four condition-4 hits in `scripts/verify-agent-tab-walls.mjs`, near line 655: its socket-table clause names `PowerBrowserOrcaHosting` 4 times, and the file is not in that literal row's expected_files.
  - Add the script to that row, then re-measure all four counts with the scanner.

## Handoffs
- G1b-agent-browser (round 2): in `theia/extensions/orca-browser/src/browser/orca-browser-frontend-module.ts`, `closeStaleAgentTabs` and the `agentsStopped` dep should read chrome's status, `widget.agentControl.agent`, instead of `widget.agent` (or test both). A restored agent row has no widget flag. Today a stale restored agent tab is not closed and does not count for the stop pre-check; chrome still refuses its calls.
- G1b-agent-browser (optional): `WebTabChannel.request` could take a timeout argument, so the host needs no request helper of its own. I did not make it, because G1b is editing that helper and the change belongs with its caller.
- G2-orcad-hosting (round 2): `readLoopbackSocketTable()` now resolves `{ tcp, tcp6, uid }`.
  - `OrcaEnv.portHolderUidOf` should also scan `table.tcp6` for a listening row (st `0A`) at orcad's port whose local address, in /proc hex, is `00000000000000000000000000000000` (`::`), `00000000000000000000000001000000` (`::1`) or `0000000000000000FFFF00000100007F` (`::ffff:127.0.0.1`).
  - `_portHolderRows` must pass `table.tcp6`. Until then a dual-stack holder gives no row.
- G1b-agent-browser: I edited `theia/extensions/orca-browser/src/common/orca-browser-dispatch.ts`, which gains `DispatchFailure`, the optional `agentsStopped` dep, the navigate reply mapping and the catch mapping. I also edited `theia/extensions/orca-browser/src/browser/orca-browser-frontend-module.ts`: openAgentTab awaits `widget.opened`, navigate is sent as webTabAgent browser.goto, and the `agentsStopped` dep is added. Both were needed for agent-browser-04 and 66-WR-06. Rebase onto 3f42d38c.
- G2-orcad-hosting: 67-WR-04 calls `OrcaService.clientRecovered?.()`. The guard makes it a no-op until G2's method merges.
- integration: `inventory/brand-tokens.json` counts, as under Red by design.
- integration: the three actor-child catalogue rows (harness-other-08) wait for H8's tightened `scripts/check-internals-boundary.sh` to confirm them. That check is not in this worktree.

## Behaviour changes
- agent-browser-03 / chrome-actor-04 (P66-26): `browser.cookie.get` returns only the current site's cookies, and an httpOnly cookie comes back with an empty value. A get with a url, a set or a delete for another site, or for a public suffix, answers browser_command_unavailable. A get on the empty page returns no cookies. Revert with 377f5449.
- agent-browser-02 (P66-06): a crashed or lost agent tab that is reloaded reopens as an agent tab in the agent container, with its walls. A tab opened under a closed agent tab's row key (for example a Panorama reopen) is also an agent tab. Revert with 9d2e4bd1.
- agent-browser-04 (overturns P66-22 / D-19, per-tab Stop):
  - Stop on any agent tab stops every agent tab of that frontend, and chrome refuses new agent tabs until the user presses Resume on a stopped agent tab's mark.
  - A frontend reload also clears the stop.
  - The mark shows on every agent tab, not only while an agent is active. Its labels are "Agent tab", "Agent in control" and "Agents stopped", with a Resume button, and agent tabs keep the title mark for their whole life.
  - Orca's navigate command now runs as browser.goto through chrome's agent wall. It lights the mark and is refused on a stopped tab or on a tab that is not an agent tab.
  - Revert with 3f42d38c and f766f926.
- 66-WR-06: createPage now fails, and the new tab closes, when chrome makes no overlay (no container, a refusal, agents stopped, or a timeout). Before this, createPage reported completed. Revert with 3f42d38c.
- agent-browser-06: agent pages, their redirects and their workers cannot reach the Theia sidecar port or orcad's port on any loopback address. Other loopback ports (development servers) and LAN hosts are unchanged. A service-port request with a host name waits for one DNS lookup before it is sent. Revert with a1726b47, 224a6612 and fb31e37f.
- chrome-actor-05: pages agents visit no longer enter history or address-bar suggestions. Revert with c6bc56b7.
- 59-WR-01 / chrome-actor-06: Undo, Redo, Delete and Select All on a text field in an agent tab work again through Controllers. Revert with 93122d51.
- 59-WR-05: a side header narrower than its icons scrolls horizontally, and a vertical wheel scrolls it. Revert with 0467eafe.
- 67-WR-04: `{ kind: 'orcaStatus', clientReason: null }` is accepted and clears a stale client failure reason. Revert with 35c83570.
- 59-WR-02: agent scrolls (click targets and browser.scrollIntoView) are instant, even on pages that set smooth scrolling. Revert with a20914da.
- 59-WR-03: an oversized result now answers a browser error instead of failing at orcad as a transport error. A snapshot within about 49 KB of the limit now fails too, because room is kept for the fields the dispatcher adds. Revert with 30f12b86 and 17f0683f.
- agent-browser-04 (round 2):
  - While agents are stopped, an agent tab chrome already knows (a crashed one recreated, or one re-attached) may reopen. It opens stopped.
  - Stop lasts across a reload of the Theia document. Only Resume or closing the window ends it.
  - Revert with ddd629f5.
- agent-browser-02 (round 2): agent tabs get web:agent-<id> row keys.
  - After a relaunch, a saved session, Setup or closed-tab row of an agent tab reopens as an agent tab: in the agent container, with the mark, without login autofill.
  - Agent tabs saved before this change have web:wt- keys, and they still reopen as user tabs once.
  - Revert with ddd629f5.
- agent-browser-03 (round 2): browser.cookie.set with httpOnly true, a set of a name the site holds as httpOnly, and a delete of an httpOnly cookie now answer browser_command_unavailable. Revert with c2ac1d12.

## Needs owner
- chrome-actor-03: the real fix is to host the Orca bundle in a separate origin or frame that the PowerBrowserGroup actor does not match (Route B'). That is architectural and outside this lane's files. A per-kind nonce or MessagePort in the same realm is not a boundary, because same-realm script can patch `MessagePort.prototype.postMessage` or add a capture listener for the request event. At minimum, record T-61-04 as an owner decision (DECISIONS.md is not mine to edit).
- agent-browser-03 / chrome-actor-04: the owner decides on:
  - one container per worktree or agent session. A prompt-injected agent can choose its worktree, so this is no boundary against it, and upstream Orca also shares one partition per browser profile.
  - a hidden container. ContextualIdentityService has no public API that creates a private identity; `create` makes public ones only.
  - clearing the agent jar at each launch.
  - telling the user that sign-ins made in agent tabs are kept and shared across agents.
- agent-browser-04: Resume is reachable only on an open agent tab. Stop now survives a frontend reload. If no agent tab is open (the user closed them, or a reload dropped them), only closing the window or restarting clears it. A host-level Resume control, for example in the Orca pane, is an owner UI call.
- agent-browser-02: agent tabs saved before ddd629f5 carry web:wt- keys, and a restore reopens them once as user tabs. The owner can accept that, or ask for a one-time sweep of the saved Setups and the closed-tab list.
- agent-browser-06: two parts are not done.
  - The suggested "user-confirmed allow list for private addresses" (LAN) was not built.
  - The network observer installs with the session's first agent tab, so an agent-container service-worker load before any agent tab exists in a session is not judged.
- agent-browser-06, DNS rebinding (review point 5):
  - The pre-send verdict for a host name comes from chrome's own lookup in the channel's DNS partition. The channel's connect can resolve again and get a different answer: a bypass-cache retry on a fresh connection, a family-restricted lookup, an HTTPS record, an expired entry, or TRR in place of the native resolver.
  - So a rebinding name can answer a public address to the wall and loopback to the connect. One request then reaches the sidecar or orcad port, and only the response-time check cancels the response, before the page reads it.
  - Gecko gives chrome no hook between connect and the first write. DISABLE_RFC1918 is set on a socket only for speculative connections (upstream/netwerk/protocol/http/DnsAndConnectSocket.cpp:1305), nsSocketTransport2.cpp:1337 enforces it only there, and a channel cannot request it.
  - Local Network Access (network.lna.*, StaticPrefList.yaml:15394-15466) is a global setting, and its prefs exempt top-level navigations.
  - Closing the gap needs either a Gecko patch through patches/ (a per-channel loopback refusal at connect) or a decision to accept it. Both are the owner's call.
- agent-browser-06, non-HTTP transports: WebRTC (ICE, data channels) and WebTransport do not pass the http-on-* observers, so they are not judged at all. WebSocket is judged, because its handshake is an HTTP channel.

Live verification still owed (nothing here was run in a browser):
- These items need a purged startup cache: the Stop/Resume flow and the mark, crash recreate as an agent tab, the cookie scope, disableglobalhistory, the edit rows in agent tabs, the DNS pre-send suspend and cancel, and the side header scroll.

## Quick gate
Round 2 final run (after ad5a5a7b, on 1dd2cbfc plus this lane), inside `nix develop .#theia`: 436 PASS, 9 FAIL.
- scan-brand-residue, scan-brand-residue-self-test: red by design (inventory counts, above).
- orca-browser-tab-scope, orca-browser-tab-scope-self-test: red by design (the fakeBrowser currentURI change, above). A temporary copy with that one change is PASS, self-test PASS (64 plants), on this code.
- shell-error-copy-no-internals, shell-error-copy-no-internals-self-test: red by design (EXPECTED_NAV_COPY, above); not yet updated on 1dd2cbfc.
- orca-service, orca-service-self-test: not caused by this lane. It reports that TheiaService.sys.mjs sets two Orca env vars and that OrcaEnv's orcaStatusReply carries extra keys; neither file is mine. H8's record lists it as red by design on the base (lanes H2, H3).
- orca-pane-css-self-test: not caused by this lane. `orca/pb-css-scope.mjs` differs from `orca-overlay/files/pb-css-scope.mjs`, a build artifact under orca/ that provisioning copied in. Its next step is `scripts/build-orca.sh --panes-only`. I touched neither file.
- Fixed during round 2: new-window-adopt (it reads createWidget's id template from the options literal) and ng-027-reader-callers (it counts callers only through PowerBrowserAPI or PowerBrowserProcesses). Both fixed in ad5a5a7b.

Round 1:
Final run (after fb31e37f), inside `nix develop .#theia`: 411 PASS, 7 FAIL (the base had 419 PASS, 0 FAIL).
- scan-brand-residue, scan-brand-residue-self-test: red by design (inventory counts, above).
- orca-browser-tab-scope, orca-browser-tab-scope-self-test: red by design (fake overlay has no current site, above).
- shell-error-copy-no-internals, shell-error-copy-no-internals-self-test: red by design (EXPECTED_NAV_COPY, above).
- fixer-isolate-self-test: not caused by this lane. The run reports "could not make /run/user/1000/pb-g2o-.../o-...sock read-only". That socket belongs to a parallel lane's process under /run/user, not to this tree. The same row was PASS in the previous full run on this branch, which had no change to anything it reads.
- Earlier rows that went red during the lane and are now fixed: extension-actions (a group-attribute read moved to the entry's agent flag), gui08-persistence-roundtrip-self-test and ng-016-gui08-persistence-at-head (the loopback recogniser no longer spells the literal "localhost"). All were fixed in fb31e37f.
