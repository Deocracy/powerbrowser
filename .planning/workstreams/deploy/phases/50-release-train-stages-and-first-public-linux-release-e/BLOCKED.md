# Phase 50 BLOCKED items (50-01, 50-02 executed; 50-03 Task 2 landed and its Task 1 carried by gap plan 50-05; 50-03 Task 3 and 50-04 wait for the owner)

Items that need the owner. Each names what is blocked, why, the owner steps, and what the
executor did instead. Plans continue around them where the plan allows.

## 1. Live facts collector and tracking-issue writer for the release stage (still open)

**Plans:** 50-01 Task 1 (collectFacts), 50-01 Task 2 (run link in the tracking issue).

**Blocked piece:** the read-only collector that fetches the release facts live (release.yml
runs by head_sha, pending deployments, the Release by key, the descriptor contents, the
channel-live conclusion, the issue state), and the tracking-issue body PATCH.

**Why:** the same decision as Phase 43 BLOCKED.md item 3. The train module keeps its no-network
contract, and the live facts source has not been approved. The release-stage states are derived
from normalised live shapes in fixtures only.

**What was done instead:** `releaseFactsFromLive` and the eight states are landed and proven on
fixtures. `dispatch-release` prints the exact run link to the job summary and to the report line.
The tracking issue is not written.

**Owner steps:** approve the read-only live facts source (the list of GET endpoints in
`docs/RELEASING.md`, "Train stages"), then the executor wires a read-only collector step and the
writer, under the exactly-one rule from Phase 43.

## 2. Dispatch token decision (confirm)

**Plan:** 50-01 Task 2 (token choice).

**Decision recorded:** `GITHUB_TOKEN` with `actions: write` on the `dispatch-release` job only.
The bot App holds no Actions scope; a clock App was the alternative.

**Owner step:** confirm the choice, or name the clock App for the dispatch. Nothing has been
dispatched; the first live dispatch happens only after the first bump PR merges (plan 50-04).

**Confirmed 2026-10-31:** `GITHUB_TOKEN` with `actions: write` on the `dispatch-release` job only,
as recorded. Settled by the autonomous run on 2026-10-31 under the owner's instruction to decide
items not needing owner input. No clock App is used for the dispatch.

## 3. Release path not yet able to publish (dependency on Phase 49-05)

**Plans:** 50-01 (the release.yml gates are landed), 50-04 (the owner publish).

**Blocked piece:** `sign-publish` still ends in the `r2_gate` step, which fails closed before the
bot token is minted; `descriptor` and `channel-live` are fail-closed placeholders. A release
dispatched now builds and verifies a draft, then stops by design.

**Owner step:** land plan 49-05 (the R2 copy of each signed MAR) and plan 49-04 (descriptor and
channel-live) before the first live dispatch.

## 4. Owner-only live actions (plan 50-04, not executed)

Not run by instruction. These need the owner, GitHub, Cloudflare or legion:

- merging the bump PR, approving the `release` environment and the `descriptor` environment;
- the clean-room hop drill on legion (`docs/BUILD.md`, "Clean-room drill for a published Release"),
  with `SIGNMAR` set to the signer built from the pinned source;
- the immutable-release probe (REL-02) and the withdraw path in `powerbrowser-updates` (plan
  50-03, not executed).

## 5. Stale guidance in the update-download-host guard (resolved by the Phase 50 review fix, WR-04)

`scripts/verify-update-download-host.mjs` named `release-assets.githubusercontent.com` as an
allowed update host in its failure text, which the owner ruling of 2026-10-29 superseded. The
failure text and the guard's header now send the reader to the write-once MAR origin (the
`mar_origin` host of `configuration.toml [urls]`, derived from the manifest in the message), and
the two `endpoint-allowlist.json` reasons carry the same correction. No owner step remains. The
`control/release-assets-patch.xml` fixture stays green on purpose: this row guards the github.com
half only, and the release drill (`verify-mar-update-hop.mjs`, served release) refuses the
release-assets host in the resolver log.

## 6. Land withdraw.yml and release-probe.yml, then run the probe (plan 50-05 built them; R13 prerequisite)

**Plans:** 50-05 (gap plan for G-50, executed 2026-11-03); 50-03 Task 3 (owner probe).

**Built:** `docs/withdraw.yml` and `docs/release-probe.yml`, the runbook and the verdict line in
`docs/RELEASING.md` ("Withdrawing a release", "The immutable-release probe"), and the quick rows
`withdraw` and `withdraw-self-test`. `verify-descriptor-monotonic` now ignores tags that are not
release keys, so the published `probe-1` Release cannot block the descriptor job.

**Owner steps, in order** (after the repo-controls apply has enabled immutable releases on the
product repository, and before the first release tag):

1. In `powerbrowser-updates`, set the repository variable `BOT_APP_CLIENT_ID` and the repository
   secret `BOT_APP_PRIVATE_KEY` (the PKCS#8 bot App key), and confirm the bot App is installed on
   both `powerbrowser` and `powerbrowser-updates` with contents write.
2. Add both files to `powerbrowser-updates` as `.github/workflows/withdraw.yml` and
   `.github/workflows/release-probe.yml`, byte-identical to the `docs/` copies.
3. From the product checkout:

   ```
   U="$(gh repo view --json nameWithOwner --jq .nameWithOwner)-updates"
   gh workflow run release-probe.yml --repo "$U"
   gh run watch --repo "$U"
   ```

4. Reply with the five `release-probe:` lines. Claude then replaces `pending` in the
   `docs/RELEASING.md` verdict line with the printed verdict, the date and the refusal line, runs
   `scripts/verify-platform.sh --quick`, and closes 50-03 Task 3.

Never delete the `probe-1` Release or its tag. A re-run reuses it.

**Resolved 2026-11-04 (owner answer A3):** the immutable-release probe question is closed. `probe-1` is published as
built: never `latest`, never deleted. The probe itself still runs at the owner pass (steps above); only the open
question "may `probe-1` be published" is answered.
