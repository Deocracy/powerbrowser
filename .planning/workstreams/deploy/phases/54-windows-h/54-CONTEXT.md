# Phase 54: Windows (H) - Context

**Gathered:** 2026-10-23
**Status:** Ready for planning
**Mode:** Auto-generated (discuss skipped via workflow.skip_discuss)

<domain>
## Phase Boundary

Windows users install PowerBrowser from a `setup.exe` on GitHub Releases and it updates itself, first unsigned with a stated warning, then Authenticode-signed.

Requirements: PKG-10, PKG-11, PKG-12, PKG-13, LEG-01, MTX-01, UPD-30, UPD-31, SEC-03, SEC-12, DIST-10 (full text in `.planning/workstreams/deploy/REQUIREMENTS.md`).

Success criteria (ROADMAP Phase 54):
1. `release.yml` `build-windows` cross-builds Gecko on legion in the release container and `mach repackage installer` produces the NSIS `setup.exe` plus a complete MAR; generated Windows mozconfig disables the maintenance service; `package-target-natives` passes on the Windows package with a sidecar built on `windows-latest`.
2. Installer carries PowerBrowser artwork, own registry namespace, no install/uninstall ping; `verify-trademark-surface.mjs` self-test goes red on a Mozilla mark planted in each NSIS, application.ini, Info.plist and `MOZ_LAUNCHER_SUBKEY` surface.
3. Windows 11 libvirt matrix installs, launches, updates and uninstalls with clean registry no-residue diff; update applies with sidecar reaped before rename; background-task path verified or deferred with reason recorded.
4. First Windows release ships unsigned with maintenance service disabled, per-target descriptors and the stated /download warning text.
5. After Azure validation, jsign signs inner PE files, then installer, then MAR is produced; /download shows updated signing status.

Out of scope for this phase: macOS (Phase 55), package channels (Phase 56), native crash reporting (Phase 57), ESR 175 (Phase 58). No MSI/MSIX/PKG/Snap (Out of Scope table). No second updater: one complete MAR carries Gecko, Theia, extensions and Node.
</domain>

<decisions>
## Implementation Decisions

### Already decided (owner, 2026-10-20)
- All owner decisions in REQUIREMENTS.md "Owner Decisions" are binding (SEED-002 §12 recommended defaults plus the research additions).
- Decision 10 (signing timing): Apple enrolment after site live + D-U-N-S; Azure account only when the Windows phase is 3 to 4 weeks out (billed from creation, ~USD 10/month Basic). Decision 9: keep `--disable-crashreporter` through the first Windows release.
- Decision 2: legion on the public repo, non-ephemeral, registered once with a registration token; no PAT or App key on legion; fork approval for all external contributors; `release.yml` never on `pull_request`. Decision 3: `sign-publish` creates the tag and publishes with the App token after approval. Decision 11: Actions artifacts between legion build and hosted sign job; legion keeps `contents: read`.
- Decision 5: one release per ESR point release plus out-of-band revision bumps. Decision 13: no `release.json`, no version facts on home page (per-target descriptors live under the updates host, Phase 47/49).

### Owner gates in this phase (stop points for autonomous execution)
- Creating the Azure Artifact Signing account + identity validation (1–20 business days), any legion `/etc/nixos` change (runner libvirt access for the runner user, finished with `nrs` under `pkexec`), the Windows VM licence and its update handling, and any live dispatch/approval of `release.yml` or the `release`/`descriptor` environments are owner actions. Plans build everything locally — generator changes, NSIS patch by regeneration, `package-target-natives` and trademark rows plus self-tests, matrix harness and docs — and end with one `checkpoint:human-action` listing the exact owner commands; they do not create accounts, touch legion, or dispatch workflows.
- Read-only `gh api` GETs against the live org/repo are allowed for research and for read-back rows. No `gh api` PUT/POST/PATCH/DELETE, no `gh workflow run`, no repo/App creation from an agent shell.

### Claude's Discretion
All other implementation choices are at Claude's discretion — discuss phase was skipped per user setting. Use the ROADMAP phase goal, success criteria, and codebase conventions to guide decisions.

### Assumptions about unfinished dependencies (recorded per workstream rule)
- Phase 50 (release pipeline and train) is still pending. Plans assume its contracts as written: `release.yml` exists with a legion build job + hosted sign/publish shape, per-target descriptors under the Phase 47 updates host, and per-release approval gates. Plans add the Windows `build-windows` and per-OS sign jobs and per-target Windows descriptors as extensions of that shape; they do not redesign Phase 49/50.
- Phase 45 (portable Linux release build) is still pending. Plans assume the container bootstrap toolchain (`--enable-bootstrap` in a Debian bookworm container on legion, jessie sysroot) and the `package-linux.sh` staging pattern as written, and extend them to the Windows cross target. If Phase 45 lands a different container shape, the Windows job follows it.
- Phase 43 (Node detector with per-target entries + SHASUMS verification) and Phase 44 (per-target descriptor builder `build-update-xml.mjs`, `descriptor-monotonic` row) are still pending. Plans assume `powerbrowser/packaging/node-runtime.json` gains a per-target Windows entry verified by SHASUMS in the detector, and that the descriptor builder emits one descriptor per BUILD_TARGET idempotently; Windows wires into both rather than inventing parallel mechanisms.
- Phase 41 (repo controls, Apps, `workflows` row) is in progress. Plans assume the `workflows` row assertions hold for any new `release.yml` jobs (no `schedule:`, legion label only in `release.yml` build-*/matrix-* jobs with no `secrets.`/`environment:`, SHA-pinned admitted `uses:`, no event text in `run:`/`prompt:`) and the fixer deny-list shape (FIX-11) for `patches/**`.
- Phase 47 (`/download`, updates host) is still pending. Plans carry the exact SEC-03 warning copy into `docs/RELEASING.md` and the /download source so Phase 47 renders it verbatim, and record the signed/unsigned status flip as a content change, not a second page.
</decisions>

<code_context>
## Existing Code Insights

Start from `.planning/research/v1.6-deploy/ARCHITECTURE.md` (§H row, container/toolchain section), `SUMMARY.md` Phase H (§321-332) + research flags (§377: updater rename with live node.exe, background-task path, MTX-01 libvirt design), `STACK.md:20-23,155` (Windows cross mozconfig, jsign 7.6 + Azure, inner-sign → repackage → MAR chain), `FEATURES.md:108,120,157` (Authenticode pricing/eligibility, NSIS cross-build, LEG-01 gap), `PITFALLS.md:115,125` (sidecar natives are host-built: `theia/.../native/*.node`, `package-linux.sh:60` hard-codes `linux-x64`; gate rows belong in C so Linux is checked first), `CRITIQUE.md:56,C18` (two-line cross mozconfig `working_with_esr_115.md:62-86`; Gecko cross-builds on legion but sidecar natives need per-OS hosted builds).

In-tree anchors:
- `powerbrowser/packaging/package-linux.sh` (staging pattern: `./mach package` → stage sidecar + pinned Node + policies.json → refresh precomplete → rewrite tarball; checkout-path purge; RUNPATH strip) — the Windows packager mirrors this per target.
- `powerbrowser/packaging/node-runtime.json` (today `linux-x64` only, SHASUMS-pinned) — plans add the Windows entry; the detector verifies SHASUMS in-job.
- `patches/040-powerbrowser-nsis.patch` (regenerated hook-only NSIS surface: `browser/installer/windows/nsis/defines.nsi.in` + uninstaller) — PKG-12 extends by regeneration only, never text edit; `scripts/regenerate-patches.sh --check` + `patches-regenerated` row stay green.
- `scripts/verify-trademark-surface.mjs` (today brand.ftl/properties, Theia fragments, desktop Name lines) — LEG-01 extends to `defines.nsi.in`, uninstaller, application.ini Name/Vendor, Info.plist, `MOZ_LAUNCHER_SUBKEY`, each with a plant in `--self-test`.
- `scripts/verify-platform.sh` (one driver, one registry: every new row + `--self-test` that plants each fault and goes red naming the drift; rows derive expectation from the tree, set equality; `--quick` = no build/browser/display/network) — new rows: Windows mozconfig derivation, `package-target-natives` on the Windows package, trademark NSIS extension, `win-matrix` record/probe rows, descriptor-per-target row (Phase 44 shape), jsign chain row.
- `configuration.toml` (`[product] revision`, `[installer] support_url`, `[urls]`, `[upstreams]`, generator `scripts/generate.mjs` as the only writer) — PKG-11 emits the per-target Windows mozconfig (`--disable-maintenance-service`) from the generator; no hand-written mozconfig.
- `docs/RELEASING.md` matrix sections (`windows-unsigned`, `win-matrix-record`, `win-download-copy` rows named there) — plans follow the documented harness vocabulary where it exists and correct it where the tree disagrees.
- `upstream/docs/contributing/build/working_with_esr_115.md:62-86` (two-line Windows cross mozconfig with `--enable-bootstrap`), `upstream/taskcluster/kinds/repackage/kind.yml` (inner-sign → repackage → MAR order).

</code_context>

<specifics>
## Specific Ideas

- Research flag H (must answer before planning locks): the Windows updater rename with a live `node.exe` (UPD-30 AsyncShutdown blocker that reaps the sidecar before the rename — which process object is waited on, where the blocker is registered, what the matrix row observes); the background-task path (UPD-31: verify live in the matrix or defer with the recorded reason — what the task does, what "verified" means); the MTX-01 libvirt design (runner-user libvirt access, snapshot revert, guest transport, Windows-side script, VM licence + update handling, registry no-residue diff scope).
- Ship unsigned first (SUMMARY H; owner decision 9/10): SEC-03 warning copy is verbatim — "Windows may show a 'Windows protected your PC' warning when you open the PowerBrowser installer, because this release is not yet code-signed. Check the download against SHA256SUMS, then choose More info and Run anyway." — and /download states the unsigned status until SEC-12 flips it.
- Signing order is load-bearing (STACK.md:155): hosted job runs jsign on the inner `.exe`/`.dll`, then `mach repackage installer`, then jsign on `setup.exe`, then the MAR, then signmar. DIST-10 adds the per-OS sign job and per-target descriptors for the Windows BUILD_TARGET.
- Maintenance service stays disabled (`--disable-maintenance-service` in the generated Windows mozconfig, PKG-11); the background task (UPD-31) is verified or deferred, never silently enabled.
- `package-target-natives` must pass on the Windows package with a sidecar built on `windows-latest` (PKG-13): no Linux Theia natives in the Windows package; `node-runtime.json` per-target Windows entry; RUNPATH/`/nix/store` and GLIBC ceilings are the Linux row's concern — the Windows row asserts the sidecar triple instead.

</specifics>

<deferred>
## Deferred Ideas

None — discuss phase skipped.
</deferred>
