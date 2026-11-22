# Refactor brief: R7-pane-hosting

Owned:

- every tracked file under `theia/extensions/orca-panes/`, `theia/extensions/orca-browser/`,
  `theia/extensions/orca-workspace/` and `theia/extensions/orca-agents/`;
- every tracked file under `orca-overlay/files/`.

Not owned: `orca-overlay/patches/`, `orca-overlay/upstream/`, `orca-overlay/seams.json`, and the
third-party checkout `orca/` (never edited).

Notes:

- The extensions host the third-party pane bundle inside the Theia document and bridge it to the
  shell: bundle loading (`orca-pane-bundle.ts`), pane observation and side-panel sync, hosting
  status and failure copy, the browser dispatch table (`orca-browser-dispatch.ts`) and the
  workspace root and editor routes.
- `orca-browser-dispatch.ts` and `orca-browser-frontend-module.ts` are part of the agent wall
  (stop state, page binding, owner checks). Do not reorder, merge or short-circuit those checks.
- The overlay files are compiled into the third-party build by `scripts/build-orca.sh`. Read that
  script and `orca-overlay/tsconfig.pb-build.json` to find the type check you can run without a
  network install; if none can run in your worktree, say so in the record and keep overlay changes
  to ones you can prove by reading. Integration runs `scripts/build-orca.sh --panes-only` after the
  merge.
- `pb-pane-mount.tsx` (1,375 lines) mounts and unmounts panes. Look for React roots, observers and
  subscriptions that are not released on unmount, and effects whose dependency list makes them run
  on every render.
- Look in the extensions for: polling where an event exists, status probes that overlap when one
  is slow, observers that are not disconnected on dispose, and retries without a bound.
- The scan keeps counts of several tokens that appear all over these files. Any added or removed
  occurrence turns the brand scan red until integration recounts: that is Red by design.
