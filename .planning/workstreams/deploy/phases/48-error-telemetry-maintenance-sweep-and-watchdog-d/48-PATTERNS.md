# Phase 48: Error telemetry, maintenance sweep and watchdog (D) - Pattern Map

**Mapped:** 2026-10-23
**Files analyzed:** 19
**Analogs found:** 16 / 19

All analog paths below are git-tracked source, verified this session with
`git ls-files -- <path>` (non-empty = tracked). Absent/new paths are marked
NEW or assumed. `generated/theia-telemetry.json` is git-ignored
(`.gitignore:49: /generated/`) and is never an analog — the emitter
(`scripts/generate.mjs`) is. `ledger/` and `scripts/verify-ng-NNN-*.mjs`
were not read, written, or emitted as analogs.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `theia/extensions/telemetry/src/browser/telemetry-enrichment.ts` (NEW) | service (pure derivation module) | transform (build/version/OS → admitted set) | `theia/extensions/telemetry/src/browser/telemetry-error-report.ts` | role-match |
| `theia/extensions/telemetry/src/browser/telemetry-error-report.ts` (MOD: gains version/buildID/OS) | service | transform (window event → sanitised report) | itself | exact |
| `theia/extensions/telemetry/src/browser/telemetry-error-capture.ts` (MOD: wiring only) | component (`FrontendApplicationContribution`) | event-driven (window listeners → reporter) | itself | exact |
| `theia/extensions/telemetry/src/browser/telemetry-sender.ts` (MOD: fixed event names) | service (batching sender) | batch/streaming (queue + size/interval flush + retry) | itself | exact |
| `theia/extensions/telemetry/src/browser/telemetry-preferences.ts` (MOD: exact TEL-06 string) | config (preference schema) | — (declaration) | itself | exact |
| `theia/applications/browser/package.json` (MOD: surgical `powerbrowserTelemetry` block) | config | — | itself, lines 15-18 | exact |
| `configuration.toml` (MOD: states `telemetry.endpoint`) | config | — | itself, `[telemetry]` lines 104-105 | exact |
| `scripts/generate.mjs` (MOD: fragment keys if needed) | utility/generator | transform (manifest → emitters) | itself: `emitTheiaTelemetry` lines 2086-2107; `mozillaEndpointPrefs` lines 2638-2655; `manifestEndpointSources` lines 2695-2719; `TARGETS` rows lines 3627-3654 | exact |
| `powerbrowser/endpoint-allowlist.json` (MOD: events host row) | config | declared state | itself + `scripts/verify-theia-endpoints.mjs` | exact |
| `worker/events-worker.mjs` (NEW) | route/service (fetch handler) | request-response (validate → D1 write) | `scripts/crash-collector.mjs` | exact |
| `worker/wrangler.toml` (NEW) | config | — | none | no analog |
| `scripts/verify-events-worker.mjs` (NEW) | test/gate | derive-and-compare + in-process contract | `scripts/verify-crash-collector.mjs` | exact |
| `scripts/verify-telemetry.mjs` (EXTEND: admitted set, exact description, enrichment bound) | test/gate | derive-and-compare (manifest → fragment → block) + in-memory/mkdtemp | itself | exact |
| `scripts/verify-telemetry-live-delivery.mjs` (NEW) | test/gate | request-response (loopback drill) + pure analyzer | `scripts/verify-telemetry.mjs` (NG-067 case) + `theia/extensions/telemetry/test/telemetry-sender.test.mjs` | role-match |
| `scripts/release-train.mjs` (EXTEND, Phase 43 file — ABSENT, assumed per A48-1) | utility | transform (`derive`/`next`/`render`) | assumed Phase 43 contract; in-tree pure-emitter idiom `scripts/generate.mjs` | assumed (no analog) |
| `.github/workflows/release-train.yml` (EXTEND, Phase 43 file — ABSENT, assumed per A48-1) | config/CI | — | `.github/workflows/verify.yml` + `.github/workflows/notify-drill.yml` shape; rules in `scripts/verify-workflows.mjs` | partial (assumed file) |
| watchdog workflow source (NEW, built here, applied in `powerbrowser-updates`) | config/CI | request-response (read-only `gh api`) + scheduled trigger | `.github/workflows/notify-drill.yml` | partial |
| `docs/RENEWALS.md` rows + `docs/PRIVACY.md` handoff strings (files ABSENT, owned Phases 42/47) | docs | — | none (voice guidance only: `docs/RELEASING.md`, `docs/CRASH-POLICY.md`) | no analog |
| `scripts/verify-platform.sh` (MOD: new registry rows) | config/registry | — | itself: telemetry rows lines 4372-4373; endpoints rows lines 4433-4434; workflows/zizmor rows lines 4716-4730; crash-collector rows lines 4516-4517 | exact |

Note: `scripts/release-train.mjs` and `.github/workflows/release-train.yml`
do not exist in the tree (verified `ls` + `git ls-files` empty this session).
Plans pin the assumed Phase 43 names (`derive`/`next`/`render`, `--self-test`,
`maintenance` + `report` jobs) and re-verify at plan time.

## Pattern Assignments

### Theia producer group — `telemetry-enrichment.ts` (NEW) + reporter/sender/capture/preferences (MOD)

**Analog:** `theia/extensions/telemetry/src/browser/telemetry-error-report.ts`
(tracked; 101 lines, read this session).

**Zero-dependency header shape** (lines 1-16) — copy for the enrichment module:
```ts
// NG-067 error reports. DELIBERATELY ZERO-DEPENDENCY, like the sender: this file imports
// nothing, so the telemetry self-test (scripts/verify-telemetry.mjs --self-test) imports it
// straight from src/ under plain node. Erasable syntax only.
```
The sender carries the same rule (`telemetry-sender.ts` lines 3-9: "imports
nothing, so the unit suite imports it straight from src/ under plain node with
no build, no browser and no install"). The enrichment module must be
importable under plain node for the same reason; erasable syntax only.

**Sanitiser-guard shape** (`telemetry-error-report.ts` lines 34-38) — the
admitted-set precedent the enrichment extends:
```ts
// A runtime-assigned constructor name could carry any text; an identifier cannot carry a path.
const IDENTIFIER = /^[A-Za-z_$][\w$]{0,63}$/;
// Only a script loaded from a URL has a file name; a data: or eval source's last segment is code.
const SCRIPT_URL = /^(https?|file):\/\//i;
const FILE_NAME = /^[\w.-]{1,100}$/;
```
Guards in `typeOf`/`baseName` (lines 48-63) sanitise to `'unknown'`/`undefined`,
never throw. Enrichment adds `version`/`buildID`/`os` accessors in this file's
style: fail-closed, guarded reads only.

**Fixed event names** (lines 18-19) — the wire names the sender amendment keeps:
```ts
export const UNCAUGHT_ERROR_EVENT = 'frontend.uncaught-error';
export const UNHANDLED_REJECTION_EVENT = 'frontend.unhandled-rejection';
```
Reporter payload stays `{type, source, line, column}`
(lines 27-32); `onError`/`onRejection` shape (lines 78-89); dedupe
`report()` (lines 91-100) never throws out of a listener.

**Sender call site to amend** (`telemetry-sender.ts` lines 145-154):
```ts
/** Error path: admitted at every level but `off`. Never throws. */
sendErrorData(error: Error | string, data?: Record<string, any>): void {
    try {
        const name = typeof error === 'string' ? error : (error && error.message) || String(error);
        this.enqueue('error', name, data);
```
Plan change: error-hook call sites pass the fixed constants above as the event
name and put `typeOf(value)` in `data.type` — the `error.message` expression
never reaches the wire. Keep the envelope `{kind, name, data, at}` (lines
31-37), the per-event live level read (`off` drops before queueing, lines
186-195), and the batch body `JSON.stringify({ events: current.payload })`
(lines 215-219).

**Never-enriches paragraph** (`telemetry-sender.ts` lines 19-24) — amend, do
not delete:
```
// Never enriches: event name plus caller-supplied data only, no stack
// (stacks carry file paths), no common properties. The at timestamp is
// transport metadata, not enrichment.
```

**Wiring only** (`telemetry-error-capture.ts` lines 18-22):
```ts
onStart(): void {
    this.reporter = new ErrorReporter(this.logger);
    window.addEventListener('error', this.reporter.onError);
    window.addEventListener('unhandledrejection', this.reporter.onRejection);
}
```
The MOD passes enrichment into `report()` here; no message/stack is added.

**Exact preference string** (`telemetry-preferences.ts` line 44) — replace
verbatim, never paraphrase:
```ts
description: 'How much usage and error telemetry PowerBrowser sends to the configured endpoint.',
```
becomes the TEL-06 3-sentence string (REQUIREMENTS.md:192). Keep the
`initSchema` microtask composition shape (lines 64-74: `await Promise.resolve()`
so PowerBrowser text wins in any module order) and the fail-closed fragment
read in `telemetry-frontend-module.ts` lines 37-46.

---

### Manifest / fragment / block / allowlist group — `configuration.toml` + `scripts/generate.mjs` + app `package.json` + `endpoint-allowlist.json`

**Analog:** `scripts/generate.mjs` emission trio + `scripts/verify-theia-endpoints.mjs`
(both tracked).

**Emitter** (`scripts/generate.mjs` lines 2086-2107):
```ts
export function emitTheiaTelemetry(config, variant) {
    void variant;
    const rawLevel = config.telemetry?.level;
    const level = isUnset(rawLevel) ? 'off' : rawLevel;
    ...
    const rawEndpoint = config.telemetry?.endpoint;
    const endpoint = isUnset(rawEndpoint) ? null : rawEndpoint;
```
Phase 48 states the endpoint while keeping level off. **Level-off blank
server** (lines 2647-2648) is kept:
```ts
const rawEndpoint = config.telemetry?.endpoint;
const server = (level === 'off' || isUnset(rawEndpoint)) ? '' : assertEmittable('telemetry.endpoint', rawEndpoint);
```
**Manifest endpoint source** (lines 2713-2717) already covers the new host —
no generator change needed for coverage:
```ts
take('telemetry.endpoint', config.telemetry?.endpoint);
for (const key of ['release_notes', 'update', 'crash_report', 'homepage', 'search']) {
    take(`urls.${key}`, config.urls?.[key]);
}
```
Fragment-row precedent (`TARGETS`, lines 3627-3631): the copy-over sets ONLY
the `powerbrowserTelemetry` key; byte-identity skips rows without a tracked
path while `--check` still covers the row. Tracked block
(`theia/applications/browser/package.json` lines 15-18):
```json
"powerbrowserTelemetry": {
  "level": "off",
  "endpoint": null
},
```

**Allowlist row shape** (`powerbrowser/endpoint-allowlist.json`): copy the
loopback `allow` rationale (`lines 79-83`), not a `user-initiated` entry —
error reports at level `error` fire with no per-event click, so the events
host is `allow` with `manifest: telemetry.endpoint` and a hand-authored
reason. Disposition rule (`scripts/lib/endpoint-verdict.mjs` lines 12, 22-30):
```ts
export const DISPOSITIONS = Object.freeze(['allow', 'deny', 'user-initiated']);
```
`user-initiated` without a user action fails exactly like `deny`.

**Gate checks to extend** (`scripts/verify-theia-endpoints.mjs` lines 141-179):
every derived host PRESENT naming the host (lines 141-146); stale `manifest`
marks fail naming the entry (lines 151-163); driven pref `expect`s agree naming
the pref (lines 168-179). `verify-telemetry.mjs` fragment-vs-emission
(lines 101-127) and block-vs-emission (lines 142-147) comparisons stay the
pattern for any new fragment key (`version`/`buildID` per Open Q3):
```ts
failures.push(`${APP_PKG_REL}'s ${BLOCK_KEY} block is ${JSON.stringify(block)} but ${MANIFEST_REL} emits ${JSON.stringify(expected)} -- stale output. Next step: copy the block from ${FRAGMENT_REL} (that key only; leave every sibling key byte-identical), then re-run this check.`);
```

---

### Worker group — `worker/events-worker.mjs` (NEW) + `worker/wrangler.toml` (NEW) + `scripts/verify-events-worker.mjs` (NEW)

**Analog:** `scripts/crash-collector.mjs` + `scripts/verify-crash-collector.mjs`
(both tracked; 431 + 484 lines).

**Contract-constants header** (`scripts/crash-collector.mjs` lines 47-93) —
the Worker mirrors this shape (literals ARE the contract; the privacy doc
states them in prose; the gate pins both sides):
```ts
/** The only path that accepts submits. Everything else is 404. */
export const SUBMIT_PATH = '/submit';
...
export const REASON_OVERSIZED = 'oversized_body';
export const THROTTLE_RULE = 'throttled_per_minute_cap';
...
export const MAX_PARTS = 16;
...
/** Bounded retention: records older than this are deleted on each accept. */
export const RETENTION_DAYS = 30;
```
MiB-denominated cap literals (lines 71-75) so code and doc cannot drift
numerically; annotation allowlist frozen (lines 79-87).

**Pure verdict surface** (lines 98-106, 247-316): pure functions
(`parseMultipart`, `buildCrashIdResponse`, `buildDiscardResponse`,
`handleSubmit`) run with no sockets; the HTTP layer (lines 321-373) is a thin
wrapper. The events Worker exports its `fetch` handler the same way —
importable under plain node — with the contract order validate → throttle →
allowlist → store → sweep → respond, vocabulary 400/413/200-discard, server
`received_at`, no client-supplied identifier, no credential in code
(shape-tested like the S8 credentiallessness assertion).

**Import guard** (lines 394-400) — copy so importing never binds/serves:
```ts
const INVOKED_DIRECTLY = (() => {
    try {
        return process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
    } catch {
        return false;
    }
})();
```

**Gate shape** (`scripts/verify-crash-collector.mjs`): header stating all
expectations derived from the module's own exports (lines 7-24); arg guard
(lines 72-79: unknown arg → `FAIL`, exit 2); makeReporter accumulating
failures (lines 87-101); `runChecks` deriving literals from the doc and
comparing equality (lines 103-150); `main` with `PASS`/`FAIL` (lines 152-160);
`--self-test` building fixtures in `mkdtempSync(join(tmpdir(), ...))`
(line 195), **green control first** (lines 223-267: well-formed input answers
`CrashID=` plus a matching store record with the allowlist enforced —
"Without this, a red after a plant below could be fixture-shaped rather than
plant-caused"), then one plant per contract direction each required to go red
naming its rule with the store proven empty after every rejection
(`storeIsEmpty`, lines 199-217; plants lines 269-470).

**Policy-vocabulary precedent** (`docs/CRASH-POLICY.md` lines 46-73, tracked):
retention "**30 days**" then deleted; the 400/413/200/500 table. The Worker
header + privacy strings reuse this voice so no two sources state different
numbers — the gate derives both sides.

`worker/wrangler.toml` has no analog (no deploy descriptor exists in the
tree): D1 binding, events route, compatibility date, no secret, runbook in
comments (pinned wrangler version, `d1 create`, `d1 execute --file`, deploy,
rule record, synthetic POST verify). `wrangler` never enters a flake shell.

---

### Telemetry gates — `scripts/verify-telemetry.mjs` (EXTEND) + `scripts/verify-telemetry-live-delivery.mjs` (NEW)

**Analog:** `scripts/verify-telemetry.mjs` itself (tracked; 343 lines).

**Header + arg guard** (lines 1-61): numbered derivation list, `--quick`
honesty paragraph (lines 27-29), usage, self-test plant list (lines 35-41);
strict args (lines 54-61: unknown argument → `FAIL`, exit 2).

**Derive-and-compare core** (`runPinChecks`, lines 80-150): resolve the
manifest, emit the expectation in memory (`emitTheiaTelemetry`), compare the
fragment both directions (lines 113-125), compare the tracked block
(lines 142-147). Absent-fragment SKIP (lines 103-104: generated/ is
git-ignored, "a gate red on it would be a gate its readers skip"). Add: the
enrichment key set ⊆ admitted set assertion, the exact-description
byte-equality assertion, the level-off blank-server assertion.

**Build + suite halves** (`runChild`/`runBuildChecks`, lines 152-181): tsc
fail-closed SKIP when the theia install is absent (lines 163-164); suite runs
on bare node (lines 175-178).

**Self-test shape** (lines 202-337): unmutated control green first in both
halves (lines 210-221); always-send stub plant must go red **on the off
assertion** (lines 225-234); drifted-block / drifted-fragment plants in
`mkdtempSync(join(tmpdir(), 'telemetry-selftest-'))` each red naming the drift
(lines 236-262); NG-067 error-reporter case driving the real sender with a
stub fetch (lines 268-278), hostile events that must not throw (lines 297-304),
repeat-sent-once (line 315), and the tripwire (line 318):
```ts
if (/message|stack|Unable|self-test|notes|\//.test(text)) problems.push(`the sent bodies carry message text, a stack or a path: ${text}`);
```
plus the M-3 guards (lines 319-324: path-carrying constructor name →
`'unknown'`; non-finite positions omitted).

**Live-delivery gate** (NEW): copy this file's structure — header with the
corrected payload `{type, basename, line, column, version, buildID, OS}` and
the same-run negative half (level off → zero requests only beside the positive
half that proves the emitter fires); `main` drives the loopback drill
(S8 drill shape per RESEARCH Pattern 2); a pure analyzer function over the
captured list carries the quick-tier `--self-test` (missing POST, stack
plant, unadmitted-key plant, full-path plant, empty capture — each red naming
the drift, control green first). Discrimination precedent:
`theia/extensions/telemetry/test/telemetry-sender.test.mjs` lines 8-15
(always-send stub must go red on the off assertion; the same-run on-level
control send means a zero-call pass can never be a silent stub) and
`AlwaysSendStub` lines 26-35.

---

### Sweep group — `scripts/release-train.mjs` + `.github/workflows/release-train.yml` (both EXTEND, assumed)

**Status:** files absent (verified this session); assumed per A48-1.
**Analog (workflow shape):** `.github/workflows/verify.yml` +
`.github/workflows/notify-drill.yml` (both tracked). **Analog (rules):**
`scripts/verify-workflows.mjs` (tracked; 545 lines).

**Minimal workflow shape** (`notify-drill.yml` lines 12-25):
```yaml
name: Notification drill
on:
  workflow_dispatch:
permissions: {}
jobs:
  pending-deployment:
    runs-on: ubuntu-latest
    environment: release
    timeout-minutes: 5
    steps:
      - run: echo "Deployment approval reached the reviewer."
```
The sweep's `maintenance` + `report` jobs follow this plus the trust rules.

**Trust rules the sweep edits must keep** (`verify-workflows.mjs`):
`RULES` list (line 96: `uses-pinned`, `uses-admitted`, `admission-used`,
`no-schedule`, `runner`, `legion`, `claude-code-action`, `issues-write`,
`workflow-run-guard`, `workflow-run-chain`, `write-trio`, `no-pr-trigger`,
`no-cache`, `event-text`); `no-schedule` (lines 25-26: no workflow has a
schedule event); `issues-write` confined to the train `report` job + triage
(lines 300-301); guarded `workflow_run` (lines 307-311); no event text in
`run:`/`with.prompt:` (lines 321-327); sorted deterministic failure output
(lines 343-348); self-test baseline-green-first with anchored SHA plants over
a good `release.yml` fixture (lines 366-409).

**Logic shape** (`release-train.mjs`): pure `derive`/`next`/`render` +
`--self-test` per the assumed Phase 43 contract. In-tree pure-function
precedent: `scripts/generate.mjs` emitters (`emitTheiaTelemetry`,
`releaseIdentity` lines 2796-2808) — no I/O inside derivation; GitHub facts
in, render out; the pinned issue body is `render(state)` output, never read
back as state; PATCH only on byte diff; comment only on transition into red
(self-test: one red-row plant → exactly one comment; staying-red re-run →
zero new comments). No-analog note: the file itself is absent, so its
derivation idiom comes from RESEARCH Pattern 6 + ARCHITECTURE §4.4, not from
the tree.

---

### Watchdog group — watchdog workflow source (NEW, applied in `powerbrowser-updates`)

**Analog:** `.github/workflows/notify-drill.yml` (tracked; minimal,
read-only-token shape) + `scripts/verify-workflows.mjs` rules.

Copy the drill's posture: `ubuntu-latest`, least-privilege `permissions:`,
one job, no secret, no action, no self-hosted runner. Differences (D-77
corollary): the watchdog carries the one `schedule:` the product repo forbids
(e.g. `cron: '17 6 * * *'` — plan fixes the minute), and it lives + runs in
`powerbrowser-updates`, so the product `workflows` row stays green. Mirror the
trust boundary anyway (SHA-pinned `uses:`, no event text in `run:`, guarded
reads) so no later audit faults it. Fixture self-test (in-memory run-table):
25 h → no issue; 27 h → one issue in its own repo with the run link; plus a
product-repo assertion that no `schedule:` was added (`workflows` row stays
green). Live 26-h drill is an owner action. The 60-day-disable question stays
a recorded probe (Open Q1), never a silent assumption.

---

### Docs rows — `docs/RENEWALS.md` + `docs/PRIVACY.md` handoff

No file analog (both files absent; owned by Phases 42/47). Voice guidance
only: `docs/RELEASING.md` lines 1-39 status preamble (written-ahead-of-the-stage
convention — name pending values as pending, never guess); `docs/CRASH-POLICY.md`
retention/vocabulary voice (lines 46-73). Phase 48 adds two RENEWALS rows
(`bot`-env shared secret, Worker secret) and hands Phase 47 the exact
payload/retention/processor/hosts/privacy@/postal strings; the gates derive
caps/retention from both code and privacy source so stale either side goes red.

---

### Registry rows — `scripts/verify-platform.sh` (MOD)

**Analog:** its own Phase 40/41 rows (tracked). Copy shapes exactly:

Telemetry pair (lines 4361-4373): `# NEW (Phase 48, TEL-06): <what it proves>. Honestly --quick: <why no build/browser/display/network>.` then the row plus
the self-test row with its plant list. Endpoints pair (lines 4404-4434):
same comment shape. Workflows/zizmor pairs (lines 4712-4730): same shape.
Crash-collector pair (lines 4505-4517) is the registration precedent for the
new `events-worker` / `events-worker-self-test` rows. Quick-tier honesty rule:
a row is `--quick` only with no build, browser, display, or network; full-tier
rows (`tel06-error-delivery-live`, live sweep render, 26-h drill) carry a
"Full tier: <why>" comment and run after the owner checkpoint.

## Shared Patterns

- **Message format:** `<name>: PASS -- <plain statement>` /
  `<name>: FAIL -- <N> problem(s)` with one `  - <failure>` per line /
  `<name>: SKIP -- <reason>`; exit 0/1, 2 for bad args
  (`verify-telemetry.mjs` lines 54-61, 183-194; `verify-crash-collector.mjs`
  lines 72-79; `verify-workflows.mjs` lines 79-86; `verify-zizmor.mjs` lines
  31-38). Every failure ends with `Next step: ...` (e.g. `verify-release-identity.mjs`
  lines 109-179; `verify-workflows.mjs` lines 280-327; `verify-theia-endpoints.mjs`
  lines 141-179).
- **Derive, never hand-keep:** expectations come from the manifest through
  `scripts/generate.mjs`'s own resolver/emitters and from `git ls-files`;
  compared as set equality in both directions so addition *and* removal go
  red (CLAUDE.md Verification rule 2). The Worker/crash-collector variant:
  derive from the module's own exports, never a kept copy
  (`verify-crash-collector.mjs` lines 103-150).
- **Self-test green-control-first:** unmutated control green, else the plants
  "would mean nothing" (`verify-telemetry.mjs` lines 210-221;
  `verify-crash-collector.mjs` lines 223-267; `verify-workflows.mjs` lines
  369-375). Plants in memory (`runChecks` overrides) or in
  `mkdtempSync(join(tmpdir(), ...))`; each must go red NAMING the file/value/rule;
  the store (or tree) must be empty/unwritten after every rejection path.
- **Stage before you scan:** `scan-brand-residue.mjs` iterates `git ls-files`
  — stage `worker/`, new scripts, and extension files before trusting a green
  scan; new self-test fixtures must not spell tag literals or brand tokens.
- **Registry honesty comments:** every row carries `# NEW (Phase 48, REQ-ID):`
  plus an "Honestly --quick: ..." or "Full tier: ..." justification
  (`verify-platform.sh` lines 4361-4371, 4404-4432, 4712-4730).
- **Quick-tier honesty rules:** no build/browser/display/network in `--quick`;
  absent git-ignored fragment SKIPs (generate-check's rule,
  `verify-telemetry.mjs` lines 103-104); absent theia install SKIPs tsc but
  never the dependency-free suite; missing instrument (`js-yaml`, `zizmor`,
  `gh` auth) FAILS naming the shell/install, never skips
  (`verify-workflows.mjs` lines 88-94; `verify-zizmor.mjs` lines 62-66).
- **Fail closed:** unreadable fragment/manifest, non-finite clock, hostile
  getter events, or an unrecognized level all resolve to off/refuse/drop —
  never to a live sender or an unthrottled accept (`telemetry-sender.ts`
  lines 72-80; `telemetry-frontend-module.ts` lines 37-46;
  `crash-collector.mjs` lines 192-199, 254-257).

## No Analog Found

| File | Role | Reason |
|---|---|---|
| `worker/wrangler.toml` | config | No deploy descriptor exists in the tree; shape comes from RESEARCH Pattern 4 (D1 binding, route, compatibility date, no secret, runbook comments). |
| `scripts/release-train.mjs` (EXTEND) | utility | File absent (Phase 43 pending, A48-1); `derive`/`next`/`render` + `--self-test` contract from RESEARCH/ARCHITECTURE, pure-emitter idiom only. |
| `docs/RENEWALS.md` rows + `docs/PRIVACY.md` handoff | docs | Files absent (owned Phases 42/47); bodies/strings from RESEARCH privacy agreement, voice from `docs/RELEASING.md` + `docs/CRASH-POLICY.md`. |

## Metadata

**Analog search scope:** `theia/extensions/telemetry/`, `theia/applications/browser/`,
`scripts/` (gates, generator, collector), `powerbrowser/endpoint-allowlist.json`,
`.github/workflows/`, `.github/settings/`, `docs/`, `configuration.toml`
**Files scanned:** ~20 (6 extension sources + test, 8 scripts, allowlist, manifest, app package, 3 workflows, 2 docs)
**Pattern extraction date:** 2026-10-23
