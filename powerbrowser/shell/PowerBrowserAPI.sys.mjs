/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * D-96/D-97: the single anti-corruption layer. This is the ONLY file in
 * powerbrowser/ permitted to reach a Firefox internal (Services, Cc/Ci/Cr/Cu,
 * Subprocess, the cookie manager, quit observers) -- every method below is
 * a thin named wrapper with no policy of its own, so the audit surface at
 * the next ESR rebase is exactly this file. Every touchpoint is catalogued
 * in powerbrowser/INTERNAL-APIS.md (plan 04-05).
 */

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  Subprocess: "resource://gre/modules/Subprocess.sys.mjs",
  ctypes: "resource://gre/modules/ctypes.sys.mjs",
  // D-119 (05-03): MOZ_APP_VERSION_DISPLAY is a build-time preprocessor
  // substitution (config/version_display.txt), not a runtime API -- but
  // AppConstants is on the boundary guard's own forbidden-pattern list
  // (FORBIDDEN_PATTERNS), so it is reached here, in the one lazy-getter
  // block, rather than imported anywhere else.
  AppConstants: "resource://gre/modules/AppConstants.sys.mjs",
  // SQL-01 (12-01): the tab-store writer's three reach-throughs. Sqlite
  // opens tabs.sqlite, PrivateBrowsingUtils filters private windows before
  // upsert, SessionStore sources quarantine rebuilds and the sweep.
  Sqlite: "resource://gre/modules/Sqlite.sys.mjs",
  PrivateBrowsingUtils: "resource://gre/modules/PrivateBrowsingUtils.sys.mjs",
  SessionStore: "resource:///modules/sessionstore/SessionStore.sys.mjs",
  // GUI-08 (15-02): last-view reach-through. PageThumbs draws a stock tab
  // browser into a canvas at card width; capture stays chrome-side.
  PageThumbs: "resource://gre/modules/PageThumbs.sys.mjs",
  // SQL-04 (12-02): read-only reach-throughs. PlacesUtils backs the
  // history, bookmark, and folder-listing readers (fetch and
  // getFolderContents only -- never a raw places file open); the
  // sessionstore projection reuses the SessionStore line above.
  PlacesUtils: "resource://gre/modules/PlacesUtils.sys.mjs",
  // Phase 31 (SITE-02/03, D-31-03/D-31-06): the identity read-throughs.
  // SiteDataManager backs the registrable-domain highlight and the site-data
  // probe; SitePermissions backs the per-site reads (writes land in plan 02);
  // ContentBlockingAllowList backs the per-site shield exception (plan 03).
  SiteDataManager: "resource:///modules/SiteDataManager.sys.mjs",
  SitePermissions: "resource:///modules/SitePermissions.sys.mjs",
  ContentBlockingAllowList: "resource://gre/modules/ContentBlockingAllowList.sys.mjs",
});

// Strong references to in-flight one-shot timers created by sleep(). See the
// comment in sleep() -- without this they can be garbage-collected before they
// fire and the awaiting promise never settles.
const pendingTimers = new Set();

// SQL-01 (12-01): v1 tab-store schema carried verbatim from SCHEMA.md. The
// roundtrip proof (scripts/verify-sql-store-roundtrip.mjs) extracts the text
// between the DDL markers at check time and fails distinctly when they are
// absent -- the DDL lives here once, never as a copy. No private, window,
// pinned, or credential-shaped column exists by construction.
const TAB_STORE_SCHEMA_HEAD = 6;
const TABS_STORE_V1_DDL = /* PB-SQL-TABS-DDL-START */ `CREATE TABLE tabs (
  uri         TEXT PRIMARY KEY CHECK(length(uri) > 0),
  url         TEXT NOT NULL,
  title       TEXT NOT NULL DEFAULT '',
  last_active INTEGER NOT NULL CHECK(last_active >= 0)
);

CREATE INDEX idx_tabs_last_active ON tabs (last_active);` /* PB-SQL-TABS-DDL-END */;

// GUI-08 (15-01): v2 groups schema carried verbatim from 15-RESEARCH.md. The
// persistence gate (scripts/verify-gui08-persistence-roundtrip.mjs) extracts
// the text between the GROUPS markers at check time -- the DDL lives here
// once, never as a copy. group_id/thumbnail ride the tabs table as NULLable
// columns so ungrouped rows and text-fallback cards are plain NULLs, never
// sentinel strings.
const GROUPS_STORE_V2_DDL = /* PB-SQL-GROUPS-DDL-START */ `CREATE TABLE groups (
  id          TEXT PRIMARY KEY CHECK(length(id) > 0),
  title       TEXT NOT NULL DEFAULT 'Untitled group',
  x           INTEGER NOT NULL DEFAULT 0 CHECK(x >= 0),
  y           INTEGER NOT NULL DEFAULT 0 CHECK(y >= 0),
  w           INTEGER NOT NULL DEFAULT 400 CHECK(w >= 200),
  h           INTEGER NOT NULL DEFAULT 300 CHECK(h >= 144),
  is_active   INTEGER NOT NULL DEFAULT 0 CHECK(is_active IN (0, 1))
);
CREATE INDEX idx_groups_active ON groups (is_active);
ALTER TABLE tabs ADD COLUMN group_id TEXT NULL;
CREATE INDEX idx_tabs_group ON tabs (group_id);
ALTER TABLE tabs ADD COLUMN thumbnail TEXT NULL;` /* PB-SQL-GROUPS-DDL-END */;

// GUI-08 (W-loose): where a tab sits when it is in no group. NULL means "not
// placed" -- the canvas lays those out along the bottom itself, so an
// existing store upgrades without inventing coordinates for every row.
const TAB_POSITION_V3_DDL = /* PB-SQL-TABPOS-DDL-START */ `ALTER TABLE tabs ADD COLUMN x INTEGER NULL;
ALTER TABLE tabs ADD COLUMN y INTEGER NULL;` /* PB-SQL-TABPOS-DDL-END */;

// GUI-08 (W10): a tab's place within its group. NULL means "never ordered",
// which sorts after everything that has been, so an upgraded store keeps its
// existing URI order until the first time a group is arranged by hand.
const TAB_ORDER_V4_DDL = /* PB-SQL-TABORD-DDL-START */ `ALTER TABLE tabs ADD COLUMN ord INTEGER NULL;` /* PB-SQL-TABORD-DDL-END */;

// NG-001 (non-GUI wave A): v4 to v5 -- one row per tab, keyed by the tab's
// identity instead of its page URL, plus the content-age, closed-history and
// settings columns the rest of the store builds on (docs/TAB-STORE.md). The
// key rewrite runs in the same transaction as the columns, in place, so every
// row keeps its rowid, group, position, order and thumbnail. GLOB, never LIKE:
// Sqlite.sys.mjs refuses any LIKE without a bound pattern (its
// isInvalidBoundLikeQuery), and this block runs as plain statements. The same
// holds for every prefix match on tabs.uri in this file.
const TAB_STORE_V5_DDL = /* PB-SQL-V5-DDL-START */ `ALTER TABLE tabs ADD COLUMN created_at INTEGER NULL;
ALTER TABLE tabs ADD COLUMN last_accessed INTEGER NULL;
ALTER TABLE tabs ADD COLUMN closed_at INTEGER NULL;
CREATE INDEX IF NOT EXISTS idx_tabs_closed_at ON tabs (closed_at);
CREATE TABLE IF NOT EXISTS settings (
  key         TEXT PRIMARY KEY CHECK(length(key) > 0),
  value       TEXT NOT NULL
);
INSERT OR IGNORE INTO settings (key, value) VALUES ('closed_retention_days', '7');
INSERT OR IGNORE INTO settings (key, value) VALUES ('integrity_check_minutes', '1440');
INSERT OR IGNORE INTO settings (key, value) VALUES ('restore_behaviour', 'session');
INSERT OR IGNORE INTO settings (key, value) VALUES ('restore_live_minutes', '5');
INSERT OR IGNORE INTO settings (key, value) VALUES ('restore_url_days', '30');
UPDATE tabs SET uri = 'stock:legacy-' || rowid WHERE uri GLOB 'webview:*';
UPDATE tabs SET uri = 'web:legacy-' || rowid WHERE uri GLOB 'http://*' OR uri GLOB 'https://*'` /* PB-SQL-V5-DDL-END */;

// NG-028 (non-GUI wave B): v6, one saved full-page copy per tab; the newest
// copy replaces the older one, files included. dir is the copy's directory
// under <profile>/saved-pages/, and savePageCopy never deletes a dir outside it.
const TAB_STORE_V6_DDL = /* PB-SQL-V6-DDL-START */ `CREATE TABLE IF NOT EXISTS saved_pages (
  tab_uri     TEXT PRIMARY KEY CHECK(length(tab_uri) > 0),
  dir         TEXT NOT NULL,
  url         TEXT NOT NULL,
  title       TEXT NOT NULL DEFAULT '',
  saved_at    INTEGER NOT NULL CHECK(saved_at >= 0),
  bytes       INTEGER NOT NULL CHECK(bytes >= 0)
)` /* PB-SQL-V6-DDL-END */;

// NG-001: the sessionstore custom tab value a stock tab's row key lives in.
// Sessionstore saves it with the tab and restores it with the tab, so a
// restart keeps the key (SessionStore.sys.mjs:6541 restores extData).
const STOCK_TAB_KEY_VALUE = "powerbrowser-tab-key";
// Stock keys minted this launch: a new launch mints from a new stamp, so a key
// is never reused while its row may still exist.
const STOCK_KEY_STAMP = Date.now().toString(36);
let stockKeySeq = 0;
// F6: the key this launch has given each stock tab (tab -> key). WeakMap, so
// a closed tab drops out.
const stockTabKeys = new WeakMap();

// NG-001: the only web-tab key chrome accepts from the frontend.
function webTabKeyIsValid(key) {
  return typeof key === "string" && /^web:[A-Za-z0-9_-]{1,64}$/.test(key);
}

// NG-010: a stable short hash for keying a closed tab the store never saw.
function stringHash(text) {
  let hash = 5381;
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash * 33) ^ text.charCodeAt(i)) >>> 0;
  }
  return hash.toString(36);
}

// NG-085: the store's connection is closed from Sqlite.sys.mjs's own shutdown
// barrier (profile-before-change), which Sqlite lifts before it waits for its
// open connections to close. Without it that wait never ended and every quit
// with the store open hung until AsyncShutdown aborted it. Once closing, the
// store refuses to reopen: a late write would open a connection nothing closes.
let tabStoreShutdownHooked = false;
let tabStoreClosing = false;

// NG-018 (final review I2): one store opener. While an open or a quarantine
// runs, tabStoreOpening is the promise of its end; openTabStore, the
// quarantine and the shutdown close wait on it, so no second connection is
// ever opened beside the one in flight or onto a file being replaced.
let tabStoreOpening = null;

async function holdTabStore(work) {
  while (tabStoreOpening) {
    await tabStoreOpening;
  }
  let release;
  tabStoreOpening = new Promise(resolve => {
    release = resolve;
  });
  try {
    return await work();
  } finally {
    tabStoreOpening = null;
    release();
  }
}

// A connection that finished opening after the shutdown close began is closed
// by its opener (the throw lands in the opener's catch), never left open.
function refuseIfTabStoreClosing(method) {
  if (tabStoreClosing) {
    throw new Error(`${method}: the store is closed for shutdown`);
  }
}

// M4: a tab key's kind, safe to log -- never the key, which for a Theia
// editor is a file path.
function tabKeyKind(uri) {
  const match = /^(stock|web|file|widget):/.exec(String(uri));
  return match ? match[1] : "other";
}

function closeTabStoreAtShutdown() {
  if (tabStoreShutdownHooked) {
    return;
  }
  // Throws once Sqlite's barrier has closed; openConnection would refuse then too.
  lazy.Sqlite.shutdown.addBlocker("PowerBrowser tab store: closing tabs.sqlite", async () => {
    tabStoreClosing = true;
    while (tabStoreOpening) {
      await tabStoreOpening;
    }
    const conn = tabStoreConn;
    tabStoreConn = null;
    if (conn) {
      await conn.close();
    }
  });
  tabStoreShutdownHooked = true;
}

// F4: sessionstore lists restored tabs only once its restore has run, so the
// sweep closes absent stock rows only after SessionStore.promiseAllWindowsRestored.
let stockRestoreDone = false;

// GUI-08 (15-01): writer-side bounds for group fields. The title cap mirrors
// the contracted rename rule (15-UI-SPEC.md); bounds clamp to a sane max so
// a malformed actor message can never park a box off-field; thumbnails over
// the byte cap drop to the contracted text fallback instead of bloating the
// store (15-RESEARCH.md Pitfall 4).
const GROUP_TITLE_MAX = 60;
const GROUP_BOUNDS_MAX = 10000;
const TAB_STORE_THUMBNAIL_MAX_CHARS = 200000;

// GUI-08 (15-02): capture-side PNG cap plus settle delay. writeThumbnail's
// store cap above is the second wall; a capture over this size clears to
// NULL at capture time so the card falls back to its contracted
// title-plus-URI text. Captures wait for settle so rapid Ctrl-Tab never
// janks the tab-event hot path.
const TAB_THUMBNAIL_CAPTURE_MAX_CHARS = 102400;
// Width a capture is scaled to. Matches the widest a card is drawn, so the
// image is sharp at card size without carrying pixels no card can show.
const TAB_THUMBNAIL_TARGET_WIDTH = 220;
const TAB_THUMBNAIL_SETTLE_MS = 500;

// GUI-08 (15-01): the PowerBrowserGroup actor pair identity. Registration is
// scoped to the Theia local origin (matches pin) so the child never loads in
// stock-window web content; the parent re-checks the sender origin per
// message (threat-model W5 second wall) and chrome-side field validation in
// the writer methods is the wall behind that.
const GROUP_ACTOR_NAME = "PowerBrowserGroup";
const GROUP_ACTOR_THEIA_ORIGIN = "http://127.0.0.1";
// The CHILD loads in the CONTENT process, where a chrome:// package is not
// loadable: 15-01 shipped this as chrome://powerbrowser/content/... and the
// load failed with "Failed to load chrome://..." on every launch, so the actor
// child never ran and every mutation waited out the 5s ack timeout. Upstream
// ships every actor child on resource:/// or moz-src:/// for exactly this
// reason (browser/components/DesktopActorRegistry.sys.mjs). The resource alias
// is registered beside the content package in shell/jar.mn.
const GROUP_ACTOR_CHILD_MODULE = "resource://powerbrowser/GroupActorChild.sys.mjs";
const GROUP_ACTOR_PARENT_MODULE = "chrome://powerbrowser/content/PowerBrowserAPI.sys.mjs";

// GUI-08 (15-REVIEW CR-01): host-based Theia sender check. Theia is always
// served with a port (http://127.0.0.1:PORT/ via TheiaService._swap), so an
// exact-or-slash-prefix string match against portless http://127.0.0.1 nacks
// 100% of production traffic. Parse the sender URI and compare host
// (127.0.0.1/localhost, any port); a naive startsWith(ORIGIN) repair would
// admit http://127.0.0.1.evil.com/. Pure over the spec string so the
// persistence gate can mirror it with WHATWG URL.
function groupSenderSpecIsTheia(spec) {
  if (typeof spec !== "string" || !spec) {
    return false;
  }
  try {
    const uri = Services.io.newURI(spec);
    if (!uri.schemeIs("http")) {
      return false;
    }
    return uri.host === "127.0.0.1" || uri.host === "localhost";
  } catch {
    return false;
  }
}

// NG-038: the actor serves one frame -- the shell's own content browser, in
// the shell window, on the sidecar's live port. `matches` cannot carry a port
// (MatchPattern compares hosts only), and stock tabbrowser marks its selected
// tab's browser primary="true" too (upstream tabbrowser.js:728, 1720), so a
// 127.0.0.1 page in a selected stock tab passed both the host check and the
// primary wall. TheiaService._swap sets the port before it navigates the
// frame; until then every sender is refused.
const SHELL_DOCUMENT_URL = "chrome://powerbrowser/content/powerbrowser.xhtml";
const SHELL_CONTENT_BROWSER_ID = "powerbrowser-content";
let groupSenderPort = null;

// NG-033: the chrome half of the frontend's profile store (profile-storage.ts):
// one JSON document per profile, written atomically by the one chrome-side
// writer. The frontend sends the whole map; the cap keeps a runaway frontend
// from filling the disk through this channel.
const SHELL_MESSAGE_KINDS = new Set(["shellStateLoad", "shellStateSave", "shellFlushed", "shellArmWebTabHistory"]);
const SHELL_STATE_FILE_NAME = "powerbrowser-shell-state.json";
const SHELL_STATE_MAX_CHARS = 16 * 1024 * 1024;
// NG-032/NG-033: quit flushes chrome is waiting on, flushId -> resolve.
const pendingShellFlushes = new Map();
let shellFlushSeq = 0;

// NG-034: saved back/forward history of in-shell web tabs, by tabs.sqlite row
// key. Read once at startup; a key's history is restored only after the
// frontend arms it (shellArmWebTabHistory), and only once.
const WEB_TAB_HISTORY_FILE_NAME = "powerbrowser-web-tab-history.json";
const WEB_TAB_ROW_KEY_RE = /^web:[A-Za-z0-9_-]{1,64}$/;
let savedWebTabHistories = {};
const armedWebTabHistories = new Set();

function groupSenderIsTheia(actorRef) {
  let spec = "";
  let port = -1;
  let embeddedByPrimary = false;
  let embeddedByShell = false;
  try {
    const documentURI = actorRef?.browsingContext?.currentWindowGlobal?.documentURI;
    spec = documentURI?.spec ?? "";
    port = documentURI?.port ?? -1;
    // GUI-02 (14.1-01): the embedder-is-primary wall (T-14.1-01). A loopback
    // page inside a web-tab overlay loads the actor child too (the `matches`
    // pin is by origin); its top browsing context is embedded by the overlay
    // element, which carries no `primary`.
    const embedder = actorRef?.browsingContext?.top?.embedderElement;
    embeddedByPrimary = embedder?.getAttribute("primary") === "true";
    // NG-038: and primary is not enough -- stock tabbrowser sets it on its
    // selected tab. Only the shell window's own content browser qualifies.
    embeddedByShell =
      embedder?.id === SHELL_CONTENT_BROWSER_ID && embedder?.ownerDocument?.documentURI === SHELL_DOCUMENT_URL;
  } catch {
    spec = "";
    embeddedByPrimary = false;
    embeddedByShell = false;
  }
  return (
    embeddedByPrimary &&
    embeddedByShell &&
    groupSenderPort !== null &&
    port === groupSenderPort &&
    groupSenderSpecIsTheia(spec)
  );
}

const TAB_STORE_FILE_NAME = "tabs.sqlite";

// SQL-01 (12-01): sweep bounds. The reconciliation sweep caps its per-run
// writes so a pathological session state cannot stall the observer, and
// prunes rows closed longer than the retention window.
const TAB_STORE_SWEEP_MAX_WRITES = 500;
const TAB_STORE_CLOSED_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

// NG-018: the scheduled full integrity check's interval. Used when the
// settings row integrity_check_minutes is absent or unusable (24 hours).
const TAB_STORE_INTEGRITY_DEFAULT_MS = 24 * 60 * 60 * 1000; // NG-018: when integrity_check_minutes is absent or unusable

// SQL-01 (12-01): the single chrome-side tab-store connection. Module-level
// (never a property on the frozen PowerBrowserAPI object -- assignment to a
// frozen object throws), one writer only.
let tabStoreConn = null;

// GUI-08 (15-01): the group actor registers once per browser session.
// TheiaService.start is already once-guarded; this flag makes a second call
// a no-op rather than a duplicate-registration throw.
let groupActorRegistered = false;

// GUI-08 (15-02): capture-on-settle plumbing. settleCaptureTokens coalesces
// rapid re-schedules per tab URI (only the latest timer captures); the
// selected-tab map remembers each window's last tab so a TabSelect schedules
// the tab being LEFT, whose view is final. WeakMap so closed windows drop.
const settleCaptureTokens = new Map();
const lastSelectedTabByWin = new WeakMap();

// GUI-02 (14.1-01): the web-tab host's overlay table, tabId -> { browser,
// uri, listener, titleListener, owner }. Module-level for the same reason as
// tabStoreConn (the API object is frozen), and a STRONG reference on
// purpose: the progress listener each entry holds is registered with a
// parent-side web progress that keeps listeners WEAKLY
// (BrowsingContextWebProgress.cpp do_GetWeakReference), so a listener held
// nowhere else is collected mid-session -- the pendingTimers class of bug.
const webTabs = new Map();

// GUI-02 (14.1-01): the shape wall on a frontend-supplied tab id, applied
// before any host method reads the map. The id is minted by the frontend's
// own per-session counter, so anything outside this alphabet is not the
// widget that is supposed to be talking.
function webTabIdIsValid(tabId) {
  return typeof tabId === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(tabId);
}

export const PowerBrowserAPI = Object.freeze({
  /**
   * Reads a string pref, returning `fallback` (never throwing) when the
   * pref is unset or holds a different type.
   */
  getStringPref(name, fallback) {
    try {
      return Services.prefs.getStringPref(name, fallback);
    } catch {
      return fallback;
    }
  },

  /**
   * Reads an int pref, returning `fallback` (never throwing) when the pref
   * is unset or holds a different type.
   */
  getIntPref(name, fallback) {
    try {
      return Services.prefs.getIntPref(name, fallback);
    } catch {
      return fallback;
    }
  },

  /** Reads an environment variable. */
  getEnv(name) {
    return Services.env.get(name);
  },

  /**
   * D-128 (CR-01 fix, 05-REVIEW.md): the absolute path of this launch's own
   * Firefox profile directory (`ProfD`), read straight off the platform's
   * directory service. Never throws: resolves "" on any failure, matching
   * getStringPref's never-throw convention -- a profile-key derivation that
   * can't read ProfD falls back to an unscoped default rather than crashing
   * startup (see TheiaService._profileStateKey).
   */
  getProfileDir() {
    try {
      return Services.dirsvc.get("ProfD", Ci.nsIFile).path;
    } catch {
      return "";
    }
  },

  /** The running application's directory (GreD): the install prefix of a packaged tree. "" on error. */
  getAppDir() {
    try {
      return Services.dirsvc.get("GreD", Ci.nsIFile).path;
    } catch {
      return "";
    }
  },

  /** True when the user (user.js or prefs.js) set this pref, as opposed to a build default. Never throws. */
  prefHasUserValue(name) {
    try {
      return Services.prefs.prefHasUserValue(name);
    } catch {
      return false;
    }
  },

  /** Creates `path` and its parents if absent; a no-op if it already exists. */
  ensureDirectory(path) {
    return IOUtils.makeDirectory(path);
  },

  /**
   * Returns whether `path` exists, never throwing. D-113 (05-02): a
   * configured backend entry file that does not exist on disk is an
   * unrecoverable failure -- distinct from an unset pref -- and this is
   * how TheiaService tells the two apart before ever attempting a spawn.
   */
  pathExists(path) {
    return IOUtils.exists(path);
  },

  /**
   * D-119: the running application's identity -- brand name, vendor, and
   * display version -- read straight from the platform's own app-info
   * service and the build's display-version constant, never from a file
   * this project maintains itself. `name`/`vendor` are the exact values
   * `application.ini`'s Name=/Vendor= lines back (Services.appinfo wraps
   * XREAppData); `version` is the same MOZ_APP_VERSION_DISPLAY
   * preprocessor substitution (from upstream/browser/config/
   * version_display.txt) about:support's own version string uses. Both
   * the startup identity sentinel (powerbrowser.js) and the diagnostics
   * layer's show global read this SAME accessor, so the repointed D-120
   * branding check and the rendered surface can never disagree. Never
   * throws: any field that cannot be read resolves to an empty string
   * rather than throwing, matching getStringPref's convention -- one bad
   * field never blanks the other two.
   */
  getAppIdentity() {
    let name = "";
    let vendor = "";
    try {
      ({ name, vendor } = Services.appinfo);
    } catch {
      // name/vendor stay "".
    }
    let version = "";
    try {
      version = lazy.AppConstants.MOZ_APP_VERSION_DISPLAY;
    } catch {
      // version stays "".
    }
    return { name: name || "", vendor: vendor || "", version: version || "" };
  },

  /**
   * Resolves `command` against PATH, returning null (never throwing) when
   * it cannot be found.
   */
  async pathSearch(command) {
    try {
      return await lazy.Subprocess.pathSearch(command);
    } catch {
      return null;
    }
  },

  /**
   * Adds a session cookie for a plain-HTTP loopback host. D-99: secure is
   * always false -- the sidecar is loopback HTTP, and a secure cookie would
   * never be sent, silently defeating the whole mechanism.
   *
   * SameSite is Lax, not Strict, for the same class of reason: the shell's one
   * swap is a top-level navigation from `chrome://powerbrowser/...` to
   * `http://127.0.0.1:PORT/`, which is cross-site, and Strict withholds the
   * cookie on exactly that navigation -- the backend then answers the shell's
   * own first request with 403 Forbidden and Theia never loads. Lax still sends
   * it on that top-level GET while continuing to withhold it from cross-site
   * subresource loads and POSTs, so the gate keeps its actual purpose. Once the
   * page is on 127.0.0.1 every later request, including the WebSocket upgrade,
   * is same-site and unaffected.
   */
  setSessionCookie({ host, path, name, value }) {
    // aExpiry is honoured even for session cookies -- nsICookieManager.idl:
    // "expiry time will also be honored for session cookies; in this way, the
    // more restrictive of the two will take effect." A literal 0 is midnight
    // 1970-01-01, i.e. already expired, so the cookie is stored and then never
    // sent. Every in-tree caller passes a future stamp regardless of the
    // session flag; aIsSession=true is still what ends it at session end.
    const expiry = Date.now() + 24 * 60 * 60 * 1000;
    const validation = Services.cookies.add(
      host,
      path,
      name,
      value,
      /* aIsSecure */ false,
      /* aIsHttpOnly */ true,
      /* aIsSession */ true,
      /* aExpiry */ expiry,
      /* aOriginAttributes */ {},
      Ci.nsICookie.SAMESITE_LAX,
      Ci.nsICookie.SCHEME_HTTP,
      /* aIsPartitioned */ false
    );
    // add() reports a rejected cookie by returning a validation object rather
    // than throwing. Discarding it turns "the token gate is unreachable" into a
    // silent 403 at the far end of the swap, which is exactly how the expired
    // aExpiry above went unnoticed. Fail loudly instead.
    if (validation && validation.result !== Ci.nsICookieValidation.eOK) {
      throw new Error(
        `setSessionCookie: ${name} for ${host}${path} was rejected (${validation.result}): ${validation.errorString}`
      );
    }
  },

  /**
   * Spawns `command` with an explicit argument vector -- never through a
   * shell interpreter -- returning the process handle with stderr piped.
   * `environmentAppend: true` merges `environment` onto the parent
   * process's own environment (PATH, HOME, ...) rather than replacing it
   * outright -- the spawned Node backend and anything it shells out to
   * (a terminal, npm) still needs a normal environment, plus our overrides.
   */
  spawnProcess({ command, args, environment }) {
    return lazy.Subprocess.call({
      command,
      arguments: args,
      environment,
      environmentAppend: true,
      stderr: "pipe",
    });
  },

  /**
   * Writes one newline-terminated line to `proc`'s stdin pipe and leaves the
   * pipe OPEN. This is the credential channel: anything handed to
   * `spawnProcess`'s `environment` lands in the child's `/proc/<pid>/environ`,
   * which is the exec-time snapshot and stays readable by every same-uid
   * process for the life of that process no matter what the child later
   * deletes from its own `process.env`.
   *
   * Never close the pipe here. `Subprocess` always redirects a child's stdin
   * to a pipe on unix (`toolkit/modules/subprocess/subprocess_unix.worker.js`'s
   * `initPipes`), and the backend's parent-death watchdog treats EOF on this
   * exact fd as "the browser died" -- closing it after the write would
   * self-terminate the backend immediately.
   */
  writeStdinLine(proc, line) {
    return proc.stdin.write(`${line}\n`);
  },

  /**
   * Kills `proc`, waiting up to `graceMs` before escalating. A single call
   * to the platform's own kill(): it already sends SIGTERM, waits the
   * grace period, then SIGKILL -- do not hand-roll that sequence.
   */
  killProcess(proc, graceMs) {
    return proc.kill(graceMs);
  },

  /**
   * Reads the next available chunk of text from `proc`'s named output
   * pipe ("stdout" or "stderr"), resolving null at end of stream.
   */
  async readPipeChunk(proc, which) {
    const pipe = which === "stderr" ? proc.stderr : proc.stdout;
    const chunk = await pipe.readString();
    return chunk === "" ? null : chunk;
  },

  /**
   * Resolves after `ms` milliseconds. The window-global delay timer is not
   * available in a sys.mjs module's scope (confirmed against multiple
   * in-tree modules that either import Timer.sys.mjs or hand-roll it with
   * nsITimer) -- TheiaService may not import Timer.sys.mjs itself (D-96: it
   * imports nothing but this file), so the platform timer lives here
   * instead.
   */
  sleep(ms) {
    return new Promise(resolve => {
      const timer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
      // An nsITimer does NOT keep itself alive. Dropping the only reference
      // when this closure returns lets it be collected before it ever fires,
      // and the promise then never settles -- which silently stalls the
      // supervisor's health loop at its first await, so a dead backend is
      // never detected or restarted. Gecko's own Timer.sys.mjs keeps every
      // live timer in a module-level table (gTimerTable) for this exact
      // reason; hold the same kind of strong reference until it fires.
      pendingTimers.add(timer);
      // initWithCallback takes an nsITimerCallback, whose method is notify()
      // (nsITimer.idl:39-45). `observe` belongs to nsIObserver, which is what
      // the *other* initializer, init(), takes -- pass an {observe} object here
      // and the timer fires into nothing, so the promise never settles and
      // every awaiting caller stalls forever.
      timer.initWithCallback(
        {
          notify: () => {
            pendingTimers.delete(timer);
            resolve();
          },
        },
        ms,
        Ci.nsITimer.TYPE_ONE_SHOT
      );
    });
  },

  /**
   * GETs `url`, sending the sidecar token as a `Cookie` header. Used only
   * for the pre-cookie health probe (D-99: the real chrome-set cookie
   * doesn't exist until this probe first passes) and the steady-state
   * health loop.
   *
   * `fetch()`'s Headers object silently drops "Cookie" -- it's a forbidden
   * request-header name per the Fetch spec (dom/fetch/InternalHeaders.cpp),
   * and that check has no privileged-caller carve-out. `XMLHttpRequest`'s
   * `setRequestHeader` has exactly that carve-out for a system-principal
   * caller (dom/xhr/XMLHttpRequestMainThread.cpp: `isPrivilegedCaller`),
   * confirmed against the same escape hatch's use in-tree
   * (netwerk/test/unit/test_cookie_header.js's raw-channel equivalent).
   * Resolves `true` for a 200 response, `false` for anything else
   * (non-200, network error, or the request exceeding `timeoutMs`) --
   * never throws, so a caller never needs a try/catch around a probe.
   */
  probeHealth(url, token, timeoutMs) {
    return new Promise(resolve => {
      const xhr = new XMLHttpRequest();
      xhr.open("GET", url, true);
      xhr.timeout = timeoutMs;
      xhr.setRequestHeader("Cookie", `POWERBROWSER_TOKEN=${token}`);
      xhr.onload = () => resolve(xhr.status === 200);
      xhr.onerror = () => resolve(false);
      xhr.ontimeout = () => resolve(false);
      xhr.send();
    });
  },

  /**
   * Registers `callback` to fire once the quit decision is final and can
   * no longer be cancelled. Returns a function that unregisters it.
   */
  onQuitGranted(callback) {
    const observer = { observe: () => callback() };
    Services.obs.addObserver(observer, "quit-application-granted");
    return () => Services.obs.removeObserver(observer, "quit-application-granted");
  },

  /**
   * NG-037: quits the whole application the way upstream's quit paths do:
   * announce quit-application-requested so any observer may cancel (a page's
   * leave prompt; the shell's own flush, NG-032/NG-033), then an attempted
   * quit that closes every window, stock browser windows included. The
   * backend stops on the quit-application-granted that follows
   * (TheiaService.stop). Returns false when an observer cancelled.
   */
  quitApplication() {
    const cancelQuit = Cc["@mozilla.org/supports-PRBool;1"].createInstance(Ci.nsISupportsPRBool);
    Services.obs.notifyObservers(cancelQuit, "quit-application-requested");
    if (cancelQuit.data) {
      return false;
    }
    // A full shutdown, not release Gecko's fast shutdown: stage 1 _exit()s
    // inside XPCOM shutdown before XREMain unlocks the profile
    // (nsAppRunner.cpp, "see bug #386739"), so the profile's `lock` symlink
    // outlived every quit and the exit could not be observed by it. Default
    // branch: this quit only, never written to prefs.js. Set before quit(): a
    // quit that a veto defers can run later, and it must still be a full shutdown.
    const defaults = Services.prefs.getDefaultBranch("");
    const shutdownPref = "toolkit.shutdown.fastShutdownStage";
    const previousStage = defaults.getIntPref(shutdownPref);
    defaults.setIntPref(shutdownPref, 0);
    // WR-04: quit() returns without quitting when a window's CanClose vetoes it
    // (nsAppStartup.cpp:394-396: the Theia beforeunload leave prompt). attemptingQuit
    // is set in the same call only once every CanClose passed (nsAppStartup.cpp:440-441),
    // so a declined quit is reported as one, and the stage goes back to its default.
    // (shuttingDown is not used: it tracks AppShutdownConfirmed, which comes later.)
    Services.startup.quit(Ci.nsIAppStartup.eAttemptQuit);
    if (!Services.startup.attemptingQuit) {
      defaults.setIntPref(shutdownPref, previousStage);
      return false;
    }
    return true;
  },

  /**
   * NG-032/NG-033, final-review I1: runs the whole quit flush synchronously on
   * the quit-application-granted path, before TheiaService.stop() kills the
   * backend. Never cancels: by granted time the quit -- a plain quit, a
   * restart, a safe-mode or silent restart -- is final and carries whatever
   * intent its requester announced, so there is nothing to re-issue and no
   * requester left to tell it was cancelled. The async chain below (the
   * frontend ack wait plus the history-file write) settles while the nested
   * event loop spins, bounded by the same quitFlushTimeoutMs the old hold
   * passed to flushShellState (the XPIProvider.sys.mjs awaitPromise shape).
   * Never throws, so a quit is never held past the timeout.
   */
  runQuitFlushSync(theiaBrowser, timeoutMs) {
    let finished = false;
    PowerBrowserAPI.flushShellState(theiaBrowser, timeoutMs)
      .then(async acked => {
        PowerBrowserAPI.log("info", acked ? "Frontend flushed before quit." : "Frontend did not acknowledge the quit flush in time; quitting anyway.");
        PowerBrowserAPI.log("info", `Saved back/forward history for ${await PowerBrowserAPI.saveWebTabHistories()} web tab(s).`);
      })
      .catch(err => PowerBrowserAPI.log("error", `Quit flush failed (${err && err.name ? err.name : "error"}); quitting anyway.`))
      .finally(() => {
        finished = true;
      });
    const deadline = Date.now() + timeoutMs;
    try {
      Services.tm.spinEventLoopUntil("PowerBrowserAPI.sys.mjs:runQuitFlushSync", () => finished || Date.now() >= deadline);
    } catch (err) {
      PowerBrowserAPI.log("error", `Quit flush spin failed (${err && err.name ? err.name : "error"}); quitting anyway.`);
    }
  },

  /** NG-034: reads last session's web-tab histories once, before any web tab can reopen. Never throws. */
  async loadWebTabHistories() {
    try {
      const value = await IOUtils.readJSON(`${PowerBrowserAPI.getProfileDir()}/${WEB_TAB_HISTORY_FILE_NAME}`);
      savedWebTabHistories = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    } catch {
      savedWebTabHistories = {};
    }
  },

  /**
   * NG-034: writes the back/forward history of every open in-shell web tab,
   * by row key, for the next launch. Runs inside the quit flush. Returns the
   * number of tabs saved; never throws.
   */
  async saveWebTabHistories() {
    const histories = {};
    const path = `${PowerBrowserAPI.getProfileDir()}/${WEB_TAB_HISTORY_FILE_NAME}`;
    try {
      const { SessionHistory } = ChromeUtils.importESModule("resource://gre/modules/sessionstore/SessionHistory.sys.mjs");
      for (const entry of webTabs.values()) {
        const sessionHistory = entry.browser.browsingContext?.sessionHistory;
        if (!entry.rowKey || !sessionHistory || sessionHistory.count === 0) {
          continue;
        }
        histories[entry.rowKey] = SessionHistory.collectFromParent(entry.browser.currentURI?.spec ?? "about:blank", true, sessionHistory);
      }
      await IOUtils.writeJSON(path, histories, { tmpPath: `${path}.tmp` });
    } catch (err) {
      // Final-review M3: IOUtils rejections name the profile path, which
      // carries the OS user name -- log the fixed string plus err.name only.
      PowerBrowserAPI.log("error", `[saveWebTabHistories] write failed (${err && err.name ? err.name : "error"})`);
      return 0;
    }
    return Object.keys(histories).length;
  },

  /**
   * PAGE-11: arms the crashed overlay's own history under its row key, so the reopen restores it. Never throws.
   * Phase 33 (BMK-03): `arm` false keeps a closed overlay's history unarmed, for a later reopen to arm.
   */
  keepCrashedWebTabHistory(entry, arm = true) {
    try {
      const sessionHistory = entry.browser.browsingContext?.sessionHistory;
      if (!sessionHistory || sessionHistory.count === 0) {
        return;
      }
      const { SessionHistory } = ChromeUtils.importESModule("resource://gre/modules/sessionstore/SessionHistory.sys.mjs");
      savedWebTabHistories[entry.rowKey] = SessionHistory.collectFromParent(entry.browser.currentURI?.spec ?? "about:blank", true, sessionHistory);
      if (arm) {
        armedWebTabHistories.add(entry.rowKey);
      }
    } catch (err) {
      PowerBrowserAPI.log("error", `[web-tab] crashed history not kept (${err && err.name ? err.name : "error"})`);
    }
  },

  /**
   * NG-034: the saved history for `rowKey` when the frontend armed it, once.
   * Only http(s) entries (and the reader or source view of an http(s) page)
   * are admitted, top-level and subframes alike -- the
   * same scheme wall webTabOpen and webTabNavigate apply -- so a tampered file
   * cannot smuggle a file: or chrome: URL in through an entry's children.
   * The serialized triggering principals ride the entries untouched (SessionHistory
   * restores what it is given); the wall covers URLs, not principals, and a
   * tampered profile is already the sessionstore-tampering position.
   */
  takeWebTabHistory(rowKey) {
    if (!armedWebTabHistories.delete(rowKey) || !Object.prototype.hasOwnProperty.call(savedWebTabHistories, rowKey)) {
      return null;
    }
    const data = savedWebTabHistories[rowKey];
    delete savedWebTabHistories[rowKey];
    const entries = data && Array.isArray(data.entries) ? data.entries : [];
    if (entries.length === 0 || !Number.isInteger(data.index) || data.index < 1 || data.index > entries.length) {
      return null;
    }
    // A reader or view-source entry of an http(s) page is checked by its page (32-REVIEW WR-01): since Phase 32 those
    // entries commit into overlay history (OVERLAY_LOCATION), and refusing them dropped the tab's whole history.
    const entryUrlOk = item => item && typeof item.url === "string" && /^https?:\/\//i.test(webTabPushedSpec(item.url));
    const treeOk = items => Array.isArray(items) && items.every(item => entryUrlOk(item) && (!item.children || treeOk(item.children)));
    if (!entries.every(item => entryUrlOk(item) && (!item.children || treeOk(item.children)))) {
      return null;
    }
    return data;
  },

  /**
   * NG-034: loads `browser` from saved history the way SessionStore restores
   * a tab in the parent process (SessionStore.sys.mjs _restoreHistory and
   * _restoreTabEntry): history first, then the docshell state, then a restore
   * that reloads the current entry.
   */
  async restoreWebTabHistory(browser, tabData) {
    const { SessionHistory } = ChromeUtils.importESModule("resource://gre/modules/sessionstore/SessionHistory.sys.mjs");
    const browsingContext = browser.browsingContext;
    // A fresh overlay commits its initial about:blank into session history a
    // few ms after it is created. Restored before that commit, the about:blank
    // is appended after the restored entries and becomes the current entry,
    // so the tab reloads about:blank instead of its page. Wait for the commit
    // (bounded); restoreFromParent then purges it. The wait expiring is not a
    // failure -- the restore is still attempted below, on whatever history the
    // overlay has by then.
    for (let waited = 0; browsingContext.sessionHistory.count === 0 && waited < 3000; waited += 25) {
      await PowerBrowserAPI.sleep(25);
    }
    if (browsingContext.sessionHistory.count === 0) {
      PowerBrowserAPI.log("warn", "[restoreWebTabHistory] initial history entry not yet committed; attempting restore anyway");
    }
    SessionHistory.restoreFromParent(browsingContext.sessionHistory, tabData);
    await SessionStoreUtils.restoreDocShellState(browsingContext, tabData.entries[tabData.index - 1].url, null);
    SessionStoreUtils.initializeRestore(browsingContext, SessionStoreUtils.constructSessionStoreRestoreData()).catch(err => {
      // Final-review M3: keep IOUtils/XPCOM error text (it can carry the
      // absolute profile path) out of the log -- fixed string plus err.name.
      PowerBrowserAPI.log("error", `[restoreWebTabHistory] settle failed (${err && err.name ? err.name : "error"})`);
    });
  },

  /**
   * Mirrors one line to the browser console and to stdout, so the
   * supervisor's ring buffer and the verification harness read the same
   * stream.
   */
  log(level, message) {
    dump(`[PowerBrowserAPI] ${level}: ${message}\n`);
    const fn = typeof console[level] === "function" ? console[level] : console.log;
    fn(message);
  },

  /**
   * Announces that the shell window has finished initializing, by firing the
   * same observer topic Firefox's own chrome fires from
   * `browser/base/content/browser-init.js`. WebDriver's session.new blocks on
   * this topic (`remote/components/RemoteAgent.sys.mjs`), and the PowerBrowser
   * shell is deliberately not that chrome, so nothing else would ever fire it
   * and no automated check could drive the shell.
   */
  notifyStartupFinished(win) {
    Services.obs.notifyObservers(win, "browser-idle-startup-tasks-finished");
  },

  /**
   * Mints the `permanentKey` that WebDriver uses to identify a top-level
   * browsing context (`remote/shared/NavigableManager.sys.mjs` returns a null
   * context id for any browser without one). Firefox's tabbrowser assigns this
   * per `<browser>`; the shell has no tabbrowser, so it mints its own. Created
   * in the system global exactly as `tabbrowser.js` does, so the key stays
   * valid if something outlives the window.
   */
  createPermanentKey() {
    return new (Cu.getGlobalForObject(Services).Object)();
  },

  /**
   * Navigates `browserElement` to `url` with the shell document's own
   * principal as the triggering principal. Both halves are privileged chrome
   * API -- `ownerDocument.nodePrincipal` is the system principal because the
   * shell is loaded from chrome://, and `fixupAndLoadURIString` is a
   * <browser> method -- so they belong here rather than in powerbrowser.js.
   * Previously this lived in powerbrowser.js with a comment saying it avoided
   * PowerBrowserAPI "to dodge the boundary guard", which is precisely the hole
   * SHELL-02 exists to prevent: the guard's pattern list simply did not name
   * these two APIs, so a real internals touch sat outside the one file that
   * is supposed to hold them all, uncatalogued. Both patterns are in
   * FORBIDDEN_PATTERNS now, so that cannot recur silently.
   */
  loadURIInBrowser(browserElement, url) {
    browserElement.fixupAndLoadURIString(url, {
      triggeringPrincipal: browserElement.ownerDocument.nodePrincipal,
    });
  },

  /**
   * D-110: writes `value` as JSON to `path`, atomically -- IOUtils performs
   * a write-then-rename through the given temp path, so a crash mid-write
   * leaves at worst a stale/partial temp file and an untouched destination,
   * never a half-written state file.
   */
  writeStateFile(path, value) {
    return IOUtils.writeJSON(path, value, { tmpPath: `${path}.tmp` });
  },

  /**
   * Reads the state file's JSON, resolving `null` (never throwing) on any
   * failure -- absent file, malformed content, or a value that isn't an
   * object. Never-throw read convention, matching `getStringPref` above.
   */
  async readStateFile(path) {
    try {
      const value = await IOUtils.readJSON(path);
      return value && typeof value === "object" ? value : null;
    } catch {
      return null;
    }
  },

  /**
   * Removes the state file. `ignoreAbsent` defaults to true on
   * `IOUtils.remove`, so this needs no prior existence check -- a clean
   * stop's cleanup call is a no-op when there is nothing to remove.
   */
  removeStateFile(path) {
    return IOUtils.remove(path);
  },

  /**
   * D-111: reads `/proc/<pid>/stat` and returns field 22 (`starttime`,
   * clock ticks since boot per proc(5)) as a string, or `null` on any
   * failure. Field 2 (`comm`, the executable basename) is parenthesized
   * and may itself contain spaces or parentheses, so this locates the
   * LAST `)` in the line and slices two characters past it before
   * splitting the remainder on spaces -- splitting the whole line on the
   * first space misaligns every field after `comm` (05-RESEARCH.md
   * Pitfall 2). After that slice, field 22 overall is index 19 of the
   * remainder (fields 3.. counted from 0).
   */
  async readProcessStartTicks(pid) {
    try {
      // IOUtils.readUTF8() cannot be used here: it always sizes its read
      // buffer from the target's reported file size
      // (nsIFileRandomAccessStream::GetSize, an lstat-derived value), and
      // /proc/<pid>/stat, like every procfs file, reports st_size 0 -- a
      // size-0 buffer means it reads zero bytes and resolves an EMPTY
      // string with no error. Confirmed directly against this project's
      // own xpcshell (upstream/xpcom/ioutils/IOUtils.cpp:428-443,
      // IOUtils::ReadUTF8 calls ReadUTF8Sync -> ReadSync(..., Nothing{},
      // ...) unconditionally -- readUTF8's own ReadUTF8Options dictionary
      // has no maxBytes field at all (dom/chrome-webidl/IOUtils.webidl),
      // so passing one is silently ignored). IOUtils.read() (byte array,
      // ReadOptions.maxBytes) DOES honour an explicit maxBytes and reads
      // procfs correctly -- confirmed the same way. 4096 is far larger
      // than any real /proc/<pid>/stat line (all-digit and short-string
      // fields plus one parenthesized comm), including a comm value long
      // enough to contain spaces or parentheses.
      const bytes = await IOUtils.read(`/proc/${pid}/stat`, { maxBytes: 4096 });
      const text = new TextDecoder().decode(bytes);
      const afterComm = text.slice(text.lastIndexOf(")") + 2);
      const fields = afterComm.split(" ");
      return fields[19] ?? null;
    } catch {
      return null;
    }
  },

  /**
   * D-111: signals a bare pid -- one this process did not spawn via
   * Subprocess, and therefore has no `Process` object / `proc.kill()` for
   * (see `killProcess` above, which remains the correct call for an
   * already-spawned handle). `Subprocess.sys.mjs` has no API to signal a
   * pid it did not itself create, so this opens libc directly via
   * js-ctypes. Linux-only per CLAUDE.md -- no cross-platform branch.
   * Returns true only when the platform call itself returned 0; false on
   * ESRCH (already gone), EPERM, or any other failure -- never throws.
   */
  signalBarePid(pid, signal) {
    const libc = lazy.ctypes.open("libc.so.6");
    try {
      const kill = libc.declare(
        "kill",
        lazy.ctypes.default_abi,
        lazy.ctypes.int,
        lazy.ctypes.int,
        lazy.ctypes.int
      );
      return kill(pid, signal) === 0;
    } catch {
      return false;
    } finally {
      libc.close();
    }
  },

  /**
   * D-121/D-122: finds the shell's own already-open window, by the window
   * type `powerbrowser.xhtml`'s root element declares (`windowtype`). Returns
   * `null` (never throws) when none exists -- the first-launch case, where
   * the single-instance handler below must do nothing at all.
   */
  findShellWindow() {
    return Services.wm.getMostRecentWindow("powerbrowser:main");
  },

  /** Focuses an already-found shell window. */
  focusWindow(win) {
    win.focus();
  },

  /**
   * GUI-01 (01-05): opens the shell's own window. Called by the
   * single-instance handler below on the FIRST launch, which is what makes
   * the shell the startup window without the compiled BROWSER_CHROME_URL
   * override patch 020 used to carry. `null` args: the shell document reads
   * no `window.arguments` at all (powerbrowser.js), unlike upstream's
   * browser.xhtml.
   */
  openShellWindow() {
    return Services.ww.openWindow(
      null,
      "chrome://powerbrowser/content/powerbrowser.xhtml",
      "_blank",
      // toolbar: a null-argument window is not a dialog, so `all` is ignored (nsWindowWatcher.cpp:286);
      // the explicit toolbar flag sets CHROME_TOOLBAR, which WindowBase.type reads as normal (:1972-1974).
      "chrome,dialog=no,all,toolbar",
      null
    );
  },

  /**
   * GUI-01 (01-05): opens ONE stock upstream browser window -- the real
   * `chrome://browser/content/browser.xhtml`, with its own address bar, tab
   * strip, and in-window modal dialogs -- optionally loading `url`.
   *
   * The chrome URL is read from the build's own BROWSER_CHROME_URL constant
   * rather than hardcoded, so this opens whatever upstream considers the main
   * browser document. That is only correct because patch 020 no longer
   * overrides that define: upstream compares `window.location.href` against
   * this same constant in five places to decide "am I the main browser
   * window", and while the override was in place a real browser window lost
   * address-bar focus (browser.js openLocation), lost in-window modal dialogs
   * (browser.js gDialogBox), and recursed into the shell on a multi-URI load.
   *
   * `url` is wrapped in an nsISupportsString for the same reason upstream's
   * own `openBrowserWindow` does it: a bare string argument goes through
   * `loadOneOrMoreURIs`'s "|"-splitting path, so a URL containing a pipe
   * would be silently split into several loads.
   */
  openBrowserWindow(url) {
    const arg = Cc["@mozilla.org/supports-string;1"].createInstance(Ci.nsISupportsString);
    arg.data = url || "about:newtab";
    return Services.ww.openWindow(
      null,
      lazy.AppConstants.BROWSER_CHROME_URL,
      "_blank",
      "chrome,dialog=no,all",
      arg
    );
  },

  /**
   * GUI-01 (F9): puts `url` in the ONE stock browser window instead of
   * opening a whole new OS window per navigation.
   *
   * Every New Tab, suggestion activation and typed address in the chrome bar
   * funnels through the same frontend sink
   * (theia/extensions/tab-uris/src/browser/browser-window-command.ts), and
   * until this landed that sink called `window.open(url, '_blank')` from
   * content. The shell window carries no `nsIBrowserDOMWindow`, so
   * `nsWindowWatcher` had no tab to divert into and every call fell through
   * to `AppWindow::CreateNewContentWindow`: three navigations, three windows.
   * GUI-01's contract is unchanged -- the FIRST navigation still opens a
   * stock window through `openBrowserWindow` above, and closing it still
   * leaves the shell running. Only the second and later ones differ.
   *
   * `addWebTab`, never `addTrustedTab`: upstream's own wrapper mints a null
   * principal for the load and throws outright on a system principal
   * (upstream/browser/components/tabbrowser/content/tabbrowser.js:3185-3198),
   * which is what stops a URL that arrived over the actor channel from
   * loading `file:` or `chrome:`.
   *
   * The scheme gate in front of it is the wall that matters, and it guards
   * the FALLBACK rather than the tab path: `openBrowserWindow` hands the
   * string to `Services.ww.openWindow`, whose window-argument path reaches
   * `loadOneOrMoreURIs`, whose `triggeringPrincipal` DEFAULTS TO THE SYSTEM
   * PRINCIPAL (upstream/browser/base/content/browser.js:1304-1310). That
   * method was unreachable from content until this change, so admitting a
   * non-web scheme here would be a real escalation rather than a theoretical
   * one. http/https only; an empty url (the New Tab case) resolves to the
   * same `about:newtab` literal `openBrowserWindow` already uses, which a
   * null principal may load (URI_SAFE_FOR_UNTRUSTED_CONTENT,
   * upstream/browser/components/newtab/AboutNewTabRedirector.sys.mjs:452-459).
   * Anything else is refused with no window and no tab -- the frontend only
   * ever sends the two admitted shapes, so a refusal means a sender that is
   * not the chrome bar.
   *
   * ponytail: targets the most recently focused stock window, private or
   * not. Which window a given tab belongs in is the mirror/proxy bridge's
   * question (GUI-04), not this one's.
   *
   * NG-009: a window still starting has not loaded its window argument yet;
   * its delayed startup loads it into the SELECTED tab
   * (upstream/browser/base/content/browser-init.js:491), so a tab added and
   * selected before then has its page replaced by the first window's. The
   * tab waits for that window's delayed startup (browser-init.js:44, :791).
   */
  async openStockTab(url) {
    const spec = typeof url === "string" && url ? url : "about:newtab";
    if (spec !== "about:newtab" && !/^https?:\/\//i.test(spec)) {
      return "refused-scheme";
    }
    let win = Services.wm.getMostRecentWindow("navigator:browser");
    if (win && win.gBrowserInit && !win.gBrowserInit.delayedStartupFinished) {
      const starting = win;
      await new Promise(resolve => {
        starting.delayedStartupPromise.then(resolve, resolve);
        starting.addEventListener("unload", resolve, { once: true });
      });
      // The window may have closed, or another come to the front, meanwhile.
      win = Services.wm.getMostRecentWindow("navigator:browser");
    }
    const tab = win && !win.closed && win.gBrowser ? win.gBrowser.addWebTab(spec) : null;
    if (!tab) {
      PowerBrowserAPI.openBrowserWindow(spec);
      return "opened-window";
    }
    win.gBrowser.selectedTab = tab;
    PowerBrowserAPI.focusWindow(win);
    return "opened-tab";
  },

  /**
   * NG-001: the row key of a stock browser tab, `stock:<stamp>-<n>`. Minted the
   * first time the store sees the tab and kept on it as a sessionstore custom
   * tab value, so a navigation, a second tab on the same page, and a restart
   * that restores the tab all keep the one key and the one row.
   *
   * F6: Duplicate Tab copies the custom value, so a tab can arrive holding the
   * key another open tab already holds. The tab that held it first keeps it;
   * the newcomer keeps the key minted for it when it opened, or gets a fresh one.
   *
   * A tab moved to another window is a new tab element that adopts the old
   * one (TabOpen detail.adoptedTab); sessionstore has already moved the custom
   * value, and the old tab, not closing yet, still holds the key. `adoptedFrom`
   * hands the key over, so the moved tab keeps its row.
   */
  stockTabKey(tab, adoptedFrom = null) {
    if (adoptedFrom && !stockTabKeys.has(tab) && stockTabKeys.has(adoptedFrom)) {
      stockTabKeys.set(tab, stockTabKeys.get(adoptedFrom));
    }
    const stored = lazy.SessionStore.getCustomTabValue(tab, STOCK_TAB_KEY_VALUE);
    const mine = stockTabKeys.get(tab);
    if (stored && stored === mine) {
      return stored;
    }
    if (stored && !PowerBrowserAPI.stockKeyHeldByAnotherTab(tab, stored)) {
      stockTabKeys.set(tab, stored);
      return stored;
    }
    let key = mine;
    if (!key) {
      stockKeySeq += 1;
      key = `stock:${STOCK_KEY_STAMP}-${stockKeySeq}`;
    }
    stockTabKeys.set(tab, key);
    lazy.SessionStore.setCustomTabValue(tab, STOCK_TAB_KEY_VALUE, key);
    return key;
  },

  /** F6: true when an open stock tab other than `tab` already holds `key` this launch. */
  stockKeyHeldByAnotherTab(tab, key) {
    const stockWindows = Services.wm.getEnumerator("navigator:browser");
    while (stockWindows.hasMoreElements()) {
      const win = stockWindows.getNext();
      for (const other of (win.gBrowser && win.gBrowser.tabs) || []) {
        if (other !== tab && !other.closing && stockTabKeys.get(other) === key) {
          return true;
        }
      }
    }
    return false;
  },

  /**
   * SQL-01 (12-01): opens the single chrome-side tab-store connection.
   * Relative `tabs.sqlite` resolves against ProfD by construction. WAL is
   * pinned OUTSIDE any transaction with a read-back assert. openNotExclusive
   * (14.1-03): mozStorage opens EXCLUSIVE by default, and an exclusive WAL
   * writer keeps the index in heap (no -shm file), so the backend's readonly
   * reader (TabQueryService, SQL-04) got SQLITE_BUSY on every query while the
   * browser ran and served [] -- measured live. Version guard: zero or stale
   * runs the forward chain (migrateTabStoreToHead); newer-than-head refuses
   * loudly. Loud-write convention: throws naming the method and cause.
   * NG-085: the connection is closed at shutdown (closeTabStoreAtShutdown).
   */
  async openTabStore() {
    // I2: an open or quarantine in flight ends first; its connection is the one.
    while (tabStoreOpening) {
      await tabStoreOpening;
    }
    if (tabStoreConn) {
      return tabStoreConn;
    }
    refuseIfTabStoreClosing("openTabStore");
    return holdTabStore(async () => {
      closeTabStoreAtShutdown();
      const conn = await lazy.Sqlite.openConnection({ path: TAB_STORE_FILE_NAME, openNotExclusive: true });
      try {
        refuseIfTabStoreClosing("openTabStore");
        const modeRows = await conn.execute("PRAGMA journal_mode=WAL;");
        const mode = modeRows.length ? modeRows[0].getString(0) : "";
        if (mode !== "wal") {
          throw new Error(`openTabStore: journal_mode pin failed (got ${mode})`);
        }
        const schemaVersion = await conn.getSchemaVersion();
        if (schemaVersion > TAB_STORE_SCHEMA_HEAD) {
          throw new Error(
            `openTabStore: refusing downgrade: user_version=${schemaVersion} is newer than chain head ${TAB_STORE_SCHEMA_HEAD}`
          );
        }
        await PowerBrowserAPI.migrateTabStoreToHead(conn);
        refuseIfTabStoreClosing("openTabStore");
      } catch (err) {
        // NG-013: a connection that failed any step closes before the error
        // leaves, so the quarantine never removes a file something still holds.
        try {
          await conn.close();
        } catch {
          // Close is best-effort; the error below is the point.
        }
        throw err;
      }
      tabStoreConn = conn;
      return conn;
    });
  },

  /**
   * SQL-01 (12-01): the single forward migration (v0/stale to v1). Pre-checks
   * run first; the DDL statements (split from the marker-delimited constant,
   * never a copy) plus the version bump run inside exactly one
   * executeTransaction. A database whose work is already done is a no-op
   * success that only stamps the version.
   *
   * GUI-08 (15-01): stamps exactly 1, never TAB_STORE_SCHEMA_HEAD -- under
   * head 2 a v0 store must fall through to migrateTabStoreToV2 afterwards,
   * and stamping the head here would skip the groups shape entirely.
   */
  async migrateTabStoreToV1(conn) {
    const statements = TABS_STORE_V1_DDL.split(";")
      .map(s => s.trim())
      .filter(Boolean);
    const createTable = statements.find(s => /^create table\b/i.test(s));
    const createIndex = statements.find(s => /^create index\b/i.test(s));
    if (!createTable || !createIndex) {
      throw new Error("migrateTabStoreToV1: DDL marker content missing CREATE TABLE or CREATE INDEX");
    }
    const tableDone = await conn.tableExists("tabs");
    const indexDone = await conn.indexExists("idx_tabs_last_active");
    if (tableDone && indexDone) {
      await conn.setSchemaVersion(1);
      return;
    }
    await conn.executeTransaction(async () => {
      if (!tableDone) {
        await conn.execute(createTable);
      }
      if (!indexDone) {
        await conn.execute(createIndex);
      }
      await conn.setSchemaVersion(1);
    });
  },

  /**
   * GUI-08 (15-01): the single forward migration (v1 to v2). Same discipline
   * as v1: marker-delimited DDL split (never a copy), tableExists/indexExists
   * pre-checks plus a column check per ADD COLUMN (no PRAGMA-shortcut
   * stamping), missing pieces plus the version bump inside exactly one
   * executeTransaction, newer-than-head refused by the caller leaving the
   * file untouched. Application order is load-bearing: the groups table
   * first, then the tabs columns, then the indexes over them.
   */
  async migrateTabStoreToV2(conn) {
    const statements = GROUPS_STORE_V2_DDL.split(";")
      .map(s => s.trim())
      .filter(Boolean);
    const findStatement = pattern => {
      const hit = statements.find(s => pattern.test(s));
      if (!hit) {
        throw new Error("migrateTabStoreToV2: DDL marker content missing a required statement");
      }
      return hit;
    };
    const createGroups = findStatement(/^create table groups\b/i);
    const groupsActiveIndex = findStatement(/^create index idx_groups_active\b/i);
    const addGroupId = findStatement(/^alter table tabs add column group_id\b/i);
    const tabsGroupIndex = findStatement(/^create index idx_tabs_group\b/i);
    const addThumbnail = findStatement(/^alter table tabs add column thumbnail\b/i);
    const groupsDone = await conn.tableExists("groups");
    const activeIndexDone = await conn.indexExists("idx_groups_active");
    const groupIdDone = await PowerBrowserAPI.tabStoreHasColumn(conn, "tabs", "group_id");
    const groupIndexDone = await conn.indexExists("idx_tabs_group");
    const thumbnailDone = await PowerBrowserAPI.tabStoreHasColumn(conn, "tabs", "thumbnail");
    if (groupsDone && activeIndexDone && groupIdDone && groupIndexDone && thumbnailDone) {
      await conn.setSchemaVersion(2);
      return;
    }
    await conn.executeTransaction(async () => {
      if (!groupsDone) {
        await conn.execute(createGroups);
      }
      if (!groupIdDone) {
        await conn.execute(addGroupId);
      }
      if (!thumbnailDone) {
        await conn.execute(addThumbnail);
      }
      if (!activeIndexDone) {
        await conn.execute(groupsActiveIndex);
      }
      if (!groupIndexDone) {
        await conn.execute(tabsGroupIndex);
      }
      // Exactly 2, never the head: under head 3 a store arriving here must
      // still fall through to migrateTabStoreToV3, and stamping the head
      // would skip the tab-position columns entirely. Same trap V1 records.
      await conn.setSchemaVersion(2);
    });
  },

  /**
   * GUI-08 (W-loose): v2 to v3 -- where a loose tab sits on the canvas.
   *
   * Same shape as the v2 migration above: a column check per ADD COLUMN
   * rather than a PRAGMA shortcut, the missing pieces plus the version bump
   * inside exactly one executeTransaction, and a store whose work is already
   * done is a no-op success that only stamps the version.
   *
   * Both columns are NULL-able with no default on purpose. NULL means "never
   * placed", which the canvas lays out along the bottom itself, so upgrading
   * an existing profile does not invent a position for every tab it has ever
   * seen.
   */
  async migrateTabStoreToV3(conn) {
    const statements = TAB_POSITION_V3_DDL.split(";")
      .map(s => s.trim())
      .filter(Boolean);
    const findStatement = pattern => {
      const hit = statements.find(s => pattern.test(s));
      if (!hit) {
        throw new Error("migrateTabStoreToV3: DDL marker content missing a required statement");
      }
      return hit;
    };
    const addX = findStatement(/^alter table tabs add column x\b/i);
    const addY = findStatement(/^alter table tabs add column y\b/i);
    const xDone = await PowerBrowserAPI.tabStoreHasColumn(conn, "tabs", "x");
    const yDone = await PowerBrowserAPI.tabStoreHasColumn(conn, "tabs", "y");
    if (xDone && yDone) {
      await conn.setSchemaVersion(3);
      return;
    }
    await conn.executeTransaction(async () => {
      if (!xDone) {
        await conn.execute(addX);
      }
      if (!yDone) {
        await conn.execute(addY);
      }
      // Exactly 3, never the head: a store arriving here must still fall
      // through to migrateTabStoreToV4.
      await conn.setSchemaVersion(3);
    });
  },

  /**
   * GUI-08 (W-loose): places one tab on the canvas, or clears its placement.
   *
   * Bounds are clamped the way group geometry is (GROUP_BOUNDS_MAX): a
   * malformed actor message can move a card but can never park it where no
   * scroll will reach. Passing null for either coordinate clears BOTH, which
   * is what "put it back in the automatic line" means -- half a position is
   * not a position.
   */
  async setTabPosition(uri, x, y) {
    if (typeof uri !== "string" || !uri) {
      throw new Error("setTabPosition: uri must be a non-empty string");
    }
    const conn = await PowerBrowserAPI.openTabStore();
    // NG-004: a key with no row is an error, never a silent no-op the caller reads as saved.
    const known = await conn.execute("SELECT 1 FROM tabs WHERE uri = :uri", { uri });
    if (!known.length) {
      throw new Error(`setTabPosition: unknown tab URI ${uri}`);
    }
    const clear = x === null || x === undefined || y === null || y === undefined;
    const clamp = value => Math.max(0, Math.min(GROUP_BOUNDS_MAX, Math.floor(Number(value) || 0)));
    await conn.execute(
      "UPDATE tabs SET x = :x, y = :y WHERE uri = :uri",
      { uri, x: clear ? null : clamp(x), y: clear ? null : clamp(y) }
    );
  },

  /**
   * GUI-08 (W10): v3 to v4 -- a tab's place within its group.
   *
   * Same shape as its siblings: a column check rather than a PRAGMA shortcut,
   * the work plus the version bump in one transaction, already-done is a no-op
   * that only stamps. NULL-able with no default so an existing store keeps its
   * current URI ordering until a group is first arranged by hand.
   */
  async migrateTabStoreToV4(conn) {
    const statement = TAB_ORDER_V4_DDL.split(";").map(s => s.trim()).filter(Boolean)[0];
    if (!statement || !/^alter table tabs add column ord\b/i.test(statement)) {
      throw new Error("migrateTabStoreToV4: DDL marker content missing the ord column");
    }
    if (await PowerBrowserAPI.tabStoreHasColumn(conn, "tabs", "ord")) {
      // Exactly 4, never the head: a store arriving here must still fall through to migrateTabStoreToV5.
      await conn.setSchemaVersion(4);
      return;
    }
    await conn.executeTransaction(async () => {
      await conn.execute(statement);
      await conn.setSchemaVersion(4);
    });
  },

  /**
   * NG-001: v4 to v5. The marker block's statements in one transaction -- an
   * ADD COLUMN whose column exists is skipped, the CREATEs are IF NOT EXISTS,
   * the INSERTs OR IGNORE and the key rewrite matches only old-shape keys -- so
   * a store whose work is already done re-runs as a no-op that stamps 5.
   */
  async migrateTabStoreToV5(conn) {
    const statements = TAB_STORE_V5_DDL.split(";").map(s => s.trim()).filter(Boolean);
    if (!statements.some(s => /^update tabs set uri\b/i.test(s))) {
      throw new Error("migrateTabStoreToV5: DDL marker content missing the key rewrite");
    }
    await conn.executeTransaction(async () => {
      for (const statement of statements) {
        const column = /^alter table tabs add column (\w+)/i.exec(statement);
        if (column && (await PowerBrowserAPI.tabStoreHasColumn(conn, "tabs", column[1]))) {
          continue;
        }
        await conn.execute(statement);
      }
      // Exactly 5; a later head adds its own step after this one.
      await conn.setSchemaVersion(5);
    });
  },

  /**
   * NG-028 (non-GUI wave B): v5 to v6, the saved_pages table. The same shape
   * as the v5 step: the marker block's statements run in one transaction, the
   * CREATE is IF NOT EXISTS, so a store whose work is already done re-runs as
   * a no-op that stamps 6.
   */
  async migrateTabStoreToV6(conn) {
    const statements = TAB_STORE_V6_DDL.split(";").map(s => s.trim()).filter(Boolean);
    if (!statements.some(s => /^create table if not exists saved_pages\b/i.test(s))) {
      throw new Error("migrateTabStoreToV6: DDL marker content missing the saved_pages table");
    }
    await conn.executeTransaction(async () => {
      for (const statement of statements) {
        await conn.execute(statement);
      }
      // Exactly 6; a later head adds its own step after this one.
      await conn.setSchemaVersion(6);
    });
  },

  /**
   * NG-014: the one forward chain from whatever version the file carries to
   * the head, each step its own top-level transaction (CR-02: never nested).
   * openTabStore and the quarantine rebuild both run it, so a rebuilt store
   * lands at the head, never at a version in between.
   */
  async migrateTabStoreToHead(conn) {
    const steps = [
      PowerBrowserAPI.migrateTabStoreToV1,
      PowerBrowserAPI.migrateTabStoreToV2,
      PowerBrowserAPI.migrateTabStoreToV3,
      PowerBrowserAPI.migrateTabStoreToV4,
      PowerBrowserAPI.migrateTabStoreToV5,
      PowerBrowserAPI.migrateTabStoreToV6,
    ];
    if (steps.length !== TAB_STORE_SCHEMA_HEAD) {
      throw new Error(`migrateTabStoreToHead: ${steps.length} steps for head ${TAB_STORE_SCHEMA_HEAD}`);
    }
    for (let version = await conn.getSchemaVersion(); version < TAB_STORE_SCHEMA_HEAD; version += 1) {
      await steps[version](conn);
    }
  },

  /**
   * GUI-08 (W10): the order of one group's tabs, written as a whole.
   *
   * A list, not a tab at a time: dropping a card between two others renumbers
   * every tab after it, and sending those one by one would be N round trips
   * that can each fail separately and leave the group half-renumbered. One
   * transaction is either the new order or the old one.
   *
   * Ordinals are the array's own indices, so they stay dense and a later read
   * needs no interpretation. Rows not named here keep whatever they had.
   */
  async setGroupOrder(groupId, uris) {
    if (typeof groupId !== "string" || !groupId) {
      throw new Error("setGroupOrder: groupId must be a non-empty string");
    }
    if (!Array.isArray(uris)) {
      throw new Error("setGroupOrder: uris must be an array");
    }
    const conn = await PowerBrowserAPI.openTabStore();
    // NG-004: every named tab must be a row in this group; one that is not is an error.
    const group = await conn.execute("SELECT 1 FROM groups WHERE id = :groupId", { groupId });
    if (!group.length) {
      throw new Error(`setGroupOrder: unknown group ${groupId}`);
    }
    for (const uri of uris) {
      const member = await conn.execute("SELECT 1 FROM tabs WHERE uri = :uri AND group_id = :groupId", { uri: String(uri), groupId });
      if (!member.length) {
        throw new Error(`setGroupOrder: unknown tab URI ${String(uri)} in group ${groupId}`);
      }
    }
    await conn.executeTransaction(async () => {
      for (let index = 0; index < uris.length; index += 1) {
        await conn.execute(
          "UPDATE tabs SET ord = :ord WHERE uri = :uri AND group_id = :groupId",
          { ord: index, uri: String(uris[index]), groupId }
        );
      }
    });
  },

  /**
   * GUI-08 (15-01): column pre-check for the v2 migration. Reads back
   * PRAGMA table_info over the open connection; the table name is always an
   * internal literal at the call site, never actor input.
   */
  async tabStoreHasColumn(conn, table, column) {
    if (table !== "tabs" && table !== "groups") {
      throw new Error(`tabStoreHasColumn: refusing table ${table}`);
    }
    const rows = await conn.execute(`PRAGMA table_info(${table})`);
    for (const row of rows) {
      if (row.getString(1) === column) {
        return true;
      }
    }
    return false;
  },

  /**
   * SQL-01 (12-01): the single write path; NG-001 keys it by tab identity. The
   * private-window check runs BEFORE the upsert -- a private tab never reaches
   * SQL. An upsert reopens the row (closed_at NULL): a tab being written is
   * open. created_at is set once, on insert; an empty title never blanks a
   * stored one (a reopened tab writes before its page has a title).
   * last_active is 'last seen open'; last_accessed is 'last looked at' and
   * only moves when given (NG-009).
   */
  async writeTabRow({ uri, url, title, lastActive, lastAccessed, chromeWin }) {
    if (chromeWin && lazy.PrivateBrowsingUtils.isWindowPrivate(chromeWin)) {
      return "skipped-private";
    }
    const conn = await PowerBrowserAPI.openTabStore();
    const now = Date.now();
    try {
      await conn.executeCached(
        `INSERT INTO tabs (uri, url, title, last_active, created_at, last_accessed) VALUES (:uri, :url, :title, :last_active, :now, :last_accessed)
         ON CONFLICT (uri) DO UPDATE SET url=excluded.url,
           title=CASE WHEN excluded.title = '' THEN tabs.title ELSE excluded.title END,
           last_active=excluded.last_active,
           last_accessed=COALESCE(excluded.last_accessed, tabs.last_accessed), closed_at=NULL`,
        { uri, url, title: title ?? "", last_active: lastActive ?? now, now, last_accessed: lastAccessed ?? null }
      );
    } catch (err) {
      throw new Error(`writeTabRow: upsert failed for a ${tabKeyKind(uri)} key (${PowerBrowserAPI.tabStoreFailureClass(err)})`);
    }
    return "written";
  },

  /**
   * The live view of a tab ended without the user closing it -- a frontend
   * reload or the quit dropped its overlay (webTabClose via webTabDropOwnedBy).
   * NG-005: the row stays open; only last_active (last seen open) moves. A
   * user's close arrives as closeTab and marks the row closed.
   */
  async removeTabRow(uri) {
    const conn = await PowerBrowserAPI.openTabStore();
    await conn.execute("UPDATE tabs SET last_active = :now WHERE uri = :uri", { uri, now: Date.now() });
  },

  /** NG-005/NG-010: the user closed this tab; its row stays as closed-tab history until the prune. */
  async closeTabRow(uri) {
    const conn = await PowerBrowserAPI.openTabStore();
    await conn.execute("UPDATE tabs SET closed_at = :now WHERE uri = :uri AND closed_at IS NULL", { uri, now: Date.now() });
  },

  /** NG-009: the user looked at this tab now (a web or Theia tab was activated). */
  async touchTabRow(uri) {
    const conn = await PowerBrowserAPI.openTabStore();
    await conn.execute("UPDATE tabs SET last_accessed = :now WHERE uri = :uri", { uri, now: Date.now() });
  },

  /** NG-010: a closed tab from sessionstore; an open row it names is closed, an absent one inserted as history. */
  async writeClosedTabRow({ uri, url, title, closedAt }) {
    const conn = await PowerBrowserAPI.openTabStore();
    await conn.executeCached(
      `INSERT INTO tabs (uri, url, title, last_active, created_at, closed_at) VALUES (:uri, :url, :title, :closed_at, :closed_at, :closed_at)
       ON CONFLICT (uri) DO UPDATE SET closed_at = COALESCE(tabs.closed_at, excluded.closed_at)`,
      { uri, url, title: title ?? "", closed_at: closedAt }
    );
  },

  /**
   * NG-005: stock rows sessionstore no longer lists as open are closed -- the
   * window was closed, or the tab was restored under its saved key and the key
   * minted before the restore is an orphan. `liveKeys` is sessionstore's open set.
   */
  async closeAbsentStockRows(liveKeys) {
    const conn = await PowerBrowserAPI.openTabStore();
    const params = { now: Date.now() };
    const names = [...new Set(liveKeys)].map((key, i) => {
      params[`k${i}`] = key;
      return `:k${i}`;
    });
    await conn.execute(
      `UPDATE tabs SET closed_at = :now WHERE closed_at IS NULL AND uri GLOB 'stock:*'${names.length ? ` AND uri NOT IN (${names.join(", ")})` : ""}`,
      params
    );
  },

  /**
   * NG-005: at startup no in-shell web tab can be open -- the frontend has not
   * loaded. An ungrouped web row ended with the last session and becomes
   * closed-tab history, placed or not (ruling A-F1: not-open cards are drawn
   * for grouped tabs only, R6); the launch restore reopens the row of each tab
   * it brings back. Grouped ones stay open as Panorama cards.
   * T2-R3: an orphan about:blank row (url '') never had a page, so it is
   * deleted, not kept as fake closed-tab history.
   */
  async closeEndedWebRows() {
    const conn = await PowerBrowserAPI.openTabStore();
    await conn.execute(
      "DELETE FROM tabs WHERE closed_at IS NULL AND uri GLOB 'web:*' AND group_id IS NULL AND x IS NULL AND url = ''"
    );
    await conn.execute(
      "UPDATE tabs SET closed_at = :now WHERE closed_at IS NULL AND uri GLOB 'web:*' AND group_id IS NULL",
      { now: Date.now() }
    );
  },

  /**
   * NG-001: the row of a Theia-drawn tab (editor, terminal, view), keyed by its
   * registry address and written the first time it is organised. Stock and web
   * keys are chrome's own, and a plugin panel's webview: address or a page URL
   * is never a row key (F5), so all four are refused here.
   */
  async trackShellTab(uri, url, title) {
    if (typeof uri !== "string" || !uri || uri.length > 2048 || /^(stock|web|webview|https?):/i.test(uri)) {
      throw new Error("trackShellTab: refusing malformed tab key");
    }
    // A Theia key is an address, so a tab reopened later reuses a closed row.
    // It is a new tab: the old row's group and place do not come back with it
    // (web and stock rows, whose keys are identities, revive with theirs).
    const conn = await PowerBrowserAPI.openTabStore();
    await conn.execute(
      "UPDATE tabs SET group_id = NULL, x = NULL, y = NULL, ord = NULL WHERE uri = :uri AND closed_at IS NOT NULL",
      { uri }
    );
    return PowerBrowserAPI.writeTabRow({
      uri,
      url: typeof url === "string" ? url.slice(0, 2048) : "",
      title: typeof title === "string" ? title.slice(0, 512) : "",
    });
  },

  /**
   * GUI-08 (15-01): normalises one group row the way writeTabRow binds its
   * values -- id must be non-empty (rejected loudly naming method + id),
   * title trimmed and cut at the contracted 60-char cap (empty falls back
   * to the DDL default, never a blank header), bounds finite numbers >= 0
   * clamped to the sane max (w/h additionally floored at the DDL minimums
   * so the row can never violate its own CHECKs). Throws, never stores.
   */
  normalizeGroupRow(method, { id, title, x, y, w, h, isActive }) {
    if (typeof id !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(id)) {
      throw new Error(`${method}: refusing malformed group id`);
    }
    if (title !== undefined && title !== null && typeof title !== "string") {
      throw new Error(`${method}: refusing non-string title for ${id}`);
    }
    const cleanTitle = (title ?? "Untitled group").trim().slice(0, GROUP_TITLE_MAX) || "Untitled group";
    const at = (name, value, floor) => {
      const n = Number(value ?? floor);
      if (!Number.isFinite(n)) {
        throw new Error(`${method}: refusing non-finite ${name} for ${id}`);
      }
      return Math.min(Math.max(Math.floor(n), floor), GROUP_BOUNDS_MAX);
    };
    return {
      id,
      title: cleanTitle,
      x: at("x", x, 0),
      y: at("y", y, 0),
      w: at("w", w, 200),
      h: at("h", h, 144),
      is_active: isActive ? 1 : 0,
    };
  },

  /**
   * GUI-08 (15-01): the single group write path, following writeTabRow
   * (bound params only, INSERT ... ON CONFLICT ... DO UPDATE, loud errors
   * naming method + key). Groups carry no private-window surface -- tab
   * URIs do, and those are validated at setTabGroupId/writeThumbnail below.
   */
  async writeGroupRow({ id, title, x, y, w, h, isActive }) {
    const group = PowerBrowserAPI.normalizeGroupRow("writeGroupRow", { id, title, x, y, w, h, isActive });
    const conn = await PowerBrowserAPI.openTabStore();
    try {
      await conn.executeCached(
        `INSERT INTO groups (id, title, x, y, w, h, is_active) VALUES (:id, :title, :x, :y, :w, :h, :is_active)
         ON CONFLICT (id) DO UPDATE SET title=excluded.title, x=excluded.x, y=excluded.y, w=excluded.w, h=excluded.h, is_active=excluded.is_active`,
        group
      );
    } catch (err) {
      throw new Error(`writeGroupRow: upsert failed for ${id}: ${err && err.message ? err.message : err}`);
    }
    return "written";
  },

  /**
   * GUI-08 (15-01): dissolves one group by opaque id. Member tabs are
   * ungrouped (group_id NULL) in the same transaction -- a dissolve never
   * orphans membership references -- then the row is removed. Tabs survive;
   * the tab-CLOSING path is closeGroupRows below. Bound params, loud errors.
   */
  async removeGroupRow(id) {
    if (typeof id !== "string" || !id) {
      throw new Error("removeGroupRow: refusing group with empty id");
    }
    const conn = await PowerBrowserAPI.openTabStore();
    try {
      await conn.executeTransaction(async () => {
        await conn.execute("UPDATE tabs SET group_id = NULL WHERE group_id = :id", { id });
        await conn.execute("DELETE FROM groups WHERE id = :id", { id });
      });
    } catch (err) {
      throw new Error(`removeGroupRow: dissolve failed for ${id}: ${err && err.message ? err.message : err}`);
    }
    return "removed";
  },

  /**
   * GUI-08 (15-01): assigns one tab row to a group (or NULL to ungroup),
   * following writeTabRow's bound-param + loud-error shape. Both keys are
   * opaque: the URI must be a known row and a non-null group id must be a
   * known group, else rejected loudly naming method + URI and never stored.
   * Private-window tabs never have rows (writeTabRow skips them before the
   * upsert), so the known-row check is also the private-exclusion gate here.
   */
  async setTabGroupId(uri, groupId) {
    if (typeof uri !== "string" || !uri) {
      throw new Error("setTabGroupId: refusing empty tab URI");
    }
    const conn = await PowerBrowserAPI.openTabStore();
    try {
      const known = await conn.execute("SELECT 1 FROM tabs WHERE uri = :uri", { uri });
      if (!known.length) {
        throw new Error(`setTabGroupId: unknown tab URI ${uri}`);
      }
      if (groupId !== null && groupId !== undefined) {
        if (typeof groupId !== "string" || !groupId) {
          throw new Error(`setTabGroupId: refusing empty group id for ${uri}`);
        }
        const group = await conn.execute("SELECT 1 FROM groups WHERE id = :id", { id: groupId });
        if (!group.length) {
          throw new Error(`setTabGroupId: unknown group ${groupId} for ${uri}`);
        }
      }
      await conn.execute("UPDATE tabs SET group_id = :groupId WHERE uri = :uri", {
        groupId: groupId ?? null,
        uri,
      });
    } catch (err) {
      if (err && err.message && err.message.startsWith("setTabGroupId:")) {
        throw err;
      }
      throw new Error(`setTabGroupId: assign failed for ${uri}: ${err && err.message ? err.message : err}`);
    }
    return "assigned";
  },

  /**
   * GUI-08 (15-01): marks exactly one group active (15-RESEARCH.md A6:
   * is_active column, writer-enforced invariant). Clears the others in the
   * same transaction, so the store can never hold zero or two active rows
   * after this resolves. Rejects unknown ids loudly, never stored.
   */
  async setActiveGroup(id) {
    if (typeof id !== "string" || !id) {
      throw new Error("setActiveGroup: refusing empty group id");
    }
    const conn = await PowerBrowserAPI.openTabStore();
    try {
      const known = await conn.execute("SELECT 1 FROM groups WHERE id = :id", { id });
      if (!known.length) {
        throw new Error(`setActiveGroup: unknown group ${id}`);
      }
      await conn.executeTransaction(async () => {
        await conn.execute("UPDATE groups SET is_active = 0");
        await conn.execute("UPDATE groups SET is_active = 1 WHERE id = :id", { id });
      });
    } catch (err) {
      if (err && err.message && err.message.startsWith("setActiveGroup:")) {
        throw err;
      }
      throw new Error(`setActiveGroup: activate failed for ${id}: ${err && err.message ? err.message : err}`);
    }
    return "active";
  },

  /**
   * GUI-08 (15-01): stores one PNG last-view snapshot (data URL) on a known
   * tab row, following writeTabRow's bound-param + loud-error shape. NULL
   * clears back to the contracted text fallback; bytes over the cap drop to
   * NULL (same fallback) instead of bloating the store. Unknown URIs reject
   * loudly -- private-window tabs never have rows, so this is also the
   * private-exclusion gate for capture.
   */
  async writeThumbnail(uri, dataUrl) {
    if (typeof uri !== "string" || !uri) {
      throw new Error("writeThumbnail: refusing empty tab URI");
    }
    const conn = await PowerBrowserAPI.openTabStore();
    try {
      const known = await conn.execute("SELECT 1 FROM tabs WHERE uri = :uri", { uri });
      if (!known.length) {
        throw new Error(`writeThumbnail: unknown tab URI ${uri}`);
      }
      if (dataUrl === null || dataUrl === undefined) {
        await conn.execute("UPDATE tabs SET thumbnail = NULL WHERE uri = :uri", { uri });
        return "cleared";
      }
      if (String(dataUrl).length > TAB_STORE_THUMBNAIL_MAX_CHARS) {
        await conn.execute("UPDATE tabs SET thumbnail = NULL WHERE uri = :uri", { uri });
        return "dropped-over-cap";
      }
      await conn.execute("UPDATE tabs SET thumbnail = :thumbnail WHERE uri = :uri", {
        thumbnail: String(dataUrl),
        uri,
      });
    } catch (err) {
      if (err && err.message && err.message.startsWith("writeThumbnail:")) {
        throw err;
      }
      throw new Error(`writeThumbnail: store failed for ${uri}: ${err && err.message ? err.message : err}`);
    }
    return "written";
  },

  /**
   * GUI-08 (15-01): closes exactly one group's tabs and removes the box
   * (the ONLY destructive group path). Each member tab closes through the
   * stock tab container first -- the existing TabClose triggers then do row
   * cleanup through the one path -- with every member row marked closed
   * in the same transaction as the group removal, so a tab without a
   * live browser (or a failed close) still leaves no orphan row. Loud errors
   * naming method + id. Unknown ids resolve as already-closed success (WR-02:
   * the frontend Retry discipline assumes idempotency -- a close whose ack
   * was lost must not resurrect a ghost box on replay).
   */
  async closeGroupRows(id) {
    if (typeof id !== "string" || !id) {
      throw new Error("closeGroupRows: refusing empty group id");
    }
    const conn = await PowerBrowserAPI.openTabStore();
    let members = [];
    try {
      const group = await conn.execute("SELECT 1 FROM groups WHERE id = :id", { id });
      if (!group.length) {
        return "already-closed";
      }
      const rows = await conn.execute("SELECT uri FROM tabs WHERE group_id = :id", { id });
      members = rows.map(row => row.getString(0));
    } catch (err) {
      if (err && err.message && err.message.startsWith("closeGroupRows:")) {
        throw err;
      }
      throw new Error(`closeGroupRows: member read failed for ${id}: ${err && err.message ? err.message : err}`);
    }
    for (const uri of members) {
      try {
        PowerBrowserAPI.closeStockTabByUri(uri);
      } catch (err) {
        PowerBrowserAPI.log("error", `[closeGroupRows] stock close failed for ${uri}: ${err && err.message ? err.message : err}`);
      }
    }
    try {
      await conn.executeTransaction(async () => {
        // NG-006/NG-010: the members close with their tabs and stay as
        // closed-tab history; membership is cleared so no row names a group
        // that no longer exists.
        await conn.execute(
          "UPDATE tabs SET group_id = NULL, closed_at = COALESCE(closed_at, :now) WHERE group_id = :id",
          { id, now: Date.now() }
        );
        await conn.execute("DELETE FROM groups WHERE id = :id", { id });
      });
    } catch (err) {
      throw new Error(`closeGroupRows: close failed for ${id}: ${err && err.message ? err.message : err}`);
    }
    return "closed";
  },

  /**
   * GUI-08 (15-02): capture-on-settle scheduler. TabSelect-leave and TabClose
   * call this -- NEVER captureToCanvas synchronously inside onTabEvent.
   * Coalesced per tab URI (a re-schedule invalidates the earlier timer), run
   * through sleep() so no new timer surface is added, private windows skipped
   * at schedule time with a second skip inside captureTabThumbnail. Never
   * throws: scheduling must not break the tab-event hot path.
   */
  scheduleSettleCapture(uri, chromeWin) {
    try {
      if (typeof uri !== "string" || !uri) {
        return;
      }
      if (chromeWin && lazy.PrivateBrowsingUtils.isWindowPrivate(chromeWin)) {
        return;
      }
      settleCaptureTokens.set(uri, (settleCaptureTokens.get(uri) ?? 0) + 1);
      const token = settleCaptureTokens.get(uri);
      PowerBrowserAPI.sleep(TAB_THUMBNAIL_SETTLE_MS).then(() => {
        if (settleCaptureTokens.get(uri) !== token) {
          return;
        }
        settleCaptureTokens.delete(uri);
        PowerBrowserAPI.captureTabThumbnail(uri).catch(err => {
          PowerBrowserAPI.log("error", `[thumb-capture] settle capture failed for ${uri}: ${err && err.message ? err.message : err}`);
        });
      });
    } catch {
      // Scheduling is best-effort; the text fallback stands on any failure.
    }
  },

  /**
   * GUI-08 (15-02): PNG last-view snapshot for one tab row. Finds the live
   * stock tab OR the live in-shell overlay by opaque URI key (14.1.1-02 --
   * before that every in-shell tab captured nothing), draws it at card width (160px target,
   * sketch background so unpainted regions match the canvas), and stores the
   * data URL through writeThumbnail -- over the capture cap, or with no live
   * browser, the row clears to NULL and the card keeps its contracted text
   * fallback. Private windows skip here as well as at schedule time (v1
   * writeTabRow precedent -- no private column exists to select on). A row
   * already closed (T2-C3) is skipped before anything else: the settle timer
   * fires after the close, the tab is gone, and the no-live-tab path would
   * otherwise clear the kept history's snapshot to NULL. Never
   * throws: capture failures are silent by contract, never a spinner/glyph.
   */
  async captureTabThumbnail(uri) {
    try {
      if (typeof uri !== "string" || !uri) {
        return "refused-empty";
      }
      try {
        const conn = await PowerBrowserAPI.openTabStore();
        const rows = await conn.execute("SELECT closed_at FROM tabs WHERE uri = :uri", { uri });
        if (rows.length && rows[0].getResultByName("closed_at") !== null) {
          return "skipped-closed";
        }
      } catch {
        // The closed check is best-effort; the capture below still runs.
      }
      const found = PowerBrowserAPI.findTabBrowserForUri(uri);
      if (!found) {
        await PowerBrowserAPI.writeThumbnail(uri, null).catch(() => undefined);
        return "no-live-tab";
      }
      if (lazy.PrivateBrowsingUtils.isWindowPrivate(found.win)) {
        return "skipped-private";
      }
      const canvas = found.browser.ownerDocument.createElementNS("http://www.w3.org/1999/xhtml", "canvas");
      await lazy.PageThumbs.captureToCanvas(found.browser, canvas, {
        targetWidth: 160,
        preserveAspectRatio: true,
        backgroundColor: "#2b2a33",
      });
      let dataUrl = "";
      try {
        dataUrl = canvas.toDataURL("image/png");
      } catch {
        dataUrl = "";
      }
      if (!dataUrl || dataUrl.length > TAB_THUMBNAIL_CAPTURE_MAX_CHARS) {
        await PowerBrowserAPI.writeThumbnail(uri, null).catch(() => undefined);
        return dataUrl ? "dropped-over-cap" : "capture-failed";
      }
      return PowerBrowserAPI.writeThumbnail(uri, dataUrl);
    } catch {
      return "capture-failed";
    }
  },

  /**
   * GUI-08 (15-02): live stock-tab lookup by row key (NG-001: the tab's
   * custom value, stockTabKey), through the same window enumeration the
   * tab-store triggers use. Shared by the group
   * close path and the thumbnail capture path so the two can never disagree
   * on which browser a URI names. Returns { win, tab, browser } or null.
   * The shell window carries no tab browser, so it never matches.
   */
  findStockTabBrowser(uri) {
    const stockWindows = Services.wm.getEnumerator("navigator:browser");
    while (stockWindows.hasMoreElements()) {
      const win = stockWindows.getNext();
      const tabs = (win.gBrowser && win.gBrowser.tabs) || [];
      for (const tab of tabs) {
        if (tab && lazy.SessionStore.getCustomTabValue(tab, STOCK_TAB_KEY_VALUE) === uri) {
          return { win, tab, browser: tab.linkedBrowser };
        }
      }
    }
    return null;
  },

  /**
   * GUI-08 (14.1.1-02): live tab-browser lookup by opaque URI key across BOTH
   * tab shapes -- a stock window's XUL tab first, then this shell's web-tab
   * overlays. Since 14.1 every tab Chris opens is an overlay, so a capture
   * that could only resolve a stock tab found nothing to draw and every
   * Panorama card fell to the no-thumbnail state.
   *
   * Overlay entries are keyed on `entry.uri` EXACTLY -- the same value the
   * overlay's onLocationChange passed to writeTabRow -- so a thumbnail always
   * lands on a row that exists.
   *
   * Returns { win, tab, browser } or null. `tab` is null for an overlay:
   * there is no XUL tab record behind it. That is why closeStockTabByUri,
   * which dereferences `found.tab`, keeps calling findStockTabBrowser
   * directly and must NOT be repointed here.
   */
  findTabBrowserForUri(uri) {
    const stock = PowerBrowserAPI.findStockTabBrowser(uri);
    if (stock) {
      return stock;
    }
    for (const entry of webTabs.values()) {
      if (entry && entry.uri === uri && entry.browser) {
        return { win: entry.browser.ownerDocument.defaultView, tab: null, browser: entry.browser };
      }
    }
    return null;
  },

  /**
   * GUI-08 (W-preview): a picture of one rectangle of the Theia frame.
   *
   * Some tabs are not pages. The Welcome view, an editor, a terminal -- these
   * are Theia widgets drawn inside the frame, not documents in a browser
   * element, so `captureTabThumbnail` has nothing to point at and their cards
   * had no preview at all. The frame ITSELF is a browser element, though, and
   * `drawSnapshot` takes a rectangle of one, so the widget's own bounds give
   * a real image of how that tab last looked.
   *
   * Scaled down at capture time rather than by CSS afterwards: a card is a
   * couple of hundred pixels wide and a full-size frame snapshot would be a
   * megabyte of data URL for it. Over the cap it resolves null and the card
   * keeps its text fallback, exactly as a failed page capture does.
   *
   * Resolves a data URL or null; never throws, because a preview is a nicety
   * and losing one must not break a mode switch.
   */
  async captureShellRegion(theiaBrowser, rect) {
    try {
      if (!theiaBrowser || !rect) {
        return null;
      }
      const w = Math.max(1, Math.round(Number(rect.w) || 0));
      const h = Math.max(1, Math.round(Number(rect.h) || 0));
      if (w < 8 || h < 8) {
        return null;
      }
      const scale = Math.min(1, TAB_THUMBNAIL_TARGET_WIDTH / w);
      const bitmap = await theiaBrowser.drawSnapshot(
        Math.max(0, Math.round(Number(rect.x) || 0)),
        Math.max(0, Math.round(Number(rect.y) || 0)),
        w,
        h,
        scale,
        "#2b2a33"
      );
      if (!bitmap) {
        return null;
      }
      const doc = theiaBrowser.ownerDocument;
      const canvas = doc.createElementNS("http://www.w3.org/1999/xhtml", "canvas");
      canvas.width = Math.max(1, Math.round(w * scale));
      canvas.height = Math.max(1, Math.round(h * scale));
      canvas.getContext("2d").drawImage(bitmap, 0, 0);
      if (typeof bitmap.close === "function") {
        bitmap.close();
      }
      const dataUrl = canvas.toDataURL("image/png");
      return dataUrl && dataUrl.length <= TAB_THUMBNAIL_CAPTURE_MAX_CHARS ? dataUrl : null;
    } catch (err) {
      PowerBrowserAPI.log("error", `[shell-capture] ${err && err.message ? err.message : err}`);
      return null;
    }
  },

  /**
   * GUI-08 (15-01): best-effort stock-tab close by opaque URI key, through
   * the stock-only lookup above -- NOT findTabBrowserForUri, which can return
   * an overlay whose `tab` is null. Returns true when a live tab matched and was
   * asked to close. Never throws -- the caller logs and relies on its
   * deterministic row DELETE.
   */
  closeStockTabByUri(uri) {
    const found = PowerBrowserAPI.findStockTabBrowser(uri);
    if (!found) {
      return false;
    }
    found.win.gBrowser.removeTab(found.tab);
    return true;
  },

  /**
   * GUI-08 (15-01): group point read by opaque id. Never-throw read
   * convention: resolves null on any failure, matching getStringPref above.
   * Shared by the parent actor and the Theia reader contract.
   */
  async readGroupRow(id) {
    try {
      const conn = await PowerBrowserAPI.openTabStore();
      const rows = await conn.execute(
        "SELECT id, title, x, y, w, h, is_active FROM groups WHERE id = :id",
        { id }
      );
      if (!rows.length) {
        return null;
      }
      return {
        id: rows[0].getString(0),
        title: rows[0].getString(1),
        x: rows[0].getInt32(2),
        y: rows[0].getInt32(3),
        w: rows[0].getInt32(4),
        h: rows[0].getInt32(5),
        is_active: rows[0].getInt32(6),
      };
    } catch {
      return null;
    }
  },

  /**
   * GUI-08 (15-01): registers the PowerBrowserGroup actor pair -- the SOLE
   * actor-registration caller in this tree (the guard fails any second one
   * by design). The child loads only in documents matching the Theia local
   * origin; the parent class below lives in this same boundary file so no
   * second file reaches a privileged surface. Called once from
   * TheiaService.start beside the tab-store wiring, through PowerBrowserAPI
   * only. Never throws: a duplicate or late call resolves quietly so startup
   * can never stall on the write channel.
   */
  registerGroupActor() {
    if (groupActorRegistered) {
      return;
    }
    groupActorRegistered = true;
    ChromeUtils.registerWindowActor(GROUP_ACTOR_NAME, {
      parent: {
        esModuleURI: GROUP_ACTOR_PARENT_MODULE,
      },
      child: {
        esModuleURI: GROUP_ACTOR_CHILD_MODULE,
        events: {
          // `wantUntrusted` is load-bearing, not decoration. The frontend is
          // web content, so every PowerBrowserGroupRequest it dispatches is an
          // UNTRUSTED event, and Gecko drops an untrusted event for any
          // listener that did not ask for one
          // (EventListenerManager::Listener::AllowsEventTrustedness,
          // upstream/dom/events/EventListenerManager.h:277-280). The actor
          // registration path defaults the flag to FALSE when the events entry
          // omits it (upstream/dom/ipc/jsactor/JSWindowActorProtocol.cpp:130-133),
          // so 15-01 registered a child that could never run: the request
          // never reached handleEvent and every mutation waited out the full
          // 5s ack timeout into the save-error bar. Upstream sets it on every
          // actor that listens to a content page's own CustomEvents --
          // about:logins' entire event table does
          // (upstream/browser/components/DesktopActorRegistry.sys.mjs:104-121).
          PowerBrowserGroupRequest: { capture: true, wantUntrusted: true },
        },
      },
      matches: [`${GROUP_ACTOR_THEIA_ORIGIN}/*`],
    });
  },

  /**
   * NG-038: records the sidecar's live port for the sender wall. Called by
   * TheiaService._swap before the Theia frame is navigated, and only there. A
   * non-positive or non-integer port clears it, which refuses every sender.
   * A valid port also installs the token-cookie strip (BAR-02), right after
   * the cookie is minted, so it covers every load in the process, and
   * (Phase 33, BMK-04) the Places bookmark observer beside it.
   */
  setGroupSenderPort(port) {
    groupSenderPort = Number.isInteger(port) && port > 0 ? port : null;
    if (groupSenderPort !== null) installTokenCookieStrip();
    if (groupSenderPort !== null) installBookmarkObserver();
  },

  /**
   * NG-033: the parent-side dispatch for the frontend's profile store and the
   * quit-flush acknowledgement, routed here from PowerBrowserGroupParent by
   * kind. Same sender wall and reply shape as handleGroupMutation.
   */
  async handleShellMessage(data, actorRef) {
    if (!groupSenderIsTheia(actorRef)) {
      PowerBrowserAPI.log("error", "[handleShellMessage] rejecting non-Theia-origin sender");
      return { ok: false, reason: "validation", message: "handleShellMessage: rejecting non-Theia-origin sender" };
    }
    const kind = data && data.kind;
    const path = `${PowerBrowserAPI.getProfileDir()}/${SHELL_STATE_FILE_NAME}`;
    try {
      switch (kind) {
        case "shellStateLoad": {
          let state = "{}";
          try {
            state = await IOUtils.readUTF8(path);
          } catch {
            // Absent on a profile's first launch: the empty map.
          }
          if (state.length > SHELL_STATE_MAX_CHARS) {
            return { ok: false, reason: "store", message: "handleShellMessage: the stored shell state exceeds the size cap" };
          }
          return { ok: true, kind, state };
        }
        case "shellStateSave": {
          const state = data.state;
          if (typeof state !== "string" || state.length > SHELL_STATE_MAX_CHARS) {
            return { ok: false, reason: "validation", message: "handleShellMessage: refusing a shell state that is not a string within the size cap" };
          }
          let parsed;
          try {
            parsed = JSON.parse(state);
          } catch {
            parsed = null;
          }
          if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
            return { ok: false, reason: "validation", message: "handleShellMessage: refusing a shell state that is not a JSON object" };
          }
          await IOUtils.writeUTF8(path, state, { tmpPath: `${path}.tmp` });
          return { ok: true, kind };
        }
        case "shellFlushed": {
          const resolve = pendingShellFlushes.get(data.flushId);
          if (resolve) {
            resolve();
          }
          return { ok: true, kind };
        }
        case "shellArmWebTabHistory": {
          if (typeof data.key !== "string" || !WEB_TAB_ROW_KEY_RE.test(data.key)) {
            return { ok: false, reason: "validation", message: "handleShellMessage: refusing a malformed web-tab row key" };
          }
          armedWebTabHistories.add(data.key);
          return { ok: true, kind };
        }
        default:
          return { ok: false, reason: "validation", message: `handleShellMessage: unknown kind ${String(kind)}` };
      }
    } catch (err) {
      // Final-review M3: the IOUtils failure names the profile file -- reply
      // with the fixed string plus err.name, never the message text.
      return { ok: false, reason: "store", message: `handleShellMessage: ${kind} failed (store ${err && err.name ? err.name : "error"})` };
    }
  },

  /**
   * NG-032/NG-033: asks the Theia frame to write its session and layout now,
   * over the push the web-tab state rides, and waits for its shellFlushed
   * acknowledgement or `timeoutMs`. True on the ack; false on a timeout or
   * when there is no frontend to ask. Never throws, so a quit is never held
   * past the timeout.
   */
  async flushShellState(theiaBrowser, timeoutMs) {
    const flushId = `flush-${Date.now().toString(36)}-${(shellFlushSeq += 1)}`;
    const acked = new Promise(resolve => pendingShellFlushes.set(flushId, resolve));
    try {
      theiaBrowser.browsingContext.currentWindowGlobal
        .getActor(GROUP_ACTOR_NAME)
        .sendAsyncMessage("PowerBrowserWebTabState", { kind: "flushShellState", flushId });
    } catch (err) {
      pendingShellFlushes.delete(flushId);
      // Final-review M3: the actor/send failure text can carry internal paths
      // -- fixed string plus err.name only.
      PowerBrowserAPI.log("error", `[flushShellState] no frontend to flush (${err && err.name ? err.name : "error"})`);
      return false;
    }
    const done = await Promise.race([acked.then(() => true), PowerBrowserAPI.sleep(timeoutMs).then(() => false)]);
    pendingShellFlushes.delete(flushId);
    return done;
  },

  /**
   * GUI-08 (15-01): the parent-side dispatch for PowerBrowserGroupMutation
   * queries. Returns { ok: true, ...echo } on success, { ok: false, reason }
   * otherwise -- reason 'validation' for shape/origin/kind violations,
   * 'store' for failures inside the writer. Never throws and never stores a
   * violating message: the writer methods throw loudly naming method + key,
   * and that text becomes the reply message so the frontend save-error path
   * can report it. actorRef is the parent actor instance, used only to read
   * back the sender document for the W5 origin check.
   */
  async handleGroupMutation(data, actorRef) {
    if (!groupSenderIsTheia(actorRef)) {
      PowerBrowserAPI.log("error", "[handleGroupMutation] rejecting non-Theia-origin sender");
      return { ok: false, reason: "validation", message: "handleGroupMutation: rejecting non-Theia-origin sender" };
    }
    const kind = data && data.kind;
    try {
      switch (kind) {
        case "createGroup": {
          await PowerBrowserAPI.writeGroupRow({
            id: data.id,
            title: data.title,
            x: data.x,
            y: data.y,
            w: data.w,
            h: data.h,
            isActive: data.isActive,
          });
          return { ok: true, kind, id: data.id };
        }
        case "setTabGroup": {
          await PowerBrowserAPI.setTabGroupId(
            data.uri,
            data.groupId === undefined ? null : data.groupId
          );
          return { ok: true, kind, uri: data.uri };
        }
        case "setTabPosition": {
          await PowerBrowserAPI.setTabPosition(data.uri, data.x, data.y);
          return { ok: true, kind, uri: data.uri };
        }
        case "setGroupOrder": {
          await PowerBrowserAPI.setGroupOrder(data.groupId, data.uris);
          return { ok: true, kind, id: data.groupId };
        }
        case "captureShellRegion": {
          const theiaBrowser = actorRef.browsingContext.top.embedderElement;
          const png = await PowerBrowserAPI.captureShellRegion(theiaBrowser, data.rect);
          return { ok: true, kind, png };
        }
        case "moveGroup": {
          const current = await PowerBrowserAPI.readGroupRow(data.id);
          if (!current) {
            throw new Error(`handleGroupMutation: unknown group ${data.id}`);
          }
          await PowerBrowserAPI.writeGroupRow({
            id: current.id,
            title: current.title,
            x: data.x,
            y: data.y,
            w: current.w,
            h: current.h,
            isActive: current.is_active,
          });
          return { ok: true, kind, id: data.id };
        }
        case "resizeGroup": {
          const current = await PowerBrowserAPI.readGroupRow(data.id);
          if (!current) {
            throw new Error(`handleGroupMutation: unknown group ${data.id}`);
          }
          await PowerBrowserAPI.writeGroupRow({
            id: current.id,
            title: current.title,
            x: current.x,
            y: current.y,
            w: data.w,
            h: data.h,
            isActive: current.is_active,
          });
          return { ok: true, kind, id: data.id };
        }
        case "renameGroup": {
          const current = await PowerBrowserAPI.readGroupRow(data.id);
          if (!current) {
            throw new Error(`handleGroupMutation: unknown group ${data.id}`);
          }
          await PowerBrowserAPI.writeGroupRow({
            id: current.id,
            title: data.title,
            x: current.x,
            y: current.y,
            w: current.w,
            h: current.h,
            isActive: current.is_active,
          });
          return { ok: true, kind, id: data.id };
        }
        case "dissolveGroup": {
          await PowerBrowserAPI.removeGroupRow(data.id);
          return { ok: true, kind, id: data.id };
        }
        case "closeGroup": {
          await PowerBrowserAPI.closeGroupRows(data.id);
          return { ok: true, kind, id: data.id };
        }
        case "setActiveGroup": {
          await PowerBrowserAPI.setActiveGroup(data.id);
          return { ok: true, kind, id: data.id };
        }
        // NG-001: a Theia-drawn tab gets its row the first time it is organised.
        case "trackTab": {
          await PowerBrowserAPI.trackShellTab(data.uri, data.url, data.title);
          return { ok: true, kind, uri: data.uri };
        }
        // NG-005: the user closed a web or Theia tab; stock closes arrive as TabClose.
        case "closeTab": {
          if (typeof data.uri !== "string" || !data.uri || data.uri.length > 2048 || data.uri.startsWith("stock:")) {
            return { ok: false, reason: "validation", message: "handleGroupMutation: refusing malformed tab key" };
          }
          await PowerBrowserAPI.closeTabRow(data.uri);
          return { ok: true, kind, uri: data.uri };
        }
        // NG-009: a web or Theia tab was activated; stock selection arrives as TabSelect.
        case "touchTab": {
          if (typeof data.uri !== "string" || !data.uri || data.uri.length > 2048 || data.uri.startsWith("stock:")) {
            return { ok: false, reason: "validation", message: "handleGroupMutation: refusing malformed tab key" };
          }
          await PowerBrowserAPI.touchTabRow(data.uri);
          return { ok: true, kind, uri: data.uri };
        }
        // GUI-01 (F9): the navigation kind, riding the group pair rather than
        // a second actor pair -- one channel means one origin wall
        // (groupSenderIsTheia above) and one boundary file, which is the whole
        // point of D-96. It is the only kind here that writes no row; the
        // reply carries openStockTab's own outcome word so a caller that does
        // read the ack can tell a reused tab from a fresh window from a
        // refusal.
        case "openStockTab": {
          return { ok: true, kind, where: await PowerBrowserAPI.openStockTab(data.url) };
        }
        // GUI-02 (14.1-01): the in-shell web-tab kinds, riding the same pair
        // for the same one-wall reason as openStockTab. The Theia frame is
        // resolved FROM THE SENDER (the actor's top embedder element), never
        // looked up by id, so the overlay is always placed in the document
        // that asked for it. Every arm applies the tabId shape wall before
        // the host method reads the map; the reply carries the host's own
        // outcome word as `where` so the widget can tell an idempotent
        // re-open from a refusal from a tab chrome no longer holds.
        case "webTabOpen": {
          if (!webTabIdIsValid(data.tabId)) {
            return { ok: false, reason: "validation", message: "handleGroupMutation: refusing malformed tabId" };
          }
          if (data.key !== undefined && !webTabKeyIsValid(data.key)) {
            return { ok: false, reason: "validation", message: "handleGroupMutation: refusing malformed tab key" };
          }
          const theiaBrowser = actorRef.browsingContext.top.embedderElement;
          return { ok: true, kind, where: PowerBrowserAPI.webTabOpen(theiaBrowser, actorRef, data.tabId, data.url, data.key) };
        }
        case "webTabGeometry": {
          if (!webTabIdIsValid(data.tabId)) {
            return { ok: false, reason: "validation", message: "handleGroupMutation: refusing malformed tabId" };
          }
          const { x, y, w, h } = data;
          if (![x, y, w, h].every(Number.isFinite)) {
            return { ok: false, reason: "validation", message: "handleGroupMutation: refusing non-finite geometry" };
          }
          const theiaBrowser = actorRef.browsingContext.top.embedderElement;
          const rect = { x, y, w, h, visible: !!data.visible };
          return { ok: true, kind, where: PowerBrowserAPI.webTabGeometry(theiaBrowser, data.tabId, rect) };
        }
        case "webTabNavigate": {
          if (!webTabIdIsValid(data.tabId)) {
            return { ok: false, reason: "validation", message: "handleGroupMutation: refusing malformed tabId" };
          }
          return { ok: true, kind, where: PowerBrowserAPI.webTabNavigate(data.tabId, data.url) };
        }
        case "webTabClose": {
          if (!webTabIdIsValid(data.tabId)) {
            return { ok: false, reason: "validation", message: "handleGroupMutation: refusing malformed tabId" };
          }
          return { ok: true, kind, where: PowerBrowserAPI.webTabClose(data.tabId) };
        }
        case "webTabBack": {
          if (!webTabIdIsValid(data.tabId)) {
            return { ok: false, reason: "validation", message: "handleGroupMutation: refusing malformed tabId" };
          }
          return { ok: true, kind, where: PowerBrowserAPI.webTabBack(data.tabId) };
        }
        case "webTabForward": {
          if (!webTabIdIsValid(data.tabId)) {
            return { ok: false, reason: "validation", message: "handleGroupMutation: refusing malformed tabId" };
          }
          return { ok: true, kind, where: PowerBrowserAPI.webTabForward(data.tabId) };
        }
        case "webTabReload": {
          if (!webTabIdIsValid(data.tabId)) {
            return { ok: false, reason: "validation", message: "handleGroupMutation: refusing malformed tabId" };
          }
          return { ok: true, kind, where: PowerBrowserAPI.webTabReload(data.tabId, data.bypassCache === true) };
        }
        case "webTabFocus": {
          if (!webTabIdIsValid(data.tabId)) {
            return { ok: false, reason: "validation", message: "handleGroupMutation: refusing malformed tabId" };
          }
          return { ok: true, kind, where: PowerBrowserAPI.webTabFocus(data.tabId) };
        }
        // GUI-01: a side-effect-free liveness answer, so the frontend can know
        // BEFORE a click whether this channel is available.
        //
        // It exists because the obvious alternative does not work. The original
        // design decided per click, by having the actor child cancel the
        // request event and reading `dispatchEvent`'s return value. Measured
        // live against the built binary, twice and by two independent routes,
        // the content-side dispatch still returns true with
        // `defaultPrevented` false even when chrome has received and acted on
        // the message -- so the caller concluded "chrome declined", ran its
        // window.open fallback, and the user got TWO windows for one click.
        // Awaiting the ack instead is not available either: window.open needs
        // the user activation of the click, and an await spends it, so a
        // fallback decided after a round trip is one the popup blocker eats.
        //
        // Answering liveness once, off the click path, removes the ambiguity
        // entirely: a click either uses the channel or opens a window, never
        // both. Writes no row and touches no window.
        case "probeChannel": {
          return { ok: true, kind };
        }
        // Custom title bar (2026-09-10): the shell window draws no OS title
        // bar (powerbrowser.xhtml `customtitlebar`), so the frontend asks how
        // wide chrome's window buttons are and reports which rects of its
        // top row are empty; powerbrowser.js lays drag handles there, since
        // window dragging is chrome-only in Gecko. Both act on the window of
        // the frame that sent the message, so nothing else can be moved.
        case "windowChrome": {
          const win = actorRef.browsingContext.top.embedderElement.ownerDocument.defaultView;
          return { ok: true, kind, width: win.powerbrowserWindowChrome().width };
        }
        case "windowDragRegions": {
          const rects = Array.isArray(data.rects) ? data.rects : null;
          const finite = r => r && [r.x, r.y, r.w, r.h].every(Number.isFinite);
          if (!rects || !rects.every(finite) || !Number.isFinite(data.height)) {
            return { ok: false, reason: "validation", message: "handleGroupMutation: refusing malformed drag regions" };
          }
          const win = actorRef.browsingContext.top.embedderElement.ownerDocument.defaultView;
          win.powerbrowserSetDragRegions(rects.map(({ x, y, w, h }) => ({ x, y, w, h })), data.height);
          return { ok: true, kind };
        }
        default: {
          return { ok: false, reason: "validation", message: `handleGroupMutation: unknown kind ${String(kind)}` };
        }
      }
    } catch (err) {
      const message = err && err.message ? err.message : String(err);
      const reason = /refusing|unknown/.test(message) ? "validation" : "store";
      // M4: the log and a store reply carry a fixed text, never the raw error
      // or a tab key; a refusal's text is this file's own and echoes only what
      // the sender sent.
      PowerBrowserAPI.log("warn", `[handleGroupMutation] ${String(kind)} failed (${reason}, ${PowerBrowserAPI.tabStoreFailureClass(err)})`);
      return { ok: false, reason, message: reason === "validation" ? message : "handleGroupMutation: the tab store write failed" };
    }
  },

  /**
   * SQL-04 (12-02): history point read via the History fetch API keyed by
   * URL. Never-throw read convention: resolves null when the page is
   * unknown or Places is unreachable. Platform API only -- no raw places
   * file access, and the projected fields carry no credential or secret.
   */
  async readHistoryEntry(url) {
    try {
      const info = await lazy.PlacesUtils.history.fetch(url);
      if (!info) {
        return null;
      }
      return {
        url: info.url ?? url,
        title: info.title ?? "",
      };
    } catch {
      return null;
    }
  },

  /**
   * SQL-04 (12-02): bookmark point read via the Bookmarks fetch API keyed
   * by URL. The fetch resolves an object, an array, or null; the first
   * item wins. Never throws: resolves null on any failure.
   */
  async readBookmarkByUrl(url) {
    try {
      const found = await lazy.PlacesUtils.bookmarks.fetch({ url });
      const item = Array.isArray(found) ? found[0] : found;
      if (!item) {
        return null;
      }
      return {
        guid: item.guid ?? "",
        title: item.title ?? "",
        url: item.url ?? url, folder: bookmarkFolderName(item.parentGuid),
      };
    } catch {
      return null;
    }
  },

  /**
   * SQL-04 (12-02): bookmark folder listing via getFolderContents.
   * Enumerates the open result root's children into guid/title/url rows
   * and always closes the container again. Never throws: resolves [] on
   * any failure.
   */
  listBookmarkFolder(folderGuid) {
    try {
      const root = lazy.PlacesUtils.getFolderContents(folderGuid, false, false).root;
      // WR-01 (12-CODE-REVIEW.md): a closed container exposes no children
      // (upstream opens it first: PlacesUtils.sys.mjs:1390) -- without this
      // the listing silently resolves [].
      root.containerOpen = true;
      const rows = [];
      try {
        const count = root.childCount;
        for (let i = 0; i < count; i++) {
          const node = root.getChild(i);
          rows.push({
            guid: node.bookmarkGuid ?? "",
            title: node.title ?? "",
            url: node.uri ?? "",
          });
        }
      } finally {
        root.containerOpen = false;
      }
      return rows;
    } catch {
      return [];
    }
  },

  /**
   * SQL-04 (12-02): sessionstore read projection for consumers. Delegates
   * to the 12-01 parser -- the single JSON-string parse -- so the rebuild
   * source, the sweep input, and this read surface can never disagree on
   * shape. Tab address/title fields only, never credentials.
   */
  projectSessionStoreTabs() {
    return PowerBrowserAPI.parseSessionStoreTabRows();
  },

  /**
   * NG-005: deletes closed-tab history older than the cutoff. A row with
   * closed_at NULL is never deleted, whatever its age: an open tab's row
   * survives however long the tab stays open.
   */
  async pruneClosedTabRows(closedBefore) {
    const conn = await PowerBrowserAPI.openTabStore();
    await conn.execute("DELETE FROM tabs WHERE closed_at IS NOT NULL AND closed_at < :cutoff", { cutoff: closedBefore });
  },

  /**
   * SQL-01 (12-01): the integrity tripwire -- PRAGMA quick_check at startup,
   * the full PRAGMA integrity_check on the schedule (`full`, NG-018). Keying
   * is exact: the result must be a single row with the value 'ok' and nothing
   * else. Answers "ok", "corrupt" for any other result, or the class of the
   * failure when the open or the check throws (tabStoreFailureClass), so an
   * unopenable file is "corrupt" only on a real corruption signal (ruling
   * T6-R1). Never throws.
   */
  async checkTabStoreIntegrity(full = false) {
    try {
      const conn = await PowerBrowserAPI.openTabStore();
      const rows = await conn.execute(full ? "PRAGMA integrity_check" : "PRAGMA quick_check");
      return rows.length === 1 && rows[0].getString(0) === "ok" ? "ok" : "corrupt";
    } catch (err) {
      return PowerBrowserAPI.tabStoreFailureClass(err);
    }
  },

  /**
   * NG-013/NG-018 (ruling T6-R1): a fixed class for a tab-store failure, safe
   * to log -- never the raw message, which can carry the profile path.
   * "corrupt" is SQLITE_CORRUPT or SQLITE_NOTADB: SQLite's own text for them,
   * which a failed statement's message carries, or NS_ERROR_FILE_CORRUPTED,
   * which Sqlite.sys.mjs reports for a failed statement and a failed open
   * alike; only it quarantines. A store newer than this build ("newer",
   * MIGRATIONS.md rule 4), SQLITE_BUSY or SQLITE_LOCKED ("busy"), a timeout or
   * any other failure ("other") never does.
   */
  tabStoreFailureClass(err) {
    const message = String(err && err.message);
    if (/refusing downgrade/.test(message)) {
      return "newer";
    }
    const result = err && err.result;
    if (result === undefined) {
      // A-T6-m1: SQLite's text only when there is no result code (the offline fake).
      return /database disk image is malformed|file is not a database/.test(message) ? "corrupt" : "other";
    }
    if (result === Cr.NS_ERROR_FILE_CORRUPTED) {
      return "corrupt";
    }
    if (result === Cr.NS_ERROR_STORAGE_BUSY || result === Cr.NS_ERROR_FILE_IS_LOCKED) {
      return "busy";
    }
    return "other";
  },

  /**
   * SQL-01 (12-01): shapes the quarantine rebuild source from the restore
   * authority. SessionStore.getBrowserState returns a JSON STRING, so this
   * parses it; each open entry becomes a row keyed by the tab's own key
   * (NG-001, stockTabKey's custom value). Never throws -- a missing or
   * malformed state rebuilds zero rows rather than crashing startup.
   */
  parseSessionStoreTabRows() {
    try {
      const state = JSON.parse(lazy.SessionStore.getBrowserState());
      const now = Date.now();
      const rows = [];
      for (const win of state.windows ?? []) {
        // CR-01 (12-CODE-REVIEW.md): getBrowserState includes private
        // windows (upstream filters them only on save/close paths, never in
        // getCurrentState), so the store-side skip lives here -- the single
        // parse every consumer (sweep, quarantine rebuild, read projection)
        // routes through. No private-marker column exists to filter on later.
        if (win.isPrivate) {
          continue;
        }
        for (const tab of win.tabs ?? []) {
          const entry = tab.entries?.[tab.index - 1];
          // NG-001: the key travels with the tab as its custom value; a tab
          // the store has not keyed yet gets its key from the triggers.
          const uri = tab.extData?.[STOCK_TAB_KEY_VALUE];
          if (!entry || !entry.url || !uri) {
            continue;
          }
          rows.push({
            uri,
            url: entry.url,
            title: entry.title ?? "",
            last_active: now,
            last_accessed: Number.isFinite(tab.lastAccessed) ? tab.lastAccessed : null,
          });
        }
      }
      return rows;
    } catch {
      return [];
    }
  },

  /**
   * NG-010: sessionstore's recently closed tabs (each non-private window's
   * _closedTabs) as closed-history rows. A tab the store keyed keeps its key
   * (the custom tab value travels with the closed entry); one it never saw is
   * keyed from when it closed and its address, so the same entry projects to
   * the same row on every sweep. Never throws.
   */
  parseSessionStoreClosedRows() {
    try {
      const state = JSON.parse(lazy.SessionStore.getBrowserState());
      const rows = [];
      for (const win of state.windows ?? []) {
        if (win.isPrivate) {
          continue;
        }
        for (const closed of win._closedTabs ?? []) {
          const tab = closed.state ?? {};
          const entry = tab.entries?.[(tab.index ?? tab.entries?.length ?? 1) - 1];
          if (!entry || !entry.url || !Number.isFinite(closed.closedAt)) {
            continue;
          }
          const uri = tab.extData?.[STOCK_TAB_KEY_VALUE] || `stock:closed-${closed.closedAt.toString(36)}-${stringHash(entry.url)}`;
          rows.push({ uri, url: entry.url, title: entry.title ?? closed.title ?? "", last_active: closed.closedAt, closed_at: closed.closedAt });
        }
      }
      return rows;
    } catch {
      return [];
    }
  },

  /**
   * SQL-01 (12-01): quarantine, not delete. Copies the tripped file to the
   * next free corrupt-suffixed name (N = max existing suffix + 1, starting at
   * 1 -- never reuse a suffix) via backup() (or a byte copy), removes dependent sidecar
   * state (-wal, -shm, -journal), then rebuilds the live rows FROM the
   * sessionstore restore authority inside exactly one transaction. The corrupt
   * copy is never deleted. Continues degraded with the rebuilt file.
   */
  async quarantineAndRebuildTabStore(restoreRows) {
    // I2: the quarantine holds the store's one opener for its whole run, so no
    // open lands on the file it replaces and no writer uses the connection it closes.
    return holdTabStore(async () => {
      const profileDir = PowerBrowserAPI.getProfileDir();
      // IN-03 (12-CODE-REVIEW.md): getProfileDir resolves "" on any failure,
      // which would anchor forensics at the filesystem root. Refuse before
      // touching anything so the caller degrades cleanly.
      if (!profileDir) {
        throw new Error("quarantineAndRebuildTabStore: unknown profile dir");
      }
      const livePath = `${profileDir}/${TAB_STORE_FILE_NAME}`;
      let next = 0;
      try {
        const children = await IOUtils.getChildren(profileDir);
        for (const child of children) {
          const base = child.slice(child.lastIndexOf("/") + 1);
          const match = /^tabs\.sqlite\.corrupt-(\d+)$/.exec(base);
          if (match) {
            next = Math.max(next, Number(match[1]));
          }
        }
      } catch {
        next = 0;
      }
      const corruptPath = `${livePath}.corrupt-${next + 1}`;
      // Quarantine-not-delete invariant: the live file is removed only after
      // forensics land at corruptPath. NG-013/NG-014: backup() (OpenedConnection,
      // Sqlite.sys.mjs:2215) needs an open connection and pages it can read;
      // failing either, the bytes are copied.
      try {
        if (!tabStoreConn) {
          throw new Error("no open connection");
        }
        await tabStoreConn.backup(corruptPath);
      } catch {
        try {
          await IOUtils.copy(livePath, corruptPath);
        } catch (err) {
          throw new Error(`quarantineAndRebuildTabStore: forensics copy failed: ${err && err.message ? err.message : err}`);
        }
      }
      if (tabStoreConn) {
        try {
          await tabStoreConn.close();
        } catch {
          // Close is best-effort; the rebuild below reopens.
        }
      }
      tabStoreConn = null;
      for (const suffix of ["-wal", "-shm", "-journal"]) {
        try {
          await IOUtils.remove(`${livePath}${suffix}`, { ignoreAbsent: true });
        } catch {
          // Sidecar removal is best-effort; a missing sidecar is the goal.
        }
      }
      // CR-03 (12-CODE-REVIEW.md): the backup above preserved forensics at
      // corruptPath, so the tripped live file is removed BEFORE reopening --
      // reopening it would run the migration's tableExists/indexExists
      // pre-checks against a corrupt-but-readable file (no-op success stamping
      // the version) and land live rows in the tripped file. This matches the
      // roundtrip proof's delete-then-rebuild procedure. Removal is
      // load-bearing, never best-effort: a failure throws into degraded.
      await IOUtils.remove(livePath);
      // NG-085 (ruling T6-R1): like openTabStore, nothing reopens the store once
      // its shutdown close has begun; the next launch rebuilds it.
      if (tabStoreClosing) {
        throw new Error("quarantineAndRebuildTabStore: the store is closed for shutdown");
      }
      // 14.1-03 / NG-014: not exclusive, like openTabStore -- an exclusive
      // rebuilt connection served the backend reader SQLITE_BUSY until restart.
      closeTabStoreAtShutdown();
      const conn = await lazy.Sqlite.openConnection({ openNotExclusive: true, path: TAB_STORE_FILE_NAME });
      try {
        refuseIfTabStoreClosing("quarantineAndRebuildTabStore");
        await conn.execute("PRAGMA journal_mode=WAL;");
        // CR-02: the migration runs as its own top-level transactions, the row
        // inserts in a second one -- sequential, never nested. NG-014: the whole
        // chain to the head, so the rebuilt store is what every reader expects.
        // Group rows rebuild EMPTY and restored tabs land ungrouped (15-RESEARCH A3);
        // the corrupt copy stays the only record of lost membership.
        await PowerBrowserAPI.migrateTabStoreToHead(conn);
        await conn.executeTransaction(async () => {
          for (const row of restoreRows) {
            await conn.execute(
              `INSERT INTO tabs (uri, url, title, last_active, created_at, closed_at) VALUES (:uri, :url, :title, :last_active, :last_active, :closed_at)
               ON CONFLICT (uri) DO UPDATE SET url=excluded.url, title=excluded.title, last_active=excluded.last_active, closed_at=excluded.closed_at`,
              { uri: row.uri, url: row.url, title: row.title, last_active: row.last_active, closed_at: row.closed_at ?? null }
            );
          }
        });
        refuseIfTabStoreClosing("quarantineAndRebuildTabStore");
      } catch (err) {
        // NG-085: a connection nobody holds would block the shutdown barrier.
        await conn.close().catch(() => undefined);
        throw err;
      }
      tabStoreConn = conn;
      return corruptPath;
    });
  },

  /**
   * NG-011/NG-018: one row of the settings table, or null when it is absent,
   * blank or the store is unreadable. Never throws: every caller has a default.
   */
  async readTabStoreSetting(key) {
    try {
      const conn = await PowerBrowserAPI.openTabStore();
      const rows = await conn.execute("SELECT value FROM settings WHERE key = :key", { key });
      const value = rows.length ? rows[0].getString(0) : null;
      return value === null || value.trim() === "" ? null : value;
    } catch {
      return null;
    }
  },

  /**
   * NG-018: the full PRAGMA integrity_check SCHEMA.md:200-201 schedules beside
   * the startup quick_check, which skips index contents. Corruption
   * quarantines and rebuilds from sessionstore, exactly as the startup
   * tripwire does; nothing else does (ruling T6-R1). A store newer than this
   * build stays degraded (F3, MIGRATIONS.md rule 4); a busy store, a timeout
   * or any other failure is logged and retried at the next interval. Once the
   * store is closing for shutdown it opens nothing (NG-085). Resolves true
   * when the store is sound. Never throws.
   */
  async runScheduledIntegrityCheck() {
    if (tabStoreClosing) {
      return false;
    }
    const verdict = await PowerBrowserAPI.checkTabStoreIntegrity(true);
    if (verdict === "ok") {
      return true;
    }
    if (verdict === "newer") {
      PowerBrowserAPI.log("warn", "[tab-store-integrity] the store is newer than this build; left degraded, not quarantined");
    } else if (verdict !== "corrupt") {
      PowerBrowserAPI.log("warn", `[tab-store-integrity] integrity_check not run (${verdict}); not quarantined, retried at the next interval`);
    } else {
      PowerBrowserAPI.log("error", "[tab-store-integrity] integrity_check reported corruption; quarantining");
      try {
        await PowerBrowserAPI.quarantineAndRebuildTabStore([...PowerBrowserAPI.parseSessionStoreClosedRows(), ...PowerBrowserAPI.parseSessionStoreTabRows()]);
      } catch (err) {
        PowerBrowserAPI.log("error", `[tab-store-integrity] rebuild failed (${PowerBrowserAPI.tabStoreFailureClass(err)})`);
      }
    }
    return false;
  },

  /**
   * SQL-01 (12-01): startup orchestration. Opens the store (running the
   * version guard), fires the tripwire, and on corruption quarantines and
   * rebuilds from sessionstore before continuing degraded. An unopenable
   * file is quarantined like a tripped one when SQLite reports it corrupt
   * (NG-013); a store newer than this build is refused and left untouched
   * (MIGRATIONS.md rule 4), and a busy or otherwise failed open is never
   * quarantined (ruling T6-R1). Resolves 'ready' | 'rebuilt' | 'degraded'
   * -- never throws, so startup never stalls on the store.
   */
  async ensureTabStore() {
    // WR-05 (12-CODE-REVIEW.md): the tripwire and its failure classes live in
    // checkTabStoreIntegrity, shared with the scheduled check.
    const verdict = await PowerBrowserAPI.checkTabStoreIntegrity();
    if (verdict === "newer") {
      PowerBrowserAPI.log("warn", "[ensureTabStore] the store is newer than this build; left untouched");
      return "degraded";
    }
    if (verdict !== "ok" && verdict !== "corrupt") {
      PowerBrowserAPI.log("error", `[ensureTabStore] open failed (${verdict}); not quarantined`);
      return "degraded";
    }
    let state = "ready";
    if (verdict === "corrupt") {
      try {
        await PowerBrowserAPI.quarantineAndRebuildTabStore([...PowerBrowserAPI.parseSessionStoreClosedRows(), ...PowerBrowserAPI.parseSessionStoreTabRows()]);
        state = "rebuilt";
      } catch (err) {
        PowerBrowserAPI.log("error", `[ensureTabStore] rebuild failed (${PowerBrowserAPI.tabStoreFailureClass(err)})`);
        return "degraded";
      }
    }
    await PowerBrowserAPI.closeEndedWebRows().catch(err => {
      PowerBrowserAPI.log("error", `[ensureTabStore] closing ended web rows failed (${PowerBrowserAPI.tabStoreFailureClass(err)})`);
    });
    return state;
  },

  /**
   * SQL-01 (12-01): bounded reconciliation sweep. Diffs the sessionstore
   * browser state against store rows: upserts the open stock tabs' rows
   * (capped at TAB_STORE_SWEEP_MAX_WRITES per run), closes stock rows
   * sessionstore no longer lists (NG-005; only once its restore has run, F4),
   * and prunes closed rows older than the retention. This sweep is also what
   * makes the roundtrip gate deterministic. Loud errors propagate to the caller.
   */
  async sweepTabStoreFromSessionStore() {
    // Closed first, open last: one snapshot never lists a tab as both, and
    // the open writes win for anything reopened since.
    // NG-010/NG-011: retention is the setting closed_retention_days; F11: a
    // close older than the window is never inserted, so the sweep never
    // churns insert-then-prune on the same row.
    // I1: an absent or blank value is NaN, so the default applies (Number(null) is 0: keep nothing).
    const days = Number((await PowerBrowserAPI.readTabStoreSetting("closed_retention_days")) ?? NaN);
    const retentionMs = Number.isFinite(days) && days >= 0 ? days * 24 * 60 * 60 * 1000 : TAB_STORE_CLOSED_RETENTION_MS;
    const cutoff = Date.now() - retentionMs;
    for (const row of PowerBrowserAPI.parseSessionStoreClosedRows().slice(0, TAB_STORE_SWEEP_MAX_WRITES)) {
      if (row.closed_at < cutoff) {
        continue;
      }
      await PowerBrowserAPI.writeClosedTabRow({ uri: row.uri, url: row.url, title: row.title, closedAt: row.closed_at });
    }
    const live = PowerBrowserAPI.parseSessionStoreTabRows();
    // NG-005 / NG-023 (wave B d8f270d): the open set is every keyed stock tab
    // sessionstore lists, even before it has collected the tab's history.
    const liveUris = sessionStoreStockKeys();
    for (const row of live.slice(0, TAB_STORE_SWEEP_MAX_WRITES)) {
      await PowerBrowserAPI.writeTabRow({
        uri: row.uri,
        url: row.url,
        title: row.title,
        lastActive: row.last_active,
        lastAccessed: row.last_accessed ?? undefined,
      });
    }
    if (stockRestoreDone) {
      await PowerBrowserAPI.closeAbsentStockRows(liveUris);
    }
    await PowerBrowserAPI.pruneClosedTabRows(cutoff);
  },

  /**
   * SQL-01 (12-01): live triggers, chrome-observable only. Attaches the
   * TabOpen, TabClose, TabSelect, and TabAttrModified family on every stock
   * browser window's tab container (enumerated via the window service; the
   * shell window carries no tab browser, so it never matches), each calling
   * the write or close wrapper keyed by the tab's own key (stockTabKey),
   * plus a sessionstore-state-write-complete observer running the bounded
   * reconciliation sweep, and the scheduled full integrity check (NG-018).
   * No Theia-to-chrome channel is created and no actor
   * is registered. Returns a stop function removing every listener and
   * observer added here.
   */
  startTabStoreTriggers() {
    const TAB_STORE_EVENTS = ["TabOpen", "TabClose", "TabSelect", "TabAttrModified"];
    const attached = [];
    // F4: until sessionstore has restored its windows, a stock tab it is about
    // to restore is absent from its state, so the sweep must not close its row.
    lazy.SessionStore.promiseAllWindowsRestored.then(() => {
      stockRestoreDone = true;
    }).catch(err => {
      PowerBrowserAPI.log("error", `[tab-store-trigger] restore wait failed: ${err && err.message ? err.message : err}`);
    });
    const onTabEvent = event => {
      try {
        const tab = event.target;
        const browser = tab && tab.linkedBrowser;
        const spec = browser && browser.currentURI && browser.currentURI.spec;
        const chromeWin = tab && tab.ownerDocument && tab.ownerDocument.defaultView;
        // Private tabs get no key and no row (the writer re-checks before its upsert).
        if (!spec || (chromeWin && lazy.PrivateBrowsingUtils.isWindowPrivate(chromeWin))) {
          return;
        }
        // A tab moved between windows closes its old element (TabClose detail
        // adoptedBy) and opens a new one (TabOpen detail adoptedTab): the row
        // moves with the key, and neither half is a close.
        const detail = event.detail || {};
        const uri = PowerBrowserAPI.stockTabKey(tab, event.type === "TabOpen" ? detail.adoptedTab : null);
        if (event.type === "TabClose" && detail.adoptedBy) {
          return;
        }
        if (event.type === "TabClose") {
          // Last view is final -- capture on settle, never synchronously.
          PowerBrowserAPI.scheduleSettleCapture(uri, chromeWin);
          PowerBrowserAPI.closeTabRow(uri).catch(err => {
            PowerBrowserAPI.log("error", `[tab-store-trigger] close failed (${PowerBrowserAPI.tabStoreFailureClass(err)})`);
          });
          return;
        }
        if (event.type === "TabSelect" && chromeWin) {
          // The tab being LEFT keeps its final view; the newly selected tab
          // has just arrived and must not capture yet.
          try {
            const prev = lastSelectedTabByWin.get(chromeWin);
            if (prev && prev.uri !== uri) {
              PowerBrowserAPI.scheduleSettleCapture(prev.uri, chromeWin);
            }
            lastSelectedTabByWin.set(chromeWin, { uri, tab });
          } catch {
            // Selection tracking is best-effort; the write below still runs.
          }
        }
        PowerBrowserAPI.writeTabRow({
          uri,
          url: spec,
          title: (tab && tab.label) || "",
          lastAccessed: event.type === "TabSelect" ? Date.now() : undefined,
          chromeWin,
        }).catch(err => {
          PowerBrowserAPI.log("error", `[tab-store-trigger] write failed (${PowerBrowserAPI.tabStoreFailureClass(err)})`);
        });
      } catch (err) {
        PowerBrowserAPI.log("error", `[tab-store-trigger] tab event failed (${PowerBrowserAPI.tabStoreFailureClass(err)})`);
      }
    };
    const stockWindows = Services.wm.getEnumerator("navigator:browser");
    const attachToWindow = win => {
      // CR-04 follow-up: windows opened after this enumeration (the common
      // case -- startup runs before later windows exist) arrive via the
      // delayed-startup observer below and share this one attach path, so
      // the TabClose removal half can never silently cover only the windows
      // that happened to exist at startup while the sweep's 7-day retention
      // prune leaves their closed rows stale for a week.
      const container = win.gBrowser && win.gBrowser.tabContainer;
      if (!container) {
        return;
      }
      for (const name of TAB_STORE_EVENTS) {
        container.addEventListener(name, onTabEvent);
        attached.push([container, name]);
      }
      // NG-001: tabs already in the window (a new window's first tab, a
      // restored session) may have no event left to fire, and the sweep only
      // carries keyed tabs, so each is keyed and written here.
      for (const tab of win.gBrowser.tabs) {
        onTabEvent({ type: "TabAttrModified", target: tab });
      }
    };
    while (stockWindows.hasMoreElements()) {
      attachToWindow(stockWindows.getNext());
    }
    // Pinned upstream (browser/base/content/browser-init.js:792): each
    // stock window fires browser-delayed-startup-finished with itself as
    // the subject once delayed startup completes.
    const windowObserver = {
      observe: subject => {
        try {
          attachToWindow(subject);
        } catch (err) {
          PowerBrowserAPI.log("error", `[tab-store-trigger] late-window attach failed: ${err && err.message ? err.message : err}`);
        }
      },
    };
    Services.obs.addObserver(windowObserver, "browser-delayed-startup-finished");
    const sweepObserver = {
      observe: () => {
        PowerBrowserAPI.sweepTabStoreFromSessionStore().catch(err => {
          PowerBrowserAPI.log("error", `[tab-store-sweep] sweep failed (${PowerBrowserAPI.tabStoreFailureClass(err)})`);
        });
      },
    };
    Services.obs.addObserver(sweepObserver, "sessionstore-state-write-complete");
    // NG-018: the scheduled full integrity check. The interval is the setting
    // integrity_check_minutes (24 hours when absent), read before each wait so
    // a changed setting applies from the next run. The stop function ends it
    // and cancels the pending wait; the store's shutdown close ends it too
    // (NG-085, ruling T6-R1), so no timer stays armed for a store that is gone.
    let integrityOff = false;
    let cancelIntegrityWait = null;
    (async () => {
      while (!integrityOff) {
        const minutes = Number((await PowerBrowserAPI.readTabStoreSetting("integrity_check_minutes")) ?? NaN);
        if (integrityOff || tabStoreClosing) {
          break;
        }
        // Held in pendingTimers until it fires or is cancelled, like sleep()'s.
        await new Promise(resolve => {
          const timer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
          const done = () => {
            pendingTimers.delete(timer);
            cancelIntegrityWait = null;
            resolve();
          };
          cancelIntegrityWait = () => {
            timer.cancel();
            done();
          };
          pendingTimers.add(timer);
          const ms = Number.isFinite(minutes) && minutes > 0 ? minutes * 60 * 1000 : TAB_STORE_INTEGRITY_DEFAULT_MS;
          timer.initWithCallback({ notify: done }, ms, Ci.nsITimer.TYPE_ONE_SHOT);
        });
        if (!integrityOff) {
          await PowerBrowserAPI.runScheduledIntegrityCheck();
        }
      }
    })().catch(err => {
      PowerBrowserAPI.log("error", `[tab-store-integrity] schedule ended (${PowerBrowserAPI.tabStoreFailureClass(err)})`);
    });
    return () => {
      integrityOff = true;
      if (cancelIntegrityWait) {
        cancelIntegrityWait();
      }
      for (const [container, name] of attached) {
        try {
          container.removeEventListener(name, onTabEvent);
        } catch {
          // Listener removal is best-effort on teardown.
        }
      }
      try {
        Services.obs.removeObserver(sweepObserver, "sessionstore-state-write-complete");
      } catch {
        // Observer removal is best-effort on teardown.
      }
      try {
        Services.obs.removeObserver(windowObserver, "browser-delayed-startup-finished");
      } catch {
        // Observer removal is best-effort on teardown.
      }
    };
  },

  /**
   * GUI-02 (14.1-01): the web-tab host. One chrome-owned <xul:browser>
   * overlay per in-shell web tab, positioned over the Theia placeholder
   * widget whose geometry the frontend publishes, in the SAME shell window
   * the Theia frame lives in. The overlay is built exactly as tabbrowser.js
   * builds every tab (upstream/browser/components/tabbrowser/content/
   * tabbrowser.js:2739-2767) minus the browser.xhtml-only hooks, and every
   * attribute is set BEFORE the element is appended because the frameloader
   * is constructed in connectedCallback (browser-custom-element.mjs:397-406).
   *
   * Scheme wall FIRST, mirroring openStockTab: http/https and the single
   * literal empty page, refused before any element exists. The load itself
   * goes through fixupAndLoadURIString with a NULL principal, never the
   * Theia swap's system-principal loader above (a system-principal load of
   * a caller-chosen URL is a file:/chrome: reach; the plan's acceptance grep
   * proves that name absent from this host). Idempotent on tabId: a second
   * open for a tab this host already
   * holds returns "already-open" and creates no second overlay.
   *
   * Returns one of "opened" | "already-open" | "refused-scheme" | "loading" |
   * "unknown-tab"; handleGroupMutation echoes it as `where`.
   */
  webTabOpen(theiaBrowser, actorRef, tabId, url, key) {
    const spec = typeof url === "string" && url ? url : "about:blank";
    if (spec !== "about:blank" && !/^https?:\/\//i.test(spec)) {
      return "refused-scheme";
    }
    if (webTabs.has(tabId)) {
      return "already-open";
    }
    const doc = theiaBrowser.ownerDocument;
    const win = doc.defaultView;
    const browser = doc.createXULElement("browser");
    // remote + remoteType="web": a content-process docshell (E10SUtils
    // DEFAULT_REMOTE_TYPE). maychangeremoteness: without it every cross-site
    // navigation's process switch is refused outright
    // (DocumentLoadListener.cpp:1860-1867 "toplevel switch disabled by
    // <browser>"), and under Fission the first https:// load is one.
    // manualactiveness: activeness then follows docShellIsActive below
    // rather than the shell window (BrowsingContext.cpp:821-830), which is
    // what lets a hidden tab stop painting and stop running foreground
    // timers. No primary (that is the Theia frame), no contextmenu/tooltip/
    // autocompletepopup (they name browser.xhtml elements this shell lacks),
    // and no src (the load is the null-principal call below).
    for (const [name, value] of Object.entries({
      type: "content",
      remote: "true",
      remoteType: "web",
      maychangeremoteness: "true",
      manualactiveness: "true",
      messagemanagergroup: "browsers",
      tabindex: "-1",
    })) {
      browser.setAttribute(name, value);
    }
    browser.permanentKey = PowerBrowserAPI.createPermanentKey();
    // CSSOM writes, never a style attribute: the shell's CSP drops an inline
    // style ATTRIBUTE silently (powerbrowser.css header), while property
    // writes are what powerbrowser.js already uses to toggle the deck.
    // z-index 1 puts the overlay above the content frame (0) and below the
    // error (2) and diagnostics (3) layers, so a malformed rect can never
    // bury the recovery affordances. It TIES the loading layer at 1 and wins
    // that tie by DOM order: appendChild places the overlay after the static
    // loading layer, and later siblings paint on top at equal z-index.
    Object.assign(browser.style, {
      position: "fixed",
      left: "0px",
      top: "0px",
      width: "0px",
      height: "0px",
      zIndex: "1",
      visibility: "hidden",
      border: "none",
    });
    doc.body.appendChild(browser);
    browser.docShellIsActive = false;
    // WebDriver reaches the overlay through gBrowser.webDriverTabs (the 050
    // TabManager hunk); extensions see it as a tab node (tabHostAddTab below).
    // NG-001: the row key is the tab's identity -- the key the frontend sent
    // (a reopened card's row) or web:<tabId> -- never the page URL.
    // NG-034: that value is also the web-tab history key (saveWebTabHistories).
    const entry = { browser, uri: key || `web:${tabId}`, listener: null, titleListener: null, owner: actorRef, rowKey: key || `web:${tabId}` };
    // NG-004: the row exists from the moment the tab does, a New Tab on the
    // empty page included, so every Panorama mutation has a row to act on.
    PowerBrowserAPI.writeTabRow({ uri: entry.uri, url: spec === "about:blank" ? "" : spec, title: "", chromeWin: win }).catch(err => {
      PowerBrowserAPI.log("error", `[web-tab] writeTabRow failed for ${entry.uri}: ${err && err.message ? err.message : err}`);
    });
    // The progress listener: every navigation inside the overlay reaches
    // the pill, the strip and the store from here. It must QI to
    // nsISupportsWeakReference as well (the parent-side web progress holds
    // listeners weakly, BrowsingContextWebProgress.cpp:49-51), and it is
    // held strongly on the entry for the reason the map's comment gives.
    // Store rows (SC4): keyed by tab identity (docs/TAB-STORE.md), one row
    // per tab; http(s) top-level non-same-document location changes update
    // it in place -- a hash change is not a new page, and the empty page's
    // row was written at open with url ''.
    entry.listener = {
      QueryInterface: ChromeUtils.generateQI(["nsIWebProgressListener", "nsISupportsWeakReference"]),
      onLocationChange(webProgress, request, location, flags) {
        if (!webProgress.isTopLevel) {
          return;
        }
        const locationSpec = location.spec;
        const sameDocument = !!(flags & Ci.nsIWebProgressListener.LOCATION_CHANGE_SAME_DOCUMENT);
        // Phase 31 (D-31-01/D-31-02): a top-level, non-same-document location
        // change resets the stashed shield count with the identity, so the
        // next push -- in the same frame as the new url -- never shows the
        // old page's. A hash change or pushState keeps the page's count.
        if (!sameDocument) {
          entry.blockedTrackers = 0;
        }
        // Page tools (32-01): a new page starts with no find state; the same navigation's push carries the reset.
        if (!sameDocument) resetWebTabPage(browser);
        if (!sameDocument && /^https?:\/\//i.test(locationSpec)) {
          // NG-002: a navigation updates this tab's row in place -- group, x/y,
          // ord and thumbnail stay.
          PowerBrowserAPI.writeTabRow({ uri: entry.uri, url: locationSpec, title: browser.contentTitle, chromeWin: win }).catch(err => {
            PowerBrowserAPI.log("error", `[web-tab] writeTabRow failed for ${entry.uri}: ${err && err.message ? err.message : err}`);
          });
        }
        scheduleWebTabState(theiaBrowser, tabId, browser, browser.webProgress.isLoadingDocument, true);
      },
      onStateChange(webProgress, request, stateFlags) {
        if (!webProgress.isTopLevel || !(stateFlags & Ci.nsIWebProgressListener.STATE_IS_NETWORK)) {
          return;
        }
        const starting = !!(stateFlags & Ci.nsIWebProgressListener.STATE_START);
        // GUI-08 (14.1.1-02): the overlay's own capture schedule. On the
        // network STOP transition the page has finished loading, so a
        // snapshot taken after the settle window shows the page rather than a
        // blank frame. Coalesced per URI by scheduleSettleCapture, private
        // windows skipped there and again at capture time, never throws --
        // so this cannot break the progress hot path.
        if (!starting && (stateFlags & Ci.nsIWebProgressListener.STATE_STOP) && /^https?:\/\//i.test(browser.currentURI.spec)) {
          PowerBrowserAPI.scheduleSettleCapture(entry.uri, win);
        }
        scheduleWebTabState(theiaBrowser, tabId, browser, starting, !starting);
      },
      // Phase 31 (SITE-01, D-31-02): a connection change recomputes the
      // pushed enum on the next animation frame, through the same push as
      // url/title. Signature mirrors browser.js:2529
      // (aWebProgress, aRequest, aState).
      onSecurityChange(webProgress, _request, _state) {
        if (!webProgress.isTopLevel) {
          return;
        }
        scheduleWebTabState(theiaBrowser, tabId, browser, browser.webProgress.isLoadingDocument);
      },
      // Phase 31 (D-31-02): a content-blocking event stashes the count and
      // recomputes the push. Signature mirrors browser.js:2486
      // (aWebProgress, aRequest, aEvent, aIsSimulated).
      onContentBlockingEvent(webProgress) {
        if (webProgress && !webProgress.isTopLevel) {
          return;
        }
        try {
          entry.blockedTrackers = PowerBrowserAPI.webTabBlockedTrackerCount(browser);
        } catch (err) {
          entry.blockedTrackers = 0;
        }
        scheduleWebTabState(theiaBrowser, tabId, browser, browser.webProgress.isLoadingDocument);
      },
    };
    browser.addProgressListener(entry.listener, Ci.nsIWebProgress.NOTIFY_LOCATION | Ci.nsIWebProgress.NOTIFY_STATE_NETWORK | Ci.nsIWebProgress.NOTIFY_SECURITY | Ci.nsIWebProgress.NOTIFY_CONTENT_BLOCKING);
    // Title: dispatched on the embedder <browser> element itself
    // (WindowGlobalParent.cpp:563-566), the same event tabbrowser.js reads
    // for tab.label. Upserts the row (same key) and pushes.
    entry.titleListener = () => {
      const pageSpec = browser.currentURI ? browser.currentURI.spec : "";
      if (/^https?:\/\//i.test(pageSpec)) {
        PowerBrowserAPI.writeTabRow({ uri: entry.uri, url: pageSpec, title: browser.contentTitle, chromeWin: win }).catch(err => {
          PowerBrowserAPI.log("error", `[web-tab] writeTabRow failed for ${entry.uri}: ${err && err.message ? err.message : err}`);
        });
      }
      scheduleWebTabState(theiaBrowser, tabId, browser, browser.webProgress.isLoadingDocument);
    };
    browser.addEventListener("pagetitlechanged", entry.titleListener);
    // Page tools (32-01, PAGE-01): the overlay's Finder results reach the bar through one listener, attached beside the title listener.
    attachWebTabPageListeners(theiaBrowser, tabId, browser);
    // A browsing-context switch leaves a placeholder until the new page's location change (scheduleWebTabState).
    browser.addEventListener("DidChangeBrowserRemoteness", () => switchingOverlays.add(browser));
    webTabs.set(tabId, entry);
    tabHostAddTab(win, tabId, browser);
    // NG-034: a tab the frontend reopened from last session's snapshot, with
    // its history armed, gets its back/forward history back; any other tab
    // loads its URL through the null-principal navigate below.
    const history = PowerBrowserAPI.takeWebTabHistory(entry.rowKey);
    if (history) {
      PowerBrowserAPI.restoreWebTabHistory(browser, history).catch(err => {
        // Final-review M3: the restore failure can carry XPCOM/IOUtils text
        // with the profile path -- fixed string plus err.name only.
        PowerBrowserAPI.log("error", `[web-tab] history restore failed (${err && err.name ? err.name : "error"})`);
        PowerBrowserAPI.webTabNavigate(tabId, spec);
      });
      return "opened";
    }
    // UF-30-01: not awaited, so a rejection is logged here; err.name only, never the URL.
    PowerBrowserAPI.firstWebTabLoad(tabId, entry, spec).catch(err => {
      PowerBrowserAPI.log("error", `[web-tab] first load failed (${err && err.name ? err.name : "error"})`);
    });
    return "opened";
  },

  /**
   * WR-05 (Phase 30 review): a fresh overlay commits its initial about:blank
   * into session history a few ms after it is created. A first load that
   * commits before it leaves that about:blank appended after the page, so a
   * one-page tab reports canGoBack (seen live after a PowerBrowser-mode round
   * trip). Waits for the commit, bounded as restoreWebTabHistory does, then
   * loads replacing it. A navigation the frontend sends meanwhile, or a close,
   * supersedes this load.
   */
  async firstWebTabLoad(tabId, entry, spec) {
    entry.firstLoad = spec;
    const committed = () => (entry.browser.browsingContext?.sessionHistory?.count ?? 0) > 0;
    for (let waited = 0; !committed() && waited < 3000; waited += 25) {
      await PowerBrowserAPI.sleep(25);
    }
    if (entry.firstLoad !== spec || webTabs.get(tabId) !== entry) {
      return;
    }
    if (!committed()) {
      PowerBrowserAPI.log("warn", "[web-tab] initial history entry not yet committed; loading anyway");
    }
    PowerBrowserAPI.webTabNavigate(tabId, spec, { replace: true });
  },

  /**
   * GUI-02 (14.1-01): chrome -> frontend. One state push per navigation
   * event, through the SAME actor pair the requests ride: the Theia frame's
   * WindowGlobal's parent actor sends to its child, which re-dispatches the
   * payload into the content window as a PowerBrowserWebTabState event.
   * Primitives only -- URL, title, three booleans, the pushed identity enum
   * (never the bitfield), display host, registrable domain and tracker
   * count -- never the launch token, a pref, or an object. The frame can be
   * mid-swap (no WindowGlobal, or one the actor's `matches` pin refuses), so
   * a throw here is logged and dropped rather than allowed to unwind a
   * progress notification.
   *
   * Phase 31 (SITE-01..03, D-31-01..04): `securityState` is computed here,
   * in the same push as `url`, and reset on every location change by the
   * caller below: what the pill renders is always this tab's last push.
   */
  webTabPush(theiaBrowser, tabId, browser, loading) {
    try {
      const pageSpec = browser.currentURI ? browser.currentURI.spec : "";
      const identity = PowerBrowserAPI.webTabIdentity(browser, pageSpec);
      // Phase 31 plan 02 (SITE-06): the non-default permissions, table order, in the same push.
      const shown = webTabPermissionRows(browser).filter(row => row.stored !== "default");
      const pageFields = webTabPageFields(browser);
      theiaBrowser.browsingContext.currentWindowGlobal
        .getActor(GROUP_ACTOR_NAME)
        .sendAsyncMessage("PowerBrowserWebTabState", {
          kind: "state",
          tabId,
          url: webTabPushedSpec(pageSpec),
          title: webTabPushedSpec(browser.contentTitle),
          loading: !!loading,
          canGoBack: browser.canGoBack,
          canGoForward: browser.canGoForward,
          securityState: identity.securityState,
          displaySpec: identity.displaySpec,
          baseDomain: identity.baseDomain,
          blockedTrackers: identity.blockedTrackers,
          // Phase 31 plan 03 (SITE-08): the site's tracking-protection exception, in the same push as url.
          shieldExcepted: webTabShieldExcepted(browser),
          permissionIcons: shown.map(row => row.id),
          permissionLabels: shown.map(row => row.label ?? ""),
          // Page tools (32-01): zoom and find counts ride the push of this url; primitives only.
          zoom: pageFields.zoom,
          findCurrent: pageFields.findCurrent,
          findTotal: pageFields.findTotal,
          findStatus: pageFields.findStatus,
          audioMuted: pageFields.audioMuted,
          soundPlaying: pageFields.soundPlaying,
          // Phase 32 plan 07 (PAGE-04/10/11): favicon (bounded data: icon), crash state and reader state; primitives or bounded data only.
          favicon: pageFields.favicon,
          crashed: pageFields.crashed,
          isReaderMode: pageFields.isReaderMode,
          isArticle: pageFields.isArticle,
        });
    } catch (err) {
      PowerBrowserAPI.log("error", `[web-tab] state push for ${tabId} failed: ${err && err.message ? err.message : err}`);
    }
  },

  /**
   * Phase 31 (SITE-01..03, D-31-01/D-31-03/D-31-04): this overlay's site
   * identity, derived chrome-side. The decode recipe mirrors
   * browser-siteIdentity.js:872-935: a secure transport (STATE_IS_SECURE
   * and neither BROKEN nor INSECURE) is `secure`; a broken transport is
   * `mixed-passive` when the break is loaded mixed display content alone,
   * else `broken`; a non-secure transport is `local` for a potentially
   * trustworthy origin (localhost/file, like `_isPotentiallyTrustworthy`)
   * and `insecure` otherwise. About pages and the empty page carry `none`.
   * The enum crosses the wire, never the bitfield. Display host comes from
   * `nsIIDNService.convertToDisplayIDN` (getEffectiveHost, :746-759); the
   * registrable domain from `SiteDataManager.getBaseDomainFromHost` (call
   * site :473); both fall back without throwing. Primitives only.
   */
  webTabIdentity(browser, pageSpec) {
    const spec = typeof pageSpec === "string" ? pageSpec : "";
    let securityState = "none";
    if (/^https?:\/\//i.test(spec)) {
      let state = 0;
      try {
        state = browser.securityUI ? browser.securityUI.state : 0;
      } catch (err) {
        state = 0;
      }
      const wpl = Ci.nsIWebProgressListener;
      const isSecure = !!(state & wpl.STATE_IS_SECURE);
      const isBroken = !!(state & wpl.STATE_IS_BROKEN);
      const isInsecure = !!(state & wpl.STATE_IS_INSECURE);
      const mixedPassiveLoaded = !!(state & wpl.STATE_LOADED_MIXED_DISPLAY_CONTENT);
      const mixedActiveLoaded = !!(state & wpl.STATE_LOADED_MIXED_ACTIVE_CONTENT);
      const mixedDisplayBlocked = !!(state & wpl.STATE_BLOCKED_MIXED_DISPLAY_CONTENT);
      const mixedActiveBlocked = !!(state & wpl.STATE_BLOCKED_MIXED_ACTIVE_CONTENT);
      // CR-01: a certificate the user accepted past an error is STATE_IS_SECURE
      // with STATE_CERT_USER_OVERRIDDEN (nsNSSCallbacks.cpp:1211-1235). Upstream
      // keeps it out of the CA-verified path (browser-siteIdentity.js:827, 878,
      // 939-946). It takes the warning bucket here, so no "Connection secure" text.
      // shortcut: no distinct "verified by you" state (upstream tooltip, :939-946), warning copy instead; upgrade with a new SECURITY_STATES entry.
      const overridden = !!(state & wpl.STATE_CERT_USER_OVERRIDDEN);
      if (isSecure && !isBroken && !isInsecure && !overridden) {
        securityState = "secure";
      } else if (isBroken || (isSecure && (isInsecure || overridden))) {
        securityState = (mixedPassiveLoaded && !mixedActiveLoaded && !mixedDisplayBlocked && !mixedActiveBlocked) ? "mixed-passive" : "broken";
      } else if (PowerBrowserAPI.webTabIsLocalOrigin(browser)) {
        securityState = "local";
      } else {
        securityState = "insecure";
      }
    }
    let displaySpec = "";
    let baseDomain = null;
    try {
      const uri = browser.currentURI;
      if (uri && typeof uri.host === "string" && uri.host) {
        try {
          displaySpec = Cc["@mozilla.org/network/idn-service;1"].getService(Ci.nsIIDNService).convertToDisplayIDN(uri.host);
        } catch (err) {
          displaySpec = uri.host;
        }
        try {
          baseDomain = lazy.SiteDataManager.getBaseDomainFromHost(uri.host);
          // WR-08: the same display form as displaySpec (the same convertToDisplayIDN policy), so the
          // chrome bar's registrable-domain highlight matches a Unicode host instead of its punycode.
          if (typeof baseDomain === "string" && baseDomain) {
            baseDomain = Cc["@mozilla.org/network/idn-service;1"].getService(Ci.nsIIDNService).convertToDisplayIDN(baseDomain);
          }
        } catch (err) {
          baseDomain = null;
        }
      }
    } catch (err) {
      displaySpec = "";
      baseDomain = null;
    }
    let blockedTrackers = 0;
    try {
      // Phase 31 (D-31-02/SITE-08): `getContentBlockingLog()` returns a
      // serialized JSON DOMString or null (browser-custom-element.mjs:1889,
      // the `contentBlockingLog` DOMString at WindowGlobalActors.webidl:149),
      // so it must be parsed before counting: `{ origin: [[state, blocked],
      // ...] }` (browser-siteProtections.js:1026 `_processContentBlockingLog`).
      // A count is derived only fresh -- the entry stash above, reset on
      // every top-level, non-same-document location change, wins when
      // present, so a stale or blockerless page can never repeat the old
      // page's count.
      const entry = [...webTabs.values()].find(candidate => candidate.browser === browser);
      if (entry && typeof entry.blockedTrackers === "number") {
        blockedTrackers = entry.blockedTrackers;
      } else {
        blockedTrackers = PowerBrowserAPI.webTabBlockedTrackerCount(browser);
      }
    } catch (err) {
      blockedTrackers = 0;
    }
    return { securityState, displaySpec, baseDomain, blockedTrackers };
  },

  /**
   * Phase 31 (D-31-02/SITE-08): one overlay's blocked-tracker count -- the
   * number of origins in its parsed content-blocking log with at least one
   * state carrying a blocking bit. Loaded and allowed states never count.
   * The blocking bits are the STATE_BLOCKED_* flags upstream's categories
   * test (browser-siteProtections.js:358 fingerprinting, :427 suspicious
   * fingerprinting, :443 cryptomining, :480-481 tracking and email tracking,
   * :1186 social tracking), and an origin counts when one of its states
   * passes the blocking test (browser-siteProtections.js:250 and :306).
   * Guards every step: null, non-string, and unparseable logs read 0 rather
   * than throwing the push out.
   */
  webTabBlockedTrackerCount(browser) {
    try {
      const raw = browser.getContentBlockingLog();
      if (typeof raw !== "string" || !raw) {
        return 0;
      }
      let parsed = null;
      try {
        parsed = JSON.parse(raw);
      } catch (err) {
        return 0;
      }
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return 0;
      }
      const blocked =
        Ci.nsIWebProgressListener.STATE_BLOCKED_TRACKING_CONTENT |
        Ci.nsIWebProgressListener.STATE_BLOCKED_EMAILTRACKING_CONTENT |
        Ci.nsIWebProgressListener.STATE_BLOCKED_FINGERPRINTING_CONTENT |
        Ci.nsIWebProgressListener.STATE_BLOCKED_SUSPICIOUS_FINGERPRINTING |
        Ci.nsIWebProgressListener.STATE_BLOCKED_CRYPTOMINING_CONTENT |
        Ci.nsIWebProgressListener.STATE_BLOCKED_SOCIALTRACKING_CONTENT;
      // Each origin's value is its list of [state, blocked] pairs.
      return Object.values(parsed).filter(actions => Array.isArray(actions) && actions.some(pair => Array.isArray(pair) && (pair[0] & blocked) !== 0)).length;
    } catch (err) {
      return 0;
    }
  },

  /**
   * Phase 31 (D-31-01): the trust half of the decode -- upstream's
   * `_isPotentiallyTrustworthy` getter (browser-siteIdentity.js:192-198)
   * without its broken-connection guard, which the caller already applies
   * in this file. True for secure contexts (`securityUI.isSecureContext`,
   * browser-siteIdentity.js:676-677 -- a loopback http page is a secure
   * context) and for chrome-scheme documents; a missing or throwing surface
   * resolves to false, which reads `insecure` there. The principal's
   * `isOriginPotentiallyTrustworthy` (nsIPrincipal.idl:468) is the fallback
   * for documents with no securityUI (e.g. about:blank).
   */
  webTabIsLocalOrigin(browser) {
    try {
      const securityUI = browser.securityUI;
      if (securityUI && typeof securityUI.isSecureContext === "boolean") {
        return securityUI.isSecureContext;
      }
      const principal = browser.contentPrincipal;
      if (principal && typeof principal.isOriginPotentiallyTrustworthy === "boolean") {
        return principal.isOriginPotentiallyTrustworthy;
      }
      const scheme = browser.currentURI ? browser.currentURI.scheme : "";
      return scheme === "file";
    } catch (err) {
      return false;
    }
  },

  /**
   * Phase 31 (SITE-04..06, D-31-05/D-31-06): one overlay's site information.
   * Everything derives from the overlay: the identity is recomputed (never
   * trusted from a sender), the cert reads `secInfo.serverCert`
   * (pageinfo/security.js:92-94 shape: organization/issuer/validity, null
   * when there is none), the permissions read
   * `SitePermissions.getAllForBrowser` (:237-264) filtered to the
   * chrome-side ID array, the site-data probe reads
   * `SiteDataManager.hasSiteData`, and the shield reads
   * `ContentBlockingAllowList.includes` plus the stashed log length.
   * Primitives only; every read is guarded, so a missing surface resolves
   * to a null/false/empty rather than throwing the kind out.
   */
  async webTabSiteInfo(browser) {
    const pageSpec = browser.currentURI ? browser.currentURI.spec : "";
    const identity = PowerBrowserAPI.webTabIdentity(browser, pageSpec);
    // WR-01: the origin and host are captured before the only await. The panel echoes
    // the origin on a write, so it must belong to the same page as the rows below it.
    const origin = webTabPermissionOrigin(browser);
    const host = browser.currentURI && typeof browser.currentURI.asciiHost === "string" ? browser.currentURI.asciiHost : "";
    let issuer = null;
    let subject = null;
    let validFrom = null;
    let validTo = null;
    try {
      const secInfo = browser.securityUI ? browser.securityUI.secInfo : null;
      const cert = secInfo ? secInfo.serverCert : null;
      if (cert) {
        issuer = typeof cert.issuerOrganization === "string" && cert.issuerOrganization ? cert.issuerOrganization
          : (typeof cert.issuerName === "string" ? cert.issuerName : null);
        subject = typeof cert.organization === "string" && cert.organization ? cert.organization
          : (typeof cert.commonName === "string" ? cert.commonName : null);
        const validity = cert.validity;
        if (validity) {
          validFrom = webTabCertDate(validity.notBefore);
          validTo = webTabCertDate(validity.notAfter);
        }
      }
    } catch (err) {
      issuer = null;
      subject = null;
      validFrom = null;
      validTo = null;
    }
    // Phase 31 plan 02: the six managed rows in table order, state and label.
    const permissions = webTabPermissionRows(browser);
    let hasData = false;
    try {
      hasData = host ? await lazy.SiteDataManager.hasSiteData(host) : false;
    } catch (err) {
      hasData = false;
    }
    // WR-01: the overlay may have navigated during the await. Then the rows above are page A's
    // and the origin would be page B's: refuse the reply rather than mix them.
    // The origin is null for a non-web page, so null === null is "unchanged" there too.
    if (webTabPermissionOrigin(browser) !== origin) {
      return { where: "site-changed" };
    }
    let shieldExcepted = false;
    try {
      shieldExcepted = !!lazy.ContentBlockingAllowList.includes(browser);
    } catch (err) {
      shieldExcepted = false;
    }
    let shieldCount = 0;
    try {
      shieldCount = PowerBrowserAPI.webTabBlockedTrackerCount(browser);
    } catch (err) {
      shieldCount = 0;
    }
    return {
      origin,
      securityState: identity.securityState,
      displaySpec: identity.displaySpec,
      baseDomain: identity.baseDomain,
      issuer,
      subject,
      validFrom,
      validTo,
      permissions,
      hasData,
      shield: { count: shieldCount, excepted: shieldExcepted },
    };
  },

  /**
   * GUI-02 (14.1-01): navigates one overlay. Same scheme wall as webTabOpen;
   * the triggering principal is a fresh null principal, exactly the
   * hardening addWebTab applies (tabbrowser.js:3185-3198 throws on a system
   * principal), and never browser.src.
   */
  webTabNavigate(tabId, url, { replace = false } = {}) {
    const spec = typeof url === "string" && url ? url : "about:blank";
    if (spec !== "about:blank" && !/^https?:\/\//i.test(spec)) {
      return "refused-scheme";
    }
    const entry = webTabs.get(tabId);
    if (!entry) {
      return "unknown-tab";
    }
    // WR-05: any navigation supersedes a first load still waiting in firstWebTabLoad.
    entry.firstLoad = null;
    const triggeringPrincipal = Services.scriptSecurityManager.createNullPrincipal({});
    const loadFlags = replace ? Ci.nsIWebNavigation.LOAD_FLAGS_REPLACE_HISTORY : Ci.nsIWebNavigation.LOAD_FLAGS_NONE;
    entry.browser.fixupAndLoadURIString(spec, { triggeringPrincipal, loadFlags });
    return "loading";
  },

  /**
   * GUI-02 (14.1-01): applies one placeholder rect to its overlay. The
   * frontend measures the placeholder in CSS px inside the Theia frame;
   * both frames share one window (one devicePixelRatio, no zoom UI), so the
   * mapping is the identity offset by the Theia frame's own rect -- (0,0)
   * today, read live so the mapping stays honest if the frame ever moves.
   * Numbers are clamped to the shell window (the caller has already
   * refused non-finite ones). visible=false hides with `visibility`, the
   * tabpanels deck idiom (xul.css:453-470) -- never display:none or removal,
   * which would destroy the frameloader and its session history -- and
   * turns activeness off so the page stops rendering layers and running
   * foreground timers while it cannot be seen.
   */
  webTabGeometry(theiaBrowser, tabId, { x, y, w, h, visible }) {
    const entry = webTabs.get(tabId);
    if (!entry) {
      return "unknown-tab";
    }
    const win = theiaBrowser.ownerDocument.defaultView;
    const left = Math.max(0, x);
    const top = Math.max(0, y);
    const width = Math.max(0, Math.min(w, win.innerWidth - left));
    const height = Math.max(0, Math.min(h, win.innerHeight - top));
    const host = theiaBrowser.getBoundingClientRect();
    // GUI-08 (14.1.1-02): the overlay's equivalent of the stock TabSelect-leave
    // site -- a mode switch away or a tab deselect hides this overlay, and its
    // LAST view is what the Panorama card must show. Scheduled BEFORE the
    // assignment below turns docShellIsActive off, so the page is still
    // painting when the settle timer draws it.
    const wasVisible = entry.browser.style.visibility === "visible";
    if (wasVisible && !visible && entry.uri) {
      PowerBrowserAPI.scheduleSettleCapture(entry.uri, win);
    }
    Object.assign(entry.browser.style, {
      left: `${host.left + left}px`,
      top: `${host.top + top}px`,
      width: `${width}px`,
      height: `${height}px`,
      visibility: visible ? "visible" : "hidden",
    });
    entry.browser.docShellIsActive = !!visible;
    return "applied";
  },

  /**
   * GUI-02 (14.1-01): drops one overlay -- element, its tab node (Phase
   * 31.1), host entry. Idempotent: a tab this host does not hold answers "unknown-tab"
   * and touches nothing.
   */
  webTabClose(tabId) {
    const entry = webTabs.get(tabId);
    if (!entry) {
      return "unknown-tab";
    }
    const { browser } = entry;
    const win = browser.ownerDocument.defaultView;
    // PAGE-11: a crashed overlay is recreated by close then open (Reload tab); its parent-side session history outlives
    // the content process, so the open that follows restores it through the NG-034 armed-history path.
    if (webTabPageState.get(browser)?.crashed && entry.rowKey) {
      PowerBrowserAPI.keepCrashedWebTabHistory(entry);
    } else {
      keepClosedWebTabHistory(entry);
    }
    // Listener removal is best-effort on teardown (the startTabStoreTriggers
    // idiom): a frameloader already torn down throws here, and the element
    // removal below is what matters.
    try {
      browser.removeProgressListener(entry.listener);
    } catch {
      // best-effort
    }
    try {
      browser.removeEventListener("pagetitlechanged", entry.titleListener);
    } catch {
      // best-effort
    }
    detachWebTabPageListeners(browser);
    if (entry.uri) {
      PowerBrowserAPI.removeTabRow(entry.uri).catch(err => {
        PowerBrowserAPI.log("error", `[web-tab] removeTabRow failed for ${entry.uri}: ${err && err.message ? err.message : err}`);
      });
    }
    // The tab node goes first: TabClose reads it while it is still in the strip. A throw here must not skip
    // browser.remove() (the docshell is freed by the removal) or webTabs.delete(); the close proceeds either way.
    try {
      tabHostDropTab(win, browser);
    } catch {
      PowerBrowserAPI.log("error", "[web-tab] tab host drop failed; the overlay is closed anyway");
    }
    webTabCloseToolbox(browser);
    browser.remove();
    webTabs.delete(tabId);
    return "closed";
  },

  /** GUI-02 (14.1-01): session-history navigation on one overlay; "unknown-tab" or "done". */
  webTabBack(tabId) {
    const entry = webTabs.get(tabId);
    if (!entry) {
      return "unknown-tab";
    }
    entry.browser.goBack();
    return "done";
  },

  webTabForward(tabId) {
    const entry = webTabs.get(tabId);
    if (!entry) {
      return "unknown-tab";
    }
    entry.browser.goForward();
    return "done";
  },

  webTabReload(tabId, bypassCache = false) {
    const entry = webTabs.get(tabId);
    if (!entry) {
      return "unknown-tab";
    }
    if (bypassCache) {
      // NAV-02: Firefox's own hard reload flags (browser-commands.js kSkipCacheFlags).
      entry.browser.reloadWithFlags(Ci.nsIWebNavigation.LOAD_FLAGS_BYPASS_PROXY | Ci.nsIWebNavigation.LOAD_FLAGS_BYPASS_CACHE);
    } else {
      entry.browser.reload();
    }
    return "done";
  },

  /** GUI-02 (14.1-01): keyboard entry into the page (UI-SPEC A14): focuses the overlay's docshell. */
  webTabFocus(tabId) {
    const entry = webTabs.get(tabId);
    if (!entry) {
      return "unknown-tab";
    }
    entry.browser.focus();
    return "done";
  },

  /**
   * GUI-02 (14.1-01, T-14.1-05): drops every overlay a frontend WindowGlobal
   * opened, called from the parent actor's didDestroy. A sidecar swap or a
   * frontend reload replaces the WindowGlobal and its actor; without this
   * the overlays it created would outlive it -- pages still rendering and
   * playing audio behind a shell that no longer knows they exist.
   */
  webTabDropOwnedBy(actorRef) {
    for (const [tabId, entry] of [...webTabs]) {
      if (entry.owner === actorRef) {
        PowerBrowserAPI.webTabClose(tabId);
      }
    }
  },

  /**
   * True when `cmdLine` describes this process's own first launch, as
   * opposed to a remote handoff from a second launch of the same binary
   * against the same profile. The single-instance handler below branches on
   * it; the constant lives here because `Ci.` is forbidden everywhere else.
   */
  isInitialLaunch(cmdLine) {
    return cmdLine.state === Ci.nsICommandLine.STATE_INITIAL_LAUNCH;
  },
});

/**
 * D-121/D-123/D-124: the single-instance command-line handler, registered
 * via `powerbrowser/shell/components.conf` under the `command-line-handler`
 * category, entry name `a-powerbrowser` (sorts ahead of the stock browser
 * handler's `m-browser`, and far ahead of `x-default`, the handler that
 * actually opens a window -- see components.conf's own comment). Exported
 * from this file rather than a sibling module because it needs
 * `ChromeUtils.generateQI`/`Ci.nsICommandLineHandler`, both `Ci.`-pattern
 * touches the boundary guard forbids everywhere else under
 * `powerbrowser/shell/` (D-96/D-97).
 *
 * Behaviour (D-123/D-124, extended by 01-05 for GUI-01): look up the
 * existing shell window. If one is found -- a second launch of the same
 * binary against the same profile -- focus it and set `preventDefault`,
 * ignoring every command-line argument: never read one, never open a
 * window.
 *
 * If none is found AND this is the process's own initial launch, open the
 * shell document here and set `preventDefault`. This is startup-window
 * selection, and it lives here rather than in the compiled
 * BROWSER_CHROME_URL define patch 020 used to override (01-05, D-20): the
 * stock default handler
 * (upstream/browser/components/BrowserContentHandler.sys.mjs) gates its own
 * `openBrowserWindow` call on `!cmdLine.preventDefault`, so setting it is
 * what stops a second, stock window from also opening. Its `else` branch
 * then closes the early `navigator:blank` window, which is the brief
 * startup flicker upstream's own comment there calls acceptable and which
 * 01-UI-SPEC.md accepts and documents rather than fixes.
 *
 * If none is found and this is NOT the initial launch -- a remote handoff
 * that arrived before or without a shell window -- do nothing at all;
 * preventing the default here would leave that launch with no window.
 *
 * A thrown error is caught and logged rather than left to propagate into
 * the platform's own handler enumeration, which would otherwise break every
 * handler still due to run after this one.
 */
export class PowerBrowserSingleInstanceHandler {
  QueryInterface = ChromeUtils.generateQI([Ci.nsICommandLineHandler]);

  helpInfo = "";

  handle(cmdLine) {
    try {
      const win = PowerBrowserAPI.findShellWindow();
      if (win) {
        PowerBrowserAPI.focusWindow(win);
        cmdLine.preventDefault = true;
        return;
      }
      if (!PowerBrowserAPI.isInitialLaunch(cmdLine)) {
        return;
      }
      PowerBrowserAPI.openShellWindow();
      cmdLine.preventDefault = true;
    } catch (err) {
      PowerBrowserAPI.log("error", `[PowerBrowserSingleInstanceHandler] ${err}`);
    }
  }
}

/**
 * GUI-08 (15-01): parent half of the PowerBrowserGroup actor pair, exported
 * from this boundary file (never a sibling module) for the same reason as
 * the handler above: the structural consequence in 15-01-PLAN.md. The actor
 * loader resolves the parent esModuleURI at registration time; the class
 * extends the actor global when present and a no-op base otherwise, so the
 * normal importESModule load of this file (TheiaService, tests) never
 * throws on the missing global. receiveMessage answers
 * PowerBrowserGroupMutation queries through handleGroupMutation above and
 * ignores anything else.
 */
const GroupActorBase = typeof JSWindowActorParent !== "undefined" ? JSWindowActorParent : class {};

export class PowerBrowserGroupParent extends GroupActorBase {
  async receiveMessage(message) {
    if (!message || message.name !== "PowerBrowserGroupMutation") {
      return undefined;
    }
    // NG-033: the profile-store and quit-flush kinds have their own handler
    // (handleShellMessage); NG-021..NG-028's store reads have theirs
    // (handleStoreRequest); every other kind is a group or web-tab mutation.
    if (SHELL_MESSAGE_KINDS.has(message.data && message.data.kind)) {
      return PowerBrowserAPI.handleShellMessage(message.data, this);
    }
    if (isStoreRequestKind(message.data?.kind)) { return handleStoreRequest(message.data, this); }
    if (WEB_TAB_ACTION_KINDS.has(message.data?.kind)) { return handleWebTabAction(message.data, this); }
    return PowerBrowserAPI.handleGroupMutation(message.data, this);
  }

  // GUI-02 (14.1-01): overlays never outlive the frontend WindowGlobal that
  // opened them (see webTabDropOwnedBy).
  didDestroy() {
    PowerBrowserAPI.webTabDropOwnedBy(this);
  }
}

// ---------------------------------------------------------------------------
// Non-GUI wave B (NG-021..NG-028): the store request channel.
//
// Kinds that READ history, bookmarks, the sessionstore projection and the
// tab/Places join, and (NG-028) capture a saved copy of a page, ride the same
// PowerBrowserGroup actor pair as the group mutations -- one channel, one
// boundary file -- but dispatch here, in a function of their own, so
// handleGroupMutation stays the group writer's alone. The actor parent's
// receiveMessage routes a kind in STORE_REQUEST_KINDS here with one line;
// every other kind still goes to handleGroupMutation.
//
// This section sits at the end of the file on purpose: nothing above the
// last catalogued internals line moves when it grows, so the line references
// in INTERNAL-APIS.md stay valid.
// ---------------------------------------------------------------------------

const STORE_REQUEST_KINDS = new Set([
  "readHistoryEntry",
  "readBookmarkByUrl",
  "listBookmarkFolder",
  "projectSessionStoreTabs",
  "queryTabsWithPlaces",
  "searchPlaces",
  "setSetting",
  "savePageCopy",
  "resolveTypedAddress",
  "listSearchEngines",
  "placesFavicons",
  "searchSuggestions",
  "autofillOrigin",
  "removeHistoryEntry",
  "readClipboardText",
  "openStockPage",
  "quitRequest",
  "bookmarkPage",
  "updateBookmark",
  "removeBookmark",
  "listClosedTabs",
  "reopenClosedTab",
  "clearHistory",
]);

function isStoreRequestKind(kind) {
  return typeof kind === "string" && STORE_REQUEST_KINDS.has(kind);
}

// These kinds read the user's history and bookmarks, so they add a wall of
// their own on top of groupSenderIsTheia: the sender's top frame must be
// embedded in a Power Browser shell window. A page in a stock browser tab
// lives in a navigator:browser window and is refused here, whatever the
// shared sender check decides. ownerDocument, not ownerGlobal: this Gecko
// declares no ownerGlobal (no WebIDL hit), so it reads undefined and the
// wall refused the shell's own frame (measured live, wave B Task 3 round 1).
function storeSenderInShellWindow(actorRef) {
  try {
    const root = actorRef.browsingContext.top.embedderElement.ownerDocument.documentElement;
    return root.getAttribute("windowtype") === "powerbrowser:main";
  } catch {
    PowerBrowserAPI.log("warn", "[storeSenderInShellWindow] wall: shell root unreadable");
    return false;
  }
}

function storeUrlArg(value) {
  if (typeof value !== "string" || !value || value.length > 8192) {
    throw new Error("handleStoreRequest: refusing a missing or oversized url");
  }
  return value;
}

async function handleStoreRequest(data, actorRef) {
  if (!groupSenderIsTheia(actorRef) || !storeSenderInShellWindow(actorRef)) {
    PowerBrowserAPI.log("error", "[handleStoreRequest] rejecting a sender outside the shell's Theia frame");
    return { ok: false, reason: "validation", message: "handleStoreRequest: refusing a sender outside the shell's Theia frame" };
  }
  const kind = data.kind;
  try {
    switch (kind) {
      // Replies cross the actor boundary by structured clone, and Places
      // hands back URL objects, which do not clone: every url here is a string.
      case "readHistoryEntry": {
        const entry = await PowerBrowserAPI.readHistoryEntry(storeUrlArg(data.url));
        return { ok: true, kind, entry: entry && { url: String(entry.url), title: entry.title } };
      }
      case "readBookmarkByUrl": {
        const bookmark = await PowerBrowserAPI.readBookmarkByUrl(storeUrlArg(data.url));
        return { ok: true, kind, bookmark: bookmark && { guid: bookmark.guid, title: bookmark.title, url: String(bookmark.url), folder: bookmark.folder } };
      }
      case "listBookmarkFolder": {
        const rows = PowerBrowserAPI.listBookmarkFolder(resolveBookmarkFolder(data.folderGuid)).map(row => ({ guid: row.guid, title: row.title, url: String(row.url) }));
        return { ok: true, kind, rows };
      }
      case "projectSessionStoreTabs": {
        return { ok: true, kind, rows: PowerBrowserAPI.projectSessionStoreTabs() };
      }
      case "queryTabsWithPlaces": {
        const joined = await queryTabsWithPlaces({
          bookmarked: typeof data.bookmarked === "boolean" ? data.bookmarked : undefined,
          open: typeof data.open === "boolean" ? data.open : undefined,
          limit: Number.isInteger(data.limit) ? data.limit : undefined,
        });
        return { ok: true, kind, rows: joined.rows, truncated: joined.truncated };
      }
      case "searchPlaces": {
        return { ok: true, kind, rows: data.restrict !== undefined ? await searchPlacesRestricted(data.text, data.limit, data.restrict) : await searchPlaces(data.text, data.limit) };
      }
      case "setSetting": {
        const saved = await setStoreSetting(data.key, data.value);
        return { ok: true, kind, key: saved.key };
      }
      case "savePageCopy": {
        const saved = await savePageCopy(data.uri);
        return { ok: true, kind, dir: saved.dir, bytes: saved.bytes };
      }
      case "resolveTypedAddress": {
        return { ok: true, kind, resolved: await resolveTypedAddress(data.text, data.engineName ?? "", data.canonize === true, data.forceSearch === true) };
      }
      case "listSearchEngines": {
        return { ok: true, kind, ...(await listSearchEngines()) };
      }
      case "placesFavicons": {
        return { ok: true, kind, icons: await placesFavicons(data.urls) };
      }
      case "searchSuggestions": {
        return { ok: true, kind, rows: await searchSuggestions(actorRef, data.text, data.engineName ?? "") };
      }
      case "autofillOrigin": {
        return { ok: true, kind, completion: await autofillOrigin(data.text) };
      }
      case "removeHistoryEntry": {
        return { ok: true, kind, removed: await removeHistoryEntry(data.url) };
      }
      case "readClipboardText": {
        return { ok: true, kind, text: readClipboardText() };
      }
      // Phase 31 plan 04 (MENU-02, D-31-07): a stock page from the app menu. The
      // page is an enum value; the URL for a trusted-tab page is fixed in
      // openStockPageFromMenu, never sent by the frontend.
      case "openStockPage": {
        return { ok: true, kind, where: await openStockPageFromMenu(data.page) };
      }
      // Phase 31 plan 05 (MENU-04, D-31-13): the menu's Quit row. No argument is read:
      // the one existing quit path decides. A quit-requested observer may cancel it
      // (a page's leave prompt), which is a reply, not an error.
      case "quitRequest": {
        if (!PowerBrowserAPI.quitApplication()) {
          return { ok: false, kind, reason: "cancelled" };
        }
        return { ok: true, kind, where: "applied" };
      }
      // Phase 33: the bookmark writes and the history clear are privileged (rule 12); the closed-tab reads are reads.
      case "bookmarkPage": {
        return { ok: true, kind, bookmark: await bookmarkPage(data.url, data.title, data.folderGuid) };
      }
      case "updateBookmark": {
        return { ok: true, kind, bookmark: await updateBookmark(data.guid, data.title, data.folderGuid) };
      }
      case "removeBookmark": {
        return { ok: true, kind, removed: await removeBookmark(data.target) };
      }
      case "listClosedTabs": {
        return { ok: true, kind, rows: await listClosedTabs(data.limit) };
      }
      case "reopenClosedTab": {
        return { ok: true, kind, tab: await reopenClosedTab(data.uri) };
      }
      case "clearHistory": {
        return { ok: true, kind, cleared: await clearHistory(data.range) };
      }
      default: {
        return { ok: false, reason: "validation", message: `handleStoreRequest: unknown kind ${String(kind)}` };
      }
    }
  } catch (err) {
    // A refusal this channel writes itself ("<function>: refusing ..." or
    // "<function>: unknown ...", fixed text or the caller's own argument)
    // crosses back as it is. Any other error -- Places, SessionStore, IOUtils
    // -- can carry a URL, a title or a path, so neither the log nor the reply
    // repeats it.
    const message = String(err && err.message);
    const reason = /^\w+: (refusing|unknown)\b/.test(message) ? "validation" : "store";
    PowerBrowserAPI.log("warn", `[handleStoreRequest] ${String(kind)} failed: ${reason}`);
    return { ok: false, reason, message: reason === "validation" ? message : `handleStoreRequest: ${String(kind)} failed in the store` };
  }
}

// NG-024: the tab/Places join (FEATURES.md Area 4). tabs.sqlite rows, read on
// the writer's own connection, joined on URL to Places -- frecency, visit
// count, last visit, first bookmark -- through the platform's read-only
// Places connection (bound parameters, SELECT only). Ranked by frecency,
// highest first, tabs with no history last. The join key is tabs.url; tabs.uri
// is identity only (docs/TAB-STORE.md), and a row is open while closed_at is
// NULL.
const TAB_PLACES_SCAN_CAP = 5000;

async function queryTabsWithPlaces({ bookmarked, open, limit } = {}) {
  const cap = Number.isInteger(limit) ? Math.min(Math.max(limit, 1), 1000) : 200;
  const conn = await PowerBrowserAPI.openTabStore();
  // TAB_PLACES_SCAN_CAP bounds the scan: only the 5000 most recently active
  // rows are joined (docs/tab-store-access.md, "tabs_with_places"), so a
  // store grown by a long closed_retention_days never makes this reply grow
  // without bound. truncated is true when rows past the cap were not joined.
  const tabRows = await conn.execute(
    "SELECT uri, url, title, group_id, last_active, closed_at FROM tabs ORDER BY last_active DESC LIMIT :scan",
    { scan: TAB_PLACES_SCAN_CAP }
  );
  const scannedAll = tabRows.length < TAB_PLACES_SCAN_CAP;
  const places = await lazy.PlacesUtils.promiseDBConnection();
  const rows = [];
  for (const tabRow of tabRows) {
    const uri = tabRow.getResultByName("uri");
    const url = tabRow.getResultByName("url");
    let place = null;
    if (typeof url === "string" && /^https?:\/\//.test(url)) {
      const hits = await places.executeCached(
        `SELECT h.frecency AS frecency, h.visit_count AS visit_count, h.last_visit_date AS last_visit_date,
                b.guid AS bookmark_guid, b.title AS bookmark_title
           FROM moz_places h
           LEFT JOIN moz_bookmarks b ON b.id = (SELECT MIN(id) FROM moz_bookmarks WHERE fk = h.id)
          WHERE h.url_hash = hash(:url) AND h.url = :url`,
        { url }
      );
      place = hits.length ? hits[0] : null;
    }
    const bookmarkGuid = place ? place.getResultByName("bookmark_guid") : null;
    if ((bookmarked === true && !bookmarkGuid) || (bookmarked === false && bookmarkGuid)) {
      continue;
    }
    const closedAt = tabRow.getResultByName("closed_at");
    const isOpen = closedAt === null;
    if ((open === true && !isOpen) || (open === false && isOpen)) {
      continue;
    }
    const lastVisit = place ? place.getResultByName("last_visit_date") : null;
    rows.push({
      uri,
      url,
      title: tabRow.getResultByName("title") ?? "",
      group_id: tabRow.getResultByName("group_id"),
      last_active: tabRow.getResultByName("last_active"),
      closed_at: closedAt,
      open: isOpen,
      visited: !!place && place.getResultByName("visit_count") > 0,
      frecency: place ? place.getResultByName("frecency") : null,
      visit_count: place ? place.getResultByName("visit_count") : 0,
      last_visit: lastVisit ? Math.floor(lastVisit / 1000) : null,
      bookmark_guid: bookmarkGuid ?? null,
      bookmark_title: place ? place.getResultByName("bookmark_title") : null,
    });
  }
  const rank = row => (row.frecency === null ? -Infinity : row.frecency);
  rows.sort((a, b) => (rank(a) === rank(b) ? 0 : rank(b) > rank(a) ? 1 : -1));
  return { rows: rows.slice(0, cap), truncated: !scannedAll };
}

// NG-023: history and bookmark matches for the address bar
// (13-UI-SPEC.md:141,192). A literal substring match over the address, the
// page title and the bookmark title: typed %, _ and \ are escaped, as in
// TabQueryService.searchByPrefix. Only http and https addresses are returned,
// so a bookmarklet or a file: bookmark is never offered as somewhere to go.
// Bookmarks come first, then history by frecency.
async function searchPlaces(text, limit) {
  const needle = typeof text === "string" ? text.slice(0, 256) : "";
  const cap = Number.isInteger(limit) ? Math.min(Math.max(limit, 1), 50) : 8;
  if (!needle.trim()) {
    return [];
  }
  const pattern = `%${needle.replace(/[\\%_]/g, c => "\\" + c)}%`;
  const places = await lazy.PlacesUtils.promiseDBConnection();
  const rows = await places.executeCached(
    `SELECT h.url AS url, COALESCE(MAX(b.title), h.title, '') AS title, h.frecency AS frecency,
            MAX(b.guid) AS bookmark_guid
       FROM moz_places h
       LEFT JOIN moz_bookmarks b ON b.fk = h.id
      WHERE (h.url LIKE :pattern ESCAPE '\\' OR h.title LIKE :pattern ESCAPE '\\' OR b.title LIKE :pattern ESCAPE '\\')
        AND (substr(h.url, 1, 7) = 'http://' OR substr(h.url, 1, 8) = 'https://')
        AND (h.visit_count > 0 OR b.id IS NOT NULL)
      GROUP BY h.id
      ORDER BY (MAX(b.guid) IS NOT NULL) DESC, h.frecency DESC
      LIMIT :cap`,
    { pattern, cap }
  );
  return rows.map(row => ({
    url: row.getResultByName("url"),
    title: row.getResultByName("title") ?? "",
    frecency: row.getResultByName("frecency"),
    bookmarked: row.getResultByName("bookmark_guid") !== null,
  }));
}

// NG-005 / NG-023: the sweep's open set -- the key of every stock tab
// sessionstore lists, whether or not it has collected the tab's history yet.
// parseSessionStoreTabRows skips a tab with no history entry, because such a
// tab has no address to write. Measured live: a startup tab carried its key
// but no entry at the first sessionstore write (3 s after launch), and its
// entry arrived about 13 s later. The sweep closed that open tab's row until
// the next write, so every store reader treated the tab as closed, and the
// address bar ranked its history row below a bookmark. It sits at the end of
// the file so no catalogued line above moves.
function sessionStoreStockKeys() {
  try {
    const state = JSON.parse(lazy.SessionStore.getBrowserState());
    return (state.windows ?? [])
      .filter(win => !win.isPrivate)
      .flatMap(win => (win.tabs ?? []).map(tab => tab.extData?.[STOCK_TAB_KEY_VALUE]))
      .filter(Boolean);
  } catch {
    // The same answer parseSessionStoreTabRows gives on a failed read.
    return [];
  }
}

// NG-026 / decisions.md R18: settings writes through the one chrome writer.
// Each key's valid values are the ones docs/TAB-STORE.md ("Settings") states;
// ng-026-store-write-endpoint requires this key set to equal the doc's, so a
// setting wave A adds without a rule here goes red. Only existing rows are
// updated: a key the store does not hold is refused, never inserted.
const STORE_SETTING_RULES = {
  closed_retention_days: { valid: v => /^\d+(\.\d+)?$/.test(v) && Number(v) >= 0 && Number(v) <= 3650, says: "a number from 0 to 3650, decimals allowed" },
  integrity_check_minutes: { valid: v => /^\d+(\.\d+)?$/.test(v) && Number(v) > 0 && Number(v) <= 525600, says: "a number greater than 0 and at most 525600, decimals allowed" },
  restore_behaviour: { valid: v => v === "session" || v === "none", says: "session or none" },
  restore_live_minutes: { valid: v => /^\d+(\.\d+)?$/.test(v) && Number(v) >= 0 && Number(v) <= 10080, says: "a number from 0 to 10080, decimals allowed" },
  restore_url_days: { valid: v => /^\d+(\.\d+)?$/.test(v) && Number(v) >= 0 && Number(v) <= 3650, says: "a number from 0 to 3650, decimals allowed" },
};

async function setStoreSetting(key, value) {
  const rule = typeof key === "string" && Object.prototype.hasOwnProperty.call(STORE_SETTING_RULES, key) ? STORE_SETTING_RULES[key] : null;
  if (!rule) {
    throw new Error(`setSetting: refusing unknown setting ${String(key).slice(0, 64)}`);
  }
  if (typeof value !== "string" || !rule.valid(value)) {
    throw new Error(`setSetting: refusing that value for ${key}; it must be ${rule.says}`);
  }
  const conn = await PowerBrowserAPI.openTabStore();
  const found = await conn.execute("SELECT 1 FROM settings WHERE key = :key", { key });
  if (!found.length) {
    throw new Error(`setSetting: refusing ${key}, which this store does not hold`);
  }
  await conn.execute("UPDATE settings SET value = :value WHERE key = :key", { key, value });
  return { key, value };
}

// NG-028: a full saved copy of a tab's page -- the document plus the images,
// styles and scripts it loaded, written the way the browser's own "Save Page
// As, Web Page, complete" writes them (upstream/toolkit/content/
// contentAreaUtils.js internalPersist) -- into
// <profile>/saved-pages/<id>/page.html and page_files/, with one saved_pages
// row per tab. The directory is minted here, never taken from the caller.
const SAVED_PAGES_DIR = "saved-pages";

function persistDocument(browser) {
  return new Promise((resolve, reject) => {
    browser.frameLoader.startPersistence(null, {
      onDocumentReady: resolve,
      onError: status => reject(new Error(`savePageCopy: the page could not be read (status ${status})`)),
    });
  });
}

function writePersistedDocument(doc, pageFile, filesDir) {
  const wbp = Ci.nsIWebBrowserPersist;
  const wpl = Ci.nsIWebProgressListener;
  return new Promise((resolve, reject) => {
    const persist = Cc["@mozilla.org/embedding/browser/nsWebBrowserPersist;1"].createInstance(wbp);
    persist.persistFlags = wbp.PERSIST_FLAGS_REPLACE_EXISTING_FILES | wbp.PERSIST_FLAGS_FROM_CACHE | wbp.PERSIST_FLAGS_AUTODETECT_APPLY_CONVERSION;
    persist.progressListener = {
      QueryInterface: ChromeUtils.generateQI(["nsIWebProgressListener"]),
      onStateChange(_progress, _request, flags, status) {
        if (flags & wpl.STATE_STOP && flags & wpl.STATE_IS_NETWORK) {
          if (status === 0) {
            resolve();
          } else {
            reject(new Error(`savePageCopy: writing the copy failed (status ${status})`));
          }
        }
      },
      onProgressChange() {},
      onLocationChange() {},
      onStatusChange() {},
      onSecurityChange() {},
      onContentBlockingEvent() {},
    };
    persist.saveDocument(doc, pageFile, filesDir, "text/html", wbp.ENCODE_FLAGS_ENCODE_BASIC_ENTITIES | wbp.ENCODE_FLAGS_DISALLOW_LINE_BREAKING, 80);
  });
}

async function directoryBytes(path) {
  let total = 0;
  for (const child of await IOUtils.getChildren(path)) {
    const info = await IOUtils.stat(child);
    total += info.type === "directory" ? await directoryBytes(child) : info.size;
  }
  return total;
}

async function savePageCopy(uri) {
  if (typeof uri !== "string" || !uri || uri.length > 8192) {
    throw new Error("savePageCopy: refusing a missing or oversized uri");
  }
  const found = PowerBrowserAPI.findTabBrowserForUri(uri);
  if (!found || !found.browser) {
    throw new Error("savePageCopy: unknown tab");
  }
  const { browser } = found;
  if (lazy.PrivateBrowsingUtils.isBrowserPrivate(browser)) {
    throw new Error("savePageCopy: refusing a private tab");
  }
  const url = browser.currentURI ? browser.currentURI.spec : "";
  if (!/^https?:\/\//.test(url)) {
    throw new Error("savePageCopy: refusing a page that is not http or https");
  }
  const profile = PowerBrowserAPI.getProfileDir();
  if (!profile) {
    throw new Error("savePageCopy: unknown profile directory");
  }
  const root = PathUtils.join(profile, SAVED_PAGES_DIR);
  const dir = PathUtils.join(root, `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);
  await IOUtils.makeDirectory(dir, { createAncestors: true });
  try {
    const doc = await persistDocument(browser);
    await writePersistedDocument(doc, await IOUtils.getFile(dir, "page.html"), await IOUtils.getFile(dir, "page_files"));
    const bytes = await directoryBytes(dir);
    const conn = await PowerBrowserAPI.openTabStore();
    let previous = null;
    await conn.executeTransaction(async () => {
      const old = await conn.execute("SELECT dir FROM saved_pages WHERE tab_uri = :uri", { uri });
      previous = old.length ? old[0].getResultByName("dir") : null;
      await conn.execute(
        `INSERT INTO saved_pages (tab_uri, dir, url, title, saved_at, bytes) VALUES (:uri, :dir, :url, :title, :savedAt, :bytes)
         ON CONFLICT (tab_uri) DO UPDATE SET dir = excluded.dir, url = excluded.url, title = excluded.title,
           saved_at = excluded.saved_at, bytes = excluded.bytes`,
        { uri, dir, url, title: browser.contentTitle || "", savedAt: Date.now(), bytes }
      );
    });
    // Only a directory this code minted under saved-pages/ is ever removed.
    // Structural, not textual: PathUtils normalizes both sides with native
    // separators, so ".." segments and Windows separators cannot escape the
    // check, and the filename shape matches the minted id above.
    if (previous && previous !== dir && isMintedSavedPageDir(previous, root)) {
      await IOUtils.remove(previous, { recursive: true, ignoreAbsent: true });
    }
    return { dir, bytes };
  } catch (err) {
    await IOUtils.remove(dir, { recursive: true, ignoreAbsent: true });
    throw err;
  }
}

// NG-028: true when `candidate` is a directory this code minted directly
// under the saved-pages root: after normalization its parent is the root and
// its own name has the minted "<stamp>-<random>" shape. A hand-edited or
// tampered saved_pages.dir outside the root, or with ".." segments, fails.
function isMintedSavedPageDir(candidate, root) {
  let normalized;
  let normalizedRoot;
  try {
    normalized = PathUtils.normalize(candidate);
    normalizedRoot = PathUtils.normalize(root);
  } catch {
    return false;
  }
  if (PathUtils.parent(normalized) !== normalizedRoot) {
    return false;
  }
  return /^[0-9a-z]+-[0-9a-z]+$/.test(PathUtils.filename(normalized));
}

// ---------------------------------------------------------------------------
// Phase 27: the web-tab action section.
//
// New web-tab kinds the frontend sends (webTabStop first; later v1.5 phases
// add more) and the pushes chrome sends back for keys pressed inside a page
// (shortcut, pageFocus). The actor parent's receiveMessage routes a kind in
// WEB_TAB_ACTION_KINDS here with one line, the way the store request channel
// above is routed; handleGroupMutation is not touched.
//
// This section sits at the end of the file on purpose: nothing above the
// last catalogued internals line moves when it grows, so the line references
// in INTERNAL-APIS.md stay valid. powerbrowser.js reaches it through the
// second frozen export below: the boundary is one file, not one object.
// ---------------------------------------------------------------------------

const WEB_TAB_ACTION_KINDS = new Set(["webTabStop", "webTabHistory", "webTabGotoIndex", "webTabActivated", "webTabSiteInfo", "webTabSetPermission", "webTabClearSiteData", "webTabShieldToggle", "webTabFind", "webTabFindNext", "webTabFindClose", "webTabZoomIn", "webTabZoomOut", "webTabZoomReset", "webTabMute", "webTabDownloadsSubscribe", "webTabDownloadsAction", "webTabPrint", "webTabSavePick", "webTabSaveExport", "webTabEdit", "webTabReader", "webTabViewSource", "webTabDevtools"]);

// Phase 31 (D-31-11): the permission IDs chrome admits on the site-info
// read path -- the six upstream Firefox IDs, the same set the Theia table
// carries. Chrome never imports the Theia table; the static gate compares
// the two by set equality.
const SITE_INFO_PERMISSION_IDS = ["camera", "microphone", "geo", "desktop-notification", "autoplay-media", "popup"];

// Phase 31 plan 02 (D-31-05/D-31-06): the panel's write vocabulary. The
// state names are the tri-state the panel cycles; the capability each maps
// to is an upstream SitePermissions constant. `null` means "use default"
// (removeFromPrincipal); `undefined` means the state is not one of this
// permission's states, and the write is refused before anything is touched.
// autoplay-media alone has the block-audible / block-all pair
// (SitePermissions.sys.mjs:888-892).
function webTabPermissionCapability(id, state) {
  if (state === "default") {
    return null;
  }
  if (state === "allow") {
    return lazy.SitePermissions.ALLOW;
  }
  if (id === "autoplay-media") {
    if (state === "block-audible") {
      return lazy.SitePermissions.BLOCK;
    }
    if (state === "block-all") {
      return lazy.SitePermissions.AUTOPLAY_BLOCKED_ALL;
    }
    return undefined;
  }
  if (state === "block") {
    return lazy.SitePermissions.BLOCK;
  }
  return undefined;
}

// The read half: an upstream capability back to the panel's state name. A
// capability this table does not name reads as "default".
function webTabPermissionStateName(id, capability) {
  if (capability === lazy.SitePermissions.ALLOW) {
    return "allow";
  }
  if (id === "autoplay-media") {
    if (capability === lazy.SitePermissions.BLOCK) {
      return "block-audible";
    }
    if (capability === lazy.SitePermissions.AUTOPLAY_BLOCKED_ALL) {
      return "block-all";
    }
    return "default";
  }
  return capability === lazy.SitePermissions.BLOCK ? "block" : "default";
}

// Phase 31 plan 02 (review fix, TOCTOU): only a web page's content principal
// (http or https) takes a permission write. isContentPrincipal and scheme are
// nsIPrincipal attributes (upstream/caps/nsIPrincipal.idl:607, :377).
function webTabPermissionPrincipalOk(principal) {
  return !!principal && principal.isContentPrincipal === true && (principal.scheme === "http" || principal.scheme === "https");
}

// The origin the panel displays and echoes back on a write; null for any
// principal a write would refuse.
function webTabPermissionOrigin(browser) {
  const principal = browser.contentPrincipal;
  return webTabPermissionPrincipalOk(principal) ? principal.origin : null;
}

// One row per managed permission, in table order. `state` is the EFFECTIVE
// state on this overlay's own principal, read as upstream's panel reads it:
// getForPrincipal falls back to getDefault for an absent entry
// (SitePermissions.sys.mjs:461-462), so autoplay-media under the shipped
// media.autoplay.default=BLOCKED reads block-audible. `stored` is the state
// that is actually saved, which is "default" whenever the effective state
// equals the default: upstream never saves a default-equal entry
// (SitePermissions.sys.mjs:575-580), and the panel's cycle and the identity
// box's icons key on `stored`. `label` is the upstream label
// (getPermissionLabel), so no permission name is kept by hand.
function webTabPermissionRows(browser) {
  const principal = browser.contentPrincipal;
  return SITE_INFO_PERMISSION_IDS.map(id => {
    let effective = null;
    let defaultCapability = null;
    try {
      effective = lazy.SitePermissions.getForPrincipal(principal, id, browser).state;
    } catch (err) {
      effective = null;
    }
    try {
      defaultCapability = lazy.SitePermissions.getDefault(id);
    } catch (err) {
      defaultCapability = null;
    }
    let label = null;
    try {
      label = lazy.SitePermissions.getPermissionLabel(id);
    } catch (err) {
      label = null;
    }
    const state = effective === null ? "default" : webTabPermissionStateName(id, effective);
    return {
      id,
      state,
      stored: effective === null || effective === defaultCapability ? "default" : state,
      // WR-05: the name the default reads as, so the panel's cycle can skip a step that
      // would not change the effective state (popup defaults to block; "default" is then block).
      defaultState: webTabPermissionStateName(id, defaultCapability),
      label: typeof label === "string" && label ? label : null,
    };
  });
}

async function handleWebTabAction(data, actorRef) {
  if (!groupSenderIsTheia(actorRef)) {
    return { ok: false, reason: "validation", message: "handleWebTabAction: rejecting non-Theia-origin sender" };
  }
  const kind = data?.kind;
  switch (kind) {
    case "webTabStop": {
      if (!webTabIdIsValid(data.tabId)) {
        return { ok: false, reason: "validation", message: "handleWebTabAction: refusing malformed tabId" };
      }
      const entry = webTabs.get(data.tabId);
      if (!entry) {
        return { ok: true, kind, where: "unknown-tab" };
      }
      entry.browser.stop();
      return { ok: true, kind, where: "done" };
    }
    // NAV-03: the tab's session history in Firefox's FillHistoryMenu window
    // (browser.js: at most 15 entries around the current one). The reply is
    // this request's own actor response, primitives only; nothing is logged.
    // browsingContext.sessionHistory, never browser.sessionHistory: that
    // getter throws for a remote browser (RemoteWebNavigation).
    case "webTabHistory": {
      if (!webTabIdIsValid(data.tabId)) {
        return { ok: false, reason: "validation", message: "handleWebTabAction: refusing malformed tabId" };
      }
      const entry = webTabs.get(data.tabId);
      if (!entry) {
        return { ok: true, kind, where: "unknown-tab" };
      }
      const sh = entry.browser.browsingContext?.sessionHistory;
      if (!sh || sh.count === 0) {
        return { ok: true, kind, where: "empty", index: -1, entries: [] };
      }
      const max = 15;
      const half = Math.floor(max / 2);
      const index = sh.index;
      let start = Math.max(index - half, 0);
      const end = Math.min(start === 0 ? max : index + half + 1, sh.count);
      if (end === sh.count) {
        start = Math.max(sh.count - max, 0);
      }
      const entries = [];
      for (let i = start; i < end; i++) {
        const e = sh.getEntryAtIndex(i);
        entries.push({ index: i, title: String(e.title || ""), url: webTabPushedSpec(String(e.URI?.spec || "")) });
      }
      return { ok: true, kind, where: "done", index, entries };
    }
    case "webTabGotoIndex": {
      if (!webTabIdIsValid(data.tabId)) {
        return { ok: false, reason: "validation", message: "handleWebTabAction: refusing malformed tabId" };
      }
      const entry = webTabs.get(data.tabId);
      if (!entry) {
        return { ok: true, kind, where: "unknown-tab" };
      }
      const sh = entry.browser.browsingContext?.sessionHistory;
      if (!Number.isInteger(data.index) || !sh || data.index < 0 || data.index >= sh.count) {
        return { ok: false, reason: "validation", message: "handleWebTabAction: refusing an out-of-range history index" };
      }
      entry.browser.gotoIndex(data.index);
      return { ok: true, kind, where: "done" };
    }
    // The selected web tab of this Theia frame (null: a non-web widget is
    // current). Keyed by the sender's own embedder element, never by an id
    // the frame supplies, so a frame can only name its own selection.
    case "webTabActivated": {
      if (data.tabId !== null && !webTabIdIsValid(data.tabId)) {
        return { ok: false, reason: "validation", message: "handleWebTabAction: refusing malformed tabId" };
      }
      activeTabByFrame.set(actorRef.browsingContext.top.embedderElement, data.tabId);
      // A null (the IDE has focus) changes no selection: D-04, the last web tab stays active.
      if (data.tabId !== null) {
        tabHostSelectById(actorRef.browsingContext.top.embedderElement, data.tabId);
      }
      return { ok: true, kind, where: "applied" };
    }
    // Phase 31 (SITE-04..06, D-31-05/D-31-06): this tab's site information
    // for the panel shell. tabId only: the principal, the cert, the
    // permissions, the site-data probe and the shield state all derive from
    // the overlay chrome already holds -- never from a sender field, so a
    // frame can only read its own tab's site. Primitives only, like the
    // history arm above. The writes are the webTabSetPermission arm below.
    case "webTabSiteInfo": {
      if (!webTabIdIsValid(data.tabId)) {
        return { ok: false, reason: "validation", message: "handleWebTabAction: refusing malformed tabId" };
      }
      const entry = webTabs.get(data.tabId);
      if (!entry) {
        return { ok: true, kind, where: "unknown-tab" };
      }
      return { ok: true, kind, where: "done", ...(await PowerBrowserAPI.webTabSiteInfo(entry.browser)) };
    }
    // Phase 31 plan 02 (D-31-05/D-31-06, SITE-04): one managed permission on
    // this tab's own principal. A permission change is privileged (it changes
    // site state, not navigation), so the frontend sends it only from the
    // panel's row handler. The write lands only when the tab still shows the
    // origin the panel displayed (`data.origin` is compared, never used as a
    // key), and only for a web page; otherwise nothing is written. The reply
    // carries the refreshed rows, so the panel re-renders from it.
    case "webTabSetPermission": {
      if (!webTabIdIsValid(data.tabId)) {
        return { ok: false, reason: "validation", message: "handleWebTabAction: refusing malformed tabId" };
      }
      const capability = SITE_INFO_PERMISSION_IDS.includes(data.id) ? webTabPermissionCapability(data.id, data.state) : undefined;
      if (capability === undefined || typeof data.origin !== "string") {
        return { ok: false, reason: "validation", message: "handleWebTabAction: refusing an unknown permission id, state or origin" };
      }
      const entry = webTabs.get(data.tabId);
      if (!entry) {
        return { ok: true, kind, where: "unknown-tab" };
      }
      const principal = entry.browser.contentPrincipal;
      if (!webTabPermissionPrincipalOk(principal) || principal.origin !== data.origin) {
        // Logged without the URL or the origin: the kind and the reason only.
        PowerBrowserAPI.log("warn", "[web-tab] permission write refused: the tab is no longer on the shown web page");
        return { ok: false, reason: "site-changed", message: "handleWebTabAction: the tab is no longer on the site the panel showed" };
      }
      try {
        // The browser argument also clears the tab-scoped temporary state for
        // this id (SitePermissions.sys.mjs:631-644, removeFromPrincipalForBrowser);
        // upstream's panel revokes the same way (browser-sitePermissionPanel.js:949-957).
        // A persistent value is then written on the same principal.
        lazy.SitePermissions.removeFromPrincipal(principal, data.id, entry.browser);
        if (capability !== null) {
          lazy.SitePermissions.setForPrincipal(principal, data.id, capability);
        }
      } catch (err) {
        // O-31-B: a fixed string; err.message is never logged here (SitePermissions texts are fixed, but nothing guarantees it).
        PowerBrowserAPI.log("error", "[web-tab] permission write failed");
        return { ok: false, reason: "write-failed", message: "handleWebTabAction: the permission write failed" };
      }
      return { ok: true, kind, where: "applied", permissions: webTabPermissionRows(entry.browser) };
    }
    // Phase 31 plan 03 (SITE-07, D-31-12, T-31-03): this tab's site data. A
    // privileged write, so it takes the same origin echo as the permission
    // write above, and the host is the overlay's own principal's, never a
    // sender field. The token-cookie exemption lives in webTabClearSiteData.
    case "webTabClearSiteData": {
      if (!webTabIdIsValid(data.tabId) || typeof data.origin !== "string") {
        return { ok: false, reason: "validation", message: "handleWebTabAction: refusing a malformed tabId or origin" };
      }
      const entry = webTabs.get(data.tabId);
      if (!entry) {
        return { ok: true, kind, where: "unknown-tab" };
      }
      const principal = entry.browser.contentPrincipal;
      if (!webTabPermissionPrincipalOk(principal) || principal.origin !== data.origin) {
        PowerBrowserAPI.log("warn", "[web-tab] site-data clear refused: the tab is no longer on the shown web page");
        return { ok: false, reason: "site-changed", message: "handleWebTabAction: the tab is no longer on the site the panel showed" };
      }
      try {
        const outcome = await webTabClearSiteData(entry.browser, principal);
        if (outcome !== "cleared") {
          PowerBrowserAPI.log("error", `[web-tab] site-data clear refused: ${outcome}`);
          return { ok: false, reason: outcome, message: "handleWebTabAction: the site data clear did not complete" };
        }
        // WR-06: cookies and storage are already gone here. A tab-store failure is logged and
        // does not turn the reply into "write-failed" (the UI would then offer a retry that clears nothing).
        try {
          await purgeSiteTabRows(webTabSite(principal));
        } catch (err) {
          PowerBrowserAPI.log("error", "[web-tab] site-data clear: the tab-store rows were not purged");
        }
        return { ok: true, kind, where: "cleared", hasData: await webTabSiteHasData(principal.asciiHost) };
      } catch (err) {
        PowerBrowserAPI.log("error", "[web-tab] site-data clear failed");
        return { ok: false, reason: "write-failed", message: "handleWebTabAction: the site data clear failed" };
      }
    }
    // Phase 31 plan 03 (SITE-08, D-31-06, T-31-04): this site's tracking
    // protection exception, on the overlay's own content principal (the same
    // origin echo as above). The exception is browser-scoped, so it can only
    // reach the tab the panel showed. Upstream reloads the tab after the
    // change (browser-siteProtections.js:2687-2691, browser-trustPanel.js:853-857),
    // so the reload is part of the write.
    case "webTabShieldToggle": {
      if (!webTabIdIsValid(data.tabId) || typeof data.origin !== "string" || typeof data.except !== "boolean") {
        return { ok: false, reason: "validation", message: "handleWebTabAction: refusing a malformed tabId, origin or except flag" };
      }
      const entry = webTabs.get(data.tabId);
      if (!entry) {
        return { ok: true, kind, where: "unknown-tab" };
      }
      const principal = entry.browser.contentPrincipal;
      if (!webTabPermissionPrincipalOk(principal) || principal.origin !== data.origin) {
        PowerBrowserAPI.log("warn", "[web-tab] shield change refused: the tab is no longer on the shown web page");
        return { ok: false, reason: "site-changed", message: "handleWebTabAction: the tab is no longer on the site the panel showed" };
      }
      try {
        if (data.except) {
          lazy.ContentBlockingAllowList.add(entry.browser);
        } else {
          lazy.ContentBlockingAllowList.remove(entry.browser);
        }
      } catch (err) {
        PowerBrowserAPI.log("error", "[web-tab] shield change failed");
        return { ok: false, reason: "write-failed", message: "handleWebTabAction: the shield change failed" };
      }
      entry.browser.reload();
      return { ok: true, kind, where: "applied", excepted: webTabShieldExcepted(entry.browser) };
    }
    // Page tools (32-01, PAGE-01): find runs the overlay's own Finder. The query is a
    // string of at most 1024 characters and is never echoed in a refusal or a log line.
    // Counts and status arrive in the state push, not in this reply.
    case "webTabFind": {
      if (!webTabIdIsValid(data.tabId)) {
        return { ok: false, reason: "validation", message: "handleWebTabAction: refusing malformed tabId" };
      }
      const entry = webTabs.get(data.tabId);
      if (!entry) {
        return { ok: true, kind, where: "unknown-tab" };
      }
      if (typeof data.query !== "string" || data.query.length === 0 || data.query.length > WEB_TAB_FIND_QUERY_MAX) {
        return { ok: false, reason: "validation", message: "handleWebTabAction: refusing a find query that is empty or longer than 1024 characters" };
      }
      const finder = ensureWebTabFinderListener(entry.browser);
      if (!finder) {
        return { ok: false, reason: "unavailable", message: "handleWebTabAction: the page has no find engine yet" };
      }
      webTabPageStateOf(entry.browser).findQuery = data.query;
      finder.caseSensitive = data.caseSensitive === true;
      finder.entireWord = data.entireWord === true;
      finder.onFindbarOpen();
      finder.fastFind(data.query, false, false);
      // A remote finder (FinderParent) counts matches only when asked; the findbar asks, and so does this arm.
      finder.requestMatchesCount(data.query, { linksOnly: false });
      if (data.highlightAll === true) {
        finder.highlight(true, data.query, false);
      }
      return { ok: true, kind, where: "done" };
    }
    case "webTabFindNext": {
      if (!webTabIdIsValid(data.tabId)) {
        return { ok: false, reason: "validation", message: "handleWebTabAction: refusing malformed tabId" };
      }
      const entry = webTabs.get(data.tabId);
      if (!entry) {
        return { ok: true, kind, where: "unknown-tab" };
      }
      const finder = ensureWebTabFinderListener(entry.browser);
      const query = webTabPageStateOf(entry.browser).findQuery;
      if (!finder || query === null) {
        return { ok: true, kind, where: "no-query" };
      }
      finder.findAgain(query, data.backwards === true, false, false);
      finder.requestMatchesCount(query, { linksOnly: false });
      return { ok: true, kind, where: "done" };
    }
    case "webTabFindClose": {
      if (!webTabIdIsValid(data.tabId)) {
        return { ok: false, reason: "validation", message: "handleWebTabAction: refusing malformed tabId" };
      }
      const entry = webTabs.get(data.tabId);
      if (!entry) {
        return { ok: true, kind, where: "unknown-tab" };
      }
      const finder = entry.browser.finder;
      if (finder) {
        finder.removeSelection(false);
        finder.onFindbarClose();
      }
      resetWebTabFind(entry.browser);
      webTabPagePush(entry.browser);
      return { ok: true, kind, where: "done" };
    }
    // Page tools (32-01, PAGE-02): zoom steps the overlay's fullZoom along the live
    // toolkit.zoomManager.zoomValues ladder; Reset sets 1. No pref is written and no
    // browser-fullZoom script is loaded (D-07): the step is chrome-side arithmetic.
    case "webTabZoomIn": {
      if (!webTabIdIsValid(data.tabId)) {
        return { ok: false, reason: "validation", message: "handleWebTabAction: refusing malformed tabId" };
      }
      return webTabZoomReply(kind, data.tabId, 1);
    }
    case "webTabZoomOut": {
      if (!webTabIdIsValid(data.tabId)) {
        return { ok: false, reason: "validation", message: "handleWebTabAction: refusing malformed tabId" };
      }
      return webTabZoomReply(kind, data.tabId, -1);
    }
    case "webTabZoomReset": {
      if (!webTabIdIsValid(data.tabId)) {
        return { ok: false, reason: "validation", message: "handleWebTabAction: refusing malformed tabId" };
      }
      return webTabZoomReply(kind, data.tabId, 0);
    }
    // Page tools (32-01, PAGE-05): mute is an explicit boolean, never a toggle. The overlay's own
    // mute()/unmute() notify the media context; the reply reads audioMuted back.
    case "webTabMute": {
      if (!webTabIdIsValid(data.tabId)) {
        return { ok: false, reason: "validation", message: "handleWebTabAction: refusing malformed tabId" };
      }
      if (typeof data.muted !== "boolean") {
        return { ok: false, reason: "validation", message: "handleWebTabAction: refusing a mute flag that is not a boolean" };
      }
      const entry = webTabs.get(data.tabId);
      if (!entry) {
        return { ok: true, kind, where: "unknown-tab" };
      }
      try {
        tabHostSetMuted(entry.browser, data.muted, null);
      } catch {
        PowerBrowserAPI.log("error", "[web-tab] mute change failed");
        return { ok: false, reason: "write-failed", message: "handleWebTabAction: the mute change failed" };
      }
      return { ok: true, kind, where: "applied", audioMuted: entry.browser.audioMuted === true };
    }
    // Page tools (32-04, PAGE-06): the Downloads view. The subscribe installs the one chrome-side
    // view (idempotent) and makes the sending frame the push target. The action runs chrome-side
    // on the row id this file assigned; the frame never names a path.
    case "webTabDownloadsSubscribe": {
      if (!webTabIdIsValid(data.tabId)) {
        return { ok: false, reason: "validation", message: "handleWebTabAction: refusing malformed tabId" };
      }
      try {
        await webTabDownloadsSubscribe(actorRef.browsingContext.top.embedderElement);
      } catch {
        PowerBrowserAPI.log("error", "[downloads] the view install failed");
        return { ok: false, reason: "unavailable", message: "handleWebTabAction: the downloads list is not available" };
      }
      return { ok: true, kind, where: "subscribed" };
    }
    case "webTabDownloadsAction": {
      if (!webTabIdIsValid(data.tabId)) {
        return { ok: false, reason: "validation", message: "handleWebTabAction: refusing malformed tabId" };
      }
      if (!Number.isInteger(data.id) || !WEB_TAB_DOWNLOAD_ACTIONS.includes(data.action)) {
        return { ok: false, reason: "validation", message: "handleWebTabAction: refusing a download id that is not an integer, or an action outside the set" };
      }
      return { ok: true, kind, where: await webTabDownloadAction(data.id, data.action) };
    }
    // Page tools (32-03, PAGE-03): the system-dialog branch only. Options are booleans; no URL or pref comes in.
    case "webTabPrint": {
      if (!webTabIdIsValid(data.tabId)) {
        return { ok: false, reason: "validation", message: "handleWebTabAction: refusing malformed tabId" };
      }
      if (data.selectionOnly !== undefined && typeof data.selectionOnly !== "boolean") {
        return { ok: false, reason: "validation", message: "handleWebTabAction: refusing a print option that is not a boolean" };
      }
      return webTabPrintReply(kind, data.tabId, data.selectionOnly === true);
    }
    // Page save (32-05, PAGE-08): picker-split. Pick proposes a file name and writes nothing; export mints the copy
    // through savePageCopy and copies it to the destination the Theia dialog picked.
    case "webTabSavePick": {
      if (!webTabIdIsValid(data.tabId)) {
        return { ok: false, reason: "validation", message: "handleWebTabAction: refusing malformed tabId" };
      }
      return webTabSavePickReply(kind, data.tabId);
    }
    case "webTabSaveExport": {
      if (!webTabIdIsValid(data.tabId)) {
        return { ok: false, reason: "validation", message: "handleWebTabAction: refusing malformed tabId" };
      }
      if (!webTabSaveDestinationIsValid(data.path)) {
        return { ok: false, reason: "validation", message: "handleWebTabAction: refusing a destination that is not an absolute .html or .htm path of at most 4096 characters" };
      }
      return webTabSaveExportReply(kind, data.tabId, data.path);
    }
    // Page tools (32-06, PAGE-09): the frozen edit set. Keys stay content-native and never reach this arm;
    // only a Theia-initiated Edit item sends it. checkOnly reads enablement and runs nothing.
    case "webTabEdit": {
      if (!webTabIdIsValid(data.tabId)) {
        return { ok: false, reason: "validation", message: "handleWebTabAction: refusing malformed tabId" };
      }
      if (!WEB_TAB_EDIT_CMDS.includes(data.cmd)) {
        return { ok: false, reason: "validation", message: "handleWebTabAction: refusing an edit command outside the frozen set" };
      }
      if (data.checkOnly !== undefined && typeof data.checkOnly !== "boolean") {
        return { ok: false, reason: "validation", message: "handleWebTabAction: refusing a check flag that is not a boolean" };
      }
      return webTabEditReply(kind, data.tabId, data.cmd, data.checkOnly === true);
    }
    case "webTabReader": {
      if (!webTabIdIsValid(data.tabId)) {
        return { ok: false, reason: "validation", message: "handleWebTabAction: refusing malformed tabId" };
      }
      if (typeof data.enter !== "boolean") {
        return { ok: false, reason: "validation", message: "handleWebTabAction: refusing a reader flag that is not a boolean" };
      }
      return webTabReaderReply(kind, data.tabId, data.enter);
    }
    case "webTabViewSource": {
      if (!webTabIdIsValid(data.tabId)) {
        return { ok: false, reason: "validation", message: "handleWebTabAction: refusing malformed tabId" };
      }
      if (data.inNewTab !== undefined && typeof data.inNewTab !== "boolean") {
        return { ok: false, reason: "validation", message: "handleWebTabAction: refusing a new-tab flag that is not a boolean" };
      }
      return webTabViewSourceReply(kind, data.tabId, data.inNewTab === true);
    }
    case "webTabDevtools": {
      if (!webTabIdIsValid(data.tabId)) {
        return { ok: false, reason: "validation", message: "handleWebTabAction: refusing malformed tabId" };
      }
      return webTabDevtoolsReply(kind, data.tabId);
    }
    default:
      return { ok: false, reason: "validation", message: "handleWebTabAction: unknown kind" };
  }
}

// One push name, many kinds; the frontend's WebTabChannel.onPush routes them.
// The log line names the kind and the error only, never a URL or a title.
function sendWebTabPush(theiaBrowser, payload) {
  try {
    theiaBrowser.browsingContext.currentWindowGlobal
      .getActor(GROUP_ACTOR_NAME)
      .sendAsyncMessage("PowerBrowserWebTabState", payload);
  } catch (err) {
    PowerBrowserAPI.log("error", `[web-tab] ${payload.kind} push failed: ${err && err.message ? err.message : err}`);
  }
}

// The frontend tab id of an overlay <browser>, or null for anything else
// (the Theia frame, a chrome button, nothing).
function tabIdOfBrowser(element) {
  if (!element) {
    return null;
  }
  for (const [tabId, entry] of webTabs) {
    if (entry.browser === element) {
      return tabId;
    }
  }
  return null;
}

// Last pageFocus tab id pushed per Theia frame, with the frontend
// WindowGlobal it went to, so a focus/blur pair that lands on the same answer
// sends one push, not two, and a reloaded frontend never inherits the answer
// its predecessor was sent.
const lastPageFocusByFrame = new WeakMap();

// The selected web tab per Theia frame <browser>, from webTabActivated.
const activeTabByFrame = new WeakMap();

// The state-push coalescer: one pending record per tab (latest call wins),
// flushed once per animation frame of the shell window. The flush reads
// URL, title and history flags live (webTabPush) and skips a tab whose
// overlay is gone or was replaced. ownerDocument, not ownerGlobal: see the
// store section's note.
const pendingStatesByWindow = new WeakMap();

// Overlays mid browsing-context switch. A switch (a process change, or the
// BFCache keeping the old page) rebuilds the <browser>'s web navigation
// (browser-custom-element.mjs finishChangeRemoteness), which then reads
// about:blank until the new page's location change. Pushing that placeholder
// told the frontend the tab had no page: it hid the overlay for a frame, and
// a hidden overlay drops chrome's focus (the focus fixup rule) and refuses a
// new one. So nothing is pushed from DidChangeBrowserRemoteness until a
// top-level location change or network stop settles the tab (`settled`).
const switchingOverlays = new WeakSet();

function scheduleWebTabState(frame, tabId, browser, loading, settled = false) {
  if (settled) {
    switchingOverlays.delete(browser);
  }
  const win = frame.ownerDocument.defaultView;
  let pending = pendingStatesByWindow.get(win);
  if (!pending) {
    pending = new Map();
    pendingStatesByWindow.set(win, pending);
    win.requestAnimationFrame(() => {
      pendingStatesByWindow.delete(win);
      for (const [id, rec] of pending) {
        if (webTabs.get(id)?.browser === rec.browser && !switchingOverlays.has(rec.browser)) {
          PowerBrowserAPI.webTabPush(rec.theiaBrowser, id, rec.browser, rec.loading);
        }
      }
    });
  }
  pending.set(tabId, { theiaBrowser: frame, browser, loading });
}

// ---------------------------------------------------------------------------
// Phase 32 page tools (32-01): the find and zoom state of one overlay, and
// the Finder listener that feeds it. Module-level, not on the frozen API
// object: the object cannot take members after it is frozen. Per-overlay
// values live in a WeakMap keyed by the <browser>, so they go with it. Nothing
// here logs a query, a URL or a title; the query is kept in memory only.
// ---------------------------------------------------------------------------

const WEB_TAB_FIND_QUERY_MAX = 1024;
const WEB_TAB_ZOOM_PREF = "toolkit.zoomManager.zoomValues";
const webTabPageState = new WeakMap();

function webTabPageStateOf(browser) {
  let state = webTabPageState.get(browser);
  if (!state) {
    state = { frame: null, tabId: null, findListener: null, findOn: null, findQuery: null, findCurrent: 0, findTotal: 0, findStatus: null, crashed: false, isArticle: false };
    webTabPageState.set(browser, state);
  }
  return state;
}

// The Finder listener goes on the overlay's current finder. A remote browser's
// finder is created on first read and a remoteness switch can replace it, so
// the attachment is checked again on every find rather than trusted from
// creation. Returns the finder, or null while the overlay has none.
function ensureWebTabFinderListener(browser) {
  const finder = browser.finder ?? null;
  const state = webTabPageStateOf(browser);
  if (!finder || state.findOn === finder) {
    return finder;
  }
  if (!state.findListener) {
    state.findListener = {
      onFindResult(response) {
        state.findStatus = webTabFindStatusOf(response.result);
        webTabPagePush(browser);
      },
      onMatchesCountResult(response) {
        state.findCurrent = response.current;
        state.findTotal = response.total;
        webTabPagePush(browser);
      },
    };
  }
  finder.addResultListener(state.findListener);
  state.findOn = finder;
  return finder;
}

function attachWebTabPageListeners(frame, tabId, browser) {
  const state = webTabPageStateOf(browser);
  state.frame = frame;
  state.tabId = tabId;
  ensureWebTabFinderListener(browser);
  // PAGE-05: upstream's audioPlaybackStarted() returns while the overlay is muted, so a muted tab never
  // reports sound playing; Stopped always fires. soundPlaying is therefore event-driven, as stock tabs' is.
  state.audioStarted = () => {
    state.soundPlaying = true;
    tabHostSetSoundPlaying(browser, true);
    webTabPagePush(browser);
  };
  state.audioStopped = () => {
    state.soundPlaying = false;
    tabHostSetSoundPlaying(browser, false);
    webTabPagePush(browser);
  };
  browser.addEventListener("DOMAudioPlaybackStarted", state.audioStarted);
  browser.addEventListener("DOMAudioPlaybackStopped", state.audioStopped);
  // Phase 32 plan 07 (PAGE-11): one listener per overlay. It fires on the element itself, so no gBrowser is needed. docShell is
  // never read here: it is null on a crashed remote overlay. The contracted crash UI is Theia's (plan 32-08).
  state.crashedListener = () => {
    state.crashed = true;
    webTabPagePush(browser);
  };
  browser.addEventListener("oop-browser-crashed", state.crashedListener);
  // PAGE-10: AboutReaderParent sets `browser.isArticle` on the overlay (the embedder) when the page's readability result
  // arrives. Its follow-up button update throws in this shell (no #reader-mode-button), so that result is read here, as
  // an own accessor on the overlay, and pushed with the state.
  Object.defineProperty(browser, "isArticle", {
    configurable: true,
    get: () => state.isArticle,
    set: value => {
      const next = value === true;
      if (next !== state.isArticle) {
        state.isArticle = next;
        webTabPagePush(browser);
      }
    },
  });
}

function detachWebTabPageListeners(browser) {
  const state = webTabPageState.get(browser);
  if (!state) {
    return;
  }
  try {
    state.findOn?.removeResultListener(state.findListener);
  } catch {
    // best-effort: the overlay is closing and its finder goes with it
  }
  browser.removeEventListener("DOMAudioPlaybackStarted", state.audioStarted);
  browser.removeEventListener("DOMAudioPlaybackStopped", state.audioStopped);
  browser.removeEventListener("oop-browser-crashed", state.crashedListener);
  delete browser.isArticle;
  state.frame = null;
  state.findOn = null;
}

// The nsITypeAheadFind result codes are the ones upstream's FinderParent compares against (FinderParent.sys.mjs:340-402).
function webTabFindStatusOf(result) {
  if (result === Ci.nsITypeAheadFind.FIND_NOTFOUND) {
    return "notFound";
  }
  return result === Ci.nsITypeAheadFind.FIND_WRAPPED ? "wrapped" : "found";
}

function resetWebTabFind(browser) {
  const state = webTabPageState.get(browser);
  if (state) {
    state.findCurrent = 0;
    state.findTotal = 0;
    state.findStatus = null;
    state.findQuery = null;
  }
}

// The overlay's page-tools fields for the state push, primitives only.
function webTabPageFields(browser) {
  const state = webTabPageStateOf(browser);
  let zoom = 1;
  try {
    zoom = browser.fullZoom;
  } catch {
    zoom = 1;
  }
  return {
    zoom,
    findCurrent: state.findCurrent,
    findTotal: state.findTotal,
    findStatus: state.findStatus,
    audioMuted: browser.audioMuted === true,
    soundPlaying: state.soundPlaying,
    favicon: webTabFaviconOf(browser),
    crashed: state.crashed === true,
    isReaderMode: webTabIsReaderUrl(browser),
    isArticle: state.isArticle === true,
  };
}

// A new page starts with no find state and no sound: the previous page's media went with it.
function resetWebTabPage(browser) {
  resetWebTabFind(browser);
  const state = webTabPageState.get(browser);
  if (state) {
    state.soundPlaying = false;
    state.crashed = false;
    state.isArticle = false;
    tabHostSetSoundPlaying(browser, false);
  }
}

// A state push for an overlay whose page-tools fields just changed; the
// coalescer sends it on the next frame, like every other state push.
function webTabPagePush(browser) {
  const state = webTabPageState.get(browser);
  if (state?.frame) {
    scheduleWebTabState(state.frame, state.tabId, browser, browser.webProgress.isLoadingDocument);
  }
}

// The step ladder is the upstream zoom list, read live. Ascending, positive values only.
function webTabZoomLadder() {
  return PowerBrowserAPI.getStringPref(WEB_TAB_ZOOM_PREF, "")
    .split(",")
    .map(parseFloat)
    .filter(value => Number.isFinite(value) && value > 0)
    .sort((a, b) => a - b);
}

// step: +1 zooms in one rung, -1 out one rung (the rung nearest the current zoom, clamped to the ladder), 0 resets to 1.
function webTabZoomReply(kind, tabId, step) {
  const entry = webTabs.get(tabId);
  if (!entry) {
    return { ok: true, kind, where: "unknown-tab" };
  }
  const browser = entry.browser;
  if (step === 0) {
    browser.fullZoom = 1;
  } else {
    const ladder = webTabZoomLadder();
    if (ladder.length > 0) {
      const current = browser.fullZoom;
      let nearest = 0;
      ladder.forEach((value, i) => {
        if (Math.abs(value - current) < Math.abs(ladder[nearest] - current)) {
          nearest = i;
        }
      });
      browser.fullZoom = ladder[Math.min(ladder.length - 1, Math.max(0, nearest + step))];
    }
  }
  webTabPagePush(browser);
  return { ok: true, kind, where: "applied", zoom: browser.fullZoom };
}

// Page tools (32-03, PAGE-03): the system-dialog branch of printUtils.js (startPrintWindow :230-333,
// getPrintSettings :485-530, handleSystemPrintDialog :542-567), reproduced here because printUtils.js is never
// loaded. The tab-modal preview (getTabDialogBox, _openTabModalPrint) is never built (D-08), and no
// nsIBrowserDOMWindow shim is added (D-09a): the shell window has none.
async function webTabPrintReply(kind, tabId, selectionOnly) {
  const entry = webTabs.get(tabId);
  if (!entry) {
    return { ok: true, kind, where: "unknown-tab" };
  }
  let target = entry.browser.browsingContext;
  if (selectionOnly) {
    const focused = Services.focus.focusedContentBrowsingContext;
    if (focused && focused.top.embedderElement === target.top.embedderElement) {
      target = focused;
    }
  }
  const printSvc = Cc["@mozilla.org/gfx/printsettings-service;1"].getService(Ci.nsIPrintSettingsService);
  const SAVE_TO_PDF = "Mozilla Save to PDF";
  let settings = null;
  try {
    const lastUsed = printSvc.lastUsedPrinterName;
    const printerName = lastUsed && lastUsed !== SAVE_TO_PDF
      ? lastUsed
      : Cc["@mozilla.org/gfx/printerlist;1"].getService(Ci.nsIPrinterList).systemDefaultPrinterName;
    settings = printSvc.createNewPrintSettings();
    settings.printerName = printerName;
    if (printerName !== SAVE_TO_PDF) {
      printSvc.initPrintSettingsFromPrinter(printerName, settings);
    }
    printSvc.initPrintSettingsFromPrefs(settings, true, Ci.nsIPrintSettings.kInitSaveAll);
  } catch {
    PowerBrowserAPI.log("error", "[print] the print settings could not be read");
    return { ok: false, reason: "unavailable", message: "handleWebTabAction: the print settings are not available" };
  }
  settings.printSelectionOnly = selectionOnly;
  const hasSelection = await webTabPrintHasSelection(target);
  try {
    await Cc["@mozilla.org/widget/printdialog-service;1"].getService(Ci.nsIPrintDialogService)
      .showPrintDialog(target.topChromeWindow, hasSelection, settings);
  } catch (err) {
    if (err?.result === Cr.NS_ERROR_ABORT) {
      return { ok: true, kind, where: "cancelled", cancelled: true };
    }
    PowerBrowserAPI.log("error", "[print] the print dialog failed");
    return { ok: false, reason: "unavailable", message: "handleWebTabAction: the print dialog did not open" };
  }
  printSvc.maybeSaveLastUsedPrinterNameToPrefs(settings.printerName);
  printSvc.maybeSavePrintSettingsToPrefs(settings, Ci.nsIPrintSettings.kPrintDialogPersistSettings);
  target.print(settings).catch(() => PowerBrowserAPI.log("error", "[print] the print job failed"));
  return { ok: true, kind, where: "printed", cancelled: false };
}

// The selection flag the dialog shows; a missing PrintingSelection actor reads as no selection (printUtils.js:68-78).
async function webTabPrintHasSelection(browsingContext) {
  try {
    return await browsingContext.currentWindowGlobal.getActor("PrintingSelection").sendQuery("PrintingSelection:HasSelection", {});
  } catch {
    return false;
  }
}

// Page save (32-05, PAGE-08). savePageCopy stays the only writer of page bytes (into saved-pages/<stamp>-<rand>/);
// the export copies that minted page.html and page_files to the picked path. Both kinds re-check the tab, the scheme
// and privacy, because the pick and the export are separate messages. The path is data: it is validated and written
// to, never executed.
const WEB_TAB_SAVE_PATH_MAX = 4096;

// The refusals both save kinds share: a private tab, and a page that is not http or https.
function webTabSaveRefusal(browser) {
  if (lazy.PrivateBrowsingUtils.isBrowserPrivate(browser)) {
    return "private";
  }
  const url = browser.currentURI ? browser.currentURI.spec : "";
  return /^https?:\/\//.test(url) ? null : "scheme";
}

// The proposed file name: the page title without path or control characters, bounded, and never empty.
function webTabSaveSuggestedName(title) {
  const stem = String(title || "").replace(/[\\/:*?"<>|]|[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
  return `${stem || "page"}.html`;
}

// An absolute, bounded path with no NUL and an .html or .htm name: the only destinations an export writes.
function webTabSaveDestinationIsValid(path) {
  return typeof path === "string" && path.length > 0 && path.length <= WEB_TAB_SAVE_PATH_MAX
    && !path.includes("\u0000") && PathUtils.isAbsolute(path) && /\.html?$/i.test(path);
}

function webTabSavePickReply(kind, tabId) {
  const entry = webTabs.get(tabId);
  if (!entry) {
    return { ok: true, kind, where: "unknown-tab" };
  }
  if (webTabSaveRefusal(entry.browser)) {
    return { ok: false, reason: "unavailable", message: "handleWebTabAction: this page cannot be saved (private, or not http or https)" };
  }
  return { ok: true, kind, where: "ready", suggestedName: webTabSaveSuggestedName(entry.browser.contentTitle) };
}

async function webTabSaveExportReply(kind, tabId, path) {
  const entry = webTabs.get(tabId);
  if (!entry) {
    return { ok: true, kind, where: "unknown-tab" };
  }
  if (webTabSaveRefusal(entry.browser)) {
    return { ok: false, reason: "unavailable", message: "handleWebTabAction: this page cannot be saved (private, or not http or https)" };
  }
  // savePageCopy copies the first browser that carries this uri; a second tab on the same uri must refuse, not save the wrong page.
  if (PowerBrowserAPI.findTabBrowserForUri(entry.uri)?.browser !== entry.browser) {
    return { ok: false, reason: "unavailable", message: "handleWebTabAction: another tab shares this page's address, so it cannot be saved safely" };
  }
  try {
    const { dir, bytes } = await savePageCopy(entry.uri);
    await webTabSaveCopyOut(dir, path);
    return { ok: true, kind, where: "exported", bytes };
  } catch {
    PowerBrowserAPI.log("error", "[save] the page copy failed");
    return { ok: false, reason: "write-failed", message: "handleWebTabAction: the page save failed" };
  }
}

// The minted page links its files as page_files/, so the copy names its files folder after the picked stem and
// rewrites the links to match. shortcut: page.html is read and written as UTF-8, so a page persisted in another
// charset fails the export instead of being mangled; a byte-level rewrite lifts that limit.
async function webTabSaveCopyOut(dir, path) {
  const filesName = `${PathUtils.filename(path).replace(/\.html?$/i, "")}_files`;
  const html = await IOUtils.readUTF8(PathUtils.join(dir, "page.html"));
  await IOUtils.writeUTF8(path, html.replace(/(["'(=\s])page_files\//g, (_match, lead) => `${lead}${filesName}/`));
  const sourceFiles = PathUtils.join(dir, "page_files");
  if (await IOUtils.exists(sourceFiles)) {
    await IOUtils.copy(sourceFiles, PathUtils.join(PathUtils.parent(path), filesName), { recursive: true });
  }
}

export const PowerBrowserWebTabs = Object.freeze({
  tabIdOfBrowser,

  /** The web tab the Theia frame `theiaBrowser` last reported selected, or null. */
  activeTabIdOf(theiaBrowser) {
    return activeTabByFrame.get(theiaBrowser) ?? null;
  },

  /** Tells the Theia frame which page has focus (`tabId`) or that none has (`null`). */
  pushPageFocus(theiaBrowser, tabId) {
    // Page focus selects its tab (D-13): the overlay the user types in is the one an extension sees as active.
    if (tabId !== null) {
      tabHostSelectById(theiaBrowser, tabId);
    }
    const windowGlobal = theiaBrowser.browsingContext?.currentWindowGlobal ?? null;
    const last = lastPageFocusByFrame.get(theiaBrowser);
    if (last && last.windowGlobal === windowGlobal && last.tabId === tabId) {
      return;
    }
    lastPageFocusByFrame.set(theiaBrowser, { windowGlobal, tabId });
    sendWebTabPush(theiaBrowser, { kind: "pageFocus", tabId });
  },

  /**
   * A page-scoped key fired: relays its row id with the tab whose page had
   * focus. The target is derived from `overlay` (chrome's active element),
   * never from Theia's current widget. Rows whose action lands in Theia UI
   * focus the Theia frame first, so the pill or a new tab can take focus.
   */
  relayShortcut(theiaBrowser, overlay, id, landsInTheia) {
    if (typeof id !== "string" || !/^[A-Za-z0-9]{1,32}$/.test(id)) {
      return "refused-id";
    }
    const tabId = tabIdOfBrowser(overlay);
    if (tabId === null) {
      return "no-page";
    }
    if (landsInTheia) {
      theiaBrowser.focus();
    }
    sendWebTabPush(theiaBrowser, { kind: "shortcut", id, tabId });
    return "relayed";
  },
});

// ---------------------------------------------------------------------------
// Phase 29: the search area.
//
// Search, URI fixup and (in later plans) suggestions, autofill, favicons,
// clipboard and the token-cookie strip. The store request channel above
// routes each of its kinds here with one case arm.
//
// This section sits at the end of the file on purpose: nothing above the
// last catalogued internals line moves when it grows, so the line references
// in INTERNAL-APIS.md stay valid. It has its own lazy-getter block, so the
// top block (and every line under it) does not move either.
// ---------------------------------------------------------------------------

const searchLazy = {};
ChromeUtils.defineESModuleGetters(searchLazy, {
  SearchService: "moz-src:///toolkit/components/search/SearchService.sys.mjs",
  SearchSuggestionController: "moz-src:///toolkit/components/search/SearchSuggestionController.sys.mjs",
});

// True when configuration.toml supplied engines (policy SearchEngines.Add).
// The policy's Remove runs only after a stock window restores, so the bar
// hides Firefox's own engines itself rather than relying on it.
function configuredEnginesActive() {
  if (Services.policies?.status !== Ci.nsIEnterprisePolicies.ACTIVE) {
    return false;
  }
  const add = Services.policies.getActivePolicies()?.SearchEngines?.Add;
  return Array.isArray(add) && add.length > 0;
}

// The engines the bar offers: Gecko's visible engines, minus the
// app-provided ones when configuration.toml supplied its own.
async function barEngines() {
  await searchLazy.SearchService.init();
  const visible = await searchLazy.SearchService.getVisibleEngines();
  if (!configuredEnginesActive()) {
    return visible;
  }
  // Not getAppProvidedEngines(): it prepends appDefaultEngine, which under a
  // policy Default is the configured engine itself (measured in 29-04).
  return visible.filter(e => !String(e.loadPath).startsWith("[app]"));
}

// A named engine is the bar engine with exactly that name or null: a name
// outside the set is refused, never substituted. No name means the default.
async function barEngine(name) {
  const engines = await barEngines();
  if (name) {
    return engines.find(e => e.name === name) ?? null;
  }
  const def = await searchLazy.SearchService.getDefault();
  return engines.find(e => e.id === def?.id) ?? engines[0] ?? null;
}

// The bar engine's submission for `terms`, with the http(s) wall on the result.
function engineSearch(engine, terms) {
  const sub = engine.getSubmission(terms);
  if (!sub || sub.postData || !/^https?$/.test(sub.uri.scheme)) {
    return { kind: "refused" };
  }
  return { kind: "search", url: String(sub.uri.spec), engineName: String(engine.name) };
}

// Fixup adds http:// to a schemeless host; the pill has always minted
// https:// for a bare dotted host, so that case is upgraded. Loopback, IP
// literals and an explicit port keep fixup's http://.
function upgradeSchemeless(info, uri) {
  if (!info.fixupChangedProtocol) {
    return uri;
  }
  const host = uri.host;
  const isIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":") || host.startsWith("[");
  const isLoopback = /^(.+\.)?localhost$/.test(host);
  if (!host.includes(".") || uri.port !== -1 || isIp || isLoopback) {
    return uri;
  }
  return uri.mutate().setScheme("https").finalize();
}

// The one resolve path for typed text: URI fixup, then the bar engine's
// submission for keyword text, then the http(s) wall on the RESULT (never
// only on the input). Typed text is never logged. `canonize` (Ctrl+Enter,
// BAR-13) first completes a bare name to www.<name><locale suffix>, as
// UrlbarInput._maybeCanonizeURL does. `forceSearch` (a one-off engine click,
// BAR-05) skips fixup: the text is that engine's search even when it is
// shaped like an address, as in Firefox.
async function resolveTypedAddress(text, engineName, canonize = false, forceSearch = false) {
  if (typeof text !== "string" || !text.trim() || text.length > 2048) {
    throw new Error("resolveTypedAddress: refusing empty or oversized text");
  }
  if (typeof engineName !== "string" || engineName.length > 256) {
    throw new Error("resolveTypedAddress: refusing a malformed engine name");
  }
  let typed = text.trim();
  if (forceSearch === true) {
    const engine = await barEngine(engineName);
    return engine ? engineSearch(engine, typed) : { kind: "no-engine" };
  }
  if (canonize === true && /^\s*[^.:\/\s]+(?:\/.*|\s*)$/i.test(typed)) {
    let suffix = Services.locale.urlFixupSuffix;
    if (!suffix.endsWith("/")) {
      suffix += "/";
    }
    const slash = typed.indexOf("/");
    const suffixed = slash >= 0 ? typed.slice(0, slash) + suffix + typed.slice(slash + 1) : typed + suffix;
    try {
      typed = Services.uriFixup.getFixupURIInfo(suffixed, Ci.nsIURIFixup.FIXUP_FLAGS_MAKE_ALTERNATE_URI).fixedURI.spec;
    } catch {
      // As in Firefox, a fixup throw leaves the text as typed.
    }
  }
  // Keyword lookup returns an empty info before init.
  await searchLazy.SearchService.init();
  let info;
  try {
    info = Services.uriFixup.getFixupURIInfo(typed, Ci.nsIURIFixup.FIXUP_FLAG_FIX_SCHEME_TYPOS | Ci.nsIURIFixup.FIXUP_FLAG_ALLOW_KEYWORD_LOOKUP);
  } catch {
    return { kind: "refused" };
  }
  if (info.keywordProviderId) {
    // Keyword searches go through the bar's engine, never fixup's own default URL.
    const engine = await barEngine(engineName);
    return engine ? engineSearch(engine, info.keywordAsSent) : { kind: "no-engine" };
  }
  const uri = info.preferredURI;
  if (!uri || !/^https?$/.test(uri.scheme)) {
    return { kind: "refused" };
  }
  return { kind: "visit", url: String(upgradeSchemeless(info, uri).spec) };
}

// The bar's engines in order, for the Default Search Engine setting (BAR-04).
// Each engine's aliases (Gecko's engine.aliases, SMODE-04) cross as at most 8
// strings of at most 64 characters. An icon crosses into the Theia frame only
// as a bounded data:image/ string, so the frame never fetches an
// engine-supplied URL.
async function listSearchEngines() {
  const engines = [];
  for (const engine of await barEngines()) {
    const url = await engine.getIconURL(16);
    const icon = typeof url === "string" && url.startsWith("data:image/") && url.length <= 65536 ? url : null;
    engines.push({ name: String(engine.name), icon, aliases: (Array.isArray(engine.aliases) ? engine.aliases : []).slice(0, 8).map(alias => String(alias).slice(0, 64)) });
  }
  const def = await barEngine("");
  return { engines, defaultName: def ? String(def.name) : "" };
}

// Row favicons for the address bar (BAR-11). Only the Places favicon cache is
// read, and an icon crosses into the Theia frame only as a bounded
// data:image/ string, so showing an icon never fetches anything. A url with no
// cached icon is left out; the row shows its codicon.
async function placesFavicons(urls) {
  if (!Array.isArray(urls)) {
    throw new Error("placesFavicons: refusing a malformed url list");
  }
  const icons = {};
  for (const url of urls.slice(0, 10)) {
    if (typeof url !== "string" || url.length > 8192 || !/^https?:\/\//.test(url)) {
      continue;
    }
    try {
      const icon = await lazy.PlacesUtils.favicons.getFaviconForPage(Services.io.newURI(url), 16);
      const data = icon?.dataURI?.spec;
      if (typeof data === "string" && data.startsWith("data:image/") && data.length <= 65536) {
        icons[url] = data;
      }
    } catch {
      // No icon for this page: the row shows its codicon.
    }
  }
  return icons;
}

// One suggestion controller per Theia frame: its next fetch stops the one in
// flight, so a newer keystroke supersedes the older request.
const suggestControllers = new WeakMap();

// Engine suggestions for typed text (BAR-03). Chrome re-resolves the text and
// fetches only for a search, so URL-shaped text never reaches an engine,
// whatever the frame asked. The controller sends the request anonymously
// (LOAD_ANONYMOUS, no persistent cache). A failure is silent, as in Firefox:
// the reply is []. Typed text is never logged.
async function searchSuggestions(actorRef, text, engineName) {
  if (typeof text !== "string" || !text.trim() || text.length > 2048 || typeof engineName !== "string" || engineName.length > 256) {
    throw new Error("searchSuggestions: refusing empty or oversized text or a malformed engine name");
  }
  const resolved = await resolveTypedAddress(text, engineName);
  if (resolved.kind !== "search") {
    return [];
  }
  const engine = await barEngine(engineName);
  if (!engine) {
    return [];
  }
  const frame = actorRef.browsingContext.top.embedderElement;
  let controller = suggestControllers.get(frame);
  if (!controller) {
    controller = new searchLazy.SearchSuggestionController();
    suggestControllers.set(frame, controller);
  }
  let result;
  try {
    result = await controller.fetch({ searchString: text.trim(), inPrivateBrowsing: false, engine, maxLocalResults: 0, maxRemoteResults: 4 });
  } catch {
    return [];
  }
  return (result?.remote ?? [])
    .map(entry => entry?.value)
    .filter(value => typeof value === "string" && value && value.length <= 512)
    .slice(0, 4);
}

// Inline autofill of a typed origin (BAR-07): the best-matching visited
// http(s) origin from moz_origins, through the same read-only Places
// connection searchPlaces reads (bound parameters, SELECT only; nothing here
// writes Places). Text shaped like more than a host prefix is refused before
// the query. The reply is strings; typed text is never logged.
async function autofillOrigin(text) {
  const typed = typeof text === "string" ? text.toLowerCase() : "";
  if (!typed || typed.length > 253 || /[\s/:?#]/.test(typed)) {
    return null;
  }
  const pattern = `${typed.replace(/[\\%_]/g, c => "\\" + c)}%`;
  const places = await lazy.PlacesUtils.promiseDBConnection();
  const rows = await places.executeCached(
    `SELECT prefix, host FROM moz_origins
      WHERE (host LIKE :hostPattern ESCAPE '\\' OR host LIKE :wwwPattern ESCAPE '\\')
        AND prefix IN ('http://', 'https://') AND frecency > 0
      ORDER BY frecency DESC LIMIT 1`,
    // Sqlite.sys.mjs refuses a LIKE not followed by a binding (a parameter named
    // like trips it too), so both patterns are bound, under other names.
    { hostPattern: pattern, wwwPattern: `www.${pattern}` }
  );
  if (!rows.length) {
    return null;
  }
  const host = String(rows[0].getResultByName("host"));
  // A host that itself starts with the typed text ("ww" -> www.example.com)
  // keeps its www.; only a wwwPattern match drops it.
  const shown = host.startsWith(typed) ? host : host.slice(4);
  return { text: `${shown}/`, url: `${String(rows[0].getResultByName("prefix"))}${host}/` };
}

// The token-cookie strip (BAR-02; REQUIREMENTS technical ruling 2026-10-20).
// The Theia token cookie is host-only on 127.0.0.1 and cookies are not
// port-scoped, so a server on any other loopback port (a dev server typed into
// the bar, opened in an overlay, the stock browser window or a worker) would
// receive it. Gecko adds cookies to the request before http-on-modify-request
// fires (nsHttpChannel.cpp), so this observer removes the token from the
// Cookie header there; the cookie itself stays in the store. The token is
// kept only on the sidecar's own port, and there only for the Theia frame,
// chrome or a Theia-origin worker. Nothing here logs a cookie value.
//
// scripts/verify-token-cookie-strip.mjs pins this name to the token gate's
// POWERBROWSER_TOKEN_COOKIE_NAME.
const TOKEN_COOKIE_NAME = "POWERBROWSER_TOKEN";
const TOKEN_STRIP_TOPIC = "http-on-modify-request";

// Fail closed: with no recorded sidecar port nothing keeps the token.
function tokenCookieAllowed(channel) {
  if (groupSenderPort === null || channel.URI.port !== groupSenderPort) {
    return false;
  }
  const info = channel.loadInfo;
  const bc = info.targetBrowsingContext ?? info.browsingContext;
  if (bc) {
    // An overlay (or a frame inside one) loses it, even on the sidecar port.
    return tabIdOfBrowser(bc.top.embedderElement) === null;
  }
  const principal = info.triggeringPrincipal;
  return !!principal && (principal.isSystemPrincipal || principal.hostPort === `127.0.0.1:${groupSenderPort}`);
}

const tokenCookieStrip = {
  observe(subject) {
    let channel;
    try {
      channel = subject.QueryInterface(Ci.nsIHttpChannel);
    } catch {
      return;
    }
    if (channel.URI.host !== "127.0.0.1" || tokenCookieAllowed(channel)) {
      return;
    }
    let header;
    try {
      header = channel.getRequestHeader("Cookie");
    } catch {
      return;
    }
    const entries = header.split(";");
    const kept = entries.filter(entry => !entry.trim().startsWith(`${TOKEN_COOKIE_NAME}=`));
    if (kept.length !== entries.length) {
      channel.setRequestHeader("Cookie", kept.map(entry => entry.trim()).join("; "), false);
    }
  },
};

let tokenCookieStripInstalled = false;
function installTokenCookieStrip() {
  if (tokenCookieStripInstalled) {
    return;
  }
  Services.obs.addObserver(tokenCookieStrip, TOKEN_STRIP_TOPIC);
  tokenCookieStripInstalled = true;
}

// For the live check's self-test only: it removes the observer through this
// to prove the check can go red. No product code calls removeObserver.
export const PowerBrowserTokenCookie = Object.freeze({ observer: tokenCookieStrip, topic: TOKEN_STRIP_TOPIC });

// Shift+Delete on a history row (BAR-09; REQUIREMENTS ruling 2026-10-20): the
// chrome bar's first Places write. A privileged store kind (rule 12): only the
// widget's Shift+Delete handler sends it, and only for a row whose source is
// history, so a bookmark row never reaches here (29-RESEARCH Pitfall 10).
// history.remove also clears the page's visits, frecency and moz_origins row.
// The url is never logged; a Places error is withheld by handleStoreRequest.
async function removeHistoryEntry(url) {
  const target = storeUrlArg(url);
  if (!/^https?:\/\//i.test(target)) {
    throw new Error("removeHistoryEntry: refusing a non-http(s) url");
  }
  return Boolean(await lazy.PlacesUtils.history.remove(target));
}

// Paste and Paste & Go on the address pill (BAR-10): the global clipboard's
// text, read chrome-side, because a content clipboard read opens Firefox's
// native paste confirmation popup over the bar (29-RESEARCH Pitfall 4). A
// privileged store kind (rule 12): only the widget's Paste and Paste & Go
// handlers send it, after the user chose one. The global clipboard only, never
// the selection clipboard; at most 8192 characters. No log line, ever,
// carries the text.
function readClipboardText() {
  const trans = Cc["@mozilla.org/widget/transferable;1"].createInstance(Ci.nsITransferable);
  trans.init(null);
  trans.addDataFlavor("text/plain");
  Services.clipboard.getData(trans, Services.clipboard.kGlobalClipboard);
  const data = {};
  try {
    trans.getTransferData("text/plain", data);
  } catch {
    // No text/plain on the clipboard: an empty clipboard, not an error.
    return "";
  }
  return String(data.value?.QueryInterface(Ci.nsISupportsString).data ?? "").slice(0, 8192);
}

// ---------------------------------------------------------------------------
// Phase 30: restricted Places lists.
//
// The address bar's Bookmarks and History modes (SMODE-01) list their source
// on focus and filter it as the user types. searchPlaces cannot serve that:
// it has no restrict field and returns nothing for empty text. This reader
// rides the same searchPlaces store kind behind its `restrict` field, so the
// store walls (storeSenderInShellWindow, groupSenderIsTheia) run first and no
// kind is added. `restrict` is one of two literals and anything else is
// refused with fixed text that never echoes it. SELECT only, every value a
// bound parameter, text cut to 256 characters, the cap clamped to 1..50 and
// http(s) addresses only, as in searchPlaces. Empty text matches every row.
// It sits at the end of the file so no catalogued line above moves.
// ---------------------------------------------------------------------------

const PLACES_RESTRICT_SQL = Object.freeze({
  // The newest bookmarks first, one row per page.
  bookmark: `SELECT h.url AS url, COALESCE(MAX(b.title), h.title, '') AS title, h.frecency AS frecency,
                    MAX(b.guid) AS bookmark_guid
               FROM moz_bookmarks b
               JOIN moz_places h ON h.id = b.fk
              WHERE (h.url LIKE :pattern ESCAPE '\\' OR h.title LIKE :pattern ESCAPE '\\' OR b.title LIKE :pattern ESCAPE '\\')
                AND (substr(h.url, 1, 7) = 'http://' OR substr(h.url, 1, 8) = 'https://')
              GROUP BY h.id
              ORDER BY MAX(b.dateAdded) DESC
              LIMIT :cap`,
  // The most recent visits first; a bookmarked page keeps its bookmark flag.
  history: `SELECT h.url AS url, COALESCE(MAX(b.title), h.title, '') AS title, h.frecency AS frecency,
                   MAX(b.guid) AS bookmark_guid
              FROM moz_places h
              LEFT JOIN moz_bookmarks b ON b.fk = h.id
             WHERE h.visit_count > 0
               AND (h.url LIKE :pattern ESCAPE '\\' OR h.title LIKE :pattern ESCAPE '\\' OR b.title LIKE :pattern ESCAPE '\\')
               AND (substr(h.url, 1, 7) = 'http://' OR substr(h.url, 1, 8) = 'https://')
             GROUP BY h.id
             ORDER BY h.last_visit_date DESC
             LIMIT :cap`,
});

async function searchPlacesRestricted(text, limit, restrict) {
  if (restrict !== "bookmark" && restrict !== "history") {
    throw new Error("searchPlacesRestricted: refusing an unknown restrict value");
  }
  const needle = typeof text === "string" ? text.slice(0, 256) : "";
  const cap = Number.isInteger(limit) ? Math.min(Math.max(limit, 1), 50) : 8;
  const pattern = `%${needle.replace(/[\\%_]/g, c => "\\" + c)}%`;
  const places = await lazy.PlacesUtils.promiseDBConnection();
  const rows = await places.executeCached(PLACES_RESTRICT_SQL[restrict], { pattern, cap });
  return rows.map(row => ({
    url: row.getResultByName("url"),
    title: row.getResultByName("title") ?? "",
    frecency: row.getResultByName("frecency"),
    bookmarked: row.getResultByName("bookmark_guid") !== null,
  }));
}

// ---------------------------------------------------------------------------
// Phase 31 plan 03 (SITE-07/08): the site-data clear and the shield exception.
// Chrome-only helpers the webTabClearSiteData and webTabShieldToggle arms call.
// ---------------------------------------------------------------------------

// WR-03: nsIX509CertValidity.notBefore and notAfter are PRTime (microseconds since
// the epoch, nsIX509CertValidity.idl:17-23), not strings, so the "Valid:" row formats
// them here. UTC, so the date does not depend on the machine's zone. Null when unreadable.
function webTabCertDate(prTime) {
  if (typeof prTime !== "number" || !Number.isFinite(prTime)) {
    return null;
  }
  const date = new Date(prTime / 1000);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return new Intl.DateTimeFormat("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" }).format(date);
}

// The token cookie is host-only on the sidecar's loopback origin (see the
// token-cookie strip above). Exempt by name AND host: a same-named cookie on
// another host is site data like any other.
const TOKEN_COOKIE_HOST = "127.0.0.1";

function webTabTokenCookie(cookie) {
  return cookie.name === TOKEN_COOKIE_NAME && cookie.host === TOKEN_COOKIE_HOST;
}

// The scope of the clear: the registrable domain of the page's host. Upstream
// clears this same scope from the identity panel (browser-siteIdentity.js:473-475,
// SiteDataManager.remove -> deleteDataFromSite, SiteDataManager.sys.mjs:528-560).
// An IP literal or a single-label host is its own site (getBaseDomainFromHost falls back).
function webTabSite(principal) {
  return lazy.SiteDataManager.getBaseDomainFromHost(principal.asciiHost);
}

// The clear, in order, over one scope: the site (above) and the principal's origin
// attributes, for cookies and storage alike (CR-03: the two halves never disagree).
// (1) Site cookies one by one, every cookie but the token (SiteDataManager.sys.mjs:503-512
// is the per-cookie precedent). (2) The site's non-cookie storage through
// deleteDataFromSite with the cookie-excluding flag set, because the upstream pass
// uses CLEAR_COOKIES_AND_SITE_DATA and would re-delete the token cookie after the loop
// (SiteDataManager.sys.mjs:547-552). Re-verified last: the token count may not fall,
// else "token-cookie" and the caller refuses the reply.
async function webTabClearSiteData(browser, principal) {
  const site = webTabSite(principal);
  const attrs = principal.originAttributes;
  const cookies = Services.cookies.getCookiesFromHost(site, attrs);
  const tokensBefore = cookies.filter(webTabTokenCookie).length;
  for (const cookie of cookies) {
    if (!webTabTokenCookie(cookie)) {
      Services.cookies.remove(cookie.host, cookie.name, cookie.path, cookie.originAttributes);
    }
  }
  const flags = Ci.nsIClearDataService.CLEAR_COOKIES_AND_SITE_DATA & ~Ci.nsIClearDataService.CLEAR_COOKIES;
  const schemeless = Services.eTLD.getSchemelessSiteFromHost(site);
  await new Promise(resolve => Services.clearData.deleteDataFromSite(schemeless, attrs, true, flags, resolve));
  const tokensAfter = Services.cookies.getCookiesFromHost(site, attrs).filter(webTabTokenCookie).length;
  return tokensAfter < tokensBefore ? "token-cookie" : "cleared";
}

// Whether the host still has site data. A read that throws is "no data", the
// same fallback webTabSiteInfo uses.
async function webTabSiteHasData(host) {
  try {
    return !!(await lazy.SiteDataManager.hasSiteData(host));
  } catch (err) {
    return false;
  }
}

// Whether the overlay's site has a tracking-protection exception. A read that
// throws (no content principal yet) is "no exception".
function webTabShieldExcepted(browser) {
  try {
    return !!lazy.ContentBlockingAllowList.includes(browser);
  } catch (err) {
    return false;
  }
}

// The tab-store rows of one site (the scope of the clear, CR-03): thumbnails of
// every row for the site are cleared, and closed rows for it are removed. Group
// members are kept, so no group loses a tab. A row is matched by the registrable
// domain of its own url host (a row's key is not its URL), ports ignored like the
// cookie and storage scope. URL.hostname keeps an IPv6 literal's brackets; they go first.
async function purgeSiteTabRows(site) {
  const conn = await PowerBrowserAPI.openTabStore();
  const rows = await conn.execute("SELECT uri, url, closed_at, group_id FROM tabs");
  for (const row of rows) {
    const uri = row.getResultByName("uri");
    let rowSite = null;
    try {
      const rowHost = new URL(String(row.getResultByName("url"))).hostname.replace(/^\[(.*)\]$/, "$1");
      rowSite = lazy.SiteDataManager.getBaseDomainFromHost(rowHost);
    } catch (err) {
      rowSite = null;
    }
    if (rowSite !== site) {
      continue;
    }
    await conn.execute("UPDATE tabs SET thumbnail = NULL WHERE uri = :uri", { uri });
    if (row.getResultByName("closed_at") !== null && row.getResultByName("group_id") === null) {
      await conn.execute("DELETE FROM tabs WHERE uri = :uri", { uri });
    }
  }
}

// ---------------------------------------------------------------------------
// Phase 31 plan 04 (MENU-02, D-31-07): the app menu's stock pages.
//
// The hamburger sends a page NAME, never a URL: `openStockPage {page}` is the
// whole wire. Settings and Add-ons open through the stock window's own entry
// points, the functions upstream's menus call (utilityOverlay.js:381,
// browser-addons.js:1956). Passwords, Processes and Help open their about:
// page as a trusted tab, as upstream's Quick Actions does
// (QuickActionsLoaderDefault.sys.mjs:185) and by the same trusted-tab call as
// browser.js:4873. openStockTab is never used for these: its load carries a null
// principal, which cannot load about:preferences or about:logins.
// ---------------------------------------------------------------------------

/** The trusted about: page each trusted-tab stock page opens. Settings and Add-ons have their own entry points. */
const STOCK_PAGE_TRUSTED_URLS = Object.freeze({
  passwords: "about:logins",
  processes: "about:processes",
  support: "about:support",
});

/** A stock window's startup, polled: the window's own delayed-startup flag, never a Services observer. */
async function stockWindowStarted(win) {
  const deadline = Date.now() + 15000;
  while (!win.closed && !(win.gBrowserInit && win.gBrowserInit.delayedStartupFinished)) {
    if (Date.now() > deadline) {
      throw new Error("openStockPage: the stock window did not finish starting");
    }
    // WR-07: the module's sleep(), not win.setTimeout: a window's timer never fires once the window is destroyed.
    await PowerBrowserAPI.sleep(50);
  }
  if (win.closed) {
    throw new Error("openStockPage: the stock window closed while starting");
  }
}

/**
 * Opens one stock page in the most recent stock window, or in a new one when
 * none is open. Returns "opened" or "opened-window". A page name outside the
 * enum is refused before any window is touched. Errors from the stock entry
 * points are logged by name only: a URL, a title or a path is never logged.
 */
async function openStockPageFromMenu(page) {
  switch (page) {
    case "settings":
    case "addons":
    case "passwords":
    case "processes":
    case "support":
      break;
    default:
      throw new Error("openStockPage: refusing an unknown page");
  }
  let where = "opened";
  let win = Services.wm.getMostRecentWindow("navigator:browser");
  if (!win || win.closed) {
    win = PowerBrowserAPI.openBrowserWindow("about:newtab");
    where = "opened-window";
  }
  await stockWindowStarted(win);
  const failed = err => PowerBrowserAPI.log("error", `[openStockPage] ${page} failed: ${err && err.name ? err.name : "error"}`);
  if (page === "settings") {
    Promise.resolve(win.openPreferences()).catch(failed);
  } else if (page === "addons") {
    Promise.resolve(win.BrowserAddonUI.openAddonsMgr()).catch(failed);
  } else {
    const tab = win.gBrowser.addTrustedTab(STOCK_PAGE_TRUSTED_URLS[page]);
    win.gBrowser.selectedTab = tab;
  }
  PowerBrowserAPI.focusWindow(win);
  return where;
}

// WR-04: upstream's CanCloseWindow (browser.js:3633-3690) asks each browser's permitUnload, because
// nsGlobalWindowOuter::CanClose (nsGlobalWindowOuter.cpp:5975) reaches only the chrome document of a
// window with no nsIBrowserDOMWindow. The shell has none, so the Theia <browser> was never asked.
const shellQuitVeto = {
  observe(subject) {
    if (!subject || typeof subject.data !== "boolean" || subject.data) {
      return;
    }
    if (!shellBrowsersPermitUnload()) {
      subject.data = true;
    }
  },
};

function shellBrowsersPermitUnload() {
  for (const win of Services.wm.getEnumerator("powerbrowser:main")) {
    for (const browser of win.document.querySelectorAll("browser")) {
      if (!browser.isConnected) {
        continue;
      }
      let permitted = true;
      try {
        permitted = browser.permitUnload().permitUnload;
      } catch (err) {
        PowerBrowserAPI.log("error", `Leave check failed (${err && err.name ? err.name : "error"}); quitting anyway.`);
      }
      if (!permitted) {
        return false;
      }
    }
  }
  return true;
}

Services.obs.addObserver(shellQuitVeto, "quit-application-requested");

// For the live check's self-test only: the quit-typed plant removes the veto through this. No product code calls removeObserver.
export const PowerBrowserQuitVeto = Object.freeze({ observer: shellQuitVeto, topic: "quit-application-requested" });

// Phase 31.1: the extension tab host.
//
// An installed extension reads the shell window's gBrowser (the tabbrowser
// shape), so each web tab, one live overlay <browser>, is presented as one real
// XUL node in a hidden strip. The node is created when the overlay opens and
// removed when it closes. The Theia frame never gets a node (D-06 as amended):
// WebDriver reaches it through gBrowser.webDriverTabs, and extensions read
// gBrowser.tabs only. The never-synthesise rule in powerbrowser.js is reversed
// for this host alone (Phase 28 sign-off, 2026-10-21): every node stands for one
// live overlay. This section sits at the end of the file on purpose: nothing
// above the last catalogued internals line moves.

// The host record per shell window. install() is the only writer.
const tabHosts = new WeakMap();

function fireTabEvent(node, type, detail) {
  node.dispatchEvent(new node.ownerDocument.defaultView.CustomEvent(type, { bubbles: true, detail }));
}

// A host node is one the host created and the strip still holds. The Theia
// record and any plain object are not host nodes.
function isHostTab(host, tab) {
  return Boolean(tab) && tab.parentNode === host.strip;
}

// The fields the extension trackers read (ext-browser.js, ext-tabs-base.js).
// toggleMuteAudio goes through tabHostSetMuted, the one mute path (Phase 32 plan 09, PAGE-05).
function makeTabNode(host, browser) {
  const node = host.strip.ownerDocument.createXULElement("hbox");
  host.counter += 1;
  Object.assign(node, {
    linkedBrowser: browser,
    linkedPanel: `powerbrowser-panel-${host.counter}`,
    pinned: false,
    hidden: false,
    multiselected: false,
    muted: false,
    muteReason: undefined,
    soundPlaying: false,
    undiscardable: false,
    openerTab: null,
    group: null,
    splitview: null,
    userContextId: 0,
    lastAccessed: Date.now(),
    label: "",
    image: null,
    successor: null,
    closing: false,
    // The stock toggle (tab.js:757-775): an extension's tabs.update({muted}) reaches here with its extension id as reason.
    toggleMuteAudio(reason) {
      tabHostSetMuted(this.linkedBrowser, !this.linkedBrowser.audioMuted, reason);
    },
  });
  Object.defineProperties(node, {
    _tPos: { get() { return Array.prototype.indexOf.call(host.strip.children, this); } },
    selected: { get() { return host.selected === this; } },
  });
  return node;
}

function selectNode(host, node) {
  if (host.selected === node) {
    return;
  }
  const previousTab = host.selected;
  host.selected = node;
  node.lastAccessed = Date.now();
  fireTabEvent(node, "TabSelect", { previousTab });
}

// Called by webTabOpen once the overlay is in webTabs. The first overlay, or
// the one the Theia frame already named selected, becomes the selection.
function tabHostAddTab(win, tabId, browser) {
  const host = tabHosts.get(win);
  // D-06: only an overlay gets a node. The Theia frame lacks this group.
  if (!host || browser.getAttribute("messagemanagergroup") !== "browsers") {
    return;
  }
  const node = makeTabNode(host, browser);
  host.strip.appendChild(node);
  host.byBrowser.set(browser, node);
  host.byTabId.set(tabId, node);
  attachProgress(host, browser, node);
  const becameSelected = host.selected === null;
  if (becameSelected) {
    host.selected = node;
  }
  fireTabEvent(node, "TabOpen", { adoptedTab: null });
  if (becameSelected) {
    fireTabEvent(node, "TabSelect", { previousTab: null });
  }
  if (activeTabByFrame.get(host.theiaBrowser) === tabId) {
    selectNode(host, node);
  }
}

// The next selection when the selected tab closes: the tab activeTabByFrame
// names if it is live, else the tab now at the same index (the previous tab
// when the closed one was last), else null.
function pickNextSelection(host, index) {
  const preferredId = activeTabByFrame.get(host.theiaBrowser);
  const preferred = preferredId === undefined ? undefined : host.byTabId.get(preferredId);
  if (preferred) {
    return preferred;
  }
  const children = host.strip.children;
  return children.length ? children[Math.min(index, children.length - 1)] : null;
}

// Tabs-progress fan-out (002a tabhost.js:113-130). The overlay's web progress
// reaches every tabs-progress listener the trackers registered, browser first,
// as tabbrowser does. The forwarder is held on the host record, because the web
// progress holds its listeners weakly. busy follows the top-level network state,
// and label follows the page title.
// The overlay locations (D-05, amended 32-08: about:reader?url=http(s) and view-source:http(s)); moz-extension: stays refused.
const OVERLAY_LOCATION = /^(?:https?:\/\/|about:blank$|about:reader\?url=https?%3A|view-source:https?:\/\/)/i;
// The icon URLs a tab may take from the shell (tabbrowser.js:1368-1372); a remote icon is refused.
const LOCAL_ICON_PROTOCOLS = ["chrome:", "about:", "resource:", "data:"];

function attachProgress(host, browser, node) {
  const { STATE_IS_NETWORK, STATE_START, STATE_STOP } = Ci.nsIWebProgressListener;
  const fan = (name, args) => {
    for (const listener of host.progressListeners) {
      if (typeof listener[name] === "function") {
        listener[name](browser, ...args);
      }
    }
  };
  const forwarder = {
    QueryInterface: ChromeUtils.generateQI(["nsIWebProgressListener", "nsISupportsWeakReference"]),
    onStateChange(webProgress, request, flags, status) {
      if ((flags & STATE_IS_NETWORK) && webProgress.isTopLevel) {
        if (flags & STATE_START) {
          node.setAttribute("busy", "true");
        }
        if (flags & STATE_STOP) {
          node.removeAttribute("busy");
        }
        fireTabEvent(node, "TabAttrModified", { changed: ["busy"] });
      }
      fan("onStateChange", [webProgress, request, flags, status]);
    },
    onLocationChange(webProgress, request, location, flags) {
      const sameDocument = Boolean(flags & Ci.nsIWebProgressListener.LOCATION_CHANGE_SAME_DOCUMENT);
      // T-31.1-20 (D-05, D-17): an overlay holds only http(s) and about:blank. A top-level load that lands elsewhere,
      // such as an extension page a webRequest listener redirected to, is stopped and replaced with about:blank. The
      // trackers never hear of the stopped location.
      if (webProgress.isTopLevel && !sameDocument && !OVERLAY_LOCATION.test(location.spec)) {
        browser.stop();
        browser.fixupAndLoadURIString("about:blank", {
          triggeringPrincipal: Services.scriptSecurityManager.createNullPrincipal({}),
        });
        return;
      }
      // WR-08 (tabbrowser.js:9650-9657): a new top-level document clears the tab's icon until its own icon arrives,
      // so tabs.get never reports the previous page's icon. Same-document changes (hash, pushState) keep it.
      if (webProgress.isTopLevel && !sameDocument && webProgress.isLoadingDocument && node.image) {
        node.image = null;
        fireTabEvent(node, "TabAttrModified", { changed: ["image"] });
      }
      fan("onLocationChange", [webProgress, request, location, flags]);
    },
    onStatusChange: (...args) => fan("onStatusChange", args),
    onProgressChange: (...args) => fan("onProgressChange", args),
    onSecurityChange: (...args) => fan("onSecurityChange", args),
    onContentBlockingEvent: (...args) => fan("onContentBlockingEvent", args),
  };
  browser.addProgressListener(forwarder, Ci.nsIWebProgress.NOTIFY_ALL);
  host.forwarders.set(browser, forwarder);
  const titleListener = () => {
    node.label = browser.contentTitle;
    fireTabEvent(node, "TabAttrModified", { changed: ["label"] });
  };
  browser.addEventListener("pagetitlechanged", titleListener);
  host.titleListeners.set(browser, titleListener);
}

// Best-effort teardown, the same idiom as webTabClose's listener removal.
function detachProgress(host, browser) {
  const forwarder = host.forwarders.get(browser);
  if (forwarder) {
    try {
      browser.removeProgressListener(forwarder);
    } catch {
      // best-effort: a frameloader already torn down throws here
    }
    host.forwarders.delete(browser);
  }
  const titleListener = host.titleListeners.get(browser);
  if (titleListener) {
    try {
      browser.removeEventListener("pagetitlechanged", titleListener);
    } catch {
      // best-effort
    }
    host.titleListeners.delete(browser);
  }
}

// Selects the node of web tab tabId when this host holds one. Called by the
// webTabActivated arm and by pushPageFocus; a null from either never reaches it.
function tabHostSelectById(theiaBrowser, tabId) {
  const host = tabHosts.get(theiaBrowser.ownerDocument.defaultView);
  const node = host ? host.byTabId.get(tabId) : undefined;
  if (node) {
    selectNode(host, node);
  }
}

// The host node of an overlay, or undefined for a browser the host does not hold.
function tabHostNodeOf(browser) {
  const host = tabHosts.get(browser.ownerDocument.defaultView);
  return host ? host.byBrowser.get(browser) : undefined;
}

// Phase 32 plan 09 (PAGE-05): the one mute path. The webTabMute arm and an extension's toggleMuteAudio both come
// here, so the overlay, the host node, the TabAttrModified event and Theia's state push always agree. A user mute
// passes reason null, which reads as reason "user" (tab.js:772).
function tabHostSetMuted(browser, muted, reason) {
  if (muted) {
    browser.mute();
  } else {
    browser.unmute();
  }
  const node = tabHostNodeOf(browser);
  if (node) {
    node.muted = browser.audioMuted === true;
    node.muteReason = reason || null;
    fireTabEvent(node, "TabAttrModified", { changed: ["muted"] });
  }
  webTabPagePush(browser);
}

// PAGE-05: the host node's soundPlaying follows the overlay's audio playback events; a change is announced once.
function tabHostSetSoundPlaying(browser, playing) {
  const node = tabHostNodeOf(browser);
  if (node && node.soundPlaying !== playing) {
    node.soundPlaying = playing;
    fireTabEvent(node, "TabAttrModified", { changed: ["soundplaying"] });
  }
}

// Called by webTabClose before browser.remove(). TabClose fires while the node
// is still in the strip, with closing set, so the tracker reads no id from it.
function tabHostDropTab(win, browser) {
  const host = tabHosts.get(win);
  const node = host ? host.byBrowser.get(browser) : undefined;
  if (!node) {
    return;
  }
  node.closing = true;
  fireTabEvent(node, "TabClose", { adoptedBy: null });
  const index = node._tPos;
  host.strip.removeChild(node);
  host.byBrowser.delete(browser);
  detachProgress(host, browser);
  for (const [tabId, tab] of host.byTabId) {
    if (tab === node) {
      host.byTabId.delete(tabId);
    }
  }
  if (host.selected !== node) {
    return;
  }
  host.selected = null;
  const next = pickNextSelection(host, index);
  if (next) {
    host.selected = next;
    next.lastAccessed = Date.now();
    fireTabEvent(next, "TabSelect", { previousTab: node });
  }
}

export const PowerBrowserTabHost = Object.freeze({
  /**
   * Installs the host in the shell window `win`, whose Theia frame is
   * `theiaBrowser`. Creates the hidden strip, defines the gBrowserInit shim
   * and returns the accessors powerbrowser.js delegates to. A second install
   * for the same window throws.
   */
  install(win, theiaBrowser) {
    if (tabHosts.has(win)) {
      throw new Error("PowerBrowser's tab host is already installed in this window.");
    }
    const doc = win.document;
    const strip = doc.createXULElement("hbox");
    strip.id = "powerbrowser-tab-host";
    strip.setAttribute("hidden", "true");
    doc.documentElement.appendChild(strip);
    const host = {
      win,
      strip,
      theiaBrowser,
      byBrowser: new Map(),
      byTabId: new Map(),
      selected: null,
      progressListeners: new Set(),
      forwarders: new Map(),
      titleListeners: new Map(),
      counter: 0,
    };
    tabHosts.set(win, host);
    win.gBrowserInit = { delayedStartupFinished: true, getTabToAdopt: () => null, isAdoptingTab: () => false };
    // Phase 32 plan 09 (PAGE-02): the zoom shims under the Phase 27 policy. The shell zooms with fullZoom only (32-01), so
    // the scope is per-tab. Compared member by member by verify-shell-gbrowser-standin.mjs.
    win.ZoomManager = {
      getZoomForBrowser(browser) {
        const zoom = browser && typeof browser.fullZoom === "number" ? browser.fullZoom : 1;
        return Math.round(zoom * 100) / 100;
      },
      get MIN() { return Services.prefs.getIntPref("zoom.minPercent", 30) / 100; },
      get MAX() { return Services.prefs.getIntPref("zoom.maxPercent", 500) / 100; },
    };
    win.FullZoom = {
      siteSpecific: false,
    };
    win.ZoomUI = {
      getGlobalValue() {
        return ChromeUtils.importESModule("resource:///modules/ZoomUI.sys.mjs").ZoomUI.getGlobalValue();
      },
    };
    return Object.freeze({
      tabs: () => [...strip.children],
      selectedTab: () => host.selected,
      selectedBrowser: () => (host.selected ? host.selected.linkedBrowser : null),
      currentURI: () => (host.selected ? host.selected.linkedBrowser.currentURI : null),
      getTabForBrowser: browser => host.byBrowser.get(browser) ?? null,
      getBrowserForTab: tab => (isHostTab(host, tab) ? tab.linkedBrowser : null),
      isTab: tab => isHostTab(host, tab),
      getIcon: tab => (isHostTab(host, tab) ? tab.image : null),
      setIcon(tab, url) {
        if (!isHostTab(host, tab)) {
          return;
        }
        // WR-08, upstream's contract (tabbrowser.js:1362-1386): an nsIURI is read by its spec, and a remote icon URL is
        // refused. An empty string clears the icon.
        const spec = url instanceof Ci.nsIURI ? url.spec : url;
        if (typeof spec !== "string") {
          return;
        }
        if (spec !== "" && !LOCAL_ICON_PROTOCOLS.some(protocol => spec.startsWith(protocol))) {
          PowerBrowserAPI.log("error", "[tab-host] refused a remote tab icon URL (only chrome, about, resource and data icons are local)");
          return;
        }
        tab.image = spec || null;
        fireTabEvent(tab, "TabAttrModified", { changed: ["image"] });
      },
      getTabSharingState: () => ({ camera: undefined, microphone: undefined, screen: undefined }),
      addTabsProgressListener: listener => host.progressListeners.add(listener),
      removeTabsProgressListener: listener => host.progressListeners.delete(listener),
      refuse(action) {
        throw new Error(`PowerBrowser cannot ${action} for an extension yet.`);
      },
    });
  },
});

// ---------------------------------------------------------------------------
// Phase 32 plan 06 (PAGE-09): probe-gated edit commands. The set is the chrome-help subset the edit-today
// probe recorded (scripts/lib/pb-probe-verdicts.json). cmd_pasteNoFormatting had no chrome effect there, so
// it has no kind. Frozen: the union, the Edit items and verify-page-tools-edit.mjs derive from this list.
const WEB_TAB_EDIT_CMDS = Object.freeze(["cmd_undo", "cmd_redo", "cmd_cut", "cmd_copy", "cmd_paste", "cmd_selectAll", "cmd_delete"]);

// The chrome route is the Controllers actor (ControllersParent.sys.mjs). A remote overlay has no parent-side
// docShell, so `docShell.doCommand` is not reachable. The child (ControllersChild) runs its own docShell
// isCommandEnabled guard before the command, so an unavailable command is a no-op, not an edit.
async function webTabEditReply(kind, tabId, cmd, checkOnly) {
  const entry = webTabs.get(tabId);
  if (!entry) {
    return { ok: true, kind, where: "unknown-tab" };
  }
  const controller = entry.browser.browsingContext?.currentWindowGlobal?.getActor("Controllers");
  if (!controller) {
    return { ok: false, reason: "unavailable", message: "handleWebTabAction: the page's command route is not available" };
  }
  const enabled = controller.isCommandEnabled(cmd) === true;
  if (checkOnly) {
    return { ok: true, kind, where: "checked", enabled };
  }
  controller.doCommand(cmd);
  return { ok: true, kind, where: "applied", enabled };
}

// ---------------------------------------------------------------------------
// Phase 32 plan 04 (PAGE-06): the Downloads view. One chrome-side view on the
// combined Downloads list serializes every row into a downloadsChanged push.
// A Download object never leaves chrome: its row id is a counter this file
// assigns, and a row carries the filename, never the path. The shell builds
// its own list here, because the stock panel needs a stock browser window.
// Module-level, like the page-tools helpers above.
// ---------------------------------------------------------------------------
const downloadsLazy = {};
ChromeUtils.defineESModuleGetters(downloadsLazy, {
  Downloads: "resource://gre/modules/Downloads.sys.mjs",
});

const WEB_TAB_DOWNLOAD_ACTIONS = Object.freeze(["cancel", "launch", "showContainingDirectory", "remove", "retry"]);
// shortcut: the newest 50 rows per push bound the panel; older rows stay in the Downloads list, upgrade if paging is needed.
const WEB_TAB_DOWNLOAD_ROWS_MAX = 50;

const downloadsState = {
  frame: null, // the Theia frame element that last subscribed: the push target
  installed: null, // one install promise, so two subscribes share one view
  list: null,
  rows: new Map(), // row id -> serialized row, in first-seen order
  ids: new WeakMap(), // Download -> row id
  byId: new Map(), // row id -> Download, chrome-side only
  nextId: 1,
  batching: false,
};

// Serializes one Download to primitives. No path, no error text: a failed row shows the Retry action.
function webTabDownloadSerialize(download) {
  let id = downloadsState.ids.get(download);
  if (id === undefined) {
    id = downloadsState.nextId++;
    downloadsState.ids.set(download, id);
  }
  downloadsState.byId.set(id, download);
  const state = download.succeeded ? "finished" : download.canceled ? "canceled" : download.error ? "failed" : "in-progress";
  return {
    id,
    url: String(download.source?.url ?? ""),
    filename: String(download.target?.path ?? "").split(/[\\/]/).pop(),
    bytesTotal: Number(download.totalBytes) || 0,
    bytesReceived: Number(download.currentBytes) || 0,
    state,
    succeeded: download.succeeded === true,
    canceled: download.canceled === true,
    error: !!download.error,
  };
}

// Every view callback pushes the whole bounded row list; a batch (the replay at addView) pushes once at its end.
function webTabDownloadsPush() {
  const frame = downloadsState.frame;
  if (!frame || downloadsState.batching) {
    return;
  }
  const rows = [...downloadsState.rows.values()].reverse().slice(0, WEB_TAB_DOWNLOAD_ROWS_MAX);
  sendWebTabPush(frame, { kind: "downloadsChanged", rows });
}

const downloadsView = {
  onDownloadBatchStarting() {
    downloadsState.batching = true;
  },
  onDownloadBatchEnded() {
    downloadsState.batching = false;
    webTabDownloadsPush();
  },
  onDownloadAdded(download) {
    const row = webTabDownloadSerialize(download);
    downloadsState.rows.set(row.id, row);
    webTabDownloadsPush();
  },
  onDownloadChanged(download) {
    const row = webTabDownloadSerialize(download);
    downloadsState.rows.set(row.id, row);
    webTabDownloadsPush();
  },
  onDownloadRemoved(download) {
    const id = downloadsState.ids.get(download);
    downloadsState.rows.delete(id);
    downloadsState.byId.delete(id);
    webTabDownloadsPush();
  },
};

// Removes the view when the application quits, so the list is not notified after its frame is gone.
const downloadsQuitObserver = {
  observe() {
    downloadsState.list?.removeView(downloadsView);
  },
};

// Installs the view once; every later subscribe only re-points the push at the sending frame.
function webTabDownloadsSubscribe(frame) {
  downloadsState.frame = frame;
  if (!downloadsState.installed) {
    downloadsState.installed = (async () => {
      const list = await downloadsLazy.Downloads.getList(downloadsLazy.Downloads.ALL);
      downloadsState.list = list;
      list.addView(downloadsView);
      Services.obs.addObserver(downloadsQuitObserver, "quit-application-granted");
    })();
  }
  return downloadsState.installed;
}

// Runs one row action chrome-side. Launch and reveal are OS actions; the frame only names the row.
async function webTabDownloadAction(id, action) {
  const download = downloadsState.byId.get(id);
  if (!download) {
    return "unknown-download";
  }
  try {
    switch (action) {
      case "cancel":
        await download.cancel();
        await download.removePartialData();
        break;
      case "launch":
        await download.launch();
        break;
      case "showContainingDirectory":
        await download.showContainingDirectory();
        break;
      case "retry":
        download.start().catch(err => PowerBrowserAPI.log("error", `[downloads] retry attempt ended: ${err && err.message ? err.message : err}`));
        break;
      case "remove":
        await downloadsState.list.remove(download);
        break;
      default:
        return "unknown-action";
    }
  } catch (err) {
    PowerBrowserAPI.log("error", `[downloads] ${action} failed: ${err && err.message ? err.message : err}`);
    return "failed";
  }
  return "done";
}

// ---------------------------------------------------------------------------
// Phase 32 plan 07 (PAGE-04, PAGE-10, PAGE-11): reader, view source, DevTools, the crash flag and the favicon.
// Chrome mints every privileged-scheme load (about:reader, view-source:) itself; the frame sends a tab id, never a
// URL. The inner page of a view-source load is the overlay's own page, validated here.
// ---------------------------------------------------------------------------

/** The bounded favicon: a data:image/ icon of at most 64 KiB, never fetched over the network (D-28 forbids a stand-in). */
const WEB_TAB_FAVICON_MAX = 65536;

/** The tab host's icon for the overlay, or null unless it is a bounded data:image/ URL. */
function webTabFaviconOf(browser) {
  const icon = tabHostNodeOf(browser)?.image;
  return typeof icon === "string" && icon.startsWith("data:image/") && icon.length <= WEB_TAB_FAVICON_MAX ? icon : null;
}

/** True while the overlay shows the reader (its URI is about:reader). Chrome reads the URI; no page text leaves. */
function webTabIsReaderUrl(browser) {
  const spec = browser.currentURI ? browser.currentURI.spec : "";
  return spec.startsWith("about:reader?");
}

// Reader (PAGE-10): enter and leave go through the page's own AboutReader actor, as upstream's reader button does
// (ext-tabs.js sends the same message), so the reader reuses the cached article and its history entry and chrome mints no
// about:reader load. Enter needs the readability signal (`isArticle`, pushed with the state); leave needs the reader URL.
// The actor loads the reader page inside this overlay, which the redirect guard admits (OVERLAY_LOCATION).
function webTabReaderReply(kind, tabId, enter) {
  const entry = webTabs.get(tabId);
  if (!entry) {
    return { ok: true, kind, where: "unknown-tab" };
  }
  const browser = entry.browser;
  const inReader = webTabIsReaderUrl(browser);
  if (enter ? inReader : !inReader) {
    return { ok: true, kind, where: enter ? "already-reader" : "not-reader" };
  }
  if (enter && webTabPageStateOf(browser).isArticle !== true) {
    return { ok: false, reason: "validation", message: "handleWebTabAction: the page has no reader view" };
  }
  entry.firstLoad = null;
  try {
    browser.sendMessageToActor("Reader:ToggleReaderMode", {}, "AboutReader");
  } catch (err) {
    PowerBrowserAPI.log("error", `[web-tab] reader toggle failed (${err && err.name ? err.name : "error"})`);
    return { ok: false, reason: "unavailable", message: "handleWebTabAction: the reader view is not available for this tab" };
  }
  return { ok: true, kind, where: enter ? "entered" : "left" };
}

// View source (PAGE-10): the inner URL is this overlay's own page, validated chrome-side. The view-source: load is minted
// here through the overlay's navigation, the webTabNavigate shape. The ViewSource actor is child-only and is never messaged.
// A new overlay for the source is not built (inNewTab is refused).
function webTabViewSourceReply(kind, tabId, inNewTab) {
  const entry = webTabs.get(tabId);
  if (!entry) {
    return { ok: true, kind, where: "unknown-tab" };
  }
  if (inNewTab) {
    return { ok: false, reason: "unavailable", message: "handleWebTabAction: a view-source overlay is not built; use the same tab" };
  }
  const inner = entry.browser.currentURI ? entry.browser.currentURI.spec : "";
  if (!/^(https?|file):/i.test(inner)) {
    return { ok: false, reason: "validation", message: "handleWebTabAction: view source needs a web or file page" };
  }
  entry.firstLoad = null;
  const triggeringPrincipal = Services.scriptSecurityManager.getSystemPrincipal(); // as upstream view-source loads; a null principal starts none (32-08)
  entry.browser.fixupAndLoadURIString(`view-source:${inner}`, { triggeringPrincipal });
  return { ok: true, kind, where: "applied" };
}

// DevTools (PAGE-10, D-23 as amended by the 32-07 gap closure): the stock toolbox window for this overlay, through
// DevToolsShim. The shim's showToolboxForTab takes the overlay's tab-host node (its linkedBrowser is the overlay) and a
// window host, which needs no docked tab; the node is the stable key, so a second F12 raises the same toolbox. No custom
// inspector is built and no toolbox is docked in the shell.
function webTabDevToolsShim() {
  return ChromeUtils.importESModule("chrome://devtools-startup/content/DevToolsShim.sys.mjs").DevToolsShim;
}

function webTabDevtoolsReply(kind, tabId) {
  const entry = webTabs.get(tabId);
  if (!entry) {
    return { ok: true, kind, where: "unknown-tab" };
  }
  const node = tabHostNodeOf(entry.browser);
  const shim = webTabDevToolsShim();
  if (!node || !shim.isEnabled()) {
    return { ok: false, reason: "unavailable", message: "handleWebTabAction: DevTools are not available for this tab" };
  }
  shim.showToolboxForTab(node, { hostType: "window" }).catch(err => {
    PowerBrowserAPI.log("error", `[web-tab] devtools failed to open (${err && err.name ? err.name : "error"})`);
  });
  return { ok: true, kind, where: "opened" };
}

// Called by webTabClose before browser.remove(): the stock TabClose wiring closes a toolbox only for a local XUL tab, so a
// toolbox opened for an overlay is destroyed here. Matched by browserId; nothing happens when DevTools never started.
function webTabCloseToolbox(browser) {
  try {
    for (const toolbox of webTabDevToolsShim().getToolboxes()) {
      if (toolbox.commands?.descriptorFront?.browserId === browser.browserId) {
        toolbox.destroy().catch(() => {});
      }
    }
  } catch (err) {
    PowerBrowserAPI.log("error", `[web-tab] toolbox close failed (${err && err.name ? err.name : "error"})`);
  }
}

// Phase 32 plan 08 (PAGE-10): a view-source overlay's URL and title are its own source string. Theia gets the page's
// spec instead, so no view-source: string crosses the scheme wall in a push (the "view-source:" literal stays out of Theia).
// A reader overlay (about:reader?url=<page>) is pushed as its page too (32-REVIEW CR-01): Theia's widget url is what a
// crashed-tab Reload and a restart reopen through webTabOpen, which admits http(s) only; isReaderMode carries the mode.
function webTabPushedSpec(spec) {
  if (typeof spec !== "string") {
    return spec;
  }
  if (spec.startsWith("view-source:")) {
    return spec.slice("view-source:".length);
  }
  if (spec.startsWith("about:reader?")) {
    const inner = new URLSearchParams(spec.slice("about:reader?".length)).get("url");
    if (inner && /^https?:\/\//i.test(inner)) {
      return inner;
    }
  }
  return spec;
}

// ---------------------------------------------------------------------------
// Phase 33: bookmarks and clear-history.
//
// The star, its editor, the bookmarks toolbar, reopen closed tab and Clear
// Recent History (BMK-01..06). Places writes go only through
// PlacesUtils.bookmarks.insert/update/remove and PlacesUtils.history -- never
// raw SQL, never a second writer. bookmarkPage, updateBookmark, removeBookmark
// and clearHistory are privileged store kinds (rule 12): sent only from the
// pill's and the chrome bar widget's event handlers, never a command, a key
// row or the backend relay. listClosedTabs and reopenClosedTab are reads.
// Replies carry plain strings; no log line carries a URL, title, guid or path.
// It sits at the end of the file so no catalogued line above moves.
// ---------------------------------------------------------------------------

const BOOKMARK_GUID_RE = /^[A-Za-z0-9_-]{12}$/;
const BOOKMARK_TITLE_MAX_CHARS = 512;
// The names the toolbar, the History submenu and the editor send, mapped to
// Places' own root GUID constants (Bookmarks.sys.mjs toolbarGuid/menuGuid/unfiledGuid).
const BOOKMARK_FOLDER_ROOTS = Object.freeze({ toolbar: "toolbarGuid", menu: "menuGuid", unfiled: "unfiledGuid" });

// A root name or a 12-character Places GUID; anything else is refused with fixed text.
function resolveBookmarkFolder(value) {
  if (typeof value === "string" && Object.prototype.hasOwnProperty.call(BOOKMARK_FOLDER_ROOTS, value)) {
    return lazy.PlacesUtils.bookmarks[BOOKMARK_FOLDER_ROOTS[value]];
  }
  if (typeof value === "string" && BOOKMARK_GUID_RE.test(value)) {
    return value;
  }
  throw new Error("resolveBookmarkFolder: refusing a malformed folder");
}

// Firefox's own default location for a new bookmark (browser.bookmarks.defaultLocation, "toolbar").
function defaultBookmarkFolder() {
  try {
    return resolveBookmarkFolder(PowerBrowserAPI.getStringPref("browser.bookmarks.defaultLocation", "toolbar"));
  } catch {
    return lazy.PlacesUtils.bookmarks.toolbarGuid;
  }
}

function bookmarkUrlArg(method, url) {
  const target = storeUrlArg(url);
  if (!/^https?:\/\//i.test(target)) {
    throw new Error(`${method}: refusing a non-http(s) url`);
  }
  return target;
}

function bookmarkTitleArg(method, title) {
  if (typeof title !== "string") {
    throw new Error(`${method}: refusing a non-string title`);
  }
  return title.slice(0, BOOKMARK_TITLE_MAX_CHARS);
}

// Places hands back URL objects, which do not structured-clone: strings only.
function bookmarkReply(item, fallbackUrl = "") {
  return { guid: String(item.guid ?? ""), title: String(item.title ?? ""), url: String(item.url ?? fallbackUrl), folder: bookmarkFolderName(item.parentGuid) };
}

// BMK-01: bookmarks the page. Idempotent: a page already bookmarked answers its
// first bookmark instead of a duplicate, so a double click never makes two.
async function bookmarkPage(url, title, folderGuid) {
  const target = bookmarkUrlArg("bookmarkPage", url);
  const name = title === undefined ? "" : bookmarkTitleArg("bookmarkPage", title);
  const parentGuid = folderGuid === undefined ? defaultBookmarkFolder() : resolveBookmarkFolder(folderGuid);
  const existing = await lazy.PlacesUtils.bookmarks.fetch({ url: target });
  if (existing) {
    return bookmarkReply(existing, target);
  }
  const item = await lazy.PlacesUtils.bookmarks.insert({ type: lazy.PlacesUtils.bookmarks.TYPE_BOOKMARK, parentGuid, url: target, title: name });
  return bookmarkReply(item, target);
}

// BMK-02: the editor's name and folder. Bookmarks.update requires the guid and,
// with a parentGuid, an index (DEFAULT_INDEX appends). A folder or separator
// guid is refused: this kind edits bookmarks only.
async function updateBookmark(guid, title, folderGuid) {
  if (typeof guid !== "string" || !BOOKMARK_GUID_RE.test(guid)) {
    throw new Error("updateBookmark: refusing a malformed guid");
  }
  const info = { guid };
  if (title !== undefined) {
    info.title = bookmarkTitleArg("updateBookmark", title);
  }
  if (folderGuid !== undefined) {
    info.parentGuid = resolveBookmarkFolder(folderGuid);
    info.index = lazy.PlacesUtils.bookmarks.DEFAULT_INDEX;
  }
  if (Object.keys(info).length === 1) {
    throw new Error("updateBookmark: refusing an update with no title or folder");
  }
  const existing = await lazy.PlacesUtils.bookmarks.fetch(guid);
  if (!existing || existing.type !== lazy.PlacesUtils.bookmarks.TYPE_BOOKMARK) {
    throw new Error("updateBookmark: refusing an unknown bookmark");
  }
  const item = await lazy.PlacesUtils.bookmarks.update(info);
  return bookmarkReply({ ...existing, ...item });
}

// BMK-02: Remove in the editor. A guid removes that one bookmark; an http(s)
// url removes every bookmark of the page, as Firefox's star does. Answers how
// many were removed; an unknown guid or an unbookmarked page is 0, not an error.
async function removeBookmark(target) {
  const guids = [];
  if (typeof target === "string" && BOOKMARK_GUID_RE.test(target)) {
    const found = await lazy.PlacesUtils.bookmarks.fetch(target);
    if (found && found.type === lazy.PlacesUtils.bookmarks.TYPE_BOOKMARK) {
      guids.push(found.guid);
    }
  } else {
    const url = bookmarkUrlArg("removeBookmark", target);
    await lazy.PlacesUtils.bookmarks.fetch({ url }, item => guids.push(item.guid));
  }
  if (guids.length) {
    await lazy.PlacesUtils.bookmarks.remove(guids.map(guid => ({ guid })));
  }
  return guids.length;
}

// BMK-04: one Places observer, installed once beside the token-cookie strip
// (setGroupSenderPort), on the exact event quartet stock chrome registers
// (browser-places.js). It fires chrome-side with no actor sender, so the push
// goes to the shell window's own Theia frame, found by window type. The push
// carries the kind only: Theia re-reads the star and the toolbar folder. A
// PlacesObservers batch arrives as one call, so a bulk edit pushes once.
const BOOKMARK_OBSERVER_EVENTS = Object.freeze(["bookmark-added", "bookmark-removed", "bookmark-moved", "bookmark-url-changed"]);

function pushBookmarksChanged() {
  const frame = PowerBrowserAPI.findShellWindow()?.document.getElementById(SHELL_CONTENT_BROWSER_ID);
  if (!frame) {
    return;
  }
  sendWebTabPush(frame, { kind: "bookmarks-changed" });
}

// setGroupSenderPort sets the sender wall, so a failed install is logged and
// retried at the next call, never thrown into it.
let bookmarkObserverInstalled = false;
function installBookmarkObserver() {
  if (bookmarkObserverInstalled) {
    return;
  }
  try {
    lazy.PlacesUtils.observers.addListener([...BOOKMARK_OBSERVER_EVENTS], pushBookmarksChanged);
    bookmarkObserverInstalled = true;
  } catch (err) {
    PowerBrowserAPI.log("warn", `[bookmark-observer] install failed (${err && err.name ? err.name : "error"})`);
  }
}

// BMK-03: a closed overlay's back/forward history, kept unarmed under its row
// key so reopenClosedTab can offer it. At most 25 (Firefox's
// browser.sessionstore.max_tabs_undo); the oldest kept history is dropped.
const CLOSED_WEB_TAB_HISTORY_MAX = 25;
const keptClosedWebTabHistories = [];

function keepClosedWebTabHistory(entry) {
  if (!entry.rowKey || !WEB_TAB_ROW_KEY_RE.test(entry.rowKey)) {
    return;
  }
  PowerBrowserAPI.keepCrashedWebTabHistory(entry, false);
  if (!Object.prototype.hasOwnProperty.call(savedWebTabHistories, entry.rowKey)) {
    return;
  }
  const at = keptClosedWebTabHistories.indexOf(entry.rowKey);
  if (at >= 0) {
    keptClosedWebTabHistories.splice(at, 1);
  }
  keptClosedWebTabHistories.push(entry.rowKey);
  while (keptClosedWebTabHistories.length > CLOSED_WEB_TAB_HISTORY_MAX) {
    const dropped = keptClosedWebTabHistories.shift();
    if (!armedWebTabHistories.has(dropped)) {
      delete savedWebTabHistories[dropped];
    }
  }
}

// BMK-03/BMK-06: closed tabs.sqlite rows, newest first. Web and stock rows
// with an http(s) address only -- a closed Theia editor's key is a file path
// and is never listed. Rows older than the retention window may already be
// pruned; they are simply absent.
const CLOSED_TABS_MAX = 25;
const CLOSED_TABS_SQL = `SELECT uri, url, title, closed_at FROM tabs
  WHERE closed_at IS NOT NULL AND (uri GLOB 'web:*' OR uri GLOB 'stock:*')
    AND (url GLOB 'http://*' OR url GLOB 'https://*')`;

function closedTabRow(row) {
  return {
    uri: String(row.getResultByName("uri")),
    url: String(row.getResultByName("url")),
    title: String(row.getResultByName("title") ?? ""),
    closedAt: Number(row.getResultByName("closed_at")),
  };
}

async function listClosedTabs(limit) {
  const cap = Number.isInteger(limit) ? Math.min(Math.max(limit, 1), CLOSED_TABS_MAX) : 10;
  const conn = await PowerBrowserAPI.openTabStore();
  const rows = await conn.execute(`${CLOSED_TABS_SQL} ORDER BY closed_at DESC LIMIT :cap`, { cap });
  return rows.map(closedTabRow);
}

// BMK-03: the closed row to reopen -- the one named, or the newest. Read only:
// the frontend reopens it through webTabOpen on the same row key (`key`, web
// rows only) and arms the history through shellArmWebTabHistory when
// `withHistory` says one was kept. Nothing is fabricated: no kept history,
// withHistory false. A row already pruned answers null, a no-op.
async function reopenClosedTab(uri) {
  if (uri !== undefined && (typeof uri !== "string" || uri.length > 2048 || !/^(web|stock):./.test(uri))) {
    throw new Error("reopenClosedTab: refusing a malformed tab key");
  }
  let row;
  if (uri === undefined) {
    [row] = await listClosedTabs(1);
  } else {
    const conn = await PowerBrowserAPI.openTabStore();
    const rows = await conn.execute(`${CLOSED_TABS_SQL} AND uri = :uri`, { uri });
    row = rows.length ? closedTabRow(rows[0]) : undefined;
  }
  if (!row) {
    return null;
  }
  const key = WEB_TAB_ROW_KEY_RE.test(row.uri) ? row.uri : null;
  const withHistory = key !== null && Object.prototype.hasOwnProperty.call(savedWebTabHistories, key);
  return { uri: row.uri, url: row.url, title: row.title, key, withHistory };
}

// BMK-05: Clear Recent History. One kind, one range from Firefox's set minus
// the site-specific rows; each range is a begin time, the end is now.
const CLEAR_HISTORY_RANGES = Object.freeze({
  "last-hour": now => now - 60 * 60 * 1000,
  "last-2-hours": now => now - 2 * 60 * 60 * 1000,
  "last-4-hours": now => now - 4 * 60 * 60 * 1000,
  today: now => new Date(now).setHours(0, 0, 0, 0),
  everything: () => 0,
});

// The fan-out: every PowerBrowser store that holds browsing history, by name.
// Places goes through History.removeVisitsByFilter, never Sanitizer (D-09b:
// Sanitizer needs browser.xhtml furniture the shell does not load). No target
// reaches a cookie: the 127.0.0.1 token cookie is exempt by construction.
// scripts/verify-clear-history.mjs derives the expected targets from the
// store declarations above and compares this table to them.
const CLEAR_HISTORY_FANOUT = Object.freeze([
  ["places", clearPlacesHistory],
  ["tabs.closed_at", clearClosedTabRows],
  ["tabs.thumbnail", clearTabThumbnails],
  ["saved_pages", clearSavedPages],
  ["WEB_TAB_HISTORY_FILE_NAME", clearWebTabHistories],
]);

async function clearPlacesHistory(span) {
  await lazy.PlacesUtils.history.removeVisitsByFilter({ beginDate: new Date(span.begin), endDate: new Date(span.end) });
}

// Closed rows in range only: an open row (closed_at NULL) is never deleted. The
// deleted keys go on to the web-tab history target.
async function clearClosedTabRows(span) {
  const conn = await PowerBrowserAPI.openTabStore();
  const params = { begin: span.begin, end: span.end };
  const rows = await conn.execute("SELECT uri FROM tabs WHERE closed_at IS NOT NULL AND closed_at >= :begin AND closed_at <= :end", params);
  rows.forEach(row => span.closedKeys.add(String(row.getResultByName("uri"))));
  await conn.execute("DELETE FROM tabs WHERE closed_at IS NOT NULL AND closed_at >= :begin AND closed_at <= :end", params);
}

// A card image is a picture of the page: dropped for every row seen in range. An open tab captures a new one.
async function clearTabThumbnails(span) {
  const conn = await PowerBrowserAPI.openTabStore();
  await conn.execute(
    "UPDATE tabs SET thumbnail = NULL WHERE thumbnail IS NOT NULL AND MAX(last_active, COALESCE(last_accessed, 0)) >= :begin",
    { begin: span.begin }
  );
}

// Copies saved in range, and every copy of a closed row this clear deleted. Only
// a directory savePageCopy minted under saved-pages/ is ever removed.
async function clearSavedPages(span) {
  const conn = await PowerBrowserAPI.openTabStore();
  const params = { begin: span.begin, end: span.end };
  const rows = await conn.execute("SELECT tab_uri, dir FROM saved_pages WHERE saved_at >= :begin AND saved_at <= :end", params);
  const doomed = rows.map(row => ({ uri: String(row.getResultByName("tab_uri")), dir: String(row.getResultByName("dir")) }));
  for (const uri of span.closedKeys) {
    const extra = await conn.execute("SELECT tab_uri, dir FROM saved_pages WHERE tab_uri = :uri", { uri });
    extra.forEach(row => doomed.push({ uri, dir: String(row.getResultByName("dir")) }));
  }
  const profile = PowerBrowserAPI.getProfileDir();
  const root = profile ? PathUtils.join(profile, SAVED_PAGES_DIR) : "";
  for (const { uri, dir } of doomed) {
    await conn.execute("DELETE FROM saved_pages WHERE tab_uri = :uri", { uri });
    if (root && isMintedSavedPageDir(dir, root)) {
      await IOUtils.remove(dir, { recursive: true, ignoreAbsent: true });
    }
  }
}

// Saved back/forward histories carry no time, so a history goes with its row:
// the keys of the closed rows this clear deleted, or every saved one for
// everything. Memory and the history file alike; an open overlay's live
// history is the open tab's own and is not touched.
async function clearWebTabHistories(span) {
  const dropped = key => span.everything || span.closedKeys.has(key);
  for (const key of Object.keys(savedWebTabHistories)) {
    if (dropped(key)) {
      delete savedWebTabHistories[key];
      armedWebTabHistories.delete(key);
    }
  }
  for (let i = keptClosedWebTabHistories.length - 1; i >= 0; i -= 1) {
    if (dropped(keptClosedWebTabHistories[i])) {
      keptClosedWebTabHistories.splice(i, 1);
    }
  }
  const profile = PowerBrowserAPI.getProfileDir();
  if (!profile) {
    return;
  }
  const path = `${profile}/${WEB_TAB_HISTORY_FILE_NAME}`;
  let onDisk = {};
  try {
    const value = await IOUtils.readJSON(path);
    onDisk = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    // Absent or unreadable: nothing on disk to keep.
  }
  const kept = Object.fromEntries(Object.entries(onDisk).filter(([key]) => !dropped(key)));
  await IOUtils.writeJSON(path, kept, { tmpPath: `${path}.tmp` });
}

// Every target runs even when one fails, so one broken store never leaves the
// others uncleared; a failure is logged by target name only and then fails the kind.
async function clearHistory(range) {
  if (typeof range !== "string" || !Object.prototype.hasOwnProperty.call(CLEAR_HISTORY_RANGES, range)) {
    throw new Error("clearHistory: refusing an unknown range");
  }
  const end = Date.now();
  const span = { begin: CLEAR_HISTORY_RANGES[range](end), end, everything: range === "everything", closedKeys: new Set() };
  const failed = [];
  for (const [target, clear] of CLEAR_HISTORY_FANOUT) {
    try {
      await clear(span);
    } catch (err) {
      failed.push(target);
      PowerBrowserAPI.log("warn", `[clearHistory] ${target} failed (${err && err.name ? err.name : "error"})`);
    }
  }
  if (failed.length) {
    throw new Error(`clearHistory failed for ${failed.join(", ")}`);
  }
  return range;
}

// Phase 33 (33-02, BMK-02): the root a bookmark sits in, by the names the editor
// sends ('toolbar' | 'menu' | 'unfiled'), or "" for any other folder, so the
// editor's folder radios show where the bookmark is. Appended last so no
// catalogued line moves.
function bookmarkFolderName(parentGuid) {
  return Object.keys(BOOKMARK_FOLDER_ROOTS).find(name => resolveBookmarkFolder(name) === parentGuid) ?? "";
}
