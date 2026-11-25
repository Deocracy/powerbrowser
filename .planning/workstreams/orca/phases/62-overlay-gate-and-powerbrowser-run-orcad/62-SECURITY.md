---
phase: "62"
slug: "62-overlay-gate-and-powerbrowser-run-orcad"
workstream: orca
milestone: v1.7
status: draft
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
threats_open_below_block_on: 1
threats_total: 22
threats_closed: 21
asvs_level: 1
block_on: high
register_authored_at_plan_time: true
auditor_verdict: OPEN_THREATS
audited_commit: e0c19c54
created: "2026-11-20"
---

# Phase 62 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.
> Phase 62: Overlay gate and PowerBrowser-run orcad. Workstream orca, milestone v1.7.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| orca-overlay patches and files into the Orca source tree | Overlay seams, whole-file copies and recorded upstream blobs applied by the build script | Source patches, file paths |
| PowerBrowser shell into the orcad process | OrcaService spawns orcad with a built environment, fixed loopback port and bind | Environment variables, port, ready line, pairing material |
| orcad into the host | Hidden Electron switch, data-root alias, reap and quit of the daemon and its agent sessions | Processes, signals, data root |
| orcad egress | Contact with *.onorca.dev and telemetry | Network traffic |
| Live checks into the developer host | Live verification rows that run next to the host's own Orca desktop | Processes, ports, profiles |
| Lane merges into the integration branch | Plan lanes merged into the phase branch | Source history |
| Dependency installs | Orca and Theia package installs | Third-party packages |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-62-01 (plan 62-01) | T | orca-overlay/patches | high | mitigate | scripts/verify-orca-overlay.mjs:77 (WHOLE_FILE: new/deleted/rename/copy/similarity/binary headers) enforced at :222; half-file rule :290-292; SEAM_LINE_BOUND=20 :67, enforced :231-233 via git apply --numstat; recorded upstream_blob compared :285 (orca-overlay/seams.json upstream_blob 90b79e50... for the seam); self-test plants :458-470 (full-rewrite, deleted-file, new-file, 40-line seam, blob changed, pre-image edited) | closed |
| T-62-02 (plan 62-01) | T | build-orca.sh hook | medium | mitigate | scripts/build-orca.sh:95-101 fails 'undeclared modification in orca/' before the reset/checkout at :104-107; scripts/verify-orca-build-shape.mjs:140-149 set equality both ways ('modified tracked file in orca/' :145, 'seam not applied' :147-148); plants :222-223 | closed |
| T-62-03 (plan 62-01) | T | seams.json / files/ paths | medium | mitigate | scripts/build-orca.sh:78-81 overlay_path_ok (no absolute, empty, . or .. segment; restricted charset) applied to seam paths :91-92 (plus blob-at-HEAD check) before git reset/checkout :104-107, to files/ paths :124 before cp :136, and to .pb-overlay-copied entries :130-131 before rm :132; scripts/verify-orca-overlay.mjs:80-83 validPath used :176 and :249; '..' plant :470 | closed |
| T-62-04 (plan 62-01) | T | orca-overlay/files | medium | mitigate | scripts/build-orca.sh:125 refuses 'overlay file shadows upstream path' before any copy; scripts/verify-orca-overlay.mjs:262-279 exact, case-only, under-upstream-file and equals-upstream-directory collisions; plants :471-474 | closed |
| T-62-05 (plan 62-01) | R | patch regeneration | medium | mitigate | scripts/verify-orca-overlay.mjs:294-313 hermetic mkdtemp replay runs scripts/apply-patches.sh (hash before/after assertion, apply-patches.sh:74-92) then regenerate-patches.sh --check; hand-edited-hunk plant :469 | closed |
| T-62-06 (plan 62-01) | E | orcad browser provider | high | mitigate | orca-overlay/patches/010-installed-electron-switch.patch (+3/-0 guard returning [] when environment.ORCA_DISABLE_INSTALLED_ELECTRON_BROWSER === '1' at the top of installedElectronCandidates); declared in orca-overlay/seams.json row 1; applied by scripts/build-orca.sh:111-114; switch set by powerbrowser/shell/OrcaEnv.sys.mjs:28,125; stock-then-switched proof scripts/verify-orca-hidden-electron.mjs:244,251 | closed |
| T-62-SC (plan 62-01) | T | npm/pip/cargo installs | high | mitigate | scripts/build-orca.sh:194 and :202 pnpm install --frozen-lockfile --ignore-scripts unchanged; merge 791eb926 first-parent diff lists 11 paths, none a package manifest or lockfile; git diff 45f8429c..cf7570d8 touches no package.json, yarn.lock, pnpm-lock, Cargo or flake.lock | closed |
| T-62-07 (plan 62-02) | T | OrcaService spawn environment | high | mitigate | powerbrowser/shell/OrcaEnv.sys.mjs:37-63 ORCAD_ENV_ALLOWLIST (no NODE_OPTIONS, ELECTRON_RUN_AS_NODE, XDG_DATA_HOME or foreign ORCA_*), :101-135 buildOrcadEnv copies only allowlist then fixed names; powerbrowser/shell/PowerBrowserAPI.sys.mjs:10995-10997 spawnProcessExact passes environment without environmentAppend; powerbrowser/shell/OrcaService.sys.mjs:412-422 is the only orcad spawn (grep: no other launcher of out/orcad in powerbrowser/); scripts/verify-orca-service-live.mjs:95-117 envVerdict with planted-name instrument check :96-97; scripts/verify-orca-service.mjs:934 steering-name rule, NODE_OPTIONS plant :1119 | closed |
| T-62-08 (plan 62-02) | I | ready line, ring buffer, diagnostics | high | mitigate | powerbrowser/shell/OrcaEnv.sys.mjs:323-382 createOutputSink never passes stdout to pushLog, stderr only through redact :370; parseReadyLine :189-209 returns no pairing field; powerbrowser/shell/OrcaService.sys.mjs:460 stdout to sink only, getState :699-714 has no pairing field, getDiagnosticRows redacts :787, _pushLog redacts :806; scripts/verify-orca-service.mjs:166 sentinel, absence asserted :406, sink-logs-stdout plant :1110; installOutputRedaction in scripts/verify-orca-service-live.mjs:216 and scripts/verify-orca-hidden-electron.mjs:362 | closed |
| T-62-09 (plan 62-02) | S | fixed port and bind | high | mitigate | powerbrowser/shell/OrcaEnv.sys.mjs:65 ORCAD_BIND_HOST 127.0.0.1, :175-183 buildOrcadArgs refuses non-integer, 0 and outside 1024..32767, isLoopbackEndpoint :231-233; powerbrowser/shell/OrcaService.sys.mjs:480-486 pinned_port_unavailable / lock-held unrecoverable (no adoption), :492-495 non-loopback ready line killed; live listening-socket check scripts/verify-orca-service-live.mjs:276-279; scenarios D/E scripts/verify-orca-service.mjs:532-547; plants :1101-1102 | closed |
| T-62-10 (plan 62-02) | T | reap before spawn, stop | high | mitigate | powerbrowser/shell/OrcaService.sys.mjs:281-294 _sameIdentity (pid>0 integer, start ticks compared as strings, mismatch logged and not signalled); every signal goes through it (:308-330, :333-350); _reapLeftover :359-377 removes only its own state file (:372), never orcad.lock or sockets (removeStateFile only at :372, :632 bridge files, :660); PowerBrowserAPI.sys.mjs:1063-1077 kill(pid) with no group form; grep finds no pkill/killall/negative-pid kill; scenario B scripts/verify-orca-service.mjs:442-448, recycled-pid plant :1114 | closed |
| T-62-11 (plan 62-02) | E | quit | high | mitigate | powerbrowser/shell/OrcaService.sys.mjs:616-673 stop lists the tree first (:642-645), ends orcad (:646-655), then daemon and descendants (:657 via _endDaemon :333-350); named blocker registered before any spawn :92-100 through PowerBrowserAPI.sys.mjs:11052-11058; stopAndReap :676-696 kills the snapshot on overrun; live quit phase scripts/verify-orca-service-live.mjs:293-333 with a required agent session (:125); plants scripts/verify-orca-service.mjs:1115-1117 | closed |
| T-62-12 (plan 62-02) | T | data-root alias | medium | mitigate | powerbrowser/shell/OrcaEnv.sys.mjs:248 and :262-274 alias only under XDG_RUNTIME_DIR or HOME/.cache, /tmp refused; powerbrowser/shell/OrcaService.sys.mjs:251-278 ln -sfnT (:266) with a PATH-only environment; live realpath equality scripts/verify-orca-service-live.mjs:107-108; scenario F scripts/verify-orca-service.mjs:563-577 | closed |
| T-62-13 (plan 62-02) | I | egress to *.onorca.dev | medium | mitigate | powerbrowser/endpoint-allowlist.json:144-146 .onorca.dev disposition user-initiated; scripts/lib/endpoint-verdict.mjs:26 fails an unattended user-initiated contact; telemetry off powerbrowser/shell/OrcaEnv.sys.mjs:123-124; idle dial-out recorded scripts/verify-orca-service-live.mjs:288-291; plants scripts/verify-orca-service.mjs:1106-1108 | closed |
| T-62-14 (plan 62-02) | T | live checks and the host's Orca desktop | medium | mitigate | scripts/verify-orca-service-live.mjs:294 Orca CLI environment built from PATH, HOME and the two data-root names only, passed through liveEnv (scripts/lib/firefox-bidi.mjs:192-203 copies only the given object); cleanup identity-gated :382; scripts/verify-orca-hidden-electron.mjs:98-101 signalIdentity, :157-159 orcad env from PATH plus scratch HOME, :222-226 SKIP when an installed Orca exists; stopStrays firefox-bidi.mjs:302-317 identity-gated; no pkill/killall anywhere in the checks | closed |
| T-62-15 (plan 62-02) | E | hidden Electron (switch side) | high | mitigate | powerbrowser/shell/OrcaEnv.sys.mjs:16 switch name, :28 in ORCAD_FIXED_ENV_NAMES, :125 set to '1' in every buildOrcadEnv result; scripts/verify-orca-hidden-electron.mjs:159 stock run deletes the switch, :244 'detector blind' if stock run does not fire, :251 switched-run failure; switch-removed plant scripts/verify-orca-service.mjs:1120 | closed |
| T-62-SC (plan 62-02) | T | npm/pip/cargo installs | high | mitigate | merge bf05b8c5 first-parent diff lists 14 paths, none a package manifest or lockfile; git diff 45f8429c..cf7570d8 changes no package.json/yarn.lock/pnpm-lock/Cargo/flake.lock, so the Theia install stays the audited --ignore-scripts one | closed |
| T-62-16 (plan 62-03) | T | lane merges | high | mitigate | git history: 791eb926 (parents 45f8429c, ea9ac29f) and bf05b8c5 (parents 791eb926, 58199082) are --no-ff merges whose second parents equal the lane heads recorded in 62-03-SUMMARY.md Lanes table; first-parent diffs list 11 and 14 paths, each inside its plan's files_modified; scripts/verify-platform.sh resolution deletes 0 lines against either parent (numstat 24/0 and 10/0), blocks at verify-platform.sh:3888, :3894, :6753, :6757 in 62-01-then-62-02 order. Limit: the refs/heads/<branch> spelling itself is not recoverable from history; the parent hashes are. | closed |
| T-62-17 (plan 62-03) | D | live rows on this host | medium | mitigate | Present: identity-only signalling (scripts/verify-orca-hidden-electron.mjs:98-101, scripts/verify-orca-service-live.mjs:382), no pkill (grep empty), free port 20000-32000 and scratch profile/XDG_CONFIG_HOME (verify-orca-service-live.mjs:228-237), SKIP on an installed Orca (verify-orca-hidden-electron.mjs:222-226). Absent: the pb-live lock. Neither scripts/verify-orca-service-live.mjs nor scripts/verify-orca-hidden-electron.mjs acquires it (only a header comment, verify-orca-service-live.mjs:52-53), and scripts/verify-platform.sh only mentions it in a comment (:6763), so a full or --gate run executes both rows unlocked. Compare scripts/verify-sidecar-origin-gate-live.mjs:38, which re-execs itself under flock. The 62-03 runs under flock are recorded only in 62-03-SUMMARY.md. Non-blocking: medium is below block_on high. | open — below high threshold (non-blocking) |
| T-62-18 (plan 62-03) | T | inventory/brand-tokens.json | medium | mitigate | scripts/scan-brand-residue.mjs:643 fails any row whose observed count differs from expected_count, so a count not measured from the tree cannot pass; rows scan-brand-residue and its self-test at scripts/verify-platform.sh:3664, :3674; inventory/brand-tokens.json scope.exclude (.planning/, inventory/, two rename scripts) names no orca-overlay path (93 values name orca-overlay, 0 of them in an exclude list); commit cf7570d8 adds no exclude entry | closed |
| T-62-19 (plan 62-03) | R | blocker handling | medium | mitigate | .planning/workstreams/orca/phases/62-overlay-gate-and-powerbrowser-run-orcad/62-03-PLAN.md:170 task type checkpoint:decision gate="blocking-human" with no auto_select attribute (the word appears only in prose at :69 and :258); no line starting 'BLOCKER:' in any 62-0N-SUMMARY.md; outcome recorded 62-03-SUMMARY.md:113 ('Task 2: not reached') | closed |
| T-62-SC (plan 62-03) | T | npm/pip/cargo installs | high | mitigate | 62-03's own commits change no package files: dc800b31 touches only scripts/verify-ng-027-reader-callers.mjs, fcb2a1ab and cf7570d8 only .planning files and inventory/brand-tokens.json; git diff 45f8429c..cf7570d8 lists no package.json/lockfile; Orca install stays build-orca.sh:194,202 frozen-lockfile scripts-off | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward the blocking gate*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

*Plan threats: 22 (62-01: 7, 62-02: 10, 62-03: 5), built from the three PLAN threat_model blocks. T-62-SC appears once per plan.*

*Threat flags: none. No SUMMARY file has a "Threat Flags" heading, so no threat-flag entries are added to the register.*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|

No accepted risks.

*Accepted risks do not resurface in future audit runs.*

T-62-17 is OPEN and is not recorded as an accepted risk. It stays in the register for the owner to triage.

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-11-20 | 22 | 21 | 1 | security auditor agent (commit e0c19c54, verdict OPEN_THREATS) |

Auditor notes:

- Phase 62 register: 22 threats (62-01: 7, 62-02: 10, 62-03: 5), built from the three PLAN <threat_model> blocks. None of the plans is a superseded stub. No SUMMARY has a '## Threat Flags' heading, so threat_flags is empty. 21 threats are CLOSED. 1 is OPEN and non-blocking: T-62-17, severity medium, block_on high. Severity-filtered threats_open = 0. The verdict is OPEN_THREATS because the status rule counts any OPEN threat.
- T-62-17 gap: the live rows orca-service-live and orca-hidden-electron do not take the pb-live lock themselves, and neither does the driver. They get it only when someone types flock in front of the command. To close it, either make both scripts re-exec under flock on <git common dir>/pb-live.lock, as scripts/verify-sidecar-origin-gate-live.mjs:38 already does, or record the lock as an accepted operational risk in SECURITY.md.
- HEAD (e0c19c54) has moved past Phase 62, and every mitigation was checked at HEAD:
  - seams.json now has three seams (070 and 080 come from Phase 68). The gate rules still apply to all of them.
  - OrcaEnv and OrcaService now carry Phase 63-68 additions, including a pairing-offer hand-off to a 0600 bridge file (Phase 64). That surface is outside this register.
  - The port pref fallback changed from 0 to 26768 (68-06). T-62-09 stays closed because buildOrcadArgs still enforces 1024..32767 and the loopback bind.
- Owner item outside the register: the 62-03 fix dc800b31 edited the ledger-locked scripts/verify-ng-027-reader-callers.mjs, which is outside 62-03 files_modified and documented as deviation 1 in 62-03-SUMMARY.md. At this session's start the ledger hook still reports its hash as changed against the lock, so the owner's re-lock is still pending.
- Only static reads, grep and git read commands were used. No files were written.

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log (none)
- [ ] `threats_open: 0` confirmed (threats_open is 1: T-62-17, non-blocking)
- [ ] `status: verified` set in frontmatter

**Approval:** pending
