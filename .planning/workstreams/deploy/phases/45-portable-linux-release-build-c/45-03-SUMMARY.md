# 45-03 SUMMARY — PKG-04/PKG-05 packaged proof + PKG-07 CLI URL

**Phase:** 45-portable-linux-release-build-c, plan 03, wave 3
**Commits:** fb13c37 (packaged-identity row), 4d6fa5f (PKG-07 handler + catalogue)
**Date:** 2026-10-23

## Task 1: packaged proof (fb13c37)

- `scripts/verify-packaged-identity.mjs` (new): full-tier row deriving the
  expected release-variant identity at check time from `releaseIdentity()`
  (ESR pin + product revision, never typed) plus the release-variant
  `emitTheiaBranding` emission. Compares field-by-field against the staged
  package via built-tree helpers: `application.ini` Name/Version/Vendor +
  BuildID shape (14+ digits, same-ESR revisions need distinct buildIDs) +
  staged `theia/package.json` `powerbrowserBranding.legalNotices` as set
  equality against `emitLegalNotices(release)` (install-closure half of the
  `verify-branding-preflight` source-tree half; no new Theia file).
- Self-test: control green first, then the dev-suffix plant (contract's own
  plant, red naming `theia/package.json` + the planted notice) and the
  dropped-notice plant (PKG-05 fold-in, red naming the staged file + the
  missing notice text). `grep -c releaseIdentity` >= 1 (derived, never a
  typed version literal). Registry: `packaged-identity` full row beside
  ng063 + `packaged-identity-self-test` twin in the quick set (plan
  acceptance `grep -c packaged-identity` = 2 rows + 2 comment mentions = 4).
- ng063 container re-proof: `--only ng063-packaged-launch` FAIL (blocked:
  no `objdir/dist/*-153.5.1.en-US.linux-x86_64.tar.xz`; exact rerun is the
  45-04 container build + package commands), recorded as blocked red naming
  the build procedure, never green. Same blocked red for `--only
  packaged-identity`.
- Incidental fix in this commit: the dev-suffix plant initially carried the
  literal dev composition on two lines, which `verify-manifest-literals`
  flagged (2 problems); both literals are now string-concatenated so the
  self-test still plants the real value at runtime without storing it.

## Task 2: PKG-07 CLI URL (4d6fa5f)

- `PowerBrowserAPI.cliUrl(cmdLine)` (new, boundary file only): reads the
  bare flagless argument via `length`/`getArgument(0)`, resolves through
  `cmdLine.resolveURI`, admits only `about:newtab` + http/https (mirroring
  `openStockTab`), returns null otherwise; never throws. Handler
  `handle()`: first-launch opens the shell window then `openBrowserWindow(url)`;
  remote-handoff focuses then `openStockTab(url)`; refusal opens/persists
  nothing. No eval/shell/persistence outside history; no custom chrome (stock
  window only). `grep openBrowserWindow` = 9 (definition + call sites);
  `cmdLine` first lines show the handler reading an argument.
- `INTERNAL-APIS.md`: new `cliUrl` catalogue row (T-45-08); amended the three
  stale never-reads-an-argument sentences (rows 60/61/66); renumbered 13
  shifted File:Line rows (5 handler + 8 savePageCopy) to the guard-reported
  lines. `check-internals-boundary.sh` PASS, `--catalogue` PASS (both
  files), `verify-ng-040-internals-catalogue-lines.mjs` PASS (cliUrl row
  points at the first touchpoint line).
- `inventory/brand-tokens.json`: COUNT MOVED 50 -> 51 with the 45-03
  provenance reason (new cliUrl catalogue row's `45-03-PLAN.md` citation).
  `scan-brand-residue` PASS (408 files) + `--self-test` 14/14 PASS.
- Launch-with-URL proof: blocked-behind-owner/local-build (no container
  binary); exact launch command rides the 45-04 gate, never claimed green.

## Flagged assumptions (3/3 outcomes)

- PKG-04: re-proof is exactly the existing ng063 row via built-tree.mjs
  (follows POWERBROWSER_OBJDIR); recorded blocked red is a real finding
  shape, not a harness artifact.
- PKG-05: release notices are exactly `emitLegalNotices(release)` (3
  strings, empty suffix changing only the Mozilla sentence); staged fragment
  source path is `theia/package.json` `theia.frontend.config.
  powerbrowserBranding` with the top-level fallback.
- PKG-07: first-launch + remote-handoff are the two handler branches needing
  the URL; different-profile launches never reach the handler (remoting keys
  on the profile path) so no third branch is planned.

## Verification

- `verify-packaged-identity.mjs --self-test` PASS; `--only
  packaged-identity-self-test` PASS.
- `check-internals-boundary.sh` + `--catalogue` + ng040 row green.
- `scripts/verify-platform.sh --quick` PASS after each commit.
- Prohibitions kept: untrusted CLI input only to the scheme-walled path; no
  custom chrome; no internal identifier in new user-facing strings (none
  added -- handler adds no user-facing string).
