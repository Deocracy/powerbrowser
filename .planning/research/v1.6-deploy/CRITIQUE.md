# Critique: v1.6 Deployment setup research

**Reviewed:** STACK.md, FEATURES.md, ARCHITECTURE.md, PITFALLS.md against SEED-002 (read in full) and the tree, 2026-10-20.
**Method:** I checked tree citations with `sed`/`grep`/`tar` in this worktree and in `/home/chris/coding/Power-Browser`. I checked platform claims against GitHub docs (rendered page plus the docs markdown API), Cloudflare docs, the Renovate docs source, the claude-code-action `action.yml`, and live `gh api`, product-details and nodejs.org.

---

## 1. Coverage gaps

All twelve phases (A to L) and both owner additions are covered. FEATURES and ARCHITECTURE §9 both place every phase. The orchestrator is covered in depth (TRAIN-01..09, ARCH §4, PITFALLS 8/9), and so is the fixer (FIX-01..07, ARCH §5, STACK fixer table, PITFALLS 1-3). The gaps are smaller items that no file researches:

| SEED-002 item | Status in research | Gap |
|---|---|---|
| Decision 13 (home page has no version facts, or release.yml commits `release.json`) / automation row 9 (website deploys) | No file mentions `release.json` or the website deploy path | The synthesizer must carry decision 13 forward unresearched. It also has to decide whether release-train or release.yml owns the commit, if one exists |
| Row 16 (security notices: foundation-security-advisories atom feed) | Not mentioned | The maintenance sweep (TRAIN-07) could absorb it. No file says so |
| Decision 6 (FxA/Sync off) and decision 7 (Safe Browsing key) | One line each in FEATURES (UPD-05). Nothing on how to get a Safe Browsing key, or whether `identity.fxaccounts.enabled` belongs in the generator's emitter | Carry as unresearched. Decision 7 needs a RENEWALS row and a keyfile path on legion, and the legion build in a container (STACK) changes where that keyfile is mounted |
| Decision 8 (Pages vs Workers static assets) | One STACK line ("can move later without a rewrite") | Not a gap in substance |
| Decision 10 (signing timing) / D-U-N-S lead time | ARCH §9 row 0 only | Fine |
| INF-01 DNS move (Namecheap inventory, DNSSEC off, mail forwarding) | Named only, never researched | Owner-manual step. Keep SEED-002's text |
| Private vulnerability reporting route (SEED §4 row 12, §6) | Not mentioned | Keep SEED-002's text |
| LICENSING.md / THIRD-PARTY-NOTICES generation script and drift row (SEED §6) | PITFALLS mentions them only as release assets | Unresearched: `yarn licenses generate-disclaimer` under Yarn 1 vs Berry, and about:license output |
| KNOWN-ISSUES pinned issue copied by release.yml | One FEATURES line | Minor |
| MTX-01 Windows libvirt VM matrix (runner user libvirt access, snapshot revert, guest transport) | Named only | Phase H research flag |
| Decision 4 (Theia automerge off) and the Renovate host choice | Contradictory (see §3) | Needs an owner decision |
| Phase K (TEL-09/TEL-07) | FEATURES lists it; nothing new | Acceptable because the phase is optional |
| Toolchain baseline (AUTO-05) once releases build in a container | STACK raises it as a new open item | Owner decision: which toolchain `toolchain-baseline.txt` pins |

New items the research adds that SEED-002 lacks. The synthesizer should keep all of them:
- Cross-OS sidecar natives. The Theia `lib/backend/native/{drivelist,keytar,watcher}.node` and `rg` are host-built, and `package-linux.sh:60` hard-codes `linux-x64` (PITFALLS 6, confirmed in the tree).
- Same-ESR rollback through `updateIsAtLeastAsOldAs` (PITFALLS 7, confirmed).
- ESR detector blindness after the FIREFOX_ESR flip to 175 (PITFALLS 10).
- Cache poisoning into release bytes (PITFALLS 5).
- macOS entitlements that carry Mozilla's Team ID (PITFALLS 11, confirmed).
- The `release` environment's branch policy must be `main` (ARCH §1.5).
- rebase-upstream.yml runs generate outside Nix (ARCH R1, confirmed).
- No patch-regeneration script exists today (confirmed).

---

## 2. Claim checks (24 checked)

| # | Claim (file) | Verdict | Evidence |
|---|---|---|---|
| 1 | Pin is `FIREFOX_153_5_0esr_BUILD1` at configuration.toml:115 (all) | **Confirmed** | configuration.toml:115 |
| 2 | rebase-upstream.yml:33 carries the same pin as the `tag` input default (ARCH, STACK) | **Confirmed** | rebase-upstream.yml:33 `default: FIREFOX_153_5_0esr_BUILD1` |
| 3 | rebase-upstream.yml:108-115 runs `node scripts/generate.mjs` outside Nix, while verify.yml:14-20 says generate needs the pinned inkscape (ARCH R1) | **Confirmed** | rebase-upstream.yml:108-115 has no `nix develop`. verify.yml:14-20 states the inkscape 1.4.4 requirement. ARCH cites verify.yml:148-157 for it; the text is at :14-20 |
| 4 | patches/030:28-31 puts `mar-primary.der` in both slots | **Confirmed** | patch lines 30-31 |
| 5 | apply-patches.sh:48 uses `git apply --3way` | **Confirmed** | apply-patches.sh:48 |
| 6 | verify-platform.sh quick array opens at :3565, full block at :4629, `mar-update-hop` at :4725, ng063-065 at :4740-4742, `mar-update-hop-self-test` at :4461; quick means "no network" at :3563 (ARCH) | **Confirmed** (all eight line numbers) | verify-platform.sh |
| 7 | `SHELL_MESSAGE_KINDS` at PowerBrowserAPI.sys.mjs:295 has 4 kinds (ARCH) | **Confirmed** | shellStateLoad, shellStateSave, shellFlushed, shellArmWebTabHistory |
| 8 | `updateIsAtLeastAsOldAs` rejects only on equal version **and** equal buildID, so an older buildID at the same version is accepted (PITFALLS 7) | **Confirmed** | upstream/toolkit/mozapps/update/UpdateService.sys.mjs:1954-1962 |
| 9 | archivereader.cpp fails only when the installed version compares newer, so an equal version passes (PITFALLS 7) | **Confirmed** | archivereader.cpp:162-164 (`1 == versionCompareResult`) |
| 10 | URL substitutions are `encodeURIComponent`-ed, and the stock path has 11 segments after the host (STACK, FEATURES) | **Confirmed** | UpdateUtils.sys.mjs:114; application.ini.in:55 (`update/6/` + 10 placeholders + `update.xml`) |
| 11 | flatpak.py:186-191 refuses products other than firefox/thunderbird | **Confirmed** | `raise NotImplementedError()` at the `else` branch |
| 12 | The bootstrap sysroot is Debian jessie (STACK) | **Confirmed** for i386/amd64 | build-sysroot.sh:19-22. That jessie means glibc 2.19 is general knowledge, not checked in the tree |
| 13 | Windows cross mozconfig is two lines with `--enable-bootstrap` (working_with_esr_115.md:62-86); `win64-vs2026` is `local-toolchain: true` with `get_vs.py` (misc.yml:692-710); macOS SDK 26.5 comes from swcdn.apple.com (macos-sdk.yml) | **Confirmed** | upstream files |
| 14 | `signmar` is a target `Program` (modules/libmar/tool/moz.build) | **Confirmed** | moz.build:25 |
| 15 | Production entitlements carry `43AQ936H96.org.mozilla.firefox` and the passkey entitlement (PITFALLS 11) | **Confirmed** | firefox.browser.xml:31-35 |
| 16 | 2026-10-17 tarball: 129,529,524 bytes, 0 symlinks, 105 files + 35 dirs, 78 `theia/` entries (FEATURES, ARCH, PITFALLS) | **Confirmed** | `tar -tvJf` on /home/chris/coding/Power-Browser/objdir/dist/powerbrowser-153.5.0.en-US.linux-x86_64.tar.xz |
| 17 | `verify-trademark-surface.mjs` already exists and scans brand.ftl, brand.properties, Theia fragments and desktop Name lines (FEATURES: SEED item 18 is partial, not missing) | **Confirmed** | scripts/verify-trademark-surface.mjs header. SEED-002 item 18 is wrong |
| 18 | No regeneration script exists, and `verify-repo-controls.mjs` is absent (ARCH R2, FEATURES) | **Confirmed** | `ls scripts` |
| 19 | node-runtime.json pins v24.19.0; Node 24 latest is v24.22.0 dated 2026-10-14 (STACK) | **Confirmed** | node-runtime.json:3; nodejs.org/dist/index.json |
| 20 | verify.yml:43 and rebase-upstream.yml:51 pin checkout v4.4.0; verify.yml:53 pins install-nix-action v31.11.1; checkout latest is v7.0.1; create-github-app-token latest is v3.3.0 (STACK) | **Confirmed** | workflows; `gh api .../releases/latest` |
| 21 | claude-code-action v1.0.254 = commit `db77d4d3…`; inputs `path_to_claude_code_executable`, `anthropic_federation_rule_id`, `anthropic_organization_id`, `allowed_non_write_users`, `allowed_bots`, `show_full_output` exist (STACK, FEATURES, ARCH) | **Confirmed** | `gh api .../commits/v1.0.254` returns db77d4d3 (the tag object is c335fd6d, so pin the commit SHA); action.yml on main |
| 22 | Workers Free: 10 ms CPU for HTTP and cron, 50 subrequests, 5 cron triggers per account, 100k requests/day, 100 MB body (STACK, FEATURES, ARCH, PITFALLS) | **Confirmed** | developers.cloudflare.com/workers/platform/limits |
| 23 | GitHub: `workflow_run` chains stop at three levels; the 60-day schedule disable; a self-hosted job is cancelled after 24 h in queue; wait timer 1-43,200 min, public repos on Free; GITHUB_TOKEN-created PRs create **approval-required** runs; `workflow_dispatch`/`repository_dispatch` always create runs (ARCH, FEATURES, PITFALLS) | **Confirmed** (all six) | docs markdown API: events-that-trigger-workflows, actions/reference/limits, deployments-and-environments, concepts/security/github_token |
| 24 | "Rulesets on Free public repos: open / docs say Team-Enterprise" (ARCH §8, FEATURES, PITFALLS) | **Refuted** | The rendered about-rulesets page says: "Rulesets are available in public repositories with GitHub Free and GitHub Free for organizations, and in public and private repositories with GitHub Pro, GitHub Team, and GitHub Enterprise Cloud." The Team/Enterprise sentence in the page body applies to *organization-wide* rulesets. Live `GET /repos/DeBIOS-Foundation/powerbrowser/rulesets` returns `[]`. STACK is right |
| 25 | "Mend's runtime and concurrency limits are not documented" (STACK, Alternatives) | **Refuted** | renovate `docs/usage/mend-hosted/overview.md`: Community plan 1 concurrent job, 1 vCPU, 3 GB, 15 GB disk, 30 min timeout. FEATURES is right |
| 26 | "Runner offline: queued jobs wait forever" (PITFALLS Performance Traps, quoting RELEASING.md:909-910) | **Refuted** | Limits doc: "A job can be in the queue for 24 hours before it is automatically cancelled." ARCH is right. RELEASING.md:909-910 also needs a fix |
| 27 | Regeneration command `git -C upstream diff --full-index --abbrev=10` (ARCH) / `--full-index <tag>` (PITFALLS) reproduces the tracked format | **Refuted** | The tracked patches use 10-hex `index` lines (`index 3ea3d88b93..89317a4be2`, patches/010:2), and `--full-index` emits 40-hex. As written, a `--check` byte-compare would go red on every current patch. Use `--abbrev=10` without `--full-index`, or regenerate all five patches once in the same commit |
| 28 | NixOS `services.github-runners.<n>.githubApp` exists (STACK) | **Confirmed** | nixpkgs options.nix:76-77, :138. I checked the registry nixpkgs, not the flake's locked rev `ffb3c9b7` |
| 29 | Live product-details: FIREFOX_ESR `153.5.1esr`, FIREFOX_ESR_NEXT `""`, FIREFOX_ESR115 `115.43.1esr` (STACK, PITFALLS) | **Confirmed** | product-details.mozilla.org firefox_versions.json |
| 30 | Model prices (Opus 5.5 USD 4/20, Haiku 5.5 USD 0.10/0.50 per MTok), Azure Basic USD 9.99, Apple Developer ID certificates valid 5 years, Zen CVE-2026-41431, Clinejection details | **Unverifiable here** | Not re-fetched. Azure's price is a search snippet in both files. The CVE and the incidents are secondary sources (marked LOW/MEDIUM by their authors) |

---

## 3. Contradictions

| # | Between | Issue | Which side is right |
|---|---|---|---|
| C1 | ARCH §3.1 / SEED-002 row 2 vs ARCH §1.4 / §2 (App has no `workflows` permission) | The bump job edits `rebase-upstream.yml:33` (a workflow file) in the same commit as configuration.toml:115. An App without the Workflows permission **cannot push that commit**, so every ESR bump PR fails | **STACK** ("What NOT to add"): delete the `default:` on the `tag` input, and change `verify-upstream-pins.mjs:10-36` to assert that no default exists. Required change |
| C2 | STACK fixer table (App token with `contents: write` + `pull-requests: write` in the fixer job) vs ARCH §5.2 (three jobs; Claude never holds a write credential) and PITFALLS 1 (two-job split) | Whether Claude's job may hold a write token | **ARCH/PITFALLS.** Prompt injection must never reach a write credential. Adopt ARCH's fix → fix-gate → fix-pr split |
| C3 | STACK and FEATURES vs PITFALLS 1 on triage | STACK bans `allowed_non_write_users` on any Claude job. FEATURES and PITFALLS say triage needs it, because the action blocks non-write actors by default, so STACK's design would never run on a stranger's issue | **FEATURES/PITFALLS.** Triage only, with `issues: write` only, a template-only output step, and an explicit GITHUB_TOKEN (FEATURES: the input does not work with App auth) |
| C4 | STACK/FEATURES/ARCH (WIF with `id-token: write` on the fixer) vs PITFALLS 1.4 ("do not grant `id-token: write`") | PITFALLS' concern is that the action uses OIDC to exchange for the Claude GitHub App token | **Open; partly both.** Passing `github_token` explicitly should suppress that exchange, and WIF needs `id-token: write`. Verify in the action source at db77d4d3 before choosing. If unverified, use an `ANTHROPIC_API_KEY` in the `fixer` environment (ARCH's fallback) and no `id-token` |
| C5 | ARCH §4.1 (`workflow_run` wakes release-train) vs PITFALLS 8 row ("`workflow-trust-boundary` fails on `workflow_run` inside the release-train set") and FEATURES ("do not chain through `workflow_run`") | Whether `workflow_run` is allowed at all | **ARCH** as written: a single-level wake whose state is re-derived is not a chain. The PITFALLS row must forbid *chaining* (a workflow_run-triggered workflow that is itself a workflow_run source), not every use, or it will fail ARCH's design. Every use keeps the `head_repository` guard |
| C6 | STACK (ephemeral runner, second "runner App" key on legion) vs SEED-002 decision 2 and ARCH §5.3 (non-ephemeral, one-time registration token, nothing long-lived on legion) | Runner shape | **Owner decision.** Decision 2 is owner-approved. STACK's ephemeral design puts a long-lived App key on legion, which conflicts with ARCH's "no credential on legion". Present both; default to decision 2 |
| C7 | STACK (self-hosted `renovatebot/github-action` dispatched by release-train) vs ARCH flow 3 / §2 diagram (Mend Renovate app) vs SEED-002 (Mend) | Renovate host | **STACK**, recommended as a new owner decision. It keeps one clock (owner addition 1), and the bot App lacks Workflows, whereas Mend's App holds workflow scope (ARCH §5.3, PITFALLS 4). Mend's documented 3 GB / 30 min Community limits make a full Theia yarn.lock regeneration a risk as well |
| C8 | PITFALLS 4 (`release` environment branch policy = `main` **plus** the release-tag pattern) vs ARCH §1.5 (`main` only) | Release environment policy | **ARCH.** Tags are created after approval by the sign job, so a tag pattern matches no run (decision 3). A tag pattern only widens the policy |
| C9 | STACK (no Cachix/INF-05: the repack compiles nothing) vs FEATURES (INF-05 "needed by PKG-19") vs SEED-002 §1 ("A binary cache is required or every install compiles Gecko") | Nix cache | **STACK.** A `fetchurl` + autoPatchelf repack builds nothing heavy. SEED-002's statement is only true of a from-source flake output |
| C10 | STACK ("drop Upptime") vs ARCH/PITFALLS (Upptime or powerbrowser-updates hosts the dead-man watchdog on `schedule:`) | Status page / watchdog host | **ARCH/PITFALLS on the need for a watchdog.** Host it in `powerbrowser-updates` (descriptor commits every two weeks keep it active, so the 60-day rule is unlikely to bite). Whether bot commits count as activity is still unproven. Upptime stays optional |
| C11 | Regeneration script name and row: `regenerate-patch.sh <NNN>` + `patch-regenerated`/`verify-patch-index.mjs` (STACK, PITFALLS) vs `regenerate-patches.sh --check` + `patches-regenerated` (ARCH) | Naming, and two different checks (index-hash vs byte-equality) | Pick one script and one row. The byte-equality `--check` (ARCH) subsumes the index-hash check, but only after the `--abbrev=10` fix (claim 27) |
| C12 | STACK (Codeberg push as a release-train job with a `mirror` environment secret) vs ARCH (keep the legion timer; the sweep compares Codeberg `main` with GitHub `main` through the public API) | Mirror | **ARCH**: same detection, no new GitHub secret |
| C13 | SEED-002 rows 1/4/7/13 (logic in the Worker) vs all four research files (Worker is a clock only) | Worker role | **Research.** Confirmed by the limits (claim 22). Record it as an owner decision: it changes an approved automation map |
| C14 | SEED-002 row 7 (descriptor delayed by Worker cron, after the owner's own N-1→N hop) vs FEATURES/ARCH (environment wait timer 1440 min, owner bypass) | Canary mechanism | **Research**, with one loss: the wait timer does not require the owner's hop drill to have run. Either add a required reviewer on `descriptor`, or accept that the hop gate becomes advisory. Owner decision. PITFALLS also asks for admin bypass to be *disabled* on `release`; that is compatible only because these are separate environments |
| C15 | STACK "MAR symlink claim: Open" vs FEATURES/ARCH/PITFALLS "resolved: 0 symlinks" | Status | **FEATURES/ARCH/PITFALLS** (claim 16) |
| C16 | PITFALLS "Rulesets / Azure / Apple / Flathub / gh attestation: still open" vs STACK/FEATURES "resolved" | Status | **STACK/FEATURES** for all five. PITFALLS' list is stale relative to the other lenses |
| C17 | FEATURES "500 MB cap is the private-repo quota; public is free" vs STACK/ARCH "partly / open" | Artifact cap | **STACK/ARCH.** The limits table lists 500 MB for GitHub Free with no public-repo exemption. Keep it open: measure, use `retention-days: 1`, delete after sign-publish |
| C18 | STACK/SEED (cross-build Windows/macOS packages wholly on legion) vs PITFALLS 6 (Theia natives must be built per OS) | Cross-build scope | **PITFALLS** (confirmed: `package-linux.sh:60`, `lib/backend/native/*`). Gecko cross-builds on legion; the sidecar natives need per-OS hosted builds or prebuilds |
| C19 | SEED-002 §4 row 15 (RENEWALS `--quick` row goes red 30 days before a date) vs ARCH §3.4 (calendar-dependent quick rows redden unrelated commits) | Renewals gate | **ARCH.** Split it into `renewals` (quick, structure only) and `renewals-due` (maintenance sweep) |
| C20 | SEED-002 row 1 / FEATURES (ESR detector reads product-details FIREFOX_ESR) vs PITFALLS 10 (detect from `FIREFOX_153_*esr_RELEASE` tags, product-details as cross-check) | Detector source | **PITFALLS.** FIREFOX_ESR flips to 175 on 2027-06-29 while 153.x continues to 2027-09-07 |

---

## 4. SEED-002 "Unverified" status (consolidated across the four files)

| Item | Status | Basis |
|---|---|---|
| MAR symlink claim | **Resolved: false** (0 symlinks). Keep a `sidecar-no-symlinks` full row | Claim 16 |
| signmar Nix closure on a hosted runner | **Designed out** if signmar comes from the container build (STACK). Still unmeasured: that the jessie-sysroot signmar runs on ubuntu-latest with `LD_LIBRARY_PATH` | STACK; moz.build |
| Mend 30-min cap / nix manager | **Limits resolved** (3 GB, 30 min, 1 job). Fit to a Theia yarn.lock regeneration **open**. The nix manager is off by default (FEATURES, source-level). **Moot** if C7 goes to self-hosted Renovate | Renovate docs |
| Fine-grained PAT expiry | **Resolved**: non-expiring is possible, but the org default maximum is 366 days. Moot under the App-only design | GitHub PAT docs / changelog 2024-10-18 |
| Bot commits and the 60-day rule | **Open.** Matters only to the watchdog/Upptime repo | Docs do not define "activity" |
| Pages serves `.well-known` | **Open**, with an avoidance: Cloudflare zone-level security.txt (PITFALLS), or a Worker route | — |
| `gh attestation verify` for anonymous users | **Resolved: gh requires a login.** The API endpoint answers anonymously, so /download should offer `--bundle` + cosign | STACK local test; FEATURES cli/cli source |
| Mozilla partner search codes under org.debios | **Open** | — |
| Windows updater rename with a live node.exe | **Open** (needs the Windows matrix) | — |
| Windows background-task path | **Open** | — |
| Azure price / country eligibility | **Resolved (MEDIUM)**: about USD 9.99/month, US organizations eligible, free/trial/sponsored subscriptions refused | Microsoft quickstart and FAQ; price from a search snippet |
| Apple certificate validity | **Resolved (MEDIUM)**: 5 years. One LOW claim that the Developer ID CA expires 2027-02-01 needs checking before Phase I | Apple support page |
| Dependabot rewrites SHA pins with the comment | **Resolved: yes**, except compound comments | Changelog 2022-10-31 |
| Rulesets on Free public repos | **Resolved: yes** | Claim 24 |
| Open Collective as a fiscal host | **Open** | — |
| Node sidecar egress vs verify-endpoints layer 3 | **Open** | — |
| nixpkgs cctools/apple-sdk macOS cross | **Replaced** by Mozilla `--enable-bootstrap` (in tree). A live build is unproven; the Apple SDK licence question is a new LOW open item | Claim 13 |
| Gecko WebGL on WSLg | **Open** | — |
| Flathub build-from-source for a repack | **Resolved: the rule applies**, with exceptions case by case. PKG-20 defaults out of this milestone | flathub-infra requirements |
| Cachix PolyForm NC eligibility | **Moot** if C9 holds | — |
| 500 MB artifact cap on public repos | **Open (measure)** | Claim 23 / C17 |
| Cloudflare `_redirects` vs the 11-segment path | **Resolved on paper**: single-segment placeholders and a same-site 200. One live probe is still required | Claim 10; Pages redirects docs |

New open items from the research: runner-group "selected workflows" on Free (403 to this session's token, so it could not be probed; owner-admin probe in A3); whether product-details adds a `FIREFOX_ESR153` key after the flip; whether the RS256 JWT fits the Worker's 10 ms CPU limit; whether passing `github_token` suppresses the action's OIDC App exchange (C4); the Apple SDK licence for cross builds; the github-runner 30-day update rule vs nixpkgs lag; rcodesign has had no release since 2024-11; the toolchain-baseline meaning under a container build; how long an environment approval waits before failing.

---

## 5. Corrections the synthesizer must apply

1. **Delete the `default:` on rebase-upstream.yml's `tag` input** and change `verify-upstream-pins.mjs` to assert that it is absent. Otherwise an App without the Workflows permission cannot push any ESR bump (C1).
2. **Fixer credential split**: adopt ARCH §5.2's three jobs (fix with read-only token → fix-gate → fix-pr holding the App token). Strike STACK's "App token in the fixer job" row (C2).
3. **Triage needs `allowed_non_write_users`**, with an `issues: write`-only GITHUB_TOKEN and template-only output. Strike STACK's blanket ban (C3).
4. **Rulesets are available** on Free public repos (docs quote, claim 24). Remove "open/probe" from ARCH §8 and PITFALLS. Classic branch protection is no longer a fallback the plan needs.
5. **Mend limits are documented** (1 job / 3 GB / 30 min). Fix STACK's Alternatives row. Present self-hosted Renovate vs Mend as an owner decision, recommending self-hosted (C7).
6. **Self-hosted queue cap is 24 h, then cancel.** Fix the PITFALLS Performance Traps row, and plan a RELEASING.md:909-910 doc fix.
7. **The regeneration script must emit 10-hex `index` lines** (`--abbrev=10`, no `--full-index`), matching patches/010:2. Choose one name and one row (C11).
8. **SEED-002 item 18**: the Mozilla-mark gate is PARTIAL (verify-trademark-surface.mjs exists). The gap is NSIS, application.ini Name/Vendor and Info.plist.
9. **SEED-002 §3 wording**: GITHUB_TOKEN-created PRs create *approval-required* runs, not none. The App is still needed for unattended CI.
10. **Worker = clock only**; detection, liveness, pin-age and descriptor delay move to Actions. Record this as an owner decision that amends automation map rows 1, 4, 7 and 13 (C13).
11. **ESR detector reads tags for the pinned major** and uses product-details only as a cross-check, with a 175-flip fixture in its self-test (C20).
12. **`release` environment branch policy = `main` only** (C8). Every environment gets a branch policy, and `repo-controls` asserts there is no `null` policy.
13. **`repo-controls` is a full row, not quick**. Split RENEWALS into `renewals` (quick) and `renewals-due` (sweep) (C19).
14. **`workflow_run` is allowed only as a single-level wake** with a `head_repository` guard. Write the PITFALLS trust-boundary row to forbid chaining, not every use (C5).
15. **Windows/macOS sidecar natives are built per OS** (hosted runners). Add the `package-target-natives` row in Phase C (C18).
16. **Same-ESR rollback guard**: add a `descriptor-monotonic` check (buildID strictly increasing per appVersion), and do not pin `MOZ_BUILD_DATE` to the ESR tag (PITFALLS 7).
17. **No Actions cache in the release path**, and the INF-04 hosted fallback runs cold (PITFALLS 5). This amends SEED-002 checklist item 22's "sccache on the Actions cache".
18. **Drop INF-05 Cachix** from the first-pass scope unless a from-source flake output is planned (C9).
19. **The canary wait timer loses SEED-002's "owner hop first" gate**. Present it as an owner decision (C14).
20. **Pin claude-code-action by commit `db77d4d3…`**, not by the tag object `c335fd6d…`, and pin Claude Code through `path_to_claude_code_executable`.
21. **ARCH R1's verify.yml citation is :14-20**, not :148-157. The claim itself holds.
22. **Unverified-list consolidation**: use §4 above as the single status table, not any one file's list. PITFALLS' list is stale relative to STACK/FEATURES.
23. **Carry forward unresearched SEED-002 items verbatim**: decision 13/`release.json`, row 16 security feed, decisions 6/7, the INF-01 DNS move, the PVR route, and the LICENSING/THIRD-PARTY generator.
