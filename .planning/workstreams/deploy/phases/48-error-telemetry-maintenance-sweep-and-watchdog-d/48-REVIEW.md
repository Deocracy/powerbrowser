---
phase: 48-error-telemetry-maintenance-sweep-and-watchdog-d
reviewed: 2026-10-31T00:00:00Z
depth: deep
files_reviewed: 18
files_reviewed_list:
  - configuration.toml
  - docs/RENEWALS.md
  - powerbrowser/endpoint-allowlist.json
  - scripts/generate.mjs
  - scripts/verify-events-worker.mjs
  - scripts/verify-platform.sh
  - scripts/verify-telemetry.mjs
  - scripts/verify-theia-endpoints.mjs
  - theia/applications/browser/package.json
  - theia/extensions/telemetry/src/browser/telemetry-enrichment.ts
  - theia/extensions/telemetry/src/browser/telemetry-error-capture.ts
  - theia/extensions/telemetry/src/browser/telemetry-error-report.ts
  - theia/extensions/telemetry/src/browser/telemetry-frontend-module.ts
  - theia/extensions/telemetry/src/browser/telemetry-preferences.ts
  - theia/extensions/telemetry/src/browser/telemetry-sender.ts
  - website-staging/privacy.html
  - worker/events-worker.mjs
  - worker/schema.sql
  - worker/wrangler.toml
findings:
  critical: 4
  warning: 6
  info: 4
  total: 14
status: issues_found
---

# Phase 48: Code Review Report (plans 48-01 and 48-02)

**Depth:** deep. **Branch:** dsh/phase-48, `186f465..HEAD`.

## Summary

All the phase's own gates are green: `telemetry`, `telemetry-self-test`, `events-worker`, `events-worker-self-test`, `theia-endpoints` (+self-test), `allowlist-schema`, and `generate --check` (56 files byte-identical). The gates are green while the product does not work, and while two privacy promises fail. The reasons:

- The producer and the Worker never meet in any test. The gate feeds the Worker hand-written flat events, so it cannot see that the real sender emits a different shape.
- The 48-01 plugin-path drive plants forbidden keys (`message`, `stack`) but never plants forbidden content inside an admitted key.
- A downstream rebrand inherits PowerBrowser's endpoint.

Verified correct (no finding):

- D1 statements are all parameterised, with static column names. No SQL injection.
- The retention delete uses the right unit (ms) and the right comparison, and runs against both tables.
- The shared-secret check fails closed on an unset or empty secret. The compare is a full-length loop, which is acceptable.
- A level-off sender drops before queueing, and `normalizeLevel` fails closed.
- `toolkit.telemetry.server` is blank at level off.

## Critical Issues

### CR-01: The real sender's wire shape is not what the Worker reads, so every real report is stored as an all-null row

**Files:** `worker/events-worker.mjs:135-147` (`admitEvent`), `worker/events-worker.mjs:170`; producer `theia/extensions/telemetry/src/browser/telemetry-sender.ts:227,245`; gate `scripts/verify-events-worker.mjs:177-183`
**Issue:** The sender posts `{"events":[{"kind","name","data":{type,source,line,column,version,buildID,os},"at"}]}`. `admitEvent` reads `event.type`, `event.source` and so on at the top level of each event, where nothing is.

I ran the real `ErrorReporter` and `PowerBrowserTelemetrySender` and piped the body into `handleEvents`:

- The wire body was `{"events":[{"kind":"error","name":"frontend.uncaught-error","data":{"type":"TypeError","source":"main.js","line":3,"column":4,"version":"153.5.1","buildID":"v153.5.1-1","os":"unknown"},"at":...}]}`.
- The Worker answered `200 ok: stored 1`.
- The D1 row was `[received_at, null, null, null, null, null, null, null, 0]`.

Consequences:

- Every production report is acknowledged, retried never, and stored with no content. TEL-10 delivers nothing.
- The event `name` (`frontend.uncaught-error` or `frontend.unhandled-rejection`) is not stored at all, so a rejection cannot be told from an uncaught error.
- The gate cannot see this. Its `GOOD_EVENTS` are flat, and it never imports the sender or reporter. The check "admitted set equals the producer" compares key lists only, not the envelope.

**Fix:** Make the Worker read the envelope the producer defines. In `admitEvent`, read `const d = isPlainObject(event.data) ? event.data : {}` and take the seven keys from `d`. Store `event.name` in a `name` column, and store `kind` too. Then add a gate step that drives `ErrorReporter` and the sender into `handleEvents` with a stub D1 and requires non-null `type`, `basename`, `version`, `buildid` and `os`. Plant a flat-shape producer and require red. Update `GOOD_EVENTS` to the envelope shape.

### CR-02: No CORS handling, so a browser page cannot deliver to the Worker

**Files:** `worker/events-worker.mjs:162,228-247`; sender `telemetry-sender.ts:242-246`
**Issue:** The sender calls `fetch(endpoint, {method:'POST', headers:{'content-type':'application/json'}})` from the Theia frontend page. That page's origin is `127.0.0.1:<port>`, and `events.powerbrowser.org` is cross-origin.

- `application/json` is not a CORS-safelisted content type, so the browser sends an `OPTIONS` preflight first.
- The Worker answers `OPTIONS` with `404` and an empty body.
- The Worker emits no `Access-Control-Allow-Origin`, `-Methods` or `-Headers` on any response.
- The browser therefore blocks the POST. The sender sees a network failure, retries three times, and drops silently. No error report ever arrives, even after CR-01 is fixed.

`grep -ri cors` over the phase, the Worker and both gates returns nothing. The planned loopback live-delivery row will not catch this, because it targets a same-origin or no-CORS stub.

I did not run a live browser. This follows from the Fetch spec and from the code.

**Fix:** In `fetch()`, answer `OPTIONS /events` with 204 and `Access-Control-Allow-Origin: *`, `Access-Control-Allow-Methods: POST`, `Access-Control-Allow-Headers: content-type`, `Access-Control-Max-Age`. Add `Access-Control-Allow-Origin: *` to the `/events` responses. `*` is acceptable because the route is unauthenticated and credentialless. Do not add it to `/download-counts`. Add a gate case for the preflight and a plant that removes it.

### CR-03: A downstream rebrand silently inherits PowerBrowser's endpoint, and the guard that would have stopped it was weakened

**Files:** `configuration.toml:108`; `scripts/generate.mjs:5311-5318` and `6035-6039`; `theia/applications/browser/package.json`
**Issue:** The endpoint now lives in the defaults layer. A downstream whose manifest says only `[telemetry] level = "error"` resolves to endpoint `https://events.powerbrowser.org/events`.

I verified this with a minimal "Acme" downstream manifest through `resolveConfig`:

- `failures` was `[]`.
- `emitTheiaTelemetry` gave `"endpoint": "https://events.powerbrowser.org/events"`, `"version": "1.2.3"`.
- `toolkit.telemetry.server` was repointed to PowerBrowser's host.

Acme's users' error reports then go to the DeBIOS Cloudflare account. That is a privacy and trademark leak, and it is the kind of silent inheritance `R11` (NG-064, `generate.mjs:4253`) already forbids for `urls.update`.

The old self-test "telemetry level enabled without an endpoint" proved the generator refuses this case. The diff rewrote it to add `endpoint = ""` instead, so the refusal is now unreachable by omission. The 48-01 SUMMARY records it as a rebrand-checklist item and "Not enforced by code". The project's own rule is that checks, not checklists, hold invariants.

**Fix:** Add an R11-style rule in `resolveConfig`. When `downstreamPath !== undefined` and the resolved `telemetry.level` is not `off` and the resolved endpoint equals the platform's, fail naming `telemetry.endpoint`. Restore the original self-test case, with a downstream that omits the key, as a refusal plant. Keep the `endpoint = ""` case.

### CR-04: The plugin error path forwards arbitrary text in `type`, `source`, `version`, `buildID` and `os` (message or path leak), and the Worker stores it

**Files:** `theia/extensions/telemetry/src/browser/telemetry-sender.ts:93-107,174-181`; `worker/events-worker.mjs:77-79,135-147`; gate `scripts/verify-telemetry.mjs:347-372`
**Issue:** `admittedData` filters keys but accepts any string value. I ran the real sender at level `error`:

```
sendErrorData('plugin.err', { type:"Unable to read '/home/alice/secret.txt'", source:'file:///home/alice/proj/a.ts', os:'Alice-laptop', version:'x'.repeat(5000) })
```

All four values went on the wire unchanged. The `shortcut:` comment at line 96 only covers "caller starts passing free text", but this is the `plugin-ext` path that 48-01 itself identified, and the preference text tells users that extensions' telemetry is sent.

- The privacy page and the preference text promise "never sends error messages", and TEL-06 prohibits any path or URL in the payload.
- The Worker adds no defence. It only truncates to 256 characters, so a message or path of up to 256 characters is stored in D1 for 30 days, per string field.
- The 48-01 drive plants `message` and `stack` as keys. Those are dropped by key, so the test passes while the real leak path (content inside an admitted key) is untested.
- `version` has no length bound on the wire.

**Fix:** Validate values by shape on the sender, because the sender is the only trust boundary that holds before data leaves the machine:

- `type`: `/^[A-Za-z_$][\w$]{0,63}$/`
- `source`: `/^[\w.-]{1,100}$/`
- `os`: one of the four buckets
- `version`: `/^[\w.+-]{1,32}$/`
- `buildID`: `/^[\w.+-]{1,48}$/`

Drop any failing key. Mirror the same checks in `admitEvent` as defence in depth, so a hostile or old client cannot fill D1 with free text. Extend the drive to plant a path inside `type`, `source` and `os`, and require them absent from the wire.

## Warnings

### WR-01: `workers.dev` is left enabled, bypassing the one real rate limit

**File:** `worker/wrangler.toml:307-318`
**Issue:** No `workers_dev = false` and no routes. `wrangler deploy` publishes `powerbrowser-events.<account>.workers.dev` by default. The runbook's rate-limiting rule (step 6) is a zone rule on the events hostname, so it does not apply to the `workers.dev` URL. The only remaining control there is the in-memory per-instance throttle (see WR-02), so the unauthenticated write route is open to unthrottled D1 filling. `/download-counts` is also reachable there with unlimited secret guesses, because no rate limit is described for it.
**Fix:** Add `workers_dev = false` and `preview_urls = false` to `wrangler.toml`, and add a gate literal for it. Add a rate rule for `/download-counts` to the runbook.

### WR-02: The in-Worker throttle is per isolate, global across clients, and racy

**File:** `worker/events-worker.mjs:70-71,124-128,169,178`
**Issue:** The state is a module-level array. This has three consequences:

- Cloudflare runs many isolates, so the effective cap is not 60 per minute.
- One client sending 60 POSTs per minute fills the budget for every other client on that isolate. Their reports then get `200 Discarded` and are never retried, so a single noisy client suppresses all reports.
- Check and push are separated by `await` points in the D1 loop, so concurrent requests all pass `throttled()` before any pushes.

The shortcut comment concedes the first point. The second and third are not mentioned, and the throttle is not keyed by client.
**Fix:** Drop the in-Worker cap as a security claim and rely on the zone rule (after WR-01). If kept, push the timestamp before the awaits. For a real per-client cap, use the Cloudflare Rate Limiting binding or a Durable Object.

### WR-03: Sequential per-event inserts allow partial writes, which the sender's retry then duplicates, and may exceed the subrequest limit

**File:** `worker/events-worker.mjs:171-177`
**Issue:** Each of up to 100 events is its own awaited `run()`.

- If insert N fails, the Worker answers 500 with rows 1 to N-1 already stored. The sender retries the whole batch, up to three attempts, and rows 1 to N-1 are stored again each time.
- The "every rejection is decided before the first write" claim holds for validation only, not for storage faults.
- D1 queries count toward the per-invocation query limit (50 on the free plan, per Cloudflare's limits docs, which I did not re-verify against the live service). A 100-event batch could fail partway on that plan.

**Fix:** Build all statements first and run one `env.DB.batch(statements)`, which is atomic. Add a gate case in which the stub fails on the Nth insert and requires an empty store.

### WR-04: The Worker validates no value shape beyond string or finite number, and the client controls `synthetic`

**File:** `worker/events-worker.mjs:135-147,56-57`
**Issue:**

- `os` is stored as any string. `line` and `column` accept negative values, floats and 1e308. `type` and `source` are free text.
- `synthetic: true` from any anonymous client hides that row from the maintainer view, so junk or abuse is invisible to the owner's query.
- `kind` and `name` are ignored, so usage events (level `all`) are stored as if they were error reports. This follows from CR-01.

**Fix:** Apply the shape checks from CR-04 server-side. Coerce `line` and `column` to `Number.isInteger(v) && v >= 0 && v < 1e7`, or omit them. Only honour `synthetic` when it is paired with a probe `type` (`synthetic.probe`, per the runbook), or drop the flag from the public route and have the sweep probe an authenticated route. Reject `kind !== 'error'`.

### WR-05: Gate gaps: `events-worker` has no producer-to-Worker contract, no CORS, no secret-unset or empty-secret case, and no rate-limit or workers.dev assertion

**Files:** `scripts/verify-events-worker.mjs:177-183,258-340`; `scripts/verify-telemetry.mjs:305-395`
**Issue:**

- `GOOD_EVENTS` is hand-written in the shape the Worker wants, not derived from the producer (see CR-01).
- No plant mutates `authorized()`'s fail-closed branches (`expected === ''`, a missing header, a wrong scheme). `wrongSecret` only mutates the compare line. A change that accepts an empty or unset secret stays green.
- No plant covers the `OPTIONS` or CORS behaviour.
- The `verify-telemetry` plugin drive cannot detect CR-04 (see CR-04).
- Because these are Phase 48's own deliverables, "green" currently overstates the proof. This is the project's "a check that cannot go red" failure mode.

**Fix:**

- Add a producer-to-handler drive (the CR-01 fix).
- Add plants for `authorized()`: remove the empty-secret guard, and drop the Bearer prefix check.
- Add a test with `env` lacking `DOWNLOAD_COUNT_SECRET`, which must return 401.
- Add content-in-admitted-key plants for CR-04.

### WR-06: The request body is read in full before the 64 KiB check

**File:** `worker/events-worker.mjs:239-240`
**Issue:** `await request.text()` buffers the whole body before `byteLength` is compared. The cap is enforced after the memory is spent. The `shortcut:` comment acknowledges it. For an unauthenticated route, this is the first thing an abuser sends. On `/download-counts` the secret check also happens after the body read.
**Fix:** Check `Content-Length` first and answer 413 when it is over the cap or absent. Read through a size-limited stream reader. Check the Authorization header before reading the body on `/download-counts`.

## Info

### IN-01: `schema.sql` is not re-runnable
**File:** `worker/schema.sql:258,270-271,278,286`
**Issue:** `CREATE TABLE` and `CREATE INDEX` lack `IF NOT EXISTS`, so re-applying the file at the owner checkpoint fails after the first run. A migration or re-run after a partial apply errors.
**Fix:** Use `IF NOT EXISTS` throughout.

### IN-02: Small Worker edge cases
**File:** `worker/events-worker.mjs:77-79,167,169,178,230-231`
**Issue:** The Worker has four edge cases:

- `slice(0, 256)` can cut a surrogate pair. A lone surrogate in a bound string may make D1 reject the statement, and the whole batch then answers 500.
- An empty `events: []` is accepted as `ok: stored 0` and consumes a throttle slot.
- A non-POST on a valid path answers 404 instead of 405.
- `compatibility_date = "2026-10-31"` equals today's date. If the installed workerd build is older, it falls back with a warning.

**Fix:** Truncate on code points (`Array.from(v).slice(0, N).join('')`), reject an empty batch, pin the compatibility date to a date the owner's pinned wrangler supports, and answer 405 where appropriate.

### IN-03: The usage path at level `all` is unfiltered
**File:** `theia/extensions/telemetry/src/browser/telemetry-sender.ts:164-170,214-227`
**Issue:** `sendEventData(name, data)` sends any event name and any data object to the endpoint. I confirmed this at level `all`, where `{path:'/home/alice/x', user:'alice'}` is sent verbatim.

- The Worker drops those keys server-side after CR-01 is fixed, but they have already left the machine.
- The preference text discloses extension telemetry at "on", but not that `all` sends arbitrary payloads.
- The executor recorded this as an open decision for the owner. It stays INFO only on the assumption that the owner accepts it.

**Fix:** Either apply the CR-04 value filter and admitted-keys check to the usage path, or have `all` send nothing beyond the error path until a usage schema exists. The preference description should name the actual difference.

### IN-04: Gecko's `toolkit.telemetry.server` is repointed to the events Worker whenever the level is not off
**File:** `scripts/generate.mjs:2678-2695`
**Issue:** At level other than `off`, the Gecko pref now points at `https://events.powerbrowser.org/events`. The unified-telemetry flags are compiled out, so it should be inert. If any Gecko telemetry path is ever enabled, it would POST non-error pings to the error endpoint. This applies the existing TEL-03 design to a new host and is worth a note in the privacy review. `verify-telemetry` check 5 only asserts the blank at level off.
**Fix:** Add a check that the compile-out holds, or keep the Gecko server pref blank for the Worker host.

---

_Reviewed: 2026-10-31_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
