---
phase: 57-native-crash-reporting-k
fixed_at: 2026-10-31T00:00:00Z
review_path: .planning/workstreams/deploy/phases/57-native-crash-reporting-k/57-REVIEW.md
iteration: 1
findings_in_scope: 12
fixed: 12
skipped: 0
status: all_fixed
---

# Phase 57: Code Review Fix Report

One line per finding. `--disable-crashreporter` is still in all four committed mozconfigs; crash reporting is enabled nowhere.

- WR-01 FIXED 1a5de68c (name read as its own Content-Disposition parameter, header and name length caps, duplicate minidump refused, record stores only known part names; Worker and collector)
- WR-02 FIXED 1a5de68c and b49be18b (delimiter count capped while scanning, boundary 3..70 characters, Worker body held once; b49be18b sizes the read buffer from arriving bytes, not from Content-Length, so a request declaring the cap and sending a few bytes allocates 64 KiB; a gate plant measures the largest buffer built)
- WR-03 FIXED c1c95a67 (custom-domain route with a placeholder hostname, runbook ordered bucket, privacy check, lifecycle, zone rule, hostname, deploy, probes; RELEASING.md row mirrors it; gate pins route, order and the r2.dev step)
- WR-04 FIXED 5fc19f8d (Sensitivity and access section: process memory, memory_report dropped, private bucket, token scope, encryption at rest, deletion by object name)
- WR-05 FIXED 5fc19f8d (consent bullets recast as TEL-13 requirements; states the consent read is fail-open today, B1, and no reporter-enabled build ships; MOZ_CRASHREPORTER_AUTO_SUBMIT and autoSubmit2 recorded as TEL-13 prerequisite B6 in BLOCKED.md, not locked now because a locked pref moves the generated prefs bytes and the env var is not a pref)
- WR-06 FIXED 45987945 (DIST-07 names come from verify-release-asset-set --expected, every asset table row is a token or marked pending, SHA256SUMS coverage read from release.yml, draft comparison and ten plants run through runChecks)
- WR-07 FIXED 1a22ce92 (Platform replaced by OS and CPUArchitecture, allowlist derived against CrashAnnotations.yaml; runbook maps Version and BuildID through the operator record and the target from OS and CPUArchitecture; BUILD.md records the PKG_BASENAME locale/version/platform rename, and the gate requires it)
- WR-08 FIXED 7f3b25ce (twelve one-line mutations of a mkdtemp copy of the Worker each go red naming their rule; battery adds filename-before-name, long names, long header, two minidumps, 1-character boundary, delimiter flood, record-shape assertion, both store-fault orders)
- WR-09 FIXED ee4e6087 (one CRASH_REPORTER_ENABLED constant; the disable line is emitted exactly while it is off; enabling with no [urls].crash_report fails generation; self-test plant; generate --check byte-identical)
- IN-01 FIXED 219680d6 (userinfo refused by the schema pattern with a plant; REBRANDING.md states that only the origin is the submit address and the receiver serves no view page)
- IN-02 FIXED 29586d0c in the Worker only (32 bytes and the MDMP signature; the loopback collector keeps accepting any bytes because verify-ng-068 posts a random-bytes dump to it and may not be edited)
- IN-03 FIXED d6960e6e (retention worded as configured with asynchronous expiry; lifecycle JSON marked a record of intent, not wrangler's schema, which was not verified offline)

## Verification

Run in the main clone of this branch (not an isolated worktree): every touched script's `--self-test`, `node scripts/generate.mjs --check` (68 files match) and `--self-test` (71 plants), `verify-platform.sh --only` for crash-collector, crash-submit, release-symbols and theia-endpoints (and their self-test rows), then `scripts/verify-platform.sh --quick` exit 0.

WR-02 peak memory, 18 MiB body of `\r\n--abc` (413) and of `\r\n--a` (400 up front), node child process, harness RSS: 144 MiB each, of which about 100 MiB is the node baseline plus the harness's own copy of the body; the reviewer's case measured 596-736 MiB before the fix. The gate asserts at most 32 MiB over the same body refused up front.

## Follow-up (coordinator request after the first pass)

- PARSER-CRLF FIXED (commit recorded in git log as "fix(57): stop the multipart parser eating CRLF data bytes"): the trailing-CRLF strip is removed from both parsers. The CRLF before a delimiter belongs to the delimiter (RFC 2046) and the split already consumes it, so a part's bytes are exactly as sent. Plants: a minidump ending in CRLF is stored with an identical sha256 (Worker gate, with a mutation plant that restores the strip, and a collector self-test case), and an empty minidump part is now refused by the explicit 32-byte/MDMP rule (the Worker mutation plant for that rule names `empty minidump`). verify-ng-068 is untouched and green.

---

_Fixed: 2026-10-31_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
