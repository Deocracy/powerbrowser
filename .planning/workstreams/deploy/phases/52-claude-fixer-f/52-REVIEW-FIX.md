---
phase: 52-claude-fixer-f
fixed_at: 2026-10-31T00:00:00Z
review_path: .planning/workstreams/deploy/phases/52-claude-fixer-f/52-REVIEW.md
iteration: 1
findings_in_scope: 13
fixed: 13
skipped: 0
status: all_fixed
---

# Phase 52: Code Review Fix Report

Scope: CR-01..CR-04, WR-01..WR-07, IN-02, IN-03. IN-01 and IN-04 were not in scope and are not touched.
Commits: 448c07c (gate, CR/WR/IN gate findings), 5c4a931 (52-04 plan note), debac3e (workflows row),
0010787 and 543cfc1 (keep the Gecko tag literal out of the gate, so the pin-agreement row stays green).
The gate findings share commit 448c07c because they are one rewrite of one file that cannot be split without
leaving intermediate commits whose self-test is red.

## Findings

- CR-01 FIXED 448c07c, 5c4a931. Stage 8 still executes tree code; the gate does not claim otherwise. Done: writable links replaced by `cp -a --reflink=auto` copies of upstream/, theia/node_modules and generated/; header states `shortcut: stages 5-8 run fix-controlled code ... must run only in a job with no secrets, no write token and no network beyond fetch, on an ephemeral runner (the 52-04 fix-gate job)`; the requirement is appended to the 52-04 plan's must_haves. Not done: no sandbox wrapper (bwrap/unshare), and a diff that edits powerbrowser/ or theia/ code is not rejected. The isolation is a 52-04 obligation.
- CR-02 FIXED 448c07c. Path set is `git apply --numstat -z` forward and reversed (reverse lists a rename's source) plus `--summary`; after the apply `git status --porcelain=v1 -z --untracked-files=all --ignored` is read and any `!!` path, any type change, and any difference from the pre-apply set is a rejection. `.gitignore`, `.gitattributes`, `.gitmodules`, `generated/**`, `upstream/**`, `theia/node_modules/**`, `flake.nix` added to the deny file; its notes no longer claim completeness. Symlink, submodule, executable and binary changes are rejected. The "executable outside the patch scripts" exemption is moot because scripts/** is denied.
- CR-03 FIXED 448c07c. `**` matches newlines (`s` flag); control, format, private-use, unassigned, non-UTF-8 and non-NFC paths and non-plain relative paths are rejected; the in-memory parser and git must name the same set, so a quoted header is rejected rather than misread.
- CR-04 FIXED 448c07c. The patches/ guard (`touchesPatches`) reads git's set; the in-memory stage 3 loop compares case-insensitively.
- WR-01 FIXED 448c07c. `git add` is gone; the `git status` and `git apply` exit statuses are checked and fail closed.
- WR-02 FIXED 448c07c. An occupied copy target, or a failed copy, is an `[apply]` verdict; ignored/denied paths under upstream/, generated/ and theia/node_modules never reach it.
- WR-03 FIXED 448c07c. `--tag` is the Gecko tag only; `--ref` (default HEAD) is the repo ref. When git's path set holds a patches/ path the gate copies upstream/, resets it to the tag, runs scripts/apply-patches.sh with the diff's patches, then scripts/regenerate-patches.sh --check over that replay. No `--tag`, no upstream/, or no such tag in upstream/ is a rejection (it does not fetch). Verified here against the local upstream at the pinned tag: a hand-edited patch with a forged index line is rejected by the real --check.
- WR-04 FIXED 448c07c. diff-theia-core runs with cwd in the patched worktree; a missing yarn is `[diff-theia-core] yarn is not on PATH ... run the gate inside nix develop .#theia`. In this sandbox yarn is absent, so any diff that clears the earlier stages ends at that verdict.
- WR-05 FIXED 448c07c. The self-test runs the real path-set logic (`git apply --numstat`) and applyAndCheck (`git apply` + `git status --ignored`) in a scratch repo built with the tree's .gitignore (no network), with plants for: ignored file, .gitignore edit, newline in a name, non-ASCII patch name, non-a/b prefix header, symlink, executable, rename away from a denied path, case-folded deny match, empty registry set. Every deny plant needs its own quoted glob in the output (the message now lists all matching entries). A 13-entry FIX-11 floor check, a registry check (every registry file rejected by the registry rule alone, and covered by a deny entry), and a junk-index-line plant are added. The proxy needs a removed/added index pair with a differing hash. Not covered by the self-test: runRealStages itself (worktree, upstream replay, stage 8).
- WR-06 FIXED debac3e. verify-workflows `fixer-tools` tokenises claude_args; refuses bare Edit/Write/MultiEdit/NotebookEdit, globs outside work/ or reaching patches/, Bash/Bash()/Bash(*)/Bash(:*), every entry of space- or comma-separated `--allowedTools`/`--allowed-tools`, `--dangerously-skip-permissions`, `--permission-mode` other than default/plan (bypassPermissions, acceptEdits), `--settings`, `--mcp-config`, `--add-dir`, unknown flags, and `--max-turns` not one integer 1-100; checks every claude step. One plant per refusal.
- WR-07 FIXED debac3e. `fixer-pin` applies to every workflow (triage.yml); `if:` is parsed into top-level `&&` terms and a top-level `||` or a negated group is refused, for the fixer and for the workflow_run guard; `fixer-debug` reads env in any form and run/with text.
- IN-02 FIXED 448c07c. `--tag` and `--ref` must be plain ref names (`validRef`), checked before any git call; the pass line says "HEAD of the gate checkout" when no `--ref` was given.
- IN-03 FIXED 448c07c. Decision: reject. Deny and registry matching is case-insensitive, so a path that case-folds onto a deny match is a match; header notes the gate is still meant for Linux runners.

## Verification

Run in this clone (the Gecko-free sandbox has no yarn):

- `node scripts/verify-fix-gate.mjs --self-test`: PASS, 37 plants red, 3 controls green.
- `node scripts/verify-workflows.mjs --self-test`: PASS, 87 plants red, 7 controls green.
- `scripts/verify-platform.sh --only fix-gate-self-test`, `--only workflows`, `--only workflows-self-test`, `--only zizmor`: PASS.
- `scripts/verify-platform.sh --quick`: exit 0, "verify-platform: PASS -- all checks passed".
- The reviewer's planted diffs, recreated under /tmp/claude-1000/rv52/, run through the real gate (`node scripts/verify-fix-gate.mjs --diff=...`): traditional-header `.claude/` file, traditional-header `.github/workflows` file, `.gitignore` edit plus hidden workflow, newline-in-name, quoted non-ASCII patch name (with and without a preceding benign file), `upstream/zz.txt`, symlink, an ignored `objdir/` file: all rejected at `[path]`. The two code-execution plants (TheiaService.sys.mjs, telemetry-sender.ts) are not rejected by any path rule (CR-01 is a job-isolation obligation); here they stop at the missing-yarn verdict, before stage 8, and no payload ran.

---

_Fixed: 2026-10-31_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
