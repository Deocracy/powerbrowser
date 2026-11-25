# Phase 67: Hosting hardening - Pattern Map

**Mapped:** 2026-11-10
**Files analyzed:** 31 new or modified (plus the probe)
**Analogs found:** 29 / 31 (two files of Phases 64/65 are not merged yet; their names are path substitutions)

Line numbers below are from this worktree before the Phase 63-66 merges; every Phase 67 lane re-reads the merged files, because those merges move them. Facts about Orca, Gecko headers and the hotfix are in 67-RESEARCH.md and the plans; this file only says what to copy from where.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match |
|---|---|---|---|---|
| `powerbrowser/shell/OrcaEnv.sys.mjs` (mod: classes, temp roots, override, logo selectors) | utility (pure) | transform | itself (`ORCAD_*_CODE`, `isLoopbackEndpoint`, `buildOrcadArgs` throw rule) | exact |
| `powerbrowser/shell/OrcaService.sys.mjs` (mod: failureClass, restart, preflight, rows, offer removal) | service | event-driven | itself (`_fail`, `_supervise`, `getDiagnosticRows`); `TheiaService.sys.mjs` recoverable split | exact |
| `powerbrowser/shell/PowerBrowserAPI.sys.mjs` (mod: shell kinds, `PowerBrowserOrcaHosting`, logo actor) | boundary | request-response | `handleShellMessage` arms `appUpdateState`/`restartToUpdate` (2319-2408); `registerEditStateActor` (9982-9989) | exact |
| `powerbrowser/shell/GroupActorChild.sys.mjs` (mod: `PowerBrowserOrcaLogoChild`) | actor child | event-driven | `PowerBrowserEditStateChild` (149-188) | role-match (adds events and a DOM write) |
| `powerbrowser/shell/powerbrowser.js` (mod: `powerbrowserOpenDiagnostics`) | wiring | event-driven | `powerbrowserShowDiagnostics` / `powerbrowserHideDiagnostics` (267-330) | exact |
| `powerbrowser/shell/jar.mn` (mod: mark line) | config | n/a | the existing content lines | partial (first file from outside `powerbrowser/shell`) |
| `powerbrowser/INTERNAL-APIS.md` (mod: rows) | catalogue | n/a | rows 109-110 (registerWindowActor), 162 (child class), the p62-02 end-of-table rows | exact |
| `website-staging/privacy.html` (mod: paragraph) | static page | n/a | the `<h2>`/`<p>` sections; no `data-*-host` attribute | exact |
| `theia/extensions/orca-panes/src/browser/failure/orca-failure-copy.ts` (new) | copy table | n/a | `TheiaService.sys.mjs` `USER_MESSAGE` (41-56); `@powerbrowser/branding` `POWERBROWSER_UPDATE_COPY` | role-match |
| `theia/extensions/orca-panes/src/browser/failure/orca-hosting-status.ts` (new) | frontend service | request-response, polling | `theia/extensions/tab-uris/src/browser/update-client.ts` `request()` (269-300) | exact (channel) |
| `theia/extensions/orca-panes/src/browser/failure/orca-failure-page.tsx` (new) | React component | n/a | Phase 64's `OrcaPaneWidget` render | role-match |
| `theia/extensions/orca-panes/src/browser/orca-pane-widget.tsx` (mod, substitution) | widget | event-driven | itself (Phase 64) | n/a until merged |
| `theia/extensions/orca-panes/src/browser/side-panel/orca-side-panel-view.tsx` (mod, substitution) | widget | event-driven | itself (Phase 65) | n/a until merged |
| `theia/extensions/orca-panes/src/browser/orca-panes-frontend-module.ts` (mod, substitution) | DI module | n/a | `tab-uris-frontend-module.ts` binding style | exact |
| `theia/extensions/orca-panes/src/node/offer-file-policy.ts` (new) | pure policy | transform | `theia/extensions/token-gate/src/common/origin-policy.ts` (hotfix) and `webview-host.ts` | exact (pure function a Node check type-strips) |
| `theia/extensions/orca-panes/src/node/orca-offer-service.ts` (mod, substitution) | backend RPC | request-response | itself (Phase 64) | n/a until merged |
| `scripts/verify-orca-failure-classes.mjs` (new) | check | derive-compare | `scripts/verify-orca-service.mjs` (copy-and-plant self-test) + `scripts/verify-sidecar-origin-gate.mjs` (`loadPolicy`) | exact |
| `scripts/verify-orca-credential-store.mjs` (new) | check | derive-compare | `scripts/verify-orca-hidden-electron.mjs` (pinned-source derivation, "source moved") | exact |
| `scripts/verify-orca-credential-store-live.mjs` (new) | check (live) | event-driven | `scripts/verify-orca-service-live.mjs` | exact |
| `scripts/verify-orca-service.mjs` (mod: scenarios G-J) | check | stub boundary | itself (scenarios A-F) | exact |
| `scripts/verify-shell-error-copy.mjs` (mod: Orca scope) | check | derive-compare | its 14-02 modes-copy extension (519-1140) | exact |
| `scripts/verify-orca-offer-file.mjs` (new) | check | derive-compare | `scripts/verify-sidecar-origin-gate.mjs` | exact |
| `scripts/verify-orca-failure-page-live.mjs` (new) | check (live) | event-driven | Phase 64's `verify-orca-tabs-live.mjs` + `verify-orca-service-live.mjs` | role-match |
| `scripts/verify-sidecar-origin-gate.mjs` (mod) | check | derive-compare | itself (hotfix: RECORDED, EDGES, plants) | exact |
| `scripts/verify-sidecar-origin-gate-live.mjs` (mod) | check (live) | event-driven | itself (hotfix legs, recorder rows) | exact |
| `scripts/lib/sidecar-status-recorder.cjs` (mod: path option) | instrument | append-only log | itself; research probe `probes/header-recorder.cjs` | exact |
| `scripts/verify-orca-pairing-containment.mjs` (new) | check (quick self-test + live) | batch scan | Phase 65's `verify-orca-offer-scan.mjs` | exact |
| `scripts/lib/orca-offer-scan.mjs` (mod) | library | batch scan | itself (Phase 65) | exact |
| `scripts/lib/mozlz4.mjs` (new) | library | transform | none in tree | no analog (LZ4 block format) |
| `scripts/lib/pb-relaunch.mjs`, `scripts/lib/firefox-bidi.mjs` (mod: profile base) | harness | n/a | `verify-orca-service-live.mjs` `WORK_REL` repo-local folder (78) | exact |
| `scripts/verify-orca-landing-selectors.mjs` (new) | check | derive-compare | `scripts/verify-orca-build-shape.mjs` (reads `orca/out`, SKIP without build) | role-match |
| `scripts/verify-orca-landing-logo-live.mjs` (new) | check (live) | event-driven | `verify-orca-service-live.mjs` (CLI env from scratch) + `pb-live-probe.mjs` web tabs | role-match |
| `scripts/verify-platform.sh` (mod: blocks) | registry | n/a | the `# NEW (62-01, ...)` / `# NEW (62-02, ...)` blocks (3871-3889, 6474-6483) | exact |

## Pattern Assignments

### Shell kinds (PowerBrowserAPI.sys.mjs, lane p67-01)

**Analog:** the update kinds in `handleShellMessage` (2319-2408). The wall runs first and refuses with a fixed message:
```js
async handleShellMessage(data, actorRef) {
  if (!groupSenderIsTheia(actorRef)) {
    PowerBrowserAPI.log("error", "[handleShellMessage] rejecting non-Theia-origin sender");
    return { ok: false, reason: "validation", message: "handleShellMessage: rejecting non-Theia-origin sender" };
  }
```
Deviation: the three Orca kinds are appended to the `SHELL_MESSAGE_KINDS` line (302, same line) and dispatched by ONE inserted line after the wall to `handleOrcaShellMessage` in an end-of-file section, so the switch body is not edited and only the rows below the inserted line renumber (`verify-ng-040-internals-catalogue-lines.mjs --fix`). The error reply copies the existing catch: the fixed string plus `err.name`, never `err.message`.

### Frontend shell client (orca-hosting-status.ts, lane p67-03)

**Analog:** `update-client.ts` `request()` (269-300), copied, not imported:
```ts
if (location.protocol !== 'http:' || location.hostname !== '127.0.0.1') {
    return Promise.resolve('no-chrome');
}
...
document.dispatchEvent(new CustomEvent(SHELL_STATE_REQUEST_EVENT, { bubbles: true, detail: { requestId, msg } }));
```
Deviation: request ids carry the prefix `orca-`; a shared one-second `setInterval` runs only while at least one failure page is shown (P67-07).

### Copy table (orca-failure-copy.ts, lane p67-03)

**Analog:** `TheiaService.sys.mjs` `USER_MESSAGE` (41-56), including the 01-13 rule in its comment: "the stated next step and the rendered controls are one fact". Deviation: the buttons are a second table (`ORCA_FAILURE_BUTTONS`), and `shell-error-copy-no-internals` compares the labels each sentence names with the buttons its class renders. The file imports nothing so a Node check type-strips it.

### Pure policy loaded by a check (offer-file-policy.ts; OrcaEnv additions)

**Analog:** the hotfix's `scripts/verify-sidecar-origin-gate.mjs` `loadPolicy`:
```js
const js = stripTypeScriptTypes(src);
return await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
```
For pinned Orca TypeScript (unions, `describe*` functions) use P63-27's rule instead: `theia/node_modules/typescript`, named SKIP when absent. OrcaEnv stays import-free and Gecko-free, so Node imports it by path (P62-04).

### Stub-boundary scenarios (verify-orca-service.mjs G-J, lane p67-01)

**Analog:** scenarios A-F and the fake `ChromeUtils.importESModule` returning `{ PowerBrowserAPI, PowerBrowserProcesses }` for the boundary URL. Add `PowerBrowserOrcaHosting` (getTempDir, realPath) to the stub; record calls in order; assert zero spawn calls on a refusal.

### Actor pair (lane p67-05)

**Analog:** `registerEditStateActor` (9982-9989) called from `registerGroupActor` (2293), parent `PowerBrowserEditStateParent extends GroupActorBase` (9980), child `PowerBrowserEditStateChild` (GroupActorChild.sys.mjs 149):
```js
ChromeUtils.registerWindowActor(EDIT_STATE_ACTOR_NAME, {
  parent: { esModuleURI: GROUP_ACTOR_PARENT_MODULE },
  child: { esModuleURI: GROUP_ACTOR_CHILD_MODULE },
  messageManagerGroups: ["browsers"],
  allFrames: true,
});
```
Deviations (A-9, P67-23): `child.events: { DOMContentLoaded: {} }`, `matches: ["http://127.0.0.1/*"]`, no `messageManagerGroups` (stock windows covered), `allFrames` unset (top frame). The child keeps the "zero privileged reach" rule (no import, only actor globals) but writes two attributes, which its catalogue row states (the EditState row says "no DOM write").

### Live rows (lanes p67-01, p67-03, p67-04, p67-05)

**Analog:** `scripts/verify-orca-service-live.mjs`: repo-local work folder (`WORK_REL = '.mozbuild/orca-service-live'`), `installOutputRedaction`, `signalIdentity` by pid plus start ticks, chrome reads through `inChrome`, a SKIP line naming the missing build. The hotfix's live row re-execs itself under `<git common dir>/pb-live.lock` and deletes every `ORCA_*` from `process.env` first; copy both. Every absence follows a positive read through the same collector in the same run (CLAUDE.md verification rule 1).

### Profile base (pb-relaunch.mjs, firefox-bidi.mjs, lane p67-04)

**Analog:** `makeProfile` (249-264) keeps its shape; only the mkdtemp parent changes from `tmpdir()` to `<repo>/.mozbuild/pb-live-profiles/`. `dispose` additionally removes `OrcaEnv.aliasPathFor(dataRootFor(profileDir), getEnv)` and `OrcaEnv.bridgeDirFor(...)` (Pitfall 7).

### Registry blocks

**Analog:** `# NEW (62-02, RUN-03/RUN-04/RUN-05, P62-01..P62-19): ...` with three to five comment lines, then `"label|node $REPO_ROOT/scripts/<file>.mjs"` and the `-self-test` row; full-tier rows indented six spaces. Phase 67 quick blocks go directly above `"allowlist-schema|check_allowlist_schema"`, full blocks directly above the line closing the full-tier array, in lane order 01, 03, 04, 05 (p67-02 adds no block; it extends the hotfix's rows).

## No Analog Found

| File | Role | Reason |
|------|------|--------|
| `scripts/lib/mozlz4.mjs` | library | No LZ4 code in the tree; the format is Gecko's `mozLz40\0` magic, a 4-byte little-endian size and one LZ4 block (Claude's discretion: implementation) |
| `powerbrowser/shell/jar.mn` mark line | config | No existing line packages a file from outside `powerbrowser/shell`; lane p67-05 checks the path form the jar maker resolves, and a BLOCKER stops it rather than copying the mark (P67-25) |

## Metadata

**Analog search scope:** `powerbrowser/shell`, `powerbrowser/INTERNAL-APIS.md`, `theia/extensions/{tab-uris,token-gate,branding}`, `scripts/`, `scripts/lib/`, the hotfix commit 2b5f4609, Phase 64-66 CONTEXT and RESEARCH for the unmerged orca-panes layout.
**Pattern extraction date:** 2026-11-10
