---
phase: "30"
slug: "address-bar-modes-and-command-centre"
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: "2026-10-22"
---

# Phase 30 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.
> Audited by gsd-security-auditor over ae63acb..87538fb (includes the 30-REVIEW-FIX iteration 1 fixes CR-01 and WR-01..WR-06, with IN-03 folded into CR-01). Evidence keys: API = powerbrowser/shell/PowerBrowserAPI.sys.mjs, CATALOGUE = powerbrowser/INTERNAL-APIS.md, AB/MT/AM/CC/ROWS = theia/extensions/chrome-bar/src/browser/address-bar/{address-bar.tsx, address-bar-mode-table.ts, address-bar-modes.ts, command-centre.ts, address-bar-rows.ts}, KB/CMDS/COPY = theia/extensions/chrome-bar/src/browser/{chrome-bar-keybindings.ts, chrome-bar-commands.ts, chrome-bar-copy.ts}, STORE/PROTO/WEBTAB = theia/extensions/tab-uris/src/browser/{chrome-store-client.ts, tab-store-access-protocol.ts, web-tab.ts}, BRIDGE/MODESGATE/ROWSGATE/COPYGATE/LIVE = scripts/verify-{web-tab-bridge, address-bar-modes, address-bar-rows, shell-error-copy, address-bar-live}.mjs.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Theia frame → chrome store kinds | the pill calls store kinds, privileged ones included; the gates keep those calls in one file | typed text (sensitive), engine name, restrict value |
| verification → tree | gates and plants must read the code that runs, or a green result means nothing | source text, plant patches |
| Theia frame → chrome resolve and suggest | an engine name chosen in the menu or by an alias travels to chrome's resolve and suggestion kinds | engine name, typed text |
| chrome → Theia frame | engine names, icons and aliases from Gecko's search service render in the chip, the menu and rows | strings, data:image/ URIs |
| Theia frame → restricted Places read | the restrict value and typed text cross into a Places query, empty text included | restrict literal, text ≤ 256 |
| command registry and quick-access providers → pill | Actions runs registered commands; Command centre renders and executes any installed provider's picks | labels, descriptions, execute() |
| typed text → quick-access providers | Command centre text reaches Theia's providers, including the sidecar's file search | file names, command text |
| keyboard → Theia keybinding service and focus path | mode keys and address keys must not take keys from editors or terminals | key events |
| typed text → chrome resolve (Go-to) | a Go-to commit becomes a URL chrome loads into an overlay | URL (validated http(s)) |
| chrome → overlay first load (review fix WR-05) | a new web tab's first load is deferred and issued with LOAD_FLAGS_REPLACE_HISTORY | URL (already walled) |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-30-01 | Elevation | privileged kind called from moved code no gate sees | high | mitigate | readSources walks chrome-bar and tab-uris recursively (BRIDGE:507); the sanctioned caller is address-bar/address-bar.tsx (BRIDGE:107, 493); the only callers of readClipboardText and removeHistoryEntry are AB:706, 722, 1743; nested-file plant `planted privileged call in a nested chrome-bar file` (BRIDGE:571-573); self-test 21 plants red at audit | closed |
| T-30-02 | Info disclosure | typed file names or commands sent to chrome or an engine (D-26), typing and keys | high | mitigate | MODE_SENDS with an all-false command-centre row, and all-false tabs and actions rows (MT:65-73); dispatch on modeSends() (AB:394-396); local modes never reach runQuery (AB:1106-1127); runQuery's first statement returns unless resolve is allowed (AB:807), and each request is gated by its own flag (AB:824-841, 930). Keys: in a local mode with typed text, Enter, Alt+Enter and Ctrl+Enter return through enterLocalRow before any typed-text commit (AB:1622-1627); canonize requires `!local` (AB:1640); enterLocalRow acts only on the highlighted row (AB:1558-1567); rowless new-tab open is refused in Command centre (AB:1413-1416); Ctrl/Cmd+Up/Down out of Command centre into a resolving mode does not re-query (AB:2501-2507, IN-03). Static cases 5, 7, 7a, 8 and 9 (MODESGATE:243-305) with the plants `runQuery guard removed`, three CR-01 plants, WR-02 and `a resolve call added to command-centre.ts` (MODESGATE:439-472); live `command-centre-privacy` records store kinds and served-engine GETs for typing, for each commit key and for Ctrl+Down, with the Address-mode "hello" positive control (LIVE:3632-3771) and plants `cc-sends`, `cc-canonize`, `local-enter-commits`, `cc-cycle-requery` (LIVE:4567-4570) | closed |
| T-30-03 | Tampering | pick label rendered as markup | medium | mitigate | labels go through LabelParser into codicon spans and React text nodes (AB:2157-2162); the title attribute uses stripIcons (AB:2109); description and detail render as text (AB:2112, 2145); no dangerouslySetInnerHTML, innerHTML, outerHTML or insertAdjacentHTML anywhere under chrome-bar/src (grep at audit: zero hits) | closed |
| T-30-04 | Tampering | Go-to commit bypassing the http(s) wall, or resolving to a search from Command centre | high | mitigate | the Go-to row commits through commitText with visitOnly (AB:507); commitText's only load path is chrome's resolveTypedAddress (AB:1526) and refusesSearch drops a search reply (AB:1534, 1546-1548); Command centre's rowless Enter commits only a leading Go-to row (AB:1667-1674); chrome walls the engine submission and the resolved URL (API:4390-4391, 4458-4459) and webTabNavigate re-walls with a null principal (API:3438-3439, 3447); live `go-to` with a stubbed search reply and plant `visit-only-off` (LIVE:4232-4288, 4575) | closed |
| T-30-05 | Tampering | `restrict` field on searchPlaces | high | mitigate | the field is dispatched only when present (API:3807); exactly `bookmark` or `history`, else a fixed refusal that never echoes the value (API:4720-4722); text cut to 256, cap clamped to 1..50, LIKE escapes (API:4723-4725); read-only promiseDBConnection, two frozen SELECT statements with bound :pattern and :cap only (API:4695-4717, 4726-4727); http(s) rows only (API:4702, 4713); the client types the field to the two literals (STORE:164) | closed |
| T-30-06 | Repudiation | live plants patching the old widget object | medium | mitigate | 58 plant and probe sites target get('AddressBar') in LIVE; the one ChromeBarWidget plant (verify-nav-keys-live.mjs:779) patches reloadGuardUntil, which still lives on the widget (chrome-bar-widget.tsx:146); the self-test fails any plant that never applied (LIVE:4604-4608) and any plant that stays green (LIVE:4609-4616) | closed |
| T-30-07 | Tampering | user-facing literals moved out of the copy gate's sight | medium | mitigate | deriveWidgetCopy reads the widget plus every .tsx under address-bar/ (COPYGATE:911-912, 931-936; "derived from 2 chrome-bar source(s)" at audit); EXPECTED_WIDGET_COPY is untouched in the phase diff and compared both ways (COPYGATE:552, 918-924); nested-source plant (COPYGATE:940); the new COPY strings are pinned in EXPECTED_NAV_COPY and run through leakFailures (COPYGATE:848-872) | closed |
| T-30-08 | Tampering | engine name sent from an engine mode | medium | mitigate | engine modes and alias tokens carry only names from chrome's listSearchEngines reply (AB:2436-2438, 1164-1167; MT:128-131); chrome's type and 256-character check (API:4423, 4516) and exact-name match (API:4378-4381) reply no-engine otherwise (API:4429, 4455) | closed |
| T-30-09 | Tampering | engine name or icon rendered as markup in the chip or menu | medium | mitigate | chip and menu labels are text nodes (AB:2271, 2589-2591); the chip hover passes a string (AB:2261); icons only through safeIcon, a data:image/ string ≤ 65536 (ROWS:46-48; AB:1865, 2237); no HTML sink under chrome-bar/src | closed |
| T-30-10 | Elevation | Search Settings opening a privileged page | low | mitigate | CommonCommands.OPEN_PREFERENCES with the preference id (AB:2528-2536); no URL and no openStockPage kind crosses to chrome | closed |
| T-30-11 | Info disclosure | modes menu drawn over a web page | low | mitigate | the menu is a body portal with class `pb-chrome-bar-dropdown pb-address-modes` (AB:2556-2565), and `.pb-chrome-bar-dropdown` is in BLOCKING_LAYER_SELECTOR (WEBTAB:108) | closed |
| T-30-12 | Info disclosure | zero-query Places enumeration from an overlay or another frame | medium | mitigate | the restricted read rides the existing searchPlaces kind (API:3806-3808), behind groupSenderIsTheia and storeSenderInShellWindow, which run before any kind (API:3770-3774); no kind added (STORE_KIND_CLASSES set equality, BRIDGE:88-104, green at audit); searchPlaces is not in TAB_STORE_RELAY_KINDS (PROTO:58-65) | closed |
| T-30-13 | Elevation | Actions running a state-changing operation as a command | medium | mitigate | Actions lists only visible, enabled commands in the `Browser` category and runs only executeCommand(id) (AM:160-170); the category is set on Back, Forward, Reload and New Tab (CMDS:30-54); the privileged-kind rule refuses a privileged kind named in any command or keybinding file (BRIDGE:496, 579) | closed |
| T-30-14 | Spoofing | Tabs row switching to the wrong tab when two share a URL | low | mitigate | Tabs rows carry widgetId (AM:103); liveTabFor prefers it over the URL (AB:1346-1350); live `local-modes` requires Enter to make the scenario's own /sw-a tab current with no load (LIVE:3223, 3228) | closed |
| T-30-15 | Elevation | command execution from Command centre | medium | mitigate | a pick runs only the provider's own execute() (CC:110-115); no new command id is registered in the phase (the frontend module binds only modes); command-centre.ts references no store client, typed-text kind or suggestion service (MODESGATE:291-298) | closed |
| T-30-16 | DoS | help row or hand-off covering the page with the centred quick input | low | mitigate | help rows run acceptHelp, never execute(), and stay in the pill (CC:61-65, 101, 115-116); hand-off only when the registry has no descriptor (CC:73-75; AB:1110-1116); live plants `help-row-executes` (LIVE:3393, 4566) and `handoff-off` (LIVE:3529, 4577) | closed |
| T-30-17 | Info disclosure | typed text reaching the sidecar's file search | low | accept | the same backend search stock Ctrl+P uses — see AR-30-01 | closed (accepted) |
| T-30-18 | Tampering | engine aliases from chrome | low | mitigate | at most 8 aliases per engine, each String-cast and cut to 64 characters, chrome-side (API:4474); the client re-casts to strings and defaults to [] (STORE:180); alias rows render as text nodes (AB:1175-1190, 2110); an alias only maps to an engine already in the bar's list (AB:1164-1167; MT:128-131); catalogued (CATALOGUE:183) | closed |
| T-30-19 | DoS | Ctrl/Alt+Up/Down taken from Monaco or other widgets | medium | mitigate | the passthroughs are bound only under ADDRESS_FOCUSED_CONTEXT_KEY (KB:53-59), a key scoped to the pill's input element (AB:313-320); live editor control requires Monaco's Alt+Up/Down line moves (LIVE:4175-4187) | closed |
| T-30-20 | Spoofing | typed token switching into a mode that sends text to chrome | low | mitigate | tokenise only returns a new mode and the remaining text (MT:111-134); after a switch, textEdited applies the new mode's MODE_SENDS row (AB:1087-1137); in Command centre every `@` token and every token that is exactly a registry prefix stays text (MT:118-120; AB:1149-1153); static cases 10-12, derived over printable ASCII (MODESGATE:304-333) | closed |
| T-30-21 | Info disclosure | classifying typed text by asking chrome | medium | mitigate | classifyAddress is pure, with no import in the rows module (ROWS:151-174); gotoRowFor classifies locally (AB:495-510); `command-centre-privacy` types `localhost:4000`, which shows a Go-to row, and requires no typed-text kind (LIVE:3565, 3663-3674); ROWSGATE `file search ignored` plant for the D-34 rule (ROWSGATE:275) | closed |
| T-30-22 | DoS | Alt+D or Ctrl+L taken from an editor or terminal | low | mitigate | both bindings use `when: '!editorFocus && !terminalFocus'` (KB:29-40); live editor control (LIVE:4402-4406) | closed |
| T-30-23 | Spoofing | module-level focus setter called by other frontend code | low | accept | same trust domain as the module-level current-tab variable — see AR-30-02 | closed (accepted) |
| T-30-SC | Tampering | npm/pip/cargo installs (all six plans) | low | accept | no package manifest or lockfile changed in ae63acb..87538fb — see AR-30-03 | closed (accepted) |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

### Unregistered Surface (review fixes)

- **UF-30-01, firstWebTabLoad with LOAD_FLAGS_REPLACE_HISTORY (WR-05), verified, not a blocker.** No 30-0x plan registers it, and no SUMMARY has a `## Threat Flags` entry. The scheme wall runs before the overlay exists (API:3236) and again in webTabNavigate (API:3438). The load keeps a fresh null principal and never browser.src (API:3447-3449). The frame cannot set `replace`: its webTabNavigate arm passes only tabId and url (API:2483), firstWebTabLoad's only caller is webTabOpen (API:3374), and no generic `PowerBrowserAPI[...]` dispatch exists. A frontend navigation or a close during the wait cancels the deferred load (API:3393-3395, 3446). The wait is bounded at 3000ms (API:3390), the timeout log is fixed text with no URL (API:3397), and the restore path is separate (API:3364-3373). Catalogued at CATALOGUE:181. Live plant `phantom-history` (LIVE:3055-3074, 4563). Robustness note only: webTabOpen does not await firstWebTabLoad and attaches no `.catch` (API:3374). A throw from fixupAndLoadURIString becomes an unhandled rejection while webTabOpen still returns "opened". Before WR-05, the synchronous call's error reached handleGroupMutation.

### Open Items

None at or above high. None below threshold.

Informational, not registered:

- In Tabs, Bookmarks and History, Enter with typed text and no match runs the highlighted trailing "Search with {engine}" row. That is the UI-SPEC's contract ("No match … followed by the trailing search row, which is then highlighted, so the next step is Enter"), and live `local-modes` proves nothing is searched before the row is chosen (LIVE:3240). `command-centre-privacy` records row choices instead of running them, so it does not observe this search. enterLocalRow's comment "(no web search from Tabs, Bookmarks, History or Actions)" (AB:1552-1553) means the typed text is never committed itself; the chosen search row still searches. Command centre has no search row (MT:33).
- The IN-03 guard covers Ctrl/Cmd+Up/Down only. Choosing Address or an engine from the modes menu while in Command centre (pickMode, AB:2480-2488) re-queries the kept text in the new mode, so the text reaches the resolve and the engine's suggestions. That takes Alt+Down or a click and then an explicit choice, not the one-keystroke route IN-03 closed. Shift- or Ctrl-choosing an engine item runs a one-off search of the text (AB:2466-2468).
- searchPlaces is classed `read` (BRIDGE:94), so rule 12 would not refuse it if it were ever added to TAB_STORE_RELAY_KINDS. With `restrict` and empty text it now lists the 50 most recent bookmarks or history entries. Today it is absent from the relay (PROTO:58-65).

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-30-01 | T-30-17 | Command centre's text reaches the file provider's search, the same backend search stock Ctrl+P uses, on the sidecar's authenticated channel; nothing leaves the machine. command-centre.ts has no store client, typed-text kind or suggestion service (CC:25-27; MODESGATE:291-298). | plan 30-04 disposition (autonomous run) | 2026-10-22 |
| AR-30-02 | T-30-23 | setAddressFocus is a module-level setter (CMDS:103-107) registered by the address bar (AB:235), the same pattern and trust domain as setCurrentWebTab (CMDS:78). The registered function only closes the menus, sets Address mode and focuses and selects the pill (AB:243-253); it sends nothing. | plan 30-06 disposition (autonomous run) | 2026-10-22 |
| AR-30-03 | T-30-SC | No package.json, lockfile, Cargo, pip or flake file changed in ae63acb..87538fb; no install surface was added. | plan disposition, all six plans (autonomous run) | 2026-10-22 |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-10-22 | 24 | 24 | 0 | gsd-security-auditor (ASVS L1, block_on high) |

Static gates re-run at audit on 87538fb (clean and --self-test, all exit 0): verify-web-tab-bridge (21 plants), verify-address-bar-modes (17 plants), verify-address-bar-rows (9 plants), verify-shell-error-copy (13 modes-copy plants), verify-chrome-bar-commands (6 plants), verify-chrome-bar-suggestions (2 plants); check-internals-boundary.sh plain and --catalogue exit 0; `scripts/verify-platform.sh --quick` PASS. The live evidence (verify-address-bar-live.mjs scenarios and plants) comes from the 30-REVIEW-FIX runs. The full 30-scenario run passed. In the --self-test all 34 plants went red as named, but the run exited 1 because the clean control hit the known `context-menu` Paste & Go focus flake (29 deferred-items). This audit did not re-run the live suite, because it needs a built browser and a display.

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-10-22 (autonomous run)
