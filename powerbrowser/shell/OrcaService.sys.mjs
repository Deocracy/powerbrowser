/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Phase 62 (RUN-03, RUN-04, RUN-05; P62-01): OrcaService is the only owner of the orcad process. Like
 * TheiaService it is a consumer of the PowerBrowserAPI boundary and reaches no Firefox internal itself.
 *
 * What differs from TheiaService, and why:
 *  - Environment: orcad gets exactly what OrcaEnv.buildOrcadEnv returns (P62-04). This file spells no
 *    environment name; every one comes from OrcaEnv.
 *  - Output: orcad's stdout carries a pairing offer, a reusable credential. It goes to OrcaEnv's
 *    sink, which parses the ready line in memory and logs none of it; stderr is logged redacted.
 *  - Stop: a signal to orcad alone leaves its terminal daemon and every agent under it running, so
 *    stop() ends orcad, then the daemon, then what is left of the tree, each by pid and start ticks
 *    (P62-18). Nothing is signalled by process group or by name.
 *  - Failure: there is no user-facing copy here (P62-13). A failure is a log line and diagnostics
 *    rows; it never reaches the shell's error layer and never holds Theia back.
 *
 * Signals to a bare pid work on Linux only (the boundary's signalBarePid); elsewhere orcad itself is
 * still stopped through its process handle, and the daemon reap is Phase 68's.
 */

const { PowerBrowserAPI, PowerBrowserProcesses, PowerBrowserOrcaHosting } = ChromeUtils.importESModule("chrome://powerbrowser/content/PowerBrowserAPI.sys.mjs");
const OrcaEnv = ChromeUtils.importESModule("chrome://powerbrowser/content/OrcaEnv.sys.mjs");

const RESTART_BACKOFF_INITIAL_MS = 500;
const RESTART_BACKOFF_CAP_MS = 5000;
const DAEMON_GRACE_MS = 3000;
const POLL_MS = 100;
const SIGTERM = 15;
const SIGKILL = 9;
const MIN_NODE_MAJOR = 24;

const messageOf = err => OrcaEnv.redact(err && err.message ? err.message : String(err));

export const OrcaService = {
  _started: false,
  _shuttingDown: false,
  _state: "idle",
  _proc: null,
  _port: null,
  _pid: null,
  _pidTicks: null,
  _daemonPid: null,
  _daemonTicks: null,
  _boundEndpoint: null,
  _nodeVersion: null,
  _restartCount: 0,
  _dataRoot: null,
  _effectiveRoot: null,
  _stateFilePath: null,
  _bridgeDir: null,
  _bridgePlatform: null,
  _nodePath: null,
  _orcadMain: null,
  _webClientRoot: null,
  _panesBundle: null,
  _orcaVersion: null,
  _quitObserverOff: null,
  _reapBlockerAdded: false,
  _stopPromise: null,
  _failureRows: [],
  _log: [],
  // Phase 67 (P67-02, P67-36): what failureClassOf reads beside the state and the failure rows.
  _restarting: false,
  _offerUnavailableReason: null,
  _clientReason: null,
  _restartRun: null,

  /**
   * Starts orcad once per browser session: resolve paths, reap a previous session, spawn, wait for the
   * ready line, then supervise. Resolves when the first start has succeeded or given up; never rejects
   * for an orcad failure (those become state "failed" plus rows).
   */
  async start() {
    if (this._started) {
      this._pushLog("start() called again while already started -- refusing to start a second time.");
      return;
    }
    this._started = true;
    this._state = "starting";

    // Both quit hooks are registered before any branch that can spawn (TheiaService 01-12): a launch
    // that reaches a spawn must always have a stop path, or orcad and its agents outlive the browser.
    try {
      this._quitObserverOff = PowerBrowserAPI.onQuitGranted(() => this.stop());
    } catch (err) {
      this._pushLog(`Quit observer not registered: ${messageOf(err)}`);
    }
    if (!this._reapBlockerAdded) {
      this._reapBlockerAdded = true;
      try {
        const reapBlocker = () => this.stopAndReap();
        PowerBrowserProcesses.addNamedReapBlocker(OrcaEnv.ORCAD_REAP_BLOCKER_NAME, reapBlocker);
      } catch (err) {
        this._pushLog(`Reap blocker not registered: ${messageOf(err)}`);
      }
    }

    await this._startSequence();
  },

  /** Resolve, reap, launch: start()'s sequence, which restart() runs again (P67-06). */
  async _startSequence() {
    if (!(await this._resolve())) {
      return;
    }
    if (!(await this._preflight())) {
      return;
    }
    await this._reapLeftover({ includeDaemon: true });
    await this._launch();
  },

  /**
   * Phase 67 (RUN-09, P67-16, P67-17): refuses before anything is reaped or spawned. orcad stores
   * sign-ins without encryption when its data root is in a temporary folder or when the plaintext
   * override is set; PowerBrowser refuses both instead. Both roots are compared lexically and
   * resolved, against Gecko's TmpD, the temp-folder variables and the fixed temp folders, each also
   * resolved, so a symlink cannot hide a temporary folder. Returns false after recording the refusal.
   */
  async _preflight() {
    const platform = this._bridgePlatform;
    const real = path => PowerBrowserOrcaHosting.realPath(path);
    const roots = [
      PowerBrowserOrcaHosting.tempDir(),
      ...(OrcaEnv.ORCA_TEMP_ENV_NAMES[platform] ?? []).map(name => PowerBrowserAPI.getEnv(name)),
      ...(OrcaEnv.ORCA_FIXED_TEMP_ROOTS[platform] ?? []),
    ]
      .filter(root => typeof root === "string" && root !== "")
      .flatMap(root => [root, real(root)]);
    const paths = [this._dataRoot, this._effectiveRoot].flatMap(path => [path, real(path)]);
    const root = OrcaEnv.tempRootOf({ paths, roots, platform });
    if (root) {
      return this._fail("checking for a temporary profile folder", [["Orca temporary folder", root]]);
    }
    const { name, value } = OrcaEnv.ORCA_PLAINTEXT_OVERRIDE;
    const set = PowerBrowserAPI.getEnv(name);
    if (set === value) {
      return this._fail("checking the Orca sign-in storage setting", [["Orca setting", `${name}=${value}`]]);
    }
    if (set) {
      // Orca acts on the one value only; any other is ignored there and here.
      this._pushLog(`${name} is set to a value Orca ignores; starting Orca as usual.`);
    }
    return true;
  },

  /**
   * Phase 67 (P67-06): Restart Orca from the failure page. Acts only in the failed state: clears the
   * failure, then runs start()'s sequence again with a fresh attempt count, without waiting for it.
   * Anywhere else it logs one line and answers false, so a working orcad is never restarted.
   */
  async restart() {
    if (this._state !== "failed" || this._shuttingDown) {
      this._pushLog(`restart ignored: Orca is ${this._state}`);
      return false;
    }
    this._state = "starting";
    this._failureRows = [];
    this._restarting = false;
    this._pushLog("Restart requested from the Orca failure page.");
    this._restartRun = this._startSequence().catch(err => this.reportUnexpectedFailure(err));
    return true;
  },

  /** Resolves every path and value a spawn needs. Returns false after recording the failure. */
  async _resolve() {
    const profileDir = PowerBrowserAPI.getProfileDir();
    if (!profileDir) {
      // Never a home-directory fallback: orcad's data must sit under this profile or nowhere.
      return this._fail("resolving the profile folder", []);
    }
    this._dataRoot = OrcaEnv.dataRootFor(profileDir);
    this._stateFilePath = `${this._dataRoot}/${OrcaEnv.ORCAD_STATE_FILE_NAME}`;
    try {
      await PowerBrowserAPI.ensureDirectory(this._dataRoot);
    } catch (err) {
      return this._fail("creating the Orca data folder", [["Orca error", messageOf(err)]]);
    }

    this._effectiveRoot = this._dataRoot;
    if (!OrcaEnv.socketPathFits(this._dataRoot)) {
      const alias = await this._makeAlias();
      if (!alias) {
        return false;
      }
      this._effectiveRoot = alias;
    }

    // Phase 63 (D-31, P63-35): the private folder chrome and the Theia backend share for hand-off files.
    // TheiaService builds the same path from the same builders. orcad itself never needs it, so a folder
    // that cannot be chosen costs the agent wrapper its data root, not the start.
    this._bridgePlatform = OrcaEnv.nodePlatform(PowerBrowserProcesses.platform());
    this._bridgeDir = await OrcaEnv.bridgeDirFor(this._dataRoot, name => PowerBrowserAPI.getEnv(name), this._bridgePlatform);
    if (!this._bridgeDir) {
      this._pushLog("Orca bridge folder not available; the agent wrapper and Orca tabs cannot find this Orca");
    }

    // The same Node rule as the Theia sidecar, on the same pref, so the two cannot diverge (D-14).
    // Linux and macOS stage <appDir>/node/bin/node; Windows stages <appDir>/node/node.exe (package-windows.sh).
    const appDir = PowerBrowserAPI.getAppDir();
    let stagedNode = appDir ? `${appDir}/node/bin/node` : "";
    if (stagedNode && !(await PowerBrowserAPI.pathExists(stagedNode))) stagedNode = `${appDir}/node/node.exe`;
    const configured = PowerBrowserAPI.getStringPref("powerbrowser.sidecar.nodePath", "");
    const useStagedNode =
      !PowerBrowserAPI.prefHasUserValue("powerbrowser.sidecar.nodePath") && stagedNode && (await PowerBrowserAPI.pathExists(stagedNode));
    this._nodePath = (useStagedNode ? stagedNode : configured) || (await PowerBrowserAPI.pathSearch("node"));
    if (!this._nodePath) {
      return this._fail("finding Node.js", []);
    }

    // As TheiaService does for its backend (NG-063): a packaged install's own copy beside the binary
    // wins unless the user set a path; the build default names the dev tree, which a packaged
    // install must never run code from.
    const stagedRoot = appDir ? `${appDir}/orca` : "";
    const orcaRoot =
      !PowerBrowserAPI.prefHasUserValue("powerbrowser.orca.root") && stagedRoot && (await PowerBrowserAPI.pathExists(`${stagedRoot}/out/orcad/orcad.js`))
        ? stagedRoot
        : PowerBrowserAPI.getStringPref("powerbrowser.orca.root", "");
    this._orcadMain = `${orcaRoot}/out/orcad/orcad.js`;
    this._webClientRoot = `${orcaRoot}/out/web`;
    for (const path of [this._orcadMain, this._webClientRoot]) {
      if (!orcaRoot || !(await PowerBrowserAPI.pathExists(path))) {
        return this._fail("finding the built Orca files", [["Orca entry file", path]]);
      }
    }
    const pkg = await PowerBrowserAPI.readStateFile(`${orcaRoot}/package.json`);
    if (!pkg || typeof pkg.version !== "string" || !pkg.version) {
      return this._fail("reading the Orca version", [["Orca missing path", `${orcaRoot}/package.json`]]);
    }
    this._orcaVersion = pkg.version;

    // Fallback 0 is outside the valid range on purpose: a missing pref is a named failure here, not
    // a second copy of the default.
    this._port = PowerBrowserAPI.getIntPref("powerbrowser.orca.port", 0);
    try {
      OrcaEnv.buildOrcadArgs({ orcadMain: this._orcadMain, port: this._port, webClientRoot: this._webClientRoot });
    } catch (err) {
      return this._fail("reading the Orca port", [["Orca port", this._port], ["Orca error", messageOf(err)]]);
    }
    return true;
  },

  /**
   * The data root is too long for orcad's socket path: link a short alias to it (P62-19). Made again
   * on every launch; ln -sfnT replaces a stale link and refuses to write into a real directory.
   */
  async _makeAlias() {
    const getEnv = name => PowerBrowserAPI.getEnv(name);
    const alias = await OrcaEnv.aliasPathFor(this._dataRoot, getEnv);
    if (!alias || !OrcaEnv.socketPathFits(alias)) {
      this._fail("choosing a short path for the Orca data folder", [["Orca data root", this._dataRoot]]);
      return null;
    }
    try {
      await PowerBrowserAPI.ensureDirectory(alias.slice(0, alias.lastIndexOf("/")));
      const ln = await PowerBrowserAPI.pathSearch("ln");
      if (!ln) {
        throw new Error("no ln on the search path");
      }
      const linker = await PowerBrowserProcesses.spawnProcessExact({
        command: ln,
        args: ["-sfnT", this._dataRoot, alias],
        environment: OrcaEnv.buildToolEnv(getEnv),
      });
      const { exitCode } = await linker.wait();
      if (exitCode !== 0) {
        throw new Error(`ln exited ${exitCode}`);
      }
    } catch (err) {
      this._fail("linking a short path to the Orca data folder", [["Orca short path", alias], ["Orca error", messageOf(err)]]);
      return null;
    }
    return alias;
  },

  /** True when `pid` is alive and its start ticks equal the recorded value (D-111). */
  async _sameIdentity(pid, ticks) {
    if (!Number.isInteger(pid) || pid <= 0 || ticks === null || ticks === undefined) {
      return false;
    }
    if (!PowerBrowserAPI.signalBarePid(pid, 0)) {
      return false;
    }
    const observed = await PowerBrowserAPI.readProcessStartTicks(pid);
    if (observed === null || String(observed) !== String(ticks)) {
      this._pushLog(`pid ${pid} is alive but its start ticks differ (recorded ${ticks}, observed ${observed}): a recycled pid, not signalled.`);
      return false;
    }
    return true;
  },

  /** Polls until `pid` is no longer the recorded process or `graceMs` has passed; true when gone. */
  async _waitGone(pid, ticks, graceMs) {
    for (let waited = 0; waited < graceMs; waited += POLL_MS) {
      if (!(await this._sameIdentity(pid, ticks))) {
        return true;
      }
      await PowerBrowserAPI.sleep(POLL_MS);
    }
    return !(await this._sameIdentity(pid, ticks));
  },

  /** SIGTERM, wait, SIGKILL, for one verified identity. Returns true when it was signalled at all. */
  async _endIdentity(pid, ticks, graceMs, what) {
    if (!(await this._sameIdentity(pid, ticks))) {
      return false;
    }
    PowerBrowserAPI.signalBarePid(pid, SIGTERM);
    if (!(await this._waitGone(pid, ticks, graceMs))) {
      PowerBrowserAPI.signalBarePid(pid, SIGKILL);
      this._pushLog(`${what} pid ${pid} ignored the stop request for ${graceMs} ms and was killed.`);
    } else {
      this._pushLog(`${what} pid ${pid} stopped.`);
    }
    return true;
  },

  /** SIGKILL for every snapshot row that is still the process it was when the snapshot was taken. */
  async _killSnapshot(rows, exceptPid) {
    for (const row of rows) {
      if (row.pid !== exceptPid && (await this._sameIdentity(row.pid, row.startTicks))) {
        PowerBrowserAPI.signalBarePid(row.pid, SIGKILL);
        this._pushLog(`Leftover process pid ${row.pid} was killed.`);
      }
    }
  },

  /** The terminal daemon and everything under it: snapshot, SIGTERM the daemon, wait, kill leftovers. */
  async _endDaemon(pid, ticks, extraRows = []) {
    const matches = await this._sameIdentity(pid, ticks);
    const rows = [...extraRows, ...(matches ? await PowerBrowserProcesses.listProcessTree([pid]) : [])];
    if (matches) {
      PowerBrowserAPI.signalBarePid(pid, SIGTERM);
    }
    for (let waited = 0; waited < DAEMON_GRACE_MS; waited += POLL_MS) {
      let alive = false;
      for (const row of rows) {
        alive = alive || PowerBrowserAPI.signalBarePid(row.pid, 0);
      }
      if (!alive) {
        break;
      }
      await PowerBrowserAPI.sleep(POLL_MS);
    }
    await this._killSnapshot(rows, null);
  },

  /**
   * Reaps what a previous session left (P62-08, P62-18), by pid plus start ticks from two records:
   * this service's own state file and orcad's own lock. A pid whose ticks differ is logged and never
   * signalled. Only this service's state file is removed; orcad's lock and sockets are orcad's to
   * reclaim. includeDaemon is false on a respawn after an orcad crash, so the surviving daemon and
   * its terminals are adopted by the new orcad; only a quit ends agents (D-07).
   */
  async _reapLeftover({ includeDaemon }) {
    const graceMs = PowerBrowserAPI.getIntPref("powerbrowser.orca.killGraceMs", 16000);
    const own = await PowerBrowserAPI.readStateFile(this._stateFilePath);
    const lock = await PowerBrowserAPI.readStateFile(`${this._dataRoot}/${OrcaEnv.ORCAD_LOCK_FILE_NAME}`);
    if (own) {
      await this._endIdentity(own.orcadPid, own.orcadTicks, graceMs, "Leftover orcad");
    }
    if (lock) {
      await this._endIdentity(lock.pid, lock.linuxStartTicks, graceMs, "Leftover orcad");
    }
    if (own && includeDaemon) {
      await this._endDaemon(own.daemonPid, own.daemonTicks);
      try {
        await PowerBrowserAPI.removeStateFile(this._stateFilePath);
      } catch {
        // Best-effort: a stale record names identities that no longer match anything.
      }
    }
  },

  /** Spawn attempts with TheiaService's backoff, on the same port every time. */
  async _launch() {
    const giveUpAttempts = PowerBrowserAPI.getIntPref("powerbrowser.orca.giveUpAttempts", 5);
    let backoffMs = RESTART_BACKOFF_INITIAL_MS;
    for (let attempt = 1; ; attempt += 1) {
      if (this._shuttingDown) {
        return;
      }
      const result = await this._spawnAndGate();
      if (result.ok || this._shuttingDown) {
        return;
      }
      if (!result.recoverable || attempt >= giveUpAttempts) {
        this._fail(result.step, [...result.rows, ["Orca start attempts", attempt]]);
        return;
      }
      this._pushLog(`orcad start attempt ${attempt} failed (${result.step}); waiting ${backoffMs} ms.`);
      await PowerBrowserAPI.sleep(backoffMs);
      backoffMs = Math.min(backoffMs * 2, RESTART_BACKOFF_CAP_MS);
      await this._reapLeftover({ includeDaemon: false });
    }
  },

  /** One spawn through to a verified ready line. Returns { ok } or { ok: false, recoverable, step, rows }. */
  async _spawnAndGate() {
    const graceMs = PowerBrowserAPI.getIntPref("powerbrowser.orca.killGraceMs", 16000);
    // Phase 68 (D-30, P68-38): read at every spawn, so a disable in Theia applies at the next orcad start.
    const profileDir = PowerBrowserAPI.getProfileDir();
    const backendSettings = await PowerBrowserAPI.readStateFile(OrcaEnv.theiaBackendSettingsPath(profileDir));
    const environment = OrcaEnv.buildOrcadEnv(name => PowerBrowserAPI.getEnv(name), {
      dataRoot: this._effectiveRoot,
      orcaVersion: this._orcaVersion,
      claudeAgentSdkDir: OrcaEnv.claudeAgentSdkDir({ profileDir, backendSettings }),
    });
    this._pushLog(`Claude agent SDK extension: ${environment[OrcaEnv.ORCAD_CLAUDE_AGENT_SDK_DIR_ENV] ? "enabled" : "disabled"}`);
    const args = OrcaEnv.buildOrcadArgs({ orcadMain: this._orcadMain, port: this._port, webClientRoot: this._webClientRoot });

    let proc;
    try {
      proc = await PowerBrowserProcesses.spawnProcessExact({ command: this._nodePath, args, environment, workdir: this._effectiveRoot });
    } catch (err) {
      return { ok: false, recoverable: false, step: "starting the orcad process", rows: [["Orca error", messageOf(err)]] };
    }
    this._proc = proc;
    const endOwn = async () => {
      try {
        await PowerBrowserAPI.killProcess(proc, graceMs);
      } catch {
        // Already exited.
      }
    };
    if (this._shuttingDown) {
      // stop() ran while the spawn was in flight and saw no process to end.
      await endOwn();
      return { ok: false, recoverable: false, step: "stopping", rows: [] };
    }

    const stderrTail = [];
    // Phase 64 (P64-07): this start's pairing offer, held only until _writeHandOff writes it.
    let offer = null;
    const sink = OrcaEnv.createOutputSink({
      onOffer: value => {
        offer = value;
      },
      // Phase 67 (P67-02): a reason code from the pinned set or null; no other pairing field.
      onOfferUnavailable: reason => {
        this._offerUnavailableReason = reason;
      },
      pushLog: line => {
        stderrTail.push(line);
        if (stderrTail.length > 40) {
          stderrTail.shift();
        }
        this._pushLog(line);
      },
    });
    // stdout goes to the sink and nowhere else; see the file header.
    void this._pump(proc, "stdout", chunk => sink.onStdout(chunk));
    const stderrDone = this._pump(proc, "stderr", chunk => sink.onStderr(chunk));

    const startupTimeoutMs = PowerBrowserAPI.getIntPref("powerbrowser.orca.startupTimeoutMs", 60000);
    const outcome = await Promise.race([
      sink.ready().then(ready => ({ ready })),
      proc.wait().then(
        r => ({ exitCode: r ? r.exitCode : null }),
        () => ({ exitCode: null })
      ),
      PowerBrowserAPI.sleep(startupTimeoutMs).then(() => ({ timeout: true })),
    ]);

    if (outcome.timeout) {
      await endOwn();
      return { ok: false, recoverable: true, step: "waiting for orcad to report ready", rows: [["Orca startup timeout", `${startupTimeoutMs} ms`]] };
    }
    if (!outcome.ready) {
      await Promise.race([stderrDone, PowerBrowserAPI.sleep(500)]);
      const text = stderrTail.join("\n");
      const code = [OrcaEnv.ORCAD_PINNED_PORT_CODE, OrcaEnv.ORCAD_LOCK_HELD_CODE].find(c => text.includes(c));
      const rows = [["Orca exit code", outcome.exitCode], ["Orca port", this._port]];
      if (code) {
        // A busy port stays busy and a held lock survived the reap: another attempt changes nothing,
        // and adopting whatever answers on the port is never an option.
        return { ok: false, recoverable: false, step: "starting orcad", rows: [["Orca failure code", code], ...rows] };
      }
      return { ok: false, recoverable: true, step: "starting orcad", rows };
    }

    const ready = outcome.ready;
    const nodeMajor = Number(/^v?(\d+)\./.exec(ready.nodeVersion ?? "")?.[1]);
    if (!OrcaEnv.isLoopbackEndpoint(ready.boundEndpoint, this._port)) {
      await endOwn();
      return { ok: false, recoverable: false, step: "checking that orcad is bound to loopback", rows: [["Orca bound address", String(ready.boundEndpoint)], ["Orca port", this._port]] };
    }
    if (!(nodeMajor >= MIN_NODE_MAJOR)) {
      await endOwn();
      return { ok: false, recoverable: false, step: "checking the Node.js version orcad runs on", rows: [["Orca Node.js version", String(ready.nodeVersion)]] };
    }

    this._pid = proc.pid;
    this._pidTicks = await PowerBrowserAPI.readProcessStartTicks(this._pid);
    this._daemonPid = ready.daemonPid;
    this._daemonTicks = ready.daemonPid ? await PowerBrowserAPI.readProcessStartTicks(ready.daemonPid) : null;
    this._boundEndpoint = ready.boundEndpoint;
    this._nodeVersion = ready.nodeVersion;
    try {
      await PowerBrowserAPI.writeStateFile(this._stateFilePath, {
        orcadPid: this._pid,
        orcadTicks: this._pidTicks,
        daemonPid: this._daemonPid,
        daemonTicks: this._daemonTicks,
        port: this._port,
        writtenAt: Date.now(),
      });
    } catch (err) {
      // The next launch still finds orcad through its own lock; only the daemon record is lost.
      this._pushLog(`State file not written: ${messageOf(err)}`);
    }
    // Phase 63 (P63-26): after ready, so the EXT-02 wrapper never finds a data root no orcad serves yet.
    if (this._bridgeDir) {
      try {
        await PowerBrowserProcesses.writePrivateFile(this._bridgeDir, OrcaEnv.ORCAD_DATA_ROOT_FILE, `${this._effectiveRoot}\n`);
      } catch (err) {
        // The agent wrapper needs it; orcad itself runs without it.
        this._pushLog(`Orca data root file not written: ${messageOf(err)}`);
      }
    }
    await this._writeHandOff(offer);
    offer = null;
    this._state = "ready";
    this._failureRows = [];
    this._restarting = false;
    // A new orcad start is a new pairing: a client failure reported against the old one is over.
    this._clientReason = null;
    this._pushLog(`orcad ready on ${OrcaEnv.ORCAD_BIND_HOST}:${this._port}, pid ${this._pid}, terminal daemon pid ${this._daemonPid}.`);
    void this._supervise(proc);
    return { ok: true };
  },

  /**
   * Phase 64 (P64-06, P64-07, P64-34): the two bridge-folder files the Theia backend reads, after
   * ready: this start's pairing offer and the pane bundle folder (only when it exists). Each failure
   * is one log line, never a start failure; the offer itself is never logged.
   */
  async _writeHandOff(offer) {
    if (!this._bridgeDir) {
      return;
    }
    if (offer) {
      try {
        await PowerBrowserProcesses.writePrivateFile(this._bridgeDir, OrcaEnv.ORCA_WEB_PAIRING_FILE, `${offer}\n`);
      } catch (err) {
        this._pushLog(`Orca pairing file not written: ${messageOf(err)}`);
      }
    } else {
      this._pushLog("orcad reported no pairing offer; Orca tabs cannot open.");
    }
    const panesDir = `${this._webClientRoot}/${OrcaEnv.ORCA_PANES_DIR_REL}`;
    if (!(await PowerBrowserAPI.pathExists(panesDir))) {
      this._panesBundle = "not built";
      this._pushLog("Orca tabs bundle not built; Orca tabs cannot open.");
      return;
    }
    this._panesBundle = panesDir;
    try {
      await PowerBrowserProcesses.writePrivateFile(this._bridgeDir, OrcaEnv.ORCA_PANES_DIR_FILE, `${panesDir}\n`);
    } catch (err) {
      this._pushLog(`Orca tabs bundle file not written: ${messageOf(err)}`);
    }
  },

  /** An exit nobody asked for: start again on the same port, adopting the surviving daemon. */
  async _supervise(proc) {
    try {
      await proc.wait();
    } catch {
      // A rejected wait means the handle is already dead.
    }
    if (this._shuttingDown || this._proc !== proc) {
      return;
    }
    this._restartCount += 1;
    this._state = "starting";
    this._restarting = true;
    this._pid = null;
    this._pidTicks = null;
    this._pushLog(`orcad exited unexpectedly; restarting (restart ${this._restartCount}).`);
    try {
      await this._reapLeftover({ includeDaemon: false });
      await this._launch();
    } catch (err) {
      this.reportUnexpectedFailure(err);
    }
  },

  async _pump(proc, which, onChunk) {
    try {
      for (;;) {
        const chunk = await PowerBrowserAPI.readPipeChunk(proc, which);
        if (chunk === null) {
          return;
        }
        onChunk(chunk);
      }
    } catch {
      // The pipe closed with the process.
    }
  },

  /**
   * Quit: ends orcad, then the terminal daemon, then every remaining descendant (P62-18, D-07). The
   * tree is listed before orcad is signalled, while the daemon is still orcad's child. Returns the
   * promise stopAndReap awaits; safe to call twice.
   */
  stop() {
    if (this._shuttingDown) {
      return this._stopPromise;
    }
    this._shuttingDown = true;
    this._stopPromise = this._stopTree().catch(err => {
      this._pushLog(`Stop failed: ${messageOf(err)}`);
    });
    return this._stopPromise;
  },

  async _stopTree() {
    // Phase 64 (P64-34, 64-06): the data-root, pairing and bundle files go first. Nothing in them is needed once
    // stop begins, and a quit may end the process before the kill waits below return, which left them behind.
    for (const name of this._bridgeDir ? [OrcaEnv.ORCAD_DATA_ROOT_FILE, OrcaEnv.ORCA_WEB_PAIRING_FILE, OrcaEnv.ORCA_PANES_DIR_FILE] : []) {
      try {
        await PowerBrowserAPI.removeStateFile(OrcaEnv.bridgeFileFor(this._bridgeDir, name, this._bridgePlatform));
      } catch {
        // Best-effort; the next ready overwrites them.
      }
    }
    const graceMs = PowerBrowserAPI.getIntPref("powerbrowser.orca.killGraceMs", 16000);
    const proc = this._proc && this._proc.exitCode == null ? this._proc : null;
    const orcadPid = proc ? proc.pid : null;
    const tree = orcadPid ? await PowerBrowserProcesses.listProcessTree([orcadPid]) : [];
    if (proc) {
      try {
        void PowerBrowserAPI.killProcess(proc, graceMs).catch(() => {});
      } catch {
        // Already exited.
      }
      if (!(await PowerBrowserAPI.waitForExit(proc, graceMs + 500))) {
        this._pushLog(`orcad pid ${orcadPid} is still alive after ${graceMs} ms.`);
      }
    }
    this._proc = null;
    await this._endDaemon(this._daemonPid, this._daemonTicks, tree.filter(row => row.pid !== orcadPid));
    if (this._stateFilePath) {
      try {
        await PowerBrowserAPI.removeStateFile(this._stateFilePath);
      } catch {
        // Best-effort; the next launch's reap verifies identity anyway.
      }
    }
    this._state = "stopped";
    this._pid = null;
    this._daemonPid = null;
    // Detached last, once nothing supervised is left (TheiaService 01-12).
    if (this._quitObserverOff) {
      this._quitObserverOff();
      this._quitObserverOff = null;
    }
  },

  /** The quit and restart blocker. Bounded, loud on timeout, never rejects. */
  async stopAndReap() {
    const graceMs = PowerBrowserAPI.getIntPref("powerbrowser.orca.killGraceMs", 16000);
    const live = `orcad pid ${this._pid}, terminal daemon pid ${this._daemonPid}`;
    try {
      if (!this._shuttingDown) {
        this.stop();
      }
      const done = await Promise.race([
        (this._stopPromise ?? Promise.resolve()).then(() => true),
        PowerBrowserAPI.sleep(graceMs + 4500).then(() => false),
      ]);
      if (!done) {
        PowerBrowserAPI.log("error", `[OrcaService] stop did not finish within ${graceMs + 4500} ms (${live}); shutdown continues without it.`);
      }
    } catch (err) {
      PowerBrowserAPI.log("error", `[OrcaService] reap failed (${err && err.name ? err.name : "error"}); shutdown continues without it.`);
    }
  },

  /** State for checks and later phases. Carries no credential: there is no pairing field to carry. */
  getState() {
    return {
      state: this._state,
      port: this._port,
      pid: this._pid,
      daemonPid: this._daemonPid,
      boundEndpoint: this._boundEndpoint,
      nodeVersion: this._nodeVersion,
      restartCount: this._restartCount,
      dataRoot: this._dataRoot,
      effectiveRoot: this._effectiveRoot,
      bridgeDir: this._bridgeDir,
      orcaVersion: this._orcaVersion,
      failureClass: this._failureClass(),
    };
  },

  /** Phase 67 (P67-03): the one class for the current state, through OrcaEnv. */
  _failureClass() {
    const row = label => (this._failureRows.find(([l]) => l === label) ?? [])[1];
    // Shorthand on purpose: orca-failure-classes reads every "step:" property as a failed-step literal.
    const step = row("Orca failed step");
    return OrcaEnv.failureClassOf({
      state: this._state,
      restarting: this._restarting,
      step,
      code: row("Orca failure code"),
      offerUnavailableReason: this._offerUnavailableReason,
      clientReason: this._clientReason,
    });
  },

  /**
   * Phase 67 (P67-04, P67-36): a failure the frontend saw, from the closed set OrcaEnv.isClientReason
   * admits. Kept for the class and the diagnostics rows until orcad's next ready line.
   */
  reportClientFailure(reason) {
    if (!OrcaEnv.isClientReason(reason)) {
      this._pushLog("A client failure with an unknown reason was ignored.");
      return false;
    }
    this._clientReason = reason;
    this._pushLog(`Orca client reported ${reason}.`);
    return true;
  },

  getRecentLog() {
    return this._log.slice();
  },

  /** [label, value] rows for the diagnostics layer; a value not known yet contributes no row. */
  getDiagnosticRows() {
    const rows = [
      ["Orca state", this._state],
      ["Orca port", this._port],
      ["Orca process ID", this._pid],
      ["Orca terminal daemon", this._daemonPid],
      ["Orca data root", this._dataRoot],
      // Null once the start resolved means no folder could be chosen; before that the row is left out.
      ["Orca bridge folder", this._bridgeDir ?? (this._dataRoot ? "not available" : null)],
      ["Orca tabs bundle", this._panesBundle],
      // Phase 67 (P67-05, P67-36): codes only, never an offer, a device token or a credential.
      ["Orca restart count", this._restartCount],
      [
        "Orca pairing failure",
        this._offerUnavailableReason ?? (this._clientReason && this._clientReason !== OrcaEnv.ORCA_BROWSER_HOST_REASON ? this._clientReason : null),
      ],
      ["Orca browser host", this._clientReason === OrcaEnv.ORCA_BROWSER_HOST_REASON ? this._clientReason : null],
      // P67-19: shared with any other headless orcad this user runs; recorded, not changed.
      [
        "Orca credential key folder",
        OrcaEnv.credentialKeyFolderFor(name => PowerBrowserAPI.getEnv(name), OrcaEnv.nodePlatform(PowerBrowserProcesses.platform())),
      ],
      ...this._failureRows,
    ];
    return rows
      .filter(([, value]) => value !== null && value !== undefined && value !== "")
      .map(([label, value]) => [label, typeof value === "string" ? OrcaEnv.redact(value) : value]);
  },

  /** The terminal handler for a rejection out of start(): a log line and a row, nothing on screen. */
  reportUnexpectedFailure(err) {
    this._fail("an unexpected error", [["Orca error", messageOf(err)]]);
  },

  /** Records a failure as state, rows and one log line. Always returns false. */
  _fail(step, rows) {
    this._state = "failed";
    this._restarting = false;
    this._failureRows = [["Orca failed step", step], ...rows];
    this._pushLog(`orcad not running: ${this._failureRows.map(([label, value]) => `${label}: ${value}`).join("; ")}`);
    return false;
  },

  _pushLog(line) {
    const max = PowerBrowserAPI.getIntPref("powerbrowser.orca.logBufferLines", 200);
    const safe = OrcaEnv.redact(line);
    this._log.push(`[${Date.now()}] ${safe}`);
    while (this._log.length > max) {
      this._log.shift();
    }
    PowerBrowserAPI.log("log", `[OrcaService] ${safe}`);
  },
};
