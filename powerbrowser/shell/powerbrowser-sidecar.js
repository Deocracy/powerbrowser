#filter substitution

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Default prefs for the Theia sidecar supervisor (plan 04-04's
// TheiaService.sys.mjs) and the chrome bootstrap's dump() sentinel
// channel. Preprocessed (JS_PREFERENCE_PP_FILES, #filter substitution
// above) so the POWERBROWSER_DEV_TREE define substitutes to the repo root at
// build time. These defaults serve dev runs out of objdir/dist/bin.
// A packaged install (powerbrowser/packaging/package-linux.sh) carries its
// own theia/ and node/ beside the binary; TheiaService prefers those
// staged copies unless a user value is set (NG-063).

// Empty string: resolve `node` on PATH at spawn time.
pref("powerbrowser.sidecar.nodePath", "");

pref("powerbrowser.sidecar.backendMain", "@POWERBROWSER_DEV_TREE@/theia/applications/browser/lib/backend/main.js");

pref("powerbrowser.sidecar.healthIntervalStartupMs", 250);
pref("powerbrowser.sidecar.healthIntervalSteadyMs", 5000);
pref("powerbrowser.sidecar.startupTimeoutMs", 90000);
pref("powerbrowser.sidecar.healthTimeoutMs", 4000);
pref("powerbrowser.sidecar.killGraceMs", 3000);
pref("powerbrowser.sidecar.logBufferLines", 500);

// SHELL-03 (plan 05-02) give-up budget: a recoverable respawn failure keeps
// retrying with the existing backoff (500ms doubling to a 5000ms cap) until
// EITHER of these trips, whichever comes first -- an unrecoverable failure
// (missing backend entry file, unresolvable Node, a spawn() throw, or the
// pinned port held by another process) skips both and gives up immediately.
// Prefs, not literals, so a verification run can force a fast give-up via a
// launch profile's user.js.
pref("powerbrowser.sidecar.giveUpAttempts", 6);
pref("powerbrowser.sidecar.giveUpWallclockMs", 45000);
// Deliberately slow -- three times the steady-state health interval. Exists
// to notice a backend that healed on its own, not to be a second health
// loop.
pref("powerbrowser.sidecar.recoveryProbeIntervalMs", 15000);

// powerbrowser.js's POWERBROWSER_SHELL_READY/POWERBROWSER_SHELL_SWAP sentinels are
// written with the chrome global dump() -- needs this pref on to reach
// stdout.
pref("browser.dom.window.dump.enabled", true);

// UF-31.1-02 (plan 38-06): patch 060 hides the cookies listed here from every
// extension's browser.cookies calls and onChanged events. The entry is the
// Theia token cookie TheiaService sets (name@host); the Theia frame's own
// requests are hidden from extension network observers by the frame's
// attribute in powerbrowser.xhtml. scripts/verify-ext-network-wall.mjs derives
// this value from TheiaService and PowerBrowserAPI.
pref("extensions.cookies.hidden", "POWERBROWSER_TOKEN@127.0.0.1");
// UF-31.1-02 (plan 38-06): the origins whose browserless loads (Theia's service
// and shared workers) patch 060 hides from extension network observers. Empty
// here because the sidecar's port is chosen at its first spawn (--port 0);
// PowerBrowserAPI.setGroupSenderPort writes the live value on the default
// branch: the sidecar origin and its per-webview subdomains on localhost (38-07).
pref("extensions.webRequest.hiddenOrigins", "");
