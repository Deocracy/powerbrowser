# Spike Conventions

These are the patterns and stack choices established across spike sessions. New spikes follow
them unless the question requires otherwise.

## Stack

- Node ESM (`.mjs`) scripts drive the built product at `objdir/dist/bin/powerbrowser`, headless,
  over WebDriver BiDi. No new dependencies; Node built-ins plus the repo's harness only.
- The harness is `scripts/lib/pb-relaunch.mjs` (`makeProfile`, `withShell`, `probe`, `pollFor`,
  `stockTabOn`) and `scripts/lib/pb-live-probe.mjs` (`withProbeShell`, `openWebTab`,
  `inChrome`). These are the same libraries the live verify checks use.

## Structure

- One directory per spike, `.planning/spikes/NNN-name/`, holding:
  - `README.md` with frontmatter (`idea`, `verdict`).
  - The driver script (`run.mjs` or `probe.mjs`).
  - Any test extension under `extension*/`.
  - Results next to the script (`results*.json`, `probe-*.json`, screenshots).
- Comparison spikes share a number with a letter suffix (`002a`/`002b`/`002c`).
- Spike code is throwaway, and no product file changes. A Gecko change is carried as a `.patch`
  file inside the spike directory and is never applied to `upstream/`.

## Patterns

- Every run uses a fresh temporary profile and private `XDG_CONFIG_HOME` (`makeProfile`).
- Chrome-scope reads and writes go through BiDi `evaluateIn(app.chrome, …)`. The
  `Cc`/`Ci` identifiers stay inside the evaluated string, so the internals-boundary scan stays
  clean.
- Web tabs are opened through the stock `WebTabOpenHandler.openUrl`. Content contexts are found
  with `browsingContext.getTree`; match on origin when the page rewrites its URL.
- The GUI-01 stock window is the control: `window.open(url, '_blank')` from the Theia frame.
- Each sub-check records PASS/FAIL with the observed value, and the README keeps an Investigation
  Trail of every run, including failed attempts.

## Tools & Libraries

- Test extensions are installed with `AddonManager.installTemporaryAddon` from the shell
  document. This works because the build has `MOZ_REQUIRE_SIGNING=false`.
- Screenshots come from `browsingContext.captureScreenshot` on the content context. Keys are
  sent with `input.performActions` on the content context. Chrome `<key>` handling needs TIP
  instead, as `pb-live-probe.mjs` `pressKey` does.
