---
phase: 49-release-pipeline-and-legion-runner-e
plan: 04
reviewed: 2026-10-31T00:00:00Z
depth: standard
diff_base: aa11e1ee
files_reviewed: 6
files_reviewed_list:
  - .github/workflows/release.yml
  - scripts/verify-channel-live.mjs
  - scripts/verify-update-download-host.mjs
  - scripts/verify-platform.sh
  - powerbrowser/packaging/package-linux.sh
  - scripts/verify-mar-update-hop.mjs
findings:
  critical: 3
  warning: 5
  info: 4
  total: 12
status: issues_found
---

# Phase 49 Plan 04: Code Review Report

**Reviewed:** 2026-10-31
**Depth:** standard
**Files Reviewed:** 6
**Status:** issues_found

## Summary

Scope: commits c953d2f5, 1f675e39, c57f1fb0 and b0c5bd63 (aa11e1ee..HEAD). I re-checked each claim against the
source. Three behaviours were reproduced by running them:

- `bash -c 'set -euo pipefail; echo "x $(false)"'` exits 0.
- A crafted descriptor passes the form gate while `parseUpdateXml` returns a different URL.
- `channel-live --self-test` (13 ok lines) and `update-download-host --self-test` (8 ok lines) are green.

These parts hold:

- The token is minted after every gate, and it is scoped to contents:write on one repository.
- The manifest's `mar_origin`, `update_channel` and `update_url` are compared claims, and the tree decides them.
- The BUILD_TARGET allowlist runs before any request, and every segment is URI-encoded.
- The loopback transport is reachable only through `overrides`, and the form check runs on the URL as written.
- The `package-linux.sh` extraction gives `Linux_x86_64-gcc3` and the baked URL on the real `objdir-release`.
- The registry rows are in the correct tiers: the self-test is in the quick array (before line 5303), and the live row is inside `QUICK -eq 0`.

Three defects stop the descriptor job from working:

- A failed Contents API PUT is swallowed, so the job goes green.
- Two gaps already recorded in BLOCKED.md mean the job can never reach the commit on the normal path. They are unshipped behaviour, so they are BLOCKERs here, not footnotes.

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: A failed descriptor PUT is swallowed and the descriptor job goes green

**File:** `.github/workflows/release.yml:721` (also 709-713)
**Issue:** `echo "committed $REL to $REPO at $(gh api "${PUT[@]}" --jq .commit.sha)"` runs the write inside a command
substitution that is an argument to `echo`. `set -e` does not fire on a failed substitution in a simple command's
arguments, so the step's status is `echo`'s status, which is 0. I reproduced this. A 409 (stale `sha` after a concurrent
write), a 403 or 404 (the token does not reach the repo, see WR-05) or a 422 prints `committed ... at ` with an empty SHA,
and the job succeeds without committing anything. The read path makes this worse. The GET at 709 treats any `HTTP 404`
as "file absent", and GitHub also returns 404 when the token cannot see the repo. So a mis-scoped token takes the
"create" branch, the PUT fails, and the job is still green.
**Fix:**
```bash
COMMIT="$(gh api "${PUT[@]}" --jq .commit.sha)"   # assignment: set -e fires on failure
[[ "$COMMIT" =~ ^[0-9a-f]{40}$ ]] || { echo "::error::$REL was not committed to $REPO; no commit SHA returned" >&2; exit 1; }
echo "committed $REL to $REPO at $COMMIT"
```
Before the loop, also prove the token can reach the repo, for example with `gh api "repos/$REPO" --jq .full_name`. Then a 404 on a file can only mean the file is absent.

### CR-02: descriptor-monotonic fails on every published Release, because release-manifest.json is never a Release asset

**File:** `.github/workflows/release.yml:668` (with 539, 549; `scripts/verify-descriptor-monotonic.mjs:268-269`; `scripts/verify-platform.sh` full-tier row `channel-live`)
**Issue:** sign-publish creates the Release from `assets/*`. `verify-release-asset-set.mjs` then requires the exact derived
set, and that set has no `release-manifest.json`. sign-publish then sets `--draft=false`. `verify-descriptor-monotonic.mjs`
iterates every non-draft Release and pushes "carries no release-manifest.json asset" for any Release without one. That
includes the Release this same run just published. So the gate at 668 is red on every run, and no descriptor can ever be
committed. The full-tier `channel-live` row runs without `--manifest` and reads that same asset (`verify-channel-live.mjs:299-302`),
so the daily sweep can never go green either. This is recorded in BLOCKED.md as a known gap, but the job as shipped does not work.
**Fix:** Add `release-manifest` to the expected asset set in `verify-release-asset-set.mjs`, and copy
`release/release-manifest.json` into `assets/` before `gh release create`. Drop or rename the `host` field first,
because it names the build machine. A smaller alternative is to have descriptor-monotonic skip the Release whose tag
equals the manifest key in this run. That fixes the job, but the sweep still cannot derive its values.

### CR-03: The artifacts expire before the descriptor job can start

**File:** `.github/workflows/release.yml:187, 202` (consumed at 619-629 and 740-744)
**Issue:** `release-linux` and `release-linux-identity` both use `retention-days: 1`. The descriptor environment carries a
1440-minute wait timer plus owner approval, so on the normal path the job starts at least 24 hours after build-linux
uploaded the artifacts. Both `download-artifact` steps then fail. The job fails closed, but only an owner bypass of the
canary wait inside the retention window can make it pass, and that defeats DIST-09's canary. BLOCKED.md records this,
and it remains a functional break.
**Fix:** Set `retention-days: 3` (or more) on both artifacts the descriptor and channel-live jobs read. Alternatively,
read the manifest from the Release (CR-02) and upload `config.status` and `application.ini` as data with a retention
that covers the wait plus an approval window.

## Warnings

### WR-01: The form gate checks a different URL than the one the parser, the live fetch and Gecko read

**File:** `scripts/verify-channel-live.mjs:181-187, 353-359`; `scripts/verify-mar-update-hop.mjs:175-183`
**Issue:** `descriptorFormProblems` extracts URLs with the greedy `/<patch\b[^>]*\bURL="([^"]*)"/g`, which takes the last
`\bURL="` in the tag. `parseUpdateXml` uses the unanchored `URL="` and takes the first match, including inside
`data-URL=` or `XURL=`. I reproduced this.
`<patch URL="https://evil.example/x.mar" data-URL="<origin>/<tag>/<asset>" .../>` passes the form gate (one checked URL,
`null` problems), while `parseUpdateXml(xml).url` is `https://evil.example/x.mar`. The live row then sends HEAD and GET
to that URL, and Gecko would fetch it. A `<patch XURL="...">` with no real `URL` makes the gate pass vacuously. The DIST-08
claim that "every patch URL" is checked therefore does not hold for the value that is actually used.
**Fix:** Run `patchUrlForm` on the parsed value, and require one `URL` attribute per patch with a boundary-anchored match:
```js
const p = parseUpdateXml(text);
if (p === null) return [`${label} does not carry the descriptor shape. ...`];
const urls = [...text.matchAll(/<patch\b[^>]*?(?:^|\s)URL="([^"]*)"/g)].map(m => m[1].replace(/&amp;/g, '&'));
if (urls.length !== (text.match(/<patch\b/g) ?? []).length || !urls.includes(p.url)) return [`${label} patch URL attributes are ambiguous`];
```
Also anchor `attr()` in `parseUpdateXml` on `(?:^|\s)${name}="`. Add a self-test plant with a decoy `data-URL`.

### WR-02: The channel-live self-test never plants several checks that are must-haves

**File:** `scripts/verify-channel-live.mjs:437-447, 478-537`
**Issue:** The fake `get` serves the updates-repo copy from the same `xmlFile` the loopback serves publicly, so the
byte-equal check at 345-347 can never go red. Delete it and the self-test stays green. The plan's must-have truth
("each public update.xml to byte-equal its repo copy") is therefore unproven. These checks are also never planted:

- No published Release (404, lines 283-285). This is the fail-closed path the summary relies on.
- The latest tag differs from `release_key` (322-324).
- appVersion or buildID differs from the manifest (354-355).
- The offered version differs from the latest Release (356-358).

CLAUDE.md requires each check to have a plant that goes red naming the drift.
**Fix:** Give `get` a plantable repo copy, for example `reset(xml, withMar, repoXml = xml)`. Add plants for:

- A one-byte repo-copy difference.
- `get` returning `{ ok: false, status: 404 }` for `releases/latest`.
- `tag_name: 'v0.0.0-1'`.
- A descriptor with a different `buildID`.
- A descriptor with a different `displayVersion`.

### WR-03: channel-live runs right after the commit, before the Pages deploy and edge cache can serve it

**File:** `.github/workflows/release.yml:727-762`; `scripts/verify-channel-live.mjs:335-347`
**Issue:** channel-live starts as soon as descriptor succeeds. The updates host is Cloudflare Pages, built from a push to
`powerbrowser-updates` (docs/RELEASING.md:65, 254), so the deploy takes tens of seconds to minutes. The edge can also
keep serving the previous `update.xml`. The row makes one GET with no retry, so a correct release will often report
"not byte-equal" or 404 on its first run. The failure text even says "wait for the host deploy", but nothing waits.
**Fix:** In the live row, poll the public descriptor with a bounded backoff (for example 10 tries over 5 minutes) until it is byte-equal to
the repo copy, then run the remaining checks once. Or add a wait-until step in the job before the row. Keep the
final verdict fail-closed.

### WR-04: The verifier exemption covers whole files (185 of them), and no plant proves that other scripts are still scanned

**File:** `scripts/verify-update-download-host.mjs:62, 107, 169-171, 194-203`
**Issue:** `VERIFIER = /^scripts\/verify-[^/]*\.mjs$/` skips all 185 tracked `scripts/verify-*.mjs` files outright, not
just their self-test fixtures. Production derivations in those files escape the guard. Examples:
`verify-mar-update-hop.mjs`, which builds the drill's `servedMarUrl`, and `verify-homebrew-cask.mjs:100`/`verify-winget-manifest.mjs:242`,
which build github.com download URLs. A future verifier that emits a github.com or release-assets URL as an update source would pass. The
plan's `fails_when` also lists "a non-verifier script carrying the github form goes green". None of the four plants is a
non-verifier `.mjs` script, so that half of the rule is unproven.
**Fix:** Narrow the exemption to the fixture regions. For example, skip only the lines between `function selfTest(` and
its closing brace, or only the lines carrying a `// fixture` marker. Alternatively, keep the file pattern and add a plant
`scripts/build-planted-descriptor.mjs` carrying the github form in update context. That plant must go red.

### WR-05: The token scope and the commit target are derived separately

**File:** `.github/workflows/release.yml:695, 703`
**Issue:** The App token is scoped to the literal `repositories: powerbrowser-updates`, and the owner defaults to the
workflow repo's owner. The commit loop writes to `"$GITHUB_REPOSITORY-updates"`. They agree today
(`Deocracy/powerbrowser`). After a rename, a transfer or a rebranded fork they diverge, and every GET is a 404 ("absent").
Combined with CR-01, every PUT failure is then a green job. Two independent derivations of one value are the drift
pattern CLAUDE.md warns against.
**Fix:** Derive one value and use it in both places, for example `repositories: ${{ github.event.repository.name }}-updates`
with `owner: ${{ github.repository_owner }}`. If the literal must stay for the acceptance grep, add a guard step before
the mint: `[ "${GITHUB_REPOSITORY#*/}-updates" = powerbrowser-updates ] || exit 1`.

## Info

### IN-01: Untrusted manifest values are echoed raw into `::error::` lines

**File:** `.github/workflows/release.yml:638, 679-680, 755-756`
**Issue:** `jq -r` writes a JSON string with embedded newlines verbatim. A manifest value such as
`"x\n::add-mask::...\n::stop-commands::tok"` reaches the runner's command parser through `echo ... >&2`. The step exits 1
immediately afterwards, so the impact is limited to log manipulation. The JS side escapes with `show()`, and the shell side does not.
**Fix:** Print the values with `jq -c` / `@json`, for example `M_ORIGIN_SHOWN="$(jq -c '.mar_origin' ...)"`, or refuse any
value that contains a control character before echoing it.

### IN-02: The treeAuthority comment states the opposite of what the code does

**File:** `scripts/verify-channel-live.mjs:229-230`
**Issue:** "update_url is checked only when the caller reads it (the live row); --form-only never fetches". In fact
`formOnly` passes the whole manifest doc, and package-linux.sh always writes `update_url`, so the comparison also runs
in the descriptor job's pre-commit gate. That is fail-closed and harmless, but the summary also says "the descriptor job
never reads update_url".
**Fix:** Correct the comment, or pass `{ ...manifestDoc, update_url: undefined }` from `formOnly` if the descriptor job is really not meant to judge it.

### IN-03: The manifest-versus-tree agreement exists three times

**File:** `.github/workflows/release.yml:672-681, 748-757`; `scripts/verify-channel-live.mjs:208-232`
**Issue:** The same mar_origin and update_channel comparison is pasted into two shell steps, and `treeAuthority` repeats
it in the next step of each job (`--form-only` and the live row). The copies already differ: the shell copies do not check
`update_url`, and they print `unset` where the JS prints `null`. If node fails inside `< <(...)`, `read` hits EOF and
`set -e` exits without any `::error::` line.
**Fix:** Delete both shell steps. `verify-channel-live.mjs` already refuses a disagreeing manifest by name, before any
commit or request.

### IN-04: GitHub's other signed asset host is not named

**File:** `scripts/verify-update-download-host.mjs:60`
**Issue:** `RELEASE_ASSETS` matches only `release-assets.githubusercontent.com`. GitHub has also issued expiring signed
asset URLs on `objects.githubusercontent.com`. The positive form gate in channel-live catches any host other than the
origin, so this affects only the static guard.
**Fix:** `/https?:\/\/(?:release-assets|objects)\.githubusercontent\.com\//i`, plus one plant.

---

_Reviewed: 2026-10-31_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
