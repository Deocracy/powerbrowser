# Phase 39: v1.5 Close-out - Research

**Researched:** 2026-11-05
**Domain:** Defect root-causing and live-verification close-out of a Gecko-shell plus Theia-sidecar browser (patch stack, live BiDi harnesses, KDE Wayland)
**Confidence:** MEDIUM (harness, patch and UAT facts are read from the tree; the root causes of C22, C23 and C24 are NOT found and are given as ranked hypotheses with a bisect plan)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
Owner rulings already made (Chris, 2026-11-05)
- C22, C23, C24 are fixed before v1.5 closes, not deferred.
- All 13 backlog rows 999.4-999.16 are fixed in v1.5, including 999.12 (KDE portal chooser) and 999.15/999.16 (regenerated patch 050 plus Gecko rebuild).
- Claude runs every UAT item the live harness, gsd-browser or KWin+spectacle can reach; only human-eye and portal-click items go to Chris as one checklist.
- Owner-decision UAT rows get a one-line recommendation each and are asked per phase in the AskUserQuestion box.
- Every deferral is documented: backlog row plus WINDOWS.md entry with repro, cause-so-far and the source UAT test.

### Claude's Discretion
All remaining implementation choices are at Claude's discretion — discuss phase was skipped per user setting. Use the ROADMAP scope above, the project hard rules in CLAUDE.md (patches regenerated never text-edited, one anti-corruption layer, registry-driven checks with self-tests) and codebase conventions to guide decisions.

### Deferred Ideas (OUT OF SCOPE)
None — discuss phase skipped.

(Scope, verbatim from ROADMAP.md Phase 39, is in 39-CONTEXT.md `<domain>`; the UI contract is inheritance-only: Phase 39 adds no token, component, copy or layout — 39-UI-SPEC.md.)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PROMPT-04 | Page context menu (Copy Image row, C24; dismissal focus race C11/999.10) | C24 bisect plan (wl-paste splits environment from product); C11 stale-dismiss token in `page-context-menu.ts` |
| PROMPT-06 | Form-history and saved-login autocomplete popup (C23) | C23 hypothesis list and instrumentation steps |
| PROMPT-08 | Page tooltips and link status (C22) | C22 hypothesis list; tooltip chain read from upstream C++ |
| EXT-04..EXT-10 (roadmap says EXT-01..EXT-10) | 999.15 event-page wake and 999.16 policies with no stock window; EXT-10 password-manager fill | Patch-050 hunks, guard rows, no-rebuild finding; Vaultwarden route. NOTE: REQUIREMENTS.md has no EXT-01..03 in v1.5 (its heading reads "continuing from EXT-03"); the real set is EXT-04..EXT-10 |
| live halves of every v1.5 requirement with a pending UAT row | ~113 UAT rows across 9 phases | Per-phase classification table below |
</phase_requirements>

## Summary

This is a close-out phase: almost everything is reading evidence and extending existing harnesses, not new technology. The tree is healthy for it. `objdir/dist/bin/powerbrowser` exists (built 2026-11-03), `upstream/` is at `FIREFOX_153_5_1esr_BUILD1` with the patch stack staged, and `patches/050` and `patches/060` match their build stamps byte for byte. Three live harnesses ran green on this host today by accident (see Pitfall 1): `verify-ext-tab-host-live` scenario `query`, `verify-extension-actions-live` `popup-action`, `verify-extension-amo-live` `amo-install`. So the harness chain works at HEAD.

Three findings change the plan the roadmap implies. (1) **999.15/999.16 need no Gecko compile.** Both target files are JS modules that `objdir/dist/bin/modules/` symlinks straight into `upstream/` (verified below); the work is two patch hunks in 050, two guard rows, a re-stamp and `-purgecaches`. The "Gecko rebuild" in the roadmap is a 50-minute cost the plan can avoid, with `./mach build` kept only as a fallback if the symlink check fails. (2) **`verify-platform.sh` and `--gate` cannot go green by fixing the 16 listed defects alone.** The default `prompts-live` run executes every scenario including `dialog-probe` and `dialog`, which fail by design while PROMPT-03 stays deferred (backlog 999.3, not in this phase), and `sharing` needs the portal. Phase 39 must decide how those rows are expressed (Open Question 1) and must start with a full baseline run to find every red. (3) **The owner-decision list is about 30 rows, not about 20**; the roadmap's list (32 T11; 36 T18; 37 T34-T41; 38 T31-T40) omits 27 T8, 31.1 T2/T3, 32 T9/T10, 34 T1/T2/T15, 35 T21/T22 and the copy/judgment items inside 33 T7 and 32 T3/T8.

C22, C23 and C24 are unresolved root causes. The upstream tooltip chain was read end to end and the product `showTooltip` adds one guard upstream lacks; the likely suspects and a cheap bisect for each are given. Real OS input is available (`ydotoold` runs, the user is in group `ydotool`), which turns the "real keyboard / physical mouse button" UAT rows into automatable ones, with a safety rule against typing into the wrong window.

**Primary recommendation:** Run a Wave 0 baseline (clean tracked tree, full `verify-platform.sh`, 34-UAT rewrite) before any fix; land 999.15/999.16 as two appended patch-050 sections with guard rows and no compile; treat C22-C24 as time-boxed diagnose-then-fix tasks with instrumentation first; and put a named policy for `dialog`/`dialog-probe` to the owner before promising a green gate.

## Project Constraints (from CLAUDE.md)

- Never fork or patch Theia core; Theia changes are `@powerbrowser/*` extensions (`scripts/diff-theia-core.sh` is the check). The C11 fix lives in `theia/extensions/chrome-bar`, which is allowed.
- Never modify Gecko outside the patch stack. `git -C upstream diff` (unstaged) stays empty; edits to `upstream/` only to produce a regenerated patch. Firefox internals only through `powerbrowser/shell/PowerBrowserAPI.sys.mjs`, every touchpoint catalogued in `powerbrowser/INTERNAL-APIS.md` (`scripts/check-internals-boundary.sh`, modes `--self-test`, `--catalogue`).
- Design for the bridge: `TabUriRegistry` exported shape asserted by `scripts/verify-registry-shape.mjs`.
- Repo path must contain no space (compliant).
- Rule 5: Theia is the default GUI, stock chrome reachable, no custom browser chrome authored. The wording change for rule 5 (36 T18) is an owner decision; an agent does not edit CLAUDE.md without Chris's approval message.
- No generator in Phase 1 rule and the residual-brand scan: `node scripts/scan-brand-residue.mjs` must exit 0; it iterates `git ls-files`, so stage new files before trusting a green scan; the originating product is named only in `inventory/brand-tokens.json`.
- Patches are regenerated, never text-edited (`scripts/regenerate-patches.sh`, `scripts/check-patch-surface.sh`, `apply-patches.sh --self-test`).
- One driver: `scripts/verify-platform.sh`. New checks are one appended registry row; never a sibling driver. Two check rules: never assert on the absence of a log line you also emit; derive expectations from the tree and compare as set equality; every new check gets a `--self-test` that plants faults and requires each to go red naming the drift.
- User-facing copy: no internal identifier in user text; Phase 39 adds no user-facing copy (39-UI-SPEC.md).
- Environment: Nix dev shells (`nix develop .#firefox` / `.#theia`); `yarn` only inside `.#theia`. A full `./mach build` is tier 3, 23-54 minutes.
- Memory rules that bind this run: other sessions may commit to `main` (commit with explicit paths, never `--amend`/`-a`/`stash` while foreign files are staged); every question goes through the AskUserQuestion box; no DSH runs; Opus for hard code, Sonnet for medium, Haiku for bookkeeping; the context-mode plugin blocks auto-mode Agent spawns (disable and restart before `/gsd-autonomous`).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| C22 page tooltip | Gecko shell chrome (`PowerBrowserAPI.sys.mjs` `installTooltipsAndLinkStatus`, `powerbrowser.xhtml` `remoteBrowserTooltip`) | Gecko content process (`nsDocShellTreeOwner` tooltip timer) | The tooltip is a stock XUL `<tooltip>` opened from `XULBrowserWindow.showTooltip`; Theia only owns IDE hovers |
| C23 saved-login popup | Gecko shell chrome (`PopupAutoComplete` panel) | Gecko actors (`LoginManager`, `AutoComplete`, `FormHandler`) | Stock panel and actors; no Theia DOM |
| C24 Copy Image | Gecko shell chrome (`pageMenuEdit` via Controllers actor) | Theia page-menu row (`page-context-menu.ts`) | Clipboard flavour is written by Gecko `nsCopySupport::ImageCopy` |
| C11 dismissal focus race | Theia frontend (`@powerbrowser/chrome-bar` `page-context-menu.ts`, `@powerbrowser/tab-uris` `web-tab.ts focusPage`) | Shell chrome focus (`powerbrowser.js`) | The late `widget.focusPage()` is a frontend callback |
| 999.15 event-page wake, 999.16 policies | Gecko patch stack (patch 050, JS-only) | Shell `extensionLateStartup` observer (already sends `extensions-late-startup`) | Upstream gates on topics only a stock window sends; runtime override of upstream members is banned by the spike findings |
| Live harness fixes 999.4/5/6/11/13/14 | Test harness (`scripts/*.mjs`, `scripts/lib`) | none | Instrument defects; no product change expected |
| 999.12 screen-share portal | Test environment (Gecko pref plus X11 backend) | Human (the actual portal click) | Portal chooser is OS UI; an X11 capture path avoids it for the harness only |
| UAT bookkeeping, owner batches | Planning docs (`*-UAT.md`, REQUIREMENTS, ROADMAP, WINDOWS.md) | AskUserQuestion | Records only |

## Standard Stack

No external package is installed by this phase. The "stack" is the in-repo tooling the plans must use.

### Core
| Tool | Version | Purpose | Why Standard |
|------|---------|---------|--------------|
| `scripts/verify-*-live.mjs` + `scripts/lib/{pb-live-probe,firefox-bidi,ng-a-live,pb-relaunch}.mjs` | in tree | Launch `objdir/dist/bin/powerbrowser` under WebDriver BiDi, drive Theia and chrome, plant faults in `--self-test` | The only sanctioned live-check mechanism; every UAT row names one |
| `scripts/regenerate-patches.sh` (`--check`, `--self-test`) | in tree | Regenerates each patch from the patched `upstream/` with pinned git flags | CLAUDE.md "patches are regenerated" gate |
| `scripts/verify-ext-tab-host-patch-guards.mjs` | in tree | Proves every added 050 hunk is carried by a GUARDS row or EXEMPT entry, with plants | New 050 hunks fail its coverage phase until a row exists |
| `ydotool` + `ydotoold` | 1.0.4 [VERIFIED: process list shows `ydotool-1.0.4/bin/ydotoold --socket-path=/run/ydotoold/socket --socket-perm=0660`] | Real OS-level keyboard and mouse input (uinput) | Only way to produce real input for 27 T1-T4, 36 T5, 38 T23 |
| KWin script via `qdbus` + `spectacle` | present [VERIFIED: `command -v`] | Raise the shell window, capture it | Existing `kwinShot` mechanism |
| `wl-paste` | present [VERIFIED: `command -v`] | Read the Wayland clipboard from outside Gecko | Separates environment from product for C24 |

### Supporting
| Tool | Version | Purpose | When to Use |
|------|---------|---------|-------------|
| `vaultwarden` (nixpkgs) | 1.37.5 [VERIFIED: `nix eval nixpkgs#vaultwarden.version`; the web vault is `vaultwarden.webvault`, per nix's rename error for `vaultwarden-vault`] | Local 127.0.0.1 vault server for EXT-10 fill (Chris ruled option b, 2026-11-01) | Only plan F; `podman` 5.8.9 is the alternative runner |
| gsd-browser MCP | n/a (not on PATH in this shell) | Drive the Theia sidecar standalone on :4000 | 34 "sidecar DOM measure" only; cannot drive Gecko chrome |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Patch 050 for both new hunks | New `070-*.patch` | A sibling patch needs a BUILD.md D-74 bullet and changes the "N patches applied" count; the owner's wording and the backlog rows both say 050. Recommend 050 |
| Appending git-produced sections to 050 | Shell-side `Services.obs.notifyObservers("browser-delayed-startup-finished"/"sessionstore-windows-restored")` | Those topics have 30+ unrelated observers (BrowserGlue, SessionStore, XPIProvider, nsAppStartup, telemetry); a shell-window subject would break them. Also runtime override of `ExtensionParent.browserPaintedPromise` is a runtime override of an upstream member, banned by `spike-findings-Power-Browser` ("Private upstream members are never overridden at runtime"). Rejected |

**Installation:** none (no npm/PyPI/crates package). Vaultwarden would be `nix run nixpkgs#vaultwarden` or a dev-shell addition [ASSUMED: dev-shell addition is acceptable; see Open Question 6].

**Version verification:** `nix eval --raw nixpkgs#vaultwarden.version` returned `1.37.5` on 2026-11-05.

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| (none: no npm/PyPI/crates package is installed by this phase) | | | | | | |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none
The Bitwarden extension and the other EXT-10 extensions come from addons.mozilla.org through the existing `verify-extension-amo-live.mjs` route (ids and XPI URLs read at check time). `vaultwarden` is a nixpkgs attribute, not a registry package; the planner may still gate its first run behind a `checkpoint:human-verify` if a dev-shell change is made.

## Architecture Patterns

### System Architecture Diagram

```
 Fix families                                   Evidence path
 ------------                                   -------------
 harness-only (999.4/5/6/11/13/14, 999.12 env)  scripts/verify-*-live.mjs  --self-test plants
        |                                            |
        v                                            v
 verify-platform.sh registry row  <---------- node scripts/verify-<x>-live.mjs [--scenario s]
        ^
        |
 product fixes
   C22/C23/C24  -> PowerBrowserAPI.sys.mjs (EOF furniture section) -- catalogue rows in INTERNAL-APIS.md
   C11          -> theia/extensions/chrome-bar/page-context-menu.ts  -- yarn build (Theia)
   999.15/16    -> upstream/ edit -> regenerate/append patch 050 -> guard rows -> re-stamp
                   objdir/dist/bin/modules/*.mjs are symlinks into upstream/  => no compile, just -purgecaches
        |
        v
 UAT disposition (113 rows): A harness | B screenshot+measure | C owner box | D human eye/portal
        |
        v
 UAT files, REQUIREMENTS/ROADMAP ticks, WINDOWS.md rows, backlog rows, human checklist, push
```

### Recommended Plan Shape (sequential: `PowerBrowserAPI.sys.mjs` edits shift INTERNAL-APIS line numbers, and `use_worktrees` is false)
```
Wave 0  baseline: clean tracked tree, full verify-platform.sh run, 34-UAT rewrite, tool probes
Plan A  harness-only: 999.4 5 6 11 13 14, plus the 999.12 X11-capture route
Plan B  patch 050: ExtensionParent + EnterprisePoliciesParent hunks, guard rows, live scenarios, re-stamp
Plan C  product: C22 C23 C24 (diagnose then fix), C11 (Theia) and removal of the closeMenu workaround
Plan D  new live scenarios for review-fix UAT rows without one (35 T16-T20, 36 T12-T16, 37 T18-T27, 38 T22 T25-T30)
Plan E  real-input rows through ydotool (27 T1-T4, 34 T6/T13, 36 T5, 38 T23)
Plan F  EXT-10 Vaultwarden mode (time-boxed)
Plan G  UAT records, owner batches, human checklist, REQUIREMENTS/ROADMAP/WINDOWS, full gate, push stop
```

### Pattern 1: Amend patch 050 with two appended sections (999.15/999.16)
**What:** `regenerate-patches.sh` regenerates each patch with `git diff HEAD -- <paths named in that patch>`; a path not already in a patch cannot be added by regeneration alone. Edit the two files in `upstream/`, `git -C upstream add` them, produce each section with the same pinned git invocation the script uses, append the sections to `patches/050-extension-tab-host.patch`, then require `scripts/regenerate-patches.sh --check` to PASS (byte equality proves no hand edit).
**When to use:** any hunk in a file no patch yet owns.
**Proposed hunks** (values verbatim from `ExtensionParent.sys.mjs:2515-2521` and `EnterprisePoliciesParent.sys.mjs:85,368-369`):
```js
// toolkit/components/extensions/ExtensionParent.sys.mjs  (ExtensionParent._resetStartupPromises)
ExtensionParent.browserPaintedPromise = Promise.race([
  promiseObserved("browser-delayed-startup-finished"),
  promiseObserved("extensions-late-startup"),
]).then(() => {});
// toolkit/components/enterprisepolicies/EnterprisePoliciesParent.sys.mjs
Services.obs.addObserver(this, "extensions-late-startup", true);   // in the constructor, beside "sessionstore-windows-restored"
// observe(): add  case "extensions-late-startup":  fall into the existing "sessionstore-windows-restored" arm
```
`_runPoliciesCallbacks` drains with `callbacks.shift()` (read at `EnterprisePoliciesParent.sys.mjs`, `while (callbacks.length)`), so a stock window later firing `sessionstore-windows-restored` runs nothing twice. The shell already sends `extensions-late-startup` once, from the `browser-idle-startup-tasks-finished` observer (`PowerBrowserAPI.sys.mjs:10864-10867`), so no shell change is needed.

### Pattern 2: Instrument-first diagnosis for C22/C23/C24
Wrap or probe from the harness (`inChrome`/`probe`), never from the product, so no product code carries diagnostics. One probe per hypothesis, run in a single live session, record the outputs in the plan SUMMARY, then fix.

### Anti-Patterns to Avoid
- **Runtime override of upstream members** to fake the startup topics (banned by the spike findings; also CLAUDE.md rule 2 in spirit).
- **Re-notifying `sessionstore-windows-restored` / `browser-delayed-startup-finished` from the shell**: 30+ observers assume a browser window subject.
- **Fixing a plant by loosening its `expect` string** (999.11 is exactly that class of defect): anchor to the failure the plant causes.
- **Giving a plan that edits `PowerBrowserAPI.sys.mjs` above the furniture section** without re-running `scripts/check-internals-boundary.sh --catalogue`; line numbers in INTERNAL-APIS.md shift (this is why `1642f2d7` was one commit).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Adding hunks to patch 050 | Hand-edited hunk bodies or hashes | Edit `upstream/`, git-generate the section, `regenerate-patches.sh --check` | A hand-edited hunk degrades `--3way` into a silent no-op |
| Guard coverage for new 050 hunks | A new sibling guard script | Rows in `verify-ext-tab-host-patch-guards.mjs` (GUARDS + WEAKEN + plants) | Its coverage phase derives hunks and fails any uncovered one |
| Real OS input | Synthesised BiDi keys for "real keyboard" rows | `ydotool` after a verified KWin raise | BiDi input is synthesised in the content process; chrome never sees it (`pointerOnto` doc comment) |
| Reading the real clipboard | `Services.clipboard.hasDataMatchingFlavors` alone | `wl-paste --list-types` plus `getData` | Separates compositor-visible flavours from Gecko's own view |
| Window screenshots | `spectacle -f` after a raise with no settle | `spectacle -a` after the shell is confirmed active | `-f` is "Capture the entire desktop (default)" per `spectacle --help` |
| UAT file parsing | Prose-style `34-UAT.md` | The template rows (`### N. Name` / `expected:` / `result:`) | `uat.complete-session` counts only rows under `## Tests` |
| New registry check | A `verify-phase-39.sh` | One appended row in `scripts/verify-platform.sh` | CLAUDE.md |

**Key insight:** every defect here already has a harness and a plant table; the discipline that matters is that each fix flips a named plant or scenario red-to-green, not that new infrastructure appears.

## Common Pitfalls

### Pitfall 1: `--help` is not honoured by three live scripts
**What goes wrong:** `node scripts/verify-ext-tab-host-live.mjs --help`, `verify-extension-actions-live.mjs --help` and `verify-extension-amo-live.mjs --help` launch real sessions (the amo one hit addons.mozilla.org and installed an extension into a throwaway profile). While researching, they ran and passed (`query`, `popup-action`, `amo-install`) and were reaped by the harness; the working tree and process list were unchanged afterwards. `verify-tab-strip-live.mjs --help` refused with "uncommitted changes".
**How to avoid:** never probe these with `--help`; read the header comment instead. Plans that need a scenario list read `SCENARIOS` in the source.

### Pitfall 2: Dirty tracked tree blocks `ng-a-live` harnesses
**What goes wrong:** `assertCleanTree()` (`scripts/lib/ng-a-live.mjs:60-69`) throws if `git status --short --untracked-files=no` is non-empty. Today `.claude/settings.json`, `.planning/STATE.md` and `.planning/state.json` are modified, so `verify-tab-strip-live.mjs` refuses.
**How to avoid:** commit planning edits with explicit paths before live runs, or set `PB_NG_ALLOW_DIRTY=1` only when the dirty files are `.planning/` records. Never set it with uncommitted product code (the check exists so a live run never tests uncommitted code).

### Pitfall 3: The 050 build stamp
**What goes wrong:** every live script compares `sha256sum patches/050-extension-tab-host.patch` with `objdir/.pb-050-build.sha256` (`verify-page-tools-live.mjs:268-272`: "BROKEN INSTRUMENT ... rebuild 050 first"); `verify-ext-tab-host-live.mjs` also checks the 060 stamp. After amending 050 every live run is red until the stamp is rewritten.
**How to avoid:** after the symlink check (Pattern, Code Examples) rewrite the stamp: `sha256sum patches/050-extension-tab-host.patch > objdir/.pb-050-build.sha256`. `objdir/` is untracked, so this is an environment step to record in the SUMMARY.

### Pitfall 4: Edits near the top of `PowerBrowserAPI.sys.mjs`
**What goes wrong:** INTERNAL-APIS.md rows carry `PowerBrowserAPI.sys.mjs:N` line numbers; an insertion above them breaks `check-internals-boundary.sh --catalogue`.
**How to avoid:** keep C22/C23/C24 changes inside the furniture section at end of file (its own header says it sits there "so nothing above the last catalogued internals line moves"), and re-run `--catalogue` after each edit. Stage new files before the brand scan.

### Pitfall 5: Real input into the wrong window
**What goes wrong:** `ydotool` types into whatever has focus. The desktop is Chris's live KDE session.
**How to avoid:** raise the shell, then read back the active window's `resourceClass` through a second KWin script and abort unless it contains `powerbrowser`; send keys only then; keep each injected sequence short and idempotent. [ASSUMED: a KWin script can report the active window to the caller; verify in Wave 0]

### Pitfall 6: `prompts-live` default run contains scenarios that cannot pass
**What goes wrong:** `main()` runs `Object.keys(SCENARIOS)` when no `--scenario` is given (`verify-prompts-live.mjs:1591`), which includes `dialog-probe` (writes the verdict only when named explicitly; otherwise measures stock-blocks-ide) and `dialog` (fails: "IDE push traffic stopped while dialog open"). The `prompts-live` and `prompts-live-self-test` registry rows therefore cannot be green while PROMPT-03 is deferred, and `--gate` only excuses a failing label that is in `GATE_KNOWN_OPEN_EXCLUSIONS` keyed to an open WINDOWS ledger id.
**How to avoid:** Open Question 1. Run the full baseline first so the list of non-fixable reds is known before planning promises "green".

### Pitfall 7: A stale `--3way` replay hides a no-op
**What goes wrong:** applying an amended 050 over an already-patched `upstream/` can leave the tree unchanged while reporting success.
**How to avoid:** `scripts/apply-patches.sh` prints `... applied and verified non-vacuous`; `git -C upstream diff --cached --stat` must list the two new files; `regenerate-patches.sh --check` must PASS.

### Pitfall 8: UAT rows that "pass" a live half but still need a human half
**What goes wrong:** 34-UAT rows 3-12 each carry "Live ... PASS" plus a by-hand remainder; collapsing them to `result: pass` loses the remainder, leaving it `[pending]` re-hides the live pass.
**How to avoid:** record `result: pass` with `evidence:` for the live half and add the by-hand remainder as its own row (or keep `[pending]` with a `live:` line, the form 35-UAT uses). Never tick a requirement whose human or owner row is still open (PAGE-06 stays Pending until Downloads is seen).

## Code Examples

### The symlink check that replaces the 50-minute rebuild
```bash
# Source: read 2026-11-05 from objdir/dist/bin/modules (ls -la)
readlink objdir/dist/bin/modules/ExtensionParent.sys.mjs
#   -> /home/chris/coding/Power-Browser/upstream/toolkit/components/extensions/ExtensionParent.sys.mjs
readlink objdir/dist/bin/modules/EnterprisePoliciesParent.sys.mjs
#   -> /home/chris/coding/Power-Browser/upstream/toolkit/components/enterprisepolicies/EnterprisePoliciesParent.sys.mjs
# Both resolve into upstream/, so a patched file is live after -purgecaches. Existing 050 files agree:
#   objdir/dist/bin/browser/chrome/browser/content/browser/parent/ext-tabs.js -> upstream/browser/components/extensions/parent/ext-tabs.js
# Fallback only if a readlink does not resolve into upstream/: nix develop .#firefox --command bash -c 'cd upstream && MOZCONFIG=../.mozconfig ./mach build'
```

### 999.14: kwinShot with a real raise and a window capture
Current (`scripts/verify-prompts-live.mjs:779`): `execFileSync('spectacle', ['-b', '-n', '-f', '-o', out], { timeout: 20000 })`. `spectacle --help`: "-f, --fullscreen Capture the entire desktop (default)", "-a, --activewindow Capture the active window". The raise script (`workspace.activeWindow = w` for every window whose `resourceClass` includes `powerbrowser`) runs async, then spectacle starts at once. Fix shape: select the shell window only (caption or the one that is not a stock/dialog window), raise it, poll until the active window is the shell, then `spectacle -b -n -a -o out`. Add a self-test plant that makes the raise a no-op and expects the capture to be refused.

### 999.11: anchor the opener-null plant
`scripts/verify-new-window-adopt-live.mjs:760` has `{ plant: 'opener-null', target: 'adopt-opener', run: ['adopt-opener'], expect: 'opener' }`. Five failure strings in `adoptOpener` contain the word "opener" (`:416`, `:419`, `:423`, `:433`, `:436`). The plant's own failure is `` `the adopted tab's window.opener is null (${adopted.tabId})` `` (`:423`). Set `expect` to `window.opener is null`.

### C11: ignore a stale dismissal
`page-context-menu.ts` `pick()` sends then runs `.then(reply => this.settle(widget, tabId, menuId, itemId, reply)).catch(() => { ... widget.focusPage(); })`, and `settle` ends with `widget.focusPage();`. Fix shape: record the latest opened `menuId` on the contribution; in `settle` and the catch, skip `widget.focusPage()` when `menuId` is no longer the latest. Then delete the `focusTheiaFrame(app)` call in `closeMenu` (`verify-page-furniture-live.mjs:672-681`, whose comment names this race) and add a plant `stale-dismiss-focus` that restores the unconditional call and must go red on a second menu opened inside the first dismissal's round trip.

### 999.5: add the no-interaction leg
`threeStepTab` calls `interactWith(app, tabId)` before each navigation (`verify-nav-keys-live.mjs:567-572, 580-583`), so Back can never expose an AB-4-style regression (`1642f2d7`: "webTabNavigate marks the session-history entry it leaves as user-interacted"). Add a scenario that navigates through the pill/`webTabNavigate` path with no `interactWith`, asserts Back is enabled and returns, with a plant that skips the marking.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Shell as a non-stock window gets no startup topics | Shell sends `browser-idle-startup-tasks-finished` and, from it, `extensions-late-startup` | v1.5 live pass `1642f2d7` | `browserStartupPromise` resolves; `browserPaintedPromise` and policies still wait for a stock window (999.15/16) |
| Compile after any patch | Dev builds symlink JS modules into `objdir/dist/bin` | always (BUILD.md "Tier 1 - no build") | 050 JS hunks need no compile; only compiled files do |

**Deprecated/outdated:** `v1.5-LIVE-PASS.md` still says apply-patches prints "all 7 patches applied"; `patches/` holds 8 files (010, 020, 030, 040, 045, 050, 055, 060). Re-read the printed count rather than trusting the doc.

## Findings per fix family

### C22 title= tooltip never opens (999.7)
Chain, read from upstream: content `ChromeTooltipListener::MouseMove` (`docshell/base/nsDocShellTreeOwner.cpp:1120-1180`) needs pref `browser.chrome.toolbar_tips` (default true), a real mouse move (same client point is ignored), then a one-shot timer of `ui.tooltip.delay_ms` (default 500). `sTooltipCallback` returns silently unless `docShell->GetBrowsingContext()->IsActive()`. It then calls `BrowserParent::RecvShowTooltip` (`dom/ipc/BrowserParent.cpp:2532-2555`), which calls `XULBrowserWindow.showTooltip(x, y, text, direction, el)`.

The product `showTooltip` (`PowerBrowserAPI.sys.mjs:8262-8273`) is upstream's (`browser.js:2016-2038`) plus one extra guard, `tabIdOfBrowser(browser) === null`, and the `hasFocus()` guard. Link status (same XULBrowserWindow) works, so registration is fine. Ranked hypotheses:
1. `showTooltip` is never called: the content timer is cancelled or `IsActive()` is false at fire time (overlay `docShellIsActive` is written `!!visible` at `PowerBrowserAPI.sys.mjs:4181`). Probe: wrap `window.XULBrowserWindow.showTooltip` with a counter from the harness, and read `overlay.browsingContext.isActive` when the pointer is on `#tip`.
2. `showTooltip` returns at `document.hasFocus()` (the harness focuses the window once, early; Theia frames can steal it later) or at the product's own `tabIdOfBrowser` guard. Probe: log which guard returns.
3. `openPopupAtScreen` opens then closes (state read after 3 s while a later `mousemove` or `hideTooltip` closed it). Probe: poll `remoteBrowserTooltip.state` every 50 ms for 3 s.
4. The harness synthesises one `mousemove` (`pointerOnto`), while a real tooltip needs the pointer to rest after at least one earlier move over the document. Probe: two moves 20 px apart on `#tip`, then wait 700 ms.
Fix site is `installTooltipsAndLinkStatus` (furniture section). Confidence in root cause: LOW; confidence in the probe list: MEDIUM.

### C23 saved login shows no popup (999.8)
Facts from the UAT: the popup element exists, field and document are focused, LoginManager is in the browsers group, console is clean, form-history autocomplete passes. Upstream `LoginManagerChild.#onUsernameFocus` (`toolkit/components/passwordmgr/LoginManagerChild.sys.mjs:698-740`) calls `gFormFillService.showPopup()` unless the field is not a text field, `hasBeenTypePassword`, `readOnly`, `#isLoginAlreadyFilled`, within the right-click window, so the harness's `signon.autofillForms=false` setup matters. The shell's `PopupAutoComplete` (`powerbrowser.xhtml:190`) is identical to stock `main-popupset.inc.xhtml:175-185`, so the popup element is not the difference; login results come from a different search than form history. Ranked hypotheses:
1. The focus handler never ran or bailed: turn on `signon.debug` and read the log lines "Login already filled." / "Opening the autocomplete popup." (these strings are in the source above).
2. `showPopup` ran but the login search returned nothing: log `AutoCompleteParent` open and the `PasswordManager:autoCompleteLogins` reply from the parent (probe by wrapping the actor method from the harness).
3. A parent-side dependency on a missing window global in `LoginManagerParent`/`LoginAutoComplete` (the shell has a derived-member gate for the `gBrowser` stand-in only). Probe: catch the rejection of the parent query.
4. The saved login's origin does not match the served page's origin string. The harness builds both from the same `new URL(...).origin`, so low prior.
Fix site is unknown until a probe lands. Confidence: LOW.

### C24 Copy Image leaves only text/html (999.9)
Stock path: `browser-context.js:143` runs `goDoCommand("cmd_copyImage")`; `nsClipboardImageCommands::DoClipboardCommand` defaults to `COPY_IMAGE_DATA | COPY_IMAGE_HTML` (`dom/base/nsGlobalWindowCommands.cpp`), enabled only when `aEdit->GetInImage()`, and the command node is set by `ContextMenuChild.sys.mjs:692` (`setCommandNode(aEvent.composedTarget)`). The product runs the same command through the Controllers actor (`pageMenuEdit`, `PowerBrowserAPI.sys.mjs:8977-8984`), which only runs it when `docShell.isCommandEnabled` (`ControllersChild.sys.mjs`). The harness assertion is `hasDataMatchingFlavors(['image/png'], kGlobalClipboard)` (`verify-page-furniture-live.mjs`, `menuEdit`). Gecko writes the image as the native image flavour; GTK exposes png targets natively. So the failure may be the instrument. Bisect (cheap, decisive):
1. After the Copy Image pick, run `wl-paste --list-types` outside Gecko. If it lists `image/png`, the product works and the harness check is wrong (read via `wl-paste` or `getData` on the native flavour and add a plant).
2. If it does not, read `docShell.isCommandEnabled('cmd_copyImage')` on the right-clicked frame from chrome and whether the `<img>` finished decoding when the row ran.
Confidence in root cause: LOW; the bisect cleanly separates "environment or instrument" from "product".

### C11 / 999.10 dismissal race
Located (above, Code Examples). Product race: `settle()` and the `.catch` call `widget.focusPage()` after the send round trip, with no check that a newer menu opened. `focusPage()` only sets `focusWanted` and publishes (`web-tab.ts:1286-1289`), so the late call lands on whichever menu is open. HIGH confidence in the mechanism (read), MEDIUM that this is the only cause.

### 999.15 / 999.16 (patch 050)
Verified: `ExtensionParent.sys.mjs:2515-2521` defines `browserPaintedPromise` on `browser-delayed-startup-finished` only, and `browserStartupPromise` as a race of `sessionstore-windows-restored` and `extensions-late-startup`. `ext-backgroundPage.js:991` awaits `ExtensionParent.browserPaintedPromise` before an event-woken page starts; `search-detection/extension/api.js:63` does too. `EnterprisePoliciesParent.sys.mjs:85` registers the `sessionstore-windows-restored` observer and `:368-369` runs `onAllWindowsRestored`. Shipped policies (`powerbrowser/distribution/policies.json`): `DisableTelemetry`, `DisableFirefoxStudies`, `Preferences`, `ExtensionSettings`, `SearchEngines`. Of those only `SearchEngines` has an `onAllWindowsRestored` callback (`Policies.sys.mjs:3080`: `Remove`, and `Default`), so in a shell-only session the shipped default engine and removals are not applied. This is a user-visible BAR-04 consequence, not only a test inconvenience.
New work: (a) two appended 050 sections; (b) GUARDS rows G14/G15 with WEAKEN entries, a removed-guard, weakened and misplaced plant each, and the BUILD.md 050 bullet text updated; (c) live scenarios: an event-page fixture with persisted `webRequest` listener and no `runtime.onStartup` (the `content` fixture's `onStartup` listener is the documented workaround, `pb-extension-fixtures.mjs:79-81`), relaunched with zero stock windows and woken by an overlay request; a policy scenario that sets a `SearchEngines.Default` different from the app default and asserts `Services.search.defaultEngine.name` with no stock window; (d) a live plant that re-arms the old condition without un-applying the patch: call `ExtensionParent._resetStartupPromises()` after startup (the file says it is test-only) so the promises wait for topics that never re-fire [ASSUMED to behave as described]; (e) re-stamp. Review `address-bar-live`'s AB-1 workaround (`verify-address-bar-live.mjs:522-529`, it pre-records the policy Default as applied): it should stay harmless but must be re-run.

### 999.4 / 999.5 / 999.6 / 999.11 / 999.13 / 999.14 (harness)
- 999.4: the failing line is `focusOverlay(...) !== true` inside `bookmarksToolbar` (`verify-address-bar-live.mjs:5265`; `focusOverlay` returns false if `overlayVisibility` is not `visible` within 5 s, `pb-live-probe.mjs:199-206`). In `SCENARIOS` order the scenario immediately before is `bookmark-editor`. Plan: bisect by running each earlier scenario plus `bookmarks-toolbar` and reading `overlayVisibility` and the occlusion reasons at the failure; fix the leaking scenario's teardown.
- 999.5: see Code Examples.
- 999.6: `modeTokens` `fromEmpty()` sets `inputValue=''` through `probe` then types; the typing errors are swallowed (`catch { // The text was kept as typed }`), so a refresh from the previous step can land mid-typing. Reproduce with a 20-iteration loop of `--scenario search,mode-tokens`, trace `modeState` and `inputValue` per step, then settle on an empty pill and default mode before typing.
- 999.11: see Code Examples.
- 999.13: the four prompts plants (`queue-shown-early`, `activation-wrong-tab` at `verify-prompts-live.mjs:415-431`; `camera-template-missing` at `:650`; `allow-loads-frame-url` at `:1202`) must reach their own failure: for the first two, make the plant actually show the queued panel (check `state.inPanel` flips); for the camera plant, remove the template before the device menulist is populated and expect the template message first; for `allow-loads-frame-url`, run it where `adopt-next-to-opener` is not tripped first.
- 999.14: see Code Examples.

### 999.12 screen share
`media.webrtc.capture.allow-pipewire` exists, default true, GTK only (`StaticPrefList.yaml:13681-13684`). The portal chooser is KDE's `xdg-desktop-portal` UI. Route for the harness: set the pref false and run the session with `MOZ_ENABLE_WAYLAND=0 GDK_BACKEND=x11` (XWayland); `firefox-bidi.mjs` passes `process.env` through (`:394-396`), so env can be set per run. The stock doorhanger then lists real windows or screens (the harness already picks "the first real window or screen", `verify-prompts-live.mjs:574`). [ASSUMED: X11 capture goes live under XWayland on this host; verify in Wave 0.] The genuine portal click stays on Chris's checklist as one row; the harness row proves the Gecko-side sharing state, push and indicator.

### 34-UAT.md rewrite (so `uat.complete-session` parses it)
`completeUatSession` (`~/.claude/gsd-core/bin/lib/uat.cjs:503-570`) reads only the `## Tests` section (`collectSection(... /^tests$/i, levelBounded)`), counts `### N. Name` rows with `result:` lines, and sets `partial` when any row is `[pending]`, `blocked`, or `skipped` without `reason:`. The current 34-UAT.md has no `## Tests` section (its `### N.` rows sit under `## Owner decisions`, `## Live checks`, `## Live-pass risks`, `## Judgment items`) and uses `**Test:**` prose with no `result:` lines, so the parser sees zero rows and would compute `complete` wrongly. Required changes: frontmatter `status`, `phase`, `source:` list, `started`, `updated`; a `## Current Test` section; one `## Tests` section holding all 15 rows as `### N. Name` with `expected:` and `result:` (`pass` + `evidence:`, `[pending]`, or `skipped` + `reason:`); `## Summary` counts; `## Gaps`. Model it on 33-UAT.md.

### 32-UAT "page-tools PASS from the 2026-11-04 sweep"
No record of that sweep exists in the repo (searched `.planning` for page-tools results dated 2026-11-04: only the roadmap/CONTEXT sentence and phase 32/34/35 planning files). Re-run `node scripts/verify-page-tools-live.mjs` (22 listed scenario names; the doc says 16 scored) and its `--self-test` and record the output, rather than copying an unsourced claim.

## Per-phase UAT classification

Classes: **A** live harness (Claude runs; name below) | **B** screenshot + DOM measure by Claude | **C** owner decision (AskUserQuestion) | **D** human only (eye, portal click, real person). A visual row is D for the verdict, with Claude attaching the capture and measurements. Counts are of rows still not `pass`.

| Phase | Not-pass rows | A | C | D | Notes |
|-------|---------------|---|---|---|-------|
| 27 | 7 (T1-T6, T8; T7 resolved) | T1, T2, T3, T4 (via `verify-nav-keys-live` scenarios `page-keys`, `tab-keys`, `focus-keys`, `mouse-buttons`, `long-press`, plus ydotool for the real-input half) | T8 | T5 (look), T6 (cross-app drag) | `verify-nav-keys-live.mjs` scenario names read from its usage line |
| 31.1 | 2 (T2, T3) | none | T2, T3 | none | T3: `OVERLAY_LOCATION` (`PowerBrowserAPI.sys.mjs:6781`) replaces any non-http(s) location, which per the UAT includes `about:neterror`, with `about:blank` |
| 32 | 11 | T1 (crash scenarios), T4 (`devtools`), T6 (`find`), T7 (print dialog capture), T8 (launch without harness `LD_LIBRARY_PATH`, read `pactl` sink inputs) | T9, T10, T11 (+ T3 scope, T8 PAGE-05 packaging) | T2, T3, T5 (Open / Show in folder, OS handler) | T11 is already delivered by 33-05 (PAGE-09 is ticked) |
| 33 | 2 (T6, T7) | T6 (new `edit`-greying row in `verify-page-tools-live.mjs`) | part of T7 (300 ms vs 200 ms delay, copy strings, Settings command) | T7 visuals | |
| 34 | 15 rows, 0 recorded | `menu`, `reorder`, `middle`, `double`, `drop`, `overflow`, `pin-restore`, `multi`, `preview`, `attention`, `bookmark-all`, `modes` already PASS on 2026-11-04; T13 (keyboard menu) and the by-hand remainders of T4, T6, T7, T8 | T1, T2, T15 | T14 + screenshots | needs a clean tracked tree |
| 35 | 12 pending + 5 skipped | skipped T1, T2, T6, T8, T9 become A after C22-C24; T16-T20 need new scenarios | T21, T22 | T4 (still under a notification bar), T12-T15 | |
| 36 | 8 | T5 (ydotool middle-click), T12-T16 (new/extended `verify-new-window-adopt-live` scenarios) | T18 | T17 | |
| 37 | 23 pending + 5 skipped | T6 (X11 route), T17 after 999.13, T18-T27 (new scenarios), T33 after 999.14 | T34-T41 (T34 already decided 2026-11-03) | T28-T32 | T8, T9 stay skipped: PROMPT-03 is 999.3, outside this phase |
| 38 | 23 | T22 (fresh-profile leg), T23 (ydotool), T24 (`verify-endpoints.sh`, network), T25-T30 (new scenarios), T31 (Vaultwarden, decided option b) | T32-T40 | T18-T21 | |

Totals (approximate, because 33, 34 and 37 mix classes inside a row): about 52 A, about 30 C, about 24 D, plus 10 skipped rows that the fixes unblock. Phases 29, 30 and 31 also carry `verification_deferred_human` rows in STATE.md but have no UAT file and are not in the Phase 39 scope as written (Open Question 3).

### Owner-decision rows with a one-line recommendation (for per-phase AskUserQuestion batches)

| Row | Question | Recommendation |
|-----|----------|----------------|
| 27 T8 | Confirm the 14 judgment-tier prohibition verdicts | Accept all; any the live pass contradicts is reopened |
| 31.1 T2 | Accept that page focus on tab A moves Theia's current widget to A | Accept (documented deviation 6) |
| 31.1 T3 | Error pages replaced by `about:blank` in an overlay | Treat as a defect: keep error pages visible via a narrow allow-list in the forwarder (small, shell JS, with a plant); [ASSUMED neterror is caught, per the UAT text] |
| 32 T9 / T10 | Judgment verdicts; two verifier overrides | Accept both overrides; accept verdicts |
| 32 T11 | PAGE-09 owner | Close: delivered by 33-05, PAGE-09 already ticked |
| 32 T3 / T8 | Dock tab bar favicon scope; libpulse in release packaging | Keep dock-bar scope as is and log a backlog row; keep PAGE-05 standing and log the packaging follow-up |
| 33 T7 | 300 ms submenu delay vs 200 ms; Edit placement; Settings command; copy strings | Accept the shipped values and amend 33-UI-SPEC |
| 34 T1 | Double-click strip vs window-drag handles | Keep both if the live native-drag check passes, else carve the strip out of the handles |
| 34 T2 | Strip hidden in Coding and Organising (D-02) | Accept current behaviour (hidden outside Browsing) |
| 34 T15 | Judgment items; IN-01..IN-12 | Accept; log IN items as follow-ups |
| 35 T21 | Edit submenu fallback while the hamburger holds focus | Accept and record the limitation |
| 35 T22 | First stale pick gives no message | Accept |
| 36 T18 | CLAUDE.md rule 5 wording | Accept the replacement text in 36-02-SUMMARY Deferred item 1; edit only after Chris's approving answer |
| 37 T34 | 37-03 gate | Mark resolved: decided 2026-11-03 (defer PROMPT-03 to 999.3) |
| 37 T35 | Sharing indicator opens site panel | Accept as follow-up |
| 37 T36 and 38 T37 | `getTabSharingState` reports no sharing | One decision for both: accept as follow-up |
| 37 T37 | Protocol-handler persistent write from a bar button | Confirm intended |
| 37 T38 | Two bar copy rows differ from the spec | Accept the shipped copy; amend 37-UI-SPEC |
| 37 T39 | Judgment and backstop prohibitions | Accept; keep the two backstops on the human checklist |
| 37 T40 | Site-panel writer vs "answered only through Firefox's own buttons" | Satisfies it (cannot answer a pending prompt; origin echo checked) |
| 37 T41 and 38 T38 | Info findings IN-01..IN-04 / IN-01..IN-08 | Accept all as follow-ups |
| 38 T31 | EXT-10 fill | Already decided (b); build the Vaultwarden mode |
| 38 T32 | Page-action icon placement | Keep the leading slot with pill-text shift (38-03's recommendation); log the trailing-slot move |
| 38 T33 | AMO install from a web tab gives no prompt | Defer to the bridge milestone (38-05) |
| 38 T34 | `tabs.create` of an extension page with no stock window | Accept the rejection |
| 38 T35 | Extension-initiated sidebar/popup open not routed | Accept |
| 38 T36 | Containers refused | Accept the refusal |
| 38 T39 | Principal mismatch for private-allowed extensions | Accept |
| 38 T40 | Install footer only in the empty state | Accept |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `ydotool` injected input reaches the raised PowerBrowser window and can be gated by reading the active window back from KWin | Pitfall 5, class A for 27/36/38 | Real-input rows revert to human-only (+about 8 rows on Chris's checklist) |
| A2 | With `media.webrtc.capture.allow-pipewire=false` under XWayland the stock doorhanger lists a screen and the track goes live | 999.12 | 37 T6 stays portal-click human-only |
| A3 | `ExtensionParent._resetStartupPromises()` after startup re-creates a never-resolving `browserPaintedPromise`, usable as a live plant | 999.15 | The live plant needs another construction; the static guard plants still cover the patch |
| A4 | Overlay error locations arrive as `about:neterror...` and fail `OVERLAY_LOCATION` | 31.1 T3 | The recommendation changes to "accept as intended" |
| A5 | The Bitwarden extension accepts a `http://127.0.0.1:<port>` self-hosted server URL and a harness can register an account on Vaultwarden (via the web vault page or direct API with client-side crypto) | Plan F | EXT-10 fill cannot be automated; falls to scope item 7 documentation |
| A6 | Adding vaultwarden to a dev shell or running it via `nix run` is acceptable | Open Question 6 | Plan F blocked on an owner call |
| A7 | A JS-only 050 change needs no `./mach build` beyond the re-stamp | Pitfall 3 | A 23-50 minute rebuild returns to the plan |
| A8 | `--gate` full run time is acceptable in one autonomous session | Validation | Unknown: no timing was measured; run the baseline in the background with logs |
| A9 | Shipping policies apply `SearchEngines.Default`/`Remove` correctly once `onAllWindowsRestored` fires on `extensions-late-startup` | 999.16 | The policy scenario goes red for a reason other than the patch |

## Open Questions

1. **How is `prompts-live` made green while PROMPT-03 (999.3) stays deferred?**
   - Known: default run includes `dialog-probe`, `dialog` and `sharing`; the first two fail by design; `--gate` exclusions require an open WINDOWS ledger id.
   - Unclear: whether Chris accepts a scenario-level, derived skip (same idea as rule (p) in `verify-permission-prompts.mjs`), a `GATE_KNOWN_OPEN_EXCLUSIONS` entry keyed to a new ledger row, or pulling PROMPT-03 into this phase.
   - Recommendation: derived skip printed as `SKIPPED (PROMPT-03 deferred, 999.3)` plus a ledger row; put it in the first AskUserQuestion batch, because it decides the meaning of "green".
2. **Which rows will the baseline run show red besides the listed 16?** Unknown until run. Recommendation: Wave 0 full `verify-platform.sh` in the background, per-row logs, before Plans A-D.
3. **Are phases 29, 30, 31 in scope for the live pass?** STATE.md lists them as `verification_deferred_human` with VERIFICATION.md files and no UAT; the roadmap scope names 27, 31.1, 32-38. Recommendation: generate their UAT files from VERIFICATION.md and include their rows in the same classification, or state the exclusion in the human checklist.
4. **Do C22-C24 turn out to be harness or environment defects, not product?** C24 especially. Recommendation: the bisect steps first; if the product is correct, fix the instrument and record the evidence, which still satisfies "fixed".
5. **REQUIREMENTS/ROADMAP ticking rule.** Recommendation: tick a row only when its live half passed and no human or owner row for it is open; update both the checkbox and the traceability table `Status` column (REQUIREMENTS.md lines ~277-291); fix the stale ROADMAP progress table rows for 27, 29, 30, 31, 32 and the unticked phase boxes.
6. **Vaultwarden hosting and the 127.0.0.1 egress rule.** Needs `DISABLE_ICON_DOWNLOAD`-style settings so the server makes no outbound calls, and a decision on dev-shell addition vs `nix run`. Recommendation: `nix run`, no repo dependency change, time-boxed to one plan.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `objdir/dist/bin/powerbrowser` | every live row | yes | built 2026-11-03 19:32 | `./mach build` (23-54 min) |
| `upstream/` patched, 153.5.1 | patch work | yes | `FIREFOX_153_5_1esr_BUILD1`, 31 staged files | `rm -rf upstream && fetch-upstream.sh && apply-patches.sh` |
| 050/060 build stamps | all live scripts | yes, both match patches | sha256 `0f40d203...` / `3c637bd1...` | rewrite stamps |
| node | harnesses | yes | v24.19.0 | none |
| Wayland session, KWin, `qdbus`, `spectacle` | 999.14, screenshots | yes | session wayland-0, `DISPLAY=:0` | none; sandbox must be off for session DBus |
| `ydotool` + running `ydotoold`, `/dev/uinput` ACL for chris | real input | yes | 1.0.4; socket `/run/ydotoold/socket` group `ydotool` | human checklist |
| `wl-paste`, `wl-copy` | C24 bisect | yes | n/a | none needed |
| `xvfb-run` | headless display rows | yes (`Xvfb` binary itself missing; `verify-platform.sh` resolves it with `nix build nixpkgs#xorg.xvfb`) | n/a | real display |
| `vaultwarden` | EXT-10 | not installed; in nixpkgs | 1.37.5 | `podman` 5.8.9 image; or document |
| `xclip`, `xdotool`, `wtype`, `dotool` | n/a | missing | n/a | `wl-clipboard`, `ydotool` cover the need |
| `gsd-browser` | 34 sidecar measure | MCP tool, not on PATH | n/a | `browser_eval` via MCP |
| Network to addons.mozilla.org | 38 T24, T31 | yes today (`amo-install` PASS) | n/a | skip with a documented reason |

**Missing dependencies with no fallback:** none for the plan as a whole.
**Missing dependencies with fallback:** vaultwarden (install on demand).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | In-repo node live harnesses (WebDriver BiDi against the built binary) with `--self-test` plant tables, plus registry rows in `scripts/verify-platform.sh` |
| Config file | none; scenarios and plants are tables inside each `scripts/verify-*-live.mjs` |
| Quick run command | `scripts/verify-platform.sh --quick` (no build, no browser, no display; run inside `nix develop .#theia`) |
| Full suite command | `scripts/verify-platform.sh`, then `scripts/verify-platform.sh --gate` |
| Per-row command | `scripts/verify-platform.sh --only <label>`; harness-level `node scripts/verify-<x>-live.mjs --scenario a,b` |

### Phase Requirements to Test Map
| Fix family | Behaviour | Check that proves it | Needs |
|------------|-----------|---------------------|-------|
| C22 tooltip | `title=` tooltip opens with the page text; IDE hover silent | `page-furniture-live` scenarios `tooltip-status`, `theia-hover-silent`; plants `tooltip-element-removed`, `theia-tooltip-leak` already exist; add a plant for the root cause found | display + built binary, no human |
| C23 saved login | popup lists the saved login; Down+Enter fills both fields | `page-furniture-live` scenario `saved-login`; add a plant that re-creates the root cause | display + binary |
| C24 Copy Image | image flavour on the clipboard | `page-furniture-live` scenario `menu-edit` (plant `copy-row-unwired` exists) with the corrected or confirmed assertion and a `wl-paste --list-types` leg | display + binary + Wayland clipboard |
| C11 dismissal | second menu opened inside the first dismissal keeps focus; no Theia-frame pre-focus needed | `page-furniture-live` scenario `context-menu` with the `closeMenu` workaround removed; new plant `stale-dismiss-focus` | display + binary + Theia `yarn build` |
| 999.15 event-page wake | event page starts with zero stock windows | new scenario in `verify-extension-actions-live.mjs` (fixture without `onStartup`), plus live plant (A3); static: `ext-tab-host-patch-guards` rows G14 + plants; `regenerate-patches.sh --check` | display + binary + re-stamp (no compile) |
| 999.16 policies | `SearchEngines.Default` applied with no stock window | new scenario (address-bar or actions harness); static guard row G15; `address-bar-live` re-run (AB-1 interaction) | display + binary |
| 999.4 | `bookmarks-toolbar` green in a full address-bar run | `address-bar-live` full run (3 consecutive) | display + binary |
| 999.5 | Back reachable after a no-interaction pill navigation | new `nav-keys-live` scenario plus plant that skips the interaction marking | display + binary |
| 999.6 | `*x` token never flakes | 20x loop of `--scenario search,mode-tokens` (a loop, not a one-off) | display + binary |
| 999.11 | opener-null plant names its own failure | `new-window-adopt-live --self-test`; static check that no two plants share an `expect` prefix | display + binary |
| 999.12 | screen share granted, push and indicator | `prompts-live --scenario sharing` with the X11 route; portal click on the human checklist | display + binary; portal part human |
| 999.13 | the four plants go red naming their own failure | `prompts-live --self-test` (live half) | display + binary |
| 999.14 | PNG shows the shell window | file-dimension and active-window assertion in `kwinShot`, plant that disables the raise | Wayland session, sandbox off |
| UAT records | 34-UAT parses; counts match | `gsd-tools query uat.complete-session <file>` on a copy, then real | none (text) |
| Bookkeeping | REQUIREMENTS/ROADMAP/WINDOWS consistent | `scripts/verify-platform.sh --quick` (includes docs and ledger rows); `node scripts/scan-brand-residue.mjs` | none |
| Gate | whole registry green | `scripts/verify-platform.sh` and `--gate` | display + binary + (Open Question 1) |

### Sampling Rate
- **Per task commit:** `scripts/verify-platform.sh --quick` plus the one `--only` row or `node ... --scenario` the task touches.
- **Per wave merge:** the affected live suites in full with `--self-test`, then `--quick`.
- **Phase gate:** full `scripts/verify-platform.sh` and `--gate` green before `/gsd-verify-work`; the human checklist handed over at the stop point.

### Wave 0 Gaps
- [ ] A clean tracked tree (commit `.planning/STATE.md`, `.planning/state.json` and settle `.claude/settings.json` with explicit paths) or `PB_NG_ALLOW_DIRTY=1` for planning-only dirt.
- [ ] Full baseline run of `scripts/verify-platform.sh` with per-row logs (Open Question 2).
- [ ] Probe the three assumptions that decide classification: A1 (ydotool + KWin active-window read-back), A2 (X11 screen capture), A7 (JS-only 050 needs no compile).
- [ ] `34-UAT.md` rewritten to template shape before any 34 result is recorded.
- [ ] Tooling for the C22/C23/C24 instrumentation probes in a scratch harness (not in product code).
- [ ] Framework install: none.

## Security Domain

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no (no auth surface changed; credentials are test fixtures) | n/a |
| V3 Session Management | no | token gate unchanged |
| V4 Access Control | yes (extension tab host guards, policies) | patch-050 guards with plants; policies now apply at shell start |
| V5 Input Validation | yes (page `title` into tooltip label, login data in popup, clipboard) | set text via `.label`, never markup; credentials never logged (T-35-21); stock Gecko paths |
| V6 Cryptography | no (Vaultwarden fixture only; never hand-roll vault crypto beyond the extension's own) | n/a |
| V14 Configuration | yes (policies, prefs) | shipped `policies.json` applies via the stock manager |

### Known Threat Patterns
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Page-controlled text in the tooltip | Spoofing/Tampering | `tooltip.label = text` (text node), stock placement and clamp; no `title` added to chrome-bar buttons |
| Credential disclosure through diagnostics | Information disclosure | Instrument from the harness only, print booleans and counts, never the password; `signon.debug` output must not be committed |
| Shell input injection (`ydotool`) into the wrong app | Tampering (local) | Verified active-window gate before every send; short idempotent sequences |
| Hidden policy gap (shipped policies unapplied in shell-only sessions) | Elevation/Config drift | 999.16 patch plus a live scenario; record the pre-fix exposure in the SUMMARY |
| Local Vaultwarden exposure | Information disclosure | Bind 127.0.0.1 only, throwaway data dir, no outbound calls, never commit the master password |
| Patch hunk silently no-op | Tampering | `regenerate-patches.sh --check`, non-vacuous apply message, guard plants |

## Sources

### Primary (HIGH confidence, read this session)
- `.planning/phases/{27,31.1,32,33,34,35,36,37,38}-*/*-UAT.md`, `.planning/ROADMAP.md` (Phase 39 and Backlog 999.1-999.16), `.planning/v1.5-LIVE-PASS.md`, `.planning/STATE.md`, `.planning/WINDOWS.md`, `.planning/GUI-DEFECTS.md`, `.planning/REQUIREMENTS.md`
- `scripts/verify-page-furniture-live.mjs`, `verify-address-bar-live.mjs`, `verify-nav-keys-live.mjs`, `verify-prompts-live.mjs`, `verify-new-window-adopt-live.mjs`, `scripts/lib/{ng-a-live,pb-live-probe,pb-extension-fixtures,firefox-bidi}.mjs`, `scripts/regenerate-patches.sh`, `scripts/check-patch-surface.sh`, `scripts/verify-ext-tab-host-patch-guards.mjs`, `scripts/verify-platform.sh` (gate mode, registry)
- `powerbrowser/shell/PowerBrowserAPI.sys.mjs` (tooltip, page menu, startup, overlay locations), `powerbrowser/shell/powerbrowser.xhtml`, `theia/extensions/chrome-bar/src/browser/page-context-menu.ts`, `theia/extensions/tab-uris/src/browser/web-tab.ts`
- Upstream at 153.5.1: `docshell/base/nsDocShellTreeOwner.cpp`, `dom/ipc/BrowserParent.cpp`, `browser/base/content/browser.js`, `browser/base/content/browser-context.js`, `dom/base/nsGlobalWindowCommands.cpp`, `browser/actors/ContextMenuChild.sys.mjs`, `toolkit/actors/ControllersChild.sys.mjs`, `toolkit/components/passwordmgr/LoginManagerChild.sys.mjs`, `toolkit/components/extensions/ExtensionParent.sys.mjs`, `toolkit/components/extensions/parent/ext-backgroundPage.js`, `toolkit/components/enterprisepolicies/EnterprisePoliciesParent.sys.mjs`, `browser/components/enterprisepolicies/Policies.sys.mjs`, `modules/libpref/init/StaticPrefList.yaml`
- `~/.claude/gsd-core/bin/lib/uat.cjs` (`completeUatSession`, `parseUatItemsWithStats`), `~/.claude/gsd-core/templates/UAT.md`
- `docs/BUILD.md` (tier table), `.claude/skills/spike-findings-Power-Browser/` (runtime-override ban)
- Tool probes: `ls -la`/`readlink` on `objdir/dist/bin/modules`, `sha256sum` vs stamps, `spectacle --help`, `pgrep ydotoold`, `command -v`, `nix eval nixpkgs#vaultwarden.version`

### Secondary (MEDIUM confidence)
- none beyond in-tree reading; no web search was needed (close-out phase).

### Tertiary (LOW confidence)
- Hypotheses for C22/C23/C24 root causes and the XWayland and ydotool behaviours (marked `[ASSUMED]` in the Assumptions Log).

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all in-tree tooling, versions read from the host.
- Architecture (patch route, no-rebuild, guards): HIGH for the symlink and guard mechanics; MEDIUM for live behaviour until a session runs.
- Pitfalls: HIGH - each was observed or read from source.
- C22/C23/C24 root causes: LOW - not found; bisect plans only.
- UAT classification counts: MEDIUM - rows read exactly, class assignment for mixed rows is judgment.

**Research date:** 2026-11-05
**Valid until:** 2026-11-12 (the tree moves daily on `main`; re-read the git status and stamps at plan time)
