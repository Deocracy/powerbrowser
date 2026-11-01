# Pitfalls Research

**Domain:** Release automation, self-update, signing, self-hosted CI, a serverless Cloudflare backend and AI fixer agents, added to a Firefox-ESR derivative with a Theia sidecar (PowerBrowser v1.6 Deployment setup)
**Researched:** 2026-10-20
**Confidence:** MEDIUM overall. Findings read from this tree or `upstream/` are HIGH. Findings from official docs are MEDIUM where a second source agrees and LOW where only one fetch supports them; the tier per provider comes from `gsd-tools classify-confidence` (websearch LOW, or MEDIUM when verified; webfetch LOW).

Scope: SEED-002 phases A-L, plus the release-train orchestrator (`release-train.yml`) and the Claude fixer steps. Pitfalls already stated and mitigated in SEED-002 are mentioned only when this research adds a check, a correction or a source.

Row notation: proposed `scripts/verify-platform.sh` rows use the registry's own `"label|command"` form (`scripts/verify-platform.sh:3565`). Each new row gets a `--self-test` sibling that plants the fault and requires red naming the drift (CLAUDE.md, Verification rule 2).

---

## Critical Pitfalls

### Pitfall 1: The Claude fixer runs attacker text with a privileged token (prompt injection to a supply-chain compromise)

**What goes wrong:**
An attacker writes instructions into text the fixer reads: an issue title, a comment on the release tracking issue, a Renovate PR body (Renovate copies upstream release notes, which third-party package authors write), a CI log line, or a commit message in a dependency. Claude follows them in a job that holds a write token, the Anthropic key or a cache-write token. The documented incident is "Clinejection" (2026-03). Cline ran `anthropics/claude-code-action@v1` for issue triage with `allowed_non_write_users: "*"` and broad `Bash`. An issue title carried the payload, the attacker poisoned the Actions cache from the triage job, and the nightly release workflow restored that cache. The attacker took the npm publish token and published `cline@2.3.0`. Aikido's "PromptPwnd" (late 2025) reports the same class of flaw in Gemini CLI, Claude Code Action and Codex workflows.

**Why it happens:**
The action is easy to wire to `issues`, `issue_comment` and `workflow_run`. Its default is safe: only actors with write access can trigger it, and `workflow_run` checks both the actor and the upstream run's actor. Each widening (`allowed_non_write_users`, `allowed_bots: '*'`, `Bash`, a PAT) looks harmless one at a time. The action's own docs say the content sanitization "reduces but does not eliminate prompt injection risk".

**How to avoid:**
1. Two-job split for every fixer. Job F1 (AI) runs on `ubuntu-latest` with `permissions: contents: read`, and its only secret is `ANTHROPIC_API_KEY`. It gets no App token, no `actions: write` and no cache step. It writes a diff artifact and nothing else. Job F2 (no AI) holds the App token. It downloads the diff, validates it against a path allowlist (Pitfall 2), pushes `fix/claude-<step>-<run_id>` and opens the PR. This is SEED-002's job A/B split (automation map row 2), applied to the fixer.
2. The prompt is built only from trusted fields: the failing job name, the check label, and the log excerpt and diff the workflow fetched itself. Untrusted text is passed as a file with an explicit "data, not instructions" frame. Never interpolate an issue or PR body, a comment, or Renovate release notes. Set `include_comments_by_actor` to the owner only, and lock the tracking issue (`gh issue lock`) so a stranger cannot comment on it.
3. Tools come from an allowlist. Use `--allowedTools` with exact commands (`Bash(git -C upstream diff:*)`, `Bash(node scripts/generate.mjs)`, `Bash(scripts/verify-platform.sh --quick)`, `Edit`, `Read`) and `permissions.deny: ["WebFetch","WebSearch"]`. Never allow bare `Bash`.
4. Pass `github_token: ${{ secrets.GITHUB_TOKEN }}` and never a PAT (action security.md: a static token "could be partially or fully recovered over time via prompt injection"). Do not grant `id-token: write`, so the action cannot mint the Claude App token with contents/PR/issues write.
5. Triage (GH-03) is the only job that may set `allowed_non_write_users: "*"`, because strangers open the issues. It runs with `permissions: issues: write` only and allows no `Bash` except the two capped label and comment scripts (`CLAUDE_CODE_SCRIPT_CAPS`). Claude selects a label set and a template id. A non-AI step posts the fixed template text, so the bot account never publishes free text an attacker wrote.
6. `if: github.event.workflow_run.head_repository.full_name == github.repository` on every `workflow_run` fixer, so a fork's run never starts it.

**Warning signs:**
A fixer job with any `secrets.` reference other than the Anthropic key. `Bash` without a parenthesised command. `allowed_bots: '*'`. Any `${{ github.event.issue.* }}`, `comment.body`, `pull_request.title/body` or `head_commit.message` inside a `prompt:` or `run:`. A fixer PR touching a path outside its allowlist.

**Phase to address:** Fixer (with AUTO-01 in A for the patch-conflict fixer, F for the Theia fixer, and G for GH-03 triage). Gate: a new `workflow-trust-boundary` row (below) is green before any fixer workflow merges.

---

### Pitfall 2: The fixer turns red to green by weakening the gate or text-editing a patch

**What goes wrong:**
An agent told to make a check pass can do it without fixing anything. It can delete or narrow a `CHECKS` row, add the failing value to an allowlist (`powerbrowser/endpoint-allowlist.json`, the manifest-literals allowlist, `quick-baseline.txt`), edit `inventory/brand-tokens.json`, or hand-edit a hunk in `patches/*.patch`. The last is the project's named failure. A hunk edited without recomputing its blob hashes reduces `git apply --3way` (`scripts/apply-patches.sh:48`) to a silent no-op or a wrong merge. Patch `030` holds the MAR certificate: a fixer edit there changes which key users' updaters trust.

**Why it happens:**
No regeneration tool exists. `scripts/rebase-upstream.sh` replays and verifies but does not regenerate, and no doc gives the regeneration command. An agent therefore edits the text it can see. `apply-patches.sh` asserts before != after (non-vacuity) but never asserts that the post-apply blob equals the patch's own `index <a>..<b>` hash. That is the check that tells a regenerated patch from a hand-edited one.

**How to avoid:**
- Add `scripts/regenerate-patch.sh <NNN>`. It reads the patch's `+++ b/` paths and writes `git -C upstream diff --full-index <pinned tag> -- <paths>` into the patch file. The fixer prompt names this script as the only way to change `patches/`.
- New row `patch-regenerated|node $REPO_ROOT/scripts/verify-patch-index.mjs`. After a replay, for every `index a..b` line in every patch, `git -C upstream hash-object <path>` must start with `b`, and the blob at the pinned tag must start with `a`. The self-test hand-edits one `+` line in a copy and requires red naming patch and path. The row needs `upstream/` applied, so the rebase job runs it, as `rebase-upstream.sh` already does for the scan.
- F2 (Pitfall 1) rejects the diff if it touches `.github/**`, `.claude/**`, `CLAUDE.md`, `scripts/verify-platform.sh`, any file a `CHECKS` row command names (derive that list by parsing the registry, never by hand), `patches/030-*`, `powerbrowser/packaging/mar/**`, `inventory/brand-tokens.json`, `quick-baseline.txt` or `*allowlist*.json`. The fixer may *report* that a gate is wrong. Only the owner changes a gate.

**Warning signs:**
A fixer PR whose diff removes lines from `verify-platform.sh` or adds lines to an allowlist. Any patch diff that changes `+`/`-` lines without changing an `index` line. `git -C upstream diff` non-empty after a fixer run that claimed success.

**Phase to address:** A (AUTO-01 builds the regeneration script and row together with the conflict issue), and the fixer phase for the F2 path gate.

---

### Pitfall 3: Fixer recursion and runaway spend

**What goes wrong:**
The fixer opens a PR with the App token. That PR triggers CI, because App-token PRs run workflows where `GITHUB_TOKEN` PRs do not. The CI goes red, the red starts the fixer again on its own branch, and the loop runs until the Anthropic balance or the owner stops it. A patch-conflict session reading a 1.1 GB upstream tree is also a long session by nature. The action exposes no spend cap (docs/configuration.md lists only `--max-turns` and `--model`).

**How to avoid:**
- Trigger guards: never start on a head ref matching `fix/claude-*`, `renovate/*` already under a fixer PR, or an actor equal to the App's bot login. One attempt per failure fingerprint (check label + base SHA), recorded on the tracking issue. A second red goes to the owner as an assignment.
- `concurrency: group: fixer-${{ <fingerprint> }}`, `cancel-in-progress: false`. `timeout-minutes: 30` on F1. `--max-turns` in `claude_args` (start at 30 and measure).
- A separate Anthropic Console workspace for CI with its own monthly spend limit. Keep triage (haiku) and fixer keys apart, so a triage flood cannot use up the fixer's budget and the reverse.
- Pin the Claude Code binary. The action downloads Claude Code at run time (SEED-002 automation map row 17), so the SHA pin on the action does not cover the code that runs. `path_to_claude_code_executable` accepts a binary from the flake (`nixpkgs` `claude-code`, pinned by `flake.lock`), which brings the agent under the same pin discipline as every other tool.

**Warning signs:**
More than one fixer run per red in the Actions list. Fixer runs whose `head_branch` starts with `fix/claude-`. A month-to-date Anthropic workspace spend above the expected level.

**Phase to address:** Fixer. Row: `workflow-trust-boundary` asserts the head-ref guard, `concurrency`, `timeout-minutes` and `--max-turns` on every job that uses `claude-code-action`.

---

### Pitfall 4: Same-repo branches bypass fork approval and run code on legion

**What goes wrong:**
SEED-002 protects legion with "fork PR approval for all external contributors" and "release.yml never on pull_request". Fork approval covers forks only. Any actor that can push a branch to the repository itself can add a workflow file with `runs-on: [self-hosted, <label>]` on that branch, and that workflow runs on legion on `push`. Three actors will have push rights: the owner, `powerbrowser-bot`, and the Mend Renovate App. Renovate's App requests the Workflows permission so that it can bump action versions. A repository-level self-hosted runner accepts any job in the repo whose labels match. On Free, the runner group "selected workflows" restriction is not available: the github.com docs say custom runner groups need GitHub Team, and an older GHES page says otherwise. Treat the restriction as unavailable.

The same hole applies to environment secrets. The `bot` and `triage` environments have no required reviewer. Without a deployment branch policy, a job on any branch that names `environment: bot` receives the App private key.

**How to avoid:**
- `powerbrowser-bot` gets no `workflows` permission. GitHub refuses a push that changes `.github/workflows/*` from a token without it, so the fixer and the bot cannot add a legion job. This is HIGH-value and cheap. Record the App's permission set in a tracked JSON body next to `.github/settings/` and read it back (`GET /repos/{r}/installation` with the App JWT).
- A legion pre-job hook, `ACTIONS_RUNNER_HOOK_JOB_STARTED`. It exits non-zero unless `GITHUB_REPOSITORY` is `DeBIOS-Foundation/powerbrowser`, `GITHUB_WORKFLOW_REF` is `…/.github/workflows/release.yml@refs/heads/main` (or the orchestrator's own path), and `GITHUB_EVENT_NAME` is `push` or `workflow_dispatch`. GitHub docs: a non-zero exit fails the job before any step runs, and the hook sees the default variables plus `GITHUB_EVENT_PATH`. On Free this hook is the only control that binds the runner itself rather than the workflow text.
- Every environment gets a deployment branch policy: `bot`, `triage` and `fixer` on `main` only, and `release` on `main` plus the release-tag pattern. The `repo-controls` row asserts that no environment has `deployment_branch_policy: null`.
- Renovate stays in "PR only, no automerge" (decision 4). Its branches run `verify.yml` on `ubuntu-latest` only, and the row below asserts that no workflow other than `release.yml`/`release-train.yml` names the self-hosted label.

**Warning signs:**
Any workflow file with `self-hosted` outside `release.yml`. `gh api repos/$R/environments --jq '.environments[] | select(.deployment_branch_policy == null) | .name'` returns a name. The legion runner log shows a job from a non-`main` ref.

**Phase to address:** A (GH-02 settings and the App permission body) and E (DIST-02 runner registration). The runner must not be registered before the pre-job hook exists (SEED-002 checklist item 15 is the blocker; add the hook to it).

---

### Pitfall 5: Actions cache poisoning reaches the release path

**What goes wrong:**
Any job that runs on the default branch with a cache-write token can save entries that a later `main` job restores. GitHub changed this on 2026-06-26: default-branch runs whose triggering event a non-collaborator can cause now get a **read-only** cache token. `workflow_dispatch`, `repository_dispatch`, `push` and `schedule` keep read-write. So the issue-triggered triage job is now read-only, but the fixer, the orchestrator and every Worker-dispatched job are still read-write. Under injection (Pitfall 1), Claude in such a job can rewrite an entry that the INF-04 hosted fallback build restores ("sccache on the Actions cache", SEED-002 checklist item 22). That build produces release bytes. The TanStack incident (2026-05) followed this path from a cache to npm publish.

**How to avoid:**
- No job in `release.yml` or in the release half of `release-train.yml` restores from the Actions cache. That covers `actions/cache`, sccache's GHA backend, `setup-node`'s `cache:` and magic-nix-cache. legion's sccache is local disk, owned by the runner user. INF-04's hosted fallback build runs cold, with sccache off, and is accepted as slower.
- Fixer F1 has no `actions: write`, and cache writes there are harmless only if nothing in the release path reads the cache. The rule above is the real control.

**Warning signs:**
`cache` or `sccache` with `SCCACHE_GHA_ENABLED` in any release-path job. A hosted fallback build that finishes far faster than a cold build.

**Phase to address:** E (DIST-02, INF-04). Row: `workflow-trust-boundary` fails if a job reachable from the release environment uses a cache step.

---

### Pitfall 6: "Cross-built on legion" ships a Windows or macOS package with a Linux sidecar

**What goes wrong:**
SEED-002 section 1 relies on Mozilla's CI cross-building every repackage step on Linux. That holds for Gecko. It does not hold for the Theia sidecar. The bundled backend in this tree contains host-built native code: `theia/applications/browser/lib/backend/native/{drivelist.node, keytar.node, watcher.node, rg}` and `lib/prebuilds/linux-x64/pty.node` (all observed 2026-10-20). `drivelist` and `keytar` exist only as `build/Release/*.node` compiled by node-gyp. They have no win32 or darwin prebuild in `node_modules`. yarn installs only the host OS's optional packages (`@parcel/watcher-*`, `@msgpackr-extract/*`), although `theia/yarn.lock` lists the win32 and darwin variants (lines 404-510). `powerbrowser/packaging/package-linux.sh:60` hard-codes `prebuilds/linux-x64.node` for better-sqlite3, and `node-runtime.json` carries only `linux-x64`. A Windows NSIS or macOS DMG assembled on legion would contain a Windows or macOS Gecko and a sidecar that cannot load. The failure shows up at first launch on the target OS, after signing and publishing.

**How to avoid:**
- Build the Theia application per target OS on the matching hosted runner: `windows-latest` and `macos-26` with `yarn install --frozen-lockfile && yarn build`. Upload `lib/` plus `node_modules` natives as an artifact, and let the legion job (or the sign job) assemble Gecko and the sidecar. For a universal macOS build, `lipo` each `.node` file, `rg` and the Node binary from the arm64 and x64 builds. nodejs.org ships them as separate tarballs.
- Extend `node-runtime.json` per target, with per-target SHASUMS verification in the Node detector job (AUTO-04).
- New full-tier row `package-target-natives|node $REPO_ROOT/scripts/verify-package-natives.mjs <package>`. Every `.node` file, `rg` and `node` in the staged tree must be ELF x86-64 for Linux, PE32+ for Windows, or Mach-O universal for macOS, matching the package's target token. The self-test plants a Linux `.node` into a Windows staging copy.

**Warning signs:**
A Windows or macOS packaging script that copies from `theia/applications/browser/lib` on legion. `file` or a magic-byte read on `drivelist.node` inside a `.exe` or `.dmg` payload reports ELF.

**Phase to address:** H (PKG-10..13) and I (PKG-14..16). Write the row in C, so the Linux package is already checked by it.

---

### Pitfall 7: Same-ESR-version rollback, because the client does not order build IDs

**What goes wrong:**
RELEASING.md correctly says that a same-appVersion, distinct-buildID hop counts as an upgrade. The converse is the problem. `updateIsAtLeastAsOldAs` (`upstream/toolkit/mozapps/update/UpdateService.sys.mjs:1954-1962`) rejects an offer only when the versions are equal **and** the buildIDs are equal. An *older* buildID at the same appVersion is accepted. The updater binary's downgrade check (`upstream/toolkit/mozapps/update/updater/archivereader.cpp:160-165`) fails only when the installed appVersion compares newer than the MAR's productVersion. Equal passes. Because the version scheme keeps appVersion at the ESR version, `v153.5.1-2` → `v153.5.1-1` is a valid "update" to a client. Two consequences follow.
1. Security: anyone who can write the descriptor host (the `powerbrowser-updates` repo, its Pages project, or the Cloudflare account) can roll users back to an older signed revision, for example one that predates a PowerBrowser-side fix. The MAR signature does not prevent this, because the old MAR is genuinely signed.
2. Withdraw (REL-02): "the updater refuses downgrades, the fix is N+2" (RELEASING.md:641-645) is true across ESR versions only. Within one ESR version, repointing the descriptor at the previous revision does roll users back.

Also: if REL-01 makes builds reproducible by pinning `MOZ_BUILD_DATE` to the tag or ESR date, two revisions on the same ESR get the same buildID. Revision `-2` is then never offered to users already on `-1`.

**How to avoid:**
- Descriptor-publish job and channel-live row: the offered `buildID` must be strictly greater than every buildID already published for that appVersion, read from the Releases' `release-manifest.json` assets. Rollback is allowed only through an explicit `--rollback-to <tag>` input on the withdraw job, which the owner dispatches.
- Row `descriptor-monotonic|node $REPO_ROOT/scripts/verify-update-descriptor.mjs` in the full tier. It derives the published buildIDs from the tree's release manifests and fails on an equal or older buildID. The self-test plants a same-version older-buildID descriptor.
- Keep `MOZ_BUILD_DATE` derived from the build time, or from the commit time of the revision bump, never from the ESR tag.
- Narrow who can write `powerbrowser-updates`: the descriptor PAT has Contents write on that repo only (RELEASING.md secrets table), and the Cloudflare account has 2FA.

**Warning signs:**
A descriptor whose buildID is not greater than the last Release's. Two release manifests with the same buildID.

**Phase to address:** B (UPD-04 descriptor emit) and E (UPD-07, REL-02). Confidence MEDIUM: derived from upstream source and not exercised by a hop drill.

---

### Pitfall 8: The release-train orchestrator breaks on GitHub's chaining, token and approval mechanics

**What goes wrong (each one is independent):**
- **`workflow_run` chains stop at three levels.** GitHub docs say that in a chain A→F, E and F do not run. A detector → pin-bump → build → sign → descriptor → liveness chain built from `workflow_run` silently loses its tail.
- **App installation tokens expire after 1 hour** (GitHub docs, not extendable). A token minted at the start of a legion job is dead after a 54-minute build (RELEASING.md:681-690 timings) plus the queue time.
- **Stale approvals at a two-week cadence.** Release N waits at the `release` environment while N+1 arrives. Approving N's old pending deployment afterwards publishes the older build and tags it after N+1. GitHub's concurrency rule cancels the older *pending* run when a third arrives, which is not the behaviour the owner expects either.
- **Lost updates on the tracking issue.** Several jobs editing one issue body read-modify-write it and overwrite each other.
- **Immutable releases make a bad publish permanent.** After publish, assets cannot be added or changed. The tag is locked, cannot be deleted while the release exists, and its name cannot be reused even after the release is deleted (GitHub immutable-releases docs). A publish missing one asset therefore uses up that version.
- **`workflow_dispatch` only registers workflows on the default branch** and allows at most 25 inputs. The dispatch API returned 204 with no run id until 2026-02-19. Since then `return_run_details: true` returns the run (GitHub changelog). The Worker needs the run id to report the run on the tracking issue.

**How to avoid:**
- One `release-train.yml` with jobs chained by `needs:` and calls to reusable workflows (`uses: ./.github/workflows/<step>.yml`), or dispatches of child workflows with `GITHUB_TOKEN`. `workflow_dispatch` and `repository_dispatch` are the documented exceptions to "GITHUB_TOKEN events create no runs", so chaining needs no App token. Never use `workflow_run` for chaining.
- Mint the App token in the step immediately before its use, in the job that uses it, and never pass it between jobs.
- The sign job's first step compares its version with the latest published Release and exits if a newer one exists. When the train for N+1 starts, it cancels N's waiting run through the API and records "superseded by N+1" on N's tracking issue.
- The tracking issue is a **rendered view**, not a store. One final `always()` job derives each step's state from `needs.*.result` and the run's jobs API and rewrites the whole body in one write. This follows the "derive, never hand-keep" rule.
- Before publish, the draft's asset set must equal the set derived from the targets built in this run plus `SHA256SUMS`, `LICENSING.md`, `THIRD-PARTY-NOTICES.txt` and the source tarball. REL-01's revision field exists so that a burned version costs only a revision bump.
- Dispatch with `return_run_details: true` and store the run id. Validate every dispatched input in the workflow (tag regex as in `scripts/rebase-upstream.sh` WR-07), because the Worker's token can dispatch arbitrary inputs.

**Warning signs:**
A `workflow_run:` key in any release-train file. A `create-github-app-token` step in a job longer than 50 minutes before its use. Two release runs waiting at the `release` environment at the same time.

**Phase to address:** Orchestrator, built on E (DIST-02). Row: `workflow-trust-boundary` also fails on `workflow_run` inside the release-train set.

---

### Pitfall 9: Cloudflare Free limits break the "one Worker cron does everything" design, and the clock can stop without any signal

**What goes wrong:**
Workers Free limits (Cloudflare limits page): **10 ms CPU** per HTTP request and per Cron Trigger, **50 subrequests** per invocation, **5 Cron Triggers per account**, **100,000 requests/day for the whole account** (error 1027 above that), and 15 minutes of wall time per cron. SEED-002 rows 1, 4, 7 and 13 put the ESR detector, the Node detector, the delayed descriptor publish, liveness (one GET per update.xml, one HEAD per MAR, the runners API, a synthetic POST, download_count), pin-age checks and the D1 30-day delete into the Worker. Across three OS targets and several channels, the subrequest count approaches 50. Parsing nodejs.org `dist/index.json`, which lists every Node release, can exceed 10 ms CPU. Further problems:
- The GitHub App JWT in a Worker needs the private key in PKCS#8 format. GitHub issues PKCS#1 (`BEGIN RSA PRIVATE KEY`), and WebCrypto's `importKey` accepts only PKCS#8. Convert once with `openssl pkcs8 -topk8 -nocrypt`.
- The GitHub API returns 403 to requests without a `User-Agent`, and Workers `fetch` does not add one. Miniflare does, so the code works locally and fails once deployed.
- If the updates host falls back to `_worker.js` (SEED-002 checklist item 13), every client update check (one per 6 h, `nsUpdateService.manifest:1`) counts against the same 100k/day quota as `/events`. A `/events` flood, or about 25,000 active installs, would then stop update checks for the rest of the UTC day.
- When the Worker cron stops (an expired token, a deploy error, an account problem), nothing reports it. D-77 forbids `schedule:` in the product repo, so no GitHub-side clock can notice that the clock stopped.

**How to avoid:**
- Keep the Worker a **clock only**. The cron makes one subrequest, a `workflow_dispatch` of `release-train.yml` with a `mode` input (daily, liveness). Detection, liveness, descriptor delay and pin-age logic run in Actions, where CPU and subrequests are not constrained. This also keeps the logic in the product repo, where `verify-platform.sh` rows can test it. `/events` and the D1 cleanup stay in the telemetry Worker.
- Use a second Cloudflare account, or at least a separate Worker, for `/events`, and keep `updates.powerbrowser.org` on static `_redirects` only, so update checks never use Workers quota. The `_redirects` proxy rule satisfies the documented constraints: it has 10 placeholders, each referenced once, and a relative 200 target.
- Add a dead-man's switch outside the product repo. The Upptime repo (MON-02, which may use `schedule:`) or the `powerbrowser-updates` repo runs a daily scheduled check that the last release-train run started less than 26 h ago (`GET /repos/$R/actions/workflows/release-train.yml/runs?per_page=1`) and opens an issue otherwise. Start MON-02 early for this reason, or add a minimal watchdog workflow to `powerbrowser-updates` in D.

**Warning signs:**
Worker logs showing `exceededCpu` or `Too many subrequests`. The release-train run list has a gap of more than 24 h. A 403 from `api.github.com` in `wrangler tail` with a valid token.

**Phase to address:** D (INF-03) and the orchestrator. This changes SEED-002's automation map rows 1, 4, 7 and 13 from "Worker does X" to "Worker dispatches, Actions does X". Record that as an owner decision in requirements.

---

### Pitfall 10: The ESR detector goes blind during the 153→175 overlap window

**What goes wrong:**
Automation map row 1 reads `FIREFOX_ESR` from product-details and "guards the 153 major". On 2027-06-29, `FIREFOX_ESR` becomes `175.0esr`. ESR 153 continues to get point releases (153.23 to 153.27) until 2027-09-07. The guard prevents a wrong bump to 175, but the detector stops seeing 153.x security releases in exactly the window where the tree is still on 153. Live product-details today (fetched 2026-10-20) has `FIREFOX_ESR: "153.5.1esr"`, `FIREFOX_ESR_NEXT: ""` and `FIREFOX_ESR115: "115.43.1esr"`. Whether a `FIREFOX_ESR153` key will appear after the flip is not documented.

**How to avoid:**
Detect from the tags themselves. List `refs/tags/FIREFOX_<major>_*esr_RELEASE` through the GitHub matching-refs API for the major the tree is pinned to, and use product-details only as a cross-check. The detector's self-test feeds a fixture where `FIREFOX_ESR` is `175.0esr` and a `FIREFOX_153_23_0esr_RELEASE` tag exists, and requires a 153.23 dispatch. Map only `_RELEASE` tags, never `_BUILDn` (respins).

**Warning signs:**
No ESR pin-bump PR within 15 days of a whattrainisitnow.com 153.x date. The pin-age assertion (row 1, "within N days of FIREFOX_ESR") compares against 175 and fires false alarms after the flip.

**Phase to address:** A (AUTO-01). L (UPS-01) depends on it.

---

### Pitfall 11: macOS signing copies Mozilla's entitlements and leaves nested sidecar code unsigned

**What goes wrong:**
`upstream/security/mac/hardenedruntime/production/firefox.browser.xml:31-35` carries `com.apple.application-identifier` = `43AQ936H96.org.mozilla.firefox` (Mozilla's Team ID) and `com.apple.developer.web-browser.public-key-credential`, a restricted entitlement that Apple grants per team and that requires a provisioning profile. Signing PowerBrowser with that file under another Team ID makes AMFI kill the process at launch, and it puts a Mozilla identifier into a shipped signature, which the Mozilla-mark gate (LEG-01) must catch. The sidecar adds Mach-O code that Gecko's signing layout does not cover: the `node` binary, every `.node` file and `rg`. Notarization rejects any unsigned nested Mach-O. `node` also needs `allow-jit` under the hardened runtime. On a Mac, an app launched from Downloads without being moved is App-Translocated to a randomized read-only path, so the update experience reports `cant-apply` (SEED-002 section 5) until the user moves the app.

**How to avoid:**
Derive PowerBrowser's entitlements from `developer/browser.xml`, without `get-task-allow` and `allow-dyld-environment-variables`, and with no `application-identifier` or passkey entitlement until Apple grants one. Add a row `mac-entitlements|node $REPO_ROOT/scripts/verify-mac-entitlements.mjs` that fails on any `43AQ936H96`, `org.mozilla` or restricted key in the signing inputs. Sign inside-out with rcodesign (natives, `node`, `rg`, then frameworks, then the bundle). The `cant-apply` copy needs a macOS variant that says to move the app to Applications.

**Phase to address:** I (PKG-14..16, SEC-04), with the copy in C (UPD-08).

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| One Worker cron holding all detection and liveness logic | No Actions minutes, one deploy | Hits the 10 ms CPU and 50 subrequest limits as targets grow; logic sits outside `verify-platform.sh`; a stopped clock gives no signal (Pitfall 9) | Never. The Worker is a clock and `/events` only |
| Giving the fixer `Bash` plus the App token in one job | One job, simpler YAML | Clinejection-class compromise (Pitfall 1) | Never |
| Hand-editing a conflicted hunk "just this once" | Saves a 1.1 GB clone | Silent no-op or wrong merge, invisible until a build or a user report (Pitfall 2) | Never. `regenerate-patch.sh` and the `patch-regenerated` row |
| Fine-grained PAT for the Worker instead of App JWT | No PKCS#8 conversion, no JWT code | Org default policy caps fine-grained PATs at 366 days (GitHub changelog 2024-10-18), so a yearly silent clock stop | Acceptable if `docs/RENEWALS.md` carries the date and the dead-man's switch exists |
| Cross-building the sidecar on legion for Windows and macOS | No hosted Windows or macOS minutes | Packages that do not start (Pitfall 6) | Never for the sidecar. Gecko cross-build is fine |
| Hosted fallback build restoring sccache from the Actions cache | Fallback build in tens of minutes | Cache-poisoning path into release bytes (Pitfall 5) | Never in the release path. A cold fallback build is acceptable |
| `MOZ_BUILD_DATE` pinned for reproducibility | Reproducible buildID | Same-ESR revisions are never offered (Pitfall 7) | Only if the revision bump also moves the date |
| Leaving `drivelist.node` with a `/nix/store` RUNPATH (observed: glibc-2.42 and gcc-15.3.0-lib paths) | Works today, because the loader falls back to system paths and the max symbol is GLIBC_2.14 | Leaks build-host paths. A future native built against GLIBCXX_3.4.34 fails on Ubuntu 24.04. Breaks a naive "no /nix/store" row | Strip the RUNPATH with `patchelf --remove-rpath` at staging. The portable-ELF row checks interpreter and RUNPATH |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| claude-code-action on Renovate or bot PRs | The action refuses bot actors by default, so the fixer never starts on a red Renovate PR. The quick fix is `allowed_bots: '*'`, which the docs say any third-party App can then exploit | `allowed_bots: 'renovate[bot],powerbrowser-bot[bot]'`, an explicit list |
| claude-code-action `show_full_output` | `ACTIONS_STEP_DEBUG=true` turns it on automatically, and on a public repo the log then shows tool results and file contents | Never set the debug secret or variable on the product repo. Debug the fixer in a private fork |
| claude-code-action and PR checkouts | The action restores `.claude/` and `CLAUDE.md` from base, but `package.json`, lockfiles and scripts stay at the PR head, so hooks and `yarn` commands run PR-controlled code | The fixer works only on same-repo branches from the bot or Renovate, and never runs `yarn install` with scripts. verify.yml already uses `--ignore-scripts` |
| GitHub App for PRs and tags | Granting `workflows: write` "in case Dependabot-like bumps are needed" | No `workflows` permission. Dependabot owns the action bumps (its SHA-pin comment rewrite is documented, changelog 2022-10-31) |
| Auto-merge enabled repo-wide (SEED-002 section 6) | The App holds PR write and can call `enablePullRequestAutoMerge`, and with no required review the fixer PR merges itself when CI passes, which breaks "never merges" | Ruleset on `main`: PRs need one approving review, the owner is a bypass actor for direct pushes, and the App is not. The owner can approve, because the App is the author. `repo-controls` reads it back |
| Cloudflare Worker → GitHub API | No `User-Agent`, PKCS#1 key, 204 without a run id | Set `User-Agent: powerbrowser-scheduler`, use a PKCS#8 key, `return_run_details: true` |
| Pages `_redirects` vs Functions | Adding any Pages Function or `_routes.json` later disables `_redirects` for matched routes (docs: redirects do not apply to Function routes) | The updates project has no Functions. A row asserts that the `powerbrowser-updates` tree has no `functions/` or `_worker.js` |
| security.txt on Pages | Assuming Pages serves `/.well-known/` (unverified) | Cloudflare's zone-level security.txt feature (Security → Settings) serves `/.well-known/security.txt` dynamically. Use it and remove the Pages dependency |
| product-details | Treating `FIREFOX_ESR` as "our ESR line" | Tags for the pinned major (Pitfall 10) |
| Releases + immutable | Uploading assets after publish, or re-running publish on failure | Draft → upload → verify the asset set → publish once. A failed publish leads to a revision bump |
| MAR product info | Signing a MAR whose embedded channel differs from `ACCEPTED_MAR_CHANNEL_IDS` (`powerbrowser-default`, `.mozconfig`) | The updater fails with `MAR_CHANNEL_MISMATCH_ERROR` 22 (`updatererrors.h:45`) after the download. The sign job reads the MAR product info block (`mar -T`) and compares it with the generated `.mozconfig` before `signmar -s` |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Complete MAR every two weeks | User bandwidth and GitHub egress. The current Linux tar.xz is 129,529,524 bytes (`/home/chris/coding/Power-Browser/objdir/dist/powerbrowser-153.5.0.en-US.linux-x86_64.tar.xz`, 2026-10-17) and the complete MAR is about the same size | PKG-21 measures it. Partial MARs via `make_incremental_update.sh` once three or more targets ship | About 25 releases a year × users. A GitHub release asset is limited to 2 GiB, so size is not the blocker |
| Workers account quota shared by `/events` and any Worker-served update path | Error 1027, update checks fail until 00:00 UTC | Static `_redirects` only for updates. `/events` on a separate account | 100k requests/day: about 25k installs at 4 checks a day, or a single flood |
| D1 write cap | `/events` writes fail | Rate-limit rule (Free: one rule, IP-only, 10 s window). Accepted risk in SEED-002 | 100k writes/day |
| Worker CPU on large JSON | `exceededCpu` | Parse in Actions, not the Worker | nodejs.org `index.json` parse is close to 10 ms |
| legion single runner | Queued jobs wait forever with no failure email (RELEASING.md:909-910) | Runner-online check in the release-train liveness mode, plus the dead-man's switch | Any legion outage during a security release |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Untrusted text inside `${{ }}` in `run:` | Shell injection with the job's token, independent of AI | Pass through `env:` and quote. The `workflow-trust-boundary` row greps for `github.event.(issue|comment|pull_request|head_commit|review)` inside `run:` |
| `pull_request_target` or `workflow_run` checking out PR head into the workspace root | Pwn-request (GHSL advisories) | No `pull_request_target` anywhere. `workflow_run` fixers check out base only, and the head only into a subdirectory via `--add-dir` (action security.md) |
| Environments without a deployment branch policy | `bot` App key available to any branch (Pitfall 4) | Branch policy on every environment, checked by `repo-controls` |
| Fixer able to touch patch 030 or `packaging/mar/` | Changes the update trust root | F2 path denylist (Pitfall 2) and owner-only review |
| Fixer or bot approving the `release` environment | Unattended publish | Required reviewer is the owner only. Admin bypass of protection rules disabled on `release` (docs: bypass is on by default) |
| Anthropic key with no workspace limit | Unbounded spend if the key leaks or a loop starts | A separate CI workspace with its own limit, plus key rotation in `docs/RENEWALS.md` |
| Withdraw job repointing to an older revision without a guard | Rollback becomes an attack surface (Pitfall 7) | Explicit `--rollback-to` input dispatched by the owner, and the monotonic row otherwise |
| Worker token able to dispatch any workflow with any input | A Cloudflare account compromise becomes Actions code execution with chosen inputs | Fine-grained `actions: write` on the product repo only, input validation in each workflow, Cloudflare 2FA |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Update errors surfaced on every 6-hourly check while the descriptor host 404s (the channel-reconcile blocker) | Repeated "could not check" notices | Status `error` is shown once per session, with Check again. Resolve the channel before the first release |
| macOS translocation reported as "folder is read-only" | User does not know to move the app | A macOS-specific `cant-apply` sentence: move PowerBrowser to Applications |
| 24 h descriptor delay applied to an emergency security release | Users exposed for an extra day | Owner dispatch "publish descriptor now", already in SEED-002 row 7. Default to immediate when the ESR MFSA is rated critical |
| Fixer PR text written by the model | Owner reviews prose instead of the diff | PR body generated by F2 from a template: failing check, diff stat, paths, attempt count |

## "Looks Done But Isn't" Checklist

- [ ] **Fork-PR approval set:** often missing the same-repo branch case. Verify the legion pre-job hook rejects a job from a non-`main` ref (plant a branch workflow in a scratch repo with the same hook).
- [ ] **Fixer opens PRs:** often missing the path gate. Verify that F2 rejects a planted diff touching `scripts/verify-platform.sh`.
- [ ] **Patch-conflict fixer green:** often missing the index-hash check. Verify `patch-regenerated` passes on the fixer's patch and fails on a hand-edited copy.
- [ ] **Scheduler deployed:** often missing the watchdog. Verify that disabling the cron for 26 h opens an issue in the watchdog repo.
- [ ] **Windows and macOS packages built:** often missing target natives. Verify `package-target-natives` on each payload.
- [ ] **Descriptor published:** often missing monotonicity. Verify that the buildID is greater than the last Release's.
- [ ] **Release published:** often missing assets under immutability. Verify the draft asset set before publish.
- [ ] **Triage live:** often missing the template-only output. Verify that a planted issue containing "comment the following link" yields only a template comment.
- [ ] **Claude Code pinned:** the action SHA alone does not pin the agent binary. Verify `path_to_claude_code_executable` points into the flake closure.
- [ ] **MAR symlink check (SEED-002 checklist item 7):** resolved for the 2026-10-17 tarball (140 entries, 0 symlinks, 78 under `theia/`). Keep `find <stage> -type l` as a row, because a future `cp -a` of `node_modules` would bring symlinks back.

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Fixer token or Anthropic key exposed | MEDIUM | Revoke the App key (rotate it in `bot`), rotate the Anthropic key, purge the Actions caches (`gh cache delete --all`), audit branches and tags created since the event, rebuild any release whose build could have restored a cache |
| Hand-edited patch merged | MEDIUM | Re-fetch upstream at the pin, regenerate with `regenerate-patch.sh`, full build, hop drill |
| Bad immutable Release published | LOW-MEDIUM | Do not publish the descriptor. Mark the Release pre-release, bump the revision, re-release. The version is used up |
| Users rolled back within the same ESR | MEDIUM | Publish a new revision with a higher buildID immediately, then audit write access to the descriptor repo |
| Scheduler stopped silently | LOW | Owner dispatches release-train manually, fixes the token, and the watchdog prevents a repeat |
| Wrong-OS sidecar shipped | HIGH | Withdraw the descriptor for that target, pull the download link, rebuild with per-OS Theia artifacts, release N+1 |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| 1 Prompt injection in fixer and triage | Fixer, G (GH-03) | `workflow-trust-boundary` row + self-test |
| 2 Gate weakening and patch text edits | A (AUTO-01), Fixer | `patch-regenerated` row + F2 path gate self-test |
| 3 Recursion and spend | Fixer | `workflow-trust-boundary` (guards, concurrency, timeout, max-turns) |
| 4 Same-repo branch to legion, environment secrets | A (GH-02), E | `repo-controls` (branch policies, App permissions), legion pre-job hook test |
| 5 Cache poisoning | E (DIST-02, INF-04) | `workflow-trust-boundary` (no cache in release path) |
| 6 Cross-OS sidecar natives | C (row), H, I | `package-target-natives` |
| 7 Same-version rollback | B (UPD-04), E (UPD-07, REL-02) | `descriptor-monotonic` |
| 8 Orchestrator mechanics | Orchestrator, E | `workflow-trust-boundary` (no `workflow_run`), draft asset-set check |
| 9 Cloudflare limits and silent clock | D (INF-03), Orchestrator | Watchdog issue test; Worker holds a single dispatch |
| 10 ESR overlap blindness | A (AUTO-01), L | Detector self-test with a 175 fixture |
| 11 macOS entitlements and nested signing | I | `mac-entitlements` row |

Proposed rows, in registry form (each with a `-self-test` sibling):

```
"workflow-trust-boundary|node $REPO_ROOT/scripts/verify-workflow-trust.mjs"            # --quick: parses .github/workflows/*.yml
"patch-regenerated|node $REPO_ROOT/scripts/verify-patch-index.mjs"                     # needs upstream/ applied; run in rebase job
"package-target-natives|node $REPO_ROOT/scripts/verify-package-natives.mjs"           # full tier, per staged package
"descriptor-monotonic|node $REPO_ROOT/scripts/verify-update-descriptor.mjs"           # full tier, release manifests
"mac-entitlements|node $REPO_ROOT/scripts/verify-mac-entitlements.mjs"                # --quick once entitlements are tracked
```

`workflow-trust-boundary` derives everything from the workflow files. It needs no hand-kept list beyond the allowed self-hosted workflow paths and the release-path job names, both read from `release-train.yml` itself.

## SEED-002 "Unverified" list: status after this research

Resolved:
- **MAR symlink claim:** refuted for the current packaging. The 2026-10-17 Linux tarball has 0 symlinks (`tar -tvJf`, 105 files, 35 dirs). Keep the row.
- **Fine-grained PAT expiry:** non-expiring fine-grained PATs exist for personal projects, but orgs and enterprises default to a 366-day maximum (GitHub changelog 2024-10-18). Yearly rotation is the right assumption unless the org owner changes the policy.
- **Dependabot rewriting SHA pins with the version comment:** yes (GitHub changelog 2022-10-31). MEDIUM.
- **Cloudflare `_redirects` and the 11-segment path:** the rule fits the documented constraints (named placeholders `:[A-Za-z]\w*`, each referenced once, no per-rule placeholder cap stated, 200 proxy to a relative URL, at most 100 dynamic rules). Not live-probed, so the DIST-03 probe still runs. LOW-MEDIUM.
- **Pages serving `.well-known`:** unresolved for Pages, and avoidable: Cloudflare's zone security.txt feature serves the path itself.
- **workflow_dispatch run correlation:** `return_run_details` since 2026-02-19.

Still open:
- signmar Nix closure size on a hosted runner. Mend's 30-minute cap against a Theia `yarn.lock` regeneration, and whether Mend runs the nix manager. Whether bot commits count as activity for the 60-day rule (now relevant only to the Upptime or watchdog repo). Anonymous `gh attestation verify` (search inconclusive; `/download` should give a fallback that verifies the bundle offline). Mozilla partner search codes under `org.debios`. The Windows updater rename with a live `node.exe`, and the Windows background-task path. Azure Artifact Signing price and eligibility. Apple certificate validity. Rulesets on Free public repos (one doc fetch was ambiguous; Phase A's POST and read-back settles it). Open Collective as a fiscal host. Node sidecar egress in verify-endpoints layer 3. nixpkgs cctools/apple-sdk cross toolchain. WebGL on WSLg. Flathub's build-from-source rule. Cachix PolyForm NC eligibility. The 500 MB artifact cap on public repos.
- **New open items from this research:** whether runner-group "selected workflows" restrictions exist on GitHub Free (docs conflict, so the pre-job hook is the control either way). Whether product-details publishes a `FIREFOX_ESR153` key after 2027-06-29. How long an environment approval waits before the job fails (not stated on the environments page).

## Sources

Tree and upstream (HIGH, read directly 2026-10-20):
- `upstream/toolkit/mozapps/update/UpdateService.sys.mjs:1954-1962` (`updateIsAtLeastAsOldAs`); `upstream/toolkit/mozapps/update/updater/archivereader.cpp:119-165`; `upstream/toolkit/mozapps/update/common/updatererrors.h:45-46`
- `upstream/security/mac/hardenedruntime/production/firefox.browser.xml:10-35`; `upstream/security/mac/hardenedruntime/developer/browser.xml`
- `scripts/apply-patches.sh:37-63`; `scripts/verify-platform.sh:3562-3600`; `scripts/rebase-upstream.sh` header; `.github/workflows/rebase-upstream.yml:33`, `verify.yml`; `.mozconfig`; `configuration.toml:115`
- `powerbrowser/packaging/package-linux.sh:27,47,57-60`; `powerbrowser/packaging/node-runtime.json:2`
- `theia/applications/browser/lib/backend/native/*` (readelf/objdump 2026-10-20); `theia/yarn.lock:404-510`
- `docs/RELEASING.md:305-370, 430-490, 630-690, 900-925`
- `/home/chris/coding/Power-Browser/objdir/dist/powerbrowser-153.5.0.en-US.linux-x86_64.tar.xz` (listing 2026-10-20)
- https://product-details.mozilla.org/1.0/firefox_versions.json (fetched 2026-10-20)

Official docs and vendor changelogs (MEDIUM/LOW per classify-confidence):
- https://github.com/anthropics/claude-code-action/blob/main/docs/security.md
- https://github.com/anthropics/claude-code-action/blob/main/docs/configuration.md
- https://developers.cloudflare.com/workers/platform/limits/
- https://developers.cloudflare.com/pages/configuration/redirects/
- https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows
- https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments
- https://docs.github.com/en/actions/how-tos/manage-runners/self-hosted-runners/manage-access
- https://docs.github.com/en/actions/how-tos/manage-runners/self-hosted-runners/run-scripts
- https://docs.github.com/en/code-security/supply-chain-security/understanding-your-software-supply-chain/immutable-releases
- https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-an-installation-access-token-for-a-github-app
- https://github.blog/changelog/2026-06-26-read-only-actions-cache-for-untrusted-triggers/
- https://github.blog/changelog/2026-02-19-workflow-dispatch-api-now-returns-run-ids
- https://github.blog/changelog/2024-10-18-new-pat-rotation-policies-preview-and-optional-expiration-for-fine-grained-pats/
- https://github.blog/changelog/2022-10-31-dependabot-now-updates-comments-in-github-actions-workflows-referencing-action-versions/
- https://github.com/gr2m/cloudflare-worker-github-app-example (PKCS#1 → PKCS#8 for WebCrypto)
- https://developer.github.com/changes/2013-01-31-user-agent-will-soon-be-mandatory

Incidents and research (LOW-MEDIUM, secondary coverage):
- https://simonwillison.net/2026/mar/6/clinejection ; https://snyk.io/blog/cline-supply-chain-attack-prompt-injection-github-actions/
- https://www.esecurityplanet.com/threats/ai-agents-create-critical-supply-chain-risk-in-github-actions/ (Aikido PromptPwnd)
- https://adnanthekhan.com/2024/05/06/the-monsters-in-your-build-cache-github-actions-cache-poisoning/ ; https://safedep.io/tanstack-github-actions-cache-poisoning/
- https://securitylab.github.com/advisories/GHSL-2024-178_RSSHub (workflow_run artifact poisoning)

---
*Pitfalls research for: PowerBrowser v1.6 Deployment setup*
*Researched: 2026-10-20*
