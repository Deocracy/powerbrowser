// Phase 66 research gate (P66-04, Q3/Q4/Q5): a throwaway JSWindowActor child
// standing in for the planned PowerBrowserAgent child (P66-13). It is loaded only
// by p66-gate-probe.mjs, through a resource:// substitution the probe sets in
// its own throwaway profile; it is never part of a build and is not under
// powerbrowser/. Each message is one mechanism the agent child would use:
//   mouse   Window.synthesizeMouseEvent (ChromeOnly webidl, no XPCOM)
//   wheel   windowUtils.sendWheelEvent
//   key     nsITextInputProcessor (needs Cc/Ci in the child)
//   insert  windowUtils.sendContentCommandEvent("insertText")
//   console nsIConsoleAPIStorage listener (needs Cc/Ci in the child)
//   page    page-world reads and calls through wrappedJSObject
export class PbP66ProbeChild extends JSWindowActorChild {
  receiveMessage(message) {
    const win = this.contentWindow;
    const doc = this.document;
    const d = message.data || {};
    switch (message.name) {
      case "state": {
        const page = win.wrappedJSObject;
        const t = doc.getElementById("t");
        const r = t ? t.getBoundingClientRect() : null;
        const hit = d.at ? doc.elementFromPoint(d.at.x, d.at.y) : null;
        return {
          active: doc.activeElement ? doc.activeElement.id || doc.activeElement.localName : null,
          hasFocus: doc.hasFocus(),
          visibility: doc.visibilityState,
          inner: [win.innerWidth, win.innerHeight],
          dpr: win.devicePixelRatio,
          target: r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null,
          hit: hit ? hit.id || hit.localName : null,
          value: doc.getElementById("in") ? doc.getElementById("in").value : null,
          log: page.__log ? JSON.parse(page.JSON.stringify(page.__log)) : null,
          result: page.__result === undefined ? null : page.__result,
          console: this._console || [],
        };
      }
      case "mouse": {
        const { type, x, y, button = 0, clickCount = 1 } = d;
        return win.synthesizeMouseEvent(type, x, y, { button, clickCount, inputSource: win.MouseEvent.MOZ_SOURCE_MOUSE }, { isDOMEventSynthesized: true });
      }
      case "wheel": {
        win.windowUtils.sendWheelEvent(d.x, d.y, 0, d.dy, 0, win.WheelEvent.DOM_DELTA_PIXEL, 0, 0, 0, 0);
        return true;
      }
      case "focusInput": {
        doc.getElementById("in").focus();
        return doc.activeElement ? doc.activeElement.id : null;
      }
      case "key": {
        const tip = Cc["@mozilla.org/text-input-processor;1"].createInstance(Ci.nsITextInputProcessor);
        if (!tip.beginInputTransactionForTests(win)) {
          return "tip-refused";
        }
        for (const k of d.keys) {
          const ev = new win.KeyboardEvent("", { key: k.key, code: k.code, keyCode: k.keyCode || 0 });
          tip.keydown(ev);
          tip.keyup(ev);
        }
        return "sent";
      }
      case "insert": {
        win.windowUtils.sendContentCommandEvent("insertText", null, d.text);
        return true;
      }
      case "console": {
        this._console = [];
        const storage = Cc["@mozilla.org/consoleAPI-storage;1"].getService(Ci.nsIConsoleAPIStorage);
        const principal = Cc["@mozilla.org/systemprincipal;1"].createInstance(Ci.nsIPrincipal);
        const innerID = win.windowGlobalChild.innerWindowId;
        this._listener = msg => {
          const m = msg.wrappedJSObject || msg;
          if (m.innerID === innerID) {
            this._console.push({ level: m.level, args: (m.arguments || []).map(a => String(a)) });
          }
        };
        storage.addLogEventListener(this._listener, principal);
        return true;
      }
      case "run": {
        // A page-world call: what eval and the dialog triggers use.
        win.wrappedJSObject.eval(d.code);
        return true;
      }
    }
    return null;
  }
}

export class PbP66ProbeParent extends JSWindowActorParent {}
