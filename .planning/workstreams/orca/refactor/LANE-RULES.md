# Refactor lane rules (v1.7)

You are one lane in a refactor, optimization and bug-fix pass over the Power Browser product code.
Your prompt names one brief in `.planning/workstreams/orca/refactor/briefs/`. Work on the files that
brief owns and nothing else.

The owner's instructions (2026-11-21): refactor and optimize the product code, and note and fix any
bug found on the way. Depth is **conservative**: behaviour-preserving changes only, apart from bug
fixes. The work merges into the v1.7 branch without a push.

What cannot be verified here: the tree has no unit tests, and no lane may launch the browser. Your
evidence is the TypeScript build, `node --check`, the static quick gate and your own reading of every
caller. A change you cannot show to be behaviour-preserving by reading the code is not made.

## 1. Setup

1. You work in your own git worktree. Run `git rev-parse --show-toplevel`. If it prints
   `/home/chris/orca/workspaces/Power-Browser/v1.7-Orca-integration`, stop and report: that is the
   integration worktree and lanes must never edit it.
2. Run `git reset --hard <BASE>` with the commit your prompt gives. Your worktree is new, so nothing
   is lost.
3. Run `bash .planning/workstreams/orca/audit-fix/provision-lane.sh`. Add `--with-objdir` only if a
   check you must run reads `objdir/`.
4. Build once so `lib/` matches your sources:
   `nix develop .#theia --command bash -c 'cd theia && yarn build:extensions'`.

Build facts:

- `yarn` works only inside `nix develop .#theia`. `node` works outside it.
- One extension: `nix develop .#theia --command bash -c 'cd theia && yarn --cwd extensions/<name> build'`.
  The build is `tsc -b`, so it is also the type check.
- `powerbrowser/shell/*.sys.mjs` and `*.js` have no compile step. `node --check <file>` checks syntax
  only: an undefined name, a wrong argument order or a missing `await` is not caught, so read every
  use of anything you move, rename or inline.
- Never run `./mach build`, never launch the browser, never run a live row (a `*-live.mjs` script
  without `--self-test`), and never run anything that needs a display, a sign-in or a network
  install. Never run a bare `yarn install`.
- Never write outside your worktree. Never touch the integration worktree, another worktree,
  `upstream/`, `orca/` (third-party checkouts) or `generated/` by hand.
- Nine lanes run at the same time on one 16-core host. A foreground command is limited to ten
  minutes: run a long command in the background with its log inside your worktree.

## 2. What you may edit

- The files your brief lists as owned. A new file is allowed only when a bug fix needs a new check
  script (section 4).
- Never edit an existing file under `scripts/`, and never edit `scripts/verify-platform.sh`,
  `ledger/`, `inventory/`, `patches/`, `orca-overlay/patches/`, `.github/`, `docs/` or any
  `.planning` file other than your result record.
- Never edit `powerbrowser/INTERNAL-APIS.md`. Two lanes edit `PowerBrowserAPI.sys.mjs` at the same
  time, so the catalogue's line numbers are re-stamped once at integration. Record every Firefox
  touchpoint you add, remove or move into a different function under Handoffs. The catalogue rows
  therefore go red in your quick gate when your edits shift lines; classify them as Red by design.
- If a change needs a file another lane owns, make the part that is in your files and record the
  rest under Handoffs with the exact change needed.

## 3. What counts as a refactor or optimization here

In scope, in order of value:

1. **Dead code**: unreachable branches, unused functions, parameters, fields, imports, CSS rules
   whose selector matches nothing, and state that is written and never read. Prove it by searching
   the whole tree (`git grep`), including `scripts/`, `theia/`, `powerbrowser/` and `orca-overlay/`.
   A name that appears only in a check script is still dead in the product, but removing it turns
   that check red: see "Checks that pin source text".
2. **Duplication**: the same logic written twice or more inside your files. Fold it into one helper
   in your files. Do not create a shared module across extensions.
3. **Control flow**: nested conditionals that reduce to guard clauses, repeated lookups of the same
   value in one function, promise chains that are clearer as `await`, flags that duplicate state.
4. **Performance on a real path**: work repeated per keystroke, per animation frame, per tab or per
   message that can be done once; repeated DOM queries and forced layout in loops; listeners,
   observers, timers and disposables that are added and never removed; unbounded maps and caches;
   redundant requests over the chrome channel or to the backend; awaits in sequence that are
   independent and can run together; O(n^2) scans over tabs, rows or groups. State the path and why
   it is hot in the commit body. Do not make a change whose only effect is a constant factor on a
   path that runs once.
5. **Type tightening** (TypeScript): an `any` or a cast that hides a real type, where the narrower
   type needs no change at the callers.

Out of scope:

- Splitting or moving a file, renaming an exported symbol, a message `kind`, a pref, a command id,
  a CSS class, a DOM id or attribute, a storage key, or changing the shape of anything another file
  or a check reads. `TabUriRegistry`'s exported shape is asserted by a check and stays as it is.
- Reformatting, reordering declarations, renaming locals for taste, rewording comments, adding
  comments to code you did not change, changing user-facing copy.
- A second file importing a Firefox internal. `PowerBrowserAPI.sys.mjs` stays the one boundary.
- Editing Theia core or anything under `node_modules/`.
- New dependencies.

**Checks that pin source text.** Many checks read your files as text (`git grep -l '<file name>'
scripts/` lists them). Before a change, read the checks that name the function or line you are
about to change. If a worthwhile change would turn a check red only because the check pins the old
text, do not make the change: record it under Blocked by check with the check name and the change.
Do not weaken or work around a check.

**Bugs.** A bug is behaviour that contradicts the code's own stated intent, a comment, a recorded
decision, or the user-facing contract: a wrong condition, a missed `await`, a race, a leak, an
unhandled rejection, an off-by-one, a stale closure, an error swallowed where the caller needs it.

- Fix it minimally in its own commit, apart from refactor commits.
- Where a static check can go red without the fix, add a new script `scripts/verify-<topic>.mjs`
  (no browser, no display) that derives its expectation from the tree and has a `--self-test` that
  plants the pre-fix fault and requires red, naming the drift. You do not register it; you request
  registration in your record. Where such a check would be artificial, write `no-check: <reason>`.
- Where the fix changes what the user sees or overturns a recorded decision
  (`.planning/workstreams/orca/DECISIONS.md`, `.planning/workstreams/orca/v1.7-AUDIT-REMEDIATION.md`),
  do not fix it: record it under Needs owner with the evidence and the fix you propose.
- A bug in a file you do not own goes under Handoffs with file:line evidence.
- The audit remediation of 2026-11-21 already fixed 184 items in these files. Before you report a
  bug, check it is not one of the seven it left open for the owner (listed in that report).

## 4. How to work

1. Read every file you own in full before changing anything, then list candidate changes with
   file:line. Read the callers of each candidate.
2. Take the candidates in order of value. Stop adding refactors when the remaining ones are a
   matter of taste. A short list of sound changes is a correct result; do not pad it.
3. After each change: build the extension or run `node --check`, then run the checks that read the
   file (`git grep -l '<file name>' scripts/` and run those scripts, with `--self-test` where the
   registry row uses it).
4. One commit per change, or per tightly coupled set. Stage explicit paths (`git add -- <paths>`).
   Never use `git add -A`, `git commit -a`, `--amend`, `stash`, `rebase` or `push`. Message:
   `refactor(<area>): ...`, `perf(<area>): ...` or `fix(<area>): ...`, a body of one to three lines
   saying why the change is behaviour-preserving (or, for a fix, what was wrong), and the
   Co-Authored-By trailer for your model.

Standing project rules that are easy to break here:

- The brand-residue scan reads `git ls-files`: stage a new file before you trust a green scan, and
  never spell the originating product's name anywhere. The scan also keeps counts of some tokens;
  if your change moves a count the scan goes red, which is Red by design (recount at integration).
- No internal identifier in user-facing text.
- Never fork or patch Theia core; never modify Gecko outside the patch stack; nothing may weld
  Theia to full-window presentation.

## 5. Before you finish

1. Run `scripts/verify-platform.sh --quick` once inside `nix develop .#theia`, in the background,
   with the log inside your worktree. It takes six to ten minutes alone and longer under load.
2. The base had 456 PASS, 0 FAIL, 0 SKIP in the provisioned integration worktree. For each row that
   is not PASS:
   - caused by your change and wrong: fix it;
   - caused by your change and expected until integration (catalogue line numbers, token counts):
     record it under Red by design with the exact change needed;
   - not caused by you (an input your worktree lacks, a timeout under load): re-run that row alone
     with `scripts/verify-platform.sh --only <label>`, and record it under Quick gate with the reason.
3. Write your result record at `.planning/workstreams/orca/refactor/results/<brief name>.md` in the
   format below, and commit it.

## 6. Result record format

```markdown
# Result: <brief name>

Branch: <branch>   Base: <base sha>   Final: <final sha>

| # | Type | Commit | Files | What and why it is safe |
|---|---|---|---|---|
| 1 | refactor / perf / fix | <sha> | <files> | <one line> |

## Bugs fixed
- <file:line at base>: <what was wrong>, <commit>, <script::clause or no-check: reason>

## Registry requests
- <new script>: <exact row to add to scripts/verify-platform.sh>

## Red by design
- <row label>: <why it is red now>, <exact change integration must make>

## Blocked by check
- <check name>: <the change it blocks, file:line>

## Handoffs
- <owning lane>: <file:line>, <exact change needed or bug evidence>

## Needs owner
- <file:line>: <bug or change only the owner can decide>, <evidence>, <proposed fix>

## Not done
- <candidate you considered and rejected, one line each, only where a reviewer would ask>

## Quick gate
<PASS/FAIL/SKIP counts, and each non-PASS row with its classification>
```

Write "None." under a heading with no entries.

## 7. Your final message

At most 40 lines, because the orchestrator reads many of these:

- line 1: `branch <name> final <sha> worktree <path>`
- one line per commit: `<sha> <type> - <few words>`
- then one line each for every bug fixed, registry request, red-by-design row, blocked change,
  handoff and needs-owner entry.
