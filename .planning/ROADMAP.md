# Roadmap: Power Browser

## Milestones

- ✅ **v1.0 PowerBrowser** — Phases 1–7 (shipped 2026-09-04, override closeout — see `.planning/milestones/v1.0-ROADMAP.md`)
- ✅ **v1.1 Hardening and SQL Tabs** — Phases 08–09 (shipped 2026-09-05, hardening-only — see `.planning/milestones/v1.1-ROADMAP.md`)
- ✅ **v1.2 Sign-off Closeout and SQL Store** — Phases 10–12 (shipped 2026-09-05, override closeout — see `.planning/milestones/v1.2-ROADMAP.md`)
- ✅ **v1.3 Browser GUI** — Phases 13–15, inserted 14.1 and 14.1.1, retired 16 (shipped 2026-09-06, verifications deferred — see `.planning/milestones/v1.3-ROADMAP.md`)
- ✅ **v1.4 Platform Updates and GUI Close-out** — Phases 17–25 (shipped 2026-10-19, override closeout: live UAT deferred by Chris under NG-089 — see `.planning/milestones/v1.4-ROADMAP.md`)
- 🚧 **v1.5 Chrome Bar Firefox Parity** — Phases 27–38 (active: the chrome bar brought to Firefox-toolbar parity against the 2026-10-20 gap list, including the tab strip, page prompts and full WebExtension support)
- 📋 **Future** — GUI-05 unified tab strip, W6 canvas search, release and distribution (backlog 999.2), sketch 005 items 1–2 (one title row, centred address box), the 12 defects in `.planning/milestones/v1.4-phases/24-live-uat-pass/24-GAPS.md`, custom modes driven by mode data instead of hard-coded mode ids, deferred seeds (gui-component-dnd, firefox-parity-tabs) (v1.6+)

## Phases

<details>
<summary>✅ v1.0 PowerBrowser (Phases 1–7) — SHIPPED 2026-09-04</summary>

- [x] Phase 1: Platform Extraction and Rename (21/21 plans)
- [x] Phase 2: Configuration Manifest and Generator Core (9/9 plans)
- [x] Phase 3: Firefox Branding Emitter and Icon Pipeline (4/4 plans)
- [x] Phase 4: Theia Surface — Branding, Extensions, Telemetry (4/4 plans)
- [x] Phase 5: Hook-Only Patches and Upstream Uptake (4/4 plans)
- [x] Phase 6: Two-Layer Verification and Rebranding Docs (6/6 plans)
- [x] Phase 7: Sourcerer as Downstream (4/4 plans)

Archive: `.planning/milestones/v1.0-ROADMAP.md` · Requirements: `.planning/milestones/v1.0-REQUIREMENTS.md` · Tag: `v1.0`

</details>

<details>
<summary>✅ v1.1 Hardening and SQL Tabs (Phases 08–09) — SHIPPED 2026-09-05</summary>

- [x] Phase 08: Installer Hardening + Canonical Rename (5/5 plans)
- [x] Phase 09: Extensions + Crash Pipeline (4/4 plans)

Archive: `.planning/milestones/v1.1-ROADMAP.md` · Requirements: `.planning/milestones/v1.1-REQUIREMENTS.md` · Audit: `.planning/milestones/v1.1-MILESTONE-AUDIT.md` · Tag: `v1.1`

</details>

<details>
<summary>✅ v1.2 Sign-off Closeout and SQL Store (Phases 10–12) — SHIPPED 2026-09-05</summary>

- [x] Phase 10: Sign-off Closeout (3/3 plans) — completed 2026-09-05
- [x] Phase 11: SQL Store Design (3/3 plans) — completed 2026-09-05
- [x] Phase 12: SQL Store Build (3/3 plans) — completed 2026-09-05

Archive: `.planning/milestones/v1.2-ROADMAP.md` · Requirements: `.planning/milestones/v1.2-REQUIREMENTS.md` · Audit: `.planning/milestones/v1.2-MILESTONE-AUDIT.md` · Tag: `v1.2`

</details>

<details>
<summary>✅ v1.3 Browser GUI (Phases 13–16) — SHIPPED 2026-09-06</summary>

- [x] Phase 13: Chrome Bar + Strip-Relocation Spike (5/5 plans, 13-04 and 13-05 gap closure) — completed 2026-09-06
- [x] Phase 14: Modes + Windows & Setups (4/5 plans; 14-05's code landed in d5b8dc1, its two checks were never written — gap G-14.1.1-10, closed by Phase 20 PLAT-02) — completed 2026-09-06
- [x] Phase 14.1: In-Theia Web Tabs (GUI-02) (INSERTED) (3/3 plans) — "+" opens a web tab inside the Theia shell's own tab strip
- [x] Phase 14.1.1: GUI Conformance Sweep (INSERTED) (16/16 plans, three passes) — every `fixable: yes` gap in `14.1.1-UAT.md` closed with a check that goes red without its fix
- [x] Phase 15: Panorama Organising (3/3 plans) — completed 2026-09-06
- [x] Phase 16: AI backend adapter - OpenCode (3/3 plans) — Retired 2026-09-28; code removed in Phase 17 (RM-01)

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 13. Chrome Bar + Strip-Relocation Spike | 5/5 | Complete | 2026-09-06 |
| 14. Modes + Windows & Setups | 3/3 | Complete | 2026-09-06 |
| 15. Panorama Organising | 3/3 | Complete | 2026-09-06 |

Phase 16 record: Retired 2026-09-28 under D2 (b): NG-041..NG-050 and NG-052..NG-062 are
dropped — the opencode adapter is retired for the PowerBrowser-Assistant
plugin, which is planned outside this tree. The adapter cuts fall with the
same decision (selectable `@Pi` / DSH backends, per-line comment-to-steer,
`/btw` ephemeral question, file-wide Supercomplete Tab-accept). Chris:
"Run them for me" (ledger/history/log.jsonl lines 310–330, one drop op per
row, each carrying that answer as its quote). NG-051
(`backend = "off"` starts no opencode process and no `/mcp` endpoint) was kept and built, then
dropped 2026-10-17 (c3929e9) when Phase 17 removed the adapter.
Goal (was): selectable `@OpenCode` backend in sidecar chat with staged
accept/reject review. Requirements (was): AI-01..AI-05, removed in v1.4.
Plans 16-01, 16-02, 16-03 executed.

Archive: `.planning/milestones/v1.3-ROADMAP.md` · Requirements: `.planning/milestones/v1.3-REQUIREMENTS.md` · Audit: `.planning/milestones/v1.3-MILESTONE-AUDIT.md` · Phase directories: `.planning/milestones/v1.3-phases/` · Tag: `v1.3`. The v1.3 archive predates Phases 14.1 and 14.1.1; their full detail sections are in their phase directories and in `git show 41caf8f:.planning/ROADMAP.md`.

</details>

<details>
<summary>✅ v1.4 Platform Updates and GUI Close-out (Phases 17–25) — SHIPPED 2026-10-19 (override closeout)</summary>

- [x] Phase 17: OpenCode Removal (4/4 plans)
- [x] Phase 18: Firefox 153.5.0esr (3/3 plans)
- [x] Phase 19: Node 24, React 19, Theia 1.76.0 (8/8 plans)
- [x] Phase 20: Non-GUI Gaps (5/5 plans)
- [x] Phase 21: Panorama Spec and gui08 Checks (5/5 plans)
- [ ] Phase 22: Panorama Worklist (7/7 plans; live checks deferred under NG-089)
- [x] Phase 23: Modes Leftovers and Sketch 005 Verdict (5/5 plans)
- [ ] Phase 24: Live UAT Pass (5/6 plans; A01–A20 recorded, A18 failed; rest deferred by Chris, NG-089 → phase 26)
- [x] Phase 25: CI Green on Main (run 39340825244 green on 0efb116; NG-074 done)

Known gaps: UAT-01 (deferred), MODE-01 live half (A18), PAN-03..06 live checks (deferred); 12 defects for v1.5 in `.planning/milestones/v1.4-phases/24-live-uat-pass/24-GAPS.md`; Chris's remaining checks in `24-CHRIS-CHECKLIST.md` there.

Archive: `.planning/milestones/v1.4-ROADMAP.md` · Requirements: `.planning/milestones/v1.4-REQUIREMENTS.md` · Audit: `.planning/milestones/v1.4-MILESTONE-AUDIT.md` · Tag: `v1.4`

</details>

### 🚧 v1.5 Chrome Bar Firefox Parity

**Milestone Goal:** The chrome bar does what Firefox's toolbar does, measured against the
2026-10-20 gap list (`.planning/research/chrome-bar-firefox-gap.md`), on Gecko 153.5.0esr and
Theia 1.76.0 with no upstream re-pinned.

Order follows the research's dependency order (`.planning/research/SUMMARY.md`): shared
groundwork with navigation and keys, then the address bar, modes, site identity and the app
menu, page tools, bookmarks, the tab strip, the three shell-window phases in rising risk, and
extensions last. The EXT-04 spike runs second, so the signed-off tab route is known before
any phase fixes how web tabs look to Firefox code. Most phases edit
`PowerBrowserAPI.sys.mjs` (catalogue churn; other sessions commit on `main`), so phases run
strictly in order, never in parallel. Phase 26 is reserved for NG-089 (Chris's own live GUI
checks, deferred from v1.4) and is not part of v1.5.

Research needed at planning: 30, 32 (probes), 34, 36, 37, 38; Phase 28 is a `/gsd-spike`.
UI spec before planning: Phase 30 (`/gsd-ui-phase 30` with mockups). Waiting on Chris:
28 (route sign-off), 30 (Browsing and Organising default modes), 37 (only if the dialog probe
forces a decision). Coverage: 87/87 v1.5 requirements, each in exactly one phase.

- [ ] **Phase 27: Groundwork, Navigation Buttons and Page-Focus Keys** - Stop, hard reload, history menus and Home; Firefox keys from inside a page; the shared push, action kinds and live-probe harness
- [x] **Phase 28: WebExtension Tab Route Spike** - How web tabs become tabs WebExtensions can see, recorded and signed off by Chris before Phase 38 is planned
- [ ] **Phase 29: Address Bar Search and Fixup** - Search fallback, localhost and host:port, suggestions, engines, switch-to-tab, autofill, pill editing, configured app name in copy
- [ ] **Phase 30: Address-Bar Modes and Command Centre** - Modes dropdown, mode chip and tokens; Theia's command centre in the pill as the Coding default
- [ ] **Phase 31: Site Identity, Permissions and App Menu** - Real lock and "Not Secure", site panel with permissions and clear site data, tracking shield, hamburger menu, Quit
- [ ] **Phase 32: Page Tools** - Find, zoom, print, save, edit commands, favicons, audio and mute, downloads, source, reader view, devtools, crashed tab
- [ ] **Phase 33: Bookmarks, History and the Full Menu** - Star and editor, reopen closed tab, bookmarks toolbar, history menu, clear history; every app-menu and Actions entry
- [ ] **Phase 34: Tab Strip** - Tab menu, drag reorder, middle-click, overflow, pin, multiselect, preview card, attention mark
- [ ] **Phase 35: Shell Furniture and Page Context Menu** - Page context menu, form autocomplete, tooltips and link status, page fullscreen with its warning
- [ ] **Phase 36: New-Window Links as Web Tabs** - `target=_blank` and `window.open` open web tabs next to the opener; GUI-01 kept (alone, because it is the one phase that can break GUI-01)
- [ ] **Phase 37: Permission Prompts and Dialogs** - Permission doorhangers, sharing indicator, page dialogs, password save, notification bars
- [ ] **Phase 38: WebExtensions** - Extensions see web tabs; toolbar buttons and puzzle menu; AMO install; popular extensions checked live
- [ ] **Phase 39: v1.5 Close-out** - Fix C22-C24, C11 and backlog 999.4-999.16; run every automatable UAT item; owner calls settled; WINDOWS.md and REQUIREMENTS.md closed out

## Phase Details

### Phase 27: Groundwork, Navigation Buttons and Page-Focus Keys

**Goal**: The navigation buttons and Firefox's browser keys work while a web page has focus, built on the shared channel every later v1.5 phase extends
**Depends on**: Nothing in v1.5 (first phase; v1.4 shipped; Phase 26 is reserved for NG-089)
**Requirements**: NAV-01, NAV-02, NAV-03, NAV-04, NAV-05, NAV-06, KEY-01, KEY-02, KEY-03, KEY-04, KEY-05
**Groundwork**: lands here because NAV and KEY need it first — the push router (one push name, kinds routed by a table); `webTabActivated` (selected, not merely visible, since the dock split shows two tabs); the widened `WebTabState` push, coalesced per tab per frame; the `webTab*` action kinds behind `webTabIdIsValid`, with push-kind parity in `verify-web-tab-bridge.mjs`; the append-only rule for `INTERNAL-APIS.md` rows; the overlay layer policy; the `gBrowser` stand-in policy (call sites derived from `upstream/`, every shim global in `FORBIDDEN_PATTERNS`); the privileged-kind rule (state-changing kinds run only from widget event handlers, never as command ids); the page-focus context key; and the live-probe harness (`-purgecaches` launcher, push recorder, page-focus probe). Keys follow the 2026-10-20 ruling: a key that clashes with Theia takes the browser meaning only while a web page has focus, so only Firefox's unblockable keys are reserved and the rest use the reply path; `verify-shortcut-relay.mjs` with `--self-test` guards the table
**Success Criteria** (what must be TRUE):

  1. While a page loads, Reload shows as Stop, and the button or Esc stops the load; Shift+click on Reload, Ctrl+Shift+R and Ctrl+F5 reload the page without the cache
  2. Right-click or long-press on Back or Forward lists the tab's session history, and choosing an entry goes to it; middle-click on Back, Forward or Reload opens the result in a new tab; a link dropped on New Tab opens; every button's tooltip names its keyboard shortcut
  3. With the Home button turned on in settings, the button and Alt+Home load the home page set in settings
  4. With focus inside a web page, Ctrl+T, Ctrl+W, Ctrl+R, F5, Alt+Left, Alt+Right, Alt+D, Ctrl+L, F6, Shift+F6, Ctrl+Tab, Ctrl+Shift+Tab, Ctrl+PageUp, Ctrl+PageDown, Alt+1..9 and mouse buttons 4 and 5 do what they do in Firefox
  5. In an editor, a terminal or any other non-web tab, F5, F6, F11, Ctrl+P, Ctrl+K and the other clashing keys keep Theia's meaning

**Plans**: 8/8 plans executed (strictly sequential waves 1-8: no worktrees, and every plan's `--quick` reads the whole tree)

Plans:
**Wave 1**

- [x] 27-01-PLAN.md — Tracer: Esc in a loading page stops it end to end (page-scoped key row, shortcut push, onPush router, relay, webTabStop); the single Reload/Stop element; live-probe harness and nav-keys-live rows

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 27-02-PLAN.md — Groundwork: webTabHistory, webTabGotoIndex, webTabActivated, coalesced state push, bypass-cache reload, openInBackground; append-only and privileged-kind rules; push-kind parity in the bridge gate

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 27-03-PLAN.md — Policies: gBrowser stand-in call sites derived from upstream with reasoned absences; shell shim globals in FORBIDDEN_PATTERNS

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 27-04-PLAN.md — Buttons: Back/Forward history menu, press-and-hold, 650 ms guard, Shift+click hard reload, middle-click and Ctrl+click background tab, link drop on New Tab

**Wave 5** *(blocked on Wave 4 completion)*

- [x] 27-05-PLAN.md — Home button and its two settings, empty and failure cases

**Wave 6** *(blocked on Wave 5 completion)*

- [x] 27-06-PLAN.md — Page keys: the full shortcut table both sides (Ctrl+T/W/R, F5, hard reload, Alt+arrows, Alt+Home, Alt+D, Ctrl+L, tab switching) and verify-shortcut-relay.mjs

**Wave 7** *(blocked on Wave 6 completion)*

- [x] 27-07-PLAN.md — F6/Shift+F6 both ways, mouse buttons 4/5, Esc in the pill, Theia keeps its keys; old focus-address path removed

**Wave 8** *(blocked on Wave 7 completion)*

- [x] 27-08-PLAN.md — Tooltips with shortcuts from the table via HoverService, never over the page

**UI hint**: yes

### Phase 28: WebExtension Tab Route Spike

**Goal**: Chris has signed off the route by which web tabs become tabs that WebExtensions can see, before Phase 38 is planned and before later phases fix how web tabs are presented to Firefox code
**Depends on**: Phase 27 (the live-probe harness)
**Requirements**: EXT-04
**Needs Chris**: sign-off on one route, recorded before Phase 38 is planned
**Research**: this phase is a `/gsd-spike`; spike code is throwaway and never lands in `PowerBrowserAPI.sys.mjs`
**Success Criteria** (what must be TRUE):

  1. A live probe records what an installed extension's `tabs.query`, tab events and content scripts see while a web tab is active today (research probe 10)
  2. The spike record compares the three routes (a patch in `patches/`, the GUI-04 bridge, a chrome-side tab model) and states for each whether it needs a Gecko patch, whether it needs the GUI-05 bridge (out of scope today), and which v1.5 phases it changes (favicons through `getTabForBrowser`, the prompt and context-menu actors, pinned tabs, new-window adoption)
  3. Chris's sign-off on one route is recorded in the spike record, together with the scope consequence if that route needs GUI-05

**Plans**: TBD

### Phase 29: Address Bar Search and Fixup

**Goal**: The pill searches typed text, opens development addresses, and handles typing, picking and editing results the way Firefox's address bar does
**Depends on**: Phase 28 (serial; the push router and action kinds come from Phase 27)
**Requirements**: BAR-01, BAR-02, BAR-03, BAR-04, BAR-05, BAR-06, BAR-07, BAR-08, BAR-09, BAR-10, BAR-11, BAR-12, BAR-13, BAR-14
**Notes**: one `resolveTypedAddress` kind (URI fixup, then the engine submission, then the http(s) wall applied to the result; `SearchService` initialises without a stock window, research probe 11); the default engine and engine set come from `configuration.toml` through `distribution/policies.json` `SearchEngines`, so a rebrand still edits one file; the configured engines' suggest hosts get `powerbrowser/endpoint-allowlist.json` rows in this phase, on purpose; Shift+Del is the first chrome-bar Places write, through `PowerBrowserAPI`; overlay loads to other loopback ports never carry the Theia token cookie (technical ruling 2026-10-20, research probe 13)
**Success Criteria** (what must be TRUE):

  1. Words followed by Enter search the default engine; `localhost`, `localhost:4000`, a `host:port` and an IP address open as addresses; Ctrl+Enter completes `name` to `www.name.com`; a dropped link loads and dropped text searches
  2. Engine suggestions appear while typing (on by default, off through a setting); a typed origin autofills inline and Enter or Tab accepts it; result rows show favicons and type icons; a result row runs a one-off search with another engine; the default engine can be changed among the engines `configuration.toml` supplies
  3. Choosing an open-tab result switches to that tab without loading it again; Alt+Enter, Ctrl+click and middle-click open in a new tab; Shift+Del removes a history row; right-click on the pill offers Cut, Copy, Paste and Paste & Go
  4. The first click selects the whole address, IME composition never commits early, and text typed but not submitted is still there after switching to another tab and back
  5. Every chrome-bar message names the configured application name: a sidecar run with a different configured name shows that name, and no chrome-bar source carries a brand literal

**Plans**: 10/10 plans executed (strictly sequential waves 1-10: no worktrees, every plan's `--quick` reads the whole tree, most edit `chrome-bar-widget.tsx` or `PowerBrowserAPI.sys.mjs`)

Plans:
**Wave 1**

- [x] 29-01-PLAN.md — Tracer: typed words and Enter search the default engine end to end (resolveTypedAddress store kind, pill commit path, served-engine live harness); refused schemes and no-engine rows

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 29-02-PLAN.md — Development addresses (localhost, host:port, IP) proven live; the token-cookie strip with its static gate and live proof; rule 12 store-kind classification

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 29-03-PLAN.md — [[search_engines]] in configuration.toml through emitSearchEngines into policies.json SearchEngines; engine hosts in the endpoint allowlist; verify-search-engines gate

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 29-04-PLAN.md — Default Search Engine setting filled from chrome, engine-naming placeholder; packaged check that the bar offers exactly the configured engines

**Wave 5** *(blocked on Wave 4 completion)*

- [x] 29-05-PLAN.md — Result rows: pure rows module with a Node test, heuristic first row, type markers and Places favicons, 32px rows; configured app name in all copy with a derived brand ban

**Wave 6** *(blocked on Wave 5 completion)*

- [x] 29-06-PLAN.md — Engine suggestions (on by default, setting to turn off, never for addresses); the one-off engine strip

**Wave 7** *(blocked on Wave 6 completion)*

- [x] 29-07-PLAN.md — Switch to an open tab without reloading; Alt+Enter, Ctrl+click and middle-click new-tab targets

**Wave 8** *(blocked on Wave 7 completion)*

- [x] 29-08-PLAN.md — Inline origin autofill; Ctrl+Enter to www.name.com; drop a link or text on the pill

**Wave 9** *(blocked on Wave 8 completion)*

- [x] 29-09-PLAN.md — Shift+Del removes a history row; pill context menu with Cut, Copy, Paste, Paste & Go (first privileged store kinds)

**Wave 10** *(blocked on Wave 9 completion)*

- [x] 29-10-PLAN.md — First click selects all, IME guard, typed text kept per tab; the whole phase's live checks green together

**UI hint**: yes

### Phase 30: Address-Bar Modes and Command Centre

**Goal**: The pill has a modes dropdown, and in Coding it is Theia's command centre without losing the address bar
**Depends on**: Phase 29 (the engines and the "Go to" heuristic row)
**Requirements**: SMODE-01, SMODE-02, SMODE-03, SMODE-04, SMODE-05, SMODE-06
**Needs Chris**: the Browsing and Organising default modes, chosen from visual mockups in the UI spec (Coding = Command centre is decided)
**UI spec**: `/gsd-ui-phase 30` before planning, with visual mockups of the Browsing and Organising defaults for Chris to choose from
**Research**: yes — calling `QuickAccessRegistry` `getPicks()` from the chrome bar outside the quick-input widget (research probe 7); the fallback is `QuickInputService.open`, which hides the page while typing
**Notes**: the pill first moves out of `chrome-bar-widget.tsx` into `address-bar/` with an `AddressBarModeContribution` point; Command centre renders the registry's picks under the pill and hands only `@` and `:` to Theia (research D1); actions that open UI are commands, actions that change state run only from that UI (research D7). SMODE-07 is in Phase 33, where the actions it names exist
**Success Criteria** (what must be TRUE):

  1. The dropdown at the left end of the pill lists Command centre, each search engine, Bookmarks, Tabs, History, Actions and Search Settings; the active mode shows as an icon and label chip; one click on the chip, or Backspace at the start of the input, returns to the mode's default
  2. In Coding the bar starts in Command centre; in Browsing and Organising it starts in the defaults the UI spec fixed
  3. Typing `*`, `%`, `^`, `>` or `@alias` followed by a space enters that mode; Accel+Up/Down cycles modes; Alt+Up/Down opens the dropdown
  4. In Command centre, file search, `>` commands and the `#`, `?`, `edt`, `term`, `task`, `debug` and `view` prefixes show Theia's results under the pill while the page stays visible, with no engine suggestion row; `@` and `:` open Theia's symbol and go-to-line pickers
  5. From Command centre, Ctrl+L, Alt+D and F6 switch the pill to address mode, and an unambiguous URL (scheme, localhost, host:port, IP) gets a "Go to" first row

**Plans**: 6/6 plans executed (strictly sequential waves 1-6: no worktrees, every plan edits `address-bar/address-bar.tsx` and `--quick` reads the whole tree)

Plans:
**Wave 1**

- [x] 30-01-PLAN.md — D-04 move: the pill into `address-bar/` as the injectable `AddressBar`, rows module moved, gate scans recursive with nested plants, live plants re-pointed; no behaviour change

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 30-02-PLAN.md — Tracer: modes dropdown, mode button and chip, engine modes, x reset, mode lifetime, Search Settings; the D-03 default table and the `verify-address-bar-modes` gate

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 30-03-PLAN.md — Tabs, Bookmarks, History and Actions contributions; zero-query lists; `searchPlaces` restrict field chrome-side; the Browser command category

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 30-04-PLAN.md — Command centre on `QuickAccessRegistry`: picks under the pill, help rows, `@`/`:` hand-off, runtime placeholder; D-26 send guard with static gate and live recorder

**Wave 5** *(blocked on Wave 4 completion)*

- [x] 30-05-PLAN.md — Defaults per PowerBrowser mode proven live, Backspace reset, mode tokens with chrome-side engine aliases, Ctrl/Alt+Up/Down pill-scoped keys

**Wave 6** *(blocked on Wave 5 completion)*

- [x] 30-06-PLAN.md — Go-to row from a local classifier with visit-only commits; Ctrl+L, Alt+D and F6 to Address mode; phase-close live run

**UI hint**: yes

### Phase 31: Site Identity, Permissions and App Menu

**Goal**: The identity box reports the page's real connection and permissions, and a Firefox-ordered app menu opens in every mode
**Depends on**: Phase 30 (serial; the widened push from Phase 27 carries the security state)
**Requirements**: SITE-01, SITE-02, SITE-03, SITE-04, SITE-05, SITE-06, SITE-07, SITE-08, MENU-01, MENU-02, MENU-04
**Notes**: the security state is computed chrome-side from the overlay's `securityUI.state`, in the same push as `url`, and reset on every location change; the display host and IDN form come from `nsIIDNService`; Settings, Passwords and Add-ons open through an `openStockPage` enum, never a URL (it lands earlier if Phase 30's Search Settings needs it); permission reads and writes are keyed by the overlay's own principal; the `127.0.0.1` token cookie is exempt from every clear-data kind, with a planted-clear check (research probe 13)
**Success Criteria** (what must be TRUE):

  1. An https page shows a lock taken from the page's real connection state, an http page shows "Not Secure", and mixed content or a certificate error shows the warning state; typing in the pill never changes the lock, and editor tabs show no indicator
  2. The host shows with its registrable domain highlighted, a spoofable IDN shows as punycode, and `https://` is trimmed only on a secure page
  3. Clicking the lock opens a site information panel with the connection details and the certificate, where the user changes this site's camera, microphone, location, notifications, autoplay and popup permissions; a site with non-default permissions shows their icons in the identity box
  4. Clear cookies and site data removes the current site's data and the IDE stays signed in, including after clearing on a `localhost` tab; the tracking-protection shield shows what was blocked and turns protection off for the site
  5. The hamburger menu opens from the chrome bar in Coding, Browsing and Organising, in Firefox's order, and opens Settings, Passwords and Add-ons; Ctrl+Q and the menu's Quit item quit the application

**Plans**: 5 plans (strictly sequential waves; DSH codes, Claude checks)

Plans:
- [x] 31-01-PLAN.md (wave 1) — Lead the phase with one end-to-end tracer: chrome computes the real connection state and the pill renders it.
- [x] 31-02-PLAN.md (wave 2) — Build the site information panel on the plan-01 read path: connection + certificate, tri-state permission rows keyed by the overlay's principal, and permission icons in the identit
- [x] 31-03-PLAN.md (wave 3) — Add site-data clearing with the token-cookie exemption and the tracking shield with per-site exception, both in the site panel.
- [x] 31-04-PLAN.md (wave 4) — Build the Firefox-ordered hamburger with stock-page entries and Quit, closing the phase.
- [x] 31-05-PLAN.md (wave 5) — Give the menu Quit row its route to chrome and reserve Ctrl+Q chrome-side, closing the phase.

**UI hint**: yes

### Phase 31.1: Extension Tab Host (INSERTED)

**Goal**: Installed Firefox extensions see PowerBrowser's web tabs as real tabs (query, events, active tab, tab ids on content scripts, webRequest and webNavigation), built on the route Chris signed off in Phase 28, so Phases 32-38 are built against it
**Depends on**: Phase 31 (inserted 2026-10-21 by the Phase 28 sign-off; decimal because the deploy workstream holds 40-58)
**Requirements**: EXT-05
**Decision record**: `.planning/phases/28-webextension-tab-route-spike/28-SPIKE-DECISION.md`; spikes `.planning/spikes/002a-ext-route-patch` (patch 050 draft) and `002c-ext-route-chrome-tab-model` (tab model)
**Scope**: patch `050-extension-tab-host.patch` regenerated from a patched tree (never text-edited), including the adversarial-check guards (`ext-pageAction.js` null `selectedTab`, TabOpen null guard); the tab host behind PowerBrowserAPI (one tab element per overlay, TabOpen/TabSelect/TabClose/TabAttrModified, tabs-progress fan-out, `gBrowserInit`, `selectedTab`/`selectedBrowser`, `getTabForBrowser` landing together with `gBrowserInit`); CHROME_TOOLBAR window-type fix; derived gates (browserWindows consumers as set equality, Theia frame never in the tracker, http(s)-only navigation guard against moz-extension://); `verify-shell-gbrowser-standin.mjs` rewritten for the new member set (T-27-11 moved to Phase 35 plan 35-01); D-74 amended for this one logic patch
**Rulings**: while the IDE has focus the last web tab stays active for extensions (Chris, 2026-10-21); the getTabForBrowser-null ruling is reversed
**Success Criteria** (what must be TRUE):

  1. In a rebuilt binary with patch 050 applied, an installed extension's `tabs.query`, `tabs.onCreated/onActivated/onUpdated/onRemoved` and `windows.*` report the open web tabs with real ids, and the Theia frame never appears
  2. Content scripts in web pages get `sender.tab`; webRequest and webNavigation carry the real tab id; `tabs.executeScript`/`sendMessage` by id reach the right page
  3. An extension with a `page_action` `show_matches` starts and restarts cleanly with zero web tabs open, with the IDE focused, and when the first web tab opens (the adversarial-check cases)
  4. A toolbar action run while a web page is on screen acts on that page, not on the stock window's tab, and the stock window (GUI-01) still works
  5. `scripts/verify-platform.sh --quick` passes with the new derived gates and their self-tests, and `apply-patches.sh --self-test` plus `check-patch-surface.sh` pass with 050 in the stack

**Plans**: 4 plans (strictly sequential waves; DSH codes, Claude checks)

Plans:
- [ ] 31.1-01-PLAN.md (wave 1) — Regenerate patch 050 from the pinned upstream bytes, carrying every guard the verification found necessary.
- [ ] 31.1-02-PLAN.md (wave 2) — Build the chrome-side tab host behind PowerBrowserAPI, together with the gate that asserts its member set, and prove each slice live on the binary 31.1-01 built.
- [ ] 31.1-03-PLAN.md (wave 3) — Turn the phase's scope rulings into derived static gates, so an ESR rebase or a later edit cannot quietly undo them.
- [ ] 31.1-04-PLAN.md (wave 4) — Finish EXT-05's live proof on the stamped binary: the adversarial starts, the toolbar target with GUI-01, the extension-path scheme wall and a whole-session Theia check.

### Phase 32: Page Tools

**Goal**: The tools Firefox offers around a web page (find, zoom, print, save, edit, audio, downloads, source, reader view, crash recovery) work on web tabs
**Depends on**: Phase 31 (the app menu and `openStockPage`)
**Requirements**: PAGE-01, PAGE-02, PAGE-03, PAGE-04, PAGE-05, PAGE-06, PAGE-08, PAGE-09, PAGE-10, PAGE-11
**Research**: partly — the downloads, print and edit-command probes run first (research probes 4, 6 and 9); if page-started downloads save silently today, that is fixed before anything else in the phase
**Notes**: browser-element methods only (`finder`, `fullZoom`, `mute`, `stop`, `reloadWithFlags`, `gotoIndex`); never load `browser-fullZoom.js`, `printUtils.js` or another `browser.xhtml` script; favicons come via LinkHandlerParent → the Phase 31.1 tab host plus Places (the getTabForBrowser-null ruling was reversed by the Phase 28 sign-off, 2026-10-21); mute, soundPlaying and zoom become tab-host members; PAGE-07 is in Phase 35 with the fullscreen furniture
**Success Criteria** (what must be TRUE):

  1. Ctrl+F and F3 open a find bar that shrinks the page instead of covering it, with highlight all, match case, whole words and a match count; Ctrl+plus, Ctrl+minus and Ctrl+0 zoom the page, and a chip in the pill shows the level and resets it
  2. Ctrl+P on a web page opens the system print dialog; Ctrl+S saves the page to a place the user picks; cut, copy, paste and undo work in a focused page from the Edit menu and the usual keys
  3. Site favicons show on tabs, the strip and the pill; a tab playing audio shows it, and the user mutes or unmutes that tab from the tab or with Ctrl+M
  4. A downloads button and panel list each download, which the user can open, show in its folder, cancel or retry; no page-started download is saved without appearing there
  5. Reader view opens on article pages, Ctrl+U shows the page source, F12 opens the page's developer tools, and a crashed tab shows a reload button instead of a blank page

**Plans**: 9/9 plans executed (strictly sequential waves; DSH codes, Claude checks)
**Status**: plans done; verification human_needed, deferred to the end-of-milestone pass (32-VERIFICATION.md, 32-UAT.md). PAGE-09's Edit menu entries and greying are carried to Phase 33.

Plans:
- [x] 32-01-PLAN.md (wave 1) — Lead the phase with the three research probes plus the chrome half of the element-method tracers: find (PAGE-01), zoom (PAGE-02), mute/audio (PAGE-05).
- [x] 32-04-PLAN.md (wave 2) — Ship the Downloads view-push panel (PAGE-06) on the 32-01 foundation.
- [x] 32-09-PLAN.md (wave 3) — Give the extension tab host the mute and zoom members Phase 31.1 left to this phase, so extensions see and drive the same mute and zoom state the chrome bar does (PAGE-05, PAGE-02)
- [x] 32-02-PLAN.md (wave 4) — Wire the 32-01 chrome kinds to the Theia UI: widget methods + push subscriptions (find/zoom/mute), the find bar, the zoom chip, audio marks, contracted copy, commands, keybindings,
- [x] 32-03-PLAN.md (wave 5) — Ship system-dialog print (PAGE-03) on the 32-01 foundation.
- [x] 32-05-PLAN.md (wave 6) — Ship picker-split save (PAGE-08) on the 32-01 foundation.
- [x] 32-06-PLAN.md (wave 7) — Ship probe-gated edit commands (PAGE-09) on the 32-01 foundation.
- [x] 32-07-PLAN.md (wave 8) — Ship the chrome half of the same-tab and stock-window page tools on the 32-01 foundation: reader / view source / devtools arms (PAGE-10), crash signal (PAGE-11), the shared-process
- [x] 32-08-PLAN.md (wave 9) — Ship the Theia half of the same-tab and stock-window page tools on the 32-07 chrome foundation: favicon rendering (PAGE-04), reader toggle / view source / devtools wiring (PAGE-10)

**UI hint**: yes

### Phase 33: Bookmarks, History and the Full Menu

**Goal**: The user bookmarks, reopens and clears from the chrome bar, and the app menu and Actions mode reach every browser action v1.5 ships
**Depends on**: Phase 32 (Downloads, Print, Save Page As, Find and Zoom exist for the menu and Actions mode)
**Requirements**: BMK-01, BMK-02, BMK-03, BMK-04, BMK-05, BMK-06, MENU-03, SMODE-07
**Notes**: Places writes go only through `PowerBrowserAPI` (never raw SQL, never a second writer in the Theia backend), and the bookmarks toolbar refreshes from a Places observer push; one `clearHistory` kind fans out to every store, the token cookie stays exempt; MENU-03 and SMODE-07 sit here because their entries are the features Phases 32 and 33 build
**Success Criteria** (what must be TRUE):

  1. The star or Ctrl+D bookmarks the page, and the star is filled on bookmarked pages; the star's popover edits the bookmark's name and folder or removes it
  2. Ctrl+Shift+T reopens the last closed tab with its back/forward history, and a history menu lists recently closed tabs and recent pages
  3. Ctrl+Shift+B shows a bookmarks toolbar that updates at once when a bookmark is added or removed anywhere else
  4. Ctrl+Shift+Del clears history over a chosen time range, also clears PowerBrowser's closed tabs, thumbnails, saved pages and web-tab history, and leaves the IDE signed in
  5. The app menu reaches New Tab, New Window, Bookmarks, History, Downloads, Print, Save Page As, Find in Page, Zoom, Full Screen, More Tools and Help; Actions mode runs print, downloads, clear history, settings and the other browser actions, and Command centre still never sends typed text to a search engine

**Plans**: 5 plans (strictly sequential waves; DSH codes, Claude checks)
**Status**: plans done; verification human_needed, deferred to the end-of-milestone pass (see 33-VERIFICATION.md, 33-UAT.md). PAGE-09 was delivered here (33-05).

Plans:
- [x] 33-01-PLAN.md (wave 1) — Chrome-side foundation for every Phase 33 store surface: the bookmark write/remove/update kinds, the closed-tab read kind, the single clearHistory fan-out kind, the client methods,
- [x] 33-02-PLAN.md (wave 2) — Star button + editor popover (BMK-01, BMK-02): the in-pill star, its filled state, Ctrl+D on both focus paths, and the anchored editor portal with name/folder/Remove/Done.
- [x] 33-03-PLAN.md (wave 3) — Bookmarks toolbar + reopen closed tab + History submenu (BMK-03, BMK-04, BMK-06): the collapsible toolbar row with live observer refresh, Ctrl+Shift+T history-carrying reopen, and 
- [x] 33-04-PLAN.md (wave 4) — Clear Recent History picker (BMK-05): the five-range picker panel, its confirm-only clearHistory call, and Ctrl+Shift+Del on both focus paths.
- [x] 33-05-PLAN.md (wave 5) — Full hamburger menu + Actions coverage (MENU-03, SMODE-07): the Firefox-ordered MENU-03 entries with four submenus, the shared-id discipline with Actions rows, and the Command-cent

**UI hint**: yes

### Phase 34: Tab Strip

**Goal**: The tab strip handles tabs the way Firefox's does: tab menu, drag, pin, overflow, multiselect, preview and attention
**Depends on**: Phase 33 (the tab menu's Mute and Bookmark items come from Phases 32 and 33)
**Requirements**: TAB-01, TAB-02, TAB-03, TAB-04, TAB-05, TAB-06, TAB-07, TAB-08, TAB-09, BMK-07
**Research**: yes — the tab-strip rows were outside the v1.5 research until Chris's 2026-10-20 ruling; reorder (drop index plus `setTabPosition`), pin persistence across restarts and the title-change push need a look at how each mode's strip is built
**Success Criteria** (what must be TRUE):

  1. Right-clicking a tab offers Reload, Duplicate, Pin, Mute, Bookmark, Bookmark All Tabs, Move, Close Others, Close Tabs to the Left, Close Tabs to the Right and Close Duplicates, and each item does what it says
  2. Dragging a tab reorders the strip; middle-click closes a tab; double-clicking the empty strip opens a new tab; a link dropped on the strip opens as a tab
  3. An overflowing strip scrolls, and List All Tabs picks any tab; a pinned tab shrinks to its icon and is still pinned after a restart
  4. The user selects several tabs and closes, moves, mutes or bookmarks them together; hovering a tab shows a preview card; a background tab whose title changes shows an attention mark

**Plans**: 5 plans (strictly sequential waves; DSH codes, Claude checks)
**Status**: plans done; verification human_needed, deferred to the end-of-milestone pass (see 34-VERIFICATION.md, 34-UAT.md).

Plans:
- [x] 34-01-PLAN.md (wave 1) — Tab context menu (TAB-01) plus Bookmark Tab / Bookmark All Tabs (BMK-07) on the extended strip (D-01, D-02, D-03, D-04, D-13, D-15, D-16).
- [x] 34-02-PLAN.md (wave 2) — In-strip drag reorder (TAB-02), middle-click close plus double-click new plus drop-to-open (TAB-03, TAB-08), overflow scroll plus List All Tabs (TAB-04) — D-01, D-02, D-05, D-06, D
- [x] 34-03-PLAN.md (wave 3) — Pin with restart persistence (TAB-05) plus multiselect with bulk delegation (TAB-06) — D-01, D-02, D-08, D-09, D-13, D-14, D-15, D-16.
- [x] 34-04-PLAN.md (wave 4) — Hover preview card (TAB-07) plus background-title attention mark (TAB-09) — D-01, D-02, D-10, D-11, D-12, D-15, D-16.
- [x] 34-05-PLAN.md (wave 5) — Phase-close live run: full twelve-scenario suite (all TAB plus BMK-07 plus modes/D-02), registry order proof, VALIDATION green-marking — D-01..D-16 (all prior decisions proven toge

**UI hint**: yes

### Phase 35: Shell Furniture and Page Context Menu

**Goal**: The stock Firefox furniture that page actors look for is present on the shell window, so the page context menu, form autocomplete, tooltips and page fullscreen work in web tabs
**Depends on**: Phase 34 (serial; `webTabActivated` and the layer policy come from Phase 27)
**Requirements**: PROMPT-04, PROMPT-06, PROMPT-08, PAGE-07
**Research**: probes first — right-click in an overlay today, the freeze-frame latency and the page clipboard paste popup (research probes 3, 8 and 12); the G4b freeze-frame spike is part of the phase
**Notes**: `PowerBrowserAPI.installShellFurniture(window)` is the one installer, checked by a derived `verify-shell-furniture.mjs` with `--self-test`; stock toolkit popups with stock strings in `powerbrowser.xhtml` are shell furniture (rule 5 ruling, 2026-10-20); every new `gBrowser` member or shim global follows the Phase 27 policy; `windowtype` never changes
**Success Criteria** (what must be TRUE):

  1. Right-clicking inside a web page shows Firefox's context menu (open link in new tab, copy link, save image, inspect and the rest) and each item works; right-clicking in the IDE still shows Theia's own menu
  2. Page forms show the form-history and saved-login autocomplete popup under the field
  3. Hovering an element with a `title` shows its tooltip, and hovering a link shows the link status text
  4. F11 on a web page makes the window full screen, and a page video that enters fullscreen shows Firefox's fullscreen warning and leaves fullscreen on Esc

**Plans**: 7 plans (strictly sequential waves; DSH codes, Claude checks)
**Status**: plans done; verification human_needed, deferred to the end-of-milestone pass (see 35-VERIFICATION.md, 35-UAT.md).

Plans:
- [x] 35-01-PLAN.md (wave 1) — Close T-27-11 and give every Phase 35 shim global its derived coverage before any shim lands.
- [x] 35-02-PLAN.md (wave 2) — The tracer for the furniture installer, on PROMPT-08: page tooltips and the link-hover status
- [x] 35-03-PLAN.md (wave 3) — Build the page context menu engine (PROMPT-04) and every row that needs nothing from Phases
- [x] 35-04-PLAN.md (wave 4) — Finish PROMPT-04's rows that run on other phases' mechanisms: Inspect (D-13), the edit rows
- [x] 35-05-PLAN.md (wave 5) — Complete the page menu with the two pieces the 28 sign-off and the ROADMAP research line bind to
- [x] 35-06-PLAN.md (wave 6) — Host the stock form furniture (PROMPT-06): the `PopupAutoComplete` panel FormHistory and
- [x] 35-07-PLAN.md (wave 7) — Ship PAGE-07 with both halves and the stock warning (D-05, B5).

**UI hint**: yes

### Phase 36: New-Window Links as Web Tabs

**Goal**: Links and scripts that open a new window open a web tab next to the opener, and the stock browser window stays reachable (GUI-01)
**Depends on**: Phase 35 (the furniture installer)
**Requirements**: PROMPT-05
**Research**: yes — the adoption lifecycle of chrome-created overlays and the GUI-01 design (research probe 5)
**Notes**: alone because it is the only v1.5 phase that can break GUI-01. `nsIBrowserDOMWindow` on the shell branches on the opener (the Theia frame shares the window with the overlays); pending overlays are created chrome-first with `openWindowInfo` and adopted, with a 5 s fallback to the stock window; `browser-window-command.ts` moves onto an actor kind in the same phase; the GUI-01 live row runs in this phase
**Success Criteria** (what must be TRUE):

  1. Clicking a `target=_blank` link, or a page calling `window.open`, opens a new web tab next to the opener, and closing that tab reselects the opener
  2. The opened tab has a working `window.opener`, so a sign-in popup flow completes and returns to the opener
  3. A `window.open` with popup features still opens a popup window, and the IDE's open-browser-window command still opens the stock browser window (GUI-01)

**Plans**: 3 plans (strictly sequential waves; DSH codes, Claude checks)
**Status**: plans done; verification human_needed, deferred to the end-of-milestone pass (see 36-VERIFICATION.md, 36-UAT.md).

Plans:
- [x] 36-01-PLAN.md (wave 1) — Build the chrome half of PROMPT-05: a minimal nsIBrowserDOMWindow shim behind the boundary, installed by one `installNewWindowReceivers(window)` call, that adopts overlay-opener ne
- [x] 36-02-PLAN.md (wave 2) — Build the frontend half of PROMPT-05 on top of plan 36-01: WebTabOpenHandler.adopt (mint + tab-after + background-aware activation + webTabAdopt ack + unknown-key self-sweep), the 
- [x] 36-03-PLAN.md (wave 3) — Prove PROMPT-05 live in the built shell: _blank clicks and page window.open become opener-adjacent web tabs with a working window.opener (postMessage round-trip), close reselects t

### Phase 37: Permission Prompts and Dialogs

**Goal**: A page that asks for a permission, a password save or a dialog gets Firefox's prompt in place, and the IDE stays usable
**Depends on**: Phase 36 (Allow on a blocked popup opens through the new-window path)
**Requirements**: PROMPT-01, PROMPT-02, PROMPT-03, PROMPT-07, PROMPT-09
**Research**: yes — `popup-notifications.inc.xhtml`, the WebRTC device picker and password-save templates; the dialog and permission probes run first (research probes 1 and 2)
**Needs Chris**: only if probe 1 shows the stock dialog blocks the IDE and a tab-scoped relay is not feasible, because PROMPT-03 as written rules that dialog out
**Notes**: doorhangers use the stock `PopupNotifications` on a native panel anchored to a rect Theia reports, never an `allow` kind a frame could call (research D2); research D5 assumed the stock window-modal dialog, which PROMPT-03 accepts only if it leaves the IDE usable; BiDi cannot see XUL panels, so checks assert page-side outcomes and use KWin screenshots
**Success Criteria** (what must be TRUE):

  1. A page asking for the camera, microphone, location or notifications shows a permission prompt anchored in the chrome bar; the answer is remembered per site and shows in the Phase 31 site panel; a request from a background tab waits until that tab is shown
  2. While a page uses the camera, microphone or screen, a sharing indicator shows
  3. alert, confirm, prompt, leave-page and HTTP-auth dialogs appear and can be answered while the rest of the IDE stays usable, and a page that repeats them can be stopped
  4. After a login, the user is offered to save or update the password
  5. Per-tab notification bars appear for a blocked popup, a hung script and a protocol handler, and their actions work (Allow on a blocked popup opens it as a web tab)

**Plans**: 4 plans (strictly sequential waves; DSH codes, Claude checks; prompts answer only via Firefox's own buttons, Chris 2026-10-25)
**Status**: plans done; verification human_needed, deferred to the end-of-milestone pass (see 37-VERIFICATION.md, 37-UAT.md).

Plans:
- [x] 37-01-PLAN.md (wave 1) — Wave 0 gates plus the first end-to-end tracer.
- [x] 37-02-PLAN.md (wave 2) — Remember, the WebRTC device template and the sharing indicator, on top of the 37-01
- [x] 37-03-PLAN.md (wave 3) — Dialogs, with the Chris gate.
- [x] 37-04-PLAN.md (wave 4) — Password save and update, and the three per-tab notification bars.

**UI hint**: yes

### Phase 38: WebExtensions

**Goal**: Installed Firefox extensions work in web tabs as they do in Firefox, driven from toolbar buttons and a puzzle menu in the chrome bar
**Depends on**: Phase 37, and Phase 28's signed-off route (not planned without it)
**Requirements**: EXT-06, EXT-07, EXT-08, EXT-09, EXT-10
**Research**: yes — planned from the Phase 28 spike record
**Notes**: if the signed-off route needs the GUI-05 bridge, the scope consequence recorded at sign-off governs this phase; EXT-09 adds addons.mozilla.org hosts to `powerbrowser/endpoint-allowlist.json`, and `allowlist-doc-consistency` then needs each allow-dispositioned Mozilla host named in this file and REQUIREMENTS.md in the same change (38-05 allows exactly **addons.mozilla.org** for the add-ons site and its signed XPIs, and **versioncheck.addons.mozilla.org** and **versioncheck-bg.addons.mozilla.org** for the update checks of add-ons installed from it; services.addons.mozilla.org stays deny); extension icon, name and badge are read chrome-side
**Success Criteria** (what must be TRUE):

  1. An installed extension's `tabs.query`, tab events and active tab report the web tabs as they would in Firefox
  2. Extension buttons show in the chrome bar and in a puzzle menu with icon, badge, Pin to Toolbar, Manage and Remove; clicking a button opens its popup or runs its action on the active web tab
  3. Extension content scripts, page actions and context-menu entries work in web tabs
  4. Installing an extension from addons.mozilla.org shows the stock install prompt, and the extension then works
  5. An ad blocker, a password manager and a dark-mode extension are each checked working live in web tabs

**Plans**: 5 plans (strictly sequential waves; DSH codes, Claude checks)
**Status**: plans done; verification human_needed, deferred to the end-of-milestone pass (see 38-VERIFICATION.md, 38-UAT.md).

Plans:
- [x] 38-01-PLAN.md (wave 1) — Build the chrome-side extension bridge on the Phase 31.1 tab host: action-state
- [x] 38-02-PLAN.md (wave 2) — Render the EXT-06/07 surface on the 38-01 bridge: buttons row, puzzle menu,
- [x] 38-03-PLAN.md (wave 3) — Prove EXT-08 on the stack that already exists: content scripts + messaging on the
- [x] 38-04-PLAN.md (wave 4) — Implement Chris's B5 ruling (2026-10-22, verbatim in 38-CONTEXT.md): sidebar
- [x] 38-05-PLAN.md (wave 5) — Close the phase's AMO + fixtures surface: AMO install over the stock prompt path

**UI hint**: yes

## Progress

**Execution Order:** 27 → 28 → 29 → 30 → 31 → 32 → 33 → 34 → 35 → 36 → 37 → 38 (strictly serial; Phase 26 is outside v1.5)

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 27. Groundwork, Navigation Buttons and Page-Focus Keys | 8/8 | In Progress|  |
| 28. WebExtension Tab Route Spike | 0/0 | Complete    | 2026-10-21 |
| 29. Address Bar Search and Fixup | 10/10 | In Progress|  |
| 30. Address-Bar Modes and Command Centre | 6/6 | In Progress|  |
| 31. Site Identity, Permissions and App Menu | 0/TBD | Not started | - |
| 32. Page Tools | 9/9 | In Progress | - |
| 33. Bookmarks, History and the Full Menu | 5/5 | Executed, verification deferred | - |
| 34. Tab Strip | 5/5 | Executed, verification deferred | - |
| 35. Shell Furniture and Page Context Menu | 7/7 | Executed, verification deferred | - |
| 36. New-Window Links as Web Tabs | 3/3 | Executed, verification deferred | - |
| 37. Permission Prompts and Dialogs | 4/4 | Executed, verification deferred | - |
| 38. WebExtensions | 5/5 | Executed, verification deferred | - |

## Hard constraints (every phase)

- Never fork or patch Theia core — `@powerbrowser/*` extensions only; never modify Gecko outside the patch stack (hook-only patches)
- Firefox internals only through `powerbrowser/shell/PowerBrowserAPI.sys.mjs`, every touchpoint catalogued in `powerbrowser/INTERNAL-APIS.md`; privileged pages open by enum, never by URL
- One verification driver `scripts/verify-platform.sh` — new checks land as registry rows with `--self-test`, never sibling drivers
- Single chrome-side SQLite writer; sessionstore stays restore authority; groups never sessionstore-coupled
- No `[features]`/`[modes]` manifest flags — modes are data with shipped defaults

## Inherited network egress (carried through the migration, not decided here)

The imported platform allows exactly three Mozilla hosts, all one feature —
Remote Settings, which cannot be disabled without also losing CRLite
certificate revocation, intermediate certificate preloading, and
tracking-protection updates: **firefox.settings.services.mozilla.com**,
**content-signature-2.cdn.mozilla.net**, and
**firefox-settings-attachments.cdn.mozilla.net**. They are named here and in
REQUIREMENTS.md because `verify-platform.sh`'s `allowlist-doc-consistency`
check requires every allow-dispositioned Mozilla host to be documented in this
project's own planning record rather than only inside the allowlist file — an
allow entry nobody had to write down is one nobody has to defend. Repointing
them per a downstream's manifest is Phase 4's TEL-03.

### Phase 39: v1.5 Close-out

**Goal:** Fix every open v1.5 defect and finish the end-of-milestone pass, so v1.5 Chrome Bar Firefox Parity closes with no green-by-exclusion rows (Chris, 2026-11-05: "fix all three", "fix all 13", "every deferral well documented").
**Requirements**: PROMPT-04, PROMPT-06, PROMPT-08 (C22-C24 live), EXT-01..EXT-10 (999.15/999.16), plus the live halves of every v1.5 requirement whose UAT row is still pending
**Depends on:** Phase 38
**Plans:** 20 plans

**Scope:**
1. Product fixes: C22 the `title=` page tooltip never opens; C23 the saved-login autocomplete popup never opens; C24 Copy Image leaves no image flavour on the clipboard; C11 page-menu dismissal `focusPage()` race (999.10).
2. Every backlog row 999.4-999.16 fixed, none deferred: 999.4 bookmarks-toolbar order-dependent instrument failure; 999.5 nav-keys Back leg with no interaction; 999.6 mode-tokens `*x` flake; 999.11 opener-null plant anchor; 999.12 KDE portal chooser for screen sharing; 999.13 four prompts self-test plants re-sited; 999.14 kwinShot raises the shell before spectacle; 999.15 event-page wake and 999.16 enterprise policies with no stock window — one root cause (`browser-delayed-startup-finished` / `sessionstore-windows-restored` are sent only by a stock window), landing as a regenerated patch 050 plus a Gecko rebuild.
3. `scripts/verify-platform.sh` and `--gate` green with `page-furniture-live` and its self-test included.
4. Every automatable pending UAT item in phases 27, 31.1, 32, 33, 34, 35, 36, 37, 38 run by Claude (live harnesses, gsd-browser, KWin raise + spectacle) and recorded in the UAT file; 32-UAT.md gets the page-tools PASS from the 2026-11-04 sweep; 34-UAT.md is rewritten to the UAT template so `uat.complete-session` parses it.
5. The ~20 owner-decision UAT rows (32 T11; 36 T18; 37 T34-T41; 38 T31-T40) each get a one-line recommendation and are put to Chris per phase through the AskUserQuestion box.
6. Bookkeeping: REQUIREMENTS.md rows v1.5 delivered ticked, ROADMAP boxes for phases 27-38 ticked, WINDOWS.md updated.
7. Anything still unresolved at the end is documented as a backlog row plus a WINDOWS.md entry carrying repro, cause-so-far and the source UAT test, so a later version can pick it up without rediscovery. Human-only checks (human eye, portal click) are collected into one checklist for Chris.

Runs autonomously on main (`/gsd-autonomous`); it stops only for the owner-call batches, the human-only checklist and the push.

Plans:
**Wave 1**
- [ ] 39-01-PLAN.md (wave 1) — Baseline: 34-UAT rewritten, real-input gate (pb-kwin), C24 bisect, symlink check, full registry red list in 39-BASELINE.md

**Wave 2** *(blocked on Wave 1 completion)*
- [ ] 39-02-PLAN.md (wave 2) — Tracer: C11 page-menu dismissal race fixed end to end (guard, plant, workaround removed, 999.10 ticked)
- [ ] 39-03-PLAN.md (wave 2) — Owner batch A: OQ1 plus phases 32, 33, 36, 37, 38 in the box; rulings recorded

**Wave 3** *(blocked on Wave 2 completion)*
- [ ] 39-04-PLAN.md (wave 3) — 999.15/999.16: patch 050 sections, guard rows G14/G15, no-compile go-live, live scenarios

**Wave 4** *(blocked on Wave 3 completion)*
- [ ] 39-05-PLAN.md (wave 4) — C24 Copy Image and C22 title tooltip, diagnose then fix

**Wave 5** *(blocked on Wave 4 completion)*
- [ ] 39-06-PLAN.md (wave 5) — C23 saved-login popup, diagnose then fix; 35 T16-T18 scenarios

**Wave 6** *(blocked on Wave 5 completion)*
- [ ] 39-07-PLAN.md (wave 6) — 35 T19-T20 scenarios; page-furniture rows through the registry; 35-UAT recorded

**Wave 7** *(blocked on Wave 6 completion)*
- [ ] 39-08-PLAN.md (wave 7) — Harness fixes 999.4, 999.6, 999.5

**Wave 8** *(blocked on Wave 7 completion)*
- [ ] 39-09-PLAN.md (wave 8) — Prompts harness 999.14, 999.13, 999.12 (X11 sharing route)

**Wave 9** *(blocked on Wave 8 completion)*
- [ ] 39-10-PLAN.md (wave 9) — OQ1 ruling implemented, probe 1 live, 37 T18-T21 scenarios

**Wave 10** *(blocked on Wave 9 completion)*
- [ ] 39-11-PLAN.md (wave 10) — 37 T22-T25 scenarios; prompts rows through the registry; 37-UAT recorded

**Wave 11** *(blocked on Wave 10 completion)*
- [ ] 39-12-PLAN.md (wave 11) — 999.11 and 36 T12-T16 scenarios; 36-UAT recorded

**Wave 12** *(blocked on Wave 11 completion)*
- [ ] 39-13-PLAN.md (wave 12) — 38 T22, T24-T30 scenarios; extension rows through the registry; 38-UAT recorded

**Wave 13** *(blocked on Wave 12 completion)*
- [ ] 39-14-PLAN.md (wave 13) — EXT-10 fill on a local Vaultwarden (38 T31, option b)

**Wave 14** *(blocked on Wave 13 completion)*
- [ ] 39-15-PLAN.md (wave 14) — Real OS input rows: 27 T1-T4, 34 T1/T6/T13, 36 T5, 38 T23

**Wave 15** *(blocked on Wave 14 completion)*
- [ ] 39-16-PLAN.md (wave 15) — 33 T6 edit-greying; 32 and 34 remaining rows; page-tools and tab-strip rows recorded

**Wave 16** *(blocked on Wave 15 completion)*
- [ ] 39-17-PLAN.md (wave 16) — Owner batch B: phases 27, 31.1, 34, 35 with live evidence; rulings recorded

**Wave 17** *(blocked on Wave 16 completion)*
- [ ] 39-18-PLAN.md (wave 17) — Ruled changes: 31.1 T3 error-page allow-list, 34 T1 drag-handle carve-out

**Wave 18** *(blocked on Wave 17 completion)*
- [ ] 39-19-PLAN.md (wave 18) — Full registry and --gate; residuals and follow-ups to backlog rows and WINDOWS.md

**Wave 19** *(blocked on Wave 18 completion)*
- [ ] 39-20-PLAN.md (wave 19) — REQUIREMENTS/ROADMAP close-out, the human-only checklist, one human-verify stop

---

## Backlog

### Phase 999.1: SQL-browser-memory (BACKLOG)

**Goal:** [Captured for future planning]
**Requirements:** TBD
**Plans:** 0 plans

Make every tab a SQL row, alongside bookmarks, sessions, and anything else that
can live in SQL.

**Not Databasise.** Databasise is a separate project and will not be in Power
Browser. The out-of-scope line naming Databasise says nothing about whether
this item is in scope — the two were conflated once and must not be again.

**The seam that already exists.** `TabUriRegistry` gives tabs stable URI
identity (the GUI-04 declared bridge interface). Stable tab identity is the
property this would build on, and most browsers do not have it.

**Three migrations, not one:**

- Bookmarks / history — already SQL upstream (`places.sqlite`); expose and
  extend rather than build

- Sessions — `sessionstore` is compressed JSON, not SQL
- Theia workbench layout — separate again
- Tabs — the only layer where the schema would be net-new

**Boundary to respect if this is ever planned:** ARCHITECTURE.md Anti-Pattern 6
— if a downstream needs to change platform behaviour, the platform needs an
extension point; adding a `[features]` flag is the bug, not the fix.

Plans:

- [ ] TBD (promote with /gsd-review-backlog when ready)

### Phase 999.2: Release and distribution (BACKLOG)

Deferred here 2026-09-25 under D4 (a): NG-075..NG-082 (distribution work
that needs hosts, accounts or long builds outside this machine: Windows
MSIX, macOS DMG, install matrix and per-OS MAR hop, release pipeline,
update host, production crash-ingest host, per-fixture builds, Theia re-pin
to 1.75.0). Deferred here 2026-09-28: NG-074 (CI verify on main) and NG-084
(the five v1.2 human UAT sheets) move to Phase 15. Chris: "Run them for me"
for NG-075..NG-082 (ledger/history/log.jsonl lines 332–339) and "Defer all
the checks" for NG-074 and NG-084 (ledger/history/log.jsonl lines 364 and
366), each op carrying the quoted answer.

**Goal:** [Captured for future planning]
**Requirements:** TBD
**Plans:** 0 plans

Plans:

- [ ] TBD (promote with /gsd-review-backlog when ready)

### Phase 999.3: Tab dialog host (PROMPT-03) (BACKLOG)

Deferred here from Phase 37 by Chris 2026-11-03. The live dialog-probe
(`.planning/probes/prompt-probe-verdict.json`) found every stock page dialog
(alert, confirm, prompt, leave-page, HTTP auth) locks the IDE, and no relay is
feasible without widening: cross-domain HTTP auth with spoof protection calls
`gURLBar.setURI` and `setTabLabelForAuthPrompts`, which the shell lacks.

**Goal:** Page dialogs and HTTP auth that do not lock the IDE (PROMPT-03)
**Requirements:** PROMPT-03
**Plans:** 0 plans

Scope: a shell-side TabDialogBox host for web tabs, plus `setURI` and
`setTabLabelForAuthPrompts` routed to the Theia bar and tab strip, all through
`PowerBrowserAPI.sys.mjs`. `verify-permission-prompts.mjs` rule (p) stays green
on the stock-blocks-ide verdict only while REQUIREMENTS.md records this deferral.

Plans:

- [ ] TBD (promote with /gsd-review-backlog when ready)

### Phase 999.4: Follow-up — Phase 33 deferred UAT follow-up: Test 3 (BACKLOG)

**Goal:** Resolve the UAT checkpoint deferred during Phase 33 verification
**Source phase:** 33
**Deferred at:** 2026-11-04 during /gsd-verify-work 33 session completion
**Follow-ups:**
- [ ] Test 3: bookmarks-toolbar stops in every full address-bar run (3 of 3) on 'broken instrument: the session tab page could not be focused' and passes alone; find the earlier scenario that leaves page focus unreachable (deferred 2026-11-04)

### Phase 999.5: Follow-up — Phase 33 deferred UAT follow-up: Test 2 (BACKLOG)

**Goal:** Resolve the UAT checkpoint deferred during Phase 33 verification
**Source phase:** 33
**Deferred at:** 2026-11-04 during /gsd-verify-work 33 session completion
**Follow-ups:**
- [ ] Test 2: verify-nav-keys-live drives Back only after a real click in the page (interactWith), so it cannot see an AB-4 style regression; add a navigate leg with no interaction (deferred 2026-11-04)

### Phase 999.6: Follow-up — Phase 33 deferred UAT follow-up: Test none (BACKLOG)

**Goal:** Resolve the UAT checkpoint deferred during Phase 33 verification
**Source phase:** 33
**Deferred at:** 2026-11-04 during /gsd-verify-work 33 session completion
**Follow-ups:**
- [ ] Test none: AB-9: the mode-tokens *x step failed once in four address-bar runs (flaky, minor) (deferred 2026-11-04)

### Phase 999.7: Follow-up — Phase 35 deferred UAT follow-up: Test 9 (BACKLOG)

**Goal:** Resolve the UAT checkpoint deferred during Phase 35 verification
**Source phase:** 35
**Deferred at:** 2026-11-04 during /gsd-verify-work 35 session completion
**Follow-ups:**
- [ ] Test 9: C22: the title= page tooltip never opens in tooltip-status; the product showTooltip matches upstream browser.js:2016-2038; theia-hover-silent and its plant theia-tooltip-leak wait on it (deferred 2026-11-04)

### Phase 999.8: Follow-up — Phase 35 deferred UAT follow-up: Test 8 (BACKLOG)

**Goal:** Resolve the UAT checkpoint deferred during Phase 35 verification
**Source phase:** 35
**Deferred at:** 2026-11-04 during /gsd-verify-work 35 session completion
**Follow-ups:**
- [ ] Test 8: C23: saved-login shows no autocomplete popup on the username field; cause unknown (deferred 2026-11-04)

### Phase 999.9: Follow-up — Phase 35 deferred UAT follow-up: Test 6 (BACKLOG)

**Goal:** Resolve the UAT checkpoint deferred during Phase 35 verification
**Source phase:** 35
**Deferred at:** 2026-11-04 during /gsd-verify-work 35 session completion
**Follow-ups:**
- [ ] Test 6: C24: Copy Image leaves only text/html on the clipboard, no image flavour; environment (Wayland image targets) or product not separated (deferred 2026-11-04)

### Phase 999.10: Follow-up — Phase 35 deferred UAT follow-up: Test 6 (BACKLOG)

**Goal:** Resolve the UAT checkpoint deferred during Phase 35 verification
**Source phase:** 35
**Deferred at:** 2026-11-04 during /gsd-verify-work 35 session completion
**Follow-ups:**
- [ ] Test 6: C11: a page menu dismissal sends widget.focusPage() a round trip later; when it lands after the next menu opened, chrome focus ends on <body>. The harness now focuses the Theia frame first; the product race itself is unfixed (deferred 2026-11-04)

### Phase 999.11: Follow-up — Phase 36 deferred UAT follow-up: Test 9 (BACKLOG)

**Goal:** Resolve the UAT checkpoint deferred during Phase 36 verification
**Source phase:** 36
**Deferred at:** 2026-11-04 during /gsd-verify-work 36 session completion
**Follow-ups:**
- [ ] Test 9: the opener-null plant expect string 'opener' can match incidental failure text; anchor it to the failure the plant causes (deferred 2026-11-04)

### Phase 999.12: Follow-up — Phase 37 deferred UAT follow-up: Test 6 (BACKLOG)

**Goal:** Resolve the UAT checkpoint deferred during Phase 37 verification
**Source phase:** 37
**Deferred at:** 2026-11-04 during /gsd-verify-work 37 session completion
**Follow-ups:**
- [ ] Test 6: screen sharing needs the KDE portal chooser answered by hand; run sharing with a person at the machine (deferred 2026-11-04)

### Phase 999.13: Follow-up — Phase 37 deferred UAT follow-up: Test 17 (BACKLOG)

**Goal:** Resolve the UAT checkpoint deferred during Phase 37 verification
**Source phase:** 37
**Deferred at:** 2026-11-04 during /gsd-verify-work 37 session completion
**Follow-ups:**
- [ ] Test 17: four prompts self-test plants misbehave once the self-test gets past sharing: queue-shown-early and activation-wrong-tab stay green, camera-template-missing goes red on an empty device menulist, allow-loads-frame-url goes red on popup not adopted next to its opener; re-site each so it reaches its own failure (deferred 2026-11-04)

### Phase 999.14: Follow-up — Phase 37 deferred UAT follow-up: Test 33 (BACKLOG)

**Goal:** Resolve the UAT checkpoint deferred during Phase 37 verification
**Source phase:** 37
**Deferred at:** 2026-11-04 during /gsd-verify-work 37 session completion
**Follow-ups:**
- [ ] Test 33: kwinShot does not raise the shell before spectacle, so the dialog probe PNGs are full-desktop captures; raise the shell with the KWin script first (deferred 2026-11-04)

### Phase 999.15: Follow-up — Phase 38 deferred UAT follow-up: Test 5 (BACKLOG)

**Goal:** Resolve the UAT checkpoint deferred during Phase 38 verification
**Source phase:** 38
**Deferred at:** 2026-11-04 during /gsd-verify-work 38 session completion
**Follow-ups:**
- [ ] Test 5: ext-event-page-wake: browserPaintedPromise resolves only on browser-delayed-startup-finished, which only a stock window sends, so an event page woken by an event never runs with no stock window open. The candidate fix edits upstream ExtensionParent.sys.mjs and must land as a regenerated patch 050 (deferred 2026-11-04)

### Phase 999.16: Follow-up — Phase 38 deferred UAT follow-up: Test none (BACKLOG)

**Goal:** Resolve the UAT checkpoint deferred during Phase 38 verification
**Source phase:** 38
**Deferred at:** 2026-11-04 during /gsd-verify-work 38 session completion
**Follow-ups:**
- [ ] Test none: enterprise policies (for example SearchEngines Default) are applied only when the first stock window fires sessionstore-windows-restored (EnterprisePoliciesParent.sys.mjs:368-369); a shell-only session never applies them. Same root cause as the event-page wake (deferred 2026-11-04)
