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
    }
    return undefined;
  }
}
