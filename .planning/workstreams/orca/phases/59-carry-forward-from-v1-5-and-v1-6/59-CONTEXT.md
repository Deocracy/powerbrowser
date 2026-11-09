# Phase 59: Carry-forward from v1.5 and v1.6 - Context

**Gathered:** 2026-11-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Every live item deferred from v1.5 and v1.6 is done or re-dated with one owner date, `scripts/verify-platform.sh --gate` passes with no exclusions (or only re-dated ones), and v1.6 is closed on workstream `deploy`. The inventory is `.planning/CARRY-FORWARD-v1.7.md`: CF-01..CF-19 (§4), the v1.5 rows (§1), the unexecuted v1.6 plans (§2) and the deferrals indexed in §5. No v1.7 requirement id maps to this phase; no Orca work happens here.

Out of this phase: Windows VM and unsigned Windows build (CF-10, OWNER-PASS §11), macOS (R4), PROMPT-03 (backlog 999.3, WINDOWS.md 26), deviations WINDOWS.md 25 and 29, the pending UAT sheets (WINDOWS.md 35, NG-089). Each is re-dated, not fixed.

</domain>

<decisions>
## Implementation Decisions

### Owner-step execution model
- **D-01:** Each OWNER-PASS.md section (§1–§13) is a checkpoint inside a plan: the executor shows the section's exact commands in the question box, waits for "done", then runs that section's live probe (gh, curl, the matching gate row) and writes the result into the SUMMARY. Chris never pastes credentials into chat; Claude never holds owner tokens.
- **D-02:** The 41-item v1.5 human checklist (`39-HUMAN-CHECKLIST.md`) and `/gsd-verify-work 29`, `30`, `31` run with Claude driving the browser (gsd-browser plus the KWin real-input gate `pb-kwin.mjs`) and Chris judging pass/fail per item in the box. Results are recorded per item in the plan SUMMARY and as UAT rows.
- **D-03:** Failure rule: a red caused by code gets a gap-closure plan appended to Phase 59 and is fixed before the phase closes; a red that needs Chris (hardware, account, third party) is re-dated under D-09 and the phase continues. Owner rulings R1–R17 and answers A1–A14 are never re-asked.

### Plan grouping and order (cut for parallel Orca sessions)
- **D-04:** Seven plans with disjoint file sets. Three are **lane plans** executed by Claude agents in Orca child workspaces with no input from Chris; four run in this (coordinating) workspace. Only the coordinating session writes STATE.md, ROADMAP.md, WINDOWS.md and the ledger. — **Reversibility:** costly — merging lanes that touch the same files is the merge-trap class recorded for v1.5 phases 33–37.
  - **59-01 (lane):** CF-14, record the live work done by 2026-11-07 ("Live state at parking") in the deploy SUMMARYs for 41-04, 42-04, 43-05, 47-04 and 48-05. Docs only; no build setup needed.
  - **59-02 (lane):** CF-15 code: device-flow token input for `repo-controls` app-list reads (41-04 field 10, DEVICE-FLOW); plan 57-08 (boundary `clearEnv` for `MOZ_CRASHREPORTER_AUTO_SUBMIT` in `PowerBrowserAPI.sys.mjs`, now unblocked); the `/etc/nixos` Codeberg-mirror block delivered as a prepared diff for Chris to apply (Claude cannot run `pkexec`).
  - **59-03 (lane):** backlog 999.28–999.31, all 11 rows: WINDOWS.md 27 (long-press Back focus), 28 (crash-navigate flake), 39, 42, 43 (timing flakes: prompts-live self-test, ng067, page-furniture clipboard), 34, 36, 37, 38, 40, 41 (every-run defects: customize-inert, start-failure copy, pan04 focus, ng-023 ranking, site-identity app-menu, first-boot overflow TypeError). Each fix lands with its gate row green and its WINDOWS.md entry closed by the fix.
  - **59-04 (here, with Chris):** OWNER-PASS §1–§5 and §13: GitHub and Cloudflare remainder (CF-01, CF-02), MAR key ceremony (CF-03), legion runner with the one `/etc/nixos` change (CF-04), ledger amendments NG-075..080 run by Chris (CF-12). Depends on nothing.
  - **59-05 (here, with Chris):** OWNER-PASS §6–§10 and §12: local release build (CF-05), Anthropic workspaces and caps (CF-06), drills (CF-07), first Linux release (CF-08, R12/R13), Nix channel (CF-09), TEL-13 switch-on (CF-11). Depends on 59-04 (keys, runner) and 59-02 (57-08 before TEL-13). §11 Windows is excluded (D-06).
  - **59-06 (here, with Chris):** D-02's checklist and verify-work runs. Depends on the lanes being merged and a dev objdir built from the merged tree.
  - **59-07 (here):** CF-16 Stage F (rebuild dev and release objdirs, build the N+1 MAR, run the hop), `--build` and `--gate`, re-dating under D-09, v1.6 close-out under D-10, the single push gate. Last and single.
- **D-05:** Waves: wave 1 = 59-01, 59-02, 59-03 lanes running at once beside 59-04 here; wave 2 = 59-05 and 59-06, alternating on Chris's attention; wave 3 = 59-07. Ceilings that do not parallelize: owner checkpoints (one Chris), the GUI checklist (one display), the gate (merged tree), Gecko builds (one at a time, about 50 minutes each).
- **D-06:** CF-10 (Windows 11 VM, ISO, licence, disk, `build-windows`) is out of Phase 59 and re-dated under D-09. Linux ships alone (R2 and the 2026-11-01 ruling).

### Lane mechanics (for the planner and the lane briefs)
- **D-07:** A lane is an Orca child workspace of this one, branched from `ServerDestroyer/v1.7-Orca-integration`, with a Claude agent started by `orca worktree create --repo id:321a0514-fcf8-456c-b66d-084bc1ebb684 --name <lane> --parent-worktree active --base-branch ServerDestroyer/v1.7-Orca-integration --agent claude --prompt "<brief>" --json`. The brief names exactly one PLAN.md, forbids edits to STATE.md, ROADMAP.md, WINDOWS.md and the ledger, and requires atomic commits plus the plan SUMMARY on the lane branch. Lanes that run `--quick` need their own `upstream/` (reset with `git -C upstream reset --hard && git -C upstream clean -fd` before `scripts/apply-patches.sh`), `node scripts/generate.mjs`, and the audited Theia install from `docs/BUILD.md`; 59-01 needs none of that.
- **D-08:** Lanes merge into the v1.7 branch one at a time in the order 59-01, 59-02, 59-03 by the coordinating session, which stages new files before trusting the brand scan and re-runs `--quick` after each merge. Lane SUMMARY stub rows are reconciled at merge time, as in the v1.5 lanes run.

### Residue and re-dating
- **D-09:** One owner date for every entry still open after the fixes, named by Chris in the box when 59-07 runs the gate. Each entry keeps its own WINDOWS.md id and its `GATE_KNOWN_OPEN_EXCLUSIONS` row; an entry closes only with its fix. Covers WINDOWS.md 25, 26, 29, 32, 35, CF-10, and any owner step that fails live.

### v1.6 close-out and pushes
- **D-10:** v1.6 closes inside 59-07, after the owner pass and the gate: `--ws deploy` override closeout per R1/R16, tag `v1.6` locally. — **Reversibility:** one-way — a pushed tag is a published contract; this is why the push is gated.
- **D-11:** Nothing is pushed during Phase 59. 59-07 asks Chris once for the whole set: `main` (including the v1.5 close-out commits that are still local), tags `v1.5` and `v1.6`, and `ServerDestroyer/v1.7-Orca-integration` (CF-19).

### Conflicts resolved after research (Chris, 2026-11-08)
- **D-12:** One extra push gate before 59-05. After the wave-1 lanes merge and `--quick` is green, 59-05 opens with a single box asking Chris to push `main` and the v1.7 branch once, so OWNER-PASS §9 (release.yml dispatch on GitHub `main`) and the `ng074-ci-green-on-main` row can run. D-11's end-of-phase gate still covers the `v1.6` tag. Research found `v1.5` is already on origin, so the end set is `main`, `v1.6` and the v1.7 branch. — **Reversibility:** one-way — a push publishes.
- **D-13:** TEL-13 (CF-11, OWNER-PASS §12): the Windows-release condition in plan 57-04 (owner decision 9) is lifted. 59-02 lands 57-08, then 59-05 runs the switch-on against the Linux release only; Windows gets its own switch-on when CF-10 runs. The receiver on crash.powerbrowser.org is already live.
- **D-14 (Chris, 2026-11-08, at the 59-04 §13 checkpoint): "un-defer everything in v1.7".** The eight deferred-approved ledger rows are reopened instead of dropped or marked superseded: NG-078 (release pipeline), NG-079 (updates host), NG-080 (crash-ingest host) move to Phase 59 and close with evidence in plan 59-05; NG-089 (UAT sheets 10, 13, 14, 14.1, 14.1.1, 15) stays on its phase and closes in plan 59-06 when the sheets have recorded results; NG-075 (Windows MSIX), NG-076 (macOS DMG), NG-077 (Windows/macOS install matrix and MAR hop) and NG-081 (per-fixture Gecko builds) stay open on backlog phase 999.2 for a later v1.7 phase. This withdraws R15 (drop NG-075, supersede 076–080) and CF-12, and removes WINDOWS.md 35 from the D-09 re-date set. OWNER-PASS §13 has no commands left to run. — **Reversibility:** reversible — a later `set-status` can defer again with Chris's approval.
- **D-15 (Chris, 2026-11-08, at the 59-04 §2 checkpoint): "I want all of Cloudflare to be on what is free, so no payment is needed; I did not know of a card on file."** Cloudflare runs on free tiers only; no paid plan is ever bought. The OWNER-PASS §3a clause "Workers Paid only if the JWT-mint p95 exceeds 10 ms" is closed as never: a p95 above the Free-plan CPU limit is a code red to fix under D-03, not a purchase. Whether a payment method is on file is UNKNOWN to the owner (it is recorded neither as yes nor as no); follow-up: Chris checks the Cloudflare billing page. The Email Routing destination christopher@deocracy.org stands as the live value. — **Reversibility:** reversible — a later owner ruling can allow a paid plan.

### Research facts that adjust the plan text (not decisions)
- The `repo-controls` app-list reads that are red belong to `slack`, `claude`, `powerbrowser-bot`, `powerbrowser-clock` and `cloudflare-workers-and-pages`. DEVICE-FLOW applies to the bot and clock tokens; the three third-party Apps cannot use device flow, so their lists are proven with a per-slug token variable if Chris supplies one at the checkpoint, otherwise re-dated under D-09. DEVICE-FLOW itself is not re-asked.
- WINDOWS.md has no re-date field. 59-07 adds the mechanism (a coordinator-run script over the existing WINDOWS.md parse/render helpers, dry-run first); `waive` is not it, because a waived entry stops excluding its gate row.
- Lanes close WINDOWS.md entries by listing the ids in their SUMMARY; the coordinator runs `gsd_run windows fixed <id>` at merge (D-07 forbids lane edits to WINDOWS.md).
- No lane has an objdir. The coordinator starts one dev `./mach build` at the start of wave 1 in this workspace; lanes prove Theia-side and harness fixes through `PB_FIREFOX_BIN`/`PB_BACKEND_MAIN` (`scripts/lib/firefox-bidi.mjs:40-44`), and chrome-side `.sys.mjs` fixes are verified here after merge.
- `fixer-isolate-self-test` passes in this worktree on 2026-11-08; the earlier note of a failure is stale. `--quick` takes about 7 minutes here, not seconds.
- The KWin helper is `scripts/lib/pb-kwin.mjs`; `/gsd-verify-work 29/30/31` use the archived `NN-VERIFICATION.md` human items (no UAT files); `.planning/v1.5-LIVE-PASS.md` holds the run order.

### Claude's Discretion
- Exact probe per OWNER-PASS section, SUMMARY wording, lane brief text, the order of fixes inside 59-03, and whether 59-03 opens sub-lanes if its 11 rows prove independent (same disjoint-file rule).
- Open owner values (postal address for `/privacy`, Email Routing mailbox, two Anthropic spend caps, Cloudflare payment method) are collected at the checkpoint that needs them, not asked up front.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Inventory of the carried work
- `.planning/CARRY-FORWARD-v1.7.md` — the complete inventory: §1 v1.5 rows, §2 v1.6 unexecuted plans and "Live state at parking", §3 phase shape and exit criterion, §4 CF-01..CF-19 with owner/Claude marking, §5 deferrals already recorded in v1.6.

### Owner pass and rulings (deploy workstream)
- `.planning/workstreams/deploy/OWNER-PASS.md` — the exact commands for §1–§13 and "Open values and decisions" (A1–A14 settled; still-open values listed).
- `.planning/workstreams/deploy/FINISH-PLAN.md` §1 (R1–R17), §5 (dated deferrals), Stage F — rulings that are not re-asked; the Stage F build and hop sequence for 59-07.
- `.planning/workstreams/deploy/STATE.md` and `phases/*/BLOCKED.md` — what each deploy phase still has open.
- `.planning/workstreams/deploy/phases/57-*/57-08-PLAN.md` — the `clearEnv` plan 59-02 executes.

### v1.5 live items
- `.planning/milestones/v1.5-phases/39-v1-5-close-out/39-HUMAN-CHECKLIST.md` — the 41 items for 59-06.
- `.planning/milestones/v1.5-phases/39-v1-5-close-out/39-20-DECISIONS.md` and `.planning/milestones/v1.5-REQUIREMENTS.md` — the 12 re-tick rows and 46 unticked requirement rows that 59-06 results update.
- UATs for `/gsd-verify-work 29`, `30`, `31` under `.planning/milestones/v1.5-phases/`.
- `.planning/ROADMAP.md` backlog phases 999.28–999.33 — the residue rows; 999.28–999.31 are fixed in 59-03, 999.32–999.33 are owner/environment rows closed by 59-04/59-05/59-07.

### Gate and ledger
- `.planning/WINDOWS.md` entries 22–43 — open entries; 25–43 belong to the v1.5 close-out run.
- `scripts/verify-platform.sh` `GATE_KNOWN_OPEN_EXCLUSIONS` (around line 6499) — the exclusion rows keyed to open WINDOWS.md ids; a closed entry turns its row red again.
- `scripts/ledger-amend.py`, `scripts/ledger-report.py` — the only way to change the ledger (CF-12 amendments are Chris's own approval words).
- `docs/RENEWALS.md` — the Cloudflare token rotation row (CF-13).

### Build and lane setup
- `docs/BUILD.md` — audited Theia install (`--ignore-scripts` plus the drivelist rebuild), `node scripts/generate.mjs` before configure, build timings.
- `CLAUDE.md` — hard rules, the one-registry verification rule, the brand-scan staging trap.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `scripts/verify-platform.sh --only <label>` and `--gate`: every probe a checkpoint needs already exists as a registry row; 59-04/59-05 reuse the deploy live rows (`repo-controls`, `channel-live`, `codeberg-mirror-live`, `upptime-sweep-live`) rather than writing new probes.
- `scripts/lib/pb-kwin.mjs` (KWin real-input gate) and the gsd-browser MCP: the live-GUI loop for 59-06.
- `scripts/fixer-isolate.sh --self-test` passed in this worktree on 2026-11-08 (an earlier failure on 2026-11-05 did not recur).

### Established Patterns
- Patches are regenerated, never text-edited; `upstream/` is reset with `git reset --hard` plus `clean -fd` before `apply-patches.sh` (a `checkout -- .` leaves staged hunks in place).
- A ledger entry closes only with its fix; exclusions bind to open ids.
- The ledger PreToolUse hook rejects any Bash command whose text mentions the ledger directory; edits that need that word go through a script file.

### Integration Points
- Lane merges land on `ServerDestroyer/v1.7-Orca-integration`; `main` receives nothing until the 59-07 push gate.
- v1.6 close-out runs with `--ws deploy` from this tree after merge; the deploy worktree at `~/orca/workspaces/Power-Browser/v1.6-Deployment-setup` is not used for it.

</code_context>

<specifics>
## Specific Ideas

- Chris's words on plan shape: "to be run in as many sessions in orca as fast as possible". The cut above is the fastest shape whose ceilings are his own attention, one display and one build host.
- Lane briefs must be self-contained: the lane agent sees only its brief and the tree.

</specifics>

<deferred>
## Deferred Ideas

- PROMPT-03 tab dialog host (backlog 999.3, WINDOWS.md 26) — stays backlog; re-dated at 59-07.
- Deviations WINDOWS.md 25 (address-bar-live self-test plant) and 29 (extension options page in private windows) — re-dated at 59-07, not fixed in Phase 59.
- UAT sheets with pending results (WINDOWS.md 35, NG-089) — re-dated at 59-07.
- Windows VM and unsigned Windows release (CF-10) — re-dated at 59-07 (D-06).
- macOS (phase 55, R4), Flathub/winget/Homebrew (R6), installer artwork (A7), ESR 175 tasks (R5) — keep their recorded deferrals.

</deferred>

---

*Phase: 59-carry-forward-from-v1-5-and-v1-6*
*Context gathered: 2026-11-08*
