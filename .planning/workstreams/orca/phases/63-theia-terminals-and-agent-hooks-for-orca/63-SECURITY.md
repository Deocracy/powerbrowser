---
phase: "63"
slug: "63-theia-terminals-and-agent-hooks-for-orca"
workstream: orca
milestone: v1.7
status: draft
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
threats_open_below_block_on: 1
threats_total: 31
threats_closed: 30
asvs_level: 1
block_on: high
register_authored_at_plan_time: true
auditor_verdict: OPEN_THREATS
audited_commit: e0c19c54
created: "2026-11-20"
---

# Phase 63 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.
> Phase 63: Theia terminals and agent hooks for Orca. Audited 2026-11-20 at commit e0c19c54.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Bridge folder | File hand-off folder written by the shell (writePrivateFile) and read by the orca-agents backend and the claude wrapper | Orcad data-root path, pane identity, endpoint path (no credential) |
| Wrapper to Orca CLI | The claude wrapper reads the bridge folder and calls Orca's CLI | Pane identity, hook endpoint |
| Check scripts and live rows | verify-platform.sh rows that start PowerBrowser, orcad and a real claude on the host | ORCA_* environment names, scratch HOME and data root |

---

## Threat Register

| Threat ID | Plan | Category | Component | Severity | Disposition | Mitigation (evidence) | Status |
|-----------|------|----------|-----------|----------|-------------|-----------------------|--------|
| T-63-01 | 63-01 | S | orcad client connect | high | mitigate | 63-01 is a superseded stub (D-31). Judged against the plans that replaced it (63-06, 63-03, 63-04): the orcad bridge client and endpoint.json were never built. Lane head 294012a3 is not an ancestor of HEAD e0c19c54. Searching tracked files outside .planning for external-pty, ExternalPty, PTY_BRIDGE and pty-bridge finds nothing. e3d2f09f:orca-overlay/seams.json has one row (010). The replacing trust boundary (the wrapper reading the bridge folder) refuses another uid and group/other bits: theia/extensions/orca-agents/bin/claude-wrapper.mjs:74-81, :84-92. | CLOSED |
| T-63-02 | 63-01 | I | client logging, check output | high | mitigate | Superseded stub (D-31). No orcad bridge client exists (see T-63-01). The replacing checks read environ names only: scripts/verify-orca-agent-hooks.mjs:529-535 (paneEnvNames), :293-302 (ptyEnvVerdict). The wrapper logs only its own text, an error code, an exit status or an error name: claude-wrapper.mjs:62-72. ORCA_AGENT_HOOK_TOKEN does not appear in orca-agents, powerbrowser/shell or the three Phase 63 checks (git grep: no match). | CLOSED |
| T-63-03 | 63-01 | I | PTY environment | medium | mitigate | Superseded stub (D-31). No code sets ORCA_EXTERNAL_PTY_ENDPOINT. It appears only as a self-test plant that must go red 'pty switch' (scripts/verify-orca-service.mjs:1125) and in a comment (scripts/verify-orca-agent-hooks.mjs:74). The pty-switch clause at scripts/verify-orca-service.mjs:930-932 keeps it out of ORCAD_FIXED_ENV_NAMES (powerbrowser/shell/OrcaEnv.sys.mjs:22) and out of buildOrcadEnv. | CLOSED |
| T-63-04 | 63-01 | T | orca-overlay seams | high | mitigate | Superseded stub (D-31, P63-31 dropped seams S2/S3, the ones the 5-line cap was written for). Phase 63 added no seam: no Phase 63 commit touches orca-overlay/, and e3d2f09f:orca-overlay/patches holds only 010. The gate is present at HEAD: scripts/verify-orca-overlay.mjs:67 and :231-232 (SEAM_LINE_BOUND), :237-241 (seam_cap, configuration.toml:167), :285 (pinned upstream_blob), :308 (regenerate-patches.sh --check). scripts/verify-orca-build-shape.mjs:145 compares the modified set with the declared seams. Rows: scripts/verify-platform.sh:3892-3893, :6730. | CLOSED |
| T-63-05 | 63-01 | D | bridge loss | medium | mitigate | Superseded stub (D-31). No external PTY bridge exists to lose. orcad runs Orca's stock local PTY provider and terminal daemon: OrcaEnv has no PTY name (pty-switch clause scripts/verify-orca-service.mjs:930-932), and no overlay file or seam carries a PTY provider. Restart adopts the surviving daemon (powerbrowser/shell/OrcaService.sys.mjs:573-595). Quit ends orcad, the daemon and its descendants (OrcaService.sys.mjs:612-636). | CLOSED |
| T-63-SC | 63-01 | T | npm/pip/cargo installs | high | mitigate | Superseded stub, judged on the phase as delivered. theia/yarn.lock is unchanged over 6861d390..e3d2f09f, and no lockfile path changed in the phase. scripts/build-orca.sh is unchanged in the phase and installs with pnpm --frozen-lockfile --ignore-scripts (scripts/build-orca.sh:194, :202). | CLOSED |
| T-63-06 | 63-02 | S | bridge socket hello | high | mitigate | Superseded stub (D-31, P63-31). No bridge socket, token or hello handshake was built. theia/extensions holds no orca-terminals package, and git grep for pty-bridge, ptyBridge and POWERBROWSER_ORCA_PTY over theia, powerbrowser, docs and scripts finds nothing. The replacement is a file hand-off folder with no listener: PowerBrowserAPI.sys.mjs:11071-11089. | CLOSED |
| T-63-07 | 63-02 | E | bridge directory | high | mitigate | Superseded stub. Judged against the 63-06/63-03 bridge folder. writePrivateFile creates it 0700 and sets 0700 again on every call (powerbrowser/shell/PowerBrowserAPI.sys.mjs:11075-11079), and files become 0600 before any byte is written (:11083-11086). The orca-agents backend creates it 0700 and refuses another uid or group/other bits (theia/extensions/orca-agents/src/node/orca-agents-backend-module.ts:33-43). The wrapper refuses the same (claude-wrapper.mjs:74-81). The launcher is 0700 (src/node/claude-wrapper-launcher.ts:25-37). The folder is never under /tmp (OrcaEnv.sys.mjs:262-274, :292-305). Plants: scripts/verify-orca-bridge-dir.mjs:272 (folder 0700 re-apply removed) and scripts/verify-orca-agent-status-live.mjs:346 (0644 data-root file). No socket or endpoint.json exists. | CLOSED |
| T-63-08 | 63-02 | I | bridge and backend logging | high | mitigate | Superseded stub. No bridge exists. In the replacing design the agent spawn environment never passes through the Theia backend, and no Phase 63 code handles ORCA_AGENT_HOOK_TOKEN (git grep: no match). Backend log lines carry fixed text or an Error message and no environment value (orca-agents-backend-module.ts:29, :50). Wrapper log reasons are restricted (claude-wrapper.mjs:62-72, :163-166). Check verdicts name fields, not values (scripts/verify-orca-agent-hooks.mjs:315-329). | CLOSED |
| T-63-09 | 63-02 | S | terminal-open-handler, layout restore | medium | mitigate | Superseded stub (P63-31). The terminal:o<n> identity, ORCA_TERMINAL_NAME_PATTERN, the tab-uris exemption and the URI-SCHEMES row were never built. git grep over theia/extensions/tab-uris and docs/URI-SCHEMES.md for terminal:o and kind 'orca' finds nothing, and both paths are unchanged over 6861d390..e3d2f09f. No stale o<n> URI can resolve to a shell. | CLOSED |
| T-63-10 | 63-02 | T | spawn frames | medium | mitigate | Superseded stub (D-31). No spawn-frame protocol or bridge listener exists at HEAD (see T-63-06). Phase 63 added no input surface that parses frames. | CLOSED |
| T-63-12 | 63-02 | D | orcad crash | medium | mitigate | Superseded stub (D-31, P63-37). No bridge connection exists, so there are no orphaned bridge PTYs. PTYs belong to Orca's terminal daemon. OrcaService adopts the surviving daemon on an orcad restart (powerbrowser/shell/OrcaService.sys.mjs:573-595) and ends orcad, the daemon and its descendants on quit (:612-636). orca-agent-status-live requires the agent and the daemon to be gone after quit (scripts/verify-orca-agent-status-live.mjs:298-307). | CLOSED |
| T-63-SC | 63-02 | T | npm/pip/cargo installs | high | mitigate | Superseded stub. The phase's only new workspace package, theia/extensions/orca-agents/package.json:6-9, depends on the workspace @powerbrowser/token-gate and on @theia/core 1.76.0, which is already locked (theia/yarn.lock:898). yarn.lock is unchanged over 6861d390..e3d2f09f. The audited install is yarn install --ignore-scripts --frozen-lockfile (docs/BUILD.md:60). | CLOSED |
| T-63-13 | 63-03 | T | wrapper environment | high | mitigate | theia/extensions/orca-agents/bin/claude-wrapper.mjs:95-105: line 97 drops every inherited ORCA_* name before lines 98-103 add the pane identity and endpoint. The degrade path also drops them (:199). Plant and control: scripts/verify-orca-agent-hooks.mjs:129 (ORCA_PLANT_63), :591 (planted in the launcher env), :600 (read from the wrapper's own environ), :319-320 (instrument-blind control, then the leak check). | CLOSED |
| T-63-14 | 63-03 | S | orcad-data-root | high | mitigate | claude-wrapper.mjs:74-81 (lstat, regular type, uid equal to process.getuid, mode & 0o077 refused). :84-92 checks the directory and then the file, requires an absolute path (:89) and requires Orca's CLI under it (:90). The bridge folder comes only from argv --bridge-dir (:51-59). A static clause forbids process.env reads of the data-root and pane names: scripts/verify-orca-agent-hooks.mjs:412-416. | CLOSED |
| T-63-15 | 63-03 | T | claude's stdout stream | medium | mitigate | claude-wrapper.mjs contains no console, process.stdout or process.stderr reference (grep count 0). CLI calls use stdio ['ignore','pipe','pipe'] (:119-121). Static clause at scripts/verify-orca-agent-hooks.mjs:417-422, plant at :782. The launcher's stdout is compared with the stub's marker line (:325 against the stub write at :472). | CLOSED |
| T-63-16 | 63-03 | I | wrapper log, check output | medium | mitigate | claude-wrapper.mjs:163-166 appends to claude-wrapper.log with mode 0o600, and logReason (:62-72) limits each entry to the wrapper's own step text, an error code, an exit status or an error name. Check verdict messages print no environment values (scripts/verify-orca-agent-hooks.mjs:315-329), and pane environ is read as names only (:529-535). Note: the stub passes its ORCA_* values to the checker through report-b.json in the mkdtemp scratch base (:471, :587, :599). That folder is 0700 and is removed in finally (:718). The values are never printed. | CLOSED |
| T-63-17 | 63-03 | T | user settings | medium | mitigate | The default-scope registerOverride is the only preference write: theia/extensions/orca-agents/src/browser/orca-agents-frontend-module.ts:33. Static clauses go red on a settings.json name or a preference setter (scripts/verify-orca-agent-hooks.mjs:442-449) and require the registerOverride call (:424-427). Plants: :784-785. | CLOSED |
| T-63-SC | 63-03 | T | npm/pip/cargo installs | high | mitigate | orca-agents/package.json:6-9 adds no registry package: @theia/core 1.76.0 is already at theia/yarn.lock:898. yarn.lock is unchanged in the phase. The wiring diff only appends the build:extensions entry (theia/package.json) and the workspace dependency (theia/applications/browser/package.json). The audited install is in docs/BUILD.md:60. | CLOSED |
| T-63-18 | 63-04 | T | lane merges | high | mitigate | Git history at HEAD. Merge 3d009604 has parents abca6309 and 5c09757b (refs/heads/ServerDestroyer/p63-06 head). Merge fe09063b has parents 3d009604 and 245da102 (refs/heads/ServerDestroyer/p63-03 head). The p63-01 (294012a3), p63-02 (3ab56e10) and p63-05 (ae88faa2) heads are not ancestors of HEAD, and none of their 9 commit subjects appear in HEAD's history. Each kept lane's diff from its merge base lists only its plan's files_modified (0 extra paths). The scripts/verify-platform.sh conflict resolution (fe09063b) has exactly the lane's own sorted +/- lines. | CLOSED |
| T-63-20 | 63-04 | D | live rows on this host | medium | mitigate | Partial. Present: inherited ORCA_* names are scrubbed in-process (scripts/verify-orca-agent-hooks.mjs:223-225, :847; scripts/verify-orca-agent-status-live.mjs:204). The hermetic orcad gets a scratch HOME and data root (verify-orca-agent-hooks.mjs:672-681). Signals go only to pid plus start-ticks identities (scripts/verify-orca-hidden-electron.mjs:82-87, :98-101), used at verify-orca-agent-hooks.mjs:676, :722-732 and verify-orca-agent-status-live.mjs:220, :313-314; stopStrays is scoped to the row's own profile path (scripts/lib/firefox-bidi.mjs:292-316). Missing: nothing enforces the pb-live lock. Rows scripts/verify-platform.sh:6772 (orca-agent-hooks) and :6777 (orca-agent-status-live) run node directly, and neither script takes the lock. The lock appears only as comments (verify-platform.sh:6763, :6776; verify-orca-agent-status-live.mjs:46) and as a statement in 63-04-SUMMARY.md. A full verify-platform.sh run therefore starts PowerBrowser, orcad and a real claude without it. Precedent for a self-locking row: scripts/verify-sidecar-origin-gate-live.mjs:36-39. Severity medium is below block_on high, so this is non-blocking. | OPEN |
| T-63-21 | 63-04 | T | inventory/brand-tokens.json | medium | mitigate | git diff abca6309..e3d2f09f -- inventory/brand-tokens.json changes no exclude line. At HEAD, scope.exclude is .planning/, inventory/ and the two rename scripts, and does not name orca-agents. The scan reconciles every expected_count with the measured count, so a hand-estimated count goes red (scripts/scan-brand-residue.mjs:643-644). The scan and its self-test are registered at scripts/verify-platform.sh:3664 and :3674. | CLOSED |
| T-63-SC | 63-04 | T | npm/pip/cargo installs | high | mitigate | theia/yarn.lock is unchanged over 6861d390..e3d2f09f. The Theia install is the audited one (docs/BUILD.md:60). scripts/build-orca.sh is unchanged in the phase and uses pnpm --frozen-lockfile --ignore-scripts (:194, :202). configuration.toml and scripts/fetch-orca.sh (the Orca pin) are unchanged in the phase. | CLOSED |
| T-63-11 | 63-05 | I | POWERBROWSER_ORCA_PTY_DIR, ORCA_EXTERNAL_PTY_ENDPOINT | low | accept | The acceptance is documented in the threat register at .planning/workstreams/orca/phases/63-theia-terminals-and-agent-hooks-for-orca/63-05-PLAN.md:333. 63-05 is a superseded stub; 63-06 carries the acceptance forward for the renamed key (63-06-PLAN.md:252, T-63-26). The premise holds at HEAD. Neither original name exists: the key was renamed POWERBROWSER_ORCA_BRIDGE_DIR, and ORCA_EXTERNAL_PTY_ENDPOINT survives only as a self-test plant. The value is a folder path (powerbrowser/shell/TheiaService.sys.mjs:789-797, :907-911), and it is captured and deleted at module load (theia/extensions/token-gate/src/node/powerbrowser-env.ts:66-72). No SECURITY.md accepted-risks log exists yet; the orchestrator should record this entry there. | CLOSED |
| T-63-22 | 63-05 | T | PowerBrowserProcesses.writePrivateFile | high | mitigate | Superseded stub, implemented by 63-06. powerbrowser/shell/PowerBrowserAPI.sys.mjs:11072-11074: the name is one segment of [A-Za-z0-9._-] and never '.' or '..'. :11075-11079: the folder is 0700. :11083-11088: the .tmp is created empty and exclusively, set 0600 with honorUmask false on every platform but Windows, written with overwrite, then moved. orca-service requires the write after the ready line (scripts/verify-orca-service.mjs:383-387, plant :1121). orca-agent-status-live checks mode 0600 and the content (scripts/verify-orca-agent-status-live.mjs:96-99). | CLOSED |
| T-63-23 | 63-05 | D | keys-live and runTabStage live runs | medium | mitigate | Superseded stub. Judged against 63-06, which dropped this component (P63-34; 63-06-SUMMARY.md:71 'Left behind (D-31)'). The p63-05 head ae88faa2 is not an ancestor of HEAD, so Phase 63 delivered no keys-live or runTabStage run. The scripts/verify-orca-terminal-keys-live.mjs at HEAD came from Phase 64 (d67fd2c4, 64-04) and falls under Phase 64's register. It also leaves the lock to the operator, as a comment at :94. | CLOSED |
| T-63-SC | 63-05 | T | npm/pip/cargo installs | high | mitigate | Superseded stub, judged on 63-06: the p63-06 lane diff from 6861d390 holds only its files_modified, with no package or lockfile path. theia/yarn.lock is unchanged in the phase. The audited install is in docs/BUILD.md:60. | CLOSED |
| T-63-24 | 63-06 | I | writePrivateFile | medium | mitigate | powerbrowser/shell/PowerBrowserAPI.sys.mjs:11075-11079 (folder created 0700, then set 0700 again on posix), :11083 (empty exclusive create), :11084-11086 (0600 before any byte), :11087 (overwrite write), :11088 (move). A call-order check enforces this sequence (scripts/verify-orca-bridge-dir.mjs:157-186, umask-window clause at :186). Plants: :271 (writeUTF8 before 0o600, 'umask window'), :272 (re-apply removed), :273 (exclusive create removed). Rows: scripts/verify-platform.sh:3915-3916. | CLOSED |
| T-63-25 | 63-06 | T | bridge folder files | medium | mitigate | PowerBrowserAPI.sys.mjs:11072 (one path segment), :11082 (stale .tmp removed) before :11083 (exclusive create, so a planted file is never written through). The p63-03 readers refuse a folder or file owned by another uid or with group/other bits: theia/extensions/orca-agents/bin/claude-wrapper.mjs:74-81, :85, :87 and src/node/orca-agents-backend-module.ts:36-43. | CLOSED |
| T-63-26 | 63-06 | I | POWERBROWSER_ORCA_BRIDGE_DIR | low | accept | The acceptance is documented in the threat register at .planning/workstreams/orca/phases/63-theia-terminals-and-agent-hooks-for-orca/63-06-PLAN.md:252. The premise holds at HEAD. The value is the bridgeDirFor path (powerbrowser/shell/TheiaService.sys.mjs:789-797, :907-911). It is captured and deleted at module load (theia/extensions/token-gate/src/node/powerbrowser-env.ts:66-72). The orca-agents backend reads it only from POWERBROWSER_ENV (orca-agents-backend-module.ts:27), enforced by scripts/verify-orca-agent-hooks.mjs:433-440. No SECURITY.md accepted-risks log exists yet; the orchestrator should record this entry there. | CLOSED |
| T-63-SC | 63-06 | T | npm/pip/cargo installs | high | mitigate | The p63-06 lane diff (6861d390..5c09757b) holds only its files_modified, with no package.json, lockfile or registry build. theia/yarn.lock is unchanged in the phase. The audited install is in docs/BUILD.md:60. | CLOSED |

Threat flags (from SUMMARY `## Threat Flags` sections): none. No SUMMARY in the phase directory has a `## Threat Flags` heading, and the three superseded lane SUMMARYs on their own branches have none either.

*Status: OPEN · CLOSED*
*Severity: critical > high > medium > low. Only OPEN threats at or above block_on (high) block the gate.*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Escalations

None.

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-63-01 | T-63-11 (63-05, low, accept, CLOSED) | The acceptance is documented in the threat register at .planning/workstreams/orca/phases/63-theia-terminals-and-agent-hooks-for-orca/63-05-PLAN.md:333. 63-05 is a superseded stub; 63-06 carries the acceptance forward for the renamed key (63-06-PLAN.md:252, T-63-26). The premise holds at HEAD. Neither original name exists: the key was renamed POWERBROWSER_ORCA_BRIDGE_DIR, and ORCA_EXTERNAL_PTY_ENDPOINT survives only as a self-test plant. The value is a folder path (powerbrowser/shell/TheiaService.sys.mjs:789-797, :907-911), and it is captured and deleted at module load (theia/extensions/token-gate/src/node/powerbrowser-env.ts:66-72). | Phase 63 plan threat register (63-05-PLAN.md) | 2026-11-20 (audit) |
| AR-63-02 | T-63-26 (63-06, low, accept, CLOSED) | The acceptance is documented in the threat register at .planning/workstreams/orca/phases/63-theia-terminals-and-agent-hooks-for-orca/63-06-PLAN.md:252. The premise holds at HEAD. The value is the bridgeDirFor path (powerbrowser/shell/TheiaService.sys.mjs:789-797, :907-911). It is captured and deleted at module load (theia/extensions/token-gate/src/node/powerbrowser-env.ts:66-72). The orca-agents backend reads it only from POWERBROWSER_ENV (orca-agents-backend-module.ts:27), enforced by scripts/verify-orca-agent-hooks.mjs:433-440. | Phase 63 plan threat register (63-06-PLAN.md) | 2026-11-20 (audit) |

*Accepted risks do not resurface in future audit runs.*
*T-63-20 is OPEN and is not an accepted risk. It stays in the register for the owner to triage.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-11-20 | 31 | 30 | 1 | security auditor (verdict OPEN_THREATS, commit e0c19c54) |

Auditor notes:

Phase 63 (Agent hooks on Orca's terminal engine) was audited at ASVS level 1 with block_on: high, on HEAD e0c19c54. The register has 31 entries from the threat_model blocks of six plans: 63-01 (6), 63-02 (7), 63-03 (6), 63-04 (4), 63-05 (4) and 63-06 (4); T-63-SC repeats once per plan. Result: 30 CLOSED and 1 OPEN. The OPEN entry is T-63-20 (63-04, medium). It is below the high threshold, so it does not block, and threats_open (blocking) = 0. The verdict is OPEN_THREATS only because the status rule makes any OPEN entry non-SECURED.

Superseded plans: 63-01, 63-02 and 63-05 are superseded stubs (D-31; 63-CONTEXT P63-31, P63-34, P63-39). They were judged against the plans that replaced them: 63-06 rebuilds the parts of 63-05 that were kept, 63-03 was kept, and 63-04 coordinated the merges. The components that only those three plans owned were confirmed absent at HEAD: the external PTY bridge client, socket and endpoint.json, ORCA_EXTERNAL_PTY_ENDPOINT, the o<n> terminal identity, spawn frames, and seams S2/S3. Where the replacing design still has a matching trust boundary (the bridge folder, writePrivateFile, the readers of orcad-data-root), the mitigation was checked in that code.

Threat flags: no SUMMARY in the phase directory has a '## Threat Flags' heading. The three superseded lane SUMMARYs on their own branches have none either. threat_flags is empty.

T-63-20 gap: the scrubbing of inherited ORCA_* names, the scratch HOME and the pid-plus-start-ticks signalling are all in code. The pb-live lock is not enforced by the orca-agent-hooks row (scripts/verify-platform.sh:6772) or the orca-agent-status-live row (scripts/verify-platform.sh:6777); it exists only as a comment telling the operator to wrap the run in flock. Two ways to close it: make each script re-exec itself under the lock, as scripts/verify-sidecar-origin-gate-live.mjs:36-39 does, or record an operator-applied lock as an accepted risk in SECURITY.md.

Observations, not findings:
- verify-orca-agent-hooks.mjs passes the stub's ORCA_* values (pane identity and endpoint path, no credential) through a report file in its 0700 mkdtemp scratch folder, which is deleted afterwards. They are never printed.
- The accepted risks T-63-11 and T-63-26 are documented only in the plans' threat registers, because SECURITY.md did not exist yet. They are recorded in the Accepted Risks Log above.

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [ ] `threats_open: 0` confirmed (1 OPEN: T-63-20, medium, non-blocking)
- [ ] `status: verified` set in frontmatter

**Approval:** pending (OPEN_THREATS, T-63-20 awaits owner triage)
