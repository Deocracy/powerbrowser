# Result: G1b-agent-browser

Branch: worktree-agent-a4ef5675032920d7e   Base: b5c4b182   Final: (this record's commit; code final 5d5612c5)

| ID | Status | Commit | Check | Note |
|---|---|---|---|---|
| T-66-04 | fixed | f413c170 | verify-orca-browser-host-wire.mjs::placement | setPlacement binds to the first id placed and refuses another (`placement_refused`); the Theia host now keeps one id per frontend, so its own Reconnect places the same id |
| 66-CR-02 | fixed | 5d5612c5 | verify-orca-browser-host-wire.mjs::metadata | pageMetadataOf sends url, title, loading, canGoBack, canGoForward within 8192/4096; the host bundle coerces the flags and caps too; a refusal logs one line |
| 66-CR-03 | fixed | 5d5612c5 | verify-orca-browser-host-wire.mjs::reattach | one browserHostClientId per frontend (as Orca's desktop host keeps one); inventory filtered to the attaching id; a completed reclaimPage/restorePage moves the page's recorded authority |
| 66-CR-04 | fixed | 5d5612c5 | verify-orca-browser-host-wire.mjs::timeout | agent calls and navigate (browser.goto) use their own bridge request with max(35 s, timeout + 5 s); a local timeout answers browser_timeout; deadline checked against chrome's and Orca's derived deadlines |
| 66-WR-01 | fixed | f413c170 | verify-orca-browser-host-wire.mjs::credential | the link re-arms readiness when webRuntimeCredentialFor's cache key changes, so the pane client creates the source after a re-pair |
| 66-WR-02 | fixed | 5d5612c5 | verify-orca-browser-host-wire.mjs::startDeadline | the link and connection steps each have a 60 s deadline; expiry logs the step and sets failed |
| 66-WR-03 | fixed | 5d5612c5 | verify-orca-browser-host-wire.mjs::detachedClose | a user close keeps its sessionStorage entry until userClosedPage resolves; closeEndedPages replays it after the next attach |
| 66-WR-04 | fixed | 5d5612c5 | verify-orca-browser-host-wire.mjs::budget | boundedOutcome answers failed for a value over 768 KiB; a refused automation result is retried once as failed |
| 66-WR-07 | fixed | 5d5612c5 | no-check: dead code removed; the guarded state cannot occur (web tab ids embed WEB_TAB_SESSION), so any check would assert on code that is gone | closeStaleAgentTabs and its call removed |
| 66-WR-05 | fixed | 5d5612c5 | verify-orca-browser-host-wire.mjs::duplicate | the dispatcher calls the new optional `recordBound` dep only after `table.bind` returns bound; onTabClosed only drops records when the table no longer binds the page |

Notes:
- The new check `scripts/verify-orca-browser-host-wire.mjs` landed in 5d5612c5 with the fixes. It runs the real frontend host (Theia stubbed), the real thin host bundle over a fake WebSocket, and the real link over Orca's real `web-runtime-credentials.ts`. A fake orcad validates every request with the params schema the pinned orcad declares for that method. The method-to-schema map comes from `orca/src/main/runtime/rpc/methods/*.ts` (715 methods), and every event the fake sends is validated with `BrowserClientHostCommandEvent`. The self-test has 15 plants, each red on its clause.
- 66-CR-04's suggested fix edits `WebTabChannel.request` in tab-uris, which is G1a's file. The orca-browser host now sends agent commands through its own copy of the bridge request with a per-call deadline (`shellRequest`, next to the existing orcaStatus copy). tab-uris is unchanged.
- T-66-04 is defence in depth. A script in the document can still assign `window.api.runtimeEnvironments.prepareBrowserClientHostPlacement` directly (T-66-01). orcad's device check (browser_host_lease_stale) is unchanged.

## Registry requests
- scripts/verify-orca-browser-host-wire.mjs: quick, `"orca-browser-host-wire|node $REPO_ROOT/scripts/verify-orca-browser-host-wire.mjs"`
- scripts/verify-orca-browser-host-wire.mjs --self-test: quick, `"orca-browser-host-wire-self-test|node $REPO_ROOT/scripts/verify-orca-browser-host-wire.mjs --self-test"` (15 plants)

## Red by design
- agent-tab-walls-self-test: its plant '66-CR-01: the host navigates through the widget, outside the agent wall' anchors on the old navigate line `this.channel.request({ kind: 'webTabAgent', ... 'browser.goto' ... })`. 66-CR-04 moved navigate onto the host's own request with the longer deadline, because chrome's goto waits up to 30 s for the load. The fix is in `scripts/verify-agent-tab-walls.mjs` (G1a's file), about line 674: change the anchor to `"navigate: (tabId, url) => this.agentRequest({ kind: 'webTabAgent', tabId, method: 'browser.goto', params: { url } }),"`. I ran a temporary copy with that one change: its self-test passes (40 plants). The agent-tab-walls row itself is PASS.
- scan-brand-residue and scan-brand-residue-self-test: the two new files are not yet in the inventory, so they produce condition-4 lines (125 in the check script, 16 in the wire module), and the coincidental counts moved. The exact change is under Handoffs (integration). These rows were already red on this base before this lane (see Quick gate).

## Handoffs
- G1a-chrome-shell: `scripts/verify-agent-tab-walls.mjs`, the self-test plant '66-CR-01: the host navigates through the widget, outside the agent wall' (about line 674). Its anchor must become `"navigate: (tabId, url) => this.agentRequest({ kind: 'webTabAgent', tabId, method: 'browser.goto', params: { url } }),"`. The clause itself (line 525-527) still passes, because the navigate dep still carries `kind: 'webTabAgent'` and `'browser.goto'`. This is for 66-CR-04.
- G1a-chrome-shell (optional, not needed for correctness): `theia/extensions/tab-uris/src/browser/web-tab.ts` `WebTabChannel.request(msg, timeoutMs = WEB_TAB_ACK_TIMEOUT_MS)`. If G1a adds it, orca-browser's `shellRequest` copy can be replaced with `this.channel.request(msg, agentCallTimeoutMs(params))`.
- integration: `inventory/brand-tokens.json`. Add `scripts/verify-orca-browser-host-wire.mjs` and `theia/extensions/orca-browser/src/common/orca-browser-host-wire.ts` to expected_files of the `Orca`, `orca`, `ORCA` and `orcad` coincidental rows. Then re-measure expected_count with the scanner, because this lane's comments also add occurrences in files already listed. The scan was already red on this base before any change of mine: with my four edited files reverted and the two new files untracked, it reports 4 count failures (Orca expected 3617, observed 3603; orca 6188/6123; ORCA 1398/1396; orcad 2220/2207). With this lane's commits it reports Orca 3609, orca 6124, ORCA 1396 and orcad 2210, plus the condition-4 lines for the two unlisted new files.

## Behaviour changes
- 66-CR-04: Orca agent commands and Orca's navigate now wait for chrome up to max(35 s, the command's timeout + 5 s), where before every call was cut at 5 s. A wait, eval, page load, screenshot or PDF that chrome finishes after 5 s now completes. When chrome does not answer in time, the command fails `browser_timeout` instead of `browser_error`. Revert with 5d5612c5.
- 66-CR-03: one frontend keeps one browser host id across Reconnects. After an orcad restart or a socket drop with agent tabs open, Reconnect now succeeds, and Orca retains, reclaims or closes those tabs' pages. Before, every re-attach was refused. Revert with 5d5612c5.
- 66-CR-02: orcad now learns an agent tab's url and title, so the agent's tab list, current tab and tab show follow navigation. Revert with 5d5612c5.
- 66-WR-02: if the pane bundle's link never appears or never becomes ready, the attach fails after 60 s. The browser-host failure page and Reconnect then show; before, the attach waited forever. Revert with 5d5612c5.
- 66-WR-03: an agent tab the user closes while the host is detached is closed in Orca after the next attach. Revert with 5d5612c5.
- 66-WR-04: an automation result over 768 KiB (for example a full-page screenshot or PDF) now answers `browser_error` at once, where before orcad stalled until its own timeout. Revert with 5d5612c5.
- T-66-04: a second, different host id passed to the link's setPlacement now throws `placement_refused`. Revert with f413c170.
- 66-WR-01: after a re-pair, the browser host's connection waits for the pane client's first status call under the new pairing (one poll, at most about 1 s). Revert with f413c170.

## Needs owner
None.

## Quick gate
Run after 5d5612c5, inside `nix develop .#theia`: 445 rows, 436 PASS, 9 FAIL. The base had 419 PASS and 0 FAIL in BASE-QUICK.txt, which predates seven lane merges.
- orca-service, orca-service-self-test, orca-browser-tab-scope, orca-browser-tab-scope-self-test, shell-error-copy-no-internals, shell-error-copy-no-internals-self-test: not caused by this lane. They are red by design on this base and are being fixed by harness lanes. orca-browser-tab-scope's output is identical before and after this lane's change.
- agent-tab-walls-self-test: red by design (66-CR-04), as described above.
- scan-brand-residue, scan-brand-residue-self-test: red on this base before this lane. With this lane's four edited files at their base content and its two new files untracked, the scanner reports 4 count failures. This lane adds the condition-4 lines for its two new files. Both parts are under Red by design and Handoffs.
- New rows (not yet registered) run by hand: orca-browser-host-wire PASS; orca-browser-host-wire-self-test PASS (15 plants).
- Other checks that read this lane's files, run by hand after the last code change: orca-browser-abilities, orca-browser-tools, orca-browser-entry-points, orca-browser-host-bundle and web-tab-bridge are PASS, each with its self-test; agent-tab-walls is PASS. The host bundle was rebuilt with `scripts/build-orca.sh --panes-only` (PASS, 308881 bytes). `tsc -b` for orca-browser passes. A tsc run over the two overlay files, with Orca's web compiler options, reports no error in them.
