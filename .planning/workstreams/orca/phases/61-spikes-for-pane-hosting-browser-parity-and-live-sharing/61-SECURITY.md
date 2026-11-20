---
phase: "61"
slug: "61-spikes-for-pane-hosting-browser-parity-and-live-sharing"
workstream: orca
milestone: v1.7
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
threats_open_below_block_on: 0
threats_total: 25
threats_closed: 25
asvs_level: 1
block_on: high
register_authored_at_plan_time: true
auditor_verdict: SECURED
audited_commit: e0c19c54
created: "2026-11-20"
---

# Phase 61 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

Phase 61: Spikes for pane hosting, browser parity and live sharing. Workstream orca, milestone v1.7.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Spike scripts to committed output | Measurement, proof and floor-run scripts write results files and READMEs that are committed | Pairing credentials, device tokens, transcript text (must not cross) |
| Spike scripts to orcad | A headless orcad is spawned per run and driven through the Orca CLI | Loopback endpoint, pairing input, CLI commands |
| Orca renderer code to Theia document | Route A hosts Orca renderer code in the authenticated Theia document; Route B uses cross-origin messages | Pairing under the Theia origin, postMessage control messages |
| Spike tooling to the repo and profiles | Builds run against the coordinating workspace's `orca/` tree and fresh browser profiles | Tracked source files, profile state |
| Package installs | Dependency installation for the spike builds | Third-party packages, lockfiles |
| Claude login to live sharing floor run | The floor run spends a Claude login and resumes a session in the background | Session ids, transcripts, extension package contents |
| Lane branches to the coordinating branch | Plan 61-04 merges three lane branches and writes skill references | Lane diffs, skill reference files |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-61-01 (61-01) | I | measure.mjs output, results-*.json, README | high | mitigate | .planning/spikes/004-orca-pane-hosting/measure.mjs:62 installOutputRedaction([]) before any orcad start; :131-133 re-installed with ready.secrets after startOrcad; :203-207 standalone page launched without the fragment, fragment handed over BiDi; :278-280 results body passed through redact() then failIfSecret() before writeFileSync; :285-291 failIfSecret refuses #pairing=, orca://pair, deviceToken. scripts/lib/orca-run.mjs:147-169 redact/installOutputRedaction. Credential grep (pairing=\|code=\|deviceToken) over .planning/spikes/004-orca-pane-hosting/ at HEAD prints nothing; no '#' in any results-*.json. | CLOSED |
| T-61-02 (61-01) | E | orcad spawn | high | mitigate | scripts/lib/orca-run.mjs:177 startOrcad passes --bind 127.0.0.1 --port 0; .planning/spikes/004-orca-pane-hosting/measure.mjs:137 fails unless ready.boundEndpoint matches ^ws://127.0.0.1:<port>; :140 fails unless the web client URL hostname is 127.0.0.1. | CLOSED |
| T-61-03 (61-01) | T | Route B message listener | medium | mitigate | .planning/spikes/004-orca-pane-hosting/page-routes.mjs:210-213 per-widget crypto.randomUUID nonce; :222-226 listener accepts only event.origin === orcad origin and a minted nonce, else obs.rejected += 1; :255-266 forged wrong-origin and wrong-nonce control messages; :450-452 records rejectedMessages and fails unless 2 rejected and no forged widget. results-route-b.json:165 rejectedMessages 2. pb-pane.tsx:29-31 posts with targetOrigin = parentOrigin. | CLOSED |
| T-61-04 (61-01) | E | Route A same-document hosting | medium | accept | Acceptance documented: .planning/spikes/004-orca-pane-hosting/README.md:182-184 (Orca renderer code in the authenticated Theia document, pairing under the Theia origin, T-61-04, a cost for Phase 64 and D-17) and :273; .claude/skills/spike-findings-Power-Browser/references/orca-pane-hosting.md:90-91; 61-01-SUMMARY.md:138-142 owner note. No SECURITY.md accepted-risks log exists yet; orchestrator should enter it there. | CLOSED |
| T-61-05 (61-01) | T | profile and repo state | medium | mitigate | .planning/spikes/004-orca-pane-hosting/measure.mjs:104-113 makeProfile recreates the orcad profile under .mozbuild/p61-01 behind the ~/.cache/pb-p61-01-orca alias; :94-102 throwaway repo recreated per run; :64-70 strips inherited ORCA_* from process.env; :130 orcadEnv; :152-154 every CLI call uses that env. page-routes.mjs:645 withProbeShell; scripts/lib/pb-live-probe.mjs:51-68 fresh profile per run, disposed in finally; standalone route uses withFirefoxPage, which creates a fresh liveProfileDir (scripts/lib/firefox-bidi.mjs:654). | CLOSED |
| T-61-06 (61-01) | T | orca/ tracked files | medium | mitigate | .planning/spikes/004-orca-pane-hosting/build-pb-entry.sh:51 tracked_dirty = git -C orca status --porcelain --untracked-files=no; :54 fails if non-empty before the build; :95 fails if non-empty after; :96-100 fails if any copied input or created directory remains; :43 trap cleanup EXIT. | CLOSED |
| T-61-SC (61-01) | T | package installs | high | mitigate | scripts/build-orca.sh:194 and :202 pnpm install --frozen-lockfile --ignore-scripts; docs/BUILD.md:60 yarn install --ignore-scripts --frozen-lockfile. Lane commits 38e02b88, a84a252a, 7c6ff105, 204dc4ae touch only .planning/ paths (no package.json or lockfile). No pnpm/npm/yarn/npx install command in any spike 004 script; imports resolve to orca/node_modules (vite, react, react-dom) only. | CLOSED |
| T-61-07 (61-02) | I | provider-proof.mjs, results-proof.json | high | mitigate | .planning/spikes/005-orca-browser-parity/provider-proof.mjs:102 installOutputRedaction([]) first in main(); :109-112 re-installed with ready.secrets after startOrcad; :122 pairingInput held in a local; :161 passed to PbS2.start inside the BiDi probe body only, never placed in the out object; :93 CLI output redacted; :164 and :194 attach outcome and failure redacted. Credential grep over .planning/spikes/005-orca-browser-parity/ at HEAD prints nothing. | CLOSED |
| T-61-08 (61-02) | E | S2 host goto handler | medium | mitigate | .planning/spikes/005-orca-browser-parity/s2-host.ts:68-82 serve(): navigate and automation browser.goto call onGoto; createPage/closePage acknowledged with no action; every other command answered failed browser_command_unavailable. provider-proof.mjs:148-159 onGoto is bound to the single tabId the proof opened (widgetOf(tabId).navigate). Tab scoping named as a BRW-03 requirement: README.md:265 and :298; .claude/skills/spike-findings-Power-Browser/references/orca-browser-parity.md:14. | CLOSED |
| T-61-09 (61-02) | I | WebDriver BiDi | low | accept | Acceptance documented: .planning/workstreams/orca/DECISIONS.md:77 (D-11, BiDi only for tests and the spike); .planning/spikes/005-orca-browser-parity/README.md:171-172; provider-proof.mjs:12-14 header. Ability path is webTabNavigate: provider-proof.mjs:133 and :159 WebTabChannel.widgetOf(tabId).navigate. No SECURITY.md accepted-risks log exists yet. | CLOSED |
| T-61-10 (61-02) | T | scripts/orca-browser-parity.mjs | medium | mitigate | scripts/orca-browser-parity.mjs count tripwires: :89 rpc empty, :126 automation constant not found, :128 automation empty, :132 class not found, :134 members empty, :139 cli empty. Self-test: :225-229 SKIP case, :230-242 synthetic fixture names (browser.fixtureAlpha etc.), :243-248 green control must pass before plants, :265-275 nine plants, :277-292 each must go red naming the drift and clean up, :301 fixture removal checked. Rows: scripts/verify-platform.sh:3875 (self-test, quick) and :6752 (full). | CLOSED |
| T-61-11 (61-02) | T | S1 patch and orca/ | high | mitigate | .planning/spikes/005-orca-browser-parity/build-s2-host.sh:22 fails on tracked Orca changes before the build, :36 after; build-pb-entry.sh:54/:95 same for spike 004. README.md:282 S1 patch produced by git diff in scratch clone .mozbuild/p61-02/orca-s1; results.md:17 checked only with git -C orca apply --check. At HEAD orca/src/main/orcad/orcad-browser-provider.ts:18 still reads kind: 'electron' \| 'chromium', so the S1 patch is not applied. (orca/ carries staged Phase 62+ seam patches from orca-overlay/patches, e.g. 010-installed-electron-switch from commit 04974f7a; outside Phase 61.) | CLOSED |
| T-61-SC (61-02) | T | package installs | high | mitigate | scripts/build-orca.sh:194 frozen-lockfile --ignore-scripts install; .planning/spikes/005-orca-browser-parity/build-s2-host.sh:21 and :32 use orca/node_modules/vite; s2-host.ts:20-33 imports only Orca's own modules. Commits 31a7db10, f30e2525, 7748afc2 touch no package.json or lockfile; no install command in any spike 005 script. | CLOSED |
| T-61-12 (61-03) | I | results-floor.json, README | high | mitigate | .planning/spikes/006-orca-live-sharing/floor-run.mjs:85, :119, :181, :206-207, :232-241 populate a fixed key set (ids, counts, commands, names, booleans); :196 transcript lines read only for the marker match; :268-269 write of the fixed key set. results-floor.json:1-73 holds no transcript text. git ls-files .planning/spikes/006-orca-live-sharing lists 0 .jsonl files (also 0 under .planning/spikes and .claude/skills). | CLOSED |
| T-61-13 (61-03) | R | Claude login spend | medium | mitigate | .planning/spikes/006-orca-live-sharing/floor-run.mjs:179 one-line launch prompt, :233 one-line resume prompt, no tool use requested; :44 and :175 --dry-run stops before any model turn. Run record: README.md:184-194 Investigation Trail (two dry runs, one real run, no rerun). | CLOSED |
| T-61-14 (61-03) | I | extension package | high | mitigate | .planning/spikes/006-orca-live-sharing/extension-notes.md:3-7 (extracted with python3 -I zipfile to a scratch directory outside the repo, native binary never extracted, identifiers and one-line fragments only), :17 vsix sha256 bdfbd675... checked before reading; no line in the notes exceeds 200 characters. git ls-files over the 006 directory lists no .vsix, extension.js, package.json or index.js. | CLOSED |
| T-61-15 (61-03) | T | Orca CLI calls | high | mitigate | .planning/spikes/006-orca-live-sharing/floor-run.mjs:113-115 orcadEnv plus assertEnv, failing on any stray ORCA_*; :134 orcad started with orcaEnv; :142-143 every CLI call goes through cli() with env orcaEnv; :251-252 worktree rm uses orcaEnv; :117-118 resume environment strips all ORCA_*; :263-266 removal only when the path starts with $HOME/orca/workspaces/ (or the scratch dir) and contains the nonce. scripts/lib/orca-run.mjs:82-105. | CLOSED |
| T-61-16 (61-03) | I | orcad output | high | mitigate | .planning/spikes/006-orca-live-sharing/floor-run.mjs:46-47 installOutputRedaction(secrets) at module load, before orcad starts; :137 ready.secrets pushed into the same array the filter reads; :139 fails unless bound to a ws://127.0.0.1 endpoint; :147 and :246 error text redacted. Credential grep over the 006 directory at HEAD prints nothing. | CLOSED |
| T-61-17 (61-03) | T | background sessions | medium | mitigate | No script implements this step; it was a recorded manual procedure. .planning/spikes/006-orca-live-sharing/results.md:17 row 5 background resume of the floor session id only; :18 row 6 claude agents --json filtered to that id, no other row read; :19 row 7 claude stop 468b096a, then 0 rows for the id in claude agents --json; :21 control row for the failed first stop attempt. Evidence is the committed run record, not an automated gate. | CLOSED |
| T-61-SC (61-03) | T | package installs | high | mitigate | scripts/build-orca.sh:194 frozen-lockfile --ignore-scripts; .planning/spikes/006-orca-live-sharing/extension-notes.md:6 extension never installed or run. Commits de9da6b7, 4dca4b35, 0649cfe1 touch only the 006 directory and the SUMMARY; no install command in floor-run.mjs. | CLOSED |
| T-61-18 (61-04) | T | lane merges | medium | mitigate | git: merge commits c67ae2cf, 939b69e6, 13b81e62 have second parents 204dc4ae, 7748afc2, 0649cfe1, equal to refs/heads/ServerDestroyer/p61-01, p61-02, p61-03 at HEAD. git diff --name-only merge-base..lane-head gives 15, 13 and 6 paths, all inside the files_modified lists of 61-01-PLAN.md:8-23, 61-02-PLAN.md:8-21, 61-03-PLAN.md:8-14. Recorded in 61-04-SUMMARY.md:69-77. | CLOSED |
| T-61-19 (61-04) | I | skill references and sources copies | high | mitigate | Credential grep (pairing=\|code=\|deviceToken) over .claude/skills/spike-findings-Power-Browser/ at HEAD prints nothing. .claude/skills/spike-findings-Power-Browser/references/orca-live-sharing.md:11 (no transcript text) and :50-51 cite evidence keys (jsonlLinesBefore/After, resumeOutputHasMarker); no assistant/user jsonl records in any non-script skill file. | CLOSED |
| T-61-20 (61-04) | T | brand scan | medium | mitigate | inventory/brand-tokens.json reasons carry COUNT MOVED sentences naming plan 61-04 for the Orca, orca, ORCA, orcad and Orcad rows (for example :1358), each listing the new skill files added; git status shows no untracked or modified file under .claude/skills/spike-findings-Power-Browser, so every skill file is tracked and visible to the git ls-files based scan. The scan itself was not run (static audit). | CLOSED |
| T-61-21 (61-04) | E | RED verdict routing | medium | mitigate | .planning/workstreams/orca/phases/61-spikes-for-pane-hosting-browser-parity-and-live-sharing/61-04-PLAN.md:211 task type checkpoint:decision gate="blocking-human"; no auto_select attribute in the file. All three VERDICT first lines at HEAD are YELLOW (spike 004, 005, 006 README.md), so the checkpoint was correctly not reached (61-04-SUMMARY.md:65). | CLOSED |
| T-61-SC (61-04) | T | package installs | high | accept | Acceptance documented in 61-04-PLAN.md:259 (this plan installs nothing). Premise verified in git: coordinator commits 781082d2, 8321865b, 5f8d6417 and the three merge resolutions touch no package.json, yarn.lock or pnpm lockfile; 61-04-SUMMARY.md:21-22 tech-stack added []. No SECURITY.md accepted-risks log exists yet. | CLOSED |

Threat flags from plan summaries: none. None of the four SUMMARY files has a "## Threat Flags" heading, so no threat-flag entries are added to the register.

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-61-01 | T-61-04 (61-01) | Acceptance documented: .planning/spikes/004-orca-pane-hosting/README.md:182-184 (Orca renderer code in the authenticated Theia document, pairing under the Theia origin, T-61-04, a cost for Phase 64 and D-17) and :273; .claude/skills/spike-findings-Power-Browser/references/orca-pane-hosting.md:90-91; 61-01-SUMMARY.md:138-142 owner note. | Phase 61 plan register (disposition accept) | 2026-11-20 |
| AR-61-02 | T-61-09 (61-02) | Acceptance documented: .planning/workstreams/orca/DECISIONS.md:77 (D-11, BiDi only for tests and the spike); .planning/spikes/005-orca-browser-parity/README.md:171-172; provider-proof.mjs:12-14 header. Ability path is webTabNavigate: provider-proof.mjs:133 and :159 WebTabChannel.widgetOf(tabId).navigate. | Phase 61 plan register (disposition accept) | 2026-11-20 |
| AR-61-03 | T-61-SC (61-04) | Acceptance documented in 61-04-PLAN.md:259 (this plan installs nothing). Premise verified in git: coordinator commits 781082d2, 8321865b, 5f8d6417 and the three merge resolutions touch no package.json, yarn.lock or pnpm lockfile; 61-04-SUMMARY.md:21-22 tech-stack added []. | Phase 61 plan register (disposition accept) | 2026-11-20 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-11-20 | 25 | 25 | 0 | security auditor (commit e0c19c54, static audit) |

Auditor verdict: SECURED. ASVS level 1, block_on high, register authored at plan time.

Auditor notes:

Phase 61 audit, ASVS L1, block_on high. Register has 25 entries: 7 in 61-01, 6 in 61-02, 7 in 61-03 and 5 in 61-04, with T-61-SC appearing in all four plans. All 25 are CLOSED, so threats_open is 0. None of the four SUMMARY files has a "## Threat Flags" heading, so there are no flags to map. No plan is a superseded stub.

Checks run at HEAD e0c19c54, static only:
- The credential grep returns nothing over .planning/spikes/004-orca-pane-hosting, 005-orca-browser-parity, 006-orca-live-sharing and .claude/skills/spike-findings-Power-Browser.
- git ls-files lists no .jsonl file and no extension package file under the spike or skill directories.
- Each lane diff stays inside its plan's files_modified list, and each merge's second parent equals the lane's refs/heads branch head.
- No phase commit touches a package manifest or lockfile.

The audit did not run scan-brand-residue.mjs, verify-platform.sh or any live driver.

Caveats for the orchestrator:
1. T-61-17 has no script. Its evidence is the committed manual run record (006 results.md rows 5-7 plus the control row). T-61-13 rests partly on the README Investigation Trail. Both are medium severity, below block_on, so neither would block even if read as OPEN.
2. The three accepted risks (T-61-04, T-61-09, and T-61-SC in 61-04) are documented in spike READMEs, DECISIONS.md D-11 and the plan register. They are entered in the Accepted Risks Log above.
3. The coordinating workspace's orca/ has three staged tracked modifications at HEAD: config/scripts/orcad-entry-build.mjs, src/main/claude/claude-stream-json-connection.ts and src/main/orcad/orcad-browser-provider.ts. They come from later-phase seam patches under orca-overlay/patches (for example 010-installed-electron-switch, commit 04974f7a, plan 62-01). They are not the Phase 61 S1 patch: the provider kind union still reads 'electron' | 'chromium'. They do not reopen T-61-06 or T-61-11, which applied to the Phase 61 build runs.
4. scripts/orca-browser-parity.mjs was changed later in 0f3e6434 (66-06) to skip orca-overlay copies. Its self-test now depends on orca-overlay/files/src/renderer/src/pb/browser-host/pb-browser-host.ts existing in the repo. If that file is missing, the clean control goes red, so the change fails closed and the T-61-10 tripwires and plants are intact.
5. The spike directories also hold later-phase files (004 p64-probe, 005 p66-*). These are out of scope, and the credential grep is clean over them too.

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-11-20
