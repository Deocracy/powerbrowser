# Adversarial review: how Power Browser owns the Orca codebase (v1.7)

Written 2026-11-04 for Chris. It reviews D-04, D-16, D-15, D-01 and D-21..D-23 against the Orca
repository. Every number below comes from a command run against a history clone of
`github.com/stablyai/orca` (shallow since 2026-08-15, at `/tmp/orca-adv/orca`). The
`~/coding/orca-eval` checkout is a depth-1 clone with no tags (`git rev-list --count HEAD` = 1),
so it cannot measure churn. It was used only for size counts at its HEAD `3052dd79`
(2026-11-03, between 1.4.247 and 1.4.248), and nothing in it was modified. Release dates come
from `gh api repos/stablyai/orca/releases` (`published_at`). Claims not proven by a command are
marked **unverified**.

## Summary verdict

**Recommended: a revised Option A, called A2 ("additive overlay") in this report.** Keep D-04's
pinned-tag source build and the automated rebase job, but reverse its preference order:

1. PB adds **new files** that Orca's own `build:web` and `build:orcad` compile.
2. PB then adds a **small number of one-to-few-line regenerated patches** at declared
   registration seams.
3. Swapping an upstream file whole is **not allowed**.

The evidence:

- Orca ships a stable desktop release about **5 times a week** (41 in the last 8 weeks).
- Orca lands about **190–220 commits a day**.
- One release step (1.4.248→1.4.249, one day) changed **15,271 files**.
- A plausible 22-file whole-file overlay set for D-01 changed in **19 of 20** release steps
  (an average of 5.55 files per step).
- Six one-line seam patches carried across **21** consecutive releases conflicted only **twice**,
  both times in the same file.

Option B (hard fork) costs the same as A2 when PB's changes are additive, and much more when
they are not: the files PB would rewrite took 1,139 upstream commits in 4 weeks. Its only
advantage is freedom, and the churn makes that freedom unaffordable. Option C (native rebuild)
fails priority 1 outright, because PB would receive no Orca updates, and it would mean
reimplementing at least ~160k LOC of Orca-only backend.

**The one hard trade-off:** under A2, PB does not own Orca's internals. PB's dock owns the
arrangement. Each Orca pane becomes one Lumino tab, and Orca's own in-tab splits and tab groups
are flattened. There is a second reason for this: the orcad layout-owner protocol that D-15
assumes is a **dark build path, off in shipped and web builds of 1.4.248**. It is four weeks old,
and the type file that defines its commands took 41 commits in 4 weeks. PB cannot build on it
until Orca ships it.

## Evidence tables

### 1. Release cadence (stable desktop `v1.*`, `prerelease=false`; Android `mobile-android-v*`)

| Week (ending 2026-11-05) | Desktop releases | Range | Android |
|---|---|---|---|
| -1 | 6 | 1.4.244..1.4.249 | 4 |
| -2 | 6 | 1.4.238..1.4.243 | 1 |
| -3 | 7 | 1.4.227..1.4.237 | 2 |
| -4 | 2 | 1.4.223..1.4.224 | 1 |
| -5 | 4 | 1.4.219..1.4.222 | 1 |
| -6 | 8 | 1.4.210..1.4.218 | 0 |
| -7 | 4 | 1.4.205..1.4.209 | 1 |
| -8 | 4 | 1.4.200..1.4.204 | 0 |
| **8 weeks** | **41 (5.1/week)** | | **10** |

- 1.4.249 was published at 2026-11-04 23:53 UTC, so D-04's first pin (1.4.248) was one release
  behind on the day it was chosen.
- Commit volume: 943 non-merge commits in 1.4.245..1.4.248 (5 days), 6,198 in 1.4.222..1.4.248
  (28 days), and 160 in 1.4.248..1.4.249. The history is linear (0 merge commits in the 5-day
  span). Commits come from 35 authors in 5 days, and the top author has 329 of the 943.
- Volume is driven by tree-wide refactors:
  - `#36909`: 1,231 files.
  - `#33249`: 16,196 files (repository-wide comment cleanup).
  - `#38061`: 2,364 files, in 1.4.249.
- Path survival: 22% of the non-test `src/` paths that existed at 1.4.222 are gone at 1.4.248.
  Of the paths that existed at 1.4.245, 9% are gone 5 days later.

### 2. Churn in the areas PB would touch

All columns are `git diff --numstat -M`. "Non-test" excludes `*.test.*`, `*.spec.*`, fixtures
and test-support files.

| Area | 245..248 (5 d) files / +ins / -del | 245..248 non-test files | 222..248 (4 wk) files / +ins / -del | 222..248 non-test files |
|---|---|---|---|---|
| src/main/runtime | 1,846 / 73,641 / 41,711 | 807 | 4,070 / 321,309 / 137,620 | 2,211 |
| src/shared/workspace-layout | 29 / 953 / 470 | 18 | 141 / 20,558 / 5 | 81 |
| src/renderer/src/components/tab-group | 6 / 77 / 259 | 3 | 55 / 2,433 / 1,534 | 33 |
| src/renderer/src/components/tab-bar | 85 / 5,007 / 3,450 | 47 | 203 / 14,985 / 5,265 | 122 |
| src/renderer/src/runtime | 378 / 3,340 / 44,847 | 78 | 671 / 38,794 / 47,027 | 369 |
| src/main/ipc/pty | 181 / 1,506 / 3,602 | 70 | 330 / 30,468 / 24,006 | 164 |
| src/main/providers | 101 / 2,176 / 3,440 | 45 | 249 / 8,603 / 24,043 | 134 |
| src/main/daemon | 237 / 3,986 / 6,024 | 92 | 610 / 36,184 / 12,013 | 309 |
| src/main/orcad | 68 / 1,100 / 1,938 | 23 | 212 / 20,474 / 2,677 | 119 |
| src/main/agent-hooks | 78 / 4,802 / 530 | 42 | 290 / 21,275 / 6,000 | 119 |
| src/main/browser | 251 / 8,263 / 7,020 | 129 | 912 / 81,261 / 26,274 | 563 |
| renderer browser-pane | 60 / 799 / 1,859 | 26 | 355 / 16,768 / 7,825 | 229 |
| renderer terminal-pane | 276 / 4,299 / 10,153 | 92 | 1,214 / 86,267 / 64,582 | 559 |
| renderer editor | 315 / 8,377 / 9,050 | 135 | 874 / 45,415 / 17,781 | 473 |
| renderer native-chat | 660 / 23,412 / 10,833 | 321 | 1,076 / 120,213 / 41,236 | 579 |
| renderer web (web client shim) | 86 / 2,733 / 7,399 | 32 | 135 / 7,254 / 7,345 | 80 |
| mobile/ | 1,751 / 109,777 / 80,689 | 1,218 | 3,964 / 351,942 / 180,686 | 2,530 |
| **whole repo** | **19,644 / 692,235 / 704,962** | 9,720 | 44,993 / 3,327,842 / 1,997,023 | 26,032 |

The repo has 42,314 tracked files at 1.4.248, so 19,644 files changed in 5 days is 46% of the
tree. RPC method files: 172 of 348 non-test files in `src/main/runtime/rpc/methods` changed in
1.4.245..1.4.248.

### 3. Seams: what exists, and what does not

| Seam | Finding | Evidence |
|---|---|---|
| PTY provider | `IPtyProvider` has **48 members, 21 required**, including spawn, attach, write, writeWithSettlement, resize, shutdown, sendSignal, getCwd, getInitialCwd, clearBuffer, resetInputModes, acknowledgeDataEvent, hasChildProcesses, getForegroundProcess, serialize, revive and listProcesses. D-01's "spawn, write, resize, kill and data" understates the surface. The contract changed in 9 of 21 release steps and 16 commits in 4 weeks. | `src/main/providers/pty-provider-contract.ts:120-241`; the setter `setLocalPtyProvider` is exported from `src/main/ipc/pty/provider/registry.ts` and called in `src/main/daemon/daemon-provider-state.ts:101` |
| node-pty is still probed | orcad probes node-pty in a child process before it starts, and runs degraded if the probe fails. `build:orcad` builds a node-pty prebuild slot per target and needs "a `<target>` runner". | `src/main/orcad/main.ts:80-103`, `node-pty-precondition.ts`, `config/scripts/build-orcad-node.mjs:53-69` |
| Layout owner | **Off in shipped builds.** `layout-owner-switch.ts`: "Off in shipped builds; remove with the old path in phase F", and the define is "absent (off) in tests, the CLI and the web client". `config/dark-build-switches.cjs` says marked dark outputs "cannot ship". 245 files branch on `ORCA_LAYOUT_OWNER_IS_MAIN`. Layout commands were added 2026-10-09 (`a8ce574c77a`, "inert layout commands") and the renderer side 2026-10-15 (`06ead8dad03`, "build switch, off by default"). | `src/shared/layout-owner-switch.ts:1-9` at v1.4.248 |
| Layout protocol size | 34 `LayoutCommand` types in `workspace-layout-command-types.ts` (392 lines; 41 commits in 4 weeks). It did not exist at 1.4.222, and neither did `layout-apply-send.ts`, `layout-frame-stream.ts` or `runtime-layout-client.ts`. | `src/shared/workspace-layout/workspace-layout-command-types.ts:30-240` |
| Pane renderer registry | **None.** Pane dispatch is spread across the renderer: `contentType` is referenced in 221 non-test renderer files, and 53 files outside `tab-group/` import it. The store has 686 files, and `useAppStore` is used in 1,529 files. | `grep` counts at orca-eval HEAD |
| Tab content types | 8: terminal, editor, diff, conflict-review, check-details, agent-session, browser, simulator. | `src/shared/workspace-session-tab-type-schema.ts:3-12` (changed in 1 of 21 release steps) |
| Browser provider | A closed `kind` union in `orcad-browser-provider.ts`, so it needs a one-line seam. | the simulated patch carried clean in 21 of 21 steps |
| Web build entry | One input, `src/renderer/web-index.html`. An extra entry is a one-line patch. | `vite.web.config.ts:37` |
| React version | Theia 1.76 in PB resolves `react@19.2.8`. Orca uses `react ~19.2.8`. Mounting Orca's React panes inside Theia widgets does not need a second React major. | `theia/yarn.lock`, Orca `package.json` |

### 4. Overlay churn: whole-file swap compared with line patches

**Whole-file set** (22 files a D-01 overlay would plausibly swap or patch):

- Files: vite.web.config, web-index.html, web/main.tsx, App.tsx, AppWorkspaceShell, TabGroupPanel,
  TabGroupSplitLayout, RetainedPaneHost, TabBar, layout-apply-send, layout-frame-stream,
  runtime-layout-client, tabs-create-actions, TerminalPane, BrowserPane, web-browser-api,
  orcad/main.ts, orcad-browser-provider, pty registry, daemon-provider-state,
  pty-provider-contract, workspace-layout-command-types.
- Release steps 1.4.222→1.4.248 with at least one of the files changed: **19 of 20**.
- Files changed per step: 5, 6, 1, 14, 7, 6, 4, 4, 3, 10, 4, 1, 16, 3, 4, 7, 6, 7, 3, 0. Mean
  5.55 of 22 (25%).
- Over 4 weeks, **20 of 22** changed. 4 of 22 did not exist 4 weeks earlier. None had moved
  between 1.4.248 and 1.4.249.
- A swapped whole file keeps PB's old copy and drops the upstream change without an error. A
  per-file upstream blob-hash check would therefore go red on about 95% of releases, and each red
  is a manual re-port. That is about 5 re-ports a week.

**Line-patch simulation.** Six seams, each patched with one line, on v1.4.222:

- `registry.ts` `localProvider` line
- `orcad-browser-provider.ts` kind union
- `vite.web.config.ts` input
- `daemon-provider-state.ts` `setLocalPtyProvider`
- one appended line in `orcad/main.ts`
- one appended line in `web/main.tsx`

The commit was cherry-picked forward release by release through 1.4.249:

- **19 of 21 steps were clean.**
- 2 steps conflicted (1.4.229 and 1.4.239), both in `registry.ts`. In both cases the anchor line
  survived and the patch was regenerated.
- A direct 4-week jump (the v1.4.222 patch onto v1.4.248) conflicted in `registry.ts` only.
- The 6 seam files themselves changed in 16 of 20 steps. Upstream edits to a file rarely touch
  the patched line, which is why small patches survive the churn and whole-file swaps do not.

**Drift rate of APIs that PB's added files would import** (failures appear as type errors, not
as silent drops):

| File | Release steps with a change |
|---|---|
| `pty-provider-contract.ts` | 9 of 21 |
| `store/slices/tabs` | 14 of 21 |
| `workspace-session-tab-type-schema.ts` | 1 of 21 |

Not every change breaks a consumer. Adding an optional member, for example, breaks nothing.
**Unverified:** how often a change actually breaks PB code.

### 5. Sizes (non-test `.ts`/`.tsx` lines at orca-eval HEAD ≈ 1.4.248)

| Area | Files | LOC |
|---|---|---|
| src/main (all of orcad's backend plus Electron main) | 8,463 | 1,045,742 |
| src/main/runtime | 1,811 | 234,934 |
| src/main/daemon | 341 | 39,764 |
| src/main/agent-hooks | 126 | 15,954 |
| src/main/orcad | 119 | 12,645 |
| src/main/browser | 560 | 71,896 |
| src/shared | 3,012 | 284,761 |
| src/renderer/src | 8,748 | 1,086,336 |
| mobile/ | 2,232 | 253,546 |
| web client RPC shim (`renderer/src/web/preload-api`) | 63 | 6,969 |

Measured at the v1.4.248 checkout, Orca-only backend subsystems with no Theia equivalent:

| Subsystem | LOC |
|---|---|
| runtime/orchestration | 32,960 |
| agent-hooks | 15,206 |
| files named `*worktree*` in main + shared | 53,595 |
| mobile, relay, E2EE and pairing files in main + shared | 50,944 |
| main/git | 18,797 |
| runtime/agent-session | 6,971 |
| automations | 5,526 |
| 26 per-agent integration directories (claude, codex, gemini, cursor, copilot and others) | 109,282 |

Renderer views D-02 keeps as Orca's:

| View | LOC |
|---|---|
| sidebar | 78,878 |
| settings | 82,178 |
| right-sidebar | 77,298 |
| native-chat | 58,033 |

**Theia 1.76 already has** (PB's `theia/` packages): Monaco editor, `@theia/terminal` with
`@theia/process` (node-pty), navigator, scm, the Lumino dock, `@theia/ai-chat` and
`ai-chat-ui`, `ai-mcp`, `ai-terminal`, and `plugin-ext-vscode`. **Theia has no equivalent for:**
the Orca worktree model, agent hooks, orchestration, agent status detection, the mobile pairing
relay with E2EE v2, or per-agent launchers.

**Orca's gates** (213 `package.json` scripts):

- lint: oxlint, ast-grep and react-doctor
- about 40 `check:*-ratchet` and `check:*` scripts, for example `check:layout-writer-ratchets`,
  `check:daemon-protocol-crossing` and `check:import-boundaries`
- `typecheck` (TypeScript ^7, with a bun variant `typecheck:ci`)
- vitest over 6,750 main, 4,393 renderer, 1,352 shared and 1,246 mobile test files
- Playwright e2e under Electron 43.8.4

Toolchain: pnpm 12.14.0, Node 24, and a `postinstall` that rebuilds native dependencies.

### 6. Licensing

- Orca is **MIT**, "Copyright (c) 2026 Lovecast Inc." (`LICENSE`).
- No CLA or DCO appears in `.github/CONTRIBUTING.md`, and there is no trademark policy in the
  tree.
- The only bundled third-party notice is the Geist font under OFL-1.1, with a reserved-font-name
  clause (`docs/site/THIRD_PARTY_NOTICES.md`).
- Subpackages carry their own licences (`mobile/packages/expo-two-way-audio/LICENSE`,
  `resources/licenses/*`).

What each option requires:

| Option | Requirement |
|---|---|
| A2, A, B | Ship the MIT notice and the bundled third-party notices with PB's artifacts (an OVL-04 licence row). No name change is legally required by the licence. Using "Orca" as a mode name is a trademark question, and whether Lovecast or stablyai holds a registered mark is **unverified**. |
| B | Same as above. A public fork repo must also keep `LICENSE`. |
| C | Clean-room code needs nothing. Any copied Orca file keeps the MIT notice. |

## Per-option attack

### Option A as currently decided (D-04 + D-16: whole-file swaps first)

What breaks it:

1. **The overlay goes stale on nearly every release.**
   - The plausible swap set changed in 19 of 20 release steps.
   - A whole-file swap does not conflict. It silently keeps PB's copy, so upstream bug fixes in
     that file are dropped.
   - Making it loud needs a pinned upstream hash per file, which then goes red about 5 times a
     week.
   - "Rebases stay mostly automatic" (D-16) is false for swaps and true for one-line patches
     (19 of 21 clean).
2. **"Leaf files" do not exist where D-01 needs them.**
   - There is no pane registry.
   - Tab rendering reaches 221 files through `contentType`, and `tab-group/` has 53 external
     importers.
   - The files to swap (TabGroupPanel, App, AppWorkspaceShell, tabs-create-actions) sit in the
     middle of the dependency graph, not at its edges.
3. **D-15's premise is wrong for the build PB would ship.**
   - In 1.4.248 the web client and every shipped build run `ORCA_LAYOUT_OWNER=window`: the
     renderer owns the layout.
   - orcad's layout owner is a dark path that Orca's own packaging rejects, and the old path is
     scheduled for removal in a "phase F" with no date (**unverified** when).
   - Building PB's dock as an orcad layout client means building on an unshipped protocol (41
     commits in 4 weeks to its command types). That work would have to be redone when Orca flips
     the switch.
4. **The terminal provider is larger than recorded.** It has 48 members (21 required), its
   contract changes in about 43% of releases, and orcad still probes node-pty.

What survives: the pinned source build, the rebase job, PB's existing patch tooling
(`scripts/apply-patches.sh`, `check-patch-surface.sh`, `rebase-upstream.sh`,
`.github/workflows/rebase-upstream.yml`) and the seam list. Those parts become A2.

### Option B: hard fork, merging upstream

What breaks it:

1. **The merge load.**
   - Files PB would rewrite to own tabs (tab-group, tab-bar, renderer runtime, store tabs slice,
     terminal-pane, browser-pane): 1,509 non-test files.
   - Upstream commits touching them: 1,139 in 4 weeks and 166 in 5 days.
   - Every release step changed between 15 and 955 of those files.
   - 192 files outside the set import it, so a rewrite spreads beyond the set.
   - A rewritten file conflicts on every upstream touch, which here means every release.
2. **Refactor volume.** Steps routinely carry refactors of 1,000–2,364 files. `git diff -M`
   skips exhaustive rename detection unless `diff.renameLimit` is at least 3,032 (245..248) or
   1,949 (248..249). Git's rename tracking is B's one real mechanical advantage over a path-keyed
   overlay, and it needs tuning to work here.
3. **Gates.** A fork either keeps Orca's ~40 ratchets, typecheck and ~13.7k test files green
   after deep rewrites, or disables them. Disabling them removes the regression net that makes
   taking 190 commits a day survivable. Several ratchets target exactly the code PB would rewrite
   (`check:layout-writer-ratchets`, `check:unproven-pty-retirement-ratchet`,
   `check:daemon-protocol-crossing`).
4. **Hosting.** PB's org would carry a 42k-file repo. History since 2026-08-15 alone cloned to
   2.0 GB on disk, and the full size is **unverified**.
5. **With additive-only changes, B costs about the same as A2.** Merging six one-line hunks is
   the same three-way merge the simulation ran. B's edge is the freedom to change anything, and
   the churn numbers make that freedom unaffordable.

### Option C: native rebuild as `@powerbrowser/*` plus a PB daemon

What breaks it:

1. **Priority 1 fails by construction.** PB receives no Orca releases. Each of Orca's about 5
   releases a week becomes reimplementation work or a permanent gap.
2. **Size.**
   - The Orca-only backend PB would rewrite is at least ~160k LOC: orchestration 33k, hooks 15k,
     worktree code 54k, mobile/relay/E2EE 51k and agent sessions 7k.
   - Parity with the agent list adds 109k LOC across 26 integrations.
   - Orca's views (chat 58k, sidebar 79k, settings 82k) would be rebuilt on top of that.
   - An honest floor for a reduced feature set is worktrees, launch for 2–3 agents, hook status,
     and chat through Theia AI or ACP. That is tens of thousands of PB-written LOC
     (**unverified estimate**), and it still lacks orchestration, remote hosts and mobile.
3. **D-23 cannot hold cheaply.** Pairing the stock mobile app requires a PB daemon that is
   bit-compatible with Orca's E2EE v2 relay: 36 protocol files with 48 commits in 4 weeks. PB
   would track a private protocol without getting the code that implements it.
4. **What C gets right:** Theia already covers the editor, terminal, file tree, SCM, the dock and
   a chat UI. That is why A2 keeps Theia's editor and terminal (D-01) rather than Orca's.

## Hybrids considered

| Hybrid | Verdict | Reason |
|---|---|---|
| **A2: additive overlay.** New files plus at most ~10 declared one-to-few-line seam patches. No whole-file swaps. Orca's own React panes are mounted in Lumino widgets through a new PB entry module, and PB's dock owns the arrangement. | **Recommended** | Line patches: 19 of 21 releases clean in the simulation. Added files fail loudly as type errors. React 19.2.8 on both sides. Reuses PB's patch tooling. |
| H2: consume orcad nearly unmodified and write a PB-native client (Theia widgets over orcad RPC) | Rejected | The RPC is private and E2EE: 348 method files, of which 172 changed in 5 days. It also means rebuilding about 300k LOC of views that D-02 keeps as Orca's. Only the terminal view goes native (already D-01). |
| H3: fork orcad only, overlay the client | Rejected | orcad needs about 3 seams (PTY provider registration, the browser provider kind, possibly the entry). A fork adds hosting and merge work and saves nothing. |
| H4: keep the A2 patch stack as a branch in a PB-owned Orca fork, rebased by the job | Acceptable variant | Mechanically identical to A2, with git rename tracking for free. It costs hosting a 42k-file repo. Choose on tooling preference, not on cost. |
| H5: A2 plus offering the generic seams upstream (pluggable PTY provider, pluggable browser provider, extra web entry) | Recommended in addition | If accepted, the patch stack shrinks to zero. Whether Orca accepts external contributions of this kind is **unverified**: CONTRIBUTING exists and the repo has 35 authors per 5 days. |

How the D-01 tab requirement fits A2, all of it to be proven by a spike:

- A new PB file in Orca's web build (`pb-panes` entry) bootstraps Orca's store once.
- It mounts the pane component for each Orca pane into a host element supplied by a Lumino
  widget, either as one Orca client in Theia's document or as an iframe per pane.
- It observes Orca's layout state read-only, so that panes Orca opens become new Lumino tabs.
- Orca's `TabGroupSplitLayout` and `TabBar` are simply not rendered by that entry. No upstream
  file is swapped.

Open spike items: cross-origin WebSocket to orcad from Theia's origin, isolating Orca's global
CSS (shadow roots), and per-iframe memory. All **unverified**.

## What changes in DECISIONS.md and REQUIREMENTS.md if A2 is adopted

DECISIONS.md:

- **D-04:** keep the pinned source build and the rebase job. Reverse the order to: new files
  first, then one-to-few-line regenerated patches at declared seams. Whole-file swaps of upstream
  paths are forbidden. Record that the first pin is already one behind (1.4.249) and that the
  cadence is about 5 releases a week.
- **D-16:** redefine "leaf files" as files PB adds. Name the seam list: PTY provider registration
  (`ipc/pty/provider/registry.ts` and/or `daemon/daemon-provider-state.ts`), browser provider
  kind (`orcad/orcad-browser-provider.ts`), web build entry (`vite.web.config.ts`), and possibly
  the orcad entry. Add a cap on the number of seam patches.
- **D-15:** correct the premise. In 1.4.248 the layout owner is the window (renderer) in shipped
  and web builds, and orcad ownership is the dark `ORCA_LAYOUT_OWNER=main` switch. New spike
  question: "PB dock observes the client's layout state" now, and "PB dock as client of orcad's
  layout protocol" once Orca ships it.
- **D-01:** the Theia-backed `IPtyProvider` must implement 21 required members, including
  serialize/revive, buffer snapshots, foreground-process queries and listProcesses, not just five
  operations. orcad still probes node-pty. Add the one-pane-per-Lumino-tab flattening, which is
  the owner question below.
- **D-03:** "Orca's React tab system may be replaced" becomes "Orca's tab-group and tab-bar are
  not rendered in PB's entry; Orca's pane components are hosted in Lumino widgets."
- **D-21 / D-22:** mobile churned 1,218 non-test files in 5 days and shipped 10 Android releases
  in 8 weeks. The mobile fork is held to the same additive rule, and otherwise it becomes the most
  expensive item in the plan.
- **D-23:** holds trivially under A2, because no protocol file is touched. Add the risk that the
  stock mobile app moves ahead of PB's pinned orcad (protocol skew; **unverified** whether newer
  apps refuse older orcad).

REQUIREMENTS.md:

- **OVL-01:** the check goes red on a whole-file replacement of an upstream path, on an
  undeclared seam, and when the seam count exceeds the cap. It records each seam's upstream blob.
- **OVL-02:** on each re-pin, the rebase job also runs Orca's own `typecheck:web` and
  `typecheck:node` over PB's added files, which makes API drift go red. Record the measured
  budget: about 10% of releases need a seam touch.
- **New OVL-05:** the PB pane entry and the PTY and browser providers are new files only, compiled
  by Orca's `build:web` and `build:orcad`.
- **TAB-03:** rewrite to match the corrected D-15.
- **TAB-04:** state "one Orca pane equals one Lumino tab", with Orca's in-tab splits flattened
  (pending the owner answer).
- **TAB-07:** "small modifications" to the sidebar, settings and orchestration panel must be
  additive. The sidebar is also behind a dark switch (`ORCA_SIDEBAR_INPUTS`, the same
  `dark-build-switches.cjs`).
- **TERM-01:** list the 21 required `IPtyProvider` members and the node-pty probe.
- **RUN-01 / PLAT-01:** `build:orcad` builds a node-pty prebuild per target on that target's own
  runner (`build-orcad-node.mjs:53-69`). Add pnpm 12.14.0 to the Nix dev shell.
- **OVL-03:** add a pin-lag check against the current stock mobile app.

## Open questions only the owner can answer

1. **Flattening:** do you accept that each Orca pane becomes one Lumino tab, with Orca's own
   in-tab splits and tab groups not reproduced, until Orca ships its orcad layout owner?
2. **Re-pin cadence:** take every Orca release automatically (about 5 a week; about 10% need a
   seam touch, plus type-drift fixes in PB's own files), or re-pin on a fixed weekly or two-weekly
   schedule?
3. **Upstream seams:** should PB offer the three generic seams (PTY provider registration,
   browser provider registration, extra web entry) to stablyai/orca now, and who makes that
   contact?
