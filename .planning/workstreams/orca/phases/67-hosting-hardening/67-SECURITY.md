---
phase: "67"
slug: "67-hosting-hardening"
workstream: orca
milestone: v1.7
status: draft
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
threats_open_below_block_on: 1
threats_total: 41
threats_closed: 40
asvs_level: 1
block_on: high
register_authored_at_plan_time: true
auditor_verdict: OPEN_THREATS
audited_commit: e0c19c54
created: "2026-11-20"
---

# Phase 67 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.
> Phase 67 (Hosting hardening), workstream orca, milestone v1.7. Audited 2026-11-20 at commit e0c19c54.

---

## Trust Boundaries

Not recorded in the audit input. The register below was authored at plan time from the seven plan threat models (67-01 through 67-07); its Component column names the surface each threat sits on.

---

## Threat Register

T-67-SC repeats in plans 67-01 to 67-06 and is recorded once per plan, with the plan in parentheses.

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-67-01 | I | orcaStatus reply | high | mitigate | powerbrowser/shell/OrcaEnv.sys.mjs:522-524 orcaStatusReply returns only {state, failureClass}; powerbrowser/shell/PowerBrowserAPI.sys.mjs:11886 reply is {ok, kind, ...OrcaEnv.orcaStatusReply(OrcaService.getState())}; reached only through the case line at :2332, after the groupSenderIsTheia wall at :2324; static clause scripts/verify-orca-service.mjs:833-849 plus plants :1137 (third key) and :1138 (spread of getState) | closed |
| T-67-02 | T | orcaStatus clientReason | medium | mitigate | powerbrowser/shell/OrcaEnv.sys.mjs:464-482 frozen ORCA_CLIENT_REASONS and isClientReason; powerbrowser/shell/PowerBrowserAPI.sys.mjs:11880-11884 refuses an unknown value with 'handleShellMessage: unknown Orca client reason' (value not echoed); OrcaService.sys.mjs:735-739 second check; scripts/verify-orca-failure-classes.mjs:196-197, 213-230 compare the set with the pinned WebRuntimeAuthFailureReason, OFFER_REFUSAL_REASONS and ORCA_CLIENT_REASON_CLASS | closed |
| T-67-03 | D | orcaRestart from page script | medium | accept | Acceptance documented in the plan register at .planning/workstreams/orca/phases/67-hosting-hardening/67-01-PLAN.md:307 (no SECURITY.md exists yet; the orchestrator should add it to the accepted-risks log). The code matches the rationale: powerbrowser/shell/OrcaService.sys.mjs:156-168 restart() acts only when state is failed and not shutting down, and otherwise logs and returns false; the kind sits behind the sender wall at PowerBrowserAPI.sys.mjs:2324-2332 | closed |
| T-67-04 | I | Plaintext credentials from a temp profile | high | mitigate | powerbrowser/shell/OrcaService.sys.mjs:110 _preflight runs before _reapLeftover/_launch (:113-114); :124-138 compares the lexical and realPath forms of _dataRoot and _effectiveRoot against TmpD, ORCA_TEMP_ENV_NAMES and ORCA_FIXED_TEMP_ROOTS, then fails with the 'Orca temporary folder' row; OrcaEnv.sys.mjs:535-570 (temp roots, tempRootOf); PowerBrowserAPI.sys.mjs:11908-11925 tempDir/realPath; the superset check is scripts/verify-orca-credential-store.mjs:176-185; the live walker control is scripts/verify-orca-credential-store-live.mjs:84-85, 206 | closed |
| T-67-05 | T | Plaintext override in PB's environment | high | mitigate | powerbrowser/shell/OrcaService.sys.mjs:139-142 refuses ORCA_HEADLESS_SECRET_STORE=plaintext with the 'Orca setting' row before any spawn; OrcaEnv.sys.mjs:532 holds the name, which is absent from ORCAD_ENV_ALLOWLIST (:37-63) and ORCAD_FIXED_ENV_NAMES (:22-30); scripts/verify-orca-credential-store.mjs:174-175 checks it against the pin, :192-193 checks the allowlist, and the plant is at :283 | closed |
| T-67-06 | R | Protection statement drift | medium | mitigate | scripts/verify-orca-credential-store.mjs:186-187 goes red on any written backend other than host-file; :200-203 requires exactly one data-orca-credential-protection element equal to OrcaEnv.ORCA_PROTECTION_SENTENCE; :213 compares the copy table; plants are at :284-289. The paragraph is website-staging/privacy.html:90; the sentence is OrcaEnv.sys.mjs:586-587 and theia/extensions/orca-panes/src/browser/failure/orca-failure-copy.ts:27 | closed |
| T-67-07 | I | Offer file after stop | medium | mitigate | Phase 64 C5 at HEAD: powerbrowser/shell/OrcaService.sys.mjs:627-636 _stopTree removes orcad-data-root, web-pairing and orca-panes-dir before orcad is signalled. Scenario J is scripts/verify-orca-service.mjs:664-674, and the 'not removed' plants are at :1122 and :1134 | closed |
| T-67-SC (67-01) | T | npm/pip/cargo installs | high | mitigate | No package.json, yarn.lock, pnpm-lock, Cargo.* or requirements file is touched by any Phase 67 commit (lane, merge and fix commits af002471..b6552490, checked with git show --name-only). The audited install is docs/BUILD.md:60 'yarn install --ignore-scripts --frozen-lockfile' | closed |
| T-67-08 | T | orcad-origin page to /file-upload | high | mitigate | theia/extensions/token-gate/src/common/origin-policy.ts:11-24 allow-list (own origin only; Sec-Fetch-Site same-origin/none; fails closed when the port is unknown); token-gate-backend-contribution.ts:159-162 gate() returns 403 and :202-204 allowWsUpgrade() refuses; quick rule scripts/verify-sidecar-origin-gate.mjs:193-218 derives orcad's origin; live legs scripts/verify-sidecar-origin-gate-live.mjs:80-90, 160-174 expect 403 with the cookie present (registry verify-platform.sh:6342) | closed |
| T-67-09 | E | Orca route or listener ahead of gate() | high | mitigate | scripts/verify-sidecar-origin-gate.mjs:220-248 orca-routes rule (routes only inside configure(), no earlyMiddleware reference, no raw request/upgrade listener, 'route scan blind' when zero routes); plants :286-298; the only Orca route is theia/extensions/orca-panes/src/node/orca-panes-backend-module.ts:225-227 inside configure(app) | closed |
| T-67-10 | D | PB's own Orca bundle refused by the rule | medium | mitigate | scripts/verify-sidecar-origin-gate-live.mjs:128-134 pane-bundle positive control ('pane bundle not observed'); the probe .planning/workstreams/orca/phases/67-hosting-hardening/probes/record-sidecar-headers.mjs:5-6, 133-134 classifies pane-bundle and host-bundle; the re-record table is in 67-06-SUMMARY.md:119-149 ('No refused PowerBrowser class') | closed |
| T-67-11 | T | probe uploads | medium | mitigate | scripts/verify-sidecar-origin-gate-live.mjs:43 scratch = mkdtempSync(...); every upload uri is join(scratch, ...) at :100, :109, :160, :170; the folder is removed at :187 | closed |
| T-67-SC (67-02) | T | npm/pip/cargo installs | high | mitigate | No dependency manifest is changed by any Phase 67 commit (git show --name-only over the lane, merge and fix commits); docs/BUILD.md:60 is the audited --ignore-scripts --frozen-lockfile install | closed |
| T-67-12 | T | Offer file symlink swap | high | mitigate | theia/extensions/orca-panes/src/node/offer-file-policy.ts:49-69 offerFileVerdict (symlink, regular file, own uid, mode & 0o077); orca-panes-backend-module.ts:172 runs lstat before any read, :179 runs the verdict, and :106-116 readNoFollow uses O_NOFOLLOW and requires the same ino/dev; scripts/verify-orca-offer-file.mjs:225-233 checks the ordering, with plants :267 (mode check dropped) and :268 (stat for lstat) | closed |
| T-67-13 | S | Offer endpoint to another peer | high | mitigate | theia/extensions/orca-panes/src/node/offer-file-policy.ts:194-201 offerEndpointVerdict accepts only ws://127.0.0.1:<1024..32767>, equal to the port when known; called before the return at orca-panes-backend-module.ts:194-197; plant scripts/verify-orca-offer-file.mjs:269 (any-host regex) | closed |
| T-67-14 | I | Refusal reply and logs | medium | mitigate | theia/extensions/orca-panes/src/node/orca-panes-backend-module.ts:201-205 refuse() logs and returns the reason code only; static clause scripts/verify-orca-offer-file.mjs:238-244 forbids full/text/pairing/offer/stat/bridgeDir/.message in any return or log sink of handOff/refuse; plant :271 | closed |
| T-67-15 | I | Page text | medium | mitigate | theia/extensions/orca-panes/src/browser/failure/orca-failure-page.tsx:10-12, 33-52 renders only ORCA_FAILURE_COPY, ORCA_PROTECTION_SENTENCE and ORCA_BUTTON_LABELS; orca-hosting-status.ts:280-286 keeps only state and failureClass from the reply; scripts/verify-shell-error-copy.mjs:1365-1470 shape test plus ad-hoc JSX text checks (registry verify-platform.sh:4654-4655) | closed |
| T-67-16 | D | Pairing induction in the live row | low | mitigate | scripts/verify-orca-failure-page-live.mjs:393-408 parses orca-devices.json, drops only rows keyed to the offer row's device (offerRow kept), and writes valid JSON back; nothing is deleted or corrupted | closed |
| T-67-SC (67-03) | T | npm/pip/cargo installs | high | mitigate | No dependency manifest is changed by any Phase 67 commit; docs/BUILD.md:60 is the audited install | closed |
| T-67-17 | I | Offer in history, session restore, Setups, profile | high | mitigate | scripts/lib/orca-offer-scan.mjs:218-235 runCollector/collectorLine ('collector blind' without a control); collectors with marker controls: history :263-267, session restore :379-384, setups :386-394, whole profile :417-422; plants scripts/verify-orca-pairing-containment.mjs:196-199, 207 and blind plants :217-219, 223 | closed |
| T-67-18 | I | Offer in logs and copyable text | high | mitigate | scripts/lib/orca-offer-scan.mjs:396-401 logsCollector (control: LOG_CONTROL 'orcad ready on ', verify-orca-pairing-containment.mjs:74) and :410-415 copyableTextCollector (control: an 'Orca port: N' row); plants verify-orca-pairing-containment.mjs:200-201, 205-206 and blind plants :220, 222 | closed |
| T-67-19 | T | Bridge folder modes and strays | medium | mitigate | scripts/lib/orca-offer-scan.mjs:424-450 bridgeFolderCollector (0700 folder, offer file 0600, other entries private, own uid, stray needle copies); plants scripts/verify-orca-pairing-containment.mjs:208 (0644/0755), :210-211, :212 (web-pairing.bak) | closed |
| T-67-20 | S | Non-loopback endpoint or listener | medium | mitigate | scripts/lib/orca-offer-scan.mjs:452-463 nonLoopbackPeerCollector (isLoopbackEndpoint on the decoded endpoint; /proc LISTEN sockets of orcad and the Theia backend via listenSockets :340); plants scripts/verify-orca-pairing-containment.mjs:213 (ws://192.168.1.5:26768), :214 (0.0.0.0 listener), blind :225 | closed |
| T-67-21 | I | Scanner output | high | mitigate | scripts/lib/orca-offer-scan.mjs:228-235 output is sink name and match count only; scripts/verify-orca-pairing-containment.mjs:161 and :269 installOutputRedaction (scripts/lib/orca-run.mjs:158-169); fixtures use syntheticOffer (:80, :158, :180) | closed |
| T-67-22 | D | Stale aliases and bridge folders | low | mitigate | scripts/lib/firefox-bidi.mjs:255-266 removeOrcaPathsFor removes the aliasPathFor/bridgeDirFor paths from OrcaEnv (import :30); called from makeProfile.dispose in scripts/lib/pb-relaunch.mjs:260-266 and from the firefox-bidi default profiles at :579 and :743 | closed |
| T-67-SC (67-04) | T | npm/pip/cargo installs | high | mitigate | scripts/verify-orca-pairing-containment.mjs:56-63, scripts/lib/orca-offer-scan.mjs:27-32 and scripts/lib/mozlz4.mjs import only node: built-ins (node:sqlite included) and repo files; no dependency manifest is changed by any Phase 67 commit | closed |
| T-67-23 | S | Loopback page posing as orcad | medium | mitigate | powerbrowser/shell/PowerBrowserAPI.sys.mjs:11957-11983 the parent derives senderPort from the sender's documentURI and embeddedByShell from the shell content browser, then calls OrcaEnv.logoAnswerFor; OrcaEnv.sys.mjs:615-624 answers only when the state is ready, the port equals orcaPort and the sender is not embedded by the shell; scripts/verify-orca-landing-selectors.mjs:130-144 runs derived cases, with plants :190 (any port) and :192 (shell-embedded) | closed |
| T-67-24 | E | Child privileges | high | mitigate | powerbrowser/shell/GroupActorChild.sys.mjs:1215-1251 PowerBrowserOrcaLogoChild has no import and no privileged global (only sendQuery, this.document, the content MutationObserver), and its only writes are setAttribute src/alt at :1236-1237. The file's Cc[/Ci. uses at :293 and :674-675 belong to the Phase 66 agent child. The boundary guard is scripts/check-internals-boundary.sh:108-118; catalogue rows are powerbrowser/INTERNAL-APIS.md:460-461 (widened DOM-write row) | closed |
| T-67-25 | I | Answer content | low | accept | Acceptance documented in the plan register at .planning/workstreams/orca/phases/67-hosting-hardening/67-05-PLAN.md:254 (no SECURITY.md yet; the orchestrator should add it to the accepted-risks log). The code matches: OrcaEnv.sys.mjs:623 answer is only {src: mark data URI, alt, selectors} | closed |
| T-67-26 | I | Offer during the live row | medium | mitigate | scripts/verify-orca-landing-logo-live.mjs:177-199 puts the offer only into the #web-runtime-pairing-code field through the page; redaction comes from scripts/lib/orca-tabs-live.mjs:201-204 (installOutputRedaction, installed first) and :284-296 (offer and input added to the secrets); the profile comes from makeProfile/dispose (scripts/lib/pb-live-probe.mjs:52, 67; pb-relaunch.mjs:248-266) | closed |
| T-67-27 | I | Landing's GitHub star query | low | accept | Acceptance documented in the plan register at .planning/workstreams/orca/phases/67-hosting-hardening/67-05-PLAN.md:256 (no SECURITY.md yet). The gh stub that records calls is scripts/verify-orca-landing-logo-live.mjs:159-166, counted and removed at :280-284; the recorded result ('gh called 1 time') is in 67-07-SUMMARY.md:122 | closed |
| T-67-SC (67-05) | T | npm/pip/cargo installs | high | mitigate | No dependency manifest is changed by any Phase 67 commit; Orca's build is the existing install, scripts/build-orca.sh:194 'pnpm install --frozen-lockfile --ignore-scripts' | closed |
| T-67-28 | T | lane merges | high | mitigate | git: the second parents of merge commits c84a92ee, fd373d97, d92b20ea, cb2061ae and 5c9a8b24 equal refs/heads/ServerDestroyer/p67-01..05 (31429ee1, 1c2f97ae, f9969eae, 81135549, dc42534c), and no other p67 ref exists. Re-derived scope check: git diff --name-only <merge-base> <lane head> for each lane lists no path outside that plan's files_modified. Registry blocks are in lane order at scripts/verify-platform.sh:4105-4158 and 6896-6915 | closed |
| T-67-29 | D | PowerBrowser pages after the Origin rule | high | mitigate | The Theia upload and pane-bundle positive controls are in scripts/verify-sidecar-origin-gate-live.mjs:100-104 and :128-134 (registry verify-platform.sh:6342). The kept probe is probes/record-sidecar-headers.mjs:133-134; the repo-local profile base is scripts/lib/firefox-bidi.mjs:50-56 and pb-relaunch.mjs:248-251. The re-record and re-run results are recorded in 67-06-SUMMARY.md:119-149 and 208-228 (no refused PowerBrowser class) | closed |
| T-67-30 | D | live rows on this host | medium | mitigate | Partly present. These Phase 67 live rows take the pb-live lock themselves: verify-sidecar-origin-gate-live.mjs:36-39, verify-orca-credential-store-live.mjs:293-296, verify-orca-failure-page-live.mjs:539 and verify-orca-landing-logo-live.mjs:143-146. All rows remove ORCA_*, signal only recorded identities, and use makeProfile with dispose. The gap: scripts/verify-orca-pairing-containment.mjs takes no lock. Its lock exists only as a comment at :35 and in the coordinator procedure in 67-06-PLAN.md:208/216. Its registry row (scripts/verify-platform.sh, after :6914) runs it bare, and the driver takes no lock. 67-06-SUMMARY.md:235-239 also records 8 pb-orca-* alias/bridge entries left under XDG_RUNTIME_DIR by live rows that do not use makeProfile. Non-blocking: medium is below block_on high | open — below high threshold (non-blocking) |
| T-67-31 | T | inventory/brand-tokens.json | medium | mitigate | inventory/brand-tokens.json:5-10: the exclude list is unchanged over a2607ccb..HEAD (the hunks of the Phase 67 commits cf6c47a3 and b6552490 start at line 976 and later; no +/- line on any exclude entry). Scan and self-test rows are scripts/verify-platform.sh:3664 and :3674 | closed |
| T-67-32 | R | owner items and deferrals | medium | mitigate | Owner items and deferrals are in 67-06-SUMMARY.md:285-311 and .planning/workstreams/orca/STATE.md:177 (it also lists D-36); partial proofs are .planning/WINDOWS.md:62-64 (ids 45, 46, 47). The Task 2 choice is recorded as a coordinator ruling the owner may override (.planning/workstreams/orca/DECISIONS.md:299-301), not as an owner pick | closed |
| T-67-SC (67-06) | T | npm/pip/cargo installs | high | mitigate | No dependency manifest is changed by any Phase 67 commit, including the coordinator fix commits 6849530b, b3ded25e, 214640dc, 3a22b3b5 and cf6c47a3; the Theia and Orca installs are docs/BUILD.md:60 and scripts/build-orca.sh:194 | closed |
| T-67-07-01 | I | lastPaired in pb-session-pairing.ts | medium | mitigate | orca-overlay/files/src/renderer/src/pb/pb-session-pairing.ts:63 module-scoped (page memory) lastPaired; :98 deviceToken blanked on every endpoint; used only as previousEnvironment at :86; no console call in the file; pairSessionOnly and repair return void (:73, :107); never passed to saveStoredWebRuntimeEnvironment (:95 saves the new environment) | closed |
| T-67-07-02 | S | a re-pair keeping the id for a different host | medium | mitigate | orca-overlay/files/src/renderer/src/pb/pb-session-pairing.ts:83-87 delegates to Orca's createStoredWebRuntimeEnvironment with previousEnvironment. At the pin (orca/src/renderer/src/web/web-runtime-environment.ts:137-149, third-party context) the id is kept only when classifyRuntimeHostRePair returns same-host, from the stored public keys and hostDescriptor; any other host gets a new web-<uuid> | closed |
| T-67-07-03 | I | the console watch in orca-failure-page-live | low | mitigate | scripts/verify-orca-failure-page-live.mjs:355-359 the in-page watch keeps only line and stranded counts; :378 compares ids in the page and returns only a sameId boolean; :242-244 installOutputRedaction | closed |

Threat flags: none. Plans 67-01 through 67-05 each read "None" or "None beyond the plan's register"; 67-06 and 67-07 have no Threat Flags section. No threat-flag entries were supplied, so none are added to the register.

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward the blocking gate*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Escalations

None.

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-67-01 | T-67-03 | Acceptance documented in the plan register at .planning/workstreams/orca/phases/67-hosting-hardening/67-01-PLAN.md:307. The code matches the rationale: powerbrowser/shell/OrcaService.sys.mjs:156-168 restart() acts only when state is failed and not shutting down, and otherwise logs and returns false; the kind sits behind the sender wall at PowerBrowserAPI.sys.mjs:2324-2332 | Plan register (67-01-PLAN.md) | 2026-11-20 |
| AR-67-02 | T-67-25 | Acceptance documented in the plan register at .planning/workstreams/orca/phases/67-hosting-hardening/67-05-PLAN.md:254. The code matches: OrcaEnv.sys.mjs:623 answer is only {src: mark data URI, alt, selectors} | Plan register (67-05-PLAN.md) | 2026-11-20 |
| AR-67-03 | T-67-27 | Acceptance documented in the plan register at .planning/workstreams/orca/phases/67-hosting-hardening/67-05-PLAN.md:256. The gh stub that records calls is scripts/verify-orca-landing-logo-live.mjs:159-166, counted and removed at :280-284; the recorded result ('gh called 1 time') is in 67-07-SUMMARY.md:122 | Plan register (67-05-PLAN.md) | 2026-11-20 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-11-20 | 41 | 40 | 1 | security auditor (commit e0c19c54), verdict OPEN_THREATS |

Auditor notes:

- Phase 67 (hosting hardening), asvs_level 1, block_on high, repository at e0c19c54. The register comes from the seven threat_model STRIDE tables written at plan time: 41 entries (T-67-SC repeats in plans 01-06 and is recorded per plan). No plan is a superseded stub. Plan 67-07 is a gap-closure plan with its own register. 40 entries are CLOSED and 1 is OPEN.
- threats_open (severity-filtered, the gate field): 0. The only open entry, T-67-30 (67-06, medium), is below the high threshold, so it is non-blocking and does not stop shipping. The verdict is OPEN_THREATS only because the run's status rule requires it whenever any entry is OPEN. The frontmatter threats_open of 1 counts all OPEN entries.
- T-67-30 gap: scripts/verify-orca-pairing-containment.mjs (the orca-pairing-containment-live row) does not take the pb-live lock itself. The lock appears only as a comment and as a step in the coordinator's procedure. The other four Phase 67 live rows re-exec under <git common dir>/pb-live.lock. Suggested fix: add the same PB_LIVE_LOCK_HELD/flock re-exec those rows use. Also, 67-06-SUMMARY.md:235-239 records alias and bridge-folder leftovers from older live rows that do not use makeProfile; those rows are outside Phase 67's files.
- Accepted risks with no SECURITY.md entry before this file: T-67-03 (67-01-PLAN.md:307), T-67-25 (67-05-PLAN.md:254) and T-67-27 (67-05-PLAN.md:256). They are CLOSED on the plan-register acceptance, and the code matches each rationale. They are copied into the Accepted Risks Log above.
- Threat flags: 67-01 through 67-05 each read "None" or "None beyond the plan's register". 67-06 and 67-07 have no Threat Flags section. That makes zero flag items and no unregistered flags. Claims inside those sections were spot-checked and hold: tempDir/realPath only read (PowerBrowserAPI.sys.mjs:11908-11925); the status recorder logs headers and booleans (scripts/lib/sidecar-status-recorder.cjs:17-21); the marker page binds 127.0.0.1 (scripts/lib/pb-relaunch.mjs:154, 198).
- T-67-28 was checked from git, not from the summary. Each lane merge's second parent equals refs/heads/ServerDestroyer/p67-0N. Re-running the scope check over each lane's changed paths against its plan's files_modified gives an empty difference. The two coordinator edits outside the lanes (orca-panes-protocol.ts, orca-pane-bundle.ts) are fix commits listed in 67-06-SUMMARY.md, not lane content.
- Observation on T-67-32: the Task 2 owner decision (D-36, option-a) was taken as a coordinator ruling in auto mode, not through the decision box. It is recorded as overridable and listed among the owner items in STATE.md:177, so nothing is wrongly attributed to the owner. The owner should still confirm D-36 in the end-of-milestone pass.
- No file was modified or written by the audit. No build, browser, yarn, nix or verify-* script was run.

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [ ] `threats_open: 0` confirmed (T-67-30 is OPEN, medium, non-blocking)
- [ ] `status: verified` set in frontmatter

**Approval:** pending
