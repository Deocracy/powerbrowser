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
3. **Exit 77 needs the SKIP line.** The driver reads the last line of stdout or stderr that matches
   `<name>: SKIP -- <reason>`. Exit 77 with no such line is recorded FAIL. `<name>` is the script's NAME;
   it does not have to equal the row label. End the reason with the next step that supplies the input.
4. **Until a script is converted**, the driver also records SKIP when a script exits 0 and its **last**
   non-blank stdout line is a SKIP line. The summary marks those rows
   `[exit 0 with a SKIP last line: convert the script to exit 77]`. A SKIP note printed earlier and followed
   by a PASS line is not caught by this rule, which is why partial skips must be converted.
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
of them must appear. Mode `only` also requires every line containing `FAIL` to contain a pattern or to be a
tally line, so a second, different red in the same row stays red. Mode `any` is for self-test rows, whose
planted faults print FAIL lines of their own. To request an exclusion, give the integration step the exact
row in this form. Never add one keyed to an entry whose description does not name the row.

## What a lane changes in a script

1. Import the helper: `import { SKIP_EXIT, skipLine, verdictExit } from './lib/skip-verdict.mjs';`
   (from `scripts/lib/`, use `'./skip-verdict.mjs'`). For a bash script, `exit 77`.
2. Each path that prints `SKIP --` and returns or exits 0 now returns `SKIP_EXIT`, or exits 77.
3. A script that collects skipped clauses next to passing ones ends with
   `return verdictExit(NAME, failures, skips)`. That returns 1 on any failure, prints the one SKIP line and
   returns 77 on any skip, and returns 0 otherwise. Print the PASS line only when it returns 0.
4. **Self-tests.** A self-test that spawns its own main mode on a fixture and expects the SKIP control to exit
   0 must now expect 77 (`r.status === 77`), and keep asserting the SKIP line. A self-test that cannot run its
   plants (no typescript, no esbuild) is itself a SKIP: print `<name> self-test: SKIP -- <reason>` and exit 77.
5. **Wrappers.** A bash or node wrapper that runs another check must pass 77 through unchanged (`exit $?`,
   `process.exit(r.status ?? 1)`). The `flock` re-exec used by live rows already does. A caller that treats
   only 0 as green (for example `scripts/rebase-orca.sh`, which already makes a SKIP line red) needs no change.
6. **Never use 77 for anything else**, and never exit 77 to hide a failure.
7. Ledger-locked scripts (`scripts/verify-ng-*.mjs`, `verify-release-shape.mjs`, `verify-worker-submit.mjs`)
   are not edited by lanes. They keep the exit-0 rule 4 until the owner changes them; record the needed diff
   under Needs owner.

The driver needs no change when a script is converted. The harness lanes send registry requests only for
new rows.

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
