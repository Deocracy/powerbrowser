# Phase 57: Native crash reporting (K) - Context

**Gathered:** 2026-10-23
**Status:** Ready for planning
**Mode:** Auto-generated (discuss skipped via workflow.skip_discuss)

<domain>
## Phase Boundary

Native crashes are reported only after consent, to PowerBrowser's own store, with the symbols needed to read them, and the crash reporter is switched on only when every gate and the first Windows release allow it.

Requirements: TEL-09, TEL-07, TEL-12, TEL-13 (full text in `.planning/workstreams/deploy/REQUIREMENTS.md`).

- TEL-09: a hook-only patch gates the Glean crash ping, so no request reaches `incoming.telemetry.mozilla.org` before consent; a verify-endpoints run with the crash reporter enabled shows no such request.
- TEL-07: the collector parses the `extra` part as JSON with a Gecko-shaped self-test plant, the submit URL key is reconciled with `[urls].crash_report`, and a Worker `POST /submit` stores minidumps in R2 under a 30-day lifecycle.
- TEL-12: `mach buildsymbols` output is attached to each Release as part of the DIST-07 manifest asset set, a stackwalk runbook exists, and `docs/CRASH-POLICY.md` is rewritten.
- TEL-13: `--disable-crashreporter` is retired only after TEL-09, TEL-07 and TEL-12 pass and the first Windows release has shipped.

Out of scope for this phase: the events Worker itself (Phase 47/48, TEL-06/TEL-08/TEL-10), the release pipeline and DIST-07 manifest set (Phase 49/50), per-target descriptors (Phase 44), the Windows and macOS builds (Phases 54/55), and any second crash-reporting backend (Socorro, Sentry, GlitchTip — all out of scope per REQUIREMENTS.md).
</domain>

<decisions>
## Implementation Decisions

### Already decided (owner, 2026-10-20)
- All owner decisions in REQUIREMENTS.md "Owner Decisions" are binding (SEED-002 §12 recommended defaults plus the research additions).
- Decision 9 (crash reporter): keep `--disable-crashreporter` through the first Windows release; retire it only with TEL-09 and the Worker `/submit` (TEL-07). This is the TEL-13 gate.
- Decision 12 (canary delay, 24 h descriptor wait) and decision 20 (all of SEED-002 phases A–L) stand; nothing in this phase shortens them.
- External Gates table: Cloudflare R2 enablement before Phase E; the first Windows release (Phase 54) before TEL-13; ESR calendars are informational only here.

### Owner gates in this phase (stop points for autonomous execution)
- Enabling Cloudflare R2 (and a payment method if the free tier requires one), creating the crash-submit Worker route, the rate-limiting rule, and the R2 lifecycle rule are owner actions in the Cloudflare dashboard. Plans build the Worker source, `wrangler.toml`, lifecycle configuration and every check locally, and end with one `checkpoint:human-action` listing the exact deploy, probe and record steps; they do not deploy.
- The TEL-13 retirement flip (`--disable-crashreporter` removal, first release built with the reporter on) executes only after criteria 1–3 are green AND the first Windows release has shipped. Plans prepare the flip as a gated commit plus a `checkpoint:human-action`; no task flips it unconditionally.
- Pushing to GitHub, dispatching any workflow, and any live `verify-endpoints.sh --layer 3/4` run against Mozilla hosts beyond the loopback/static assertions are owner-observed; plans that need a live observation record the exact command for the owner and keep the committed check offline-deterministic.

### Assumptions about unfinished dependencies (plan against ROADMAP/REQUIREMENTS as written)
- Phase 48 (telemetry Worker on D1, `POST /events`, rate limiting, `verify-events-worker.mjs` idiom) is NOT built in this tree (no `worker/` dir). Assumption: Phase 48 lands first and establishes the `worker/` top-level directory, `wrangler.toml` shape, D1 schema idiom, rate-limit pattern and the synthetic-Request contract-gate shape; Phase 57 reuses all of them for `/submit` on R2 instead of inventing a second Worker layout. If Phase 48 chose a different store or gate shape, plan 57-02 adapts at execution time and records the delta in its SUMMARY.
- Phase 54 (first Windows release) is NOT shipped. Assumption: TEL-13 stays a gated, unexecuted flip until Phase 54 records the shipped release; plan 57-04 proves everything except the flip and stops at the checkpoint.
- Phase 49 (DIST-07 `release-manifest.json` asset set, `sign-publish` asset-equality check, SHA256SUMS) and Phase 50 (first public Linux release) are NOT built. Assumption: DIST-07 lands with a manifest-derived asset set and a byte-equality check that a symbols entry can extend; plan 57-03 authors the symbols addition against that assumed seam (manifest row + equality extension + runbook) and names the exact Phase 49 files it extends.
- Phase 44 (per-target descriptors, `build-update-xml.mjs`, `descriptor-monotonic`) is NOT built. Assumption: no descriptor change is needed for crash reporting (the submit URL is a build-time `application.ini` ServerURL, not a descriptor field); if Phase 44's descriptor gains a crash-related field, it is out of scope here.
- Phase 41 waits on the owner (live org/repo apply). Assumption: nothing in Phase 57 reads GitHub org state; the `workflows` row (GH-12) and zizmor row (AUTO-09) already constrain any new workflow or action this phase touches.

### Claude's Discretion
All other implementation choices are at Claude's discretion — discuss phase was skipped per user setting. Use the ROADMAP phase goal, success criteria, and codebase conventions to guide decisions.
</decisions>

<code_context>
## Existing Code Insights

Start from `.planning/research/v1.6-deploy/ARCHITECTURE.md` (Phase K row: TEL-09/07 only if the exclusion is retired; UPD-05 allowlist pass; R1 Nix-generate rule), `.planning/research/v1.6-deploy/SUMMARY.md` Phase K, `.planning/drafts/distribution/S8-reports-bug-error-crash-PLAN.md` (the gated TEL-07 sub-plan, items 1–7: extra-part fix, manifest-driven reporter, stock consent UI, `/submit` receiver, endpoint-surface close, symbols + runbook, policy rewrite), and `.planning/seeds/SEED-001-standard-distribution-updates-reports.md:91-94,124,154-157` (crash substrate probe: `--disable-crashreporter`, `--with-crashreporter-url`, `buildsymbols` no-op without `MOZ_CRASHREPORTER`, `dump_syms` on PATH in `.#firefox`, `breakpad.reportURL` as the about:crashes view-link base vs the baked `ServerURL` submit target, the `docs/REBRANDING.md:275` mislabel, the token-auth exposure paragraph to rewrite).

Load-bearing tree facts (all read 2026-10-23):
- `scripts/crash-collector.mjs` (loopback-only Antenna collector, zero-dependency): `SUBMIT_PATH='/submit'`, `MINIDUMP_PART_NAME='upload_file_minidump'`, `EXTRA_PART_NAME='extra'`, allowlist of 7 annotations, 16 parts / 8 MiB per part / 20 MiB body, throttle 60 submits per 60 s, 30-day retention sweep, `MAX_ANNOTATION_BYTES=4096`. The `extra`-part JSON parse with allowlist + size cap per key already exists (~lines 271–295); a malformed `extra` is dropped with the report kept.
- `scripts/verify-crash-collector.mjs` (contract gate) + `scripts/verify-ng-068-crash-extra-part.mjs` (loopback live check deriving the `extra` filename/MIME from `upstream/toolkit/crashreporter/client/app/src/net/report.rs` at check time; three assertions: Gecko-shaped extra stored through the allowlist, malformed extra kept with nothing stored, per-part fallback still works).
- `docs/CRASH-POLICY.md` (reviewable source the gate pins): ping-vs-report routing, allowlist, 30-day retention, throttle, rejection vocabulary, loopback-only exposure paragraph (`:76-81`, the "needs token auth" lines the S8 plan rewrites), operator runbook.
- `.mozconfig:15` carries `ac_add_options --disable-crashreporter`, emitted by `scripts/generate.mjs:1489`; `powerbrowser/endpoint-allowlist.json:35` denies `incoming.telemetry.mozilla.org`, `:180` blanks `toolkit.telemetry.server`, `:185` blanks `breakpad.reportURL` off `[urls].crash_report` (manifest-driven via `mozillaEndpointPrefs`, `scripts/generate.mjs:2609-2655`).
- Glean crash-ping path: `upstream/toolkit/crashreporter/crashping/src/lib.rs:22` `TELEMETRY_SERVER = "https://incoming.telemetry.mozilla.org"`; `upstream/toolkit/crashreporter/client/app/src/glean.rs:12` consent key `datareporting.healthreport.uploadEnabled` with `determine_telemetry_enabled` defaulting to **true** when the profile dir, prefs file, pref value or read is absent (`:40-71`); `InitOptions::init_glean` sets `configuration.upload_enabled` from it (`:125`). Shipped branding pins `datareporting.healthreport.uploadEnabled=false` (`powerbrowser/branding/{dev,release}/pref/firefox-branding.js:62`, emitted at `scripts/generate.mjs:2452`).
- Submit-URL baking: `upstream/build/application.ini.in:48-50` `ServerURL=@MOZ_CRASHREPORTER_URL@/submit?...` under `#if MOZ_CRASHREPORTER`; `upstream/toolkit/moz.configure:3394-3405` `--with-crashreporter-url` (default `https://crash-reports.mozilla.com/`, right-stripped) and `:3474-3485` `--enable-crashreporter` (stock default ON for desktop Linux/Win/Mac). `[urls].crash_report` schema at `scripts/lib/config-schema.json:117-123` (optional https URL); `manifestEndpointSources` (`scripts/generate.mjs:2714`) already covers `crash_report`; `scripts/verify-theia-endpoints.mjs` steps 1–4 assert fragment/allowlist agreement with stale-marked detection.
- `scripts/verify-endpoints.sh` (726 lines): `--layer 1|2|3|4` (1 = static prefs on the installed branding file, 3 = live unattended observation, 4 = sidecar egress); each layer has a `--positive-control` twin that must go red. No crash-reporter-enabled layer-3 assertion exists yet.
- Registry: `scripts/verify-platform.sh` carries `crash-collector`, `crash-collector-self-test`, `ng068-crash-extra-part` (quick, loopback-only) plus `theia-endpoints`/`theia-endpoints-self-test`, `telemetry`/`telemetry-self-test`, `webextensions` rows. No `TEL-09/07/12/13` rows exist yet.
</code_context>

<specifics>
## Specific Ideas

- TEL-09 patch shape (hook-only, via `scripts/regenerate-patches.sh`, never hand-edited): gate the crash-ping consent default fail-closed — `determine_telemetry_enabled` in `upstream/toolkit/crashreporter/client/app/src/glean.rs` returns true on every absent/unreadable input today, so a fresh profile with no `prefs.js` uploads to `incoming.telemetry.mozilla.org` before any consent. The patch flips the three absent-input defaults (no profile dir, no prefs file, no pref value, unreadable file) to false, keeping the explicit-true path intact so the reporter works after consent. Companion assertion: a new `verify-endpoints` layer-3 probe with the reporter enabled observes zero requests to `incoming.telemetry.mozilla.org` before consent, with a positive control (stock default / explicit true) that goes red. Which file the patch touches is the executor's call within `patches/` numbering; `patches/010..040` exist, so the crash patch takes the next free number and `check-patch-surface.sh` + `patches-regenerated` stay green.
- TEL-07 submit-URL reconciliation: ONE key drives BOTH surfaces — `[urls].crash_report` (full https URL) continues to drive `breakpad.reportURL` verbatim (the about:crashes view-link base), while the generator derives the `--with-crashreporter-url` ORIGIN (host-only, trailing-slash stripped, same rstrip idiom as `moz.configure`) from the same key, so the baked `ServerURL` and the view-link base cannot disagree. No new `[telemetry].crash_endpoint` key (the S8 draft's alternative); REQUIREMENTS.md names `[urls].crash_report` as the reconciled key and the plan follows it. The `crash-reports.mozilla.com` deny row (UPD-15, Phase 46) gains a reason extension in the same commit rather than a second entry.
- TEL-07 Worker shape: mirror Phase 48's `POST /events` Worker (same repo-top `worker/` dir, same synthetic-Request contract gate, same rate-limit + retention idiom) with a `POST /submit` route speaking the collector's exact contract (`upload_file_minidump` → `CrashID=<uuid>`, same rejection vocabulary, same 7-field allowlist, same caps) writing minidumps to R2 under a 30-day lifecycle rule; `verify-crash-collector.mjs` gains a Gecko-shaped `extra` self-test plant (the `report.rs`-derived shape ng068 already reads) so the contract gate itself proves the TEL-07 fix rather than leaving it to ng068 alone.
- TEL-12 symbols shape: `mach buildsymbols` (a no-op while `MOZ_CRASHREPORTER` is off) runs in the release job per BUILD_TARGET once the reporter is on; the symbols zip joins the DIST-07 manifest asset set with versioned + stable names, SHA256SUMS and the draft asset-equality check extended; a `minidump-stackwalk` runbook names the symbol path with a worked example; `docs/CRASH-POLICY.md` is rewritten (receiver is public-by-necessity and bounded-by-construction: rate limit, size/part caps, allowlist, no credential; loopback-only paragraph replaced; retention/throttle/vocabulary kept byte-consistent with the collector exports the gate pins).
- Research flag: none in SUMMARY for K. The three default-false flips, the ServerURL derivation, and the R2 lifecycle rule are all derived from the tree, not from external docs.
</specifics>

<deferred>
## Deferred Ideas

None — discuss phase skipped.
</deferred>
