# Building PowerBrowser

This documents the commands that actually built and ran both halves of
PowerBrowser on the reference NixOS host, with the durations actually measured
there. It does not describe the patch-stack tree, artifact builds, or a
rebase procedure — those land in Phase 3.

**What every timing in this document is attributed to.** The reference host is
`legion` — 16 cores, 62 GB RAM, NixOS. Each figure below additionally names the
**tree** it was measured on (rows predating the rename say so explicitly) and
the **date**, and every one of them was produced under the pinned Gecko
toolchain recorded in `toolchain-baseline.txt` at that commit — the same file
`scripts/toolchain-baseline.sh` regenerates and the Phase 3 rebase procedure
diffs against. A figure is only comparable to a new measurement taken under the
same three: tree, host, toolchain. **These numbers are carried forward rather
than re-measured**: re-running the tier-3 rows alone costs about eighty minutes
and would reproduce them, and D-73 forbids presenting an inherited number as a
fresh measurement, so each row cites the summary it was measured in.

## Prerequisites

- NixOS (or any host with Nix flakes enabled — `experimental-features =
  nix-command flakes`).
- ~30 GB free disk and 8 GB RAM for the Firefox half (a full non-artifact
  compile peaks around 14 G of `objdir/`, on top of the ~5.6 G `upstream/`
  checkout).
- **The repository must live at a path with no space character.**
  `pkgs.mkShell` appends an rpath to the space-separated `NIX_LDFLAGS`
  environment variable; a space in the checkout path makes the cc-wrapper
  split that variable on the space and every native link step fails. Both
  the Firefox compile and Theia's `node-gyp` native modules drive that same
  linker, so this is not a Firefox-only caveat — clone somewhere like
  `~/coding/Power-Browser` (this repo's own path on the reference host),
  never under a directory such as `~/My Projects`.

Nothing else needs installing by hand. Both `nix develop` shells below
supply their entire toolchain; there is no `mach bootstrap` step and no
separate Node/Yarn/Rust install (D-18).

One consequence is easy to miss, because plain `node` otherwise works
outside either shell: **`scripts/generate.mjs` must run inside `nix develop
.#theia`.** It rasterises `brand/mark.svg` through `inkscape`, which that
shell pins at 1.4.4. Bare `node scripts/generate.mjs` on a host without an
`inkscape` fails at the 16-pixel icon; on a host carrying a *different*
`inkscape` it is worse, producing rasters that pass the icon step and then
fail the byte-identity check as though the tree were at fault. The
invocations written as `node scripts/generate.mjs` below are all inside
that shell. `verify.yml` runs them the same way; `rebase-upstream.yml` does
not (see the **CI story** note under the rebase section).

## Theia half

The app composes the frozen 49-`@theia/*`-package daily-drivable set
(Phase 2 D-19) — 11 packages proved the build in Phase 1; every package
that was ever going to ship is now in the tree.

```
nix develop .#theia
cd theia
yarn install --ignore-scripts --frozen-lockfile
(cd node_modules/drivelist && node-gyp rebuild)
yarn build
yarn start
```

Then open **http://localhost:3000** (`127.0.0.1:3000`) — that is the port
`theia start` actually binds; do not assume it moved. `yarn start`
(`applications/browser`'s own script) also sets two environment variables
explicitly before invoking `theia start` — see "Environment variables the
start script sets", below.

Why `--ignore-scripts` plus one explicit rebuild, not a plain `yarn
install`: this was a deliberate decision, re-audited at 49 packages after
first being decided at 11 (Phase 1). **Re-run at 49 packages (Phase 2
Plan 04):** the transitive tree is now 1,058 packages deep (depth ≤ 3,
`@theia/plugin-ext` alone adds roughly 38 direct dependencies), of which
**7** carry an `install`/`preinstall`/`postinstall` script — `@parcel/
watcher`, `drivelist`, `esbuild`, `keytar`, `msgpackr-extract`, `node-pty`,
`puppeteer`. **`drivelist` remains the only load-bearing one** — version
12.0.2 ships no prebuilt binary, and `@theia/core` requires its compiled
`.node` at backend boot, unconditionally, on every target. The other six
are not load-bearing under `--ignore-scripts`:

- `node-pty`, `@parcel/watcher`, `msgpackr-extract` and `esbuild` each
  resolve their native binary through a platform-gated **optional
  dependency package** (e.g. `@esbuild/linux-x64`,
  `@parcel/watcher-linux-x64-glibc`) that Yarn Classic already installs
  for the matching host — the same mechanism `@vscode/ripgrep` uses (see
  below). Their own `install`/`postinstall` script is a fallback path for
  when no prebuilt platform package matches; it never runs here because
  one already did.
- `keytar` is Electron/OS-credential-store tooling; a browser-target app
  never loads it, matching Phase 1's original finding.
- `puppeteer` is `@theia/cli`'s own dependency (used by `theia test`, which
  this project never runs), and its postinstall would download a Chromium
  binary — exactly the class of unaudited network fetch `--ignore-scripts`
  exists to prevent.

Running every package's install script unaudited is unnecessary attack
surface; skipping the one script that is actually load-bearing breaks the
app at boot. Do not "simplify" this back to a bare `yarn install`.

If `yarn.lock` were absent you would drop `--frozen-lockfile`, but it is
committed, so every install reproduces the exact same tree.

**What `theia rebuild:browser` (invoked internally by `yarn build`)
actually prints, verified at 49 packages:** a single generic line, `native
node modules are already rebuilt for browser` — not a per-module skip
list. Reading `@theia/application-manager`'s `rebuild.js` explains why:
the command only does per-module work (backing up/reverting cached native
builds under a `.browser_modules` cache directory) when reverting a
previous **electron-target** rebuild. This project never builds an
electron target, so that cache is never populated and the command always
takes the trivial "already rebuilt" branch, at any package count. Correct
Phase 1's documented expectation here: the four-name list
(`native-keymap`, `find-git-repositories`, `drivelist`, `keytar`) was
never something this command literally prints for a browser-only app; it
described which native modules are *browser-inapplicable in principle*,
not the command's actual log output.

**`@vscode/ripgrep`** (first enters the tree here, via
`@theia/file-search`): at the pinned resolution (`1.18.0`) it has **no
scripts field at all**. It ships 12 `os`/`cpu`-gated platform binary
packages as `optionalDependencies` (e.g. `@vscode/ripgrep-linux-x64`), and
Yarn Classic already skips every one that doesn't match the host, so only
the matching package installs. **No install-time gate applies to
`@vscode/ripgrep`** — `--ignore-scripts` does nothing for it because there
is no script to skip. Do not add a no-op gate for it. If avoiding the
prebuilt `rg` binary blob is ever made policy, the only lever is a
post-install file swap of the resolved platform package (or the resolved
`rgPath` module output) for the Nix-store `rg` binary — `rgPath` is a
module-level constant import, not DI-injectable or preference-driven, so
there is no rebind seam. That is optional hardening, out of scope here.

**Declared extensions only.** The app ships `@theia/plugin-ext`,
`@theia/plugin-ext-vscode` and `@theia/vsx-registry`, the extension-host machinery
and the runtime installer. This project declares no `[[extensions]]`, so the
`theiaPlugins` block stays absent and the build downloads nothing. A downstream that
declares extensions gets them from `yarn build`'s `download:plugins` step, which is
`scripts/download-plugins.mjs`. Every `theiaPlugins` id must have an `[[extensions]]`
entry that pins it, and each packed archive lands in the slot the pin gate hashes:

- npm, local-path and direct-URL `.tar.gz` tarballs are fetched or packed and written to
  `plugins/<id>.tar.gz`. A local-path folder is packed with none of its package scripts
  run (`prepare` included);
- every other kind goes through the stock `theia download:plugins --packed`;
- a fetched archive already at its pin is reused, and any other slot is fetched again;
- every slot is then hashed against its manifest `sha256` before anything is unpacked;
- each declared archive is unpacked beside itself into `plugins/<id>/` (regular files and
  folders only, no links), and anything undeclared is removed from `plugins/`. The packed
  file is what the pin gate hashes; the folder is what Theia loads, because its plugin
  deployer refuses packed files in a `THEIA_PLUGINS` or `THEIA_DEFAULT_PLUGINS` folder.

A pin mismatch removes the entry and fails the build naming it, and nothing is placed
by hand (NG-071, check `ng071-tarball-extensions-build`). Every
`extensionDependencies` and `extensionPack` member of a declared extension must
itself be declared with its own pin: the download step refuses an entry whose
unpacked manifest names an id no `[[extensions]]` entry declares, so no unpinned
bytes are fetched from the registry at sidecar start. The sidecar receives
`<app>/plugins` through `THEIA_DEFAULT_PLUGINS` (NG-073, check
`ng073-declared-extension-loads`).

**Environment variables the `start` script sets.** `applications/browser`'s
`start` script exports two variables explicitly, rather than relying on
Theia's defaults, before invoking `theia start`:

- `VSX_REGISTRY_URL=https://open-vsx.org` — explicit so that repointing at
  PowerBrowser's own registry mirror (R9, post-4.0) is a config change, not a
  code change.
- `THEIA_CONFIG_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/powerbrowser"`, with a
  `mkdir -p` run first — Theia never creates the config directory on this
  branch, and an absent directory leaves the config-dir file watch stuck in
  a 500 ms `fs.stat` poll loop with no hot reload (load-bearing for the
  customization layer's hot reload).

Phase 2 owns both only for `yarn watch`/`yarn start`. Phase 4's Firefox
supervisor takes over setting both permanently on the sidecar spawn.

**Measured on the reference host, re-measured at 49 packages (Phase 2 Plan
04):** a cold run (`node_modules` absent, Yarn's own package cache already
warm from repeated installs earlier this session — not a network-cold
measurement) of the full sequence above (install + drivelist rebuild +
build + boot, via `scripts/smoke-theia.sh`) took **23.4s**; a warm run
(`node_modules` present, `--frozen-lockfile`, no dependency changes)
took **18.1s**. Both numbers moved up from Phase 1's 11-package figures
(70s cold, 11.9s warm) — expected, given `@theia/plugin-ext` alone adds
roughly 38 direct dependencies to resolve, link and bundle. The cold
figure here is not directly comparable to Phase 1's: Phase 1's 70s
included real network package fetches on a cold cache, while this run's
Yarn package cache was already warm from this session's prior installs.
Treat 23.4s as a lower bound for a genuinely cold-cache cold run, not as
the number a first-time contributor should expect.

**One-pin Theia re-pin procedure (CFG-06, UPD-02).** A Theia release is
adopted by re-pinning — never by editing Theia core. The release is
declared once as `[upstreams] theia_release` in `configuration.toml`, and
`node scripts/verify-upstream-pins.mjs` proves every `@theia/*` pin in
`theia/package.json` resolutions, every member
`applications/*/package.json` and `extensions/*/package.json`, and every
resolved `@theia` tarball in `theia/yarn.lock` agrees with it. The one
known exception is `@theia/monaco-editor-core`, which tracks upstream's
own monaco line rather than the Theia release and is excluded by exact
package name in the check. One re-pin has been performed under this
procedure, Phase 19's move to 1.76.0 (recorded below). It is also proven
structurally by the check's `--self-test` (a patch-bumped member pin and
a drifted lockfile stanza both go red naming the file), and is exercised
live only when an actual Theia release demands it. Do NOT perform it speculatively: it rewrites the lockfile and
reinstalls `node_modules`, which is network and time neither a static
check nor a review needs.

```
# 1. declare the new release (exact triple, never a range):
#    edit configuration.toml -> [upstreams] theia_release = "<new-triple>"
# 2. move every @theia/* pin to the manifest pin. Inside the shell below,
#    from the repo root — the pin comes out of the manifest, so the
#    command line states no version of its own:
nix develop .#theia
NEW=$(node -p "require('./scripts/lib/toml.cjs').parse(require('fs').readFileSync('configuration.toml','utf8')).upstreams.theia_release")
node -e '
const fs = require("fs");
const pin = process.argv[1], EX = "@theia/monaco-editor-core";
const files = ["theia/package.json", ...fs.readdirSync("theia/applications").map(d => `theia/applications/${d}/package.json`), ...fs.readdirSync("theia/extensions").map(d => `theia/extensions/${d}/package.json`)];
for (const f of files) {
  const doc = JSON.parse(fs.readFileSync(f, "utf8"));
  let changed = false;
  for (const block of ["resolutions", "dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]) {
    const deps = doc[block];
    if (deps === null || typeof deps !== "object" || Array.isArray(deps)) continue;
    for (const name of Object.keys(deps)) {
      if (name.startsWith("@theia/") && name !== EX && deps[name] !== pin) { deps[name] = pin; changed = true; }
    }
  }
  if (changed) fs.writeFileSync(f, JSON.stringify(doc, null, 2) + "\n");
  console.log((changed ? "moved " : "clean ") + f);
}
' "$NEW"
# 3. re-resolve the lockfile to the moved pins (deliberately NOT
#    --frozen-lockfile: the lock is being moved on purpose), from theia/:
cd theia
yarn install --ignore-scripts
cd ..
# 4. regenerate (the Theia pin needs no emitted fragment — package.json
#    files are committed build input, so the generator never rewrites
#    them; the check above is the enforcement) and prove agreement:
node scripts/generate.mjs
node scripts/verify-upstream-pins.mjs
node scripts/verify-upstream-pins.mjs --self-test
# 5. prove core untouched, full stages now that the fresh install exists:
bash scripts/diff-theia-core.sh
# 6. prove the token gate intact at the new pin (UPD-04): compile every
#    extension including the token-gate backend modules, then run all
#    plain-node suites. The gate is green only when the backend compiles
#    AND its suites pass -- a re-pin that silences the credential gate is
#    a failed re-pin, not a clean one:
nix develop .#theia --command bash -c 'node theia/node_modules/typescript/bin/tsc -b theia/extensions/token-gate'
node theia/extensions/telemetry/test/telemetry-sender.test.mjs
```

Expect the lock diff to show the `@theia` moves plus their transitive
consequences — a new `@theia` tarball carries its own dependency ranges,
so unrelated-looking lock lines moving with them is normal. What must
never appear in a re-pin diff: an edit under
`theia/node_modules/@theia`, a patch file touching Theia sources, a
vendored Theia monorepo, or a `--latest` float anywhere. `yarn upgrade
--latest` is specifically NOT this procedure: it resolves to whatever is
newest rather than to the declared pin, which is the unpinned behavior
the manifest exists to forbid.

**UPD-04 proof record (Phase 19).** Agreement proven at the stated pin
`theia_release = "1.76.0"` on 2026-10-17: `node
scripts/verify-upstream-pins.mjs --self-test` PASS (4 planted faults red
naming the file) and the `verify-upstream-pins` registry row PASS
(resolutions plus 8 member files plus lockfile stanzas, `@theia/monaco-editor-core`
excepted by exact name, staying at 1.108.201). Token-gate intactness at the
same pin: `tsc -b theia/extensions/token-gate` exits 0, and the telemetry
suite passes 9/9 (ping/report separation included). `diff-theia-core` PASS
(zero changes inside `@theia/*`) in the full `scripts/verify-platform.sh`
run at commit `dfef881821be1c816461e0cfe46bee6169b90c30`. The pins and the
lockfile moved in commit 3, `2700e4c3e6b65fde1ed7350a1c2e87c95589a892`. No
framework source was edited for any of this — pins and lockfile only, per
hard rule 1. (The 09-04 record it replaces proved the same at 1.74.1 on
2026-09-05.)

**Live bump executed (Phase 19).** Phase 19 ran runbook steps 1-6 above
verbatim at 1.76.0, keeping the `monaco-editor-core` exception, after two
prerequisite commits: Node 24 for the theia dev shell (commit 1,
`4cf6806f30a6eb1630e85f4a7f3153d842dd0c35`) and React 19.2.8 at Theia
1.74.1 (commit 2, `58007062987f372d36cda4ccac69c356c93b4eb9`). The re-pin
itself is commit 3, `2700e4c3e6b65fde1ed7350a1c2e87c95589a892`. The 1.75.0
line staged here earlier was skipped, not adopted. A frozen
`--ignore-scripts` reinstall on a fresh copy of the manifests reproduces the
committed lock byte for byte, with `@theia/core` at 1.76.0.

### Extension tier-3 drill (09-04, BLD-02): new source kinds on real artifacts

Drilled 2026-09-05 on nix-linux (x86_64-linux; theia dev shell node
v22.23.2 plus yarn 1.22.22) over a STAGED five-entry `[[extensions]]`
manifest covering every source kind. The root manifest stays entry-free in
the committed tree (no bundled extensions per the Theia-half rule above);
the drill staged the entries, proved them, then restored the tracked files
byte-identical from backups. The staged download map is kept for reference
at (.mozbuild/0904/theia-plugins.drill.json). Every pin below is the sha256
of bytes fetched at drill time on this host:

- openvsx, live registry path: akamud.vscode-theme-onedark 2.3.0, pin
  46b7471523cc2c0fcf526ed63b87b502e4102f3c3cde68d9f2eae9c9887a2e85
  (18955-byte vsix, zip magic verified before pinning)
- url with the downloader placeholder: rust-lang.rust-analyzer 0.4.3038 via
  a URL carrying `${targetPlatform}` in both the path and the file name,
  pin eddd3dbe75b9c5505acdce1a43c7e03cb9ea20ca727bb843d8192374fd9cd968
  (16117795-byte linux-x64 vsix, the placeholder resolved for this host)
- npm, live registry tarball: chart.js 4.5.1, pin
  f540d98468457ac7a0aabb32006dfb066297e096c5ea063a5d80aa973d1c337a
  (1576314-byte tgz; the integrity digest recorded from npm view sits
  alongside the pin in the staged entry)
- npm, synthetic shape twin: acme.drillpack 2.4.2, pin
  1c96947d436a14bdbc1b61bb41ff76f08c97e14f529d00f2b5514d413d88c063
  (394-byte packed tgz served over loopback at drill time; the id is
  unclaimed, so the registry tarball URL answers 404 — recorded in the
  drill transcript — and no real package name is shadowed. The twin is
  deliberately NOT named acme.npmpack: the task-1 npm-kind fixture owns
  that id, and the downstream-fixture absence sweep reads the staged
  manifest as platform truth while the drill is staged, so a shared id
  goes red naming the entry. The harness caught the first attempt live;
  the drill twin carries the drill prefix for exactly that reason.)
- local-path packed at drill time: acme.drilltool from extensions/acme-drill,
  pin 83a7aa2976d890b4adac05f420112b656929a4f2a3eb6e2f2a5f91b44f437e05
  (packed with npm pack; the pin covers the packed bytes, never the dir.
  Same drill-prefix reason as above: the task-1 local-path-kind fixture
  owns acme.localtool and extensions/acme-local.)

Per-target resolution evidence. The stock downloader expands
`${targetPlatform}` to linux-x64 on this host; the win32-x64 and
darwin-arm64 bytes below were retrieved live on nix-linux for pin
documentation, with their build and install cells staged per the host
record that follows:

- linux-x64 vsix through the stock download step, hash-matched to the staged pin (evidence log at (.mozbuild/0904/download-stock.log), hash record at (.mozbuild/0904/plugins-hashes.log))
- win32-x64 vsix bytes retrieved live (19001308 bytes, sha256
  b7c12c0e226e72eb4ca7bb0886412e65457d58dc1c02c65bb5e7d4b1604b2ab8,
  kept target-qualified with the drill archives)
- darwin-arm64 vsix bytes retrieved live (15327866 bytes, sha256
  193dda6d277567e6acdcd1ba502b88c50fa9fa34d16b811e52bd963d3d7cab3e,
  kept target-qualified with the drill archives)

Download-path split, by downloader capability (read off the installed
`@theia/cli` fetcher at drill time): the stock `theia download:plugins --packed` step carries the two vsix entries, placeholder expansion included — the emitted fragment holds `${targetPlatform}` byte-verbatim (see the staged map at (.mozbuild/0904/theia-plugins.drill.json)) and the placed linux-x64 archive hashes to the staged pin. Tarball URLs ending in
`.tgz` and local-path pack references travel out of band by necessity (the
stock fetcher switches only on tar.gz, vsix and theia endings, so a `.tgz`
URL is an unsupported file type there): the drill curled each tarball over
HTTPS (the synthetic twin over loopback HTTP), packed the local folder
with `npm pack`, and placed all three archives into the plugins dir under
the `.tar.gz` slots the pin gate hashes. The hop-equivalent pin re-proof
is `node scripts/verify-extension-pins.mjs` green over the staged set
(fragment equality plus block equality plus the npm `-<version>.tgz`
suffix guard plus sha256 over the placed archives with the local-path
presence leg), run at drill time before the build below. Since NG-071 the build's own plugin step does this, so the out-of-band placement above is a historical record, not a procedure.

Sidecar build over the downloaded set: `theia build --app-target=browser
--mode development` inside the theia shell finished with 0 errors on both the browser and node targets over the five-archive vsix-plus-tarball set (incremental over the prebuilt tree, 4.9s wall; full log at (.mozbuild/0904/build-sidecar.log)). The full `yarn
build` wrapper is not part of this cell: it re-runs the stock download
over the whole block, which aborts on the pack references by the design
above. A pack-aware download wrapper is follow-up work, not a drill
failure. That wrapper now exists: `download:plugins` is `scripts/download-plugins.mjs`
(NG-071).

Staged host cells (the 08-05 capability record re-read, not re-proven):

- Windows 11 sidecar build plus install over the win32-x64-resolved vsix
  set: staged-unexecuted. Provisioning error (08-05 record, still
  current): no reachable Windows host exists — qemu:///system is
  unmanageable without privilege and no guest is defined. Unblock
  (operator): provision pkg-win11 per the 08-05 capability record, then
  stage the entries with the placeholder resolved to win32-x64 and the
  win32-x64 vsix pin above, run `yarn build` in the theia shell (its
  `download:plugins` step installs every kind at its pin), then
  `node scripts/verify-extension-pins.mjs`.
- macOS sidecar build plus install over the darwin-arm64-resolved vsix
  set: staged-unexecuted. Provisioning error (08-05 record, still
  current): no macOS image exists anywhere reachable, no Apple hardware,
  and no lawful download path for a macOS image from Linux. Unblock
  (operator): provision pkg-macos per the 08-05 capability record, then
  stage the entries with the placeholder resolved to darwin-arm64 and the
  darwin-arm64 vsix pin above, run `yarn build` in the theia shell (its
  `download:plugins` step installs every kind at its pin), then
  `node scripts/verify-extension-pins.mjs`.

Verbatim drill transcript (nix-linux; run from the repo root). It records the
2026-09-05 run and is not a procedure: since NG-071 its steps 4 to 6 are the one
`yarn build` inside the theia shell, whose `download:plugins` step downloads, packs,
pin-checks and unpacks every kind, followed by `node scripts/verify-extension-pins.mjs`.

```
# 0. back up the two tracked files the drill stages:
cp configuration.toml .mozbuild/0904/configuration.toml.drill-backup
cp theia/applications/browser/package.json .mozbuild/0904/browser-package.json.drill-backup
# 1. fetch the live bytes and record the pins (akamud theme, three rust
#    targets, chart.js tarball); confirm the synthetic npm id is unclaimed:
curl -sSL -o .mozbuild/0904/akamud.vscode-theme-onedark-2.3.0.vsix <open-vsx-file-url>
curl -sSL -o .mozbuild/0904/rust-lang.rust-analyzer@linux-x64.vsix <linux-x64-open-vsx-file-url>
# (repeat the rust-analyzer fetch for win32-x64 and darwin-arm64 into
# like-named target-qualified archives)
curl -sSL -o .mozbuild/0904/chart.js-4.5.1.tgz https://registry.npmjs.org/chart.js/-/chart.js-4.5.1.tgz
curl -sSL -o /dev/null -w "%{http_code}\n" https://registry.npmjs.org/acme.drillpack/-/acme.drillpack-2.4.2.tgz
sha256sum .mozbuild/0904/*
# 2. pack the synthetic sources (npm shape twin plus local-path folder):
npm pack .mozbuild/0904/synth-npm/acme-npmpack --pack-destination .mozbuild/0904
npm pack ./extensions/acme-drill --pack-destination .mozbuild/0904
# 3. stage the five-entry manifest, generate, and check the fragment keeps
#    the placeholder verbatim:
node scripts/generate.mjs
node -e "JSON.parse(require('fs').readFileSync('generated/theia-plugins.json','utf8'))"
# 4. stock download over the vsix-backed entries (placeholder expands here):
nix develop .#theia --command bash -c 'yarn --cwd theia/applications/browser download:plugins'
# 5. out-of-band tarball placement plus hash-to-pin proof for all five:
#    (see the hash record at (.mozbuild/0904/plugins-hashes.log))
# 6. pin re-proof, then the sidecar build over the downloaded set:
node scripts/verify-extension-pins.mjs
nix develop .#theia --command bash -c 'yarn --cwd theia/applications/browser theia build --app-target=browser --mode development'
# 7. restore the tracked tree byte-identical and reprove the default:
cp .mozbuild/0904/configuration.toml.drill-backup configuration.toml
cp .mozbuild/0904/browser-package.json.drill-backup theia/applications/browser/package.json
rm -rf extensions/acme-drill theia/applications/browser/plugins
node scripts/generate.mjs && node scripts/generate.mjs --check
git status --short
```

## Firefox half

```
./scripts/fetch-upstream.sh
nix develop .#firefox
cd upstream
MOZCONFIG=../.mozconfig ./mach build
MOZCONFIG=../.mozconfig ./mach run
```

`scripts/fetch-upstream.sh` runs directly from the repo root — it only
needs `git`, which the host already provides, so it is not run inside
either `nix develop` shell. It is safely re-runnable: if `upstream/`
already exists at the pinned tag it no-ops instead of re-cloning.

Run `node scripts/generate.mjs` before `./mach configure`: `generated/` is gitignored, and a stale or absent tree misbrands with exit 0, because `--with-branding` resolves through a symlink into it and `browser/moz.configure` includes `generated/identity.configure` through one, so configure succeeds against whatever it finds there.

**Measured on the reference host:** the clone took 438s and produced a
5.6 G `upstream/` tree (re-measured 2026-08-30 on `legion`: 677s, same
5.6 G — the size is stable, the time is network-bound). A full non-artifact
`./mach build` (the phase's acceptance proof — this is not an artifact
build, see D-11/D-12) took 3224s (~54 minutes) wall time on 16 cores /
62 GB RAM, peaking at 14 G of `objdir/`. Expect similar order-of-magnitude
numbers; do not be surprised if a first-time contributor's build takes an
hour. That measured build predates 153.5. At the current pin the binary
reports **`DeBIOS powerbrowser 153.5.0esr`** via `./mach run --version`
(observed in 18-02 and 18-03, both objdirs) — `--version` concatenates `MOZ_APP_VENDOR` with the
app **basename** (`MOZ_APP_NAME`, the fixed lowercase platform name), not
with the display name, so `PowerBrowser` correctly does **not** appear
here. The display name is asserted on its own surfaces
(`brand-full-name`, `desktop-entry`) by
`scripts/verify-branding-identity.mjs`.

`nix develop .#firefox` supplies the entire compiler toolchain (clang,
rustc, cargo, cbindgen) matched to what nixpkgs itself builds this exact
Firefox version with — there is no separate toolchain setup step to run
before `./mach build`.

## Tiered rebuild loop (D-70, D-73)

BUILD-04 is not "run a full compile every time" — it is three tiers, each
with a distinct rebuild cost, selected by what kind of file changed. All
three timings below were **re-measured on this host (`legion`), 2026-08-22**
— none are carried over from research or from a prior phase (D-73 exists
precisely because Phase 2 once carried forward a `docs/BUILD.md` "measured"
figure that was never measured). Where a re-measured figure differs from a
number research or planning inherited, that is stated explicitly here, not
silently replaced.

### Tier 1 — no build (`./mach run`)

For any file that is a **symlink from `objdir/dist/bin` into `upstream/`** —
every `.js`, `.ftl`, and branding PNG — editing the source and re-running is
free: `./mach run` is registered `category="post-build"` and never builds.

Research recorded 7450 of 7784 `objdir/dist/bin` entries as such symlinks.
Re-measured this session (files + symlinks only, directories excluded from
both counts, via `find objdir/dist/bin -type f -o -type l` and
`find objdir/dist/bin -type l -exec readlink -f {} \;` filtered to paths
under `upstream/`): **7163 of 7766** — fewer in both the numerator and the
denominator than the inherited figure. This build actually has that ratio,
not the quoted one; the difference is plausibly the branding/pref/policy
files plans `03-01`/`03-03`/`03-05` added since research ran, but the new
count is reported as measured, not reconciled against a guess.

Verified live: edited `upstream/toolkit/components/thumbnails/PageThumbs.worker.js`
(a `.js` file `objdir/dist/bin/modules/PageThumbs.worker.js` symlinks to),
confirmed the appended line was visible through the symlink with zero build
step, then restored the file to its exact original content (`md5sum` matched
before and after the edit). Timed the tier's cost:

```
MOZCONFIG=../.mozconfig ./mach run --version
```

(run inside `nix develop .#firefox`, cwd `upstream/`) — **1.05s** wall
(mach's own per-process timer printed `0:00.73`; the wrapper's stopwatch,
which also includes shell-entry overhead, measured 1052ms). Measured 2026-08-22
on `legion`.

After restoring the edited file, `git -C upstream status --porcelain` and a
fresh `bash scripts/fetch-upstream.sh` (exit 0) confirmed the tree returned to
exactly the expected-dirt state `scripts/fetch-upstream.sh` accepts — no
residual tier-1 edit.

**Chrome-side JS needs a startup-cache purge, or the edit silently does not run.**
Edits under `powerbrowser/shell/` (`*.js`, `*.sys.mjs`) reach `objdir/dist/bin`
through symlinks, but Gecko's startup cache serves the previously compiled
script: no error, no warning, the old code runs. After such an edit, launch with

```sh
rm -rf objdir/tmp/profile-default/startupCache
MOZ_PURGE_CACHES=1 ./objdir/dist/bin/powerbrowser -purgecaches
```

Theia-side edits need a rebuild instead (`yarn build` in `theia/`). Observed
2026-09-06 on `legion`, on the tree of the GUI-02 spike: an env-gated block
added to `powerbrowser/shell/powerbrowser.js` printed nothing until the cache
was purged.

### Tier 2 — `./mach build faster`

For a **preprocessed frontend file** — one `moz.build` compiles via `PP_FILES`
rather than installing as a plain symlink — a build is required, but only the
fast, non-compiling `faster` tier. Forced this by updating a real preprocessed
file's modification time only, changing no content:

```
touch upstream/browser/base/content/browser.xhtml
```

(`browser/base/content/browser.xhtml`, the canonical preprocessed
browser-window document, is the file this tier is measured against.) `touch`
changes no content — `git -C upstream diff --stat -- browser/base/content/browser.xhtml`
stayed empty before and after every run below, so CLAUDE.md's
never-modify-Gecko rule is not touched by this measurement, only its
modification time is. Timed:

```
MOZCONFIG=../.mozconfig ./mach build faster
```

(inside `nix develop .#firefox`, cwd `upstream/`), run twice (re-`touch`ing
before each), since the first run after a cold objdir is not representative —
it also pays mach's own one-time "build" virtualenv-site creation cost.
Invocation 1 (cold, includes that one-time cost): mach-reported wall time 20s.
Invocation 2 (warm): mach-reported wall time **1.84s** (`0:01.84` marker); a
third warm run confirmed **1.83s**. Both measured 2026-08-22 on `legion`. The
warm figure — **1.84s** — is the one to use for this tier, not the 2.55s
research inherited: D-73 forbids carrying that number forward, and the two are
close but not the same measurement.

### Tier 3 — full `./mach build`

Trigger: a change to a **compiled define** — in this repo that means editing
`patches/010-powerbrowser-identity.patch` (the one Gecko patch hunk this phase
carries) or adding a `--with-*`/`--enable-*` option to `.mozconfig`. Neither
happened as part of this measurement task; the phase's build budget is
exactly two full builds, both already spent by the two compiled-define
changes below, harvested here rather than re-run:

Every row names the tree it was measured on. Rows #1 and #2 predate the
rename and were measured on the **upstream project's tree**; row #3 is the
first full build of the **Power Browser** tree. Mixing the three under one
heading without that attribution would read as three measurements of the same
thing, which they are not.

| Build | Tree / host | Command | Wall time | sccache hit rate | Source |
|---|---|---|---|---|---|
| #1 (dev, `objdir/`) | pre-rename tree, `legion`, 2026-08-21 | `MOZCONFIG=../.mozconfig ./mach build` | **2368s (~39m28s)** | not recoverable — the sccache server that ran this build had already recycled by the time its stats were checked in the same session (`03-01-SUMMARY.md`, "Issues Encountered") | `03-01-SUMMARY.md` |
| #2 (release, `objdir-release/`) | pre-rename tree, `legion`, 2026-08-21 | `POWERBROWSER_OBJDIR=objdir-release POWERBROWSER_BRANDING=powerbrowser/branding/release MOZCONFIG=../.mozconfig ./mach build` | **2822s (~47m2s)** | **0.14%** — 5648 new sccache requests this build's delta, 5043 executed, 7 hits, 5022 misses | `03-05-SUMMARY.md` |
| #3 (dev, `objdir/`) | **Power Browser tree**, `legion`, 2026-08-30 | `scripts/smoke-firefox.sh` (which runs `MOZCONFIG=../.mozconfig ./mach build`) | **2830s (~47m11s)** | not sampled — the build ran under `scripts/smoke-firefox.sh`, which does not capture `sccache --show-stats`; the near-zero hit rate measured for #2 is the expectation for this class of change | `01-04-SUMMARY.md` |
| #4 (dev, `objdir/`) | **Power Browser tree** at `FIREFOX_153_5_0esr_BUILD1`, `legion`, 2026-10-16 | `scripts/smoke-firefox.sh` (which runs `MOZCONFIG=../.mozconfig ./mach build`), after `./mach clobber` | **2388s (~39m48s)** | not sampled | `18-02-SUMMARY.md` |
| #5 (release, `objdir-release/`) | **Power Browser tree** at `FIREFOX_153_5_0esr_BUILD1`, `legion`, 2026-10-16 | `POWERBROWSER_OBJDIR=objdir-release POWERBROWSER_BRANDING=powerbrowser/branding/release MOZCONFIG=../.mozconfig ./mach build`, after `./mach clobber` with the same env | **2620s (~43m40s)** | not sampled | `18-03-SUMMARY.md` |

Builds #1 and #2 are not re-run — doing so would spend two more full compiles
for figures that would not differ; both are taken verbatim, with their exact
commands, from the SUMMARY that actually ran them. Build #3 is this repo's own
first full compile, from a `scripts/fetch-upstream.sh` clone (677s, 5.6 G) with
both patches applied. The **release** variant was deliberately **not** re-built
after the rename: nothing in this phase needs a second objdir, and row #2's
figure already bounds it. Rows #4 and #5 are the Phase 18 re-pin builds at 153.5.0esr, each from a
clobbered objdir.

### The three tiers, at a glance

| Tier | Example file in this tree | Command | Measured cost |
|---|---|---|---|
| 1 — no build | `objdir/dist/bin/modules/PageThumbs.worker.js` (symlink into `upstream/toolkit/components/thumbnails/PageThumbs.worker.js`) | `MOZCONFIG=../.mozconfig ./mach run --version` | 1.05s (2026-08-22, `legion`) |
| 2 — `./mach build faster` | `upstream/browser/base/content/browser.xhtml` (preprocessed) | `MOZCONFIG=../.mozconfig ./mach build faster` | 1.84s warm (2026-08-22, `legion`) |
| 3 — full `./mach build` | `patches/010-powerbrowser-identity.patch` (or any `--with-*`/`--enable-*` `.mozconfig` option) | `MOZCONFIG=../.mozconfig ./mach build` | 2368s / 2822s (2026-08-21, `legion`) |

**A file that is neither symlinked into `dist/bin` nor preprocessed falls
through to tier 3** — a full `./mach build` — because there is no faster path
the build system exposes for it; the tier a file belongs to is a property of
how `moz.build` installs it (`FINAL_TARGET_FILES` symlink vs. `PP_FILES`
preprocessing vs. a compiled source the linker consumes), not a menu choice.

**Accepted cost, per D-70:** a clean clone has no minutes-to-runnable path —
the first build is always a full compile (tier 3, ~54 minutes per the
original research estimate; this phase's own two full builds ran 2368s and
2822s). Artifact builds cannot produce a renamed binary (C-1: `MOZ_APP_NAME`
is a compiled define and the Taskcluster job configuration hardcodes
`product="firefox"`), so there is no faster path to a first, PowerBrowser-branded
binary than tier 3.

## The compiled-file boundary (D-72)

`scripts/check-patch-surface.sh` is the single source of truth for which file
types a patch in `patches/*.patch` may touch. It rejects any patch whose
target path ends in one of the compiled suffixes drawn from
`upstream/python/mozbuild/mozbuild/frontend/emitter.py:1126-1133` — `.c .cc
.cxx .cpp .h .hh .hpp .inc .m .mm .rs .s .S .asm .webidl .idl .ipdl .ipdlh`,
plus any `Cargo.*` file — reading each patch's own `+++ b/` header lines, never
grepping the patch body (a body-grep would false-match a string that merely
appears inside changed content).

Two invocations:

```
bash scripts/check-patch-surface.sh              # scans patches/, exits 1 on any offense
bash scripts/check-patch-surface.sh --self-test   # plants a throwaway compiled-file patch in a mktemp dir and asserts it IS rejected
```

**Tier consequence:** a patch that touches a compiled file means every
subsequent rebuild is tier 3 (a full `./mach build`, ~2368-2822s measured
above) — there is no tier-1/tier-2 path for a change the linker has to see.
This is the entire reason the phase's one Gecko patch
(`patches/010-powerbrowser-identity.patch`) is confined to a single hunk in
`browser/moz.configure`, a config file, not a compiled source.

Deliberately **not created**: `powerbrowser/ARTIFACT-BOUNDARY.md` (the name
presumes artifact builds, which D-70 replaced with the tiered loop — this
section of `docs/BUILD.md` is the boundary's home instead) and
`powerbrowser/INTERNAL-APIS.md` (that catalogues `PowerBrowserAPI.sys.mjs`
touchpoints, none of which exist until Phase 4).

## Endpoints and the one carve-out (D-83–D-88)

`powerbrowser/endpoint-allowlist.json` is the single machine-readable source of
truth for every host and pref this build's network/telemetry surface is
allowed to touch, read directly by `scripts/verify-endpoints.sh`'s layers 1
and 3. Any host observed at runtime absent from this file, or any host in it
with disposition `deny`, is a failure — Mozilla or not (D-85).

**The one carve-out, stated plainly:** `firefox.settings.services.mozilla.com`
(Remote Settings) stays on. Its polling cadence is
`services.settings.poll_interval` = **86400 seconds (24 hours)**
(`modules/libpref/init/all.js:1745`) — not the shorter, sometimes-quoted
figure of 21600 seconds, which belongs to `app.normandy.run_interval_seconds`,
a subsystem this phase compiles out (`imply_option("MOZ_NORMANDY", False)`)
and is therefore moot. The reason
Remote Settings cannot simply be turned off: `services/settings/Utils.sys.mjs:52-84`
refuses any `services.settings.server` override off Nightly, and the only
alternative, the `DisableRemoteSettingsAndAcceptSecurityConsequences` policy,
also stops CRLite certificate-revocation data, intermediate-certificate
preloading, and tracking-protection list updates — unacceptable on a substrate
whose entire pitch is that it is a real browser.

Every host in `powerbrowser/endpoint-allowlist.json` with disposition `allow`,
and why:

| Host | Reason |
|---|---|
| `firefox.settings.services.mozilla.com` | D-83: Remote Settings, the carve-out above |
| `content-signature-2.cdn.mozilla.net` | D-83, same feature: content-signature certificate-chain verification for Remote Settings collections |
| `firefox-settings-attachments.cdn.mozilla.net` | D-83, same feature: Remote Settings' attachment CDN (CRLite's own data, one of D-83's own reasons to keep Remote Settings on) |
| `edgedl.me.gvt1.com` | D-86: Google's Widevine CDM download host — DRM stays working, no Mozilla host involved; `media.eme.enabled` defaults false on Linux so this costs nothing unattended |
| `safebrowsing.google.com` | D-85: Google Safe Browsing v2 API — deliberate waiver, malware/phishing protection stays on |
| `safebrowsing.googleapis.com` | D-85: Google Safe Browsing v4 API — same waiver as v2 |
| `update.googleapis.com` | D-86 extension: Widevine's Chromium-Omaha update-check host, fired by the same periodic AddonManager timer regardless of `media.eme.enabled` — corrects C-4's premise that Widevine is fully idle-gated (it is idle-gated for the EME-toggle path, not this periodic path) |
| `www.google.com` | D-86 extension: the Omaha check's own redirect target, observed immediately after `update.googleapis.com` in the same session |
| `dl.google.com` | D-86 extension: a second real redirect target in the same Widevine Omaha update-check flow, surfaced during this plan's own phase-gate close-out run — the redirect response names a different Google-owned download host between runs; same waiver category as `www.google.com`, not a new concern |

The three proof layers and their positive-control forms:

```
bash scripts/verify-endpoints.sh --layer 1                     # static pref grep
bash scripts/verify-endpoints.sh --layer 1 --positive-control   # restores a stock URL, must go red

bash scripts/verify-endpoints.sh --layer 2                     # exact-path strace on $HOME/.mozilla/firefox
bash scripts/verify-endpoints.sh --layer 2 --positive-control   # sandboxed $HOME with a real .mozilla/firefox dir, must go red

bash scripts/verify-endpoints.sh --layer 3                     # MOZ_LOG=nsHostResolver:5, 35s capture window
bash scripts/verify-endpoints.sh --layer 3 --positive-control   # re-enables OpenH264, must go red
```

`distribution/policies.json` install command, verbatim as run in
`03-03-SUMMARY.md` (a full rebuild does not produce this file, and a clobbered
objdir loses it — it must be re-copied after any clobber):

```
mkdir -p objdir/dist/bin/distribution
cp powerbrowser/distribution/policies.json objdir/dist/bin/distribution/policies.json
```

## Telling a dev build from a release build (BRAND-06)

What a person actually sees, side by side on a real desktop session: the dev
variant paints a real window title bar, reading the page title followed by
the suffixed brand name from its own `brand.ftl` (`... — PowerBrowser Dev`); the
release variant paints no title bar at all and keeps drawing tabs-in-titlebar
(client-side decorations), the same as it always did.

The two variants diverge in exactly three places:

1. `configure.sh`'s `MOZ_APP_DISPLAYNAME` (dev: "PowerBrowser Dev", release:
   "PowerBrowser") — this was already correct and machine-verified before this
   gap closed; it was never the problem.
2. The `brand.ftl` / `brand.properties` pair, per variant. `brand.ftl`'s
   `-brand-full-name` already diverged correctly; `brand.properties`'s
   `brandFullName` did not (03-REVIEW.md WR-01) — both now read the same
   suffixed/unsuffixed value within each variant.
3. The dev-only `browser.tabs.inTitlebar` default (`powerbrowser/branding/dev/
   pref/firefox-branding.js`, value `0`) — the release tree carries no such
   default, and that absence is what makes the two variants differ in window
   shape, not just in string content.

The icon sets also still differ (dev's `default*.png` carry a small
corner-badge overlay the release set does not), but the badge alone was
found insufficient for at-a-glance distinguishability on 2026-08-22 (a few
pixels at 16-32px) — this gap closure did not re-badge the icons; it added
the title-bar divergence as the primary, unambiguous cue instead.

`verify-platform.sh`'s `branding-variant-divergence` check is the
machine gate for both of the divergences this fix added (properties string,
titlebar default); its self-test proves it goes red if either is removed.
It cannot verify the perceptual claim itself — "tellable apart at a
glance" is a human judgment, recorded in `03-MANUAL-VERIFICATION.md`.

`branding-variant-divergence` reads the installed `brand.properties` and
`firefox-branding.js` under both `objdir/dist/bin/...` and
`objdir-release/dist/bin/...`, so it needs a full dev build **and** a full
release build (`POWERBROWSER_OBJDIR=objdir-release ... ./mach build`, Tier 3)
already in place — it runs only under `verify-platform.sh`'s full
mode, never under `--quick`. `--quick` still runs the check's self-test
(synthetic temp files, no build required).

All of these files (`brand.properties`, `firefox-branding.js`) are symlinked
into `dist/bin` (D-70 tier 1), so editing them and re-running needs no
rebuild.

## Packaging procedure (PKG-01/PKG-02, 08-04)

Self-hosted MAR updates (fork-signed, verified — see the
key-custody rung below), plus the Nix-built Windows
installer. Proven on Linux; MSIX and DMG need real hosts (08-05).

### Key-custody rung (T-08-04a)

MARs are signed with the fork's own key (NG-065). The key pair was generated locally (decisions.md D5, R12). The NSS key store is at `~/.config/powerbrowser-release/mar-key/`, outside the repo, with its password in `password.txt` there. Only the public certificate, `powerbrowser/packaging/mar/mar-primary.der`, is tracked.

`patches/030-powerbrowser-mar-certificates.patch` makes the updater embed that certificate in both of its slots on every update channel. One key: a compromised key needs a client rebuild.

Sign (one command; run at the repository root):

```
printf '%s\n' "$(cat ~/.config/powerbrowser-release/mar-key/password.txt)" | objdir/dist/bin/signmar -d ~/.config/powerbrowser-release/mar-key -n powerbrowser-mar -s <in.mar> <out.mar>
```

signmar reads the password from stdin when stdin is not a terminal.

Verify a MAR against the tracked certificate (Linux signmar is built with
`MAR_NSS`, so `-D` is not parsed; import the certificate into a scratch NSS
database and verify with `-d`/`-n`):

```
V=$(mktemp -d); export LD_LIBRARY_PATH=objdir/dist/bin
objdir/dist/bin/certutil -N -d "sql:$V" --empty-password
objdir/dist/bin/certutil -A -d "sql:$V" -n powerbrowser-mar -t ",," -i powerbrowser/packaging/mar/mar-primary.der
objdir/dist/bin/signmar -d "$V" -n powerbrowser-mar -v <mar> && echo VERIFIED; rm -rf "$V"
```

`scripts/verify-ng-065-mar-signature.mjs` (row `ng065-mar-signature-enforced`) drives the packaged `updater` and requires four outcomes:
- a fork-signed MAR applies;
- an unsigned MAR is refused with `CERT_VERIFY_ERROR`;
- a MAR signed with a foreign key is refused with `CERT_VERIFY_ERROR`;
- a fork-signed MAR for another channel is refused with `MAR_CHANNEL_MISMATCH_ERROR`.

Update descriptors are still generated by `buildUpdateXml` and served over HTTPS.

### Updater enablement

`.mozconfig` no longer carries `--enable-unverified-updates`. The build defines `MOZ_VERIFY_MAR_SIGNATURE`, and `MAR_CHANNEL_ID` and `ACCEPTED_MAR_CHANNEL_IDS` are both `<app_basename>-default` (emitted by `emitMozconfig`, baked into `update-settings.ini`). Any mozconfig change is a tier-3 rebuild. After building, assert the updater compiled in and verification is on:

```
test -x objdir/dist/bin/updater && echo UPDATER_PRESENT
grep -q "'MOZ_VERIFY_MAR_SIGNATURE'" objdir/config.status && echo VERIFY_ON
```

`config.status` carries `MOZ_VERIFY_MAR_SIGNATURE` plus the two channel ids. `patches/030-powerbrowser-mar-certificates.patch` makes the updater embed the fork certificate in both slots.

Two facts about where the update URL lives:

- `application.ini`'s `[AppUpdate]` URL host comes from `configuration.toml` `[urls] update` (NG-064). `generated/identity.configure` emits `set_config("MOZ_APPUPDATE_HOST", …)`, which `upstream/build/moz.build:96` prefers over its `aus5.mozilla.org` default. It is a compiled value, so a change needs a tier-3 rebuild. The `AppUpdateURL` enterprise policy would win when present (`UpdateService.sys.mjs:5466`), so `powerbrowser/distribution/policies.json` carries none: the manifest is the only update URL source (UPD-12).
- `app.update.url` as a pref does not exist (removed in Bug 1568994; the
  removal is noted in `upstream/browser/app/profile/firefox.js:156`), so
  no pref file can carry the fork URL. The compiled `MOZ_APPUPDATE_HOST`
  in `application.ini` above is the only mechanism: `policies.json`
  carries no `AppUpdateURL` (UPD-12).

### Policy install (dev runs only)

The Linux package carries `distribution/policies.json` (`powerbrowser/packaging/package-linux.sh`, NG-072). A run straight out of `objdir/dist/bin` does not, and a clobbered objdir loses any copy, so a dev run still needs:

```
mkdir -p objdir/dist/bin/distribution
cp powerbrowser/distribution/policies.json objdir/dist/bin/distribution/policies.json
```

(This extends the 03-03 command with the `mkdir -p` the original assumed.)
The policy disables telemetry and studies; it carries no update URL. The
08-04 live run, which saw layer 3 fail without the policy, predates UPD-12,
when the policy still set the update URL. A layer-3 failure on an update host
now points at the compiled `MOZ_APPUPDATE_HOST` (the fork host is an
allowlisted `allow`: the project's own update service), not at a missing
policy file.

### MAR build and serve loop (the N to N-plus-1 proof)

The recorded hop evidence predates 153.5: it is the N = 153.1.0 to
N-plus-1 = 153.1.1 hop in `.mozbuild/mar-hop/hop.json`, and it was not re-run
at 153.5. A `mar-update-hop` PASS re-verifies that recorded evidence and is not
a 153.5 proof. A re-run needs an N-plus-1 above the current N, and
`powerbrowser/packaging/version-nplus1/` still carries 153.1.1 (backlog 999.2).

Prerequisites: the task-1 rebuilt tree is version N (at the recorded 08-04
hop, `objdir/dist/bin/application.ini` read `Version=153.1.0`; the current
tree reads `Version=153.5.0`, so `version-nplus1/` must be bumped above it
first, backlog 999.2); the N-plus-1
sources are `powerbrowser/packaging/version-nplus1/` (test-only fork
version `153.1.1` / `153.1.1esr` — NOT an upstream ESR tag; the file
shapes match `upstream/browser/config/version*.txt` byte for byte except
the version string). All commands below run inside `nix develop
.#firefox` with cwd `upstream/` unless stated.

1. Build N-plus-1 in a SEPARATE objdir (never reuse N's — the proof needs
   two distinct builds). The version bump rides the supported
   `--with-version-file-path` configure lever (absolute path reads
   outside topsrcdir; `upstream/build/moz.configure/init.configure`
   milestone function), via scratch mozconfig `.mozbuild/nplus1.mozconfig`
   (untracked by design — absolute paths are host-specific; it mirrors
   the tracked `.mozconfig` plus the one flag):

   ```
   ./mach build   # with MOZCONFIG=../.mozbuild/nplus1.mozconfig
   ```

   `objdir-nplus1/` is `.gitignore`'d spill (D-01). Confirm the payload
   version: `objdir-nplus1/dist/bin/application.ini` must read
   `Version=153.1.1` with a build ID distinct from N's (build IDs derive
   from build time, so two builds always differ).

2. Package each build and stamp the precomplete file (upstream docs flow;
   the fork's staged app dir is `dist/powerbrowser`, not `dist/firefox`):

   ```
   ./mach package
   touch "<objdir>/dist/powerbrowser/precomplete"
   ```

   (`mach package` on this tree already emits `precomplete` and the
   `updater` binary into the staged dir — observed live 08-04 — so the
   touch is a docs-parity no-op, kept so the procedure matches upstream's
   verbatim. A `powerbrowser-*.tar.xz` beside the staged dir is the
   expected side product. Packaging needs the repo-root `defs.mk`
   (08-04, PKG-02): without that one-line `XPI_ROOT_APPID` mapping the
   branding locales fail with "XPI_ROOT_APPID is not defined".)

3. Emit the N-plus-1 MAR. `/bin/bash` does not exist on NixOS, so invoke
   the script through `bash` explicitly (its shebang is `/bin/bash`):

   ```
   MAR="<objdir-nplus1>/dist/host/bin/mar" MOZ_PRODUCT_VERSION=153.1.1 MAR_CHANNEL_ID=powerbrowser-default \
     bash tools/update-packaging/make_full_update.sh <out>/nplus1.unsigned.mar "<objdir-nplus1>/dist/powerbrowser"
   ```

   `MAR_CHANNEL_ID` must equal the build's `ACCEPTED_MAR_CHANNEL_IDS` (`objdir/config.status`). Emit `<out>/nplus1.unsigned.mar` above, then sign it into `<out>/nplus1.mar` with the signing command in "Key-custody rung" above. The updater refuses an unsigned MAR (`CERT_VERIFY_ERROR`) and a MAR for another channel (`MAR_CHANNEL_MISMATCH_ERROR`). `MOZ_PRODUCT_VERSION`
   must equal the N-plus-1 payload version the previous step baked
   (the updater stamps it into the MAR product-info block).

4. Write the served descriptor with the gate's own generator (never by
   hand) and serve descriptor plus MAR over loopback, capturing the
   access log (cwd repo root; the script carries an import guard so the
   generator is importable without running the gate):

   ```
   node --input-type=module -e "
   import { readFileSync, writeFileSync } from 'node:fs';
   import { buildUpdateXml } from './scripts/verify-mar-update-hop.mjs';
   const marBytes = readFileSync('.mozbuild/mar-hop/nplus1.mar');
   const pv = readFileSync('upstream/config/milestone.txt', 'utf8').trim().split('\n').pop();
   writeFileSync('.mozbuild/mar-hop/serve/update.xml', buildUpdateXml({ marBytes,
     marUrl: 'http://127.0.0.1:8000/nplus1.mar', appVersion: '<N+1 version>',
     platformVersion: pv, buildID: '<N+1 buildID>', displayVersion: '<N+1 display>' }));
   "
   cp .mozbuild/mar-hop/nplus1.mar .mozbuild/mar-hop/serve/nplus1.mar
   python3 -m http.server 8000 --directory .mozbuild/mar-hop/serve 2> .mozbuild/mar-hop/server-access.log &
   ```

   (The 08-04 proof used `appVersion 153.1.1`, `platformVersion 153.1.0`
   from `upstream/config/milestone.txt`, `buildID 20260904191328`,
   `displayVersion 153.1.1esr` from the N+1 `config.status`.)

   The descriptor carries sha512 plus size of the MAR bytes; regenerating
   it from identical bytes is byte-identical (no timestamps or nonces —
   PKG-02/idempotency, asserted in the gate by generating twice).

5. Stage the N test install: copy the packaged N tree to a writable
   proof dir (never update the build tree in place — further incremental
   builds would break and a clobber would be needed), install a test
   `distribution/policies.json` pointing `AppUpdateURL` at the loopback
   descriptor, and drive one hop headless through the client's own
   scheduled background-update timer (NOT `--backgroundtask
   backgroundupdate`: `MOZ_UPDATE_AGENT` exists only on Windows/macOS per
   `upstream/build/moz.configure/update-programs.configure`, so that task
   is unregistered on Linux — verified live 08-04 — and a Marionette
   session crashes registering the fork shell window, which has no
   tabBrowser):

   ```
   # test profile prefs: app.update.background.force=true (bypasses the
   # install preconditions), app.update.log=true, app.update.interval=60
   # (a fresh profile fires the due update-timer soon after startup),
   # services.settings.server="" (see the resolver-log note below)
   MOZ_REMOTE_SETTINGS_DEVTOOLS=1 MOZ_LOG=nsHostResolver:5 \
     MOZ_LOG_FILE=<proof>/client \
     LD_LIBRARY_PATH=<install-n> \
     <install-n>/powerbrowser --profile <test-profile> about:blank
   ```

   `MOZ_REMOTE_SETTINGS_DEVTOOLS=1` lets the blank settings-server pref
   take effect, silencing Remote Settings (and its content-signature /
   attachments `*.mozilla.net` callouts) so the resolver log isolates
   the update path — test-profile-only, shipped behavior unchanged.
   `LD_LIBRARY_PATH=<install-n>` compensates a Nix dev-shell artifact:
   the `updater` RUNPATH names a nonexistent `outputs/out/lib` and
   carries no app-dir entry, so without it the loader fails on
   `libnspr4.so` (observed live); `nsUpdateDriver` `execv()`s the
   updater, which inherits this environ. The 08-04 run is scripted as
   `.mozbuild/mar-hop/drive-hop.py` (untracked proof tooling, like
   `nplus1.mozconfig`).

   What a cycle looks like: the due timer fires, the client fetches the
   descriptor and the MAR from loopback (hash/size verified), the
   staging updater extracts into `<install-n>/updated/` and writes
   `applied`, and the swap into place happens at the next startup via
   the replace invocation. The `pending` window is seconds wide (fast
   loopback + immediate self-restart), so poll `application.ini` for
   the flip rather than the status file. Then record `hop.json` (read
   post-hop `Version`/`BuildID` from the file, never invented) plus
   both logs under `.mozbuild/mar-hop/` per the gate's evidence
   contract. The 08-04 evidence: N `153.1.0`/`20260904184538` to N+1
   `153.1.1`/`20260904191328`, server log with descriptor plus MAR
   GETs, resolver log with zero `*.mozilla.org` / `*.mozilla.net`
   (only `update.googleapis.com`, Safe Browsing).

   UPD-24 (46-03) extends the transcript `hop.json` carries (the Phase 44
   `build-update-xml.mjs` import direction, if that script exists, is
   recorded in the plan SUMMARY; this procedure uses the in-file
   `buildUpdateXml` directly):

   - `transcript.readyNotification`: the exact ready-notification text shown
     (must equal the contracted UPD-20 string with the N+1 version
     interpolated, derived at check time from
     `theia/extensions/branding/src/browser/powerbrowser-update-copy.ts`).
   - `transcript.restartClicked`: true (the Restart-now click event).
   - `transcript.postVersion` / `transcript.postBuildID`: the version and
     buildID read post-restart (must equal N+1; the buildID must be distinct
     from N's).
   - `transcript.layoutRestored`: true (shell layout + mode persisted across
     the restart, seeded from the profile-storage map).
   - `readOnly.cannotUpdate`: the exact string recorded by a second evidence
     run with a read-only app directory (chmod plant on the staged app-dir
     copy in mkdtemp for the self-test; the documented procedure for the
     live run). Must equal the contracted UPD-21 cannot-update string,
     never a ready string; `readOnly.recordedReady` must not be true.

   UPD-27 probe-window capture (same procedure): drive the available +
   manual UpdateListener paths in-Gecko with a fixture update carrying
   `detailsURL`, capture the probe window with
   `MOZ_LOG=nsHostResolver:5`, and sift `Resolving host [...]` lines. The
   assertion is set-difference (derived contacted set must be empty for
   the window), never the absence of an own-log line.

   The Phase 45 packaged tarball + MAR re-run stays Phase 50's criterion,
   not this procedure's; the Phase 44 `build-update-xml.mjs` import
   direction is recorded in the plan output, not built here.

6. Prove it: `node scripts/verify-mar-update-hop.mjs` (row
   `mar-update-hop`). It requires two distinct versions AND build IDs (a
   same-version loop fails as plumbing-only), the served descriptor
   byte-identical to a fresh emission, fork-server access entries for
   descriptor and MAR, zero `*.mozilla.org` / `*.mozilla.net` hosts
   in the sifted resolver log, plus the transcript fields above
   (notification text, Restart-now click, N+1 landing with layout) and the
   read-only cannot-update variant. `node scripts/verify-nimbus-exposure.mjs`
   (row `nimbus-exposure`) asserts the exposure call neither threw nor
   requested network; its `--self-test` twin runs the fixture doubles.

### NSIS-on-Nix path (PKG-01)

`nix shell nixpkgs#nsis --command makensis -VERSION` gives `3.12`. The
pinned `upstream/browser/installer/windows/nsis/installer.nsi` compiles
on the Linux host with the generated `branding.nsi` (six defines,
canonical values) — the 08-04 spike refuted the hypothesized Windows-only
plugin blocker: NSIS plugins execute on the install target, never in the
makensis process, so the compiler only embeds the plugin DLLs already
checked into `upstream/other-licenses/nsis/Plugins/`.

Row: `scripts/verify-platform.sh --only installer-build-proof` (needs
makensis via the nix shell, python3, a `generated/` tree and a built
objdir — all fail-loud). It stages the pinned inputs from the tree at
check time (real installer scripts, toolkit files, plugin DLLs, the real
generated branding.nsi, `defines.nsi` preprocessed with check-time
values, locales through the real `preprocess-locale.py`), compiles, and
requires `setup.exe`.

Stand-ins that stay labeled, never blessed (08-05 work): the wizard
bitmaps (`wizHeader.bmp`, `wizHeaderRTL.bmp`, `wizWatermark.bmp`),
`firefox64.ico` and `stubinstaller/` artwork come from
`upstream/browser/branding/unofficial/` — the fork ships no wizard
artwork yet; and `defines.nsi` now takes `AppName` from the build's `MOZ_APP_NAME` and `CERTIFICATE_NAME` from the generated `CompanyName`, and the installer sends no telemetry ping (`patches/040-powerbrowser-nsis.patch`, NG-066, row `ng066-nsis-branding-no-ping`). `CERTIFICATE_ISSUER` stays upstream's until a fork Windows signing certificate exists (deferred with the Windows packaging row). The row's PASS line says the compile
only.

### Packaging hosts (08-05): capability record

One row per host. Every later task cites its host by name; no artifact work
starts on an unnamed host. MSIX and DMG are never attempted on Linux: the
pinned tree's own tooling is the authority — `msix.py` raises without
`makeappx.exe`/`signtool.exe` from the Windows SDK, and `dmg.py` shells out
to macOS-only `hdiutil`/`SetFile`.

Numbered versions on `staged-unexecuted` rows are the REQUIRED spec (floor),
not observations: the exact media, OS, and SDK builds are recorded here at
provision time. Observed facts carry their evidence inline.

| Host | OS / toolchain (numbered) | makensis | State | Evidence / unblock |
|---|---|---|---|---|
| nix-linux (legion) | NixOS 26.05.8954 (Yarara), x86_64, `nix develop .#firefox` toolchain per toolchain-baseline.txt | makensis 3.12 (`nix shell nixpkgs#nsis --command makensis -VERSION` gives `v3.12`, re-verified 2026-09-05) | reachable | Proof: 08-04 `installer-build-proof` PASS — the pinned installer.nsi compiled with the generated branding.nsi into setup.exe in 3.4s |
| pkg-win11 | Windows 11 23H2+ install media (required) + Windows SDK 10.0 with makeappx.exe and signtool.exe via WINDOWSSDKDIR or PATH (required) + NSIS 3.12 (required) | n/a until provisioned (Windows-side NSIS after the guest exists) | staged-unexecuted | Provisioning error (observed 2026-09-05): `sudo -n true` fails (`sudo: a password is required`), so qemu:///system is unmanageable — no domain can be defined, no NAT network created, and the root-owned `/var/lib/libvirt/images/win11.qcow2` is unreadable; `virsh list --all` shows zero defined domains; that qcow2 is 200704 bytes (a fresh-image stub, no installed guest OS); no guest agent, no guest credentials, and no Windows SDK/NSIS on any reachable guest exist. Media present and verified listable: `win11-install.iso` (8471603200 bytes, UDF volume `CCCOMA_X64FRE_EN-US_DV9`, 2026-03-07) with EFI boot plus `sources/install.wim` (7.5 GB) plus `sources/setup.exe`, and `virtio-win.iso` (1435727872 bytes), both 2026-07-29. A genuine MSIX proof additionally needs a full Windows Gecko build (multi-hour Windows compile) that no host can run yet. Unblock (operator, needs privilege): create the libvirt NAT network, define the pkg-win11 domain from the verified media above, run an unattended install, install the QEMU guest agent plus Windows SDK 10.0 plus NSIS 3.12, build the Windows dist, then hand the agent guest access — or provision any Windows 11 host with SDK plus NSIS and name it pkg-win11. Dependent cells (Windows MSIX build, Windows install/launch/uninstall/no-residue, Windows N to N-plus-1 hop, Windows alongside-stock-Firefox) stay staged-unexecuted until then. |
| pkg-macos | macOS 14+ with Xcode command-line tools (required; hdiutil and SetFile are system tools) | n/a (no NSIS role on macOS) | staged-unexecuted | Provisioning error (observed 2026-09-05): no macOS install image exists anywhere reachable — `/var/lib/libvirt/images/` holds only the Windows media and stub above, and a filesystem-wide `*.dmg` search returns nothing; no Apple hardware; no lawful download path for a macOS image from Linux. Unblock (operator): provision a real Mac (or lawful macOS VM) with Xcode command-line tools, build the macOS dist on it, and hand the agent access as pkg-macos. Dependent cells (DMG build, macOS install/launch/uninstall/no-residue, macOS N to N-plus-1 hop, macOS alongside-stock-Firefox) stay staged-unexecuted until then. |

Test-signing posture (T-08-05a, accepted): when the staged hosts provision,
matrix proofs run test-signed (`signtool` test cert on pkg-win11, ad-hoc
`codesign` on pkg-macos) with the expected SmartScreen and Gatekeeper
friction documented per cell. Production certificate procurement is a later
decision per RESEARCH open question 1 and is NOT procured in this phase.

### MSIX / DMG mechanics (for the staged hosts)

- MSIX: `upstream/python/mozbuild/mozbuild/repackaging/msix.py`
  raises without `makeappx.exe`/`signtool.exe` from the Windows SDK —
  a real Windows host/VM, no Linux fallback.
- DMG: `upstream/python/mozbuild/mozpack/dmg.py` shells out to
  macOS-only `hdiutil`/`SetFile` — a real macOS host/VM.
- The per-OS install → launch → uninstall → no-residue matrix, plus the
  alongside-stock-Firefox interleaved launch, run there (matrix section
  below records the Linux cells green and the staged cells with unblocks).

### Linux package (NG-063, NG-072)

`nix develop .#firefox --command bash powerbrowser/packaging/package-linux.sh`
runs `./mach package` and adds these to the staged application directory:
- `theia/`: the built app's `lib/` without source maps, its `package.json`, and
  `plugins/` when present;
- `node/`: the official Node release pinned in `powerbrowser/packaging/node-runtime.json`,
  downloaded once into `.mozbuild/node-dist/` and sha256-checked against the pin;
- `distribution/policies.json`.

The Node download happens at build time and is deliberately not in the
runtime allowlist: that file governs browser/sidecar egress only (R15).

The pin's provenance is established by the release train's detect job, not by
this script. For each Node 24 bump that job fetches nodejs.org's
`SHASUMS256.txt` and its `.sig`, verifies the signature with `gpgv` against the
nodejs/release-keys keyring, and asserts that the tarball's sha256 equals the
signed entry before it opens `chore/node-v24.x` (RELEASING.md "Node provenance"
records the chain). This script has no keyring, so it enforces the committed
pin: a download that does not hash to it is deleted and the run fails naming
it, and an unverified archive is never unpacked into the package.

It then refreshes `precomplete` and rewrites
`objdir/dist/<app>-<Version>.en-US.linux-x86_64.tar.xz`. A packaged install runs
its own staged backend and Node unless a user pref names another path (NG-063).
`objdir/dist/bin` is untouched, so dev runs keep the dev tree. Node bumps arrive as `chore/node-v24.x` pull requests from the release train;
there is no manual pin step.
The Gecko binaries are built in the Nix shell, so the package runs where those
store paths exist.

Checks: `ng063-packaged-launch`, `ng072-policies-packaged-webextension`.

### Per-OS install matrix with update hops (08-05)

Rows `installer-build-proof` and `mar-update-hop` both re-run PASS on the
current tree 2026-09-05 (nix-linux). The Linux cells below ran live the same
day via `.mozbuild/matrix/run-matrix.sh` (untracked proof tooling, same
standing as `drive-hop.py`); Windows and macOS cells are staged-unexecuted
per the capability record above, never green without their logs. The Linux
row's evidence, the hop included, predates 153.5 and was not re-run at 153.5.

| OS / host | install | launch | alongside stock Firefox | uninstall + no-residue | N to N-plus-1 hop |
|---|---|---|---|---|---|
| Linux / nix-linux | GREEN: packaged `powerbrowser-153.1.0.en-US.linux-x86_64.tar.xz` extracted to a test prefix; fork `distribution/policies.json` installed per the post-build step; staged `application.ini` reads `Vendor=DeBIOS`, `Name=powerbrowser`, `Version=153.1.0`, `BuildID=20260904184538` | GREEN: staged binary alive 25s headless (`MOZ_HEADLESS=1 --profile <test> --no-remote about:blank` inside `nix develop .#firefox`) | GREEN: stock firefox (system 155.0) wrote a 20146-byte headless screenshot while the fork build stayed alive — distinct binaries, profiles, and frozen remoting names (`powerbrowser` vs `firefox`), no profile or remoting collision | GREEN: prefix plus both test profiles removed; `ls ~` before/after diff empty; no `~/.powerbrowser`, no `~/.mozilla` | GREEN: N `153.1.0`/`20260904184538` to N-plus-1 `153.1.1`/`20260904191328`, result `applied` (hop.json); descriptor `update.xml` hash-pinned sha512 `d1184023cbab2e8dc587f7238e890a93cda8f1078bb87284f84c252908c0ec6fb4e2c31106b86ba01171b3637bc7b80a0b38c997de373fe1f4a4ec972c41a3a0` (full value in `.mozbuild/mar-hop/serve/update.xml`), size 78654141; fork-server access log shows the descriptor plus MAR GETs over loopback; client resolver log sifted to zero `*.mozilla.org` / `*.mozilla.net` (only Safe Browsing `update.googleapis.com`) — zero-Mozilla-host proof |
| Windows 11 / pkg-win11 | staged-unexecuted | staged-unexecuted | staged-unexecuted (must prove no collision against stock Firefox with the frozen remoting and window-class pins) | staged-unexecuted (must include the no-residue check after uninstall) | staged-unexecuted (must cite two distinct versions and build IDs plus fork-server log entries) — unblock for the whole row: capability record above |
| macOS / pkg-macos | staged-unexecuted | staged-unexecuted | staged-unexecuted | staged-unexecuted | staged-unexecuted — unblock for the whole row: capability record above |

Two harness faults found and fixed while driving the Linux cells (test-side
only, no product change): the driver first leaked the fork-prefix
`LD_LIBRARY_PATH` into the stock-firefox invocation (stock `libxul.so`
refused the fork `libnss3.so` with `NSS_3.126 not found`) — the stock launch
now runs under `env -u LD_LIBRARY_PATH`; and stock firefox 155 requires a
pre-created `--profile` dir (`Could not find profile folder`) — both test
profiles are now pre-created. The reds were read directly off the failing
invocations, not asserted from absence.

### Packaging timings (attributed: tree plus host plus toolchain)

| Build / step | Tree | Host / toolchain | Wall |
|---|---|---|---|
| Updater-flag-flip rebuild (`objdir/`, incremental after reconfigure) | Power Browser post-rename, 08-04 task 1 | legion, `nix develop .#firefox` | 33m44s (mach wall clock `.mozbuild/task1-updater-rebuild.log`) |
| N-plus-1 fresh build (`objdir-nplus1/`, separate objdir) | same plus test version files | legion, `nix develop .#firefox` | 54m (mach wall 54:28, `.mozbuild/task2-nplus1-build.log`; 18:19→19:13 wall — a full tier-3 despite sccache, since the version bump recompiles version-stamped objects) |
| `installer.nsi` compile via makensis 3.12 | Power Browser @ 08-04 spike stage | legion, `nix shell nixpkgs#nsis` | 3.4s |
| MAR emit plus serve plus hop drive | same | legion | MAR emit ≈2 min; one check→stage→apply cycle ≈8 min (78 MB loopback download plus stage ~3 min, updater stage ~1 min, replace at next startup <1 min, remainder client timer scheduling); full evidence wall 19:15–20:35 including three false-start drives (empty `--backgroundtask` task name, Marionette shell-window crash, `.net` resolver-log silencing — all recorded in 08-04-SUMMARY.md) |
| Release build (`objdir-release/`, fresh) | Power Browser post-rename plus updater flag, 08-05 task 3 | legion, `nix develop .#firefox` | 54m40s mach wall (`.mozbuild/release-build-0805.log`); same updater flag set as dev via the shared `.mozconfig` (config.status carries `--enable-unverified-updates`, updater binary present); `application.ini` `Name=powerbrowser Version=153.1.0 BuildID=20260904213953`; release rows green same day (see matrix section) (pre-NG-065 measurement; builds now set `MOZ_VERIFY_MAR_SIGNATURE`) |

No inherited number is presented as fresh: the tier-3 table above keeps
its own attributed rows; these rows were measured in 08-04 execution.

## Rebase procedure and desktop install (D-74, D-77)

One documented command moves the fork onto a new ESR tag:

```
scripts/rebase-upstream.sh --tag <NEW_TAG> [--dry-run]
```

It fails loudly, by name, at any of: the requested tag not existing on the
remote (checked via `git ls-remote` before any clone), `fetch-upstream.sh`
failing to re-materialize `upstream/` at the new tag,
`apply-patches.sh` failing to replay `patches/*.patch` (including D-75's
non-vacuous per-patch assertion — a patch that applies as a silent no-op is a
failure, by name), `check-patch-surface.sh` rejecting the replayed stack, the
residual-brand scan finding a brand string in either tree it now reads — this
repo's own tracked files, and, via `--extra-root "$UPSTREAM_DIR"`, the rebased
`upstream/` checkout that `.gitignore` keeps out of `git ls-files` and that the
replay has just rewritten (an absent or empty extra root is itself a failure,
never a skip) — or the git-excluded branding-overlay symlink
(`upstream/powerbrowser`) failing to resolve back to this repo's
`powerbrowser/` directory after the rebase.

**Live drill (08-05, UPD-03).** Ran for real against
`FIREFOX_153_2_0esr_RELEASE` — the newest tag in the 153 ESR series newer
than the pinned `FIREFOX_153_1_0esr_RELEASE` (155/156 tags are different
release trains, out of scope for this drill). Result: PASS —
`rebase-upstream.sh` re-materialized upstream/, replayed the patch stack
verified non-vacuous, `check-patch-surface.sh` accepted it, the
residual-brand scan passed over 146 tracked files plus 460674 files under
`--extra-root upstream/`, the classifier reported fully-applied with dirt
matching the patch stack exactly, the branding overlay resolved, and
`installer-schema` passed over the rebased tree. The PITFALLS #2 operator
follow-up ran clean: `toolchain-baseline.sh` output diffed empty against
the committed baseline (no FFI drift at the new tag). Full log:
`.mozbuild/rebase-drill-0805.log` (untracked proof artifact).
The tree was then restored to the pinned tag through the same tooling
(`fetch-upstream.sh` at the manifest pin plus `apply-patches.sh`), so the
pin, the tree, and every phase proof agree: drills rehearse, pins decide.
Adopting 153.2.0esr is a future rebase-adoption task (pin move plus full
tier-3 rebuilds), not part of this drill.

**Pinned ESR (Phase 40, DIST-06).** The pin is `FIREFOX_153_5_1esr_RELEASE` at
commit `6cd88e7d45fe7a5b0b87b984fb32a8779151860e`. On 2026-10-20, `git ls-remote`
resolved both `FIREFOX_153_5_1esr_RELEASE` and `FIREFOX_153_5_1esr_BUILD1` to
that commit. Tag names alone are not identity: at 153.4, `_RELEASE` resolved to
`508788b6f8314edb3c33905f6d56c3fe6b087670` (the `_BUILD3` commit) while
`_BUILD1` resolved to `f92008fc60401bb78216ce83704f6f58be94cc20`. The SHA
above is the identity recorded at adoption, and no gate checks it:
`configuration.toml` pins only the tag, and `fetch-upstream.sh` and
`rebase-upstream.sh` resolve the tag name. If the mirror re-pointed the tag, a
fresh clone would get the new commit and every gate would pass. The rebase ran
locally through `scripts/rebase-upstream.sh --tag FIREFOX_153_5_1esr_RELEASE`
on 2026-10-20 (474 s wall, clone 370 s), and the four patches replayed
unchanged.

**CI story:** `.github/workflows/rebase-upstream.yml` is `workflow_dispatch`-only
(no `schedule:` — the ~4-weekly ESR cadence is a standing post-v4.0 operational
item, not a Phase 3 deliverable) and runs the same replay off this machine, on
a GitHub-hosted runner. **Nix and the Gecko build are deliberately out of
scope for this workflow**: the Nix Gecko toolchain closure does not fit a
standard GitHub-hosted runner alongside a multi-gigabyte Gecko working tree,
so the workflow only exercises `rebase-upstream.sh`'s clone/replay/verify
sequence — it never runs `./mach build`. Consequently, the
`scripts/toolchain-baseline.sh` diff against the committed
`toolchain-baseline.txt` that PITFALLS #2 requires after every ESR rebase is a
**local operator follow-up**, run under `nix develop .#firefox` after a
successful CI replay — not a CI step, because the toolchain that produces it
only exists in the `firefox` devShell this workflow does not enter.
`.github/workflows/rebase-upstream.yml` has never been dispatched: on
2026-10-16, `gh run list --workflow rebase-upstream.yml` returned no runs
(`[]`), with the workflow registered and active. Its generate step runs bare
`node scripts/generate.mjs` on a runner with no inkscape, so the first dispatch
is expected to fail at that step, before the rebase. Wrapping the workflow in
Nix is deferred (18-CONTEXT). The 153.5 rebase ran locally. The
workflow is therefore unexercised and is not cited as proof of any rebase.

**Desktop install (local dev testing).** `powerbrowser/powerbrowser.desktop` (dev)
and `powerbrowser/powerbrowser-release.desktop` (release) install at the user-scope
path:

```
~/.local/share/applications/powerbrowser.desktop
~/.local/share/applications/powerbrowser-release.desktop
```

Both `Exec=` and `Icon=` in each file carry the placeholder
`@POWERBROWSER_REPO_ROOT@` instead of an absolute path, so the tracked files
are identical at every checkout and the byte-identity gate stays green on a
fresh clone. Substitute the placeholder with this checkout's absolute path
before installing:

```
sed "s|@POWERBROWSER_REPO_ROOT@|$PWD|g" powerbrowser/powerbrowser.desktop > ~/.local/share/applications/powerbrowser.desktop
sed "s|@POWERBROWSER_REPO_ROOT@|$PWD|g" powerbrowser/powerbrowser-release.desktop > ~/.local/share/applications/powerbrowser-release.desktop
```

After any later change to either file's `Exec=` or `StartupWMClass=`, re-register
with:

```
update-desktop-database ~/.local/share/applications
```

`update-desktop-database` is **not currently installed on this host** — that
follow-up needs the package (nixpkgs `desktop-file-utils`) added to a dev
shell before it can be run; neither `.desktop` file has been installed here
yet, so this has not blocked anything so far.

## Toolchain baseline

Phase 3's rebase procedure (BUILD-03) starts by diffing the toolchain the
`firefox` shell resolves today against the committed baseline:

```
diff <(nix develop .#firefox --command bash scripts/toolchain-baseline.sh) toolchain-baseline.txt
```

A non-empty diff means the pinned `nixpkgs` revision now resolves to a
different `rustc`, `cargo`, or `cbindgen` version than the committed
`toolchain-baseline.txt` — the FFI-drift signal the project's pitfalls
research calls out as something to re-check on every ESR rebase, not just
once. To regenerate the baseline file itself (only do this deliberately,
as part of a reviewed rebase):

```
nix develop .#firefox --command bash scripts/toolchain-baseline.sh > toolchain-baseline.txt
```

## Verifying a fresh clone

This is the check that proves the commands above are complete — that
nothing in them depends on tribal knowledge left over in a working tree
that has been iterated on directly.

```
git clone . <fresh-space-free-path>
cd <fresh-space-free-path>
./scripts/fetch-upstream.sh
./scripts/smoke-theia.sh
nix develop .#firefox --command bash -c 'cd upstream && MOZCONFIG=../.mozconfig ./mach configure'
diff <(nix develop .#firefox --command bash scripts/toolchain-baseline.sh) toolchain-baseline.txt
```

The Firefox step above uses `./mach configure` as a **fast proxy**, not as
an equivalent. Configure covers most of the toolchain-detection path
(rustc, cargo, cbindgen, the WASM-sandboxing opt-out, libclang discovery)
in about a minute, so it is the right routine check.

Be clear about what it does not cover. Of the three toolchain defects
found while building this phase, one — nixpkgs' bintools-wrapper
exporting `AS`/`LD`/etc., which broke `moz.configure`'s assembler flag
routing — surfaced only **during compilation**, on the first `.s` file
(NSPR's `os_Linux_x86_64.s`), long after configure had succeeded. A
configure-only check would have passed straight over it. Treat a green
configure as "the documented setup is probably complete", not as proof
that a fresh clone builds.

The full check has been run once, end to end, on a genuinely fresh clone:

```
git clone . <fresh-space-free-path>
cd <fresh-space-free-path>
./scripts/fetch-upstream.sh                                     # 554s, 5.6G
./scripts/smoke-theia.sh                                        # 14s, PASS
nix develop .#firefox --command bash -c 'cd upstream && MOZCONFIG=../.mozconfig ./mach build'
```

Result: exit 0 in 3641s (~61 min), 14G objdir, zero `mach bootstrap`
invocations, `objdir/dist/bin/firefox --version` reporting
`Mozilla Firefox 153.1.0esr`, and `git status` clean in both the repo and
`upstream/`. Re-run the full build rather than just configure whenever
anything in `flake.nix`, `.mozconfig`, or the toolchain pin changes.

Any command that a fresh clone needs but this document does not list is
treated as a documentation failure, not a footnote — it gets added here
and re-verified, not just noted in a summary.
