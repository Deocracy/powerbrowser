# Phase 65: Orca workspace in Theia - Pattern Map

**Mapped:** 2026-11-10
**Files analyzed:** 42 new or modified (four lanes and the coordinator)
**Analogs found:** 36 / 41 (five rows depend on Phase 64 code that is planned at 545ad293 but not on this branch yet)

Analog paths marked (tree) are git-tracked on ServerDestroyer/v1.7-Orca-integration at 6861d390 and were read while planning; line numbers are from this worktree. Paths marked (C64) are Phase 64 files named by the Phase 64 plans committed at 545ad293 (shared contracts C1-C12 in each 64 plan's interfaces block); 65-05's prelaunch step reconciles them on the merged tree and edits this file if one differs, and a lane that finds a Phase 64 path under another name applies the path substitution rule of its interfaces block (one "Path substitution: <planned> -> <merged>" SUMMARY line). Facts about Orca, Theia and the device registry are in 65-RESEARCH.md and are not repeated here; this file only says what to copy from where.

## File Classification

| New/Modified File | Lane | Role | Data Flow | Closest Analog | Match |
|---|---|---|---|---|---|
| `orca-overlay/files/src/renderer/src/pb/pb-pane-mount.tsx` (mod) | 01 | pane entry | request-response (mount), event-driven (subscribe) | itself (C64-1); spike `.planning/spikes/004-orca-pane-hosting/pb-pane-mount.tsx` (tree) | exact |
| `orca-overlay/files/src/renderer/src/pb/pb-side-mounts.tsx` (new) | 01 | component host | request-response | `orca/src/renderer/src/app-shell/AppWorkspaceShell.tsx:67-111` (how Orca mounts Sidebar and ActivePage) | exact (role) |
| `orca-overlay/files/src/renderer/src/pb/pb-workspace-api.ts` (new) | 01 | store projection | event-driven | Phase 64's `subscribePanes` in `pb-pane-mount.tsx` (C64-1); spike `pb-pane-mount.tsx` `subscribeTabs` (tree) | role-match |
| `orca-overlay/files/src/renderer/src/pb/pb-session-pairing.ts` (new) | 01 | pairing | request-response | 64-RESEARCH Pattern 3 (session-only bootstrap) | exact |
| `scripts/lib/orca-pane-harness.mjs`, `scripts/verify-orca-pane-standalone-live.mjs`, `scripts/verify-orca-pane-entry.mjs`, `scripts/verify-orca-pane-css-live.mjs` (mod) | 01 | check (live, full) | event-driven / derive-compare | themselves (C64-7); spike `measure.mjs`, `page-routes.mjs` (tree) | exact |
| `theia/extensions/orca-workspace/package.json`, `tsconfig.json` (new) | 02 | config | n/a | `theia/extensions/modes/package.json`, `tsconfig.json` (tree) | exact |
| `theia/extensions/orca-workspace/src/common/orca-git-protocol.ts` (new) | 02 | protocol + validator | transform | `theia/extensions/tab-uris/src/browser/group-query-service.ts` (GROUP_PATH and the service interface) (tree) | role-match |
| `theia/extensions/orca-workspace/src/node/orca-workspace-backend-module.ts` (new) | 02 | backend service | request-response (process) | `theia/extensions/tab-uris/src/node/tab-query-backend-module.ts` (tree) | exact (binding) |
| `theia/extensions/orca-workspace/src/browser/orca-git-resource.ts` (new) | 02 | ResourceResolver | request-response | Theia's own resolvers (`@theia/core/lib/common/resource.d.ts`); no PB analog | partial |
| `theia/extensions/orca-workspace/src/browser/orca-editor-routes.ts` (new) | 02 | router + handler table | event-driven | `theia/extensions/modes/src/browser/mode-service.ts:105-116` (`SHIPPED_MODE_RULES` as a data table read by a check) (tree) | role-match |
| `theia/extensions/orca-workspace/src/browser/orca-root-sync.ts` (new) | 02 | state sync | event-driven | `theia/extensions/modes/src/browser/setups-service.ts:463-464,555` (ProfileStorageService keys) (tree) | role-match |
| `theia/extensions/orca-workspace/src/browser/orca-workspace-frontend-module.ts` (new) | 02 | DI module | n/a | `theia/extensions/modes/src/browser/modes-frontend-module.ts` (tree) | exact |
| `theia/extensions/tab-uris/src/browser/profile-storage.ts` (mod: `keysWithPrefix`) | 02 | storage accessor | n/a | itself, `getData` (tree) | exact |
| `theia/package.json`, `theia/applications/browser/package.json` (mod) | 02 | config | n/a | line 69 `build:extensions`; app dependency rows 41-47 (tree) | exact |
| `theia/extensions/orca-panes/src/browser/side-panel/orca-side-panel-module.ts` (new) | 03 | view containers | n/a | `theia/extensions/branding/src/browser/powerbrowser-frontend-module.ts:16-21` + `@theia/navigator` navigator-widget-factory (tree) | exact |
| `theia/extensions/orca-panes/src/browser/side-panel/orca-side-view-widget.tsx` (new) | 03 | ReactWidget host | request-response | `orca-pane-widget.tsx` (C64-4) | exact |
| `theia/extensions/orca-panes/src/browser/side-panel/orca-side-panel-sync.ts` (new) | 03 | store-to-shell sync | event-driven | `orca-pane-observer.ts` (C64-2) | role-match |
| `theia/extensions/orca-panes/src/browser/orca-pane-widget.tsx` (mod: tab-less title and close) | 03 | widget | n/a | itself (C64-4) | exact |
| `theia/extensions/orca-panes/src/browser/orca-panes-frontend-module.ts` (mod, shared 03/04) | 03, 04 | DI module | n/a | itself (C64-2) | exact |
| `theia/extensions/modes/src/browser/mode-descriptors.ts`, `mode-service.ts` (mod) | 03 | data rows | n/a | the coding descriptor (`mode-descriptors.ts:22-28`) and row (`mode-service.ts:113`) (tree) | exact |
| `theia/extensions/tab-uris/src/browser/view-factory-table.ts` (mod) | 03 | coverage table | n/a | the `welcome` row (`view-factory-table.ts:54`) (tree) | exact |
| `scripts/verify-uri-roundtrip.mjs` (mod: page names) | 03 | check (live) | request-response | its pb-orca rows (Phase 64) | exact |
| `scripts/verify-orca-no-pb-add-project.mjs` (new) | 03 | check (quick) | derive-compare | `scripts/verify-update-copy.mjs:160-172` (typescript load, SKIP sentence) + `scripts/verify-orca-build-shape.mjs` self-test (tree) | role-match |
| `scripts/verify-orca-side-panel-live.mjs`, `scripts/verify-orca-add-project-live.mjs` (new) | 03 | check (live) | event-driven | `scripts/verify-mode-switch-tabs-live.mjs` + `scripts/lib/pb-relaunch.mjs` + `scripts/lib/endpoint-verdict.mjs` (tree) | role-match |
| `theia/extensions/orca-panes/src/browser/restore/orca-pane-name-map.ts` (new) | 04 | persisted map | event-driven | `setups-service.ts:555` (ProfileStorageService write), `mintName` in `orca-pane-routes.ts` (C64-3) | role-match |
| `theia/extensions/orca-panes/src/browser/orca-pane-routes.ts` (rows, `ORCA_PAGE_ROUTES`, `planPanes` name seeding), `orca-pane-observer.ts` (map seeding, theia-editor branch, page-widget skip) (mod) | 04 | routes, minting, observer | event-driven | themselves (C64-2, C64-3) | exact |
| `theia/extensions/orca-panes/src/browser/restore/orca-pane-restore-opener.ts` (new) | 04 | OpenHandler (priority 1001, named URIs) | request-response | Phase 64's `OrcaPaneOpenHandler` in `orca-panes-frontend-module.ts` (C64-2); `theia/extensions/tab-uris/src/browser/view-open-handler.ts` (tree) | exact |
| `theia/extensions/orca-panes/package.json` (mod: `@powerbrowser/modes` dependency) | 04 | config | n/a | `theia/extensions/modes/package.json` dependency rows (tree) | exact |
| `theia/extensions/modes/src/browser/setups-service.ts` (mod: reader export) | 04 | reader | transform | itself, `parseSetupStore` (:348), `parseSessionSnapshot` (:378) (tree) | exact |
| `docs/URI-SCHEMES.md` (mod) | 04 | doc | n/a | its `## \`view:\`` and `## \`terminal:\`` sections (tree) | exact |
| `scripts/verify-orca-pane-routes.mjs` (mod: page-word clause and plants) | 04 | check (quick) | derive-compare | itself, clauses (c) and (e) (C64-7) | exact |
| `scripts/lib/orca-offer-scan.mjs` (new) | 04 | scanner library | batch | `scripts/lib/orca-run.mjs` (`redact`) (tree); 67-CONTEXT P67-10 collectors | partial |
| `scripts/verify-orca-offer-scan.mjs`, `scripts/verify-orca-relaunch-restore-live.mjs` (new) | 04 | check (quick self-test, live) | event-driven | `scripts/verify-orca-service-live.mjs` (three launches on one profile) + `scripts/lib/pb-relaunch.mjs` (tree) | role-match |
| `scripts/verify-platform.sh` (mod: rows) | 02-05 | registry | n/a | the Orca block ending before `"allowlist-schema|check_allowlist_schema"` (line 3891) and the full-tier rows ending at `orca-service-live` (line 6483) (tree) | exact |
| `powerbrowser/endpoint-allowlist.json` (mod, if measured) | 05 | config | n/a | the `.onorca.dev` user-initiated row (Phase 62) (tree) | exact |
| `inventory/brand-tokens.json` (mod) | 05 | config | n/a | the Orca-family rows (coordinator only) (tree) | exact |

## Pattern Assignments

### Overlay mounts (`pb-side-mounts.tsx`, lane 01)

**Analog:** `orca/src/renderer/src/app-shell/AppWorkspaceShell.tsx:67-71` (Sidebar inside its error boundary with two scroll refs) and `:88-111` (ActivePage). Mount each surface exactly as Orca does; hide nothing (P65-13).
```tsx
<RecoverableRenderErrorBoundary ...>
  <Sidebar
    worktreeScrollOffsetRef={scrollRefs.scrollOffsetRef}
    worktreeScrollAnchorRef={scrollRefs.scrollAnchorRef}
  />
</RecoverableRenderErrorBoundary>
```
Every PB-added overlay file carries `pb-overlay:<its Orca-root path>` in reachable code (P62-20), or `orca-overlay-built` goes red. No test files in the overlay: a file that is never compiled into `orca/out/web` fails that row.

### Backend service over JSON-RPC (`orca-workspace-backend-module.ts`, lane 02)

**Analog:** `theia/extensions/tab-uris/src/node/tab-query-backend-module.ts` (copy the binding shape):
```ts
export default new ContainerModule(bind => {
    bind(TabQueryService).toSelf().inSingletonScope();
    bind(ConnectionHandler).toDynamicValue(ctx =>
        new JsonRpcConnectionHandler<GroupQueryService>(GROUP_PATH, () =>
            ctx.container.get(TabQueryService)
        )
    );
});
```
Process call: `execFile('git', catFileArgs(root, rev, rel), { env: <process.env minus GIT_*>, maxBuffer: 50 MB, timeout: 10_000, encoding: 'buffer' })`. Orca's own form is `orca/src/main/git/source-control/git-blob-read.ts:89-98`. Grammar: 65-RESEARCH Pattern 2.

### View containers (`orca-side-panel-module.ts`, lane 03)

**Analog:** `theia/extensions/branding/src/browser/powerbrowser-frontend-module.ts:16-21` (a PB-owned WidgetFactory id plus `bindViewContribution`) and `powerbrowser-welcome-contribution.ts:15-26`:
```ts
bind(WidgetFactory).toDynamicValue(context => ({
    id: 'welcome',
    createWidget: () => context.container.get<PowerBrowserWelcomeWidget>(PowerBrowserWelcomeWidget),
})).inSingletonScope();
bindViewContribution(bind, PowerBrowserWelcomeViewContribution);
```
Deviation: the container factory builds `ViewContainer.Factory({ id })`, `setTitleOptions`, and `addWidget`s its parts (65-RESEARCH Pattern 3). Pass no `toggleCommandId`: the containers register no command, menu, toolbar item or keybinding, so `orca-no-pb-add-project` sees no new PB string from them.

### Mode rows (`mode-descriptors.ts`, `mode-service.ts`, lane 03)

**Analog:** the coding descriptor and row (copy the shapes):
```ts
viewPlacements: new Map<string, ApplicationShell.Area>([
    ['explorer-view-container', 'left'],
]),
// mode-service.ts:113
coding: { left: 'open', right: 'keep', bottom: 'open', furniture: true, organising: false, views: { left: ['explorer-view-container'], right: [], bottom: [] } },
```
The Orca row keeps Phase 64's `bottom`, `furniture` and `organising` values; ids are literals (modes and tab-uris never import orca-panes).

### Factory table rows (`view-factory-table.ts`, lane 03)

**Analog:** `{ factoryId: 'welcome', container: false }, // theia/extensions/branding/... -- @powerbrowser/branding's own WidgetFactory id` (line 54). New rows are `container: true` with a comment naming `side-panel/orca-side-panel-module.ts`. `verify-registry-shape.mjs` compares exports, not rows, so it stays green.

### ProfileStorageService keys (`orca-root-sync.ts`, `orca-pane-name-map.ts`, lanes 02 and 04)

**Analog:** `setups-service.ts:555` writes unprefixed keys through the injected `ProfileStorageService` (`await this.profileStorage.setData(SESSION_STORAGE_KEY, session)`). Use the same direct injection, never `StorageService` (which `WorkspaceStorageService` prefixes). The prefix copy uses the new `keysWithPrefix`; order is copy, then `WorkspaceService.save(fixed file)`, then `spliceRoots` (65-RESEARCH Code Example, Pitfall 2).

### Derive-and-compare checks with TypeScript (`verify-orca-editor-routes.mjs`, `verify-orca-no-pb-add-project.mjs`, `verify-orca-pane-entry.mjs` clauses)

**Analog:** `scripts/verify-update-copy.mjs:168-171`:
```js
ts = createRequire(join(REPO_ROOT, THEIA_PKG_REL))('typescript');
} catch {
    return [`theia/node_modules/typescript is not installed, so ... is unproven. Next step: run yarn install in theia/ (nix develop .#theia).`];
```
Self-test structure: `scripts/verify-orca-build-shape.mjs` (mkdtemp fixtures, a green control, plants of `{ name, naming, apply }`, each undone and the control re-run). A set of zero derived members is red ("source moved"); a PB set missing a known member is red ("parser blind").

### Live rows (`verify-orca-workspace-live.mjs`, `verify-orca-side-panel-live.mjs`, `verify-orca-add-project-live.mjs`, `verify-orca-offer-scan.mjs`, `verify-orca-relaunch-restore-live.mjs`)

**Analog:** `scripts/verify-orca-service-live.mjs` (three launches on one profile, `flock` note in its header line 51) with `scripts/lib/pb-relaunch.mjs` and `scripts/lib/firefox-bidi.mjs`; `scripts/lib/orca-run.mjs` for scratch data roots, the built CLI and `redact`. Each prints a named SKIP and exits 0 when no built PowerBrowser, `orca/out` or built Theia app exists; each has a `--self-test` of pure comparators on fixtures; every absence (Orca editor DOM, pairing UI DOM, an offer in a sink, an unlisted host) follows a positive read of the same detector (the standalone page, a planted offer, a marker key, a `.invalid` resolution).

### Restore opener and observer seeding (`restore/orca-pane-restore-opener.ts`, `orca-pane-observer.ts`, lane 04)

**Analog:** Phase 64's `OrcaPaneOpenHandler` in `orca-panes-frontend-module.ts` (C64-2: a bare OpenHandler, canHandle 1000 for scheme pb-orca, the `ViewUriOpenHandler` rule in `theia/extensions/tab-uris/src/browser/view-open-handler.ts`). The restore opener is a second bare OpenHandler at canHandle 1001 for a pb-orca URI with a non-empty path only, so Phase 64's handler is not edited and keeps the empty path. Names stay stable because the observer passes the persisted map into Phase 64's pure `planPanes` (`namesByKey`, `reservedNames`), which Node can load from `lib/browser/orca-pane-routes.js` for a one-line verify, as 64-02's own verify does.

### Registry rows (`scripts/verify-platform.sh`, lanes 02-04)

Quick blocks go immediately before `    "allowlist-schema|check_allowlist_schema"` (line 3891 today, after the Phase 62 block that ends with `orca-service-live-self-test`; Phases 63 and 64 add theirs in between). Full blocks go immediately before the `    )` that closes the full-tier array after the last Orca row (line 6484 today), indented six spaces. Each lane block opens with `# NEW (65-0N, <req>, <picks>): ...` and two to four comment lines naming what is derived and what is planted. Order: 65-02, 65-03, 65-04.

### Shared frontend module (`orca-panes-frontend-module.ts`, lanes 03 and 04)

Each lane adds exactly two lines after the module's last existing bind call:
```ts
// NEW (65-03): Orca side panel (TAB-07, P65-09)
import { bindOrcaSidePanel } from './side-panel/orca-side-panel-module';   // import goes with the other imports
bindOrcaSidePanel(bind);
// NEW (65-04): pb-orca name map and restore (TAB-08, P65-18)
bindOrcaRestore(bind);
```
The coordinator keeps both blocks, 65-03 first, and changes no other line. Phase 64's `OrcaPaneOpenHandler`, commands and key rows in the same file are not touched by either lane.

## Shared Patterns

### Theia core stays untouched (hard rule 1)
**Source:** `scripts/diff-theia-core.sh` (row `diff-theia-core`, full). **Apply to:** every Theia file. Use `WorkspaceService`, `EditorManager`, `OpenerService`, `DiffUris`, `MergeEditorUri`, `ResourceResolver`, `ViewContainer`, `AbstractViewContribution`, `EnvVariablesServer`; the one storage accessor goes in PB's own `profile-storage.ts`.

### Additive overlay, zero seams (P65-25, P65-31)
**Source:** `scripts/verify-orca-overlay.mjs` (rows `orca-overlay`, `orca-overlay-built`), `orca-overlay/seams.json`. **Apply to:** lane 01. Never touch `seams.json` or `patches/`; `git -C orca status` lists only seam 010.

### Credential hygiene
**Source:** `scripts/lib/orca-run.mjs` (`redact`), `powerbrowser/shell/OrcaService.sys.mjs:12-13` (stdout never logged). **Apply to:** every script and overlay file. Never print the ready line, a pairing URL, an offer, a needle or a token; the scanner prints sink names and counts.

### Live lock and inherited Orca variables
**Apply to:** every live command: `env $(compgen -e | grep '^ORCA_' | sed 's/^/-u /') flock /home/chris/coding/Power-Browser/.git/pb-live.lock ...`; lanes set `PB_FIREFOX_BIN=/home/chris/orca/workspaces/Power-Browser/v1.7-Orca-integration/objdir/dist/bin/powerbrowser`, headless, never `PB_LIVE_HEADED` or `PB_REAL_INPUT`.

### Stage before the brand scan
**Source:** CLAUDE.md. `node scripts/scan-brand-residue.mjs` iterates `git ls-files`; lanes stage, report with `--report .mozbuild/p65-0N/brand-report.md`, and leave `inventory/brand-tokens.json` to the coordinator.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `orca-git-resource.ts` | ResourceResolver | request-response | No PB extension registers a resource scheme; follow Theia's `ResourceResolver` contract and reject on a refused read so Theia shows its own state |
| `scripts/lib/orca-offer-scan.mjs` | scanner library | batch | No existing scanner reads Gecko's per-origin `ls/data.sqlite`; use `node:sqlite` on a copy and read the key column only (CA-09); needles follow `orca/src/renderer/src/web/web-pairing.ts` |
| Phase 64 files (C64-1..C64-8) | various | various | Planned at 545ad293 but not executed when Phase 65 was planned; names from the Phase 64 plans' contracts C1-C12, reconciled by 65-05's prelaunch step and the lanes' path substitution rule |

## Metadata

**Analog search scope:** `theia/extensions/{branding,modes,tab-uris}/src`, `theia/package.json`, `theia/applications/browser/package.json`, `theia/node_modules/@theia/{core,workspace,scm}` declarations, `scripts/`, `scripts/lib/`, `orca/src` at v1.4.248, `.planning/spikes/004-orca-pane-hosting/`.
**Files read:** about 16, by targeted ranges.
**Pattern extraction date:** 2026-11-10
