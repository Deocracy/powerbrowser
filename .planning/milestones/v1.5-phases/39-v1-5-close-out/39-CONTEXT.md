# Phase 39: v1.5 Close-out - Context

**Gathered:** 2026-11-04
**Status:** Ready for planning
**Mode:** Auto-generated (discuss skipped via workflow.skip_discuss)

<domain>
## Phase Boundary

Fix every open v1.5 defect and finish the end-of-milestone pass, so v1.5 Chrome Bar Firefox Parity closes with no green-by-exclusion rows (Chris, 2026-11-05: "fix all three", "fix all 13", "every deferral well documented").

Scope, verbatim from ROADMAP.md Phase 39:

1. Product fixes: C22 the `title=` page tooltip never opens; C23 the saved-login autocomplete popup never opens; C24 Copy Image leaves no image flavour on the clipboard; C11 page-menu dismissal `focusPage()` race (999.10).
2. Every backlog row 999.4-999.16 fixed, none deferred: 999.4 bookmarks-toolbar order-dependent instrument failure; 999.5 nav-keys Back leg with no interaction; 999.6 mode-tokens `*x` flake; 999.11 opener-null plant anchor; 999.12 KDE portal chooser for screen sharing; 999.13 four prompts self-test plants re-sited; 999.14 kwinShot raises the shell before spectacle; 999.15 event-page wake and 999.16 enterprise policies with no stock window — one root cause (`browser-delayed-startup-finished` / `sessionstore-windows-restored` are sent only by a stock window), landing as a regenerated patch 050 plus a Gecko rebuild.
3. `scripts/verify-platform.sh` and `--gate` green with `page-furniture-live` and its self-test included.
4. Every automatable pending UAT item in phases 27, 31.1, 32, 33, 34, 35, 36, 37, 38 run by Claude (live harnesses, gsd-browser, KWin raise + spectacle) and recorded in the UAT file; 32-UAT.md gets the page-tools PASS from the 2026-11-04 sweep; 34-UAT.md is rewritten to the UAT template so `uat.complete-session` parses it.
5. The ~20 owner-decision UAT rows (32 T11; 36 T18; 37 T34-T41; 38 T31-T40) each get a one-line recommendation and are put to Chris per phase through the AskUserQuestion box.
6. Bookkeeping: REQUIREMENTS.md rows v1.5 delivered ticked, ROADMAP boxes for phases 27-38 ticked, WINDOWS.md updated.
7. Anything still unresolved at the end is documented as a backlog row plus a WINDOWS.md entry carrying repro, cause-so-far and the source UAT test, so a later version can pick it up without rediscovery. Human-only checks (human eye, portal click) are collected into one checklist for Chris.

Runs autonomously on main; it stops only for the owner-call batches, the human-only checklist and the push.

</domain>

<decisions>
## Implementation Decisions

### Owner rulings already made (Chris, 2026-11-05)
- C22, C23, C24 are fixed before v1.5 closes, not deferred.
- All 13 backlog rows 999.4-999.16 are fixed in v1.5, including 999.12 (KDE portal chooser) and 999.15/999.16 (regenerated patch 050 plus Gecko rebuild).
- Claude runs every UAT item the live harness, gsd-browser or KWin+spectacle can reach; only human-eye and portal-click items go to Chris as one checklist.
- Owner-decision UAT rows get a one-line recommendation each and are asked per phase in the AskUserQuestion box.
- Every deferral is documented: backlog row plus WINDOWS.md entry with repro, cause-so-far and the source UAT test.

### Claude's Discretion
All remaining implementation choices are at Claude's discretion — discuss phase was skipped per user setting. Use the ROADMAP scope above, the project hard rules in CLAUDE.md (patches regenerated never text-edited, one anti-corruption layer, registry-driven checks with self-tests) and codebase conventions to guide decisions.

</decisions>

<code_context>
## Existing Code Insights

Codebase context will be gathered during plan-phase research. Start points: the UAT files 27/31.1/32-38-UAT.md, `.planning/v1.5-LIVE-PASS.md`, `.planning/WINDOWS.md`, backlog rows 999.4-999.16 in ROADMAP.md, `patches/050*`, `scripts/verify-platform.sh` registry.

</code_context>

<specifics>
## Specific Ideas

No further specifics — refer to the ROADMAP scope and the owner rulings above.

</specifics>

<deferred>
## Deferred Ideas

None — discuss phase skipped.

</deferred>
