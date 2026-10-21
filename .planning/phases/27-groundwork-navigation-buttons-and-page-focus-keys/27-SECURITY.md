---
phase: "27"
slug: "groundwork-navigation-buttons-and-page-focus-keys"
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: "2026-10-21"
---

# Phase 27 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.
> Audited by gsd-security-auditor over 24a7ba0..fecb93b (includes the 77e8aca Home user-scope fix and the review fixes). Evidence keys: API = powerbrowser/shell/PowerBrowserAPI.sys.mjs, PBJS = powerbrowser/shell/powerbrowser.js, SHORT/WIDGET/COPY/PREFS/KEYB = theia/extensions/chrome-bar/src/browser/chrome-bar-{shortcuts,widget,copy,preferences,keybindings}, WEBTAB = theia/extensions/tab-uris/src/browser/web-tab.ts, RELAY/LIVE/BRIDGE/BOUND/STANDIN/COPYGATE = the verify scripts.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Theia frame → chrome | PowerBrowserGroupMutation: webTabStop, webTabHistory, webTabGotoIndex, webTabActivated | tab ids, history index (validated) |
| chrome → Theia frame | PowerBrowserWebTabState pushes `shortcut`, `pageFocus`; history replies | chrome-chosen ids; titles/URLs of the same tab's history |
| Web page → chrome keys | page sees non-reserved keys (incl. the F6 reply) first and may consume them | key events |
| Theia frame → keys | editors/terminals must keep every clashing key | key events |
| OS input → AppCommand | mouse buttons 4/5 arrive as a widget command event | command name |
| OS / other apps → New Tab drop | dragged data is attacker-shaped | URL / text |
| settings.json → Home | home-page value; user scope only since 77e8aca | URL string |
| upstream rebase → shell window | upstream actors call members on the gBrowser stand-in | method calls |
| powerbrowser/ source → Firefox internals | only the boundary file may reach internals | imports |
| shortcut table → tooltip text | shown text must match the bound keys | copy |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-27-01 | Elevation | webTabStop | low | mitigate | groupSenderIsTheia + webTabIdIsValid before the switch; acts on the tab's own browser (API:4096-4109) | closed |
| T-27-02 | Spoofing | page key rows while Theia focused | medium | mitigate | rows created disabled, enabled only while an overlay has focus (PBJS:380, 387-400); plant row-enabled-under-theia | closed |
| T-27-03 | Tampering | shortcut push id | low | mitigate | chrome refuses ids failing /^[A-Za-z0-9]{1,32}$/ (API:4260); frontend runs only known actions on that tab (SHORT:206-216) | closed |
| T-27-04 | Info disclosure | shell log lines | low | mitigate | only API:4182 added (kind + message); handleWebTabAction logs nothing | closed |
| T-27-05 | Tampering | webTabGotoIndex | low | mitigate | integer + range check vs sessionHistory.count (API:4153); live gotoIndex(99) refused | closed |
| T-27-06 | Info disclosure | webTabHistory reply | low | mitigate | String() primitives returned to the requesting actor only (API:4137-4142) | closed |
| T-27-07 | Elevation | new webTab kinds (privileged-kind rule) | medium | mitigate | rule in INTERNAL-APIS.md:32-37; KIND_CLASSES set equality in verify-web-tab-bridge (14 plants red) | closed |
| T-27-08 | Spoofing | webTabActivated | low | mitigate | keyed by the sender's embedder; tabId null or valid; sender wall first (API:4162-4167) | closed |
| T-27-09 | DoS | state push volume | low | mitigate | per-window rAF batch, latest record per tab, stale overlays skipped (API:4216-4232) | closed |
| T-27-10 | Elevation | shim globals outside the boundary | medium | mitigate | six names in FORBIDDEN_PATTERNS (BOUND:83), each planted and rejected by name | closed |
| T-27-11 | Tampering | rebase adds a gBrowser call the stand-in lacks | medium | mitigate | call sites derived from browser/actors and toolkit/actors parents only (STANDIN:105-127); component-directory parents (e.g. ProfilesParent `addTrustedTab`) not scanned — see Open Items | open — below high threshold (non-blocking) |
| T-27-12 | DoS | refreshBlocked TypeError with accessibility.blockautorefresh | low | accept | recorded in DELIBERATELY_ABSENT (STANDIN:149-152) and the stand-in comment | closed (accepted) |
| T-27-13 | Tampering | New Tab drop | medium | mitigate | ^https?:// check before any open (WIDGET:72-91, 417-442); chrome webTabOpen scheme wall (API:3231-3235); live javascript: drop refused | closed |
| T-27-14 | Spoofing | history menu labels | low | mitigate | labels cut to 60 chars, plain-text label to the stock menu renderer (COPY:25-31, WIDGET:477-505) | closed |
| T-27-15 | Elevation | middle-click background open | low | mitigate | URL from the tab's own history, http(s)-checked twice (WIDGET:397-405, WEBTAB:782-785) plus chrome wall | closed |
| T-27-16 | Tampering | browser.homePage value | medium | mitigate | typed-address wall + failure row (WIDGET:99-107, 672-687); user-scope schema and inspectInScope(User) reads (77e8aca, PREFS:23/29, WIDGET:657-662) | closed (stronger than planned) |
| T-27-17 | Info disclosure | Home-failure / settings copy | low | mitigate | copy object + checkNavCopy gate (COPYGATE:736-760) | closed |
| T-27-18 | DoS | page trapping focus | medium | mitigate | Ctrl+T/W and the Ctrl+Tab family reserved (PBJS:337-352); reservation rule both ways (RELAY:440-459). Live proof covers Ctrl+T/W only | closed (proof partial) |
| T-27-19 | Elevation | key relay actions | medium | mitigate | fixed action map, no push-supplied command id (SHORT:130-155); set equality rule (RELAY:421-431) | closed |
| T-27-20 | Tampering | shortcut ids | low | mitigate | fixed literals both sides compared by RELAY rule (1); malformed ids refused; unknown ids ignored | closed |
| T-27-21 | Spoofing | terminal/editor keys hijacked | medium | mitigate | rows disabled under Theia focus; Ctrl+L when-clause (KEYB:30-34); zero-firing live checks with plants | closed |
| T-27-22 | Spoofing | F6 listener | low | mitigate | trusted events only, overlay target only, acts only on unprevented replies (PBJS:413-431) | closed |
| T-27-23 | Tampering | AppCommand target | low | mitigate | acts on the hovered overlay; non-overlay hover is a no-op (PBJS:441-454); ids checked by RELAY rule (9) | closed |
| T-27-24 | Spoofing | terminal/editor keys (sampled) | medium | mitigate | theia-keeps-keys presses 11 clashing keys in editor and terminal, zero firings; shared disable loop | closed (sampled) |
| T-27-25 | Spoofing | tooltip text vs bound key | low | mitigate | tooltips derived from PAGE_SHORTCUTS; RELAY rules (3), (10) | closed |
| T-27-26 | Info disclosure | tooltip / accessible copy | low | mitigate | checkShortcutCopy gate (COPYGATE:711-733) | closed |
| T-27-SC | Tampering | npm/pip/cargo installs | low | accept | no manifest or lockfile changed in the phase diff | closed (accepted) |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

### Open Items

- **T-27-11 (medium, non-blocking):** widen the stand-in call-site derivation to the actor registries (DesktopActorRegistry.sys.mjs / ActorManagerParent.sys.mjs) so component-directory parents are covered, or re-disposition those parents as accepted with a reason. Carried to Phase 35 (Shell Furniture), which changes the gBrowser stand-in. 27-03-SUMMARY's "any actor parent" claim overstates the current scope (REVIEW IN-15).

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-27-01 | T-27-12 | refreshBlocked is not implemented on the stand-in; with accessibility.blockautorefresh on, upstream throws a TypeError instead of showing a refresh notification. Recorded in DELIBERATELY_ABSENT; the notification bar arrives with PROMPT-09 (Phase 37). | plan 27-03 disposition (autonomous run) | 2026-10-21 |
| AR-27-02 | T-27-SC | No package manifest or lockfile changed in the phase; no install surface was added. | plan disposition (autonomous run) | 2026-10-21 |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-10-21 | 27 | 26 | 1 (medium, non-blocking) | gsd-security-auditor (ASVS L1, block_on high) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-10-21 (autonomous run; open item T-27-11 carried to Phase 35)
