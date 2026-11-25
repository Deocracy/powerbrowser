# Refactor brief: R2-shell-services

Owned, all under `powerbrowser/shell/`: `TheiaService.sys.mjs`, `GroupActorChild.sys.mjs`,
`OrcaService.sys.mjs`, `OrcaEnv.sys.mjs`, `powerbrowser.js`, `powerbrowser-sidecar.js`,
`powerbrowser.css`, `powerbrowser.xhtml`.

Not owned: `PowerBrowserAPI.sys.mjs` (lanes R1a and R1b), `jar.mn`, `moz.build`, `components.conf`,
`powerbrowser/INTERNAL-APIS.md`.

Notes:

- These files are consumers of the boundary in `PowerBrowserAPI.sys.mjs`. None of them may import
  a Firefox internal directly; `scripts/check-internals-boundary.sh` enforces it. A touchpoint that
  is already catalogued in one of these files (`GroupActorChild.sys.mjs` has 14 rows) stays in the
  same function; if a change moves, adds or removes one, record it under Handoffs.
- `TheiaService.sys.mjs` and `OrcaService.sys.mjs` spawn and supervise the sidecar and the pane
  host process: start, health probe, restart, shutdown at quit. Look for timers and subprocess
  handles that are not cleared on every exit path, retries without a bound, and awaits in sequence
  on the startup path that are independent.
- `powerbrowser.js` is chrome JS that is startup-cached; nothing here changes that, but it means
  no lane can observe its behaviour. Be strict about reading every caller.
- Every user-facing string in the shell error surface is asserted by `verify-shell-error-copy.mjs`.
  Do not change copy.
- `powerbrowser.css`: remove a rule only when no element in `powerbrowser.xhtml` or created in
  `powerbrowser.js` can match its selector.
