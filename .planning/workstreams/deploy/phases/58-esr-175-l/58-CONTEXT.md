# Phase 58: ESR 175 (L) - Context

**Gathered:** 2026-10-23
**Status:** Ready for planning
**Mode:** Auto-generated (discuss skipped via workflow.skip_discuss)

<domain>
## Phase Boundary

PowerBrowser moves to ESR 175 before ESR 153 ends, with 153.x security releases continuing in parallel through the overlap.

Requirements: UPS-01, TRAIN-05, UPS-03 (full text in `.planning/workstreams/deploy/REQUIREMENTS.md`).
Depends on: Phase 43 (tag-based detector), Phase 49 (hosted fallback build), Phase 52 (fixer proven).

</domain>

<decisions>
## Implementation Decisions

### Already decided (owner, 2026-10-20)
- All owner decisions in REQUIREMENTS.md "Owner Decisions" are binding (SEED-002 §12 recommended defaults plus the research additions).
- Decision 5: one release per ESR point release, out-of-band revisions by `revision` bump — this is what gives the 175 line its own release keys (`v175.x-r` alongside `v153.x-r`).
- Decision 19: `toolchain-baseline.txt` pins the release container's Mozilla bootstrap toolchain (AUTO-05/UPS-01 re-record it for 175).
- Decision 15: the Worker is a clock only; all detection, liveness, pin-age and descriptor-delay logic runs in Actions — so the dual-major detector lives in `scripts/detect-upstreams.mjs`, not in the Worker.
- Single update channel (UPD-11, `default`/`powerbrowser-default`) is unchanged by this phase; the 175 line uses the same channel name.

### Assumptions about unfinished dependencies (recorded per autonomous rule)
- **A-58-1 (Phase 43 not yet planned):** Phase 43 lands first and delivers `scripts/detect-upstreams.mjs` (153 major guard, `_RELEASE`-only mapping, `FIREFOX_ESR` cross-check only), `scripts/release-train.mjs` (state table, derive/next/render), the quick rows `detect-upstreams-self-test` (including the `FIREFOX_ESR=175.0esr` + `FIREFOX_153_23_0esr_RELEASE` → 153.23 detection fixture) and `release-train-logic-self-test`, plus the `chore/esr-<tag>` bump-pr path. Phase 58 **extends** those files; it does not create the detector or the train. Each 58 plan carries a precondition (`test -f …`) so execution waits for Phase 43 rather than colliding with it.
- **A-58-2 (Phase 49 not yet planned):** Phase 49 lands first and delivers `release.yml` (SHA validation, legion build, sign-publish, descriptor, channel-live) and the cold hosted fallback build measurement (INF-04, recorded in `docs/BUILD.md`). Phase 58 reuses both; the 175 line dispatches the same `release.yml` with 175 merge SHAs.
- **A-58-3 (Phase 52 not yet planned):** Phase 52 lands first and proves the fixer on a real red PR before 2027-05-27 (FIX-10). Phase 58's 175 patch-conflict branch assumes fixer classes F1 (patch-replay conflict) and F2 (red bump PR) exist; the 175 conflicts arrive as `chore/esr-175*` branches the fixer already knows how to work.
- **A-58-4 (calendar):** No 175 tag exists yet (nightly 2027-05-27, beta 2027-06-10, release 2027-06-29; ESR 153 ends with 153.27 on 2027-09-07). Everything 175-specific is proven by fixtures until the beta; live replay-only runs start 2027-06-10.
- **A-58-5 (product-details):** Whether product-details gains an undocumented `FIREFOX_ESR153` key after the flip is unknown (research flag L, open). The detector never depends on it: tags for the pinned major are the source, `FIREFOX_ESR` stays a cross-check (Pitfall 10).
- **A-58-6 (single-pin model):** Phase 40/43 assume one `firefox_esr_tag` in `configuration.toml`, one `FIREFOX_ESR_TAG=` line in `generated/upstream-pins.env`, and no tag literal anywhere else (`verify-upstream-pins.mjs` sweep). Two live majors break that model. The exact shape (second pin input vs per-train parameter) is at the executor's discretion, under the same no-second-literal rule: whatever names a tag derives from the manifest or the train input, never from a literal.
- **A-58-7 (Phase 41 in progress):** Phase 41 waits on the owner (repo creation, Apps, 2FA, probes, drills). Phase 58 needs no new repository control and no App permission change, so it is independent of the Phase 41 checkpoint.

### Owner gates in this phase (stop points for autonomous execution)
- Calendar waits are not work: replay-only runs start at the 175 beta (2027-06-10); the ship decision lands before 153.27 (2027-09-07). Plans build and prove everything with fixtures now; the live 175 replay and the ship approval are owner-visible train transitions, not executor pushes.
- The dual-objdir disk measurement (UPS-03) runs on legion at execution time and is recorded in `docs/BUILD.md` with tree+host+toolchain+date (D-73); if legion cannot hold two ~14 GB objdirs, the hosted fallback (INF-04) is the relief valve and the plan records that instead of forcing it.
- Per-release `release` and `descriptor` approvals stay owner actions (External Gates table); the 175 line adds no new approval type.

### Claude's Discretion
All other implementation choices are at Claude's discretion — discuss phase was skipped per user setting. Use the ROADMAP phase goal, success criteria, and codebase conventions to guide decisions. In particular: the two-pin manifest shape (A-58-6), the replay-only job's exact issue format (it must name patch, tags, files, verbatim logs), and the order of the toolchain re-record vs the first 175 replay.

</decisions>

<code_context>
## Existing Code Insights

Codebase context was gathered by three parallel research probes (2026-10-23) plus the v1.6 research archive:

- Patch surface (4 tracked patches, all hook-only, regenerated by `scripts/regenerate-patches.sh` over `upstream/` at `6cd88e7d45fe7a5b0b87b984fb32a8779151860e`): 010 `browser/moz.configure` (identity include, medium drift); 020 `browser/moz.build` (one `DIRS` append, lowest drift); 030 `toolkit/mozapps/update/updater/moz.build` (MAR certs, highest drift — large removed channel-conditional block); 040 `browser/installer/windows/nsis/defines.nsi.in` + `installer.nsi` (high drift — `DigiCert … 2021 CA1` issuer rotation, installer refactors).
- Detector contract (specified, not yet built — A-58-1): pinned major derived from `configuration.toml [upstreams] firefox_esr_tag`; matching-refs list of `FIREFOX_<major>_*esr_RELEASE`, `_RELEASE` only never `_BUILDn`; `FIREFOX_ESR` cross-check only. `scripts/verify-upstream-pins.mjs` enforces the single-pin agreement (manifest → `generated/upstream-pins.env` → `fetch-upstream.sh` → workflow tag input with no default → `FIREFOX_[0-9]` literal sweep).
- Train contract (specified, not yet built — A-58-1/A-58-3): per-key states DETECTED…DONE, one open issue per release key (`release-train: v<ESR>-<rev>`, labels `release-train` + `state/<STATE>`), `release-train.mjs` derive/next/render with `release-train-logic-self-test` fixture set-equality (a state without a fixture, or a fixture without a state, goes red).
- Toolchain/disk baseline: `toolchain-baseline.txt` pins 3 lines (`rustc 1.97.1`, `cargo 1.97.0`, `cbindgen 0.29.4`) via `scripts/toolchain-baseline.sh` inside `nix develop .#firefox`; `docs/BUILD.md` records tier-3 wall times (dev objdir ~40m, release `objdir-release` ~44m post-clobber, peak ~14 GB objdir atop ~5.6 GB `upstream/`, legion 16c/62 GB, ~30 GB free + 8 GB RAM prerequisite) and the DOC-05 four-objdir runbook. No INF-04 cold-hosted measurement exists yet (A-58-2).
- Start from `.planning/research/v1.6-deploy/ARCHITECTURE.md` §§4.2/4.3/6/9-Phase-L, `PITFALLS.md` Pitfall 10 (detector blindness), `SUMMARY.md` Phase L, plus `scripts/regenerate-patches.sh`, `scripts/apply-patches.sh`, `scripts/check-patch-surface.sh`, `scripts/verify-upstream-pins.mjs`, `scripts/generate.mjs` (`emitUpstreamPins`), `scripts/toolchain-baseline.sh`.

</code_context>

<specifics>
## Specific Ideas

- Replay-only means: fetch the 175 tag, run `apply-patches.sh` replay + `regenerate-patches.sh --check` + `check-patch-surface.sh` + brand scan + `--quick`, open-or-update exactly one `ESR <tag>: patch <NNN> did not apply` issue on failure (AUTO-07 shape, assigned to the owner), commit/push/PR/dispatch nothing. A hand-edited hunk body is never the fix (CLAUDE.md; Pitfall 2).
- `--check` on a moved 175 file compares `+`/`-` lines only and emits `NOTE -- <patch> replays onto moved file(s)` + PASS with a drifted count: regenerate + commit with the pin bump. A real conflict FAILs naming the patch (`did not apply`, `added/removed lines differ`, `dropped <path>`).
- Plan against ROADMAP.md and REQUIREMENTS.md as written; do not re-derive the release-key shape (`v<ESR>-<revision>` via `releaseIdentity()`), the issue protocol, or the immutable-release rules — extend them to the second major.
- No user-facing copy changes in this phase (all automation + docs); the no-internal-identifiers rule therefore binds only `docs/RELEASING.md`/`docs/BUILD.md` prose by review, and any new row failure line must end with a concrete next step.

</specifics>

<deferred>
## Deferred Ideas

None — discuss phase skipped.
</deferred>
