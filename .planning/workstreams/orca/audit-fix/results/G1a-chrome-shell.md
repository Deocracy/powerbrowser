# Result: G1a-chrome-shell

Branch: worktree-agent-a5092d30574b83066   Base: 0f9f2735401a08132a479c95c09c53f03015fa19   Final: (this record's commit; code final fb31e37f)

| ID | Status | Commit | Check | Note |
|---|---|---|---|---|
| agent-browser-03 | fixed | 377f5449 | verify-agent-tab-walls.mjs::cookies | cookie rows act on the tab's current site only; cookie.get never returns an httpOnly value; whole-container read gone |
| agent-browser-04 | fixed | 3f42d38c, f766f926 | verify-agent-tab-walls.mjs::stop | Stop is per frontend: every agent tab stopped, new agent tabs refused until Resume; mark on every agent tab; Orca navigate goes through the agent wall |
| chrome-actor-03 | needs-owner | - | no-check: no code change | Orca's bundle shares the Theia realm; an in-realm nonce or MessagePort is readable by same-realm script, so only a separate origin or frame (Route B') is a boundary |
| agent-browser-02 = chrome-actor-02 = 66-CR-01 | fixed | 9d2e4bd1 | verify-agent-tab-walls.mjs::agentFlag | chrome remembers agent tab ids and row keys for the session and re-applies agent status on any open under them; the widget also sends the flag on every open |
| 59-WR-02 | fixed | a20914da | verify-agent-tab-walls.mjs::scroll | scrollIntoView with behavior "instant" in agentCentre and the scrollIntoView row |
| 59-WR-01 | fixed | 93122d51, fb31e37f | verify-agent-tab-walls.mjs::editState | text-field edit rows in agent overlays use the Controllers route |
| 59-WR-03 | fixed | 30f12b86 | verify-agent-tab-walls.mjs::budget | every done result measured once in UTF-8 JSON bytes against AGENT_RESULT_MAX_BYTES |
| 59-WR-05 | fixed | 0467eafe | verify-agent-tab-walls.mjs::sideHeader | side header scrollbar built on X, icons do not shrink, comment corrected |
| 66-WR-06 | fixed | 3f42d38c | verify-agent-tab-walls.mjs::stop | widget exposes `opened`; the host awaits it and fails createPage (and closes the tab) unless chrome answers opened or loading |
| agent-browser-06 | fixed | a1726b47, 224a6612, fb31e37f | verify-agent-tab-walls.mjs::services | agent loads to the sidecar and orcad ports are refused before send, by container (workers included), on a normalised address |
| chrome-actor-04 | fixed (in part) | 377f5449 | verify-agent-tab-walls.mjs::cookies | the no-url whole-container read is gone and httpOnly values are withheld; per-worktree and hidden containers are under Needs owner |
| chrome-actor-05 | fixed | c6bc56b7 | verify-agent-tab-walls.mjs::history | agent overlays carry disableglobalhistory from creation; tab-store rows unchanged |
| chrome-actor-06 | fixed | 93122d51, fb31e37f | verify-agent-tab-walls.mjs::editState | pageEditTargetCommands and webTabEditEnabled do not ask for the edit-state pair in agent overlays |
| 67-WR-04 (from G3b) | fixed | 35c83570 | verify-agent-tab-walls.mjs::orcaStatus | orcaStatus accepts the literal `{ clientReason: null }` and calls `OrcaService.clientRecovered?.()` |

Security-review follow-up on a1726b47 (coordinator, three points), all in 224a6612:
1. Refusal after send: this applied only in part. a1726b47 already refused a spelled loopback host on a service port at http-on-modify-request, before send, because agentChannelRefused checked the URL on every topic before the examine-response branch. A name that resolves to loopback was caught only at http-on-examine-response. Now a service-port request with a host name is suspended at http-on-modify-request, its name is resolved in the channel's own DNS partition, and the request is cancelled before resume when any resolved address is loopback. The remote-address check stays as a second line.
2. Worker loads: fixed. The wall now judges loads by `loadInfo.originAttributes.userContextId` against the agent containers chrome created (`agentContainerIds`).
3. Recogniser: fixed. Each address is parsed once (IPv4 in 1 to 4 parts, decimal, octal or hex; IPv6 with brackets, a zone, `::` and a dotted tail). The normalised form is then classified: 127/8, 0/8, `::1`, `::`, and IPv4-mapped or IPv4-compatible forms of those, plus localhost and `*.localhost` with or without a trailing dot. Each gap is a planted fault in the self-test.

## Registry requests
- scripts/verify-agent-tab-walls.mjs: quick, `"agent-tab-walls|node $REPO_ROOT/scripts/verify-agent-tab-walls.mjs"`
- scripts/verify-agent-tab-walls.mjs --self-test: quick, `"agent-tab-walls-self-test|node $REPO_ROOT/scripts/verify-agent-tab-walls.mjs --self-test"` (40 plants)

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

## Handoffs
- G1b-agent-browser: I edited `theia/extensions/orca-browser/src/common/orca-browser-dispatch.ts`, which gains `DispatchFailure`, the optional `agentsStopped` dep, the navigate reply mapping and the catch mapping. I also edited `theia/extensions/orca-browser/src/browser/orca-browser-frontend-module.ts`: openAgentTab awaits `widget.opened`, navigate is sent as webTabAgent browser.goto, and the `agentsStopped` dep is added. Both were needed for agent-browser-04 and 66-WR-06. Rebase onto 3f42d38c.
- G2-orcad-hosting: 67-WR-04 calls `OrcaService.clientRecovered?.()`. The guard makes it a no-op until G2's method merges.
- integration: `inventory/brand-tokens.json` counts, as under Red by design.

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

## Needs owner
- chrome-actor-03: the real fix is to host the Orca bundle in a separate origin or frame that the PowerBrowserGroup actor does not match (Route B'). That is architectural and outside this lane's files. A per-kind nonce or MessagePort in the same realm is not a boundary, because same-realm script can patch `MessagePort.prototype.postMessage` or add a capture listener for the request event. At minimum, record T-61-04 as an owner decision (DECISIONS.md is not mine to edit).
- agent-browser-03 / chrome-actor-04: the owner decides on:
  - one container per worktree or agent session. A prompt-injected agent can choose its worktree, so this is no boundary against it, and upstream Orca also shares one partition per browser profile.
  - a hidden container. ContextualIdentityService has no public API that creates a private identity; `create` makes public ones only.
  - clearing the agent jar at each launch.
  - telling the user that sign-ins made in agent tabs are kept and shared across agents.
- agent-browser-04: Resume is reachable only on an open agent tab. If the user closes every agent tab after Stop, only a frontend reload or restart clears the stop. A host-level Resume control (for example in the Orca pane) is an owner UI call.
- agent-browser-06: two parts are not done.
  - The suggested "user-confirmed allow list for private addresses" (LAN) was not built.
  - The network observer installs with the session's first agent tab, so an agent-container service-worker load before any agent tab exists in a session is not judged.

Live verification still owed (nothing here was run in a browser):
- These items need a purged startup cache: the Stop/Resume flow and the mark, crash recreate as an agent tab, the cookie scope, disableglobalhistory, the edit rows in agent tabs, the DNS pre-send suspend and cancel, and the side header scroll.

## Quick gate
Final run (after fb31e37f), inside `nix develop .#theia`: 411 PASS, 7 FAIL (the base had 419 PASS, 0 FAIL).
- scan-brand-residue, scan-brand-residue-self-test: red by design (inventory counts, above).
- orca-browser-tab-scope, orca-browser-tab-scope-self-test: red by design (fake overlay has no current site, above).
- shell-error-copy-no-internals, shell-error-copy-no-internals-self-test: red by design (EXPECTED_NAV_COPY, above).
- fixer-isolate-self-test: not caused by this lane. The run reports "could not make /run/user/1000/pb-g2o-.../o-...sock read-only". That socket belongs to a parallel lane's process under /run/user, not to this tree. The same row was PASS in the previous full run on this branch, which had no change to anything it reads.
- Earlier rows that went red during the lane and are now fixed: extension-actions (a group-attribute read moved to the entry's agent flag), gui08-persistence-roundtrip-self-test and ng-016-gui08-persistence-at-head (the loopback recogniser no longer spells the literal "localhost"). All were fixed in fb31e37f.
