#!/usr/bin/env node
// scripts/verify-shell-error-contract.mjs
//
// shell-error-contract -- 01-11, extended by 01-12 and 01-13.
//
// The error state's behavioural contract, driven against the shipped supervisor
// and the shipped chrome bootstrap. Four scenarios, all four closing a clause
// 01-VERIFICATION.md recorded FAILED.
//
// (1) The REPAINT contract: a Retry that fails must put the error
// layer back. 01-VERIFICATION.md recorded that clause FAILED (truth 2c). The
// root cause was two owners for one fact -- the chrome bootstrap's Retry global
// blanked the error element itself while the supervisor's `_errorShown` repaint
// guard stayed set, so the FIRST failing Retry left the DOM blank and the guard
// swallowed every later repaint for the life of the session: no message, no
// Retry, no Details, forever.
//
// This shipped green through three full verification runs because no registered
// check ever observes a SECOND error sentinel. verify-platform.sh's
// shell03-budget-exhausted-error asserts there is exactly ONE, which is correct
// for the launch it drives and blind to this one.
//
// HOW THIS ASSERTS. It does not re-implement the supervisor and it does not
// text-transform either source. It EVALUATES both shipped files in-process:
//
//   * the supervisor is `await import()`ed with `globalThis.ChromeUtils` faked,
//     so its own top-level `ChromeUtils.importESModule` resolves against a fake
//     PowerBrowserAPI with no edit to the file. A distinct cache-busting query
//     per scenario gives each scenario a fresh module instance with fresh
//     per-launch fields.
//   * the chrome bootstrap is run through `node:vm` against a sandbox that is
//     also its own `window`, so its `window.powerbrowser*` assignments land
//     where the supervisor can reach them. Firing the captured
//     `DOMContentLoaded` handler IS the drive -- the handler calls
//     `TheiaService.start()` itself, so the entry point stays under test rather
//     than under simulation.
//
// The fake PowerBrowserAPI is a Proxy whose unknown-property trap THROWS naming
// the method, so a supervisor change that reaches a new boundary method goes red
// naming it instead of being silently satisfied.
//
// Before any scenario runs, the analyzer proves the two sentinel prefixes it
// reads are emitted by `dump(` call sites in the file under test, so a match
// could never come from the harness's own instrumentation. The only
// instrumentation here is a recording `dump`, and every line it records was
// written by the code under test.
//
// Scenario `two-consecutive-failing-retries-repaint`: drive a launch on the
// RECOVERABLE class -- the class that OFFERS Retry -- then click Retry twice.
// 01-13 retargeted it there from the spawn-throw drive, which `_spawnAndGate`
// classifies unrecoverable at its D-113 site: under 01-13's supervisor guard a
// Retry against that class is a no-op by design, so the old drive would have
// gone red for the wrong reason. The repaint contract is a statement about the
// class the interface is willing to retry, so that is where it belongs, and the
// unrecoverable class is covered by scenario (4) below instead. A recorded
// classification guard stops the drive drifting silently back.
// The error-family sentinel stream must read, IN ORDER:
//   POWERBROWSER_SHELL_ERROR, POWERBROWSER_SHELL_ERROR_CLEARED,
//   POWERBROWSER_SHELL_ERROR, POWERBROWSER_SHELL_ERROR_CLEARED,
//   POWERBROWSER_SHELL_ERROR
// -- five presence assertions, never an absence assertion. A shape assertion
// rides along: every recorded error sentinel's JSON must carry exactly the keys
// `reason` and `recoverable`, the same anchored contract
// shell03-budget-exhausted-error enforces on the first sentinel, so a repaint
// that starts leaking a key (the per-launch token above all) goes red here too.
//
// (2)+(3) THE PROBE GATE, 01-12 (failed truth 2d). `_showError` received a
// `recoverable` classification and started D-115's background recovery probe
// regardless, so the one class the supervisor's own D-113 comment calls
// "unrecoverable by construction ... with no retry at all" drove a process spawn
// every probe interval, for the life of the session, against a `_configDir` and
// a `_stateFilePath` that branch returns before ever assigning.
//
// The gate is asserted in BOTH directions, because only one direction is a
// convenient half-truth: `unrecoverable-classification-starts-no-probe` requires
// ZERO probe-driven spawns after an error state whose `recoverable` was false,
// and `recoverable-classification-starts-the-probe` -- the positive control --
// requires AT LEAST ONE after an error state whose `recoverable` was true. A fix
// that simply stopped probing everywhere passes the first and fails the second,
// which is what stops the gate being satisfied by never probing at all.
//
// The instrument is a counter on the fake boundary's own spawn stub, so it
// counts calls THE SUPERVISOR MADE, never a line this harness printed. It is
// causal rather than temporal -- "spawns that happened after the error sentinel
// was recorded" -- because with the fake sleep resolving immediately the probe
// is a pure microtask loop that burns its entire sleep budget inside one
// microtask drain, long before any `setImmediate` turn the harness could read a
// counter on. That is also why the two scenarios share ONE drain constant: the
// negative side's zero is only meaningful because the positive side proves the
// same drain is long enough for the probe to have run.
//
// (4) THE USER-DRIVEN ROUTE, 01-13 (the same failed truth 2d, re-scoped by
// 01-REVIEW.md's CR-01). The classification gated the probe TIMER and nothing
// else: `retry()` re-entered `_restart()` unconditionally, so the unrecoverable
// class was re-entered by the single control the error screen offered, and every
// such click ran `_hideError()` on the way past, nulling `_failureDetails` --
// erasing the only evidence the user had left. Scenario
// `unrecoverable-classification-refuses-the-retry-click` drives that exact
// click, calling the window global DIRECTLY rather than through the button, so a
// fix that only hid the control cannot satisfy it. It asserts zero spawns,
// unchanged diagnostic rows, and the control absent -- three separate facts, one
// planted fault each in --self-test.
//
// This is what verify-platform.sh's `check_shell03_unrecoverable_immediate_error`
// could not see. It asserts an unrecoverable classification reaches no spawn
// ATTEMPT within its 15-second window, and it is green because the probe's first
// interval had not elapsed yet -- correct for the window it drives, blind to the
// second one.
//
// WHAT THIS DOES NOT PROVE. It proves the supervisor/bootstrap contract and the
// sentinel ordering under Node. It does not prove the pixels. The perceptual
// half -- a human clicking Retry in a real window and seeing the error layer
// come back -- stays on the WINDOWS.md human record, because chrome-context
// Marionette is platform-blocked on Linux (ledger item 7).
//
// Usage:
//   node scripts/verify-shell-error-contract.mjs [--file <path>] [--shell-file <path>]
//   node scripts/verify-shell-error-contract.mjs --self-test
//
// Exit 0 pass, 1 fail. --self-test runs a clean control against the unmutated
// tree FIRST (a self-test whose fixture is already red proves nothing about its
// plants), then plants nine faults and requires each to go red naming the
// drift.

import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import { createContext, runInContext } from "node:vm";

const SELF = fileURLToPath(import.meta.url);
const REPO_ROOT = join(dirname(SELF), "..");
const DEFAULT_SUPERVISOR = join(REPO_ROOT, "powerbrowser/shell/TheiaService.sys.mjs");
const DEFAULT_SHELL = join(REPO_ROOT, "powerbrowser/shell/powerbrowser.js");

// The two sentinel prefixes this analyzer reads. They are NOT an expectation:
// assertEmitters below first proves each one is emitted by a `dump(` in the
// chrome bootstrap under test, and fails by name when it is not.
const ERROR_SENTINEL = "POWERBROWSER_SHELL_ERROR";
const CLEARED_SENTINEL = "POWERBROWSER_SHELL_ERROR_CLEARED";

const SCENARIO = "two-consecutive-failing-retries-repaint";
const SCENARIO_NO_PROBE = "unrecoverable-classification-starts-no-probe";
const SCENARIO_PROBE = "recoverable-classification-starts-the-probe";
const SCENARIO_REFUSES = "unrecoverable-classification-refuses-the-retry-click";

// The error layer's Retry control, by the id the chrome bootstrap looks it up
// under. Scenario 4 reads the ELEMENT's own state rather than a printed line:
// the fake `addEventListener` is a no-op, so the button's click path is not what
// this harness drives, and the element is the only honest observation of the
// presentation half.
const RETRY_ELEMENT_ID = "powerbrowser-error-retry";

// The expected error-family stream: paint, clear, repaint, clear, repaint.
const EXPECTED_STREAM = [ERROR_SENTINEL, CLEARED_SENTINEL, ERROR_SENTINEL, CLEARED_SENTINEL, ERROR_SENTINEL];

// Bounds. The fake sleep resolves immediately so the drive costs milliseconds,
// which means the supervisor's background recovery probe would spin forever in
// the microtask queue and starve the event loop. After this many resolutions
// every further sleep returns a promise that never settles, which parks every
// supervisor loop for good. The wall-clock race is the second belt.
const SLEEP_BUDGET = 50;
const SCENARIO_TIMEOUT_MS = 20000;
const DRAIN_TURNS = 20;

// The drain the two probe-gate scenarios share. It is deliberately ONE constant
// used by both: the negative scenario's "zero spawns" is only meaningful because
// the positive scenario proves that the SAME drain is long enough for the
// probe's first interval to elapse under the fake sleep and drive a spawn. A
// per-scenario drain would let the negative side pass by simply not waiting,
// which is exactly how shell03-unrecoverable-immediate-error is green and blind.
const PROBE_DRAIN_TURNS = 60;

// The two drives, extracted so a scenario names the failure CLASS it exercises
// rather than restating the stubs. Both are used by more than one scenario, and
// that sharing is the point: the class a scenario drives is what its vacuity
// guards assert, so two scenarios claiming the same class must be driving the
// same stubs.
//
// RECOVERABLE: the spawn succeeds and the stdin credential handshake throws.
// `_spawnAndGate` classifies that recoverable in as many words ("a pipe write
// failing says nothing about whether the next spawn will"), and with the give-up
// budget at one attempt `_restart()` reaches its budget-exhausted give-up on the
// first pass and paints with `recoverable: true`.
const RECOVERABLE_DRIVE = (state) => ({
  spawnProcess: () => {
    state.countSpawn();
    // exitCode 0 so `_reap()` has nothing to kill and needs no stub.
    return { exitCode: 0 };
  },
  writeStdinLine: () => {
    throw new Error("harness: the credential could not be handed over stdin");
  },
});

// UNRECOVERABLE: `_resolveSidecar`'s unset-preference branch -- the one failure
// this supervisor classifies unrecoverable before `_configDir`, `_stateFilePath`
// or a node path exist at all.
const UNRECOVERABLE_DRIVE = {
  // Task 13 accessors: the real boundary never throws here, only this fake's
  // unknown-property trap does. Without them the drive stops at `getAppDir`
  // and never reaches the unset-backendMain branch under test.
  getAppDir: () => "",
  prefHasUserValue: () => false,
  getStringPref: (key, fallback) => (key.endsWith(".backendMain") ? "" : fallback ?? ""),
};

const failures = [];
const fail = (msg) => failures.push(msg);

/**
 * Removes block comments and whole-line `//` comments so the derivation sees
 * code only. Trailing `//` comments are deliberately NOT stripped: these sources
 * contain `http://127.0.0.1` and `chrome://powerbrowser/...` inside real
 * strings, and a naive strip-to-end-of-line would mangle them into silence.
 */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !/^\s*\/\//.test(line))
    .join("\n");
}

function readSource(path, what) {
  try {
    return readFileSync(path, "utf8");
  } catch (err) {
    fail(`cannot read the ${what} at ${path}: ${err.message}`);
    return null;
  }
}

/** Every ALL-CAPS prefix this file hands to `dump(` as a literal or template. */
function deriveDumpSentinels(shellSrc) {
  const found = new Set();
  for (const m of shellSrc.matchAll(/dump\(\s*[`"']([A-Z][A-Z0-9_]*)/g)) {
    found.add(m[1]);
  }
  return found;
}

/**
 * The emitter proof, run before any scenario. An assertion over a log line must
 * first establish that the line belongs to the code under test; otherwise a
 * match could come from the harness itself and the assertion could never go red
 * for the right reason.
 */
function assertEmitters(shellPath) {
  const raw = readSource(shellPath, "chrome bootstrap source");
  if (raw === null) {
    return false;
  }
  const emitted = deriveDumpSentinels(stripComments(raw));
  let ok = true;
  for (const prefix of [ERROR_SENTINEL, CLEARED_SENTINEL]) {
    if (!emitted.has(prefix)) {
      ok = false;
      fail(
        `the chrome bootstrap (${shellPath}) emits no \`dump(\` line beginning \`${prefix}\` -- ` +
          `this analyzer reads that prefix, so a match could only ever come from something other than the ` +
          `code under test and every assertion below would be instrumentation asserting on itself`
      );
    }
  }
  return ok;
}

// --- the fakes -------------------------------------------------------------

/**
 * The fake boundary. A Proxy over a small stub table whose get trap returns, for
 * anything not stubbed, a function that throws naming the method. That trap is
 * what keeps this fake from drifting away from the real PowerBrowserAPI: a
 * supervisor change reaching a new boundary method goes red naming that method
 * rather than being silently satisfied by something plausible.
 */
function makeFakeApi(state, overrides = {}) {
  const table = {
    // _resolveSidecar: a backend entry file that resolves, and no configured
    // node path so the PATH search below is what answers.
    // Task 13 accessors: the real boundary returns "" / false here; the
    // Proxy trap would throw instead, so every drive through _resolveSidecar
    // must stub them (recoverable drives reach it the same way as UNRECOVERABLE).
    getAppDir: () => "",
    prefHasUserValue: () => false,
    getStringPref: (key, fallback) => (key.endsWith(".backendMain") ? `${state.scratch}/backend-main.js` : fallback ?? ""),
    // The caller's own default, except the give-up budget: 1 attempt means the
    // give-up path is reached on the first spawn rather than after six.
    getIntPref: (key, fallback) => (key.endsWith(".giveUpAttempts") ? 1 : fallback),
    pathExists: async () => true,
    pathSearch: async () => `${state.scratch}/node`,
    getEnv: () => state.scratch,
    getProfileDir: () => state.scratch,
    ensureDirectory: async () => {},
    readStateFile: async () => null,
    removeStateFile: async () => {},
    // Same shape the real boundary returns: an unregister function.
    onQuitGranted: () => () => {},
    // The supervisor's console/stdout mirror is not what this check reads.
    log: () => {},
    // Immediate, counted, and hard-parked past the budget -- see SLEEP_BUDGET.
    sleep: () => {
      state.sleeps += 1;
      return state.sleeps > SLEEP_BUDGET ? new Promise(() => {}) : Promise.resolve();
    },
    // The failure this whole scenario rests on. `_spawnAndGate` classifies a
    // throwing spawn unrecoverable (D-113) and reports it through `_showError`.
    //
    // Every stub that stands in for the platform's spawn -- this one and every
    // per-scenario override of it -- calls `state.countSpawn()` FIRST. That
    // counter is the probe-gate scenarios' only instrument, and it counts calls
    // the SUPERVISOR made into the boundary, never a line this harness printed:
    // an absence assertion over a log the harness also writes can never go red
    // for the right reason.
    spawnProcess: () => {
      state.countSpawn();
      throw new Error("harness: the platform refused to exec the backend");
    },
    // Reached by the chrome bootstrap rather than the supervisor.
    createPermanentKey: () => ({}),
    getAppIdentity: () => ({ name: "Power Browser", vendor: "Power Browser", version: "0.0.0" }),
    notifyStartupFinished: () => {},
  };
  Object.assign(table, overrides);
  return new Proxy(table, {
    get(target, prop) {
      if (prop in target) {
        return target[prop];
      }
      if (typeof prop === "symbol") {
        return undefined;
      }
      return () => {
        throw new Error(`unstubbed PowerBrowserAPI.${String(prop)} reached by the harness`);
      };
    },
  });
}

const drain = async (turns = DRAIN_TURNS) => {
  for (let i = 0; i < turns; i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
};

/**
 * Loads BOTH shipped files and fires the bootstrap's own DOMContentLoaded
 * handler. Returns the recorded dump stream, the sandbox (so the Retry global
 * can be called the way the button's click handler calls it) and the supervisor
 * module instance (so per-launch state can be read back).
 */
async function loadShippedSources(supervisorPath, shellPath, tag, overrides = {}) {
  const recorded = [];
  const state = {
    scratch: `${tmpdir()}/powerbrowser-shell-error-contract`,
    sleeps: 0,
    spawnCalls: 0,
    // Spawns the supervisor asked for AFTER it had already painted an error
    // state. This is the probe-gate scenarios' instrument, and it is CAUSAL
    // rather than temporal: with the fake sleep resolving immediately the
    // recovery probe is a pure microtask loop, so it burns its whole sleep
    // budget inside a single microtask drain, before any `setImmediate` turn the
    // harness could read a counter on. Reading "how many spawns happened after
    // the error sentinel" is therefore the only measurement that does not depend
    // on the harness winning a race it cannot win.
    spawnsAfterError: 0,
    recorded,
  };
  state.countSpawn = () => {
    state.spawnCalls += 1;
    if (recorded.some((line) => line.startsWith(`${ERROR_SENTINEL} `))) {
      state.spawnsAfterError += 1;
    }
  };
  const api = makeFakeApi(state, typeof overrides === "function" ? overrides(state) : overrides);

  // The supervisor's own top-level import resolves against this.
  globalThis.ChromeUtils = { importESModule: () => ({ PowerBrowserAPI: api }) };
  const mod = await import(`${pathToFileURL(supervisorPath).href}?scenario=${encodeURIComponent(tag)}`);
  if (!mod || !mod.TheiaService) {
    throw new Error(`the shipped supervisor at ${supervisorPath} exported no TheiaService`);
  }
  const TheiaService = mod.TheiaService;

  const elements = new Map();
  const sandbox = {};
  const makeElement = () => ({
    style: {},
    textContent: "",
    setAttribute() {},
    appendChild() {},
    addEventListener() {},
    ownerDocument: { defaultView: sandbox },
  });

  let handler = null;
  sandbox.dump = (line) => {
    recorded.push(String(line).replace(/\n$/, ""));
  };
  sandbox.document = {
    addEventListener: (type, fn) => {
      if (type === "DOMContentLoaded") {
        handler = fn;
      }
    },
    getElementById: (id) => {
      if (!elements.has(id)) {
        elements.set(id, makeElement());
      }
      return elements.get(id);
    },
    createElement: () => makeElement(),
    createXULElement: () => makeElement(),
    documentElement: makeElement(),
  };
  // Resolved-value semantics, matching what the deck-state sentinel depends on:
  // the layers' hidden default comes from the stylesheet, so an unwritten inline
  // display reads as "none" rather than "".
  sandbox.getComputedStyle = (el) => ({ display: el.style.display || "none" });
  sandbox.ChromeUtils = {
    importESModule: (url) => {
      if (url.includes("PowerBrowserAPI.sys.mjs")) {
        return { PowerBrowserAPI: api };
      }
      if (url.includes("TheiaService.sys.mjs")) {
        return { TheiaService };
      }
      throw new Error(`the chrome bootstrap imported an unexpected module URL: ${url}`);
    },
  };
  sandbox.crypto = globalThis.crypto;
  sandbox.console = console;
  // The bootstrap's window-level key and AppCommand listeners; inert here, like the elements' own.
  sandbox.addEventListener = () => {};

  createContext(sandbox);
  sandbox.window = sandbox;

  const code = readFileSync(shellPath, "utf8");
  runInContext(code, sandbox, { filename: shellPath });

  if (typeof handler !== "function") {
    throw new Error(`the chrome bootstrap at ${shellPath} registered no DOMContentLoaded handler`);
  }
  // `elements` is returned so a scenario can read the error deck's controls
  // directly. See RETRY_ELEMENT_ID: the fake click listener is a no-op, so the
  // element's own state is the only honest observation of the presentation half.
  return { recorded, sandbox, TheiaService, handler, state, elements };
}

// --- the scenario ----------------------------------------------------------

/** The recorded stream, filtered to the two error-family prefixes, in order. */
function errorFamilyStream(recorded) {
  return recorded
    .filter((line) => line.startsWith(`${ERROR_SENTINEL} `) || line.startsWith(`${CLEARED_SENTINEL} `))
    .map((line) => (line.startsWith(`${CLEARED_SENTINEL} `) ? CLEARED_SENTINEL : ERROR_SENTINEL));
}

async function runScenario(supervisorPath, shellPath) {
  let loaded;
  try {
    loaded = await loadShippedSources(supervisorPath, shellPath, SCENARIO, RECOVERABLE_DRIVE);
  } catch (err) {
    fail(
      `the shipped sources could not be evaluated (${err.message}) -- every assertion below would be ` +
        `vacuous, so this is reported rather than skipped`
    );
    return;
  }
  const { recorded, sandbox, TheiaService, handler, elements } = loaded;

  // Firing the handler IS the drive: it calls TheiaService.start() itself, so
  // the entry point stays under test rather than under simulation.
  handler();
  await drain();

  if (!recorded.some((line) => line.startsWith(`${ERROR_SENTINEL} `))) {
    fail(
      `the drive never reached the error state at all -- no \`${ERROR_SENTINEL} \` line was emitted by the ` +
        `code under test, so the repaint assertions below would be vacuous. Recorded stream: ` +
        JSON.stringify(recorded)
    );
    return;
  }

  // The same recorded-classification vacuity guard the other scenarios carry.
  // 01-13 retargeted this scenario onto the RECOVERABLE class, because the
  // repaint contract is a statement about the class that OFFERS Retry -- and
  // under 01-13's guard a Retry against the unrecoverable class is a no-op by
  // design, so driving that class here would go red for the wrong reason. This
  // guard is what stops it drifting silently back.
  const firstPayload = firstErrorPayload(recorded);
  if (firstPayload === null || firstPayload.recoverable !== true) {
    fail(
      `scenario ${SCENARIO}: the drive reached the error state with recoverable=` +
        `${JSON.stringify(firstPayload && firstPayload.recoverable)} rather than true -- the repaint ` +
        `contract is a statement about the class that OFFERS Retry, so a drive on any other class is ` +
        `exercising something this scenario does not name`
    );
    return;
  }

  // The positive control for the presentation half: this class MUST still be
  // offered the control. Its negative twin is scenario ${SCENARIO_REFUSES}.
  const retryElement = elements.get(RETRY_ELEMENT_ID);
  if (!retryElement) {
    fail(
      `scenario ${SCENARIO}: the chrome bootstrap never looked up \`${RETRY_ELEMENT_ID}\`, so the ` +
        `control's visibility cannot be observed at all and this assertion would pass on nothing`
    );
    return;
  }
  if (retryElement.hidden === true) {
    fail(
      `scenario ${SCENARIO}: the Retry control is hidden after an error state classified RECOVERABLE. ` +
        `A transient failure the supervisor is willing to retry must still offer the user the control ` +
        `that drives it, or the error state is permanent from the user's side whatever the supervisor thinks`
    );
  }

  if (typeof sandbox.powerbrowserRetry !== "function") {
    fail(
      `the chrome bootstrap defines no Retry global on its own window, so the error layer's only affordance ` +
        `cannot be driven and this check would assert nothing`
    );
    return;
  }

  sandbox.powerbrowserRetry();
  await drain();
  const probeStillActiveAfterFirstRetry = TheiaService._recoveryProbeActive === true;
  sandbox.powerbrowserRetry();
  await drain();

  const observed = errorFamilyStream(recorded);
  const clearedSeen = observed.includes(CLEARED_SENTINEL);
  const errorCount = observed.filter((s) => s === ERROR_SENTINEL).length;

  if (observed.join(",") !== EXPECTED_STREAM.join(",")) {
    const named = [];
    if (!clearedSeen) {
      named.push(`no ${CLEARED_SENTINEL} was emitted after the first failing Retry`);
    }
    if (errorCount < 2) {
      named.push(`no second ${ERROR_SENTINEL} was emitted -- the error layer never came back`);
    }
    if (named.length === 0) {
      named.push("the stream is the wrong shape");
    }
    fail(
      `scenario ${SCENARIO}: ${named.join("; ")}. Expected ${JSON.stringify(EXPECTED_STREAM)} but observed ` +
        `${JSON.stringify(observed)}. The consequence is the whole point of this check: the user is looking ` +
        `at a screen the click handler blanked, with no message, no Retry and no Details, for the rest of ` +
        `the session. (Stale recovery probe still active after the first Retry: ` +
        `${probeStillActiveAfterFirstRetry}.)`
    );
  }

  // The repaint is held to the same anchored shape shell03-budget-exhausted-error
  // enforces on the first sentinel, so a second paint cannot start leaking a key.
  for (const line of recorded.filter((l) => l.startsWith(`${ERROR_SENTINEL} `))) {
    let payload;
    try {
      payload = JSON.parse(line.slice(ERROR_SENTINEL.length + 1));
    } catch (err) {
      fail(`an \`${ERROR_SENTINEL} \` line carried unparseable JSON (${err.message}): ${JSON.stringify(line)}`);
      continue;
    }
    const keys = Object.keys(payload).sort();
    if (keys.join(",") !== "reason,recoverable") {
      fail(
        `an \`${ERROR_SENTINEL} \` line carries the keys ${JSON.stringify(keys)} rather than exactly ` +
          `["reason","recoverable"] -- the error sentinel's shape is anchored, and a new key on this ` +
          `channel is how the per-launch token would reach a surface that renders it`
      );
    }
  }
}

// --- the probe-gate pair ---------------------------------------------------

/** The parsed payload of the first `POWERBROWSER_SHELL_ERROR ` line, or null. */
function firstErrorPayload(recorded) {
  const line = recorded.find((l) => l.startsWith(`${ERROR_SENTINEL} `));
  if (!line) {
    return null;
  }
  try {
    return JSON.parse(line.slice(ERROR_SENTINEL.length + 1));
  } catch {
    return null;
  }
}

/**
 * The NEGATIVE half of the probe gate. Drive a launch whose sidecar can never be
 * resolved -- the supervisor's own D-113 comment calls that class "unrecoverable
 * by construction, straight to the error state with no retry at all" -- and
 * require that the background recovery probe drives NO spawn at all.
 *
 * The absence assertion is the third of three, and the first two are what make
 * it legitimate: the error state must have been reached (otherwise the drive
 * never got where the probe starts and the count would be trivially zero), and
 * the recorded classification must actually be `false` (otherwise the scenario
 * has quietly drifted onto some other failure class than the one under test).
 */
async function runNoProbeScenario(supervisorPath, shellPath) {
  let loaded;
  try {
    loaded = await loadShippedSources(supervisorPath, shellPath, SCENARIO_NO_PROBE, UNRECOVERABLE_DRIVE);
  } catch (err) {
    fail(`scenario ${SCENARIO_NO_PROBE}: the shipped sources could not be evaluated (${err.message})`);
    return;
  }
  const { recorded, TheiaService, handler, state } = loaded;

  handler();
  await drain(PROBE_DRAIN_TURNS);

  const payload = firstErrorPayload(recorded);
  if (payload === null) {
    fail(
      `scenario ${SCENARIO_NO_PROBE}: the drive never reached the error state -- no parseable ` +
        `\`${ERROR_SENTINEL} \` line was emitted by the code under test, so the spawn-count assertion ` +
        `below would be vacuous. Recorded stream: ${JSON.stringify(recorded)}`
    );
    return;
  }
  if (payload.recoverable !== false) {
    fail(
      `scenario ${SCENARIO_NO_PROBE}: the drive reached the error state with recoverable=` +
        `${JSON.stringify(payload.recoverable)} rather than false -- it is exercising some other failure ` +
        `class than the unrecoverable one this scenario names, which is how a check quietly stops ` +
        `asserting what it claims`
    );
    return;
  }

  if (state.spawnsAfterError !== 0) {
    fail(
      `scenario ${SCENARIO_NO_PROBE}: the recovery probe ran for a failure the supervisor classified ` +
        `unrecoverable -- the boundary's spawn was called ${state.spawnsAfterError} time(s) after an error ` +
        `state whose recoverable flag was false. The supervisor's own D-113 comment calls this class ` +
        `unrecoverable by construction with no retry at all, so every one of those attempts is a process ` +
        `spawn against a _configDir and a _stateFilePath that were never assigned, repeating for the life ` +
        `of the session. (Probe still active: ${TheiaService._recoveryProbeActive === true}; fake sleeps ` +
        `resolved: ${state.sleeps}.)`
    );
  }
}

/**
 * The POSITIVE control, and the reason the gate is honest rather than
 * convenient. A failure classified RECOVERABLE must still start the probe, so
 * D-115's auto-dismiss survives: a transient condition clearing on its own is
 * noticed and the error layer disappears with no user action. Without this row a
 * "fix" that simply stopped probing everywhere would pass the negative half.
 *
 * The drive: the spawn itself succeeds, and the stdin credential handshake
 * throws. `_spawnAndGate` classifies that recoverable in as many words ("a pipe
 * write failing says nothing about whether the next spawn will"), and with the
 * give-up budget at one attempt `_restart()` reaches its budget-exhausted
 * give-up on the first pass and paints with `recoverable: true`.
 */
async function runProbeScenario(supervisorPath, shellPath) {
  let loaded;
  try {
    loaded = await loadShippedSources(supervisorPath, shellPath, SCENARIO_PROBE, RECOVERABLE_DRIVE);
  } catch (err) {
    fail(`scenario ${SCENARIO_PROBE}: the shipped sources could not be evaluated (${err.message})`);
    return;
  }
  const { recorded, handler, state } = loaded;

  handler();
  await drain(PROBE_DRAIN_TURNS);

  const payload = firstErrorPayload(recorded);
  if (payload === null) {
    fail(
      `scenario ${SCENARIO_PROBE}: the drive never reached the error state -- no parseable ` +
        `\`${ERROR_SENTINEL} \` line was emitted, so the probe assertion below would be vacuous. ` +
        `Recorded stream: ${JSON.stringify(recorded)}`
    );
    return;
  }
  if (payload.recoverable !== true) {
    fail(
      `scenario ${SCENARIO_PROBE}: the drive reached the error state with recoverable=` +
        `${JSON.stringify(payload.recoverable)} rather than true -- it is exercising some other failure ` +
        `class than the recoverable one this control names, so it would prove nothing about the probe`
    );
    return;
  }

  if (state.spawnsAfterError < 1) {
    fail(
      `scenario ${SCENARIO_PROBE}: the recovery probe never drove a spawn after a recoverable ` +
        `classification -- the boundary's spawn was called ${state.spawnCalls} time(s) in total and ` +
        `${state.spawnsAfterError} time(s) after the error state was painted. D-115's auto-dismiss is ` +
        `gone: a transient failure that clears on its own would never be noticed and the error layer ` +
        `would never disappear without a user action. (Fake sleeps resolved: ${state.sleeps} -- a zero ` +
        `here means the drain never let the probe's first interval elapse and this control is ` +
        `timing-blind rather than the code being wrong.)`
    );
  }
}

// --- the user-driven route (01-13) -----------------------------------------

/**
 * 01-13 (01-VERIFICATION.md's failed truth 2d, re-scoped by 01-REVIEW.md's
 * CR-01). 01-12 gated the background recovery probe on the `recoverable`
 * classification. It did NOT gate the user-driven route: `retry()` re-entered
 * `_restart()` unconditionally, so on the one class the supervisor's own D-113
 * comment calls "unrecoverable by construction ... with no retry at all" the
 * user was looking at a live Retry control whose click re-entered the failed
 * launch path AND -- because `retry()` called `_hideError()` first -- erased the
 * diagnostic rows that identified the failure on the way past.
 *
 * This scenario drives that exact click. It calls `powerbrowserRetry()` DIRECTLY
 * rather than through the button, which is deliberate: the refusal has to live
 * in the SUPERVISOR, so a fix that only hid the control would still pass a check
 * that could only reach retry through the control. The button's own state is
 * asserted too, but as presentation, never as the authority.
 */
async function runRefusalScenario(supervisorPath, shellPath) {
  let loaded;
  try {
    loaded = await loadShippedSources(supervisorPath, shellPath, SCENARIO_REFUSES, UNRECOVERABLE_DRIVE);
  } catch (err) {
    fail(`scenario ${SCENARIO_REFUSES}: the shipped sources could not be evaluated (${err.message})`);
    return;
  }
  const { recorded, sandbox, TheiaService, handler, state, elements } = loaded;

  handler();
  await drain(PROBE_DRAIN_TURNS);

  // Vacuity guard 1: the drive reached the error state at all.
  const payload = firstErrorPayload(recorded);
  if (payload === null) {
    fail(
      `scenario ${SCENARIO_REFUSES}: the drive never reached the error state -- no parseable ` +
        `\`${ERROR_SENTINEL} \` line was emitted by the code under test, so every assertion below ` +
        `would be vacuous. Recorded stream: ${JSON.stringify(recorded)}`
    );
    return;
  }
  // Vacuity guard 2: it reached the class this scenario NAMES.
  if (payload.recoverable !== false) {
    fail(
      `scenario ${SCENARIO_REFUSES}: the drive reached the error state with recoverable=` +
        `${JSON.stringify(payload.recoverable)} rather than false -- it is exercising some other ` +
        `failure class than the unrecoverable one this scenario names, which is how a check quietly ` +
        `stops asserting what it claims`
    );
    return;
  }
  // Vacuity guard 3: the control was actually looked up, so the visibility
  // assertion below cannot pass because nothing was ever there to observe.
  const retryElement = elements.get(RETRY_ELEMENT_ID);
  if (!retryElement) {
    fail(
      `scenario ${SCENARIO_REFUSES}: the chrome bootstrap never looked up \`${RETRY_ELEMENT_ID}\`, so ` +
        `the control's visibility cannot be observed and the assertion below would pass on nothing`
    );
    return;
  }

  if (retryElement.hidden !== true) {
    fail(
      `scenario ${SCENARIO_REFUSES}: the Retry control is still on screen for a failure the supervisor ` +
        `classified unrecoverable -- \`${RETRY_ELEMENT_ID}\`.hidden is ` +
        `${JSON.stringify(retryElement.hidden)} rather than true. A control the interface is designed to ` +
        `refuse is worse than no control: it consumes the user's one remaining idea about what to do`
    );
  }

  // Vacuity guard 4: an empty-to-empty rows comparison would prove nothing.
  const rowsBefore = TheiaService.getFailureDetails();
  if (!Array.isArray(rowsBefore) || rowsBefore.length === 0) {
    fail(
      `scenario ${SCENARIO_REFUSES}: TheiaService.getFailureDetails() is already empty before the Retry ` +
        `is driven (${JSON.stringify(rowsBefore)}), so the preserved-rows comparison below would be ` +
        `empty-to-empty and could never go red`
    );
    return;
  }

  if (typeof sandbox.powerbrowserRetry !== "function") {
    fail(
      `scenario ${SCENARIO_REFUSES}: the chrome bootstrap defines no Retry global on its own window, so ` +
        `the user-driven route cannot be driven and this check would assert nothing`
    );
    return;
  }

  const recordedBeforeRetry = recorded.length;
  sandbox.powerbrowserRetry();
  await drain(PROBE_DRAIN_TURNS);

  if (state.spawnsAfterError !== 0) {
    fail(
      `scenario ${SCENARIO_REFUSES}: a Retry driven against an UNRECOVERABLE error state re-entered the ` +
        `spawn path -- the boundary's spawn was called ${state.spawnsAfterError} time(s) after the error ` +
        `state was painted. That branch returns before \`_configDir\`, \`_stateFilePath\` and the quit ` +
        `observer are ever assigned, so every one of those attempts starts a backend holding the ` +
        `per-launch token against unassigned state and unobserved by quit`
    );
  }

  const rowsAfter = TheiaService.getFailureDetails();
  if (JSON.stringify(rowsAfter) !== JSON.stringify(rowsBefore)) {
    fail(
      `scenario ${SCENARIO_REFUSES}: the refused Retry destroyed the failure's diagnostic rows -- ` +
        `TheiaService.getFailureDetails() returned ${JSON.stringify(rowsBefore)} before the call and ` +
        `${JSON.stringify(rowsAfter)} after it. The refusal must return BEFORE \`_hideError()\`, which ` +
        `nulls \`_failureDetails\`: a user action that did not resolve the failure must not discard the ` +
        `only evidence the user had left to act on or report`
    );
  }

  // The one absence assertion in this file, and legitimate only because
  // assertEmitters() has already proved the bootstrap emits this prefix from a
  // `dump(` call site of ITS OWN -- and because the retargeted scenario
  // ${SCENARIO} is the positive control proving the same instrument DOES record
  // it when the classification allows the retry through.
  const clearedAcrossCall = recorded
    .slice(recordedBeforeRetry)
    .some((line) => line.startsWith(`${CLEARED_SENTINEL} `));
  if (clearedAcrossCall) {
    fail(
      `scenario ${SCENARIO_REFUSES}: a \`${CLEARED_SENTINEL} \` line was emitted across a Retry the ` +
        `supervisor must have refused -- the error layer was taken off the user's screen for a failure ` +
        `nothing was done about, leaving no message, no Retry and no Details`
    );
  }
}

// ---------------------------------------------------------------------------
// --self-test
// ---------------------------------------------------------------------------

// 01-13's guard, matched structurally rather than by quoting its log sentence.
// A mutation that produces an unchanged source is reported as "the fault did not
// apply" and fails its row, so an anchor that has to be kept byte-identical to a
// prose string is an anchor that will silently rot the next time the wording is
// improved. These two match the guard's SHAPE -- the condition, its 6-space body,
// and its 4-space closing brace -- so a reworded log line cannot disarm the plant.
const RETRY_GUARD_RE = /\n {4}if \(this\._errorRecoverable !== true\) \{[\s\S]*?\n {4}\}\n/;
const RETRY_GUARD_ORDER_RE =
  /( {4}if \(this\._errorRecoverable !== true\) \{[\s\S]*?\n {4}\}\n)( {4}this\._hideError\(\);\n)/;

const SOURCE_FAULTS = [
  {
    name: "retry() re-entering the restart path without clearing the error state",
    mutate: ({ supervisorSrc, shellSrc }) => ({
      supervisorSrc: supervisorSrc.replace(
        "    this._hideError();\n    await this._restart();",
        "    await this._restart();"
      ),
      shellSrc,
    }),
    expect: `no ${CLEARED_SENTINEL} was emitted after the first failing Retry`,
  },
  {
    // The pre-fix pair, reproduced exactly: the bootstrap blanks the element
    // behind the supervisor's back AND the supervisor never clears its guard.
    name: "the Retry global blanking the error element directly instead of routing through the supervisor",
    mutate: ({ supervisorSrc, shellSrc }) => ({
      supervisorSrc: supervisorSrc.replace(
        "    this._hideError();\n    await this._restart();",
        "    await this._restart();"
      ),
      shellSrc: shellSrc.replace(
        /(\n(\s*))(\w+\.retry\(\))/,
        (_m, lead, indent, call) => `${lead}errorElement.style.display = "none";${lead}${call}`
      ),
    }),
    expect: `no ${CLEARED_SENTINEL} was emitted after the first failing Retry`,
  },
  {
    // Discriminates the repaint GUARD from the DOM write: the layer is still
    // hidden (CLEARED is emitted) but the guard is never released, so nothing
    // paints again.
    name: "_hideError() no longer clearing the repaint guard",
    mutate: ({ supervisorSrc, shellSrc }) => ({
      supervisorSrc: supervisorSrc.replace(
        "    this._errorShown = false;\n    this._failureDetails = null;",
        "    this._failureDetails = null;"
      ),
      shellSrc,
    }),
    expect: `no second ${ERROR_SENTINEL} was emitted`,
  },
  {
    // 01-12's defect, reproduced: the classification is received and ignored.
    name: "the recovery probe started unconditionally, ignoring the recoverable classification",
    mutate: ({ supervisorSrc, shellSrc }) => ({
      supervisorSrc: supervisorSrc.replace(
        "    if (recoverable) {\n      this._startRecoveryProbe();\n    }",
        "    this._startRecoveryProbe();"
      ),
      shellSrc,
    }),
    expect: "the recovery probe ran for a failure the supervisor classified unrecoverable",
  },
  {
    // The OTHER direction, and the reason the gate is two-directional. A "fix"
    // that simply stopped probing everywhere satisfies the row above and would
    // turn every transient failure into a permanent error state. This row is the
    // positive control's own plant.
    name: "the recovery probe never started at all",
    mutate: ({ supervisorSrc, shellSrc }) => ({
      supervisorSrc: supervisorSrc.replace(
        "    if (recoverable) {\n      this._startRecoveryProbe();\n    }\n",
        ""
      ),
      shellSrc,
    }),
    expect: "the recovery probe never drove a spawn after a recoverable classification",
  },
  // --- 01-13: the user-driven route. One plant per new assertion. -----------
  {
    // The pre-fix shape: `retry()` re-enters `_restart()` whatever the
    // classification, so the class D-113 calls unrecoverable by construction is
    // re-entered by the one control the error screen offered.
    name: "the classification guard removed from retry() entirely",
    mutate: ({ supervisorSrc, shellSrc }) => ({
      supervisorSrc: supervisorSrc.replace(RETRY_GUARD_RE, "\n"),
      shellSrc,
    }),
    expect: "a Retry driven against an UNRECOVERABLE error state re-entered the spawn path",
  },
  {
    // ORDERING, which is half the fix and would otherwise be a passenger. The
    // guard still refuses the spawn, but `_hideError()` has already run on the
    // way past and nulled `_failureDetails` -- so the user's click destroys the
    // rows that identified the failure and gets nothing in return.
    name: "the classification guard moved below the _hideError() call",
    mutate: ({ supervisorSrc, shellSrc }) => ({
      supervisorSrc: supervisorSrc.replace(RETRY_GUARD_ORDER_RE, "$2$1"),
      shellSrc,
    }),
    expect: "the refused Retry destroyed the failure's diagnostic rows",
  },
  {
    // The PRESENTATION half, asserted independently of the supervisor half. The
    // two are separate facts about one classification: a supervisor that refuses
    // correctly while the screen still offers the control leaves the user
    // clicking something designed to do nothing, and a fix to one must not green
    // the other.
    name: "the Retry control's hidden mirror removed from powerbrowserShowError",
    mutate: ({ supervisorSrc, shellSrc }) => ({
      supervisorSrc,
      shellSrc: shellSrc.replace(/\n\s*errorRetryButton\.hidden = !recoverable;/, ""),
    }),
    expect: "the Retry control is still on screen for a failure the supervisor classified unrecoverable",
  },
  {
    // The OTHER direction, mirroring the probe gate's own reverse-direction row
    // above and for the same reason. A "fix" that simply refused EVERY Retry
    // satisfies all three rows above and would turn every transient failure into
    // a permanent error state -- the user's only recovery affordance dead for the
    // life of the session. The retargeted repaint scenario is what catches it,
    // which is why that scenario had to move onto the recoverable class rather
    // than be retired.
    name: "the classification guard made unconditional, so every Retry is refused",
    mutate: ({ supervisorSrc, shellSrc }) => ({
      supervisorSrc: supervisorSrc.replace("if (this._errorRecoverable !== true) {", "if (true) {"),
      shellSrc,
    }),
    expect: `no ${CLEARED_SENTINEL} was emitted after the first failing Retry`,
  },
];

function runOnce(args) {
  try {
    const out = execFileSync(process.execPath, [SELF, ...args], { encoding: "utf8", stdio: "pipe" });
    return { exitCode: 0, out };
  } catch (err) {
    return { exitCode: err.status ?? 1, out: `${err.stdout ?? ""}${err.stderr ?? ""}` };
  }
}

function judge(name, expect, result) {
  if (result.exitCode === 0) {
    console.error(`  FAIL  ${name} -- planted fault did NOT go red`);
    return false;
  }
  if (!result.out.includes(expect)) {
    console.error(
      `  FAIL  ${name} -- went red but did not name the drift (expected output to mention ${JSON.stringify(expect)})\n` +
        result.out.replace(/^/gm, "        ")
    );
    return false;
  }
  console.log(`  ok    ${name} -- red, naming the drift`);
  return true;
}

function runSelfTest(supervisorPath, shellPath) {
  let supervisorSrc;
  let shellSrc;
  try {
    supervisorSrc = readFileSync(supervisorPath, "utf8");
    shellSrc = readFileSync(shellPath, "utf8");
  } catch (err) {
    console.error(`  FAIL  clean control -- cannot read a source under test: ${err.message}`);
    return false;
  }

  // The clean control FIRST: a self-test whose fixture is already red before any
  // plant proves nothing about its plants.
  let allOk = true;
  const control = runOnce(["--file", supervisorPath, "--shell-file", shellPath]);
  if (control.exitCode !== 0) {
    console.error(`  FAIL  clean control -- the unmutated tree is already red:\n${control.out.replace(/^/gm, "        ")}`);
    allOk = false;
  } else {
    console.log("  ok    clean control -- green on the unmutated tree");
  }

  const dir = mkdtempSync(join(tmpdir(), "verify-shell-error-contract-"));
  try {
    const supCopy = join(dir, "TheiaService.sys.mjs");
    const shellCopy = join(dir, "powerbrowser.js");
    for (const fault of SOURCE_FAULTS) {
      const mutated = fault.mutate({ supervisorSrc, shellSrc });
      if (mutated.supervisorSrc === supervisorSrc && mutated.shellSrc === shellSrc) {
        console.error(`  FAIL  ${fault.name} -- the fault did not apply; this self-test row proves nothing`);
        allOk = false;
        continue;
      }
      writeFileSync(supCopy, mutated.supervisorSrc);
      writeFileSync(shellCopy, mutated.shellSrc);
      if (!judge(fault.name, fault.expect, runOnce(["--file", supCopy, "--shell-file", shellCopy]))) {
        allOk = false;
      }
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  return allOk;
}

// ---------------------------------------------------------------------------

const argv = process.argv.slice(2);
let supervisorPath = DEFAULT_SUPERVISOR;
let shellPath = DEFAULT_SHELL;
let selfTest = false;

const needsValue = (i, flag) => {
  const value = argv[i + 1];
  if (!value) {
    console.error(`verify-shell-error-contract: FAIL -- ${flag} requires a path argument`);
    process.exit(1);
  }
  return value;
};

for (let i = 0; i < argv.length; i += 1) {
  if (argv[i] === "--self-test") {
    selfTest = true;
  } else if (argv[i] === "--file") {
    supervisorPath = needsValue(i, "--file");
    i += 1;
  } else if (argv[i] === "--shell-file") {
    shellPath = needsValue(i, "--shell-file");
    i += 1;
  } else {
    console.error(`verify-shell-error-contract: FAIL -- unknown argument '${argv[i]}'`);
    process.exit(1);
  }
}

if (selfTest) {
  console.log(
    `verify-shell-error-contract --self-test: planting ${SOURCE_FAULTS.length} fault(s) plus 1 clean control`
  );
  if (runSelfTest(supervisorPath, shellPath)) {
    console.log(`verify-shell-error-contract: PASS -- all ${SOURCE_FAULTS.length + 1} self-test rows behaved as required`);
    process.exit(0);
  }
  console.error("verify-shell-error-contract: FAIL -- see the self-test rows above");
  process.exit(1);
}

const withTimeout = async (name, run) => {
  await Promise.race([
    run(),
    new Promise((resolve) =>
      setTimeout(() => {
        fail(`scenario ${name} did not settle within ${SCENARIO_TIMEOUT_MS}ms`);
        resolve();
      }, SCENARIO_TIMEOUT_MS)
    ),
  ]);
};

if (assertEmitters(shellPath)) {
  await withTimeout(SCENARIO, () => runScenario(supervisorPath, shellPath));
  await withTimeout(SCENARIO_NO_PROBE, () => runNoProbeScenario(supervisorPath, shellPath));
  await withTimeout(SCENARIO_PROBE, () => runProbeScenario(supervisorPath, shellPath));
  await withTimeout(SCENARIO_REFUSES, () => runRefusalScenario(supervisorPath, shellPath));
}

if (failures.length === 0) {
  console.log(
    `verify-shell-error-contract: PASS -- scenario ${SCENARIO}: a failing Retry repaints the error layer, ` +
      `twice over; scenario ${SCENARIO_NO_PROBE}: an unrecoverable classification drives no spawn at all; ` +
      `scenario ${SCENARIO_PROBE}: a recoverable one still drives at least one; scenario ` +
      `${SCENARIO_REFUSES}: a Retry against an unrecoverable classification drives no spawn, keeps the ` +
      `diagnostic rows and is not offered as a control -- all four driven against ` +
      `the shipped supervisor (${supervisorPath}) and the shipped chrome bootstrap (${shellPath})`
  );
  process.exit(0);
}
for (const f of failures) {
  console.error(`verify-shell-error-contract: FAIL -- ${f}`);
}
process.exit(1);
