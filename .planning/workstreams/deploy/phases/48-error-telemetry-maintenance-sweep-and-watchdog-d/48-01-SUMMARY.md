---
phase: 48-error-telemetry-maintenance-sweep-and-watchdog-d
plan: 01
subsystem: telemetry
tags: [tel-06, theia, error-reporting, privacy, verification-gate, manifest]

# Dependency graph
requires:
  - phase: 47-hosting-website-and-mail-d
    provides: privacy page (website-staging/privacy.html) and the endpoint allowlist that the events host is added to; no events hostname was named in any Phase 47 summary
provides:
  - Theia error producer that sends type, source (basename), line, column, version, buildID and os, and nothing else
  - Manifest states the events endpoint at level off, with the fragment carrying version and buildID
  - Allowlist row admitting the events host with manifest telemetry.endpoint
  - Extended telemetry gate pinning the admitted set, the preference text and the level-off blank server
affects: [48-02 events Worker (admitted set), 48-03 maintenance sweep, 48-05 owner deploy and loopback live-delivery row]

# Actuals (#2632) -- chars/4 over the post-plan content of the 14 files changed by this plan.
actuals:
  tokens: 110336
  tasks: 2
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Producer admitted set: ADMITTED_KEYS in one zero-dependency module; the enrichment copies only those keys and the sender enforces them on the error path"
    - "Gate planted-fault pattern extended to source modules: the gate loads the planted copy of a module from a temp dir and must go red naming the drift"
    - "Enrichment derived from releaseIdentity at generate time, never a runtime read of a build artifact"

key-files:
  created:
    - theia/extensions/telemetry/src/browser/telemetry-enrichment.ts
  modified:
    - theia/extensions/telemetry/src/browser/telemetry-error-report.ts
    - theia/extensions/telemetry/src/browser/telemetry-error-capture.ts
    - theia/extensions/telemetry/src/browser/telemetry-sender.ts
    - theia/extensions/telemetry/src/browser/telemetry-preferences.ts
    - theia/extensions/telemetry/src/browser/telemetry-frontend-module.ts
    - theia/extensions/telemetry/tsconfig.json
    - scripts/verify-telemetry.mjs
    - scripts/generate.mjs
    - scripts/verify-theia-endpoints.mjs
    - configuration.toml
    - theia/applications/browser/package.json
    - powerbrowser/endpoint-allowlist.json
    - website-staging/privacy.html

key-decisions:
  - "Hostname: events.powerbrowser.org. No Phase 47 summary names an events host, so the assumed name in A48-2 is recorded here; the allowlist row and manifest value follow the Phase 47 name if it differs."
  - "Wire spellings: type, source (basename only), line, column, version, buildID (camelCase), os (lowercase bucket: windows, macos, linux, unknown). The privacy page keeps the TEL-08 label basename for the source key; reconcile in plan 48-05 if the owner wants wire names on the page."
  - "version is releaseIdentity esrVersion (153.5.1). buildID is releaseIdentity releaseKey (v153.5.1-1), the per-shipped-build key; it is not the Gecko MOZ_BUILDID used in MAR descriptors (RESEARCH Q3)."
  - "Error path enforces the admitted set in the sender, not only in the producer: a plugin's own error data (plugin-ext logger path) cannot add keys, and objects are dropped. Event names must match an identifier shape or are sent as unknown."
  - "The endpoint is stated in the default manifest, so a downstream that omits [telemetry] inherits level off and the PowerBrowser events endpoint (default-echo). A downstream that enables a level must restate or clear the endpoint; the generate self-test pins the clear-to-refusal path."
  - "Telemetry tsconfig rewrites .ts import specifiers (rewriteRelativeImportExtensions) so plain node loads the zero-dependency modules and tsc emits .js for the Theia bundle."

patterns-established:
  - "Admitted-set gate: the gate derives the enrichment key set and the driven sent keys and requires them to be a subset of ADMITTED_KEYS, which equals the seven-key TEL-06 literal"
  - "Source-module plants: stage a copy of the producer files in a temp dir, mutate one, and require the gate to go red naming the drift"

requirements-completed: [TEL-06]  # producer and manifest halves complete; the loopback live-delivery row and the owner deploy are plan 48-05

# Metrics
duration: not recorded
completed: 2026-10-31
status: complete
---

# Phase 48 Plan 01: Error producer, manifest endpoint and allowlist host for TEL-06 Summary

**Theia error reports now carry only type, basename, line, column, version, buildID and a four-value OS bucket, with the events endpoint stated at level off and the telemetry gate pinning the admitted set.**

## Performance

- **Duration:** not recorded (no timer was started at plan start)
- **Started:** not recorded
- **Completed:** 2026-10-31
- **Tasks:** 2 of 2
- **Files modified:** 14

## Accomplishments

- One window error reaches the sender as type, basename source, line, column, version, buildID and os, with no message, stack, path or URL. The gate drives the real reporter and sender and checks each sent key against ADMITTED_KEYS.
- The sender's error path no longer reads error.message. An Error input is named by its type. Caller data is cut to the admitted keys (string or finite-number values), and a message-shaped event name is sent as unknown.
- The telemetry preference description reads byte for byte as TEL-06 states.
- configuration.toml states https://events.powerbrowser.org/events under [telemetry] while level stays off. The generated fragment and the tracked powerbrowserTelemetry block carry endpoint, version (153.5.1) and buildID (v153.5.1-1), and they agree in both directions.
- The allowlist admits events.powerbrowser.org with disposition allow and manifest telemetry.endpoint. The reason states that error reports fire at level error with no per-event click.
- The telemetry gate asserts the admitted set equals the seven-key literal, the description byte equality and the level-off blank toolkit.telemetry.server. Its self-test plants an extra enrichment key, a stack field the sender forwards, and a one-word description change. Each goes red naming its drift, with the unmutated control green first.

## Task Commits

1. **Task 1: tracer slice, window event through reporter, enrichment and sender** - `b034e31` (feat)
2. **Task 2: state the endpoint at level off, bake version and buildID, admit the events host** - `8cce78a` (feat)

Plan base (HEAD before the first task commit): `186f465`.
Plan metadata commit: the docs commit that adds this file (the commit after `8cce78a`).

## Files Created/Modified

- `theia/extensions/telemetry/src/browser/telemetry-enrichment.ts` - new zero-dependency module: ADMITTED_KEYS, osBucket, readTelemetryVersion, readTelemetryBuildID, withEnrichment
- `theia/extensions/telemetry/src/browser/telemetry-error-report.ts` - enriches before the dedupe key; takes an optional context with version and buildID
- `theia/extensions/telemetry/src/browser/telemetry-sender.ts` - error path names by typeOf or an identifier-shaped name, sends only admitted keys
- `theia/extensions/telemetry/src/browser/telemetry-error-capture.ts` - passes the fragment version and buildID into the reporter
- `theia/extensions/telemetry/src/browser/telemetry-frontend-module.ts` - readTelemetryConfig also returns version and buildID, fail-closed
- `theia/extensions/telemetry/src/browser/telemetry-preferences.ts` - TEL-06 description text
- `theia/extensions/telemetry/tsconfig.json` - rewriteRelativeImportExtensions
- `scripts/verify-telemetry.mjs` - admitted-set, description and blank-server checks; six planted faults and the producer drive
- `scripts/generate.mjs` - fragment carries version and buildID from releaseIdentity; generate self-test updated for inherited endpoint
- `scripts/verify-theia-endpoints.mjs` - absent-host plant swaps the stated host (it previously inserted a second endpoint key)
- `configuration.toml` - [telemetry] endpoint stated, level off
- `theia/applications/browser/package.json` - powerbrowserTelemetry block only (sibling keys byte-identical)
- `powerbrowser/endpoint-allowlist.json` - events host row
- `website-staging/privacy.html` - events host in the unattended list; OS described as a four-value family

## Decisions Made

See key-decisions in the frontmatter. The two decisions the owner should check are the hostname (assumed, A48-2) and the inherited default endpoint (see Issues Encountered).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] Error path did not enforce the admitted set**
- **Found during:** Task 1 (plugin-ext logger path review, flagged assumption TEL-06 boundary)
- **Issue:** sendErrorData passed caller data and the caller's name straight to the wire. The plugin-ext logger reaches this sender, so a plugin error carrying message or stack would be sent. The preference text says error messages are never sent.
- **Fix:** the sender keeps only ADMITTED_KEYS with string or finite-number values, drops objects, and sends a name that is not identifier-shaped as unknown. The gate drives three plugin-path calls, and the stack-field plant removes the filter to prove the gate catches it.
- **Files modified:** theia/extensions/telemetry/src/browser/telemetry-sender.ts, scripts/verify-telemetry.mjs
- **Verification:** verify-telemetry PASS; self-test stack-field plant red naming "stack"
- **Committed in:** b034e31

**2. [Rule 3 - Blocking] .ts import specifiers did not compile or load**
- **Found during:** Task 1
- **Issue:** the sender and the reporter must import sibling .ts modules so plain node loads them, but tsc rejected the .ts extension and, after the flag was added, an incremental build kept emitting .ts requires that webpack cannot resolve.
- **Fix:** tsconfig sets rewriteRelativeImportExtensions; a forced build emits require("./telemetry-enrichment.js").
- **Files modified:** theia/extensions/telemetry/tsconfig.json
- **Verification:** tsc -b --force exit 0; the emitted lib requires point at .js; suite 9/9 green
- **Committed in:** b034e31

**3. [Rule 3 - Blocking] verify-theia-endpoints self-test plant assumed an unset endpoint**
- **Found during:** Task 2
- **Issue:** the absent-host plant replaced level = "off" with level = "all" plus a second endpoint line. With the endpoint now stated, that produces a duplicate TOML key and the plant reports a manifest error, not the coverage failure it tests.
- **Fix:** the plant replaces the stated host with absent.example.org. The check and its assertion are unchanged.
- **Files modified:** scripts/verify-theia-endpoints.mjs
- **Verification:** theia-endpoints-self-test PASS
- **Committed in:** 8cce78a

**4. [Rule 2 - Missing critical functionality] privacy page out of step with the producer**
- **Found during:** Task 2 (privacy-hosts row red after the allowlist row)
- **Issue:** the allow row with no trigger requires the events host in the unattended list (TEL-08 requires the page to state unattended hosts). The OS line also said "operating system name and version", which the bucketed wire value no longer carries.
- **Fix:** added one list item for events.powerbrowser.org, stating that it receives error reports only while error reporting is on; changed the OS line to a four-value family.
- **Files modified:** website-staging/privacy.html (a Phase 47-owned file)
- **Verification:** privacy-hosts and privacy-hosts-self-test PASS; legal-page-verbatim and website-publish-ready-self-test PASS
- **Committed in:** 8cce78a

**5. [Rule 1 - Bug in expectation] generate self-test assumed an unset endpoint is null**
- **Found during:** Task 2
- **Issue:** two cases stopped holding once the default manifest states the endpoint. An omitted [telemetry] section now inherits that endpoint (default-echo), and "level enabled without an endpoint" no longer fails because the endpoint is always inherited.
- **Fix:** the omitted-section case expects level off with the endpoint derived from the default manifest; the refusal case clears the endpoint explicitly (endpoint = "") and still expects a red naming telemetry.endpoint.
- **Files modified:** scripts/generate.mjs
- **Verification:** generate --self-test PASS (67 planted faults)
- **Committed in:** 8cce78a

**Total deviations:** 5 (2 Rule 1/2 defects in the plan's surface, 2 Rule 3 blockers, 1 Rule 2 accuracy fix in the Phase 47 page).
**Impact on plan:** each change is needed for the plan's own gates to hold. None widens scope beyond the TEL-06 producer, the manifest endpoint and the allowlist host.

## Issues Encountered

- **Inherited endpoint for downstreams.** The endpoint lives in the default manifest, so a downstream that omits [telemetry] inherits the PowerBrowser events endpoint. Level stays off, so nothing is sent. A downstream that enables a level without restating the endpoint would send error reports to PowerBrowser's events host. The rebrand checklist must require restating or clearing endpoint, the same as [urls]. Not enforced by code in this plan.
- **Plugin usage path at level all.** sendEventData (usage) still passes caller data through unfiltered. The preference text describes error reports only; usage events at level all are the path the text calls VS Code extension telemetry. The owner should decide whether usage needs the same filter. Not changed here.
- **Residual error-path risk.** String values of admitted keys are not content-checked (a plugin could put text into type or source). The sender shortcut comment records the limit; the reporter's own strings are bounded.
- **Main-gate warning.** `node scripts/verify-telemetry.mjs` prints a Node MODULE_TYPELESS_PACKAGE_JSON warning on stderr because the gate imports the .ts enrichment module. It does not fail the gate. Fixing it means adding a "type" field to the extension package, which changes how Theia treats the package; not done.
- **Gate task-level check.** The plan's acceptance says the second commit lists eleven paths. The two commits list 8 and 6 paths, 14 in total, including the tsconfig and the endpoints self-test plant, which the plan did not list.
- **NG-067 full-tier row not run.** verify-ng-067-frontend-errors.mjs needs a live browser; it reads only the fixed event names, which are unchanged. It was not run in this session.

## Flagged Assumption Outcomes (TEL-06 group)

- **TEL-06 boundary:** found one extra error path, the plugin-ext logger through sendErrorData. Now enforced in the sender (see Deviation 1). Usage path at level all is not filtered (Issues Encountered).
- **TEL-06 adjacency:** scanned the tree for other producers that post to the events endpoint. None exist beyond this sender and the usage path. No error-shaped body with a wider key set was found.
- **TEL-06 empty:** an Error input with no data is sent with no data field (asserted by the driver). A plugin call with no admitted keys is sent with no data field, not an empty object. A reporter event always has type and os.
- **TEL-06 encoding:** the enrichment module is erasable-only. Node type stripping and tsc both accept it after the tsconfig change. No syntax rejection remained.
- **TEL-06 ordering:** no reorder. Enrichment maps each event before enqueue. An ad hoc run through the real sender kept call order (uncaught, rejection, uncaught). The gate does not assert order; that assertion was in the plan's text and was not added.
- **TEL-06 precision:** line and column are finite numbers or omitted; version and buildID are non-empty strings or omitted; nothing is coerced. The gate's non-number check passes.
- **TEL-06 concurrency:** the dedupe key is still eventName|type|source|line. A repeated error is sent once (asserted by the gate).
- **A48-2 hostname:** assumed events.powerbrowser.org. The Phase 47 summaries name no events host. If Phase 47 names another host, change configuration.toml, the allowlist row and the package block together; the gates will go red naming the host.
- **A48-5 scope:** the only allowlist change is the telemetry.endpoint row. The privacy page change is the one required by its gate. No update preference, channel or other host changed.

## Verification Evidence

- `node scripts/verify-telemetry.mjs` and `--self-test`: PASS (six plants and the producer drive)
- `scripts/verify-platform.sh --only telemetry`, `telemetry-self-test`, `theia-endpoints`, `theia-endpoints-self-test`, `allowlist-schema`, `privacy-hosts`, `privacy-hosts-self-test`, `generate-self-test`, `generate-check`, `generated-byte-identity`, `legal-page-verbatim`, `website-publish-ready-self-test`: all PASS
- `node scripts/scan-brand-residue.mjs`: PASS after staging the new module
- `node theia/extensions/telemetry/test/telemetry-sender.test.mjs`: 9/9
- Baseline before plan 48-01 (`scripts/verify-platform.sh --quick`): verify-platform PASS, zero summary red rows
- After plan 48-01: see the --quick result in the completion report (run after this file was written)

## Self-Check

- [x] Created file exists: theia/extensions/telemetry/src/browser/telemetry-enrichment.ts
- [x] Commit b034e31 is an ancestor of HEAD
- [x] Commit 8cce78a is an ancestor of HEAD

## Self-Check: PASSED

## Next Phase Readiness

- Plan 48-02 (events Worker) can import the admitted set from the producer; its server-side admitted set must equal ADMITTED_KEYS (the enrichment module is the source).
- The loopback live-delivery row and the owner deploy (endpoint live, D1, rate-limit rule) stay with plan 48-05.
- Owner decisions to check: the hostname (A48-2), the inherited default endpoint for downstreams, and whether usage events at level all need the same filter.
