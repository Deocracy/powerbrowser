// Spike 002c: a THROWAWAY chrome-side tab model, evaluated in the shell
// document (chrome scope) by run.mjs. It stands in for what PowerBrowserAPI
// code would have to do if this route were taken. It never touches product
// files: it replaces window.gBrowser members at runtime in a profile the
// spike launched, and nothing else.
//
// Layers (cumulative, switched by window.__spike002c.enable(name)):
//   node     - gBrowser.getTabForBrowser(overlay) returns a real element node
//   init     - window.gBrowserInit + getIcon/getTabSharingState/isTab, the members
//              TabManager.getWrapper and Tab.convert read
//   register - the shell is registered with the extension WindowTracker by
//              overriding members of the live windowTracker INSTANCE, plus
//              TabOpen/TabSelect/TabClose/TabAttrModified and a tabs-progress
//              fan-out
(() => {
  if (window.__spike002c) {
    return JSON.stringify({ already: true });
  }
  const { ExtensionParent } = ChromeUtils.importESModule("resource://gre/modules/ExtensionParent.sys.mjs");
  const { PowerBrowserWebTabs: W } = ChromeUtils.importESModule("chrome://powerbrowser/content/PowerBrowserAPI.sys.mjs");
  const gb = window.gBrowser;
  const theia = document.getElementById("powerbrowser-content");
  const flags = new Set();
  const calls = [];
  const errors = [];
  const record = (kind, data) => calls.length < 400 && calls.push({ t: Date.now(), stage: (window.__spike002cStage || "?"), kind, ...data });

  // Every chrome-side error while the spike runs, tagged with the stage.
  const consoleListener = {
    QueryInterface: ChromeUtils.generateQI(["nsIConsoleListener"]),
    observe(msg) {
      if (!(msg instanceof Ci.nsIScriptError) || (msg.flags & Ci.nsIScriptError.warningFlag) || errors.length >= 400) {
        return;
      }
      errors.push({ stage: (window.__spike002cStage || "?"), msg: msg.errorMessage, src: msg.sourceName, line: msg.lineNumber });
    },
  };
  Services.console.registerListener(consoleListener);

  // Tab nodes live in a hidden box so each has a parentNode (TabTracker.setId requires it).
  const host = document.createXULElement("box");
  host.id = "spike002c-tabs";
  host.hidden = true;
  document.documentElement.appendChild(host);

  const nodeFor = new Map(); // overlay <browser> -> node
  let selected = null;
  const progressListeners = new Set();
  const nodes = () => [...nodeFor.values()];

  function makeNode(browser) {
    const n = document.createXULElement("box");
    Object.assign(n, {
      linkedBrowser: browser, pinned: false, muted: false, muteReason: undefined, soundPlaying: false,
      multiselected: false, lastAccessed: Date.now(), linkedPanel: "spike002c-panel", undiscardable: false,
      openerTab: null, successor: null, group: null, splitview: null, userContextId: 0, closing: false, image: null,
    });
    Object.defineProperty(n, "selected", { get: () => selected === n });
    Object.defineProperty(n, "_tPos", { get: () => nodes().indexOf(n) });
    Object.defineProperty(n, "label", { get: () => browser.contentTitle || "" });
    host.appendChild(n);
    nodeFor.set(browser, n);
    // tabs-progress fan-out: one per-browser listener forwarding with the browser first.
    n._pl = {
      QueryInterface: ChromeUtils.generateQI(["nsIWebProgressListener", "nsISupportsWeakReference"]),
      onStateChange(wp, req, stateFlags, status) {
        if (wp.isTopLevel && stateFlags & Ci.nsIWebProgressListener.STATE_IS_WINDOW) {
          if (stateFlags & Ci.nsIWebProgressListener.STATE_START) n.setAttribute("busy", "true");
          if (stateFlags & Ci.nsIWebProgressListener.STATE_STOP) n.removeAttribute("busy");
        }
        for (const l of progressListeners) l.onStateChange?.(browser, wp, req, stateFlags, status);
      },
      onLocationChange(wp, req, loc, f) {
        for (const l of progressListeners) l.onLocationChange?.(browser, wp, req, loc, f);
      },
      onProgressChange() {}, onStatusChange() {}, onSecurityChange() {}, onContentBlockingEvent() {},
    };
    n._title = () => flags.has("register") && n.dispatchEvent(new CustomEvent("TabAttrModified", { bubbles: true, detail: { changed: ["label"] } }));
    if (flags.has("register")) {
      browser.addProgressListener(n._pl, Ci.nsIWebProgress.NOTIFY_STATE_WINDOW | Ci.nsIWebProgress.NOTIFY_LOCATION);
      browser.addEventListener("pagetitlechanged", n._title);
    }
    return n;
  }

  const plainTheia = gb.tabs.find(r => r.linkedBrowser === theia);
  // 'plain' = the product's record; 'hidden' = a record whose documentGlobal makes
  // TabManager.getWrapper skip it (the isAdoptingTab guard); 'node' = an exposed tab.
  const theiaRecords = {
    plain: plainTheia,
    hidden: { linkedBrowser: theia, documentGlobal: { gBrowserInit: { isAdoptingTab: () => true } } },
    node: null,
  };
  let theiaMode = "plain";
  let gate = "always";
  let rebackfill = false;
  let reattach = null;

  // Product code pushes {linkedBrowser} records and splices them back out
  // (PowerBrowserAPI.webTabOpen/webTabClose); the model observes both.
  class TabList extends Array {
    push(...recs) {
      for (const r of recs) {
        if (r.linkedBrowser === theia) {
          super.push(r);
          continue;
        }
        const n = makeNode(r.linkedBrowser);
        super.push(n);
        record("model.push", { url: r.linkedBrowser.currentURI?.spec });
        if (flags.has("register")) {
          if (!selected) { selected = n; reattach?.(); } // upstream TabOpen handler reads gBrowser.selectedTab.linkedBrowser
          n.dispatchEvent(new CustomEvent("TabOpen", { bubbles: true, detail: {} }));
        }
      }
      return this.length;
    }
    splice(i, count, ...rest) {
      const removed = super.splice(i, count, ...rest);
      for (const n of removed) {
        if (!nodeFor.has(n.linkedBrowser)) continue;
        if (flags.has("register")) {
          n.dispatchEvent(new CustomEvent("TabClose", { bubbles: true, detail: { adoptedBy: null } }));
          try { n.linkedBrowser.removeProgressListener(n._pl); } catch {}
        }
        if (selected === n) selected = null;
        nodeFor.delete(n.linkedBrowser);
        n.remove();
        record("model.splice", {});
      }
      return removed;
    }
  }
  const list = new TabList();
  for (const r of gb.tabs) list.push(r);
  gb.tabs = list;

  gb.getTabForBrowser = browser => {
    if (!flags.has("node")) return null;
    if (browser === theia) return theiaMode === "node" ? theiaRecords.node : null;
    return nodeFor.get(browser) || null;
  };
  gb.setIcon = (tab, iconURL, originalURL) => record("gBrowser.setIcon", { tabIsNode: !!tab && nodes().includes(tab), iconURL: String(iconURL).slice(0, 60), originalURL });

  function enableInit() {
    window.gBrowserInit = { isAdoptingTab: () => false, getTabToAdopt: () => null, delayedStartupFinished: true };
    gb.getIcon = tab => tab?.image ?? null;
    gb.getTabSharingState = () => ({ camera: undefined, microphone: undefined, screen: undefined });
    gb.isTab = t => nodes().includes(t);
  }

  let registerReport = null;
  function enableRegister() {
    const g = ExtensionParent.apiManager.global;
    const wt = g.windowTracker;
    const tt = g.tabTracker;
    const base = Object.getPrototypeOf(Object.getPrototypeOf(wt)); // WindowTrackerBase.prototype
    const isStock = w => base.isBrowserWindow.call(wt, w);
    const shellOk = () => gate === "always" || !!selected;
    reattach = () => gate === "whenSelected" && rebackfill && wt._handleWindowOpened(window);
    const top = () => {
      const m = Services.wm.getMostRecentWindow(null);
      if (m && ((m === window && shellOk()) || isStock(m))) return m;
      return Services.wm.getMostRecentWindow("navigator:browser") || (shellOk() ? window : null);
    };
    // Instance overrides of upstream class members: this is the whole "registration".
    // gate 'always': the shell is a browser window for its whole life;
    // 'whenSelected': only while a web tab is selected (Firefox's invariant that a
    // browser window always has a selectedTab, which Window.activeTab relies on).
    wt.isBrowserWindow = w => (w === window && shellOk()) || isStock(w);
    Object.defineProperty(wt, "topWindow", { configurable: true, get: top });
    Object.defineProperty(wt, "topNonPBWindow", { configurable: true, get: top });
    wt.getTopNormalWindow = () => top();

    Object.defineProperty(gb, "selectedTab", {
      configurable: true,
      get: () => selected,
      set: v => record("gBrowser.selectedTab=", { isNode: nodes().includes(v), note: "no route to the Theia frontend in the spike" }),
    });
    Object.defineProperty(gb, "selectedBrowser", { configurable: true, get: () => selected?.linkedBrowser ?? null });
    Object.defineProperty(gb, "selectedTabs", { configurable: true, get: () => (selected ? [selected] : []) });
    gb.addTabsProgressListener = l => progressListeners.add(l);
    gb.removeTabsProgressListener = l => progressListeners.delete(l);
    for (const n of nodes()) {
      n.linkedBrowser.addProgressListener(n._pl, Ci.nsIWebProgress.NOTIFY_STATE_WINDOW | Ci.nsIWebProgress.NOTIFY_LOCATION);
      n.linkedBrowser.addEventListener("pagetitlechanged", n._title);
    }

    // Selection follows the frontend's webTabActivated (polled here; a product
    // route would dispatch from the handleWebTabAction case instead).
    let lastActive = null;
    window.__spike002cPoll = setInterval(() => {
      const id = W.activeTabIdOf(theia);
      if (id === lastActive) return;
      lastActive = id;
      const b = [...nodeFor.keys()].find(x => W.tabIdOfBrowser(x) === id);
      const n = b && nodeFor.get(b);
      if (!n || n === selected) return; // a non-web widget is current: keep the last web tab selected
      const previousTab = selected;
      selected = n;
      // Gate reopening: listeners added while the shell was not a browser window
      // were never attached to it. Re-run the attach (DOM and Set dedup make it idempotent).
      if (!previousTab) reattach();
      n.dispatchEvent(new CustomEvent("TabSelect", { bubbles: true, detail: { previousTab } }));
    }, 100);

    // Late registration: what WindowTrackerBase.handleEvent("load") would have
    // done had the shell passed isBrowserWindow when it loaded.
    const openErrors = [];
    const listenerTypes = [...wt._listeners.keys()];
    const openListenerCount = wt._openListeners.size;
    wt._handleWindowOpened(window);
    for (const l of wt._openListeners) {
      if (l === wt._handleWindowOpened) continue;
      try { l(window); } catch (e) { openErrors.push(String(e) + " @ " + (e.stack || "").split("\n")[0]); }
    }
    tt.init();
    registerReport = { listenerTypesAtRegister: listenerTypes, openListenerCount, openErrors };
  }

  window.__spike002c = {
    enable(name) {
      if (flags.has(name)) return;
      if (name === "init") enableInit();
      if (name === "register") { flags.add(name); enableRegister(); return registerReport; }
      flags.add(name);
      return null;
    },
    setTheiaMode(mode) {
      if (mode === "node" && !theiaRecords.node) {
        const n = document.createXULElement("box");
        Object.assign(n, { linkedBrowser: theia, pinned: false, muted: false, linkedPanel: "p", userContextId: 0, multiselected: false, lastAccessed: 0, image: null });
        Object.defineProperty(n, "selected", { get: () => false });
        Object.defineProperty(n, "_tPos", { get: () => 0 });
        host.appendChild(n);
        theiaRecords.node = n;
      }
      gb.tabs[gb.tabs.findIndex(r => r.linkedBrowser === theia)] = theiaRecords[mode];
      theiaMode = mode;
      return mode;
    },
    setGate(v) { gate = v; return gate; },
    setRebackfill(v) { rebackfill = !!v; return rebackfill; },
    // EXT-07 without CustomizableUI: the click a Theia-rendered button would make.
    clickAction(extId) {
      const ext = WebExtensionPolicy.getByID(extId).extension;
      const ba = ExtensionParent.apiManager.global.browserActionFor(ext);
      try { return { popupUrl: ba.action.triggerClickOrPopup(selected, { button: 0, modifiers: [] }) || null, selectedUrl: selected?.linkedBrowser.currentURI.spec ?? null }; }
      catch (e) { return { threw: String(e) }; }
    },
    flags: () => [...flags],
    calls, errors,
    nodeOf: b => nodeFor.get(b) || null,
  };
  return JSON.stringify({ installed: true, tabsAtInstall: gb.tabs.length });
})
