# Power Browser Crash Collection Policy (TEL-04, rewritten for TEL-12)

This is the reviewable source for crash handling. Two implementations enforce
exactly what this page states, and each has its own gate:

- the downstream-operated collector, `scripts/crash-collector.mjs`, proven by
  `scripts/verify-crash-collector.mjs --self-test`;
- the public receiver, `worker/crash-submit.mjs`, proven by
  `scripts/verify-worker-submit.mjs --self-test`.

If the code and this page ever disagree, this page wins and the code is the
bug. A statement in the "Requirements before TEL-13" list below is a
requirement, not a description of code that exists.

## State: compiled out until TEL-13

The native crash reporter stays compiled out (`--disable-crashreporter`) in
every committed build, so Power Browser itself sends no crash anywhere today.
No reporter-enabled build is shipped. The reporter is enabled only at the
TEL-13 flip, which is gated on three things: the consent gate on the crash ping
(TEL-09), this receiver deployed and probed (TEL-07), and the symbols attached
to each Release (TEL-12). The flip also waits for the first Windows release.

The consent behaviour is not implemented yet. The crash-ping consent read
currently fails open in a reporter-enabled build: it treats a missing profile
directory, a missing prefs file, a missing value and an unreadable file as
consent. The fix needs a patch to Rust source that the patch-surface guard does
not yet allow, and it waits on an owner decision (`BLOCKED.md`, item B1). Until
that lands, TEL-13 does not flip.

### Requirements before TEL-13

These must hold, each backed by a gate, before a reporter-enabled build ships:

- **Consent first.** The crash ping sends nothing before the user's consent.
  The consent read fails closed on a missing profile directory, a missing
  prefs file, a missing value and an unreadable file (TEL-09, not yet
  implemented).
- **The stock dialog is the only send path.** A minidump is submitted only after
  the user chooses to send the report in the stock per-crash dialog. The stock
  client has two other send paths, and both are closed. The
  `browser.crashReports.unsubmittedCheck.autoSubmit2` preference, which the
  backlog notification and the settings checkbox can set, is locked false in
  the shipped `powerbrowser/distribution/policies.json` (plan 57-05, gate
  `crash-autosubmit-lock`). The `MOZ_CRASHREPORTER_AUTO_SUBMIT` environment
  variable (`config.rs`, honoured in `logic.rs` and `main.rs`, skips the
  dialog) is cleared at startup: `PowerBrowserSingleInstanceHandler.handle`
  sets it to the empty string through `PowerBrowserAPI.clearEnv` before
  anything else, and the client's `env_bool` reads an empty value as false.
  Gecko starts the client with the browser's live environment at crash time,
  so every later crash shows the dialog (plan 57-08, gate
  `crash-autosubmit-env`).
  Limit: a crash before the command-line handler runs still sees the variable.
- **One receiver URL.** The submit target is the origin of `[urls].crash_report`
  in `configuration.toml`, and the about:crashes view link uses the same key.
  The generator refuses a configuration that would enable the reporter without
  that key.

The collector covers downstream operators who want their own endpoint. It is
never the Power Browser default.

## Ping versus report routing

Two paths, two destinations, never mixed:

- **Pings** are error events from the Theia sidecar. They ride the existing
  telemetry sender to the telemetry endpoint as JSON batches, admitted at
  every level but `off` (so at `crash` too). Usage events stay home unless
  the level is `all`. No minidump bytes enter that sender.
- **Reports** are minidumps, submitted as multipart POSTs to `POST /submit`
  with the part name `upload_file_minidump`. A successful submit is answered
  with `CrashID=<uuid>`.

## What is stored

Each accepted submit writes exactly two objects. The minidump bytes go to
`<uuid>.dmp`, and the index record goes to `<uuid>.json` (id, received time,
annotation values, minidump size, and part names). The collector writes them to
its store directory. The receiver writes them under the `crash/` prefix of
its R2 bucket, and it writes the record last, so a record exists only when
its minidump does.

Annotations are allowlist-only. The only submitter-supplied fields ever
stored are:

- `ProductName`, `Version`, `BuildID`, `ReleaseChannel`, `CrashTime`,
  `StartupTime`, `OS`, `CPUArchitecture`

Each of these is a crash annotation that Gecko writes and sends with a report
(`upstream/toolkit/crashreporter/CrashAnnotations.yaml`); the gate derives that
from the file. A name Gecko never writes is not on the list.

Any other field is dropped before the write, and any allowlisted value
larger than 4096 bytes is dropped with it. Allowlisted values are scalars: a
nested value is dropped. This describes the annotation record only. The
minidump object is different: see "Sensitivity and access".

Gecko sends its annotations as one JSON part named `extra`. Only the
allowlisted scalar values from that part are kept, each stored as text. A
malformed `extra` part costs its annotations and keeps the report: the
minidump is stored and no annotation from the part is.

The record's part names are limited to the names Gecko sends and the
allowlisted annotation names; any other part name is stored as `(other)`, so
no client-chosen text is stored outside the allowlisted annotation values.

No client-supplied identifier is stored. The record id and the object names
are server-assigned random UUIDs, and the record carries the server's receipt
time only.

## Sensitivity and access

A minidump is a capture of process memory: stacks and parts of the heap. It can
contain page URLs, form data, page text and credentials that were in memory when
the browser crashed. The allowlist above protects the annotation record, not the
minidump. Treat every `.dmp` object as sensitive.

- **Dropped on receipt.** Gecko also sends a `memory_report` part (a gzipped
  JSON memory report that names the open pages). The receiver reads it and
  drops it; it is never stored.
- **Private bucket.** The R2 bucket has no public access: the r2.dev public URL
  is disabled and no custom domain is attached to the bucket. The deploy
  runbook (`worker/wrangler-crash.toml`) makes the owner check and record this.
- **Who can read.** Only the owner's Cloudflare account. Any API token that can
  read the bucket is scoped to that one bucket, read only, and named in the
  operator record.
- **Encryption at rest.** Cloudflare R2 encrypts stored objects at rest by
  default. This repository does not configure or verify that.
- **Deletion on request.** A report is deleted by its object name, the
  `<uuid>` of the `CrashID` the user was shown.

## Retention

Crash records are configured to expire after **30 days**.

- The collector sweeps its store directory on each accepted submit and
  removes records older than the window, so it needs no second job.
- The receiver relies on an R2 lifecycle rule over the `crash/` prefix that
  expires objects after 30 days. R2 applies expiry asynchronously, so an object
  is normally gone within about a day after it reaches that age, not at the
  second. The Worker runs no deletion code. A minidump orphaned by a failed
  record write falls under the same rule.
- `worker/crash-r2-lifecycle.json` is a record of the intended rule, in this
  repository's own shape. It is not a file wrangler reads, and the gate checks
  only that file against `RETENTION_DAYS`. The rule that is live is the one the
  owner applies at the deploy runbook step and records, verbatim, in the
  operator record; the bucket's own lifecycle listing is the proof.

No minidump is kept past its window by design. A record that outlives the
window is gone once expiry has run, not archived.

## Throttle

**Collector.** The collector accepts at most **60 submits per rolling 60
seconds** per process (a named rule, a window, a cap). Past the cap it answers
HTTP 200 with `Discarded=throttled_per_minute_cap`. The success status is on
purpose: the client treats it as a soft no and may retry rather than queue a
failure. Rejected submits (malformed, oversized) never consume throttle
budget. Only accepted submits count toward the cap.

**Receiver.** The receiver keeps no throttle counter and never answers
`throttled_per_minute_cap`. A counter inside a Worker is per isolate, so it is
not a rate limit, and a shared one would let one client make every other
client's report be discarded. The rate limit is one Cloudflare zone rule, per
IP, on the `/submit` path: 60 requests per one-minute period (owner ruling
2026-11-03, the same threshold as the events route; retuned after the first
release), recorded at the deploy checkpoint with its threshold and period. The Worker is not reachable on a workers.dev URL, which the zone
rule does not cover.

## Rejection vocabulary

| Input | Status | Body |
|---|---|---|
| Well-formed submit | 200 | `CrashID=<uuid>` |
| Not multipart, no boundary, or a boundary under 3 or over 70 characters | 400 | `Discarded=malformed_wrong_content_type` |
| No part named `upload_file_minidump`, or more than one | 400 | `Discarded=malformed_no_minidump` |
| Over part-count, part-size, or total-body cap | 413 | `Discarded=oversized_body` |
| Past the collector's throttle cap | 200 | `Discarded=throttled_per_minute_cap` |
| Store unwritable or unreachable | 500 | `Discarded=store_unavailable` |

Caps: 16 parts per submit, 8 MiB per part, 20 MiB per whole body. The count of
part delimiters is capped while the body is scanned, so a body of many tiny
sections is refused (413) before they are split. A part whose header block
exceeds 1024 bytes, or whose name exceeds 128 characters, is not read. The part
name is the `name` parameter of the part's `Content-Disposition` header and
nothing else: `filename` is never read as a name.

A request to any path other than `/submit` answers 404. A wrong method on
`/submit` answers 405 with `Allow: POST` (the receiver) or 404 (the collector).
A rejected submit writes nothing: no record and no minidump remain.

The receiver also requires the minidump part to be at least 32 bytes and to
start with the `MDMP` signature, and answers `Discarded=malformed_no_minidump`
otherwise. The loopback collector keeps accepting any bytes in that part.

## Symbols

`mach buildsymbols` writes one `<PKG_BASENAME>.crashreporter-symbols.zip` per
BUILD_TARGET on a reporter-enabled build. The archive suffix derives from
`upstream/toolkit/mozapps/installer/package-name.mk`, and
`scripts/verify-release-symbols.mjs` gates it. The on-disk name carries a
locale, the Gecko version and the platform, so the release workflow renames the
zip to the asset name (`docs/BUILD.md`, Crash symbols per target).

- **Attachment.** Each Release carries one symbols zip per target, as part of
  the DIST-07 asset set, with its versioned and stable names and an entry in
  `SHA256SUMS`. The symbols join the live asset set at the TEL-13 flip.
- **Retention.** The symbols zip is kept for the lifetime of its Release. A
  Release is immutable, so its symbols match the minidumps of that build for
  as long as the Release exists. The 30-day minidump window does not apply to
  symbols.

## Minidump stackwalk runbook

Read a crash report with the symbols of the build that produced it.

1. Find the record. Take the `CrashID` from the user's report, or the
   `<uuid>` from the store. Its `<uuid>.json` names the build in the
   `Version`, `BuildID`, `OS` and `CPUArchitecture` annotations. These exist in
   `upstream/toolkit/crashreporter/CrashAnnotations.yaml`, and Gecko writes
   `OS` and `CPUArchitecture` itself (`nsExceptionHandler.cpp`,
   `RecordPlatformAnnotations`).
2. Find the Release and the target.
   - The `Version` annotation is the Gecko version (`MOZ_APP_VERSION`, for
     example 153.1.0). The asset name carries the tag version (the tag minus its
     `v`, for example 140.12-1), which is a different number. Match them through
     the operator record, which lists for each Release its tag, its `Version`
     and its `BuildID`. A `BuildID` identifies one build.
   - The target token comes from `OS` and `CPUArchitecture`: `Linux` and
     `amd64` is `linux-x86_64`. The other targets are added to this line when
     their tokens are observed (see the asset table in `docs/RELEASING.md`).
     `minidump-stackwalk` also prints the system info of the dump, which
     confirms the pair.
   - The asset is `<app>-<tag version>.<target>.crashreporter-symbols.zip`.
     Worked example for the 140.12-1 Linux release:
     `powerbrowser-140.12-1.linux-x86_64.crashreporter-symbols.zip`. Download it,
     check its line in `SHA256SUMS`, and extract it to a directory.
3. Read the dump:

       minidump-stackwalk <uuid>.dmp <symbols-dir>/ > stack.txt

   Add `--json` for the machine-readable form, and `--pretty` for indented
   frames. Pin the `minidump-stackwalk` version in the operator record.
4. Read `stack.txt`. A frame that shows no symbol name means the symbols
   directory does not match the build: re-check step 2 against the record's
   `BuildID`.

## Operator runbook (downstream collector)

1. Start it: `node scripts/crash-collector.mjs --port 8123 --store <dir>`.
   Records land in `<dir>`; stop with Ctrl-C.
2. Prove the loop: post one synthetic multipart submit to
   `http://127.0.0.1:8123/submit` and expect `CrashID=` back plus a matching
   `<uuid>.json` record in the store dir.
3. Prove the gates: `node scripts/verify-crash-collector.mjs --self-test` and
   `node scripts/verify-worker-submit.mjs --self-test`. A red row names its
   rule; fix the named cause, not the gate.

## Exposure

The collector binds the loopback address (`127.0.0.1`) and has no flag to
change that. Serving a collector beyond the loopback address needs its own
token auth, which is out of scope here, so keep its port off the network.

The receiver is public by necessity: the shipped build must be able to reach
it from any network. It is bounded by construction. The bounds are the zone
rate limit (see Throttle), the size and part caps, the annotation allowlist,
and the absence of any credential: the receiver reads no secret, and the
gate `scripts/verify-worker-submit.mjs` fails any credential-shaped assignment
under `worker/`. The Cloudflare token that deploys it is never in the tree.
