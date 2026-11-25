---
spike: 005
idea: orca-browser-parity
name: orca-browser-parity
type: standard
validates: "Given the pinned Orca tree, when the parity script derives every browser ability with its users, then each ability has a Gecko disposition and one ability (navigate plus read title) runs from the Orca CLI through orcad to a PowerBrowser web tab"
verdict: YELLOW
related: [BRW-01, D-11, D-16, spike-003]
tags: [orca, orcad, browser, provider, client-host, bidi, web-tab, parity, live-probe]
---

# Spike 005: Orca browser parity on Gecko

## What This Validates

Given Orca 1.4.248 built from the pin and a PowerBrowser build with web tabs:

1. **Ability inventory.** `scripts/orca-browser-parity.mjs` derives every `browser.*` ability from
   Orca's source at check time, with the Orca components that use each, and compares the set with
   `DISPOSITIONS.md` both ways (P61-04).
2. **Seam choice.** One ability, navigate plus read title, runs end to end through S2
   (`browser.clientHost.attach` from a PB runtime client, no Orca patch). S1 (a `'pb'` member in
   the provider-kind union) is sized as a patch that is only checked to apply (P61-13).
3. **Questions 1 to 8** of `research/FEATURES.md` are answered with evidence lines.
4. **User-facing tools** U-01 to U-30 each get a PowerBrowser location or a skip reason (BRW-05).

Out of scope: any provider code for Phase 66, any `PowerBrowserAPI` or Gecko change, the injection
selectors (INJ-01, Phase 67), upstream pull requests (Phase 68).

## Research

- Seams, inventory and the eight questions: `.planning/workstreams/orca/research/FEATURES.md`
  (A.0 to A.5, written against 1.4.214; counts unchanged at 1.4.248).
- Attach gate: `orca/src/main/runtime/rpc/methods/browser-client-host.ts:21-40` (client kind
  `runtime`, a connection id, a paired device, capability `browser.clientHost.v1`).
- Command stream: `orca/src/shared/browser-client-host-protocol.ts` (`createPage`, `navigate`,
  `automation`, `closePage`, ...); automation routing for client pages:
  `orca/src/main/runtime/runtime-browser-client-automation.ts`.
- Engine-less client hosting in orcad: `orca/src/main/orcad/orcad-browser-startup.ts:46-51`,
  `orcad-client-page-commands.ts`.
- PB side: `WebTabChannel.widgetOf(tabId).navigate(url)` sends `webTabNavigate`
  (`powerbrowser/shell/PowerBrowserAPI.sys.mjs`); the title arrives in the
  `PowerBrowserWebTabState` push.

## How to Run

```sh
# Setup (once per checkout)
nix develop .#theia --command node scripts/generate.mjs
bash scripts/fetch-orca.sh
nix develop .#orca --command bash scripts/build-orca.sh
# The Orca CLI (build-orca.sh does not build it). Never run prepare:cli-output: it edits orca/package.json.
( cd orca && nix develop ..#orca --ignore-environment --keep HOME --keep TERM --command bash -c \
  'export COREPACK_HOME=$PWD/../.mozbuild/corepack PATH=$PWD/../.mozbuild/corepack/bin:$PATH; \
   pnpm run build:packages && ORCA_CLI_BUILD_COMPILER=tsrs node config/scripts/build-cli.mjs' )

# 1. Inventory
scripts/verify-platform.sh --only orca-browser-parity-self-test
scripts/verify-platform.sh --only orca-browser-parity

# 2. Seam proof (headless, under the live lock)
nix develop .#orca --command bash .planning/spikes/005-orca-browser-parity/build-s2-host.sh
flock /home/chris/coding/Power-Browser/.git/pb-live.lock \
  node .planning/spikes/005-orca-browser-parity/provider-proof.mjs

# 3. S1 sizing
git -C orca apply --check ../.planning/spikes/005-orca-browser-parity/s1-browser-provider-kind.patch
git -C orca apply --numstat ../.planning/spikes/005-orca-browser-parity/s1-browser-provider-kind.patch
```

`provider-proof.mjs` writes `results-proof.json`. Its stdout and stderr are redacted; the pairing
input is passed in memory only.

## What to Expect

- The parity row prints one line per ability (`ability | users | disposition`), the derived
  counts and set differences, then `orca-browser-parity: PASS --`.
- The proof prints `provider-proof: PASS --` naming which halves ran end to end. A refused attach
  still leaves the PB-half number in `results-proof.json`.
- The S1 patch applies to the pinned tree and `git -C orca status --porcelain --untracked-files=no`
  stays empty.

## Results

**YELLOW** (2026-11-09; see VERDICT): the seam is proven on one ability and the inventory is gated; the rest of the ability set is unproven. See `results.md` for the table and `results-proof.json` for the raw run.

### Ability inventory

The table is `DISPOSITIONS.md`; the numbers below come from the script's printout at the pin.

| Derived set | Count |
|---|---|
| RPC abilities (`name: 'browser.*'` under `rpc/methods/`) | 92 |
| Automation methods (travel as `automation` commands in S2) | 65 |
| Provider members (`RuntimeBrowserCommands`, S1) | 83 |
| CLI specs (`browser-basic.ts` 40, `browser-advanced.ts` 40) | 80 |
| RPC minus automation | 27 |
| Automation minus RPC | 0 |

| Component that uses an ability | Abilities |
|---|---|
| agent and CLI (`src/cli/`) | 78 |
| renderer (`src/renderer/`, intersected with the RPC set) | 24 |
| main (`src/main/browser/`, the desktop client host) | 13 |
| orcad (`src/main/orcad/`) | 5 |
| none of the four trees | 3 |

| Disposition | All 92 | Tier 1 (50) |
|---|---|---|
| BiDi | 37 | 25 |
| BiDi+ | 25 | 9 |
| native | 24 | 14 |
| actor | 3 | 1 (`snapshot`) |
| impossible | 3 | 1 (`exec`, documented subset only) |

85 of the 92 rows are still marked `[ASSUMED]`. Shown by a run: `goto`, `clientHost.attach` and
`clientHost.commandResult` (this spike), and the mechanisms behind `screenshot`, `eval`,
`keypress` and `type` (spike 003).

Member-to-RPC spelling notes the script prints (not failures): 6 provider members have no RPC of
the same spelling (`browserConsoleLog`, `browserNetworkLog`, `browserOpenUrlOnClient`,
`browserProceedCertificate`, `browserSetGeolocation`, `browserSetViewport`), and 15 RPC names have
no member of the same spelling (the six `clientHost.*`, both `identity.*`, `screencast.unsubscribe`
and the six whose member is spelled differently).

### FEATURES.md questions

#### Q1. S1 or S2: can a PB client attach, and do the automation methods suffice?

Yes, a PB client can attach, with no Orca patch.

- Evidence: `results-proof.json` `attachOutcome: "accepted"`, `s2Half.hostCommands:
  ["createPage:completed:acked", "automation:completed:acked"]`, `s2Half.gotoResult.title` equal to
  the fixture nonce title, `gotoMs: 162`.
- What the attach needed: the `scope: "runtime"` pairing offer orcad prints; client capability
  `browser.clientHost.v1`; host capabilities `webview` and `automation-v1`; page-command,
  inventory and reconciliation protocol version 1; `authorityRuntimeId` from `status.get`; a
  registered workspace for the page.
- Sufficiency, from source: 65 of the 92 abilities travel as `automation` commands. Of the other
  27, six are the client-host protocol itself; `tabList`, `tabCurrent`, `tabShow`, `tabSwitch`,
  `tabCreate`, `tabClose` and `openUrl` are answered by orcad's own table of client pages
  (`orcad-client-page-commands.ts:32-75`); `identity.*`, `profile*`, `tabProfile*`, `tabSetProfile`
  and `screencast*` never reach a client host and stay unavailable without an engine. Every tier-1
  ability is in the first two groups. Proven by a run for `goto` only.

#### Q2. Snapshot with stable `@eN` refs that survive delta mode

From source: under S2 the host returns the whole `BrowserSnapshotResult`
(`{snapshot: string | delta, refs, url, title}`, `runtime-browser-contracts.ts:23-29`). Orca's
tree builder, ref binding and delta baseline all live on the host side (`src/main/browser/`:
`snapshot-engine.ts`, `cdp-ref-resolution.ts`, `agent-browser/agent-browser-snapshot-delta.ts`),
so PowerBrowser owns refs and delta outright and nothing in orcad constrains how refs are bound.
Gecko 153.5.1 has no accessibility-tree command (FEATURES A.4), so the disposition is `actor`.

Effort estimate [ASSUMED]: one content actor that walks the document through Gecko's accessibility
service and emits Orca's text tree, a per-page ref table keyed to live nodes, and a per-page delta
baseline; roughly one plan of 600 to 900 lines with its fixtures. Fidelity against
`Accessibility.getFullAXTree` is unmeasured. This is the largest tier-1 piece.

#### Q3. Input and focus on a background web tab [ASSUMED]

Not run. Spike 003 showed `input.performActions` key input reaching a PB web tab that was in
front. Whether input reaches a background overlay without taking user focus, and whether
screenshot coordinates match pointer coordinates at the overlay's device pixel ratio, is open.
Phase 66 needs a bounded probe before the pointer rows are built.

#### Q4. BiDi session ownership [ASSUMED]

Under S2 the host runs inside PowerBrowser (the Theia frontend, with chrome reached through
`PowerBrowserAPI`), so the `native` and `actor` rows need no BiDi session, and this proof used
BiDi only as the test harness (D-11). The 62 rows labelled `BiDi` or `BiDi+` name a Gecko command
module; D-11 forbids a BiDi port in a shipped build, so each needs an in-process route to that
module or a relabel to `actor`. No in-process route was tested.

#### Q5. Prompts and popups on overlays [ASSUMED]

Not re-tested. Spike 002c recorded `TabManager.getTabForBrowsingContext` returning null for
overlays, which is why `dialogAccept` and `dialogDismiss` may move from `BiDi` to `actor`.

#### Q6. Link routing [ASSUMED for the click itself]

From source: the web client stubs `onOpenLinkInOrcaTab` (`web-browser-api.ts:42`).
`browser.openUrl` goes to `openBrowserUrlOnClient`, which selects a paired page host that offers
`webview` and `automation-v1` (`browser-client-page-opening.ts`), so with the S2 host attached an
Orca-originated URL arrives at PowerBrowser as `createPage` then `navigate`. This run observed
`createPage`; it did not exercise `navigate` (the tab was created without a URL) and did not click
a link in an Orca terminal.

#### Q7. Two clients on one orcad [ASSUMED]

See spike 004 (`orca-pane-hosting`), its multi-client finding, for layout conflicts between client
pages. Observed here only: one orcad served the S2 host (a runtime client on its own connection)
and the Orca CLI at the same time, and the lease is keyed by `browserHostClientId` and bound to
one connection. A second attach with another host id was not tried.

Run evidence from spike 004 (added by plan 61-04): `.planning/spikes/004-orca-pane-hosting/results-route-b-prime.json`
field `secondClientSeesTab: true` (with `observeChannel: "second-client"`, `observeLatencyMs: 74`): a second
paired client on the same orcad saw a tab that another client opened, within the one-second clock.

#### Q8. Re-pin changes that break injection selectors

Out of scope here: INJ-01, Phase 67. The approach to carry over is the one this script uses:
derive from the pinned tree at check time, compare both ways, fail on an empty derivation.

### User-facing tools (BRW-05)

Locations are read from the tree, not run. "native" means existing PowerBrowser or Gecko behaviour
on a web tab.

| ID | Tool | PowerBrowser location | Note |
|---|---|---|---|
| U-01 | Address bar | chrome bar | Orca's workspace-doc suggestions are skipped: no PB source |
| U-02 | Navigation row | chrome bar | existing back, forward, reload |
| U-03 | Find in page | native | PAGE-01 |
| U-04 | Zoom | native | PAGE-02 |
| U-05 | DevTools dock | native | `webTabDevtools` exists; docking in a Theia tab unverified |
| U-06 | Grab page element | Theia side panel | new: content actor plus a result view; tier 2 |
| U-07 | Annotate and send to agent | Theia side panel | new: content actor plus Orca `terminal.send`; tier 2 |
| U-08 | Markup on screenshot | Theia side panel | new widget over a screenshot; tier 2 |
| U-09 | Agent activity mark and cursor | chrome bar (tab strip mark) | new; needed once an agent drives a PB tab |
| U-10 | Agent input focus guard | skip (no UI) | a requirement on the input rows, see Q3 |
| U-11 | History dialog | native | PB history |
| U-12 | New-tab page | skip | PB has its own; a dev-server tile is optional later |
| U-13 | Downloads | native | `webTabDownloads*` |
| U-14 | Popups | native | the host must report a popup as a page so agents can list it |
| U-15 | Page prompts | native | agent side is `dialogAccept` / `dialogDismiss` |
| U-16 | Certificate errors | native | agent side is `certificate.proceed` |
| U-17 | Site settings | native | `webTabPermission*`, `webTabSiteInfo` |
| U-18 | Page context menu | native | PB's page context menu |
| U-19 | Profiles | skip | one PB profile in v1.7 |
| U-20 | Cookie import | skip | anti-feature; Firefox's own import covers it |
| U-21 | WebExtensions host | skip | PB has its own extension track |
| U-22 | UA identity setting | skip | tier 2 at the earliest |
| U-23 | Link routing | native | Orca-originated links open as PB web tabs through the S2 host (Q6) |
| U-24 | SSH routing and tunnels | skip | anti-feature |
| U-25 | Egress indicator | skip | PB has its own egress allow-list |
| U-26 | Document preview | skip | later; Theia previews local files |
| U-27 | View source, open in default browser | native | `webTabViewSource`; the open-browser-window command |
| U-28 | Mobile driver overlay | skip | Orca mobile only |
| U-29 | Remote screencast pane | skip | replaced by PB tabs; Orca's entry point is hidden |
| U-30 | Browser-scope shortcuts | chrome bar | existing keybindings; only grab and annotate are new |

### Seam choice

**S2.** It needs zero Orca patches against the D-16 cap of about ten, and it ran end to end.

**S1** is the fallback. `s1-browser-provider-kind.patch` changes 13 lines (12 added, 1 removed)
in one file and applies to the pin. It is not the whole cost: a PB provider would also need a
second seam line where orcad builds the provider options, a provider object with all 83 members,
and that code compiled into Orca's single `orcad.js` bundle, which means PB files inside Orca's
build.

**This reverses P61-05**, which named the provider kind as the seam. P61-13 allowed for it; the
owner may override in the end-of-milestone pass.

What S2 costs that the proof papered over, and Phase 66 must replace:

1. A PB-owned runtime client. The proof reuses Orca's web client and reaches past its public
   surface twice (the capability constant, the private same-connection subscribe). Orca's shared
   modules already take `clientCapabilities` as a parameter (`paired-e2ee-client-handshake.ts`),
   so a thin PB client over those, or two small upstream exports (Phase 68), removes both.
2. Bundle size: 19.3 MB when the whole web client graph comes along.
3. Serving: orcad serves only `/web-index.html` and four prefixes, so the host code should ship in
   PowerBrowser's own frontend rather than be loaded from orcad.
4. Tab scoping (BRW-03): the proof's host maps every page to the one tab it opened. The real host
   must map each `browserPageId` to exactly one PB web tab it created and refuse commands for any
   other tab.

## Investigation Trail

- 2026-11-09: Task 1 and 2. Parity script written; 92 abilities derived; users column filled from
  the script's own printout; nine plants red. The research's path
  `src/main/browser/desktop-browser-bridge` gave 3 names for "main"; the desktop client host lives
  beside it, so "main" is `src/main/browser/` (13 names).
- Run 1 of the proof: PB half passed (262 ms). The S2 bundle answered 404 from
  `out/web/pb-s2/`: orcad's static allow-list. Moved to `out/web/assets/pb-s2/`.
- Run 2: attach accepted; `createPage` acknowledged; the `browser.goto` automation command reached
  the host; the navigate reply was ok but no loaded push arrived in 20 s.
- Run 3 (with diagnostics): the tab sat at `loading: true` on the fixture URL. Cause: the driver's
  blocking CLI spawn had stopped its own fixture HTTP server. Not an Orca or PB fault.
- Run 4: CLI calls asynchronous. Both halves end to end; `goto` through orcad in 162 ms.
- S1 patch produced by `git diff` in a scratch clone under `.mozbuild/p61-02/orca-s1`, never
  applied to `orca/`. The S2 attach was accepted, so Orca's `typecheck:node` was not run on it.

## VERDICT

YELLOW (conditions): the seam is chosen and proven on one ability, and the inventory is derived
and gated; the rest of the ability set is still unproven.

Conditions for Phase 66:

1. Build a PB-owned runtime client; do not ship the two reaches past Orca's public surface.
2. Treat the 85 `[ASSUMED]` rows as estimates. Run the bounded probes for Q3 (background input
   and focus) and Q5 (prompts on overlays) before building the rows that depend on them.
3. Decide Q4 before any `BiDi` or `BiDi+` row is built: an in-process route to the Gecko command
   module, or a relabel to `actor`.
4. Plan `snapshot` as its own piece of work (Q2).
5. Enforce one `browserPageId` to one PB-created tab (BRW-03).

Route for Phase 66: S2, a PB runtime client that attaches through browser.clientHost.attach with no Orca patch, building the tier-1 set of 50 abilities (25 BiDi, 9 BiDi+, 14 native, 1 actor for snapshot, exec as a documented subset); S1 (a 13-line provider-kind patch) stays the fallback.
