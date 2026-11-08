# Phase 29 — review input (carry into /gsd-code-review 29 --fix)

## SEC-29-A (medium): chrome ignores the suggestion policy

Source: automated commit security review of 760de54 (29-06), triaged 2026-10-21.

`searchSuggestions()` in `powerbrowser/shell/PowerBrowserAPI.sys.mjs` calls
`SearchSuggestionController.fetch` without checking `browser.search.suggest.enabled`.
A `SearchSuggestEnabled: false` policy (locks that pref false) is therefore bypassed when the
Theia setting `browser.searchSuggestions` is on: typed text still reaches the engine.

Fix: in chrome, return `[]` before the fetch when
`Services.prefs.getBoolPref("browser.search.suggest.enabled", true)` is false; add a plant to
the Phase 29 suggestion check that sets the pref false and requires zero fetches.

Triaged as not applicable (no change):
- Frame-side consent only: the sender is the Theia frame (sender wall), which owns the setting; pages cannot send this kind.
- `inPrivateBrowsing: false`: the shell window is never private.
- Preferences-not-ready treated as on: matches Chris's ruling "suggestions ON by default" (2026-10-20).
