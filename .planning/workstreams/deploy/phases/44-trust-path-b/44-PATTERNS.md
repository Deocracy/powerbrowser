# Phase 44: Trust path (B) - Pattern Map

**Mapped:** 2026-10-22
**Files analyzed:** 8
**Analogs found:** 8 / 8 (with 2 content-level carve-outs listed under No Analog Found)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `powerbrowser/packaging/mar/mar-secondary.der` (NEW) | binary trust anchor (public cert only) | owner ceremony `certutil -L -r` -> tracked file -> patch-030 input | `powerbrowser/packaging/mar/mar-primary.der` (mode `100644`, blob `356daa8`, 1279 bytes) | exact |
| `patches/030-powerbrowser-mar-certificates.patch` (REGENERATED) | patch/config | derive-from-applied-`upstream/`, write / --check / --self-test | `scripts/regenerate-patches.sh` (`patch_paths`, `regenerate_one`, `run_check`/`run_write`) | exact (mechanism); no analog for the stanza content itself (see below) |
| `scripts/build-update-xml.mjs` (NEW) | utility/generator CLI over shared emitter | built tree (`application.ini`, `config.status`, MAR bytes) -> `<outdir>/<channel>/<BUILD_TARGET>/update.xml`; `--check` re-emits and byte-compares | `scripts/verify-update-channel.mjs` (header, arg guard, injectable `runChecks`, green-baseline-first self-test, consumer sweep) | exact |
| `scripts/verify-descriptor-monotonic.mjs` (NEW) | test/gate (full-tier live + quick in-memory self-test) | candidate descriptors vs published `release-manifest.json` assets via `gh api`; self-test through `overrides.get` + fixtures | `scripts/verify-repo-controls.mjs` (`ghGet`, pinned header, `safeGetter`, `overrides.get`) + `scripts/verify-update-channel.mjs` (`runChecks` shape) + `scripts/verify-release-identity.mjs` (count lines, mkdtemp) | exact (composite) |
| `scripts/verify-ng-065-mar-signature.mjs` (MOD: fifth case) | test/gate (full-tier) | drive packaged `updater` over full MARs, env-var secondary DB | itself, lines 1-109 (hash-locked `verify-ng-` prefix: edit in place, never a sibling) | exact |
| `scripts/verify-mar-update-hop.mjs` (MOD: `buildUpdateXml` gains `detailsURL`) | gate + shared emitter library | `marDigest`/`xmlEscape` -> `buildUpdateXml`/`parseUpdateXml`; import guard keeps import side-effect-free | itself, lines 94-150 (emitter) + 504-522 (import guard) | exact |
| `scripts/verify-platform.sh` (MOD: 2 quick rows + 2 full rows) | config/registry | append rows; quick array `:3573-4731` vs full `CHECKS+=(` at `:4733`; `bash */*\|node */*` dispatch | itself rows `:3664-3665`, `:4646-4674`, `:5092`, dispatch `:5134-5136` | exact |
| `docs/RELEASING.md` (MOD: five-place rewrite) | doc (operator manual) | ceremony + rotation + secrets inventory + verification map + stage plan | itself `:364-392`, `:531-545`, `:760-771`, `:827-852`, `:985-987` (prose anchors only) | role-match |

## Pattern Assignments

### `scripts/build-update-xml.mjs` (NEW) -- copy `scripts/verify-update-channel.mjs`

**Header comment** (`verify-update-channel.mjs:1-40`): numbered derivation steps stating what is derived from where, why each exclusion/consumer kind exists, and the honesty tier. Copy this shape; the CLI's header names the built-tree inputs (`application.ini` Version/BuildID, `config.status` ABI/OS/channel, MAR bytes, `[urls].release_notes`) and the four RELEASING.md:832 plants.

**Strict arg guard** (lines 53-60):
```js
const args = process.argv.slice(2);
for (const a of args) {
    if (a !== '--self-test') {
        console.error(`${NAME}: FAIL -- unknown argument '${a}'`);
        console.error(`  Next step: run: node ${SELF_REL}, or add --self-test to prove the agreement discriminates.`);
        process.exit(2);
    }
}
```
New CLI accepts `--emit/--check/--channel/--details-url/--outdir` in addition to `--self-test`; unknown flags exit 2 with the same `Next step:` shape.

**Injectable `runChecks`** (lines 150-153):
```js
function runChecks(root, overrides = {}) {
    const failures = [];
    const consumers = [];
    const read = overrides.read ?? ((rel) => readText(root, rel));
```
Executor copies `overrides.read` + `overrides.files` (and `overrides.mozconfig`-style emission overrides) so every plant is in-memory and the self-test writes nothing.

**EXCLUDED table with reason guard** (lines 71-85):
```js
const EXCLUDED = Object.freeze([
    ['.planning/', 'planning history quotes past and hypothetical channel values'],
    ...
    [SELF_REL, 'self-test fixtures plant wrong values on purpose'],
]);
for (const [prefix, reason] of EXCLUDED) {
    if (typeof reason !== 'string' || reason.trim() === '') {
        console.error(`${NAME}: FAIL -- the exclusion '${prefix}' in ${SELF_REL} carries no reason.`);
        ...
```
New CLI needs no EXCLUDED table (it reads the built tree, not `git ls-files`), but the same reason-carrying discipline applies to its target table (Darwin/Windows rows marked pending until stages 6/7 observe them).

**Green-baseline-first self-test + sorted consumer output** (lines 215, 266-272):
```js
consumers.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : a.line - b.line));
...
const baseline = runChecks(REPO_ROOT, { read: realRead, files });
if (baseline.failures.length > 0) {
    console.error(`${NAME}: --self-test FAIL -- the unmodified tree is already red, so the planted-fault results below would mean nothing:`);
```
RESEARCH Pattern 2 bakes the four plants in from day one: unknown target token; `application.ini` with no BuildID; `TARGET_XPCOM_ABI` disagreeing with the table; `--channel` given the MAR channel id while `config.status` carries the update channel.

**In-memory TARGETS emit** (from `verify-update-prefs.mjs:99-106,193-195` and `verify-generated-identity.mjs:184`):
```js
const textFor = overrides.textFor ?? ((row, cfg, variant) => row.emit(cfg, variant));
const rows = (overrides.rows ?? TARGETS).filter(t => t.generated.endsWith(EMITTER_SUFFIX));
...
const edit = (variantId, fn) => ({
    textFor: (row, config, variant) => {
        const text = row.emit(config, variant);
        return row.variant === variantId ? fn(text) : text;
    },
});
```
`build-update-xml.mjs` does not emit via TARGETS, but its self-test copies this exact move: synthetic `application.ini`/`config.status`/MAR bytes substituted in memory through `overrides`, never edited on disk.

### `scripts/verify-descriptor-monotonic.mjs` (NEW) -- copy `verify-repo-controls.mjs` + `verify-update-channel.mjs` + `verify-release-identity.mjs`

**Fail-closed `ghGet` + pinned API version** (`verify-repo-controls.mjs:42,58-74`):
```js
export const API_VERSION_HEADER = 'X-GitHub-Api-Version: 2022-11-28';
const NEXT_AUTH = 'Next step: run gh auth status; the row needs scopes repo and read:org.';
export function ghGet(path) {
    let out;
    try {
        out = execFileSync('gh', ['api', '-H', API_VERSION_HEADER, path],
            { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 16 * 1024 * 1024 });
    } catch (e) {
        const first = String(e.stderr || e.message).trim().split('\n')[0];
        return { ok: false, why: `GET ${path} could not be read (${first}). ${NEXT_AUTH}` };
    }
    try {
        return { ok: true, body: JSON.parse(out) };
    } catch {
        return { ok: false, why: `GET ${path} could not be read (the response is not JSON). ${NEXT_AUTH}` };
    }
}
```
Every live read goes through this helper. Non-2xx / missing / authless `gh` / bad JSON is a FAIL naming the endpoint + `gh auth status` next step, never a SKIP.

**`safeGetter` + `overrides.get` pattern** (lines 76-97, 711-734):
```js
function safeGetter(get) {
    const cache = new Map();
    return (path) => {
        if (cache.has(path)) return cache.get(path);
        let r;
        try { r = get(path); }
        catch (e) { r = { ok: false, why: `GET ${path} could not be read (${...}). ${NEXT_AUTH}` }; }
        ...
    };
}
export function runChecks(root, overrides = {}) {
    ...
    const get = safeGetter(overrides.get ?? ghGet);
```
The quick self-test copies this exactly: `overrides.get` serves fixture `release-manifest.json` bodies from memory (green control + same-version older/equal buildID plants + malformed-asset plant + throwing-getter plant), no network, no `gh`.

**Zero-Releases precedent** (lines 160, 171-181):
```js
const RELEASES_PATH = 'repos/{owner}/{repo}/releases?per_page=1';
...
if (r.body.length > 0) { ... } // per_page=1: one item means at least one Release.
```
Empty published set is green with a named count line, following `verify-release-identity.mjs:159`:
```js
notes.push(`${descriptors.length} tracked update.xml descriptor(s)`);
notes.push(`${releaseTags.length} release tag(s) on this branch matching v<ESR>-<revision>`);
```
RESEARCH Pattern 3: `0 published buildID(s)` printed by name, never a vacuous pass.

**`mkdtemp` git-repo self-test + neighbor derivation** (`verify-release-identity.mjs:201-208,230`):
```js
const tmp = mkdtempSync(join(tmpdir(), 'release-identity-'));
const env = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };
const g = (...a) => execFileSync('git', ['-C', tmp, '-c', 'user.name=self-test', ...], ...);
...
const neighbor = esrVersion.replace(/(\d+)$/, d => String(Number(d) + 1));
```
The monotonic self-test is in-memory (no repo needed), but any fixture buildID it plants is derived from the real published value (`neighbor`), never a literal — a literal buildID in the file would trip the sweep the same way a literal tag would (`update-channel.mjs:483` neighborTag precedent).

### `scripts/verify-mar-update-hop.mjs` (MOD) -- the shared emitter

**`marDigest` + `xmlEscape`** (lines 95-104):
```js
function marDigest(bytes) {
    return {
        hashValue: createHash('sha512').update(bytes).digest('hex'),
        size: String(bytes.length),
    };
}
function xmlEscape(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
```

**Emitter + parser shape** (lines 114-150):
```js
export function buildUpdateXml({ marBytes, marUrl, appVersion, platformVersion, buildID, displayVersion, updateType = 'minor' }) {
    const { hashValue, size } = marDigest(marBytes);
    return `<?xml version="1.0" encoding="UTF-8"?>\n`
        + `<updates>\n`
        + `  <update type="${xmlEscape(updateType)}" displayVersion="${xmlEscape(displayVersion)}" appVersion="${xmlEscape(appVersion)}" platformVersion="${xmlEscape(platformVersion)}" buildID="${xmlEscape(buildID)}">\n`
        + `    <patch type="complete" URL="${xmlEscape(marUrl)}" hashFunction="sha512" hashValue="${hashValue}" size="${size}"/>\n`
        + `  </update>\n`
        + `</updates>\n`;
}
```
UPD-14 extends this object with `detailsURL` (xml-escaped, emitted as `<update detailsURL="">`), extends `parseUpdateXml` to return it, and extends the idempotency assertion (emit twice, byte-equal at `:273-292`) to cover it. Value rule: `[urls].release_notes`, https-validated; `--details-url` is override-only.

**Import guard** (lines 504-522) — untouched by the edit:
```js
if (SELF_TEST) selfTest();
const INVOKED_DIRECTLY = (() => {
    try {
        return process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
    } catch {
        return false;
    }
})();
if (INVOKED_DIRECTLY) {
const result = runChecks(REPO_ROOT);
...
```
`scripts/build-update-xml.mjs` does `import { buildUpdateXml } from './verify-mar-update-hop.mjs'` (import-not-copy); the guard is what keeps that import side-effect-free. The planner keeps it verbatim.

**`makeReporter` skeleton** (lines 78-92) for the new rows to copy:
```js
function makeReporter() {
    const failures = [];
    return {
        failures,
        fail(msg) { failures.push(msg); },
        eq(label, actual, expected, where) {
            if (actual === expected) return true;
            failures.push(
                `${label}: ${where} carries ${JSON.stringify(actual)} but must equal ` +
                `${JSON.stringify(expected)}`,
            );
            return false;
        },
    };
}
```

### `scripts/verify-ng-065-mar-signature.mjs` (MOD fifth case) -- itself, in place

Hash-locked prefix `verify-ng-`: no sibling file is created; the edit lands in the existing 109-line file. Copy the `cases` drive shape (lines 87-92):
```js
const cases = [
    ['fork-signed', sign(KEY_DB, NICK, unsigned, 'good.mar', forkPassword), 'succeeded'],
    ['unsigned', unsigned, `failed: ${CERT_ERR}`],
    ['throwaway-key', sign(throwaway, 'ng065-throwaway', unsigned, 'wrong-key.mar'), `failed: ${CERT_ERR}`],
    ['other-channel', sign(KEY_DB, NICK, mar('other.unsigned.mar', `${channel}-other`), 'wrong-channel.mar', forkPassword), `failed: ${CHANNEL_ERR}`],
];
```
Fifth row shape (RESEARCH §Pattern 1, bytes from the owner ceremony):
```js
['secondary-only', sign(secondaryDb, 'powerbrowser-mar-secondary', unsigned, 'secondary-only.mar', secondaryPassword), 'succeeded'],
```
`secondaryDb` comes from `process.env.PB_MAR_SECONDARY_DB` with a named SKIP/FAIL when unset (CI without the owner key never goes green-by-construction); the nickname is distinct so the proof cannot pass with the primary key by accident. Codes stay derived from `updatererrors.h` at check time (`:53-56`); the updater argument version from `nsUpdateDriver.cpp` (`:57-58`).

### `patches/030-*` + `powerbrowser/packaging/mar/mar-secondary.der` -- copy `scripts/regenerate-patches.sh`

**`patch_paths`** (lines 49-52):
```sh
patch_paths() {
  awk '/^diff --git /{a=$3; b=$4; sub(/^a\//,"",a); sub(/^b\//,"",b)
    if (!(a in seen)) {seen[a]=1; print a}; if (!(b in seen)) {seen[b]=1; print b}}' "$1"
}
```

**`regenerate_one`** (lines 88-89):
```sh
GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1 git -C "$UPSTREAM_DIR" -c core.abbrev=10 \
  diff --no-ext-diff --no-color --no-textconv --diff-algorithm=myers --abbrev=10 HEAD -- $paths
```

**Dispatch** (lines 340-355): `--check` compares, `--self-test` runs the hermetic fixture, bare mode regenerates in place; write mode validates every patch before replacing any (`run_write`, lines 153-180). The executor edits the applied `upstream/toolkit/mozapps/update/updater/moz.build` secondary line + comment to the new path, runs write mode, confirms the one-slot diff, then `--check` green. Scan note: `check-patch-surface.sh:98-101,150` reads added `+` lines only — `+++` header paths are never read — with path-aware boundaries (longest-first at `:145`), so the `+secondary_cert.inputs += ["/powerbrowser/packaging/mar/mar-secondary.der"]` text line scans clean as hook syntax.

### `scripts/verify-platform.sh` registry rows

Quick-array precedent (lines 3664-3665):
```sh
    "verify-upstream-pins|node $REPO_ROOT/scripts/verify-upstream-pins.mjs"
    "verify-upstream-pins-self-test|node $REPO_ROOT/scripts/verify-upstream-pins.mjs --self-test"
```
Full-tier precedent (line 5092):
```sh
      "repo-controls|node $REPO_ROOT/scripts/verify-repo-controls.mjs"
```
New rows (exact RESEARCH §Registry rows text):
```sh
    # NEW (Phase 44, UPD-14): one descriptor per BUILD_TARGET from the built tree, detailsURL
    # from [urls].release_notes, byte-identical on re-emission. Honestly --quick for the
    # self-test only: synthetic application.ini/config.status/MAR bytes in mkdtemp, no build,
    # browser, display or network. The live row reads objdir/ and is full-tier.
    "build-update-xml-self-test|node $REPO_ROOT/scripts/build-update-xml.mjs --self-test"
    # NEW (Phase 44, UPD-26): every offered buildID strictly above every published buildID
    # for that appVersion, published set from Releases' release-manifest.json. Honestly
    # --quick for the self-test only: in-memory fixtures, no network, no gh. The live row
    # below is full-tier: read-only gh api (network, gh auth with repo scope).
    "descriptor-monotonic-self-test|node $REPO_ROOT/scripts/verify-descriptor-monotonic.mjs --self-test"
```
Full-tier additions inside `if [ "$QUICK" -eq 0 ]` (`CHECKS+=(` at `:4733`):
```sh
      # NEW (Phase 44, UPD-14): the per-target descriptors equal a fresh emission from the
      # built tree. Full tier: reads objdir/ (application.ini, config.status) and the MARs;
      # FAILs naming the missing prerequisite when they are absent, never SKIP.
      "build-update-xml|node $REPO_ROOT/scripts/build-update-xml.mjs --check"
      # NEW (Phase 44, UPD-26): ... Full tier: read-only gh api against live Releases ...
      "descriptor-monotonic|node $REPO_ROOT/scripts/verify-descriptor-monotonic.mjs"
```
Dispatch constraint (`:5134-5136`): only `bash */*` or `node */*` commands get the setsid arm; anything else must be a bare argument-free shell function (WR-02 guard at `:5146-5156`). All four new commands comply.

### `docs/RELEASING.md` five-place rewrite -- prose anchors only

1. **Ceremony (`:364-392`)**: mirror the primary stanza (machine `legion`, `D=` NSS dir, refusal guard `[ -e "$D/key4.db" ]`, `certutil -N/-S` 4096-bit RSA `SHA384 -v 240`, `certutil -L -r > .../mar-secondary.der`, `ls -l` hygiene). Change `:381` "Optional, the owner's call" to two mandatory offline `.p12` copies on two separately stored media; record existence + date, never locations.
2. **Rotation (`:760-771`)**: delete "no runbook" (`:770-771`) by replacing it with the runbook (transition release signed with old key embedding new DER → `descriptor-monotonic` green → switch `MAR_SIGNING_P12_B64` → retire old store after N+1 hop proves). Retire the "One key fills both slots (R12)" rationale.
3. **Secrets inventory (`:531-545`)**: secondary `.p12` + password rows if the secondary ever signs releases, else state it signs nothing until rotation and lives offline only; the primary `.p12` → `MAR_SIGNING_P12_B64` path reads as a procedure (decode → `release` env secret, owner-handled, never through `legion` per SEC-08).
4. **Verification map (`:827-852`)**: update `mar-sign-self-test` (secondary-only accept plant), add `build-update-xml` (full) beside the existing `build-update-xml-self-test:832`, add `descriptor-monotonic` + self-test, note the ng065 fifth case. One-row-per-row rule, no sibling table.
5. **Stage plan index (`:985-987`)**: row 3 keeps "The key-rotation runbook" as deferred only if the runbook did not land; otherwise say where it lives.

## Shared Patterns

- **Message format:** `<name>: PASS|FAIL|SKIP -- <plain statement>`; each failure ends `Next step: ...`; exit 0/1, 2 for bad args.
- **Derive, never hand-keep:** expectations come from `configuration.toml` via `resolveConfig`/`releaseIdentity`/`updateChannel`, from `git ls-files`, and from the built tree (`application.ini`, `config.status`) at check time; set equality catches addition and removal.
- **Self-test:** green baseline first, in-memory or mkdtemp plants, red must name the drift (file + value), unplanted control stays green; writes nothing in the repo.
- **Honesty comments:** every registry row carries what it reads and which tier is quick (fixtures only) vs full (built tree / network / `gh`).
- **Stage new files** before trusting `scan-brand-residue.mjs` (git ls-files based); DER bytes cannot match brand tokens (probes are `sourcerer`/`deocracy` substrings), but an unstaged DER is invisible to the scan.
- **Patches regenerate** from the patched `upstream/` via `regenerate-patches.sh`; never text-edit a hunk.

## No Analog Found

| Item | Role | Reason |
|---|---|---|
| Two-DER patch stanza content (the secondary-slot line + comment) | patch data | No analog: the DER bytes come from the owner ceremony; `regenerate-patches.sh` rewrites the bytes, it does not author them. Mechanism is exact (see above); content follows RESEARCH Pattern 1 shape only |
| Ceremony/rotation prose itself | doc | No code analog exists; only `docs/RELEASING.md` conventions (ceremony block, rotation paragraph, secrets table, verification map) anchor the rewrite. Follow RESEARCH Pattern 4 edit list, never append a sibling section |

## Metadata

**Analog search scope:** scripts/, patches/, powerbrowser/packaging/mar/, docs/RELEASING.md
**Files scanned:** 9 (`verify-update-channel.mjs`, `verify-release-identity.mjs`, `verify-repo-controls.mjs`, `regenerate-patches.sh`, `verify-mar-update-hop.mjs`, `verify-update-prefs.mjs`, `verify-generated-identity.mjs`, `verify-platform.sh`, `check-patch-surface.sh`) + `docs/RELEASING.md` ceremony/rotation/secrets/map sections + `patches/030-powerbrowser-mar-certificates.patch`
**Pattern extraction date:** 2026-10-22
