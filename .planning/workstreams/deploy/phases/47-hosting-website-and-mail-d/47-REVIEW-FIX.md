---
phase: 47-hosting-website-and-mail-d
fixed_at: 2026-10-30T03:32:57Z
review_path: .planning/workstreams/deploy/phases/47-hosting-website-and-mail-d/47-REVIEW.md
iteration: 1
findings_in_scope: 10
fixed: 7
partial: 1
skipped: 2
status: partial
---

# Phase 47: Code Review Fix Report

**Fixed at:** 2026-10-30T03:32:57Z
**Source review:** .planning/workstreams/deploy/phases/47-hosting-website-and-mail-d/47-REVIEW.md
**Branch:** dsh/phase-47
**Working copy:** /home/chris/gsd-workspaces/deploy/dsh/phase-47 (edits and commits made directly on the branch; no worktree, as directed)
**Iteration:** 1

**Summary:**
- Findings in scope: 10 (WR-01 to WR-05, IN-01 to IN-05)
- Fixed: 7 (WR-01, WR-03, WR-04, WR-05, IN-01, IN-04, IN-05)
- Partial: 1 (WR-02: check committed, real-tree row red on four hosts, owner decision needed)
- Skipped: 2 (IN-02, IN-03, skipped by instruction)

**Gate state:** `scripts/verify-platform.sh --quick` exits 1. The only failing row is `privacy-hosts` (WR-02). Its cause is recorded under WR-02 below. The full-tier `website-publish-ready` row (WR-04) is red by design until the placeholders are filled.

## Fixed Issues

### WR-01: NO_UPDATE regex is unanchored and passes malformed descriptors

**Files modified:** `scripts/verify-release-identity.mjs`, `scripts/verify-platform.sh`
**Commit:** 295a0bf
**Applied fix:** `NO_UPDATE` now matches the whole file: an optional XML prolog, one empty updates element (`<updates></updates>` or `<updates/>`), then nothing else. Six self-test plants went red naming the descriptor: a comment-wrapped fragment, a wrapper element, an empty updates element with a truncated tail, an empty updates element with an unterminated update element, junk around `<updates/>`, and the earlier truncated-prefix case. The real placeholder `updates-staging/default/Linux_x86_64-gcc3/update.xml` stays green. The self-test pass line now counts its cases.

### WR-03: legal.html links two files that are not in the staged site

**Files modified:** `website-staging/legal.html`
**Commit:** e0dca84
**Applied fix:** Both relative links now point at the public repository: `https://github.com/DeBIOS-Foundation/powerbrowser/blob/main/LICENSING.md` and `https://github.com/DeBIOS-Foundation/powerbrowser/blob/main/THIRD-PARTY-NOTICES.txt`. The link text is unchanged.

### WR-04: Unfinished placeholder text and an unconfirmed asset name ship in publishable pages

Scope note: the review's asset-name half (download.html, the stable asset name and repo path) was not in the instruction and was not changed. Only the placeholder gate was added.

**Files modified:** `scripts/verify-website-publish-ready.mjs` (new), `scripts/verify-platform.sh`, `docs/RELEASING.md`
**Commit:** 7189db1
**Applied fix:** New full-tier row `website-publish-ready` fails while any `website-staging/*.html` page carries `OWNER TO FILL` or `class="pending"`. It also fails on an empty site. A quick-tier row `website-publish-ready-self-test` plants each marker and an empty site over a clean fixture. The clean fixture keeps a CSS `.pending` selector, which must stay green. `docs/RELEASING.md` now requires the row green before the website push, in the website section and in the push row. Current live result: three markers remain (`download.html:76`, `privacy.html:75` twice), so the full row is red as intended.

### WR-05: Website copy is not tied to the manifest

**Files modified:** `scripts/verify-legal-page.mjs` (new), `scripts/verify-platform.sh`
**Commit:** 21565e7
**Applied fix:** New quick row `legal-page-verbatim` reads the `[legal]` values through `generate.mjs` `resolveConfig`: `license`, `copyright_holder` and `trademark_notice`. It requires each value verbatim in `website-staging/legal.html`. The row's `vendor` in the finding maps to `[legal] copyright_holder`. The self-test edits one value per key and requires each edit to go red naming its key. Limit: `copyright_holder` (`DeBIOS Foundation`) is a substring of the trademark sentence, so the holder check passes whenever the trademark sentence is intact. Substring matching cannot separate the two. Recorded here rather than hidden.

### IN-01: updates-repo-static goes green on a non-empty repo that serves nothing

**Files modified:** `scripts/verify-updates-repo-static.mjs`, `scripts/verify-platform.sh`
**Commit:** e7e1b66
**Applied fix:** The same tree read must now also contain `_redirects` and at least one `*/update.xml` path. Two new self-test plants go red naming `_redirects` and `/update.xml`. The live full-tier row is unchanged in its read; the new presence requirements apply to the same listing.

### IN-04: Stale source-of-truth instruction for the privacy page

**Files modified:** `docs/RELEASING.md`
**Commit:** 42fe355
**Applied fix:** The reports-bug-error-crash row now names `website-staging/privacy.html` as the source. No other reference to `docs/PRIVACY.md` remains in `docs/`, `scripts/` or `website-staging/`.

### IN-05: Payload field names appear in user-facing copy, and the licence wording is inconsistent

Scope note: the review's first half (keep the payload keys, add plain-language glosses) was judged already satisfied and was not changed. Only the spelling was in the instruction.

**Files modified:** `website-staging/legal.html`
**Commits:** d62696f (spelling), 8e7383c (follow-up that restores one space the first commit dropped before the LICENSING link). The branch was not amended, per the commit rule, so IN-05 has two commits.
**Applied fix:** `licence` is now `license` throughout the legal page: the heading, the body sentence and the third-party sentence. The verbatim manifest line `License: PolyForm Noncommercial 1.0.0` was already in that spelling and is unchanged.

## Partial

### WR-02: Privacy page lists the superseded MAR host and omits the R2 origin

**Status:** partial. The check is committed and its self-test passes. The real-tree row is red, and the cause needs an owner decision.
**Files modified:** `scripts/verify-privacy-hosts.mjs` (new), `website-staging/privacy.html`, `scripts/verify-platform.sh`
**Commit:** f5759cf
**Applied fix:** New quick row `privacy-hosts` derives the set of `allow` hosts from `powerbrowser/endpoint-allowlist.json`, excludes IPv4 and IPv6 loopback literals, and compares it as a set with the hosts marked `data-unattended-host` in `website-staging/privacy.html`. The page text is unchanged; only the marker attribute was added to each host code, so the error-field list on the same page is never parsed as hosts. The self-test uses a fixture built from the derived set, so it does not depend on today's drift. It plants an extra page host, a missing page host, an allowlist addition, an allowlist removal and a page with no marked host, and each goes red naming its host or attribute. The page itself was not swapped to `downloads.powerbrowser.org`, per instruction.

**Open (blocks the quick gate):** The real-tree `privacy-hosts` row fails on four hosts. Each has `disposition: "allow"` in the allowlist, yet its reason text begins "User-initiated (NG-069, R15)" and describes contact only after a user action:
- api.anthropic.com
- api.openai.com
- open-vsx.org
- openvsx.eclipsecontent.org

The page does not list them, which matches their reasons. Under the file's own comment, `allow` means "may be contacted unattended", so the derivation reads them as unattended. These two readings cannot both hold. Two ways to resolve it, neither applied here:
1. Retag the four entries to `user-initiated`. This matches their reasons and the UPD-33 disposition. It changes what layer 3 and the NG-069 layer-4 probe enforce, and those scripts were not in scope to re-verify.
2. List the four on the privacy page. This states unattended contact that their reasons say does not happen, so it is not recommended.

Option 1 is the cleaner fix, and it is an allowlist policy change, so it was not applied.

## Skipped Issues

### IN-02: updates-repo-static self-test never drives ghGet

**Reason:** Skipped by instruction.

### IN-03: Relative .html links trigger an extra redirect on Pages

**Reason:** Skipped by instruction.

## Verification

- Each fix ran its own check and self-test before committing. Each commit was staged with explicit paths and committed with a pathspec, so no other staged file could join it.
- `scripts/scan-brand-residue.mjs` ran after each new file was staged. It passed every time, most recently over 431 scanned files.
- The self-test of each new or changed check was run once through the registry with `--quick --only`: `privacy-hosts-self-test`, `website-publish-ready-self-test`, `legal-page-verbatim-self-test`, `release-identity-self-test` and `updates-repo-static-self-test` all PASS.
- `scripts/verify-platform.sh --quick` exit 1. Only `privacy-hosts` fails, for the reason under WR-02. The baseline before these changes was exit 0.
- `website-publish-ready` (full tier) fails by design: three placeholder markers remain.
- `updates-repo-static` (full tier, live read) fails: the GitHub repository `DeBIOS-Foundation/powerbrowser-updates` is empty (HTTP 409). This was red before this change and is not affected by it. Its self-test is green.
- Where verification ran: every gate ran in the clone at /home/chris/gsd-workspaces/deploy/dsh/phase-47 on branch dsh/phase-47. No worktree was created. Numbers are reproducible from that checkout.
- Untracked files not committed: `.planning/workstreams/deploy/config.json` and `47-REVIEW.md`, which were untracked before this run.
- Forbidden paths were not touched: `ledger/` and `scripts/verify-ng-*.mjs`. No commit message contains that word.

---

_Fixed: 2026-10-30T03:32:57Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
