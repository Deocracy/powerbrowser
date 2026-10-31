---
phase: 54-windows-h
reviewed: 2026-10-31T00:00:00Z
depth: deep
files_reviewed: 20
files_reviewed_list:
  - .github/workflows/release.yml
  - patches/040-powerbrowser-nsis.patch
  - powerbrowser/INTERNAL-APIS.md
  - powerbrowser/packaging/mozconfig-windows-x86_64
  - powerbrowser/packaging/node-runtime.json
  - powerbrowser/packaging/package-windows.sh
  - powerbrowser/shell/PowerBrowserAPI.sys.mjs
  - powerbrowser/shell/TheiaService.sys.mjs
  - scripts/generate.mjs
  - scripts/matrix/pkg-win11-domain.xml
  - scripts/matrix/win-matrix-guest.ps1
  - scripts/matrix/win-matrix-run.sh
  - scripts/verify-build-windows-shape.mjs
  - scripts/verify-generated-identity.mjs
  - scripts/verify-node-runtime-targets.mjs
  - scripts/verify-package-target-natives.mjs
  - scripts/verify-platform.sh
  - scripts/verify-sidecar-reap-blocker.mjs
  - scripts/verify-win-matrix-record.mjs
  - scripts/verify-windows-mozconfig.mjs
findings:
  critical: 5
  warning: 9
  info: 5
  total: 19
status: issues_found
---

# Phase 54: Code Review Report

**Reviewed:** 2026-10-31
**Depth:** deep
**Files Reviewed:** 20 (docs/RELEASING.md read for claims only)
**Status:** issues_found

## Summary

Range `69659b44..HEAD` on `dsh/phase-54`. Checks run and green: `verify-platform.sh --quick` (all), `--only` for
release-shape, build-windows-shape (+self-test), windows-mozconfig (+self-test), node-runtime-targets (+self-test),
sidecar-reap-blocker (+self-test); `regenerate-patches.sh --check`; `apply-patches.sh --self-test`;
`check-patch-surface.sh`; `check-internals-boundary.sh` (plain, `--catalogue`, `--self-test`);
`generate.mjs --check` (69 files); `bash -n` on both new shell scripts.

What holds up:

- Release hardening did not regress. Every hunk in `release.yml` is additive (the single deleted line is a header
  comment). `build-linux`, `sign-publish`, `descriptor` and `channel-live` are untouched. `sign-publish` downloads
  `release-linux` by name only and `needs: build-linux` only, so nothing `build-windows` produces reaches a job that
  holds a secret or a write token. `build-windows` carries the ref/event guard, 40-hex SHA step, checkout, SHA gate
  and key gate (byte-identical to `build-linux`), `permissions: contents: read`, no environment, no secret, and an
  `if:` on every step after the key gate. Every multi-line `run:` carries `set -euo pipefail`.
- Patch 040 was regenerated, not hand-edited. The new blob `a4f9a06f98` equals
  `git -C upstream hash-object` of the patched `uninstaller.nsi` (a4f9a06f983c...). It touches only `.nsi` (no
  compiled suffix) and passes the surface check.
- The 114 renumbered `INTERNAL-APIS.md` references are correct. I checked all 125 `PowerBrowserAPI.sys.mjs:N`
  citations against the source and found 0 mismatches. The new `addBlocker` row cites line 701, which is the call.
- Every new Firefox internal (`AsyncShutdown`) sits behind `PowerBrowserAPI.sys.mjs`. `TheiaService` only calls the
  boundary method.
- The win32-x64 Node pin matches nodejs.org `SHASUMS256.txt` for `node-v24.19.0-win-x64.zip` (57f71ab3...), checked
  live.
- `package-windows.sh` extracts only two fixed zip member names with `basename`, so there is no zip-slip. The Node
  archive hash is verified on every run and fails closed.

Where it falls down: the `build-windows` job cannot succeed as committed, and its static row cannot see why. The
reap blocker cannot work on its target platform. The matrix verifier accepts failed cells, and the matrix harness
cannot produce valid evidence.

## Critical Issues

### CR-01: `build-windows` Node-pin step always fails; `jq` filter is wrong and the shape row never runs it

**File:** `.github/workflows/release.yml:~248-252` (step "Check the win32-x64 Node pin before any staging reads it")
**Issue:** The filter is `.["win32-x64"] | (.sha256 | test(...)) and (.url | contains(.version))`. Inside
`(.url | contains(.version))` the argument `.version` is evaluated against the URL string, not the entry. I ran it
against the real file:

```
jq: error (at powerbrowser/packaging/node-runtime.json:22): Cannot index string with string ("version")
rc=5
```

With `-e` and `set -euo pipefail` the step exits non-zero. Every dispatch that passes the key gate dies here, before
any build work, with the misleading message "the win32-x64 entry ... is missing or malformed". It also fails closed
for the wrong reason, so the owner will chase the pin instead of the filter. `build-windows-shape` passes because it
only checks the shape of the YAML and never executes the filter. The step also runs `jq` on the host outside
`nix develop`; nothing shows `jq` is on the legion runner's PATH.
**Fix:**
```yaml
jq -e '.["win32-x64"] as $e | ($e.sha256 | test("^[0-9a-f]{64}$")) and ($e.url | contains($e.version))' \
  powerbrowser/packaging/node-runtime.json >/dev/null \
```
Run it through `nix develop .#theia --command` (or use `node`, as the other gates do). Add a `build-windows-shape`
rule that extracts this `run:` text and executes it against fixture pins (good, wrong-version, missing-key), so the
filter itself is exercised.

### CR-02: Cross-build step cannot succeed: `get_vs.py` does not exist and both `mach repackage` calls omit required arguments (verified in the pinned tree)

**File:** `.github/workflows/release.yml:~277` (step "Cross-build the Windows release tree ...")
**Issue:** BLOCKED item 1 calls this "unverified". It is verifiable now, and all three problems are real:

1. `upstream/build/vs/` contains only `generate_yaml.py`, `vs2026.yaml`, `vs2026-aarch64.yaml`. There is no
   `get_vs.py`. `python3 /src/upstream/build/vs/get_vs.py` fails with ENOENT under `set -e`.
2. `mach repackage installer` requires `--tag --setupexe --output --sfx-stub`
   (`upstream/python/mozbuild/mozbuild/mach_commands.py:3152` and the argument block above it). `mach repackage mar`
   requires `--input --mar --output` (line 3467 onward). The step passes none.
3. The upload globs `objdir-windows-x86_64/dist/*.exe` and `*.complete.mar` match nothing, because neither command is
   told to write there. Only `if-no-files-found: error` stops this from uploading nothing silently.

Setting `WINSYSROOT` is also the wrong lever. In `windows-toolchain.configure:69-85`, `--enable-bootstrap` already
fetches the pinned `vs` toolchain when `WINSYSROOT` is unset. An unpinned, unhashed sysroot download executed in a
container that mounts the Safe Browsing key directory and a read-write `/src` is a supply-chain regression compared
with the hash-pinned `vs2026.yaml` path.

`build-windows-shape` rule 8 only asserts the substrings `mach repackage installer` and `mach repackage mar` appear,
so it is green on a job that cannot run. Fail-closed, but it is the job's whole purpose.
**Fix:** Drop `WINSYSROOT` and `get_vs.py` and let the mozconfig's `--enable-bootstrap` fetch the pinned toolchain.
Pass the real arguments, for example `--tag`, `--setupexe` (the `setup.exe` from the objdir installer stage),
`--sfx-stub`, `-o` for the installer, and `-i <package zip> --mar <objdir>/dist/host/bin/mar -o <...>.complete.mar`
for the MAR. Upload from the paths those `-o` flags write. Strengthen rule 8 to require `-o` and the mandatory flags
in the same command.

### CR-03: `stopAndReap` throws on Windows; the UPD-30 blocker does nothing on the platform it exists for

**File:** `powerbrowser/shell/TheiaService.sys.mjs:482` calling `powerbrowser/shell/PowerBrowserAPI.sys.mjs:990-1006`
**Issue:** `signalBarePid` opens `lazy.ctypes.open("libc.so.6")` outside its `try`. Its doc comment says "Linux-only
... never throws", and that is no longer true for the code path this phase adds. On Windows `ctypes.open` throws.
`stopAndReap` calls `this.stop()` (which starts the fire-and-forget kill) and then reaches line 482, where
`signalBarePid` throws. The blocker promise rejects, AsyncShutdown logs and moves on, and shutdown proceeds without
waiting for `node.exe` to exit. The updater's rename can therefore still hit a locked file, which is the failure
UPD-30 was meant to remove. `sidecar-reap-blocker` is green because it is a regex over source text, and the claimed
proof is a live matrix cell that has never run (and cannot, see CR-05).
**Fix:** Do the liveness test through something that works on both platforms. The simplest is to await the
subprocess handle you already own: capture `const proc = this._proc` before `stop()`, then
`await Promise.race([proc.wait(), PowerBrowserAPI.sleep(graceMs)])` behind a boundary method such as
`PowerBrowserAPI.waitForExit(proc, graceMs)`. If a pid probe is kept, make `signalBarePid` platform-aware (Windows
via `kernel32!OpenProcess`/`GetExitCodeProcess`, behind the boundary and catalogued) and move `ctypes.open` inside
the `try` so it honours its "never throws" contract. Add a row plant that evaluates `stopAndReap` with a stubbed
boundary whose probe throws and requires that shutdown still resolves.

### CR-04: `win-matrix-record` accepts FAIL verdicts, so a fully failed matrix goes green

**File:** `scripts/verify-win-matrix-record.mjs:98-103`
**Issue:** Rule 1 only checks `VERDICTS.has(cell.verdict)` (PASS or FAIL) and non-empty evidence. It never requires
`verdict === 'PASS'`. A record in which install, launch, update, uninstall and no-residue are all `FAIL` produces zero
failures. The self-test's "bare RED verdict without evidence" plant only goes red because the evidence is empty, so
the self-test cannot reveal the hole. This is the row that is supposed to carry MTX-01 and UPD-30 at the 54-04
checkpoint.
**Fix:**
```js
if (cell.verdict !== 'PASS') fail(c, 'cells', `cell '${c}' verdict is ${JSON.stringify(cell.verdict ?? null)}, not PASS. Evidence: ${String(cell.evidence ?? '').slice(0, 200)}`);
```
Add a plant with a non-empty-evidence `FAIL` cell and require it red naming the cell.

### CR-05: Matrix harness cannot produce valid evidence: per-cell snapshot revert breaks every dependent cell, and the update cell applies nothing yet passes

**File:** `scripts/matrix/win-matrix-run.sh:80-86`; `scripts/matrix/win-matrix-guest.ps1:'launch','update','uninstall','no-residue'`
**Issue:** Two independent defects.

1. The driver reverts to `clean-baseline` before every cell (`for cell ... snapshot-revert`). The cells are not
   independent: `launch` fails with "`$Exe` is absent; install first", `update` and `uninstall` need an installed
   product, and `no-residue` reads `registry-before.reg`, which no code ever writes (`Get-Content $before
   -ErrorAction SilentlyContinue` returns `$null`). On a clean baseline `install` is the only cell that can pass.
   `no-residue` then diffs against nothing; if the stock-browser coexistence install put any `Software\Mozilla` key in
   the baseline, it fails on that key, and if none, it passes with an empty fork list.
2. The `update` cell runs `& updater.exe 2>$null | Out-Null` with no arguments. The updater needs an update
   directory and staged `update.mar`/`update.status`. It exits with a usage error, nothing is applied, and the cell
   then reads `application.ini`, finds no `tobedeleted` residue, and returns `Pass "version $ver after the apply ..."`.
   The version is never compared with a before value and the sidecar is never confirmed gone at apply time. This cell
   is the only live proof of UPD-30, and it passes whether or not an update happened.
**Fix:** Run one chain per revert. Revert once, then run install, launch, update, uninstall and no-residue in
sequence in the same guest session, with the registry snapshot taken before install. Alternatively make each cell
establish its own precondition (install in `launch`/`update`/`uninstall`). For the update cell, place the MAR in the
updates directory, trigger the real apply path (relaunch or `updater.exe` with the proper arguments), then assert
`Version=` changed from the pre-apply value and that the pre-apply `node.exe` pid is gone before the apply.

## Warnings

### WR-01: `build-windows` never calls `package-windows.sh`; the uploaded installer has no Theia sidecar and no Node runtime

**File:** `.github/workflows/release.yml:~275-282`; `powerbrowser/packaging/package-windows.sh`
**Issue:** The job runs `mach build`, `mach package`, `repackage installer`, `repackage mar`. The sidecar, the win32-x64
`node.exe`, `distribution/policies.json`, the precomplete refresh and the PE32+ native gate (all in
`package-windows.sh`) never run. The `release-windows` artifact would be a stock Gecko browser without the default
GUI (CLAUDE.md rule 5), and the "no Linux native ships" gate protects nothing because nothing runs it. BLOCKED item
8 records the missing hosted sidecar job, but not that the call to `package-windows.sh` is also absent. No row asserts
the call exists, so wiring it later can silently be skipped.
**Fix:** Add a `build-windows` step between `mach build` and `repackage` that runs `package-windows.sh` with
`PB_WIN_SIDECAR_DIR`, and give `build-windows-shape` a rule requiring that call before the repackage commands.
Until the hosted sidecar job exists, name the artifact `release-windows-unstaged` or do not upload it.

### WR-02: Sidecar "hash agreement" is in-band and incomplete

**File:** `powerbrowser/packaging/package-windows.sh:19-24, 45-46`
**Issue:** `SHA256SUMS` travels inside the artifact it vouches for, so it detects transport corruption only; whoever
can alter the files can alter the manifest. Worse, `sha256sum -c` verifies only the files the manifest names, while
`cp -a "$SIDECAR_DIR/." "$STAGE/theia/"` copies everything. An unlisted file (an extra `.node`, a `.js`, a symlink
preserved by `cp -a`) is staged unverified, and one valid line in the manifest satisfies the gate. Manifest paths are
also taken at face value (`../..`, absolute). The project rule is to derive and compare as set equality.
**Fix:** Require manifest entries to equal `find "$SIDECAR_DIR" -type f ! -name SHA256SUMS` exactly (both directions),
reject entries with `..` or a leading `/`, and reject symlinks in the artifact. Pass the manifest's own digest out of
band from the hosted job (job output or the `upload-artifact` digest) and compare it before trusting the file.

### WR-03: Checkout-path purge checks the wrong path for a Windows artifact

**File:** `powerbrowser/packaging/package-windows.sh:60-63`
**Issue:** The purge greps for `"$ROOT/"`, which inside the container is `/src/`. The sidecar was built on
`windows-latest`, so its leaked paths look like `D:\a\...` or `D:/a/...`, never `/src/`. The gate can never fire for
the content it exists to inspect. The `grep ... 2>/dev/null || true` also hides read errors.
**Fix:** Have the hosted job record its workspace root in the manifest (or a sibling file) and grep for that value in
both slash forms. Fail if the recorded root is empty.

### WR-04: `stopAndReap` waits on a pid nobody signalled and trusts a stale `_pid`

**File:** `powerbrowser/shell/TheiaService.sys.mjs:474-490`
**Issue:** `stop()` signals only when `this._proc && this._proc.exitCode == null`, but `stopAndReap` polls
`this._pid`, which is set from the backend's self-reported readiness line (line 996) and never cleared. If the proc
already exited (health loop gave up, crash) or was never held, the pid is stale. After pid reuse, `kill(pid, 0)`
succeeds against an unrelated process and every quit stalls for `killGraceMs` (5 s), then logs a false "sidecar
still alive" error naming a foreign pid. The reap grace (5000) also differs from `stop()`'s default (3000) for the
same pref, and with the pref set explicitly both deadlines are equal, so the reap can give up at the instant the
SIGKILL escalation fires.
**Fix:** Capture `const proc = this._proc` before `stop()` and reap only if it was live. Wait on the handle (see
CR-03) with `graceMs + 500`. Clear `_pid` when the process is known gone.

### WR-05: Matrix record schema does not match what the driver writes; two checks are satisfied by the harness's own text

**File:** `scripts/matrix/win-matrix-run.sh:77, 92`; `scripts/matrix/win-matrix-guest.ps1:'launch'`; `scripts/verify-win-matrix-record.mjs:116-123`
**Issue:**
- The verifier reads `cells['no-residue'].registry_diff`; the driver never writes that key (only `verdict`,
  `evidence`, `transport`). Rule 3 is always red on live data, so it cannot discriminate.
- The launch cell's PASS message hard-codes `... captured on the host: Windows protected your PC`. The SmartScreen rule
  (`includes(SMARTSCREEN)`) is therefore satisfied by the guest script's own literal whether or not SmartScreen
  appeared. CLAUDE.md's rule against asserting on text your own instrumentation emits applies directly.
- `maintenance_service_enabled` is hard-coded `false` in the driver, so rule 5's "never enabled" cannot go red from
  live data. BLOCKED item 6 admits the missing `build_target` and `background` but not these three.
**Fix:** Have the guest print `REGDIFF:` lines and `SMARTSCREEN:` only when observed (a UI Automation or window-text
probe), have the driver parse them into `registry_diff`, and read the service state from the installed tree
(`maintenancservice.exe` absent and `application.ini`/registry). Remove the literal from the PASS text.

### WR-06: Natives-gate self-test plants do not exercise the PE branches they claim

**File:** `scripts/verify-package-target-natives.mjs:210-226` (win-planted fixture), `peHeaderFailure` at 70-91; `isNativeName` at 53-55
**Issue:** The "magic-only MZ with no PE signature" plant is 4 bytes, so it trips the `< 0x40` truncation branch, not
the "no PE signature" branch. No plant covers wrong machine (i386 0x014c, arm64 0xaa64), PE32 (optional magic 0x010b),
or an `e_lfanew` past 4096. Those three rules can be deleted and the self-test stays green. The Linux-`.node`-in-Windows
plant only runs when a built `drivelist.node` exists; otherwise it silently degrades to the EMPTY-universe check.
Separately, `isNativeName` only matches `.node`, `rg(.exe)`, `node(.exe)`, so an ELF named `*.so`, `*.dll` or
`spawn-helper` in the Windows stage is not examined (the spec text says "every .node, rg and node", so this is a
coverage limit worth recording).
**Fix:** Add synthetic plants: valid MZ plus a PE signature with machine 0x014c, with machine 0x8664 and optional magic
0x010b, with `e_lfanew` 0xFFFF, and an MZ of at least 64 bytes with no `PE\0\0`. Use a synthetic ELF so the wrong-OS
plant always runs. Consider also scanning `*.dll`/`*.exe` and any file starting with `\x7fELF` in the Windows stage.

### WR-07: `sidecar-reap-blocker` is a text regex; its "bound" rules and plants are thin

**File:** `scripts/verify-sidecar-reap-blocker.mjs:96-103, 138-143`
**Issue:** The bound rules are regexes over the whole method text, so they match a comment or a dead branch (for
example `// Date.now() >= deadline`). Plants exist for the registration, the deadline comparison and the catalogue
row only. Nothing plants a missing `sleep(100)`, a missing `killGraceMs` read, or a missing `signalBarePid(pid, 0)`.
The row also gives no signal on CR-03, because it never evaluates the function.
**Fix:** Strip comments before matching, add the three missing plants, and add a behavioural check that imports
`stopAndReap` against a stub boundary (probe always true -> must resolve after `killGraceMs`; probe throwing -> must
resolve).

### WR-08: Matrix driver passes guest-reported evidence through argv; one large cell aborts the whole run

**File:** `scripts/matrix/win-matrix-run.sh:86-92`
**Issue:** `python3 - ... "$evidence"` puts the whole captured stdout in one argument. Linux caps a single argument
at 128 KiB (`MAX_ARG_STRLEN`). A `no-residue` registry diff or a long `Get-Content` dump exceeds it, python fails to
start (E2BIG), `set -e` aborts, and `mv "$tmp_record" "$RECORD"` never runs, so a completed run leaves no record.
(No shell-injection path: values reach python only as argv and JSON, and `virsh` is invoked as an argv list.) Also,
`no-residue` expects `Software\PowerBrowser` in the diff while patch 040 still leaves the installer on
`Software\Mozilla` (BLOCKED item 2), so that cell fails by construction until item 2 is resolved.
**Fix:** Write each cell's evidence to a temp file and pass the path (or pipe it on stdin). Cap and truncate with a
marker. Resolve BLOCKED item 2 before treating a `no-residue` red as a product defect.

### WR-09: Plan 54-02 must_haves are unmet (documented in BLOCKED.md, not closed)

**File:** `patches/040-powerbrowser-nsis.patch`; plan `54-02-PLAN.md`
**Issue:** Plan 54-02 requires the fork registry namespace, fork installer artwork, the LEG-01 surface extension with
set equality, and widened `installer-schema`/`installer-build-proof` rows. None landed. The only 040 change is the
`Return` in `un.SendUninstallPing`. Three upstream readers of `Software\Mozilla` stay on the stock root (BLOCKED
item 2). `docs/RELEASING.md` now describes the `windows-unsigned` row as including "fork registry defines" and
"installer artwork", which this tree does not deliver. The uninstall survey URL (`uninstaller.nsi` `URLUninstallSurvey`)
also still opens an upstream host.
**Fix:** Keep the BLOCKED entries as the gate, and soften the `RELEASING.md` row text to say what is delivered. Take
the owner decision on BLOCKED item 2 (move installer and readers together, or record `Software\Mozilla` as a known
identifier) before 54-04.

## Info

### IN-01: `node-runtime-targets` hard-adds its own expectation

**File:** `scripts/verify-node-runtime-targets.mjs:68`
**Issue:** `keys.add(WINDOWS_TARGET.node)` forces `win32-x64` into the "derived" set even if `package-windows.sh` stops
reading it. `package-windows.sh` already contains `["win32-x64"]`, which the regex derives, so the line is redundant
and masks that removal.
**Fix:** Delete the `keys.add` and add a plant for a packager that no longer reads the key.

### IN-02: Release shape rows do not pin that no secret job consumes `release-windows`

**File:** `scripts/verify-build-windows-shape.mjs`
**Issue:** The shape row checks the `build-windows` job only. Today `sign-publish` downloads `release-linux` by name,
which is safe, but nothing in the new row fails if a later change adds a `pattern:` or a second download of
`release-windows` to a job holding the write trio.
**Fix:** Add a rule over all jobs with an `environment` or a secret: every `download-artifact` must name exactly one
artifact and never `release-windows`.

### IN-03: Detached JSDoc on `emitMozconfigWindows`

**File:** `scripts/generate.mjs:~1579-1597`
**Issue:** The `/** Phase 54 (PKG-11) ... */` block is followed by a `// node:` line comment and `WINDOWS_TARGET`, so
the JSDoc attaches to the constant, not to `emitMozconfigWindows`.
**Fix:** Move the `// node:` comment and `WINDOWS_TARGET` above the JSDoc.

### IN-04: Harness text contradicts the driver and the domain definition

**File:** `scripts/matrix/win-matrix-guest.ps1:2-4`; `scripts/matrix/pkg-win11-domain.xml`
**Issue:** The `.ps1` header says the host driver "copies this script and the setup.exe plus the complete MAR in". The
driver says it copies nothing and expects a read-only CD-ROM. The domain XML defines no CD-ROM device, yet the guest
script writes its registry exports into the same `$Work` directory (`C:\pbmatrix`), which would be read-only if the
inputs live on the CD-ROM. A snapshot revert would also erase anything copied after the snapshot.
**Fix:** Pick one transport, add the device (or a second writable work disk) to the XML, and fix the header.

### IN-05: Two builds on one runner share the `pb-gecko-build` image tag

**File:** `.github/workflows/release.yml` (both jobs, "Build the release container image")
**Issue:** `build-linux` and `build-windows` both run `podman build --no-cache -t pb-gecko-build` on the same
persistent runner host with no `needs:` between them. With more than one runner instance, one job can re-tag the image
under the other mid-run. The images are identical today, so the impact is a rebuild race and not a correctness bug.
**Fix:** Tag per job (`pb-gecko-build-windows`) or serialize with `needs: build-linux` plus `if: always()`.

---

_Reviewed: 2026-10-31_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
