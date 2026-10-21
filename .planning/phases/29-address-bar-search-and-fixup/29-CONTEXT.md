# Phase 29: Address Bar Search and Fixup - Context

**Gathered:** 2026-10-21
**Status:** Ready for planning
**Mode:** Auto-generated (discuss skipped via workflow.skip_discuss)

<domain>
## Phase Boundary

The pill searches typed text, opens development addresses, and handles typing,
picking and editing results the way Firefox's address bar does (ROADMAP.md
Phase 29; requirements BAR-01..14).

</domain>

<decisions>
## Implementation Decisions

### Recorded rulings that apply (REQUIREMENTS.md header and PROJECT.md Key Decisions)
- Typed non-URL text may search (lifts 13-UI-SPEC "no new addressability scheme").
- The chrome bar may write to Places (Shift+Del is the first write), only through PowerBrowserAPI.
- Search suggestions are ON by default, with a setting to turn them off; the engine set and default engine come from configuration.toml via distribution/policies.json SearchEngines; suggest hosts get endpoint-allowlist.json rows in this phase (keep allowlist-doc-consistency green).
- No clipboard-reading suggestion.
- Chrome-bar copy reads the configured application name, never a hard-coded brand (BAR-14).
- Overlay loads to other loopback ports never carry the Theia token cookie; clear-data never removes it.
- The modes dropdown is Phase 30, not this phase; keep the pill structure ready for it (address-bar/ split is Phase 30's).
- Extensions tab host is Phase 31.1 (signed off 2026-10-21); this phase must not depend on it.

### Claude's Discretion
All other choices are at Claude's discretion (discuss skipped). Use the ROADMAP
goal and notes, .planning/research/SUMMARY.md (Phase 2 section, D1-D8,
Pitfalls 6, 10, 11, 13, probes 11 and 13), STACK.md (SearchService via moz-src,
await init(), URIFixup, SearchSuggestionController) and codebase conventions.

</decisions>

<code_context>
## Existing Code Insights

Phase 27 built the push router, action kinds, shortcut relay and live probe
harness (scripts/lib/pb-live-probe.mjs, scripts/verify-nav-keys-live.mjs);
reuse them. Codebase context is gathered during plan-phase research.

</code_context>

<specifics>
## Specific Ideas

None beyond the ROADMAP description and success criteria.

</specifics>

<deferred>
## Deferred Ideas

None — discuss phase skipped.

</deferred>
