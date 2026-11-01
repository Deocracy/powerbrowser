---
phase: 44-trust-path-b
plan: 04
subsystem: docs
tags: [mar-signing, key-ceremony, key-rotation, secrets-inventory, verification-map, SEC-09, SEC-05]
status: complete

requires:
  - phase: 44-02
    provides: build-update-xml and build-update-xml-self-test registry rows
  - phase: 44-03
    provides: descriptor-monotonic and descriptor-monotonic-self-test registry rows
  - phase: 44-01
    provides: "NOT YET RUN: the secondary ceremony output (DER, SHA256, regenerated patch 030, ng065 fifth case). Placeholders stand in for it."
provides:
  - docs/RELEASING.md five-place SEC-09 rewrite (ceremony, rotation, secrets inventory, verification map, stage-plan index)
affects: [44-01 completion (owner fills the placeholders), phase 49/50 (--rollback-to; the release.yml signing-key change the runbook names as open)]

actuals:
  tokens: 3587      # chars/4 over the added lines of the realized diff (14347 chars)
  tasks: 5
  commits: 5

commits: 5
plan_head_before: 9c777bc0deb5e38715a0f60a2337fa0707202ee7
plan_head_after: caf08cc5ddb7126353923605936293c37766f4f5

tech-stack:
  added: []
  patterns:
    - "Ceremony output not yet produced is written as an italic 'recorded at the ceremony' placeholder, never a fake value"

key-files:
  created: []
  modified:
    - docs/RELEASING.md

key-decisions:
  - "Both keys carry two mandatory offline .p12 copies; the primary stanza gains a catch-up step for a primary ceremony run while the copy was optional"
  - "The rotation runbook names an open gap instead of hiding it: release.yml signs with nickname powerbrowser-mar and verifies against mar-primary.der, so neither a transition run nor a secondary-key run is possible until the workflow can name the signing key for one run"
  - "The secondary .p12 enters no environment until a rotation; dual-signing would first add named release rows"
  - "The verification map gains an ng065-mar-signature-enforced row (a registered full row) rather than folding ng065 into the mar-sign-self-test row"

requirements-completed: []  # SEC-09 docs are written, but the ceremony fields it names stay placeholders until the owner runs 44-01. SEC-05 belongs to 44-01.

duration: 26min
completed: 2026-11-01
---

# Phase 44 Plan 04: RELEASING.md SEC-09 rewrite Summary

**docs/RELEASING.md now documents both MAR key ceremonies (legion, NSS databases mar-key/ and mar-secondary/, nicknames, DER export, patch 030 regeneration, two mandatory offline .p12 copies per key), a five-step rotation runbook, the owner procedure that sets MAR_SIGNING_P12_B64, and verification-map rows for build-update-xml, descriptor-monotonic and ng065. Ceremony outputs are placeholders because 44-01 has not run.**

## Performance

- Started: 2026-11-01T05:21:24Z
- Completed: 2026-11-01T05:47Z
- Tasks: 5 of 5
- Files modified: 1

## Task Commits

1. Task 1, ceremony second stanza and two-copy mandate: `d4c63c76`
2. Task 2, rotation runbook: `089a2fdd`
3. Task 3, secrets inventory procedure: `d1990127`
4. Task 4, verification-map rows: `099f957f`
5. Task 5, stage-plan index cleanup: `caf08cc5`

## The five edited places (line ranges at HEAD caf08cc5)

1. Ceremony and custody, `docs/RELEASING.md:675-772` (section heading through the custody paragraph). Also the operator-table row at line 248, which carried the same "optional .p12" wording.
2. Key rotation, `docs/RELEASING.md:1280-1334`.
3. Secrets inventory, `docs/RELEASING.md:941-942` (the two `release` secret rows) and `:946` (the offline-media row).
4. Verification map, `docs/RELEASING.md:1521` (mar-sign-self-test pointer) and `:1523-1526` (four new rows).
5. Stage-plan index row 3, `docs/RELEASING.md:1699`.

To get exact hunks, run `git diff 9c777bc0 caf08cc5 -U0 -- docs/RELEASING.md`.

## Copy-rule evidence per touched stanza

- **Ceremony.** Names PowerBrowser in its opening paragraph and in step 4 of the patch-030 procedure. It contains no password, `.p12` bytes or `key4.db` contents. Media appear only as `<medium-1>` and `<medium-2>`, with no location. Each instruction ends with its next step: re-run the export and compare the SHA256 line, re-run `regenerate-patches.sh --check`, delete a stray file and re-run `ls -l`.
- **Rotation.** Names PowerBrowser twice. Each of the five steps ends with a "Next step:" sentence: open the `release` approval, run `--only descriptor-monotonic`, cut the next release, run the hop drill, retire the old media. The open gap also ends with a next step.
- **Secrets inventory.** No secret value or base64 blob appears. The two commands pipe from the medium and from `password.txt` straight into `gh secret set`, and each row ends with a `gh secret list --env release` confirmation.
- **Verification map and stage index.** These are operator rows, not user-facing strings. The upstream error-code names `CERT_VERIFY_ERROR` and `MAR_CHANNEL_MISMATCH_ERROR` appear in operator prose. They were already in the old rotation paragraph and are not user-facing UI copy.

## Lines the owner fills after 44-01

1. `docs/RELEASING.md:735`: primary key ceremony date, replacing `_recorded at the ceremony_`.
2. `docs/RELEASING.md:736`: dates of the two primary `.p12` copies. Make the copies first with the catch-up step at lines 704-706 if the primary ceremony made fewer than two.
3. `docs/RELEASING.md:737-738`: secondary key ceremony date and the dates of its two `.p12` copies.
4. `docs/RELEASING.md:739`: the 64-hex `mar-secondary.der` SHA256 from the 44-01 resume-signal.
5. `docs/RELEASING.md:759-760`: delete the "Until these four steps run, patch `030` points both slots at `mar-primary.der`..." sentence once 44-01 Task 2 has regenerated patch 030 with the secondary slot line.
6. `docs/RELEASING.md:1290-1291` (rotation) and the end of the `ng065-mar-signature-enforced` row at `:1526`: delete "The fifth case lands with the tracked `mar-secondary.der`; until then the row runs the first four" once 44-01 Task 3 lands. Also confirm that the env var name `PB_MAR_SECONDARY_DB` in that row matches what Task 3 actually ships.

No `--quick` check asserts any of these values. No check reads the ceremony record, the DER SHA256 or the ng065 row text.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The operator table at line 248 still called the .p12 backup optional.**
- Found during: Task 1
- Fix: reworded the row to name both ceremonies and two mandatory copies of each key. It sits outside the five places, but leaving it would contradict the mandate.
- Commit: `d4c63c76`

**2. [Rule 2 - Correctness] The rotation runbook states an open release.yml gap.**
- Found during: Task 2
- Issue: the plan's runbook steps assume the pipeline can sign a transition release with the old key. `release.yml` hard-codes nickname `powerbrowser-mar` and verifies against `powerbrowser/packaging/mar/mar-primary.der`. Step 2 commits the new certificate into that file, so the verify step would refuse an old-key signature. The secondary-key path fails on the nickname.
- Fix: a labelled "Open: the signing job pins the primary key" paragraph, plus a pointer to it in the stage-index cell. No workflow was edited, because `.github/` is outside this plan.
- Commit: `089a2fdd`

**3. [Plan line numbers stale]** The plan cited lines 364-392, 531-545, 760-771, 827-852 and 985-987. The file has grown to 1744 lines, so every place was located by heading instead.

### Not done

- Task 4's verify cites `--only releasing-maintenance`. That label is not in the registry (`unknown --only label`), so the fallback, `--quick`, ran. The verification map documents a `releasing-maintenance` row and a `mar-sign-self-test` row, and neither is registered. The registry has `mar-signature-self-test`. This mismatch existed before this plan and was left alone.

## Verification

- Acceptance greps: `mar-secondary` 21, `powerbrowser-mar-secondary` 9, `PB=$HOME` 2, `no rotation runbook` 0, `One key fills both` 0, `rollback-to` 1, `build-update-xml` 4, `descriptor-monotonic` 5, `secondary-only` 2, `^| Row | Stage |` 1, optional-.p12 lines 0.
- `node scripts/scan-brand-residue.mjs`: PASS before every commit.
- `scripts/verify-platform.sh --quick`: **FAIL in this worktree, for environmental reasons only.** The same six rows go red with `docs/RELEASING.md` at its pre-plan state, and that baseline was run in this worktree before any commit:
  - `single-copy-deps`, `ng086-theia-react-node`: `theia/node_modules` is a symlink, and both walks refuse symlinks (`lstat`).
  - `gui07-strip-spike-verdict` and its self-test: `diff-theia-core.sh` calls `yarn`, which is not on the host PATH.
  - `gui09-dependent-window-content` and its self-test: the built `theia/applications/browser/lib/frontend/secondary-window.html` is absent from this worktree.
  - `fixer-isolate-self-test` failed once, as the known flake, and PASSed when rerun alone with `--only`.
  - `generated/` was missing at first. `node scripts/generate.mjs` created it (gitignored), which cleared about 40 prerequisite reds.
  - No row went red because of this plan's edits.

## Self-Check: PASSED

- `docs/RELEASING.md` exists and carries the edits.
- Commits d4c63c76, 089a2fdd, d1990127, 099f957f and caf08cc5 are ancestors of HEAD.
