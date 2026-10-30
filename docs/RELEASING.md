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

The release tag `v<ESR>-<revision>` on `DeBIOS-Foundation/powerbrowser` is created
by `release.yml`'s `sign-publish` job with the `powerbrowser-bot` App token, after
the `release` approval (DIST-07, Phase 49), and the `release-tags` ruleset refuses
that tag pattern from every other actor, the owner included (GH-06).
The `build-linux` job of `.github/workflows/release.yml` runs on `legion` as an ephemeral self-hosted runner holding
`contents: read`, no environment and no secret; it builds Gecko, stages the Theia
sidecar and the pinned Node runtime into the application directory, packages,
emits the MAR, and writes `release-manifest.json` out of the built tree (baked
update URL, version, build ID, `OS_TARGET`, `TARGET_XPCOM_ABI`,
`MOZ_UPDATE_CHANNEL`, the joined BUILD_TARGET, and the on-disk asset filenames).
Its `sign-upload` job runs on `ubuntu-latest` under `environment: release` behind
a required reviewer, and is the only job carrying `contents: write`,
`id-token: write` and `attestations: write`; it decodes the MAR signing key from
two environment secrets, imports the decoded `.p12` into a scratch NSS database
with `pk12util -i`, signs every MAR with `signmar -d <db> -n powerbrowser-mar -s`,
verifies each one against the tracked certificate imported into a scratch NSS
database (`signmar -d <db> -n powerbrowser-mar -v`, see the verify form in
`docs/BUILD.md` "Key-custody rung") **before** any upload, writes
`SHA256SUMS`, creates the GitHub Release as a **draft** carrying every asset,
attests build provenance, emits one `update.xml` per BUILD_TARGET with
`scripts/build-update-xml.mjs --emit`, commits the descriptor tree to
`DeBIOS-Foundation/powerbrowser-updates`, and only then publishes. Cloudflare
Pages serves that descriptor repository at `updates.powerbrowser.org`, where one
`_redirects` rule maps the eleven-segment path baked into `application.ini` onto
`<channel>/<BUILD_TARGET>/update.xml`. An installed client reads the update host
out of its own `application.ini`, fetches the descriptor, downloads the MAR from
the immutable Release asset URL (`github.com`, which 302s to
`release-assets.githubusercontent.com`), verifies the signature against the fork
certificates embedded in its own updater, and applies. A final `channel-live` job
re-reads the published Release and the live channel and fails the release if they
disagree. Reports travel the other way and share none of that path: a Report a Bug
command opens a prefilled GitHub issue form in a stock browser window, and the
Theia frontend's error hooks post to a Cloudflare Worker at the events origin,
shipped at telemetry level `off` with the endpoint stated so the existing
preference is a working opt-in.

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
  **More info** and then **Run anyway**. The verbatim dialog title, body text and
  button labels are captured in the `pkg-win11` guest during stage
  `windows-unsigned`, written into tracked `docs/WINDOWS-DISTRIBUTION.md`, and
  compared as set equality against the live download page by the `win-download-copy`
  registry row. Do not paraphrase that text on the download page; a paraphrase is
  what the gate exists to catch.
- The Windows mozconfig carries `--disable-maintenance-service`. This is not a
  simplification. With the Authenticode check compiled out, the maintenance service
  would run `updater.exe` as `LocalSystem` on admin installs. Shipping the service
  unsigned would be worse than shipping without it.
- No `CERTIFICATE_NAME` or `CERTIFICATE_ISSUER` NSIS defines exist anywhere on the
  installer surface.
- MSIX is out of scope: `upstream/python/mozbuild/mozbuild/repackaging/msix.py`
  raises without `makeappx.exe` and `signtool.exe` from a real Windows SDK, and the
  only reason to add it is a Microsoft Store listing.

### macOS

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
| `prerequisites-and-hardening` | Enable 2FA on the owner account; confirm the committer email is listed and **verified**; enable organisation-wide 2FA in `DeBIOS-Foundation` settings | UI-only settings; the organisation PATCH endpoint does not expose the 2FA requirement |
| `prerequisites-and-hardening` | Create and install both GitHub Apps, require org 2FA, add the second owner, store both recovery-code sets offline, run the apply script, and run the runner-group probe and the notification drills (Phase 41 plan 41-04) | App creation, org 2FA and ownership are UI-only; `--yes` writes to the live org and runs only from the owner's terminal |
| `mar-signing-and-update-integrity` | Confirm `gh auth status` shows the owner and the `release` environment exists | Account |
| `mar-signing-and-update-integrity` | The MAR key ceremony (below) | Private key custody |
| `mar-signing-and-update-integrity` | The MAR key ceremony (key store lives on `legion` at `~/.config/powerbrowser-release/mar-key/`; optional `.p12` backup to the offline medium) and one MAR signed with that store's key for the loopback proof | Private key custody |
| `packaged-product-correctness-linux` | Node provenance: read the version from `nix develop .#theia --command node --version`, fetch `SHASUMS256.txt` with its `SHASUMS256.txt.sig` from the same `nodejs.org/dist/<version>/` directory, import and confirm the Node.js release signing keys (origin: the nodejs/release-keys repository, verified out of band against the keys the installer already trusts), `gpg --verify SHASUMS256.txt`, take the `linux-x64` sha256, pin it, and write the shipped-licences and provenance section of `docs/BUILD.md` | Key trust decision |
| `linux-release-pipeline-and-update-channel` | Create a fine-grained PAT limited to `DeBIOS-Foundation/powerbrowser` with self-hosted-runner read/write only; write it root-owned mode 0600 to `/var/lib/secrets/github-runner-pat` | Secret custody plus `pkexec` |
| `linux-release-pipeline-and-update-channel` | Add the `services.github-runners` block to `/etc/nixos/configuration.nix` and apply it | Root on `legion` |
| `linux-release-pipeline-and-update-channel` | Set fork pull request workflows from outside collaborators to **Require approval for all external contributors**; read back `fork-pr-approval.json` rather than re-applying | Repository settings UI |
| `linux-release-pipeline-and-update-channel` | Confirm the `release` environment still carries a required reviewer and that the MAR key is an **environment** secret; create no repository-level Actions secret (`repo-controls` asserts that count stays zero) | Read-back of a control the owner owns |
| `linux-release-pipeline-and-update-channel` | Create the public repository `DeBIOS-Foundation/powerbrowser-updates` with a root `_redirects` and a placeholder no-update descriptor at `default/Linux_x86_64-gcc3/update.xml`; create the Cloudflare Pages project (empty build command, output `/`); add `updates.powerbrowser.org` as a custom domain | Cloudflare account and DNS |
| `linux-release-pipeline-and-update-channel` | Probe the eleven-segment path live with real client segment shapes, then switch to a minimal `_worker.js` if the placeholder rule does not match, and record which mechanism shipped | Live infrastructure; the branch cannot be decided from documentation |
| `linux-release-pipeline-and-update-channel` | Create a fine-grained PAT with Contents write on `powerbrowser-updates` only; store it as a `release` environment secret | Secret custody |
| `linux-release-pipeline-and-update-channel` | Fill the four website routes (`/`, `/download`, `/privacy`, `/legal`, each a real file, no fragment redirect); with the `website-publish-ready` row green, deploy `powerbrowser.org` | Site repository and Pages |
| `linux-release-pipeline-and-update-channel` | Approve the `release` environment gate after reviewing the artifact list and the descriptor commit diff; hold any announcement until the release-mode hop drill is green | The approval is the only point at which the MAR key is used |
| `windows-unsigned` | Provision the `pkg-win11` guest: confirm the media, create or start the libvirt NAT network, create a **new** `pkg-win11` disk (leave the pre-existing shut-off `win11` domain alone), define the domain with qcow2 nvram, install Windows 11, install the QEMU guest agent and stock Firefox, take the `clean-baseline` snapshot | `sudo` for `qemu:///system` |
| `windows-unsigned` | Run the five-cell Windows matrix from the snapshot and write the record | Guest interaction and verbatim dialog capture |
| `macos-adhoc-signed` | Borrow or rent a Mac for one session; record hardware, chip family and macOS version | No Apple hardware is owned |
| `macos-adhoc-signed` | Transfer the DMG, verify its SHA256 on the Mac, install to a user-writable folder, record the Gatekeeper refusal verbatim and the Open Anyway path, confirm the Theia interface and the icon, record both Darwin BUILD_TARGET strings, run one hop from the writable location, repeat from `/Applications` and record what the updater does, uninstall and record residue | The whole point of the session |
| `macos-adhoc-signed` | Push the macOS build job and the flipped asset condition only after the matrix record exists and its gate is green | Release gate |
| `reports-bug-error-crash` | Create the events DNS record on `powerbrowser.org` (proxied), the D1 database and its one-table schema, deploy the Worker, add the rate-limiting rule, and record the database id, wrangler version, deployed version id, threshold and period | Cloudflare account |
| `reports-bug-error-crash` | Copy `docs/PRIVACY.md` into the website repository as `/privacy` without rewording and confirm Cloudflare serves it 200 | Site repository |
| `reports-bug-error-crash` | From outside the Cloudflare account post one synthetic event (200), one over-cap body (413) and one burst past the rate limit (blocked); paste all three responses verbatim | An external vantage point |
| `reports-bug-error-crash` | Record both TEL-06 deferrals as named rows, and decide the crash-reporter gate in writing as `RETIRED` or `HELD` | Owner decision; under `RETIRED` the milestone owner amends the exclusion row, not this plan set |
| `listings-and-cadence` | Under an ADMIT verdict, regenerate and rename the four Flathub files, substitute the five `@RELEASE_*@` tokens, optionally validate locally, and open the Flathub submission PR from the owner's account | The submission is made under a person's identity |
| `listings-and-cadence` | Under an ADMIT verdict, fork the winget catalogue, create the manifest set, accept the contribution agreement, open the PR, and store a fork-scoped fine-grained PAT as `WINGET_TOKEN` in the `release` environment | Identity plus secret custody |
| `listings-and-cadence` | Take no Homebrew action; confirm the deferral row names the stage slug that resumes it | Deliberate inaction, recorded |

**Budget, not an operator gate.** Two stages need tier-3 wall time scheduled on
`legion` rather than a person at a console: roughly two hours in
`mar-signing-and-update-integrity` for the N and N+1 rebuilds plus the three
loopback drives, and roughly 55 minutes in `packaged-product-correctness-linux`
for the `objdir-release` rebuild. Both builds are auto tasks in their plans.

### Automated (Claude executes the plan)

| Stage | Work |
|---|---|
| `prerequisites-and-hardening` | Correct the two stale control claims and re-sync the pref comparands; write the nine `.github/settings/*.json` bodies and apply them; write this document's control half; register `scripts/verify-repo-controls.mjs` as the permanent drift check; rebase the ESR pin to `FIREFOX_153_2_0esr_RELEASE`, push `main` to parity and watch that run |
| `release-identity` | Configure-level probe of the four levers; `releaseIdentity()` in the generator with tracked comparands; policy file, hop gate, branding gate and documents follow the baked host; `scripts/verify-release-identity.mjs` with self-test and two registry rows; one batched dev rebuild proving the baked identity |
| `mar-signing-and-update-integrity` | Carried out by non-GUI wave E Task 8 (NG-065): `patches/030-powerbrowser-mar-certificates.patch`; drop `--enable-unverified-updates`; tier-3 rebuild of N and N+1; fork-key signing per wave E plan Task 8 Produces, descriptor emission, updater-driven four-outcome proof (`ng065-mar-signature-enforced`) |
| `packaged-product-correctness-linux` | Staging and packaging probe; `scripts/stage-sidecar.sh` and `patches/050-powerbrowser-package.patch`; application-directory resolution, profile-scoped Theia state, URL argument handling; variant-free legal notice; shell-side update-ready layer; four registry row pairs and `scripts/run-install-matrix.sh` |
| `linux-release-pipeline-and-update-channel` | Derive the update-origin facts and write the procedure half of this document; `.github/workflows/release.yml` plus its static gate; the live channel gate; the release-mode hop drill and the observed allowlist rows |
| `windows-unsigned` | Five routing verdicts; `.#firefox-win64` shell and the Windows mozconfig; the one-time `WINSYSROOT` cache population with `get_vs.py`, run from `upstream/` and written outside the repository; generated installer artwork and fork registry defines; `patches/050-powerbrowser-installer.patch` and the deny-host grep; the Windows build, sidecar staging, installer and MAR; the matrix gate, the copy gate, the WINNT descriptor row and the `build-windows` job |
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

The build runner is `legion` itself, registered as an **ephemeral** self-hosted
runner. It is used by the build jobs only, triggered by release tags and
`workflow_dispatch`, never by `pull_request`. Secrets and keys never reach it.

```
pkexec bash -c 'install -d -m 0700 /var/lib/secrets; printf %s "<token>" > /var/lib/secrets/github-runner-pat; chmod 0600 /var/lib/secrets/github-runner-pat'
```

Then add to `/etc/nixos/configuration.nix`:

```nix
services.github-runners.powerbrowser-release = {
  enable = true;
  url = "https://github.com/DeBIOS-Foundation/powerbrowser";
  tokenFile = "/var/lib/secrets/github-runner-pat";
  tokenType = "access";
  ephemeral = true;
  replace = true;
  name = "legion";
  extraLabels = [ "legion" ];
  extraPackages = with pkgs; [ git gh nix ];
};
```

and apply it with the documented flow:

```
pkexec bash -c 'export PATH=/run/current-system/sw/bin:/run/wrappers/bin:$PATH; nrs "feat: legion ephemeral github runner for powerbrowser release builds"'
```

Two properties are module behaviour rather than hope. `ephemeral = true`
de-registers the runner after one job and wipes the state directory on the next
start, so no job inherits another job's tree or environment. The module places
`tokenFile` on the service's `InaccessiblePaths`, so the runner process cannot
read the PAT it was configured from. `count` defaults to 1, so the unit is
`github-runner-powerbrowser-release.service`.

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
- Five environments, each restricted by a custom branch policy to `main` only
  (`environment-branch-policy-main.json`):
  - `release` (`environment-release.json`): the owner as required reviewer, admin
    bypass disabled (`can_admins_bypass` false).
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

### The MAR key ceremony and custody

Run the ceremony once, on `legion`, at the repository root, with nobody else at the
console and an offline medium mounted. The shape is:

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
# Optional, the owner's call: a .p12 backup of the key to the offline medium.
$PB/objdir/dist/bin/pk12util -o <medium>/powerbrowser-mar.p12 -d "sql:$D" -n powerbrowser-mar -k "$D/password.txt" -w "$D/password.txt"
ls -l "$D"    # cert9.db key4.db pkcs11.txt password.txt -- nothing from this directory ever enters the repo
```

The key store and `password.txt` live on `legion` at
`~/.config/powerbrowser-release/mar-key/`, outside the repo. One key fills both
updater slots (R12): a compromised key needs a client rebuild. Only the public
certificate, `powerbrowser/packaging/mar/mar-primary.der`, is tracked. The
`.p12` backup on the offline medium comes from the optional `pk12util` line in
the ceremony block above. Loading the key into the `release` environment secrets
is part of the deferred release pipeline row.

### Cloudflare Pages

Two Pages projects, both on the Free plan.

**`updates.powerbrowser.org`** serves `DeBIOS-Foundation/powerbrowser-updates` with
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

### The Windows VM

`pkg-win11` is a **new** libvirt domain on a new disk. A shut-off domain named
`win11` with a 200704-byte stub qcow2 already exists on `legion`; leave it and its
disk alone. `docs/BUILD.md`'s packaging capability record still states that
`virsh list --all` shows zero defined domains; that line is stale, and stage
`windows-unsigned` corrects it along with the read-access claim beside it. The guest is a test target, never a build host: the Windows build is a
Linux cross-compile. Give the nvram `format='qcow2'` rather than raw, because
libvirt refuses an internal snapshot for a pflash domain whose nvram is not qcow2,
and the `clean-baseline` snapshot every matrix cell reverts to depends on it. Install
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
| Branch policy `main`, per environment | `environment-branch-policy-main.json` | `POST environments/<name>/deployment-branch-policies`, only when `main` is absent | `environments/<name>/deployment-branch-policies` |
| `main-integrity` ruleset | `ruleset-main-integrity.json` | `PUT rulesets/<id>`, or `POST rulesets` when absent by name | `rulesets`, `rulesets/<id>` |
| `main-review` ruleset | `ruleset-main-review.json` | as above | as above |
| `release-tags` ruleset | `ruleset-release-tags.json` | as above, blocked until `powerbrowser-bot` is installed | as above |
| Immutable releases | `immutable-releases.json` | `PUT immutable-releases` (no body), only while zero Releases exist | `immutable-releases` |
| Private vulnerability reporting | `private-vulnerability-reporting.json` | `PUT private-vulnerability-reporting` (no body) | `private-vulnerability-reporting` |
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
| `release` environment | `MAR_SIGNING_P12_B64` | `mar-signing-and-update-integrity` | GitHub, gated on the required reviewer |
| `release` environment | `MAR_SIGNING_P12_PASSWORD` | `mar-signing-and-update-integrity` | as above |
| `release` environment | descriptor-repository PAT (Contents write on `powerbrowser-updates` only) | `linux-release-pipeline-and-update-channel` | as above |
| `release` environment | `WINGET_TOKEN`, fork-scoped, only under an ADMIT verdict | `listings-and-cadence` | as above |
| Host filesystem on `legion` | `/var/lib/secrets/github-runner-pat`, root-owned mode 0600 | `linux-release-pipeline-and-update-channel` | the operator; on the unit's `InaccessiblePaths` |
| Offline medium | `powerbrowser-mar.p12` (from the ceremony block's optional `pk12util` line, protected with the key store's password from `password.txt`) and the key-store password | `mar-signing-and-update-integrity` | the operator, in a safe |

No secret reaches `legion` through Actions. The build job holds `contents: read`,
no `environment:` and no `secrets.` reference; the static release-workflow gate
asserts all three.

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
gh run watch --repo DeBIOS-Foundation/powerbrowser --exit-status "$(gh run list --repo DeBIOS-Foundation/powerbrowser --workflow=release.yml --limit 1 --json databaseId --jq '.[0].databaseId')"
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
gh release view "$TAG" --repo DeBIOS-Foundation/powerbrowser --json isDraft,assets
```

Look for `isDraft false` and, in the asset list, the versioned and stable pair for
each target plus `SHA256SUMS`, `LICENSING.md`, `THIRD-PARTY-NOTICES.txt`, the MAR
and the source tarball. Then confirm the descriptor commit exists in
`DeBIOS-Foundation/powerbrowser-updates` and that the live descriptor now carries a
complete patch rather than the empty `updates` element.

**7. The liveness row.** `release.yml`'s final job `channel-live` runs
`scripts/verify-update-channel-live.mjs --manifest <path>` against the release it
just published. It derives the descriptor host, the eleven-segment path, the channel
and the BUILD_TARGET set from the build job's own manifest, fetches each descriptor
through the baked path (which exercises the `_redirects` rule rather than the
underlying file path), HEADs the patch URL and compares Content-Length to the
descriptor size, GETs the MAR and compares its sha512 to the descriptor hashValue,
requires the patch URL to be https and to be the immutable
`/releases/download/<tag>/` form rather than a latest-download form, and compares
appVersion and buildID against the published Release. It can also be run by hand:

```
scripts/verify-platform.sh --only update-channel-live
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
`LICENSING.md`, `THIRD-PARTY-NOTICES.txt`, and the source tarball.

A descriptor's patch URL names the R2 MAR origin, `https://downloads.powerbrowser.org/<tag>/<asset>`
(owner ruling 2026-10-29). It is never a github.com `/releases/download/` URL, because
github.com is user-initiated and an unattended fetch from it fails the endpoint verdict.
The live channel gate reddens on a latest-download URL.

### Partner search codes (UPD-15, recorded 46-04)

Stock partner machinery stays untouched: `ConfigSearchEngine` partnerCode,
`browser.partnerlink.*` prefs, no `distribution/` search config, no
`org.debios` string, no custom code, no search-host allowlist change. If a
live Suggest-traffic observation is wanted, it is Phase 50 criterion 5
alongside the asset hosts -- not a new row here.

---

## Maintenance

### Cadence

One release per ESR point release, roughly every four weeks, plus out-of-cycle
security releases. Each costs one rebase drill through `scripts/rebase-upstream.sh`
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

### Out-of-band security path

The same pipeline, with the review shortened to the `release` environment's single
required reviewer, tagged as soon as the rebase drill is green. The liveness job
still runs last. Nothing is skipped: an out-of-band release that skipped the MAR
signature verify step would ship the exact failure mode the signing stage exists
to close.

### Schedule posture

D-77 is kept. No workflow carries a `schedule` key. The update-channel liveness
check runs as `release.yml`'s final job rather than on a timer. A daily liveness
schedule remains an owner decision that has not been taken; if it is taken, it
reverses D-77 and both `rebase-upstream.yml` and this section change together.

### Key rotation

One key fills both updater slots (R12), so a rotation needs a client rebuild:
create the new store in a new directory (never reuse the live directory; the
ceremony block refuses to run over an existing store), ship the transition release
signed with the **old** key whose updater embeds the new certificate
`powerbrowser/packaging/mar/mar-primary.der`, and only then switch signing to the
new store. The row that proves signing is `ng065-mar-signature-enforced` (a
fork-signed MAR applies; unsigned and foreign-key MARs are refused with
`CERT_VERIFY_ERROR`; a wrong-channel MAR is refused with
`MAR_CHANNEL_MISMATCH_ERROR`). There is no rotation runbook beyond this paragraph
today; writing one is open work.

### Runner upkeep

The runner is `github-runner-powerbrowser-release.service` on `legion`, maintained
through `/etc/nixos/configuration.nix` and the `pkexec ... nrs` flow, never by
editing the unit. Because it is ephemeral, it de-registers after each job and wipes
its state directory on the next start, so a stuck job is cleared by restarting the
unit rather than by cleaning a work directory. Keep disk headroom for the objdirs a
release build needs: `objdir/` peaks around 14 GB on top of the roughly 5.6 GB
`upstream/` checkout, and a Windows or macOS target adds its own objdir. `sccache`
is already configured in `.mozconfig` and in the `.#firefox` shell; stages
`windows-unsigned` and `macos-adhoc-signed` add `.#firefox-win64` and
`.#firefox-macos`, which inherit the same export. The `.#theia` shell carries none
and needs none. No second cache backend is added.

### Cloudflare upkeep

Two Pages projects, one Worker, one D1 database, one R2 bucket reserved for the
gated crash sub-plan, and the DNS records for `updates.powerbrowser.org`, the events
hostname and the site. The one contract that must not drift is the `_redirects` rule
(or the `_worker.js` that replaced it) mapping the baked eleven-segment update path
onto `<channel>/<BUILD_TARGET>/update.xml`: every installed client depends on it, and
the baked path cannot be changed for builds already in users' hands. Free-tier caps
are what keep MAR bytes on GitHub Release assets rather than on Pages.

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
and the new sha256 comes from a GPG-verified `SHASUMS256.txt`. Flake input moves are
covered under **Toolchain pins** above.

Listing state lives in the Listings table that stage `listings-and-cadence` adds, and
every deferral lives in the single `## Deferred signing items` register above. Do not
add a second table for either.

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
| `mar-sign-self-test` | 3 | MARs are signed with the signing command in `docs/BUILD.md` "Key-custody rung" and verified with the tree's own `signmar` against the tracked certificate imported into a scratch NSS database (`signmar -d <db> -n powerbrowser-mar -v`), and each planted fault goes red naming the file. The live signing evidence rides on the existing `mar-update-hop` row rather than on a second full row | Verify the unsigned MAR; verify a foreign-key MAR against the fork certificate; sign an already-signed MAR; sign with a nickname absent from the database |
| `build-update-xml-self-test` | 3 | One descriptor per BUILD_TARGET emitted from `application.ini` and the MAR bytes, byte-identical on re-emission, carrying `detailsURL`, over synthetic fixtures | An unknown target token; an `application.ini` with no BuildID; a `TARGET_XPCOM_ABI` disagreeing with the table; `--channel` given the MAR channel id while the fixture `config.status` carries the update channel |
| `packaged-launch` | 4 | An extracted package launches on a fresh profile and reaches the Theia shell with both product markers, resolving in-prefix | Remove the staged backend |
| `packaged-identity` | 4 | `application.ini` and the staged Theia `package.json` carry release-variant identity | A dev suffix in the staged notice |
| `install-matrix-linux` | 4 | Install, launch, coexistence and no-residue over paths derived from the packaged `application.ini` | Driver self-test |
| `update-ready-layer` | 4 | The shell offers a working restart affordance, gated on the probe verdict about whether the stock prompt can render at all | Layer self-test |
| `release-workflow` | 5 | Triggers, SHA pins, actions-policy admissibility, per-job permissions and the derived asset set | An unpinned action; an added `pull_request` trigger; `id-token: write` moved onto the legion job; a secret reference in the legion job; a dropped asset name; a third-party action absent from `patterns_allowed`; a verify invocation removed from between sign and upload; a renamed signing secret |
| `update-channel-live` | 5 | The live channel agrees with the published Release, all derived from the build's manifest | A wrong `hashValue`; a missing target descriptor; a 404 MAR URL; a size mismatch; a latest-download patch URL |
| `installer-schema` (widened) | 6 | The staged NSIS sources carry fork defines and no Mozilla literal | Existing self-test widened |
| `installer-build-proof` (widened) | 6 | The staged preprocessed `.nsi` sources contain no Mozilla telemetry host and no survey host, and still compile | Planted deny host in the staged tree |
| `win-matrix-record` | 6 | Five Windows cells each carry a verdict and verbatim evidence; the BUILD_TARGET parses; the registry diff names the fork root and leaves `Software\Mozilla` untouched | A missing cell; a bare RED with no cause; an empty BUILD_TARGET; a registry diff that touched `Software\Mozilla`; an absent SmartScreen block |
| `win-download-copy` | 6 | The verbatim SmartScreen block is identical across the matrix record, the tracked document and the live download page | A reworded label |
| `macos-toolchain-verdict` | 7 | The probe record's routing verdicts exist and are current | Record self-test |
| `macos-branding-inputs` | 7 | Every branding file the cocoa package path consumes exists in both variants, derived from **both** upstream consumers | A deleted `document.icns`, `Assets.car`, `dsstore` or `disk.icns`; a corrupted icns length field; an added copy line in a mirrored `Makefile.in`; an added join filename in a mirrored `moz.configure` |
| `macos-package-payload` | 7 | Universal slices, one shared build ID, an ad-hoc signature with no notarization, the staged sidecar, the MAR and both descriptors | Payload self-test |
| `macos-download-copy` | 7 | The download copy carries no internal identifier and states both unsigned consequences | Copy self-test |
| `macos-install-matrix` | 7 | Every Mac cell carries a verdict plus evidence, and the observed Darwin BUILD_TARGET strings equal the emitted descriptor set both ways | A missing cell; a verdict with no evidence; a build target no descriptor covers; a descriptor no observation covers |
| `bug-report-affordance` | 8 | The prefill parameters are a subset of the issue template's field ids, and the built URL's origin and path agree with the manifest key | Prefill self-test |
| `events-worker` | 8 | The Worker rejects oversized, malformed and over-rate submissions before writing, and holds no secret | Contract self-test |
| `tel06-error-delivery-live` | 8 | One real POST from a running sidecar reaches a loopback endpoint, which the earlier drill never observed | Analyzer self-test |
| `listing-manifests` | 9 | App id, licence form, desktop and icon agreement, the updater-disable split, token presence and the winget identifier, all derived | Listing self-test |
| `releasing-maintenance` | 9 | This document's maintenance section agrees with the automation by derivation | A schedule key planted into a fixture workflow; a documented trigger removed; a job id removed from the doc; the fixture job order changed so the documented liveness job is no longer last; a DER basename removed; a listing row removed; a deferred row stripped of its pointer; a row removed from `## Deferred signing items`; one of the seven original consequences deleted; a sibling deferrals table added; a required command removed |

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

**The runner is offline.** `release.yml`'s build job queues forever rather than
failing. Check the unit and the registration:

```
systemctl status github-runner-powerbrowser-release.service
gh api repos/DeBIOS-Foundation/powerbrowser/actions/runners --jq '.runners[] | {name, status, labels: [.labels[].name]}'
```

Because the runner is ephemeral it de-registers after each job and re-registers on
the next start, so a brief absence between jobs is normal. A persistent absence is
usually the PAT: it is root-owned mode 0600 at `/var/lib/secrets/github-runner-pat`
and it expires. Renew it, rewrite the file through `pkexec`, and restart the unit.

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
| 3 `mar-signing-and-update-integrity` | SEC-02, UPD-04 | The key ceremony (key store on `legion`); one MAR signed for the loopback proof | The key-rotation runbook |
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
