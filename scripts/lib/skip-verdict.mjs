// scripts/lib/skip-verdict.mjs
//
// The SKIP verdict of scripts/verify-platform.sh (SKIP-PROTOCOL.md in the v1.7 audit-fix folder under
// .planning/workstreams/).
// A check that did not run, or ran only some of its clauses because an input (a fetched third-party checkout, a
// built tree, an installed compiler) was absent, prints one line
// "<name>: SKIP -- <reason>" and exits SKIP_EXIT. The driver records it as SKIP, not PASS. A FAIL always wins
// over a SKIP: a check with one failed clause exits 1 whatever it skipped.
//
//   import { SKIP_EXIT, skipLine } from './lib/skip-verdict.mjs';
//   if (!ts) { console.log(skipLine(NAME, 'theia/node_modules/typescript is not installed; run yarn install in theia/')); return SKIP_EXIT; }
//
// No top-level side effects.

/** The exit status that means "did not run". 77 is the automake convention for a skipped test. */
export const SKIP_EXIT = 77;

/** The one SKIP line the driver reads: "<name>: SKIP -- <reason>". */
export function skipLine(name, reason) {
    return `${name}: SKIP -- ${reason}`;
}

/**
 * The exit status for a check that ran its clauses and collected `failures` and `skips` (reason strings):
 * 1 when anything failed, SKIP_EXIT when something was skipped, else 0. Prints the SKIP line itself when the
 * verdict is SKIP, so the caller prints only its failures and its PASS line.
 */
export function verdictExit(name, failures, skips) {
    if (failures.length) return 1;
    if (skips.length) {
        console.log(skipLine(name, skips.join('; ')));
        return SKIP_EXIT;
    }
    return 0;
}
