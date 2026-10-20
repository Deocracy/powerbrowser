# Phase 27: Groundwork, Navigation Buttons and Page-Focus Keys - Context

**Gathered:** 2026-10-20
**Status:** Ready for planning
**Mode:** Auto-generated (discuss skipped via workflow.skip_discuss)

<domain>
## Phase Boundary

The navigation buttons and Firefox's browser keys work while a web page has
focus, built on the shared channel every later v1.5 phase extends
(ROADMAP.md Phase 27: goal, Groundwork line, success criteria;
requirements NAV-01..06, KEY-01..05).

</domain>

<decisions>
## Implementation Decisions

### Recorded rulings that apply (REQUIREMENTS.md header, 2026-10-20)
- Firefox keys that clash with Theia keys take the browser meaning only while a
  web page has focus; only Firefox's unblockable keys are reserved, the rest use
  the reply path (research SUMMARY.md D6, Pitfall 3).
- Chrome-bar copy reads the configured application name, never a hard-coded brand.
- Stock Firefox toolkit popups in powerbrowser.xhtml are shell furniture (rule 5
  clarified); not needed in this phase.

### Decided after research (autonomous, recommended, 2026-10-20)
- F6 / Shift+F6 use Firefox's `requestReplyFromRemoteContent()` pattern with a
  `defaultPreventedByContent` test (27-RESEARCH.md Open Question 1). If the live
  probe disproves that attribute, F6 falls back to a reserved row that is enabled
  only while an overlay has focus; with the Theia frame focused the row is
  disabled, so F6 keeps Theia's meaning there and the 2026-10-20 key ruling holds.
- Ctrl+L moves from always-reserved to the page-focus-scoped mechanism (Open
  Question 2); this supersedes 14.1-UI-SPEC A13's "guaranteed exit" wording.
- Remaining Open Questions 3-6 take the research recommendation.

### Claude's Discretion
All other implementation choices are at Claude's discretion — discuss phase was
skipped per user setting. Use the ROADMAP phase goal, success criteria,
.planning/research/SUMMARY.md (Phase 1 section, D6, D7, Pitfalls 2/3/7/8) and
codebase conventions to guide decisions.

</decisions>

<code_context>
## Existing Code Insights

Codebase context will be gathered during plan-phase research. Starting points:
.planning/research/ARCHITECTURE.md (groundwork G1-G11), STACK.md (browser-element
methods, keybinding clashes), PITFALLS.md.

</code_context>

<specifics>
## Specific Ideas

No specific requirements beyond the ROADMAP phase description, success
criteria and the research files above.

</specifics>

<deferred>
## Deferred Ideas

None — discuss phase skipped.

</deferred>
