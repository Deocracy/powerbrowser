# Phase 66: PowerBrowser web tabs as Orca's browser - Pattern Map

**Mapped:** 2026-11-10
**Files analyzed:** 38 new or modified (across plans 66-01..66-06)
**Analogs found:** 36 / 38 (two Phase 64 files exist only after the 64 merge; their analogs are named by role)

Line numbers are from this worktree at commit 6861d390 (before Phases 63-65 merge; lanes re-read them on their base). Facts about Orca's protocol, the gate answers and the amendments are in 66-RESEARCH.md and are not repeated; this file says what to copy from where. Every analog listed below is git-tracked, except the Phase 64 files, which the lanes read from the merged tree.

## File Classification

| New/Modified File | Plan | Role | Data Flow | Closest Analog | Match |
|---|---|---|---|---|---|
| `orca-overlay/files/src/renderer/src/pb/browser-host/pb-browser-host.ts` (new) | 01 | client (protocol end) | event-driven, request-response over one socket | `.planning/spikes/005-orca-browser-parity/p66-thin-host.ts:1-133` (measured, G1) | exact (transport); surface replaced by the interfaces block |
| `orca-overlay/files/src/renderer/src/pb/browser-host/pb-browser-host-link.ts` (new) | 01 | glue (pane bundle) | transform | `orca/src/renderer/src/web/preload-api/web-runtime-credentials.ts:17-62` (credential source per environment), `.planning/spikes/004-orca-pane-hosting/pb-pane-mount.tsx:86-108` (bootstrap order) | role-match |
| P64 pane entry, one import line (mod) | 01 | entry | n/a | the merged 64-01 entry; spike `pb-pane-mount.tsx` | exact |
| `orca-overlay/files/vite.pb-browser-host.config.ts` (new) | 01 | build config | batch | `.planning/spikes/005-orca-browser-parity/vite.p66.config.ts` (28 lines), the merged P64 pane config | exact |
| `scripts/build-orca-browser-host.sh` (new) | 01 | build script | batch | `.planning/spikes/005-orca-browser-parity/build-p66-thin-host.sh` (37 lines); the merged `scripts/build-orca-panes.sh` | exact |
| `scripts/build-orca.sh` (mod: one run_step) | 01 | build script | batch | `scripts/build-orca.sh:48-53` (run_step), `:130` (`run_step overlay apply_overlay`) | exact |
| `scripts/verify-orca-browser-host-bundle.mjs` (new) | 01 | check (full + quick self-test) | derive-compare + live Node probe | `scripts/verify-orca-overlay.mjs` (header :1-60, `--built` :265-297, self-test :377-415); `provider-proof.mjs` (harness) | role-match |
| `theia/extensions/orca-browser/package.json`, `tsconfig.json` (new) | 02 | config | n/a | `theia/extensions/chrome-bar/package.json`, `theia/extensions/chrome-bar/tsconfig.json` | exact |
| `theia/extensions/orca-browser/src/browser/orca-browser-frontend-module.ts` (new) | 02 | service + module | event-driven | `theia/extensions/tab-uris/src/browser/tab-uris-frontend-module.ts:36-143` (ContainerModule, `bind(FrontendApplicationContribution).toService(...)` :123), `WebTabOpenHandler.onStart` (web-tab.ts:1623-1640) | role-match |
| `theia/extensions/orca-browser/src/common/orca-browser-dispatch.ts` (new) | 02 | pure core | transform | `.planning/spikes/005-orca-browser-parity/p66-gate-probe.mjs` HOST_SETUP (measured page table and result shapes) | role-match |
| `theia/extensions/orca-browser/src/common/orca-browser-abilities.ts` (new) | 02 | data table | n/a | `.planning/spikes/005-orca-browser-parity/DISPOSITIONS.md` (92 rows, tier column) | exact (shape) |
| `theia/extensions/orca-panes/src/browser/orca-pane-routes.ts`, `orca-pane-observer.ts`, `package.json` (mod) | 02 | route table, observer | event-driven | the merged 64-02 files (P64-01 pending rule and its one log line) | exact (after the 64 merge) |
| `theia/extensions/tab-uris/src/browser/web-tab.ts` (mod) | 02 | widget + channel | request-response, push | itself: `WebTabOptions` :160-179, `WebTabMessage` :343-380, `onPush('sharingChanged')` :574-582, `publish()` :1017-1050, `setPermission(` :1432, `openInBackground` :1720-1727 | exact |
| `theia/package.json`, `theia/applications/browser/package.json` (mod) | 02 | config | n/a | `theia/package.json` `build:extensions` (:69), `applications/browser/package.json` :41-47 | exact |
| `scripts/verify-orca-browser-abilities.mjs` (new) | 02 | check (quick) | derive-compare | `scripts/orca-browser-parity.mjs` (`deriveAll` :114, `parseDispositions` :151, self-test :209); `scripts/verify-update-copy.mjs:142` (transpileModule) | role-match |
| `scripts/verify-orca-browser-entry-points.mjs` (new) | 02 | check (quick) | derive-compare | the merged `scripts/verify-orca-pane-routes.mjs` (TypeScript parse, SKIP rule); `scripts/verify-web-tab-bridge.mjs` (derive both sides, broken-instrument rule) | role-match |
| `powerbrowser/shell/PowerBrowserAPI.sys.mjs` (mod: agent section, in-place edits) | 03 | boundary | request-response, push | `registerEditStateActor` :9977-9989 (second actor pair), `handleWebTabAction` :5137-5160, `WEB_TAB_ACTION_KINDS` :5024, `webTabOpen` :3568-3660, `webTabGeometry` :4161-4193, `sendWebTabPush` :5565-5574, sharingChanged push :7808-7820, `drawSnapshot` :9208, print :5907 | exact |
| `powerbrowser/shell/GroupActorChild.sys.mjs` (mod: PowerBrowserAgentChild) | 03, 04 | actor child | request-response | `PowerBrowserEditStateChild` :144-188; `.planning/spikes/005-orca-browser-parity/p66-probe-child.sys.mjs` (measured arms) | exact |
| `powerbrowser/INTERNAL-APIS.md` (mod: rows) | 03, 04 | catalogue | n/a | rows :109-110 (registerWindowActor pairs), :161-164 (child rows) | exact |
| `scripts/check-internals-boundary.sh` (mod: A2) | 03 | guard | n/a | `ACTOR_CHILD_PATTERNS` :115, `catalogue_has_row` :127-130, self-test-child :446-453 | exact |
| `scripts/verify-web-tab-bridge.mjs` (mod: classification, rule 7, agent-contract SKIP) | 03 | check | derive-compare | itself: `KIND_CLASSES` :71-126, `PRIVILEGED_WEB_TAB_KINDS` :134-139, rule 1 :334-351, rule 7 :499-503, `checkWebTabPrivileged` :626-673, `readSources` :755-765, self-test cases :1100-1196 | exact |
| `scripts/verify-orca-browser-tab-scope.mjs` (new) | 03 | check (quick, stub boundary) | scenario | `scripts/verify-orca-service.mjs` (stub boundary :117, scenarios :253-400) | role-match |
| `scripts/verify-no-remote-agent-port-live.mjs` (new) | 03 | check (live) | observe | `scripts/verify-orca-service-live.mjs` (`tcpRows` :137-149, `socketInodes` :159, TCP fixtures in self-test :399-401) | role-match |
| `website-staging/privacy.html` (mod) | 03 | doc | n/a | its sections :44-90 | exact |
| `scripts/gen-orca-snapshot-fixtures.mjs` (new) | 04 | generator | batch | `.planning/spikes/005-orca-browser-parity/p66-snapshot-reference/` (the research run's inputs and outputs) | role-match |
| `scripts/fixtures/orca-snapshot/*` (new) | 04 | fixtures | n/a | `scripts/fixtures/tls/` (tracked fixture directory) | role-match |
| `scripts/verify-orca-browser-snapshot-live.mjs` (new) | 04 | check (live + quick) | compare | `scripts/verify-orca-service-live.mjs` (live structure, pure verdicts); `provider-proof.mjs` (CLI against orcad) | role-match |
| `theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx` (mod: renderAgentControl) | 05 | widget | render | `renderSharing()` :1660-1675, placed :1887, `SHARING_KINDS` :82-87 | exact |
| `theia/extensions/chrome-bar/src/browser/chrome-bar-copy.ts` (mod: four rows) | 05 | copy | n/a | sharing rows :72-75 (functions of the subject) | exact |
| `theia/extensions/chrome-bar/src/browser/chrome-bar.css` (mod) | 05 | style | n/a | `.pb-chrome-bar-sharing` :1681 | exact |
| `theia/extensions/orca-browser/src/common/orca-browser-tools.ts` (new) | 05 | data map | n/a | spike README U-table :212-241 | exact (shape) |
| `scripts/verify-orca-browser-tools.mjs` (new) | 05 | check (quick) | derive-compare | `scripts/verify-web-tab-bridge.mjs` (registerCommand and method derivations); `scripts/orca-browser-parity.mjs` table parse | role-match |
| `scripts/lib/orca-browser-live.mjs` (new) | 05 | harness | event-driven | `scripts/lib/pb-live-probe.mjs` (`withProbeShell` :51, `inChrome` :186, `overlayVisibility` :195, `chromeActiveTabId` :222); `scripts/lib/orca-run.mjs` (`installOutputRedaction` :157, `startOrcad` :175) | role-match |
| `scripts/verify-orca-browser-agent-live.mjs`, `verify-orca-agent-mark-live.mjs` (new) | 05 | check (live) | event-driven | `.planning/spikes/005-orca-browser-parity/p66-gate-probe.mjs` (focus comparison, `snapshotPixels`, DPR 2 run), `provider-proof.mjs`; `scripts/verify-orca-hidden-electron.mjs` `run` :214 (decoy) | role-match |
| `scripts/verify-platform.sh` (mod: rows) | all | registry | n/a | Orca quick blocks :3828-3887, full blocks :6442-6484 | exact |
| `inventory/brand-tokens.json`, tracking files (mod) | 06 | config, tracking | n/a | 62-03-PLAN.md Task 3 (brand re-measure, tracking order) | exact |

## Pattern Assignments

### Thin host (66-01): keep the measured transport, replace the surface

**Analog:** `p66-thin-host.ts:30-133`. Keep: the legacy handshake (`createPairedE2EEClientHandshake({ primitives: WEB_PAIRED_E2EE_PRIMITIVES, hostPublicKeyB64, framing: 'legacy' })`), `withWebClientUpgradeMarker(endpoint)`, `sealAuth({ kind: 'token', deviceToken }, { clientCapabilities: [BROWSER_CLIENT_HOST_RUNTIME_CAPABILITY, BROWSER_CLIENT_PAGE_METADATA_RUNTIME_CAPABILITY] })`, one `pending` map and one `streams` map on one socket. Replace: `connect(pairingInput)` with `attachBrowserHost({ connection, credential, ... })` (the offer is parsed by the pane bundle, not here). Add: the v2 branch for a device-key credential, copying `web-runtime-connection-socket.ts:67-71` (`transport: 'direct'`) and the keyed-frame rule of `withoutTokenOnKeyedSocket` (`web-runtime-credential-source.ts:185`). Attach parameters: `p66-gate-probe.mjs:318-322`.

**Do not copy:** the proof's `s2-host.ts` reaches (append to `WEB_RUNTIME_CLIENT_CAPABILITIES`, `subscribeOnCurrentConnection`); the host-bundle check plants both.

### Second actor pair (66-03): the edit-state precedent

**Analog:** `PowerBrowserAPI.sys.mjs:9977-9989` and `GroupActorChild.sys.mjs:144-188`.
```js
function registerEditStateActor() {
  ChromeUtils.registerWindowActor(EDIT_STATE_ACTOR_NAME, {
    parent: { esModuleURI: GROUP_ACTOR_PARENT_MODULE },
    child: { esModuleURI: GROUP_ACTOR_CHILD_MODULE },
    messageManagerGroups: ["browsers"],
    allFrames: true, // CR-02 ...
  });
}
```
Deviation: `registerAgentActor()` omits `allFrames` (top frame only, P66-13); called right after `registerEditStateActor()` inside `registerGroupActor` (:2293). Parent class `export class PowerBrowserAgentParent extends GroupActorBase {}` like `PowerBrowserEditStateParent` (:9979). Query with a budget like `webTabEditEnabled` (:9994-10002), except the agent call is not raced against a cached value: a timeout answers failed `browser_timeout`.

### New web-tab kinds (66-03): the action-routing triple

**Analog:** `webTabStop` — one Set member (`WEB_TAB_ACTION_KINDS` :5024), one arm in `handleWebTabAction` (:5143-5153) with the tabId shape check and the `{ ok: true, kind, where }` reply, one `KIND_CLASSES` row in `verify-web-tab-bridge.mjs`. Rule 10 of the bridge check compares the Set with the arms, so both go in the same commit.

### Push and widget state (66-02, 66-05): the sharing precedent end to end

Chrome: `sendWebTabPush(host.theiaBrowser, { kind: "sharingChanged", tabId, ... })` (:7819). Frontend: `this.onPush('sharingChanged', detail => { const widget = ...this.widgets.get(detail.tabId); if (!widget) return; widget.sharing = {...}; this.tabStatusEmitter.fire(widget); })` (web-tab.ts:574-582). Chrome bar: `renderSharing()` reads `currentWebTab()?.sharing` and returns nothing when idle (:1663-1675). `agentControlChanged` / `widget.agentControl` / `renderAgentControl()` copy all three steps; the title class is the one addition (`widget.title.className`).

### Privileged frontend sender (66-02, 66-05)

**Analog:** `setPermission(` (web-tab.ts:1432) called from `address-bar.tsx:535` only. `agentStop()` follows the WEB_TAB-owner rule (`verify-web-tab-bridge.mjs:660-673`: method name = kind without `webTab`, called only from chrome-bar files, never from a command or keybinding file). `webTabAgent` follows the literal-sender owner rule like `webTabContextMenuAction` (owner `page-context-menu.ts`, :134-139), with the owner file in orca-browser.

### Background tab without focus (66-02)

**Analog:** `openInBackground(url, ref, grant)` (web-tab.ts:1720-1727): `createWidget` then `shell.addWidget(widget, { area: 'main', ref, mode: 'tab-after' })`, no `activateWidget`. `openAgentTab` differs only in allowing `about:blank` (createPage carries no URL) and setting `agent: true` in `WebTabOptions`.

### Stub-boundary evaluation of shipped chrome source (66-03)

**Analog:** `verify-orca-service.mjs` header :18-60 and stub boundary :117 (a fake `ChromeUtils.importESModule` returning stubs, scenarios A-F). For tab-scope the code under test is inside `PowerBrowserAPI.sys.mjs`, so the check slices the marked agent section and the named method bodies (comments stripped, as `verify-web-tab-bridge.mjs` does with `apiMethodBody` and `functionBody`) and evaluates them in `node:vm` with stubs; the section therefore keeps every Firefox call inside function bodies.

### Cross-lane SKIP (all lanes)

**Analog:** 63-05-PLAN.md's `orca-bridge-dir` cross-side join: a named SKIP for that clause only while the other lane's file is absent ("lane p63-02 not merged"), red when the file is present but disagrees, the PASS line naming the clause as compared or SKIP. Phase 66 keys each SKIP on one file of the other lane (66-VALIDATION.md table); the coordinator rejects any such SKIP on the merged tree.

### Live rows (66-03, 66-04, 66-05)

**Analog:** `verify-orca-service-live.mjs` (one row, phases in order, pure exported verdicts, `runSelfTest` over fixture observations :383) plus the measured probe `p66-gate-probe.mjs`. Rules copied: `MOZ_PURGE_CACHES=1` (`withProbeShell`), inherited `ORCA_*` removed, redaction installed before orcad output is read, signals by recorded pid only, a named SKIP when the built binary or Orca build is absent, and every absence verdict taking the positive observation as an argument so the self-test can plant "detector blind".

### Copy rows (66-05)

**Analog:** `chrome-bar-copy.ts:72-75` (`sharingCamera: (subject: string) => \`${subject} is sharing your camera with this tab.\``) and the call through `appSubject()` in `chrome-bar-widget.tsx:1671`. Four rows, no identifier; `shell-error-copy-no-internals` stays green.

## Shared Patterns

- **One registry:** every check is one row plus a `-self-test` row at the two anchors; lane order 66-01..66-05 (62-01-PLAN.md interfaces, 63 plans).
- **Catalogue after every boundary edit:** `node scripts/verify-ng-040-internals-catalogue-lines.mjs --fix`, then `check-internals-boundary.sh --catalogue`.
- **Derive and compare:** ability sets from `orca-browser-parity.mjs` (imported), entry points and TabContentType from the pin with `theia/node_modules/typescript`, U-rows from the spike README, snapshot references from the pinned binary; never a hand-kept expectation list.
- **Brand rows:** lanes stage and report (`scan-brand-residue.mjs --report .mozbuild/p66-0N/brand-report.md`); only 66-06 edits `inventory/brand-tokens.json`.
- **Phase 64 paths:** two lanes name Phase 64 files chosen before 64 was planned; each records "Path substitution: <planned> -> <merged>" and the coordinator's scope check accepts it only under `theia/extensions/orca-panes/src/` or `orca-overlay/files/src/renderer/src/pb/`.

## No Analog Found

| File | Role | Reason |
|------|------|--------|
| `theia/extensions/orca-panes/src/browser/orca-pane-routes.ts`, `orca-pane-observer.ts` | route table, observer | Created by Phase 64 lane p64-02, which is planned after this map; the lane reads the merged files |

## Metadata

**Analog search scope:** `powerbrowser/shell/`, `powerbrowser/INTERNAL-APIS.md`, `theia/extensions/{tab-uris,chrome-bar}/src/browser/`, `scripts/` and `scripts/lib/`, `.planning/spikes/004-orca-pane-hosting/`, `.planning/spikes/005-orca-browser-parity/`, `orca/src/` (read-only), 62 and 63 plans.
**Pattern extraction date:** 2026-11-10
