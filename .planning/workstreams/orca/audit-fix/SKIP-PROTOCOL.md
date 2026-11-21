# SKIP protocol for `scripts/verify-platform.sh` rows

Set by lane H1-harness-driver (audit items harness-driver-01, harness-static-structure-02,
harness-static-browser-06, harness-driver-05). Harness lanes H2 to H8 follow this file when they convert a
script. The driver half is in place: `scripts/verify-platform.sh` records SKIP, and
`scripts/verify-platform-driver.mjs --self-test` (quick row `verify-platform-driver-self-test`) proves it.

## The rule

A row has one of three verdicts.

| Verdict | A script row signals it by | Meaning |
|---|---|---|
| PASS | exit 0 | every clause ran and passed |
| FAIL | exit 1 (any status other than 0 and 77) | at least one clause ran and failed |
| SKIP | exit 77, after printing one line `<name>: SKIP -- <reason>` | at least one clause did not run because an input is absent, and no clause failed |

1. **FAIL wins over SKIP.** A script with one failed clause exits 1, whatever else it skipped.
2. **A partial run is a SKIP.** If some clauses ran and passed and another was not run because its input
   is absent (orca/ not fetched, no built tree, typescript not installed, an installed Orca on the host),
   the script exits 77. The SKIP line names what did not run. Exit 0 means everything ran.
3. **Exit 77 needs the SKIP line.** Exactly what the driver does on exit 77:
   - It collects every line of the row's output that ends in `: SKIP` or in `: SKIP -- <reason>`, from stderr
     and from stdout. It takes the **last such line in stderr**, and **only when stderr has none**, the last
     such line in stdout.
   - That one line must have the form `<name>: SKIP` or `<name>: SKIP -- <reason>`. Leading whitespace is
     allowed. `<name>` must start with a letter or digit, and every other character must be a letter, digit,
     space, `.`, `_`, `/` or `-`. In bash this is the pattern
     `^[[:space:]]*[A-Za-z0-9][A-Za-z0-9 ._/-]*: SKIP( -- (.*))?$`.
   - If the selected line does not have that form, the row is recorded FAIL. That holds even when an earlier
     line, or a line in the other stream, would have qualified. The same applies when no line ends in
     `: SKIP` at all. A name containing `(`, `:`, `[`, `@` or any other character outside that set makes the
     row FAIL.
   - Therefore: print the SKIP line to **stdout**, as its **last** line, ended with a newline. Print no line
     ending in `: SKIP...` to stderr. Keep `<name>` to the allowed characters; the script's NAME (for example
     `orca-pane-routes` or `redate-windows --self-test`) is fine, and it does not have to equal the row
     label. End the reason with the next step that supplies the input.
4. **Until a script is converted**, the driver also records SKIP when a script exits 0 and its **last**
   non-blank stdout line is a SKIP line. The summary marks those rows
   `[exit 0 with a SKIP last line: convert the script to exit 77]`. A SKIP note printed earlier and followed
   by a PASS line is not caught by this rule, which is why partial skips must be converted. A last line with
   no trailing newline is read like any other (fixed after review, abb798b6).
5. **Function rows** (a bare shell function name in the registry) are not captured. They signal SKIP only by
   `return 77`.

What the driver does with a SKIP:

- **`--quick` and the full run:** the summary prints `  <label>: SKIP`, then a "skipped" block with each
  reason. The run still exits 0 if nothing failed. The verdict line reads
  `PASS -- every check that ran passed; N SKIPPED`. The commit gate does not go red because a developer
  tree lacks an optional input, but it can no longer claim the row passed.
- **`--gate`:** every SKIP fails the gate (`FAIL (unexcused SKIP): <label>`) unless a
  `GATE_KNOWN_OPEN_EXCLUSIONS` row with verdict `SKIP` excuses it. That exclusion row must be keyed to an open
  WINDOWS.md entry, and its pattern must appear in the row's output. The only such row today is
  orca-agent-status-live on an expiring sign-in (D-60 (2), WINDOWS 69). Under `--gate`, a missing typescript,
  a missing orcad build or an installed Orca is therefore a red.
- **`--only <label>`:** prints the SKIP and exits 0, like `--quick`.

Gate exclusions now have the form `label|ledger_id|verdict|mode|patterns|reason` (harness-driver-05).
`verdict` is FAIL or SKIP. `patterns` are ` ;; `-separated literal substrings of the row's output, and one
of them must appear. A tally line is a line that only counts (`FAIL -- 3 failure(s): ...`, `FAIL -- see
surface(s) above`, `FAIL (3)`). Then each mode names the lines that must each contain a pattern:
- **`only`** judges every line containing `FAIL` that is not a tally line. It also judges every item line
  under a tally: the indented lines after the tally, up to the next unindented line. Those carry the failures
  without the word FAIL. An item starting with `Next step:` is guidance and is not judged.
- **`any`**, for self-test rows (whose planted faults print FAIL lines of their own), judges every line of the
  self-test's own verdict, meaning a line containing both `self-test` and `FAIL`, that is not a tally line.
  A control or plant that the self-test reports as failed is judged; a planted fault's own red output is not.
  If the output has no such line, only the pattern's presence is checked. That is why a self-test must print
  its own verdict line naming each failed case (rule 4 under "What a lane changes").

To request an exclusion, give the integration step the exact row in this form. Never add one keyed to an
entry whose description does not name the row.

## What a lane changes in a script

1. Import the helper: `import { SKIP_EXIT, skipLine, verdictExit } from './lib/skip-verdict.mjs';`
   (from `scripts/lib/`, use `'./skip-verdict.mjs'`). For a bash script, `exit 77`.
2. Each path that prints `SKIP --` and returns or exits 0 now returns `SKIP_EXIT`, or exits 77.
3. A script that collects skipped clauses next to passing ones ends with
   `return verdictExit(NAME, failures, skips)`. That returns 1 on any failure, prints the one SKIP line and
   returns 77 on any skip, and returns 0 otherwise. Print the PASS line only when it returns 0.
4. **Self-tests.** A self-test that runs its own main mode on a fixture, and expects the SKIP control to exit
   0, must now expect 77 (`r.status === 77`) and keep asserting the SKIP line. A self-test that cannot run its
   plants (no typescript, no esbuild) is itself a SKIP: print `<name> self-test: SKIP -- <reason>` and exit 77.
   Two more rules, because `verdictExit` and `skipLine` print the SKIP line as a side effect:
   - Run the main mode as a **child process with captured output** (`spawnSync(process.execPath, [...],
     { encoding: 'utf8' })`, with stdout and stderr piped, never `stdio: 'inherit'`). Do not run it by calling
     `main()` in the self-test's own process. Otherwise the control's SKIP line lands in the self-test's own
     output, and if it is last, the driver records the self-test row itself as SKIP (rule 4).
   - The self-test's **own** verdict line (`<name> --self-test: PASS -- ...` or `... FAIL -- ...`) is the
     **last** line it prints, on every path.
5. **Every caller of a converted script must handle 77 deliberately.** After converting a script, find every
   place that runs it directly, not only its registry row:
   - workflows (`.github/workflows/*.yml`),
   - hooks (`.claude/hooks/`, `.claude/settings.json`),
   - packaging scripts (`powerbrowser/packaging/*.sh`),
   - other scripts that spawn it or import its main and use the returned code.

   A search for the file name over those paths finds them. Each caller must decide what 77 means at its call
   site and say so in a comment there:
   - A release or packaging step that must prove the check ran treats 77 as red. It must say so, rather than
     fail by accident with a bare non-zero exit.
   - A step where the input is legitimately absent tolerates 77 explicitly, for example `rc=0; node x.mjs ||
     rc=$?; [ "$rc" -eq 0 ] || [ "$rc" -eq 77 ]`. An example is `verify-descriptor-monotonic.mjs` in
     release.yml before the first published Release.
   - A wrapper that only relays the verdict passes 77 through unchanged (`exit $?`,
     `process.exit(r.status ?? 1)`). The `flock` re-exec used by live rows already does.

   A caller in a file your lane does not own is a Handoff, naming the file, the line and the treatment of 77
   it needs. The direct callers found on 1dd2cbfc are listed under "Known direct callers" below.
6. **Never use 77 for anything else**, and never exit 77 to hide a failure.
7. Ledger-locked scripts (`scripts/verify-ng-*.mjs`, `verify-release-shape.mjs`, `verify-worker-submit.mjs`)
   are not edited by lanes. They keep the exit-0 rule 4 until the owner changes them; record the needed diff
   under Needs owner.

The driver needs no change when a script is converted. The harness lanes send registry requests only for
new rows.

## Known direct callers (1dd2cbfc)

Found by searching `.github/`, `.claude/hooks/`, `.claude/settings.json`, `systemd/`, `powerbrowser/packaging/`
and `scripts/` for each script that prints SKIP. Imports that only reuse helpers are left out; a lane converting
one of these scripts owns the handoff for each caller below.

On 1dd2cbfc only `scripts/redate-windows.mjs` is converted. Its only caller is its registry row; it has no
direct caller.

| Script | Direct caller (file:line) | 77 must be |
|---|---|---|
| verify-descriptor-monotonic.mjs | .github/workflows/release.yml:1623 | tolerated before the first published Release, red after it (the step decides which by whether a Release exists) |
| verify-licence-allowlist.mjs | .github/workflows/release.yml:160, :627 (`--rulings`) | red: a release must check every LICENCE digest |
| verify-upstream-pins.mjs | .github/workflows/release-train.yml:535 | red |
| verify-release-identity.mjs | .github/workflows/release-train.yml:534 | red |
| verify-channel-live.mjs | .github/workflows/release.yml:1594, :1628, :1730, :1743, :2086, :2213, :2223 | red: those steps run after the inputs exist |
| verify-orca-packaged-tree.mjs | .github/workflows/release.yml:2323, :2453, :2599; powerbrowser/packaging/package-macos.sh:263; powerbrowser/packaging/package-windows.sh:85 | red: packaging must judge the tree it built |
| verify-orca-slotless-start.mjs | scripts/rebase-orca.sh:257-258 (`[ "$RC" -eq 0 ] \|\| red`), and its fixture at :469 | red. The replay already treats any non-zero exit as red, but its message names the exit status; it should say SKIP when RC is 77, and its fixture probe at :469 should exit 77 for the SKIP case |
| the rows rebase-orca.sh replays | scripts/rebase-orca.sh (its SKIP-line rule, :25-28) | red, as now; keep the SKIP-line check, since a converted script still prints the line |

The other callers the search found are imports of helpers (for example verify-orca-build-shape.mjs's `walk`,
verify-orca-hidden-electron.mjs's `startTicks`) and do not run the script's main mode. A lane that converts a
script whose exported function returns an exit status used by an importer must check that importer too.

## The live lock

The contract between the driver (`scripts/verify-platform.sh`, `acquire_live_lock`) and the live rows'
helper (`scripts/lib/live-lock.mjs`, lane H5). Both are written against these words.

Terms:
- **The lock** is `flock` on `<git common dir>/pb-live.lock`, one per checkout and shared by all its worktrees.
- **Holding** it is what `/proc/locks` shows: a `FLOCK` line on that file's inode, whose pid is the holder.
- **Start ticks** are `/proc/<pid>/stat` field 22, so a reused pid number is told apart from the process it
  once was.

Rules:
1. When the driver takes the lock (its holder process, `flock -o`, polling the driver and ending with it), it
   exports `PB_LIVE_LOCK_HELD=1` and `PB_LIVE_LOCK_HOLDER=<pid>:<start ticks>` of that holder process. When it
   goes on because an ancestor holds the lock (rule 2b), it exports the same two variables, naming that
   ancestor.
2. **No inherited variable is proof.** The driver, and the row helper likewise, goes on without taking the
   lock only when `/proc/locks` shows the lock's inode held by one of:
   - a. the process an inherited `PB_LIVE_LOCK_HOLDER` names, with a pid that holds the lock **and** start ticks
     equal to that process's current start ticks; or
   - b. the process itself or one of its ancestors (for example `flock <lock> node <row>` or
     `flock <lock> scripts/verify-platform.sh`).
3. An inherited `PB_LIVE_LOCK_HELD=1` or `PB_LIVE_LOCK_HOLDER` with neither 2a nor 2b is a **FAIL by name**:
   - the message names both variables, says the lock is held by neither, and names the actual holders;
   - its next step is to unset both and run again.

   It never proceeds, and it never takes the lock silently. A run whose environment does not set them takes the
   lock, and waits for it.
4. **Waiting** names the holder's pid and command, says the run waits until that run ends (at most
   `PB_LIVE_LOCK_WAIT_S`, default 21600 s, then FAIL naming the holder), and says how to find that run
   (`ps -o pid,ppid,etime,args -p <pid>`). It never suggests setting a variable.
5. Nothing sets `PB_LIVE_LOCK_HELD` or `PB_LIVE_LOCK_HOLDER` by hand. To run a live row alone, use
   `flock <git common dir>/pb-live.lock node scripts/<row>.mjs` (rule 2b), or the driver's
   `--only <label>`.

The driver's plants are in `scripts/verify-platform-driver.mjs --self-test`:
- a forged `PB_LIVE_LOCK_HELD=1` while another process holds the lock is a FAIL;
- a `PB_LIVE_LOCK_HOLDER` naming the real holder with wrong start ticks is a FAIL;
- one with the right pid and start ticks proceeds;
- an ancestor `flock`, even with a forged `PB_LIVE_LOCK_HELD=1`, proceeds;
- every full-tier row sees a `PB_LIVE_LOCK_HOLDER` that names a live process.

## Before and after

Before (counted PASS by the driver, and its partial skip invisible):

```js
function main() {
    if (!loadTypeScript()) { console.log(`${NAME}: SKIP -- theia/node_modules/typescript is absent`); return 0; }
    const failures = checkTree();
    const skips = [];
    if (!existsSync(ORCA_SRC)) skips.push('orca/ is not fetched, so the pinned-source clauses did not run');
    else failures.push(...checkPinned());
    for (const s of skips) console.log(`${NAME}: SKIP -- ${s}`);
    if (failures.length) { for (const f of failures) console.error(`${NAME}: FAIL -- ${f}`); return 1; }
    console.log(`${NAME}: PASS -- ${CLAUSES} clauses green`);
    return 0;
}
```

After:

```js
import { SKIP_EXIT, skipLine, verdictExit } from './lib/skip-verdict.mjs';

function main() {
    if (!loadTypeScript()) {
        console.log(skipLine(NAME, 'theia/node_modules/typescript is absent. Next step: run yarn install in theia/'));
        return SKIP_EXIT;
    }
    const failures = checkTree();
    const skips = [];
    if (!existsSync(ORCA_SRC)) skips.push('orca/ is not fetched, so the pinned-source clauses did not run. Next step: bash scripts/fetch-orca.sh');
    else failures.push(...checkPinned());
    for (const f of failures) console.error(`${NAME}: FAIL -- ${f}`);
    const code = verdictExit(NAME, failures, skips);
    if (code === 0) console.log(`${NAME}: PASS -- ${CLAUSES} clauses green`);
    return code;
}
```

The self-test control that ran `main` on a tree with no `orca/` changes from `want(r.status === 0)` to
`want(r.status === 77 && r.stdout.includes(': SKIP -- orca/ is not fetched'))`.
