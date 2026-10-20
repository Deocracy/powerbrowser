# Requirements — Power Browser v1.5 Chrome Bar Firefox Parity

**Defined:** 2026-10-20
**Core Value:** A stranger can clone Power Browser, edit `configuration.toml`, drop in a logo, and build their own branded, working web browser without touching any other file — then reshape its GUI through Theia extensions without forking the platform.

Scope source: `.planning/research/chrome-bar-firefox-gap.md` (feature gap list) and
`.planning/research/SUMMARY.md` (how to build it). Chris's scope rulings, 2026-10-20:
the chrome bar only; all gap-list areas; full WebExtension support; page prompts; the
tab strip.

**Rulings that shape these requirements (Chris, 2026-10-20):**

- Typed non-URL text may search (lifts 13-UI-SPEC "no new addressability scheme").
- The chrome bar may write to Places (lifts the read-only Places row in `powerbrowser/INTERNAL-APIS.md`).
- Rule 5 clarified: stock Firefox toolkit popups with stock strings in `powerbrowser.xhtml` are shell furniture, not authored browser chrome.
- Search suggestions are on by default, as in Firefox; the engine set comes from `configuration.toml`.
- Firefox keys that clash with Theia keys take the browser meaning only while a web page has focus.
- No clipboard-reading suggestion.
- Chrome-bar copy reads the configured app name, never a hard-coded brand.
- Address-bar mode defaults for Browsing and Organising are decided in the SMODE phase's UI spec, from visual mockups (Chris asked to see examples). Coding = Command centre is decided.

**Technical rulings (Claude, 2026-10-20, from research):** the Theia token cookie on
`127.0.0.1` is never sent to other loopback ports by overlay loads and is exempt from
every clear-data action; favicons come from Places, and `getTabForBrowser` keeps
returning null.

## v1.5 Requirements

### Address-bar modes (SMODE)

- [ ] **SMODE-01**: User can open a modes dropdown at the left end of the address bar listing Command centre, each search engine, Bookmarks, Tabs, History and Actions, plus Search Settings
- [ ] **SMODE-02**: User sees the address bar start in Command centre mode in Coding, and in the per-mode default fixed by the phase UI spec in Browsing and Organising
- [ ] **SMODE-03**: User can see which mode is active from an icon and label chip in the pill, and return to the mode's default with one click or Backspace at the start
- [ ] **SMODE-04**: User can enter a mode by typing its token and a space (`*` bookmarks, `%` tabs, `^` history, `>` actions, `@alias` engine), and cycle modes with Accel+Up/Down or open the dropdown with Alt+Up/Down
- [ ] **SMODE-05**: User in Command centre mode can search files, run `>` commands, and use `#`, `?`, `edt`, `term`, `task`, `debug` and `view` prefixes, with results shown under the pill; `@` and `:` open Theia's symbol and go-to-line pickers
- [ ] **SMODE-06**: User can still go to an address from Command centre: Ctrl+L, Alt+D and F6 switch the pill to address mode, and unambiguous URLs (scheme, localhost, host:port, IP) get a "Go to" first row
- [ ] **SMODE-07**: User can run browser actions (print, downloads, clear history, settings and the like) from Actions mode; Command centre mode never sends typed text to a search engine

### Address bar input and search (BAR)

- [ ] **BAR-01**: User can type non-URL text and press Enter to search with the default engine
- [ ] **BAR-02**: User can open `localhost`, `localhost:4000`, `host:port` and IP addresses by typing them
- [ ] **BAR-03**: User sees search suggestions from the engine as they type (on by default, with a setting to turn them off)
- [ ] **BAR-04**: User can pick the default search engine from engines whose initial set comes from `configuration.toml`
- [ ] **BAR-05**: User can run a one-off search with another engine from the result list
- [ ] **BAR-06**: User choosing an open-tab suggestion switches to that tab instead of loading it again
- [ ] **BAR-07**: User sees the bar complete a typed origin inline (autofill) and can accept it with Enter or Tab
- [ ] **BAR-08**: User can open the typed address in a new tab with Alt+Enter, Ctrl+click or middle-click on a result
- [ ] **BAR-09**: User can remove a history suggestion with Shift+Del
- [ ] **BAR-10**: User can right-click the pill for Cut, Copy, Paste and Paste & Go
- [ ] **BAR-11**: User sees result rows with favicons and type icons, the first click selects the whole address, and IME composition never commits early
- [ ] **BAR-12**: User sees the text they typed but did not submit kept per tab when switching tabs
- [ ] **BAR-13**: User can complete `name` to `www.name.com` with Ctrl+Enter, and drop a link or text onto the bar to load or search it
- [ ] **BAR-14**: User sees every chrome-bar message name the configured application name, never a hard-coded brand

### Navigation buttons (NAV)

- [x] **NAV-01**: User sees Reload turn into Stop while a page loads, and can stop it with the button or Esc
- [x] **NAV-02**: User can bypass the cache with Shift+click Reload, Ctrl+Shift+R or Ctrl+F5
- [x] **NAV-03**: User can right-click or long-press Back/Forward for a session-history menu and jump to any entry
- [ ] **NAV-04**: User can show a Home button and go home with it or Alt+Home; the home page is a setting
- [ ] **NAV-05**: User sees each button's keyboard shortcut in its tooltip
- [x] **NAV-06**: User can middle-click Back, Forward or Reload to open the result in a new tab, and drop a link on New Tab to open it

### Keyboard shortcuts with the page focused (KEY)

- [ ] **KEY-01**: User can press Ctrl+T, Ctrl+W, Ctrl+R/F5, Alt+Left and Alt+Right while focus is inside a web page and get the Firefox action
- [ ] **KEY-02**: User can move focus between pill and page with Alt+D, Ctrl+L and F6/Shift+F6 from inside a page
- [ ] **KEY-03**: User can switch tabs with Ctrl+Tab, Ctrl+Shift+Tab, Ctrl+PageUp/PageDown and Alt+1..9 from inside a page
- [x] **KEY-04**: User keeps Theia's meaning of clashing keys (F5, F6, F11, Ctrl+P, Ctrl+K and others) in editors, terminals and other non-web tabs
- [ ] **KEY-05**: User can use mouse buttons 4 and 5 for Back and Forward over a web page

### Site identity and security (SITE)

- [ ] **SITE-01**: User sees a lock that reflects the page's real connection security, never computed from the typed address
- [ ] **SITE-02**: User sees "Not Secure" on http pages and a warning state for mixed content and certificate errors
- [ ] **SITE-03**: User sees the host with its registrable domain highlighted, IDN shown safely (punycode where spoofable), and `https://` trimmed only when the page is secure
- [ ] **SITE-04**: User can open a site information panel from the lock showing connection details and the certificate
- [ ] **SITE-05**: User can view and change this site's permissions (camera, mic, location, notifications, autoplay, popups) in that panel
- [ ] **SITE-06**: User sees permission icons in the identity box when a site has non-default permissions
- [ ] **SITE-07**: User can clear cookies and site data for the current site, which never logs the IDE out
- [ ] **SITE-08**: User sees a tracking-protection shield showing what was blocked and can turn protection off for a site

### App menu (MENU)

- [ ] **MENU-01**: User can open a hamburger menu from the chrome bar in every mode, ordered as Firefox's
- [ ] **MENU-02**: User can open Settings, Passwords and Add-ons from that menu
- [ ] **MENU-03**: User can reach New Tab, New Window, Bookmarks, History, Downloads, Print, Save Page As, Find in Page, Zoom, Full Screen, More Tools and Help from that menu
- [ ] **MENU-04**: User can quit with Ctrl+Q or from the menu

### Page tools (PAGE)

- [ ] **PAGE-01**: User can find in page with Ctrl+F and F3: highlight all, match case, whole words, match count, without hiding the page
- [ ] **PAGE-02**: User can zoom a page with Ctrl+plus, Ctrl+minus and Ctrl+0, and sees and resets the zoom level from a chip in the pill
- [ ] **PAGE-03**: User can print the page with the system print dialog (Ctrl+P on a web page)
- [ ] **PAGE-04**: User sees site favicons on tabs, the strip and the pill
- [ ] **PAGE-05**: User sees which tabs play audio and can mute or unmute a tab, including with Ctrl+M
- [ ] **PAGE-06**: User can see downloads in a downloads button and panel, open them, show them in the folder, and cancel or retry them
- [ ] **PAGE-07**: User can make the window full screen with F11 on a web page, and a page can enter its own fullscreen (video) with Firefox's warning
- [ ] **PAGE-08**: User can save the page with Ctrl+S and choose where it goes
- [ ] **PAGE-09**: User can cut, copy, paste and undo inside a focused web page from the Edit menu and the usual keys
- [ ] **PAGE-10**: User can open reader view for article pages, view page source (Ctrl+U) and open page developer tools (F12 on a web page)
- [ ] **PAGE-11**: User sees a crashed tab with a reload button instead of a blank page

### Bookmarks and history (BMK)

- [ ] **BMK-01**: User can bookmark the page with the star or Ctrl+D and sees the star filled for bookmarked pages
- [ ] **BMK-02**: User can edit a bookmark's name and folder, or remove it, from a popover on the star
- [ ] **BMK-03**: User can reopen the last closed tab with Ctrl+Shift+T, with its history
- [ ] **BMK-04**: User can show a bookmarks toolbar (Ctrl+Shift+B) that updates live when bookmarks change
- [ ] **BMK-05**: User can clear recent history (Ctrl+Shift+Del) over a chosen time range, which also clears PowerBrowser's own stores (closed tabs, thumbnails, saved pages, web-tab history)
- [ ] **BMK-06**: User can open a history menu with recently closed tabs and recent pages
- [ ] **BMK-07**: User can bookmark one tab or all tabs from the tab menu

### Tab strip (TAB)

- [ ] **TAB-01**: User can right-click a tab for Reload, Duplicate, Pin, Mute, Bookmark, Move, and Close Others/Left/Right/Duplicates
- [ ] **TAB-02**: User can drag tabs to reorder them within the strip
- [ ] **TAB-03**: User can close a tab with middle-click and open a new tab by double-clicking the empty strip
- [ ] **TAB-04**: User can scroll an overflowing strip and pick any tab from a List All Tabs menu
- [ ] **TAB-05**: User can pin a tab, which shrinks it to its icon and keeps it across restarts
- [ ] **TAB-06**: User can select several tabs and act on them together
- [ ] **TAB-07**: User sees a preview card when hovering a tab
- [ ] **TAB-08**: User can drop a link onto the strip to open it as a tab
- [ ] **TAB-09**: User sees an attention mark on a background tab whose title changed

### WebExtensions (EXT, continuing from EXT-03)

- [ ] **EXT-04**: A spike records how web tabs become tabs that WebExtensions can see (patch, bridge or chrome-side tab model), with Chris's sign-off before EXT-05..10 are planned
- [ ] **EXT-05**: An installed Firefox extension sees web tabs in its tabs API (query, events, active tab) as it would in Firefox
- [ ] **EXT-06**: User sees extension toolbar buttons and an extensions (puzzle) menu with icon, badge, Pin to Toolbar, Manage and Remove
- [ ] **EXT-07**: User clicking an extension button opens its popup or runs its action against the active web tab
- [ ] **EXT-08**: Extension content scripts, page actions and context-menu entries work in web tabs
- [ ] **EXT-09**: User can install extensions from addons.mozilla.org with the stock install prompt
- [ ] **EXT-10**: A fixed set of popular extensions (an ad blocker, a password manager, a dark-mode extension) is checked working live in web tabs

### Page prompts and shell furniture (PROMPT)

- [ ] **PROMPT-01**: User is asked before a page uses the camera, microphone, location or notifications, and the choice is remembered per site
- [ ] **PROMPT-02**: User sees a sharing indicator while a page uses the camera, microphone or screen
- [ ] **PROMPT-03**: User gets working alert, confirm, prompt, leave-page and HTTP-auth dialogs that do not lock the IDE, and can stop a page from repeating them
- [ ] **PROMPT-04**: User can right-click inside a web page for Firefox's context menu (open link in new tab, copy link, save image, inspect and the rest)
- [ ] **PROMPT-05**: User clicking a `target=_blank` link or a page calling `window.open` gets a new web tab next to the opener, while the stock browser window stays reachable (GUI-01)
- [ ] **PROMPT-06**: User sees the form-history and saved-login autocomplete popup in page forms
- [ ] **PROMPT-07**: User is offered to save or update a password after logging in
- [ ] **PROMPT-08**: User sees page tooltips (`title=`) and the link-hover status text
- [ ] **PROMPT-09**: User sees per-tab notification bars (popup blocked, hung script, protocol handler) with their actions

## Future Requirements

Deferred, tracked, not in this roadmap.

- Routing Ctrl+P, F1 and Ctrl+Shift+P into the pill (stock quick input keeps them in v1.5)
- Per-site zoom memory and input-history ranking of suggestions
- OpenSearch "Add engine" rows
- Picture-in-Picture, translations, page info dialog, unload tab, touchpad gestures, text encoding, caret browsing
- Sketch 005 items 1-2 (one title row, centred address box)
- The 12 defects in `.planning/milestones/v1.4-phases/24-live-uat-pass/24-GAPS.md`
- Custom modes driven by mode data instead of hard-coded mode ids
- NG-089 live checks (UAT-01, MODE-01 live half, PAN-03..06 live rows) — Chris's own time
- Profiles, import from another browser, update banner (blocked on release host)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Private browsing and its indicator | Product decision not taken; not in v1.5 (Chris, 2026-10-20) |
| Containers | Not in v1.5 (Chris, 2026-10-20) |
| Mozilla account, Sync, synced tabs, Send Tab | Mozilla-hosted services; a rebrand needs its own backend |
| Firefox Suggest, sponsored rows, CFR, Report Broken Site | Mozilla-hosted services |
| Clipboard URL suggestion | Chris, 2026-10-20: off (privacy) |
| Customize Toolbar (CustomizableUI) | It customises `browser.xhtml` chrome, which we do not author |
| `about:` pages in address-bar results | Deliberate scheme wall; privileged pages open by enum (`openStockPage`) |
| Recently closed windows, close window with last tab | One persistent shell window |
| Separate search bar widget | Firefox hides it by default; the modes dropdown covers it |
| Taskbar Tabs | Windows only; no Windows build |
| Patching Theia core | Hard rule 1 |

### Inherited network egress (carried, not decided here)

The imported platform allows exactly three Mozilla hosts, all one feature —
Remote Settings (disabling it would also lose CRLite revocation,
intermediate preloading, and tracking-protection updates):
**firefox.settings.services.mozilla.com**,
**content-signature-2.cdn.mozilla.net**, and
**firefox-settings-attachments.cdn.mozilla.net**. Named here and in
ROADMAP.md because `verify-platform.sh`'s `allowlist-doc-consistency`
check requires every allow-dispositioned Mozilla host to be documented in
the project's own planning record. BAR-03 search suggestions add the
configured engines' suggest hosts to `powerbrowser/endpoint-allowlist.json`
deliberately, in the phase that ships them.

## Traceability

Filled by the roadmap (2026-10-20). Phase 26 is reserved for NG-089 and holds no v1.5 requirement.

| Requirement | Phase | Status |
|-------------|-------|--------|
| SMODE-01 | Phase 30 | Pending |
| SMODE-02 | Phase 30 | Pending |
| SMODE-03 | Phase 30 | Pending |
| SMODE-04 | Phase 30 | Pending |
| SMODE-05 | Phase 30 | Pending |
| SMODE-06 | Phase 30 | Pending |
| SMODE-07 | Phase 33 | Pending |
| BAR-01 | Phase 29 | Pending |
| BAR-02 | Phase 29 | Pending |
| BAR-03 | Phase 29 | Pending |
| BAR-04 | Phase 29 | Pending |
| BAR-05 | Phase 29 | Pending |
| BAR-06 | Phase 29 | Pending |
| BAR-07 | Phase 29 | Pending |
| BAR-08 | Phase 29 | Pending |
| BAR-09 | Phase 29 | Pending |
| BAR-10 | Phase 29 | Pending |
| BAR-11 | Phase 29 | Pending |
| BAR-12 | Phase 29 | Pending |
| BAR-13 | Phase 29 | Pending |
| BAR-14 | Phase 29 | Pending |
| NAV-01 | Phase 27 | Complete |
| NAV-02 | Phase 27 | Complete |
| NAV-03 | Phase 27 | Complete |
| NAV-04 | Phase 27 | Pending |
| NAV-05 | Phase 27 | Pending |
| NAV-06 | Phase 27 | Complete |
| KEY-01 | Phase 27 | Pending |
| KEY-02 | Phase 27 | Pending |
| KEY-03 | Phase 27 | Pending |
| KEY-04 | Phase 27 | Complete |
| KEY-05 | Phase 27 | Pending |
| SITE-01 | Phase 31 | Pending |
| SITE-02 | Phase 31 | Pending |
| SITE-03 | Phase 31 | Pending |
| SITE-04 | Phase 31 | Pending |
| SITE-05 | Phase 31 | Pending |
| SITE-06 | Phase 31 | Pending |
| SITE-07 | Phase 31 | Pending |
| SITE-08 | Phase 31 | Pending |
| MENU-01 | Phase 31 | Pending |
| MENU-02 | Phase 31 | Pending |
| MENU-03 | Phase 33 | Pending |
| MENU-04 | Phase 31 | Pending |
| PAGE-01 | Phase 32 | Pending |
| PAGE-02 | Phase 32 | Pending |
| PAGE-03 | Phase 32 | Pending |
| PAGE-04 | Phase 32 | Pending |
| PAGE-05 | Phase 32 | Pending |
| PAGE-06 | Phase 32 | Pending |
| PAGE-07 | Phase 35 | Pending |
| PAGE-08 | Phase 32 | Pending |
| PAGE-09 | Phase 32 | Pending |
| PAGE-10 | Phase 32 | Pending |
| PAGE-11 | Phase 32 | Pending |
| BMK-01 | Phase 33 | Pending |
| BMK-02 | Phase 33 | Pending |
| BMK-03 | Phase 33 | Pending |
| BMK-04 | Phase 33 | Pending |
| BMK-05 | Phase 33 | Pending |
| BMK-06 | Phase 33 | Pending |
| BMK-07 | Phase 34 | Pending |
| TAB-01 | Phase 34 | Pending |
| TAB-02 | Phase 34 | Pending |
| TAB-03 | Phase 34 | Pending |
| TAB-04 | Phase 34 | Pending |
| TAB-05 | Phase 34 | Pending |
| TAB-06 | Phase 34 | Pending |
| TAB-07 | Phase 34 | Pending |
| TAB-08 | Phase 34 | Pending |
| TAB-09 | Phase 34 | Pending |
| EXT-04 | Phase 28 | Pending |
| EXT-05 | Phase 38 | Pending |
| EXT-06 | Phase 38 | Pending |
| EXT-07 | Phase 38 | Pending |
| EXT-08 | Phase 38 | Pending |
| EXT-09 | Phase 38 | Pending |
| EXT-10 | Phase 38 | Pending |
| PROMPT-01 | Phase 37 | Pending |
| PROMPT-02 | Phase 37 | Pending |
| PROMPT-03 | Phase 37 | Pending |
| PROMPT-04 | Phase 35 | Pending |
| PROMPT-05 | Phase 36 | Pending |
| PROMPT-06 | Phase 35 | Pending |
| PROMPT-07 | Phase 37 | Pending |
| PROMPT-08 | Phase 35 | Pending |
| PROMPT-09 | Phase 37 | Pending |

**Coverage:**

- v1.5 requirements: 87 total
- Mapped to phases: 87 (Phases 27–38)
- Unmapped: 0 ✓

---
*Requirements defined: 2026-10-20*
*Last updated: 2026-10-20 after v1.5 roadmap (Phases 27–38)*
