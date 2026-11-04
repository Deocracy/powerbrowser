# v1.7 research inputs

Recorded 2026-11-04 during `/gsd-new-milestone --ws orca`. Chris chose "research first" and
asked for the research to be noted here, in the orca workstream, not in `.planning/research/`.

## Owner decisions this research must respect

- Mode is named "Orca"; tabs are "Orca tabs"; renames are deferred (survey decision 1).
- Landing logo becomes the PB logo, by injection (survey decision 2).
- orcad profile directory `powerbrowser-orca`, set through `ORCA_USER_DATA` (survey decision 3).
- Injection through a JSWindowActor (survey decision 4).
- Tab URI scheme `pb-orca:`. The requirement is that Orca tabs work in every mode and move
  between any modes.
- Agents keep Orca's default (`--dangerously-skip-permissions`). Agent status hooks stay on.
- Platforms: Linux, macOS and Windows. Flatpak gets `--filesystem=home`.
- orcad, its Node runtime and the web client come from a **pinned Orca release fetch** for
  each OS (version + hash), like `scripts/fetch-upstream.sh`. Orca desktop does not need to
  be installed.
- In scope: Add-project UI and a credential-storage check.
- Orca's embedded browser is **replaced by PB chrome**, and Orca's browser tools are added
  to PB's chrome. Spike first, then build. See `../NOTE-orca-tab-parity-direction.md`.

## Tab splitting: Orca vs PB (from Chris, 2026-11-04)

Orca's tab splitting runs on three third-party packages, and the rest is Orca's own code:

- react / react-dom (~19.2): they render the panes, and `createPortal` draws the "New split"
  overlay.
- @dnd-kit/core (^6.3.1): drag events, sensors, and the `pointerWithin` and `closestCenter`
  hit tests. It does no splitting or layout.
- Zustand behind `useAppStore` holds the split tree. This is inferred from their
  `check:zustand-selector-fanout` script; the store file was not read.
- Orca's own code is in `src/renderer/src/components/tab-group/`: `TabGroupSplitLayout.tsx`
  and `TabGroupSplitNodeTree.tsx` (the split tree), `useTabDragSplit.ts` (connects dnd-kit to
  the layout), `tab-drop-zone.ts` (`resolveDropZone`: up, down, left, right, center),
  `TabPaneColumnSplitDragOverlay.tsx` and `TabGroupDropOverlay` (the highlight), and
  `tab-drag-drop-commit.ts` (applies the drop).

PB is different: Theia does all of this with @lumino/widgets `DockPanel`, which provides the
split tree, drop zones and overlay. PB uses neither dnd-kit nor React for it.

Source: imports of the five main files on GitHub main (1.4.214), not the installed 1.4.245.

Consequence to verify: when Orca's stock web client runs inside one PB web tab, Orca's split
layout is nested inside that tab. Orca's panes cannot be dragged into PB's Lumino dock, and
PB tabs cannot be dragged into Orca's splits. "Orca tabs move between any modes" therefore
needs a decision on what an "Orca tab" is: the whole client tab, or individual Orca views
(terminal, chat, browser), each as its own PB tab.

## Sources available to researchers

- Orca source: `/home/chris/coding/orca-eval` (shallow clone, HEAD 3052dd79, version 1.4.214).
- Installed build: `/nix/store/zqzrjgzy297m4b7pgr0k2165l3wmhix8-orca-ide-1.4.245-extracted/resources/`.
- Seed: `.planning/seeds/SEED-261103-o1g-orca-mode-milestone.md`.
- Spike 003: `.planning/spikes/003-orca-headless-client-in-pb/` (README, results.md, probe.mjs).
  Two known errors: the bundle path is `out/renderer`, not `out/mobile-web`; the profile
  variable is `ORCA_USER_DATA`, not `ORCA_USER_DATA_PATH`.
- Hosting reference: `.claude/skills/spike-findings-Power-Browser/references/orca-client-hosting.md`.
- Rebrand survey: `.planning/workstreams/orca/ORCA-REBRAND-SURVEY.md`.
