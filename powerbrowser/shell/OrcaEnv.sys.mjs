/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Phase 62 (P62-04, P62-14, P62-16, P62-19): everything about orcad that is a pure decision. The
 * environment allowlist, the argument list, the ready-line parse, the redaction, the socket-path fit
 * and the data-root alias live here so that the supervisor (OrcaService.sys.mjs) and the repo checks
 * (scripts/verify-orca-*.mjs, which import this file by path from Node) read one definition.
 *
 * This module imports nothing and names no privileged global. It uses only what both a chrome module
 * scope and Node 24 provide: crypto.subtle, TextEncoder, JSON.
 */

/** The switch the overlay seam in orcad's browser provider reads (lane p62-01, RUN-04). Value "1". */
export const ORCAD_HIDDEN_ELECTRON_SWITCH = "ORCA_DISABLE_INSTALLED_ELECTRON_BROWSER";

/** Names buildOrcadEnv always sets, whatever PowerBrowser inherited. */
export const ORCAD_FIXED_ENV_NAMES = Object.freeze([
  "ORCA_USER_DATA",
  "ORCA_USER_DATA_PATH",
  "ORCA_VERSION",
  "ORCA_TELEMETRY_DISABLED",
  "DO_NOT_TRACK",
  ORCAD_HIDDEN_ELECTRON_SWITCH,
]);

/**
 * Names (never values) copied from PowerBrowser's own environment when set there. Research assumption
 * A3: enough for agents (git, ssh, GUI tools, proxies) on Linux and macOS; Windows names are Phase 68.
 * A name that steers Node or relocates orcad's data is never listed.
 */
export const ORCAD_ENV_ALLOWLIST = Object.freeze([
  "PATH",
  "HOME",
  "USER",
  "LOGNAME",
  "SHELL",
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "LOCALE_ARCHIVE",
  "TZ",
  "TMPDIR",
  "XDG_RUNTIME_DIR",
  "XDG_CONFIG_HOME",
  "XDG_CACHE_HOME",
  "XDG_STATE_HOME",
  "DBUS_SESSION_BUS_ADDRESS",
  "SSH_AUTH_SOCK",
  "DISPLAY",
  "WAYLAND_DISPLAY",
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "NO_PROXY",
  "http_proxy",
  "https_proxy",
  "no_proxy",
]);

export const ORCAD_BIND_HOST = "127.0.0.1";
export const ORCAD_DATA_ROOT_NAME = "powerbrowser-orca";
export const ORCAD_STATE_FILE_NAME = "pb-orca-state.json";
export const ORCAD_LOCK_FILE_NAME = "orcad.lock";
/** Phase 63 (P63-26): the one-line file in the bridge folder naming orcad's data root, for the EXT-02 wrapper. */
export const ORCAD_DATA_ROOT_FILE = "orcad-data-root";
/**
 * Phase 64 (P64-07, P64-34): the bridge-folder file holding this orcad start's pairing offer, a
 * reusable credential. Written 0600 for the Theia backend only and removed on stop.
 */
export const ORCA_WEB_PAIRING_FILE = "web-pairing";
/** Phase 64 (P64-06): the bridge-folder file naming the pane bundle folder, written only when it exists. */
export const ORCA_PANES_DIR_FILE = "orca-panes-dir";
/** Phase 64 (P64-06): the pane bundle folder, relative to orcad's web client root. */
export const ORCA_PANES_DIR_REL = "assets/pb-panes";
/**
 * Longest data root, in UTF-8 bytes, whose RPC socket path still fits: the 107-byte Linux and
 * 103-byte macOS sun_path limits minus the 19-byte o-<pid>-<x>.sock suffix. The macOS figure is used
 * on every platform.
 */
export const ORCAD_SOCKET_ROOT_BUDGET = 84;
export const ORCAD_REAP_BLOCKER_NAME = "PowerBrowser: reap orcad";
export const ORCAD_PINNED_PORT_CODE = "pinned_port_unavailable";
export const ORCAD_LOCK_HELD_CODE = "orcad_instance_lock_held";
export const PORT_MIN = 1024;
export const PORT_MAX = 32767;

const REDACTED = "[redacted]";
const READY_MARKER = '"orca_server_ready"';
const STDOUT_KEEP_BYTES = 64 * 1024;
const STDERR_LINE_MAX = 4096;

/**
 * The whole child environment for orcad: each allowlisted name PowerBrowser has, then the fixed
 * names. Nothing else of the browser's environment reaches orcad or the agents under it.
 */
export function buildOrcadEnv(getEnv, { dataRoot, orcaVersion } = {}) {
  if (typeof dataRoot !== "string" || !dataRoot) {
    throw new Error("buildOrcadEnv: no data root");
  }
  if (typeof orcaVersion !== "string" || !orcaVersion) {
    throw new Error("buildOrcadEnv: no Orca version");
  }
  const env = {};
  for (const name of ORCAD_ENV_ALLOWLIST) {
    const value = getEnv(name);
    if (typeof value === "string" && value !== "") {
      env[name] = value;
    }
  }
  const fixed = {
    ORCA_USER_DATA: dataRoot,
    ORCA_USER_DATA_PATH: dataRoot,
    ORCA_VERSION: orcaVersion,
    ORCA_TELEMETRY_DISABLED: "1",
    DO_NOT_TRACK: "1",
    [ORCAD_HIDDEN_ELECTRON_SWITCH]: "1",
  };
  for (const name of ORCAD_FIXED_ENV_NAMES) {
    if (typeof fixed[name] !== "string") {
      throw new Error(`buildOrcadEnv: fixed name ${name} has no value`);
    }
    env[name] = fixed[name];
  }
  return env;
}

/** The environment for a helper tool (ln): the search path and nothing else. */
export function buildToolEnv(getEnv) {
  const path = getEnv("PATH");
  return typeof path === "string" && path ? { PATH: path } : {};
}

/** orcad's argument list. Throws on port 0 and on anything outside PORT_MIN..PORT_MAX. */
export function buildOrcadArgs({ orcadMain, port, webClientRoot } = {}) {
  if (!Number.isInteger(port) || port < PORT_MIN || port > PORT_MAX) {
    throw new Error(`buildOrcadArgs: port ${port} is not an integer from ${PORT_MIN} to ${PORT_MAX}`);
  }
  if (!orcadMain || !webClientRoot) {
    throw new Error("buildOrcadArgs: orcad entry file or web client root missing");
  }
  return [orcadMain, "--bind", ORCAD_BIND_HOST, "--port", String(port), "--json", "--web-client-root", webClientRoot];
}

/**
 * Parses orcad's ready line out of accumulated stdout text. Returns null until a parsable line is
 * present, then exactly three fields. The pairing fields of the line are never read or returned.
 */
export function parseReadyLine(text) {
  const line = String(text)
    .split("\n")
    .find(l => l.startsWith("{") && l.includes(READY_MARKER));
  if (!line) {
    return null;
  }
  let record;
  try {
    record = JSON.parse(line);
  } catch {
    return null;
  }
  const nodeVersion = record?.health?.nodeVersion;
  const daemonPid = record?.health?.terminalDaemon?.pid;
  return {
    boundEndpoint: typeof record?.boundEndpoint === "string" ? record.boundEndpoint : null,
    nodeVersion: typeof nodeVersion === "string" ? nodeVersion : null,
    daemonPid: Number.isInteger(daemonPid) && daemonPid > 0 ? daemonPid : null,
  };
}

/**
 * Phase 64 (P64-07, A6): the ready line's pairing offer (pairing.webClientUrl when
 * pairing.available), else null. Only createOutputSink's one-shot onOffer callback calls this; the
 * offer is handed to one writer and kept nowhere else, which is why parseReadyLine never reads it.
 */
export function readyLineOffer(text) {
  const line = String(text)
    .split("\n")
    .find(l => l.startsWith("{") && l.includes(READY_MARKER));
  let record = null;
  try {
    record = line ? JSON.parse(line) : null;
  } catch {
    return null;
  }
  const offer = record?.pairing?.webClientUrl;
  return record?.pairing?.available === true && typeof offer === "string" && offer ? offer : null;
}

/** True only for ws://127.0.0.1:<port>, optionally followed by one slash. */
export function isLoopbackEndpoint(endpoint, port) {
  return endpoint === `ws://127.0.0.1:${port}` || endpoint === `ws://127.0.0.1:${port}/`;
}

/** Removes every form of a pairing offer from a line of orcad output. */
export function redact(text) {
  return String(text)
    .replace(/#pairing=[^\s"'<>]*/g, `#${REDACTED}`)
    .replace(/orca:\/\/pair\?[^\s"'<>]*/g, REDACTED)
    .replace(/pair%3F[^\s"'<>]*/gi, REDACTED);
}

/** True when orcad's RPC socket under `root` fits the socket path limit. */
export function socketPathFits(root) {
  return typeof root === "string" && root !== "" && new TextEncoder().encode(root).length <= ORCAD_SOCKET_ROOT_BUDGET;
}

const underTmp = dir => dir === "/tmp" || dir.startsWith("/tmp/");
const isDrivePath = value => /^[A-Za-z]:[\\/]/.test(value);

/** The first 12 hex characters of SHA-256 of the data root: one profile, one name, on every platform. */
async function rootHashPrefix(dataRoot) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(dataRoot));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 12);
}

/**
 * The short alias for a data root that does not fit: <XDG_RUNTIME_DIR>/pb-orca-<12 hex>, else
 * <HOME>/.cache/pb-orca-<12 hex>, else null. The hex is the start of SHA-256 of the data root, so one
 * profile always gets the same alias. A base under /tmp is refused.
 */
export async function aliasPathFor(dataRoot, getEnv) {
  const hex = await rootHashPrefix(dataRoot);
  const clean = value => (typeof value === "string" ? value.replace(/\/+$/, "") : "");
  const runtimeDir = clean(getEnv("XDG_RUNTIME_DIR"));
  if (runtimeDir.startsWith("/") && !underTmp(runtimeDir)) {
    return `${runtimeDir}/pb-orca-${hex}`;
  }
  const home = clean(getEnv("HOME"));
  if (home.startsWith("/") && !underTmp(home)) {
    return `${home}/.cache/pb-orca-${hex}`;
  }
  return null;
}

/** Phase 63 (P63-35): orcad's real data root for a profile folder, the P62 join. Never its alias. */
export function dataRootFor(profileDir) {
  return `${profileDir}/${ORCAD_DATA_ROOT_NAME}`;
}

/** Phase 63 (P63-35): the build platform (linux, macosx or win) in Node's spelling; anything else unchanged. */
export function nodePlatform(appConstantsPlatform) {
  return { linux: "linux", macosx: "darwin", win: "win32" }[appConstantsPlatform] ?? appConstantsPlatform;
}

/**
 * Phase 63 (D-31, P63-35): the private bridge folder chrome and the Theia backend share for hand-off
 * files (orcad-data-root now; Phase 64 adds its own), from orcad's real data root and a Node platform
 * name. linux and darwin: the alias path followed by "-bridge" (never under /tmp); win32:
 * <LOCALAPPDATA>\pb-orca-<12 hex>-bridge when LOCALAPPDATA is an absolute drive path; otherwise null.
 */
export async function bridgeDirFor(dataRoot, getEnv, platform) {
  if (platform === "linux" || platform === "darwin") {
    const alias = await aliasPathFor(dataRoot, getEnv);
    return alias ? `${alias}-bridge` : null;
  }
  if (platform === "win32") {
    const base = getEnv("LOCALAPPDATA");
    if (typeof base !== "string" || !isDrivePath(base)) {
      return null;
    }
    return `${base.replace(/[\\/]+$/, "")}\\pb-orca-${await rootHashPrefix(dataRoot)}-bridge`;
  }
  return null;
}

/** Phase 63 (P63-35): a file in the bridge folder, joined with that platform's separator. */
export function bridgeFileFor(dir, name, platform) {
  return `${dir}${platform === "win32" ? "\\" : "/"}${name}`;
}

/**
 * The only path orcad's output takes. stdout is held in memory (at most 64 KiB) until the ready line
 * parses, then dropped for good: it carries the pairing offer, a reusable credential, and is never
 * passed to pushLog. stderr goes to pushLog line by line through redact.
 *
 * Phase 64 (P64-07, A6): onOffer, when given, is called once with readyLineOffer of that same buffer
 * just before it is dropped, so the offer reaches one writer and no other surface.
 */
export function createOutputSink({ pushLog, onOffer }) {
  let buffer = "";
  let parsed = null;
  let stderrRest = "";
  let stderrDropping = false;
  let resolveReady;
  const readyPromise = new Promise(resolve => {
    resolveReady = resolve;
  });
  return {
    onStdout(chunk) {
      if (parsed) {
        return;
      }
      buffer += String(chunk);
      if (buffer.length > STDOUT_KEEP_BYTES) {
        buffer = buffer.slice(-STDOUT_KEEP_BYTES);
      }
      parsed = parseReadyLine(buffer);
      if (parsed) {
        if (onOffer) {
          onOffer(readyLineOffer(buffer));
        }
        buffer = "";
        resolveReady(parsed);
      }
    },
    onStderr(chunk) {
      // A line is redacted whole or not logged at all: cutting one could split a pairing value and
      // leave a fragment the patterns no longer recognise.
      const parts = String(chunk).split("\n");
      parts.forEach((part, i) => {
        if (!stderrDropping) {
          stderrRest += part;
          if (stderrRest.length > STDERR_LINE_MAX) {
            stderrRest = "";
            stderrDropping = true;
          }
        }
        if (i < parts.length - 1) {
          if (stderrDropping) {
            pushLog("[orcad error line too long; not logged]");
          } else if (stderrRest.trim()) {
            pushLog(redact(stderrRest));
          }
          stderrRest = "";
          stderrDropping = false;
        }
      });
    },
    /** Resolves with the parsed ready fields; never rejects, and never resolves if orcad prints none. */
    ready() {
      return readyPromise;
    },
  };
}

/** The names orcad's environment must hold, given the names PowerBrowser's own environment holds. */
export function expectedEnvNames(pbNames) {
  const present = new Set(pbNames);
  return [...ORCAD_FIXED_ENV_NAMES, ...ORCAD_ENV_ALLOWLIST.filter(name => present.has(name))];
}

/** Set comparison both ways: names orcad has that it should not, and names it lacks. */
export function compareEnvNames(observedNames, expectedNames) {
  const observed = new Set(observedNames);
  const expected = new Set(expectedNames);
  return {
    extra: [...observed].filter(name => !expected.has(name)).sort(),
    missing: [...expected].filter(name => !observed.has(name)).sort(),
  };
}
