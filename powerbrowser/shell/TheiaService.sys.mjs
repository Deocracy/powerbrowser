/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * D-96: TheiaService is a *consumer* of the PowerBrowserAPI boundary, not a
 * second one -- it imports nothing else. Supervises the Theia backend
 * sidecar: mint token -> resolve sidecar location -> spawn -> watch stdout
 * for the ready sentinel -> health-gate -> set cookie -> swap (Task 1);
 * steady-state health loop with pinned-port restart and backoff (Task 2);
 * bounded quit and the D-106 ring buffer accessors (Task 3). Every field
 * below is per-launch, in-memory state only (D-107) -- nothing here writes
 * a file.
 */

const { PowerBrowserAPI } = ChromeUtils.importESModule("chrome://powerbrowser/content/PowerBrowserAPI.sys.mjs");

const HEALTH_PATH = "/powerbrowser/health";

/*
 * 01-UI-SPEC.md "Copywriting Contract": the ONLY strings that may ever reach
 * #powerbrowser-error-message. Every one names the product, states the problem
 * in plain language, and ends with a next step that is a real affordance on
 * screen (Retry or Details). No pref key, sentinel name, port, timeout or raw
 * exception text appears here -- those are diagnostic, not actionable, and
 * every one of them is carried instead as a labelled row in the diagnostics
 * layer (see `details` below and `getFailureDetails()`), so nothing is lost.
 *
 * Several distinct failure paths deliberately collapse onto the same sentence:
 * the distinction between "spawn() threw", "the stdin handshake failed" and
 * "the output stream died" is not a distinction a user can act on. The
 * diagnostics layer is what exists for it.
 *
 * This table is the check surface, not a convention: verify-shell-error-copy.mjs
 * derives these values FROM THIS FILE at check time, asserts each against an
 * internal-identifier pattern, and asserts that every `message:` site and every
 * `_showError(` first argument in this file resolves back to it -- declared and
 * referenced key sets compared as an equality, so an added leak, an ad-hoc
 * literal, a stale entry and a removed one all go red.
 */
const USER_MESSAGE = {
  interfaceFilesMissing: "PowerBrowser can't find its interface files. This build looks incomplete — reinstall, or open Details for the missing path.",
  nodeMissing: "PowerBrowser needs Node.js and couldn't find it. Install Node.js 24 or later and open PowerBrowser again, or open Details for where it looked.",
  couldNotStart: "PowerBrowser couldn't start its interface. Choose Retry, or open Details to see the error.",
  // 01-13: the one place a SECOND `couldNotStart` sentence is warranted, and the
  // one place 01-10 declined to mint a key. 01-10's reasoning was that a new key
  // would have to invent a distinction the user cannot act on -- still correct
  // for `reportUnexpectedFailure`'s own case, which is why that comment stays.
  // Here the distinction IS the action: 01-13 hides the Retry control for the
  // unrecoverable class, so one screen offers Retry and the other does not, and
  // the stated next step and the rendered controls are one fact. Reachable only
  // from `_spawnAndGate`'s two `recoverable: false` returns -- the spawn-throw
  // D-113 site and the D-112 pinned-port-conflict site.
  couldNotStartUnrecoverable: "PowerBrowser couldn't start its interface, and retrying won't change the result. Close PowerBrowser and open it again, or open Details to see the error.",
  didNotFinishStarting: "PowerBrowser's interface didn't finish starting. Choose Retry, or open Details if this keeps happening.",
};

/**
 * WR-03 (Phase 45): moves a pre-45 sidecar state file into the ProfD state
 * directory, once. `store` is `{ read, write, remove }` over PowerBrowserAPI's
 * never-throw read, the state writer and the remover. The repo check
 * (scripts/verify-sidecar-state-migration.mjs) runs this exact source against a
 * fake store. Order is the invariant: the copy is written before the old file
 * is removed, so a failed write leaves the old file in place as a reap target.
 * Returns true when a record moved.
 */
export async function migrateLegacyStateFile(store, legacyPath, newPath) {
  if (!legacyPath || legacyPath === newPath) {
    return false;
  }
  const record = await store.read(legacyPath);
  if (!record) {
    return false;
  }
  if (await store.read(newPath)) {
    // A record already sits at the new location; both records stay reap targets.
    return false;
  }
  await store.write(newPath, record);
  await store.remove(legacyPath);
  return true;
}

// Discretionary constants (plan 04-04 recorded_decisions) -- no pref exists
// for these (04-03's powerbrowser-sidecar.js ships only the health/timeout/
// grace/log-buffer prefs), so they stay literal here.
const RESTART_BACKOFF_INITIAL_MS = 500;
const RESTART_BACKOFF_CAP_MS = 5000;
const CONSECUTIVE_FAILURES_THRESHOLD = 2;

export const TheiaService = {
  // Per-launch state (D-104): minted/resolved once, reused across every
  // restart within this browser session.
  _token: null,
  _port: null,
  _pid: null,
  _proc: null,
  _browserElement: null,
  _nodePath: null,
  _backendMain: null,
  // NG-073 (wave E T6-R1): the app's plugins directory, derived in
  // _resolveSidecar from the resolved backend entry (<app>/plugins beside
  // <app>/lib) and passed to the sidecar in _spawnAndGate. Null until resolved.
  _pluginsDir: null,
  _configDir: null,
  _swapped: false,
  _shuttingDown: false,

  // D-121's second guard layer: set before any other work in start(), so a
  // re-entrant call during the first launch's own asynchronous work (not
  // just a second, separate call) is also caught. Mirrors _shuttingDown's
  // early-return shape in stop().
  _started: false,

  // NG-032/NG-033, final-review I1: the quit flush runs on the
  // quit-application-granted path (see start()), never on the request path,
  // so a restart request keeps its intent: nothing is cancelled and nothing
  // is re-issued. These fields are gone with the old cancel-and-reissue hold
  // (_quitRequestOff, _quitFlushStarted, _holdQuitForFlush).
  _quitObserverOff: null,

  // D-110: this project's first persistence -- a sidecar state file inside
  // _configDir, written on every successful spawn (first and respawn
  // alike) and removed on a clean stop. Derived once in start(), right
  // after _configDir is resolved.
  _stateFilePath: null,

  // Health-loop state (Task 2).
  _healthy: false,
  _restartCount: 0,

  // SQL-01 (12-CODE-REVIEW.md CR-04): the unregister function
  // PowerBrowserAPI.startTabStoreTriggers returns, retained so the sweep
  // observer and tab listeners detach on stop(). Null until start() wires
  // the writer below.
  _tabStoreTriggersOff: null,

  // UPD-18 (46-01, review CR-01): the stop function PowerBrowserAPI.startUpdateObserver
  // returns, retained so the four update observers detach on stop(). Null until
  // _swap() attaches them to the live browser element.
  _updateObserverOff: null,

  // SHELL-03 (05-02) give-up/error-state fields.
  // _errorShown guards _showError/_hideError the same way _swapped guards
  // _swap() -- repeated calls for the same state paint once and emit one
  // sentinel. _restartInFlight is the single in-flight guard shared by
  // _restart() (health-loop-triggered and first-launch-retry give-up),
  // retry() and _recoveryProbe() -- whichever gets there first runs the
  // only spawn attempt; every other caller no-ops rather than racing a
  // second one.
  _errorShown: false,
  _restartInFlight: false,
  _recoveryProbeActive: false,

  // 01-13: the classification of the error state CURRENTLY on screen -- true,
  // false, or null when there is no error state at all. Written and cleared at
  // exactly the two sites `_errorShown` is, by the same latch, so it has
  // `_errorShown`'s lifetime and can never describe a different failure than the
  // one painted. Read in exactly one place, `retry()`, which is the point: the
  // classification has to reach the SUPERVISOR's own retry entry point, not just
  // the control, or a caller that never touched the button bypasses it.
  _errorRecoverable: null,

  // 01-07: the diagnostic identifiers the user-facing message deliberately
  // does NOT carry -- an array of [label, value] pairs belonging to the
  // failure that put the shell into the current error state, or null when
  // there is no error state. Built by the failure path itself (only the
  // identifiers that path actually has, so an absent port never becomes an
  // empty-labelled row) and read by BOTH the diagnostics layer's field rows
  // and the POWERBROWSER_ERROR_DIAGNOSTICS sentinel through the single
  // getFailureDetails() accessor below -- the D-119/D-120 shape, so the
  // rendered surface and the machine-readable line can never disagree.
  _failureDetails: null,

  // D-106 ring buffer: bounded, in-memory, mirrored to the console as each
  // line arrives (see _pushLog / _pumpOutput below).
  _log: [],

  /**
   * Launch sequence for the first spawn of this browser session: resolve
   * the sidecar, spawn it on port 0, wait for the ready sentinel and a
   * passing health probe, set the token cookie, then swap the browser
   * element onto the backend's URL. Window show never waited on this --
   * powerbrowser.js already wrote POWERBROWSER_SHELL_READY before calling here.
   */
  async start(browserElement) {
    // D-121: the supervisor's own idempotency guard -- refuses to start
    // twice even if some other path ever opens a second shell window. Set
    // before any other work, mirroring stop()'s _shuttingDown guard, so a
    // re-entrant call racing this same launch's own in-flight start() is
    // also caught, not just a later, separate call.
    if (this._started) {
      this._pushLog("start() called again while already started -- refusing to start a second time.");
      return;
    }
    this._started = true;

    this._browserElement = browserElement;
    this._token = crypto.randomUUID();

    const resolved = await this._resolveSidecar();
    if (!resolved.ok) {
      // D-113: backendMain unset/missing and an unresolvable Node can only
      // ever happen here (this method's own one-shot resolution step, never
      // the restart path) -- unrecoverable by construction, straight to the
      // error state with no retry at all.
      this._showError(resolved.message, /* recoverable */ false, resolved.details);
      return;
    }

    this._configDir = this._resolveConfigDir();

    // CR-01 fix (05-REVIEW.md): the state file name itself carries a
    // profile-scoped suffix -- _configDir stays exactly as before (it also
    // backs THEIA_CONFIG_DIR below, unrelated to this fix and out of
    // scope to relocate) so two instances under different --profile paths
    // can never share a state file, while the SAME profile launched twice
    // (SIDE-04's own crash-leftover scenario) always resolves the same
    // path.
    //
    // 01-12: derived HERE, immediately after _configDir, which is what the
    // field's own comment already claimed. Both `_resolveConfigDir()` and
    // `_profileStateKey()` are pure resolutions over the environment and the
    // profile path -- neither needs a directory to exist -- which is what makes
    // deriving the path before creating the folder legal. It has to be derived
    // before every branch that can still reach a spawn, because a crash on such
    // a launch must leave a record for the next launch's `_reapLeftover()`.
    this._stateFilePath = `${this._configDir}/sidecar-state-${this._profileStateKey()}.json`;

    // D-105: observe the topic that fires once quit is final and can no
    // longer be cancelled -- beginning an irreversible shutdown under a
    // quit that gets aborted would kill a backend the user still wants.
    //
    // 01-12 (01-VERIFICATION.md's failed truth 2e): registered HERE, ahead of
    // every branch that follows, rather than after the last of them. Everything
    // below this line is classified recoverable, and a recoverable failure still
    // starts D-115's background probe, which re-enters `_restart()` and can drive
    // a spawn through the health gate to a completed swap. So a launch that
    // returns from any later branch can still end up with a live, healthy,
    // supervised backend -- and if the observer were registered after that
    // branch, `stop()` would never run on quit and a Node process with the
    // extension host's file access and terminal surface would outlive the
    // browser, still holding the token it was handed at spawn.
    //
    // NG-032/NG-033, final-review I1: the observer runs the whole quit flush
    // synchronously first (PowerBrowserAPI.runQuitFlushSync, bounded by
    // powerbrowser.shell.quitFlushTimeoutMs, default 3000), then stops the
    // backend. Granted time is final: the quit -- a plain quit, a restart, a
    // safe-mode or silent restart -- keeps the intent its requester announced,
    // so no request is ever cancelled and re-issued. Best-effort like the
    // actor registration below, so it can never stall startup.
    //
    // The callback keeps the `() => this.stop()` shape (stop() itself runs
    // the flush first, reading the supervisor's own fields there) so the
    // start-path-recovery check's derivation E still locates this
    // registration structurally.
    try {
      this._quitObserverOff = PowerBrowserAPI.onQuitGranted(() => this.stop());
    } catch (err) {
      this._pushLog(`Quit flush not registered: ${err && err.message ? err.message : err}`);
    }

    // UPD-30 (Phase 54): the reap blocker quit and restart both await, registered once per process.
    if (!this._reapBlockerAdded) {
      this._reapBlockerAdded = true;
      try {
        // Bound to a local, not passed inline: the start-path-recovery row derives its one
        // quit-observer registration from an inline arrow callback, and this blocker is a second one.
        const reapBlocker = () => this.stopAndReap();
        PowerBrowserAPI.addSidecarReapBlocker(reapBlocker);
      } catch (err) {
        this._pushLog(`Reap blocker not registered: ${err && err.message ? err.message : err}`);
      }
    }

    // 01-10: this was one of three unguarded throw sites in the start path --
    // a rejection here left `start()` altogether and, before the terminal
    // handler existed, vanished as an unhandled promise rejection. Guarded now,
    // and classified the way every `_spawnAndGate` failure is, so it inherits
    // the retry path and the diagnostics rows instead of falling to the generic
    // backstop. Recoverable, unlike `_resolveSidecar`'s two D-113 classes: a
    // directory that cannot be created today can be creatable once the user
    // fixes a permission or frees space, which is exactly what Retry is for.
    try {
      await PowerBrowserAPI.ensureDirectory(this._configDir);
    } catch (err) {
      this._fatal(`Failed to create the settings directory ${this._configDir}: ${err.message}`);
      const failed = {
        ok: false,
        recoverable: true,
        message: USER_MESSAGE.couldNotStart,
        details: [
          ["Failed step", "creating the settings folder"],
          ["Error", err.message],
        ],
      };
      this._showError(failed.message, failed.recoverable, failed.details);
      return;
    }

    // SIDE-04: reap a verified leftover from a previous crashed launch
    // BEFORE this session's own first spawn -- a leftover recorded in the
    // state file is either signalled (verified identity) or discarded
    // (stale/absent/malformed), and either way this returns before any new
    // process exists that could be confused with the leftover.
    //
    // 01-10: guarded, and DELIBERATELY NON-FATAL -- the asymmetry with the
    // settings-folder step above is the decision, not an oversight. That step
    // is a precondition of this launch; this one is best-effort cleanup of a
    // PREVIOUS launch's process (`PowerBrowserAPI.signalBarePid` never throws,
    // but the guard stays as a second line of defence). Failing this launch because a
    // stale pid could not be signalled would turn a cosmetic cleanup miss into
    // the dead screen this whole guard exists to prevent. Nothing is lost:
    // `_reapLog` writes the outcome on the same dual channel every other reap
    // decision uses -- the D-106 ring buffer the diagnostics layer renders,
    // and the process's own stdout -- so a failed reap is attributable after
    // the fact rather than invisible.
    try {
      await this._reapLeftover();
    } catch (err) {
      this._reapLog(`Leftover reap failed: ${err.message} -- best-effort cleanup of a previous launch, continuing to this launch's own spawn.`);
    }

    // SQL-01 (12-CODE-REVIEW.md CR-04): start the chrome-side tab-store
    // writer. ensureTabStore opens (migrating), tripwires, and rebuilds from
    // sessionstore when tripped -- resolving ready/rebuilt/degraded, never
    // throwing, so startup never stalls on the store. startTabStoreTriggers
    // then attaches the tab-event family plus the sessionstore-write sweep
    // observer that keeps later windows covered. Both calls go through
    // PowerBrowserAPI (D-96: this file imports nothing else), and both live
    // in existing shell files -- no new XPCOM, no Gecko outside the stack.
    try {
      const storeState = await PowerBrowserAPI.ensureTabStore();
      this._pushLog(`Tab store: ${storeState}.`);
    } catch (err) {
      // ensureTabStore promises never to throw; this is belt-and-braces so
      // a store failure can never block the first backend spawn below.
      this._pushLog(`Tab store degraded: ${err && err.message ? err.message : err}`);
    }
    try {
      this._tabStoreTriggersOff = PowerBrowserAPI.startTabStoreTriggers();
    } catch (err) {
      this._pushLog(`Tab triggers not attached: ${err && err.message ? err.message : err}`);
    }

    // NG-034: last session's web-tab histories, read before the frontend can
    // reopen a web tab. Best-effort like the store above.
    try {
      await PowerBrowserAPI.loadWebTabHistories();
    } catch (err) {
      this._pushLog(`Web tab history not loaded: ${err && err.message ? err.message : err}`);
    }

    // GUI-08 (15-01): register the PowerBrowserGroup actor pair beside the
    // tab-store wiring above (before _restart/swap), through PowerBrowserAPI
    // only (D-96: this file imports nothing else). Best-effort like the
    // store: a registration failure is logged and startup continues, so the
    // write channel can never stall the first spawn.
    try {
      PowerBrowserAPI.registerGroupActor();
    } catch (err) {
      this._pushLog(`Group actor not registered: ${err && err.message ? err.message : err}`);
    }

    // SHELL-03: the very first spawn attempt is folded into _restart()'s
    // own bounded give-up loop (D-103 was Phase 4's indefinite-retry
    // default) rather than being a separate uncounted attempt outside the
    // budget -- `powerbrowser.sidecar.giveUpAttempts` is the TOTAL number of
    // spawn attempts this launch gets, first attempt included.
    // `_spawnAndGate`'s own success path (cookie + swap + health loop)
    // fires exactly once, on whichever attempt first succeeds.
    await this._restart();
  },

  /**
   * Granted-path quit (D-105), in order: run the whole frontend flush
   * synchronously while the backend still runs, then stop the health loop
   * (no restart can begin after this), then signal the backend's exit via a
   * single bounded platform call without awaiting it (a granted observer
   * cannot await; the call bounds itself by killGraceMs) -- never a
   * hand-rolled timer around it. Idempotent: a second call is a no-op.
   *
   * NG-032/NG-033, final-review I1: the flush runs here, not on the request
   * path, so a restart request keeps its intent -- nothing is cancelled and
   * nothing is re-issued. Skipped when there is no live frontend to flush
   * (no swap yet); with one, runQuitFlushSync spins the nested loop bounded
   * by quitFlushTimeoutMs, so a hung frontend cannot hold the quit past it.
   */
  stop() {
    if (this._shuttingDown) {
      return;
    }
    this._shuttingDown = true;

    if (this._swapped && this._browserElement) {
      try {
        PowerBrowserAPI.runQuitFlushSync(
          this._browserElement,
          PowerBrowserAPI.getIntPref("powerbrowser.shell.quitFlushTimeoutMs", 3000)
        );
      } catch (err) {
        this._pushLog(`Quit flush failed: ${err && err.message ? err.message : err}`);
      }
    }

    if (this._proc && this._proc.exitCode == null) {
      const graceMs = PowerBrowserAPI.getIntPref("powerbrowser.sidecar.killGraceMs", 3000);
      try {
        void PowerBrowserAPI.killProcess(this._proc, graceMs).catch(() => {});
      } catch {
        // Already exited. Fire-and-forget from a granted observer: awaiting
        // here would run the rest of the teardown inside the nested loop the
        // flush above is spinning, and killProcess is already bounded by
        // graceMs on its own. A rejection (an already-exited race) is
        // dropped rather than left unhandled during shutdown.
      }
    }
    this._proc = null;
    this._healthy = false;

    // SQL-01 (12-CODE-REVIEW.md CR-04): detach the tab-store triggers wired
    // in start(), best-effort like every other teardown here.
    if (this._tabStoreTriggersOff) {
      try {
        this._tabStoreTriggersOff();
      } catch {
        // Listener removal is best-effort on teardown.
      }
      this._tabStoreTriggersOff = null;
    }

    // UPD-18 (46-01, review CR-01): detach the update observers wired in _swap().
    if (this._updateObserverOff) {
      try {
        this._updateObserverOff();
      } catch {
        // Observer removal is best-effort on teardown.
      }
      this._updateObserverOff = null;
    }

    // D-110: a clean stop must leave nothing for the next startup's
    // _reapLeftover() to find -- a normal quit followed by a normal start
    // signals nothing. Fire-and-forget beside the kill above: removeStateFile
    // tolerates an absent file, and anything else is not worth blocking
    // shutdown over.
    if (this._stateFilePath) {
      try {
        void PowerBrowserAPI.removeStateFile(this._stateFilePath).catch(() => {});
      } catch {
        // Best-effort.
      }
    }

    // 01-12: detach LAST, once the process is already signalled, awaited and
    // cleared -- an observer removed while a supervised backend is still live
    // would leave that backend to outlive the browser, which is exactly the leak
    // the early registration in start() exists to close. Removing an observer
    // from inside its own notification is safe here, and the guard is what makes
    // the second of two stop() calls (the observer's, and a direct one) a no-op
    // rather than a throw.
    if (this._quitObserverOff) {
      this._quitObserverOff();
      this._quitObserverOff = null;
    }
  },

  /**
   * UPD-30 (Phase 54): the reap the quit and restart blocker awaits. stop() is idempotent and already
   * signals the sidecar; this waits on the Subprocess handle stop() signals (the same on every
   * platform, no pid probe), bounded by powerbrowser.sidecar.killGraceMs (the same default as stop())
   * plus 500 ms. A handle that was never live is not waited on, so a stale pid is never touched. On
   * timeout it logs the live pid loudly and resolves, and any failure resolves too, so an unkillable
   * child can never hold shutdown open or reject the blocker.
   */
  async stopAndReap() {
    const proc = this._proc && this._proc.exitCode == null ? this._proc : null;
    const pid = this._pid;
    const graceMs = PowerBrowserAPI.getIntPref("powerbrowser.sidecar.killGraceMs", 3000);
    try {
      this.stop();
      if (proc === null) {
        return;
      }
      if (await PowerBrowserAPI.waitForExit(proc, graceMs + 500)) {
        this._pid = null;
      } else {
        PowerBrowserAPI.log("error", `Sidecar pid ${pid} is still alive ${graceMs} ms after the reap; shutdown continues without it.`);
      }
    } catch (err) {
      PowerBrowserAPI.log("error", `Sidecar reap failed (${err && err.name ? err.name : "error"}); shutdown continues without it.`);
    }
  },

  /** D-106: the buffered lines, newest last. Phase 5's diagnostics page reads this. */
  getRecentLog() {
    return this._log.slice();
  },

  /**
   * 01-07: the current error state's diagnostic identifiers as [label, value]
   * rows -- the pref key, the resolved path, the readiness sentinel, the health
   * probe's port, the elapsed timeout, the raw exception text. Empty when there
   * is no error state. The ONE source both the diagnostics layer's field rows
   * and the POWERBROWSER_ERROR_DIAGNOSTICS sentinel read, so a row that renders
   * is a row that was announced and vice versa.
   */
  getFailureDetails() {
    return this._failureDetails ? this._failureDetails.map(row => row.slice()) : [];
  },

  /** Current port, pid, health status and restart count. Phase 5's diagnostics page reads this too. */
  getState() {
    return {
      port: this._port,
      pid: this._pid,
      healthy: this._healthy,
      restartCount: this._restartCount,
    };
  },

  /**
   * Resolves the backend entry file and Node executable. Returns
   * `{ ok, message, details }` -- D-113: both failure classes here are
   * unrecoverable (a missing pref or an unresolvable Node can never fix itself
   * on retry), and this method is only ever called once, from start() -- never
   * from the restart path -- so they can only ever be the first launch's
   * give-up case.
   *
   * 01-07: `message` is the user-facing sentence (always a USER_MESSAGE value);
   * `details` carries the identifiers that sentence deliberately drops. The
   * `_fatal()` line above each return keeps the FULL diagnostic text -- that is
   * the log, not the user surface, and verify-platform.sh's own checks match on
   * it.
   */
  async _resolveSidecar() {
    // NG-063: a packaged install carries its own Theia beside the binary
    // (powerbrowser/packaging/package-linux.sh). Use it unless the user set a path;
    // the build default points at the dev tree, which also exists on the build host.
    const appDir = PowerBrowserAPI.getAppDir();
    const stagedMain = appDir ? `${appDir}/theia/lib/backend/main.js` : "";
    this._backendMain =
      !PowerBrowserAPI.prefHasUserValue("powerbrowser.sidecar.backendMain") && stagedMain && (await PowerBrowserAPI.pathExists(stagedMain))
        ? stagedMain
        : PowerBrowserAPI.getStringPref("powerbrowser.sidecar.backendMain", "");
    if (!this._backendMain) {
      this._fatal("powerbrowser.sidecar.backendMain is unset -- cannot locate the Theia backend entry file.");
      return {
        ok: false,
        message: USER_MESSAGE.interfaceFilesMissing,
        details: [
          ["Preference", "powerbrowser.sidecar.backendMain"],
          ["Preference status", "unset"],
        ],
      };
    }
    if (!(await PowerBrowserAPI.pathExists(this._backendMain))) {
      this._fatal(`powerbrowser.sidecar.backendMain (${this._backendMain}) does not exist -- cannot locate the Theia backend entry file.`);
      return {
        ok: false,
        message: USER_MESSAGE.interfaceFilesMissing,
        details: [
          ["Preference", "powerbrowser.sidecar.backendMain"],
          ["Resolved path", this._backendMain],
          ["Preference status", "set, but the path does not exist"],
        ],
      };
    }

    const stagedNode = appDir ? `${appDir}/node/bin/node` : "";
    const configured = PowerBrowserAPI.getStringPref("powerbrowser.sidecar.nodePath", "");
    const useStagedNode =
      !PowerBrowserAPI.prefHasUserValue("powerbrowser.sidecar.nodePath") && stagedNode && (await PowerBrowserAPI.pathExists(stagedNode));
    this._nodePath = (useStagedNode ? stagedNode : configured) || (await PowerBrowserAPI.pathSearch("node"));
    if (!this._nodePath) {
      this._fatal("Could not resolve a Node executable -- set powerbrowser.sidecar.nodePath or add node to PATH.");
      return {
        ok: false,
        message: USER_MESSAGE.nodeMissing,
        details: [
          ["Preference", "powerbrowser.sidecar.nodePath"],
          ["Preference status", "unset, and no `node` was found on PATH"],
        ],
      };
    }

    // NG-073 (wave E T6-R1): the shipped sidecar gets no plugin directory of
    // its own, so tell it where the app's plugins are. The backend entry
    // resolves to <app>/lib/backend/main.js (staged <GreD>/theia or the dev
    // app dir), and Task 6 stages the declared archives into <app>/plugins
    // (scripts/download-plugins.mjs, powerbrowser/packaging/package-linux.sh
    // stages the same directory); that directory is the deployer's own
    // local-dir scheme, which its THEIA_DEFAULT_PLUGINS entry and its
    // --plugins CLI value both accept. A user-set backendMain keeps its
    // sibling plugins/ (a scratch app built against this layout resolves the
    // same way); an entry not under lib/backend keeps the full path, which
    // the deployer refuses to resolve rather than loading elsewhere.
    this._pluginsDir = this._backendMain.replace(/\/lib\/backend\/main\.js$/, "/plugins");

    return { ok: true, message: null, details: null };
  },

  /**
   * PKG-06 (Phase 45): the sidecar state directory lives under this launch's
   * own Gecko profile directory (ProfD), never under XDG_CONFIG_HOME/HOME.
   * _profileStateKey() already suffixes the state file name by profile (the
   * CR-01 fix); this moves the BASE too, so the matrix no-residue rows can
   * derive the inspected paths from the packaged application.ini plus ProfD
   * at check time. Falls back to the pre-45 XDG behaviour only when
   * getProfileDir() resolves "" (the same never-throw convention as
   * _profileStateKey()'s "default" fallback), so a ProfD read failure
   * degrades to the old single-location behaviour rather than crashing
   * startup. No new pref, no new internal touchpoint.
   */
  _resolveConfigDir() {
    const profileDir = PowerBrowserAPI.getProfileDir();
    if (profileDir) {
      return `${profileDir}/powerbrowser-theia`;
    }
    const xdg = PowerBrowserAPI.getEnv("XDG_CONFIG_HOME");
    const home = PowerBrowserAPI.getEnv("HOME");
    const base = xdg || `${home}/.config`;
    return `${base}/powerbrowser`;
  },

  /**
   * CR-01 fix (05-REVIEW.md): a filesystem-safe key derived from this
   * launch's own profile directory (ProfD), used to suffix the state file
   * name so two PowerBrowser instances running under different `--profile`
   * paths never share one `sidecar-state.json` -- previously
   * `_resolveConfigDir()` was keyed only on `XDG_CONFIG_HOME`/`HOME`, so
   * every instance under the same OS user read and wrote the exact same
   * file regardless of profile, and a second instance's startup reap
   * (`_reapLeftover`) would verify-and-SIGTERM a FIRST instance's live,
   * healthy backend (its pid genuinely was alive with exactly matching
   * start ticks -- the identity check is sound, the shared file was not).
   * No hash needed: ProfD's own absolute path is already the identity
   * that matters, non-alphanumeric characters are simply replaced so it's
   * a valid filename component, and it stays human-readable in the
   * directory listing. Falls back to the literal string "default" (never
   * throws, never empty) when ProfD can't be read, so a `getProfileDir()`
   * failure degrades to the pre-fix single-file behaviour rather than
   * crashing startup.
   */
  _profileStateKey() {
    const profileDir = PowerBrowserAPI.getProfileDir();
    return profileDir ? profileDir.replace(/[^a-zA-Z0-9]+/g, "_") : "default";
  },

  /**
   * WR-03 (Phase 45): the state file a pre-45 build wrote lives under the XDG
   * config dir, at the same profile-keyed name. The path comes from the same
   * inputs the old `_resolveConfigDir()` used, so it is exact.
   */
  _legacyStateFilePath() {
    const xdg = PowerBrowserAPI.getEnv("XDG_CONFIG_HOME");
    const home = PowerBrowserAPI.getEnv("HOME");
    return `${xdg || `${home}/.config`}/powerbrowser/sidecar-state-${this._profileStateKey()}.json`;
  },

  /**
   * WR-03: moves the legacy record into ProfD (once) and returns the paths the
   * leftover reap must read: the ProfD path, plus the legacy path whenever the
   * legacy file is still there (a failed move keeps it findable).
   */
  async _migrateLegacyStateFile() {
    const legacy = this._legacyStateFilePath();
    try {
      const moved = await migrateLegacyStateFile(
        {
          read: (p) => PowerBrowserAPI.readStateFile(p),
          write: (p, value) => PowerBrowserAPI.writeStateFile(p, value),
          remove: (p) => PowerBrowserAPI.removeStateFile(p),
        },
        legacy,
        this._stateFilePath
      );
      if (moved) {
        this._reapLog(`Moved the pre-upgrade sidecar state file into the profile directory.`);
      }
    } catch (err) {
      this._reapLog(`Pre-upgrade sidecar state file could not be moved (${err.message}); reaping it in place.`);
    }
    return legacy && legacy !== this._stateFilePath ? [this._stateFilePath, legacy] : [this._stateFilePath];
  },

  /**
   * SIDE-04's startup half: verified-identity reap of a leftover backend
   * from a previous crashed launch, called from start() before this
   * session's first spawn. D-111: signals a recorded pid ONLY when its
   * live `/proc/<pid>/stat` start-time ticks match the state file's
   * recorded value EXACTLY (string equality) -- a mismatch means the
   * operating system has recycled that pid onto an unrelated process, and
   * this returns without ever calling signalBarePid, no escalation.
   *
   * SIDE-04 empty edge: an absent, zero-byte, or malformed state file
   * resolves via `PowerBrowserAPI.readStateFile` to `null` (never throws) --
   * this returns silently and start()'s normal spawn sequence proceeds
   * exactly as it does today.
   */
  async _reapLeftover() {
    // WR-03: a pre-45 state file moves into ProfD first; both paths are reaped.
    for (const path of await this._migrateLegacyStateFile()) {
      await this._reapLeftoverAt(path);
    }
  },

  /** One leftover record: the reap body for a single state-file path. */
  async _reapLeftoverAt(path) {
    const record = await PowerBrowserAPI.readStateFile(path);
    if (!record || typeof record.pid !== "number") {
      return;
    }

    const alive = PowerBrowserAPI.signalBarePid(record.pid, /* signal 0: liveness only */ 0);
    if (!alive) {
      this._reapLog(`Leftover state file named pid ${record.pid}, already gone -- removing stale state file.`);
      await this._removeStateFileQuietly(path);
      return;
    }

    const observedTicks = await PowerBrowserAPI.readProcessStartTicks(record.pid);
    if (observedTicks === null || observedTicks !== record.startTicks) {
      // Recycled-pid footgun (D-111): pid is alive, but it is NOT the
      // process this project recorded. Never signal it.
      this._reapLog(
        `Leftover state file's pid ${record.pid} is alive but its start-time ticks MISMATCH ` +
          `(recorded ${record.startTicks}, observed ${observedTicks}) -- the pid has been recycled by the OS onto an unrelated process; not signalling it.`
      );
      await this._removeStateFileQuietly(path);
      return;
    }

    const SIGTERM = 15;
    const signalled = PowerBrowserAPI.signalBarePid(record.pid, SIGTERM);
    if (!signalled) {
      this._reapLog(`Leftover pid ${record.pid} (verified identity match) could not be signalled with SIGTERM.`);
      await this._removeStateFileQuietly(path);
      return;
    }

    // Brief bounded poll -- not a hard requirement for correctness (the
    // state file is removed either way below), just makes the reap
    // outcome observable in the log without an unbounded wait.
    const deadline = Date.now() + 3000;
    let stillAlive = PowerBrowserAPI.signalBarePid(record.pid, 0);
    while (stillAlive && Date.now() < deadline) {
      await PowerBrowserAPI.sleep(100);
      stillAlive = PowerBrowserAPI.signalBarePid(record.pid, 0);
    }

    if (stillAlive) {
      this._reapLog(`Leftover pid ${record.pid} (verified identity match) was signalled with SIGTERM but is still alive -- leaving it alone, no escalation.`);
    } else {
      this._reapLog(`Leftover pid ${record.pid} (verified identity match) was signalled with SIGTERM and is gone.`);
    }
    await this._removeStateFileQuietly(path);
  },

  /**
   * Ring buffer AND console/stdout, same dual-channel convention `_fatal`
   * already uses -- the reap decision must be independently observable
   * both from `getRecentLog()` (Phase 5's diagnostics page) and from the
   * process's own stdout (verify-platform.sh's automated controls read the
   * launch log directly, with no chrome-side access).
   */
  _reapLog(message) {
    this._pushLog(message);
    PowerBrowserAPI.log("log", `[TheiaService] ${message}`);
  },

  async _removeStateFileQuietly(path = this._stateFilePath) {
    try {
      await PowerBrowserAPI.removeStateFile(path);
    } catch {
      // Best-effort; removeStateFile already tolerates an absent file.
    }
  },

  /**
   * Spawns the backend and waits for it to become healthy. Returns
   * `{ ok, recoverable, message, details }` (SHELL-03/D-113) instead of a bare
   * boolean, so `_restart()`/`start()` can tell an unrecoverable failure
   * (backend entry file unresolvable, spawn() itself throwing, the pinned
   * port held by another process -- D-112) from a transient one (readiness
   * stream ended, readiness timeout, health-probe timeout) without
   * re-deriving the classification.
   *
   * 01-07: `message` is always a USER_MESSAGE value -- the user-facing sentence
   * the error layer paints verbatim -- and `details` carries the identifiers
   * that sentence drops (the readiness sentinel, the port, the timeout, the raw
   * exception text). Before 01-07 a single `reason` field was both, so the
   * error layer painted `POWERBROWSER_BACKEND_READY` and a millisecond count at
   * a user. The full diagnostic text still goes to `_fatal()` unchanged.
   *
   * `beforeFirstSwap: true` requests port 0 (SIDE-01) -- the only place a zero
   * port appears in this file. Every later call (Task 2's restart path)
   * passes the already-pinned `this._port`, because the already-loaded
   * Theia page reconnects to the origin it was loaded from (D-104).
   *
   * 01-09: this parameter was named `firstSpawn` and `_restart()` computed it
   * as `this._port === null`, which conflated "a port has been pinned" with "a
   * spawn has actually completed". A first spawn that announced readiness (so
   * a port WAS pinned) and then failed the health gate left every later,
   * successful respawn taking the `else` branch -- no cookie, no navigation,
   * no health loop -- stranding the user on the branded loading layer with a
   * healthy backend behind it (01-VERIFICATION.md's one FAILED must-have). It
   * is now keyed on `this._swapped`, the field that actually records
   * completion, and named for what it means. D-104's invariant is untouched
   * where it is load-bearing: every respawn AFTER a completed swap still
   * targets the pinned port, because that is the only state in which a loaded
   * page exists whose origin must hold still. Before a completed swap nothing
   * is loaded at that origin, so re-pinning it was a constraint with no
   * beneficiary and a real cost -- D-112 would classify a squatted pre-swap
   * port as unrecoverable and give up immediately.
   */
  async _spawnAndGate(beforeFirstSwap) {
    const port = beforeFirstSwap ? 0 : this._port;
    const args = [this._backendMain, "--hostname", "127.0.0.1", "--port", String(port)];
    // NO SECRET GOES IN HERE. `environment` becomes the child's
    // /proc/<pid>/environ, which is the exec-time snapshot: it is readable by
    // every same-uid process for the whole life of the backend, and nothing
    // the backend deletes from its own process.env rewrites it. On this
    // project's own target Yama's ptrace_scope=1 blocks /proc/<pid>/mem but
    // not environ, so the environment is the one place a credential stays
    // legible to a co-resident process. `this._token` is therefore handed over
    // the stdin pipe instead, immediately after the spawn below.
    //
    // The remaining POWERBROWSER_* variables are a one-way handshake into the
    // backend PROCESS, not something its children may see: the backend
    // captures and deletes every POWERBROWSER_*-prefixed key from its own
    // process.env at module load
    // (theia/extensions/token-gate/src/node/powerbrowser-env.ts), because Node
    // hands process.env to every child -- terminals, tasks, the plugin host
    // running third-party extensions. Do not add a POWERBROWSER_* key here
    // expecting a grandchild to read it, and do not add one carrying a secret
    // at all.
    const environment = {
      THEIA_CONFIG_DIR: this._configDir,
      VSX_REGISTRY_URL: "https://open-vsx.org",
      // SIDE-04 (05-01-PLAN.md): arms the backend's parent-death watchdog
      // (parent-watchdog-backend-contribution.ts). The watchdog is INERT
      // without this exact "1" -- three unsupervised callers depend on
      // staying inert when their own stdin closes/EOFs for unrelated
      // reasons: `yarn start`, `scripts/smoke-theia.sh`, and
      // verify-platform.sh's own start_backend (stdin redirected from
      // /dev/null). Only this supervisor's spawn sets it.
      POWERBROWSER_SUPERVISED: "1",
      // PowerBrowserAPI.spawnProcess uses environmentAppend:true, so the child
      // inherits this process's own environment and anything already exported
      // in the shell that launched the browser comes along. The token gate's
      // named dev bypass must therefore be cleared EXPLICITLY here: inherited,
      // it silently disables authentication on a backend that has arbitrary
      // file access and a terminal. The gate tests `=== "1"`, so an empty
      // value is off; the point is that the supervised path never depends on
      // the launching environment being clean. This clear is load-bearing
      // rather than belt-and-braces now that the backend captures the value
      // at module load: an inherited "1" would be captured before the scrub
      // and would disable the gate for that whole process lifetime.
      POWERBROWSER_TOKEN_DISABLE: "",
      // SQL-04 (12-CODE-REVIEW.md WR-04): the profile directory the
      // chrome-side tab store lives under, for the Theia backend's readonly
      // tab query service (TabQueryService defaults to this key). A path,
      // not a credential, so environ visibility is irrelevant; the backend
      // captures and deletes it at module load with every other
      // POWERBROWSER_* key, and the service reads it from there once its
      // first consumer lands (still STAGED -- see the service header).
      POWERBROWSER_PROFILE_DIR: PowerBrowserAPI.getProfileDir(),
      // NG-073 (wave E T6-R1): the app's plugins directory, derived in
      // _resolveSidecar from the resolved backend entry. THEIA_DEFAULT_PLUGINS
      // (not THEIA_PLUGINS): the deployer treats a DEFAULT entry as a system
      // plugin -- the T6 comment in scripts/download-plugins.mjs records that
      // a THEIA_PLUGINS/THEIA_DEFAULT_PLUGINS folder refuses packed files,
      // and T6 stages each declared archive unpacked beside itself under this
      // same directory -- while user entries come from the config-dir plugins
      // participant, which the supervisor must not override. local-dir: is the
      // deployer's own LocalDirectoryPluginDeployerResolver scheme, accepted
      // both here and as --plugins=local-dir:<dir>. A directory path, not a
      // credential, so environ visibility is irrelevant like every other
      // non-POWERBROWSER_* key in this object.
      ...(this._pluginsDir ? { THEIA_DEFAULT_PLUGINS: `local-dir:${this._pluginsDir}` } : {}),
    };

    let proc;
    try {
      proc = await PowerBrowserAPI.spawnProcess({ command: this._nodePath, args, environment });
    } catch (err) {
      // D-113: the spawn() call itself throwing is unrecoverable -- a
      // platform-level failure to exec at all is never going to succeed on
      // an unconditional retry.
      this._fatal(`Failed to spawn the backend: ${err.message}`);
      return {
        ok: false,
        recoverable: false,
        message: USER_MESSAGE.couldNotStartUnrecoverable,
        details: [
          ["Failed step", "spawning the backend process"],
          ["Error", err.message],
        ],
      };
    }
    this._proc = proc;

    if (this._shuttingDown) {
      await this._reap();
      // 01-UI-SPEC.md's rewrite table: "Shutting down." is NOT an error
      // surface and keeps its literal verbatim. It never reaches the error
      // layer -- `_restart()` returns at its own `_shuttingDown` check before
      // `_showError` -- so it carries no user-facing `message` at all rather
      // than a rewritten one, and stays exactly where it was.
      return { ok: false, recoverable: false, message: null, details: null, reason: "Shutting down." };
    }

    // The credential handshake (D-98), and the reason the environment object
    // above carries no token. One line, written once per spawn, on a pipe that
    // stays OPEN afterwards -- the backend's parent-death watchdog reads the
    // same fd for EOF, so closing it here would kill the backend on the spot.
    // powerbrowser-env.ts consumes exactly this line, byte-at-a-time up to the
    // newline, before the token gate decides whether to fail closed. D-104 is
    // unaffected: every respawn writes the SAME this._token, so the cookie
    // chrome minted on the first spawn keeps authenticating.
    try {
      await PowerBrowserAPI.writeStdinLine(proc, this._token);
    } catch (err) {
      // The backend is now blocked reading a line that will never arrive, and
      // would sit there until the startup timeout. Reap it and report instead:
      // recoverable, because a pipe write failing says nothing about whether
      // the next spawn will.
      this._fatal(`Failed to hand the backend its token over stdin: ${err.message}`);
      await this._reap();
      return {
        ok: false,
        recoverable: true,
        message: USER_MESSAGE.couldNotStart,
        details: [
          ["Failed step", "handing the backend its credential over stdin"],
          ["Error", err.message],
        ],
      };
    }

    const pinnedPort = beforeFirstSwap ? null : this._port;
    const readyPromise = this._pumpOutput(proc, pinnedPort);
    const startupTimeoutMs = PowerBrowserAPI.getIntPref("powerbrowser.sidecar.startupTimeoutMs", 90000);

    let ready;
    try {
      ready = await Promise.race([
        readyPromise,
        PowerBrowserAPI.sleep(startupTimeoutMs).then(() => null),
      ]);
    } catch (err) {
      // D-112: `_pumpOutput` marks a pinned-port-conflict rejection with
      // `err.recoverable = false` (the port is held by another process --
      // never going to bind on an unconditional retry against the same
      // pinned port). Every other output-stream-ended rejection (a genuine
      // crash) is a transient, recoverable failure.
      if (err.recoverable === false) {
        // D-112's pinned-port conflict. `err.message` is the full diagnostic
        // sentence _pumpOutput already wrote through _fatal(); the ports it
        // names go to the rows, not to the user.
        return {
          ok: false,
          recoverable: false,
          message: USER_MESSAGE.couldNotStartUnrecoverable,
          details: [
            ["Failed step", "reattaching to the port this session is pinned to"],
            ["Pinned port", this._port],
            ["Error", err.message],
          ],
        };
      }
      this._fatal(`Backend output stream ended before announcing readiness: ${err.message}`);
      return {
        ok: false,
        recoverable: true,
        message: USER_MESSAGE.couldNotStart,
        details: [
          ["Failed step", "waiting for the backend to announce readiness"],
          ["Error", err.message],
        ],
      };
    }

    if (!ready) {
      this._fatal(`Backend did not announce POWERBROWSER_BACKEND_READY within ${startupTimeoutMs}ms.`);
      return {
        ok: false,
        recoverable: true,
        message: USER_MESSAGE.didNotFinishStarting,
        details: [
          ["Failed step", "waiting for the backend's readiness announcement"],
          ["Readiness sentinel", "POWERBROWSER_BACKEND_READY"],
          ["Startup timeout", `${startupTimeoutMs}ms`],
        ],
      };
    }

    this._port = ready.port;
    this._pid = ready.pid;

    // D-110: record this spawn in the state file on EVERY successful spawn,
    // first and respawn alike -- a crash after a restart must still leave
    // an accurate record for the next startup's _reapLeftover() to find.
    // Read via PowerBrowserAPI.readProcessStartTicks (the same field-22
    // /proc/<pid>/stat reader _reapLeftover() uses to verify identity
    // later), so writer and reader always agree on format.
    const startTicks = await PowerBrowserAPI.readProcessStartTicks(this._pid);
    try {
      await PowerBrowserAPI.writeStateFile(this._stateFilePath, {
        pid: this._pid,
        port: this._port,
        startTicks,
        writtenAt: Date.now(),
      });
      this._pushLog(`Wrote sidecar state file for pid ${this._pid}, port ${this._port}.`);
    } catch (err) {
      // Not fatal to this launch -- SIDE-04's startup-cleanup half degrades
      // (a leftover from THIS run may go unreaped next time), but the
      // backend itself is healthy and should keep running.
      this._pushLog(`Failed to write sidecar state file: ${err.message}`);
    }

    const healthIntervalStartupMs = PowerBrowserAPI.getIntPref("powerbrowser.sidecar.healthIntervalStartupMs", 250);
    const healthTimeoutMs = PowerBrowserAPI.getIntPref("powerbrowser.sidecar.healthTimeoutMs", 4000);
    const healthy = await this._pollUntilHealthy(startupTimeoutMs, healthIntervalStartupMs, healthTimeoutMs);
    if (!healthy) {
      this._fatal(`Health probe on port ${this._port} never returned 200 within ${startupTimeoutMs}ms.`);
      return {
        ok: false,
        recoverable: true,
        message: USER_MESSAGE.didNotFinishStarting,
        details: [
          ["Failed step", "health-probing the backend"],
          ["Health probe port", this._port],
          ["Health probe path", HEALTH_PATH],
          ["Startup timeout", `${startupTimeoutMs}ms`],
        ],
      };
    }

    this._healthy = true;

    // 01-09: keyed on `this._swapped` -- the SAME field `_swap()`'s own
    // early-return guard reads -- so "a spawn has actually completed" is one
    // fact with one owner. Keying this on anything that merely records a port
    // having been pinned is the conflation that stranded a launch on the
    // loading layer after a transient health-gate failure.
    if (!this._swapped) {
      // 01-10: the third unguarded throw site. `setSessionCookie` fails loudly
      // by design (a rejected cookie would otherwise become a silent 403 at the
      // far end of the swap), and that throw used to escape `_spawnAndGate`
      // entirely. RETURNING the classified failure rather than continuing is
      // load-bearing: the navigation must not run for a launch whose credential
      // was never minted, or the fail-closed backend would refuse every request
      // and the user would land on a blank frame instead of an actionable
      // error. The return also leaves `_swapped` false, so `_restart()`'s next
      // attempt re-runs this whole block -- which is only true because 01-09
      // re-keyed it onto completion. Do not reorder the cookie and the
      // navigation (D-98, D-104).
      try {
        PowerBrowserAPI.setSessionCookie({
          host: "127.0.0.1",
          path: "/",
          name: "POWERBROWSER_TOKEN",
          value: this._token,
        });
      } catch (err) {
        this._healthy = false;
        this._fatal(`Failed to set the backend session cookie: ${err.message}`);
        return {
          ok: false,
          recoverable: true,
          message: USER_MESSAGE.couldNotStart,
          details: [
            ["Failed step", "handing the interface its credential"],
            ["Error", err.message],
          ],
        };
      }
      this._swap();
      // Fire-and-forget: the loop runs for the lifetime of this browser
      // session, checking _shuttingDown at every await point rather than
      // needing a cancelable timer handle (Task 3's stop() just flips
      // that flag). 01-10: fire-and-forget is a promise ROOT, so it carries
      // the same terminal handler the bootstrap's own entry points do -- a
      // rejection here is a mid-session outage, and swallowing it strands the
      // user exactly as swallowing a start-path rejection did.
      this._healthLoop().catch(err => this.reportUnexpectedFailure(err));
    } else {
      this._pushLog(`Recovered on port ${this._port}, pid ${this._pid}.`);
    }

    return { ok: true, recoverable: null, message: null, details: null };
  },

  /**
   * Steady-state supervision for the lifetime of the browser session.
   * Each iteration sleeps the steady interval, then probes once (its own
   * bounded timeout, so a probe can never overlap the next one). Two
   * consecutive failures (not one -- a single slow response shouldn't
   * churn a healthy backend) trigger a restart; a restart resets the
   * failure count so the loop returns to steady-state polling once healthy
   * again.
   */
  async _healthLoop() {
    let consecutiveFailures = 0;

    while (!this._shuttingDown) {
      const steadyIntervalMs = PowerBrowserAPI.getIntPref("powerbrowser.sidecar.healthIntervalSteadyMs", 5000);
      await PowerBrowserAPI.sleep(steadyIntervalMs);
      if (this._shuttingDown) {
        break;
      }

      const healthTimeoutMs = PowerBrowserAPI.getIntPref("powerbrowser.sidecar.healthTimeoutMs", 4000);
      const ok = await this._probeHealth(healthTimeoutMs);
      if (this._shuttingDown) {
        break;
      }

      if (ok) {
        consecutiveFailures = 0;
        this._healthy = true;
        continue;
      }

      consecutiveFailures += 1;
      this._pushLog(`Health probe failed (${consecutiveFailures} consecutive).`);
      if (consecutiveFailures < CONSECUTIVE_FAILURES_THRESHOLD) {
        continue;
      }

      consecutiveFailures = 0;
      this._healthy = false;
      await this._restart();
    }
  },

  /**
   * Reaps whatever process handle currently exists and (re)spawns,
   * retrying with exponential backoff between failed attempts, until
   * EITHER a spawn's health probe passes, OR SHELL-03's split give-up rule
   * (D-113) ends the loop: an unrecoverable result (spawn() throwing, the
   * readiness stream classified unrecoverable -- D-112's stolen pinned
   * port) gives up immediately with no wait at all; a recoverable one keeps
   * retrying until the attempt cap or the wall-clock ceiling trips,
   * whichever comes first (`powerbrowser.sidecar.giveUpAttempts`/
   * `giveUpWallclockMs`). Either give-up path calls `_showError`; a
   * successful spawn calls `_hideError`.
   *
   * `giveUpAttempts` is the TOTAL number of spawn attempts this call gets,
   * the very first attempt included -- this is the single entry point for
   * every spawn after start()'s own resolve/reap-leftover step, whether
   * this is the first-ever launch or a later mid-session recovery, so
   * "six attempts" always means six, never six-plus-the-one-that-doesn't-
   * count. Both budget values are plain locals here, recomputed fresh on
   * every call, so a later outage always starts with a full budget.
   *
   * Per-attempt port choice: `this._swapped === false` means no spawn in this
   * browser session has ever COMPLETED yet -- keep requesting port 0 (SIDE-01)
   * until one does. Once a swap has completed, every later attempt here is a
   * true D-104 respawn on the pinned port, which is the only state in which a
   * loaded page exists whose origin must hold still. 01-09 moved this off
   * `this._port === null`: a port pinned by a spawn that then failed the
   * health gate is not a spawn that succeeded, and treating it as one made
   * every later respawn skip `_spawnAndGate`'s one-time initialisation.
   *
   * Idempotent/no-op re-entry (SHELL-03 concurrency edge): guarded by
   * `_restartInFlight`, shared with `retry()` and `_recoveryProbe()` --
   * whichever of start(), the health loop, a Retry click, or the
   * background probe gets here first runs the only spawn attempt in
   * flight; every other caller returns immediately without starting a
   * second one.
   */
  async _restart() {
    if (this._restartInFlight) {
      return;
    }
    this._restartInFlight = true;

    try {
      this._restartCount += 1;
      let backoffMs = RESTART_BACKOFF_INITIAL_MS;
      this._pushLog(`Restarting backend (attempt ${this._restartCount}).`);

      const giveUpAttempts = PowerBrowserAPI.getIntPref("powerbrowser.sidecar.giveUpAttempts", 6);
      const giveUpWallclockMs = PowerBrowserAPI.getIntPref("powerbrowser.sidecar.giveUpWallclockMs", 45000);
      const deadline = Date.now() + giveUpWallclockMs;
      let attempts = 0;

      await this._reap();

      for (;;) {
        if (this._shuttingDown) {
          return;
        }

        attempts += 1;
        const result = await this._spawnAndGate(!this._swapped);
        if (result.ok) {
          this._hideError();
          return;
        }

        await this._reap();
        if (this._shuttingDown) {
          return;
        }

        if (!result.recoverable) {
          // The LOG keeps the full diagnostic detail (this is the sink
          // verify-platform.sh's own checks read); the error layer gets the
          // user-facing sentence and the rows.
          this._pushLog(`Giving up immediately -- unrecoverable: ${this._detailSummary(result.details)}`);
          this._showError(result.message, false, result.details);
          return;
        }

        if (attempts >= giveUpAttempts || Date.now() >= deadline) {
          this._pushLog(
            `Giving up -- retry budget exhausted after ${attempts} attempt(s): ${this._detailSummary(result.details)}`
          );
          this._showError(result.message, true, result.details);
          return;
        }

        this._pushLog(`Respawn attempt failed; waiting ${backoffMs}ms before retrying.`);
        await PowerBrowserAPI.sleep(backoffMs);
        backoffMs = Math.min(backoffMs * 2, RESTART_BACKOFF_CAP_MS);
      }
    } finally {
      this._restartInFlight = false;
    }
  },

  /**
   * D-115: public retry entry point for the error layer's Retry control.
   * Resets the give-up budget (both budget values are plain locals inside
   * `_restart()`, recomputed fresh on every call) and re-enters the exact
   * same restart path the health loop uses -- respawning on the pinned
   * port once one exists. Shares `_restartInFlight` with `_restart()`
   * itself and `_recoveryProbe()`, so a second Retry click (or a Retry
   * racing the background probe) while a spawn is already in flight is a
   * no-op, never a second spawn.
   *
   * 01-11 (01-VERIFICATION.md's failed truth 2c): the error state is cleared
   * HERE, before re-entering `_restart()`, and deliberately not inside
   * `_restart()` itself. `retry()` is the one caller that has just taken the
   * message, the Retry and the Details off the user's screen, so it is the one
   * caller that owes a repaint if the restart fails again -- and without this
   * call `_errorShown` stays true and `_showError`'s guard swallows every later
   * repaint for the life of the session. Clearing from inside `_restart()`
   * instead would be wrong for a different reason: `_restart()` is also the
   * background recovery probe's own re-entry point, and `_hideError()` calls
   * `_stopRecoveryProbe()`, so it would tear down the probe loop that is calling
   * it and let the next `_showError()` start a second one. `_hideError()`
   * early-returns when `_errorShown` is false, so the health loop's and
   * `start()`'s own `_restart()` calls are unaffected by this.
   *
   * 01-13 (the same failed truth 2d, re-scoped by 01-REVIEW.md's CR-01): the
   * classification guard below is the SUPERVISOR half of the retry gate, and it
   * is the half that actually refuses. 01-12 gated the background probe timer on
   * `recoverable`; this entry point was still unconditional, so the one class
   * D-113 calls "unrecoverable by construction ... with no retry at all" was
   * re-entered by the single control the error screen offered. The bootstrap
   * hides that control (`errorRetryButton.hidden`), but that is PRESENTATION:
   * `powerbrowserRetry()` is a window global any chrome-privileged caller can
   * invoke without ever touching the button, and a rendered state is never
   * authority. Both routes are refused here, on the same terms.
   *
   * The guard's ORDERING is the second half of the fix and is load-bearing:
   * returning BEFORE `_hideError()` is what stops a refused click erasing
   * `_failureDetails`. A user action that did not itself resolve the failure must
   * not discard the diagnostic rows that identified it -- those rows are the only
   * thing the user has left to act on or to report.
   */
  async retry() {
    if (this._errorRecoverable !== true) {
      this._pushLog("Retry refused: the failure currently on screen was classified unrecoverable, so the restart path is not re-entered and the diagnostics rows are kept.");
      return;
    }
    this._hideError();
    await this._restart();
  },

  /**
   * 01-10: the ONE terminal-failure handler, and the only new member of this
   * object's public surface -- public because the chrome bootstrap attaches it.
   *
   * Four entry points onto this supervisor are fire-and-forget promise roots
   * with no shared root to guard: the bootstrap's `start()` call, the Retry
   * control's `retry()` call, and the two long-lived loops started without an
   * await (`_healthLoop()` in `_spawnAndGate`'s one-time block and
   * `_recoveryProbeLoop()` in `_startRecoveryProbe`). Every one of them routes
   * here, so there are four attachments but exactly ONE place the outcome is
   * decided. Before this existed, a rejection escaping any of them became an
   * unhandled promise rejection in chrome and the user was left on the branded
   * loading layer with no message, no Retry and no Details -- the identical
   * user-visible outcome as the state-gating defect 01-09 removed
   * (01-VERIFICATION.md's one FAILED must-have).
   *
   * This is a BACKSTOP for rejections that escape, never a timeout on the
   * loading layer: it can only run once a promise has actually rejected, so a
   * slow but succeeding start can never paint an error state here.
   *
   * The painted sentence is a direct `USER_MESSAGE.couldNotStart` reference --
   * static, product-named, already carrying Retry and Details as its next step
   * -- and never derived text. No new table entry is minted: an unclassified
   * escape is exactly the case that sentence exists for, and a new key would
   * have to invent a distinction the user cannot act on. Everything the
   * sentence drops (the rejection's own text, the failing step) goes to
   * `_fatal()` and to the diagnostics rows, read through the single
   * `getFailureDetails()` accessor, so nothing is lost.
   */
  reportUnexpectedFailure(err) {
    const text = err && err.message ? err.message : String(err);
    this._fatal(`Unhandled failure escaped the supervisor: ${text}`);
    // No guard on `_browserElement`: `start()` assigns it synchronously before
    // its first await, so no rejection can reach here with it unset. A guard
    // whose true branch is unreachable would be untestable and is deliberately
    // not written.
    this._showError(USER_MESSAGE.couldNotStart, /* recoverable */ true, [
      ["Failed step", "starting the interface"],
      ["Error", text],
    ]);
  },

  /**
   * D-115: a slow background probe, started when the error state is
   * entered (`_showError`) and stopped when it clears (`_hideError`). Fires
   * no sooner than `powerbrowser.sidecar.recoveryProbeIntervalMs` after
   * entering the error state, and takes the exact same recovery path Retry
   * does (`_restart()`, sharing its `_restartInFlight` guard) -- so a
   * backend whose failure condition has cleared on its own (D-112's port
   * squatter exiting, a transient condition resolving) is noticed and the
   * error layer auto-dismisses with no user action.
   */
  async _recoveryProbeLoop() {
    while (this._recoveryProbeActive && !this._shuttingDown) {
      const intervalMs = PowerBrowserAPI.getIntPref("powerbrowser.sidecar.recoveryProbeIntervalMs", 15000);
      await PowerBrowserAPI.sleep(intervalMs);
      if (!this._recoveryProbeActive || this._shuttingDown) {
        return;
      }
      await this._restart();
    }
  },

  _startRecoveryProbe() {
    if (this._recoveryProbeActive) {
      return;
    }
    this._recoveryProbeActive = true;
    // Fire-and-forget, same convention as _healthLoop() -- lives for as
    // long as _recoveryProbeActive stays true, checked at every await point --
    // and, 01-10, carrying the same one terminal handler for the same reason.
    this._recoveryProbeLoop().catch(err => this.reportUnexpectedFailure(err));
  },

  _stopRecoveryProbe() {
    this._recoveryProbeActive = false;
  },

  /**
   * SHELL-03/D-114: signals the chrome document's error layer through the
   * browser element's owner window, exactly like `_swap()` -- never the
   * browser element's own location. Guarded by `_errorShown` so repeated
   * calls for the same state (e.g. the health loop giving up again while
   * already in the error state) paint once and emit one state change.
   *
   * `message` is one of the USER_MESSAGE values and nothing else -- plain
   * language, product-named, ending in an on-screen affordance.
   * `recoverable` is the classification carried by the triggering
   * `_spawnAndGate`/`_resolveSidecar` result. `details` is that result's
   * [label, value] rows, stashed for `getFailureDetails()` -- the ONLY route
   * by which an internal identifier reaches a surface at all.
   *
   * 01-12 (01-VERIFICATION.md's failed truth 2d): `recoverable` GATES the
   * background recovery probe, and used to be received and ignored. D-115's
   * probe IS the retry mechanism -- it re-enters `_restart()` on a timer -- so
   * starting it for a class the supervisor has just classified unretryable
   * contradicts the classification in the same breath it records it. The three
   * call sites and what each passes:
   *   * `start()`'s `_resolveSidecar` failure branch passes FALSE. Its own D-113
   *     comment calls that class "unrecoverable by construction ... with no
   *     retry at all", and it returns before `_configDir` and `_stateFilePath`
   *     exist, so every probe-driven respawn there was spawning against
   *     unassigned state, once per interval, for the life of the session.
   *   * `_restart()`'s unrecoverable give-up passes FALSE.
   *   * `_restart()`'s budget-exhausted give-up and `reportUnexpectedFailure()`
   *     pass TRUE, and those keep the probe: D-115's auto-dismiss (a transient
   *     condition clearing on its own, the error layer disappearing with no user
   *     action) is exactly the recoverable case, and a gate that stopped probing
   *     everywhere would trade one defect for a worse one.
   * No second flag records this: the classification is already carried into this
   * method by every caller, and a "sidecar resolved" boolean beside `_errorShown`
   * would be a second source of truth for one fact -- the shape of the defect,
   * not its fix.
   *
   * 01-13: `_errorRecoverable` is written here, and it is NOT the second source
   * of truth the paragraph above rejects. That rejected shape was a separate
   * "sidecar resolved" boolean duplicating a fact this method already receives,
   * derived independently and free to disagree with it. This field duplicates
   * nothing. `recoverable` is a parameter with no lifetime past this call, and
   * `retry()` runs in a LATER TURN, driven by a user click, with no access to it
   * -- there was no way for the classification to reach the user-driven route at
   * all. The field stores the CURRENT ERROR STATE's classification with exactly
   * `_errorShown`'s lifetime: written inside the same false-to-true latch,
   * cleared at the same one site in `_hideError`, so the two can never describe
   * different failures.
   *
   * Neither this, the chrome layer's sentinel, nor a detail row may ever
   * include the per-launch token: `message` is a static literal, and every
   * detail value goes through the same `this._token` redaction `_pushLog`
   * applies, since an `err.message` is ultimately derived text.
   */
  _showError(message, recoverable, details) {
    if (this._errorShown) {
      return;
    }
    this._errorShown = true;
    // 01-13: inside the latch, so the stored classification always describes the
    // failure that is actually PAINTED. A later `_showError` swallowed by the
    // guard above must not overwrite it, or the message on screen and the
    // classification `retry()` reads would be describing different failures.
    this._errorRecoverable = recoverable === true;
    this._failureDetails = (details || []).map(([label, value]) => {
      const text = String(value);
      return [label, this._token ? text.replaceAll(this._token, "[redacted]") : text];
    });
    this._pushLog(`Showing error state (recoverable=${recoverable}): ${message}`);
    this._browserElement.ownerDocument.defaultView.powerbrowserShowError({ reason: message, recoverable });
    if (recoverable) {
      this._startRecoveryProbe();
    }
  },

  /** Hides the error layer and stops the background recovery probe. */
  _hideError() {
    if (!this._errorShown) {
      return;
    }
    this._errorShown = false;
    this._failureDetails = null;
    this._errorRecoverable = null;
    this._stopRecoveryProbe();
    this._browserElement.ownerDocument.defaultView.powerbrowserHideError();
  },

  /**
   * One-line rendering of a failure's detail rows, for the LOG only -- the
   * sink that keeps everything the user-facing sentence drops. Never reaches
   * the error layer.
   */
  _detailSummary(details) {
    return (details || []).map(([label, value]) => `${label}=${value}`).join("; ");
  },

  /** Kills the current process handle, if it's still alive, and clears it. */
  async _reap() {
    if (this._proc && this._proc.exitCode == null) {
      const graceMs = PowerBrowserAPI.getIntPref("powerbrowser.sidecar.killGraceMs", 3000);
      try {
        await PowerBrowserAPI.killProcess(this._proc, graceMs);
      } catch {
        // Already exited, or the platform kill failed on an already-dead
        // handle -- nothing more to do either way.
      }
    }
    this._proc = null;
  },

  /**
   * Reads both output pipes in a loop for the lifetime of `proc`, pushing
   * every line into the ring buffer and mirroring it to the console. Keeps
   * running after the ready sentinel is found (the returned promise settles
   * once, but the pumps themselves are not stopped) so ongoing backend
   * output during the steady state and any later restart also lands in the
   * log. Resolves `{port, pid}` parsed from the POWERBROWSER_BACKEND_READY
   * line; rejects if both pipes close without ever finding it.
   *
   * `pinnedPort`, when non-null, is D-104's restart invariant: a
   * respawn's sentinel reporting a different port is a hard error, logged
   * loudly, never silently followed -- the loop keeps waiting rather than
   * resolving with the wrong port.
   */
  _pumpOutput(proc, pinnedPort) {
    let settled = false;
    let resolveReady;
    let rejectReady;
    const readyPromise = new Promise((resolve, reject) => {
      resolveReady = resolve;
      rejectReady = reject;
    });

    const handleLine = line => {
      this._pushLog(line);
      PowerBrowserAPI.log("log", line);

      if (settled || !line.startsWith("POWERBROWSER_BACKEND_READY")) {
        return;
      }
      let parsed;
      try {
        parsed = JSON.parse(line.slice("POWERBROWSER_BACKEND_READY".length).trim());
      } catch {
        return;
      }
      if (typeof parsed.port !== "number" || typeof parsed.pid !== "number") {
        return;
      }
      if (pinnedPort !== null && parsed.port !== pinnedPort) {
        // D-112: a respawn announcing a different port than the one this
        // browser session is pinned to means the pinned port is held by
        // something else -- unrecoverable, the already-loaded Theia page
        // can only ever reconnect to the pinned origin. Previously this
        // just logged and returned, leaving readyPromise pending forever
        // (the caller would silently wait out the full startup timeout and
        // misclassify this as a mere readiness timeout, a recoverable
        // failure). Reject it immediately instead, marked so
        // `_spawnAndGate` can classify it without re-deriving the reason.
        const reason = `Respawn reported port ${parsed.port}, but this browser session is pinned to port ${pinnedPort} -- refusing to follow a moved port (D-104); the pinned port is likely held by another process (D-112).`;
        this._fatal(reason);
        settled = true;
        const err = new Error(reason);
        err.recoverable = false;
        rejectReady(err);
        return;
      }
      settled = true;
      resolveReady(parsed);
    };

    const pump = async which => {
      let pending = "";
      for (;;) {
        let chunk;
        try {
          chunk = await PowerBrowserAPI.readPipeChunk(proc, which);
        } catch {
          break;
        }
        if (chunk === null) {
          break;
        }
        pending += chunk;
        let idx;
        while ((idx = pending.indexOf("\n")) !== -1) {
          handleLine(pending.slice(0, idx));
          pending = pending.slice(idx + 1);
        }
      }
      if (pending) {
        handleLine(pending);
      }
    };

    Promise.all([pump("stdout"), pump("stderr")]).then(() => {
      if (!settled) {
        rejectReady(new Error("backend output stream ended"));
      }
    });

    return readyPromise;
  },

  async _pollUntilHealthy(overallTimeoutMs, intervalMs, requestTimeoutMs) {
    const deadline = Date.now() + overallTimeoutMs;
    for (;;) {
      if (await this._probeHealth(requestTimeoutMs)) {
        return true;
      }
      if (Date.now() >= deadline) {
        return false;
      }
      await PowerBrowserAPI.sleep(intervalMs);
    }
  },

  _probeHealth(timeoutMs) {
    const url = `http://127.0.0.1:${this._port}${HEALTH_PATH}`;
    return PowerBrowserAPI.probeHealth(url, this._token, timeoutMs);
  },

  /**
   * Hides the loading layer and navigates the browser element exactly
   * once, via powerbrowser.js's own exposed function (reached through the
   * browser element's owner window, not a Firefox-internal import).
   *
   * 01-09: `_swapped` is set AFTER the navigation call returns, not before it.
   * This field is now what `_spawnAndGate`'s one-time initialisation block and
   * `_restart()`'s per-attempt port choice are both keyed on, so a flag that
   * could read true for a swap that threw would reintroduce the exact
   * conflation class this file was just cleaned of. The early-return guard
   * stays first, so the navigation still happens at most once.
   */
  _swap() {
    if (this._swapped) {
      return;
    }
    // NG-038: the actor's sender wall admits only this port's Theia frame.
    PowerBrowserAPI.setGroupSenderPort(this._port);
    this._browserElement.ownerDocument.defaultView.powerbrowserSwapToUrl(`http://127.0.0.1:${this._port}/`);
    this._swapped = true;
    // UPD-18 (46-01, review CR-01): the update observer pushes appUpdate over
    // the live browser element, so it attaches here, once the element carries
    // the frontend. Best-effort like the tab-store triggers in start().
    try {
      this._updateObserverOff = PowerBrowserAPI.startUpdateObserver(this._browserElement);
    } catch (err) {
      this._pushLog(`Update observer not attached: ${err && err.message ? err.message : err}`);
    }
  },

  _fatal(message) {
    this._pushLog(`FATAL: ${message}`);
    PowerBrowserAPI.log("error", `[TheiaService] ${message}`);
  },

  /**
   * Buffers one line, oldest dropped first, sized from
   * powerbrowser.sidecar.logBufferLines. Timestamped (Date.now(), not the raw
   * pipe text) so a restart's actual backoff gaps are independently
   * measurable from getRecentLog() alone -- the acceptance bar for the
   * backoff-is-observable check.
   */
  _pushLog(line) {
    const max = PowerBrowserAPI.getIntPref("powerbrowser.sidecar.logBufferLines", 500);
    // MED-02 / WINDOWS.md 10: the diagnostics ring buffer is in-app reachable
    // (SHELL-04), so a line carrying the per-launch token (it arrives on
    // every request as a Cookie header, and _pumpOutput copies stdout here
    // verbatim) must never buffer verbatim. The `this._token ?` guard is
    // load-bearing, not defensive: `_token` is null until start() mints it,
    // and `replaceAll(null, ...)` would match the literal string "null"
    // while `replaceAll("", ...)` splices the replacement between every
    // character of the line. Scope boundary: the sibling PowerBrowserAPI.log
    // mirror in _pumpOutput stays unredacted -- it goes to the browser's own
    // stdout, the same sink the text already came from, not a new surface.
    const safe = this._token ? line.replaceAll(this._token, "[redacted]") : line;
    this._log.push(`[${Date.now()}] ${safe}`);
    while (this._log.length > max) {
      this._log.shift();
    }
  },
};
