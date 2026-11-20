---
phase: "65"
slug: "65-orca-workspace-in-theia"
workstream: orca
milestone: v1.7
status: draft
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
threats_open_below_block_on: 1
threats_total: 27
threats_closed: 26
asvs_level: 1
block_on: high
register_authored_at_plan_time: true
auditor_verdict: OPEN_THREATS
audited_commit: e0c19c54
created: "2026-11-20"
---

# Phase 65 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.
> Phase 65: Orca workspace in Theia. Workstream orca, milestone v1.7. Audited 2026-11-20 at commit e0c19c54.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Orca renderer in the authenticated Theia origin | Orca pane code and side-panel views run in the Theia page under the 65-01 trust boundary | Pairing offer, session-only device key state |
| Theia frontend to git backend | The orca-workspace resolver asks a Node backend to read blobs from owned roots | Path and revision specs, file contents |
| Orca side-panel views to the network | Orca favicon and similar hosts resolved after the Orca-mode marker | Outbound requests, host names |
| Live verification rows to the host | Live rows launch processes and write scratch data on the developer host | Environment variables, scratch profiles, worktree directories |
| Lane merges | Four lane heads merged onto the prelaunch reconciliation commit | Source files per plan files_modified |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-65-01 | I | pb-session-pairing.ts, harness output | high | mitigate | orca-overlay/files/src/renderer/src/pb/pb-session-pairing.ts:65-67 (errors are 'orca pane pairing: <reason word>'), :73-99 (the file has no console call; the offer only reaches parseWebPairingInput; lastPaired keeps deviceToken '' at :98), :42-47 (pairingState reports sessionOnly and deviceKeySupport only). orca-overlay/files/src/renderer/src/pb/pb-pane-mount.tsx:648-655 (step errors carry the step name and error class only); :130 and :147 (only repair is re-exported; pairingInputOf, which returns the offer to its internal caller, is not an entry export). scripts/lib/orca-pane-harness.mjs:159,170 (output redaction installed with orcad's secrets), :193-194 (withPairing never returns or logs the value). Stored sinks are proven by the p65-04 scanner scripts/lib/orca-offer-scan.mjs:166-197 (see T-65-12). | closed |
| T-65-02 | S | Orca device key in the Theia origin (P65-17) | high | mitigate | orca-overlay/files/src/renderer/src/pb/pb-pane-mount.tsx:670-673 (presetSessionOnly() runs immediately before initWebDeviceKeySupport, then pairing, then a reject with 'session-only pairing unavailable' before installWebPreloadApi at :674). pb-session-pairing.ts:32-34 (setWebDeviceKeySupportForTests('session-no-ed25519')), :37-39 (assertSessionOnly checks both the support and readStoredWebRuntimeEnvironment()?.sessionOnly), :95 (saved with sessionOnly true), :107-111 (repair re-asserts). scripts/verify-orca-pane-standalone-live.mjs:361-364 (marker key written and read back, then orca.web.runtimeEnvironment.v1 read), :143-146 (collector-blind verdict first, then the session-only and key-absent verdicts), self-test :579-581. | closed |
| T-65-03 | T | orca-overlay | medium | mitigate | git diff fd1062aa..HEAD -- orca-overlay/seams.json orca-overlay/patches is empty. Phase 65's orca-overlay diff is only the four pb/*.ts(x) overlay files. Marker literals are at pb-side-mounts.tsx:35, pb-workspace-api.ts:14 and pb-session-pairing.ts:24, referenced through PB_OVERLAY_BUILD at pb-pane-mount.tsx:152-156. No overlay file imports EditorPanel or EditorContent. Clause h is scripts/verify-orca-pane-entry.mjs:76,390, with plants at :573-574. Registry rows: scripts/verify-platform.sh:3892 (orca-overlay), :6756 (orca-overlay-built), :6810 (orca-pane-entry). | closed |
| T-65-SC | T | npm/pip/cargo installs (plan 65-01) | high | mitigate | git diff --quiet on theia/yarn.lock is clean for fd1062aa..ffc48715 (the Phase 65 range) and for fd1062aa..HEAD. No orca-overlay manifest or lockfile changed in the phase. scripts/build-orca.sh:194 and :202 run pnpm install --frozen-lockfile --ignore-scripts. | closed |
| T-65-04 | I | pb-orca-git resolver and backend | high | mitigate | theia/extensions/orca-workspace/src/common/orca-git-protocol.ts:23-38 (specRefusal: empty path, leading '/', leading '-', backslash, NUL/CR/LF, and empty, '.' or '..' segments; rev must be 40/64 lower hex, :0-:3 or empty), :61-70 (validateRoot: absolute, realpath-equal, equal to rev-parse --show-toplevel). The backend re-validates both at src/node/orca-workspace-backend-module.ts:56 and :68. The frontend resolver src/browser/orca-git-resource.ts:55-71 accepts a path only under a persisted PB-owned root (ORCA_OWNED_ROOTS_KEY) and re-checks the grammar. Self-test plants are scripts/verify-orca-editor-routes.mjs:381-399 (17 refused specs) and :446-450 (subdirectory, relative and symlink roots). Notes: (1) the frontend trust set is broader than the plan states, because it also includes the live store's local roots (orca-git-resource.ts:58, orca-root-sync.ts:131-133); (2) the frontend out-of-root refusal (rootOf no hit) has no self-test plant. The backend validation still covers both paths. | closed |
| T-65-05 | E | git invocation | high | mitigate | orca-workspace-backend-module.ts:27-33: execFile('git', args, ...) with no shell option and env withoutGitVars(process.env). orca-git-protocol.ts:46: argv ['-c','core.fsmonitor=false','-C',root,'cat-file','blob','--',`${rev}:${path}`], with no --textconv or --filters. :19-20 and :24: rev is hex or ':N', so the spec begins with hex or ':'. :43-44: the empty side never runs git. :50-52: GIT_* removed in any case. rev-parse calls also set core.fsmonitor=false (backend :47, :71). Self-test: scripts/verify-orca-editor-routes.mjs:412-417 and :443-452 (GIT_DIR planted in the environment). | closed |
| T-65-06 | D | backend reads | medium | mitigate | orca-git-protocol.ts:16-17 (ORCA_GIT_MAX_BYTES 50 MB, ORCA_GIT_TIMEOUT_MS 10000). orca-workspace-backend-module.ts:30-31 (maxBuffer and timeout on execFile), :39 (too-large and timeout reason words), :77-80 (one console.warn line naming the reason only). | closed |
| T-65-07 | T | close sync and store-drop close | high | mitigate | theia/extensions/orca-workspace/src/browser/orca-editor-routes.ts:309-316 (an Orca-side close calls releaseIfOrphan), :330-341 (dispose only when !Saveable.isDirty), :366-391 (closeCleanUnder skips dirty widgets on a worktree drop). Live planted case: scripts/verify-orca-workspace-live.mjs:412-429 (dirty fixture, blind-fixture guard at :424), closeVerdict at :90-91, self-test :135-136. | closed |
| T-65-08 | T | root sync | medium | mitigate | theia/extensions/orca-workspace/src/browser/orca-root-sync.ts:62-77 (planRoots removes only roots in the owned set; add skips existing user roots and user-removed roots), :81-85 (noteUserRemovals moves a missing owned root to userRemoved), :187-209 (apply, then persist both sets). Live clauses: scripts/verify-orca-workspace-live.mjs:398-438 (a user root survives; a user removal stays removed at :438). Self-test :152-164. | closed |
| T-65-SC | T | npm/pip/cargo installs (plan 65-02) | high | mitigate | theia/extensions/orca-workspace/package.json (new) depends only on @powerbrowser/* 0.1.0 and @theia/{core,editor,editor-preview,filesystem,scm,workspace} 1.76.0, each already present in theia/yarn.lock. theia/yarn.lock is unchanged for fd1062aa..ffc48715 and for fd1062aa..HEAD (git diff --quiet). | closed |
| T-65-09 | I | Orca side-panel views (egress) | medium | mitigate | scripts/verify-orca-side-panel-live.mjs:155-156 (pb-egress-control.invalid control and the user-action marker), :345-354 (egressVerdict: 'collector blind' without the control; any unlisted host is red), :818-823 (clause i against powerbrowser/endpoint-allowlist.json), self-test :884-895. The implementation gives hosts first resolved after the Orca-mode marker the user-action verdict, which P65-24 provides for (65-CONTEXT.md:67, 65-05-PLAN.md:37). Measured user-initiated rows are t0-t3.gstatic.com at endpoint-allowlist.json:149-168. One residual case is not exercised by the row: launching straight into the Orca mode contacts the favicon hosts without a click. The owner accepted it in D-41 (.planning/workstreams/orca/DECISIONS.md:414; END-OF-MILESTONE-CHECKLIST.md:24). | closed |
| T-65-10 | T | PB contributions | medium | mitigate | scripts/verify-orca-no-pb-add-project.mjs:198-213: vocabulary derived from Orca's sidebar, the PB contribution set derived from the tree, 'source moved' on an empty vocabulary (:203), 'parser blind' when no orca-panes label is parsed (:205), and any intersection red (:208-211). Plants: :250-290. Registry: scripts/verify-platform.sh:4037-4038. | closed |
| T-65-11 | T | Orca stylesheet and portals | low | mitigate | theia/extensions/orca-panes/src/browser/side-panel/orca-side-view-widget.tsx:80 sets data-pb-orca-pane on the side view node. Side-panel and Add-project dialog probes: scripts/verify-orca-pane-css-live.mjs:36-40, :120, :266 and :342-415, run after both controls register. | closed |
| T-65-SC | T | npm/pip/cargo installs (plan 65-03) | high | mitigate | In the phase, theia/extensions/orca-panes/package.json gains only @powerbrowser/modes 0.1.0, a workspace package. theia/yarn.lock is unchanged for fd1062aa..ffc48715 and ..HEAD. No external package was added. | closed |
| T-65-12 | I | Setups, shell state, Theia origin storage | high | mitigate | scripts/lib/orca-offer-scan.mjs:42-45 (sinks setups.json and powerbrowser-shell-state.json), :82-116 (ten needle forms derived from the hand-off text; throws 'needle form not derivable'), :136-159 (each 127.0.0.1 origin's localStorage key column, read through node:sqlite on a copy), :166-189 (red on zero sinks read, red 'collector blind' without the marker, red when the runtime key is present). scripts/verify-orca-offer-scan.mjs:122-139 (an offer planted in every sink and encoding, plus the key-probe plants), :155-186 (live run; both sinks must be read, :182). Registry: verify-platform.sh:4048 and :6865. | closed |
| T-65-13 | S | pb-orca: names across relaunches and reloads | medium | mitigate | theia/extensions/orca-panes/src/browser/restore/orca-pane-name-map.ts:85-88 (reservedNames returns live and tombstoned names) feeds planPanes' taken set at orca-pane-routes.ts:116 and :148. Name map :109-122 (markGone tombstones), :124-135 (prune drops only tombstones no Setup or session names), :202-206 (a tombstone or unknown name opens nothing). orca-pane-observer.ts:44-45 (15000 ms hold), :113-141 (restored widgets held, then adopted by key), :216-223. Relaunch row: scripts/verify-orca-relaunch-restore-live.mjs:126-131 (identityVerdict name -> key), :466, :497. | closed |
| T-65-14 | I | scanner and live-row output | high | mitigate | scripts/lib/orca-offer-scan.mjs:182-188 (verdicts name sinks, forms and counts only), :191-197 (formatScan). scripts/verify-orca-offer-scan.mjs:91 and :141-143: the self-test fails on any needle form found in the scanner output. Relaunch row redaction: scripts/verify-orca-relaunch-restore-live.mjs:231-233 and :296-303 (the offer is added to the redaction list and never printed). | closed |
| T-65-15 | I | orca-devices.json | medium | mitigate | scripts/verify-orca-relaunch-restore-live.mjs:193-202 (deviceRowsOf keeps only credentialKind, ephemeral and lastSeenAt; self-test :577), :400-403 (read only), :177-184 (row-growth verdict). The file never writes orca-devices.json; its only writeFileSync calls write the scratch README at :321 and :440. Growth is recorded for Phase 67 at 65-01-SUMMARY.md:165 and 65-05-SUMMARY.md:327. | closed |
| T-65-SC | T | npm/pip/cargo installs (plan 65-04) | high | mitigate | scripts/lib/orca-offer-scan.mjs:27-32 imports only node:fs, node:os, node:path, node:sqlite and repo-local modules. theia/yarn.lock is unchanged for fd1062aa..ffc48715 and ..HEAD. | closed |
| T-65-16 | T | lane merges | high | mitigate | Prelaunch reconciliation is commit fd1062aa (65-PATTERNS.md:180). Merges f4e050cc, d5b71a7b, 45430c09 and bb6a64bd have second parents 50b6fb78, c6d2e976, 43a32b95 and 2ae7f8fc, the lane heads recorded in 65-05-SUMMARY.md:115-118. Re-deriving the scope check (git diff --name-only from merge-base to each lane head, compared with each plan's files_modified) finds zero files outside files_modified for all four lanes. Registry NEW blocks are in lane order at verify-platform.sh:4021/4035/4044 and 6841/6846/6859. Frontend-module blocks: orca-panes-frontend-module.ts:23, 189 and 191. | closed |
| T-65-17 | D | live rows on this host | medium | mitigate | Present at HEAD: (1) ORCA_* scrubbed in code at scripts/lib/orca-pane-harness.mjs:50-54,160, scripts/lib/orca-tabs-live.mjs:146-148,206-212, scripts/verify-orca-workspace-live.mjs:263-271 and scripts/verify-orca-relaunch-restore-live.mjs:235-241; (2) scratch profiles and data roots at orca-pane-harness.mjs:39-44,89-96 and orca-tabs-live.mjs:208; (3) signals only to recorded pid and start-tick identities at orca-pane-harness.mjs:216,245-249; (4) no pkill or killall in any Phase 65 live script; (5) scratch HOME enforced by liveEnv and assertScratchHome at scripts/lib/firefox-bidi.mjs:178-202, added after the phase in a8196e05. Absent: neither any Phase 65 live row nor scripts/verify-platform.sh acquires pb-live.lock. It appears only in usage comments (e.g. verify-orca-offer-scan.mjs:23-24, verify-platform.sh:6808) and as a sentence in 65-05-SUMMARY.md:241. The repo's own pattern for a row that takes the lock itself is scripts/verify-sidecar-origin-gate-live.mjs:23,38. Also, during the phase, orca-workspace-live created ws-live and ws-live-2 worktrees in the host's real Orca workspace directory. Ten such directories are still present under /home/chris/orca/workspaces/repo, and removing them is an unticked owner item (.planning/workstreams/orca/END-OF-MILESTONE-CHECKLIST.md:41). | open — below high threshold (non-blocking) |
| T-65-18 | T | brand inventory and allowlist | medium | mitigate | Allowlist rows exist only for measured hosts: 73ea33b9 (t2), c0408c6d (t1, t3) and the later 4aeac713 (t0, which its reason says was measured in the 2026-11-13 gate run). Each row has disposition user-initiated and names its measurement (powerbrowser/endpoint-allowlist.json:149-168). No host resolved unattended was allowlisted. Brand rows were re-measured in ffc48715, which touches inventory/brand-tokens.json only, from the scan on the staged merged tree (65-05-SUMMARY.md:270-288). The permanent scan-brand-residue gate enforces the counts. | closed |
| T-65-19 | R | blocker handling | medium | mitigate | 65-05-PLAN.md:186: Task 2 is type checkpoint:decision with gate blocking-human. The 65-01..65-04 SUMMARYs contain no BLOCKER or GATE-FAIL line (grep finds none). 65-05-SUMMARY.md:74 records 'Task 2: not reached'. The deferred owner items reached the owner and were answered in D-41 (.planning/workstreams/orca/DECISIONS.md:402-414; END-OF-MILESTONE-CHECKLIST.md:24). | closed |
| T-65-SC | T | npm/pip/cargo installs (plan 65-05) | high | mitigate | theia/yarn.lock is unchanged for fd1062aa..ffc48715 and ..HEAD (git diff --quiet). Phase manifests add only @powerbrowser/* 0.1.0 workspace packages and @theia/* 1.76.0 entries already in the lockfile. Orca's install is scripts/build-orca.sh:194 and :202 (pnpm --frozen-lockfile --ignore-scripts). | closed |
| Threat flag (65-02-SUMMARY.md) | n/a | Summary file .planning/workstreams/orca/phases/65-orca-workspace-in-theia/65-02-SUMMARY.md; mapped to 65-02:T-65-04,T-65-05,T-65-06,T-65-07,T-65-08 | n/a | n/a | Flag: None beyond the plan's register (T-65-04..T-65-08 mitigated as specified). Informational, no unregistered surface claimed. The threats it names were each verified CLOSED above (orca-git-protocol.ts, orca-workspace-backend-module.ts, orca-editor-routes.ts, orca-root-sync.ts). | closed |
| Threat flag (65-03-SUMMARY.md) | n/a | Summary file .planning/workstreams/orca/phases/65-orca-workspace-in-theia/65-03-SUMMARY.md; mapped to 65-03:T-65-09,T-65-10,T-65-11 | n/a | n/a | Flag: None beyond the plan's register (T-65-09 by clause i, T-65-10 by orca-no-pb-add-project, T-65-11 by the scope attribute). Informational. verify-orca-side-panel-live.mjs:345-354 and :818-823; verify-orca-no-pb-add-project.mjs:198-213; orca-side-view-widget.tsx:80. | closed |
| Threat flag (65-04-SUMMARY.md) | n/a | Summary file .planning/workstreams/orca/phases/65-orca-workspace-in-theia/65-04-SUMMARY.md; mapped to 65-04:T-65-12,T-65-14,T-65-15 | n/a | n/a | Flag: None beyond the plan's register (offers in memory, needle-free output, device-row reader keeps three fields). Informational. orca-offer-scan.mjs:166-197; verify-orca-offer-scan.mjs:141-143; verify-orca-relaunch-restore-live.mjs:193-202. | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward the blocking gate*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*
*T-65-SC appears once per plan (65-01 to 65-05). Threat flag rows follow the plan threats and are informational entries from each summary file's Threat Flags section.*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|

No accepted risks.

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-11-20 | 27 | 26 | 1 | security auditor (commit e0c19c54, verdict OPEN_THREATS) |

Auditor notes:

Phase 65 security audit at e0c19c54. ASVS level 1, block_on high. The register was built from the five PLAN threat_model blocks: 24 entries, with T-65-SC appearing once per plan. No plan is a superseded stub. 23 entries are CLOSED. 1 is OPEN and non-blocking: T-65-17 (65-05, medium, below the high threshold). threats_open, the blocking count, is 0.

Only 65-02, 65-03 and 65-04 have a "## Threat Flags" heading. Each says "None beyond the plan's register", and each is recorded as an informational flag mapped to the threats it names. 65-01 and 65-05 have no Threat Flags heading.

T-65-17 gap: no Phase 65 live row takes pb-live.lock in code. The lock exists only as a usage comment and as a sentence in 65-05-SUMMARY. Two ways to close it:
1. Have each Phase 65 live row re-exec itself under flock, as scripts/verify-sidecar-origin-gate-live.mjs:38 does.
2. Record the lock as an accepted operator procedure.

Separately, ten ws-live and ws-live-2 worktree directories that the Phase 65 orca-workspace-live runs created are still present under /home/chris/orca/workspaces/repo. The code cause was fixed at HEAD by the scratch-HOME change a8196e05. Their removal is the unticked owner item at END-OF-MILESTONE-CHECKLIST.md:41.

Residuals on CLOSED threats:
- T-65-04: the frontend resolver also trusts the live store's local roots, not only persisted PB-owned roots, and the frontend out-of-root refusal has no self-test plant. The backend re-validates every spec and root.
- T-65-09: hosts first resolved after the Orca-mode marker get the user-action verdict, as P65-24 provides. The launch-straight-into-Orca-mode egress case is not exercised by the row; the owner accepted it in D-41. The allowlist reason text for t0-t3.gstatic.com still calls it an open owner item.

Informational: fix ba87524a has the services root host 13 Orca app-root modals. This is new Orca renderer surface in the authenticated Theia origin, under 65-01's T-61-04 trust boundary. No Threat Flags section lists it, and the owner accepted "Orca's renderer runs in the authenticated Theia page" in D-41.

No files were written; no builds, verify scripts or live rows were run.

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [ ] `threats_open: 0` confirmed
- [ ] `status: verified` set in frontmatter

**Approval:** pending
