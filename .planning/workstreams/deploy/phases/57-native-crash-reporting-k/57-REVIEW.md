---
phase: 57-native-crash-reporting-k
reviewed: 2026-10-31T00:00:00Z
depth: deep
scope: plans 57-02 and 57-03 (diff c755d408..HEAD, branch dsh/phase-57)
files_reviewed: 12
files_reviewed_list:
  - worker/crash-submit.mjs
  - worker/wrangler-crash.toml
  - worker/crash-r2-lifecycle.json
  - scripts/verify-worker-submit.mjs
  - scripts/verify-release-symbols.mjs
  - scripts/verify-crash-collector.mjs
  - scripts/verify-theia-endpoints.mjs
  - scripts/generate.mjs
  - scripts/verify-platform.sh
  - docs/CRASH-POLICY.md
  - docs/BUILD.md
  - docs/RELEASING.md
findings:
  blocker: 0
  warning: 9
  info: 3
  total: 12
status: issues_found
---

# Phase 57 (57-02, 57-03): Code Review Report

**Depth:** deep. Dynamic claims below were reproduced with a scratch script against the real `worker/crash-submit.mjs` (outside the tree).

## Summary

Confirmed clean on the headline questions:

- `--disable-crashreporter` is still in all four committed mozconfigs (`.mozconfig`, `powerbrowser/packaging/mozconfig.release`, `mozconfig-macos-x86_64`, `mozconfig-macos-aarch64`). Nothing in this diff removes it or enables submission.
- `node scripts/generate.mjs --check` passes (68 files byte-identical), so the origin derivation is inert while `[urls].crash_report` is unset.
- The four new `verify-platform.sh --only` rows pass (`crash-submit`, `crash-submit-self-test`, `release-symbols`, `release-symbols-self-test`).
- CrashID is `crypto.randomUUID()` (CSPRNG v4). Object keys are `crash/<server UUID>.{dmp,json}` and use no client input, so there is no key injection or traversal. Response bodies are fixed vocabulary strings and leak nothing. There is no CORS, which is correct for a native sender. Write order (dump, then record, with delete on record failure) is correct. `workers_dev` and `preview_urls` are off.

No BLOCKER: nothing is deployed or compiled in, so none of the findings below is reachable by a user today. The receiver defects (WR-01, WR-02) and the missing deploy path (WR-03) must be fixed before the owner runs the TEL-07 checkpoint. The policy defects (WR-04, WR-05) and the symbols gate defects (WR-06, WR-07) must be fixed before TEL-13.

## Warnings

### WR-01: record stores unbounded, unfiltered client text (`partNames`), and the name regex is spoofable

**File:** `worker/crash-submit.mjs:132` (record), `:122-123` (name regex); same regex in `scripts/crash-collector.mjs:159`
**Issue:** The record includes `partNames: parsed.parts.map(part => part.name)`. A part name is any `[^"]*` string, up to the whole 20 MiB body, and the only count cap is 16 parts. Reproduced: one part named with 1,000,000 `N` characters was accepted with 200 and produced a 1,000,195 byte `.json` record. This contradicts the stated posture, in the Worker header and in CRASH-POLICY "What is stored", that only allowlisted annotations are stored and that the record carries nothing client-supplied. It lets any caller put arbitrary text of their choosing into the bucket, up to 16 names of roughly 1.25 MB each. In addition, `/name="([^"]*)"/i` is unanchored, so `filename="upload_file_minidump"; name="zzz"` matches the `name="` inside `filename=`. Reproduced: a part whose real name is `zzz` was treated as the minidump (4 bytes stored). A parser that disagrees with RFC 7578 on which attribute is the name is a smuggling primitive. Gecko sends `name` first, so honest traffic is unaffected.
**Fix:**
```js
// anchor to a parameter boundary
const nameMatch = /(?:^|;)\s*name="([^"]*)"/i.exec(disposition[1]);
// record only known names (or just a count)
const KNOWN = new Set([MINIDUMP_PART_NAME, EXTRA_PART_NAME, 'memory_report']);
partNames: parsed.parts.map(p => (KNOWN.has(p.name) ? p.name : '(other)')),
```
Apply the same change to the collector, since the gate requires the two parsers to agree, and add a battery case (filename-before-name, 100 KB part name) to `scripts/verify-worker-submit.mjs` and `verify-crash-collector.mjs`. Add an assertion that the stored record contains only allowlisted keys and values.

### WR-02: delimiter split allocates before the part-count cap (memory amplification, Worker killed)

**File:** `worker/crash-submit.mjs:83-92` (`splitBytes`), `:119` (count check after the split)
**Issue:** `splitBytes` builds every subarray for the whole body, and the `chunks.length - 1 > MAX_PARTS + 1` check runs afterwards. The boundary can be one character (`boundary=a`), so an 18 MiB body of repeated `\r\n--a` produces about 3 million `Uint8Array` views. Reproduced under node: the request took 653 ms and RSS reached about 620 MB, to answer 413. A Worker isolate has a 128 MB limit, so the isolate is killed (Cloudflare 1102) before the 413 is produced. No data is stored, but the 20 MiB body cap is not the effective bound, and the zone rule is the only guard. The collector has the same shape (`splitBuffer`), but the Worker is the public one. `readCappedBytes` also holds the chunk list, the `out` copy and the `framed` copy at the same time, so peak use is at least 3 times the body size before the split begins.
**Fix:** count delimiters while splitting and stop early:
```js
if (out.length > MAX_PARTS + 2) return null; // splitBytes -> caller answers REASON_OVERSIZED
```
Also reject boundaries shorter than 3 characters or longer than the RFC 2046 limit of 70. Add a battery plant (1-character boundary with many delimiters) that requires 413 within a fixed element budget.

### WR-03: the receiver runbook does not produce a reachable Worker, and it deploys before the rate-limit rule

**File:** `worker/wrangler-crash.toml:10-17,31-36`; `docs/RELEASING.md:262`
**Issue:** `worker/wrangler.toml` (events) states that Phase 47 attaches the events hostname and says the Worker is unreachable until then. The crash descriptor has no `routes` or `custom_domain` and no runbook step creates the crash hostname or DNS record. The step 6 rule "matches the crash hostname" names a host that nothing creates, and the RELEASING.md row also omits the DNS step, which the events row includes. Following the runbook as written yields a deployed Worker with `workers_dev = false` and no route, so the step 7 probe cannot run. Separately, the order is deploy (5) then rate-limit rule (6). Whenever the route is attached between those two steps, the endpoint takes up to 20 MiB R2 writes with no limit.
**Fix:** add a step before deploy: "Create the crash DNS record (proxied) and the Worker route or custom domain, then the zone rule, then attach". Alternatively, order the rule first (rules can be created before the host serves traffic), and add `routes` or `custom_domain` to the descriptor. Mirror the DNS item in the RELEASING.md row.

### WR-04: CRASH-POLICY misstates what a minidump holds and omits who can read it

**File:** `docs/CRASH-POLICY.md` "What is stored" (the sentence "File paths, URLs and form data have no allowlisted field to arrive in"), "Retention", "Exposure"; `worker/wrangler-crash.toml` runbook
**Issue:** The privacy statement is true only of the annotation record. The `.dmp` object is a process memory capture (stacks, and heap contents, which can hold URLs, form data, page text and credentials). The page never says so. A reader would infer that no URL or form data is stored. Gecko also sends a `memory_report` part (`upstream/toolkit/crashreporter/client/app/src/net/report.rs:20-22`, gzipped JSON of the browser's memory, which names open page URLs). The receiver accepts it up to 8 MiB, silently drops it, and the page does not say that. The page has no statement of access control or encryption. The runbook creates the bucket without saying: keep the r2.dev public URL disabled, attach no custom domain, scope the API token (read) to this bucket, and say who holds it. R2 encrypts at rest by default, but that is not recorded either. A mistake at the bucket-creation step would publish memory dumps.
**Fix:** add a "Sensitivity and access" section: minidumps contain memory contents; `memory_report` is discarded and why; the bucket is private (r2.dev off, no custom domain); read access is the owner's account only; encrypted at rest by R2; deletion on request is by object `<uuid>`. Add a runbook step 3a that verifies r2.dev is disabled and records it. Reword the "File paths, URLs and form data" sentence to scope it to annotations.

### WR-05: CRASH-POLICY states consent behaviour that does not exist and is partly false

**File:** `docs/CRASH-POLICY.md` "State: compiled out until TEL-13" (bullets "Consent first" and "The stock dialog is the consent surface")
**Issue:** The page says "when the reporter is enabled, these statements hold", and also "if the code and this page ever disagree, this page wins and the code is the bug". But `BLOCKED.md` B1 records that the consent read currently fails open (`glean.rs:35-71` returns true on every absent input) and that no patch exists to fix it. "A minidump is submitted only after the user chooses to send the report in the stock per-crash dialog" is also false for the stock client: `config.rs:177` honours `MOZ_CRASHREPORTER_AUTO_SUBMIT`, `logic.rs:115,531` and `main.rs:125,227` skip the dialog when `auto_submit` is set, and `browser.crashReports.unsubmittedCheck.autoSubmit2` (`firefox.js:2823`) and the backlog notification are separate send paths. Nothing in the tree locks those prefs or clears the environment variable, and no gate covers it. As written the page asserts a guarantee no code or gate backs.
**Fix:** until 57-01 lands, state these as requirements, not facts ("TEL-13 will not flip until ... the consent read fails closed (not yet implemented, see BLOCKED B1)"). Add the auto-submit env var and `autoSubmit2` to the TEL-13 prerequisites and give them a locked-pref gate before the page claims dialog-only consent.

### WR-06: the symbols gate has checks that cannot go red, and plants that do not exercise the rule

**File:** `scripts/verify-release-symbols.mjs:154-170` (checks 3 to 5), `:116-127` (`compareSymbolsDraft`), `:205-238` (plants)
**Issue:** The gate claims derivation from the tree, but its main run compares the gate's own output to itself.
- Check 5 builds a SHA256SUMS text from `names` and then verifies that `sumsNames` of that text covers `names`. This is a tautology and no input can make it red. No real SHA256SUMS or release workflow file is read.
- The per-token check at lines 157-161 tests names the gate itself built from each token, so it always holds.
- `dist07Names` hard-codes the four DIST-07 patterns. The header says "as verify-release-asset-set.mjs lists them", but it does not read that file, which is a hand-kept expectation list that the CLAUDE.md verification rule forbids. If DIST-07 naming changes, the collision check keeps checking the old shape.
- `compareSymbolsDraft` (the "missing" and "stale" rules, items 6 and 7 of the header) is never called by `runChecks` and no real draft or release asset list is passed to it. Plants 1 and 2 only prove the helper works on arrays the plant builds.
- Plant 3 calls `sumsNames` on text the plant builds; it never exercises `runChecks`. Plant 4 calls `duplicates()` on an input that is duplicated by construction (`[tokens[0], tokens[0]]`); it does not drop the token from any naming rule, so it proves nothing about "adjacent targets collide without a BUILD_TARGET token".
- `targetTokens` matches only backticked lowercase tokens in the first column of the RELEASING.md table. The Windows and macOS rows are prose ("Windows x86_64", "macOS universal"), so exactly one target (`linux-x86_64`) is checked. A new target row written in prose is silently skipped. The header comment admits "may list one target today".
**Fix:** make check 6 real: read `scripts/verify-release-asset-set.mjs` (or the release workflow's asset list) and pass its names to `compareSymbolsDraft`; read the real `SHA256SUMS` generator or workflow lines for check 5; import `dist07Names` from the asset-set script. Replace plants 3 and 4 with fixtures run through `runChecks` (a fixture root where the generator drops the token, a fixture workflow missing the symbols line) and require the named failure. Fail when the asset table has a row that is not a token.

### WR-07: the symbols asset name and the stackwalk runbook are not derivable from what `mach buildsymbols` and Gecko produce

**File:** `docs/CRASH-POLICY.md` "Minidump stackwalk runbook" steps 1-2; `scripts/verify-release-symbols.mjs:85-91`; `docs/BUILD.md` (new "Crash symbols per target" section)
**Issue:**
- Per `package-name.mk:18`, `PKG_BASENAME = $(MOZ_PKG_APPNAME)-$(MOZ_PKG_VERSION).$(AB_CD).$(MOZ_PKG_PLATFORM)`, so `mach buildsymbols` writes something like `powerbrowser-153.1.0.en-US.linux-x86_64.crashreporter-symbols.zip`. The gate takes only the suffix from `package-name.mk` and invents the rest as `<app>-<version>.<token>`. The RELEASING.md table notes that whether the locale token is dropped on rename is still "pending stage linux-release-pipeline-and-update-channel". No step renames the zip to the asset name, and no check catches a rename that is never done.
- Runbook step 2 says to take the BUILD_TARGET from the `Platform` annotation. `Platform` is not a Gecko crash annotation: `upstream/toolkit/crashreporter/CrashAnnotations.yaml` has `BuildID`, `ProductName`, `ReleaseChannel`, `Version`, `CrashTime`, `StartupTime`, and no `Platform`. It is on the receiver allowlist (`ANNOTATION_ALLOWLIST`), but Gecko never fills it, so the records will not carry the target the runbook says to read. The `Version` annotation is `MOZ_APP_VERSION` (for example 153.1.0), whereas the asset `<version>` is the tag minus `v` (for example 140.12-1). The page does not say how to map one to the other.
**Fix:** derive the on-disk name as `PKG_BASENAME` from the same two `.mk` lines plus `MOZ_PKG_*` as the build reports it, and require a documented rename step in the release workflow before the gate claims coverage. In the runbook, take the target from the `BuildID`/`Version` pair mapped through a recorded table, or add a patch-free way to record the target (for example the Windows/Linux/Mac token in the minidump's system info, which `minidump-stackwalk` prints). Drop `Platform` from the allowlist (or document it as always empty) and remove the dependency on it in step 2.

### WR-08: the receiver gate's "handler plants" re-run the control against the unmutated Worker

**File:** `scripts/verify-worker-submit.mjs:430-471`
**Issue:** The six handler "plants" (malformed content-type, missing minidump, oversized body, non-allowlisted key dropped, malformed extra kept, store fault) feed a faulty input to the real, unmutated Worker and check that the Worker responds correctly. That repeats checks `runChecks` has already made in the control, which exits before any plant runs if any one is red. They never mutate the Worker, so they cannot show that the gate would catch a regression, for example a Worker that stops dropping `NotAllowlisted`. Only the descriptor plants (workers_dev, expire_days, crons, throttle string, credential) mutate a copy and prove detection. The battery is also missing the adversarial inputs that matter for this Worker: filename-before-name (WR-01), a very long part name, an empty minidump, a one-character boundary (WR-02), two parts named `upload_file_minidump`, a non-JSON-object `extra` (array, number), and an oversized annotation value in a non-`extra` part. The suite checks that the stored record equals the allowlist, but not that nothing else is in it (`partNames`).
**Fix:** run the handler checks against a mutated copy of `crash-submit.mjs` loaded from a mkdtemp directory (strip the allowlist filter, drop the delete-on-failure, write the record first), and require each plant to go red naming its rule. Add the missing battery inputs and an "only known keys in the stored record" assertion.

### WR-09: leaving `crash_report` unset does not protect a downstream after the TEL-13 flip

**File:** `scripts/generate.mjs:1549,1569` (and the mozconfig emission); `upstream/toolkit/moz.configure:3393-3403`
**Issue:** The new `--with-crashreporter-url` line is emitted only when the key is stated, and `--disable-crashreporter` is a hard-coded literal. That is inert and byte-identical today. But the stock default of `--with-crashreporter-url` is `https://crash-reports.mozilla.com/`. When 57-04 removes the literal, every rebrand that has not stated `crash_report` (which includes the shipped manifest and every downstream that inherits it) builds a reporter that sends to Mozilla. The `crash-reports.mozilla.com` allowlist row is a layer-3 egress check, not a build-time guard. The risk is that the flip is a one-line deletion that no generator rule or gate ties to the key.
**Fix:** make the generator own the pairing now, while it is inert: emit `--disable-crashreporter` whenever `crashReporterOrigin(config)` is empty, and only when it is non-empty emit `--with-crashreporter-url=...` and (at the flip) omit the disable line. Add a self-test plant "key unset, line absent -> generation fails" so the flip cannot be made by deleting the literal.

## Info

### IN-01: origin derivation drops the path and any credentials, while `breakpad.reportURL` keeps both verbatim

**File:** `scripts/generate.mjs:1431-1452`
**Issue:** `https://crash.example.org/report` (the example in the error message) submits to `https://crash.example.org/submit`, so an operator whose receiver sits under a path prefix cannot express that. The view link base stays `.../report` and the Worker answers 404 with an empty body for that path (`crash-submit.mjs` fetch), so the about:crashes "view" link will 404 on the shipped receiver. A stated `https://user:pw@host/` is reduced to `https://host` for the submit origin but kept verbatim in `breakpad.reportURL` and the pref file. The self-test only covers the plain-host case.
**Fix:** document that only the origin is used (REBRANDING.md `urls.crash_report` row); reject userinfo in `crashReporterOrigin`; decide whether the receiver should serve a minimal view response.

### IN-02: any bytes are accepted as a minidump, including an empty part

**File:** `worker/crash-submit.mjs:127-129`
**Issue:** The only check is that a part is named `upload_file_minidump`. A zero-byte part or non-minidump data is stored as a `.dmp` and a `.json` record (two R2 Class A operations and up to 8 MiB of storage per request) for the 30-day window. This has collector parity but gives a cheap fill pattern if the zone rule is loose.
**Fix:** require `data.byteLength >= 32` and the `MDMP` magic (`4d 44 4d 50`) in both receivers, answering `malformed_no_minidump`.

### IN-03: the retention claim is stronger than what the repo can show

**File:** `worker/crash-r2-lifecycle.json`, `docs/CRASH-POLICY.md` "Retention"
**Issue:** `crash-r2-lifecycle.json` uses an invented schema (`prefix`/`expire_days`) rather than wrangler's lifecycle rule format, and the gate checks only the file. The live bucket rule is an owner step, and R2 expires objects asynchronously (typically within a day after the age is reached). The page says "kept for 30 days and then deleted" as a fact. The `.dmp` orphan path (`catch {}` after a failed record write) is also left to the same rule.
**Fix:** reword to "expire after 30 days (within about a day)", record the verified live rule in the operator record, and note that the JSON is a record of intent, not a file wrangler consumes.

---

_Reviewed: 2026-10-31_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
