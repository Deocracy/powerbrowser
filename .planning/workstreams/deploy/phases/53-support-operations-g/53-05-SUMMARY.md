---
phase: 53-support-operations-g
plan: 05
gap_closure: true
gap: G-cmd (Codeberg half)
status: complete
requirements: [GH-04]
key-files:
  modified:
    - .planning/workstreams/deploy/phases/53-support-operations-g/BLOCKED.md
commits: [eedbc6e0]
---

# 53-05 summary: Codeberg mirror setup commands (G-cmd, 53-REVIEW IN-05)

- BLOCKED.md item 2 now carries the root command block for legion: the token is read from the
  terminal into `/etc/codeberg-mirror/mirror-push` (umask 077, mode 0600); a bare repository is
  created with `git init --bare --initial-branch=main /var/lib/codeberg-mirror/powerbrowser.git`;
  remotes `origin` = `https://github.com/Deocracy/powerbrowser.git` and `codeberg` =
  `https://codeberg.org/Deocracy/powerbrowser.git`; `credential.https://codeberg.org.username`
  and a get-only `credential.https://codeberg.org.helper` that prints
  `password=$(cat "$CREDENTIALS_DIRECTORY/mirror-push")`.
- It states what systemd does on the first start (`DynamicUser=yes` + `StateDirectory=`): moves
  the directory to `/var/lib/private/codeberg-mirror`, symlinks it, and chowns it to the dynamic
  user, so git needs no `safe.directory` entry. The root-side SHA read uses
  `git -c safe.directory='*'` for that one command.
- Step 4 gives the first-start and check commands (status, ownership, local and Codeberg main SHA,
  timer list). Step 5 gives the live check with `--slug=Deocracy/powerbrowser` and the
  `CODEBERG_MIRROR` repository variable command for the Phase 51 sweep (owner write, not run).
- systemd/codeberg-mirror.service is unchanged.

## Deviation

- Task 2 (append `--slug=Deocracy/powerbrowser` to the `codeberg-mirror-live` registry row) was
  dropped. The literal made `scan-brand-residue` red (`scripts/verify-platform.sh:6280: Deocracy`,
  plus 55 reconciliation failures and the self-test control). The row keeps reading
  `CODEBERG_MIRROR`; BLOCKED.md gives that form. The plan was amended in the same commit.

## Verification

- `node scripts/generate.mjs`: no change under generated/. `scripts/verify-platform.sh --quick`:
  323 PASS, only `fixer-isolate-self-test` red (known sandbox red).
