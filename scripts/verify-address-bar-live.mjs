#!/usr/bin/env node
/**
 * Phase 29 (BAR-01..): the live check for the address bar's search and URI
 * fixup, driven in the built shell over WebDriver BiDi.
 *
 * One session runs the selected scenarios in order and prints one line per
 * scenario: `<scenario>: PASS` or `<scenario>: FAIL -- <reason>`. A thrown
 * error is `harness: <message>` (the check could not drive the product).
 * The engine is hermetic: once per session, chrome adds a user engine whose
 * search path is a page this script serves, and makes it the default, so the
 * served page's request log is the independent observer of every search.
 *
 * Scenarios:
 *   token-cookie  BAR-02's technical ruling: no load to a loopback port other
 *               than the sidecar's carries the Theia token cookie. With a probe
 *               cookie (pbprobe=1) added for 127.0.0.1 as the positive control,
 *               four loads to the served port must each carry pbprobe and no
 *               POWERBROWSER_TOKEN: a GUI-01 stock browser window (opened
 *               first, so when this is the session's first scenario no web
 *               tab has existed yet), an overlay page, its <img> subresource
 *               and a dedicated worker it starts. A web tab opened on the
 *               sidecar's own /powerbrowser/health is an overlay, so its
 *               request (seen chrome-side at http-on-examine-response) carries
 *               no POWERBROWSER_TOKEN and the gate refuses it. The cookie store still holds
 *               the token, and the Theia frame's credentialed health fetch
 *               passes the token gate while an uncredentialed one is refused.
 *   search      Typing "hello world" in the pill and pressing Enter (at the
 *               parent) loads the default engine's results page: the served
 *               engine records one GET on its search path whose q parameter
 *               is the typed words, and a state push for that tab carries
 *               that path. Chrome's resolveTypedAddress replies kind search
 *               naming the engine, and resolves example.com to a visit of
 *               https://example.com/ (reply only, nothing loads).
 *   refused     javascript:, file:, chrome: and about: text typed and
 *               committed shows the commit-failure row, chrome replies kind
 *               refused, and no state push for the tab carries that scheme.
 *               Scored only after search passed in the same session (its
 *               pushes prove the recorder sees this tab's navigations).
 *   no-engine   Chrome refuses an engine name outside the bar's set (kind
 *               no-engine); with the client stubbed to reply no-engine, Enter
 *               on typed words shows one row naming the configured
 *               application name and "can't search right now", and the served
 *               engine sees no GET. Scored only after search passed.
 *   dev-addresses  BAR-02: chrome resolves localhost, localhost:4000,
 *               devbox:3000, 192.168.1.10:8080 and [::1]:8080 to http visits
 *               of exactly that host and port, example.com to
 *               https://example.com/ and a single word to a search on the
 *               served engine; then 127.0.0.1:<served port>/dev typed in the
 *               pill and Enter loads /dev in the session's web tab (a GET and a
 *               state push). Scored only after search passed.
 *   default-engine  BAR-04: the placeholder and aria-label name Gecko's
 *               default (Probe Engine One); the Default Search Engine setting's
 *               options hold "", One and Two; setting it to Probe Engine Two
 *               renames the placeholder with no reload and Enter on hello
 *               searches /two/search; a name outside the set ("No Such Engine")
 *               is ignored: the placeholder names One and Enter searches
 *               /one/search. The setting is reset to "" afterwards.
 *   rows        BAR-11: with a history visit (and a cached data: favicon), a
 *               bookmark and an open web tab seeded chrome-side, typing "Row"
 *               shows the heuristic row first and highlighted ("Search with
 *               Probe Engine One"), then the history, bookmark and open-tab
 *               rows once each with their type markers; the history row's icon
 *               is a data:image/ <img> and no <img> in the dropdown has any
 *               other src; at most 10 rows, each 32px tall, under a max-height
 *               of at most 432px; the input is a combobox naming the dropdown.
 *               ArrowDown moves aria-activedescendant to the second row, a
 *               reply arriving after that does not move it, and clearing the
 *               text closes the dropdown.
 *   failure-rows  BAR-14: with the client's resolveTypedAddress stubbed to
 *               reject, typing "Row" shows a first row, highlighted, that starts
 *               with the configured application name ("The browser" when
 *               empty) and says it couldn't load suggestions; with the stub
 *               restored, Enter on that row searches /one/search for "Row".
 *   suggestions BAR-03: positive control first -- typing "hel" sends a GET on
 *               /one/suggest with q "hel" and shows "hel alpha" and "hel beta"
 *               below the heuristic row, captioned "Search with Probe Engine
 *               One". Then 127.0.0.1:<port>/x and localhost:4000 send no
 *               suggest GET, and chrome's fence answers the page realm's
 *               searchSuggestions('localhost:4000') with [] and no GET. A
 *               failing endpoint ("fail", a 500) leaves only the heuristic row
 *               with no error row. With browser.searchSuggestions off, "world"
 *               sends no suggest GET and still shows the heuristic row. Enter on
 *               "hel alpha" searches /one/search for "hel alpha".
 *   one-off     BAR-05: typing "hello" shows the strip "This time, search
 *               with:" with one button per engine chrome lists except Probe
 *               Engine One (the one in use), in chrome's order, among them
 *               "Search with Probe Engine Two"; hovering that one shows one HoverService tooltip reading
 *               "Probe Engine Two"; clicking it searches /two/search in the
 *               current tab, and Gecko's default is still Probe Engine One and
 *               the setting still ""; ArrowDown onto the button and Enter
 *               searches /two/search again; a middle-click opens /two/search in
 *               a new background tab while the session tab stays current. When
 *               that middle-click's resolve replies no-engine once, the
 *               no-search row shows and Enter opens /two/search in a new tab
 *               (the retry repeats the one-off). With
 *               every engine but Probe Engine One hidden chrome-side, no strip
 *               shows.
 *   switch-to-tab  BAR-06: with web tabs on localhost /sw-a ("Switch Alpha",
 *               its loaded push the positive control) and /sw-b, and B current,
 *               typing "Switch Alpha" shows A's open-tab row with the
 *               codicon-browser marker and "Switch to Tab"; a click on it, and
 *               then ArrowDown to it and Enter, each make A the current tab with
 *               chrome's focus in A's overlay and the pill showing A's address,
 *               with no state push with loading: true for A or B and no new GET
 *               on /sw-a.
 *   new-tab-targets  BAR-08: from the session tab, Alt+Enter (at the parent)
 *               on "localhost:<port>/nt-fg" opens a new tab on /nt-fg directly
 *               after it, current, joined to the active group (the join call is
 *               recorded), with chrome's focus in its overlay. With /nt-fg
 *               current, a Ctrl+mousedown on the heuristic row for /nt-bg, and a
 *               middle-button mousedown on a seeded /nt-mid history row, each
 *               open a new tab directly after it, joined, while /nt-fg stays
 *               current, the dropdown closes and the pill shows /nt-fg's address;
 *               a Ctrl+mousedown on /nt-fg's own open-tab row opens a second tab
 *               on /nt-fg instead of switching.
 *   autofill    BAR-07: with a visit to localhost:<port>/af seeded chrome-side
 *               and its moz_origins frecency forced and then read back above 0
 *               on the read-only Places connection (else a broken instrument),
 *               and a tab on /af current, typing "loc" key by key at the parent
 *               completes the pill to "localhost:<port>/" with the completed
 *               part selected and the heuristic row a "Visit" of
 *               http://localhost:<port>/; Tab collapses the selection with
 *               focus and the dropdown kept; Enter loads / in that tab (a GET
 *               and a push). Typing "loc" again then Backspace leaves "loc"
 *               with no completion; typing "a" completes again; "loc" set by a
 *               paste-shaped input event is not completed.
 *   canonize-drop  Ctrl+Enter and drops on the pill (BAR-13). Canonize half:
 *               the page realm's resolveTypedAddress('example', '', true)
 *               replies a visit of https://www.example.com/ and with canonize
 *               false a search. With the widget's openCommittedUrl wrapped to
 *               record its argument and load nothing (no public host is ever
 *               loaded), Ctrl+Enter (at the parent) on "example" commits
 *               https://www.example.com/ and on "example.org" (not a bare
 *               name, so plain Enter) https://example.org/. Drop half, each
 *               drag synthesised on the pill as nav-keys-live does on New
 *               Tab: a text/uri-list drag of <served>/dropped shows the ring
 *               with dropEffect copy, and dropping it loads /dropped in the
 *               session tab (a GET and a push) while the pill, sampled every
 *               frame until that push, never holds the payload; a plain-text
 *               drag gets copy with no ring, and dropping "dropped words" GETs
 *               /one/search with q "dropped words", while the same drag
 *               started on the pill's own text (dragstart on the input) is
 *               left to the field: neither its dragover nor its drop is
 *               prevented and no GET follows; a javascript: uri-list
 *               drag gets no ring and dropEffect none; dropped javascript:
 *               text shows the commit-failure row and loads nothing.
 *   shift-del   BAR-09: with visits to <served>/del-me, /keep-me (also
 *               bookmarked) and /del-fail seeded chrome-side and read back
 *               (the positive control), typing "Me Page" shows the /del-me
 *               history row and the /keep-me bookmark row; ArrowDown to the
 *               history row and Shift+Delete (at the parent) removes the row,
 *               moves the highlight to the row that followed it (else the one
 *               before), and history.fetch for /del-me is null; re-typing shows
 *               no row for it. Shift+Delete on the bookmark row keeps the row and
 *               the page's visits. With the client's removeHistoryEntry stubbed
 *               to reject, Shift+Delete on the /del-fail row keeps it and shows
 *               a notice directly under it starting with the configured
 *               application name.
 *   context-menu  BAR-10: with the client's readClipboardText wrapped to count
 *               calls, a contextmenu on the empty pill opens one .lm-Menu reading
 *               Cut, Copy, Paste, Paste & Go, a separator, Select All, with Cut,
 *               Copy and Select All disabled, Paste and Paste & Go enabled and
 *               no clipboard read; Esc closes it with focus in the pill. With
 *               "cd" selected in "abcdef" every item is enabled. Items are
 *               chosen with trusted keys at the parent (ArrowDown, Enter). With
 *               127.0.0.1:<port>/pasted on the global clipboard (written
 *               chrome-side), Paste & Go reads it once (the positive control),
 *               loads /pasted in the session tab (a GET and a loaded push) and
 *               puts chrome's focus in the page. Paste of "xyz" after "ab" leaves
 *               "abxyz" with the caret at the end and focus in the pill; Copy
 *               and Cut of "cd" put "cd" on the clipboard (Cut leaves "abef").
 *               Paste & Go on an empty clipboard reads it and loads nothing; with
 *               the read stubbed to reject it shows a row starting with the
 *               configured application name. The user's clipboard text is put
 *               back afterwards.
 *   select-ime  BAR-11: with the session tab's page focused, a trusted click
 *               (BiDi pointer input on the Theia frame) on the pill focuses it
 *               and selects the whole address; a second click leaves a
 *               collapsed caret; from the page again, a press at the input's
 *               start dragged to the middle selects 0 to the middle. Then, with
 *               the pill cleared, a composition of "かな" begun and flushed
 *               through nsITextInputProcessor at the parent: Enter while it is
 *               open gives no loading push, no GET on /one/search and none on
 *               /one/suggest in 1500 ms; committing it runs exactly one suggest
 *               query for "かな" (the positive control that the log sees
 *               queries); Enter then GETs /one/search with q "かな" and the tab
 *               pushes it (the control for the push check). Scored only after
 *               suggestions passed in the same session.
 *   drafts      BAR-12: with web tabs on localhost /dr-a (A) and /dr-b (B),
 *               "draft text" typed in A without Enter: activating B shows B's
 *               address; activating A shows the draft with the caret at its
 *               end, no dropdown and the pill not focused. A's own script
 *               navigating to /dr-a2 keeps the draft after A's loaded push.
 *               Enter commits it as a search (openCommittedUrl wrapped to
 *               record, nothing loads), and switching away and back shows
 *               A's address. Text typed in B then Esc twice (close, restore)
 *               leaves no draft. A tab C with "gone" typed is closed, and the
 *               pill shows the next current tab's own address.
 *
 *   modes-dropdown  SMODE-01: the mode button is the pill's first child after the identity box; a
 *               trusted click on it opens .pb-address-modes, whose heading is
 *               "This time, search with:" and whose items read, in order, the
 *               AddressBar's contributed top modes, chrome's engines from
 *               listSearchEngines, its contributed local modes, then the
 *               Search Settings item (codicon-settings-gear) -- derived at
 *               check time. Picking Probe Engine Two shows its chip and the
 *               placeholder "Search with Probe Engine Two"; Enter on "hello"
 *               GETs /two/search with q "hello" and nothing on /one/search.
 *               Scored only after search passed (its GET proves the log sees
 *               /one/search).
 *   mode-chip   SMODE-03: in Browsing the Address form has no chip, label or
 *               x; Probe Engine Two's mode shows a chip with its label and an
 *               x; a trusted click on the x with "hello" typed returns to the
 *               Address form with "hello" kept, and the re-run query shows the
 *               heuristic row "Search with Probe Engine One". In the menu, the
 *               probe engines' shared first letter, pressed once per item that
 *               starts with it up to Probe Engine Two (at least twice), then
 *               Enter, picks Probe Engine Two. Search Settings makes Settings current,
 *               searching the preference DEFAULT_SEARCH_ENGINE_PREFERENCE
 *               names (read from chrome-bar-preferences.ts), and closes the
 *               menu.
 *   mode-lifetime  D-15: with Probe Engine Two's mode picked each time, the
 *               mode equals the instance's defaultMode() after Enter commits
 *               "hello" (a GET on /two/search), after the second Esc (the
 *               address restored), after activating a second web tab, after
 *               the Organising toggle segment, and after Browsing again.
 *   local-modes  SMODE-01: Tabs lists every other open web tab on focus,
 *               most recently used first, never the current one, with no
 *               row highlighted; no-match text shows "No matching tabs." and
 *               the trailing search row, highlighted, which searches
 *               /one/search only when chosen; "Alpha" filters to the
 *               scenario's /sw-a, and Enter switches to that very tab with no
 *               loading push. Bookmarks and History: with two bookmarks
 *               and two visits seeded chrome-side (one visit to a page that
 *               is not bookmarked), each lists its own source newest first on
 *               focus, typing narrows it, and Shift+Delete removes the
 *               history-only row in History. Actions: with a fresh tab
 *               current, it lists exactly the visible, enabled commands of
 *               the derived category (New Tab, not the disabled Back and
 *               Forward: the one-page tab reports canGoBack false, WR-05),
 *               and Enter on "new" opens a new tab. Scored only after search
 *               passed.
 *   mode-defaults  SMODE-02, D-14: the mode table is imported under Node's
 *               type stripping, so no default is typed here. For each row of
 *               DEFAULT_MODE_BY_UI_MODE, a trusted click on that PowerBrowser
 *               mode's toggle segment leaves the instance in that row's mode:
 *               Coding shows the Command centre chip with no x and the
 *               empty-prefix provider's placeholder, Browsing the Address form
 *               with no chip, Organising the Tabs chip, an empty pill and the
 *               Tabs placeholder (read from chrome-bar-copy.ts). In Browsing,
 *               History picked with an empty pill opens its zero-query list
 *               (the positive), and Backspace at the start returns to the
 *               default with that list closed (WR-03). In Coding a
 *               localhost web tab made current keeps Command centre (D-16).
 *               Tabs picked from the menu, the text cleared, Backspace at the
 *               parent returns to Command centre; "ab" then Backspace leaves
 *               "a" in Command centre. A custom mode saved through
 *               ModeService.saveCurrentAsMode (its name prompt answered)
 *               starts in defaultModeFor's fallback. Scored only after search
 *               passed.
 *   mode-tokens  SMODE-04: with the alias @two set chrome-side on Probe
 *               Engine Two and read back through the pill's engine list,
 *               each typed from Address mode with an empty pill: "* " enters
 *               Bookmarks with empty text, "% al" Tabs with "al", "^ "
 *               History, "> " Actions, "? x" the default engine's mode with
 *               "x", and "*x" stays Address with "*x". "@two hello" shows the
 *               Probe Engine Two chip with "hello", and Enter GETs /two/search
 *               with q "hello". "@" alone lists a row "@two" captioned Probe
 *               Engine Two; choosing it enters that mode with empty text. In
 *               Command centre "> " stays as text and lists command rows, and
 *               "% " enters Tabs. The alias is removed afterwards. Scored
 *               only after search passed.
 *   command-centre  SMODE-05: with a temp workspace opened once per session
 *               (README.md, src/main.py, .theia/launch.json; the Theia frame
 *               reloaded on its location.hash, then ready and opened awaited)
 *               and Command centre picked from the menu, "view exp" shows an
 *               Explorer row under the pill, and Enter on it opens the left
 *               panel (collapsed first) with no centred quick input showing;
 *               "READ" shows a group header and a README.md row (the
 *               positive control that file search reaches the workspace), and
 *               Enter on it makes an editor on README.md the shell's current
 *               widget. For every prefix the page realm's registry lists
 *               (derived now), the prefix typed with a sample filter (READ for
 *               the default provider, toggle after >) renders the provider's
 *               own getPicks rows and group headers in order, labels compared
 *               after LabelParser; debug lists the fixture's launch
 *               configuration. Choosing the > help row after ? puts > in the
 *               pill and lists commands with no centred quick input; the #
 *               pick without execute is a message row ArrowDown skips; the
 *               zero-query list equals the empty-text picks and the
 *               placeholder equals the default provider's, read now; Enter on
 *               the bottom-panel toggle command toggles it and leaves focus
 *               off the pill. Scored only after search passed.
 *   command-centre-handoff  D-22, D-23: in Command centre, @ and then :12
 *               (no Theia descriptor) each open the centred quick input
 *               holding that text while the pill keeps it, and Esc closes it.
 *               Scored only after command-centre passed.
 *   command-centre-privacy  D-26: with the page realm's
 *               ChromeStoreClient.request wrapped to record each request's
 *               kind, typing "hello" in Address mode records a
 *               resolveTypedAddress and the served engine sees a suggest GET
 *               (the positive controls). Then in every contributed mode whose
 *               modeSends() row is all false (derived from the instance:
 *               Command centre, Tabs and Actions today), "hello", "README" and
 *               "localhost:4000", each waited past the debounce, record no
 *               resolveTypedAddress, searchSuggestions, autofillOrigin or
 *               searchPlaces request and no GET on either served engine's
 *               search or suggest path. Then, with row choices and address
 *               opens recorded instead of run (a rowless Alt+Enter still runs
 *               the real path), "readme" typed in each of those modes and
 *               Enter, Alt+Enter or Ctrl+Enter pressed inside the debounce
 *               send none of those kinds, reach no engine and open no
 *               address; in Command centre each key must choose the
 *               highlighted README.md pick (the positive). Ctrl+Down out of
 *               Command centre with its list open (the mode must change)
 *               keeps "readme" and sends nothing (IN-03). Scored only after
 *               search passed.
 *   mode-keys   SMODE-04, D-19, D-20, KEY-04: in Browsing with the pill
 *               focused (the fixture workspace open), Ctrl+Down at the parent
 *               steps through cycleOrder -- the table module imported, the
 *               engines from listSearchEngines and the contributed ids from
 *               the instance, all derived now -- once per entry, wrapping to
 *               Address, and Ctrl+Up steps back. Alt+Down opens the modes
 *               menu and Esc closes it with the mode unchanged. In the
 *               README.md editor, with two lines and the cursor on line 2,
 *               Alt+Up swaps the lines (Monaco received the key), Alt+Down
 *               swaps them back, and Ctrl+Down leaves the pill's mode
 *               unchanged. Scored only after search passed.
 *   go-to       SMODE-06 (D-29..D-31): on its own localhost tab in the
 *               fixture workspace, Command centre gives localhost:<port>/dev a
 *               first, highlighted "Go to" row and Enter loads /dev (a GET and
 *               a state push); README.md lists the file first, highlighted,
 *               then an unhighlighted Go-to row; "hello" gets no Go-to row.
 *               With chrome's resolve stubbed to reply a search, Enter on the
 *               Go-to row for localhost:<port>/x shows the commit-failure row
 *               and the served engine sees no GET on /one/search (visit-only,
 *               30-RESEARCH A4). Scored only after search passed.
 *   address-keys  SMODE-06 (D-28, KEY-04): in Coding with the pill in Command
 *               centre and a localhost tab current, Ctrl+L, Alt+D and F6
 *               pressed in the page each focus the pill in Address mode with
 *               the tab's address selected (Esc twice returns to Command
 *               centre). In the pill, F6 in Command centre switches to Address
 *               and keeps focus, and F6 again focuses the page; Ctrl+L in the
 *               pill enters Address. New Tab makes a new tab current with the
 *               pill focused in Address. In Tabs mode localhost:<port>/sw-a
 *               gets a first, highlighted Go-to row. In the README.md editor
 *               Ctrl+L and Alt+D leave the pill unfocused and its mode
 *               unchanged. Scored only after search passed.
 *
 *   bookmark-star  BMK-01: the star is the pill's last element (24x24, the
 *               outline glyph, the bound-key tooltip); a click bookmarks the
 *               page once in Places (read back chrome-side, the independent
 *               observer) and opens the 320px editor, Name selected; Esc
 *               returns focus to the star, which is filled. A bookmark removed
 *               and then added chrome-side flips the star with no navigation
 *               (the bookmarks-changed push). The filled star shows in Coding,
 *               Browsing and Organising. Ctrl+D with the pill focused and with
 *               the page focused each bookmark the page once and open the
 *               editor. about:blank dims the star, disabled, with the
 *               can't-bookmark tooltip.
 *   bookmark-editor  BMK-02: on a seeded bookmark the star opens the editor
 *               directly (Edit bookmark, the title selected, three folders);
 *               Esc after typing saves nothing; a rename plus a move to the
 *               Bookmarks Menu with Enter lands in Places and the reopened
 *               editor shows that folder; a refused write shows the failure
 *               row naming the application with the typed text kept; Remove
 *               removes at once (no second confirm) and the star unfills.
 *   bookmark-keys  D-15 (KEY ruling): in the fixture workspace, Ctrl+D with
 *               the pill focused (no page-key row fires) and with the page
 *               focused (the bookmarkPage row fires) each bookmark the page
 *               in Places and open the editor; in the README.md editor Ctrl+D
 *               keeps Monaco's meaning (a second selection appears) and opens
 *               no editor and makes no bookmark. Scored only after
 *               bookmark-star passed.
 *   clear-history  BMK-05 (D-09, D-10, T-33-04): for each of the picker's five
 *               ranges, marker rows are planted chrome-side in Places, the
 *               tabs.sqlite closed rows and thumbnails, saved_pages and the
 *               web-tab history file, in range and out of range. The picker
 *               opens from the History submenu row, Ctrl+Shift+Del (pill and
 *               page focused) and the command, with the contracted heading,
 *               ranges (Last hour checked), footnote and buttons; Clear or
 *               Enter clears exactly the in-range rows of every store, keeps
 *               the out-of-range rows and every open row, and the token
 *               cookie stays in the jar with the frame still signed in (the
 *               positive control the clear-the-token fault must break). Esc
 *               closes with nothing cleared; a refused clear shows the failure
 *               row and Enter retries. The History submenu and the pill's
 *               history rows stop listing a cleared page.
 *
 * Needs the built browser and the last Theia app build; not a --quick check.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    appNameExpr,
    BROKEN,
    chromeActiveTabId,
    focusOverlay,
    focusTheiaFrame,
    inChrome,
    firedRows,
    installFireRecorder,
    installPushRecorder,
    loadedAt,
    makeCurrent,
    openWebTab,
    overlayVisibility,
    pressKey,
    pushes,
    readPill,
    serveNavPages,
    setPref,
    waitForPush,
    WEB_TAB_STATE_EVENT,
    withProbeShell,
} from './lib/pb-live-probe.mjs';
import { GET_BY_NAME, pollFor, probe, sourceConst, sourceMatch } from './lib/pb-relaunch.mjs';

const NAME = 'verify-address-bar-live';
const ENTER = { key: 'Enter', code: 'Enter', keyCode: 13 };
const ENGINE_ONE = 'Probe Engine One';
const ENGINE_TWO = 'Probe Engine Two';
const ENGINE_PREF = 'browser.defaultSearchEngine';

const TOKEN_COOKIE = 'POWERBROWSER_TOKEN';
const PROBE_COOKIE = 'pbprobe=1';
const API_URL = 'chrome://powerbrowser/content/PowerBrowserAPI.sys.mjs';

// The overlay page starts a dedicated worker from a Blob; the page builds the
// worker's absolute URL, since a blob worker has no base path of its own.
const COOKIE_PAGE_BODY = `<img src="/pixel"><script>
    const src = 'fetch(' + JSON.stringify(location.origin + '/cookie-worker') + ', { credentials: "include" });';
    new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
</script>`;

// A page that is slow to leave (60 ms of work on pagehide, as a beacon would do) holds its
// content process while the next page's browsing context is set up, which widens the moment
// the overlay reports the switch's about:blank placeholder past a refresh tick.
const SLOW_PAGEHIDE_BODY = `<p>focus</p><script>
    addEventListener('pagehide', () => { const end = Date.now() + 60; while (Date.now() < end) { /* busy */ } });
</script>`;

/** An engine suggest endpoint: two completions of q, or a 500 (undefined) for q "fail". */
const suggestPage = { json: params => {
    const q = params.get('q') ?? '';
    return q === 'fail' ? undefined : [q, [`${q} alpha`, `${q} beta`]];
} };

const PAGES = {
    '/one/suggest': suggestPage,
    '/two/suggest': suggestPage,
    '/start': { title: 'Address Start', body: '<p>start</p>' },
    '/one/search': { title: 'Probe One Results', body: '<p>results</p>' },
    '/two/search': { title: 'Probe Two Results', body: '<p>results</p>' },
    '/dev': { title: 'Dev Page', body: '<p>dev</p>' },
    '/cookie-stock': { title: 'Cookie Stock', body: '<p>stock</p>' },
    '/cookie-page': { title: 'Cookie Page', body: COOKIE_PAGE_BODY },
    '/pixel': { title: 'Pixel', body: '' },
    '/cookie-worker': { title: 'Cookie Worker', body: '' },
    '/r-hist': { title: 'Row History Page', body: '<p>history</p>' },
    '/r-book': { title: 'Row Bookmark Page', body: '<p>bookmark</p>' },
    '/r-tab': { title: 'Row Tab Page', body: '<p>tab</p>' },
    '/sw-a': { title: 'Switch Alpha', body: '<p>alpha</p>' },
    '/sw-b': { title: 'Switch Beta', body: '<p>beta</p>' },
    '/nt-fg': { title: 'Target Foreground', body: '<p>foreground</p>' },
    '/nt-bg': { title: 'Target Background', body: '<p>background</p>' },
    '/nt-mid': { title: 'Middle Page', body: '<p>middle</p>' },
    '/': { title: 'Served Root', body: '<p>root</p>' },
    '/af': { title: 'Autofill Page', body: '<p>autofill</p>' },
    '/dropped': { title: 'Dropped Page', body: '<p>dropped</p>' },
    '/del-me': { title: 'Delete Me Page', body: '<p>delete</p>' },
    '/keep-me': { title: 'Keep Me Page', body: '<p>keep</p>' },
    '/del-fail': { title: 'Fail Me Page', body: '<p>fail</p>' },
    '/pasted': { title: 'Pasted Page', body: '<p>pasted</p>' },
    '/pf-1': { title: 'Focus One', body: SLOW_PAGEHIDE_BODY },
    '/pf-2': { title: 'Focus Two', body: SLOW_PAGEHIDE_BODY },
    '/pf-3': { title: 'Focus Three', body: SLOW_PAGEHIDE_BODY },
    '/pf-4': { title: 'Focus Four', body: SLOW_PAGEHIDE_BODY },
    '/dr-a': { title: 'Draft Alpha', body: '<p>alpha</p>' },
    '/dr-a2': { title: 'Draft Alpha Two', body: '<p>alpha two</p>' },
    '/dr-b': { title: 'Draft Beta', body: '<p>beta</p>' },
    '/dr-c': { title: 'Draft Gamma', body: '<p>gamma</p>' },
    '/lt-b': { title: 'Lifetime Beta', body: '<p>beta</p>' },
    '/lm-act': { title: 'Local Actions', body: '<p>actions</p>' },
    '/md-web': { title: 'Mode Defaults Web', body: '<p>web</p>' },
    '/bm-a': { title: 'Bookmark Alpha', body: '<p>alpha</p>' },
    '/bm-b': { title: 'Bookmark Beta', body: '<p>beta</p>' },
    '/bm-keys': { title: 'Bookmark Keys', body: '<p>keys</p>' },
    // Phase 33 plan 03: the toolbar, reopen and History submenu pages.
    '/tb-a': { title: 'Toolbar Alpha', body: '<p>alpha</p>' },
    '/tb-b': { title: 'Toolbar Beta', body: '<p>beta</p>' },
    '/tb-c': { title: 'Toolbar Gamma', body: '<p>gamma</p>' },
    '/rc-a': { title: 'Reopen Alpha', body: '<p>alpha</p>' },
    '/rc-b': { title: 'Reopen Beta', body: '<p>beta</p>' },
    '/rc-c': { title: 'Reopen Gamma', body: '<p>gamma</p>' },
    '/hm-b': { title: 'History Back Page', body: '<p>back</p>' },
    ...Object.fromEntries(Array.from({ length: 11 }, (_, i) => [`/hm-c${i + 1}`, { title: `Closed Page ${i + 1}`, body: '<p>closed</p>' }])),
};

const SESSION_ENGINE = 'harness: the hermetic search engine could not be installed';

/** Adds the two served engines chrome-side and makes One the default; throws `harness:` on any failure. */
async function installEngine(app, pages) {
    const reply = await inChrome(app, `return (async () => {
        try {
            const { SearchService } = ChromeUtils.importESModule('moz-src:///toolkit/components/search/SearchService.sys.mjs');
            await SearchService.init();
            const engine = SearchService.getEngineByName(${JSON.stringify(ENGINE_ONE)})
                ?? await SearchService.addUserEngine({
                    name: ${JSON.stringify(ENGINE_ONE)},
                    url: ${JSON.stringify(`${pages.origin}/one/search?q={searchTerms}`)},
                    suggestUrl: ${JSON.stringify(`${pages.origin}/one/suggest?q={searchTerms}`)},
                });
            SearchService.getEngineByName(${JSON.stringify(ENGINE_TWO)})
                ?? await SearchService.addUserEngine({
                    name: ${JSON.stringify(ENGINE_TWO)},
                    url: ${JSON.stringify(`${pages.origin}/two/search?q={searchTerms}`)},
                    suggestUrl: ${JSON.stringify(`${pages.origin}/two/suggest?q={searchTerms}`)},
                });
            await SearchService.setDefault(engine, SearchService.CHANGE_REASON.USER);
            return (await SearchService.getDefault()).name;
        } catch (e) {
            return 'error: ' + e;
        }
    })();`);
    if (reply !== ENGINE_ONE) {
        throw new Error(`${SESSION_ENGINE} (${String(reply)})`);
    }
}

/** The page realm's ChromeStoreClient.resolveTypedAddress reply, or `{ error }`. */
const resolveIn = (app, text, engineName = '') => probe(app,
    `return await get('ChromeStoreClient').resolveTypedAddress(${JSON.stringify(text)}, ${JSON.stringify(engineName)});`);

/** Replaces the frontend's ChromeStoreClient.resolveTypedAddress with one resolving `reply`; `null` restores it. */
const stubResolve = (app, reply) => probe(app, reply === null
    ? `delete get('ChromeStoreClient').resolveTypedAddress; return true;`
    : `get('ChromeStoreClient').resolveTypedAddress = async () => (${JSON.stringify(reply)}); return true;`);

/**
 * Focuses the pill and types `text` the React-compatible way (native value
 * setter, then an input event). React restores the controlled value until the
 * widget re-renders, so the typed value is read back by polling.
 */
async function typeInPill(app, text, { focused = true, value = text } = {}) {
    if (await focusTheiaFrame(app) !== true) {
        throw new Error(`${BROKEN} the Theia frame could not be made chrome's active element`);
    }
    const typed = await app.evaluate(`(() => {
        const input = document.querySelector('.pb-chrome-bar-input');
        if (!input) return false;
        input.focus();
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(text)});
        input.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
    })()`);
    // `focused: false`: the text may hand focus elsewhere (Command centre's hand-off to Theia's quick input).
    // `value`: what the pill holds afterwards when that differs from the text (a mode token is consumed).
    const pill = typed === true ? await settle(() => readPill(app), v => (!focused || v.focused) && v.value === value) : null;
    if (!pill || (focused && !pill.focused) || pill.value !== value) {
        throw new Error(`${BROKEN} the pill could not be focused and typed into (${JSON.stringify(pill)})`);
    }
}

/** Re-reads `read()` until `ok` holds or `timeoutMs` passes; returns the last value. */
async function settle(read, ok, timeoutMs = 5000) {
    const end = Date.now() + timeoutMs;
    let value = await read();
    while (!ok(value) && Date.now() < end) {
        await new Promise(resolve => setTimeout(resolve, 100));
        value = await read();
    }
    return value;
}

/** The first GET on `path` at index >= `from` matching `pred`, or null after `timeoutMs`. */
async function nextGet(pages, path, from, pred = () => true, timeoutMs = 15000) {
    try {
        return await pollFor(() => pages.requests.slice(from).find(r => r.path === path && pred(r)) ?? null, timeoutMs, `a GET on ${path}`);
    } catch {
        return null;
    }
}

const queryOf = r => new URLSearchParams(r.search ?? '').get('q');
const pathOf = url => { try { return new URL(url).pathname; } catch { return ''; } };

/** The session's web tab on /start, opened once and made current. */
async function sessionTab(ctx) {
    if (!ctx.shared.tabId) {
        const tabId = await openWebTab(ctx.app, ctx.pages.url('/start'));
        if (await waitForPush(ctx.app, loadedAt(tabId, '/start')) < 0) {
            throw new Error(`${BROKEN} no loaded state push arrived for /start`);
        }
        ctx.shared.tabId = tabId;
    }
    if (await makeCurrent(ctx.app, ctx.shared.tabId) !== true) {
        throw new Error(`${BROKEN} the session's web tab could not be made current`);
    }
    return ctx.shared.tabId;
}

async function search(ctx) {
    const { app, pages, plant, fail, note } = ctx;
    const tabId = await sessionTab(ctx);
    if (plant === 'resolve-bypassed') {
        await stubResolve(app, { kind: 'refused' });
        note('PLANT resolve-bypassed applied');
    }
    const mark = (await pushes(app)).length;
    const getMark = pages.requests.length;
    await typeInPill(app, 'hello world');
    await pressKey(app, ENTER);
    const got = await nextGet(pages, '/one/search', getMark, r => queryOf(r) === 'hello world');
    if (!got) {
        fail(`no GET on /one/search with q "hello world" after Enter; requests since the mark: ${JSON.stringify(pages.requests.slice(getMark).map(r => r.path + r.search))}; pill ${JSON.stringify(await readPill(app))}`);
    }
    if (await waitForPush(app, p => p && p.kind === 'state' && p.tabId === tabId && pathOf(p.url) === '/one/search', { from: mark, timeoutMs: got ? 15000 : 1000 }) < 0) {
        fail('no state push for the tab carried the engine results URL (/one/search)');
    }
    const words = await resolveIn(app, 'hello world');
    if (words?.kind !== 'search' || words.engineName !== ENGINE_ONE || !String(words.url).startsWith(`${pages.origin}/one/search`)) {
        fail(`resolveTypedAddress('hello world') must reply kind search from ${JSON.stringify(ENGINE_ONE)} on the served origin; got ${JSON.stringify(words)}`);
    }
    const host = await resolveIn(app, 'example.com');
    if (host?.kind !== 'visit' || host.url !== 'https://example.com/') {
        fail(`resolveTypedAddress('example.com') must reply a visit of https://example.com/; got ${JSON.stringify(host)}`);
    }
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// The four loads to the served (non-sidecar) loopback port, in report order.
const COOKIE_LOADS = [
    ['stock-window', '/cookie-stock'],
    ['overlay', '/cookie-page'],
    ['subresource', '/pixel'],
    ['worker', '/cookie-worker'],
];

/** Chrome scope: true when the cookie store holds `name` for 127.0.0.1. */
const storeHolds = (app, name) => inChrome(app,
    `return Services.cookies.getCookiesFromHost('127.0.0.1', {}).some(c => c.name === ${JSON.stringify(name)});`);

/** The Theia frame's health fetch status with `credentials`, or -1 on a network error. */
const healthStatus = (app, credentials) => app.evaluate(
    `fetch(location.origin + '/powerbrowser/health', { credentials: ${JSON.stringify(credentials)} }).then(r => r.status, () => -1)`);

async function tokenCookie(ctx) {
    const { app, pages, plant, fail, note, passNote, results } = ctx;
    const firstScenario = results.length === 0 && !ctx.shared.tabId
        && await inChrome(app, `return ![...document.querySelectorAll('browser')].some(b => W.tabIdOfBrowser(b) !== null);`) === true;
    const added = await inChrome(app, `try {
        const v = Services.cookies.add('127.0.0.1', '/', 'pbprobe', '1', false, false, true, Date.now() + 86400000, {},
            Ci.nsICookie.SAMESITE_LAX, Ci.nsICookie.SCHEME_HTTP, false);
        return !v || v.result === Ci.nsICookieValidation.eOK;
    } catch (e) { return String(e); }`);
    if (added !== true) {
        return fail(`${BROKEN} the probe cookie could not be added for 127.0.0.1 (${String(added)})`);
    }
    if (plant === 'token-strip-off') {
        const removed = await inChrome(app, `const T = ChromeUtils.importESModule(${JSON.stringify(API_URL)}).PowerBrowserTokenCookie;
            Services.obs.removeObserver(T.observer, T.topic); return true;`);
        if (removed === true) {
            note('PLANT token-strip-off applied');
        }
    }
    const mark = pages.requests.length;
    // (a) The GUI-01 stock window, before this scenario opens any web tab.
    const opened = await app.evaluate(`(() => {
        try { window.__pbCookieWindow = window.open(${JSON.stringify(pages.url('/cookie-stock'))}, '_blank'); return !!window.__pbCookieWindow; }
        catch (e) { return String(e); }
    })()`);
    try {
        if (opened !== true) {
            return fail(`${BROKEN} window.open from the Theia frame returned no window (${String(opened)})`);
        }
        await nextGet(pages, '/cookie-stock', mark);
    } finally {
        await app.evaluate(`(() => { try { window.__pbCookieWindow && window.__pbCookieWindow.close(); } catch (e) {} return true; })()`);
    }
    // (b) The overlay page and its subresource; (c) the worker it starts.
    const tabId = await openWebTab(app, pages.url('/cookie-page'));
    if (await waitForPush(app, loadedAt(tabId, '/cookie-page')) < 0) {
        fail(`${BROKEN} no loaded state push arrived for /cookie-page`);
    }
    await nextGet(pages, '/pixel', mark);
    await nextGet(pages, '/cookie-worker', mark, () => true, 10000);
    let sidecarCarried = false;
    // (d) A web tab on the sidecar's own origin is an overlay, so it loses the
    // token even on that port; the Theia frame's credentialed 200 below is the control.
    const sidecarHealth = `${await app.evaluate('location.origin')}/powerbrowser/health?pb-overlay`;
    const watching = await inChrome(app, `window.__pbSidecarSeen = [];
        window.__pbSidecarObs = { observe(s) {
            const c = s.QueryInterface(Ci.nsIHttpChannel);
            if (c.URI.spec !== ${JSON.stringify(sidecarHealth)}) return;
            let cookie = '';
            try { cookie = c.getRequestHeader('Cookie'); } catch (e) {}
            window.__pbSidecarSeen.push({ status: c.responseStatus, token: cookie.split(';').some(e => e.trim().startsWith(${JSON.stringify(`${TOKEN_COOKIE}=`)})) });
        } };
        Services.obs.addObserver(window.__pbSidecarObs, 'http-on-examine-response');
        return true;`);
    if (watching !== true) {
        fail(`${BROKEN} the sidecar-overlay response observer could not be added (${String(watching)})`);
    } else {
        let sidecarTab = null;
        try {
            sidecarTab = await openWebTab(app, sidecarHealth);
            const sidecarSeen = await settle(() => inChrome(app, 'return JSON.stringify(window.__pbSidecarSeen);').then(JSON.parse), v => v.length > 0, 10000);
            if (!sidecarSeen.length) {
                fail(`${BROKEN} no response for the sidecar-overlay load of ${sidecarHealth} was observed within 10 s`);
            } else if (sidecarSeen[0].token) {
                sidecarCarried = true;
            } else if (sidecarSeen[0].status === 200) {
                fail(`the sidecar-overlay load carried no ${TOKEN_COOKIE} yet the token gate answered 200, so the gate let an overlay in without the token`);
            }
        } finally {
            await inChrome(app, 'Services.obs.removeObserver(window.__pbSidecarObs, "http-on-examine-response"); return true;');
            // Left open, its open-tab row would take a later scenario's place-row slot.
            if (sidecarTab) {
                await probe(app, `get('WebTabChannel').widgetOf(${JSON.stringify(sidecarTab)}).close(); return true;`);
            }
        }
    }
    const seen = pages.requests.slice(mark);
    const carried = [];
    for (const [label, path] of COOKIE_LOADS) {
        const request = seen.find(r => r.path === path);
        if (!request) {
            fail(`${BROKEN} no GET on ${path} (${label}) reached the served port${label === 'worker' ? ' within 10 s: the worker never ran' : ''}`);
            continue;
        }
        const cookies = String(request.cookie ?? '').split(';').map(c => c.trim());
        if (!cookies.includes(PROBE_COOKIE)) {
            fail(`${BROKEN} the ${label} request (${path}) did not carry ${PROBE_COOKIE}, so the request log cannot see its cookies`);
        }
        if (cookies.some(c => c.startsWith(`${TOKEN_COOKIE}=`))) {
            carried.push(label);
        }
    }
    // Reported last, so the four served-port labels keep their order.
    if (sidecarCarried) {
        carried.push('sidecar-overlay');
    }
    if (carried.length) {
        fail(`carried ${TOKEN_COOKIE}: ${carried.join(', ')}`);
    }
    if (await storeHolds(app, TOKEN_COOKIE) !== true) {
        fail(`the cookie store no longer holds ${TOKEN_COOKIE} for 127.0.0.1 (the strip must edit headers, never the store)`);
    }
    const withToken = await healthStatus(app, 'include');
    if (withToken !== 200) {
        fail(`the Theia frame's credentialed fetch of its own health route returned ${withToken}, not 200 (the strip took the token from the Theia frame)`);
    }
    const without = await healthStatus(app, 'omit');
    if (without === 200) {
        fail(`${BROKEN} the uncredentialed health fetch also returned 200, so the token gate is off and the credentialed fetch proves nothing`);
    }
    if (firstScenario) {
        passNote('stock window before any web tab');
    }
}

/** True when `name`'s positive control passed earlier in this session. */
const controlPassed = (results, name) => {
    const control = results.find(r => r.name === CONTROL_OF[name]);
    return !!control && !control.failures.length && !control.notScored;
};

const REFUSED_TEXTS = [
    ['javascript:alert(1)', 'javascript:'],
    ['file:///etc/hostname', 'file:'],
    ['chrome://browser/content/browser.xhtml', 'chrome:'],
    ['about:config', 'about:'],
];

async function refused(ctx) {
    const { app, fail, results } = ctx;
    if (!controlPassed(results, 'refused')) {
        return 'not-scored';
    }
    const tabId = await sessionTab(ctx);
    for (const [text, scheme] of REFUSED_TEXTS) {
        const mark = (await pushes(app)).length;
        await typeInPill(app, text);
        await pressKey(app, ENTER);
        const pill = await settle(() => readPill(app), v => v.rows.length === 1 && v.rows[0].includes("couldn't open that address"));
        if (pill.rows.length !== 1 || !pill.rows[0].includes("couldn't open that address")) {
            fail(`${text}: Enter must show the one commit-failure row; saw ${JSON.stringify(pill)}`);
        }
        await sleep(1500);
        const loaded = (await pushes(app)).slice(mark).filter(p => p && p.kind === 'state' && p.tabId === tabId && String(p.url).toLowerCase().startsWith(scheme));
        if (loaded.length) {
            fail(`${text}: the tab navigated to ${JSON.stringify(loaded[0].url)}`);
        }
        const reply = await resolveIn(app, text);
        if (reply?.kind !== 'refused') {
            fail(`${text}: resolveTypedAddress must reply kind refused; got ${JSON.stringify(reply)}`);
        }
    }
}

async function noEngine(ctx) {
    const { app, pages, fail, results } = ctx;
    if (!controlPassed(results, 'no-engine')) {
        return 'not-scored';
    }
    const named = await resolveIn(app, 'hello world', 'No Such Engine');
    if (named?.kind !== 'no-engine') {
        fail(`resolveTypedAddress('hello world', 'No Such Engine') must reply kind no-engine; got ${JSON.stringify(named)}`);
    }
    await sessionTab(ctx);
    const subject = (await app.evaluate(appNameExpr)) || 'The browser';
    if (await stubResolve(app, { kind: 'no-engine' }) !== true) {
        return fail(`${BROKEN} the client's resolveTypedAddress could not be stubbed`);
    }
    try {
        const getMark = pages.requests.length;
        await typeInPill(app, 'hello world');
        await pressKey(app, ENTER);
        const pill = await settle(() => readPill(app), v => v.rows.length === 1 && v.rows[0].includes("can't search right now"));
        if (pill.rows.length !== 1 || !pill.rows[0].startsWith(subject) || !pill.rows[0].includes("can't search right now")) {
            fail(`a no-engine reply must show one row starting with ${JSON.stringify(subject)} saying it can't search right now; saw ${JSON.stringify(pill)}`);
        }
        await sleep(1500);
        const searched = pages.requests.slice(getMark).filter(r => r.path === '/one/search');
        if (searched.length) {
            fail(`a no-engine reply loaded the engine anyway: ${JSON.stringify(searched.map(r => r.path + r.search))}`);
        }
    } finally {
        await stubResolve(app, null);
    }
}

// Typed text and the visit URL Gecko's URI fixup must resolve it to.
const DEV_VISITS = [
    ['localhost', 'http://localhost/'],
    ['localhost:4000', 'http://localhost:4000/'],
    ['devbox:3000', 'http://devbox:3000/'],
    ['192.168.1.10:8080', 'http://192.168.1.10:8080/'],
    ['[::1]:8080', 'http://[::1]:8080/'],
    ['example.com', 'https://example.com/'],
];

async function devAddresses(ctx) {
    const { app, pages, fail, results } = ctx;
    if (!controlPassed(results, 'dev-addresses')) {
        return 'not-scored';
    }
    for (const [text, url] of DEV_VISITS) {
        const reply = await resolveIn(app, text);
        if (reply?.kind !== 'visit' || reply.url !== url) {
            fail(`resolveTypedAddress(${JSON.stringify(text)}) must reply a visit of ${url}; got ${JSON.stringify(reply)}`);
        }
    }
    const word = await resolveIn(app, 'hello');
    if (word?.kind !== 'search' || word.engineName !== ENGINE_ONE || !String(word.url).startsWith(`${pages.origin}/one/search`)) {
        fail(`resolveTypedAddress('hello') must reply kind search from ${JSON.stringify(ENGINE_ONE)} on the served origin; got ${JSON.stringify(word)}`);
    }
    const tabId = await sessionTab(ctx);
    const mark = (await pushes(app)).length;
    const getMark = pages.requests.length;
    await typeInPill(app, `${new URL(pages.origin).host}/dev`);
    await pressKey(app, ENTER);
    const got = await nextGet(pages, '/dev', getMark);
    if (!got) {
        fail(`no GET on /dev after Enter on ${new URL(pages.origin).host}/dev; pill ${JSON.stringify(await readPill(app))}`);
    }
    if (await waitForPush(app, loadedAt(tabId, '/dev'), { from: mark, timeoutMs: got ? 15000 : 1000 }) < 0) {
        fail('no loaded state push for the session tab ended /dev');
    }
}

/** The pill input's placeholder and aria-label. */
const readAddressLabel = app => app.evaluate(`JSON.stringify((() => {
    const input = document.querySelector('.pb-chrome-bar-input');
    return input ? { placeholder: input.placeholder, aria: input.getAttribute('aria-label') } : null;
})())`).then(JSON.parse);

const labelFor = engine => `Search with ${engine} or enter address`;
const labelIs = text => v => !!v && v.placeholder === text && v.aria === text;

/** Types `text`, presses Enter, and returns the first GET on `path` with q === text, or null. */
async function searchVia(ctx, text, path) {
    const getMark = ctx.pages.requests.length;
    await typeInPill(ctx.app, text);
    await pressKey(ctx.app, ENTER);
    return nextGet(ctx.pages, path, getMark, r => queryOf(r) === text);
}

async function defaultEngine(ctx) {
    const { app, plant, fail, note } = ctx;
    await sessionTab(ctx);
    // Focus re-reads chrome's engines: the harness added its engines after startup.
    if (await focusTheiaFrame(app) !== true || await app.evaluate(`(() => { const i = document.querySelector('.pb-chrome-bar-input'); if (!i) return false; i.focus(); return true; })()`) !== true) {
        throw new Error(`${BROKEN} the pill could not be focused`);
    }
    const first = await settle(() => readAddressLabel(app), labelIs(labelFor(ENGINE_ONE)));
    if (!labelIs(labelFor(ENGINE_ONE))(first)) {
        fail(`the placeholder and aria-label must read ${JSON.stringify(labelFor(ENGINE_ONE))}; got ${JSON.stringify(first)}`);
    }
    const options = await probe(app, `return get('PreferenceSchemaService').getSchemaProperty(${JSON.stringify(ENGINE_PREF)})?.enum ?? null;`);
    for (const option of ['', ENGINE_ONE, ENGINE_TWO]) {
        if (!Array.isArray(options) || !options.includes(option)) {
            fail(`the ${ENGINE_PREF} setting's options must include ${JSON.stringify(option)}; got ${JSON.stringify(options)}`);
        }
    }
    if (plant === 'engine-name-dropped') {
        const wrapped = await probe(app, `const c = get('ChromeStoreClient');
            const original = Object.getPrototypeOf(c).resolveTypedAddress.bind(c);
            c.resolveTypedAddress = text => original(text, '');
            return true;`);
        if (wrapped === true) {
            note('PLANT engine-name-dropped applied');
        }
    }
    try {
        if (await setPref(app, ENGINE_PREF, ENGINE_TWO) !== true) {
            return fail(`${BROKEN} the ${ENGINE_PREF} setting could not be set`);
        }
        const two = await settle(() => readAddressLabel(app), labelIs(labelFor(ENGINE_TWO)));
        if (!labelIs(labelFor(ENGINE_TWO))(two)) {
            fail(`with the setting on ${ENGINE_TWO} the placeholder must read ${JSON.stringify(labelFor(ENGINE_TWO))} with no reload; got ${JSON.stringify(two)}`);
        }
        if (!await searchVia(ctx, 'hello', '/two/search')) {
            fail(`no GET on /two/search with q "hello" after Enter with the setting on ${ENGINE_TWO}`);
        }
        if (await setPref(app, ENGINE_PREF, 'No Such Engine') !== true) {
            return fail(`${BROKEN} the ${ENGINE_PREF} setting could not be set to an unknown name`);
        }
        const unknown = await settle(() => readAddressLabel(app), labelIs(labelFor(ENGINE_ONE)));
        if (!labelIs(labelFor(ENGINE_ONE))(unknown)) {
            fail(`an unknown engine name must leave the placeholder naming ${ENGINE_ONE}; got ${JSON.stringify(unknown)}`);
        }
        if (!await searchVia(ctx, 'hello', '/one/search')) {
            fail('no GET on /one/search with q "hello" after Enter with an unknown engine name in the setting');
        }
    } finally {
        await setPref(app, ENGINE_PREF, '');
        if (plant === 'engine-name-dropped') {
            await stubResolve(app, null);
        }
    }
}

// A 1x1 PNG, stored as the history row's cached favicon.
const PNG_DATA = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const ARROW_DOWN = { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40 };
const HEURISTIC_CAPTION = `Search with ${ENGINE_ONE}`;
// The seeded rows: path, the caption suffix that names the row, and its type marker.
const SEEDED_ROWS = [
    ['/r-hist', 'codicon-history'],
    ['/r-book', 'codicon-star-full'],
    ['/r-tab', 'codicon-browser'],
];

/** Seeds Places chrome-side: visits to r-hist and r-tab, a bookmark on r-book and a favicon for r-hist. */
const seedRowPlaces = (app, pages) => inChrome(app, `return (async () => {
    try {
        const { PlacesUtils } = ChromeUtils.importESModule('resource://gre/modules/PlacesUtils.sys.mjs');
        const hist = ${JSON.stringify(pages.url('/r-hist'))};
        await PlacesUtils.history.insert({ url: hist, title: 'Row History Page', visits: [{ date: new Date() }] });
        await PlacesUtils.history.insert({ url: ${JSON.stringify(pages.url('/r-tab'))}, title: 'Row Tab Page', visits: [{ date: new Date() }] });
        await PlacesUtils.bookmarks.insert({ parentGuid: PlacesUtils.bookmarks.unfiledGuid, url: ${JSON.stringify(pages.url('/r-book'))}, title: 'Row Bookmark Page' });
        await PlacesUtils.favicons.setFaviconForPage(Services.io.newURI(hist), Services.io.newURI(hist + '/favicon.png'), Services.io.newURI(${JSON.stringify(PNG_DATA)}));
        const icon = await PlacesUtils.favicons.getFaviconForPage(Services.io.newURI(hist), 16);
        return icon && icon.dataURI && icon.dataURI.spec.startsWith('data:image/') ? 'ok' : 'no favicon stored';
    } catch (e) {
        return 'error: ' + e;
    }
})();`);

/** The dropdown as the user sees it: one record per row, the <img> sources, the panel cap and the combobox attributes. */
const readRows = app => app.evaluate(`JSON.stringify((() => {
    const input = document.querySelector('.pb-chrome-bar-input');
    const dd = document.querySelector('.pb-chrome-bar-dropdown');
    const attrs = input ? { role: input.getAttribute('role'), expanded: input.getAttribute('aria-expanded'),
        controls: input.getAttribute('aria-controls'), autocomplete: input.getAttribute('aria-autocomplete'),
        active: input.getAttribute('aria-activedescendant') } : null;
    if (!dd) return { open: false, attrs, rows: [], imgs: [] };
    const rows = [...dd.querySelectorAll('.pb-chrome-bar-row:not(.is-shimmer)')].map(r => {
        const type = r.querySelector('.pb-chrome-bar-row-type');
        const img = r.querySelector('img.pb-chrome-bar-row-icon');
        return {
            id: r.id,
            selected: r.getAttribute('aria-selected') === 'true',
            title: (r.querySelector('.pb-chrome-bar-row-title') || {}).textContent || '',
            caption: (r.querySelector('.pb-chrome-bar-row-caption') || {}).textContent || '',
            type: type ? [...type.classList].find(c => c.startsWith('codicon-') && c !== 'codicon') || null : null,
            switchText: (r.querySelector('.pb-chrome-bar-row-switch') || {}).textContent || '',
            img: img ? img.getAttribute('src') : null,
            height: r.getBoundingClientRect().height,
        };
    });
    return { open: true, id: dd.id, attrs, rows, imgs: [...dd.querySelectorAll('img')].map(i => i.getAttribute('src')),
        maxHeight: getComputedStyle(dd).maxHeight };
})())`).then(JSON.parse);

const rowFor = (view, pages, path) => view.rows.filter(r => r.caption === pages.url(path));

/** Which row is highlighted, as the user sees it: changes with every move of the highlight. */
const highlightOf = v => `${v.attrs?.active ?? ''}|${v.rows.map(r => r.selected ? r.caption : '').join(',')}`;

async function rows(ctx) {
    const { app, pages, plant, fail, note } = ctx;
    const seeded = await seedRowPlaces(app, pages);
    if (seeded !== 'ok') {
        return fail(`${BROKEN} Places could not be seeded (${String(seeded)})`);
    }
    const tabId = await openWebTab(app, pages.url('/r-tab'));
    if (await waitForPush(app, loadedAt(tabId, '/r-tab')) < 0) {
        return fail(`${BROKEN} no loaded state push arrived for /r-tab`);
    }
    if (plant === 'dedupe-off') {
        const planted = await probe(app, `const w = get('AddressBar');
            w.composeVisibleRows = function () {
                const places = this.placeRows;
                return (this.heuristic ? [this.heuristic] : []).concat(places, places.length ? [{ ...places[0], key: places[0].key + '#copy' }] : []);
            };
            return true;`);
        if (planted === true) {
            note('PLANT dedupe-off applied');
        }
    }
    const ready = v => v.open && v.rows[0]?.caption === HEURISTIC_CAPTION
        && SEEDED_ROWS.every(([path, type]) => rowFor(v, pages, path).some(r => r.type === type))
        && rowFor(v, pages, '/r-hist').some(r => r.img);
    let view;
    // The open tab reaches the tab store a moment after its load; retype until every seeded row shows.
    const end = Date.now() + 20000;
    do {
        // Clearing first: React ignores an input event that leaves the value unchanged.
        await typeInPill(app, '');
        await typeInPill(app, 'Row');
        view = await settle(() => readRows(app), ready, 4000);
    } while (!ready(view) && Date.now() < end);
    const first = view.rows[0];
    if (!first || first.caption !== HEURISTIC_CAPTION || !first.selected || view.attrs?.active !== first.id) {
        fail(`the first row must be the heuristic row, highlighted, captioned ${JSON.stringify(HEURISTIC_CAPTION)}; saw ${JSON.stringify(view)}`);
    }
    // Engine suggestions (BAR-03) share the heuristic caption; the dedupe is over the url-captioned rows.
    const captions = view.rows.slice(1).map(r => r.caption).filter(c => c !== HEURISTIC_CAPTION);
    const repeated = captions.filter((c, i) => captions.indexOf(c) !== i);
    if (repeated.length) {
        fail(`two rows for one url: ${JSON.stringify([...new Set(repeated)])}`);
    }
    for (const [path, type] of SEEDED_ROWS) {
        const found = rowFor(view, pages, path);
        if (found.length !== 1 || found[0].type !== type) {
            fail(`the ${path} row must appear once with the ${type} marker; saw ${JSON.stringify(found)}`);
        }
    }
    const hist = rowFor(view, pages, '/r-hist')[0];
    if (!hist || !String(hist.img).startsWith('data:image/')) {
        fail(`${BROKEN} the /r-hist row's leading slot is not a data:image/ <img> (the positive control for the icon check); saw ${JSON.stringify(hist)}`);
    }
    const foreign = view.imgs.filter(src => !String(src).startsWith('data:image/'));
    if (foreign.length) {
        fail(`an <img> in the dropdown has a src that is not data:image/: ${JSON.stringify(foreign)}`);
    }
    if (view.rows.length > 10) {
        fail(`the dropdown shows ${view.rows.length} rows; at most 10`);
    }
    const tall = view.rows.filter(r => Math.round(r.height) !== 32);
    if (tall.length) {
        fail(`every row must be 32px tall; saw ${JSON.stringify(tall.map(r => [r.caption || r.title, r.height]))}`);
    }
    if (!(parseFloat(view.maxHeight) <= 432)) {
        fail(`the dropdown's max-height must be at most 432px; saw ${JSON.stringify(view.maxHeight)}`);
    }
    const a = view.attrs ?? {};
    if (a.role !== 'combobox' || a.expanded !== 'true' || a.controls !== view.id || view.id !== 'pb-chrome-bar-dropdown' || a.autocomplete !== 'both') {
        fail(`the pill must be a combobox (aria-expanded, aria-controls naming the dropdown, aria-autocomplete both); saw ${JSON.stringify({ attrs: a, id: view.id })}`);
    }
    await pressKey(app, ARROW_DOWN);
    const moved = await settle(() => readRows(app), v => v.rows[1]?.selected && v.attrs?.active === v.rows[1].id);
    const second = moved.rows[1];
    if (!second || !second.selected || moved.attrs?.active !== second.id) {
        fail(`ArrowDown must move aria-activedescendant to the second row; saw ${JSON.stringify(moved.attrs)} over ${JSON.stringify(moved.rows.map(r => r.id))}`);
    } else {
        // A reply that arrives after the move: the same query again, with chrome's resolve held back.
        const late = await probe(app, `const c = get('ChromeStoreClient');
            const original = Object.getPrototypeOf(c).resolveTypedAddress.bind(c);
            c.resolveTypedAddress = (...a) => sleep(800).then(() => original(...a));
            try { await get('AddressBar').runQuery('Row'); } finally { delete c.resolveTypedAddress; }
            return true;`);
        if (late !== true) {
            fail(`${BROKEN} the late reply could not be driven (${JSON.stringify(late)})`);
        }
        const after = await readRows(app);
        const now = after.rows.find(r => r.selected);
        if (!now || now.caption !== second.caption || now.title !== second.title || after.attrs?.active !== now.id) {
            fail(`a reply arriving after ArrowDown moved the highlight from ${JSON.stringify(second.title)} to ${JSON.stringify(now ?? null)}`);
        }
    }
    await typeInPill(app, '');
    const cleared = await settle(() => readRows(app), v => !v.open);
    if (cleared.open) {
        fail(`clearing the text must close the dropdown; ${cleared.rows.length} row(s) still showing`);
    }
}

async function failureRows(ctx) {
    const { app, pages, fail } = ctx;
    await sessionTab(ctx);
    const subject = (await app.evaluate(appNameExpr)) || 'The browser';
    const stubbed = await probe(app, `get('ChromeStoreClient').resolveTypedAddress = async () => { throw new Error('stubbed rejection'); }; return true;`);
    if (stubbed !== true) {
        return fail(`${BROKEN} the client's resolveTypedAddress could not be stubbed to reject`);
    }
    let restored = false;
    try {
        await typeInPill(app, 'Row');
        const failed = v => (v.rows[0]?.title ?? '').includes("couldn't load suggestions");
        const view = await settle(() => readRows(app), failed);
        const first = view.rows[0];
        if (!first || !failed(view) || !first.title.startsWith(subject) || !first.selected) {
            fail(`a rejected resolve must make the first row, highlighted, start with ${JSON.stringify(subject)} and say it couldn't load suggestions; saw ${JSON.stringify(view.rows)}`);
        }
        await stubResolve(app, null);
        restored = true;
        const getMark = pages.requests.length;
        await pressKey(app, ENTER);
        if (!await nextGet(pages, '/one/search', getMark, r => queryOf(r) === 'Row')) {
            fail(`Enter on the suggestions-failure row must still search: no GET on /one/search with q "Row"; pill ${JSON.stringify(await readPill(app))}`);
        }
    } finally {
        if (!restored) {
            await stubResolve(app, null);
        }
    }
}

const SUGGEST_PREF = 'browser.searchSuggestions';

/** The /one/suggest GETs at index >= `from`. */
const suggestGets = (pages, from) => pages.requests.slice(from).filter(r => r.path === '/one/suggest');

/** The rows below the heuristic row that are engine suggestions (captioned like a heuristic search). */
const engineRowsOf = view => view.rows.slice(1).filter(r => r.caption === HEURISTIC_CAPTION);

async function suggestions(ctx) {
    const { app, pages, plant, fail, note } = ctx;
    await sessionTab(ctx);
    if (plant === 'setting-ignored') {
        if (await probe(app, `get('AddressBar').suggestionsOn = () => true; return true;`) === true) {
            note('PLANT setting-ignored applied');
        }
    }
    // Positive control: the request log sees this engine's suggest GETs in this session.
    let mark = pages.requests.length;
    await typeInPill(app, 'hel');
    const shows = v => v.rows[0]?.title === 'hel' && v.rows[1]?.title === 'hel alpha' && v.rows[2]?.title === 'hel beta';
    const view = await settle(() => readRows(app), shows, 8000);
    const asked = await nextGet(pages, '/one/suggest', mark, r => queryOf(r) === 'hel', 5000);
    if (!asked || !shows(view) || view.rows[0].caption !== HEURISTIC_CAPTION || engineRowsOf(view).length !== 2) {
        return fail(`typing "hel" must send a GET on /one/suggest with q "hel" (${asked ? 'sent' : 'none'}) and show "hel alpha" and "hel beta" below the heuristic row, captioned ${JSON.stringify(HEURISTIC_CAPTION)}; saw ${JSON.stringify(view.rows)}`);
    }
    mark = pages.requests.length;
    for (const text of [`${new URL(pages.origin).host}/x`, 'localhost:4000']) {
        await typeInPill(app, text);
        await sleep(1650);
    }
    const fenced = await probe(app, `return await get('ChromeStoreClient').searchSuggestions('localhost:4000');`);
    await sleep(500);
    if (!Array.isArray(fenced) || fenced.length) {
        fail(`chrome must answer searchSuggestions('localhost:4000') with []; got ${JSON.stringify(fenced)}`);
    }
    if (suggestGets(pages, mark).length) {
        fail(`address-shaped text reached the engine: ${JSON.stringify(suggestGets(pages, mark).map(r => r.search))}`);
    }
    mark = pages.requests.length;
    await typeInPill(app, 'fail');
    const failedGet = await nextGet(pages, '/one/suggest', mark, r => queryOf(r) === 'fail', 5000);
    await sleep(800);
    const failed = await readRows(app);
    if (!failedGet) {
        fail(`${BROKEN} typing "fail" sent no GET on /one/suggest, so the failure path was never exercised`);
    } else if (failed.rows[0]?.title !== 'fail' || engineRowsOf(failed).length || failed.rows.some(r => r.title.includes("couldn't"))) {
        fail(`a failing suggest endpoint must leave the heuristic row with no engine rows and no error row; saw ${JSON.stringify(failed.rows)}`);
    }
    try {
        if (await setPref(app, SUGGEST_PREF, false) !== true) {
            return fail(`${BROKEN} the ${SUGGEST_PREF} setting could not be turned off`);
        }
        mark = pages.requests.length;
        await typeInPill(app, 'world');
        const off = await settle(() => readRows(app), v => v.rows[0]?.title === 'world');
        await sleep(1500);
        if (suggestGets(pages, mark).length) {
            fail(`suggest request while the setting was off: ${JSON.stringify(suggestGets(pages, mark).map(r => r.search))}`);
        }
        if (off.rows[0]?.title !== 'world' || off.rows[0].caption !== HEURISTIC_CAPTION) {
            fail(`with the setting off the heuristic row must still show for "world"; saw ${JSON.stringify(off.rows)}`);
        }
    } finally {
        await setPref(app, SUGGEST_PREF, true);
    }
    await typeInPill(app, 'hel');
    await settle(() => readRows(app), shows, 8000);
    await pressKey(app, ARROW_DOWN);
    const moved = await settle(() => readRows(app), v => v.rows[1]?.selected);
    if (moved.rows[1]?.title !== 'hel alpha' || !moved.rows[1].selected) {
        return fail(`ArrowDown must highlight "hel alpha"; saw ${JSON.stringify(moved.rows)}`);
    }
    const getMark = pages.requests.length;
    await pressKey(app, ENTER);
    if (!await nextGet(pages, '/one/search', getMark, r => queryOf(r) === 'hel alpha')) {
        fail(`Enter on "hel alpha" must search it: no GET on /one/search with q "hel alpha"; pill ${JSON.stringify(await readPill(app))}`);
    }
}

const ONE_OFF_LABEL = 'This time, search with:';
const SEARCH_SERVICE = `ChromeUtils.importESModule('moz-src:///toolkit/components/search/SearchService.sys.mjs').SearchService`;

/** The open dropdown's one-off strip (its label and buttons), or null when there is none. */
const readOneOffs = app => app.evaluate(`JSON.stringify((() => {
    const strip = document.querySelector('.pb-chrome-bar-dropdown .pb-chrome-bar-oneoffs');
    if (!strip) return null;
    const label = strip.querySelector('.pb-chrome-bar-oneoffs-label');
    return { label: label ? label.textContent : null, buttons: [...strip.querySelectorAll('button.pb-chrome-bar-oneoff')]
        .map(b => ({ aria: b.getAttribute('aria-label'), highlighted: b.classList.contains('is-highlighted') })) };
})())`).then(JSON.parse);

const TWO_BUTTON = `[...document.querySelectorAll('.pb-chrome-bar-dropdown .pb-chrome-bar-oneoff')].find(b => b.getAttribute('aria-label') === ${JSON.stringify(`Search with ${ENGINE_TWO}`)})`;

/** Dispatches a mouse event `type` on Probe Engine Two's one-off button (React listens at its root). */
const fireOneOff = (app, type, init = {}) => app.evaluate(`(() => {
    const b = ${TWO_BUTTON};
    if (!b) return false;
    b.dispatchEvent(new MouseEvent(${JSON.stringify(type)}, { bubbles: true, cancelable: true, ...${JSON.stringify(init)} }));
    return true;
})()`);

/** Types "hello" afresh (clearing first: React ignores an unchanged value) and waits for a strip with a button. */
async function typeForOneOffs(app) {
    await typeInPill(app, '');
    await typeInPill(app, 'hello');
    return settle(() => readOneOffs(app), v => !!v && v.buttons.length > 0, 8000);
}

/** Chrome-side: sets `hidden` on each named engine, then has the widget re-read the engines. */
async function setEnginesHidden(app, names, hidden) {
    const done = await inChrome(app, `return (async () => {
        const S = ${SEARCH_SERVICE};
        for (const name of ${JSON.stringify(names)}) S.getEngineByName(name).hidden = ${hidden};
        return true;
    })();`);
    return done === true && await probe(app, `await get('AddressBar').refreshEngines(); return true;`) === true;
}

async function oneOff(ctx) {
    const { app, pages, plant, fail, note } = ctx;
    const tabId = await sessionTab(ctx);
    if (plant === 'oneoff-default') {
        const planted = await probe(app, `const w = get('AddressBar');
            const original = Object.getPrototypeOf(w).runOneOff;
            w.runOneOff = function (name, target) { return original.call(this, '', target); };
            return true;`);
        if (planted === true) {
            note('PLANT oneoff-default applied');
        }
    }
    // Derived from chrome's list, compared in order: every engine but the one in use.
    const listed = await probe(app, `return (await get('ChromeStoreClient').listSearchEngines()).engines.map(e => e.name);`);
    if (!Array.isArray(listed) || !listed.includes(ENGINE_ONE) || !listed.includes(ENGINE_TWO)) {
        return fail(`${BROKEN} chrome's engine list lacks the probe engines: ${JSON.stringify(listed)}`);
    }
    const want = listed.filter(name => name !== ENGINE_ONE).map(name => `Search with ${name}`);
    const strip = await typeForOneOffs(app);
    if (!strip || strip.label !== ONE_OFF_LABEL || JSON.stringify(strip.buttons.map(b => b.aria)) !== JSON.stringify(want)) {
        return fail(`typing "hello" must show the strip ${JSON.stringify(ONE_OFF_LABEL)} with the buttons ${JSON.stringify(want)}; saw ${JSON.stringify(strip)}`);
    }
    const twoAt = want.indexOf(`Search with ${ENGINE_TWO}`);
    const tip = await probe(app, `const b = ${TWO_BUTTON};
        get('HoverService').cancelHover();
        b.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
        const shown = () => [...document.querySelectorAll('.theia-hover')].filter(h => h.matches(':popover-open') && !h.style.visibility);
        if (!(await until(() => shown().length > 0, 5000))) return { shown: 0 };
        const seen = { shown: shown().length, text: shown()[0].textContent, ours: shown()[0].classList.contains('pb-chrome-bar-hover') };
        get('HoverService').cancelHover();
        return seen;`);
    if (tip?.shown !== 1 || tip.text !== ENGINE_TWO || !tip.ours) {
        fail(`hovering the one-off must show one pb-chrome-bar-hover tooltip reading ${JSON.stringify(ENGINE_TWO)}; saw ${JSON.stringify(tip)}`);
    }
    let mark = pages.requests.length;
    let pushMark = (await pushes(app)).length;
    await fireOneOff(app, 'click');
    const clicked = await nextGet(pages, '/two/search', mark, r => queryOf(r) === 'hello');
    if (!clicked) {
        fail(`no GET on /two/search with q "hello" after clicking the one-off; requests since the mark: ${JSON.stringify(pages.requests.slice(mark).map(r => r.path + r.search))}`);
    } else if (await waitForPush(app, p => p && p.kind === 'state' && p.tabId === tabId && pathOf(p.url) === '/two/search', { from: pushMark }) < 0) {
        fail('clicking the one-off did not search in the current tab (no state push for it on /two/search)');
    }
    const def = await inChrome(app, `return (async () => { const S = ${SEARCH_SERVICE}; return (await S.getDefault()).name; })();`);
    const pref = await probe(app, `return get('PreferenceService').get(${JSON.stringify(ENGINE_PREF)});`);
    if (def !== ENGINE_ONE || pref !== '') {
        fail(`a one-off must change neither Gecko's default nor the setting; default ${JSON.stringify(def)}, ${ENGINE_PREF} ${JSON.stringify(pref)}`);
    }
    if (!await typeForOneOffs(app)) {
        return fail('typing "hello" again showed no one-off strip');
    }
    let highlighted = false;
    // Each press waits for the highlight to move: a read taken before the re-render
    // would count one press late, and Enter would then land on the button past it.
    const sig = async () => `${highlightOf(await readRows(app))}|${JSON.stringify((await readOneOffs(app))?.buttons.map(b => b.highlighted))}`;
    let was = await sig();
    for (let i = 0; i < 12 + want.length && !highlighted; i++) {
        await pressKey(app, ARROW_DOWN);
        was = await settle(sig, v => v !== was);
        highlighted = !!(await readOneOffs(app))?.buttons[twoAt]?.highlighted;
    }
    if (!highlighted) {
        return fail(`ArrowDown past the last row never highlighted the ${ENGINE_TWO} one-off`);
    }
    mark = pages.requests.length;
    await pressKey(app, ENTER);
    if (!await nextGet(pages, '/two/search', mark, r => queryOf(r) === 'hello')) {
        fail(`no GET on /two/search with q "hello" after Enter on the highlighted one-off; requests since the mark: ${JSON.stringify(pages.requests.slice(mark).map(r => r.path + r.search))}; pill ${JSON.stringify(await readPill(app))}; one-offs ${JSON.stringify(await readOneOffs(app))}`);
    }
    if (!await typeForOneOffs(app)) {
        return fail('typing "hello" a third time showed no one-off strip');
    }
    pushMark = (await pushes(app)).length;
    await fireOneOff(app, 'auxclick', { button: 1 });
    const bg = await waitForPush(app, p => p && p.kind === 'state' && p.tabId !== tabId && pathOf(p.url) === '/two/search', { from: pushMark });
    if (bg < 0) {
        fail('a middle-click on the one-off opened no new tab on /two/search');
    }
    const stayed = await probe(app, `return get('ApplicationShell').mainPanel.currentTitle?.owner === get('WebTabChannel').widgetOf(${JSON.stringify(tabId)});`);
    if (stayed !== true) {
        fail('a middle-click on the one-off changed the current tab (it must open in the background)');
    }
    // A failed background one-off: Enter repeats it in a new tab rather than re-committing the pill's page address.
    if (plant === 'oneoff-retry-recommits') {
        const planted = await probe(app, `const w = get('AddressBar');
            const original = Object.getPrototypeOf(w).showNoSearch;
            w.showNoSearch = function () { return original.call(this); };
            return true;`);
        if (planted === true) {
            note('PLANT oneoff-retry-recommits applied');
        }
    }
    if (!await typeForOneOffs(app)) {
        return fail('typing "hello" a fourth time showed no one-off strip');
    }
    const failOnce = await probe(app, `const c = get('ChromeStoreClient');
        c.resolveTypedAddress = async () => { delete c.resolveTypedAddress; return { kind: 'no-engine' }; };
        return true;`);
    if (failOnce !== true) {
        return fail(`${BROKEN} the client's resolveTypedAddress could not be stubbed`);
    }
    try {
        await fireOneOff(app, 'auxclick', { button: 1 });
        const row = await settle(() => readPill(app), v => v.rows.length === 1 && v.rows[0].includes("can't search right now"));
        if (row.rows.length !== 1 || !row.rows[0].includes("can't search right now")) {
            fail(`a failed background one-off must show the no-search row; saw ${JSON.stringify(row)}`);
        } else {
            const seen = new Set((await pushes(app)).map(p => p?.tabId));
            pushMark = (await pushes(app)).length;
            await pressKey(app, ENTER);
            if (await waitForPush(app, p => p && p.kind === 'state' && !seen.has(p.tabId) && pathOf(p.url) === '/two/search', { from: pushMark }) < 0) {
                fail(`Enter after a failed background one-off opened no new tab on /two/search; pill ${JSON.stringify(await readPill(app))}`);
            }
        }
    } finally {
        await stubResolve(app, null);
    }
    const others = listed.filter(name => name !== ENGINE_ONE);
    try {
        if (!await setEnginesHidden(app, others, true)) {
            return fail(`${BROKEN} the engines other than ${ENGINE_ONE} could not be hidden chrome-side`);
        }
        await typeInPill(app, '');
        await typeInPill(app, 'hello');
        const one = await settle(() => readRows(app), v => v.rows[0]?.title === 'hello');
        if (!one.open || one.rows[0]?.title !== 'hello') {
            fail(`${BROKEN} with one engine the dropdown did not open for "hello"; saw ${JSON.stringify(one)}`);
        } else if (await readOneOffs(app)) {
            fail('with one engine the one-off strip must be hidden');
        }
    } finally {
        await setEnginesHidden(app, others, false);
    }
}

/**
 * The served origin under the name localhost: a second site, so this plan's
 * tabs stay clear of the four-tab budget on 127.0.0.1 (Phase 27's deferred
 * same-process reload defect).
 */
const localUrl = (pages, path) => pages.url(path).replace('//127.0.0.1:', '//localhost:');

/** Dispatches a mousedown on the dropdown row `id` (React listens at its root); primary button unless `init` says otherwise. */
const rowMouseDown = (app, id, init = {}) => app.evaluate(`(() => {
    const r = document.getElementById(${JSON.stringify(id)});
    if (!r) return false;
    r.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, ...${JSON.stringify(init)} }));
    return true;
})()`);

/** The tab id of the main area's current tab, or null. */
const mainTabId = app => probe(app, `return get('ApplicationShell').mainPanel.currentTitle?.owner?.tabId ?? null;`);

/** Clears and retypes `text` until a row matching `pred` shows (the tab store catches up a moment after a load). */
async function typeUntilRow(app, text, pred, timeoutMs = 20000) {
    let view;
    const end = Date.now() + timeoutMs;
    do {
        await typeInPill(app, '');
        await typeInPill(app, text);
        view = await settle(() => readRows(app), v => v.rows.some(pred), 4000);
    } while (!view.rows.some(pred) && Date.now() < end);
    return view;
}

async function switchToTab(ctx) {
    const { app, pages, plant, fail, note } = ctx;
    const urlA = localUrl(pages, '/sw-a');
    const tabA = await openWebTab(app, urlA);
    // The positive control for the no-load check below: the recorder sees A's loads.
    if (await waitForPush(app, loadedAt(tabA, '/sw-a')) < 0) {
        return fail(`${BROKEN} no loaded state push arrived for /sw-a`);
    }
    const tabB = await openWebTab(app, localUrl(pages, '/sw-b'));
    if (await waitForPush(app, loadedAt(tabB, '/sw-b')) < 0) {
        return fail(`${BROKEN} no loaded state push arrived for /sw-b`);
    }
    if (plant === 'tab-row-navigates') {
        const planted = await probe(app, `const w = get('AddressBar');
            w.switchToTab = function (row) { return this.commitRow(row); };
            return true;`);
        if (planted === true) {
            note('PLANT tab-row-navigates applied');
        }
    }
    const isTabRow = r => r.caption === urlA && r.type === 'codicon-browser';
    for (const how of ['click', 'Enter']) {
        if (await makeCurrent(app, tabB) !== true) {
            return fail(`${BROKEN} the /sw-b tab could not be made current`);
        }
        const view = await typeUntilRow(app, 'Switch Alpha', isTabRow);
        const row = view.rows.find(isTabRow);
        if (!row || row.switchText !== 'Switch to Tab') {
            return fail(`${how}: typing "Switch Alpha" must show the /sw-a open-tab row with the codicon-browser marker and "Switch to Tab"; saw ${JSON.stringify(view.rows)}`);
        }
        if (how === 'Enter') {
            // Each press waits for the highlight to move (highlightRow): a read taken before the re-render overshot onto a one-off.
            const on = !!(await highlightRow(app, urlA)).rows.find(isTabRow)?.selected;
            if (!on) {
                return fail('ArrowDown never highlighted the /sw-a open-tab row');
            }
        }
        const mark = (await pushes(app)).length;
        const getMark = pages.requests.length;
        if (how === 'click') {
            await rowMouseDown(app, row.id);
        } else {
            await pressKey(app, ENTER);
        }
        const current = await settle(() => mainTabId(app), id => id === tabA);
        if (current !== tabA) {
            fail(`${how}: choosing the open-tab row must make /sw-a's tab current; the current tab is ${JSON.stringify(current)} (A ${tabA}, B ${tabB})`);
        }
        const focused = await settle(() => chromeActiveTabId(app), id => id === tabA);
        if (focused !== tabA) {
            fail(`${how}: chrome's active element must be /sw-a's overlay after the switch; it is ${JSON.stringify(focused)}`);
        }
        const pill = await settle(() => readPill(app), v => v.value === urlA);
        if (pill.value !== urlA) {
            fail(`${how}: the pill must show /sw-a's address after the switch; it shows ${JSON.stringify(pill.value)}`);
        }
        // Long enough for a load the choice started to push its start.
        await sleep(1500);
        const loads = (await pushes(app)).slice(mark)
            .filter(p => p && p.kind === 'state' && p.loading === true && (p.tabId === tabA || p.tabId === tabB));
        if (loads.length) {
            fail(`${how}: a state push with loading: true arrived after choosing the open-tab row (switching must not load): ${JSON.stringify(loads.map(p => [p.tabId === tabA ? 'A' : 'B', pathOf(p.url)]))}`);
        }
        const gets = pages.requests.slice(getMark).filter(r => r.path === '/sw-a');
        if (gets.length) {
            fail(`${how}: choosing the open-tab row sent ${gets.length} new GET(s) on /sw-a`);
        }
    }
}

/** The index of web tab `tabId` in its main-area tab bar, or -1. */
const tabIndex = (app, tabId) => probe(app, `const w = get('WebTabChannel').widgetOf(${JSON.stringify(tabId)});
    const bar = w && get('ApplicationShell').getTabBarFor(w);
    return bar ? bar.titles.indexOf(w.title) : -1;`);

/** Records, page-realm, the tab id of every widget the active group is asked to take (the join call itself). */
const recordJoins = app => probe(app, `const g = get('GroupModel');
    window.__pbJoined = [];
    if (!g.__pbJoinSpy) {
        const original = Object.getPrototypeOf(g).joinActiveGroup;
        g.joinActiveGroup = function (widget) { window.__pbJoined.push(widget.tabId ?? widget.id); return original.call(this, widget); };
        g.__pbJoinSpy = true;
    }
    return true;`);
const joined = app => app.evaluate('JSON.stringify(window.__pbJoined || [])').then(JSON.parse);

const ALT_ENTER = { ...ENTER, modifiers: ['alt'] };

async function newTabTargets(ctx) {
    const { app, pages, fail } = ctx;
    const startId = await sessionTab(ctx);
    if (await recordJoins(app) !== true) {
        return fail(`${BROKEN} the active-group join could not be recorded`);
    }
    const port = new URL(pages.origin).port;
    const known = new Set([startId]);
    /** The id of the first tab not seen before whose state push ends `path`, at or after push `from`; null on timeout. */
    const newTabOn = async (path, from) => {
        const at = await waitForPush(app, p => p && p.kind === 'state' && !known.has(p.tabId) && pathOf(p.url) === path, { from });
        if (at < 0) {
            return null;
        }
        const id = (await pushes(app))[at].tabId;
        known.add(id);
        return id;
    };
    /** Shared checks for a new tab `id` on `path` opened after `refId`. */
    const placed = async (how, id, path, refId, foreground) => {
        const want = await tabIndex(app, refId) + 1;
        const at = await tabIndex(app, id);
        if (at !== want) {
            fail(`${how}: the new ${path} tab must sit directly after the current one (index ${want}); it is at ${at}`);
        }
        if (!(await joined(app)).includes(id)) {
            fail(`${how}: the new ${path} tab was not joined to the active group (joins recorded: ${JSON.stringify(await joined(app))})`);
        }
        const currentWant = foreground ? id : refId;
        // A background tab must not take over: give a late activation time to land.
        const current = foreground ? await settle(() => mainTabId(app), v => v === id) : (await sleep(1000), await mainTabId(app));
        if (current !== currentWant) {
            fail(`${how}: the current tab must be ${foreground ? 'the new' : 'the previous'} one (${currentWant}); it is ${JSON.stringify(current)}`);
        }
    };

    // Alt+Enter on typed text: a new foreground tab.
    let mark = (await pushes(app)).length;
    await typeInPill(app, `localhost:${port}/nt-fg`);
    await pressKey(app, ALT_ENTER);
    const fgId = await newTabOn('/nt-fg', mark);
    if (!fgId) {
        return fail(`Alt+Enter on "localhost:${port}/nt-fg" opened no new tab on /nt-fg; pill ${JSON.stringify(await readPill(app))}`);
    }
    await placed('Alt+Enter', fgId, '/nt-fg', startId, true);
    const focused = await settle(() => chromeActiveTabId(app), id => id === fgId);
    if (focused !== fgId) {
        fail(`Alt+Enter: chrome's active element must be the new tab's overlay; it is ${JSON.stringify(focused)}`);
    }
    if (await makeCurrent(app, fgId) !== true) {
        return fail(`${BROKEN} the /nt-fg tab could not be made current`);
    }
    const committed = localUrl(pages, '/nt-fg');
    /** After a background gesture: no dropdown, and the pill back on the current tab's address. */
    const reverted = async how => {
        const view = await settle(() => readRows(app), v => !v.open);
        if (view.open) {
            fail(`${how}: the dropdown must close; ${view.rows.length} row(s) still showing`);
        }
        const pill = await settle(() => readPill(app), v => v.value === committed);
        if (pill.value !== committed) {
            fail(`${how}: the pill must revert to the committed address ${JSON.stringify(committed)}; it shows ${JSON.stringify(pill.value)}`);
        }
    };

    // Ctrl+click on the heuristic row: a new background tab.
    await typeInPill(app, `localhost:${port}/nt-bg`);
    const typed = await settle(() => readRows(app), v => v.open && v.rows.length > 0);
    if (!typed.rows[0]) {
        return fail(`${BROKEN} typing "localhost:${port}/nt-bg" showed no heuristic row`);
    }
    mark = (await pushes(app)).length;
    await rowMouseDown(app, typed.rows[0].id, { ctrlKey: true });
    const bgId = await newTabOn('/nt-bg', mark);
    if (!bgId) {
        fail('Ctrl+click on the heuristic row opened no new tab on /nt-bg');
    } else {
        await placed('Ctrl+click', bgId, '/nt-bg', fgId, false);
        await reverted('Ctrl+click');
    }

    // Middle-click on a history row: a new background tab.
    const urlMid = localUrl(pages, '/nt-mid');
    const seeded = await inChrome(app, `return (async () => {
        try {
            const { PlacesUtils } = ChromeUtils.importESModule('resource://gre/modules/PlacesUtils.sys.mjs');
            await PlacesUtils.history.insert({ url: ${JSON.stringify(urlMid)}, title: 'Middle Page', visits: [{ date: new Date() }] });
            return 'ok';
        } catch (e) {
            return 'error: ' + e;
        }
    })();`);
    if (seeded !== 'ok') {
        return fail(`${BROKEN} the /nt-mid history visit could not be seeded (${String(seeded)})`);
    }
    const isMid = r => r.caption === urlMid && r.type === 'codicon-history';
    const midView = await typeUntilRow(app, 'Middle Page', isMid);
    const midRow = midView.rows.find(isMid);
    if (!midRow) {
        return fail(`typing "Middle Page" must show the /nt-mid history row; saw ${JSON.stringify(midView.rows)}`);
    }
    mark = (await pushes(app)).length;
    await rowMouseDown(app, midRow.id, { button: 1, buttons: 4 });
    const midId = await newTabOn('/nt-mid', mark);
    if (!midId) {
        fail('a middle-click on the history row opened no new tab on /nt-mid');
    } else {
        await placed('middle-click', midId, '/nt-mid', fgId, false);
        await reverted('middle-click');
    }

    // Ctrl+click on an open-tab row opens its address again rather than switching.
    const isOpenTab = r => r.caption === committed && r.type === 'codicon-browser';
    const tabView = await typeUntilRow(app, 'Target Foreground', isOpenTab);
    const tabRow = tabView.rows.find(isOpenTab);
    if (!tabRow) {
        return fail(`typing "Target Foreground" must show the /nt-fg open-tab row; saw ${JSON.stringify(tabView.rows)}`);
    }
    mark = (await pushes(app)).length;
    await rowMouseDown(app, tabRow.id, { ctrlKey: true });
    const dupId = await newTabOn('/nt-fg', mark);
    if (!dupId) {
        fail('Ctrl+click on the open-tab row opened no new tab on /nt-fg (it must open the address again, not switch)');
    } else {
        await placed('Ctrl+click on an open-tab row', dupId, '/nt-fg', fgId, false);
        const copies = await probe(app, `return webTabs().filter(w => w.url === ${JSON.stringify(committed)}).length;`);
        if (copies !== 2) {
            fail(`Ctrl+click on the open-tab row must leave two tabs on /nt-fg; there are ${JSON.stringify(copies)}`);
        }
    }
}

/** The pill's value, selection and focus. */
const readSel = app => app.evaluate(`JSON.stringify((() => {
    const input = document.querySelector('.pb-chrome-bar-input');
    return input ? { value: input.value, start: input.selectionStart, end: input.selectionEnd, focused: document.activeElement === input } : null;
})())`).then(JSON.parse);

/** Focuses the pill, selects its text, then types `text` one key at a time at the parent (trusted insertText). */
async function typeKeys(app, text, { selectAll = true } = {}) {
    if (await focusTheiaFrame(app) !== true) {
        throw new Error(`${BROKEN} the Theia frame could not be made chrome's active element`);
    }
    const ready = await app.evaluate(`(() => {
        const input = document.querySelector('.pb-chrome-bar-input');
        if (!input) return false;
        input.focus();
        if (${selectAll}) input.select();
        return document.activeElement === input;
    })()`);
    if (ready !== true) {
        throw new Error(`${BROKEN} the pill could not be focused for typing`);
    }
    for (const ch of text) {
        const upper = ch.toUpperCase();
        await pressKey(app, { key: ch, code: `Key${upper}`, keyCode: upper.charCodeAt(0) });
    }
}

const TAB_KEY = { key: 'Tab', code: 'Tab', keyCode: 9 };
const BACKSPACE = { key: 'Backspace', code: 'Backspace', keyCode: 8 };

/** Chrome scope: seeds a visit to `url` and waits until its origin's frecency is above 0 on the read-only connection. */
const seedOrigin = (app, url, host) => inChrome(app, `return (async () => {
    try {
        const { PlacesUtils } = ChromeUtils.importESModule('resource://gre/modules/PlacesUtils.sys.mjs');
        await PlacesUtils.history.insert({ url: ${JSON.stringify(url)}, title: 'Autofill Page', visits: [{ date: new Date() }] });
        // A new origin row arrives with recalc_frecency = 1; the recalculator fills its frecency in on a deferred task.
        await Cc['@mozilla.org/places/frecency-recalculator;1'].getService(Ci.nsIObserver).wrappedJSObject.recalculateAnyOutdatedFrecencies();
        const db = await PlacesUtils.promiseDBConnection();
        for (let i = 0; i < 50; i++) {
            const rows = await db.execute("SELECT frecency FROM moz_origins WHERE prefix = 'http://' AND host = :host", { host: ${JSON.stringify(host)} });
            if (rows.length && rows[0].getResultByName('frecency') > 0) return 'ok';
            await new Promise(resolve => setTimeout(resolve, 200));
        }
        return 'never';
    } catch (e) {
        return 'error: ' + e;
    }
})();`);

async function autofill(ctx) {
    const { app, pages, plant, fail, note } = ctx;
    const port = new URL(pages.origin).port;
    const host = `localhost:${port}`;
    const origin = `http://${host}/`;
    const completed = `${host}/`;
    const seeded = await seedOrigin(app, localUrl(pages, '/af'), host);
    if (seeded !== 'ok') {
        return fail(`${BROKEN} the seeded origin never reached frecency > 0 on the read-only Places connection (${String(seeded)})`);
    }
    // A tab on the same site, so Enter navigates it without a process switch (Phase 27's reload defect).
    const tabId = await openWebTab(app, localUrl(pages, '/af'));
    if (await waitForPush(app, loadedAt(tabId, '/af')) < 0 || await makeCurrent(app, tabId) !== true) {
        return fail(`${BROKEN} no current web tab on localhost /af`);
    }
    const completes = (typedLength, v) => v && v.value === completed && v.start === typedLength && v.end === completed.length;

    await typeKeys(app, 'loc');
    const filled = await settle(() => readSel(app), v => completes(3, v));
    if (!completes(3, filled)) {
        const reply = await probe(app, `return await get('ChromeStoreClient').autofillOrigin('loc');`);
        return fail(`typing "loc" must complete the pill to ${JSON.stringify(completed)} with characters 3..${completed.length} selected; saw ${JSON.stringify(filled)}; chrome's autofillOrigin('loc') replies ${JSON.stringify(reply)}`);
    }
    const view = await settle(() => readRows(app), v => v.rows[0]?.title === origin);
    if (view.rows[0]?.title !== origin || view.rows[0]?.caption !== 'Visit') {
        fail(`the heuristic row must be a "Visit" of ${origin}; saw ${JSON.stringify(view.rows[0])}`);
    }
    await pressKey(app, TAB_KEY);
    const tabbed = await settle(() => readSel(app), v => v && v.start === v.end);
    const open = (await readRows(app)).open;
    if (!tabbed || tabbed.value !== completed || tabbed.start !== completed.length || tabbed.end !== completed.length || !tabbed.focused || !open) {
        fail(`Tab must accept the completion: the selection collapsed at the end, focus in the pill and the dropdown open; saw ${JSON.stringify({ ...tabbed, open })}`);
    }
    const mark = (await pushes(app)).length;
    const getMark = pages.requests.length;
    await pressKey(app, ENTER);
    const got = await nextGet(pages, '/', getMark);
    if (!got) {
        fail(`Enter on the completion sent no GET on / of the served origin; pill ${JSON.stringify(await readSel(app))}`);
    }
    if (await waitForPush(app, p => p && p.kind === 'state' && p.tabId === tabId && p.url === origin, { from: mark, timeoutMs: got ? 15000 : 1000 }) < 0) {
        fail(`no state push for the tab carried ${origin} after Enter`);
    }

    await typeKeys(app, 'loc');
    const again = await settle(() => readSel(app), v => completes(3, v));
    if (!completes(3, again)) {
        return fail(`typing "loc" a second time did not complete (the positive control for Backspace); saw ${JSON.stringify(again)}`);
    }
    await pressKey(app, BACKSPACE);
    const removed = await settle(() => readSel(app), v => v && v.value === 'loc');
    // Past the debounced re-query the Backspace started: it must not complete again.
    await sleep(1200);
    const later = await readSel(app);
    if (removed?.value !== 'loc' || later?.value !== 'loc' || later.start !== 3 || later.end !== 3) {
        fail(`Backspace must remove the completion and leave "loc" with no selection; saw ${JSON.stringify(removed)}, then ${JSON.stringify(later)}`);
    }
    await typeKeys(app, 'a', { selectAll: false });
    const back = await settle(() => readSel(app), v => completes(4, v));
    if (!completes(4, back)) {
        fail(`typing "a" after Backspace must complete again; saw ${JSON.stringify(back)}`);
    }

    if (plant === 'autofill-on-paste') {
        const planted = await probe(app, `const w = get('AddressBar');
            w.autofillEligible = function (e) { const i = e.target; return !this.autofillSuppressed && i.selectionStart === i.value.length && !/\\s/.test(i.value); };
            return true;`);
        if (planted === true) {
            note('PLANT autofill-on-paste applied');
        }
    }
    const pasted = await app.evaluate(`(() => {
        const input = document.querySelector('.pb-chrome-bar-input');
        if (!input) return false;
        input.focus();
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'loc');
        input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertFromPaste', data: 'loc' }));
        return true;
    })()`);
    if (pasted !== true) {
        return fail(`${BROKEN} the paste-shaped input event could not be dispatched`);
    }
    // The query the paste started has answered once the heuristic row describes "loc".
    const answered = await settle(() => readRows(app), v => v.rows[0]?.title === 'loc', 8000);
    if (answered.rows[0]?.title !== 'loc') {
        const seen = await readSel(app);
        return fail(seen?.value === 'loc'
            ? `${BROKEN} the query for the pasted "loc" never answered; rows ${JSON.stringify(answered.rows)}`
            : `autofilled a paste: the pill reads ${JSON.stringify(seen)}`);
    }
    await sleep(1000);
    const after = await readSel(app);
    if (after?.value !== 'loc') {
        fail(`autofilled a paste: the pill reads ${JSON.stringify(after)}`);
    }
}

const CTRL_ENTER = { ...ENTER, modifiers: ['control'] };

/** The URLs the wrapped openCommittedUrl recorded. */
const committedUrls = app => app.evaluate('JSON.stringify(window.__pbCommitted || [])').then(JSON.parse);

async function canonizeDrop(ctx) {
    const { app, fail } = ctx;
    await sessionTab(ctx);
    const canon = await probe(app, `return await get('ChromeStoreClient').resolveTypedAddress('example', '', true);`);
    if (canon?.kind !== 'visit' || canon.url !== 'https://www.example.com/') {
        fail(`resolveTypedAddress('example', '', true) must reply a visit of https://www.example.com/; got ${JSON.stringify(canon)}`);
    }
    const plain = await probe(app, `return await get('ChromeStoreClient').resolveTypedAddress('example', '', false);`);
    if (plain?.kind !== 'search') {
        fail(`resolveTypedAddress('example', '', false) must reply kind search; got ${JSON.stringify(plain)}`);
    }
    // The UI half records the commit instead of loading it: www.example.com is a public host.
    const wrapped = await probe(app, `const w = get('AddressBar');
        window.__pbCommitted = [];
        w.__pbOpenCommitted = w.openCommittedUrl;
        w.openCommittedUrl = async url => { window.__pbCommitted.push(url); };
        return true;`);
    if (wrapped !== true) {
        return fail(`${BROKEN} the address bar's openCommittedUrl could not be wrapped`);
    }
    try {
        for (const [text, want] of [['example', 'https://www.example.com/'], ['example.org', 'https://example.org/']]) {
            await app.evaluate('window.__pbCommitted = []; true');
            await typeInPill(app, text);
            await pressKey(app, CTRL_ENTER);
            const got = await settle(() => committedUrls(app), v => v.length > 0, 8000);
            if (got.length !== 1 || got[0] !== want) {
                fail(`Ctrl+Enter on "${text}" must commit ${want}; the commit recorded ${JSON.stringify(got)}`);
            }
        }
    } finally {
        await probe(app, `const w = get('AddressBar');
            if (w.__pbOpenCommitted) { w.openCommittedUrl = w.__pbOpenCommitted; delete w.__pbOpenCommitted; }
            return true;`);
    }
    await dropOnPill(ctx);
}

/**
 * Synthesises dragenter, dragover and (unless `drop` is false) drop on the
 * pill with `data`; returns the dragover's verdict. After a drop the pill's
 * value is sampled every frame into window.__pbPillSeen until a recorded push
 * at index >= `pushMark` ends `path` (or 15 s pass); a sample taken after that
 * push could show the pushed address, so none is.
 */
const dragOntoPill = (app, data, { drop = true, path = '', pushMark = 0, fromPill = false } = {}) => app.evaluate(`JSON.stringify((() => {
    const pill = document.querySelector('.pb-chrome-bar-pill');
    const input = document.querySelector('.pb-chrome-bar-input');
    if (!pill || !input) return null;
    const dt = new DataTransfer();
    for (const [type, value] of Object.entries(${JSON.stringify(data)})) dt.setData(type, value);
    const fire = type => { const e = new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt }); input.dispatchEvent(e); return e; };
    if (${fromPill}) fire('dragstart');
    fire('dragenter');
    const over = fire('dragover');
    const seen = { prevented: over.defaultPrevented, dropEffect: dt.dropEffect, ring: pill.classList.contains('is-drop-target') };
    if (${drop}) {
        window.__pbPillSeen = [input.value];
        const path = ${JSON.stringify(path)};
        const end = performance.now() + 15000;
        // A push carrying the path may set the pill itself, so sampling stops before reading past one.
        const sample = () => {
            const pushed = path && (window.__pbPushes || []).slice(${pushMark}).some(p => p && p.kind === 'state' && String(p.url).endsWith(path));
            if (pushed || performance.now() >= end) return;
            window.__pbPillSeen.push(input.value);
            requestAnimationFrame(sample);
        };
        seen.dropPrevented = fire('drop').defaultPrevented;
        seen.valueAfterDrop = input.value;
        seen.ringAfter = pill.classList.contains('is-drop-target');
        requestAnimationFrame(sample);
    }
    if (${fromPill}) fire('dragend');
    return seen;
})())`).then(JSON.parse);

async function dropOnPill(ctx) {
    const { app, pages, plant, fail, note } = ctx;
    const tabId = await sessionTab(ctx);
    const payload = pages.url('/dropped');

    let mark = (await pushes(app)).length;
    let getMark = pages.requests.length;
    const link = await dragOntoPill(app, { 'text/uri-list': `# a comment\n${payload}` }, { path: '/dropped', pushMark: mark });
    if (!link) {
        return fail(`${BROKEN} the pill is missing`);
    }
    if (!link.prevented || link.dropEffect !== 'copy' || !link.ring || link.ringAfter) {
        fail(`a link dragged over the pill must show the ring with dropEffect copy, and the ring must go at the drop; saw ${JSON.stringify(link)}`);
    }
    const linkGet = await nextGet(pages, '/dropped', getMark);
    if (!linkGet) {
        fail(`dropping a link on the pill sent no GET on /dropped; pill ${JSON.stringify(await readPill(app))}`);
    }
    if (await waitForPush(app, loadedAt(tabId, '/dropped'), { from: mark, timeoutMs: linkGet ? 15000 : 1000 }) < 0) {
        fail('dropping a link on the pill did not load /dropped in the current tab (no loaded push for the session tab)');
    }
    const sampled = await app.evaluate('JSON.stringify(window.__pbPillSeen || [])').then(JSON.parse);
    if (!sampled.length) {
        fail(`${BROKEN} the pill was never sampled after the drop`);
    } else if (sampled.includes(payload)) {
        fail(`the dropped payload was put in the pill before the load's push (sampled ${JSON.stringify(sampled.slice(0, 8))})`);
    }

    mark = (await pushes(app)).length;
    getMark = pages.requests.length;
    const text = await dragOntoPill(app, { 'text/plain': 'dropped words' }, { path: '/one/search', pushMark: mark });
    if (!text?.prevented || text.dropEffect !== 'copy' || text.ring) {
        fail(`plain text dragged over the pill must get dropEffect copy and no ring; saw ${JSON.stringify(text)}`);
    }
    const searched = await nextGet(pages, '/one/search', getMark, r => queryOf(r) === 'dropped words');
    if (!searched) {
        fail(`dropping "dropped words" on the pill sent no GET on /one/search with q "dropped words"; requests ${JSON.stringify(pages.requests.slice(getMark).map(r => r.path + r.search))}`);
    }

    // WR-08: the same drop, started on the pill's own text, is the native
    // in-field move. The plain-text drop above (a GET) is its positive control.
    if (plant === 'pill-drag-navigates') {
        const planted = await probe(app, `const w = get('AddressBar');
            Object.defineProperty(w, 'pillDragActive', { get: () => false, set() {}, configurable: true });
            return true;`);
        if (planted === true) {
            note('PLANT pill-drag-navigates applied');
        }
    }
    getMark = pages.requests.length;
    const own = await dragOntoPill(app, { 'text/plain': 'own words' }, { fromPill: true });
    const ownGet = await nextGet(pages, '/one/search', getMark, r => queryOf(r) === 'own words', searched ? 3000 : 500);
    if (own?.prevented || own?.dropPrevented || ownGet) {
        fail(`a drag started on the pill's own text and dropped back on it must be left to the field; dragover prevented ${JSON.stringify(own?.prevented)}, drop prevented ${JSON.stringify(own?.dropPrevented)}, ${ownGet ? 'sent a GET on /one/search for "own words"' : 'no GET'}`);
    }
    await probe(app, `const w = get('AddressBar'); delete w.pillDragActive; w.pillDragActive = false; return true;`);

    const refusedLink = await dragOntoPill(app, { 'text/uri-list': 'javascript:alert(1)' }, { drop: false });
    if (refusedLink?.ring || refusedLink?.dropEffect !== 'none') {
        fail(`a javascript: link over the pill must be refused with no ring and dropEffect none; saw ${JSON.stringify(refusedLink)}`);
    }
    mark = (await pushes(app)).length;
    await dragOntoPill(app, { 'text/plain': 'javascript:alert(1)' }, { path: 'never', pushMark: mark });
    const pill = await settle(() => readPill(app), v => v.rows.length === 1 && v.rows[0].includes("couldn't open that address"));
    if (pill.rows.length !== 1 || !pill.rows[0].includes("couldn't open that address")) {
        fail(`dropped javascript: text must show the one commit-failure row; saw ${JSON.stringify(pill)}`);
    }
    await sleep(1000);
    const loads = (await pushes(app)).slice(mark).filter(p => p && p.kind === 'state' && p.tabId === tabId && String(p.url).startsWith('javascript:'));
    if (loads.length) {
        fail(`dropped javascript: text reached the tab: ${JSON.stringify(loads)}`);
    }
}

const SHIFT_DELETE = { key: 'Delete', code: 'Delete', keyCode: 46, modifiers: ['shift'] };

/** Chrome scope: PlacesUtils.history.fetch for `url` as `{ found, visits }`, or `{ error }`. */
const placesEntry = (app, url) => inChrome(app, `return (async () => {
    try {
        const { PlacesUtils } = ChromeUtils.importESModule('resource://gre/modules/PlacesUtils.sys.mjs');
        const info = await PlacesUtils.history.fetch(${JSON.stringify(url)}, { includeVisits: true });
        return JSON.stringify({ found: !!info, visits: info && info.visits ? info.visits.length : 0 });
    } catch (e) {
        return JSON.stringify({ error: String(e) });
    }
})();`).then(JSON.parse);

/** Chrome scope: a visit to each `[url, title]` in `visits`, and a bookmark on each in `bookmarks`. */
const seedPlaces = (app, visits, bookmarks = []) => inChrome(app, `return (async () => {
    try {
        const { PlacesUtils } = ChromeUtils.importESModule('resource://gre/modules/PlacesUtils.sys.mjs');
        for (const [url, title] of ${JSON.stringify(visits)}) {
            await PlacesUtils.history.insert({ url, title, visits: [{ date: new Date() }] });
        }
        for (const [url, title] of ${JSON.stringify(bookmarks)}) {
            await PlacesUtils.bookmarks.insert({ parentGuid: PlacesUtils.bookmarks.unfiledGuid, url, title });
        }
        return 'ok';
    } catch (e) {
        return 'error: ' + e;
    }
})();`);

/**
 * Presses ArrowDown until the highlighted row is the one captioned `url`;
 * returns the dropdown then. Each press waits for the highlight to move, so a
 * read taken before the re-render cannot cause a second press.
 */
async function highlightRow(app, url) {
    let view = await readRows(app);
    for (let i = 0; i < 14 && !view.rows.find(r => r.selected && r.caption === url); i++) {
        const was = highlightOf(view);
        await pressKey(app, ARROW_DOWN);
        view = await settle(() => readRows(app), v => highlightOf(v) !== was);
    }
    return view;
}

/** The failure notices in the dropdown, each with the caption of the row directly above it. */
const readNotices = app => app.evaluate(`JSON.stringify([...document.querySelectorAll('.pb-chrome-bar-dropdown .pb-chrome-bar-row.is-message')]
    .filter(n => !n.querySelector('.pb-chrome-bar-row-title'))
    .map(n => ({ text: n.textContent || '', above: ((n.previousElementSibling && n.previousElementSibling.querySelector('.pb-chrome-bar-row-caption')) || {}).textContent || '' })))`).then(JSON.parse);

/**
 * BAR-09: Shift+Delete removes a history row's page from Places and nothing
 * else. The seeded entries are read back first (the positive control); the
 * bookmark half proves a bookmarked page keeps its visits.
 */
async function shiftDel(ctx) {
    const { app, pages, plant, fail, note } = ctx;
    await sessionTab(ctx);
    const delMe = pages.url('/del-me');
    const keepMe = pages.url('/keep-me');
    const delFail = pages.url('/del-fail');
    const seeded = await seedPlaces(app, [[delMe, 'Delete Me Page'], [keepMe, 'Keep Me Page'], [delFail, 'Fail Me Page']], [[keepMe, 'Keep Me Page']]);
    const before = [await placesEntry(app, delMe), await placesEntry(app, keepMe), await placesEntry(app, delFail)];
    if (seeded !== 'ok' || !before.every(e => e.found && e.visits > 0)) {
        return fail(`${BROKEN} Places could not be seeded with visited /del-me, /keep-me and /del-fail (${String(seeded)}; ${JSON.stringify(before)})`);
    }
    if (plant === 'shift-del-bookmark') {
        const planted = await probe(app, `const w = get('AddressBar');
            w.removableRow = row => row.source === 'history' || row.source === 'bookmark';
            return true;`);
        if (planted === true) {
            note('PLANT shift-del-bookmark applied');
        }
    }
    const shows = (v, url, type) => v.rows.some(r => r.caption === url && r.type === type);
    const typeMePage = async () => {
        await typeInPill(app, '');
        await typeInPill(app, 'Me Page');
        return settle(() => readRows(app), v => shows(v, delMe, 'codicon-history') && shows(v, keepMe, 'codicon-star-full'), 8000);
    };

    let view = await typeMePage();
    if (!shows(view, delMe, 'codicon-history') || !shows(view, keepMe, 'codicon-star-full')) {
        return fail(`${BROKEN} typing "Me Page" did not show the /del-me history row and the /keep-me bookmark row; saw ${JSON.stringify(view.rows)}`);
    }
    view = await highlightRow(app, delMe);
    const at = view.rows.findIndex(r => r.caption === delMe);
    if (!view.rows[at]?.selected) {
        return fail(`${BROKEN} ArrowDown never highlighted the /del-me history row; saw ${JSON.stringify(view.rows)}`);
    }
    const expected = view.rows[at + 1] ?? view.rows[at - 1];
    await pressKey(app, SHIFT_DELETE);
    const after = await settle(() => readRows(app), v => !v.rows.some(r => r.caption === delMe), 5000);
    if (after.rows.some(r => r.caption === delMe)) {
        fail(`Shift+Delete on the highlighted history row left it in the dropdown; saw ${JSON.stringify(after.rows)}`);
    } else {
        const now = after.rows.find(r => r.selected);
        if (!now || now.caption !== expected?.caption || now.title !== expected?.title) {
            fail(`after the removal the highlight must move to ${JSON.stringify(expected && [expected.title, expected.caption])}; it is on ${JSON.stringify(now ?? null)}`);
        }
    }
    const gone = await settle(() => placesEntry(app, delMe), e => !e.found, 5000);
    if (gone.found) {
        fail(`Shift+Delete on the history row did not remove /del-me from Places: history.fetch still finds it (${JSON.stringify(gone)})`);
    }
    view = await typeMePage();
    if (view.rows.some(r => r.caption === delMe)) {
        fail(`re-typing "Me Page" still shows a row for the removed /del-me; saw ${JSON.stringify(view.rows)}`);
    }

    view = await highlightRow(app, keepMe);
    if (!view.rows.find(r => r.caption === keepMe)?.selected) {
        return fail(`${BROKEN} ArrowDown never highlighted the /keep-me bookmark row; saw ${JSON.stringify(view.rows)}`);
    }
    await pressKey(app, SHIFT_DELETE);
    await sleep(1000);
    const kept = await placesEntry(app, keepMe);
    if (!kept.found || kept.visits < 1) {
        fail(`Shift+Delete on a bookmark row removed the visits of a bookmarked page (/keep-me: ${JSON.stringify(kept)})`);
    }
    if (!(await readRows(app)).rows.some(r => r.caption === keepMe)) {
        fail('Shift+Delete on a bookmark row removed the row');
    }

    const subject = (await app.evaluate(appNameExpr)) || 'The browser';
    if (await probe(app, `get('ChromeStoreClient').removeHistoryEntry = async () => { throw new Error('stubbed rejection'); }; return true;`) !== true) {
        return fail(`${BROKEN} the client's removeHistoryEntry could not be stubbed to reject`);
    }
    try {
        await typeInPill(app, '');
        await typeInPill(app, 'Fail Me Page');
        await settle(() => readRows(app), v => shows(v, delFail, 'codicon-history'), 8000);
        view = await highlightRow(app, delFail);
        if (!view.rows.find(r => r.caption === delFail)?.selected) {
            return fail(`${BROKEN} ArrowDown never highlighted the /del-fail history row; saw ${JSON.stringify(view.rows)}`);
        }
        await pressKey(app, SHIFT_DELETE);
        const notices = await settle(() => readNotices(app), v => v.length > 0, 5000);
        const notice = notices.find(n => n.above === delFail);
        if (!notice || !notice.text.startsWith(subject) || !notice.text.includes("couldn't remove that page from your history")) {
            fail(`a failed removal must show, directly under the row, a notice starting with ${JSON.stringify(subject)} that says it couldn't remove the page; saw ${JSON.stringify(notices)}`);
        }
        if (!(await readRows(app)).rows.some(r => r.caption === delFail)) {
            fail('a failed removal must keep the row');
        }
    } finally {
        await probe(app, `delete get('ChromeStoreClient').removeHistoryEntry; return true;`);
    }
}

const ESCAPE = { key: 'Escape', code: 'Escape', keyCode: 27 };
const PILL_MENU_LABELS = ['Cut', 'Copy', 'Paste', 'Paste & Go', 'Select All'];

/** Chrome scope: the global clipboard's text ("" when it holds none), or `error: ...`. */
const clipboardText = app => inChrome(app, `try {
    const trans = Cc['@mozilla.org/widget/transferable;1'].createInstance(Ci.nsITransferable);
    trans.init(null);
    trans.addDataFlavor('text/plain');
    Services.clipboard.getData(trans, Services.clipboard.kGlobalClipboard);
    const data = {};
    try { trans.getTransferData('text/plain', data); } catch { return ''; }
    return String(data.value.QueryInterface(Ci.nsISupportsString).data);
} catch (e) {
    return 'error: ' + e;
}`);

/** Chrome scope: puts `text` on the global clipboard; null empties it. */
const setClipboard = (app, text) => inChrome(app, `try {
    ${text === null
        ? 'Services.clipboard.emptyClipboard(Services.clipboard.kGlobalClipboard);'
        : `Cc['@mozilla.org/widget/clipboardhelper;1'].getService(Ci.nsIClipboardHelper).copyString(${JSON.stringify(text)});`}
    return 'ok';
} catch (e) {
    return 'error: ' + e;
}`);

/** The visible .lm-Menu count, and the last one's items (collapsed separators dropped). */
const readPillMenu = app => app.evaluate(`JSON.stringify((() => {
    const menus = [...document.querySelectorAll('.lm-Menu')].filter(m => m.getClientRects().length > 0);
    const m = menus[menus.length - 1];
    const items = m ? [...m.querySelectorAll('.lm-Menu-item')].filter(i => !i.classList.contains('lm-mod-collapsed')).map(i => ({
        separator: i.getAttribute('data-type') === 'separator',
        label: (i.querySelector('.lm-Menu-itemLabel') || {}).textContent || '',
        disabled: i.classList.contains('lm-mod-disabled'),
        active: i.classList.contains('lm-mod-active'),
    })) : [];
    return { count: menus.length, items };
})())`).then(JSON.parse);

/** Sets the pill to `value` with `start..end` selected, then dispatches a right-click contextmenu on it. */
async function openPillMenuWith(app, value, start = value.length, end = start) {
    await typeInPill(app, value);
    const opened = await app.evaluate(`(() => {
        const input = document.querySelector('.pb-chrome-bar-input');
        if (!input) return false;
        input.focus();
        input.setSelectionRange(${start}, ${end});
        const r = input.getBoundingClientRect();
        input.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: r.left + 20, clientY: r.top + r.height / 2 }));
        return true;
    })()`);
    if (opened !== true) {
        throw new Error(`${BROKEN} the contextmenu could not be dispatched on the pill`);
    }
    return settle(() => readPillMenu(app), v => v.count === 1 && v.items.length > 0);
}

/** Moves the open menu's highlight to `label` with ArrowDown at the parent, then presses Enter there (trusted keys). */
async function chooseMenuItem(app, label) {
    let active = (await readPillMenu(app)).items.find(it => it.active)?.label ?? '';
    for (let i = 0; i < 8; i++) {
        const was = active;
        await pressKey(app, ARROW_DOWN);
        // Wait for the move, so a read taken before the re-render cannot cause a second press.
        const menu = await settle(() => readPillMenu(app), v => (v.items.find(it => it.active)?.label ?? '') !== was);
        active = menu.items.find(it => it.active)?.label ?? '';
        if (active === label) {
            await pressKey(app, ENTER);
            return true;
        }
    }
    return false;
}

const readCount = app => app.evaluate('window.__pbClipboardReads || 0');

/**
 * BAR-10: the pill's context menu. The clipboard is read only when Paste or
 * Paste & Go is chosen; a counter on the client's readClipboardText is the
 * observer, and Paste & Go's read is its positive control. The user's
 * clipboard text is saved first and put back afterwards.
 */
async function contextMenu(ctx) {
    const { app, pages, plant, fail, note } = ctx;
    const tabId = await sessionTab(ctx);
    const saved = await clipboardText(app);
    if (String(saved).startsWith('error: ')) {
        return fail(`${BROKEN} the global clipboard could not be read chrome-side (${saved})`);
    }
    const counted = await probe(app, `const c = get('ChromeStoreClient');
        window.__pbClipboardReads = 0;
        const original = Object.getPrototypeOf(c).readClipboardText.bind(c);
        c.readClipboardText = (...a) => { window.__pbClipboardReads += 1; return original(...a); };
        return true;`);
    if (counted !== true) {
        return fail(`${BROKEN} the client's readClipboardText could not be wrapped`);
    }
    try {
        if (plant === 'paste-reads-on-open') {
            const planted = await probe(app, `const w = get('AddressBar');
                w.openPillMenu = async function (anchor) { await this.store.readClipboardText(); return Object.getPrototypeOf(this).openPillMenu.call(this, anchor); };
                return true;`);
            if (planted === true) {
                note('PLANT paste-reads-on-open applied');
            }
        }
        let menu = await openPillMenuWith(app, '');
        const labels = menu.items.filter(i => !i.separator).map(i => i.label);
        const separators = menu.items.map((i, n) => i.separator ? n : -1).filter(n => n >= 0);
        if (menu.count !== 1 || JSON.stringify(labels) !== JSON.stringify(PILL_MENU_LABELS)
            || separators.length !== 1 || menu.items[separators[0] + 1]?.label !== 'Select All') {
            return fail(`a contextmenu on the pill must open one .lm-Menu reading ${PILL_MENU_LABELS.join(', ')} with one separator before Select All; saw ${JSON.stringify(menu)}`);
        }
        const state = Object.fromEntries(menu.items.filter(i => !i.separator).map(i => [i.label, !i.disabled]));
        if (state.Cut || state.Copy || state['Select All'] || !state.Paste || !state['Paste & Go']) {
            fail(`with an empty pill, Cut, Copy and Select All must be disabled and Paste and Paste & Go enabled; saw ${JSON.stringify(state)}`);
        }
        if (await readCount(app) !== 0) {
            fail(`clipboard read before a click: opening the menu called readClipboardText ${await readCount(app)} time(s)`);
        }
        await pressKey(app, ESCAPE);
        const closed = await settle(() => readSel(app), v => v && v.focused);
        if ((await readPillMenu(app)).count !== 0 || !closed?.focused) {
            fail(`Esc must close the menu and leave focus in the pill; saw ${JSON.stringify({ menu: await readPillMenu(app), pill: closed })}`);
        }

        menu = await openPillMenuWith(app, 'abcdef', 2, 4);
        const selectedState = Object.fromEntries(menu.items.filter(i => !i.separator).map(i => [i.label, !i.disabled]));
        if (!PILL_MENU_LABELS.every(l => selectedState[l])) {
            fail(`with "cd" selected in "abcdef", every item must be enabled; saw ${JSON.stringify(selectedState)}`);
        }
        await pressKey(app, ESCAPE);
        await settle(() => readPillMenu(app), v => v.count === 0);

        // Paste & Go: the positive control for the read counter.
        const pasted = pages.url('/pasted');
        await setClipboard(app, pasted.replace(/^http:\/\//, ''));
        const mark = (await pushes(app)).length;
        let getMark = pages.requests.length;
        await openPillMenuWith(app, '');
        if (!await chooseMenuItem(app, 'Paste & Go')) {
            return fail(`${BROKEN} Paste & Go could not be reached with ArrowDown in the pill menu`);
        }
        const got = await nextGet(pages, '/pasted', getMark);
        if (await readCount(app) !== 1) {
            fail(`Paste & Go must read the clipboard exactly once; readClipboardText ran ${await readCount(app)} time(s)`);
        }
        if (!got) {
            fail(`Paste & Go with ${JSON.stringify(pasted)} on the clipboard sent no GET on /pasted; pill ${JSON.stringify(await readPill(app))}`);
        } else if (await waitForPush(app, p => p && p.kind === 'state' && p.tabId === tabId && pathOf(p.url) === '/pasted' && !p.loading, { from: mark }) < 0) {
            fail('no loaded state push for the tab carried /pasted after Paste & Go');
        } else if (await settle(() => chromeActiveTabId(app), id => id === tabId) !== tabId) {
            fail(`after Paste & Go chrome's focus must be in the tab's page; it is on ${JSON.stringify(await chromeActiveTabId(app))}`);
        }

        // Paste inserts at the caret, as typing does, with no autofill.
        await setClipboard(app, 'xyz');
        await openPillMenuWith(app, 'ab');
        if (!await chooseMenuItem(app, 'Paste')) {
            return fail(`${BROKEN} Paste could not be reached with ArrowDown in the pill menu`);
        }
        const afterPaste = await settle(() => readSel(app), v => v && v.value === 'abxyz' && v.focused);
        if (afterPaste?.value !== 'abxyz' || !afterPaste.focused || afterPaste.start !== 5 || afterPaste.end !== 5) {
            fail(`Paste with "xyz" after "ab" must leave "abxyz", the caret at the end and focus in the pill; saw ${JSON.stringify(afterPaste)}`);
        }

        // Copy and Cut write the selection; the clipboard is set to something else first.
        await setClipboard(app, 'before copy');
        await openPillMenuWith(app, 'abcdef', 2, 4);
        if (!await chooseMenuItem(app, 'Copy')) {
            return fail(`${BROKEN} Copy could not be reached with ArrowDown in the pill menu`);
        }
        const copied = await settle(() => clipboardText(app), v => v === 'cd');
        const afterCopy = await settle(() => readSel(app), v => v && v.focused);
        if (copied !== 'cd' || afterCopy?.value !== 'abcdef' || !afterCopy.focused) {
            fail(`Copy of "cd" must put "cd" on the clipboard and leave "abcdef" with focus in the pill; clipboard ${JSON.stringify(copied)}, pill ${JSON.stringify(afterCopy)}`);
        }
        await setClipboard(app, 'before cut');
        await openPillMenuWith(app, 'abcdef', 2, 4);
        if (!await chooseMenuItem(app, 'Cut')) {
            return fail(`${BROKEN} Cut could not be reached with ArrowDown in the pill menu`);
        }
        const afterCut = await settle(() => readSel(app), v => v && v.value === 'abef' && v.focused);
        const cut = await clipboardText(app);
        if (afterCut?.value !== 'abef' || !afterCut.focused || cut !== 'cd') {
            fail(`Cut of "cd" must leave "abef" with focus in the pill and "cd" on the clipboard; pill ${JSON.stringify(afterCut)}, clipboard ${JSON.stringify(cut)}`);
        }

        // An empty clipboard: Paste & Go reads it and loads nothing.
        await setClipboard(app, null);
        const readsBefore = await readCount(app);
        getMark = pages.requests.length;
        const pushMark = (await pushes(app)).length;
        await openPillMenuWith(app, '');
        if (!await chooseMenuItem(app, 'Paste & Go')) {
            return fail(`${BROKEN} Paste & Go could not be reached with ArrowDown in the pill menu`);
        }
        await settle(() => readCount(app), n => n > readsBefore);
        await sleep(1500);
        const loads = pages.requests.slice(getMark).filter(r => !r.path.endsWith('/suggest'));
        const navigated = (await pushes(app)).slice(pushMark).filter(p => p && p.kind === 'state' && p.tabId === tabId && p.loading === true);
        if (await readCount(app) <= readsBefore) {
            fail(`${BROKEN} Paste & Go on an empty clipboard never read it, so its no-load result proves nothing`);
        } else if (loads.length || navigated.length) {
            fail(`Paste & Go with an empty clipboard loaded something: ${JSON.stringify({ loads: loads.map(r => r.path), navigated: navigated.length })}`);
        }

        // A read error shows the failure row.
        const subject = (await app.evaluate(appNameExpr)) || 'The browser';
        await probe(app, `get('ChromeStoreClient').readClipboardText = async () => { throw new Error('stubbed rejection'); }; return true;`);
        await openPillMenuWith(app, '');
        if (!await chooseMenuItem(app, 'Paste & Go')) {
            return fail(`${BROKEN} Paste & Go could not be reached with ArrowDown in the pill menu`);
        }
        const failed = await settle(() => readNotices(app), v => v.length > 0, 5000);
        if (!failed[0] || !failed[0].text.startsWith(subject) || !failed[0].text.includes("couldn't read the clipboard")) {
            fail(`a failed clipboard read must show one row starting with ${JSON.stringify(subject)} that says it couldn't read the clipboard; saw ${JSON.stringify(failed)}`);
        }
    } finally {
        await probe(app, `const c = get('ChromeStoreClient'); delete c.readClipboardText;
            const w = get('AddressBar'); delete w.openPillMenu; return true;`);
        await setClipboard(app, saved ? saved : null);
        await app.evaluate(`(() => { const i = document.querySelector('.pb-chrome-bar-input'); if (i) i.blur(); return true; })()`);
    }
}

/**
 * The page takes the focus the product hands it, including straight after
 * the overlay was hidden. Gecko cannot focus a hidden <browser>, and a
 * focused one that is hidden loses focus at the next refresh tick, so:
 *   - F6 in the pill with the suggestions dropdown open (the page hidden
 *     behind it) must end with the page focused: the focus has to reach
 *     chrome after the geometry that shows the page again;
 *   - a focused page navigated by the frontend keeps chrome's focus through
 *     each load, and no state push carries the about:blank placeholder that
 *     a browsing-context switch leaves for a moment, which the widget reads
 *     as "no page" and hides. (canGoBack is no signal here: it skips entries
 *     without user interaction, and these loads have none.)
 */
async function pageFocus(ctx) {
    const { app, pages, plant, fail, note } = ctx;
    const tabId = await sessionTab(ctx);
    const tabExpr = `get('WebTabChannel').widgetOf(${JSON.stringify(tabId)})`;
    if (plant === 'focus-before-show' && await probe(app, `${tabExpr}.focusPage = function () { this.channel.send({ kind: 'webTabFocus', tabId: this.tabId }); }; return true;`) === true) {
        note('PLANT focus-before-show applied');
    }
    try {
        if ((await modeState(app))?.mode !== 'address') {
            return fail(`${BROKEN} the pill is not in Address mode (${JSON.stringify(await modeState(app))})`);
        }
        await typeInPill(app, 'hello');
        const hidden = await settle(() => overlayVisibility(app, tabId), v => v === 'hidden');
        if (hidden !== 'hidden') {
            return fail(`${BROKEN} the open dropdown did not hide the page (its visibility is ${JSON.stringify(hidden)})`);
        }
        await pressKey(app, F6);
        if (await settle(() => chromeActiveTabId(app), id => id === tabId) !== tabId) {
            fail(`F6 in the pill with the dropdown open must give the page focus; chrome's focus is on ${JSON.stringify(await chromeActiveTabId(app) ?? null)}, the page is ${JSON.stringify(await overlayVisibility(app, tabId))}`);
        }
        await probe(app, `const bar = get('AddressBar'); bar.inputValue = bar.committedAddress; bar.update(); return true;`);

        const [first, ...hops] = ['/pf-1', '/pf-2', '/pf-3', '/pf-4'];
        let from = (await pushes(app)).length;
        await probe(app, `await ${tabExpr}.navigate(${JSON.stringify(pages.url(first))}); return true;`);
        if (await waitForPush(app, loadedAt(tabId, first), { from }) < 0) {
            return fail(`${BROKEN} no loaded state push arrived for ${first}`);
        }
        if (await focusOverlay(app, tabId) !== true) {
            return fail(`${BROKEN} the page could not be focused before the navigations`);
        }
        // A push asked for inside each switch, as a page retitled mid-switch would ask for one:
        // the overlay's own pagetitlechanged listener schedules it while the placeholder shows.
        if (await inChrome(app, `const o = overlayOf(${JSON.stringify(tabId)});
            window.__pbRetitleOnSwitch = e => { if (e.target === o) o.dispatchEvent(new Event('pagetitlechanged')); };
            window.addEventListener('DidChangeBrowserRemoteness', window.__pbRetitleOnSwitch);
            return !!o;`) !== true) {
            return fail(`${BROKEN} the browsing-context switch listener could not be installed chrome-side`);
        }
        if (plant === 'placeholder-push') {
            note('PLANT placeholder-push applied');
        }
        const mark = (await pushes(app)).length;
        for (const path of hops) {
            from = (await pushes(app)).length;
            await probe(app, `await ${tabExpr}.navigate(${JSON.stringify(pages.url(path))}); return true;`);
            if (plant === 'placeholder-push') {
                await app.evaluate(`(() => { window.dispatchEvent(new CustomEvent(${JSON.stringify(WEB_TAB_STATE_EVENT)}, { detail: { kind: 'state', tabId: ${JSON.stringify(tabId)}, url: 'about:blank', title: '', loading: true, canGoBack: false, canGoForward: false } })); return true; })()`);
            }
            if (await waitForPush(app, loadedAt(tabId, path), { from }) < 0) {
                return fail(`no loaded state push for the tab carried ${path}`);
            }
            if (await settle(() => chromeActiveTabId(app), id => id === tabId) !== tabId) {
                fail(`the focused page lost chrome's focus while it loaded ${path}; it is on ${JSON.stringify(await chromeActiveTabId(app) ?? null)}`);
                break;
            }
        }
        const states = (await pushes(app)).slice(mark).filter(p => p && p.kind === 'state' && p.tabId === tabId);
        const placeholders = states.filter(p => p.url === 'about:blank');
        if (!states.length) {
            fail(`${BROKEN} no state push was recorded for the tab across ${hops.length} navigations`);
        } else if (placeholders.length) {
            fail(`a page-to-page navigation pushed the placeholder of a browsing-context switch: ${placeholders.length} of ${states.length} state pushes carried about:blank (loading ${placeholders.map(p => p.loading).join(', ')})`);
        }
    } finally {
        await inChrome(app, `if (window.__pbRetitleOnSwitch) { window.removeEventListener('DidChangeBrowserRemoteness', window.__pbRetitleOnSwitch); delete window.__pbRetitleOnSwitch; } return true;`);
        await probe(app, `const tab = ${tabExpr}; if (tab) { delete tab.focusPage; }
            const bar = get('AddressBar'); bar.inputValue = bar.committedAddress; bar.update(); return true;`);
    }
}

/** The Theia frame's BiDi browsing context id. */
async function theiaContext(app) {
    const href = await app.evaluate('location.href');
    const found = (await app.contexts()).find(c => c.url === href);
    if (!found) {
        throw new Error(`${BROKEN} no BiDi context for the Theia frame at ${href}`);
    }
    return found.context;
}

/** The pill input's viewport box and the x of its text's left edge plus `chars` characters of its value. */
const pillGeometry = (app, chars = 0) => app.evaluate(`JSON.stringify((() => {
    const input = document.querySelector('.pb-chrome-bar-input');
    if (!input) return null;
    const r = input.getBoundingClientRect();
    const style = getComputedStyle(input);
    const ctx2d = document.createElement('canvas').getContext('2d');
    ctx2d.font = style.font;
    const textX = r.left + parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft);
    return { left: r.left, y: r.top + r.height / 2, textX, x: textX + ctx2d.measureText(input.value.slice(0, ${chars})).width };
})())`).then(JSON.parse);

/** Trusted pointer input on the Theia frame (BiDi), released afterwards. */
async function theiaPointer(app, actions) {
    const context = await theiaContext(app);
    await app.send('input.performActions', { context, actions: [{ type: 'pointer', id: 'pb-pill-mouse', parameters: { pointerType: 'mouse' }, actions }] });
    await app.send('input.releaseActions', { context });
}

const click = (x, y) => [
    { type: 'pointerMove', x: Math.round(x), y: Math.round(y) },
    { type: 'pointerDown', button: 0 },
    { type: 'pointerUp', button: 0 },
];

/**
 * Chrome scope: runs `body` with `tip`, one nsITextInputProcessor kept on the
 * shell window across calls, so a composition begun in one call is still the
 * same transaction's in the next. Returns 'ok' or the error text.
 */
const imeStep = (app, body) => app.evaluateIn(app.chrome, `(() => {
    try {
        const C = typeof Cc !== 'undefined' ? Cc : Components.classes;
        const I = typeof Ci !== 'undefined' ? Ci : Components.interfaces;
        if (!window.__pbImeTip) window.__pbImeTip = C['@mozilla.org/text-input-processor;1'].createInstance(I.nsITextInputProcessor);
        const tip = window.__pbImeTip;
        if (!tip.beginInputTransactionForTests(window)) return 'no input transaction';
        ${body}
        return 'ok';
    } catch (e) {
        return String(e);
    }
})()`);

const COMPOSED = 'かな';

async function selectIme(ctx) {
    const { app, pages, plant, fail, note, results } = ctx;
    if (!controlPassed(results, 'select-ime')) {
        return 'not-scored';
    }
    const tabId = await sessionTab(ctx);
    // Select-all: a press that gives the pill focus selects all its text (an earlier scenario may leave it empty).
    await typeInPill(app, 'select all of this');
    if (await focusOverlay(app, tabId) !== true) {
        return fail(`${BROKEN} the session tab's page could not be focused`);
    }
    const before = await pillGeometry(app, 4);
    if (!before) {
        return fail(`${BROKEN} no pill input to click`);
    }
    await theiaPointer(app, click(before.x, before.y));
    const first = await settle(() => readSel(app), v => v && v.focused && v.value && v.start === 0 && v.end === v.value.length);
    if (!first || !first.focused || !first.value || first.start !== 0 || first.end !== first.value.length) {
        return fail(`the first click on the pill must focus it and select its whole address; saw ${JSON.stringify(first)}`);
    }
    await theiaPointer(app, click(before.x, before.y));
    const second = await settle(() => readSel(app), v => v && v.start === v.end);
    if (!second || !second.focused || second.start !== second.end) {
        fail(`a second click inside the text must leave a collapsed caret; saw ${JSON.stringify(second)}`);
    }
    // A drag that starts on the focusing press keeps its own range.
    if (await focusOverlay(app, tabId) !== true) {
        return fail(`${BROKEN} the session tab's page could not be focused again`);
    }
    const value = (await readSel(app))?.value ?? '';
    const mid = await pillGeometry(app, Math.floor(value.length / 2));
    await theiaPointer(app, [
        { type: 'pointerMove', x: Math.round(mid.left + 1), y: Math.round(mid.y) },
        { type: 'pointerDown', button: 0 },
        { type: 'pointerMove', x: Math.round(mid.x), y: Math.round(mid.y), duration: 100 },
        { type: 'pointerUp', button: 0 },
    ]);
    const dragged = await settle(() => readSel(app), v => v && v.end > 0);
    if (!dragged || !dragged.focused || dragged.start !== 0 || !(dragged.end > 0 && dragged.end < dragged.value.length)) {
        fail(`a drag from the start to the middle on the focusing press must select 0 to the middle, not the whole value; saw ${JSON.stringify(dragged)}`);
    }

    // IME: nothing commits or queries while a composition is open.
    if (plant === 'ime-guard-off') {
        if (await probe(app, `get('AddressBar').composing = () => false; return true;`) === true) {
            note('PLANT ime-guard-off applied');
        }
    }
    try {
        await typeInPill(app, '');
        const begun = await imeStep(app, `tip.setPendingCompositionString(${JSON.stringify(COMPOSED)});
            tip.appendClauseToPendingComposition(${COMPOSED.length}, tip.ATTR_RAW_CLAUSE);
            tip.flushPendingComposition();`);
        if (begun !== 'ok') {
            return fail(`${BROKEN} the composition could not be begun through nsITextInputProcessor: ${begun}`);
        }
        const shown = await settle(() => readSel(app), v => v && v.value === COMPOSED);
        if (shown?.value !== COMPOSED) {
            return fail(`${BROKEN} the open composition never reached the pill (${JSON.stringify(shown)})`);
        }
        const mark = (await pushes(app)).length;
        const getMark = pages.requests.length;
        const entered = await imeStep(app, `const ev = new KeyboardEvent('', { key: 'Enter', code: 'Enter', keyCode: 13 });
            tip.keydown(ev);
            tip.keyup(ev);`);
        if (entered !== 'ok') {
            return fail(`${BROKEN} Enter could not be pressed during the composition: ${entered}`);
        }
        await sleep(1500);
        const loads = (await pushes(app)).slice(mark).filter(p => p && p.kind === 'state' && p.tabId === tabId && p.loading === true);
        const searched = pages.requests.slice(getMark).filter(r => r.path === '/one/search');
        const asked = suggestGets(pages, getMark);
        if (loads.length || searched.length) {
            fail(`committed during composition: Enter while composing gave ${loads.length} loading push(es) and ${searched.length} GET(s) on /one/search (${JSON.stringify(searched.map(r => r.search))})`);
        }
        if (asked.length) {
            fail(`queried during composition: ${JSON.stringify(asked.map(r => r.search))}`);
        }
        const commitMark = pages.requests.length;
        const committed = await imeStep(app, 'tip.commitComposition();');
        if (committed !== 'ok') {
            return fail(`${BROKEN} the composition could not be committed: ${committed}`);
        }
        // Positive control: the observer sees the one query that composition end runs.
        const query = await nextGet(pages, '/one/suggest', commitMark, r => queryOf(r) === COMPOSED, 5000);
        await sleep(800);
        const queries = suggestGets(pages, commitMark);
        if (!query || queries.length !== 1) {
            return fail(`composition end must run exactly one query for ${JSON.stringify(COMPOSED)}; saw ${queries.length} GET(s) on /one/suggest: ${JSON.stringify(queries.map(r => r.search))}`);
        }
        const pushMark = (await pushes(app)).length;
        const enterMark = pages.requests.length;
        await pressKey(app, ENTER);
        if (!await nextGet(pages, '/one/search', enterMark, r => queryOf(r) === COMPOSED)) {
            return fail(`Enter after the composition ended must search ${JSON.stringify(COMPOSED)}: no GET on /one/search with that q; pill ${JSON.stringify(await readPill(app))}`);
        }
        if (await waitForPush(app, p => p && p.kind === 'state' && p.tabId === tabId && pathOf(p.url) === '/one/search', { from: pushMark }) < 0) {
            fail(`${BROKEN} no state push for the tab followed the post-composition search, so the no-push check above saw nothing`);
        }
    } finally {
        await probe(app, `delete get('AddressBar').composing; return true;`);
        await inChrome(app, 'delete window.__pbImeTip; return true;');
    }
}

/**
 * The pill's value, selection, whether it has focus in a focused document,
 * whether its dropdown is open, and whether the Theia frame's active element
 * is still the one markActive recorded.
 */
const readDraftView = app => app.evaluate(`JSON.stringify((() => {
    const input = document.querySelector('.pb-chrome-bar-input');
    return input ? {
        value: input.value, start: input.selectionStart, end: input.selectionEnd,
        focused: document.hasFocus() && document.activeElement === input,
        expanded: input.getAttribute('aria-expanded') === 'true',
        sameActive: document.activeElement === window.__pbActiveMark,
    } : null;
})())`).then(JSON.parse);

/** Records the Theia frame's active element for readDraftView's sameActive. */
const markActive = app => app.evaluate('window.__pbActiveMark = document.activeElement; true');

/** The shell's current web tab's page url, or null. */
const currentTabUrl = app => probe(app, `return get('ApplicationShell').mainPanel.currentTitle?.owner?.url ?? null;`);

const DRAFT = 'draft text';

/** Opens `path` on localhost as a web tab and waits for its loaded push; returns its tab id. */
async function openLocalTab(app, pages, path) {
    const tabId = await openWebTab(app, localUrl(pages, path));
    if (await waitForPush(app, loadedAt(tabId, path)) < 0) {
        throw new Error(`${BROKEN} no loaded state push arrived for ${path}`);
    }
    return tabId;
}

/** Makes `tabId` current or throws a broken-instrument error naming `label`. */
async function showTab(app, tabId, label) {
    if (await makeCurrent(app, tabId) !== true) {
        throw new Error(`${BROKEN} the ${label} tab could not be made current`);
    }
}

async function drafts(ctx) {
    const { app, pages, plant, fail, note } = ctx;
    const urlA = localUrl(pages, '/dr-a');
    const urlA2 = localUrl(pages, '/dr-a2');
    const urlB = localUrl(pages, '/dr-b');
    const tabA = await openLocalTab(app, pages, '/dr-a');
    const tabB = await openLocalTab(app, pages, '/dr-b');
    if (plant === 'draft-lost') {
        if (await probe(app, `get('AddressBar').saveDraft = function () {}; return true;`) === true) {
            note('PLANT draft-lost applied');
        }
    }
    try {
        await showTab(app, tabA, '/dr-a');
        await typeInPill(app, DRAFT);
        await showTab(app, tabB, '/dr-b');
        const onB = await settle(() => readDraftView(app), v => v?.value === urlB);
        if (onB?.value !== urlB) {
            return fail(`switching to B must show B's address ${urlB}; the pill shows ${JSON.stringify(onB?.value)}`);
        }
        // Focus in B's page and none in the pill, so a restore that focused the pill would show.
        await app.evaluate(`(() => { const i = document.querySelector('.pb-chrome-bar-input'); if (i) i.blur(); return true; })()`);
        if (await focusOverlay(app, tabB) !== true) {
            return fail(`${BROKEN} B's page could not be focused`);
        }
        await markActive(app);
        await showTab(app, tabA, '/dr-a');
        const back = await settle(() => readDraftView(app), v => v?.value === DRAFT);
        if (back?.value !== DRAFT) {
            return fail(`expected the draft text ${JSON.stringify(DRAFT)} in A's pill after switching back; it shows ${JSON.stringify(back?.value)}`);
        }
        if (back.start !== DRAFT.length || back.end !== DRAFT.length || back.expanded || back.focused || !back.sameActive) {
            fail(`the restored draft must have the caret at its end, no dropdown, and the switch must neither focus the pill nor move the Theia frame's active element; saw ${JSON.stringify(back)}`);
        }

        // A page-initiated navigation keeps the draft.
        const overlay = await pollFor(async () => (await app.contexts()).find(c => c.url === urlA) ?? null, 10000, 'the /dr-a overlay context').catch(() => null);
        if (!overlay) {
            return fail(`${BROKEN} no BiDi context for A's page at ${urlA}`);
        }
        const mark = (await pushes(app)).length;
        await app.evaluateIn(overlay.context, `location.href = '/dr-a2'; true`);
        if (await waitForPush(app, loadedAt(tabA, '/dr-a2'), { from: mark }) < 0) {
            return fail(`${BROKEN} A's own navigation to /dr-a2 pushed no loaded state, so the draft was never tested against a push`);
        }
        await sleep(300);
        const kept = await readDraftView(app);
        if (kept?.value !== DRAFT) {
            fail(`expected the draft text ${JSON.stringify(DRAFT)} to survive A's own navigation to /dr-a2; the pill shows ${JSON.stringify(kept?.value)}`);
        }

        // Enter commits the draft as a search; the commit is recorded, nothing loads (it would change A's site).
        const wrapped = await probe(app, `const w = get('AddressBar');
            window.__pbCommitted = [];
            w.__pbOpenCommitted = w.openCommittedUrl;
            w.openCommittedUrl = async url => { window.__pbCommitted.push(url); };
            return true;`);
        if (wrapped !== true) {
            return fail(`${BROKEN} the address bar's openCommittedUrl could not be wrapped`);
        }
        try {
            if (await focusTheiaFrame(app) !== true || await app.evaluate(`(() => { const i = document.querySelector('.pb-chrome-bar-input'); i.focus(); return document.activeElement === i && i.value === ${JSON.stringify(DRAFT)}; })()`) !== true) {
                return fail(`${BROKEN} the pill could not be focused with the draft in it`);
            }
            await pressKey(app, ENTER);
            const got = await settle(() => committedUrls(app), v => v.length > 0, 8000);
            const q = got.length === 1 ? new URL(got[0]).searchParams.get('q') : null;
            if (got.length !== 1 || !got[0].startsWith(`${pages.origin}/one/search`) || q !== DRAFT) {
                fail(`Enter on the draft must commit it as a search on /one/search with q ${JSON.stringify(DRAFT)}; the commit recorded ${JSON.stringify(got)}`);
            }
        } finally {
            await probe(app, `const w = get('AddressBar');
                if (w.__pbOpenCommitted) { w.openCommittedUrl = w.__pbOpenCommitted; delete w.__pbOpenCommitted; }
                return true;`);
        }
        await showTab(app, tabB, '/dr-b');
        await showTab(app, tabA, '/dr-a');
        const afterCommit = await settle(() => readDraftView(app), v => v?.value === urlA2);
        if (afterCommit?.value !== urlA2) {
            fail(`after the commit, switching away and back must show A's address ${urlA2}; the pill shows ${JSON.stringify(afterCommit?.value)}`);
        }

        // Esc's restore step drops the draft.
        await showTab(app, tabB, '/dr-b');
        await typeInPill(app, 'beta typed');
        if (!(await settle(() => readDraftView(app), v => v?.expanded)).expanded) {
            return fail(`${BROKEN} typing in B's pill opened no dropdown, so the first Esc would not be the close step`);
        }
        await pressKey(app, ESCAPE);
        await settle(() => readDraftView(app), v => v && !v.expanded);
        await pressKey(app, ESCAPE);
        const restored = await settle(() => readDraftView(app), v => v?.value === urlB);
        if (restored?.value !== urlB) {
            return fail(`${BROKEN} two Esc presses did not restore B's address (${JSON.stringify(restored)})`);
        }
        await showTab(app, tabA, '/dr-a');
        await showTab(app, tabB, '/dr-b');
        const afterEsc = await settle(() => readDraftView(app), v => v?.value === urlB);
        if (afterEsc?.value !== urlB) {
            fail(`after Esc restored B's address, switching away and back must show ${urlB}; the pill shows ${JSON.stringify(afterEsc?.value)}`);
        }

        // Closing a tab with a draft: the next current tab shows its own address.
        const tabC = await openLocalTab(app, pages, '/dr-c');
        await showTab(app, tabC, '/dr-c');
        await typeInPill(app, 'gone');
        await probe(app, `get('WebTabChannel').widgetOf(${JSON.stringify(tabC)}).close(); return true;`);
        const next = await settle(async () => ({ url: await currentTabUrl(app), view: await readDraftView(app) }),
            v => v.url && v.view?.value === v.url);
        if (!next.url || next.view?.value !== next.url) {
            fail(`after closing C with a draft, the pill must show the next current tab's address ${JSON.stringify(next.url)}; it shows ${JSON.stringify(next.view?.value)}`);
        }
    } finally {
        await probe(app, `delete get('AddressBar').saveDraft; return true;`);
    }
}

// ---- Phase 30 (SMODE-01..03): the address bar's modes ----

/** The pill's mode button or chip as the user sees it, with the input's placeholder, aria-label and value. */
const readMode = app => app.evaluate(`JSON.stringify((() => {
    const pill = document.querySelector('.pb-chrome-bar-pill');
    const input = document.querySelector('.pb-chrome-bar-input');
    if (!pill || !input) return null;
    // Phase 31 (31-UI-SPEC): the identity box sits at the pill's left end, before the mode button.
    const first = [...pill.children].find(child => !child.matches('.pb-identity')) ?? null;
    const button = pill.querySelector('.pb-address-mode');
    return {
        firstIsMode: !!first && (first.matches('.pb-address-mode') || first.matches('.pb-address-mode-chip')),
        chip: !!pill.querySelector('.pb-address-mode-chip'),
        label: pill.querySelector('.pb-address-mode-label')?.textContent ?? null,
        reset: !!pill.querySelector('.pb-address-mode-reset'),
        expanded: button?.getAttribute('aria-expanded') === 'true',
        placeholder: input.placeholder,
        aria: input.getAttribute('aria-label'),
        value: input.value,
    };
})())`).then(JSON.parse);

/** The open modes menu: whether the heading comes first, its text, and each item's label and settings gear; null when closed. */
const readModesMenu = app => app.evaluate(`JSON.stringify((() => {
    const menu = document.querySelector('.pb-chrome-bar-dropdown.pb-address-modes');
    if (!menu) return null;
    const heading = menu.firstElementChild;
    return {
        headingFirst: !!heading && heading.classList.contains('pb-address-modes-heading'),
        heading: heading ? heading.textContent : null,
        items: [...menu.querySelectorAll('[role=menuitem]')].map(item => ({
            label: item.querySelector('.pb-address-modes-label')?.textContent ?? '',
            gear: !!item.querySelector('.codicon-settings-gear'),
            highlighted: item.classList.contains('is-highlighted'),
        })),
    };
})())`).then(JSON.parse);

/** The viewport centre of the first element matching `selector` in the Theia frame, or null. */
const centreOf = (app, selector) => app.evaluate(`JSON.stringify((() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
})())`).then(JSON.parse);

/** A trusted click (BiDi pointer input) on the first element matching `selector`; throws a broken instrument when it is absent. */
async function clickOn(app, selector) {
    const at = await centreOf(app, selector);
    if (!at) {
        throw new Error(`${BROKEN} nothing to click at ${selector}`);
    }
    await theiaPointer(app, click(at.x, at.y));
}

/**
 * Opens the modes menu with a trusted click on the mode button; returns the
 * menu, or null when none opened. One more click when the first opened
 * nothing: a page focus still landing from an earlier activation blurs the
 * button, and the blur closes the menu it just opened.
 */
async function openModesMenu(app) {
    for (let attempt = 0; attempt < 2; attempt++) {
        await clickOn(app, '.pb-address-mode');
        const menu = await settle(() => readModesMenu(app), v => !!v);
        if (menu) {
            return menu;
        }
    }
    return null;
}

/** Dispatches a primary mousedown (plus `init`) on the modes-menu item whose label is `label`; false when absent. */
const modeItemMouseDown = (app, label, init = {}) => app.evaluate(`(() => {
    const item = [...document.querySelectorAll('.pb-address-modes [role=menuitem]')]
        .find(i => i.querySelector('.pb-address-modes-label')?.textContent === ${JSON.stringify(label)});
    if (!item) return false;
    item.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, ...${JSON.stringify(init)} }));
    return true;
})()`);

/** Picks the engine mode named `name` from the menu (opened here); throws a broken instrument when it cannot. */
async function pickEngineMode(app, name) {
    if (!await openModesMenu(app)) {
        throw new Error(`${BROKEN} the modes menu did not open, so ${name}'s mode could not be picked`);
    }
    // The menu re-reads chrome's engines as it opens; their items arrive with the reply.
    await settle(() => readModesMenu(app), v => !!v && v.items.some(i => i.label === name));
    if (await modeItemMouseDown(app, name) !== true) {
        throw new Error(`${BROKEN} the modes menu has no item named ${name}`);
    }
    const view = await settle(() => readMode(app), v => v?.label === name);
    if (view?.label !== name) {
        throw new Error(`${BROKEN} picking ${name} from the menu did not show its chip (${JSON.stringify(view)})`);
    }
}

/** What the menu must list, derived now: the contributed top modes, chrome's engines in reply order, the contributed local modes. */
const expectedModeLabels = app => probe(app, `const bar = get('AddressBar');
    const list = await get('ChromeStoreClient').listSearchEngines();
    return {
        top: bar.contributedIn('top').map(m => m.label),
        engines: (list?.engines ?? []).map(e => e.name),
        local: bar.contributedIn('local').map(m => m.label),
    };`);

/** Puts the address bar back in its default mode with the menu closed, after a scenario that may have left another. */
const restoreDefaultMode = app => probe(app, `const bar = get('AddressBar');
    delete bar.modeEngine; delete bar.onModeReset; delete bar.resetMode;
    bar.modesOpen = false; bar.mode = bar.defaultMode(); bar.update();
    return true;`);

async function modesDropdown(ctx) {
    const { app, pages, plant, fail, note } = ctx;
    if (!controlPassed(ctx.results, 'modes-dropdown')) {
        return 'not-scored';
    }
    await sessionTab(ctx);
    try {
        const view = await readMode(app);
        if (!view?.firstIsMode) {
            fail(`the mode button must be the pill's first child after the identity box; saw ${JSON.stringify(view)}`);
        }
        const want = await expectedModeLabels(app);
        if (!Array.isArray(want?.engines) || !want.engines.includes(ENGINE_TWO)) {
            return fail(`${BROKEN} chrome's engine list does not name ${ENGINE_TWO} (${JSON.stringify(want)})`);
        }
        const expected = [...want.top, ...want.engines, ...want.local];
        const opened = await openModesMenu(app);
        if (!opened) {
            return fail('a trusted click on the mode button opened no .pb-address-modes menu');
        }
        // The menu re-reads chrome's engines as it opens; the items settle on that reply.
        const menu = await settle(() => readModesMenu(app), v => !!v && JSON.stringify(v.items.slice(0, -1).map(i => i.label)) === JSON.stringify(expected));
        if (!menu) {
            return fail('the modes menu closed before its items settled');
        }
        const labels = menu.items.map(i => i.label);
        const last = menu.items[menu.items.length - 1];
        if (!menu.headingFirst || menu.heading !== ONE_OFF_LABEL) {
            fail(`the modes menu must start with the heading ${JSON.stringify(ONE_OFF_LABEL)}; saw ${JSON.stringify(menu.heading)}`);
        }
        if (JSON.stringify(labels.slice(0, -1)) !== JSON.stringify(expected) || !last?.gear || menu.items.slice(0, -1).some(i => i.gear)) {
            fail(`the modes menu must list ${JSON.stringify(expected)} then the Search Settings item (codicon-settings-gear); saw ${JSON.stringify(menu.items)}`);
        }
        if (plant === 'engine-mode-ignored') {
            if (await probe(app, `get('AddressBar').modeEngine = () => undefined; return true;`) === true) {
                note('PLANT engine-mode-ignored applied');
            }
        }
        if (await modeItemMouseDown(app, ENGINE_TWO) !== true) {
            return fail(`${BROKEN} the modes menu has no item named ${ENGINE_TWO}`);
        }
        const chip = await settle(() => readMode(app), v => v?.label === ENGINE_TWO && v.placeholder === `Search with ${ENGINE_TWO}`);
        if (chip?.label !== ENGINE_TWO) {
            fail(`picking ${ENGINE_TWO} must show its chip labelled ${JSON.stringify(ENGINE_TWO)}; saw ${JSON.stringify(chip)}`);
        }
        if (chip?.placeholder !== `Search with ${ENGINE_TWO}` || chip?.aria !== `Search with ${ENGINE_TWO}`) {
            fail(`in ${ENGINE_TWO}'s mode the placeholder and aria-label must read ${JSON.stringify(`Search with ${ENGINE_TWO}`)}; saw ${JSON.stringify(chip)}`);
        }
        await typeInPill(app, 'hello');
        const getMark = pages.requests.length;
        await pressKey(app, ENTER);
        const got = await nextGet(pages, '/two/search', getMark, r => queryOf(r) === 'hello');
        if (!got) {
            fail(`no GET on /two/search with q "hello" after Enter in ${ENGINE_TWO}'s mode; requests since the mark: ${JSON.stringify(pages.requests.slice(getMark).map(r => r.path + r.search))}`);
        }
        const one = pages.requests.slice(getMark).filter(r => r.path === '/one/search');
        if (one.length) {
            fail(`Enter in ${ENGINE_TWO}'s mode searched the default engine too: ${JSON.stringify(one.map(r => r.path + r.search))}`);
        }
    } finally {
        await restoreDefaultMode(app);
    }
}

/** The Search Settings item's preference, derived from the setting's own declaration. */
const SEARCH_SETTINGS_PREF = sourceConst('theia/extensions/chrome-bar/src/browser/chrome-bar-preferences.ts', 'DEFAULT_SEARCH_ENGINE_PREFERENCE');

/** The main area's current widget id and the Settings search filter. */
const settingsView = app => probe(app, `const owner = get('ApplicationShell').mainPanel.currentTitle?.owner;
    return { id: owner?.id ?? null, search: document.querySelector('#preference-searchbar')?.value ?? null };`);

/** A key record for a letter, as pressKey takes it. */
const letterKey = letter => ({ key: letter.toLowerCase(), code: `Key${letter.toUpperCase()}`, keyCode: letter.toUpperCase().charCodeAt(0) });

async function modeChip(ctx) {
    const { app, plant, fail, note } = ctx;
    await sessionTab(ctx);
    try {
        const plain = await readMode(app);
        if (!plain || plain.chip || plain.label !== null || plain.reset) {
            fail(`in Browsing the Address form must show no chip, no label and no x; saw ${JSON.stringify(plain)}`);
        }
        await pickEngineMode(app, ENGINE_TWO);
        const chip = await readMode(app);
        if (!chip?.chip || chip.label !== ENGINE_TWO || !chip.reset) {
            fail(`${ENGINE_TWO}'s mode must show a chip labelled ${JSON.stringify(ENGINE_TWO)} with an x; saw ${JSON.stringify(chip)}`);
        }
        if (plant === 'reset-ignored') {
            if (await probe(app, `get('AddressBar').onModeReset = function () {}; return true;`) === true) {
                note('PLANT reset-ignored applied');
            }
        }
        await typeInPill(app, 'hello');
        await clickOn(app, '.pb-address-mode-reset');
        const back = await settle(() => readMode(app), v => v && !v.chip && v.value === 'hello');
        if (!back || back.chip || back.value !== 'hello') {
            fail(`the x did not return to the default mode with the text kept; saw ${JSON.stringify(back)}`);
        } else {
            const rows = await settle(() => readRows(app), v => v.rows[0]?.caption === HEURISTIC_CAPTION);
            if (rows.rows[0]?.caption !== HEURISTIC_CAPTION) {
                fail(`after the x the query must re-run in the default mode, its heuristic row reading ${JSON.stringify(HEURISTIC_CAPTION)}; saw ${JSON.stringify(rows.rows)}`);
            }
        }
        if (plant === 'reset-ignored') {
            await restoreDefaultMode(app);
        }

        // Access letters: the probe engines share their first letter (with any built-in engine that starts with it),
        // so pressing it once per item up to Probe Engine Two, then Enter, picks it by cycling.
        const menu = await openModesMenu(app)
            && await settle(() => readModesMenu(app), v => !!v && v.items.some(i => i.label === ENGINE_TWO));
        if (!menu) {
            return fail(`${BROKEN} the modes menu did not open for the access-letter step`);
        }
        const letter = ENGINE_TWO.slice(0, 1);
        const shared = menu.items.filter(i => i.label.slice(0, 1).toLowerCase() === letter.toLowerCase()).map(i => i.label);
        const presses = shared.indexOf(ENGINE_TWO) + 1;
        if (presses < 2) {
            return fail(`${BROKEN} the menu's items starting with ${letter} are ${JSON.stringify(shared)}, so no press sequence cycles to ${ENGINE_TWO}`);
        }
        for (let i = 0; i < presses; i++) {
            await pressKey(app, letterKey(letter));
        }
        await pressKey(app, ENTER);
        const lettered = await settle(() => readMode(app), v => v?.label === ENGINE_TWO);
        if (lettered?.label !== ENGINE_TWO) {
            fail(`pressing ${letter} ${presses} times (items ${JSON.stringify(shared)}) then Enter in the modes menu must pick ${ENGINE_TWO}; the chip reads ${JSON.stringify(lettered?.label)}`);
        }

        // Search Settings opens the default-engine setting and closes the menu.
        if (!await openModesMenu(app)) {
            return fail(`${BROKEN} the modes menu did not open for the Search Settings step`);
        }
        const chose = await app.evaluate(`(() => {
            const item = [...document.querySelectorAll('.pb-address-modes [role=menuitem]')].find(i => i.querySelector('.codicon-settings-gear'));
            if (!item) return false;
            item.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
            return true;
        })()`);
        if (chose !== true) {
            return fail('the modes menu has no Search Settings item (codicon-settings-gear)');
        }
        const settings = await settle(() => settingsView(app), v => v?.id === 'settings_widget' && v.search === SEARCH_SETTINGS_PREF, 10000);
        if (settings?.id !== 'settings_widget' || settings.search !== SEARCH_SETTINGS_PREF) {
            fail(`Search Settings must make Settings current, searching ${SEARCH_SETTINGS_PREF}; saw ${JSON.stringify(settings)}`);
        }
        if (await readModesMenu(app)) {
            fail('the modes menu stayed open after Search Settings');
        }
    } finally {
        await restoreDefaultMode(app);
    }
}

/** The AddressBar's active mode and its default for the current PowerBrowser mode, read now. */
const modeState = app => probe(app, `const bar = get('AddressBar'); return { mode: bar.mode, default: bar.defaultMode() };`);

/** A trusted click on the mode-toggle segment named `name`. */
async function clickSegment(app, name) {
    const at = await app.evaluate(`JSON.stringify((() => {
        const seg = [...document.querySelectorAll('.pb-chrome-bar-toggle .pb-chrome-bar-segment')].find(b => b.textContent === ${JSON.stringify(name)});
        if (!seg) return null;
        const r = seg.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    })())`).then(JSON.parse);
    if (!at) {
        throw new Error(`${BROKEN} no mode-toggle segment named ${name}`);
    }
    await theiaPointer(app, click(at.x, at.y));
}

const bodyMode = app => app.evaluate(`document.body.dataset.pbMode ?? null`);

async function modeLifetime(ctx) {
    const { app, pages, plant, fail, note } = ctx;
    const tabId = await sessionTab(ctx);
    const backToDefault = async label => {
        const state = await settle(() => modeState(app), v => v && v.mode === v.default);
        if (!state || state.mode !== state.default) {
            fail(`mode did not return to the default after ${label}: it is ${JSON.stringify(state?.mode)}, the default ${JSON.stringify(state?.default)}`);
        }
        return state;
    };
    const otherTab = await openLocalTab(app, pages, '/lt-b');
    await showTab(app, tabId, '/start');
    if (plant === 'mode-sticks') {
        if (await probe(app, `get('AddressBar').resetMode = function () {}; return true;`) === true) {
            note('PLANT mode-sticks applied');
        }
    }
    try {
        // Enter commits.
        await pickEngineMode(app, ENGINE_TWO);
        await typeInPill(app, 'hello');
        const getMark = pages.requests.length;
        await pressKey(app, ENTER);
        if (!await nextGet(pages, '/two/search', getMark, r => queryOf(r) === 'hello')) {
            return fail(`${BROKEN} Enter in ${ENGINE_TWO}'s mode loaded no /two/search, so nothing was committed`);
        }
        await backToDefault('Enter');

        // The second Esc restores the address.
        await pickEngineMode(app, ENGINE_TWO);
        await typeInPill(app, 'hello again');
        if (!(await settle(() => readDraftView(app), v => v?.expanded))?.expanded) {
            return fail(`${BROKEN} typing in ${ENGINE_TWO}'s mode opened no dropdown, so the first Esc would not be the close step`);
        }
        await pressKey(app, ESCAPE);
        await settle(() => readDraftView(app), v => v && !v.expanded);
        await pressKey(app, ESCAPE);
        const address = await currentTabUrl(app);
        const restored = await settle(() => readDraftView(app), v => v?.value === address);
        if (restored?.value !== address) {
            fail(`${BROKEN} two Esc presses did not restore the address ${JSON.stringify(address)} (${JSON.stringify(restored)})`);
        }
        await backToDefault('the second Esc');

        // A tab change.
        await pickEngineMode(app, ENGINE_TWO);
        await showTab(app, otherTab, '/lt-b');
        await backToDefault('a tab change');
        await showTab(app, tabId, '/start');

        // A PowerBrowser-mode change, there and back.
        await pickEngineMode(app, ENGINE_TWO);
        await clickSegment(app, 'Organising');
        if (await settle(() => bodyMode(app), v => v === 'organising') !== 'organising') {
            return fail(`${BROKEN} the Organising segment did not switch the PowerBrowser mode`);
        }
        await backToDefault('switching to Organising');
        await pickEngineMode(app, ENGINE_TWO);
        await clickSegment(app, 'Browsing');
        if (await settle(() => bodyMode(app), v => v === 'browsing') !== 'browsing') {
            return fail(`${BROKEN} the Browsing segment did not switch the PowerBrowser mode back`);
        }
        await backToDefault('switching back to Browsing');
    } finally {
        await restoreDefaultMode(app);
        if (await bodyMode(app) !== 'browsing') {
            await clickSegment(app, 'Browsing').catch(() => undefined);
        }
    }
}

/** The places rows of the open dropdown whose caption is one of `urls`, in order. */
const seededRowsOf = (view, urls) => view.rows.filter(r => urls.includes(r.caption));

/** Chrome scope: bookmarks on `[url, title, dateAdded ms]` and visits `[url, title, date ms]`, as given. */
const seedDatedPlaces = (app, bookmarks, visits) => inChrome(app, `return (async () => {
    try {
        const { PlacesUtils } = ChromeUtils.importESModule('resource://gre/modules/PlacesUtils.sys.mjs');
        for (const [url, title, at] of ${JSON.stringify(bookmarks)}) {
            await PlacesUtils.bookmarks.insert({ parentGuid: PlacesUtils.bookmarks.unfiledGuid, url, title, dateAdded: new Date(at) });
        }
        for (const [url, title, at] of ${JSON.stringify(visits)}) {
            await PlacesUtils.history.insert({ url, title, visits: [{ date: new Date(at) }] });
        }
        return 'ok';
    } catch (e) {
        return 'error: ' + e;
    }
})();`);

/**
 * SMODE-01, Bookmarks and History, through the searchPlaces kind's restrict
 * field. Two bookmarks (/lm-b1, then /lm-b2 newer) and two visits (/lm-b1,
 * then the history-only /lm-h newer) are seeded chrome-side, newer than
 * anything else in the session. Bookmarks on focus lists /lm-b2 then /lm-b1
 * and never /lm-h; History lists /lm-h then /lm-b1 (the positive control that
 * /lm-h is a real Places row) and never the unvisited /lm-b2; each list has
 * at most 10 rows and no highlight. Typing narrows each within its source.
 * Shift+Delete on the highlighted /lm-h row in History removes it from Places
 * and from the next query.
 */
async function bookmarksAndHistory(ctx) {
    const { app, pages, plant, fail, note } = ctx;
    const [b1, b2, h] = ['/lm-b1', '/lm-b2', '/lm-h'].map(path => localUrl(pages, path));
    const seeded = [b1, b2, h];
    // Settle any visit the Tabs part's loads are still recording, so the seeded visits are the newest.
    await sleep(1500);
    const now = Date.now();
    const seed = await seedDatedPlaces(app,
        [[b1, 'Local Book One', now + 60000], [b2, 'Local Book Two', now + 120000]],
        [[b1, 'Local Book One', now - 1000], [h, 'Local History Only', now - 500]]);
    if (seed !== 'ok') {
        return fail(`${BROKEN} the bookmarks and visits could not be seeded chrome-side (${seed})`);
    }
    if (!(await placesEntry(app, h)).found) {
        return fail(`${BROKEN} the seeded /lm-h visit is not in Places`);
    }
    if (plant === 'restrict-dropped') {
        if (await probe(app, `const store = get('ChromeStoreClient');
            const searchPlaces = Object.getPrototypeOf(store).searchPlaces;
            store.searchPlaces = function (text, limit) { return searchPlaces.call(this, text, limit); };
            return true;`) === true) {
            note('PLANT restrict-dropped applied');
        }
    }

    await pickLocalMode(app, 'bookmarks');
    const books = await settle(() => readRows(app), v => seededRowsOf(v, seeded).length >= 2);
    const bookUrls = seededRowsOf(books, seeded).map(r => r.caption);
    if (JSON.stringify(bookUrls) !== JSON.stringify([b2, b1])) {
        fail(`Bookmarks on focus: expected the seeded bookmarks newest first (/lm-b2, /lm-b1) and not the history-only /lm-h; saw ${JSON.stringify(books.rows.map(r => r.caption))}`);
    }
    if (books.rows.length > 10 || books.rows.some(r => r.selected)) {
        fail(`the Bookmarks zero-query list must hold at most 10 rows with none highlighted; saw ${JSON.stringify(books.rows)}`);
    }
    await typeInPill(app, 'Book Two');
    const bookTwo = await settle(() => readRows(app), v => v.rows.some(r => r.title === 'Book Two'));
    const narrowed = bookTwo.rows.filter(r => r.type === 'codicon-star-full').map(r => r.caption);
    if (JSON.stringify(narrowed) !== JSON.stringify([b2])) {
        fail(`typing "Book Two" in Bookmarks must leave only /lm-b2; saw ${JSON.stringify(bookTwo.rows)}`);
    }

    // Cleared first: a picked mode keeps typed text, and History's list on focus is the zero-query one.
    await typeInPill(app, '');
    await restoreDefaultMode(app);
    await pickLocalMode(app, 'history');
    const hist = await settle(() => readRows(app), v => seededRowsOf(v, seeded).length >= 2);
    const histUrls = seededRowsOf(hist, seeded).map(r => r.caption);
    if (JSON.stringify(histUrls) !== JSON.stringify([h, b1])) {
        fail(`History on focus must list the seeded visits newest first (/lm-h, /lm-b1) and not the unvisited /lm-b2; saw ${JSON.stringify(hist.rows.map(r => r.caption))}`);
    }
    if (hist.rows.length > 10 || hist.rows.some(r => r.selected)) {
        fail(`the History zero-query list must hold at most 10 rows with none highlighted; saw ${JSON.stringify(hist.rows)}`);
    }
    await typeInPill(app, 'History Only');
    const only = await settle(() => readRows(app), v => v.rows[0]?.caption === h && v.rows[0].selected);
    const placesOnly = only.rows.filter(r => r.type === 'codicon-history' || r.type === 'codicon-star-full').map(r => r.caption);
    if (JSON.stringify(placesOnly) !== JSON.stringify([h]) || !only.rows[0]?.selected) {
        return fail(`typing "History Only" in History must leave only /lm-h, highlighted; saw ${JSON.stringify(only.rows)}`);
    }
    await pressKey(app, SHIFT_DELETE);
    const gone = await settle(() => readRows(app), v => !v.rows.some(r => r.caption === h));
    if (gone.rows.some(r => r.caption === h) || (await placesEntry(app, h)).found) {
        fail(`Shift+Delete on the /lm-h history row in History must remove it from the list and from Places; rows ${JSON.stringify(gone.rows)}`);
    }
    await typeInPill(app, '');
    await typeInPill(app, 'History Only');
    const again = await settle(() => readRows(app), v => v.rows.some(r => r.title === 'History Only'));
    if (again.rows.some(r => r.caption === h)) {
        fail(`the next History query still lists the removed /lm-h; saw ${JSON.stringify(again.rows)}`);
    }
}

/** The Actions mode's category, derived from the command declarations. */
const COMMAND_CATEGORY = sourceConst('theia/extensions/chrome-bar/src/browser/chrome-bar-commands.ts', 'CHROME_BAR_COMMAND_CATEGORY');

/** Derived now from the page realm's CommandRegistry: the labels of the visible, enabled commands in the category, and of every command in it. */
const categoryLabels = app => probe(app, `const registry = get('CommandRegistry');
    const inCategory = registry.commands.filter(c => c.category === ${JSON.stringify(COMMAND_CATEGORY)} && c.label);
    const owner = get('ApplicationShell').mainPanel.currentTitle?.owner;
    return {
        listed: inCategory.filter(c => registry.isVisible(c.id) && registry.isEnabled(c.id)).map(c => c.label),
        all: inCategory.map(c => c.label),
        current: owner ? { tabId: owner.tabId ?? null, url: owner.url ?? null, canGoBack: owner.canGoBack ?? null } : null,
    };`);

/**
 * SMODE-01, Actions (D-11). With a fresh web tab current (no back history),
 * the Actions list on focus equals, as a set, the labels of the visible and
 * enabled commands in the derived category, with New Tab among them and
 * Forward absent (the disabled control), and nothing from outside the category.
 * Typing "new" and Enter opens a new tab, which becomes current.
 */
async function actionsMode(ctx) {
    const { app, pages, plant, fail, note } = ctx;
    const tabId = await openLocalTab(app, pages, '/lm-act');
    await showTab(app, tabId, '/lm-act');
    if (plant === 'actions-unfiltered') {
        if (await probe(app, `const m = get('ActionsAddressBarMode');
            m.provide = async () => m.commands.commands.filter(c => c.label)
                .map(c => ({ key: 'action:' + c.id, source: 'action', title: c.label, caption: '', url: '', run: () => m.commands.executeCommand(c.id) }));
            return true;`) === true) {
            note('PLANT actions-unfiltered applied');
        }
    }
    if (plant === 'phantom-history' && await inChrome(app, `const o = overlayOf(${JSON.stringify(tabId)}); if (!o) return false;
        // The WR-05 defect's state as seen live: the page entry marked interacted, an about:blank appended after it, then a state push.
        const sh = o.browsingContext.sessionHistory;
        const e = sh.createEntry();
        e.URI = Services.io.newURI('about:blank');
        e.triggeringPrincipal = Services.scriptSecurityManager.getSystemPrincipal();
        sh.getEntryAtIndex(0).hasUserInteraction = true;
        sh.addEntry(e);
        o.dispatchEvent(new Event('pagetitlechanged'));
        return o.canGoBack;`) === true) {
        note('PLANT phantom-history applied');
    }
    // Back and Forward are the disabled controls: a tab opened on one page has nothing behind or ahead of it.
    // WR-05: after a PowerBrowser-mode round trip (mode-lifetime runs first) a fresh tab used to report canGoBack.
    const want = await settle(() => categoryLabels(app), v => !!v && !v.listed.includes('Forward') && !v.listed.includes('Back'));
    if (!want?.listed.includes('New Tab') || !want.all.includes('Forward') || !want.all.includes('Back')) {
        return fail(`${BROKEN} the ${COMMAND_CATEGORY} commands must include an enabled New Tab, a Forward and a Back; derived ${JSON.stringify(want)}`);
    }
    if (want.listed.includes('Back') || want.current?.canGoBack !== false) {
        return fail(`a tab opened on one page reports canGoBack (${JSON.stringify(want.current)}): Back is enabled with no page behind it`);
    }
    if (want.listed.includes('Forward')) {
        return fail(`a tab opened on one page enables Forward; derived ${JSON.stringify(want)}`);
    }
    await restoreDefaultMode(app);
    await pickLocalMode(app, 'actions');
    const view = await settle(() => readRows(app), v => v.rows.filter(r => r.title).length >= want.listed.length);
    const titles = view.rows.map(r => r.title).filter(Boolean);
    const outside = titles.filter(t => !want.all.includes(t));
    if (outside.length) {
        fail(`Actions listed a command outside the ${COMMAND_CATEGORY} category: ${JSON.stringify(outside.slice(0, 5))}${outside.length > 5 ? ` and ${outside.length - 5} more` : ''}`);
    }
    if (JSON.stringify([...titles].sort()) !== JSON.stringify([...want.listed].sort())) {
        fail(`Actions must list exactly the visible, enabled ${COMMAND_CATEGORY} commands ${JSON.stringify(want.listed)}; saw ${JSON.stringify(titles.slice(0, 10))}`);
    }
    await typeInPill(app, 'new');
    const typed = await settle(() => readRows(app), v => v.rows.some(r => r.title === 'New Tab' && r.selected));
    if (!typed.rows.some(r => r.title === 'New Tab' && r.selected)) {
        return fail(`typing "new" in Actions must highlight New Tab; saw ${JSON.stringify(typed.rows)}`);
    }
    await pressKey(app, ENTER);
    const opened = await settle(() => mainTabId(app), id => !!id && id !== tabId, 10000);
    if (!opened || opened === tabId) {
        fail(`Enter on the New Tab action must open a new tab and make it current; the current tab is ${JSON.stringify(opened)}`);
    }
}

/** The open-tab rows in the dropdown, in order. */
const tabRowsOf = view => view.rows.filter(r => r.type === 'codicon-browser');

/** The label of the contributed mode `id` (top or local group), read from the AddressBar's own contributions; null when not contributed. */
const localModeLabel = (app, id) => probe(app, `const bar = get('AddressBar');
    return [...bar.contributedIn('top'), ...bar.contributedIn('local')].find(m => m.id === ${JSON.stringify(id)})?.label ?? null;`);

/** Picks the contributed local mode `id` from the menu (opened here); throws a broken instrument when it cannot. */
async function pickLocalMode(app, id) {
    const label = await localModeLabel(app, id);
    if (!label) {
        throw new Error(`${BROKEN} no ${id} mode is contributed, so it cannot be picked`);
    }
    if (!await openModesMenu(app) || await modeItemMouseDown(app, label) !== true) {
        throw new Error(`${BROKEN} the modes menu has no item named ${label}`);
    }
    const view = await settle(() => readMode(app), v => v?.label === label);
    if (view?.label !== label) {
        throw new Error(`${BROKEN} picking ${label} from the menu did not show its chip (${JSON.stringify(view)})`);
    }
    return label;
}

/** Derived now from the shell: the urls of the open web tabs with a page other than the current one, and the current one's. */
const otherTabs = app => probe(app, `const shell = get('ApplicationShell');
    const current = shell.mainPanel.currentTitle?.owner;
    const tabs = shell.getWidgets('main').filter(w => typeof w.tabId === 'string' && w.hasPage);
    return { current: current?.url ?? null, others: tabs.filter(w => w !== current).map(w => ({ url: w.url, title: w.title.label })) };`);

const NO_TAB_TEXT = 'zz no such tab';

/**
 * SMODE-01, local modes. Tabs: with web tabs on localhost /sw-a, /sw-b and
 * /dr-c activated in that order, the Tabs mode lists on focus every other
 * open web tab (derived from the shell), with /sw-b then /sw-a first and no
 * row highlighted, and never the current tab. Text no tab matches shows "No
 * matching tabs." and the trailing search row, highlighted, and sends no
 * search until it is chosen; "Alpha" leaves only rows matching it, the
 * scenario's /sw-a first and highlighted, and Enter makes that very tab
 * current (by its widget, so a second /sw-a tab from switch-to-tab is not
 * taken) with no loading push. Enter on the search row then GETs /one/search.
 */
async function localModes(ctx) {
    const { app, pages, plant, fail, note } = ctx;
    if (!controlPassed(ctx.results, 'local-modes')) {
        return 'not-scored';
    }
    const urlA = localUrl(pages, '/sw-a');
    const urlB = localUrl(pages, '/sw-b');
    const tabA = await openLocalTab(app, pages, '/sw-a');
    const tabB = await openLocalTab(app, pages, '/sw-b');
    const tabC = await openLocalTab(app, pages, '/dr-c');
    await showTab(app, tabA, '/sw-a');
    await showTab(app, tabB, '/sw-b');
    await showTab(app, tabC, '/dr-c');
    if (plant === 'tabs-lists-active') {
        const planted = await probe(app, `const m = get('TabsAddressBarMode');
            const shell = get('ApplicationShell');
            const provide = Object.getPrototypeOf(m).provide;
            m.provide = async function (text, token) {
                const cur = shell.mainPanel.currentTitle?.owner;
                const rows = await provide.call(this, text, token);
                return cur && cur.hasPage ? [{ key: 'tab:' + cur.id, source: 'tab', title: cur.title.label, caption: cur.url, url: cur.url, widgetId: cur.id }, ...rows] : rows;
            };
            return true;`);
        if (planted === true) {
            note('PLANT tabs-lists-active applied');
        }
    }
    try {
        // Focus: the zero-query list.
        await pickLocalMode(app, 'tabs');
        const want = await otherTabs(app);
        const zero = await settle(() => readRows(app), v => tabRowsOf(v).length >= want.others.length);
        const listed = tabRowsOf(zero).map(r => r.caption);
        const count = (list, url) => list.filter(u => u === url).length;
        if (count(listed, want.current) > count(want.others.map(t => t.url), want.current)) {
            fail(`the active tab is listed: Tabs on focus showed the current tab ${JSON.stringify(want.current)}; rows ${JSON.stringify(listed)}`);
        }
        if (JSON.stringify(listed.slice(0, 2)) !== JSON.stringify([urlB, urlA])) {
            fail(`Tabs on focus must list the tabs most recently used first, /sw-b then /sw-a (activated /sw-a, /sw-b, /dr-c); saw ${JSON.stringify(listed)}`);
        }
        if (JSON.stringify([...listed].sort()) !== JSON.stringify(want.others.map(t => t.url).sort())) {
            fail(`Tabs on focus must list every other open web tab ${JSON.stringify(want.others.map(t => t.url))}; saw ${JSON.stringify(listed)}`);
        }
        if (zero.rows.some(r => r.selected)) {
            fail(`the zero-query list must have no row highlighted; saw ${JSON.stringify(zero.rows)}`);
        }

        // No match: the message and the highlighted search row; nothing is searched until it is chosen.
        const typedMark = pages.requests.length;
        await typeInPill(app, NO_TAB_TEXT);
        const none = await settle(() => readRows(app), v => v.rows.some(r => r.selected && r.title === NO_TAB_TEXT));
        const notices = await readNotices(app);
        const searchRow = none.rows.find(r => r.title === NO_TAB_TEXT);
        if (tabRowsOf(none).length || !notices.some(n => n.text === 'No matching tabs.')) {
            fail(`typing ${JSON.stringify(NO_TAB_TEXT)} in Tabs must show "No matching tabs." and no tab row; saw ${JSON.stringify(none.rows)}, notices ${JSON.stringify(notices)}`);
        }
        if (!searchRow?.selected || searchRow.caption !== HEURISTIC_CAPTION) {
            fail(`with no matching tab the trailing search row (${JSON.stringify(NO_TAB_TEXT)}, ${JSON.stringify(HEURISTIC_CAPTION)}) must show, highlighted; saw ${JSON.stringify(none.rows)}`);
        }
        const typedGets = () => pages.requests.slice(typedMark).filter(r => r.path === '/one/search' && queryOf(r) === NO_TAB_TEXT).length;
        const sentWhileTyping = typedGets();

        // Filter: only matching rows, the scenario's /sw-a first and highlighted.
        await typeInPill(app, 'Alpha');
        const alpha = await settle(() => readRows(app), v => tabRowsOf(v)[0]?.caption === urlA && v.rows.some(r => r.title === 'Alpha'));
        const alphaRows = tabRowsOf(alpha);
        const wantAlpha = want.others.filter(t => `${t.title} ${t.url}`.toLowerCase().includes('alpha')).length;
        if (alphaRows[0]?.caption !== urlA || !alphaRows[0]?.selected || alphaRows.length !== wantAlpha
            || alphaRows.some(r => !`${r.title} ${r.caption}`.toLowerCase().includes('alpha'))) {
            fail(`typing "Alpha" in Tabs must leave the ${wantAlpha} matching tab row(s), /sw-a first and highlighted; saw ${JSON.stringify(alpha.rows)}`);
        }
        const last = alpha.rows[alpha.rows.length - 1];
        if (last?.title !== 'Alpha' || last.caption !== HEURISTIC_CAPTION || last.selected) {
            fail(`the Tabs list must end with the search row for "Alpha" (${JSON.stringify(HEURISTIC_CAPTION)}), not highlighted while a tab matches; saw ${JSON.stringify(last)}`);
        }
        const mark = (await pushes(app)).length;
        await pressKey(app, ENTER);
        const current = await settle(() => mainTabId(app), id => id === tabA);
        if (current !== tabA) {
            fail(`Enter on the /sw-a row must make the scenario's own /sw-a tab current; the current tab is ${JSON.stringify(current)} (A ${tabA})`);
        }
        await sleep(1500);
        const loads = (await pushes(app)).slice(mark).filter(p => p && p.kind === 'state' && p.loading === true && p.tabId === tabA);
        if (loads.length) {
            fail(`switching from a Tabs row loaded the tab: ${loads.length} loading push(es) for /sw-a`);
        }

        // The search row, chosen, searches with the default engine (the positive control for "nothing while typing").
        await pickLocalMode(app, 'tabs');
        await typeInPill(app, NO_TAB_TEXT);
        await settle(() => readRows(app), v => v.rows.some(r => r.selected && r.title === NO_TAB_TEXT));
        const enterMark = pages.requests.length;
        await pressKey(app, ENTER);
        if (!await nextGet(pages, '/one/search', enterMark, r => queryOf(r) === NO_TAB_TEXT)) {
            fail(`Enter on the trailing search row must GET /one/search with q ${JSON.stringify(NO_TAB_TEXT)}`);
        } else if (sentWhileTyping) {
            fail(`typing in Tabs sent ${sentWhileTyping} search(es) before the search row was chosen`);
        }

        await bookmarksAndHistory(ctx);
        await actionsMode(ctx);
    } finally {
        await probe(app, `delete get('ActionsAddressBarMode').provide; return true;`);
        await probe(app, `delete get('TabsAddressBarMode').provide; return true;`);
        await probe(app, `delete get('ChromeStoreClient').searchPlaces; return true;`);
        await restoreDefaultMode(app);
    }
}

/** The fixture's one launch configuration, so the debug provider has a pick (30-RESEARCH Open Question 2). */
const LAUNCH_NAME = 'Probe Launch';

/**
 * Pitfall 7: a temp workspace opened once per session. The Theia frame is
 * reloaded on its location.hash, so the page realm's recorders are installed
 * again and the session's web tab is forgotten (later scenarios open their
 * own). Plants must be applied after this returns: the reload starts a fresh
 * container.
 */
async function openWorkspace(ctx) {
    const { app, shared } = ctx;
    if (shared.workspace) {
        return shared.workspace;
    }
    const dir = mkdtempSync(join(tmpdir(), 'pb-cc-ws-'));
    shared.cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
    writeFileSync(join(dir, 'README.md'), '# Probe workspace\n');
    mkdirSync(join(dir, 'src'));
    writeFileSync(join(dir, 'src', 'main.py'), 'print("probe")\n');
    mkdirSync(join(dir, '.theia'));
    writeFileSync(join(dir, '.theia', 'launch.json'), JSON.stringify({
        version: '0.2.0',
        configurations: [{ type: 'node', request: 'launch', name: LAUNCH_NAME, program: '${workspaceFolder}/src/main.py' }],
    }, null, 4));
    await app.evaluate(`(() => { window.location.hash = ${JSON.stringify(dir)}; window.location.reload(); return true; })()`).catch(() => null);
    await sleep(3000);
    try {
        await pollFor(() => app.evaluate(`(() => {
            try {
                ${GET_BY_NAME}
                const c = window.theia.container;
                return __getByName(c, 'FrontendApplicationStateService').state === 'ready' && __getByName(c, 'WorkspaceService').opened;
            } catch (e) { return false; }
        })()`), 120000, 'the fixture workspace');
    } catch {
        throw new Error(`${BROKEN} the fixture workspace ${dir} did not open after the reload`);
    }
    await installPushRecorder(app);
    await installFireRecorder(app);
    shared.tabId = undefined;
    shared.workspace = dir;
    return dir;
}

/** The result dropdown's Command-centre rows in order: group headers and pick rows (message picks included), the mode's own message rows apart. */
const readCcRows = app => app.evaluate(`JSON.stringify((() => {
    const dd = document.querySelector('.pb-chrome-bar-dropdown:not(.pb-address-modes)');
    if (!dd) return { open: false, rows: [], messages: [], footer: null };
    const rows = [...dd.querySelectorAll('.pb-chrome-bar-row:not(.is-shimmer)')]
        .filter(r => r.classList.contains('is-group') || r.querySelector('.pb-chrome-bar-row-title'))
        .map(r => r.classList.contains('is-group')
            ? { group: true, text: r.textContent || '' }
            : {
                group: false,
                text: r.querySelector('.pb-chrome-bar-row-title').textContent || '',
                selected: r.getAttribute('aria-selected') === 'true',
                message: r.classList.contains('is-message'),
                badges: [...r.querySelectorAll('.pb-chrome-bar-row-badge')].map(b => b.textContent),
                icons: [...r.querySelectorAll('.pb-chrome-bar-row-title .codicon')].map(i => i.className),
                height: r.getBoundingClientRect().height,
            });
    const messages = [...dd.querySelectorAll('.pb-chrome-bar-row.is-message')].filter(r => !r.querySelector('.pb-chrome-bar-row-title')).map(r => r.textContent);
    return { open: true, rows, messages, footer: (dd.querySelector('.pb-chrome-bar-dropdown-footer') || {}).textContent ?? null };
})())`).then(JSON.parse);

/** The centred stock quick input when it shows (a non-zero rect), with its input's value; null when hidden. */
const readQuickInput = app => app.evaluate(`JSON.stringify((() => {
    const w = [...document.querySelectorAll('.quick-input-widget')].find(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
    return w ? { value: (w.querySelector('input') || {}).value ?? null } : null;
})())`).then(JSON.parse);

/** The shell's panels, its current widget's editor file name, and whether the pill input has focus. */
const shellState = app => probe(app, `const shell = get('ApplicationShell');
    const w = shell.currentWidget;
    return {
        left: shell.isExpanded('left'),
        bottom: shell.isExpanded('bottom'),
        current: w && w.editor && w.editor.uri ? w.editor.uri.path.base : (w ? w.id : null),
        pillActive: document.activeElement === document.querySelector('.pb-chrome-bar-input'),
    };`);

/** Presses ArrowDown until the selected Command-centre row's text is `text` (at most 40 presses); returns the last view. */
async function highlightPick(app, text) {
    let view = await readCcRows(app);
    for (let i = 0; i < 40 && !view.rows.some(r => r.selected && r.text === text); i++) {
        const was = view.rows.findIndex(r => r.selected);
        await pressKey(app, ARROW_DOWN);
        view = await settle(() => readCcRows(app), v => v.rows.findIndex(r => r.selected) !== was);
    }
    return view;
}

/** Enters Command centre from the default mode through the menu, with the text cleared. */
async function enterCommandCentre(app) {
    return enterMode(app, 'command-centre');
}

/**
 * The provider the registry selects for `prefix + filter` (which must be the
 * one registered at `prefix`), its own getPicks(filter) as group/pick texts
 * with labels through LabelParser, and the rows the pill renders, read in the
 * same probe.
 */
const picksAndRows = (app, prefix, filter) => probe(app, `const reg = get('QuickAccessRegistry');
    const parser = get('LabelParser');
    const d = reg.getQuickAccessProvider(${JSON.stringify(prefix + filter)});
    if (!d || d.prefix !== ${JSON.stringify(prefix)}) return { error: 'the registry selected ' + (d ? JSON.stringify(d.prefix) : 'no provider') };
    const token = { isCancellationRequested: false, onCancellationRequested: () => ({ dispose() {} }) };
    const picks = await d.getInstance().getPicks(${JSON.stringify(filter.trim())}, token);
    const want = picks.map(p => p.type === 'separator' ? 'group:' + (p.label ?? '') : 'pick:' + parser.parse(p.label).filter(x => typeof x === 'string').join(''));
    const dd = document.querySelector('.pb-chrome-bar-dropdown:not(.pb-address-modes)');
    const got = dd ? [...dd.querySelectorAll('.pb-chrome-bar-row:not(.is-shimmer)')]
        .filter(r => r.classList.contains('is-group') || r.querySelector('.pb-chrome-bar-row-title'))
        .map(r => r.classList.contains('is-group') ? 'group:' + r.textContent : 'pick:' + r.querySelector('.pb-chrome-bar-row-title').textContent) : [];
    return { want, got, placeholder: d.placeholder ?? null };`);

const sameList = v => !!v && !v.error && JSON.stringify(v.want) === JSON.stringify(v.got);

/** The prefixes the page realm's registry lists, derived now. */
const registryPrefixes = app => probe(app, `return get('QuickAccessRegistry').getQuickAccessProviders().map(d => d.prefix);`);

/** Hides Theia's quick input if it shows (after a plant opened it). */
const hideQuickInput = app => probe(app, `const q = get('QuickInputService'); if (q.hide) q.hide(); return true;`);

/**
 * SMODE-05: Theia's picks under the pill, run on Enter. In the fixture
 * workspace, "view exp" lists Explorer and Enter opens the left panel with no
 * centred quick input; "READ" lists a group header and README.md (file search
 * reaches the workspace), and Enter opens it as the current editor.
 */
async function commandCentre(ctx) {
    const { app, plant, fail, note } = ctx;
    if (!controlPassed(ctx.results, 'command-centre')) {
        return 'not-scored';
    }
    await openWorkspace(ctx);
    if (plant === 'picks-dropped' && await probe(app, `get('CommandCentreAddressBarMode').provide = async () => []; return true;`) === true) {
        note('PLANT picks-dropped applied');
    }
    if (plant === 'help-row-executes' && await probe(app, `get('CommandCentreAddressBarMode').acceptHelp = pick => pick.execute(); return true;`) === true) {
        note('PLANT help-row-executes applied');
    }
    try {
        await enterCommandCentre(app);
        await probe(app, `await get('ApplicationShell').collapsePanel('left'); return true;`);
        if ((await settle(() => shellState(app), v => !v.left)).left) {
            return fail(`${BROKEN} the left panel could not be collapsed before the Explorer step`);
        }
        await typeInPill(app, 'view exp');
        const views = await settle(() => readCcRows(app), v => v.rows.some(r => !r.group && r.text === 'Explorer'));
        if (!views.rows.some(r => !r.group && r.text === 'Explorer')) {
            return fail(`no Explorer row under the pill for "view exp" in Command centre; saw ${JSON.stringify(views)}`);
        }
        if (!(await highlightPick(app, 'Explorer')).rows.some(r => r.selected && r.text === 'Explorer')) {
            return fail(`${BROKEN} the Explorer row could not be highlighted with ArrowDown`);
        }
        await pressKey(app, ENTER);
        const opened = await settle(() => shellState(app), v => v.left);
        if (!opened.left) {
            fail(`Enter on the Explorer pick did not open the left panel; shell ${JSON.stringify(opened)}`);
        }
        const centred = await readQuickInput(app);
        if (centred) {
            fail(`the centred quick input showed after the Explorer pick (${JSON.stringify(centred)}); Command centre runs picks under the pill`);
        }

        await enterCommandCentre(app);
        await typeInPill(app, 'READ');
        const files = await settle(() => readCcRows(app), v => v.rows.some(r => r.group) && v.rows.some(r => !r.group && r.text === 'README.md'));
        if (!files.rows.some(r => r.group) || !files.rows.some(r => !r.group && r.text === 'README.md')) {
            return fail(`no group header and README.md row for "READ": file search did not reach the workspace; saw ${JSON.stringify(files)}`);
        }
        if (!(await highlightPick(app, 'README.md')).rows.some(r => r.selected && r.text === 'README.md')) {
            return fail(`${BROKEN} the README.md row could not be highlighted with ArrowDown`);
        }
        await pressKey(app, ENTER);
        const editor = await settle(() => shellState(app), v => v.current === 'README.md', 15000);
        if (editor.current !== 'README.md') {
            fail(`Enter on the README.md pick must make an editor on README.md the shell's current widget; shell ${JSON.stringify(editor)}`);
        }

        // Every prefix the registry lists renders that provider's own picks, in order (D-21, D-24).
        const prefixes = await registryPrefixes(app);
        if (!Array.isArray(prefixes) || !prefixes.includes('') || !prefixes.includes('>')) {
            return fail(`${BROKEN} the registry's prefixes could not be derived (${JSON.stringify(prefixes)})`);
        }
        await enterCommandCentre(app);
        for (const prefix of prefixes) {
            const filter = prefix === '' ? 'READ' : prefix === '>' ? 'toggle' : '';
            await typeInPill(app, prefix + filter);
            const seen = await settle(() => picksAndRows(app, prefix, filter), sameList, 15000);
            if (!sameList(seen)) {
                fail(`for ${JSON.stringify(prefix + filter)} the rows under the pill must equal the provider's own picks in order; ${JSON.stringify(seen).slice(0, 600)}`);
            } else if (!seen.want.length) {
                fail(`${BROKEN} the provider for ${JSON.stringify(prefix + filter)} returned no pick, so the comparison proves nothing`);
            }
            if (prefix === 'debug ' && !seen?.got?.includes(`pick:${LAUNCH_NAME}`)) {
                fail(`"debug " must list the fixture's launch configuration ${JSON.stringify(LAUNCH_NAME)}; saw ${JSON.stringify(seen?.got)}`);
            }
        }

        // A ? help row puts its prefix in the pill and lists that provider's picks; it never opens the centred quick input.
        await typeInPill(app, '?');
        await settle(() => readCcRows(app), v => v.rows.some(r => r.text === '>'));
        if (!(await highlightPick(app, '>')).rows.some(r => r.selected && r.text === '>')) {
            return fail(`${BROKEN} the > help row could not be highlighted after typing ?`);
        }
        await pressKey(app, ENTER);
        const helped = await settle(async () => ({ pill: await readPill(app), rows: await readCcRows(app), quick: await readQuickInput(app) }),
            v => !!v.quick || (v.pill.value === '>' && v.rows.rows.filter(r => !r.group).length > 10), 10000);
        if (helped.quick) {
            fail(`a help row opened the centred quick input (${JSON.stringify(helped.quick)}); it must put its prefix in the pill`);
            await hideQuickInput(app);
            await enterCommandCentre(app);
        } else if (helped.pill.value !== '>' || helped.rows.rows.filter(r => !r.group).length <= 10) {
            fail(`choosing the > help row must put > in the pill and list commands; pill ${JSON.stringify(helped.pill.value)}, ${helped.rows.rows.length} rows`);
        }

        // The # pick without execute is a message row the highlight skips.
        await typeInPill(app, '#');
        const symbols = await settle(() => readCcRows(app), v => v.rows.some(r => r.message));
        await pressKey(app, ARROW_DOWN);
        const skipped = await readCcRows(app);
        if (!symbols.rows.some(r => r.message) || skipped.rows.some(r => r.selected)) {
            fail(`the # pick without execute must render as a message row that ArrowDown skips; before ${JSON.stringify(symbols.rows)}, after ${JSON.stringify(skipped.rows)}`);
        }

        // The zero-query list is the default provider's picks for empty text, and the placeholder is its own (D-25).
        await enterCommandCentre(app);
        const zero = await settle(() => picksAndRows(app, '', ''), v => sameList(v) && (v.want.length > 0 || !!v.got), 10000);
        if (!sameList(zero)) {
            fail(`the zero-query list must equal the default provider's picks for empty text; ${JSON.stringify(zero).slice(0, 400)}`);
        }
        const label = await localModeLabel(app, 'command-centre');
        const shown = await readMode(app);
        if (!zero?.placeholder || shown?.placeholder !== zero.placeholder || shown?.aria !== label) {
            fail(`Command centre's placeholder must be the default provider's own ${JSON.stringify(zero?.placeholder)} and its aria-label ${JSON.stringify(label)}; saw ${JSON.stringify(shown)}`);
        }

        // A > command runs from the pill, and focus does not stay in the pill afterwards (30-RESEARCH A5).
        const bottomBefore = (await shellState(app)).bottom;
        await typeInPill(app, '>toggle');
        const toggles = await settle(() => readCcRows(app), v => v.rows.some(r => /Toggle Bottom Panel$/.test(r.text)));
        const toggle = toggles.rows.find(r => /Toggle Bottom Panel$/.test(r.text));
        if (!toggle || !(await highlightPick(app, toggle.text)).rows.some(r => r.selected && r.text === toggle.text)) {
            return fail(`${BROKEN} no bottom-panel toggle row could be highlighted for ">toggle"; saw ${JSON.stringify(toggles.rows.map(r => r.text))}`);
        }
        await pressKey(app, ENTER);
        const toggled = await settle(() => shellState(app), v => v.bottom !== bottomBefore && !v.pillActive);
        if (toggled.bottom === bottomBefore) {
            fail(`Enter on ${JSON.stringify(toggle.text)} must toggle the bottom panel (was ${bottomBefore}); shell ${JSON.stringify(toggled)}`);
        }
        if (toggled.pillActive) {
            fail(`after ${JSON.stringify(toggle.text)} focus stayed in the pill; it must return to the shell's current widget`);
        }
        if (await readQuickInput(app)) {
            fail('the centred quick input showed after a > command run from the pill');
        }
    } finally {
        await probe(app, `const m = get('CommandCentreAddressBarMode'); delete m.provide; delete m.acceptHelp; return true;`);
        await hideQuickInput(app);
        await restoreDefaultMode(app);
    }
}

/**
 * D-22, D-23: text with no Theia descriptor (@, :12) opens Theia's centred
 * quick input holding it, the pill keeps the text, and Esc closes it.
 */
async function commandCentreHandoff(ctx) {
    const { app, plant, fail, note } = ctx;
    if (!controlPassed(ctx.results, 'command-centre-handoff')) {
        return 'not-scored';
    }
    await openWorkspace(ctx);
    if (plant === 'handoff-off' && await probe(app, `get('CommandCentreAddressBarMode').handsOff = () => false; return true;`) === true) {
        note('PLANT handoff-off applied');
    }
    try {
        for (const text of ['@', ':12']) {
            await enterCommandCentre(app);
            await typeInPill(app, text, { focused: false });
            const quick = await settle(() => readQuickInput(app), v => !!v && v.value === text);
            if (!quick) {
                fail(`${text} did not open Theia's picker: no centred quick input showed for ${JSON.stringify(text)}`);
                continue;
            }
            if (quick.value !== text) {
                fail(`Theia's picker opened on ${JSON.stringify(quick.value)}, not the pill's ${JSON.stringify(text)}`);
            }
            const pill = await readPill(app);
            if (pill.value !== text) {
                fail(`the pill must keep ${JSON.stringify(text)} while Theia's picker shows; it holds ${JSON.stringify(pill.value)}`);
            }
            await pressKey(app, ESCAPE);
            if (await settle(() => readQuickInput(app), v => !v)) {
                fail(`Esc did not close Theia's picker opened for ${JSON.stringify(text)}`);
                await hideQuickInput(app);
            }
        }
    } finally {
        await probe(app, `delete get('CommandCentreAddressBarMode').handsOff; return true;`);
        await hideQuickInput(app);
        await enterCommandCentre(app).catch(() => null);
        await restoreDefaultMode(app);
    }
}

/** D-26: the store kinds that carry typed text to chrome, and the served engines' paths. */
const TYPED_TEXT_KINDS = ['resolveTypedAddress', 'searchSuggestions', 'autofillOrigin', 'searchPlaces'];
const ENGINE_PATHS = ['/one/search', '/one/suggest', '/two/search', '/two/suggest'];
const PRIVACY_TEXTS = ['hello', 'README', 'localhost:4000'];
/** SMODE-07 (33-05): the type shapes a search engine would take -- a bare domain, a full URL, a multi-word query, a file:line pick. */
const PRIVACY_SHAPES = ['example.com', 'https://example.org/a?b=c', 'what is power browser', 'README.md:12'];

/** Wraps the page realm's ChromeStoreClient.request, the one method every store kind goes through, to record each kind. */
const recordStoreKinds = app => probe(app, `const client = get('ChromeStoreClient');
    const request = Object.getPrototypeOf(client).request;
    window.__pbStoreKinds = [];
    client.request = function (msg, ...rest) { window.__pbStoreKinds.push(msg && msg.kind); return request.call(this, msg, ...rest); };
    return true;`);
const storeKinds = app => app.evaluate('JSON.stringify(window.__pbStoreKinds || [])').then(JSON.parse);

/** D-26 (CR-01, WR-02, WR-04): the commit keys pressed on PRIVACY_KEY_TEXT in each silent mode, a bare word Ctrl+Enter could canonize. */
const PRIVACY_KEY_TEXT = 'readme';
const COMMIT_KEYS = [['Enter', ENTER], ['Alt+Enter', ALT_ENTER], ['Ctrl+Enter', CTRL_ENTER]];

/**
 * Replaces the AddressBar's row choice, new-tab open with a row, committed-url
 * open and url-in-new-tab open with recorders, so a chosen row (a user
 * decision) costs nothing and an open of an address is seen instead of loaded.
 * openRowInNewTab with no row still runs the real method: that is the
 * typed-text path under test. Every typed-text commit still reaches chrome's
 * resolve through the recorded ChromeStoreClient.request.
 */
const recordChoices = app => probe(app, `const bar = get('AddressBar');
    const proto = Object.getPrototypeOf(bar);
    window.__pbChoices = [];
    window.__pbSaved = { openCommittedUrl: bar.openCommittedUrl };
    bar.chooseRow = async row => { window.__pbChoices.push({ how: 'choose', key: row ? row.key : null }); };
    bar.openRowInNewTab = async (row, foreground) => {
        if (!row) return proto.openRowInNewTab.call(bar, row, foreground);
        window.__pbChoices.push({ how: 'new-tab', key: row.key });
    };
    bar.openCommittedUrl = async url => { window.__pbChoices.push({ how: 'open', url }); };
    bar.openUrlInNewTab = async url => { window.__pbChoices.push({ how: 'open-new-tab', url }); };
    return true;`);
const choices = app => app.evaluate('JSON.stringify(window.__pbChoices || [])').then(JSON.parse);
const restoreChoices = app => probe(app, `const bar = get('AddressBar');
    delete bar.chooseRow;
    delete bar.openRowInNewTab;
    delete bar.openUrlInNewTab;
    if (window.__pbSaved) bar.openCommittedUrl = window.__pbSaved.openCommittedUrl;
    if (window.__pbSaved && window.__pbSaved.onInputKeyDown) { bar.onInputKeyDown = window.__pbSaved.onInputKeyDown; bar.update(); }
    delete bar.cycleMode;
    delete bar.enterLocalRow;
    window.__pbSaved = undefined;
    return true;`);

/** Derived now from the AddressBar instance: the contributed modes whose modeSends() row is all false. */
const silentModes = app => probe(app, `const bar = get('AddressBar');
    const saved = bar.mode;
    const out = [];
    try {
        for (const mode of bar.modeProvider.getContributions()) {
            bar.mode = mode.id;
            const sends = bar.modeSends();
            if (Object.keys(sends).length && Object.values(sends).every(flag => flag === false)) {
                out.push({ id: mode.id, label: mode.label });
            }
        }
    } finally {
        bar.mode = saved;
    }
    return out;`);

/**
 * D-26: typing in a mode that sends nothing reaches neither chrome nor an
 * engine. Address mode's "hello" is the positive control for both observers.
 */
async function commandCentrePrivacy(ctx) {
    const { app, pages, plant, fail, note } = ctx;
    if (!controlPassed(ctx.results, 'command-centre-privacy')) {
        return 'not-scored';
    }
    // The fixture workspace gives Command centre a README.md pick, the row its commit keys must choose.
    await openWorkspace(ctx);
    const silent = await silentModes(app);
    if (!Array.isArray(silent) || !silent.some(mode => mode.id === 'command-centre')) {
        return fail(`${BROKEN} no contributed mode with an all-false modeSends() row includes Command centre (${JSON.stringify(silent)})`);
    }
    await recordStoreKinds(app);
    try {
        await restoreDefaultMode(app);
        const controlMark = pages.requests.length;
        await typeInPill(app, 'hello');
        const control = await settle(() => storeKinds(app), kinds => kinds.includes('resolveTypedAddress'));
        const suggestSeen = await nextGet(pages, '/one/suggest', controlMark, () => true, 10000);
        if (!control.includes('resolveTypedAddress') || !suggestSeen) {
            return fail(`${BROKEN} typing "hello" in Address mode must record a resolveTypedAddress and a GET on /one/suggest (kinds ${JSON.stringify(control)}, suggest GET ${!!suggestSeen}), else the recorders prove nothing`);
        }
        await restoreDefaultMode(app);
        if (plant === 'cc-sends' && await probe(app, `const bar = get('AddressBar');
            bar.modeSends = () => (${JSON.stringify({ resolve: true, suggestions: true, autofill: true, places: true })});
            return true;`) === true) {
            note('PLANT cc-sends applied');
        }
        for (const mode of silent) {
            await enterMode(app, mode.id);
            const kindMark = (await storeKinds(app)).length;
            const getMark = pages.requests.length;
            for (const text of [...PRIVACY_TEXTS, ...PRIVACY_SHAPES]) {
                await typeInPill(app, text);
                await sleep(600);
            }
            const sent = (await storeKinds(app)).slice(kindMark).filter(kind => TYPED_TEXT_KINDS.includes(kind));
            for (const kind of [...new Set(sent)]) {
                fail(`sent ${kind} from ${mode.label} while typing ${JSON.stringify([...PRIVACY_TEXTS, ...PRIVACY_SHAPES])}`);
            }
            // SMODE-07: the live row this mode answers with stays all false while it holds typed text (no exception added).
            const sends = await probe(app, `return get('AddressBar').modeSends();`);
            if (!sends || Object.values(sends).some(v => v !== false)) {
                fail(`${mode.label} holds typed text with a modeSends() row that is not all false: ${JSON.stringify(sends)}`);
            }
            const gets = pages.requests.slice(getMark).filter(r => ENGINE_PATHS.includes(r.path));
            if (gets.length) {
                fail(`typing in ${mode.label} reached a served engine: ${JSON.stringify(gets.map(r => r.path + r.search))}`);
            }
        }

        // CR-01, WR-02: Enter, Alt+Enter and Ctrl+Enter, each pressed inside the debounce, act on a row or do nothing.
        await recordChoices(app);
        if (plant === 'cc-canonize' && await probe(app, `const bar = get('AddressBar');
            const original = bar.onInputKeyDown;
            window.__pbSaved.onInputKeyDown = original;
            bar.onInputKeyDown = e => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && /^\\s*[^.:\\/\\s]+(?:\\/.*|\\s*)$/.test(bar.inputValue)) {
                    e.preventDefault();
                    void bar.commitText(bar.inputValue, { canonize: true });
                    return;
                }
                return original(e);
            };
            bar.update();
            await sleep(300);
            return true;`) === true) {
            note('PLANT cc-canonize applied');
        }
        if (plant === 'local-enter-commits' && await probe(app, `const bar = get('AddressBar');
            bar.enterLocalRow = async function () { return this.highlightedRow() ? this.chooseRow(this.highlightedRow()) : this.commitTyped(); };
            return true;`) === true) {
            note('PLANT local-enter-commits applied');
        }
        for (const mode of silent) {
            for (const [keyName, key] of COMMIT_KEYS) {
                await enterMode(app, mode.id);
                const kindMark = (await storeKinds(app)).length;
                const getMark = pages.requests.length;
                const choiceMark = (await choices(app)).length;
                await typeInPill(app, PRIVACY_KEY_TEXT);
                await pressKey(app, key);
                await sleep(800);
                const sent = (await storeKinds(app)).slice(kindMark).filter(kind => TYPED_TEXT_KINDS.includes(kind));
                for (const kind of [...new Set(sent)]) {
                    fail(`sent ${kind} from ${mode.label} on ${keyName} with ${JSON.stringify(PRIVACY_KEY_TEXT)}`);
                }
                const gets = pages.requests.slice(getMark).filter(r => ENGINE_PATHS.includes(r.path));
                if (gets.length) {
                    fail(`${keyName} in ${mode.label} reached a served engine: ${JSON.stringify(gets.map(r => r.path + r.search))}`);
                }
                const made = (await choices(app)).slice(choiceMark);
                const opened = made.filter(c => c.how === 'open' || c.how === 'open-new-tab');
                if (opened.length) {
                    fail(`${keyName} in ${mode.label} opened the typed text as an address: ${JSON.stringify(opened)}`);
                }
                // The positive: Command centre's README.md pick is highlighted, so each key must choose a row.
                if (mode.id === 'command-centre' && !made.some(c => (c.how === 'choose' || c.how === 'new-tab') && c.key)) {
                    fail(`${BROKEN} ${keyName} on ${JSON.stringify(PRIVACY_KEY_TEXT)} in ${mode.label} chose no row (choices ${JSON.stringify(made)}), so the key never reached the pill or no pick was highlighted`);
                }
            }
        }

        // IN-03: Ctrl+Down from Command centre with its list open keeps the text and sends none of it.
        if (plant === 'cc-cycle-requery' && await probe(app, `const bar = get('AddressBar');
            const proto = Object.getPrototypeOf(bar);
            bar.cycleMode = function (step) {
                const open = this.dropdownOpen;
                proto.cycleMode.call(this, step);
                if (open && !this.dropdownOpen) this.requery();
            };
            return true;`) === true) {
            note('PLANT cc-cycle-requery applied');
        }
        await enterMode(app, 'command-centre');
        await typeInPill(app, PRIVACY_KEY_TEXT);
        if (!(await settle(() => readRows(app), v => v.open)).open) {
            fail(`${BROKEN} Command centre's list did not open for ${JSON.stringify(PRIVACY_KEY_TEXT)}, so the Ctrl+Down step proves nothing`);
        } else {
            const kindMark = (await storeKinds(app)).length;
            const getMark = pages.requests.length;
            await pressKey(app, ACCEL_DOWN);
            const moved = await settle(() => modeState(app), v => v?.mode !== 'command-centre');
            await sleep(800);
            if (moved?.mode === 'command-centre') {
                fail(`${BROKEN} Ctrl+Down did not leave Command centre, so the step proves nothing`);
            }
            const sent = (await storeKinds(app)).slice(kindMark).filter(kind => TYPED_TEXT_KINDS.includes(kind));
            for (const kind of [...new Set(sent)]) {
                fail(`sent ${kind} after Ctrl+Down out of Command centre with ${JSON.stringify(PRIVACY_KEY_TEXT)}`);
            }
            const gets = pages.requests.slice(getMark).filter(r => ENGINE_PATHS.includes(r.path));
            if (gets.length) {
                fail(`Ctrl+Down out of Command centre reached a served engine: ${JSON.stringify(gets.map(r => r.path + r.search))}`);
            }
            const pill = await readPill(app);
            if (pill.value !== PRIVACY_KEY_TEXT) {
                fail(`Ctrl+Down out of Command centre must keep ${JSON.stringify(PRIVACY_KEY_TEXT)}; the pill holds ${JSON.stringify(pill.value)}`);
            }
        }
    } finally {
        await restoreChoices(app).catch(() => null);
        await probe(app, `delete get('ChromeStoreClient').request; delete get('AddressBar').modeSends; return true;`);
        await restoreDefaultMode(app);
    }
}

/** The mode table itself, imported under Node's type stripping as the static gate does: every expected default is the tree's own value. */
const MODE_TABLE = await import(new URL('../theia/extensions/chrome-bar/src/browser/address-bar/address-bar-mode-table.ts', import.meta.url).href);
const TABS_PLACEHOLDER = sourceMatch('theia/extensions/chrome-bar/src/browser/chrome-bar-copy.ts', /\bsearchTabs: '([^']+)'/);
const CUSTOM_MODE_NAME = 'Probe Custom Mode';

/** The AddressBar's label for the mode `id` (Address, an engine's name or a contribution's label), read now. */
const modeLabelOf = (app, id) => probe(app, `return get('AddressBar').modeLabel(${JSON.stringify(id)});`);

/** The label of the mode-toggle segment for the PowerBrowser mode `id` (its text, lowercased, is the id the bar sends); null when absent. */
const segmentLabel = (app, id) => app.evaluate(`(() => {
    const seg = [...document.querySelectorAll('.pb-chrome-bar-toggle .pb-chrome-bar-segment')].find(b => (b.textContent || '').toLowerCase() === ${JSON.stringify(id)});
    return seg ? seg.textContent : null;
})()`);

/** Switches to the PowerBrowser mode `id` with a trusted click on its segment and waits for the body to carry it. */
async function switchUiMode(app, id) {
    const label = await segmentLabel(app, id);
    if (!label) {
        throw new Error(`${BROKEN} no mode-toggle segment for the PowerBrowser mode ${id}`);
    }
    await clickSegment(app, label);
    if (await settle(() => bodyMode(app), v => v === id, 10000) !== id) {
        throw new Error(`${BROKEN} the ${label} segment did not switch the PowerBrowser mode`);
    }
    return label;
}

/** Saves the current layout as the custom mode `name` through ModeService.saveCurrentAsMode, answering its name prompt; returns its id. */
const saveCustomMode = (app, name) => probe(app, `const modes = get('ModeService');
    const field = () => [...document.querySelectorAll('.quick-input-widget .quick-input-box input')].find(e => e.offsetParent !== null) || null;
    // The prompt hides on a focus loss, which a late pill blur can cause: start from a blurred pill, and retry a hidden prompt.
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    await sleep(500);
    for (let attempt = 0; attempt < 3; attempt++) {
        const running = modes.saveCurrentAsMode();
        if (!(await until(() => field() !== null, 10000))) return { error: 'no Save as Mode name field opened' };
        const input = field();
        input.focus();
        input.value = ${JSON.stringify(name)};
        input.dispatchEvent(new Event('input', { bubbles: true }));
        await sleep(500);
        let impl = null;
        try { impl = get('MonacoQuickInputImplementation'); } catch (e) { impl = null; }
        if (impl && typeof impl.accept === 'function') {
            await impl.accept();
        } else {
            const event = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true });
            Object.defineProperty(event, 'keyCode', { get: () => 13 });
            input.dispatchEvent(event);
        }
        await running;
        const row = modes.getCustomModes().find(r => r.name === ${JSON.stringify(name)});
        if (row) return { id: row.id, attempts: attempt + 1 };
    }
    return { error: 'no custom mode named ' + ${JSON.stringify(name)} + ' after three saves; customs ' + JSON.stringify(modes.getCustomModes()) };`);

/**
 * SMODE-02 (D-01..D-03, D-13, D-16, D-17) and D-14's Backspace: each shipped
 * PowerBrowser mode starts the pill in its DEFAULT_MODE_BY_UI_MODE row (the
 * table imported, never typed here); Coding keeps Command centre with a web
 * tab active; a saved custom mode starts in defaultModeFor's fallback; and
 * Backspace at the start leaves a picked mode, while in the default mode it
 * deletes as usual.
 */
async function modeDefaults(ctx) {
    const { app, pages, plant, fail, note } = ctx;
    if (!controlPassed(ctx.results, 'mode-defaults')) {
        return 'not-scored';
    }
    const tabId = await sessionTab(ctx);
    if (plant === 'default-ignored' && await probe(app, `get('AddressBar').defaultMode = () => 'address'; return true;`) === true) {
        note('PLANT default-ignored applied');
    }
    const startsIn = async (id, want) => {
        const label = await switchUiMode(app, id);
        const wantLabel = await modeLabelOf(app, want);
        const state = await settle(() => modeState(app), v => v?.mode === want, 10000);
        if (state?.mode !== want) {
            fail(`${label} did not start in ${wantLabel}: the mode is ${JSON.stringify(state?.mode)}`);
            return null;
        }
        return { label, wantLabel, view: await readMode(app) };
    };
    try {
        for (const [id, want] of Object.entries(MODE_TABLE.DEFAULT_MODE_BY_UI_MODE)) {
            const seen = await startsIn(id, want);
            if (!seen) {
                continue;
            }
            const { label, wantLabel, view } = seen;
            if (want === 'address') {
                if (!view || view.chip || view.label !== null || view.reset) {
                    fail(`${label} must show the Address form with no chip, label or x; saw ${JSON.stringify(view)}`);
                }
            } else if (!view?.chip || view.label !== wantLabel || view.reset) {
                fail(`${label} must show the ${JSON.stringify(wantLabel)} chip with no x; saw ${JSON.stringify(view)}`);
            }
            if (want === 'command-centre') {
                const placeholder = await probe(app, `return get('QuickAccessRegistry').getQuickAccessProvider('')?.placeholder ?? null;`);
                if (!placeholder || view?.placeholder !== placeholder) {
                    fail(`${label}'s placeholder must be the empty-prefix provider's own ${JSON.stringify(placeholder)}; saw ${JSON.stringify(view?.placeholder)}`);
                }
            }
            if (want === 'tabs' && (view?.value !== '' || view.placeholder !== TABS_PLACEHOLDER)) {
                fail(`${label} must show an empty pill with the placeholder ${JSON.stringify(TABS_PLACEHOLDER)}; saw ${JSON.stringify(view)}`);
            }
        }

        // D-14 (WR-03): in Browsing, Backspace at the start of an empty pill leaves History for the default and closes History's list.
        const browsingDefault = MODE_TABLE.DEFAULT_MODE_BY_UI_MODE.browsing;
        await switchUiMode(app, 'browsing');
        if (plant === 'requery-repaints' && await probe(app, `get('AddressBar').requery = function () {
            if (this.inputValue.trim() || this.localMode()) { this.textEdited(this.inputValue, false); } else { this.update(); }
        }; return true;`) === true) {
            note('PLANT requery-repaints applied');
        }
        await pickLocalMode(app, 'history');
        await typeInPill(app, '');
        if (!(await settle(() => readRows(app), v => v.open)).open) {
            fail(`${BROKEN} History's zero-query list did not open in Browsing, so the Backspace step proves nothing`);
        } else {
            await pressKey(app, BACKSPACE);
            const left = await settle(() => modeState(app), v => v?.mode === browsingDefault);
            const after = await settle(() => readRows(app), v => !v.open, 2000);
            if (left?.mode !== browsingDefault) {
                fail(`Backspace at the start of an empty pill in History did not return Browsing to its default: the mode is ${JSON.stringify(left?.mode)}`);
            } else if (after.open) {
                fail(`Backspace at the start left History's list open in ${await modeLabelOf(app, browsingDefault)} mode (${after.rows.length} rows)`);
            }
        }
        await probe(app, `delete get('AddressBar').requery; return true;`);
        await pressKey(app, ESCAPE);

        // D-16: Coding keeps Command centre with a web tab active.
        await switchUiMode(app, 'coding');
        const webTab = await openLocalTab(app, pages, '/md-web');
        await showTab(app, webTab, '/md-web');
        const withWeb = await settle(() => modeState(app), v => v?.mode === 'command-centre');
        if (withWeb?.mode !== 'command-centre') {
            fail(`Coding with a web tab active left Command centre: the mode is ${JSON.stringify(withWeb?.mode)}`);
        }

        // D-14: Backspace at the start of an empty pill leaves Tabs for the default; in the default it deletes.
        if (withWeb?.mode === 'command-centre') {
            await pickLocalMode(app, 'tabs');
            await typeInPill(app, '');
            await pressKey(app, BACKSPACE);
            const back = await settle(() => modeState(app), v => v?.mode === 'command-centre');
            if (back?.mode !== 'command-centre') {
                fail(`Backspace at the start of an empty pill in Tabs did not return to Command centre: the mode is ${JSON.stringify(back?.mode)}`);
            }
            await typeInPill(app, 'ab');
            await pressKey(app, BACKSPACE);
            const deleted = await settle(() => readMode(app), v => v?.value === 'a');
            const kept = await modeState(app);
            if (deleted?.value !== 'a' || kept?.mode !== 'command-centre') {
                fail(`Backspace after "ab" in Command centre must leave "a" in the same mode; saw ${JSON.stringify(deleted?.value)} in ${JSON.stringify(kept?.mode)}`);
            }
            await pressKey(app, ESCAPE);
            await pressKey(app, ESCAPE);
        }

        // D-17: a saved custom mode starts in defaultModeFor's fallback.
        const custom = await saveCustomMode(app, CUSTOM_MODE_NAME);
        if (!custom?.id) {
            return fail(`${BROKEN} the custom mode could not be saved (${JSON.stringify(custom)})`);
        }
        if (custom.attempts > 1) {
            note(`the Save as Mode prompt took ${custom.attempts} attempts (a hidden prompt was retried)`);
        }
        const wantCustom = MODE_TABLE.defaultModeFor(custom.id, () => true);
        const customState = await settle(() => modeState(app), v => v?.mode === wantCustom, 10000);
        if (customState?.mode !== wantCustom) {
            fail(`the custom mode ${CUSTOM_MODE_NAME} did not start in ${await modeLabelOf(app, wantCustom)}: the mode is ${JSON.stringify(customState?.mode)}`);
        }
    } finally {
        await probe(app, `delete get('AddressBar').defaultMode; return true;`);
        if (await bodyMode(app) !== 'browsing') {
            await switchUiMode(app, 'browsing').catch(() => undefined);
        }
        await restoreDefaultMode(app);
        await showTab(app, tabId, '/start').catch(() => undefined);
    }
}

/** Chrome scope: sets Probe Engine Two's user alias (an empty string removes it); returns the engine's aliases read back. */
const setEngineTwoAlias = (app, alias) => inChrome(app, `return (async () => {
    try {
        const engine = ${SEARCH_SERVICE}.getEngineByName(${JSON.stringify(ENGINE_TWO)});
        engine.alias = ${JSON.stringify(alias)};
        return JSON.stringify(engine.aliases);
    } catch (e) {
        return 'error: ' + e;
    }
})();`);

/** Re-reads chrome's engines into the AddressBar and returns Probe Engine Two's aliases as the pill now holds them. */
const pillAliases = app => probe(app, `const bar = get('AddressBar');
    await bar.refreshEngines();
    return (bar.engineList?.engines ?? []).find(e => e.name === ${JSON.stringify(ENGINE_TWO)})?.aliases ?? null;`);

/** Every token typed from Address mode with an empty pill, the mode id it must enter (null: Address, the text kept) and the text left. */
const ADDRESS_TOKENS = [
    { text: '* ', mode: 'bookmarks', left: '' },
    { text: '% al', mode: 'tabs', left: 'al' },
    { text: '^ ', mode: 'history', left: '' },
    { text: '> ', mode: 'actions', left: '' },
    { text: '? x', mode: 'default-engine', left: 'x' },
    { text: '*x', mode: null, left: '*x' },
];

/**
 * SMODE-04 (D-18): mode tokens typed at the start with a space enter their
 * mode, consumed into the chip; engine aliases come from chrome's
 * listSearchEngines reply (Gecko engine.aliases), set here on the hermetic
 * Probe Engine Two.
 */
async function modeTokens(ctx) {
    const { app, pages, plant, fail, note } = ctx;
    if (!controlPassed(ctx.results, 'mode-tokens')) {
        return 'not-scored';
    }
    await sessionTab(ctx);
    const read = await setEngineTwoAlias(app, '@two');
    const held = await pillAliases(app);
    if (!String(read).includes('@two') || !Array.isArray(held) || !held.includes('@two')) {
        return fail(`${BROKEN} the alias @two did not reach the pill from chrome (chrome reads ${read}, the pill holds ${JSON.stringify(held)})`);
    }
    if (plant === 'token-kept' && await probe(app, `get('AddressBar').applyToken = () => false; return true;`) === true) {
        note('PLANT token-kept applied');
    }
    const fromEmpty = async () => {
        await probe(app, `const bar = get('AddressBar'); bar.inputValue = ''; return true;`);
        await restoreDefaultMode(app);
    };
    try {
        const defaultEngine = await probe(app, `return get('AddressBar').effectiveEngine() ?? null;`);
        for (const step of ADDRESS_TOKENS) {
            await fromEmpty();
            const want = step.mode === 'default-engine' ? MODE_TABLE.engineModeId(defaultEngine) : step.mode ?? 'address';
            const wantLabel = await modeLabelOf(app, want);
            const token = step.text.split(' ')[0];
            try {
                await typeInPill(app, step.text, { value: step.left });
            } catch {
                // The text was kept as typed: the mode check below names the step.
            }
            const state = await settle(() => modeState(app), v => v?.mode === want);
            const view = await readMode(app);
            if (state?.mode !== want) {
                fail(`the ${token} token did not enter ${wantLabel}: ${JSON.stringify(step.text)} left the mode ${JSON.stringify(state?.mode)} and the text ${JSON.stringify(view?.value)}`);
            } else if (view?.value !== step.left || (want === 'address' ? view.chip : view.label !== wantLabel)) {
                fail(`${JSON.stringify(step.text)} must show ${want === 'address' ? 'the Address form' : `the ${wantLabel} chip`} with the text ${JSON.stringify(step.left)}; saw ${JSON.stringify(view)}`);
            }
        }

        // @alias enters its engine, and Enter searches it.
        await fromEmpty();
        await typeInPill(app, '@two hello', { value: 'hello' }).catch(() => undefined);
        const aliased = await settle(() => readMode(app), v => v?.label === ENGINE_TWO && v.value === 'hello');
        if (aliased?.label !== ENGINE_TWO || aliased.value !== 'hello') {
            fail(`the @two alias did not enter ${ENGINE_TWO} with the text "hello"; saw ${JSON.stringify(aliased)}`);
        } else {
            const getMark = pages.requests.length;
            await pressKey(app, ENTER);
            if (!await nextGet(pages, '/two/search', getMark, r => queryOf(r) === 'hello')) {
                fail(`Enter after @two hello loaded no /two/search with q "hello"`);
            }
        }

        // @ alone lists the aliased engines; choosing one enters its mode with empty text.
        await fromEmpty();
        await typeInPill(app, '@');
        const listed = await settle(() => readRows(app), v => v.rows.some(r => r.title === '@two'));
        const row = listed.rows.find(r => r.title === '@two');
        if (!row || row.caption !== ENGINE_TWO) {
            fail(`"@" alone must list a row titled "@two" captioned ${JSON.stringify(ENGINE_TWO)}; saw ${JSON.stringify(listed.rows.map(r => [r.title, r.caption]))}`);
        } else {
            await rowMouseDown(app, row.id);
            const chosen = await settle(() => readMode(app), v => v?.label === ENGINE_TWO && v.value === '');
            if (chosen?.label !== ENGINE_TWO || chosen.value !== '') {
                fail(`choosing the @two row must enter ${ENGINE_TWO} with empty text; saw ${JSON.stringify(chosen)}`);
            }
        }

        // In Command centre > stays text for Theia's commands, and % still enters Tabs.
        await probe(app, `const bar = get('AddressBar'); bar.inputValue = bar.committedAddress; return true;`);
        await enterCommandCentre(app);
        await typeInPill(app, '> ').catch(() => undefined);
        const kept = await settle(() => readCcRows(app), v => v.rows.some(r => !r.group && !r.message));
        const keptState = await modeState(app);
        const keptView = await readMode(app);
        if (keptState?.mode !== 'command-centre' || keptView?.value !== '> ' || !kept.rows.some(r => !r.group && !r.message)) {
            fail(`in Command centre "> " must stay as text and list command rows; the mode is ${JSON.stringify(keptState?.mode)}, the text ${JSON.stringify(keptView?.value)}, ${kept.rows.length} rows`);
        }
        await typeInPill(app, '% ', { value: '' }).catch(() => undefined);
        const tabs = await settle(() => modeState(app), v => v?.mode === 'tabs');
        if (tabs?.mode !== 'tabs') {
            fail(`in Command centre the % token did not enter Tabs: the mode is ${JSON.stringify(tabs?.mode)}`);
        }
    } finally {
        await probe(app, `delete get('AddressBar').applyToken; return true;`);
        await setEngineTwoAlias(app, '');
        await pillAliases(app);
        await probe(app, `const bar = get('AddressBar'); bar.inputValue = bar.committedAddress; return true;`);
        await restoreDefaultMode(app);
    }
}

const ACCEL_DOWN = { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40, modifiers: ['accel'] };
const ACCEL_UP = { key: 'ArrowUp', code: 'ArrowUp', keyCode: 38, modifiers: ['accel'] };
const ALT_DOWN = { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40, modifiers: ['alt'] };
const ALT_UP = { key: 'ArrowUp', code: 'ArrowUp', keyCode: 38, modifiers: ['alt'] };
const EDITOR_LINES = 'probe line one\nprobe line two';
const EDITOR_SWAPPED = 'probe line two\nprobe line one';

/** Focuses the pill input in the Theia frame without changing its text; throws a broken instrument when it cannot. */
async function focusPill(app) {
    if (await focusTheiaFrame(app) !== true) {
        throw new Error(`${BROKEN} the Theia frame could not be made chrome's active element`);
    }
    const focused = await app.evaluate(`(() => {
        const input = document.querySelector('.pb-chrome-bar-input');
        if (!input) return false;
        input.focus();
        return document.activeElement === input;
    })()`);
    if (focused !== true) {
        throw new Error(`${BROKEN} the pill could not be focused`);
    }
}

/** The editor on the fixture's README.md, opened and made current, its text set to two lines with the cursor on line 2 and focus in it. */
const focusReadmeEditor = (app, dir) => probe(app, `const root = get('WorkspaceService').tryGetRoots()[0];
    const widget = await get('EditorManager').open(root.resource.resolve('README.md'));
    await get('ApplicationShell').activateWidget(widget.id);
    const control = widget.editor.getControl();
    control.setValue(${JSON.stringify(EDITOR_LINES)});
    control.setPosition({ lineNumber: 2, column: 1 });
    widget.editor.focus();
    return await until(() => get('ContextKeyService').match('editorFocus'), 5000);`);
const readmeText = app => probe(app, `return get('EditorManager').currentEditor?.editor.getControl().getValue() ?? null;`);

/**
 * SMODE-04 (D-19, D-20, KEY-04): Ctrl+Up/Down cycles the pill's modes and
 * Alt+Up/Down opens its modes menu, only while the pill has focus; in an
 * editor Monaco keeps Alt+Up/Down (move line) and Ctrl+Down leaves the pill
 * alone.
 */
async function modeKeys(ctx) {
    const { app, plant, fail, note } = ctx;
    if (!controlPassed(ctx.results, 'mode-keys')) {
        return 'not-scored';
    }
    const dir = await openWorkspace(ctx);
    if (await bodyMode(app) !== 'browsing') {
        await switchUiMode(app, 'browsing');
    }
    if (plant === 'cycle-off' && await probe(app, `get('AddressBar').cycleMode = function () {}; return true;`) === true) {
        note('PLANT cycle-off applied');
    }
    try {
        await probe(app, `const bar = get('AddressBar'); await bar.refreshEngines(); bar.inputValue = bar.committedAddress; return true;`);
        await restoreDefaultMode(app);
        const derived = await probe(app, `const list = await get('ChromeStoreClient').listSearchEngines();
            return { engines: (list?.engines ?? []).map(e => e.name), contributed: get('AddressBar').modeProvider.getContributions().map(m => m.id) };`);
        const order = MODE_TABLE.cycleOrder(derived.engines, id => derived.contributed.includes(id));
        const start = await modeState(app);
        if (start?.mode !== 'address' || order.length < 3) {
            return fail(`${BROKEN} the cycle must start in Address over at least three modes (mode ${JSON.stringify(start?.mode)}, order ${JSON.stringify(order)})`);
        }
        await focusPill(app);
        for (let i = 1; i <= order.length; i++) {
            const want = order[i % order.length];
            await pressKey(app, ACCEL_DOWN);
            const state = await settle(() => modeState(app), v => v?.mode === want);
            if (state?.mode !== want) {
                fail(`Ctrl+Down did not move to the next mode: after ${JSON.stringify(order[i - 1])} it is ${JSON.stringify(state?.mode)}, expected ${JSON.stringify(want)} (order ${JSON.stringify(order)})`);
                break;
            }
        }
        await pressKey(app, ACCEL_UP);
        const back = await settle(() => modeState(app), v => v?.mode === order[order.length - 1]);
        if (back?.mode !== order[order.length - 1]) {
            fail(`Ctrl+Up from Address must step back to ${JSON.stringify(order[order.length - 1])}; the mode is ${JSON.stringify(back?.mode)}`);
        }
        await restoreDefaultMode(app);

        // Alt+Down opens the modes menu; Esc closes it with the mode kept.
        await focusPill(app);
        await pressKey(app, ALT_DOWN);
        if (!await settle(() => readModesMenu(app), v => !!v)) {
            fail('Alt+Down in the pill did not open the modes menu');
        } else {
            await pressKey(app, ESCAPE);
            const closed = await settle(() => readModesMenu(app), v => v === null);
            const kept = await modeState(app);
            if (closed !== null || kept?.mode !== 'address') {
                fail(`Esc must close the modes menu with the mode unchanged; the menu is ${closed ? 'open' : 'closed'}, the mode ${JSON.stringify(kept?.mode)}`);
            }
        }

        // KEY-04: in an editor Monaco keeps Alt+Up/Down, and Ctrl+Down leaves the pill's mode alone.
        if (await focusTheiaFrame(app) !== true || await focusReadmeEditor(app, dir) !== true) {
            return fail(`${BROKEN} the README.md editor could not be opened and focused`);
        }
        await pressKey(app, ALT_UP);
        const swapped = await settle(() => readmeText(app), v => v === EDITOR_SWAPPED);
        if (swapped !== EDITOR_SWAPPED) {
            fail(`Alt+Up in the editor must move line 2 up (Monaco received the key); the text is ${JSON.stringify(swapped)}`);
        }
        await pressKey(app, ALT_DOWN);
        const restored = await settle(() => readmeText(app), v => v === EDITOR_LINES);
        if (restored !== EDITOR_LINES) {
            fail(`Alt+Down in the editor must move the line back down; the text is ${JSON.stringify(restored)}`);
        }
        const before = await modeState(app);
        await pressKey(app, ACCEL_DOWN);
        await sleep(500);
        const after = await modeState(app);
        if (after?.mode !== before?.mode) {
            fail(`Ctrl+Down in the editor changed the pill's mode from ${JSON.stringify(before?.mode)} to ${JSON.stringify(after?.mode)}`);
        }
    } finally {
        await probe(app, `const bar = get('AddressBar'); delete bar.cycleMode;
            const ed = get('EditorManager').currentEditor;
            if (ed && ed.editor.document && ed.editor.document.revert) { await ed.editor.document.revert(); }
            return true;`);
        await restoreDefaultMode(app);
    }
}

const GO_TO = text => `Go to ${text}`;
const COMMIT_FAILED = "couldn't open that address";

/** Types `text` in the pill and waits past the debounce for Command centre's rows to settle; returns the view. */
async function ccRowsFor(app, text, ok = v => v.open && v.rows.length > 0) {
    await typeInPill(app, text);
    await sleep(600);
    return settle(() => readCcRows(app), ok, 10000);
}

/**
 * SMODE-06 (D-29..D-31): an unambiguous address typed in Command centre gets
 * a first, highlighted "Go to" row and Enter loads it; README.md lists the
 * file first and then an unhighlighted Go-to row; "hello" gets none. With
 * chrome's resolve stubbed to reply a search, Enter on a Go-to row shows the
 * commit-failure row and the served engine sees no GET (the search control
 * proves the log sees that path). Runs in the fixture workspace on its own
 * localhost tab.
 */
async function goTo(ctx) {
    const { app, pages, plant, fail, note } = ctx;
    if (!controlPassed(ctx.results, 'go-to')) {
        return 'not-scored';
    }
    await openWorkspace(ctx);
    const tabId = await openLocalTab(app, pages, '/start');
    await showTab(app, tabId, 'go-to');
    if (plant === 'visit-only-off' && await probe(app, `get('AddressBar').refusesSearch = () => false; return true;`) === true) {
        note('PLANT visit-only-off applied');
    }
    const host = new URL(localUrl(pages, '/')).host;
    try {
        // An unambiguous address: Go-to first and highlighted; Enter loads it.
        await enterMode(app, 'command-centre');
        const devText = `${host}/dev`;
        const dev = await ccRowsFor(app, devText, v => v.rows[0]?.text === GO_TO(devText));
        if (dev.rows[0]?.text !== GO_TO(devText) || !dev.rows[0].selected) {
            fail(`${devText}: the first row must be "${GO_TO(devText)}", highlighted; rows ${JSON.stringify(dev.rows.map(r => [r.text, r.selected]))}`);
        }
        const mark = (await pushes(app)).length;
        const getMark = pages.requests.length;
        await pressKey(app, ENTER);
        const got = await nextGet(pages, '/dev', getMark);
        if (!got) {
            fail(`no GET on /dev after Enter on the Go-to row; pill ${JSON.stringify(await readPill(app))}`);
        }
        if (await waitForPush(app, loadedAt(tabId, '/dev'), { from: mark, timeoutMs: got ? 15000 : 1000 }) < 0) {
            fail('no loaded state push for the tab ended /dev after the Go-to commit');
        }

        // A dotted name that may be a file: the file first, then an unhighlighted Go-to row.
        await enterMode(app, 'command-centre');
        const readme = await ccRowsFor(app, 'README.md', v => v.rows.some(r => r.text === GO_TO('README.md')) && v.rows.some(r => r.text === 'README.md'));
        const fileAt = readme.rows.findIndex(r => r.text === 'README.md');
        const gotoAt = readme.rows.findIndex(r => r.text === GO_TO('README.md'));
        if (fileAt < 0 || gotoAt < fileAt || readme.rows[gotoAt]?.selected || readme.rows.find(r => r.selected)?.text !== 'README.md') {
            fail(`README.md must list the file first, highlighted, then an unhighlighted "${GO_TO('README.md')}"; rows ${JSON.stringify(readme.rows.map(r => [r.text, r.selected]))}`);
        }

        // Plain words: no Go-to row.
        await enterMode(app, 'command-centre');
        const words = await ccRowsFor(app, 'hello', v => v.open);
        if (words.rows.some(r => r.text.startsWith(GO_TO('')))) {
            fail(`"hello" must get no Go-to row; rows ${JSON.stringify(words.rows.map(r => r.text))}`);
        }

        // Visit-only (A4): a Go-to that chrome resolves to a search loads nothing.
        await enterMode(app, 'command-centre');
        await stubResolve(app, { kind: 'search', url: pages.url('/one/search?q=probe'), engineName: ENGINE_ONE });
        const xText = `${host}/x`;
        const x = await ccRowsFor(app, xText, v => v.rows[0]?.text === GO_TO(xText));
        if (x.rows[0]?.text !== GO_TO(xText) || !x.rows[0].selected) {
            return fail(`${BROKEN} ${xText} showed no highlighted Go-to row to commit (${JSON.stringify(x.rows.map(r => r.text))})`);
        }
        const searchMark = pages.requests.length;
        await pressKey(app, ENTER);
        const pill = await settle(() => readPill(app), v => v.rows.some(r => r.includes(COMMIT_FAILED)), 5000);
        const opened = await nextGet(pages, '/one/search', searchMark, () => true, 3000);
        if (opened) {
            fail(`Command centre opened a search: a Go-to commit that chrome resolved to a search loaded ${opened.path}${opened.search}`);
        }
        if (!pill.rows.some(r => r.includes(COMMIT_FAILED))) {
            fail(`a Go-to commit resolved to a search must show the commit-failure row; pill ${JSON.stringify(pill)}`);
        }
    } finally {
        await stubResolve(app, null);
        await probe(app, `const bar = get('AddressBar'); delete bar.refusesSearch; bar.commitFailed = false; bar.closeDropdown(); bar.inputValue = bar.committedAddress; return true;`);
        await restoreDefaultMode(app);
    }
}

const NEW_TAB_COMMAND = sourceConst('theia/extensions/chrome-bar/src/browser/chrome-bar-commands.ts', 'CHROME_BAR_NEW_TAB_COMMAND_ID');
const CTRL_L = { key: 'l', code: 'KeyL', keyCode: 76, modifiers: ['accel'] };
const ALT_D = { key: 'd', code: 'KeyD', keyCode: 68, modifiers: ['alt'] };
const F6 = { key: 'F6', code: 'F6', keyCode: 117 };

/** The pill and the address bar's mode, read together. */
const pillAndMode = async app => ({ pill: await readPill(app), mode: (await modeState(app))?.mode });

/** Fails unless the pill has focus in Address mode with all of `value` selected; `label` names the key that got it there. */
async function expectAddressFocus(app, fail, label, value) {
    const v = await settle(() => pillAndMode(app), x => x.mode === 'address' && x.pill.focused && x.pill.selected && (value === undefined || x.pill.value === value));
    if (v.mode !== 'address') {
        fail(`${label} left the pill in ${v.mode === 'command-centre' ? 'Command centre' : JSON.stringify(v.mode)}`);
    } else if (!v.pill.focused || !v.pill.selected || (value !== undefined && v.pill.value !== value)) {
        fail(`${label} must focus the pill with ${value === undefined ? 'its text' : JSON.stringify(value)} selected; pill ${JSON.stringify(v.pill)}`);
    }
}

/** Esc twice in the pill returns it to Command centre; throws a broken instrument when it does not. */
async function backToCentre(app) {
    await focusPill(app);
    await pressKey(app, ESCAPE);
    await pressKey(app, ESCAPE);
    const state = await settle(() => modeState(app), v => v?.mode === 'command-centre');
    if (state?.mode !== 'command-centre') {
        throw new Error(`${BROKEN} Esc twice did not return the pill to Command centre (${JSON.stringify(state)})`);
    }
}

/**
 * SMODE-06 (D-28, KEY-04): in Coding, from Command centre, Ctrl+L, Alt+D and
 * F6 pressed in a web page each focus the pill in Address mode with the tab's
 * address selected. In the pill, F6 in Command centre switches to Address and
 * keeps focus, and F6 in Address gives the page focus (Phase 27); Ctrl+L in
 * the pill enters Address. New Tab ends with the pill focused in Address.
 * Tabs mode gives an address a first Go-to row. In the README.md editor
 * Ctrl+L and Alt+D leave the pill unfocused and its mode unchanged.
 */
async function addressKeys(ctx) {
    const { app, pages, plant, fail, note } = ctx;
    if (!controlPassed(ctx.results, 'address-keys')) {
        return 'not-scored';
    }
    const dir = await openWorkspace(ctx);
    const uiMode = await bodyMode(app);
    if (uiMode !== 'coding') {
        await switchUiMode(app, 'coding');
    }
    const tabId = await openLocalTab(app, pages, '/start');
    await showTab(app, tabId, 'address-keys');
    const address = localUrl(pages, '/start');
    if (plant === 'focus-keeps-mode' && await probe(app, `get('AddressBar').focusAddress = function () {
        const input = document.querySelector('.pb-chrome-bar-input'); input.focus(); input.select(); }; return true;`) === true) {
        note('PLANT focus-keeps-mode applied');
    }
    try {
        await restoreDefaultMode(app);
        await probe(app, `const bar = get('AddressBar'); bar.inputValue = bar.committedAddress; bar.update(); return true;`);
        if ((await modeState(app))?.mode !== 'command-centre') {
            return fail(`${BROKEN} Coding did not start the pill in Command centre (${JSON.stringify(await modeState(app))})`);
        }
        // From the page: each address key reaches the pill in Address mode.
        for (const [key, label] of [[CTRL_L, 'Ctrl+L'], [ALT_D, 'Alt+D'], [F6, 'F6']]) {
            if (await focusOverlay(app, tabId) !== true) {
                return fail(`${BROKEN} the page could not be focused before ${label}`);
            }
            await pressKey(app, key);
            await expectAddressFocus(app, fail, label, address);
            await backToCentre(app);
        }

        // In the pill: F6 in Command centre switches to Address and keeps focus; F6 in Address goes to the page.
        await focusPill(app);
        await pressKey(app, F6);
        await expectAddressFocus(app, fail, 'F6 in the pill');
        if (await chromeActiveTabId(app) === tabId) {
            fail('F6 in the pill in Command centre moved focus to the page instead of keeping it in the pill');
        }
        await pressKey(app, F6);
        if (await settle(() => chromeActiveTabId(app), v => v === tabId) !== tabId) {
            fail('F6 in the pill in Address mode must give the page focus (Phase 27)');
        }
        await backToCentre(app);
        await focusPill(app);
        await pressKey(app, CTRL_L);
        await expectAddressFocus(app, fail, 'Ctrl+L in the pill');
        await backToCentre(app);

        // New Tab: a new tab is current and the pill has focus in Address mode.
        await probe(app, `await get('CommandRegistry').executeCommand(${JSON.stringify(NEW_TAB_COMMAND)}); return true;`);
        const fresh = await settle(() => mainTabId(app), v => !!v && v !== tabId);
        if (!fresh || fresh === tabId) {
            fail(`New Tab did not make a new tab current (${JSON.stringify(fresh)})`);
        }
        await expectAddressFocus(app, fail, 'New Tab');
        await showTab(app, tabId, 'address-keys');

        // Tabs mode: an address gets a first, highlighted Go-to row.
        await enterMode(app, 'tabs');
        const tabsText = `${new URL(address).host}/sw-a`;
        const tabs = await ccRowsFor(app, tabsText, v => v.rows[0]?.text === GO_TO(tabsText));
        if (tabs.rows[0]?.text !== GO_TO(tabsText) || !tabs.rows[0].selected) {
            fail(`in Tabs mode ${tabsText} must get a first, highlighted "${GO_TO(tabsText)}" row; rows ${JSON.stringify(tabs.rows.map(r => [r.text, r.selected]))}`);
        }
        await restoreDefaultMode(app);

        // KEY-04: in an editor Ctrl+L and Alt+D keep their Theia meaning.
        if (await focusTheiaFrame(app) !== true || await focusReadmeEditor(app, dir) !== true) {
            return fail(`${BROKEN} the README.md editor could not be opened and focused`);
        }
        for (const [key, label] of [[CTRL_L, 'Ctrl+L'], [ALT_D, 'Alt+D']]) {
            const before = await pillAndMode(app);
            await pressKey(app, key);
            await sleep(500);
            const after = await pillAndMode(app);
            if (after.pill.focused || after.mode !== before.mode) {
                fail(`${label} in the editor took the pill (focused ${after.pill.focused}, mode ${JSON.stringify(before.mode)} -> ${JSON.stringify(after.mode)})`);
            }
        }
    } finally {
        await probe(app, `const bar = get('AddressBar'); delete bar.focusAddress;
            const ed = get('EditorManager').currentEditor;
            if (ed && ed.editor.document && ed.editor.document.revert) { await ed.editor.document.revert(); }
            return true;`);
        await restoreDefaultMode(app);
        if (uiMode && uiMode !== 'coding') {
            await switchUiMode(app, uiMode).catch(() => undefined);
        }
    }
}

/** Enters the contributed mode `id` from the default mode through the menu, with the text cleared. */
async function enterMode(app, id) {
    await probe(app, `const bar = get('AddressBar'); bar.inputValue = bar.committedAddress; return true;`);
    await restoreDefaultMode(app);
    return pickLocalMode(app, id);
}

// Phase 33 plan 02 (BMK-01, BMK-02, D-15): the star, its editor and Ctrl+D on both focus paths.
const CHROME_BAR_COPY_REL = 'theia/extensions/chrome-bar/src/browser/chrome-bar-copy.ts';
const BOOKMARK_PAGE_COMMAND = sourceConst('theia/extensions/chrome-bar/src/browser/chrome-bar-commands.ts', 'CHROME_BAR_BOOKMARK_PAGE_COMMAND_ID');
const copyPrefix = key => sourceMatch(CHROME_BAR_COPY_REL, new RegExp(`\\b${key}: \\([^)]*\\) => \`([^$\`]*)\\$\\{`));
const STAR_KEY = sourceMatch('theia/extensions/chrome-bar/src/browser/chrome-bar-shortcuts.ts', /id: 'bookmarkPage'[^}]*\blabel: '([^']+)'/);
const CANT_BOOKMARK = sourceMatch(CHROME_BAR_COPY_REL, /\bcantBookmark: "([^"]+)"/);
const NEW_BOOKMARK_HEADING = sourceMatch(CHROME_BAR_COPY_REL, /\bbookmarkPageHeading: '([^']+)'/);
const EDIT_BOOKMARK_HEADING = sourceMatch(CHROME_BAR_COPY_REL, /\beditBookmarkHeading: '([^']+)'/);
const FOLDER_MENU_LABEL = sourceMatch(CHROME_BAR_COPY_REL, /\bbookmarkFolderMenu: '([^']+)'/);
const FOLDER_TOOLBAR_LABEL = sourceMatch(CHROME_BAR_COPY_REL, /\bbookmarkFolderToolbar: '([^']+)'/);
const CTRL_D = { key: 'd', code: 'KeyD', keyCode: 68, modifiers: ['accel'] };

/** The star and its editor as the user sees them. */
const readStar = app => app.evaluate(`JSON.stringify((() => {
    const pill = document.querySelector('.pb-chrome-bar-pill');
    const star = pill && pill.querySelector('.pb-address-star');
    const editor = document.querySelector('.pb-chrome-bar-dropdown.pb-bookmark-editor');
    const name = editor && editor.querySelector('.pb-bookmark-editor-name');
    const folders = editor ? [...editor.querySelectorAll('.pb-bookmark-editor-folder')] : [];
    return {
        present: !!star,
        last: !!star && pill.lastElementChild === star,
        filled: !!star && !!star.querySelector('.codicon-star-full'),
        outline: !!star && !!star.querySelector('.codicon-star-empty'),
        disabled: !!star && star.disabled,
        dimmed: !!star && Number(getComputedStyle(star).opacity) < 1,
        label: star ? star.getAttribute('aria-label') : null,
        size: star ? [Math.round(star.getBoundingClientRect().width), Math.round(star.getBoundingClientRect().height)] : null,
        focused: !!star && document.activeElement === star,
        editor: editor ? {
            heading: (editor.querySelector('.pb-bookmark-editor-heading') || {}).textContent || '',
            name: name ? name.value : null,
            nameFocused: !!name && document.activeElement === name,
            nameSelected: !!name && name.value.length > 0 && name.selectionStart === 0 && name.selectionEnd === name.value.length,
            folder: (folders.find(l => l.querySelector('input').checked) || {}).textContent || '',
            folders: folders.map(l => l.textContent),
            failure: (editor.querySelector('.pb-bookmark-editor-failure') || {}).textContent || '',
            width: Math.round(editor.getBoundingClientRect().width),
        } : null,
    };
})())`).then(JSON.parse);

/** Chrome scope, Places' own read (the independent observer): every bookmark of `url` as { guid, title, folder }. */
const bookmarksOf = (app, url) => inChrome(app, `return (async () => {
    try {
        const { PlacesUtils } = ChromeUtils.importESModule('resource://gre/modules/PlacesUtils.sys.mjs');
        const B = PlacesUtils.bookmarks;
        const rows = [];
        await B.fetch({ url: ${JSON.stringify(url)} }, b => rows.push({ guid: b.guid, title: b.title,
            folder: b.parentGuid === B.toolbarGuid ? 'toolbar' : b.parentGuid === B.menuGuid ? 'menu' : b.parentGuid === B.unfiledGuid ? 'unfiled' : b.parentGuid }));
        return JSON.stringify(rows);
    } catch (e) {
        return JSON.stringify({ error: String(e) });
    }
})();`).then(JSON.parse);

/** Chrome scope: removes every bookmark of `url` ('ok' or 'error: ...'), as another window would. */
const unbookmark = (app, url) => inChrome(app, `return (async () => {
    try {
        const { PlacesUtils } = ChromeUtils.importESModule('resource://gre/modules/PlacesUtils.sys.mjs');
        const guids = [];
        await PlacesUtils.bookmarks.fetch({ url: ${JSON.stringify(url)} }, b => guids.push({ guid: b.guid }));
        if (guids.length) await PlacesUtils.bookmarks.remove(guids);
        return 'ok';
    } catch (e) {
        return 'error: ' + e;
    }
})();`);

const clickStar = app => app.evaluate(`(() => { const s = document.querySelector('.pb-address-star'); if (!s || s.disabled) return false; s.click(); return true; })()`);

/** Navigates the session tab to `path`, clears its bookmarks chrome-side, and waits for the outline star. */
async function bookmarkPageOf(ctx, tabId, path) {
    const { app, pages } = ctx;
    const url = pages.url(path);
    if (await unbookmark(app, url) !== 'ok') {
        throw new Error(`${BROKEN} the bookmarks of ${path} could not be cleared chrome-side`);
    }
    const from = (await pushes(app)).length;
    await probe(app, `await get('WebTabChannel').widgetOf(${JSON.stringify(tabId)}).navigate(${JSON.stringify(url)}); return true;`);
    if (await waitForPush(app, loadedAt(tabId, path), { from }) < 0) {
        throw new Error(`${BROKEN} no loaded state push arrived for ${path}`);
    }
    if (!(await settle(() => readStar(app), v => v.present && v.outline && !v.disabled)).outline) {
        throw new Error(`${BROKEN} the star never showed the enabled outline form on ${path}: ${JSON.stringify(await readStar(app))}`);
    }
    return url;
}

/** Waits for the editor; Esc closes it and the star must take focus back. Returns the editor seen. */
async function expectEditorThenEsc(app, fail, label) {
    const seen = await settle(() => readStar(app), v => !!v.editor);
    if (!seen.editor) {
        fail(`${label} opened no bookmark editor; star ${JSON.stringify(seen)}`);
        return null;
    }
    await pressKey(app, ESCAPE);
    const closed = await settle(() => readStar(app), v => !v.editor && v.focused);
    if (closed.editor || !closed.focused) {
        fail(`Esc in the editor opened by ${label} must close it and return focus to the star; saw ${JSON.stringify(closed)}`);
    }
    return seen.editor;
}

/**
 * BMK-01: the star is the pill's last element, the outline form with the
 * bound-key tooltip on an unbookmarked page; a click bookmarks the page in
 * Places (read back chrome-side) and opens the editor; a bookmark removed or
 * added chrome-side flips the star with no navigation (the bookmarks-changed
 * push); Ctrl+D bookmarks with the pill focused and with the page focused;
 * the filled star shows in Coding, Browsing and Organising; a page with no
 * http(s) address dims the star with the can't-bookmark tooltip.
 */
async function bookmarkStar(ctx) {
    const { app, plant, fail, note } = ctx;
    const tabId = await sessionTab(ctx);
    const url = await bookmarkPageOf(ctx, tabId, '/bm-a');
    if (plant === 'star-ignores-push' && await probe(app, `const bar = get('AddressBar'); const read = Object.getPrototypeOf(bar).refreshStar;
        bar.refreshStar = function (force) { if (!force) { read.call(this, false); } }; return true;`) === true) {
        note('PLANT star-ignores-push applied');
    }
    const uiMode = await bodyMode(app);
    try {
        let star = await readStar(app);
        const tip = `${copyPrefix('bookmarkStarTip')}${STAR_KEY})`;
        if (!star.last || star.label !== tip || String(star.size) !== '24,24') {
            fail(`the unbookmarked star must be the pill's last element, 24x24, labelled ${JSON.stringify(tip)}; saw ${JSON.stringify(star)}`);
        }
        if (await clickStar(app) !== true) {
            return fail(`${BROKEN} the star could not be clicked`);
        }
        const made = await settle(() => bookmarksOf(app, url), v => Array.isArray(v) && v.length === 1, 8000);
        if (!Array.isArray(made) || made.length !== 1) {
            return fail(`a click on the star must bookmark the page once in Places; Places holds ${JSON.stringify(made)}`);
        }
        const editor = await expectEditorThenEsc(app, fail, 'the star click');
        if (editor && (editor.heading !== NEW_BOOKMARK_HEADING || !editor.nameSelected || editor.width !== 320)) {
            fail(`the editor after a first bookmark must be 320px, headed ${JSON.stringify(NEW_BOOKMARK_HEADING)}, with the Name field focused and selected; saw ${JSON.stringify(editor)}`);
        }
        star = await settle(() => readStar(app), v => v.filled);
        const editTip = `${copyPrefix('editBookmarkTip')}${STAR_KEY})`;
        if (!star.filled || star.label !== editTip) {
            fail(`a bookmarked page must show the filled star labelled ${JSON.stringify(editTip)}; saw ${JSON.stringify(star)}`);
        }

        // BMK-04's push: chrome-side changes flip the star with no navigation.
        if (await unbookmark(app, url) !== 'ok') {
            return fail(`${BROKEN} the bookmark could not be removed chrome-side`);
        }
        if (!(await settle(() => readStar(app), v => v.outline, 5000)).outline) {
            fail('the star did not unfill after the bookmark was removed in chrome (the bookmarks-changed push)');
        }
        if (await seedPlaces(app, [], [[url, 'Seeded elsewhere']]) !== 'ok') {
            return fail(`${BROKEN} a bookmark could not be added chrome-side`);
        }
        if (!(await settle(() => readStar(app), v => v.filled, 5000)).filled) {
            fail('the star did not fill after a bookmark was added in chrome (the bookmarks-changed push)');
        }

        // The filled star in every PowerBrowser mode.
        for (const id of ['coding', 'browsing', 'organising']) {
            await switchUiMode(app, id);
            await showTab(app, tabId, `bookmark-star in ${id}`);
            if (!(await settle(() => readStar(app), v => v.filled)).filled) {
                fail(`the filled star is not shown in ${id}: ${JSON.stringify(await readStar(app))}`);
            }
        }

        // Ctrl+D, Theia-focused (the pill) and page-focused (the relay row).
        for (const [label, focus] of [['Ctrl+D in the pill', () => focusPill(app)], ['Ctrl+D in the page', () => focusOverlay(app, tabId)]]) {
            if (await unbookmark(app, url) !== 'ok' || !(await settle(() => readStar(app), v => v.outline)).outline) {
                return fail(`${BROKEN} the page could not be unbookmarked before ${label}`);
            }
            if (await focus() === false) {
                return fail(`${BROKEN} focus could not be placed for ${label}`);
            }
            await pressKey(app, CTRL_D);
            const rows = await settle(() => bookmarksOf(app, url), v => Array.isArray(v) && v.length === 1, 8000);
            if (!Array.isArray(rows) || rows.length !== 1) {
                fail(`${label} must bookmark the page once in Places; Places holds ${JSON.stringify(rows)}`);
            }
            await expectEditorThenEsc(app, fail, label);
        }

        // No http(s) page: dimmed, never removed.
        const from = (await pushes(app)).length;
        await probe(app, `await get('WebTabChannel').widgetOf(${JSON.stringify(tabId)}).navigate('about:blank'); return true;`);
        await waitForPush(app, p => p && p.kind === 'state' && p.tabId === tabId && p.url === 'about:blank' && !p.loading, { from });
        star = await settle(() => readStar(app), v => v.disabled);
        if (!star.present || !star.disabled || !star.dimmed || star.label !== CANT_BOOKMARK) {
            fail(`a page with no http(s) address must keep a dimmed, disabled star labelled ${JSON.stringify(CANT_BOOKMARK)}; saw ${JSON.stringify(star)}`);
        }
    } finally {
        await probe(app, `delete get('AddressBar').refreshStar; return true;`);
        await unbookmark(app, url);
        if (uiMode) {
            await switchUiMode(app, uiMode).catch(() => undefined);
        }
    }
}

/**
 * BMK-02: on a bookmarked page the star opens the editor directly, headed
 * Edit bookmark, Name prefilled and selected, the folder radio on the
 * bookmark's folder. A rename plus a move to the Bookmarks Menu with Enter
 * lands in Places; Esc after typing saves nothing; Remove removes at once
 * with no second confirm; a refused write shows the failure row naming the
 * application and keeps the panel open with the typed text.
 */
async function bookmarkEditor(ctx) {
    const { app, plant, fail, note } = ctx;
    const tabId = await sessionTab(ctx);
    const url = await bookmarkPageOf(ctx, tabId, '/bm-b');
    if (plant === 'remove-needs-confirm' && await probe(app, `const bar = get('AddressBar');
        bar.removeFromBookmarkEditor = async function () { this.pendingConfirm = true; this.update(); }; return true;`) === true) {
        note('PLANT remove-needs-confirm applied');
    }
    const subject = (await app.evaluate(appNameExpr)) || 'The browser';
    const setName = text => app.evaluate(`(() => {
        const input = document.querySelector('.pb-bookmark-editor-name');
        if (!input) return false;
        const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        set.call(input, ${JSON.stringify(text)});
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.focus();
        return true;
    })()`);
    const pickFolder = label => app.evaluate(`(() => {
        const row = [...document.querySelectorAll('.pb-bookmark-editor-folder')].find(l => l.textContent === ${JSON.stringify(label)});
        if (!row) return false;
        row.querySelector('input').click();
        document.querySelector('.pb-bookmark-editor-name').focus();
        return true;
    })()`);
    try {
        if (await seedPlaces(app, [], [[url, 'Editor Seed']]) !== 'ok' || !(await settle(() => readStar(app), v => v.filled)).filled) {
            return fail(`${BROKEN} the page could not be bookmarked chrome-side before the editor checks`);
        }
        const [seed] = await bookmarksOf(app, url);
        if (!seed || seed.folder !== 'unfiled') {
            return fail(`${BROKEN} the seeded bookmark is not in Other Bookmarks: ${JSON.stringify(seed)}`);
        }
        await clickStar(app);
        let view = await settle(() => readStar(app), v => !!v.editor);
        if (!view.editor || view.editor.heading !== EDIT_BOOKMARK_HEADING || view.editor.name !== 'Editor Seed' || !view.editor.nameSelected
            || view.editor.folders.length !== 3) {
            return fail(`the star on a bookmarked page must open the editor headed ${JSON.stringify(EDIT_BOOKMARK_HEADING)} with Name "Editor Seed" selected and three folders; saw ${JSON.stringify(view.editor)}`);
        }
        if ((await bookmarksOf(app, url)).length !== 1) {
            fail('opening the editor on a bookmarked page made a second bookmark');
        }

        // Esc after typing saves nothing.
        await setName('Discarded Name');
        await pressKey(app, ESCAPE);
        await settle(() => readStar(app), v => !v.editor);
        await sleep(500);
        if ((await bookmarksOf(app, url))[0]?.title !== 'Editor Seed') {
            fail(`Esc saved the typed name: Places holds ${JSON.stringify(await bookmarksOf(app, url))}`);
        }

        // Rename and move with Enter.
        await clickStar(app);
        await settle(() => readStar(app), v => !!v.editor);
        await setName('Renamed Bookmark');
        if (await pickFolder(FOLDER_MENU_LABEL) !== true) {
            return fail(`${BROKEN} the ${FOLDER_MENU_LABEL} radio was not found`);
        }
        await pressKey(app, ENTER);
        const moved = await settle(() => bookmarksOf(app, url), v => v[0]?.title === 'Renamed Bookmark' && v[0]?.folder === 'menu', 8000);
        if (moved[0]?.title !== 'Renamed Bookmark' || moved[0]?.folder !== 'menu') {
            fail(`Enter in the editor must save the name and move the bookmark to the menu folder; Places holds ${JSON.stringify(moved)}`);
        }
        view = await settle(() => readStar(app), v => !v.editor && v.focused);
        if (view.editor || !view.focused) {
            fail(`Done must close the editor and return focus to the star; saw ${JSON.stringify(view)}`);
        }
        await clickStar(app);
        view = await settle(() => readStar(app), v => v.editor?.folder === FOLDER_MENU_LABEL);
        if (view.editor?.folder !== FOLDER_MENU_LABEL) {
            fail(`reopening the editor must show the bookmark's folder ${JSON.stringify(FOLDER_MENU_LABEL)} checked; saw ${JSON.stringify(view.editor)}`);
        }
        await pressKey(app, ESCAPE);

        // A refused write: the failure row, the panel and the typed text stay.
        if (await probe(app, `get('ChromeStoreClient').updateBookmark = async () => { throw new Error('stubbed refusal'); }; return true;`) !== true) {
            return fail(`${BROKEN} the client's updateBookmark could not be stubbed to refuse`);
        }
        try {
            await clickStar(app);
            await settle(() => readStar(app), v => !!v.editor);
            await setName('Refused Name');
            await pickFolder(FOLDER_TOOLBAR_LABEL);
            await pressKey(app, ENTER);
            view = await settle(() => readStar(app), v => !!v.editor?.failure);
            if (!view.editor || !view.editor.failure.startsWith(subject) || !view.editor.failure.includes("couldn't save that bookmark") || view.editor.name !== 'Refused Name') {
                fail(`a refused save must keep the editor open with "Refused Name" and a failure row starting ${JSON.stringify(subject)}; saw ${JSON.stringify(view.editor)}`);
            }
        } finally {
            await probe(app, `delete get('ChromeStoreClient').updateBookmark; return true;`);
        }
        await pressKey(app, ESCAPE);
        await settle(() => readStar(app), v => !v.editor);

        // Remove runs at once: one click, no second confirm, the star unfills.
        await clickStar(app);
        await settle(() => readStar(app), v => !!v.editor);
        await app.evaluate(`(() => { const b = document.querySelector('.pb-bookmark-editor-remove'); if (b) b.click(); return !!b; })()`);
        const gone = await settle(() => bookmarksOf(app, url), v => Array.isArray(v) && v.length === 0, 5000);
        if (!Array.isArray(gone) || gone.length !== 0) {
            fail(`Remove did not remove the bookmark at once (no second confirm): Places holds ${JSON.stringify(gone)}`);
        }
        view = await settle(() => readStar(app), v => !v.editor && v.outline);
        if (view.editor || !view.outline) {
            fail(`after Remove the editor must close and the star unfill; saw ${JSON.stringify(view)}`);
        }
    } finally {
        await probe(app, `const bar = get('AddressBar'); delete bar.removeFromBookmarkEditor; bar.closeBookmarkEditor(false); return true;`);
        await unbookmark(app, url);
    }
}

/**
 * D-15 / KEY ruling, both focus paths: Ctrl+D runs the bookmark-page command
 * with the Theia frame focused (the pill) and the page-key row with the page
 * focused, each opening the editor on a new Places bookmark; in the README.md
 * editor Ctrl+D keeps Monaco's meaning (a second selection appears on the
 * repeated word) and opens no editor.
 */
async function bookmarkKeys(ctx) {
    const { app, pages, plant, fail, note } = ctx;
    if (!controlPassed(ctx.results, 'bookmark-keys')) {
        return 'not-scored';
    }
    const dir = await openWorkspace(ctx);
    const tabId = await openLocalTab(app, pages, '/bm-keys');
    await showTab(app, tabId, 'bookmark-keys');
    const url = localUrl(pages, '/bm-keys');
    await installFireRecorder(app);
    if (plant === 'ctrl-d-everywhere' && await probe(app, `window.__pbCtrlDPlant = get('KeybindingRegistry').registerKeybinding({ command: ${JSON.stringify(BOOKMARK_PAGE_COMMAND)}, keybinding: 'ctrlcmd+d' }); return true;`) === true) {
        note('PLANT ctrl-d-everywhere applied');
    }
    try {
        for (const [label, focus, row] of [['Ctrl+D with the pill focused', () => focusPill(app), false], ['Ctrl+D with the page focused', () => focusOverlay(app, tabId), true]]) {
            if (await unbookmark(app, url) !== 'ok' || !(await settle(() => readStar(app), v => v.outline)).outline) {
                return fail(`${BROKEN} the page could not be unbookmarked before ${label}`);
            }
            const fired = (await app.evaluateIn(app.chrome, 'JSON.stringify(window.__pbFired || [])').then(JSON.parse)).length;
            if (await focus() === false) {
                return fail(`${BROKEN} focus could not be placed for ${label}`);
            }
            await pressKey(app, CTRL_D);
            const rows = await settle(() => bookmarksOf(app, url), v => Array.isArray(v) && v.length === 1, 8000);
            if (!Array.isArray(rows) || rows.length !== 1) {
                fail(`${label} must bookmark the page once in Places; Places holds ${JSON.stringify(rows)}`);
            }
            const firedNow = (await app.evaluateIn(app.chrome, 'JSON.stringify(window.__pbFired || [])').then(JSON.parse)).slice(fired);
            if (row !== firedNow.includes('bookmarkPage')) {
                fail(`${label} must ${row ? '' : 'not '}fire the bookmarkPage page-key row; rows fired ${JSON.stringify(firedNow)}`);
            }
            await expectEditorThenEsc(app, fail, label);
        }

        // KEY-04: in an editor Monaco keeps Ctrl+D (add the next occurrence to the selection).
        await unbookmark(app, url);
        if (await focusTheiaFrame(app) !== true || await focusReadmeEditor(app, dir) !== true) {
            return fail(`${BROKEN} the README.md editor could not be opened and focused`);
        }
        await probe(app, `const c = get('EditorManager').currentEditor.editor.getControl();
            c.setSelection({ startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 6 }); return true;`);
        await pressKey(app, CTRL_D);
        const selections = await settle(() => probe(app, `return get('EditorManager').currentEditor?.editor.getControl().getSelections().length ?? 0;`), n => n >= 2, 3000);
        if (selections < 2) {
            fail(`Ctrl+D in the README.md editor must keep Monaco's meaning (a second "probe" selected); the editor has ${selections} selection(s)`);
        }
        const after = await readStar(app);
        if (after.editor) {
            fail('Ctrl+D in the README.md editor opened the bookmark editor');
        }
        if ((await bookmarksOf(app, url)).length) {
            fail('Ctrl+D in the README.md editor bookmarked the page');
        }
    } finally {
        await probe(app, `get('AddressBar').closeBookmarkEditor(false);
            if (window.__pbCtrlDPlant) { window.__pbCtrlDPlant.dispose(); delete window.__pbCtrlDPlant; }
            const ed = get('EditorManager').currentEditor;
            if (ed && ed.editor.document && ed.editor.document.revert) { await ed.editor.document.revert(); }
            return true;`);
        await unbookmark(app, url);
    }
}

// Phase 33 plan 03 (BMK-03, BMK-04, BMK-06, D-15): the bookmarks toolbar, reopen closed tab and the History submenu.
const SHORTCUTS_REL = 'theia/extensions/chrome-bar/src/browser/chrome-bar-shortcuts.ts';
const TOOLBAR_PREFERENCE = sourceConst('theia/extensions/chrome-bar/src/browser/chrome-bar-preferences.ts', 'SHOW_BOOKMARKS_TOOLBAR_PREFERENCE');
const HISTORY_MENU_ROWS = Number(sourceMatch('theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx', /const HISTORY_MENU_ROWS = (\d+);/));
const copyPlain = key => sourceMatch(CHROME_BAR_COPY_REL, new RegExp(`\\b${key}: '([^']+)'`));
const APP_MENU_LABEL = copyPlain('appMenu');
const HISTORY_ROW = copyPlain('menuHistory');
const REOPEN_ROW = copyPlain('reopenClosedTab');
const CLOSED_HEADER = copyPlain('recentlyClosedTabs');
const RECENT_HEADER = copyPlain('recentPages');
const NO_CLOSED = copyPlain('noClosedTabs');
const NO_RECENT = copyPlain('noRecentPages');
const TOOLBAR_MORE = copyPlain('bookmarksToolbarMore');

/** A PAGE_SHORTCUTS row's key as a pressKey event, derived from the table (letter keys only). */
function rowKey(id) {
    const key = sourceMatch(SHORTCUTS_REL, new RegExp(`id: '${id}', key: '([A-Z])'`));
    const modifiers = sourceMatch(SHORTCUTS_REL, new RegExp(`id: '${id}', key: '[A-Z]', modifiers: '([^']+)'`)).split(',');
    return { key, code: `Key${key}`, keyCode: key.charCodeAt(0), modifiers };
}
const REOPEN_KEY = rowKey('reopenClosedTab');
const TOOLBAR_KEY = rowKey('toggleBookmarksToolbar');

/** The toolbar as drawn, with the geometry it must keep: one 28px row above the main area, never scrolled. */
const readToolbar = app => app.evaluate(`JSON.stringify((() => {
    const row = document.querySelector('.pb-bookmarks-toolbar');
    const panel = document.getElementById('theia-top-panel');
    const main = document.getElementById('theia-main-content-panel');
    const box = e => { const r = e.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right), height: Math.round(r.height) }; };
    const chevron = row && row.querySelector('.pb-bookmarks-toolbar-chevron');
    return {
        shown: !!row,
        height: row ? box(row).height : 0,
        bottom: row ? box(row).bottom : 0,
        scrollLeft: row ? row.scrollLeft : 0,
        items: row ? [...row.querySelectorAll('.pb-bookmarks-toolbar-item')].map(i => ({
            label: (i.querySelector('.pb-bookmarks-toolbar-label') || {}).textContent || '',
            hidden: i.classList.contains('is-overflow'),
            top: box(i).top,
            right: box(i).right,
        })) : [],
        chevron: chevron ? { ...box(chevron), label: chevron.getAttribute('aria-label') } : null,
        failure: row ? ((row.querySelector('.pb-bookmarks-toolbar-failed') || {}).textContent || '') : '',
        panel: panel ? box(panel).height : 0,
        mainTop: main ? box(main).top : null,
    };
})())`).then(JSON.parse);

/** Chrome scope, Places' own read (the independent observer): the toolbar folder's web bookmarks, title or address, in order. */
const toolbarFolder = app => inChrome(app, `return (async () => {
    try {
        const { PlacesUtils } = ChromeUtils.importESModule('resource://gre/modules/PlacesUtils.sys.mjs');
        const tree = await PlacesUtils.promiseBookmarksTree(PlacesUtils.bookmarks.toolbarGuid);
        return JSON.stringify((tree.children || []).filter(c => /^https?:/.test(c.uri || '')).map(c => c.title || c.uri));
    } catch (e) {
        return JSON.stringify({ error: String(e) });
    }
})();`).then(JSON.parse);

/** Chrome scope: a toolbar bookmark on each `[url, title]`, appended in order, as another window would add it. */
const seedToolbar = (app, rows) => inChrome(app, `return (async () => {
    try {
        const { PlacesUtils } = ChromeUtils.importESModule('resource://gre/modules/PlacesUtils.sys.mjs');
        for (const [url, title] of ${JSON.stringify(rows)}) {
            await PlacesUtils.bookmarks.insert({ parentGuid: PlacesUtils.bookmarks.toolbarGuid, url, title });
        }
        return 'ok';
    } catch (e) {
        return 'error: ' + e;
    }
})();`);

/** The visible .lm-Menu elements in order, each as its drawn items (collapsed separators dropped). */
const readOpenMenus = app => app.evaluate(`JSON.stringify([...document.querySelectorAll('.lm-Menu')].filter(m => m.getClientRects().length > 0).map(m =>
    [...m.querySelectorAll('.lm-Menu-item')].filter(i => !i.classList.contains('lm-mod-collapsed')).map(i => ({
        separator: i.getAttribute('data-type') === 'separator',
        label: (i.querySelector('.lm-Menu-itemLabel') || {}).textContent || '',
        shortcut: (i.querySelector('.lm-Menu-itemShortcut') || {}).textContent || '',
        disabled: i.classList.contains('lm-mod-disabled'),
    }))))`).then(JSON.parse);

/** Points at the row `label` of visible menu `index` as a pointer does (move, then mouse-up unless `hover`); `mods` such as { ctrlKey: true }. */
const pointMenuRow = (app, index, label, { hover = false, mods = {} } = {}) => app.evaluate(`(() => {
    const menu = [...document.querySelectorAll('.lm-Menu')].filter(m => m.getClientRects().length > 0)[${index}];
    const item = menu && [...menu.querySelectorAll('.lm-Menu-item')].find(i => ((i.querySelector('.lm-Menu-itemLabel') || {}).textContent || '') === ${JSON.stringify(label)});
    if (!item) return false;
    const r = item.getBoundingClientRect();
    const at = { bubbles: true, cancelable: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, ...${JSON.stringify(mods)} };
    item.dispatchEvent(new MouseEvent('mousemove', at));
    if (!${hover}) item.dispatchEvent(new MouseEvent('mouseup', { ...at, button: 0 }));
    return true;
})()`);

/** Closes every open menu, innermost first (Esc on each). */
const closeOpenMenus = app => app.evaluate(`(() => {
    for (const m of [...document.querySelectorAll('.lm-Menu')].filter(m => m.getClientRects().length > 0).reverse()) {
        m.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true, cancelable: true }));
    }
    return true;
})()`);

/** The main-area web tabs as { tabId, url }, in shell order. */
const webTabsNow = app => probe(app, `return get('ApplicationShell').getWidgets('main').filter(w => typeof w.tabId === 'string').map(w => ({ tabId: w.tabId, url: w.url || '' }));`);

/** The one web tab in `after` not in `before`, once it has an http(s) address; null when none appeared. */
async function newWebTab(app, before) {
    const known = new Set(before.map(t => t.tabId));
    const after = await settle(() => webTabsNow(app), v => Array.isArray(v) && v.some(t => !known.has(t.tabId) && /^https?:/.test(t.url)), 8000);
    return (Array.isArray(after) ? after : []).find(t => !known.has(t.tabId) && /^https?:/.test(t.url)) ?? null;
}

const closeWebTab = (app, tabId) => probe(app, `const w = get('WebTabChannel').widgetOf(${JSON.stringify(tabId)}); if (w) { await get('ApplicationShell').closeWidget(w.id); } return true;`);

/** A web tab's own session history, as paths, or [] when it cannot be read. */
const historyPaths = (app, tabId) => probe(app, `const r = await get('WebTabChannel').widgetOf(${JSON.stringify(tabId)}).history();
    return r && r.ok && r.where === 'done' ? (r.entries || []).map(e => e.url) : [];`).then(urls => (Array.isArray(urls) ? urls.map(pathOf) : []));

/** Opens the hamburger and hovers its History row; returns the submenu's items, or throws a broken instrument. */
async function openHistorySubmenu(app) {
    const opened = await app.evaluate(`(() => { const b = document.querySelector('.pb-chrome-bar button[aria-label=${JSON.stringify(APP_MENU_LABEL)}]'); if (!b) return false; b.click(); return true; })()`);
    const root = opened === true ? await settle(() => readOpenMenus(app), m => m.length === 1 && m[0].some(i => i.label === HISTORY_ROW), 10000) : [];
    if (root.length !== 1) {
        throw new Error(`${BROKEN} the hamburger did not open with a ${HISTORY_ROW} row (${JSON.stringify(root)})`);
    }
    await pointMenuRow(app, 0, HISTORY_ROW, { hover: true });
    const menus = await settle(() => readOpenMenus(app), m => m.length === 2 && m[1].length > 0, 5000);
    if (menus.length !== 2) {
        throw new Error(`${BROKEN} hovering ${HISTORY_ROW} opened no submenu (${JSON.stringify(menus)})`);
    }
    return menus[1];
}

/** The History submenu cut at its separators: the rows before the first, then each section. */
function historySections(items) {
    const sections = [[]];
    for (const item of items) {
        if (item.separator) {
            sections.push([]);
        } else {
            sections[sections.length - 1].push(item);
        }
    }
    return sections.filter((section, i) => i === 0 || section.length);
}

/**
 * BMK-04 (D-04, D-05): Ctrl+Shift+B with the pill focused shows the 28px
 * toolbar row, growing the top panel by exactly 28px with the main area below
 * it, in every PowerBrowser mode; its items are the toolbar folder in Places
 * order (read back chrome-side); a bookmark added or removed in chrome appears
 * or vanishes with no reload (the bookmarks-changed push); an overflowing row
 * stays one unscrolled row and its chevron lists exactly the hidden items; a
 * refused read shows the failure row and no items; Ctrl+Shift+B with the page
 * focused (its relay row) hides it and gives the 28px back.
 */
async function bookmarksToolbar(ctx) {
    const { app, pages, plant, fail, note } = ctx;
    const tabId = await sessionTab(ctx);
    const uiMode = await bodyMode(app);
    const subject = (await app.evaluate(appNameExpr)) || 'The browser';
    const seeded = ['/tb-a', '/tb-b'].map(path => [pages.url(path), PAGES[path].title]);
    const added = [pages.url('/tb-c'), PAGES['/tb-c'].title];
    const many = Array.from({ length: 30 }, (_, i) => [pages.url(`/tb-a?n=${i}`), `Overflow bookmark ${i} with a long title`]);
    const refusedTrigger = [pages.url('/tb-b?refused'), 'Refused read trigger'];
    await installFireRecorder(app);
    try {
        if (await setPref(app, TOOLBAR_PREFERENCE, false) !== true) {
            return fail(`${BROKEN} the toolbar setting could not be turned off`);
        }
        const before = await settle(() => readToolbar(app), v => !v.shown);
        if (before.shown) {
            return fail(`${BROKEN} the toolbar is still shown with its setting off`);
        }
        if (await seedToolbar(app, seeded) !== 'ok') {
            return fail(`${BROKEN} the toolbar bookmarks could not be seeded chrome-side`);
        }

        // Theia-focused Ctrl+Shift+B (the keybinding).
        await focusPill(app);
        await pressKey(app, TOOLBAR_KEY);
        let view = await settle(() => readToolbar(app), v => v.shown && v.items.length >= seeded.length);
        if (!view.shown || view.height !== 28) {
            return fail(`Ctrl+Shift+B with the pill focused must show the 28px bookmarks toolbar; saw ${JSON.stringify(view)}`);
        }
        if (view.panel - before.panel !== 28) {
            fail(`the top panel must grow by exactly 28px while the toolbar shows; it went from ${before.panel}px to ${view.panel}px`);
        }
        if (view.mainTop !== null && view.bottom > view.mainTop) {
            fail(`the toolbar overlays the main area (toolbar bottom ${view.bottom}, main area top ${view.mainTop})`);
        }
        const folder = await toolbarFolder(app);
        if (!Array.isArray(folder) || JSON.stringify(view.items.map(i => i.label)) !== JSON.stringify(folder)) {
            fail(`the toolbar items must be the toolbar folder in Places order ${JSON.stringify(folder)}; saw ${JSON.stringify(view.items.map(i => i.label))}`);
        }

        // Every PowerBrowser mode (D-04).
        for (const id of ['coding', 'browsing', 'organising']) {
            await switchUiMode(app, id);
            await showTab(app, tabId, `bookmarks-toolbar in ${id}`);
            const inMode = await settle(() => readToolbar(app), v => v.shown && v.height === 28);
            if (!inMode.shown || inMode.height !== 28 || (inMode.mainTop !== null && inMode.bottom > inMode.mainTop)) {
                fail(`the toolbar must show as a 28px row above the main area in ${id}; saw ${JSON.stringify(inMode)}`);
            }
        }
        if (uiMode) {
            await switchUiMode(app, uiMode);
        }
        await showTab(app, tabId, 'bookmarks-toolbar');

        if (plant === 'toolbar-ignores-push' && await probe(app, `get('ChromeBarWidget').refreshBookmarksToolbar = async function () {}; return true;`) === true) {
            note('PLANT toolbar-ignores-push applied');
        }
        // D-05: chrome-side changes appear and vanish with no reload.
        if (await seedToolbar(app, [added]) !== 'ok') {
            return fail(`${BROKEN} a toolbar bookmark could not be added chrome-side`);
        }
        view = await settle(() => readToolbar(app), v => v.items.some(i => i.label === added[1]));
        if (!view.items.some(i => i.label === added[1])) {
            fail(`the toolbar did not show a bookmark added in chrome (the bookmarks-changed push); items ${JSON.stringify(view.items.map(i => i.label))}`);
        }
        if (await unbookmark(app, seeded[0][0]) !== 'ok') {
            return fail(`${BROKEN} a toolbar bookmark could not be removed chrome-side`);
        }
        view = await settle(() => readToolbar(app), v => !v.items.some(i => i.label === seeded[0][1]));
        if (view.items.some(i => i.label === seeded[0][1])) {
            fail(`the toolbar still shows a bookmark removed in chrome (the bookmarks-changed push)`);
        }
        await probe(app, `delete get('ChromeBarWidget').refreshBookmarksToolbar; return true;`);

        // Overflow: one row that never wraps or scrolls; the chevron lists exactly the hidden items.
        if (await seedToolbar(app, many) !== 'ok') {
            return fail(`${BROKEN} the overflow bookmarks could not be seeded chrome-side`);
        }
        view = await settle(() => readToolbar(app), v => !!v.chevron && v.items.some(i => i.hidden));
        const hidden = view.items.filter(i => i.hidden).map(i => i.label);
        if (!view.chevron || !hidden.length || view.chevron.label !== TOOLBAR_MORE) {
            fail(`an overflowing toolbar must show the chevron labelled ${JSON.stringify(TOOLBAR_MORE)} with items hidden behind it; saw ${JSON.stringify({ chevron: view.chevron, hidden: hidden.length })}`);
        } else {
            if (view.height !== 28 || new Set(view.items.map(i => i.top)).size !== 1 || view.scrollLeft !== 0) {
                fail(`the overflowing toolbar must stay one 28px row that never scrolls; height ${view.height}, item rows ${new Set(view.items.map(i => i.top)).size}, scrollLeft ${view.scrollLeft}`);
            }
            if (view.items.some(i => !i.hidden && i.right > view.chevron.left)) {
                fail('a shown toolbar item runs under the chevron');
            }
            await app.evaluate(`(() => { const c = document.querySelector('.pb-bookmarks-toolbar-chevron'); if (c) c.click(); return !!c; })()`);
            const menus = await settle(() => readOpenMenus(app), m => m.length === 1);
            const listed = (menus[0] ?? []).filter(i => !i.separator).map(i => i.label);
            if (listed.length !== hidden.length || hidden.some(label => !listed.includes(label))) {
                fail(`the chevron menu must list exactly the hidden items ${JSON.stringify(hidden)}; saw ${JSON.stringify(listed)}`);
            }
            await closeOpenMenus(app);
        }

        // A refused read: the failure row, never stale items.
        if (await probe(app, `get('ChromeStoreClient').listBookmarkFolder = async () => { throw new Error('stubbed refusal'); }; return true;`) !== true) {
            return fail(`${BROKEN} the client's listBookmarkFolder could not be stubbed to refuse`);
        }
        try {
            if (await seedToolbar(app, [refusedTrigger]) !== 'ok') {
                return fail(`${BROKEN} the refusal trigger bookmark could not be added chrome-side`);
            }
            view = await settle(() => readToolbar(app), v => !!v.failure);
            if (!view.failure.startsWith(subject) || view.items.length) {
                fail(`a refused toolbar read must show only the failure row starting ${JSON.stringify(subject)}; saw ${JSON.stringify({ failure: view.failure, items: view.items.length })}`);
            }
        } finally {
            await probe(app, `delete get('ChromeStoreClient').listBookmarkFolder; return true;`);
        }

        // Page-focused Ctrl+Shift+B (the relay row) hides it and gives the 28px back.
        if (await focusOverlay(app, tabId) !== true) {
            return fail(`${BROKEN} the session tab's page could not be focused`);
        }
        const fired = (await firedRows(app)).length;
        await pressKey(app, TOOLBAR_KEY);
        view = await settle(() => readToolbar(app), v => !v.shown);
        if (view.shown) {
            fail('Ctrl+Shift+B with the page focused must hide the toolbar');
        }
        if (!(await firedRows(app)).slice(fired).includes('toggleBookmarksToolbar')) {
            fail('Ctrl+Shift+B with the page focused must fire the toggleBookmarksToolbar page-key row');
        }
        if (!view.shown && view.panel !== before.panel) {
            fail(`hiding the toolbar must give the 28px back; the top panel is ${view.panel}px, it was ${before.panel}px`);
        }
    } finally {
        await probe(app, `delete get('ChromeStoreClient').listBookmarkFolder; delete get('ChromeBarWidget').refreshBookmarksToolbar; return true;`);
        await closeOpenMenus(app).catch(() => undefined);
        for (const [url] of [...seeded, added, ...many, refusedTrigger]) {
            await unbookmark(app, url);
        }
        await setPref(app, TOOLBAR_PREFERENCE, false).catch(() => undefined);
        if (uiMode) {
            await switchUiMode(app, uiMode).catch(() => undefined);
        }
    }
}

/**
 * BMK-03 (D-07, T-33-02): two closed tabs, the older one having walked
 * /rc-a -> /rc-b. Ctrl+Shift+T with the pill focused reopens the newest
 * (/rc-c) first; Ctrl+Shift+T with the page focused (its relay row) reopens
 * the next one WITH its own back/forward history (/rc-a then /rc-b, and Back
 * walks to /rc-a); with nothing closed the key opens no tab.
 */
async function reopenClosed(ctx) {
    const { app, pages, plant, fail, note } = ctx;
    await sessionTab(ctx);
    const opened = [];
    const closedUrls = () => probe(app, `return (await get('ChromeStoreClient').listClosedTabs(25)).map(r => r.url);`);
    if (plant === 'reopen-no-history' && await probe(app, `get('ProfileStorageService').armWebTabHistory = async () => true; return true;`) === true) {
        note('PLANT reopen-no-history applied');
    }
    try {
        const walked = await openWebTab(app, pages.url('/rc-a'));
        if (await waitForPush(app, loadedAt(walked, '/rc-a')) < 0) {
            return fail(`${BROKEN} no loaded state push arrived for /rc-a`);
        }
        const from = (await pushes(app)).length;
        await probe(app, `await get('WebTabChannel').widgetOf(${JSON.stringify(walked)}).navigate(${JSON.stringify(pages.url('/rc-b'))}); return true;`);
        if (await waitForPush(app, loadedAt(walked, '/rc-b'), { from }) < 0) {
            return fail(`${BROKEN} no loaded state push arrived for /rc-b`);
        }
        await closeWebTab(app, walked);
        const single = await openWebTab(app, pages.url('/rc-c'));
        if (await waitForPush(app, loadedAt(single, '/rc-c')) < 0) {
            return fail(`${BROKEN} no loaded state push arrived for /rc-c`);
        }
        await closeWebTab(app, single);
        const closed = await settle(closedUrls, v => Array.isArray(v) && pathOf(v[0]) === '/rc-c' && pathOf(v[1]) === '/rc-b', 8000);
        if (!Array.isArray(closed) || pathOf(closed[0]) !== '/rc-c' || pathOf(closed[1]) !== '/rc-b') {
            return fail(`${BROKEN} the two closed tabs are not the newest closed rows: ${JSON.stringify(closed)}`);
        }

        // Theia-focused: the newest closed tab first.
        let tabs = await webTabsNow(app);
        await focusPill(app);
        await pressKey(app, REOPEN_KEY);
        const first = await newWebTab(app, tabs);
        if (!first || pathOf(first.url) !== '/rc-c') {
            return fail(`Ctrl+Shift+T with the pill focused must reopen the most recently closed tab (/rc-c) first; the new tab is ${JSON.stringify(first)}`);
        }
        opened.push(first.tabId);

        // Page-focused (the relay row): the next one, with its own history.
        await installFireRecorder(app);
        if (await focusOverlay(app, first.tabId) !== true) {
            return fail(`${BROKEN} the reopened tab's page could not be focused`);
        }
        const fired = (await firedRows(app)).length;
        tabs = await webTabsNow(app);
        await pressKey(app, REOPEN_KEY);
        const second = await newWebTab(app, tabs);
        if (!(await firedRows(app)).slice(fired).includes('reopenClosedTab')) {
            fail('Ctrl+Shift+T with the page focused must fire the reopenClosedTab page-key row');
        }
        if (!second || pathOf(second.url) !== '/rc-b') {
            return fail(`Ctrl+Shift+T with the page focused must reopen the next closed tab (/rc-b); the new tab is ${JSON.stringify(second)}`);
        }
        opened.push(second.tabId);
        const paths = await settle(() => historyPaths(app, second.tabId), v => v.includes('/rc-a') && v.includes('/rc-b'), 8000);
        if (!paths.includes('/rc-a') || !paths.includes('/rc-b')) {
            fail(`the reopened tab has no back/forward history: its entries are ${JSON.stringify(paths)}, expected /rc-a then /rc-b`);
        } else {
            const mark = (await pushes(app)).length;
            await probe(app, `get('WebTabChannel').widgetOf(${JSON.stringify(second.tabId)}).back(); return true;`);
            if (await waitForPush(app, loadedAt(second.tabId, '/rc-a'), { from: mark }) < 0) {
                fail('Back in the reopened tab did not walk to /rc-a');
            }
        }

        // Nothing closed (chrome answers null): the same key that just opened two tabs opens none.
        await probe(app, `get('ChromeStoreClient').reopenClosedTab = async () => null; return true;`);
        tabs = await webTabsNow(app);
        await focusPill(app);
        await pressKey(app, REOPEN_KEY);
        await sleep(1500);
        if ((await webTabsNow(app)).length !== tabs.length) {
            fail('Ctrl+Shift+T with nothing closed opened a tab');
        }
    } finally {
        await probe(app, `delete get('ChromeStoreClient').reopenClosedTab; delete get('ProfileStorageService').armWebTabHistory; return true;`);
        for (const id of opened) {
            await closeWebTab(app, id).catch(() => undefined);
        }
    }
}

/**
 * BMK-06 (D-08): the History submenu of the hamburger (no chrome-bar button
 * of its own) opens on an enabled Reopen Closed Tab row with its key, then the
 * Recently closed tabs section (the newest HISTORY_MENU_ROWS closed tabs,
 * newest first), then the Recent pages section (capped, the newest visit
 * first). A closed row reopens with its history; a recent page loads in the
 * current tab, and in a new background tab with Ctrl; empty reads show the
 * disabled "No ..." rows and disable the reopen row.
 */
async function historyMenu(ctx) {
    const { app, pages, plant, fail, note } = ctx;
    const tabId = await sessionTab(ctx);
    const opened = [];
    if (plant === 'recent-opens-new-tab' && await probe(app, `const w = get('ChromeBarWidget'); const open = Object.getPrototypeOf(w).openPlace;
        w.openPlace = function (url) { return open.call(this, url, 'background'); }; return true;`) === true) {
        note('PLANT recent-opens-new-tab applied');
    }
    try {
        const buttons = await app.evaluate(`JSON.stringify([...document.querySelectorAll('.pb-chrome-bar > button')].map(b => b.getAttribute('aria-label')))`).then(JSON.parse);
        if (buttons.includes(HISTORY_ROW)) {
            fail(`History must be a hamburger submenu, not a chrome-bar button; the bar's buttons are ${JSON.stringify(buttons)}`);
        }
        // HISTORY_MENU_ROWS + 1 closed tabs; the newest walked /hm-c<last> -> /hm-b, so its row carries history.
        const last = HISTORY_MENU_ROWS + 1;
        for (let i = 1; i <= last; i++) {
            const path = `/hm-c${i}`;
            const id = await openWebTab(app, pages.url(path));
            if (await waitForPush(app, loadedAt(id, path)) < 0) {
                return fail(`${BROKEN} no loaded state push arrived for ${path}`);
            }
            if (i === last) {
                const from = (await pushes(app)).length;
                await probe(app, `await get('WebTabChannel').widgetOf(${JSON.stringify(id)}).navigate(${JSON.stringify(pages.url('/hm-b'))}); return true;`);
                if (await waitForPush(app, loadedAt(id, '/hm-b'), { from }) < 0) {
                    return fail(`${BROKEN} no loaded state push arrived for /hm-b`);
                }
            }
            await closeWebTab(app, id);
        }
        const wantClosed = [PAGES['/hm-b'].title, ...Array.from({ length: HISTORY_MENU_ROWS - 1 }, (_, i) => PAGES[`/hm-c${last - 1 - i}`].title)];
        await showTab(app, tabId, 'history-menu');

        let [top, closedSection, recentSection] = historySections(await openHistorySubmenu(app));
        const reopenRow = top?.[0];
        if (top?.length !== 1 || reopenRow.label !== REOPEN_ROW || reopenRow.disabled || !reopenRow.shortcut) {
            fail(`the History submenu must open on one enabled ${JSON.stringify(REOPEN_ROW)} row showing its key; saw ${JSON.stringify(top)}`);
        }
        if (closedSection?.[0]?.label !== CLOSED_HEADER || !closedSection[0].disabled) {
            fail(`the second section must open on the disabled ${JSON.stringify(CLOSED_HEADER)} header; saw ${JSON.stringify(closedSection?.[0])}`);
        }
        const closedLabels = (closedSection ?? []).slice(1).map(i => i.label);
        if (JSON.stringify(closedLabels) !== JSON.stringify(wantClosed)) {
            fail(`the closed tabs section must list the ${HISTORY_MENU_ROWS} newest closed tabs, newest first, ${JSON.stringify(wantClosed)}; saw ${JSON.stringify(closedLabels)}`);
        }
        if (recentSection?.[0]?.label !== RECENT_HEADER || !recentSection[0].disabled) {
            fail(`the third section must open on the disabled ${JSON.stringify(RECENT_HEADER)} header; saw ${JSON.stringify(recentSection?.[0])}`);
        }
        const recentLabels = (recentSection ?? []).slice(1).map(i => i.label);
        if (recentLabels.length !== HISTORY_MENU_ROWS || recentLabels[0] !== PAGES['/hm-b'].title) {
            fail(`the recent pages section must hold ${HISTORY_MENU_ROWS} rows (more were visited), the newest visit (${PAGES['/hm-b'].title}) first; saw ${JSON.stringify(recentLabels)}`);
        }

        // A closed row reopens with its history.
        let tabs = await webTabsNow(app);
        await pointMenuRow(app, 1, wantClosed[0]);
        const reopened = await newWebTab(app, tabs);
        if (!reopened || pathOf(reopened.url) !== '/hm-b') {
            fail(`choosing the newest closed row must reopen /hm-b; the new tab is ${JSON.stringify(reopened)}`);
        } else {
            opened.push(reopened.tabId);
            const paths = await settle(() => historyPaths(app, reopened.tabId), v => v.includes(`/hm-c${last}`), 8000);
            if (!paths.includes(`/hm-c${last}`) || !paths.includes('/hm-b')) {
                fail(`the closed row reopened without its history: entries ${JSON.stringify(paths)}`);
            }
        }

        // A recent page loads in the current tab; Ctrl opens it in a new background tab.
        const target = PAGES[`/hm-c${last - 1}`].title;
        await showTab(app, tabId, 'history-menu');
        [, , recentSection] = historySections(await openHistorySubmenu(app));
        if (!(recentSection ?? []).some(i => i.label === target)) {
            await closeOpenMenus(app);
            return fail(`${BROKEN} the recent pages section does not list ${target}`);
        }
        tabs = await webTabsNow(app);
        let mark = (await pushes(app)).length;
        await pointMenuRow(app, 1, target);
        if (await waitForPush(app, loadedAt(tabId, `/hm-c${last - 1}`), { from: mark }) < 0 || (await webTabsNow(app)).length !== tabs.length) {
            fail(`a recent page must load in the current tab: no load of /hm-c${last - 1} in the session tab, or a tab was opened (${(await webTabsNow(app)).length} tabs, ${tabs.length} before)`);
        }
        [, , recentSection] = historySections(await openHistorySubmenu(app));
        const other = (recentSection ?? []).slice(1).find(i => i.label !== target && !i.disabled);
        if (other) {
            tabs = await webTabsNow(app);
            await pointMenuRow(app, 1, other.label, { mods: { ctrlKey: true } });
            const background = await newWebTab(app, tabs);
            const current = await probe(app, `return get('ApplicationShell').mainPanel.currentTitle?.owner?.tabId ?? null;`);
            if (!background || current !== tabId) {
                fail(`Ctrl on a recent page must open it in a new background tab and keep the session tab current; new ${JSON.stringify(background)}, current ${JSON.stringify(current)}`);
            }
            if (background) {
                opened.push(background.tabId);
            }
        } else {
            await closeOpenMenus(app);
        }

        // Empty reads: the disabled "No ..." rows, and the reopen row disabled.
        await probe(app, `const c = get('ChromeStoreClient'); c.listClosedTabs = async () => []; c.searchPlaces = async () => []; return true;`);
        try {
            [top, closedSection, recentSection] = historySections(await openHistorySubmenu(app));
            const empty = { reopen: top?.[0], closed: closedSection?.slice(1), recent: recentSection?.slice(1) };
            if (!empty.reopen?.disabled || empty.closed?.length !== 1 || empty.closed[0].label !== NO_CLOSED || !empty.closed[0].disabled
                || empty.recent?.length !== 1 || empty.recent[0].label !== NO_RECENT || !empty.recent[0].disabled) {
                fail(`with nothing closed and no history the submenu must disable ${JSON.stringify(REOPEN_ROW)} and show the disabled ${JSON.stringify(NO_CLOSED)} and ${JSON.stringify(NO_RECENT)} rows; saw ${JSON.stringify(empty)}`);
            }
            await closeOpenMenus(app);
        } finally {
            await probe(app, `const c = get('ChromeStoreClient'); delete c.listClosedTabs; delete c.searchPlaces; return true;`);
        }
    } finally {
        await closeOpenMenus(app).catch(() => undefined);
        await probe(app, `delete get('ChromeBarWidget').openPlace;
            await get('WebTabChannel').widgetOf(${JSON.stringify(tabId)}).navigate(${JSON.stringify(pages.url('/start'))}); return true;`);
        for (const id of opened) {
            await closeWebTab(app, id).catch(() => undefined);
        }
    }
}

// Phase 33 plan 04 (BMK-05, D-09, D-10, T-33-04): the Clear Recent History picker and its fan-out.
const CHROME_BAR_WIDGET_REL = 'theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx';
const BOUNDARY_REL = 'powerbrowser/shell/PowerBrowserAPI.sys.mjs';
/** The picker's ranges in its order, with their labels: [{ range, label }], from the widget's own table and CHROME_BAR_COPY. */
const CLEAR_RANGES = [...sourceMatch(CHROME_BAR_WIDGET_REL, /const CLEAR_HISTORY_RANGES\b[^\n]*= \[\n([\s\S]*?)\n\];/)
    .matchAll(/range: '([^']+)', label: \(\) => CHROME_BAR_COPY\.(\w+)/g)]
    .map(m => ({ range: m[1], label: copyPlain(m[2]) }));
const CLEAR_ROW = copyPlain('clearRecentHistoryRow');
const CLEAR_HEADING = copyPlain('clearHistoryHeading');
const CLEAR_CONFIRM = copyPlain('clearHistoryConfirm');
const CLEAR_CANCEL = copyPlain('clearHistoryCancel');
const copyTemplate = key => sourceMatch(CHROME_BAR_COPY_REL, new RegExp(`\\b${key}: \\(subject: string\\) => \`([^\`]+)\``));
const CLEAR_FOOTNOTE = copyTemplate('clearHistoryFootnote');
const CLEAR_FAILED = copyTemplate('clearHistoryFailed');
const CLEAR_HISTORY_COMMAND = sourceConst('theia/extensions/chrome-bar/src/browser/chrome-bar-commands.ts', 'CHROME_BAR_CLEAR_HISTORY_COMMAND_ID');
const WEB_TAB_HISTORY_FILE = sourceMatch(BOUNDARY_REL, /const WEB_TAB_HISTORY_FILE_NAME = "([^"]+)"/);
/** The clearHistory PAGE_SHORTCUTS row's key (a keycode row) as a pressKey event. */
const CLEAR_KEY = (() => {
    const keycode = sourceMatch(SHORTCUTS_REL, /id: 'clearHistory', keycode: '(VK_[A-Z_]+)'/);
    const modifiers = sourceMatch(SHORTCUTS_REL, /id: 'clearHistory', keycode: '[^']+', modifiers: '([^']+)'/).split(',');
    if (keycode !== 'VK_DELETE') {
        throw new Error(`${BROKEN} the clearHistory row's keycode ${keycode} has no key event in this harness`);
    }
    return { key: 'Delete', code: 'Delete', keyCode: 46, modifiers };
})();
/** A planted card image; any non-null thumbnail would do. */
const PLANTED_THUMB = 'data:image/png;base64,cGJjaA==';

/** A range's begin as the picker's names say it (last N hours, today from local midnight); null for everything. */
function clearRangeBegin(range, now) {
    if (range === 'everything') {
        return null;
    }
    if (range === 'today') {
        return new Date(now).setHours(0, 0, 0, 0);
    }
    const hours = range === 'last-hour' ? 1 : Number(/^last-(\d+)-hours$/.exec(range)?.[1]);
    if (!Number.isInteger(hours) || hours < 1) {
        throw new Error(`${BROKEN} the range ${range} names no span this harness can plant around`);
    }
    return now - hours * 60 * 60 * 1000;
}

/** The picker as drawn: heading, range labels, the checked one, footnote, failure row, buttons, and whether it holds focus. */
const readPicker = app => app.evaluate(`JSON.stringify((() => {
    const panel = document.querySelector('.pb-clear-history');
    if (!panel) return { open: false };
    const text = sel => ((panel.querySelector(sel) || {}).textContent || '').trim();
    const ranges = [...panel.querySelectorAll('.pb-clear-history-range')];
    return {
        open: true,
        heading: text('.pb-clear-history-heading'),
        ranges: ranges.map(r => r.textContent.trim()),
        checked: ranges.filter(r => r.querySelector('input').checked).map(r => r.textContent.trim()),
        footnote: text('.pb-clear-history-footnote'),
        failure: text('.pb-clear-history-failure'),
        buttons: [...panel.querySelectorAll('.pb-clear-history-footer button')].map(b => b.textContent.trim()),
        focused: panel.contains(document.activeElement),
    };
})())`).then(JSON.parse);
/** Focuses and clicks the range radio labelled `label`; true when it is then checked. */
const choosePickerRange = (app, label) => app.evaluate(`(() => {
    const row = [...document.querySelectorAll('.pb-clear-history-range')].find(r => r.textContent.trim() === ${JSON.stringify(label)});
    const input = row && row.querySelector('input');
    if (!input) return false;
    input.focus();
    input.click();
    return input.checked;
})()`);
const clickPickerButton = (app, label) => app.evaluate(`(() => {
    const b = [...document.querySelectorAll('.pb-clear-history-footer button')].find(b => b.textContent.trim() === ${JSON.stringify(label)});
    if (!b) return false;
    b.click();
    return true;
})()`);

/** Chrome scope: plants Places visits, tabs rows, saved_pages rows and web-tab history keys, as `plan` lists them. */
const plantClearRows = (app, plan) => inChrome(app, `return (async () => {
    try {
        const { PowerBrowserAPI } = ChromeUtils.importESModule(${JSON.stringify(API_URL)});
        const { PlacesUtils } = ChromeUtils.importESModule('resource://gre/modules/PlacesUtils.sys.mjs');
        const plan = ${JSON.stringify(plan)};
        for (const v of plan.visits) {
            await PlacesUtils.history.insert({ url: v.url, title: v.title, visits: [{ date: new Date(v.at) }] });
        }
        const conn = await PowerBrowserAPI.openTabStore();
        for (const t of plan.tabs) {
            await conn.execute('INSERT OR REPLACE INTO tabs (uri, url, title, last_active, last_accessed, closed_at, thumbnail) VALUES (:uri, :url, :title, :last_active, :last_accessed, :closed_at, :thumbnail)', t);
        }
        for (const s of plan.saved) {
            await conn.execute('INSERT OR REPLACE INTO saved_pages (tab_uri, dir, url, title, saved_at, bytes) VALUES (:tab_uri, :dir, :url, :title, :saved_at, 0)', s);
        }
        const path = PowerBrowserAPI.getProfileDir() + '/' + ${JSON.stringify(WEB_TAB_HISTORY_FILE)};
        let onDisk = {};
        try { onDisk = await IOUtils.readJSON(path); } catch (e) { onDisk = {}; }
        for (const key of plan.histories) {
            onDisk[key] = { entries: [], index: 0 };
        }
        await IOUtils.writeJSON(path, onDisk, { tmpPath: path + '.tmp' });
        return 'ok';
    } catch (e) {
        return 'error: ' + e;
    }
})();`);

/**
 * Chrome scope, each store read directly (the independent observer): visit
 * counts per url, the planted tabs rows with their thumbnails, the open rows
 * (closed_at NULL), the planted saved_pages rows, the history file's planted
 * keys, and whether the token cookie is in the 127.0.0.1 jar. JSON text.
 */
const readClearStores = (app, urls, prefix) => inChrome(app, `return (async () => {
    try {
        const { PowerBrowserAPI } = ChromeUtils.importESModule(${JSON.stringify(API_URL)});
        const { PlacesUtils } = ChromeUtils.importESModule('resource://gre/modules/PlacesUtils.sys.mjs');
        const out = { visits: {}, tabs: {}, open: [], saved: [], histories: [] };
        for (const url of ${JSON.stringify(urls)}) {
            const info = await PlacesUtils.history.fetch(url, { includeVisits: true });
            out.visits[url] = info ? info.visits.length : 0;
        }
        const conn = await PowerBrowserAPI.openTabStore();
        for (const row of await conn.execute('SELECT uri, thumbnail, closed_at FROM tabs')) {
            const uri = String(row.getResultByName('uri'));
            if (row.getResultByName('closed_at') === null) out.open.push(uri);
            if (uri.startsWith(${JSON.stringify(prefix)})) out.tabs[uri] = { thumbnail: row.getResultByName('thumbnail') };
        }
        out.open.sort();
        for (const row of await conn.execute('SELECT tab_uri FROM saved_pages')) {
            const uri = String(row.getResultByName('tab_uri'));
            if (uri.startsWith(${JSON.stringify(prefix)})) out.saved.push(uri);
        }
        try {
            const onDisk = await IOUtils.readJSON(PowerBrowserAPI.getProfileDir() + '/' + ${JSON.stringify(WEB_TAB_HISTORY_FILE)});
            out.histories = Object.keys(onDisk || {}).filter(k => k.startsWith(${JSON.stringify(prefix)}));
        } catch (e) { out.histories = []; }
        out.token = Services.cookies.getCookiesFromHost('127.0.0.1', {}).some(c => c.name === ${JSON.stringify(TOKEN_COOKIE)});
        return JSON.stringify(out);
    } catch (e) {
        return JSON.stringify({ error: String(e) });
    }
})();`).then(JSON.parse);

/** Chrome scope: removes every planted row, key and visit (the `prefix` keys, the planted urls). */
const unplantClearRows = (app, urls, prefix) => inChrome(app, `return (async () => {
    try {
        const { PowerBrowserAPI } = ChromeUtils.importESModule(${JSON.stringify(API_URL)});
        const { PlacesUtils } = ChromeUtils.importESModule('resource://gre/modules/PlacesUtils.sys.mjs');
        const conn = await PowerBrowserAPI.openTabStore();
        await conn.execute('DELETE FROM tabs WHERE uri GLOB :glob', { glob: ${JSON.stringify(prefix)} + '*' });
        await conn.execute('DELETE FROM saved_pages WHERE tab_uri GLOB :glob', { glob: ${JSON.stringify(prefix)} + '*' });
        const path = PowerBrowserAPI.getProfileDir() + '/' + ${JSON.stringify(WEB_TAB_HISTORY_FILE)};
        try {
            const onDisk = await IOUtils.readJSON(path);
            for (const key of Object.keys(onDisk || {})) if (key.startsWith(${JSON.stringify(prefix)})) delete onDisk[key];
            await IOUtils.writeJSON(path, onDisk, { tmpPath: path + '.tmp' });
        } catch (e) { /* no file: nothing planted there */ }
        for (const url of ${JSON.stringify(urls)}) await PlacesUtils.history.remove(url).catch(() => false);
        return 'ok';
    } catch (e) {
        return 'error: ' + e;
    }
})();`);

/** The status of a same-origin request from the Theia frame: 200 only while the frame is signed in. */
const signedInStatus = app => probe(app, `const r = await fetch(location.href, { cache: 'no-store', credentials: 'same-origin' }); return r.status;`);

/**
 * Opens the picker one way: 'menu' (the History submenu's clear row), 'pill'
 * (Ctrl+Shift+Del with the pill focused), 'page' (the same key with the page
 * focused, its relay row) or 'command'. Returns the picker as drawn.
 */
async function openClearPicker(app, how, tabId) {
    if (how === 'menu') {
        await pointMenuRow(app, 1, CLEAR_ROW);
    } else if (how === 'page') {
        if (await focusOverlay(app, tabId) !== true) {
            throw new Error(`${BROKEN} the session tab's page could not be focused`);
        }
        await pressKey(app, CLEAR_KEY);
    } else if (how === 'command') {
        await probe(app, `await get('CommandRegistry').executeCommand(${JSON.stringify(CLEAR_HISTORY_COMMAND)}); return true;`);
    } else {
        await focusPill(app);
        await pressKey(app, CLEAR_KEY);
    }
    return settle(() => readPicker(app), p => p.open && p.focused, 8000);
}

/** The labels of a History submenu read, by section (closed tabs, recent pages). */
function historyMenuLabels(items) {
    const [, closed, recent] = historySections(items);
    return { closed: (closed ?? []).map(i => i.label), recent: (recent ?? []).map(i => i.label) };
}

/** The pill's history rows for `text`, once the dropdown has had time to compose them. */
async function pillHistoryTitles(app, text) {
    await typeInPill(app, text);
    await sleep(1500);
    const read = await readRows(app);
    await pressKey(app, ESCAPE);
    return read.rows.filter(r => r.type === 'codicon-history').map(r => r.title);
}

/**
 * BMK-05 (D-09, D-10, T-33-04): see the header. Every expectation is derived:
 * ranges and labels from the widget table and CHROME_BAR_COPY, the key from
 * PAGE_SHORTCUTS, the command id from its const, the history file name from
 * the boundary. Each store is read back chrome-side, before (the positive
 * control: every planted row is there) and after the clear.
 */
async function clearHistoryLive(ctx) {
    const { app, pages, plant, fail, note } = ctx;
    const tabId = await sessionTab(ctx);
    const subject = (await app.evaluate(appNameExpr)) || 'The browser';
    const footnote = CLEAR_FOOTNOTE.replace('${subject}', subject);
    const failureRow = CLEAR_FAILED.replace('${subject}', subject);
    const labels = CLEAR_RANGES.map(r => r.label);
    const prefix = 'web:pbch';
    const planted = [];
    if (CLEAR_RANGES.length !== 5) {
        return fail(`${BROKEN} derived ${CLEAR_RANGES.length} picker ranges from the widget, want the five of D-09`);
    }
    await installFireRecorder(app);
    const checkShape = (picker, how) => {
        if (!picker.open) {
            fail(`opening the picker by ${how} showed no .pb-clear-history panel with focus inside it`);
            return false;
        }
        if (picker.heading !== CLEAR_HEADING || JSON.stringify(picker.ranges) !== JSON.stringify(labels) || JSON.stringify(picker.checked) !== JSON.stringify([labels[0]])
            || picker.footnote !== footnote || JSON.stringify(picker.buttons) !== JSON.stringify([CLEAR_CANCEL, CLEAR_CONFIRM])) {
            fail(`the picker opened by ${how} must show ${JSON.stringify(CLEAR_HEADING)}, the ranges ${JSON.stringify(labels)} with ${JSON.stringify(labels[0])} checked, the footnote and ${JSON.stringify([CLEAR_CANCEL, CLEAR_CONFIRM])}; saw ${JSON.stringify(picker)}`);
        }
        return true;
    };
    try {
        // Positive controls for the exemption: the token is in the jar and the frame is signed in.
        const before = await readClearStores(app, [], prefix);
        if (before.error || before.token !== true) {
            return fail(`${BROKEN} the token cookie is not in the 127.0.0.1 jar before any clear (${JSON.stringify(before)}), so nothing proves the exemption`);
        }
        if (await signedInStatus(app) !== 200) {
            return fail(`${BROKEN} the Theia frame is not signed in before any clear, so signed-in after it would prove nothing`);
        }

        // Esc closes with nothing cleared; focus returns to the pill.
        const escUrl = pages.url('/ch-esc');
        planted.push(escUrl);
        if (await plantClearRows(app, { visits: [{ url: escUrl, title: 'Clear Probe Esc', at: Date.now() - 1000 }], tabs: [], saved: [], histories: [] }) !== 'ok') {
            return fail(`${BROKEN} the Esc marker visit could not be planted`);
        }
        if (checkShape(await openClearPicker(app, 'pill', tabId), 'Ctrl+Shift+Del with the pill focused')) {
            await pressKey(app, ESCAPE);
            const closed = await settle(() => readPicker(app), p => !p.open, 5000);
            const pill = await readPill(app);
            if (closed.open || !pill.focused) {
                fail(`Esc must close the picker with focus back on the pill; open ${closed.open}, pill ${JSON.stringify(pill)}`);
            }
            if ((await readClearStores(app, [escUrl], prefix)).visits[escUrl] < 1) {
                fail('Esc on the picker cleared history: the planted visit is gone');
            }
        }

        // A refused clear shows the failure row in the panel; Enter tries again and the retry closes it.
        await probe(app, `get('ChromeStoreClient').clearHistory = async () => { throw new Error('refused'); }; return true;`);
        try {
            if (checkShape(await openClearPicker(app, 'command', tabId), 'the command')) {
                await pressKey(app, ENTER);
                const refused = await settle(() => readPicker(app), p => p.open && p.failure !== '', 5000);
                if (!refused.open || refused.failure !== failureRow) {
                    fail(`a refused clear must keep the picker open with the row ${JSON.stringify(failureRow)}; saw ${JSON.stringify(refused)}`);
                }
                await probe(app, `delete get('ChromeStoreClient').clearHistory; return true;`);
                await pressKey(app, ENTER);
                if ((await settle(() => readPicker(app), p => !p.open, 8000)).open) {
                    fail('Enter on the failure row did not retry the clear and close the picker');
                }
            }
        } finally {
            await probe(app, `delete get('ChromeStoreClient').clearHistory; return true;`);
        }

        const ways = ['menu', 'pill', 'page', 'command', 'pill'];
        for (const [i, { range, label }] of CLEAR_RANGES.entries()) {
            const now = Date.now();
            const midnight = new Date(now).setHours(0, 0, 0, 0);
            const inAt = Math.max(now - 1000, midnight + 1);
            const begin = clearRangeBegin(range, now);
            const outAt = begin === null ? null : begin - 30 * 60 * 1000;
            const key = part => `${prefix}${i}-${part}`;
            const urls = { in: pages.url(`/ch-in-${i}`), out: pages.url(`/ch-out-${i}`) };
            const inTitle = `Clear Probe In ${i}`;
            planted.push(urls.in, urls.out);
            const tab = (part, url, lastActive, lastAccessed, closedAt) => ({ uri: key(part), url, title: '', last_active: lastActive, last_accessed: lastAccessed, closed_at: closedAt, thumbnail: PLANTED_THUMB });
            const saved = (part, savedAt) => ({ tab_uri: key(part), dir: '/nonexistent/pb-probe-not-minted', url: urls.in, title: inTitle, saved_at: savedAt });
            const plan = {
                visits: [{ url: urls.in, title: inTitle, at: inAt }, ...(outAt === null ? [] : [{ url: urls.out, title: `Clear Probe Out ${i}`, at: outAt }])],
                tabs: [tab('in', urls.in, inAt, inAt, inAt), ...(outAt === null ? [] : [
                    tab('out', urls.out, outAt, outAt, outAt),
                    // Closed out of range but seen in range: the row stays, its picture of the page goes.
                    tab('thumb', urls.out, outAt, inAt, outAt),
                ])],
                // The in-range copy, the copy of the in-range closed row (saved earlier), and the out-of-range copy.
                saved: [saved('savedin', inAt), saved('in', outAt ?? inAt), ...(outAt === null ? [] : [saved('savedout', outAt)])],
                histories: [key('in'), ...(outAt === null ? [] : [key('out')])],
            };
            if (await plantClearRows(app, plan) !== 'ok') {
                return fail(`${BROKEN} ${range}: the marker rows could not be planted`);
            }
            const pre = await readClearStores(app, [urls.in, urls.out], prefix);
            const want = { tabs: plan.tabs.map(t => t.uri), saved: plan.saved.map(s => s.tab_uri), histories: plan.histories };
            if (pre.error || pre.visits[urls.in] < 1 || (outAt !== null && pre.visits[urls.out] < 1)
                || want.tabs.some(u => !pre.tabs[u] || pre.tabs[u].thumbnail === null) || want.saved.some(u => !pre.saved.includes(u))
                || want.histories.some(k => !pre.histories.includes(k))) {
                return fail(`${BROKEN} ${range}: the planted rows are not all in their stores before the clear (${JSON.stringify(pre)}), so their absence after it would prove nothing`);
            }

            // The first range also proves the History submenu and the pill drop a cleared page (each listed it first).
            let menuBefore;
            let pillBefore;
            if (i === 0) {
                pillBefore = await pillHistoryTitles(app, inTitle);
                await showTab(app, tabId, 'clear-history');
                const items = await openHistorySubmenu(app);
                menuBefore = historyMenuLabels(items);
                const clearSection = historySections(items)[3];
                if (clearSection?.length !== 1 || clearSection[0].label !== CLEAR_ROW || clearSection[0].disabled || !clearSection[0].shortcut) {
                    fail(`the History submenu must end with one enabled ${JSON.stringify(CLEAR_ROW)} row showing its key; saw ${JSON.stringify(clearSection)}`);
                }
            }
            const how = ways[i];
            const fired = (await firedRows(app)).length;
            const picker = await openClearPicker(app, how, tabId);
            if (how === 'page' && !(await firedRows(app)).slice(fired).includes('clearHistory')) {
                fail('Ctrl+Shift+Del with the page focused must fire the clearHistory page-key row');
            }
            if (!checkShape(picker, how)) {
                await closeOpenMenus(app).catch(() => undefined);
                continue;
            }
            if (await choosePickerRange(app, label) !== true) {
                fail(`${range}: the ${JSON.stringify(label)} range could not be chosen`);
                continue;
            }
            if (i % 2 === 0) {
                await clickPickerButton(app, CLEAR_CONFIRM);
            } else {
                await pressKey(app, ENTER);
            }
            const after = await settle(() => readPicker(app), p => !p.open, 10000);
            if (after.open) {
                fail(`${range}: the picker did not close after ${i % 2 === 0 ? CLEAR_CONFIRM : 'Enter'} (${JSON.stringify(after)})`);
                continue;
            }
            if (plant === 'clear-drops-store') {
                // As if the saved_pages target had dropped out of the fan-out: its in-range row is back after the clear.
                await plantClearRows(app, { visits: [], tabs: [], saved: [saved('savedin', inAt)], histories: [] });
                note(`PLANT clear-drops-store applied (${range})`);
            }
            if (plant === 'clear-takes-token') {
                // As a fan-out enumerating cookies would: the token goes with the clear.
                await inChrome(app, `for (const c of Services.cookies.getCookiesFromHost('127.0.0.1', {})) {
                    if (c.name === ${JSON.stringify(TOKEN_COOKIE)}) Services.cookies.remove(c.host, c.name, c.path, c.originAttributes);
                }
                return true;`);
                note(`PLANT clear-takes-token applied (${range})`);
            }
            const post = await readClearStores(app, [urls.in, urls.out], prefix);
            if (post.error) {
                return fail(`${BROKEN} ${range}: the stores could not be read after the clear (${post.error})`);
            }
            if (post.visits[urls.in] !== 0) {
                fail(`${range}: places still holds the planted in-range visit`);
            }
            if (post.tabs[key('in')]) {
                fail(`${range}: tabs.closed_at still holds the planted in-range closed row`);
            }
            if (post.saved.includes(key('savedin'))) {
                fail(`${range}: saved_pages still holds the planted in-range copy`);
            }
            if (post.saved.includes(key('in'))) {
                fail(`${range}: saved_pages kept the copy of a closed row the clear deleted`);
            }
            if (post.histories.includes(key('in'))) {
                fail(`${range}: ${WEB_TAB_HISTORY_FILE} still holds the history of a closed row the clear deleted`);
            }
            if (outAt !== null) {
                if (post.visits[urls.out] < 1) {
                    fail(`${range}: places lost the out-of-range visit`);
                }
                if (!post.tabs[key('out')] || post.tabs[key('out')].thumbnail === null) {
                    fail(`${range}: tabs.closed_at or tabs.thumbnail lost the out-of-range closed row or its thumbnail`);
                }
                if (!post.tabs[key('thumb')]) {
                    fail(`${range}: tabs.closed_at deleted a row closed out of range`);
                } else if (post.tabs[key('thumb')].thumbnail !== null) {
                    fail(`${range}: tabs.thumbnail kept the thumbnail of a row seen in range`);
                }
                if (!post.saved.includes(key('savedout'))) {
                    fail(`${range}: saved_pages lost the out-of-range copy`);
                }
                if (!post.histories.includes(key('out'))) {
                    fail(`${range}: ${WEB_TAB_HISTORY_FILE} lost the history of an out-of-range closed row`);
                }
            }
            if (JSON.stringify(post.open) !== JSON.stringify(pre.open)) {
                fail(`${range}: an open tab row (closed_at NULL) changed: ${JSON.stringify(pre.open)} before, ${JSON.stringify(post.open)} after`);
            }
            const status = await signedInStatus(app);
            if (post.token !== true || status !== 200) {
                fail(`${range}: the IDE was signed out by the clear: token cookie in the jar ${post.token}, a same-origin frame request returned ${JSON.stringify(status)}`);
                if (plant === 'clear-takes-token') {
                    return undefined;
                }
            }

            if (i === 0) {
                if (!menuBefore.recent.includes(inTitle) || !menuBefore.closed.includes(urls.in)) {
                    fail(`${BROKEN} before the clear the History submenu did not list the planted page and closed row (${JSON.stringify(menuBefore)}), so its later read proves nothing`);
                } else {
                    await showTab(app, tabId, 'clear-history');
                    const menuAfter = historyMenuLabels(await openHistorySubmenu(app));
                    await closeOpenMenus(app);
                    if (menuAfter.recent.includes(inTitle) || menuAfter.closed.includes(urls.in)) {
                        fail(`after the clear the History submenu still lists the cleared page or closed row: ${JSON.stringify(menuAfter)}`);
                    }
                }
                if (!pillBefore.includes(inTitle)) {
                    fail(`${BROKEN} before the clear the pill showed no history row for ${JSON.stringify(inTitle)} (${JSON.stringify(pillBefore)}), so its later read proves nothing`);
                } else if ((await pillHistoryTitles(app, inTitle)).includes(inTitle)) {
                    fail(`after the clear the pill still shows the cleared page ${JSON.stringify(inTitle)} as a history row`);
                }
            }
        }
    } finally {
        await closeOpenMenus(app).catch(() => undefined);
        await probe(app, `delete get('ChromeStoreClient').clearHistory; return true;`).catch(() => undefined);
        await unplantClearRows(app, planted, prefix).catch(() => undefined);
    }
    return undefined;
}

// Phase 33 plan 05 (MENU-03, SMODE-07): the full hamburger, the Actions list and one implementation per action.
// Every expectation is derived from the tree: the table and its builder (imported under type stripping, as the static
// gate does), row labels from the widget's appMenuLabel switch and CHROME_BAR_COPY, command ids from the command file,
// the app-menu entry list from ROADMAP.md's Phase 33 success criterion 5.
const MENU_TABLE = await import(new URL('../theia/extensions/chrome-bar/src/browser/site-identity/site-identity-table.ts', import.meta.url).href);
const APP_MENU_BUILDER = await import(new URL('../theia/extensions/chrome-bar/src/browser/site-identity/app-menu.ts', import.meta.url).href);
const MENU_WIDGET_REL = 'theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx';
const MENU_COMMANDS_REL = 'theia/extensions/chrome-bar/src/browser/chrome-bar-commands.ts';
const STOCK_WINDOW_COMMAND_ID = sourceConst('theia/extensions/tab-uris/src/browser/browser-window-command.ts', 'OPEN_BROWSER_WINDOW_COMMAND_ID');
const ROADMAP_MENU = sourceMatch('.planning/ROADMAP.md', /### Phase 33:[\s\S]*?The app menu reaches (.+?); Actions mode runs/).split(/,\s*|\s+and\s+/).map(x => x.trim()).filter(Boolean);

/** A hamburger row's label as drawn: CHROME_BAR_COPY through the widget's switch; a template's fixed prefix (`Quit `) as a RegExp. */
function menuRowLabel(menuId) {
    const key = sourceMatch(MENU_WIDGET_REL, new RegExp(`case '${menuId}': return CHROME_BAR_COPY\\.([A-Za-z]+)`));
    try {
        return copyPlain(key);
    } catch {
        const prefix = sourceMatch(CHROME_BAR_COPY_REL, new RegExp(`\\b${key}: \\([^)]*\\) => \`([^$\`]*)`));
        return new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
    }
}
/** The rows this tree renders, in table order, each with its label. */
const MENU_ROWS = APP_MENU_BUILDER.applyMenuOrder(MENU_TABLE.MENU_ORDER, APP_MENU_BUILDER.WIRED_MENU_IDS, MENU_TABLE.MENU_PHASE)
    .map(({ row, enabled }) => ({ id: row.menuId, enabled, label: menuRowLabel(row.menuId) }));
/** menuId -> the Browser command id its row runs (the widget's APP_MENU_COMMANDS), the id its Actions twin runs. */
const MENU_ROW_COMMANDS = Object.fromEntries([...sourceMatch(MENU_WIDGET_REL, /const APP_MENU_COMMANDS[^=]*= Object\.freeze\(\{([\s\S]*?)\}\);/)
    .matchAll(/'([a-z-]+)': (CHROME_BAR_[A-Z_]+_COMMAND_ID)/g)].map(m => [m[1], sourceConst(MENU_COMMANDS_REL, m[2])]));
const ZOOM_IN_ID = sourceConst(MENU_COMMANDS_REL, 'CHROME_BAR_ZOOM_IN_COMMAND_ID');
const FULL_SCREEN_ID = sourceConst(MENU_COMMANDS_REL, 'CHROME_BAR_FULL_SCREEN_COMMAND_ID');
const labelOf = id => { const l = MENU_ROWS.find(r => r.id === id)?.label; return typeof l === 'string' ? l : null; };
const sameLabel = (want, got) => (want instanceof RegExp ? want.test(got) : want === got);

/** Wraps the page realm's CommandRegistry.executeCommand (an own property over the prototype's) to record each id run. */
const recordCommands = app => probe(app, `const r = get('CommandRegistry');
    const run = Object.getPrototypeOf(r).executeCommand;
    window.__pbCommands = [];
    r.executeCommand = function (id, ...rest) { window.__pbCommands.push(id); return run.call(this, id, ...rest); };
    return true;`);
const commandsRun = app => app.evaluate('JSON.stringify(window.__pbCommands || [])').then(JSON.parse);
const restoreCommands = app => probe(app, `delete get('CommandRegistry').executeCommand; return true;`);

/** Opens the hamburger with a trusted-shaped click on its button; returns the root menu's items, or [] when it did not open. */
async function openAppMenuRoot(app) {
    await closeOpenMenus(app);
    const opened = await app.evaluate(`(() => { const b = document.querySelector('.pb-chrome-bar button[aria-label=${JSON.stringify(APP_MENU_LABEL)}]'); if (!b) return false; b.click(); return true; })()`);
    const menus = opened === true ? await settle(() => readOpenMenus(app), m => m.length === 1 && m[0].length > 3, 10000) : [];
    return menus.length === 1 ? menus[0] : [];
}

/** Opens the hamburger and hovers the submenu row `label`; returns the submenu's items, or [] when none opened. */
async function openAppSubmenu(app, label) {
    if (!(await openAppMenuRoot(app)).some(i => i.label === label)) {
        return [];
    }
    await pointMenuRow(app, 0, label, { hover: true });
    const menus = await settle(() => readOpenMenus(app), m => m.length === 2 && m[1].length > 0, 5000);
    return menus.length === 2 ? menus[1] : [];
}

/** Chrome scope: the shell window's full-screen flag. */
const shellFullScreen = app => inChrome(app, `const w = Services.wm.getMostRecentWindow('powerbrowser:main'); return w ? w.fullScreen : null;`);

/**
 * MENU-03 (D-11..D-14), ROADMAP Phase 33 criterion 5. The hamburger draws the table's rows in order with no
 * "Coming soon" row, and holds every ROADMAP app-menu entry in ROADMAP order. Each command row runs the Browser
 * command id its Actions twin runs (recorded at CommandRegistry.executeCommand): Print and Save Page As reach the
 * tab method the page relay's key runs (stubbed so no modal opens), New Window runs GUI-01's stock-window command,
 * Full Screen toggles the shell window both ways through the fullScreen store kind. The Bookmarks, Zoom, More
 * Tools and Help submenus draw their rows; Zoom In changes the pushed zoom; Esc steps back one menu level;
 * About opens the stock About dialog.
 */
async function appMenu(ctx) {
    const { app, plant, fail, note } = ctx;
    const tabId = await sessionTab(ctx);
    await recordCommands(app);
    await recordStoreKinds(app);
    await probe(app, `const proto = Object.getPrototypeOf(get('WebTabChannel').widgetOf(${JSON.stringify(tabId)}));
        window.__pbTabCalls = [];
        window.__pbTabStubs = { print: proto.print, savePage: proto.savePage };
        proto.print = function () { window.__pbTabCalls.push('print'); return Promise.resolve({ ok: true, where: 'stubbed' }); };
        proto.savePage = function () { window.__pbTabCalls.push('savePage'); return Promise.resolve({ ok: true, where: 'stubbed' }); };
        return true;`);
    if (plant === 'menu-twin-diverges' && await probe(app, `const w = get('ChromeBarWidget'); const run = Object.getPrototypeOf(w).runAppMenuRow;
        w.runAppMenuRow = function (row) {
            if (row.menuId === 'print') { void get('WebTabChannel').widgetOf(${JSON.stringify(tabId)}).print(); return; }
            return run.call(this, row);
        };
        return true;`) === true) {
        note('PLANT menu-twin-diverges applied');
    }
    try {
        const root = await openAppMenuRoot(app);
        const drawn = root.filter(i => !i.separator);
        if (!drawn.length) {
            return fail(`${BROKEN} the hamburger did not open`);
        }
        if (drawn.length !== MENU_ROWS.length || !MENU_ROWS.every((row, i) => sameLabel(row.label, drawn[i]?.label ?? ''))) {
            fail(`the hamburger must draw the table's rows in order ${JSON.stringify(MENU_ROWS.map(r => String(r.label)))}; drew ${JSON.stringify(drawn.map(i => i.label))}`);
        }
        const comingSoon = drawn.filter(i => /\(Coming soon\)$/.test(i.label));
        if (comingSoon.length) {
            fail(`a MENU-03 row rendered as a stub: ${JSON.stringify(comingSoon.map(i => i.label))}`);
        }
        const names = drawn.map(i => i.label.replace(/…$/, ''));
        const missing = ROADMAP_MENU.filter(name => !names.includes(name));
        const order = names.filter(name => ROADMAP_MENU.includes(name));
        if (missing.length || JSON.stringify(order) !== JSON.stringify(ROADMAP_MENU)) {
            fail(`the hamburger must hold the ROADMAP Phase 33 entries ${JSON.stringify(ROADMAP_MENU)} in that order; missing ${JSON.stringify(missing)}, drawn order ${JSON.stringify(order)}`);
        }
        await closeOpenMenus(app);

        // One implementation per action: each command row runs its Actions twin's id.
        for (const menuId of ['print', 'save-page', 'find-in-page', 'downloads', 'new-window']) {
            const label = labelOf(menuId);
            const id = MENU_ROW_COMMANDS[menuId];
            if (!label || !id) {
                fail(`${BROKEN} the ${menuId} row has no label or command id in the tree`);
                continue;
            }
            await openAppMenuRoot(app);
            const mark = (await commandsRun(app)).length;
            const tabMark = (await app.evaluate('JSON.stringify(window.__pbTabCalls || [])').then(JSON.parse)).length;
            await pointMenuRow(app, 0, label);
            const ran = (await settle(() => commandsRun(app), v => v.slice(mark).includes(id), 5000)).slice(mark);
            if (!ran.includes(id)) {
                fail(`the ${label} row ran no Browser command id: its Actions twin runs ${id}; the row ran ${JSON.stringify(ran)}`);
            }
            const tabCalls = (await app.evaluate('JSON.stringify(window.__pbTabCalls || [])').then(JSON.parse)).slice(tabMark);
            if (menuId === 'print' && !tabCalls.includes('print')) {
                fail(`the ${label} row never reached the tab's print(), the method the Ctrl+P relay row runs`);
            }
            if (menuId === 'save-page' && !tabCalls.includes('savePage')) {
                fail(`the ${label} row never reached the tab's savePage(), the method the Ctrl+S relay row runs`);
            }
            if (menuId === 'new-window' && !ran.includes(STOCK_WINDOW_COMMAND_ID)) {
                fail(`New Window must open the stock window through ${STOCK_WINDOW_COMMAND_ID} (D-12); it ran ${JSON.stringify(ran)}`);
            }
            await closeOpenMenus(app);
            await makeCurrent(app, tabId);
        }

        // Full Screen toggles the shell window both ways through the window-chrome kind.
        const before = await shellFullScreen(app);
        for (const step of ['enter', 'leave']) {
            await openAppMenuRoot(app);
            const kindMark = (await storeKinds(app)).length;
            await pointMenuRow(app, 0, labelOf('full-screen'));
            const now = await settle(() => shellFullScreen(app), v => v === (step === 'enter' ? !before : before), 5000);
            if (now !== (step === 'enter' ? !before : before)) {
                fail(`Full Screen (${step}) did not toggle the shell window: fullScreen is ${JSON.stringify(now)}, was ${JSON.stringify(before)}`);
            }
            if (!(await storeKinds(app)).slice(kindMark).includes('fullScreen')) {
                fail(`Full Screen (${step}) sent no fullScreen store kind`);
            }
            await makeCurrent(app, tabId);
        }

        // Submenus: Bookmarks, Zoom, More Tools, Help; Esc steps back one level.
        const bookmarks = await openAppSubmenu(app, labelOf('bookmarks'));
        if (bookmarks[0]?.label !== copyPlain('bookmarkThisPageRow') || !bookmarks[0].shortcut
            || !bookmarks.some(i => i.label === copyPlain('showBookmarksToolbarRow'))) {
            fail(`the Bookmarks submenu must open on ${JSON.stringify(copyPlain('bookmarkThisPageRow'))} with its key, then ${JSON.stringify(copyPlain('showBookmarksToolbarRow'))}; saw ${JSON.stringify(bookmarks)}`);
        }
        await app.evaluate(`(() => { const m = [...document.querySelectorAll('.lm-Menu')].filter(m => m.getClientRects().length > 0).pop();
            m.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true, cancelable: true })); return true; })()`);
        const afterEsc = await settle(() => readOpenMenus(app), m => m.length === 1, 3000);
        if (afterEsc.length !== 1) {
            fail(`Esc in the Bookmarks submenu must step back to the hamburger alone; ${afterEsc.length} menus are open`);
        }
        await closeOpenMenus(app);
        const zoomRows = (await openAppSubmenu(app, labelOf('zoom'))).filter(i => !i.separator);
        const wantZoom = [copyPlain('zoomInRow'), copyPlain('zoomOutRow'), copyPlain('zoomResetRow')];
        if (JSON.stringify(zoomRows.slice(0, 3).map(i => i.label)) !== JSON.stringify(wantZoom) || !/^Zoom: \d+%$/.test(zoomRows[3]?.label ?? '') || !zoomRows[3]?.disabled) {
            fail(`the Zoom submenu must list ${JSON.stringify(wantZoom)} then a disabled "Zoom: {percent}" row; saw ${JSON.stringify(zoomRows)}`);
        } else {
            const mark = (await commandsRun(app)).length;
            const pushMark = (await pushes(app)).length;
            await pointMenuRow(app, 1, wantZoom[0]);
            if (!(await settle(() => commandsRun(app), v => v.slice(mark).includes(ZOOM_IN_ID), 5000)).slice(mark).includes(ZOOM_IN_ID)) {
                fail(`Zoom In ran no ${ZOOM_IN_ID}`);
            }
            const zoomed = await waitForPush(app, p => p.tabId === tabId && typeof p.zoom === 'number' && p.zoom > 1, { from: pushMark });
            if (zoomed < 0) {
                fail('Zoom In did not raise the tab zoom (no state push with zoom above 1)');
            }
            await probe(app, `await get('WebTabChannel').widgetOf(${JSON.stringify(tabId)}).zoomReset(); return true;`);
        }
        await closeOpenMenus(app);
        const tools = (await openAppSubmenu(app, labelOf('more-tools'))).map(i => i.label);
        const wantTools = [copyPlain('pageSourceRow'), copyPlain('readerViewRow'), copyPlain('pageDevToolsRow')];
        if (JSON.stringify(tools) !== JSON.stringify(wantTools)) {
            fail(`the More Tools submenu must list ${JSON.stringify(wantTools)}; saw ${JSON.stringify(tools)}`);
        }
        await closeOpenMenus(app);
        const help = (await openAppSubmenu(app, labelOf('help'))).filter(i => !i.separator);
        const aboutLabel = help[1]?.label ?? '';
        if (help[0]?.label !== copyPlain('getHelpRow') || !/^About /.test(aboutLabel)) {
            fail(`the Help submenu must list ${JSON.stringify(copyPlain('getHelpRow'))} then "About {App}"; saw ${JSON.stringify(help)}`);
        } else {
            await pointMenuRow(app, 1, aboutLabel);
            const about = await settle(() => inChrome(app, `return !!Services.wm.getMostRecentWindow('Browser:About');`), v => v === true, 15000);
            if (about !== true) {
                fail('About {App} did not open the stock About dialog');
            }
            await inChrome(app, `const w = Services.wm.getMostRecentWindow('Browser:About'); if (w) w.close(); return true;`);
        }
    } finally {
        await closeOpenMenus(app).catch(() => null);
        await probe(app, `const proto = Object.getPrototypeOf(get('WebTabChannel').widgetOf(${JSON.stringify(tabId)}));
            if (window.__pbTabStubs) { proto.print = window.__pbTabStubs.print; proto.savePage = window.__pbTabStubs.savePage; }
            delete get('ChromeBarWidget').runAppMenuRow;
            delete get('ChromeStoreClient').request;
            return true;`).catch(() => null);
        await restoreCommands(app).catch(() => null);
        await makeCurrent(app, tabId).catch(() => null);
    }
}

/** The Actions rows as drawn: title and keybinding badges. */
const readActionRows = app => app.evaluate(`JSON.stringify([...document.querySelectorAll('.pb-chrome-bar-dropdown .pb-chrome-bar-row:not(.is-shimmer)')]
    .filter(r => r.querySelector('.pb-chrome-bar-row-title'))
    .map(r => ({ title: r.querySelector('.pb-chrome-bar-row-title').textContent || '', badges: [...r.querySelectorAll('.pb-chrome-bar-row-badge')].map(b => b.textContent) })))`).then(JSON.parse);

/** Derived now from the page realm: the labels of the listed Browser commands that carry a keybinding. */
const boundCategoryLabels = app => probe(app, `const registry = get('CommandRegistry'); const keys = get('KeybindingRegistry');
    return registry.commands.filter(c => c.category === ${JSON.stringify(COMMAND_CATEGORY)} && c.label && registry.isVisible(c.id) && registry.isEnabled(c.id)
        && keys.getKeybindingsForCommand(c.id).length > 0).map(c => c.label);`);

/** Runs the Actions row titled `title`: Actions mode, the title typed, the row highlighted, Enter. Returns whether it was highlighted. */
async function runActionRow(app, title) {
    await restoreDefaultMode(app);
    await pickLocalMode(app, 'actions');
    await typeInPill(app, title);
    const view = await settle(() => readRows(app), v => v.rows.some(r => r.title === title && r.selected));
    if (!view.rows.some(r => r.title === title && r.selected)) {
        return false;
    }
    await pressKey(app, ENTER);
    return true;
}

/**
 * SMODE-07 (D-13). Actions lists exactly the visible, enabled Browser-category commands the registry holds now --
 * the MENU-03 commands among them -- and each one with a keybinding shows its badge. Enter on a row runs its command
 * id and nothing else: Full Screen, whose command's handler sends the fullScreen kind, is the positive control that
 * the same store recorder catches a kind (B3); Zoom In then must reach no store kind at all.
 */
async function actionsList(ctx) {
    const { app, plant, fail, note } = ctx;
    const tabId = await sessionTab(ctx);
    const want = await settle(() => categoryLabels(app), v => !!v && v.listed.length > 0);
    const menuLabels = Object.values(MENU_ROW_COMMANDS).length;
    if (!want?.listed.length || !menuLabels) {
        return fail(`${BROKEN} no listed ${COMMAND_CATEGORY} commands or no menu command rows derived (${JSON.stringify(want)})`);
    }
    await restoreDefaultMode(app);
    await pickLocalMode(app, 'actions');
    const rowsNow = await settle(() => readActionRows(app), v => v.length >= want.listed.length);
    const titles = rowsNow.map(r => r.title);
    if (JSON.stringify([...titles].sort()) !== JSON.stringify([...want.listed].sort())) {
        fail(`Actions must list exactly the visible, enabled ${COMMAND_CATEGORY} commands ${JSON.stringify(want.listed)}; saw ${JSON.stringify(titles)}`);
    }
    const bound = await boundCategoryLabels(app);
    const unbadged = rowsNow.filter(r => bound.includes(r.title) && !r.badges.length).map(r => r.title);
    if (!bound.length || unbadged.length) {
        fail(`every Actions row whose command has a keybinding must show its badge; bound ${JSON.stringify(bound)}, unbadged ${JSON.stringify(unbadged)}`);
    }
    await restoreDefaultMode(app);
    if (plant === 'actions-reach-store' && await probe(app, `const m = get('ActionsAddressBarMode'); const provide = Object.getPrototypeOf(m).provide;
        m.provide = async function (text) {
            return (await provide.call(this, text)).map(row => ({ ...row, run: async () => { await row.run(); await get('ChromeStoreClient').searchPlaces(text || 'x', 1).catch(() => null); } }));
        };
        return true;`) === true) {
        note('PLANT actions-reach-store applied');
    }
    await recordCommands(app);
    await recordStoreKinds(app);
    try {
        const fullScreenLabel = sourceMatch(MENU_COMMANDS_REL, /CHROME_BAR_FULL_SCREEN: Command = \{[^}]*label: '([^']+)'/);
        const before = await shellFullScreen(app);
        let mark = (await storeKinds(app)).length;
        if (!(await runActionRow(app, fullScreenLabel))) {
            return fail(`${BROKEN} the ${fullScreenLabel} Actions row could not be highlighted`);
        }
        const control = await settle(() => storeKinds(app), v => v.slice(mark).includes('fullScreen'), 5000);
        if (!control.slice(mark).includes('fullScreen') || !(await commandsRun(app)).includes(FULL_SCREEN_ID)) {
            return fail(`${BROKEN} the ${fullScreenLabel} Actions row must run ${FULL_SCREEN_ID} and the recorder must see its fullScreen kind, else "no store kind" below proves nothing (kinds ${JSON.stringify(control.slice(mark))})`);
        }
        await settle(() => shellFullScreen(app), v => v !== before, 5000);
        await probe(app, `await get('CommandRegistry').executeCommand(${JSON.stringify(FULL_SCREEN_ID)}); return true;`);
        await settle(() => shellFullScreen(app), v => v === before, 5000);
        await makeCurrent(app, tabId);

        const zoomLabel = sourceMatch(MENU_COMMANDS_REL, /CHROME_BAR_ZOOM_IN: Command = \{[^}]*label: '([^']+)'/);
        mark = (await storeKinds(app)).length;
        const commandMark = (await commandsRun(app)).length;
        if (!(await runActionRow(app, zoomLabel))) {
            return fail(`${BROKEN} the ${zoomLabel} Actions row could not be highlighted`);
        }
        const ran = (await settle(() => commandsRun(app), v => v.slice(commandMark).includes(ZOOM_IN_ID), 5000)).slice(commandMark);
        await sleep(800);
        if (JSON.stringify(ran) !== JSON.stringify([ZOOM_IN_ID])) {
            fail(`the ${zoomLabel} Actions row must run ${ZOOM_IN_ID} and nothing else; it ran ${JSON.stringify(ran)}`);
        }
        const reached = (await storeKinds(app)).slice(mark);
        if (reached.length) {
            fail(`the ${zoomLabel} Actions row reached the store kind ${[...new Set(reached)].join(', ')}`);
        }
        await probe(app, `await get('WebTabChannel').widgetOf(${JSON.stringify(tabId)}).zoomReset(); return true;`);
    } finally {
        await probe(app, `delete get('ActionsAddressBarMode').provide; delete get('ChromeStoreClient').request; return true;`).catch(() => null);
        await restoreCommands(app).catch(() => null);
        await restoreDefaultMode(app).catch(() => null);
    }
}

const SCENARIOS = {
    'token-cookie': tokenCookie,
    search,
    refused,
    'no-engine': noEngine,
    'dev-addresses': devAddresses,
    'default-engine': defaultEngine,
    rows,
    'failure-rows': failureRows,
    suggestions,
    'one-off': oneOff,
    'switch-to-tab': switchToTab,
    'new-tab-targets': newTabTargets,
    autofill,
    'canonize-drop': canonizeDrop,
    'shift-del': shiftDel,
    'context-menu': contextMenu,
    'page-focus': pageFocus,
    'select-ime': selectIme,
    drafts,
    'modes-dropdown': modesDropdown,
    'mode-chip': modeChip,
    'mode-lifetime': modeLifetime,
    'local-modes': localModes,
    'mode-defaults': modeDefaults,
    'mode-tokens': modeTokens,
    'bookmark-star': bookmarkStar,
    'bookmark-editor': bookmarkEditor,
    'bookmarks-toolbar': bookmarksToolbar,
    'reopen-closed': reopenClosed,
    'history-menu': historyMenu,
    'clear-history': clearHistoryLive,
    'app-menu': appMenu,
    'actions-list': actionsList,
    // Last: command-centre reloads the Theia frame on the fixture workspace, and the scenarios after it run in that reloaded frame.
    'command-centre': commandCentre,
    'command-centre-handoff': commandCentreHandoff,
    'command-centre-privacy': commandCentrePrivacy,
    'mode-keys': modeKeys,
    'go-to': goTo,
    'address-keys': addressKeys,
    'bookmark-keys': bookmarkKeys,
};

/** The scenario each not-scored-capable scenario takes as its positive control. */
const CONTROL_OF = { refused: 'search', 'no-engine': 'search', 'dev-addresses': 'search', 'select-ime': 'suggestions', 'modes-dropdown': 'search', 'local-modes': 'search',
    'command-centre': 'search', 'command-centre-handoff': 'command-centre',
    'command-centre-privacy': 'search', 'mode-defaults': 'search', 'mode-tokens': 'search', 'mode-keys': 'search',
    'go-to': 'search', 'address-keys': 'search', 'bookmark-keys': 'bookmark-star' };

/** One session over `names`; returns `[{ name, failures, notes, notScored }]` or throws. */
async function runSession(names, plant = '') {
    const pages = await serveNavPages(PAGES);
    const shared = { cleanups: [] };
    try {
        return await withProbeShell(async app => {
            await installEngine(app, pages);
            const results = [];
            for (const name of names) {
                const result = { name, failures: [], notes: [], notScored: false, passNotes: [] };
                const ctx = {
                    app, pages, plant, results, shared,
                    fail: reason => { result.failures.push(reason); },
                    note: text => { result.notes.push(text); },
                    passNote: text => { result.passNotes.push(text); },
                };
                try {
                    if (await SCENARIOS[name](ctx) === 'not-scored') {
                        result.notScored = true;
                    }
                } catch (error) {
                    result.failures.push(`harness: ${error.message}`);
                }
                results.push(result);
            }
            return results;
        });
    } finally {
        await pages.close();
        for (const cleanup of shared.cleanups) {
            cleanup();
        }
    }
}

function report(results) {
    let failed = 0;
    for (const r of results) {
        for (const n of r.notes) {
            console.log(`  ${r.name}: ${n}`);
        }
        if (r.notScored) {
            console.log(`${r.name}: NOT SCORED -- its positive control (${CONTROL_OF[r.name]}) did not pass in this session`);
        } else if (r.failures.length) {
            failed++;
            for (const f of r.failures) {
                console.error(`${r.name}: FAIL -- ${f}`);
            }
        } else {
            console.log(`${r.name}: PASS${r.passNotes.length ? ` (${r.passNotes.join('; ')})` : ''}`);
        }
    }
    return failed ? 1 : 0;
}

function selectedScenarios(args) {
    const i = args.indexOf('--scenario');
    if (i < 0) {
        return Object.keys(SCENARIOS);
    }
    const names = String(args[i + 1] ?? '').split(',').filter(Boolean);
    const unknown = names.filter(n => !SCENARIOS[n]);
    if (!names.length || unknown.length) {
        throw new Error(`unknown or empty --scenario list (${unknown.join(', ') || 'none given'}); known: ${Object.keys(SCENARIOS).join(', ')}`);
    }
    // Registry order, whatever order was asked for: a scenario runs after its control.
    return Object.keys(SCENARIOS).filter(n => names.includes(n));
}

const PLANTS = [
    { plant: 'resolve-bypassed', target: 'search', run: ['search'], expect: 'no GET on /one/search' },
    { plant: 'engine-name-dropped', target: 'default-engine', run: ['default-engine'], expect: 'no GET on /two/search' },
    { plant: 'token-strip-off', target: 'token-cookie', run: ['token-cookie'], expect: `carried ${TOKEN_COOKIE}: stock-window, overlay, subresource, worker` },
    { plant: 'dedupe-off', target: 'rows', run: ['rows'], expect: 'two rows for one url' },
    { plant: 'setting-ignored', target: 'suggestions', run: ['suggestions'], expect: 'suggest request while the setting was off' },
    { plant: 'oneoff-default', target: 'one-off', run: ['one-off'], expect: 'no GET on /two/search' },
    { plant: 'oneoff-retry-recommits', target: 'one-off', run: ['one-off'], expect: 'Enter after a failed background one-off opened no new tab' },
    { plant: 'tab-row-navigates', target: 'switch-to-tab', run: ['switch-to-tab'], expect: 'loading: true' },
    { plant: 'autofill-on-paste', target: 'autofill', run: ['autofill'], expect: 'autofilled a paste' },
    { plant: 'shift-del-bookmark', target: 'shift-del', run: ['shift-del'], expect: 'removed the visits of a bookmarked page' },
    { plant: 'paste-reads-on-open', target: 'context-menu', run: ['context-menu'], expect: 'clipboard read before a click' },
    { plant: 'focus-before-show', target: 'page-focus', run: ['page-focus'], expect: 'F6 in the pill with the dropdown open must give the page focus' },
    { plant: 'placeholder-push', target: 'page-focus', run: ['page-focus'], expect: 'pushed the placeholder of a browsing-context switch' },
    { plant: 'ime-guard-off', target: 'select-ime', run: ['suggestions', 'select-ime'], expect: 'committed during composition' },
    { plant: 'draft-lost', target: 'drafts', run: ['drafts'], expect: 'expected the draft text' },
    { plant: 'pill-drag-navigates', target: 'canonize-drop', run: ['canonize-drop'], expect: "must be left to the field" },
    { plant: 'engine-mode-ignored', target: 'modes-dropdown', run: ['search', 'modes-dropdown'], expect: 'no GET on /two/search' },
    { plant: 'reset-ignored', target: 'mode-chip', run: ['mode-chip'], expect: 'the x did not return to the default mode' },
    { plant: 'mode-sticks', target: 'mode-lifetime', run: ['mode-lifetime'], expect: 'mode did not return to the default after Enter' },
    { plant: 'tabs-lists-active', target: 'local-modes', run: ['search', 'local-modes'], expect: 'the active tab is listed' },
    { plant: 'restrict-dropped', target: 'local-modes', run: ['search', 'local-modes'], expect: 'expected the seeded bookmarks newest first' },
    { plant: 'phantom-history', target: 'local-modes', run: ['search', 'mode-lifetime', 'local-modes'], expect: 'a tab opened on one page reports canGoBack' },
    { plant: 'actions-unfiltered', target: 'local-modes', run: ['search', 'local-modes'], expect: 'listed a command outside the Browser category' },
    { plant: 'picks-dropped', target: 'command-centre', run: ['search', 'command-centre'], expect: 'no Explorer row' },
    { plant: 'help-row-executes', target: 'command-centre', run: ['search', 'command-centre'], expect: 'a help row opened the centred quick input' },
    { plant: 'cc-sends', target: 'command-centre-privacy', run: ['search', 'command-centre-privacy'], expect: 'sent resolveTypedAddress from Command centre' },
    { plant: 'cc-canonize', target: 'command-centre-privacy', run: ['search', 'command-centre-privacy'], expect: 'sent resolveTypedAddress from Command centre on Ctrl+Enter' },
    { plant: 'local-enter-commits', target: 'command-centre-privacy', run: ['search', 'command-centre-privacy'], expect: 'sent resolveTypedAddress from Actions on Enter' },
    { plant: 'cc-cycle-requery', target: 'command-centre-privacy', run: ['search', 'command-centre-privacy'], expect: 'sent resolveTypedAddress after Ctrl+Down out of Command centre' },
    { plant: 'default-ignored', target: 'mode-defaults', run: ['search', 'mode-defaults'], expect: 'Coding did not start in Command centre' },
    { plant: 'requery-repaints', target: 'mode-defaults', run: ['search', 'mode-defaults'], expect: "left History's list open" },
    { plant: 'token-kept', target: 'mode-tokens', run: ['search', 'mode-tokens'], expect: 'the * token did not enter Bookmarks' },
    { plant: 'cycle-off', target: 'mode-keys', run: ['search', 'mode-keys'], expect: 'Ctrl+Down did not move to the next mode' },
    { plant: 'visit-only-off', target: 'go-to', run: ['search', 'go-to'], expect: 'Command centre opened a search' },
    { plant: 'focus-keeps-mode', target: 'address-keys', run: ['search', 'address-keys'], expect: 'Ctrl+L left the pill in Command centre' },
    { plant: 'star-ignores-push', target: 'bookmark-star', run: ['bookmark-star'], expect: 'the star did not unfill after the bookmark was removed in chrome' },
    { plant: 'remove-needs-confirm', target: 'bookmark-editor', run: ['bookmark-editor'], expect: 'Remove did not remove the bookmark at once' },
    { plant: 'toolbar-ignores-push', target: 'bookmarks-toolbar', run: ['bookmarks-toolbar'], expect: 'the toolbar did not show a bookmark added in chrome' },
    { plant: 'reopen-no-history', target: 'reopen-closed', run: ['reopen-closed'], expect: 'the reopened tab has no back/forward history' },
    { plant: 'recent-opens-new-tab', target: 'history-menu', run: ['history-menu'], expect: 'a recent page must load in the current tab' },
    { plant: 'clear-drops-store', target: 'clear-history', run: ['clear-history'], expect: 'saved_pages still holds the planted in-range copy' },
    { plant: 'clear-takes-token', target: 'clear-history', run: ['clear-history'], expect: 'the IDE was signed out by the clear' },
    { plant: 'ctrl-d-everywhere', target: 'bookmark-keys', run: ['bookmark-star', 'bookmark-keys'], expect: 'Ctrl+D in the README.md editor' },
    { plant: 'menu-twin-diverges', target: 'app-menu', run: ['app-menu'], expect: 'row ran no Browser command id' },
    { plant: 'actions-reach-store', target: 'actions-list', run: ['actions-list'], expect: 'Actions row reached the store kind' },
    { plant: 'handoff-off', target: 'command-centre-handoff', run: ['search', 'command-centre', 'command-centre-handoff'], expect: "@ did not open Theia's picker" },
];

async function selfTest() {
    let failed = 0;
    try {
        const clean = await runSession(Object.keys(SCENARIOS));
        const red = clean.filter(r => r.failures.length || r.notScored);
        if (red.length) {
            failed++;
            console.error(`${NAME} --self-test: FAIL -- the clean control is not green: ${red.map(r => `${r.name}: ${r.failures.join(' | ') || 'not scored'}`).join('; ')}`);
        } else {
            console.log('  ok  clean control (no plant) -> green');
        }
    } catch (error) {
        console.error(`${NAME} --self-test: FAIL -- harness: the clean control could not be driven: ${error.message}`);
        return 1;
    }
    for (const c of PLANTS) {
        let results;
        try {
            results = await runSession(c.run, c.plant);
        } catch (error) {
            failed++;
            console.error(`${NAME} --self-test: FAIL -- harness: '${c.plant}' could not be driven: ${error.message}`);
            continue;
        }
        const target = results.find(r => r.name === c.target);
        if (!target || !target.notes.some(n => n.startsWith('PLANT'))) {
            failed++;
            console.error(`${NAME} --self-test: FAIL -- '${c.plant}' never applied its fault (the plant site drifted), so a red or green here would mean nothing`);
            continue;
        }
        const scored = target.failures.filter(f => f.includes(c.expect) && !f.includes(BROKEN) && !f.startsWith('harness:'));
        if (scored.length) {
            console.log(`  ok  ${c.plant} -> red on ${c.target}, naming '${c.expect}'`);
            console.log(`      ${c.target}: FAIL -- ${scored[0]}`);
        } else {
            failed++;
            console.error(`${NAME} --self-test: FAIL -- '${c.plant}' stayed green on ${c.target} or went red for another reason; got: ${target.failures.join(' | ') || '(no failures at all)'}`);
        }
    }
    if (failed) {
        console.error(`${NAME} --self-test: FAIL -- ${failed} case(s) did not behave as required`);
        return 1;
    }
    console.log(`${NAME} --self-test: PASS -- the clean control is green and all ${PLANTS.length} planted faults went red: ${PLANTS.map(c => c.plant).join(', ')}`);
    return 0;
}

async function main(args) {
    try {
        return report(await runSession(selectedScenarios(args)));
    } catch (error) {
        console.error(error.message.startsWith('harness:') ? error.message : `harness: ${error.message}`);
        return 1;
    }
}

const args = process.argv.slice(2);
if (args.includes('--help')) {
    console.log(`Usage: node scripts/${NAME}.mjs [--scenario ${Object.keys(SCENARIOS).join(',')}] | --self-test`);
    process.exit(0);
}
process.exit(args.includes('--self-test') ? await selfTest() : await main(args));
