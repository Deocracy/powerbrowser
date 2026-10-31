---
phase: 52-claude-fixer-f
reviewed: 2026-10-31T00:00:00Z
depth: deep
files_reviewed: 4
files_reviewed_list:
  - scripts/verify-fix-gate.mjs
  - .github/fix-gate-deny.json
  - scripts/verify-platform.sh
  - scripts/verify-workflows.mjs
findings:
  blocker: 4
  warning: 7
  info: 4
  total: 15
status: issues_found
---

# Phase 52: Code Review Report (plans 52-01 fix gate, 52-02 fixer rules)

**Depth:** deep. Change set `186f465..HEAD` (commits ee54b6d, aaf1229, fb98638, c32a3b4, 232588a).
**Status:** issues_found

## Summary

Both self-tests and the `fix-gate-self-test` and `workflows` rows are green on the tree. Every bypass
below was reproduced with the real gate (`node scripts/verify-fix-gate.mjs --diff=...`) or with the
diff applied in a scratch clone under /tmp/claude-1000/rv/. In this sandbox `yarn` is absent, so
`diff-theia-core.sh --quick` is the first stage to go red on every input. That red is environmental.
For each bypass below, "passed" means every stage before it (path, apply, regenerate, non-vacuity,
check-patch-surface, scan-brand-residue) was green and the diff was applied to the worktree.

Does commit 232588a close the deny-list bypass? Partly. Adding `scripts/**` and re-checking
`git diff --cached --name-only -z` after `git apply` does catch the case where the in-memory header
parser misreads a path (verified: a traditional `--- /dev/null` / `+++ y/.github/workflows/evil.yml`
section is rejected by the re-check). It does not close the class, because:

- the re-check is blind to git-ignored paths (CR-02);
- the glob matcher cannot match paths containing a newline (CR-03);
- the `patches/` guard still reads the attacker-controlled parser output (CR-04);
- `scripts/**` covers helpers under scripts/, but the real `--quick` stage also executes code from
  `powerbrowser/` and `theia/`, so the "never runs anything the diff carries" invariant is false (CR-01).

## Critical Issues

### CR-01: The real `--quick` stage executes code the diff carries, with writable links to the shared `upstream/` and `theia/node_modules`

**File:** `scripts/verify-fix-gate.mjs:4-6` (claim), `:324-331` (links), `:348` (stage); executing rows `scripts/verify-platform.sh:1802` (`shell04-log-redacts-token` imports `powerbrowser/shell/TheiaService.sys.mjs`) and `scripts/verify-telemetry.mjs:269-270` (`telemetry-self-test` imports `theia/extensions/telemetry/src/browser/telemetry-error-report.ts` and `telemetry-sender.ts`).
**Issue:** The header says "The gate reads the diff as data and never runs anything the diff carries", and 232588a justified `scripts/**` on the grounds that code run from the patched worktree is gate code. That reasoning stops at `scripts/`. `verify-platform.sh --quick` runs in the patched worktree (`wt`), and at least two quick rows `import()` a non-`scripts/` file from the tree.

Reproduced: appending
`process.getBuiltinModule("fs").writeFileSync("/tmp/claude-1000/rv/PWNED3","x")` to `powerbrowser/shell/TheiaService.sys.mjs` passes every path and patch stage. `verify-platform.sh --only shell04-log-redacts-token` then prints PASS and the payload runs. The same append to `telemetry-sender.ts` ran under `verify-telemetry.mjs --self-test` as uid 1000 with cwd set to the worktree. `fetch-upstream.sh:24` also `source`s `generated/upstream-pins.env`, which is git-ignored (see CR-02), so a diff-written copy of that file can run shell code too (reproduced in a scratch clone).

Impact: the fixer's output (adversarial by the task's premise) runs as the gate job. It inherits the job env. `wt/upstream` and `wt/theia/node_modules` are symlinks to the shared checkout (`:329-330`), so the payload can write into the Gecko source and the Theia dependencies that later jobs build from, wherever those directories persist. No deny entry is hit.

**Fix:** Do not rely on enumerating executable paths. Two changes together:

1. Run stage 8 as an untrusted-code job. Give the gate job no secrets and no token, an ephemeral hosted runner and no network. Enforce this in the 52-04 workflow with a `workflows` rule, since the gate itself cannot.
2. Remove the writable links. Bind `upstream/` and `theia/node_modules` read-only (bwrap or `mount --bind -o ro`), or copy them. Never `symlinkSync` into the shared tree.

Optionally also add `powerbrowser/shell/**` and `theia/extensions/telemetry/**` to the deny list as a stopgap. That only shrinks the surface; the list will keep growing as rows are added.

### CR-02: The post-apply path re-check cannot see git-ignored files, and `.gitignore` is not denied

**File:** `scripts/verify-fix-gate.mjs:308-312` (`git add -A` then `git diff --cached --name-only`); `:152-163` (in-memory parser only accepts `a/` and `b/` prefixes); `.github/fix-gate-deny.json`.
**Issue:** `git apply` writes ignored paths, but `git add -A` does not stage them, so `--cached --name-only` never lists them. Two header forms evade the in-memory parser: a traditional `--- /dev/null` / `+++ y/<path>` pair (any prefix other than `b/`), and quoted names. Combining these gives a full path-stage bypass. Three reproductions, each of which passed the path and patch stages:

- `+++ y/.claude/settings.local.json` is an ignored file under a denied glob and was accepted.
- A diff that adds `.github/workflows/evil.yml` to `.gitignore` (not on the deny list) and creates `.github/workflows/evil.yml` through the traditional header was accepted. Without the `.gitignore` hunk the same file is correctly rejected, so the ignore hunk is what defeats the re-check.
- A diff-written `generated/upstream-pins.env` (ignored, never staged) is sourced later (see CR-01).

Whether the ignored file reaches a branch depends on how 52-04/05 transfer the diff. If fix-pr applies the same artifact with `git apply --index` or `git add -f`, the denied file ships. The gate's invariant ("every path git applies is checked") does not hold either way.

**Fix:**
```js
run('git', ['add', '-A', '-f'], wt);            // stage ignored files too
// then reject any applied path that is not a plain tracked-source path:
//   deny: .gitignore, .gitattributes, .gitmodules, generated/**, upstream/**, theia/node_modules/**
```
Alternatively build the applied set from `git apply --numstat -z --summary` run on the original diff, which lists every path regardless of ignore rules. Also add the three dotfiles above to the deny list. Check the `git add` exit status (see WR-01).

### CR-03: Deny globs do not match paths containing a newline, so quoted names pass every deny entry

**File:** `scripts/verify-fix-gate.mjs:89-92` (`globToRe`).
**Issue:** `**` compiles to `.*`, and `.` does not match `\n`, `\r`, U+2028 or U+2029. A path such as `.github/evil\nname.yml` matches none of `.github/**`, `.claude/**`, `scripts/**`, `powerbrowser/packaging/mar/**`.

Reproduced: a diff creating `"b/.github/evil\nname.yml"`, preceded by one benign file so the parser has a current file, passed the path stage in memory. The post-apply `-z` re-check missed it for the same regex reason, and the gate continued to the real scripts. The in-memory parser does not decode quoted names at all (`^diff --git a\/(.+) b\/(.+)$` fails on `"a/..."`); a quoted section that is not preceded by a benign file is rejected only as "hunk header with no file header".

**Fix:** Use `[^]*` or the `s` flag: `new RegExp(..., 's')`, and `join('[^]*')` for `**`. Decode quoted headers, or reject any applied path containing a control character or a non-printable byte outright, which is a reasonable policy for a fixer diff. Add a self-test plant: `.github/x\ny` must go red.

### CR-04: A quoted or odd-prefix `patches/` path skips both hand-edit checks

**File:** `scripts/verify-fix-gate.mjs:333` (`touched.some(p => p.startsWith(PATCH_PREFIX))`), `:223-243` (in-memory stage 3 loops `parsed.files`).
**Issue:** The `regenerate-patches.sh --check` stage runs only if the in-memory parser reported a `patches/` path. A new or changed patch whose header the parser misreads (a quoted non-ASCII name such as `"patches/\303\251-x.patch"`, or a `y/patches/...` header) leaves `touched` free of `patches/`. Result: the real `--check` is skipped, and the in-memory hand-edit proxy (stage 3) never sees the file either.

Reproduced: a diff adding `patches/é-x.patch` after a benign file passed every stage up to diff-theia-core. The unquoted equivalent `patches/999-x.patch` is correctly rejected at stage 3. `apply-patches.sh` globs `patches/*.patch`, so the unverified patch would be replayed onto Gecko. The 232588a re-check computes `applied` but the `patches/` guard still uses `touched`.

**Fix:** Compute the guard from `applied`, the git-reported set (`:312`), not from `touched`. Better, always run `regenerate-patches.sh --check` whenever the patch set differs from HEAD, i.e. `applied.some(p => p.startsWith('patches/'))`.

## Warnings

### WR-01: A failed `git add -A` fails open

**File:** `scripts/verify-fix-gate.mjs:308-312`.
**Issue:** The result of `run('git', ['add','-A'], wt)` is discarded. If `add` fails (index.lock, disk, an unaddable path), `git diff --cached --name-only` still exits 0 with an empty list. `applied` is `[]`, `pathFailures` returns nothing, and the post-apply deny check passes on zero paths.
**Fix:** `if (run('git', ['add','-A','-f'], wt).status !== 0) { failures.push('[path] ...'); return failures; }`.

### WR-02: A diff that creates an ignored directory crashes the gate with an uncaught exception instead of a verdict

**File:** `scripts/verify-fix-gate.mjs:329-330`.
**Issue:** `symlinkSync(src, join(wt, rel), 'dir')` throws EEXIST when the diff has written `upstream/zz.txt` or `theia/node_modules/<non-ASCII>/...`. Reproduced with `upstream/zz.txt`: stack trace, no `[stage]` line, no "Next step". The exit code is nonzero, so it fails closed by accident. It also shows that diff-writable ignored paths are not rejected anywhere.
**Fix:** Reject any applied path under `upstream/`, `theia/node_modules/`, `generated/` before the link step (see CR-02). Wrap the link step so it returns a `[apply]` failure.

### WR-03: `--tag` is both the Power Browser ref to check out and the Gecko tag to replay, and the "fresh replay" is not a replay

**File:** `scripts/verify-fix-gate.mjs:290` (`ref = tag ?? 'HEAD'`), `:297`, `:333-342`, `:46-50`.
**Issue:** The same string is passed to `git worktree add ... <tag>` (a ref of this repo) and named in the regenerate message as the upstream tag. A Gecko ESR tag is not a ref of this repo, so a patch-touching diff given the tag the plan describes fails at the `[apply]` checkout. `regenerate-patches.sh --check` never replays anything. Its header says it re-derives each patch from the already-patched `upstream/` (`git diff HEAD` in `$UPSTREAM_DIR`). The gate points it at the ambient `REPO_ROOT/upstream` that the diff's patches have not been applied to. Any fixer change to a patch's `+`/`-` lines therefore compares against the old patches' result and is rejected. Only a no-op or a context-only moved file passes. That contradicts FIX-02 and plan truth 3 ("fresh replay at the target tag"). The `upstream/ at --tag` assumption is only a "shortcut" comment; nothing checks it.
**Fix:** Split the arguments (`--ref` for this repo, `--upstream-tag`). Before the check, run `scripts/apply-patches.sh` against a copy of `upstream/` (for example `git -C upstream worktree add`) using `wt/patches`. Verify `git -C upstream describe --tags` equals the tag, then point `--upstream` at that copy.

### WR-04: The `diff-theia-core` real stage runs in `REPO_ROOT`, so it cannot see the diff

**File:** `scripts/verify-fix-gate.mjs:347` (cwd `REPO_ROOT`).
**Issue:** The script runs `yarn check --integrity` against the shared `theia/` and `node_modules`, not the patched worktree. A diff that edits `theia/package.json`, `theia/yarn.lock` or an extension manifest is never integrity-checked. The only effective part of stage 7 is the in-memory prefix test on `theia/node_modules/@theia/`. Running the script from the worktree (its `node_modules` is a link) would make it meaningful. The stage can never go red because of the diff. It also needs `yarn`, so it is red outside the dev shell for every input (observed here), and the gate does not say it needs `nix develop .#theia`.
**Fix:** Run it with cwd `wt`, and document or assert the dev-shell requirement.

### WR-05: Self-test plants do not exercise the rules they name, and the new 232588a code has no plant

**File:** `scripts/verify-fix-gate.mjs:408-460`.
**Issue:**
1. `runRealStages` and the post-apply re-check (the whole of 232588a) are never run by `--self-test`, so none of it can go red in the quick row. A regression there is invisible.
2. The "hand-edited patch hunk" plant tests only the in-memory proxy (`:229`). That proxy is bypassed by any added line matching `^index [0-9a-f]+\.\.[0-9a-f]+`, and the control at `:455` asserts this bypass stays green. The plan's must-have ("rejected by regenerate-patches.sh --check inside the gate chain") is not tested; the script is never run.
3. Plant needles are only the path (`[p]`), not the matching entry. `.github/settings/actions-selected.json` is shadowed by `.github/**`, so removing its own entry leaves its plant green.
4. With `scripts/**` denied, every registry-named file is a deny hit, so `regPath` (`:435`) is undefined and the registry plant is silently skipped. `registryFiles` returning an empty Set (CHECKS format change) is not detected anywhere, so the registry-derived half of FIX-11 can silently become a no-op.
5. The deny list is the plant source, so deleting an entry from `fix-gate-deny.json` also deletes its plant and the self-test stays green. Nothing asserts the FIX-11 mandatory entries are present. The plan's `paths.length===13` check was an acceptance step only, not a registered check.

**Fix:** Add `needles` containing the entry (`'${g}'`); assert `registry.size > 0`; assert the FIX-11 mandatory list is a subset of the deny file (that list is requirement text, so a hand-kept floor is legitimate here); add a throwaway-git-repo self-test that drives `runRealStages` with the plants from CR-02 to CR-04.

### WR-06: `fixer-tools` accepts grants that reach `patches/` or open the shell

**File:** `scripts/verify-workflows.mjs:175-183` (`flagValue`, `toolEntries`), `:357-372`.
**Issue:** Each of these passes the rule by code reading:
- Bare `Edit` or `Write` (no parentheses), `Edit(**)`, `Edit(*)` and `MultiEdit(...)`. The grant regex requires `Edit(...)`/`Write(...)` and only tests for the substring `patches` or the exact `work/**`. These grants reach `patches/**` without a deny.
- `Bash(*)` and `Bash(:*)`: only the literal `Bash` and `Bash()` are refused.
- A space-separated list, `--allowedTools Read Bash`: `flagValue` returns only the first token, and the CLI accepts a variadic list.
- `--dangerously-skip-permissions`, `--permission-mode bypassPermissions`/`acceptEdits`, `--settings`, `--mcp-config`, `--add-dir` and the `--allowed-tools` alias are not inspected, so the allowlist can be made moot.
- Only `claude[0]` (`:357`) is checked, so a second Claude step in `fix` is unchecked.
- `--max-turns` is only tested for presence.

**Fix:** Parse claude_args into tokens. Refuse unknown flags (allowlist of `--max-turns`, `--allowedTools`, `--disallowedTools`). Refuse any entry that is `Bash` with a wildcard-only argument, any unparenthesised `Edit|Write|MultiEdit|NotebookEdit`, and any `Edit/Write(...)` whose glob is not a subpath of `work/` excluding `patches`. Check every Claude step in the job.

### WR-07: The Claude action pin and `if:` guards are weaker than FIX-08 and FIX-09 state

**File:** `scripts/verify-workflows.mjs:340-348`, `:381-383`.
**Issue:**
- `fixer-pin` is limited to `file === 'release-train.yml'`. FIX-08 requires the exact pin "in both the fixer and `triage.yml`". A future `triage.yml` pinned to the tag object `c335fd6d` passes the generic 40-hex `uses-pinned` rule.
- The `if:` guards are checked by `cond.includes(lit)`. `if: always() || (<all three guards>)`, or `!(... && ...)`, contains all the literals and starts the fixer on forks and on `claude-fix/*` heads.
- `fixer-debug` only inspects `env` when it is an object.

**Fix:** Apply `fixer-pin` to every workflow. Parse the `if:` into top-level `&&` terms and require each guard to be one of those terms. Reject `||` and `!(`.

## Info

### IN-01: `parseDiff` treats a blank line as context

**File:** `scripts/verify-fix-gate.mjs:132` (`tag === ' ' || line === ''`). The trailing empty string from `split('\n')` counts as one context line, so a diff truncated by exactly one context line is not reported as "ends inside a hunk". Low impact (`git apply` still rejects it), but the structural check is one line weaker than documented.

### IN-02: `ref` and `tag` are passed unvalidated to `git worktree add`

**File:** `scripts/verify-fix-gate.mjs:297`. A value starting with `-` is parsed as an option. The input comes from the workflow, but add `--` or validate `^[A-Za-z0-9._/-]+$`. With no `--tag` the target is the gate checkout's `HEAD`, not a named ref; the success line should say so.

### IN-03: Deny matching is case-sensitive

**File:** `scripts/verify-fix-gate.mjs:175-181`. This is fine on the Linux runners the plan names. It is bypassable on a case-insensitive filesystem (`.GITHUB/`, `Scripts/`). Note it in the header so the gate is not run on macOS or Windows.

### IN-04: Plan 52-02 must-have "actions-selected.json admits the two fixer admissions" is not met (documented deviation)

**File:** `.github/settings/actions-selected.json` (unchanged); `52-02-SUMMARY.md` "Deferred". The deferral reasoning is correct. `admission-used` would be red until a workflow uses the action, and `actions/*` are GitHub-owned and need no entry. Track it so 52-04 lands `anthropics/claude-code-action@*` in the same commit as its first use and drops the other four entries from its list. Separately, `timeout` on `spawnSync` kills only the direct child, so a hung `--quick` descendant can outlive the gate step.

---

_Reviewed: 2026-10-31_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
