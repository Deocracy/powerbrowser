---
phase: 61-spikes-for-pane-hosting-browser-parity-and-live-sharing
verified: 2026-11-10T18:20:00Z
status: human_needed
score: 6/8 must-haves verified
covered_files: [".claude/skills/spike-findings-Power-Browser/SKILL.md", ".planning/spikes/004-orca-pane-hosting/README.md", ".planning/spikes/004-orca-pane-hosting/results-route-a.json", ".planning/spikes/004-orca-pane-hosting/results.md", ".planning/spikes/005-orca-browser-parity/DISPOSITIONS.md", ".planning/spikes/005-orca-browser-parity/README.md", ".planning/spikes/005-orca-browser-parity/results-proof.json", ".planning/spikes/006-orca-live-sharing/README.md", ".planning/spikes/006-orca-live-sharing/extension-notes.md", ".planning/spikes/006-orca-live-sharing/results-floor.json", ".planning/spikes/MANIFEST.md", ".planning/workstreams/orca/phases/61-spikes-for-pane-hosting-browser-parity-and-live-sharing/61-01-PLAN.md", ".planning/workstreams/orca/phases/61-spikes-for-pane-hosting-browser-parity-and-live-sharing/61-01-SUMMARY.md", ".planning/workstreams/orca/phases/61-spikes-for-pane-hosting-browser-parity-and-live-sharing/61-02-PLAN.md", ".planning/workstreams/orca/phases/61-spikes-for-pane-hosting-browser-parity-and-live-sharing/61-02-SUMMARY.md", ".planning/workstreams/orca/phases/61-spikes-for-pane-hosting-browser-parity-and-live-sharing/61-03-PLAN.md", ".planning/workstreams/orca/phases/61-spikes-for-pane-hosting-browser-parity-and-live-sharing/61-03-SUMMARY.md", ".planning/workstreams/orca/phases/61-spikes-for-pane-hosting-browser-parity-and-live-sharing/61-04-PLAN.md", ".planning/workstreams/orca/phases/61-spikes-for-pane-hosting-browser-parity-and-live-sharing/61-04-SUMMARY.md", "scripts/orca-browser-parity.mjs", "scripts/verify-platform.sh"]
covered_digest: "v3:sha256:4c4d4953e8e1b596bba832f29a813d38062afd482394e47c6325ea6ef25596aa"
behavior_unverified: 0
overrides_applied: 0
human_verification:
  - test: "EXT-03 extension half of the floor: with the EXT-01 session, follow .planning/spikes/006-orca-live-sharing/README.md 'Blocked on EXT-01' steps 1-4 (claude-vscode.terminal.open with --resume <id>, and the /open?session=<id> URI) on PowerBrowser's Theia"
    expected: "A stopped Orca-started Claude session reopens inside the Claude Code extension on Theia with its earlier turn visible; result appended to the spike 006 README and 60-EXT01-RECORD.md"
    why_human: "Needs the extension installed and running on PB's Theia (EXT-01, deferred to the end-of-milestone pass under D-18) and a live login; ROADMAP Phase 61 criterion 3 says 'resumed in the extension' and only the CLI half has run evidence"
  - test: "Owner decision on criterion 4 ordering for Phase 63: accept or reject an override"
    expected: "Owner accepts that Phase 63 was planned (63-01..05 at c458f87b, 2026-11-10 08:25; revised 5ca4e24c 08:55) against spike 006's chosen route read from the lane branch (63-CONTEXT.md:49 P63-16, :107, :150-151; 63-03-PLAN.md:87), although the ROADMAP 'Route chosen by Phase 61' line for 63 landed afterwards (8321865b, 09:10); or rejects it"
    why_human: "The ordering clause of criterion 4 cannot be repaired after the fact; only an owner override can settle it. The substance (63 builds the chosen route, with all three YELLOW conditions carried) is verified"
---

# Phase 61: Spikes for pane hosting, browser parity and live sharing Verification Report

**Phase Goal:** The three design questions the remake depends on have measured answers backed by runnable prototypes, so Phases 63, 64 and 66 build a chosen route rather than an assumed one.
**Verified:** 2026-11-10T18:20:00Z
**Status:** human_needed
**Re-verification:** No, initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | SC1: a prototype mounts an Orca pane in a Lumino widget with one React 19.2.8; a pane opened in Orca's client appears as a new Lumino tab through read-only observation; the record names the route, the WebSocket/CSS/memory answers and the seam patches against D-16 | ✓ VERIFIED | `results-route-a.json`: `reactCopies 1`, `reactVersions.theia/bundle 19.2.8`, `ws works`, `observeChannel store`, `observeLatencyMs 91`, `observeWithinOneSecond true`, `observedPaneMounted true`, `perPaneDeltaBytes 43016192`, `cssLeakOut.globalRulesAdded 845`. Routes B and B' JSON present with their own numbers (B `cssLeakIn.measured false`, recorded as such). README 004 table and VERDICT (README.md:240-275) name Route A, 0 seam patches of about ten, fallback B'. Harness `measure.mjs`, `build-pb-entry.sh`, Vite configs present. Specimen is the terminal pane only (condition 2). |
| 2 | SC2: browser-parity record lists every ability derived at the pin by a re-runnable script, with component users and a Gecko disposition; chooses the seam; answers FEATURES.md Q1-8 | ✓ VERIFIED | `verify-platform.sh --only orca-browser-parity` PASS on the pinned tree (v1.4.248): 92 RPC, 65 automation, 83 provider members, 80 CLI specs, 92 rows. Dispositions BiDi 37, BiDi+ 25, actor 3, native 24, impossible 3; tier 1 = 25/9/14/1/1 (50) recounted from DISPOSITIONS.md. Seam S2 proven on `goto` (`results-proof.json`: `attachOutcome accepted`, `hostCommands [createPage..., automation...]`, title matches nonce, `gotoMs 162`). Q1-Q8 answered (README 005); Q3-Q7 marked [ASSUMED] with probes carried as YELLOW conditions; Q8 routed to INJ-01/Phase 67 with the approach. |
| 3 | SC3: the live-sharing record states, with run evidence, whether a running Orca agent can be shared live inside the extension, and shows the floor: a stopped Orca agent resumed in the extension with `--resume` | ? UNCERTAIN (human) | CLI floor VERIFIED by run: `results-floor.json` `resumeOutputHasMarker true`, `jsonlLinesBefore 57 -> After 86`, `agentProcessesBeforeStop 1 -> AfterStop 0`, `resumeExitCode 0`. The "no live share in the extension" answer is from source counts (`extension-notes.md`), not a run. The extension half ("resumed in the extension") has not run; blocked on EXT-01, deferred to the end-of-milestone pass (STATE.md:111). |
| 4 | SC4: before any of Phases 63, 64, 66 is planned, ROADMAP names the route each spike chose | ? UNCERTAIN (owner decision) | ROADMAP.md:149, :176, :208 carry the three lines. 64 and 66 are verbatim copies of README 004:275 and 005:300 (checked by string match); 64 and 66 are not yet planned. 63 line is adapted to P63-16 (61-04-SUMMARY.md:113). Ordering: Phase 63 plans were committed at c458f87b (08:25) and 5ca4e24c (08:55), before the ROADMAP 63 line at 8321865b (09:10). 63-CONTEXT (8299451a, 2026-11-09 22:32) already cited the spike 006 record on the lane branch (63-CONTEXT.md:107) and adopted its route (P63-16, :49). Intent held; the literal ordering did not. |
| 5 | The parity check derives at check time and can go red, both ways, naming the drift | ✓ VERIFIED | `--only orca-browser-parity-self-test` PASS: control green on synthetic names, 9 plants red naming the drift (orphan row, missing row, empty derivation, moved constant, moved file, renamed provider class, empty CLI specs, wrong component set, i18n-key row). Independent plants against the real pinned tree via `check()` in memory: deleting the `browser.goto` row gave `ability browser.goto is derived from the Orca tree and has no row in the table`; dropping `agent` from its users gave `row browser.goto lists users [CLI, main, renderer], the Orca tree gives [CLI, agent, main, renderer]`. |
| 6 | MANIFEST rows 004-006 and the spike-findings skill wrap-up exist | ✓ VERIFIED | MANIFEST.md:71-73 rows plus three idea headings with requirements. Skill: SKILL.md context, Feature Areas rows, Processed Spikes 004-006, wrapped-sessions line; `references/orca-{pane-hosting,browser-parity,live-sharing}.md` carry every YELLOW condition; `sources/00{4,5,6}-*` hold README, results and driver copies. WRAP-UP-SUMMARY.md:51-53. |
| 7 | STATE.md records the deferred EXT-03 extension half | ✓ VERIFIED | STATE.md:111 Deferred Verification row for 61 pointing at the "Blocked on EXT-01" steps. |
| 8 | Hard rules held: no tracked edit under orca/ or theia/ by Phase 61, brand scan green | ✓ VERIFIED | `git diff --name-only -- theia` empty. The one staged change in `orca/` (`src/main/orcad/orcad-browser-provider.ts`) is Phase 62's declared seam `orca-overlay/patches/010-installed-electron-switch.patch`, not the S1 patch (differs from `s1-browser-provider-kind.patch`). `node scripts/scan-brand-residue.mjs` exit 0. Pairing-value grep over spike dirs and skill references finds only code patterns and `<placeholder>` text. |

**Score:** 6/8 truths verified (0 present, behavior-unverified; 2 routed to human)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `.planning/spikes/004-orca-pane-hosting/README.md` | five NOTE answers, VERDICT, Route for Phase 64 | ✓ VERIFIED | VERDICT YELLOW at :240, route line :275 |
| `.planning/spikes/004-orca-pane-hosting/results*.{md,json}` | per-route numbers | ✓ VERIFIED | four JSON files (standalone, a, b, b-prime) |
| `.planning/spikes/004-orca-pane-hosting/measure.mjs`, `build-pb-entry.sh` | harness | ✓ VERIFIED | present, not re-run (live) |
| `scripts/orca-browser-parity.mjs` | derive-and-compare with `--self-test` | ✓ VERIFIED | 314 lines, both rows run green, goes red on plants |
| `scripts/verify-platform.sh` rows | quick self-test row, full row | ✓ VERIFIED | :3861 (quick), :6469 (full) |
| `.planning/spikes/005-orca-browser-parity/DISPOSITIONS.md` | 92 rows, 6-column header | ✓ VERIFIED | 92 rows, 85 `[ASSUMED]` |
| `.planning/spikes/005-orca-browser-parity/README.md` | Q1-8, seam, VERDICT, route | ✓ VERIFIED | VERDICT :285, route :300 |
| `.planning/spikes/006-orca-live-sharing/{README.md,results-floor.json,extension-notes.md,floor-run.mjs}` | floor evidence, route | ✓ VERIFIED | VERDICT :208, route :224 |
| ROADMAP route lines | 3 lines under 63, 64, 66 | ✓ VERIFIED | :149, :176, :208 |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| README `Route for Phase 64:` | ROADMAP.md:176 | verbatim copy | ✓ WIRED | string match |
| README `Route for Phase 66:` | ROADMAP.md:208 | verbatim copy | ✓ WIRED | string match |
| README `Route for Phase 63:` | ROADMAP.md:149 | adapted copy | ✓ WIRED | narrows "bg/attach stays open" to "not built" per P63-16; consistent with 63-03-PLAN.md:87 |
| `orca-browser-parity.mjs` | `orca/src/shared/browser-client-automation-protocol.ts` | `BROWSER_CLIENT_AUTOMATION_METHODS` regex | ✓ WIRED | 65 derived at the pin |
| `orca-browser-parity.mjs` | `DISPOSITIONS.md` | parsed, compared both ways | ✓ WIRED | real-tree plants red |
| SKILL.md | `references/orca-*.md` | Feature Areas rows | ✓ WIRED | three rows |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Parity self-test goes red on 9 plants | `scripts/verify-platform.sh --only orca-browser-parity-self-test` | PASS, 9 plants red naming drift | ✓ PASS |
| Parity row green on the pin | `scripts/verify-platform.sh --only orca-browser-parity` | PASS, 92 RPC / 92 rows | ✓ PASS |
| Parity row red on real-tree drift | in-memory `check('orca', <table minus goto row>)` and users edit | both red, naming `browser.goto` | ✓ PASS |
| Brand scan | `node scripts/scan-brand-residue.mjs` | exit 0 | ✓ PASS |
| Spike live harnesses (measure, provider-proof, floor-run) | not run | live runs excluded on a shared machine | ? SKIP |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| TAB-03 | 61-01, 61-04 | Spike shows how PB observes the client's layout state and how Orca panes mount in Lumino | ✓ SATISFIED | truth 1 |
| BRW-01 | 61-02, 61-04 | Parity spike reconciles the inventory against Gecko, chooses the seam, answers FEATURES Q1-8 | ✓ SATISFIED | truths 2, 5 |
| EXT-03 | 61-03, 61-04 | Spike researches live sharing; resuming a stopped session is the floor | ✓ SATISFIED (requirement text) | Research done and floor proven on the CLI. ROADMAP criterion 3 is stricter ("resumed in the extension") and stays open, see human item 1. REQUIREMENTS.md:118 and :230 show EXT-03 Complete. |

No orphaned requirements: REQUIREMENTS.md maps only TAB-03, BRW-01, EXT-03 to Phase 61.

### YELLOW conditions and where each is carried

**Spike 006 to Phase 63 (planned): all carried.**
1. Extension half of the floor deferred to EXT-01: 63-CONTEXT.md:150, 63-03-PLAN.md:118-119, 63-04-PLAN.md:275, STATE.md:111.
2. No extension live share at 2.1.321: 63-CONTEXT.md:16 (out of scope), 63-03-PLAN.md:87 prohibition.
3. `--bg` plus `claude attach` unproven, not promised: 63-CONTEXT.md:49 and :151, 63-03-PLAN.md:87, ROADMAP.md:149.

**Spike 004 to Phase 64 (not planned): carried only in the spike README (.planning/spikes/004-orca-pane-hosting/README.md:253-266) and the skill reference (references/orca-pane-hosting.md:45-51, :74-77). ROADMAP.md:176 carries condition 1 in part ("stylesheet scoped to the pane root"); Phase 64's success criteria (ROADMAP.md:178-182) carry none of them.**
1. CSS isolation built first and measured with `--route a --measure css`: 0 changed Theia values and 0 changed pane values with both controls registering.
2. Mount the chat pane the same way before the Phase 64 plan is fixed (only the terminal pane was proven).
3. A `@powerbrowser/*` extension hands Theia's React to the bundle via `@theia/core/shared/react`, replacing the appended line in generated `src-gen`; stop inlining assets (42 MB bundle).
4. Every re-pin runs `build-pb-entry.sh` and the standalone mount as the gate for the 17 import paths and the provider set.
Owner note (not blocking): Route A runs Orca renderer code in the authenticated Theia document and keeps the orcad pairing in the Theia origin's storage (D-18 pass).

**Spike 005 to Phase 66 (not planned): carried only in the spike README (.planning/spikes/005-orca-browser-parity/README.md:290-298) and the skill reference (references/orca-browser-parity.md:14, :35, :77-83). Phase 66 criterion 2 (ROADMAP.md:211, "a request naming a tab Orca did not create is refused") covers condition 5 only.**
1. Build a PB-owned runtime client; do not ship the proof's two reaches past Orca's public surface.
2. Treat the 85 `[ASSUMED]` rows as estimates; run bounded probes for Q3 (background input and focus, DPR coordinates) and Q5 (prompts on overlays) before the rows that depend on them.
3. Decide Q4 before any BiDi or BiDi+ row is built: an in-process route to the Gecko command module, or relabel to `actor` (D-11 forbids a BiDi port).
4. Plan `snapshot` as its own piece of work (content actor, ref table, delta baseline; estimated 600-900 lines).
5. Enforce one `browserPageId` to one PB-created tab (BRW-03).
Owner note: S2 reverses P61-05; the owner may override in the end-of-milestone pass.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `.planning/workstreams/orca/ROADMAP.md` | 176, 208 | YELLOW conditions for Phases 64 and 66 not in ROADMAP or STATE | ⚠️ Warning | A planner reading only the route line could miss conditions 2-4 (004) and 1-4 (005). Mitigated by the spike-findings skill, which auto-loads, and the "(spike 00N, verdict YELLOW)" pointer. Should be carried into 64/66 CONTEXT at discuss time. |
| `.planning/spikes/005-orca-browser-parity/README.md` | 7, 85 | `verdict: VALIDATED` and "**VALIDATED**" vs `## VERDICT` YELLOW (:285) | ⚠️ Warning | Internal inconsistency; MANIFEST.md:72 papers over it as "VALIDATED (VERDICT YELLOW)". |
| `.planning/spikes/006-orca-live-sharing/README.md` | 7, 77 | `verdict: PARTIAL` and "**PARTIAL**" vs `## VERDICT` YELLOW (:208) | ⚠️ Warning | Same; MANIFEST.md:73. |
| `.planning/workstreams/orca/REQUIREMENTS.md` | 118, 230 | EXT-03 marked Complete while ROADMAP criterion 3's extension clause is deferred | ⚠️ Warning | Defensible on the requirement text; the open half is tracked in STATE.md:111. |
| `scripts/orca-browser-parity.mjs` | 173, 311 | Main row prints SKIP and exits 0 when `orca/src` is absent | ℹ️ Info | Documented full-tier behaviour; the row cannot go red in a tree without a fetched Orca. |
| `scripts/orca-browser-parity.mjs` | 40-42 | Proves coverage and users, not disposition correctness | ℹ️ Info | Documented; 85 of 92 dispositions remain `[ASSUMED]`. |
| `.claude/skills/spike-findings-Power-Browser/SKILL.md` | requirements block | Lists requirements for ideas 001-003 only | ℹ️ Info | 004-006 requirements live in MANIFEST.md and the reference files. |
| `.planning/workstreams/orca/STATE.md` | 45 | Phase 61 progress row "Not started" | ℹ️ Info | Stale bookkeeping; the orchestrator owns STATE.md. |

No TBD, FIXME or XXX markers in the phase's files.

### Human Verification Required

### 1. EXT-03 extension half of the floor (end-of-milestone pass)

**Test:** With the EXT-01 session, run `.planning/spikes/006-orca-live-sharing/README.md` "Blocked on EXT-01" steps 1-4.
**Expected:** A stopped Orca-started session reopens inside the Claude Code extension on PB's Theia through `claude-vscode.terminal.open` with `--resume <id>` and/or the `/open?session=<id>` URI; record which works.
**Why human:** Needs the extension running on Theia (EXT-01, D-18) and a live login.

### 2. Criterion 4 ordering for Phase 63 (owner decision)

**Test:** Decide whether to accept that Phase 63 was planned against spike 006's route before the ROADMAP line existed.
**Expected:** Accept by adding an override, or reject.
**Why human:** Cannot be fixed after the fact.

To accept, add to this file's frontmatter:

```yaml
overrides:
  - must_have: "Before any of Phases 63, 64 and 66 is planned, this roadmap names the route each spike chose for it"
    reason: "Phase 63 was planned from the spike 006 record on the lane branch (63-CONTEXT P63-16, line 107); the ROADMAP line landed 45 minutes after the plans and matches them. 64 and 66 were named before planning."
    accepted_by: "Chris"
    accepted_at: "<ISO timestamp>"
```

### Gaps Summary

No blocking gap. All three spikes have runnable prototypes with run evidence on disk, the parity check is derived and goes red on drift against the real pinned tree, and all three routes are named in ROADMAP and match their records. Two items go to the human pass: the extension half of criterion 3 (blocked on EXT-01) and an override for the Phase 63 ordering clause of criterion 4. The YELLOW conditions for Phases 64 and 66 exist only in the spike READMEs and the skill references; they should be carried into those phases' CONTEXT when they are discussed.

---

_Verified: 2026-11-10T18:20:00Z_
_Verifier: Claude (gsd-verifier)_
