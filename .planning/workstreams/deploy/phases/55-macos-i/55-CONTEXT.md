# Phase 55: macOS (I) - Context

**Gathered:** 2026-10-23
**Status:** Ready for planning
**Mode:** Auto-generated (discuss skipped via workflow.skip_discuss)

<domain>
## Phase Boundary

macOS users install a signed, notarized universal DMG that updates itself.

Requirements: SEC-13, PKG-24, PKG-14, PKG-15, PKG-16, SEC-04 (full text in `.planning/workstreams/deploy/REQUIREMENTS.md`).

Depends on: Phase 47 (live site for the fee waiver), Phase 50 (release pipeline).
</domain>

<decisions>
## Implementation Decisions

### Already decided (owner, 2026-10-20)
- All owner decisions in REQUIREMENTS.md "Owner Decisions" are binding (SEED-002 §12 recommended defaults plus the research additions): Apps only, no PATs; signing only on GitHub-hosted runners behind the `release` environment; D-77 no `schedule:` in the product repo; 24-hour canary wait with owner `release` and `descriptor` approvals; Apple enrolment after the Phase 47 site is live with a D-U-N-S number; Homebrew cask only after notarization.
- SEC-13 is a record-before-build gate: the Apple SDK licence position for cross builds, rcodesign's maintenance status and the Developer ID CA expiry date are checked and recorded before any Phase I build.
- PKG-24: the quick row `mac-entitlements` fails on any `43AQ936H96`, `org.mozilla` or restricted entitlement key in the signing inputs derived from `developer/browser.xml`; its self-test plants each.
- SEC-04: the bundle is signed inside-out with a Developer ID (natives, `node`, `rg`, then frameworks, then the bundle) and notarized through an App Store Connect API key held as a `release` secret, with the Team ID supplied by a hook-only patch.

### Owner gates in this phase (stop points for autonomous execution)
- Every live Apple action is an owner action: requesting the D-U-N-S number, Apple Developer Program enrolment with the nonprofit fee-waiver application (after the Phase 47 site is live), creating and storing the Developer ID certificate and the App Store Connect API key (held as a `release` secret), and any signing or notarization submission that needs those credentials.
- Any real-Mac session (hosted `macos-26` runner use beyond what an agent can dispatch, borrowed/rented Mac install matrix, Gatekeeper observation) is an owner action or owner-provisioned host. Plans build everything locally (cross-toolchain probe, mozconfigs, branding inputs, universal build shape, DMG shape, entitlements row, signing/notarization wiring, matrix record shape) and end with one `checkpoint:human-action` listing the exact commands and observations, after which the live rows run.
- Read-only probes that need no Apple credential (SDK licence text, rcodesign release status, Developer ID CA expiry from public data, upstream source reads) are agent actions.

### Assumptions about unfinished dependencies (recorded per autonomous rules)
- A1: Phase 47 (live site, `powerbrowser-updates` on Cloudflare Pages, WEB-01..05) is assumed as written in ROADMAP.md/REQUIREMENTS.md: the fee-waiver application can proceed because the site is live, and per-target Darwin descriptors have a host. If Phase 47 changes the updates host or the download-page contract, Phase 55 plans cite the host/path only through the shared descriptor builder and download-copy gate so the change is absorbed.
- A2: Phase 50 (release pipeline, `release.yml`, TRAIN-10/BULDING..DONE states, UPD-16 hop drill, channel-live) is assumed as written: a `build-macos` job shape, a per-OS sign job, per-target descriptors and the draft-then-publish gate exist to attach the macOS job to. If Phase 50 changes the release job names or the manifest asset set, the macOS job follows the same `build-*`/`matrix-*` and `contents: read` conventions the `workflows` row enforces.
- A3: Phase 41 waits on the owner (repos, Apps, second owner, probes). Phase 55 plans assume the GH-05 tag ruleset, the five environments with branch policy `main`, and the `workflows` row (no `schedule:`, legion label only in `release.yml` `build-*`/`matrix-*`, SHA-pinned admitted `uses:`) hold as written, and add no second mechanism.

### Claude's Discretion
All other implementation choices are at Claude's discretion — discuss phase was skipped per user setting. Use the ROADMAP phase goal, success criteria, and codebase conventions to guide decisions.
</decisions>

<code_context>
## Existing Code Insights

Start from `.planning/research/v1.6-deploy/SUMMARY.md` Phase I and §"Also" (mac-entitlements row, MAR-channel match, inside-out signing), `.planning/research/v1.6-deploy/ARCHITECTURE.md`, `.planning/drafts/distribution/S7-macos-adhoc-signed-PLAN.md` (ad-hoc predecessor: toolchain probe, `.#firefox-macos` shell shape, per-target mozconfig split, five branding inputs, universal build through `unify.sh`/`unify.py`, staged darwin sidecar, download copy gate, borrowed-Mac matrix), `upstream/taskcluster/scripts/misc/unify.sh`, `upstream/toolkit/mozapps/installer/unify.py`, `upstream/tools/signing/macos/mach_commands.py` (`macos-sign --use_rcodesign`), `powerbrowser/packaging/` (mar, node-runtime.json, package-linux.sh analog), `scripts/generate.mjs` (emitMozconfig, TARGETS rows), `scripts/verify-platform.sh` (registry; every new check is one row plus `--self-test`), `docs/RELEASING.md` (macOS rows, macos-adhoc-signed deferred record) and `docs/BUILD.md` (packaging-hosts capability record, per-OS install matrix).
</code_context>

<specifics>
## Specific Ideas

- Research flag I: the Apple SDK licence position for cross builds on Linux; whether rcodesign is still viable (maintenance status, version); the Developer ID CA expiry date.
- The `mac-entitlements` row derives its expectation from the signing inputs (`developer/browser.xml` shape) at check time and compares as set equality, red on both addition and removal; its self-test plants `43AQ936H96`, `org.mozilla` and one restricted entitlement key, each required to go red naming the drift.
- Inside-out signing order (natives, `node`, `rg`, then frameworks, then the bundle) with the Team ID from a hook-only patch regenerated through `scripts/regenerate-patches.sh`, never text-edited; `check-patch-surface.sh` guards the surface.
- Universal DMG plus complete MAR through `unify.sh`; darwin sidecar built per architecture on hosted macOS runners with natives/`rg`/`node` merged by `lipo`; `package-target-natives` passes on the DMG.
- One Mac matrix row on a hosted runner against the draft DMG plus one real Mac session recording the Gatekeeper copy; user-facing copy names "PowerBrowser" with no internal identifier and states the signing/notarization status honestly.

</specifics>

<deferred>
## Deferred Ideas

None — discuss phase skipped.
</deferred>
