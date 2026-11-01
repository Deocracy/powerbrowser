---
phase: 40-release-identity-esr-pin-and-patch-regeneration-a
plan: 07
subsystem: infra
tags: [licensing, notices, about-license, theia-closure, node-runtime, verify-platform, en-US]
status: complete

requires:
  - phase: 40-06
    provides: "update-prefs rows (the new rows append after them); app.update.langpack.enabled=false (UPD-25), cited by the en-US decision"
provides:
  - "scripts/generate-licensing.mjs: write, --check, --self-test; exports LINUX_LICENSE_DEFINES, NODE_ARCHIVE_DIR, htmlToText, theiaClosure, renderNotices, checkAgainst, checkNodeHeader"
  - "Tracked LICENSING.md and THIRD-PARTY-NOTICES.txt at the repo root"
  - "Quick rows licensing and licensing-self-test"
  - "en-US-only release scope in README.md Status and a PROJECT.md Key Decisions row"
affects: [40-08, Phase 43 AUTO-06, Phase 47 download page, Phase 49 release.yml, Phase 50, Phase 51 Renovate]

actuals:
  tokens: 284923   # chars/4 over the whole diff; 8189 excluding the two generated outputs
  tasks: 2
  commits: 2
plan_head_before: 327283ad8c1a7a20392adc344d12b300459b2698
plan_head_after: 3b2b416e9fc30630440342a2f6396d0bb9d0c58a

tech-stack:
  added: []
  patterns:
    - "Legal notices are generator output with a drift row; a check that cannot re-derive one input offline still asserts that input's version and SKIPs only the text, by name"

key-files:
  created:
    - scripts/generate-licensing.mjs
    - LICENSING.md
    - THIRD-PARTY-NOTICES.txt
  modified:
    - scripts/verify-manifest-literals.mjs
    - scripts/verify-platform.sh
    - README.md
    - .planning/PROJECT.md

key-decisions:
  - "Release scope is en-US only; stated in README and PROJECT.md, repeated later on the /download page and in release notes (PKG-09)"
  - "The Theia closure walks through @powerbrowser/* packages (their dependencies ship) but does not list them; they are this repo's code under LICENSE (PKG-08)"
  - "about:license keeps Mozilla's binaries attribution verbatim; LICENSING.md states it does not describe PowerBrowser binaries and leaves the fix to the packaging phases (PKG-08)"

patterns-established:
  - "checkAgainst names the file, the first differing line number and both line texts, so an added or removed package is named by the line that moved"

requirements-completed: [PKG-08, PKG-09]

duration: 10min
completed: 2026-10-21
---

# Phase 40 Plan 07: generated licence notices and the en-US release scope Summary

**`node scripts/generate-licensing.mjs` writes LICENSING.md from `configuration.toml` [legal] and THIRD-PARTY-NOTICES.txt from three sources: about:license preprocessed with Mozilla's own mozbuild preprocessor, the Theia production dependency closure under theia/node_modules, and the LICENSE inside the sha256-pinned Node v24.19.0 archive. The quick row `licensing` re-derives both files, and `licensing-self-test` proves that a tampered line, an added package and a removed package each go red.**

## Performance

- Duration: about 10 min
- Completed: 2026-10-21
- Tasks: 2 of 2
- Files: 3 created, 4 modified

## Accomplishments

- **Gecko section.** `python3 -I` runs `mozbuild.preprocessor` with cwd `upstream/`, `APP_LICENSE_BLOCK` and `LINUX_LICENSE_DEFINES` (`MOZ_JXL`, `MOZ_ZUCCHINI`, `XP_LINUX`). Before committing, the output was byte-compared (`cmp`) with the main checkout's built `license.html` in both `objdir` and `objdir-release`: identical. It was also run once through `--check` with a temporary `objdir` symlink, which passed; the symlink was removed. `htmlToText` turns the HTML into the notices text.
- **Theia section.** `theiaClosure` starts from `theia/applications/browser/package.json` `dependencies` and follows Node resolution through nested `node_modules` up to `theia/`. It follows dependencies and installed optionalDependencies, never devDependencies.
  - **716 packages in 337 licence groups.** It includes `@theia/core@1.76.0` and `better-sqlite3@13.0.3` and lists no `@powerbrowser/*` package.
  - **7 groups carry `no licence file shipped in the package`.** Examples: `@theia/workspace`, `puppeteer-core`, `@lumino/widgets`. Their package directories were checked and contain no licence file.
- **Node section.** The section is headed `== Node.js runtime v24.19.0 ==`.
  - **Write mode.** The archive was copied from the main checkout's `.mozbuild/node-dist/`, which it finds through `git rev-parse --git-common-dir`. The copy goes into a `.part` file, is sha256-verified, then renamed. The same path downloads with `fetch` when no cache exists.
  - **`--check`.** It always asserts the header version against `node-runtime.json`. When the archive is not cached, it prints one `licensing: SKIP -- Node licence text not re-derived ...` line and splices in the tracked text. Exercised by moving the archive aside: PASS with the SKIP line.
- **Files.**
  - THIRD-PARTY-NOTICES.txt: 1,084,413 bytes, 20,914 lines.
  - LICENSING.md: 1,278 bytes.
  - Write mode replaces each file by temp-file rename. Two write runs produce byte-identical files (`cmp`).
- **en-US scope.** README Status gained "Release builds are en-US only: no other locale or language pack ships." PROJECT.md Key Decisions gained the row "Release scope is en-US only (PKG-09, Phase 40)", outcome "Adopted 2026-10-20". The Current Milestone section was not touched.

## Task Commits

1. **Task 1: about:license through the generator into tracked notices, licensing row** -- `6739275` (feat)
2. **Task 2: Theia and Node sections, licensing self-test, en-US scope** -- `3b2b416` (feat)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Correctness] htmlToText decodes three more named entities and drops comments**
- Found during: Task 1
- Issue: the preprocessed about:license contains `&ldquo;` and `&rdquo;` (9 each) and `&copy;` (6), which the plan's entity list omits, plus the MPL header HTML comments.
- Fix: those three entities are decoded too, and `<!-- -->` comments are removed before tags are stripped. An unknown named entity is left as written.
- Files modified: `scripts/generate-licensing.mjs`
- Commit: `6739275`

**2. [Rule 2 - Correctness] The closure walks through @powerbrowser/* packages**
- Found during: Task 2
- Issue: the plan says "skip @powerbrowser/* workspace packages". Skipping their traversal would drop third-party packages that only an extension depends on, which the prohibition forbids.
- Fix: those packages are traversed but not listed. The self-test reaches `b` only through `@powerbrowser/ext`.
- Commit: `3b2b416`

**3. [Rule 2 - Correctness] Licence text normalisation**
- Found during: Task 2
- Fix: before grouping, CRLF line endings become LF and trailing whitespace is trimmed. Empty licence files count as absent. Licence, copying and notice files in one package are concatenated in code-unit order.
- Commit: `3b2b416`

**4. Self-test additions**
- Beyond the plan's cases, the self-test also covers:
  - an unresolvable declared dependency
  - an absent node_modules
  - devDependency exclusion
  - two renders being byte-identical
- Commit: `3b2b416`

**Total deviations:** 3 auto-fixed (Rule 2), plus self-test cases added. **Impact:** none on scope. Each change keeps the notices complete or deterministic.

## Issues Encountered

- At session start the LEDGER hook again reported that `scripts/verify-ng-064-update-url.mjs` differs from its locked checksum. This plan did not read or modify that file. Plans 40-05 and 40-06 attribute the change to plan 40-04. The owner needs to re-lock it.
- No `inventory/brand-tokens.json` count moved: `scan-brand-residue` passed over both new files.

## Hand-offs

- **Phase 43 AUTO-06 and Phase 51 Renovate:** bump PRs must run `node scripts/generate-licensing.mjs`. Otherwise the `licensing` row turns them red, because every ESR, Theia or Node bump changes the notices.
- **Phase 49 release.yml:** attach LICENSING.md and THIRD-PARTY-NOTICES.txt to every Release.
- **Phase 47 and Phases 49/50:** repeat the en-US-only statement on the /download page and in the release notes.
- **Plan 40-08:** the built about:license comparison runs there, once an objdir exists in this worktree.
- **Phase 45/46:** about:license still reproduces Mozilla's statement that the Mozilla Project made the binaries available. Replacing it needs an `APP_LICENSE_BLOCK` override patch or a branding define (RESEARCH open question 4).
- **CI:** CI has no cached Node archive, so the `licensing` row there SKIPs the Node text and still checks the Node version.

## Verification

- `node scripts/generate-licensing.mjs && git diff --exit-code -- LICENSING.md THIRD-PARTY-NOTICES.txt`: PASS, no change on a second run.
- `--only licensing` and `--only licensing-self-test`: PASS. The self-test runs 12 cases, all PASS.
- `scripts/verify-platform.sh --quick`: PASS after each task, including `scan-brand-residue` and `verify-manifest-literals` with both files staged.
- Acceptance greps:
  - one `== Gecko (about:license) ==` header
  - one `== Theia application dependencies ==` header
  - one `== Node.js runtime v24.19.0 ==` header
  - `@theia/core@1.76.0`: 1
  - `@powerbrowser/`: 0
  - `PolyForm Noncommercial 1.0.0` in LICENSING.md: 1
  - `Mozilla Public License`: 4 or more
  - both registry rows occur once (`grep -F`)
  - `en-US only` occurs once in README and once in PROJECT.md
- An unknown argument exits 2. A tampered tracked line goes red naming `THIRD-PARTY-NOTICES.txt line 20`.

## Next Phase Readiness

ROADMAP Phase 40 criterion 5 is met: both files are generated, their drift row is green, and README and PROJECT.md state the en-US-only scope. Ready for 40-08.

## Self-Check: PASSED

- FOUND: scripts/generate-licensing.mjs
- FOUND: LICENSING.md (tracked)
- FOUND: THIRD-PARTY-NOTICES.txt (tracked)
- FOUND: 6739275
- FOUND: 3b2b416
