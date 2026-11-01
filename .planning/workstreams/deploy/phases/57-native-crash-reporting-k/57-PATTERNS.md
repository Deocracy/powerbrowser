# Phase 57: Native crash reporting (K) - Pattern Map

**Mapped:** 2026-10-23
**Files analyzed:** 14
**Analogs found:** 13 / 14

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `patches/050-powerbrowser-crash-ping-consent.patch` (NEW) | patch (hook-only) | regenerate-only, never hand-edit | `patches/030-powerbrowser-mar-certificates.patch` (regenerated) + `patches/010` identity hook | exact |
| `scripts/regenerate-patches.sh` (USE, unchanged) | utility | `git -C upstream diff HEAD --abbrev=10` regeneration | itself (Phase 40 AUTO-10) | exact |
| `scripts/generate.mjs` (MOD: `crashReporterOrigin()` + conditional `--with-crashreporter-url`) | generator | transform | `emitIdentityConfigure` (`MOZ_APPUPDATE_HOST` host derivation from `urls.update`, lines 1586-1609) | exact |
| `powerbrowser/endpoint-allowlist.json` (MOD: crash-host row + `breakpad.reportURL` expect) | config | derive-and-compare target | `github.com` marked entry (`:90-92`, `manifest: "urls.issues"` shape) | exact |
| `scripts/verify-endpoints.sh` (MOD: layer-3 reporter-enabled assertion + positive control) | gate | live observation + fixtures | layer-3 `run_layer3_impl` + `run_layer3_control` twins; `--disposition-self-test` fixture loop | exact |
| `scripts/verify-theia-endpoints.mjs` (USE + extend fixtures only) | gate | derive-and-compare | itself steps 1–4 + stale-marked detection (`:142-182`, plants `:253-279`) | exact |
| `scripts/lib/endpoint-verdict.mjs` (USE, unchanged) | verdict | one verdict rule | itself (`violations()`, USER_ACTION=0 path) | exact |
| `scripts/verify-crash-collector.mjs` (MOD: Gecko-shaped `extra` plant) | gate | in-memory plants | itself Plants 1–8 (`:269-470`), green-baseline-first loop | exact |
| `scripts/verify-ng-068-crash-extra-part.mjs` (USE, unchanged) | gate | live loopback vs upstream-derived shape | itself (shape from `report.rs` at check time) | exact |
| `worker/crash-submit.mjs` + `worker/wrangler.toml` (NEW, Phase-48-shaped) | receiver | multipart → R2, 30-day lifecycle | Phase 48 `POST /events` Worker idiom (assumed; S8 draft gate) | role-match |
| `scripts/verify-worker-submit.mjs` (NEW) | gate | synthetic-Request contract | Phase 48 `verify-events-worker.mjs` idiom (assumed; S8 draft gate) | role-match |
| `scripts/verify-release-symbols.mjs` (NEW) | gate | manifest derivation + equality | `scripts/verify-release-identity.mjs` (key derivation + tag/descriptor agreement) | role-match |
| `docs/CRASH-POLICY.md` (REWRITE) | doc | reviewable source pinned by two gates | itself (header contract both gates state); `docs/PRIVACY.md` voice (CRASH-POLICY idiom) | exact |
| `scripts/verify-platform.sh` (MOD: rows + self-test rows) | config/registry | registry append | rows at `3650-3657` + comment convention (`# NEW (Phase 57, REQ-ID)`) | exact |

Note: no `scripts/verify-ng-NNN-*.mjs` file is created or edited (owner-locked). The Gecko-shaped `extra` plant extends `verify-crash-collector.mjs`, which is not NG-scoped.

## Pattern Assignments

### `patches/050-*` — copy the regeneration discipline, not the content

- Preamble + regeneration via `scripts/regenerate-patches.sh` (Phase 40 AUTO-10): the patch is produced from a patched `upstream/` worktree with `git -C upstream diff HEAD --abbrev=10 -- <+++ b/ paths>`, byte-compared by `--check`. A hand-edited hunk body must go red naming the patch (`patches-regenerated` row + self-test).
- Hook-only surface (`scripts/check-patch-surface.sh`): the patch touches non-compiled hook paths only, following the `010` identity-hook template (generated fragment carries values; the patch carries only the hook). If the consent gate functionally requires a `.rs` touch, the planner follows the 010 indirection instead — values/switches flow through `generated/` + build config, never as compiled literals in the patch. The executor proves `check-patch-surface.sh` green in the task verify.
- Next free number after `040` (040 exists; 050 chosen with a gap for Phase 44/46 hook patches, same spacing idiom as 010/020/030/040).

### `scripts/generate.mjs` — copy `emitIdentityConfigure` + `assertEmittable` discipline

- New pure helper `crashReporterOrigin(config)`: `new URL(assertEmittable('urls.crash_report', rawCrash)).origin` — the `MOZ_APPUPDATE_HOST` precedent (`:1586-1609`: `new URL(...).host` from `urls.update`). Idempotent with `moz.configure`'s `rstrip("/")` (upstream `toolkit/moz.configure:3403`).
- Conditional emission in `emitMozconfig` next to line 1489: key stated → `ac_add_options --with-crashreporter-url=<origin>`; key unset → the current `--disable-crashreporter` literal (unchanged until TEL-13). Sink guard on the way in AND out (a `pref()` line is a double-quoted JS string; the URL host cannot carry a quote, but the guard runs anyway — CFG-03 rejection-only, never mangling).
- `manifestEndpointSources` already lists `crash_report` (`:2714`); no list change. The crash host reaches `generated/endpoint-hosts.json` through the existing derivation (theia-endpoints check 1 asserts it).

### `scripts/verify-endpoints.sh` layer 3 — copy the twin + fixture shape

- `run_layer3_impl 0/1` twins: the assertion (reporter-enabled run, fresh profile, crash induction, zero `incoming.telemetry.mozilla.org` in the extracted set) gets a positive-control twin that must go red naming the host (consent true / patch reverted). Same structure as `run_layer3_control` (GMP/OpenH264 precedent, `:404-420`).
- Fixture half at `--quick`: `--disposition-self-test`-style plants over `extract_resolved_hosts` output + `endpoint-verdict.mjs` (unattended `user-initiated` fails like `deny`, per UPD-33). New plants ride the existing fixture loop; no second fixture harness.
- Host derivation: the asserted host derives from `upstream/toolkit/crashreporter/crashping/src/lib.rs` (`TELEMETRY_SERVER`) at check time — the same derive-at-check-time idiom as ng068 reading `report.rs`. Never a hand-kept literal.

### `worker/` + `verify-worker-submit.mjs` — copy the Phase 48 idiom

- Same `worker/` top-level dir, same synthetic-Request contract gate (no sockets in the gate; the gate drives the module's fetch handler), same vocabulary/caps/allowlist/retention as `scripts/crash-collector.mjs` (R2 lifecycle rule replaces the sweep — no second job). If Phase 48's names differ when 57-02 executes, the executor adapts and records the delta in the SUMMARY.
- Gate contract: `CrashID=` on well-formed, `Discarded=<rule>` vocabulary byte-identical to the collector, Gecko-shaped `extra` stored allowlist-filtered, oversized/malformed rejected before any write, throttle 60/60 s.

### `scripts/verify-release-symbols.mjs` — copy `verify-release-identity.mjs`

- Header comment: numbered derivation steps (manifest → per-target symbol names → draft asset set → SHA256SUMS coverage), strict argument guard, injectable `runChecks(root, overrides)`, `main` + green-baseline-first self-test.
- Derivation: per-BUILD_TARGET `<pkg>.crashreporter-symbols.zip` names derived from `package-name.mk` (`PKG_BASENAME` + `.crashreporter-symbols`) and the DIST-07 manifest (assumed Phase 49 seam); set equality over the asset set (addition AND removal go red). Each plant names its rule.

### `scripts/verify-platform.sh` registry rows

```sh
    # NEW (Phase 57, TEL-09): <what it derives and compares; full vs quick tier>.
    "crash-ping-consent|node $REPO_ROOT/scripts/verify-crash-ping-consent.mjs"
    "crash-ping-consent-self-test|node $REPO_ROOT/scripts/verify-crash-ping-consent.mjs --self-test"
```

Bash analog for shell rows: `"verify-endpoints-layer3-crash|bash ..."` only if the assertion lives in `verify-endpoints.sh` rather than a `.mjs` gate. Tag new rows `# NEW (Phase 57, REQ-ID): ...`. The self-test rides alongside for the reason every other self-test row gives.

## Shared Patterns

- **Message format:** `<name>: PASS|FAIL|SKIP -- <plain statement>`; each failure ends `Next step: ...`; exit 0/1, 2 for bad args.
- **Derive, never hand-keep:** consent host from `lib.rs`, extra shape from `report.rs`, submit origin from the manifest via the generator, allowlist agreement via theia-endpoints checks; set equality catches both addition and removal.
- **Self-test:** green baseline first, in-memory or mkdtemp plants, red must name the drift, unplanted control stays green.
- **Stage new files** before trusting `scan-brand-residue.mjs` (git ls-files based); self-test fixtures must not spell brand tokens or tag literals.
- **COUNT MOVED a -> b** for any brand-token count move (none expected here).

## No Analog Found

| File | Role | Reason |
|---|---|---|
| `worker/wrangler.toml` R2 lifecycle stanza | deploy config | No R2 lifecycle exists in the tree yet; RESEARCH + Phase 48 idiom are the source, owner applies it |

## Metadata

**Analog search scope:** scripts/, patches/, powerbrowser/, worker/ (absent — assumed), docs/
**Files scanned:** 14
**Pattern extraction date:** 2026-10-23
