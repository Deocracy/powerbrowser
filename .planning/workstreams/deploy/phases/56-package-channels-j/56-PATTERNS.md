# Phase 56: Package channels (J) - Pattern Map

**Mapped:** 2026-10-23
**Files analyzed:** 19 (flake.nix, configuration.toml, scripts/generate.mjs, policies.json, version files, desktop file, verify-release-identity.mjs, verify-workflows.mjs, verify-repo-controls.mjs, verify-platform.sh, actions-selected.json, verify.yml, RELEASING.md, 41-PATTERNS.md)
**Analogs found:** 8 / 9 file groups (no analog for the Flatpak/winget/cask payload emitters — greenfield text emission, follow the generator fragment rule)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `nix/pkg/powerbrowser-bin.nix` (fetchurl + autoPatchelf repack, nodejs_24 sidecar, DisableAppUpdate merge) | config/build | derivation (URL/hash in, store path out) | `flake.nix` lines 1-22 (nixpkgs import, nodejs_24 pin) + `powerbrowser/packaging/package-linux.sh` (staging precedent) | partial |
| `flake.nix` (add `packages.x86_64-linux.powerbrowser` + `overlays.default`) | config | output wiring | itself, lines 8-24 (outputs lambda, pkgs import) | exact |
| `nix/cache.json` (Cachix + R2 backend blocks, one interface) | config | declared state | `.github/settings/*.json` (Phase 41 declared bodies) | role-match |
| `scripts/verify-flake-repack.mjs` + `scripts/verify-policies-update-split.mjs` + `scripts/verify-binary-cache.mjs` + `scripts/verify-flathub-manifest.mjs` + `scripts/verify-winget-manifest.mjs` + `scripts/verify-homebrew-cask.mjs` + `scripts/verify-channel-release-jobs.mjs` (quick rows; `--self-test`) | test/gate | transform (derive + compare as set equality) | `scripts/verify-release-identity.mjs` (derive-from-tree agreement) + `scripts/verify-workflows.mjs` (quick row shape) | exact shape |
| `scripts/verify-platform.sh` (append 14 rows) | config/registry | — | its own Phase 41 rows, lines 4706-4730 (quick) and 5090-5093 (full) | exact |
| `flatpak/org.debios.PowerBrowser.json` + sources (Flathub manifest) | config/payload | emission (release key in, manifest out) | `generated/powerbrowser.desktop` (tracked emission comparand) | partial |
| `winget/` versioned manifests (DeBIOSFoundation.PowerBrowser) | config/payload | emission | none — greenfield; follow the "derive, never literal" rule from CONTEXT.md | none, use RESEARCH §winget |
| `homebrew-tap/Casks/powerbrowser.rb` (cask payload, staged in tree until the tap repo exists) | config/payload | emission | none — greenfield; same rule | none, use RESEARCH §Homebrew |
| `docs/RENEWALS.md` (append Cachix-token + WINGET_TOKEN rows to the Phase 42-owned file) | docs | — | `docs/RELEASING.md` Phase 41 append pattern (plan 41-02) | role-match |

All analog paths are git-tracked source. `scripts/verify-ng-NNN-*.mjs` are hash-locked: read only, never edit, never create a file with that prefix.

## Pattern Assignments

### Verify scripts (gate, derive-and-compare)

**Analog:** `scripts/verify-release-identity.mjs` (328 lines — derivation shape) + `scripts/verify-workflows.mjs` (545 lines, Phase 41 — quick-row shape)

**Header comment** (release-identity lines 1-40 style): numbered list of what the check derives and compares, ending with "This script and its --self-test only read the tree; every plant is applied in memory through runChecks' overrides."

**Imports + constants + strict arg parse** (workflows lines 67-86):
```js
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'flake-repack';
const SELF_REL = 'scripts/verify-flake-repack.mjs';

const args = process.argv.slice(2);
for (const a of args) {
    if (a !== '--self-test') {
        console.error(`${NAME}: FAIL -- unknown argument '${a}'`);
        console.error(`  Next step: run: node ${SELF_REL}, or add --self-test to prove the agreement discriminates.`);
        process.exit(2);
    }
}
```

**Release-key derivation** (release-identity line 53 + generate.mjs `releaseIdentity` import): `import { releaseIdentity, resolveConfig } from './generate.mjs'` — every URL, version and hash expectation derives from `releaseIdentity(resolveConfig(join(root, 'configuration.toml')))`, never from a literal. The workflows row's `readText`/`runChecks(root, overrides)` injectable-read shape (41-PATTERNS.md Pattern Assignments) applies verbatim so `--self-test` runs in memory at the quick tier.

**main / PASS-FAIL output** (workflows tail shape):
```js
function main() {
    if (args.includes('--self-test')) return selfTest();
    const { failures } = runChecks(REPO_ROOT);
    if (failures.length > 0) {
        console.error(`${NAME}: FAIL -- ${failures.length} problem(s) ...`);
        failures.forEach(f => console.error(`  ${f}`));
        return 1;
    }
    console.log(`${NAME}: PASS -- ...`);
    return 0;
}
...
process.exit(main());
```
Every failure line ends with a concrete "Next step:", following the existing rows' convention.

**Self-test: green baseline first, plants table, each must name file+value, control stays green** (release-identity lines 200-324): copy the `selfTest()` loop — baseline over the unmodified tree must be green first, then each plant red naming file and value, one control per plant family staying green. Plants per RESEARCH §Validation Architecture.

---

### `scripts/verify-platform.sh` (registry rows)

**Analog:** its own Phase 41 rows — quick block lines 4706-4730, full-tier block lines 5090-5093.

Quick rows append inside `CHECKS=(` after `zizmor-self-test`:
```sh
# NEW (Phase 56, PKG-19): <what it derives and compares>. Honestly --quick: <text reads only>; it writes nothing.
"flake-repack|node $REPO_ROOT/scripts/verify-flake-repack.mjs"
"flake-repack-self-test|node $REPO_ROOT/scripts/verify-flake-repack.mjs --self-test"
```
One pair per check (7 pairs, 14 rows). Full-tier rows: none in this phase — every check is static; the live proofs (listings, substitute run) are owner-checkpoint evidence in plan 56-05, exactly like Phase 41's `repo-controls` split.

---

### Flake package outputs

**Analog:** `flake.nix` lines 8-24 (outputs lambda). Append inside the `outputs` set, after `devShells`:
```nix
packages.${system}.powerbrowser = pkgs.callPackage ./nix/pkg/powerbrowser-bin.nix { };
packages.${system}.default = self.packages.${system}.powerbrowser;
overlay = final: prev: { powerbrowser = final.callPackage ./nix/pkg/powerbrowser-bin.nix { }; };
overlays.default = self.overlay;
```
`system` is the existing `x86_64-linux` let-binding — no new system literal. The derivation itself takes `{ stdenv, fetchurl, autoPatchelfHook, makeWrapper, copyDesktopItems, ... }`, pins the sidecar on the flake's `nodejs_24` (same binding the theia shell uses, flake.nix:21), and merges `DisableAppUpdate` into its own policies.json copy per the generator fragment rule (set one key, siblings byte-identical).

---

### Channel payload emission (Flathub / winget / cask)

No tree analog — these are greenfield text emissions. Rules they all follow:
- Derive version/URLs/hashes from the release key at emit/check time (the `releaseIdentity()` import above). A literal version in any payload fails its row.
- `flatpak/` sources carry the tarball URL + hash as `x-checker-data` so external-data-checker opens the per-release PR (DIST-12 leg 4).
- winget manifests carry the fixture Windows asset name until Phase 54 (assumption A2); the row asserts the derivation shape, not the live asset.
- The cask carries `auto_updates true`, `verified:` host, a `livecheck` block, and the darwin-deferral marker (assumption A3).
- /download Nix + Flatpak rows are tracked copy files the owner pastes into the Phase 47 site — plain "PowerBrowser" language, no internal identifier.

---

### `workflows` admission (if a plan adds a workflow job)

**Analog:** 41-03 pattern. Any new third-party `uses:` (Cachix push action, wingetcreate runner) extends `.github/settings/actions-selected.json` `patterns_allowed` with `owner/repo@*` in the same commit, and the `workflows` row's set-equality (`uses-admitted` + `admission-used`) proves it both ways. No schedule event, no legion label outside `release.yml` build-*/matrix-* jobs, SHA-pinned `uses:`.
