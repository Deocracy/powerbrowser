# Roadmap: Power Browser

## Milestones

- ✅ **v1.0 PowerBrowser** — Phases 1–7 (shipped 2026-09-04, override closeout — see `.planning/milestones/v1.0-ROADMAP.md`)
- ✅ **v1.1 Hardening and SQL Tabs** — Phases 08–09 (shipped 2026-09-05, hardening-only — see `.planning/milestones/v1.1-ROADMAP.md`)
- ✅ **v1.2 Sign-off Closeout and SQL Store** — Phases 10–12 (shipped 2026-09-05, override closeout — see `.planning/milestones/v1.2-ROADMAP.md`)
- ✅ **v1.3 Browser GUI** — Phases 13–15, inserted 14.1 and 14.1.1, retired 16 (shipped 2026-09-06, verifications deferred — see `.planning/milestones/v1.3-ROADMAP.md`)
- ✅ **v1.4 Platform Updates and GUI Close-out** — Phases 17–25 (shipped 2026-10-19, override closeout: live UAT deferred by Chris under NG-089 — see `.planning/milestones/v1.4-ROADMAP.md`)
- ✅ **v1.5 Chrome Bar Firefox Parity** — Phases 27–39 and inserted 31.1 (shipped 2026-11-07, override closeout: human checklist deferred by Chris, gate PASS-WITH-EXCLUSIONS — see `.planning/milestones/v1.5-ROADMAP.md`)
- 📋 **Future** — GUI-05 unified tab strip, W6 canvas search, release and distribution (backlog 999.2), sketch 005 items 1–2 (one title row, centred address box), the 12 defects in `.planning/milestones/v1.4-phases/24-live-uat-pass/24-GAPS.md`, custom modes driven by mode data instead of hard-coded mode ids, deferred seeds (gui-component-dnd, firefox-parity-tabs) (v1.6+)

## Phases

<details>
<summary>✅ v1.0 PowerBrowser (Phases 1–7) — SHIPPED 2026-09-04</summary>

- [x] Phase 1: Platform Extraction and Rename (21/21 plans)
- [x] Phase 2: Configuration Manifest and Generator Core (9/9 plans)
- [x] Phase 3: Firefox Branding Emitter and Icon Pipeline (4/4 plans)
- [x] Phase 4: Theia Surface — Branding, Extensions, Telemetry (4/4 plans)
- [x] Phase 5: Hook-Only Patches and Upstream Uptake (4/4 plans)
- [x] Phase 6: Two-Layer Verification and Rebranding Docs (6/6 plans)
- [x] Phase 7: Sourcerer as Downstream (4/4 plans)

Archive: `.planning/milestones/v1.0-ROADMAP.md` · Requirements: `.planning/milestones/v1.0-REQUIREMENTS.md` · Tag: `v1.0`

</details>

<details>
<summary>✅ v1.1 Hardening and SQL Tabs (Phases 08–09) — SHIPPED 2026-09-05</summary>

- [x] Phase 08: Installer Hardening + Canonical Rename (5/5 plans)
- [x] Phase 09: Extensions + Crash Pipeline (4/4 plans)

Archive: `.planning/milestones/v1.1-ROADMAP.md` · Requirements: `.planning/milestones/v1.1-REQUIREMENTS.md` · Audit: `.planning/milestones/v1.1-MILESTONE-AUDIT.md` · Tag: `v1.1`

</details>

<details>
<summary>✅ v1.2 Sign-off Closeout and SQL Store (Phases 10–12) — SHIPPED 2026-09-05</summary>

- [x] Phase 10: Sign-off Closeout (3/3 plans) — completed 2026-09-05
- [x] Phase 11: SQL Store Design (3/3 plans) — completed 2026-09-05
- [x] Phase 12: SQL Store Build (3/3 plans) — completed 2026-09-05

Archive: `.planning/milestones/v1.2-ROADMAP.md` · Requirements: `.planning/milestones/v1.2-REQUIREMENTS.md` · Audit: `.planning/milestones/v1.2-MILESTONE-AUDIT.md` · Tag: `v1.2`

</details>

<details>
<summary>✅ v1.3 Browser GUI (Phases 13–16) — SHIPPED 2026-09-06</summary>

- [x] Phase 13: Chrome Bar + Strip-Relocation Spike (5/5 plans, 13-04 and 13-05 gap closure) — completed 2026-09-06
- [x] Phase 14: Modes + Windows & Setups (4/5 plans; 14-05's code landed in d5b8dc1, its two checks were never written — gap G-14.1.1-10, closed by Phase 20 PLAT-02) — completed 2026-09-06
- [x] Phase 14.1: In-Theia Web Tabs (GUI-02) (INSERTED) (3/3 plans) — "+" opens a web tab inside the Theia shell's own tab strip
- [x] Phase 14.1.1: GUI Conformance Sweep (INSERTED) (16/16 plans, three passes) — every `fixable: yes` gap in `14.1.1-UAT.md` closed with a check that goes red without its fix
- [x] Phase 15: Panorama Organising (3/3 plans) — completed 2026-09-06
- [x] Phase 16: AI backend adapter - OpenCode (3/3 plans) — Retired 2026-09-28; code removed in Phase 17 (RM-01)

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 13. Chrome Bar + Strip-Relocation Spike | 5/5 | Complete | 2026-09-06 |
| 14. Modes + Windows & Setups | 3/3 | Complete | 2026-09-06 |
| 15. Panorama Organising | 3/3 | Complete | 2026-09-06 |

Phase 16 record: Retired 2026-09-28 under D2 (b): NG-041..NG-050 and NG-052..NG-062 are
dropped — the opencode adapter is retired for the PowerBrowser-Assistant
plugin, which is planned outside this tree. The adapter cuts fall with the
same decision (selectable `@Pi` / DSH backends, per-line comment-to-steer,
`/btw` ephemeral question, file-wide Supercomplete Tab-accept). Chris:
"Run them for me" (ledger/history/log.jsonl lines 310–330, one drop op per
row, each carrying that answer as its quote). NG-051
(`backend = "off"` starts no opencode process and no `/mcp` endpoint) was kept and built, then
dropped 2026-10-17 (c3929e9) when Phase 17 removed the adapter.
Goal (was): selectable `@OpenCode` backend in sidecar chat with staged
accept/reject review. Requirements (was): AI-01..AI-05, removed in v1.4.
Plans 16-01, 16-02, 16-03 executed.

Archive: `.planning/milestones/v1.3-ROADMAP.md` · Requirements: `.planning/milestones/v1.3-REQUIREMENTS.md` · Audit: `.planning/milestones/v1.3-MILESTONE-AUDIT.md` · Phase directories: `.planning/milestones/v1.3-phases/` · Tag: `v1.3`. The v1.3 archive predates Phases 14.1 and 14.1.1; their full detail sections are in their phase directories and in `git show 41caf8f:.planning/ROADMAP.md`.

</details>

<details>
<summary>✅ v1.4 Platform Updates and GUI Close-out (Phases 17–25) — SHIPPED 2026-10-19 (override closeout)</summary>

- [x] Phase 17: OpenCode Removal (4/4 plans)
- [x] Phase 18: Firefox 153.5.0esr (3/3 plans)
- [x] Phase 19: Node 24, React 19, Theia 1.76.0 (8/8 plans)
- [x] Phase 20: Non-GUI Gaps (5/5 plans)
- [x] Phase 21: Panorama Spec and gui08 Checks (5/5 plans)
- [ ] Phase 22: Panorama Worklist (7/7 plans; live checks deferred under NG-089)
- [x] Phase 23: Modes Leftovers and Sketch 005 Verdict (5/5 plans)
- [ ] Phase 24: Live UAT Pass (5/6 plans; A01–A20 recorded, A18 failed; rest deferred by Chris, NG-089 → phase 26)
- [x] Phase 25: CI Green on Main (run 39340825244 green on 0efb116; NG-074 done)

Known gaps: UAT-01 (deferred), MODE-01 live half (A18), PAN-03..06 live checks (deferred); 12 defects for v1.5 in `.planning/milestones/v1.4-phases/24-live-uat-pass/24-GAPS.md`; Chris's remaining checks in `24-CHRIS-CHECKLIST.md` there.

Archive: `.planning/milestones/v1.4-ROADMAP.md` · Requirements: `.planning/milestones/v1.4-REQUIREMENTS.md` · Audit: `.planning/milestones/v1.4-MILESTONE-AUDIT.md` · Tag: `v1.4`

</details>

<details>
<summary>✅ v1.5 Chrome Bar Firefox Parity (Phases 27–39, inserted 31.1) — SHIPPED 2026-11-07 (override closeout)</summary>

- [x] Phase 27: Groundwork, Navigation Buttons and Page-Focus Keys (8/8 plans) — verification deferred (39-HUMAN-CHECKLIST.md)
- [x] Phase 28: WebExtension Tab Route Spike (0/0 plans) — completed 2026-10-21
- [x] Phase 29: Address Bar Search and Fixup (10/10 plans) — outside the 39 live pass; /gsd-verify-work 29
- [x] Phase 30: Address-Bar Modes and Command Centre (6/6 plans) — outside the 39 live pass; /gsd-verify-work 30
- [x] Phase 31: Site Identity, Permissions and App Menu (5/5 plans) — outside the 39 live pass; /gsd-verify-work 31
- [x] Phase 31.1: Extension Tab Host (INSERTED) (plans complete) — verification deferred
- [x] Phase 32: Page Tools (9/9 plans) — verification deferred (39-HUMAN-CHECKLIST.md)
- [x] Phase 33: Bookmarks, History and the Full Menu (5/5 plans) — verification deferred (39-HUMAN-CHECKLIST.md)
- [x] Phase 34: Tab Strip (5/5 plans) — verification deferred (39-HUMAN-CHECKLIST.md)
- [x] Phase 35: Shell Furniture and Page Context Menu (7/7 plans) — verification deferred (39-HUMAN-CHECKLIST.md)
- [x] Phase 36: New-Window Links as Web Tabs (3/3 plans) — verification deferred (39-HUMAN-CHECKLIST.md)
- [x] Phase 37: Permission Prompts and Dialogs (4/4 plans) — verification deferred (39-HUMAN-CHECKLIST.md)
- [x] Phase 38: WebExtensions (7/7 plans) — verification deferred (39-HUMAN-CHECKLIST.md)
- [x] Phase 39: v1.5 Close-out (20/20 plans) — completed 2026-11-07; human checklist deferred; gate PASS-WITH-EXCLUSIONS at 77e5d037

Archive: `.planning/milestones/v1.5-ROADMAP.md` · Requirements: `.planning/milestones/v1.5-REQUIREMENTS.md` · Audit: `.planning/milestones/v1.5-MILESTONE-AUDIT.md` · Tag: `v1.5`

</details>


## Hard constraints (every phase)

- Never fork or patch Theia core — `@powerbrowser/*` extensions only; never modify Gecko outside the patch stack (hook-only patches)
- Firefox internals only through `powerbrowser/shell/PowerBrowserAPI.sys.mjs`, every touchpoint catalogued in `powerbrowser/INTERNAL-APIS.md`; privileged pages open by enum, never by URL
- One verification driver `scripts/verify-platform.sh` — new checks land as registry rows with `--self-test`, never sibling drivers
- Single chrome-side SQLite writer; sessionstore stays restore authority; groups never sessionstore-coupled
- No `[features]`/`[modes]` manifest flags — modes are data with shipped defaults

## Inherited network egress (carried through the migration, not decided here)

The imported platform allows exactly three Mozilla hosts, all one feature —
Remote Settings, which cannot be disabled without also losing CRLite
certificate revocation, intermediate certificate preloading, and
tracking-protection updates: **firefox.settings.services.mozilla.com**,
**content-signature-2.cdn.mozilla.net**, and
**firefox-settings-attachments.cdn.mozilla.net**. They are named here and in
REQUIREMENTS.md because `verify-platform.sh`'s `allowlist-doc-consistency`
check requires every allow-dispositioned Mozilla host to be documented in this
project's own planning record rather than only inside the allowlist file — an
allow entry nobody had to write down is one nobody has to defend. Repointing
them per a downstream's manifest is Phase 4's TEL-03.

### Phase 39: v1.5 Close-out

**Goal:** Fix every open v1.5 defect and finish the end-of-milestone pass, so v1.5 Chrome Bar Firefox Parity closes with no green-by-exclusion rows (Chris, 2026-11-05: "fix all three", "fix all 13", "every deferral well documented").
**Requirements**: PROMPT-04, PROMPT-06, PROMPT-08 (C22-C24 live), EXT-01..EXT-10 (999.15/999.16), plus the live halves of every v1.5 requirement whose UAT row is still pending
**Depends on:** Phase 38
**Plans:** 20/20 plans executed

**Scope:**
1. Product fixes: C22 the `title=` page tooltip never opens; C23 the saved-login autocomplete popup never opens; C24 Copy Image leaves no image flavour on the clipboard; C11 page-menu dismissal `focusPage()` race (999.10).
2. Every backlog row 999.4-999.16 fixed, none deferred: 999.4 bookmarks-toolbar order-dependent instrument failure; 999.5 nav-keys Back leg with no interaction; 999.6 mode-tokens `*x` flake; 999.11 opener-null plant anchor; 999.12 KDE portal chooser for screen sharing; 999.13 four prompts self-test plants re-sited; 999.14 kwinShot raises the shell before spectacle; 999.15 event-page wake and 999.16 enterprise policies with no stock window — one root cause (`browser-delayed-startup-finished` / `sessionstore-windows-restored` are sent only by a stock window), landing as a regenerated patch 050 plus a Gecko rebuild.
3. `scripts/verify-platform.sh` and `--gate` green with `page-furniture-live` and its self-test included.
4. Every automatable pending UAT item in phases 27, 31.1, 32, 33, 34, 35, 36, 37, 38 run by Claude (live harnesses, gsd-browser, KWin raise + spectacle) and recorded in the UAT file; 32-UAT.md gets the page-tools PASS from the 2026-11-04 sweep; 34-UAT.md is rewritten to the UAT template so `uat.complete-session` parses it.
5. The ~20 owner-decision UAT rows (32 T11; 36 T18; 37 T34-T41; 38 T31-T40) each get a one-line recommendation and are put to Chris per phase through the AskUserQuestion box.
6. Bookkeeping: REQUIREMENTS.md rows v1.5 delivered ticked, ROADMAP boxes for phases 27-38 ticked, WINDOWS.md updated.
7. Anything still unresolved at the end is documented as a backlog row plus a WINDOWS.md entry carrying repro, cause-so-far and the source UAT test, so a later version can pick it up without rediscovery. Human-only checks (human eye, portal click) are collected into one checklist for Chris.

Runs autonomously on main (`/gsd-autonomous`); it stops only for the owner-call batches, the human-only checklist and the push.

Plans:
**Wave 1**
- [x] 39-01-PLAN.md (wave 1) — Baseline: 34-UAT rewritten, real-input gate (pb-kwin), C24 bisect, symlink check, full registry red list in 39-BASELINE.md

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 39-02-PLAN.md (wave 2) — Tracer: C11 page-menu dismissal race fixed end to end (guard, plant, workaround removed, 999.10 ticked)
- [x] 39-03-PLAN.md (wave 2) — Owner batch A: OQ1 plus phases 32, 33, 36, 37, 38 in the box; rulings recorded

**Wave 3** *(blocked on Wave 2 completion)*
- [x] 39-04-PLAN.md (wave 3) — 999.15/999.16: patch 050 sections, guard rows G14/G15, no-compile go-live, live scenarios

**Wave 4** *(blocked on Wave 3 completion)*
- [x] 39-05-PLAN.md (wave 4) — C24 Copy Image and C22 title tooltip, diagnose then fix

**Wave 5** *(blocked on Wave 4 completion)*
- [x] 39-06-PLAN.md (wave 5) — C23 saved-login popup, diagnose then fix; 35 T16-T18 scenarios

**Wave 6** *(blocked on Wave 5 completion)*
- [x] 39-07-PLAN.md (wave 6) — 35 T19-T20 scenarios; page-furniture rows through the registry; 35-UAT recorded

**Wave 7** *(blocked on Wave 6 completion)*
- [x] 39-08-PLAN.md (wave 7) — Harness fixes 999.4, 999.6, 999.5

**Wave 8** *(blocked on Wave 7 completion)*
- [x] 39-09-PLAN.md (wave 8) — Prompts harness 999.14, 999.13, 999.12 (X11 sharing route)

**Wave 9** *(blocked on Wave 8 completion)*
- [x] 39-10-PLAN.md (wave 9) — OQ1 ruling implemented, probe 1 live, 37 T18-T21 scenarios

**Wave 10** *(blocked on Wave 9 completion)*
- [x] 39-11-PLAN.md (wave 10) — 37 T22-T25 scenarios; prompts rows through the registry; 37-UAT recorded

**Wave 11** *(blocked on Wave 10 completion)*
- [x] 39-12-PLAN.md (wave 11) — 999.11 and 36 T12-T16 scenarios; 36-UAT recorded

**Wave 12** *(blocked on Wave 11 completion)*
- [x] 39-13-PLAN.md (wave 12) — 38 T22, T24-T30 scenarios; extension rows through the registry; 38-UAT recorded

**Wave 13** *(blocked on Wave 12 completion)*
- [x] 39-14-PLAN.md (wave 13) — EXT-10 fill on a local Vaultwarden (38 T31, option b)

**Wave 14** *(blocked on Wave 13 completion)*
- [x] 39-15-PLAN.md (wave 14) — Real OS input rows: 27 T1-T4, 34 T1/T6/T13, 36 T5, 38 T23

**Wave 15** *(blocked on Wave 14 completion)*
- [x] 39-16-PLAN.md (wave 15) — 33 T6 edit-greying; 32 and 34 remaining rows; page-tools and tab-strip rows recorded

**Wave 16** *(blocked on Wave 15 completion)*
- [x] 39-17-PLAN.md (wave 16) — Owner batch B: phases 27, 31.1, 34, 35 with live evidence; rulings recorded

**Wave 17** *(blocked on Wave 16 completion)*
- [x] 39-18-PLAN.md (wave 17) — Ruled changes: 31.1 T3 error-page allow-list, 34 T1 drag-handle carve-out

**Wave 18** *(blocked on Wave 17 completion)*
- [x] 39-19-PLAN.md (wave 18) — Full registry and --gate; residuals and follow-ups to backlog rows and WINDOWS.md

**Wave 19** *(blocked on Wave 18 completion)*
- [x] 39-20-PLAN.md (wave 19) — REQUIREMENTS/ROADMAP close-out, the human-only checklist, one human-verify stop

---

## Backlog

### Phase 999.1: SQL-browser-memory (BACKLOG)

**Goal:** [Captured for future planning]
**Requirements:** TBD
**Plans:** 0 plans

Make every tab a SQL row, alongside bookmarks, sessions, and anything else that
can live in SQL.

**Not Databasise.** Databasise is a separate project and will not be in Power
Browser. The out-of-scope line naming Databasise says nothing about whether
this item is in scope — the two were conflated once and must not be again.

**The seam that already exists.** `TabUriRegistry` gives tabs stable URI
identity (the GUI-04 declared bridge interface). Stable tab identity is the
property this would build on, and most browsers do not have it.

**Three migrations, not one:**

- Bookmarks / history — already SQL upstream (`places.sqlite`); expose and
  extend rather than build

- Sessions — `sessionstore` is compressed JSON, not SQL
- Theia workbench layout — separate again
- Tabs — the only layer where the schema would be net-new

**Boundary to respect if this is ever planned:** ARCHITECTURE.md Anti-Pattern 6
— if a downstream needs to change platform behaviour, the platform needs an
extension point; adding a `[features]` flag is the bug, not the fix.

Plans:

- [ ] TBD (promote with /gsd-review-backlog when ready)

### Phase 999.2: Release and distribution (BACKLOG)

Deferred here 2026-09-25 under D4 (a): NG-075..NG-082 (distribution work
that needs hosts, accounts or long builds outside this machine: Windows
MSIX, macOS DMG, install matrix and per-OS MAR hop, release pipeline,
update host, production crash-ingest host, per-fixture builds, Theia re-pin
to 1.75.0). Deferred here 2026-09-28: NG-074 (CI verify on main) and NG-084
(the five v1.2 human UAT sheets) move to Phase 15. Chris: "Run them for me"
for NG-075..NG-082 (ledger/history/log.jsonl lines 332–339) and "Defer all
the checks" for NG-074 and NG-084 (ledger/history/log.jsonl lines 364 and
366), each op carrying the quoted answer.

**Goal:** [Captured for future planning]
**Requirements:** TBD
**Plans:** 0 plans

Plans:

- [ ] TBD (promote with /gsd-review-backlog when ready)

### Phase 999.3: Tab dialog host (PROMPT-03) (BACKLOG)

Deferred here from Phase 37 by Chris 2026-11-03. The live dialog-probe
(`.planning/probes/prompt-probe-verdict.json`) found every stock page dialog
(alert, confirm, prompt, leave-page, HTTP auth) locks the IDE, and no relay is
feasible without widening: cross-domain HTTP auth with spoof protection calls
`gURLBar.setURI` and `setTabLabelForAuthPrompts`, which the shell lacks.

**Goal:** Page dialogs and HTTP auth that do not lock the IDE (PROMPT-03)
**Requirements:** PROMPT-03
**Plans:** 0 plans

Scope: a shell-side TabDialogBox host for web tabs, plus `setURI` and
`setTabLabelForAuthPrompts` routed to the Theia bar and tab strip, all through
`PowerBrowserAPI.sys.mjs`. `verify-permission-prompts.mjs` rule (p) stays green
on the stock-blocks-ide verdict only while REQUIREMENTS.md records this deferral.

Plans:

- [ ] TBD (promote with /gsd-review-backlog when ready)
- [ ] prompts-live dialog and dialog-probe are skipped by derivation until this lands. Repro: `node scripts/verify-prompts-live.mjs --scenario dialog`. Cause so far: stock page dialogs lock the IDE. Source: 37-UAT tests 8 and 9. WINDOWS.md entry 26.

### Phase 999.4: Follow-up — Phase 33 deferred UAT follow-up: Test 3 (BACKLOG)

**Goal:** Resolve the UAT checkpoint deferred during Phase 33 verification
**Source phase:** 33
**Deferred at:** 2026-11-04 during /gsd-verify-work 33 session completion
**Follow-ups:**
- [x] Test 3: bookmarks-toolbar stops in every full address-bar run (3 of 3) on 'broken instrument: the session tab page could not be focused' and passes alone; find the earlier scenario that leaves page focus unreachable (deferred 2026-11-04) — fixed in 39-08 (0b69d339)

### Phase 999.5: Follow-up — Phase 33 deferred UAT follow-up: Test 2 (BACKLOG)

**Goal:** Resolve the UAT checkpoint deferred during Phase 33 verification
**Source phase:** 33
**Deferred at:** 2026-11-04 during /gsd-verify-work 33 session completion
**Follow-ups:**
- [x] Test 2: verify-nav-keys-live drives Back only after a real click in the page (interactWith), so it cannot see an AB-4 style regression; add a navigate leg with no interaction (deferred 2026-11-04) — fixed in 39-08 (039bc791)

### Phase 999.6: Follow-up — Phase 33 deferred UAT follow-up: Test none (BACKLOG)

**Goal:** Resolve the UAT checkpoint deferred during Phase 33 verification
**Source phase:** 33
**Deferred at:** 2026-11-04 during /gsd-verify-work 33 session completion
**Follow-ups:**
- [x] Test none: AB-9: the mode-tokens *x step failed once in four address-bar runs (flaky, minor) (deferred 2026-11-04) — fixed in 39-08 (c17a549d)

### Phase 999.7: Follow-up — Phase 35 deferred UAT follow-up: Test 9 (BACKLOG)

**Goal:** Resolve the UAT checkpoint deferred during Phase 35 verification
**Source phase:** 35
**Deferred at:** 2026-11-04 during /gsd-verify-work 35 session completion
**Follow-ups:**
- [x] Test 9: C22: the title= page tooltip never opens in tooltip-status; the product showTooltip matches upstream browser.js:2016-2038; theia-hover-silent and its plant theia-tooltip-leak wait on it (deferred 2026-11-04) — fixed in 39-05 (22317895)

### Phase 999.8: Follow-up — Phase 35 deferred UAT follow-up: Test 8 (BACKLOG)

**Goal:** Resolve the UAT checkpoint deferred during Phase 35 verification
**Source phase:** 35
**Deferred at:** 2026-11-04 during /gsd-verify-work 35 session completion
**Follow-ups:**
- [x] Test 8: C23: saved-login shows no autocomplete popup on the username field; cause unknown (deferred 2026-11-04) — fixed in 39-06 (f39f6e25)

### Phase 999.9: Follow-up — Phase 35 deferred UAT follow-up: Test 6 (BACKLOG)

**Goal:** Resolve the UAT checkpoint deferred during Phase 35 verification
**Source phase:** 35
**Deferred at:** 2026-11-04 during /gsd-verify-work 35 session completion
**Follow-ups:**
- [x] Test 6: C24: Copy Image leaves only text/html on the clipboard, no image flavour; environment (Wayland image targets) or product not separated (deferred 2026-11-04) — fixed in 39-05 (6f6c39da)

### Phase 999.10: Follow-up — Phase 35 deferred UAT follow-up: Test 6 (BACKLOG)

**Goal:** Resolve the UAT checkpoint deferred during Phase 35 verification
**Source phase:** 35
**Deferred at:** 2026-11-04 during /gsd-verify-work 35 session completion
**Follow-ups:**
- [x] Test 6: C11: a page menu dismissal sends widget.focusPage() a round trip later; when it lands after the next menu opened, chrome focus ends on <body>. The harness now focuses the Theia frame first; the product race itself is unfixed (deferred 2026-11-04) — fixed in 39-02 (a72d906b)

### Phase 999.11: Follow-up — Phase 36 deferred UAT follow-up: Test 9 (BACKLOG)

**Goal:** Resolve the UAT checkpoint deferred during Phase 36 verification
**Source phase:** 36
**Deferred at:** 2026-11-04 during /gsd-verify-work 36 session completion
**Follow-ups:**
- [x] Test 9: the opener-null plant expect string 'opener' can match incidental failure text; anchor it to the failure the plant causes (deferred 2026-11-04) — fixed in 39-12 (7fcde822)

### Phase 999.12: Follow-up — Phase 37 deferred UAT follow-up: Test 6 (BACKLOG)

**Goal:** Resolve the UAT checkpoint deferred during Phase 37 verification
**Source phase:** 37
**Deferred at:** 2026-11-04 during /gsd-verify-work 37 session completion
**Follow-ups:**
- [x] Test 6: screen sharing needs the KDE portal chooser answered by hand; run sharing with a person at the machine (deferred 2026-11-04) — fixed in 39-09 (d891dbe7)

### Phase 999.13: Follow-up — Phase 37 deferred UAT follow-up: Test 17 (BACKLOG)

**Goal:** Resolve the UAT checkpoint deferred during Phase 37 verification
**Source phase:** 37
**Deferred at:** 2026-11-04 during /gsd-verify-work 37 session completion
**Follow-ups:**
- [x] Test 17: four prompts self-test plants misbehave once the self-test gets past sharing: queue-shown-early and activation-wrong-tab stay green, camera-template-missing goes red on an empty device menulist, allow-loads-frame-url goes red on popup not adopted next to its opener; re-site each so it reaches its own failure (deferred 2026-11-04) — fixed in 39-09 (fae88df5)

### Phase 999.14: Follow-up — Phase 37 deferred UAT follow-up: Test 33 (BACKLOG)

**Goal:** Resolve the UAT checkpoint deferred during Phase 37 verification
**Source phase:** 37
**Deferred at:** 2026-11-04 during /gsd-verify-work 37 session completion
**Follow-ups:**
- [x] Test 33: kwinShot does not raise the shell before spectacle, so the dialog probe PNGs are full-desktop captures; raise the shell with the KWin script first (deferred 2026-11-04) — fixed in 39-09 (fae88df5)

### Phase 999.15: Follow-up — Phase 38 deferred UAT follow-up: Test 5 (BACKLOG)

**Goal:** Resolve the UAT checkpoint deferred during Phase 38 verification
**Source phase:** 38
**Deferred at:** 2026-11-04 during /gsd-verify-work 38 session completion
**Follow-ups:**
- [x] Test 5: ext-event-page-wake: browserPaintedPromise resolves only on browser-delayed-startup-finished, which only a stock window sends, so an event page woken by an event never runs with no stock window open. The candidate fix edits upstream ExtensionParent.sys.mjs and must land as a regenerated patch 050 (deferred 2026-11-04) — fixed in 39-04 (735dc25b)

### Phase 999.16: Follow-up — Phase 38 deferred UAT follow-up: Test none (BACKLOG)

**Goal:** Resolve the UAT checkpoint deferred during Phase 38 verification
**Source phase:** 38
**Deferred at:** 2026-11-04 during /gsd-verify-work 38 session completion
**Follow-ups:**
- [x] Test none: enterprise policies (for example SearchEngines Default) are applied only when the first stock window fires sessionstore-windows-restored (EnterprisePoliciesParent.sys.mjs:368-369); a shell-only session never applies them. Same root cause as the event-page wake (deferred 2026-11-04) — fixed in 39-04 (735dc25b)


### Phase 999.17: Follow-up — Phase 38 deferred UAT follow-up: Test 22 (BACKLOG)

**Goal:** Resolve the UAT checkpoint deferred during Phase 38 verification
**Source phase:** 38
**Deferred at:** 2026-11-06 by owner ruling in plan 39-17 (Chris, AskUserQuestion: "Defer to backlog (Recommended)")
**Follow-ups:**
- [ ] Test 22 step 4: with a private stock window opened last, the options page of an extension that is not allowed in private windows opens in that private window, because stock `openOptionsPage` uses `windowTracker.topWindow`; the fix is a patch 050 hunk plus a Gecko rebuild. Matches stock behaviour, so deferred. Repro: 38-UAT test 22 step 4 (scenario `private-access`, session 2). WINDOWS.md entry 29.

### Phase 999.18: Follow-up — Phase 32 deferred UAT follow-up: Test 3 (BACKLOG)

**Goal:** Resolve the UAT follow-up deferred during Phase 39 close-out of Phase 32
**Source phase:** 32
**Deferred at:** 2026-11-05, owner kept the dock tab bar scope (32-UAT test 3); recorded as a backlog row in plan 39-19 on 2026-11-06
**Follow-ups:**
- [ ] Test 3: the dock tab bar in non-Browsing modes shows `codicon-globe` with no favicon, audio mark or mute control (`web-tab.ts:617`, `web-tab.ts:1208`). Repro: open a web tab, switch to Coding or Organising, look at its dock tab. Decision text: owner kept this scope on 2026-11-05. Source: 32-UAT test 3.

### Phase 999.19: Follow-up — Phase 32 deferred UAT follow-up: Test 8 (BACKLOG)

**Goal:** Resolve the UAT follow-up deferred during Phase 39 close-out of Phase 32
**Source phase:** 32
**Deferred at:** 2026-11-05, owner ruling on 32-UAT test 8; recorded as a backlog row in plan 39-19 on 2026-11-06
**Follow-ups:**
- [ ] Test 8: release packaging must make libpulse load for a hand-started `objdir/dist/bin/powerbrowser`; today only the harness `LD_LIBRARY_PATH` finds it. PAGE-05 stands with this packaging follow-up open (owner 2026-11-05). Repro: start the binary by hand with no harness environment and play audio in a web tab. Source: 32-UAT test 8 (32-REVIEW WR-10).

### Phase 999.20: Follow-up — Phase 34 deferred UAT follow-up: Test 15 (BACKLOG)

**Goal:** Resolve the 34-REVIEW info findings the owner left open
**Source phase:** 34
**Deferred at:** 2026-11-06, owner accepted 34-UAT test 15 with IN-01..IN-12 as follow-ups (IN-02 answered by 39-16, 331ed734); recorded as a backlog row in plan 39-19
**Follow-ups:**
- [ ] Test 15: 34-REVIEW IN-03 (pin restore activates every reopened tab, then may re-activate a stale current tab), IN-04 (`sessionRestored` rejection unhandled), IN-05 (multiselect anchor edge cases), IN-06 (plain text with a colon is refused instead of searched), IN-07 (`widget.id` can reach user-facing surfaces), IN-08 (gate check 6 does not follow callees of the three method bodies), IN-09 (`ChromeBarWidget` doc comment documents `TabBookmarkStore`), IN-10 (failure notice can be off-screen and never clears), IN-11 (pins on widgets without a URI are keyed by widget id), IN-12 (lone-tab Close family disabled rather than hidden). Decision text and repro per finding: `.planning/phases/34-tab-strip/34-REVIEW.md`. Source: 34-UAT test 15; IN-03 and IN-11 also source: 34-UAT test 9.
- [ ] Test 14: IN-01, selected tabs show no hover feedback and lose the active tab's background. Repro: Ctrl-click two tabs, hover one (capture `.planning/phases/39-v1-5-close-out/captures/34-T14-badge-and-selection.png`). Source: 34-UAT test 14 and test 15.

### Phase 999.21: Follow-up — Phase 35 deferred UAT follow-up: Test 21 (BACKLOG)

**Goal:** Resolve the UAT follow-up deferred during Phase 39 close-out of Phase 35
**Source phase:** 35
**Deferred at:** 2026-11-06, owner accepted the limitation on 35-UAT test 21; recorded as a backlog row in plan 39-19
**Follow-ups:**
- [ ] Test 21: while the hamburger holds focus, the Edit submenu falls back to the top document (`webTabEditContext` returns the top browsing context), so Cut, Copy, Paste and Undo from it do not reach a focused iframe input. Repro: focus an input inside an iframe, open the hamburger, Edit, Paste. Decision text: owner accepted the limitation 2026-11-06. Source: 35-UAT test 21.

### Phase 999.22: Follow-up — Phase 37 deferred UAT follow-up: Test 35 (BACKLOG)

**Goal:** Resolve the UAT follow-up deferred during Phase 39 close-out of Phase 37
**Source phase:** 37
**Deferred at:** 2026-11-06, owner accepted as a follow-up on 37-UAT test 35; recorded as a backlog row in plan 39-19
**Follow-ups:**
- [ ] Test 35: a click on the sharing indicator should open the Phase 31 site panel, as 37-UI-SPEC asks; 37-02 did not build it. Repro: share the camera from a web tab, click the sharing indicator in the bar. Source: 37-UAT test 35.

### Phase 999.23: Follow-up — Phase 37 deferred UAT follow-up: Test 36 (BACKLOG)

**Goal:** Extensions see a web tab's camera, microphone and screen sharing state
**Source phase:** 37, 38
**Deferred at:** 2026-11-06, owner accepted one follow-up for both tests; recorded as a backlog row in plan 39-19
**Follow-ups:**
- [ ] Test 36: `getTabSharingState` on the tab host returns camera, microphone and screen `undefined` while a track is live, so extensions see no sharing. Repro: share the camera in a web tab, read `browser.tabs.query` sharingState from an extension. Source: 37-UAT test 36; also Phase 38 deferred UAT follow-up: Test 37 (source: 38-UAT test 37).

### Phase 999.24: Follow-up — Phase 37 deferred UAT follow-up: Test 41 (BACKLOG)

**Goal:** Resolve the 37-REVIEW and 38-REVIEW info findings the owner left open
**Source phase:** 37, 38
**Deferred at:** 2026-11-06, owner accepted both review sets as follow-ups; recorded as one backlog row in plan 39-19
**Follow-ups:**
- [ ] Test 41: 37-REVIEW IN-01 (`displayHost` unread, top-level host), IN-02 (a reloaded frontend loses pending-prompt marks), IN-03 (the pending mark copy says permission for a password offer), IN-04 (the cap counts only never-shown records; blocked-popup reads can resolve out of order). Repro per finding: `.planning/phases/37-permission-prompts-and-dialogs/37-REVIEW.md`. Source: 37-UAT test 41.
- [ ] Phase 38 deferred UAT follow-up: Test 38: 38-REVIEW IN-01..IN-08 (icon cache never evicts; `tabs.create` ignores pinned, discarded, title, index; `extensionShortcutOf` dereferences a stopped extension; sidebar `window.close()` throws; install-site failure copy and https host check; listing assets never probed; a popup created before subscribe leaks its panel; the pinned-ids pref is never pruned). Repro per finding: `.planning/phases/38-webextensions/38-REVIEW.md`. Source: 38-UAT test 38.

### Phase 999.25: Follow-up — Phase 38 deferred UAT follow-up: Test 32 (BACKLOG)

**Goal:** Resolve the UAT follow-up deferred during Phase 39 close-out of Phase 38
**Source phase:** 38
**Deferred at:** 2026-11-06, owner kept the leading slot and asked for a backlog row (38-UAT test 32); recorded in plan 39-19
**Follow-ups:**
- [ ] Test 32: move the page-action icon to the trailing slot beside the star, as Firefox does. Decision text: owner kept the leading slot with the pill-text shift on 2026-11-06. Source: 38-UAT test 32.

### Phase 999.26: Follow-up — Phase 38 deferred UAT follow-up: Test 33 (BACKLOG)

**Goal:** Resolve the UAT follow-up deferred during Phase 39 close-out of Phase 38
**Source phase:** 38
**Deferred at:** 2026-11-06, owner deferred to the bridge milestone (38-UAT test 33); recorded in plan 39-19
**Follow-ups:**
- [ ] Test 33: an add-ons site install from a web tab gives no prompt, because the stock add-on prompt host is not shell furniture. Repro: open addons.mozilla.org in a web tab, press Add to PowerBrowser. Decision text: deferred to the bridge milestone (`@powerbrowser/browser-bridge`), owner 2026-11-06. Source: 38-UAT test 33.

### Phase 999.27: Residual — WINDOWS.md 25: address-bar ctrl-d-everywhere plant stays green (BACKLOG)

**Goal:** The address-bar self-test plant ctrl-d-everywhere goes red on bookmark-keys again
**Source phase:** 33 (found in 39-08)
**Deferred at:** 2026-11-07, v1.5 close-out residual and gate exclusion (plan 39-19)
**Follow-ups:**
- [ ] address-bar-live-self-test: plant `ctrl-d-everywhere` stays green on bookmark-keys (39-08: 3 of 3 sessions; 39-19 full run). Repro: `node scripts/verify-address-bar-live.mjs --self-test`. Cause so far: the bookmark command may be disabled while the README editor is current, so Theia skips the planted binding and Monaco keeps Ctrl+D (first lead, not verified). Source: 33-UAT test 1. WINDOWS.md entry 25.

### Phase 999.28: Residual — WINDOWS.md 27: long-press Back leaves focus in the pill (BACKLOG)

**Goal:** A real Escape closes the Back history menu after a hold released off the button
**Source phase:** 27 (found in 39-15)
**Deferred at:** 2026-11-07, v1.5 close-out residual (plan 39-19); product defect, the fix window closed at 39-18
**Follow-ups:**
- [ ] long-press Back: holding Back 600 ms and releasing on the pill leaves keyboard focus in the pill, so a real Escape is the pill's and the history menu stays open (3 of 3 headed real-input runs). Repro: `PB_REAL_INPUT=1 PB_LIVE_HEADED=1 node scripts/verify-nav-keys-live.mjs --scenario long-press`. Cause so far: the release on the pill moves focus there. Source: 27-UAT test 4. WINDOWS.md entry 27.

### Phase 999.29: Residual — WINDOWS.md 28: page-tools crash-navigate flake (BACKLOG)

**Goal:** crash-navigate passes in every registry run
**Source phase:** 32 (found in 39-16)
**Deferred at:** 2026-11-07, v1.5 close-out residual and gate exclusion (plan 39-19)
**Follow-ups:**
- [ ] page-tools-live crash-navigate: 'a URL sent to a crashed tab did not load it (no loaded push with crashed false)', 1 of 3 registry runs on 2026-11-06; passed in the 39-19 full run. Repro: `node scripts/verify-page-tools-live.mjs --scenario crash-navigate`. Cause so far: not isolated. Source: 32-UAT test 1. WINDOWS.md entry 28.

### Phase 999.30: Residual — v1.5 close-out full run: harness reliability (BACKLOG)

**Goal:** The three registry rows that went red for timing reasons in the 39-19 full run are deterministic
**Source phase:** 39 (plan 39-19 full run at 6ac27ac2)
**Deferred at:** 2026-11-07, gate exclusions keyed to the entries below
**Target:** v1.6 (Chris 2026-11-07)
**Follow-ups:**
- [ ] prompts-live-self-test: plant `allow-loads-frame-url` goes red on 'popup not adopted next to its opener' instead of its own failure, 2 of 3 runs. Repro: `scripts/verify-platform.sh --only prompts-live-self-test`. Cause so far: the 39-09 re-site (999.13) does not reach the plant's failure reliably. Source: 37-UAT test 17. WINDOWS.md entry 39.
- [ ] ng067-frontend-errors-reach-telemetry: 'no frontend.uncaught-error event was sent', red 1 of 3. Repro: `scripts/verify-platform.sh --only ng067-frontend-errors-reach-telemetry`. Cause so far: not isolated. Source: no UAT test (NG-067). WINDOWS.md entry 42.
- [ ] page-furniture-live-self-test: clean control 'Copy Image Link did not put the image URL on the clipboard', red 1 of 3. Repro: `scripts/verify-platform.sh --only page-furniture-live-self-test`. Cause so far: headless clipboard read-back timing. Source: 35-UAT test 6. WINDOWS.md entry 43.

### Phase 999.31: Residual — v1.5 close-out full run: defects red at every run (BACKLOG)

**Goal:** Fix the six rows red in 39-BASELINE and again in the 39-19 full run and its rerun
**Source phase:** 39 (39-BASELINE "new" rows; owned by no fix plan)
**Deferred at:** 2026-11-07, v1.5 close-out residuals; the phase's fix window closed at 39-18
**Target:** v1.6 (Chris 2026-11-07)
**Follow-ups:**
- [ ] verify-customize-inert: 'state 1 vs state 3 pixels identical, the CSS layer had no effect'. Repro: `scripts/verify-platform.sh --only verify-customize-inert`. Cause so far: the script writes `$XDG_CONFIG_HOME/powerbrowser/customize.css`; the supervised frontend may read another config dir. Source: no UAT test (CUST-01). WINDOWS.md entry 34.
- [ ] start-failure-shows-error (MIG-04): the planted settings-folder failure is reported as 'waiting for the backend's readiness announcement'. Repro: `scripts/verify-platform.sh --only start-failure-shows-error`. Cause so far: the 3000 ms readiness backstop fires first. Source: no UAT test (MIG-04). WINDOWS.md entry 36.
- [ ] pan04-undo-close-group-live (g): after the commit, focus is on a `.pb-org-new` element the probe does not resolve. Repro: `scripts/verify-platform.sh --only pan04-undo-close-group-live`. Cause so far: a second Organising widget instance or a stale probe handle. Source: no v1.5 UAT test (PAN-04). WINDOWS.md entry 37.
- [ ] ng-023-suggestions-history-bookmarks: an open tab ranks below a bookmark match. Repro: `scripts/verify-platform.sh --only ng-023-suggestions-history-bookmarks`. Cause so far: provider order puts bookmarks first; not traced. Source: no UAT test (NG-023). WINDOWS.md entry 38.
- [ ] site-identity-live app-menu: Organising rows 5-8 disabled, and Help opens no about:support stock window (the self-test's clean control fails the same way). Repro: `node scripts/verify-site-identity-live.mjs --scenario app-menu`. Cause so far: harness expectation or product not separated. Source: 31-04-LIVE-HANDOFF.md (phase 31 has no UAT sheet). WINDOWS.md entry 40.
- [ ] first-boot-surface-fresh: `TypeError: can't access property "offsetHeight", additionalViewsMenu is null`. Repro: `scripts/verify-platform.sh --only first-boot-surface-fresh`. Cause so far: `@theia/core` SideTabBar overflow (tab-bars.js:1179) expects `.theia-additional-views-menu` beside the tab bar, and the top side-panel tabs (e9569e81) remove it; fix in the PB extension, never in Theia core. Source: no UAT test. WINDOWS.md entry 41.

### Phase 999.32: Residual — v1.5 close-out full run: owner and environment rows (BACKLOG)

**Goal:** The rows that need an owner step or a clean checkout run green
**Source phase:** 39 (39-BASELINE "environment" rows; v1.6 deploy workstream and v1.7 macOS)
**Deferred at:** 2026-11-07, gate exclusions keyed to the entries below
**Follow-ups:**
- [ ] Ten release-artifact rows (ng063, portable-elf, sidecar-no-symlinks, package-target-natives, packaged-identity, install-matrix, ng065, ng072, search-engines-packaged, mar-update-hop). Repro: `scripts/verify-platform.sh --only portable-elf`. Cause so far: no container-built tarball and no N-plus-1 MAR hop; owner steps in `.planning/workstreams/deploy/OWNER-PASS.md`. Source: no UAT test. WINDOWS.md entry 30.
- [ ] Seven live-state rows (ng074-ci-green-on-main, repo-controls, channel-live, codeberg-mirror-live, upptime-sweep-live, win-matrix-record, win-download-copy). Repro: `scripts/verify-platform.sh --only channel-live`. Cause so far: main not pushed, no Release, undeclared apps and slugs, no Windows matrix record. Source: no UAT test. WINDOWS.md entry 31.
- [ ] macos-package-payload, macos-install-matrix: deferred to v1.7 (R4). Source: no UAT test. WINDOWS.md entry 32.
- [ ] tel06-error-delivery-live refuses the dirty tree (the owner's `.claude/settings.json`, `.planning/state.json`); run it on a clean checkout. Source: no UAT test. WINDOWS.md entry 33.
- [ ] ng089-uat-sheets: 49 pending results plus no React 19 runtime test in the v1.2 and v1.3 UAT sheets; the NG-084 live pass was deferred by the owner. Repro: `node scripts/verify-ng-089-uat-sheets.mjs`. Source: those sheets. WINDOWS.md entry 35.

### Phase 999.33: Scenario-scoped gate exclusions (BACKLOG)

**Goal:** A `--gate` known-open exclusion excuses only the failing scenario or plant it names, not every red in its label
**Source phase:** 39 (39-REVIEW WR-06)
**Deferred at:** 2026-11-07, accepted in 39-REVIEW-FIX; the gate is not redesigned in the v1.5 close-out
**Follow-ups:**
- [ ] `GATE_KNOWN_OPEN_EXCLUSIONS` in `scripts/verify-platform.sh` match on the whole label, so while ledger 25, 28, 29, 39, 40 or 43 stays open a new red in another scenario of `extension-actions-live`, `page-tools-live`, `site-identity-live`, `prompts-live-self-test`, `page-furniture-live-self-test` or `address-bar-live-self-test` prints `EXCLUDED (known-open)`. Repro: read the exclusion match in `scripts/verify-platform.sh` (`[ "$label" = "$excl_label" ]`). Fix direction: key each exclusion on label plus scenario or plant and match the check's own `FAIL -- <scenario>` lines, or register the known-red scenario as its own row and exclude only that row. Source: 39-REVIEW WR-06.
