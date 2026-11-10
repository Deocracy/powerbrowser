---
phase: 61-spikes-for-pane-hosting-browser-parity-and-live-sharing
plan: 02
subsystem: infra
tags: [orca, orcad, browser, parity, client-host, provider, web-tab, live-probe, verify-platform]

requires:
  - phase: 60-02
    provides: "scripts/build-orca.sh, the pinned and fetched orca/ tree"
  - phase: 60-03
    provides: "scripts/lib/orca-run.mjs (PB Node, scrubbed orcad env, loopback start, redaction, teardown)"
provides:
  - "scripts/orca-browser-parity.mjs: derive-and-compare of every Orca browser ability and its users against DISPOSITIONS.md, with --self-test (9 plants)"
  - "rows orca-browser-parity-self-test (quick) and orca-browser-parity (full, SKIP without orca/)"
  - ".planning/spikes/005-orca-browser-parity/: DISPOSITIONS.md (92 rows), README.md, results.md, results-proof.json, provider-proof.mjs, s2-host.ts, vite.s2.config.ts, build-s2-host.sh, s1-browser-provider-kind.patch"
  - "Seam decision for Phase 66: S2, proven on navigate plus read title; S1 sized at 13 lines"
affects: [61-04, 66, 67, 68]

actuals:
  tasks: 3
  commits: 3
plan_head_before: 132f2f53732f8d54626317e71ceab6ae045f12d9

tech-stack:
  added: []
  patterns:
    - "An ability inventory derived from third-party source by regex, with a count tripwire on every derived set and a users column that is derived, never typed"
    - "A live driver that hosts a fixture HTTP server must not block its event loop: child processes are spawned asynchronously"

key-files:
  created:
    - scripts/orca-browser-parity.mjs
    - .planning/spikes/005-orca-browser-parity/DISPOSITIONS.md
    - .planning/spikes/005-orca-browser-parity/README.md
    - .planning/spikes/005-orca-browser-parity/results.md
    - .planning/spikes/005-orca-browser-parity/results-proof.json
    - .planning/spikes/005-orca-browser-parity/provider-proof.mjs
    - .planning/spikes/005-orca-browser-parity/s2-host.ts
    - .planning/spikes/005-orca-browser-parity/vite.s2.config.ts
    - .planning/spikes/005-orca-browser-parity/build-s2-host.sh
    - .planning/spikes/005-orca-browser-parity/s1-browser-provider-kind.patch
  modified:
    - scripts/verify-platform.sh
    - inventory/brand-tokens.json

key-decisions:
  - "Seam for Phase 66 is S2 (browser.clientHost.attach from a PB runtime client, zero Orca patches). This reverses P61-05's provider-kind seam, as P61-13 allowed; the owner may override."
  - "Component 'main' is derived from orca/src/main/browser/ (the desktop client host), not only its desktop-browser-bridge subdirectory, which yields 3 names and misses the clientHost callers"
  - "Users are counted from quoted 'browser.<name>' literals only; an ability with no caller in the four trees is written none"

requirements-completed: [BRW-01]
---

# Phase 61 Plan 02: Browser-parity spike (005) Summary

**Every Orca browser ability is derived from the pin and gated against a Gecko disposition table, and the Orca CLI's `goto` reached a PowerBrowser web tab through orcad and returned its title with no Orca file edited.**

## VERDICT

YELLOW (conditions): the seam is chosen and proven on one ability, and the inventory is derived
and gated; the rest of the ability set is still unproven.

Route for Phase 66: S2, a PB runtime client that attaches through browser.clientHost.attach with no Orca patch, building the tier-1 set of 50 abilities (25 BiDi, 9 BiDi+, 14 native, 1 actor for snapshot, exec as a documented subset); S1 (a 13-line provider-kind patch) stays the fallback.

Conditions (full text in the spike README): a PB-owned runtime client instead of the two reaches
past Orca's public surface; 85 of 92 dispositions are `[ASSUMED]`; bounded probes for background
input (Q3) and prompts on overlays (Q5) before those rows are built; decide the in-process route
for BiDi-labelled rows (Q4); `snapshot` is its own piece of work (Q2); one `browserPageId` to one
PB-created tab (BRW-03).

## Measured

| What | Value |
|---|---|
| Derived at the pin (1.4.248) | 92 RPC abilities, 65 automation methods, 83 provider members, 80 CLI specs; 27 RPC outside automation, 0 automation without an RPC |
| Users | agent and CLI 78, renderer 24, main 13, orcad 5, none 3 |
| Dispositions | BiDi 37, BiDi+ 25, native 24, actor 3, impossible 3 |
| Self-test | clean control, SKIP case, 9 plants each red naming the drift |
| PB half (navigate, title) | PASS, 270 ms |
| S2 attach | accepted, 254 ms, Theia frame is a secure context |
| S2 goto through orcad | PASS, `tab create` 171 ms, `goto` 162 ms, title equal to the fixture nonce |
| S1 patch | applies to the pin; 13 changed lines in one file |
| orca/ tracked files | unmodified after every build and run |

Proof command: `flock /home/chris/coding/Power-Browser/.git/pb-live.lock node .planning/spikes/005-orca-browser-parity/provider-proof.mjs`
(headless, PB_FIREFOX_BIN set to the coordinating workspace's binary). Four runs; the fourth is recorded.

## Task Commits

1. **Task 1: parity derive-and-compare with rows** — `31a7db10` (feat)
2. **Task 2: component users, tripwires and dispositions** — `f30e2525` (feat)
3. **Task 3: S2 proof, S1 patch and the parity record** — this commit (spike)

## Registry rows

- `orca-browser-parity-self-test|node $REPO_ROOT/scripts/orca-browser-parity.mjs --self-test` (quick, after `orca-slotless-start-self-test`)
- `orca-browser-parity|node $REPO_ROOT/scripts/orca-browser-parity.mjs` (full, after `orca-slotless-start`)

## Brand rows moved (inventory/brand-tokens.json)

| Token | Before | After | Files added to expected_files / only_in |
|---|---|---|---|
| Orca (title) | 93 | 105 | scripts/orca-browser-parity.mjs |
| orca (lower) | 420 | 466 | scripts/orca-browser-parity.mjs |
| orcad (lower) | 179 | 187 | scripts/orca-browser-parity.mjs |

Each row's reason carries a COUNT MOVED sentence naming plan 61-02. `node scripts/scan-brand-residue.mjs` exits 0 with the files staged.

## Deviations from Plan

1. **Bundle path.** The plan put the S2 bundle at `out/web/pb-s2`. orcad's static handler serves only `/web-index.html` and four prefixes, so it is built to `out/web/assets/pb-s2/`.
2. **Vite config.** `mergeConfig` cannot drop the base HTML input, so `vite.s2.config.ts` imports Orca's config and rebuilds only its `build` block in library mode.
3. **Component path for "main".** `src/main/browser/` instead of `src/main/browser/desktop-browser-bridge` (see key-decisions).
4. **Orca CLI build.** `build-orca.sh` does not produce `orca/out/cli/index.js`; the lane built it with the two steps the Phase 60 EXT-01 record names. The plan's Task 3 precondition assumed it existed.
5. **verify-platform.sh in Task 2.** The two row comments were updated in the Task 2 commit to describe the nine plants and the users comparison; the plan listed that file for Task 1 only.
6. **Extra plants.** Nine, not seven: a renamed provider class and an empty CLI spec set were added.
7. **DISPOSITIONS.md in Task 3.** Three notes changed from `[ASSUMED]` to "shown" after the proof ran.
8. **typecheck:node on the S1 scratch copy was not run.** The plan required it only if the S2 attach was refused.

## For the owner (D-18, no stop was made)

- The seam recommendation reverses P61-05 (S2 instead of the provider kind). Override in the end-of-milestone pass if S1 is preferred.
- `~/.cache/pb-p61-02-orca` is a symlink this lane created (short orcad profile path); it points into this worktree's `.mozbuild/p61-02/` and can be deleted with the worktree.

## Verification

- `scripts/verify-platform.sh --only orca-browser-parity-self-test`: PASS
- `scripts/verify-platform.sh --only orca-browser-parity`: PASS (no SKIP, 92 rows)
- `node scripts/scan-brand-residue.mjs` with all files staged: PASS
- README: Q1 to Q8 headings, user-facing tools table, `## VERDICT`, exactly one `Route for Phase 66:` line; credential grep over the spike directory prints nothing
- `scripts/verify-platform.sh --quick` in this lane: 230 rows pass, including every Orca and brand row. It exits 1 because this fresh worktree has no `upstream/` checkout and no `theia/node_modules`; the red rows name those two absences. I did not confirm row by row that each red is independent of this lane's change.

## Not done

- No ability other than `goto` ran through the seam. `navigate` (a tab created with a URL) and `closePage` are handled by the host but were not exercised.
- Q3, Q5, Q6 (the link click) and Q7 were not run.

Merge note for the coordinator: registry rows and brand-token rows are in this lane; re-run the scan and --quick after merge; no WINDOWS.md ids

## Self-Check: PASSED
