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
// selectors or @eN refs of this page's snapshots, through one resolver (agentFind). No module import.
class AgentRowError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

// The one element resolver of every element-targeted row (P66-16): "@eN" or "eN" names a ref of this page's
// snapshots, anything else is a CSS selector. null when a selector matches nothing; an unknown ref is
// browser_ref_not_found, a ref whose node left this document browser_stale_ref (null for a wait, where gone answers).
function agentFind(actor, target, staleIsGone = false) {
  const ref = /^@?(e\d+)$/.exec(target);
  if (ref) {
    const entry = agentSnapState(actor).refs.get(ref[1]);
    if (!entry) {
      throw new AgentRowError("browser_ref_not_found");
    }
    const node = entry.node.deref();
    if (node && actor.document.contains(node)) {
      return node;
    }
    if (staleIsGone) {
      return null;
    }
    throw new AgentRowError("browser_stale_ref");
  }
  try {
    return actor.document.querySelector(target);
  } catch {
    throw new AgentRowError("browser_error");
  }
}

// The element a target names, or the Orca code for why there is none.
function agentElement(actor, selector) {
  const element = agentFind(actor, selector);
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
// element or inside it, else the element is covered or has no box. behavior "instant" (59-WR-02): the default "auto"
// honours a page's CSS scroll-behavior: smooth, which scrolls asynchronously and leaves the rect read below pre-scroll.
function agentCentre(actor, element) {
  element.scrollIntoView({ block: "center", inline: "center", behavior: "instant" });
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

// D-38 (66-10): the clipboard bindings of Gecko's shortcut tables (dom/events/ShortcutKeyDefinitions.cpp, every entry
// for Windows, macOS or Linux whose command copies, cuts or pastes), as modifiers+key; accel is Control or Meta. Agent
// keys carry no native event, so GTK's own bindings never run for them. orca-browser-tab-scope derives the same set.
const AGENT_CLIPBOARD_KEYS = Object.freeze([
  "accel+c", "accel+x", "accel+v", "accel+shift+v", "accel+alt+shift+v", "control+Insert", "shift+Insert", "shift+Delete", "control+Delete",
]);
const AGENT_MODIFIER_WORDS = { Control: "control", Ctrl: "control", Shift: "shift", Alt: "alt", Meta: "meta", Cmd: "meta", Command: "meta" };

// True when a binding's modifiers are all held (accel by Control or Meta) and its key is the pressed one.
function agentClipboardKey(held, key) {
  const words = new Set(held.map(name => AGENT_MODIFIER_WORDS[name]));
  return AGENT_CLIPBOARD_KEYS.some(binding => {
    const parts = binding.split("+");
    const bound = parts.pop();
    return (bound.length === 1 ? bound === key.toLowerCase() : bound === key) &&
      parts.every(word => (word === "accel" ? words.has("control") || words.has("meta") : words.has(word)));
  });
}

// "Control+a", "Enter", "Shift+Tab": modifiers held down around the last key.
function agentPress(actor, tip, combo) {
  const parts = combo.length > 1 && combo.endsWith("+") ? [...combo.slice(0, -2).split("+").filter(Boolean), "+"] : combo.split("+");
  const key = parts.pop();
  // D-38: no clipboard key reaches the page, and none is half-sent.
  if (agentClipboardKey(parts, key)) {
    throw new AgentRowError("browser_command_unavailable");
  }
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
    agentElement(actor, params.element).scrollIntoView({ block: "center", inline: "center", behavior: "instant" });
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
    // 66-CR-04 (lane G1b): at most 10 minutes, the host's and chrome's cap (AGENT_WAIT_MAX_MS).
    const timeout = Math.min(params.timeout > 0 ? params.timeout : 30000, 600000);
    const doc = actor.document;
    const tests = [];
    if (params.selector) {
      const gone = params.state === "hidden" || params.state === "detached";
      tests.push(() => {
        const element = agentFind(actor, params.selector, true);
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
  // P66-16, A5: agent-browser 0.39.4's snapshot, built from this page's DOM (agentSnapshot, after the classes).
  "browser.snapshot": (actor, params) => agentSnapshot(actor, params),
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

// D-38 (66-10): the content half of the PowerBrowserAgentPage pair, an agent overlay's clipboard wall. Gecko creates it
// in every document of an agent overlay, frames included (the agent message manager group only), so a user's tab never
// gets one. Gecko has no per-browsing-context clipboard switch, so the wall is here. At DOMWindowCreated, before any
// script of that window runs, each Clipboard.prototype method answers a rejected promise: the page's own
// Promise.reject bound (in the page realm) to a page NotAllowedError, so no chrome function reaches the page. A trusted
// copy, cut or paste is cancelled at the chrome event handler, ahead of every page listener, so Gecko writes nothing
// and pastes nothing (nsCopySupport.cpp FireClipboardEvent: no default action, an empty clipboardData): that covers
// execCommand copy, cut and paste, key and menu commands, middle-click paste and a page's clipboardData. No import.
// The clipboard listeners go on this overlay's own chrome event handler, never in the pair's registered events: Gecko
// adds registered events to every content window root whatever the group (JSActorService::RegisterChromeEventTarget),
// and a cut or copy listener in a field's event chain enables Cut and Copy on every collapsed caret in every tab
// (EditorBase::CheckForClipboardCommandListener).
const AGENT_CLIPBOARD_METHODS = Object.freeze(["read", "readText", "write", "writeText"]);
const AGENT_CLIPBOARD_EVENTS = Object.freeze(["copy", "cut", "paste"]);

// One module function, so a second document of the same overlay adds no second listener.
function agentClipboardCancel(event) {
  event.preventDefault();
  event.stopImmediatePropagation();
}

export class PowerBrowserAgentPageChild extends JSWindowActorChild {
  handleEvent(event) {
    // `===`, not `!==`: verify-group-channel derives the group request name from the file's only `event.type !==` guard.
    if (event.type === "DOMWindowCreated") {
      for (const type of AGENT_CLIPBOARD_EVENTS) {
        this.docShell.chromeEventHandler.addEventListener(type, agentClipboardCancel, true);
      }
      this.refuseClipboardApi();
    }
  }

  refuseClipboardApi() {
    const page = this.contentWindow.wrappedJSObject;
    const proto = page.Clipboard?.prototype;
    if (!proto) {
      return; // not a secure context: the page has no async Clipboard API
    }
    const refuse = page.Promise.reject.bind(page.Promise, new page.DOMException("Clipboard access is not available in this tab.", "NotAllowedError"));
    for (const name of AGENT_CLIPBOARD_METHODS) {
      Object.defineProperty(proto, name, { value: refuse, writable: false, configurable: false });
    }
  }
}

// Phase 66 plan 04 (BRW-03, P66-16, 66-RESEARCH A5/G9): browser.snapshot in agent-browser 0.39.4's format, computed
// from the DOM through Xrays (no accessibility service, no XPCOM). Lines are `- <role> "<name>" [<attrs>, ref=eN]`,
// optionally `: <value>` and ` clickable [<hints>]`; refs is { eN: { role, name } }; --delta answers full, unchanged
// or delta with revision and baseRevision, as the pinned binary does (scripts/fixtures/orca-snapshot/ hold its
// replies). Chromium-internal roles agent-browser prints (LabelText, MenuListPopup, ListMarker, rowgroup for tbody)
// have no DOM rule here; orca-browser-snapshot-live compares ref'd nodes, attribute tokens and delta kinds, not bytes.

// agent-browser's ref'd roles: interactive roles always, content roles when they have a name, plus clickables.
const SNAP_INTERACTIVE = new Set([
  "button", "link", "textbox", "checkbox", "radio", "combobox", "listbox", "menuitem", "menuitemcheckbox",
  "menuitemradio", "option", "searchbox", "slider", "spinbutton", "switch", "tab", "treeitem",
]);
const SNAP_CONTENT = new Set(["heading", "cell", "gridcell", "columnheader", "rowheader", "listitem", "article", "region", "main", "navigation"]);
const SNAP_FROM_CONTENT = new Set([
  "button", "link", "heading", "cell", "gridcell", "columnheader", "rowheader", "option", "tab", "checkbox", "radio",
  "switch", "menuitem", "menuitemcheckbox", "menuitemradio", "treeitem", "tooltip", "DisclosureTriangle",
]);
const SNAP_ARIA_ROLES = new Set([
  ...SNAP_INTERACTIVE, ...SNAP_CONTENT, "alert", "alertdialog", "application", "banner", "blockquote", "complementary",
  "contentinfo", "definition", "dialog", "document", "feed", "figure", "form", "grid", "group", "img", "list", "log",
  "marquee", "math", "menu", "menubar", "meter", "note", "paragraph", "progressbar", "radiogroup", "row", "rowgroup",
  "scrollbar", "search", "separator", "status", "table", "tablist", "tabpanel", "term", "timer", "toolbar", "tooltip",
  "tree", "treegrid", "generic",
]);
const SNAP_SKIP = new Set(["script", "style", "template", "noscript", "head", "link", "meta", "title", "iframe", "frame", "object", "embed"]);
const SNAP_INPUT_ROLES = {
  button: "button", submit: "button", reset: "button", image: "button", file: "button", checkbox: "checkbox",
  radio: "radio", range: "slider", number: "spinbutton", search: "searchbox",
};
const SNAP_LANDMARK_SCOPE = "article, aside, main, nav, section";
// Orca's BROWSER_CLIENT_AUTOMATION_RESULT_MAX_BYTES (browser-client-automation-protocol.ts).
const SNAP_MAX_BYTES = 768 * 1024;

const snapClean = text => String(text ?? "").replace(/\s+/g, " ").trim();

// The per-page ref table and delta baselines. The actor is per document already; the innerWindowId check makes the
// page identity explicit, so a new document starts with an empty table and no baseline (T-66-17).
function agentSnapState(actor) {
  const page = actor.contentWindow.windowGlobalChild.innerWindowId;
  if (!actor.snap || actor.snap.page !== page) {
    actor.snap = { page, next: 0, refs: new Map(), last: new Set(), revision: 0, baseline: null };
  }
  return actor.snap;
}

function snapRole(el) {
  const aria = (el.getAttribute("role") || "").trim().split(/\s+/)[0];
  if (aria === "none" || aria === "presentation") {
    return null;
  }
  if (SNAP_ARIA_ROLES.has(aria)) {
    return aria;
  }
  const tag = el.localName;
  if (/^h[1-6]$/.test(tag)) {
    return "heading";
  }
  switch (tag) {
    case "a":
    case "area":
      return el.hasAttribute("href") ? "link" : null;
    case "input": {
      const type = (el.getAttribute("type") || "text").toLowerCase();
      if (type === "hidden") {
        return null;
      }
      return SNAP_INPUT_ROLES[type] || (el.hasAttribute("list") ? "combobox" : "textbox");
    }
    case "textarea":
      return "textbox";
    case "select":
      return el.multiple || el.size > 1 ? "listbox" : "combobox";
    case "button":
      return "button";
    case "option":
      return "option";
    case "optgroup":
    case "fieldset":
    case "details":
      return "group";
    case "summary":
      return el.parentElement?.localName === "details" ? "DisclosureTriangle" : null;
    case "header":
      return el.parentElement?.closest(SNAP_LANDMARK_SCOPE) ? null : "banner";
    case "footer":
      return el.parentElement?.closest(SNAP_LANDMARK_SCOPE) ? null : "contentinfo";
    case "section":
      return el.hasAttribute("aria-label") || el.hasAttribute("aria-labelledby") ? "region" : null;
    case "img":
      return el.getAttribute("alt") === "" ? null : "img";
    case "th":
      return el.getAttribute("scope") === "row" ? "rowheader" : "columnheader";
    case "td":
      return el.closest("table")?.getAttribute("role") === "grid" ? "gridcell" : "cell";
    default:
      return {
        article: "article", aside: "complementary", dialog: "dialog", figure: "figure", form: "form", hr: "separator",
        li: "listitem", ul: "list", ol: "list", menu: "list", main: "main", nav: "navigation", output: "status",
        p: "paragraph", progress: "progressbar", meter: "meter", table: "table", thead: "rowgroup", tfoot: "rowgroup",
        tr: "row", blockquote: "blockquote",
      }[tag] || null;
  }
}

// Visible text of a subtree, for names from content; `skip` is a control whose own text a label must not repeat.
function snapText(node, skip = null) {
  if (node.nodeType === node.TEXT_NODE) {
    return node.data;
  }
  if (node.nodeType !== node.ELEMENT_NODE || node === skip || SNAP_SKIP.has(node.localName)) {
    return "";
  }
  // An option of a closed select has no box, so the visibility test does not apply inside a select.
  const boxless = !node.checkVisibility() && !node.closest("select") && node.ownerDocument.defaultView?.getComputedStyle(node)?.display !== "contents";
  if (node.getAttribute("aria-hidden") === "true" || boxless) {
    return "";
  }
  const label = snapClean(node.getAttribute("aria-label"));
  if (label) {
    return ` ${label} `;
  }
  if (node.localName === "img") {
    return node.getAttribute("alt") || "";
  }
  if (node.localName === "input" && ["button", "submit", "reset"].includes(node.type)) {
    return node.value;
  }
  let text = "";
  for (const child of node.childNodes) {
    text += snapText(child, skip);
  }
  return text;
}

function snapName(el, role) {
  const doc = el.ownerDocument;
  const labelledBy = (el.getAttribute("aria-labelledby") || "").split(/\s+/).filter(Boolean);
  if (labelledBy.length) {
    const name = snapClean(labelledBy.map(id => (doc.getElementById(id) ? snapText(doc.getElementById(id)) : "")).join(" "));
    if (name) {
      return name;
    }
  }
  const label = snapClean(el.getAttribute("aria-label"));
  if (label) {
    return label;
  }
  const tag = el.localName;
  if (tag === "input" && ["button", "submit", "reset"].includes(el.type)) {
    return snapClean(el.value || { submit: "Submit", reset: "Reset" }[el.type] || "");
  }
  if (tag === "input" && el.type === "image") {
    return snapClean(el.getAttribute("alt") || el.value || "Submit");
  }
  if (el.labels?.length) {
    const name = snapClean([...el.labels].map(l => snapText(l, el)).join(" "));
    if (name) {
      return name;
    }
  }
  const caption = { fieldset: "legend", figure: "figcaption", table: "caption" }[tag];
  if (caption) {
    const part = [...el.children].find(c => c.localName === caption);
    if (part) {
      return snapClean(snapText(part));
    }
  }
  if (tag === "img" || tag === "area") {
    const alt = snapClean(el.getAttribute("alt"));
    if (alt) {
      return alt;
    }
  }
  if (SNAP_FROM_CONTENT.has(role)) {
    const text = snapClean(snapText(el));
    if (text) {
      return text;
    }
  }
  return snapClean(el.getAttribute("title") || ((role === "textbox" || role === "searchbox") && el.getAttribute("placeholder")) || "");
}

// The attribute tokens agent-browser prints before the ref, in its order.
function snapAttrs(el, role) {
  const attrs = [];
  const level = role === "heading" ? Number(el.getAttribute("aria-level")) || Number(/^h([1-6])$/.exec(el.localName)?.[1]) || 2
    : role === "listitem" ? snapListDepth(el)
      : role === "treeitem" ? Number(el.getAttribute("aria-level")) || 0
        : 0;
  if (level) {
    attrs.push(`level=${level}`);
  }
  if (["checkbox", "radio", "switch", "menuitemcheckbox", "menuitemradio"].includes(role)) {
    const native = el.localName === "input" && (el.type === "checkbox" || el.type === "radio");
    const aria = el.getAttribute("aria-checked");
    attrs.push(`checked=${native ? (el.indeterminate ? "mixed" : String(el.checked)) : aria === "true" || aria === "mixed" ? aria : "false"}`);
  }
  const expanded = el.getAttribute("aria-expanded");
  if (role === "DisclosureTriangle") {
    attrs.push(`expanded=${el.parentElement.open === true}`);
  } else if (expanded === "true" || expanded === "false") {
    attrs.push(`expanded=${expanded}`);
  } else if (role === "combobox" && el.localName === "select") {
    attrs.push("expanded=false");
  }
  if ((el.localName === "option" && el.selected) || el.getAttribute("aria-selected") === "true") {
    attrs.push("selected");
  }
  if (el.disabled === true || el.getAttribute("aria-disabled") === "true") {
    attrs.push("disabled");
  }
  return attrs;
}

function snapListDepth(el) {
  let depth = 0;
  for (let at = el.parentElement; at; at = at.parentElement) {
    if (["ul", "ol", "menu"].includes(at.localName) || at.getAttribute("role") === "list") {
      depth++;
    }
  }
  return depth || 1;
}

function snapValue(el, role) {
  if (role === "combobox" && el.localName === "select") {
    return snapClean(el.selectedOptions?.[0]?.textContent);
  }
  if (["textbox", "searchbox", "spinbutton", "slider", "combobox"].includes(role) && typeof el.value === "string" && el.type !== "password") {
    return snapClean(el.value);
  }
  return "";
}

// cursor:pointer that is the element's own (not inherited from its parent), onclick, or a focusable tabindex.
function snapHints(el, style) {
  const hints = [];
  if (style?.cursor === "pointer" && el.ownerDocument.defaultView.getComputedStyle(el.parentElement || el)?.cursor !== "pointer") {
    hints.push("cursor:pointer");
  }
  if (el.hasAttribute("onclick")) {
    hints.push("onclick");
  }
  if (el.hasAttribute("tabindex") && el.tabIndex >= 0) {
    hints.push("tabindex");
  }
  return hints;
}

// The tree of emitted nodes under `root`; elements without a role are transparent (their children move up).
function snapTree(actor, root) {
  const state = agentSnapState(actor);
  const known = new Map();
  for (const [ref, entry] of state.refs) {
    const node = entry.node.deref();
    if (node) {
      known.set(node, ref);
    }
  }
  const nodes = [];
  const walk = (el, out, ctx) => {
    for (const child of el.childNodes) {
      if (child.nodeType === child.TEXT_NODE) {
        const text = snapClean(child.data);
        if (text && !ctx.quiet) {
          out.push({ role: "StaticText", name: text, attrs: [], children: [] });
        }
        continue;
      }
      if (child.nodeType !== child.ELEMENT_NODE || SNAP_SKIP.has(child.localName) || child.getAttribute("aria-hidden") === "true") {
        continue;
      }
      const style = actor.contentWindow.getComputedStyle(child);
      if (!ctx.inSelect && !child.checkVisibility() && style?.display !== "contents") {
        continue;
      }
      // visibility:hidden hides this element but not a child that sets visibility:visible again.
      const shown = ctx.inSelect || style?.display === "contents" || child.checkVisibility({ visibilityProperty: true });
      let role = shown ? snapRole(child) : null;
      const hints = shown && !SNAP_INTERACTIVE.has(role) ? snapHints(child, style) : [];
      if (!role && hints.length) {
        role = "generic";
      }
      const inner = { ...ctx, inSelect: ctx.inSelect || child.localName === "select", quiet: ctx.quiet || (child.localName === "label" && !!child.control) };
      if (!role) {
        walk(child, out, inner);
        continue;
      }
      const name = role === "generic" ? snapClean(child.getAttribute("aria-label")) : snapName(child, role);
      const item = { role, name, attrs: snapAttrs(child, role), value: snapValue(child, role), hints, children: [], element: child };
      if (SNAP_INTERACTIVE.has(role) || (SNAP_CONTENT.has(role) && name) || hints.length) {
        let ref = known.get(child);
        if (!ref) {
          ref = `e${++state.next}`;
          known.set(child, ref);
        }
        state.refs.set(ref, { node: new WeakRef(child), role, name });
        item.ref = ref;
        nodes.push(item);
      }
      out.push(item);
      walk(child, item.children, { ...inner, quiet: inner.quiet || (!!item.ref && SNAP_FROM_CONTENT.has(role)) });
    }
  };
  const top = [];
  if (root === actor.document.body || root === actor.document.documentElement) {
    walk(root, top, { quiet: false, inSelect: false });
  } else {
    walk({ childNodes: [root] }, top, { quiet: false, inSelect: false });
  }
  return { top, nodes };
}

// The lines and the refs they show, under the snapshot's options.
function snapRender(top, options) {
  const lines = [];
  const shown = new Set();
  const emit = (items, depth) => {
    for (const item of items) {
      if (options.interactive && !item.ref) {
        emit(item.children, depth);
        continue;
      }
      if (options.depth !== undefined && depth >= options.depth) {
        continue;
      }
      if (options.compact && !item.ref && !item.name && !item.value && item.role !== "StaticText" && !snapHasContent(item.children, options)) {
        continue;
      }
      const name = item.name || (options.interactive && item.element ? snapClean(snapText(item.element)) : "");
      const attrs = [...item.attrs];
      if (item.ref) {
        attrs.push(`ref=${item.ref}`);
        shown.add(item.ref);
      }
      if (options.urls && item.role === "link" && item.element?.href) {
        attrs.push(`url=${item.element.href}`);
      }
      lines.push(`${"  ".repeat(depth)}- ${item.role}${name ? ` ${JSON.stringify(name)}` : ""}${attrs.length ? ` [${attrs.join(", ")}]` : ""}` +
        `${item.value ? `: ${item.value}` : ""}${item.hints?.length ? ` clickable [${item.hints.join(", ")}]` : ""}`);
      emit(item.children, depth + 1);
    }
  };
  emit(top, 0);
  return { lines, shown };
}

function snapHasContent(items, options) {
  return items.some(item => item.ref || item.name || item.value || item.role === "StaticText" || snapHasContent(item.children, options));
}

// One contiguous splice from the baseline's lines to these, as agent-browser's treeChange.
function snapSplice(before, after) {
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) {
    start++;
  }
  let end = 0;
  while (end < before.length - start && end < after.length - start && before[before.length - 1 - end] === after[after.length - 1 - end]) {
    end++;
  }
  return { startLine: start, deleteCount: before.length - start - end, lines: after.slice(start, after.length - end) };
}

function snapRefChanges(before, after) {
  const changes = [];
  for (const ref of Object.keys(before)) {
    if (!Object.hasOwn(after, ref)) {
      changes.push({ op: "remove", ref: `@${ref}` });
    }
  }
  for (const [ref, node] of Object.entries(after)) {
    if (!Object.hasOwn(before, ref)) {
      changes.push({ op: "add", ref: `@${ref}`, node });
    } else {
      for (const field of ["role", "name"]) {
        if (before[ref][field] !== node[field]) {
          changes.push({ op: "replace", ref: `@${ref}`, field, value: node[field] });
        }
      }
    }
  }
  return changes;
}

function agentSnapshot(actor, params) {
  const options = {
    interactive: params.interactive === true,
    compact: params.compact === true,
    depth: Number.isInteger(params.depth) && params.depth > 0 ? params.depth : undefined,
    selector: typeof params.selector === "string" && params.selector ? params.selector : undefined,
    urls: params.urls === true,
  };
  const state = agentSnapState(actor);
  const doc = actor.document;
  const root = options.selector ? agentElement(actor, options.selector) : doc.body || doc.documentElement;
  if (!root) {
    return { origin: doc.location.href, refs: {}, removedRefs: [], snapshot: "" };
  }
  const { top, nodes } = snapTree(actor, root);
  const { lines, shown } = snapRender(top, options);
  const refs = {};
  for (const item of nodes) {
    if (shown.has(item.ref)) {
      refs[item.ref] = { role: item.role, name: item.name };
    }
  }
  const removedRefs = [...state.last].filter(ref => !Object.hasOwn(refs, ref));
  state.last = new Set(Object.keys(refs));
  const origin = doc.location.href;
  let result;
  if (params.delta === true || params.full === true) {
    // One baseline per page (Orca's snapshot help): a navigation, other flags or --full answer the whole tree and
    // replace it; otherwise unchanged, or a delta when the change is small.
    const key = JSON.stringify(options);
    const base = state.baseline;
    const revision = ++state.revision;
    state.baseline = { key, revision, lines, refs, origin };
    let snapshot = { kind: "full", refs, revision, tree: lines.join("\n") };
    if (base && params.full !== true && base.origin === origin && base.key === key) {
      const changes = snapRefChanges(base.refs, refs);
      const treeChange = snapSplice(base.lines, lines);
      if (!changes.length && !treeChange.deleteCount && !treeChange.lines.length) {
        snapshot = { kind: "unchanged", revision, baseRevision: base.revision };
      } else if ((treeChange.deleteCount + treeChange.lines.length) * 4 <= Math.max(lines.length, base.lines.length)) {
        // shortcut: a delta when it touches at most a quarter of the lines; agent-browser's own size rule is not
        // published, and the fixtures' scripted changes are small enough that both rules agree.
        snapshot = { kind: "delta", revision, baseRevision: base.revision, changes, treeChange };
      }
    }
    result = { origin, snapshot };
  } else {
    result = { origin, refs, removedRefs, snapshot: lines.join("\n") };
  }
  const bytes = new TextEncoder().encode(JSON.stringify(result)).length;
  if (bytes > SNAP_MAX_BYTES) {
    console.warn(`PowerBrowserAgent: snapshot of ${bytes} bytes is over the ${SNAP_MAX_BYTES}-byte result budget`);
    throw new AgentRowError("browser_error");
  }
  return result;
}

// Phase 67 (INJ-01, P67-23 as amended by A-9): the PowerBrowserOrcaLogo child. It loads in every loopback top
// document (matches cannot carry a port), asks the parent once on DOMContentLoaded, and does nothing more on a null
// answer, which is what every document but an orcad-origin one gets. With an answer it sets src and alt, and only those
// two attributes, on each element the version's selectors match, for the document's life: Orca's Landing is a lazy
// chunk and remounts after the last workspace closes. No import and no privileged global.
export class PowerBrowserOrcaLogoChild extends JSWindowActorChild {
  async handleEvent(event) {
    if (!event || this.observer) { // DOMContentLoaded is the only event this pair registers
      return;
    }
    let answer = null;
    try {
      answer = await this.sendQuery("PowerBrowserOrcaLogo:Query", {});
    } catch {
      return;
    }
    if (!answer || typeof answer.src !== "string" || typeof answer.alt !== "string" || !Array.isArray(answer.selectors)) {
      return;
    }
    const doc = this.document;
    const handled = new WeakSet();
    const apply = () => {
      for (const selector of answer.selectors) {
        for (const element of doc.querySelectorAll(selector)) {
          if (!handled.has(element)) {
            handled.add(element);
            element.setAttribute("src", answer.src);
            element.setAttribute("alt", answer.alt);
          }
        }
      }
    };
    this.observer = new this.contentWindow.MutationObserver(apply);
    this.observer.observe(doc, { childList: true, subtree: true });
    apply();
  }

  didDestroy() {
    this.observer?.disconnect();
    this.observer = null;
  }
}
