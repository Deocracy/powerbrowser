/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// GUI-08 (15-01): content-side half of the PowerBrowserGroup actor pair.
//
// The Theia frontend is unprivileged web content: it cannot reach the actor
// directly, so it posts PowerBrowserGroupRequest DOM events carrying
// { requestId, msg }. This child forwards each one over
// PowerBrowserGroupMutation to the parent and posts the ack back as a
// PowerBrowserGroupResponse DOM event carrying { requestId, reply }, which
// the frontend correlator matches up (5s ack timeout, then the contracted
// save-error bar).
//
// Boundary discipline (D-96): this file carries ZERO privileged reach -- no
// module import of any kind, only the actor globals plus DOM dispatch. It
// loads solely in documents matching the Theia local origin (the matches
// pin in the registration call), so stock-window web content never runs it.
// The edit-state child at the end of this file (33-05, PAGE-09) is a second
// pair's child with its own registration; see its own note.
//
// GUI-02 (14.1-01): the channel now runs in BOTH directions. Chrome pushes
// web-tab state (URL, title, loading, back/forward availability, and the
// reserved accel+L focus request) to the frontend as a
// PowerBrowserWebTabState actor message; receiveMessage below re-dispatches
// it into the content window as a DOM event of the same name, under the
// same content-compartment rule sendResponse already documents. The
// payload is primitives only, so the JSON round trip is lossless.

export class PowerBrowserGroupChild extends JSWindowActorChild {
  handleEvent(event) {
    if (!event || event.type !== "PowerBrowserGroupRequest") {
      return;
    }
    const detail = event.detail || {};
    const requestId = detail.requestId;
    const msg = detail.msg;
    if (typeof requestId !== "string" || !requestId || !msg || typeof msg.kind !== "string") {
      return;
    }
    // IN-10: sendQuery can throw synchronously (actor shutting down,
    // message-manager gone) -- nack immediately instead of leaving the
    // frontend to wait out the full 5s ack timeout.
    let pending;
    try {
      pending = this.sendQuery("PowerBrowserGroupMutation", msg);
    } catch (error) {
      this.sendResponse(requestId, {
        ok: false,
        reason: "store",
        message: String((error && error.message) || error),
      });
      return;
    }
    // GUI-01 (F9): the synchronous "chrome has this" signal. DOM dispatch is
    // synchronous, so calling preventDefault here makes the frontend's own
    // `window.dispatchEvent(...)` return false the instant this runs -- which
    // is how browser-window-command.ts decides between this channel and its
    // window.open fallback WITHOUT awaiting an ack. That distinction is not a
    // style choice: window.open needs the user activation of the click that
    // started the request, and an await spends it, so a fallback decided 5s
    // later is a fallback the popup blocker eats. Deliberately AFTER the
    // sendQuery above -- a synchronous throw there leaves the event
    // un-prevented, so the frontend falls back instead of opening nothing.
    // A no-op for the group mutations: GroupActorClient's events are not
    // cancelable, and preventDefault on a non-cancelable event does nothing.
    event.preventDefault();
    pending.then(
      reply => {
        this.sendResponse(requestId, reply);
      },
      error => {
        this.sendResponse(requestId, {
          ok: false,
          reason: "store",
          message: String((error && error.message) || error),
        });
      }
    );
  }

  sendResponse(requestId, reply) {
    const win = this.contentWindow;
    if (!win) {
      return;
    }
    // The detail MUST be built in the content window's compartment. Handing
    // content an object from this scope makes the frontend read it through an
    // Xray that exposes none of its own properties, so `detail.requestId` came
    // back undefined, the correlator dropped every reply as malformed, and
    // each mutation waited out its full 5s ack timeout EVEN WHEN chrome had
    // already applied the write. That was one of the faults that kept this
    // channel dead from the day it was written.
    //
    // Upstream clones this hop with the privileged clone helper
    // (WebChannelChild.sys.mjs:69, RemotePageChild.sys.mjs:103). We cannot:
    // that helper's namespace is an unconditional forbidden pattern outside
    // PowerBrowserAPI.sys.mjs (D-96, enforced by
    // scripts/check-internals-boundary.sh), and this file's whole point is
    // ZERO privileged reach. Round-tripping through the CONTENT window's own
    // JSON does the same job with no privileged API: the parse runs in that
    // compartment, so the result is a plain content object. The payload is
    // JSON-safe by construction -- requestId is a string and reply is the
    // parent's {ok, kind, ...} record of primitives.
    //
    // Through the Xray this actor holds on the window, `win.JSON` is an
    // object whose methods are NOT callable -- `win.JSON.parse is not a
    // function`, measured live by 14.1-03's web-tab check, which found that
    // every reply on this channel had thrown here and every awaited request
    // in the frontend had timed out. `wrappedJSObject` waives the Xray for
    // exactly this call, so the content window's own JSON.parse runs on a
    // primitive string and hands back a content object. That waiver is the
    // one non-Xray touch in this file: the frontend origin is already the
    // trusted party (the matches pin and the embedder-is-primary wall admit
    // nothing else), and a string in, an object out exposes nothing of this
    // scope to it.
    win.dispatchEvent(
      new win.CustomEvent("PowerBrowserGroupResponse", {
        detail: win.wrappedJSObject.JSON.parse(JSON.stringify({ requestId, reply })),
      })
    );
  }

  // GUI-02 (14.1-01): chrome -> content. Same content-compartment rule as
  // sendResponse above -- no privileged clone helper, the CONTENT window's
  // own JSON (reached through the same Xray waiver, for the same measured
  // reason) builds the detail -- so this file keeps zero privileged reach.
  receiveMessage(message) {
    if (!message || message.name !== "PowerBrowserWebTabState") {
      return;
    }
    const win = this.contentWindow;
    if (!win) {
      return;
    }
    win.dispatchEvent(
      new win.CustomEvent("PowerBrowserWebTabState", {
        detail: win.wrappedJSObject.JSON.parse(JSON.stringify(message.data)),
      })
    );
  }
}

// Phase 33 plan 05 (PAGE-09): the content half of the PowerBrowserEditState pair. Unlike the group child it has
// no events and no matches pin: Gecko creates it only when chrome's webTabEditEnabled asks a web-tab overlay
// (messageManagerGroups "browsers"), so page script never reaches it. It answers whether one edit command is
// enabled now, from the docShell guard ControllersChild runs before each command, and returns a boolean only.
// Zero privileged reach, like the class above: no module import, only the actor globals.
export class PowerBrowserEditStateChild extends JSWindowActorChild {
  receiveMessage(message) {
    switch (message.name) {
      case "PowerBrowserEditState:Query":
        return !!this.docShell && this.docShell.isCommandEnabled(String(message.data && message.data.cmd)) === true;
      case "PowerBrowserEditState:Do": {
        // WINDOWS 43 (59-09): a page menu edit row on a text field runs on the right-clicked field (the ContextMenu
        // actor's target, held until chrome's Hiding, which follows this message). The overlay is hidden under the
        // menu and shown at the pick, and on that show Gecko's focus fix-up can clear the page's focused element
        // before this arrives, so a docShell command would find no editor. The field's own controllers do not
        // depend on focus. Anything else (contenteditable) keeps the docShell route, behind the same guard.
        const cmd = String(message.data && message.data.cmd);
        const controller = this.manager.getActor("ContextMenu").target?.controllers?.getControllerForCommand(cmd);
        if (controller) {
          if (controller.isCommandEnabled(cmd)) {
            controller.doCommand(cmd);
          }
        } else if (this.docShell && this.docShell.isCommandEnabled(cmd)) {
          this.docShell.doCommand(cmd);
        }
        return undefined;
      }
      case "PowerBrowserEditState:Target": {
        // WINDOWS 43 (59-09): the same field's own command state, for the page menu's edit rows; null when the
        // right-clicked target has no controllers, so chrome keeps its cached state.
        const controllers = this.manager.getActor("ContextMenu").target?.controllers;
        if (!controllers) {
          return null;
        }
        const states = {};
        for (const cmd of (message.data && message.data.cmds) || []) {
          const controller = controllers.getControllerForCommand(String(cmd));
          states[cmd] = !!controller && controller.isCommandEnabled(String(cmd)) === true;
        }
        return states;
      }
    }
    return undefined;
  }
}

// Phase 66 plan 03 (BRW-03, P66-13): the content half of the PowerBrowserAgent pair, the actor rows of Orca's agent
// methods. Like the edit-state child it has no events and no matches pin: Gecko creates it only when chrome's
// agentRunInChild asks the top document of an agent overlay for it, after chrome's wall has passed, so page script
// cannot message it and a user's tab never gets one. Chrome sends only methods of its frozen AGENT_METHODS list with
// params its validators passed. One arm per actor method, keyed by the Orca method name; every answer is
// { where: "done", result } or { where: "failed", code } with an Orca BrowserErrorCode. Element targets are CSS
// selectors here; lane p66-04 adds @eN refs to the same resolver. No module import.
class AgentRowError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

// The element a selector names, or the Orca code for why there is none.
function agentElement(actor, selector) {
  let element;
  try {
    element = actor.document.querySelector(selector);
  } catch {
    throw new AgentRowError("browser_error");
  }
  if (!element) {
    throw new AgentRowError("browser_ref_not_found");
  }
  return element;
}

// An element whose value or state a row writes must be enabled.
function agentEnabled(actor, selector) {
  const element = agentElement(actor, selector);
  if (element.disabled === true) {
    throw new AgentRowError("browser_element_not_interactable");
  }
  return element;
}

// The element's centre in CSS pixels of the viewport, scrolled into view first; the hit at that point must be the
// element or inside it, else the element is covered or has no box.
function agentCentre(actor, element) {
  element.scrollIntoView({ block: "center", inline: "center" });
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    throw new AgentRowError("browser_element_not_interactable");
  }
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  const hit = actor.document.elementFromPoint(x, y);
  if (!hit || (hit !== element && !element.contains(hit))) {
    throw new AgentRowError("browser_element_not_interactable");
  }
  return { x, y };
}

const AGENT_BUTTONS = { left: 0, middle: 1, right: 2 };

// Trusted pointer input in the page's own window (G2, measured by p66-probe-child.sys.mjs). x, y: CSS px of the viewport.
function agentMouse(actor, type, x, y, button = 0, clickCount = 1) {
  const win = actor.contentWindow;
  win.synthesizeMouseEvent(type, x, y, { button, clickCount, inputSource: win.MouseEvent.MOZ_SOURCE_MOUSE }, { isDOMEventSynthesized: true });
  actor.pointer = { x, y };
}

function agentPointer(actor) {
  return actor.pointer || { x: actor.contentWindow.innerWidth / 2, y: actor.contentWindow.innerHeight / 2 };
}

function agentClick(actor, x, y, button, clicks) {
  agentMouse(actor, "mousemove", x, y);
  for (let count = 1; count <= clicks; count++) {
    agentMouse(actor, "mousedown", x, y, button, count);
    agentMouse(actor, "mouseup", x, y, button, count);
  }
}

function agentWheel(actor, x, y, dx, dy) {
  const win = actor.contentWindow;
  win.windowUtils.sendWheelEvent(x, y, dx, dy, 0, win.WheelEvent.DOM_DELTA_PIXEL, 0, 0, 0, 0);
}

// Keys through nsITextInputProcessor (A2): trusted keydown, keypress, input and keyup in the page, as measured (G2).
function agentTextInput(actor) {
  const tip = Cc["@mozilla.org/text-input-processor;1"].createInstance(Ci.nsITextInputProcessor);
  if (!tip.beginInputTransactionForTests(actor.contentWindow)) {
    throw new AgentRowError("browser_element_not_interactable");
  }
  return tip;
}

const AGENT_MODIFIERS = { Control: "ControlLeft", Ctrl: "ControlLeft", Shift: "ShiftLeft", Alt: "AltLeft", Meta: "MetaLeft", Cmd: "MetaLeft", Command: "MetaLeft" };

function agentKeyEvent(actor, key) {
  const name = key === "Space" ? " " : key;
  let code = name;
  if (/^[a-z]$/i.test(name)) {
    code = `Key${name.toUpperCase()}`;
  } else if (/^[0-9]$/.test(name)) {
    code = `Digit${name}`;
  } else if (name === " ") {
    code = "Space";
  } else if (name.length === 1) {
    code = "";
  }
  return new actor.contentWindow.KeyboardEvent("", { key: name, code });
}

// "Control+a", "Enter", "Shift+Tab": modifiers held down around the last key.
function agentPress(actor, tip, combo) {
  const parts = combo.length > 1 && combo.endsWith("+") ? [...combo.slice(0, -2).split("+").filter(Boolean), "+"] : combo.split("+");
  const key = parts.pop();
  const held = parts.map(name => {
    if (!AGENT_MODIFIERS[name]) {
      throw new AgentRowError("browser_error");
    }
    const event = new actor.contentWindow.KeyboardEvent("", { key: name === "Ctrl" ? "Control" : name === "Cmd" || name === "Command" ? "Meta" : name, code: AGENT_MODIFIERS[name] });
    tip.keydown(event);
    return event;
  });
  const event = agentKeyEvent(actor, key);
  tip.keydown(event);
  tip.keyup(event);
  for (const modifier of held.reverse()) {
    tip.keyup(modifier);
  }
}

function agentFire(actor, element, ...types) {
  for (const type of types) {
    element.dispatchEvent(new actor.contentWindow.Event(type, { bubbles: true }));
  }
}

const agentSleep = (actor, ms) => new Promise(resolve => actor.contentWindow.setTimeout(resolve, ms));

// Polls until `test` holds; browser_timeout at the deadline, browser_owner_unavailable after PowerBrowserAgent:Abort.
// A parked page has an inactive docshell, so its timers may be throttled (assumption A-2).
async function agentPoll(actor, test, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (actor.aborted) {
      throw new AgentRowError("browser_owner_unavailable");
    }
    if (test()) {
      return;
    }
    if (Date.now() >= deadline) {
      throw new AgentRowError("browser_timeout");
    }
    await agentSleep(actor, 100);
  }
}

// Page-world evaluation (P66-13): a function built by the page's own Function constructor through wrappedJSObject,
// so the expression runs with the page's principal and nothing of the child's scope. Its answer is a page object
// polled for completion, so a promise the expression returns is awaited without handing the page a chrome function.
const AGENT_EVAL_BODY = "const h = { done: false }; const finish = (ok, v) => { h.ok = ok; h.v = v; h.done = true; }; " +
  "try { Promise.resolve(eval(expression)).then(v => finish(true, v === undefined ? '' : typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v)), e => finish(false, String(e && e.message || e))); } " +
  "catch (e) { finish(false, String(e && e.message || e)); } return h;";

async function agentPageEval(actor, expression, timeoutMs = 30000) {
  let holder;
  try {
    const page = actor.contentWindow.wrappedJSObject;
    holder = new page.Function("expression", AGENT_EVAL_BODY)(expression);
  } catch {
    // the page's CSP refused the Function constructor
    throw new AgentRowError("browser_eval_error");
  }
  await agentPoll(actor, () => holder.done === true, timeoutMs);
  if (holder.ok !== true) {
    throw new AgentRowError("browser_eval_error");
  }
  return String(holder.v);
}

function agentGlob(pattern) {
  if (!pattern.includes("*")) {
    return value => value.includes(pattern);
  }
  const re = new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*\*/g, "\u0000").replace(/\*/g, "[^/]*").replace(/\u0000/g, ".*")}$`);
  return value => re.test(value);
}

function agentVisible(element) {
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

const AGENT_EXEC_GET = {
  text: element => element.innerText,
  html: element => element.innerHTML,
  value: element => element.value ?? "",
  count: null,
};

const AGENT_EXEC_IS = {
  visible: element => agentVisible(element),
  hidden: element => !agentVisible(element),
  enabled: element => element.disabled !== true,
  disabled: element => element.disabled === true,
  checked: element => element.checked === true,
};

const agentUnquote = text => text.replace(/^(['"])(.*)\1$/, "$2");

// exec (P66-17): the read, get and is verbs only; every other verb is browser_command_unavailable.
function agentExec(actor, command) {
  const [verb, what, ...rest] = command.trim().split(/\s+/);
  const selector = agentUnquote(rest.join(" "));
  switch (verb) {
    case "read": {
      const target = what ? agentElement(actor, agentUnquote([what, ...rest].join(" "))) : actor.document.body;
      return { text: target ? target.innerText : "" };
    }
    case "get": {
      if (what === "title") {
        return { title: actor.document.title };
      }
      if (what === "url") {
        return { url: actor.document.location.href };
      }
      if (what === "count") {
        return { count: actor.document.querySelectorAll(selector).length };
      }
      if (what === "attr") {
        const name = rest.pop();
        return { attr: agentElement(actor, agentUnquote(rest.join(" "))).getAttribute(name) };
      }
      if (!Object.hasOwn(AGENT_EXEC_GET, what)) {
        throw new AgentRowError("browser_command_unavailable");
      }
      return { [what]: AGENT_EXEC_GET[what](agentElement(actor, selector)) };
    }
    case "is": {
      if (!Object.hasOwn(AGENT_EXEC_IS, what)) {
        throw new AgentRowError("browser_command_unavailable");
      }
      return { [what]: AGENT_EXEC_IS[what](agentElement(actor, selector)) };
    }
    default:
      throw new AgentRowError("browser_command_unavailable");
  }
}

// One arm per actor method (25), keyed by the Orca method name; each takes (actor, params) and returns the result.
const AGENT_RUN = {
  "browser.click": (actor, params) => {
    const { x, y } = agentCentre(actor, agentElement(actor, params.element));
    agentClick(actor, x, y, 0, 1);
    return { clicked: params.element };
  },
  "browser.dblclick": (actor, params) => {
    const { x, y } = agentCentre(actor, agentElement(actor, params.element));
    agentClick(actor, x, y, 0, 2);
    return { clicked: params.element };
  },
  "browser.hover": (actor, params) => {
    const { x, y } = agentCentre(actor, agentElement(actor, params.element));
    agentMouse(actor, "mousemove", x, y);
    return { hovered: params.element };
  },
  "browser.drag": (actor, params) => {
    const from = agentCentre(actor, agentElement(actor, params.from));
    const to = agentCentre(actor, agentElement(actor, params.to));
    agentMouse(actor, "mousemove", from.x, from.y);
    agentMouse(actor, "mousedown", from.x, from.y);
    for (let step = 1; step <= 5; step++) {
      agentMouse(actor, "mousemove", from.x + ((to.x - from.x) * step) / 5, from.y + ((to.y - from.y) * step) / 5);
    }
    agentMouse(actor, "mouseup", to.x, to.y);
    return { dragged: { from: params.from, to: params.to } };
  },
  "browser.mouseMove": (actor, params) => {
    agentMouse(actor, "mousemove", params.x, params.y);
    return { moved: { x: params.x, y: params.y } };
  },
  "browser.mouseDown": (actor, params) => {
    const { x, y } = agentPointer(actor);
    agentMouse(actor, "mousedown", x, y, AGENT_BUTTONS[params.button ?? "left"]);
    return { down: params.button ?? "left" };
  },
  "browser.mouseUp": (actor, params) => {
    const { x, y } = agentPointer(actor);
    agentMouse(actor, "mouseup", x, y, AGENT_BUTTONS[params.button ?? "left"]);
    return { up: params.button ?? "left" };
  },
  "browser.mouseClick": (actor, params) => {
    agentClick(actor, params.x, params.y, AGENT_BUTTONS[params.button ?? "left"], 1);
    return { clicked: { x: params.x, y: params.y } };
  },
  "browser.mouseWheel": (actor, params) => {
    const { x, y } = agentPointer(actor);
    agentWheel(actor, x, y, params.dx ?? 0, params.dy);
    return { wheeled: { dx: params.dx ?? 0, dy: params.dy } };
  },
  "browser.scroll": (actor, params) => {
    const amount = params.amount ?? 300;
    agentWheel(actor, actor.contentWindow.innerWidth / 2, actor.contentWindow.innerHeight / 2, 0, params.direction === "up" ? -amount : amount);
    return { scrolled: params.direction };
  },
  "browser.scrollIntoView": (actor, params) => {
    agentElement(actor, params.element).scrollIntoView({ block: "center", inline: "center" });
    return { scrolled: params.element };
  },
  "browser.keypress": (actor, params) => {
    agentPress(actor, agentTextInput(actor), params.key);
    return { pressed: params.key };
  },
  "browser.type": (actor, params) => {
    const tip = agentTextInput(actor);
    for (const ch of params.input) {
      const event = agentKeyEvent(actor, ch === "\n" ? "Enter" : ch);
      tip.keydown(event);
      tip.keyup(event);
    }
    return { typed: true };
  },
  "browser.keyboardInsertText": (actor, params) => {
    actor.contentWindow.windowUtils.sendContentCommandEvent("insertText", null, params.text);
    return { inserted: true };
  },
  "browser.eval": async (actor, params) => ({ result: await agentPageEval(actor, params.expression), origin: actor.document.location.href }),
  "browser.focus": (actor, params) => {
    agentElement(actor, params.element).focus();
    return { focused: params.element };
  },
  "browser.fill": (actor, params) => {
    const element = agentEnabled(actor, params.element);
    element.focus();
    if (element.isContentEditable && element.localName !== "input" && element.localName !== "textarea") {
      actor.contentWindow.getSelection().selectAllChildren(element);
      actor.contentWindow.windowUtils.sendContentCommandEvent("insertText", null, params.value);
    } else {
      element.value = params.value;
      agentFire(actor, element, "input", "change");
    }
    return { filled: params.element };
  },
  "browser.clear": (actor, params) => {
    const element = agentEnabled(actor, params.element);
    element.focus();
    element.value = "";
    agentFire(actor, element, "input", "change");
    return { cleared: params.element };
  },
  "browser.check": (actor, params) => {
    const element = agentEnabled(actor, params.element);
    const checked = params.checked !== false;
    if (element.checked !== checked) {
      element.checked = checked;
      agentFire(actor, element, "input", "change");
    }
    return { checked };
  },
  "browser.select": (actor, params) => {
    const element = agentEnabled(actor, params.element);
    if (element.localName !== "select") {
      throw new AgentRowError("browser_element_not_interactable");
    }
    const option = [...element.options].find(o => o.value === params.value || o.label === params.value || o.textContent.trim() === params.value);
    if (!option) {
      throw new AgentRowError("browser_error");
    }
    element.value = option.value;
    agentFire(actor, element, "input", "change");
    return { selected: option.value };
  },
  "browser.selectAll": (actor, params) => {
    const element = agentElement(actor, params.element);
    element.focus();
    if (typeof element.select === "function") {
      element.select();
    } else {
      actor.contentWindow.getSelection().selectAllChildren(element);
    }
    return { selected: params.element };
  },
  "browser.wait": async (actor, params) => {
    const timeout = params.timeout > 0 ? params.timeout : 30000;
    const doc = actor.document;
    const tests = [];
    if (params.selector) {
      const gone = params.state === "hidden" || params.state === "detached";
      tests.push(() => {
        const element = doc.querySelector(params.selector);
        return gone ? !element || !agentVisible(element) : !!element && (params.state !== "visible" || agentVisible(element));
      });
    }
    if (params.text) {
      tests.push(() => (doc.body?.innerText ?? "").includes(params.text));
    }
    if (params.url) {
      const matches = agentGlob(params.url);
      tests.push(() => matches(doc.location.href));
    }
    if (params.load) {
      tests.push(() => (params.load === "domcontentloaded" ? doc.readyState !== "loading" : doc.readyState === "complete"));
    }
    if (params.fn) {
      let last = false;
      tests.push(() => {
        agentPageEval(actor, `!!(${params.fn})`, 1000).then(v => (last = v === "true"), () => (last = false));
        return last;
      });
    }
    if (!tests.length) {
      await agentPoll(actor, () => false, timeout).catch(err => {
        if (err.code !== "browser_timeout") {
          throw err;
        }
      });
      return { waited: true };
    }
    await agentPoll(actor, () => tests.every(test => test()), timeout);
    return { waited: true };
  },
  "browser.console": (actor, params) => {
    const rows = actor.consoleRows || [];
    const n = params.limit > 0 ? Math.floor(params.limit) : 100;
    return { entries: rows.slice(-n).map(row => ({ ...row })), truncated: rows.length > n };
  },
  "browser.exec": (actor, params) => agentExec(actor, params.command),
  // Lane p66-04 replaces this arm with the snapshot builder (P66-16); until then the agent gets a defined error.
  "browser.snapshot": () => {
    throw new AgentRowError("browser_command_unavailable");
  },
};

const AGENT_CONSOLE_MAX = 1000;

export class PowerBrowserAgentChild extends JSWindowActorChild {
  // Console capture (G8) from the moment chrome first asks this document: the page's console API calls and its
  // uncaught errors (assumption A-4), this window only.
  actorCreated() {
    this.consoleRows = [];
    const keep = row => {
      this.consoleRows.push(row);
      this.consoleRows.splice(0, Math.max(0, this.consoleRows.length - AGENT_CONSOLE_MAX));
    };
    try {
      const win = this.contentWindow;
      const innerID = win.windowGlobalChild.innerWindowId;
      this.consoleStorage = Cc["@mozilla.org/consoleAPI-storage;1"].getService(Ci.nsIConsoleAPIStorage);
      const principal = Cc["@mozilla.org/systemprincipal;1"].createInstance(Ci.nsIPrincipal);
      this.consoleListener = message => {
        const m = message.wrappedJSObject || message;
        if (m.innerID === innerID) {
          keep({ level: String(m.level), text: (m.arguments || []).map(a => String(a)).join(" "), timestamp: Date.now() });
        }
      };
      this.consoleStorage.addLogEventListener(this.consoleListener, principal);
      win.addEventListener("error", event => keep({ level: "error", text: String(event.message), timestamp: Date.now() }));
    } catch {
      this.consoleListener = null;
    }
  }

  didDestroy() {
    if (this.consoleListener) {
      this.consoleStorage.removeLogEventListener(this.consoleListener);
      this.consoleListener = null;
    }
  }

  receiveMessage(message) {
    if (message.name === "PowerBrowserAgent:Abort") {
      this.aborted = true;
      return undefined;
    }
    if (message.name === "PowerBrowserAgent:Size") {
      const root = this.document.documentElement;
      return { width: root ? root.scrollWidth : 0, height: root ? root.scrollHeight : 0 };
    }
    if (message.name !== "PowerBrowserAgent:Run") {
      return undefined;
    }
    const { method, params } = message.data || {};
    const arm = Object.hasOwn(AGENT_RUN, method) ? AGENT_RUN[method] : null;
    if (!arm) {
      return { where: "failed", code: "browser_command_unavailable" };
    }
    this.aborted = false;
    const failed = err => ({ where: "failed", code: err instanceof AgentRowError ? err.code : "browser_error" });
    try {
      return Promise.resolve(arm(this, params || {})).then(result => ({ where: "done", result }), failed);
    } catch (err) {
      return failed(err);
    }
  }
}
