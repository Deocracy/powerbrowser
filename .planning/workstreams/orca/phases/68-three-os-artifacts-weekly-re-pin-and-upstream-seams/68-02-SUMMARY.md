---
phase: 68-three-os-artifacts-weekly-re-pin-and-upstream-seams
plan: 02
subsystem: infra
tags: [orca, re-pin, release-train, rebase-orca, workflows, overlay, typecheck, auto-merge, OVL-02]
status: lane complete; the real-tree replay, the first live tick, the bump PR and the owner's review are deferred (68-06 and the end pass)

requires:
  - phase: 62-01
    provides: "orca-overlay/ (seams.json, patches/), apply-patches.sh and regenerate-patches.sh --upstream/--patches, rows orca-overlay and orca-overlay-built"
  - phase: 60
    provides: "scripts/fetch-orca.sh (REMOTE= line, TAG/COMMIT exports), scripts/build-orca.sh, verify-orca-slotless-start.mjs"
provides:
  - "scripts/rebase-orca.sh: the Orca re-pin replay (full, --replay-only, --self-test)"
  - ".github/workflows/rebase-orca.yml: the replay definition, stage and notices outputs, the rebase-orca-notices artifact"
  - "release-train.yml: repin-orca input, sweep-clock orca-due, detect-orca, rebase-orca, bump-pr-orca, the report stop issue"
  - "release-train.mjs orcaDue and --orca-due; detect-upstreams.mjs selectOrca and --orca-select"
  - "verify-orca-slotless-start.mjs --orcad-only, exported pairWebTab and deriveMarker behind an entry-point guard"
  - "rules: verify-upstream-pins.mjs (rebase-orca.yml), verify-workflows.mjs orca-repin"
  - "row rebase-orca-self-test (quick)"
  - "docs/RELEASING.md ### Orca re-pin (OVL-02)"
affects: [68-01, 68-03, 68-04, 68-06]

plan_head_before: 142d6212
actuals:
  tasks: 3
  commits: 4

key-files:
  created:
    - scripts/rebase-orca.sh
    - .github/workflows/rebase-orca.yml
  modified:
    - .github/workflows/release-train.yml
    - scripts/release-train.mjs
    - scripts/detect-upstreams.mjs
    - scripts/verify-upstream-pins.mjs
    - scripts/verify-workflows.mjs
    - scripts/verify-orca-slotless-start.mjs
    - scripts/verify-platform.sh
    - docs/RELEASING.md

key-decisions:
  - "A-P1 kept: the bump set carries THIRD-PARTY-NOTICES.txt from the rebase-orca-notices artifact (owner may reject; revert steps are in RELEASING.md)"
  - "The stage is the first 'rebase-orca: FAIL -- ' line, not the first 'FAIL -- ' line: a composed script's own FAIL line (apply-patches.sh) prints first"
  - "SKIP is red except the licence-allowlist SKIP for an absent upstream/ (the Gecko tree the Orca replay never fetches)"
  - "bump-pr-orca branches from github.sha (the tree rebase-orca gated), as bump-pr and bump-pr-node do, not origin/main"

requirements-completed: [OVL-02]
---

# 68-02 SUMMARY: the weekly Orca re-pin

The release train can now move the Orca pin to the newest Orca tag once a week. A green
replay opens a bump PR with auto-merge armed. A red replay stops and opens one tracking
issue for a human. The proof is hermetic fixtures. No hosted run has exercised the new
jobs: that waits until Chris pushes main.

## Commits (branch ServerDestroyer/p68-02)

- d5e3381b feat(68-02): rebase-orca replay with a fixture self-test and its workflow (Task 1)
- 7dacc1b6 feat(68-02): replay stops, replay-only mode, orcad-only probe, orcaDue and --orca-select (Task 2)
- 34b58025 feat(68-02): release-train Orca re-pin wiring, workflow rules, RELEASING.md (Task 3)
- this SUMMARY

## Stages and the self-test

`scripts/rebase-orca.sh --tag T --commit C` runs these stages in order: pin-move, fetch,
seam-apply `<patch>`, build, typecheck:web, typecheck:node, typecheck coverage, row `<label>`
(orca-build-shape, orca-overlay, orca-overlay-built, orca-mobile-protocol,
licence-allowlist, orca-mobile-skew), orcad-only start, notices and brand scan. Each stage
is a function that takes the PowerBrowser root plus the generate and package-run
functions. The self-test calls the same functions on a file:// fixture Orca repository
and a fixture root. The fixture root holds a copy of fetch-orca.sh with its REMOTE line
rewritten, uses the real apply-patches.sh and regenerate-patches.sh, and uses stand-ins
for the rest. No environment variable selects the fixture.

`bash scripts/rebase-orca.sh --self-test` output (each plant is followed by a fresh control run, which is green each time):

```
  ok control -> green: v1.0.2 (...) replayed: 1 seam(s) regenerated, typecheck clean, 6 rows green
  ok seam conflict -> stopped at seam-apply 010-fixture-seam.patch does not apply onto v1.0.2. ...
  ok type error -> stopped at typecheck:web src/a.ts:3. ...
  ok overlay file outside both programs -> stopped at typecheck coverage extra/x.ts is in neither typecheck program. ...
  ok overlay file inside a program (coverage is not vacuous) -> green
  ok brand token -> stopped at brand scan found residual brand strings after the replay. ...
  ok changed LICENSE -> stopped at row licence-allowlist exited 1. ...
  ok row prints SKIP -> stopped at row orca-overlay skipped: orca-overlay: SKIP -- no built thing. ...
  ok upstream/ SKIP is out of scope -> green
  ok probe prints SKIP -> stopped at orcad-only start skipped: orca-slotless-start: SKIP -- no built orca/ (fixture)
  ok replay-only -> changed exactly configuration.toml orca-overlay/patches/010-fixture-seam.patch orca-overlay/seams.json
rebase-orca self-test: PASS -- 7 planted faults each stopped at its named stage
```

The script prints 18 lines that start with `  ok`. Each fixture stand-in leaves an
untracked `ran-<stage>` file, so if `--replay-only` reached the build, a typecheck, a row,
the probe, the notices step or the brand scan, git status would show that file and the
exact-set comparison would go red. Bad arguments exit 2 (`--tag 1.4.255 --commit 0`).
Against the current orca-overlay, typecheck coverage prints that it is vacuous at this
pin, because the overlay has no files yet.

Live checks in the lane (run under flock on pb-live.lock with ORCA_* unset):
- `nix develop .#orca --command node scripts/verify-orca-slotless-start.mjs --orcad-only`
  on the lane's built orca/ (v1.4.248) printed: `PASS -- orcad half only: orcad 1.4.248 ready on ws://127.0.0.1:<port>, Node 24.19.0 (node-runtime.json), 1 Node runtime, orcad and terminal daemon reaped; web-tab pairing not run (--orcad-only)`.
  The output contains no ready line, pairing URL or token.
- `tsc --listFilesOnly -p config/tsconfig.tc.web.json` and `-p config/tsconfig.node.json`
  run from the built orca/ in about 4 s each and print absolute paths. This confirms the
  coverage stage's mechanism on the real tree.
- `detect-upstreams.mjs --orca-select` on a real `git ls-remote --tags` listing selected
  `v1.4.256` with its bare sha. v1.4.256 is a lightweight tag, while v1.4.248 is annotated
  and has a `^{}` line. Orca publishes both tag shapes, and the selector handles both.

## Rows

Task verification rows, all green on the lane: rebase-orca-self-test,
verify-upstream-pins (18 plants), verify-upstream-pins-self-test, workflows,
workflows-self-test (5 new orca-repin plants), orca-slotless-start-self-test (4 new
cases), release-train-logic-self-test (a new Orca tick control: Monday first sweep,
Tuesday after a missed Monday, same-week second sweep, both sides of the 2026 ISO year
boundary, null last sweep, two CLI lines), detect-upstreams-self-test (8 Orca selector
cases), sweep-reads, sweep-reads-self-test, dispatch-release, dispatch-release-self-test,
watchdog, watchdog-self-test, labels, labels-self-test, withdraw, withdraw-self-test,
renovate-config, renovate-config-self-test, release-train-maintenance-self-test, orca-pin
and orca-pin-self-test.

`--quick` compared with the Setup baseline (.mozbuild/p68-02/baseline.txt, taken before
theia/ was installed):
- New reds: `scan-brand-residue` and `scan-brand-residue-self-test` only. The self-test's
  clean `--extra-root` control is red for the same unclaimed Orca probes. This is the
  expected brand red.
- 51 rows that were red at baseline are now green. They were red only because theia/
  had no js-yaml; the lane ran `yarn install --frozen-lockfile --ignore-scripts` in
  theia/, which is an ignored path.

## Brand rows the coordinator must add (inventory/brand-tokens.json was not edited)

`node scripts/scan-brand-residue.mjs --report .mozbuild/p68-02/brand-report.md` on the
staged lane tree. Condition 4 lists probe hits in files that no row claims yet. The
counts are by matched text and must be re-measured on the merged tree:

| File | `orca` | `Orca` | `ORCA` |
|---|---|---|---|
| scripts/rebase-orca.sh (new) | 162 | 12 | 3 |
| .github/workflows/rebase-orca.yml (new) | 16 | 9 | 0 |
| .github/workflows/release-train.yml | 122 | 38 | 9 |
| scripts/verify-workflows.mjs | 61 | 7 | 10 |
| scripts/detect-upstreams.mjs | 23 | 23 | 7 |
| docs/RELEASING.md | 38 | 13 | 0 |
| scripts/release-train.mjs | 19 | 4 | 0 |
| scripts/verify-upstream-pins.mjs | 14 | 13 | 9 |

The held-back rows also drift in files that are already claimed
(verify-orca-slotless-start.mjs, verify-platform.sh): "Orca" goes from 497 to 501, "orca"
from 1050 to 1061 and "orcad" from 684 to 718. The scope of the Orca rows needs the eight
files above added, and every row needs its count re-measured once lanes 01, 03 and 04
have merged.

## Deviations

1. **Stage line prefix** (correctness). apply-patches.sh prints its own
   `apply-patches: FAIL -- ...` line before the replay's line. A stage step copied byte
   for byte from rebase-upstream.yml would report that line. rebase-orca.yml therefore
   matches `^rebase-orca: FAIL -- `, and so does the self-test.
2. **One SKIP exemption** (correctness). licence-allowlist prints
   `SKIP -- upstream/ absent` on any runner without the Gecko tree, and that includes
   rebase-orca.yml's runner. If every SKIP were red, every hosted replay would stop at
   `row licence-allowlist skipped`. `SKIP_OUT_OF_SCOPE` exempts only that line. The
   self-test proves the exemption with a green case and proves that any other SKIP is red.
3. **Bump base**: bump-pr-orca uses `git switch -C chore/orca-$TAG "$BASE"` with
   BASE=github.sha, which is the tree rebase-orca gated, as bump-pr and bump-pr-node
   already do. The plan said origin/main.
4. **pin-move with a stale orca/**: when orca/ is at the current pin and not at the target,
   the replay removes it, because fetch-orca.sh would otherwise refuse it. If orca/ is at
   any other commit, the replay refuses with "orca/ exists at <sha>; the replay runs on a
   fresh checkout". If orca/ is already at the target, it is kept.
5. **Report issue writer**: a small gh step in report creates, edits or reopens the issue
   by exact title. It matches only issues written by the job token or by OWNER_LOGIN. It
   does not use trackingPlan, which is keyed by release key. The dry-run print and the
   live write are separate steps, as the dry-run-gate rule requires.
6. **verify-workflows orca-repin applies when the job exists.** Several self-test controls
   use a synthetic release-train.yml that has no Orca jobs, so a rule that required the
   jobs to exist would turn those controls red.
7. The selector fixtures use v2.7.x tags. The pinned tag literal in a fixture made
   orca-pin red, because configuration.toml is the one carrier.

## Owner decisions (recorded, not asked)

- **A-P1** (planner amendment, kept): the bump carries THIRD-PARTY-NOTICES.txt from the
  `rebase-orca-notices` artifact, which must hold exactly that file. It is copied with
  `cp --remove-destination`, and the App token is minted after the copy. To reject A-P1:
  make the notices stage a stop when the file changed, drop the path from the bump's
  `git add` line and from verify-workflows.mjs's expected set. RELEASING.md lists the steps.
- **SKIP exemption** (deviation 2): Chris may prefer to fetch upstream/ in rebase-orca.yml,
  about a 1.1 GB clone, and remove the exemption.

## Merge note for the coordinator

Merge this lane last, after 03, 04, 01, 10, 07 and 09 and before 08. The registry block
sits at the quick anchor after `orca-service-live-self-test`. After the merge, run
`nix develop .#orca --command bash scripts/rebase-orca.sh --tag <current orca_tag> --commit <current orca_commit>`
on the merged tree as the identity re-pin (68-06 Task 1). The rows orca-mobile-protocol
and orca-mobile-skew, and the `--write-orca` mode of generate-licensing.mjs, exist only
after lanes 03 and 04 merge. Until then, the real replay stops at
`row orca-mobile-protocol` or at `notices`. The first live weekly tick, the first bump PR
with auto-merge, and the owner's approving review are deferred verification for the
end-of-milestone pass. Add the brand rows above on the merged tree.

## Not done in the lane

- The real-tree full replay was not run. It needs the lane 03 and 04 rows (68-06 Task 1).
- No push, workflow dispatch, secret-store write, ruleset change or signing was done.
- STATE.md, ROADMAP.md, REQUIREMENTS.md, WINDOWS.md, brand-tokens.json, the ledger,
  orca-overlay/ and orca/ were not edited.
