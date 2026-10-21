---
phase: 29-address-bar-search-and-fixup
plan: 03
subsystem: rebrand manifest / generator / distribution policy / endpoint allowlist
status: complete
tags: [BAR-04, BAR-03, search-engines, policies, endpoint-allowlist, generator]
requires: [29-02]
provides:
  - "configuration.toml [[search_engines]] table (name, url, suggest_url); shipped: DuckDuckGo Lite (default), Wikipedia"
  - "config-schema rows search_engines[].name / .url / .suggest_url; url rows require https and {searchTerms}"
  - "generate.mjs: SEARCH_ENGINES_PREFIX, validateSearchEngineElements, export emitSearchEngines, frozen search-engines.json row, engine hosts in manifestEndpointSources"
  - "powerbrowser/distribution/policies.json SearchEngines {Add, Default}"
  - "three endpoint-allowlist allow rows marked search_engines[0].url, search_engines[0].suggest_url, search_engines[1].url"
  - "docs/REBRANDING.md [[search_engines]] reference section"
  - "scripts/verify-search-engines.mjs (static, --quick, --self-test with four plants); registry rows search-engines, search-engines-self-test"
affects: [29-04]
tech-stack:
  added: []
  patterns:
    - "EXT-03 fragment pattern reused: generated fragment, tracked key copied over by key, gate compares both directions"
    - "Shipped-name collision derived from the pinned upstream's search-config-v2.json at check time, SKIP when upstream/ is absent"
key-files:
  created:
    - scripts/verify-search-engines.mjs
  modified:
    - configuration.toml
    - scripts/lib/config-schema.json
    - scripts/generate.mjs
    - powerbrowser/distribution/policies.json
    - powerbrowser/endpoint-allowlist.json
    - docs/REBRANDING.md
    - scripts/verify-platform.sh
decisions:
  - "Shipped engines are DuckDuckGo Lite (default) and Wikipedia; neither name equals a shipped Firefox name (DuckDuckGo, Wikipedia (en)), and no template carries a partner, affiliate or tracking parameter"
  - "[urls] search is left in the schema and superseded by [[search_engines]]; the shipped manifest never set it, and removing the schema row would break downstream manifests that do"
  - "Duplicate engine names are refused case-insensitively in generate; collision with a shipped Firefox name is the gate's check, because it needs upstream/"
  - "The gate's 'url without {searchTerms}' plant goes through generate's own validation (step 0), so it proves the validator, not only gate step 4"
metrics:
  duration: 11m
  completed: 2026-10-21
  tasks: 2
  files: 8
commits: 2
plan_head_before: c83be224aad3722e403b04bac0c865b2e4ecd3b0
plan_head_after: 1e3d09defb9c6c7eebe09f7ebf57243d4fc8a8bf
actuals:
  tokens: 9200
  tasks: 2
  commits: 2
---

# Phase 29 Plan 03: Configured Search Engines Summary

`configuration.toml` now holds the `[[search_engines]]` table, the only input for the search engine set and the default engine. `generate.mjs` validates the table and emits it as `generated/search-engines.json`. That fragment is copied by key into the tracked `SearchEngines` policy. The engine hosts become marked endpoint-allowlist rows by derivation, and `verify-search-engines` goes red on drift in either direction and on a shipped-name collision.

## What was built

- **Manifest:** two `[[search_engines]]` entries, with a comment block in the file's style.
  - `DuckDuckGo Lite`: `https://lite.duckduckgo.com/lite/?q={searchTerms}`, suggest `https://ac.duckduckgo.com/ac/?q={searchTerms}&type=list`
  - `Wikipedia`: `https://en.wikipedia.org/wiki/Special:Search?search={searchTerms}`, suggest `https://en.wikipedia.org/w/api.php?action=opensearch&search={searchTerms}`
  - The first entry is the default.
- **Schema:** `search_engines[].name` is required and refuses an empty, blank or control-character name. `search_engines[].url` is required. `search_engines[].suggest_url` is optional. Both URL rows use `^https://[^\s\x00-\x1f\x7f]*\{searchTerms\}[^\s\x00-\x1f\x7f]*$`.
- **Generator:** `validateSearchEngineElements` is a clone of the webextensions validator. It names each entry by name or ordinal. It refuses duplicate names compared case-insensitively, a non-https URL, a URL without `{searchTerms}`, and an empty name. The generic regex loop skips `search_engines[].*`.
- **Emitter:** `emitSearchEngines` emits `{Add:[{Name, URLTemplate, SuggestURLTemplate?}], Default}` in manifest order. It passes every value through `assertEmittable`, emits no `IconURL`, `Method`, `PostData` or `Remove`, and emits `{}` when the table is absent. Its frozen TARGETS row is `search-engines.json` (dev) with no tracked comparand.
- **Policy:** `policies.json` gained `SearchEngines`, equal to the fragment. The four sibling values are unchanged. Only the `ExtensionSettings` line changed, by gaining its trailing comma.
- **Endpoints:** `manifestEndpointSources` takes `search_engines[i].url` and `.suggest_url`. Three new allow rows, each with a hand-written reason and a `manifest` field: **lite.duckduckgo.com**, **ac.duckduckgo.com** and **en.wikipedia.org**. None is a Mozilla host, so `allowlist-doc-consistency` is unaffected. When a configured host changes, its marked row goes stale and `theia-endpoints` step 3 goes red.
- **Gate:** `verify-search-engines.mjs` runs four steps:
  1. The fragment equals the emission.
  2. The tracked key deep-equals the emission (entry names, order, Default, no extra key). An engine that outlives its manifest entry fails naming the engine.
  3. No configured name collides, case-insensitively, with a `base.name` in `upstream/services/settings/dumps/main/search-config-v2.json`.
  4. Every configured and tracked template is https and holds `{searchTerms}`.

  A manifest that writes a `[[search_engines]]` header but resolves to zero engines fails.

## Verification

- `node scripts/generate.mjs` and `--check`: PASS (54 files).
- `node scripts/verify-search-engines.mjs`: PASS. `--self-test`: PASS. The control and the synthetic fixture are green. Four plants are red, each naming its token: `Acme Gone` (stale tracked engine), `Acme Shipped` (collision), `Acme Broken` (url without `{searchTerms}`, refused by generate), and `"Remove"` (extra policy key).
- A manual negative run of generate on a duplicate, an http URL, an empty name and a URL without `{searchTerms}` gave four failures, each naming its entry.
- `verify-webextensions`, `verify-theia-endpoints` (+ `--self-test`), `verify-rebranding-docs`, `generate --self-test` (66 plants) and `scan-brand-residue`: all PASS.
- `scripts/verify-platform.sh --quick`: **PASS** (exit 0, 144 PASS rows, no FAIL).
- **Expected red, not run:** the full-run row `ng072-policies-packaged-webextension` compares the packaged policy file byte for byte. It stays red until 29-04 repackages. This plan does no build.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] generate --self-test's endpoint-host literals went red once engine hosts were derived**
- **Found during:** Task 2 (`--quick`)
- **Issue:** The case `manifest endpoint hosts derive the stated hosts and repoint the prefs` hand-keeps literal host lists for downstream fixtures that inherit the defaults layer. The shipped `[[search_engines]]` hosts now reach every fixture that does not restate the table.
- **Fix:** The first fixture now restates its own one-engine list. Its literal gains `search.example.org` and `suggest.example.org`, which proves engine hosts derive and that arrays replace. The second fixture's literal gains the three inherited engine hosts. The comment records why.
- **Files modified:** scripts/generate.mjs
- **Commit:** 1e3d09d

### Notes

- **Plan acceptance grep defect:** `grep -n "search-engines|" scripts/verify-platform.sh` prints 1 line, not 2. The plan-named self-test row `search-engines-self-test|...` does not contain the substring `search-engines|`. Both rows exist (`grep -nE "search-engines(-self-test)?\|"` prints 2).
- **Commit ordering:** at the Task 1 commit, `--quick` was red only on `verify-rebranding-docs` (+ self-test), because the three new schema keys were not yet documented. Task 2 owns the guide rows and turned it green. No other check was red at either commit.
- **Requirements left Pending:** `requirements.mark-complete BAR-04 BAR-03` was run and then reverted. This plan delivers BAR-04's manifest half and BAR-03's allowlist half only. 29-04 proves BAR-04 on the packaged build, and 29-06 owns BAR-03's suggestions.
- **`[urls] search`:** the shipped manifest never set it (the plan text assumed it did). The schema row stays, superseded by `[[search_engines]]`.

## Known Stubs

None.

## Threat Flags

None. The new egress hosts are the threat model's T-29-13 surface, and each is allowlisted and marked.

## Self-Check: PASSED

- FOUND: scripts/verify-search-engines.mjs, configuration.toml `[[search_engines]]` x2, policies.json SearchEngines, three marked allowlist rows, REBRANDING.md section
- FOUND: b08fc1a, 1e3d09d (ancestors of HEAD)
