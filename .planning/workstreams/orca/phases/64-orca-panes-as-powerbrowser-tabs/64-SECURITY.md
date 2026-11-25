---
phase: "64"
slug: "64-orca-panes-as-powerbrowser-tabs"
workstream: orca
milestone: v1.7
status: draft
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
threats_open_below_block_on: 3
threats_total: 40
threats_closed: 37
asvs_level: 1
block_on: high
register_authored_at_plan_time: true
auditor_verdict: OPEN_THREATS
audited_commit: e0c19c54
created: "2026-11-20"
---

# Phase 64 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.
> Phase 64: Orca panes as PowerBrowser tabs. Workstream orca, milestone v1.7. Audited 2026-11-20 at commit e0c19c54. ASVS level 1, block_on high.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| pb-panes.css and bundle in the Theia document | Orca renderer code and styles loaded into the authenticated Theia document | Stylesheet scope, React identity, pane bundle |
| /orca-panes/ static route and RPC | Theia backend serving the pane bundle and the hand-off RPC behind the token gate | Bundle files, pairing offer |
| Chrome shell to Theia backend hand-off | OrcaService writes the offer to a private bridge folder; the Theia backend reads it | Pairing offer (credential) |
| Live check harness on the host | Live scripts launch PowerBrowser, orcad and a stub agent on the developer host | Pairing values, scratch profiles, process signals |
| Lane merges and registry | Plan lane branches merged into the phase branch and registered in the verify driver | Source files, registry rows |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-64-01 (64-01) | T | pb-panes.css in the Theia document | medium | mitigate | orca-overlay/files/pb-css-scope.mjs:28-31,56-73 (S scope, root/theme/portal-self rules), :85-96 (keyframes renamed pb-orca-), :100-103 (prepended font-size resets), :112-119 (root custom properties kept, --vscode-/--theia- scoped), :133-143 (pass in generateBundle); wired at orca-overlay/files/vite.pb-panes.config.ts:20,86. Judged by scripts/verify-orca-pane-css-live.mjs:108-120 (cssVerdict: 0-diff baseline, both controls must register, portal probe, Theia values while portals open) and :80-90 (htmlVerdict, probe sheet detected first); row scripts/verify-platform.sh:6819. | closed |
| T-64-02 (64-01) | T | tracked orca/ files | medium | mitigate | scripts/build-orca-panes.sh:82-88 records orca/ tracked status, builds, FAILs on any change; :100 same for the standalone build. scripts/verify-orca-pane-entry.mjs:302-307 re-derives it against .mozbuild/orca-panes/tracked-baseline.txt. No Phase 64 commit touches orca-overlay/seams.json (git log: last edits are 68-03/68-07); the 3 seams at HEAD (010, 070, 080) are Phase 62/68's. | closed |
| T-64-03 (64-01) | D | a second React in the document | medium | mitigate | orca-overlay/files/vite.pb-panes.config.ts:34-56 (react, react-dom, react-dom/client, react/jsx-runtime resolved to virtual modules reading Symbol.for('powerbrowser.orca-panes.react'), throw if absent), :86 (active unless standalone). scripts/verify-orca-pane-entry.mjs:120 (rendererPackageName marker: standalone >=1, pb-panes 0) and :323-330 (pnpm-lock React major.minor vs Theia's). Run-time refusal: theia/extensions/orca-panes/src/browser/orca-pane-bundle.ts:79-82 (api.reactIdentity !== React throws before bootstrap). | closed |
| T-64-04 (64-01) | I | pairing values in harness output | high | mitigate | scripts/lib/orca-pane-harness.mjs:159 installOutputRedaction before scrub or any start; :170 re-installed with ready.secrets; :174 pairing held in a local; :193-194 withPairing(f) never returns it; :202 passed only inside a BiDi expression; CLI output redacted (:178-179, :226-227). scripts/lib/orca-run.mjs:148-169 routes stdout/stderr through redact. The standalone report (scripts/verify-orca-pane-standalone-live.mjs:521) carries pairing state booleans only (orca-overlay/files/src/renderer/src/pb/pb-session-pairing.ts:42-47). | closed |
| T-64-05 (64-01) | D | live runs on this host | medium | mitigate | Present in code: ORCA_* and Node-variable scrub scripts/lib/orca-pane-harness.mjs:50-54,160; scratch profile .mozbuild/orca-pane-harness (:39, :89) and alias under XDG_RUNTIME_DIR or ~/.cache (:44); signals only to recorded pid+start-ticks identities (:220, :238-242) and its own orcad child (stopOrcad :244-246). Absent: the live lock. scripts/verify-orca-pane-standalone-live.mjs and scripts/verify-orca-pane-css-live.mjs take no lock (header comments only, :48 and :45); their rows scripts/verify-platform.sh:6811 and :6819 are plain node invocations and the driver contains no flock outside comments, so a full-tier verify-platform.sh run executes them unlocked. Later-phase live scripts self-lock (scripts/verify-orca-failure-page-live.mjs:539-542, PB_LIVE_LOCK_HELD re-exec); these do not. Below block_on (non-blocking). | open — below high threshold (non-blocking) |
| T-64-SC (64-01) | T | npm/pip/cargo installs | high | mitigate | No dependency added: theia/yarn.lock last changed in 2700e4c3 (19-05, 2026-10-17); the pass imports Orca's own postcss (orca-overlay/files/pb-css-scope.mjs:23) and the config Orca's own vite (vite.pb-panes.config.ts:18); scripts/build-orca-panes.sh has no install step; Orca's install stays pnpm --frozen-lockfile --ignore-scripts (scripts/build-orca.sh:194, :202). | closed |
| T-64-06 (64-02) | T | static route /orca-panes/ | high | mitigate | theia/extensions/orca-panes/src/node/orca-panes-backend-module.ts:94-101 resolveInside refuses empty, leading '/', absolute, backslash, NUL and any '..' segment; :235 decodeURIComponent before the check; :242 realpath; :246 404 unless realpath is under the root realpath plus separator and a regular file; :251 sendFile with root. The root itself is the realpath of a private-file-checked orca-panes-dir (:208-223, readBridgeFile :120-131). Persistent live check: scripts/verify-orca-tabs-live.mjs:727-732 (..%2f and //etc/passwd must 404), verdict :387-393. The plan's one-time Task 1 Node fixture run is not a registered row. | closed |
| T-64-07 (64-02) | S | static route and RPC outside the token gate | high | mitigate | Route in configure(app): orca-panes-backend-module.ts:225-253. Token gate front-inserts via earlyMiddleware.handlers.unshift (theia/extensions/token-gate/src/node/token-gate-backend-contribution.ts:83); gate() returns 403 without a valid cookie or from another origin (:150-170). RPC is a JsonRpcConnectionHandler at /services/powerbrowser-orca-panes (orca-panes-backend-module.ts:259-261) over Theia's websocket, whose upgrade requires the cookie (token-gate-backend-contribution.ts:198-206). Live: scripts/verify-orca-tabs-live.mjs:728 requests pb-panes.js with no cookie, red at :389 if served. | closed |
| T-64-08 (64-02) | I | handOff and the loader | high | mitigate | handOff lstat-checks the folder (privateDirVerdict, owner and no group/other bit: orca-panes-backend-module.ts:57-70, :160-167) and the offer file (offerFileVerdict: not a symlink, regular, owner, no group/other bit: theia/extensions/orca-panes/src/node/offer-file-policy.ts:49-69), reads with O_NOFOLLOW and inode match (:106-117), returns { pairing } only through the JSON-RPC handler (:259-261); log lines are fixed text or reason codes (:146-151, :202-205). Frontend holds it in a local (orca-pane-bundle.ts:74-92); bootstrap errors name the step only (orca-overlay/files/src/renderer/src/pb/pb-pane-mount.tsx:649-655); saved sessionOnly (pb-session-pairing.ts:95) and boot refuses otherwise (pb-pane-mount.tsx:673). The file rule is 'no group/other bit' rather than exactly 0600, equal for confidentiality. | closed |
| T-64-09 (64-02) | E | a script from a port another process can bind | high | mitigate | theia/extensions/orca-panes/src/browser/orca-pane-bundle.ts:113 and :135 resolve the stylesheet and entry as new URL('/orca-panes/' + file, document.baseURI), the Theia document's own origin; prefix theia/extensions/orca-panes/src/common/orca-panes-protocol.ts:19, served by the Theia backend (orca-panes-backend-module.ts:227). No orcad-port URL is used for the bundle. | closed |
| T-64-10 (64-02) | D | a Lumino close ending a running agent | medium | mitigate | theia/extensions/orca-panes/src/browser/orca-pane-widget.tsx:159-171 onCloseRequest only calls bundle closePane (page tabs with no Orca tab dispose directly); :174-176 disposeFromStore. closePane uses Orca's createWorkspaceTabCloseCommands(...).closeItem or requestActiveTerminalPaneClose with no skip or force flag (orca-overlay/files/src/renderer/src/pb/pb-pane-mount.tsx:990-1006; grep for skipRunningProcessConfirm/force in the entry: none). | closed |
| T-64-11 (64-02) | D | the mirror freeze (A4) | medium | mitigate | scripts/verify-orca-pane-routes.mjs:84-85, :400-413 clause (f) over every orca-panes source and every orca-overlay/files source (imports of terminal-tab-create, web-runtime-terminal-creation, web-runtime-terminal-create-operation, and the method string); plant :481; row scripts/verify-platform.sh:3991. New Orca Terminal calls api.createTerminal (theia/extensions/orca-panes/src/browser/orca-panes-frontend-module.ts:123), which issues callRuntimeResult('terminal.create') (pb-pane-mount.tsx:1010-1012). | closed |
| T-64-12 (64-02) | E | Orca code in the authenticated document | medium | accept | Acceptance documented: 64-02-PLAN.md threat register row T-64-12; .planning/workstreams/orca/phases/64-orca-panes-as-powerbrowser-tabs/64-CONTEXT.md:49, :200 (owner item with Route B' as the recorded alternative), :215; .planning/workstreams/orca/STATE.md:174 Phase 64 Deferred Verification row lists 'owner item T-61-04 (P64-07)' for the end-of-milestone pass. | closed |
| T-64-SC (64-02) | T | npm/pip/cargo installs | high | mitigate | theia/extensions/orca-panes/package.json depends only on @theia/core 1.76.0 and workspace @powerbrowser/* packages (modes and orca-browser were added by later phases, also workspace members); theia/yarn.lock unchanged since 2700e4c3 (2026-10-17), so no lock entry was added. | closed |
| T-64-13 (64-03) | I | the offer in chrome | high | mitigate | powerbrowser/shell/OrcaEnv.sys.mjs:216-228 readyLineOffer; :323-352 createOutputSink calls onOffer once then empties the buffer (:343-350); parseReadyLine returns three fields only (:189-209). powerbrowser/shell/OrcaService.sys.mjs:441-446 offer held in one local; :529-530 handed to _writeHandOff then nulled; :546-556 one writePrivateFile; getState (:699-714) and diagnostics carry no offer. Scenario J (64-03's scenario I, re-lettered at merge under 64-05 rule 6) scripts/verify-orca-service.mjs:634-675 checks write order and canary absence from log, console, getState, diagnostics and parseReadyLine; plants :1130-1132; row scripts/verify-platform.sh:3903. | closed |
| T-64-14 (64-03) | T | web-pairing and orca-panes-dir | medium | mitigate | powerbrowser/shell/PowerBrowserAPI.sys.mjs:11071-11088 writePrivateFile: single-segment name rule :11072-11074, folder 0700 :11076-11079, stale .tmp removed then exclusive create set 0600 before any byte :11081-11086, move :11087. Backend refuses group/other bits or another owner (orca-panes-backend-module.ts:57-86; offer-file-policy.ts:49-69). Removed on stop: OrcaService.sys.mjs:630-636; scenario J 'not removed' verify-orca-service.mjs:667-670, plants :1122, :1134. | closed |
| T-64-15 (64-03) | E | the mode switch path | low | mitigate | theia/extensions/modes/src/browser/mode-descriptors.ts:55-63: the orca descriptor has no onActivate/onDeactivate (the hooks at :45-46 belong to organising); row gui07-mode-switch-tabs-invariant scripts/verify-platform.sh:4477. | closed |
| T-64-SC (64-03) | T | npm/pip/cargo installs | high | mitigate | No package added; theia/yarn.lock unchanged since 2700e4c3; the lane diff is source files only (re-derived scope check: the one extra path is a one-line table entry in address-bar-mode-table.ts). | closed |
| T-64-16 (64-04) | I | offer in check output | high | mitigate | scripts/lib/orca-tabs-live.mjs:204 installOutputRedaction before any other step; offerFromFile :276-282 keeps the value in memory and adds it to the redaction secrets; stage (m) scripts/verify-orca-tabs-live.mjs:734-745 compares with includes() and records place names only; offerVerdict :396-399 carries no value. A grep of the Phase 64 SUMMARY files for #pairing=, orca://pair? and token-length strings finds none. | closed |
| T-64-17 (64-04) | D | live sessions on this host | medium | mitigate | Present in code: ORCA_* and Node names deleted before launch (scripts/lib/orca-tabs-live.mjs:146-147, :212); scratch repo and profile under mkdtemp (:208-209), removed at teardown (:337); stub agent in its own mkdtemp directory prepended to PATH for the session only (:111-117, :225-227), never on the Orca CLI's PATH (:307-308); signals only to recorded pid+start-ticks identities (:217, :334-336). Absent: the live lock. scripts/verify-orca-tabs-live.mjs (:103) and scripts/verify-orca-terminal-keys-live.mjs (:94) state it only as a header comment; verify-uri-roundtrip.mjs and verify-mode-switch-tabs-live.mjs do not mention it; rows scripts/verify-platform.sh:6834, :6840, :6438 are plain node invocations and the driver takes no lock. Below block_on (non-blocking). | open — below high threshold (non-blocking) |
| T-64-18 (64-04) | S | the second paired client | low | accept | Acceptance documented in 64-04-PLAN.md threat register row T-64-18. Supporting facts at HEAD: the second client loads orcad's address without the pairing fragment and pairs in page memory (scripts/verify-orca-tabs-live.mjs:771-776) and is closed at teardown (:747). | closed |
| T-64-SC (64-04) | T | npm/pip/cargo installs | high | mitigate | Import specifiers of scripts/lib/orca-tabs-live.mjs, scripts/verify-orca-tabs-live.mjs, scripts/verify-orca-terminal-keys.mjs and scripts/verify-orca-terminal-keys-live.mjs are node: built-ins and repo-relative modules only (TypeScript read from the existing theia/node_modules); no package.json or lockfile change. | closed |
| T-64-19 (64-05) | T | lane merges | high | mitigate | Merge commits 277cceb6, 0ce4107e, d1d04e4b, 36527207 have as second parents exactly the heads of refs/heads/ServerDestroyer/p64-01..04 (70159c83, dfd75c6e, f29bf18b, 910749bf). Re-derived scope check (merge-base..lane head vs each plan's files_modified): p64-01, p64-02 and p64-04 none outside; p64-03 one path, theia/extensions/chrome-bar/src/browser/address-bar/address-bar-mode-table.ts (48136628, one line orca: 'address'), surfaced and recorded as an accepted deviation in 64-05-SUMMARY 'Merges and scope checks'. No lane SUMMARY holds a line starting 'BLOCKER:' (0 in each). Registry blocks in the fixed order (scripts/verify-platform.sh:3925-3998, :6778-6820). | closed |
| T-64-20 (64-05) | D | live rows on this host | medium | mitigate | Scrub, scratch profiles and repos, and identity-only signals are in the shared session code (scripts/lib/orca-pane-harness.mjs:50-54, :159-246; scripts/lib/orca-tabs-live.mjs:204-340). No Phase 64 live row takes pb-live.lock itself: scripts/verify-platform.sh:6438, :6811, :6819, :6834, :6840 are plain node invocations and the driver has no flock outside comments. The coordinator's use of the lock is recorded only in 64-05-SUMMARY and 64-06-SUMMARY. Same gap as 64-01 T-64-05 and 64-04 T-64-17. Below block_on (non-blocking). | open — below high threshold (non-blocking) |
| T-64-21 (64-05) | T | inventory/brand-tokens.json | medium | mitigate | inventory/brand-tokens.json scope.exclude is unchanged by the Phase 64 brand commits 2e30f508 and 63da170c (no exclude line in either diff) and names no orca-panes or orca-overlay path; verify-orca-tabs-live.mjs appears in measured rows (18 occurrences). | closed |
| T-64-22 (64-05) | I | live output and the SUMMARY | high | mitigate | Every Phase 64 live script runs inside a session that installs redaction first: scripts/verify-orca-tabs-live.mjs:442, scripts/verify-orca-terminal-keys-live.mjs:819, scripts/verify-uri-roundtrip.mjs:541, scripts/verify-mode-switch-tabs-live.mjs:617 (withOrcaTabsSession, scripts/lib/orca-tabs-live.mjs:204); scripts/verify-orca-pane-css-live.mjs:430 and scripts/verify-orca-pane-standalone-live.mjs:450 (withOrcaPaneSession, scripts/lib/orca-pane-harness.mjs:159); scripts/lib/orca-run.mjs:158-169 wraps stdout and stderr. The Phase 64 SUMMARYs contain no pairing pattern (grep). | closed |
| T-64-SC (64-05) | T | npm/pip/cargo installs | high | mitigate | Wiring adds only the workspace package (theia/applications/browser/package.json @powerbrowser/orca-panes 0.1.0); theia/yarn.lock unchanged since 2700e4c3; Orca install pnpm --frozen-lockfile --ignore-scripts (scripts/build-orca.sh:194, :202). | closed |
| T-64-23 (64-06) | T | pb-pane-mount.tsx terminal-first override (C13) | medium | mitigate | orca-overlay/files/src/renderer/src/pb/pb-pane-mount.tsx:593, :607-631 hostedTerminalKeys applies 'terminal-first' with useAppStore.setState only and re-applies from useAppStore.subscribe, called in bootstrap :678; no updateSettings or persist call in orca-overlay/files/src/renderer/src/pb (grep). scripts/verify-orca-terminal-keys.mjs:123, :503 red on any Orca write action in the entry; :511-523 the literal must be a TerminalShortcutPolicy member and differ from normalizeTerminalShortcutPolicy's fallback; plants :827, :833; row scripts/verify-platform.sh:4013. | closed |
| T-64-24 (64-06) | I | orca-tabs-live real-agent session | medium | mitigate | Fixed prompt MINIMAL_PROMPT scripts/verify-orca-tabs-live.mjs:126; counter :441 with send-once guard :559-560; pure budget verdict promptBudgetVerdict :224-226 applied at :576, :663. SDK directory read by sdkDirIn, which returns two booleans only (scripts/lib/orca-tabs-live.mjs:133-143). Scratch repository with a fixture README (:309-314); redaction first (:204). | closed |
| T-64-25 (64-06) | D | Ctrl+Shift+W on a busy hosted terminal | medium | mitigate | theia/extensions/chrome-bar/src/browser/chrome-bar-keybindings.ts:78 ctrl+shift+w bound to CommonCommands.CLOSE_TAB.id with no when clause; widget.close() reaches OrcaPaneWidget.onCloseRequest, which calls closePane (orca-pane-widget.tsx:159-171). Stage 2 requires dispose or Orca's running-terminal confirmation (scripts/verify-orca-terminal-keys-live.mjs:258, :900-907); plant :1052. | closed |
| T-64-26 (64-06) | I | the worktree quick pick | low | accept | Acceptance documented in 64-06-PLAN.md threat register row T-64-26. At HEAD the pick items carry label and path only; the id is kept off-screen (theia/extensions/orca-panes/src/browser/orca-panes-frontend-module.ts:112-113). The placeholder strings are listed for owner review in .planning/workstreams/orca/STATE.md:174. | closed |
| T-64-27 (64-06) | I | OrcaService stop | low | mitigate | powerbrowser/shell/OrcaService.sys.mjs:627-636 removes orcad-data-root, web-pairing and orca-panes-dir before listProcessTree and killProcess (:648); order clause scripts/verify-orca-service.mjs:664-673; plant 'bridge files removed after orcad is signalled' :1123. | closed |
| T-64-28 (64-06) | I | live output and the SUMMARY | high | mitigate | Redaction installed first in both session libraries (scripts/lib/orca-tabs-live.mjs:204; scripts/lib/orca-pane-harness.mjs:159, :170); the offer and pairing input join the secrets list (orca-tabs-live.mjs:276-298); sdkDirIn never returns the environment value (:133-143). A grep of 64-06-SUMMARY.md and the other Phase 64 SUMMARYs finds no pairing URL, offer or token-length string. | closed |
| T-64-SC (64-06) | T | npm/pip/cargo installs | high | mitigate | No package added; theia/yarn.lock unchanged since 2700e4c3; the Orca rebuild path is build-orca.sh --panes-only (scripts/build-orca.sh:148-155), which runs no install. | closed |
| Threat flag (64-01-SUMMARY.md) | — | None beyond the register; the harness's loopback server sends Access-Control-Allow-Origin: * for the lane-build cross-origin module import; the pairing never leaves memory | — | — | Mapped threat: NONE. Unregistered surface (WARNING only), test harness, no product code. scripts/lib/orca-pane-harness.mjs:141 binds 127.0.0.1 only; :128 sets ACAO *; it serves only /standalone.html (static text, no credential, :99-105) and two build-output directories, with containment (:124, :131-138). The pairing reaches a page only inside a BiDi evaluate (:193-194, :202). The pairing claim maps to 64-01:T-64-04 (CLOSED). | closed |
| Threat flag (64-02-SUMMARY.md) | — | None beyond the register: T-64-06, T-64-07, T-64-08 and T-64-11 implemented as specified | — | — | Mapped threats: 64-02:T-64-06, 64-02:T-64-07, 64-02:T-64-08, 64-02:T-64-11. All four verified at HEAD: orca-panes-backend-module.ts:94-101, :225-253 and token-gate-backend-contribution.ts:83, :198-206; offer-file-policy.ts:49-69; verify-orca-pane-routes.mjs:400-413. | closed |
| Threat flag (64-03-SUMMARY.md) | — | None beyond the register; T-64-13 mitigated by scenario I and its plants | — | — | Mapped threat: 64-03:T-64-13. Scenario I is scenario J at HEAD (re-lettered at merge): scripts/verify-orca-service.mjs:634-675, plants :1130-1132; OrcaEnv.sys.mjs:323-352; OrcaService.sys.mjs:441-446, :529-556. | closed |
| Threat flag (64-04-SUMMARY.md) | — | None; checks add no product surface; offer kept in memory, redaction first, stub agent in a scratch directory on the launched PowerBrowser's PATH only, signals only to recorded identities | — | — | Mapped threats: 64-04:T-64-16, 64-04:T-64-17. Each claim verified: scripts/lib/orca-tabs-live.mjs:204, :276-282, :111-117, :225-227, :307-308, :334-336. The flag does not claim the live lock; that component of T-64-17 is OPEN (see the register). | closed |
| Threat flag (64-05-SUMMARY.md) | — | threat_flag: credential-at-rest (powerbrowser/shell/OrcaService.sys.mjs): a quit left web-pairing in the 0700 bridge folder; fixed by removing it first on stop (8e590e08) | — | — | Mapped threats: 64-03:T-64-14, 64-06:T-64-27. powerbrowser/shell/OrcaService.sys.mjs:627-636 removes orcad-data-root, web-pairing and orca-panes-dir before the kill (:648); order clause scripts/verify-orca-service.mjs:664-673 and plant :1123. 64-06-SUMMARY records pre-fix leftovers (53 orcad-data-root, 1 web-pairing, 1 orca-panes-dir) still in /run/user/1000 bridge folders, from dead orcads; operational cleanup, not a code gap. | closed |
| Threat flag (64-06-SUMMARY.md) | — | None beyond the register: T-64-23 (in-memory policy, no write action, statically checked), T-64-24 (no prompt spent; SDK presence only), T-64-27 (stop order, plant, bridge comparison) | — | — | Mapped threats: 64-06:T-64-23, 64-06:T-64-24, 64-06:T-64-27. pb-pane-mount.tsx:607-631 and verify-orca-terminal-keys.mjs:123, :503; verify-orca-tabs-live.mjs:224-226, :559-560 and orca-tabs-live.mjs:133-143; OrcaService.sys.mjs:627-636 and verify-orca-service.mjs:664-673. | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on (high) count toward blocking.*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*
*Register authored at plan time (six PLAN threat_model blocks: 34 entries, 28 distinct IDs plus a T-64-SC row in each plan), plus 6 threat flags from the SUMMARY files. Totals: 40 threats, 37 closed, 3 open.*

---

## Escalations

None.

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-64-01 | T-64-12 (64-02), medium, Orca code in the authenticated document | Acceptance documented: 64-02-PLAN.md threat register row T-64-12; .planning/workstreams/orca/phases/64-orca-panes-as-powerbrowser-tabs/64-CONTEXT.md:49, :200 (owner item with Route B' as the recorded alternative), :215; .planning/workstreams/orca/STATE.md:174 Phase 64 Deferred Verification row lists 'owner item T-61-04 (P64-07)' for the end-of-milestone pass. | Plan register row (64-02-PLAN.md); owner item deferred to end-of-milestone pass | 2026-11-20 |
| AR-64-02 | T-64-18 (64-04), low, the second paired client | Acceptance documented in 64-04-PLAN.md threat register row T-64-18. Supporting facts at HEAD: the second client loads orcad's address without the pairing fragment and pairs in page memory (scripts/verify-orca-tabs-live.mjs:771-776) and is closed at teardown (:747). | Plan register row (64-04-PLAN.md) | 2026-11-20 |
| AR-64-03 | T-64-26 (64-06), low, the worktree quick pick | Acceptance documented in 64-06-PLAN.md threat register row T-64-26. At HEAD the pick items carry label and path only; the id is kept off-screen (theia/extensions/orca-panes/src/browser/orca-panes-frontend-module.ts:112-113). The placeholder strings are listed for owner review in .planning/workstreams/orca/STATE.md:174. | Plan register row (64-06-PLAN.md) | 2026-11-20 |

*Accepted risks do not resurface in future audit runs. The three OPEN threats (T-64-05, T-64-17, T-64-20) are not accepted risks; they stay OPEN in the register for the owner to triage.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-11-20 | 40 | 37 | 3 | security auditor agent (commit e0c19c54; verdict OPEN_THREATS) |

Auditor notes:

Phase 64, ASVS L1, block_on high. The register was built from six PLAN threat_model blocks: 34 entries (28 distinct IDs plus a T-64-SC row in each plan). Result: 31 CLOSED, 3 OPEN among plan threats; with the 6 closed threat flags the totals are 37 closed, 3 open. Blocking open threats (at or above high) = 0, because all three open entries are medium, below the high threshold. No plan is a superseded stub. 64-04 ports code from the superseded p63-02/p63-05 branches, but its own register is judged against its own implementation.

OPEN, non-blocking (medium): 64-01 T-64-05, 64-04 T-64-17, 64-05 T-64-20. All three have one gap, the pb-live.lock live lock:
- The other parts of these mitigations are in code: ORCA_* scrub, scratch profiles and repos, the stub agent scoped to the session PATH, and signals only to recorded pid+start-ticks identities.
- No Phase 64 live script takes the lock. Their registry rows (scripts/verify-platform.sh:6438, 6811, 6819, 6834, 6840) are plain node invocations, and the driver has no flock outside comments. A full-tier verify-platform.sh run therefore executes them unlocked.
- The lock exists only as header and registry comments, and in the SUMMARYs' record of how the coordinator ran them.
- Two ways to close it: (a) give each Phase 64 live script the self-locking re-exec that later phases use (PB_LIVE_LOCK_HELD, as in scripts/verify-orca-failure-page-live.mjs:539-542); or (b) record the lock as a procedural control in SECURITY.md's accepted-risks log.

Accept dispositions (T-64-12, T-64-18, T-64-26) are CLOSED on their plan register rows. T-64-12 is also documented in 64-CONTEXT.md:49/200/215 and STATE.md:174.

Things found at HEAD that differ from the plan text but still satisfy the mitigations:
- The backend now includes Phase 67 hardening (offer-file-policy.ts: symlink refusal, O_NOFOLLOW read with inode match, endpoint verdict). The offer file rule is 'owner and no group/other bit' rather than exactly 0600, which gives the same confidentiality.
- 64-03's scenario I is scenario J since the merge.
- The orca descriptor now opens Phase 65 view containers but still has no activation hook.
- HEAD carries 3 Orca seams, all from Phase 62/68. Phase 64 added none.

T-64-19 holds, but with one recorded exception: p64-03 merged with one path outside its files_modified (a one-line address-bar table entry, 48136628). The derived scope check surfaced it, and 64-05-SUMMARY records it as an accepted deviation.

One unregistered flag (WARNING only): the 64-01 test harness's loopback HTTP server sends Access-Control-Allow-Origin: *. It serves only build output and a static page with no credential.

No implementation file was modified and nothing was written by the auditor.

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [ ] `threats_open: 0` confirmed (3 open, medium, non-blocking)
- [ ] `status: verified` set in frontmatter

**Approval:** pending
