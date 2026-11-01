# API Coverage — Windows signing, transport, and update-host surface (Phase 54)

> Full coverage by default. Opt-outs are explicit, reasoned decisions.
> The api-coverage detector script is not present in this tree (no
> `scripts/*coverage*`, `*api-cov*`, or `*integrat*` file exists), so this
> matrix is written by hand against the RESEARCH.md §Package Legitimacy
> Audit and §State of the Art, following the 41 COVERAGE.md shape.

Scope is the external-API surface Phase 54 wires: Azure Artifact Signing
OIDC (`azure/login`), SHASUMS-verified nodejs.org bytes, and the
Task Scheduler plus guest-agent matrix transport. Every INTEGRATE row is
exercised by a Phase 54 job or row; the exceptions are rows marked
read-only, owner-provisioned, or Phase 44/47/49-owned.

| capability | decision | reason |
|---|---|---|
| `azure/login` v3.1.0 over OIDC (no stored secret) in the `sign-windows` job | INTEGRATE | SEC-12 signs inner PE files, then the installer, then the MAR via jsign `--storetype AZURE`; `workflows` row asserts the SHA pin and admission |
| jsign 7.6 release asset (checksum-verified in job) on `ubuntu-latest` | INTEGRATE | only jsign speaks Artifact Signing with no local key; `osslsigncode` cannot do the job |
| `nodejs.org` dist `index.json` + `SHASUMS256.txt` with release-key signature verified in-job | INTEGRATE | PKG-13 `win32-x64` entry is pinned in `node-runtime.json` and verified by the Phase 43 detector wiring |
| nodejs.org `win32-x64` tarball bytes (hash-pinned, version-embedding URL) | INTEGRATE | staged by `package-windows.sh` with the sha256-pin-or-delete gate |
| Task Scheduler API via upstream `TaskScheduler.sys.mjs` (registration from the default profile) | INTEGRATE | UPD-31 verifies the entry plus `backgroundupdate.moz_log` plus a staged apply while closed, or records the exact `REASON` deferral |
| libvirt guest-agent exec in `pkg-win11` (WinRM/SSH fallback recorded per stage) | INTEGRATE | MTX-01 matrix transport; the host driver records which transport each cell used |
| `gh api` read-only GETs (descriptor commit, Release tag, `channel-live` HEAD 200s) | INTEGRATE | DIST-10 per-target descriptors plus `channel-live` per Windows BUILD_TARGET; Task 3 owner dispatch only |
| Cloudflare R2 MAR fallback copy (Phase 49 shape, DIST-08) | OPT-OUT | not needed yet: Phase 49 lands the R2 copy; Windows reuses the same MAR handoff and adds no new credential |
| `powerbrowser-updates` Pages deploy plus `updates.powerbrowser.org` probe (Phase 47 shape, DIST-03) | OPT-OUT | not needed yet: Phase 47 owns the host; Windows commits one `update.xml` per BUILD_TARGET through the same repo the Phase 49 `descriptor` job writes |
| Safe Browsing keyfile mount (Phase 45 shape, UPD-29) | OPT-OUT | not needed yet: the release container owns the keyfile; the Windows cross-build stages no extra key |
| Apple Developer / notarization APIs (Phase 55, SEC-04) | OPT-OUT | explicitly out of scope: macOS only; no Apple credential appears in any Phase 54 job |
| Flathub / winget / Homebrew submission APIs (Phase 56, DIST-04/11/12) | OPT-OUT | explicitly out of scope: package channels only; Phase 54 ships `setup.exe` on GitHub Releases |
| `signtool` on the guest or a hardware-token OV/EV cert | OPT-OUT | explicitly out of scope: the key never leaves Artifact Signing, so no guest-side or token signing path exists |
| `osslsigncode` with a local key | OPT-OUT | explicitly out of scope: rejected, it needs a local key which Artifact Signing never releases |
| MSI/WiX or MSIX packaging APIs | OPT-OUT | explicitly out of scope (REQUIREMENTS.md Out of Scope): NSIS covers Windows |
| Windows Update medic / servicing-stack APIs | OPT-OUT | not needed: the matrix freezes Windows Update by metered setting plus snapshot revert; it never calls the update stack |
| Native crash ingestion (`incoming.telemetry.mozilla.com`, Phase 57) | OPT-OUT | explicitly out of scope: crash reporting stays off through the first Windows release (owner decision 9) |

One-line no-integration declaration: not applicable — Phase 54 integrates
three external APIs (Azure OIDC login, SHASUMS-verified nodejs.org bytes,
Task Scheduler plus guest-agent transport) and opts out of the rest above
with reasons.
