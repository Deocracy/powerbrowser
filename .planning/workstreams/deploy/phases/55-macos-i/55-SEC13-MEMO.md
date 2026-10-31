# SEC-13 record: macOS inputs checked before any Phase 55 build

Status: recorded 2026-10-31 by the plan 55-01 executor from the agent shell.
Owner reads that supersede any row below are listed at the end.

Rule: no Phase 55 build runs before this record exists (SEC-13, a record-before-build gate). This
memo is the record. Every position below carries its read source, the verbatim excerpt or the
observed fetch outcome, the position taken, and the read date. No version, date or licence sentence
here was invented: where a source could not be read, the section says so.

Read method: `curl` GET requests only, no credential, no write. The GitHub and crates.io reads were
made with a descriptive User-Agent. The owner's Apple account was not touched.

## 1. Apple SDK licence position for Linux cross builds

Read attempts (2026-10-31):

| URL | Outcome |
| --- | --- |
| https://www.apple.com/legal/sla/ | HTTP 200. The index page lists product licences by link. It contains no Xcode or Command Line Tools licence text and no link to one. |
| https://www.apple.com/legal/sla/docs/xcode.pdf | HTTP 200, but the body is Apple's "Page Not Found" HTML, not a PDF. |
| https://www.apple.com/legal/sla/docs/xcode16.pdf and xcode15.pdf | HTTP 404 (not-found page). |
| https://developer.apple.com/xcode/terms/ | HTTP 200. Navigation shell only. No licence, SDK or redistribution text in the page body. |

Observed: the licence text governing the macOS SDK package (CLTools_macOSNMOS_SDK.pkg, fetched by
`upstream/taskcluster/scripts/misc/unpack-sdk.py` from swcdn.apple.com) was not obtained. The
mechanism is known from the tree: `unpack-sdk.py` verifies sha512 and `macos-sdk.yml` carries the
URL. The mechanism says nothing about whether the licence permits a cross build on a non-Apple host.

Position taken: UNSETTLED. Under plan 55-01's rule, Linux cross builds proceed only through the
recorded fallback while the licence position is unsettled. Concretely:

- Local engineering builds on legion may run, and they are not published.
- No release artifact that embeds SDK-derived bits is published until the owner reads the licence
  text and records the position (owner read below).
- The recorded fallback is the native build on a hosted `macos-26` runner. It is used if the owner's
  read returns "no", and it is the path for any release build if the read is not recorded in time.

This position does not clear the Linux cross build for release.

Owner read required: open the Xcode and Command Line Tools licence (the text shown at install time
or on the Apple developer download page), quote the clause on redistribution and use on non-Apple
hardware, and record the verdict in this section with the date.

## 2. rcodesign maintenance status and version

Read sources (2026-10-31):

- https://api.github.com/repos/indygreg/apple-platform-rs/releases (GitHub API, HTTP 200). Newest
  release: `apple-codesign/0.29.0`, published `2024-11-29T19:06:12Z`. Previous: `apple-codesign/0.28.0`,
  published `2024-11-03T15:27:22Z`.
- https://api.github.com/repos/indygreg/apple-platform-rs (HTTP 200). Default branch `main`, not
  archived, `pushed_at` `2026-10-17T14:52:30Z`, open issues 120 (issues and pull requests combined).
- https://crates.io/api/v1/crates/apple-codesign (HTTP 200). `max_version` `0.29.0`, `newest_version`
  `0.29.0`, the 0.29.0 entry created `2024-11-29T18:58:33Z`, not yanked.

Observed: the newest published release of the `apple-codesign` crate and the rcodesign binary is
0.29.0, dated 2024-11-29. That is about 23 months before this read. The repository has commits
after that release (last push 2026-10-17) but has cut no release since 2024-11-29.

Position taken: 0.29.0 is the version this phase pins for the Linux signing path, with the
`mach macos-sign --use_rcodesign` wrapper unchanged. The position is conditional on two things:

- The pin is re-read at the owner checkpoint. A newer release supersedes 0.29.0 only through a
  recorded re-read.
- The hosted Apple tools (`codesign` and `notarytool` on `macos-26`) stay the fallback, as PKG-14
  records. A maintenance stall or a signing defect routes signing to them.

## 3. Developer ID CA expiry

Read source: https://www.apple.com/certificateauthority/ (2026-10-31, HTTP 200). Verbatim excerpt
from the Apple certificate authority list, Developer Authentication section:

> Developer ID - G1 (Expiring 02/01/2027 22:12:15 UTC)
> Developer ID - G2 (Expiring 09/17/2031 00:00:00 UTC)

Position taken: the two Developer ID intermediate CAs expire on 2027-02-01 (G1) and 2031-09-17 (G2).
A leaf certificate cannot outlive the CA that issued it. So a Developer ID Application certificate
issued under G1 is bounded by 2027-02-01, and one issued under G2 by 2031-09-17. Which CA issues the
owner's certificate is decided by Apple when the certificate is created. It is recorded at the owner
checkpoint, from the certificate's chain, not assumed here.

The renewals tracker carries this date as a row of `docs/RENEWALS.md` (item "Apple Developer ID CA,
G1"). That row is owned by the Phase 42 renewals text. The date is taken from Apple's page, so its
confidence is the confidence of that read, not a LOW estimate.

## 4. Assumptions absorbed (CONTEXT 55-CONTEXT.md)

- A1, Phase 47 live site and updates host. Absorbed through indirection: the per-target descriptors
  cite the host and path only through the shared `buildUpdateXml` emitter and the download-copy gate.
  No second mechanism is added.
- A2, Phase 50 `release.yml` and descriptor conventions. Absorbed: a future `build-macos` job follows
  the `build-*` and `matrix-*` names and `contents: read`, as the `workflows` row enforces. No second
  mechanism is added.
- A3, Phase 41 controls and the `workflows` row. Absorbed: the tag ruleset, the five environments with
  branch policy `main`, and the `workflows` row hold as written. No second mechanism is added.

## 5. Locked decisions this record relies on

- D-77 (owner Decision 1): no `schedule:` in the product repo. Plan 55-01 touches no workflow file, so
  D-77 holds by construction.
- Owner Decision 10 (signing timing): Apple enrolment waits until the site is live and a D-U-N-S
  number exists. Every Apple account step is an owner action, recorded in BLOCKED.md.
- Owner Decision 11 (build-job hand-off): artifacts pass between the legion build and the hosted sign
  job, and legion keeps `contents: read`. No signing material is placed on legion.
- Owner Decision 18 (descriptor gate): the `descriptor` environment keeps the owner as required
  reviewer. Nothing in Phase 55's plan 55-01 changes it.

## 6. Owner reads that supersede this record

These need a person, and the executor did not attempt them:

1. Apple SDK licence text: the verdict in section 1, with the quoted clause and the date.
2. Developer ID certificate: the CA (G1 or G2) that issued the owner's certificate, from the chain.
3. rcodesign: a re-read of the release page at the owner checkpoint. A release newer than 0.29.0
   changes section 2.
