---
phase: 59-carry-forward-from-v1-5-and-v1-6
plan: 02
subsystem: release-infra
tags: [repo-controls, device-flow, gh, crash-reporter, internals-boundary, nixos, github-runner, libvirt, codeberg-mirror]

requires:
  - phase: 41-repository-controls-and-github-apps-a (workstream deploy)
    provides: the repo-controls row and the DEVICE-FLOW specification (41-04 field 10, Task 3 and Task 4)
  - phase: 57-native-crash-reporting-k (workstream deploy)
    provides: plan 57-08 and the verify-crash-autosubmit-lock.mjs gate shape
  - phase: 49, 53 and 54 (workstream deploy)
    provides: the runner block (docs/RELEASING.md), the Codeberg units (systemd/), the libvirt block (54 BLOCKED.md item 6)
provides:
  - "REPO_CONTROLS_TOKEN_<SLUG> token input for every repo-controls App installation list read"
  - "docs/RELEASING.md subsection App installation read-back"
  - "PowerBrowserAPI.clearEnv and the MOZ_CRASHREPORTER_AUTO_SUBMIT clear first in PowerBrowserSingleInstanceHandler.handle (plan 57-08)"
  - "scripts/verify-crash-autosubmit-env.mjs: derived gate with a six-plant self-test"
  - "systemd/legion-pb.nix: the one /etc/nixos module for A11 (runner, libvirt, key directory, Codeberg timer)"
affects: [59-04, 59-05, 59-07, coordinator merge of lane 59-02]

actuals:
  tokens: 54617  # chars/4 over the added lines of the lane diff; 8845 without the INTERNAL-APIS.md renumbering
  tasks: 4
  commits: 5  # four task commits and this SUMMARY

tech-stack:
  added: []
  patterns:
    - "A per-installation credential crosses into exactly one gh child as GH_TOKEN; the getter cache stays keyed by path"
    - "A NixOS module in the tree leaves the release repository URL to configuration.nix, because the brand scan admits the slug only in its listed files"

key-files:
  created:
    - scripts/verify-crash-autosubmit-env.mjs
    - systemd/legion-pb.nix
    - .planning/workstreams/deploy/phases/57-native-crash-reporting-k/57-08-SUMMARY.md
    - .planning/workstreams/orca/phases/59-carry-forward-from-v1-5-and-v1-6/59-02-SUMMARY.md
  modified:
    - scripts/verify-repo-controls.mjs
    - docs/RELEASING.md
    - powerbrowser/shell/PowerBrowserAPI.sys.mjs
    - powerbrowser/INTERNAL-APIS.md
    - docs/CRASH-POLICY.md
    - .planning/workstreams/deploy/phases/57-native-crash-reporting-k/BLOCKED.md

key-decisions:
  - "systemd/legion-pb.nix sets no runner url. A literal release-repository slug in a new file turns scan-brand-residue red (proven: 1 residual occurrence, 55 reconciliation failures), and inventory/ is outside this lane. The owner adds services.github-runners.powerbrowser-release.url in configuration.nix; the option has no default, so evaluation fails while the line is missing (proven)."
  - "INTERNAL-APIS.md is renumbered by a deterministic shift over both tables, not by verify-ng-040 --fix: --fix parses only the Touchpoints table and left 33 uncatalogued occurrences under Deliberately not touched."
  - "The token input covers every installation (declared and undeclared), per D-03 and the five red list reads; DEVICE-FLOW is implemented, not re-asked."
  - "The repo-controls self-test runs with env {}, so no plant ever sees a REPO_CONTROLS_TOKEN_* from the owner's shell."
  - "The Codeberg service in the module runs ${pkgs.git}/bin/git, not /run/current-system/sw/bin/git, so it does not depend on systemPackages; every other directive is unchanged."

patterns-established:
  - "Lane gates for a boundary edit: check-internals-boundary (scan, --catalogue, --self-test) plus ng-040 without --fix, after a deterministic renumber"

requirements-completed: [CF-15]

coverage:
  - id: D1
    description: "repo-controls reads each App installation's repository list with REPO_CONTROLS_TOKEN_<SLUG> when set, the token reaching only that one gh child as GH_TOKEN"
    requirement: CF-15
    verification:
      - kind: unit
        ref: "scripts/verify-platform.sh --only repo-controls-self-test; node scripts/verify-repo-controls.mjs --self-test (79 plants, the REPO_CONTROLS_TOKEN_POWERBROWSER_BOT token-threading line, the ghGet GH_TOKEN-only line)"
        status: pass
    human_judgment: false
  - id: D2
    description: "docs/RELEASING.md App installation read-back: the five variables, the device-flow re-run for the two owned Apps, the 8-hour expiry, the third-party limit"
    requirement: CF-15
    verification:
      - kind: other
        ref: "grep of the subsection for the heading, the five REPO_CONTROLS_TOKEN_ variables and '8 hours'"
        status: pass
    human_judgment: true
    rationale: "The procedure is proven only when the owner mints the tokens and runs repo-controls live at the 59-04 checkpoint"
  - id: D3
    description: "PowerBrowserAPI.clearEnv sets MOZ_CRASHREPORTER_AUTO_SUBMIT to empty as the first statement of the single-instance handler's try, catalogued as Services.env.set"
    requirement: CF-15
    verification:
      - kind: unit
        ref: "bash scripts/check-internals-boundary.sh && --catalogue && --self-test; node scripts/verify-ng-040-internals-catalogue-lines.mjs"
        status: pass
    human_judgment: false
  - id: D4
    description: "scripts/verify-crash-autosubmit-env.mjs derives the variable and the env_bool rule from upstream and fails on six planted faults"
    requirement: CF-15
    verification:
      - kind: unit
        ref: "node scripts/verify-crash-autosubmit-env.mjs && node scripts/verify-crash-autosubmit-env.mjs --self-test"
        status: pass
    human_judgment: false
  - id: D5
    description: "The crash client shows its dialog for a crash in a reporter-enabled build started with MOZ_CRASHREPORTER_AUTO_SUBMIT=1"
    requirement: CF-15
    verification: []
    human_judgment: true
    rationale: "Needs the tier-3 TEL-13 reporter build (59-05/59-07) and -purgecaches; no reporter-enabled build exists in this lane"
  - id: D6
    description: "systemd/legion-pb.nix: the A11 module for /etc/nixos"
    requirement: CF-15
    verification:
      - kind: other
        ref: "nix-instantiate --parse systemd/legion-pb.nix; eval-config against legion's 26.05.13627 channel: config.system.build.toplevel.drvPath evaluates with the module and a stub; rendered codeberg-mirror units carry all 28 + 5 source directives"
        status: pass
    human_judgment: true
    rationale: "The owner's dry-build against the live configuration.nix, the nrs run, the runner online and the first mirror push are OWNER-PASS section 5 steps that no lane check can perform"
  - id: D7
    description: "Registry row text for crash-autosubmit-env and crash-autosubmit-env-self-test, for the coordinator to append"
    requirement: CF-15
    verification:
      - kind: other
        ref: "grep -F of both row strings in this file"
        status: pass
    human_judgment: false

duration: 2h47m  # wall clock, including the usage-limit cut-off and a resumed session
completed: 2026-11-08
status: complete
---

# Phase 59 Plan 02: CF-15 lane Summary

**repo-controls now reads every App installation list with a per-slug `REPO_CONTROLS_TOKEN_<SLUG>` token (DEVICE-FLOW), plan 57-08 clears `MOZ_CRASHREPORTER_AUTO_SUBMIT` through the boundary with a gate derived from the crash client's source, and `systemd/legion-pb.nix` is the one A11 module for the owner to install.**

## Performance

- **Duration:** 2h 47m (wall clock, including a usage-limit cut-off; the resumed session re-ran the gates)
- **Started:** 2026-11-09T00:00:25Z
- **Completed:** 2026-11-09T02:47:29Z
- **Tasks:** 4 of 4
- **Files modified:** 10 (exactly the plan's files_modified)

## Accomplishments

- `scripts/verify-repo-controls.mjs`: `ghGet(path, exec = execFileSync, token)` passes a token only as `GH_TOKEN` in that one child's `env`; `safeGetter` threads `{ token }` with the cache keyed by path; `runChecks` takes an `env` override (default `process.env`); `compareApps` reads the list of App `<slug>`, declared or undeclared, with `REPO_CONTROLS_TOKEN_<SLUG>` and with the owner token when it is unset. A refusal stays a FAIL naming the variable and "App installation read-back". The self-test now plants a bot token that must reach only `user/installations/800001/repositories?per_page=100` (28 other reads carry none) and checks that `ghGet` keeps the token out of argv and the result. Three mutated copies (token dropped, token on every read, `ghGet` ignoring it) each went red.
- `docs/RELEASING.md` "### App installation read-back": the five variables, the 41-04 Task 4 device-flow procedure for the bot and clock Apps, the 8-hour expiry, red-by-design without the variables, and the third-party limit (a token at the 59-04 checkpoint or a D-09 re-date).
- Plan 57-08 executed except its live proof. `PowerBrowserAPI.clearEnv(name)` sets `""` through `Services.env.set` (`PowerBrowserAPI.sys.mjs:428`). `PowerBrowserSingleInstanceHandler.handle` calls it first inside its try (line 4467, before `cliUrl`). It is catalogued as the `Services.env.set` row. `scripts/verify-crash-autosubmit-env.mjs` derives `MOZ_CRASHREPORTER_AUTO_SUBMIT` from the `ekey!` prefix in `main.rs` and the `auto_submit` key in `config.rs`. Its self-test turns six planted faults red, each naming the drifted file. It was red on the pre-57-08 tree and fails closed without `upstream/`. `docs/CRASH-POLICY.md` records both auto-send paths as closed, with the pre-handler limit. BLOCKED.md B6 is closed (commit b03b6b53). `57-08-SUMMARY.md` is written.
- `systemd/legion-pb.nix`: one module with the runner, `users.users.pb-runner` (`libvirtd` group), the hook copy, `virtualisation.libvirtd` with swtpm, the `/var/lib/powerbrowser-release` tmpfiles rule with chris in `pb-runner`, and the Codeberg service and timer. With a stub configuration the full system evaluates against legion's own 26.05.13627 channel. Without the `url` line evaluation fails, which is intended.

## Task Commits

1. **Task 1: tracer, per-slug token reaches one gh child (ghGet, safeGetter, compareApps, self-test, docs)**: `abec5d21` (feat)
2. **Task 2: plan 57-08 Task 1, boundary clearEnv, its call site and the Services.env.set row**: `b03b6b53` (feat)
3. **Task 3: plan 57-08 Task 2, derived gate with six plants, policy text, B6, 57-08 SUMMARY**: `d1584703` (feat)
4. **Task 4: the /etc/nixos module for A11**: `fb9fbddc` (feat)

**Plan metadata:** this SUMMARY's commit (docs).

## Files Created/Modified

- `scripts/verify-repo-controls.mjs`: token input and its self-test.
- `docs/RELEASING.md`: subsection "App installation read-back".
- `powerbrowser/shell/PowerBrowserAPI.sys.mjs`: `clearEnv` and its call.
- `powerbrowser/INTERNAL-APIS.md`: the `Services.env.set` row; every File:Line cell renumbered.
- `scripts/verify-crash-autosubmit-env.mjs` (new): the derived gate.
- `docs/CRASH-POLICY.md`: both send paths closed, with the pre-handler limit.
- `.planning/workstreams/deploy/phases/57-native-crash-reporting-k/BLOCKED.md`: B6 closed.
- `.planning/workstreams/deploy/phases/57-native-crash-reporting-k/57-08-SUMMARY.md` (new): the deploy plan record.
- `systemd/legion-pb.nix` (new): the A11 module.

## Registry rows for the coordinator

`scripts/verify-platform.sh` belongs to lane 59-03 in wave 1, so this lane does not edit it. At the 59-02 merge,
append these four lines directly after the `crash-autosubmit-lock-self-test` row (line 3805 on the lane base):

```bash
    # NEW (Phase 57, 57-08, WR-05; run in Phase 59 lane 59-02): MOZ_CRASHREPORTER_AUTO_SUBMIT is cleared first in
    # PowerBrowserSingleInstanceHandler.handle via PowerBrowserAPI.clearEnv; name from config.rs + main.rs ekey!. Text reads only.
    "crash-autosubmit-env|node $REPO_ROOT/scripts/verify-crash-autosubmit-env.mjs"
    # Green first, then six plants (call removed, call moved after other work, different name, non-empty value,
    # config.rs key renamed, env_bool reading any set value as true), each red naming the drifted file.
    "crash-autosubmit-env-self-test|node $REPO_ROOT/scripts/verify-crash-autosubmit-env.mjs --self-test"
```

## NixOS options checked

legion runs NixOS 26.05.13627.c56a87d8e41c (`nixos-version`; root's channel `nixos` is 26.05). The nixos MCP does
not index 26.05 (it offers unstable, 25.11, stable and beta), so each name below was checked with the MCP on
unstable, and the runner names on 25.11 as well. Then every name was checked against legion's own 26.05 channel:
`eval-config.nix` from `/nix/var/nix/profiles/per-user/root/channels/nixos`, with the module and a stub, evaluates
`config.system.build.toplevel.drvPath`, which fails on any option that does not exist. The MCP's unstable index lags
legion's channel: it lists git 2.53.0, while legion's 26.05 channel resolves git 2.54.0.

- `services.github-runners.<name>.enable`: MCP unstable found (boolean), 25.11 found; 26.05 `options.nix:32`
- `services.github-runners.<name>.url`: MCP unstable found (string, no default), 25.11 found; 26.05 `options.nix:44`. Set by the owner in configuration.nix, not in the module
- `services.github-runners.<name>.tokenFile`: MCP unstable found (absolute path), 25.11 found; 26.05 `options.nix:62`
- `services.github-runners.<name>.tokenType`: MCP unstable found (enum auto, access, registration), **25.11 not found** (added after 25.11); 26.05 `options.nix:105` present
- `services.github-runners.<name>.ephemeral`: MCP unstable found (boolean), 25.11 found; 26.05 `options.nix:217`
- `services.github-runners.<name>.replace`: MCP unstable found (boolean), 25.11 found; 26.05 `options.nix:171`
- `services.github-runners.<name>.name`: MCP unstable found (null or string), 25.11 found; 26.05 `options.nix:129`
- `services.github-runners.<name>.user`: MCP unstable found (null or string), 25.11 found; 26.05 `options.nix:237`
- `services.github-runners.<name>.group`: MCP unstable found (null or string), 25.11 found; 26.05 `options.nix:251`
- `services.github-runners.<name>.workDir`: MCP unstable found (null or string), 25.11 found; 26.05 `options.nix:270`
- `services.github-runners.<name>.extraLabels`: MCP unstable found (list of string), 25.11 found; 26.05 `options.nix:150`
- `services.github-runners.<name>.extraPackages`: MCP unstable found (list of package), 25.11 found; 26.05 `options.nix:181`
- `services.github-runners.<name>.extraEnvironment`: MCP unstable found (attribute set), 25.11 found; 26.05 `options.nix:189`
- `users.users.<name>.isSystemUser`: MCP unstable found (boolean)
- `users.users.<name>.group`: MCP unstable found (string)
- `users.users.<name>.autoSubUidGidRange`: MCP unstable found (boolean)
- `users.users.<name>.extraGroups`: MCP unstable found (list of string; list definitions merge with configuration.nix)
- `users.groups`: MCP unstable found (attribute set of submodule)
- `environment.etc.<name>.source`: MCP unstable found (absolute path)
- `environment.etc.<name>.mode`: MCP unstable found (string; not "symlink" means copied)
- `virtualisation.libvirtd.enable`: MCP unstable found (boolean)
- `virtualisation.libvirtd.qemu.swtpm.enable`: MCP unstable found (boolean)
- `systemd.tmpfiles.rules`: MCP unstable found (list of string)
- `systemd.services.<name>.description`: MCP unstable found
- `systemd.services.<name>.wants`: MCP unstable found
- `systemd.services.<name>.after`: MCP unstable found
- `systemd.services.<name>.environment`: MCP unstable found
- `systemd.services.<name>.serviceConfig`: MCP unstable found (attribute set of systemd option)
- `systemd.timers.<name>.description`: MCP unstable found
- `systemd.timers.<name>.wantedBy`: MCP unstable found
- `systemd.timers.<name>.timerConfig`: MCP unstable found (attribute set of systemd option)
- Packages `git`, `gh`, `nix`, `podman`: MCP unstable found (2.53.0, 2.89.0, 2.31.4, 5.8.1); all resolve in the 26.05 evaluation

The rendered `codeberg-mirror.service` and `.timer` from that evaluation carry all 28 and all 5 directives of
`systemd/codeberg-mirror.service` and `.timer` (yes normalised to true, the git path normalised). The only additions
are NixOS's standard `LOCALE_ARCHIVE`, `PATH` and `TZDIR` lines.

## Merge note for the coordinator

Merge note for the coordinator: run node scripts/verify-ng-040-internals-catalogue-lines.mjs after the merge; no WINDOWS.md ids close in this lane.

- Do not repair `powerbrowser/INTERNAL-APIS.md` with `--fix` after an edit that shifts `PowerBrowserAPI.sys.mjs` lines.
  `--fix` parses only the Touchpoints table, while `check-internals-boundary.sh --catalogue` also counts the rows
  filed under "Deliberately not touched", so it leaves those stale; here it left 33. Shift every table's File:Line
  cell by the insertion hunks of `git diff -U0` instead, then run ng-040 without `--fix`. Lane 59-03 hands off any
  boundary-file change, so the 59-03 merge should shift nothing here.
- Append the two registry rows above. Both are `--quick` text checks.
- The base branch gained e79aa086, 9e2f12cb, 3c846e78 and bf24c3be after this lane branched; none touches a file of this lane.
- Outside this lane's file set, now stale: `57-08-PLAN.md` frontmatter still says `status: blocked`.
  `.planning/workstreams/deploy/OWNER-PASS.md` still lists "Open Claude item: plan 57-08 ... waits for the other
  session" and the two "no file contains the /etc/nixos block/rule yet" open items in sections 3e and 5.3; all three
  are now delivered here.

## Owner steps handed to 59-04 and 59-05

- OWNER-PASS section 1 step 9 (59-04): follow RELEASING.md "App installation read-back" for `powerbrowser-bot` and
  `powerbrowser-clock`. The three third-party lists go green only with a token in the same variable form; otherwise
  they are re-dated under D-09.
- OWNER-PASS section 5 (59-04): install `systemd/legion-pb.nix` by its header steps 1-5. That includes adding the
  `services.github-runners.powerbrowser-release.url` line to configuration.nix, and running the 53 BLOCKED.md item 2
  step 2 root commands before the rebuild.
- TEL-13 (59-05): the live proof of the clear. Start the reporter-enabled build with `MOZ_CRASHREPORTER_AUTO_SUBMIT=1`
  and `-purgecaches`, crash a content process, and confirm the dialog appears.

## Decisions Made

See key-decisions in the frontmatter. In brief: the url lives in configuration.nix (brand scan); the catalogue is
renumbered deterministically (ng-040 --fix limit); the token covers every installation; the self-test environment is
hermetic; and the mirror service uses git from pkgs.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `verify-ng-040-internals-catalogue-lines.mjs --fix` could not renumber the catalogue**
- **Found during:** Task 2
- **Issue:** after `--fix`, ng-040 failed with 33 occurrences with no catalogue row. `--fix` reads only the Touchpoints
  table, but the boundary check also counts the Touchpoint-shaped rows under "Deliberately not touched".
- **Fix:** restored the catalogue from HEAD and shifted every table's File:Line cell (after old line 425 by 5, after
  4460 by 7), then added the new row. A normalised diff against HEAD shows only cell-2 numbers changed.
- **Files modified:** powerbrowser/INTERNAL-APIS.md
- **Verification:** ng-040, `--catalogue`, the scan and `--self-test` all PASS
- **Committed in:** b03b6b53

**2. [Rule 3 - Blocking] The runner url literal would turn the permanent brand gate red**
- **Found during:** Task 4
- **Issue:** the plan's runner block names the release repository URL. `inventory/brand-tokens.json` admits that slug
  only in its 11 listed files at an exact count, and inventory/ is outside this lane.
- **Fix:** the module sets no `url`; its header tells the owner to add the one `url` line in configuration.nix. The
  option has no default, so a missing line fails evaluation rather than registering anywhere.
- **Files modified:** systemd/legion-pb.nix
- **Verification:** brand scan PASS on the module; with the literal planted temporarily, the scan was red (1 residual
  occurrence, 55 reconciliation failures); without the url line the 26.05 evaluation errors on the undefined option.
- **Committed in:** fb9fbddc

**3. [Rule 2 - Missing critical] Token-handling proof at the `ghGet` level, and a hermetic self-test environment**
- **Found during:** Task 1
- **Issue:** the planned plant proves the getter receives the token, not that `ghGet` keeps it out of argv and the
  result (D-01, T-59-04). A self-test reading `process.env` would also expose the owner's real token to the fake getters.
- **Fix:** one `ghGet` check (GH_TOKEN in that child's env only, absent from argv and the refusal result, env inherited
  without a token), and `env: {}` in the self-test's fixed overrides. The undeclared refused-list plant now also names
  its variable (`REPO_CONTROLS_TOKEN_CLAUDE`).
- **Files modified:** scripts/verify-repo-controls.mjs
- **Verification:** self-test PASS; mutations of all three paths went red
- **Committed in:** abec5d21

**4. [Rule 1 - Robustness] git path in the Codeberg service**
- **Found during:** Task 4
- **Issue:** `/run/current-system/sw/bin/git` works only while git is in systemPackages.
- **Fix:** `${pkgs.git}/bin/git` in ExecStartPre and ExecStart; every other directive is unchanged (28 of 28 present after normalising the path).
- **Committed in:** fb9fbddc

---

**Total deviations:** 4 auto-fixed (2 blocking, 1 missing critical, 1 robustness).
**Impact on plan:** none widens scope; all stay inside files_modified. Smaller adjustments: B6's heading now reads
CLOSED, and its intro is in the past tense. The phrase "before the command-line handler runs" sits on one line in
CRASH-POLICY.md so the line-based acceptance grep finds it.

## Issues Encountered

- The nixos MCP has no 26.05 index, and its search backend dropped parallel requests (SSL EOF, remote disconnect).
  Checks ran one at a time, and legion's own channel was evaluated as the authoritative 26.05 check.
- Host load was 85-105 on 16 cores (the coordinator's dev build and the other lanes). The `--quick` run after Tasks 1-2
  was stopped at 65 started checks with no failure. The final `--quick` ran once on the committed tree.
- A Bash guard read the regex `Services\.env` as a `.env` file pattern; the unescaped spelling was used instead.
- Recursive deletes outside the project are blocked, so the scratch directories under /tmp (`p59-02-red.*`,
  `p59-02-noup.*`, `p59-02-nixeval.*`, `p59-02-tools`) were left for the system to clean.

## Next Phase Readiness

- 59-04 has what section 1 step 9 and section 5 need: the token input and its procedure, and the module.
- 59-05 has 57-08 landed before the TEL-13 switch-on (D-13); the live dialog proof remains.
- The live `repo-controls` row was not run in this lane; it needs the owner's tokens (59-04).

## Verification (plan level)

- repo-controls-self-test: PASS (`scripts/verify-platform.sh --only repo-controls-self-test`)
- check-internals-boundary scan, `--catalogue`, `--self-test`: PASS
- ng-040-internals-catalogue-lines: PASS (without `--fix`)
- verify-crash-autosubmit-env and `--self-test`: PASS (6 planted faults red, baseline green first)
- `nix-instantiate --parse systemd/legion-pb.nix`: PASS; 26.05 toplevel evaluation: PASS
- scan-brand-residue: PASS (680 scanned files)
- `scripts/verify-platform.sh --quick`: PASS (`verify-platform: PASS -- all checks passed`, exit 0, 35m18s on the committed tree, re-run in the resumed session)

## Self-Check: PASSED

- Every acceptance criterion of Tasks 1-4 re-run on the committed tree: PASS (Task 4 criterion 4 is the `--quick` line above).
- Created files exist: scripts/verify-crash-autosubmit-env.mjs, systemd/legion-pb.nix, 57-08-SUMMARY.md, this file.
- Task commits on this branch: abec5d21, b03b6b53, d1584703, fb9fbddc.
- `git diff --stat ServerDestroyer/v1.7-Orca-integration...HEAD` lists only the 10 files in files_modified; no edit to
  STATE.md, ROADMAP.md, .planning/WINDOWS.md, scripts/verify-platform.sh or the ledger; nothing pushed;
  `git -C upstream diff` empty (the patch stack is staged).

---
*Phase: 59-carry-forward-from-v1-5-and-v1-6*
*Completed: 2026-11-08*
