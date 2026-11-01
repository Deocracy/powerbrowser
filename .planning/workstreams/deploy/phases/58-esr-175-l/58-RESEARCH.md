# Phase 58: ESR 175 (L) - Research

**Researched:** 2026-10-23
**Domain:** Gecko ESR major uptake (153→175): parallel detector line, hook-only patch rebase, dual-build window, toolchain re-baseline
**Confidence:** HIGH for in-tree mechanics (every load-bearing claim was read this session); MEDIUM for Mozilla-side drift (no 175 tree exists yet — calendar: nightly 2027-05-27, beta 2027-06-10, release 2027-06-29)

## Summary

Phase 58 moves PowerBrowser to ESR 175 before ESR 153 ends (153.27 on 2027-09-07), with 153.x security trains continuing in parallel. It is the last phase of milestone v1.6 and it is specified, not greenfield: REQUIREMENTS carries UPS-01 (replay-only from the 175 beta, rebase, re-baseline, ship 175.x), TRAIN-05 (a second major as a parallel train with its own keys and issues) and UPS-03 (the dual-build window fits legion, measurement recorded, hosted fallback available). Three dependencies are assumed, not present: Phase 43 (the detector + train skeleton), Phase 49 (release.yml + the INF-04 cold hosted measurement), Phase 52 (the proven fixer) — see CONTEXT A-58-1..A-58-3. Phase 58 extends all three; it creates none of them.

Three focused probes ran this session (patch surface, detector major guard, dual-build baseline). Their findings converge on one shape:

1. **Detector first (TRAIN-05):** the single-pin model (`firefox_esr_tag` → one `FIREFOX_ESR_TAG=` → one train) breaks with two live majors. Teach `detect-upstreams.mjs` to list both `FIREFOX_153_*` and `FIREFOX_175_*` sets, open the 175 uptake issue in replay-only mode from the beta, keep 153.x detection tag-driven so the post-flip `FIREFOX_ESR=175.0esr` never blinds it (the Phase 43 `175.0esr`→153.23 fixture is the contract), and extend both self-tests with two-major fixtures as set equality.
2. **Patches second (UPS-01):** rebase the four hook-only patches onto 175 through the regeneration path only (`apply-patches.sh` replay → `regenerate-patches.sh --check` → `check-patch-surface.sh`). Drift risk is 030 (MAR certs) > 040 (NSIS) > 010 (identity) > 020 (shell). Every conflict surfaces as an issue (AUTO-07 shape), never a hand edit.
3. **Build window third (UPS-03):** extend the toolchain baseline to the 175 container bootstrap toolchain (clang + rust + cbindgen + sysroot + image digest), measure two ~14 GB objdirs side by side on legion (`objdir-175`, never clobber the live 153 one), record with tree+host+toolchain+date, and keep the hosted fallback (INF-04, cold, no cache, sccache off) as the relief valve.

**Primary recommendation:** plan in dependency order — detector/train (extends Phase 43 files, fixture-provable now) → patch rebase procedure + toolchain re-record (proven by fixtures now, live at the beta) → dual-build measurement + ship checklist (fixtures now, live objdirs + owner approvals at execution). Everything automation-side is provable by fixtures before any 175 tag exists; the only live gates are the beta replay (2027-06-10), the disk measurement, and the per-release owner approvals that already exist.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| 175 detection (two majors) | `scripts/detect-upstreams.mjs` (extends Phase 43) | `release-train.mjs` derive/next (new 175 states or replay-only flag) | Decision 15: detection runs in Actions, never in the Worker; Pitfall 10: tags are the source, product-details is the cross-check |
| Release identity for two keys | `scripts/generate.mjs` (`releaseIdentity()`, `emitUpstreamPins`) + manifest second pin | `release-manifest.json`, descriptor path, `docs/RELEASING.md` | REL-01 shape (`v<ESR>-<revision>`) is per-key; the sweep must still find no literal (`FIREFOX_[0-9]`) outside the manifest |
| Patch rebase onto 175 | `scripts/apply-patches.sh` replay + `scripts/regenerate-patches.sh --check` | `scripts/check-patch-surface.sh`, `scan-brand-residue.mjs`, `--quick` | CLAUDE.md: patches are regenerated, never text-edited; Pitfall 2 |
| Conflict surfacing | `release-train.yml` bump job (AUTO-07 shape: one `ESR <tag>: patch <NNN> did not apply` issue) | Fixer F1/F2 on `chore/esr-175*` (Phase 52) | Phase 58 criterion 1: conflicts surface as issues before the release |
| Toolchain truth for 175 | `toolchain-baseline.txt` + `scripts/toolchain-baseline.sh` | `release.yml build-linux` (AUTO-05 drift fails build) | Decision 19; FIX-11 deny-lists the file; D-73 comparability |
| Dual-objdir proof | legion (`objdir-175` beside the live 153 objdir, `du`/`df` before/after) | Hosted fallback INF-04 (cold, no cache) | UPS-03: two ~14 GB objdirs fit, or the fallback absorbs the spill |
| Ship 175.x before 153.27 | same `release.yml` (SHA validation per TRAIN-10) | `descriptor` + `channel-live` per BUILD_TARGET | No new pipeline; same owner approvals per release |

## User Constraints (from CONTEXT.md)

<user_constraints>
### Locked Decisions
#### Already decided (owner, 2026-10-20)
- All owner decisions in REQUIREMENTS.md "Owner Decisions" are binding (SEED-002 §12 recommended defaults plus the research additions).
- Decision 5: one release per ESR point release, out-of-band revisions by `revision` bump — the 175 line gets its own release keys.
- Decision 19: `toolchain-baseline.txt` pins the release container's Mozilla bootstrap toolchain.
- Decision 15: the Worker is a clock only; detection runs in Actions.
- Single update channel (`default`/`powerbrowser-default`) is unchanged by this phase.

#### Assumptions about unfinished dependencies (A-58-1..A-58-7)
- Phase 43 delivers the detector, the train, both self-tests and the bump-pr path; Phase 58 extends them (precondition `test -f …` per plan).
- Phase 49 delivers `release.yml` and the INF-04 cold hosted measurement; Phase 58 reuses both.
- Phase 52 proves the fixer before 2027-05-27; 175 conflicts arrive as `chore/esr-175*` branches it already handles.
- No 175 tag exists yet; automation is fixture-proven now, live at the beta (2027-06-10).
- Never depend on an undocumented `FIREFOX_ESR153` product-details key.
- Two-pin shape is at the executor's discretion under the no-second-literal rule.
- Phase 41's owner checkpoint does not block Phase 58 (no new control, no App change).

#### Owner gates in this phase
- Live 175 replay starts at the beta; ship lands before 153.27. Fixtures now, live gates at execution.
- UPS-03 disk measurement runs on legion at execution with D-73 recording; hosted fallback is the relief valve.
- Per-release `release`/`descriptor` approvals stay owner actions; no new approval type.

### Claude's Discretion
All other implementation choices are at Claude's discretion. In particular: the two-pin manifest shape, the replay-only issue format (must name patch, tags, files, verbatim logs), and the toolchain re-record vs first-replay order.

### Deferred Ideas (OUT OF SCOPE)
None — discuss phase skipped.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| UPS-01 | From the 175 beta the bump job runs replay-only against 175 tags; hook-only patches rebased onto 175; toolchain baseline updated; ship on 175.x before 153.27 (2027-09-07) | §Patches (drift ranking 030>040>010>020), §Replay-only procedure, §Toolchain (container bootstrap set) |
| TRAIN-05 | A second ESR major runs as a parallel train with its own release keys and tracking issues while 153.x security trains continue | §Detector (two-major listing, per-key issues `release-train: v<ESR>-<rev>`, branch divergence, self-test set-equality extension) |
| UPS-03 | The dual-build window fits legion's disk (two objdirs ~14 GB each), measured and recorded; hosted fallback available | §Dual-build (legion baseline 14 GB/objdir + 5.6 GB upstream, `objdir-175` method, D-73 recording, INF-04 relief valve) |

</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **One driver, one registry.** Every new check is one row appended to `scripts/verify-platform.sh` CHECKS plus a `--self-test` sibling. No sibling driver.
- **Derive and compare.** Expectations derive from the tree and compare as set equality, red on both addition and removal. Never hand-keep an expectation list. The two-major self-test fixtures follow this rule: a state without a fixture, or a fixture without a state, goes red.
- **Patches are regenerated, never text-edited.** A hand-edited hunk body without recomputed blob hashes degrades the three-way merge into a silent no-op (`check-patch-surface.sh` guards the surface, `apply-patches.sh --self-test` guards the mechanism).
- **Never edit upstream/ or Theia core.** 175 work touches the pin, the patches (via regeneration), and the baseline — never `upstream/` by hand, never Theia.
- **Residual-brand scan.** `node scripts/scan-brand-residue.mjs` stays exit 0. Stage new files before trusting it (`git ls-files` iteration). The originating product is named only in `inventory/brand-tokens.json`.
- **COUNT MOVED a -> b.** Brand-token renames use "COUNT MOVED a -> b" phrasing in commit messages (not applicable here — no rebrand surface changes).
- **No internal identifiers in user-facing copy.** This phase adds no user-facing copy; docs prose (`docs/RELEASING.md`, `docs/BUILD.md`) is review-checked, and every new row failure line ends with a concrete next step.
- **Builds run inside Nix dev shells** (`nix develop .#firefox`, `nix develop .#theia`). `node` works outside; `yarn` does not.
- **Hash-locked files.** Never create or edit `scripts/verify-ng-NNN-*.mjs`. Shell commands containing the substring `ledger/` are blocked — plans must not route through it.
- **Plan gate.** `python3 scripts/plan-gate.py --root . --phase 58 --plans <dir> --stream deploy`. No `ledger/` row carries `"stream": "deploy"` today, so the gate passes on zero due IDs; every 58 plan still cites its UPS/TRAIN IDs so the gate stays meaningful.
- **Quick baseline.** New quick rows must be green on the tree when they land (fixtures, not live 175 tags).

## Standard Stack

### Core
| Tool | Version | Purpose | Why Standard |
|------|---------|---------|--------------|
| `git apply --3way` via `scripts/apply-patches.sh` | tree | 175 replay (before/after blob-hash non-vacuity) | The mechanism `apply-patches.sh --self-test` guards |
| `scripts/regenerate-patches.sh --check` | tree (Phase 40) | 175 re-derivation proof (byte-compare; moved files on `+`/`-` lines only with `NOTE`) | AUTO-10; the only sanctioned way a patch changes |
| `scripts/check-patch-surface.sh` | tree | 175 surface guard after any regeneration | CLAUDE.md patch-surface rule |
| `node scripts/scan-brand-residue.mjs` | tree | residual-brand gate after staging | Permanent gate; invisibility trap (stage first) |
| `scripts/verify-platform.sh` | tree (registry at line 3573) | every new check lands as one CHECKS row + `--self-test` | One driver, one registry |
| `scripts/verify-upstream-pins.mjs` | tree | single-pin agreement today; extended to the two-pin shape without a second literal | No `FIREFOX_[0-9]` literal outside the manifest |
| `scripts/toolchain-baseline.sh` | tree | extended to the 175 container bootstrap set | Decision 19; AUTO-05 drift fails the build |
| `scripts/detect-upstreams.mjs` (Phase 43) | specified | two-major listing, replay-only 175 path | AUTO-01 + UPS-01; Pitfall 10 |
| `scripts/release-train.mjs` (Phase 43) | specified | 175 states/issues/render | TRAIN-03 + TRAIN-05 |
| Node | v24.21.0 | script runtime | Matches flake `nodejs_24` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Two-major detector in Actions | Worker-side major routing | Rejected: Decision 15 + Pitfall 9 (Worker is a clock; 10 ms CPU / 50 subrequest caps) |
| Second manifest pin | Per-train workflow parameter only | Viable (A-58-6 leaves the shape to the executor); either way no literal may name a tag outside the manifest/train input |
| Fresh 175 worktree for replay | `objdir-175` beside live objdirs | The replay needs `upstream/` at the 175 tag, not a second objdir — use a scratch fetch or `git worktree` for the read-only replay; reserve `objdir-175` for the first real 175 build |
| Separate 175 release pipeline | Same `release.yml` with 175 SHAs | Rejected: TRAIN-10 SHA validation + sign/publish/descriptor logic is major-agnostic; a second pipeline doubles the trust boundary for no reason |

**Installation:** no new package. If the executor needs a fixture-only 175 tag list, it uses tracked JSON fixtures — never a live network fetch in a `--quick` row.

## Package Legitimacy Audit

No npm, PyPI or crates package is installed by this phase.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| (none) | — | — | — | — | — | No new dependency; fixtures are tracked JSON, scripts are node built-ins + bash |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
  product-details (cross-check)     GitHub matching-refs (source)
   FIREFOX_ESR=175.0esr ──────┐   ┌── FIREFOX_153_*esr_RELEASE ──▶ 153.x trains (unchanged)
   (advisory only, Pitfall 10) │   │
                               └──┴── FIREFOX_175_*esr_RELEASE ──▶ 175 uptake train (replay-only from beta)
                                                              │
                        scripts/detect-upstreams.mjs (two-major, Phase 43 + 58)
                                                              │
                        scripts/release-train.mjs (per-key states, separate issues)
                          release-train: v153.x-r      release-train: v175.x-r
                                                              │
                        bump job: replay-only vs 175 (fetch, apply-patches, --check,
                          check-patch-surface, brand scan, --quick; no commit/push/PR)
                          FAIL ──▶ one "ESR <tag>: patch <NNN> did not apply" issue (AUTO-07)
                          PASS ──▶ NOTE + regenerate + pin bump at ship time
                                                              │
                        toolchain-baseline (container set) ──▶ objdir-175 build
                          two ~14 GB objdirs on legion ──▶ ship 175.x before 153.27
                                                              │
                        same release.yml (TRAIN-10 SHA check) ─▶ descriptor + channel-live
```

### Recommended Project Structure
Phase 58 adds no new top-level script. It extends Phase 43's files and adds rows + fixtures:
```
scripts/
├── detect-upstreams.mjs            # Phase 43; Phase 58 adds the 175 major set + replay-only path (precondition: test -f)
├── release-train.mjs               # Phase 43; Phase 58 adds 175 derive/next/render + states (precondition: test -f)
├── verify-platform.sh              # append rows: 175-detector-self-test extension, train-logic 175 fixtures, toolchain-175, dual-objdir record
configuration.toml                  # [upstreams] second pin or per-train parameter (executor's choice, no literal elsewhere)
generated/upstream-pins.env         # second FRAGMENT line if the two-pin shape is chosen (via generate.mjs, never by hand)
powerbrowser/packaging/mar/         # unchanged: fork certs are channel-independent since patch 030 removed the selection
docs/RELEASING.md                   # 175 train subsection: replay-only procedure, two-key model, calendar, probe/ship record
docs/BUILD.md                       # UPS-03 measurement: du/df before-after, wall times, D-73 tuple, fallback verdict
```

### Pattern 1: Two-major detection with the 153 line blind-proof
List both `FIREFOX_153_*` and `FIREFOX_175_*` `_RELEASE` sets via matching-refs; map each set to its own major guard. The 153 guard ignores every non-153 tag (so 175 can never trigger a 153 bump); the 175 guard ignores every non-175 tag. `FIREFOX_ESR` is read as advisory only: after the 2027-06-29 flip it reads `175.0esr` while 153.23..153.27 still ship, so pin-age for the 153 line compares against the 153 tag list, never against `FIREFOX_ESR`. The Phase 43 fixture (`FIREFOX_ESR=175.0esr` + `FIREFOX_153_23_0esr_RELEASE` exists → 153.23 dispatch) is the regression contract; Phase 58 adds the mirror (`153-line pin` + `FIREFOX_175_0esr_RELEASE` exists → replay-only 175 issue, no 153 bump).

### Pattern 2: Replay-only as a pure function of (tag, tree)
The replay-only bump job takes a 175 tag and returns PASS (with `NOTE` drift counts) or exactly one conflict issue — and writes nothing: no commit, no push, no PR, no dispatch. Inputs: a scratch `upstream/` at the tag (or worktree), the four tracked patches, the pinned toolchain. Outputs: verbatim `apply-patches` + `--check` logs in the issue, the failing patch name, tag-vs-pin, touched upstream files, `check-patch-surface` result. Determinism: rerun on the same (tag, tree) yields byte-identical output, so the issue update is PATCH-only-when-different (train protocol §4.3).

### Pattern 3: Rebase through regeneration, ordered by drift risk
Rebase order follows the probe ranking: 030 (MAR certs — expect the channel-conditional context to have moved; the fork-cert `+` lines are the invariant) → 040 (NSIS — expect issuer-string and installer-body drift; PowerBrowser artwork/namespace/ping-suppression lines are the invariant) → 010 (identity — expect `moz.configure` option churn; the `include("../identity.configure")` hook is the invariant) → 020 (shell — one `DIRS` line; fails only on `browser/moz.build` restructure). For each: fetch 175, replay, `--check`; `NOTE` on moved files → regenerate + byte-compare + commit with the pin bump; `FAIL` → conflict issue (AUTO-07), fixer F1/F2 on `chore/esr-175*`, never a hand edit. `check-patch-surface.sh` + brand scan + `--quick` stay green throughout.

## Patches (drift ranking from the 2026-10-23 probe)

| Patch | Upstream file(s) | Hook shape | Drift risk | Why |
|-------|-----------------|------------|------------|-----|
| 030-powerbrowser-mar-certificates | `toolkit/mozapps/update/updater/moz.build` | replaces channel-conditional cert selection with fork cert both slots, all channels | **highest** | updater is security-sensitive; channel lists, `.der` names and `moz.build` cert logic churn most between ESRs; largest removed block |
| 040-powerbrowser-nsis | `browser/installer/windows/nsis/defines.nsi.in`, `installer.nsi` | AppName→`@MOZ_APP_NAME@`, CERTIFICATE_NAME→`${CompanyName}`, TELEMETRY_BASE_URL blanked, ping early-`Return` | **high** | issuer string (`DigiCert … 2021 CA1`) rotation; installer/telemetry define and function-body refactors |
| 010-powerbrowser-identity | `browser/moz.configure` | strips HEALTHREPORT/NORMANDY/VENDOR, adds `include("../identity.configure")` | **medium** | hook-only shape helps (brand scan stays green) but `moz.configure` policy options churn |
| 020-powerbrowser-shell | `browser/moz.build` | one `DIRS += ["../powerbrowser/shell"]` | **lowest** | tiny hunk, stable context; fails only on `DIRS`-block restructure |

- Pin today: `firefox_esr_tag = "FIREFOX_153_5_1esr_RELEASE"` (`configuration.toml:125`), `upstream/` at `6cd88e7d45fe7a5b0b87b984fb32a8779151860e`.
- `--check` semantics (AUTO-10 + owner ruling 2026-10-22 CR-01): byte-compare when the pre-image blob is unchanged; `+`/`-`-lines-only compare when upstream moved the file (`NOTE` + PASS with drifted count → regenerate + commit); `FAIL` naming the patch on `did not apply` / `added/removed lines differ` / `dropped <path>` / empty regeneration.

## Detector (major-guard design from the 2026-10-23 probe)

- AUTO-01 concept (specified, Phase 43): pinned major from the manifest tag; matching-refs list per major; `_RELEASE` only, never `_BUILDn`; product-details `FIREFOX_ESR` cross-check only; guard drops non-matching majors.
- 175 extension (TRAIN-05): track both majors; from the 175 beta open the uptake issue and run the bump job replay-only (conflicts surface ~3 weeks pre-release); release keys diverge by tag (`v153.x-r` vs `v175.x-r` via `releaseIdentity()`); tracking issues diverge by key (`release-train: v153…` vs `v175…`); bump branches diverge (`chore/esr-<153-tag>` vs `chore/esr-175…`); fixer works the 175 branch while 153.x trains continue; both self-tests gain two-major fixtures compared as set equality (175-under-153-guard fault must go red naming the drift).
- Post-flip rule: `FIREFOX_ESR=175.0esr` after 2027-06-29 is advisory; 153.x detection and pin-age keep reading the 153 tag list. Never depend on an undocumented `FIREFOX_ESR153` key (open research flag L).

## Dual-build (baseline from the 2026-10-23 probe)

- `toolchain-baseline.txt` today: 3 lines (`rustc 1.97.1`, `cargo 1.97.0`, `cbindgen 0.29.4`) via `scripts/toolchain-baseline.sh` inside `nix develop .#firefox`. For 175 (AUTO-05 + Decision 19 + UPS-01): extend to the release-container Mozilla bootstrap set — clang + rust + cbindgen + sysroot (+ glibc ceiling PKG-22 derives at check time, 2.19 today) + container image digest. `build-linux` runs it; drift fails the build; FIX-11 deny-lists the file.
- Legion baseline (16c/62 GB): prerequisite ~30 GB free + 8 GB RAM; full non-artifact peaks ~14 GB `objdir/` atop ~5.6 GB `upstream/`; tier-3 wall times 2388 s dev / 2620 s release post-clobber (153.5), fresh-clone 3641 s. DOC-05 runbook already assumes four ~14 GB objdirs.
- Method: never reuse/clobber the live 153 objdir; `POWERBROWSER_OBJDIR=objdir-175` (or a separate worktree) for the 175 line from the beta; `du -sh objdir*`, `df -h`, `du -sh upstream/` before/after each tier-3; `mach` wall time; record with tree+host+toolchain+date per D-73 in `docs/BUILD.md`.
- INF-04 relief valve (A-58-2, Phase 49): one cold hosted fallback build (no Actions cache, sccache off), duration + disk in `docs/BUILD.md`; for 175 it must prove the container/bootstrap path works where the Nix shell does not, output passes `portable-elf` / `package-target-natives` / `mar-hop`, and the two-train peak can spill to hosted when legion is full.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Major detection from `FIREFOX_ESR` | A `FIREFOX_ESR153`-keyed branch | Per-major tag lists via matching-refs | Pitfall 10: the key flips to 175 while 153 still ships; the undocumented key may never appear |
| 175 conflict resolution | Hand-edited hunks "just this once" | `regenerate-patches.sh` write mode after replay, or the fixer F1 path | Pitfall 2: a hand edit without recomputed hashes is a silent no-op |
| Second-pipeline for 175 | A `release-175.yml` | Same `release.yml` with 175 SHAs (TRAIN-10 validation is major-agnostic) | Doubles the trust boundary (`workflows` row, GH-12) for no reason |
| Live 175 proof today | Fetching a nightly or hand-rolled tag | Tracked JSON fixtures in both self-tests | No 175 tag exists; `--quick` never touches the network |
| Disk proof by clobbering | Reusing the live objdir for 175 | `objdir-175` beside it, `du`/`df` before-after | Clobbering the 153 line to prove 175 destroys the line being protected |

**Key insight:** Phase 58 is a calendar-gated extension phase, not a greenfield build. The detector, the train, the pipeline and the fixer already exist (Phases 43/49/52); the patches, the baseline and the docs already exist (Phase 40 + tree). Phase 58's only new logic is the second major: list it, replay against it, rebase onto it, build beside it, ship it before 153.27 — each step fixture-provable now and live-gated by a calendar date, never by new infrastructure.

## Common Pitfalls

### Pitfall 1: The 175 guard fires on the 153 line (or vice versa)
**What goes wrong:** a shared tag-listing helper without a per-major filter maps a `FIREFOX_175_*` tag into a 153 bump PR (wrong major shipped) or a `FIREFOX_153_*` tag into the replay-only path (security release missed).
**How to avoid:** per-major guards with the two mirror fixtures in `detect-upstreams-self-test` (175-under-153-guard and 153-under-175-guard both go red naming the drift); set-equality over the two-major state list in `release-train-logic-self-test`.
**Warning signs:** a `chore/esr-*` PR whose tag major disagrees with its branch prefix; an issue titled `release-train: v175…` carrying 153 evidence links.

### Pitfall 2: A hand edit to a 175-conflicted hunk
**What goes wrong:** "just this once" editing of a conflicted hunk body without recomputed blob hashes degrades `git apply --3way` into a silent no-op (Pitfall 2, CLAUDE.md). The patch appears to apply and changes nothing.
**How to avoid:** replay → `--check` → regenerate-write → byte-compare → commit with the pin bump. The fixer F1 path does the same via `regenerate-patches.sh`. `check-patch-surface.sh` + `patches-regenerated` stay green.
**Warning signs:** a patch file whose `index` lines were typed by hand; `git -C upstream diff HEAD` re-derivation differing from the tracked patch.

### Pitfall 3: Depending on an undocumented `FIREFOX_ESR153` key
**What goes wrong:** after 2027-06-29 the detector reads `FIREFOX_ESR` (= `175.0esr`) as "our line" and stops seeing 153.23..153.27 — exactly the window the 153 line still protects.
**How to avoid:** tags are the source, `FIREFOX_ESR` is advisory (Pitfall 10). The 153 pin-age check compares against the 153 tag list. The regression fixture (`175.0esr` + 153.23 tag → 153.23 dispatch) runs in both self-tests.
**Warning signs:** no 153 bump PR within 15 days of a 153.x date after the flip; pin-age red against 175 while pinned to 153.

### Pitfall 4: Clobbering the live 153 objdir to build 175
**What goes wrong:** `mach clobber` on the shared objdir (or reusing `objdir-release/`) destroys the 153 line's build state to prove 175, then both lines queue behind one full rebuild (~40-60 min each).
**How to avoid:** `POWERBROWSER_OBJDIR=objdir-175` from the first 175 build; `du`/`df` before-after recorded per D-73. If legion cannot hold both, the hosted fallback absorbs 175 (recorded verdict, not a forced fit).
**Warning signs:** a build log whose `POWERBROWSER_OBJDIR` is unset during the dual window; `df` showing < 30 GB free before a tier-3.

### Pitfall 5: A second `firefox_esr_tag`-shaped literal
**What goes wrong:** the two-pin change introduces a second tag literal (workflow default, script constant, doc example) that `verify-upstream-pins.mjs` cannot see, so a future bump edits one pin and ships the other.
**How to avoid:** every tag value derives from the manifest or the train input; the `FIREFOX_[0-9]` sweep covers the new shape (workflow inputs included); the self-test plants a literal in the new position and requires red.
**Warning signs:** `grep -rn 'FIREFOX_1[57][35]'` finding a hit outside `configuration.toml`, the checker itself, and tracked fixtures.

### Pitfall 6: Proving 175 with a live nightly fetch in `--quick`
**What goes wrong:** a quick row fetches `FIREFOX_175_*` tags or product-details over the network, so `--quick` goes red offline and CI-flaky online.
**How to avoid:** fixtures. The network half runs in the Actions job; the parsing half runs under `--self-test` from tracked JSON. Same split AUTO-01 already specifies.
**Warning signs:** `curl`/`gh api` in a `--self-test` path; a quick row failing with DNS/timeout output.

## Code Examples

### Per-major tag listing (detector shape, Phase 43 + 58)
```js
// detect-upstreams.mjs: list per pinned major, _RELEASE only, never _BUILDn
const MAJORS = ['153', '175']; // 175 set is empty until the beta; empty set = no train
for (const major of MAJORS) {
  const refs = await listMatchingRefs(`FIREFOX_${major}_`, { releaseOnly: true });
  // guard: drop any tag whose major segment !== major (mirror fixtures prove it)
}
```

### Replay-only bump (no-commit contract)
```sh
# fetch 175 to a scratch upstream (never the live one), replay, check, surface, quick
git fetch upstream "refs/tags/${TAG}:refs/tags/${TAG}"
git -C "$SCRATCH_UPSTREAM" checkout "$TAG"
scripts/apply-patches.sh --upstream "$SCRATCH_UPSTREAM"
scripts/regenerate-patches.sh --check --upstream "$SCRATCH_UPSTREAM"
scripts/check-patch-surface.sh
node scripts/scan-brand-residue.mjs
scripts/verify-platform.sh --quick
# FAIL -> one "ESR <tag>: patch <NNN> did not apply" issue with verbatim logs; PASS -> NOTE counts only
```

### Dual-objdir measurement (UPS-03, D-73 tuple)
```sh
df -h; du -sh upstream/ objdir*  # before
POWERBROWSER_OBJDIR=objdir-175 MOZCONFIG=../.mozconfig ./mach build  # tier-3 at execution
df -h; du -sh upstream/ objdir*  # after
# record: tree $(git rev-parse HEAD) + host legion + toolchain $(cat toolchain-baseline.txt) + date
```

## Doc edits this phase owns (docs/RELEASING.md, docs/BUILD.md)

- `docs/RELEASING.md`: new `### ESR 175 uptake (UPS-01, TRAIN-05)` subsection — replay-only procedure (fetch→replay→check→issue, no commit), the two-key model (`v153.x-r` vs `v175.x-r`), the per-key issue/branch naming, the calendar (beta 2027-06-10, release 2027-06-29, 153 end 153.27 on 2027-09-07), the post-flip `FIREFOX_ESR`-advisory rule, and the ship checklist (rebase green, baseline re-recorded, dual-objdir measured, `release` + `descriptor` approvals per release).
- `docs/BUILD.md`: UPS-03 measurement table — `du`/`df` before-after, both `mach` wall times, the D-73 tuple, and the hosted-fallback verdict (fits legion, or spills to hosted with the INF-04 evidence link).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `scripts/verify-platform.sh` registry plus per-script `--self-test` (node built-ins, bash) |
| Config file | none (rows are the `CHECKS=(` array) |
| Quick run command | `scripts/verify-platform.sh --only <label>` |
| Full suite command | `scripts/verify-platform.sh --quick` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TRAIN-05 | 175 tags list under their own guard; 175-under-153-guard and 153-under-175-guard fixtures red naming the drift | quick + self-test | `--only detect-upstreams-self-test` (Phase 43 row, extended with two-major fixtures) | ❌ Wave 0 (Phase 43 file; precondition `test -f`) |
| TRAIN-05 | two-major state list derived from `release-train.mjs`, set-equal to fixtures; new 175 states covered | quick + self-test | `--only release-train-logic-self-test` (Phase 43 row, extended) | ❌ Wave 0 (Phase 43 file; precondition `test -f`) |
| UPS-01 | replay-only 175 run: conflicts open exactly one `ESR <tag>: patch <NNN> did not apply` issue, commit/push/PR/dispatch nothing; `FIREFOX_ESR=175.0esr` + 153.23 tag still dispatches 153.23 | quick (fixtures) + job dry-run | `--only detect-upstreams-self-test` + `release-train-logic-self-test` fixtures; `dry-run` input renders without writes | ❌ Wave 0 (Phase 43 files) |
| UPS-01 | rebased patches equal their 175 regeneration; hand edit red naming the patch; moved-file `NOTE` + PASS | quick + self-test | `--only patches-regenerated` / `--only patches-regenerated-self-test` (existing rows, 175 run recorded) | ✅ (extend at execution) |
| UPS-01 | toolchain file equals the 175 container bootstrap set; drift fails the build | quick + full (build job at execution) | `--only toolchain-baseline` (AUTO-05 row, extended) + `build-linux` run | ❌ Wave 0 (Phase 49 row; precondition `test -f`) |
| UPS-03 | two ~14 GB objdirs fit legion; `du`/`df` + wall times recorded per D-73; fallback verdict | full (legion at execution) + doc grep | `du -sh objdir*` + `grep -n 'objdir-175' docs/BUILD.md` | ✅ (docs edit) |
| UPS-01 | ship 175.x before 153.27: descriptor + channel-live per 175 BUILD_TARGET; same owner approvals | full (at execution) | `scripts/verify-platform.sh --only channel-live` (Phase 49 row) | ❌ Wave 0 (Phase 49 row) |

### Sampling Rate
- **Per task commit:** `scripts/verify-platform.sh --only <new label>` and its `-self-test`, then `node scripts/scan-brand-residue.mjs` after `git add`.
- **Per wave merge:** `scripts/verify-platform.sh --quick`.
- **Phase gate:** `--quick` green; tier-3 dual-objdir + 175 replay evidence recorded at execution (calendar-gated), before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `scripts/detect-upstreams.mjs` + `detect-upstreams-self-test` row — TRAIN-05, UPS-01 (Phase 43 delivers; Phase 58 extends with the 175 major set + replay-only fixtures)
- [ ] `scripts/release-train.mjs` + `release-train-logic-self-test` row — TRAIN-05 (Phase 43 delivers; Phase 58 adds 175 derive/next/render + states)
- [ ] `scripts/toolchain-baseline.sh` container-set extension + `toolchain-baseline` row — UPS-01 (Phase 49/AUTO-05 delivers; Phase 58 re-records for 175)
- [ ] `channel-live` / `release.yml` SHA path — UPS-01 ship (Phase 49 delivers; Phase 58 reuses with 175 SHAs)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V2 Authentication | no | — |
| V3 Session Management | no | — |
| V4 Access Control | yes (CI) | `permissions: contents: read`, `persist-credentials: false` in the replay-only bump job; no App token minted by replay (bot env untouched) |
| V5 Input Validation | yes | tag shape `^[A-Za-z0-9._-]+$` on the 175 input; major-segment guard per listing; `_RELEASE`-only mapping, never `_BUILDn` |
| V6 Cryptography | no change | MAR signing untouched (patch 030's fork cert is channel-independent; rotation is out of scope — secondary-key ceremony is Phase 44 SEC-05) |
| V10 Malicious code / supply chain | yes | replay-only writes nothing; regeneration gate on the rebase; no new packages; SHASUMS discipline carries over from AUTO-04 |
| V14 Configuration | yes | two-pin shape derives from manifest/train input, never a literal; the `FIREFOX_[0-9]` sweep covers the new shape |

### Threat Model

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-58-01 | Elevation of Privilege | replay-only bump job gaining write scope | high | mitigate | `contents: read`, `persist-credentials: false`, no environment, no App-token step; the `workflows` row (GH-12) asserts all four; self-test plants a write in the replay job and goes red |
| T-58-02 | Tampering | wrong-major bump (175 tag into the 153 line or vice versa) | high | mitigate | per-major guards + mirror fixtures (Pitfall 1); branch/tag-prefix agreement check (`chore/esr-175*` ↔ `FIREFOX_175_*`) |
| T-58-03 | Tampering | hand-edited 175 hunk (silent no-op) | high | mitigate | regeneration-only path; `patches-regenerated` red naming the patch; fixer F1 uses `regenerate-patches.sh` (FIX-02) |
| T-58-04 | Denial of Service | detector blind to 153.x after the `FIREFOX_ESR` flip | high | mitigate | tags-are-source rule; 153 pin-age vs the 153 tag list; `175.0esr`→153.23 regression fixture in both self-tests (Pitfall 3) |
| T-58-05 | Information Disclosure | 175 issue leaking a token or internal path | medium | mitigate | issue body from trusted fields only (tag, patch, files, verbatim tool logs); no `github.event.*` text in `run:` (GH-12 rule carries over) |
| T-58-06 | Tampering | second tag literal drifting from the manifest | medium | mitigate | no-second-literal rule; `verify-upstream-pins.mjs` sweep extended to the new shape; self-test plants a literal in the new position (Pitfall 5) |
| T-58-07 | Denial of Service | 175 build clobbers the live 153 objdir | medium | mitigate | `objdir-175` separation; `du`/`df` pre-flight (>30 GB free); hosted fallback as relief valve (Pitfall 4) |
| T-58-08 | Spoofing | 175 descriptor offered to 153 users (or vice versa) | medium | mitigate | per-key release keys + per-target descriptors; `descriptor-monotonic` (Phase 44) + `channel-live` per BUILD_TARGET at ship time |
| T-58-09 | Repudiation | unrecorded dual-objdir measurement | low | accept (record) | D-73 tuple in `docs/BUILD.md` (tree+host+toolchain+date); missing tuple fails the plan's doc grep |
| T-58-SC | Tampering | npm/pip/cargo installs | low | accept | This phase installs no package. |

## Open Questions

- **175 patch drift (research flag L, carried):** which of the four patches actually conflict on the 175 beta — answerable only at 2027-06-10. The replay-only job is built to find out; the plan does not guess.
- **Whether product-details adds a `FIREFOX_ESR153` key after the flip (research flag L, carried):** unknown and unneeded — the detector never reads it. If it appears, Phase 58 may record it as an additional cross-check; it must not become the source.
- **Two-pin manifest shape (A-58-6, decided at execution):** second `[upstreams]` key vs per-train workflow parameter. Either satisfies UPS-01/TRAIN-05 under the no-second-literal rule; the executor picks and the sweep proves it.

## Deliverables

- [ ] `scripts/detect-upstreams.mjs` 175 extension + two-major fixtures in `detect-upstreams-self-test` (precondition: Phase 43 file exists)
- [ ] `scripts/release-train.mjs` 175 derive/next/render + states, `release-train-logic-self-test` set-equality holds (precondition: Phase 43 file exists)
- [ ] Rebase procedure for the four patches onto 175 (replay → `--check` → regenerate → surface → brand scan → `--quick`), recorded in `docs/RELEASING.md`
- [ ] `toolchain-baseline.txt` + `scripts/toolchain-baseline.sh` 175 container-set extension (precondition: Phase 49/AUTO-05 row exists)
- [ ] `docs/RELEASING.md` 175 uptake subsection + `docs/BUILD.md` UPS-03 measurement table
- [ ] New/changed registry rows, each with `--self-test` (one row per check, derived-and-compared, quick-green on fixtures)

## Validation

- [x] Every requirement has a test mapping (see Test Map above: UPS-01 ×4 rows, TRAIN-05 ×2 rows, UPS-03 ×1 row)
- [x] User constraints have validation (A-58-1..A-58-7 preconditions; owner gates as `checkpoint:human-action` where live; calendar waits as recorded waits, not work)
- [x] Security threat model complete (T-58-01..T-58-09 + T-58-SC, ASVS L1)
- [x] No predecessor or successor validation conflicts (Phase 58 is terminal for v1.6; Phase 43/49/52 rows are extended, not redefined)
- [x] Nyquist validation ready (commands derive from the tree; fixtures prove them before any 175 tag exists)
