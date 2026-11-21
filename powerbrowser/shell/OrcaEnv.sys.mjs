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

/** Phase 68 (BEXT-01, D-30): the generic name seam 070 in orcad's loadClaudeAgentSdk reads; "" means no SDK. */
export const ORCAD_CLAUDE_AGENT_SDK_DIR_ENV = "ORCA_CLAUDE_AGENT_SDK_DIR";

/** Names buildOrcadEnv always sets, whatever PowerBrowser inherited. */
export const ORCAD_FIXED_ENV_NAMES = Object.freeze([
  "ORCA_USER_DATA",
  "ORCA_USER_DATA_PATH",
  "ORCA_VERSION",
  "ORCA_TELEMETRY_DISABLED",
  "DO_NOT_TRACK",
  ORCAD_HIDDEN_ELECTRON_SWITCH,
  ORCAD_CLAUDE_AGENT_SDK_DIR_ENV,
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
  // Audit fix 62-WR-06: the Windows names a Node process and its shells need there. Unset on Linux and
  // macOS, so they add nothing to orcad's environment on those platforms.
  "SystemRoot",
  "USERPROFILE",
  "LOCALAPPDATA",
  "ComSpec",
  "PATHEXT",
  "TEMP",
  "TMP",
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
export function buildOrcadEnv(getEnv, { dataRoot, orcaVersion, claudeAgentSdkDir } = {}) {
  if (typeof dataRoot !== "string" || !dataRoot) {
    throw new Error("buildOrcadEnv: no data root");
  }
  if (typeof orcaVersion !== "string" || !orcaVersion) {
    throw new Error("buildOrcadEnv: no Orca version");
  }
  // Every caller decides the SDK directory; "" is a decision (no SDK), undefined is not.
  if (typeof claudeAgentSdkDir !== "string") {
    throw new Error("buildOrcadEnv: no Claude agent SDK directory decision");
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
    [ORCAD_CLAUDE_AGENT_SDK_DIR_ENV]: claudeAgentSdkDir,
  };
  for (const name of ORCAD_FIXED_ENV_NAMES) {
    if (typeof fixed[name] !== "string") {
      throw new Error(`buildOrcadEnv: fixed name ${name} has no value`);
    }
    env[name] = fixed[name];
  }
  return env;
}

/** Phase 68 (D-30, P68-38): the pre-installed Theia extension carrying the Claude agent SDK, unversioned. */
export const CLAUDE_AGENT_SDK_EXTENSION_ID = "powerbrowser.claude-agent-sdk";
/** Phase 68 (P68-38): THEIA_CONFIG_DIR under the profile folder, as TheiaService._resolveConfigDir names it. */
export const THEIA_CONFIG_DIR_NAME = "powerbrowser-theia";
const THEIA_DISABLED_PLUGINS_KEY = "installedPlugins.disabledPlugins";

/** Phase 68 (P68-38): Theia's backend settings file, which holds the disabled-extension list. */
export function theiaBackendSettingsPath(profileDir) {
  return `${profileDir}/${THEIA_CONFIG_DIR_NAME}/backend-settings.json`;
}

/**
 * Phase 68 (D-30, P68-38): the value of ORCA_CLAUDE_AGENT_SDK_DIR. The SDK package directory inside the
 * extension's version-free seeded copy, or "" when Theia has the extension disabled. backendSettings is
 * the parsed backend-settings.json or null; its disabled list is a JSON string of ids that Theia reads
 * unversioned, and a missing or malformed list counts as nothing disabled, as Theia's own load does.
 */
export function claudeAgentSdkDir({ profileDir, backendSettings }) {
  let disabled = [];
  try {
    disabled = JSON.parse(backendSettings?.[THEIA_DISABLED_PLUGINS_KEY]);
  } catch {
    disabled = [];
  }
  const unversioned = id => (typeof id === "string" ? id.split("@")[0] : null);
  if (Array.isArray(disabled) && disabled.some(id => unversioned(id) === CLAUDE_AGENT_SDK_EXTENSION_ID)) {
    return "";
  }
  return `${profileDir}/${THEIA_CONFIG_DIR_NAME}/deployedPlugins/${CLAUDE_AGENT_SDK_EXTENSION_ID}/extension/node_modules/@anthropic-ai/claude-agent-sdk`;
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

/**
 * Audit fix 62-WR-06: whether a data root needs the short alias on a Node platform. Never on win32, where
 * orcad's RPC endpoint is a named pipe and no socket path exists to fit.
 */
export function aliasNeeded(root, platform) {
  return platform !== "win32" && !socketPathFits(root);
}

/**
 * Audit fix 62-WR-06: ln's arguments for the alias. GNU ln (linux) takes -T, which refuses to write into a
 * real directory; BSD ln (darwin) has no -T, so there the caller checks that the alias is not a real
 * directory before it runs -sfn, which replaces a link without following it.
 */
export function aliasLinkArgs(platform, target, alias) {
  return [platform === "darwin" ? "-sfn" : "-sfnT", target, alias];
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
 *
 * Phase 67 (P67-02): onOfferUnavailable, when given, is called once with
 * readyLineOfferUnavailableReason of that buffer: a reason code or null, never another pairing field.
 */
export function createOutputSink({ pushLog, onOffer, onOfferUnavailable }) {
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
        // Phase 67 (P67-02): the reason code alone, and only a member of the pinned set.
        if (onOfferUnavailable) {
          onOfferUnavailable(readyLineOfferUnavailableReason(buffer));
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

// ---------------------------------------------------------------------------
// Phase 67 (RUN-06, P67-02, P67-03, P67-36): the one chrome-side classification of Orca hosting
// failures. OrcaService reports the class through getState(); the frontend reads it through the
// orcaStatus shell kind and renders the copy for it (orca-panes). No copy lives here.

/** The failure classes, in the order of the interfaces block (67-01 and 67-03); browser-not-attached is P67-36. */
export const ORCA_FAILURE_CLASSES = Object.freeze([
  "restarting",
  "could-not-start",
  "port-in-use",
  "files-missing",
  "temporary-profile",
  "plaintext-setting",
  "pairing-lost",
  "browser-not-attached",
]);

/** orcad failure codes OrcaService puts in the "Orca failure code" row: a busy port and a held lock read the same. */
export const ORCA_CODE_CLASSES = Object.freeze({
  [ORCAD_PINNED_PORT_CODE]: "port-in-use",
  [ORCAD_LOCK_HELD_CODE]: "port-in-use",
});

/**
 * Every failed-step string OrcaService passes to _fail or returns as a step, to one class.
 * orca-failure-classes derives the step set from OrcaService.sys.mjs and compares it with these keys.
 */
export const ORCA_STEP_CLASSES = Object.freeze({
  "resolving the profile folder": "could-not-start",
  "creating the Orca data folder": "could-not-start",
  "finding Node.js": "could-not-start",
  "finding the built Orca files": "files-missing",
  "reading the Orca version": "could-not-start",
  "reading the Orca port": "could-not-start",
  "choosing a short path for the Orca data folder": "could-not-start",
  "linking a short path to the Orca data folder": "could-not-start",
  "starting the orcad process": "could-not-start",
  stopping: "could-not-start",
  "waiting for orcad to report ready": "could-not-start",
  "starting orcad": "could-not-start",
  "checking that orcad is bound to loopback": "could-not-start",
  "checking the Node.js version orcad runs on": "could-not-start",
  "an unexpected error": "could-not-start",
  "restarting orcad after repeated exits": "could-not-start",
  "checking for a temporary profile folder": "temporary-profile",
  "checking the Orca sign-in storage setting": "plaintext-setting",
});

/** Orca's PairingOfferUnavailableReason at the pin (runtime-rpc-pairing-types.ts), seen in orcad's ready line. */
export const ORCA_OFFER_UNAVAILABLE_REASONS = Object.freeze([
  "websocket_unavailable",
  "device_registry_unavailable",
  "e2ee_key_unavailable",
  "invalid_advertised_endpoint",
  "relay_mint_failed",
  "network_exposure_failed",
]);

/** The client reason that is browser-not-attached (P67-36); every other client reason is pairing-lost. */
export const ORCA_BROWSER_HOST_REASON = "browser-host-attach-failed";

/**
 * The closed set the frontend may send with orcaStatus: Orca's WebRuntimeAuthFailureReason at the pin,
 * PowerBrowser's offer-file refusals (orca-panes offer-file-policy.ts) and the browser-host reason.
 */
export const ORCA_CLIENT_REASONS = Object.freeze([
  "unauthorized",
  "device-revoked",
  "device-downgraded",
  "insecure-origin",
  "offer-missing",
  "offer-unreadable",
  "offer-symlink",
  "offer-not-regular",
  "offer-owner",
  "offer-mode",
  "offer-endpoint",
  ORCA_BROWSER_HOST_REASON,
]);

/** True only for a member of ORCA_CLIENT_REASONS. */
export function isClientReason(value) {
  return typeof value === "string" && ORCA_CLIENT_REASONS.includes(value);
}

/** The ready line's pairing-unavailable reason when it is a member of the pinned set, else null. */
export function readyLineOfferUnavailableReason(text) {
  const line = String(text)
    .split("\n")
    .find(l => l.startsWith("{") && l.includes(READY_MARKER));
  let record = null;
  try {
    record = line ? JSON.parse(line) : null;
  } catch {
    return null;
  }
  const reason = record?.pairing?.reason;
  return record?.pairing?.available === false && ORCA_OFFER_UNAVAILABLE_REASONS.includes(reason) ? reason : null;
}

/**
 * One class or null. While the state is failed a cause with no mapping is could-not-start, never null
 * (P67-03). While ready, an unavailable pairing offer is pairing-lost and a held browser-host reason
 * is browser-not-attached (P67-36).
 */
export function failureClassOf({ state, restarting, step, code, offerUnavailableReason, clientReason } = {}) {
  if (restarting === true) {
    return "restarting";
  }
  if (state === "failed") {
    const own = (map, key) => (typeof key === "string" && Object.hasOwn(map, key) ? map[key] : null);
    return own(ORCA_CODE_CLASSES, code) ?? own(ORCA_STEP_CLASSES, step) ?? "could-not-start";
  }
  if (state === "ready" && offerUnavailableReason) {
    return "pairing-lost";
  }
  if (state === "ready" && clientReason === ORCA_BROWSER_HOST_REASON) {
    return "browser-not-attached";
  }
  return null;
}

/**
 * The orcaStatus reply body: the state, the class and the start generation, and nothing else of getState()
 * (P67-04). Audit fix 67-CR-01 (lane G3b): the generation is a count of orcad starts that reached ready in this
 * session, a plain integer that names no process, port or path; the frontend re-pairs when it changes.
 */
export function orcaStatusReply(state) {
  return { state: state.state, failureClass: state.failureClass, generation: Number.isInteger(state.generation) && state.generation >= 0 ? state.generation : 0 };
}

// ---------------------------------------------------------------------------
// Phase 67 (RUN-09, P67-16..P67-19): what OrcaService refuses before it spawns orcad, and the one
// sentence that states what protects Orca sign-ins. orca-credential-store compares these with the
// pinned Orca source.

/** Orca's plaintext override (orcad-secret-protection-gap.ts) and its trigger value; never in ORCAD_ENV_ALLOWLIST. */
export const ORCA_PLAINTEXT_OVERRIDE = Object.freeze({ name: "ORCA_HEADLESS_SECRET_STORE", value: "plaintext" });

/** Environment names that name a temporary folder, per Node platform (Gecko's TmpD and Node's tmpdir() read them). */
export const ORCA_TEMP_ENV_NAMES = Object.freeze({
  linux: Object.freeze(["TMPDIR", "TMP", "TEMP"]),
  darwin: Object.freeze(["TMPDIR", "TMP", "TEMP"]),
  win32: Object.freeze(["TEMP", "TMP"]),
});

/** Fixed temporary folders per Node platform, with macOS's /private forms (A-4). */
export const ORCA_FIXED_TEMP_ROOTS = Object.freeze({
  linux: Object.freeze(["/tmp", "/var/tmp"]),
  darwin: Object.freeze(["/tmp", "/var/tmp", "/private/tmp", "/private/var/tmp"]),
  win32: Object.freeze([]),
});

/**
 * The first of `roots` that equals, or is a whole-segment prefix of, one of `paths`; else null. win32
 * compares case-insensitively with either separator (Pitfall 6). Empty or non-string entries are skipped.
 */
export function tempRootOf({ paths, roots, platform } = {}) {
  const win = platform === "win32";
  const norm = value => {
    let out = win ? value.replace(/\//g, "\\").toLowerCase() : value;
    const sep = win ? "\\" : "/";
    while (out.endsWith(sep)) {
      out = out.slice(0, -1);
    }
    return out;
  };
  const usable = list => (Array.isArray(list) ? list.filter(v => typeof v === "string" && v !== "") : []);
  const targets = usable(paths).map(norm);
  for (const root of usable(roots)) {
    const r = norm(root);
    const sep = win ? "\\" : "/";
    if (targets.some(t => t === r || t.startsWith(`${r}${sep}`))) {
      return root;
    }
  }
  return null;
}

/** P67-19: the folder orcad keeps its credential key in (orcadCredentialRoot, homedir()/.orca), or null. */
export function credentialKeyFolderFor(getEnv, platform) {
  const home = getEnv(platform === "win32" ? "USERPROFILE" : "HOME");
  if (typeof home !== "string" || home === "") {
    return null;
  }
  if (platform === "win32") {
    return `${home.replace(/[\\/]+$/, "")}\\.orca`;
  }
  return platform === "linux" || platform === "darwin" ? `${home.replace(/\/+$/, "")}/.orca` : null;
}

/** P67-18: the protection sentence, byte-identical in website-staging/privacy.html and orca-panes' copy table. */
export const ORCA_PROTECTION_SENTENCE =
  "PowerBrowser protects Orca sign-ins with a key file that only your user account can read, not with your system's keyring.";

// ---- Orca landing logo (Phase 67, INJ-01, P67-22..P67-24) ----
// The CSS selectors of Orca's landing-tile logo, keyed by the Orca version they were read from (Landing.tsx:258-267 and
// the built out/web/assets/Landing-*.js at the pin). A version with no entry gets no injection, one log line and the
// diagnostics row "Orca logo selectors", never a guess. orca-landing-selectors ties the entry to the built chunk.
export const ORCA_LANDING_SELECTORS = Object.freeze({
  "1.4.248": Object.freeze(["div.size-20.rounded-2xl > img.size-12"]),
});

/** The alt text the PowerBrowser mark carries on Orca's landing tile (the only copy INJ-01 adds). */
export const ORCA_LOGO_ALT = "PowerBrowser logo";

/** The selector list for an Orca version, or null when the version has no entry. */
export function logoSelectorsFor(version) {
  return typeof version === "string" && Object.hasOwn(ORCA_LANDING_SELECTORS, version) ? ORCA_LANDING_SELECTORS[version] : null;
}

/**
 * P67-23: the PowerBrowserOrcaLogo parent's answer. Only a document on orcad's own port while Orca is ready, not
 * embedded by the shell's Theia browser, running an Orca version with selectors, gets { src, alt, selectors }; every
 * other sender gets null. D-37 (67-VERIFICATION): the port alone is not orcad's while Orca is not ready (failed with
 * port-in-use means another program holds it), so the state is part of the gate.
 */
export function logoAnswerFor({ senderPort, orcaPort, orcaState, embeddedByShell, orcaVersion, markDataUri } = {}) {
  if (orcaState !== "ready" || !Number.isInteger(senderPort) || !Number.isInteger(orcaPort) || senderPort !== orcaPort || embeddedByShell !== false) {
    return null;
  }
  const selectors = logoSelectorsFor(orcaVersion);
  if (!selectors || selectors.length === 0 || typeof markDataUri !== "string" || !markDataUri.startsWith("data:image/svg+xml")) {
    return null;
  }
  return { src: markDataUri, alt: ORCA_LOGO_ALT, selectors: [...selectors] };
}

// ---- orcad's tie to PowerBrowser's lifetime (audit fixes orcad-hosting-01, orcad-hosting-08, 62-WR-01) ----
// OrcaService ends orcad, its terminal daemon and the agents under it on a granted quit. A crash, a SIGKILL or an
// OOM kill of PowerBrowser runs none of that code, so the tie must hold without PowerBrowser running anything at
// exit. Subprocess always gives a child a stdin pipe whose only writer is PowerBrowser (the pipe is close-on-exec,
// so no other child holds it): when PowerBrowser ends for any reason the kernel closes that writer and the child
// reads end-of-file. The Theia backend's parent-death watchdog rests on the same fact. Two PowerBrowser-owned
// readers of such a pipe carry the tie, neither needing a change to Orca's source:
//
// The orcad watch, a module preloaded into orcad's Node (--import). orcad has no parent watch of its own, and its
// shutdown only disconnects from the detached daemon.
//  - end-of-file on stdin: PowerBrowser is gone. orcad is asked to stop (SIGTERM, its own graceful shutdown), and
//    as it exits the module ends its descendants and the daemon OrcaService named, snapshot first, SIGTERM to the
//    roots, then SIGKILL for what is left after the grace, each by pid plus start ticks.
//  - orcad exiting before OrcaService accepted its ready line (a failed start): the same end, for its own
//    descendants only, so a failed start leaves no daemon of its own behind. After acceptance an orcad exit ends
//    nothing: an orcad crash leaves the daemon and its agents for the next orcad to adopt, and only a quit ends
//    agents (D-07).
//  - two lines name the daemon: the adopted line, written right after a spawn while this session already keeps a
//    daemon, and the accepted line, written once the ready line is accepted. Only the accepted line marks the
//    start accepted; either way the named daemon is ended only when PowerBrowser is gone, never on orcad's exit.
// The module arms only in the process whose entry file is orcad's and whose stdin is a pipe (Subprocess) or a
// socket (a Node parent, as in the repo checks), never /dev/null or a terminal: orcad starts its daemon with its
// own Node flags (daemon-launched-child-spawn.ts), and that daemon must load the module inertly.
//
// The keeper, a small Node process of its own (audit follow-up to orcad-hosting-01), for the windows in which a kept
// daemon has no accepted orcad: the backoff before a respawn, a respawn before its ready line, and the failed
// states that keep the daemon while the failure page is up. OrcaService starts it when orcad exits unexpectedly,
// names the kept daemon to it by pid and start ticks, and releases it once a new orcad is accepted or the stop has
// ended the daemon. On end-of-file it ends the named daemon and everything under it, as the watch does.

/** The kind of the line OrcaService writes to orcad's stdin once it accepts a ready line. */
export const ORCAD_ACCEPTED_KIND = "pb-orcad-accepted";
/** The kind of the line naming a daemon this session already keeps, to a new orcad or to the keeper; not an acceptance. */
export const ORCAD_ADOPTED_KIND = "pb-orcad-adopted";
/** The kind of the line that lets the keeper exit without ending anything. */
export const ORCAD_KEEPER_RELEASE_KIND = "pb-orcad-release";
/** How long the watch waits for SIGTERMed descendants before it kills what is left (OrcaService's DAEMON_GRACE_MS). */
export const ORCAD_WATCH_GRACE_MS = 3000;
/** The latest the watch lets orcad's own shutdown run after end-of-file before it exits orcad itself. */
export const ORCAD_WATCH_EXIT_DEADLINE_MS = 20000;

// Shared by both sources: the /proc table, the tree under some roots, the identity test, and the end of a tree
// (SIGTERM to the given roots, the grace, SIGKILL for every row still the process it was). Plain text.
const PROC_HELPERS = `const statOf = pid => {
  try {
    const text = readFileSync("/proc/" + pid + "/stat", "utf8");
    const fields = text.slice(text.lastIndexOf(")") + 2).split(" ");
    return { pid, ppid: Number(fields[1]), ticks: fields[19] ?? null };
  } catch {
    return null;
  }
};
const table = () => {
  const rows = new Map();
  let names = [];
  try {
    names = readdirSync("/proc");
  } catch {
    names = [];
  }
  for (const name of names) {
    const pid = Number(name);
    const row = Number.isInteger(pid) && pid > 0 ? statOf(pid) : null;
    if (row) {
      rows.set(pid, row);
    }
  }
  return rows;
};
const treeOf = (roots, rows) => {
  const children = new Map();
  for (const row of rows.values()) {
    if (!children.has(row.ppid)) {
      children.set(row.ppid, []);
    }
    children.get(row.ppid).push(row.pid);
  }
  const seen = new Set();
  const stack = roots.filter(pid => rows.has(pid));
  while (stack.length) {
    const pid = stack.pop();
    if (!seen.has(pid)) {
      seen.add(pid);
      stack.push(...(children.get(pid) ?? []));
    }
  }
  return [...seen].map(pid => rows.get(pid));
};
const same = row => {
  const now = statOf(row.pid);
  return now !== null && row.ticks !== null && now.ticks === row.ticks;
};
const signal = (row, name) => {
  if (same(row)) {
    try {
      process.kill(row.pid, name);
    } catch {
      // Gone between the check and the signal.
    }
  }
};
const pause = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const endRows = (tree, isRoot) => {
  for (const row of tree) {
    if (isRoot(row)) {
      signal(row, "SIGTERM");
    }
  }
  for (let waited = 0; waited < GRACE_MS && tree.some(same); waited += 100) {
    pause(100);
  }
  for (const row of tree) {
    signal(row, "SIGKILL");
  }
};
const namedFrom = record => {
  const pid = record.daemonPid;
  return Number.isInteger(pid) && pid > 0 && record.daemonTicks != null ? { pid, ticks: String(record.daemonTicks) } : null;
};
const readLines = onLine => {
  let pending = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", chunk => {
    pending += chunk;
    for (let at = pending.indexOf("\\n"); at >= 0; at = pending.indexOf("\\n")) {
      const line = pending.slice(0, at);
      pending = pending.slice(at + 1);
      let record = null;
      try {
        record = JSON.parse(line);
      } catch {
        record = null;
      }
      if (record) {
        onLine(record);
      }
    }
  });
};
`;

const PROC_IMPORTS = `import { fstatSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { isMainThread } from "node:worker_threads";
`;

/** The watch module's source for one orcad entry file. Pure text; OrcaService never evaluates it. */
export function orcadParentWatchSource({ orcadMain } = {}) {
  if (typeof orcadMain !== "string" || !orcadMain) {
    throw new Error("orcadParentWatchSource: no orcad entry file");
  }
  return `${PROC_IMPORTS}const MAIN = ${JSON.stringify(orcadMain)};
const ACCEPTED = ${JSON.stringify(ORCAD_ACCEPTED_KIND)};
const ADOPTED = ${JSON.stringify(ORCAD_ADOPTED_KIND)};
const GRACE_MS = ${ORCAD_WATCH_GRACE_MS};
const DEADLINE_MS = ${ORCAD_WATCH_EXIT_DEADLINE_MS};
const isArmed = () => {
  try {
    const stdin = fstatSync(0);
    return isMainThread && process.argv[1] === resolve(MAIN) && (stdin.isFIFO() || stdin.isSocket());
  } catch {
    return false;
  }
};
if (isArmed()) {
${PROC_HELPERS}  let accepted = false;
  let parentGone = false;
  let daemon = null;
  const endTree = () => {
    const rows = table();
    const roots = [process.pid];
    // The named daemon only when PowerBrowser is gone; a failed start ends only what this orcad started.
    if (parentGone && daemon && rows.get(daemon.pid)?.ticks === daemon.ticks) {
      roots.push(daemon.pid);
    }
    const tree = treeOf(roots, rows).filter(row => row.pid !== process.pid);
    endRows(tree, row => row.ppid === process.pid || (daemon && row.pid === daemon.pid));
  };
  process.on("exit", () => {
    if (parentGone || !accepted) {
      endTree();
    }
  });
  const gone = () => {
    if (parentGone) {
      return;
    }
    parentGone = true;
    setTimeout(() => process.exit(1), DEADLINE_MS).unref();
    if (process.listenerCount("SIGTERM") > 0) {
      process.kill(process.pid, "SIGTERM");
    } else {
      process.exit(1);
    }
  };
  readLines(record => {
    if (record.kind === ACCEPTED || record.kind === ADOPTED) {
      daemon = namedFrom(record) ?? (record.kind === ACCEPTED ? null : daemon);
    }
    if (record.kind === ACCEPTED) {
      accepted = true;
    }
  });
  process.stdin.on("end", gone);
  process.stdin.on("error", gone);
  process.stdin.resume();
  if (typeof process.stdin.unref === "function") {
    process.stdin.unref();
  }
}
`;
}

/** The keeper's source: holds a kept daemon by pid and start ticks, and ends its tree when PowerBrowser is gone. */
export function orcadKeeperSource() {
  return `import { readdirSync, readFileSync } from "node:fs";
const ADOPTED = ${JSON.stringify(ORCAD_ADOPTED_KIND)};
const RELEASE = ${JSON.stringify(ORCAD_KEEPER_RELEASE_KIND)};
const GRACE_MS = ${ORCAD_WATCH_GRACE_MS};
${PROC_HELPERS}let daemon = null;
let done = false;
// A hangup or an interrupt aimed at PowerBrowser's terminal is not PowerBrowser ending: end-of-file follows if it is.
process.on("SIGHUP", () => {});
process.on("SIGINT", () => {});
const gone = () => {
  if (done) {
    return;
  }
  done = true;
  const rows = table();
  if (daemon && rows.get(daemon.pid)?.ticks === daemon.ticks) {
    endRows(treeOf([daemon.pid], rows), row => row.pid === daemon.pid);
  }
  process.exit(0);
};
readLines(record => {
  if (record.kind === ADOPTED) {
    daemon = namedFrom(record);
  }
  if (record.kind === RELEASE) {
    done = true;
    process.exit(0);
  }
});
process.stdin.on("end", gone);
process.stdin.on("error", gone);
process.stdin.resume();
`;
}

/** The Node flags that preload the watch into orcad, placed before orcad's entry file. */
export function buildOrcadWatchArgs({ orcadMain } = {}) {
  return ["--import", `data:text/javascript,${encodeURIComponent(orcadParentWatchSource({ orcadMain }))}`];
}

/** The keeper's whole argument list: an ES module from the command line, nothing on disk. */
export function buildOrcadKeeperArgs() {
  return ["--input-type=module", "--eval", orcadKeeperSource()];
}

/** The line OrcaService writes to orcad's stdin once it accepts the ready line: the daemon the watch may end. */
export function orcadAcceptedLine({ daemonPid, daemonTicks } = {}) {
  const pid = Number.isInteger(daemonPid) && daemonPid > 0 ? daemonPid : null;
  return JSON.stringify({ kind: ORCAD_ACCEPTED_KIND, daemonPid: pid, daemonTicks: pid !== null && daemonTicks != null ? String(daemonTicks) : null });
}

/** The line naming a daemon this session keeps, to a new orcad before acceptance or to the keeper. */
export function orcadAdoptedLine({ daemonPid, daemonTicks } = {}) {
  const pid = Number.isInteger(daemonPid) && daemonPid > 0 ? daemonPid : null;
  return JSON.stringify({ kind: ORCAD_ADOPTED_KIND, daemonPid: pid, daemonTicks: pid !== null && daemonTicks != null ? String(daemonTicks) : null });
}

/** The line that releases the keeper. */
export function orcadKeeperReleaseLine() {
  return JSON.stringify({ kind: ORCAD_KEEPER_RELEASE_KIND });
}

// ---- Who holds orcad's port (audit fix orcad-hosting-03, diagnostics part) ----

/**
 * Local addresses, as /proc/net/tcp and /proc/net/tcp6 spell them (each 32-bit word in host order, little-endian),
 * whose listener blocks orcad's bind on 127.0.0.1: 127.0.0.1 and 0.0.0.0, and in the IPv6 table :: (dual-stack,
 * Node's default, listed in the IPv6 table only) and the IPv4-mapped ::ffff:127.0.0.1 and ::ffff:0.0.0.0. ::1 is
 * not listed: it does not hold the IPv4 address (audit follow-up to orcad-hosting-03).
 */
const LOOPBACK_BLOCKING_ADDRESSES = Object.freeze([
  "0100007F",
  "00000000",
  "00000000000000000000000000000000",
  "0000000000000000FFFF00000100007F",
  "0000000000000000FFFF000000000000",
]);

/**
 * The uid of a listener whose address blocks 127.0.0.1:<port>, from the text of /proc/net/tcp and /proc/net/tcp6
 * (a string or an array of them), or null. A row is "sl local_address rem_address st tx:rx tr:tm retrnsmt uid ...",
 * and st 0A is LISTEN.
 */
export function portHolderUidOf(tables, port) {
  const texts = (Array.isArray(tables) ? tables : [tables]).filter(text => typeof text === "string");
  if (!texts.length || !Number.isInteger(port)) {
    return null;
  }
  const hexPort = port.toString(16).toUpperCase().padStart(4, "0");
  for (const text of texts) {
    for (const line of text.split("\n").slice(1)) {
      const fields = line.trim().split(/\s+/);
      if (fields.length < 8 || fields[3] !== "0A") {
        continue;
      }
      const [address, rowPort] = fields[1].toUpperCase().split(":");
      if (rowPort === hexPort && LOOPBACK_BLOCKING_ADDRESSES.includes(address)) {
        const uid = Number(fields[7]);
        return Number.isInteger(uid) ? uid : null;
      }
    }
  }
  return null;
}

/** The diagnostics value for the port holder: whose program holds the port, or null when that is not known. */
export function portHolderRowValue(holderUid, ownUid) {
  if (!Number.isInteger(holderUid) || !Number.isInteger(ownUid)) {
    return null;
  }
  return holderUid === ownUid ? "a program of this user" : `another user (uid ${holderUid})`;
}
