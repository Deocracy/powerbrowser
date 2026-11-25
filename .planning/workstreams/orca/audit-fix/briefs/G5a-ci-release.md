# Fix brief: G5a-ci-release

Lane: product. Items: 13. Files this group owns: `^\.github/workflows/` (pattern), `scripts/rebase-orca.sh`, `scripts/fetch-orca.sh`, `^scripts/build-orca` (pattern), `scripts/export-orca-seam-pr.mjs`, `scripts/detect-upstreams.mjs`, `scripts/release-train.mjs`, `scripts/download-plugins.mjs`, `scripts/win-sign-list.mjs`, `flake.nix`, `^orca-overlay/upstream/` (pattern).

Item IDs: ci-supply-chain-04; 68-CR-03; ci-supply-chain-01; ci-supply-chain-02; 68-CR-02; 68-CR-01; 64-WR-05; 60-WR-01; 60-WR-03; 68-WR-03; 68-WR-01; ci-supply-chain-06; ci-supply-chain-03.

## ci-supply-chain-04: rebase-orca runs untrusted Orca code in the same release-train run as renovate-licensing-publish, so it can replace the notices artifact the bot commits

- **Severity:** medium
- **Verdict:** PLAUSIBLE
- **Location:** `.github/workflows/release-train.yml:1046`

**What is wrong.** Plan 51-09 split the Theia licensing regeneration so that no untrusted code shares a context with what the bot publishes. renovate-licensing-publish (bot environment, App token) downloads `renovate-licensing-notices` by name from the current run and commits it to chore/theia-theia. rebase-orca now runs in the same run whenever the Theia tick and the Orca tick fall on the same sweep, or when the owner dispatches with both flags. It executes Orca's install and build with a later actions/upload-artifact step on disk, so the Orca code can obtain ACTIONS_RUNTIME_TOKEN and delete and re-upload any artifact in the run. The same applies to `release-train-maintenance-state`, which the next sweep downloads (prev-run-id) to decide which maintenance rows count as newly red.

**Scenario.** On a sweep that is both the first after the month's last Thursday and the first of an ISO week, the hostile Orca build takes the runtime token. Once renovate-licensing uploads, it replaces renovate-licensing-notices with a LICENSING.md and THIRD-PARTY-NOTICES.txt of its own. The listing check `ls -A == 'LICENSING.md THIRD-PARTY-NOTICES.txt'` passes, and the bot commits the forged notices to the Theia PR. Alternatively, it uploads a release-train-maintenance-state that marks red rows as already red, which suppresses the transition comment for a watchdog failure.

**Preconditions.** Compromised upstream Orca tag (actor f), and a run that includes both the Orca re-pin and the Theia inflow or maintenance sweep.

**Evidence.** release-train.yml:1046-1055 `rebase-orca: ... uses: ./.github/workflows/rebase-orca.yml` (same run); rebase-orca.yml:138 `uses: actions/upload-artifact@...` after the untrusted step at rebase-orca.yml:104-106; release-train.yml:931-936 `Download the regenerated notices ... name: renovate-licensing-notices` with the comment 'This run's artifact only'; release-train.yml:947 checks only the file names; release-train.yml:1944-1946 uploads release-train-maintenance-state, which the next run reads at 1881-1886.

**Suggested fix.** Pass each notices artifact's sha256 as a job output of the producing job (renovate-licensing outputs.head already exists, so add outputs.notices-sha256) and verify it in renovate-licensing-publish before committing. Do the same for maintenance-state. Or run the Orca re-pin as its own workflow (rebase-orca.yml dispatched separately) so no upstream code shares a run with bot-environment consumers.

**Verifier (PLAUSIBLE, medium).** The co-scheduling is real. detect-orca (release-train.yml:1004-1006) and renovate-theia (758-760) both hang off sweep-clock, with orca-due and theia-due computed independently in one sweep (722-750), or set together by owner dispatch flags. rebase-orca is a reusable-workflow job in the same run (1046-1055) with a 90-minute timeout, running Orca's install, build and typecheck on a hosted runner. renovate-licensing-publish downloads `renovate-licensing-notices` by name from the current run (931-936). Its only content check is the file-name listing at 947. It then copies the files into target/ and commits them under the bot identity (960-970) with the App token minted afterwards (973-993). Nothing compares the artifact content with what renovate-licensing produced (for example a digest passed as a job output). The step I cannot settle statically: whether code in a run step of the rebase job can obtain a usable ACTIONS_RUNTIME_TOKEN and use it to delete and re-create an artifact another job in the same run uploaded, before renovate-licensing-publish downloads it. Two routes exist: reading the Runner.Worker process memory or environ (passwordless sudo on hosted runners), or a later node action step in the same job (the upload-artifact at rebase-orca.yml:138 runs only when notices changed). Cross-job deletion inside a run is what upload-artifact's overwrite and merge/delete-merged rely on, so the mechanism is credible. The race window depends on runtime timing. The maintenance-state half is weaker. The report job, which needs rebase-orca (1628), uploads release-train-maintenance-state with overwrite:true (1944-1954) after the rebase job has ended. Tampering with it therefore needs the exfiltrated token to stay valid after its job completes, a second runtime step. Impact is bounded: the forged notices land on chore/theia-theia, where Renovate automerge is off and the owner merges (comment at 756). The suppressed transition comment still leaves the issue body patched red (1922-1929). Medium as a defence-in-depth gap against the plan 51-09 separation stands. *Checked at:* release-train.yml:722-750 (independent theia/orca ticks), 1046-1055 (same run), 931-936 and 947 (name-only check), 960-970 (bot commit of artifact bytes); rebase-orca.yml:73-76 (contents: read does not scope the runtime token), 104-106, 138; release-train.yml:1628 and 1944-1954 (state upload after rebase-orca ends)

## 68-CR-03: The macOS Orca trees lose their executable bits in the artifact round trip, and the universal merge copies the lost mode

- **Severity:** low (reviewer label: critical)
- **Verdict:** PLAUSIBLE
- **Location:** `.github/workflows/release.yml`
- **Owner decision cited:** D-40

*Section CR-03 of `.planning/workstreams/orca/phases/68-three-os-artifacts-weekly-re-pin-and-upstream-seams/68-REVIEW.md`, verbatim:*

**File:** `.github/workflows/release.yml:2181-2189,2296-2304` (upload), `:2397-2405` (merge); `powerbrowser/packaging/package-macos.sh:66-90` (`orca_universal`), `:403-408` (per-arch staging from `PB_MAC_ORCA_DIR`)
**Issue:** `macos-orca-arm64` and `macos-orca-x64` upload the staged directory itself with `actions/upload-artifact`. That action does not preserve Unix file modes; its README says "File permissions are not maintained during artifact upload". After `download-artifact`, every file in `macos-orca-*` has mode 0644, including:
- node-pty's `build/Release/spawn-helper`, which node-pty `posix_spawn`s for every terminal;
- the ripgrep binaries;
- `agent-browser-darwin-*`.

`orca_universal` then copies the lost mode onto the merged file: `chmod --reference="$arm/$a"` (`:75`) and `chmod --reference="$out/$a"` (`:81`). `cp -a` (`:70`) carries 0644 for every other file. The per-arch mode stages `PB_MAC_ORCA_DIR`, a downloaded artifact by its own usage text, with `cp -a` (`:406`), so the same thing happens there. No check catches it:
- `check-win-sidecar.sh check` compares content hashes only;
- `orca-packaged-tree` and `package-target-natives` judge names and magic.

The result is a bundle whose orcad cannot spawn a PTY, run ripgrep or start agent-browser on macOS. Nothing consumes the universal tree in this phase (P68-31 scope), but `package-macos.sh <arch>` is the code path the macOS bundle will take.
**Fix:** Carry the modes through the artifact. In each thin job, archive the tree, upload the tarball, and list the tarball (not the loose files) in SUMS:
```bash
(cd "$RUNNER_TEMP" && tar -cf macos-orca-arm64.tar -C macos-orca-arm64 .)
# upload macos-orca-arm64.tar; SHA256SUMS + its digest cover the tar; consumers: tar -xpf after admission
```
Alternatively, record `stat -f '%Lp %N'` modes in a `MODES` file listed in SUMS and re-apply them after admission. Then add an `orca-packaged-tree` clause, for the macOS and Linux targets, requiring every Mach-O/ELF executable (not `.node`/`.dylib`) to be mode 0755.

## Warnings

**Verifier (PLAUSIBLE, low; scope: macos build).** (1) The cited code is as described. Both thin jobs upload the loose directory `$RUNNER_TEMP/macos-orca-<arch>/` with actions/upload-artifact v7.0.2 (release.yml:2182-2189, 2297-2304). No step tars or zips the tree first, and no step writes a mode list. macos-orca-universal downloads both trees with download-artifact v8.0.2 and admits them with `check-win-sidecar.sh check`, which compares only the SHA256SUMS digest and runs `sha256sum -c` (check-win-sidecar.sh:32,58). It then merges them. In orca_universal, `cp -a` copies the downloaded modes (:70). `chmod --reference` copies the arm or out mode onto each lipo output (:75, :81), and `cp -p` copies it to the paired name. Neither step sets 0755. The per-arch path admits PB_MAC_ORCA_DIR, which the usage text at :349 calls the downloaded macos-orca-<arch> artifact, and stages it with `cp -a` (:405-406). Nothing restores executable bits on either path. The only chmod is `chmod 755` on the Node binary (:398). verify-orca-packaged-tree.mjs and verify-package-target-natives.mjs never check modes.
(2) Third-party behaviour. The step I cannot settle from disk is the premise that upload-artifact v7.0.2 plus download-artifact v8.0.2 extract every file as 0644. Neither action's source is on disk. Only orca/node_modules/@actions/expressions exists, and no @actions/artifact copy was found. The README text the finding quotes ("File permissions are not maintained during artifact upload") matches the documented v4+ behaviour, but I could not read it from source. The downstream effects I did read from source. node-pty 1.1.0 passes `native.dir + '/spawn-helper'` as argv[0] to posix_spawn (lib/unixTerminal.js:29,96; src/unix/pty.cc:414,424). Orca resolves the packaged ripgrep by path, with no chmod and no PATH fallback when packaged (src/main/ripgrep/bundled-ripgrep-path.ts:25-47).
(3) Mitigations the finding misses. Orca chmods two of the three binaries at runtime. `preflightPtySpawn` and `preflightPtySpawnHealth` call `ensureNodePtySpawnHelperExecutable()` (orca/src/main/daemon/pty-subprocess/spawn-preflight.ts:126,243). That function does `chmodSync(candidate, mode | 0o755)` on spawn-helper when its mode has no x bit (src/main/providers/local-pty/local-pty-executable-spawn.ts:71-95). agent-browser's binary is chmodded 0755 on an access failure (src/main/browser/agent-browser/agent-browser-dependency-binary.ts:4-12). So "cannot spawn a PTY" and "cannot start agent-browser" hold only when the bundle files are not writable by the user, for example a root-owned install or App Translocation onto a read-only mount. That is runtime behaviour I cannot settle statically. Ripgrep has no such repair, so file search and listing would fail with EACCES if the modes are lost.
(4) No recorded live or gate result contradicts the finding. The macOS jobs have never run. WINDOWS 48 records that no build-macos job exists, that the macOS Gecko build is blocked, and that the macOS jobs are only shape-checked. The universal output is not uploaded or consumed, so in this milestone no user artifact carries the defect.
Severity: v1.7 ships Linux only. No macOS bundle job exists. The failure is latent in a code path for the next version, so I adjusted it to low from the review's critical. The fix is still needed before the macOS half lands.
D-40 covers this defect. D-40 moves the macOS Orca jobs, the macOS artifact and WINDOWS 48 to the next version and keeps their code in the tree. That defers the defect without refuting it.

## ci-supply-chain-01: Orca build jobs in the Release run can replace the release-linux artifact that sign-publish signs, because that artifact has no digest tied to the job that produced it

- **Severity:** medium
- **Verdict:** PLAUSIBLE
- **Location:** `.github/workflows/release.yml:1139`

**What is wrong.** v1.7 adds three hosted jobs to release.yml (windows-orca, macos-orca-arm64, macos-orca-x64) that run the pinned upstream Orca build: pnpm run rebuild:node, build:orcad, build:web, Orca's config/scripts, mobile generators and Vite. They run in the same workflow run as sign-publish. sign-publish downloads `release-linux` by name, checks only that the manifest's release_key matches the tree, then signs the MAR with the MAR key and publishes it to the update channel. build-linux exports no digest of release-linux; it outputs only `build`. Code in a hosted job runs as the runner user. It can rewrite the on-disk copy of a later action in its own job (actions/upload-artifact, already downloaded under _work/_actions at job set-up) and so obtain ACTIONS_RUNTIME_TOKEN. That token can delete and upload artifacts of the run. The windows-sidecar job uses a SHA256SUMS digest passed as a job output to defend against exactly this, but the Linux artifact has no such binding. The 'Linux ships alone' ruling and the comment 'a failure here never reaches a Linux job' cover failures only. A Windows or macOS Orca job can still change the Linux bytes silently. The exposure existed before v1.7 through windows-sidecar's Theia build. v1.7 adds three more jobs that build an upstream which moves every week (D-26).

**Scenario.** A compromised Orca tag, or a compromised npm package in Orca's lockfile at that tag, reaches main through the weekly re-pin. On the next Release dispatch, build code running in windows-orca patches _actions/actions/upload-artifact/<sha>/dist/upload/index.js. When that step runs, the patched code takes ACTIONS_RUNTIME_TOKEN and sends it out, or waits with it. After build-linux uploads release-linux, the attacker uses the token to delete it and upload a tarball, MAR and manifest of their own with the correct release_key. The owner approves the release environment, and sign-publish signs and publishes the attacker's MAR. Every installed client then applies it as a valid signed update.

**Preconditions.** Malicious code in the pinned Orca tag or its locked dependencies (actor f), merged by the weekly re-pin. The ACTIONS_RUNTIME_TOKEN has to stay usable until build-linux has uploaded, either because the attacker's job is still running then or because the token works after its job ends.

**Evidence.** release.yml:1138-1142 `- name: Download the release artifacts (untrusted data, copied and signed, never executed)\n uses: actions/download-artifact@... with: name: release-linux` followed by release.yml:1151-1152 (only `jq -r .release_key` is compared) and release.yml:1205 `Sign the complete MAR`. Producer side: release.yml:217-228 uploads release-linux with no digest output (build-linux outputs only `build: ${{ steps.key_gate.outputs.build }}`, line 78). Untrusted code in the same run: release.yml:449-455 (windows-orca `bash scripts/fetch-orca.sh; bash scripts/build-orca.sh`), 2148-2153 and 2263-2268 (macOS). Contrast the windows-sidecar pattern: `sums_sha256` output plus `check-win-sidecar.sh check` (release.yml:353, 910).

**Suggested fix.** Bind release-linux to build-linux the same way the hosted sidecar is bound: have build-linux write SHA256SUMS over the uploaded files and export its sha256 as a job output. sign-publish then runs check-win-sidecar.sh check (or an equivalent) on the downloaded directory before any signing step. Better still, move the Orca and sidecar builds into a separate workflow run whose artifacts sign-publish fetches only by run id and verified digest, so no code that runs upstream builds shares a run with the MAR-signing job.

**Verifier (PLAUSIBLE, medium).** Most of the cited code is as described. sign-publish (release.yml:1087-1092, needs only build-linux) downloads `release-linux` by name (1138-1142). It checks the manifest release_key against the tree (1151-1152), the manifest update_channel and the MAR channel (1184-1203), then signs (1205-1220). It assembles assets straight from release/ (1242-1259), and the attestation at 1261 covers whatever was downloaded. build-linux exports only `build` (78) and uploads release-linux with no digest output (217-228). windows-orca (376-491) and the macOS Orca jobs have no needs edge and run the same scripts/build-orca.sh in the same run. By contrast, windows-orca's own output is bound by sums_sha256 (382, 472-480). So the finding is right that no digest ties release-linux to build-linux.

The headline scenario fails test (4): its precondition already gives the attacker the capability. The same pinned Orca tag and lockfile are built inside build-linux itself (release.yml:169-174). That build runs `nix develop .#orca --command bash scripts/build-orca.sh` on legion as the runner user, in the workspace that is later packaged and uploaded. build-orca.sh:194-223 runs pnpm install, build-workspace-packages, rebuild:node, the mobile generators, build:mobile-web, build:orcad and build:web. Malicious code in Orca's source, or in any dependency that runs or bundles on Linux, can therefore change the Linux tarball and MAR directly before the upload at 217. It can also ship itself, because package-linux.sh:23-33 and 73 put out/orcad and out/web into the Linux package. A compromised Orca tag already reaches every Linux client as signed code, with no token theft and no artifact swap. The same applies to windows-sidecar's Theia build (it uses the same theia lockfile as build-linux:164). The workflow header (lines 6-9) states the design: release-linux is untrusted data, and the protection is the owner's approval of the release environment, not where the bytes came from.

What remains is narrower. A dependency that is installed or run only on win32 or darwin would run in windows-orca or the macOS Orca jobs and never in build-linux. Examples are a platform-gated optional binary such as a win32 rollup, esbuild or lightningcss binary that Vite calls during the build. For that actor the cross-job path is real, and the 'Linux ships alone' comments (264, 375) cover only failures, not tampering. It still depends on runtime behaviour I cannot settle statically: whether the ACTIONS_RUNTIME_TOKEN taken in windows-orca can still delete and re-upload the run artifact `release-linux` after build-linux uploads it. windows-orca has a 90-minute timeout (378). build-linux runs a Gecko build of roughly 50 minutes plus the Theia, Orca and container steps, with a 240-minute timeout (74). The attacker therefore needs the token to stay valid after its own job ends, or the timings to overlap. Whether a run-scoped artifact token can delete an artifact another job created is also runtime behaviour.

Severity is medium, not high. The general precondition is equivalent to the gain, so this is a defence-in-depth gap: build-linux exports no release-linux digest for sign-publish to check, the way sums_sha256 is checked for Windows. It matters only for a platform-gated dependency compromise and only with an unconfirmed token lifetime. *Checked at:* .github/workflows/release.yml:169-174 (build-linux itself runs scripts/build-orca.sh on the same Orca pin, before the release-linux upload at 217-228). scripts/build-orca.sh:194-223 (the Orca build steps). powerbrowser/packaging/package-linux.sh:23-33,73 (Orca's out/orcad and out/web ship in the Linux package). Confirming evidence: release.yml:78 (only `build` is exported), 1138-1152 (download by name, release_key check only), 376-382 (windows-orca has no needs edge, same run)

## ci-supply-chain-02: Pinned Orca build code runs unsandboxed on the persistent self-hosted runner legion, outside the release container

- **Severity:** medium
- **Verdict:** CONFIRMED
- **Location:** `.github/workflows/release.yml:174`
- **Owner decision cited:** D-26

**What is wrong.** build-linux runs on legion, a non-ephemeral self-hosted runner (user pb-runner, work dir /var/lib/pb-runner, kept between jobs). The Gecko build runs inside a rootless podman container that is rebuilt every release from a digest-pinned base. The new Orca step instead runs `nix develop .#orca --command bash scripts/build-orca.sh` directly on the host, and that executes Orca's own build scripts. The orca-packaged-tree row then imports orca/src/shared/*.ts on the host (scripts/lib/orca-artifacts.mjs importTs), which also executes Orca code. build-windows on legion fetches Orca and imports the same TypeScript inside the container. The Orca pin advances weekly through bot PRs with auto-merge armed (D-26). Code running as pb-runner persists between jobs and can read the runner's registration credentials in its state directory. It can therefore tamper with every later build-linux output. sign-publish treats that output as data and signs it without checking its content, and sign-windows signs what legion stages. Compromise of legion is therefore equal to compromise of the Linux update channel, and the docs already state it is equal to the Windows signing identity. Threat T-68-SC states that Orca's build runs 'only in the read-only job'. That holds inside the release train but not in release.yml.

**Scenario.** A malicious Orca release, such as a typosquatted dependency added to Orca's pnpm-lock.yaml, is re-pinned and merged. The next release dispatch runs build-orca.sh on legion as pb-runner. The build code installs a persistent hook (for example a modified file under /var/lib/pb-runner, or by taking the runner's .credentials and registering an impostor). Every later release then gets a backdoored tarball or MAR that sign-publish signs and ships to all installed clients.

**Preconditions.** Compromised upstream Orca tag or locked dependency (actor f), merged through the weekly re-pin PR with the owner's approval.

**Evidence.** release.yml:169-174 `- name: Build Orca from source at the pin (orcad, web client) ... bash scripts/fetch-orca.sh\n nix develop .#orca --command bash scripts/build-orca.sh` (host shell), versus release.yml:176-188 where the Gecko build runs in `podman run --rm ... pb-gecko-build`. build-orca.sh:194-223 runs `pnpm run rebuild:node`, `node config/scripts/build-workspace-packages.mjs`, `node mobile/scripts/*.mjs`, `pnpm run build:mobile-web/build:orcad/build:web`. release.yml:212 adds row `orca-packaged-tree`, whose verify-orca-packaged-tree.mjs:211 calls orcaArtifactTables(join(REPO_ROOT,'orca')), and orca-artifacts.mjs:55 `return await import(pathToFileURL(file).href);`. docs/RELEASING.md:47 and 342-346 describe legion as non-ephemeral.

**Suggested fix.** Build Orca for Linux on a GitHub-hosted runner, as windows-orca and the macOS jobs already do, and pass it to build-linux as data admitted by a SHA256SUMS digest output. Alternatively, run build-orca.sh and the orca-packaged-tree import inside the rootless podman container that is rebuilt from the pinned base, with no network after install. Replace the TypeScript import in orca-artifacts.mjs with a parse that does not execute the module, at least wherever it runs on legion.

**Verifier (CONFIRMED, medium).** I traced the code path and it holds. release.yml:169-174 runs `bash scripts/fetch-orca.sh` and then `nix develop .#orca --command bash scripts/build-orca.sh` in the host shell of the build-linux job on legion. Only the Gecko build (release.yml:183-188) and packaging (:199-202) run in `podman run --rm ... pb-gecko-build`. `nix develop` only sets up the environment and does not isolate anything.

build-orca.sh uses `--ignore-scripts` for both installs (:194, :202), so lifecycle scripts are off. It still executes Orca-controlled code and locked-dependency code on the host:
- `node config/scripts/build-workspace-packages.mjs` (:195)
- `pnpm run rebuild:node` (:196), which is a native rebuild
- three `node mobile/scripts/*.mjs` generators (:206-208)
- `pnpm run build:mobile-web`, `build:orcad` and `build:web` (:209-223), which run Orca's package.json scripts and bundler configs

The orca-packaged-tree row (release.yml:212, registered at verify-platform.sh:6788) also runs on the host. It calls `orcaArtifactTables(join(REPO_ROOT,'orca'))` (verify-orca-packaged-tree.mjs:211), and `importTs` does a dynamic `import()` of `orca/src/shared/*.ts` (orca-artifacts.mjs:55), which executes that module's top level.

What reaches this path:
- The pin advances through bot PRs with auto-merge armed (release-train.yml:1059, :1147; D-26).
- The owner's approving review and main-review are the only gates.
- The header of rebase-orca.yml says "This is the only job that runs Orca's code". The `T-68-SC` rows (68-02-PLAN.md:304) say "only in the read-only job". Both are contradicted by release.yml.
- docs/RELEASING.md:342-346 and :1968-1969 confirm legion is non-ephemeral and keeps /var/lib/pb-runner between jobs.
- The pre-job hook (RELEASING.md:381-388) refuses only run shape (ref, event, BASH_ENV and similar). It does not sandbox anything.
- The registration-token file and the MAR key store are stated to be unreadable by pb-runner (RELEASING.md:376-379, :1146). That limits credential exposure but does not block host execution.

Two runtime steps I cannot settle statically:
- whether the runner's own `.credentials` and `.credentials_rsaparams` in its state directory are readable by job processes (this is standard for a same-uid NixOS github-runner);
- which persistence location survives `actions/checkout`'s clean.

Why medium and not high: the precondition is a malicious Orca release or locked dependency merged with the owner's approval. That compromise already backdoors the shipped product on its own, because orcad and the web client built from that code ship in the tarball that sign-publish signs, so a container would not prevent it. What host execution adds is persistence on legion across later releases (after the bad pin is reverted), possible theft of the runner registration credentials, and tampering with what legion stages for sign-windows.

The weakness is not new in kind. Theia's `yarn build` and the `node-gyp rebuild` of drivelist already run on the same host (release.yml:164-166). Orca makes it worse, because a dependency graph that changes weekly now runs on the persistent host. This is a defence-in-depth gap with a concrete path, plus a threat-model statement that is false for release.yml. It is not a boundary an outside attacker can cross without first compromising upstream and getting the owner to merge. *Checked at:* .github/workflows/release.yml:169-174 (host-shell build-orca.sh, outside the podman container at :183-188); scripts/build-orca.sh:195-223 (Orca build code executed); scripts/lib/orca-artifacts.mjs:55 via scripts/verify-orca-packaged-tree.mjs:211 and release.yml:212 (host import of Orca TS); docs/RELEASING.md:342-346,1968-1969 (non-ephemeral runner); release-train.yml:1059,1147 (auto-merge armed, owner review is the gate); contradicts rebase-orca.yml header and 68-02-PLAN.md:304 T-68-SC

## 68-CR-02: The Windows sidecar build always fails: download-plugins.mjs now runs spawnSync('npm', ...) on windows-latest

- **Severity:** medium (reviewer label: critical)
- **Verdict:** PLAUSIBLE
- **Location:** `scripts/download-plugins.mjs`
- **Owner decision cited:** D-40

*Section CR-02 of `.planning/workstreams/orca/phases/68-three-os-artifacts-weekly-re-pin-and-upstream-seams/68-REVIEW.md`, verbatim:*

**File:** `scripts/download-plugins.mjs:127-128` (also `:241`); reached from `.github/workflows/release.yml:319-325` (windows-sidecar `yarn build` → `applications/browser` `download:plugins`)
**Issue:** The 68-09 assembly loop runs `npm ci` for every `bundled-extensions/<folder>/`, and `claude-agent-sdk` is always present. It calls `spawnSync('npm', [...], { cwd: scratch })` with no `shell`. On Windows, libuv resolves an extensionless command only as `<name>.com` and `<name>.exe`. setup-node installs npm as `npm.cmd`, `npm.ps1` and a POSIX `npm` script, none of which matches. The result is `r.status === null`, with `r.error` set to `ENOENT`. Since the Node CVE-2024-27980 fix, a `.cmd` cannot be spawned without `shell: true` either.

The code then calls `die('... npm ci failed: spawnSync npm ENOENT')`, so the `windows-sidecar` job fails at `yarn build`. `build-windows` and `sign-windows` never run, and PLAT-01's Windows artifact cannot be produced. Before 68-09, the only `npm` and `.bin/theia` spawns in this script ran only for declared `[[extensions]]`, and `configuration.toml` declares none, so the Windows path never reached them. The new spawn is unconditional.
**Fix:** Run npm's own JS entry through the running Node, which works on every OS and needs no shell:
```js
const npmCli = process.env.npm_execpath && /npm-cli\.js$/.test(process.env.npm_execpath)
    ? process.env.npm_execpath
    : join(dirname(process.execPath), process.platform === 'win32' ? '' : '../lib', 'node_modules', 'npm', 'bin', 'npm-cli.js');
const r = spawnSync(process.execPath, [npmCli, 'ci', '--ignore-scripts', /* ... */], { cwd: scratch, encoding: 'utf8' });
```
Apply the same change at `:241` (`pack`). Then add a `win32` assertion to the `bundled-extensions` row: the script must contain no bare `spawnSync('npm'`.

**Verifier (PLAUSIBLE, medium; scope: windows build (release.yml windows-sidecar -> build-windows -> sign-windows); Linux product unaffected).** (1) The cited code exists as described. Line 127 runs spawnSync('npm', ['ci', '--ignore-scripts', ...], { cwd: scratch, encoding: 'utf8' }) with no shell option. Line 129 throws when r.status !== 0, using r.stderr || r.error?.message. The catch at :150-152 calls die(), which does process.exit(1). The loop goes over every bundled-extensions/<folder> that has a package.json. bundled-extensions/claude-agent-sdk/ is tracked and has one, so the spawn always happens. Commit 48b41481 (68-09) added it.

(2) How the build gets there: release.yml windows-sidecar has runs-on: windows-latest (:265) and runs `cd theia; yarn build` (:319-325). theia/package.json `build` runs `yarn --cwd applications/browser build`. That script is `yarn -s rebuild && yarn -s download:plugins && theia build`, and download:plugins is `node ../../../scripts/download-plugins.mjs`. theia/applications/browser/package.json has no theiaPlugins block, and configuration.toml has no [[extensions]]. So `declared` is empty, and the stock `.bin/theia` spawn (:70) and pack() (:241) are never reached. The review's claim that only the new spawn is unconditional is correct. `defaults.run.shell: bash` has no effect: spawnSync without `shell` goes straight to libuv's CreateProcess path, not through bash. Node's spawnSync does not throw on ENOENT. It returns status null with `error` set, so line 129 throws and die() exits 1. yarn build then fails, and so does the windows-sidecar job.

(3) Nothing else prevents the failure. No other configuration, environment variable or build step bypasses the loop. On Windows, `existsSync(bundledRoot)` is true for the checked-out tree.

(4) No recorded result contradicts the finding. No hosted Windows run is on record: 68-10-SUMMARY.md:289 says "hosted Windows runs are shape-checked only, first real run deferred". Upstream Orca's own config/scripts/pnpm-cli-invocation.mjs corroborates the Windows behaviour: on win32 it falls back to command 'pnpm.cmd' with shell: true, which is the handling an extensionless spawn needs.

The step I cannot settle from source on disk: libuv's Windows search_path (src/win/process.c). It tries a name without an extension only as <name>.com and <name>.exe, and Node (since the CVE-2024-27980 fix) refuses .cmd/.bat without shell. Together these mean that no `npm.com` or `npm.exe` is on the windows-latest PATH, and so the spawn returns ENOENT. Only libuv headers are in /nix/store, not the Windows process.c source. The runner image's PATH contents are also runtime state. Both points are well documented and consistent with Orca's upstream workaround, but neither can be proven from files on disk.

Severity: medium. This is a CI/build path that fails, and only the Windows artifact path is affected. The windows-sidecar job feeds only build-windows ("a failure here never reaches a Linux job", release.yml:263), and D-40 removes Windows from v1.7's supported platforms, so this is not high.

D-40 covers this defect. It moves "the macOS and Windows halves of PLAT-01 and PLAT-02" to the next version, naming build-windows, which needs windows-sidecar. The defect is therefore deferred, not refuted. The fix (run npm-cli.js through process.execPath, at :127 and :241) is still owed before the first real Windows run.

## 68-CR-01: Every hosted re-pin replay stops at "row licence-allowlist skipped" because the uBlock XPI is never cached on the runner

- **Severity:** medium (reviewer label: critical)
- **Verdict:** CONFIRMED
- **Location:** `scripts/rebase-orca.sh`

*Section CR-01 of `.planning/workstreams/orca/phases/68-three-os-artifacts-weekly-re-pin-and-upstream-seams/68-REVIEW.md`, verbatim:*

**File:** `scripts/rebase-orca.sh:55,67-69,218-227`; emitter `scripts/verify-licence-allowlist.mjs:273,303,508`; runner `.github/workflows/rebase-orca.yml:98-106`
**Issue:** `stage_rows` runs `verify-platform.sh --only licence-allowlist` and turns any SKIP line red unless it matches `SKIP_OUT_OF_SCOPE='^licence-allowlist: SKIP -- upstream/ absent'`. Since 68-08 (d8643e27), the default mode of `verify-licence-allowlist.mjs` also calls `bundledCheck` (`:508`). `cachedXpiFirstLine` (`:273`) looks for `.mozbuild/bundled-xpi/uBlock0@raymondhill.net-1.76.0.xpi`. When that file is absent it pushes `licence-allowlist: SKIP -- uBlock0@raymondhill.net 1.76.0 is not cached in .mozbuild/bundled-xpi/; ...` (`:303`), and the row still exits 0.

On the `rebase-orca.yml` runner, `.mozbuild/` is a fresh, git-ignored directory. Nothing in the workflow or in `rebase-orca.sh` runs `stage-bundled-xpi.sh`, so the XPI is never there. `skip_line` therefore returns that line every time, and the replay stops with `rebase-orca: FAIL -- row licence-allowlist skipped: ...`. The release train then opens a "stopped" tracking issue for every new Orca tag, and OVL-02 ("re-pins by itself") cannot be met.

The self-test stays green because its `verify-platform.sh` stand-in (`:416-425`) never emits the bundled-extension leg. Its only out-of-scope case (`upstreamskip`, `:462`) is the `upstream/` one.
**Fix:** Do not widen the exemption, because a SKIP really proves nothing there. Give the row what it needs: before `stage_rows`, stage the pinned XPI into the cache. The download is sha256-pinned and runs no code.
```bash
stage_xpi_cache() {
  say "xpi cache"
  local d; d="$(mktemp -d)"
  capture bash "$1/powerbrowser/packaging/stage-bundled-xpi.sh" "$d"
  rm -rf "$d"
  [ "$RC" -eq 0 ] || { red "xpi cache stage-bundled-xpi.sh exited $RC"; return 1; }
}
# run_replay, full mode: ... stage_coverage "$root" || return 1; stage_xpi_cache "$root" || return 1; stage_rows ...
```
Also make the fixture's `verify-platform.sh` stand-in print the real bundled-extension SKIP line when a fixture cache file is absent. Add a plant that must stop at `row licence-allowlist skipped`, and a control that stages the cache and must pass.

**Verifier (CONFIRMED, medium; scope: ci).** I traced the whole path from source.

1. **What the row does.** rebase-orca.sh puts licence-allowlist in ROWS (:50). stage_rows (:218-227) runs `verify-platform.sh --only <label>` through capture, which merges stderr into stdout. It then calls skip_line(OUT), which matches any line containing the word SKIP. The only exemption is the regex `^licence-allowlist: SKIP -- upstream/ absent`. Any other SKIP line stops the replay with `red "row $label skipped: ..."`.

2. **verify-platform.sh passes the output through unchanged.** The licence-allowlist row (:3886) is `node $REPO_ROOT/scripts/verify-licence-allowlist.mjs`. The run loop (:6963-6990) runs it with `setsid $cmd &` and inherited stdio, so the child's lines reach capture as they are. The row's PASS/FAIL depends only on the exit status.

3. **The script emits a SKIP for a missing cache.** In default mode (:508), verify-licence-allowlist.mjs calls `bundledCheck(allowList, bundledInputs(REPO_ROOT), cachedXpiFirstLine...)`.
   - bundledInputs reads powerbrowser/packaging/bundled-xpi.json, which pins uBlock0@raymondhill.net 1.76.0.
   - inventory/licence-allowlist.json:65-73 has a gecko-distribution row for that id.
   - cachedXpiFirstLine (:273-278) returns null when `.mozbuild/bundled-xpi/uBlock0@raymondhill.net-1.76.0.xpi` does not exist.
   - bundledCheck (:303) then pushes `licence-allowlist: SKIP -- uBlock0@raymondhill.net 1.76.0 is not cached in .mozbuild/bundled-xpi/; ...` (NAME is 'licence-allowlist', :58).
   - render() prints that line and exits 0, because a SKIP is not a FAIL. The line does not match SKIP_OUT_OF_SCOPE, so skip_line returns it.

4. **Nothing stages the cache on the hosted runner.**
   - .gitignore:42 ignores `.mozbuild/`, and git ls-files shows nothing under it, so the actions/checkout workspace starts without it.
   - rebase-orca.yml has five steps before the replay: checkout, free disk, install Nix, brand scan, then rebase-orca.sh. None of them fetches or stages the XPI.
   - In rebase-orca.sh, run_replay full mode (:269-281) runs pin-move, fetch, seam-apply, build, three typechecks, coverage, then rows. None of these stages the XPI.
   - A repo-wide grep finds only package-linux.sh, package-windows.sh and package-macos.sh calling stage-bundled-xpi.sh (the only writer of the cache, which downloads with curl). Neither build-orca.sh, fetch-orca.sh nor the flake references it.

5. **The recorded evidence does not contradict this.** STATE.md:162 (da97a4e9, 2026-11-18) records a local identity re-pin PASS with "6 rows green". That run was on the owner's host, and this worktree has `.mozbuild/bundled-xpi/uBlock0@raymondhill.net-1.76.0.xpi` (dated Nov 11, after 68-08's d8643e27 on Nov 10). That cached file is why the local run did not SKIP. No hosted rebase-orca.yml run is recorded anywhere. 68-VERIFICATION.md:22/:147 say the hosted path is "not yet run live". The self-test fixture never produces the bundled SKIP line, so its PASS proves nothing about this path.

6. **One nuance.** On a hosted run, a stage before stage_rows, or one of the earlier rows (orca-build-shape … orca-mobile-protocol), could fail first. In that case the run would stop there instead. Either way, a hosted replay can never reach "replayed" while this row behaves as described. So the claim holds: the automatic re-pin (OVL-02) cannot succeed on the runner.

7. **Severity: medium.** A CI/release-train path fails closed: it opens a stop issue and no bump PR. Nothing ships wrongly and no boundary is crossed.

8. **Owner decision: none applies.** D-59 moves the first weekly re-pin tick to the next version. That postpones the run that would expose the defect, but it neither accepts nor defers the defect itself.

## 64-WR-05: build-orca-panes.sh's `eval "$(node ...)" || fail` cannot detect a failed node step

- **Severity:** warning (not refutation-checked)
- **Verdict:** REPORTED
- **Location:** `scripts/build-orca-panes.sh`

*Section WR-05 of `.planning/workstreams/orca/phases/64-orca-panes-as-powerbrowser-tabs/64-REVIEW.md`, verbatim:*

**File:** `scripts/build-orca-panes.sh:72-79`
**Issue:** The exit status of `eval "$(cmd)"` is the status of the evaluated text, not of `cmd`. If the node one-liner fails (a moved `config/scripts/*.mjs` after an Orca re-pin, or a renamed export), the command substitution yields an empty or partial string, `eval ""` returns 0, and `set -e` does not fire. The `fail "could not read Orca's build environment"` branch is unreachable. The build then continues without Orca's rolldown thread limit and old-space option, which is the case that line exists to prevent.
**Fix:**
```bash
build_env="$(node --input-type=module -e '...')" || fail "could not read Orca's build environment (config/scripts)"
eval "$build_env"
```

## Info

## 60-WR-01: build-orca.sh forwards inherited TAG/COMMIT to fetch-orca.sh, then reports configuration.toml's pin as what it built

- **Severity:** warning (not refutation-checked)
- **Verdict:** REPORTED
- **Location:** `scripts/build-orca.sh`

*Section WR-01 of `.planning/workstreams/orca/phases/60-orca-from-source-on-theia-s-node/60-REVIEW.md`, verbatim:*

**File:** `scripts/build-orca.sh:72`, `scripts/build-orca.sh:234-236`
**Issue:** Step 1 runs `bash "$REPO_ROOT/scripts/fetch-orca.sh"` with the caller's whole environment. fetch-orca.sh treats an exported `TAG` (with `COMMIT`) as a re-pin override (fetch-orca.sh:197-218). These are generic variable names, and this repo's own workflows already export them at job level (release-train.yml:1068-1069 `TAG:`/`COMMIT:` in bump-pr-orca). rebase-orca.sh:119 deliberately runs `env -u TAG -u COMMIT` before fetch-orca.sh for this reason, but build-orca.sh does not.
- If a caller has `TAG` exported without `COMMIT`, every build fails at fetch-verify with a message about a re-pin nobody asked for.
- If both are exported, the overlay and build run against a tree verified at the override pin. Lines 235-236 then source generated/upstream-pins.env and print `PASS -- built $UPSTREAM_ORCA_TAG ($UPSTREAM_ORCA_COMMIT)`, which names configuration.toml's pin, not the tree that was built.
- If the fragment is absent in that case, the `.` at line 235 fails under `set -e` after the whole build has finished, and no `build-orca: FAIL` line is printed.
**Fix:** Make the pin build-orca.sh verifies the configuration pin. Read it once at the start and report the same values at the end:
```bash
# step 1
[ -f "$REPO_ROOT/generated/upstream-pins.env" ] || fail "generated/upstream-pins.env is missing; run node scripts/generate.mjs"
# shellcheck source=/dev/null
. "$REPO_ROOT/generated/upstream-pins.env"
run_step fetch-verify env -u TAG -u COMMIT bash "$REPO_ROOT/scripts/fetch-orca.sh"
...
echo "build-orca: PASS -- built $UPSTREAM_ORCA_TAG ($UPSTREAM_ORCA_COMMIT) ..."
```

## 60-WR-03: The ORCA_* / NODE_OPTIONS scrub runs after the fetch and overlay steps it is documented to cover

- **Severity:** warning (not refutation-checked)
- **Verdict:** REPORTED
- **Location:** `scripts/build-orca.sh`

*Section WR-03 of `.planning/workstreams/orca/phases/60-orca-from-source-on-theia-s-node/60-REVIEW.md`, verbatim:*

**File:** `scripts/build-orca.sh:16-18`, `scripts/build-orca.sh:72-146`, `scripts/build-orca.sh:168-172`
**Issue:** The header says this tree is worked on from inside Orca desktop, "whose variables must never reach the build". The scrub (step 3, lines 170-172) runs only after the following, all with the inherited `NODE_OPTIONS`, `ELECTRON_RUN_AS_NODE`, `NODE_REPL_EXTERNAL_MODULE` and every `ORCA_*` variable:
- step 1 (fetch-orca.sh)
- step 1b: `node -e` reading seams.json (line 86) and `scripts/apply-patches.sh` writing into orca/ (line 112)

An inherited `NODE_OPTIONS=--require ...` loads into the seams.json reader. The `--panes-only` path exits at line 154 and never reaches build-orca.sh's scrub at all; it relies on build-orca-panes.sh:66-67 and build-orca-browser-host.sh:53-54 scrubbing for themselves. The invariant holds in those two scripts only because each one re-implements it.
**Fix:** Move step 3 (and the `ELECTRON_SKIP_BINARY_DOWNLOAD` and corepack knobs, if desired) to just after `exec > >(tee ...)`, before step 1, so both paths scrub before any child process starts:
```bash
for name in "${!ORCA_@}"; do unset "$name"; done
unset ELECTRON_RUN_AS_NODE NODE_OPTIONS NODE_REPL_EXTERNAL_MODULE
if env | grep -q '^ORCA_'; then fail "scrub: an ORCA_ variable survived the scrub"; fi
run_step fetch-verify ...
```

## Info

## 68-WR-03: The PR body and test command are derived from the pinned tree, not from the main the PR targets

- **Severity:** warning (not refutation-checked)
- **Verdict:** REPORTED
- **Location:** `scripts/export-orca-seam-pr.mjs`

*Section WR-03 of `.planning/workstreams/orca/phases/68-three-os-artifacts-weekly-re-pin-and-upstream-seams/68-REVIEW.md`, verbatim:*

**File:** `scripts/export-orca-seam-pr.mjs:131-136`
**Issue:** `exportSeams` reads `.github/pull_request_template.md` and `AGENTS.md` from `orcaDir` (the pinned `orca/`) and then applies the seams to a fresh clone of Orca's `main` (`fetchMain`). The pin trails `main` by up to a week at best. When the hand-off is deferred to the end-of-milestone pass, the gap is much longer. If `main` changed its template headings or its Test line, then `pr.md` passes `checkHeadings` against the stale template, but the PR does not match the template Orca's maintainers enforce. P68-18 records that an outside contributor's PR that does not follow it is ignored. The self-test cannot catch this, because its fixture uses one directory as both the pinned tree and main.
**Fix:** Read both files from the `main` clone after `fetchMain`: `readFileSync(join(main, TEMPLATE_REL))` and `readFileSync(join(main, AGENTS_REL))`. Add a self-test plant in which the main fixture adds a heading the pinned fixture lacks, and require `pr.md` to carry it.

## 68-WR-01: sign-windows signs Orca PE files by name only, although the admitted SUMS gives their exact hashes

- **Severity:** warning (not refutation-checked)
- **Verdict:** REPORTED
- **Location:** `scripts/win-sign-list.mjs`

*Section WR-01 of `.planning/workstreams/orca/phases/68-three-os-artifacts-weekly-re-pin-and-upstream-seams/68-REVIEW.md`, verbatim:*

**File:** `scripts/win-sign-list.mjs:137-169`; call site `.github/workflows/release.yml:910-912`
**Issue:** `orcaChecks` compares names only. A file under `orca/` in legion's zip whose name matches a SUMS entry is listed for Authenticode signing whatever its bytes are. The PE classification itself (`startsMz(join(root, r))`, `:146,161`) is read from the untrusted staged file, not from the admitted artifact that sign-windows has already downloaded and re-admitted (`:910`).

Two consequences:
- Legion can swap `orca/out/orcad/node_modules/node-pty/build/Release/pty.node` for any PE of the same name, and the job signs it.
- A `.node` PE addon listed in SUMS but absent from the staged tree is not "required" (`presentSet.has(r)` is false), so its absence is never reported.

For the Gecko half, names are all the tree can give (the accepted SEC-12 risk). For `orca/`, `package-windows.sh:83-84` copies the admitted files byte for byte, so hash equality is available at no cost and would close the gap for every Orca PE.
**Fix:** Pass the admitted directory and require hash equality:
```js
// --orca-sums windows-orca/SHA256SUMS --orca-dir windows-orca
const want = new Map(listed.map(l => [l.path, l.sha]));               // from the SUMS lines
const isPe = r => PE.test(r) || startsMz(join(orcaDir, r));             // classify from the admitted copy
const required = new Set([...want.keys()].filter(isPe));
for (const f of actual) if (sha256(join(root, f)) !== want.get(f)) failures.push(`changed: ${ORCA}${f} differs from the admitted windows-orca bytes`);
```
Add plants for a same-name PE with different bytes and for an absent `.node` PE.

## ci-supply-chain-06: Upstream build output can write the text of the Orca stop issue

- **Severity:** low
- **Verdict:** CONFIRMED
- **Location:** `.github/workflows/rebase-orca.yml:122`

**What is wrong.** The stage output is the first log line that starts with 'rebase-orca: FAIL -- '. The log includes everything Orca's build, typecheck and probes print, because capture() echoes their output. A hostile upstream can print such a line with any text and then exit non-zero. The report job writes that text into an issue created with the job token, in the repository's release-train label set. The text can carry @mentions, links and misleading 'Next step' instructions. It is a single line, so GITHUB_OUTPUT cannot be split.

**Scenario.** Orca's build prints 'rebase-orca: FAIL -- build: security regression, see https://evil.example/fix.sh and run curl ... | sh @owner' and exits 1. The tracking issue 'release-train: orca vX.Y.Z stopped' shows that text as the stage, next to the official run URL.

**Preconditions.** Compromised upstream Orca tag (actor f).

**Evidence.** rebase-orca.yml:122 `LINE=$(grep -m1 '^rebase-orca: FAIL -- ' "$RUNNER_TEMP/rebase.log" ...)`; rebase-orca.sh:73-74 `OUT="$("$@" 2>&1)" ... printf '%s\n' "$OUT"`; release-train.yml:1700 `printf '...Stage: \`%s\`...' "$TAG" "$STAGE"`.

**Suggested fix.** Have rebase-orca.sh write its own stage line to a separate file descriptor or file that composed commands cannot write to, and read the stage from there. Restrict the published stage to the stage keyword plus a [A-Za-z0-9_./:@ -] detail of bounded length.

**Verifier (CONFIRMED, low).** capture() (rebase-orca.sh:72-75) prints the full combined output of each captured command before the stage's own red line (64), and the workflow tees stdout and stderr to rebase.log (rebase-orca.yml:106). stage_typecheck runs Orca's own package script (rebase-orca.sh:177, orca_pnpm_run 289-291) through capture, so a hostile tag can print a column-0 line beginning 'rebase-orca: FAIL -- ' and exit non-zero. That line precedes PB's own red line, and grep -m1 at rebase-orca.yml:122 selects it as the stage output. The report job passes it through env (no expression injection) and printf %s into the issue body inside a single-backtick code span (release-train.yml:1700). It then creates or edits 'release-train: orca <tag> stopped' with the job token (1701-1707). The code span would neutralise links and mentions, but nothing strips backticks from STAGE. A line containing a backtick closes the span, so markdown links, @mentions and false 'Next step' text render in the issue next to the real run URL. A newline cannot be injected because grep returns a single line and GITHUB_OUTPUT is written with echo. The precondition (a compromised upstream tag) already includes code execution in a CI runner, so the incremental harm is a phishing-capable issue body. Low. *Checked at:* rebase-orca.sh:64,72-75,177; rebase-orca.yml:106,122-123; release-train.yml:1689-1707 (STAGE inserted into `%s` with no backtick sanitising)

## ci-supply-chain-03: The green re-pin replay that auto-merge relies on is reported by the upstream code it is meant to check

- **Severity:** low
- **Verdict:** CONFIRMED
- **Location:** `.github/workflows/release-train.yml:1176`
- **Owner decision cited:** D-26

**What is wrong.** bump-pr-orca arms `gh pr merge --auto` when rebase-orca reports stage `replayed`. That stage is decided in the job that installs and runs the new Orca tag. The typecheck:web and typecheck:node commands are scripts from Orca's own package.json. tsc, Vite and every build tool come from Orca's lockfile at the new tag. During the replay step, Orca code can also write $GITHUB_ENV (for example BASH_ENV) or edit the workspace to steer the later 'Name the stage' and 'notices' steps. The PR's required `verify` check builds nothing (verify.yml), and no other workflow builds Orca, so nothing outside the job under test runs the new code. The only remaining gate is the owner's approving review (main-review), and the diff it shows is a pin hash and regenerated seam context. A review of that diff cannot see what changed upstream. T-68-12 ('vacuous green replay') covers SKIP lines but not a green result forged by hostile upstream code.

**Scenario.** An Orca tag whose package.json sets `"typecheck:web": "exit 0"`, or whose build does harmful work and still exits 0, makes rebase-orca report `replayed` with notices `unchanged`. bump-pr-orca publishes chore/orca-<tag> with auto-merge armed and a body that states the typecheck, rows, orcad and brand scan all passed. Once the owner approves, it merges, and the next release builds the tag (see the legion and artifact findings).

**Preconditions.** Compromised upstream Orca tag (actor f).

**Evidence.** release-train.yml:1061 `if: ${{ !inputs.dry-run && needs.rebase-orca.outputs.stage == 'replayed' }}`; release-train.yml:1176 `gh pr merge "$PR" --auto --merge`; rebase-orca.yml:112-120 `if [ "$OUTCOME" = "success" ]; then echo "stage=replayed"`; rebase-orca.sh:177 `capture eval 'cd "$root/orca" && "$run" "$script"'` (Orca's own scripts); rebase-orca.sh:289-291 `corepack pnpm ... run "$1"`. verify.yml has no Orca build (only rebase-orca.yml, release-train.yml and release.yml reference orca).

**Suggested fix.** Treat `replayed` as a compatibility signal, not a security signal, and say so in the PR body. Do not arm auto-merge for an upstream code change. Show the owner the upstream compare link and commit range from the old pin to the new one in the PR body. Optionally require a second signal computed outside the job that runs the code (for example a check that Orca's lockfile adds no new packages, run in bump-pr-orca over git data only), and arm auto-merge only when the lockfile is unchanged.

**Verifier (CONFIRMED, low).** The cited path exists. rebase-orca.yml:118-120 writes stage=replayed whenever the replay step's outcome is success. That step (rebase-orca.yml:104-106) runs Orca's own package scripts through rebase-orca.sh:177 and orca_pnpm_run (rebase-orca.sh:289-291), so the code under test decides its own exit status. It also inherits GITHUB_ENV/GITHUB_OUTPUT. bump-pr-orca (release-train.yml:1062) gates on that stage, and release-train.yml:1176 arms auto-merge when notices is unchanged. verify.yml builds Theia only (lines 67-93) and nothing else builds Orca before merge. The finding overstates the impact, though. The forged green buys nothing that a hostile tag which simply typechecks and builds would not get anyway. Typecheck:web/node are correctness gates, not checks against hostile upstream code. bump-pr-orca rebuilds the PR tree itself with --replay-only from tracked data (release-train.yml:1092-1099), so the only extra bytes the compromised job can inject are the notices artifact. When that artifact is carried, auto-merge is withheld (1166-1177). Forging notices=unchanged only drops Orca's notices update. The real gate is the owner's approving review in .github/settings/ruleset-main-review.json (required_approving_review_count 1, dismiss_stale_reviews_on_push). D-26 explicitly accepts an automated weekly re-pin, which keeps the verdict but frames the risk as accepted. The genuine residue: the PR body asserts checks passed when the checked code produced that result, and a pin-hash diff cannot show what changed upstream. That is inherent to pinning an upstream and is low severity. *Checked at:* rebase-orca.yml:118-120; rebase-orca.sh:177,289-291; release-train.yml:1062,1092-1099,1163,1173-1177; .github/settings/ruleset-main-review.json (1 approving review required, verify the only required status check); DECISIONS.md D-26 accepts automated re-pin

