// Spike 002a, chrome scope (evaluated in the shell document by run.mjs).
// Throwaway. Two halves:
//
//  1. PATCH EMULATION. Installs the exact logic of 050-extension-tab-host.patch
//     on the live extension-framework and WebDriver singletons, so the route is
//     proven on the built binary without a 50-minute rebuild. Every function
//     body below is copied from the patch's + lines.
//  2. TAB HOST PROTOTYPE. The shell half the patch requires: the
//     `extensiontabhost` attribute, a tabbrowser-shaped `gBrowser` whose `tabs`
//     are real DOM elements (one per overlay, never the Theia frame), a
//     `gBrowserInit` stub, TabOpen/TabSelect/TabClose/TabAttrModified events
//     and a tabs-progress fan-out. A product version would hook webTabOpen /
//     webTabClose / webTabGeometry instead of a MutationObserver.
(() => { try { return (() => {
  const { ExtensionParent } = ChromeUtils.importESModule('resource://gre/modules/ExtensionParent.sys.mjs');
  const { PrivateBrowsingUtils } = ChromeUtils.importESModule('resource://gre/modules/PrivateBrowsingUtils.sys.mjs');
  const { TabManager: WDTabManager } = ChromeUtils.importESModule('chrome://remote/content/shared/TabManager.sys.mjs');
  const g = ExtensionParent.apiManager.global;
  const wt = g.windowTracker;
  const report = { listenersBefore: wt ? [...wt._listeners.keys()] : null };
  if (!wt) return JSON.stringify({ error: 'extension framework global has no windowTracker yet' });

  // ---- 1. patch emulation (bodies identical to the patch) -------------------
  wt.isBrowserWindow = function (window) {
    let { documentElement } = window.document;
    return (
      documentElement.getAttribute('windowtype') === 'navigator:browser' ||
      this.isTabHostWindow(window)
    );
  };
  wt.isTabHostWindow = function (window) {
    return window.document.documentElement.hasAttribute('extensiontabhost');
  };
  wt._mostRecentBrowserWindow = function (nonPB) {
    let recent = type => nonPB ? Services.wm.getMostRecentNonPBWindow(type) : Services.wm.getMostRecentWindow(type);
    let win = null;
    try { win = recent(null); } catch (e) {}
    if (win && !win.closed && this.isBrowserWindowInitialized(win) && this.isBrowserWindow(win)) {
      return win;
    }
    try { win = recent('navigator:browser'); } catch (e) { win = null; }
    if (win) {
      return win;
    }
    for (let host of this.browserWindows()) {
      if (this.isTabHostWindow(host) && !(nonPB && PrivateBrowsingUtils.isWindowPrivate(host))) {
        return host;
      }
    }
    return recent('navigator:browser');
  };
  Object.defineProperty(wt, 'topWindow', { configurable: true, get() { return this._mostRecentBrowserWindow(false); } });
  Object.defineProperty(wt, 'topNonPBWindow', { configurable: true, get() { return this._mostRecentBrowserWindow(true); } });
  const origTopNormal = Object.getPrototypeOf(wt).getTopNormalWindow;
  wt.getTopNormalWindow = function (context) {
    let top = this.getTopWindow(context);
    if (top && this.isTabHostWindow(top)) {
      return top;
    }
    return origTopNormal.call(this, context);
  };
  const origTabsForWindow = WDTabManager.getTabsForWindow;
  WDTabManager.getTabsForWindow = function (win) {
    const tabBrowser = this.getTabBrowser(win);
    if (tabBrowser && tabBrowser.webDriverTabs) {
      return tabBrowser.webDriverTabs;
    }
    return origTabsForWindow.call(this, win);
  };

  // Patch hunks in ext-browser.js (Window.activeTab) and ext-browserAction.js
  // (updateWindow). The menus, sessions and sidebarAction guards live in
  // module scopes this evaluate cannot reach; run.mjs records their failures instead.
  const EMULATE_GUARDS = true;
  if (EMULATE_GUARDS) Object.defineProperty(g.Window.prototype, 'activeTab', { configurable: true, get() {
    let { tabManager } = this.extension;
    if (this.window.gBrowserInit.isAdoptingTab()) {
      return null;
    }
    let { selectedTab } = this.window.gBrowser;
    return selectedTab ? tabManager.getWrapper(selectedTab) : null;
  } });
  const anyAction = [...WebExtensionPolicy.getActiveExtensions()].map(p => p.extension && g.browserActionFor(p.extension)).find(Boolean);
  if (EMULATE_GUARDS && anyAction) {
    const proto = Object.getPrototypeOf(anyAction);
    const origUpdateWindow = proto.updateWindow;
    proto.updateWindow = function (window) {
      if (wt.isTabHostWindow(window)) {
        return;
      }
      return origUpdateWindow.call(this, window);
    };
  }
  report.browserActionGuardEmulated = EMULATE_GUARDS && !!anyAction;

  // ---- 2. tab host prototype -------------------------------------------------
  const XUL = 'http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul';
  const theiaBrowser = document.getElementById('powerbrowser-content');
  const theiaRecord = window.gBrowser.tabs[0];
  const strip = document.createElementNS(XUL, 'hbox');
  strip.id = 'spike002a-tab-host';
  strip.hidden = true;
  document.documentElement.appendChild(strip);
  const byBrowser = new Map();
  const progressListeners = new Set();
  const trace = (window.__spike002a = { events: [], setIcon: [], unsupported: [] });
  let selected = null;

  const fire = (tab, type, detail = {}) => {
    trace.events.push({ type, tPos: tab._tPos, url: tab.linkedBrowser.currentURI?.spec });
    tab.dispatchEvent(new CustomEvent(type, { bubbles: true, detail }));
  };
  // Tabs-progress fan-out: tabbrowser calls each listener with the browser first.
  const forwarderFor = browser => ({
    QueryInterface: ChromeUtils.generateQI(['nsIWebProgressListener', 'nsISupportsWeakReference']),
    onLocationChange(...a) { for (const l of progressListeners) l.onLocationChange?.(browser, ...a); },
    onStateChange(wp, req, flags, status) {
      const tab = byBrowser.get(browser);
      if (tab && wp.isTopLevel && (flags & Ci.nsIWebProgressListener.STATE_IS_NETWORK)) {
        const busy = !!(flags & Ci.nsIWebProgressListener.STATE_START);
        if (busy) tab.setAttribute('busy', 'true'); else tab.removeAttribute('busy');
        fire(tab, 'TabAttrModified', { changed: ['busy'] });
      }
      for (const l of progressListeners) l.onStateChange?.(browser, wp, req, flags, status);
    },
    onStatusChange(...a) { for (const l of progressListeners) l.onStatusChange?.(browser, ...a); },
    onProgressChange(...a) { for (const l of progressListeners) l.onProgressChange?.(browser, ...a); },
    onSecurityChange(...a) { for (const l of progressListeners) l.onSecurityChange?.(browser, ...a); },
    onContentBlockingEvent(...a) { for (const l of progressListeners) l.onContentBlockingEvent?.(browser, ...a); },
  });

  const makeTab = browser => {
    const tab = document.createElementNS(XUL, 'hbox');
    Object.assign(tab, {
      linkedBrowser: browser, linkedPanel: 'spike002a-panel', pinned: false, hidden: false,
      multiselected: false, muted: false, muteReason: undefined, soundPlaying: false,
      undiscardable: false, openerTab: null, group: null, splitview: null, userContextId: 0,
      lastAccessed: Date.now(), label: '', image: null, successor: null, closing: false,
    });
    Object.defineProperty(tab, '_tPos', { get: () => [...strip.children].indexOf(tab) });
    Object.defineProperty(tab, 'selected', { get: () => selected === tab });
    tab.toggleMuteAudio = () => { trace.unsupported.push('toggleMuteAudio'); };
    tab._forwarder = forwarderFor(browser);
    browser.addProgressListener(tab._forwarder, Ci.nsIWebProgress.NOTIFY_ALL);
    tab._title = () => { tab.label = browser.contentTitle; fire(tab, 'TabAttrModified', { changed: ['label'] }); };
    browser.addEventListener('pagetitlechanged', tab._title);
    strip.appendChild(tab);
    byBrowser.set(browser, tab);
    // tabbrowser always has a selected tab, and TabTracker's TabOpen handler
    // reads gBrowser.selectedTab.linkedBrowser; the first tab is selected on creation.
    const first = !selected;
    if (first) selected = tab;
    fire(tab, 'TabOpen', {});
    if (first) fire(tab, 'TabSelect', { previousTab: null });
    return tab;
  };
  const select = tab => {
    if (selected === tab) return;
    const previousTab = selected;
    selected = tab;
    tab.lastAccessed = Date.now();
    fire(tab, 'TabSelect', { previousTab });
  };
  const dropTab = browser => {
    const tab = byBrowser.get(browser);
    if (!tab) return;
    tab.closing = true;
    fire(tab, 'TabClose', {});
    byBrowser.delete(browser);
    if (selected === tab) selected = [...strip.children].find(t => t !== tab) || null;
    tab.remove();
  };
  const isOverlay = n => n.localName === 'browser' && n !== theiaBrowser && n.getAttribute('messagemanagergroup') === 'browsers';
  const watchVisibility = new MutationObserver(records => {
    for (const r of records) {
      const tab = byBrowser.get(r.target);
      if (tab && r.target.style.visibility === 'visible') select(tab);
    }
  });
  const watchChildren = new MutationObserver(records => {
    for (const r of records) {
      for (const n of r.addedNodes) if (isOverlay(n)) { makeTab(n); watchVisibility.observe(n, { attributes: true, attributeFilter: ['style'] }); }
      for (const n of r.removedNodes) if (isOverlay(n)) dropTab(n);
    }
  });
  watchChildren.observe(document.body, { childList: true });

  const stub = window.gBrowser;
  window.gBrowser = {
    get tabs() { return [...strip.children]; },
    // What WebDriver alone sees: the Theia frame first, then every overlay tab.
    get webDriverTabs() { return [theiaRecord, ...strip.children]; },
    get visibleTabs() { return [...strip.children]; },
    get selectedTab() { return selected; },
    set selectedTab(tab) { trace.unsupported.push('selectedTab='); },
    get selectedTabs() { return selected ? [selected] : []; },
    get selectedBrowser() { return selected ? selected.linkedBrowser : null; },
    get currentURI() { return selected ? selected.linkedBrowser.currentURI : null; },
    get tabContainer() { return strip; },
    get pinnedTabCount() { return 0; },
    tabGroups: [],
    getTabForBrowser(browser) { return byBrowser.get(browser) || null; },
    getBrowserForTab(tab) { return (tab && tab.linkedBrowser) || null; },
    isTab(t) { return !!t && t.parentNode === strip; },
    getIcon(tab) { return tab.image; },
    setIcon(tab, uri) { trace.setIcon.push({ isTab: !!tab, uri: String(uri && uri.spec || uri) }); if (tab) tab.image = String(uri && uri.spec || uri); },
    getTabSharingState() { return { camera: undefined, microphone: undefined, screen: undefined }; },
    addTabsProgressListener(l) { progressListeners.add(l); },
    removeTabsProgressListener(l) { progressListeners.delete(l); },
    // Chrome-initiated tab operations need a chrome -> Theia request (Phase 36's direction); not built here.
    addTab() { trace.unsupported.push('addTab'); throw new Error('spike002a: addTab unsupported'); },
    removeTab() { trace.unsupported.push('removeTab'); },
  };
  window.gBrowserInit = { delayedStartupFinished: true, getTabToAdopt: () => null, isAdoptingTab: () => false };
  document.documentElement.setAttribute('extensiontabhost', 'true');
  // Adopt overlays that already exist (none in the normal run order).
  for (const n of document.body.children) if (isOverlay(n)) { makeTab(n); watchVisibility.observe(n, { attributes: true, attributeFilter: ['style'] }); }

  // A patched build admits the shell on its load event (WindowTrackerBase
  // handleEvent -> _handleWindowOpened). It already loaded, so take that path by hand.
  wt._handleWindowOpened(window);
  // Patch hunk 4 guards _handleWindowOpen for a host window that opens with no tab
  // (a tabbrowser window never does); spike run 1 threw here without it.
  if (g.tabTracker.initialized && (window.gBrowser.tabs.length || !EMULATE_GUARDS)) {
    try { g.tabTracker._handleWindowOpen(window); } catch (e) { report.handleWindowOpenThrew = String(e); }
  }
  report.stubTabsBefore = stub.tabs.length;
  report.isBrowserWindow = wt.isBrowserWindow(window);
  report.topWindowIsShell = wt.topWindow === window;
  report.listenersAfter = [...wt._listeners.keys()];
  report.tabTrackerInitialized = !!g.tabTracker.initialized;
  return JSON.stringify(report);
})(); } catch (e) { return JSON.stringify({ error: String(e), stack: e.stack }); } })()
