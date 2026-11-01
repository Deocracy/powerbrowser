---
phase: 53-support-operations-g
reviewed_source: .planning/workstreams/deploy/phases/53-support-operations-g/53-REVIEW.md
fix_scope: CR-01 CR-02 CR-03 WR-01 WR-02 WR-03 WR-04 WR-05 WR-06 WR-07 WR-08 IN-03 IN-04
findings_in_scope: 13
fixed: 13
skipped: 0
status: all_fixed
---

# Phase 53: Code Review Fix Report

Each finding is one commit on branch dsh/phase-53, with explicit paths. The quick gate (`scripts/verify-platform.sh --quick`) exits 0 at the last fix commit. Full-tier live rows were not run: they need network and the owner's repositories.

## Findings

- CR-01: FIXED 9f74d0c. classify runs the package install.cjs after `npm ci --ignore-scripts` and smoke-tests the binary with `--version` before the model step, so a stub fails the job. Rule `install`, two plants.
- CR-02: FIXED 2117b03. classify captures the title and body through `env:` into step outputs under a random GITHUB_OUTPUT delimiter, and the prompt quotes them between `issue_data` tags after the instructions. The event-text rule is unchanged: event text stays out of `run:` and `prompt:` in both jobs. Rule `issue-data`, three plants.
- CR-03: FIXED 55f3c0f. The live GitHub repository is the owner/repo of `urls.release_notes` in configuration.toml, read through the shared TOML parser. The self-test moves the manifest slug and requires the derived slug to follow, and refuses a release_notes URL without an owner/repo.
- WR-01: FIXED 80f0c60. The mirror unit runs as a dynamic user with StateDirectory, NoNewPrivileges, ProtectSystem=strict, ProtectHome, PrivateTmp, a 15 minute TimeoutStartSec and only the IPv4, IPv6 and local-socket families. The token enters through `LoadCredential=mirror-push` from a root-readable file outside the tree. The push drops `--prune`, never forces, and the unit stops before the push when refs/heads/main is missing. `systemd-analyze verify` passes.
- WR-02: FIXED c5ffab4. The timer comment names the full-tier `codeberg-mirror-live` row. BLOCKED.md item 6 records the missing sweep detection as a dependency on the Phase 48 and Phase 51 sweep.
- WR-03: FIXED debbbf8. claude_args is read as shell words. `--tools` must be the empty value; `--allowedTools`, `--allowed-tools` and `--mcp-config` are refused; `--json-schema` must parse and require labels and template_id with the template enum; `--max-turns` must be 1 to 5. Six plants.
- WR-04: FIXED 409ad29. The concurrency group is `triage-${{ github.event.issue.number }}`, and the verifier requires that group. Two plants.
- WR-05: FIXED 7fcb249. The label edit sits in try/catch with a logged warning, so the fixed comment always posts. The planted-instruction proof runs in two modes, and in the second the stub exits 1 on `issue edit`. An isolation plant proves the second mode.
- WR-06: FIXED 0c9bb07. The updates target is the full update descriptor URL, so /update.xml is watched. The live half reads the status repository's `.upptimerc.yml`, and its sites must equal the URLs the declared targets derive from the manifest; this is the feed the declaration was missing. The 36-hour age rule applies to the four scheduled workflows only. Enabled-state still applies to all.
- WR-07: FIXED 4a3008d. install_format has no in-tree source: the chrome identity carries name, vendor and version only, and the only packaging script is the Linux tarball. The row names the deferral on PASS and goes red if the deferral record beside the constant is removed. The diagnostics layer gains a Copy diagnostics button whose click writes the rows and log to the clipboard, never a URL; the row checks that wiring. The live clipboard write is an owner check in BLOCKED.md.
- WR-08: FIXED 18c22a4. The codeberg and upptime self-tests compare each plant's failure text and rule against its expected fragment, instead of a boolean or a shared-rule shortcut. Each upptime plant names its target, workflow or URL.
- IN-03: FIXED 5949067. The triage row fails when the fixture differs from the tree workflow byte for byte, or is missing. The self-test requires the identical pair to be green and a one-comment drift to go red naming the fixture.
- IN-04: FIXED eefb5d5. apply declares no environment and references no `secrets.` expression. Only classify holds the key and the triage environment. Verifier rules and three plants.

## Not in this pass

Not requested in this fix set: IN-01 (brand inventory count), IN-02 (SHA-form admission for the action), IN-05 (mirror repository creation steps). They remain open in 53-REVIEW.md.

## Judgment calls

- CR-02: the review offered two routes. Event text in the prompt would need an exemption in the shared `verify-workflows` event-text rule, which covers every workflow. The `env:` capture keeps that rule unchanged and keeps event text out of `prompt:`.
- WR-01: the ref-count threshold is replaced, not implemented. The push cannot delete or rewrite Codeberg refs because it neither prunes nor forces, so git refuses non-fast-forward updates. The main-branch guard covers the empty-origin case.
- WR-06: the live half is not exercised here (no network or gh). Its site comparison is exercised through the pure function in the self-test.
- WR-07: the Copy button is verified by static wiring only. The chrome-side clipboard write needs a live check, recorded in BLOCKED.md.

## Verification

- Rows run and green: triage-workflow, triage-workflow-self-test, workflows, workflows-self-test, zizmor, codeberg-mirror, codeberg-mirror-self-test, upptime-config, upptime-config-self-test, bug-report-affordance, bug-report-affordance-self-test, endpoint-dispositions-self-test, repo-controls-self-test.
- Full tier, expected red until the owner acts: upptime-sweep-live fails closed with no status repository declared (BLOCKED.md item 3).
- `tsc --noEmit` for theia/extensions/branding under `nix develop .#theia`: exit 0.
- `systemd-analyze verify` on both mirror units: no errors.
- Full `scripts/verify-platform.sh --quick`: exit 0.
