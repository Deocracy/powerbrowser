# Phase 57 blocked and owner-pending items

Recorded 2026-10-31 by the autonomous executor for plans 57-01, 57-02 and 57-03 on branch `dsh/phase-57`.
Plan 57-04 (the TEL-13 flip) was not executed, by instruction.

## B1. 57-01 Task 1: the TEL-09 consent patch conflicts with the compiled-file guard (DECIDED, LANDED)

**Decided 2026-10-31: (a), implemented in 1d378bef (the `check-patch-surface.sh` exact-path exception, D-72/D-73
amended) and f02ada50 (patch 050, `scripts/verify-crash-ping-consent.mjs`, rows `crash-ping-consent` and
`crash-ping-consent-self-test`).** Only `glean.rs` is patched; `send_ping.rs` did not need a change (its
`--send-ping` path runs only behind CrashManager's in-process pref check). The record below is the original
blocker, kept as written.

**Settled: (a); implementation in progress in a sibling run.** The narrow `.rs` allowlist for the two
crash-reporter consent files (`toolkit/crashreporter/client/app/src/glean.rs` and `send_ping.rs`), with a
self-test plant that any other `.rs` path stays red. Settled by the autonomous run on 2026-10-31 under the
owner's instruction to decide items not needing owner input. The safety note below still binds until that
work lands.

**What the plan asks.** A hook-only patch, `patches/050-powerbrowser-crash-ping-consent.patch`, that fails the
Glean crash-ping consent read closed, plus a static gate, with `check-patch-surface` green on the new patch.

**What the tree shows.**

- Every consent switch lives in Rust. `determine_telemetry_enabled` (`upstream/toolkit/crashreporter/client/app/src/glean.rs:35-71`)
  returns `true` on the four absent or unreadable inputs, and `send_ping.rs` sets `upload_enabled: true` (`:24`, `:45-56`).
  `upstream/toolkit/crashreporter/crashping/src/lib.rs` has no config switch for the upload. The build-config files
  (`moz.configure`, `moz.build`, `.mk`) do not reach either function.
- `scripts/check-patch-surface.sh:23` lists `.rs` in `COMPILED_SUFFIXES`. The scan at `:30-60` fails any patch whose
  `+++ b/` path carries a compiled suffix. Any patch that flips the consent default must name a `.rs` path, so it
  cannot be green under the guard as written.
- Routes that would pass the guard are not fail-closed. A generated copy of the Rust under a non-`.rs` name would
  defeat the guard's stated purpose (D-72/D-73: the Gecko patch surface stays config-only). A build-time cfg has no
  effect on the runtime default. Neither was implemented.

**Decision needed from the owner (one of):**

- **(a) Recommended.** Amend D-72/D-73 with a narrow exception: `check-patch-surface.sh` accepts a `.rs` target only
  when the path is exactly `toolkit/crashreporter/client/app/src/glean.rs` (and `send_ping.rs` if the change needs it).
  Add a self-test plant that a different `.rs` path still goes red. Then 57-01 Task 1 proceeds as written:
  regenerate the patch with `scripts/regenerate-patches.sh`, add `scripts/verify-crash-ping-consent.mjs`, and register
  `crash-ping-consent` and `crash-ping-consent-self-test`.
- **(b)** Keep the guard as written. TEL-09 then has no binary-side fix, and TEL-13 (57-04) stays blocked until a
  non-Rust mechanism exists or the requirement is re-scoped.

**Safety note, binding.** Do not run 57-04 (the TEL-13 flip) until B1 is resolved. The committed tree still ships
`--disable-crashreporter`, so no crash data leaves a committed build. The fail-open consent default is present in
any reporter-enabled build.

## B2. 57-01 Task 2: the reporter-enabled layer-3 observation (NOT LANDED, pending B1)

B1 is landed (f02ada50), so this item now waits only on a reporter-enabled build on the owner machine.

The plan's Task 2 adds a layer-3 `verify-endpoints.sh` assertion with a consent-true positive control. The
assertion is meaningful only once the consent gate of B1 exists. Without it, a reporter-enabled run is expected to
show the crash-ping host before consent, so the assertion would be red by design. It is not committed in this run.

**Owner step, once B1 lands and a reporter-enabled build exists (tier 3, owner machine):** record the exact
`verify-endpoints.sh --layer 3` invocation and the extracted host set verbatim in `57-01-SUMMARY.md`.

## B3. 57-02 owner checkpoint: receiver deploy and probes (NOT EXECUTED, owner only)

Nothing was deployed, and no network write was made from this session. The owner runs, in order (the full runbook is
`worker/wrangler-crash.toml`, and the operator rows are in `docs/RELEASING.md`):

1. `nix run nixpkgs#wrangler -- --version`, and record the version.
2. Enable R2 on the Cloudflare account (dashboard). A payment method may be required by the free tier.
3. `nix run nixpkgs#wrangler -- r2 bucket create powerbrowser-crash-reports`.
4. Apply the 30-day lifecycle rule over prefix `crash/` (the rule is recorded in `worker/crash-r2-lifecycle.json`).
   Check the flag names against `nix run nixpkgs#wrangler -- r2 bucket lifecycle add --help` at the pinned version first.
5. `nix run nixpkgs#wrangler -- deploy --config worker/wrangler-crash.toml`.
6. Add ONE zone rate-limit rule, per IP, action block, path equal to `/submit`, on the crash hostname. Record the
   threshold and the period verbatim.
7. Probe from outside the account and paste all three responses verbatim into the operator record: a well-formed
   multipart submit (200 `CrashID=<uuid>`), an over-cap body (413 `Discarded=oversized_body`), and a burst past the
   rate limit (blocked).

**Crash host allowlist row (owner, when the key is stated).** `[urls].crash_report` is unset in this tree, so no
crash host exists in `powerbrowser/endpoint-allowlist.json`. When the owner states the key, the
`theia-endpoints` gate names the missing host. Add one row: disposition `allow`, `manifest: "urls.crash_report"`,
with a reason that states TEL-07. The gate's stale-marked check forbids adding that row before the key is stated.

## B4. 57-03 owner steps (NOT EXECUTED)

- Run `nix develop .#firefox --command ./mach buildsymbols` per target after a reporter-enabled build (tier 3,
  owner machine). Record each zip's name and SHA256, and the `minidump-stackwalk` version.
- The symbols join the live Release asset set at the TEL-13 flip. `scripts/verify-release-asset-set.mjs` is
  unchanged, and `scripts/verify-release-symbols.mjs` gates the derivation now.

## B5. Plan 57-04 (TEL-13 flip) and its gates (NOT RUN, by instruction)

Stays gated behind B1 and B3 and the first Windows release (Phase 54). The flip is a `checkpoint:human-action`.

## B6. TEL-13 prerequisites: the other send paths of the stock reporter (OPEN, found by the 57 review, WR-05)

The stock crash reporter has send paths that skip the per-crash dialog. None is locked in the tree, and no gate
covers them. Close both before 57-04 and before `docs/CRASH-POLICY.md` may claim dialog-only consent.

- `MOZ_CRASHREPORTER_AUTO_SUBMIT` (`upstream/toolkit/crashreporter/client/app/src/config.rs:177`): when set, the
  client skips the dialog (`logic.rs:115,531`, `main.rs:125,227`). Needs the launcher/startup environment to clear it
  (or a patch-free equivalent) and a gate that fails if it is not cleared.
- `browser.crashReports.unsubmittedCheck.autoSubmit2` (`upstream/browser/app/profile/firefox.js:2823`, default false)
  and the unsubmitted-reports backlog notification. Needs the pref locked false in the generated prefs/policies and
  a gate over `generate --check`.

Why not locked now: a locked pref changes the generated branding prefs bytes that the Phase 1 comparands pin, and
the environment variable is not a pref. Both belong with the TEL-13 flip, where the generated output may change.
