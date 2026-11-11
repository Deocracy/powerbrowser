# Orca browser parity on Gecko

Every Orca browser ability, derived from the pinned source (Orca 1.4.248) and gated against a
Gecko disposition table, plus one ability (navigate and read title) run from the Orca CLI through
orcad to a PowerBrowser web tab. Requirement BRW-01; decisions D-11, D-16. Blueprint for
Phase 66.

## Requirements

- No Orca patch beyond the D-16 additive overlay (cap of about ten seam patches).
- No WebDriver BiDi port in a shipped build (D-11); BiDi is a test harness only.
- Every Orca browser ability has a Gecko disposition (BiDi, BiDi+, native, actor, impossible),
  and the set is re-derived at every re-pin.
- One `browserPageId` maps to exactly one PB web tab that PB created (BRW-03).

## How to Build It

Chosen seam: **S2**, VERDICT YELLOW. A PB runtime client attaches through
`browser.clientHost.attach` with no Orca patch and builds the tier-1 set of 50 abilities
(25 BiDi, 9 BiDi+, 14 native, 1 actor for `snapshot`, `exec` as a documented subset).
**S1** (a `'pb'` member in the `'electron'|'chromium'` provider-kind union in
`orcad-browser-provider.ts`) is the fallback. This reverses P61-05, as P61-13 allowed.

1. **Attach as a runtime client.** What the attach needed: the `scope: "runtime"` pairing offer
   orcad prints; client capability `browser.clientHost.v1`; host capabilities `webview` and
   `automation-v1`; page-command, inventory and reconciliation protocol version 1;
   `authorityRuntimeId` from `status.get`; a registered workspace for the page. Gate:
   `orca/src/main/runtime/rpc/methods/browser-client-host.ts:21-40`.
2. **Handle the command stream** (`browser-client-host-protocol.ts`: `createPage`, `navigate`,
   `automation`, `closePage`, ...). 65 of 92 abilities travel as `automation` commands. Of the
   other 27, six are the client-host protocol; the tab table (`tabList`, `tabCurrent`, `tabShow`,
   `tabSwitch`, `tabCreate`, `tabClose`, `openUrl`) is answered by orcad itself
   (`orcad-client-page-commands.ts:32-75`); `identity.*`, `profile*`, `tabProfile*`,
   `tabSetProfile` and `screencast*` never reach a client host.
3. **Write a PB-owned runtime client.** The proof reused Orca's web client and reached past its
   public surface twice (the capability constant, the private same-connection subscribe). Orca's
   shared modules already take `clientCapabilities` as a parameter
   (`paired-e2ee-client-handshake.ts`), so a thin PB client over those, or two small upstream
   exports (Phase 68), removes both.
4. **Ship the host in PB's own frontend**, not loaded from orcad: orcad serves only
   `/web-index.html` and four prefixes, and the proof bundle was 19.3 MB with the whole web
   client graph.
5. **Drive the tab through the existing channel.** `WebTabChannel.widgetOf(tabId).navigate(url)`
   sends `webTabNavigate` (`PowerBrowserAPI.sys.mjs`); the title arrives in the
   `PowerBrowserWebTabState` push.
6. **Keep the parity row green.** `scripts/orca-browser-parity.mjs` derives the ability set
   (RPC names under `rpc/methods/`, automation methods, provider members, CLI specs) and the
   users column (quoted `browser.<name>` literals in `src/cli/`, `src/renderer/`,
   `src/main/browser/`, `src/main/orcad/`), and compares it both ways with
   `.planning/spikes/005-orca-browser-parity/DISPOSITIONS.md`. Every derived set has a count
   tripwire; an empty derivation fails. A re-pin re-runs it as row `orca-browser-parity`
   (full; SKIP without `orca/`), with `orca-browser-parity-self-test` (quick, nine plants) on
   the commit gate.

Proof driver: `sources/005-orca-browser-parity/provider-proof.mjs`, run headless under
`flock /home/chris/coding/Power-Browser/.git/pb-live.lock` after
`build-s2-host.sh`. Child processes are spawned asynchronously: a blocking spawn stopped the
driver's own fixture HTTP server in run 3.

## Measured

| What | Value |
|---|---|
| Derived at the pin | 92 RPC abilities, 65 automation methods, 83 provider members, 80 CLI specs |
| Users | agent and CLI 78, renderer 24, main 13, orcad 5, none 3 |
| Dispositions (all 92) | BiDi 37, BiDi+ 25, native 24, actor 3, impossible 3 |
| Tier 1 (50) | BiDi 25, BiDi+ 9, native 14, actor 1 (`snapshot`), impossible 1 (`exec`) |
| Rows still `[ASSUMED]` | 85 of 92 |
| S2 attach | accepted, 254 ms; the Theia frame is a secure context |
| S2 `goto` through orcad | PASS: `tab create` 171 ms, `goto` 162 ms, title equal to the fixture nonce |
| PB half (navigate, title) | PASS, 270 ms |
| S1 patch | 13 changed lines in one file; applies to the pin |
| Orca tracked files | unmodified after every build and run |

## What to Avoid

- **Building BiDi or BiDi+ rows before Q4 is decided.** 62 rows name a Gecko command module;
  each needs an in-process route to it or a relabel to `actor`.
- **Building pointer and prompt rows unprobed.** Run bounded probes for Q3 (input and focus on a
  background overlay, screenshot versus pointer coordinates at the overlay's device pixel ratio)
  and Q5 (`TabManager.getTabForBrowsingContext` returns null for overlays, so `dialogAccept` and
  `dialogDismiss` may move to `actor`) first.
- **Treating `snapshot` as a row.** It is its own piece of work: a content actor walking the
  document through Gecko's accessibility service, a per-page ref table and a delta baseline;
  estimated one plan of 600 to 900 lines. Gecko 153.5.1 has no accessibility-tree command.
- **Mapping every page to one tab.** The proof did; the real host refuses commands for any tab it
  did not create.
- **Taking S1 as cheap.** Beyond the 13 lines: a second seam where orcad builds provider
  options, an 83-member provider object, and PB code compiled into Orca's single `orcad.js`.

## Constraints

- Unproven by run: every ability except `goto` and the client-host attach and command result.
  `navigate` (a tab created with a URL) and `closePage` are handled but not exercised; Q6's link
  click and a second attach with another host id (Q7) were not tried.
- Link routing (U-23): `browser.openUrl` selects a paired page host offering `webview` and
  `automation-v1`, so an Orca-originated URL arrives as `createPage` then `navigate`.
- The client-host lease is keyed by `browserHostClientId` and bound to one connection.
- User-facing tools U-01 to U-30 each have a PB location or a skip reason in the spike README
  (BRW-05).

## Built in Phase 66

- The built record is `theia/extensions/orca-browser/src/common/orca-browser-abilities.ts` (92 rows,
  checked by `orca-browser-abilities`). `DISPOSITIONS.md` stays the Phase 61 record: its 34 BiDi and
  BiDi+ tier-1 rows were relabelled native or actor when built (P66-11), and no BiDi module is used.
- A1: unshown agent tabs are parked (laid out, occluded, inactive docshell) so input reaches them
  without focus; chrome decides "shown to the user" with one predicate, `overlayShownToUser`.
- A2: the agent content actor may use `Cc[` and `Ci.` only on lines catalogued in `INTERNAL-APIS.md`.
- A3: the browser host authenticates as the pane client's own paired device through the pane
  bundle's link; measured live in 66-06 with the device-key credential.
- A4: page dialogs (alert, confirm, prompt) are answered natively; HTTP auth and beforeunload are not
  the agent's to answer.
- A5: `browser.snapshot` reproduces agent-browser's text grammar from the DOM; references are
  generated from Orca's pinned agent-browser against Chromium (`orca-snapshot-fixtures`).
- Agent tabs are not WebDriver BiDi contexts (their message manager group has no BiDi frame actor);
  a live check reads them through the bridge's own `browser.eval`.

## Origin

Synthesized from spike 005 (frontmatter VALIDATED, VERDICT YELLOW, 2026-11-09, plan 61-02).
Sources: `sources/005-orca-browser-parity/` (README.md, results.md, provider-proof.mjs). The
disposition table, patch, host source and results JSON stay in
`.planning/spikes/005-orca-browser-parity/`.
