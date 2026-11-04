# Releasing Power Browser

## What this document is

This is the operator's manual for the release and update system: how it is set
up once, how a release is cut, how it is kept alive, and what to look at when it
fails. Its audience is the project owner, a future maintainer, and the agent
sessions that execute the nine distribution stage plans under
`.planning/drafts/distribution/`.

**Status.** This document is written *ahead of* the stages it describes. Most of
the release pipeline does not exist yet. What does exist today and is cited here:
`scripts/verify-mar-update-hop.mjs` with its `mar-update-hop` and
`mar-update-hop-self-test` row pair, `scripts/verify-installer-schema.mjs` and
`scripts/verify-installer-build-proof.mjs` (the two rows later stages widen),
`powerbrowser/packaging/version-nplus1/`, and `scripts/rebase-upstream.sh`,
`scripts/toolchain-baseline.sh` with `toolchain-baseline.txt`. Everything else
named below is written ahead of the stage that creates it. Three stages rewrite
parts of this document with values they derive from a built tree rather than from
prose, and each of those sections says so where it stands:

- stage `prerequisites-and-hardening` writes the repository-controls register,
  the actions policy, the secrets inventory, the rulesets and environments, the known-red-run
  list, the immutable-release consequence, the toolchain pins, and the seven
  numbered deferred signing items;
- stage `linux-release-pipeline-and-update-channel` writes the release-asset-name
  table and the procedure half, every value read out of `objdir-release`;
- stage `listings-and-cadence` writes the maintenance section behind a gate that
  derives its expectations from the workflows, the manifest and the tracked keys.

Three parts of `docs/BUILD.md` read as the opposite of what this document
states until the non-GUI wave E rewrote them: the key-custody text
(rewritten by NG-065), the "Two facts about where the update URL lives" block and the "Policy install"
section beside it (rewritten by NG-064, NG-065, NG-072). Only the packaging
capability record's line saying `virsh list --all` shows zero defined domains
remains for stage `windows-unsigned`.

Where a value is not derivable today it is named as pending rather than guessed.
A number written here that no stage measured is a defect, not a placeholder.

### Architecture in one paragraph

The release tag `v<ESR>-<revision>` on `Deocracy/powerbrowser` is created
by `release.yml`'s `sign-publish` job with the `powerbrowser-bot` App token, after
the `release` approval (DIST-07, Phase 49), and the `release-tags` ruleset refuses
that tag pattern from every other actor, the owner included (GH-06).
The `build-linux` job of `.github/workflows/release.yml` runs on `legion` as a non-ephemeral self-hosted runner (label powerbrowser-release) holding
`contents: read`, no environment and no secret; it builds Gecko, stages the Theia
sidecar and the pinned Node runtime into the application directory, packages,
emits the MAR, and writes `release-manifest.json` out of the built tree (baked
update URL, version, build ID, `OS_TARGET`, `TARGET_XPCOM_ABI`,
`MOZ_UPDATE_CHANNEL`, the joined BUILD_TARGET, and the on-disk asset filenames).
Its `sign-publish` job runs on `ubuntu-latest` under `environment: release` behind
a required reviewer, and is the only job carrying `contents: write`,
`id-token: write` and `attestations: write`; it decodes the MAR signing key from
two environment secrets, imports the decoded `.p12` into a scratch NSS database
with `pk12util -i`, signs every MAR with `signmar -d <db> -n powerbrowser-mar -s`,
verifies each one against the tracked certificate imported into a scratch NSS
database (`signmar -d <db> -n powerbrowser-mar -v`, see the verify form in
`docs/BUILD.md` "Key-custody rung") **before** any upload, writes
`SHA256SUMS`, attests build provenance, creates the GitHub Release as a **draft**
carrying every asset, checks the draft's asset set against the tree-derived set,
copies each signed MAR to the R2 primary MAR origin at `<tag>/<asset>` (write-once,
read back and compared), and only then publishes the Release once. The `descriptor`
job, after the 1440-minute wait and the owner's approval, emits one `update.xml` per
BUILD_TARGET with `scripts/build-update-xml.mjs --emit` and commits the descriptor tree
to `Deocracy/powerbrowser-updates`. Cloudflare
Pages serves that descriptor repository at `updates.powerbrowser.org`, where one
`_redirects` rule maps the eleven-segment path baked into `application.ini` onto
`<channel>/<BUILD_TARGET>/update.xml`. An installed client reads the update host
out of its own `application.ini`, fetches the descriptor, downloads the MAR from
the R2 primary origin on its custom domain (`downloads.powerbrowser.org`, path
`/<tag>/<asset>`, owner ruling 2026-10-29), verifies the signature against the fork
certificates embedded in its own updater, and applies. The GitHub Release keeps the same
signed bytes as the archival copy. A final `channel-live` job
re-reads the published Release and the live channel and fails the release if they
disagree. Reports travel the other way and share none of that path: a Report a Bug
command opens a prefilled GitHub issue form in a stock browser window, and the
Theia frontend's error hooks post to a Cloudflare Worker at the events origin,
shipped at telemetry level `off` with the endpoint stated so the existing
preference is a working opt-in.

**What the secret-holding job trusts.** `build-linux` output is untrusted data. The
write job never executes anything legion produced: it takes the commit from the
dispatch input, re-runs the SHA gate on its own checkout, derives the release key
(and so the tag and every asset name) from that tree and refuses a manifest that
disagrees, and builds `signmar` from the pinned Firefox source with
`scripts/build-signmar.sh` (each libmar file fetched by exact commit and refused
unless its sha256 equals `powerbrowser/packaging/signmar/SOURCES.sha256`; re-pin that
file in the same reviewed commit that moves the ESR tag, or `release-shape` goes
red). After `signmar -v` the signature is checked a second time with
`scripts/verify-mar-signature.mjs` (node:crypto, no shared code with `signmar`); the
limit is that both read the byte layout from `mar_verify.c`. The one credential-shaped
input legion can read is the Safe Browsing API key directory (`PB_KEYDIR`, mounted
read-only at `/keys`): it ships inside the binary and is not a signing or publishing
credential, and it is the single recorded exception to "legion holds no secret".
The build-provenance attestation names the hosted `sign-publish` job, not the legion
build that produced the bytes. A re-run of one job conflicts with the artifacts of
the failed run only when upload-artifact cannot overwrite them; after a late failure
start a fresh dispatch. The legion pre-job hook refuses any run attempt other than 1, so a
re-run of a release run fails at set-up: a release re-run is always a fresh dispatch. Until the owner has set the R2 bucket, account and
token in the `release` environment (section "R2 primary MAR origin"), the R2 copy step
fails closed before the bot token is minted: a dispatch leaves a verified draft and
publishes nothing.

---

## Current posture, honestly

Nothing in this section is a temporary embarrassment to be papered over. Each item
is a shipped consequence of a decision the project owner took, and each has a
place in the tree that resumes it.

### Linux

The Linux tarball carries no operating-system code signature because Linux has no
such model to satisfy. Integrity for the *update* path is real: every MAR is signed
with the fork's own key and every updater built from this tree verifies it, because
`--enable-unverified-updates` is removed from the generator's mozconfig emission in
stage `mar-signing-and-update-integrity`. A user who downloads the tarball trusts
TLS to GitHub plus the `SHA256SUMS` asset plus the build-provenance attestation;
after install, the update channel is signature-verified end to end.

The first public release is Linux only, x86_64 only, and en-US only. All three
scopes are stated on the download page.

### Windows

The installer `.exe` ships **unsigned**. There is no Authenticode certificate and no
Azure Artifact Signing subscription. What the user sees:

- SmartScreen shows an unrecognised-application warning. The user must open
  **More info** and then **Run anyway**. The download page carries the SEC-03 block word for word:

  > Windows may show a 'Windows protected your PC' warning when you open the PowerBrowser installer, because this release is not yet code-signed. Check the download against SHA256SUMS, then choose More info and Run anyway.

  The block is tracked in `docs/WINDOWS-DISTRIBUTION.md`. The `win-download-copy` row compares it in
  that file, in this one, in `website-staging/download.html` and on the published page with the
  requirement text, and its quoted dialog title with the title the `pkg-win11` guest observed
  (`scripts/matrix/win-matrix-record.json`, the `launch` cell). Do not paraphrase that text on the
  download page; a paraphrase is what the gate exists to catch.
- Azure Artifact Signing identity validation: pending. The owner replaces `pending` with the
  validation date (YYYY-MM-DD) at the 54-04 checkpoint, and only then. `win-download-copy` and
  `win-sign-chain` read this line: while it is pending the download page must carry the block above
  and state the build is unsigned; once it holds a date the page must drop both.
- The Windows mozconfig carries `--disable-maintenance-service`. This is not a
  simplification. With the Authenticode check compiled out, the maintenance service
  would run `updater.exe` as `LocalSystem` on admin installs. Shipping the service
  unsigned would be worse than shipping without it.
- No `CERTIFICATE_NAME` or `CERTIFICATE_ISSUER` NSIS defines exist anywhere on the
  installer surface.
- The `build-windows` job stages the sidecar from a `windows-latest` artifact in `windows-sidecar/` and the
  digest of that artifact's `SHA256SUMS`, recorded by the producing job outside the artifact, in the
  `PB_WIN_SIDECAR_SUMS_SHA256` repository variable (the hosted sidecar job is Phase 50 work, `BLOCKED.md`
  item 8). `powerbrowser/packaging/package-windows.sh` fails closed when either is missing, and
  `powerbrowser/packaging/check-win-sidecar.sh` refuses unlisted files, symlinks and unsafe manifest paths.
- MSIX is out of scope: `upstream/python/mozbuild/mozbuild/repackaging/msix.py`
  raises without `makeappx.exe` and `signtool.exe` from a real Windows SDK, and the
  only reason to add it is a Microsoft Store listing.

### macOS

Record before build (SEC-13): `.planning/workstreams/deploy/phases/55-macos-i/55-SEC13-MEMO.md`
holds the Apple SDK licence position, the rcodesign maintenance status and the Developer ID CA
expiry, each with its read source and date. No Phase 55 build runs before that memo exists. The
posture below stays ad-hoc until the owner checkpoint flips it.

The universal DMG is cross-built on Linux and carries an **ad-hoc signature only**.
There is no Apple Developer Program membership, no Developer ID certificate and no
notarization ticket. What the user sees:

- The ad-hoc signature exists because Apple Silicon refuses to launch an unsigned
  arm64 binary at all. It is the minimum that makes the application start, not a
  claim of publisher identity.
- The DMG opens only through **System Settings, Privacy and Security, Open Anyway**
  on macOS 15 and later. The exact screens are recorded from a real machine during
  the borrowed-Mac session in stage `macos-adhoc-signed` and the download copy is
  corrected to what was observed rather than to what documentation described.
- Self-update works only for user-writable install locations. The elevated update
  helper stays pinned to Mozilla's Team ID `43AQ936H96` in
  `upstream/build/moz.configure/update-programs.configure`, and the generic-certs
  configure switch is forbidden permanently rather than deferred: it would widen
  who may drive a privileged update.
- No macOS asset is published until a person has installed, launched, updated,
  and removed the build on a real Mac and recorded every cell verbatim.

Phase 55 macOS build inputs (recorded, not yet built):

- Per-target mozconfigs `powerbrowser/packaging/mozconfig-macos-aarch64` and
  `-x86_64` share one builder with the Linux dev row. They differ in the Darwin tail
  (`--target`, `MACOS_SDK_DIR` at the bootstrap `MacOSX26.5.sdk`, `MKFSHFS`, `DMG_TOOL`,
  `HFS_TOOL`) and in their objdir. Both channel lines match the shared update channel.
- Node for macOS: `darwin-arm64` and `darwin-x64` pins in `node-runtime.json`, each the
  `.tar.gz` sha256 from nodejs.org `SHASUMS256.txt` for v24.19.0. The owner runs
  `gpg --verify SHASUMS256.txt` against the Node release keys before a release; the
  script enforces the pin, not the key trust.
- Five branding inputs are generated, not hand-written, for both variants:
  `document.icns` and `disk.icns` (the application icon set), `background.png`
  (a 128-pixel placeholder backdrop), `dsstore` (empty: Finder uses its default layout),
  and `Assets.car` (empty: the Makefile copy succeeds without third-party artwork).
  The placeholders are not designed artwork. `Assets.car` is expected to degrade the
  Dock and Finder icon. The upgrade path is a real asset catalog built with `actool`
  (`xcrun actool`) on a Mac; the plan 55-04 Mac session observes the icon.

Phase 55 universal payload and macOS copy (plan 55-03, recorded, not yet built):

- `package-macos.sh universal` merges the darwin sidecar with `lipo`: `node`, `rg` and every
  `.node` from the two per-target bundles become fat files under `Contents/Resources`. The node
  binaries are re-checked against the `darwin-arm64` and `darwin-x64` pins first. The procedure
  and the evidence contract are in `docs/BUILD.md`, "macOS universal package (plan 55-03)".
- The bundle is signed ad hoc only. `macos-package-payload` asserts no Team ID, no certificate
  chain and no stapled ticket, so the signing posture above cannot change without that row
  changing too.
- The macOS cannot-update text is `cannotUpdateMacBody` in
  `theia/extensions/branding/src/browser/powerbrowser-update-copy.ts`, the one site for update
  strings. `update-copy` requires it to name the Applications folder the DMG installs into, and
  requires the download page's macOS signing line to state exactly the posture `release.yml`
  implements: ad-hoc signed and not notarized until a Developer ID and notarization step exist.

## Deferred signing items

This is the **one** deferral register in this document. Stage
`listings-and-cadence` appends listing deferrals to this same numbered section
rather than adding a sibling table, and its gate compares this section as set
equality against the union of these consequences and the admission record's
Resume lines. Do not create a second register.

1. No Authenticode or Azure Artifact Signing certificate exists. Resumed by the
   Authenticode signing stage; the pointer is carried in `docs/BUILD.md`'s Windows
   signing deferrals subsection under the literal id `SEC-03`.
2. The Windows mozconfig therefore carries `--disable-maintenance-service`, because
   that service would run `updater.exe` as `LocalSystem` with the Authenticode check
   compiled out. Resumed with item 1.
3. No `CERTIFICATE_*` NSIS defines are emitted. Resumed with item 1.
4. SmartScreen shows an unrecognised-application warning, and the download page
   documents More info then Run anyway. The Windows half of this item is only true
   once stage `windows-unsigned` has copied its verbatim block onto the live page;
   the `win-download-copy` row asserts it.
5. The macOS arm64 binary carries an ad-hoc signature only, because Apple Silicon
   refuses to launch an unsigned arm64 binary, and no Developer ID or notarization
   exists. Resumed by the signing stage for the certificate, notarization and the
   Team-ID patch (`SEC-04`).
6. The DMG therefore opens only through System Settings, Privacy and Security,
   Open Anyway on macOS 15 and later, and macOS self-update works only for
   user-writable install locations because the elevated helper stays pinned to
   Team ID `43AQ936H96`. Resumed with item 5.
7. The Homebrew cask requires notarization and is therefore deferred past stage
   `listings-and-cadence`, which takes no Homebrew action and records a resume
   pointer naming the later signing stage.

Two further deferrals live in their own places and are named here so nobody
searches for them: a `pull_request` rule on `main` is deferred until a second
contributor exists (its row is in the repository-controls register below), and
native crash reporting is deferred behind the standing exclusion recorded at
`.planning/milestones/v1.2-REQUIREMENTS.md:98` (see the reports stage).

---

## One-time setup

Every step below belongs to exactly one stage plan. The split is not advisory:
an operator step is one an agent session cannot perform, because it needs the
owner's accounts, the owner's `sudo`, physical key custody, or hardware nobody
here owns.

### Operator (needs a human)

| Stage | Step | Why a human |
|---|---|---|
| `prerequisites-and-hardening` | Confirm `git rev-list --count main..origin/main` is 0, `git push origin main`, watch `verify.yml` to success, then push every `v1.*` milestone tag | Push authority; the milestone tags' own tag-triggered runs are red by design on trees predating `fb90e73` |
| `prerequisites-and-hardening` | Enable 2FA on the owner account; confirm the committer email is listed and **verified**; enable organisation-wide 2FA in the hosting organisation settings | UI-only settings; the organisation PATCH endpoint does not expose the 2FA requirement |
| `prerequisites-and-hardening` | Create and install both GitHub Apps, require org 2FA, add the second owner, store both recovery-code sets offline, run the apply script, and run the runner-group probe and the notification drills (Phase 41 plan 41-04) | App creation, org 2FA and ownership are UI-only; `--yes` writes to the live org and runs only from the owner's terminal |
| `mar-signing-and-update-integrity` | Confirm `gh auth status` shows the owner and the `release` environment exists | Account |
| `mar-signing-and-update-integrity` | The MAR key ceremony (below) | Private key custody |
| `mar-signing-and-update-integrity` | The MAR key ceremonies, primary and secondary (key stores live on `legion` at `~/.config/powerbrowser-release/mar-key/` and `~/.config/powerbrowser-release/mar-secondary/`; two mandatory `.p12` copies of each key on two separately stored offline media) and one MAR signed with that store's key for the loopback proof | Private key custody |
| `packaged-product-correctness-linux` | Node provenance: the release train's detect-node job selects the newest Node 24 line, fetches `SHASUMS256.txt` with its `.sig` from `nodejs.org/dist/<version>/`, verifies the signature with `gpgv` against the nodejs/release-keys keyring, and asserts the tarball sha256 equals the signed entry before it opens `chore/node-v24.x`; the owner reviews that PR, and the shipped-licences and provenance section of `docs/BUILD.md` is written from it | Key trust decision |
| `linux-release-pipeline-and-update-channel` | Mint a one-time registration token for `Deocracy/powerbrowser` (no PAT, no App key), write it root-owned mode 0600 to `/var/lib/secrets/github-runner-registration` immediately before the runner registration, and leave that file in place afterwards (the unit reads it as a credential on every start) | Secret custody plus `pkexec` |
| `linux-release-pipeline-and-update-channel` | Add the `services.github-runners` block to `/etc/nixos/configuration.nix` and apply it | Root on `legion` |
| `linux-release-pipeline-and-update-channel` | Set fork pull request workflows from outside collaborators to **Require approval for all external contributors**; read back `fork-pr-approval.json` rather than re-applying | Repository settings UI |
| `linux-release-pipeline-and-update-channel` | Confirm the `release` environment still carries a required reviewer and that the MAR key is an **environment** secret; create no repository-level Actions secret (`repo-controls` asserts that count stays zero) | Read-back of a control the owner owns |
| `linux-release-pipeline-and-update-channel` | Create the public repository `Deocracy/powerbrowser-updates` with a root `_redirects` and a placeholder no-update descriptor at `default/Linux_x86_64-gcc3/update.xml`; create the Cloudflare Pages project (empty build command, output `/`); add `updates.powerbrowser.org` as a custom domain | Cloudflare account and DNS |
| `linux-release-pipeline-and-update-channel` | Probe the eleven-segment path live with real client segment shapes, then switch to a minimal `_worker.js` if the placeholder rule does not match, and record which mechanism shipped | Live infrastructure; the branch cannot be decided from documentation |
| `linux-release-pipeline-and-update-channel` | Create no personal access token for the descriptor repository. The `descriptor` job mints a `powerbrowser-bot` App token scoped to `powerbrowser-updates`; generate the bot App key once and store it as the `BOT_APP_PRIVATE_KEY` secret in each of the `bot`, `release` and `descriptor` environments, with the App id as the `BOT_APP_ID` repository variable and the App client id as the `BOT_APP_CLIENT_ID` repository variable (both repository-level variables, not per-environment; the `actions/create-github-app-token` step reads `BOT_APP_CLIENT_ID`) | Secret custody |
| `linux-release-pipeline-and-update-channel` | Fill the four website routes (`/`, `/download`, `/privacy`, `/legal`, each a real file, no fragment redirect); with the `website-publish-ready` row green, deploy `powerbrowser.org` | Site repository and Pages |
| `linux-release-pipeline-and-update-channel` | Approve the `release` environment gate after reviewing the artifact list and the descriptor commit diff; hold any announcement until the release-mode hop drill is green | The approval is the only point at which the MAR key is used |
| `windows-unsigned` | Provision the `pkg-win11` guest: confirm the media, create or start the libvirt NAT network, create a **new** `pkg-win11` disk (leave the pre-existing shut-off `win11` domain alone), define the domain with qcow2 nvram, install Windows 11, install the QEMU guest agent and stock Firefox, take the `clean-baseline` snapshot | `sudo` for `qemu:///system` |
| `windows-unsigned` | Run the five-cell Windows matrix from the snapshot and write the record | Guest interaction and verbatim dialog capture |
| `macos-adhoc-signed` | Borrow or rent a Mac for one session; record hardware, chip family and macOS version | No Apple hardware is owned |
| `macos-adhoc-signed` | Transfer the DMG, verify its SHA256 on the Mac, install to a user-writable folder, record the Gatekeeper refusal verbatim and the Open Anyway path, confirm the Theia interface and the icon, record both Darwin BUILD_TARGET strings, run one hop from the writable location, repeat from `/Applications` and record what the updater does, uninstall and record residue | The whole point of the session |
| `macos-adhoc-signed` | Push the macOS build job and the flipped asset condition only after the matrix record exists and its gate is green | Release gate |
| `reports-bug-error-crash` | Create the events DNS record on `powerbrowser.org` (proxied), the D1 database and its one-table schema, deploy the Worker, add the rate-limiting rule, and record the database id, wrangler version, deployed version id, threshold and period | Cloudflare account |
| `reports-bug-error-crash` | Copy `website-staging/privacy.html` into the website repository as `/privacy` without rewording and confirm Cloudflare serves it 200 | Site repository |
| `reports-bug-error-crash` | From outside the Cloudflare account post one synthetic event (200), one over-cap body (413) and one burst past the rate limit (blocked); paste all three responses verbatim | An external vantage point |
| `crash-reporting-k` (TEL-07) | In this order: enable R2 on the account, create the bucket `powerbrowser-crash-reports`, confirm its r2.dev public URL is disabled and no custom domain is attached, apply the 30-day lifecycle rule over the `crash/` prefix recorded in `worker/crash-r2-lifecycle.json`, add the zone rate-limit rule over `/submit` on the crash hostname (the host of `[urls].crash_report`), put that hostname in the `routes` block of `worker/wrangler-crash.toml`, then deploy with `wrangler deploy --config worker/wrangler-crash.toml` (the custom domain creates the proxied DNS record); record the wrangler version, deployed version id, rule threshold and period, and that the DNS record exists. The runbook is `worker/wrangler-crash.toml` | Cloudflare account |
| `crash-reporting-k` (TEL-07) | From outside the Cloudflare account post one well-formed multipart submit (200 with `CrashID=`), one over-cap body (413 `oversized_body`) and one burst past the rate limit (blocked); paste all three responses verbatim into the operator record. No token or secret is created in this repository | An external vantage point |
| `reports-bug-error-crash` | Record both TEL-06 deferrals as named rows, and decide the crash-reporter gate in writing as `RETIRED` or `HELD` | Owner decision; under `RETIRED` the milestone owner amends the exclusion row, not this plan set |
| `listings-and-cadence` | Under an ADMIT verdict, regenerate and rename the four Flathub files, substitute the five `@RELEASE_*@` tokens, optionally validate locally, and open the Flathub submission PR from the owner's account | The submission is made under a person's identity |
| `listings-and-cadence` | Under an ADMIT verdict, fork the winget catalogue, create the manifest set, accept the contribution agreement, open the PR, and store the `WINGET_TOKEN` classic PAT (a bot account scoped to its fork; wingetcreate does not support fine-grained tokens) in the `winget` environment | Identity plus secret custody |
| `listings-and-cadence` | Take no Homebrew action; confirm the deferral row names the stage slug that resumes it | Deliberate inaction, recorded |

**Budget, not an operator gate.** Two stages need tier-3 wall time scheduled on
`legion` rather than a person at a console: roughly two hours in
`mar-signing-and-update-integrity` for the N and N+1 rebuilds plus the three
loopback drives, and roughly 55 minutes in `packaged-product-correctness-linux`
for the `objdir-release` rebuild. Both builds are auto tasks in their plans.

### Automated (Claude executes the plan)

| Stage | Work |
|---|---|
| `prerequisites-and-hardening` | Correct the two stale control claims and re-sync the pref comparands; write the nine `.github/settings/*.json` bodies and apply them; write this document's control half; register `scripts/verify-repo-controls.mjs` as the permanent drift check; rebase the ESR pin to the 153.2.0 ESR release tag, push `main` to parity and watch that run |
| `release-identity` | Configure-level probe of the four levers; `releaseIdentity()` in the generator with tracked comparands; policy file, hop gate, branding gate and documents follow the baked host; `scripts/verify-release-identity.mjs` with self-test and two registry rows; one batched dev rebuild proving the baked identity |
| `mar-signing-and-update-integrity` | Carried out by non-GUI wave E Task 8 (NG-065): `patches/030-powerbrowser-mar-certificates.patch`; drop `--enable-unverified-updates`; tier-3 rebuild of N and N+1; fork-key signing per wave E plan Task 8 Produces, descriptor emission, updater-driven four-outcome proof (`ng065-mar-signature-enforced`) |
| `packaged-product-correctness-linux` | Staging and packaging probe; `scripts/stage-sidecar.sh` and `patches/050-powerbrowser-package.patch`; application-directory resolution, profile-scoped Theia state, URL argument handling; variant-free legal notice; shell-side update-ready layer; four registry row pairs and `scripts/run-install-matrix.sh` |
| `linux-release-pipeline-and-update-channel` | Derive the update-origin facts and write the procedure half of this document; `.github/workflows/release.yml` plus its static gate; the live channel gate; the release-mode hop drill and the observed allowlist rows |
| `windows-unsigned` | Five routing verdicts; the release-container cross build and the generated Windows mozconfig (`powerbrowser/packaging/mozconfig-windows-x86_64`, `--disable-maintenance-service`); the Windows SDK and MSVC toolchain, fetched by the mozconfig's `--enable-bootstrap` as the hash-pinned `vs` toolchain (nothing sets `WINSYSROOT` and no sysroot is downloaded by hand); `patches/040-powerbrowser-nsis.patch` (as landed: the uninstall ping is removed; the fork registry namespace, the installer artwork and the LEG-01 surface extension are open, see `BLOCKED.md` items 2 to 5 in the phase directory) and the deny-host grep. Lineage: the installer patch this row used to call `050` is the tree's `040`; there is one installer patch file, not a second; the Windows build, sidecar staging, installer and MAR; the matrix gate, the copy gate, the WINNT descriptor row and the `build-windows` job |
| `macos-adhoc-signed` | Toolchain probe; `.#firefox-macos` shell and two macOS mozconfigs; the five missing branding inputs; universal build, DMG, ad-hoc signature, one universal MAR and two Darwin descriptors; darwin Theia builds and the staged Node binary; five gates plus five self-tests |
| `reports-bug-error-crash` | Substrate probe; the issue-tracker manifest key, issue form, Report a Bug command and prefill gate; diagnostics Copy button and shell copy scope; the events Worker and its contract gate; frontend error hooks with bounded enrichment; the live loopback delivery drill |
| `listings-and-cadence` | Listing-admission probe; generator-emitted Flathub sources with tracked comparands; the winget submission step on the verdict branch and the listings gate; this document's maintenance section and its derived doc-to-automation gate |

### Ordering: push before `release.yml` exists

The order of the first two operator steps is load-bearing and is easy to get
backwards. Stage `prerequisites-and-hardening` pushes `main` **and every `v1.*`
milestone tag** before `release.yml` is authored, for two reasons. First, a
milestone tag pointing at a tree that predates `fb90e73` (the commit that gave
`verify.yml` an `inkscape`) has a tag-triggered run that is red by design; pushing
those tags while the only workflow is `verify.yml` produces a known, explained red
rather than an unexplained one, and every run the push triggers is listed under
**Known red runs** below with its own colour and cause. Second, once `release.yml`
exists it triggers on a tag pattern, and the release-tag rulesets and the `release`
environment's deployment-branch policy all carry that same pattern. The pattern
never matches `v1.*`, but the safe order is to have the milestone tags already on
the remote before any tag-triggered release automation is added.

### Runner registration through the `/etc/nixos` flow

The build runner is `legion` itself, registered as a **non-ephemeral** self-hosted
runner with the label powerbrowser-release. It stays registered between jobs. Only the
`build-linux` job of `release.yml` runs on it, and only from a `workflow_dispatch` of
`main`: the pre-job hook below refuses any other run before its first step. Secrets and
keys never reach it.

The credential is a **one-time registration token**, minted for one registration and never
stored in the tree. No personal access token and no GitHub App key is ever written to
`legion`:

```
gh api -H 'X-GitHub-Api-Version: 2022-11-28' -X POST repos/Deocracy/powerbrowser/actions/runners/registration-token --jq .token
```

Write it once to the registration file, root-owned mode 0600, immediately before the
rebuild that registers the runner. The token expires after one hour. **Leave the file in
place** after the runner shows online: the module reads `tokenFile` as a service credential on
every start, so deleting it breaks the unit at the next restart or reboot, and the expired token
inside it is harmless. Changing the file's content, or any registration-triggering option (`url`,
`name`, `workDir`, `extraLabels`, `ephemeral`, `runnerGroup`), re-registers the runner, so mint
a fresh token only for a deliberate re-registration:

```
pkexec bash -c 'install -d -m 0700 /var/lib/secrets; printf %s "<token>" > /var/lib/secrets/github-runner-registration; chmod 0600 /var/lib/secrets/github-runner-registration'
```

**Registration precondition.** Register the runner only after the three controls are green:
SEC-11 (fork pull request approval, `fork-pr-approval.json`), SEC-10 (the pre-job hook is
installed at the path below) and GH-07 (the `release` and `descriptor` environments carry the
`main` branch policy). The read-back that proves them is
`scripts/verify-platform.sh --only repo-controls`.

**Runner user and work directory.** The unit runs as its own system user, `pb-runner`, with
`autoSubUidGidRange` for rootless podman. Its work directory is `/var/lib/pb-runner`. The path
holds no space, because the build tooling breaks on one (hard rule 4 in `CLAUDE.md`). The runner
user has **no read access** to `~/.config/powerbrowser-release/` (the MAR key store on `legion`)
or to the registration file. The owner verifies both with `sudo -u pb-runner test -r <path>`, and
each check must fail.

**Pre-job hook (SEC-10).** `scripts/legion-pre-job-hook.sh` is the only control bound to the
runner itself, because a repo-scoped runner sits in no runner group. The runner runs it before
the first step of every job, and a non-zero exit fails the job before any step runs. It is
installed as a read-only root-owned copy at `/etc/pb-runner/legion-pre-job-hook.sh`,
byte-identical to the tracked file, and the unit sets `ACTIONS_RUNNER_HOOK_JOB_STARTED` to that
path. The `hook-refusal` row proves the refusal table on the tracked text, including a hostile
environment: an exported shell function, `BASH_ENV` and `ENV` are refused, and a run attempt other
than 1 is refused.

**Deployed-hook drift check (manual).** The control that runs is the deployed copy, and
`hook-refusal` tests only the tracked file. After installing the hook, after any later edit of the
tracked hook, and before each release dispatch, run this from the clone and require one hash printed
twice:

```
sha256sum scripts/legion-pre-job-hook.sh /etc/pb-runner/legion-pre-job-hook.sh
```

Two different hashes mean the deployed copy is stale: copy the tracked file into `/etc/nixos/pb-runner/`
and apply the `/etc/nixos` flow again. A stale copy fails closed on a changed slug and stays too
narrow if the tracked hook is ever widened. There is deliberately no automated check of the deployed
path.

The hook cannot undo a `BASH_ENV` file, which bash runs before the hook's first line. Where the
runner allows the hook's interpreter to be chosen, invoke it as
`/run/current-system/sw/bin/bash -p --noprofile --norc /etc/pb-runner/legion-pre-job-hook.sh`
(`-p` makes bash ignore `BASH_ENV`, `ENV` and imported functions). Whether the runner lets the unit
choose the interpreter of a `.sh` hook is **not verified**: the runner picks the shell from the
file extension as far as is known. Record the answer from the live drill below. If the interpreter
cannot be chosen, the in-script defence is the control, and the live drill decides whether it
holds.

Add to `/etc/nixos/configuration.nix`, with the hook copied to `/etc/nixos/pb-runner/` first.
These option names were verified on nixos unstable (2026-10-31): under
`services.github-runners.<name>`: `enable`, `url`, `name`, `user`, `group`, `workDir`,
`extraLabels`, `noDefaultLabels`, `extraPackages`, `extraEnvironment`, `tokenFile`, `tokenType`,
`ephemeral`, `replace`, `runnerGroup` and `nodeRuntimes`; and `users.users.<name>.isSystemUser`
(exactly one of `isNormalUser` and `isSystemUser` is set), `users.users.<name>.autoSubUidGidRange`,
`users.groups`, and `environment.etc.<name>.source` and `.mode` (a mode other than `"symlink"`
copies the file). Set `tokenType = "registration"` explicitly, and `ephemeral = false`: ephemeral
with a registration token fails on restart. **Not verified:** how the module behaves with a static
`user` and a custom `workDir` (state directory ownership, sandbox write paths), and whether rootless
podman works for `pb-runner`. `pkexec nixos-rebuild dry-build` catches a wrong option name but not
either of those; the owner checks them at apply.

```nix
services.github-runners.powerbrowser-release = {
  enable = true;
  url = "https://github.com/Deocracy/powerbrowser";
  tokenFile = "/var/lib/secrets/github-runner-registration";
  tokenType = "registration";
  ephemeral = false;
  replace = true;
  name = "legion";
  user = "pb-runner";
  group = "pb-runner";
  workDir = "/var/lib/pb-runner";
  extraLabels = [ "powerbrowser-release" ];
  extraPackages = with pkgs; [ git gh nix podman ];
  extraEnvironment.ACTIONS_RUNNER_HOOK_JOB_STARTED = "/etc/pb-runner/legion-pre-job-hook.sh";
};
users.users.pb-runner = {
  isSystemUser = true;
  group = "pb-runner";
  autoSubUidGidRange = true;
};
users.groups.pb-runner = { };
environment.etc."pb-runner/legion-pre-job-hook.sh" = {
  source = ./pb-runner/legion-pre-job-hook.sh;
  mode = "0555";
};
```

Dry-build, then apply with the documented flow:

```
pkexec nixos-rebuild dry-build
pkexec bash -c 'export PATH=/run/current-system/sw/bin:/run/wrappers/bin:$PATH; nrs "feat: legion non-ephemeral github runner for powerbrowser release builds"'
```

The unit is `github-runner-powerbrowser-release.service`, and `count` defaults to 1. The runner
keeps its registration and its work directory between jobs. A stuck job is cleared by restarting
the unit, not by cleaning the work directory while the unit runs.

**Runner acceptance drill (mandatory).** The local `env -i` run of the hook tests the script, not
the runner. It cannot show whether job-controlled environment or a container set-up reaches the hook
or precedes it. Run the live drill below once the runner is online and **before the runner is
trusted**: before the first release dispatch and before plan 49-02's first criterion is marked met.
Push a throwaway branch, never `main`, named `drill/hook`, holding `.github/workflows/hook-drill.yml`
(a `push` trigger on `drill/**`, so the workflow file need not exist on `main`):

```yaml
name: hook-drill
on:
  push:
    branches: ['drill/**']
permissions: {}
jobs:
  env-triple:
    runs-on: [self-hosted, powerbrowser-release]
    env:
      GITHUB_REPOSITORY: Deocracy/powerbrowser
      GITHUB_EVENT_NAME: workflow_dispatch
    steps:
      - run: echo DRILL-STEP-REACHED env-triple
  bash-env:
    runs-on: [self-hosted, powerbrowser-release]
    env:
      BASH_ENV: /dev/null
    steps:
      - run: echo DRILL-STEP-REACHED bash-env
  container:
    runs-on: [self-hosted, powerbrowser-release]
    container:
      image: alpine:3
    steps:
      - run: echo DRILL-STEP-REACHED container
```

Each of the three jobs must be refused at set-up, before any step runs: the job fails, its log
contains no `DRILL-STEP-REACHED` line, and the `container` job pulls and creates no container
(check `sudo -u pb-runner podman ps -a` and `podman images` before and after, and the job log has no
"Initialize containers" step). Record, per job: the conclusion, whether any step ran, the hook's
refusal line as it appears in the job log (this is the only measurement of "the hook's stderr appears
in the job log"; until it is recorded the claim is not made), and whether a container was created.
Record the same for the interpreter question above, and run the `sha256sum` comparison from the
drift check above so the drill exercises the deployed copy. Then delete the branch and the workflow.

If any job reaches a step, or a container is created before the hook, the runner **must not be
used**: stop `github-runner-powerbrowser-release.service`, remove the runner registration, and
redesign the control (for example read the runner's `GITHUB_EVENT_PATH` JSON instead of trusting
environment). The first real `workflow_dispatch` of `release.yml` from `main` is the positive
control: the hook must accept it, which also proves the runner sets `GITHUB_WORKFLOW_REF` and
`GITHUB_RUN_ATTEMPT` in the hook's environment. If it refuses, the hook names the variable, and the
runner stays fail-closed.

**Probe outcome rule (GH-11).** The recorded runner-group probe result decides only whether this
document claims a runner-group restriction. The pre-job hook and the branch policies are built and
asserted whatever that result is.

Package versions from the nixpkgs unstable search index at the time of writing:
`github-runner` 2.333.1, `wrangler` 4.62.0, `nsis` 3.11, `rcodesign` 0.29.0,
`appstream` 1.1.2, `flatpak-builder` 1.4.4, `komac` 2.16.0, `inkscape` 1.4.3. That
index lags the nixpkgs this tree locks (`flake.lock` rev `ffb3c9b7`): resolving the
same attributes against the lock gives `nsis` 3.12, `inkscape` 1.4.4,
`github-runner` 2.336.0, `wrangler` 4.94.0 and `appstream` 1.1.3, while
`rcodesign` 0.29.0, `flatpak-builder` 1.4.4 and `komac` 2.16.0 agree. The lock wins.
`nsis` 3.12 is also what `docs/BUILD.md` records observed live on `legion`, and
`inkscape` 1.4.4 is the version the tracked PNGs were rasterised with.

### Rulesets and environments

Three rulesets and five environments are applied from tracked JSON bodies under
`.github/settings/`, and the `repo-controls` row compares the live state against
those bodies afterwards, so a widened policy or a deleted ruleset reddens after the
phase is archived. Bypass applies per ruleset, to every rule in it, which is why
`main` is split in two.

- `main-integrity` (`ruleset-main-integrity.json`) blocks deletion and
  non-fast-forward on `main`. It has no bypass actor, so it binds the owner too;
  `repo-controls` asserts the owner token's `current_user_can_bypass` is `never`.
- `main-review` (`ruleset-main-review.json`) requires the `verify` check from
  GitHub Actions (integration 15368) and one approving review, with stale reviews
  dismissed on push. Its only bypass actor is the org-owner role
  (`OrganizationAdmin`), mode `always`, so the owner's direct commits to `main`
  still land. No App may bypass a `main` ruleset, and the approving-review count is
  exactly 1; `repo-controls` asserts both.
- `release-tags` (`ruleset-release-tags.json`) restricts creation, update,
  deletion and non-fast-forward on the release tag pattern. The `powerbrowser-bot`
  App is its only bypass actor; the owner's `current_user_can_bypass` is `never`.
  There is no required-signatures rule: release tags are not signed by a human.
- Six environments, each restricted by a custom branch policy to `main` only
  (`environment-branch-policy-main.json`):
  - `release` (`environment-release.json`): the owner as required reviewer, admin
    bypass disabled (`can_admins_bypass` false).
  - `winget` (`environment-winget.json`): holds `WINGET_TOKEN` alone, with the same protection as `release`:
    the owner as required reviewer, admin bypass disabled. `repo-controls` requires a reviewer and
    `can_admins_bypass` false on `release` and on every environment whose job reads `WINGET_TOKEN`.
  - `descriptor` (`environment-descriptor.json`): the owner as required reviewer
    plus a 1440-minute wait timer, with admin bypass enabled so the owner can skip
    the timer after the own-install hop (Owner Decision 18).
  - `bot`, `fixer` and `triage`: the branch policy only.

  `repo-controls` is red on any live environment with a `null` branch policy,
  declared or created by GitHub itself, and on any undeclared environment.

The identity model. After Phase 41 the org has two owner accounts, both org
owners. Ruleset bypass names the org-owner role, never a single user id.
Environment reviewers name the primary owner account. The second owner account
exists for recovery (SEC-06) and is the actor for the GH-18 notification drills,
because GitHub may not notify a user about their own actions. Both accounts'
recovery codes are stored offline; this document records only that they are and
the date, never where.

### GitHub Apps and the Workflows permission

- `powerbrowser-bot` (`app-powerbrowser-bot.json`) holds no Workflows permission,
  and `repo-controls` asserts that no App installed in the org holds it. GitHub
  therefore refuses the bot's git push, contents API write, ref update or Release
  creation whenever the target adds or modifies a file under `.github/workflows/`
  relative to the default branch (docs.github.com, REST API, releases).
- Consequence for Phase 49: `sign-publish` releases only from the tip of `main`, or
  from a commit whose `.github/workflows/` is identical to `main`'s.
- `powerbrowser-clock` (`app-powerbrowser-clock.json`) holds Actions write and
  metadata read, and is installed on `powerbrowser` only. `powerbrowser-bot` is
  installed on `powerbrowser`, `powerbrowser-updates` and `homebrew-tap`.
  `repo-controls` compares each App's permission map exactly and its repository
  list as a set.
- No App private key exists before Phase 43, which is the first consumer. Both Apps
  are created with no key generated.

### Fixer authentication (FIX-12)

Outcome: the fixer authenticates to Anthropic with GitHub OIDC workload identity
federation. The fallback path is recorded below and stays unused unless federation
setup is blocked.

- Why WIF. The pinned `anthropics/claude-code-action` (commit
  `db77d4d3c98f3f6380e7cd45ffba2342a3dbde3c`, v1.0.254) returns an explicit
  `github_token` before it runs its own App-token OIDC exchange, so passing
  `github_token: ${{ secrets.GITHUB_TOKEN }}` keeps the action from minting a Claude
  App token in the `fix` job. The federation exchange is a separate path, keyed by
  `anthropic_federation_rule_id` and `anthropic_organization_id`. The finding is read
  from the pinned action source (RESEARCH §12); re-run that check before any re-pin.
- Shape the workflow asserts (`fixer-auth` in `scripts/verify-workflows.mjs`):
  - `id-token: write` on the `fix` job only. `fix-gate` and `fix-pr` hold no `id-token`.
  - The `fix` job's Claude step sets `anthropic_federation_rule_id` from the
    repository variable `ANTHROPIC_FEDERATION_RULE_ID` and `anthropic_organization_id`
    from `ANTHROPIC_ORGANIZATION_ID`. Both are variables, not secrets.
- Fallback (used only if the Console federation setup is blocked): an
  `ANTHROPIC_API_KEY` secret in the `fixer` environment only, with no `id-token` on
  any job. `fixer-auth` refuses a reference to that secret in any
  `release-train.yml` job whose environment is not exactly `fixer`. Its rotation row
  is in `docs/RENEWALS.md`.
- Credential state: pending. The Anthropic Console fixer workspace, the federation rule
  and the two variables are owner actions at the 52-05 checkpoint. Until they exist,
  the fixer cannot authenticate and no live fix run is possible.

### Fixer spend limits (FIX-05)

Fixer spend is bounded at four layers. The first is an owner setting, and the
others are in-tree and asserted by the `workflows` row (`fixer-spend`, `fixer-tools`).

- A dedicated Anthropic Console workspace for the fixer, separate from triage, with
  a monthly spend limit. The limit is pending the 52-05 owner checkpoint and is
  recorded here, and its review date is in `docs/RENEWALS.md`.
- `--max-turns 40` on the `fix` job's Claude step, so one attempt is bounded.
- `timeout-minutes: 90` on the `fix` job, so one attempt is bounded in time.
- At most two attempts per (release key, class, fingerprint), enforced live. The derive job counts the
  earlier `release-train.yml` dispatch runs of this repository whose display title is
  `fix <key> <class> attempt <n> <fingerprint>` (a dry run is titled `fix dry-run ...` and is not counted;
  a run that `fix-gate` rejects still counts, and so does a dispatch that fails in the derive job after its
  title was formed: the next dispatch is then attempt 2), admits only attempt number spent + 1, and
  `scripts/release-train.mjs --fix-guard` refuses once the budget is spent. No fixer run is
  re-runnable: the derive job refuses "Re-run all jobs" (`github.run_attempt` is not 1), and
  `fix`, `fix-gate` and `fix-pr` each carry `github.run_attempt == 1` in their own `if:`,
  because "Re-run failed jobs" keeps derive's earlier result and would otherwise start the
  failed job again and spend model budget the count cannot see (the `fixer-gate` rule and its
  plants hold all three terms). The owner dispatches the next attempt instead. The
  runs are read as one query per dispatching actor (the owner and the actor of the run, because the
  unfiltered list is capped at 1000 results); a list cut off at that cap is a refusal, never a smaller count
  (`release-train.mjs --run-titles`). The release key must be the current key of the target tag (its ESR
  groups are the tag's), so a dispatcher cannot reset the budget by inventing a greater key. The
  `NEEDS_OWNER` train state that a spent budget implies is part of the train's pure state
  table; the refusal is the red derive job and its log, and the owner decides.
- The `claude-fixer` concurrency group serializes every fix run, so two attempts
  never spend the budget at once.

### Fixer routing (TRAIN-06)

What is live and what is a contract that nothing runs yet:

- Live. The fixer starts only by an owner's `reason=fix` dispatch, and only for F2 (a red
  bump PR on `chore/esr-*`, `chore/node-*` or `renovate/*`) and F3 (red `main`). The derive
  job refuses every other dispatch with the guard it failed: a bot actor, a `claude-fix/`
  branch, an author that is neither the owner nor a permitted bot, a branch that is not in
  this repository, a release key not above the latest Release, a spent budget, and a
  `release` check (a failed `release.yml` run never starts the fixer; the owner reads that
  run). F1 (a patch conflict at the new tag) is refused too: the model's only patch tool,
  `scripts/regenerate-patches.sh`, needs the target's patch stack applied to `upstream/`,
  and a stack in conflict does not apply, so a run would end with no diff. The owner
  resolves patch conflicts.
- Live. The model's Read tool is granted `work/**` and `fixer-data/**` only, and `upstream/**` is denied;
  prep also refuses a target whose patch stack adds or changes a symlink in `upstream/` (a patch can create
  one with `new file mode 120000`), or leaves one that resolves outside the repository. The expected set is
  the symlinks `fetch-upstream.sh` left, read before the apply and compared after it.
- Live. `fix` and `fix-gate` free hosted-runner disk space before the upstream fetch with the same
  step `rebase-upstream.yml` uses (the `workflows` row requires the two texts to be equal): `upstream/` is
  5.6 GB and the gate copies it. The gate's copies use `cp -a --reflink=auto` inside a scratch
  directory on the trusted checkout's filesystem. Measured on the reference host (btrfs, reflink
  supported, 2026-10-31): copying `upstream/` took 68 s and added 1.0 GiB of used space with
  `--reflink=auto` against 48 s and 3.3 GiB with `--reflink=never`. A hosted runner's ext4 has no
  reflink, so there the copy is full and the disk-freeing step is the mitigation; the gate logs `df -h`
  after the copies so a full disk is read in the log.
- Live. The fixer's own writes are one PR, opened by `fix-pr` in the bot environment after
  the gate passed. `fix` exports the diff's sha256 and the base commit; `fix-gate` and
  `fix-pr` check out exactly that base, check the artifact against the digest, and
  `fix-pr` re-runs the pure gate stages on the bytes it publishes. The gate's executing
  stages (5 to 8: `check-patch-surface`, the brand scan, `diff-theia-core`, `verify-platform
  --quick`) run through `scripts/fixer-isolate.sh`: no network, no new privileges, no
  capability, a scrubbed environment (no `GITHUB_*`, `ACTIONS_*`, `RUNNER_*` or credential
  variable), the supplementary groups cleared (sudo form), every filesystem unix socket under
  `/run`, `/var/run`, `/dev/shm` and `$XDG_RUNTIME_DIR` masked, and a mount namespace in which
  every mount is read-only except a per-run scratch directory. The runner's file-command files
  (`GITHUB_ENV`, `GITHUB_PATH`, `GITHUB_OUTPUT`, `GITHUB_STEP_SUMMARY`, `GITHUB_STATE`) and the
  trusted script overlay (`scripts/`, `inventory/`, `.github/` and the baselines laid over the
  gate's worktree) are read-only, so a hostile stage can neither steer a later step through the
  runner nor rewrite the scripts a later stage runs. **Stages 5 to 8 are advisory against a hostile
  diff**: code a stage runs can still lie about its own exit status, so a green dynamic stage means
  the rows ran and reported green, not that the diff passed them. The binding check is `fix-pr`'s
  static re-run (`verify-fix-gate.mjs --static-only`) on the hashed bytes, plus the human review
  of the PR and CI on it. The unprivileged-user-namespace form cannot clear supplementary groups,
  and the `sudo` form has not run on a hosted runner (its self-test reports itself untested on a
  host without passwordless sudo; BLOCKED.md item 6). If the
  publish plan refuses (a commit the bot did not author is on the `claude-fix/` branch)
  `fix-pr` ends red; if the gated diff changes nothing, it ends with a warning and a job
  summary and opens nothing.
- Live (plan 43-06). A red stage labels its tracking issue `train:blocked`, assigns the owner
  and links the failing log (the failing `verify` check, or the train run for a replay
  failure), as `render` in `scripts/release-train.mjs` says; the `report` job writes it. A
  `release.yml` run is read through its jobs: a failed `channel-live` job renders `LIVE_RED`.
  The fixer still starts only by the owner's dispatch.

### The MAR key ceremony and custody

PowerBrowser's updater carries two certificate slots, and each slot holds its own key.
The **primary** key signs every release. The **secondary** key signs nothing until a
rotation and stays offline, so that losing or rotating the primary key does not strand
installed copies of PowerBrowser. Run each ceremony once, on `legion`, at the repository
root, with nobody else at the console and two separately stored offline media mounted.

**Primary key.** NSS database `~/.config/powerbrowser-release/mar-key/`, nickname
`powerbrowser-mar`. The shape is:

```
PB=$HOME/coding/Power-Browser; D=$HOME/.config/powerbrowser-release/mar-key
[ -e "$D/key4.db" ] && { echo "a key store already exists at $D; rotate into a new directory"; exit 1; }
mkdir -p "$D" && chmod 700 "$D"
( umask 077 && head -c 32 /dev/urandom | base64 > "$D/password.txt" )    # R12: the key store's password, never empty
export LD_LIBRARY_PATH=$PB/objdir/dist/bin
$PB/objdir/dist/bin/certutil -N -d "sql:$D" -f "$D/password.txt"
head -c 4096 /dev/urandom > "$D/noise"
$PB/objdir/dist/bin/certutil -S -d "sql:$D" -f "$D/password.txt" -z "$D/noise" -n powerbrowser-mar \
  -s "CN=PowerBrowser MAR signing,O=$(sed -n 's/^vendor_display *= *"\(.*\)"/\1/p' configuration.toml)" -x -t ",," -k rsa -g 4096 -Z SHA384 -v 240
shred -u "$D/noise"
$PB/objdir/dist/bin/certutil -L -d "sql:$D" -n powerbrowser-mar -r > powerbrowser/packaging/mar/mar-primary.der
# Mandatory (SEC-05, SEC-09): two .p12 copies, one on each separately stored offline medium.
$PB/objdir/dist/bin/pk12util -o <medium-1>/powerbrowser-mar.p12 -d "sql:$D" -n powerbrowser-mar -k "$D/password.txt" -w "$D/password.txt"
$PB/objdir/dist/bin/pk12util -o <medium-2>/powerbrowser-mar.p12 -d "sql:$D" -n powerbrowser-mar -k "$D/password.txt" -w "$D/password.txt"
ls -l "$D"    # cert9.db key4.db pkcs11.txt password.txt -- nothing from this directory ever enters the repo
```

The primary ceremony ran while the `.p12` copy was still the owner's call. If either
primary copy is missing, set `PB` and `D` as above and run the two `pk12util` lines
alone against the existing store; the guard line refuses only a new store.

**Secondary key.** Same machine, `legion`. A new NSS database,
`~/.config/powerbrowser-release/mar-secondary/`, never the `mar-key/` store: reusing
that directory would destroy the primary key, which is why the guard line refuses it.
Nickname `powerbrowser-mar-secondary`, its own password file. The shape is:

```
PB=$HOME/coding/Power-Browser; D=$HOME/.config/powerbrowser-release/mar-secondary
[ -e "$D/key4.db" ] && { echo "a key store already exists at $D; rotate into a new directory"; exit 1; }
mkdir -p "$D" && chmod 700 "$D"
( umask 077 && head -c 32 /dev/urandom | base64 > "$D/password.txt" )    # its own password, never the primary's, never empty
export LD_LIBRARY_PATH=$PB/objdir/dist/bin
$PB/objdir/dist/bin/certutil -N -d "sql:$D" -f "$D/password.txt"
head -c 4096 /dev/urandom > "$D/noise"
$PB/objdir/dist/bin/certutil -S -d "sql:$D" -f "$D/password.txt" -z "$D/noise" -n powerbrowser-mar-secondary \
  -s "CN=PowerBrowser MAR secondary,O=$(sed -n 's/^vendor_display *= *"\(.*\)"/\1/p' configuration.toml)" -x -t ",," -k rsa -g 4096 -Z SHA384 -v 240
shred -u "$D/noise"
$PB/objdir/dist/bin/certutil -L -d "sql:$D" -n powerbrowser-mar-secondary -r > powerbrowser/packaging/mar/mar-secondary.der
sha256sum powerbrowser/packaging/mar/mar-secondary.der    # copy this line into the ceremony record below
# Mandatory (SEC-05, SEC-09): two .p12 copies, one on each separately stored offline medium.
$PB/objdir/dist/bin/pk12util -o <medium-1>/powerbrowser-mar-secondary.p12 -d "sql:$D" -n powerbrowser-mar-secondary -k "$D/password.txt" -w "$D/password.txt"
$PB/objdir/dist/bin/pk12util -o <medium-2>/powerbrowser-mar-secondary.p12 -d "sql:$D" -n powerbrowser-mar-secondary -k "$D/password.txt" -w "$D/password.txt"
ls -l "$D"    # cert9.db key4.db pkcs11.txt password.txt -- nothing from this directory ever enters the repo
```

**Ceremony record.** This document records that each copy exists and when it was
made, never where a medium is kept and never a password or key byte.

- Primary key, `powerbrowser-mar`: ceremony date _recorded at the ceremony_; two
  offline `.p12` copies, dates _recorded at the ceremony_.
- Secondary key, `powerbrowser-mar-secondary`: ceremony date _recorded at the
  ceremony_; two offline `.p12` copies, dates _recorded at the ceremony_.
- `mar-secondary.der` SHA256: _recorded at the ceremony_ (the 64-hex line the
  `sha256sum` step prints). If a later `sha256sum` of the tracked file differs from
  this line, re-run the `certutil -L` export from the secondary store and compare the
  SHA256 line again before any commit.

**How the secondary DER reaches patch `030`.** Patch `030` sets the updater's two
certificate slots, and a patch is regenerated, never text-edited. From the repository
root, with the patch stack applied to `upstream/`:

1. `git add powerbrowser/packaging/mar/mar-secondary.der`. The brand scan reads only
   tracked files, so stage before trusting it.
2. In the applied `upstream/toolkit/mozapps/update/updater/moz.build`, point the
   `secondary_cert.inputs` line at `"/powerbrowser/packaging/mar/mar-secondary.der"`
   and update its comment. Touch no other line.
3. Run `bash scripts/regenerate-patches.sh`, then
   `bash scripts/regenerate-patches.sh --check`. If the check names a drift, run the
   write mode again, then the check again.
4. Rebuild. The updater embeds both certificates at build time, so PowerBrowser
   trusts the secondary key from the next build on, never retroactively.

Until these four steps run, patch `030` points both slots at `mar-primary.der` and
`mar-secondary.der` is not tracked.

Both key stores and their `password.txt` files live on `legion` at
`~/.config/powerbrowser-release/mar-key/` and
`~/.config/powerbrowser-release/mar-secondary/`, outside the repo. Nothing from
either directory ever enters the repo: only the two public certificates,
`powerbrowser/packaging/mar/mar-primary.der` and
`powerbrowser/packaging/mar/mar-secondary.der`, are tracked. If `git status` shows any
other file under `powerbrowser/packaging/mar/`, delete it before the next commit and
re-run the `ls -l` line to confirm the store still holds its four files. How the
primary `.p12` reaches the `release` environment is the procedure in
[Secrets inventory](#secrets-inventory).

### Cloudflare Pages

Two Pages projects, both on the Free plan.

**`updates.powerbrowser.org`** serves `Deocracy/powerbrowser-updates` with
an empty build command and output `/`. Its tree is
`<channel>/<BUILD_TARGET>/update.xml`, with a placeholder at
`default/Linux_x86_64-gcc3/update.xml` whose body is the two-line no-update document.
The placeholder is not decoration: git cannot commit an empty directory, and an empty
`updates` element is exactly what an update origin returns when it has nothing to
offer. One `_redirects` rule maps the baked eleven-segment path onto that tree, with
ten placeholders and a 200 proxy:

```
/update/6/:product/:version/:buildid/:target/:locale/:channel/:osversion/:syscaps/:dist/:distversion/update.xml  /:channel/:target/update.xml  200
```

That rule must be **probed live** with the segment shapes a real client sends,
including an `OS_VERSION` segment carrying a percent-escaped space and literal
parentheses and a `SYSTEM_CAPABILITIES` segment carrying `%3A` and `%2C`. If a
placeholder does not match an escaped segment, the fallback is a minimal `_worker.js`
on the same project that splits the path and serves `<channel>/<target>/update.xml`.
Whichever mechanism ships is recorded here by the stage. Do not proceed on an
unprobed rule. An unknown BUILD_TARGET must return 404, not another target's
descriptor.

MAR bytes never go on Pages: Pages caps assets at 25 MiB and a MAR is far larger.
The primary MAR origin is R2 at `downloads.powerbrowser.org` (owner ruling
2026-10-29), and the update descriptor's `patchURL` names that host. The GitHub
Release keeps the same signed bytes as the archival copy.

### R2 primary MAR origin (DIST-08)

One R2 bucket holds the signed MARs. Its own custom domain is the `mar_origin` host of
`configuration.toml` `[urls]` (`downloads.powerbrowser.org`), with public read; no `r2.dev`
URL is enabled. The key of each object is `<tag>/<asset>`, the path of the descriptor's patch
URL, and keys are write-once. `sign-publish` copies each versioned signed MAR in the step
`r2_copy`, after the draft's asset set is checked and before the bot token is minted, so the
origin holds the bytes before any Release is public. For each key the step reads the key
first: the same sha512 is a no-op, other bytes are refused (it never overwrites), and an
absent key is written with `wrangler r2 object put --remote` and then read back and compared
by sha512 before the step passes. A failed copy is rerun by a fresh dispatch at the same key,
because no Release exists yet. wrangler is pinned by the committed lockfile in
`.github/r2/wrangler` (wrangler 4.94.0, the version the tree's `flake.lock` resolves) and
installed with every package script off. wrangler uploads at most 300 MiB per object, which a
MAR must stay under. `release-asset-set` goes red when the step is missing, out of order,
failing open, local (no `--remote`), or without its read-back or its overwrite refusal.

Owner setup (plan 49-05 Task 3; nothing in the tree performs it):

1. Enable R2 on the Cloudflare account (a payment method may be asked for).
2. Create the MAR bucket.
3. Attach `downloads.powerbrowser.org` to that bucket as its custom domain with public read,
   and leave the `r2.dev` URL off. Confirm in the dashboard that the custom domain shows
   active and that `r2.dev` access is disabled.
4. In the `release` environment, set the variables `R2_MAR_BUCKET` (the bucket name) and
   `CLOUDFLARE_ACCOUNT_ID` (the account id). Neither is a secret.
5. Create an R2 API token with object read and write on the MAR bucket only (the read-back
   needs read), and store it as the `release` environment secret `R2_MAR_WRITE_TOKEN`, nowhere
   else. Record the holder and the date in `docs/RENEWALS.md` (row "Cloudflare R2
   object-write token").

A bad release is never fixed by replacing an object or deleting a Release: Releases are never
deleted, R2 keys are never overwritten, and the fix is a new revision with a new tag and so a
new key. The withdraw path (REL-02, owned by Phase 50) is no-update only: the 2026-10-29 ruling
removes the R2-repoint mode, so a withdraw publishes a no-update descriptor and leaves the
objects in place.

The staged updates tree lives in this repository at `updates-staging/` and is copied,
unchanged, into the `powerbrowser-updates` repository for the owner push.

**`powerbrowser.org`** serves the multi-page website repository as a Cloudflare Pages
project with no build step. It has four real routes, each a file that returns 200:
`/` (`index.html`), `/download` (`download.html`), `/privacy` (`privacy.html`) and
`/legal` (`legal.html`). The sources are staged at `website-staging/`. There is no
fragment redirect (the single-page `#download` redirect is retired) and no website
`_redirects` file: every route is a real file. `/.well-known/security.txt` is served through the
zone-level security.txt feature, not a static file.

**Before the website push**, the full-tier `website-publish-ready` row of
`scripts/verify-platform.sh` must be green. It stays red while any staged page carries an
`OWNER TO FILL` placeholder or a `class="pending"` block, and both are intentional until the
owner fills them. Run `scripts/verify-platform.sh --only website-publish-ready` after filling
them, and do not push the site while it is red.

Zone security.txt procedure: enable the feature on the zone, with the Contact address
`mailto:security@powerbrowser.org`. Measured result: pending the owner checkpoint
(plan 47-04).

Email Routing proof shape: send one test message to each of `security@`, `contact@` and
`privacy@` from a sender that is not the destination address, because a message sent
from the destination address proves nothing. Measured results: pending the owner
checkpoint (plan 47-04).

### Windows signing (SEC-12)

The `sign-windows` job in `release.yml` is the only place a Windows file is signed. It runs on
`ubuntu-latest` under the `release` environment, after `build-windows`, and in this order, which
`win-sign-chain` compares as ordered equality: jsign over the inner `.exe` and `.dll` files of the
staged zip (the vendor-signed Node runtime excepted) and the `setup.exe` stub, `mach repackage
installer` from the pinned source, jsign over the installer, `mach repackage mar` (signmar, built from
the pinned source, is the mar tool), then signmar sign and verify against the tracked DER. It
hands the signed installer, the signed complete MAR and their `SHA256SUMS` off as the one-day
`release-windows-signed` artifact. It does not publish, and it attests nothing: the bytes it signs
were built on `legion`, and a hosted provenance attestation would name the hosted job as their
builder. The files it signs are the PE files of the staged zip that the pinned package manifest
names (`scripts/win-sign-list.mjs`, an extra or a missing file stops the job), and the zip name and
its top directory are derived from `configuration.toml`, never read from the artifact. The
signature still covers whatever `legion` compiled into those files: compromising `legion` is
equivalent to compromising the Windows signing identity, so `legion` is inside this trust boundary.

Azure is reached over OIDC only: `Azure/login` v3.1.0 (commit
`a641126d1b8aa4d1fa005f4f92df94a3a4c4c906`, admitted in `.github/settings/actions-selected.json`)
signs in with three ids, and jsign reads a short-lived access token from the job shell. No Azure
secret exists. Azure signing is out of scope (owner ruling 2026-11-01), so when `AZURE_CLIENT_ID` is
empty the configuration gate reports Windows signing as skipped (a notice and a job-summary line),
every later step of the job is skipped, nothing is signed or handed off, and the run does not fail; no
Linux job waits on it (`win-sign-chain`, rules `skip` and `independence`). When `AZURE_CLIENT_ID` is
set, the job fails closed, before the sign-in, when any of these `release` environment variables is
empty:

| Variable | Holds |
|---|---|
| `AZURE_CLIENT_ID` | the app registration whose federated credential trusts this repository's `release` environment |
| `AZURE_TENANT_ID` | the tenant of that app registration |
| `AZURE_SUBSCRIPTION_ID` | the subscription billed for Artifact Signing |
| `AZURE_SIGNING_ENDPOINT` | the account's regional endpoint host, `<region>.codesigning.azure.net` |
| `AZURE_SIGNING_ACCOUNT` | the Artifact Signing account name |
| `AZURE_SIGNING_PROFILE` | the certificate profile name |

Tool pins, as the job states them: jsign 7.6, the `ebourg/jsign` release asset `jsign-7.6.jar`,
2551899 bytes, sha256 `6cf58aa080e7ff82656f320cff8d4a3bff30408df8766806dcba3740dd839fa5` (read
2026-10-31; the job refuses any other bytes). `openjdk-21-jre-headless`, `libnss3-tools` and
`7zip` come from the `ubuntu-latest` archive; the job prints their versions with `dpkg-query`, and the
first live run's versions are recorded here: pending.

Owner steps, at the 54-04 checkpoint (none of them is an agent's):

1. Create the Azure account with two-factor sign-in, an Artifact Signing account and a Public Trust
   certificate profile, and request the identity validation (1 to 20 business days, billed from
   creation).
2. Create an app registration with a federated credential for subject
   `repo:<owner>/<repo>:environment:release`, where `<owner>/<repo>` is the release home that
   `configuration.toml` names, and give it the Artifact Signing certificate profile signer role on
   the profile. Create no client secret.
3. Set the six variables: `gh variable set <NAME> --env release --body <value>`, then
   `gh variable list --env release` to confirm them.
4. Apply the admission list (`Azure/login@*` is new) with the repository-controls procedure.
5. When the validation completes, replace `pending` in the "Azure Artifact Signing identity
   validation" line under "Current posture, honestly", Windows, with the date, and make the four
   content changes of the signing flip in the same commit: deferred signing item 1 (a certificate
   exists), item 2 (the maintenance-service decision is revisited, not silently enabled), item 3 (the
   `CERTIFICATE_*` NSIS defines are emitted by regenerating patch 040), and item 4 with the download
   page (the SEC-03 block is removed and the Windows status line states the signed status).
   `win-download-copy` and `win-sign-chain` go red on a page that disagrees with that line.

### The Windows VM

`pkg-win11` is a **new** libvirt domain on a new disk. A shut-off domain named
`win11` with a 200704-byte stub qcow2 already exists on `legion`; leave it and its
disk alone. The packaging capability record in `docs/BUILD.md` that says
`virsh list --all` shows zero defined domains is stale: `win11` is defined and shut
off on `legion`. Runner-user libvirt access is an owner action in `/etc/nixos`, taken at
the 54-04 checkpoint. The guest is a test target, never a build host: the Windows build is a
Linux cross-compile. Give the nvram `format='qcow2'` rather than raw, because
libvirt refuses an internal snapshot for a pflash domain whose nvram is not qcow2,
and the `clean-baseline` snapshot the matrix reverts to depends on it. The matrix reverts **once** and runs the
five cells as a chain in that one guest session (launch, update and uninstall need the install, and the
no-residue cell diffs the registry snapshot that install took); the inputs reach the guest on a read-only ISO
(`PB_MATRIX_ISO`, volume label from `scripts/matrix/win-matrix-schema.json`) on the domain's CD-ROM device. Install
the QEMU guest agent and stock Firefox (the coexistence cell's other party).

### The Mac session

There is no Mac. One session on borrowed or rented hardware, preferably Apple
Silicon, produces the entire macOS install matrix: SHA256 verification of the
transferred DMG, install to a user-writable folder, the verbatim Gatekeeper refusal
and the Open Anyway path, the Theia interface and the application icon, both Darwin
BUILD_TARGET strings read off the running build, one N to N+1 hop from the writable
location, the same launch from `/Applications` with what the updater does there,
uninstall, and a residue check against real per-user paths. The macOS asset joins a
Release only after that record exists and its gate is green.

## Release tag pattern

A release tag is `v<ESR>-<revision>`, for example `v153.2.0-1`. The literal pattern
is quoted once, here, in the ruleset form:

```
v[0-9]*.[0-9]*-[0-9]*
```

The `release-tags` ruleset carries it under `ref_name.include` as
`refs/tags/v[0-9]*.[0-9]*-[0-9]*`. It covers both the three-part `v153.5.1-1` and
the two-part `v175.0-1`, and `repo-controls` proves it against the release key
`releaseIdentity()` derives from `configuration.toml`. Milestone tags `v1.x` never
match it and never release. Every later reference in this document to "the release
tag pattern" means this string.

## Repository controls

Every control is declared in a tracked JSON body under `.github/settings/`. One
table, `CONTROLS` in `scripts/verify-repo-controls.mjs`, names each body's write
and its read, and drives both the apply and the read-back. The `repo-controls` row
compares the declared keys only (projection), compares every list and every named
set (rulesets, environments, bypass actors, owners, Apps, repositories) by set
equality, and fails closed: an unreadable endpoint is a FAIL naming it, never a
SKIP or a PASS.

`node scripts/apply-repo-controls.mjs` prints the owner UI steps, then the ordered
writes and any `BLOCKED` line, and writes nothing. `--yes` executes the writes and
runs only from the owner's terminal; it never acts on an owner UI step.

Paths below are relative to `repos/{owner}/{repo}` unless they start with `orgs/`
or `user/`, in apply order.

| Control | Tracked body | Write | Read back |
|---|---|---|---|
| Actions permissions (`selected`, SHA pinning) | `actions-permissions.json` | `PUT actions/permissions` | `actions/permissions` |
| Selected actions list | `actions-selected.json` | `PUT actions/permissions/selected-actions` | `actions/permissions/selected-actions` |
| Default token read-only | `workflow-permissions.json` | `PUT actions/permissions/workflow` | `actions/permissions/workflow` |
| Fork PR approval | `fork-pr-approval.json` | `PUT actions/permissions/fork-pr-contributor-approval` | `actions/permissions/fork-pr-contributor-approval` |
| Environment `bot` | `environment-bot.json` | `PUT environments/bot` | `environments` |
| Environment `descriptor` | `environment-descriptor.json` | `PUT environments/descriptor` | `environments` |
| Environment `fixer` | `environment-fixer.json` | `PUT environments/fixer` | `environments` |
| Environment `release` | `environment-release.json` | `PUT environments/release` | `environments` |
| Environment `triage` | `environment-triage.json` | `PUT environments/triage` | `environments` |
| Environment `winget` | `environment-winget.json` | `PUT environments/winget` | `environments` |
| Branch policy `main`, per environment | `environment-branch-policy-main.json` | `POST environments/<name>/deployment-branch-policies`, only when `main` is absent | `environments/<name>/deployment-branch-policies` |
| `main-integrity` ruleset | `ruleset-main-integrity.json` | `PUT rulesets/<id>`, or `POST rulesets` when absent by name | `rulesets`, `rulesets/<id>` |
| `main-review` ruleset | `ruleset-main-review.json` | as above | as above |
| `release-tags` ruleset | `ruleset-release-tags.json` | as above, blocked until `powerbrowser-bot` is installed | as above |
| Immutable releases | `immutable-releases.json` | `PUT immutable-releases` (no body), only while zero Releases exist | `immutable-releases` |
| Private vulnerability reporting | `private-vulnerability-reporting.json` | `PUT private-vulnerability-reporting` (no body) | `private-vulnerability-reporting` |
| Dependabot alerts | `dependabot-alerts.json` | `PUT vulnerability-alerts` (no body) | `vulnerability-alerts` (204 is on) |
| Dependabot security updates | `automated-security-fixes.json` | `PUT automated-security-fixes` (no body), after the alerts | `automated-security-fixes` |
| CodeQL default setup | `code-scanning-default-setup.json` | `PATCH code-scanning/default-setup` | `code-scanning/default-setup` |
| Discussions and auto-merge | `repo.json` | `PATCH` the repository | the repository |
| Repository Actions secrets: zero | (none) | none | `actions/secrets` |
| Org 2FA requirement and the owner set | `org.json` | owner UI step | `orgs/{org}`, `orgs/{org}/members?role=admin` |
| GitHub App `powerbrowser-bot` | `app-powerbrowser-bot.json` | owner UI step | `orgs/{org}/installations`, `user/installations/<id>/repositories` |
| GitHub App `powerbrowser-clock` | `app-powerbrowser-clock.json` | owner UI step | as above |

The `actions-permissions` PUT must precede the `selected-actions` PUT, which 409s
while `allowed_actions` is still `all`.

## Actions policy

`allowed_actions` is `selected` with `sha_pinning_required` true. Two distinct
actions are in use today across both workflows: `actions/checkout` (in `verify.yml`
and `rebase-upstream.yml`) and `cachix/install-nix-action` (in `verify.yml`), each
pinned by full commit SHA. `github_owned_allowed` is true and
`patterns_allowed` carries `cachix/install-nix-action@*` explicitly, so the policy
does not depend on that action's marketplace verification status.

A new action is admitted by adding a pattern to `.github/settings/actions-selected.json`,
re-applying that body, and committing. A red at an Install Nix step names an action
the policy excludes and is fixed that way, never by widening `allowed_actions` back
to `all`.

`scripts/verify-workflows.mjs` (the `workflows` row, plan 41-03) requires the
`owner/repo` set in `patterns_allowed` to equal the set of non-GitHub-owned actions
the workflows use, so an admission no workflow uses goes red as well as an action
that is not admitted.

## Secrets inventory

| Scope | Name | Arrives in | Holder |
|---|---|---|---|
| Repository Actions secrets | none, and the count must stay zero | n/a | `repo-controls` asserts it |
| `release` environment | `MAR_SIGNING_P12_B64`: the base64 of the **primary** `.p12`. The owner sets it by hand, never through Actions and never through the runner: on `legion`, as the owner, with one offline medium mounted and the clone as the working directory, run `base64 -w0 <medium>/powerbrowser-mar.p12 \| gh secret set MAR_SIGNING_P12_B64 --env release`, then unmount the medium. Next step: run `gh secret list --env release` and confirm the updated date is today | `mar-signing-and-update-integrity` | GitHub, gated on the required reviewer |
| `release` environment | `MAR_SIGNING_P12_PASSWORD`: the primary key store's password, which also protects the primary `.p12`. Same session: `gh secret set MAR_SIGNING_P12_PASSWORD --env release < ~/.config/powerbrowser-release/mar-key/password.txt`. Next step: run `gh secret list --env release` and confirm both rows carry the same updated date | `mar-signing-and-update-integrity` | as above |
| `bot`, `release` and `descriptor` environments | `BOT_APP_PRIVATE_KEY`: the `powerbrowser-bot` App key, stored once per environment because a job references exactly one environment (PKCS#8; the App id and client id are the `BOT_APP_ID` and `BOT_APP_CLIENT_ID` repository variables) | Phase 43, the first consumer | GitHub, gated on each environment's protection; the owner holds the offline copy |
| `descriptor` environment | no descriptor-repository PAT: the descriptor PAT is replaced by the scoped App token, a `powerbrowser-bot` token minted in the job with `repositories: powerbrowser-updates`, revoked when the job ends | `linux-release-pipeline-and-update-channel` | n/a, nothing to rotate |
| `fixer` and `triage` environments | the Anthropic credential for each (see the fixer sections); no App key | the fixer and triage stages | GitHub, gated on the environment's branch policy |
| Cloudflare Worker | the `powerbrowser-clock` App key, held by the Worker and not by any GitHub environment | Phase 43 | the Worker's secret store |
| `release` environment | `R2_MAR_WRITE_TOKEN`: an R2 API token with object read and write on the MAR bucket only (the bucket behind `downloads.powerbrowser.org`); read by `sign-publish`'s `r2_copy` step and by no other step or workflow | `linux-release-pipeline-and-update-channel` (plan 49-05) | one holder, the owner (Christopher Colantuono); renewal row "Cloudflare R2 object-write token" in `docs/RENEWALS.md` |
| `release` environment variables (not secrets) | `R2_MAR_BUCKET` (the MAR bucket name) and `CLOUDFLARE_ACCOUNT_ID` | `linux-release-pipeline-and-update-channel` (plan 49-05) | the owner |
| `release` environment variables (not secrets) | `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`, `AZURE_SIGNING_ENDPOINT`, `AZURE_SIGNING_ACCOUNT`, `AZURE_SIGNING_PROFILE`, read by `sign-windows` only; Azure is reached over OIDC and no Azure secret exists anywhere (section "Windows signing (SEC-12)"). `sign-windows`'s `sign_mar` step also reads the two `MAR_SIGNING_P12_*` secrets above | `windows-unsigned` (plan 54-04) | the owner |
| `winget` environment | `WINGET_TOKEN`: a classic PAT with `public_repo` on a dedicated bot account whose only write access is its winget-pkgs fork (wingetcreate does not support fine-grained tokens), branch-restricted to `main`; it shares no environment with the signing key | `listings-and-cadence`, `package-channels` | the bot account holder, recorded in `docs/RENEWALS.md` |
| Host filesystem on `legion` | no personal access token and no App key; only `/var/lib/secrets/github-runner-registration`, root-owned mode 0600, present from minting; the token inside it expires after one hour and is harmless afterwards, and the file stays because the unit reads it on every start; the hook copy `/etc/pb-runner/legion-pre-job-hook.sh`, root-owned mode 0555 | `linux-release-pipeline-and-update-channel` | the operator; not readable by the runner user `pb-runner` |
| Two offline media, stored apart | On each: `powerbrowser-mar.p12` and `powerbrowser-mar-secondary.p12` (from the ceremony blocks' mandatory `pk12util` lines, each protected with its own store's `password.txt`) and both key-store passwords. The secondary `.p12` signs nothing and enters no environment until a rotation; if the owner ever dual-signs, it first gains its own named `release` rows in this table. The ceremony record holds each copy's existence and date, never a medium's location | `mar-signing-and-update-integrity` | the operator |

Holders are named here and values never are: nothing in this table, the tree or a log carries
a token or key content. No secret reaches `legion` through Actions. The build job holds `contents: read`,
no `environment:` and no `secrets.` reference; the static release-workflow gate
asserts all three.

The only Cloudflare credential any workflow holds is the R2 token in `release.yml`'s
`r2_copy` step; `release-asset-set` goes red on a Cloudflare credential in any other step or
workflow file. The maintenance sweep holds no Cloudflare token: it writes download counts
through the telemetry Worker (TEL-11).

## Immutable releases consequence

Immutable releases are enabled while zero releases exist. Assets cannot be added or
changed after publication. `release.yml` therefore creates the Release as a **draft**
carrying every asset in one call, attests, commits the descriptors, and publishes
last with `gh release edit "$TAG" --draft=false`. Attaching an asset to an already
published immutable release is refused, which is the whole reason the draft step
exists.

## Known red runs

Pushing the `v1.*` milestone tags produces one tag-triggered `verify.yml` run per
tag. Each tag pointing at a tree that predates `fb90e73` is red; a tag that already
contains that commit is green. `fb90e73` added `inkscape` to the CI shell, and
before it `scripts/generate.mjs` failed at the 16-pixel icon step on a runner with
no `inkscape`. Today `v1.0`, `v1.1` and `v1.2` predate it and `v1.3` does not. The
stage derives the set with `git tag -l 'v1.*'` rather than fixing a number here, and
records one row per run the push actually triggered with its own colour and cause.
The reds are expected, are not fixed by re-running, and are not evidence of a defect
in the current tree.

## Toolchain pins

The flake lock supplies `inkscape` 1.4.4 and the tracked PNGs under `generated/`
are byte-compared against its output, while the nixpkgs unstable index currently
carries 1.4.3. A flake update is therefore a deliberate change accompanied by a
regenerate and a review of the resulting byte diff, never a routine bump. The same
rule holds for the Gecko toolchain: `scripts/toolchain-baseline.sh` regenerates
`toolchain-baseline.txt` and the rebase procedure diffs against it.

---

### Withdrawing a release (REL-02, `withdraw.yml`)

Withdraw is no-update only. A bad release stops being offered as an update, its Release and
tag stay published as the record, and the fix is a new revision with a new tag
(`[product].revision` + 1, regenerate, new bump PR). Nothing is deleted: not the Release,
not the tag, not a descriptor. Immutable releases burn a deleted tag name for good.

**Placement.** The workflow is `docs/withdraw.yml` in this tree, landed by the owner as
`.github/workflows/withdraw.yml` in `powerbrowser-updates` (the `docs/watchdog.yml`
precedent). It never enters the product repository. The descriptor write is a contents write
on the updates repository, so the job lives there: the product `release.yml` trust map stays
untouched and the token stays narrow. The file derives the product repository from its own
name (`<product>-updates`), so it holds no owner or repo literal.

**Trigger and shape.** `workflow_dispatch` only, with two required inputs: `tag` (the release
key `v<ESR>-<revision>`) and `reason` (one line, at most 200 characters). There is no mode
input. Hosted `ubuntu-latest`, `timeout-minutes: 15`, `permissions: contents: read` at the
workflow and the job, 40-hex pinned `uses:`, no cache, no `pull_request` trigger. The inputs
reach the shell only through `env`, never as `${{ }}` text inside `run:` (the GH-12 event-text
rule, stated here because the Phase 41 `workflows` row covers the product repository only).

**Token.** The job mints the `powerbrowser-bot` App token with
`actions/create-github-app-token` immediately before the writes: `client-id` from the
`BOT_APP_CLIENT_ID` variable and `private-key` from the `BOT_APP_PRIVATE_KEY` secret, both set
in `powerbrowser-updates` by the owner; `owner` the repository owner; `repositories` the
updates and the product repositories; `permission-contents: write` and nothing else. One mint
suffices (the job takes minutes; the token expires after one hour and is revoked at job end).
The same token PATCHes the product Release, which works because the App is installed on both
repositories (GH-10).

**Bytes.** The target set is the `build_target` of the withdrawn Release's
`release-manifest.json` asset, never a hand-kept list. For each target the job writes the
two-line no-update document to `<channel>/<BUILD_TARGET>/update.xml` on `main` through the
Contents API with the commit message `Withdraw <tag>: no-update descriptors (<reason>)`. An
unchanged file is a no-op. It then re-reads every path and compares the set of blob ids
with the no-update blob, so a missing or different target fails the job.

**Marking.** The job appends one block to the Release notes, once: the line
`<!-- release-withdrawn -->` (the mark `scripts/release-train.mjs` derives WITHDRAWN from),
then `Withdrawn: <reason>.` and the new-revision sentence. When the probe verdict below is
`flag` it also sets `prerelease: true` in the same PATCH; on `notes-only` or `pending` it
marks by the notes alone, which is always allowed. Assets, tag and `draft` are never
touched. The verdict is read from `docs/RELEASING.md` at the withdrawn tag; zero verdict
lines, two, or another value stop the job before any write.

**Liveness.** Last, from the product checkout at the tag, the job runs
`node scripts/verify-channel-live.mjs --withdrawn "$TAG"` with the same ten attempts 60 s
apart as `release.yml`, because the updates host deploys from the push. The next section
gives its expected output.

**Owner steps.** Land the file (once), then for a withdrawal:

```
U="$(gh repo view --json nameWithOwner --jq .nameWithOwner)-updates"   # run in the product checkout
gh workflow run withdraw.yml --repo "$U" -f tag=<v<ESR>-<revision>> -f reason="<one line>"
gh run watch --repo "$U"
```

### The immutable-release probe (REL-02, `release-probe.yml`)

The probe answers one question before the first public release: does an immutable,
published Release still accept the pre-release flag from the bot App token? It is
`docs/release-probe.yml`, landed by the owner as `.github/workflows/release-probe.yml` in
`powerbrowser-updates` and dispatched once, after immutable releases are enabled on the product
repository (the repo-controls apply) and before the first release tag.

The probe Release is on the tag `probe-1`. That name is outside the `release-tags` ruleset
pattern (`v[0-9]*.[0-9]*-[0-9]*`), so the bot App may create it, and no release tool reads it
as a release (`verify-descriptor-monotonic` ignores tags that are not release keys). The job
creates it as a draft, publishes it with `make_latest: false` (immutability applies only to a
published Release), tries `PATCH prerelease=true`, appends the withdrawal block with
`Withdrawn: probe.`, re-reads both and prints:

```
release-probe: <date>, tag probe-1, Release id <id>, immutable <true|absent>
release-probe: pre-release flag stuck: <yes|no>
release-probe: refusal: <none | the first line of the 422 or 403 answer>
release-probe: notes append kept: yes
release-probe: verdict <flag|notes-only>
```

It fails only when the notes append does not stick, or when the Release reads
`immutable: false`. The probe Release and its tag are never deleted; a re-run reuses them.

```
U="$(gh repo view --json nameWithOwner --jq .nameWithOwner)-updates"   # run in the product checkout
gh workflow run release-probe.yml --repo "$U"
gh run watch --repo "$U"
```

Record the result below: replace `pending` with the printed verdict and add the date, the
tag and the refusal line. `withdraw.yml` reads this one line as its configuration.

Immutable-release probe verdict: `pending` (not yet run; the withdraw marks by the notes alone until it is recorded)

### The liveness row after a withdrawal (`--withdrawn`)

Withdraw is no-update only: it commits the two-line no-update document for every
BUILD_TARGET and never repoints a descriptor. The default `channel-live` run goes red on
a withdrawn release by construction, because it requires the offered version to equal the
latest Release and a withdrawn Release is still published (never deleted). Running it
after a correct withdraw and reading the red as a regression is the mistake this section
exists to prevent. The withdraw job therefore runs the same script, which lives at
`scripts/verify-channel-live.mjs` (registry rows `channel-live` and
`channel-live-self-test`), in withdrawn mode:

```
node scripts/verify-channel-live.mjs --withdrawn <tag> [--manifest <release-manifest.json>]
```

`<tag>` is the release key of the withdrawn Release (`v<ESR>-<revision>`). Without
`--manifest` the manifest is the `release-manifest.json` asset of the Release at that tag,
which stays published and marked; a tag with no Release, or a Release without that asset,
is red. The mode derives the target set from that manifest, never from a hand-kept list,
fetches each descriptor through the baked eleven-segment path and asserts three things per
target: HTTP 200, bytes exactly equal to the no-update document (the XML prolog line, the
empty `updates` element line, one trailing newline; so no `update` and no `patch` element),
and byte-equality with the updates repo copy at `<channel>/<BUILD_TARGET>/update.xml`. It
reads no MAR origin, because a withdrawn descriptor offers no MAR. It is read-only.

The expected output after a correct withdraw, one target (Linux), is exactly:

```
channel-live: --withdrawn PASS -- 1 target(s): each public update.xml serves the no-update document and byte-equals its updates repo copy, so <tag> is no longer offered
```

with exit code 0. A red names the target and one subcheck: `answered 404, so the withdrawn
channel cannot be read` (the descriptor is unreachable), `it still offers an update (<n>
patch element(s)), so <tag> is still offered` (the commit has not deployed or did not land),
`its bytes differ from it` (not the exact document), or `is not byte-equal to the updates
repo copy` (the host serves other bytes than the repo). Each ends with the step to take:
re-run the withdraw job, then wait for the host deploy.

The default run after the same withdraw is expected to be red, and is not a regression. In
the notes-only marking branch, where `releases/latest` is still the withdrawn tag, its first
problem line reads:

```
channel-live: FAIL -- <n> problem(s); the public channel is not proven equal to the latest Release
  - <BUILD_TARGET> <channel>/<BUILD_TARGET>/update.xml does not carry the descriptor shape. Next step: emit it with scripts/build-update-xml.mjs
```

In the pre-release-flag branch `releases/latest` moves to the previous good Release (or has
none), so the default run additionally reads another tag or finds no published Release.
Either way the withdrawn run above is the one that counts, and the self-test proves the
flip both ways: release bytes are green in the default mode and red under `--withdrawn`,
and the no-update document is green under `--withdrawn` and red in the default mode.

## Train stages after the bump PR merges

The release train (`scripts/release-train.mjs`, `.github/workflows/release-train.yml`)
carries a release from a merged bump PR to a live descriptor. Every state is derived
from GitHub facts only, never from a stored train state: the `release.yml` run at the
merge SHA (matched by the run display title `Release <sha>`), its pending deployments (`release`, `descriptor`), the
Release at the release key (draft, prerelease, assets, notes marker), the
`powerbrowser-updates` descriptor bytes, the `channel-live` conclusion and the tracking
issue state.

Evaluation priority, first match wins: WITHDRAWN (the mark is authoritative), then, for
a published Release, DESCRIPTOR_LIVE or DONE (served bytes equal and channel-live green;
DONE only when the issue is already closed), LIVE_RED (a descriptor is present and
channel-live is red or its bytes drifted), DESCRIPTOR_WAIT (the descriptor environment or
its timer is engaged), PUBLISHED (asset set equal to the manifest-derived set, no
descriptor or a no-update one). Before any Release exists: AWAITING_APPROVAL (run waiting
on the `release` environment), then BUILDING (run in flight).

The train makes at most one transition per release per run and ends at each owner gate:
the bump merge, the `release` approval, the `descriptor` approval. LIVE_RED is sticky until
a fresh green `channel-live`. A bad release is withdrawn by the mark and fixed by a new
revision with a new tag; a Release is never deleted and no tag is reused.

**Dispatch after the merge (`dispatch-release`).** On each tick the train reads the newest
merged PR for the pinned bump branch `chore/esr-<pin>`, takes its merge commit SHA, counts
the `release.yml` runs already dispatched for that SHA, and dispatches `release.yml` with
`inputs.sha` set to that SHA only when the count is zero. A dispatched run's `head_sha` is
the tip of main, never `inputs.sha`, so `release.yml` sets `run-name: Release ${{ inputs.sha }}`
(pinned by the `release-shape` row) and the train identifies the run by that exact display
title together with the `workflow_dispatch` event, the `release.yml` path and this
repository as head repository. The run is resolved that way, never by `head_sha` or by
recency, and linked in the job summary. The merged-PR lookup considers only same-repository
PRs merged into `main`. The `dispatch-release` rows execute these steps against a fixture
where main has advanced past the merge SHA.

Token decision: `GITHUB_TOKEN` with `actions: write` granted on the `dispatch-release` job
alone. The bot App token cannot dispatch (it holds no Actions scope, so the call returns
403), and a clock App would add a second credential for one call. The job holds no
environment, no App key and no contents write, so its only write is the dispatch. The
dispatched input is named `sha`, the input `release.yml` already declares and the
`release-shape` row pins, not `merge_sha`.

Dry run: the reads run and the would-dispatch line is printed; the POST and the run poll do
not run.

**The SHA rule (release.yml, both build-linux and sign-publish).** A dispatched SHA passes
only when it equals the tip of main, or when it is an ancestor of main whose own commit
changes `configuration.toml` and whose `.github/workflows/` tree equals main's. Any other
SHA exits 1 before the first build or sign step, naming the SHA, the tip and the next step.
The workflows-tree conjunct exists because the bot App cannot create a Release for a target
whose workflows differ from main's (404 or 403 far from the cause). The gate text is
executed against scratch repositories by the `release-sha-gate` rows, so a change to it is
what the plants test. The input is `sha`, as the release-shape row pins it.

### The train skeleton contract (TRAIN-01, TRAIN-08)

This records `.github/workflows/release-train.yml` as built; the workflow header comment
is the shorter statement of the same thing.

**Wake and inputs.** The train starts from `workflow_dispatch` only. The hourly clock
(previous section) dispatches it with `reason=tick`; the owner uses `reason=owner`;
`reason=self` is how a `workflow_run` wake would be labelled (held out, below); `reason=fix` is the fixer lane (Phase 52) and
runs the fixer jobs alone. `reason` is validated first, in `derive`, by a shell `case`
pattern (a pattern matches the whole value, never a line of it): anything else exits 1
naming the four admitted values and the next step. `dry-run` is a boolean. The fixer-only
inputs are required, and checked by `scripts/release-train.mjs --fixer-inputs`, only when
`reason=fix`. The merge wake (`workflow_run` on a completed `Verify static layers` run) is
**not** in the file: zizmor's `dangerous-triggers` audit flags it and this repository
never suppresses a finding to make a row green. The owner settled this on 2026-10-31
(phase BLOCKED.md item 1, option B): TRAIN-01's merge wake is out of scope for v1.6, and a
merge is seen on the next tick, at most an hour later.

**Concurrency.** One group for the whole workflow, `release-train`, with no per-ref or
per-reason suffix. Two runs never reconcile at once, so two ticks cannot both open the
same bump branch; a run queued behind a running one waits, and GitHub keeps only the
newest queued run in a group, so a stalled tick is replaced by the next one rather than
piling up.

**Jobs as built for the skeleton and their permissions.** The workflow default is
`permissions: {}`; each job grants itself only what it reads or writes.

| Job | Permissions | Role |
|---|---|---|
| `derive` | `contents: read`, `actions: read` | validates `reason`, runs both self-tests before anything acts |
| `detect` | `contents: read`, `pull-requests: read` | lists the ESR tags and decides the ESR bump |
| `detect-node` | `contents: read`, `pull-requests: read` | selects and verifies the Node 24 line (next section) |
| `bump` | `contents: read` | calls `rebase-upstream.yml`, the one replay definition, with the candidate tag |
| `bump-pr`, `bump-pr-node` | none, in the `bot` environment | mint the bot App token, open or update `chore/esr-<tag>` and `chore/node-v24.x` |
| `report` | `contents: read`, `issues: write` | the only job that writes issues |

The plan named five Phase-A jobs; the skeleton as built has the seven rows above (the two
bump-PR jobs count as one row here). Later phases added `uptake-replay` (Phase 58),
`dispatch-release` (Phase 50), the maintenance jobs (Phase 48) and the fixer jobs
(Phase 52); each is recorded in its own section. `detect` and `detect-node` are separate
jobs on purpose, so a Node failure never blocks the ESR bump and the reverse.

**The `workflow_run` guard and the chain ban.** Every job's `if:` admits a dispatch, or a
`workflow_run` event only when `github.event.workflow_run.head_repository.full_name`
equals `github.repository` and its conclusion is `success`, so a fork's run can never wake
the train. The two `verify-workflows.mjs` rules `workflow-run-guard` and
`workflow-run-chain` enforce that shape and refuse any workflow that names itself in a
`workflow_run` source list (a fork could chain through it). The trigger is held out
today; the guards stay in place so re-adding it later changes nothing else.

**Dry-run semantics (TRAIN-08).** `dry-run: true` validates, decides, replays and renders;
it commits, opens, comments and dispatches nothing. The replay is read-only on the runner,
so `bump` runs in a dry run too. Three layers enforce it, and each has planted faults in
`scripts/verify-workflows.mjs --self-test`: the `dry-run-gate` rule (every step in
`release-train.yml` that pushes, commits, opens, comments, dispatches or mints an App
token carries a negated `inputs.dry-run` in its `if:`; an inverted or `always() ||`
gate fails), the `bot-job-gate` rule (a job that enters the `bot` environment carries the
negated gate at job level, so a dry run never reaches the environment or its approval
wait), and the `workflows` row that runs both. A dry run prints `dry-run: would open or
update chore/esr-<tag>`, `dry-run: would open or update chore/node-v24.x at <version>` and
the tracking-issue view it would write, from the facts it derived.

**Dry-run evidence, reproducible with no network** (all four read fixtures and write
nothing to the tree): `node scripts/release-train.mjs --self-test` (state table set-equal
to its fixtures, planted faults red, controls green); `node scripts/detect-upstreams.mjs
--self-test`; `node scripts/detect-upstreams.mjs --listing <tags-file>` for a listing with
one newer `*esr_RELEASE` tag, a `_BUILDn` tag and a 175 tag (prints
`candidate=...` and the refusal reasons); `node scripts/release-train.mjs --would-write
<pin> <tag> '' ''` (renders the tracking issue the writer would write). The live
equivalent is `gh workflow run release-train.yml -f reason=owner -f dry-run=true`, an
owner action; see the exit-test section for why that run is recorded.

**Tracking issue.** One issue per release key, titled `release-train: v<ESR>-<revision>`,
a view re-rendered from facts each run and never an input. Its pure protocol
(`findExactlyOne`, `render`, `renderConflict`) is in `scripts/release-train.mjs`. The live
writer is wired (plan 43-06, owner approval 2026-11-03): `derive` collects the facts with
read-only GETs, `release-train.mjs --tracking-plan` decides the writes, and one `report` step
behind `!inputs.dry-run` creates, labels, assigns and locks the issue, PATCHes its body only
when the bytes differ, mentions the owner once on entering an owner state, and closes or
reopens it. Two issues by the owner or the bot for one key make `report` red naming both, and
nothing is written in that run. The conflict issue and the uptake-lane issue are still printed,
not written.

**The pinned known-issues issue (GH-15).** Once the pin's train has a published Release that is
not withdrawn, `report` copies `docs/KNOWN-ISSUES.md`, read at the merge SHA, into one issue
titled `PowerBrowser known issues`: a two-line header (release key, the Release's publish day,
the source path, where to report) and the file bytes verbatim. It is created once, PATCHed only
when the bytes differ, and two issues with that title are red. The header carries no SHA and no
run link. Pinning has no REST endpoint, so `report` calls the GraphQL `pinIssue` mutation with the
job token; it uses 1 of the 3 pins a repository allows. If the token is refused, the job prints a
NOTE and the owner pins the issue once by hand (the issue page, Pin issue). Owner-click record:
not pinned yet (no Release exists, 2026-11-03); replace this line with the date and who when it
happens.

### Node provenance (AUTO-04)

This replaces the manual `gpg --verify` step that `docs/BUILD.md` carried for the Node
pin; BUILD.md now points here. For the Linux pin the train owns the whole chain, in the
`detect-node` job, on every bump, before anything is opened:

1. **Selection.** Download `https://nodejs.org/dist/index.json` and pick the newest entry
   whose version matches `^v24\.` and whose `files` list includes `linux-x64`
   (`selectNode24` in `scripts/detect-upstreams.mjs`). A major other than 24 is never
   selected, and a line not strictly newer than the pin in
   `powerbrowser/packaging/node-runtime.json`, or an already-open `chore/node-v24.x` PR, is a
   hold with empty outputs.
2. **Signature.** Clone the `nodejs/release-keys` repository, import its keys into a scratch
   keyring, fetch `SHASUMS256.txt` and `SHASUMS256.txt.sig` from `nodejs.org/dist/<version>/`
   and run `gpgv` over them. A bad or unknown signature fails the job.
3. **Entry.** Read the sha256 for the exact tarball filename from the verified file
   (`shasumsEntry`); a malformed line is skipped, a missing entry fails the job.
4. **Tarball.** Download the tarball and assert its sha256 equals the signed entry.
5. **PR.** `bump-pr-node` re-checks the version shape (`^v24\.[0-9]+\.[0-9]+$`) and the
   64-hex digest, rewrites only the `linux-x64` entry of `node-runtime.json`, runs
   `scripts/verify-node-major-agreement.mjs`, and publishes `chore/node-v24.x` through
   `scripts/publish-bump-branch.sh` as a PR for the owner to review.

`powerbrowser/packaging/package-linux.sh`'s check of the downloaded archive against the pin stays as the second layer: it
enforces the committed pin, it does not establish provenance. The `win32-x64` and
`darwin-*` pins are not moved by this job; they keep the owner's manual `gpg --verify` of
`SHASUMS256.txt` (see the macOS notes under **Current posture**) until a later plan extends the
chain. The Node half has no live run yet: its network steps run only in the workflow, never in
`--quick`.

### The calendar exit test (Phase 43, ROADMAP criterion 1)

The train is proven by the calendar, not by a dispatch. The first ESR 153 point release
after the Phase 43 owner checkpoint is the test: **153.7 on 2026-11-10**, else **153.8 on
2026-11-24**, then every two weeks until one arrives. The dates are the plan's calendar and
were not re-fetched from Mozilla's schedule here.

**What arrival must show, with the owner dispatching nothing for it:**

- a bot PR `chore/esr-<tag>` for the new tag, opened by the train, whose `verify.yml` run is
  green without an approval click;
- exactly one tracking issue for that release key, locked, titled
  `release-train: v<ESR>-<revision>`;

**The three-leg proof that the owner dispatched nothing:**

1. *Tick-only dispatches.* The `release-train.yml` runs of event `workflow_dispatch`
   between the previous point release and the arrival are all titled `release train tick`
   (the run name carries the reason) and dispatched by the clock App; none is titled
   `release train owner`.
2. *Run linkage.* The Worker's `return_run_details` response names the run each tick
   started, and the run of the tick that opened the PR is linked in the tracking issue's
   snapshot.
3. *Rendered from facts.* The issue body matches what `release-train.mjs --would-write
   <pin> <tag> '' ''` renders for that pin and tag, including its
   `<!-- release-train:v1 ... -->` marker.

**Recording rule.** The test is recorded green only with all three links (PR, run, issue).
Otherwise it is recorded `exit-test: pending <date>` and the plan stays open. Two things
bound what can be observed today: an owner `reason=owner` dry run is itself a dispatch, so
make it before the window opens or list it in the record, and the issue leg cannot be
observed until the live tracking-issue writer is wired (phase BLOCKED.md item 3), because
today `report` prints the view without writing it.

---

## Per-release procedure

Read `docs/BUILD.md` for what each build step costs. A full Gecko build is roughly
55 minutes on `legion`, so the cheap gates come first.

**1. Bump the revision and regenerate.** The app version stays the ESR version;
the release identity is `[upstreams].firefox_esr_tag` plus `[product].revision`
from `configuration.toml`, resolved by one exported `releaseIdentity()` function in
the generator. Edit the revision, then:

```
nix develop .#theia --command node scripts/generate.mjs
nix develop .#theia --command node scripts/generate.mjs --check
```

Hand-editing a generated file is forbidden; the `--check` run asserts idempotence
and byte identity against the tracked comparands.

**2. Run the quick tag row.** This is the `--quick` gate that ties the tag, the
version files and any committed descriptor together:

```
scripts/verify-platform.sh --only release-identity
scripts/verify-platform.sh --quick
```

`release-identity` compares `powerbrowser/packaging/version/version.txt` against the
ESR version and `powerbrowser/packaging/version/release.txt` against the release key,
compares the upstream checkout's `config/milestone.txt` against the ESR version when
`upstream/` exists, requires every tracked `update.xml` to carry `appVersion` equal to
the ESR version and any `displayVersion` equal to the release key without its leading
`v`, requires every release tag HEAD contains (`git tag --merged HEAD`) that is not at
HEAD to compare lower than or equal to the derivation, and, when HEAD does carry a
release tag, requires that tag to equal the derived tag. Equal is allowed so an
ordinary commit after a release stays green, and a tag on a commit HEAD does not
contain (another branch or worktree) is not read. That the key is new is checked
where the tag is created, not here. On a checkout with no descriptors or no release tags it prints a named
count line saying so rather than passing silently.

No `version_display.txt` is ever created in `powerbrowser/packaging/version/`. That
name is Gecko's `--with-version-file-path` layout (as `version-nplus1/` uses it), and
a revisioned display value there would not end in `esr`, which clears
`AppConstants.IS_ESR` and moves Remote Settings and search to the `default` channel.
The version files are release metadata, never a Gecko build input.

**3. The release tag.** No human creates it. `sign-publish` creates the
`v<ESR>-<revision>` tag with the `powerbrowser-bot` App token (DIST-07, Phase 49).
The `release-tags` ruleset refuses a release-pattern tag from any other actor, and
`repo-controls` asserts that the owner's `current_user_can_bypass` on that ruleset
is `never`. Milestone tags `v1.x` never release and never match the pattern.

**4. Watch `build-linux` on legion.** Budget the wall time rather than assuming a
fast run:

```
gh run watch --repo Deocracy/powerbrowser --exit-status "$(gh run list --repo Deocracy/powerbrowser --workflow=release.yml --limit 1 --json databaseId --jq '.[0].databaseId')"
```

Look at: that the job took the `[self-hosted, legion]` runner, that it emitted
`release-manifest.json`, and that the packaged tarball, the MAR and
`dist/bin/application.ini` were uploaded as artifacts.

**5. Approve the review gate.** The run pauses on the `release` environment's
required reviewer before `sign-upload` starts. Approving is the only point at which
the MAR key is used, so review two things first: the artifact list, and the diff of
the descriptor commit that the job will push to `powerbrowser-updates`.

**6. Confirm the Release published and the descriptor landed.**

```
gh release view "$TAG" --repo Deocracy/powerbrowser --json isDraft,assets
```

Look for `isDraft false` and, in the asset list, the versioned and stable pair for
each target plus `SHA256SUMS`, `LICENSING.md`, `THIRD-PARTY-NOTICES.txt`, the MAR
and the source tarball. Then confirm the descriptor commit exists in
`Deocracy/powerbrowser-updates` and that the live descriptor now carries a
complete patch rather than the empty `updates` element.

**7. The liveness row.** `release.yml`'s final job `channel-live` runs
`scripts/verify-channel-live.mjs --manifest <path>` against the release it
just published. It derives the descriptor host, the eleven-segment path, the channel
and the BUILD_TARGET set from the build job's own manifest, fetches each descriptor
through the baked path (which exercises the `_redirects` rule rather than the
underlying file path), HEADs the patch URL and compares Content-Length to the
descriptor size, GETs the MAR and compares its sha512 to the descriptor hashValue,
requires the patch URL to be https on the MAR origin host (`downloads.powerbrowser.org`)
with the path `/<tag>/<asset>`, refusing a github.com download, a release-assets or a
latest-download form before any MAR request, and compares
appVersion and buildID against the published Release. It can also be run by hand:

```
scripts/verify-platform.sh --only channel-live
```

**8. The hop drill, before any announcement.** Install the published tarball as N,
point nothing at loopback, and let the client's own update timer reach the live
channel with `MOZ_LOG=nsHostResolver:5` and `app.update.log=true` captured across
the whole check, download, stage and apply cycle. Record `hop.json` with
`served: "release"` and run:

```
node scripts/verify-mar-update-hop.mjs
scripts/verify-platform.sh --only mar-update-hop
```

The release assertion set requires the descriptor host and the MAR host both present
in the resolver log, the downloaded MAR's sha512 equal to the descriptor hashValue,
an https patch URL, zero `*.mozilla.org` and `*.mozilla.net` hosts, `signmar -v`
passing against the shipped key, `gh attestation verify` passing on the MAR, and
distinct build IDs with an appVersion that is not older. That last substitution is
not a relaxation: the version scheme keeps appVersion at the ESR version, and
upstream's `updateIsAtLeastAsOldAs` refuses an offer only when the versions compare
equal **and** the build IDs match, so a same-appVersion distinct-buildID hop is
exactly what the client treats as an upgrade.

Hold the announcement and any package-manager submission until this drill is green.

**Hop record (served: release).** The drill is the clean-room run in `docs/BUILD.md`
("Clean-room drill for a published Release"). The owner pastes these fields back, and each
one is what the release assertion set reads or what a reviewer audits:

- `served`: `release`. The fork-server (`loopback`) record is a different proof.
- `servedUrl` (the public descriptor, under `updates.powerbrowser.org`) and `servedMarUrl`
  (`https://downloads.powerbrowser.org/<tag>/<asset>`, write-once). Any `github.com`,
  `release-assets` or latest-download form is refused.
- Resolver host lines: the `Resolving host [...]` set from `client-resolver.log`. It must name
  both the update and the download host, and must name neither `github.com` nor
  `release-assets.githubusercontent.com`, nor any `*.mozilla.org` or `*.mozilla.net` host.
- `signmar -v` and `signmar -T` output, and the node:crypto check of
  `scripts/verify-mar-signature.mjs` against `powerbrowser/packaging/mar/mar-primary.der`.
- Attestation path taken: `bundle` (an offline `gh attestation verify --bundle`) or `host`
  (a logged-in `gh attestation verify` on the host). Both pin `--signer-workflow` to this
  repository's `release.yml`, `--source-ref refs/heads/main` and `--deny-self-hosted-runners`.
  Never a skip.
- Version pair: N and N+1 with their buildIDs. Same appVersion with a distinct buildID is the
  ratified scheme, not a relaxation: `updateIsAtLeastAsOldAs` (the client's check) refuses an
  offer only when the versions compare equal **and** the buildIDs match, so a distinct buildID
  is an upgrade to the client.
- Evidence path: `.mozbuild/mar-hop/`, with `hop.json` at `served: "release"`.

## Release asset names

The generation rule, stated once: the versioned form is
`<app_basename>-<version>.<target-token>.<ext>` and the stable form is
`<app_basename>-<target-token>.<ext>`, where `<app_basename>` comes from
`configuration.toml`'s `[identity]`, `<version>` is the tag minus its leading `v`,
and `<target-token>` is the lowercase OS-and-arch token that target's build
observed. `mach package` writes a locale token into the name it produces on disk:
`powerbrowser-153.1.0.en-US.linux-x86_64.tar.xz` was observed at 08-04 and is
recorded in `docs/BUILD.md`'s install matrix. Whether the release asset keeps that
token or is renamed without it is recorded by stage
`linux-release-pipeline-and-update-channel`, and the filled table row is the answer.

| Target key | Versioned | Stable |
|---|---|---|
| `linux-x86_64` | pending stage `linux-release-pipeline-and-update-channel` | pending stage `linux-release-pipeline-and-update-channel` |
| Windows x86_64 | pending stage `windows-unsigned` | pending stage `windows-unsigned` |
| macOS universal | pending stage `macos-adhoc-signed` | pending stage `macos-adhoc-signed` |

Assets that carry no target token and are attached once per Release: `SHA256SUMS`,
`release-manifest.json`, `LICENSING.md`, `THIRD-PARTY-NOTICES.txt`, and the source tarball.
`release-manifest.json` is the build manifest under its stable name, published so
`descriptor-monotonic` and the full-tier `channel-live` row can read each Release's build values;
its `host` field names the build machine, which `release.yml` already names (owner decision
2026-10-31). `SHA256SUMS` hashes it with every other asset.

A descriptor's patch URL is the MAR origin plus `/<tag>/<asset>`,
`https://downloads.powerbrowser.org/<tag>/<asset>` (owner ruling 2026-10-29), the key
`sign-publish` wrote write-once. It is never a github.com `/releases/download/` URL, because
github.com is user-initiated and an unattended fetch from it fails the endpoint verdict, and
never a release-assets URL, because that signed URL expires about one hour after issue. The
live channel gate reddens on either form and on a latest-download URL.

### Partner search codes (UPD-15, recorded 46-04)

Stock partner machinery stays untouched: `ConfigSearchEngine` partnerCode,
`browser.partnerlink.*` prefs, no `distribution/` search config, no
`org.debios` string, no custom code, no search-host allowlist change. If a
live Suggest-traffic observation is wanted, it is Phase 50 criterion 5
alongside the asset hosts -- not a new row here.

---

## Maintenance

### Cadence

One release per ESR point release, roughly every two weeks, plus out-of-cycle security releases.
Each costs one rebase drill through `scripts/rebase-upstream.sh`
plus one build per target on `legion`. The wall times are the attributed rows from
`docs/BUILD.md`'s packaging-timings table and are not re-measured here: a fresh
release build is 54m40s, an N-plus-1 fresh build in a separate objdir is 54m, an
incremental rebuild after a mozconfig change is 33m44s, a MAR emit is about 2
minutes, and one check-to-apply update cycle is about 8 minutes. The current pin
is the `[upstreams].firefox_esr_tag` value in `configuration.toml`.

The drill is one command, `scripts/rebase-upstream.sh --tag <NEW_TAG> [--dry-run]`.
Its steps, the list of failures it names, and the operator follow-up
(`scripts/toolchain-baseline.sh`, whose output must diff empty against the committed
baseline) are owned by `docs/BUILD.md`'s rebase procedure section and are not
restated here. After a rebase, run the full gate rather than only `--quick`: the
patch stack, the byte-identity comparands and the installer schema all read the
rebased tree.

The dates are the ESR rows of `docs/RENEWALS.md`, each checked against the Mozilla ESR calendar before its train opens; the sweep's `renewals-due` row turns red 30 days before the nearest one. An out-of-band release for the same ESR goes out by bumping `revision` in `configuration.toml` (`v<ESR>-<revision>`), not by advancing the ESR pin.

When an npm advisory affects `theia/yarn.lock`, Dependabot opens a security-only PR; the owner merges security PRs within 7 days of opening, and a fix that cannot wait for the next ESR train ships as an out-of-band `revision` bump.

Sweep red thresholds (the sweep reads them from `.github/sweep-thresholds.json`, the one place the numbers live; this paragraph quotes that file and the release-train self-test fails if the two differ): `dependabot-prs` is red when more than 5 Dependabot PRs are open or any security PR is older than 7 days; `dependabot-alerts` and `codeql-alerts` are red when more than 0 are open; `codeql-push-age` warns when the last push to the default branch is older than 150 days, well before the ~6-month default-setup auto-disable.

### Out-of-band security path

The same pipeline, with the review shortened to the `release` environment's single
required reviewer, tagged as soon as the rebase drill is green. The liveness job
still runs last. Nothing is skipped: an out-of-band release that skipped the MAR
signature verify step would ship the exact failure mode the signing stage exists
to close.

The release-train logic (`scripts/release-train.mjs`) encodes two supersede rules, both for a scheduled train (revision 1) only:

- An open chemspill revision for the same ESR takes priority over a scheduled train, and the scheduled train is superseded.
- A newer validated ESR tag on the same major supersedes an older train that is still open or waiting on approval. A tag on another major, an equal or older tag, and a `_BUILDn` tag supersede nothing.

A chemspill revision train is never superseded, and neither is a train with a malformed key, no revision or no train at all, whatever the flags or the mark say. A published or withdrawn release is never superseded. SUPERSEDED is routine, so it never pages the owner.

The `state/SUPERSEDED` label on the tracking issue can keep a train superseded after the chemspill flag or the newer tag is gone, but only while all of this holds: the issue is the only one for the key authored by the owner or the bot with the tracking label; the label was applied by the owner or the bot; and the superseding train (the chemspill revision or the newer ESR key) is still open or published and is a valid, strictly newer key on the same major. The mark never outranks a red check or a patch conflict: those still page the owner. The mark clears when the owner removes the label, when the superseding train is closed without publishing, or when its key is no longer a verified newer key. When the superseding release is published, the old train's issue is closed with a note naming the superseder, and its `chore/esr-<tag>` pull request is left for the owner to close.

This is what the logic derives from facts, checked over fixtures. Nothing runs it live yet: no collector sets the supersede facts, and no executor rejects a pending `release` approval (see the 51-03 items in the phase BLOCKED.md). The only cancel target is a train waiting on the `release` approval: a running build is never cancelled by run id, because it may be past the approval and mid-publish, and a published Release is immutable. Until the executor exists, the stale-approval guards in `sign-publish` are what stop an old approval or a running build from publishing over a newer Release: they fail the run before anything is signed.

### Dependabot

`.github/dependabot.yml` opens one weekly pull request for the minor and patch updates of every workflow's actions, waits 7 days
(14 for a major) before adopting a new release, and offers npm security updates only (Renovate owns the Theia line). A major
action update arrives as its own pull request. `anthropics/claude-code-action` is ignored by Dependabot: its pin is exact in the
fixer-pin and triage pin rules, so the owner moves it by hand together with `scripts/verify-workflows.mjs` and
`scripts/verify-triage.mjs` and re-reviews its tool allowlist. Most of the bumped actions run only in the dispatch-only release
workflows, which no pull-request check exercises, so a merged actions bump is exercised by the next release, not by its own pull
request. The `workflows` row (rule `dependabot`) and the `zizmor` row keep this shape.

### Schedule posture

D-77 is kept. No workflow carries a `schedule` key. The update-channel liveness
check runs as `release.yml`'s final job rather than on a timer. A daily liveness
schedule remains an owner decision that has not been taken; if it is taken, it
reverses D-77 and both `rebase-upstream.yml` and this section change together.

The ESR 175 dates the cadence follows are nightly 2027-05-27, beta 2027-06-10 and release
2027-06-29; ESR 153 ends with 153.27 on 2027-09-07, so PowerBrowser ships on 175.x before
that date. The 153 point releases fall on 2026-11-10, 2026-11-24, 2026-12-08 and 2027-01-12.
The `docs/RENEWALS.md` ESR rows carry the same dates and are checked against the Mozilla
calendar before each train opens.

### Key rotation

PowerBrowser's updater trusts two keys, one per certificate slot: the primary signs
every release, and the offline secondary signs nothing until it is needed (see
[The MAR key ceremony and custody](#the-mar-key-ceremony-and-custody)). Installed
copies trust only the certificates their own updater was built with, so a new key
reaches users only through a release that the key they already trust has signed. The
row that proves the updater's trust is `ng065-mar-signature-enforced`: a fork-signed
MAR applies; unsigned and foreign-key MARs are refused with `CERT_VERIFY_ERROR`; a
wrong-channel MAR is refused with `MAR_CHANNEL_MISMATCH_ERROR`; and its fifth case, a
MAR signed by the secondary key only, must be accepted. The fifth case lands with the
tracked `mar-secondary.der`; until then the row runs the first four.

Runbook for replacing the primary key:

1. **New store.** Run the primary ceremony block into a new directory, never the live
   `mar-key/` one (the guard line refuses an existing store), with the two mandatory
   offline `.p12` copies, and record the date in the ceremony record. Next step: confirm
   both copies exist, then continue.
2. **Transition release.** Commit the new certificate as the primary slot's DER and
   regenerate patch `030` as in the ceremony section, so the transition build's updater
   embeds the new certificate. Sign that release with the **old** key: every installed
   copy still trusts only the old key and the secondary. Next step: open the `release`
   environment approval for the transition release.
3. **Descriptor gate.** `descriptor-monotonic` must be green on the transition
   release's descriptors: its buildID is strictly newer than every published buildID
   for the same version, so no client is offered an older build. Next step: run
   `scripts/verify-platform.sh --only descriptor-monotonic` and require PASS before
   publishing.
4. **Secret switch.** After the transition release is published, replace
   `MAR_SIGNING_P12_B64` and `MAR_SIGNING_P12_PASSWORD` with the new `.p12` and its
   password, using the procedure in [Secrets inventory](#secrets-inventory). Next step:
   cut the next release, the first one signed with the new key.
5. **Retire the old store.** Only after that next release has applied over the
   transition release (the N to N+1 hop that `mar-update-hop` drills) is the old key
   retired. Next step: run the hop drill, then retire the old store and its two
   offline media.

If the primary key is lost or compromised, the secondary key is the reason PowerBrowser
installs are not stranded: every build that embeds `mar-secondary.der` already trusts it,
so the transition release in step 2 is signed with the secondary key instead of the
old primary.

**Open: the signing job pins the primary key.** `release.yml`'s signing step names the
nickname `powerbrowser-mar`, and its verify step imports
`powerbrowser/packaging/mar/mar-primary.der`. Step 2 needs a run signed with a key whose
certificate is no longer that file (the old primary), and the secondary path needs the
nickname `powerbrowser-mar-secondary`. Neither run is possible until the workflow can
name the signing key and its certificate for one run; that change is not built. Next
step: plan that workflow change before the first rotation.

**Rollback is a separate path.** A deliberate downgrade is possible only through the
owner-dispatched `--rollback-to` flag on the withdraw and descriptor path, which Phase
49/50 owns; Phase 44 built only the refusal, `descriptor-monotonic`.

### Runner upkeep

The runner is `github-runner-powerbrowser-release.service` on `legion`, maintained
through `/etc/nixos/configuration.nix` and the `pkexec ... nrs` flow, never by
editing the unit. It is non-ephemeral: it keeps its registration and its work directory
`/var/lib/pb-runner` between jobs, so a stuck job is cleared by restarting the unit, and the
work directory is removed only while the unit is stopped. Keep disk headroom for the objdirs a
release build needs: `objdir/` peaks around 14 GB on top of the roughly 5.6 GB
`upstream/` checkout, and a Windows or macOS target adds its own objdir. `sccache`
is already configured in `.mozconfig` and in the `.#firefox` shell; stages
`windows-unsigned` runs its cross build in the release container, which carries the
same export, and `macos-adhoc-signed` adds `.#firefox-macos`, which inherits it.
`flake.nix` defines no `.#firefox-win64` shell. The `.#theia` shell carries none
and needs none. No second cache backend is added.

### Rebuilding legion

A rebuild of `legion` (reinstall, disk replacement or a new host) brings the runner back
without storing a credential for it. The release build keeps up to four objdirs on the runner,
about 14 GB each (about 56 GB), plus the roughly 5.6 GB `upstream/` checkout: the Linux release
objdir, the N-plus-1 objdir used for the update hop, and the Windows and macOS target objdirs.
Provision about 62 GB of free disk for them before registering.

1. Restore `/etc/nixos` from its git remote and apply it with the `pkexec ... nrs` flow. The
   `services.github-runners` block is declarative, so the runner user `pb-runner`, the work
   directory `/var/lib/pb-runner` and the pre-job hook come back with it.
2. Create `/var/lib/secrets/github-runner-registration` from a fresh registration token (see
   "Runner registration through the `/etc/nixos` flow"). Old tokens are expired and a
   rebuilt host is a new registration; remove the stale runner entry from the repository's
   runner list first.
3. Fetch `upstream/` with `scripts/fetch-upstream.sh` and run `nix develop .#firefox` once, so
   the toolchain and `sccache` warm up. The four objdirs are build output and are not
   restored; the first build of each is a full build (about 54 minutes for Linux).
4. Confirm the runner shows online with its registered runner label (the one `release.yml`'s
   `build-linux` job selects), that no PAT and no
   App key exists on the host, and that the pre-job hook refuses a run that is not a
   `workflow_dispatch` of `main`. The MAR key store at `~/.config/powerbrowser-release/mar-key/`
   belongs to the owner's account, not the runner's, and a rebuild restores it only from the
   offline `.p12` backup.

The sweep's `runner-online` row watches the runner. The `descriptor` environment's
1440-minute wait is a wait timer, not a queued job, so a runner outage never shows there;
watch `runner-online` for it.

### Cloudflare upkeep

Two Pages projects, one Worker, one D1 database, two R2 buckets (the MAR bucket, the
primary MAR origin on its custom domain `downloads.powerbrowser.org` with write-once
`<tag>/<asset>` keys, next to the bucket reserved for the gated crash sub-plan), and the DNS
records for `updates.powerbrowser.org`, `downloads.powerbrowser.org`, the events hostname and
the site. The one contract that must not drift is the `_redirects` rule
(or the `_worker.js` that replaced it) mapping the baked eleven-segment update path
onto `<channel>/<BUILD_TARGET>/update.xml`: every installed client depends on it, and
the baked path cannot be changed for builds already in users' hands. The Pages
25 MiB file cap is what keeps MAR bytes in the R2 bucket rather than on Pages; R2 storage and
the per-release artifact size are measured, not assumed (`docs/BUILD.md`, INF-04).

#### The scheduler clock (INF-03)

The release train wakes from one external clock: the `powerbrowser-scheduler` Worker.
Its source lives in its **own repository** (public, created empty by the owner), never in
this tree; this tree holds the dispatch contract it calls (below) and the scaffold
reference at the end of this section. It is a second Worker, separate from the events
Worker above, and runs on `workers.dev` first, so it does not wait for the DNS move.
Its Cloudflare account is the free one.

The Worker is a clock only. One cron trigger, `17 * * * *` (hourly, UTC, off the
top of the hour), runs `scheduled()`, which does exactly four things:

1. mints an RS256 JWT for the `powerbrowser-clock` App (Actions write and metadata read,
   installed on `powerbrowser` only, `.github/settings/app-powerbrowser-clock.json`) from
   the App private key, which the Worker holds as a secret in **PKCS#8** form (WebCrypto
   imports PKCS#8 only; GitHub issues PKCS#1, so convert once with
   `openssl pkcs8 -topk8 -nocrypt -in <downloaded>.pem -out clock-pkcs8.pem`, store the
   result as the secret, and shred the download);
2. exchanges the JWT for an installation token narrowed to the `powerbrowser` repository
   and `actions: write`;
3. sends one `workflow_dispatch` of `release-train.yml` on `main` with the input
   `reason=tick` and the request field `return_run_details: true`, so the response names
   the run it started;
4. on any non-success status from steps 1 to 3, mails the owner through Email Routing.

Every request carries `User-Agent: powerbrowser-scheduler` (GitHub rejects a request with
none). The Worker has **no** detection logic, no liveness check, no pin-age test and no
descriptor knowledge: whether anything is new is decided inside the train from
GitHub facts, so a wrong clock can only wake the train too often or not at all, and a
dispatch is idempotent. The dead-man watchdog that notices a silent clock is Phase 48
work; its absence from this section is recorded scope, not a gap. D-77 stands: no
workflow carries a `schedule` key, and this Worker is the schedule.

**Worker scaffold reference.** This is own-repo content, copied out of this tree when the
owner creates the repository; it is a reference, not a deployed file, and it has not been
run. Check the `send_email` binding and the `return_run_details` response status against
the live APIs at deploy time.

```ts
// powerbrowser-scheduler, src/index.ts (own repository). Clock only: no detection.
import { githubAppJwt } from 'universal-github-app-jwt'; // 2.2.2, WebCrypto
import { EmailMessage } from 'cloudflare:email';

interface Env {
  CLOCK_APP_ID: string; CLOCK_PRIVATE_KEY: string; // the key is a PKCS#8 secret
  REPO_OWNER: string; REPO_NAME: string;           // vars: the org and `powerbrowser`
  MAIL: { send(m: EmailMessage): Promise<void> };  // send_email binding
  ALERT_FROM: string; ALERT_TO: string;
}
const API = 'https://api.github.com';
const hdr = (t: string) => ({
  authorization: `Bearer ${t}`, accept: 'application/vnd.github+json',
  'x-github-api-version': '2022-11-28', 'user-agent': 'powerbrowser-scheduler',
});

async function dispatchTick(env: Env): Promise<void> {
  const { token: jwt } = await githubAppJwt({ id: env.CLOCK_APP_ID, privateKey: env.CLOCK_PRIVATE_KEY });
  const repo = `${API}/repos/${env.REPO_OWNER}/${env.REPO_NAME}`;
  const inst = await fetch(`${repo}/installation`, { headers: hdr(jwt) });
  if (!inst.ok) throw new Error(`installation lookup ${inst.status}`);
  const { id } = (await inst.json()) as { id: number };
  const tok = await fetch(`${API}/app/installations/${id}/access_tokens`, {
    method: 'POST', headers: hdr(jwt),
    body: JSON.stringify({ repositories: [env.REPO_NAME], permissions: { actions: 'write' } }),
  });
  if (!tok.ok) throw new Error(`installation token ${tok.status}`);
  const { token } = (await tok.json()) as { token: string };
  const res = await fetch(`${repo}/actions/workflows/release-train.yml/dispatches`, {
    method: 'POST', headers: hdr(token),
    body: JSON.stringify({ ref: 'main', inputs: { reason: 'tick' }, return_run_details: true }),
  });
  if (res.status !== 200 && res.status !== 204) throw new Error(`dispatch ${res.status}`);
}

export default {
  async scheduled(_e: ScheduledController, env: Env): Promise<void> {
    try { await dispatchTick(env); } catch (err) {
      const raw = `From: ${env.ALERT_FROM}\r\nTo: ${env.ALERT_TO}\r\nSubject: PowerBrowser clock tick failed\r\n\r\n${String(err)}\r\n`;
      await env.MAIL.send(new EmailMessage(env.ALERT_FROM, env.ALERT_TO, raw));
    }
  },
};
```

The mail carries the failing step and status only. It never carries a token, the JWT or
the key, and it fires only on a failed dispatch.

**Scheduler `wrangler.toml` reference.** The deploy descriptor for the same repository, at
its root beside `src/index.ts`. Like the scaffold it is copied out of this tree and has not
been deployed. It states no secret: the App key is the Worker secret `CLOCK_PRIVATE_KEY`.
Replace each `REPLACE-WITH-…` value before the first deploy. The mail leg is wired here and
proven at the 47-04 checkpoint, after Email Routing exists on `powerbrowser.org`: a
`send_email` binding can only send to a verified Email Routing destination address, and
`ALERT_FROM` must be an address on that zone.

```toml
# powerbrowser-scheduler, wrangler.toml (own repository). Clock only: one cron, one mail binding.
name = "powerbrowser-scheduler"
main = "src/index.ts"
# Fixed past date, the same floor as worker/wrangler.toml: the Worker uses fetch, crypto.subtle
# and the send_email binding only, none of which changes with the compatibility date.
compatibility_date = "2025-01-01"

# The Phase 43 clock runs on workers.dev, before the DNS move. It has no fetch handler, so the
# workers.dev URL answers nothing useful; the cron below is its only entry point.
workers_dev = true
preview_urls = false

# Hourly, UTC, at minute 17 (off the top of the hour). D-77: this is the train's only schedule.
[triggers]
crons = ["17 * * * *"]

# env.MAIL in src/index.ts. destination_address limits the binding to the owner mailbox.
[[send_email]]
name = "MAIL"
destination_address = "REPLACE-WITH-OWNER-MAILBOX"

[vars]
CLOCK_APP_ID = "REPLACE-WITH-CLOCK-APP-ID"   # the numeric App ID of powerbrowser-clock; not a secret
REPO_OWNER = "REPLACE-WITH-ORG"           # the owner in configuration.toml [urls] release_notes
REPO_NAME = "powerbrowser"
ALERT_FROM = "REPLACE-WITH-SENDER-ON-POWERBROWSER-ORG"
ALERT_TO = "REPLACE-WITH-OWNER-MAILBOX"       # the same address as destination_address
```

Owner commands, from the scheduler repository root (43-05 Task 2 steps 4 and 5; Claude runs
none of them):

```sh
npm install universal-github-app-jwt@2.2.2
nix run nixpkgs#wrangler -- --version
nix run nixpkgs#wrangler -- secret put CLOCK_PRIVATE_KEY < clock-pkcs8.pem
shred -u clock-pkcs8.pem REPLACE-WITH-DOWNLOADED-KEY.pem
nix run nixpkgs#wrangler -- deploy
```

#### JWT-mint CPU measurement (INF-03)

The Workers Free plan limits CPU time to **10 ms** per invocation, and the one
CPU-bound step in the clock is the RS256 signature. The library is
`universal-github-app-jwt` **2.2.2** over WebCrypto (`crypto.subtle`, no Node
polyfill), key form PKCS#8.

JWT-mint CPU: pending owner tick measurement (recorded 2026-10-31; no deployed Worker
exists yet, so no number exists and none is estimated here).

The owner follows this procedure after the first deploy, and the executor follows it
afterwards to fill this record:

1. Deploy the Worker with the real key. Let it tick for at least 24 hours (24 values).
2. Read each invocation's CPU time from the Worker's own metrics: the dashboard CPU-time
   statistic gives a cross-check quantile, and the per-invocation `cpuTime` of each trace
   event gives the values to compute the median and p95 from. Time spent waiting on
   GitHub is not CPU time, but the 10 ms limit applies to the whole invocation, so the
   figure that decides is the whole invocation, not the mint alone.
3. Record here: library and version, key form, the median and p95 in milliseconds, the
   date, and the verdict.
4. Verdict rule: p95 at or under 10 ms keeps the Free plan. Over it, take the fallback:
   Workers Paid (a flat monthly fee, a higher CPU limit), or drop the Worker and
   dispatch the train from the Phase 48 watchdog instead. The pending line above is
   replaced by a dated line, never edited toward a flattering number.

### ESR train change

Roughly every twelve months the ESR train changes. That is a major rebase, not a
point release: the whole patch stack is re-proven, `toolchain-baseline.sh` is
expected to differ and the diff is reviewed rather than accepted, every generated
comparand is regenerated and its byte diff read, and the full gate runs including
the tier-3 rows. Budget more than one build.

Dependency re-pins follow the same rule at a smaller scale. `theia/yarn.lock` is
committed and every install reproduces the same tree; a Theia version move is a
deliberate re-pin, never an incidental bump, and it must not become an edit to Theia
core (`scripts/diff-theia-core.sh` is the check). The Node runtime shipped inside
the package is pinned by version and sha256 per target in
`powerbrowser/packaging/node-runtime.json`; changing it is a re-release, not an edit,
and the new sha256 comes from a `gpgv`-verified `SHASUMS256.txt` checked in the release train's detect-node job. Flake input moves are
covered under **Toolchain pins** above.

Listing state lives in the Listings table that stage `listings-and-cadence` adds, and
every deferral lives in the single `## Deferred signing items` register above. Do not
add a second table for either.

### ESR 175 uptake (UPS-01, TRAIN-05)

The train tracks two ESR majors at the same time. The pinned major (153) keeps the bump
path: a newer 153.x tag opens `chore/esr-<tag>`, and the report job writes its tracking issue
(plan 43-06). The
uptake major (175, `UPTAKE_MAJOR` in `scripts/detect-upstreams.mjs`) is replay-only: the
newest 175 `*esr_RELEASE` tag is replayed and nothing is published from it. The lane keys on
those release tags, which are cut on the ESR release day (2027-06-29), so as built the lane
starts then, not at the 175 beta (2027-06-10). Whether it should start at the beta needs a
beta-stage tag form, which is an owner decision (`BLOCKED.md` item 3 of Phase 58). The lane is
off once the pinned major reaches the uptake major, so the flipped pin is never replayed twice.

**Two keys.** Each release key names one tracking issue: `release-train: v153.x-r` for the bump
line and `release-train: v175.x-r` for the uptake line. The title is derived from the tag and
the would-write view prints it. No writer exists yet. The live find-by-label-and-title step, the
exactly-one rule and the rewrite-only-when-different rule are unwired until the owner approves
the writer (`BLOCKED.md` item 1). Until then the report job writes no issue. A 153 tag never
reaches the 175 replay, and a 175 tag never reaches the 153 bump: the guard refuses the
foreign major in both lanes, and both self-tests plant that fault and require it to go
red.

**Replay-only procedure** (the `uptake-replay` job in `release-train.yml`):

1. The detect job lists the 175 tags with the 153 tags and names the newest one.
2. `uptake-replay` calls `rebase-upstream.yml`, the one replay definition. It fetches the
   tag into a runner-local `upstream/`, then runs `apply-patches.sh`,
   `check-patch-surface.sh`, `regenerate-patches.sh --check`, the brand scan and the
   classifier.
3. A PASS is `UPTAKE_REPLAYED`. A `NOTE` line counts patches that replay onto moved files
   and is informational. Nothing is committed.
4. A patch that does not apply is `UPTAKE_CONFLICT`. Its would-write view names the patch
   (`ESR <tag>: patch <NNN> did not apply`) and prints the FAIL stage line as its apply log.
   The upstream diff is not carried yet: the view passes an empty diff. No issue is written
   and no owner is assigned until the writer is approved (`BLOCKED.md` item 1). Any other
   replay FAIL is `UPTAKE_RED`, with the action wait-owner. A replay job that ends with any
   result other than success is red in the report, whatever stage line it printed.
5. Patches are changed only by `regenerate-patches.sh`, never by hand. Routing a fixable
   conflict to fixer F1 or F2 on a `chore/esr-175*` branch is a ship step (plan 58-03), and
   no such branch exists until the owner approves the 175 conflict writer.

The uptake lane has no commit, push, PR, dispatch, environment or App token. The
`uptake-lane` rule in `scripts/verify-workflows.mjs` holds the job to read-only scope and
to the one replay definition. A dry run runs the same replay and prints the would-write
view.

**Naming.** Bump branches are `chore/esr-<tag>`, so the 153 and 175 branches never share a
name. The release key comes from the tag (`v<ESR>-<revision>`), so the two lines cannot
collide in a title either.

**Calendar** (CONTEXT A-58-4). Nightly 2027-05-27. Beta 2027-06-10: no replay runs, because
the lane lists only `*esr_RELEASE` tags and the beta does not cut one (see the opening of this
subsection). Release 2027-06-29: `175.0esr` is published, and its `*esr_RELEASE` tag starts the
first replay-only run. ESR 153 ends with
153.27 on 2027-09-07. The ship checklist for 175.x is in plan 58-03, which is an owner
checkpoint.

**`FIREFOX_ESR` is advisory after the flip.** From 2027-06-29 product-details reports
`175.0esr` as `FIREFOX_ESR`. The 153 line does not read it. Its candidate comes from the
153 tag list, and the Phase 43 regression fixture (`FIREFOX_ESR=175.0esr` with
the 153.23.0 ESR release tag present dispatches 153.23) stays in the detector self-test.
The train never depends on an undocumented `FIREFOX_ESR153` key.

### Rebase onto 175 (UPS-01)

The rebase moves the four hook-only patches from the pinned ESR onto the 175 tag by
regeneration only. A hunk body is never edited by hand: a hand-edited hunk replays as a
silent no-op (CLAUDE.md; Pitfall 2 of the Phase 58 research). A patch that does not replay
is a conflict to report, not an edit to make.

**Scratch tree, never the live one.** The 175 replay runs on a runner-local upstream
(`rebase-upstream.sh --tag <175 tag>` in the uptake lane). Locally, the same steps run on a
scratch clone at the pinned commit, and `upstream/` is not touched:

```sh
git clone --no-checkout --shared <repo>/upstream <scratch>/upstream
git -C <scratch>/upstream checkout -q <175 tag>
scripts/apply-patches.sh --upstream <scratch>/upstream
scripts/regenerate-patches.sh --check --upstream <scratch>/upstream
scripts/check-patch-surface.sh
node scripts/scan-brand-residue.mjs --extra-root <scratch>/upstream
scripts/verify-platform.sh --quick
```

Every step must exit 0. `apply-patches.sh` takes `--upstream` and `--patches` for the scratch
tree; with no argument it replays onto the live `upstream/`, as `rebase-upstream.sh` does. Both
values are resolved to absolute paths before anything changes directory, and a relative value is
accepted. The script refuses with exit 2 and a named cause when a path is not a directory, when a
value starts with `-`, when `--upstream` is not the top of its own git repository or is this
checkout, and when `--patches` holds no `*.patch` file.

**Drift-risk order and the invariant each patch must keep.** Replay and check the patches in
this order, highest drift first. After each replay, confirm the invariant line is still in
the patch's `+` lines.

1. `030-powerbrowser-mar-certificates` (`toolkit/mozapps/update/updater/moz.build`, highest
   drift). Invariant: the fork certificate fills both slots on every channel
   (`primary_cert.inputs` and `secondary_cert.inputs` both name `mar-primary.der`).
2. `040-powerbrowser-nsis` (`browser/installer/windows/nsis/defines.nsi.in` and
   `installer.nsi`, high drift). Invariants: `AppName` is `@MOZ_APP_NAME@`,
   `CERTIFICATE_NAME` is `${CompanyName}`, `TELEMETRY_BASE_URL` is empty, and the installer
   ping returns early. The issuer string (`DigiCert ... 2021 CA1`) is the drift to expect.
3. `010-powerbrowser-identity` (`browser/moz.configure`, medium drift). Invariant:
   `include("../identity.configure")` is the one hook line.
4. `020-powerbrowser-shell` (`browser/moz.build`, lowest drift). Invariant: the one `DIRS`
   entry for `../powerbrowser/shell`. It fails only if the `DIRS` block is restructured.
5. `055-powerbrowser-crash-ping-consent` (`toolkit/crashreporter/client/app/src/glean.rs`,
   drift not yet measured; added in Phase 57). Invariant: `determine_telemetry_enabled` carries
   no `true` literal, so every absent or unreadable consent input returns `false`. The
   `crash-ping-consent` row checks it on the replayed tree.

**NOTE and FAIL** (`regenerate-patches.sh --check`):

- NOTE with PASS: a moved file whose `+` and `-` lines still match. Regenerate the patch in
  write mode on the scratch tree, check it again byte for byte, and commit it with the pin
  bump. The NOTE names the file.
- FAIL: `did not apply`, `added/removed lines differ`, `dropped <path>`, or an empty
  regeneration. Stop. Do not edit the patch. Record one conflict issue (until the writer is approved, only the would-write view prints it and nothing is written),
  `ESR <tag>: patch <NNN> did not apply`, with the patch name, the tags, the files, the
  verbatim apply log, the pre-image and replayed blob hashes, the moved-file list and the
  surface result. Route fixable classes (F1 patch-replay conflict, F2 red bump PR) to the
  fixer on a `chore/esr-175*` branch (A-58-3, Phase 52). A branch like that does not exist
  until the owner approves the 175 conflict writer (`BLOCKED.md` item 1).

**Toolchain re-record** (D-73 tuple: tree, host, toolchain and date). `toolchain-baseline.txt`
is re-recorded once, against the 175 release container that `build-linux` actually uses. Run
`scripts/toolchain-baseline.sh --container` inside that container after its bootstrap build.
Copy each measured line into the file. Never type a value, and never leave an `UNMEASURED`
line in a committed file. Do not reuse the 153 baseline for a 175 build. The file is
deny-listed for the fixer (FIX-11). Record the tree (`git rev-parse HEAD`), the host, the
container image and the date beside the new baseline.

---

## Support operations

How the project is supported once it is public: who reads what, what is automated, and which rules are never skipped. The workflow facts below are derived from `.github/workflows/` and the settings bodies under `.github/settings/` by the quick row `releasing-support-ops` (`scripts/verify-releasing-support-ops.mjs`), which compares them with this section as set equality, so a renamed job, a removed trigger or a deleted template id turns it red. The repository is the one `urls.release_notes` names in `configuration.toml`.

The workflows this section describes, one line each. A reader who changes one of these lines changes the workflow in the same pull request:

- `triage.yml` trigger `issues.opened`; job ids `classify`, `apply`; environment `triage`; model `claude-haiku-5-5`; template ids `bug-report`, `feature-request`, `other`.
- `notify-drill.yml` trigger `workflow_dispatch`; job ids `pending-deployment`; environment `release`.

### Issue triage

`triage.yml` runs once for every opened issue. Its two jobs split the trust. The `classify` job reads the title and body as fenced data and holds the model, with a token that can only read; it returns a label list and a template id as structured output and nothing else. The `apply` job holds the one write permission, runs no model, keeps only labels that are in `.github/settings/labels.json` under the type, os, format and area families, and posts one fixed comment chosen by template id. If `classify` fails, `apply` does not run and the issue gets no comment.

- Triage never closes an issue, never edits an issue body, and never posts text the model wrote. An issue whose text carries instructions (publish this, apply that label, mark this resolved) receives only the fixed comment for its template id.
- Triage runs in the `triage` environment, whose branch policy admits `main` only and which holds the Anthropic key. The model is set in the workflow's `claude_args`. The debug posture is the one the fixer follows: full output off, no secret echoed, and no `ACTIONS_STEP_DEBUG` anywhere in the repository. The `workflows` row keeps that shape.
- Triage spend runs in its own Anthropic Console workspace with its own monthly limit, separate from the fixer workspace. The owner records the limit and the authentication outcome in the record below.
- A maintainer still reads every new issue. The fixed comment says so. Labels are a first sort, not a decision: change a wrong label by hand, and add `needs-info` when the report lacks what the bug form asks for.
- The re-runnable phone drill is `notify-drill.yml`: dispatch it from `main` on the second account, and reject the pending deployment from the phone.

### Discussions moderation

Discussions is the place for questions and general talk; the issue forms send support questions there.

- Discussions: `enabled`
- Discussions moderation rule: a maintainer reads every new Discussion, answers it or points to the right place, and moves a defect report to the bug form. A suspected vulnerability posted in a Discussion is hidden at once, and its author is asked to use private reporting.

### Private vulnerability reports

Private vulnerability reporting is the first route and `security@powerbrowser.org` is the second; both are named in `SECURITY.md`, which owns the policy text. Both routes must reach the owner as GitHub Mobile and phone notifications inside the acknowledgement window, which `SECURITY.md` states as:

> We acknowledge your report within 5 business days.

- Private vulnerability reporting: `enabled`
- The proof is one private-report-equivalent filed from the second account and one test message to the security mailbox, each received on the owner phone inside the window. The received times go in the record below. A push that did not arrive, or arrived late, is a defect to fix before the support path is called live.
- Triage a report in the Security tab, not in a public issue. Move nothing from a private report into a public issue until a fix has shipped.

### CodeQL alerts after each rebase

Code scanning runs as GitHub's default setup.

- Default setup state: `configured`
- Default setup languages: `actions`, `javascript-typescript`
- CodeQL rule: after each rebase onto a new ESR tag, open the Code scanning alerts in the Security tab and triage every alert that rebase introduced before the release tag is cut. A rebase that touches only `upstream/` introduces none for the scanned languages, so a new alert after one points at the patch stack or the Theia side.

### Fork pull request approval

- Approval policy: `all_external_contributors`
- Fork approval rule: no fork pull request workflow run is approved without reading its diff. Open the diff on the pull request, read every changed workflow, script and lockfile, and only then use the Approve and run button.

### Support operations owner record

The owner fills these at the support-operations checkpoint; each stays TODO until then, and the live rows (`repo-controls`, `codeberg-mirror-live`, `upptime-sweep-live`) are the proof.

- Triage workspace name and monthly limit: TODO
- Authentication outcome, OIDC or static key, and where the credential lives: TODO
- Status repository, template head and Pages address: TODO
- Codeberg mirror repository, token holder and timer apply date: TODO
- Phone proofs, received times for the private report and the security mailbox: TODO

---

## Verification map

One driver, `scripts/verify-platform.sh`, one registry. Most rows below are one
appended registry row plus its self-test row; the two marked (widened) extend a row
that already exists and add none. No sibling driver is created, and no row asserts
on the absence of a log line.

| Row | Stage | Proves | Self-test plants |
|---|---|---|---|
| `repo-controls` | 1 | Live GitHub state matches every tracked body under `.github/settings/` by derivation | Network-free self-test over fixture bodies |
| `release-identity` | 2 | Tag, version files and any committed descriptor cannot disagree | Display version off by one revision; a different ESR in `version.txt`; HEAD tagged one revision above the derivation; a prior release tag above the derivation on an older commit; plus a prior tag equal to the derivation and a higher tag on a commit HEAD does not contain, both of which must stay green; a tracked `update.xml` with a differing appVersion; plus an untagged-HEAD case that must stay green and print its skip line by name |
| `mar-sign-self-test` | 3 | MARs are signed with the signing command in `docs/BUILD.md` "Key-custody rung" and verified with the tree's own `signmar` against the tracked certificate imported into a scratch NSS database (`signmar -d <db> -n powerbrowser-mar -v`), and each planted fault goes red naming the file. The live signing evidence rides on the existing `mar-update-hop` row rather than on a second full row, and the updater's either-slot acceptance, including the secondary-only plant, is proven by `ng065-mar-signature-enforced` | Verify the unsigned MAR; verify a foreign-key MAR against the fork certificate; sign an already-signed MAR; sign with a nickname absent from the database |
| `build-update-xml-self-test` | 3 | One descriptor per BUILD_TARGET emitted from `application.ini` and the MAR bytes, byte-identical on re-emission, carrying `detailsURL`, over synthetic fixtures | An unknown target token; an `application.ini` with no BuildID; a `TARGET_XPCOM_ABI` disagreeing with the table; `--channel` given the MAR channel id while the fixture `config.status` carries the update channel |
| `build-update-xml` | 3 | Full tier: every BUILD_TARGET descriptor emitted twice from `objdir/` (`application.ini`, `config.status`) and the N+1 MAR is byte-identical and parses back to its inputs, and with `--outdir` each descriptor already on disk equals a fresh emission. A missing input is a FAIL naming it (today `.mozbuild/mar-hop/nplus1.mar`), never a SKIP | The four plants of `build-update-xml-self-test` |
| `descriptor-monotonic` | 5 | Full tier: every candidate descriptor under `.mozbuild/update-descriptors/` (or `--descriptors`) offers a buildID strictly greater than every buildID the non-draft Releases publish, through each Release's `release-manifest.json`, for the same appVersion and BUILD_TARGET. Zero published Releases is a PASS with a named count; zero candidates under the default tree is a named SKIP; an unreadable endpoint or manifest is a FAIL naming it, never a SKIP | Plants in `descriptor-monotonic-self-test` |
| `descriptor-monotonic-self-test` | 5 | The same rule over in-memory fixtures built with the shared descriptor emitter, with no network and no write; a green control first | A same-version older buildID; a same-version equal buildID; the candidate's own Release published with a different `build_id` or `build_target`; a malformed or missing `release-manifest.json`; a `build_id` that is not fourteen digits, not a real date, or later than now plus one day; a regression against a Release on the second page; malformed Releases pages; a failing `gh`; an unparseable or unreadable candidate; an explicit `--descriptors` tree that is empty or absent. Zero published Releases, and an older appVersion with a newer buildID, stay green |
| `ng065-mar-signature-enforced` | 3 | Full tier: the packaged tree's own updater applies a fork-signed full MAR, refuses an unsigned and a throwaway-key MAR with `CERT_VERIFY_ERROR` and a fork-signed MAR for another channel with `MAR_CHANNEL_MISMATCH_ERROR` (codes read from upstream at check time), and accepts a MAR signed by the secondary key only, `powerbrowser-mar-secondary` from the store named by `PB_MAR_SECONDARY_DB`. The secondary-only case lands with the tracked `mar-secondary.der`; until then the row runs the first four | No separate self-test: the four refusal cases and the secondary-only acceptance case are the plants |
| `packaged-launch` | 4 | An extracted package launches on a fresh profile and reaches the Theia shell with both product markers, resolving in-prefix | Remove the staged backend |
| `packaged-identity` | 4 | `application.ini` and the staged Theia `package.json` carry release-variant identity | A dev suffix in the staged notice |
| `install-matrix-linux` | 4 | Install, launch, coexistence and no-residue over paths derived from the packaged `application.ini` | Driver self-test |
| `update-ready-layer` | 4 | The shell offers a working restart affordance, gated on the probe verdict about whether the stock prompt can render at all | Layer self-test |
| `release-workflow` | 5 | Triggers, SHA pins, actions-policy admissibility, per-job permissions and the derived asset set | An unpinned action; an added `pull_request` trigger; `id-token: write` moved onto the legion job; a secret reference in the legion job; a dropped asset name; a third-party action absent from `patterns_allowed`; a verify invocation removed from between sign and upload; a renamed signing secret |
| `channel-live` | 5 | The live channel agrees with the published Release, all derived from the build's manifest and the tree; the patch URL is the MAR origin at `/<tag>/<asset>` | A wrong `hashValue`; a missing target descriptor; a 404 MAR URL; a size mismatch; a github.com, release-assets or other-host patch URL; a manifest `mar_origin` off the tree |
| `toolchain-container` | 5 | The release build refuses container toolchain drift from `toolchain-baseline.txt` before packaging; the baseline's image pins equal the Containerfile's | A drifted rustc line; a drifted image digest; a pinned build date |
| `installer-schema` (widened) | 6 | The staged NSIS sources carry fork defines and no Mozilla literal | Existing self-test widened |
| `installer-build-proof` (widened) | 6 | The staged preprocessed `.nsi` sources contain no Mozilla telemetry host and no survey host, and still compile | Planted deny host in the staged tree |
| `win-matrix-record` | 6 | Every schema cell (`scripts/matrix/win-matrix-schema.json`, shared with the writer) is PASS with verbatim evidence, or carries an explicit owner-approved deferral; the BUILD_TARGET parses from the installed `application.ini`; the registry diff names the expected namespace root (derived from patch 040) and nothing survives the uninstall; the SmartScreen text was observed on the guest; the version changed; the maintenance service was observed disabled | An all-FAIL record; a missing cell; a bare RED with no cause; an empty BUILD_TARGET; the wrong registry root; a SmartScreen text the guest never observed |
| `win-download-copy` | 6 | The verbatim SmartScreen block is identical across the matrix record, the tracked document and the live download page | A reworded label |
| `macos-toolchain-verdict` | 7 | The probe record's routing verdicts exist and are current | Record self-test |
| `macos-branding-inputs` | 7 | Every branding file the cocoa package path consumes exists in both variants, derived from **both** upstream consumers | A deleted `document.icns`, `Assets.car`, `dsstore` or `disk.icns`; a corrupted icns length field; an added copy line in a mirrored `Makefile.in`; an added join filename in a mirrored `moz.configure` |
| `macos-package-payload` | 7 | Universal slices, one shared build ID, an ad-hoc signature with no notarization, the staged sidecar, the MAR and both descriptors | Payload self-test |
| `macos-download-copy` | 7 | The download copy carries no internal identifier and states both unsigned consequences | Copy self-test |
| `macos-install-matrix` | 7 | Every Mac cell carries a verdict plus evidence, and the observed Darwin BUILD_TARGET strings equal the emitted descriptor set both ways | A missing cell; a verdict with no evidence; a build target no descriptor covers; a descriptor no observation covers |
| `bug-report-affordance` | 8 | The prefill parameters are a subset of the issue template's field ids, and the built URL's origin and path agree with the manifest key | Prefill self-test |
| `events-worker` | 8 | The Worker rejects oversized, malformed and wrongly shaped submissions before writing, and holds no secret | Contract self-test |
| `tel06-error-delivery-live` | 8 | One real POST from a running sidecar reaches a loopback endpoint, which the earlier drill never observed | Analyzer self-test |
| `listing-manifests` | 9 | App id, licence form, desktop and icon agreement, the updater-disable split, token presence and the winget identifier, all derived | Listing self-test |
| `releasing-maintenance` | 9 | This document's maintenance section agrees with the automation by derivation | A schedule key planted into a fixture workflow; a documented trigger removed; a job id removed from the doc; the fixture job order changed so the documented liveness job is no longer last; a DER basename removed; a listing row removed; a deferred row stripped of its pointer; a row removed from `## Deferred signing items`; one of the seven original consequences deleted; a sibling deferrals table added; a required command removed |
| `releasing-support-ops` | 9 | This document's support-operations section agrees with the workflows and settings bodies by derivation: every trigger, job id, environment, model and template id, the private-reporting and Discussions flags, the code-scanning setup, the fork approval policy and the `SECURITY.md` acknowledgement window | A trigger removed; a job id renamed; a template id deleted or added; a workflow the section names that does not exist; a missing window sentence, moderation rule, CodeQL rule or fork approval rule; a private-reporting flag turned off; an absent `SECURITY.md` |

Two rules govern every row above and are worth restating because both were earned by
shipping the mistake first. Never assert on the absence of a log line unless the line
is proven to come from the code under test. Derive the expectation from the tree at
check time and compare as set equality, so the row goes red on an addition as well as
on a removal.

---

## Troubleshooting

**SmartScreen blocks the Windows installer.** Expected. There is no Authenticode
certificate. The user path is More info then Run anyway, and that exact wording is
on the download page. If the wording on the page and the wording in
`docs/WINDOWS-DISTRIBUTION.md` differ, `win-download-copy` is red and the page is
what changed; recopy the tracked block rather than editing the document.

**Gatekeeper refuses the macOS bundle.** Expected. There is no Developer ID and no
notarization. The user path is System Settings, Privacy and Security, Open Anyway.
If the application refuses to launch at all on Apple Silicon rather than showing the
Gatekeeper dialog, the ad-hoc signature is missing or was stripped in transit;
`macos-package-payload` asserts its presence on the built bundle, so compare the
DMG's SHA256 against the build host before blaming the signature.

**macOS self-update does nothing from `/Applications`.** Expected. The elevated
update helper is pinned to Team ID `43AQ936H96` and the build is not signed by that
team, so a privileged update cannot run. Self-update works from a user-writable
install location. This is recorded on the download page and observed in the Mac
session.

**A Windows admin install updates as `LocalSystem`.** It must not, and it cannot:
`--disable-maintenance-service` is in the emitted Windows mozconfig. If the built
`config.status` shows the service enabled, the mozconfig emitter regressed. Do not
work around it in the installer.

**A Windows update fails with a locked file.** The updater renames files a live
sidecar `node.exe` may hold. Quit and restart both register the AsyncShutdown blocker
`PowerBrowser: reap sidecar` (`addSidecarReapBlocker` in `powerbrowser/shell/PowerBrowserAPI.sys.mjs`),
which awaits `TheiaService.stopAndReap`. The reap waits on the sidecar's Subprocess handle
(`PowerBrowserAPI.waitForExit`, the same on every platform) for `powerbrowser.sidecar.killGraceMs`
(default 3000 ms, the same default `stop()` uses) plus 500 ms. On timeout the log names the live pid and shutdown continues.
A leftover sidecar from a crashed Windows launch is not reaped at the next start (`signalBarePid` is Linux-only; `BLOCKED.md` item 9).
A pid that survives the timeout is a defect to report, not a case to retry by hand.

**The background update task (UPD-31) is verified or deferred, never silently enabled.** The
`windows-unsigned` matrix records it per install: verified (task entry, `backgroundupdate.moz_log`, and a
staged apply while the app is closed) or deferred with the exact BackgroundUpdate REASON value
(`APPBASEDIR_NOT_WRITABLE`, `SERVICE_REGISTRY_KEY_MISSING`, or `NO_APP_UPDATE_BACKGROUND_ENABLED`) and the
scheduler error. A deferral never enables the maintenance service.

**A client resolves `aus5.mozilla.org`.** The baked `[AppUpdate]` host came from
upstream's default rather than from `MOZ_APPUPDATE_HOST`. Check
`generated/identity.configure` for the `set_config MOZ_APPUPDATE_HOST` line, then
check the built `application.ini`:

```
sed -n 's|^URL=https://\([^/]*\)/update/6/.*|\1|p' objdir-release/dist/bin/application.ini
```

`aus5.mozilla.org` is a `deny` row in `powerbrowser/endpoint-allowlist.json`, so
`verify-endpoints.sh` layer 3 fails loudly rather than passing quietly. The usual
cause is a stale objdir predating the release-identity stage. Note that
`powerbrowser/distribution/policies.json` is **not** the mechanism:
`upstream/browser/installer/package-manifest.in` packages `distribution/*` only
under `BUILT_BY_MOZILLA`, so a policy file never ships. `docs/BUILD.md`'s
"Policy install" section and the update-host facts beside it were rewritten by
the non-GUI wave E (NG-064, NG-072); on that side this document is the stale one
until stage `release-identity` runs.

**Byte-identity rows go red after a flake update.** The most common cause is an
`inkscape` version change: the tracked PNGs were rasterised with the flake-locked
1.4.4 and a different `inkscape` produces different bytes that pass the icon step
and then fail byte identity, which looks like a defect in the tree and is not.
Regenerate under the pinned shell (`nix develop .#theia --command node
scripts/generate.mjs`) and read the diff before accepting it.

**The tag and the version files disagree.** `release-identity` names which one
drifted. The tag is derived, not typed: it is `v<ESR>-<revision>` from
`[upstreams].firefox_esr_tag` and `[product].revision`. Fix the manifest and
regenerate; do not hand-edit `powerbrowser/packaging/version/release.txt` or
`version.txt`, which are generated comparands.

**`update.status` reads `failed: 22`.** The MAR's channel is absent from the
client's `ACCEPTED_MAR_CHANNEL_IDS`. The update channel (`default`, the
`%CHANNEL%` path segment) and the MAR channel id (`powerbrowser-default`,
`<app_basename>-default` emitted by `emitMozconfig` as `MAR_CHANNEL_ID` and
`ACCEPTED_MAR_CHANNEL_IDS`) are two different values and are the most common
thing to conflate. Both derive from one constant, `UPDATE_CHANNEL` in
`scripts/generate.mjs`: changing the update channel also changes `emitMozconfig`'s
MAR id suffix, and the `update-channel` check holds every consumer to both values.
The emitter takes the side that cannot be guessed:
`scripts/build-update-xml.mjs --channel` is the update channel, it is
cross-checked against `MOZ_UPDATE_CHANNEL` in the given `config.status`, and a
disagreement fails naming both values, so no descriptor can be emitted under the
MAR channel id. Check the built `update-settings.ini` in the install directory
and the `--mar-channel-id` the MAR was stamped with.

**`update.status` reads `failed: 19`.** The MAR carries no signature the client
accepts. Either the MAR was never signed, or it was signed with a key whose
certificate is not embedded. Confirm with the tree's own tools:

```
LD_LIBRARY_PATH=objdir/dist/bin objdir/dist/bin/signmar -T <mar>
V=$(mktemp -d); export LD_LIBRARY_PATH=objdir/dist/bin
objdir/dist/bin/certutil -N -d "sql:$V" --empty-password
objdir/dist/bin/certutil -A -d "sql:$V" -n powerbrowser-mar -t ",," -i powerbrowser/packaging/mar/mar-primary.der
objdir/dist/bin/signmar -d "$V" -n powerbrowser-mar -v <mar> && echo VERIFIED; rm -rf "$V"
```

A correctly signed MAR reports exactly `Signature block found with 1 signature`.

**`updater --channels-allowed` prints `Error: 38`.** That is the **correct** output
for a build with verification compiled in on Linux. The branch is gated on
`argc == 2` and `gInstallDirPath` is not assigned until far later in the same
function, so `PopulategMARStrings` reads `/update-settings.ini`, fails, and returns
38. The output to worry about is `Not Applicable: No support for signature
verification` with exit 0, which means the build still carries
`--enable-unverified-updates`.

**The runner is offline.** `release.yml`'s build job queues rather than failing, and
GitHub cancels a self-hosted job that has waited 24 hours in the queue, so an offline runner
ends the run after a 24-hour wait with no build. Check the unit and the registration:

```
systemctl status github-runner-powerbrowser-release.service
gh api repos/Deocracy/powerbrowser/actions/runners --jq '.runners[] | {name, status, labels: [.labels[].name]}'
```

The runner is non-ephemeral, so it stays registered between jobs, and a persistent absence is
not normal. Check the unit first. Then check the hook: a job the hook refuses fails at set-up,
before any step. The hook's refusal line is expected in the job log; the acceptance drill records
whether it is. A registration token expires after
one hour and the file is left in place after registration, so an expired token in it is normal. Mint a
new one, write it through `pkexec` to `/var/lib/secrets/github-runner-registration` only for a
deliberate re-registration, and restart the unit. A personal access token is never the fix.

**Nothing runs at all after tagging.** A release-pattern tag pushed by any actor
other than the `powerbrowser-bot` App, the owner included, is refused at push time
by the `release-tags` ruleset, so the tag never reaches the remote and no workflow
can fire. Release tags come from `sign-publish` only.

---

## Stage plan index

The nine plans live under `.planning/drafts/distribution/`. Their phase numbers are
placeholders; the dependency order below is what matters. Waves: 1, 2, 3, 3, 4, 5,
5, 6, 6.

| Stage | Requirements | Operator gates | Deferred here |
|---|---|---|---|
| 1 `prerequisites-and-hardening` | DIST-01, SEC-01 | Push main and milestone tags; 2FA, the second owner, the Apps and the repository controls; the ESR rebase push | The seven unsigned-posture consequences |
| 2 `release-identity` | REL-01, UPD-01, UPD-02, UPD-03 | none (autonomous) | none |
| 3 `mar-signing-and-update-integrity` | SEC-02, UPD-04 | The primary and secondary key ceremonies (key stores on `legion`, two offline `.p12` copies of each); one MAR signed for the loopback proof | none: the key-rotation runbook is in [Key rotation](#key-rotation), which names the one open signing-job change |
| 4 `packaged-product-correctness-linux` | PKG-04 to PKG-09, UPD-08 | Node provenance and the licence position | The update-ready rows are gated on the probe verdict about whether the stock prompt can render |
| 5 `linux-release-pipeline-and-update-channel` | DIST-02, DIST-03, UPD-05, UPD-06, UPD-07 | Runner registration; the update origin and download page; cutting the first release | Windows and macOS descriptor directories and asset pairs, until real builds observe their BUILD_TARGET strings |
| 6 `windows-unsigned` | PKG-10 to PKG-13, SEC-03 | The `pkg-win11` guest; the five-cell matrix | Authenticode, the maintenance service, MSIX |
| 7 `macos-adhoc-signed` | PKG-14, PKG-15, PKG-16, SEC-04 | The borrowed or rented Mac session | Developer ID, notarization, the Team-ID patch, the Homebrew cask, the designed DMG artwork and a real `Assets.car` built with `actool` |
| 8 `reports-bug-error-crash` | TEL-05, TEL-06, TEL-07, TEL-08 | Cloudflare deployment; the crash-reporter gate decision | Native crash reporting in full, behind the `RETIRED`/`HELD` gate; both TEL-06 enrichment halves |
| 9 `listings-and-cadence` | DIST-04, DIST-05 | The first submissions and token custody | Homebrew until notarization; per-release Flathub bump automation; the daily liveness schedule |

### Open questions the plans leave, stated rather than hidden

These are not rhetorical. Each one is a decision or an observation that does not
exist yet, and each blocks something named.

1. **`SEC-03`'s deferred half is held by one grep.** The id is in stage 6's
   `requirements:` array and its shipping half is proven by real rows, but the
   deferred half (Authenticode, the maintenance service, MSIX) is held only by
   stage 6 task 2's `grep -qF 'SEC-03' docs/BUILD.md`. Nothing reddens if the
   resume pointer beside that id is reworded away while the id itself stays.
2. **No asset name is fixed as a literal anywhere.** The generation rule above is
   the only anchor, and three later consumers read the table rather than a name.
   The table's rows must be filled by the stage that observes them.
3. **Whether the Cloudflare placeholder rule covers the eleven-segment path** is
   decided by a live probe, not by documentation. The `_worker.js` fallback exists
   for the case where it does not.
4. **Whether the stock restart-to-update prompt can render in the Theia shell** is
   unverified. `AppMenuNotifications` has no consumer outside `browser.xhtml`, and
   the shell window has no `PanelUI`. Stage 4's probe decides it and the
   `update-ready-layer` rows are gated on the answer.
5. **Whether `FINAL_TARGET_FILES` accepts a `../` path** for staging the sidecar has
   no upstream precedent. Stage 4's probe decides between that route and a scripted
   pre-package step.
6. **The Windows and macOS BUILD_TARGET strings are derived from configure source,
   not observed.** Descriptor directory names must not be fixed until stages 6 and
   7 read them off running builds.
7. **The MAR size once the sidecar and Node ride in it** is unknown; the Gecko-only
   MAR was 78 MB and the Theia `lib/` directory is 146 MB without source maps. This
   affects download time in the hop drill and nothing else, but it is not a
   measured number yet.
8. **`verify-endpoints.sh` layer 3 cannot see the Node sidecar's resolutions.**
   Layer 3 reads a Gecko `nsHostResolver` log, stated as fact in stage 6's allowlist
   rationale, so a Node egress from the sidecar to `open-vsx.org` or an AI provider
   host cannot appear there. No plan measures whether the sidecar makes such a
   resolution, and no plan owns a remedy; the observation gap is recorded here and
   nowhere else.
9. **The daily update-channel liveness schedule is an owner decision that has not
   been taken.** D-77 is kept and the row runs as `release.yml`'s final job.

## Phase 56 checkpoint

The live half of Phase 56 (package channels). Plans 56-01 to 56-04 built every channel payload in the tree;
every step below is an owner step in the owner's shell, browser or account, and none of them has run. Each
field holds the owner's pasted evidence (URLs, SHAs, dates, holder names, verbatim replies) once it exists.
A field never holds a secret value: a token, a PAT or a private key is never written here. A leg the owner
has not pasted evidence for stays `AWAITING-OWNER` or becomes `DEFERRED-A<n>` naming the assumption that
resumes it (A2 Phase 54 Windows asset, A3 Phase 55 notarization, A4 Phase 47 site and DNS, A5 Phase 41 tap
repository and Apps). It is never recorded as passed. The step text and commands are in
`docs/cache-flathub-checkpoint.md` and `docs/winget-tap-checkpoint.md`; the order is the order of this list.

The repositories named below sit under the GitHub organisation that `configuration.toml` names.

1. **Cachix licence reply** (`CACHIX_REPLY`): AWAITING-OWNER
2. **R2 fallback state** (`R2_STATE`; enable only if Cachix refuses or needs a payment method): AWAITING-OWNER
3. **Flathub exception reply** (`FLATHUB_EXCEPTION`; ADMIT or DENY, verbatim, with the date): AWAITING-OWNER
4. **Flathub submission pull request** (`FLATHUB_PR`; opened by the owner after an ADMIT and the real release digest): AWAITING-OWNER
5. **winget credential holder** (`WINGET_HOLDER`; the dedicated bot account, name only): AWAITING-OWNER
6. **winget token stored** (`WINGET_TOKEN_STORED`; yes or no and the date, in the `winget` environment, never the value): AWAITING-OWNER
7. **winget pull request** (`WINGET_PR`; needs the Phase 54 Windows asset, otherwise DEFERRED-A2): AWAITING-OWNER
8. **Tap repository and tap commit** (`TAP_REPO`; `homebrew-tap` under that organisation (it exists), then the bot App's commit SHA; the cask itself is deferred to v1.7 (R6)): AWAITING-OWNER
9. **DNS TXT value** (`TXT_SET`; record `_flathub.debios.org`, the digest only, shown by the Flathub Developer Portal after the submission is accepted): AWAITING-OWNER
10. **Clean-machine substitute log** (`SUBSTITUTE_LOG`; the `nix build .#powerbrowser` lines proving no rebuild, pasted verbatim): AWAITING-OWNER
11. **/download rows** (`DOWNLOAD_URLS`; the live URLs of the Nix and Flatpak rows on the Phase 47 site, otherwise DEFERRED-A4): AWAITING-OWNER
12. **Deferrals** (`DEFERRED`; each deferred leg with its resuming assumption, A2, A3, A4 or A5): AWAITING-OWNER
