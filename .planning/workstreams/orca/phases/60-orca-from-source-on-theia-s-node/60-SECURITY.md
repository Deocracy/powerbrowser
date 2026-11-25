---
phase: "60"
slug: "60-orca-from-source-on-theia-s-node"
workstream: orca
milestone: v1.7
status: draft
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 1
threats_open_below_block_on: 0
threats_total: 29
threats_closed: 28
asvs_level: 1
block_on: high
register_authored_at_plan_time: true
auditor_verdict: ESCALATE
audited_commit: e0c19c54
created: "2026-11-20"
---

# Phase 60 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.
> Phase 60: Orca from source on Theia's Node. Workstream orca, milestone v1.7.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Upstream fetch to tree | scripts/fetch-orca.sh clones the pinned Orca source into an ignored directory | Source code, pinned commit and tag |
| Package install to build | corepack pnpm and frozen lockfiles install Orca dependencies with scripts off | Third-party npm packages |
| Build to second Node | Orca build output must contain no second Node and no Electron | Build artifacts |
| orcad to loopback | orcad bound to 127.0.0.1 with a pairing secret | Pairing URL and secrets, terminal daemon |
| Licence and brand gates | Licence allow-list and brand-residue scan over fetched trees | Licence text, SPDX identifiers, brand tokens |
| Owner sign-in to Orca profile | Owner's own Claude sign-in inside an isolated Orca profile | Claude login, OAuth codes, API keys, orcad key material |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-60-01 (plan 60-01) | Tampering | scripts/fetch-orca.sh | high | mitigate | scripts/fetch-orca.sh:36 clones into <target>.partial; :41-48 compares git rev-parse HEAD with the pinned commit and deletes the partial on mismatch; :49 mv only after a match; :67-73 re-run requires HEAD and refs/tags/$tag^{commit} both equal the commit; :204-206 COMMIT taken from UPSTREAM_ORCA_COMMIT in generated/upstream-pins.env, :197-218 no literal fallback; self-test plants wrong commit :107-117 and tag-object SHA :119-127; registry row scripts/verify-platform.sh:3853 | CLOSED |
| T-60-02 (plan 60-01) | Elevation of Privilege | generate.mjs emitUpstreamPins | medium | mitigate | scripts/lib/config-schema.json:184-197 regex rows for upstreams.orca_tag and upstreams.orca_commit; scripts/generate.mjs:3137-3140 ORCA_PIN_PATTERNS, :3154-3161 one key without the other refused naming the missing key, :3162-3171 emitter regex plus assertEmittable (:1187-1195, UNEMITTABLE :1168) on each key before the unquoted assignment at :3172; report() exits 1 at :1148-1153 | CLOSED |
| T-60-03 (plan 60-01) | Information Disclosure | .gitignore | medium | mitigate | .gitignore:43-45 anchored /orca/ and /orca.partial/; scripts/verify-orca-pin.mjs:59 and :185-188 fail on any tracked path under orca/, on orca/ not ignored, and on .planning/workstreams/orca/STATE.md being ignored; plants :299 (tracked orca/package.json) and :302-303 (unanchored ignore); rows scripts/verify-platform.sh:3851-3852. At HEAD: git ls-files -- orca is empty, check-ignore matches orca/ and orca.partial/ via .gitignore:44-45, and the workstream STATE.md is not ignored (rc 1) | CLOSED |
| T-60-04 (plan 60-01) | Tampering | corepack pnpm 12.14.0 | high | mitigate | Blocking checkpoint record at .planning/workstreams/orca/phases/60-orca-from-source-on-theia-s-node/60-01-SUMMARY.md:116 (owner approval 2026-11-09, packageManager sha512 hex equal to npm dist.integrity hex), as the plan's acceptance criterion requires; the earliest build log .mozbuild/orca-build/build-20261109T213222Z.log is later than 60-01 completion (21:30:25Z). Code half: orca/package.json:410 packageManager pnpm@12.14.0+sha512.c18ba6d8... equals the approved digest; scripts/build-orca.sh:182-189 gets pnpm only through the corepack shim that reads that field and refuses a version mismatch; no COREPACK_INTEGRITY_KEYS, COREPACK_ENABLE_STRICT or registry override in tracked scripts/, .github/ or flake.nix | CLOSED |
| T-60-SC (plan 60-01) | Tampering | npm/pnpm installs | high | mitigate | pnpm cleared at 60-01-SUMMARY.md:116 (owner approval with matching digests); Orca dependencies installed only from the frozen lockfiles at scripts/build-orca.sh:194 (root) and :202 (mobile/), both --frozen-lockfile --ignore-scripts | CLOSED |
| T-60-05 (plan 60-02) | Elevation of Privilege | pnpm install | high | mitigate | scripts/build-orca.sh:194 and :202 pnpm install --frozen-lockfile --ignore-scripts; only Orca first-party steps run: :195 build-workspace-packages.mjs, :196 rebuild:node (orca/package.json script is ensure-native-runtime.mjs --runtime=node, not an Electron rebuild), :206-208 mobile generators (owner decision P60-R4), :209 build:mobile-web, :210 build:orcad, :223 build:web. Orca's postinstall (build-workspace-packages.mjs && rebuild-native-deps.mjs) is never invoked; none of the invoked scripts has a pre/post hook in orca/package.json | CLOSED |
| T-60-06 (plan 60-02) | Tampering | build-orca.sh environment | high | mitigate | scripts/build-orca.sh:170 unsets every ${!ORCA_@}, :171 unsets ELECTRON_RUN_AS_NODE NODE_OPTIONS NODE_REPL_EXTERNAL_MODULE, :172 fails if any ORCA_ variable survives; the six knobs are set afterwards at :175-180, and every Orca build step (:185-223) runs after the scrub | CLOSED |
| T-60-07 (plan 60-02) | Tampering | orca/out (second Node, slot) | high | mitigate | scripts/build-orca.sh:213-220 de-slot removes out/orcad/.server-target, .runtime-node, .version and out/runtimes; scripts/verify-orca-build-shape.mjs:52 and :59-69 derive marker names from orca/src/shared/orcad-artifacts.ts, :113-121 red on any derived marker or out/runtimes, :123-126 red on any node/node.exe file under out/; rows scripts/verify-platform.sh:3860 (quick self-test) and :6730 (full) | CLOSED |
| T-60-08 (plan 60-02) | Elevation of Privilege | Electron in node_modules | medium | mitigate | scripts/build-orca.sh:175 ELECTRON_SKIP_BINARY_DOWNLOAD=1, :179 ORCA_PNPM_GLOBAL_VIRTUAL_STORE=0, :194 and :202 --ignore-scripts; scripts/verify-orca-build-shape.mjs:128-136 red on an ELF/PE file named electron(.exe) or a node_modules/electron/dist directory anywhere under orca/; plants :220-221 | CLOSED |
| T-60-09 (plan 60-02) | Tampering | node-pty native compile | low | accept | Acceptance documented at plan time in .planning/workstreams/orca/phases/60-orca-from-source-on-theia-s-node/60-02-PLAN.md:234 (threat register); no SECURITY.md accepted-risks log exists yet, so the orchestrator must carry it there. Premises hold at HEAD: orca/pnpm-workspace.yaml:122 patches node-pty@1.1.0 from the pinned tree; orca/config/scripts/build-orcad.mjs:325 runs --orcad-smoke-load-check, reached from build-orcad-node.mjs:85 via build:orcad (scripts/build-orca.sh:210); frozen lockfile at scripts/build-orca.sh:194 | CLOSED |
| T-60-SC (plan 60-02) | Tampering | npm/pnpm installs | high | mitigate | scripts/build-orca.sh:193 STORE=.mozbuild/pnpm-store, :194 and :202 --frozen-lockfile --ignore-scripts --store-dir "$STORE" (not the user's global store); pnpm cleared at 60-01-SUMMARY.md:116 | CLOSED |
| T-60-10 (plan 60-03) | Information Disclosure | orcad bind | high | mitigate | scripts/lib/orca-run.mjs:177 spawns out/orcad/orcad.js directly with --bind 127.0.0.1 --port 0 (no 'serve' subcommand); scripts/verify-orca-slotless-start.mjs:97-99 fails unless boundEndpoint starts ws://127.0.0.1:; self-test plant ws://0.0.0.0 at :359; rows scripts/verify-platform.sh:3868 and :6742 | CLOSED |
| T-60-11 (plan 60-03) | Information Disclosure | pairing URL in output | high | mitigate | scripts/lib/orca-run.mjs:132-145 parseReady returns fields only and never the raw line, :108-129 pairingSecrets, :148-155 redact (secrets plus #pairing=, orca://pair?, pair%3F forms), :158-169 installOutputRedaction wraps stdout and stderr; scripts/verify-orca-slotless-start.mjs:231 installs it right after the ready parse, :186/:227/:278 redact error text; sentinel self-test :367-374; probe profile mkdtemp under os.tmpdir() at :191, removed in finally at :203; withProbeShell disposes its PB profile in finally (scripts/lib/pb-live-probe.mjs:67 -> scripts/lib/pb-relaunch.mjs:261-263 rm profileDir and configHome) | CLOSED |
| T-60-12 (plan 60-03) | Tampering | orcad environment | high | mitigate | scripts/lib/orca-run.mjs:78-93 orcadEnv deletes every ORCA_* plus ELECTRON_RUN_AS_NODE, NODE_OPTIONS, NODE_REPL_EXTERNAL_MODULE and sets the five names; :96-105 assertEnv; scripts/verify-orca-slotless-start.mjs:192 builds the env, :221 assertEnv runs before startOrcad at :224; plant with ORCA_PAIRING_CODE at :362. startOrcad passes liveEnv(env) (orca-run.mjs:179), which copies the scrubbed env and only rewrites HOME/XDG and home-relocating names (scripts/lib/firefox-bidi.mjs liveEnv); it re-adds no ORCA_* or Node-steering variable | CLOSED |
| T-60-13 (plan 60-03) | Denial of Service | terminal daemon | medium | mitigate | scripts/lib/orca-run.mjs:256-269 stopOrcad sends SIGTERM to orcad's process group and to health.terminalDaemon.pid, SIGKILL after the grace period, and re-checks liveness through /proc (:244-250); scripts/verify-orca-slotless-start.mjs:198-201 turns any survivor into a FAIL (checkSurvivors :118-122); plant 'daemon survivor' at :365 | CLOSED |
| T-60-14 (plan 60-03) | Elevation of Privilege | hidden Electron from an installed Orca | medium | mitigate | scripts/lib/orca-run.mjs:276-289 installedOrcaPaths derives paths from the orca-ide literals in orca/src/main/orcad/orcad-browser-provider.ts and throws on zero; scripts/verify-orca-slotless-start.mjs:130-131 any existing path makes the row SKIP before orcad starts (:175-179); self-test :392-396 | CLOSED |
| T-60-15 (plan 60-03) | Tampering | probe Node binary | high | mitigate | scripts/lib/orca-run.mjs:46-66 ensurePbNode: readNodePin, verifyArchive on a cached archive or fetchArchive otherwise, extract, and :60-64 --version must equal the pin; scripts/generate-licensing.mjs:224-231 readNodePin requires a 64-hex sha256, :237-242 verifyArchive, :251-268 fetchArchive hashes the .part file and discards a mismatch before rename | CLOSED |
| T-60-16 (plan 60-03) | Information Disclosure | Orca telemetry | low | mitigate | scripts/lib/orca-run.mjs:90-91 orcadEnv sets ORCA_TELEMETRY_DISABLED=1 and DO_NOT_TRACK=1; assertEnv :102-103 requires both; the only Phase 60 tracked orcad spawn (scripts/verify-orca-slotless-start.mjs:192, :221, :224) goes through orcadEnv and assertEnv. Later-phase spawn sites are outside this phase's file scope | CLOSED |
| T-60-SC (plan 60-03) | Tampering | npm/pnpm installs | high | mitigate | No pnpm, npm or yarn invocation in scripts/lib/orca-run.mjs or scripts/verify-orca-slotless-start.mjs (grep count 0); build inputs come from the 60-02 build (scripts/build-orca.sh:194, :202 frozen lockfile, scripts off) | CLOSED |
| T-60-17 (plan 60-04) | Repudiation | licence allow-list | medium | mitigate | scripts/verify-licence-allowlist.mjs:63-66 refusedSpdx (empty, NONE, UNLICENSED, SEE LICENSE*), :82-84 refuses those in allowed_spdx, :101-102 refuses them as a row spdx and requires row spdx in allowed_spdx; inventory/licence-allowlist.json:3 allowed_spdx [MIT, MPL-2.0]; self-test plants :359-370 match the set specified in 60-04-PLAN.md:113 (GPL-3.0-only, SEE LICENSE IN README.md, NONE in allowed_spdx, plus three others); rows scripts/verify-platform.sh:3886-3887. UNLICENSED and empty use the same refusedSpdx path but have no plant of their own | CLOSED |
| T-60-18 (plan 60-04) | Tampering | licence drift on re-pin | medium | mitigate | scripts/verify-licence-allowlist.mjs:497 tree set from git ls-files scripts/fetch-*.sh, :86-91 derivation (empty set is a FAIL), :104-109 each row needs its tracked fetch script, :119-123 LICENSE sha256 compared with licence_file_sha256, :128-130 a fetched tree without a row is red; plants :359-360 (altered licence text) and :367-370 (unrowed fetch-extra.sh, row without fetch script) | CLOSED |
| T-60-19 (plan 60-04) | Tampering | brand gate false green | medium | mitigate | inventory/brand-tokens.json:27 scope.tracked_residue_probes ["orca"], with coincidental Orca rows carrying exact expected_count and only_in; scripts/scan-brand-residue.mjs:179-181 allProbes, :184 and :446 the tracked scan probes with allProbes; self-test 6b :1014-1043 (unclaimed Orca fails condition 4 naming b.txt:1) and 6c :1045-1052 (wrong expected_count red, naming the row); rows scripts/verify-platform.sh:3664 and :3674 | CLOSED |
| T-60-20 (plan 60-04) | Denial of Service | rebase-upstream permanent gate | high | mitigate | scripts/scan-brand-residue.mjs:589-596 scanExtraRoot probes with residue_probes only (no tracked_residue_probes) and main() calls it at :1430; self-test 6d :1054-1068 proves no orca hit in the extra-root pass while a planted residue_probes brand token in the same fixture still fails; scripts/rebase-upstream.sh:97 passes --extra-root; 60-04-SUMMARY.md:134 records --extra-root upstream exit 0 | CLOSED |
| T-60-SC (plan 60-04) | Tampering | npm/pnpm installs | high | mitigate | No pnpm/npm/yarn install in scripts/verify-licence-allowlist.mjs or scripts/scan-brand-residue.mjs (grep count 0); pnpm cleared at 60-01-SUMMARY.md:116 | CLOSED |
| T-60-21 (plan 60-05) | Repudiation | Claude Code extension licence | medium | mitigate | configuration.toml:117-122 declares no [[extensions]] entry; theia/applications/browser/package.json theiaPlugins has 0 entries; inventory/licence-allowlist.json has no Anthropic.claude-code row (its bundled_extensions rows are uBlock Origin and the separate agent-SDK extension, ruling 68-A); git grep for anthropic-claude-code extension id over configuration.toml, theia/applications/*/package.json, inventory/licence-allowlist.json and generated/ returns 0; 60-EXT01-RECORD.md:36. The runtime install by the owner (Task 2) has not run yet | CLOSED |
| T-60-22 (plan 60-05) | Information Disclosure | Claude login, OAuth codes, API keys | high | mitigate | Only the record half can be checked at HEAD: .planning/workstreams/orca/phases/60-orca-from-source-on-theia-s-node/60-EXT01-RECORD.md contains no secret form (grep -Ec 'sk-ant-\|Bearer \|pairing=\|orca://pair\|[?&]code=' = 0). The rest is absent: 60-05 Task 2 (owner's own sign-in) and Task 3 (outcome record and its grep acceptance for token and pairing forms) have not run (60-EXT01-RECORD.md:41 'Pending - deferred to the end-of-milestone human pass (P60-R5)'); 60-05-SUMMARY.md does not exist; the Task 3 grep is only a sentence in 60-05-PLAN.md:158, and no tracked check or row in scripts/verify-platform.sh runs it. Searched: 60-EXT01-RECORD.md, the phase directory, scripts/verify-platform.sh, scripts/ | OPEN |
| T-60-23 (plan 60-05) | Tampering | Orca CLI reaching the real Orca desktop | high | mitigate | scripts/lib/orca-run.mjs:82-93 orcadEnv removes every inherited ORCA_* and sets both ORCA_USER_DATA and ORCA_USER_DATA_PATH to the given profile; assertEnv plant with ORCA_PAIRING_CODE at scripts/verify-orca-slotless-start.mjs:362. Corroboration: orca/ HEAD is the pin 965978bc; orca/out/cli/index.js is present; orca/package.json, pnpm-lock.yaml and mobile/pnpm-lock.yaml are unmodified; the profile .mozbuild/ext01/powerbrowser-orca is mode 700 and gitignored (.gitignore:42); no top-level JSON in the real Orca desktop config names the scratch repo. Caveat: the CLI build and its invocation were one-time inline steps with no tracked script; the --ignore-environment build is recorded only in 60-EXT01-RECORD.md:13 | CLOSED |
| T-60-24 (plan 60-05) | Information Disclosure | orcad profile credentials | low | accept | Acceptance documented at plan time in .planning/workstreams/orca/phases/60-orca-from-source-on-theia-s-node/60-05-PLAN.md:181; no SECURITY.md accepted-risks log exists yet. Partly confirmed: the profile is under gitignored .mozbuild/ext01 (.gitignore:42) at mode 700, not /tmp, and holds no Claude credential file. One premise is wrong: besides the scratch repo registration, the profile holds orcad key material (agent-session-authority.key and orca-e2ee-keypair.json, both mode 600; orca-devices.json; orca-secret-protection.json). It is reached through the symlink ~/.cache/pb-ext01-orca (60-EXT01-RECORD.md:9, :20) | CLOSED |
| T-60-SC (plan 60-05) | Tampering | npm/pnpm installs | high | mitigate | 60-05 commits c55a5700 and e30aae4f change only .planning files, so 60-05 adds no install code. orca/package.json, orca/pnpm-lock.yaml and orca/mobile/pnpm-lock.yaml are unmodified at the pin (git -C orca status clean for those paths). The only install path in the tree is scripts/build-orca.sh:194 and :202 (--frozen-lockfile --ignore-scripts, .mozbuild/pnpm-store). 60-EXT01-RECORD.md:13 and :22-23 record build:packages plus build-cli.mjs with no install | CLOSED |

Threat flags: none. None of the SUMMARY files for plans 60-01 to 60-04 has a "Threat Flags" heading, and 60-05 has no SUMMARY, so no threat-flag entries are added to the register.

*Status: OPEN · CLOSED · OPEN below block_on threshold (non-blocking)*
*Severity: critical > high > medium > low — only OPEN threats at or above workflow.security_block_on (high) count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Escalations

- T-60-22 (high, blocking, OPEN): the mitigation depends on 60-05 Task 2 (the owner signs in himself) and Task 3 (outcome record plus its grep for token and pairing forms). Both are deferred to the end-of-milestone human pass (P60-R5, D-18), so the mitigation is not in place at HEAD and no implementer can put it there. Owner decision needed on how Phase 60's security gate treats it. Options: (a) hold the Phase 60 security sign-off until that pass runs Tasks 2-3, then re-run /gsd-secure-phase 60; (b) record T-60-22 as an accepted open risk until that pass; (c) add a quick registry row that greps 60-EXT01-RECORD.md and the future 60-05-SUMMARY.md for secret forms (sk-ant-, Bearer, pairing=, orca://pair, code=), which makes the Task 3 check permanent.
- T-60-24 (low, non-blocking, CLOSED as a documented accept): the plan's rationale says the profile at .mozbuild/ext01/powerbrowser-orca "holds only the scratch repo registration". At HEAD it also holds orcad key material: agent-session-authority.key and orca-e2ee-keypair.json (both mode 600), orca-devices.json and orca-secret-protection.json. The directory is mode 700 and gitignored. The owner should re-confirm the acceptance with the corrected premise before the orchestrator writes it into the SECURITY.md accepted-risks log.

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-60-01 | T-60-09 | Acceptance documented at plan time in .planning/workstreams/orca/phases/60-orca-from-source-on-theia-s-node/60-02-PLAN.md:234 (threat register). Premises hold at HEAD: orca/pnpm-workspace.yaml:122 patches node-pty@1.1.0 from the pinned tree; orca/config/scripts/build-orcad.mjs:325 runs --orcad-smoke-load-check, reached from build-orcad-node.mjs:85 via build:orcad (scripts/build-orca.sh:210); frozen lockfile at scripts/build-orca.sh:194 | Plan 60-02 threat register | 2026-11-20 (audit) |
| AR-60-02 | T-60-24 | Acceptance documented at plan time in .planning/workstreams/orca/phases/60-orca-from-source-on-theia-s-node/60-05-PLAN.md:181. Partly confirmed: the profile is under gitignored .mozbuild/ext01 (.gitignore:42) at mode 700, not /tmp, and holds no Claude credential file. One premise is wrong: besides the scratch repo registration, the profile holds orcad key material (agent-session-authority.key and orca-e2ee-keypair.json, both mode 600; orca-devices.json; orca-secret-protection.json). It is reached through the symlink ~/.cache/pb-ext01-orca (60-EXT01-RECORD.md:9, :20). The owner should re-confirm with the corrected premise (see Escalations) | Plan 60-05 threat register | 2026-11-20 (audit) |

*Accepted risks do not resurface in future audit runs.*
*T-60-22 is OPEN and is not recorded as accepted.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-11-20 | 29 | 28 | 1 | gsd-security-auditor (commit e0c19c54, verdict ESCALATE) |

Auditor notes:

Phase 60, Orca from source on Theia's Node. ASVS level 1, block_on high. 29 register entries from five plan threat_model blocks (60-01: 5, 60-02: 6, 60-03: 8, 60-04: 5, 60-05: 5). 28 are CLOSED and 1 is OPEN (T-60-22, high). threats_open = 1 (blocking). Paths are relative to the repo root /home/chris/orca/workspaces/Power-Browser/v1.7-Orca-integration at commit e0c19c54. No files were written or modified by the auditor.

Threat flags: none of the four SUMMARY files (60-01 to 60-04) has a "Threat Flags" heading, and 60-05 has no SUMMARY, so the flag list is empty.

60-05 status: this is an owner plan that has not finished (STATE.md:44 and :170), not a superseded stub. Task 1 ran (commit c55a5700, preparation record). Tasks 2-3 are deferred under P60-R5 and D-18. Its threats were judged against what exists at HEAD: T-60-21, T-60-23 and its T-60-SC row are CLOSED, T-60-22 is OPEN, T-60-24 is a documented accept.

Accept dispositions (T-60-09, T-60-24): the acceptance is documented only in the plan threat registers (60-02-PLAN.md:234, 60-05-PLAN.md:181). No SECURITY.md existed, so both are carried into the Accepted Risks Log above. T-60-09's premises were checked in the tree. T-60-24's premise needs the correction listed in Escalations.

Informational observations (not new threats):
1. In scripts/build-orca.sh, the fetch-verify step (:72) and the Phase 62 overlay step (:146, including node -e at :86 and apply-patches.sh) run before the scrub at :170-172. An inherited NODE_OPTIONS therefore reaches that node -e. All of Orca's own build steps run after the scrub, so T-60-06 as written holds. The ordering belongs to Phase 62's code.
2. T-60-16's "every orcad spawn" was checked within this phase's files only. Later-phase spawn sites are outside this phase's scope: scripts/lib/orca-pane-harness.mjs:169, scripts/verify-orca-agent-hooks.mjs:642, scripts/verify-orca-hidden-electron.mjs:160, scripts/verify-orca-browser-host-bundle.mjs:406.
3. T-60-17: UNLICENSED and empty SPDX values are refused by refusedSpdx, but the self-test has no plant for either.
4. The PostToolUse injection scan matched a code= query form in scripts/verify-orca-slotless-start.mjs:292. That is the synthetic self-test sentinel for a pairing URL, not a credential or an instruction.
5. The brand-token counts in inventory/brand-tokens.json have grown since 60-04, through later-phase maintenance. The probe mechanism T-60-19 relies on is unchanged.

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [ ] `threats_open: 0` confirmed (threats_open is 1: T-60-22)
- [ ] `status: verified` set in frontmatter

**Approval:** pending
