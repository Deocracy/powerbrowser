# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v1.0 — PowerBrowser

**Shipped:** 2026-09-04
**Phases:** 7 | **Plans:** 52 | **Sessions:** autonomous end-of-roadmap batch + human drill session

### What Was Built
- Rebrandable platform tree: `configuration.toml` + `brand/` as the only rebrand inputs, byte-identity-gated generator
- Gecko + Theia branding emitters, icon pipeline, installer fragments; tier-3 Linux build green
- Hook-only patch stack with manifest-consumed upstream pins
- Two-layer verification (static literal scan + runtime artifact checks) in CI
- Sourcerer reproduced as a pure downstream plus adversarial fixtures

### What Worked
- Byte-identity acceptance between Phase 1 (hand-written) and Phase 2 (generated) made the generator self-proving
- Registered planted-fault self-tests on every gate: each check proved it can go red
- Deriving expectations from the tree (never hand-kept lists) caught whole defect classes

### What Was Inefficient
- Verification deferred to end-of-roadmap left 16 requirements formally unchecked despite green code — audit should ride each phase, not the milestone tail
- ROADMAP/state tooling drifted (stale 03-03 checkbox, phase statuses) while execution had moved on
- Release-variant coverage cost was never spent (no `objdir-release`), leaving two rows unrunnable all milestone

### Patterns Established
- One driver, one registry (`verify-platform.sh`): new checks are rows, never sibling drivers
- Every gate ships with a `--self-test` that plants faults and must go red naming the drift
- Set-equality over derivation (both directions) instead of hand-kept expectation lists

### Key Lessons
1. Absence assertions need a proven emitter — never assert a log line is missing unless the code under test is shown to emit it.
2. Identity/legal keys hard-fail with no default; cosmetic keys default with echo — one merge path, provenance-carrying.
3. The canonical product name must be decided before the branding gates are pinned — v1 re-pinned gates around a spaced form v2 renames (NAME-01).

### Cost Observations
- Model mix: executor + verifier subagents (Muse Spark), human only for eyes/heavy-machine drills
- Notable: tier-3 builds (~47–54 min) dominate wall-clock; cheap static gates exist to avoid spending them on typos

---

## Milestone: v1.1 — Hardening and SQL Tabs

**Shipped:** 2026-09-05
**Phases:** 2 | **Plans:** 9 (08: 5, 09: 4) | **Commits:** 74 milestone-scoped

### What Was Built
Canonical PowerBrowser rename with re-pinned gates; self-hosted MAR updates with a real Linux N→N+1 hop; NSIS proven on Nix; npm/local-path extension sources + WebExtensions via ExtensionSettings; minimal crash collector with contract gate + policy; release build + live ESR rebase + Theia re-pin drills; WINDOWS #13/#14 closed.

### What Worked
- Nonstop autonomous defaults (verify→defer, one gap retry, audit-accept, no-reversibility-gates) ran 9 plans across 2 phases with zero human pauses; the only stall (08-04 executor dying mid-plan) recovered by resume-from-WIP.
- Checker-caught verify flaws (piped `--gate`, `||`-masked BiDi proof, wrong `--only` label) never reached execution — the revision loop earned its keep twice.
- Tracer-first ordering falsified the pipeline statically before any host-dependent spend.

### What Was Inefficient
- One executor died with an empty return mid-plan (08-04, ~3h wall before resume detected it); faster heartbeat/stall detection would have reclaimed the idle window.
- milestone.lock lifecycle churned (stale PID lock deleted, recreated, re-deleted) — harmless but noisy across 4 commits.
- audit-open acknowledge cannot match archived deferred-item text — 13 v1.0 items carried by disclosure instead of suppression.

### Patterns Established
- Falsification-branch planning: host-dependent tasks carry exact-error + operator-unblock staged outcomes instead of fake-green or hard blocks.
- Single-writer evidence logs (BUILD.md host-capability record cited by reference, never restated).
- Resume-from-WIP executor protocol for empty-return deaths (verify committed task, adopt tree state, continue).

### Key Lessons
1. Every `<automated>` verify must be failure-capable — pipes, `||` fallbacks, and `2>/dev/null` are the exact shapes checkers must hunt.
2. drills ride inside phases, never a terminal drills phase — v1.1 closed all four v1.0 heavy drills this way.
3. Name packaging hosts per plan with falsification criteria (Nix-first / VM-fallback) — ambiguity is what stalls host work.

### Cost Observations
- Model mix: planner/checker/verifier/reviewer/fixer subagents (Muse Spark), zero human turns during the run
- Sessions: 1 continuous autonomous session, 2026-09-04 → 2026-09-05
- Notable: ~7h wall in builds alone (task-1 rebuild 34m, N+1 54m, release 55m, dev clobber 26m); everything else was static gates in seconds

---

## Milestone: v1.2 — Sign-off Closeout and SQL Store

**Shipped:** 2026-09-05
**Phases:** 3 | **Plans:** 9 (10: 3, 11: 3, 12: 3) | **Tasks:** 22 | **Commits:** 80 milestone-scoped (v1.1..v1.2) | **Closeout:** override (audit `tech_debt`, accepted per standing nonstop rule)

### What Was Built
- 15-box sign-off assembly with the 16-vs-15 count reconciliation recorded and five human UAT sheets staged as runbooks; every cited row re-executed on the final tree, `--quick` green, no sibling driver
- SQL authority/invariant table (six rows) with recorded sign-off governing schema; tabs schema + forward-only migration plan exercised against fixture DBs (23/23) with recorded sign-off
- Chrome-side SQLite writer behind the sole boundary into own `tabs.sqlite` (roundtrip 24/24); readonly `better-sqlite3` query API beside the frozen registry, chrome-side Places + sessionstore reads, emitter-exercising private-absence instrument; nine store gates green (second-writer scan, integrity soak 14/14, ESR rebase drill at live newer tag)

### What Worked
- Re-run beats re-cite at closeout: the 10-03 sweep re-ran every cited row (including full-tier drill rows) on the final tree instead of trusting plan-time citations
- Probe-first staging kept live drills honest — environment-bound halves staged with unblocks rather than fake-green
- Design-before-code ordering held: authority signed before schema, schema exercised before writer

### What Was Inefficient
- Doc-sync drifted from execution three times (3 unchecked boxes + 3 missing summaries + checkbox/Progress-table mismatch) — summaries and box flips should ride the plan-complete commit, not a later pass
- audit-open acknowledge still cannot match archived deferred-item text — 13 v1.0 items carried by disclosure for the second straight close (tooling gap, not process)
- Verifier never ran on any v1.2 phase (standing deferral) — the Nyquist board reads not-validated across all three phases by design

### Patterns Established
- Sync-don't-rebuild for inert packaged data (byte-identical sync into objdirs, no tier-3 rebuild)
- Honest tier placement for gates: static-by-default rows with opt-in `--live` halves, self-exempting scans with plants elsewhere

### Key Lessons
1. Reconciliation beats renumbering — the v1.0 "16" overcount stays on record with the explanation, not silently corrected.
2. An absence test must exercise the emitter — the private-tab instrument stages honestly until startup wiring lands rather than asserting over a path nothing calls.
3. Doc-sync is execution's shadow — if the SUMMARY/box-flip is not in the plan-complete commit, assume it is missing.

### Cost Observations
- Model mix: planner/checker/verifier/reviewer/fixer subagents (Muse Spark), zero human turns during the run
- Sessions: 1 continuous autonomous session, 2026-09-05 (single-day milestone)
- Notable: 80 commits in one day; static gates in seconds carried the closeout — no tier-3 build spent this cycle (ESR drill ran dry-run at live tag)

---

## Milestone: v1.4 — Platform Updates and GUI Close-out

**Shipped:** 2026-10-19
**Phases:** 9 (17–25) | **Plans:** 43 (17: 4, 18: 3, 19: 8, 20: 5, 21: 5, 22: 7, 23: 5, 24: 6, 25: 0); 42 executed, 24-05 (GEN-05 drill) not run | **Commits:** 261 (2026-10-16 → 2026-10-19) | **Closeout:** override chosen by Chris (audit `gaps_found`)

### What Was Built
- OpenCode removed: extension, `[ai]` table, schema key, emitter, verify scripts, registry rows and docs; generator at 53 targets; Theia's AI framework left stock
- Gecko re-pinned to `FIREFOX_153_5_0esr_BUILD1`; four patches replayed byte-unchanged; dev and release builds at 153.5; every full-run red owned by the recorded 153.1 set
- Node 24 dev shell, React 19.2.8 and Theia 1.76.0 in three commits, each with new checks (first-boot surface live check, single-copy row, NG-086 agreement row); packaged Node runtime moved to v24.19.0
- Non-GUI gaps: generator concurrency fix, `planning-paths`, `group-channel` (12 plants), schema v3/v4 ledger rows NG-087/088, `theia-fresh-clone-build`
- 15-UI-SPEC re-pinned to the shipped Panorama; gui08 checks derive from it; tray code removed; quick baseline empty
- Panorama worklist: strip filtered by active group, Undo Close Group, card close, last group kept
- Modes leftovers: name cap 60 while typing, instant panels, Variant B records current, retroactive 14-VERIFICATION; sketch 005 adopted for v1.5
- CI green on pushed `main` (run 39340825244, NG-074 done)
- Not achieved: UAT-01 (A18 failed its Organising half, G-11 not earned; 44 rows deferred to phase 26 under NG-089), PAN-03..06 live checks; 12 defects listed for v1.5 in 24-GAPS.md

### What Worked
- Recording the 153.1 FAIL set before the re-pin made the 153.5 comparison a set check: every red after the move was already owned
- One substrate move per commit (Node, React, Theia) let each commit be gated on its own, with only the 4 baseline gui08 reds after each
- Deriving the gui08 checks from 15-UI-SPEC removed the hand-kept lists and emptied the R33 baseline
- Scripted headless passes over items Chris had not yet run found 11 defects that the static gates and live rows did not; a second agent re-checked each one and could not show it was a script mistake

### What Was Inefficient
- The live UAT phase (24) was planned as one pass over six sheets and did not finish: Chris ran A01–A20, then deferred the rest
- Run 1 of the UAT session was discarded: the reply ("A: ok", "B: ok") contradicted Chris's terminal log, and the session was redone on a fresh profile and config directory
- The permission classifier refused approvals that an agent relayed on Chris's behalf; ledger approvals and re-locks had to be run by Chris in his own terminal
- A compound Bash call in 24-03 was denied by the classifier and had to be split into single commands
- SUMMARY frontmatter bookkeeping drifted again (`requirements-completed` missing in phases 19–23, 22-01 unparseable), leaving 13 requirements reading partial in the audit

### Patterns Established
- Pre-move FAIL baseline file per substrate move (`18-FAILSET-153.1.txt`, `19-FAILSET-1.76.txt`)
- Scripted headless pass as a defect finder, with independent re-check, and never recorded as a UAT result
- UAT results recorded only from Chris's own words; a reply that contradicts the log is held, not used
- Spec-derived checks through a shared parse module (`scripts/lib/ui-spec.mjs`) with planted-drift self-tests

### Key Lessons
1. Static gates do not cover interaction defects. A scripted headless pass over the UAT script found 11 that `--quick` and the live rows missed; run one before a human UAT session.
2. Headless runs have fixed limits: no window focus, Monaco quick-input does not accept Enter, and overlays do not appear in screenshots. Items that depend on these need a human or a different driver.
3. Check a UAT reply against the terminal log before recording it. Run 1 read "ok" while the log showed otherwise.
4. Approvals relayed through an agent are refused by the permission classifier. Plan ledger amends and check re-locks as steps Chris runs himself.
5. A milestone that ends in a human UAT pass needs that pass scheduled with the human, or it closes with the UAT deferred.

### Cost Observations
- Model mix: orchestrator plus planner/executor/verifier/reviewer subagents; human turns for decisions, re-locks, ledger approvals and the A01–A20 live run
- Sessions: autonomous runs over 4 days (2026-10-16 → 2026-10-19)
- Notable: two tier-3 Gecko builds (dev clobber and a 2620 s release build); the rest of the milestone ran on static gates and sidecar live rows

---

## Milestone: v1.5 — Chrome Bar Firefox Parity

**Shipped:** 2026-11-07 (override closeout)
**Phases:** 14 (27–39, inserted 31.1) | **Plans:** 93 | **Commits:** 1557 (2026-10-20 → 2026-11-07)

### What Was Built
- The chrome bar at Firefox-toolbar parity: address bar search and modes, site identity and app menu, page tools, bookmarks and history, tab strip, shell furniture and page context menu, new-window links as web tabs, permission prompts, WebExtensions through the extension tab host (patch 050 regenerated, guards G1–G16)
- Phase 39 close-out: C11, C22, C23, C24 and backlog 999.4–999.16 fixed; four more lane-reported defects and ten review findings fixed on main; real OS input (ydotool behind a pid-gated KWin check) and KWin captures for the human rows; EXT-10 fill against a local Vaultwarden
- Verification: full registry 456 PASS; --gate PASS-WITH-EXCLUSIONS (32 reds keyed to open ledger entries); 41/87 requirements ticked by the evidence rule; 39-HUMAN-CHECKLIST.md (41 items) deferred

### What Worked
- Running Phase 39 as two headless lanes in worktrees sharing one built binary (39-10/11 and 39-12/13) halved the wall time; lanes were forbidden product edits and reported fixes for main, which kept the binary stable under test
- Owner-call batches answered in one AskUserQuestion box per phase, with a one-line recommendation and the live evidence gathered first (batch B after the A4 probe), produced rulings that changed two recommendations
- Gate exclusions bound to open ledger ids: a red is excused only while the entry is open, so the exclusion list cannot go stale silently
- Deriving the human checklist from the pending UAT rows and checking set equality found nothing dropped; the same rule unticked 13 requirements that had been flipped early

### What Was Inefficient
- The full registry run is 3.7 h and ran twice (full and --gate); the plan intended one gate run before and after triage and was cut to one
- Tool churn: roadmap.update-plan-progress blank lines, windows append dropping the milestone field (four entries restored by hand), phase.complete refusing root writes in workstream mode, the evaluation-scope resolver returning 4 of 42 changed files, a stale verification digest after a 4-line review fix
- Verification of phases 27–38 was already stale by the time the milestone closed, because Phase 39 edited their covered files; the override closeout was inevitable once the human checklist was deferred
- An untracked wrangler temp directory from another session turned four quick-gate checks red with EISDIR

### Patterns Established
- Lane worktrees on btrfs: symlink objdir and upstream, reflink-copy Theia build outputs, generate.mjs, info/exclude; headed runs serialized through one flock
- Every real-input or capture step gated on window class AND launched pid, re-checked after the grab, with a plant per refusal path
- Owner batches: evidence task first, then one box per phase, then a recording task; rulings quoted verbatim with the date
- Close-out tick rule: a requirement is ticked only when no UAT row naming it is pending, issue or an open owner call

### Key Lessons
1. A human checklist at the end of a milestone is deferred unless the human session is scheduled (third milestone in a row: v1.0, v1.2, v1.4, now v1.5). Schedule it inside the milestone or plan for an override close.
2. A capture gate and the grab are two steps; another window taking focus during a 25 s spectacle produced a PNG of the owner's other app once. Re-check after the grab and delete on mismatch.
3. Harness bugs masquerade as product bugs (C23 was a BiDi pref, C24 a headless clipboard limit) and the reverse (C22 was a real throw). Diagnose with a control before fixing.
4. Whole-label gate exclusions excuse regressions in extended suites; scenario-scoped exclusions are backlog 999.33.

### Cost Observations
- Model mix: Opus executors for product and harness code, Sonnet for bookkeeping, verifier, security and Nyquist audits, Opus for code review and fixes
- Sessions: one autonomous run 2026-11-05 → 2026-11-07 for Phase 39 (20 plans, 2 lanes), plus the earlier phase runs since 2026-10-20
- Notable: two 3.7 h registry runs and a 24 min release objdir rebuild in 39-19; about 40 headed runs on the owner's desktop across 39-09..39-18

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Sessions | Phases | Key Change |
|-----------|----------|--------|------------|
| v1.0 | batch + drill session | 7 | baseline: generator-core + two-layer verification pattern established |
| v1.1 | 1 continuous autonomous | 2 | nonstop defaults + falsification-branch planning for host work |
| v1.2 | 1 continuous autonomous (single day) | 3 | closeout discipline: re-run-beats-re-cite sweep + design-before-code store |
| v1.4 | autonomous runs over 4 days + one human live UAT session | 9 | pre-move FAIL baselines per upstream move; scripted headless passes as defect finders; UAT deferred by Chris |
| v1.5 | autonomous runs 2026-10-20 → 2026-11-07, two headless lanes in Phase 39 | 14 | pid-gated real OS input and KWin captures for human rows; ledger-bound gate exclusions; evidence-rule requirement ticks |

### Cumulative Quality

| Milestone | Tests | Coverage | Zero-Dep Additions |
|-----------|-------|----------|-------------------|
| v1.0 | --quick 95 rows + per-gate self-tests | static green; human/tier-3 staged | vendored TOML parser, pure-Node ICO/ICNS writers |
| v1.4 | --quick 0 FAIL, empty baseline; full run 237 PASS / 2 FAIL at 22-07 (one owned red, NG-074, closed in Phase 25) | static and live rows green; 44 UAT rows deferred, 12 defects open | none (dependency moves only: Node 24, React 19.2.8, Theia 1.76.0) |
| v1.5 | --quick 328 rows PASS; full run 456 PASS / 32 FAIL all excluded (ledger 25, 28–43) at 77e5d037 | static green; 41/87 requirements ticked, 46 await the 41-item human checklist | ydotool + KWin DBus real-input route, local Vaultwarden fixture via nix store paths |

### Top Lessons (Verified Across Milestones)

1. (seed) Derive expectations from the tree; compare as set equality.
2. Doc-sync bookkeeping (summary frontmatter, box flips) drifts unless it is written in the plan-complete commit (v1.2, v1.4).
3. Human verification deferred to the end of a milestone stays unfinished (v1.0, v1.2, v1.4, v1.5).
