# Phase 50: Release train stages and first public Linux release (E) - Pattern Map

**Mapped:** 2026-10-23
**Files analyzed:** 18
**Analogs found:** 12 / 14 file groups

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `scripts/release-train.mjs` (MOD: 8 state rows + dispatch-release + run link) [ASSUMED — SPEC shape from RESEARCH, verify at execution] | state derivation / orchestrator | derive-and-compare over fixture JSON (pure `derive`/`next`/`render`) | `scripts/verify-repo-controls.mjs` (`runChecks` + `CONTROLS` table + `safeGetter` fail-closed) + `scripts/plan-gate.py` (stream-scoped gate) | role-match |
| `.github/workflows/release.yml` (MOD: `merge_sha` input + SHA-validation first step only) [ASSUMED — SPEC shape from RESEARCH, verify at execution] | config/CI | file-I/O (`git` plumbing in `run:`) | `.github/workflows/rebase-upstream.yml` (tag input, `env:`-passed values, `fetch-depth: 0`) | exact shape |
| `.github/workflows/release-train.yml` (MOD: `dispatch-release` job + report-job KNOWN-ISSUES step + run link) [ASSUMED — SPEC shape from RESEARCH, verify at execution] | config/CI | request-response (`gh api` dispatch + poll by `head_sha`) | `.github/workflows/notify-drill.yml` (environment-wait shape) + `scripts/verify-workflows.mjs` GOOD_RELEASE fixture | role-match |
| `powerbrowser-updates/.github/workflows/withdraw.yml` (NEW, separate repo) [ASSUMED — SPEC shape from RESEARCH, verify at execution] | config/CI (withdrawal) | file-I/O (commit bytes) + request-response (PATCH Release) | `.github/workflows/rebase-upstream.yml` (hosted, SHA-pinned `uses:`, `env:`-passed inputs) + `scripts/apply-repo-controls.mjs` (mint-just-before-use token) | role-match |
| `scripts/verify-mar-update-hop.mjs` (MOD: `served` selector `loopback`\|`release` + 6-property release set + 11 plants) | test/gate | file-I/O over `.mozbuild/mar-hop/` + in-memory emit compare | itself (exports + evidence-half + mkdtemp self-test) | exact |
| `scripts/verify-update-channel-live.mjs` (MOD: `--withdrawn` expectation flip) [ASSUMED — SPEC shape from RESEARCH, verify at execution] | test/gate | request-response (HTTP fetch/HEAD) + byte-compare | `scripts/verify-mar-update-hop.mjs` evidence-half (hash/size/URL assertions) | role-match |
| `scripts/detect-upstreams.mjs` (READ-ONLY input to `derive`) [ASSUMED — SPEC shape from RESEARCH, verify at execution] | utility | request-response (read-only tags) | `scripts/verify-repo-controls.mjs` `ghGet` read path | role-match |
| `scripts/build-update-xml.mjs` (UNCHANGED; imports `buildUpdateXml`) [ASSUMED — SPEC shape from RESEARCH, verify at execution] | generator | transform | `scripts/verify-mar-update-hop.mjs` `buildUpdateXml` (single source) | exact |
| `docs/KNOWN-ISSUES.md` (SOURCE, Phase 42 creates; read at merge SHA) [ASSUMED — SPEC shape from RESEARCH, verify at execution] | doc | file-I/O (bytes copied verbatim) | none (file absent; RESEARCH §Pattern 4 is the spec) | none, use RESEARCH |
| `docs/RELEASING.md` (MOD: probe verdict, withdraw runbook, hop record, pin link) | doc | — | itself (procedure steps 2–8, asset table, maintenance) | exact |
| `scripts/verify-platform.sh` (MOD: extend 2 self-tests in place; +1 row only if planner adds a withdraw-shape gate) | config/registry | — | its own rows at lines 4450–4469, 4654–4674, 4706–4730, 4830, 5092 | exact |
| `configuration.toml` (`[product]`/`[upstreams]`/`[urls]`, derivation source; no Phase 50 edit) | config | — | itself | exact |
| `.github/workflows/*` trust boundary (must stay green; no new rule) | gate (static) | transform (YAML parse + derive/compare) | `scripts/verify-workflows.mjs` (+ GOOD_RELEASE fixture + plant list) | exact |
| `release-train: maintenance` sweep issue rows (OBSERVE ONLY at criterion 5) [ASSUMED — SPEC shape from RESEARCH, verify at execution] | ops/observation | request-response (read) | `.planning/workstreams/deploy/phases/41-repository-controls-and-github-apps-a/COVERAGE.md` (matrix form) | role-match |

Note: RESEARCH names `scripts/release-train.mjs` (`derive`/`next`/`render` + one state table + `release-train-logic-self-test`), `scripts/detect-upstreams.mjs`, `scripts/build-update-xml.mjs`, `.github/workflows/release.yml` (four jobs), `.github/workflows/release-train.yml`, the `powerbrowser-updates` repo, `docs/KNOWN-ISSUES.md`, and the maintenance sweep. None exists in the tree today (`gh api` baseline: 0 Releases, updates repo 404, train scripts absent — RESEARCH §Live baseline). They are [ASSUMED] below: the SPEC-level contract is quoted from RESEARCH §§Pattern 1–6, and the executor must verify each shape against the landed tree and record deltas in the SUMMARY (CONTEXT A1–A7).

## Pattern Assignments

### `scripts/release-train.mjs` extension — copy `scripts/verify-repo-controls.mjs` (table + fail-closed reads) and `scripts/plan-gate.py` (gate shape)

**Analog:** `scripts/verify-repo-controls.mjs` (1129 lines). The one-table pattern: `CONTROLS` is the single source that `runChecks` reads and `planWrites` (imported by `apply-repo-controls.mjs`) writes, so read and write endpoints cannot drift (header lines 24–28). Phase 50's state table plays the same role: `derive`/`next`/`render` read the one table; the self-test derives the state list from the table itself and compares as set equality (RESEARCH §Pattern 6).

**Control-table shape** (lines 551–598, entries frozen at 646):
```js
export const CONTROLS = Object.freeze([
    {
        id: 'actions-permissions',
        file: 'actions-permissions.json',
        write: { method: 'PUT', path: PERMISSIONS_PATH },
        read: PERMISSIONS_PATH,
        compare: projection,
    },
    // ... environments (plan hook), rulesets, immutable-releases (plan hook), ...
].map(Object.freeze));
```
→ New train states are rows in the same style: `{ state, derivesFrom, next }` with evaluation priority = table order, first match wins (RESEARCH §Pattern 1: BUILDING, AWAITING_APPROVAL, PUBLISHED, DESCRIPTOR_WAIT, DESCRIPTOR_LIVE, LIVE_RED, WITHDRAWN, DONE).

**Fail-closed reads** (lines 60–97): every getter goes through `safeGetter`; non-2xx (other than Release/contents 404-meaning-absent), missing `gh`, truncated lists, or unparseable JSON is FAIL naming the endpoint — never SKIP, never PASS:
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
    ...
}
export const API_VERSION_HEADER = 'X-GitHub-Api-Version: 2022-11-28';
```
→ The train collector (`collectFacts`, RESEARCH §Code Examples) reuses this verbatim: pin the version header on every call, poll `runs?head_sha={mergeSHA}&event=workflow_dispatch`, resolve the run by `head_sha` equality (never recency), `tryGet` maps Release/contents 404 → null.

**Projection + set-equality compare** (lines 126–147):
```js
function project(decl, live) { ... }   // keep only declared keys; arrays map per-element
function canon(v) {                    // sorted keys; every array compared as a set
    if (Array.isArray(v)) return `[${v.map(canon).sort().join(',')}]`;
    ...
}
const same = (decl, live) => canon(decl) === canon(project(decl, live));
```
→ Asset-set comparison (Release assets vs manifest-derived set) and descriptor-set comparison use the same `canon` discipline: addition and removal both go red.

**Owner/repo derivation, never literals** (lines 109–120):
```js
export function repoSlug(root, config = loadConfig(root)) {
    const raw = config.urls?.release_notes;
    ...
    // https://github.com/<owner>/<repo>/... or throw naming configuration.toml
}
```
→ Train scripts derive owner/repo from `configuration.toml [urls].release_notes` (CLAUDE.md rebrand-inputs rule); the `verify-repo-controls.mjs` `repoSlug` precedent is cited by RESEARCH §Project Constraints.

**Collector + run-link sketch** (RESEARCH §Code Examples, SPEC text — planner owns names):
```js
export function collectFacts({ owner, repo, updatesRepo, tag, mergeSha, gh = ghGet }) {
  const run = gh(`repos/${owner}/${repo}/actions/workflows/release.yml/runs?head_sha=${mergeSHA}&event=workflow_dispatch&per_page=10`);
  const runId = newestRunWithHeadSha(run, mergeSha)?.id ?? null;   // equality, never recency
  return {
    run: runId ? gh(`repos/${owner}/${repo}/actions/runs/${runId}`) : null,
    pending: runId ? gh(`repos/${owner}/${repo}/actions/runs/${runId}/pending_deployments`) : [],
    release: tryGet(gh, `repos/${owner}/${repo}/releases/tags/${tag}`),   // 404 → null, not red
    descriptors: targets.map(t => tryGet(gh, `repos/${owner}/${updatesRepo}/contents/${channel}/${t}/update.xml?ref=main`)),
    issue: searchTrackingIssue(owner, repo, tag),
  };
}
```
State table extension (evaluation priority, RESEARCH §Pattern 1): BUILDING (run queued/in_progress, release absent/draft) → AWAITING_APPROVAL (pending names `release`) → PUBLISHED (draft false, prerelease false, full asset set) → DESCRIPTOR_WAIT (pending names `descriptor` or 1440-min timer) → DESCRIPTOR_LIVE (bytes byte-equal + `channel-live` green) / LIVE_RED (descriptors present, gate red) → WITHDRAWN (prerelease flag or body marker + no-update descriptors) → DONE (DESCRIPTOR_LIVE + issue closed). WITHDRAWN outranks DESCRIPTOR_LIVE/LIVE_RED when the mark is present.

**Self-test extension shape** — copy `scripts/verify-release-identity.mjs` fixture pattern (see below) plus the repo-controls in-memory plant loop (lines 910–918: `runChecks(REPO_ROOT, { ...fixed, get: getterOf(base), ...extra })`, baseline green first at 918). RESEARCH §Pattern 6: one fixture per new state in live response shape (`status`/`conclusion`/`head_sha`/`html_url`, pending arrays, Release `draft`/`prerelease`/`assets`, contents base64, issue `state`), plus SHA plants (non-tip, non-manifest ancestor, workflows-divergent ancestor), plus one-transition-per-run and exact-`html_url`-linkage assertions. Row stays quick (in-memory, no network); no new registry row.

**Gate precedent** — `scripts/plan-gate.py` stream-scoped gate (lines 46–72 `due_ids` with `--stream`; lines 237–272 `self_test()` with planted ledgers in temp dirs, each case asserting exit + output fragment):
```python
rows = [
    {"id": "AA-1", "status": "deferred-approved", "phase": "26"},
    {"id": "BB-1", "status": "deferred-approved", "phase": "40", "stream": "ws"},
]
cases = [  # (label, extra argv, plan text, expected exit, required output fragment)
    ("default stream counts a stream-less row", [], "cites nothing", 1, "AA-1: due"),
    ...
]
```
→ The one-transition-per-run rule and the DONE-vs-DESCRIPTOR_LIVE bookkeeping distinction (`derive` returns DONE only when the issue is already closed) follow this gate shape: pure function over facts, planted fact-sets per case.

### `.github/workflows/release.yml` SHA-validation step — copy `.github/workflows/rebase-upstream.yml`

**Analog:** `rebase-upstream.yml` lines 22–34 (explicit `tag` input with no default + `workflow_call` mirror; comment lines 1–5 stating the file carries no tag):
```yaml
on:
  workflow_dispatch:
    inputs:
      tag:
        description: "Upstream Firefox-ESR tag to rebase onto"
        required: true
        type: string
```
→ `release.yml` gains `merge_sha` (required string) the same way, if Phase 49's landed file lacks it. No default; the train passes the bump-PR merge SHA.

**`env:`-passed values, never inline `${{ }}`** (lines 128–131):
```yaml
      - name: Rebase onto requested tag
        env:
          REBASE_TAG: ${{ inputs.tag }}
        run: nix develop .#theia --command bash scripts/rebase-upstream.sh --tag "$REBASE_TAG"
```
→ SHA step (RESEARCH §Pattern 2, copy-pasteable):
```yaml
      - name: Validate the dispatched SHA
        env:
          MERGE_SHA: ${{ inputs.merge_sha }}
        run: |
          set -eu
          TIP=$(git rev-parse main)
          if [ "$MERGE_SHA" = "$TIP" ]; then exit 0; fi
          git merge-base --is-ancestor "$MERGE_SHA" main || {
            echo "release.yml: FAIL -- dispatched SHA $MERGE_SHA is neither main tip ($TIP) nor an ancestor. Next step: dispatch the merge SHA of a merged bump PR." >&2
            exit 1
          }
          git diff-tree --no-commit-id --name-only -r "$MERGE_SHA" | grep -qx 'configuration.toml' || {
            echo "release.yml: FAIL -- dispatched ancestor $MERGE_SHA does not itself change configuration.toml. Next step: dispatch a SHA whose own commit changes configuration.toml." >&2
            exit 1
          }
          # 41-RESEARCH Pitfall 2 conjunct: bot App (no Workflows) cannot create the Release
          # when the target diverges in .github/workflows/.
          if [ -n "$(git diff "$MERGE_SHA" main -- .github/workflows/)" ]; then
            echo "release.yml: FAIL -- $MERGE_SHA diverges from main in .github/workflows/; the bot App token cannot publish from it. Next step: rebase the bump onto the tip." >&2
            exit 1
          fi
```
Load-bearing semantics (RESEARCH §Pattern 2): tip passes on one string compare; ancestor passes only when its own commit touches `configuration.toml` (own-diff, not range-diff); workflows-tree identity required; failure exits 1 red (never 0-skip) naming SHA + tip + next step; no secret, no `environment:` on the legion job. Placement: first `run:` step of `build-linux` (and every legion job per SEC-10), after checkout with `fetch-depth: 0` (`verify.yml:46` precedent for the same reason).

### `.github/workflows/release-train.yml` dispatch + report — copy `notify-drill.yml` + `verify-workflows.mjs` GOOD_RELEASE

**Analog (wait shape):** `notify-drill.yml` lines 17–25 — minimal `permissions: {}`, one job on `ubuntu-latest` waiting on `environment: release`:
```yaml
permissions: {}

jobs:
  pending-deployment:
    runs-on: ubuntu-latest
    environment: release
    timeout-minutes: 5
    steps:
      - run: echo "Deployment approval reached the reviewer."
```
→ AWAITING_APPROVAL / DESCRIPTOR_WAIT derivation reads exactly this mechanism from the outside (`pending_deployments` non-empty naming `release`/`descriptor`); the train never approximates it.

**Analog (dispatch shape):** RESEARCH §Pattern 1 dispatch block (SPEC text):
```
POST repos/{o}/{r}/actions/workflows/release.yml/dispatches
  { "ref": "main", "inputs": { "merge_sha": "<merge commit SHA>" } }
GET repos/{o}/{r}/actions/workflows/release.yml/runs?head_sha={mergeSHA}&event=workflow_dispatch
→ newest run with head_sha == mergeSHA → html_url
```
Token constraint (HIGH per RESEARCH §Summary fact 2): the bot App lacks Actions scope, so the `dispatch-release` job mints the clock App token (Actions read/write, GH-10) or uses `GITHUB_TOKEN` with `permissions: actions: write` — planner pins one down against the landed Phase 43 skeleton; the `workflows` row must admit whichever path is picked. Report renders `Release run: <html_url> (SHA <mergeSHA>)` by `head_sha` equality; if no run appears in the poll window, link the workflow page + SHA and stay BUILDING-waiting (never fabricate a run id).

**Analog (trust-boundary fixture):** `verify-workflows.mjs` GOOD_RELEASE (lines 390–419) — the in-file good `release.yml` (`build-linux` on legion with `contents: read` and no environment; `sign-publish` hosted with `environment: release` and the write trio). The SHA-step edit must keep this fixture green; the self-test gains plants only if the planner wants them (a `secrets.` reference in the validation step — though existing legion plants at lines 488–490 already cover the shape):
```js
['secrets.X in build-linux', edit(R, BUILD, `${BUILD}    env:\n      TOKEN: \${{ secrets.X }}\n`), rel(R), 'build-linux', 'legion', 'secrets.'],
['environment: in build-linux', edit(R, BUILD, `${BUILD}    environment: release\n`), rel(R), 'build-linux', 'legion', 'environment'],
```

**GH-15 report step** (RESEARCH §Pattern 4, SPEC text): edge-triggered on first PUBLISHED derivation per key; find by `GET search/issues` (0 or 1 expected; 2+ red naming duplicates — TRAIN-09 duplicate-plant treatment); zero → POST then pin; one → GET body, PATCH only on byte-differ, else no-op. Rendered bytes = header block (release key, merge SHA, date, source path) + `\n\n` + file bytes read at the **merge SHA** (not checkout tip). Pin via GraphQL `mutation { pinIssue(input: { issueId: "<node id>" }) { issue { id } } }` with the bot App token (max 3 pinned; record budget in RELEASING.md); fallback one owner click + record date/who. Permissions: report job already holds `issues: write` (admitted only on `release-train.yml` job `report` and `triage.yml` — `verify-workflows.mjs` lines 300–301); needs only `contents: read`, never `contents: write`.

### `powerbrowser-updates/.github/workflows/withdraw.yml` (NEW) — copy `rebase-upstream.yml` + `apply-repo-controls.mjs` token handling

**Shape** (RESEARCH §Code Examples, SPEC text): `workflow_dispatch` only with `{ tag, reason } (no mode input: withdraw is no-update only, owner ruling 2026-10-29)`, `permissions: contents: read`, hosted `ubuntu-latest`, `timeout-minutes: 15`, SHA-pinned `uses:` (40-hex, admitted), no cache, no `pull_request` trigger. `env:`-passed `TAG`/`REASON` + `GH_TOKEN: ${{ steps.app.outputs.token }}` (GH-12 event-text rule extended by inspection — the Phase 41 `workflows` row covers the product repo only).

**Token mint-just-before-use** — copy `apply-repo-controls.mjs` lines 37–44 + 66–81: `--yes` refuses when stdin is not a terminal (owner-terminal-only writes); `spawnSync('gh', ['api', '-X', method, '-H', API_VERSION_HEADER, path, '--input', '-'], ...)` with `r.status !== 0` → print stderr + next step. Withdraw equivalent: `actions/create-github-app-token` with App id + private key held as an **updates-repo secret**, `owner: DeBIOS-Foundation`, `repositories: powerbrowser-updates,powerbrowser`, `permission-contents: write`, minted in the commit step's immediate predecessor (1-hour expiry; SUMMARY Pitfall 5 — never mint before a 24h-spanning wait; this job is minutes long, one mint suffices).

**No-update bytes** (identical per BUILD_TARGET, target set derived from the Release's `release-manifest.json` / Phase 44 table — never a hand list):
```
<?xml version="1.0" encoding="UTF-8"?>
<updates></updates>
```
Commit `Withdraw <tag>: no-update descriptors (<reason>)`, push to updates `main`, re-read and set-compare. No R2 repoint mode (owner ruling 2026-10-29: withdraw is no-update only).

**Channel-live rerun + marking** (RESEARCH §Pattern 3): rerun in the mode matching `mode` (`--withdrawn <tag>` expectation flip — expect-empty, not expect-release; running the unmodified gate and expecting green is a contradiction per Summary fact 3). Mark: PATCH `prerelease:true` + append notes block iff the RELEASING.md probe verdict allows, else notes-only append. **Never `DELETE` the Release or the tag** (immutable releases burn the tag name forever).

### `scripts/verify-mar-update-hop.mjs` `served: release` mode — copy itself

**Exports to reuse (not duplicate):** `buildUpdateXml` (lines 114–122, the single source — deterministic, no timestamps/nonces), `parseUpdateXml` (125–150), `siftResolverHosts` (158–165, anchored `Resolving host [...]` only):
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
export function siftResolverHosts(logText) {
    const out = [];
    for (const line of logText.split('\n')) {
        const m = line.match(/Resolving host \[([^\]]+)\]/);
        if (m) out.push(m[1]);
    }
    return [...new Set(out)];
}
```
Import guard (lines 504–513) lets `build-update-xml.mjs` import `buildUpdateXml` without running the gate — keep it; Phase 44's builder stays the single source and the hop's hand-edit detector (served bytes byte-identical to a fresh emission, lines 275–292) adapts to whatever the landed builder emits.

**Evidence-half blocks to branch on `served`:** missing-evidence FAIL (227–235, never SKIP-green); required-keys loop (244–247); loopback distinct-versions rule (252–261) **replaced** in release mode by distinct-buildID + not-older-appVersion (same-appVersion is the ratified scheme; `updateIsAtLeastAsOldAs` refuses only equal-version + matching-buildID — RESEARCH Pitfall 6); idempotency + byte-identity (275–292); hash/size/version/post-hop eq set (298–306); access-log fork proof (311–314, loopback only — `release` **never demands an access log**: Pages + GitHub asset hosts produce none); resolver sift + capture-broken detectors (322–334, kept in both modes).

**Release assertion set** (RESEARCH §Pattern 5, six properties, each naming file + values): hosts (`updates.powerbrowser.org` + `downloads.powerbrowser.org` present; `github.com` and `release-assets.githubusercontent.com` absent; zero `*.mozilla.org`/`*.mozilla.net`); hash (`sha512` + size recomputed via `marDigest`, lines 95–100); version (distinct buildIDs, appVersion not older); signature (`signmar -v` against tracked DERs derived from `brand/` + `patches/030-*` at check time); allowed channels (MAR product-info channel ∈ `ACCEPTED_MAR_CHANNEL_IDS`, ids from `updateChannel(config)`); attestation (`gh attestation verify [--bundle]`, offline bundle form preferred inside the credential-free container — RESEARCH Alternative Considered). Absent/unknown `served` fails naming the key rather than defaulting. Minimal release `hop.json` shape: RESEARCH §Code Examples (same-appVersion/distinct-buildID, baked 11-segment `servedUrl`, immutable `/releases/download/<tag>/` `servedMarUrl` — latest-download form goes red).

**Self-test pattern** (lines 344–409): `mirror()` builds the mock proof in `mkdtemp` (manifest copied from `REPO_ROOT`, `randomBytes` MAR, `buildUpdateXml` emission, `hop.json`, resolver + access logs); `expectRed(label, mutate, needleFile, needleValue)` re-mirrors, mutates, requires red naming file + value; control green first (401–409) or the plants prove nothing:
```js
const dir = mkdtempSync(join(tmpdir(), 'verify-mar-update-hop-selftest-'));
...
const expectRed = (label, mutate, needleFile, needleValue) => {
    mirror();
    mutate();
    const res = runChecks(dir);
    const msg = res.failures.find(f => f.includes(needleFile) && f.includes(needleValue));
    ...
};
```
Minimum 11 new plants (RESEARCH §Pattern 5): unsigned MAR; wrong-channel MAR; tampered byte (hash mismatch); `http://` patch URL; resolver log missing the MAR host; same-buildID hop; Mozilla host (`aus5.mozilla.org`); attestation failure (tampered MAR or wrong `--repo`); latest-download patch URL; descriptor not byte-identical to fresh emission. Same registry row (`mar-update-hop-self-test`, quick-honest: `node:crypto` + loopback + mkdtemp, no build/browser/network); the live drill is full-tier (`--only mar-update-hop` against `.mozbuild/mar-hop/` with `served: release`, run from a clean non-Nix Debian-bookworm container on legion per the RESEARCH procedure — no Nix mount, fresh profile, evidence to `/out`).

### `scripts/verify-release-identity.mjs` — the mkdtemp-git-fixture + derive-and-compare precedent

**Injectable `runChecks`** (lines 83–94): `overrides.git` / `overrides.read` / `overrides.files` (`git ls-files`, never a hand list); identity derived via `releaseIdentity(config)` (97–103, same resolver as the generator so gates cannot disagree — RESEARCH §Don't Hand-Roll).

**mkdtemp git self-test** (lines 200–228): hermetic `git init` + commits with `-c user.name/self-test` isolation, manifest copied (values derived, never typed — line 212–215), baseline green first (223–228, "already red ... would mean nothing"):
```js
const tmp = mkdtempSync(join(tmpdir(), 'release-identity-'));
const env = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };
const g = (...a) => execFileSync('git', ['-C', tmp, '-c', 'user.name=self-test', ...], { encoding: 'utf8', env, ... });
put(MANIFEST_REL, readFileSync(join(REPO_ROOT, MANIFEST_REL), 'utf8'));
const { esrVersion, revision, releaseKey } = releaseIdentity(config);
```
**Plant/undo table + leak check** (lines 236–316): `cases = [{ name, expect, plant, undo }]` with neighbour values derived from real values (`neighborTag`, never a literal); each plant red naming the file/tag, each control green; output asserted free of checkout paths (`text.includes(REPO_ROOT) || text.includes(tmp)` → FAIL). → SHA-step plants (non-tip SHA, non-manifest ancestor, workflows-divergent ancestor, `secrets.` in step) and train-state fixtures copy this table shape; neighbour-version derivation avoids tripping `scan-brand-residue.mjs`.

### `docs/RELEASING.md` — release-procedure text locations

Existing sections the phase extends (line refs): architecture in one paragraph (43–77: tag creation by `sign-publish` with bot App token, legion `build-linux` posture, draft-carrying-all-assets then publish, Pages `_redirects` eleven-segment rule, immutable asset URLs, final `channel-live`); per-release approval steps (624–694: steps 2–8 — quick tag row, tag creation, `build-linux` watch, `release` approval reviewing artifact list + descriptor diff, Release + descriptor confirmation, `channel-live` row, hop drill with `served: "release"` + release assertion set at 684–692). Lands here: REL-02 probe verdict (date, tag, which branch stuck, exact 422/403 text — the withdraw job reads this as configuration), withdraw runbook (expected post-withdraw gate output verbatim per Pitfall 2), hop record (which attestation path was taken), GH-15 pin link + 1-of-3 pin budget, and the criterion-5 observation values (layer-3 asset hosts + sweep runner-online/channel-liveness/download-count at the first public release).

Release-key and channel derivation reused by the SHA check and drill: `releaseIdentity()` / `UPDATE_CHANNEL` / `updateChannel(config)` from `scripts/generate.mjs` (REL-01/UPD-11) — never ad-hoc tag parsing or channel literals in new code.

### `scripts/verify-platform.sh` registry rows

**Row format + tier comments** (quick pair 4658–4663; full/half split):
```sh
    # NEW (Phase 40, REL-01): the release key v<ESR>-<revision> derived by releaseIdentity()
    # agrees with both version files, ... Honestly --quick: git plumbing and text
    # reads only, no build, browser, display or network.
    "release-identity|node $REPO_ROOT/scripts/verify-release-identity.mjs"
    # release-identity-self-test plants seven faults in one mkdtemp git repo (...) and keeps five
    # controls green, among them ...; it writes nothing in the repository.
    "release-identity-self-test|node $REPO_ROOT/scripts/verify-release-identity.mjs --self-test"
```
Quick array opens at 3573 (`local -a CHECKS=(`); full block opens at 4733 (`if [ "$QUICK" -eq 0 ]; then CHECKS+=(`). Full-tier hop row at 4830 (`mar-update-hop`, re-verifies `.mozbuild/mar-hop/` evidence, FAILS when absent — 4450–4469 comment); self-test twin rides alongside at 4469 (control green first, plants red naming file + values). Live `repo-controls` full row at 5092 (network + `gh` auth); its self-test is quick at 4706–4711 (in-memory, no network/gh).

Phase 50 rule (RESEARCH §Validation Architecture): extended rows keep their names — `release-train-logic-self-test` gains 8 fixtures (no new row), `mar-update-hop-self-test` gains 11 plants (no new row). Any genuinely new gate (e.g. a withdraw-shape check, if the planner adds one) is one appended row with its `--self-test`, quick rows before the `)` at 4731, full rows inside the `CHECKS+=` block, tagged `# NEW (Phase 50, REQ-ID): ...` with an honestly-`--quick` or full-tier why-comment.

**Coverage-matrix form** (for the criterion-5 observation record): copy `.planning/workstreams/deploy/phases/41-repository-controls-and-github-apps-a/COVERAGE.md` — `| capability | decision | reason |` with INTEGRATE vs OPT-OUT rows, each opt-out reasoned. Here the "matrix" is the release record: which sweep rows were observed (not built), their live values, and the two asset hosts at layer 3 — no new rows built here.

### `configuration.toml` derivation points

```toml
[product]
revision = 1   # lines 31-38: release key is v<ESR>-<revision>; reset on ESR move, bump out-of-band
[urls]
update = "https://updates.powerbrowser.org/update.xml"              # line 92: baked as MOZ_APPUPDATE_HOST
release_notes = "https://github.com/DeBIOS-Foundation/powerbrowser/releases"  # line 93: owner/repo source
homepage = "https://powerbrowser.org"                               # line 94
[upstreams]
firefox_esr_tag = "FIREFOX_153_5_1esr_RELEASE"  # line 125: the one ESR pin
theia_release = "1.76.0"                        # line 126
```
New scripts derive owner/repo (`repoSlug`), release key (`releaseIdentity`), and channel (`updateChannel`) from these — never literals.

## Shared Patterns

- **Message format:** `<name>: PASS|FAIL|SKIP -- <plain statement>`; every failure ends `Next step: ...`; exit 0/1, 2 for bad args (`verify-mar-update-hop.mjs` 67–72, `verify-release-identity.mjs` 60–66, `verify-workflows.mjs` 79–86, SHA step echoes).
- **Derive, never hand-keep:** states from the table, BUILD_TARGETs from the manifest/builder, assets from the Release + manifest, expectations from `configuration.toml` + `git ls-files`; set equality catches addition *and* removal.
- **Self-test:** green baseline first, in-memory or mkdtemp plants, red must name the file/field/value, unplanted controls stay green; neighbour values derived from real values, never literals.
- **Fail closed:** unreadable endpoint/file, missing instrument, truncated list, absent evidence = FAIL naming the cause; zero subjects = distinct FAIL (vacuity), never green.
- **One of each:** one state table, one descriptor builder (`buildUpdateXml`), one hop script (`served` selector), one withdraw workflow (in `powerbrowser-updates`). Phase 50 extends; it creates no second skeleton.
- **Tokens:** `gh` holds the credential; our code takes tokens only as `GITHUB_TOKEN` or a just-minted App token (`actions/create-github-app-token`, mint-just-before-use, per-step `permission-*`, 1-hour expiry); no secret or `environment:` on any legion job; no `github.event.*` text inside `run:`/`prompt:` (pass through `env:`/`inputs:`).
- **Stage new files** before trusting `scan-brand-residue.mjs` (`git ls-files` based); fixtures must not spell brand tokens.
- **User-facing vs operator surface:** the pinned KNOWN-ISSUES body names "PowerBrowser" in plain language with on-screen next steps, no SHAs/run ids/prefs/exceptions (identifiers live in the tracking issue).

## No Analog Found

| File | Role | Reason |
|---|---|---|
| `docs/KNOWN-ISSUES.md` content + pinned-issue create/PATCH/pin flow | doc + report-job step | file absent (Phase 42 creates it); pinning is GraphQL `pinIssue` (no REST endpoint) — use RESEARCH §Pattern 4; fallback one owner click |
| `powerbrowser-updates` repo layout (`<channel>/<BUILD_TARGET>/update.xml`, `_redirects`, Pages) | static host | repo 404 today (Phase 47 creates it) — use RESEARCH §§Pattern 1/3 + assumptions A9 |
| `gh api` pending-deployments waiting-run shape | fact input | only the completed-run `[]` was probed live; waiting shape `[ {environment:{name}} ]` is [ASSUMED] — executor probes on the first real waiting run |
| Immutable-release flag-vs-notes branch | withdraw marking | needs the owner probe before the first public release — use RESEARCH §Pattern 3 probe procedure |

## Metadata

**Analog search scope:** scripts/, .github/workflows/, docs/, configuration.toml, .planning/workstreams/deploy/phases/41-repository-controls-and-github-apps-a/
**Files scanned:** 18
**Pattern extraction date:** 2026-10-23

## PATTERN MAPPING COMPLETE
