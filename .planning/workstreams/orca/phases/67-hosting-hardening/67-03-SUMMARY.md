---
phase: 67-hosting-hardening
plan: 03
subsystem: orca-panes failure page, status client, offer reader; orca-browser attach; checks
status: complete
tags: [orca, RUN-06, RUN-07, failure-page, offer-file, repair, lane-p67-03]
requires: [Phase 64 merged, Phase 65 merged, Phase 66 merged incl. 66-07 (base ea5aa7a8)]
provides:
  - "orca-failure-copy.ts: OrcaFailureClass, ORCA_FAILURE_COPY (8), ORCA_FAILURE_BUTTONS, ORCA_BUTTON_LABELS, ORCA_PROTECTION_SENTENCE, ORCA_CLIENT_REASON_CLASS (12)"
  - "orca-hosting-status.ts: OrcaHostingStatus (orcaStatus/orcaRestart/orcaShowDiagnostics client, one-second poll, reconnect(), automatic re-pair, client-status watch)"
  - "orca-failure-page.tsx: OrcaFailurePage, mounted in OrcaPaneWidget and OrcaSideViewWidget"
  - "offer-file-policy.ts: OFFER_REFUSAL_REASONS, offerFileVerdict, decodeOffer, offerPortOf, offerEndpointVerdict, OfferHandOff"
  - "OrcaPanesServiceImpl.handOff: lstat-first, no-follow read, { refused: <code> }"
  - "OrcaBrowserHost: attach(), state, onDidChangeState; sends browser-host-attach-failed and the clearing form { kind: 'orcaStatus', browserHost: 'attached' }"
  - "checks: shell-error-copy-no-internals Orca scope (+4 plants), orca-offer-file (+6-plant self-test), orca-failure-page-live (full, +13-case self-test)"
affects: [lane p67-01 (chrome receiving side of the clearing form), coordinator 67-06 (merge, live proof)]
tech-stack:
  added: []
  patterns: ["frontend's own fresh state wins over a held chrome class for one class only", "lstat verdict then O_NOFOLLOW open with an inode match"]
key-files:
  created:
    - theia/extensions/orca-panes/src/browser/failure/orca-failure-copy.ts
    - theia/extensions/orca-panes/src/browser/failure/orca-hosting-status.ts
    - theia/extensions/orca-panes/src/browser/failure/orca-failure-page.tsx
    - theia/extensions/orca-panes/src/node/offer-file-policy.ts
    - scripts/verify-orca-offer-file.mjs
    - scripts/verify-orca-failure-page-live.mjs
  modified:
    - theia/extensions/orca-panes/src/browser/orca-pane-widget.tsx
    - theia/extensions/orca-panes/src/browser/side-panel/orca-side-view-widget.tsx
    - theia/extensions/orca-panes/src/browser/orca-panes-frontend-module.ts
    - theia/extensions/orca-panes/src/node/orca-panes-backend-module.ts
    - theia/extensions/orca-browser/src/browser/orca-browser-frontend-module.ts
    - scripts/verify-shell-error-copy.mjs
    - scripts/verify-platform.sh
decisions:
  - "Clearing form for browser-not-attached (coordinator ruling): { kind: 'orcaStatus', browserHost: 'attached' }, sent by OrcaBrowserHost after every successful attach; the frontend ignores a chrome browser-not-attached while its own host is attached"
  - "Polling runs while a page is shown or the pane bundle has not settled its boot; after boot a change of Orca's client status asks once"
  - "An absent offer file stays undefined (not written yet); Reconnect reports offer-missing only when chrome says ready"
  - "orcad's port for the endpoint check is the web-client URL's port (Orca's createWebClientUrl builds it from the same endpoint)"
metrics:
  completed: 2026-11-11
actuals:
  tokens: 33000
  tasks: 3
  commits: 3
plan_head_before: ea5aa7a8c0227b04910c8673d6ad82de8a7ba1d6
plan_head_after: "the commit that adds this file (head of ServerDestroyer/p67-03)"
---

# Phase 67 Plan 03: Orca failure page, status client and hardened offer reader Summary

Every hosted Orca view (chat, simulator, check and page tabs, Orca terminal tabs, the Phase 65 side-panel
views) hides its pane root and shows one PowerBrowser page whose words and buttons come from one table; the
page polls chrome, recovers by Reconnect through the pane entry's `repair(offer)` or by itself after a
restart, and the Theia backend refuses an offer file that is not private or not loopback with one reason code.

## Setup

- `nix develop .#theia --command node scripts/generate.mjs` (72 files); the audited Theia install from
  docs/BUILD.md (`yarn install --ignore-scripts --frozen-lockfile` and the drivelist `node-gyp rebuild`);
  `bash scripts/fetch-orca.sh` (v1.4.248, no build, so `orca/out` is absent and the live row SKIPs).
- Orca-panes build: node theia/node_modules/typescript/bin/tsc -b theia/extensions/branding theia/extensions/token-gate theia/extensions/tab-uris theia/extensions/modes theia/extensions/orca-browser theia/extensions/orca-panes
  (recorded in `.mozbuild/p67-03/build-command.txt`, run inside `nix develop .#theia`; green after every task).
- Precondition held: branch ServerDestroyer/p67-03, `theia/extensions/orca-panes` present, five `p66-` merges.
- Path substitutions: none. `class OrcaPaneWidget` (orca-pane-widget.tsx), `class OrcaSideViewWidget`
  (side-panel/orca-side-view-widget.tsx), `new ContainerModule` (orca-panes-frontend-module.ts) and `handOff` with
  `WEB_PAIRING_FILE` (src/node/orca-panes-backend-module.ts) are all at their planned names.
- handOff's service path: `/services/powerbrowser-orca-panes` (`ORCA_PANES_SERVICE_PATH`).
- **C3-65 present, no BLOCKER:** `export async function repair(offer: string): Promise<void>` in
  `orca-overlay/files/src/renderer/src/pb/pb-session-pairing.ts:90`, re-exported by `pb-pane-mount.tsx:95`.
  It is not in `OrcaPaneBundleApi` (64 C3), so orca-hosting-status reaches it by a narrowed cast, as the side
  panel reaches its exports.
- Connection-state source: Orca's web preload in the Theia document,
  `window.api.runtimeEnvironments.onStatusChanged` and `getStatusSnapshots()` (RuntimeHostStatusSnapshot).
  `state()` carries no connection state. A refused client is visible only as `verification: 'blocked'` with
  `blockedReason: 'access-revoked'` (Orca's status owner `authenticationRejected`), so the finer
  WebRuntimeAuthFailureReason is not observable and the frontend reports `unauthorized`.
- orcad's port for `offerEndpointVerdict`: the backend has no other source; it uses the port of the web-client
  URL in the hand-off text (`offerPortOf`), which Orca builds from the same endpoint (`createWebClientUrl`).

## Tasks and commits

| Task | Commit | What |
|---|---|---|
| 1 | cd059605 | copy and button tables, status client with poll, OrcaFailurePage, mount in OrcaPaneWidget, binding, shell-error-copy Orca scope (+4 plants). Reconnect called showDetails until Task 2. |
| 2 | 2bfebfb1 | offer-file-policy.ts, hardened handOff, reconnect()/repair/automatic re-pair/client watch, OrcaBrowserHost.attach() and the two status messages, orca-offer-file (+6 plants), quick rows |
| 3 | (this commit) | page in OrcaSideViewWidget, orca-failure-page-live (+13-case self-test), quick self-test row and full block, this SUMMARY |

## Check results (lane tree)

Green: shell-error-copy-no-internals ("Orca scope -- 8 messages checked from 3 source(s)") and
`verify-shell-error-copy.mjs --self-test` (shell, 15 modes and 4 Orca plants), orca-offer-file (18 cases, decode
agreement with Orca's pinned parser on 3 samples, backend order) and orca-offer-file-self-test (6 plants),
orca-failure-page-live-self-test (13 cases), orca-failure-page-live (prints its SKIP: no built PowerBrowser),
gui04-registry-shape, gui02-web-tab-bridge (+self-test), orca-pane-routes (+self-test), orca-pane-entry
(+self-test), orca-browser-entry-points (+self-test), orca-browser-abilities, orca-browser-tab-scope,
tab-uris-typecheck, ng-027-reader-callers. The plan's acceptance one-liner on the copy table exits 0.

Red, not caused by this lane:
- **shell-request-kinds (cross-lane, mirror of p67-01's):** "Theia dispatches 'orcaStatus' / 'orcaRestart' /
  'orcaShowDiagnostics' but handleShellMessage accepts no such kind" -- p67-01's chrome cases close it on merge.
- group-channel: needs a fetched `upstream/` (environment).
- orca-offer-file's OrcaEnv half prints a named SKIP until p67-01's `ORCA_CLIENT_REASONS` is merged (checked
  against p67-01's OrcaEnv by hand: the seven offer-* reasons agree).

Lane diff gate: the plan's Task 3 diff command lists `theia/extensions/orca-browser/...` in files_modified but not
in its allow-list; run with that path added it passes (8 orca-panes/src files, 1 orca-browser file, the four
scripts and this SUMMARY).

## Merge note for the coordinator

1. **Chrome receiving side of the clearing form (apply in p67-01's files).** The frontend sends
   `{ kind: 'orcaStatus', browserHost: 'attached' }` (no clientReason) after every successful attach. On chrome
   today it is answered as a plain status read and clears nothing. Change, in
   `powerbrowser/shell/PowerBrowserAPI.sys.mjs` `handleOrcaShellMessage`, case `"orcaStatus"`, before the
   clientReason branch:

   ```js
   if (data.browserHost !== undefined) {
     if (data.browserHost !== "attached" || data.clientReason !== undefined) {
       return { ok: false, reason: "validation", message: "handleShellMessage: unknown Orca browser host state" };
     }
     OrcaService.browserHostAttached();
   } else if (data.clientReason !== undefined) {
     // existing clientReason branch, unchanged
   }
   ```

   and in `powerbrowser/shell/OrcaService.sys.mjs` beside `reportClientFailure`:

   ```js
   /** Phase 67 (P67-36, 67-03 ruling): the frontend's browser host attached; clears only a held browser-host reason. */
   browserHostAttached() {
     if (this._clientReason !== OrcaEnv.ORCA_BROWSER_HOST_REASON) {
       return false;
     }
     this._clientReason = null;
     this._pushLog("Orca browser host attached.");
     return true;
   },
   ```

   A pairing-lost client reason is never cleared by this message. Re-run ng-040-internals-catalogue-lines (lines
   inserted inside handleOrcaShellMessage shift later rows), orca-service (worth one scenario: browser-host reason
   held, then `browserHostAttached()` -> failureClass null and the "Orca browser host" row null) and
   shell-request-kinds. Until applied, the frontend already hides a chrome browser-not-attached while its own host
   is attached, so induction 5 does not depend on it; the chrome row stays until orcad's next ready line.
2. Registry: `# NEW (67-03, RUN-06/RUN-07, ...)` quick block (orca-offer-file, orca-offer-file-self-test,
   orca-failure-page-live-self-test) directly above `"allowlist-schema|check_allowlist_schema"`, and the
   `# NEW (67-03, RUN-06, P67-01, P67-29, A-7)` full block (orca-failure-page-live) as the last entry before the
   full-tier array's `)`. Both go after p67-01's blocks at each anchor.
3. Type of handOff: `OrcaPanesServiceImpl` no longer declares `implements OrcaPanesService`, because
   `orca-panes-protocol.ts` (not in this lane's files) types handOff without the refusal. The coordinator may
   widen `OrcaPanesService.handOff` to `Promise<OfferHandOff>` there and restore the `implements` clause; the
   frontend already casts to `OfferHandOff`.
4. Brand rows for the new files and identifiers (this lane does not edit inventory/brand-tokens.json): see
   "Brand rows".
5. The four Deferred Verification items of 67-CONTEXT stay owner items (page look in light and dark themes and
   button placement; the PB mark on Orca's landing tile; the protection and RUN-09 sentences; owner picks P67-17,
   P67-18, P67-19, P67-21).

## Coordinator proof commands

```sh
# the audited Theia install and rebuild on the merged tree (docs/BUILD.md), then the Gecko build if chrome changed
nix develop .#theia --command bash -c 'cd theia && yarn install --ignore-scripts --frozen-lockfile && (cd node_modules/drivelist && node-gyp rebuild) && yarn build'
nix develop .#orca --command bash scripts/build-orca.sh
# after lanes p67-01 and p67-04 are merged (p67-04 moves makeProfile out of the temporary folder)
flock /home/chris/coding/Power-Browser/.git/pb-live.lock scripts/verify-platform.sh --only orca-failure-page-live
scripts/verify-platform.sh --only shell-request-kinds
scripts/verify-platform.sh --only orca-failure-classes
scripts/verify-platform.sh --only orca-offer-file
```

## Deviations from Plan

1. **[Rule 2] Detection when no page is shown.** The plan polls only while a page is shown, but a page appears
   only after a class is known. The poll also runs until the pane bundle settles its boot (a tab restored while
   orcad fails at start), and after boot each change of Orca's client status (transport not ready) asks
   orcaStatus once. Without this, induction 1 and 2 could never show a page.
2. **[Rule 2] A refused hand-off at boot.** `OrcaPaneBundle.waitForPairing` (orca-pane-bundle.ts, not in this
   lane's files) loops on any result without `pairing`, so a refusal at document start would hang silently.
   After six ready polls without a booted bundle, orca-hosting-status asks handOff once per poll and shows
   pairing-lost with the code; a good file again clears it and the loader boots by itself.
3. **[Rule 2] lstat-to-read race (T-67-12).** handOff reads through `open(O_RDONLY | O_NOFOLLOW)` and requires
   the opened file's dev and inode to equal the judged lstat's (`readNoFollow`).
4. **[Rule 1] An absent offer file is not a refusal.** It stays `undefined` (orcad starting or stopped), so a
   normal start never shows pairing-lost; Reconnect reports offer-missing when chrome says ready and handOff
   returns nothing.
5. **[Rule 3] `implements OrcaPanesService` dropped** (merge note 3).
6. A rejected `repair(offer)` is reported as `unauthorized` (a member of the closed set; the pin gives no finer
   reason).
7. OrcaBrowserHost: `run()` split into a once-per-frontend `prepare()` and a re-callable `attach()` (shared
   while in flight); `loadHost` reuses an already loaded host module and, after a failed load, asks for
   `pb-browser-host.js?attempt=N` so the document's module map cannot replay the failure. A successful automatic
   re-pair or Reconnect also re-attaches a failed host (Phase 66's recorded gap that the host does not re-attach
   after an orcad restart).
8. OrcaPaneWidget's `onActivateRequest` searches the widget node instead of the hidden host, so the page's first
   button takes focus while the page is up.
9. The plan's Task 3 diff gate omits the orca-browser file that files_modified lists (see Check results).

## Known limits

- **A-12:** an unreadable or corrupt `orca-devices.json` answers `registry_unavailable`, which Orca's client
  retries with backoff and never reports, so it never reaches the page. No class is added.
- The auth-refusal reason the page reports is always `unauthorized` (see Setup, connection-state source).
- orca-failure-page-live is written against the merged tree and could not be run here (no built PowerBrowser or
  orca/out); its harness lines (session, CLI, registry edit, reload) are first exercised by the coordinator.

## Brand rows

`node scripts/scan-brand-residue.mjs --report .mozbuild/p67-03/brand-report.md` with the lane files staged
(exit 1, 398 reconciliation failures, all from this lane's files):

| Row | Expected (base) | Observed (lane) |
|---|---|---|
| Orca (title/coincidental) | 2322 | 2376 |
| orca (lower/coincidental) | 4751 | 4781 |
| ORCA (upper/coincidental) | 946 | 947 |
| orcad (lower/coincidental) | 1330 | 1333 |

Condition-4 occurrences (no inventory row claims them), per file and matched form, 394 in all:

| File | orca | Orca | ORCA |
|---|---|---|---|
| scripts/verify-orca-failure-page-live.mjs | 63 | 43 | 10 |
| scripts/verify-orca-offer-file.mjs | 26 | 12 | 12 |
| scripts/verify-shell-error-copy.mjs | 20 | 12 | 47 |
| theia/extensions/orca-panes/src/browser/failure/orca-failure-copy.ts | 4 | 25 | 7 |
| theia/extensions/orca-panes/src/browser/failure/orca-failure-page.tsx | 7 | 10 | 8 |
| theia/extensions/orca-panes/src/browser/failure/orca-hosting-status.ts | 32 | 34 | 8 |
| theia/extensions/orca-panes/src/node/offer-file-policy.ts | 9 | 4 | 1 |

The held-back deltas come from the edited existing files (OrcaPaneWidget, OrcaSideViewWidget, the backend
module, the orca-browser module, verify-platform.sh).

## Known Stubs

None.

## Threat Flags

None beyond the plan's register: the clearing form rides the existing orcaStatus kind behind the sender wall,
and the offer reaches only the pane entry's `repair` (T-67-12..T-67-15 as planned).

## Self-Check: PASSED

- FOUND: the four new orca-panes files, scripts/verify-orca-offer-file.mjs (313 lines),
  scripts/verify-orca-failure-page-live.mjs (446 lines)
- FOUND commits cd059605, 2bfebfb1 (ancestors of HEAD); Task 3 is the commit adding this file
- `grep -n '# NEW (67-03' scripts/verify-platform.sh` prints two lines; no `pairing=` value of 20+ characters in
  the phase directory
