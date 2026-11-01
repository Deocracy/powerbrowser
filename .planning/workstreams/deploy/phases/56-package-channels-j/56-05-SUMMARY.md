---
phase: 56-package-channels-j
plan: 05
subsystem: package-channels
tags: [owner-checkpoint, flathub, winget, homebrew-tap, nix-cache]
requires: [56-04]
provides:
  - pre-checkpoint proof of the local state of plans 56-01 to 56-04
  - the Phase 56 checkpoint skeleton in docs/RELEASING.md (12 AWAITING-OWNER fields)
affects: [docs/RELEASING.md]
key-files:
  modified: [docs/RELEASING.md]
status: partial
tasks_executed: "1 of 2 (Task 2 is the owner checkpoint and was not executed)"
commits: 1
plan_head_before: a5f93b41
plan_head_after: ed646577
actuals:
  tokens: 1900
  tasks: 1
  commits: 1
---

# Phase 56 Plan 05: Owner checkpoint, pre-checkpoint proof Summary

Task 1 only: the local state of plans 56-01 to 56-04 is proven against the unapplied world and the 12-field
checkpoint skeleton is committed with no live value filled. Task 2 (the owner checkpoint) was not executed.

## Task status

| Task | Name | Status | Commit |
|------|------|--------|--------|
| 1 | Pre-checkpoint proof and checkpoint skeleton | complete | ed646577 |
| 2 | OWNER CHECKPOINT (accounts, exception, submissions, substitute proof, /download rows) | NOT EXECUTED (owner steps below) | none |

## Task 1 evidence

All runs are from the worktree `/home/chris/gsd-workspaces/deploy-w2-56-05/Power-Browser` (branch
`deploy/w2-56-05`, base `a5f93b41`). `upstream/` and `theia/node_modules` are symlinks into the main checkout and
`generated/` was copied in.

### `scripts/verify-platform.sh --quick` (worktree)

Result: 258 PASS lines in the summary, 6 FAIL. The six reds are the known worktree-environment reds, not
regressions of this plan:

- `single-copy-deps`
- `ng086-theia-react-node`
- `gui07-strip-spike-verdict`
- `gui07-strip-spike-verdict-self-test`
- `gui09-dependent-window-content`
- `gui09-dependent-window-content-self-test`

The authoritative green `--quick` for the whole set is the run on the merged head in the main deploy worktree.
That run was not seen here, and this summary does not claim a green line for these six rows.

The two zizmor rows were green in this worktree (`zizmor: PASS` and `zizmor: --self-test PASS`, zizmor 1.29.0,
`--offline`), so the plan's "zizmor rows excepted, nix-shell reason" case did not arise.

### Plan 56-01 to 56-04 rows and self-tests (the plan's automated verify, each run with `--only`)

All 14 exited 0:

| Row | Result line |
|-----|-------------|
| flake-repack-self-test | 17 planted faults went red, 2 controls stayed green |
| flake-repack | quick mode green; `v153.5.1-1` hash is the placeholder, refused by `--release` until the bot PR fills it |
| policies-update-split-self-test | 8 planted drifts red, 1 control green |
| policies-update-split | tarball carries no DisableAppUpdate; Nix repack and Flatpak copy add only DisableAppUpdate = true |
| binary-cache-self-test | 7 planted drifts red, 1 control green |
| binary-cache | Cachix and R2 share one interface in quick mode; cache-token row present; placeholders are the owner's |
| flathub-manifest-self-test | 22 planted faults red, 1 control green |
| flathub-manifest | submission-shaped in quick mode; pending exception derived |
| winget-manifest-self-test | 14 planted faults red, 2 controls green |
| winget-manifest | identifier, version and URL derive from the release key; installer is the marked fixture (A2); WINGET_TOKEN custody row present |
| homebrew-cask-self-test | 13 planted faults red, 2 controls green |
| homebrew-cask | version, url, sha256 derive from the release key; darwin deferral (A3) recorded; no signing claim |
| channel-release-jobs-self-test | 72 planted faults red, 7 controls green |
| channel-release-jobs | four legs and a dry run; flake leg opens a PR; tap and winget gated; no push to main; no credential written |

### Dry runs (docs/cache-flathub-checkpoint.md, docs/winget-tap-checkpoint.md)

- Cache config print (`node -p 'JSON.stringify(require("./nix/cache.json"), null, 2)'`): prints the `cachix`
  (`powerbrowser`, `https://powerbrowser.cachix.org`, key `@CACHIX_PUBLIC_KEY@`), `r2` (bucket
  `powerbrowser-nix-cache`, key name `powerbrowser-nix-cache-1`, host and key placeholders) and `interface`
  (two substituters, two trusted keys) blocks. Every owner value is still a placeholder.
- Flathub manifest static parse: `JSON.parse` of `flatpak/org.debios.PowerBrowser.json` prints `JSON OK`.
- `node scripts/verify-flathub-manifest.mjs --release`: exits 1 as documented. It refuses the placeholder
  `@FLATHUB_VERIFICATION_TOKEN@` ("the owner sets the TXT value at the Flathub verification step"). This is
  the expected pre-checkpoint state, not a failure to fix.
- Cask Ruby syntax through the locked nixpkgs (`nix ... shell --inputs-from . nixpkgs#ruby --command ruby -c
  homebrew-tap/Casks/powerbrowser.rb`): `Syntax OK`, exit 0.
- `wingetcreate update ... --out` dry run: NOT RUN. `wingetcreate` is not on PATH and nixpkgs has no
  `wingetcreate` attribute on `x86_64-linux`. The `--out` shape is checked statically instead by the
  `winget-manifest` row (it asserts the installer root keys and complete arch nodes that
  `wingetcreate update --out` writes, `scripts/verify-winget-manifest.mjs`). The real `--out` run stays an owner
  dry run, and it needs the Phase 54 Windows asset (A2).

### Checkpoint skeleton

`docs/RELEASING.md` gains a `## Phase 56 checkpoint` section with 12 numbered fields (Cachix reply, R2 state,
Flathub exception, Flathub PR, winget holder, winget token stored, winget PR, tap repo and commit, TXT value,
substitute log, /download rows, deferrals), each marked `AWAITING-OWNER`; `grep -c AWAITING-OWNER` prints 13
(12 fields plus the sentence that defines the marker). No live value is filled. The section names the
organisation `Deocracy` and, for the TXT record, `_flathub.debios.org` (the corrected name from the review fix IN-05,
not the `_flathub` shorthand in the plan text).

## Deviations from Plan

None to the tree. Two reporting notes:

1. The plan expected the two zizmor rows to be excepted; they were green in this worktree, so no exception is recorded.
2. The `wingetcreate update --out` dry run could not run (tool unavailable); the static `--out` shape check by the
   `winget-manifest` row stands in, and the real run is listed under the owner steps.

## Task 2: owner checkpoint (NOT EXECUTED)

The executor performs no live step. Owner steps, in order (text and commands are in
`docs/cache-flathub-checkpoint.md` and `docs/winget-tap-checkpoint.md`):

1. Cachix: send the licence email; record GRANTED or REFUSED with the date. If REFUSED, enable the R2 fallback and set
   the live backend to R2.
2. Flathub: create the account; send the build-from-source exception request; record the reply verbatim (ADMIT or
   DENY, with the date). Under ADMIT, open the submission PR from the owner account; paste the PR URL. Before the
   submission, run the owner-verify items from BLOCKED.md item 3 (checker `json` type, flatpak-builder `base` key).
3. winget: decide the credential holder (classic PAT, `public_repo`, dedicated bot account); fork
   `microsoft/winget-pkgs`; run `wingetcreate submit` on the rendered set once the Phase 54 Windows asset exists
   (until then DEFERRED-A2); store the PAT as `WINGET_TOKEN` in the `winget` environment; paste the PR URL.
4. Tap and DNS: confirm `Deocracy/homebrew-powerbrowser` exists (create it if missing); install the bot App on it;
   set the TXT record `_flathub.debios.org` with the value the Flathub Developer Portal shows after the submission is
   accepted; paste the repo name and the TXT digest.
5. Substitute proof: on a clean machine with the live cache config, run `nix build .#powerbrowser` and paste the
   substitute log lines proving no rebuild. This needs a published Release and a real `nix/pkg/release-hash.json`
   digest first (BLOCKED.md items 1 and 2).
6. /download: render `@RELEASE_REPO@` as `Deocracy/powerbrowser` (derive the slug from `configuration.toml`
   `[urls] release_notes`), paste `docs/download-nix.md` and `docs/download-flatpak.md` into the Phase 47 site, and
   paste the two live row URLs. Anything the site cannot carry is DEFERRED-A4.
7. Notarization-dependent legs (cask live, aarch64-darwin) are DEFERRED-A3 until Phase 55; the Windows-asset leg is
   DEFERRED-A2 until Phase 54.

Reply with 12 fields: CACHIX_REPLY, R2_STATE, FLATHUB_EXCEPTION, FLATHUB_PR, WINGET_HOLDER, WINGET_TOKEN_STORED,
WINGET_PR, TAP_REPO, TXT_SET, SUBSTITUTE_LOG, DOWNLOAD_URLS, DEFERRED (each deferred leg naming its assumption).
No secret value goes in the reply or the tree.

The 12-field reply is not yet received; there is no reply to record here. A continuation run records it verbatim
(values redacted), fills `docs/RELEASING.md`, and marks every unpasted leg deferred with its assumption. Until then
no listing, submission or substitute run is claimed as passed.

## Known Stubs

None added by this plan. The placeholders in `nix/cache.json`, `nix/pkg/release-hash.json` and the Flathub token are
the earlier plans' owner-filled values, tracked in BLOCKED.md.

## Self-Check: PASSED

- `docs/RELEASING.md` contains `Phase 56 checkpoint` and 13 `AWAITING-OWNER` strings (acceptance requires at least 10).
- Commit ed646577 is on `deploy/w2-56-05` and touches `docs/RELEASING.md` only.
- The five docs named by the acceptance criteria exist: `docs/cache-flathub-checkpoint.md`,
  `docs/winget-tap-checkpoint.md`, `docs/channel-train-mapping.md`, `docs/download-nix.md`, `docs/download-flatpak.md`.
