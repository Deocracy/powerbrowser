---
phase: 59-carry-forward-from-v1-5-and-v1-6
reviewed: 2026-11-20T22:47:01Z
depth: deep
files_reviewed: 8
files_reviewed_list:
  - .github/workflows/release-train.yml
  - powerbrowser/shell/GroupActorChild.sys.mjs
  - powerbrowser/shell/PowerBrowserAPI.sys.mjs
  - scripts/fixer-isolate.sh
  - scripts/redate-windows.mjs
  - systemd/legion-pb.nix
  - theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx
  - theia/extensions/chrome-bar/src/browser/side-panel-top-tabs.ts
findings:
  critical: 3
  warning: 5
  info: 6
  total: 14
  necessity: 0
status: issues_found
---

# Phase 59: Code Review Report

**Reviewed:** 2026-11-20T22:47:01Z
**Depth:** deep
**Files Reviewed:** 8
**Status:** issues_found

## Summary

Each file was reviewed in its HEAD state (e0c19c54). For pre-existing files, the review concentrated on `git diff 2b5f4609..HEAD`, which also covers later v1.7 phases' changes (Phase 62-68 agent bridge, Orca hosting, Orca re-pin). Cross-file checks covered:

- the nixpkgs 26.05 `github-runner` module on this host (`/nix/var/nix/profiles/per-user/root/channels/nixos/.../github-runner/service.nix`);
- `.github/workflows/verify.yml` and `release.yml`;
- the `scripts/verify-platform.sh` registry;
- stock Theia `perspective-service.js` and `tab-bars.js`;
- upstream Gecko `CanonicalBrowsingContext.cpp`, `ContextMenuChild.sys.mjs` and the crash client's `config.rs`;
- `OrcaService.sys.mjs`.

Claims checked and found sound:

- the `clearEnv("")` auto-submit semantics (`env_bool` treats "" as false);
- sandbox-flag survival across browsing-context replacement (`ReplacedBy` copies `SandboxFlags`);
- the mode-switch guard in `applyStripHome` (stock sets `activePerspectiveId` before restoring the layout);
- the per-step `FIX_DIFF` move;
- the `fixer-isolate.sh` /tmp skip.

Key concerns:

- **`systemd/legion-pb.nix` (two blockers).** As written, the runner unit cannot start, and it cannot run the podman builds that `release.yml` requires.
- **`scripts/redate-windows.mjs` (one blocker).** The tool is registered in the `--quick` gate, but it hard-requires a developer-local gsd-core install. CI therefore goes red.
- **59-09 edit-row route (warning).** The route breaks the page menu's text-field rows in Phase 66 agent overlays.

## Critical Issues

### CR-01: Runner work directory is never created, so the runner unit fails at namespace setup

**File:** `systemd/legion-pb.nix:42`
**Issue:** `workDir = "/var/lib/pb-runner"` is set, and nothing creates that directory:

- The nixpkgs 26.05 module on legion (`github-runner/service.nix:256`, `:312`) sets `WorkingDirectory = workDir` and `BindPaths = [ cfg.workDir ]`, with no `-` prefix. A missing source path aborts the unit before any `ExecStartPre` runs (226/NAMESPACE or 200/CHDIR).
- The module has no tmpfiles rule for the directory.
- `users.users.pb-runner` is an `isSystemUser` with the default home `/var/empty` and no `createHome`.
- The header's install steps 1-5 never create the directory either.

The runner therefore never comes online after `nrs`. Separately, the module sets `HOME = workDir` (`service.nix:56`) and wipes `workDir` on every start (`service.nix:164`). Any per-user state kept under HOME, including the rootless podman image store, is lost on each restart.
**Fix:**
```nix
systemd.tmpfiles.rules = [
  "d /var/lib/powerbrowser-release 0750 root pb-runner -"
  "d /var/lib/pb-runner 0750 pb-runner pb-runner -"
];
```

### CR-02: Module default hardening makes the rootless podman that release.yml needs impossible on this runner

**File:** `systemd/legion-pb.nix:32-56`
**Issue:** The file sets `extraPackages = [ ... podman ]` and `autoSubUidGidRange = true # rootless podman`. `release.yml:179-201` and `:603-652` run `podman build` and `podman run` on this runner. The nixpkgs module applies these service defaults (`service.nix:274-305`):

- `RestrictNamespaces = true`, which blocks `unshare(CLONE_NEWUSER)`;
- `PrivateUsers = true`, which maps only the service uid;
- `NoNewPrivileges = true`, which stops the setuid `newuidmap` and `newgidmap` wrappers from gaining privilege;
- `SystemCallFilter = ~@mount`.

Rootless podman needs every one of these, so every release build job fails on this runner. The header (lines 27-28) warns only about libvirt. `docs/RELEASING.md:423` lists podman as "not verified", but the module source on this host proves the failure. No `serviceOverrides` is set.
**Fix:** Relax the module defaults for this runner explicitly, and record why:
```nix
services.github-runners.powerbrowser-release.serviceOverrides = {
  RestrictNamespaces = false;   # rootless podman creates user/mount namespaces
  PrivateUsers = false;         # newuidmap must map the subuid range of pb-runner
  NoNewPrivileges = false;      # newuidmap/newgidmap are setuid wrappers
  SystemCallFilter = [ "~@clock" "~@cpu-emulation" "~@module" "~@obsolete" "~@raw-io" "~@reboot" ];
  PrivateMounts = false;
};
```
Also set a podman storage location outside the wiped `workDir`, for example `extraEnvironment.XDG_DATA_HOME = "/var/lib/pb-runner-data"` plus a tmpfiles rule.

### CR-03: redate-windows.mjs hard-requires ~/.claude/gsd-core at load, and its row is in the --quick set CI runs

**File:** `scripts/redate-windows.mjs:15-17`
**Issue:** `require(BW_PATH)` runs at module top level, with the default path `~/.claude/gsd-core/bin/lib/broken-windows.cjs`. The row `redate-windows-self-test` sits inside `run_own_checks`'s base `CHECKS` array (`scripts/verify-platform.sh:3680`). That array is the `--quick` set, not the `QUICK -eq 0` extension at `:6082`. `.github/workflows/verify.yml:93` runs `scripts/verify-platform.sh --quick` on `ubuntu-latest`, and no step installs gsd-core or sets `GSD_BROKEN_WINDOWS`. The script throws `MODULE_NOT_FOUND` before `main` runs, so the commit gate fails on every PR whose base carries this row. That includes the bot bump PRs whose auto-merge waits on that check. Per CLAUDE.md, `--quick` is the commit gate, so a row that cannot run in CI cannot sit in it.
**Fix:** Do one of the following:
- Vendor the two functions the tool needs (`parseLedger` and `renderLedger`) into `scripts/lib/` with a drift check against gsd-core.
- Move the row into the full tier (`CHECKS+=` under `QUICK -eq 0`) and make a missing parser an explicit, named FAIL:

```js
let bw;
try { bw = require(BW_PATH); }
catch { console.error(`redate-windows: FAIL -- gsd-core broken-windows parser not found at ${BW_PATH}; set GSD_BROKEN_WINDOWS`); process.exit(1); }
```

## Warnings

### WR-01: The 59-09 text-field edit route throws in agent overlays, so Undo, Redo, Delete and Select All fail there

**File:** `powerbrowser/shell/PowerBrowserAPI.sys.mjs:9061` (also `:10978`, `:10035`)
**Issue:** On a text field, `pageMenuEdit` now calls `global.getActor(EDIT_STATE_ACTOR_NAME)`. That actor is registered with `messageManagerGroups: ["browsers"]` (`:10035`). Phase 66 agent overlays are created in `"powerbrowser-orca-agent"` (`:3620`, `:11127`). The stock `ContextMenu` actor has no group restriction (`upstream/browser/components/DesktopActorRegistry.sys.mjs:416-428`). `installPageContextMenu` keeps the capture for any shown overlay (`overlayShownToUser`), agent tabs included. So when a user right-clicks a text field in an agent tab they are viewing, the Theia page menu opens. Picking Undo, Redo, Delete or Select All then throws NotSupportedError from `getActor`, and the error is caught at `:8787-8789` and returned as "the page menu row failed". Before 59-09 these rows went through the group-agnostic `Controllers` actor and worked. `pageEditTargetCommands` (`:10978`) also throws there and silently falls back to the cached state.
**Fix:** Keep the Controllers route when the edit-state actor is unavailable:
```js
const edit = data.context.onTextInput && data.browser.getAttribute("messagemanagergroup") === "browsers";
edit ? global.getActor(EDIT_STATE_ACTOR_NAME).sendAsyncMessage("PowerBrowserEditState:Do", { cmd })
     : global.getActor("Controllers").doCommand(cmd);
```
Alternatively, exclude agent overlays from the page menu if D-38 intends no edit rows there, and record which.

### WR-02: Agent element rows read the box before a smooth scroll lands, and fail on pages with scroll-behavior: smooth

**File:** `powerbrowser/shell/GroupActorChild.sys.mjs:251` (also `:535`)
**Issue:** `agentCentre` calls `element.scrollIntoView({ block: "center", inline: "center" })` and then immediately reads `getBoundingClientRect()` and runs `elementFromPoint`. Without `behavior`, the call uses `auto`, which honours CSS `scroll-behavior`. A page with `:root { scroll-behavior: smooth }` (Bootstrap 5's reboot sets it under `prefers-reduced-motion: no-preference`) therefore scrolls asynchronously. The rect is the pre-scroll one, so the hit test misses (often `null` off-viewport), and click, dblclick, hover and drag answer `browser_element_not_interactable` for any element that was off-screen.
**Fix:** `element.scrollIntoView({ block: "center", inline: "center", behavior: "instant" });` here and in the `browser.scrollIntoView` row.

### WR-03: The result budget is enforced for images, PDF and snapshot only, not for the other child or native rows

**File:** `powerbrowser/shell/PowerBrowserAPI.sys.mjs:11793`; `powerbrowser/shell/GroupActorChild.sys.mjs:406`, `:422-424`, `:650-653`
**Issue:** `AGENT_RESULT_MAX_BYTES` (`:11246`) is documented as the limit above which orcad rejects a result (Pitfall 4). The budget is checked in only three places: `agentEncodeImage`, `agentPdf` and the child's snapshot (`SNAP_MAX_BYTES`). These rows return unbounded payloads:

- `browser.eval` (any `String(v)` or `JSON.stringify(v)`);
- `browser.exec get html` and `get text` (whole-page `innerHTML` or `innerText`);
- `browser.console` (up to 1000 rows of unbounded text);
- `browser.network`;
- `browser.cookie.get`.

`handleWebTabAgent` returns them as-is at `:11793`. On a large page, orcad rejects the reply, so the agent gets a transport-level failure instead of a classified `browser_error`.
**Fix:** Measure once in `handleWebTabAgent` before replying:
```js
if (outcome.where === "done" && new TextEncoder().encode(JSON.stringify(outcome.result ?? null)).length + 64 > AGENT_RESULT_MAX_BYTES) {
  outcome = agentFailed("browser_error");
}
```

### WR-04: The redate self-test fixture is the live WINDOWS.md, so the row goes red once fewer than two entries are open

**File:** `scripts/redate-windows.mjs:84-93`, `:111`
**Issue:** `selfTest` copies `.planning/WINDOWS.md` and needs at least two open entries and one non-open entry. Phase 59's own goal is a gate with no exclusions, which means closing open entries. With one or zero open entries, line 92 records a FAIL. Line 111 then calls `redate({ ids: [a, undefined] })`, which throws an uncaught `id undefined: no such WINDOWS.md entry` out of the `try`/`finally`. The self-test therefore goes red, with a stack trace, on a tree that has no defect. A self-test's fixture must not depend on project progress.
**Fix:** Build a synthetic ledger in the temp directory with gsd-core's own `emptyLedger` and `appendWindow`, with two open entries, one fixed and one waived. Then the plants and controls run against a fixed shape.

### WR-05: The top-tab side header now never overflows, and its comment says a row cannot overflow when it clips

**File:** `theia/extensions/chrome-bar/src/browser/side-panel-top-tabs.ts:30-31`
**Issue:** `hideOverflowingTabs` is stubbed to return `-1`, which fixes WINDOWS 41's TypeError. The removed comment recorded the remaining limitation as a `shortcut:` debt marker: surplus icons are clipped, so add a horizontal overflow if the views grow. The new comment states "a row never overflows". The CSS (`side-panel-top-tabs.css`: bar `min-width: 0`, tabs fixed at 32px plus 2px margin) clips any icon past the header width. A side panel can be dragged down to Lumino's minimum (the 100 px case in the round 3 debug), and below about 34 px per view the trailing views have no reachable icon and no overflow menu. The defect marker is gone, and the comment claims the opposite of the behaviour.
**Fix:** Restore a `shortcut:` marker that states the clipping. Better, give the row a real overflow: `overflow-x: auto` on `.pb-side-header .lm-TabBar-content`, or a "more" menu built from `bar.titles` past the visible width.

## Info

### IN-01: The GroupActorChild header still claims zero privileged reach

**File:** `powerbrowser/shell/GroupActorChild.sys.mjs:15-21`
**Issue:** The file header says the file carries "ZERO privileged reach -- no module import of any kind, only the actor globals plus DOM dispatch". The Phase 66 agent child now uses `Cc` and `Ci` (`:293`, `:674-675`), `windowUtils`, `synthesizeMouseEvent` and `wrappedJSObject` waivers (catalogued in INTERNAL-APIS.md:446-450).
**Fix:** Scope the sentence to the group and edit-state children, or point at the INTERNAL-APIS rows.

### IN-02: browser.mouseClick validates modifiers and radius and then ignores them

**File:** `powerbrowser/shell/PowerBrowserAPI.sys.mjs:11186`; `powerbrowser/shell/GroupActorChild.sys.mjs:520-523`
**Issue:** The validator admits `params.modifiers` and `params.radius`, but `agentClick` never applies them. A Shift-click or Ctrl-click answers `done` as a plain click.
**Fix:** Pass the modifiers into `synthesizeMouseEvent`'s `modifiers` field, or refuse them with `browser_command_unavailable`.

### IN-03: Replay-log text is interpolated into the stop issue's code span

**File:** `.github/workflows/release-train.yml:1700`
**Issue:** `STAGE` is the first `rebase-orca: FAIL -- ` line of a log produced while Orca's build ran. A backtick in that line ends the code span, so the rest renders as markdown in the issue, including links and @-mentions.
**Fix:** Strip backticks, or put the stage in a fenced block with a fence longer than any run of backticks in the text.

### IN-04: applyStripHome hard-codes the IDE-dress list a second time instead of reading the mode's furniture rule

**File:** `theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx:2112`
**Issue:** P64-19 adds `'orca'` to a literal list. `ModeService.activateMode` decides the rails from `rules.furniture` (`mode-service.ts:399-402`). A custom mode saved with furniture on keeps its rails at the switch, then loses them, along with the menubar and the layout controls, on the next shell add or remove. This behaviour predates v1.7, and the edit extends the duplicated rule.
**Fix:** Expose the active mode's rules (`furniture`) and derive `ideDress` from them.

### IN-05: The logo parent reads the port from the current document, not from the sender

**File:** `powerbrowser/shell/PowerBrowserAPI.sys.mjs:11966`
**Issue:** `this.browsingContext.currentWindowGlobal.documentURI` can name a newer document than the sending `WindowGlobalParent` when a navigation races the query. The answer is only a logo, so the impact is nil, but the wall reads the wrong object.
**Fix:** Use `this.manager.documentURI`.

### IN-06: redate-windows.mjs: URL pathname used as a file path, and one self-test assertion is constant

**File:** `scripts/redate-windows.mjs:19`, `:113`, `:168`
**Issue:** `new URL(import.meta.url).pathname` is percent-encoded, so it is wrong for any path with a space or a non-ASCII character. `check('file still parses with the gsd-core parser', true)` can never fail.
**Fix:** Use `fileURLToPath(import.meta.url)`. Assert the parse result, for example `after.entries.length === fixture.entries.length`.

---

_Reviewed: 2026-11-20T22:47:01Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
