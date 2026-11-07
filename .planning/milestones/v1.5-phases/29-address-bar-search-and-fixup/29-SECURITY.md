---
phase: "29"
slug: "address-bar-search-and-fixup"
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: "2026-10-21"
---

# Phase 29 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.
> Audited by gsd-security-auditor over 8b4f6fb..c707fca (includes the 29-REVIEW-FIX iteration 1 fixes WR-01..WR-12 and the iteration 2 fix NEW-01). Evidence keys: API = powerbrowser/shell/PowerBrowserAPI.sys.mjs, TS = powerbrowser/shell/TheiaService.sys.mjs, WIDGET/ROWS/PREFS = theia/extensions/chrome-bar/src/browser/{chrome-bar-widget.tsx, address-bar-rows.ts, chrome-bar-preferences.ts}, WEBTAB/PROTO = theia/extensions/tab-uris/src/browser/{web-tab.ts, tab-store-access-protocol.ts}, GEN = scripts/generate.mjs, SCHEMA = scripts/lib/config-schema.json, ALLOW = powerbrowser/endpoint-allowlist.json, SSC = upstream/toolkit/components/search/SearchSuggestionController.sys.mjs, LIVE/STRIP/BRIDGE/ENG/EP/COPYGATE = scripts/verify-{address-bar-live, token-cookie-strip, web-tab-bridge, search-engines, theia-endpoints, shell-error-copy}.mjs.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Theia frame → PowerBrowserGroup store kinds | the unprivileged frame sends typed text, engine names, URLs and clipboard/history requests to chrome | typed text (may be sensitive), engine name, URLs |
| typed text → URI fixup and engine template | user text becomes a URL chrome loads into an overlay | URL (validated http(s)) |
| overlay, stock window or worker → loopback server | a dev server on another 127.0.0.1 port is untrusted | POWERBROWSER_TOKEN cookie (credential) |
| Theia backend relay → chrome store kinds | the backend (AI tools, extensions) may forward only whitelisted kinds | store messages |
| configuration.toml → policies.json | a downstream's engine values land in the policy document | engine names, URL templates |
| shipped engines → the network | engine hosts are deliberate egress | search terms, suggest prefixes |
| settings.json → engine choice | a preference value reaches chrome as an engine name | engine name (User scope only) |
| chrome / Places / engine suggest endpoint → Theia frame | engine names and icons, page titles, URLs, favicons, remote suggestion strings render in the frame | strings, data:image/ URIs |
| row data → tab activation / new tab | a row's url selects or opens a tab | URL |
| drag source → pill drop | a page or another app supplies the dropped payload | URL / text (attacker-shaped) |
| Theia frame → Places write, clipboard read | Shift+Delete history removal; Paste and Paste & Go | URL; clipboard text (sensitive) |
| user text → widget memory; IME → pill | unsubmitted per-tab drafts; staged composition text | typed text (sensitive) |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-29-01 | Tampering | resolveTypedAddress result | high | mitigate | http(s) wall on the resolved URL, not the input (API:4431-4433); engine submission refused when postData is set or the scheme is not http(s) (API:4361-4366), used by both the keyword and forceSearch (WR-07) paths (API:4402, 4428); live `refused` covers javascript:, file:, chrome:, about: (LIVE:547-550, 553) | closed |
| T-29-02 | Spoofing | resolveTypedAddress sender | high | mitigate | groupSenderIsTheia + storeSenderInShellWindow run before any kind is dispatched (API:3744-3747) | closed |
| T-29-03 | Tampering | engineName argument | medium | mitigate | type and 256-character check (API:4396, 4487); exact-name match within the bar set, never substituted (API:4351-4358); `no-engine` reply (API:4402, 4428) | closed |
| T-29-04 | Info disclosure | typed text in logs | medium | mitigate | refusals are fixed text (API:4394, 4397); the store catch withholds non-refusal error text and logs kind + class only (API:3815-3825); the Phase 29 section (API:4303-4649) has no log call | closed |
| T-29-05 | DoS | oversized typed text | low | mitigate | 2048-character cap before fixup (API:4393; frame side WIDGET:589) | closed |
| T-29-06 | Info disclosure | POWERBROWSER_TOKEN to 127.0.0.1:<other port> | high | mitigate | strip installed from setGroupSenderPort (API:2210-2213), called by _swap synchronously after the cookie mint (TS:920, 939, 1461); fail closed with no recorded port (API:4564); header filter by cookie name (API:4595-4597); install-site, overlay and filter pins with 6 plants (STRIP:97-125, 156-176); live stock-window/overlay/subresource/worker loads with probe-cookie control and the `token-strip-off` plant (LIVE:425-533, 2502) | closed |
| T-29-07 | Elevation | dev server replaying the token | high | mitigate | same strip; cookie stays HttpOnly and host-only (API:536-548); overlays lose it even on the sidecar port (API:4569-4572, STRIP:117); live sidecar-overlay load must not get 200 (LIVE:480-491, WR-12) | closed |
| T-29-08 | DoS | strip over-reaching the Theia frame | medium | mitigate | non-overlay contexts and system/sidecar-origin principals keep the token on the sidecar port (API:4563-4575); live credentialed 200 vs uncredentialed refusal (LIVE:529-533) | closed |
| T-29-09 | Elevation | privileged or network kind via backend relay or a command | high | mitigate | rule 12: STORE_KIND_CLASSES set equality (BRIDGE:88-104, 453-456); network/privileged kinds refused in TAB_STORE_RELAY_KINDS (BRIDGE:467-477; PROTO:58-65 lists none of the Phase 29 kinds); privileged kinds callable only from chrome-bar-widget.tsx, named by no command or keybinding file (BRIDGE:484-497); plants (BRIDGE:539-579) | closed |
| T-29-10 | Info disclosure | cookie values in logs | low | mitigate | the observer and its installer log nothing (API:4577-4609); the static gate reads source, not values | closed |
| T-29-11 | Tampering | engine values in policies.json | medium | mitigate | assertEmittable on every name, url and suggest_url (GEN:2138-2145); schema regexes refuse control characters and non-https (SCHEMA:263-283), applied per entry (GEN:944-1000) | closed |
| T-29-12 | Tampering | template not https or lacking {searchTerms} | medium | mitigate | schema regex (SCHEMA:270-283); gate step 4 over manifest and tracked policies (ENG:214-226); resolve-time http(s) wall (API:4363) | closed |
| T-29-13 | Info disclosure | engine hosts without an allowlist row | medium | mitigate | engine url/suggest_url hosts derived into endpoint coverage (GEN:2801-2803); rows marked by manifest key (ALLOW:30, 36, 42); stale rows go red (EP:157-162); verify-theia-endpoints PASS at audit | closed |
| T-29-14 | DoS | configured engine silently dropped (duplicate name) | low | mitigate | case-insensitive duplicate check in the manifest (GEN:954-966); collision against the shipped search-config-v2 dump (ENG:197-206) | closed |
| T-29-15 | Tampering | workspace settings redirecting search | medium | mitigate | both settings declared User scope (PREFS:40, 46) and read via inspectInScope(User) (WIDGET:1218-1220); a name not in chrome's list is never sent (WIDGET:360-363); chrome matches exactly (API:4354) | closed |
| T-29-16 | Info disclosure | engine icon URLs fetched by the frame | low | mitigate | only data:image/ strings ≤ 65536 cross, else null (API:4444); safeIcon re-check in the frame (ROWS:34-36, WIDGET:1672, 1694-1696) | closed |
| T-29-17 | Spoofing | engine names in the frame | low | mitigate | names reach the DOM only as React text/attributes (WIDGET:1677-1696, aria-label); the hover passes a string, which Theia's HoverService sets as textContent | closed |
| T-29-18 | Tampering | page titles and URLs in rows | medium | mitigate | rows render title and caption as text nodes (WIDGET:2039-2045); no dangerouslySetInnerHTML or innerHTML anywhere under chrome-bar/src | closed |
| T-29-19 | Info disclosure | favicon as tracking beacon | medium | mitigate | Places cache only, data:image/ ≤ 65536 (API:4455-4475); safeIcon in iconFor (ROWS:86-94); the rows scenario records every dropdown img src (LIVE:749-771) | closed |
| T-29-20 | Tampering | placesFavicons input | low | mitigate | array required, at most 10, each an http(s) string ≤ 8192 (API:4456-4463); sender walls run first (API:3744) | closed |
| T-29-21 | Spoofing | hard-coded product name in a rebrand | low | mitigate | brand derived from configuration.toml at check time and banned over every chrome-bar .ts/.tsx/.css (COPYGATE:622-670); plants (COPYGATE:952-977) | closed |
| T-29-22 | Info disclosure | intranet hosts/URLs sent to an engine | high | mitigate | chrome re-resolves and returns [] unless kind is search (API:4490-4493); the frame gates on the reply, the setting and composition (WIDGET:990-993); live URL-shaped and localhost:4000 fences with a positive control and the `setting-ignored` plant (LIVE:918-967, 2504) | closed |
| T-29-23 | Info disclosure | cookies or identity on suggest requests | medium | mitigate | upstream controller sets LOAD_ANONYMOUS \| INHIBIT_PERSISTENT_CACHING (SSC:475) and keys privateBrowsingId on the explicit inPrivateBrowsing (SSC:483); passed explicitly (API:4506); no patch touches SSC | closed |
| T-29-24 | Tampering | remote suggestion strings | medium | mitigate | at most 4 strings of at most 512 characters (API:4510-4513); rendered as text nodes (WIDGET:2043); a committed suggestion goes through commitText and the resolve wall (WIDGET:1286-1289) | closed |
| T-29-25 | Elevation | backend relaying searchSuggestions | medium | mitigate | classed `network` (BRIDGE:99); refused from the relay list by rule 12 (BRIDGE:476-477); absent from PROTO:58-65 | closed |
| T-29-26 | Tampering | one-off changing the default engine | low | mitigate | the engine name rides one resolve request (WIDGET:1608-1624); no store kind writes the default (setSetting is a fixed-key tabs.sqlite allowlist, API:3967-3981); live check reads default and setting after a one-off (LIVE:1074) | closed |
| T-29-27 | Tampering | non-http(s) row url in a new tab | medium | mitigate | openInBackground throws on non-http(s) (WEBTAB:782-785); openRowInNewTab refuses before either opener (WIDGET:1359-1364); heuristic and engine rows resolve through the wall (WIDGET:1334-1347); chrome webTabOpen wall unchanged (API:3236-3237) | closed |
| T-29-28 | Spoofing | row switching to the wrong tab | low | mitigate | exact url match against live main-area web tabs (WIDGET:1304-1307); a vanished tab falls back to commitRow; row.uri never used (WIDGET:1315-1319) | closed |
| T-29-29 | Tampering | autofill SQL | medium | mitigate | input shape refused before the query (API:4523); LIKE escapes (API:4526); read-only promiseDBConnection, SELECT with bound parameters only (API:4527-4535) | closed |
| T-29-30 | Tampering | dropped javascript:/file:/data: payload | high | mitigate | readable non-http(s) link data gets dropEffect none (WIDGET:107-114, 512-518); every pill drop resolves through the wall, refused text shows the failure row (WIDGET:570-596); own-text pill drag never loads (WIDGET:531-539, WR-08); live javascript: uri-list and text drops (LIVE:1700-1713) | closed |
| T-29-31 | Info disclosure | autofill revealing history to the page | low | accept | completion renders only in the pill inside the Theia frame — see AR-29-01 | closed (accepted) |
| T-29-32 | Elevation | extension or AI tool deleting history or reading the clipboard | high | mitigate | removeHistoryEntry and readClipboardText classed privileged (BRIDGE:102-103); not relayed, widget-only callers (WIDGET:764, 780, 1567), no command or keybinding file names them (BRIDGE:476-497); plants (BRIDGE:558-573) | closed |
| T-29-33 | Info disclosure | clipboard text in logs, pushes or storage | high | mitigate | chrome read has no log and returns the text only to the requesting actor (API:4636-4649, 3808-3810); the frame only inserts it (WIDGET:761-774) or commits it (WIDGET:777-793); no log in either path | closed |
| T-29-34 | Info disclosure | clipboard read without a gesture | medium | mitigate | Paste and Paste & Go always enabled with no probe; enablement reads only the input (WIDGET:698-724); live read counter with the `paste-reads-on-open` plant (LIVE:1940-1984, 2510) | closed |
| T-29-35 | Tampering | removeHistoryEntry argument | medium | mitigate | storeUrlArg + http(s) check (API:4621-4626, 3736-3741); only history-source rows are removable (WIDGET:1537-1549); live bookmark check with the `shift-del-bookmark` plant (LIVE:1834, 2509) | closed |
| T-29-36 | Tampering | Paste & Go with a hostile clipboard | medium | mitigate | Paste & Go calls commitText, the resolve wall (WIDGET:788, 1412-1441) | closed |
| T-29-37 | Info disclosure | drafts on disk or in logs | medium | mitigate | WeakMap in the widget only (WIDGET:264); saved only when the text differs from the committed address and the owner is live (WIDGET:1806-1811); deleted on restore (WIDGET:1787-1791); no log, push or store call carries it | closed |
| T-29-38 | Info disclosure | partial IME text sent to an engine | medium | mitigate | composing() gates every key (WIDGET:1443-1447) and every query (WIDGET:1140-1144, 991); live check with positive control and the `ime-guard-off` plant (LIVE:2148-2221, 2511) | closed |
| T-29-39 | Spoofing | one tab's draft shown in another | low | mitigate | drafts keyed by widget identity; a switch without a draft always re-syncs (WIDGET:1770-1798); live drafts scenario across three tabs with the `draft-lost` plant (LIVE:2292-2321) | closed |
| T-29-SC | Tampering | npm/pip/cargo installs (all ten plans) | low | accept | no package manifest or lockfile changed in 8b4f6fb..c707fca — see AR-29-02 | closed (accepted) |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

### Carried Triage

- **SEC-29-A (medium, refuted):** the claim that searchSuggestions() bypasses a `SearchSuggestEnabled: false` policy is false. Upstream SearchSuggestionController defines `suggestionsEnabled` as a live pref getter on `browser.search.suggest.enabled` (SSC:23) and calls #fetchRemote only when it is true (SSC:339, within 336-344). The policy sets and locks that pref (upstream/browser/components/enterprisepolicies/Policies.sys.mjs:3191-3195). No patch touches the controller. Recorded as IN-01 in 29-REVIEW.md. The optional live plant that locks the pref false and requires zero suggest requests is not built; an upstream rebase that drops the gate would go unnoticed.

### Open Items

None at or above high. None below threshold.

Informational, not registered: tokenCookieAllowed keeps the token for any non-overlay browsing context on the sidecar port (API:4569-4572), which includes a stock-window tab opened on the sidecar origin. The comment at API:4553-4555 names only the Theia frame, chrome and Theia-origin workers. The receiver is the sidecar itself, so no third party gets the token; T-29-07's overlay requirement holds.

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-29-01 | T-29-31 | The autofill completion is written only into the address pill, inside the Theia frame (WIDGET:931-954). No page receives it, and autofillOrigin is a store kind behind the shell-frame sender walls (API:3744). | plan 29-08 disposition (autonomous run) | 2026-10-21 |
| AR-29-02 | T-29-SC | No package manifest or lockfile changed in the phase; no install surface was added. | plan disposition, all ten plans (autonomous run) | 2026-10-21 |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-10-21 | 40 | 40 | 0 | gsd-security-auditor (ASVS L1, block_on high) |

Static gates re-run at audit (clean and --self-test, all exit 0): token-cookie-strip, web-tab-bridge, search-engines, shell-error-copy, chrome-bar-suggestions, address-bar-rows; verify-theia-endpoints PASS. The live evidence (verify-address-bar-live.mjs scenarios and plants) is from the 29-REVIEW-FIX runs: iteration 1's full self-test (all 13 plants red) and iteration 2's `oneoff-retry-recommits` plant only. This audit did not re-run the live suite, because it needs a built browser and a display.

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-10-21 (autonomous run)
