# Phase 49: Release pipeline and legion runner (E) - Pattern Map

**Mapped:** 2026-10-23
**Files analyzed:** 14 tracked analogs + 2 phase inputs (49-CONTEXT.md, 49-RESEARCH.md)
**Analogs found:** 12 / 13 file groups (no in-tree analog for the SEC-10 pre-job hook script)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `.github/workflows/release.yml` (new; `workflow_dispatch`/sha only; 4 jobs: `build-linux`, `sign-publish`, `descriptor`, `channel-live`) | pipeline | declared state (consumed by `workflows` row + `repo-controls` env reads) | `.github/workflows/verify.yml` (posture) + `.github/workflows/rebase-upstream.yml` (no-default input discipline) + `scripts/verify-workflows.mjs` GOOD_RELEASE fixture (extend, never duplicate) | exact shape |
| `scripts/verify-release-shape.mjs` (new, quick) | test/gate | transform (YAML parse + derive/compare) | `scripts/verify-update-channel.mjs` (332 lines) | exact shape |
| `scripts/verify-hook-refusal.mjs` (new, quick) | test/gate | file-I/O + transform (tracked hook text + `release.yml` job ids) | `scripts/verify-update-channel.mjs` (shape only; hook logic itself has no analog — see No Analog Found) | role-match |
| `scripts/verify-mar-channel-gate.mjs` (new, quick) | test/gate | transform (`.mozconfig` emission + fixture MAR product-info blocks) | `scripts/verify-update-channel.mjs` (shape) + `scripts/verify-release-identity.mjs` (fixture-read half) | role-match |
| `scripts/verify-release-asset-set.mjs` (new, quick) | test/gate | transform (manifest fixture + tree-derived names, set equality) | `scripts/verify-update-channel.mjs` (shape) + `scripts/verify-release-identity.mjs` (derive-and-compare, no hand-kept list) | role-match |
| `scripts/verify-channel-live.mjs` (new, full live + quick self-test) | test/gate | request-response (live Release + Pages reads) + file-I/O (mkdtemp/loopback self-test) | `scripts/verify-repo-controls.mjs` (live half + in-memory self-test) | exact shape |
| `scripts/verify-toolchain-container.mjs` (new, or AUTO-05 extension row; planner names it) | test/gate | file-I/O + subprocess (container-toolchain derivation) | `scripts/toolchain-baseline.sh` (9 lines) + `toolchain-baseline.txt` + `docs/BUILD.md` Toolchain-baseline section | exact |
| `scripts/toolchain-baseline.sh` + `toolchain-baseline.txt` (extend meaning to container bootstrap, decision 19) | test/gate input | file-I/O (emit then diff) | themselves | exact |
| Tracked pre-job hook script, e.g. `scripts/legion-pre-job-hook.sh` (new, SEC-10; exact path at planner discretion) | runner control | file-I/O (static text; exercised by `hook-refusal` row) | none in tree — prescribe from 49-RESEARCH.md Code Examples | none, use RESEARCH body |
| `scripts/verify-workflows.mjs` (modify: extend GOOD_RELEASE fixture to 4-job shape + `sha` input + `retention-days: 1`) | test/gate | transform (already) | itself, lines 388-420 | exact |
| `scripts/verify-platform.sh` (modify: 5 appended row pairs, quick + full) | config/registry | — | its own Phase 41 rows, anchored by label quotes (`repo-controls-self-test`, `workflows`, `repo-controls`) | exact |
| `.github/settings/actions-selected.json` (modify: admit exactly the actions `release.yml` uses) | config | declared state | itself + `verify-workflows.mjs` `uses-admitted`/`admission-used` rules | exact |
| `docs/RELEASING.md` (modify: runner-shape, procedure, asset, probe sections) | docs | — | itself | exact |
| `docs/BUILD.md` (modify: INF-04 + artifact-size rows under attribution rule) | docs | — | itself + Toolchain-baseline section | exact |
| `scripts/build-update-xml.mjs` (Phase 44) + `powerbrowser/packaging/Containerfile` (Phase 45) | consumed, not re-planned | — | `scripts/verify-mar-update-hop.mjs` `buildUpdateXml`/`parseUpdateXml` (imported, not copied) | consumed |
| `inventory/brand-tokens.json` | untouched | — | — | — |

All analog paths below are git-tracked source (verified with `git ls-files`; all 14 resolve). `scripts/verify-ng-NNN-*.mjs` are hash-locked and `ledger/` is owner-locked: neither is read, edited, created, nor used as an analog in this map.

## Pattern Assignments

### `scripts/verify-release-shape.mjs`, `scripts/verify-hook-refusal.mjs`, `scripts/verify-mar-channel-gate.mjs`, `scripts/verify-release-asset-set.mjs` (gates, derive-and-compare)

**Analog:** `scripts/verify-update-channel.mjs` (332 lines, Phase 40, freshest shape)

**Header contract** (`scripts/verify-update-channel.mjs:1-40`): numbered list of what the check derives and compares, ending with the honesty line. Copy the contract style, not the content:

```js
// This script and its --self-test only read
// the tree; every plant is applied in memory through runChecks' overrides.
// (scripts/verify-update-channel.mjs:39-40)
```

Each new row's header must name (a) what it derives from, (b) what it compares against, (c) why the tier is honestly `--quick` (no build, browser, display, network — live halves belong in `channel-live` full and `repo-controls` full only).

**Imports + strict arg parse** (`scripts/verify-update-channel.mjs:42-60`):

```js
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'update-channel';
const SELF_REL = 'scripts/verify-update-channel.mjs';

const args = process.argv.slice(2);
for (const a of args) {
    if (a !== '--self-test') {
        console.error(`${NAME}: FAIL -- unknown argument '${a}'`);
        console.error(`  Next step: run: node ${SELF_REL}, or add --self-test to prove the agreement discriminates.`);
        process.exit(2);
    }
}
// (scripts/verify-update-channel.mjs:42-60)
```

Every new script copies this verbatim apart from `NAME`/`SELF_REL`: exit 2 on any unknown arg, and the next-step line naming the bare run plus `--self-test`.

**Injectable reads + `runChecks(root, overrides = {})`** (`scripts/verify-update-channel.mjs:122-139`, `150-153`):

```js
function readText(root, rel) {
    try {
        return readFileSync(join(root, rel), 'utf8');
    } catch {
        return null;
    }
}

function listTracked(root) {
    try {
        return execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
            .split('\n')
            .map(l => l.trim())
            .filter(l => l !== '');
    } catch {
        return null;
    }
}
// (scripts/verify-update-channel.mjs:122-139)
```

```js
function runChecks(root, overrides = {}) {
    const failures = [];
    const consumers = [];
    const read = overrides.read ?? ((rel) => readText(root, rel));
    // (scripts/verify-update-channel.mjs:150-153)
```

The `overrides.read` / `overrides.files` / `overrides.mozconfig`-style seams are what make the self-test quick-tier: every plant below goes through them, never through disk writes in the repo.

**Derivation, never hand-kept lists** (`scripts/verify-update-channel.mjs:156-183`): resolve the manifest, emit in memory, compare exactly and case-sensitively. Per-row derivation sources (frozen by RESEARCH):

- `release-shape`: derive from `release.yml` text + `configuration.toml` + `release-manifest.json` schema. Plants (RESEARCH §Registry rows): `pull_request` trigger added; tag trigger added; `sha` input missing/not-required; legion job with `environment:`; legion job with `secrets.`; `retention-days` != 1; `actions/cache` or `cache:` in path; key>tag gate absent; SHA-ancestor gate absent.
- `hook-refusal`: derive from the tracked hook script text + `release.yml` job ids. Plants: `GITHUB_WORKFLOW_REF` from another branch accepted; event `push` accepted; wrong repo accepted; SHA-step missing from a legion job.
- `mar-channel-gate`: derive from the `.mozconfig` emission (`MAR_CHANNEL_ID` / `ACCEPTED_MAR_CHANNEL_IDS` at `scripts/generate.mjs:1483-1484`, built from `updateChannel()` at `scripts/generate.mjs:1393-1396`) against fixture MAR product-info blocks. Plants: fixture MAR with foreign channel accepted; gate reading `--channel` as MAR id; `signmar -v` against non-tracked DER; sign-before-verify order swapped.
- `release-asset-set`: derive the expected set from the run's `release-manifest.json` fixture + tree (notices, source-tarball rule, tag shape), compare as set equality. Plants: dropped asset; extra asset; stable-name drift; versioned-name drift; publish-before-equality step order swapped.

The tracked comparands each row derives against (never types): `.mozconfig:8-10` (`--enable-update-channel=default`, `MAR_CHANNEL_ID=powerbrowser-default`, `ACCEPTED_MAR_CHANNEL_IDS=powerbrowser-default`); `UPDATE_CHANNEL = 'default'` (`scripts/generate.mjs:1387`); `updateChannel()` returning `{ channel, marChannelId }` (`scripts/generate.mjs:1393-1396`).

**main / PASS-FAIL output** (`scripts/verify-update-channel.mjs:246-257`):

```js
function main() {
    if (args.includes('--self-test')) return selfTest();
    const { failures, consumers, expected } = runChecks(REPO_ROOT);
    printConsumers(consumers);
    if (failures.length > 0) {
        console.error(`${NAME}: FAIL -- ${failures.length} problem(s) with the update channel agreement.`);
        failures.forEach(f => console.error(`  ${f}`));
        return 1;
    }
    console.log(`${NAME}: PASS -- update channel '${expected.channel}' and MAR channel id '${expected.mar}' derive from UPDATE_CHANNEL and every structured mention agrees with the value of its own kind; ${POLICIES_REL} carries no update URL`);
    return 0;
}
// (scripts/verify-update-channel.mjs:246-257)
```

**Self-test: green baseline first, plants table, each red naming file+value, control stays green** (`scripts/verify-update-channel.mjs:265-272`, `287-298`, `301-325`):

```js
const baseline = runChecks(REPO_ROOT, { read: realRead, files });
if (baseline.failures.length > 0) {
    console.error(`${NAME}: --self-test FAIL -- the unmodified tree is already red, so the planted-fault results below would mean nothing:`);
    baseline.failures.forEach(f => console.error(`  ${f}`));
    return 1;
}
console.log(`  ok  baseline -> green`);
// (scripts/verify-update-channel.mjs:266-272)
```

```js
const plants = [
    ['descriptor path with channel release', { read: withLine(RELEASING, '`release/Linux_x86_64-gcc3/update.xml`') }, RELEASING, 'release'],
    [`backticked MAR id ${app}-release`, { read: withLine(RELEASING, `The MAR channel id is \`${app}-release\`.`) }, RELEASING, `${app}-release`],
    // ... one entry per RESEARCH plant; each names file + value
];
// (scripts/verify-update-channel.mjs:287-298)
```

```js
const hit = failures.some(f => f.includes(file) && f.includes(needle));
if (hit) {
    console.log(`  ok  ${name} -> red, naming '${file}' and '${value}'`);
} else {
    console.error(`${NAME}: --self-test FAIL -- '${name}' did not go red naming '${file}' and '${value}'; got: ${failures.join(' | ') || '(no failures at all)'}`);
    failed += 1;
}
// (scripts/verify-update-channel.mjs:301-312, condensed)
```

Keep the control pattern (`scripts/verify-update-channel.mjs:317-325`): the MAR key store and runner unit names legitimately containing `<app_basename>-release` stay green — new rows need the analogous control (e.g. a doc mention of the hook path that must not trip the refusal table).

---

### `scripts/verify-channel-live.mjs` (gate, live half + quick self-test)

**Analog:** `scripts/verify-repo-controls.mjs` (live read-back + in-memory self-test; no other `gh api` / live-HTTP caller shape exists in tree)

**Pinned API version + `ghGet` fail-closed** (`scripts/verify-repo-controls.mjs:42`, `60-74`):

```js
export const API_VERSION_HEADER = 'X-GitHub-Api-Version: 2022-11-28';
// (scripts/verify-repo-controls.mjs:42)
```

```js
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
// (scripts/verify-repo-controls.mjs:60-74)
```

`channel-live` copies the posture: every live read (Releases API, `update.xml` fetch through the baked 11-segment path, MAR `HEAD`/`GET`) goes through one getter that returns `{ ok, body }` / `{ ok, why }`; a non-2xx, missing auth, or unparseable body is a FAIL naming the endpoint and the next step, never a SKIP and never a PASS. Relevant endpoints are listed in RESEARCH §Key shapes (`GET /repos/{owner}/{repo}/releases?per_page=1`, `GET /repos/.../actions/runs/{id}/pending_deployments`).

**`safeGetter` (throw / malformed / truncated are unreadable, never green)** (`scripts/verify-repo-controls.mjs:78-97`):

```js
function safeGetter(get) {
    const cache = new Map();
    return (path) => {
        if (cache.has(path)) return cache.get(path);
        let r;
        try {
            r = get(path);
        } catch (e) {
            r = { ok: false, why: `GET ${path} could not be read (${String(e?.message ?? e).split('\n')[0]}). ${NEXT_AUTH}` };
        }
        // ... malformed result and truncated list each become unreadable
        cache.set(path, r);
        return r;
    };
}
// (scripts/verify-repo-controls.mjs:78-97, condensed)
```

**Projection + set equality, not hand-kept lists** (`scripts/verify-repo-controls.mjs:130-147`): keep only declared keys, compare arrays as sets so an addition and a removal are both red. `channel-live` applies the same to `parseUpdateXml` output vs the manifest: offered `appVersion`/`buildID` vs `GET /releases/tags/v<key>` (`draft:false`), `HEAD Content-Length` vs descriptor `size`, `GET` MAR sha512 vs `hashValue`, `https` + `/releases/download/<tag>/` URL form (latest-download URL is red).

> Superseded by the 2026-10-29 owner ruling (49-CONTEXT.md, "Inherited constraint: update download host"): the `/releases/download/` form in the paragraph above is replaced by the MAR-origin form `<MAR origin>/<tag>/<asset>`.

**CONTROLS-style table + `context`/`runChecks` split** (`scripts/verify-repo-controls.mjs:551-646`, `697-734`): one table of comparators owns the live surface; `runChecks(root, overrides)` takes `overrides.get` so the self-test runs with no network and no `gh`. The self-test serves the declared state back in the live response shape and plants each widening (`scripts/verify-repo-controls.mjs:794-814` `fakeState`, `899-923` baseline-then-plants loop):

```js
const baseline = runChecks(REPO_ROOT, { ...fixed, get: getterOf(base), ...extra });
// self-test plants mutate a clone of the served-back state, each red naming the control
// (scripts/verify-repo-controls.mjs:910-923, condensed)
```

> Superseded by the 2026-10-29 owner ruling (49-CONTEXT.md, "Inherited constraint: update download host"): the latest-download plant is replaced by the nine plants in plan 49-04 Task 2.

`channel-live --self-test` follows the same loop over mkdtemp manifest/tree/server fixtures (RESEARCH: wrong `hashValue`, missing target file, 404 MAR, size mismatch, latest-download URL — each red naming target + value). Honestly-quick note for the header: `node:crypto` plus text files in mkdtemp (precedent: `scripts/verify-mar-update-hop.mjs:94-100` `marDigest`, header at `scripts/verify-mar-update-hop.mjs:44` "Honestly --quick (self-test only): node:crypto plus text files in mkdtemp. No build, no browser, no display, no network.").

---

### DIST-02 key>tag split + TRAIN-10 SHA gate (workflow text, not `--quick`)

**Analog:** `scripts/verify-release-identity.mjs` (derive-and-compare; mkdtemp self-test over a git repo)

The split is stated in the analog's own header and must be preserved (`scripts/verify-release-identity.mjs:31-33`):

```js
// NOT HERE: that the key is new -- above every earlier release tag and the
// latest published GitHub Release -- is checked where a tag is created, in
// release.yml (DIST-02) and the release train (TRAIN-01), never in --quick.
// (scripts/verify-release-identity.mjs:31-33)
```

Static derivation helpers the workflow inlines (or a lib inlines for it) come from `scripts/generate.mjs:2796-2808`:

```js
export function releaseIdentity(config) {
    const tag = config.upstreams?.firefox_esr_tag;
    const m = typeof tag === 'string' ? ESR_RELEASE_TAG.exec(tag) : null;
    // ...
    const esrVersion = m.slice(1).filter(g => g !== undefined).join('.');
    const revision = config.product.revision;
    return Object.freeze({ esrVersion, revision, releaseKey: `v${esrVersion}-${revision}` });
}
// (scripts/generate.mjs:2796-2808, condensed)
```

Tuple comparison precedent (`scripts/verify-release-identity.mjs:73-81`):

```js
function tupleOf(esrVersion, revision) {
    const [major, minor, patch = 0] = esrVersion.split('.').map(Number);
    return [major, minor, patch, Number(revision)];
}

function lower(a, b) {
    for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return a[i] < b[i];
    return false;
}
// (scripts/verify-release-identity.mjs:73-81)
```

`release-shape` asserts the gate *exists* in `release.yml` text (key strictly greater than latest Release tag else exit 0 without building; SHA is `main` tip or `configuration.toml`-changing ancestor **and** `.github/workflows/` identical to `main`'s, else exit 1 — RESEARCH Pitfall 2). The self-test precedent for fixtures over a git repo is the mkdtemp block (`scripts/verify-release-identity.mjs:200-221`): `mkdtempSync`, manifest copied so the tag/key are derived never typed, `put` + `git add/commit`, overrides `{ git: ... }`, `finally { rmSync }`.

---

### `scripts/verify-mar-channel-gate.mjs` fixture reads

**Analog:** `scripts/verify-release-identity.mjs` steps 1-3 (tracked files + descriptors read from the tree at check time, set-equality against the derivation; `scripts/verify-release-identity.mjs:106-159`). Copy the per-file failure shape:

```js
failures.push(`${rel} reads ${JSON.stringify(got)} but ${MANIFEST_REL} derives ${JSON.stringify(`${want}\n`)} -- it was hand-written or is stale. Next step: run ${RERUN} and copy the generated file over it; never edit it by hand.`);
// (scripts/verify-release-identity.mjs:111, pattern)
```

The MAR channel id derivation root is `updateChannel()` (`scripts/generate.mjs:1393-1396`) with the constant at `scripts/generate.mjs:1387`; the emission lines are at `scripts/generate.mjs:1483-1484`. SEC-07's gate cross-checks `--channel` against `MOZ_UPDATE_CHANNEL` in `config.status` and fails naming both (RESEARCH Pitfall 6: `default` vs `powerbrowser-default` conflation is the fault this row exists to catch).

---

### `scripts/verify-mar-update-hop.mjs` exports (consumed, not re-implemented)

Phase 44's `build-update-xml.mjs` imports `buildUpdateXml`; `channel-live` imports `parseUpdateXml`. Both are the single source — do not copy their bodies into new files (`scripts/verify-mar-update-hop.mjs:106-122` header: "THE SINGLE SOURCE for the fork descriptor format ... never a hand-written update.xml"):

```js
export function buildUpdateXml({ marBytes, marUrl, appVersion, platformVersion, buildID, displayVersion, updateType = 'minor' }) {
    const { hashValue, size } = marDigest(bytes);
    return `<?xml version="1.0" encoding="UTF-8"?>\n`
        + `<updates>\n`
        + `  <update type="${xmlEscape(updateType)}" displayVersion="${xmlEscape(displayVersion)}" appVersion="${xmlEscape(appVersion)}" platformVersion="${xmlEscape(platformVersion)}" buildID="${xmlEscape(buildID)}">\n`
        + `    <patch type="complete" URL="${xmlEscape(marUrl)}" hashFunction="sha512" hashValue="${hashValue}" size="${size}"/>\n`
        + `  </update>\n`
        + `</updates>\n`;
}
// (scripts/verify-mar-update-hop.mjs:114-122, condensed)
```

```js
export function parseUpdateXml(text) {
    const update = text.match(/<update\b([^>]*)>/);
    const patch = text.match(/<patch\b([^>]*)\/>/);
    if (!update || !patch) return null;
    // ... attr() extraction of appVersion, buildID, platformVersion,
    // displayVersion, URL, hashFunction, hashValue, size; null when absent
}
// (scripts/verify-mar-update-hop.mjs:125-150, condensed)
```

Resolver-host sift stays anchored (`scripts/verify-mar-update-hop.mjs:158-165`): hostnames come ONLY from `Resolving host [...]`. `marDigest` is sha512 hex + byte size (`scripts/verify-mar-update-hop.mjs:94-100`).

---

### `scripts/verify-toolchain-container.mjs` + `toolchain-baseline.sh` / `toolchain-baseline.txt` (AUTO-05)

**Analog:** `scripts/toolchain-baseline.sh` (9 lines) + `docs/BUILD.md` Toolchain-baseline section. The emitter stays tiny:

```bash
#!/usr/bin/env bash
# D-13 baseline. Assumes it is already running inside the `firefox` dev
# shell -- it does not enter that shell itself, so Phase 3's CI can invoke
# it from whatever shell context CI already has.
set -euo pipefail

rustc --version | grep -oE '^rustc [0-9]+\.[0-9]+\.[0-9]+' | sed 's/^rustc /rustc /'
cargo --version | grep -oE '^cargo [0-9]+\.[0-9]+\.[0-9]+' | sed 's/^cargo /cargo /'
cbindgen --version | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | sed 's/^/cbindgen /'
# (scripts/toolchain-baseline.sh:1-9)
```

```text
rustc 1.97.1
cargo 1.97.0
cbindgen 0.29.4
# (toolchain-baseline.txt:1-3)
```

Phase 45 extends the *meaning* to the container bootstrap (Mozilla clang, rust, cbindgen, jessie sysroot glibc 2.19, container image digest), not the mechanism; Phase 49 invokes it in `build-linux` and fails the build on drift. The diff/regen commands the docs carry (and the new row asserts) are:

```text
diff <(nix develop .#firefox --command bash scripts/toolchain-baseline.sh) toolchain-baseline.txt
# (docs/BUILD.md:1216)
```

```text
nix develop .#firefox --command bash scripts/toolchain-baseline.sh > toolchain-baseline.txt
# (docs/BUILD.md:1227; regen only deliberately, as part of a reviewed rebase)
```

Never pin `MOZ_BUILD_DATE` (RESEARCH Pitfall 7 — same-ESR revisions would share a buildID and never be offered).

---

### `scripts/verify-platform.sh` (registry rows)

Append inside the quick `CHECKS=(` array right after the `workflows-self-test` anchor, and inside the full-tier `if [ "$QUICK" -eq 0 ]; then CHECKS+=(` block after the `repo-controls` anchor. Quote label anchors, never line numbers (ARCHITECTURE §3.4). Shape precedent (`41-PATTERNS.md` pattern, current anchors verified in tree):

```sh
    # NEW (Phase 41, GH-12 and GH-08): the trust-boundary rules over every workflow --
    # SHA-pinned and admitted uses:, set equality with actions-selected.json, and the GH-12
    # runner, permission, trigger, cache and event-text rules. Honestly --quick: YAML parsing
    # (js-yaml from theia/) and file reads only; no build, browser, display or network.
    "workflows|node $REPO_ROOT/scripts/verify-workflows.mjs"
    # workflows-self-test plants, in memory, unpinned, short, uppercase and docker:// uses:, an
    # unadmitted foo/bar, an unused admission, an empty patterns_allowed, a duplicate on:, zero
    # workflows, and each GH-12 fault over a good release.yml fixture; each red naming file and
    # job. It writes nothing.
    "workflows-self-test|node $REPO_ROOT/scripts/verify-workflows.mjs --self-test"
```

```sh
      # NEW (Phase 41, GH-02): the live org and repo equal the declared .github/settings/
      # bodies, by projection and set equality, failing closed on any unreadable endpoint.
      # Full tier: read-only gh api against the live org and repo (network, gh auth with repo
      # and read:org); green only after the owner applies the settings at plan 41-04.
      "repo-controls|node $REPO_ROOT/scripts/verify-repo-controls.mjs"
```

New rows follow the same comment shape (`NEW (Phase 49, <REQ>): <what it proves>. Honestly --quick: <why no build, browser, display or network>` plus a sibling `<label>-self-test` comment listing each planted fault and closing with `it writes nothing`): `release-shape`, `release-shape-self-test`, `hook-refusal`, `hook-refusal-self-test`, `mar-channel-gate`, `mar-channel-gate-self-test`, `release-asset-set`, `release-asset-set-self-test` in the quick array; `channel-live-self-test` in the quick array and `channel-live` in the full-tier block (live half needs network + Releases/Pages as facts, RESEARCH Project Constraints). `descriptor-monotonic`, `packaged-launch`, `install-matrix` rows are consumed from Phases 44/45, not re-declared.

---

### `scripts/verify-workflows.mjs` GOOD_RELEASE fixture (EXTEND, do not duplicate)

Extend the in-memory fixture at `scripts/verify-workflows.mjs:390-420` — do not write a second YAML parser. Current shape (to be extended with `descriptor` + `channel-live` jobs, the `sha` input, `retention-days: 1`):

```js
const GOOD_RELEASE = [
    'name: Release',
    'on:',
    '  push:',
    '    tags: ["v*"]',
    'permissions:',
    '  contents: read',
    'jobs:',
    '  build-linux:',
    '    runs-on: [self-hosted, legion]',
    '    permissions:',
    '      contents: read',
    '    steps:',
    `      - uses: actions/checkout@${H40}`,
    '        with:',
    '          persist-credentials: false',
    '      - run: echo build',
    '  sign-publish:',
    '    needs: build-linux',
    '    runs-on: ubuntu-latest',
    '    environment: release',
    '    permissions:',
    '      contents: write',
    '      id-token: write',
    '      attestations: write',
    '    steps:',
    '      - run: echo publish',
    '',
].join('\n');
// (scripts/verify-workflows.mjs:391-420, condensed)
```

The trust-boundary rules this fixture must keep satisfying are declared at `scripts/verify-workflows.mjs:15-56` (`no-schedule`, `runner`, `legion` = release.yml jobs `build-*`/`matrix-*` with no `environment`, no `secrets.`, no `secrets: inherit`; `write-trio` only on `sign-publish`; `no-pr-trigger`; `no-cache`; SHA-pinned `uses:` admitted by `actions-selected.json`). `release-shape` asserts the Phase 49 additions beyond `workflows`; it never re-parses workflows itself.

---

### `.github/workflows/release.yml` (workflow posture)

Copy the posture from the two analogs, not the S5 draft text:

```yaml
    permissions:
      contents: read
    steps:
      - name: Check out repo
        uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4.4.0
        with:
          persist-credentials: false
          fetch-depth: 0 # gui07-strip-spike-verdict derives the 13-01 commits from history
# (.github/workflows/verify.yml:39-46)
```

```yaml
      - name: Install Nix
        uses: cachix/install-nix-action@13d8dd58da0234aa297dedd986986ccb8e7f3e24 # v31.11.1
# (.github/workflows/verify.yml:52-54)
```

```yaml
      - name: Generate the derived build surfaces
        run: nix develop .#theia --command node scripts/generate.mjs
# (.github/workflows/verify.yml:66-67; the `nix develop .#theia --command` step shape)
```

No-default input discipline from the callable precedent (` .github/workflows/rebase-upstream.yml:22-34`; header comment at `.github/workflows/rebase-upstream.yml:2-5`: "the caller passes the tag explicitly. The tag input has no default, so an ESR bump edits configuration.toml alone and never this file"):

```yaml
on:
  workflow_dispatch:
    inputs:
      tag:
        description: "Upstream Firefox-ESR tag to rebase onto"
        required: true
        type: string
  workflow_call:
    inputs:
      tag:
        description: "Upstream Firefox-ESR tag to rebase onto"
        required: true
        type: string
# (.github/workflows/rebase-upstream.yml:22-34)
```

`release.yml` needs `workflow_dispatch` only (with a required no-default `sha` string input) — no `workflow_call`, no `push`, no `pull_request`, no `schedule`, no tag trigger (S5's tag trigger is superseded by owner decision 3; the dispatch-validation shape is RESEARCH §Key shapes `on:` block). Job/environment names are frozen (`build-linux` on `[self-hosted, powerbrowser-release]`, `sign-publish` on `ubuntu-latest` + `environment: release`, `descriptor` + 1440-min wait, `channel-live` last). The `write-trio` appears on exactly one job (`sign-publish`).

---

### `.github/settings/actions-selected.json` (admissions extension)

```json
{
  "github_owned_allowed": true,
  "verified_allowed": false,
  "patterns_allowed": [
    "cachix/install-nix-action@*"
  ]
}
# (.github/settings/actions-selected.json:1-7)
```

Phase 49 adds exactly the actions `release.yml` uses (all `actions/*` GitHub-owned + `attest-build-provenance`; `create-github-app-token` needs a `patterns_allowed` entry `actions/create-github-app-token@*` if used) — applied + committed together, or the `uses-admitted`/`admission-used` set-equality goes red. `sha_pinning_required: true` stays; every `uses:` is a 40-hex SHA with the version in a trailing comment (resolved at authoring time via `gh api repos/<owner>/<action>/git/ref/tags/<tag>` — invent no SHA).

---

### `docs/RELEASING.md`, `docs/BUILD.md` (rewrites + measurement rows)

`docs/RELEASING.md` sections Phase 49 rewrites with values derived from the built tree: the ephemeral runner-shape text (`docs/RELEASING.md:257-287` — `ephemeral = true`, PAT at `/var/lib/secrets/github-runner-pat`, `extraLabels = [ "legion" ]` — replaced by the non-ephemeral, registration-token, own-user, no-credential, no-space work dir shape per owner decision 2); the rulesets/environments text (`docs/RELEASING.md:306-334`); the `## Release asset names` table (`docs/RELEASING.md:696`); the runner-group probe result and GH-18 drill results; the per-release procedure (watch/approve/confirm/liveness/hop). The `## Verification map` gains the new rows.

`docs/BUILD.md` gains the INF-04 cold-fallback row (procedure + measured duration + disk, under the attribution rule: tree + host + toolchain per figure) and the per-release artifact-size row measured against the 500 MB cap (`retention-days: 1` + post-sign-publish deletion is the mitigation either way). The Toolchain-baseline section (`docs/BUILD.md:1210-1228`) is the analog for both rows' shape.

---

## Shared Patterns

- **Message format:** `${NAME}: FAIL -- ...` / `${NAME}: PASS -- ...` / `  ok  <plant> -> red, naming ...`; exit 0/1, 2 for bad args (`scripts/verify-update-channel.mjs:54-60`, `246-257`; `scripts/verify-release-identity.mjs:60-66`; `scripts/verify-repo-controls.mjs:763-782`; `scripts/verify-workflows.mjs:79-86`, `354-364`).
- **Every failure ends with a next step** ("Next step: run ..."), e.g. `scripts/verify-update-channel.mjs:57` and `scripts/verify-repo-controls.mjs:58` (`NEXT_AUTH`: `run gh auth status; the row needs scopes repo and read:org`).
- **Derive, do not hand-keep lists:** expectations come from `configuration.toml` via `resolveConfig`/`releaseIdentity`/`updateChannel`, the `.mozconfig` emission, `git ls-files`, `.github/settings/*.json` and `.github/workflows/*`, compared as sets so addition and removal both go red (CLAUDE.md Verification rule 2; enforced by `verify-release-identity.mjs:140-182`, `verify-update-channel.mjs:197-220`, `verify-repo-controls.mjs:130-147`, `verify-workflows.mjs:22-24` `admission-used`).
- **Fail closed:** unreadable file/endpoint or missing instrument (`js-yaml` per `scripts/verify-workflows.mjs:88-94`, `gh` auth per `scripts/verify-repo-controls.mjs:60-74`, `safeGetter` per `scripts/verify-repo-controls.mjs:79-97`) = FAIL with named cause; zero subjects = distinct FAIL (vacuity, cf. `scripts/verify-update-channel.mjs:217-220` check 3, `scripts/verify-workflows.mjs:476` zero-workflow plant).
- **Self-test writes nothing in the repo:** plants in memory through `runChecks` overrides (`scripts/verify-update-channel.mjs:39-40`; `scripts/verify-workflows.mjs:64-65`) or in a mkdtemp git repo removed in a `finally` (`scripts/verify-release-identity.mjs:200-203`, `317-319`). Stage every new file before trusting `scan-brand-residue.mjs` (it iterates `git ls-files`); the originating product may be named only in `inventory/brand-tokens.json`.
- **Phase-49 tiering:** static derivation quick; network comparison in the workflow or the full-tier row (`scripts/verify-release-identity.mjs:31-33` — key-is-newer checked where the tag is created, never in `--quick`). `repo-controls`, `channel-live` (live half), `descriptor-monotonic` reads, and the in-container toolchain diff are full-tier; their self-tests are quick (mkdtemp/fixtures/loopback only).

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| Tracked pre-job hook script (SEC-10, `ACTIONS_RUNNER_HOOK_JOB_STARTED` target) | runner control | file-I/O (static text) | no hook script exists anywhere in tree; prescribe from 49-RESEARCH.md §Key shapes Pre-job hook body: `set -euo pipefail`, exit non-zero unless `GITHUB_REPOSITORY` is the repo, `GITHUB_WORKFLOW_REF` is `.../release.yml@refs/heads/main`, and `GITHUB_EVENT_NAME` is `workflow_dispatch`; NixOS wiring via `services.github-runners.<name>` (`enable, url, tokenFile, user, workDir` without space, `replace`, `name`, `extraLabels`, `user pb-runner` + `autoSubUidGidRange`, hook path in the unit environment) — owner action on legion finished with `nrs`; registration only after SEC-11 + SEC-10 + GH-07 |

## Metadata

**Analog search scope:** `scripts/`, `.github/workflows/`, `.github/settings/`, `docs/`, repo root
**Files scanned:** 14 tracked analogs (all `git ls-files`-verified) + 49-CONTEXT.md + 49-RESEARCH.md + 41-PATTERNS.md (format precedent)
**Pattern extraction date:** 2026-10-23
