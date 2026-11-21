# Result: G3a-overlay-renderer

Branch: worktree-agent-a6a65559ea0c91e48   Base: 0f9f2735401a08132a479c95c09c53f03015fa19   Final: 2d232bbd (last code commit; this record is committed on top of it)

| ID | Status | Commit | Check | Note |
|---|---|---|---|---|
| overlay-renderer-02 = 64-CR-01 | fixed | 09a7d1f2 | verify-orca-overlay-renderer.mjs::a | THEME_RE lookahead excludes `\`; Orca's theme variants derived from main.css; built sheet had 99 bad heads, now 0 |
| overlay-renderer-01 | fixed | b07771b7 | verify-orca-overlay-renderer.mjs::b | leaf close no longer uses Orca's tab-wide active-pane event; Orca's split admission + closePaneLocally's store/host half + leaf-addressed CLOSE_TERMINAL_PANE_EVENT |
| 64-WR-02 | fixed | b07771b7 | verify-orca-overlay-renderer.mjs::b | a pane-scoped close for a leaf already gone returns, never closes the tab |
| 64-WR-03 | not-fixed | - | - | needs planPanes adoption on the Theia side (G3b files); omitting the leaf-less record would stop TerminalPane from ever writing the first layout; see Handoffs |
| 64-WR-04 | fixed | 48a680c9 | verify-orca-overlay-renderer.mjs::c | store listener work (paneRecords and the host listener) inside try; failure recorded, last list kept |
| 65-WR-01 | fixed | 2daa4e37 | verify-orca-overlay-renderer.mjs::f | unknown worktree not local; host resolved by Orca's resolveWorktreeExecutionHost; folder workspaces through getFolderWorkspaceWorktree (also fixes worktreePath '') |
| overlay-renderer-03 | fixed (overlay half) | 130206c9 | verify-orca-overlay-renderer.mjs::e | rejected bootstrap cleared; install steps run once across attempts; Theia half handed to G3b |
| overlay-renderer-04 | fixed | e25f62fa | verify-orca-overlay-renderer.mjs::d | last 50 mount errors kept, state() adds mountErrorsTotal |
| 64-WR-01, pairing-credentials-01, 67-WR-02 (G3b handoff) | not-applicable | f4b2fe09 (check only) | verify-orca-overlay-renderer.mjs::e | already true since 130206c9: pb-pane-mount.tsx:728-731 `.catch(() => { booting = null; throw })`, :675-679 `once()`, :705 `once('services root')`; check now also fails pairing once and plants a second services root |
| 65-WR-03 (G4 handoff) | fixed | 2d232bbd | verify-orca-overlay-renderer.mjs::f2 | subscribeWorktrees projects `hydrated: state.hasHydratedWorktreePurge === true`; OrcaWorkspaces gains `hydrated?: boolean` |

Every fix was rebuilt with `nix develop .#orca --command bash scripts/build-orca.sh --panes-only` and typechecked with Orca's
own web program (`tsc --noEmit -p config/tsconfig.tc.web.json --composite false --incremental false`, TS 7.0.2, exit 0).
orca-overlay, orca-pane-entry, orca-pane-css, orca-terminal-keys, orca-pane-routes, orca-pane-groups and
orca-editor-routes (and their self-tests) pass on the final tree. Each new clause was also run against the base
versions of the two files and goes red there. seams.json is unchanged (no patch was needed).

## Registry requests
- orca-overlay-renderer: quick, `"orca-overlay-renderer|node $REPO_ROOT/scripts/verify-orca-overlay-renderer.mjs"` (under 1 s; SKIPs each clause whose input is absent)
- orca-overlay-renderer-self-test: quick, `"orca-overlay-renderer-self-test|node $REPO_ROOT/scripts/verify-orca-overlay-renderer.mjs --self-test"` (about 1 s, 45 cases)

## Red by design
- scan-brand-residue and scan-brand-residue-self-test: the new check names Orca's tree, and the overlay comments add the word. Exact change in `inventory/brand-tokens.json` on the final tree: row "Orca" (title) expected_count 3281 -> 3333; row "orca" (lower) 5679 -> 5704; row "ORCA" (upper) 1270 -> 1282; add `scripts/verify-orca-overlay-renderer.mjs` to the expected_files of those three rows (sorted position). Recount at integration if other lanes also changed these counts.

## Handoffs
- G3b: `theia/extensions/orca-panes/src/browser/orca-pane-routes.ts` planPanes (+ `orca-pane-widget.tsx`, `orca-pane-observer.ts`), for 64-WR-03: when a new terminal record has key `${record.tabId}:<leaf>` and `state.known` holds the key `record.tabId` (the same tab's leaf-less record) that is absent from this list, emit an adoption (re-key from `tabId` to the pane key, keep the widget, its name and its Lumino position) instead of dispose + create; the widget updates its key and `pick.paneKey` and remounts its body with `mountPane(element, newPick, activity)`; markGone must not tombstone the adopted name.
- G3b: `theia/extensions/orca-panes/src/browser/orca-pane-bundle.ts` and `failure/orca-hosting-status.ts`, for overlay-renderer-03: on a rejected boot clear `this.booting`, and let Reconnect call `ready()` again when the bundle failed (G3b reports this done).
- G3b: `theia/extensions/orca-panes/src/common/orca-panes-protocol.ts:108`, for overlay-renderer-04: add `mountErrorsTotal?: number` to the `state()` type.
- Owner of `scripts/lib/orca-pane-harness.mjs`, `scripts/verify-orca-pane-standalone-live.mjs`, `scripts/verify-orca-side-panel-live.mjs`, for overlay-renderer-04: they use `state().mountErrors.length` as a cursor and `slice(before)`; once 50 errors are kept that cursor stops moving. Use `mountErrorsTotal` for before/after and take `mountErrors.slice(-(totalAfter - totalBefore))`. No effect while a run records fewer than 50 errors.
- G4, for 65-WR-03: Orca sets `hasHydratedWorktreePurge` (store/slices/worktree-helpers.ts:135, set in store/slices/worktrees/listing/hydrated-worktree-purge.ts:97) only when every repo's listing is authoritative and at least one worktree was detected. With zero repos it never becomes true, so the root sync must not wait on it forever when Orca lists no repository (for example treat `repos.length === 0` after `startupWorktreeRefreshCompleted` as complete, or keep the timer as the fallback for that case only).

## Behaviour changes
- overlay-renderer-02 (64-CR-01): in Orca's dark theme, hosted panes and portals now apply every `dark:` Tailwind utility (input backgrounds, `dark:invert` icons, accent rings and borders); before, none applied. Revert with 09a7d1f2.
- overlay-renderer-01 (D-15 kept: one leaf stays one tab): closing a split's PowerBrowser tab closes that leaf's shell only; before, it closed each mounted instance's active leaf (often the sibling, or several). The running-process prompt is now Orca's store-driven dialog (same CloseTerminalDialog copy, hosted once by the services root) instead of the per-instance one, and a probe that times out asks instead of closing. Revert with b07771b7.
- 64-WR-02: a second close click on a split leaf that is already gone does nothing; before, it closed the whole terminal tab. Revert with b07771b7.
- 65-WR-01: a file whose worktree is unknown, has no host and no resolvable repo row, or resolves to an SSH host now opens through Orca's editor routes instead of a local `file:` editor, and is not added as a local workspace root; a folder workspace's diff and conflict routes now join against the folder path instead of `/`. Revert with 2daa4e37.
- overlay-renderer-03: after a failed pane-bundle boot, a later bootstrap call (Reconnect) boots instead of returning the old failure. Revert with 130206c9.
- 65-WR-03: G4's root sync can now wait for Orca's own hydration flag instead of a 750 ms timer. Revert with 2d232bbd.

## Needs owner
None.

## Quick gate
First full run (`nix develop .#theia --command bash scripts/verify-platform.sh --quick`, tree at 9c9657b1): summary 414 PASS, 4 FAIL (base: 419 PASS, 0 FAIL). The rows touched after that run were re-run with `--only` on the final tree.
- scan-brand-residue: FAIL, Red by design (inventory counts, above).
- scan-brand-residue-self-test: FAIL, Red by design: its clean-root control fails while the whole-tree scan is red; green once the inventory rows are updated.
- licence-allowlist: FAIL, not a code fault: its Orca shipped-set cache key hashes every orca-overlay file, so any overlay edit forces a re-derivation, and that needs `.mozbuild/corepack/bin/pnpm`, which is a broken relative symlink in this provisioned worktree (copied from the main checkout at a different depth). It passes where the shim resolves (the integration worktree or after `build-orca.sh`).
- licensing: FAIL, same cause as licence-allowlist.
