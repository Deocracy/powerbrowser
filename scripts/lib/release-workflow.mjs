// scripts/lib/release-workflow.mjs
//
// Helpers shared by the three release.yml rows (release-shape, mar-channel-gate,
// release-asset-set): the YAML loader, the step list of a job, and the fail-open check every
// gate, signing, verification and publish step must pass (review WR-03). A step that carries
// continue-on-error, an `|| true`, a `set +e` or no `set -euo pipefail` can report green while
// the thing it guards did nothing.

import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

// js-yaml from theia/, the same loader as the workflows row. Throws when it is not installed.
export function loadYaml() {
    return createRequire(join(REPO_ROOT, 'theia', 'package.json'))('js-yaml');
}

export function stepsOf(job) {
    return Array.isArray(job?.steps) ? job.steps.filter(s => s !== null && typeof s === 'object') : [];
}

// The reasons a step can pass while its guard did nothing. `allowedIf` is the exact `if:` the step
// may carry (undefined = none). An empty list means the step fails closed.
export function failOpenFaults(step, allowedIf = undefined) {
    const out = [];
    const run = String(step.run ?? '');
    if (Object.hasOwn(step, 'continue-on-error') && step['continue-on-error'] !== false) {
        out.push(`carries continue-on-error: ${JSON.stringify(step['continue-on-error'])}`);
    }
    if (String(step.if ?? '') !== String(allowedIf ?? '')) {
        out.push(`carries if: ${JSON.stringify(step.if ?? null)} (allowed: ${JSON.stringify(allowedIf ?? null)})`);
    }
    if (/\|\|\s*(true|:)(\s|$|;|\))/m.test(run)) out.push('swallows a failure with `|| true` or `|| :`');
    if (/\bset\s+\+e\b/.test(run)) out.push('runs `set +e`');
    if (run !== '' && !/^\s*set -euo pipefail\s*$/m.test(run) && run.includes('\n')) out.push('has a multi-line script with no `set -euo pipefail`');
    return out;
}

// The body of the first `if <head> ... then ... fi` block whose head matches, or null. The block
// ends at the first line that is only `fi`, so an `exit 1` is "inside" only if it sits in the branch.
export function ifBody(run, headRe) {
    const m = new RegExp(`${headRe.source}[^\\n]*then\\n([\\s\\S]*?)\\n\\s*fi\\s*(?:\\n|$)`).exec(run);
    return m === null ? null : m[1];
}
