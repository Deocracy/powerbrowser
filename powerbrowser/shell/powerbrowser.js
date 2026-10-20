/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * D-89/D-94/SHELL-05: the chrome bootstrap for powerbrowser.xhtml. A classic
 * script (not a module) -- ES modules are reached from here via
 * ChromeUtils.importESModule, matching the Picture-in-Picture player
 * window's own pattern.
 *
 * The POWERBROWSER_SHELL_READY sentinel is written to stdout via dump() as
 * the very first thing this handler does, before any other bootstrap
 * work -- SHELL-05's ordering assertion (shell paints before backend
 * work is even attempted) can never be satisfied by accident.
 */

document.addEventListener(
  "DOMContentLoaded",
  () => {
    dump("POWERBROWSER_SHELL_READY chrome://powerbrowser/content/powerbrowser.xhtml\n");

    const { PowerBrowserAPI, PowerBrowserWebTabs } = ChromeUtils.importESModule("chrome://powerbrowser/content/PowerBrowserAPI.sys.mjs");

    const browserElement = document.getElementById("powerbrowser-content");
    const loadingElement = document.getElementById("powerbrowser-loading");
    const errorElement = document.getElementById("powerbrowser-error");
    const errorMessageElement = document.getElementById("powerbrowser-error-message");
    const errorRetryButton = document.getElementById("powerbrowser-error-retry");
    const errorDiagnosticsButton = document.getElementById("powerbrowser-error-diagnostics");
    const diagnosticsElement = document.getElementById("powerbrowser-diagnostics");
    const diagnosticsFieldsElement = document.getElementById("powerbrowser-diagnostics-fields");
    const diagnosticsLogElement = document.getElementById("powerbrowser-diagnostics-log");
    const diagnosticsCloseButton = document.getElementById("powerbrowser-diagnostics-close");
    // The deck's RESOLVED visibility, on the same dump() sentinel channel as
    // everything else here. This is the only assertion available on Linux
    // that observes the chrome document's rendered state at all: BiDi's
    // browsingContext tree contains only the content <browser> (so a
    // screenshot or a #theia-app-shell query passes with Theia fully
    // occluded), and chrome-context Marionette is platform-blocked
    // (WINDOWS.md #7). Computed style is the right invariant because it
    // catches a dropped inline attribute AND a bad stylesheet rule -- the two
    // ways this deck has actually broken. Emitted from exactly two sites: the
    // swap (where all three layers must be gone) and the error (where one
    // must not be), which is enough for a negative assertion and its
    // positive control without touching any other path.
    const dumpDeckState = (where) =>
      dump(
        `POWERBROWSER_DECK_STATE ${JSON.stringify({
          loading: window.getComputedStyle(loadingElement).display,
          error: window.getComputedStyle(errorElement).display,
          diagnostics: window.getComputedStyle(diagnosticsElement).display,
          where,
        })}\n`
      );

    // WebDriver finds content browsing contexts through `win.gBrowser.tabs`
    // (remote/shared/TabManager.sys.mjs) and identifies each one by its
    // browser's `permanentKey` (remote/shared/NavigableManager.sys.mjs returns
    // a null context id without one). The shell is deliberately not Firefox
    // chrome and has no tabbrowser, so it presents its single browser through
    // that same shape -- also the seed of the chrome-owned tab model the
    // post-4.0 bridge needs.
    //
    // 14.1.1-04 (G-14.1.1-19), widened in 27-03: the three members beside
    // `tabs` are the members upstream CALLS on a gBrowser receiver at the
    // pinned tag that this stand-in implements. The required set is derived
    // from browser-custom-element.mjs plus every *Parent.sys.mjs under
    // upstream/browser/actors and upstream/toolkit/actors. Five more members
    // upstream calls (getNotificationBox, getTabDialogBox, refreshBlocked,
    // removeTab, setTabLabelForAuthPrompts) are deliberately absent, each
    // with its reason in the gate's DELIBERATELY_ABSENT; refreshBlocked is a
    // known gap (it throws only with accessibility.blockautorefresh on).
    // Those call sites optional-chain the RECEIVER, not the member, so a
    // non-nullish stand-in missing the member threw once per overlay creation
    // and buried the next real chrome-side error in the same log.
    // scripts/verify-shell-gbrowser-standin.mjs re-derives both sides at
    // --quick time and compares as set equality, so an upstream rebase adding a
    // call and a member deleted or added here each go red by name.
    //
    // None of them synthesises a tab object: a fabricated tab handed to
    // LinkHandlerParent or ContextMenuParent would let privileged actors act on
    // a tab that does not exist.
    browserElement.permanentKey = PowerBrowserAPI.createPermanentKey();
    window.gBrowser = {
      tabs: [{ linkedBrowser: browserElement }],
      // No tab strip here, so no browser has a tab record. Returning null is
      // what makes the upstream optional chain's condition false and its caller
      // take the no-tab branch -- the behaviour that already applied before the throw.
      getTabForBrowser() {
        return null;
      },
      // The overlay records PowerBrowserAPI.webTabOpen pushes onto `tabs` carry
      // exactly this field; anything else has no linked browser.
      getBrowserForTab(tab) {
        return (tab && tab.linkedBrowser) || null;
      },
      // No-op: there is no tab strip to paint a favicon on.
      setIcon() {},
    };

    // Exposed for plan 04-04's TheiaService.sys.mjs to call once the
    // backend is ready: navigates the content browser to the Theia
    // backend's URL and hides the branded loading layer. The navigation
    // itself goes through PowerBrowserAPI.loadURIInBrowser -- both
    // fixupAndLoadURIString and nodePrincipal are privileged chrome API and
    // belong behind the one boundary file, not here.
    window.powerbrowserSwapToUrl = function powerbrowserSwapToUrl(url) {
      dump(`POWERBROWSER_SHELL_SWAP ${url}\n`);
      PowerBrowserAPI.loadURIInBrowser(browserElement, url);
      loadingElement.style.display = "none";
      dumpDeckState("swap");
    };

    window.powerbrowserGetBrowser = function powerbrowserGetBrowser() {
      return browserElement;
    };

    // SHELL-03 (05-02): the error layer, reached by TheiaService exactly
    // the same way powerbrowserSwapToUrl is -- through this window's exposed
    // globals, never by touching browserElement's own location (D-114).
    // Neither the message text nor either sentinel may ever carry the
    // per-launch token or any credential; TheiaService's `reason` strings
    // are always static/derived-from-config text, never the token, and
    // `detail` here carries only `reason` and `recoverable`.
    //
    // 01-07: `reason` is now one of TheiaService's USER_MESSAGE values -- a
    // plain-language, product-named sentence ending in an on-screen
    // affordance -- and carries no pref key, sentinel name, port, timeout or
    // raw exception text. Those live in the failure's detail rows, announced
    // on their own POWERBROWSER_ERROR_DIAGNOSTICS line here and rendered as
    // field rows by powerbrowserShowDiagnostics below. Both read the SAME
    // TheiaService.getFailureDetails() accessor (the D-119/D-120 shape), so a
    // row that renders is a row that was announced. The SHELL_ERROR sentinel's
    // own {reason, recoverable} shape is unchanged and deliberately gains no
    // key -- verify-platform.sh's shell03-budget-exhausted-error asserts it
    // exactly.
    window.powerbrowserShowError = function powerbrowserShowError(detail) {
      const { reason, recoverable } = detail;
      errorMessageElement.textContent = reason;
      // 01-13: the classification reaches the CONTROL. A failure the supervisor
      // has classified unrecoverable is not offered a Retry, because a control
      // the interface is designed to refuse is worse than no control -- it
      // consumes the user's one remaining idea about what to do. This is
      // PRESENTATION only: the refusal itself lives in TheiaService.retry(),
      // which is what a caller reaching powerbrowserRetry() without the button
      // hits, and the DOM is never read back as authority. Written at the SHOW
      // site only -- one writer for one fact, and this function always runs
      // before the layer is visible again, so powerbrowserHideError needs no
      // reset that could drift out of step with it.
      errorRetryButton.hidden = !recoverable;
      errorElement.style.display = "flex";
      dump(`POWERBROWSER_SHELL_ERROR ${JSON.stringify({ reason, recoverable })}\n`);
      dump(`POWERBROWSER_ERROR_DIAGNOSTICS ${JSON.stringify({ rows: TheiaService.getFailureDetails() })}\n`);
      dumpDeckState("error");
    };

    window.powerbrowserHideError = function powerbrowserHideError() {
      errorElement.style.display = "none";
      dump(`POWERBROWSER_SHELL_ERROR_CLEARED ${JSON.stringify({})}\n`);
    };

    // 01-10: the Retry control's own supervisor call is a fire-and-forget
    // promise root too, so it carries the SAME terminal handler the start call
    // below does. A Retry whose restart path rejects must not be silent either
    // -- that would leave the error layer hidden and never bring it back, which
    // is strictly worse than not offering Retry.
    //
    // 01-11 (01-VERIFICATION.md's failed truth 2c): hiding the layer is the
    // SUPERVISOR's to do, through powerbrowserHideError above, and this function
    // no longer writes the element's visibility itself. It used to, and that made
    // two owners of one fact: the DOM went blank here while TheiaService's
    // `_errorShown` repaint guard stayed set, so the first Retry that failed left
    // a blank window with no message, no Retry and no Details for the rest of the
    // session. TheiaService.retry() now calls its own `_hideError()`, which is
    // the single route to this element's `display` and also stops the stale
    // background recovery probe -- so the two representations cannot drift apart.
    window.powerbrowserRetry = function powerbrowserRetry() {
      TheiaService.retry().catch(err => TheiaService.reportUnexpectedFailure(err));
    };

    errorRetryButton.addEventListener("click", () => {
      window.powerbrowserRetry();
    });

    // SHELL-04 (05-03): the diagnostics layer, third member of the deck.
    // Snapshot-on-open only (D-118's recorded decision -- no live polling
    // loop), reached by the Ctrl+Alt+Shift+D chord below or this button.
    // Renders exactly the objects TheiaService's existing state/log
    // accessors return, plus the identity accessor -- no new data plumbing.
    // Every rendered value is a text node, never an assigned markup string, and
    // neither the rendered layer nor its sentinel ever carries the
    // per-launch token, a cookie value, or any other credential.
    //
    // Toggles: calling this while the layer is already visible hides it
    // instead, so the same chord opens and closes. A sentinel line is
    // written on EVERY call (open or close) -- the field values only,
    // never the log text itself.
    window.powerbrowserShowDiagnostics = function powerbrowserShowDiagnostics() {
      const state = TheiaService.getState();
      const log = TheiaService.getRecentLog();
      const identity = PowerBrowserAPI.getAppIdentity();
      const sentinel = {
        port: state.port,
        pid: state.pid,
        healthy: state.healthy,
        restartCount: state.restartCount,
        name: identity.name,
        vendor: identity.vendor,
        version: identity.version,
        logLines: log.length,
      };

      // Resolved value, not the inline one: the layer's hidden DEFAULT comes
      // from powerbrowser.css (the CSP drops a style attribute -- see that
      // file's header), so `.style.display` reads "" until the first CSSOM
      // write and `!== "none"` would report a never-opened layer as visible,
      // making the first chord press hide something already hidden.
      const wasVisible = window.getComputedStyle(diagnosticsElement).display !== "none";
      if (wasVisible) {
        diagnosticsElement.style.display = "none";
        dump(`POWERBROWSER_DIAGNOSTICS ${JSON.stringify(sentinel)}\n`);
        return;
      }

      diagnosticsFieldsElement.textContent = "";
      // 01-07: the current failure's own identifiers are appended after the
      // steady-state rows -- the pref key, the resolved path, the readiness
      // sentinel, the health port, the elapsed timeout, the raw exception
      // text. Every one of them was previously written into the full-screen
      // error message; this is where they moved TO, and the whole point of the
      // rewrite is that nothing was dropped. The list is exactly what the
      // failing path itself supplied, so a failure with no port contributes no
      // empty-labelled port row -- absent identifiers produce no rows at all,
      // rather than rows reading "Port: null".
      const rows = [
        ["Port", state.port],
        ["Process ID", state.pid],
        ["Health", state.healthy ? "healthy" : "unhealthy"],
        ["Restart count", state.restartCount],
        ["Name", identity.name],
        ["Vendor", identity.vendor],
        ["Version", identity.version],
        ...TheiaService.getFailureDetails(),
      ];
      for (const [label, value] of rows) {
        const row = document.createElement("div");
        row.textContent = `${label}: ${value}`;
        diagnosticsFieldsElement.appendChild(row);
      }
      diagnosticsLogElement.textContent = log.join("\n");

      diagnosticsElement.style.display = "flex";
      dump(`POWERBROWSER_DIAGNOSTICS ${JSON.stringify(sentinel)}\n`);
    };

    window.powerbrowserHideDiagnostics = function powerbrowserHideDiagnostics() {
      diagnosticsElement.style.display = "none";
    };

    diagnosticsCloseButton.addEventListener("click", () => {
      window.powerbrowserHideDiagnostics();
    });

    errorDiagnosticsButton.addEventListener("click", () => {
      window.powerbrowserShowDiagnostics();
    });

    // Task 2 (04-03) proof-of-resolution: import PowerBrowserAPI.sys.mjs and
    // read back two sidecar prefs through it, emitting an additional
    // sentinel. Left in place -- plan 04-04 keeps it.
    const backendMain = PowerBrowserAPI.getStringPref("powerbrowser.sidecar.backendMain", "");
    const nodePath = PowerBrowserAPI.getStringPref("powerbrowser.sidecar.nodePath", "");
    dump(`POWERBROWSER_SIDECAR_PREFS backendMain=${backendMain} nodePath=${nodePath}\n`);

    // D-119/D-120 (05-03): the startup identity sentinel. Written once per
    // launch, from the SAME accessor the diagnostics layer's show global
    // reads, so the repointed branding-identity check (D-120) and the
    // rendered surface can never disagree. Deterministic and headless-safe
    // -- unlike the diagnostics sentinel above, this never depends on the
    // chord or a chrome driver.
    dump(`POWERBROWSER_APP_IDENTITY ${JSON.stringify(PowerBrowserAPI.getAppIdentity())}\n`);

    // 04-04: hand off to the backend supervisor. The shell-ready sentinel
    // above is already written -- nothing in this spawn path may run
    // before it.
    const { TheiaService } = ChromeUtils.importESModule("chrome://powerbrowser/content/TheiaService.sys.mjs");
    // Announce shell readiness the way Firefox's own chrome does, so WebDriver
    // will create a session against the shell window.
    PowerBrowserAPI.notifyStartupFinished(window);

    // 01-10: the terminal handler. This call is fire-and-forget by design (the
    // shell must paint before any backend work, SHELL-05), which makes it a
    // promise ROOT: without a handler here a rejection anywhere in the start
    // path became an unhandled promise rejection in chrome and the user was
    // left on the branded loading layer with no message, no Retry and no
    // Details. It routes to the supervisor's own single terminal handler
    // rather than painting anything from here on purpose -- every user-facing
    // sentence lives in TheiaService's USER_MESSAGE table, which is the file
    // shell-error-copy-no-internals derives its check surface from; copy
    // authored in this bootstrap would ship outside every check that exists.
    TheiaService.start(browserElement).catch(err => TheiaService.reportUnexpectedFailure(err));

    // D-118: the diagnostics layer's reserved global chord, immune to a
    // focused content <browser> swallowing it -- the XUL <keyset>/<key
    // reserved="true"> mechanism Firefox's own global shortcuts (Ctrl+T,
    // Ctrl+L, ...) use, not a raw keydown listener (RESEARCH.md Pattern 6).
    // Research confirmed zero three-modifier chords are claimed anywhere in
    // the pinned Theia packages. The same chord closes the layer when it is
    // already open (powerbrowserShowDiagnostics's own toggle).
    const diagnosticsKeyset = document.createXULElement("keyset");
    const diagnosticsKey = document.createXULElement("key");
    diagnosticsKey.setAttribute("id", "powerbrowser-diagnostics-key");
    diagnosticsKey.setAttribute("modifiers", "accel,alt,shift");
    diagnosticsKey.setAttribute("key", "D");
    diagnosticsKey.setAttribute("reserved", "true");
    diagnosticsKey.addEventListener("command", () => {
      window.powerbrowserShowDiagnostics();
    });
    diagnosticsKeyset.appendChild(diagnosticsKey);

    // GUI-02 (14.1-01): the one key guaranteed to LEAVE a web page. A page
    // rendered in a web-tab overlay owns the focused docshell, so Theia never
    // sees Ctrl+L / Cmd+L while the page has focus (14.1-UI-SPEC A13,
    // 14.1-RESEARCH Pitfall 8). A reserved key is handled in chrome before any
    // content docshell -- including a focused overlay -- sees it, which is the
    // only mechanism that can hand focus back to the Theia frame from there.
    // The API method refocuses the frame and asks the frontend, over the
    // state-push channel, to focus the address pill.
    const focusAddressKey = document.createXULElement("key");
    focusAddressKey.setAttribute("id", "powerbrowser-focus-address-key");
    focusAddressKey.setAttribute("modifiers", "accel");
    focusAddressKey.setAttribute("key", "L");
    focusAddressKey.setAttribute("reserved", "true");
    focusAddressKey.addEventListener("command", () => {
      PowerBrowserAPI.webTabFocusAddress(browserElement);
    });
    diagnosticsKeyset.appendChild(focusAddressKey);

    // Phase 27: page-scoped browser keys. The 2026-10-20 ruling: a Firefox key
    // that clashes with a Theia key takes the browser meaning only while a web
    // page has focus. Every row is created disabled and the focus tracker below
    // enables the rows only while chrome's active element is an overlay
    // <browser>; GlobalKeyListener reads `disabled` live on every key event
    // (KeyEventHandler.cpp:187-190), so with the Theia frame focused every key
    // goes to Theia untouched (KEY-04). Each row mirrors one row of PAGE_SHORTCUTS
    // in theia/extensions/chrome-bar/src/browser/chrome-bar-shortcuts.ts, which
    // owns the action; `firefox` names the upstream browser-sets.inc.xhtml key
    // the row mirrors.
    const PAGE_KEYS = [
      { id: "stop", keycode: "VK_ESCAPE", modifiers: "", reserved: false, landsInTheia: false, firefox: "key_stop" },
    ];
    const pageKeyElements = PAGE_KEYS.map(row => {
      const key = document.createXULElement("key");
      key.setAttribute("id", `powerbrowser-page-key-${row.id}`);
      if (row.key) {
        key.setAttribute("key", row.key);
      } else {
        key.setAttribute("keycode", row.keycode);
      }
      if (row.modifiers) {
        key.setAttribute("modifiers", row.modifiers);
      }
      if (row.reserved) {
        key.setAttribute("reserved", "true");
      }
      key.setAttribute("disabled", "true");
      key.addEventListener("command", () => {
        PowerBrowserWebTabs.relayShortcut(browserElement, document.activeElement, row.id, row.landsInTheia);
      });
      diagnosticsKeyset.appendChild(key);
      return key;
    });
    const syncPageFocus = () => {
      const tabId = PowerBrowserWebTabs.tabIdOfBrowser(document.activeElement);
      for (const key of pageKeyElements) {
        if (tabId === null) {
          key.setAttribute("disabled", "true");
        } else {
          key.removeAttribute("disabled");
        }
      }
      PowerBrowserWebTabs.pushPageFocus(browserElement, tabId);
    };
    document.addEventListener("focus", syncPageFocus, true);
    // Deferred one microtask so it reads the element focus moved TO.
    document.addEventListener("blur", () => Promise.resolve().then(syncPageFocus), true);
    document.documentElement.appendChild(diagnosticsKeyset);

    // Custom title bar. The root's `customtitlebar` attribute
    // (powerbrowser.xhtml) has the widget draw no OS title bar -- what
    // browser.xhtml does when tabs live in the title bar -- so that row is
    // Theia's. Two things the OS bar did are done here, because both are
    // chrome-only in Gecko: the window buttons, and the drag handles
    // (`-moz-window-dragging`), laid over whichever parts of the frontend's
    // top row it reports as empty. Double-click and right-click on a handle
    // are the widget's own titlebar actions and follow the desktop's
    // settings. Where the desktop offers no client-side decoration the
    // buttons hide themselves (CSS), the OS bar stays, and the width
    // reported below is 0. Both globals are reached through PowerBrowserAPI's
    // windowChrome / windowDragRegions cases, off the frame that asked.
    const controls = document.getElementById("powerbrowser-window-controls");
    document.getElementById("powerbrowser-window-minimize").addEventListener("click", () => window.minimize());
    document.getElementById("powerbrowser-window-maximize").addEventListener("click", () => {
      if (window.windowState === window.STATE_MAXIMIZED) {
        window.restore();
      } else {
        window.maximize();
      }
    });
    // NG-037: the core window is the session (notes/browser-window-model.md:15-18).
    // Closing it -- this button, or the desktop's own close, which reaches the
    // window as its close event -- quits the whole application, stock browser
    // windows included, and that quit stops the backend. browser.xhtml answers
    // the same event the same way (upstream browser-main.js:41). Returning
    // false keeps the window open while the quit closes everything in order.
    const quitFromCoreClose = () => {
      PowerBrowserAPI.quitApplication();
      return false;
    };
    document.getElementById("powerbrowser-window-close").addEventListener("click", quitFromCoreClose);
    window.onclose = quitFromCoreClose;
    const dragHost = document.getElementById("powerbrowser-drag-regions");
    window.powerbrowserWindowChrome = () => ({ width: controls.getBoundingClientRect().width });
    window.powerbrowserSetDragRegions = (rects, height) => {
      if (height > 0) {
        controls.style.height = `${height}px`;
      }
      dragHost.replaceChildren(
        ...rects.map(({ x, y, w, h }) => {
          const handle = document.createElement("div");
          handle.className = "powerbrowser-drag";
          Object.assign(handle.style, { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px` });
          return handle;
        })
      );
    };

    // GUI-01 (01-05 Task 3): NOTHING is registered here for the
    // open-browser-window command, and that is the ratified design, not an
    // omission. Task 1's env-gated POWERBROWSER_SPIKE_GUI01 block lived here
    // and is removed; the Task 2 checkpoint ratified candidate A, which is
    // `window.open(url, '_blank')` called from the Theia frontend itself
    // (theia/extensions/tab-uris/src/browser/browser-window-command.ts).
    //
    // Why that needs no chrome-side code at all: this window carries no
    // nsIBrowserDOMWindow, so nsWindowWatcher cannot divert a content
    // window.open into a tab and falls through to
    // nsAppStartup::CreateChromeWindow -> AppWindow::CreateNewContentWindow,
    // which opens BROWSER_CHROME_URL -- and since patch 020 no longer
    // overrides that define, BROWSER_CHROME_URL is now stock upstream browser
    // chrome. No privileged code, no new Firefox-internal touchpoint, no new
    // catalogue row, and it works with the privileged-JS development flag off
    // because it uses no privileged surface whatsoever.
    //
    // PowerBrowserAPI.openBrowserWindow() remains, unused by this path: it is
    // what candidate B (the pre-approved JSWindowActor fallback) would call,
    // and it is what the spike drove observation 4 through.
  },
  { once: true }
);
