# Phase 57: Native crash reporting (K) - Research

**Researched:** 2026-10-23
**Domain:** Gecko crash-reporter enablement: Glean crash-ping consent gating, Antenna `POST /submit` collection on R2, `mach buildsymbols` symbol archives, crash-policy documentation
**Confidence:** HIGH for in-tree mechanics (every load-bearing claim was read or executed this session); MEDIUM for the Worker/R2 and release-pipeline seams (Phase 48/49 artifacts do not exist yet and are assumed per CONTEXT.md)

## Summary

Everything Phase 57 needs is either already in the tree or is a small derivation of something in the tree. The collector (`scripts/crash-collector.mjs`) already parses Gecko's single-`extra` annotation part as JSON with the allowlist and size caps applied per key, and both gates already prove it with Gecko-shaped plants (`verify-crash-collector.mjs` Plant 8, `verify-ng-068-crash-extra-part.mjs` reading the wire shape from `upstream/.../report.rs` at check time). The manifest key `[urls].crash_report` already exists in schema, generator (`breakpad.reportURL`), endpoint-source list and the theia-endpoints gate — only its *value* is unset and only the *mozconfig* (`--with-crashreporter-url`) derivation is missing. The Glean crash ping's consent read (`determine_telemetry_enabled` in `upstream/toolkit/crashreporter/client/app/src/glean.rs`) defaults to **true** on every absent/unreadable input, which is the exact fail-open TEL-09 exists to close with a hook-only patch. `mach buildsymbols` is a selector that is a no-op while `MOZ_CRASHREPORTER` is off, and `dump_syms` is already on PATH in the `.#firefox` shell via `inputsFrom pkgs.firefox-esr-153-unwrapped`.

Five facts change the plan's shape:

1. **TEL-07's collector half is DONE; only the value, the mozconfig origin derivation and the Worker are missing.** The `extra`-as-JSON parse, the Gecko plant in both gates, the policy paragraph, the `urls.crash_report` schema row and the `breakpad.reportURL` derivation all exist (verified line-by-line 2026-10-23). What is missing: a stated `crash_report` value, a `--with-crashreporter-url` origin derivation in `emitMozconfig`, the crash-host `allow` + `manifest` allowlist row with the `breakpad.reportURL` expect flip, and the `POST /submit` → R2 Worker (which assumes Phase 48's `worker/` layout, wrangler shape and contract-gate idiom).
2. **TEL-09's fail-open is precisely located.** `glean.rs:35-71`: no profile dir → true; no prefs file → true; no pref value → true; unreadable file → true. A fresh profile with no `prefs.js` therefore uploads the crash ping to `https://incoming.telemetry.mozilla.org` (`crashping/src/lib.rs:22` `TELEMETRY_SERVER`) before any consent. The hook-only patch flips those four defaults to false and keeps the explicit-true path intact. The shipped branding already pins `datareporting.healthreport.uploadEnabled=false` (both variants, `firefox-branding.js:62`), which is the defense-in-depth half; the patch is the fail-closed half.
3. **Submit URL reconciliation needs no new manifest key.** `[urls].crash_report` stays the only setting: stated as a full https URL with path (schema example + TEL-03 fixture shape), emitted verbatim to `breakpad.reportURL` (the about:crashes view-link base), while a new pure helper derives the *origin* (idempotent with `moz.configure`'s `rstrip("/")`) for `--with-crashreporter-url`, because `application.ini.in:50` appends `/submit?...` to the configure value. One key, two consumers, derived — never two keys that can disagree.
4. **The symbols selector and naming are read from the tree.** `upstream/Makefile.in:134-145`: full-symbols → both archives; elif `MOZ_CRASHREPORTER` → `symbolsarchive`; else skip with a message. `package-name.mk:40-41`: `SYMBOL_ARCHIVE_BASENAME=$(PKG_BASENAME).crashreporter-symbols`, so output is `objdir/dist/<pkg>.crashreporter-symbols.zip` per BUILD_TARGET. DIST-07 (Phase 49, assumed) contributes the manifest asset set + draft asset-equality check that a `symbols_zip` entry extends; the plan names that seam instead of inventing a release job.
5. **TEL-13 is a gated flip, not a task that "passes".** Removing `--disable-crashreporter` touches `scripts/generate.mjs:1489`, `.mozconfig:15`, the tracked `.mozconfig` comparand (`generate.mjs:3542-3545`, byte-identity gate), the allowlist reason at `endpoint-allowlist.json:183-185`, `CRASH-POLICY.md:9-13` and `RELEASING.md`, forces a tier-3 rebuild, and is forbidden until criteria 1–3 are green AND Phase 54 ships Windows (owner decision 9). Plan 57-04 stages the flip behind a `checkpoint:human-action` and never executes it unconditionally.

**Primary recommendation:** Run in order:
1. TEL-09 first: the hook-only consent-default patch (regenerated, never hand-edited) plus a new `verify-endpoints` layer-3 assertion — with the reporter build enabled in the probe — that observes zero requests to `incoming.telemetry.mozilla.org` before consent, with a positive control (stock default / explicit true) that goes red. New registry row + self-test.
2. TEL-07 second: generator origin derivation (kept inert until TEL-13), crash-host allowlist row + expect flip, Worker `POST /submit` → R2 with 30-day lifecycle + contract gate reusing the collector's vocabulary/caps/allowlist, wrangler + lifecycle config, Gecko-shaped `extra` plant added to `verify-crash-collector.mjs` self-test.
3. TEL-12 third: `mach buildsymbols` per BUILD_TARGET into the DIST-07 asset set (manifest row + equality extension + SHA256SUMS), `minidump-stackwalk` runbook, `docs/CRASH-POLICY.md` rewrite (public-by-necessity, bounded-by-construction).
4. TEL-13 last: the retirement flip as an owner-gated checkpoint only.

Every new check is one registry row in `scripts/verify-platform.sh` plus its `-self-test` sibling, deriving expectations from the tree and comparing as set equality.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Glean crash-ping consent default | Hook-only patch under `patches/` (regenerated via `scripts/regenerate-patches.sh`) | `datareporting.healthreport.uploadEnabled=false` in shipped branding prefs (already present) | Fail-closed default in the binary + stated intent at the pref layer; patch stack stays the only Gecko touchpoint |
| Consent proof | `scripts/verify-endpoints.sh` layer 3 with reporter-enabled build, derived host from `crashping/src/lib.rs` | Registry row + self-test | Layer 3 is the unattended-observation layer; derivation keeps the host from becoming a hand-kept literal |
| Collector contract | `scripts/crash-collector.mjs` (loopback dev mirror, zero deps) | `scripts/verify-crash-collector.mjs` + `verify-ng-068-crash-extra-part.mjs` | Contract already pinned; TEL-07 extends the self-test, not the contract |
| Submit URL (view-link base) | `[urls].crash_report` → `breakpad.reportURL` verbatim (exists) | `verify-theia-endpoints.mjs` checks 1–4 (exist) | About:crashes view-link base, unchanged semantics |
| Submit URL (baked ServerURL) | New pure `crashReporterOrigin(config)` in `scripts/generate.mjs` → `--with-crashreporter-url` (conditional on key stated; `--disable-crashreporter` literal while unset) | Tracked `.mozconfig` comparand via TARGETS byte-identity (exists) | One key, two consumers; the comparand turns a new line into a gated change |
| Crash report ingestion | `worker/` `POST /submit` → R2, 30-day lifecycle rule | Synthetic-Request contract gate (`verify-events-worker.mjs` idiom from Phase 48, assumed) | Same vocabulary/caps/allowlist as the collector; R2 lifecycle replaces the sweep (no second job) |
| Symbols | `mach buildsymbols` per BUILD_TARGET in the release job (Phase 49, assumed) | DIST-07 manifest `symbols_zip` entry + draft asset-equality extension + SHA256SUMS | Symbols ride the existing asset pipeline; no second pipeline |
| Stackwalk reading | Runbook (appendix of `docs/CRASH-POLICY.md`) over unpacked per-target symbol zips | `minidump-stackwalk` via a nix-provided binary (not a flake input) | One reviewable source; operator tooling stays out of the build closure |
| Policy source of truth | `docs/CRASH-POLICY.md` (rewritten) | Collector gate pins its literals; Worker gate pins the shared vocabulary | Doc wins on drift, per the header both gates already state |
| Reporter retirement | TEL-13 checkpoint in plan 57-04 (owner action, after Windows ships) | Owner amends the standing exclusion; this phase never edits `.planning/milestones/` | Owner decision 9; a flip coupled to a tier-3 rebuild and a shipped Windows release is not an automated step |

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
#### Already decided (owner, 2026-10-20)
- All owner decisions in REQUIREMENTS.md "Owner Decisions" are binding, including decision 9 (keep `--disable-crashreporter` through the first Windows release; retire only with TEL-09 and the Worker `/submit`).
- External Gates: R2 enablement (possibly needs a payment method on file) before Phase E; first Windows release before TEL-13.

#### Owner gates in this phase (stop points for autonomous execution)
- Cloudflare R2 enablement, Worker route creation, rate-limiting and lifecycle rules, and any deploy are owner actions. Plans end with one `checkpoint:human-action` carrying exact commands; they do not deploy.
- The TEL-13 flip executes only after criteria 1–3 are green AND Phase 54 ships. Plans stage it gated; no task flips unconditionally.
- Pushes, workflow dispatches and live network observations beyond loopback/static assertions are owner-observed.

### Assumptions about unfinished dependencies (from CONTEXT.md)
- Phase 48 (`worker/` layout, `wrangler.toml`, `POST /events` on D1, rate-limit idiom, synthetic-Request contract gate): plan 57-02 reuses the layout/gate shape; adapts and records deltas if Phase 48 diverged.
- Phase 54 (first Windows release): TEL-13 stays gated until it ships; plan 57-04 proves everything but the flip.
- Phase 49/50 (DIST-07 manifest asset set, sign-publish equality check, SHA256SUMS, first release): plan 57-03 extends the assumed seam and names the exact files.
- Phase 44 (descriptors): no crash descriptor field needed; out of scope.
- Phase 41 (repo controls): no GitHub org state read; GH-12/AUTO-09 rows already constrain new workflows/actions.

### Claude's Discretion
All other implementation choices are at Claude's discretion.

### Deferred Ideas (OUT OF SCOPE)
None — discuss phase skipped.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description (abridged from REQUIREMENTS.md) | Research Support |
|----|-------------|------------------|
| TEL-09 | Hook-only patch gates the Glean crash ping; verify-endpoints with the reporter enabled shows no `incoming.telemetry.mozilla.org` request before consent | `crashping/src/lib.rs:22` TELEMETRY_SERVER; `client/app/src/glean.rs:12,35-71` four default-true inputs; `CrashSubmit.sys.mjs:223-307` Glean crashSubmission metrics; shipped `uploadEnabled=false` at `firefox-branding.js:62` (both variants); `verify-endpoints.sh` layers 1/3 + positive-control twins; SUB-AGENT TEL-09 brief (pending — incorporated from orchestrator's own reads) |
| TEL-07 | Collector parses `extra` as JSON (self-test uses Gecko-shaped plant); submit URL key reconciled with `[urls].crash_report`; Worker `POST /submit` stores minidumps in R2 under 30-day lifecycle | Collector extra branch `:280-297` DONE; ng068 gate DONE (shape derived from `report.rs:27-30,67-80`); `verify-crash-collector.mjs` Plant 8 (`:426-470`) DONE; policy `:43-44` DONE; schema `config-schema.json:117-123` + `mozillaEndpointPrefs` `:2649-2650` + `manifestEndpointSources` `:2714` DONE; missing: value, `--with-crashreporter-url` origin derivation, allowlist row + expect flip, Worker (assumes Phase 48); SUB-AGENT TEL-07 brief |
| TEL-12 | `mach buildsymbols` output attached to each Release as DIST-07 asset; stackwalk runbook; `docs/CRASH-POLICY.md` rewritten | `mach_commands.py:2696-2705` → `Makefile.in:128-145` selector (no-op without `MOZ_CRASHREPORTER`); `package-name.mk:40-41` naming; `dump_syms` on PATH in `.#firefox` via inputsFrom; `application.ini.in:47-51` ServerURL shape; DIST-07 seam assumed from Phase 49; SUB-AGENT TEL-12 brief |
| TEL-13 | `--disable-crashreporter` retired only after TEL-09/07/12 pass + first Windows release ships | `generate.mjs:1489` literal → `.mozconfig:15` + comparand `:3542-3545`; allowlist `:183-185` reason; policy `:9-13`; decision 9; S8 RETIRED/HELD gate precedent; SUB-AGENT TEL-12/TEL-13 brief |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- Never fork or patch Theia core. Never modify Gecko outside `patches/`; `git -C upstream diff` against the applied stack is the invariant. Firefox internals only through `PowerBrowserAPI.sys.mjs` (not touched here). Patches are regenerated via `scripts/regenerate-patches.sh`, never text-edited — the TEL-09 patch takes the next free number after 040 and `patches-regenerated` stays green.
- **One driver, one registry:** `scripts/verify-platform.sh`. Every new check is one registry row plus its `--self-test` sibling. No sibling driver.
- **Derive and compare; do not hand-keep an expectation list.** The crash-ping host derives from `crashping/src/lib.rs` at check time; the `extra` shape derives from `report.rs`; the ServerURL host derives from the manifest via the generator; set equality catches addition and removal. Never assert on the absence of a log line emitted by own instrumentation.
- **The residual-brand scan is a permanent gate.** Stage new files before trusting `node scripts/scan-brand-residue.mjs`. Only `inventory/brand-tokens.json` may name the originating product.
- **No internal identifier in user-facing copy.** Crash dialog copy stays stock; every new user-facing string names "PowerBrowser" and ends with a real on-screen next step. `shell-error-copy-no-internals` discipline applies to any new affordance.
- Builds run in `nix develop .#firefox` / `.#theia`; `node` works outside a shell, `yarn` does not. A `--quick` row uses no build, no browser, no display, no network — the layer-3 crash-ping assertion belongs to the full tier with an offline static half at quick if separable.
- Commit with explicit paths only (never `-A`/`-a`/`--amend`/stash); each plan's file list is the commit's path list.
- Never touch `ledger/` or any `scripts/verify-ng-NNN-*.mjs` (owner-locked). The Gecko-shaped `extra` plant goes into `verify-crash-collector.mjs` (not NG-scoped), and no existing NG file is edited.

## Standard Stack

No new packages. Everything uses what is already in the tree or the dev shells.

| Tool | Version (verified) | Purpose | Note |
|------|--------------------|---------|------|
| node | v24.21.0 (host) | All new check scripts | Same as existing rows |
| `mach buildsymbols` | upstream tree | Symbol archives per BUILD_TARGET | No-op until `MOZ_CRASHREPORTER` is on; runs in `.#firefox` |
| `dump_syms` | 2.3.9 via `.#firefox` inputsFrom | Symbol dumping during build | No flake change |
| `minidump-stackwalk` | to be provided via `nix run` / nixpkgs at runbook time | Reading minidumps per the runbook | Operator tool, recorded version; never a flake input |
| Cloudflare R2 + lifecycle rule | dashboard (owner) | 30-day minidump retention | No server of our own; lifecycle replaces the sweep |
| `wrangler` | 4.62.0 pinned in runbook (per RELEASING.md) | Worker deploy (owner runs) | Operator tool via `nix run`, recorded version |

**Installation:** none.

## Package Legitimacy Audit

No external packages are installed by this phase. The Worker imports nothing (plain runtime handler over synthetic Requests in its gate, mirroring the Phase 48 `/events` idiom). New check scripts are plain node over repository files. `minidump-stackwalk` and `wrangler` are operator tools run via `nix run` at recorded versions, never flake inputs.

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
profile prefs.js ──datareporting.healthreport.uploadEnabled──> crash-reporter glean.rs
        (absent/unreadable ──PATCHED──> false; explicit true ──> true after consent)
                                    │
                                    v
              crashping Glean ping ──UPLOAD BLOCKED pre-consent──> (no request)
              minidump ──CrashSubmit──> ServerURL (baked application.ini [Crash Reporter],
                           @MOZ_CRASHREPORTER_URL@/submit?...) ──> Worker POST /submit ──> R2 (30-day lifecycle)
                                                                               ──> CrashID=<uuid>

[urls].crash_report (full https URL, stated once)
   ├─verbatim──> breakpad.reportURL (about:crashes view-link base; blank while unset)
   └─origin────> --with-crashreporter-url (baked ServerURL origin; literal --disable-crashreporter while unset)

mach buildsymbols (per BUILD_TARGET, reporter on) ──> *.crashreporter-symbols.zip
   ──> DIST-07 manifest symbols_zip entry ──> Release assets + SHA256SUMS + equality check

docs/CRASH-POLICY.md (rewritten reviewable source)
   ├─pins── scripts/verify-crash-collector.mjs (locals + Gecko-shaped extra plant)
   ├─pins── scripts/verify-ng-068-crash-extra-part.mjs (wire shape from report.rs)
   └─pins── worker contract gate (shared vocabulary/caps/allowlist/retention)
```

### Recommended file layout (new or changed)

```
patches/050-powerbrowser-crash-ping-consent.patch  # NEW: next free number; glean.rs defaults true→false
scripts/generate.mjs                               # MOD: crashReporterOrigin() + conditional --with-crashreporter-url
scripts/lib/config-schema.json                     # UNCHANGED (urls.crash_report row exists)
configuration.toml                                 # MOD (docs comment only until TEL-13; no value stated yet)
powerbrowser/endpoint-allowlist.json               # MOD: crash host allow+manifest row; breakpad expect flip (same commit as generator)
scripts/verify-endpoints.sh                        # MOD: layer-3 reporter-enabled no-request assertion + positive control
scripts/verify-crash-collector.mjs                 # MOD: Gecko-shaped extra self-test plant (TEL-07)
worker/crash-submit.mjs (or Phase-48-shaped name)  # NEW: POST /submit → R2 (assumes Phase 48 layout)
worker/wrangler.toml                               # MOD/NEW: R2 binding + lifecycle (owner applies)
scripts/verify-worker-submit.mjs                   # NEW: synthetic-Request contract gate (Phase-48 idiom)
docs/CRASH-POLICY.md                               # REWRITE: public-by-necessity receiver, symbols, stackwalk runbook
scripts/verify-platform.sh                         # MOD: new rows + self-test rows (TEL-09 endpoints probe, submit gate, symbols gate)
```

## Threat Model (research-level; planner mints per-plan T-57-NN registers)

| Concern | Severity | Where the plan answers it |
|---|---|---|
| Crash ping uploads before consent (fail-open defaults) | high | TEL-09 patch flips the four defaults; layer-3 assertion proves zero requests; positive control proves the assertion can go red |
| Minidump store unbounded / kept forever | high | R2 30-day lifecycle rule (no second job); collector sweep stays for the loopback mirror; retention stated identically in policy and Worker header |
| Public receiver flooded / abused | high | Collector caps + throttle vocabulary reused; one Cloudflare rate-limiting rule (owner records threshold verbatim); oversized/malformed rejected before write; 200-soft on throttle so clients do not retry into a queue |
| Submitter fields widening the stored set | medium | 7-field allowlist + 4096 B cap + scalar-only enforced in BOTH collector and Worker; gates plant extra keys and require them dropped |
| Submit URL and view-link base disagreeing | medium | Single-key derivation (origin from the same `[urls].crash_report`); theia-endpoints checks 1–4 prove agreement; stale-marked detection |
| Symbols missing for a shipped build | medium | Per-BUILD_TARGET `mach buildsymbols` in the release job; manifest entry + equality check; runbook names the symbol path per target |
| Reporter flipped on before Windows ships / before gates green | high | TEL-13 checkpoint: flip commit staged but unexecuted; owner writes RETIRED post-Windows; no task removes the literal unconditionally |
| Second crash backend / analytics creep | medium | Out-of-scope table (Socorro, Sentry, GlitchTip, product analytics) enforced by plan prohibitions |
| Patch hand-edit degrading to silent no-op | high | Regeneration-only rule; `patches-regenerated` row stays green; self-test plants a hand-edited hunk |

## Open Questions (all answered or routed)

1. Whether the TEL-09 patch should touch `TELEMETRY_SERVER` — NO: the constant stays stock; the gate is the consent default, so post-consent uploads flow to the documented host and the pre-consent path sends nothing. (Recommended option taken.)
2. Whether to add `[telemetry].crash_endpoint` — NO: REQUIREMENTS.md names `[urls].crash_report` as the reconciled key; one key avoids a second source of truth. (Recommended option taken.)
3. Whether the Worker lives in this repo — YES: top-level `worker/`, same repo as the gates that pin it (S8 precedent). The website repo stays Pages-only. (Recommended option taken.)
4. Whether symbols need a new pipeline — NO: they extend DIST-07's assumed asset set. (Recommended option taken.)
5. Whether the runbook is a new file — NO: appendix of `docs/CRASH-POLICY.md`, the one reviewable source. (Recommended option taken.)
