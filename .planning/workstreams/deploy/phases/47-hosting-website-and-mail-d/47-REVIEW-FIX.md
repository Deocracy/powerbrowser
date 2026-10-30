---
phase: 47-hosting-website-and-mail-d
fixed_at: 2026-10-30T03:32:57Z
review_path: .planning/workstreams/deploy/phases/47-hosting-website-and-mail-d/47-REVIEW.md
iteration: 1
findings_in_scope: 10
fixed: 8
partial: 0
skipped: 2
status: partial
---

# Phase 47: Code Review Fix Report

**Fixed at:** 2026-10-30T03:32:57Z (WR-02 completed in a later pass; see its entry)
**Source review:** .planning/workstreams/deploy/phases/47-hosting-website-and-mail-d/47-REVIEW.md
**Branch:** dsh/phase-47
**Working copy:** /home/chris/gsd-workspaces/deploy/dsh/phase-47 (edits and commits made directly on the branch; no worktree, as directed)
**Iteration:** 1

**Summary:**
- Findings in scope: 10 (WR-01 to WR-05, IN-01 to IN-05)
- Fixed: 8 (WR-01, WR-02, WR-03, WR-04, WR-05, IN-01, IN-04, IN-05)
- Skipped: 2 (IN-02, IN-03, skipped by instruction)

**Gate state:** `scripts/verify-platform.sh --quick` exits 0 (PASS). The full-tier `website-publish-ready` row (WR-04) is red by design until the placeholders are filled. The full-tier `updates-repo-static` live row (IN-01) is red until the owner pushes the updates tree.

## Fixed Issues

### WR-01: NO_UPDATE regex is unanchored and passes malformed descriptors

**Files modified:** `scripts/verify-release-identity.mjs`, `scripts/verify-platform.sh`
**Commit:** 295a0bf
**Applied fix:** `NO_UPDATE` now matches the whole file: an optional XML prolog, one empty updates element (`<updates></updates>` or `<updates/>`), then nothing else. Six self-test plants went red naming the descriptor: a comment-wrapped fragment, a wrapper element, an empty updates element with a truncated tail, an empty updates element with an unterminated update element, junk around `<updates/>`, and the earlier truncated-prefix case. The real placeholder `updates-staging/default/Linux_x86_64-gcc3/update.xml` stays green. The self-test pass line now counts its cases.

### WR-02: Privacy page lists the superseded MAR host and omits the R2 origin

**Files modified:** `powerbrowser/endpoint-allowlist.json`, `scripts/verify-privacy-hosts.mjs` (new), `website-staging/privacy.html`, `scripts/verify-platform.sh`
**Commits:** f5759cf (the first derive-and-compare check), 4022fda (trigger key on four allow rows), 6ec94cc (the two-list page and check)
**Applied fix:**
- Four allow rows gained `"trigger": "user-feature"`: api.anthropic.com, api.openai.com, open-vsx.org and openvsx.eclipsecontent.org. Their disposition stays `allow`, because the sidecar's extension-install download is checked unattended by the locked verify-ng-069 script, and `user-initiated` would turn that check red. Before the commit, every reader of the allowlist was checked for an unknown-key rejection: the allowlist-schema check reads only host, disposition and reason; the doc-consistency check, verify-theia-endpoints, verify-webextensions, verify-endpoints.sh, the shared verdict library and the read-only verify-ng-069 static check read only host and disposition or do a presence test. None rejects an extra key, so no reader was changed. The four rows' existing self-tests and the schema, doc-consistency, theia-endpoints and webextensions rows all pass.
- `website-staging/privacy.html` has two lists. The first, "Hosts the browser may contact without your action", holds the 11 allow rows without a trigger. The second, "Hosts contacted only after you use a feature", holds the four user-feature rows, in plain language (AI chat after an API key is added and a request is sent; the extension catalogue when an extension is searched for, installed or updated). The text carries no internal identifiers. Each host code carries `data-unattended-host` or `data-feature-host`, so the error-field list on the page is never parsed as hosts.
- `privacy-hosts` derives both sets and compares each to its list as a separate set equality, naming each host on one side only. It also fails on an allow row with an unknown trigger value. Real-tree result: PASS, 15 hosts in both lists.
- `privacy-hosts-self-test` plants, per list: an extra page host, a missing page host, an allowlist addition and an allowlist removal. It also plants a feature host listed in the unattended list, an allow row with an unknown trigger, and a page with no marked host. All 11 plants go red naming their host, attribute or trigger. The self-test baseline is a fixture built from the derived sets, so it does not depend on the real page.
- The page itself was not swapped to `downloads.powerbrowser.org`, per instruction.

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

## Skipped Issues

### IN-02: updates-repo-static self-test never drives ghGet

**Reason:** Skipped by instruction.

### IN-03: Relative .html links trigger an extra redirect on Pages

**Reason:** Skipped by instruction.

## Verification

- Each fix ran its own check and self-test before committing. Each commit was staged with explicit paths and committed with a pathspec, so no other staged file could join it.
- `scripts/scan-brand-residue.mjs` ran after each new file was staged, and again before the WR-02 commits. It passed every time, most recently over 431 scanned files.
- The self-test of each new or changed check was run through the registry with `--quick --only`: `privacy-hosts-self-test`, `website-publish-ready-self-test`, `legal-page-verbatim-self-test`, `release-identity-self-test` and `updates-repo-static-self-test` all PASS. `privacy-hosts` (the real-tree row) also PASSES.
- `scripts/verify-platform.sh --quick` exit 0 (PASS) after the WR-02 commits.
- `website-publish-ready` (full tier) fails by design: three placeholder markers remain.
- `updates-repo-static` (full tier, live read) fails: the GitHub repository `DeBIOS-Foundation/powerbrowser-updates` is empty (HTTP 409). This was red before this change and is not affected by it. Its self-test is green.
- Where verification ran: every gate ran in the clone at /home/chris/gsd-workspaces/deploy/dsh/phase-47 on branch dsh/phase-47. No worktree was created. Numbers are reproducible from that checkout.
- Untracked files not committed: `.planning/workstreams/deploy/config.json` and `47-REVIEW.md`, which were untracked before this run.
- Forbidden paths were not touched: `ledger/` and `scripts/verify-ng-*.mjs` (the verify-ng-069 script was read, never edited or run). No commit message contains that word.

---

_Fixed: 2026-10-30T03:32:57Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
