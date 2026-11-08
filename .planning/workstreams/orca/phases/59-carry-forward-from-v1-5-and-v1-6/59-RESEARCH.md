# Phase 59: Carry-forward from v1.5 and v1.6 - Research

**Researched:** 2026-11-08
**Domain:** internal bookkeeping, gap closure and owner checkpoints across the v1.5 close-out and the v1.6 `deploy` workstream (no external libraries, no web research)
**Confidence:** HIGH for in-tree facts (every discrete value below was read this session); MEDIUM for the fix leads in 59-03 (read from code, not reproduced); the open questions at the end are real conflicts between locked decisions and the tree.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Each OWNER-PASS.md section (§1–§13) is a checkpoint inside a plan: the executor shows the section's exact commands in the question box, waits for "done", then runs that section's live probe (gh, curl, the matching gate row) and writes the result into the SUMMARY. Chris never pastes credentials into chat; Claude never holds owner tokens.
- **D-02:** The 41-item v1.5 human checklist (`39-HUMAN-CHECKLIST.md`) and `/gsd-verify-work 29`, `30`, `31` run with Claude driving the browser (gsd-browser plus the KWin real-input gate `pb-kwin.mjs`) and Chris judging pass/fail per item in the box. Results are recorded per item in the plan SUMMARY and as UAT rows.
- **D-03:** Failure rule: a red caused by code gets a gap-closure plan appended to Phase 59 and is fixed before the phase closes; a red that needs Chris (hardware, account, third party) is re-dated under D-09 and the phase continues. Owner rulings R1–R17 and answers A1–A14 are never re-asked.
- **D-04:** Seven plans with disjoint file sets. Three are lane plans executed by Claude agents in Orca child workspaces with no input from Chris; four run in this (coordinating) workspace. Only the coordinating session writes STATE.md, ROADMAP.md, WINDOWS.md and the ledger. — Reversibility: costly — merging lanes that touch the same files is the merge-trap class recorded for v1.5 phases 33–37.
  - **59-01 (lane):** CF-14, record the live work done by 2026-11-07 ("Live state at parking") in the deploy SUMMARYs for 41-04, 42-04, 43-05, 47-04 and 48-05. Docs only; no build setup needed.
  - **59-02 (lane):** CF-15 code: device-flow token input for `repo-controls` app-list reads (41-04 field 10, DEVICE-FLOW); plan 57-08 (boundary `clearEnv` for `MOZ_CRASHREPORTER_AUTO_SUBMIT` in `PowerBrowserAPI.sys.mjs`, now unblocked); the `/etc/nixos` Codeberg-mirror block delivered as a prepared diff for Chris to apply (Claude cannot run `pkexec`).
  - **59-03 (lane):** backlog 999.28–999.31, all 11 rows: WINDOWS.md 27 (long-press Back focus), 28 (crash-navigate flake), 39, 42, 43 (timing flakes: prompts-live self-test, ng067, page-furniture clipboard), 34, 36, 37, 38, 40, 41 (every-run defects: customize-inert, start-failure copy, pan04 focus, ng-023 ranking, site-identity app-menu, first-boot overflow TypeError). Each fix lands with its gate row green and its WINDOWS.md entry closed by the fix.
  - **59-04 (here, with Chris):** OWNER-PASS §1–§5 and §13: GitHub and Cloudflare remainder (CF-01, CF-02), MAR key ceremony (CF-03), legion runner with the one `/etc/nixos` change (CF-04), ledger amendments NG-075..080 run by Chris (CF-12). Depends on nothing.
  - **59-05 (here, with Chris):** OWNER-PASS §6–§10 and §12: local release build (CF-05), Anthropic workspaces and caps (CF-06), drills (CF-07), first Linux release (CF-08, R12/R13), Nix channel (CF-09), TEL-13 switch-on (CF-11). Depends on 59-04 (keys, runner) and 59-02 (57-08 before TEL-13). §11 Windows is excluded (D-06).
  - **59-06 (here, with Chris):** D-02's checklist and verify-work runs. Depends on the lanes being merged and a dev objdir built from the merged tree.
  - **59-07 (here):** CF-16 Stage F (rebuild dev and release objdirs, build the N+1 MAR, run the hop), `--build` and `--gate`, re-dating under D-09, v1.6 close-out under D-10, the single push gate. Last and single.
- **D-05:** Waves: wave 1 = 59-01, 59-02, 59-03 lanes running at once beside 59-04 here; wave 2 = 59-05 and 59-06, alternating on Chris's attention; wave 3 = 59-07. Ceilings that do not parallelize: owner checkpoints (one Chris), the GUI checklist (one display), the gate (merged tree), Gecko builds (one at a time, about 50 minutes each).
- **D-06:** CF-10 (Windows 11 VM, ISO, licence, disk, `build-windows`) is out of Phase 59 and re-dated under D-09. Linux ships alone (R2 and the 2026-11-01 ruling).
- **D-07:** A lane is an Orca child workspace of this one, branched from `ServerDestroyer/v1.7-Orca-integration`, with a Claude agent started by `orca worktree create --repo id:321a0514-fcf8-456c-b66d-084bc1ebb684 --name <lane> --parent-worktree active --base-branch ServerDestroyer/v1.7-Orca-integration --agent claude --prompt "<brief>" --json`. The brief names exactly one PLAN.md, forbids edits to STATE.md, ROADMAP.md, WINDOWS.md and the ledger, and requires atomic commits plus the plan SUMMARY on the lane branch. Lanes that run `--quick` need their own `upstream/` (reset with `git -C upstream reset --hard && git -C upstream clean -fd` before `scripts/apply-patches.sh`), `node scripts/generate.mjs`, and the audited Theia install from `docs/BUILD.md`; 59-01 needs none of that.
- **D-08:** Lanes merge into the v1.7 branch one at a time in the order 59-01, 59-02, 59-03 by the coordinating session, which stages new files before trusting the brand scan and re-runs `--quick` after each merge. Lane SUMMARY stub rows are reconciled at merge time, as in the v1.5 lanes run.
- **D-09:** One owner date for every entry still open after the fixes, named by Chris in the box when 59-07 runs the gate. Each entry keeps its own WINDOWS.md id and its `GATE_KNOWN_OPEN_EXCLUSIONS` row; an entry closes only with its fix. Covers WINDOWS.md 25, 26, 29, 32, 35, CF-10, and any owner step that fails live.
- **D-10:** v1.6 closes inside 59-07, after the owner pass and the gate: `--ws deploy` override closeout per R1/R16, tag `v1.6` locally. — Reversibility: one-way — a pushed tag is a published contract; this is why the push is gated.
- **D-11:** Nothing is pushed during Phase 59. 59-07 asks Chris once for the whole set: `main` (including the v1.5 close-out commits that are still local), tags `v1.5` and `v1.6`, and `ServerDestroyer/v1.7-Orca-integration` (CF-19).

### Claude's Discretion

Exact probe per OWNER-PASS section, SUMMARY wording, lane brief text, the order of fixes inside 59-03, and whether 59-03 opens sub-lanes if its 11 rows prove independent (same disjoint-file rule). Open owner values (postal address for `/privacy`, Email Routing mailbox, two Anthropic spend caps, Cloudflare payment method) are collected at the checkpoint that needs them, not asked up front.

### Deferred Ideas (OUT OF SCOPE)

- PROMPT-03 tab dialog host (backlog 999.3, WINDOWS.md 26) — stays backlog; re-dated at 59-07.
- Deviations WINDOWS.md 25 (address-bar-live self-test plant) and 29 (extension options page in private windows) — re-dated at 59-07, not fixed in Phase 59.
- UAT sheets with pending results (WINDOWS.md 35, NG-089) — re-dated at 59-07.
- Windows VM and unsigned Windows release (CF-10) — re-dated at 59-07 (D-06).
- macOS (phase 55, R4), Flathub/winget/Homebrew (R6), installer artwork (A7), ESR 175 tasks (R5) — keep their recorded deferrals.
</user_constraints>

<phase_requirements>
## Phase Requirements

No v1.7 requirement id maps here. The work items are the inventory ids below (source: `.planning/CARRY-FORWARD-v1.7.md` §4, `.planning/ROADMAP.md` backlog 999.28–999.31, `.planning/WINDOWS.md` 25–43).

| ID | Description | Plan | Research Support |
|----|-------------|------|------------------|
| CF-14 | Record live state in 41-04, 42-04, 43-05, 47-04, 48-05 SUMMARYs | 59-01 | Plan-by-plan SUMMARY inventory below: two SUMMARYs do not exist |
| CF-15 | Device-flow token input; 57-08 `clearEnv`; `/etc/nixos` Codeberg block | 59-02 | Script regions, 5 red lines, catalogue-renumber rule, `/etc/nixos` not visible to agents |
| 999.28–999.31 / WINDOWS 27, 28, 34, 36–43 | 11 harness or product defects | 59-03 | Per-row repro, gate row, files and code regions; two share one root cause |
| CF-01..CF-04, CF-12 | OWNER-PASS §1–§5, §13 | 59-04 | Per-section done/remaining/proof table |
| CF-05..CF-09, CF-11 | OWNER-PASS §6–§10, §12 | 59-05 | Same table; CF-11 conflicts with owner decision 9 (Open Question 2) |
| CF-17 (checklist, verify-work 29/30/31, 46 rows) | v1.5 human checks | 59-06 | 41 items by section; 29/30/31 have no UAT file, only VERIFICATION human items |
| CF-13, CF-16, CF-19 and v1.6 close-out | Stage F, gate, re-dating, close, push | 59-07 | Gate mechanics, re-date mechanism gap, close-out chain |
| CF-10, WINDOWS 25, 26, 29, 32, 35 | Deferred | 59-07 | Re-date only |
</phase_requirements>

## Summary

Phase 59 adds no library and no pattern; it executes a closed inventory. The tree is in a good starting state: in this worktree `scripts/verify-platform.sh --quick` ran green this session (328 PASS, 0 FAIL, 5 SKIP, 6 min 47 s wall, so each "re-run `--quick` after each merge" costs about 7 minutes), `fixer-isolate-self-test` passes (the CONTEXT note that it fails is stale; commits 63b4b544 and c75c9a0d fixed it), and `upstream/`, `generated/` and a built `theia/` already exist here. This worktree has no `objdir/`, which is the main planning constraint for every live-GUI step (59-03 verification, 59-06, 59-07).

Four findings change the plans as written in CONTEXT. (1) The `repo-controls` run shows 5 unreadable installation lists, one per installation: `slack`, `claude`, `powerbrowser-bot`, `powerbrowser-clock` and `cloudflare-workers-and-pages`. The DEVICE-FLOW design in 41-04 Task 3 provides token variables for only the two Apps the owner owns; three are third-party. (2) TEL-13 (CF-11, §12) is gated by owner decision 9 on "the first Windows release has shipped", which D-06 excludes. (3) D-11 (no push) conflicts with the first Linux release (§9 dispatches `release.yml` on GitHub `main`) and with `ng074-ci-green-on-main` (needs a `verify.yml` run on a pushed head). (4) `v1.5` is already on `origin` (`refs/tags/v1.5`), and `main` is only 2 docs commits ahead of `origin/main`; D-11's description of the pending push set is out of date.

Two of the 11 defects in 59-03 share one root cause that was read in code: `TheiaService._resolveConfigDir()` returns `<profile>/powerbrowser-theia` when a profile dir exists, so harnesses that write under `$XDG_CONFIG_HOME/powerbrowser` (WINDOWS 34, 36) are testing a path the product no longer reads. Closing a WINDOWS.md entry has a CLI (`windows fixed <id>`); re-dating a still-open entry has none, and the schema has no date field (Open Question 4).

**Primary recommendation:** Plan 59-02 and 59-03 around "what can be proven in a lane without an objdir" (self-tests, `--only` text rows, `PB_FIREFOX_BIN` against main's binary for Theia-side changes), and start one dev `./mach build` in the coordinating tree at the very start of wave 1 so 59-06 and 59-07 are not serialised behind a 50-minute build. Put the four Open Questions to Chris in the box before 59-04/59-05 reach the conflicting steps.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| SUMMARY records (59-01) | Planning docs (`.planning/workstreams/deploy/phases/*`) | — | Docs only, no build |
| Live-org verification row (`repo-controls`) | Node script reading GitHub via `gh api` | Owner shell (token env) | Token is minted by the owner, passed as `GH_TOKEN` to one `gh` child |
| Crash-client env clear | Chrome-side boundary `PowerBrowserAPI.sys.mjs` | Static gate (`--quick`) | Hard rule 2: Firefox internals only through the boundary file |
| NixOS runner, libvirt, tmpfiles, Codeberg timer | Host config `/etc/nixos` (root, Chris) | Prepared snippet in the repo | Claude cannot `pkexec`; `/etc/nixos` is not visible in the agent sandbox |
| Defects 27, 38, 41 | Theia frontend extension `chrome-bar` | Live harness | Theia-side, `yarn build` |
| Defects 34, 36 | Harness (verify script / registry check) | Chrome shell `TheiaService.sys.mjs` | Harness wrote to a dir the product no longer reads |
| Defects 28, 39, 42, 43, 37, 40 | Live harness (timing, probe handle, expectation) | Product (28, 40 not separated) | Cause not isolated in the backlog text |
| WINDOWS.md closure and re-dating | Coordinating session | `gsd-tools windows` | D-04: lanes may not edit WINDOWS.md |
| Owner steps | Chris (GitHub UI, Cloudflare, Anthropic Console, pkexec) | Claude probes after "done" | D-01 |

## Standard Stack

No external package is installed or recommended in this phase. **Package Legitimacy Audit:** not applicable (no `npm`/`pip`/`cargo` install). The only toolchain is what the repo already pins: `nix develop .#theia` (Node, yarn, inkscape), `nix develop .#firefox` (rustc, clang), `gh`, `node`, `python3` for `scripts/ledger-amend.py`, `podman` (§6), `wrangler` via `nix run nixpkgs#wrangler` (owner steps).

### Existing tooling to reuse (not build)

| Need | Use | Where |
|------|-----|-------|
| One verification registry | `scripts/verify-platform.sh --quick \| --only <label> \| --build \| --gate` | CLAUDE.md; `--gate` cannot combine with `--quick`/`--only` (FINISH-PLAN §6) |
| Renumber catalogue lines after an edit of `PowerBrowserAPI.sys.mjs` | `node scripts/verify-ng-040-internals-catalogue-lines.mjs --fix` | its header: "Any merge that edits PowerBrowserAPI.sys.mjs runs it." `--fix` never writes a row, so the new `Services.env.set` row is by hand |
| Close a WINDOWS.md entry | `gsd_run windows fixed <id>` | `~/.claude/gsd-core/bin/lib/broken-windows.cjs:1067-1085` (`cmdWindowsMarkFixed`, then `markFixed` sets `status: 'fixed'` and `resolved_at`; `assertOpen` makes it single-use) |
| Real OS input and screenshots | `scripts/lib/pb-kwin.mjs` (not `scripts/pb-kwin.mjs`; that path does not exist) with `PB_REAL_INPUT=1 PB_LIVE_HEADED=1` | header: "Every call here needs the Bash sandbox off (session D-Bus, the user journal, /run/ydotoold/socket)" |
| Run a worktree's Theia against another checkout's binary | `PB_FIREFOX_BIN` and `PB_BACKEND_MAIN` | `scripts/lib/firefox-bidi.mjs:40-44`: "Chrome-side .sys.mjs changes still load from the main checkout, because objdir/dist/bin symlinks into it." |
| Ledger changes | `python3 scripts/ledger-amend.py drop ...` run by Chris | OWNER-PASS §13; a PreToolUse hook rejects Bash text naming the ledger directory, so agents read ledger files with the Read tool |

## Architecture Patterns

### System Architecture (phase flow)

```
wave 1 (parallel)                          wave 2                  wave 3
 lane 59-01 docs ──merge 1──┐
 lane 59-02 code ──merge 2──┤                                       
 lane 59-03 code ──merge 3──┤──► merged tree ──► 59-06 GUI pass ──┐
 here  59-04 owner §1-5,13 ─┤       │            (display+Chris)   │
        (§1.9 and §5 need 59-02)    └──► 59-05 owner §6-10,12 ────┤──► 59-07: Stage F builds
                                          (needs 59-04 keys,runner,│     --build, --gate, re-date (D-09),
                                           59-02's 57-08)          │     v1.6 close (D-10), push ask (D-11)
 coordinating session alone writes STATE/ROADMAP/WINDOWS/ledger; one dev objdir build (~50 min) must exist
 before 59-06 and 59-03's live proof
```

### Recommended lane layout

- Plan files live under `.planning/workstreams/orca/phases/59-carry-forward-from-v1-5-and-v1-6/59-0N-PLAN.md`. They must be **committed on `ServerDestroyer/v1.7-Orca-integration` before `orca worktree create`**, because the lane sees only the tree it branches from (`.planning/workstreams/orca/state.json` is currently untracked and must not ride along).
- `orca worktree create --help` confirms `--repo`, `--name`, `--agent`, `--prompt`, `--base-branch` exist [VERIFIED: command output this session].

## Per-plan research

### 59-01 (lane, docs only): CF-14 record the live state

Plan directories and SUMMARY state [VERIFIED: `ls`, this session]:

| Plan | PLAN.md | SUMMARY.md | Action |
|---|---|---|---|
| 41-04 | `phases/41-repository-controls-and-github-apps-a/41-04-PLAN.md` (474 lines) | **absent** (phase has 41-01..03, 41-05..07 SUMMARYs) | create a new partial SUMMARY |
| 42-04 | `phases/42-community-surface-and-release-documentation-a/42-04-PLAN.md` | present (`status: partial`, Task 1 only) | append a section |
| 43-05 | `phases/43-release-train-skeleton-and-upstream-bump-automation-a/43-05-PLAN.md` | present (`status: partial`) | append a section |
| 47-04 | `phases/47-hosting-website-and-mail-d/47-04-PLAN.md` (227 lines, 2 tasks) | **absent** (phase has 47-01..03) | create a new partial SUMMARY |
| 48-05 | `phases/48-error-telemetry-maintenance-sweep-and-watchdog-d/48-05-PLAN.md` | present (`status: partial`, with an "Operator record (to be filled by Task 3; empty on purpose)" table whose six rows read `none yet \| open`) | append, and fill that table's rows that were done live |

Sibling SUMMARY frontmatter shape (read from 42-04 and 48-05): `phase`, `plan`, `subsystem`, `tags`, `requires`, `provides`, `affects`, `status: partial`, `actuals` (`tokens`, `tasks`, `commits`), `plan_head_before`, `plan_head_after`, `key-files`, `key-decisions`, `requirements-completed: []` (kept empty on purpose: "TEL-06, TEL-10, ... are live only after Tasks 2 and 3"). Body: `# Phase NN Plan NN: <title> Summary`, "Deviations from Plan", "Not executed", "Self-Check". Template files exist at `~/.claude/gsd-core/templates/summary*.md`.

Rules for the executor: keep `status: partial` and `requirements-completed: []` (the plans are not complete; a SUMMARY file that records partial work already has precedent, STATE.md: "A SUMMARY can record a partial plan"); record only what CARRY-FORWARD §2 "Live state at parking" lists, without re-doing it; never put a key, token or id beyond what the operator record allows; commit with explicit paths (`.planning/` has concurrent-session history).

Content map, from CARRY-FORWARD §2 "Live state at parking" (read verbatim this session):

| Target SUMMARY | Done live (record) | Parked (record as open) |
|---|---|---|
| 41-04 | §1: Apps `powerbrowser-bot` (5633681) and `powerbrowser-clock` (5633729) installed; claude/slack limited to the other 30 repos; `apply-repo-controls --yes` (25 writes); labels; tag probe refused; runner group restricted to `release.yml@main`; `BOT_APP_ID`, `BOT_APP_CLIENT_ID`, `OWNER_LOGIN`; bot key in environments bot, release, descriptor and in `powerbrowser-updates`; Cloudflare Pages App declared | App-list reads (5 red lines), DEVICE-FLOW; notifications and HarmonySprings drills (CF-02) |
| 42-04 | Email Routing security@/contact@/privacy@ to christopher@deocracy.org, three test mails arrived; policy files repo-level only (no org defaults in `Deocracy/.github`); security.txt to 2027-10-06; labels | postal address for `/privacy` (open value) |
| 43-05 | bot App and its variables; scheduler repo `Deocracy/powerbrowser-scheduler` scaffold (bundles; not deployed) | Clock App private key then scheduler deploy (`CLOCK_PRIVATE_KEY` as PKCS#8) and dry-run train dispatch; watchdog in `powerbrowser-updates` stays disabled until the clock ticks |
| 47-04 | §2: zone on Cloudflare; Pages `powerbrowser-website` (powerbrowser.org, www) and `powerbrowser-updates` (updates.powerbrowser.org) Git-linked; four pages byte-equal, 404 page live; update rule is six placeholders plus a splat (ten never match on Pages, 51da41bc); security.txt; Email Routing | Cloudflare token `powerbrowser-claude` rotation (CF-13, RENEWALS row) |
| 48-05 | §3: events Worker on events.powerbrowser.org with D1 `powerbrowser-events` (probes 200 synthetic, 413, 429); `DOWNLOAD_COUNT_SECRET` in Worker and bot environment; one zone rate-limit rule, 10 per 10 s per IP (the Free-plan form of the 60/min ruling); maintenance issue #7 pinned; watchdog applied (disabled); synthetic probe secret set and probed; crash Worker and `powerbrowser-crash-reports` bucket (57 B3) | 26-hour watchdog drill; red-row plant; `tel06-error-delivery-live` on a clean tree (WINDOWS 33); `GH_PAT` for the status repo |

Note for the 41-04 and 47-04 SUMMARYs: the 42-04 SUMMARY already warns that plan text names `DeBIOS-Foundation` while the live org is Deocracy; use Deocracy.

### 59-02 (lane, code): CF-15

**(a) Device-flow token input for `repo-controls` app-list reads**

- Script: `scripts/verify-repo-controls.mjs` (1442 lines). Registry row `repo-controls` at `scripts/verify-platform.sh:6282`, `repo-controls-self-test` next to it. The read helper is `ghGet(path, exec = execFileSync)` at lines 67-79, calling `gh api -H <version header> <path>`; `safeGetter` (lines 85-104) wraps every getter, caches by `path` only and passes only `path`. List reads are in `compareApps` at the `APP_REPOS_PATH.replace('{id}', ...)` calls (undeclared Apps around line 445, declared Apps around line 475) with `const APP_REPOS_PATH = 'user/installations/{id}/repositories?per_page=100';`. `process.env` is not referenced anywhere in the file (grep this session), so the token input does not exist yet.
- Live run this session (read-only): `repo-controls: FAIL -- 5 problem(s) between .github/settings/ and the live state of Deocracy/powerbrowser`. The five lines are the installation list reads for `slack` (33034224), `claude` (128186338), `powerbrowser-bot` (179057695), `powerbrowser-clock` (179057965) and `cloudflare-workers-and-pages` (179399956). The 403 text for the declared three: "You must authenticate with an access token authorized to a GitHub App, a personal access token, or basic auth in order to list repositories for an installation. (HTTP 403)".
- Specification already written, in `41-04-PLAN.md` Task 3 (lines 343-345, quoted): "`ghGet(path, token)`: when `token` is given, run gh with `GH_TOKEN` set to it in that one child's environment. Never print, log or return the token."; "Add a `runChecks` override `env`, defaulting to `process.env`. In the `apps` control, the `user/installations/<id>/repositories` read for App `<slug>` passes `env.REPO_CONTROLS_TOKEN_<SLUG>` as its token. `<SLUG>` is the slug upper-cased with `-` turned into `_`: `REPO_CONTROLS_TOKEN_POWERBROWSER_BOT` and `REPO_CONTROLS_TOKEN_POWERBROWSER_CLOCK`. No other read takes a token."; "With the variable unset, the read runs with the owner token as before. A refusal stays a FAIL whose next step names the variable and the RELEASING.md subsection \"App installation read-back\". It never skips and never passes."; self-test: "Add one plant: with `env` holding a planted bot token, the fake getter must receive that token for the bot installation's repositories path and no token for any other path. Its ok line names `REPO_CONTROLS_TOKEN_POWERBROWSER_BOT`." Docs: RELEASING.md subsection "### App installation read-back" with the re-run procedure; owner mints tokens by device flow (41-04 Task 4, lines 406-412: enable Device Flow on the App, `curl ... https://github.com/login/device/code`, authorize at `https://github.com/login/device`, export, run, `unset`, revoke); the token expires after 8 hours.
- **Implementation traps found in the code:** (1) `ghGet`'s second parameter is the injected `exec` used by the self-test at lines ~1297-1323 (`ghGet(alertsPath, exec)`), so the token must be a third parameter or an options object; the spec's `ghGet(path, token)` signature would break those self-test calls. (2) `safeGetter` caches by `path` and calls `get(path)`; the token has to be threaded through `ctx.get` (for example `ctx.get(path, { token })`) and the cache key left as the path. (3) The spec names two variables, but five installations are unreadable, and three Apps (`slack`, `claude`, `cloudflare-workers-and-pages`) are third-party; the owner cannot enable device flow on an App they do not own (`app-cloudflare-workers-and-pages.json` has `"third_party": true`). See Open Question 1.
- Gate rows that prove it: `scripts/verify-platform.sh --only repo-controls-self-test` (lane-safe, no network), `node scripts/verify-repo-controls.mjs --self-test`; the live `--only repo-controls` row needs the owner's tokens and runs in 59-04, not in the lane.

**(b) Plan 57-08** (`.planning/workstreams/deploy/phases/57-native-crash-reporting-k/57-08-PLAN.md`, `status: blocked`, `blocked_on: "powerbrowser/shell/PowerBrowserAPI.sys.mjs is held by another session's uncommitted work"`; the blocker is gone: `git log -1 -- powerbrowser/shell/PowerBrowserAPI.sys.mjs` is 0d36abaf and the working tree is clean). Two tasks:

1. Task 1: add `clearEnv(name)` (`Services.env.set(name, "")`) next to `getEnv`; call it with `"MOZ_CRASHREPORTER_AUTO_SUBMIT"` as the first statement of the single-instance handler's `handle()`; add the `Services.env.set` catalogue row; verify with `bash scripts/check-internals-boundary.sh`, `... --catalogue`, `... --self-test`.
2. Task 2: write `scripts/verify-crash-autosubmit-env.mjs` in the shape of `scripts/verify-crash-autosubmit-lock.mjs` (text reads over `upstream/`, `--self-test`, derives names at check time, six planted faults: call removed, call moved after other work, different name, boundary method setting a non-empty value, `config.rs` reading a renamed key, `env_bool` changed to treat any set value as true); append registry rows `crash-autosubmit-env` and `crash-autosubmit-env-self-test` (the neighbours are at `verify-platform.sh:3802` and `:3805`); update `docs/CRASH-POLICY.md` with the pre-handler limit; close the B6 env bullet in the 57 `BLOCKED.md`. Verify: `node scripts/verify-crash-autosubmit-env.mjs && node scripts/verify-crash-autosubmit-env.mjs --self-test && node scripts/generate.mjs && scripts/verify-platform.sh --quick`.

Tree facts, read this session:

- `powerbrowser/shell/PowerBrowserAPI.sys.mjs:422-424`: `getEnv(name) {` / `return Services.env.get(name);` (the insertion point). The handler is `export class PowerBrowserSingleInstanceHandler` at line 4454 with `handle(cmdLine) {` then `try {` as its first statement; registered by `powerbrowser/shell/components.conf` (`"constructor": "PowerBrowserSingleInstanceHandler"`).
- Client source the gate must derive from, `upstream/toolkit/crashreporter/client/app/src/config.rs`: line 177 `self.auto_submit = env_bool(ekey!("AUTO_SUBMIT"));` and lines 679-681 `fn env_bool<K: AsRef<OsStr>>(name: K) -> bool {` / `std::env::var(name).map(|s| !s.is_empty()).unwrap_or(false)` / `}`. An empty value is false, which is why the clear sets `""`.
- **Line-number cascade.** `powerbrowser/INTERNAL-APIS.md` Touchpoints rows carry `PowerBrowserAPI.sys.mjs:<line>` (the `getEnv` row says `PowerBrowserAPI.sys.mjs:423`). Inserting a method above hundreds of later rows shifts them all; the registry rows `ng-040-internals-catalogue-lines` (and `internals-catalogue`) go red until `node scripts/verify-ng-040-internals-catalogue-lines.mjs --fix` is run. If 59-03 also edits `PowerBrowserAPI.sys.mjs`, both lanes shift lines and the merge needs the same `--fix`. Run `--fix` after every merge that touches the file.
- Chrome JS startup cache: a live check of the clear needs `-purgecaches` (CLAUDE.md memory and BUILD.md Tier 1). The live proof (start the reporter-enabled build with `MOZ_CRASHREPORTER_AUTO_SUBMIT=1`, crash a content process, see the dialog) belongs to the TEL-13 reporter-enabled build, not to this lane.
- The constant `const CRASH_REPORTER_ENABLED = false;` is at `scripts/generate.mjs:1550` (the TEL-13 flip is one edit there; not this plan).
- Parked in CARRY-FORWARD after 57-08: "`configuration.toml [urls].crash_report` and its allowlist row (Claude, after 57-08)". `grep crash configuration.toml` shows no `crash_report` key today (line 103 is only a telemetry comment); 57 BLOCKED B3 says the value is `"https://crash.powerbrowser.org/submit"` and the allowlist row needs `manifest: "urls.crash_report"`; the `theia-endpoints` gate forbids adding the row before the key. Not named in D-04's 59-02 text; decide whether it rides in 59-02 (it only matters for TEL-13) or is re-dated with it (Open Question 2).

**(c) `/etc/nixos` Codeberg-mirror block as a prepared diff**

- Source text: `.planning/workstreams/deploy/phases/53-support-operations-g/BLOCKED.md`. Item 2 steps 1-5 (the root commands creating `/etc/codeberg-mirror/mirror-push`, `/var/lib/codeberg-mirror/powerbrowser.git`, remotes `origin` and `codeberg`, the scoped credential helper) and step 3: "Apply `systemd/codeberg-mirror.service` and `systemd/codeberg-mirror.timer` through `/etc/nixos` (`pkexec bash -c '...nrs \"apply codeberg mirror timer\"'`)". The units exist in `systemd/` (service: `Type=oneshot`, `DynamicUser=yes`, `StateDirectory=codeberg-mirror`, `LoadCredential=mirror-push:/etc/codeberg-mirror/mirror-push`, `TimeoutStartSec=15min`; timer: `OnCalendar=daily`, `Persistent=true`). OWNER-PASS §3e: "Open item: no file contains the `/etc/nixos` block that turns `systemd/codeberg-mirror.service` and `.timer` into NixOS config (53 BLOCKED.md:49). Claude writes and checks it against the nixos MCP before you reach this step."
- **Scope is larger than D-04's 59-02 text.** OWNER-PASS "Open values" A11 (settled): "libvirt, the runner, the Safe Browsing key directory and the Codeberg timer go in one `/etc/nixos` change at step 5". CF-04 says the same. The runner block is in `docs/RELEASING.md` (`services.github-runners.powerbrowser-release = {` at line 427), the libvirt block in 54 `BLOCKED.md:112-140`, and OWNER-PASS §5.3 says the `systemd.tmpfiles.rules` entry for `/var/lib/powerbrowser-release` (group `pb-runner`, mode 0750, chris in the group; file `sb-gapi.data` mode 0440) "Open item: no file contains this rule yet; Claude writes it and checks it against the nixos MCP first". Recommend 59-02 delivers one self-contained snippet containing all four, so Chris makes one `nrs` run.
- **`/etc/nixos` is not visible to agents here:** `ls /etc/nixos` → "No such file or directory" in this session (both `grep` and `git -C /etc/nixos` failed). A true unified diff against the live `configuration.nix` cannot be generated by the lane. Deliver a snippet file (for example `systemd/nixos-legion-pb.nix.snippet` or under `docs/`) plus exact insertion instructions, not a `.patch`. Verify every option name with the `nixos` MCP (`mcp__nixos__nix`) before writing, per the user's global NixOS rules; prove it evaluates before the switch (Chris runs `nixos-rebuild dry-build` under `pkexec`).
- The file must never be applied by Claude and must contain no token or path to a secret value; the credential file is created by the root commands in step 2.

### 59-03 (lane, code): backlog 999.28-999.31, 11 rows

Mechanics common to all rows:

- `GATE_KNOWN_OPEN_EXCLUSIONS` is at `scripts/verify-platform.sh:6499`. Row format `label|ledger_id|reason`. In `--gate`, a failed label that matches an exclusion is excused only while `ledger_entry_is_open <id>` is true (it reads the JSON block of `.planning/WINDOWS.md` and requires `status === "open"`); otherwise it prints "FAIL (exclusion no longer applies): ... this check must be green now, not silently excused". So closing the entry turns the row red if the fix is incomplete, which is the intended proof. The exclusion line itself may stay.
- WINDOWS.md ids bind by number. The table of rows in the gate that map to these 11 entries: `verify-customize-inert|34`, `start-failure-shows-error|36`, `pan04-undo-close-group-live|37`, `ng-023-suggestions-history-bookmarks|38`, `prompts-live-self-test|39`, `site-identity-live|40` and `site-identity-live-self-test|40`, `first-boot-surface-fresh|41`, `ng067-frontend-errors-reach-telemetry|42`, `page-furniture-live-self-test|43`, `page-tools-live|28`. **Entry 27 has no exclusion row:** `nav-keys-live` (`verify-platform.sh:6129`) passes because `realLongPress` records "finding: a real Escape left the history menu open" as a note and closes the menu through the node; its proof is the headed command `PB_REAL_INPUT=1 PB_LIVE_HEADED=1 node scripts/verify-nav-keys-live.mjs --scenario long-press`.
- **Lanes may not edit WINDOWS.md (D-04/D-07) but D-04 also says "WINDOWS.md entry closed by the fix".** Resolve as: the lane lists, in its SUMMARY, the ids its fixes close; the coordinator runs `gsd_run windows fixed <id>` at merge, then re-runs the affected `--only` rows.
- **No objdir in this worktree** (`ls objdir` fails; only `/home/chris/coding/Power-Browser` and `/home/chris/gsd-workspaces/deploy/Power-Browser` have one). Every row below except the self-test-only parts is a live app check. `scripts/lib/firefox-bidi.mjs:44` is `FIREFOX_BIN = process.env.PB_FIREFOX_BIN || join(REPO_ROOT, 'objdir', 'dist', 'bin', 'powerbrowser')`; with `PB_FIREFOX_BIN` (main's binary) plus `PB_BACKEND_MAIN` (this worktree's Theia build) a lane can prove Theia-side and harness-side fixes. Chrome-side `.sys.mjs` and `.js` edits still run main's copy. The registry's own app checks (for example `start_shell` at `verify-platform.sh:386`, `local bin="$REPO_ROOT/objdir/dist/bin/powerbrowser"`) take no override. A tier-3 `./mach build` per lane is 40-54 minutes and about 14 GB (docs/BUILD.md rows #4 and #5: 2388 s dev). See Open Question 3.

Per-row detail (repro verbatim from ROADMAP.md backlog rows and WINDOWS.md; regions read this session):

| WINDOWS | Backlog | Gate row / repro | Cause so far (backlog) | Files and regions read |
|---|---|---|---|---|
| 27 | 999.28 | `PB_REAL_INPUT=1 PB_LIVE_HEADED=1 node scripts/verify-nav-keys-live.mjs --scenario long-press` (no registry exclusion) | "the release on the pill moves focus there" | `theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx`: `onNavPointerDown` (about line 972-996, the 500 ms hold calls `this.openHistoryMenu(button)`), `openHistoryMenu` (1074-1111: `this.menus.render({... onHide: () => setTimeout(() => { if (!chosen) { button.focus(); } }) })`). Lead: open the menu with focus placed in the menu, or restore focus off the pill on open; harness `scripts/verify-nav-keys-live.mjs` `realLongPress` (about 745-790) already works around it with a "finding:" note, which should become a failure once fixed. Ledger-comment at `chrome-bar-widget.tsx:976` |
| 28 | 999.29 | `node scripts/verify-page-tools-live.mjs --scenario crash-navigate`; row `page-tools-live` | "not isolated" | `scripts/verify-page-tools-live.mjs`: `crashNavigate` (1930-1941), failure text at 1938 `'a URL sent to a crashed tab did not load it (no loaded push with crashed false)'`, 30 s `waitForPush`; scenario map entry at 2120. Flaky 1 of 3 registry runs; needs repeated runs to isolate |
| 39 | 999.30 | `scripts/verify-platform.sh --only prompts-live-self-test` | "the 39-09 re-site (999.13) does not reach the plant's failure reliably" | `scripts/verify-prompts-live.mjs`: plant `allow-loads-frame-url` at line 1336, plant table entry at 2020 (`expect: 'Allow opened a frame-supplied URL'`), the wrong-reason text `NOT_NEXT = 'popup not adopted next to its opener'` at 178; neighbouring plant `adopt-next-to-opener-failed` (2022) |
| 42 | 999.30 | `--only ng067-frontend-errors-reach-telemetry` | "not isolated" | `scripts/verify-ng-067-frontend-errors.mjs`: the 10 s `waitFor` on `window.__ng067.logged.includes('frontend.uncaught-error')` at line 58 (second at 69) |
| 43 | 999.30 | `--only page-furniture-live-self-test` | "headless clipboard read-back timing" | `scripts/verify-page-furniture-live.mjs` 1365-1371: `return fail('Copy Image Link did not put the image URL on the clipboard');` |
| 34 | 999.31 | `--only verify-customize-inert` | "the script writes `$XDG_CONFIG_HOME/powerbrowser/customize.css`; the supervised frontend may read another config dir" | `scripts/verify-customize-inert.mjs:63-64`: `const CONFIG_DIR = join(process.env.XDG_CONFIG_HOME \|\| join(homedir(), '.config'), 'powerbrowser');`. **Root cause evidence:** `powerbrowser/shell/TheiaService.sys.mjs:615-624` `_resolveConfigDir()` returns `${profileDir}/powerbrowser-theia` when `PowerBrowserAPI.getProfileDir()` is non-empty and only otherwise `${base}/powerbrowser`; line 839 passes that value as `THEIA_CONFIG_DIR`. The harness writes the XDG path the product no longer uses. Fix is in the harness (derive the dir from the launched profile) |
| 36 | 999.31 | `--only start-failure-shows-error` | "the 3000 ms readiness backstop fires first" | Check at `scripts/verify-platform.sh:1539-1690` (`check_start_failure_shows_error`); the plant puts a regular file at `$poison_home/powerbrowser` and exports `VERIFY05_XDG_CONFIG_HOME`. The product step is `TheiaService.sys.mjs:285` `await PowerBrowserAPI.ensureDirectory(this._configDir)` with "Failed step", "creating the settings folder". Same root cause as 34: with a profile dir present `_configDir` is `<profile>/powerbrowser-theia`, so the XDG plant never fails `ensureDirectory`, the stub backend never announces readiness and the 3000 ms `startupTimeoutMs` backstop produces the observed text. `start_shell` already takes a `profile_override` ("the fixture must know the profile path BEFORE the launch", around line 380); the plant should be a regular file at `<profile>/powerbrowser-theia`. Fix is in the check, not the product |
| 37 | 999.31 | `--only pan04-undo-close-group-live` | "second Organising widget instance or a stale probe handle" | `scripts/verify-pan04-undo-close-group-live.mjs:464` (`expect(g4d.onNew && g4d.left === 0, ...)`); the probe compares `document.activeElement === org.node.querySelector('.pb-org-new')`, so a stale `org.node` handle gives exactly the observed "focus is on pb-org-new" message. Re-resolve `org` inside the settle loop |
| 38 | 999.31 | `--only ng-023-suggestions-history-bookmarks` | "provider order puts bookmarks first; not traced" | `scripts/verify-ng-023-suggestions-places.mjs:55-58` (check) vs `theia/extensions/chrome-bar/src/browser/chrome-bar-places-suggestions.ts:29-60`: as read, `searchByPrefix` pushes open-tab rows first (only those whose URL is shown by a live `WebTabWidget` with `hasPage`), then place rows, so the file orders tabs first by construction. The observed bookmark-first order is not explained by this file; trace which service the harness's `diCall(... 'ChromeBarSuggestionService', 'searchByPrefix' ...)` resolves (binding at `chrome-bar-frontend-module.ts:79` `bind(ChromeBarSuggestionService).to(ChromeBarPlacesSuggestions)`), and whether the open tab row is dropped by the `open` filter at the moment of the first reading |
| 40 | 999.31 | `node scripts/verify-site-identity-live.mjs --scenario app-menu`; rows `site-identity-live`, `site-identity-live-self-test` | "harness expectation or product not separated" | `scripts/verify-site-identity-live.mjs` about 1293-1335 (`wantDisabled`, the disabled-rows compare at about 1310, the STOCK_ROW_PAGES loop for Help → about:support). Needs a live look at which rows 5-8 are and why Help opens no stock window |
| 41 | 999.31 | `--only first-boot-surface-fresh` | `@theia/core` SideTabBar overflow expects `.theia-additional-views-menu` | `theia/extensions/chrome-bar/src/browser/side-panel-top-tabs.ts` (62 lines): `bar.orientation = 'horizontal'` in `createSideBar`, carrying a `shortcut:` comment that the stock overflow menu measures a vertical rail. **Verified source of the TypeError:** `theia/node_modules/@theia/core/lib/browser/shell/tab-bars.js:1179` `const additionalViewsMenu = this.node.parentElement?.querySelector('.theia-additional-views-menu');` followed by `additionalViewsMenu.offsetHeight` at line 1180. Fix in the PB extension only (hard rule 1): provide the element in `createContainer`, or override the overflow measurement for the horizontal bar. Never edit Theia core (`scripts/diff-theia-core.sh`) |

Fix-ordering guidance (Claude's discretion): do 34 and 36 first (one root cause, harness-only, quick proof), then 41 and 27 (small Theia changes, share a `yarn build`), then 37, 40, 38 (need live look), and 28, 39, 42, 43 last (timing; need N repeated runs to prove determinism). Suggested sub-lane split if the rows prove independent: {34, 36, 37, 38, 42, 43, 28, 39, 40} touch only `scripts/verify-*.mjs` and `verify-platform.sh`; {27, 41} touch only `theia/extensions/chrome-bar`. The shared file hazard is `scripts/verify-platform.sh` (59-03's 36 edits `check_start_failure_shows_error` around line 1590; 59-02 appends rows near lines 3802-3805); distinct hunks, but both will be in the merge diff. A `generate.mjs --check`/`yarn build` is required after any Theia-side change.

Proof that a defect is fixed: its `--only <label>` row green three times in a row for the flakes (28, 39, 42, 43: "1 of 3" and "2 of 3" are the recorded failure rates), once for the deterministic ones, plus `--only <label>-self-test` where the label has one. Then `--quick`.

### 59-04 and 59-05: OWNER-PASS sections (checkpoints, with Chris)

Source: `.planning/workstreams/deploy/OWNER-PASS.md` (461 lines). Path caveat: the document says "Run commands from `/home/chris/coding/Power-Browser` (branch `main`)" and uses `$PB=/home/chris/gsd-workspaces/deploy/Power-Browser` for the MAR key tools ("only that objdir has certutil, pk12util and signmar"). Phase 59 runs in the v1.7 worktree: the question-box text must rewrite the working directory for scripts and keep `$PB` for §4. The tag probe (`git push origin "$(git rev-parse origin/main)":refs/tags/v0.0.0-0`) needs an `origin` remote; this worktree has `origin` = `https://github.com/Deocracy/powerbrowser.git` [VERIFIED: `git remote -v`].

"Already done live" comes from CARRY-FORWARD §2 "Live state at parking" and CF-xx rows. Proof column names registry labels that exist at the cited lines of `scripts/verify-platform.sh`.

| § | Heading / deploy plan | Done live (2026-11-07) | Remains | Proof row or command |
|---|---|---|---|---|
| 1 | GitHub: Apps, controls, variables, secrets (41-04 T2, 42-04 T2, 51) | Apps installed, 25 writes applied, labels, tag probe refused, runner group restricted, variables, bot keys, CodeQL default setup (41-04), Pages App declared | step 9 App-list reads (needs 59-02a + owner mints tokens for bot and clock only), step 11 admission read-back (status not recorded; read-only probe), steps 12-13 notifications and drills from HarmonySprings (CF-02), step 14 read-back + the twelve fields; **Stage B step 6, archive the old repo: not done** (`gh repo view DeBIOS-Foundation/powerbrowser` → `"isArchived":false` this session; the `debios` remote still points at it) | `repo-controls` (`verify-platform.sh:6282`), `node scripts/verify-repo-controls.mjs` |
| 2 | Cloudflare and DNS (47-04) | zone, both Pages projects, four pages byte-equal, 404, update rule, security.txt (RENEWALS row dated 2026-11-06), Email Routing three test mails | postal address for `/privacy` (open value), changing the "Open download page" URL to `https://powerbrowser.org/download` and re-running `update-copy` (Claude does it after live), `Deocracy/.github` decided repo-level only | `updates-repo-static` (`:6303`), `updates-repo-static-self-test` (`:5161`), `update-copy` (`:5695`), curl GETs of `/`, `/download`, `/privacy`, `/legal`, `--quick` |
| 3 | Workers and storage (43-05, 48-05, 57 B3, 49-05, 53-04) | R2 buckets, rate-limit rule, events Worker + D1, crash Worker, maintenance issue #7, `R2_MAR_BUCKET`, `CLOUDFLARE_ACCOUNT_ID`, status and scheduler repos created | CF-01: `R2_MAR_WRITE_TOKEN`; clock App key then scheduler deploy (`CLOCK_PRIVATE_KEY` PKCS#8), JWT p95, dry-run train dispatch, `gh workflow enable watchdog.yml -R Deocracy/powerbrowser-updates`; Upptime `GH_PAT` then dispatch and enable Pages for `status.powerbrowser.org`; Codeberg org/repo/token and the root commands; 26-hour watchdog drill (calendar-bound); `tel06-error-delivery-live` on a clean tree (WINDOWS 33) | `events-worker` (`:4859`), `watchdog` (`:5206`), `tel06-error-delivery-live` (`:5738`), `upptime-sweep-live` (`:6320`, `UPPTIME_STATUS_REPO=Deocracy/powerbrowser-status`), `codeberg-mirror-live` (`:6315`, `CODEBERG_MIRROR=Deocracy/powerbrowser`), dry run: `gh workflow run release-train.yml -R Deocracy/powerbrowser --ref main -f reason=owner -f dry-run=true` |
| 4 | Keys (44-01) | nothing (A13: the two primary `.p12` copies do not exist yet) | primary copies to two media, secondary ceremony (`mar-secondary.der`, 4096-bit RSA, `-Z SHA384 -v 240`), release secrets `MAR_SIGNING_P12_B64` and `MAR_SIGNING_P12_PASSWORD`, six lines in `docs/RELEASING.md`; then **Claude code work**: 44-01 Tasks 2-3 (regenerate patch 030, add the ng065 fifth case). That regeneration changes the Gecko patch stack, so run §4 before any objdir that 59-06/59-07 depend on is built | `ng065-mar-signature-enforced` (`:5889`), `gh secret list --env release` dates |
| 5 | legion runner (49-02 T3) | nothing | one `/etc/nixos` change (A11: runner, libvirt, Safe Browsing key dir, Codeberg timer) from 59-02's snippet; hook byte-identical copy; registration token; checks (`sudo -u pb-runner test -r ...` prints nothing); runner acceptance drill on a throwaway `drill/hook` branch (never `main`) | `gh api repos/Deocracy/powerbrowser/actions/runners --jq '.runners[] \| {name, status, labels: [.labels[].name]}'` shows `legion` online with `powerbrowser-release`; needs `repo-controls` green first |
| 6 | Local release build (45-04) | nothing | `podman build -t pb-gecko-build -f powerbrowser/packaging/Containerfile .`, container `./mach build` with `mozconfig.release`, `package-linux.sh`; needs `/var/lib/powerbrowser-release/sb-gapi.data` (created by §5.3); no other `mach build` running (`pgrep -af 'mach build'`); outputs the MAR size and toolchain baseline lines for the website "about 130 MB" line and BUILD.md INF-04 rows | `portable-elf` (`:5874`), `sidecar-no-symlinks`, `package-target-natives`, `ng063-packaged-launch`, `packaged-identity`, `install-matrix` (`:5887`) — the six exclusions of WINDOWS 30 |
| 7 | Anthropic (52-05, 53-04 T2) | nothing | two workspaces and caps (open values), fixer federation rule for `Deocracy/powerbrowser`, `ANTHROPIC_FEDERATION_RULE_ID` and `ANTHROPIC_ORGANIZATION_ID` variables, triage `ANTHROPIC_API_KEY`, local re-run of the 52-04 staged drill | `fixer-prepare-self-test` (`:5546`), `fixer-isolate-self-test` (`:5552`, green here), `triage-workflow` (`:5592`) |
| 8 | Drills (41-04 step 13, 53-04 steps 5-6, 48-05) | nothing | from the second owner account (HarmonySprings, A12): private vulnerability report push, test mail push, test issue fixed-template comment and labels, planted-instruction issue (only the fixed comment, no close) | recorded by hand in the 53-04 twelve fields; no registry row |
| 9 | First Linux release (50-03 T3, 50-04) | `BOT_APP_CLIENT_ID` / `BOT_APP_PRIVATE_KEY` in `powerbrowser-updates` | `withdraw.yml` and `release-probe.yml` into `powerbrowser-updates`, probe run, merge the bump PR, approve `release`, then R13: approve `descriptor` with admin bypass, hop drill, `/download` check; `probe-1` is never deleted (A3) | `channel-live` (`:6289`), `mar-update-hop` (`:5839`), `verify-endpoints` (`:5822`), `bash scripts/verify-endpoints.sh --layer 3`. Depends on the bump PR and on what is on GitHub `main` (Open Question 3) |
| 10 | Nix channel (56-05 T2; Flathub, winget, cask are R6-deferred) | `homebrew-tap` exists, bot App installed on it | hash record into `nix/release-hash.json` path as written (`nix/pkg/release-hash.json`), Cachix licence request and cache or the R2 fallback, `nixConfig` in `flake.nix`, clean-machine build | `flake-repack` (`:5360`), `binary-cache` (`:5385`) with `--release` |
| 11 | Windows | — | **excluded (D-06)**; re-date CF-10, `win-matrix-record`, `win-download-copy` | — |
| 12 | TEL-13 (57-01 T2, 57-04) | receiver deployed on `crash.powerbrowser.org` (probes 200 CrashID, 413, 429) | `--crash-ping`, `--positive-control`, `./mach buildsymbols`, then the `CRASH_REPORTER_ENABLED` flip. **Gated, see Open Question 2** | `crash-ping-consent` (`:3793`), `bash scripts/verify-endpoints.sh --layer 3 --crash-ping` |
| 13 | Ledger (R15) | — | Chris runs six `drop` commands for NG-075..080 with his own `--quote`; NG-081 stays | `python3 scripts/ledger-report.py`, `--quick`. The ledger is frozen to agents; the executor shows the exact lines and the box collects "done" |

"Still open" owner values (OWNER-PASS "Open values and decisions", read verbatim): FINISH-PLAN.md section 3 values: postal address for `/privacy`; destination mailbox for Email Routing and a different sending account (the mailbox is christopher@deocracy.org per CARRY-FORWARD, so this is effectively answered; confirm it is recorded); two Anthropic Console monthly spend caps (fixer, triage); Windows 11 ISO and licence and leave of legion's disk for `pkg-win11` (D-06 excluded); Cloudflare payment method (R2), Workers Paid only if the JWT p95 exceeds 10 ms. A1-A14 are settled and not re-asked.

Internal dependencies the CONTEXT cut hides: 59-04 says "Depends on nothing", but §1 step 9 needs 59-02a merged, §5 needs 59-02's `/etc/nixos` snippet, and §4's patch-030 regeneration must land before the dev objdir that 59-06 uses is built. Sequence inside 59-04: §13, §2, §3, §1 (steps 12-13, 9 after merge), §4, then §5 last. The Cloudflare token `powerbrowser-claude` (`~/.config/cloudflare/pb-token`, expires 2026-12-06 per `docs/RENEWALS.md` line 22) is used for Claude-run Cloudflare probes; rotate it in 59-07 after the last such probe (CF-13), and delete the file on legion afterwards.

### 59-06 (GUI checklist)

- `39-HUMAN-CHECKLIST.md` (117 lines, `.planning/milestones/v1.5-phases/39-v1-5-close-out/`): 41 unticked `- [ ]` items [VERIFIED: grep count this session]. By section: Phase 27 = 2, Phase 31.1 = 0, Phase 32 = 6, Phase 33 = 1, Phase 34 = 2, Phase 35 = 6, Phase 36 = 1, Phase 37 = 5, Phase 38 = 5 (28), Portal and cross-application = 3, Backstop truths = 9, Findings for a live look = 1. The checklist's paths say `.planning/phases/...`; the files are now under `.planning/milestones/v1.5-phases/`.
- Answer rule from the file: reply `pass` or describe the problem; each verdict goes into its UAT row ("pass with `human check <date>` evidence, or issue"), each problem gets a backlog row and a WINDOWS.md entry naming repro, cause so far and source. Rows in `39-20-DECISIONS.md` marked `re-tick after` return to `[x]`/`Complete` once their items pass and no ledger entry is named.
- `39-20-DECISIONS.md`: 12 `re-tick after` rows (NAV-03, NAV-04, NAV-05, NAV-06, PAGE-01, PAGE-04, PAGE-10, PAGE-11, BMK-04, PROMPT-04, PROMPT-06, PROMPT-08; the grep count of 13 includes the explanatory line). `v1.5-REQUIREMENTS.md` has 46 `- [ ]` rows. Several unticked rows are held by open ledger entries: NAV-03 by 27, MENU-03 by 40, PROMPT-05/09 by 39, PAGE-11 by 28 (these close in 59-03 and then the rows can be ticked), BMK-01 by 25, EXT-06/07 by 29, PROMPT-03 by 26 (re-dated, rows stay unticked). PAGE-05 stays unticked until libpulse packaging (999.19) lands.
- **`/gsd-verify-work 29`, `30`, `31` have no UAT file.** `ls` under `.planning/milestones/v1.5-phases/29-*/`, `30-*/`, `31-site-*/` shows `NN-VERIFICATION.md` with `status: human_needed` (29: score 74/81; 30: 52/55; 31: 5/5 criteria with human items) and, for 31, five `31-0N-LIVE-HANDOFF.md` files, but no `*-UAT.md`. The verify-work run creates the UAT from the VERIFICATION `human_verification` lists. `gsd_run query init.phase-op 29` resolves the archived directory (`phase_found: true`, `phase_dir` under `milestones/v1.5-phases/29-address-bar-search-and-fixup`), so the command works on archived phases; always pass the phase number.
- Runner order for the automated halves is already written: `.planning/v1.5-LIVE-PASS.md` (146 lines, sections Build, Phase 32-38 with commands such as `node scripts/verify-page-tools-live.mjs`, `node scripts/verify-address-bar-live.mjs --scenario ...`, `node scripts/verify-tab-strip-live.mjs`, `node scripts/verify-prompts-live.mjs --scenario ...`). Reuse it instead of re-deriving.
- Display tooling [VERIFIED: this session]: `ydotool`, `qdbus` and `spectacle` are on PATH; session is Wayland (`wayland :0 wayland-0`). `scripts/lib/pb-kwin.mjs` gates every send on KWin reporting a `powerbrowser` window owned by a browser this run launched; it needs the Bash sandbox off and a HEADED session (`PB_LIVE_HEADED=1`); real input is `PB_REAL_INPUT=1`. Screenshot recipe from memory: raise the window with a KWin script via `qdbus`, then `spectacle` with the sandbox off. Edits to `powerbrowser/shell/*.js`/`.sys.mjs` need `-purgecaches` or silently do not run (BUILD.md Tier 1).
- Needs a dev objdir built from the merged tree (D-06 of the plan cut and D-05): `objdir/dist/bin/powerbrowser` plus `yarn build` in `theia/`. This worktree has neither objdir nor a stamped `objdir/.pb-050-build.sha256`; LIVE-PASS "Build" lists the stamp commands for patches 050 and 060 that every live script checks.

### 59-07 (close-out)

- **Stage F** (FINISH-PLAN.md lines 265-279, read): `nix develop .#firefox` dev `./mach build` (about 47-54 min), release objdir rebuild (about 54 min; "objdir-release is 153.5.0, stale"), N+1 MAR per docs/BUILD.md, `scripts/verify-platform.sh --build`, `scripts/verify-platform.sh --gate`. "Before `--gate`, replace the three dead `GATE_KNOWN_OPEN_EXCLUSIONS` rows ... This is the last code commit." The three dead rows were already replaced by 39-19 (the current block at `verify-platform.sh:6499-6545` has none keyed to fixed 5 or 10), so only add or drop rows for what 59-07 re-dates. The N+1 MAR hop is `node scripts/drive-mar-update-hop.mjs` (OWNER-PASS Stage F reminder; plans 46-05/06). WINDOWS 24 (`build-update-xml` red by design until `.mozbuild/mar-hop/nplus1.mar` exists) closes here.
- **How `--gate` reads the exclusions** (`verify-platform.sh:6558-6629`): runs the full set into a log, extracts `  <label>: FAIL` lines, matches each label to an exclusion by exact label, excuses it only while the WINDOWS.md entry is `open`. Outputs `--gate PASS-WITH-EXCLUSIONS` or `--gate PASS` or `--gate FAIL`. A new red in another scenario of the same label is also excused (backlog 999.33, WR-06): that is a known weakness, not a Phase 59 task.
- **WINDOWS.md ledger shape** [VERIFIED: file read]: a markdown table plus a four-backtick `json` block; each entry has `id`, `kind`, `phase`, `file`, `line`, `description`, `status`, `reason`, `recorded_at`, `resolved_at`, `milestone`. Header counts: `open_count: 22`, `waived_count: 2`, `fixed_count: 19`, `total_count: 43`. `gsd_run windows fixed <id>` flips an open entry to `fixed` with `resolved_at`; `windows waive <id> "<reason>"` makes it `waived` (which also makes its gate exclusion stop applying, so waiving is wrong for a deferral). **There is no verb or field for a due date**; `reason` is empty on open entries (see Open Question 4).
- Entries that cannot close under D-06/D-11 and need re-dating: 25, 26, 29, 32, 35 (named in D-09), **30 and 31 in part**: entry 31 lists `ng074-ci-green-on-main` (needs a `verify.yml` run for a pushed head), `win-matrix-record` and `win-download-copy` (Windows), so it stays open after the Linux rows go green unless split; entry 30 closes only if the ten release-artifact rows are green after §6/§9/CF-16. Entries 22, 23, 24 belong to v1.6 phases (24 closes with CF-16; 22 and 23 are macOS/R4).
- **v1.6 override close-out chain** (FINISH-PLAN.md Stage G and §6; complete-milestone workflow): `scripts/verify-platform.sh --gate` → `/gsd-verify-work N --ws deploy` for phases whose VERIFICATION is missing or stale (40 is named stale) and a fix round → `/gsd-audit-uat` → `/gsd-audit-milestone v1.6 --ws deploy` (file must be `.planning/workstreams/deploy/v1.6-MILESTONE-AUDIT.md`; none exists today) → `/gsd-complete-milestone v1.6 --ws deploy`. In `~/.claude/gsd-core/workflows/complete-milestone.md` (lines 99 and 143) the override is chosen interactively: "set `closeout_type=override_closeout`" when not all phases are verified or the user selects "Proceed anyway"; there is no CLI flag. FINISH-PLAN: "readiness → `override_closeout` with the deferral list from §5; archive call must be `gsd_run query milestone.complete v1.6 --name \"Deployment setup\" --confirm --ws=deploy`." Pitfalls P1 (missing `--ws` writes v1.5 files), P2, P3 (skip `/gsd-cleanup`), P4 (verify last), P7 (hand-fix Phase 45 SUMMARY one-liners before they reach MILESTONES.md). Tag locally: `git tag -a v1.6`. The deploy STATE.md currently reads `milestone: v1.6`, `status: executing`, 111 of 118 plans executed; closing it does not run in the deploy worktree (D-10, CONTEXT code_context).
- **CF-12:** `python3 scripts/ledger-amend.py drop --id NG-075 --reason "..." --quote "<QUOTE>"` for NG-075..080, run by Chris; NG-081 and NG-089 stay deferred (OWNER-PASS §13 has the six lines verbatim). The agent must not mention the ledger directory name in Bash text; read ledger files with Read.
- **CF-13:** `docs/RENEWALS.md` line 22, row "Cloudflare API token `powerbrowser-claude` (owner-pass automation: Pages, DNS, zone settings, cache purge, Email Routing)", expiry `2026-12-06`, action "Rotate the token (My Profile > API Tokens > Roll) once the v1.6 owner pass is done ... Then delete `~/.config/cloudflare/pb-token` on legion."
- **Push set (D-11 / CF-19), corrected by the tree:** `git ls-remote --tags origin 'v1.*'` returns `refs/tags/v1.5` (peeled `a4ea096c`), so `v1.5` is already on `origin`. `git log origin/main..main` shows two docs commits (eb67f654, effb44b4). So the pending set is: `main` (2 commits), tag `v1.6` (not yet created), and `ServerDestroyer/v1.7-Orca-integration`. Confirm with `git ls-remote` immediately before the ask.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---|---|---|---|
| Second verification driver for a new gate | `verify-phase-0N.sh`-style script | one row in the `verify-platform.sh` registry | CLAUDE.md; deleted for a reason |
| Closing a WINDOWS.md entry | hand-editing table and JSON block | `gsd_run windows fixed <id>` | keeps `open_count` and the table in step (`renderLedger`) |
| Renumbering `INTERNAL-APIS.md` lines | by hand | `node scripts/verify-ng-040-internals-catalogue-lines.mjs --fix` | it already exists |
| A hand-kept expectation list in `verify-crash-autosubmit-env.mjs` | literal variable name | derive from `config.rs` at check time and compare (CLAUDE.md rule 2) | a hand-kept list can only agree with itself |
| Patch edits | text edit of a hunk | `scripts/regenerate-patches.sh` from a patched tree | silent no-op merge risk (CLAUDE.md) |
| Real-input and screenshots | ad hoc `ydotool` | `scripts/lib/pb-kwin.mjs` gate | it refuses to type into the wrong window |
| Ledger amendments | any agent write | Chris runs `scripts/ledger-amend.py` | frozen to agents (R15) |

## Runtime State Inventory

Not a rename or migration phase; omitted. One related caution: closing WINDOWS entries and renumbering the internals catalogue are the only "state" changes the lanes cause, and both are done by the coordinator.

## Common Pitfalls

1. **Staged-hunk trap in `upstream/`.** `git -C upstream checkout -- .` leaves staged hunks in place. A lane that needs `upstream/` runs `git -C upstream reset --hard && git -C upstream clean -fd`, then `scripts/apply-patches.sh` (which stages its result). Check `git -C upstream status --short` only shows the patched paths; in this worktree it shows 3+ staged `M ` lines, which is the expected patched state [VERIFIED: `git -C upstream status --short` this session]. `scripts/fetch-upstream.sh` clones 5.6 GB from `https://github.com/mozilla-firefox/firefox.git` (BUILD.md: 438-677 s, network-bound) and has no local-reference option [VERIFIED: grep this session]. 59-01 needs none of it; 59-02 needs it only for the `crash-autosubmit-env` row (the gate reads `upstream/.../config.rs`); the coordinator can run that row after merge.
2. **`node scripts/generate.mjs` must run in `nix develop .#theia`** (inkscape 1.4.4); BUILD.md lines 41-48. D-07's list says to run it, without the shell qualifier. A bare run on a host with another inkscape produces rasters that fail byte-identity "as though the tree were at fault".
3. **Brand scan sees only `git ls-files`.** Stage every new file (the new gate script, the `.nix` snippet, the new SUMMARYs) before trusting `node scripts/scan-brand-residue.mjs`. The originating product's name may appear only in `inventory/brand-tokens.json`.
4. **Chrome JS startup cache.** Any live check of `powerbrowser/shell/*` edits needs `-purgecaches`.
5. **`--quick` is not seconds here:** 6 min 47 s on this host. Plan the merge cadence accordingly (three merges ≈ 20 minutes of gate time).
6. **WINDOWS.md closure order.** Close an entry only after its row is green on the merged tree, then re-run that row under `--gate` semantics; otherwise the exclusion no longer applies and the gate fails.
7. **Concurrent sessions on `main`.** Commit with explicit paths; never `--amend`, `-a` or stash while foreign files are staged. The planned `git tag v1.6` and any push need Chris's word in the box.
8. **Absence assertions.** A new gate must not assert the absence of a log line the code under test did not emit (CLAUDE.md rule 1); give each new check a `--self-test` that plants faults and requires each to go red naming the drift (57-08 lists six).
9. **The user-facing copy rule.** Any fix that changes a shell error string (WINDOWS 36's area) keeps "PowerBrowser" and no internal identifier; `shell-error-copy-no-internals` enforces by pattern.
10. **Owner-step hygiene.** Never print a token. The question-box text must not embed `<QUOTE>` values or recovery-code locations; record only the fields each section's reply format names.

## Code Examples

### Boundary clear (plan 57-08 Task 1; verified insertion points)

```js
// powerbrowser/shell/PowerBrowserAPI.sys.mjs, next to getEnv (lines 421-424 today):
  /** Reads an environment variable. */
  getEnv(name) {
    return Services.env.get(name);
  },
  // add: clearEnv(name) { Services.env.set(name, ""); },   // empty is false in config.rs env_bool
```

and, first statement inside `PowerBrowserSingleInstanceHandler.handle(cmdLine)` before `PowerBrowserAPI.cliUrl(cmdLine)`: `PowerBrowserAPI.clearEnv("MOZ_CRASHREPORTER_AUTO_SUBMIT");` (the call sits inside the existing `try`; a refusal must not abort the handler, so keep it guarded or wrap it).
Source: `57-08-PLAN.md` truths and Task 1; handler body read at `PowerBrowserAPI.sys.mjs:4454-4490`.

### Token threading for the list reads (plan 41-04 Task 3, adapted to the real signatures)

```js
// ghGet(path, exec = execFileSync, token) -> exec('gh', [...], { env: token ? { ...process.env, GH_TOKEN: token } : process.env, ... })
// never include `token` in `why` or any returned/printed value; the 403 text quoted from gh's first stderr line is safe.
```
Source: `scripts/verify-repo-controls.mjs:67-79` (current signature) and `41-04-PLAN.md` lines 343-345.

## State of the Art

Not applicable (no external technology). One internal drift to note: `TheiaService._resolveConfigDir()` moved the Theia config dir to `<profile>/powerbrowser-theia` (CR-01 fix, 05-REVIEW.md), and two Phase 1/8-era harnesses (`verify-customize-inert.mjs`, `check_start_failure_shows_error`) still assume `$XDG_CONFIG_HOME/powerbrowser`.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The lane can prove Theia-side and harness-side fixes with `PB_FIREFOX_BIN` pointing at the main checkout's binary and `PB_BACKEND_MAIN` at the lane's Theia build (documented at `firefox-bidi.mjs:40-44`, not exercised this session) [ASSUMED for the registry's own app checks, which take no override] | 59-03 | Lane cannot prove the row; the coordinator must prove it after merge |
| A2 | The WINDOWS 34/36 root cause is the profile-scoped config dir (read in code, not reproduced) [ASSUMED] | 59-03 | The fix leaves the row red; the third observation of the same symptom needs a live run to separate |
| A3 | WINDOWS 38 root cause not found in the read file; the rank defect may be in the harness DI resolution [ASSUMED] | 59-03 | Time spent in the wrong file |
| A4 | Re-dating a still-open entry means appending the owner date to `description` or `reason` of the WINDOWS.md JSON block via a script; no other mechanism exists [ASSUMED: no CLI verb found in `broken-windows.cjs` exports] | 59-07 | `windows_enforce` or the parser rejects the edit; test with `parseLedger` first |
| A5 | The 41-04 `fails_when` ("fails on the installation repository-list reads only, each naming its `REPO_CONTROLS_TOKEN_` variable") is not satisfiable for the three third-party Apps | 59-02 | See Open Question 1 |
| A6 | `/etc/nixos` is unreadable from the agent sandbox in lanes as in this session | 59-02 | If readable, a real diff is possible |
| A7 | CF-08's release is built by `release.yml` from GitHub `main`, so it contains only what has been pushed [ASSUMED from OWNER-PASS §9.2 `gh workflow run release.yml -R Deocracy/powerbrowser --ref main -f sha=<sha>`] | 59-05 | Open Question 3 resolves differently |

## Open Questions

1. **Third-party App lists (59-02a).** The live row has five unreadable lists: `slack`, `claude`, `powerbrowser-bot`, `powerbrowser-clock`, `cloudflare-workers-and-pages`. 41-04's DEVICE-FLOW (field 10, chosen by Chris) defines tokens for two. Device flow can only be enabled by an App's owner, and three of the five are not Chris's.
   - What we know: the check is `compareApps` in `scripts/verify-repo-controls.mjs`; 41-04 also defines the alternative FALLBACK (drop the list reads, request deferral `GH10LIST-1`, stream `deploy`, owner `ServerDestroyer`, phase `43`; it requires `scripts/ledger-amend.py` to support a stream option, the plan expected it not to) and KEEP-RED.
   - Unclear: whether the owner token read of `GET /orgs/{org}/installations` (which already returns `repository_selection` and `permissions`) is enough for the undeclared Apps under R10 once `repository_selection` is `selected` and the repository list is unreadable.
   - Recommendation: implement the generic per-slug variable (`REPO_CONTROLS_TOKEN_<SLUG>` for any installation) so the bot and clock lists go green with the owner's tokens, and ask Chris once in the box how the three third-party lists are to be proven or re-dated (the decision is his, per the existing field 10 branches). Do not change his DEVICE-FLOW choice.

2. **TEL-13 vs owner decision 9 (59-05, CF-11).** `57-04-PLAN.md:26`: "The flip commit executes ONLY at a checkpoint:human-action after criteria 1 to 3 are green AND the first Windows release has shipped (owner decision 9)"; `BLOCKED.md` B5: "Stays gated behind B1 and B3 and the first Windows release (Phase 54)". D-06 excludes Windows from Phase 59 ("Linux ships alone").
   - What we know: B1 landed, B3 receiver is live; 57-08 lands in 59-02. The flip also needs a reporter-enabled rebuild (tier 3) and `buildsymbols`.
   - Unclear: whether D-06 releases decision 9's Windows condition.
   - Recommendation: do not run the flip in Phase 59 unless Chris rules the condition lifted; land 57-08, then re-date 57-04 and the `crash_report` key (D-09). Ask this single question at 59-05 start.

3. **Push gate vs first release and `ng074`.** D-11 pushes nothing until the end of 59-07. §9 dispatches `release.yml` on GitHub `main` and the bump PR merges on GitHub; `ng074-ci-green-on-main` (exclusion 31) needs a `verify.yml` run for the pushed head. A release cut before the push contains none of Phase 59's fixes.
   - Recommendation: ask Chris in the box at the start of 59-05 whether `main` may be pushed before §9 (it holds 2 docs commits plus whatever 59-0x merges into `main`; note the work lands on `ServerDestroyer/v1.7-Orca-integration`, not `main`, so a push of `main` alone does not carry the fixes). If not, `channel-live`, `ng074-ci-green-on-main` and the ten WINDOWS 30 rows may only go green for Linux after the push, which 59-07 handles; re-date accordingly.

4. **Re-dating mechanism.** WINDOWS.md has no due-date field and no re-date verb. Recommendation: define in the 59-07 plan one coordinator script that appends `Re-dated to <date> (Phase 59 D-09).` to `description` (or sets `reason`) of the JSON block entry, using `parseLedger`/`renderLedger` from `broken-windows.cjs` so the table region regenerates, and leaves `status: "open"`. Dry-run it on a copy first.

5. **Lane build cost.** Whether a lane may start its own tier-3 build (40-54 min, ~14 GB) or must rely on `PB_FIREFOX_BIN`. D-05 says Gecko builds run one at a time. Recommendation: coordinator builds the dev objdir at the start of wave 1 (nothing in wave 1 blocks on Chris for that), lanes use `PB_FIREFOX_BIN`, and rows needing chrome-side edits are proven by the coordinator after merge. Also confirm §4's patch-030 regeneration is done before that build to avoid a second tier-3 build.

6. **Is the owner pass really parallel to 59-03?** All GUI steps in 59-06 need Chris, a display and the sandbox off; 59-04/59-05 need Chris too. D-05 already says "alternating on Chris's attention".

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| node | all scripts, gates | yes | present (runs `--quick`) | — |
| gh (authenticated) | 59-04 probes, `repo-controls` | yes | user `ServerDestroyer`, scopes `gist, read:org, read:user, repo, workflow` | `admin:org` only temporarily (OWNER-PASS) |
| orca CLI | lane creation | yes | `/home/chris/.config/orca/linux-orca-cli-shim/orca` | — |
| ydotool, qdbus, spectacle | 59-06 real input and screenshots | yes | on PATH | — |
| `objdir/` dev build | 59-03 live proof, 59-06, 59-07 | **no in this worktree** (exists in `/home/chris/coding/Power-Browser` and `/home/chris/gsd-workspaces/deploy/Power-Browser`) | — | `PB_FIREFOX_BIN` for Theia-side checks; else build (~40-54 min) |
| `upstream/` patched | `--quick` rows, 57-08 gate | yes here; absent in new lanes | `FIREFOX_153_5_1esr_BUILD1` (`git -C upstream describe`) | `scripts/fetch-upstream.sh` + `apply-patches.sh` per lane |
| `theia/node_modules` + built `lib` | Theia-side fixes, `--quick` | yes here | — | install per BUILD.md in lanes |
| `/etc/nixos` | 59-02c | **not visible** | — | prepared snippet, not a diff |
| nixos MCP | verify option names (59-02c) | not tested this session; required by the user's global NixOS rules | — | — |
| podman, wrangler, Anthropic Console, Cloudflare, Codeberg | 59-05 (owner) | not probed | — | owner steps |

**Missing dependencies with no fallback:** none outright. **Blocking-if-unresolved:** an objdir for 59-06 (must be built in the coordinating tree), and Chris's answers to Open Questions 1-3.

## Validation Architecture

`workflow.nyquist_validation` is `true` in `.planning/config.json`.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | the single registry `scripts/verify-platform.sh` (bash driver over `node` scripts, each with a `--self-test`) |
| Config file | none; registry array in `scripts/verify-platform.sh` |
| Quick run command | `scripts/verify-platform.sh --only <label>` (seconds to minutes per row) |
| Full suite command | `scripts/verify-platform.sh --quick` (6 min 47 s here, 328 PASS), `--build`, `--gate` |

### Phase Requirements → Test Map

| Plan | Item | Test Type | Automated Command | File Exists? |
|------|------|-----------|-------------------|-------------|
| 59-01 | CF-14 records | docs; automated greps | `grep -q 'Live state' <summary>`; `node scripts/scan-brand-residue.mjs` after `git add`; `scripts/verify-platform.sh --quick` | yes (no code) |
| 59-02a | token input | self-test + live | `scripts/verify-platform.sh --only repo-controls-self-test`; `node scripts/verify-repo-controls.mjs --self-test` (must print an ok line naming `REPO_CONTROLS_TOKEN_POWERBROWSER_BOT`); live `--only repo-controls` only with Chris's tokens | yes (needs edit) |
| 59-02b | `clearEnv` | static gate | `bash scripts/check-internals-boundary.sh && bash scripts/check-internals-boundary.sh --catalogue && bash scripts/check-internals-boundary.sh --self-test`; `node scripts/verify-ng-040-internals-catalogue-lines.mjs`; `node scripts/verify-crash-autosubmit-env.mjs && node scripts/verify-crash-autosubmit-env.mjs --self-test`; `--only crash-autosubmit-env` | gate script is new (Wave 0) |
| 59-02c | `/etc/nixos` snippet | none automated in the sandbox | owner runs `pkexec ... nixos-rebuild dry-build`; lane checks option names with the nixos MCP | new file |
| 59-03 | 11 defects | live per-row | rows in the table above, `--only <label>` ×3 for flakes, plus `<label>-self-test` where present; WINDOWS entry closed only after green | rows exist |
| 59-04 | OWNER-PASS §1-5, 13 | live + owner | `repo-controls`, `updates-repo-static`, `events-worker`, `watchdog`, `tel06-error-delivery-live`, `upptime-sweep-live`, `codeberg-mirror-live`, `ng065-mar-signature-enforced`; `gh api .../runners`; `python3 scripts/ledger-report.py` | rows exist |
| 59-05 | OWNER-PASS §6-10, 12 | live + owner | `portable-elf`, `sidecar-no-symlinks`, `package-target-natives`, `ng063-packaged-launch`, `packaged-identity`, `install-matrix`, `channel-live`, `mar-update-hop`, `flake-repack`/`binary-cache` with `--release`, `fixer-prepare-self-test`, `triage-workflow` | rows exist |
| 59-06 | 41 items + verify-work 29/30/31 | **human judgement** | automated halves from `.planning/v1.5-LIVE-PASS.md`; verdicts by Chris in the box | n/a |
| 59-07 | Stage F, gate, close | full | `scripts/verify-platform.sh --build`, `--gate`; `git ls-remote --tags origin 'v1.*'`; `git tag -l 'v1.*'` | rows exist |

### Human (owner) checks that cannot be automated

GitHub UI steps (Apps, notifications, phone pushes, second-account drills), Cloudflare dashboard and payment, Anthropic Console caps and federation rule, MAR key ceremony media custody, `pkexec` runs on legion, the 26-hour watchdog drill (real clock), the first-release approvals (`release`, `descriptor`), Windows-free signoff of re-dating, every item of `39-HUMAN-CHECKLIST.md` (look and feel, portal clicks, cross-application drags), and the single push ask.

### Sampling Rate

- **Per task commit:** the touched `--only` rows and their self-tests.
- **Per wave merge:** `scripts/verify-platform.sh --quick` after each lane merge (about 7 minutes).
- **Phase gate:** `--build` then `--gate` on the merged tree with a dev objdir before close.

### Wave 0 Gaps

- [ ] `scripts/verify-crash-autosubmit-env.mjs` plus two registry rows (new, from 57-08 Task 2).
- [ ] A dev `objdir/` in the coordinating tree before any live row of 59-03, 59-06 and 59-07.
- [ ] A coordinator script for re-dating WINDOWS.md entries (Open Question 4) and a dry run of it.
- [ ] Optional: decide whether 59-03's rows get a `PB_FIREFOX_BIN`-aware wrapper (no registry change needed; env var is read by the harness libs).

## Security Domain

`security_enforcement` is absent in config, so it is treated as enabled.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes (owner credentials, device-flow user tokens, App keys) | tokens only in the owner's shell env, passed as `GH_TOKEN` to one child, never printed, stored or replied; 8-hour expiry; revoke afterwards (41-04 T-41-29) |
| V3 Session Management | no | — |
| V4 Access Control | yes | `ledger-amend.py` frozen to agents; `pkexec` only by Chris; lanes forbidden from STATE/ROADMAP/WINDOWS/ledger; rulesets and environments as applied |
| V5 Input Validation | yes | `drop --quote` takes Chris's own words; crash-env gate derives names, no literals; shell-error copy rule |
| V6 Cryptography | yes | MAR signing keys (`.p12`, NSS stores, secondary DER) made by Chris with NSS tools; never hand-rolled; secrets set through `gh secret set` from files that are shredded after |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Token leakage through logs or SUMMARYs | Information disclosure | no token in any argv, file, SUMMARY or reply; `why` strings keep only gh's first stderr line; self-test plant proves no other read receives the token |
| Pasted credentials in chat (the Cloudflare token already was) | Information disclosure | CF-13 rotation after the pass; delete `pb-token` |
| Crash client submitting without the dialog | Information disclosure | boundary `clearEnv` plus derived gate (57-08); pref lock already landed (`crash-autosubmit-lock`) |
| An exclusion silently excusing a new red | Tampering/Repudiation | exclusion tied to an open WINDOWS.md id; entries close only with the fix (999.33 notes the label-wide weakness) |
| Irreversible publication (tag, push) | Tampering | single push gate in 59-07; `v1.6` tag pushed only on Chris's word |
| Applying root config from an agent | Elevation of privilege | `/etc/nixos` change delivered as a snippet; Chris runs `nrs` under `pkexec` |

## Project Constraints (from CLAUDE.md)

- Never fork or patch Theia core (`scripts/diff-theia-core.sh`); never modify Gecko outside the patch stack; Firefox internals only through `powerbrowser/shell/PowerBrowserAPI.sys.mjs`, catalogued in `powerbrowser/INTERNAL-APIS.md`, enforced by `scripts/check-internals-boundary.sh` (`--self-test`, `--catalogue`).
- Design for the bridge: `TabUriRegistry` shape asserted by `scripts/verify-registry-shape.mjs`.
- The repo path must contain no space.
- Theia is the default GUI; stock browser chrome reachable; no custom browser chrome.
- No generator in Phase 1 (a historical rule; Phase 2 compares generated bytes to hand-written ones).
- `node scripts/scan-brand-residue.mjs` must exit 0 over the tree; it iterates `git ls-files`, so stage new files first; only `inventory/brand-tokens.json` may name the originating product.
- Patches are regenerated, never text-edited.
- One driver, one registry: `scripts/verify-platform.sh`; add a check by appending one row; never assert on the absence of a log line you emit; derive expectations from the tree and compare as set equality; give a new check a `--self-test` with planted faults.
- User-facing copy names "PowerBrowser", plain language, next step is a real affordance; no internal identifier.
- Builds run inside Nix dev shells (`nix develop .#firefox`, `.#theia`); `node` and `objdir/dist/bin/powerbrowser` work outside; `yarn` does not; a full `./mach build` is tier 3 at roughly 47-54 minutes.
- Memory-derived operating rules that apply here: another Claude session may commit to this repo (explicit paths, no `--amend`/`-a`/stash with foreign files staged); questions go through the question box; no new DSH runs; Opus for hard code, Sonnet medium, Haiku bookkeeping; v1.5 human checks and live work were deferred to this pass.
- Project skills `spike-findings-Power-Browser` and `sketch-findings-Power-Browser` exist under `.claude/skills/`; this phase builds no Orca code and no new UI, so neither adds a rule beyond the above.

## Sources

### Primary (HIGH confidence; files opened this session)

- `.planning/workstreams/orca/phases/59-carry-forward-from-v1-5-and-v1-6/59-CONTEXT.md`, `.planning/CARRY-FORWARD-v1.7.md`, `.planning/workstreams/orca/STATE.md` (head).
- `.planning/workstreams/deploy/OWNER-PASS.md` (all), `FINISH-PLAN.md` (R-table lines 45-60, Stage F/G/H, §5, §6), `STATE.md` (head), `phases/41-*/41-04-PLAN.md` (Tasks 3-4, truths), `phases/47-*/47-04-PLAN.md` (head), `phases/57-*/57-08-PLAN.md`, `phases/57-*/57-04-PLAN.md` (truths, objective), `phases/57-*/BLOCKED.md` (B1-B6), `phases/53-*/BLOCKED.md` (items 2-3), `phases/42-*/42-04-SUMMARY.md`, `phases/43-*/43-05-SUMMARY.md`, `phases/48-*/48-05-SUMMARY.md`.
- `.planning/ROADMAP.md` lines 425-490 (backlog 999.27-999.33), `.planning/WINDOWS.md` (header and JSON entries 24-43), `.planning/v1.5-LIVE-PASS.md`, `.planning/milestones/v1.5-phases/39-v1-5-close-out/39-HUMAN-CHECKLIST.md`, `39-20-DECISIONS.md`, `.planning/milestones/v1.5-phases/{29,30,31}-*/NN-VERIFICATION.md` (frontmatter), `.planning/milestones/v1.5-REQUIREMENTS.md` (counts).
- `scripts/verify-platform.sh` (exclusions 6499-6545, gate 6558-6629, `start_shell` ~380-392, `check_start_failure_shows_error` 1539-1690, registry lines cited), `scripts/verify-repo-controls.mjs` (55-104, 405-500, self-test regions), `scripts/verify-crash-autosubmit-lock.mjs` (head), `scripts/check-internals-boundary.sh` (head), `scripts/verify-ng-040-internals-catalogue-lines.mjs` (head), `scripts/lib/firefox-bidi.mjs` (31-60, 100-125), `scripts/lib/pb-kwin.mjs` (head), `scripts/verify-nav-keys-live.mjs` (695-790), `scripts/verify-page-tools-live.mjs` (1925-1941), `scripts/verify-customize-inert.mjs` (55-106), `scripts/verify-ng-023-suggestions-places.mjs` (25-70), `scripts/verify-pan04-undo-close-group-live.mjs` (440-475), `scripts/verify-prompts-live.mjs` (1325-1350), `scripts/verify-site-identity-live.mjs` (1300-1335).
- `powerbrowser/shell/PowerBrowserAPI.sys.mjs` (405-430, 4454-4490), `powerbrowser/shell/TheiaService.sys.mjs` (205-300, 612-630, 940-1010), `powerbrowser/INTERNAL-APIS.md` (row at 80), `upstream/toolkit/crashreporter/client/app/src/config.rs` (175-179, 676-684), `theia/extensions/chrome-bar/src/browser/{chrome-bar-widget.tsx (940-1135), chrome-bar-places-suggestions.ts, side-panel-top-tabs.ts}`, `theia/node_modules/@theia/core/lib/browser/shell/tab-bars.js` (1165-1190), `systemd/codeberg-mirror.{service,timer}`, `.github/settings/app-cloudflare-workers-and-pages.json`, `docs/BUILD.md` (36-70, 428-466, 466-612), `docs/RENEWALS.md` (20-27).
- `~/.claude/gsd-core/bin/lib/broken-windows.cjs` (exports, `markFixed`, `cmdWindowsMarkFixed`, `cmdWindowsWaive`), `~/.claude/gsd-core/workflows/complete-milestone.md` (lines 65, 99, 143).
- Commands run: `scripts/verify-platform.sh --quick` (PASS, 328/0/5, 6m47s), `--only fixer-isolate-self-test` (PASS), `node scripts/verify-repo-controls.mjs` (read-only; FAIL, 5 problems), `gh auth status`, `gh repo view DeBIOS-Foundation/powerbrowser`, `git ls-remote --tags origin 'v1.*'`, `git log origin/main..main`, `orca worktree create --help`.

### Secondary / Tertiary

None. No web research was done (the phase is internal).

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH, nothing to install.
- Architecture and plan cut feasibility: HIGH on constraints (objdir, push gate, TEL-13 gate), MEDIUM on the lane proof strategy (A1).
- Per-defect fix leads (59-03): MEDIUM; 34/36 and 41 have read-in-code evidence, 27 and 37 are reasoned from code, 28, 38, 39, 40, 42, 43 need live runs.
- Pitfalls: HIGH.

**Research date:** 2026-11-08
**Valid until:** 2026-11-22, or until the first lane merge changes `scripts/verify-platform.sh` or `PowerBrowserAPI.sys.mjs` line numbers.
