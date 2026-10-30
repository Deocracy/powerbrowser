---
phase: 42-community-surface-and-release-documentation-a
plan: 02
subsystem: infra
tags: [github-issue-forms, labels, quick-gate, js-yaml, self-test]

# Dependency graph
requires:
  - phase: 42-community-surface-and-release-documentation-a
    provides: labels.json declared set and the labels control (plan 42-01)
provides:
  - .github/ISSUE_TEMPLATE/bug.yml, feature.yml and config.yml (bug and feature forms only, blank issues off)
  - scripts/verify-labels.mjs, the offline label agreement gate with its --self-test
  - registry rows labels and labels-self-test in scripts/verify-platform.sh
affects: [42-04 owner checkpoint (form preview and Discussions check), 53 TEL-05 in-app report prefill, 52 claude-fixer label writers]

# Actuals (#2632)
actuals:
  tokens: 6200
  tasks: 2
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "form and workflow label writers compared to labels.json by exact name (case sensitive); declared-but-unused labels are not a fault"
    - "workflow scanning reads only issue-label writers (run lines calling gh issue or gh pr with --label or --add-label, and with.labels on label or issue actions), never runs-on"

key-files:
  created:
    - .github/ISSUE_TEMPLATE/bug.yml
    - .github/ISSUE_TEMPLATE/feature.yml
    - .github/ISSUE_TEMPLATE/config.yml
    - scripts/verify-labels.mjs
  modified:
    - scripts/verify-platform.sh

key-decisions:
  - "The bug form freezes the text field ids version, os and install_format for the later URL prefill (TEL-05); the row fails if any changes or stops being a text input"
  - "config.yml carries two contact links: the repository security policy and Discussions. The security@ mailbox is not linked here because INF-02 (Phase 47) has not routed it yet; SECURITY.md (plan 42-03) names it"
  - "Agreement direction is referenced-subset-of-declared. Declared labels such as os/* and area/* are applied by hand at triage and are not required to appear in a form"

patterns-established:
  - "Vacuity guard: zero forms, or no form naming any label, is a FAIL"
  - "Expression labels (${{ ... }}) in a writer are a FAIL, because the row cannot read them"

requirements-completed: [GH-13, GH-01]

coverage:
  - id: D1
    description: "Issue chooser offers only bug and feature forms, blank issues off, with links to the security policy and Discussions"
    requirement: "GH-01"
    verification:
      - kind: automated_ui
        ref: "scripts/verify-labels.mjs (form set exact, config.yml blank_issues_enabled false, contact links name/url/about, policy and Discussions URLs present)"
        status: pass
    human_judgment: false
  - id: D2
    description: "bug.yml labels type/bug and needs-triage; version, os and install_format are text inputs with frozen ids"
    requirement: "GH-01"
    verification:
      - kind: automated_ui
        ref: "scripts/verify-labels.mjs (required labels and BUG_IDS) and parsed field ids below"
        status: pass
    human_judgment: false
  - id: D3
    description: "Every label named by a form or workflow issue-label writer is declared in labels.json"
    requirement: "GH-13"
    verification:
      - kind: automated_ui
        ref: "scripts/verify-platform.sh --only labels; labels-self-test (undeclared form label and undeclared workflow label each red)"
        status: pass
    human_judgment: false
  - id: D4
    description: "A runs-on runner name never satisfies or breaks the agreement"
    requirement: "GH-13"
    verification:
      - kind: unit
        ref: "scripts/verify-labels.mjs --self-test (control: a runner name in runs-on that no label declares -> green)"
        status: pass
    human_judgment: false
  - id: D5
    description: "The form pages render in the GitHub issue chooser with the links live"
    requirement: "GH-01"
    verification: []
    human_judgment: true
    rationale: "Needs the live repository (Discussions enabled) and a browser; this run has no live write, so it is the 42-04 owner checkpoint"

duration: ~35min
completed: 2026-10-29
status: complete
---

# Phase 42 Plan 02: Issue forms and the offline label agreement gate

**Bug and feature issue forms with frozen prefill ids, blank issues off, and an offline gate that proves every form and workflow label is declared in labels.json.**

## Performance

- **Duration:** about 35 min
- **Started:** not recorded
- **Completed:** 2026-10-29
- **Tasks:** 2 (committed as two commits)
- **Files modified:** 5 (4 created, 1 modified)

## Accomplishments
- `bug.yml` names `type/bug` and `needs-triage`. Text fields `version`, `os` and `install_format` have frozen ids. The form also collects steps, expected behavior and optional diagnostics.
- `feature.yml` names `type/feature` and `needs-triage`, with problem, proposal and alternatives fields.
- `config.yml` sets `blank_issues_enabled: false` and links to the security policy and to Discussions.
- `scripts/verify-labels.mjs` reads `labels.json`, both forms and every workflow, and checks that each referenced label is declared (exact, case-sensitive). It also checks the form set, the bug and feature label contracts, the frozen field ids, and the config.yml contact links. A vacuity guard fails when no form names a label.
- Two quick rows (`labels`, `labels-self-test`) are registered after `zizmor-self-test`.

## Evidence

Row output on the committed tree:

```
labels: PASS -- 4 label reference(s) in 3 issue form file(s) and the workflow issue-label writers are declared in .github/settings/labels.json
labels: --self-test PASS -- 15 planted faults went red naming the file and label, and 2 control(s) stayed green
```

Parsed form fields (js-yaml, from the committed files):
- `bug.yml` labels: `["type/bug", "needs-triage"]`; field ids in order: `version`, `os`, `install_format`, `steps`, `expected`, `diagnostics` (plus a markdown block with no id).
- `feature.yml` labels: `["type/feature", "needs-triage"]`; ids: `problem`, `proposal`, `alternatives`.
- `config.yml`: `blank_issues_enabled: false`; two contact links, each with name, url and about.

Planted faults, each red naming file and label: undeclared label in a form; undeclared label in a workflow snippet; case-variant form label; expression label in a writer; malformed labels.json; case-variant duplicate in labels.json; zero forms; extra form; missing feature.yml; bug form dropping needs-triage; bug form renaming `os`; config.yml with blank issues on; config.yml without a Discussions link; config.yml link without `about`; duplicate YAML key in a form.

Green controls: a runner name in `runs-on` that no label declares; a quoted label with a space, declared and used.

## Task Commits

1. **Task 2: the three issue forms** - `23b40e2` (feat)
2. **Task 1: the agreement gate and registry rows** - `3ff8ba6` (feat)

## Files Created/Modified
- `.github/ISSUE_TEMPLATE/bug.yml` - bug form with frozen prefill ids and the two triage labels
- `.github/ISSUE_TEMPLATE/feature.yml` - feature form
- `.github/ISSUE_TEMPLATE/config.yml` - blank issues off, security policy and Discussions links
- `scripts/verify-labels.mjs` - agreement gate and self-test
- `scripts/verify-platform.sh` - `labels` and `labels-self-test` rows

## Decisions Made
- Frozen ids `version`, `os`, `install_format` are checked by the row, so a rename goes red before the TEL-05 prefill depends on it.
- Contact links carry the security policy and Discussions. The plan also asked for the security@ address as a second link. It is not linked here: INF-02 (Phase 47) has not routed that mailbox, and SECURITY.md (42-03) names it.
- Agreement is one-directional: every referenced label must be declared. Declaring os/*, format/* and area/* without a form naming them is intended, because they are applied at triage.
- Form copy names PowerBrowser, asks for facts, states that a maintainer reviews the report, and asks reporters not to paste secrets. No pref key, port, timeout or raw error text appears in the copy.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Forms landed before the gate's first green run**
- **Found during:** Task 1
- **Issue:** The plan's Task 1 requires the labels row to exit 0 on the unmodified tree, but Task 2 creates the forms. With no forms, the vacuity guard is correctly red.
- **Fix:** Wrote the three forms first, verified the gate, then committed the forms (`23b40e2`) before the gate and rows (`3ff8ba6`). Each commit is consistent on its own: forms without a gate are inert.

**2. [Rule 2 - Missing critical] Contract checks beyond the plan's list**
- **Found during:** Task 1
- **Issue:** The plan's must-haves require the bug form's labels and frozen ids, but the gate did not check them, so a rename would pass silently.
- **Fix:** The gate checks required labels per form and the three frozen bug-form ids as text inputs. Plants cover both.

### Process deviations
- Plan says "do not commit"; the run instruction for this session says to commit per task. Followed the run instruction.
- Plan-head base for this plan was recorded after its commits. The value (0254d4d) is the HEAD before the first commit.

## Issues Encountered
- A security hook flagged `yaml.load` in the new script. The hook text concerns Python's YAML loader. This script uses js-yaml 4, whose `load` builds plain data only, and `scripts/verify-workflows.mjs` uses the same call. Kept as is.

## Known Stubs
None.

## Owner follow-up
- **Form preview and Discussions (42-04 checkpoint).** Open the issue chooser on the live repo after the label apply and confirm the bug and feature forms render and the Discussions link resolves. The live Discussions flag is `has_discussions: false` as of 2026-10-22 (read-only probe); Discussions must be enabled before the config.yml link ships. Owner write, not run here.
- **Security mailbox link.** Decide at Phase 47 whether config.yml gets a second `mailto:` link to the security mailbox once INF-02 routes it.

## Self-Check: PASSED
- All five files exist and are tracked in `23b40e2` and `3ff8ba6`.
- `scripts/verify-labels.mjs` main run exits 0; `--self-test` exits 0 with 15 planted faults red and 2 green controls.
- `scripts/verify-platform.sh --quick` exits 0 on the committed tree.
