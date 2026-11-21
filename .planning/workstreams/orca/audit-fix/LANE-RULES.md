# Audit-fix lane rules (v1.7)

You are one fix lane in the remediation of the v1.7 code and security audit
(`.planning/workstreams/orca/v1.7-CODE-SECURITY-AUDIT.md`). Your prompt names one brief in
`.planning/workstreams/orca/audit-fix/briefs/`. Fix the items in that brief and nothing else.

The owner's instructions for this remediation (2026-11-21): fix every confirmed finding; where a
fix changes product behaviour or overturns a recorded owner decision, apply the fix the audit
suggests and list the change so he can review or revert it; merge into the v1.7 branch without
pushing.

## 1. Setup

1. You work in your own git worktree. Run `git rev-parse --show-toplevel`. If it prints
   `/home/chris/orca/workspaces/Power-Browser/v1.7-Orca-integration`, stop and report: that is the
   integration worktree and lanes must never edit it.
2. Run `git reset --hard <BASE>` with the commit your prompt gives. Your worktree is new, so
   nothing is lost.
3. Run `bash .planning/workstreams/orca/audit-fix/provision-lane.sh`. Add `--with-objdir` only if a
   check you must run reads `objdir/`.
4. Build once so `lib/` matches your sources:
   `nix develop .#theia --command bash -c 'cd theia && yarn build:extensions'`.

Build facts:

- `yarn` works only inside `nix develop .#theia`. `node` works outside it.
- One extension: `nix develop .#theia --command bash -c 'cd theia && yarn --cwd extensions/<name> build'`.
- `powerbrowser/shell/*.sys.mjs` has no compile step. `node --check <file>` checks its syntax.
- Never run `./mach build`, never launch the browser, never run a live row (a `*-live.mjs` script
  without `--self-test`), and never run anything that needs a display, the Claude sign-in or a
  network install.
- Never write outside your worktree. Never touch the integration worktree, another worktree,
  `upstream/`, `orca/` (third-party checkouts) or `generated/` by hand.

## 2. What you may edit

- The files your brief lists as owned, and new files you create.
- **Product lanes** (group names starting with G): do not edit an existing file under `scripts/`
  unless your brief owns it, and never edit `scripts/verify-platform.sh`. You may add new check
  scripts as new files. You do not register them; you request registration in your result record.
- **Harness lanes** (group names starting with H): do not edit product code (`powerbrowser/`,
  `theia/`, `orca-overlay/`, `.github/`, `systemd/`, `docs/`) unless your brief owns the file.
- A group that your prompt says runs after you: you may edit its files when one of your items
  cannot be fixed otherwise. Say so in your record.
- If a fix needs a file that some other group owns, make the part that is in your files and
  record the rest under Handoffs with the exact change needed.
- Never edit `ledger/`. Never edit a ledger-locked test: `scripts/verify-ng-*.mjs`,
  `scripts/verify-release-shape.mjs`, `scripts/verify-worker-submit.mjs`. If an item needs a change
  in one, do not make it. Record it under Needs owner with the exact diff you propose. Running a
  locked test is fine.
- Never edit `.planning/WINDOWS.md`, `.planning/workstreams/orca/DECISIONS.md`, a PLAN, SUMMARY,
  VERIFICATION, REVIEW or SECURITY file, or the audit report. Your result record is the only
  `.planning` file you write, unless your prompt names another.
- Patches under `patches/` and `orca-overlay/patches/` are regenerated from a patched tree, never
  text-edited (see CLAUDE.md).

## 3. For each item

1. **Re-read the cited code in your worktree first.** The tree has changed since the audit: GUI
   review fixes were merged at `ad2f901a`, and earlier lanes' fixes may be in your base. If the
   defect is gone, or the finding is wrong, record `not-applicable` with file:line evidence.
2. **Fix it minimally and correctly.** The suggested fix is a starting point. If it is wrong, or a
   smaller correct fix exists, do that and say why in the commit body. Do not refactor around it.
3. **Behaviour changes.** Where the fix changes what the product does for the user, or overturns
   an owner decision the item cites, apply it and add a line under Behaviour changes: what changed,
   which decision it touches, and how to revert (the commit).
4. **Plausible items.** Confirm the code path. If the defect is real at the code level, fix it as
   defence in depth even though one runtime step is unproven, and say so.
5. **If you cannot produce a correct fix inside your files, do not guess.** Record `not-fixed`
   with the reason and what would be needed.
6. **Give the fix a check that goes red without it** (CLAUDE.md, Verification):
   - Product lanes: add the assertion to a new static script `scripts/verify-<topic>.mjs` (one per
     topic is enough; no browser, no display). It derives its expectation from the tree and has a
     `--self-test` that plants the pre-fix fault and requires red, naming the drift.
   - Harness lanes: the fixed check itself gains a self-test plant that proves it can now fail in
     the case the finding describes.
   - For a copy, comment or document fix where a check would be artificial, write
     `no-check: <reason>`.
   - Never assert on the absence of a line your own instrumentation emits. Never hand-keep an
     expectation list the tree could give you.
7. **Verify.** Build or syntax-check what you touched. Run your check and its self-test. Run the
   existing checks that read the files you touched (`grep -n '<file name>' scripts/verify-*.mjs
   scripts/verify-platform.sh` finds them).
8. **Commit.** One commit per item, or one per tightly coupled set of items. Stage explicit paths
   (`git add -- <paths>`). Never use `git add -A`, `git commit -a`, `--amend`, `stash`, `rebase`
   or `push`. Message: `fix(<area>): <what changed> (<item ids>)`, a body of one to three lines
   saying why, and the Co-Authored-By trailer for your model.

Standing project rules that are easy to break here:

- The brand-residue scan reads `git ls-files`: stage a new file before you trust a green scan,
  and never spell the originating product's name anywhere.
- No internal identifier in user-facing text: no pref key, sentinel, port, timeout or raw
  exception message. Every user-facing error names the product as "PowerBrowser", states the
  problem plainly and ends with a next step that is a real control on screen.
- Firefox internals are reached only through `powerbrowser/shell/PowerBrowserAPI.sys.mjs`, and
  every touchpoint is catalogued in `powerbrowser/INTERNAL-APIS.md`. After editing a catalogued
  file, shift each `<file>:<line>` reference in the catalogue by the exact offsets from
  `git diff -U0`, fix rows inside changed hunks by hand, and add rows for new touchpoints. Do not
  use the `--fix` mode of `scripts/verify-ng-040-internals-catalogue-lines.mjs`: it stamps the
  nearest matching line and gets it wrong after larger edits. Run that script without `--fix` to
  confirm.
- Never fork or patch Theia core; never modify Gecko outside the patch stack; nothing may weld
  Theia to full-window presentation.

## 4. Before you finish

1. Run `scripts/verify-platform.sh --quick` once (about six minutes). If the yarn rows fail for
   lack of yarn, run it inside `nix develop .#theia`.
2. Compare with `.planning/workstreams/orca/audit-fix/BASE-QUICK.txt`, the result on the base
   before any lane ran. For each row that is not PASS and was PASS on the base:
   - caused by your change and wrong: fix it;
   - caused by your change and expected until a check another group owns is updated: record it
     under Red by design with the exact change that check needs;
   - not caused by you: record it under Quick gate with the reason.
3. Write your result record at `.planning/workstreams/orca/audit-fix/results/<brief name>.md` in
   the format below, and commit it.

## 5. Result record format

```markdown
# Result: <brief name>

Branch: <branch>   Base: <base sha>   Final: <final sha>

| ID | Status | Commit | Check | Note |
|---|---|---|---|---|
| <item id> | fixed / not-applicable / not-fixed / needs-owner | <sha or -> | <script::clause, or no-check: reason> | <one line> |

## Registry requests
- <new script or row>: <tier (quick or live)>, <exact row to add to scripts/verify-platform.sh>

## Red by design
- <row label>: <why it is red now>, <exact change the owning group or integration must make>

## Handoffs
- <owning group>: <file>, <exact change needed>, for <item id>

## Behaviour changes
- <item id> (<decision if any>): <what the user now sees or what the product now does>, revert with <sha>

## Needs owner
- <item id>: <what only the owner can decide or do>

## Quick gate
<PASS/FAIL/SKIP counts, and each non-PASS row with its classification>
```

Write "None." under a heading with no entries.

## 6. Your final message

At most 40 lines, because the orchestrator reads many of these:

- line 1: `branch <name> final <sha> worktree <path>`
- one line per item: `<id>: <status> <sha> - <few words>`
- then one line each for every registry request, red-by-design row, handoff, behaviour change and
  needs-owner entry.
