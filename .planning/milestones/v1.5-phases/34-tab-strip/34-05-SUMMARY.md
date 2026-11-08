---
phase: 34-tab-strip
plan: "05"
subsystem: verification
tags: [tab-strip, live-harness, registry, validation, bookmark-all, modes]
requires:
  - phase: 34-tab-strip (plans 01-04)
    provides: the strip (menu, reorder, middle/double/drop, overflow, pin, multi, preview, attention), verify-tab-strip.mjs checks 1-14, the live harness with ten scenarios, the four registry rows
  - phase: 33 (not merged into this tree)
    provides: ChromeStoreClient.bookmarkPage(url, title, folderGuid?), the method the bookmark-all scenario scores against
provides:
  - live scenarios bookmark-all (BMK-07) and modes (D-02), each with a --self-test plant, closing the twelve
  - verify-tab-strip.mjs check 15 (registry order, exactly once, no sibling driver) and four plants
  - 34-VALIDATION.md mapped: static rows green with their commands, live and DOM rows deferred with exact invocations
affects:
  - the end-of-milestone live pass (runs the twelve-scenario chain below)
  - the Phase 33 merge (bookmark-all turns from NOT SCORED into a scored scenario once bookmarkPage exists)
tech-stack:
  added: []
  patterns:
    - a live scenario whose capability is absent reports NOT SCORED through expect, so it can never print PASS
    - registry placement is derived from verify-platform.sh's two blocks and compared, not listed by hand
key-files:
  created:
    - .planning/phases/34-tab-strip/34-05-SUMMARY.md
  modified:
    - scripts/verify-tab-strip-live.mjs
    - scripts/verify-tab-strip.mjs
    - scripts/verify-platform.sh
    - .planning/phases/34-tab-strip/34-VALIDATION.md
key-decisions:
  - "bookmark-all scores against Phase 33's real name, ChromeStoreClient.bookmarkPage, through the one bookmarkTabs callback chrome-bar-widget.tsx hands the strip. While the method is absent the Bookmark All Tabs row must read disabled, and the scenario fails with 'NOT SCORED', never PASS. The per-tab proof is a positive readBookmarkByUrl read-back (that method is already in this tree) carrying each tab's own title and URL."
  - "D-02 is asserted as the tree states it: one TabStripWidget and one stripTabs reader in every mode, with visibility following the mode contract. chrome-bar-widget.tsx hides the strip outside Browsing (setHidden(modeId !== 'browsing')), and its comment ratifies that. The modes scenario derives that expression at check time and checks the strip against it in Coding, Organising and Browsing. It does not require a painted strip in Coding or Organising."
  - "The registry proof is check 15 of the existing static gate (verify-tab-strip.mjs), not a new script or a new registry row. The rows already run in --quick."
  - "Distinct hosts: bookmark-all and modes put /b on localhost (same fixture server, another site), the verify-nav-keys-live precedent. Each session holds at most two same-site tabs."
patterns-established:
  - "A visibility contract read from a source expression is parsed to a fixed shape (modeId !==|=== '<mode>'). Any other shape is a harness error. It is never evaluated as code."
requirements-completed: []
duration: "about 35 minutes of execution"
completed: 2026-11-01
status: complete
commits: 2
plan_head_before: 42e2c4604526cd8e77c8ae42969084a55afef7cd
plan_head_after: 46127d0257feb636956bc7e518593a8701a7b242
actuals:
  tokens: 11100
  tasks: 2
  commits: 2
---

# Phase 34 Plan 05: Twelve-scenario live suite, registry proof and VALIDATION marking Summary

**The live harness now holds all twelve scenarios. The two new ones:**

- **bookmark-all** proves BMK-07 through Phase 33's `bookmarkPage` with a per-tab `readBookmarkByUrl` read-back and the failure sentence. It reports NOT SCORED while that method is absent.
- **modes** proves D-02: one strip and one reader through Coding, Organising and Browsing, with visibility per the derived `setHidden` contract and the order kept.

`verify-tab-strip.mjs` gains check 15 with four plants (24 in total). It derives both tab-strip gates' registry rows from `verify-platform.sh` and requires each row exactly once, in its own block, with the gate before its self-test. It also requires that no other driver runs them. `34-VALIDATION.md` maps every requirement. Static rows are green with the command that proved them. Every live and DOM row is marked deferred with its exact invocation. No row that has not run is marked green.

## Status

Static half complete. The live half was written and parses, but was not run, per the owner ruling and the lane brief: no Gecko build, no objdir, no live browser. This plan therefore marks no requirement complete (`requirements-completed: []`). TAB-01..TAB-09 and BMK-07 are proven statically and wait on the end-of-milestone live pass. BMK-07 also waits on the Phase 33 merge.

## Performance

- **Tasks:** 2 of 2 executed (static halves).
- **Commits:** 2 production commits (`af992fe0`, `46127d02`), then the SUMMARY commit.
- **Realized diff:** 376 insertions and 32 deletions over 4 files, 44,327 diff characters, so about 11,100 tokens by chars/4. The plan estimate was 60,000. The gap is the live run, which did not happen.

## Accomplishments

- **bookmark-all (BMK-07, D-13).** Runs on withProbeShell with /a (127.0.0.1), /b (localhost) and /c (127.0.0.1), and /c current. The scenario:
  1. Reads whether `ChromeStoreClient.bookmarkPage` exists, and whether the strip's `bookmarkTabs` callback is set. Both must agree.
  2. Opens /a's tab menu. The `Bookmark All Tabs` row label is derived from `chrome-bar-copy.ts`. The row must be enabled exactly when `bookmarkPage` exists.
  3. If `bookmarkPage` is absent: one red line, `bookmark-all: NOT SCORED -- Phase 33's ChromeStoreClient.bookmarkPage is absent from this build ...`, and the scenario returns.
  4. If it is present: every tab must read back null first (else NOT SCORED). After choosing the row, each tab must read back through `readBookmarkByUrl` as a bookmark with its own title and URL. No strip notice may show, and /c must stay current.
  5. Then, with `bookmarkPage` patched on the instance to reject, choosing the row must show the strip notice equal to `bookmarkTabFailed` with the application subject, also derived from the copy file.
  - Plant `bookmark-all-drops-tab`: the running strip's callback drops the last tab, which must go red naming "was not bookmarked".
- **modes (D-02).** Runs on withProbeShell with the same three tabs. The baseline in Browsing must be a painted strip whose DOM order, reader (`shownTabs`) order and home TabBar order agree. Then for Coding, Organising and Browsing:
  - the shell must enter the mode (`data-pb-mode`);
  - there must be exactly one `.pb-tab-strip` node, and the same TabStripWidget instance;
  - `isHidden` must equal the derived contract, and the measured box must be zero height when hidden or a painted row when shown;
  - the reader and TabBar must keep the baseline order;
  - where the strip is shown, the painted order must equal it.
  - Plant `modes-order-lost`: ModeService.activateMode is wrapped on the instance to move /a to the end after each switch, which must go red naming "did not survive the switch".
- **Check 15 (registry).**
  - The quick block (`local -a CHECKS=(` … `  )`) and the live block (`CHECKS+=(` … `    )`) are located in `verify-platform.sh` and their rows parsed.
  - For each gate script (`verify-tab-strip.mjs` → quick, `verify-tab-strip-live.mjs` → live), the label comes from the file name. The `<label>` and `<label>-self-test` rows must each appear exactly once in the home block, adjacent and in that order. No extra row may run the script, and no row anywhere else may run it.
  - Every other `scripts/**/*.sh` and `.github/workflows/*` file is scanned. A file that runs either gate is a sibling driver.
  - Plants:
    - `registry-row-duplicated`: red, "appears 2 times in the quick block"
    - `registry-live-row-in-quick`: red, "outside the live block"
    - `registry-self-test-first`: red, "does not run right after"
    - `sibling-driver`: red, naming `scripts/verify-phase-34.sh`
- **verify-platform.sh.** Comments only, on the `tab-strip` and `tab-strip-live` rows. The four rows are unchanged, and check 15 proves their placement.
- **34-VALIDATION.md.**
  - Frontmatter is `status: static-green-live-deferred`, `wave_0_complete: true`, and `nyquist_compliant` stays false.
  - Every requirement row names its static checks and plants, and its `LIVE(<scenario>)` and `DOM-MEASURE` invocations.
  - New `registry` row.
  - New ⏸ status: deferred, not run, not green.
  - The three Wave 0 boxes are ticked.

## Cross-lane names assumed

- `ChromeStoreClient.bookmarkPage(url: string, title: string, folderGuid?: string)` (Phase 33 plan 01). The scenario probes it with `typeof store.bookmarkPage === 'function'` and patches it on the instance for the failure case. It was not implemented here.
- `ChromeStoreClient.readBookmarkByUrl(url)` returning `{ guid, title, url } | null`. It is already in this tree (Phase 29/30), so it is not assumed.
- `TabStripWidget.bookmarkTabs`, set in `ChromeBarContribution.onStart` from `ChromeBarWidget.tabBookmarker()` (34-01). It is unchanged.
- No `STORE_REQUEST_KINDS` or `WEB_TAB_ACTION_KINDS` entry was added. `verify-web-tab-bridge.mjs` was not edited, and its `--self-test` is green.

## Task Commits

1. **Task 1 (tracer): bookmark-all and modes scenarios.** Commit `af992fe0`. Tracer gate in auto mode: the automated half was green before expanding. That half is `node --check`, the unknown-scenario guard listing all twelve names, `node scripts/verify-registry-shape.mjs`, and the Theia build. The live half is deferred.
2. **Task 2: registry proof, VALIDATION marking.** Commit `46127d02`.

## Gate results

- **Theia build:** `nix develop .#theia --command bash -c 'cd theia && yarn build'` exited 0 with 0 `error TS`. This plan changes no Theia source.
- **`node --check scripts/verify-tab-strip-live.mjs`:** OK. `node scripts/verify-tab-strip-live.mjs --scenario nope` exits 2 listing all twelve scenarios, and launches nothing.
- **`node scripts/verify-tab-strip.mjs`:** PASS, checks 1-15.
- **`node scripts/verify-tab-strip.mjs --self-test`:** PASS. The unmodified tree is green, and 24 plants each went red naming their drift.
- **`node scripts/verify-web-tab-bridge.mjs --self-test`:** PASS (32 plants).
- **`node scripts/verify-shell-error-copy.mjs --self-test`:** PASS.
- **`node scripts/verify-registry-shape.mjs`:** PASS (GUI-04 shape unchanged).
- **`nix develop .#theia --command scripts/verify-platform.sh --quick`**, after staging: exit 0 after Task 2's files were staged, and again with VALIDATION staged.
  - Rows include `tab-strip`, `tab-strip-self-test`, `scan-brand-residue`, `shell-error-copy-no-internals`, `internals-boundary`, `internals-catalogue`, `ng-040-internals-catalogue-lines`, `tab-uris-typecheck`, `chrome-bar-typecheck`, `gui02-web-tab-bridge` and `gui04-registry-shape`, all PASS.
  - Task 1's commit was made before its own `--quick` run. The first `--quick` run, with Task 1 committed and Task 2 staged, was green.

## Deferred (end-of-milestone live pass)

None of these has run. Each needs a tree with a current Gecko build (objdir matching the patch stack), and is run from the repo root.

- **Full twelve-scenario suite, plan task 2's chain.** Scenarios: `menu, reorder, middle, double, drop, overflow, pin-restore, multi, preview, attention, bookmark-all, modes`. Run it inside `nix develop .#theia` so `yarn` is on PATH for the full driver, after the Phase 33 merge:

      nix develop .#theia --command bash -c 'cd theia && yarn build' > "${TMPDIR:-/tmp}/pb-34-05-t2-build.log" 2>&1 && node scripts/verify-tab-strip.mjs && node scripts/verify-tab-strip.mjs --self-test && node scripts/verify-tab-strip-live.mjs && node scripts/verify-tab-strip-live.mjs --self-test && node scripts/verify-web-tab-bridge.mjs --self-test && node scripts/verify-shell-error-copy.mjs --self-test && node scripts/verify-registry-shape.mjs && scripts/verify-platform.sh

- **Plan task 1's chain (the two new scenarios):**

      nix develop .#theia --command bash -c 'cd theia && yarn build' > "${TMPDIR:-/tmp}/pb-34-05-t1-build.log" 2>&1 && node scripts/verify-tab-strip-live.mjs --scenario bookmark-all,modes && node scripts/verify-registry-shape.mjs

- **Self-test plants for the new scenarios:** `bookmark-all-drops-tab` and `modes-order-lost`, both run by `node scripts/verify-tab-strip-live.mjs --self-test`. Each plant runs only after its unplanted run is green, so bookmark-all's plant cannot run before the Phase 33 merge.
- **bookmark-all before the Phase 33 merge** reports `NOT SCORED` and exits 1. That is the intended honest result, not a defect.
- **Sidecar DOM measure (D-02, TAB-04).**
  - Start the sidecar inside `nix develop .#theia`:

        cd theia/applications/browser && POWERBROWSER_TOKEN_DISABLE=1 THEIA_CONFIG_DIR="$HOME/.config/powerbrowser" PATH="$PWD/node_modules/.bin:$PWD/../../node_modules/.bin:$PATH" theia start --port 4000 --hostname 127.0.0.1

  - In Browsing, Coding, Organising and Browsing again, run this gsd-browser `browser_eval`:

        JSON.stringify({ mode: document.body.dataset.pbMode, strips: document.querySelectorAll('.pb-tab-strip').length, box: (r => [r.width, r.height])(document.querySelector('.pb-tab-strip').getBoundingClientRect()), chevron: !!document.querySelector('.pb-tab-strip-chevron'), tabs: [...document.querySelectorAll('.pb-tab-strip .pb-tab[data-pb-tab]')].map(n => n.dataset.pbTab) })

  - Pass criteria:
    - one strip node in every mode;
    - a 33px painted row in Browsing, and zero height in Coding and Organising;
    - the same Browsing `tabs` order before and after the round trip;
    - `chevron` true while the narrowed row overflows, and false once it is widened.
- **UAT screenshots** (spectacle on KDE Wayland, see the screenshot memory): the tab menu, the pinned strip, the preview card and the attention dot. None was taken. Nothing is attached.
- **Manual rows in 34-VALIDATION.md:** drag feel, preview readability, dot visibility and the screen-reader pass.
- **Carried from 34-01..34-04:** every earlier live scenario (`LIVE(menu)` through `LIVE(attention)`) and the chrome-side titleChanged behaviour. These are covered by the full chain above.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Plan vs tree] D-02 asserted as "one reader, contract visibility", not "painted in all three modes"**
- **Found during:** Task 1.
- **Issue:** the plan's truth says the strip "renders in Coding, Browsing, and Organising". The tree hides it outside Browsing: `this.tabStrip.setHidden(modeId !== 'browsing')` in chrome-bar-widget.tsx. The comment there ratifies that Organising's tabs are its canvas cards. D-02's own text says "visibility follows the existing mode-service contract".
- **Fix:** the modes scenario requires the same single TabStripWidget and reader in every mode, with the order kept. It requires visibility and measured height equal to the contract expression, derived from the source at check time. This plan does not change the strip's visibility, because the plan adds no strip behaviour. If the owner wants the strip painted in Coding and Organising, that is a behaviour change for a later plan, and the contract derivation makes the scenario follow it.

**2. [Scope] Registry proof is check 15 in verify-tab-strip.mjs**
- **Reason:** the plan asks for a derived proof with no sibling driver. Placing it in the existing quick gate adds no row and no script.

**3. [Scope] verify-platform.sh: comments only**
- **Reason:** all four rows already existed in the right blocks, and check 15 now proves that.

**4. [Ruling] No live run, no screenshots, no requirement marked complete**
- **Reason:** owner ruling and lane brief (no objdir). The plan's `done` criteria (live PASS, UAT screenshots) are deferred rather than claimed. This is why `requirements-completed` is empty and the VALIDATION live rows read ⏸, not ✅.

**5. [Naming] The plan's `addBookmark` is Phase 33's `bookmarkPage`**
- **Reason:** per the lane brief and 33-01-PLAN. The VALIDATION BMK-07 row now names `bookmarkPage`.

## Known Stubs

None added. The bookmark-all scenario's NOT SCORED branch is the specified absent-capability behaviour, not a stub.

The broken-windows ledger (`.planning/WINDOWS.md`) was not appended. The lane brief keeps shared planning files with the orchestrator.

## Threat Flags

None. The plan's register (T-34-SC) holds: no package was installed. The live scenarios patch the running page's own instances only, inside their test session. The bookmark-all failure case restores `bookmarkPage` in a `finally`.

## Self-Check: PASSED

- FOUND: scripts/verify-tab-strip-live.mjs, scripts/verify-tab-strip.mjs, scripts/verify-platform.sh, .planning/phases/34-tab-strip/34-VALIDATION.md
- FOUND commits: af992fe0, 46127d02 (both ancestors of HEAD)
